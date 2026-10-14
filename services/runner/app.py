import asyncio
import ctypes
import gc
import io
import json
import logging
import os
from pathlib import Path
import shutil
import sys
import tempfile
import threading
import traceback
from contextlib import asynccontextmanager
from typing import Literal

import torch
from diffusers import CogVideoXPipeline, QwenImageEditPlusPipeline, StableDiffusionInpaintPipeline, StableDiffusionInstructPix2PixPipeline, WanPipeline, ZImagePipeline
from diffusers.utils import export_to_video
from fastapi import FastAPI, File, Form, HTTPException, Request, UploadFile
from fastapi.responses import StreamingResponse
from PIL import Image
from huggingface_hub import snapshot_download
from generation_process import GenerationProcessError, run_generation_process


MODEL_REPOSITORIES = {
    "z-image-turbo": "Tongyi-MAI/Z-Image-Turbo",
    "qwen-image-edit-2511": "Qwen/Qwen-Image-Edit-2511",
    "instruct-pix2pix": "timbrooks/instruct-pix2pix",
    "sd15-inpainting": "stable-diffusion-v1-5/stable-diffusion-inpainting",
    "longcat-image-edit-turbo": "meituan-longcat/LongCat-Image-Edit-Turbo",
    "flux2-klein-4b": "black-forest-labs/FLUX.2-klein-4B",
    "sd15-base": "stable-diffusion-v1-5/stable-diffusion-v1-5",
    "sdxl-base-1.0": "stabilityai/stable-diffusion-xl-base-1.0",
    "sd35-medium": "stabilityai/stable-diffusion-3.5-medium",
    "sdxl-turbo": "stabilityai/sdxl-turbo",
    "sana-sprint-06b": "Efficient-Large-Model/Sana_Sprint_0.6B_1024px_diffusers",
    "wan2.1-t2v-1.3b": "Wan-AI/Wan2.1-T2V-1.3B",
    "cogvideox-2b": "zai-org/CogVideoX-2b",
}
PIPELINE = None
CURRENT_MODEL_KEY = os.getenv("STARTUP_MODEL_KEY", "z-image-turbo")
DEVICE = "cuda" if torch.cuda.is_available() else "cpu"
GPU_MEMORY_GIB = (
    torch.cuda.get_device_properties(0).total_memory / (1024**3)
    if DEVICE == "cuda"
    else 0
)
GENERATION_LOCK = asyncio.Semaphore(1)
DOWNLOAD_LOCK = threading.Lock()
DOWNLOAD_STATUS: dict[str, dict[str, str | int]] = {}
DOWNLOAD_TASKS: dict[str, asyncio.Task] = {}
DOWNLOAD_PROCESSES: dict[str, asyncio.subprocess.Process] = {}
DOWNLOAD_CANCEL_REQUESTED: set[str] = set()
LOGGER = logging.getLogger("uvicorn.error")
try:
    MALLOC_TRIM = getattr(ctypes.CDLL(None), "malloc_trim", None)
except OSError:
    MALLOC_TRIM = None
if MALLOC_TRIM is not None:
    MALLOC_TRIM.argtypes = [ctypes.c_size_t]
    MALLOC_TRIM.restype = ctypes.c_int


def release_pipeline():
    global PIPELINE
    PIPELINE = None
    gc.collect()
    if torch.cuda.is_available():
        torch.cuda.empty_cache()
    # glibc can retain freed CPU weights in its arenas after Python collection.
    if MALLOC_TRIM is not None:
        MALLOC_TRIM(0)


def report_generation_failure(error: Exception, model_key: str) -> str:
    # Do not log exception messages, source lines, or locals: these can contain inputs.
    frames = " > ".join(
        f"{os.path.basename(frame.filename)}:{frame.lineno}:{frame.name}"
        for frame in traceback.extract_tb(error.__traceback__)
    )
    code = "out_of_memory" if isinstance(error, (torch.OutOfMemoryError, MemoryError)) else "generation_failed"
    LOGGER.error("Local model runner failure model=%s code=%s type=%s frames=%s", model_key, code, type(error).__name__, frames)
    return code


def load_pipeline(model_key: str):
    if model_key not in MODEL_REPOSITORIES:
        raise ValueError("Unsupported image model")
    if DEVICE == "cuda":
        dtype = torch.bfloat16 if torch.cuda.is_bf16_supported() else torch.float16
    else:
        dtype = torch.float32

    repository = MODEL_REPOSITORIES[model_key]
    if model_key == "qwen-image-edit-2511":
        pipeline_class = QwenImageEditPlusPipeline
    elif model_key == "instruct-pix2pix":
        pipeline_class = StableDiffusionInstructPix2PixPipeline
    elif model_key == "sd15-inpainting":
        pipeline_class = StableDiffusionInpaintPipeline
    elif model_key == "longcat-image-edit-turbo":
        from diffusers import LongCatImageEditPipeline
        pipeline_class = LongCatImageEditPipeline
    elif model_key == "flux2-klein-4b":
        from diffusers import Flux2KleinPipeline
        pipeline_class = Flux2KleinPipeline
    elif model_key == "sd15-base":
        from diffusers import StableDiffusionPipeline
        pipeline_class = StableDiffusionPipeline
    elif model_key in {"sdxl-base-1.0", "sdxl-turbo"}:
        from diffusers import StableDiffusionXLPipeline
        pipeline_class = StableDiffusionXLPipeline
    elif model_key == "sd35-medium":
        from diffusers import StableDiffusion3Pipeline
        pipeline_class = StableDiffusion3Pipeline
    elif model_key == "sana-sprint-06b":
        from diffusers import SanaSprintPipeline
        pipeline_class = SanaSprintPipeline
    else:
        pipeline_class = ZImagePipeline
    variant = "fp16" if model_key in {"sdxl-base-1.0", "sdxl-turbo"} and DEVICE == "cuda" else None
    pipeline = pipeline_class.from_pretrained(repository, torch_dtype=dtype, local_files_only=True, **({"variant": variant} if variant else {}))
    if DEVICE == "cuda" and GPU_MEMORY_GIB < 16 and model_key in {"longcat-image-edit-turbo", "flux2-klein-4b", "sdxl-base-1.0", "sd35-medium"}:
        pipeline.enable_model_cpu_offload()
    elif DEVICE == "cuda" and GPU_MEMORY_GIB < 16:
        # Lower-VRAM GPUs may work through sequential offload, at a substantial speed cost.
        pipeline.enable_sequential_cpu_offload()
    else:
        pipeline.to(DEVICE)
    return pipeline


@asynccontextmanager
async def lifespan(_: FastAPI):
    # Load weights only for generation; idle startup must not retain model memory.
    release_pipeline()
    try:
        yield
    finally:
        release_pipeline()


app = FastAPI(title="Hive Z-Image Runner", version="0.1.0", lifespan=lifespan)


def model_is_downloaded(model_id: str) -> bool:
    marker = Path(os.getenv("HF_HOME", "~/.cache/huggingface")).expanduser() / f".hive-{model_id}-download-complete"
    if not marker.is_file():
        return False
    try:
        snapshot_download(MODEL_REPOSITORIES[model_id], local_files_only=True)
        return True
    except Exception:
        return False


def model_cache_paths(model_id: str) -> tuple[Path, Path, Path]:
    hf_home = Path(os.getenv("HF_HOME", "~/.cache/huggingface")).expanduser()
    repo_name = "models--" + MODEL_REPOSITORIES[model_id].replace("/", "--")
    hub_cache = Path(os.getenv("HF_HUB_CACHE", os.getenv("HUGGINGFACE_HUB_CACHE", str(hf_home / "hub")))).expanduser()
    marker = hf_home / f".hive-{model_id}-download-complete"
    xet_cache = hf_home / "hive-xet-cache" / model_id
    return hub_cache / repo_name, xet_cache, marker


def remove_partial_model_cache(model_id: str) -> None:
    repo_cache, xet_cache, marker = model_cache_paths(model_id)
    for cache_path in (repo_cache, xet_cache):
        if cache_path.is_symlink():
            cache_path.unlink()
        elif cache_path.exists():
            shutil.rmtree(cache_path)
    marker.unlink(missing_ok=True)


async def run_model_download(model_id: str) -> None:
    process = None
    try:
        with DOWNLOAD_LOCK:
            if model_id in DOWNLOAD_CANCEL_REQUESTED:
                cancelled_before_start = True
            else:
                cancelled_before_start = False
        if cancelled_before_start:
            await asyncio.to_thread(remove_partial_model_cache, model_id)
            with DOWNLOAD_LOCK:
                DOWNLOAD_STATUS[model_id] = {"status": "not_downloaded", "downloadedBytes": 0, "totalBytes": 0}
            return

        _, xet_cache, _ = model_cache_paths(model_id)
        child_env = os.environ.copy()
        child_env["HF_XET_CACHE"] = str(xet_cache)
        worker_path = str(Path(__file__).with_name("download_worker.py"))
        process = await asyncio.create_subprocess_exec(
            sys.executable, worker_path, model_id,
            stdout=asyncio.subprocess.PIPE,
            env=child_env,
        )
        with DOWNLOAD_LOCK:
            DOWNLOAD_PROCESSES[model_id] = process
            cancel_after_start = model_id in DOWNLOAD_CANCEL_REQUESTED
            if not cancel_after_start:
                DOWNLOAD_STATUS[model_id] = {"status": "downloading", "downloadedBytes": 0, "totalBytes": 0}
        if cancel_after_start and process.returncode is None:
            try:
                process.terminate()
            except ProcessLookupError:
                pass

        assert process.stdout is not None
        while line := await process.stdout.readline():
            try:
                message = json.loads(line)
            except (ValueError, UnicodeDecodeError):
                continue
            if message.get("event") == "progress":
                with DOWNLOAD_LOCK:
                    if model_id not in DOWNLOAD_CANCEL_REQUESTED:
                        DOWNLOAD_STATUS[model_id] = {
                            "status": "downloading",
                            "downloadedBytes": max(0, int(message.get("downloadedBytes", 0))),
                            "totalBytes": max(0, int(message.get("totalBytes", 0))),
                        }
        exit_code = await process.wait()
        with DOWNLOAD_LOCK:
            cancelled = model_id in DOWNLOAD_CANCEL_REQUESTED

        if cancelled:
            await asyncio.to_thread(remove_partial_model_cache, model_id)
            with DOWNLOAD_LOCK:
                DOWNLOAD_STATUS[model_id] = {"status": "not_downloaded", "downloadedBytes": 0, "totalBytes": 0}
        elif exit_code == 0:
            _, _, marker = model_cache_paths(model_id)
            marker.parent.mkdir(parents=True, exist_ok=True)
            marker.touch()
            with DOWNLOAD_LOCK:
                progress = DOWNLOAD_STATUS.get(model_id, {})
                DOWNLOAD_STATUS[model_id] = {**progress, "status": "downloaded"}
        else:
            with DOWNLOAD_LOCK:
                progress = DOWNLOAD_STATUS.get(model_id, {})
                DOWNLOAD_STATUS[model_id] = {
                    **progress,
                    "status": "failed",
                    "error": "Model download failed. Check runner logs and try again.",
                }
    except Exception:
        with DOWNLOAD_LOCK:
            cancelled = model_id in DOWNLOAD_CANCEL_REQUESTED
        if cancelled:
            try:
                await asyncio.to_thread(remove_partial_model_cache, model_id)
            except Exception:
                with DOWNLOAD_LOCK:
                    DOWNLOAD_STATUS[model_id] = {"status": "failed", "error": "Could not remove the cancelled model cache. Check runner logs."}
            else:
                with DOWNLOAD_LOCK:
                    DOWNLOAD_STATUS[model_id] = {"status": "not_downloaded", "downloadedBytes": 0, "totalBytes": 0}
        else:
            with DOWNLOAD_LOCK:
                DOWNLOAD_STATUS[model_id] = {"status": "failed", "error": "Model download failed. Check runner logs and try again."}
    finally:
        with DOWNLOAD_LOCK:
            DOWNLOAD_PROCESSES.pop(model_id, None)
            DOWNLOAD_CANCEL_REQUESTED.discard(model_id)
            DOWNLOAD_TASKS.pop(model_id, None)


@app.get("/models")
async def models() -> dict[str, list[dict[str, str | int]]]:
    result = []
    for model_id in MODEL_REPOSITORIES:
        with DOWNLOAD_LOCK:
            state = DOWNLOAD_STATUS.get(model_id, {}).copy()
        status = state.get("status")
        if status not in {"queued", "downloading", "cancelling", "failed"}:
            status = "downloaded" if await asyncio.to_thread(model_is_downloaded, model_id) else "not_downloaded"
        item = {"id": model_id, "status": status}
        for key in ("downloadedBytes", "totalBytes"):
            if isinstance(state.get(key), int):
                item[key] = state[key]
        if status == "failed":
            item["error"] = state.get("error", "Model download failed. Check runner logs and try again.")
        result.append(item)
    return {"models": result}


@app.post("/models/{model_id}/download", status_code=202)
async def download_model(model_id: str) -> dict[str, str]:
    if model_id not in MODEL_REPOSITORIES:
        raise HTTPException(status_code=404, detail="Unknown model")
    if await asyncio.to_thread(model_is_downloaded, model_id):
        with DOWNLOAD_LOCK:
            DOWNLOAD_STATUS[model_id] = {"status": "downloaded"}
        return {"id": model_id, "status": "downloaded"}
    with DOWNLOAD_LOCK:
        model_status = DOWNLOAD_STATUS.get(model_id, {}).get("status")
        if model_status in {"queued", "downloading"}:
            return {"id": model_id, "status": str(model_status)}
        if model_status == "cancelling":
            raise HTTPException(status_code=409, detail={"code": "download_cancelling"})
        DOWNLOAD_STATUS[model_id] = {"status": "queued", "downloadedBytes": 0, "totalBytes": 0}
        DOWNLOAD_TASKS[model_id] = asyncio.create_task(run_model_download(model_id))
    return {"id": model_id, "status": "queued"}


@app.delete("/models/{model_id}/download")
async def cancel_model_download(model_id: str) -> dict[str, str | int]:
    if model_id not in MODEL_REPOSITORIES:
        raise HTTPException(status_code=404, detail="Unknown model")
    with DOWNLOAD_LOCK:
        status = DOWNLOAD_STATUS.get(model_id, {}).get("status")
        task = DOWNLOAD_TASKS.get(model_id)
        process = DOWNLOAD_PROCESSES.get(model_id)
        if status not in {"queued", "downloading", "cancelling"} or task is None:
            raise HTTPException(status_code=409, detail={"code": "download_not_active"})
        DOWNLOAD_CANCEL_REQUESTED.add(model_id)
        DOWNLOAD_STATUS[model_id] = {"status": "cancelling", **{k: v for k, v in DOWNLOAD_STATUS[model_id].items() if k != "status"}}
    if process is not None and process.returncode is None:
        try:
            process.terminate()
        except ProcessLookupError:
            pass
    try:
        await asyncio.wait_for(asyncio.shield(task), timeout=120)
    except asyncio.TimeoutError:
        if process is not None and process.returncode is None:
            try:
                process.kill()
            except ProcessLookupError:
                pass
        await asyncio.wait_for(asyncio.shield(task), timeout=30)
    with DOWNLOAD_LOCK:
        state = DOWNLOAD_STATUS.get(model_id, {"status": "not_downloaded"})
    if state.get("status") == "failed":
        raise HTTPException(status_code=500, detail=state.get("error", "Could not cancel model download."))
    return {"id": model_id, "status": str(state.get("status", "not_downloaded")), "downloadedBytes": int(state.get("downloadedBytes", 0))}


@app.get("/health")
async def health() -> dict[str, str | bool | float]:
    return {
        "status": "busy" if GENERATION_LOCK.locked() else "ready",
        "pipeline_loaded": False,
        "generation_active": GENERATION_LOCK.locked(),
        "model": MODEL_REPOSITORIES[CURRENT_MODEL_KEY],
        "device": DEVICE,
        "gpu_available": torch.cuda.is_available(),
        "gpu_memory_gib": round(GPU_MEMORY_GIB, 1),
        "cpu_offload": DEVICE == "cuda" and GPU_MEMORY_GIB < 16,
    }


@app.post("/generate")
async def generate(
    request: Request,
    prompt: str = Form(min_length=1, max_length=8000),
    model_id: Literal["z-image-turbo", "qwen-image-edit-2511", "instruct-pix2pix", "sd15-inpainting", "longcat-image-edit-turbo", "flux2-klein-4b", "sd15-base", "sdxl-base-1.0", "sd35-medium", "sdxl-turbo", "sana-sprint-06b"] = Form(default="z-image-turbo"),
    width: int = Form(default=512, ge=128, le=1024),
    height: int = Form(default=512, ge=128, le=1024),
    seed: int = Form(default=42, ge=0, le=2**63 - 1),
    num_inference_steps: int = Form(default=9, ge=1, le=50),
    true_cfg_scale: float = Form(default=4.0, ge=0, le=10),
    image_guidance_scale: float = Form(default=1.5, ge=0, le=3),
    strength: float = Form(default=0.75, gt=0, le=1),
    guidance_scale: float = Form(default=7.5, ge=0, le=20),
    images: list[UploadFile] = File(default=[]),
) -> StreamingResponse:
    global CURRENT_MODEL_KEY
    if (width, height) not in {(128, 128), (256, 256), (512, 512), (768, 768), (1024, 1024), (512, 768), (768, 512)}:
        raise HTTPException(status_code=422, detail="Unsupported image dimensions")
    if model_id == "qwen-image-edit-2511" and not 1 <= len(images) <= 10:
        raise HTTPException(status_code=422, detail="Qwen-Image-Edit-2511 requires 1 to 10 reference images")
    if model_id in {"instruct-pix2pix", "sd15-inpainting", "longcat-image-edit-turbo"} and len(images) != (2 if model_id == "sd15-inpainting" else 1):
        raise HTTPException(status_code=422, detail="This model requires its configured source image and mask inputs")
    if model_id == "flux2-klein-4b" and len(images) > 4:
        raise HTTPException(status_code=422, detail="FLUX.2 Klein supports up to four reference images")
    if model_id == "z-image-turbo" and images:
        raise HTTPException(status_code=422, detail="Z-Image-Turbo does not accept reference images")
    if model_id in {"sd15-base", "sdxl-base-1.0", "sd35-medium", "sdxl-turbo", "sana-sprint-06b"} and images:
        raise HTTPException(status_code=422, detail="This text-to-image model does not accept reference images")
    if model_id == "z-image-turbo" and num_inference_steps > 12:
        raise HTTPException(status_code=422, detail="Z-Image-Turbo supports at most 12 inference steps")
    if model_id in {"sana-sprint-06b", "sdxl-turbo"} and not 1 <= num_inference_steps <= 4:
        raise HTTPException(status_code=422, detail="This Turbo model supports 1 to 4 inference steps")
    if model_id not in {"sana-sprint-06b", "sdxl-turbo"} and num_inference_steps < 4:
        raise HTTPException(status_code=422, detail="This model requires at least 4 inference steps")
    if not await asyncio.to_thread(model_is_downloaded, model_id):
        raise HTTPException(status_code=409, detail={"code": "model_not_downloaded"})

    # Reject invalid references before potentially downloading or swapping in the large Qwen model.
    async with GENERATION_LOCK:
        reference_images = []
        try:
            reference_images = await load_reference_images(images)
            CURRENT_MODEL_KEY = model_id
            encoded = await run_generation_process(
                generation_worker,
                (model_id, prompt, width, height, seed, num_inference_steps, true_cfg_scale, reference_images, image_guidance_scale, strength, guidance_scale),
                request.is_disconnected,
            )
        except GenerationProcessError as error:
            status_code = 499 if error.code == "request_cancelled" else 504 if error.code == "generation_timeout" else 500
            raise HTTPException(status_code=status_code, detail={"code": error.code}) from None
        except HTTPException:
            raise
        except Exception as error:
            code = report_generation_failure(error, model_id)
            # Release tensors referenced by the failure before the finally cleanup.
            error.__traceback__ = None
            # Only fixed error codes cross the internal HTTP boundary.
            raise HTTPException(status_code=500, detail={"code": code}) from None
        finally:
            for reference in reference_images:
                reference.close()
            reference_images.clear()
            release_pipeline()

    return StreamingResponse(io.BytesIO(encoded), media_type="image/png")


@app.post("/generate-video")
async def generate_video(
    request: Request,
    prompt: str = Form(min_length=1, max_length=8000),
    negative_prompt: str = Form(default="", max_length=1000),
    model_id: Literal["wan2.1-t2v-1.3b", "cogvideox-2b"] = Form(),
    frames: int = Form(),
    seed: int = Form(default=42, ge=0, le=2**31 - 1),
    num_inference_steps: int = Form(default=20, ge=1, le=50),
    guidance_scale: float = Form(default=6.0, ge=0, le=20),
) -> StreamingResponse:
    global CURRENT_MODEL_KEY
    allowed_frames = {"wan2.1-t2v-1.3b": {41, 61, 81}, "cogvideox-2b": {25, 49}}
    if frames not in allowed_frames[model_id]:
        raise HTTPException(status_code=422, detail="Unsupported video frame count")
    if not await asyncio.to_thread(model_is_downloaded, model_id):
        raise HTTPException(status_code=409, detail={"code": "model_not_downloaded"})

    async with GENERATION_LOCK:
        try:
            CURRENT_MODEL_KEY = model_id
            encoded = await run_generation_process(
                video_generation_worker,
                (model_id, prompt, negative_prompt, frames, seed, num_inference_steps, guidance_scale),
                request.is_disconnected,
            )
        except GenerationProcessError as error:
            status_code = 499 if error.code == "request_cancelled" else 504 if error.code == "generation_timeout" else 500
            raise HTTPException(status_code=status_code, detail={"code": error.code}) from None
        except Exception as error:
            code = report_generation_failure(error, model_id)
            error.__traceback__ = None
            raise HTTPException(status_code=500, detail={"code": code}) from None
        finally:
            release_pipeline()
    return StreamingResponse(io.BytesIO(encoded), media_type="video/mp4")


def video_generation_worker(sender, model_key, prompt, negative_prompt, frames, seed, steps, guidance_scale):
    pipeline = None
    output_path = None
    try:
        dtype = (torch.bfloat16 if torch.cuda.is_bf16_supported() else torch.float16) if DEVICE == "cuda" else torch.float32
        pipeline_class = WanPipeline if model_key == "wan2.1-t2v-1.3b" else CogVideoXPipeline
        pipeline = pipeline_class.from_pretrained(MODEL_REPOSITORIES[model_key], torch_dtype=dtype, local_files_only=True)
        if DEVICE == "cuda" and GPU_MEMORY_GIB < 16:
            pipeline.enable_sequential_cpu_offload()
        else:
            pipeline.to(DEVICE)
        if model_key == "cogvideox-2b":
            pipeline.vae.enable_tiling()
            pipeline.vae.enable_slicing()
        result = pipeline(
            prompt=prompt,
            negative_prompt=negative_prompt or None,
            height=480,
            width=832 if model_key == "wan2.1-t2v-1.3b" else 720,
            num_frames=frames,
            num_inference_steps=steps,
            guidance_scale=guidance_scale,
            generator=torch.Generator(device=DEVICE).manual_seed(seed),
        )
        fps = 16 if model_key == "wan2.1-t2v-1.3b" else 8
        with tempfile.NamedTemporaryFile(suffix=".mp4", delete=False) as output_file:
            output_path = output_file.name
        export_to_video(result.frames[0], output_path, fps=fps)
        encoded = Path(output_path).read_bytes()
        if not encoded or len(encoded) > 50 * 1024 * 1024:
            raise ValueError("Video output is empty or exceeds the 50 MB limit")
        sender.send(("result", encoded))
    except Exception as error:
        code = report_generation_failure(error, model_key)
        sender.send(("error", code))
    finally:
        if output_path:
            Path(output_path).unlink(missing_ok=True)
        del pipeline
        release_pipeline()
        sender.close()


def generation_worker(sender, model_key, prompt, width, height, seed, steps, true_cfg_scale, references, image_guidance_scale=1.5, strength=0.75, guidance_scale=7.5):
    global PIPELINE
    image = None
    try:
        PIPELINE = load_pipeline(model_key)
        image = generate_image(model_key, prompt, width, height, seed, steps, true_cfg_scale, references, image_guidance_scale, strength, guidance_scale)
        output = io.BytesIO()
        image.save(output, format="PNG")
        encoded = output.getvalue()
        if len(encoded) > 25 * 1024 * 1024:
            raise RuntimeError("Output exceeds the internal size limit")
        sender.send(("result", encoded))
    except Exception as error:
        code = report_generation_failure(error, model_key)
        error.__traceback__ = None
        sender.send(("error", code))
    finally:
        if image is not None:
            image.close()
        for reference in references:
            reference.close()
        release_pipeline()
        sender.close()


async def load_reference_images(files: list[UploadFile]) -> list[Image.Image]:
    references: list[Image.Image] = []
    total_bytes = 0
    try:
        for file in files:
            if file.content_type not in ("image/png", "image/jpeg", "image/webp"):
                raise HTTPException(status_code=415, detail="Reference images must be PNG, JPEG, or WebP")
            content = await file.read(10 * 1024 * 1024 + 1)
            total_bytes += len(content)
            if len(content) > 10 * 1024 * 1024 or total_bytes > 25 * 1024 * 1024:
                raise HTTPException(status_code=413, detail="Reference images exceed size limits")
            try:
                with Image.open(io.BytesIO(content)) as source:
                    references.append(source.convert("RGB"))
            except Exception as error:
                raise HTTPException(status_code=415, detail="A reference file is not a valid image") from error
    except BaseException:
        for reference in references:
            reference.close()
        raise
    return references


def generate_image(model_key: str, prompt: str, width: int, height: int, seed: int, steps: int, true_cfg_scale: float, references: list[Image.Image], image_guidance_scale: float = 1.5, strength: float = 0.75, guidance_scale: float = 7.5):
    if PIPELINE is None:
        raise RuntimeError("Model pipeline is not loaded")

    generator_device = "cuda" if DEVICE == "cuda" else "cpu"
    generator = torch.Generator(device=generator_device).manual_seed(seed)
    if model_key == "qwen-image-edit-2511":
        result = PIPELINE(
            prompt=prompt,
            image=references,
            width=width,
            height=height,
            num_inference_steps=steps,
            true_cfg_scale=true_cfg_scale,
            negative_prompt=" ",
            guidance_scale=1.0,
            generator=generator,
            num_images_per_prompt=1,
        )
    elif model_key == "instruct-pix2pix":
        result = PIPELINE(prompt=prompt, image=references[0], width=width, height=height, num_inference_steps=steps, image_guidance_scale=image_guidance_scale, guidance_scale=7.5, generator=generator)
    elif model_key == "sd15-inpainting":
        result = PIPELINE(prompt=prompt, image=references[0], mask_image=references[1], width=width, height=height, num_inference_steps=steps, strength=strength, guidance_scale=guidance_scale, generator=generator)
    elif model_key == "longcat-image-edit-turbo":
        result = PIPELINE(references[0], prompt, negative_prompt="", guidance_scale=1, num_inference_steps=8, generator=torch.Generator("cpu").manual_seed(seed))
    elif model_key == "flux2-klein-4b":
        result = PIPELINE(prompt=prompt, image=references if references else None, width=width, height=height, num_inference_steps=steps, guidance_scale=guidance_scale, generator=generator)
    elif model_key == "sana-sprint-06b":
        result = PIPELINE(prompt=prompt, width=width, height=height, num_inference_steps=steps, guidance_scale=guidance_scale, generator=generator)
    elif model_key == "sdxl-turbo":
        result = PIPELINE(prompt=prompt, width=width, height=height, num_inference_steps=steps, guidance_scale=0.0, generator=generator)
    elif model_key == "sd35-medium":
        result = PIPELINE(prompt=prompt, width=width, height=height, num_inference_steps=steps, guidance_scale=guidance_scale, generator=generator)
    elif model_key in {"sd15-base", "sdxl-base-1.0"}:
        result = PIPELINE(prompt=prompt, width=width, height=height, num_inference_steps=steps, guidance_scale=guidance_scale, generator=generator)
    else:
        result = PIPELINE(
            prompt=prompt,
            width=width,
            height=height,
            num_inference_steps=steps,
            guidance_scale=0.0,
            generator=generator,
        )
    return result.images[0]
