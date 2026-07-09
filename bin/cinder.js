#!/usr/bin/env node
import { spawn, spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { startServer } from "../src/host/server.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.resolve(__dirname, "..");
const command = process.argv[2] || "host";
const args = process.argv.slice(3);

function printHelp() {
  console.log(`Cinder

Usage:
  cinder                 Start Cinder on this Mac and open the local UI
  cinder host            Start Cinder host
  cinder host --lan      Start Cinder host on your LAN for iPhone/iPad
  cinder doctor          Check local setup
  cinder logs            Print local task database path
  cinder install-ponytail Install Ponytail for Claude Code and Codex
  cinder help            Show this help
`);
}

function run(commandName, args, options = {}) {
  return spawnSync(commandName, args, {
    stdio: options.stdio || "pipe",
    encoding: "utf8",
    ...options
  });
}

function exists(commandName) {
  const result = run("which", [commandName]);
  return result.status === 0 ? result.stdout.trim() : "";
}

function doctor() {
  const checks = [
    ["node", process.version],
    ["npm", exists("npm") || "missing"],
    ["git", exists("git") || "missing"],
    ["claude", exists("claude") || "missing"],
    ["codex", exists("codex") || "missing"]
  ];

  console.log("Cinder doctor\n");
  for (const [name, value] of checks) {
    const ok = value !== "missing";
    console.log(`${ok ? "OK " : "NO "} ${name}: ${value}`);
  }

  const codexConfig = path.join(os.homedir(), ".codex/config.toml");
  const claudeSettings = path.join(os.homedir(), ".claude/settings.json");
  console.log(`\nData: ${path.join(os.homedir(), ".cinder")}`);
  console.log(`Repo: ${rootDir}`);
  console.log(`${fs.existsSync(claudeSettings) ? "OK " : "NO "} Claude settings: ${claudeSettings}`);
  console.log(`${fs.existsSync(codexConfig) ? "OK " : "NO "} Codex config: ${codexConfig}`);
  console.log("\nRun: cinder");
  console.log("Phone/iPad on same Wi-Fi: cinder host --lan");

  if (!exists("claude") || !exists("codex")) {
    process.exitCode = 1;
  }
}

function openUrl(url) {
  if (process.platform === "darwin") {
    spawn("open", [url], { detached: true, stdio: "ignore" }).unref();
    return;
  }
  if (process.platform === "win32") {
    spawn("cmd", ["/c", "start", "", url], { detached: true, stdio: "ignore" }).unref();
    return;
  }
  spawn("xdg-open", [url], { detached: true, stdio: "ignore" }).unref();
}

async function host() {
  const lan = args.includes("--lan");
  const noOpen = args.includes("--no-open");
  const portArg = args.find((arg) => arg.startsWith("--port="));
  const port = portArg ? Number(portArg.split("=")[1]) : undefined;
  const result = await startServer({
    host: lan ? "0.0.0.0" : "127.0.0.1",
    port
  });

  console.log("Cinder is running\n");
  console.log(`Local: ${result.localUrl}`);
  if (lan) {
    console.log(`Phone/iPad: ${result.lanUrl}`);
  } else {
    console.log("Phone/iPad: restart with `cinder host --lan` to allow same-Wi-Fi devices.");
  }
  console.log(`Data: ${result.dbPath}`);
  console.log("\nPress Ctrl+C to stop Cinder.");

  if (!noOpen) openUrl(result.localUrl);
}

function logs() {
  console.log(path.join(os.homedir(), ".cinder/tasks.json"));
}

function installPonytail() {
  const commands = [
    ["claude", ["plugin", "marketplace", "add", "https://github.com/DietrichGebert/ponytail"]],
    ["claude", ["plugin", "install", "ponytail@ponytail"]],
    ["codex", ["plugin", "marketplace", "add", "https://github.com/DietrichGebert/ponytail"]],
    ["codex", ["plugin", "add", "ponytail@ponytail"]]
  ];

  for (const [name, args] of commands) {
    console.log(`$ ${name} ${args.join(" ")}`);
    const result = run(name, args, { stdio: "inherit" });
    if (result.status !== 0) process.exit(result.status || 1);
  }

  console.log("\nPonytail installed. For Codex, open the TUI, run /hooks, review and trust the Ponytail lifecycle hooks.");
}

switch (command) {
  case "doctor":
    doctor();
    break;
  case "host":
  case "open":
    host().catch((error) => {
      console.error(`Failed to start Cinder: ${error.message}`);
      process.exitCode = 1;
    });
    break;
  case "logs":
    logs();
    break;
  case "install-ponytail":
    installPonytail();
    break;
  case "help":
  case "--help":
  case "-h":
    printHelp();
    break;
  default:
    console.error(`Unknown command: ${command}\n`);
    printHelp();
    process.exitCode = 1;
}
