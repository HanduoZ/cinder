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
const dataDir = path.join(os.homedir(), ".cinder");
const dbPath = path.join(dataDir, "tasks.json");
const configPath = path.join(dataDir, "config.json");
const activeProcesses = new Map();

function now() {
  return new Date().toISOString();
}

function ensureDataDir() {
  fs.mkdirSync(dataDir, { recursive: true });
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

function updateTask(taskId, updater) {
  const db = readDb();
  const task = db.tasks.find((item) => item.id === taskId);
  if (!task) return null;
  updater(task);
  task.updatedAt = now();
  writeDb(db);
  return task;
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
    sandbox: input.sandbox || "workspace-write",
    approval: input.approval || "on-request",
    lastPrompt: input.prompt.trim(),
    answer: "",
    log: "",
    status: "running",
    deferredCount: 0,
    createdAt: now(),
    updatedAt: now(),
    completedAt: null,
    commandPreview: ""
  };
  db.tasks.unshift(task);
  writeDb(db);
  runTask(task, task.lastPrompt);
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

function buildCommand(task, prompt) {
  if (task.provider === "claude") {
    const args = ["-p", prompt, "--output-format", "text"];
    if (task.model) args.push("--model", task.model);
    if (task.effort) args.push("--effort", task.effort);
    if (task.permission) args.push("--permission-mode", task.permission);
    return { command: "claude", args };
  }

  const args = ["exec", "-C", task.cwd];
  if (task.model) args.push("-m", task.model);
  if (task.sandbox) args.push("-s", task.sandbox);
  if (task.approval) args.push("-a", task.approval);
  args.push(prompt);
  return { command: "codex", args };
}

function runTask(task, prompt) {
  const { command, args } = buildCommand(task, prompt);
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
    updateTask(task.id, (item) => {
      item.status = "review";
      item.answer = answer;
      item.exitCode = code;
      item.log += `\n[process exited with code ${code}]\n`;
    });
  });
}

function continueTask(taskId, prompt) {
  if (!prompt?.trim()) throw new Error("Prompt is required.");
  const original = readDb().tasks.find((item) => item.id === taskId);
  if (!original) throw new Error("Task not found.");
  const continuationPrompt = [
    "Continue this existing AI coding task.",
    "",
    "Previous user request:",
    original.lastPrompt,
    "",
    "Previous agent answer:",
    original.answer || "(none)",
    "",
    "New user request:",
    prompt.trim()
  ].join("\n");
  const task = updateTask(taskId, (item) => {
    item.lastPrompt = prompt.trim();
    item.status = "running";
  });
  if (!task) throw new Error("Task not found.");
  runTask(task, continuationPrompt);
  return task;
}

function laterTask(taskId) {
  const db = readDb();
  const index = db.tasks.findIndex((task) => task.id === taskId);
  if (index === -1) throw new Error("Task not found.");
  const [task] = db.tasks.splice(index, 1);
  task.deferredCount += 1;
  task.updatedAt = now();
  db.tasks.push(task);
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
      if (body.length > 2_000_000) {
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
      return sendJson(response, 200, {
        ok: true,
        dataDir,
        dbPath,
        localUrl: null,
        lanAddress: getLanAddress()
      });
    }
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
      if (action === "continue") return sendJson(response, 200, continueTask(taskId, input.prompt));
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
