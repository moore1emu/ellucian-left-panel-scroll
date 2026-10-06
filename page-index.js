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

  // Resolve one destination once, then reuse it for every shared pipeline row.
  async function getTenantDetails(server, tenantId) {
    if (tenantDetailsCache.has(tenantId)) {
      return tenantDetailsCache.get(tenantId);
    }

    const tenantPromise = server.JR(tenantId)
      .then((tenant) => ({
        accountName: normalizeText(tenant?.accountId),
        environment: normalizeText(tenant?.label),
        tenantId,
        tenantName: normalizeText(tenant?.name),
      }))
      .catch(() => {
        // A temporary lookup failure must not poison the bounded startup retry.
        tenantDetailsCache.delete(tenantId);
        return { tenantId };
      });
    tenantDetailsCache.set(tenantId, tenantPromise);
    return tenantPromise;
  }

  // Check one exact published version using Ellucian's existing sharing service.
  async function getSharedStatus(entry) {
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
      document.querySelectorAll('li[data-level="1"]').forEach((row) => {
        (getPackageData(row)?.pipelines || []).forEach((pipeline) => {
          if (pipeline.name !== entry.name) return;
          [pipeline.version, ...(pipeline.previousVersions || [])].forEach((version) => {
            const clean = typeof version === 'string' && modules.semver.clean(version);
            if (clean && cleanVersion && modules.semver.major(clean) === modules.semver.major(cleanVersion)) knownVersions.add(clean);
          });
        });
      });
      const versions = Array.from(knownVersions).filter(Boolean).sort(modules.semver.rcompare);
      const latestByDestination = new Map();
      for (const version of versions) {
        // Stop additional traffic immediately when the user disables the column.
        if (!sharingEnabled) return { key: entry.key, error: true };
        const cacheKey = JSON.stringify([tenantId, artifactName, version]);
        if (!sharedReleaseCache.has(cacheKey)) {
          sharedReleaseCache.set(cacheKey, modules.server.hL(tenantId, 'pipeline', artifactName, version));
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
        ...await getTenantDetails(modules.server, id), version,
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

  // Limit concurrent checks so enabling the optional column stays lightweight.
  async function getSharedStatuses(entries) {
    const results = new Array(entries.length);
    let nextIndex = 0;

    async function runWorker() {
      while (nextIndex < entries.length) {
        // Stop queued requests as soon as the user disables the feature.
        if (!sharingEnabled) break;
        const currentIndex = nextIndex;
        nextIndex += 1;
        results[currentIndex] = await getSharedStatus(entries[currentIndex]);
      }
    }

    await Promise.all(
      Array.from({ length: Math.min(3, entries.length) }, runWorker),
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
    const knownPipelines = buildSearchIndex().flatMap((entry) => entry.pipelines);
    const validEntries = entries.filter((entry) => knownPipelines.some((pipeline) => pipeline.name === entry.name && pipeline.version.replace(/^v/u, '') === entry.version.replace(/^v/u, '')));
    const results = validEntries.length ? await getSharedStatuses(validEntries) : [];

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
