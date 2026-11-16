import io
from types import SimpleNamespace

import numpy as np
from fastapi.testclient import TestClient

import main


class FakeEmbedder:
    def encode(self, texts, normalize_embeddings=True):
        return np.tile(np.array([[1.0, 0.0]], dtype=np.float32), (len(texts), 1))


class FakePage:
    def extract_text(self):
        return "Revenue grew by 12 percent in the annual report."


class FakeReader:
    pages = [FakePage()]


class FakeGroqClient:
    def __init__(self):
        self.chat = SimpleNamespace(
            completions=SimpleNamespace(
                create=lambda **_kwargs: SimpleNamespace(
                    choices=[
                        SimpleNamespace(
                            message=SimpleNamespace(
                                content="Revenue grew by 12 percent. [Source 1]"
                            )
                        )
                    ]
                )
            )
        )


def test_make_chunks_keeps_words_and_overlap():
    text = " ".join(f"word{index}" for index in range(500))

    chunks = main.make_chunks(text)

    assert len(chunks) > 1
    assert all(chunk.strip() for chunk in chunks)
    assert all(len(chunk) <= main.CHUNK_SIZE for chunk in chunks)
    assert set(" ".join(chunks).split()) == set(text.split())


def test_upload_ask_and_delete_document(tmp_path, monkeypatch):
    monkeypatch.setattr(main, "DATABASE_PATH", tmp_path / "docubrain.db")
    monkeypatch.setattr(main, "get_embedder", lambda: FakeEmbedder())
    monkeypatch.setattr(main, "get_llm_client", lambda: FakeGroqClient())
    monkeypatch.setattr(main, "PdfReader", lambda *_args, **_kwargs: FakeReader())

    with TestClient(main.app) as client:
        upload = client.post(
            "/upload",
            files={"file": ("annual-report.pdf", io.BytesIO(b"%PDF-1.4 test"), "application/pdf")},
        )
        assert upload.status_code == 200
        document = upload.json()
        assert document["filename"] == "annual-report.pdf"
        assert document["chunk_count"] == 1

        result = client.post("/ask", params={"question": "How much did revenue grow?"})
        assert result.status_code == 200
        assert "12 percent" in result.json()["answer"]
        assert result.json()["sources"][0]["filename"] == "annual-report.pdf"
        assert result.json()["sources"][0]["page"] == 1

        deleted = client.delete(f"/documents/{document['id']}")
        assert deleted.status_code == 204
        assert client.get("/documents").json()["documents"] == []


def test_upload_rejects_non_pdf(tmp_path, monkeypatch):
    monkeypatch.setattr(main, "DATABASE_PATH", tmp_path / "docubrain.db")

    with TestClient(main.app) as client:
        response = client.post(
            "/upload",
            files={"file": ("notes.pdf", io.BytesIO(b"not a pdf"), "application/pdf")},
        )

    assert response.status_code == 400
    assert "not a PDF" in response.json()["detail"]


def test_upload_explains_missing_embedding_dependency(tmp_path, monkeypatch):
    monkeypatch.setattr(main, "DATABASE_PATH", tmp_path / "docubrain.db")
    monkeypatch.setattr(main, "PdfReader", lambda *_args, **_kwargs: FakeReader())

    def missing_embedder():
        raise ModuleNotFoundError("sentence_transformers is not installed")

    monkeypatch.setattr(main, "get_embedder", missing_embedder)
    with TestClient(main.app) as client:
        response = client.post(
            "/upload",
            files={"file": ("annual-report.pdf", io.BytesIO(b"%PDF-1.4 test"), "application/pdf")},
        )

    assert response.status_code == 503
    assert "pip install -r requirements.txt" in response.json()["detail"]


def test_ask_requires_a_document(tmp_path, monkeypatch):
    monkeypatch.setattr(main, "DATABASE_PATH", tmp_path / "docubrain.db")

    with TestClient(main.app) as client:
        response = client.post("/ask", params={"question": "What is in my report?"})

    assert response.status_code == 409
    assert "Upload a PDF" in response.json()["detail"]


def test_homepage_and_metrics_are_available(tmp_path, monkeypatch):
    monkeypatch.setattr(main, "DATABASE_PATH", tmp_path / "docubrain.db")

    with TestClient(main.app) as client:
        homepage = client.get("/")
        metrics = client.get("/metrics")

    assert homepage.status_code == 200
    assert "DocuBrain" in homepage.text
    assert metrics.status_code == 200
    assert "http_requests_total" in metrics.text
