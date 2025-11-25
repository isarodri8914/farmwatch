# Dockerfile
FROM python:3.11-slim

# dependencias del sistema necesarias (si usas librerías nativas)
RUN apt-get update && apt-get install -y build-essential libssl-dev libffi-dev \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# copiar requirements y instalar
COPY requirements.txt /app/requirements.txt
RUN pip install --no-cache-dir -r /app/requirements.txt

# copiar el código
COPY . /app

ENV PORT=8080

# usar gunicorn en producción
CMD ["gunicorn", "-b", "0.0.0.0:8080", "app:app", "--workers", "2"]
