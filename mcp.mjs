#!/usr/bin/env node
// The Cab Lab MCP server — exposes the command registry (renderer/commands.js)
// to MCP clients as tools over stdio JSON-RPC. Backend is `cli.mjs --repl`
// (one child process = one persistent job session, shared with the CLI via
// .cablab-session.json). Zero dependencies: newline-delimited JSON-RPC 2.0.
//
//   node mcp.mjs            # stdio transport, one session per process
//
// Client config (Cursor / Devin):
//   { "mcpServers": { "cablab": { "command": "node", "args": ["<repo>/mcp.mjs"] } } }
import { spawn } from "node:child_process";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import readline from "node:readline";

const ROOT = dirname(fileURLToPath(import.meta.url));
const PROTOCOL = "2024-11-05";
const INVOKE_TIMEOUT_MS = 330_000; // omnicam.run can take 5 min inside VerifyJob

/* ---------- cli.mjs --repl backend ---------- */

const cli = spawn(process.execPath, [resolve(ROOT, "cli.mjs"), "--repl"], {
  cwd: process.cwd(), // session file lands where the client launched us
  stdio: ["pipe", "pipe", "inherit"],
});
cli.on("exit", (code) => {
  if (!dead) killBackend(`cli.mjs exited (${code})`);
  process.exit(code || 0);
});

let pending = null; // { resolve, timer } — the REPL answers strictly in order
const queue = [];
let dead = false;

const cliOut = readline.createInterface({ input: cli.stdout, terminal: false });
cliOut.on("line", (line) => {
  if (!pending) return; // stray line (startup noise) — ignore
  const { resolve: done, timer } = pending;
  pending = null;
  clearTimeout(timer);
  try { done(JSON.parse(line)); }
  catch { done({ ok: false, error: `unparseable cli output: ${line.slice(0, 200)}`, code: "internal" }); }
  drain();
});

function sendToCli(msg) {
  return new Promise((resolve) => {
    if (dead) { resolve({ ok: false, error: "cli backend is dead", code: "internal" }); return; }
    queue.push({ msg, resolve });
    drain();
  });
}
function drain() {
  if (dead || pending || !queue.length) return;
  const { msg, resolve } = queue.shift();
  pending = { resolve, timer: null };
  pending.timer = setTimeout(() => killBackend(`cli.mjs did not answer within ${INVOKE_TIMEOUT_MS / 1000}s`), INVOKE_TIMEOUT_MS);
  cli.stdin.write(JSON.stringify(msg) + "\n");
}

// A timed-out request can still be answered late — the pipe is off-by-one
// forever after that. The only safe move is to fail everything and kill the
// backend; the client restarts the server process to get a fresh session.
function killBackend(reason) {
  dead = true;
  const r = { ok: false, error: `${reason} — backend killed, restart the MCP server`, code: "internal" };
  if (pending) { clearTimeout(pending.timer); pending.resolve(r); pending = null; }
  for (const q of queue.splice(0)) q.resolve(r);
  cli.kill("SIGTERM");
}

/* ---------- tools ---------- */

const TOOLS = [
  {
    name: "cablab_verbs",
    description: "List every command verb the Cab Lab registry + host exposes (92+). Read docs/AGENT-COMMANDS.md for the full contract.",
    inputSchema: { type: "object", properties: {}, additionalProperties: false },
  },
  {
    name: "cablab_schema",
    description: "Machine-readable spec of one verb: arg names/types/defaults, mutates flag, doc string. Call this before invoking a verb you have not used.",
    inputSchema: {
      type: "object",
      properties: { verb: { type: "string", description: "e.g. cabinet.add" } },
      required: ["verb"],
      additionalProperties: false,
    },
  },
  {
    name: "cablab_status",
    description: "Compact job snapshot: space kind, cabinets (id/module/pose/envelope), walls, planes, finish, dirty flag. Cheap state read before deciding the next edit.",
    inputSchema: { type: "object", properties: {}, additionalProperties: false },
  },
  {
    name: "cablab_invoke",
    description:
      "Run one Cab Lab verb and get its receipt: {ok, verb, effect, validate, diff, undoGroup, error, code}. " +
      "Every mutation returns fitIssues + generator errors in `validate` — read them before continuing. " +
      "Set dryRun:true to preview effect+validate without committing (undo stack untouched).",
    inputSchema: {
      type: "object",
      properties: {
        verb: { type: "string", description: "command verb, e.g. space.define" },
        args: { type: "object", description: "verb arguments, see cablab_describe" },
        dryRun: { type: "boolean", description: "preview without committing" },
      },
      required: ["verb"],
      additionalProperties: false,
    },
  },
  {
    name: "cablab_batch",
    description:
      "Run a sequence of verbs in order. Stops at the first failure unless stopOnError is false. " +
      "Wrap in history.begin-batch / history.end-batch to make the whole run one undo step.",
    inputSchema: {
      type: "object",
      properties: {
        ops: {
          type: "array",
          items: {
            type: "object",
            properties: { verb: { type: "string" }, args: { type: "object" }, dryRun: { type: "boolean" } },
            required: ["verb"],
          },
          description: "ordered verbs",
        },
        stopOnError: { type: "boolean", description: "default true" },
      },
      required: ["ops"],
      additionalProperties: false,
    },
  },
];

async function callTool(name, a = {}) {
  switch (name) {
    case "cablab_verbs":
      return sendToCli({ verb: "help", args: {} });
    case "cablab_schema":
      return sendToCli({ verb: "schema", args: { verb: a.verb } });
    case "cablab_status":
      return sendToCli({ verb: "describe", args: {} });
    case "cablab_invoke":
      return sendToCli({ verb: a.verb, args: a.args || {}, dryRun: !!a.dryRun });
    case "cablab_batch": {
      const receipts = [];
      const stop = a.stopOnError !== false;
      for (const op of a.ops || []) {
        const r = await sendToCli({ verb: op.verb, args: op.args || {}, dryRun: !!op.dryRun });
        receipts.push(r);
        if (!r.ok && stop) break;
      }
      return { ok: receipts.every((r) => r.ok), receipts };
    }
    default:
      return { ok: false, error: `unknown tool ${name}`, code: "bad_args" };
  }
}

/* ---------- stdio JSON-RPC ---------- */

const rpc = readline.createInterface({ input: process.stdin, terminal: false });
const reply = (id, result) => process.stdout.write(JSON.stringify({ jsonrpc: "2.0", id, result }) + "\n");
const replyErr = (id, code, message) => process.stdout.write(JSON.stringify({ jsonrpc: "2.0", id, error: { code, message } }) + "\n");

rpc.on("line", async (line) => {
  const t = line.trim();
  if (!t) return;
  let msg;
  try { msg = JSON.parse(t); } catch { return; }
  const { id, method, params } = msg;
  if (id === undefined) return; // notification — nothing to answer

  try {
    switch (method) {
      case "initialize":
        reply(id, {
          protocolVersion: params?.protocolVersion || PROTOCOL,
          capabilities: { tools: {} },
          serverInfo: { name: "cablab", version: "1.0.0" },
        });
        return;
      case "ping":
        reply(id, {});
        return;
      case "tools/list":
        reply(id, { tools: TOOLS });
        return;
      case "tools/call": {
        const r = await callTool(params?.name, params?.arguments || {});
        reply(id, {
          content: [{ type: "text", text: JSON.stringify(r, null, 2) }],
          isError: r.ok === false,
        });
        return;
      }
      default:
        replyErr(id, -32601, `method not found: ${method}`);
    }
  } catch (e) {
    replyErr(id, -32603, e.message);
  }
});
