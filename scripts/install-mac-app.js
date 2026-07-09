#!/usr/bin/env node
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.resolve(__dirname, "..");
const appDir = path.join(os.homedir(), "Applications", "Cinder.app");
const contentsDir = path.join(appDir, "Contents");
const macosDir = path.join(contentsDir, "MacOS");
const resourcesDir = path.join(contentsDir, "Resources");
const swiftPath = path.join(resourcesDir, "CinderApp.swift");
const startHostPath = path.join(resourcesDir, "start-host.sh");

if (process.platform !== "darwin") {
  process.exit(0);
}

fs.rmSync(appDir, { recursive: true, force: true });
fs.mkdirSync(macosDir, { recursive: true });
fs.mkdirSync(resourcesDir, { recursive: true });

const plist = `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>CFBundleName</key>
  <string>Cinder</string>
  <key>CFBundleDisplayName</key>
  <string>Cinder</string>
  <key>CFBundleIdentifier</key>
  <string>life.cinder.local</string>
  <key>CFBundleVersion</key>
  <string>0.1.0</string>
  <key>CFBundleShortVersionString</key>
  <string>0.1.0</string>
  <key>CFBundleExecutable</key>
  <string>Cinder</string>
  <key>CFBundlePackageType</key>
  <string>APPL</string>
  <key>CFBundleInfoDictionaryVersion</key>
  <string>6.0</string>
  <key>LSApplicationCategoryType</key>
  <string>public.app-category.developer-tools</string>
  <key>LSMinimumSystemVersion</key>
  <string>12.0</string>
  <key>NSHighResolutionCapable</key>
  <true/>
</dict>
</plist>
`;

const swiftSource = `import Cocoa
import WebKit

final class AppDelegate: NSObject, NSApplicationDelegate, WKNavigationDelegate {
  private var window: NSWindow!
  private var webView: WKWebView!
  private var hostProcess: Process?
  private let rootDir = ${JSON.stringify(rootDir)}
  private let startHostPath = ${JSON.stringify(startHostPath)}
  private let appLogPath = "\\(NSHomeDirectory())/.cinder/CinderApp.log"
  private let cinderURL = URL(string: "http://127.0.0.1:3737/")!
  private let statusURL = URL(string: "http://127.0.0.1:3737/api/status")!

  func applicationDidFinishLaunching(_ notification: Notification) {
    NSApp.setActivationPolicy(.regular)
    createWindow()
    log("app launched")
    startHostIfNeeded()
    loadWhenReady(remainingAttempts: 80)
  }

  func applicationShouldTerminateAfterLastWindowClosed(_ sender: NSApplication) -> Bool {
    true
  }

  func applicationWillTerminate(_ notification: Notification) {
    if let process = hostProcess, process.isRunning {
      process.terminate()
    }
  }

  private func createWindow() {
    let config = WKWebViewConfiguration()
    config.websiteDataStore = .default()
    webView = WKWebView(frame: .zero, configuration: config)
    webView.navigationDelegate = self
    webView.loadHTMLString("""
      <!doctype html>
      <html>
        <head>
          <meta name="viewport" content="width=device-width, initial-scale=1">
          <style>
            html, body { height: 100%; margin: 0; background: #0e1117; color: #f5f7fb; font: 16px -apple-system, BlinkMacSystemFont, sans-serif; }
            body { display: grid; place-items: center; }
            main { width: min(420px, calc(100vw - 48px)); }
            h1 { margin: 0 0 10px; font-size: 22px; letter-spacing: 0; }
            p { margin: 0; color: #a8b0bf; line-height: 1.5; }
          </style>
        </head>
        <body><main><h1>Starting Cinder</h1><p>Opening the local review flow on this Mac.</p></main></body>
      </html>
    """, baseURL: nil)

    window = NSWindow(
      contentRect: NSRect(x: 0, y: 0, width: 1180, height: 800),
      styleMask: [.titled, .closable, .miniaturizable, .resizable],
      backing: .buffered,
      defer: false
    )
    window.title = "Cinder"
    window.minSize = NSSize(width: 920, height: 680)
    window.center()
    window.contentView = webView
    window.makeKeyAndOrderFront(nil)
    NSApp.activate(ignoringOtherApps: true)
  }

  private func startHostIfNeeded() {
    if hostIsRunning() {
      log("host already running")
      return
    }

    let process = Process()
    process.executableURL = URL(fileURLWithPath: "/bin/zsh")
    process.arguments = [startHostPath]
    process.currentDirectoryURL = URL(fileURLWithPath: rootDir)

    var env = ProcessInfo.processInfo.environment
    env["PATH"] = "/opt/homebrew/bin:/usr/local/bin:\\(NSHomeDirectory())/.local/bin:\\(NSHomeDirectory())/.npm-global/bin:" + (env["PATH"] ?? "")
    env["NO_PROXY"] = "127.0.0.1,localhost,::1," + (env["NO_PROXY"] ?? "")
    env["no_proxy"] = "127.0.0.1,localhost,::1," + (env["no_proxy"] ?? "")
    process.environment = env

    do {
      try process.run()
      hostProcess = process
      log("host process started with pid \\(process.processIdentifier)")
    } catch {
      log("host process failed: \\(error.localizedDescription)")
      showError("Could not start Cinder host: \\(error.localizedDescription)\\n\\nLogs: ~/.cinder/CinderHost.log")
    }
  }

  private func loadWhenReady(remainingAttempts: Int) {
    DispatchQueue.global(qos: .userInitiated).async {
      if self.hostIsRunning() {
        self.log("host ready; loading UI")
        DispatchQueue.main.async {
          self.webView.load(URLRequest(url: self.cinderURL, cachePolicy: .reloadIgnoringLocalCacheData))
        }
        return
      }

      if remainingAttempts <= 0 {
        self.log("host did not become ready")
        DispatchQueue.main.async {
          self.showError("Cinder host did not start.\\n\\nLogs: ~/.cinder/CinderHost.log")
        }
        return
      }

      DispatchQueue.main.asyncAfter(deadline: .now() + 0.25) {
        self.loadWhenReady(remainingAttempts: remainingAttempts - 1)
      }
    }
  }

  private func hostIsRunning() -> Bool {
    var request = URLRequest(url: statusURL)
    request.timeoutInterval = 0.25

    let semaphore = DispatchSemaphore(value: 0)
    var ok = false
    URLSession.shared.dataTask(with: request) { _, response, _ in
      if let http = response as? HTTPURLResponse, http.statusCode == 200 {
        ok = true
      }
      semaphore.signal()
    }.resume()

    _ = semaphore.wait(timeout: .now() + 0.35)
    return ok
  }

  private func log(_ message: String) {
    let dir = URL(fileURLWithPath: "\\(NSHomeDirectory())/.cinder")
    try? FileManager.default.createDirectory(at: dir, withIntermediateDirectories: true)
    let line = "[\\(Date())] \\(message)\\n"
    if let data = line.data(using: .utf8) {
      if FileManager.default.fileExists(atPath: appLogPath),
         let handle = try? FileHandle(forWritingTo: URL(fileURLWithPath: appLogPath)) {
        do {
          try handle.seekToEnd()
          try handle.write(contentsOf: data)
          try handle.close()
        } catch {
          try? handle.close()
        }
      } else {
        try? data.write(to: URL(fileURLWithPath: appLogPath))
      }
    }
  }

  private func showError(_ message: String) {
    let alert = NSAlert()
    alert.messageText = "Cinder"
    alert.informativeText = message
    alert.alertStyle = .critical
    alert.runModal()
  }
}

let app = NSApplication.shared
let delegate = AppDelegate()
app.delegate = delegate
app.run()
`;

fs.writeFileSync(path.join(contentsDir, "Info.plist"), plist);
fs.writeFileSync(
  startHostPath,
  `#!/bin/zsh
set -u

LOG_DIR="$HOME/.cinder"
LOG_FILE="$LOG_DIR/CinderHost.log"
ROOT_DIR=${JSON.stringify(rootDir)}

mkdir -p "$LOG_DIR"
{
  echo
  echo "[$(date '+%Y-%m-%dT%H:%M:%S%z')] starting Cinder host"
  echo "root: $ROOT_DIR"
  echo "path: $PATH"
} >> "$LOG_FILE"

cd "$ROOT_DIR" || {
  echo "[$(date '+%Y-%m-%dT%H:%M:%S%z')] could not cd to $ROOT_DIR" >> "$LOG_FILE"
  exit 1
}

export PATH="/opt/homebrew/bin:/usr/local/bin:$HOME/.local/bin:$HOME/.npm-global/bin:$PATH"
export NO_PROXY="127.0.0.1,localhost,::1,\${NO_PROXY:-}"
export no_proxy="127.0.0.1,localhost,::1,\${no_proxy:-}"

exec /usr/bin/env node "$ROOT_DIR/bin/cinder.js" host --no-open >> "$LOG_FILE" 2>&1
`
);
fs.chmodSync(startHostPath, 0o755);
fs.writeFileSync(swiftPath, swiftSource);

const swiftc = spawnSync(
  "/usr/bin/swiftc",
  ["-O", "-framework", "Cocoa", "-framework", "WebKit", swiftPath, "-o", path.join(macosDir, "Cinder")],
  { stdio: "inherit" }
);

if (swiftc.status !== 0) {
  throw new Error("Failed to compile Cinder.app. Make sure Xcode command line tools are installed.");
}

console.log(`Installed ${appDir}`);
