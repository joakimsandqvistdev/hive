import asyncio
import gc
import io
import os
from contextlib import asynccontextmanager
from typing import Literal

import torch
from diffusers import QwenImageEditPlusPipeline, ZImagePipeline
from fastapi import FastAPI, File, Form, HTTPException, UploadFile
from fastapi.responses import StreamingResponse
from PIL import Image


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


def load_pipeline(model_key: str):
    if model_key not in MODEL_REPOSITORIES:
        raise ValueError("Unsupported image model")
    if DEVICE == "cuda":
        dtype = torch.bfloat16 if torch.cuda.is_bf16_supported() else torch.float16
    else:
        dtype = torch.float32

    repository = MODEL_REPOSITORIES[model_key]
    pipeline_class = QwenImageEditPlusPipeline if model_key == "qwen-image-edit-2511" else ZImagePipeline
    pipeline = pipeline_class.from_pretrained(repository, torch_dtype=dtype)
    if DEVICE == "cuda" and GPU_MEMORY_GIB < 16:
        # Lower-VRAM GPUs may work through sequential offload, at a substantial speed cost.
        pipeline.enable_sequential_cpu_offload()
    else:
        pipeline.to(DEVICE)
    return pipeline


@asynccontextmanager
async def lifespan(_: FastAPI):
    global PIPELINE, CURRENT_MODEL_KEY
    PIPELINE = await asyncio.to_thread(load_pipeline, CURRENT_MODEL_KEY)
    yield
    PIPELINE = None


app = FastAPI(title="Hive Z-Image Runner", version="0.1.0", lifespan=lifespan)


@app.get("/health")
async def health() -> dict[str, str | bool | float]:
    return {
        "status": "ready" if PIPELINE is not None else "loading",
        "model": MODEL_REPOSITORIES[CURRENT_MODEL_KEY],
        "device": DEVICE,
        "gpu_available": torch.cuda.is_available(),
        "gpu_memory_gib": round(GPU_MEMORY_GIB, 1),
        "cpu_offload": DEVICE == "cuda" and GPU_MEMORY_GIB < 16,
    }


@app.post("/generate")
async def generate(
    prompt: str = Form(min_length=1, max_length=8000),
    model_id: Literal["z-image-turbo", "qwen-image-edit-2511"] = Form(default="z-image-turbo"),
    width: int = Form(default=512, ge=512, le=1024),
    height: int = Form(default=512, ge=512, le=1024),
    seed: int = Form(default=42, ge=0, le=2**63 - 1),
    num_inference_steps: int = Form(default=9, ge=4, le=50),
    true_cfg_scale: float = Form(default=4.0, ge=0, le=10),
    images: list[UploadFile] = File(default=[]),
) -> StreamingResponse:
    global PIPELINE, CURRENT_MODEL_KEY
    if (width, height) not in {(512, 512), (768, 768), (1024, 1024), (512, 768), (768, 512)}:
        raise HTTPException(status_code=422, detail="Unsupported image dimensions")
    if model_id == "qwen-image-edit-2511" and not 1 <= len(images) <= 10:
        raise HTTPException(status_code=422, detail="Qwen-Image-Edit-2511 requires 1 to 10 reference images")
    if model_id == "z-image-turbo" and images:
        raise HTTPException(status_code=422, detail="Z-Image-Turbo does not accept reference images")
    if model_id == "z-image-turbo" and num_inference_steps > 12:
        raise HTTPException(status_code=422, detail="Z-Image-Turbo supports at most 12 inference steps")

    # Reject invalid references before potentially downloading or swapping in the large Qwen model.
    reference_images = await load_reference_images(images)
    async with GENERATION_LOCK:
        try:
            if PIPELINE is None or CURRENT_MODEL_KEY != model_id:
                old_pipeline = PIPELINE
                PIPELINE = None
                del old_pipeline
                gc.collect()
                if torch.cuda.is_available():
                    torch.cuda.empty_cache()
                PIPELINE = await asyncio.to_thread(load_pipeline, model_id)
                CURRENT_MODEL_KEY = model_id
            image = await asyncio.to_thread(generate_image, model_id, prompt, width, height, seed, num_inference_steps, true_cfg_scale, reference_images)
        except HTTPException:
            raise
        except Exception as error:
            # Keep implementation details and prompt content out of the HTTP response.
            raise HTTPException(status_code=500, detail="Image generation failed") from error

    output = io.BytesIO()
    image.save(output, format="PNG")
    output.seek(0)
    return StreamingResponse(output, media_type="image/png")


async def load_reference_images(files: list[UploadFile]) -> list[Image.Image]:
    references: list[Image.Image] = []
    total_bytes = 0
    for file in files:
        if file.content_type not in ("image/png", "image/jpeg", "image/webp"):
            raise HTTPException(status_code=415, detail="Reference images must be PNG, JPEG, or WebP")
        content = await file.read(10 * 1024 * 1024 + 1)
        total_bytes += len(content)
        if len(content) > 10 * 1024 * 1024 or total_bytes > 25 * 1024 * 1024:
            raise HTTPException(status_code=413, detail="Reference images exceed size limits")
        try:
            image = Image.open(io.BytesIO(content)).convert("RGB")
            references.append(image)
        except Exception as error:
            raise HTTPException(status_code=415, detail="A reference file is not a valid image") from error
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
