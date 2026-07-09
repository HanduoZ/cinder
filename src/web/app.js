const state = {
  tasks: [],
  current: null,
  selectedResumeTask: null,
  draft: null,
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
  draftSettings: document.getElementById("draftSettings"),
  draftProvider: document.getElementById("draftProvider"),
  draftCwd: document.getElementById("draftCwd"),
  draftModel: document.getElementById("draftModel"),
  draftEffort: document.getElementById("draftEffort"),
  draftPermission: document.getElementById("draftPermission"),
  draftApproval: document.getElementById("draftApproval"),
  draftClaudePermissionLabel: document.getElementById("draftClaudePermissionLabel"),
  draftCodexApprovalLabel: document.getElementById("draftCodexApprovalLabel"),
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
  state.current = state.draft ? null : review[0] || null;

  els.runningCount.textContent = String(running.length);
  els.reviewCount.textContent = String(review.length);

  if (state.draft) {
    renderDraft();
    return;
  }

  if (!state.current) {
    els.emptyState.classList.remove("hidden");
    els.taskView.classList.add("hidden");
    els.composer.classList.add("hidden");
    els.draftSettings.classList.add("hidden");
    return;
  }

  const task = state.current;
  els.emptyState.classList.add("hidden");
  els.taskView.classList.remove("hidden");
  els.composer.classList.remove("hidden");
  els.draftSettings.classList.add("hidden");

  els.providerBadge.textContent = task.provider === "claude" ? "Claude Code" : "Codex CLI";
  els.modelBadge.textContent = task.model || "default model";
  els.cwdBadge.textContent = task.cwd || "";
  els.promptText.textContent = task.lastPrompt || "";
  els.answerText.textContent = task.answer || "";
  els.logText.textContent = task.log || "";
  els.logPanel.classList.toggle("hidden", !state.logOpen);
  els.continueInput.placeholder = "Type a new request and press Enter. Shift+Enter for newline.";
  els.laterButton.textContent = "Later";
  els.completeButton.textContent = "Done";
}

function renderDraft() {
  const draft = state.draft;
  els.emptyState.classList.add("hidden");
  els.taskView.classList.remove("hidden");
  els.composer.classList.remove("hidden");
  els.draftSettings.classList.remove("hidden");

  els.providerBadge.textContent = draft.provider === "claude" ? "Claude Code" : "Codex CLI";
  els.modelBadge.textContent = draft.model || "default model";
  els.cwdBadge.textContent = draft.cwd || "";
  els.promptText.textContent = draft.prompt || "";
  els.answerText.textContent = "";
  els.logText.textContent = "";
  els.logPanel.classList.toggle("hidden", !state.logOpen);
  els.continueInput.placeholder = `Tell ${draft.provider === "claude" ? "Claude Code" : "Codex"} what to do. Press Enter to start.`;
  els.laterButton.textContent = "Cancel";
  els.completeButton.textContent = "Start";

  els.draftProvider.value = draft.provider;
  els.draftCwd.value = draft.cwd || "";
  els.draftModel.value = draft.model || "";
  els.draftEffort.value = draft.effort || "";
  els.draftPermission.value = draft.permission || "";
  els.draftApproval.value = draft.approval || "on-request";
  els.draftClaudePermissionLabel.classList.toggle("hidden", draft.provider !== "claude");
  els.draftCodexApprovalLabel.classList.toggle("hidden", draft.provider !== "codex");
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

function openDraft(provider = "claude") {
  state.selectedResumeTask = null;
  state.draft = {
    provider: provider === "codex" ? "codex" : "claude",
    model: "",
    effort: "",
    permission: "",
    approval: "on-request",
    cwd: "",
    prompt: ""
  };
  els.searchResults.innerHTML = "";
  els.continueInput.value = "";
  state.logOpen = false;
  render();
  els.continueInput.focus();
}

function syncDraftFromControls() {
  if (!state.draft) return;
  state.draft.provider = els.draftProvider.value === "codex" ? "codex" : "claude";
  state.draft.cwd = els.draftCwd.value.trim();
  state.draft.model = els.draftModel.value.trim();
  state.draft.effort = els.draftEffort.value;
  state.draft.permission = els.draftPermission.value;
  state.draft.approval = els.draftApproval.value;
  render();
}

async function startDraft() {
  if (!state.draft) return;
  syncDraftFromControls();
  const prompt = els.continueInput.value.trim();
  if (!prompt) return;
  state.draft.prompt = prompt;
  const payload = {
    provider: state.draft.provider,
    model: state.draft.model,
    effort: state.draft.effort,
    permission: state.draft.permission,
    approval: state.draft.approval,
    cwd: state.draft.cwd || undefined,
    prompt
  };

  if (state.selectedResumeTask) {
    await cinder.resumeTask(state.selectedResumeTask.id, payload.prompt);
  } else {
    await cinder.createTask(payload);
  }

  state.draft = null;
  els.continueInput.value = "";
  await refresh();
}

async function continueCurrent() {
  if (state.draft) {
    await startDraft();
    return;
  }
  const prompt = els.continueInput.value.trim();
  if (!state.current || !prompt) return;
  await cinder.continueTask(state.current.id, prompt);
  els.continueInput.value = "";
  state.logOpen = false;
  await refresh();
}

async function laterCurrent() {
  if (state.draft) {
    state.draft = null;
    els.continueInput.value = "";
    state.logOpen = false;
    render();
    return;
  }
  if (!state.current) return;
  await cinder.laterTask(state.current.id);
  state.logOpen = false;
  await refresh();
}

async function completeCurrent() {
  if (state.draft) {
    await startDraft();
    return;
  }
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

els.newClaudeButton.addEventListener("click", () => openDraft("claude"));
els.newCodexButton.addEventListener("click", () => openDraft("codex"));
els.emptyClaudeButton.addEventListener("click", () => openDraft("claude"));
els.emptyCodexButton.addEventListener("click", () => openDraft("codex"));
els.draftProvider.addEventListener("change", syncDraftFromControls);
els.draftCwd.addEventListener("input", syncDraftFromControls);
els.draftModel.addEventListener("input", syncDraftFromControls);
els.draftEffort.addEventListener("change", syncDraftFromControls);
els.draftPermission.addEventListener("change", syncDraftFromControls);
els.draftApproval.addEventListener("change", syncDraftFromControls);
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
els.continueInput.addEventListener("input", () => {
  if (!state.draft) return;
  state.draft.prompt = els.continueInput.value;
  els.promptText.textContent = state.draft.prompt;
});

setInterval(refresh, 2000);
refresh();
