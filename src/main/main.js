import { app, BrowserWindow, ipcMain, shell } from "electron";
import { spawn } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.resolve(__dirname, "../..");
const rendererPath = path.join(rootDir, "src/renderer/index.html");

const dataDir = path.join(os.homedir(), ".cinder");
const dbPath = path.join(dataDir, "tasks.json");
const activeProcesses = new Map();

function now() {
  return new Date().toISOString();
}

function ensureDataDir() {
  fs.mkdirSync(dataDir, { recursive: true });
  if (!fs.existsSync(dbPath)) {
    fs.writeFileSync(dbPath, JSON.stringify({ tasks: [] }, null, 2));
  }
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

function createWindow() {
  const win = new BrowserWindow({
    width: 1180,
    height: 800,
    minWidth: 920,
    minHeight: 680,
    title: "Cinder",
    backgroundColor: "#101114",
    webPreferences: {
      preload: path.join(__dirname, "preload.js"),
      contextIsolation: true,
      nodeIntegration: false
    }
  });

  win.loadFile(rendererPath);
}

ipcMain.handle("tasks:list", () => readDb().tasks);

ipcMain.handle("tasks:create", (_event, input) => {
  if (!input?.prompt?.trim()) throw new Error("Prompt is required.");
  return createTask(input);
});

ipcMain.handle("tasks:continue", (_event, taskId, prompt) => {
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
});

ipcMain.handle("tasks:later", (_event, taskId) => {
  const db = readDb();
  const index = db.tasks.findIndex((task) => task.id === taskId);
  if (index === -1) throw new Error("Task not found.");
  const [task] = db.tasks.splice(index, 1);
  task.deferredCount += 1;
  task.updatedAt = now();
  db.tasks.push(task);
  writeDb(db);
  return task;
});

ipcMain.handle("tasks:complete", (_event, taskId) => {
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
});

ipcMain.handle("tasks:search", (_event, query) => {
  const needle = String(query || "").toLowerCase().trim();
  const tasks = readDb().tasks.filter((task) => task.status === "done");
  if (!needle) return tasks.slice(0, 20);
  return tasks
    .filter((task) => {
      return [task.lastPrompt, task.answer, task.cwd, task.provider, task.model]
        .join("\n")
        .toLowerCase()
        .includes(needle);
    })
    .slice(0, 20);
});

ipcMain.handle("tasks:resume", (_event, taskId, prompt) => {
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
  return createTask({
    ...original,
    prompt: resumePrompt
  });
});

ipcMain.handle("app:open-path", (_event, filePath) => {
  return shell.openPath(filePath);
});

app.whenReady().then(() => {
  ensureDataDir();
  createWindow();
  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") app.quit();
});
