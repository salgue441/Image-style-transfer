FROM python:3.9-slim

# Install minimal dependencies
RUN apt-get update && \
  apt-get install -y --no-install-recommends \
  libglib2.0-0 \
  && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Install only necessary packages
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

COPY . .

# Memory optimizations
ENV CUDA_VISIBLE_DEVICES="-1"
ENV TF_FORCE_GPU_ALLOW_GROWTH=true
ENV TF_CPP_MIN_LOG_LEVEL=2
ENV MALLOC_TRIM_THRESHOLD_=100000
ENV TF_NUM_INTEROP_THREADS=1
ENV TF_NUM_INTRAOP_THREADS=1
ENV PYTHONUNBUFFERED=1

# Start with minimal resources
CMD ["python", "inference_server.py"]