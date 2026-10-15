(() => {
  "use strict";

  // Keep release markers separate from settings, favorite records, and source observations.
  const PENDING_KEY = "pendingUpdateSummary";
  const SEEN_KEY = "seenUpdateSummaryVersion";

  // Describe completed candidate behavior without claiming an approved store release.
  const NOTES = Object.freeze({
    "2.0.4": Object.freeze([
      "Fixes the empty Pipeline Export preview caused by Chrome's message routing.",
      "Preview and Download ZIP stay bound to the original Packages document.",
      "Designer-recorded filtering and temporary advanced confirmation are unchanged.",
    ]),
    "2.0.2": Object.freeze([
      "Export latest published pipelines, APIs, and Sub-Pipelines from Integration Packages.",
      "Preview all eligible packages or select one, then download a package-folder ZIP.",
      "Default exports use Shared From sources; settings and JSON backups remain separate.",
    ]),
    "2.0.1": Object.freeze([
      "Pipeline export previews now open in a separate tab.",
      "Previews use saved Designer sources and include records beyond search display limits.",
      "Authenticated ZIP downloads remain disabled while their adapter is completed.",
    ]),
    "2.0.0": Object.freeze([
      "Settings are grouped by navigation, Packages, and Designer.",
      "ZIP pipeline export is in development; downloads are not enabled yet.",
      "JSON backup and restore remain available under Export & Backup.",
    ]),
  });

  // Repeated manual reloads must not redisplay a version already dismissed.
  async function recordUpdate(details, storage, version) {
    if (details?.reason !== "update" || details.previousVersion === version || !NOTES[version]) return;
    const saved = await storage.get({ [SEEN_KEY]: "" });
    if (saved[SEEN_KEY] === version) return;
    await storage.set({ [PENDING_KEY]: { version } });
  }

  // Reject stale markers so an older popup cannot display another release's notes.
  function notesFor(saved, version) {
    if (saved?.[PENDING_KEY]?.version !== version || saved?.[SEEN_KEY] === version) return [];
    return NOTES[version] || [];
  }

  // The worker and popup share only these small, deterministic release rules.
  globalThis.UpdateSummary = Object.freeze({ PENDING_KEY, SEEN_KEY, recordUpdate, notesFor });
})();
