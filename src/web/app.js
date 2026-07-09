const state = {
  tasks: [],
  current: null,
  draft: null,
  options: { providers: {} },
  taskOverrides: {},
  view: "review",
  indices: { running: 0, review: 0, done: 0 },
  logOpen: false,
  token: new URLSearchParams(window.location.search).get("token") || window.localStorage.getItem("cinderToken") || ""
};

if (state.token) window.localStorage.setItem("cinderToken", state.token);

const els = {
  stage: document.getElementById("stage"),
  runningStat: document.getElementById("runningStat"),
  reviewStat: document.getElementById("reviewStat"),
  shippedStat: document.getElementById("shippedStat"),
  runningCount: document.getElementById("runningCount"),
  reviewCount: document.getElementById("reviewCount"),
  shippedCount: document.getElementById("shippedCount"),
  reviewCard: document.querySelector(".review-card"),
  emptyState: document.getElementById("emptyState"),
  taskView: document.getElementById("taskView"),
  composer: document.getElementById("composer"),
  providerBadge: document.getElementById("providerBadge"),
  modelBadge: document.getElementById("modelBadge"),
  cwdBadge: document.getElementById("cwdBadge"),
  previousCardButton: document.getElementById("previousCardButton"),
  deckPosition: document.getElementById("deckPosition"),
  nextCardButton: document.getElementById("nextCardButton"),
  promptText: document.getElementById("promptText"),
  answerText: document.getElementById("answerText"),
  draftControls: document.getElementById("draftControls"),
  draftModel: document.getElementById("draftModel"),
  draftEffort: document.getElementById("draftEffort"),
  logPanel: document.getElementById("logPanel"),
  logText: document.getElementById("logText"),
  toggleLogButton: document.getElementById("toggleLogButton"),
  continueInput: document.getElementById("continueInput"),
  actionButton: document.getElementById("actionButton")
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

function queueForView(view = state.view) {
  if (view === "running") return runningTasks();
  if (view === "done") return shippedTasks();
  return reviewQueue();
}

function clampIndex(view) {
  const queue = queueForView(view);
  const max = Math.max(0, queue.length - 1);
  state.indices[view] = Math.min(Math.max(0, state.indices[view] || 0), max);
}

function render() {
  const review = reviewQueue();
  const running = runningTasks();
  const shipped = shippedTasks();
  clampIndex("running");
  clampIndex("review");
  clampIndex("done");
  const activeQueue = queueForView();
  state.current = state.draft ? null : activeQueue[state.indices[state.view]] || null;

  els.runningCount.textContent = String(running.length);
  els.reviewCount.textContent = String(review.length);
  els.shippedCount.textContent = String(shipped.length);
  els.runningStat.classList.toggle("active", state.view === "running" && !state.draft);
  els.reviewStat.classList.toggle("active", state.view === "review" && !state.draft);
  els.shippedStat.classList.toggle("active", state.view === "done" && !state.draft);
  els.stage.classList.toggle("drafting", Boolean(state.draft));

  if (state.draft) {
    renderDraft();
    return;
  }

  if (!state.current) {
    if (state.view === "review") {
      openDraft({ renderNow: false });
      renderDraft();
      return;
    }
    els.emptyState.classList.remove("hidden");
    els.reviewCard.classList.remove("hidden");
    els.taskView.classList.add("hidden");
    els.composer.classList.add("hidden");
    els.composer.classList.remove("drafting");
    els.draftControls.classList.add("hidden");
    renderEmptyState();
    return;
  }

  const task = state.current;
  const selection = activeSelection();
  els.stage.classList.remove("drafting");
  els.emptyState.classList.add("hidden");
  els.reviewCard.classList.remove("hidden");
  els.taskView.classList.remove("hidden");
  els.composer.classList.remove("hidden");
  els.composer.classList.add("drafting");
  els.draftControls.classList.remove("hidden");
  renderDeckControls(activeQueue.length);

  els.providerBadge.textContent = task.provider === "claude" ? "Claude Code" : "Codex CLI";
  els.modelBadge.textContent = selection.model || providerOptions(task.provider).defaultModel || "default model";
  els.cwdBadge.textContent = task.cwd || "";
  els.promptText.textContent = task.lastPrompt || "";
  els.answerText.textContent = task.answer || "";
  els.logText.textContent = task.log || "";
  els.logPanel.classList.toggle("hidden", !state.logOpen);
  if (state.view === "review") {
    els.composer.classList.remove("hidden");
    els.continueInput.placeholder = "Type a new request. Enter for newline. Cmd+Enter to send.";
    els.actionButton.textContent = "Send";
  } else {
    els.composer.classList.add("hidden");
  }
  renderModelOptions();
  renderEffortOptions();
}

function renderEmptyState() {
  const titles = {
    running: "No running cards",
    review: "No cards to judge",
    done: "No shipped cards"
  };
  const descriptions = {
    running: "Running Claude Code and Codex tasks will show up here.",
    review: "Finished results will land here.",
    done: "Cards you mark Done will show up here."
  };
  els.emptyState.innerHTML = `<h2>${titles[state.view]}</h2><p>${descriptions[state.view]}</p>`;
}

function renderDeckControls(queueLength) {
  const index = state.indices[state.view] || 0;
  els.deckPosition.textContent = queueLength > 1 ? `${index + 1} / ${queueLength}` : "";
  els.previousCardButton.classList.toggle("hidden", queueLength < 2);
  els.nextCardButton.classList.toggle("hidden", queueLength < 2);
}

function renderDraft() {
  els.stage.classList.add("drafting");
  els.emptyState.classList.add("hidden");
  els.taskView.classList.add("hidden");
  els.reviewCard.classList.add("hidden");
  els.composer.classList.remove("hidden");
  els.composer.classList.add("drafting");
  els.draftControls.classList.remove("hidden");
  els.previousCardButton.classList.add("hidden");
  els.nextCardButton.classList.add("hidden");
  els.deckPosition.textContent = "";

  els.continueInput.placeholder = "Tell Cinder what to run. Enter for newline. Cmd+Enter to send.";
  els.actionButton.textContent = "Send";

  renderModelOptions();
  renderEffortOptions();
}

async function refresh() {
  try {
    state.tasks = await cinder.listTasks();
    if (state.draft && state.view === "review" && reviewQueue().length && !els.continueInput.value.trim()) {
      state.draft = null;
    }
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

function openDraft({ renderNow = true } = {}) {
  state.view = "review";
  state.draft = { ...defaultDraft(), prompt: "" };
  els.continueInput.value = "";
  state.logOpen = false;
  if (renderNow) {
    render();
    els.continueInput.focus();
  }
}

function syncDraftFromControls() {
  const modelSelection = decodeModelValue(els.draftModel.value) || defaultDraft();
  if (state.draft) {
    state.draft.provider = modelSelection.provider;
    state.draft.model = modelSelection.model;
    state.draft.effort = els.draftEffort.value;
  } else if (state.current) {
    state.taskOverrides[state.current.id] = {
      model: modelSelection.model,
      effort: els.draftEffort.value
    };
  }
  render();
}

function providerOptions(provider) {
  return state.options.providers?.[provider] || {};
}

function providerLabel(provider) {
  return provider === "claude" ? "Claude Code" : "Codex CLI";
}

function encodeModelValue(provider, model) {
  return JSON.stringify({ provider, model: model || "" });
}

function decodeModelValue(value) {
  try {
    const parsed = JSON.parse(value);
    if (!parsed?.provider) return null;
    return { provider: parsed.provider === "claude" ? "claude" : "codex", model: parsed.model || "" };
  } catch {
    return null;
  }
}

function providerHasModels(provider) {
  const options = providerOptions(provider);
  return Boolean(options.defaultModel || options.models?.length);
}

function defaultDraft() {
  const provider = providerHasModels("codex") || !providerHasModels("claude") ? "codex" : "claude";
  return { provider, model: "", effort: "" };
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
  const choices = modelChoices(state.draft ? null : selection.provider, selection);
  els.draftModel.innerHTML = "";
  for (const choice of choices) {
    const option = document.createElement("option");
    option.value = encodeModelValue(choice.provider, choice.model);
    option.textContent = choice.label;
    els.draftModel.appendChild(option);
  }
  const selectedValue = encodeModelValue(selection.provider, selection.model);
  els.draftModel.value = choices.some((choice) => encodeModelValue(choice.provider, choice.model) === selectedValue)
    ? selectedValue
    : els.draftModel.options[0]?.value || "";
  const applied = decodeModelValue(els.draftModel.value);
  if (state.draft && applied) {
    state.draft.provider = applied.provider;
    state.draft.model = applied.model;
  }
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

function modelChoices(providerFilter, selection) {
  const providers = providerFilter ? [providerFilter] : ["codex", "claude"];
  const choices = [];
  for (const provider of providers) {
    const options = providerOptions(provider);
    const models = options.models || [];
    if (options.defaultModel || (providerFilter && !models.length)) {
      const suffix = options.defaultModel ? `default (${options.defaultModel})` : "default";
      choices.push({ provider, model: "", label: `${providerLabel(provider)} · ${suffix}` });
    }
    for (const model of models) {
      choices.push({
        provider,
        model: model.value,
        label: `${providerLabel(provider)} · ${model.label || model.value}`
      });
    }
  }

  if (selection?.model && !choices.some((choice) => choice.provider === selection.provider && choice.model === selection.model)) {
    choices.unshift({
      provider: selection.provider,
      model: selection.model,
      label: `${providerLabel(selection.provider)} · ${selection.model}`
    });
  }

  if (!choices.length) {
    choices.push({ provider: "codex", model: "", label: "Codex CLI · default" });
  }
  return choices;
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

  state.draft = defaultDraft();
  els.continueInput.value = "";
  await refresh();
  els.continueInput.focus();
}

async function continueCurrent() {
  if (state.draft) {
    await startDraft();
    return;
  }
  if (state.view !== "review") return;
  const prompt = els.continueInput.value.trim();
  if (!state.current || !prompt) return;
  const selection = activeSelection();
  await cinder.continueTask(state.current.id, { prompt, model: selection.model, effort: selection.effort });
  delete state.taskOverrides[state.current.id];
  els.continueInput.value = "";
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

function switchView(view) {
  state.draft = null;
  state.view = view;
  state.logOpen = false;
  els.continueInput.value = "";
  render();
}

function moveDeck(delta) {
  const queue = queueForView();
  if (queue.length < 2) return;
  state.indices[state.view] = (state.indices[state.view] + delta + queue.length) % queue.length;
  state.logOpen = false;
  render();
}

els.runningStat.addEventListener("click", () => switchView("running"));
els.reviewStat.addEventListener("click", () => switchView("review"));
els.shippedStat.addEventListener("click", () => switchView("done"));
els.previousCardButton.addEventListener("click", () => moveDeck(-1));
els.nextCardButton.addEventListener("click", () => moveDeck(1));
els.draftModel.addEventListener("change", syncDraftFromControls);
els.draftEffort.addEventListener("change", syncDraftFromControls);
els.actionButton.addEventListener("click", continueCurrent);
els.toggleLogButton.addEventListener("click", () => {
  state.logOpen = !state.logOpen;
  render();
});
els.continueInput.addEventListener("keydown", (event) => {
  if (event.key === "Enter" && event.metaKey && !event.isComposing && event.keyCode !== 229) {
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
