FROM pytorch/pytorch:2.12.1-cuda12.6-cudnn9-runtime

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    HF_HOME=/cache/huggingface

WORKDIR /app

COPY requirements.txt ./requirements.txt
RUN apt-get update && apt-get install -y --no-install-recommends espeak-ng && rm -rf /var/lib/apt/lists/*
# The upstream PyTorch image marks its system Python as externally managed;
# installing into this disposable app container uses the documented override.
RUN pip install --no-cache-dir --break-system-packages -r requirements.txt

COPY app.py ./app.py
COPY download_worker.py ./download_worker.py
COPY generation_process.py ./generation_process.py
COPY model_catalog.py ./model_catalog.py
COPY model_downloads.py ./model_downloads.py
COPY runner_operation.py ./runner_operation.py
COPY image_generation.py ./image_generation.py
COPY audio_generation.py ./audio_generation.py
COPY video_generation.py ./video_generation.py
COPY text_generation.py ./text_generation.py

EXPOSE 8000
CMD ["uvicorn", "app:app", "--host", "0.0.0.0", "--port", "8000"]
