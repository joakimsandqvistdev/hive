"""Text-to-video inference worker implementations."""
import tempfile
from pathlib import Path
from typing import Callable

import torch
from diffusers import CogVideoXPipeline, WanPipeline
from diffusers.utils import export_to_video


def generation_worker(sender, model_key: str, prompt: str, negative_prompt: str, frames: int, seed: int,
                      steps: int, guidance_scale: float, *, repositories: dict[str, str], device: str,
                      gpu_memory_gib: float, report_failure_fn: Callable, release_pipeline_fn: Callable):
    pipeline = None
    output_path = None
    try:
        dtype = (torch.bfloat16 if torch.cuda.is_bf16_supported() else torch.float16) if device == "cuda" else torch.float32
        pipeline_class = WanPipeline if model_key == "wan2.1-t2v-1.3b" else CogVideoXPipeline
        pipeline = pipeline_class.from_pretrained(repositories[model_key], torch_dtype=dtype, local_files_only=True)
        if device == "cuda" and gpu_memory_gib < 16:
            pipeline.enable_sequential_cpu_offload()
        else:
            pipeline.to(device)
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
            generator=torch.Generator(device=device).manual_seed(seed),
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
        sender.send(("error", report_failure_fn(error, model_key)))
    finally:
        if output_path:
            Path(output_path).unlink(missing_ok=True)
        del pipeline
        release_pipeline_fn()
        sender.close()
