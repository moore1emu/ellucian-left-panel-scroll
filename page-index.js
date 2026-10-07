(() => {
  "use strict";

  // Use a narrow message protocol shared only with this extension's search script.
  const MESSAGE_SOURCE = "ellucian-left-panel-scroll";
  const INDEX_REQUEST = "search-index-request";
  const INDEX_RESPONSE = "search-index-response";
  const INDEX_READY = "search-index-ready";
  const SHARED_STATUS_REQUEST = "shared-status-request";
  const SHARED_STATUS_RESPONSE = "shared-status-response";

  // Cache tenant details because many shared pipelines use the same destination.
  const tenantDetailsCache = new Map();
  // Reuse exact-version checks when multiple rows share the same release history.
  const sharedReleaseCache = new Map();
  // Remember only pipeline names already checked by the optional sharing column.
  const sharedArtifactNames = new Map();
  // Give larger packages more capacity while keeping one global sharing budget.
  const SHARING_REQUEST_LIMIT = 6;
  // Share one request budget across batches, including destination-name lookups.
  const sharingRequestQueue = [];
  const sharingCancelledError = new Error('Sharing checks were disabled.');
  let activeSharingRequests = 0;
  let designerModules = null;
  let sharingEnabled = false;
  let ownershipEnabled = false;

  // Read the React properties attached to one rendered package row.
  function getReactProperties(packageRow) {
    const propertyNames = Object.keys(packageRow);
    const propsKey = propertyNames.find((key) =>
      key.startsWith("__reactProps$"),
    );
    const fiberKey = propertyNames.find((key) =>
      key.startsWith("__reactFiber$"),
    );

    // Prefer the direct props cache and fall back to the host component's fiber.
    if (propsKey) {
      return packageRow[propsKey];
    }

    return fiberKey ? packageRow[fiberKey]?.memoizedProps : null;
  }

  // Extract only the package object that Ellucian already supplied to the row.
  function getPackageData(packageRow) {
    const properties = getReactProperties(packageRow);

    return (
      properties?.["package-element"] ??
      properties?.packageElement ??
      properties?.packageelement ??
      null
    );
  }

  // Convert untrusted page values to bounded strings before sharing them.
  function normalizeText(value) {
    return typeof value === "string" ? value.slice(0, 500) : "";
  }

  // Read the current tenant identifier without exposing the preloaded state.
  function getCurrentTenantId() {
    try {
      const preloadedState = window.__PRELOADED_STATE__;
      const parsedState =
        typeof preloadedState === "string"
          ? JSON.parse(window.atob(preloadedState))
          : preloadedState;

      const tenantId = normalizeText(parsedState?.tenant);
      if (tenantId) return tenantId;
    } catch (_error) {
      // Continue with Designer's loaded state when preloaded state is unavailable.
    }

    // Find the actual current environment already held by the Designer component.
    const row = document.querySelector('li[data-level="1"]');
    const fiberKey = row && Object.keys(row).find((key) => key.startsWith('__reactFiber$'));
    let fiber = fiberKey ? row[fiberKey] : null;
    for (let depth = 0; fiber && depth < 60; depth += 1, fiber = fiber.return) {
      const tenantId = normalizeText(fiber.stateNode?.state?.currentTenant);
      if (tenantId) return tenantId;
    }
    return "";
  }

  // Reuse Ellucian's authenticated helpers without reading or copying its token.
  function getDesignerModules() {
    if (designerModules) {
      return designerModules;
    }

    const designerChunks = window.webpackChunkdata_connect_designer;

    if (!Array.isArray(designerChunks)) {
      return null;
    }

    let webpackRequire = null;
    designerChunks.push([
      [`ellucian-left-panel-${Date.now()}`],
      {},
      (runtimeRequire) => {
        webpackRequire = runtimeRequire;
      },
    ]);

    if (!webpackRequire) {
      return null;
    }

    try {
      designerModules = {
        server: webpackRequire("./src/server/ServerHelper.js"),
        utils: webpackRequire("./src/Util/Utils.jsx"),
        semver: webpackRequire("./node_modules/semver/index.js"),
      };
    } catch (_error) {
      designerModules = null;
    }

    return designerModules;
  }

  // Start at most six sharing service requests across the entire page.
  function drainSharingRequests() {
    // Disabling rejects waiting work without interrupting already-started requests.
    if (!sharingEnabled) {
      sharingRequestQueue.splice(0).forEach((request) => request.reject(sharingCancelledError));
      return;
    }
    while (activeSharingRequests < SHARING_REQUEST_LIMIT && sharingRequestQueue.length) {
      const request = sharingRequestQueue.shift();
      activeSharingRequests += 1;
      // Recheck opt-in before calling the service, even if it changed this turn.
      Promise.resolve().then(() => {
        if (!sharingEnabled) throw sharingCancelledError;
        return request.run();
      }).then(request.resolve, request.reject).finally(() => {
        // Always free the slot after success, rejection, or a synchronous service error.
        activeSharingRequests -= 1;
        drainSharingRequests();
      });
    }
  }

  // Queue only new service calls; callers continue to reuse their cached promises.
  function queueSharingRequest(run) {
    return new Promise((resolve, reject) => {
      sharingRequestQueue.push({ run, resolve, reject });
      drainSharingRequests();
    });
  }

  // Resolve one destination once, keeping independent ownership refreshes unchanged.
  async function getTenantDetails(server, tenantId, sharingLookup = false) {
    if (tenantDetailsCache.has(tenantId)) {
      return tenantDetailsCache.get(tenantId);
    }

    // Only sharing destinations enter this queue; Shared From uses its existing flow.
    const lookup = sharingLookup ? queueSharingRequest(() => server.JR(tenantId)) : server.JR(tenantId);
    const tenantPromise = lookup
      .then((tenant) => ({
        accountName: normalizeText(tenant?.accountId),
        environment: normalizeText(tenant?.label),
        tenantId,
        tenantName: normalizeText(tenant?.name),
      }))
      .catch(() => {
        // A temporary lookup failure must not poison the bounded startup retry.
        // A cancelled older lookup must not remove a newer cached promise.
        if (tenantDetailsCache.get(tenantId) === tenantPromise) tenantDetailsCache.delete(tenantId);
        return { tenantId };
      });
    tenantDetailsCache.set(tenantId, tenantPromise);
    return tenantPromise;
  }

  // Scan loaded packages once per batch for exact validation and release history.
  function buildSharingInventory(entries) {
    const requestedNames = new Set(entries.map((entry) => entry.name));
    const currentVersions = new Map();
    const histories = new Map();
    document.querySelectorAll('li[data-level="1"]').forEach((row) => {
      const packageData = getPackageData(row);
      const pipelines = Array.isArray(packageData?.pipelines) ? packageData.pipelines : [];
      // Preserve the search index's named-package and rendered-attribute boundary.
      const validPackage = normalizeText(packageData?.name) &&
        (row.getAttribute('package-element') !== null || row.getAttribute('packageelement') !== null);
      pipelines.forEach((pipeline) => {
        const name = normalizeText(pipeline?.name);
        if (!requestedNames.has(name)) return;
        // Only an exact current page version can authorize a sharing lookup.
        if (validPackage) {
          if (!currentVersions.has(name)) currentVersions.set(name, new Set());
          currentVersions.get(name).add(normalizeText(pipeline?.version).replace(/^v/u, ''));
        }
        // Keep native exact names for history; normalization must not broaden matches.
        if (pipeline?.name !== name) return;
        if (!histories.has(name)) histories.set(name, new Set());
        const previousVersions = Array.isArray(pipeline.previousVersions) ? pipeline.previousVersions : [];
        [pipeline.version, ...previousVersions].forEach((version) => histories.get(name).add(version));
      });
    });
    return { currentVersions, histories };
  }

  // Check one exact published version using this batch's already-loaded history.
  async function getSharedStatus(entry, inventory) {
    const modules = getDesignerModules();
    const tenantId = getCurrentTenantId();

    // The sharing endpoint does not use the tenant argument in its URL.
    if (!modules || typeof modules.server.hL !== 'function') {
      return { key: entry.key, error: true, reason: 'Designer sharing service is not ready.' };
    }

    try {
      const artifactName = modules.utils.uz(
        entry.name,
        modules.utils._Y("pipeline"),
      );
      // Restrict later cache invalidation to artifacts this helper has looked up.
      sharedArtifactNames.set(entry.name, artifactName);
      // Use Ellucian's known release history to find older shared releases too.
      const cleanVersion = modules.semver.clean(entry.version);
      const knownVersions = new Set([cleanVersion]);
      (inventory.histories.get(entry.name) || []).forEach((version) => {
        const clean = typeof version === 'string' && modules.semver.clean(version);
        // Preserve same-major isolation while reusing the batch's inventory.
        if (clean && cleanVersion && modules.semver.major(clean) === modules.semver.major(cleanVersion)) knownVersions.add(clean);
      });
      const versions = Array.from(knownVersions).filter(Boolean).sort(modules.semver.rcompare);
      const latestByDestination = new Map();
      for (const version of versions) {
        // Stop additional traffic immediately when the user disables the column.
        if (!sharingEnabled) return { key: entry.key, error: true };
        const cacheKey = JSON.stringify([tenantId, artifactName, version]);
        if (!sharedReleaseCache.has(cacheKey)) {
          const releasePromise = queueSharingRequest(() => modules.server.hL(tenantId, 'pipeline', artifactName, version)).catch((error) => {
            // A cancelled queued call has no result to cache; allow a later opt-in retry.
            if (error === sharingCancelledError && sharedReleaseCache.get(cacheKey) === releasePromise) sharedReleaseCache.delete(cacheKey);
            throw error;
          });
          sharedReleaseCache.set(cacheKey, releasePromise);
        }
        const tenants = await sharedReleaseCache.get(cacheKey);
        if (!Array.isArray(tenants)) return { key: entry.key, error: true, reason: 'Ellucian could not return the complete sharing history.' };
        // Descending order keeps the newest shared release for each destination.
        tenants.forEach((tenant) => {
          const id = normalizeText(tenant?.tenantId ?? tenant?.id);
          if (id && !latestByDestination.has(id)) latestByDestination.set(id, version);
        });
      }
      const destinations = await Promise.all(Array.from(latestByDestination, async ([id, version]) => ({
        ...await getTenantDetails(modules.server, id, true), version,
        outdated: cleanVersion !== version,
      })));

      return {
        key: entry.key,
        destinations,
        shared: destinations.length > 0,
      };
    } catch (_error) {
      return { key: entry.key, error: true, reason: 'Designer sharing lookup failed. Try opening the native Share pipeline page.' };
    }
  }

  // Keep batch processing small; the shared service queue enforces the global limit.
  async function getSharedStatuses(entries, inventory) {
    const results = new Array(entries.length);
    let nextIndex = 0;

    async function runWorker() {
      while (nextIndex < entries.length) {
        // Stop queued requests as soon as the user disables the feature.
        if (!sharingEnabled) break;
        const currentIndex = nextIndex;
        nextIndex += 1;
        results[currentIndex] = await getSharedStatus(entries[currentIndex], inventory);
      }
    }

    await Promise.all(
      Array.from({ length: Math.min(SHARING_REQUEST_LIMIT, entries.length) }, runWorker),
    );
    return results;
  }

  // Build a minimal index containing names and versions, never credentials or payloads.
  function buildSearchIndex() {
    const packageRows = document.querySelectorAll(
      'li[data-level="1"][package-element], li[data-level="1"][packageelement]',
    );

    return Array.from(packageRows, (packageRow) => {
      const packageData = getPackageData(packageRow);
      const pipelines = Array.isArray(packageData?.pipelines)
        ? packageData.pipelines
        : [];

      // Keep just the fields needed to display and select search results.
      return {
        nodeId: normalizeText(packageRow.getAttribute("data-nodeid")),
        name: normalizeText(packageData?.name),
        version: normalizeText(packageData?.version),
        pipelines: pipelines.map((pipeline) => ({
          name: normalizeText(pipeline?.name),
          originalName: normalizeText(pipeline?.originalName),
          version: normalizeText(pipeline?.version),
        })),
      };
    }).filter((packageEntry) => packageEntry.name);
  }

  // Respond only to explicit index requests from the isolated search script.
  window.addEventListener("message", (event) => {
    if (
      event.source !== window ||
      event.data?.source !== MESSAGE_SOURCE ||
      event.data?.type !== INDEX_REQUEST
    ) {
      return;
    }

    // Count the rendered rows so the isolated script can detect a partial index.
    const packageRowsFound = document.querySelectorAll(
      'li[data-level="1"][package-element], li[data-level="1"][packageelement]',
    ).length;
    const packages = buildSearchIndex();

    // Return the sanitized index, its health metadata, and the request identifier.
    window.postMessage(
      {
        source: MESSAGE_SOURCE,
        type: INDEX_RESPONSE,
        requestId: normalizeText(event.data.requestId),
        indexAvailable:
          packageRowsFound > 0 && packages.length === packageRowsFound,
        packageRowsFound,
        packages,
      },
      window.location.origin,
    );
  });

  // Record Designer ownership only on explicit opt-in, using already-loaded pipeline names.
  window.addEventListener("message", async (event) => {
    if (event.source !== window || event.data?.source !== MESSAGE_SOURCE) return;
    // Disabling cancels pending publication as well as preventing new label lookups.
    if (event.data.type === "designer-ownership-setting") {
      ownershipEnabled = event.data.enabled === true;
      return;
    }
    if (!ownershipEnabled || event.data.type !== "designer-ownership-request" || !/\/data-connect-designer\/?$/iu.test(window.location.pathname)) return;
    const requestId = normalizeText(event.data.requestId);
    const tenantId = getCurrentTenantId();
    const modules = getDesignerModules();
    if (!requestId || !tenantId || typeof modules?.server.JR !== "function") return;
    // Resolve just this Designer environment, not other environments or pipeline content.
    const tenant = await getTenantDetails(modules.server, tenantId);
    const environment = tenant.environment || tenant.tenantName;
    // Retain the already-loaded package relationship without adding any service requests.
    const packages = buildSearchIndex().map((entry) => ({
      name: entry.name,
      // Store names once per package, not once per published or draft version.
      pipelines: [...new Set(entry.pipelines.map((pipeline) => pipeline.name).filter(Boolean))],
    }));
    const pipelineCount = packages.reduce((count, entry) => count + entry.pipelines.length, 0);
    if (!ownershipEnabled || !environment || packages.length > 10000 || pipelineCount > 10000 || !/\/data-connect-designer\/?$/iu.test(window.location.pathname)) return;
    window.postMessage({ source: MESSAGE_SOURCE, type: "designer-ownership-response", requestId, tenantId, environment, packages }, window.location.origin);
  });

  // Find the live Designer manager through the package row's React ancestry.
  function getDesignerManager() {
    const row = document.querySelector('li[data-level="1"]');
    const fiberKey = row && Object.keys(row).find((key) => key.startsWith('__reactFiber$'));
    let fiber = fiberKey ? row[fiberKey] : null;
    for (let depth = 0; fiber && depth < 60; depth += 1, fiber = fiber.return) {
      const instance = fiber.stateNode;
      if (instance?.state?.selectedPackage && typeof instance.viewPipeline === 'function' && typeof instance.editPipeline === 'function') return instance;
    }
    return null;
  }

  // Search all pipelines in the selected package, including other table pages.
  window.addEventListener('message', (event) => {
    if (event.source !== window || event.data?.source !== MESSAGE_SOURCE || !/\/data-connect-designer\/?$/u.test(window.location.pathname)) return;
    if (!['designer-search', 'designer-open'].includes(event.data.type)) return;
    const manager = getDesignerManager();
    const selectedPackage = manager?.state?.selectedPackage;
    const pipelines = selectedPackage?.pipelines || [];
    if (event.data.type === 'designer-search') {
      // Ignore separators and case so camel case, hyphens, and spaces match alike.
      const fold = (value) => normalizeText(value).toLocaleLowerCase().replace(/[^\p{L}\p{N}]/gu, '');
      const query = fold(event.data.query);
      window.postMessage({ source: MESSAGE_SOURCE, type: 'designer-results', requestId: event.data.requestId,
        packageName: normalizeText(selectedPackage?.name), available: Boolean(manager),
        results: pipelines.filter((pipeline) => fold(pipeline.name).includes(query)).slice(0, 100).map((pipeline) => ({
          name: normalizeText(pipeline.name), version: normalizeText(pipeline.version), status: normalizeText(pipeline.status),
        })) }, window.location.origin);
      return;
    }
    // Invoke only the native navigation for an exact entry in the current package.
    if (selectedPackage?.name !== event.data.packageName) return;
    const pipeline = pipelines.find((item) => item.name === event.data.name && normalizeText(item.version) === event.data.version && normalizeText(item.status) === event.data.status);
    if (!pipeline) return;
    if (String(pipeline.status).toLowerCase() === 'draft') manager.editPipeline(pipeline);
    else manager.viewPipeline(pipeline, pipelines.some((item) => item.parent_pipeline === `${pipeline.name} ${pipeline.version.replace(/^v/u, '')}`));
  });

  window.addEventListener("message", async (event) => {
    // Forget affected lookups without making a request or touching tenant details.
    if (event.source === window && event.data?.source === MESSAGE_SOURCE && event.data?.type === 'shared-status-invalidate') {
      const names = Array.isArray(event.data.names) ? event.data.names.slice(0, 500) : [];
      const artifacts = new Set(names.map((name) => sharedArtifactNames.get(name)).filter(Boolean));
      for (const key of sharedReleaseCache.keys()) {
        if (artifacts.has(JSON.parse(key)[1])) sharedReleaseCache.delete(key);
      }
      return;
    }
    if (event.source === window && event.data?.source === MESSAGE_SOURCE && event.data?.type === 'shared-status-setting') {
      sharingEnabled = event.data.enabled === true;
      // Immediately discard waiting sharing calls on opt-out, without clearing good results.
      drainSharingRequests();
      return;
    }
    if (
      event.source !== window ||
      event.data?.source !== MESSAGE_SOURCE ||
      event.data?.type !== SHARED_STATUS_REQUEST ||
      !sharingEnabled ||
      !/\/data-connect-designer\/?$/u.test(window.location.pathname.toLowerCase())
    ) {
      return;
    }

    // Accept only bounded pipeline names, versions, and opaque response keys.
    const entries = Array.isArray(event.data.entries)
      ? event.data.entries.slice(0, 25).flatMap((entry) => {
          const key = normalizeText(entry?.key);
          const name = normalizeText(entry?.name);
          const version = normalizeText(entry?.version);

          return key && name && version ? [{ key, name, version }] : [];
        })
      : [];
    // Only query names and versions already present in this page's package data.
    const inventory = entries.length ? buildSharingInventory(entries) : null;
    const validEntries = entries.filter((entry) => inventory.currentVersions.get(entry.name)?.has(entry.version.replace(/^v/u, '')));
    const results = validEntries.length ? await getSharedStatuses(validEntries, inventory) : [];

    window.postMessage(
      {
        source: MESSAGE_SOURCE,
        type: SHARED_STATUS_RESPONSE,
        requestId: normalizeText(event.data.requestId),
        results,
      },
      window.location.origin,
    );
  });

  // Announce readiness so the isolated script can request data after either load order.
  window.postMessage(
    {
      source: MESSAGE_SOURCE,
      type: INDEX_READY,
    },
    window.location.origin,
  );
})();
