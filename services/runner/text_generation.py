"""Instruction-following text generation worker for compact causal language models."""
from typing import Callable

import torch


def generate_text(model_key: str, instruction: str, prompt: str, max_new_tokens: int, temperature: float,
                  *, repositories: dict[str, str], device: str) -> str:
    if model_key not in {"qwen3-0.6b", "qwen3-1.7b"}:
        raise ValueError("Unsupported text model")
    from transformers import AutoModelForCausalLM, AutoTokenizer

    dtype = (torch.bfloat16 if torch.cuda.is_bf16_supported() else torch.float16) if device == "cuda" else torch.float32
    model_id = repositories[model_key]
    tokenizer = AutoTokenizer.from_pretrained(model_id, local_files_only=True)
    model = AutoModelForCausalLM.from_pretrained(model_id, torch_dtype=dtype, local_files_only=True)
    model.to(device)
    model.eval()
    messages = [
        {"role": "system", "content": instruction},
        {"role": "user", "content": prompt},
    ]
    encoded = tokenizer.apply_chat_template(
        messages,
        tokenize=True,
        add_generation_prompt=True,
        enable_thinking=False,
        return_tensors="pt",
        return_dict=True,
    )
    encoded = {key: value.to(device) for key, value in encoded.items()}
    with torch.inference_mode():
        generated = model.generate(
            **encoded,
            max_new_tokens=max_new_tokens,
            do_sample=temperature > 0,
            **({"temperature": max(temperature, 0.01), "top_p": 0.9} if temperature > 0 else {}),
            pad_token_id=tokenizer.eos_token_id,
        )
    completion = generated[0, encoded["input_ids"].shape[-1]:]
    text = tokenizer.decode(completion, skip_special_tokens=True).strip()
    if not text:
        raise ValueError("Text generation returned no content")
    if len(text.encode("utf-8")) > 128 * 1024:
        raise ValueError("Generated text exceeds the output limit")
    return text


def generation_worker(sender, model_key: str, instruction: str, prompt: str, max_new_tokens: int, temperature: float,
                      *, repositories: dict[str, str], device: str, report_failure_fn: Callable,
                      release_pipeline_fn: Callable):
    try:
        result = generate_text(model_key, instruction, prompt, max_new_tokens, temperature,
                               repositories=repositories, device=device)
        sender.send(("result", result))
    except Exception as error:
        sender.send(("error", report_failure_fn(error, model_key)))
    finally:
        release_pipeline_fn()
        sender.close()
