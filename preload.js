const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("cablab", {
  openJob: () => ipcRenderer.invoke("job:open"),
  saveJob: (filePath, text) => ipcRenderer.invoke("job:save", filePath, text),
  openDxf: () => ipcRenderer.invoke("dxf:open"),
  readSettings: () => ipcRenderer.invoke("settings:read"),
  writeSettings: (text) => ipcRenderer.invoke("settings:write", text),
  log: (line) => ipcRenderer.invoke("log:append", line),
  logDump: (text) => ipcRenderer.invoke("log:dump", text),
  openLogs: () => ipcRenderer.invoke("log:open"),
  versions: { electron: process.versions.electron, chrome: process.versions.chrome },

  // Generator bench (see docs/bench-spec.md). Main window: openBench().
  // Bench window: the rest.
  openBench: (request) => ipcRenderer.invoke("bench:open", request),
  bench: {
    ready: () => ipcRenderer.invoke("bench:ready"),
    onShow: (cb) => { ipcRenderer.on("bench:show", (_e, req) => cb(req)); },
    modules: () => ipcRenderer.invoke("bench:modules"),
    readPresets: (moduleId) => ipcRenderer.invoke("bench:presets:read", moduleId),
    writePresets: (moduleId, text) => ipcRenderer.invoke("bench:presets:write", moduleId, text),
    readRules: (moduleId) => ipcRenderer.invoke("bench:rules:read", moduleId),
    writeRule: (moduleId, name, value) => ipcRenderer.invoke("bench:rules:write", moduleId, name, value),
    rebuild: (moduleId) => ipcRenderer.invoke("bench:rebuild", moduleId),
    writeReport: (moduleId, markdown) => ipcRenderer.invoke("bench:report:write", moduleId, markdown),
    openReports: () => ipcRenderer.invoke("bench:report:open"),
  },
});
