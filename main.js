const { app, BrowserWindow, ipcMain, dialog, shell } = require("electron");
const path = require("path");
const fs = require("fs");

const JOB_FILTERS = [{ name: "Cab Lab job", extensions: ["json"] }];

// --- usage log ---------------------------------------------------------------
// logs/usage.jsonl   append-only, rotated at 5 MB to usage.1.jsonl
// logs/latest.json   last action + last error, for a quick first read
// logs/crash-*.json  full job + cursor trace written by the renderer on errors
const LOG_DIR = path.join(__dirname, "logs");
const LOG_FILE = path.join(LOG_DIR, "usage.jsonl");
const LATEST_FILE = path.join(LOG_DIR, "latest.json");
const LOG_MAX_BYTES = 5 * 1024 * 1024;
const APP_VERSION = (() => { try { return require("./package.json").version; } catch (_) { return app.getVersion(); } })();
const latest = { session: new Date().toISOString(), appVersion: APP_VERSION, electron: process.versions.electron, lastAction: null, lastError: null, count: 0 };

function ensureLogDir() {
  try { fs.mkdirSync(LOG_DIR, { recursive: true }); } catch (_) { /* ignore */ }
}

function rotateIfNeeded() {
  try {
    const st = fs.statSync(LOG_FILE);
    if (st.size > LOG_MAX_BYTES) fs.renameSync(LOG_FILE, path.join(LOG_DIR, "usage.1.jsonl"));
  } catch (_) { /* no file yet */ }
}

function appendLog(line) {
  ensureLogDir();
  rotateIfNeeded();
  fs.appendFile(LOG_FILE, line + "\n", () => {});
  try {
    const entry = JSON.parse(line);
    latest.count += 1;
    if (entry.kind === "error" || entry.kind === "console.error") latest.lastError = entry;
    else latest.lastAction = entry;
    fs.writeFile(LATEST_FILE, JSON.stringify(latest, null, 2), () => {});
  } catch (_) { /* malformed line: still appended */ }
}

ipcMain.handle("log:append", (_event, line) => { appendLog(String(line)); });
ipcMain.handle("log:dump", (_event, text) => {
  ensureLogDir();
  const file = path.join(LOG_DIR, `crash-${new Date().toISOString().replace(/[:.]/g, "-")}.json`);
  fs.writeFileSync(file, String(text), "utf8");
  return file;
});
ipcMain.handle("log:open", () => {
  ensureLogDir();
  return shell.openPath(LOG_DIR);
});

ipcMain.handle("job:open", async (event) => {
  const win = BrowserWindow.fromWebContents(event.sender);
  const res = await dialog.showOpenDialog(win, { properties: ["openFile"], filters: JOB_FILTERS });
  if (res.canceled || !res.filePaths.length) return null;
  const filePath = res.filePaths[0];
  return { path: filePath, text: fs.readFileSync(filePath, "utf8") };
});

ipcMain.handle("job:save", async (event, filePath, text) => {
  const win = BrowserWindow.fromWebContents(event.sender);
  let target = filePath;
  if (!target) {
    const res = await dialog.showSaveDialog(win, { defaultPath: "job.json", filters: JOB_FILTERS });
    if (res.canceled || !res.filePath) return null;
    target = res.filePath;
  }
  fs.writeFileSync(target, text, "utf8");
  return target;
});

function createWindow() {
  const win = new BrowserWindow({
    width: 1280,
    height: 800,
    minWidth: 800,
    minHeight: 560,
    title: "The Cab Lab",
    backgroundColor: "#1a1c1f",
    autoHideMenuBar: true,
    webPreferences: {
      preload: path.join(__dirname, "preload.js"),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });

  win.webContents.on("console-message", function (event, legacyLevel, legacyMessage) {
    // Electron >= 36 passes a params object; older versions pass (event, level, message).
    const level = event && typeof event.level === "string" ? event.level : legacyLevel;
    const message = event && typeof event.message === "string" ? event.message : legacyMessage;
    if (level === "error" || level === "warning" || (typeof level === "number" && level >= 2)) {
      console.error("[renderer]", message);
    }
  });
  win.webContents.on("did-fail-load", (_event, code, desc) => {
    console.error("did-fail-load", code, desc);
  });
  win.webContents.on("before-input-event", (_event, input) => {
    if (input.type === "keyDown" && input.key === "F12") {
      win.webContents.toggleDevTools();
    }
  });

  win.loadFile(path.join(__dirname, "renderer", "index.html"));
}

app.whenReady().then(createWindow);

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") {
    app.quit();
  }
});

app.on("activate", () => {
  if (BrowserWindow.getAllWindows().length === 0) {
    createWindow();
  }
});
