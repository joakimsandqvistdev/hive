"""Download one allow-listed model while emitting machine-readable byte progress."""

import importlib
import json
import os
from pathlib import Path
import shutil
import sys
import threading
import time
from urllib.request import Request, urlopen
from zipfile import ZipFile

from model_catalog import MODEL_REPOSITORIES

PROGRESS_LOCK = threading.Lock()
def environment_counter(name: str) -> int:
    try:
        return max(0, int(os.getenv(name, "0")))
    except ValueError:
        return 0


DOWNLOADED_BYTES = environment_counter("HIVE_DOWNLOAD_BASE_BYTES")
TOTAL_BYTES = environment_counter("HIVE_DOWNLOAD_BASE_TOTAL")
DOWNLOAD_PROGRESS_RESUMED = DOWNLOADED_BYTES > 0 or TOTAL_BYTES > 0
LAST_EMIT = 0.0
KOKORO_ENGLISH_MODEL_URL = "https://github.com/explosion/spacy-models/releases/download/en_core_web_sm-3.8.0/en_core_web_sm-3.8.0-py3-none-any.whl"


def download_kokoro_english_model() -> None:
    """Cache Misaki's English G2P data beside Kokoro's weights, outside the image."""
    hf_home = Path(os.getenv("HF_HOME", "~/.cache/huggingface")).expanduser()
    cache_root = hf_home / "hive-kokoro"
    model_path = cache_root / "en_core_web_sm"
    partial_path = cache_root / "en_core_web_sm.partial"
    wheel_path = cache_root / "en_core_web_sm-3.8.0.whl.partial"
    if (model_path / "en_core_web_sm" / "__init__.py").is_file():
        return
    complete_marker = partial_path / ".hive-complete"
    if complete_marker.is_file() and (partial_path / "en_core_web_sm" / "__init__.py").is_file():
        shutil.rmtree(model_path, ignore_errors=True)
        partial_path.replace(model_path)
        wheel_path.unlink(missing_ok=True)
        return

    cache_root.mkdir(parents=True, exist_ok=True)
    shutil.rmtree(partial_path, ignore_errors=True)
    initial = wheel_path.stat().st_size if wheel_path.is_file() else 0
    request = Request(KOKORO_ENGLISH_MODEL_URL, headers={"Range": f"bytes={initial}-"} if initial else {})
    with urlopen(request, timeout=30) as response:
        response_start = initial if response.status == 206 else 0
        if response_start == 0 and initial:
            initial = 0
        content_length = int(response.headers.get("Content-Length", 0))
        content_range = response.headers.get("Content-Range", "")
        total = int(content_range.rsplit("/", 1)[1]) if "/" in content_range else content_length + response_start
        track_progress(total=total, downloaded=response_start)
        with wheel_path.open("ab" if response_start else "wb") as wheel:
            while chunk := response.read(1024 * 1024):
                wheel.write(chunk)
                wheel.flush()
                track_progress(downloaded=len(chunk))

    partial_path.mkdir()
    with ZipFile(wheel_path) as archive:
        root = partial_path.resolve()
        for member in archive.infolist():
            destination = (partial_path / member.filename).resolve()
            if destination != root and root not in destination.parents:
                raise ValueError("English model archive contains an invalid path")
        archive.extractall(partial_path)
    complete_marker.touch()
    wheel_path.unlink(missing_ok=True)
    shutil.rmtree(model_path, ignore_errors=True)
    partial_path.replace(model_path)


def emit_progress(force: bool = False) -> None:
    global LAST_EMIT
    now = time.monotonic()
    if not force and now - LAST_EMIT < 0.4:
        return
    LAST_EMIT = now
    print(json.dumps({
        "event": "progress",
        "downloadedBytes": max(0, DOWNLOADED_BYTES),
        "totalBytes": max(0, TOTAL_BYTES),
    }), flush=True)


def track_progress(total: int | float | None = None, downloaded: int | float | None = None) -> None:
    global DOWNLOADED_BYTES, TOTAL_BYTES
    with PROGRESS_LOCK:
        TOTAL_BYTES += int(total or 0)
        DOWNLOADED_BYTES = max(0, DOWNLOADED_BYTES + int(downloaded or 0))
        emit_progress(force=TOTAL_BYTES > 0 and LAST_EMIT == 0)


def install_progress_hook() -> None:
    tqdm_module = importlib.import_module("huggingface_hub.utils.tqdm")
    base_tqdm = tqdm_module.tqdm

    class DownloadProgressTqdm(base_tqdm):
        def __init__(self, *args, **kwargs):
            self._tracks_download = kwargs.get("name") in {
                "huggingface_hub.http_get",
                "huggingface_hub.xet_get",
            }
            total = kwargs.get("total")
            initial = kwargs.get("initial", 0)
            kwargs["disable"] = True
            super().__init__(*args, **kwargs)
            if self._tracks_download and not DOWNLOAD_PROGRESS_RESUMED:
                track_progress(total=total, downloaded=initial)

        def update(self, amount=1):
            result = super().update(amount)
            if self._tracks_download:
                track_progress(downloaded=amount)
            return result

        def close(self):
            if self._tracks_download:
                with PROGRESS_LOCK:
                    emit_progress(force=True)
            return super().close()

    tqdm_module.tqdm = DownloadProgressTqdm


def main() -> int:
    if len(sys.argv) != 2 or sys.argv[1] not in MODEL_REPOSITORIES:
        return 2
    model_id = sys.argv[1]
    try:
        install_progress_hook()
        from huggingface_hub import snapshot_download

        snapshot_download(MODEL_REPOSITORIES[model_id])
        if model_id == "kokoro-82m":
            download_kokoro_english_model()
        with PROGRESS_LOCK:
            emit_progress(force=True)
        return 0
    except Exception:
        return 1


if __name__ == "__main__":
    raise SystemExit(main())
