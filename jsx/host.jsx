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

function cm_aeContext() {
  var ctx = { app: "After Effects", version: app.version, project: app.project.file ? app.project.file.name : "(unsaved)" };
  var item = app.project.activeItem;
  if (item && item instanceof CompItem) {
    var layers = [];
    for (var i = 1; i <= Math.min(item.numLayers, 60); i++) {
      var L = item.layer(i);
      layers.push({ index: i, name: L.name, type: L.matchName, inPoint: L.inPoint, outPoint: L.outPoint, selected: L.selected });
    }
    ctx.activeComp = { name: item.name, width: item.width, height: item.height, duration: item.duration,
      frameRate: item.frameRate, time: item.time, numLayers: item.numLayers, layers: layers };
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
        for (var c = 0; c < Math.min(tr.clips.numItems, 40); c++) {
          var cl = tr.clips[c];
          clips.push({ index: c, name: cl.name, start: cl.start.seconds, end: cl.end.seconds, selected: cl.isSelected() });
        }
        out.push({ kind: kind, index: t, name: tr.name, clips: clips });
      }
      return out;
    };
    ctx.activeSequence = {
      name: seq.name, playhead: seq.getPlayerPosition().seconds,
      frameSizeH: seq.frameSizeHorizontal, frameSizeV: seq.frameSizeVertical,
      videoTracks: tracks(seq.videoTracks, "video"), audioTracks: tracks(seq.audioTracks, "audio")
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
    return cm_json({ ok: true, result: result === undefined ? null : String(result) });
  } catch (e) {
    if (ae) { try { app.endUndoGroup(); } catch (_) {} }
    return cm_json({ ok: false, error: String(e), line: e.line || null });
  }
}
