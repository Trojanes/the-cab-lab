// Usage log. Every user action, system decision (snap / inference / clamp)
// and error goes to logs/usage.jsonl through the main process so a failure
// can be diagnosed from the file instead of a verbal description.
//
//   log("place.create", { id, pose, params })
//   trace(sample)      → ring buffer of recent cursor resolutions, flushed with
//                        the next create / error event, never on every move
//   dump(reason)       → crash-<time>.json with the full job + trace

const bridge = window.cablab || null;
let seq = 0;
const TRACE_MAX = 60;
const trace = [];
let jobRef = null; // set by attachJob() to avoid an import cycle

export function attachJob(mod) {
  jobRef = mod;
}

function send(entry) {
  if (!bridge || !bridge.log) return;
  bridge.log(JSON.stringify(entry)).catch(() => { /* logging must never break the app */ });
}

export function log(kind, data = {}) {
  seq += 1;
  // `kind` last so a payload field of the same name can never overwrite the event kind.
  send({ seq, t: new Date().toISOString(), ...data, kind });
}

/** Record one cursor resolution during a drag; kept in memory until flushed. */
export function traceSample(sample) {
  trace.push({ t: Date.now(), ...sample });
  if (trace.length > TRACE_MAX) trace.shift();
}

export function flushTrace(kind = "trace") {
  if (!trace.length) return;
  log(kind, { samples: trace.splice(0, trace.length) });
}

export function clearTrace() {
  trace.length = 0;
}

/** Write a crash file with the whole job and the cursor trace. */
export function dump(reason, extra = {}) {
  if (!bridge || !bridge.logDump) return;
  const payload = {
    reason,
    t: new Date().toISOString(),
    job: jobRef ? jobRef.getJob() : null,
    selected: jobRef ? jobRef.getSelectedId() : null,
    trace: trace.slice(),
    ...extra,
  };
  bridge.logDump(JSON.stringify(payload, null, 2)).catch(() => {});
}

// --- error hooks ---------------------------------------------------------------

window.addEventListener("error", (e) => {
  log("error", { message: e.message, source: e.filename, line: e.lineno, col: e.colno, stack: e.error && e.error.stack });
  dump("window.error", { message: e.message });
});
window.addEventListener("unhandledrejection", (e) => {
  const r = e.reason;
  log("error", { message: r && (r.message || String(r)), stack: r && r.stack, unhandledRejection: true });
  dump("unhandledrejection", { message: r && (r.message || String(r)) });
});

const origError = console.error.bind(console);
console.error = (...args) => {
  origError(...args);
  log("console.error", { message: args.map((a) => (a && a.stack) || String(a)).join(" ") });
};

log("session.start", {
  versions: bridge ? bridge.versions : null,
  ua: navigator.userAgent,
  viewport: { w: window.innerWidth, h: window.innerHeight },
});
