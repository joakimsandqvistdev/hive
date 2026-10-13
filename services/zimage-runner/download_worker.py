"""Download one allow-listed model while emitting machine-readable byte progress."""

import importlib
import json
import sys
import threading
import time


MODEL_REPOSITORIES = {
    "z-image-turbo": "Tongyi-MAI/Z-Image-Turbo",
    "qwen-image-edit-2511": "Qwen/Qwen-Image-Edit-2511",
}
PROGRESS_LOCK = threading.Lock()
DOWNLOADED_BYTES = 0
TOTAL_BYTES = 0
LAST_EMIT = 0.0


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
            if self._tracks_download:
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
        with PROGRESS_LOCK:
            emit_progress(force=True)
        return 0
    except Exception:
        return 1


if __name__ == "__main__":
    raise SystemExit(main())
