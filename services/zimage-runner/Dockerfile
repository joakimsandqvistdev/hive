FROM pytorch/pytorch:2.12.1-cuda12.6-cudnn9-runtime

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    HF_HOME=/cache/huggingface

WORKDIR /app

COPY requirements.txt ./requirements.txt
# The upstream PyTorch image marks its system Python as externally managed;
# installing into this disposable app container uses the documented override.
RUN pip install --no-cache-dir --break-system-packages -r requirements.txt

COPY app.py ./app.py
COPY generation_process.py ./generation_process.py

EXPOSE 8000
CMD ["uvicorn", "app:app", "--host", "0.0.0.0", "--port", "8000"]
