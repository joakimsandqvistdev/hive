"""Image-specific pipeline loading, reference validation, and inference workers."""
import io
import tempfile
from typing import Callable

import torch
from diffusers import QwenImageEditPlusPipeline, StableDiffusionInpaintPipeline, StableDiffusionInstructPix2PixPipeline, ZImagePipeline
from fastapi import HTTPException, UploadFile
from PIL import Image


def load_pipeline(model_key: str, repositories: dict[str, str], device: str, gpu_memory_gib: float):
    if model_key not in repositories:
        raise ValueError("Unsupported image model")
    dtype = (torch.bfloat16 if torch.cuda.is_bf16_supported() else torch.float16) if device == "cuda" else torch.float32
    repository = repositories[model_key]
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
    variant = "fp16" if model_key in {"sdxl-base-1.0", "sdxl-turbo"} and device == "cuda" else None
    pipeline = pipeline_class.from_pretrained(repository, torch_dtype=dtype, local_files_only=True, **({"variant": variant} if variant else {}))
    if device == "cuda" and gpu_memory_gib < 16 and model_key in {"longcat-image-edit-turbo", "flux2-klein-4b", "sdxl-base-1.0", "sd35-medium"}:
        pipeline.enable_model_cpu_offload()
    elif device == "cuda" and gpu_memory_gib < 16:
        pipeline.enable_sequential_cpu_offload()
    else:
        pipeline.to(device)
    return pipeline


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


def generate_image(model_key: str, prompt: str, width: int, height: int, seed: int, steps: int, true_cfg_scale: float,
                   references: list[Image.Image], pipeline, device: str, image_guidance_scale: float = 1.5,
                   strength: float = 0.75, guidance_scale: float = 7.5):
    if pipeline is None:
        raise RuntimeError("Model pipeline is not loaded")
    generator = torch.Generator(device="cuda" if device == "cuda" else "cpu").manual_seed(seed)
    if model_key == "qwen-image-edit-2511":
        result = pipeline(prompt=prompt, image=references, width=width, height=height, num_inference_steps=steps,
                          true_cfg_scale=true_cfg_scale, negative_prompt=" ", guidance_scale=1.0, generator=generator, num_images_per_prompt=1)
    elif model_key == "instruct-pix2pix":
        result = pipeline(prompt=prompt, image=references[0], width=width, height=height, num_inference_steps=steps,
                          image_guidance_scale=image_guidance_scale, guidance_scale=7.5, generator=generator)
    elif model_key == "sd15-inpainting":
        result = pipeline(prompt=prompt, image=references[0], mask_image=references[1], width=width, height=height,
                          num_inference_steps=steps, strength=strength, guidance_scale=guidance_scale, generator=generator)
    elif model_key == "longcat-image-edit-turbo":
        result = pipeline(references[0], prompt, negative_prompt="", guidance_scale=1, num_inference_steps=8, generator=torch.Generator("cpu").manual_seed(seed))
    elif model_key == "flux2-klein-4b":
        result = pipeline(prompt=prompt, image=references if references else None, width=width, height=height,
                          num_inference_steps=steps, guidance_scale=guidance_scale, generator=generator)
    elif model_key in {"sana-sprint-06b", "sd35-medium", "sd15-base", "sdxl-base-1.0"}:
        result = pipeline(prompt=prompt, width=width, height=height, num_inference_steps=steps, guidance_scale=guidance_scale, generator=generator)
    elif model_key == "sdxl-turbo":
        result = pipeline(prompt=prompt, width=width, height=height, num_inference_steps=steps, guidance_scale=0.0, generator=generator)
    else:
        result = pipeline(prompt=prompt, width=width, height=height, num_inference_steps=steps,
                          guidance_scale=0.0, generator=generator)
    return result.images[0]


def generation_worker(sender, model_key, prompt, width, height, seed, steps, true_cfg_scale, references,
                      image_guidance_scale, strength, guidance_scale, *, load_pipeline_fn: Callable,
                      set_pipeline_fn: Callable, generate_image_fn: Callable, report_failure_fn: Callable,
                      release_pipeline_fn: Callable):
    image = None
    try:
        pipeline = load_pipeline_fn(model_key)
        set_pipeline_fn(pipeline)
        image = generate_image_fn(model_key, prompt, width, height, seed, steps, true_cfg_scale, references,
                                  image_guidance_scale, strength, guidance_scale)
        output = io.BytesIO()
        image.save(output, format="PNG")
        encoded = output.getvalue()
        if len(encoded) > 25 * 1024 * 1024:
            raise RuntimeError("Output exceeds the internal size limit")
        sender.send(("result", encoded))
    except Exception as error:
        code = report_failure_fn(error, model_key)
        error.__traceback__ = None
        sender.send(("error", code))
    finally:
        if image is not None:
            image.close()
        for reference in references:
            reference.close()
        release_pipeline_fn()
        sender.close()
