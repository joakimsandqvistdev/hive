import asyncio
import io
import os
from contextlib import asynccontextmanager
from typing import Literal

import torch
from diffusers import ZImagePipeline
from fastapi import FastAPI, HTTPException
from fastapi.responses import StreamingResponse
from pydantic import BaseModel, Field


MODEL_ID = os.getenv("MODEL_ID", "Tongyi-MAI/Z-Image-Turbo")
PIPELINE: ZImagePipeline | None = None
DEVICE = "cuda" if torch.cuda.is_available() else "cpu"
GPU_MEMORY_GIB = (
    torch.cuda.get_device_properties(0).total_memory / (1024**3)
    if DEVICE == "cuda"
    else 0
)
GENERATION_LOCK = asyncio.Semaphore(1)


def load_pipeline() -> ZImagePipeline:
    if DEVICE == "cuda":
        dtype = torch.bfloat16 if torch.cuda.is_bf16_supported() else torch.float16
    else:
        dtype = torch.float32

    pipeline = ZImagePipeline.from_pretrained(MODEL_ID, torch_dtype=dtype)
    if DEVICE == "cuda" and GPU_MEMORY_GIB < 16:
        # Lower-VRAM GPUs may work through sequential offload, at a substantial speed cost.
        pipeline.enable_sequential_cpu_offload()
    else:
        pipeline.to(DEVICE)
    return pipeline


@asynccontextmanager
async def lifespan(_: FastAPI):
    global PIPELINE
    PIPELINE = await asyncio.to_thread(load_pipeline)
    yield
    PIPELINE = None


app = FastAPI(title="Hive Z-Image Runner", version="0.1.0", lifespan=lifespan)


class GenerateRequest(BaseModel):
    prompt: str = Field(min_length=1, max_length=8000)
    width: Literal[512, 768, 1024] = 512
    height: Literal[512, 768, 1024] = 512
    seed: int | None = Field(default=None, ge=0, le=2**63 - 1)


@app.get("/health")
async def health() -> dict[str, str | bool | float]:
    return {
        "status": "ready" if PIPELINE is not None else "loading",
        "model": MODEL_ID,
        "device": DEVICE,
        "gpu_available": torch.cuda.is_available(),
        "gpu_memory_gib": round(GPU_MEMORY_GIB, 1),
        "cpu_offload": DEVICE == "cuda" and GPU_MEMORY_GIB < 16,
    }


@app.post("/generate")
async def generate(request: GenerateRequest) -> StreamingResponse:
    if PIPELINE is None:
        raise HTTPException(status_code=503, detail="Model is not ready")

    async with GENERATION_LOCK:
        try:
            image = await asyncio.to_thread(generate_image, request)
        except Exception as error:
            # Keep implementation details and prompt content out of the HTTP response.
            raise HTTPException(status_code=500, detail="Image generation failed") from error

    output = io.BytesIO()
    image.save(output, format="PNG")
    output.seek(0)
    return StreamingResponse(output, media_type="image/png")


def generate_image(request: GenerateRequest):
    if PIPELINE is None:
        raise RuntimeError("Model pipeline is not loaded")

    generator_device = "cuda" if DEVICE == "cuda" else "cpu"
    generator = (
        torch.Generator(device=generator_device).manual_seed(request.seed)
        if request.seed is not None
        else None
    )
    result = PIPELINE(
        prompt=request.prompt,
        width=request.width,
        height=request.height,
        num_inference_steps=9,
        guidance_scale=0.0,
        generator=generator,
    )
    return result.images[0]
