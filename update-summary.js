(() => {
  "use strict";

  // Keep release markers separate from settings, favorite records, and source observations.
  const PENDING_KEY = "pendingUpdateSummary";
  const SEEN_KEY = "seenUpdateSummaryVersion";

  // Carry these user-visible changes through every candidate until the next store publication.
  const LAST_PUBLISHED_VERSION = "1.22.8";
  const RELEASE_NOTES = Object.freeze([
    "Star apps in Experience Home’s Capabilities menu to add links to your header.",
    "Expand JSON or view CSV tables in Job Run Files.",
    "Bug fixes.",
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
