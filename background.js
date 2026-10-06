"use strict";

// Load the same validation and drawing rules used by the settings preview.
importScripts("icon-appearance.js", "custom-sites.js");
let pendingIconUpdate = Promise.resolve();

// Serialize site changes so a removal cannot race an earlier registration request.
let pendingSiteUpdate = Promise.resolve();
function updateSites(removeOrigin) {
  pendingSiteUpdate = pendingSiteUpdate.catch(() => {}).then(async () => {
    // Finish removal before reconciling grants so a queued refresh cannot restore it.
    if (removeOrigin !== undefined) await CustomSites.removeSite(removeOrigin);
    await CustomSites.sync();
  });
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

// Keep site completion in the worker; closing the popup does not cancel the operation.
chrome.runtime.onMessage.addListener((message, sender, respond) => {
  if (message?.type !== CustomSites.MESSAGE || sender.id !== chrome.runtime.id || sender.tab) return;
  updateSites(message.removeOrigin).then(
    () => respond({ ok: true }),
    (error) => respond({ ok: false, error: error.message }),
  );
  return true;
});

// Serialize complete Designer snapshots so simultaneous tabs cannot lose each other's data.
let pendingOwnershipUpdate = Promise.resolve();

// Preserve older observed names once, without inventing a package relationship or a newer timestamp.
function upgradeOwnershipCache() {
  pendingOwnershipUpdate = pendingOwnershipUpdate.catch(() => {}).then(async () => {
    const settings = await chrome.storage.local.get({ sharedFromEnabled: false, designerOwnershipCache: {} });
    if (settings.sharedFromEnabled !== true) return;
    const cache = { ...settings.designerOwnershipCache };
    let changed = false;
    // Converted snapshots use the new grouped shape; later worker wakeups make no changes.
    for (const [tenantId, entry] of Object.entries(cache)) {
      if (Array.isArray(entry?.packages) || !Array.isArray(entry?.pipelines)) continue;
      const pipelines = [...new Set(entry.pipelines.filter((name) => typeof name === 'string' && name.trim()).map((name) => name.trim().slice(0, 500)))].sort();
      cache[tenantId] = { environment: entry.environment, checkedAt: entry.checkedAt,
        // A null name explicitly means the package has not yet been observed.
        packages: pipelines.length ? [{ name: null, pipelines }] : [] };
      changed = true;
    }
    // Write only source metadata; never touch favorites, consent, or unrelated preferences.
    if (changed) {
      // Keep the same size ceiling even when adding the small unknown-package wrapper.
      if (JSON.stringify(cache).length > 1000000) throw new Error('Source cache is full. Revisit Designer to update it.');
      await chrome.storage.local.set({ designerOwnershipCache: cache });
    }
  }).catch(() => console.warn('Could not organize saved Designer sources. Revisit Designer to update them.'));
}

// Queue the one-time conversion before new snapshots or opt-out clearing can run.
upgradeOwnershipCache();
chrome.runtime.onMessage.addListener((message, sender, respond) => {
  if (message?.type !== "designer-ownership-save" || sender.id !== chrome.runtime.id || !sender.tab) return;
  pendingOwnershipUpdate = pendingOwnershipUpdate.catch(() => {}).then(async () => {
    // Only accept the approved feature from an allowed HTTPS Designer page.
    const url = new URL(sender.url || sender.tab.url);
    if (url.protocol !== "https:" || !/\/data-connect-designer\/?$/iu.test(url.pathname)) throw new Error("Not a Designer page.");
    const settings = await chrome.storage.local.get({ sharedFromEnabled: false, designerOwnershipCache: {} });
    if (settings.sharedFromEnabled !== true) return;
    const builtIn = CustomSites.defaults().includes(url.origin);
    if (!builtIn && (!(await CustomSites.readSites()).includes(url.origin) || !await chrome.permissions.contains({ origins: [CustomSites.pattern(url.origin)] }))) throw new Error("Site access is not enabled.");

    // Keep only bounded names and environment labels; never save page state or payloads.
    const clean = (value) => typeof value === "string" ? value.trim().slice(0, 500) : "";
    const tenantId = clean(message.tenantId);
    const environment = clean(message.environment);
    if (!tenantId || !environment || !Array.isArray(message.packages) || message.packages.length > 10000) throw new Error("Incomplete Designer source information.");
    const packagesByName = new Map();
    let pipelineCount = 0;
    // Validate the total input budget before merging duplicate package/version rows.
    for (const entry of message.packages) {
      const name = clean(entry?.name);
      if (!name || !Array.isArray(entry?.pipelines)) throw new Error("Incomplete Designer package information.");
      pipelineCount += entry.pipelines.length;
      if (pipelineCount > 10000) throw new Error("Too many Designer pipeline names.");
      const names = packagesByName.get(name) || new Set();
      // Keep only names; versions, descriptions, and pipeline contents are discarded.
      entry.pipelines.forEach((value) => { const pipeline = clean(value); if (pipeline) names.add(pipeline); });
      packagesByName.set(name, names);
    }
    // Sort once when saving so exported snapshots are easy to scan and compare.
    const packages = Array.from(packagesByName, ([name, names]) => ({ name, pipelines: [...names].sort() }))
      .sort((left, right) => left.name < right.name ? -1 : left.name > right.name ? 1 : 0);
    // An empty completed snapshot removes this environment's previously observed names.
    const cache = { ...settings.designerOwnershipCache, [tenantId]: { environment, packages, checkedAt: Date.now() } };
    // Bound this optional cache without requesting additional storage permission.
    if (JSON.stringify(cache).length > 1000000) throw new Error("Source cache is full. Turn Shared From off to clear it.");
    await chrome.storage.local.set({ designerOwnershipCache: cache });
  });
  pendingOwnershipUpdate.then(() => respond({ ok: true }), (error) => respond({ ok: false, error: error.message }));
  return true;
});

// Clearing is queued behind writes, so disabling cannot leave a late snapshot behind.
chrome.storage.onChanged.addListener((changes, area) => {
  if (area !== "local" || changes.sharedFromEnabled?.newValue !== false) return;
  pendingOwnershipUpdate = pendingOwnershipUpdate.catch(() => {}).then(() => chrome.storage.local.remove("designerOwnershipCache"))
    .catch(() => console.warn("Unable to clear the Designer source cache. Turn Shared From off again to retry."));
});

// Restore the saved icon whenever the browser starts this short-lived worker.
updateIcon();
restoreSites();
