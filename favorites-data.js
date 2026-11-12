"use strict";

// Share bounded, credential-free backup rules between the worker, popup, and isolated page.
globalThis.FavoritesData = (() => {
  const CAPABILITY_PREFIX = 'capabilityPins:';
  const CAPABILITIES_ENABLED = 'capabilitiesFavoritesEnabled';
  const KEY = 'favoritePackagesByTenant';
  const LEGACY = 'favoritePackagesByHost';
  const EXPANDED = 'favoritesExpandedByHost';
  const HEIGHTS = 'favoritesHeightsByHost';
  const ASSIGNED = 'favoriteTenantAssignments';
  const defaults = { [KEY]: {}, [LEGACY]: {}, [EXPANDED]: {}, [HEIGHTS]: {}, [ASSIGNED]: {} };
  const text = (value) => typeof value === 'string' ? value.trim().slice(0, 500) : '';
  const identity = (value) => text(value).replace(/\s+/gu, ' ').toLocaleLowerCase();
  const pipelineKey = (value) => `${identity(value.name)}\u0000${identity(value.version).replace(/^v(?=\d)/u, '').match(/^\d+/u)?.[0] || identity(value.version)}`;

  // Use a tuple, not a delimiter, so site, tenant, and page cannot accidentally collide.
  function scope(value) {
    const url = new URL(value?.site);
    if (url.protocol !== 'https:' || url.username || url.password || value.site !== url.origin || !text(value.tenantId) || !['packages', 'designer'].includes(value.page)) throw new Error('Invalid favorite scope.');
    return { site: url.origin, tenantId: text(value.tenantId), page: value.page };
  }
  const key = (value) => { const clean = scope(value); return JSON.stringify([clean.site, clean.tenantId, clean.page]); };
  const fromKey = (value) => { const [site, tenantId, page] = JSON.parse(value); return scope({ site, tenantId, page }); };
  const legacyKey = (value) => `${new URL(value.site).host}|${value.page}`;

  // Reject oversized or malformed imports instead of silently dropping a user's pins.
  function items(values) {
    if (!Array.isArray(values) || values.length > 500) throw new Error('Invalid or oversized favorites list.');
    const groups = new Map();
    for (const value of values) {
      if (!text(value?.packageName) || !Array.isArray(value.pipelines) || value.pipelines.length > 500) throw new Error('Invalid favorite package.');
      const pipelines = new Map();
      for (const pipeline of value.pipelines) {
        if (!text(pipeline?.name) || typeof pipeline.version !== 'string') throw new Error('Invalid favorite pipeline.');
        const clean = { name: text(pipeline.name), originalName: text(pipeline.originalName), version: text(pipeline.version) };
        pipelines.set(pipelineKey(clean), clean);
      }
      const clean = { packageName: text(value.packageName), packagePinned: value.packagePinned === true,
        pipelines: [...pipelines.values()], pipelinesExpanded: value.pipelinesExpanded !== false };
      // Preserve pipeline-only parents, but discard groups with no actual pins.
      if (clean.packagePinned || clean.pipelines.length) groups.set(identity(clean.packageName), clean);
    }
    return [...groups.values()];
  }

  // Keep existing order and disclosure choices; append only previously missing pins.
  function merge(existing, incoming) {
    const result = items(existing);
    for (const group of items(incoming)) {
      const previous = result.find((entry) => identity(entry.packageName) === identity(group.packageName));
      if (!previous) { result.push(group); continue; }
      previous.packagePinned ||= group.packagePinned;
      for (const pipeline of group.pipelines) {
        if (!previous.pipelines.some((entry) => pipelineKey(entry) === pipelineKey(pipeline))) previous.pipelines.push(pipeline);
      }
    }
    // Revalidate combined counts before any write, including individually valid large files.
    return items(result);
  }

  // Import only names, labels, tenant identifiers, and original observation dates.
  function sources(environments) {
    if (!Array.isArray(environments) || environments.length > 100) throw new Error('Invalid source environments.');
    let count = 0;
    return environments.map((entry) => {
      const checkedAt = Date.parse(entry.lastCheckedAt);
      if (!text(entry.environmentId) || !text(entry.environment) || !Number.isFinite(checkedAt) || checkedAt <= 0 || checkedAt > Date.now() + 60000 || !Array.isArray(entry.packages) || entry.packages.length > 10000) throw new Error('Invalid source snapshot.');
      const packages = entry.packages.map((group) => {
        if (!Array.isArray(group?.pipelines) || (group.packageNameRecorded !== false && !text(group.name))) throw new Error('Invalid source package.');
        count += group.pipelines.length;
        if (count > 10000 || group.pipelines.some((name) => !text(name))) throw new Error('Invalid or oversized source names.');
        return { name: group.packageNameRecorded === false ? 'Package Not Yet Recorded' : text(group.name),
          ...(group.packageNameRecorded === false ? { packageNameRecorded: false } : {}), pipelines: [...new Set(group.pipelines.map(text))] };
      });
      return { environmentId: text(entry.environmentId), environment: text(entry.environment), lastCheckedAt: new Date(checkedAt).toISOString(), packages };
    });
  }

  // Use the same storage identities as existing installs, including separate tenants at a root Home URL.
  function capabilityKey({home, tenantId}) {
    const url = new URL(home);
    if (url.protocol !== 'https:' || url.href !== home || url.username || url.password || /[?#]/u.test(home) ||
        !url.pathname.endsWith('/') || url.pathname.includes('//')) throw new Error('Invalid Capabilities Home URL.');
    if (url.pathname === '/') {
      if (typeof tenantId !== 'string' || !tenantId.trim() || tenantId.trim() !== tenantId) throw new Error('Missing Capabilities tenant.');
      return CAPABILITY_PREFIX + home + ':tenant:' + tenantId;
    }
    if (tenantId !== undefined) throw new Error('Unexpected Capabilities tenant.');
    return CAPABILITY_PREFIX + home;
  }

  function capabilityScope(key) {
    if (typeof key !== 'string' || !key.startsWith(CAPABILITY_PREFIX)) throw new Error('Invalid Capabilities list.');
    const suffix = key.slice(CAPABILITY_PREFIX.length);
    const root = new URL(suffix).origin + '/';
    const scope = suffix.startsWith(root + ':tenant:') ? {home:root, tenantId:suffix.slice((root + ':tenant:').length)} : {home:suffix};
    if (capabilityKey(scope) !== key) throw new Error('Invalid Capabilities list.');
    return scope;
  }

  // Accept only same-tenant app paths and local sprite identifiers that the menu can safely render.
  function capabilityApps(home, apps) {
    if (!Array.isArray(apps)) throw new Error('Invalid Capabilities favorites.');
    const base = new URL(home);
    const unique = new Map();
    for (const item of apps) {
      if (typeof item?.path !== 'string' || !item.path.startsWith(base.pathname + 'app/')) throw new Error('Invalid Capabilities app path.');
      const link = new URL(item.path, home);
      if (link.origin !== base.origin || link.pathname !== item.path || typeof item.name !== 'string' ||
          !item.name.trim() || item.name.length > 256 || (item.icon !== undefined && item.icon !== '' && (typeof item.icon !== 'string' || !/^#ds-icon-[a-z0-9-]+$/iu.test(item.icon)))) throw new Error('Invalid Capabilities favorite.');
      if (!unique.has(item.path)) unique.set(item.path,{path:item.path, name:item.name.trim(), icon:item.icon || ''});
    }
    return [...unique.values()];
  }

  function capabilityBackup(value) {
    if (typeof value?.enabled !== 'boolean' || !Array.isArray(value.lists)) throw new Error('Invalid Capabilities backup.');
    const seen = new Set();
    const lists = value.lists.map(group => {
      const key = capabilityKey(group);
      if (seen.has(key)) throw new Error('Repeated Capabilities list.');
      seen.add(key);
      return {...capabilityScope(key), apps:capabilityApps(group.home, group.apps)};
    });
    return {enabled:value.enabled, lists};
  }

  // Require a known backup format; parsing JSON never executes its contents.
  function backup(value) {
    if (value?.format !== 'integration-navigator-backup' || value.schemaVersion !== 1 || !Array.isArray(value.favorites) || value.favorites.length > 200 || !Array.isArray(value.unassignedFavorites) || value.unassignedFavorites.length > 200) throw new Error('Choose an Integration Navigator backup JSON file.');
    const favorites = value.favorites.map((entry) => ({ ...scope(entry), packages: items(entry.packages), expanded: entry.expanded !== false,
      height: Number.isFinite(entry.height) && entry.height >= 64 && entry.height <= 360 ? entry.height : null }));
    // Keep: preserve migration ownership without retaining duplicate package data in new backups (1.22.4).
    if (value.assignments !== undefined && (!Array.isArray(value.assignments) || value.assignments.length > 200)) throw new Error('Invalid favorite assignments.');
    const assignmentMap = new Map();
    for (const entry of value.assignments || []) {
      const clean = scope(entry);
      if (!favorites.some((group) => key(group) === key(clean))) throw new Error('The old-list assignment has no matching tenant list.');
      const oldKey = legacyKey(clean);
      if (assignmentMap.has(oldKey) && key(assignmentMap.get(oldKey)) !== key(clean)) throw new Error('Conflicting favorite assignments.');
      assignmentMap.set(oldKey, clean);
    }
    const unassignedFavorites = value.unassignedFavorites.map((entry) => {
      // Retain an existing migration association so restoring a backup cannot revive removed pins.
      const clean = scope({ ...entry, tenantId: 'unassigned' });
      const assignedTenantId = entry.assignedTenantId === undefined ? '' : scope({ ...clean, tenantId: entry.assignedTenantId }).tenantId;
      if (assignedTenantId && !favorites.some((group) => group.site === clean.site && group.page === clean.page && group.tenantId === assignedTenantId)) throw new Error('The old-list assignment has no matching tenant list.');
      // Reject conflicting ownership before an older backup can modify any saved data.
      const assignment = assignedTenantId ? scope({ ...clean, tenantId: assignedTenantId }) : null;
      if (assignment && assignmentMap.has(legacyKey(clean)) && key(assignmentMap.get(legacyKey(clean))) !== key(assignment)) throw new Error('Conflicting favorite assignments.');
      return { site: clean.site, page: clean.page, packages: items(entry.packages), ...(assignedTenantId ? { assignedTenantId } : {}) };
    });
    return { format: value.format, schemaVersion: 1, favorites, unassignedFavorites, assignments: [...assignmentMap.values()],
      ...(value.capabilityFavorites === undefined ? {} : {capabilityFavorites:capabilityBackup(value.capabilityFavorites)}), environments: sources(value.environments || []) };
  }

  // Export unresolved recovery copies and compact assignment markers, not cleaned-up duplicate pins.
  function exportData(settings, version) {
    const favorites = Object.entries(settings[KEY] || {}).map(([storedKey, packages]) => ({ ...fromKey(storedKey), packages: items(packages),
      expanded: settings[EXPANDED]?.[storedKey] !== false, height: settings[HEIGHTS]?.[storedKey] ?? null }));
    const unassignedFavorites = Object.entries(settings[LEGACY] || {}).map(([storedKey, packages]) => {
      const split = storedKey.lastIndexOf('|');
      const assignment = settings[ASSIGNED]?.[storedKey];
      return { site: `https://${storedKey.slice(0, split)}`, page: storedKey.slice(split + 1), packages: items(packages),
        ...(assignment ? { assignedTenantId: fromKey(assignment).tenantId } : {}) };
    });
    // Include only valid site/page associations; malformed markers must not masquerade as another list.
    const assignments = Object.entries(settings[ASSIGNED] || {}).map(([oldKey, assignedKey]) => {
      const clean = fromKey(assignedKey);
      if (legacyKey(clean) !== oldKey) throw new Error('Invalid favorite assignment.');
      return clean;
    });
    const environments = Object.entries(settings.designerOwnershipCache || {}).map(([environmentId, entry]) => ({ environmentId, environment: entry.environment,
      lastCheckedAt: new Date(entry.checkedAt).toISOString(), packages: entry.packages.map((group) => group.name === null
        ? { name: 'Package Not Yet Recorded', packageNameRecorded: false, pipelines: group.pipelines } : group) }));
    // Discover per-site keys without exporting unrelated local settings or permissions.
    const lists = Object.keys(settings).filter(k => k.startsWith(CAPABILITY_PREFIX)).map(k => ({...capabilityScope(k), apps:settings[k]}));
    const capabilityFavorites = {enabled:settings[CAPABILITIES_ENABLED] !== false, lists};
    return { ...backup({ format: 'integration-navigator-backup', schemaVersion: 1, favorites, unassignedFavorites, assignments, environments, capabilityFavorites }), extensionVersion: version, exportedAt: new Date().toISOString() };
  }
  return Object.freeze({ CAPABILITIES_ENABLED, capabilityScope, capabilityKey, capabilityApps, KEY, LEGACY, EXPANDED, HEIGHTS, ASSIGNED, defaults, scope, key, fromKey, legacyKey, items, merge, backup, exportData });
})();
