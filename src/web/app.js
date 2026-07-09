const state = {
  tasks: [],
  current: null,
  selectedResumeTask: null,
  draftProvider: "claude",
  logOpen: false,
  token: new URLSearchParams(window.location.search).get("token") || window.localStorage.getItem("cinderToken") || ""
};

if (state.token) window.localStorage.setItem("cinderToken", state.token);

const els = {
  runningCount: document.getElementById("runningCount"),
  reviewCount: document.getElementById("reviewCount"),
  emptyState: document.getElementById("emptyState"),
  taskView: document.getElementById("taskView"),
  composer: document.getElementById("composer"),
  providerBadge: document.getElementById("providerBadge"),
  modelBadge: document.getElementById("modelBadge"),
  cwdBadge: document.getElementById("cwdBadge"),
  promptText: document.getElementById("promptText"),
  answerText: document.getElementById("answerText"),
  logPanel: document.getElementById("logPanel"),
  logText: document.getElementById("logText"),
  toggleLogButton: document.getElementById("toggleLogButton"),
  continueInput: document.getElementById("continueInput"),
  laterButton: document.getElementById("laterButton"),
  completeButton: document.getElementById("completeButton"),
  newClaudeButton: document.getElementById("newClaudeButton"),
  newCodexButton: document.getElementById("newCodexButton"),
  emptyClaudeButton: document.getElementById("emptyClaudeButton"),
  emptyCodexButton: document.getElementById("emptyCodexButton"),
  newTaskDialog: document.getElementById("newTaskDialog"),
  newTaskForm: document.getElementById("newTaskForm"),
  newTaskTitle: document.getElementById("newTaskTitle"),
  dialogClaudeButton: document.getElementById("dialogClaudeButton"),
  dialogCodexButton: document.getElementById("dialogCodexButton"),
  closeDialogButton: document.getElementById("closeDialogButton"),
  searchInput: document.getElementById("searchInput"),
  searchResults: document.getElementById("searchResults")
};

async function api(path, options = {}) {
  const response = await fetch(path, {
    ...options,
    headers: {
      "content-type": "application/json",
      ...(state.token ? { "x-cinder-token": state.token } : {}),
      ...(options.headers || {})
    }
  });
  const data = await response.json();
  if (!response.ok) throw new Error(data.error || "Cinder request failed.");
  return data;
}

const cinder = {
  listTasks: () => api("/api/tasks"),
  createTask: (input) => api("/api/tasks", { method: "POST", body: JSON.stringify(input) }),
  continueTask: (taskId, prompt) =>
    api(`/api/tasks/${encodeURIComponent(taskId)}/continue`, { method: "POST", body: JSON.stringify({ prompt }) }),
  laterTask: (taskId) => api(`/api/tasks/${encodeURIComponent(taskId)}/later`, { method: "POST", body: "{}" }),
  completeTask: (taskId) => api(`/api/tasks/${encodeURIComponent(taskId)}/complete`, { method: "POST", body: "{}" }),
  searchTasks: (query) => api(`/api/tasks/search?q=${encodeURIComponent(query || "")}`),
  resumeTask: (taskId, prompt) =>
    api(`/api/tasks/${encodeURIComponent(taskId)}/resume`, { method: "POST", body: JSON.stringify({ prompt }) })
};

function reviewQueue() {
  return state.tasks.filter((task) => task.status === "review");
}

function runningTasks() {
  return state.tasks.filter((task) => task.status === "running");
}

function render() {
  const review = reviewQueue();
  const running = runningTasks();
  state.current = review[0] || null;

  els.runningCount.textContent = String(running.length);
  els.reviewCount.textContent = String(review.length);

  if (!state.current) {
    els.emptyState.classList.remove("hidden");
    els.taskView.classList.add("hidden");
    els.composer.classList.add("hidden");
    return;
  }

  const task = state.current;
  els.emptyState.classList.add("hidden");
  els.taskView.classList.remove("hidden");
  els.composer.classList.remove("hidden");

  els.providerBadge.textContent = task.provider === "claude" ? "Claude Code" : "Codex CLI";
  els.modelBadge.textContent = task.model || "default model";
  els.cwdBadge.textContent = task.cwd || "";
  els.promptText.textContent = task.lastPrompt || "";
  els.answerText.textContent = task.answer || "";
  els.logText.textContent = task.log || "";
  els.logPanel.classList.toggle("hidden", !state.logOpen);
}

async function refresh() {
  try {
    state.tasks = await cinder.listTasks();
    render();
  } catch (error) {
    els.emptyState.classList.remove("hidden");
    els.taskView.classList.add("hidden");
    els.composer.classList.add("hidden");
    els.emptyState.innerHTML = `<h2>Cannot connect to Cinder</h2><p>${escapeHtml(error.message)}</p>`;
  }
}

function setDraftProvider(provider) {
  state.draftProvider = provider === "codex" ? "codex" : "claude";
  els.newTaskForm.elements.provider.value = state.draftProvider;
  els.newTaskTitle.textContent = state.draftProvider === "claude" ? "New Claude Code conversation" : "New Codex conversation";
  els.dialogClaudeButton.classList.toggle("active", state.draftProvider === "claude");
  els.dialogCodexButton.classList.toggle("active", state.draftProvider === "codex");
  els.newTaskForm.classList.toggle("provider-claude", state.draftProvider === "claude");
  els.newTaskForm.classList.toggle("provider-codex", state.draftProvider === "codex");
}

function openNewTaskDialog(provider = "claude") {
  state.selectedResumeTask = null;
  els.newTaskForm.reset();
  els.searchResults.innerHTML = "";
  setDraftProvider(provider);
  els.newTaskDialog.showModal();
  els.newTaskForm.elements.prompt.focus();
}

async function submitNewTask(event) {
  event.preventDefault();
  const data = Object.fromEntries(new FormData(els.newTaskForm).entries());
  const payload = {
    provider: data.provider,
    model: data.model.trim(),
    effort: data.effort,
    permission: data.permission,
    approval: data.approval,
    cwd: data.cwd.trim() || undefined,
    prompt: data.prompt
  };

  if (state.selectedResumeTask) {
    await cinder.resumeTask(state.selectedResumeTask.id, payload.prompt);
  } else {
    await cinder.createTask(payload);
  }

  els.newTaskDialog.close();
  await refresh();
}

async function continueCurrent() {
  const prompt = els.continueInput.value.trim();
  if (!state.current || !prompt) return;
  await cinder.continueTask(state.current.id, prompt);
  els.continueInput.value = "";
  state.logOpen = false;
  await refresh();
}

async function laterCurrent() {
  if (!state.current) return;
  await cinder.laterTask(state.current.id);
  state.logOpen = false;
  await refresh();
}

async function completeCurrent() {
  if (!state.current) return;
  await cinder.completeTask(state.current.id);
  state.logOpen = false;
  await refresh();
}

async function searchCompleted() {
  const results = await cinder.searchTasks(els.searchInput.value);
  els.searchResults.innerHTML = "";
  for (const task of results) {
    const item = document.createElement("button");
    item.type = "button";
    item.className = "search-result";
    item.innerHTML = `<strong>${escapeHtml(firstLine(task.lastPrompt))}</strong><span>${escapeHtml(task.provider)} - ${escapeHtml(task.cwd || "")}</span>`;
    item.addEventListener("click", () => {
      state.selectedResumeTask = task;
      els.searchResults.innerHTML = `<div class="search-result"><strong>Resume selected</strong><span>${escapeHtml(firstLine(task.lastPrompt))}</span></div>`;
    });
    els.searchResults.appendChild(item);
  }
}

function firstLine(text) {
  return String(text || "").split("\n").find(Boolean)?.slice(0, 140) || "Untitled task";
}

function escapeHtml(text) {
  return String(text)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

els.newClaudeButton.addEventListener("click", () => openNewTaskDialog("claude"));
els.newCodexButton.addEventListener("click", () => openNewTaskDialog("codex"));
els.emptyClaudeButton.addEventListener("click", () => openNewTaskDialog("claude"));
els.emptyCodexButton.addEventListener("click", () => openNewTaskDialog("codex"));
els.dialogClaudeButton.addEventListener("click", () => setDraftProvider("claude"));
els.dialogCodexButton.addEventListener("click", () => setDraftProvider("codex"));
els.closeDialogButton.addEventListener("click", () => els.newTaskDialog.close());
els.newTaskForm.addEventListener("submit", submitNewTask);
els.laterButton.addEventListener("click", laterCurrent);
els.completeButton.addEventListener("click", completeCurrent);
els.toggleLogButton.addEventListener("click", () => {
  state.logOpen = !state.logOpen;
  render();
});
els.searchInput.addEventListener("input", searchCompleted);
els.continueInput.addEventListener("keydown", (event) => {
  if (event.key === "Enter" && !event.shiftKey) {
    event.preventDefault();
    continueCurrent();
  }
});

setInterval(refresh, 2000);
refresh();
