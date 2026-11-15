from fastapi import FastAPI, UploadFile, File
from pypdf import PdfReader
from sentence_transformers import SentenceTransformer
import numpy as np
import os
from dotenv import load_dotenv
from groq import Groq

load_dotenv()
llm_client = Groq(api_key=os.getenv("GROQ_API_KEY"))
app = FastAPI(
    title="DocuBrain",
    description="Enterprise AI Knowledge Assistant: upload PDFs and ask questions",
    version="1.0.0",
)

# The model that turns text into numbers (embeddings)
embed_model = SentenceTransformer("all-MiniLM-L6-v2")

# The app's "notebook": the pieces of the PDF and their numbers
store = {"chunks": [], "vectors": None}


@app.get("/health")
def health():
    return {"status": "ok"}


@app.post("/upload")
async def upload_pdf(file: UploadFile = File(...)):
    reader = PdfReader(file.file)

    text = ""
    for page in reader.pages:
        text = text + (page.extract_text() or "")

    chunks = []
    for start in range(0, len(text), 500):
        chunks.append(text[start:start + 500])

    store["chunks"] = chunks
    store["vectors"] = embed_model.encode(chunks, normalize_embeddings=True)

    return {"message": "PDF uploaded", "total_chunks": len(chunks)}


@app.post("/ask")
async def ask(question: str):
    if store["vectors"] is None:
        return {"error": "sPlease upload a PDF first"}

    # Retrieval: find the 3 best chunks
    q_vector = embed_model.encode([question], normalize_embeddings=True)[0]
    scores = store["vectors"] @ q_vector
    best = np.argsort(scores)[::-1][:3]
    top_chunks = [store["chunks"][i] for i in best]

    # Generation: give those chunks to the LLM
    context = "\n\n".join(top_chunks)
    prompt = (
        "Answer the question using ONLY the context below. "
        "If the answer is not in the context, say you don't know.\n\n"
        f"Context:\n{context}\n\nQuestion: {question}"
    )

    try:
        response = llm_client.chat.completions.create(
            model="openai/gpt-oss-20b",
            messages=[{"role": "user", "content": prompt}],
        )
        answer = response.choices[0].message.content
    except Exception as e:
        return {"error": "LLM call failed", "details": str(e)}

    return {"question": question, "answer": answer, "sources": top_chunks}