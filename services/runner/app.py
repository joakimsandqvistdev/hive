import asyncio
import ctypes
import gc
import io
import logging
import os
import traceback
from contextlib import asynccontextmanager
from typing import Literal

import torch
from model_catalog import MODEL_REPOSITORIES
from model_downloads import kokoro_english_model_path, model_is_downloaded, router as model_downloads_router
from fastapi import FastAPI, File, Form, HTTPException, Request, UploadFile
from fastapi.responses import StreamingResponse
from fastapi.responses import PlainTextResponse
from PIL import Image
from audio_generation import generation_worker as run_audio_generation_worker
from generation_process import GenerationProcessError, run_generation_process
from image_generation import generate_image as run_image_generation
from image_generation import generation_worker as run_image_generation_worker
from image_generation import load_pipeline as load_image_pipeline
from image_generation import load_reference_images
from video_generation import generation_worker as run_video_generation_worker
from text_generation import generation_worker as run_text_generation_worker


PIPELINE = None
CURRENT_MODEL_KEY = os.getenv("STARTUP_MODEL_KEY", "z-image-turbo")
DEVICE = "cuda" if torch.cuda.is_available() else "cpu"
GPU_MEMORY_GIB = (
    torch.cuda.get_device_properties(0).total_memory / (1024**3)
    if DEVICE == "cuda"
    else 0
)
GENERATION_LOCK = asyncio.Semaphore(1)
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
    return load_image_pipeline(model_key, MODEL_REPOSITORIES, DEVICE, GPU_MEMORY_GIB)


def set_pipeline(pipeline) -> None:
    global PIPELINE
    PIPELINE = pipeline


def generate_image(model_key, prompt, width, height, seed, steps, true_cfg_scale, references,
                   image_guidance_scale=1.5, strength=0.75, guidance_scale=7.5):
    return run_image_generation(model_key, prompt, width, height, seed, steps, true_cfg_scale, references,
                                PIPELINE, DEVICE, image_guidance_scale, strength, guidance_scale)


def generation_worker(sender, model_key, prompt, width, height, seed, steps, true_cfg_scale, references,
                      image_guidance_scale=1.5, strength=0.75, guidance_scale=7.5):
    return run_image_generation_worker(
        sender, model_key, prompt, width, height, seed, steps, true_cfg_scale, references,
        image_guidance_scale, strength, guidance_scale, load_pipeline_fn=load_pipeline,
        set_pipeline_fn=set_pipeline, generate_image_fn=generate_image,
        report_failure_fn=report_generation_failure, release_pipeline_fn=release_pipeline,
    )


def video_generation_worker(sender, model_key, prompt, negative_prompt, frames, seed, steps, guidance_scale):
    return run_video_generation_worker(
        sender, model_key, prompt, negative_prompt, frames, seed, steps, guidance_scale,
        repositories=MODEL_REPOSITORIES, device=DEVICE, gpu_memory_gib=GPU_MEMORY_GIB,
        report_failure_fn=report_generation_failure, release_pipeline_fn=release_pipeline,
    )


def audio_generation_worker(sender, model_key, prompt, voice, speed):
    return run_audio_generation_worker(
        sender, model_key, prompt, voice, speed, repositories=MODEL_REPOSITORIES,
        english_model_path=kokoro_english_model_path(),
        report_failure_fn=report_generation_failure, release_pipeline_fn=release_pipeline,
    )


def text_generation_worker(sender, model_key, instruction, prompt, max_new_tokens, temperature):
    return run_text_generation_worker(
        sender, model_key, instruction, prompt, max_new_tokens, temperature,
        repositories=MODEL_REPOSITORIES, device=DEVICE,
        report_failure_fn=report_generation_failure, release_pipeline_fn=release_pipeline,
    )

@asynccontextmanager
async def lifespan(_: FastAPI):
    # Load weights only for generation; idle startup must not retain model memory.
    release_pipeline()
    try:
        yield
    finally:
        release_pipeline()


app = FastAPI(title="Hive Model Runner", version="0.1.0", lifespan=lifespan)
app.include_router(model_downloads_router)

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
    height: int = Form(default=512, ge=128, le=1360),
    seed: int = Form(default=42, ge=0, le=2**63 - 1),
    num_inference_steps: int = Form(default=9, ge=1, le=50),
    true_cfg_scale: float = Form(default=4.0, ge=0, le=10),
    image_guidance_scale: float = Form(default=1.5, ge=0, le=3),
    strength: float = Form(default=0.75, gt=0, le=1),
    guidance_scale: float = Form(default=7.5, ge=0, le=20),
    images: list[UploadFile] = File(default=[]),
) -> StreamingResponse:
    global CURRENT_MODEL_KEY
    if (width, height) not in {(128, 128), (256, 256), (512, 512), (768, 768), (1024, 1024), (512, 768), (768, 512), (1024, 1280), (768, 1360)}:
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


@app.post("/generate-audio")
async def generate_audio(
    request: Request,
    prompt: str = Form(min_length=1, max_length=8000),
    model_id: Literal["kokoro-82m"] = Form(default="kokoro-82m"),
    voice: Literal["af_heart", "af_bella", "af_nicole", "af_sarah", "am_adam", "am_michael", "bf_emma", "bf_isabella", "bm_george", "bm_lewis"] = Form(default="af_heart"),
    speed: float = Form(default=1, ge=0.5, le=2),
) -> StreamingResponse:
    global CURRENT_MODEL_KEY
    if not await asyncio.to_thread(model_is_downloaded, model_id):
        raise HTTPException(status_code=409, detail={"code": "model_not_downloaded"})

    async with GENERATION_LOCK:
        try:
            CURRENT_MODEL_KEY = model_id
            encoded = await run_generation_process(audio_generation_worker, (model_id, prompt, voice, speed), request.is_disconnected, environment={"HF_HUB_OFFLINE": "1"})
        except GenerationProcessError as error:
            status_code = 499 if error.code == "request_cancelled" else 504 if error.code == "generation_timeout" else 500
            raise HTTPException(status_code=status_code, detail={"code": error.code}) from None
        except Exception as error:
            code = report_generation_failure(error, model_id)
            error.__traceback__ = None
            raise HTTPException(status_code=500, detail={"code": code}) from None
        finally:
            release_pipeline()
    return StreamingResponse(io.BytesIO(encoded), media_type="audio/wav")


@app.post("/generate-text")
async def generate_text(
    request: Request,
    prompt: str = Form(min_length=1, max_length=8000),
    instruction: str = Form(min_length=1, max_length=3000),
    model_id: Literal["qwen3-0.6b", "qwen3-1.7b"] = Form(),
    max_new_tokens: int = Form(default=256, ge=16, le=1024),
    temperature: float = Form(default=0.8, ge=0, le=2),
) -> PlainTextResponse:
    global CURRENT_MODEL_KEY
    if not await asyncio.to_thread(model_is_downloaded, model_id):
        raise HTTPException(status_code=409, detail={"code": "model_not_downloaded"})

    async with GENERATION_LOCK:
        try:
            CURRENT_MODEL_KEY = model_id
            generated = await run_generation_process(
                text_generation_worker,
                (model_id, instruction.strip(), prompt.strip(), max_new_tokens, temperature),
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
    return PlainTextResponse(generated)
