/* Claude Motion — CEP panel for After Effects & Premiere Pro.
 * Sends your request + a snapshot of the open comp/sequence to Claude,
 * receives ExtendScript, and runs it in the host app (one undo step in AE). */
(function () {
  "use strict";

  var cep = window.__adobe_cep__;
  var $ = function (id) { return document.getElementById(id); };
  var store = {
    get: function (k, d) { try { var v = localStorage.getItem(k); return v === null ? d : v; } catch (e) { return d; } },
    set: function (k, v) { try { localStorage.setItem(k, v); } catch (e) {} }
  };

  var hostName = "BROWSER";
  if (cep) {
    try { hostName = JSON.parse(cep.getHostEnvironment()).appName; } catch (e) {}
  }
  var isAE = hostName === "AEFT";
  var isPPro = hostName === "PPRO";
  $("host").textContent = isAE ? "After Effects" : isPPro ? "Premiere Pro" : "Preview (no host)";

  var history = []; // Messages API conversation

  var PRESETS = isPPro ? [
    "Add cross dissolves between all clips on V1",
    "Add markers every 2 seconds on the active sequence",
    "Razor all tracks at the playhead",
    "List every clip on the timeline with in/out times",
    "Mute all audio tracks except A1",
    "Rename selected clips with numbers 01, 02, 03…"
  ] : [
    "Create a lower third with slide-in animation",
    "Add a wiggle expression to the selected layers' position",
    "Fade selected layers in and out over 0.5s",
    "Make an animated kinetic title saying 'HELLO'",
    "Add easy ease to all keyframes on selected layers",
    "Create a 1080x1920 9:16 comp from the active comp",
    "Build a bouncing shape-layer logo reveal",
    "Add a camera with a slow push-in"
  ];

  function systemPrompt() {
    var appLabel = isPPro ? "Adobe Premiere Pro" : "Adobe After Effects";
    return [
      "You are Claude Motion, an expert editor and motion designer embedded in " + appLabel + ".",
      "You control the app by writing ExtendScript (ES3 JavaScript) that the panel executes directly in the host.",
      "Rules:",
      "- Reply with a one or two sentence plan, then exactly ONE fenced code block marked ```jsx containing the full script.",
      "- ES3 only: no let/const, arrow functions, template strings, JSON, Array.forEach/map, or classes.",
      "- Do not wrap the script in app.beginUndoGroup — the panel already does that.",
      "- Validate assumptions (active comp/sequence exists, selection non-empty) and throw new Error('clear message') if not.",
      "- The last expression of the script is shown to the user, so end with a short status string.",
      isAE
        ? "- After Effects: use app.project.activeItem (CompItem), layers are 1-indexed, use matchName property paths (e.g. 'ADBE Transform Group'), expressions via property.expression, easing via KeyframeEase."
        : "- Premiere Pro: use app.project.activeSequence, Time objects (seconds/ticks), sequence.videoTracks/audioTracks, track.clips, qe (app.enableQE()) only when no DOM API exists.",
      "- If the request is a question (not an action), answer it in text and omit the code block.",
      "The current project state is provided as JSON in each user message."
    ].join("\n");
  }

  // ---------- Host bridge ----------
  function evalHost(script) {
    return new Promise(function (resolve) {
      if (!cep) return resolve(null);
      cep.evalScript(script, function (res) { resolve(res); });
    });
  }
  function getContext() {
    return evalHost("cm_getContext()").then(function (r) {
      try { return r ? JSON.parse(r) : { app: "none (preview mode)" }; } catch (e) { return { raw: r }; }
    });
  }
  function runInHost(code) {
    return evalHost("cm_run(" + JSON.stringify(code) + ")").then(function (r) {
      if (r === null) return { ok: false, error: "Not running inside After Effects / Premiere Pro." };
      try { return JSON.parse(r); } catch (e) { return { ok: false, error: String(r) }; }
    });
  }

  // ---------- Claude API ----------
  function callClaude(messages) {
    var key = store.get("cm_key", "");
    if (!key) return Promise.reject(new Error("Add your Anthropic API key in Settings (⚙)."));
    return fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-api-key": key,
        "anthropic-version": "2023-06-01",
        "anthropic-dangerous-direct-browser-access": "true"
      },
      body: JSON.stringify({
        model: store.get("cm_model", "claude-opus-5-5"),
        max_tokens: 8000,
        system: systemPrompt(),
        messages: messages
      })
    }).then(function (res) {
      return res.json().then(function (data) {
        if (!res.ok) throw new Error((data.error && data.error.message) || ("HTTP " + res.status));
        return data.content.filter(function (b) { return b.type === "text"; })
          .map(function (b) { return b.text; }).join("\n");
      });
    });
  }

  function extractCode(text) {
    var m = text.match(/```(?:jsx|javascript|js|extendscript)?\s*\n([\s\S]*?)```/);
    return m ? m[1].trim() : null;
  }

  // ---------- UI ----------
  function addMsg(cls, text) {
    var d = document.createElement("div");
    d.className = "msg " + cls;
    d.textContent = text;
    $("log").appendChild(d);
    $("log").scrollTop = $("log").scrollHeight;
    return d;
  }

  function addClaudeReply(text) {
    var code = extractCode(text);
    var prose = text.replace(/```[\s\S]*?```/g, "").trim();
    var d = addMsg("claude", prose || "Here's the script:");
    if (!code) return;
    var pre = document.createElement("pre");
    pre.textContent = code;
    d.appendChild(pre);
    var row = document.createElement("div");
    row.className = "row";
    var runBtn = document.createElement("button");
    runBtn.textContent = "▶ Run in " + (isPPro ? "Premiere" : "After Effects");
    var copyBtn = document.createElement("button");
    copyBtn.className = "ghost";
    copyBtn.textContent = "Copy";
    row.appendChild(runBtn); row.appendChild(copyBtn);
    d.appendChild(row);
    runBtn.onclick = function () { execute(code); };
    copyBtn.onclick = function () { navigator.clipboard && navigator.clipboard.writeText(code); };
    if (store.get("cm_auto", "0") === "1") execute(code);
  }

  function execute(code) {
    runInHost(code).then(function (r) {
      if (r.ok) {
        addMsg("sys", "✓ Done" + (r.result ? ": " + r.result : ""));
      } else {
        var errText = "Script error" + (r.line ? " (line " + r.line + ")" : "") + ": " + r.error;
        var d = addMsg("err", errText);
        var fix = document.createElement("button");
        fix.textContent = "Ask Claude to fix";
        fix.style.marginTop = "6px";
        fix.onclick = function () { fix.disabled = true; send("The script failed with: " + errText + "\nPlease fix it."); };
        d.appendChild(document.createElement("br"));
        d.appendChild(fix);
      }
    });
  }

  var busy = false;
  function send(text) {
    text = (text || "").trim();
    if (!text || busy) return;
    busy = true;
    $("send").disabled = true;
    addMsg("user", text);
    var thinking = addMsg("sys", "Claude is working…");
    getContext().then(function (ctx) {
      history.push({ role: "user", content: text + "\n\n<project_state>\n" + JSON.stringify(ctx) + "\n</project_state>" });
      return callClaude(history);
    }).then(function (reply) {
      history.push({ role: "assistant", content: reply });
      thinking.remove();
      addClaudeReply(reply);
    }).catch(function (e) {
      history.pop();
      thinking.remove();
      addMsg("err", e.message);
    }).then(function () {
      busy = false;
      $("send").disabled = false;
    });
  }

  // wiring
  PRESETS.forEach(function (p) {
    var b = document.createElement("button");
    b.textContent = p;
    b.onclick = function () { send(p); };
    $("presets").appendChild(b);
  });
  $("send").onclick = function () { var t = $("prompt").value; $("prompt").value = ""; send(t); };
  $("prompt").addEventListener("keydown", function (e) {
    if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) $("send").onclick();
  });
  $("clear").onclick = function () { history = []; $("log").innerHTML = ""; };
  $("settingsBtn").onclick = function () { $("settings").hidden = !$("settings").hidden; };
  $("apiKey").value = store.get("cm_key", "");
  $("model").value = store.get("cm_model", "claude-opus-5-5");
  $("autoRun").checked = store.get("cm_auto", "0") === "1";
  $("saveSettings").onclick = function () {
    store.set("cm_key", $("apiKey").value.trim());
    store.set("cm_model", $("model").value);
    store.set("cm_auto", $("autoRun").checked ? "1" : "0");
    $("settings").hidden = true;
    addMsg("sys", "Settings saved.");
  };
  if (!store.get("cm_key", "")) $("settings").hidden = false;
  addMsg("sys", "Describe an edit or animation (Ctrl/⌘+Enter to send). Claude sees your active " +
    (isPPro ? "sequence" : "comp") + " and writes a script you can run.");
})();
