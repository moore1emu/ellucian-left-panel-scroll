(() => {
  "use strict";

  // Use a narrow message protocol shared only with this extension's search script.
  const MESSAGE_SOURCE = "ellucian-left-panel-scroll";
  const INDEX_REQUEST = "search-index-request";
  const INDEX_RESPONSE = "search-index-response";
  const INDEX_READY = "search-index-ready";
  const SHARED_STATUS_REQUEST = "shared-status-request";
  const SHARED_STATUS_RESPONSE = "shared-status-response";
  // Bootstrap identity is usable only on its original tenant route, never after a route switch.
  const bootstrapTenantContext = window.location.origin + window.location.pathname.split('/app/')[0].replace(/\/+$/u, '');
  let liveTenantObserved = false;

  // Keep: page-world copies of shared.js rules; loading shared.js here would expose a global to Ellucian (1.21.9).
  // Keep: match both package-element and packageelement; Ellucian's pages use either spelling (pre-1.15.1).
  const PACKAGE_ROW_SELECTOR = 'li[data-level="1"][package-element], li[data-level="1"][packageelement]';
  const isPackagesPage = () => /\/data-connect\/home\/?$/iu.test(window.location.pathname);
  const isDesignerPage = () => /\/data-connect-designer\/?$/iu.test(window.location.pathname);

  // Keep only sanitized, non-runnable display records for the lifetime of this page.
  const packageArtifactSnapshots = new Map();
  // Detach an earlier observer when the page reuses an XHR object for another request.
  const packageArtifactListeners = new WeakMap();
  let packageArtifactCount = 0;
  // A brief startup buffer bridges the early page script and the saved opt-in read at UI startup.
  let packageArtifactCaptureEnabled = null;

  // Keep: separate snapshots when Experience changes tenant, including on a vanity domain (1.21.1).
  function getPackageArtifactContext() {
    return window.location.origin + window.location.pathname.split('/app/')[0];
  }

  // Capture published package metadata before the native sidebar drops API/Sub-Pipeline rows.
  function rememberPackageArtifacts(data, packageVersion, context) {
    if (packageArtifactCaptureEnabled === false) return;
    const name = normalizeText(data?.name);
    if (!name || !Array.isArray(data?.pipelines)) return;
    const latest = new Map();
    for (const entry of data.pipelines.slice(0, 10000)) {
      // Discard integration records, unknown types, payloads, and unpublished entries immediately.
      const type = normalizeText(entry?.type).toLowerCase().replace(/[\s_-]/gu, '');
      const pipeline = { name: normalizeText(entry?.name), version: normalizeText(entry?.version), type };
      if (!['api', 'subpipeline'].includes(type) || !pipeline.name || !/^v?\d+\.\d+\.\d+$/u.test(pipeline.version)) continue;
      const identity = JSON.stringify([pipeline.name, type]);
      const previous = latest.get(identity);
      // Retain the newest numeric release instead of holding every historical version in memory.
      if (!previous || pipeline.version.replace(/^v/u, '').localeCompare(previous.version.replace(/^v/u, ''), undefined, { numeric: true }) > 0) latest.set(identity, pipeline);
    }
    const key = JSON.stringify([context, name]);
    // Replace a refreshed snapshot without accumulating earlier package versions.
    packageArtifactCount -= packageArtifactSnapshots.get(key)?.pipelines.length || 0;
    packageArtifactSnapshots.delete(key);
    const pipelines = Array.from(latest.values());
    packageArtifactSnapshots.set(key, { packageVersion, pipelines });
    packageArtifactCount += pipelines.length;
    // Bound in-memory data even on unusually large accounts; no browser-storage writes occur.
    while (packageArtifactSnapshots.size > 1000 || packageArtifactCount > 10000) {
      const oldest = packageArtifactSnapshots.keys().next().value;
      packageArtifactCount -= packageArtifactSnapshots.get(oldest).pipelines.length;
      packageArtifactSnapshots.delete(oldest);
    }
    // Keep: notify a selected package once if its response arrived after the UI's first request (1.21.1).
    if (context === getPackageArtifactContext()) window.postMessage({ source: MESSAGE_SOURCE, type: 'package-artifacts-ready', packageName: name }, window.location.origin);
  }

  // Observe only the existing package XHR response; never issue requests or touch headers/tokens.
  const originalPackageOpen = window.XMLHttpRequest?.prototype.open;
  if (originalPackageOpen) {
    window.XMLHttpRequest.prototype.open = function (method, url, ...options) {
      let packageVersion = '';
      const context = getPackageArtifactContext();
      try {
        // Ignore unrelated traffic, Designer routes, and endpoints outside the package service.
        if (packageArtifactCaptureEnabled !== false && String(method).toUpperCase() === 'GET' && /\/data-connect\//iu.test(window.location.pathname)) {
          const parsed = new URL(url, window.location.href);
          const match = parsed.pathname.match(/^\/artifact\/[^/]+\/integration-package\/(v\d+\.\d+\.\d+)\/[^/]+\.json$/u);
          if (parsed.protocol === 'https:' && parsed.hostname.startsWith('semver-s3-service.') && parsed.hostname.endsWith('.elluciancloud.com') && match) packageVersion = match[1];
        }
      } catch (_error) {
        // An unusual URL must retain the native XHR behavior without extension errors.
      }
      // Reopening aborts the earlier request; it must not be recorded as this new package.
      const previousListener = packageArtifactListeners.get(this);
      if (previousListener) this.removeEventListener('readystatechange', previousListener);
      packageArtifactListeners.delete(this);
      // Call native open unchanged, preserving its arguments, return value, and exceptions.
      const result = Reflect.apply(originalPackageOpen, this, [method, url, ...options]);
      if (!packageVersion) return result;
      const request = this;
      const readPackage = () => {
        if (request.readyState !== 4) return;
        request.removeEventListener('readystatechange', readPackage);
        packageArtifactListeners.delete(request);
        // Opt-out can occur while a native request is pending; skip even parsing its response.
        if (packageArtifactCaptureEnabled === false) return;
        try {
          // Keep: run before Axios's loadend handler mutates the object supplied to sidebar rows (1.21.1).
          if (request.status < 200 || request.status >= 300) return;
          let data;
          if (request.responseType === 'json') data = request.response;
          else if (!request.responseType || request.responseType === 'text') {
            if (request.responseText.length > 5000000) return;
            data = JSON.parse(request.responseText);
          }
          rememberPackageArtifacts(data, packageVersion, context);
        } catch (_error) {
          // Failed/aborted/non-JSON responses must not interfere with native page handlers.
        }
      };
      packageArtifactListeners.set(request, readPackage);
      request.addEventListener('readystatechange', readPackage);
      return result;
    };
  }

  // Cache tenant details because many shared pipelines use the same destination.
  const tenantDetailsCache = new Map();
  // Reuse exact-version checks when multiple rows share the same release history.
  const sharedReleaseCache = new Map();
  // Remember only pipeline names already checked by the optional sharing column.
  const sharedArtifactNames = new Map();
  // Keep: one global six-request sharing budget, raised from three on request (1.20.3).
  const SHARING_REQUEST_LIMIT = 6;
  // Keep: start the deadline only when an actual sharing service call starts, not in its queue (1.20.9).
  const SHARING_REQUEST_TIMEOUT = 30000;
  // Share one request budget across batches, including destination-name lookups.
  const sharingRequestQueue = [];
  const sharingCancelledError = new Error('Sharing checks were disabled.');
  // Keep: timed-out native calls hold their slot in the six-request budget until they settle (1.20.9).
  const activeSharingJobs = new Set();
  const sharingServiceRequests = new Map();
  const sharingTimeoutError = Object.assign(new Error('Sharing service timed out.'), { code: 'request-timeout' });
  const sharingBlockedError = Object.assign(new Error('Earlier sharing calls are still running.'), { code: 'requests-stalled' });
  let designerModules = null;
  let designerWebpackRequire = null;
  let designerProbeTarget = null;
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
    // Prefer live component state: a vanity-site switch may leave bootstrap state unchanged.
    // Keep: direct Designer loads expose currentTenant on the manager, outside sidebar ancestry (1.22.2).
    const rows = [isDesignerPage() ? document.querySelector('#pipelineManager-main-customBlock') : null,
      document.querySelector('li[data-level="1"]'), document.querySelector('[data-testid="master"]')].filter(Boolean);
    for (const row of rows) {
      const fiberKey = Object.keys(row).find((key) => key.startsWith('__reactFiber$'));
      let fiber = fiberKey ? row[fiberKey] : null;
      for (let depth = 0; fiber && depth < 60; depth += 1, fiber = fiber.return) {
        const owner = fiber.stateNode;
        let tenantId = normalizeText(owner?.state?.currentTenant).trim();
        // Keep: Packages may expose tenantId only on its live menu/session owner, not state.currentTenant (1.22.7).
        // Do not read token values or reuse retained Packages context on Designer routes.
        if (!tenantId && isPackagesPage() && Array.isArray(owner?.state?.menu) && typeof owner.context?.getJwt === 'function') {
          tenantId = normalizeText(owner.context.tenantId).trim();
        }
        if (tenantId) { liveTenantObserved = true; return tenantId; }
      }
    }
    try {
      if (liveTenantObserved || getPackageArtifactContext().replace(/\/+$/u, '') !== bootstrapTenantContext) return '';
      const preloadedState = window.__PRELOADED_STATE__;
      const parsedState =
        typeof preloadedState === "string"
          ? JSON.parse(window.atob(preloadedState))
          : preloadedState;

      const tenantId = normalizeText(parsedState?.tenant);
      if (tenantId) return tenantId;
    } catch (_error) {
      // Keep: missing bootstrap state must not prevent using already-loaded component state (1.19.2).
    }

    return "";
  }

  // Keep: reuse Ellucian's signed-in helpers so the extension never reads or copies its token (1.19.0).
  function getDesignerModules() {
    if (designerModules) {
      return designerModules;
    }

    const designerChunks = window.webpackChunkdata_connect_designer;

    if (!Array.isArray(designerChunks)) {
      return null;
    }

    // Push one loader probe per chunk list; webpack runs a queued probe once its runtime loads.
    if (!designerWebpackRequire && designerProbeTarget !== designerChunks) {
      designerProbeTarget = designerChunks;
      designerChunks.push([
        [`ellucian-left-panel-${Date.now()}`],
        {},
        (runtimeRequire) => {
          designerWebpackRequire = runtimeRequire;
        },
      ]);
    }
    const webpackRequire = designerWebpackRequire;

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
  function rejectWaitingSharingRequests(error) {
    // Discard only queued work; never pretend that a running native request was cancelled.
    sharingRequestQueue.splice(0).forEach((request) => {
      if (sharingServiceRequests.get(request.key) === request.promise) sharingServiceRequests.delete(request.key);
      request.reject(error);
    });
  }

  // Free capacity only when the underlying service really finishes.
  function drainSharingRequests() {
    // Keep: disabling rejects waiting work without interrupting already-started requests (1.20.2).
    if (!sharingEnabled) {
      rejectWaitingSharingRequests(sharingCancelledError);
      return;
    }
    // Six genuinely stalled calls cannot make progress; explain this instead of waiting forever.
    if (activeSharingJobs.size === SHARING_REQUEST_LIMIT && [...activeSharingJobs].every((request) => request.timedOut)) {
      rejectWaitingSharingRequests(sharingBlockedError);
      return;
    }
    while (activeSharingJobs.size < SHARING_REQUEST_LIMIT && sharingRequestQueue.length) {
      const request = sharingRequestQueue.shift();
      activeSharingJobs.add(request);
      // Recheck opt-in before calling the service, even if it changed this turn.
      Promise.resolve().then(() => {
        if (!sharingEnabled) throw sharingCancelledError;
        // An expired caller gets a failure, but its native call still occupies this slot.
        request.timer = window.setTimeout(() => {
          request.timedOut = true;
          request.reject(sharingTimeoutError);
          drainSharingRequests();
        }, SHARING_REQUEST_TIMEOUT);
        return request.run();
      }).then(request.resolve, request.reject).finally(() => {
        // Always free the slot after success, rejection, or a synchronous service error.
        window.clearTimeout(request.timer);
        activeSharingJobs.delete(request);
        if (sharingServiceRequests.get(request.key) === request.promise) sharingServiceRequests.delete(request.key);
        drainSharingRequests();
      });
    }
  }

  // Queue only new service calls; callers continue to reuse their cached promises.
  function queueSharingRequest(run, key) {
    // Keep: refreshing after a timeout must not duplicate an identical call still on the wire (1.20.9).
    if (sharingServiceRequests.has(key)) return sharingServiceRequests.get(key);
    let request;
    const promise = new Promise((resolve, reject) => {
      request = { run, resolve, reject, key, timedOut: false, timer: 0 };
    });
    request.promise = promise;
    sharingServiceRequests.set(key, promise);
    sharingRequestQueue.push(request);
    drainSharingRequests();
    return promise;
  }

  // Resolve one destination once, keeping independent ownership refreshes unchanged.
  async function getTenantDetails(server, tenantId, sharingLookup = false) {
    if (tenantDetailsCache.has(tenantId)) {
      return tenantDetailsCache.get(tenantId);
    }

    // Only sharing destinations enter this queue; Shared From uses its existing flow.
    const lookup = sharingLookup ? queueSharingRequest(() => server.JR(tenantId), JSON.stringify(['destination', tenantId])) : server.JR(tenantId);
    const tenantPromise = lookup
      .then((tenant) => ({
        accountName: normalizeText(tenant?.accountId),
        environment: normalizeText(tenant?.label),
        tenantId,
        tenantName: normalizeText(tenant?.name),
      }))
      .catch((error) => {
        // A temporary lookup failure must not poison the bounded startup retry.
        // A cancelled older lookup must not remove a newer cached promise.
        if (tenantDetailsCache.get(tenantId) === tenantPromise) tenantDetailsCache.delete(tenantId);
        // Sharing failures must remain failures, not an apparently complete unnamed destination.
        if (sharingLookup) throw error;
        return { tenantId };
      });
    tenantDetailsCache.set(tenantId, tenantPromise);
    return tenantPromise;
  }

  // Keep: scan loaded packages once per batch for exact validation and release history (1.20.2).
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
        // Keep: preserve same-major isolation while reusing the batch's inventory (1.14.0).
        if (clean && cleanVersion && modules.semver.major(clean) === modules.semver.major(cleanVersion)) knownVersions.add(clean);
      });
      const versions = Array.from(knownVersions).filter(Boolean).sort(modules.semver.rcompare);
      const latestByDestination = new Map();
      for (const version of versions) {
        // Stop additional traffic immediately when the user disables the column.
        if (!sharingEnabled) return { key: entry.key, error: true };
        const cacheKey = JSON.stringify([tenantId, artifactName, version]);
        if (!sharedReleaseCache.has(cacheKey)) {
          const releasePromise = queueSharingRequest(() => modules.server.hL(tenantId, 'pipeline', artifactName, version), JSON.stringify(['history', cacheKey])).catch((error) => {
            // A cancelled queued call has no result to cache; allow a later opt-in retry.
            if (sharedReleaseCache.get(cacheKey) === releasePromise) sharedReleaseCache.delete(cacheKey);
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
    } catch (error) {
      // Return only known failure codes and plain guidance, never raw server errors or URLs.
      const code = error === sharingTimeoutError ? 'request-timeout' : error === sharingBlockedError ? 'requests-stalled' : 'lookup-failed';
      const reason = code === 'request-timeout' ? 'The sharing service took too long to respond. Try again shortly.'
        : code === 'requests-stalled' ? 'Earlier sharing requests are still running. Wait, or refresh this page before retrying.'
        : 'Designer sharing lookup failed. Try opening the native Share pipeline page.';
      return { key: entry.key, error: true, code, reason };
    }
  }

  // Keep batch processing small; the shared service queue enforces the global limit.
  async function getSharedStatuses(entries, inventory, onResult) {
    const results = new Array(entries.length);
    let nextIndex = 0;

    async function runWorker() {
      while (nextIndex < entries.length) {
        // Stop queued requests as soon as the user disables the feature.
        if (!sharingEnabled) break;
        const currentIndex = nextIndex;
        nextIndex += 1;
        results[currentIndex] = await getSharedStatus(entries[currentIndex], inventory);
        // Keep: publish each completed pipeline immediately, even when another pipeline is slow (1.20.9).
        onResult(results[currentIndex]);
      }
    }

    await Promise.all(
      Array.from({ length: Math.min(SHARING_REQUEST_LIMIT, entries.length) }, runWorker),
    );
    return results;
  }

  // Build a minimal index containing names and versions, never credentials or payloads.
  function buildSearchIndex() {
    const packageRows = document.querySelectorAll(PACKAGE_ROW_SELECTOR);

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

  // The independent display setting controls transient capture, never native requests or Designer sources.
  function handlePackageArtifactsSetting(message) {
    packageArtifactCaptureEnabled = message.enabled === true;
    if (!packageArtifactCaptureEnabled) {
      // Forget any early startup buffer or displayed records as soon as saved opt-out is known.
      packageArtifactSnapshots.clear();
      packageArtifactCount = 0;
    }
  }

  // Read one selected package's published metadata without fetching or changing anything.
  function handlePackageArtifactsRequest(message) {
    if (packageArtifactCaptureEnabled === false || !isPackagesPage()) return;
    const packageName = normalizeText(message.packageName);
    const row = Array.from(document.querySelectorAll(PACKAGE_ROW_SELECTOR))
      .find((element) => getPackageData(element)?.name === packageName);
    const data = row ? getPackageData(row) : null;
    // Keep: prefer the pre-filter response, requiring the selected published package version to match (1.21.1).
    const snapshot = packageArtifactSnapshots.get(JSON.stringify([getPackageArtifactContext(), packageName]));
    const versionMatches = snapshot && (!data?.version || snapshot.packageVersion.replace(/^v/u, '') === normalizeText(data.version).replace(/^v/u, ''));
    // Keep: fall back only to already-loaded display fields; never fetch a missing response (1.21.0).
    const pipelines = versionMatches ? snapshot.pipelines : Array.isArray(data?.pipelines) ? data.pipelines : null;
    window.postMessage({
      source: MESSAGE_SOURCE, type: 'package-artifacts-response',
      requestId: normalizeText(message.requestId), packageName,
      available: Boolean(pipelines),
      pipelines: pipelines ? pipelines.slice(0, 10000).map((pipeline) => ({
        name: normalizeText(pipeline?.name), version: normalizeText(pipeline?.version), type: normalizeText(pipeline?.type),
      })) : [],
    }, window.location.origin);
  }

  // Respond only to explicit index requests from the isolated search script.
  function handleIndexRequest(message) {
    // Count the rendered rows so the isolated script can detect a partial index.
    const packageRowsFound = document.querySelectorAll(PACKAGE_ROW_SELECTOR).length;
    const packages = buildSearchIndex();

    // Return the sanitized index, its health metadata, and the request identifier.
    window.postMessage(
      {
        source: MESSAGE_SOURCE,
        type: INDEX_RESPONSE,
        requestId: normalizeText(message.requestId),
        indexAvailable:
          packageRowsFound > 0 && packages.length === packageRowsFound,
        packageRowsFound,
        // Return only local tenant identity for favorites on both pages, without a service call.
        tenantId: getCurrentTenantId(),
        pageUrl: window.location.href,
        packages,
      },
      window.location.origin,
    );
  }

  // Disabling cancels pending publication as well as preventing new label lookups.
  function handleOwnershipSetting(message) {
    ownershipEnabled = message.enabled === true;
  }

  // Record Designer ownership only on explicit opt-in, using already-loaded pipeline names.
  async function handleOwnershipRequest(message) {
    if (!ownershipEnabled || !isDesignerPage()) return;
    const requestId = normalizeText(message.requestId);
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
    if (!ownershipEnabled || !environment || packages.length > 10000 || pipelineCount > 10000 || !isDesignerPage()) return;
    window.postMessage({ source: MESSAGE_SOURCE, type: "designer-ownership-response", requestId, tenantId, environment, packages }, window.location.origin);
  }

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
  function handleDesignerSearch(message) {
    if (!isDesignerPage()) return;
    const manager = getDesignerManager();
    const selectedPackage = manager?.state?.selectedPackage;
    const pipelines = selectedPackage?.pipelines || [];
    // Ignore separators and case so camel case, hyphens, and spaces match alike.
    const fold = (value) => normalizeText(value).toLocaleLowerCase().replace(/[^\p{L}\p{N}]/gu, '');
    const query = fold(message.query);
    // Page only the already-loaded matches; Show More never contacts another environment.
    const matches = pipelines.filter((pipeline) => fold(pipeline.name).includes(query));
    // Echo the requested page even if the native inventory shrank between clicks.
    const offset = Number.isInteger(message.offset) && message.offset >= 0 ? message.offset : 0;
    window.postMessage({ source: MESSAGE_SOURCE, type: 'designer-results', requestId: message.requestId,
      packageName: normalizeText(selectedPackage?.name), available: Boolean(manager),
      offset, total: matches.length,
      results: matches.slice(offset, offset + 20).map((pipeline) => ({
        name: normalizeText(pipeline.name), version: normalizeText(pipeline.version), status: normalizeText(pipeline.status),
      })) }, window.location.origin);
  }

  // Invoke only the native navigation for an exact entry in the current package.
  function handleDesignerOpen(message) {
    if (!isDesignerPage()) return;
    const manager = getDesignerManager();
    const selectedPackage = manager?.state?.selectedPackage;
    const pipelines = selectedPackage?.pipelines || [];
    if (selectedPackage?.name !== message.packageName) return;
    const pipeline = pipelines.find((item) => item.name === message.name && normalizeText(item.version) === message.version && normalizeText(item.status) === message.status);
    if (!pipeline) return;
    if (String(pipeline.status).toLowerCase() === 'draft') manager.editPipeline(pipeline);
    // Treat a missing or non-text version as empty instead of throwing in this handler.
    else manager.viewPipeline(pipeline, pipelines.some((item) => item.parent_pipeline === `${pipeline.name} ${normalizeText(pipeline.version).replace(/^v/u, '')}`));
  }

  // Forget affected lookups without making a request or touching tenant details.
  function handleSharedStatusInvalidate(message) {
    const names = Array.isArray(message.names) ? message.names.slice(0, 500) : [];
    const artifacts = new Set(names.map((name) => sharedArtifactNames.get(name)).filter(Boolean));
    for (const key of sharedReleaseCache.keys()) {
      if (artifacts.has(JSON.parse(key)[1])) sharedReleaseCache.delete(key);
    }
  }

  // Immediately discard waiting sharing calls on opt-out, without clearing good results.
  function handleSharedStatusSetting(message) {
    sharingEnabled = message.enabled === true;
    drainSharingRequests();
  }

  // Check sharing for one bounded batch, streaming each completed row back to the UI.
  async function handleSharedStatusRequest(message) {
    if (!sharingEnabled || !isDesignerPage()) return;

    // Accept only bounded pipeline names, versions, and opaque response keys.
    const entries = Array.isArray(message.entries)
      ? message.entries.slice(0, 25).flatMap((entry) => {
          const key = normalizeText(entry?.key);
          const name = normalizeText(entry?.name);
          const version = normalizeText(entry?.version);

          return key && name && version ? [{ key, name, version }] : [];
        })
      : [];
    // Acknowledge delivery before waiting in the queue so the UI's connection timer can stop.
    const requestId = normalizeText(message.requestId);
    const report = (results, complete = false) => window.postMessage({
      source: MESSAGE_SOURCE, type: SHARED_STATUS_RESPONSE, requestId, results, complete,
    }, window.location.origin);
    report([]);
    try {
      // Only query names and versions already present in this page's package data.
      const inventory = entries.length ? buildSharingInventory(entries) : null;
      const validEntries = entries.filter((entry) => inventory.currentVersions.get(entry.name)?.has(entry.version.replace(/^v/u, '')));
      if (validEntries.length) await getSharedStatuses(validEntries, inventory, (result) => report([result]));
    } catch (_error) {
      // A changed/unreadable native component must not strand an acknowledged UI request.
      report(entries.map(({ key }) => ({ key, error: true, code: 'lookup-failed',
        reason: 'Designer sharing data could not be read. Reload the package, then try again.' })));
    } finally {
      // Completed rows were already delivered; the final marker carries no duplicate row data.
      report([], true);
    }
  }

  // Keep only UI lock snapshots; never read, cache, or transmit fitting contents.
  let fittingViewingEnabled = false;
  let fittingView = null;
  let fittingViewFrame = 0;
  let fittingViewObserver = null;
  const FITTING_PANEL = '#flowItem_contentEdit';
  const FITTING_FIELDS = 'input, textarea, select, button, [contenteditable], [role="button"], [role="combobox"], a[href]';

  // Require the observed published marker rather than guessing from disabled controls alone.
  function isPublishedFitting() {
    // Keep: an existing draft changes the native published label but must not prevent read-only viewing (1.22.8).
    const publishedLabel = document.getElementById('action_save')?.getAttribute('aria-label');
    return /\/data-connect-designer\/pipelineDesigner\/?$/iu.test(window.location.pathname) &&
      ['Create draft from published pipeline.', 'Create draft not allowed since draft already exists for this published pipeline.'].includes(publishedLabel) &&
      document.getElementById('action_publish')?.disabled === true;
  }

  // Snapshot each property once and avoid writes that could retrigger native rendering.
  function setFittingLock(node, property, value) {
    let properties = fittingView.controls.get(node);
    if (!properties) { properties = new Map(); fittingView.controls.set(node, properties); }
    if (!properties.has(property)) properties.set(property, { original: node[property], applied: value });
    if (node[property] !== value) node[property] = value;
  }

  // Restore only locks still owned by this feature, leaving later native changes intact.
  function restoreFittingView() {
    const previous = fittingView;
    if (!previous) return;
    fittingView = null;
    // Lock a published fieldset again before removing individual protections; never disable a draft.
    if (isPublishedFitting() && previous.fieldset.isConnected && !previous.fieldset.disabled) previous.fieldset.disabled = true;
    for (const [node, properties] of previous.controls) {
      for (const [property, snapshot] of properties) {
        if (node[property] === snapshot.applied) node[property] = snapshot.original;
      }
    }
    // Return an existing Ace instance to its original mode without touching its session/value.
    for (const [editor, original] of previous.editors) {
      try { if (!editor.destroyed && editor.getReadOnly() === true) editor.setReadOnly(original); }
      catch (_error) { /* A native editor destroyed during navigation needs no restoration. */ }
    }
    // Remove only our pointer override; preserve any newer style set by the application.
    if (previous.panel.style.getPropertyValue('pointer-events') === previous.pointerApplied) {
      if (previous.pointerValue) previous.panel.style.setProperty('pointer-events', previous.pointerValue, previous.pointerPriority);
      else previous.panel.style.removeProperty('pointer-events');
    }
    // Restore native dimming only if our viewing-mode opacity is still in place.
    if (previous.panel.style.getPropertyValue('opacity') === '1' && !previous.panel.style.getPropertyPriority('opacity')) {
      if (previous.opacityValue) previous.panel.style.setProperty('opacity', previous.opacityValue, previous.opacityPriority);
      else previous.panel.style.removeProperty('opacity');
    }
    for (const [type, handler] of previous.listeners) previous.panel.removeEventListener(type, handler, true);
  }

  // Permit navigation, selection, and copying, but not editor shortcuts or text mutations.
  function guardFittingInteraction(event) {
    if (!fittingView) return;
    if (!isPublishedFitting()) { restoreFittingView(); return; }
    const target = event.target instanceof Element ? event.target : event.target?.parentElement;
    const action = target?.closest('button, select, [role="button"], [role="combobox"], a[href], input:not([readonly])');
    let blocked = ['beforeinput', 'input', 'change', 'paste', 'cut', 'drop', 'dragover'].includes(event.type) || Boolean(action);
    if (event.type === 'keydown') {
      // Keep: ordinary copying works, but undo, delete-line, replace, and typing cannot modify a published fitting (1.22.5).
      const navigation = ['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown', 'Home', 'End', 'PageUp', 'PageDown', 'Tab', 'Escape', 'Shift', 'Control', 'Alt', 'Meta'];
      const copyOrSelect = (event.ctrlKey || event.metaKey) && !event.altKey && !event.shiftKey && (['a', 'c'].includes(event.key.toLowerCase()) || event.key === 'Insert');
      blocked ||= !(navigation.includes(event.key) || copyOrSelect);
    }
    if (blocked) { event.preventDefault(); event.stopImmediatePropagation(); }
  }

  // Apply a reversible view mode only after all native editors can be explicitly locked.
  function updateFittingView() {
    fittingViewFrame = 0;
    const panel = document.querySelector(FITTING_PANEL);
    const fieldset = panel?.querySelector('#flowItem_contentEdit_fieldset');
    if (!fittingViewingEnabled || !isPublishedFitting() || !fieldset || (!fieldset.disabled && fittingView?.fieldset !== fieldset)) {
      restoreFittingView();
      return;
    }
    // A replaced panel gets its own snapshots; old nodes must not hold session state alive.
    if (fittingView?.panel !== panel || fittingView?.fieldset !== fieldset) restoreFittingView();
    const editors = [];
    for (const element of panel.querySelectorAll('.ace_editor')) {
      // Use Ace's existing container binding; never create an editor or inspect React/application state.
      const editor = element.env?.editor;
      let supported = false;
      // A stale/destroyed native binding must fail closed, not throw from the observer.
      try { supported = typeof editor?.getReadOnly === 'function' && typeof editor?.setReadOnly === 'function' && typeof editor.getReadOnly() === 'boolean'; }
      catch (_error) { /* Treat an unreadable editor mode as unsupported. */ }
      if (!supported) {
        restoreFittingView();
        console.warn('[Integration Navigator] FITTING_VIEW_EDITOR_UNAVAILABLE');
        return;
      }
      editors.push(editor);
    }
    if (!fittingView) {
      fittingView = { panel, fieldset, controls: new Map(), editors: new Map(), listeners: [],
        pointerValue: panel.style.getPropertyValue('pointer-events'), pointerPriority: panel.style.getPropertyPriority('pointer-events'), pointerApplied: 'auto',
        opacityValue: panel.style.getPropertyValue('opacity'), opacityPriority: panel.style.getPropertyPriority('opacity') };
      // Capture editing/action events before native handlers without intercepting scrolling or copy.
      for (const type of ['keydown', 'beforeinput', 'input', 'change', 'paste', 'cut', 'drop', 'dragover', 'click', 'dblclick', 'mousedown', 'pointerdown']) {
        panel.addEventListener(type, guardFittingInteraction, true);
        fittingView.listeners.push([type, guardFittingInteraction]);
      }
    }
    try {
      // Release replaced fitting controls/editors instead of retaining every earlier selection.
      for (const [node, properties] of fittingView.controls) {
        if (panel.contains(node)) continue;
        for (const [property, snapshot] of properties) if (node[property] === snapshot.applied) node[property] = snapshot.original;
        fittingView.controls.delete(node);
      }
      for (const [editor, original] of fittingView.editors) {
        if (editors.includes(editor)) continue;
        try { if (!editor.destroyed && editor.getReadOnly()) editor.setReadOnly(original); }
        catch (_error) { /* Destroyed native editors hold no reusable view state. */ }
        fittingView.editors.delete(editor);
      }
      // Lock code before allowing focus; this also prevents Ace's mouse-driven editing commands.
      for (const editor of editors) {
        if (!fittingView.editors.has(editor)) fittingView.editors.set(editor, editor.getReadOnly());
        if (!editor.getReadOnly()) editor.setReadOnly(true);
      }
      for (const node of panel.querySelectorAll(FITTING_FIELDS)) {
        // Read-only text remains focusable for selection/copy; passwords and non-text controls stay disabled.
        const textField = node.tagName === 'TEXTAREA' || (node.tagName === 'INPUT' && ['text', 'search', 'email', 'url', 'tel', 'number'].includes(node.type));
        if (textField && !node.disabled) setFittingLock(node, 'readOnly', true);
        else if ('disabled' in node) setFittingLock(node, 'disabled', true);
        // Custom dropdowns/actions may be divs rather than native disabled form elements.
        if (node.matches('[role="button"], [role="combobox"], a[href]')) setFittingLock(node, 'inert', true);
        if (node.hasAttribute('contenteditable')) setFittingLock(node, 'contentEditable', 'false');
      }
      // Keep: a disabled fieldset blocks Ace focus/copy, so replace it only after individual locks are ready (1.22.5).
      if (fieldset.disabled) fieldset.disabled = false;
      panel.style.setProperty('pointer-events', 'auto');
      fittingView.pointerApplied = 'auto';
      // Keep: viewing removes the blanket dimming, not the disabled styling of action controls (1.22.6).
      if (panel.style.getPropertyValue('opacity') !== '1' || panel.style.getPropertyPriority('opacity')) panel.style.setProperty('opacity', '1');
    } catch (_error) {
      // Fail closed without exposing raw editor exceptions or configuration values.
      restoreFittingView();
      console.warn('[Integration Navigator] FITTING_VIEW_LOCK_FAILED');
    }
  }

  // Batch relevant native re-renders, blocking pointer input while new locks are prepared.
  function scheduleFittingView() {
    if (fittingView) { fittingView.panel.style.setProperty('pointer-events', 'none'); fittingView.pointerApplied = 'none'; }
    if (!fittingViewFrame) fittingViewFrame = window.requestAnimationFrame(updateFittingView);
  }

  // Observe only while opted in, and filter out unrelated page mutations before scheduling work.
  function handleFittingDetailsSetting(message) {
    fittingViewingEnabled = message.enabled === true;
    if (!fittingViewingEnabled) {
      fittingViewObserver?.disconnect();
      fittingViewObserver = null;
      if (fittingViewFrame) window.cancelAnimationFrame(fittingViewFrame);
      fittingViewFrame = 0;
      restoreFittingView();
      return;
    }
    if (!fittingViewObserver && document.body) {
      fittingViewObserver = new MutationObserver((mutations) => {
        // Outside the fitting route, restore once and avoid scanning unrelated Experience content.
        if (!/\/data-connect-designer\/pipelineDesigner\/?$/iu.test(window.location.pathname)) { restoreFittingView(); return; }
        const relevant = mutations.some((mutation) => {
          if (mutation.type === 'attributes') return mutation.target.id === 'action_save' || mutation.target.id === 'action_publish' || mutation.target.closest?.(FITTING_PANEL);
          // Ace redraws line spans during scrolling; those cannot add/change form controls.
          if (mutation.target.closest?.('.ace_editor')) return [...mutation.addedNodes, ...mutation.removedNodes].some((node) =>
            node instanceof Element && (node.matches('.ace_text-input') || node.querySelector('.ace_text-input')));
          if (mutation.target.closest?.(FITTING_PANEL)) return true;
          return [...mutation.addedNodes, ...mutation.removedNodes].some((node) => node instanceof Element &&
            (node.matches(`${FITTING_PANEL}, #action_save, #action_publish`) || node.querySelector(`${FITTING_PANEL}, #action_save, #action_publish`)));
        });
        if (relevant) scheduleFittingView();
      });
      fittingViewObserver.observe(document.body, { childList: true, subtree: true, attributes: true, attributeFilter: ['disabled', 'aria-label'] });
    }
    scheduleFittingView();
  }

  // Restore promptly on browser navigation; SPA panel replacements use the scoped observer.
  window.addEventListener('popstate', () => { if (fittingViewingEnabled) scheduleFittingView(); });
  window.addEventListener('pagehide', restoreFittingView);

  // Route each message type to one handler; unknown types are ignored.
  const messageHandlers = {
    // Verify tenant metadata without rebuilding the package index or making a service request.
    'favorite-context-request': (message) => window.postMessage({ source: MESSAGE_SOURCE, type: 'favorite-context-response',
      requestId: normalizeText(message.requestId), tenantId: getCurrentTenantId(), pageUrl: window.location.href }, window.location.origin),
    'package-artifacts-setting': handlePackageArtifactsSetting,
    'fitting-details-setting': handleFittingDetailsSetting,
    'package-artifacts-request': handlePackageArtifactsRequest,
    [INDEX_REQUEST]: handleIndexRequest,
    'designer-ownership-setting': handleOwnershipSetting,
    'designer-ownership-request': handleOwnershipRequest,
    'designer-search': handleDesignerSearch,
    'designer-open': handleDesignerOpen,
    'shared-status-invalidate': handleSharedStatusInvalidate,
    'shared-status-setting': handleSharedStatusSetting,
    [SHARED_STATUS_REQUEST]: handleSharedStatusRequest,
  };

  // Keep: accept only same-window messages tagged with this extension's source (1.4.0).
  window.addEventListener('message', (event) => {
    if (event.source !== window || event.data?.source !== MESSAGE_SOURCE) return;
    const type = event.data.type;
    if (typeof type === 'string' && Object.hasOwn(messageHandlers, type)) messageHandlers[type](event.data);
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
