FROM python:3.10-slim
WORKDIR /app

COPY requirements.txt .
COPY inference_server.py server.py
COPY monet_generator ./monet_generator

RUN pip install --no-cache-dir -r requirements.txt
CMD ["uvicorn", "server:app", "--host", "0.0.0.0", "--port", "8000"]