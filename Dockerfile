FROM python:3.12-slim AS build

WORKDIR /build
ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    PYTHONPATH=/install/lib/python3.12/site-packages \
    HF_HOME=/opt/huggingface

COPY requirements.txt requirements-base.txt ./
RUN pip install --no-cache-dir --prefix=/install torch --index-url https://download.pytorch.org/whl/cpu \
    && pip install --no-cache-dir --prefix=/install -r requirements.txt
RUN python -c "from sentence_transformers import SentenceTransformer; SentenceTransformer('all-MiniLM-L6-v2').save('/opt/embedding-model')"

FROM python:3.12-slim AS runtime

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    PYTHONPATH=/install/lib/python3.12/site-packages \
    HF_HOME=/opt/huggingface \
    EMBEDDING_MODEL=/opt/embedding-model \
    DOCUBRAIN_DB_PATH=/data/docubrain.db

WORKDIR /app
COPY --from=build /install /install
COPY --from=build /opt/embedding-model /opt/embedding-model
COPY main.py .
COPY static ./static

RUN mkdir -p /data /logs /tmp \
    && chown -R 10001:10001 /app /data /logs /tmp /opt/embedding-model
USER 10001:10001

EXPOSE 8000
HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
    CMD python -c "import urllib.request; urllib.request.urlopen('http://127.0.0.1:8000/health', timeout=3)"

CMD ["python", "-m", "uvicorn", "main:app", "--host", "0.0.0.0", "--port", "8000"]