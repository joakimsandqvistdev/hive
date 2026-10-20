"""Persistent model cache management and model download HTTP routes."""
import asyncio
import json
import os
from pathlib import Path
import shutil
import sys
import tempfile
import threading
import time
from collections.abc import Callable

from fastapi import APIRouter, HTTPException
from huggingface_hub import snapshot_download

from model_catalog import MODEL_REPOSITORIES
from runner_operation import GENERATION_LOCK

router = APIRouter()
DOWNLOAD_LOCK = threading.Lock()
DOWNLOAD_STATUS: dict[str, dict[str, str | int]] = {}
DOWNLOAD_TASKS: dict[str, asyncio.Task] = {}
DOWNLOAD_PROCESSES: dict[str, asyncio.subprocess.Process] = {}
DOWNLOAD_CANCEL_REQUESTED: set[str] = set()
DOWNLOAD_PAUSE_REQUESTED: set[str] = set()
DOWNLOAD_SHUTDOWN_REQUESTED: set[str] = set()
DOWNLOAD_LAST_PERSIST: dict[str, float] = {}
MODEL_CACHE_LOCK = asyncio.Lock()
MODEL_CACHE_IN_USE: Callable[[str], bool] = lambda _model_id: False
DOWNLOAD_STATUS_PATH = Path(os.getenv("HF_HOME", "~/.cache/huggingface")).expanduser() / ".hive-model-downloads.json"
CACHE_SIZE_LOCK = threading.Lock()
CACHE_SIZE_UPDATED_AT = 0.0
CACHE_SIZE_VALUES: dict[str, int] = {}
CACHE_UNKNOWN_BYTES = 0


def _save_download_state_locked(force: bool = False, model_id: str | None = None) -> None:
    """Persist only safe, bounded status data; the cache volume survives runner restarts."""
    if not force and model_id:
        now = time.monotonic()
        if now - DOWNLOAD_LAST_PERSIST.get(model_id, 0) < 2:
            return
        DOWNLOAD_LAST_PERSIST[model_id] = now
    try:
        DOWNLOAD_STATUS_PATH.parent.mkdir(parents=True, exist_ok=True)
        fd, temporary = tempfile.mkstemp(prefix=".hive-downloads-", suffix=".tmp", dir=DOWNLOAD_STATUS_PATH.parent)
        try:
            with os.fdopen(fd, "w", encoding="utf-8") as state_file:
                json.dump({model_id: state for model_id, state in DOWNLOAD_STATUS.items() if model_id in MODEL_REPOSITORIES}, state_file)
                state_file.flush()
                os.fsync(state_file.fileno())
            os.replace(temporary, DOWNLOAD_STATUS_PATH)
        finally:
            if os.path.exists(temporary):
                os.unlink(temporary)
    except OSError:
        # The cache itself remains usable; a later status update will retry persistence.
        pass


def _load_download_state() -> None:
    try:
        data = json.loads(DOWNLOAD_STATUS_PATH.read_text(encoding="utf-8"))
    except (OSError, ValueError, TypeError):
        return
    if not isinstance(data, dict):
        return
    for model_id, value in data.items():
        if model_id not in MODEL_REPOSITORIES or not isinstance(value, dict):
            continue
        status = value.get("status")
        if status not in {"downloading", "paused", "pausing", "cancelling", "removing", "failed"}:
            continue
        state: dict[str, str | int] = {"status": "paused" if status == "pausing" else status}
        for key in ("downloadedBytes", "totalBytes"):
            if isinstance(value.get(key), int) and value[key] >= 0:
                state[key] = value[key]
        if status == "failed":
            state["error"] = "Model download failed. Check runner logs and try again."
        DOWNLOAD_STATUS[model_id] = state


_load_download_state()


def set_model_cache_in_use_check(check: Callable[[str], bool]) -> None:
    global MODEL_CACHE_IN_USE
    MODEL_CACHE_IN_USE = check


def _invalidate_cache_size_summary() -> None:
    global CACHE_SIZE_UPDATED_AT
    with CACHE_SIZE_LOCK:
        CACHE_SIZE_UPDATED_AT = 0

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
    hf_home = Path(os.getenv("HF_HOME", "~/.cache/huggingface")).expanduser()
    # A Kokoro weights download can predate the G2P sidecar. Preserve those
    # verified weights if the user cancels the one-time sidecar completion.
    preserve_kokoro_weights = model_id == "kokoro-82m" and marker.is_file() and repo_cache.exists()
    kokoro_root = hf_home / "hive-kokoro"
    if not preserve_kokoro_weights:
        _remove_contained(repo_cache, repo_cache.parent)
        _remove_contained(xet_cache, xet_cache.parent)
        _remove_contained(kokoro_english_model_path(), kokoro_root)
        for name in ("en_core_web_sm.partial", "en_core_web_sm-3.8.0.whl.partial"):
            _remove_contained(kokoro_root / name, kokoro_root)
    else:
        _remove_contained(kokoro_english_model_path(), kokoro_root)
        for name in ("en_core_web_sm.partial", "en_core_web_sm-3.8.0.whl.partial"):
            _remove_contained(kokoro_root / name, kokoro_root)
    if not preserve_kokoro_weights:
        marker.unlink(missing_ok=True)


async def run_model_download(model_id: str) -> None:
    process = None
    try:
        with DOWNLOAD_LOCK:
            cancelled_before_start = model_id in DOWNLOAD_CANCEL_REQUESTED
            paused_before_start = model_id in DOWNLOAD_PAUSE_REQUESTED
        if cancelled_before_start:
            await asyncio.to_thread(remove_partial_model_cache, model_id)
            with DOWNLOAD_LOCK:
                DOWNLOAD_STATUS[model_id] = {"status": "not_downloaded", "downloadedBytes": 0, "totalBytes": 0}
                _save_download_state_locked(force=True)
            return
        if paused_before_start:
            with DOWNLOAD_LOCK:
                DOWNLOAD_STATUS[model_id] = {**DOWNLOAD_STATUS.get(model_id, {}), "status": "paused"}
                _save_download_state_locked(force=True)
            return

        _, xet_cache, _ = model_cache_paths(model_id)
        child_env = os.environ.copy()
        child_env["HF_XET_CACHE"] = str(xet_cache)
        with DOWNLOAD_LOCK:
            progress = DOWNLOAD_STATUS.get(model_id, {})
        child_env["HIVE_DOWNLOAD_BASE_BYTES"] = str(max(0, int(progress.get("downloadedBytes", 0))))
        child_env["HIVE_DOWNLOAD_BASE_TOTAL"] = str(max(0, int(progress.get("totalBytes", 0))))
        worker_path = str(Path(__file__).with_name("download_worker.py"))
        process = await asyncio.create_subprocess_exec(
            sys.executable, worker_path, model_id,
            stdout=asyncio.subprocess.PIPE,
            env=child_env,
        )
        with DOWNLOAD_LOCK:
            DOWNLOAD_PROCESSES[model_id] = process
            cancel_after_start = model_id in DOWNLOAD_CANCEL_REQUESTED
            progress = DOWNLOAD_STATUS.get(model_id, {})
            if not cancel_after_start:
                DOWNLOAD_STATUS[model_id] = {
                    "status": "downloading",
                    "downloadedBytes": int(progress.get("downloadedBytes", 0)),
                    "totalBytes": int(progress.get("totalBytes", 0)),
                }
                _save_download_state_locked(force=True)
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
                    if model_id not in DOWNLOAD_CANCEL_REQUESTED and model_id not in DOWNLOAD_PAUSE_REQUESTED:
                        DOWNLOAD_STATUS[model_id] = {
                            "status": "downloading",
                            "downloadedBytes": max(0, int(message.get("downloadedBytes", 0))),
                            "totalBytes": max(0, int(message.get("totalBytes", 0))),
                        }
                        _save_download_state_locked(model_id=model_id)
        exit_code = await process.wait()
        with DOWNLOAD_LOCK:
            cancelled = model_id in DOWNLOAD_CANCEL_REQUESTED
            paused = model_id in DOWNLOAD_PAUSE_REQUESTED
            shutting_down = model_id in DOWNLOAD_SHUTDOWN_REQUESTED

        if cancelled:
            await asyncio.to_thread(remove_partial_model_cache, model_id)
            _invalidate_cache_size_summary()
            with DOWNLOAD_LOCK:
                DOWNLOAD_STATUS[model_id] = {"status": "not_downloaded", "downloadedBytes": 0, "totalBytes": 0}
                _save_download_state_locked(force=True)
        elif exit_code == 0:
            _, _, marker = model_cache_paths(model_id)
            marker.parent.mkdir(parents=True, exist_ok=True)
            marker.touch()
            _invalidate_cache_size_summary()
            with DOWNLOAD_LOCK:
                progress = DOWNLOAD_STATUS.get(model_id, {})
                total_bytes = int(progress.get("totalBytes", 0))
                DOWNLOAD_STATUS[model_id] = {**progress, "status": "downloaded", "downloadedBytes": total_bytes or int(progress.get("downloadedBytes", 0))}
                _save_download_state_locked(force=True)
        elif paused:
            with DOWNLOAD_LOCK:
                DOWNLOAD_STATUS[model_id] = {**DOWNLOAD_STATUS.get(model_id, {}), "status": "paused"}
                _save_download_state_locked(force=True)
        elif shutting_down:
            with DOWNLOAD_LOCK:
                DOWNLOAD_STATUS[model_id] = {**DOWNLOAD_STATUS.get(model_id, {}), "status": "downloading"}
                _save_download_state_locked(force=True)
        else:
            with DOWNLOAD_LOCK:
                progress = DOWNLOAD_STATUS.get(model_id, {})
                DOWNLOAD_STATUS[model_id] = {
                    **progress,
                    "status": "failed",
                    "error": "Model download failed. Check runner logs and try again.",
                }
                _save_download_state_locked(force=True)
    except asyncio.CancelledError:
        with DOWNLOAD_LOCK:
            DOWNLOAD_STATUS[model_id] = {**DOWNLOAD_STATUS.get(model_id, {}), "status": "downloading"}
            _save_download_state_locked(force=True)
        raise
    except Exception:
        with DOWNLOAD_LOCK:
            cancelled = model_id in DOWNLOAD_CANCEL_REQUESTED
            paused = model_id in DOWNLOAD_PAUSE_REQUESTED
            shutting_down = model_id in DOWNLOAD_SHUTDOWN_REQUESTED
        if cancelled:
            try:
                await asyncio.to_thread(remove_partial_model_cache, model_id)
            except Exception:
                with DOWNLOAD_LOCK:
                    DOWNLOAD_STATUS[model_id] = {"status": "failed", "error": "Could not remove the cancelled model cache. Check runner logs."}
                    _save_download_state_locked(force=True)
            else:
                with DOWNLOAD_LOCK:
                    DOWNLOAD_STATUS[model_id] = {"status": "not_downloaded", "downloadedBytes": 0, "totalBytes": 0}
                    _save_download_state_locked(force=True)
        elif paused or shutting_down:
            with DOWNLOAD_LOCK:
                DOWNLOAD_STATUS[model_id] = {**DOWNLOAD_STATUS.get(model_id, {}), "status": "paused" if paused else "downloading"}
                _save_download_state_locked(force=True)
        else:
            with DOWNLOAD_LOCK:
                DOWNLOAD_STATUS[model_id] = {"status": "failed", "error": "Model download failed. Check runner logs and try again."}
                _save_download_state_locked(force=True)
    finally:
        with DOWNLOAD_LOCK:
            DOWNLOAD_PROCESSES.pop(model_id, None)
            DOWNLOAD_CANCEL_REQUESTED.discard(model_id)
            DOWNLOAD_PAUSE_REQUESTED.discard(model_id)
            DOWNLOAD_SHUTDOWN_REQUESTED.discard(model_id)
            DOWNLOAD_TASKS.pop(model_id, None)


def _directory_size(path: Path) -> int:
    if path.is_symlink() or not path.exists():
        return 0
    if path.is_file():
        try:
            return path.stat().st_size
        except OSError:
            return 0
    total = 0
    for current, dirs, files in os.walk(path, followlinks=False):
        current_path = Path(current)
        dirs[:] = [name for name in dirs if not (current_path / name).is_symlink()]
        for name in files:
            file_path = current_path / name
            if file_path.is_symlink():
                continue
            try:
                total += file_path.stat().st_size
            except OSError:
                continue
    return total


def _cache_summary() -> tuple[dict[str, int], dict[str, int]]:
    global CACHE_SIZE_UPDATED_AT, CACHE_SIZE_VALUES, CACHE_UNKNOWN_BYTES
    hf_home = Path(os.getenv("HF_HOME", "~/.cache/huggingface")).expanduser()
    hub_cache = Path(os.getenv("HF_HUB_CACHE", os.getenv("HUGGINGFACE_HUB_CACHE", str(hf_home / "hub")))).expanduser()
    xet_root = hf_home / "hive-xet-cache"
    with CACHE_SIZE_LOCK:
        if time.monotonic() - CACHE_SIZE_UPDATED_AT >= 10:
            known_repo_names = {"models--" + repo.replace("/", "--") for repo in MODEL_REPOSITORIES.values()}
            model_bytes: dict[str, int] = {}
            for model_id in MODEL_REPOSITORIES:
                repo_cache, xet_cache, _ = model_cache_paths(model_id)
                size = _directory_size(repo_cache) + _directory_size(xet_cache)
                if model_id == "kokoro-82m":
                    size += _directory_size(hf_home / "hive-kokoro")
                model_bytes[model_id] = size
            unknown_bytes = 0
            for root, known in ((hub_cache, known_repo_names), (xet_root, set(MODEL_REPOSITORIES))):
                if not root.is_dir() or root.is_symlink():
                    continue
                try:
                    for child in root.iterdir():
                        if child.name not in known:
                            unknown_bytes += _directory_size(child)
                except OSError:
                    continue
            CACHE_SIZE_VALUES = model_bytes
            CACHE_UNKNOWN_BYTES = unknown_bytes
            CACHE_SIZE_UPDATED_AT = time.monotonic()
        model_bytes = CACHE_SIZE_VALUES.copy()
        unknown_bytes = CACHE_UNKNOWN_BYTES
    try:
        disk = shutil.disk_usage(hf_home)
        free_bytes, total_bytes = disk.free, disk.total
    except OSError:
        free_bytes, total_bytes = 0, 0
    return model_bytes, {"knownModelBytes": sum(model_bytes.values()), "unknownCacheBytes": unknown_bytes, "freeBytes": free_bytes, "totalBytes": total_bytes}


def _remove_contained(path: Path, root: Path) -> None:
    resolved_root = root.resolve()
    if path.parent.resolve() != resolved_root:
        raise OSError("Model cache target is outside its configured directory")
    if path.is_symlink():
        path.unlink()
    elif path.exists():
        resolved_path = path.resolve()
        if resolved_path == resolved_root or resolved_root not in resolved_path.parents:
            raise OSError("Model cache target is outside its configured directory")
        if path.is_dir():
            shutil.rmtree(path)
        else:
            path.unlink()


def remove_model_cache(model_id: str) -> None:
    if model_id not in MODEL_REPOSITORIES:
        raise ValueError("Unknown model")
    repo_cache, xet_cache, marker = model_cache_paths(model_id)
    hf_home = Path(os.getenv("HF_HOME", "~/.cache/huggingface")).expanduser()
    hub_cache = repo_cache.parent
    xet_root = xet_cache.parent
    _remove_contained(repo_cache, hub_cache)
    _remove_contained(xet_cache, xet_root)
    if model_id == "kokoro-82m":
        kokoro_root = hf_home / "hive-kokoro"
        _remove_contained(kokoro_english_model_path(), kokoro_root)
        for name in ("en_core_web_sm.partial", "en_core_web_sm-3.8.0.whl.partial"):
            _remove_contained(kokoro_root / name, kokoro_root)
    marker.unlink(missing_ok=True)


async def _wait_for_download_task(model_id: str, task: asyncio.Task, process: asyncio.subprocess.Process | None) -> None:
    try:
        await asyncio.wait_for(asyncio.shield(task), timeout=120)
    except asyncio.TimeoutError:
        if process is not None and process.returncode is None:
            try:
                process.kill()
            except ProcessLookupError:
                pass
        await asyncio.wait_for(asyncio.shield(task), timeout=30)


async def _launch_download(model_id: str) -> dict[str, str]:
    if model_id not in MODEL_REPOSITORIES:
        raise HTTPException(status_code=404, detail={"code": "unknown_model"})
    if await asyncio.to_thread(model_is_downloaded, model_id):
        with DOWNLOAD_LOCK:
            DOWNLOAD_STATUS[model_id] = {"status": "downloaded"}
            _save_download_state_locked(force=True)
        return {"id": model_id, "status": "downloaded"}
    with DOWNLOAD_LOCK:
        status = DOWNLOAD_STATUS.get(model_id, {}).get("status")
        if status == "downloading":
            return {"id": model_id, "status": "downloading"}
        if status in {"pausing", "cancelling", "removing"}:
            raise HTTPException(status_code=409, detail={"code": "download_already_active"})
        if status == "paused" and model_id in DOWNLOAD_TASKS:
            raise HTTPException(status_code=409, detail={"code": "download_pausing"})
        progress = DOWNLOAD_STATUS.get(model_id, {})
        DOWNLOAD_STATUS[model_id] = {
            "status": "downloading",
            "downloadedBytes": int(progress.get("downloadedBytes", 0)),
            "totalBytes": int(progress.get("totalBytes", 0)),
        }
        DOWNLOAD_PAUSE_REQUESTED.discard(model_id)
        DOWNLOAD_CANCEL_REQUESTED.discard(model_id)
        _save_download_state_locked(force=True)
        DOWNLOAD_TASKS[model_id] = asyncio.create_task(run_model_download(model_id))
    return {"id": model_id, "status": "downloading"}


async def _remove_model_cache_safely(model_id: str) -> None:
    async with MODEL_CACHE_LOCK:
        with DOWNLOAD_LOCK:
            if model_id in DOWNLOAD_TASKS or DOWNLOAD_STATUS.get(model_id, {}).get("status") in {"downloading", "pausing", "cancelling", "removing"}:
                raise HTTPException(status_code=409, detail={"code": "model_download_active"})
            DOWNLOAD_STATUS[model_id] = {"status": "removing"}
            _save_download_state_locked(force=True)
        if GENERATION_LOCK.locked():
            with DOWNLOAD_LOCK:
                DOWNLOAD_STATUS[model_id] = {"status": "downloaded"}
                _save_download_state_locked(force=True)
            raise HTTPException(status_code=409, detail={"code": "runner_busy"})
        await GENERATION_LOCK.acquire()
        try:
            if MODEL_CACHE_IN_USE(model_id):
                raise HTTPException(status_code=409, detail={"code": "model_in_use"})
            await asyncio.to_thread(remove_model_cache, model_id)
        except HTTPException:
            with DOWNLOAD_LOCK:
                DOWNLOAD_STATUS[model_id] = {"status": "downloaded"}
                _save_download_state_locked(force=True)
            raise
        except Exception:
            still_downloaded = await asyncio.to_thread(model_is_downloaded, model_id)
            with DOWNLOAD_LOCK:
                DOWNLOAD_STATUS[model_id] = {"status": "downloaded" if still_downloaded else "not_downloaded"}
                _save_download_state_locked(force=True)
            raise HTTPException(status_code=500, detail={"code": "cache_removal_failed"}) from None
        finally:
            GENERATION_LOCK.release()
        with DOWNLOAD_LOCK:
            DOWNLOAD_STATUS[model_id] = {"status": "not_downloaded", "downloadedBytes": 0, "totalBytes": 0}
            _save_download_state_locked(force=True)
        _invalidate_cache_size_summary()


@router.get("/models")
async def models() -> dict[str, object]:
    model_bytes, storage = await asyncio.to_thread(_cache_summary)
    result = []
    for model_id in MODEL_REPOSITORIES:
        with DOWNLOAD_LOCK:
            state = DOWNLOAD_STATUS.get(model_id, {}).copy()
        status = state.get("status")
        if status not in {"downloading", "paused", "pausing", "cancelling", "removing", "failed"}:
            status = "downloaded" if await asyncio.to_thread(model_is_downloaded, model_id) else "not_downloaded"
        item: dict[str, str | int] = {"id": model_id, "status": str(status), "cacheBytes": model_bytes.get(model_id, 0)}
        for key in ("downloadedBytes", "totalBytes"):
            if isinstance(state.get(key), int):
                item[key] = int(state[key])
        if status == "failed":
            item["error"] = str(state.get("error", "Model download failed. Check runner logs and try again."))
        result.append(item)
    return {"models": result, "storage": storage, "runner": {"status": "busy" if GENERATION_LOCK.locked() else "ready"}}


@router.post("/models/{model_id}/download", status_code=202)
async def download_model(model_id: str) -> dict[str, str]:
    return await _launch_download(model_id)


@router.post("/models/{model_id}/download/pause")
async def pause_model_download(model_id: str) -> dict[str, str | int]:
    if model_id not in MODEL_REPOSITORIES:
        raise HTTPException(status_code=404, detail={"code": "unknown_model"})
    with DOWNLOAD_LOCK:
        status = DOWNLOAD_STATUS.get(model_id, {}).get("status")
        if status == "paused":
            return {"id": model_id, "status": "paused"}
        task = DOWNLOAD_TASKS.get(model_id)
        if status not in {"downloading", "pausing"} or task is None:
            raise HTTPException(status_code=409, detail={"code": "download_not_active"})
        DOWNLOAD_PAUSE_REQUESTED.add(model_id)
        DOWNLOAD_STATUS[model_id] = {**DOWNLOAD_STATUS.get(model_id, {}), "status": "pausing"}
        _save_download_state_locked(force=True)
        process = DOWNLOAD_PROCESSES.get(model_id)
    if process is not None and process.returncode is None:
        try:
            process.terminate()
        except ProcessLookupError:
            pass
    await _wait_for_download_task(model_id, task, process)
    with DOWNLOAD_LOCK:
        state = DOWNLOAD_STATUS.get(model_id, {})
    return {"id": model_id, "status": str(state.get("status", "paused")), "downloadedBytes": int(state.get("downloadedBytes", 0))}


@router.post("/models/{model_id}/download/resume", status_code=202)
async def resume_model_download(model_id: str) -> dict[str, str]:
    if model_id not in MODEL_REPOSITORIES:
        raise HTTPException(status_code=404, detail={"code": "unknown_model"})
    with DOWNLOAD_LOCK:
        status = DOWNLOAD_STATUS.get(model_id, {}).get("status")
        if status not in {"paused", "failed", "not_downloaded"}:
            raise HTTPException(status_code=409, detail={"code": "download_not_paused"})
    return await _launch_download(model_id)


@router.delete("/models/{model_id}/download")
async def cancel_model_download(model_id: str) -> dict[str, str | int]:
    if model_id not in MODEL_REPOSITORIES:
        raise HTTPException(status_code=404, detail={"code": "unknown_model"})
    with DOWNLOAD_LOCK:
        status = DOWNLOAD_STATUS.get(model_id, {}).get("status")
        task = DOWNLOAD_TASKS.get(model_id)
        process = DOWNLOAD_PROCESSES.get(model_id)
        if status == "paused" and task is None:
            DOWNLOAD_STATUS[model_id] = {"status": "cancelling", **{k: v for k, v in DOWNLOAD_STATUS[model_id].items() if k != "status"}}
            _save_download_state_locked(force=True)
            paused_task = None
        elif status in {"downloading", "pausing", "cancelling"} and task is not None:
            DOWNLOAD_CANCEL_REQUESTED.add(model_id)
            DOWNLOAD_PAUSE_REQUESTED.discard(model_id)
            DOWNLOAD_STATUS[model_id] = {"status": "cancelling", **{k: v for k, v in DOWNLOAD_STATUS[model_id].items() if k != "status"}}
            _save_download_state_locked(force=True)
            paused_task = task
        else:
            raise HTTPException(status_code=409, detail={"code": "download_not_active"})
    if paused_task is None:
        try:
            await asyncio.to_thread(remove_partial_model_cache, model_id)
        except OSError:
            with DOWNLOAD_LOCK:
                DOWNLOAD_STATUS[model_id] = {"status": "failed", "error": "Could not remove the cancelled model cache. Check runner logs."}
                _save_download_state_locked(force=True)
            raise HTTPException(status_code=500, detail={"code": "cancel_cleanup_failed"}) from None
        with DOWNLOAD_LOCK:
            DOWNLOAD_STATUS[model_id] = {"status": "not_downloaded", "downloadedBytes": 0, "totalBytes": 0}
            _save_download_state_locked(force=True)
    else:
        if process is not None and process.returncode is None:
            try:
                process.terminate()
            except ProcessLookupError:
                pass
        await _wait_for_download_task(model_id, paused_task, process)
    with DOWNLOAD_LOCK:
        state = DOWNLOAD_STATUS.get(model_id, {"status": "not_downloaded"})
    if state.get("status") == "failed":
        raise HTTPException(status_code=500, detail={"code": "cancel_cleanup_failed"})
    return {"id": model_id, "status": str(state.get("status", "not_downloaded")), "downloadedBytes": int(state.get("downloadedBytes", 0))}


@router.delete("/models/{model_id}/cache")
async def delete_model_cache(model_id: str) -> dict[str, str]:
    if model_id not in MODEL_REPOSITORIES:
        raise HTTPException(status_code=404, detail={"code": "unknown_model"})
    if not await asyncio.to_thread(model_is_downloaded, model_id):
        raise HTTPException(status_code=409, detail={"code": "model_cache_not_downloaded"})
    await _remove_model_cache_safely(model_id)
    return {"id": model_id, "status": "not_downloaded"}


async def resume_interrupted_downloads() -> None:
    cleanup_ids: list[str] = []
    with DOWNLOAD_LOCK:
        for model_id, state in list(DOWNLOAD_STATUS.items()):
            status = state.get("status")
            if status == "downloading":
                DOWNLOAD_TASKS[model_id] = asyncio.create_task(run_model_download(model_id))
            elif status == "cancelling":
                cleanup_ids.append(model_id)
    for model_id in cleanup_ids:
        try:
            await asyncio.to_thread(remove_partial_model_cache, model_id)
        except OSError:
            with DOWNLOAD_LOCK:
                DOWNLOAD_STATUS[model_id] = {"status": "failed", "error": "Could not remove the cancelled model cache. Check runner logs."}
                _save_download_state_locked(force=True)
        else:
            with DOWNLOAD_LOCK:
                DOWNLOAD_STATUS[model_id] = {"status": "not_downloaded", "downloadedBytes": 0, "totalBytes": 0}
                _save_download_state_locked(force=True)
            _invalidate_cache_size_summary()
    for model_id, state in list(DOWNLOAD_STATUS.items()):
        if state.get("status") == "removing":
            try:
                await asyncio.to_thread(remove_model_cache, model_id)
            except Exception:
                pass
            downloaded = await asyncio.to_thread(model_is_downloaded, model_id)
            with DOWNLOAD_LOCK:
                DOWNLOAD_STATUS[model_id] = {"status": "downloaded" if downloaded else "not_downloaded"}
                _save_download_state_locked(force=True)


async def shutdown_model_downloads() -> None:
    with DOWNLOAD_LOCK:
        tasks = list(DOWNLOAD_TASKS.items())
        processes = dict(DOWNLOAD_PROCESSES)
        DOWNLOAD_SHUTDOWN_REQUESTED.update(model_id for model_id, _ in tasks)
    for process in processes.values():
        if process.returncode is None:
            try:
                process.terminate()
            except ProcessLookupError:
                pass
    if tasks:
        await asyncio.gather(*(
            _wait_for_download_task(model_id, task, processes.get(model_id))
            for model_id, task in tasks
        ), return_exceptions=True)


