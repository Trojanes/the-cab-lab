const { app, BrowserWindow, ipcMain, dialog, shell } = require("electron");
const path = require("path");
const fs = require("fs");

// A second launch used to open another Chromium on the same profile. It then
// failed to bind the debug port and could not take the disk cache, and the
// new window quit. Keep one instance and surface the window that is already open.
const gotSingleInstanceLock = app.requestSingleInstanceLock();
if (!gotSingleInstanceLock) {
  app.exit(0);
}

function focusExistingWindows() {
  const windows = BrowserWindow.getAllWindows().filter((win) => !win.isDestroyed());
  // The document title is "Untitled — The Cab Lab", not the BrowserWindow option.
  const main = windows.find((win) => /The Cab Lab/.test(win.getTitle()) && !/bench/i.test(win.getTitle())) || windows[0];
  if (!main) return;
  if (main.isMinimized()) main.restore();
  main.show();
  main.focus();
}

if (gotSingleInstanceLock) {
  app.on("second-instance", () => {
    focusExistingWindows();
  });
}

const JOB_FILTERS = [{ name: "Cab Lab job", extensions: ["json"] }];
const CNJOB_FILTERS = [{ name: "OmniCAM job", extensions: ["cnjob"] }];
const STEP_FILTERS = [{ name: "STEP", extensions: ["stp", "step"] }];
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

ipcMain.handle("cnjob:save", async (event, defaultPath, snapshotJson) => {
  const win = BrowserWindow.fromWebContents(event.sender);
  const res = await dialog.showSaveDialog(win, { defaultPath: defaultPath || "job.cnjob", filters: CNJOB_FILTERS });
  if (res.canceled || !res.filePath) return null;
  let target = res.filePath;
  if (!target.toLowerCase().endsWith(".cnjob")) target += ".cnjob";
  const { zipStore } = require("./cnjobZip.js");
  const manifest = JSON.stringify({
    format: "cabinetnc.manufacturing-snapshot",
    schemaVersion: "1.1.0",
    payload: "snapshot.json",
  });
  fs.writeFileSync(target, zipStore([
    { name: "manifest.json", data: Buffer.from(manifest) },
    { name: "snapshot.json", data: Buffer.from(String(snapshotJson)) },
  ]));
  return target;
});

ipcMain.handle("step:save", async (event, defaultPath, text) => {
  const win = BrowserWindow.fromWebContents(event.sender);
  const res = await dialog.showSaveDialog(win, { defaultPath: defaultPath || "job.stp", filters: STEP_FILTERS });
  if (res.canceled || !res.filePath) return null;
  let target = res.filePath;
  const lower = target.toLowerCase();
  if (!lower.endsWith(".stp") && !lower.endsWith(".step")) target += ".stp";
  fs.writeFileSync(target, String(text), "utf8");
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
let mainWin = null;
let benchWin = null;
const benchQueue = [];

// Renderer MODULES ids that do not match generators/<dir> (keep in sync with
// renderer/modules.js GENERATOR_DIRS).
const MODULE_TO_DIR = {
  kitchenCabinet: "kitchen",
  ensuiteCabinet: "kitchen",
  uShapeOverheadCabinet: "uShapeOverhead",
  generalTallCabinet: "generalTall",
  tallFridgeCabinet: "generalTall",
  loungeGenerator: "lounge",
  ensuiteDrawingLower: "ensuiteDrawing",
  ensuiteDrawingTall: "ensuiteDrawing",
};

function generatorDirOf(moduleId) {
  return MODULE_TO_DIR[moduleId] || moduleId;
}

function generatorFile(moduleId, name) {
  if (!/^[A-Za-z][\w-]*$/.test(String(moduleId))) throw new Error(`bad module id: ${moduleId}`);
  return path.join(GENERATORS_DIR, generatorDirOf(moduleId), name);
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

ipcMain.handle("app:reload", (event) => {
  const win = BrowserWindow.fromWebContents(event.sender);
  if (win && !win.isDestroyed()) win.webContents.reloadIgnoringCache();
  return true;
});
ipcMain.handle("bench:open", (_event, request) => { openBench(request); return true; });
// The bench tells us when it is ready to receive requests (after a load or a reload).
ipcMain.handle("bench:ready", () => { benchReady = true; flushBenchQueue(); return true; });

/** Every module id whose generator folder has a presets.json. A shared folder
 *  (generalTall → Storage and Fridge) lists each module, not just one of them. */
function moduleIdsOfDir(dir) {
  const ids = Object.entries(MODULE_TO_DIR).filter(([, d]) => d === dir).map(([id]) => id);
  return ids.length ? ids : [dir];
}

ipcMain.handle("bench:modules", () => {
  try {
    return fs.readdirSync(GENERATORS_DIR, { withFileTypes: true })
      .filter((d) => d.isDirectory() && !d.name.startsWith("_") && fs.existsSync(path.join(GENERATORS_DIR, d.name, "presets.json")))
      .flatMap((d) => moduleIdsOfDir(d.name));
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
/** Placement rules (generators/<module>/layout.json); text null when the module has none. */
ipcMain.handle("bench:layout:read", (_event, moduleId) => {
  const file = generatorFile(moduleId, "layout.json");
  try { return { path: file, text: fs.readFileSync(file, "utf8") }; } catch (err) { return { path: file, text: null, error: err.message }; }
});
/** Replace layout.json with a committed draft. The bench validated it by generating with it first. */
ipcMain.handle("bench:layout:write", (_event, moduleId, text) => {
  const file = generatorFile(moduleId, "layout.json");
  try {
    const parsed = JSON.parse(String(text));
    if (!parsed || typeof parsed.boards !== "object" || typeof parsed.module !== "string") throw new Error("not a layout file");
    if (!fs.existsSync(file)) throw new Error("this module has no layout.json");
    writeAtomic(file, `${JSON.stringify(parsed, null, 2)}\n`);
    return { ok: true, path: file };
  } catch (err) {
    return { ok: false, path: file, error: err.message };
  }
});
/** Rebuild one generator bundle (esbuild) so a rule change reaches the renderer. */
ipcMain.handle("bench:rebuild", async (_event, moduleId) => {
  const t0 = Date.now();
  try {
    const { buildGenerators } = require("./build-generators.js");
    const dir = generatorDirOf(String(moduleId));
    const built = await buildGenerators([dir]);
    const moduleIds = moduleIdsOfDir(dir);
    if (mainWin && !mainWin.isDestroyed()) mainWin.webContents.send("generators:updated", { dir, moduleIds });
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
  win.webContents.on("before-input-event", (event, input) => {
    if (input.type === "keyDown" && input.key === "F12") {
      win.webContents.toggleDevTools();
      return;
    }
    const refreshKey = input.key === "F5" || ((input.control || input.meta) && String(input.key).toLowerCase() === "r");
    if (input.type === "keyDown" && refreshKey && !input.alt && !input.isAutoRepeat) {
      event.preventDefault();
      win.webContents.send("app:refresh");
      return;
    }
    // F8 (and F3 / F10) never reach the page on Windows: the menu bar takes the
    // function key before keydown. Deliver it here, and don't also let it through.
    const aid = input.key === "F3" || input.key === "F8" || input.key === "F10"
      || input.code === "F3" || input.code === "F8" || input.code === "F10";
    if (input.type !== "keyDown" || !aid || input.isAutoRepeat || input.control || input.meta || input.alt) return;
    event.preventDefault();
    win.webContents.send("sketch:aid", input.code || input.key);
  });

  win.on("closed", () => {
    mainWin = null;
    // The bench is a tool of this window. Leave it open and the process stays
    // up, and the next launch still shows the old screen.
    if (benchWin && !benchWin.isDestroyed()) benchWin.destroy();
  });

  mainWin = win;
  win.loadFile(path.join(__dirname, "renderer", "index.html"));
  return win;
}

app.whenReady().then(() => {
  if (!gotSingleInstanceLock) return;
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
          const ready = await benchWin.webContents.executeJavaScript('!!document.querySelector(".btab") && (window.__bench?.cur()?.result?.boards?.length > 0)').catch(() => false);
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
        const formulas = await benchWin.webContents.executeJavaScript(`(() => {
          window.__bench.enterMode("default", "T4");
          return [...document.querySelectorAll("#selPanel .face-row input, #selPanel .size-row")].map((el) => (el.value || el.textContent || "").trim());
        })()`);
        console.log("default-mode formulas", JSON.stringify(formulas));
        await new Promise((r) => setTimeout(r, 600));
        await shot(snap.replace(/\.png$/i, "") + "-mode.png");
        const menu = await benchWin.webContents.executeJavaScript(`(async () => {
          document.querySelector("#tabAdd").click();
          for (let i = 0; i < 20 && !document.querySelector("#ctxMenu button"); i += 1) await new Promise((r) => setTimeout(r, 50));
          const rows = [...document.querySelectorAll("#ctxMenu button")].map((b) => ({ text: b.textContent, disabled: b.disabled }));
          document.body.dispatchEvent(new PointerEvent("pointerdown", { bubbles: true }));
          window.__bench.exitMode();
          return rows;
        })()`);
        console.log("open-generator menu", JSON.stringify(menu));
        // Exploded (assembly mode, slider 0.7, popover open) and one step into the assembly sequence.
        await benchWin.webContents.executeJavaScript('{ const s = document.querySelector("#explode"); s.value = "0.7"; s.dispatchEvent(new Event("input", { bubbles: true })); document.querySelector("#btnFrame").click(); } true');
        await new Promise((r) => setTimeout(r, 1200));
        await shot(snap.replace(/\.png$/i, "") + "-explode.png");
        await benchWin.webContents.executeJavaScript('document.querySelector("#explodeToggle").click(); for (let i = 0; i < 6; i += 1) document.querySelector("#stepNext").click(); true');
        await new Promise((r) => setTimeout(r, 1200));
        await shot(snap.replace(/\.png$/i, "") + "-step.png");
        await benchWin.webContents.executeJavaScript('{ document.querySelector("#stepLabel").click(); const s = document.querySelector("#explode"); s.value = "0"; s.dispatchEvent(new Event("input", { bubbles: true })); document.body.dispatchEvent(new PointerEvent("pointerdown", { bubbles: true })); } true');
        await new Promise((r) => setTimeout(r, 600));
        await benchWin.webContents.executeJavaScript('(() => { const ids = [...window.__bench.cur().boards.keys()]; window.__bench.select({ kind: "board", id: ids[2] || ids[0] }); return true; })()');
        await new Promise((r) => setTimeout(r, 1200));
        await shot(snap.replace(/\.png$/i, "") + "-sel.png");
        await benchWin.webContents.executeJavaScript('(() => { const ids = [...window.__bench.cur().boards.keys()]; window.__bench.enterL3(ids[5] || ids[0]); return true; })()');
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
