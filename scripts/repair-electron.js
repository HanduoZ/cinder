#!/usr/bin/env node
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.resolve(__dirname, "..");
const electronDir = path.join(rootDir, "node_modules/electron");
const electronPkgPath = path.join(electronDir, "package.json");
const pathTxt = path.join(electronDir, "path.txt");
const platformPath = "Electron.app/Contents/MacOS/Electron";
const executablePath = path.join(electronDir, "dist", platformPath);

if (!fs.existsSync(electronPkgPath)) {
  process.exit(0);
}

if (fs.existsSync(executablePath)) {
  fs.writeFileSync(pathTxt, platformPath);
  process.exit(0);
}

if (process.platform !== "darwin") {
  console.warn("Electron binary is missing. Run npm rebuild electron or reinstall dependencies.");
  process.exit(0);
}

const { version } = JSON.parse(fs.readFileSync(electronPkgPath, "utf8"));
const arch = process.arch === "arm64" ? "arm64" : "x64";
const zipName = `electron-v${version}-darwin-${arch}.zip`;
const cacheRoot = process.env.electron_config_cache || path.join(os.homedir(), "Library/Caches/electron");

function findZip(dir) {
  if (!fs.existsSync(dir)) return null;
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isFile() && entry.name === zipName) return fullPath;
    if (entry.isDirectory()) {
      const found = findZip(fullPath);
      if (found) return found;
    }
  }
  return null;
}

const zipPath = findZip(cacheRoot);
if (!zipPath) {
  console.warn(`Electron zip not found in ${cacheRoot}. Try: ELECTRON_MIRROR=https://npmmirror.com/mirrors/electron/ node node_modules/electron/install.js`);
  process.exit(0);
}

fs.mkdirSync(path.join(electronDir, "dist"), { recursive: true });
const unzip = spawnSync("unzip", ["-q", "-o", zipPath, "-d", path.join(electronDir, "dist")], {
  stdio: "inherit"
});

if (unzip.status !== 0) {
  console.warn(`Failed to unzip Electron from ${zipPath}`);
  process.exit(unzip.status || 1);
}

fs.writeFileSync(pathTxt, platformPath);
console.log(`Repaired Electron binary from ${zipPath}`);
