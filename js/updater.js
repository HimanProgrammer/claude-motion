/* Auto-updater: compares local version.json with GitHub and downloads newer files
 * straight into this extension folder (CEP Node.js is enabled in the manifest). */
(function () {
  "use strict";
  var RAW = "https://raw.githubusercontent.com/HimanProgrammer/claude-motion/main/";
  var cep = window.__adobe_cep__;
  if (!cep || typeof require !== "function") return; // only inside Adobe

  var fs = require("fs"), path = require("path");
  var root = decodeURIComponent(cep.getSystemPath("extension")).replace(/^file:\/{2,3}/, "");
  if (/^\/[A-Za-z]:/.test(root)) root = root.slice(1); // Windows "/C:/..." -> "C:/..."

  function newer(a, b) {
    a = a.split(".").map(Number); b = b.split(".").map(Number);
    for (var i = 0; i < 3; i++) { if ((a[i] || 0) !== (b[i] || 0)) return (a[i] || 0) > (b[i] || 0); }
    return false;
  }
  function note(text, cls) {
    var log = document.getElementById("log");
    if (!log) return;
    var d = document.createElement("div");
    d.className = "msg " + (cls || "sys");
    d.textContent = text;
    log.appendChild(d);
    return d;
  }

  var local = { version: "0.0.0" };
  try { local = JSON.parse(fs.readFileSync(path.join(root, "version.json"), "utf8")); } catch (e) {}

  fetch(RAW + "version.json?t=" + Date.now(), { cache: "no-store" })
    .then(function (r) { if (!r.ok) throw new Error("HTTP " + r.status); return r.json(); })
    .then(function (remote) {
      if (!newer(remote.version, local.version)) return;
      var n = note("⬇ Updating Claude Motion " + local.version + " → " + remote.version + "…");
      // Download everything first, then write, so a failed download never leaves a half-updated plugin.
      return Promise.all(remote.files.map(function (f) {
        return fetch(RAW + f + "?t=" + Date.now(), { cache: "no-store" }).then(function (r) {
          if (!r.ok) throw new Error(f + ": HTTP " + r.status);
          return r.text().then(function (t) { return { f: f, t: t }; });
        });
      })).then(function (files) {
        var nativeChanged = false;
        files.forEach(function (x) {
          var dest = path.join(root, x.f);
          var old = null;
          try { old = fs.readFileSync(dest, "utf8"); } catch (e) {}
          if (old === x.t) return;
          if (/^(jsx|CSXS)\//.test(x.f)) nativeChanged = true;
          fs.mkdirSync(path.dirname(dest), { recursive: true });
          fs.writeFileSync(dest, x.t, "utf8");
        });
        if (nativeChanged) {
          n.textContent = "✓ Updated to " + remote.version + ". Restart After Effects / Premiere to finish.";
        } else {
          n.textContent = "✓ Updated to " + remote.version + ". Reloading…";
          setTimeout(function () { location.reload(); }, 1200);
        }
      });
    })
    .catch(function (e) { note("Update check failed: " + e.message + " (the plugin still works).", "sys"); });
})();
