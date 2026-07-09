const state = {
  tasks: [],
  current: null,
  draft: null,
  options: { providers: {} },
  taskOverrides: {},
  logOpen: false,
  token: new URLSearchParams(window.location.search).get("token") || window.localStorage.getItem("cinderToken") || ""
};

if (state.token) window.localStorage.setItem("cinderToken", state.token);

const els = {
  runningCount: document.getElementById("runningCount"),
  reviewCount: document.getElementById("reviewCount"),
  shippedCount: document.getElementById("shippedCount"),
  emptyState: document.getElementById("emptyState"),
  taskView: document.getElementById("taskView"),
  composer: document.getElementById("composer"),
  providerBadge: document.getElementById("providerBadge"),
  modelBadge: document.getElementById("modelBadge"),
  cwdBadge: document.getElementById("cwdBadge"),
  promptText: document.getElementById("promptText"),
  answerText: document.getElementById("answerText"),
  draftControls: document.getElementById("draftControls"),
  draftModel: document.getElementById("draftModel"),
  draftEffort: document.getElementById("draftEffort"),
  logPanel: document.getElementById("logPanel"),
  logText: document.getElementById("logText"),
  toggleLogButton: document.getElementById("toggleLogButton"),
  continueInput: document.getElementById("continueInput"),
  laterButton: document.getElementById("laterButton"),
  completeButton: document.getElementById("completeButton"),
  newClaudeButton: document.getElementById("newClaudeButton"),
  newCodexButton: document.getElementById("newCodexButton"),
  emptyClaudeButton: document.getElementById("emptyClaudeButton"),
  emptyCodexButton: document.getElementById("emptyCodexButton")
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
  getOptions: () => api("/api/options"),
  createTask: (input) => api("/api/tasks", { method: "POST", body: JSON.stringify(input) }),
  continueTask: (taskId, input) =>
    api(`/api/tasks/${encodeURIComponent(taskId)}/continue`, { method: "POST", body: JSON.stringify(input) }),
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

function shippedTasks() {
  return state.tasks.filter((task) => task.status === "done");
}

function render() {
  const review = reviewQueue();
  const running = runningTasks();
  const shipped = shippedTasks();
  state.current = state.draft ? null : review[0] || null;

  els.runningCount.textContent = String(running.length);
  els.reviewCount.textContent = String(review.length);
  els.shippedCount.textContent = String(shipped.length);

  if (state.draft) {
    renderDraft();
    return;
  }

  if (!state.current) {
    els.emptyState.classList.remove("hidden");
    els.taskView.classList.add("hidden");
    els.composer.classList.add("hidden");
    els.composer.classList.remove("drafting");
    els.draftControls.classList.add("hidden");
    return;
  }

  const task = state.current;
  const selection = activeSelection();
  els.emptyState.classList.add("hidden");
  els.taskView.classList.remove("hidden");
  els.composer.classList.remove("hidden");
  els.composer.classList.add("drafting");
  els.draftControls.classList.remove("hidden");

  els.providerBadge.textContent = task.provider === "claude" ? "Claude Code" : "Codex CLI";
  els.modelBadge.textContent = selection.model || providerOptions(task.provider).defaultModel || "default model";
  els.cwdBadge.textContent = task.cwd || "";
  els.promptText.textContent = task.lastPrompt || "";
  els.answerText.textContent = task.answer || "";
  els.logText.textContent = task.log || "";
  els.logPanel.classList.toggle("hidden", !state.logOpen);
  els.continueInput.placeholder = "Type a new request and press Enter. Shift+Enter for newline.";
  els.laterButton.textContent = "Later";
  els.completeButton.textContent = "Done";
  renderModelOptions();
  renderEffortOptions();
}

function renderDraft() {
  const draft = state.draft;
  const options = providerOptions(draft.provider);
  els.emptyState.classList.add("hidden");
  els.taskView.classList.remove("hidden");
  els.composer.classList.remove("hidden");
  els.composer.classList.add("drafting");
  els.draftControls.classList.remove("hidden");

  els.providerBadge.textContent = draft.provider === "claude" ? "Claude Code" : "Codex CLI";
  els.modelBadge.textContent = draft.model || options.defaultModel || "default model";
  els.cwdBadge.textContent = "";
  els.promptText.textContent = draft.prompt || "";
  els.answerText.textContent = "";
  els.logText.textContent = "";
  els.logPanel.classList.toggle("hidden", !state.logOpen);
  els.continueInput.placeholder = `Tell ${draft.provider === "claude" ? "Claude Code" : "Codex"} what to do. Press Enter to start.`;
  els.laterButton.textContent = "Cancel";
  els.completeButton.textContent = "Start";

  renderModelOptions();
  renderEffortOptions();
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

async function refreshOptions() {
  try {
    state.options = await cinder.getOptions();
  } catch {
    state.options = { providers: {} };
  }
}

function openDraft(provider = "claude") {
  state.draft = {
    provider: provider === "codex" ? "codex" : "claude",
    model: "",
    effort: "",
    prompt: ""
  };
  els.continueInput.value = "";
  els.draftModel.value = "";
  els.draftEffort.value = "";
  state.logOpen = false;
  render();
  els.continueInput.focus();
}

function syncDraftFromControls() {
  if (state.draft) {
    state.draft.model = els.draftModel.value;
    state.draft.effort = els.draftEffort.value;
  } else if (state.current) {
    state.taskOverrides[state.current.id] = {
      model: els.draftModel.value,
      effort: els.draftEffort.value
    };
  }
  render();
}

function providerOptions(provider) {
  return state.options.providers?.[provider] || {};
}

function activeSelection() {
  if (state.draft) {
    return {
      provider: state.draft.provider,
      model: state.draft.model || "",
      effort: state.draft.effort || ""
    };
  }
  if (state.current) {
    const override = state.taskOverrides[state.current.id] || {};
    return {
      provider: state.current.provider,
      model: override.model ?? state.current.model ?? "",
      effort: override.effort ?? state.current.effort ?? ""
    };
  }
  return { provider: "codex", model: "", effort: "" };
}

function renderModelOptions() {
  const selection = activeSelection();
  const options = providerOptions(selection.provider);
  const defaultLabel = options.defaultModel ? `model: default (${options.defaultModel})` : "model: default";
  const models = options.models || [];
  els.draftModel.innerHTML = `<option value="">${escapeHtml(defaultLabel)}</option>`;
  for (const model of models) {
    const option = document.createElement("option");
    option.value = model.value;
    option.textContent = model.label || model.value;
    els.draftModel.appendChild(option);
  }
  els.draftModel.value = selection.model || "";
}

function renderEffortOptions() {
  const selection = activeSelection();
  const options = providerOptions(selection.provider);
  const selectedModel = (options.models || []).find((model) => model.value === selection.model);
  const efforts = selectedModel?.efforts?.length ? selectedModel.efforts : options.efforts || [];
  const defaultEffort = selectedModel?.defaultEffort || options.defaultEffort || "";
  const defaultLabel = defaultEffort ? `effort: default (${defaultEffort})` : "effort: default";
  els.draftEffort.innerHTML = `<option value="">${escapeHtml(defaultLabel)}</option>`;
  for (const effort of efforts) {
    const option = document.createElement("option");
    option.value = effort;
    option.textContent = `effort: ${effort}`;
    els.draftEffort.appendChild(option);
  }
  els.draftEffort.value = efforts.includes(selection.effort) ? selection.effort : "";
  if (state.draft) state.draft.effort = els.draftEffort.value;
  if (state.current && state.taskOverrides[state.current.id]) state.taskOverrides[state.current.id].effort = els.draftEffort.value;
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
    prompt
  };

  await cinder.createTask(payload);

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
  const selection = activeSelection();
  await cinder.continueTask(state.current.id, { prompt, model: selection.model, effort: selection.effort });
  delete state.taskOverrides[state.current.id];
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
els.draftModel.addEventListener("change", syncDraftFromControls);
els.draftEffort.addEventListener("change", syncDraftFromControls);
els.laterButton.addEventListener("click", laterCurrent);
els.completeButton.addEventListener("click", completeCurrent);
els.toggleLogButton.addEventListener("click", () => {
  state.logOpen = !state.logOpen;
  render();
});
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
refreshOptions().then(refresh);
