const { app, BrowserWindow, ipcMain, dialog } = require("electron");
const path = require("path");
const fs = require("fs");

const JOB_FILTERS = [{ name: "Cab Lab job", extensions: ["json"] }];

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
