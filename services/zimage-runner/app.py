import asyncio
import ctypes
import gc
import io
import logging
import os
from pathlib import Path
import threading
import traceback
from contextlib import asynccontextmanager
from typing import Literal

import torch
from diffusers import QwenImageEditPlusPipeline, ZImagePipeline
from fastapi import FastAPI, File, Form, HTTPException, Request, UploadFile
from fastapi.responses import StreamingResponse
from PIL import Image
from huggingface_hub import snapshot_download
from generation_process import GenerationProcessError, run_generation_process


MODEL_REPOSITORIES = {
    "z-image-turbo": "Tongyi-MAI/Z-Image-Turbo",
    "qwen-image-edit-2511": "Qwen/Qwen-Image-Edit-2511",
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
DOWNLOAD_STATUS: dict[str, dict[str, str]] = {}
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
    LOGGER.error("Image runner failure model=%s code=%s type=%s frames=%s", model_key, code, type(error).__name__, frames)
    return code


def load_pipeline(model_key: str):
    if model_key not in MODEL_REPOSITORIES:
        raise ValueError("Unsupported image model")
    if DEVICE == "cuda":
        dtype = torch.bfloat16 if torch.cuda.is_bf16_supported() else torch.float16
    else:
        dtype = torch.float32

    repository = MODEL_REPOSITORIES[model_key]
    pipeline_class = QwenImageEditPlusPipeline if model_key == "qwen-image-edit-2511" else ZImagePipeline
    pipeline = pipeline_class.from_pretrained(repository, torch_dtype=dtype, local_files_only=True)
    if DEVICE == "cuda" and GPU_MEMORY_GIB < 16:
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


def model_download_worker(model_id: str) -> None:
    try:
        with DOWNLOAD_LOCK:
            DOWNLOAD_STATUS[model_id] = {"status": "downloading"}
        snapshot_download(MODEL_REPOSITORIES[model_id])
        marker = Path(os.getenv("HF_HOME", "~/.cache/huggingface")).expanduser() / f".hive-{model_id}-download-complete"
        marker.parent.mkdir(parents=True, exist_ok=True)
        marker.touch()
        with DOWNLOAD_LOCK:
            DOWNLOAD_STATUS[model_id] = {"status": "downloaded"}
    except Exception:
        marker = Path(os.getenv("HF_HOME", "~/.cache/huggingface")).expanduser() / f".hive-{model_id}-download-complete"
        marker.unlink(missing_ok=True)
        with DOWNLOAD_LOCK:
            DOWNLOAD_STATUS[model_id] = {"status": "failed", "error": "Model download failed. Check runner logs and try again."}


@app.get("/models")
async def models() -> dict[str, list[dict[str, str]]]:
    result = []
    for model_id in MODEL_REPOSITORIES:
        with DOWNLOAD_LOCK:
            state = DOWNLOAD_STATUS.get(model_id, {}).copy()
        status = state.get("status")
        if status not in {"queued", "downloading", "failed"}:
            status = "downloaded" if await asyncio.to_thread(model_is_downloaded, model_id) else "not_downloaded"
        item = {"id": model_id, "status": status}
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
        if any(value.get("status") in {"queued", "downloading"} for value in DOWNLOAD_STATUS.values()):
            raise HTTPException(status_code=409, detail={"code": "download_in_progress"})
        DOWNLOAD_STATUS[model_id] = {"status": "queued"}
    asyncio.create_task(asyncio.to_thread(model_download_worker, model_id))
    return {"id": model_id, "status": "queued"}


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
    model_id: Literal["z-image-turbo", "qwen-image-edit-2511"] = Form(default="z-image-turbo"),
    width: int = Form(default=512, ge=256, le=1024),
    height: int = Form(default=512, ge=256, le=1024),
    seed: int = Form(default=42, ge=0, le=2**63 - 1),
    num_inference_steps: int = Form(default=9, ge=4, le=50),
    true_cfg_scale: float = Form(default=4.0, ge=0, le=10),
    images: list[UploadFile] = File(default=[]),
) -> StreamingResponse:
    global CURRENT_MODEL_KEY
    if (width, height) not in {(256, 256), (512, 512), (768, 768), (1024, 1024), (512, 768), (768, 512)}:
        raise HTTPException(status_code=422, detail="Unsupported image dimensions")
    if model_id == "qwen-image-edit-2511" and not 1 <= len(images) <= 10:
        raise HTTPException(status_code=422, detail="Qwen-Image-Edit-2511 requires 1 to 10 reference images")
    if model_id == "z-image-turbo" and images:
        raise HTTPException(status_code=422, detail="Z-Image-Turbo does not accept reference images")
    if model_id == "z-image-turbo" and num_inference_steps > 12:
        raise HTTPException(status_code=422, detail="Z-Image-Turbo supports at most 12 inference steps")
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
                (model_id, prompt, width, height, seed, num_inference_steps, true_cfg_scale, reference_images),
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


def generation_worker(sender, model_key, prompt, width, height, seed, steps, true_cfg_scale, references):
    global PIPELINE
    image = None
    try:
        PIPELINE = load_pipeline(model_key)
        image = generate_image(model_key, prompt, width, height, seed, steps, true_cfg_scale, references)
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


def generate_image(model_key: str, prompt: str, width: int, height: int, seed: int, steps: int, true_cfg_scale: float, references: list[Image.Image]):
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
