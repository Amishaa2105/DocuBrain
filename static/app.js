const chatLog = document.querySelector("#chat-log");
const questionInput = document.querySelector("#question-input");
const questionForm = document.querySelector("#question-form");
const sendButton = document.querySelector("#send-button");
const fileInput = document.querySelector("#file-input");
const uploadZone = document.querySelector("#upload-zone");
const uploadProgress = document.querySelector("#upload-progress");
const uploadMessage = document.querySelector("#upload-message");
const documentsList = document.querySelector("#documents-list");
const documentCount = document.querySelector("#document-count");
const sidebarCount = document.querySelector("#sidebar-count");
const connectionStatus = document.querySelector("#connection-status");
const toastRegion = document.querySelector("#toast-region");

function showToast(message, isError = false) {
  const toast = document.createElement("div");
  toast.className = `toast${isError ? " error" : ""}`;
  toast.textContent = message;
  toastRegion.append(toast);
  window.setTimeout(() => toast.remove(), 4200);
}

async function request(url, options = {}) {
  const response = await fetch(url, options);
  let payload = null;
  if (response.status !== 204) {
    try {
      payload = await response.json();
    } catch {
      payload = null;
    }
  }
  if (!response.ok) {
    throw new Error(payload?.detail || "Something went wrong. Please try again.");
  }
  return payload;
}

function formatDate(value) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "Just added";
  return new Intl.DateTimeFormat(undefined, { month: "short", day: "numeric" }).format(date);
}

function renderDocuments(documents) {
  documentCount.textContent = String(documents.length);
  sidebarCount.textContent = String(documents.length);
  documentsList.replaceChildren();

  if (!documents.length) {
    const empty = document.createElement("div");
    empty.className = "documents-empty";
    const icon = document.createElement("span");
    icon.className = "empty-file-icon";
    icon.textContent = "▤";
    const title = document.createElement("strong");
    title.textContent = "No documents yet";
    const hint = document.createElement("span");
    hint.textContent = "Your uploaded PDFs will appear here.";
    empty.append(icon, title, hint);
    documentsList.append(empty);
    return;
  }

  for (const documentInfo of documents) {
    const card = document.createElement("div");
    card.className = "document-card";
    const icon = document.createElement("span");
    icon.className = "pdf-icon";
    icon.textContent = "PDF";
    const meta = document.createElement("div");
    meta.className = "document-meta";
    const name = document.createElement("strong");
    name.textContent = documentInfo.filename;
    name.title = documentInfo.filename;
    const details = document.createElement("span");
    details.textContent = `${documentInfo.page_count} ${documentInfo.page_count === 1 ? "page" : "pages"} · ${formatDate(documentInfo.uploaded_at)}`;
    meta.append(name, details);

    const remove = document.createElement("button");
    remove.type = "button";
    remove.className = "delete-document";
    remove.textContent = "×";
    remove.setAttribute("aria-label", `Remove ${documentInfo.filename}`);
    remove.title = "Remove document";
    remove.addEventListener("click", async () => {
      remove.disabled = true;
      try {
        await request(`/documents/${encodeURIComponent(documentInfo.id)}`, { method: "DELETE" });
        await loadDocuments();
        showToast("Document removed from your knowledge base.");
      } catch (error) {
        remove.disabled = false;
        showToast(error.message, true);
      }
    });

    card.append(icon, meta, remove);
    documentsList.append(card);
  }
}

async function loadDocuments() {
  try {
    const result = await request("/documents");
    renderDocuments(result.documents);
  } catch (error) {
    showToast(error.message, true);
  }
}

function addMessage(role, text, sources = []) {
  chatLog.querySelector(".empty-chat")?.remove();
  const wrapper = document.createElement("article");
  wrapper.className = `chat-message ${role}`;
  const label = document.createElement("div");
  label.className = "message-label";

  if (role === "assistant") {
    const mark = document.createElement("span");
    mark.className = "assistant-mark";
    mark.textContent = "✦";
    label.append(mark);
  }
  const speaker = document.createElement("span");
  speaker.textContent = role === "user" ? "You" : "DocuBrain";
  label.append(speaker);

  const bubble = document.createElement("div");
  bubble.className = "message-bubble";
  bubble.textContent = text;
  wrapper.append(label, bubble);

  if (sources.length) {
    const sourceList = document.createElement("div");
    sourceList.className = "source-list";
    sources.forEach((source, index) => {
      const sourceWrapper = document.createElement("div");
      const chip = document.createElement("button");
      chip.type = "button";
      chip.className = "source-chip";
      chip.textContent = `Source ${index + 1} · ${source.filename} · p. ${source.page}`;
      chip.setAttribute("aria-expanded", "false");
      chip.addEventListener("click", () => {
        const existing = sourceWrapper.querySelector(".source-excerpt");
        if (existing) {
          existing.remove();
          chip.setAttribute("aria-expanded", "false");
          return;
        }
        const excerpt = document.createElement("p");
        excerpt.className = "source-excerpt";
        excerpt.textContent = source.excerpt;
        sourceWrapper.append(excerpt);
        chip.setAttribute("aria-expanded", "true");
      });
      sourceWrapper.append(chip);
      sourceList.append(sourceWrapper);
    });
    wrapper.append(sourceList);
  }

  chatLog.append(wrapper);
  chatLog.scrollTop = chatLog.scrollHeight;
  return wrapper;
}

function setConnectionStatus(online, message) {
  connectionStatus.classList.toggle("online", online);
  connectionStatus.classList.toggle("offline", !online);
  connectionStatus.lastElementChild.textContent = message;
}

async function checkHealth() {
  try {
    await request("/health");
    setConnectionStatus(true, "Connected");
  } catch {
    setConnectionStatus(false, "Connection issue");
  }
}

async function uploadPdf(file) {
  if (!file) return;
  if (!file.name.toLowerCase().endsWith(".pdf")) {
    showToast("Please choose a PDF file.", true);
    return;
  }
  if (file.size > 20 * 1024 * 1024) {
    showToast("This file is larger than the 20 MB upload limit.", true);
    return;
  }

  uploadProgress.hidden = false;
  uploadMessage.textContent = `Indexing ${file.name}…`;
  fileInput.disabled = true;
  try {
    const data = new FormData();
    data.append("file", file);
    const result = await request("/upload", { method: "POST", body: data });
    await loadDocuments();
    showToast(`${result.filename} is ready to search.`);
  } catch (error) {
    showToast(error.message, true);
  } finally {
    uploadProgress.hidden = true;
    fileInput.disabled = false;
    fileInput.value = "";
  }
}

questionForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  const question = questionInput.value.trim();
  if (question.length < 3 || sendButton.disabled) return;

  addMessage("user", question);
  questionInput.value = "";
  questionInput.style.height = "auto";
  const pending = addMessage("assistant", "");
  const dots = document.createElement("span");
  dots.className = "typing-dots";
  dots.setAttribute("aria-label", "Thinking");
  for (let index = 0; index < 3; index += 1) dots.append(document.createElement("i"));
  pending.querySelector(".message-bubble").append(dots);
  sendButton.disabled = true;

  try {
    const result = await request(`/ask?${new URLSearchParams({ question })}`, { method: "POST" });
    if (result.sources?.length) {
      pending.remove();
      addMessage("assistant", result.answer, result.sources);
    } else {
      pending.querySelector(".message-bubble").textContent = result.answer;
    }
  } catch (error) {
    pending.querySelector(".message-bubble").textContent = error.message;
    pending.querySelector(".message-bubble").classList.add("error");
  } finally {
    sendButton.disabled = false;
    questionInput.focus();
    chatLog.scrollTop = chatLog.scrollHeight;
  }
});

questionInput.addEventListener("input", () => {
  questionInput.style.height = "auto";
  questionInput.style.height = `${Math.min(questionInput.scrollHeight, 92)}px`;
});

questionInput.addEventListener("keydown", (event) => {
  if (event.key === "Enter" && !event.shiftKey) {
    event.preventDefault();
    questionForm.requestSubmit();
  }
});

document.querySelectorAll(".suggestion").forEach((suggestion) => {
  suggestion.addEventListener("click", () => {
    questionInput.value = suggestion.dataset.prompt || "";
    questionInput.focus();
    questionInput.dispatchEvent(new Event("input"));
  });
});

fileInput.addEventListener("change", () => uploadPdf(fileInput.files?.[0]));
document.querySelector("#refresh-documents").addEventListener("click", loadDocuments);
document.querySelector("#new-chat").addEventListener("click", () => {
  chatLog.replaceChildren();
  const empty = document.createElement("div");
  empty.className = "empty-chat";
  const icon = document.createElement("div");
  icon.className = "empty-chat-icon";
  icon.textContent = "✦";
  const title = document.createElement("strong");
  title.textContent = "Your next great answer starts here.";
  const hint = document.createElement("span");
  hint.textContent = "Upload a PDF or choose a suggested question to begin.";
  empty.append(icon, title, hint);
  chatLog.append(empty);
  questionInput.value = "";
  questionInput.focus();
});

for (const eventName of ["dragenter", "dragover"]) {
  uploadZone.addEventListener(eventName, (event) => {
    event.preventDefault();
    uploadZone.classList.add("dragging");
  });
}
for (const eventName of ["dragleave", "drop"]) {
  uploadZone.addEventListener(eventName, (event) => {
    event.preventDefault();
    uploadZone.classList.remove("dragging");
  });
}
uploadZone.addEventListener("drop", (event) => uploadPdf(event.dataTransfer?.files?.[0]));

checkHealth();
loadDocuments();
