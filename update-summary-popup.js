(() => {
  "use strict";

  // Render the version queued by the worker without changing any user preference.
  const version = chrome.runtime.getManifest().version;
  const card = document.querySelector("#update-summary");
  const list = document.querySelector("#update-summary-items");
  const dismiss = document.querySelector("#dismiss-update-summary");
  const status = document.querySelector("#update-summary-status");

  // Failed reads leave the optional card hidden and ordinary settings usable.
  chrome.storage.local.get({ [UpdateSummary.PENDING_KEY]: null, [UpdateSummary.SEEN_KEY]: "" }, (saved) => {
    if (chrome.runtime.lastError) return;
    const notes = UpdateSummary.notesFor(saved, version);
    if (!notes.length) return;
    document.querySelector("#update-summary-title").textContent = `What's New in ${version}`;
    for (const note of notes) {
      // Treat release text as plain content, not HTML.
      const item = document.createElement("li");
      item.textContent = note;
      list.appendChild(item);
    }
    card.hidden = false;
  });

  // Save this version alone; do not clear a marker queued by a newer worker.
  dismiss.addEventListener("click", () => {
    dismiss.disabled = true;
    status.textContent = "";
    chrome.storage.local.set({ [UpdateSummary.SEEN_KEY]: version }, () => {
      const failed = Boolean(chrome.runtime.lastError);
      dismiss.disabled = false;
      if (failed) { status.textContent = "Could not dismiss. Please try again."; return; }
      card.hidden = true;
      // Return focus to the active task, preserving whichever settings the user is viewing.
      document.querySelector('.settings-tabs [aria-selected="true"]').focus();
    });
  });
})();
