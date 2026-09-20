const { app, BrowserWindow, ipcMain, dialog, shell } = require("electron");
const path = require("path");
const fs = require("fs");

const JOB_FILTERS = [{ name: "Cab Lab job", extensions: ["json"] }];
const DXF_FILTERS = [{ name: "DXF drawing", extensions: ["dxf"] }];

// --- user settings -------------------------------------------------------------
// <userData>/settings.json: user defaults (e.g. the Vehicle space the dialog
// starts with). Written atomically (tmp + rename) the moment the user saves a
// default, so a crash or a kill never loses it or leaves half a file.
const SETTINGS_FILE = () => path.join(app.getPath("userData"), "settings.json");

ipcMain.handle("settings:read", () => {
  try {
    return { path: SETTINGS_FILE(), text: fs.readFileSync(SETTINGS_FILE(), "utf8") };
  } catch (err) {
    return { path: SETTINGS_FILE(), text: null, missing: err && err.code === "ENOENT", error: err && err.code !== "ENOENT" ? err.message : null };
  }
});
ipcMain.handle("settings:write", (_event, text) => {
  const file = SETTINGS_FILE();
  const tmp = `${file}.tmp`;
  try {
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(tmp, String(text), "utf8");
    fs.renameSync(tmp, file);
    return { ok: true, path: file };
  } catch (err) {
    try { fs.unlinkSync(tmp); } catch (_) { /* nothing to clean */ }
    return { ok: false, path: file, error: err.message };
  }
});

ipcMain.handle("dxf:open", async (event) => {
  const win = BrowserWindow.fromWebContents(event.sender);
  const res = await dialog.showOpenDialog(win, { properties: ["openFile"], filters: DXF_FILTERS });
  if (res.canceled || !res.filePaths.length) return null;
  const filePath = res.filePaths[0];
  return { path: filePath, text: fs.readFileSync(filePath, "utf8") };
});

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

// --- generator bench -----------------------------------------------------------
// Second window (renderer/bench) that shows one generator type per tab with
// the provenance of every board face / point. Developer tool: hidden unless
// opened from the rail context menu or CABLAB_BENCH=1. It writes only
// generators/<module>/rules.json, presets.json (pins), logs/bench/*.md and the
// usage log — never board geometry. See docs/bench-spec.md.
const GENERATORS_DIR = path.join(__dirname, "generators");
const BENCH_LOG_DIR = path.join(LOG_DIR, "bench");
let benchWin = null;
const benchQueue = [];

function generatorFile(moduleId, name) {
  if (!/^[A-Za-z][\w-]*$/.test(String(moduleId))) throw new Error(`bad module id: ${moduleId}`);
  return path.join(GENERATORS_DIR, moduleId, name);
}

function writeAtomic(file, text) {
  const tmp = `${file}.tmp`;
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(tmp, String(text), "utf8");
  fs.renameSync(tmp, file);
}

function createBenchWindow() {
  benchWin = new BrowserWindow({
    width: 1400,
    height: 860,
    minWidth: 960,
    minHeight: 600,
    title: "The Cab Lab — Generator bench",
    backgroundColor: "#1a1c1f",
    autoHideMenuBar: true,
    webPreferences: {
      preload: path.join(__dirname, "preload.js"),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });
  benchWin.webContents.on("console-message", function (event, legacyLevel, legacyMessage) {
    const level = event && typeof event.level === "string" ? event.level : legacyLevel;
    const message = event && typeof event.message === "string" ? event.message : legacyMessage;
    if (level === "error" || level === "warning" || (typeof level === "number" && level >= 2)) {
      console.error("[bench]", message);
    }
  });
  benchWin.webContents.on("before-input-event", (_event, input) => {
    if (input.type === "keyDown" && input.key === "F12") benchWin.webContents.toggleDevTools();
  });
  benchWin.on("closed", () => { benchWin = null; benchReady = false; });
  benchWin.webContents.on("did-start-loading", () => { benchReady = false; });
  benchWin.loadFile(path.join(__dirname, "renderer", "bench", "index.html"));
  return benchWin;
}

/** Open (or focus) the bench and ask it to show `moduleId` with optional params. */
function openBench(request) {
  const req = { moduleId: "overheadCabinet", params: null, from: "menu", ...(request || {}) };
  if (!benchWin) createBenchWindow();
  else if (benchWin.isMinimized()) benchWin.restore();
  benchWin.focus();
  benchQueue.push(req);
  flushBenchQueue();
}
// Requests wait until the bench script has registered its listener: it says so
// with bench:ready (module scripts run before did-finish-load, so isLoading()
// alone is not a usable signal).
let benchReady = false;
function flushBenchQueue(force = false) {
  if (!benchWin || (!benchReady && !force)) return;
  while (benchQueue.length) benchWin.webContents.send("bench:show", benchQueue.shift());
}

ipcMain.handle("bench:open", (_event, request) => { openBench(request); return true; });
// The bench tells us when it is ready to receive requests (after a load or a reload).
ipcMain.handle("bench:ready", () => { benchReady = true; flushBenchQueue(); return true; });

/** Modules that have a presets.json are bench-able. */
ipcMain.handle("bench:modules", () => {
  try {
    return fs.readdirSync(GENERATORS_DIR, { withFileTypes: true })
      .filter((d) => d.isDirectory() && !d.name.startsWith("_") && fs.existsSync(path.join(GENERATORS_DIR, d.name, "presets.json")))
      .map((d) => d.name);
  } catch (_) { return []; }
});
ipcMain.handle("bench:presets:read", (_event, moduleId) => {
  const file = generatorFile(moduleId, "presets.json");
  try { return { path: file, text: fs.readFileSync(file, "utf8") }; } catch (err) { return { path: file, text: null, error: err.message }; }
});
ipcMain.handle("bench:presets:write", (_event, moduleId, text) => {
  const file = generatorFile(moduleId, "presets.json");
  try { writeAtomic(file, text); return { ok: true, path: file }; } catch (err) { return { ok: false, path: file, error: err.message }; }
});
ipcMain.handle("bench:rules:read", (_event, moduleId) => {
  const file = generatorFile(moduleId, "rules.json");
  try { return { path: file, text: fs.readFileSync(file, "utf8") }; } catch (err) { return { path: file, text: null, error: err.message }; }
});
/** Change one rule constant. The JSON keeps its shape; only `value` changes. */
ipcMain.handle("bench:rules:write", (_event, moduleId, name, value) => {
  const file = generatorFile(moduleId, "rules.json");
  try {
    const text = fs.readFileSync(file, "utf8");
    const rules = JSON.parse(text);
    if (!rules[name]) return { ok: false, path: file, error: `unknown rule ${name}` };
    const from = rules[name].value;
    const to = Number(value);
    if (!Number.isFinite(to)) return { ok: false, path: file, error: `not a number: ${value}` };
    // Replace just the number in place so the file keeps its one-line-per-rule
    // layout (small diffs); fall back to a full rewrite if the pattern is off.
    const re = new RegExp(`("${name.replace(/[.*+?^${}()|[\\]\\\\]/g, "\\$&")}"\\s*:\\s*\\{\\s*"value"\\s*:\\s*)(-?\\d+(?:\\.\\d+)?)`);
    let next = text.replace(re, `$1${to}`);
    let parsed = null;
    try { parsed = JSON.parse(next); } catch (_) { parsed = null; }
    if (!parsed || parsed[name].value !== to) {
      rules[name].value = to;
      next = `${JSON.stringify(rules, null, 2)}\n`;
    }
    writeAtomic(file, next);
    return { ok: true, path: file, name, from, to };
  } catch (err) {
    return { ok: false, path: file, error: err.message };
  }
});
/** Rebuild one generator bundle (esbuild) so a rule change reaches the renderer. */
ipcMain.handle("bench:rebuild", async (_event, moduleId) => {
  const t0 = Date.now();
  try {
    const { buildGenerators } = require("./build-generators.js");
    const built = await buildGenerators([String(moduleId)]);
    return { ok: true, built, ms: Date.now() - t0 };
  } catch (err) {
    return { ok: false, error: err.message, ms: Date.now() - t0 };
  }
});
/** A report the agent reads: logs/bench/<time>-<module>.md */
ipcMain.handle("bench:report:write", (_event, moduleId, markdown) => {
  try {
    fs.mkdirSync(BENCH_LOG_DIR, { recursive: true });
    const stamp = new Date().toISOString().replace(/[:.]/g, "-");
    const file = path.join(BENCH_LOG_DIR, `${stamp}-${String(moduleId).replace(/[^\w-]/g, "_")}.md`);
    fs.writeFileSync(file, String(markdown), "utf8");
    return { ok: true, path: file };
  } catch (err) {
    return { ok: false, error: err.message };
  }
});
ipcMain.handle("bench:report:open", () => {
  fs.mkdirSync(BENCH_LOG_DIR, { recursive: true });
  return shell.openPath(BENCH_LOG_DIR);
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
  return win;
}

app.whenReady().then(() => {
  createWindow();
  // CABLAB_BENCH=1 (or =<moduleId>) opens the bench alongside the app.
  const flag = process.env.CABLAB_BENCH;
  if (flag && flag !== "0") openBench({ moduleId: /^[A-Za-z]\w*$/.test(flag) && flag !== "1" ? flag : "overheadCabinet", from: "env" });
  // CABLAB_BENCH_SNAP=<file.png>: screenshot the bench (and once more with the
  // first board selected as <file>-sel.png), then quit. For CI / agent checks.
  const snap = process.env.CABLAB_BENCH_SNAP;
  if (flag && snap) {
    setTimeout(async () => {
      try {
        if (!benchWin) throw new Error("bench window not open");
        benchWin.show();
        benchWin.moveTop();
        benchWin.focus();
        // Wait until the first tab has rendered (the generator ran) before shooting.
        for (let i = 0; i < 40; i += 1) {
          const ready = await benchWin.webContents.executeJavaScript('!!document.querySelector(".btab") && !!document.querySelector(\'[data-dpane="boards"] tbody tr\')').catch(() => false);
          if (ready) break;
          await new Promise((r) => setTimeout(r, 500));
        }
        const shot = async (file) => {
          let lastErr = null;
          for (let i = 0; i < 6; i += 1) {
            try {
              const [w, hgt] = benchWin.getContentSize();
              const img = await benchWin.webContents.capturePage({ x: 0, y: 0, width: w, height: hgt });
              if (!img.isEmpty()) { fs.writeFileSync(file, img.toPNG()); return; }
              lastErr = new Error("empty image");
            } catch (err) { lastErr = err; }
            await new Promise((r) => setTimeout(r, 700));
          }
          throw lastErr || new Error("capture failed");
        };
        await shot(snap);
        // Exploded (assembly mode, slider 0.7, popover open) and one step into the assembly sequence.
        await benchWin.webContents.executeJavaScript('{ const s = document.querySelector("#explode"); s.value = "0.7"; s.dispatchEvent(new Event("input", { bubbles: true })); document.querySelector("#btnFrame").click(); } true');
        await new Promise((r) => setTimeout(r, 1200));
        await shot(snap.replace(/\.png$/i, "") + "-explode.png");
        await benchWin.webContents.executeJavaScript('document.querySelector("#explodeToggle").click(); for (let i = 0; i < 6; i += 1) document.querySelector("#stepNext").click(); true');
        await new Promise((r) => setTimeout(r, 1200));
        await shot(snap.replace(/\.png$/i, "") + "-step.png");
        await benchWin.webContents.executeJavaScript('{ document.querySelector("#stepLabel").click(); const s = document.querySelector("#explode"); s.value = "0"; s.dispatchEvent(new Event("input", { bubbles: true })); document.body.dispatchEvent(new PointerEvent("pointerdown", { bubbles: true })); } true');
        await new Promise((r) => setTimeout(r, 600));
        await benchWin.webContents.executeJavaScript('document.querySelector(\'[data-dpane="boards"] tbody tr:nth-child(3)\')?.click(); true');
        await new Promise((r) => setTimeout(r, 1200));
        await shot(snap.replace(/\.png$/i, "") + "-sel.png");
        await benchWin.webContents.executeJavaScript('document.querySelector(\'[data-dpane="boards"] tbody tr:nth-child(6)\')?.dispatchEvent(new MouseEvent("contextmenu", { bubbles: true, clientX: 400, clientY: 400 })); document.querySelector("#ctxMenu button")?.click(); true');
        await new Promise((r) => setTimeout(r, 1200));
        await shot(snap.replace(/\.png$/i, "") + "-board.png");
        await benchWin.webContents.executeJavaScript('document.querySelectorAll("#b2dSvg .b2d-pt.outline")[13]?.dispatchEvent(new MouseEvent("click", { bubbles: true })); true');
        await new Promise((r) => setTimeout(r, 1200));
        await shot(snap.replace(/\.png$/i, "") + "-point.png");
        console.log("snap written", snap);
      } catch (err) {
        console.error("snap failed", err.message);
      }
      app.quit();
    }, 6000);
  }
});

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
