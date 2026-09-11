// User settings that survive a restart: <userData>/settings.json through the
// main process (see main.js). Loaded once at startup, before the space dialog
// opens, so `defaults()` can read the cache synchronously. Every set() writes
// the file immediately (atomic in main.js); a failure is reported back to the
// caller and logged, never swallowed.
//
//   { version: 1, space: { vehicle: { defaults: {...} } }, materials: { defaults: { finish, stock } }, presets: {...} }
import { log } from "./log.js";

const bridge = window.cablab || null;
const VERSION = 1;
let data = { version: VERSION };
let loaded = false;
let filePath = null;

export async function loadSettings() {
  if (loaded) return data;
  loaded = true;
  if (!bridge || !bridge.readSettings) return data;
  try {
    const res = await bridge.readSettings();
    filePath = res && res.path;
    if (!res || res.text == null) {
      if (res && res.error) log("settings.read.failed", { path: filePath, message: res.error });
      return data;
    }
    const parsed = JSON.parse(res.text);
    if (!parsed || typeof parsed !== "object") throw new Error("not an object");
    data = { ...parsed, version: VERSION };
    log("settings.loaded", { path: filePath, keys: Object.keys(data) });
  } catch (err) {
    // Keep the broken file for inspection; run with built-in defaults.
    log("settings.corrupt", { path: filePath, message: err.message });
  }
  return data;
}

export function settingsPath() { return filePath; }

/** Read "a.b.c" from the cache; undefined when absent. */
export function getSetting(key) {
  let cur = data;
  for (const part of key.split(".")) {
    if (cur == null || typeof cur !== "object") return undefined;
    cur = cur[part];
  }
  return cur === undefined ? undefined : JSON.parse(JSON.stringify(cur));
}

/** Write "a.b.c" = value (undefined deletes) and persist now. Resolves { ok, path, error }. */
export async function setSetting(key, value) {
  const parts = key.split(".");
  let cur = data;
  for (const part of parts.slice(0, -1)) {
    if (cur[part] == null || typeof cur[part] !== "object") cur[part] = {};
    cur = cur[part];
  }
  const last = parts[parts.length - 1];
  if (value === undefined) delete cur[last];
  else cur[last] = JSON.parse(JSON.stringify(value));
  if (!bridge || !bridge.writeSettings) return { ok: false, path: null, error: "settings bridge unavailable" };
  const res = await bridge.writeSettings(JSON.stringify(data, null, 2));
  if (!res || !res.ok) log("settings.write.failed", { key, path: res && res.path, message: res && res.error });
  return res || { ok: false, path: null, error: "no response" };
}
