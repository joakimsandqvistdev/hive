"""Persistent model cache management and model download HTTP routes."""
import asyncio
import json
import os
from pathlib import Path
import shutil
import sys
import threading

from fastapi import APIRouter, HTTPException
from huggingface_hub import snapshot_download

from model_catalog import MODEL_REPOSITORIES

router = APIRouter()
DOWNLOAD_LOCK = threading.Lock()
DOWNLOAD_STATUS: dict[str, dict[str, str | int]] = {}
DOWNLOAD_TASKS: dict[str, asyncio.Task] = {}
DOWNLOAD_PROCESSES: dict[str, asyncio.subprocess.Process] = {}
DOWNLOAD_CANCEL_REQUESTED: set[str] = set()

def model_is_downloaded(model_id: str) -> bool:
    marker = Path(os.getenv("HF_HOME", "~/.cache/huggingface")).expanduser() / f".hive-{model_id}-download-complete"
    if not marker.is_file():
        return False
    if model_id == "kokoro-82m" and not kokoro_english_model_path().joinpath("en_core_web_sm", "__init__.py").is_file():
        return False
    try:
        snapshot_download(MODEL_REPOSITORIES[model_id], local_files_only=True)
        return True
    except Exception:
        return False


def kokoro_english_model_path() -> Path:
    return Path(os.getenv("HF_HOME", "~/.cache/huggingface")).expanduser() / "hive-kokoro" / "en_core_web_sm"


def model_cache_paths(model_id: str) -> tuple[Path, Path, Path]:
    hf_home = Path(os.getenv("HF_HOME", "~/.cache/huggingface")).expanduser()
    repo_name = "models--" + MODEL_REPOSITORIES[model_id].replace("/", "--")
    hub_cache = Path(os.getenv("HF_HUB_CACHE", os.getenv("HUGGINGFACE_HUB_CACHE", str(hf_home / "hub")))).expanduser()
    marker = hf_home / f".hive-{model_id}-download-complete"
    xet_cache = hf_home / "hive-xet-cache" / model_id
    return hub_cache / repo_name, xet_cache, marker


def remove_partial_model_cache(model_id: str) -> None:
    repo_cache, xet_cache, marker = model_cache_paths(model_id)
    # A Kokoro weights download can predate the G2P sidecar. Preserve those
    # verified weights if the user cancels the one-time sidecar completion.
    preserve_kokoro_weights = model_id == "kokoro-82m" and marker.is_file() and repo_cache.exists()
    cache_paths = (kokoro_english_model_path(),) if preserve_kokoro_weights else (repo_cache, xet_cache, kokoro_english_model_path())
    for cache_path in cache_paths:
        if cache_path.is_symlink():
            cache_path.unlink()
        elif cache_path.exists():
            shutil.rmtree(cache_path)
    if not preserve_kokoro_weights:
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


@router.get("/models")
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


@router.post("/models/{model_id}/download", status_code=202)
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


@router.delete("/models/{model_id}/download")
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


