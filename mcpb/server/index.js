#!/usr/bin/env node
/* Claude Motion MCP connector — zero dependencies (Node 18+).
 * Claude Desktop <-stdio/MCP-> this server <-HTTP 127.0.0.1:8765-> Claude Motion panel in AE / Premiere. */
"use strict";
const http = require("http");
const PORT = Number(process.env.CLAUDE_MOTION_PORT || 8765);
const log = (...a) => process.stderr.write("[claude-motion] " + a.join(" ") + "\n");

// ---------- Bridge to panels ----------
const HOSTS = { premiere: "PPRO", aftereffects: "AEFT" };
const NAMES = { PPRO: "Premiere Pro", AEFT: "After Effects" };
const queues = { PPRO: [], AEFT: [] };
const waiters = { PPRO: null, AEFT: null };   // pending long-poll responses
const lastSeen = { PPRO: 0, AEFT: 0 };
const pending = new Map();                     // job id -> {resolve, timer}
let nextId = 1;

function connected() {
  return Object.keys(lastSeen).filter((h) => Date.now() - lastSeen[h] < 35000);
}
function deliver(host) {
  const w = waiters[host];
  if (w && queues[host].length) {
    waiters[host] = null;
    clearTimeout(w.timer);
    send(w.res, 200, queues[host].shift());
  }
}
function dispatch(host, job, timeoutMs) {
  return new Promise((resolve) => {
    job.id = nextId++;
    const timer = setTimeout(() => {
      pending.delete(job.id);
      resolve({ ok: false, error: "Timed out waiting for " + NAMES[host] + ". Is the Claude Motion panel open?" });
    }, timeoutMs);
    pending.set(job.id, { resolve, timer });
    queues[host].push(job);
    deliver(host);
  });
}
function send(res, code, body) {
  res.writeHead(code, { "content-type": "application/json", "access-control-allow-origin": "*",
    "access-control-allow-headers": "content-type", "access-control-allow-methods": "GET,POST,OPTIONS" });
  res.end(body === undefined ? "" : JSON.stringify(body));
}
const server = http.createServer((req, res) => {
  const url = new URL(req.url, "http://localhost");
  if (req.method === "OPTIONS") return send(res, 204);
  if (url.pathname === "/poll") {
    const host = url.searchParams.get("host");
    if (!queues[host]) return send(res, 400, { error: "bad host" });
    lastSeen[host] = Date.now();
    if (waiters[host]) { clearTimeout(waiters[host].timer); send(waiters[host].res, 204); }
    const timer = setTimeout(() => { if (waiters[host] && waiters[host].res === res) { waiters[host] = null; send(res, 204); } }, 25000);
    waiters[host] = { res, timer };
    req.on("close", () => { if (waiters[host] && waiters[host].res === res) { clearTimeout(timer); waiters[host] = null; } });
    return deliver(host);
  }
  if (url.pathname === "/result" && req.method === "POST") {
    let b = "";
    req.on("data", (c) => (b += c));
    req.on("end", () => {
      try {
        const { id, result } = JSON.parse(b);
        const p = pending.get(id);
        if (p) { clearTimeout(p.timer); pending.delete(id); p.resolve(result); }
        send(res, 200, { ok: true });
      } catch (e) { send(res, 400, { error: String(e) }); }
    });
    return;
  }
  if (url.pathname === "/status") return send(res, 200, { connected: connected() });
  send(res, 404, { error: "not found" });
});
server.on("error", (e) => log("HTTP bridge error:", e.message, "(is another copy running on port " + PORT + "?)"));
server.listen(PORT, "127.0.0.1", () => log("bridge listening on 127.0.0.1:" + PORT));

// ---------- MCP (JSON-RPC over stdio) ----------
const APP_PROP = { type: "string", enum: ["premiere", "aftereffects"],
  description: "Optional if only one app is connected." };
const TOOLS = [
  { name: "get_status", description: "Which Adobe apps are connected.",
    inputSchema: { type: "object", properties: {} } },
  { name: "get_project_state",
    description: "Compact JSON of the active comp (AE) or sequence (Premiere). Call before editing.",
    inputSchema: { type: "object", properties: { app: APP_PROP } } },
  { name: "run_extendscript",
    description: "Run ExtendScript (ES3: var/function only, no let/const/arrows/JSON/forEach) in the app; returns last expression. AE: app.project.activeItem, 1-indexed layers, matchNames, single undo group. Premiere: app.project.activeSequence, track.clips, Time.seconds, importFiles, createNewSequenceFromClips, markers.createMarker, app.enableQE()+qe for transitions. Throw Error on bad state; end with a short status string.",
    inputSchema: { type: "object", properties: { app: APP_PROP, code: { type: "string", description: "ExtendScript source" } }, required: ["code"] } }
];

function pickHost(app) {
  if (app) return HOSTS[app];
  const c = connected();
  if (c.length === 1) return c[0];
  if (!c.length) throw new Error("No Adobe app is connected. Open Window > Extensions > Claude Motion in Premiere Pro or After Effects.");
  throw new Error("Both apps are connected; pass app: 'premiere' or 'aftereffects'.");
}
async function callTool(name, args) {
  if (name === "get_status") {
    const c = connected().map((h) => NAMES[h]);
    return c.length ? "Connected: " + c.join(", ") : "No apps connected. Open the Claude Motion panel in Premiere Pro or After Effects.";
  }
  const host = pickHost(args.app);
  if (name === "get_project_state") {
    const r = await dispatch(host, { kind: "context" }, 30000);
    const t = JSON.stringify(r);
    return t.length > 6000 ? t.slice(0, 6000) + "…(truncated)" : t;
  }
  if (name === "run_extendscript") {
    const r = await dispatch(host, { kind: "run", code: String(args.code || "") }, 120000);
    if (!r || !r.ok) throw new Error("Script error" + (r && r.line ? " (line " + r.line + ")" : "") + ": " + (r ? r.error : "unknown"));
    return "OK in " + NAMES[host] + (r.result ? ": " + r.result : "");
  }
  throw new Error("Unknown tool " + name);
}

function reply(id, result) { process.stdout.write(JSON.stringify({ jsonrpc: "2.0", id, result }) + "\n"); }
function fail(id, code, message) { process.stdout.write(JSON.stringify({ jsonrpc: "2.0", id, error: { code, message } }) + "\n"); }

async function handle(msg) {
  const { id, method, params } = msg;
  if (id === undefined) return; // notification
  try {
    if (method === "initialize") {
      return reply(id, { protocolVersion: (params && params.protocolVersion) || "2025-06-18",
        capabilities: { tools: {} }, serverInfo: { name: "claude-motion", version: "1.3.1" },
        instructions: "Controls Adobe Premiere Pro and After Effects through the Claude Motion panel. Call get_project_state first, then run_extendscript." });
    }
    if (method === "ping") return reply(id, {});
    if (method === "tools/list") return reply(id, { tools: TOOLS });
    if (method === "tools/call") {
      try {
        const text = await callTool(params.name, params.arguments || {});
        return reply(id, { content: [{ type: "text", text }] });
      } catch (e) {
        return reply(id, { content: [{ type: "text", text: e.message }], isError: true });
      }
    }
    fail(id, -32601, "Method not found: " + method);
  } catch (e) { fail(id, -32603, e.message); }
}

let buf = "";
process.stdin.setEncoding("utf8");
process.stdin.on("data", (chunk) => {
  buf += chunk;
  let i;
  while ((i = buf.indexOf("\n")) >= 0) {
    const line = buf.slice(0, i).trim();
    buf = buf.slice(i + 1);
    if (!line) continue;
    try { handle(JSON.parse(line)); } catch (e) { log("bad message:", e.message); }
  }
});
process.stdin.on("end", () => process.exit(0));
