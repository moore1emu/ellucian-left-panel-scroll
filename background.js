"use strict";

// Load the same validation and drawing rules used by the settings preview.
importScripts("icon-appearance.js", "custom-sites.js");
let pendingIconUpdate = Promise.resolve();

// Serialize site changes so a removal cannot race an earlier registration request.
let pendingSiteUpdate = Promise.resolve();
function updateSites() {
  pendingSiteUpdate = pendingSiteUpdate.catch(() => {}).then(CustomSites.sync);
  return pendingSiteUpdate;
}

// Report background failures while keeping subsequent registration attempts usable.
function restoreSites() {
  updateSites().catch((error) => console.warn("Unable to update custom sites:", error));
}

// Read the latest saved choice when each queued update runs, avoiding stale writes.
function updateIcon() {
  pendingIconUpdate = pendingIconUpdate.then(async () => {
    const settings = await chrome.storage.local.get({ [IconAppearance.KEY]: IconAppearance.DEFAULT });
    const appearance = IconAppearance.normalize(settings[IconAppearance.KEY]);

    // Reuse the crisp black-E toolbar artwork when resetting to the default.
    if (IconAppearance.isDefault(appearance)) {
      const path = Object.fromEntries(IconAppearance.SIZES.map((size) => [size, `icons/toolbar${size}.png`]));
      await chrome.action.setIcon({ path });
      return;
    }

    // Generate local static artwork at every supported toolbar display scale.
    const imageData = IconAppearance.render(appearance, (size) => new OffscreenCanvas(size, size));
    await chrome.action.setIcon({ imageData });
  }).catch((error) => {
    // Keep the worker usable after an API failure without discarding the saved choice.
    console.warn("Unable to update the extension icon:", error);
  });
  return pendingIconUpdate;
}

// Register wake-up events immediately so settings survive installs and restarts.
chrome.runtime.onInstalled.addListener(updateIcon);
chrome.runtime.onStartup.addListener(updateIcon);
chrome.runtime.onInstalled.addListener(restoreSites);
chrome.runtime.onStartup.addListener(restoreSites);
chrome.permissions.onAdded.addListener(restoreSites);
chrome.permissions.onRemoved.addListener(restoreSites);
chrome.storage.onChanged.addListener((changes, area) => {
  // Ignore unrelated favorites and width changes; no polling is needed.
  if (area === "local" && Object.hasOwn(changes, IconAppearance.KEY)) updateIcon();
  // Register new domains and unregister removed ones without polling open tabs.
  if (area === "local" && Object.hasOwn(changes, CustomSites.KEY)) restoreSites();
});

// Acknowledge registration before the popup asks the user to refresh their page.
chrome.runtime.onMessage.addListener((message, sender, respond) => {
  if (message?.type !== CustomSites.MESSAGE || sender.id !== chrome.runtime.id || sender.tab) return;
  updateSites().then(() => respond({ ok: true }), () => respond({ ok: false }));
  return true;
});

// Restore the saved icon whenever the browser starts this short-lived worker.
updateIcon();
restoreSites();
