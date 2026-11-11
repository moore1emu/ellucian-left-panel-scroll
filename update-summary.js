(() => {
  "use strict";

  // Keep release markers separate from settings, favorite records, and source observations.
  const PENDING_KEY = "pendingUpdateSummary";
  const SEEN_KEY = "seenUpdateSummaryVersion";

  // Carry these user-visible changes through every candidate until the next store publication.
  const LAST_PUBLISHED_VERSION = "1.22.8";
  const RELEASE_NOTES = Object.freeze([
    "Star apps in the nine-dot Capabilities menu to add shortcuts beside Tasks. Open them in the current tab from Home, apps, card pages, and approved custom sites.",
    "View job run files as expandable JSON or CSV tables. Scroll across wide files or wrap long values while keeping CSV headings on one line.",
    "Use Formatted view to return to the original text, or turn off the viewer in Page Behavior. Your formatting and wrapping choices are remembered.",
    "Unpin pipelines even after their names or versions change. Unpinning also removes duplicate favorites for that pipeline and major version.",
    "Integration Packages now shows the latest published Sub-Pipeline release in each major version.",
  ]);

  // Repeated manual reloads must not redisplay a version already dismissed.
  async function recordUpdate(details, storage, version) {
    if (details?.reason !== "update" || details.previousVersion === version || version === LAST_PUBLISHED_VERSION) return;
    const saved = await storage.get({ [SEEN_KEY]: "" });
    if (saved[SEEN_KEY] === version) return;
    await storage.set({ [PENDING_KEY]: { version } });
  }

  // Reject stale markers so an older popup cannot display another release's notes.
  function notesFor(saved, version) {
    if (saved?.[PENDING_KEY]?.version !== version || saved?.[SEEN_KEY] === version) return [];
    return RELEASE_NOTES;
  }

  // The worker and popup share only these small, deterministic release rules.
  globalThis.UpdateSummary = Object.freeze({ PENDING_KEY, SEEN_KEY, LAST_PUBLISHED_VERSION, recordUpdate, notesFor });
})();
