# DocuBrain — technical presentation

## 1. The problem

Useful information is locked inside long PDF documents. DocuBrain gives a user one place to add documents, ask natural-language questions, and verify answers against page-level sources.

## 2. What the application does

1. A user uploads one or more text-based PDFs through the web UI.
2. FastAPI extracts text by page, splits it into overlapping sections, and creates normalized MiniLM embeddings.
3. Extracted sections and vectors are persisted in SQLite; the uploaded PDF itself is discarded.
4. A question is embedded locally, matched against indexed sections, and the strongest matches are sent to Groq as reference context.
5. The answer is shown with source filenames, page numbers, and expandable excerpts.

## 3. Architecture

```text
Browser UI
   │ HTTP
   ▼
FastAPI ───────────────► Groq chat completion API
   │
   ├── PDF text extraction (pypdf)
   ├── Embeddings and similarity search (Sentence Transformers / MiniLM)
   ├── Prometheus metrics (/metrics)
   └── SQLite document + embedding store (/data/docubrain.db)
```

The browser assets are served by the same FastAPI application. The Docker image includes the CPU embedding model. In Kubernetes, the app is a single replica with a PVC for SQLite; this keeps the deployment simple and its persistence explicit.

## 4. Technology choices

| Area | Choice | Reason |
| --- | --- | --- |
| API | FastAPI | Small, typed HTTP service with interactive OpenAPI docs |
| PDF processing | pypdf | Extracts text and preserves page-level source locations |
| Retrieval | MiniLM embeddings + cosine similarity | Local embedding model, no separate vector service |
| Answer generation | Groq | Hosted LLM API; configured outside source control |
| Persistence | SQLite | Minimal setup and durable single-instance document index |
| UI | HTML, CSS, JavaScript | Lightweight, responsive UI served by the API |
| Packaging | Multi-stage Docker, CPU PyTorch | Reproducible image with smaller runtime stage |
| Operations | Kubernetes, Prometheus, Grafana | Health checks, persistence, resource bounds, and service metrics |

## 5. Reliability and security

- Upload type, size, readable-text, and indexing limits are validated.
- API errors use clear HTTP status codes rather than successful responses with embedded errors.
- Question prompts treat document text as untrusted reference data and instruct the model not to follow embedded instructions.
- The database uses parameterized SQL, foreign keys, and WAL mode.
- The container runs as non-root with a read-only root filesystem in Kubernetes.
- API keys are injected through environment configuration / Kubernetes Secrets, never committed.
- Health probes and request metrics are available for operational checks.

## 6. Demo walkthrough

1. Open the workspace and confirm the API connection indicator is green.
2. Upload a text-based PDF and wait for it to be indexed.
3. Ask a document-specific question or choose a suggested prompt.
4. Review the answer, open a source chip, and verify the excerpt and page.
5. Remove a document and confirm it is no longer available to retrieval.
6. Open `/metrics` and the Grafana dashboard to inspect API traffic and latency.

## 7. Build, delivery, and monitoring

- `pytest -q` verifies chunking, upload, retrieval response shape, deletion, health, and metrics without external API calls.
- GitHub Actions runs tests and builds Docker images on pull requests; pushes to `main` and version tags publish to GHCR.
- Kubernetes resources include a single-replica deployment, service, PVC, config map, secret reference, probes, resource requests/limits, and scrape annotations.
- The Grafana dashboard visualizes request rate, p95 response latency, 5xx share, and traffic by route/status.

## 8. Current boundaries and next steps

This assessment version is a working demo, not a production multi-tenant deployment. It does not provide sign-in, tenant isolation, OCR, shared vector storage, or internet-facing ingress/TLS. For production, add identity-aware authorization, a managed database/vector store, document lifecycle and retention controls, backups, rate limits, and private networking.
