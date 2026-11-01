/* Bridge to the Claude Motion MCP connector (mcp/server.js) so Claude Desktop can drive this app live. */
(function () {
  "use strict";
  var CM = window.CM;
  if (!CM || CM.hostName === "BROWSER") return;
  var BASE = "http://127.0.0.1:" + (CM.store.get("cm_port", "8765"));
  var pill = document.getElementById("bridge");
  var box = document.getElementById("bridgeOn");
  box.checked = CM.store.get("cm_bridge", "1") === "1";
  box.onchange = function () { CM.store.set("cm_bridge", box.checked ? "1" : "0"); };
  var online = false;

  function setOnline(v) {
    if (v === online) return;
    online = v;
    pill.textContent = v ? "● Desktop: connected" : "● Desktop: off";
    pill.className = v ? "pill on" : "pill";
    if (v) CM.addMsg("sys", "Claude Desktop connected — you can now edit by chatting in Claude Desktop.");
  }
  function post(id, result) {
    return fetch(BASE + "/result", { method: "POST", headers: { "content-type": "application/json" },
      body: JSON.stringify({ id: id, result: result }) });
  }
  function handle(job) {
    if (job.kind === "context") return CM.getContext().then(function (c) { return post(job.id, c); });
    if (job.kind === "run") {
      var first = job.code.split("\n").filter(function (l) { return l.trim(); })[0] || "";
      var m = CM.addMsg("sys", "⚡ Claude Desktop is running a script… " + first.slice(0, 60));
      return CM.runInHost(job.code).then(function (r) {
        m.textContent = (r.ok ? "✓ Claude Desktop: " + (r.result || "done") : "✗ Claude Desktop script error: " + r.error);
        return post(job.id, r);
      });
    }
    return post(job.id, { ok: false, error: "Unknown job" });
  }
  function loop() {
    if (!box.checked) { setOnline(false); return setTimeout(loop, 3000); }
    fetch(BASE + "/poll?host=" + CM.hostName, { cache: "no-store" })
      .then(function (r) {
        setOnline(true);
        if (r.status === 200) return r.json().then(handle);
      })
      .then(function () { setTimeout(loop, 50); })
      .catch(function () { setOnline(false); setTimeout(loop, 3000); });
  }
  loop();
})();
