// Creative Mind IT Services — test reel builder for Premiere Pro.
// Run it from the Claude Motion panel, or via File > Scripts in Premiere.
(function () {
  var folder = Folder.selectDialog("Select the 'clips' folder from claude-motion/test-reel");
  if (!folder) throw new Error("No folder selected.");
  var files = folder.getFiles("*.mp4");
  if (!files.length) throw new Error("No .mp4 clips found in " + folder.fsName);
  files.sort(function (a, b) { return a.name < b.name ? -1 : 1; });

  var paths = [];
  for (var i = 0; i < files.length; i++) paths.push(files[i].fsName);

  var root = app.project.rootItem;
  var bin = root.createBin("Creative Mind Reel");
  app.project.importFiles(paths, true, bin, false);

  var items = [];
  for (var j = 0; j < bin.children.numItems; j++) items.push(bin.children[j]);
  items.sort(function (a, b) { return a.name < b.name ? -1 : 1; });

  // Sequence matches the clips: 1080x1920, 30fps (9:16 reel).
  var seq = app.project.createNewSequenceFromClips("Creative Mind IT – Reel", items, bin);
  app.project.openSequence(seq.sequenceID);

  var labels = ["Hook", "Brand", "Web & App", "Cloud & IT", "Marketing", "Call to action"];
  var clips = seq.videoTracks[0].clips;
  for (var k = 0; k < clips.numItems; k++) {
    var m = seq.markers.createMarker(clips[k].start.seconds);
    m.name = labels[k] || ("Scene " + (k + 1));
  }

  // Cross dissolves between scenes (needs QE DOM; skipped quietly if unavailable).
  var added = 0;
  try {
    app.enableQE();
    var qs = qe.project.getActiveSequence();
    var tr = qs.getVideoTrackAt(0);
    var dissolve = qe.project.getVideoTransitionByName("Cross Dissolve");
    for (var t = 0; t < tr.numItems - 1; t++) {
      var it = tr.getItemAt(t);
      if (it && it.type === "Clip") { it.addTransition(dissolve, false, "00;00;00;10"); added++; }
    }
  } catch (e) {}

  return "Reel built: " + clips.numItems + " scenes, " + added + " transitions. Add music on A1 and export 1080x1920.";
})();
