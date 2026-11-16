# DocuBrain

DocuBrain is a small, end-to-end PDF knowledge assistant. Upload text-based PDFs, ask questions across the indexed documents, and see the source filename and page for each answer. The interface is served by FastAPI, embeddings are generated locally with Sentence Transformers, and answer generation uses Groq.

## What is included

- Responsive browser UI for PDF uploads, document management, chat, and source excerpts.
- Retrieval-augmented question answering with MiniLM embeddings and page-level citations.
- SQLite persistence for extracted text and embeddings; original PDFs are not retained.
- API health endpoint and Prometheus metrics at `/metrics`.
- CPU-only, non-root Docker image with the embedding model included.
- Kubernetes Deployment, ClusterIP Service, ConfigMap, and persistent volume claim.
- GitHub Actions workflow for tests, image builds, and publishing to GHCR on pushes.
- Grafana dashboard for request rate, latency, and server errors.

## Run locally

Requirements: Python 3.12 and a Groq API key. The embedding model downloads from Hugging Face the first time a PDF is indexed.

### Windows PowerShell

```powershell
py -3.12 -m venv .venv
.\.venv\Scripts\Activate.ps1
python -m pip install --upgrade pip
python -m pip install -r requirements.txt
Copy-Item .env.example .env
```

Add your key to `.env`:

```dotenv
GROQ_API_KEY=your-key
```

Start the app:

```powershell
uvicorn main:app --reload
```

Open [http://localhost:8000](http://localhost:8000). API reference: [http://localhost:8000/docs](http://localhost:8000/docs). The app starts without a Groq key so you can view the UI and upload/index documents; answering questions reports a clear configuration error until the key is set.

### Run tests

```powershell
python -m pip install -r requirements-dev.txt
pytest -q
```

The tests use fake embeddings and a fake answer provider, so they do not call Groq or download the embedding model.

## API

| Method | Path | Purpose |
| --- | --- | --- |
| `GET` | `/health` | Liveness/readiness check |
| `GET` | `/metrics` | Prometheus metrics |
| `POST` | `/upload` | Multipart PDF upload (`file`) |
| `GET` | `/documents` | List indexed documents |
| `DELETE` | `/documents/{id}` | Delete a document and its chunks |
| `POST` | `/ask?question=...` | Answer a question with page-level sources |

Interactive API reference is available at `/docs`.

## Docker

The image build downloads the CPU PyTorch runtime and packages the MiniLM model so the running container does not need to download it.

```powershell
docker build -t docubrain:local .
docker run --rm -p 8000:8000 `
  -e GROQ_API_KEY=$env:GROQ_API_KEY `
  -v docubrain-data:/data `
  docubrain:local
```

The container listens on port `8000`, runs as UID `10001`, and stores its SQLite database at `/data/docubrain.db`.

## Kubernetes

The manifests in [`k8s/docubrain.yaml`](./k8s/docubrain.yaml) use a single replica because SQLite is local persistent storage, not a shared multi-writer database. They also configure resource limits, HTTP probes, a non-root/read-only container, Prometheus scrape annotations, and a 5 GiB PVC.

1. Publish the image using the GitHub Actions workflow or build and push it to a registry.
2. Update the image in `k8s/docubrain.yaml` to your registry and tag.
3. Create the API-key secret without adding credentials to the repository:

   ```powershell
   kubectl create secret generic docubrain-secrets `
     --from-literal=GROQ_API_KEY=$env:GROQ_API_KEY
   ```

4. Apply the manifests:

   ```powershell
   kubectl apply -f k8s/docubrain.yaml
   kubectl rollout status deployment/docubrain
   kubectl port-forward service/docubrain 8000:80
   ```

The UI is then available at `http://localhost:8000`. Configure an ingress and TLS before exposing it outside a trusted network. The app does not include user authentication or tenant isolation.

## CI/CD and monitoring

`.github/workflows/ci-cd.yml` runs tests and builds the container on pull requests. Pushes to `main` and version tags also publish the image to GitHub Container Registry using the repository's `GITHUB_TOKEN` package permission.

Prometheus can scrape `http://<service>:80/metrics` when configured to discover the Kubernetes scrape annotations. Import [`monitoring/grafana/docubrain-dashboard.json`](./monitoring/grafana/docubrain-dashboard.json) into Grafana and select the Prometheus data source. The dashboard includes request rate, p95 latency, 5xx ratio, and route/status breakdowns.

### Start the local observability stack

From the repository root, run:

```powershell
docker compose up -d --build
docker compose ps
```

Compose starts DocuBrain, Prometheus, Loki, Grafana Alloy, and Grafana. Grafana provisions its Prometheus and Loki data sources and the DocuBrain dashboard automatically.

| Service | Local URL | Purpose |
| --- | --- | --- |
| DocuBrain | `http://localhost:8000` | Application UI and API |
| Grafana | `http://localhost:3000` | Dashboards and log exploration |
| Prometheus | `http://localhost:9090` | Metrics and scrape target status |
| Loki | `http://localhost:3100` | Log storage API, queried through Grafana |
| Grafana Alloy | `http://localhost:12345` | Log collector status |

Grafana login is `admin` with `GRAFANA_ADMIN_PASSWORD` from `.env`; if unset, the local development default is `docubrain-local`. Change it before sharing the machine or exposing Grafana. Open **Dashboards → DocuBrain → DocuBrain API** for request metrics and application logs. Prometheus should show the `docubrain` target as **UP** at `/targets`.

The app writes logs to a shared local volume in Compose, and Alloy forwards them to Loki. To stop the stack without deleting indexed documents, use `docker compose down` (do not add `-v` unless you intend to delete its volumes).

## Configuration and limitations

| Variable | Default | Description |
| --- | --- | --- |
| `GROQ_API_KEY` | unset | Required for answering questions |
| `GROQ_MODEL` | `openai/gpt-oss-20b` | Groq chat model |
| `EMBEDDING_MODEL` | `all-MiniLM-L6-v2` | Sentence Transformers model or local model path |
| `DOCUBRAIN_DB_PATH` | `data/docubrain.db` | SQLite database location |
| `MAX_UPLOAD_BYTES` | `20971520` | Maximum PDF upload size (20 MiB) |
| `MAX_DOCUMENT_CHUNKS` | `5000` | Maximum indexed text sections per PDF |

PDFs must contain extractable text; scanned/image-only files need OCR before upload. This project is an educational mini-enterprise demo, not a hardened multi-tenant service. Add authentication, authorization, a shared vector database, backups, and network policies before production use.
