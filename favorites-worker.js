"use strict";

// Serialize favorites writes and imports so separate tabs cannot overwrite another tenant's map.
let pendingFavoriteUpdate = Promise.resolve();

// Identify only correctly assigned recovery copies whose pins already exist in the active tenant list.
function verifiedRecoveryCandidates(settings) {
  const data = FavoritesData;
  return Object.entries(settings[data.LEGACY] || {}).filter(([oldKey, packages]) => {
    try {
      const assignedKey = settings[data.ASSIGNED]?.[oldKey];
      if (!assignedKey || data.key(data.fromKey(assignedKey)) !== assignedKey || data.legacyKey(data.fromKey(assignedKey)) !== oldKey || !Object.hasOwn(settings[data.KEY] || {}, assignedKey)) return false;
      const current = data.items(settings[data.KEY][assignedKey]);
      // Compare pin identities through the existing major-version merge rules, preserving active order/layout.
      return JSON.stringify(data.merge(current, packages)) === JSON.stringify(current);
    } catch (_error) {
      // Unknown, malformed, mismatched, or incomplete copies remain untouched for recovery.
      return false;
    }
  }).map(([oldKey]) => oldKey);
}

// Retire duplicates only after a durable read-back; cleanup failure must not hide successfully saved favorites.
async function retireVerifiedRecoveryCopies(expected) {
  const data = FavoritesData;
  const candidates = verifiedRecoveryCandidates(expected);
  if (!candidates.length) return;
  try {
    // Verify one batch, not each pipeline, behind the existing serialized favorites writer.
    const saved = await chrome.storage.local.get({ [data.KEY]: {}, [data.LEGACY]: {}, [data.ASSIGNED]: {} });
    const verified = new Set(verifiedRecoveryCandidates(saved));
    const remaining = { ...saved[data.LEGACY] };
    let changed = false;
    for (const oldKey of candidates) {
      const assignedKey = expected[data.ASSIGNED][oldKey];
      // An unexpected read-back or changed association is not confirmation that deletion is safe.
      if (!verified.has(oldKey) || saved[data.ASSIGNED]?.[oldKey] !== assignedKey ||
          JSON.stringify(data.items(saved[data.KEY][assignedKey])) !== JSON.stringify(data.items(expected[data.KEY][assignedKey])) ||
          JSON.stringify(data.items(remaining[oldKey])) !== JSON.stringify(data.items(expected[data.LEGACY][oldKey]))) continue;
      delete remaining[oldKey];
      changed = true;
    }
    // Keep: only duplicate recovery package data is removed; ownership markers and active favorites remain (1.22.4).
    if (changed) await chrome.storage.local.set({ [data.LEGACY]: remaining });
  } catch (_error) {
    // Retain the copy for a future verified visit without exposing institution data in the log.
    console.warn('Integration Navigator: old favorite copies could not be cleaned up. They remain saved.');
  }
}

chrome.runtime.onMessage.addListener((message, sender, respond) => {
  if (sender.id !== chrome.runtime.id || !['favorites-prepare', 'favorites-save', 'favorites-assign', 'favorites-import'].includes(message?.type)) return;
  pendingFavoriteUpdate = pendingFavoriteUpdate.catch(() => {}).then(async () => {
    const data = FavoritesData;
    // Only an extension popup can import backups or confirm assignment of an old list.
    const popupSender = sender.url === chrome.runtime.getURL('popup.html');
    if (!['favorites-save', 'favorites-prepare'].includes(message.type) && sender.tab && !popupSender) throw new Error('Open settings to restore favorites.');
    if (message.type === 'favorites-prepare' && !sender.tab) throw new Error('Open an Integration page first.');
    const settings = await chrome.storage.local.get(data.defaults);
    const pins = { ...settings[data.KEY] };
    const expanded = { ...settings[data.EXPANDED] };
    const heights = { ...settings[data.HEIGHTS] };
    const assigned = { ...settings[data.ASSIGNED] };
    const writes = {};
    let importedSources = null;
    let preparedKey = '';
    let favoriteWriteNeeded = true;
    if (message.type === 'favorites-import') {
      const incoming = data.backup(message.backup);
      if (!['merge', 'replace'].includes(message.mode)) throw new Error('Choose Merge or Replace.');
      // Replace only lists present in this file, never all browser favorites or other tenants.
      for (const group of incoming.favorites) {
        const key = data.key(group);
        const existed = Object.hasOwn(pins, key);
        pins[key] = message.mode === 'replace' ? group.packages : data.merge(pins[key] || [], group.packages);
        if (!existed || message.mode === 'replace') { expanded[key] = group.expanded; heights[key] = group.height; }
      }
      // Restore compact markers without overriding ownership already confirmed in this browser.
      for (const group of incoming.assignments) {
        const oldKey = data.legacyKey(group);
        if (!assigned[oldKey]) assigned[oldKey] = data.key(group);
      }
      // Retain old unassigned copies without replacing a list already associated with a tenant.
      const legacy = { ...settings[data.LEGACY] };
      for (const group of incoming.unassignedFavorites) {
        const key = data.legacyKey(group);
        legacy[key] = data.merge(legacy[key] || [], group.packages);
        // Current tenant lists in a backup are authoritative; do not reapply their older recovery copies.
        const matchingLists = incoming.favorites.filter((entry) => entry.site === group.site && entry.page === group.page);
        const assignedTenantId = group.assignedTenantId || (matchingLists.length === 1 ? matchingLists[0].tenantId : '');
        if (!assigned[key] && assignedTenantId) assigned[key] = data.key({ site: group.site, page: group.page, tenantId: assignedTenantId });
      }
      writes[data.LEGACY] = legacy;
      if (message.restoreSources === true) importedSources = incoming.environments;
    } else {
      // Verify against the isolated, current document rather than a stale SPA MessageSender URL.
      const pageSender = ['favorites-save', 'favorites-prepare'].includes(message.type) && sender.tab;
      const tabId = pageSender ? sender.tab.id : message.tabId;
      if (!Number.isInteger(tabId) || (pageSender && (sender.frameId !== 0 || !sender.documentId))) throw new Error('Open an Integration page first.');
      const context = await chrome.tabs.sendMessage(tabId, { type: 'favorites-context' }, pageSender ? { documentId: sender.documentId, frameId: 0 } : { frameId: 0 });
      const current = data.scope(context?.scope);
      const key = data.key(current);
      if (key !== data.key(message.scope) || (message.type !== 'favorites-prepare' && !context.loaded) || !context.url || new URL(context.url).origin !== current.site) throw new Error('Tenant changed or is still loading. Try again.');
      const url = new URL(context.url);
      if (!['/data-connect/home', '/data-connect-designer'].some((path) => url.pathname.toLowerCase().includes(path))) throw new Error('Open an Integration page first.');
      if (pageSender && new URL(sender.url).origin !== current.site) throw new Error('Favorite site changed.');
      if (!CustomSites.defaults().includes(current.site) && (!(await CustomSites.readSites()).includes(current.site) || !await chrome.permissions.contains({ origins: [CustomSites.pattern(current.site)] }))) throw new Error('Enable access to this site first.');
      if (message.type === 'favorites-prepare') {
        preparedKey = key;
        favoriteWriteNeeded = !Object.hasOwn(pins, key);
        // Record a verified visit even without pins, so a later tenant is not mistaken for the first.
        if (favoriteWriteNeeded) pins[key] = [];
        const knownTenants = new Set([current.tenantId]);
        for (const storedKey of Object.keys(pins)) {
          try {
            const storedScope = data.fromKey(storedKey);
            if (storedScope.site === current.site) knownTenants.add(storedScope.tenantId);
          } catch (_error) { /* A malformed unrelated key cannot choose a migration destination. */ }
        }
        // Keep: use the actual first detected tenant only; known multi-tenant domains still require assignment (1.22.1).
        const oldKey = data.legacyKey(current);
        const oldItems = settings[data.LEGACY]?.[oldKey];
        if (knownTenants.size === 1 && !assigned[oldKey] && Array.isArray(oldItems) && oldItems.length) {
          pins[key] = data.merge(pins[key], oldItems);
          assigned[oldKey] = key;
          // Carry the old layout only when the new list has not already been adjusted.
          if (!Object.hasOwn(expanded, key)) expanded[key] = expanded[oldKey] !== false;
          if (!Object.hasOwn(heights, key)) heights[key] = heights[oldKey] ?? null;
          favoriteWriteNeeded = true;
        }
      } else if (message.type === 'favorites-assign') {
        const oldKey = data.legacyKey(current);
        if (assigned[oldKey]) throw new Error('This old list has already been assigned.');
        pins[key] = data.merge(pins[key] || [], settings[data.LEGACY]?.[oldKey] || []);
        if (!Object.hasOwn(expanded, key)) expanded[key] = expanded[oldKey] !== false;
        if (!Object.hasOwn(heights, key)) heights[key] = heights[oldKey] ?? null;
        assigned[oldKey] = key;
      } else {
        // Patch only the changed field so resizing cannot revert a concurrent pin edit.
        if (Object.hasOwn(message, 'packages')) pins[key] = data.items(message.packages);
        if (typeof message.expanded === 'boolean') expanded[key] = message.expanded;
        if (Number.isFinite(message.height) && message.height >= 64 && message.height <= 360) heights[key] = message.height;
      }
    }
    // Stop before writing if the combined backup exceeds a predictable local budget.
    Object.assign(writes, { [data.KEY]: pins, [data.EXPANDED]: expanded, [data.HEIGHTS]: heights, [data.ASSIGNED]: assigned });
    if (JSON.stringify(writes).length > 4000000) throw new Error('Favorites backup is too large. Export your data first.');
    if (importedSources !== null) {
      // Commit the chosen source data and favorites together behind the source writer/opt-out queue.
      pendingOwnershipUpdate = pendingOwnershipUpdate.catch(() => {}).then(async () => {
        const sources = await chrome.storage.local.get({ sharedFromEnabled: false, designerOwnershipCache: {} });
        if (!sources.sharedFromEnabled) throw new Error('Enable Shared From before restoring its data.');
        const cache = { ...sources.designerOwnershipCache };
        for (const group of importedSources) {
          const checkedAt = Date.parse(group.lastCheckedAt);
          if ((cache[group.environmentId]?.checkedAt || 0) <= checkedAt) cache[group.environmentId] = { environment: group.environment, checkedAt,
            packages: group.packages.map((entry) => ({ name: entry.packageNameRecorded === false ? null : entry.name, pipelines: entry.pipelines,
              ...(entry.transformFunctions?.length ? { transformFunctions: entry.transformFunctions } : {}) })) };
        }
        if (JSON.stringify(cache).length > 1000000) throw new Error('Shared From backup exceeds the local cache limit.');
        await chrome.storage.local.set({ ...writes, designerOwnershipCache: cache });
      });
      await pendingOwnershipUpdate;
    } else if (favoriteWriteNeeded) await chrome.storage.local.set(writes);
    // Use the committed maps, including untouched legacy data when this operation did not import it.
    await retireVerifiedRecoveryCopies({ ...settings, ...writes });
    // Load the prepared snapshot only after migration succeeds, avoiding an empty-list upgrade flash.
    respond({ ok: true, ...(preparedKey ? { packages: pins[preparedKey], expanded: expanded[preparedKey] !== false,
      height: heights[preparedKey] ?? null } : {}) });
  }).catch((error) => {
    // Report a short known failure without logging package names or personal site URLs.
    respond({ ok: false, error: error.message || 'Could not save favorites. Try again.' });
  });
  return true;
});
