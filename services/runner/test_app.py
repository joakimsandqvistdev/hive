import unittest
from unittest.mock import AsyncMock, Mock, patch
from starlette.requests import Request
import torch
from fastapi import HTTPException
import app
from generation_process import GenerationProcessError


class RunnerTests(unittest.IsolatedAsyncioTestCase):
    async def test_runner_routes_require_shared_bearer_token(self):
        request = Request({"type": "http", "method": "GET", "path": "/health", "headers": []})
        call_next = AsyncMock(return_value=Mock(status_code=200))
        with patch.dict("os.environ", {"RUNNER_API_TOKEN": "expected-secret"}):
            denied = await app.require_runner_token(request, call_next)
            self.assertEqual(denied.status_code, 401)
            request = Request({"type": "http", "method": "GET", "path": "/health", "headers": [(b"authorization", b"Bearer wrong")]})
            denied = await app.require_runner_token(request, call_next)
            self.assertEqual(denied.status_code, 401)
            request = Request({"type": "http", "method": "GET", "path": "/health", "headers": [(b"authorization", b"Bearer expected-secret")]})
            self.assertEqual((await app.require_runner_token(request, call_next)).status_code, 200)
        self.assertEqual(call_next.await_count, 1)

    def test_cogvideox_t5_tokenizer_backend_is_installed(self):
        from transformers import T5Tokenizer
        self.assertTrue(callable(T5Tokenizer.from_pretrained))

    def test_selected_dimensions_reach_both_pipelines(self):
        for model_key in app.MODEL_REPOSITORIES:
            for width, height in ((128, 128), (256, 256), (512, 512), (768, 768), (1024, 1024), (512, 768), (768, 512)):
                with self.subTest(model=model_key, dimensions=(width, height)):
                    output = object()
                    references = [object(), object()] if model_key == "sd15-inpainting" else [object()] if model_key in {"qwen-image-edit-2511", "instruct-pix2pix", "longcat-image-edit-turbo"} else []
                    pipeline = Mock(return_value=Mock(images=[output]))
                    with patch.object(app, "PIPELINE", pipeline), patch.object(app, "DEVICE", "cpu"):
                        steps = 8 if model_key == "longcat-image-edit-turbo" else 4 if model_key in {"flux2-klein-4b", "sdxl-turbo"} else 2 if model_key == "sana-sprint-06b" else 9
                        self.assertIs(app.generate_image(model_key, "prompt", width, height, 42, steps, 4, references), output)
                    if model_key != "longcat-image-edit-turbo":
                        self.assertEqual(pipeline.call_args.kwargs["width"], width)
                        self.assertEqual(pipeline.call_args.kwargs["height"], height)
                    if references:
                        if model_key == "longcat-image-edit-turbo":
                            self.assertIs(pipeline.call_args.args[0], references[0])
                        else:
                            self.assertIs(pipeline.call_args.kwargs.get("image"), references if model_key in {"qwen-image-edit-2511", "flux2-klein-4b"} else references[0])
                    if model_key == "sd15-inpainting":
                        self.assertIs(pipeline.call_args.kwargs["mask_image"], references[1])

    async def test_startup_does_not_load_weights(self):
        with patch.object(app, "load_pipeline") as load:
            async with app.lifespan(app.app):
                self.assertEqual((await app.health())["status"], "ready")
                self.assertFalse((await app.health())["generation_active"])
                load.assert_not_called()

    async def test_success_and_process_failures_close_references_and_cleanup(self):
        for code, status in ((None, None), ("out_of_memory", 500), ("generation_failed", 500),
                             ("request_cancelled", 499), ("generation_timeout", 504)):
            reference = Mock()
            execute = AsyncMock(return_value=b"encoded PNG", side_effect=GenerationProcessError(code) if code else None)
            with self.subTest(code=code), patch.object(app, "load_reference_images", AsyncMock(return_value=[reference])), \
                patch.object(app, "model_is_downloaded", return_value=True), \
                patch.object(app, "run_generation_process", execute), patch.object(app, "release_pipeline") as cleanup:
                args = dict(request=Mock(is_disconnected=AsyncMock(return_value=False)), prompt="edit",
                            model_id="qwen-image-edit-2511", width=256, height=256, seed=42,
                            num_inference_steps=4, true_cfg_scale=4, images=[Mock()])
                if code:
                    with self.assertRaises(HTTPException) as caught:
                        await app.generate(**args)
                    self.assertEqual(caught.exception.status_code, status)
                    self.assertEqual(caught.exception.detail, {"code": code})
                else:
                    response = await app.generate(**args)
                    self.assertEqual(b"".join([part async for part in response.body_iterator]), b"encoded PNG")
                reference.close.assert_called_once()
                cleanup.assert_called_once()
                self.assertFalse(app.GENERATION_LOCK.locked())

    async def test_invalid_dimensions_do_not_start_inference(self):
        with patch.object(app, "run_generation_process") as execute:
            with self.assertRaises(HTTPException) as caught:
                await app.generate(request=Mock(), prompt="test", model_id="z-image-turbo", width=64, height=64,
                                   seed=42, num_inference_steps=9, true_cfg_scale=4, images=[])
            self.assertEqual(caught.exception.status_code, 422)
            execute.assert_not_called()

    async def test_invalid_later_reference_closes_already_decoded_images(self):
        reference = Mock()
        source = Mock()
        source.convert.return_value = reference
        opened = Mock()
        opened.__enter__ = Mock(return_value=source)
        opened.__exit__ = Mock(return_value=False)
        first = Mock(content_type="image/png", read=AsyncMock(return_value=b"test input"))
        invalid = Mock(content_type="application/octet-stream")
        with patch.object(app.Image, "open", return_value=opened):
            with self.assertRaises(HTTPException):
                await app.load_reference_images([first, invalid])
        reference.close.assert_called_once()

    def test_child_load_inference_and_encoding_failures_send_safe_errors(self):
        for stage in ("load", "infer", "encode"):
            sender = Mock()
            image = Mock()
            failure = torch.OutOfMemoryError("private prompt")
            if stage == "encode":
                image.save.side_effect = failure
            with self.subTest(stage=stage), \
                patch.object(app, "load_pipeline", side_effect=failure if stage == "load" else None), \
                patch.object(app, "generate_image", return_value=image, side_effect=failure if stage == "infer" else None), \
                patch.object(app, "release_pipeline") as cleanup, self.assertLogs("uvicorn.error", level="ERROR") as logs:
                app.generation_worker(sender, "qwen-image-edit-2511", "private prompt", 256, 256, 42, 4, 4, [])
                sender.send.assert_called_once_with(("error", "out_of_memory"))
                sender.close.assert_called_once()
                cleanup.assert_called_once()
                self.assertNotIn("private prompt", " ".join(logs.output))
