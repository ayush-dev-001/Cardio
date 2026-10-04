# CardioScope API container (used for the Hugging Face Space; also works on Render/any Docker host).
# Build context = the folder produced by `python deploy/build_hf_space.py` (or the repo root).
FROM python:3.14-slim

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    CARDIOSCOPE_ROOT=/app \
    PYTHONPATH=/app/ml:/app/backend

# Hugging Face Spaces run containers as uid 1000
RUN useradd --create-home --uid 1000 app
WORKDIR /app

COPY requirements-api.txt .
RUN pip install --no-cache-dir -r requirements-api.txt

COPY --chown=app:app ml/cardioscope_ml ml/cardioscope_ml
COPY --chown=app:app ml/configs ml/configs
COPY --chown=app:app backend/app backend/app
COPY --chown=app:app shared shared
COPY --chown=app:app models models
COPY --chown=app:app data/processed data/processed

USER app
# Hugging Face uses port 7860; Render and others pass $PORT.
EXPOSE 7860
CMD ["sh", "-c", "uvicorn app.main:app --host 0.0.0.0 --port ${PORT:-7860}"]
