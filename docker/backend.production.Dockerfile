FROM python:3.12-slim AS runtime

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1

WORKDIR /app

RUN pip install --no-cache-dir --upgrade pip

COPY backend/pyproject.toml backend/uv.lock ./
RUN pip install --no-cache-dir uv==0.11.16 \
    && uv export --frozen --no-dev --no-emit-project --output-file /tmp/requirements.txt \
    && pip install --no-cache-dir --require-hashes --requirement /tmp/requirements.txt \
    && pip uninstall --yes uv \
    && rm /tmp/requirements.txt

COPY backend/app ./app
COPY backend/alembic.ini ./alembic.ini

RUN useradd --create-home --uid 10001 appuser
USER appuser

EXPOSE 8000

CMD ["sh", "-c", "mkdir -p ${PROMETHEUS_MULTIPROC_DIR:-/tmp/prometheus} && rm -f ${PROMETHEUS_MULTIPROC_DIR:-/tmp/prometheus}/*.db && exec uvicorn app.main:app --host 0.0.0.0 --port 8000 --workers ${WEB_CONCURRENCY:-2} --proxy-headers --forwarded-allow-ips=*"]
