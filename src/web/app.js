const state = {
  tasks: [],
  current: null,
  draft: null,
  options: { providers: {} },
  taskOverrides: {},
  view: "active",
  indices: { active: 0, suspended: 0, done: 0 },
  currentIds: { active: null, suspended: null, done: null },
  pendingImages: [],
  processWindow: null,
  lang: window.localStorage.getItem("cinderLang") || ((navigator.language || "").startsWith("zh") ? "zh" : "en"),
  token: new URLSearchParams(window.location.search).get("token") || window.localStorage.getItem("cinderToken") || ""
};

const i18n = {
  en: {
    tagline: "Swipe through finished agent work.",
    active: "active",
    suspended: "suspended",
    shipped: "shipped",
    settings: "Settings",
    done: "Done",
    language: "Language",
    emptyActiveTitle: "No active cards",
    emptySuspendedTitle: "No suspended cards",
    emptyDoneTitle: "No shipped cards",
    emptyActiveDescription: "Start a task or wait for agent work to come back.",
    emptySuspendedDescription: "Swipe up on a card to suspend it.",
    emptyDoneDescription: "Cards you mark Done will show up here.",
    lastRequest: "Last request",
    answer: "Answer",
    process: "Process",
    prev: "Prev",
    next: "Next",
    send: "Send",
    suspend: "Suspend",
    approve: "Approve",
    dropImages: "Drop images to attach",
    reviewPlaceholder: "Type a new request. Enter to send. Shift+Enter for newline.",
    runningPlaceholder: "Add a request to this running task. It will run after the current step finishes.",
    activePlaceholder: "Type a follow-up. Enter to send. Shift+Enter for newline.",
    suspendedPlaceholder: "Type to resume this suspended task.",
    draftPlaceholder: "Tell Cinder what to run. Enter to send. Shift+Enter for newline.",
    defaultModel: "default model",
    default: "default",
    defaultEffort: "effort: default",
    defaultEffortWithValue: "effort: default ({value})",
    effort: "effort: {value}",
    requestFailed: "Cinder request failed.",
    cannotConnect: "Cannot connect to Cinder"
  },
  zh: {
    tagline: "轻松审阅已完成的 AI 任务。",
    active: "进行中",
    suspended: "挂起",
    shipped: "已通过",
    settings: "设置",
    done: "完成",
    language: "语言",
    emptyActiveTitle: "没有进行中的卡片",
    emptySuspendedTitle: "没有挂起的卡片",
    emptyDoneTitle: "没有已通过的卡片",
    emptyActiveDescription: "新开一个任务，或等待 agent 结果回来。",
    emptySuspendedDescription: "上滑卡片后会进入这里。",
    emptyDoneDescription: "标记为通过的卡片会显示在这里。",
    lastRequest: "上次请求",
    answer: "答案",
    process: "过程",
    prev: "上一个",
    next: "下一个",
    send: "发送",
    suspend: "挂起",
    approve: "通过",
    dropImages: "拖放图片以上传",
    reviewPlaceholder: "输入新请求。Enter 发送，Shift+Enter 换行。",
    runningPlaceholder: "给这个运行中的任务追加需求。当前步骤结束后会自动继续。",
    activePlaceholder: "输入后续需求。Enter 发送，Shift+Enter 换行。",
    suspendedPlaceholder: "输入需求以恢复这个挂起任务。",
    draftPlaceholder: "告诉 Cinder 要运行什么。Enter 发送，Shift+Enter 换行。",
    defaultModel: "默认模型",
    default: "默认",
    defaultEffort: "推理强度：默认",
    defaultEffortWithValue: "推理强度：默认（{value}）",
    effort: "推理强度：{value}",
    requestFailed: "Cinder 请求失败。",
    cannotConnect: "无法连接到 Cinder"
  }
};

if (!i18n[state.lang]) state.lang = "en";

function t(key, vars = {}) {
  let text = (i18n[state.lang] || i18n.en)[key] || i18n.en[key] || key;
  for (const [name, value] of Object.entries(vars)) text = text.replaceAll(`{${name}}`, value);
  return text;
}

if (state.token) window.localStorage.setItem("cinderToken", state.token);

const els = {
  stage: document.getElementById("stage"),
  runningStat: document.getElementById("runningStat"),
  reviewStat: document.getElementById("reviewStat"),
  shippedStat: document.getElementById("shippedStat"),
  runningCount: document.getElementById("runningCount"),
  reviewCount: document.getElementById("reviewCount"),
  shippedCount: document.getElementById("shippedCount"),
  settingsButton: document.getElementById("settingsButton"),
  settingsDialog: document.getElementById("settingsDialog"),
  languageSelect: document.getElementById("languageSelect"),
  reviewCard: document.querySelector(".review-card"),
  emptyState: document.getElementById("emptyState"),
  taskView: document.getElementById("taskView"),
  composer: document.getElementById("composer"),
  previousCardButton: document.getElementById("previousCardButton"),
  deckPosition: document.getElementById("deckPosition"),
  nextCardButton: document.getElementById("nextCardButton"),
  promptText: document.getElementById("promptText"),
  answerTitle: document.getElementById("answerTitle"),
  answerText: document.getElementById("answerText"),
  draftControls: document.getElementById("draftControls"),
  draftModel: document.getElementById("draftModel"),
  draftEffort: document.getElementById("draftEffort"),
  dropHint: document.getElementById("dropHint"),
  toggleLogButton: document.getElementById("toggleLogButton"),
  continueInput: document.getElementById("continueInput"),
  inputShell: document.querySelector(".input-shell"),
  answerPanel: document.querySelector(".answer-panel"),
  answerActions: document.getElementById("answerActions"),
  actionButton: document.getElementById("actionButton"),
  approveButton: document.getElementById("approveButton"),
  laterButton: document.getElementById("laterButton")
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
  if (!response.ok) throw new Error(data.error || t("requestFailed"));
  return data;
}

function applyTranslations() {
  document.documentElement.lang = state.lang === "zh" ? "zh-CN" : "en";
  window.localStorage.setItem("cinderLang", state.lang);
  els.languageSelect.value = state.lang;
  document.querySelectorAll("[data-i18n]").forEach((element) => {
    element.textContent = t(element.dataset.i18n);
  });
  document.querySelectorAll("[data-i18n-placeholder]").forEach((element) => {
    element.placeholder = t(element.dataset.i18nPlaceholder);
  });
  els.actionButton.setAttribute("aria-label", t("send"));
  els.actionButton.title = t("send");
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
  return state.tasks
    .filter((task) => task.status === "running" || task.status === "review")
    .sort(activeTaskSort);
}

function runningTasks() {
  return state.tasks.filter((task) => task.status === "suspended");
}

function shippedTasks() {
  return state.tasks.filter((task) => task.status === "done");
}

function queueForView(view = state.view) {
  if (view === "suspended") return runningTasks();
  if (view === "done") return shippedTasks();
  return reviewQueue();
}

function activeTaskSort(a, b) {
  if (a.status !== b.status) {
    if (a.status === "review") return -1;
    if (b.status === "review") return 1;
  }
  return new Date(b.updatedAt || b.createdAt || 0) - new Date(a.updatedAt || a.createdAt || 0);
}

function clampIndex(view) {
  const queue = queueForView(view);
  const max = Math.max(0, queue.length - 1);
  state.indices[view] = Math.min(Math.max(0, state.indices[view] || 0), max);
}

function chooseCurrent(queue) {
  const currentId = state.currentIds[state.view];
  if (currentId) {
    const index = queue.findIndex((task) => task.id === currentId);
    if (index !== -1) {
      state.indices[state.view] = index;
      return queue[index];
    }
  }
  const task = queue[state.indices[state.view]] || queue[0] || null;
  state.currentIds[state.view] = task?.id || null;
  return task;
}

function render() {
  const review = reviewQueue();
  const running = runningTasks();
  const shipped = shippedTasks();
  clampIndex("suspended");
  clampIndex("active");
  clampIndex("done");
  const activeQueue = queueForView();
  state.current = state.draft ? null : chooseCurrent(activeQueue);

  els.runningCount.textContent = String(running.length);
  els.reviewCount.textContent = String(review.length);
  els.shippedCount.textContent = String(shipped.length);
  els.runningStat.classList.toggle("active", state.view === "suspended" && !state.draft);
  els.reviewStat.classList.toggle("active", state.view === "active" && !state.draft);
  els.shippedStat.classList.toggle("active", state.view === "done" && !state.draft);
  els.stage.classList.toggle("drafting", Boolean(state.draft));

  if (state.draft) {
    renderDraft();
    return;
  }

  if (!state.current) {
    if (state.view === "active") {
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
  els.stage.classList.remove("drafting");
  els.emptyState.classList.add("hidden");
  els.reviewCard.classList.remove("hidden");
  els.taskView.classList.remove("hidden");
  els.composer.classList.remove("hidden");
  els.composer.classList.add("drafting");
  els.draftControls.classList.remove("hidden");
  renderDeckControls(activeQueue.length);

  els.promptText.textContent = task.lastPrompt || "";
  els.answerTitle.textContent = task.status === "running" ? t("process") : t("answer");
  els.answerText.textContent = task.status === "running" ? task.log || "" : task.answer || "";
  els.toggleLogButton.classList.toggle("hidden", task.status === "running");
  updateProcessWindow();
  if (state.view === "active" || state.view === "suspended") {
    els.composer.classList.remove("hidden");
    els.continueInput.placeholder = state.view === "suspended"
      ? t("suspendedPlaceholder")
      : task.status === "running"
        ? t("runningPlaceholder")
        : t("activePlaceholder");
    els.actionButton.setAttribute("aria-label", t("send"));
    els.actionButton.title = t("send");
    els.answerActions.classList.toggle("hidden", task.status !== "review" || state.view !== "active");
    els.answerPanel.classList.toggle("has-actions", task.status === "review" && state.view === "active");
  } else {
    els.composer.classList.add("hidden");
    els.answerActions.classList.add("hidden");
    els.answerPanel.classList.remove("has-actions");
  }
  renderImages();
  renderModelOptions();
  renderEffortOptions();
  resizeInput();
  scrollRunningOutputToBottom();
}

function renderEmptyState() {
  const titles = {
    suspended: t("emptySuspendedTitle"),
    active: t("emptyActiveTitle"),
    done: t("emptyDoneTitle")
  };
  const descriptions = {
    suspended: t("emptySuspendedDescription"),
    active: t("emptyActiveDescription"),
    done: t("emptyDoneDescription")
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

  els.continueInput.placeholder = t("draftPlaceholder");
  els.actionButton.setAttribute("aria-label", t("send"));
  els.actionButton.title = t("send");
  els.answerActions.classList.add("hidden");
  els.answerPanel.classList.remove("has-actions");

  renderImages();
  renderModelOptions();
  renderEffortOptions();
  resizeInput();
}

async function refresh() {
  try {
    state.tasks = await cinder.listTasks();
    if (state.draft && state.view === "active" && reviewQueue().length && !els.continueInput.value.trim() && !state.pendingImages.length) {
      state.draft = null;
    }
    render();
  } catch (error) {
    els.emptyState.classList.remove("hidden");
    els.taskView.classList.add("hidden");
    els.composer.classList.add("hidden");
    els.emptyState.innerHTML = `<h2>${t("cannotConnect")}</h2><p>${escapeHtml(error.message)}</p>`;
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
  state.view = "active";
  state.draft = { ...defaultDraft(), prompt: "" };
  els.continueInput.value = "";
  state.pendingImages = [];
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

function readImage(file, fallbackName = "image.png") {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve({ name: file.name || fallbackName, type: file.type || "image/png", data: reader.result });
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

function imageFilesFromTransfer(dataTransfer) {
  const files = [...(dataTransfer?.files || [])].filter((file) => file.type.startsWith("image/"));
  const itemFiles = [...(dataTransfer?.items || [])]
    .filter((item) => item.kind === "file" && item.type.startsWith("image/"))
    .map((item) => item.getAsFile())
    .filter(Boolean);
  return [...new Map([...files, ...itemFiles].map((file) => [`${file.name}:${file.size}:${file.type}`, file])).values()];
}

function transferHasImages(dataTransfer) {
  return [...(dataTransfer?.items || [])].some((item) => item.kind === "file" && item.type.startsWith("image/"))
    || [...(dataTransfer?.files || [])].some((file) => file.type.startsWith("image/"));
}

async function addImages(files, fallbackName) {
  if (!files.length) return false;
  const startIndex = state.pendingImages.length;
  const images = await Promise.all(files.map((file, index) => readImage(file, fallbackName || `image-${index + 1}.png`)));
  state.pendingImages.push(...images);
  insertImagePlaceholders(startIndex, images.length);
  resizeInput();
  return true;
}

function renderImages() {
  resizeInput();
}

function imagePlaceholder(index) {
  return `› [Image #${index + 1}]`;
}

function insertImagePlaceholders(startIndex, count) {
  const placeholders = Array.from({ length: count }, (_, offset) => imagePlaceholder(startIndex + offset)).join("\n");
  const input = els.continueInput;
  const start = input.selectionStart ?? input.value.length;
  const end = input.selectionEnd ?? input.value.length;
  const before = input.value.slice(0, start);
  const after = input.value.slice(end);
  const prefix = before && !before.endsWith("\n") ? "\n" : "";
  const suffix = after && !after.startsWith("\n") ? "\n" : "";
  const injected = `${prefix}${placeholders}${suffix}`;
  input.value = `${before}${injected}${after}`;
  const next = before.length + injected.length;
  input.setSelectionRange(next, next);
  input.dispatchEvent(new Event("input", { bubbles: true }));
}

function promptForSubmit() {
  const prompt = els.continueInput.value
    .split("\n")
    .filter((line) => !/^\s*› \[Image #\d+\]\s*$/.test(line))
    .join("\n")
    .trim();
  return prompt || els.continueInput.value.trim();
}

function resizeInput() {
  const input = els.continueInput;
  input.style.height = "auto";
  const max = state.draft ? 260 : 180;
  input.style.height = `${Math.min(max, Math.max(state.draft ? 190 : 104, input.scrollHeight))}px`;
}

function scrollRunningOutputToBottom() {
  if (state.current?.status !== "running") return;
  requestAnimationFrame(() => {
    if (state.current?.status !== "running") return;
    els.answerText.scrollTop = els.answerText.scrollHeight;
  });
}

function scrollProcessWindowToBottom() {
  const processWindow = state.processWindow;
  if (!processWindow || processWindow.closed) return;
  const doc = processWindow.document;
  processWindow.scrollTo(0, Math.max(doc.body?.scrollHeight || 0, doc.documentElement?.scrollHeight || 0));
}

function insertTextAtCursor(text) {
  if (!text) return;
  const input = els.continueInput;
  const start = input.selectionStart ?? input.value.length;
  const end = input.selectionEnd ?? input.value.length;
  input.value = `${input.value.slice(0, start)}${text}${input.value.slice(end)}`;
  const next = start + text.length;
  input.setSelectionRange(next, next);
  input.dispatchEvent(new Event("input", { bubbles: true }));
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
  const defaultLabel = defaultEffort ? t("defaultEffortWithValue", { value: defaultEffort }) : t("defaultEffort");
  els.draftEffort.innerHTML = `<option value="">${escapeHtml(defaultLabel)}</option>`;
  for (const effort of efforts) {
    const option = document.createElement("option");
    option.value = effort;
    option.textContent = t("effort", { value: effort });
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
      const suffix = options.defaultModel ? `${t("default")} (${options.defaultModel})` : t("default");
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
    choices.push({ provider: "codex", model: "", label: `Codex CLI · ${t("default")}` });
  }
  return choices;
}

async function startDraft() {
  if (!state.draft) return;
  syncDraftFromControls();
  const prompt = promptForSubmit();
  if (!prompt && !state.pendingImages.length) return;
  state.draft.prompt = prompt;
  const payload = {
    provider: state.draft.provider,
    model: state.draft.model,
    effort: state.draft.effort,
    prompt,
    images: state.pendingImages
  };

  await cinder.createTask(payload);

  state.draft = defaultDraft();
  els.continueInput.value = "";
  state.pendingImages = [];
  await refresh();
  els.continueInput.focus();
}

async function continueCurrent() {
  if (state.draft) {
    await startDraft();
    return;
  }
  if (state.view !== "active" && state.view !== "suspended") return;
  const prompt = promptForSubmit();
  if (!state.current || (!prompt && !state.pendingImages.length)) return;
  const selection = activeSelection();
  await cinder.continueTask(state.current.id, { prompt, model: selection.model, effort: selection.effort, images: state.pendingImages });
  delete state.taskOverrides[state.current.id];
  els.continueInput.value = "";
  state.pendingImages = [];
  state.currentIds[state.view] = null;
  if (state.view === "suspended") state.view = "active";
  await refresh();
}

async function approveCurrent() {
  if (state.view !== "active" || state.current?.status !== "review") return;
  state.currentIds.active = null;
  await cinder.completeTask(state.current.id);
  await refresh();
}

async function suspendCurrent() {
  if (state.view !== "active" || !state.current) return;
  state.currentIds.active = null;
  await cinder.laterTask(state.current.id);
  await refresh();
}

function processDocument(task) {
  return `<!doctype html><html><head><title>Cinder Process</title><style>
body{margin:0;background:#101114;color:#f5f1e8;font:13px/1.55 ui-monospace,SFMono-Regular,Menlo,Consolas,monospace}
header{position:sticky;top:0;padding:12px 14px;background:#181a20;border-bottom:1px solid #30333d;font:14px/1.4 ui-sans-serif,system-ui,sans-serif}
pre{margin:0;padding:14px;white-space:pre-wrap;word-break:break-word}
</style></head><body><header>${t("process")}</header><pre>${escapeHtml(task?.log || "")}</pre></body></html>`;
}

function openProcessWindow() {
  if (!state.current) return;
  state.processWindow = window.open("", "cinder-process", "width=960,height=720");
  updateProcessWindow();
}

function updateProcessWindow() {
  if (!state.processWindow || state.processWindow.closed || !state.current) return;
  state.processWindow.document.open();
  state.processWindow.document.write(processDocument(state.current));
  state.processWindow.document.close();
  scrollProcessWindowToBottom();
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
  els.continueInput.value = "";
  state.pendingImages = [];
  render();
}

function moveDeck(delta) {
  const queue = queueForView();
  if (queue.length < 2) return;
  state.indices[state.view] = (state.indices[state.view] + delta + queue.length) % queue.length;
  state.currentIds[state.view] = queue[state.indices[state.view]]?.id || null;
  render();
}

els.runningStat.addEventListener("click", () => switchView("suspended"));
els.reviewStat.addEventListener("click", () => switchView("active"));
els.shippedStat.addEventListener("click", () => switchView("done"));
els.previousCardButton.addEventListener("click", () => moveDeck(-1));
els.nextCardButton.addEventListener("click", () => moveDeck(1));
els.settingsButton.addEventListener("click", () => els.settingsDialog.showModal());
els.languageSelect.addEventListener("change", () => {
  state.lang = els.languageSelect.value === "zh" ? "zh" : "en";
  applyTranslations();
  render();
});
els.draftModel.addEventListener("change", syncDraftFromControls);
els.draftEffort.addEventListener("change", syncDraftFromControls);
els.actionButton.addEventListener("click", continueCurrent);
els.approveButton.addEventListener("click", approveCurrent);
els.laterButton?.addEventListener("click", suspendCurrent);
els.toggleLogButton.addEventListener("click", openProcessWindow);
els.continueInput.addEventListener("keydown", (event) => {
  if (event.key === "Enter" && !event.shiftKey && !event.isComposing && event.keyCode !== 229) {
    event.preventDefault();
    continueCurrent();
  }
});
els.continueInput.addEventListener("paste", async (event) => {
  await addImages(imageFilesFromTransfer(event.clipboardData), "pasted-image.png");
});
els.continueInput.addEventListener("input", () => {
  if (state.draft) {
    state.draft.prompt = els.continueInput.value;
    els.promptText.textContent = state.draft.prompt;
  }
  resizeInput();
});
els.inputShell.addEventListener("dragenter", (event) => {
  if (!transferHasImages(event.dataTransfer)) return;
  event.preventDefault();
  els.inputShell.classList.add("dragging");
  els.dropHint.classList.remove("hidden");
});
els.inputShell.addEventListener("dragover", (event) => {
  if (!transferHasImages(event.dataTransfer)) return;
  event.preventDefault();
  event.dataTransfer.dropEffect = "copy";
});
els.inputShell.addEventListener("dragleave", (event) => {
  if (els.inputShell.contains(event.relatedTarget)) return;
  els.inputShell.classList.remove("dragging");
  els.dropHint.classList.add("hidden");
});
els.inputShell.addEventListener("drop", async (event) => {
  const files = imageFilesFromTransfer(event.dataTransfer);
  const text = event.dataTransfer?.getData("text/plain") || "";
  if (!files.length && !text) return;
  event.preventDefault();
  els.inputShell.classList.remove("dragging");
  els.dropHint.classList.add("hidden");
  await addImages(files);
  if (!files.length) insertTextAtCursor(text);
});
window.addEventListener("keydown", (event) => {
  if (event.key !== "Escape" || event.isComposing || event.keyCode === 229) return;
  event.preventDefault();
  suspendCurrent();
});

let touchStart = null;

els.reviewCard.addEventListener("touchstart", (event) => {
  if (!event.touches.length) return;
  const touch = event.touches[0];
  touchStart = {
    x: touch.clientX,
    y: touch.clientY,
    time: Date.now()
  };
}, { passive: true });

els.reviewCard.addEventListener("touchend", (event) => {
  if (!touchStart || !event.changedTouches.length || state.draft) return;
  const touch = event.changedTouches[0];
  const dx = touch.clientX - touchStart.x;
  const dy = touch.clientY - touchStart.y;
  const elapsed = Date.now() - touchStart.time;
  touchStart = null;
  if (elapsed > 700) return;
  if (Math.abs(dx) > 56 && Math.abs(dx) > Math.abs(dy) * 1.25) {
    moveDeck(dx < 0 ? 1 : -1);
    return;
  }
  if (dy < -64 && Math.abs(dy) > Math.abs(dx) * 1.2) {
    suspendCurrent();
  }
}, { passive: true });

applyTranslations();
setInterval(refresh, 2000);
refreshOptions().then(refresh);
