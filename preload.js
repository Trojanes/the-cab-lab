const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("cablab", {
  openJob: () => ipcRenderer.invoke("job:open"),
  saveJob: (filePath, text) => ipcRenderer.invoke("job:save", filePath, text),
  saveCnjob: (filePath, snapshotJson) => ipcRenderer.invoke("cnjob:save", filePath, snapshotJson),
  saveStep: (filePath, text) => ipcRenderer.invoke("step:save", filePath, text),
  openDxf: () => ipcRenderer.invoke("dxf:open"),
  readSettings: () => ipcRenderer.invoke("settings:read"),
  writeSettings: (text) => ipcRenderer.invoke("settings:write", text),
  log: (line) => ipcRenderer.invoke("log:append", line),
  logDump: (text) => ipcRenderer.invoke("log:dump", text),
  openLogs: () => ipcRenderer.invoke("log:open"),
  // Cloud storage (cloud/, CAB_CLOUD_* env). All calls return null/{ok:false}
  // when cloud is disabled or the upload fails — never throw into the page.
  cloudStatus: () => ipcRenderer.invoke("cloud:status"),
  cloudPush: (root, rel, text) => ipcRenderer.invoke("cloud:push", root, rel, text),
  cloudPull: (root, rel) => ipcRenderer.invoke("cloud:pull", root, rel),
  cloudList: (root, rel) => ipcRenderer.invoke("cloud:list", root, rel),
  cloudDelete: (root, rel) => ipcRenderer.invoke("cloud:delete", root, rel),
  onSketchAid: (cb) => { ipcRenderer.on("sketch:aid", (_e, key) => cb(key)); },
  onGeneratorsUpdated: (cb) => { ipcRenderer.on("generators:updated", (_e, info) => cb(info)); },
  reloadApp: () => ipcRenderer.invoke("app:reload"),
  onRefresh: (cb) => { ipcRenderer.on("app:refresh", () => cb()); },
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
    readLayout: (moduleId) => ipcRenderer.invoke("bench:layout:read", moduleId),
    writeLayout: (moduleId, text) => ipcRenderer.invoke("bench:layout:write", moduleId, text),
    rebuild: (moduleId) => ipcRenderer.invoke("bench:rebuild", moduleId),
    writeReport: (moduleId, markdown) => ipcRenderer.invoke("bench:report:write", moduleId, markdown),
    openReports: () => ipcRenderer.invoke("bench:report:open"),
  },
});
