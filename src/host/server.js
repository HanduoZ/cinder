import { spawn } from "node:child_process";
import crypto from "node:crypto";
import fs from "node:fs";
import http from "node:http";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.resolve(__dirname, "../..");
const webDir = path.join(rootDir, "src/web");
const dataDir = process.env.CINDER_DATA_DIR || path.join(os.homedir(), ".cinder");
const dbPath = path.join(dataDir, "tasks.json");
const configPath = path.join(dataDir, "config.json");
const attachmentsDir = path.join(dataDir, "attachments");
const activeProcesses = new Map();

function now() {
  return new Date().toISOString();
}

function ensureDataDir() {
  fs.mkdirSync(dataDir, { recursive: true });
  fs.mkdirSync(attachmentsDir, { recursive: true });
  if (!fs.existsSync(dbPath)) {
    fs.writeFileSync(dbPath, JSON.stringify({ tasks: [] }, null, 2));
  }
  if (!fs.existsSync(configPath)) {
    fs.writeFileSync(
      configPath,
      JSON.stringify({ pairingToken: crypto.randomBytes(18).toString("base64url") }, null, 2),
      { mode: 0o600 }
    );
  }
}

function readConfig() {
  ensureDataDir();
  return JSON.parse(fs.readFileSync(configPath, "utf8"));
}

function readJsonIfExists(filePath) {
  try {
    if (!fs.existsSync(filePath)) return null;
    return JSON.parse(fs.readFileSync(filePath, "utf8"));
  } catch {
    return null;
  }
}

function readTomlValue(filePath, key) {
  try {
    if (!fs.existsSync(filePath)) return "";
    const pattern = new RegExp(`^${key}\\s*=\\s*"(.*)"\\s*$`);
    for (const line of fs.readFileSync(filePath, "utf8").split(/\r?\n/)) {
      const match = line.match(pattern);
      if (match) return match[1];
    }
  } catch {
    return "";
  }
  return "";
}

function uniqueOptions(options) {
  const seen = new Set();
  return options.filter((option) => {
    if (!option?.value || seen.has(option.value)) return false;
    seen.add(option.value);
    return true;
  });
}

function readCliOptions() {
  const codexConfigPath = path.join(os.homedir(), ".codex/config.toml");
  const codexModelsPath = path.join(os.homedir(), ".codex/models_cache.json");
  const claudeSettingsPath = path.join(os.homedir(), ".claude/settings.json");
  const codexConfigModel = readTomlValue(codexConfigPath, "model");
  const codexConfigEffort = readTomlValue(codexConfigPath, "model_reasoning_effort");
  const codexCache = readJsonIfExists(codexModelsPath);
  const codexModels = uniqueOptions(
    (codexCache?.models || []).map((model) => ({
      value: model.slug,
      label: model.display_name || model.slug,
      defaultEffort: model.default_reasoning_level || "",
      efforts: (model.supported_reasoning_levels || []).map((level) => level.effort).filter(Boolean)
    }))
  );

  if (codexConfigModel && !codexModels.some((model) => model.value === codexConfigModel)) {
    codexModels.unshift({ value: codexConfigModel, label: codexConfigModel, defaultEffort: codexConfigEffort, efforts: [] });
  }

  const codexEfforts = [...new Set(codexModels.flatMap((model) => model.efforts || []))];
  if (codexConfigEffort && !codexEfforts.includes(codexConfigEffort)) codexEfforts.unshift(codexConfigEffort);

  const claudeSettings = readJsonIfExists(claudeSettingsPath) || {};
  const claudeConfigModel = typeof claudeSettings.model === "string" ? claudeSettings.model : "";
  const claudeModels = claudeConfigModel ? [{ value: claudeConfigModel, label: claudeConfigModel, defaultEffort: "", efforts: [] }] : [];

  return {
    providers: {
      codex: {
        defaultModel: codexConfigModel,
        defaultEffort: codexConfigEffort,
        models: codexModels,
        efforts: codexEfforts
      },
      claude: {
        defaultModel: claudeConfigModel,
        defaultEffort: "",
        models: claudeModels,
        efforts: []
      }
    }
  };
}

function readDb() {
  ensureDataDir();
  try {
    return JSON.parse(fs.readFileSync(dbPath, "utf8"));
  } catch {
    return { tasks: [] };
  }
}

function writeDb(db) {
  ensureDataDir();
  const tempPath = `${dbPath}.tmp`;
  fs.writeFileSync(tempPath, JSON.stringify(db, null, 2));
  fs.renameSync(tempPath, dbPath);
}

function recoverInterruptedTasks() {
  const db = readDb();
  let changed = false;
  for (const task of db.tasks) {
    if (task.status !== "running") continue;
    task.status = "review";
    task.exitCode = null;
    task.answer = task.answer || "Cinder was restarted while this task was running, so the CLI process is no longer attached.";
    task.log += "\n[interrupted] Cinder restarted before this task finished.\n";
    task.updatedAt = now();
    changed = true;
  }
  if (changed) writeDb(db);
}

function updateTask(taskId, updater) {
  const db = readDb();
  const task = db.tasks.find((item) => item.id === taskId);
  if (!task) return null;
  updater(task);
  task.updatedAt = now();
  writeDb(db);
  return task;
}

function moveTaskToEnd(db, taskId) {
  const index = db.tasks.findIndex((task) => task.id === taskId);
  if (index === -1) return null;
  const [task] = db.tasks.splice(index, 1);
  db.tasks.push(task);
  return task;
}

function imageExtension(type, name = "") {
  const ext = path.extname(name).toLowerCase();
  if ([".png", ".jpg", ".jpeg", ".webp", ".gif"].includes(ext)) return ext;
  if (type === "image/jpeg") return ".jpg";
  if (type === "image/webp") return ".webp";
  if (type === "image/gif") return ".gif";
  return ".png";
}

function saveImages(taskId, images = []) {
  if (!Array.isArray(images) || !images.length) return [];
  const taskDir = path.join(attachmentsDir, taskId);
  fs.mkdirSync(taskDir, { recursive: true });
  const prefix = Date.now().toString(36);
  return images.map((image, index) => {
    if (!String(image?.type || "").startsWith("image/")) throw new Error("Only image attachments are supported.");
    const [, base64 = ""] = String(image.data || "").split(",");
    const buffer = Buffer.from(base64, "base64");
    if (!buffer.length) throw new Error("Invalid image attachment.");
    if (buffer.length > 12_000_000) throw new Error("Image attachment is too large.");
    const filePath = path.join(taskDir, `${prefix}-${String(index + 1).padStart(2, "0")}${imageExtension(image.type, image.name)}`);
    fs.writeFileSync(filePath, buffer, { mode: 0o600 });
    return filePath;
  });
}

function createTask(input) {
  const db = readDb();
  const task = {
    id: crypto.randomUUID(),
    provider: input.provider,
    cwd: input.cwd || os.homedir(),
    model: input.model || "",
    effort: input.effort || "",
    permission: input.permission || "",
    sandbox: input.sandbox || "",
    approval: input.approval || "",
    lastPrompt: input.prompt.trim(),
    answer: "",
    log: "",
    status: "running",
    deferredCount: 0,
    queuedContinuations: [],
    createdAt: now(),
    updatedAt: now(),
    completedAt: null,
    commandPreview: ""
  };
  const imagePaths = saveImages(task.id, input.images);
  db.tasks.push(task);
  writeDb(db);
  runTask(task, task.lastPrompt, imagePaths);
  return task;
}

function appendLog(taskId, chunk) {
  updateTask(taskId, (task) => {
    task.log += chunk;
    if (task.log.length > 400000) {
      task.log = task.log.slice(-300000);
    }
  });
}

function buildCommand(task, prompt, images = []) {
  if (task.provider === "claude") {
    if (images.length) {
      prompt = `${prompt}\n\nAttached images:\n${images.map((imagePath) => `@${imagePath}`).join("\n")}`;
    }
    const args = ["-p", prompt, "--output-format", "text"];
    if (task.model) args.push("--model", task.model);
    if (task.effort) args.push("--effort", task.effort);
    if (task.permission) args.push("--permission-mode", task.permission);
    return { command: "claude", args };
  }

  const args = ["exec", "-C", task.cwd];
  for (const imagePath of images) args.push("-i", imagePath);
  if (task.model) args.push("-m", task.model);
  args.push("--skip-git-repo-check");
  if (task.sandbox) args.push("-s", task.sandbox);
  if (task.approval) args.push("-a", task.approval);
  args.push(prompt);
  return { command: "codex", args };
}

function buildContinuationPrompt(task, prompt, previousPrompt = task.lastPrompt) {
  return [
    "Continue this existing AI coding task.",
    "",
    "Previous user request:",
    previousPrompt || "(none)",
    "",
    "Previous agent answer:",
    task.answer || "(none)",
    "",
    "New user request:",
    prompt.trim()
  ].join("\n");
}

function queueContinuation(task, prompt, input, imagePaths) {
  const db = readDb();
  const current = db.tasks.find((item) => item.id === task.id) || task;
  const queuedContinuations = Array.isArray(current.queuedContinuations) ? current.queuedContinuations : [];
  const previousPrompt = queuedContinuations.length ? queuedContinuations[queuedContinuations.length - 1].prompt : current.lastPrompt;
  const queued = {
    prompt: prompt.trim(),
    previousPrompt,
    model: input.model || "",
    effort: input.effort || "",
    imagePaths,
    createdAt: now()
  };
  current.queuedContinuations = queuedContinuations.concat(queued);
  current.lastPrompt = queued.prompt;
  current.log += `\n[queued continuation] ${queued.prompt}\n`;
  current.updatedAt = now();
  moveTaskToEnd(db, task.id);
  writeDb(db);
  return current;
}

function startNextQueuedContinuation(taskId) {
  const db = readDb();
  const task = db.tasks.find((item) => item.id === taskId);
  if (!task || !Array.isArray(task.queuedContinuations) || !task.queuedContinuations.length) return false;
  const [queued, ...rest] = task.queuedContinuations;
  task.queuedContinuations = rest;
  task.lastPrompt = queued.prompt;
  task.model = queued.model || "";
  task.effort = queued.effort || "";
  task.status = "running";
  task.updatedAt = now();
  writeDb(db);
  const continuationPrompt = buildContinuationPrompt(task, queued.prompt, queued.previousPrompt);
  runTask(task, continuationPrompt, queued.imagePaths || []);
  return true;
}

function runTask(task, prompt, images = []) {
  const { command, args } = buildCommand(task, prompt, images);
  const commandPreview = [command, ...args.map((arg) => (arg.includes(" ") ? JSON.stringify(arg) : arg))].join(" ");
  updateTask(task.id, (item) => {
    item.status = "running";
    item.answer = "";
    item.commandPreview = commandPreview;
    item.log += `\n\n$ ${commandPreview}\n`;
  });

  let stdout = "";
  let stderr = "";
  const child = spawn(command, args, {
    cwd: task.cwd,
    env: process.env,
    stdio: ["ignore", "pipe", "pipe"]
  });

  activeProcesses.set(task.id, child);

  child.stdout.on("data", (data) => {
    const text = data.toString();
    stdout += text;
    appendLog(task.id, text);
  });

  child.stderr.on("data", (data) => {
    const text = data.toString();
    stderr += text;
    appendLog(task.id, text);
  });

  child.on("error", (error) => {
    activeProcesses.delete(task.id);
    updateTask(task.id, (item) => {
      item.status = "review";
      item.answer = `Failed to start ${command}: ${error.message}`;
      item.log += `\n[process error] ${error.stack || error.message}\n`;
    });
  });

  child.on("close", (code) => {
    activeProcesses.delete(task.id);
    const answer = stdout.trim() || stderr.trim() || `(No output. Exit code: ${code})`;
    const latest = readDb().tasks.find((item) => item.id === task.id);
    if (latest?.status === "done" || latest?.status === "suspended") return;
    updateTask(task.id, (item) => {
      item.status = "review";
      item.answer = answer;
      item.exitCode = code;
      item.log += `\n[process exited with code ${code}]\n`;
    });
    startNextQueuedContinuation(task.id);
  });
}

function continueTask(taskId, prompt, input = {}) {
  if (!prompt?.trim()) throw new Error("Prompt is required.");
  const original = readDb().tasks.find((item) => item.id === taskId);
  if (!original) throw new Error("Task not found.");
  const imagePaths = saveImages(taskId, input.images);
  if (original.status === "running" && activeProcesses.has(taskId)) {
    return queueContinuation(original, prompt, input, imagePaths);
  }
  const continuationPrompt = buildContinuationPrompt(original, prompt);
  const task = updateTask(taskId, (item) => {
    item.lastPrompt = prompt.trim();
    item.model = input.model || "";
    item.effort = input.effort || "";
    item.status = "running";
  });
  if (!task) throw new Error("Task not found.");
  const db = readDb();
  moveTaskToEnd(db, taskId);
  writeDb(db);
  runTask(task, continuationPrompt, imagePaths);
  return task;
}

function laterTask(taskId) {
  const db = readDb();
  const task = moveTaskToEnd(db, taskId);
  if (!task) throw new Error("Task not found.");
  const child = activeProcesses.get(taskId);
  if (child) {
    activeProcesses.delete(taskId);
    child.kill();
  }
  task.status = "suspended";
  task.deferredCount += 1;
  task.updatedAt = now();
  writeDb(db);
  return task;
}

function completeTask(taskId) {
  const child = activeProcesses.get(taskId);
  if (child) {
    child.kill();
    activeProcesses.delete(taskId);
  }
  const task = updateTask(taskId, (item) => {
    item.status = "done";
    item.completedAt = now();
    item.queuedContinuations = [];
  });
  if (!task) throw new Error("Task not found.");
  return task;
}

function searchTasks(query) {
  const needle = String(query || "").toLowerCase().trim();
  const tasks = readDb().tasks.filter((task) => task.status === "done");
  if (!needle) return tasks.slice(0, 20);
  return tasks
    .filter((task) =>
      [task.lastPrompt, task.answer, task.cwd, task.provider, task.model].join("\n").toLowerCase().includes(needle)
    )
    .slice(0, 20);
}

function resumeTask(taskId, prompt) {
  const original = readDb().tasks.find((task) => task.id === taskId);
  if (!original) throw new Error("Task not found.");
  const resumePrompt = [
    "Resume a completed AI coding task.",
    "",
    "Original user request:",
    original.lastPrompt,
    "",
    "Original agent answer:",
    original.answer,
    "",
    "New request:",
    prompt?.trim() || "Continue from this completed task."
  ].join("\n");
  return createTask({ ...original, prompt: resumePrompt });
}

function getLanAddress() {
  for (const addresses of Object.values(os.networkInterfaces())) {
    for (const address of addresses || []) {
      if (address.family === "IPv4" && !address.internal) return address.address;
    }
  }
  return "127.0.0.1";
}

function isLocalRequest(request) {
  const remote = request.socket.remoteAddress || "";
  return remote === "127.0.0.1" || remote === "::1" || remote === "::ffff:127.0.0.1";
}

function authorize(request) {
  if (isLocalRequest(request)) return true;
  const expected = readConfig().pairingToken;
  const requestUrl = new URL(request.url, "http://cinder.local");
  const token = request.headers["x-cinder-token"] || requestUrl.searchParams.get("token");
  return token === expected;
}

function readBody(request) {
  return new Promise((resolve, reject) => {
    let body = "";
    request.on("data", (chunk) => {
      body += chunk;
      if (body.length > 30_000_000) {
        reject(new Error("Request body is too large."));
        request.destroy();
      }
    });
    request.on("end", () => {
      if (!body) return resolve({});
      try {
        resolve(JSON.parse(body));
      } catch {
        reject(new Error("Invalid JSON body."));
      }
    });
    request.on("error", reject);
  });
}

function sendJson(response, status, data) {
  response.writeHead(status, {
    "content-type": "application/json; charset=utf-8",
    "cache-control": "no-store"
  });
  response.end(JSON.stringify(data));
}

function sendError(response, error, status = 400) {
  sendJson(response, status, { error: error.message || String(error) });
}

function contentType(filePath) {
  if (filePath.endsWith(".html")) return "text/html; charset=utf-8";
  if (filePath.endsWith(".js")) return "text/javascript; charset=utf-8";
  if (filePath.endsWith(".css")) return "text/css; charset=utf-8";
  if (filePath.endsWith(".json")) return "application/json; charset=utf-8";
  if (filePath.endsWith(".svg")) return "image/svg+xml";
  return "application/octet-stream";
}

function sendStatic(request, response) {
  const requestUrl = new URL(request.url, "http://cinder.local");
  let pathname = decodeURIComponent(requestUrl.pathname);
  if (pathname === "/") pathname = "/index.html";
  const filePath = path.normalize(path.join(webDir, pathname));
  if (!filePath.startsWith(webDir)) {
    response.writeHead(403);
    response.end("Forbidden");
    return;
  }
  if (!fs.existsSync(filePath) || !fs.statSync(filePath).isFile()) {
    response.writeHead(404);
    response.end("Not found");
    return;
  }
  response.writeHead(200, {
    "content-type": contentType(filePath),
    "cache-control": "no-store"
  });
  fs.createReadStream(filePath).pipe(response);
}

async function handleApi(request, response) {
  if (!authorize(request)) {
    sendJson(response, 401, { error: "Unauthorized. Open Cinder from the paired URL shown on the Mac." });
    return;
  }

  const requestUrl = new URL(request.url, "http://cinder.local");
  const method = request.method || "GET";

  try {
    if (method === "GET" && requestUrl.pathname === "/api/tasks") return sendJson(response, 200, readDb().tasks);
    if (method === "GET" && requestUrl.pathname === "/api/status") {
      const token = readConfig().pairingToken;
      const lanAddress = getLanAddress();
      return sendJson(response, 200, {
        ok: true,
        dataDir,
        dbPath,
        localUrl: "http://127.0.0.1:3737/",
        lanAddress,
        lanUrl: `http://${lanAddress}:3737/?token=${encodeURIComponent(token)}`
      });
    }
    if (method === "GET" && requestUrl.pathname === "/api/options") return sendJson(response, 200, readCliOptions());
    if (method === "GET" && requestUrl.pathname === "/api/tasks/search") {
      return sendJson(response, 200, searchTasks(requestUrl.searchParams.get("q")));
    }

    if (method === "POST" && requestUrl.pathname === "/api/tasks") {
      const input = await readBody(request);
      if (!input?.prompt?.trim()) throw new Error("Prompt is required.");
      return sendJson(response, 200, createTask(input));
    }

    const taskAction = requestUrl.pathname.match(/^\/api\/tasks\/([^/]+)\/(continue|later|complete|resume)$/);
    if (method === "POST" && taskAction) {
      const [, taskId, action] = taskAction;
      const input = await readBody(request);
      if (action === "continue") return sendJson(response, 200, continueTask(taskId, input.prompt, input));
      if (action === "later") return sendJson(response, 200, laterTask(taskId));
      if (action === "complete") return sendJson(response, 200, completeTask(taskId));
      if (action === "resume") return sendJson(response, 200, resumeTask(taskId, input.prompt));
    }

    sendJson(response, 404, { error: "Unknown API route." });
  } catch (error) {
    sendError(response, error);
  }
}

export function startServer(options = {}) {
  ensureDataDir();
  recoverInterruptedTasks();
  const host = options.host || process.env.CINDER_HOST || "127.0.0.1";
  const port = Number(options.port || process.env.CINDER_PORT || 3737);
  const server = http.createServer((request, response) => {
    if ((request.url || "").startsWith("/api/")) {
      handleApi(request, response);
      return;
    }
    sendStatic(request, response);
  });

  return new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(port, host, () => {
      const token = readConfig().pairingToken;
      const localUrl = `http://127.0.0.1:${port}/`;
      const lanUrl = `http://${getLanAddress()}:${port}/?token=${encodeURIComponent(token)}`;
      resolve({ server, host, port, localUrl, lanUrl, dataDir, dbPath });
    });
  });
}
