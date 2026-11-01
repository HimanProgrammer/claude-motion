// ExtendScript side: runs inside After Effects or Premiere Pro.
// Exposes cm_getContext() and cm_run(code) to the panel.

function cm_json(v) {
  // Minimal JSON.stringify (ExtendScript has no native JSON).
  if (v === null || v === undefined) return "null";
  var t = typeof v;
  if (t === "number" || t === "boolean") return String(v);
  if (t === "string") {
    return '"' + v.replace(/\\/g, "\\\\").replace(/"/g, '\\"')
      .replace(/\n/g, "\\n").replace(/\r/g, "\\r").replace(/\t/g, "\\t") + '"';
  }
  if (v instanceof Array) {
    var a = [];
    for (var i = 0; i < v.length; i++) a.push(cm_json(v[i]));
    return "[" + a.join(",") + "]";
  }
  var o = [];
  for (var k in v) if (v.hasOwnProperty(k)) o.push(cm_json(k) + ":" + cm_json(v[k]));
  return "{" + o.join(",") + "}";
}

function cm_r(n) { return Math.round(n * 100) / 100; }

function cm_aeContext() {
  var ctx = { app: "After Effects", version: app.version, project: app.project.file ? app.project.file.name : "(unsaved)" };
  var item = app.project.activeItem;
  if (item && item instanceof CompItem) {
    var layers = [];
    for (var i = 1; i <= Math.min(item.numLayers, 30); i++) {
      var L = item.layer(i);
      var o = { i: i, n: L.name, t: L.matchName.replace("ADBE ", ""), in: cm_r(L.inPoint), out: cm_r(L.outPoint) };
      if (L.selected) o.sel = 1;
      layers.push(o);
    }
    ctx.activeComp = { name: item.name, w: item.width, h: item.height, dur: cm_r(item.duration),
      fps: cm_r(item.frameRate), time: cm_r(item.time), numLayers: item.numLayers, layers: layers };
  } else {
    ctx.activeComp = null;
  }
  return ctx;
}

function cm_pproContext() {
  var ctx = { app: "Premiere Pro", version: app.version, project: app.project ? app.project.name : null };
  var seq = app.project ? app.project.activeSequence : null;
  if (seq) {
    var tracks = function (coll, kind) {
      var out = [];
      for (var t = 0; t < coll.numTracks; t++) {
        var tr = coll[t], clips = [];
        if (!tr.clips.numItems) continue;
        for (var c = 0; c < Math.min(tr.clips.numItems, 20); c++) {
          var cl = tr.clips[c];
          var o = { n: cl.name, s: cm_r(cl.start.seconds), e: cm_r(cl.end.seconds) };
          if (cl.isSelected()) o.sel = 1;
          clips.push(o);
        }
        out.push({ track: (kind === "video" ? "V" : "A") + (t + 1), clips: clips, total: tr.clips.numItems });
      }
      return out;
    };
    ctx.activeSequence = {
      name: seq.name, playhead: cm_r(seq.getPlayerPosition().seconds),
      w: seq.frameSizeHorizontal, h: seq.frameSizeVertical,
      tracks: tracks(seq.videoTracks, "video").concat(tracks(seq.audioTracks, "audio"))
    };
  } else {
    ctx.activeSequence = null;
  }
  return ctx;
}

function cm_isAE() { return BridgeTalk.appName === "aftereffects"; }

function cm_getContext() {
  try { return cm_json(cm_isAE() ? cm_aeContext() : cm_pproContext()); }
  catch (e) { return cm_json({ error: String(e) }); }
}

function cm_run(code) {
  var ae = cm_isAE();
  try {
    if (ae) app.beginUndoGroup("Claude Motion");
    var result = eval(code);
    if (ae) app.endUndoGroup();
    var rs = result === undefined ? null : String(result);
    if (rs && rs.length > 1500) rs = rs.substring(0, 1500) + "…(truncated)";
    return cm_json({ ok: true, result: rs });
  } catch (e) {
    if (ae) { try { app.endUndoGroup(); } catch (_) {} }
    return cm_json({ ok: false, error: String(e), line: e.line || null });
  }
}
