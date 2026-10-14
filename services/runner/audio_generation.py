"""Kokoro text-to-audio generation worker."""
import sys
import tempfile
from pathlib import Path
from typing import Callable

import numpy as np
import torch


def generation_worker(sender, model_key: str, prompt: str, voice: str, speed: float, *, repositories: dict[str, str],
                      english_model_path: Path, report_failure_fn: Callable, release_pipeline_fn: Callable):
    output_path = None
    try:
        import wave
        if model_key == "kokoro-82m":
            package_path = english_model_path / "en_core_web_sm"
            if not (package_path / "__init__.py").is_file():
                raise RuntimeError("Kokoro's English text-processing model is not downloaded")
            sys.path.insert(0, str(english_model_path))
        from kokoro import KPipeline

        pipeline = KPipeline(lang_code=voice[0], repo_id=repositories[model_key])
        with tempfile.NamedTemporaryFile(suffix=".wav", delete=False) as output_file:
            output_path = output_file.name
        total_bytes = 44
        with wave.open(output_path, "wb") as wav:
            wav.setnchannels(1)
            wav.setsampwidth(2)
            wav.setframerate(24000)
            for _, _, audio in pipeline(prompt, voice=voice, speed=speed):
                if audio is None:
                    continue
                samples = audio.detach().cpu().numpy() if isinstance(audio, torch.Tensor) else np.asarray(audio)
                pcm = (np.clip(samples, -1, 1) * 32767).astype("<i2").tobytes()
                total_bytes += len(pcm)
                if total_bytes > 25 * 1024 * 1024:
                    raise ValueError("Audio output exceeds the 25 MB limit")
                wav.writeframes(pcm)
        encoded = Path(output_path).read_bytes()
        if len(encoded) <= 44:
            raise ValueError("Audio output is empty")
        sender.send(("result", encoded))
    except Exception as error:
        sender.send(("error", report_failure_fn(error, model_key)))
    finally:
        if output_path:
            Path(output_path).unlink(missing_ok=True)
        release_pipeline_fn()
        sender.close()
