(() => {
  "use strict";

  // Reuse the page-world protocol without granting additional extension permissions.
  const MESSAGE_SOURCE = "ellucian-left-panel-scroll";
  const INDEX_REQUEST = "search-index-request";
  const INDEX_RESPONSE = "search-index-response";
  const INDEX_READY = "search-index-ready";
  const SHARED_STATUS_REQUEST = "shared-status-request";
  const SHARED_STATUS_RESPONSE = "shared-status-response";

  // Reuse the layout script's single scoped React-change observer.
  const DOM_CHANGE_EVENT = "ellucian-left-panel-dom-changed";

  // Limit visible controls to the two supported Experience routes.
  const SUPPORTED_PATHS = [
    "/data-connect/home",
    "/data-connect-designer",
  ];

  // Keep sidebar and selected-package Designer search presentation independent.
  const SEARCH_MODE_KEY = "searchDisplayMode";
  const DESIGNER_SEARCH_MODE_KEY = "designerSearchDisplayMode";
  const SEARCH_MODES = new Set(["box", "icon", "hidden"]);
  const DEFAULT_SEARCH_MODE = "box";

  // Store favorites per environment and remember each section's open state.
  const FAVORITES_ENABLED_KEY = "favoritesEnabled";
  const SHARED_VERSION_ENABLED_KEY = "sharedVersionEnabled";
  const SHARED_FROM_ENABLED_KEY = "sharedFromEnabled";
  const OWNERSHIP_CACHE_KEY = "designerOwnershipCache";
  const FAVORITES_BY_HOST_KEY = "favoritePackagesByHost";
  const FAVORITES_EXPANDED_BY_HOST_KEY = "favoritesExpandedByHost";
  const FAVORITES_HEIGHTS_BY_HOST_KEY = "favoritesHeightsByHost";

  // Ask content.js to recalculate the remaining package-list height after resizing.
  const LAYOUT_REQUEST_EVENT = "ellucian-left-panel-layout-request";

  // Keep result lists useful without overwhelming the narrow package column.
  const MAX_PACKAGE_RESULTS = 12;
  const MAX_PIPELINE_RESULTS = 30;
  const INDEX_RESPONSE_TIMEOUT = 1200;
  // Retry loaded-page indexing briefly after SPA entry, never poll indefinitely.
  const OWNERSHIP_INDEX_RETRY_MS = 1500;
  const OWNERSHIP_INDEX_ATTEMPTS = 10;
  const MIN_FAVORITES_LIST_HEIGHT = 64;
  const MAX_FAVORITES_VIEWPORT_RATIO = 0.45;
  const MAX_FAVORITES_LIST_HEIGHT = 360;
  const FAVORITES_KEYBOARD_RESIZE_STEP = 16;

  // Hold only the sanitized names and versions returned by the page-world indexer.
  let searchMode = DEFAULT_SEARCH_MODE;
  let designerSearchMode = DEFAULT_SEARCH_MODE;
  let searchIndex = [];
  let completeSearchIndex = [];
  let completeSearchIndexKey = "";
  let indexState = "loading";
  let latestRequestId = "";
  let indexResponseTimer = 0;

  // Default to a visible, expanded favorites section with no saved packages.
  let favoritesEnabled = true;

  // Keep star colors global to this browser without changing per-site favorite identities.
  let favoriteAppearance = FavoriteAppearance.DEFAULT;
  let iconAppearance = null;

  // Keep the ordered parent groups separate from explicit package and pipeline pins.
  let favoriteNames = new Set();
  let favoritePackageIdentities = new Set();
  let favoritePipelineGroups = new Map();
  let favoritesExpanded = true;
  let favoriteListHeight = null;
  let draggedFavoriteName = "";
  let draggedFavoritePipeline = null;
  let activeFavoritesStorageKey = "";

  // Track only the search control that currently needs outside-click handling.
  let activeSearchControl = null;

  // Keep optional sharing checks disabled until the user turns them on.
  let sharedVersionEnabled = false;
  // Index locally observed Designer homes by exact name, not search text or version.
  let sharedFromEnabled = false;
  let ownershipByName = new Map();
  let ownershipRequest = "";
  let ownershipSignature = "";
  let ownershipTimer = 0;
  // Require a fresh complete index for each Designer visit, not a previous page's index.
  let ownershipPageKey = "";
  let ownershipIndexReady = false;
  let ownershipIndexAttempts = 0;
  let ownershipIndexTimer = 0;
  // Hold at most one popup reply until the requested snapshot is actually saved.
  let ownershipManualResponse = null;
  // A reloaded extension cannot reconnect this old page script until the page refreshes.
  let ownershipExtensionDisconnected = false;
  // Allow one startup retry per inventory, without background polling.
  let ownershipAttempts = 0;
  let navigationSequence = 0;
  let sharedStatusRequestCounter = 0;
  const sharedStatusCache = new Map();
  const pendingSharedStatusRequests = new Map();
  // Remember affected pipelines until either share flow returns to the package list.
  let shareMenuNames = [];
  let pendingShareAttempt = null;
  // Preserve checkbox selections across table pages, but never across packages.
  let sharedSelectionPackage = '';
  const selectedShareRows = new Map();

  // Accept only the three supported values from extension storage.
  function normalizeSearchMode(value) {
    return SEARCH_MODES.has(value) ? value : DEFAULT_SEARCH_MODE;
  }

  // Detect supported routes after Ellucian changes pages without reloading.
  function isSupportedPage() {
    const currentPath = window.location.pathname.toLowerCase();

    return SUPPORTED_PATHS.some((supportedPath) =>
      currentPath.includes(supportedPath),
    );
  }

  // Limit the optional column to the Designer package table itself.
  function isDesignerPackagePage() {
    return /\/data-connect-designer\/?$/u.test(
      window.location.pathname.toLowerCase(),
    );
  }

  // Convert page-provided values to bounded text before displaying or comparing them.
  function normalizeText(value) {
    return typeof value === "string" ? value.slice(0, 500) : "";
  }

  // Compare package names consistently despite case or repeated whitespace differences.
  function normalizePackageIdentity(value) {
    return normalizeText(value)
      .trim()
      .replace(/\s+/gu, " ")
      .toLocaleLowerCase();
  }

  // Treat a display-only leading "v" as the same pipeline version.
  function normalizePipelineVersion(value) {
    return normalizePackageIdentity(value).replace(/^v(?=\d)/u, "");
  }

  // Keep only the major component so a pin follows newer releases in that line.
  function getPipelineMajorVersion(value) {
    const normalizedVersion = normalizePipelineVersion(value);
    const majorMatch = normalizedVersion.match(/^\d+/u);

    return majorMatch?.[0] ?? normalizedVersion;
  }

  // Build a stable identity from the pipeline name and its major release line.
  function getPipelineIdentity(pipeline) {
    return `${normalizePackageIdentity(pipeline?.name)}\u0000${getPipelineMajorVersion(pipeline?.version)}`;
  }

  // Match either the visible or original pipeline name used by Ellucian.
  function pipelineNamesMatch(firstPipeline, secondPipeline) {
    const firstNames = new Set([
      normalizePackageIdentity(firstPipeline?.name),
      normalizePackageIdentity(firstPipeline?.originalName),
    ]);
    const secondNames = [
      normalizePackageIdentity(secondPipeline?.name),
      normalizePackageIdentity(secondPipeline?.originalName),
    ];
    const namesMatch = secondNames.some(
      (name) => name && firstNames.has(name),
    );

    return namesMatch;
  }

  // Match aliases across minor and patch updates without crossing major versions.
  function pipelinesMatch(firstPipeline, secondPipeline) {
    const firstMajorVersion = getPipelineMajorVersion(firstPipeline?.version);
    const secondMajorVersion = getPipelineMajorVersion(secondPipeline?.version);

    return (
      pipelineNamesMatch(firstPipeline, secondPipeline) &&
      (
        !firstMajorVersion ||
        !secondMajorVersion ||
        firstMajorVersion === secondMajorVersion
      )
    );
  }

  // Compare exact releases when merging indexes so newer versions remain available.
  function exactPipelineRecordsMatch(firstPipeline, secondPipeline) {
    const firstVersion = normalizePipelineVersion(firstPipeline?.version);
    const secondVersion = normalizePipelineVersion(secondPipeline?.version);

    return (
      pipelineNamesMatch(firstPipeline, secondPipeline) &&
      firstVersion === secondVersion
    );
  }

  // Sort dotted versions naturally so 1.10.0 is newer than 1.9.9.
  function comparePipelineVersionsDescending(firstPipeline, secondPipeline) {
    return normalizePipelineVersion(secondPipeline?.version).localeCompare(
      normalizePipelineVersion(firstPipeline?.version),
      undefined,
      { numeric: true, sensitivity: "base" },
    );
  }

  // Return the current saved package order used by rendering and serialization.
  function getOrderedFavoriteNames() {
    return Array.from(favoriteNames);
  }

  // Load the current structured package-and-pipeline favorites format.
  function loadFavoriteState(value) {
    const orderedNames = [];
    const packageIdentities = new Set();
    const pipelineGroups = new Map();

    if (Array.isArray(value)) {
      value.slice(0, 500).forEach((storedEntry) => {
        if (!storedEntry || typeof storedEntry !== "object") {
          return;
        }

        const packageName = normalizeText(storedEntry.packageName).trim();

        if (!packageName) {
          return;
        }

        const packageIdentity = normalizePackageIdentity(packageName);
        if (!orderedNames.some(
          (name) => normalizePackageIdentity(name) === packageIdentity,
        )) {
          orderedNames.push(packageName);
        }

        // Restore whether the package itself was pinned separately from children.
        if (storedEntry.packagePinned === true) {
          packageIdentities.add(packageIdentity);
        }

        // Retain only bounded, unique pipeline identifiers and display fields.
        const seenPipelines = new Set();
        const pipelines = Array.isArray(storedEntry.pipelines)
          ? storedEntry.pipelines.slice(0, 500).flatMap((pipeline) => {
              const normalizedPipeline = {
                name: normalizeText(pipeline?.name).trim(),
                originalName: normalizeText(pipeline?.originalName).trim(),
                version: normalizeText(pipeline?.version).trim(),
              };
              const pipelineIdentity = getPipelineIdentity(normalizedPipeline);

              if (!normalizedPipeline.name || seenPipelines.has(pipelineIdentity)) {
                return [];
              }

              seenPipelines.add(pipelineIdentity);
              return [normalizedPipeline];
            })
          : [];

        if (pipelines.length) {
          pipelineGroups.set(packageIdentity, {
            expanded: storedEntry.pipelinesExpanded !== false,
            packageName,
            pipelines,
          });
        }
      });
    }

    favoriteNames = new Set(orderedNames);
    favoritePackageIdentities = packageIdentities;
    favoritePipelineGroups = pipelineGroups;
  }

  // Serialize only the fields required to restore hierarchy, order, and state.
  function serializeFavoriteState() {
    return getOrderedFavoriteNames().map((packageName) => {
      const packageIdentity = normalizePackageIdentity(packageName);
      const pipelineGroup = favoritePipelineGroups.get(packageIdentity);

      return {
        packageName,
        packagePinned: favoritePackageIdentities.has(packageIdentity),
        pipelines: pipelineGroup?.pipelines ?? [],
        pipelinesExpanded: pipelineGroup?.expanded ?? true,
      };
    });
  }

  // Keep favorites independent across environment and Ellucian workflow.
  function getFavoritesStorageKey() {
    const currentPath = window.location.pathname.toLowerCase();
    const pageName = currentPath.includes("/data-connect-designer")
      ? "designer"
      : "packages";

    return `${window.location.host}|${pageName}`;
  }

  // Validate page-world data before allowing it to affect extension-created controls.
  function normalizeSearchIndex(packages) {
    if (!Array.isArray(packages)) {
      return [];
    }

    return packages.slice(0, 1000).flatMap((packageEntry) => {
      if (!packageEntry || typeof packageEntry.name !== "string") {
        return [];
      }

      // Keep only valid pipeline objects and the three searchable text fields.
      const pipelines = Array.isArray(packageEntry.pipelines)
        ? packageEntry.pipelines.slice(0, 500).flatMap((pipeline) => {
            if (!pipeline || typeof pipeline.name !== "string") {
              return [];
            }

            return [{
              name: normalizeText(pipeline.name),
              originalName: normalizeText(pipeline.originalName),
              version: normalizeText(pipeline.version),
            }];
          })
        : [];

      return [{
        nodeId: normalizeText(packageEntry.nodeId),
        name: normalizeText(packageEntry.name),
        version: normalizeText(packageEntry.version),
        pipelines,
      }];
    });
  }

  // Preserve previously verified children when Ellucian temporarily empties a row's data.
  function mergeCompleteSearchIndexes(previousIndex, currentIndex) {
    const previousByIdentity = new Map(
      previousIndex.map((packageEntry) => [
        normalizePackageIdentity(packageEntry.name),
        packageEntry,
      ]),
    );

    // Keep the current package set while supplementing only temporarily missing children.
    return currentIndex.map((packageEntry) => {
      const previousEntry = previousByIdentity.get(
        normalizePackageIdentity(packageEntry.name),
      );
      const mergedPipelines = [...packageEntry.pipelines];

      // Retain each earlier verified child unless the new row still represents it.
      (previousEntry?.pipelines ?? []).forEach((previousPipeline) => {
        if (!mergedPipelines.some((pipeline) =>
          exactPipelineRecordsMatch(pipeline, previousPipeline),
        )) {
          mergedPipelines.push(previousPipeline);
        }
      });

      return {
        ...packageEntry,
        pipelines: mergedPipelines,
      };
    });
  }

  // Read a package name from the visible row without depending on React internals.
  function getVisiblePackageName(packageRow) {
    const rowContent = packageRow.querySelector(
      ":scope > .MuiTreeItem-content",
    );
    const titledName = rowContent?.querySelector("span[title]");

    if (titledName?.getAttribute("title")?.trim()) {
      return normalizeText(titledName.getAttribute("title").trim());
    }

    // Fall back to the direct label text when the title attribute is unavailable.
    return normalizeText(
      rowContent?.querySelector(".MuiTreeItem-label")?.textContent?.trim(),
    );
  }

  // Build a package-first fallback index from the rendered tree.
  function buildVisibleDomIndex() {
    return Array.from(
      document.querySelectorAll('li[data-level="1"][data-nodeid]'),
      (packageRow) => {
        // Include rendered child pipelines when a package is already expanded.
        const pipelines = Array.from(
          packageRow.querySelectorAll(
            'li[data-level="2"][pipeline-element], li[data-level="2"][pipelineelement]',
          ),
          (pipelineRow) => ({
            name: normalizeText(
              pipelineRow.querySelector("span[title]")?.getAttribute("title"),
            ),
            originalName: "",
            version: normalizeText(
              pipelineRow.querySelector('span[id$="-chip"]')?.textContent?.trim(),
            ),
          }),
        ).filter((pipeline) => pipeline.name);

        return {
          nodeId: normalizeText(packageRow.getAttribute("data-nodeid")),
          name: getVisiblePackageName(packageRow),
          version: "",
          pipelines,
        };
      },
    ).filter((packageEntry) => packageEntry.name);
  }

  // Refresh every open result panel after the index or fallback state changes.
  function refreshOpenSearchResults() {
    document.querySelectorAll(".ellucian-package-search").forEach((control) => {
      control.updateSearchResults?.();
    });
  }

  // Re-render every favorites section and package-row star after data changes.
  function refreshFavoritesUI() {
    if (!isSupportedPage()) {
      return;
    }

    document.querySelectorAll('[data-testid="master"]').forEach((panel) => {
      updateFavoritesForPanel(panel);
    });
  }

  // Load the correct page-specific favorites after an in-app route change.
  function loadFavoritesForCurrentPage() {
    if (!isSupportedPage()) {
      activeFavoritesStorageKey = "";
      applySearchMode();
      return;
    }

    const requestedStorageKey = getFavoritesStorageKey();
    activeFavoritesStorageKey = requestedStorageKey;

    chrome.storage.local.get(
      {
        [FAVORITES_BY_HOST_KEY]: {},
        [FAVORITES_EXPANDED_BY_HOST_KEY]: {},
        [FAVORITES_HEIGHTS_BY_HOST_KEY]: {},
      },
      (settings) => {
        // Ignore a delayed response if the user navigated again meanwhile.
        if (
          !isSupportedPage() ||
          getFavoritesStorageKey() !== requestedStorageKey
        ) {
          return;
        }

        const favoritesByHost = settings[FAVORITES_BY_HOST_KEY] ?? {};
        const expandedByHost =
          settings[FAVORITES_EXPANDED_BY_HOST_KEY] ?? {};
        const heightsByHost = settings[FAVORITES_HEIGHTS_BY_HOST_KEY] ?? {};

        // Restore the destination page's hierarchy, disclosure, and height.
        loadFavoriteState(favoritesByHost[requestedStorageKey]);
        favoritesExpanded = expandedByHost[requestedStorageKey] !== false;
        const storedHeight = Number(heightsByHost[requestedStorageKey]);
        favoriteListHeight =
          Number.isFinite(storedHeight) && storedHeight > 0
            ? storedHeight
            : null;

        applySearchMode();
        requestSearchIndex();
      },
    );
  }

  // Use the visible package tree when private React properties are unavailable.
  function activateDomFallback() {
    // Keep the last complete index through transient package-row replacements.
    if (
      completeSearchIndex.length &&
      completeSearchIndexKey === getFavoritesStorageKey()
    ) {
      searchIndex = completeSearchIndex;
      indexState = "ready";
      refreshOpenSearchResults();
      refreshFavoritesUI();
      return;
    }

    const fallbackIndex = buildVisibleDomIndex();

    // Mark fallback mode even when React has not rendered package rows yet.
    searchIndex = fallbackIndex;
    indexState = "fallback";
    refreshOpenSearchResults();
    refreshFavoritesUI();
  }

  // Ask the page-world helper for the currently rendered package index.
  function requestSearchIndex() {
    latestRequestId = crypto.randomUUID();
    indexState = searchIndex.length ? indexState : "loading";

    // Replace the previous timeout so only the newest request can trigger fallback.
    window.clearTimeout(indexResponseTimer);
    indexResponseTimer = window.setTimeout(() => {
      activateDomFallback();
    }, INDEX_RESPONSE_TIMEOUT);

    window.postMessage(
      {
        source: MESSAGE_SOURCE,
        type: INDEX_REQUEST,
        requestId: latestRequestId,
      },
      window.location.origin,
    );
  }

  // Locate the package row represented by one sanitized index entry.
  function findPackageRow(packageEntry) {
    const packageRows = Array.from(
      document.querySelectorAll('li[data-level="1"][data-nodeid]'),
    );
    const nodeMatch = packageRows.find(
      (packageRow) =>
        packageRow.getAttribute("data-nodeid") === packageEntry.nodeId,
    );

    // Retain package selection if Ellucian changes its generated node identifiers.
    return (
      nodeMatch ??
      packageRows.find(
        (packageRow) => getVisiblePackageName(packageRow) === packageEntry.name,
      )
    );
  }

  // Locate a rendered child pipeline by its stable visible name and version.
  function findPipelineRow(packageRow, pipelineEntry) {
    if (!packageRow) return null;
    return Array.from(
      packageRow.querySelectorAll(
        'li[data-level="2"][pipeline-element], li[data-level="2"][pipelineelement]',
      ),
    ).find((pipelineRow) => {
      const name = pipelineRow.querySelector("span[title]")?.getAttribute("title");
      const version = pipelineRow.querySelector('span[id$="-chip"]')?.textContent;

      // Ignore the display-only v prefix while still selecting the exact release.
      return (
        name === pipelineEntry.name &&
        (!pipelineEntry.version || normalizePipelineVersion(version) === normalizePipelineVersion(pipelineEntry.version))
      );
    });
  }

  // Click the same Material UI row content a user would select manually.
  function activateTreeRow(treeRow) {
    const rowContent = treeRow?.querySelector(":scope > .MuiTreeItem-content");

    if (!rowContent) {
      return;
    }

    rowContent.scrollIntoView({ block: "nearest" });
    rowContent.click();
  }

  // Reopen a package if selecting it makes Ellucian toggle the row closed.
  function keepPackageExpanded(packageRow, packageEntry) {
    if (!packageEntry?.pipelines?.length) {
      return;
    }

    window.requestAnimationFrame(() => {
      if (
        packageRow.isConnected &&
        packageRow.getAttribute("aria-expanded") !== "true"
      ) {
        activateTreeRow(packageRow);
      }
    });
  }

  // Reveal native child pipelines after selecting a pinned package, without lowering a high row.
  function revealPinnedPackagePipelines(packageEntry, sequence) {
    let remainingChecks = 10;
    let watchedRegion = null;
    let userScrolled = false;

    // Stop adjusting immediately if the user starts scrolling the native package list.
    const cancelForUserScroll = () => { userScrolled = true; };
    const cancelForKeyboardScroll = (event) => {
      if (["ArrowUp", "ArrowDown", "PageUp", "PageDown", "Home", "End", " "].includes(event.key)) userScrolled = true;
    };
    const cleanup = () => {
      watchedRegion?.removeEventListener("wheel", cancelForUserScroll);
      watchedRegion?.removeEventListener("keydown", cancelForKeyboardScroll);
    };

    // Re-find replaced rows and allow Ellucian's short expansion animation to settle.
    const checkPosition = () => {
      if (sequence !== navigationSequence || !isSupportedPage() || userScrolled) {
        cleanup();
        return;
      }
      const packageRow = findPackageRow(packageEntry);
      const rowContent = packageRow?.querySelector(":scope > .MuiTreeItem-content");
      const region = packageRow?.closest('[data-ellucian-scroll-region="true"]');

      // Watch only the native scroll region, never the favorites area or whole page.
      if (region !== watchedRegion) {
        cleanup();
        watchedRegion = region;
        watchedRegion?.addEventListener("wheel", cancelForUserScroll, { passive: true });
        watchedRegion?.addEventListener("keydown", cancelForKeyboardScroll);
      }
      const pipelines = packageRow ? Array.from(packageRow.querySelectorAll(
        'li[data-level="2"][pipeline-element], li[data-level="2"][pipelineelement]',
      )).slice(0, 5) : [];

      // Wait for rendered children instead of estimating space from a stale index.
      if (rowContent && region?.clientHeight > 0 && pipelines.length &&
          packageRow.getAttribute("aria-expanded") === "true") {
        const rowBounds = rowContent.getBoundingClientRect();
        const lastPipelineBounds = pipelines.at(-1).getBoundingClientRect();
        const visibleTop = region.getBoundingClientRect().top + region.clientTop;

        // Prefer the midpoint, or higher when five child rows need more room below it.
        const requiredSpace = Math.max(rowBounds.height, lastPipelineBounds.bottom - rowBounds.top) + 12;
        const desiredOffset = Math.max(8, Math.min(region.clientHeight / 2, region.clientHeight - requiredSpace));
        const currentOffset = rowBounds.top - visibleTop;

        // Only raise a row that is too low; leave already-high packages exactly where they are.
        if (rowBounds.height > 0 && currentOffset > desiredOffset + 1) {
          const maximumScroll = Math.max(0, region.scrollHeight - region.clientHeight);
          const targetScroll = Math.min(maximumScroll, region.scrollTop + currentOffset - desiredOffset);
          if (targetScroll > region.scrollTop) region.scrollTop = targetScroll;
        }
      }

      // Finish after one brief settling window, with no ongoing background polling.
      if (--remainingChecks > 0) window.setTimeout(checkPosition, 100);
      else cleanup();
    };

    // Let normal package activation and the existing expansion retry run first.
    window.requestAnimationFrame(() => window.requestAnimationFrame(checkPosition));
  }

  // Wait for React to render a pipeline after its package is expanded.
  function waitForPipelineRow(packageEntry, pipelineEntry) {
    return new Promise((resolve) => {
      // Re-find the package because React can replace its original tree node.
      const findCurrentPipeline = () => {
        const currentPackageRow = findPackageRow(packageEntry);

        return currentPackageRow
          ? findPipelineRow(currentPackageRow, pipelineEntry)
          : null;
      };
      const existingPipeline = findCurrentPipeline();

      if (existingPipeline) {
        resolve(existingPipeline);
        return;
      }

      // Watch the package tree so replacement rows are included in the search.
      const packageTree = document.querySelector('[role="tree"]');
      const observer = new MutationObserver(() => {
        const pipelineRow = findCurrentPipeline();

        if (pipelineRow) {
          observer.disconnect();
          window.clearTimeout(timeoutId);
          resolve(pipelineRow);
        }
      });

      if (packageTree) {
        observer.observe(packageTree, { childList: true, subtree: true });
      }

      // Allow slower package loads before falling back to the package page.
      const timeoutId = window.setTimeout(() => {
        observer.disconnect();
        resolve(findCurrentPipeline());
      }, 5000);
    });
  }

  // Select a package or expand its parent and select the requested pipeline.
  async function activateSearchResult(result) {
    // Each new selection cancels any unfinished older navigation.
    const sequence = ++navigationSequence;
    const packageRow = findPackageRow(result.packageEntry);

    if (!packageRow) {
      requestSearchIndex();
      return;
    }

    // Package results need only the normal row activation.
    if (result.type === "package") {
      activateTreeRow(packageRow);
      keepPackageExpanded(packageRow, result.packageEntry);
      // Pinned parents should expose their native children without changing other navigation.
      if (result.revealPipelines) revealPinnedPackagePipelines(result.packageEntry, sequence);
      return;
    }

    // Expand a collapsed package before looking for its child pipeline node.
    if (packageRow.getAttribute("aria-expanded") !== "true") {
      activateTreeRow(packageRow);
    }

    const pipelineRow = await waitForPipelineRow(
      result.packageEntry,
      result.pipelineEntry,
    );
    if (!pipelineRow || sequence !== navigationSequence) return;
    // Wait for the parent render to settle before invoking the child selection.
    await new Promise((resolve) => window.requestAnimationFrame(() => window.requestAnimationFrame(resolve)));
    if (sequence !== navigationSequence) return;
    activateTreeRow(findPipelineRow(findPackageRow(result.packageEntry), result.pipelineEntry));
    // Wait out a late loading update, then confirm the requested detail view.
    let remainingChecks = 6;
    const confirmSelection = () => {
      if (sequence !== navigationSequence) return;
      const heading = Array.from(document.querySelectorAll('h2')).find((item) => item.textContent.trim().startsWith('Pipeline:'));
      const row = findPipelineRow(findPackageRow(result.packageEntry), result.pipelineEntry);
      if (heading?.textContent.includes(result.pipelineEntry.name) && row?.getAttribute('aria-selected') === 'true') return;
      if (--remainingChecks < 0 || !row) return;
      const loading = Array.from(document.querySelectorAll('[role="alert"]')).some((alert) => /loading.*please wait/i.test(alert.textContent));
      if (!loading) activateTreeRow(row);
      window.setTimeout(confirmSelection, 500);
    };
    window.setTimeout(confirmSelection, 500);
  }

  // Build the shared vector star used by package rows and favorite controls.
  function createFavoriteStarIcon() {
    const icon = document.createElementNS(
      "http://www.w3.org/2000/svg",
      "svg",
    );
    icon.classList.add("ellucian-favorite-star-icon");
    icon.setAttribute("viewBox", "0 0 24 24");
    icon.setAttribute("aria-hidden", "true");

    // Use one continuous shape so outlined and filled states align exactly.
    const star = document.createElementNS(
      "http://www.w3.org/2000/svg",
      "path",
    );
    star.setAttribute(
      "d",
      "M12 3.4l2.66 5.39 5.95.86-4.3 4.2 1.02 5.92L12 16.97l-5.32 2.8 1.01-5.92-4.3-4.2 5.95-.86L12 3.4z",
    );
    icon.appendChild(star);
    return icon;
  }

  // Build a compact six-dot grip for mouse, touchpad, and keyboard reordering.
  function createFavoriteDragIcon() {
    const icon = document.createElementNS(
      "http://www.w3.org/2000/svg",
      "svg",
    );
    icon.classList.add("ellucian-favorite-drag-icon");
    icon.setAttribute("viewBox", "0 0 16 20");
    icon.setAttribute("aria-hidden", "true");

    // Draw two aligned columns of dots without relying on a font glyph.
    [5, 10, 15].forEach((verticalPosition) => {
      [5, 11].forEach((horizontalPosition) => {
        const dot = document.createElementNS(
          "http://www.w3.org/2000/svg",
          "circle",
        );
        dot.setAttribute("cx", String(horizontalPosition));
        dot.setAttribute("cy", String(verticalPosition));
        dot.setAttribute("r", "1.35");
        icon.appendChild(dot);
      });
    });

    return icon;
  }

  // Remove temporary drag styling from every favorites row.
  function clearFavoriteDragIndicators() {
    document
      .querySelectorAll(
        ".ellucian-favorite-item, .ellucian-favorite-pipeline-item",
      )
      .forEach((item) => {
        item.removeAttribute("data-dragging");
        item.removeAttribute("data-drop-position");
      });
  }

  // Persist the current page's complete favorite hierarchy without changing other pages.
  function saveFavorites() {
    // Snapshot the originating page and pins before navigation can change either one.
    const storageKey = getFavoritesStorageKey();
    const favoriteState = structuredClone(serializeFavoriteState());
    chrome.storage.local.get(
      { [FAVORITES_BY_HOST_KEY]: {} },
      (settings) => {
        // A failed read must not replace other pages' saved favorites with an empty map.
        if (chrome.runtime.lastError) return;
        const favoritesByHost = {
          ...settings[FAVORITES_BY_HOST_KEY],
          // Preserve parent order, explicit package pins, pipeline pins, and open states.
          [storageKey]: favoriteState,
        };

        chrome.storage.local.set({
          [FAVORITES_BY_HOST_KEY]: favoritesByHost,
        });
      },
    );
  }

  // Persist whether this environment's favorites section is expanded.
  function saveFavoritesExpandedState() {
    // Keep a delayed disclosure save attached to the page where the click occurred.
    const storageKey = getFavoritesStorageKey();
    const expanded = favoritesExpanded;
    chrome.storage.local.get(
      { [FAVORITES_EXPANDED_BY_HOST_KEY]: {} },
      (settings) => {
        // Preserve saved disclosure states if the storage read fails.
        if (chrome.runtime.lastError) return;
        const expandedByHost = {
          ...settings[FAVORITES_EXPANDED_BY_HOST_KEY],
          [storageKey]: expanded,
        };

        chrome.storage.local.set({
          [FAVORITES_EXPANDED_BY_HOST_KEY]: expandedByHost,
        });
      },
    );
  }

  // Calculate a practical maximum that still leaves room for the main package list.
  function getMaximumFavoritesListHeight() {
    return Math.max(
      MIN_FAVORITES_LIST_HEIGHT,
      Math.min(
        MAX_FAVORITES_LIST_HEIGHT,
        Math.floor(window.innerHeight * MAX_FAVORITES_VIEWPORT_RATIO),
      ),
    );
  }

  // Apply and expose one remembered favorites-list height without saving mid-drag.
  function setFavoritesListHeight(section, requestedHeight) {
    const maximumHeight = getMaximumFavoritesListHeight();
    const adjustedHeight = Math.min(
      maximumHeight,
      Math.max(MIN_FAVORITES_LIST_HEIGHT, Math.round(requestedHeight)),
    );
    const resizeHandle = section.querySelector(
      ":scope > .ellucian-favorites-resize-handle",
    );
    const heightValue = `${adjustedHeight}px`;
    const heightChanged =
      !section.hasAttribute("data-custom-height") ||
      section.style.getPropertyValue("--ellucian-favorites-list-height") !==
        heightValue;

    favoriteListHeight = adjustedHeight;
    resizeHandle?.setAttribute("aria-valuenow", String(adjustedHeight));
    resizeHandle?.setAttribute("aria-valuemax", String(maximumHeight));

    // Stop here when repeated observer updates produce the same saved size.
    if (!heightChanged) {
      return;
    }

    section.setAttribute("data-custom-height", "true");
    section.style.setProperty(
      "--ellucian-favorites-list-height",
      heightValue,
    );

    // Recalculate the main package region within the same animation cycle.
    window.dispatchEvent(new Event(LAYOUT_REQUEST_EVENT));
  }

  // Save the completed vertical resize for the current environment.
  function saveFavoritesListHeight() {
    if (favoriteListHeight === null) {
      return;
    }

    chrome.storage.local.get(
      { [FAVORITES_HEIGHTS_BY_HOST_KEY]: {} },
      (settings) => {
        const heightsByHost = {
          ...settings[FAVORITES_HEIGHTS_BY_HOST_KEY],
          [getFavoritesStorageKey()]: favoriteListHeight,
        };

        chrome.storage.local.set({
          [FAVORITES_HEIGHTS_BY_HOST_KEY]: heightsByHost,
        });
      },
    );
  }

  // Add or remove one explicit package pin while retaining any pinned pipelines.
  function togglePackageFavorite(packageName) {
    const packageIdentity = normalizePackageIdentity(packageName);
    const savedName = Array.from(favoriteNames).find(
      (favoriteName) =>
        normalizePackageIdentity(favoriteName) === packageIdentity,
    );

    // An implicit parent stays visible while it still contains pinned pipelines.
    if (favoritePackageIdentities.has(packageIdentity)) {
      favoritePackageIdentities.delete(packageIdentity);

      if (!favoritePipelineGroups.get(packageIdentity)?.pipelines.length) {
        favoriteNames.delete(savedName);
      }
    } else {
      favoritePackageIdentities.add(packageIdentity);

      if (!savedName) {
        favoriteNames.add(packageName);
      }
    }

    refreshFavoritesUI();
    saveFavorites();
  }

  // Add or remove one pipeline pin and create or remove its implicit package parent.
  function togglePipelineFavorite(packageName, pipelineEntry) {
    const packageIdentity = normalizePackageIdentity(packageName);
    const pipeline = {
      name: normalizeText(pipelineEntry?.name).trim(),
      originalName: normalizeText(pipelineEntry?.originalName).trim(),
      version: normalizeText(pipelineEntry?.version).trim(),
    };

    if (!packageIdentity || !pipeline.name) {
      return;
    }

    const pipelineIdentity = getPipelineIdentity(pipeline);
    const savedName = Array.from(favoriteNames).find(
      (favoriteName) =>
        normalizePackageIdentity(favoriteName) === packageIdentity,
    );
    const currentGroup = favoritePipelineGroups.get(packageIdentity);
    const currentPipelines = currentGroup?.pipelines ?? [];
    const existingIndex = currentPipelines.findIndex(
      (savedPipeline) => getPipelineIdentity(savedPipeline) === pipelineIdentity,
    );

    // Remove the requested child or append it in the order it was pinned.
    const nextPipelines = [...currentPipelines];
    if (existingIndex >= 0) {
      nextPipelines.splice(existingIndex, 1);
    } else {
      nextPipelines.push(pipeline);
    }

    // Keep group metadata only while at least one pipeline remains pinned.
    if (nextPipelines.length) {
      favoritePipelineGroups.set(packageIdentity, {
        expanded: currentGroup?.expanded !== false,
        packageName: savedName || packageName,
        pipelines: nextPipelines,
      });

      if (!savedName) {
        favoriteNames.add(packageName);
      }
    } else {
      favoritePipelineGroups.delete(packageIdentity);

      if (!favoritePackageIdentities.has(packageIdentity)) {
        favoriteNames.delete(savedName);
      }
    }

    refreshFavoritesUI();
    saveFavorites();
  }

  // Remember whether one package's pinned pipeline children are visible.
  function setFavoritePipelinesExpanded(packageName, expanded) {
    const packageIdentity = normalizePackageIdentity(packageName);
    const group = favoritePipelineGroups.get(packageIdentity);

    if (!group || group.expanded === expanded) {
      return;
    }

    favoritePipelineGroups.set(packageIdentity, {
      ...group,
      expanded,
    });
    refreshFavoritesUI();
    saveFavorites();
  }

  // Move one saved favorite relative to another while preserving unavailable pins.
  function moveFavorite(sourceName, targetName, insertAfter) {
    const orderedNames = Array.from(favoriteNames);
    const sourceIdentity = normalizePackageIdentity(sourceName);
    const targetIdentity = normalizePackageIdentity(targetName);
    const sourceIndex = orderedNames.findIndex(
      (name) => normalizePackageIdentity(name) === sourceIdentity,
    );

    if (sourceIndex < 0 || sourceIdentity === targetIdentity) {
      return;
    }

    // Remove the source before resolving the target's updated position.
    const [movedName] = orderedNames.splice(sourceIndex, 1);
    const targetIndex = orderedNames.findIndex(
      (name) => normalizePackageIdentity(name) === targetIdentity,
    );

    if (targetIndex < 0) {
      return;
    }

    orderedNames.splice(targetIndex + (insertAfter ? 1 : 0), 0, movedName);
    favoriteNames = new Set(orderedNames);
    refreshFavoritesUI();
    saveFavorites();
  }

  // Return focus to the moved handle after its row is safely re-rendered.
  function focusFavoriteHandle(packageName) {
    window.requestAnimationFrame(() => {
      document
        .querySelectorAll(".ellucian-favorite-drag-handle")
        .forEach((handle) => {
          if (
            normalizePackageIdentity(handle.dataset.packageName) ===
            normalizePackageIdentity(packageName)
          ) {
            handle.focus();
          }
        });
    });
  }

  // Move one pinned pipeline within its own package and preserve its saved order.
  function moveFavoritePipeline(
    packageName,
    sourcePipeline,
    targetPipeline,
    insertAfter,
  ) {
    const packageIdentity = normalizePackageIdentity(packageName);
    const currentGroup = favoritePipelineGroups.get(packageIdentity);
    const orderedPipelines = [...(currentGroup?.pipelines ?? [])];
    const sourceIdentity = getPipelineIdentity(sourcePipeline);
    const targetIdentity = getPipelineIdentity(targetPipeline);
    const sourceIndex = orderedPipelines.findIndex(
      (pipeline) => getPipelineIdentity(pipeline) === sourceIdentity,
    );

    if (sourceIndex < 0 || sourceIdentity === targetIdentity) {
      return;
    }

    // Remove the source before locating the target's updated array position.
    const [movedPipeline] = orderedPipelines.splice(sourceIndex, 1);
    const targetIndex = orderedPipelines.findIndex(
      (pipeline) => getPipelineIdentity(pipeline) === targetIdentity,
    );

    if (targetIndex < 0) {
      return;
    }

    // Save the child order without changing the package pin or disclosure state.
    orderedPipelines.splice(
      targetIndex + (insertAfter ? 1 : 0),
      0,
      movedPipeline,
    );
    favoritePipelineGroups.set(packageIdentity, {
      ...currentGroup,
      pipelines: orderedPipelines,
    });
    refreshFavoritesUI();
    saveFavorites();
  }

  // Return keyboard focus to a moved pipeline handle after the list re-renders.
  function focusFavoritePipelineHandle(packageName, pipelineEntry) {
    const packageIdentity = normalizePackageIdentity(packageName);
    const pipelineIdentity = getPipelineIdentity(pipelineEntry);

    window.requestAnimationFrame(() => {
      document
        .querySelectorAll(".ellucian-favorite-pipeline-drag-handle")
        .forEach((handle) => {
          if (
            handle.dataset.packageIdentity === packageIdentity &&
            handle.dataset.pipelineIdentity === pipelineIdentity
          ) {
            handle.focus();
          }
        });
    });
  }

  // Remove extension-owned favorite controls when the feature is disabled.
  function removeFavoritesFromPanel(panel) {
    panel.querySelector(":scope > .ellucian-favorites-section")?.remove();
    document.documentElement.removeAttribute(
      "data-ellucian-favorites-resizing",
    );
    panel
      .querySelectorAll(".ellucian-package-favorite-button")
      .forEach((button) => button.remove());
    panel
      .querySelectorAll(".ellucian-pipeline-favorite-button")
      .forEach((button) => button.remove());
    panel
      .querySelectorAll('[data-ellucian-package-row="true"]')
      .forEach((rowContent) => {
        rowContent.removeAttribute("data-ellucian-package-row");
      });
  }

  // Add or refresh one star button without interfering with package selection.
  function updatePackageFavoriteButton(packageRow, favoriteIdentities) {
    const rowContent = packageRow.querySelector(
      ":scope > .MuiTreeItem-content",
    );
    const packageName = getVisiblePackageName(packageRow);

    if (!rowContent || !packageName) {
      return;
    }

    rowContent.setAttribute("data-ellucian-package-row", "true");
    let favoriteButton = rowContent.querySelector(
      ":scope > .ellucian-package-favorite-button",
    );

    // Create one stable button after Ellucian's package label.
    if (!favoriteButton) {
      favoriteButton = document.createElement("button");
      favoriteButton.type = "button";
      favoriteButton.className = "ellucian-package-favorite-button";
      favoriteButton.appendChild(createFavoriteStarIcon());

      // Prevent the containing tree row from selecting or expanding first.
      favoriteButton.addEventListener("pointerdown", (event) => {
        event.stopPropagation();
      });
      favoriteButton.addEventListener("click", (event) => {
        event.preventDefault();
        event.stopPropagation();
        togglePackageFavorite(favoriteButton.dataset.packageName);
      });
      rowContent.appendChild(favoriteButton);
    }

    // Keep the control accurate if React reuses a row for different data.
    const isFavorite = favoriteIdentities.has(
      normalizePackageIdentity(packageName),
    );
    favoriteButton.dataset.packageName = packageName;
    favoriteButton.dataset.favorite = String(isFavorite);
    favoriteButton.setAttribute("aria-pressed", String(isFavorite));
    favoriteButton.setAttribute(
      "aria-label",
      isFavorite
        ? `Remove ${packageName} from pinned packages`
        : `Pin ${packageName}`,
    );
    favoriteButton.setAttribute(
      "title",
      isFavorite ? "Remove from pinned packages" : "Pin package",
    );
  }

  // Resolve a pipeline's owner from stable node data before falling back to names.
  function getPipelinePackageEntry(pipelineRow, pipelineEntry) {
    const packageRow = pipelineRow.closest('li[data-level="1"][data-nodeid]');
    const packageNodeId = packageRow?.getAttribute("data-nodeid") ?? "";
    const nodeMatch = searchIndex.find(
      (packageEntry) => packageEntry.nodeId === packageNodeId,
    );

    if (nodeMatch) {
      return nodeMatch;
    }

    // Match the visible package label when Ellucian changes generated node IDs.
    const visiblePackageName = packageRow
      ? getVisiblePackageName(packageRow)
      : "";
    const nameMatch = searchIndex.find(
      (packageEntry) =>
        normalizePackageIdentity(packageEntry.name) ===
        normalizePackageIdentity(visiblePackageName),
    );

    if (nameMatch) {
      return nameMatch;
    }

    // Use a unique pipeline match when the rendered group is not nested in its owner.
    const pipelineMatches = searchIndex.filter((packageEntry) =>
      packageEntry.pipelines.some(
        (candidate) =>
          getPipelineIdentity(candidate) === getPipelineIdentity(pipelineEntry),
      ),
    );

    if (pipelineMatches.length === 1) {
      return pipelineMatches[0];
    }

    // Retain DOM-only fallback support while the private React index is unavailable.
    return visiblePackageName
      ? {
          name: visiblePackageName,
          nodeId: packageNodeId,
          pipelines: [pipelineEntry],
          version: "",
        }
      : null;
  }

  // Add or refresh a star beside one currently rendered pipeline row.
  function updatePipelineFavoriteButton(pipelineRow) {
    const rowContent = pipelineRow.querySelector(
      ":scope > .MuiTreeItem-content",
    );
    const pipelineHost = rowContent?.querySelector(
      '[data-ellucian-pipeline-row="true"]',
    );
    const pipelineName = pipelineHost
      ?.querySelector("span[title]")
      ?.getAttribute("title")
      ?.trim();
    const pipelineVersion = pipelineHost
      ?.querySelector('span[id$="-chip"]')
      ?.textContent
      ?.trim() ?? "";
    if (!pipelineHost || !pipelineName) {
      return;
    }

    const visiblePipeline = {
      name: pipelineName,
      originalName: "",
      version: pipelineVersion,
    };
    const packageEntry = getPipelinePackageEntry(
      pipelineRow,
      visiblePipeline,
    );

    if (!packageEntry) {
      return;
    }

    const packageName = packageEntry.name;
    const packageIdentity = normalizePackageIdentity(packageName);
    const pipelineEntry = packageEntry.pipelines.find(
        (pipeline) =>
          pipeline.name === pipelineName &&
          (!pipelineVersion || pipeline.version === pipelineVersion),
      ) ?? visiblePipeline;
    const isFavorite = Boolean(
      favoritePipelineGroups
        .get(packageIdentity)
        ?.pipelines.some(
          (pipeline) =>
            getPipelineIdentity(pipeline) === getPipelineIdentity(pipelineEntry),
        ),
    );
    let favoriteButton = pipelineHost.querySelector(
      ":scope > .ellucian-pipeline-favorite-button",
    );

    // Create one stable child button without triggering the containing tree row.
    if (!favoriteButton) {
      favoriteButton = document.createElement("button");
      favoriteButton.type = "button";
      favoriteButton.className = "ellucian-pipeline-favorite-button";
      favoriteButton.appendChild(createFavoriteStarIcon());
      favoriteButton.addEventListener("pointerdown", (event) => {
        event.stopPropagation();
      });
      favoriteButton.addEventListener("click", (event) => {
        event.preventDefault();
        event.stopPropagation();
        togglePipelineFavorite(
          favoriteButton.dataset.packageName,
          {
            name: favoriteButton.dataset.pipelineName,
            originalName: favoriteButton.dataset.pipelineOriginalName,
            version: favoriteButton.dataset.pipelineVersion,
          },
        );
      });
      pipelineHost.appendChild(favoriteButton);
    }

    // Keep saved identifiers accurate if React reuses a rendered child row.
    favoriteButton.dataset.packageName = packageName;
    favoriteButton.dataset.pipelineName = pipelineEntry.name;
    favoriteButton.dataset.pipelineOriginalName = pipelineEntry.originalName;
    favoriteButton.dataset.pipelineVersion = pipelineEntry.version;
    favoriteButton.dataset.favorite = String(isFavorite);
    favoriteButton.setAttribute("aria-pressed", String(isFavorite));
    favoriteButton.setAttribute(
      "aria-label",
      isFavorite
        ? `Remove ${pipelineEntry.name} from pinned pipelines`
        : `Pin ${pipelineEntry.name}`,
    );
    favoriteButton.setAttribute(
      "title",
      isFavorite ? "Remove from pinned pipelines" : "Pin pipeline",
    );
  }

  // Populate the collapsible favorites section using only currently available data.
  function renderFavoritesSection(panel, section) {
    const toggleButton = section.querySelector(".ellucian-favorites-toggle");
    const count = section.querySelector(".ellucian-favorites-count");
    const list = section.querySelector(".ellucian-favorites-list");
    // Prefer the last complete index so collapsing another package cannot hide pins.
    const verifiedIndex =
      completeSearchIndexKey === getFavoritesStorageKey() &&
      completeSearchIndex.length
        ? completeSearchIndex
        : searchIndex;
    const indexedByIdentity = new Map(
      verifiedIndex.map((packageEntry) => [
        normalizePackageIdentity(packageEntry.name),
        packageEntry,
      ]),
    );

    // Use visible package rows for live node identifiers and the index for child data.
    const visiblePackages = Array.from(
      panel.querySelectorAll('li[data-level="1"][data-nodeid]'),
      (packageRow) => {
        const name = getVisiblePackageName(packageRow);
        const indexedEntry = indexedByIdentity.get(
          normalizePackageIdentity(name),
        );

        // Include expanded child rows even when Ellucian's private index is stale.
        const renderedPipelines = Array.from(
          packageRow.querySelectorAll(
            'li[data-level="2"][pipeline-element], li[data-level="2"][pipelineelement]',
          ),
          (pipelineRow) => ({
            name: normalizeText(
              pipelineRow.querySelector("span[title]")?.getAttribute("title"),
            ).trim(),
            originalName: "",
            version: normalizeText(
              pipelineRow.querySelector('span[id$="-chip"]')?.textContent,
            ).trim(),
          }),
        ).filter((pipeline) => pipeline.name);
        const mergedPipelines = [...(indexedEntry?.pipelines ?? [])];

        // Add only live rows not already represented by the indexed aliases.
        renderedPipelines.forEach((renderedPipeline) => {
          if (!mergedPipelines.some((pipeline) =>
            exactPipelineRecordsMatch(pipeline, renderedPipeline),
          )) {
            mergedPipelines.push(renderedPipeline);
          }
        });

        return {
          nodeId: normalizeText(packageRow.getAttribute("data-nodeid")),
          name,
          version: indexedEntry?.version ?? "",
          pipelines: mergedPipelines,
        };
      },
    ).filter((packageEntry) => packageEntry.name);

    // Start with every verified package so one transient visible row cannot erase it.
    const availableByIdentity = new Map(
      verifiedIndex.map((packageEntry) => [
        normalizePackageIdentity(packageEntry.name),
        packageEntry,
      ]),
    );

    // Overlay current node identifiers and any newly rendered pipeline information.
    visiblePackages.forEach((packageEntry) => {
      availableByIdentity.set(
        normalizePackageIdentity(packageEntry.name),
        packageEntry,
      );
    });
    const seenFavorites = new Set();

    // Resolve saved pipeline pins against the current index without deleting stale pins.
    const orderedFavoriteNames = getOrderedFavoriteNames();
    const availableFavorites = orderedFavoriteNames.flatMap(
      (favoriteName) => {
        const identity = normalizePackageIdentity(favoriteName);
        const packageEntry = availableByIdentity.get(identity);

        if (seenFavorites.has(identity) || !packageEntry) {
          return [];
        }

        const savedGroup = favoritePipelineGroups.get(identity);
        const favoritePipelines = (savedGroup?.pipelines ?? []).flatMap(
          (savedPipeline) => {
            const sameNamePipelines = packageEntry.pipelines.filter((pipeline) =>
              pipelineNamesMatch(pipeline, savedPipeline),
            );
            const matchingPipeline =
              sameNamePipelines
                .filter((pipeline) =>
                  pipelinesMatch(pipeline, savedPipeline),
                )
                .sort(comparePipelineVersionsDescending)[0] ??
              // Accept a sole name match when Ellucian reformats its version value.
              (sameNamePipelines.length === 1 ? sameNamePipelines[0] : null);

            // Keep the saved, previously verified child while Ellucian unloads its row.
            return [matchingPipeline ?? savedPipeline];
          },
        );
        const packagePinned = favoritePackageIdentities.has(identity);

        // Hide unavailable child-only groups while retaining their stored identities.
        if (!packagePinned && !favoritePipelines.length) {
          return [];
        }

        seenFavorites.add(identity);
        return [{
          ...packageEntry,
          favoritePipelines,
          packagePinned,
          pipelinesExpanded: savedGroup?.expanded !== false,
        }];
      },
    );

    // Avoid replacing interactive controls when the complete visible state is unchanged.
    const renderSignature = JSON.stringify({
      expanded: favoritesExpanded,
      indexState,
      savedCount: orderedFavoriteNames.length,
      visibleFavorites: availableFavorites.map((packageEntry) => ({
        name: packageEntry.name,
        packagePinned: packageEntry.packagePinned,
        pipelinesExpanded: packageEntry.pipelinesExpanded,
        pipelines: packageEntry.favoritePipelines.map(getPipelineIdentity),
      })),
    });
    if (section.dataset.renderSignature === renderSignature) {
      return;
    }
    section.dataset.renderSignature = renderSignature;

    section.dataset.expanded = String(favoritesExpanded);
    toggleButton.setAttribute("aria-expanded", String(favoritesExpanded));
    count.textContent = String(availableFavorites.length);
    list.hidden = !favoritesExpanded;
    list.replaceChildren();

    // Give useful context while the complete package-and-pipeline index is loading.
    if (indexState === "loading") {
      const loadingMessage = document.createElement("div");
      loadingMessage.className = "ellucian-favorites-empty";
      loadingMessage.textContent = "Loading pinned packages…";
      list.appendChild(loadingMessage);
      return;
    }

    // Explain an empty or unavailable saved hierarchy without showing stale names.
    if (!availableFavorites.length) {
      const emptyMessage = document.createElement("div");
      emptyMessage.className = "ellucian-favorites-empty";
      emptyMessage.textContent = favoriteNames.size
        ? "No pinned packages or pipelines are currently available."
        : "Select a star beside a package or pipeline to pin it here.";
      list.appendChild(emptyMessage);
      return;
    }

    // Render each package parent with optional pinned pipeline children.
    availableFavorites.forEach((packageEntry) => {
      const group = document.createElement("div");
      group.className = "ellucian-favorite-group";

      const item = document.createElement("div");
      item.className = "ellucian-favorite-item";
      item.dataset.hasPipelines = String(
        packageEntry.favoritePipelines.length > 0,
      );
      item.dataset.pipelinesExpanded = String(packageEntry.pipelinesExpanded);

      const dragHandle = document.createElement("button");
      dragHandle.type = "button";
      dragHandle.className = "ellucian-favorite-drag-handle";
      dragHandle.draggable = true;
      dragHandle.dataset.packageName = packageEntry.name;
      dragHandle.appendChild(createFavoriteDragIcon());
      dragHandle.setAttribute(
        "aria-label",
        `Reorder ${packageEntry.name}. Use the up and down arrow keys.`,
      );
      dragHandle.setAttribute(
        "title",
        "Drag to reorder, or use Up and Down when focused",
      );

      // Keep handle clicks separate from the parent's expand/collapse target.
      dragHandle.addEventListener("click", (event) => {
        event.stopPropagation();
      });

      // Start a native drag using only the dedicated handle.
      dragHandle.addEventListener("dragstart", (event) => {
        draggedFavoriteName = packageEntry.name;
        item.setAttribute("data-dragging", "true");
        event.dataTransfer.effectAllowed = "move";
        event.dataTransfer.setData("text/plain", packageEntry.name);
      });

      // Clear drag styling even when the pointer is released outside the list.
      dragHandle.addEventListener("dragend", () => {
        draggedFavoriteName = "";
        clearFavoriteDragIndicators();
      });

      // Offer the same parent reordering without requiring pointer dragging.
      dragHandle.addEventListener("keydown", (event) => {
        if (event.key !== "ArrowUp" && event.key !== "ArrowDown") {
          return;
        }

        const currentIndex = availableFavorites.findIndex(
          (favorite) =>
            normalizePackageIdentity(favorite.name) ===
            normalizePackageIdentity(packageEntry.name),
        );
        const targetIndex =
          event.key === "ArrowUp" ? currentIndex - 1 : currentIndex + 1;

        if (targetIndex < 0 || targetIndex >= availableFavorites.length) {
          return;
        }

        event.preventDefault();
        event.stopPropagation();
        moveFavorite(
          packageEntry.name,
          availableFavorites[targetIndex].name,
          event.key === "ArrowDown",
        );
        focusFavoriteHandle(packageEntry.name);
      });

      // Show whether a dragged parent will land before or after this row.
      item.addEventListener("dragover", (event) => {
        if (
          !draggedFavoriteName ||
          normalizePackageIdentity(draggedFavoriteName) ===
            normalizePackageIdentity(packageEntry.name)
        ) {
          return;
        }

        event.preventDefault();
        event.dataTransfer.dropEffect = "move";
        const bounds = item.getBoundingClientRect();
        item.dataset.dropPosition =
          event.clientY < bounds.top + bounds.height / 2 ? "before" : "after";
      });

      // Remove the insertion line after leaving the complete target row.
      item.addEventListener("dragleave", (event) => {
        if (!item.contains(event.relatedTarget)) {
          item.removeAttribute("data-drop-position");
        }
      });

      // Persist the new parent order and restore focus to the moved handle.
      item.addEventListener("drop", (event) => {
        if (!draggedFavoriteName) {
          return;
        }

        event.preventDefault();
        const movedName = draggedFavoriteName;
        const insertAfter = item.dataset.dropPosition === "after";
        draggedFavoriteName = "";
        clearFavoriteDragIndicators();
        moveFavorite(movedName, packageEntry.name, insertAfter);
        focusFavoriteHandle(movedName);
      });

      const selectButton = document.createElement("button");
      selectButton.type = "button";
      selectButton.className = "ellucian-favorite-select";
      selectButton.textContent = packageEntry.name;
      selectButton.setAttribute("title", packageEntry.name);
      selectButton.addEventListener("click", (event) => {
        event.stopPropagation();
        activateSearchResult({ type: "package", packageEntry, revealPipelines: true });
      });

      // Leave a flexible blank target that toggles children instead of navigation.
      const disclosureSpacer = document.createElement("span");
      disclosureSpacer.className = "ellucian-favorite-spacer";
      disclosureSpacer.setAttribute("aria-hidden", "true");

      const disclosureButton = document.createElement("button");
      disclosureButton.type = "button";
      disclosureButton.className = "ellucian-favorite-disclosure";
      disclosureButton.disabled = !packageEntry.favoritePipelines.length;
      disclosureButton.dataset.empty = String(
        !packageEntry.favoritePipelines.length,
      );
      disclosureButton.setAttribute(
        "aria-expanded",
        String(packageEntry.pipelinesExpanded),
      );
      disclosureButton.setAttribute(
        "aria-label",
        `${packageEntry.pipelinesExpanded ? "Collapse" : "Expand"} pinned pipelines for ${packageEntry.name}`,
      );
      disclosureButton.setAttribute("title", "Show or hide pinned pipelines");
      disclosureButton.addEventListener("click", (event) => {
        event.stopPropagation();
        setFavoritePipelinesExpanded(
          packageEntry.name,
          !packageEntry.pipelinesExpanded,
        );
      });

      const packageButton = document.createElement("button");
      packageButton.type = "button";
      packageButton.className = "ellucian-favorite-remove";
      packageButton.dataset.favorite = String(packageEntry.packagePinned);
      packageButton.appendChild(createFavoriteStarIcon());
      packageButton.setAttribute(
        "aria-pressed",
        String(packageEntry.packagePinned),
      );
      packageButton.setAttribute(
        "aria-label",
        packageEntry.packagePinned
          ? `Remove ${packageEntry.name} package pin`
          : `Pin ${packageEntry.name} package`,
      );
      packageButton.setAttribute(
        "title",
        packageEntry.packagePinned ? "Unpin package" : "Pin package",
      );
      packageButton.addEventListener("click", (event) => {
        event.stopPropagation();
        togglePackageFavorite(packageEntry.name);
      });

      // Treat unused parent-row space as the same disclosure target as the arrow.
      item.addEventListener("click", () => {
        if (packageEntry.favoritePipelines.length) {
          setFavoritePipelinesExpanded(
            packageEntry.name,
            !packageEntry.pipelinesExpanded,
          );
        }
      });

      item.append(
        dragHandle,
        selectButton,
        disclosureSpacer,
        disclosureButton,
        packageButton,
      );
      group.appendChild(item);

      // Render only verified child pipelines beneath their saved package parent.
      if (packageEntry.favoritePipelines.length) {
        const pipelineList = document.createElement("div");
        pipelineList.className = "ellucian-favorite-pipeline-list";
        pipelineList.hidden = !packageEntry.pipelinesExpanded;

        packageEntry.favoritePipelines.forEach((pipelineEntry) => {
          const pipelineItem = document.createElement("div");
          pipelineItem.className = "ellucian-favorite-pipeline-item";

          const pipelineIdentity = getPipelineIdentity(pipelineEntry);
          const packageIdentity = normalizePackageIdentity(packageEntry.name);
          const pipelineDragHandle = document.createElement("button");
          pipelineDragHandle.type = "button";
          pipelineDragHandle.className =
            "ellucian-favorite-pipeline-drag-handle";
          pipelineDragHandle.draggable = true;
          pipelineDragHandle.dataset.packageIdentity = packageIdentity;
          pipelineDragHandle.dataset.pipelineIdentity = pipelineIdentity;
          pipelineDragHandle.appendChild(createFavoriteDragIcon());
          pipelineDragHandle.setAttribute(
            "aria-label",
            `Reorder ${pipelineEntry.name}. Use the up and down arrow keys.`,
          );
          pipelineDragHandle.setAttribute(
            "title",
            "Drag to reorder within this package, or use Up and Down when focused",
          );

          // Keep the reorder control separate from pipeline navigation.
          pipelineDragHandle.addEventListener("click", (event) => {
            event.stopPropagation();
          });

          // Track both identities so children can move only inside their parent.
          pipelineDragHandle.addEventListener("dragstart", (event) => {
            draggedFavoritePipeline = {
              packageIdentity,
              pipelineIdentity,
              pipelineEntry,
            };
            pipelineItem.setAttribute("data-dragging", "true");
            event.dataTransfer.effectAllowed = "move";
            event.dataTransfer.setData("text/plain", pipelineIdentity);
          });

          // Clear transient state if the drag finishes outside a valid child row.
          pipelineDragHandle.addEventListener("dragend", () => {
            draggedFavoritePipeline = null;
            clearFavoriteDragIndicators();
          });

          // Match package reordering with accessible Up and Down key controls.
          pipelineDragHandle.addEventListener("keydown", (event) => {
            if (event.key !== "ArrowUp" && event.key !== "ArrowDown") {
              return;
            }

            const currentIndex = packageEntry.favoritePipelines.findIndex(
              (pipeline) => getPipelineIdentity(pipeline) === pipelineIdentity,
            );
            const targetIndex =
              event.key === "ArrowUp" ? currentIndex - 1 : currentIndex + 1;

            if (
              targetIndex < 0 ||
              targetIndex >= packageEntry.favoritePipelines.length
            ) {
              return;
            }

            event.preventDefault();
            event.stopPropagation();
            moveFavoritePipeline(
              packageEntry.name,
              pipelineEntry,
              packageEntry.favoritePipelines[targetIndex],
              event.key === "ArrowDown",
            );
            focusFavoritePipelineHandle(packageEntry.name, pipelineEntry);
          });

          // Show a before-or-after marker only for children of this package.
          pipelineItem.addEventListener("dragover", (event) => {
            if (
              !draggedFavoritePipeline ||
              draggedFavoritePipeline.packageIdentity !== packageIdentity ||
              draggedFavoritePipeline.pipelineIdentity === pipelineIdentity
            ) {
              return;
            }

            event.preventDefault();
            event.dataTransfer.dropEffect = "move";
            const bounds = pipelineItem.getBoundingClientRect();
            pipelineItem.dataset.dropPosition =
              event.clientY < bounds.top + bounds.height / 2
                ? "before"
                : "after";
          });

          // Remove the insertion marker after the pointer leaves the whole row.
          pipelineItem.addEventListener("dragleave", (event) => {
            if (!pipelineItem.contains(event.relatedTarget)) {
              pipelineItem.removeAttribute("data-drop-position");
            }
          });

          // Persist the reordered children and restore focus to the moved grip.
          pipelineItem.addEventListener("drop", (event) => {
            if (
              !draggedFavoritePipeline ||
              draggedFavoritePipeline.packageIdentity !== packageIdentity
            ) {
              return;
            }

            event.preventDefault();
            event.stopPropagation();
            const movedPipeline = draggedFavoritePipeline.pipelineEntry;
            const insertAfter =
              pipelineItem.dataset.dropPosition === "after";
            draggedFavoritePipeline = null;
            clearFavoriteDragIndicators();
            moveFavoritePipeline(
              packageEntry.name,
              movedPipeline,
              pipelineEntry,
              insertAfter,
            );
            focusFavoritePipelineHandle(packageEntry.name, movedPipeline);
          });

          const pipelineButton = document.createElement("button");
          pipelineButton.type = "button";
          pipelineButton.className = "ellucian-favorite-pipeline-select";
          pipelineButton.setAttribute("title", pipelineEntry.name);
          pipelineButton.addEventListener("click", (event) => {
            // Prevent any surrounding disclosure target from seeing navigation clicks.
            event.stopPropagation();
            activateSearchResult({
              type: "pipeline",
              packageEntry,
              pipelineEntry,
            });
          });

          const pipelineName = document.createElement("span");
          pipelineName.className = "ellucian-favorite-pipeline-name";
          pipelineName.textContent = pipelineEntry.name;
          pipelineButton.appendChild(pipelineName);

          // Keep the version badge fixed while the pipeline name uses remaining space.
          if (pipelineEntry.version) {
            const pipelineVersion = document.createElement("span");
            pipelineVersion.className = "ellucian-favorite-pipeline-version";
            pipelineVersion.textContent = pipelineEntry.version;
            pipelineButton.appendChild(pipelineVersion);
          }

          const pipelineRemoveButton = document.createElement("button");
          pipelineRemoveButton.type = "button";
          pipelineRemoveButton.className = "ellucian-favorite-pipeline-remove";
          pipelineRemoveButton.appendChild(createFavoriteStarIcon());
          pipelineRemoveButton.setAttribute("aria-pressed", "true");
          pipelineRemoveButton.setAttribute(
            "aria-label",
            `Remove ${pipelineEntry.name} from pinned pipelines`,
          );
          pipelineRemoveButton.setAttribute("title", "Unpin pipeline");
          pipelineRemoveButton.addEventListener("click", (event) => {
            // Unpin only this child without toggling the package disclosure state.
            event.stopPropagation();
            togglePipelineFavorite(packageEntry.name, pipelineEntry);
          });

          pipelineItem.append(
            pipelineDragHandle,
            pipelineButton,
            pipelineRemoveButton,
          );
          pipelineList.appendChild(pipelineItem);
        });

        group.appendChild(pipelineList);
      }

      list.appendChild(group);
    });
  }

  // Create one accessible horizontal divider for adjusting the favorites height.
  function createFavoritesResizeHandle(section, list) {
    const resizeHandle = document.createElement("div");
    resizeHandle.className = "ellucian-favorites-resize-handle";
    resizeHandle.setAttribute("role", "separator");
    resizeHandle.setAttribute("aria-label", "Resize pinned packages list");
    resizeHandle.setAttribute("aria-orientation", "horizontal");
    resizeHandle.setAttribute(
      "aria-valuemin",
      String(MIN_FAVORITES_LIST_HEIGHT),
    );
    resizeHandle.setAttribute(
      "aria-valuemax",
      String(getMaximumFavoritesListHeight()),
    );
    resizeHandle.setAttribute(
      "aria-valuenow",
      String(Math.round(list.getBoundingClientRect().height)),
    );
    resizeHandle.setAttribute("tabindex", "0");
    resizeHandle.setAttribute(
      "title",
      "Drag up or down to resize pinned packages",
    );

    // Track only the active drag's starting position and list height.
    let dragStartY = 0;
    let dragStartHeight = 0;
    let isDragging = false;

    // Capture the pointer so resizing continues outside the thin divider.
    resizeHandle.addEventListener("pointerdown", (event) => {
      if (event.button !== 0) {
        return;
      }

      event.preventDefault();
      dragStartY = event.clientY;
      dragStartHeight = list.getBoundingClientRect().height;
      isDragging = true;
      document.documentElement.setAttribute(
        "data-ellucian-favorites-resizing",
        "true",
      );
      resizeHandle.setPointerCapture(event.pointerId);
    });

    // Grow downward or shrink upward as the captured pointer moves.
    resizeHandle.addEventListener("pointermove", (event) => {
      if (!isDragging) {
        return;
      }

      setFavoritesListHeight(
        section,
        dragStartHeight + event.clientY - dragStartY,
      );
    });

    // Complete the interaction and save only the final height.
    const finishDragging = (event) => {
      if (!isDragging) {
        return;
      }

      isDragging = false;
      document.documentElement.removeAttribute(
        "data-ellucian-favorites-resizing",
      );

      if (resizeHandle.hasPointerCapture(event.pointerId)) {
        resizeHandle.releasePointerCapture(event.pointerId);
      }

      saveFavoritesListHeight();
    };
    resizeHandle.addEventListener("pointerup", finishDragging);
    resizeHandle.addEventListener("pointercancel", finishDragging);

    // Provide the same precise adjustment for keyboard users.
    resizeHandle.addEventListener("keydown", (event) => {
      if (event.key !== "ArrowUp" && event.key !== "ArrowDown") {
        return;
      }

      event.preventDefault();
      const currentHeight = list.getBoundingClientRect().height;
      const heightChange =
        event.key === "ArrowDown"
          ? FAVORITES_KEYBOARD_RESIZE_STEP
          : -FAVORITES_KEYBOARD_RESIZE_STEP;
      setFavoritesListHeight(section, currentHeight + heightChange);
      saveFavoritesListHeight();
    });

    return resizeHandle;
  }

  // Create the favorites section immediately below the existing package header.
  function ensureFavoritesSection(panel) {
    const listRegion = Array.from(panel.children).find((child) =>
      child.querySelector(":scope > [role=\"tree\"]"),
    );

    if (!listRegion) {
      return null;
    }

    const existingSection = panel.querySelector(
      ":scope > .ellucian-favorites-section",
    );
    if (existingSection) {
      return existingSection;
    }

    const section = document.createElement("section");
    section.className = "ellucian-favorites-section";

    const toggleButton = document.createElement("button");
    toggleButton.type = "button";
    toggleButton.className = "ellucian-favorites-toggle";
    toggleButton.setAttribute("aria-label", "Toggle pinned packages");

    const title = document.createElement("span");
    title.className = "ellucian-favorites-title";
    title.textContent = "Pinned Packages";

    const count = document.createElement("span");
    count.className = "ellucian-favorites-count";

    const chevron = document.createElement("span");
    chevron.className = "ellucian-favorites-chevron";
    chevron.setAttribute("aria-hidden", "true");

    const list = document.createElement("div");
    list.className = "ellucian-favorites-list";

    // Add a thin divider below the list for remembered vertical resizing.
    const resizeHandle = createFavoritesResizeHandle(section, list);

    // Remember the user's latest expanded or collapsed choice per environment.
    toggleButton.addEventListener("click", () => {
      favoritesExpanded = !favoritesExpanded;
      renderFavoritesSection(panel, section);
      saveFavoritesExpandedState();
    });

    toggleButton.append(title, count, chevron);
    section.append(toggleButton, list, resizeHandle);

    // Insert the section as a full-width panel row above the scrolling tree.
    panel.insertBefore(section, listRegion);
    return section;
  }

  // Synchronize the favorites section and every visible package-row star.
  function updateFavoritesForPanel(panel) {
    if (!favoritesEnabled) {
      removeFavoritesFromPanel(panel);
      return;
    }

    const section = ensureFavoritesSection(panel);
    if (!section) {
      return;
    }

    // Refresh explicit package stars independently from implicit pipeline parents.
    panel
      .querySelectorAll('li[data-level="1"][data-nodeid]')
      .forEach((packageRow) => {
        updatePackageFavoriteButton(packageRow, favoritePackageIdentities);
      });

    // Add stars only to child rows that Ellucian has currently rendered.
    panel
      .querySelectorAll(
        'li[data-level="2"][pipeline-element], li[data-level="2"][pipelineelement]',
      )
      .forEach(updatePipelineFavoriteButton);
    renderFavoritesSection(panel, section);

    // Restore a saved height or expose the current automatic height to the handle.
    if (favoriteListHeight !== null) {
      setFavoritesListHeight(section, favoriteListHeight);
    } else {
      const list = section.querySelector(":scope > .ellucian-favorites-list");
      const resizeHandle = section.querySelector(
        ":scope > .ellucian-favorites-resize-handle",
      );
      if (resizeHandle?.getAttribute("aria-valuenow") === "0") {
        resizeHandle.setAttribute(
          "aria-valuenow",
          String(Math.round(list?.getBoundingClientRect().height ?? 0)),
        );
      }
    }
  }

  // Build one safe text-only result button.
  function createResultButton(result, closeResults) {
    const button = document.createElement("button");
    button.type = "button";
    button.className = "ellucian-search-result";

    // Show the primary result name on the first line.
    const name = document.createElement("span");
    name.className = "ellucian-search-result-name";
    name.textContent =
      result.type === "package"
        ? result.packageEntry.name
        : result.pipelineEntry.name;

    // Show parent context and version without exposing any other page data.
    const detail = document.createElement("span");
    detail.className = "ellucian-search-result-detail";
    detail.textContent =
      result.type === "package"
        ? result.packageEntry.version || "Package"
        : `${result.packageEntry.name} · ${result.pipelineEntry.version || "Pipeline"}`;

    button.append(name, detail);
    button.addEventListener("click", async () => {
      closeResults();
      await activateSearchResult(result);
    });

    return button;
  }

  // Add a labeled result group when at least one match exists.
  function appendResultGroup(resultsElement, label, results, closeResults) {
    if (!results.length) {
      return;
    }

    // Label package and pipeline matches for fast scanning.
    const heading = document.createElement("div");
    heading.className = "ellucian-search-results-heading";
    heading.textContent = label;
    resultsElement.appendChild(heading);

    // Render each result as a native button for straightforward accessibility.
    results.forEach((result) => {
      resultsElement.appendChild(createResultButton(result, closeResults));
    });
  }

  // Rank exact names first, then prefixes, word prefixes, and broad matches.
  function getMatchScore(name, searchableText, query) {
    const normalizedName = name.toLocaleLowerCase();

    if (normalizedName === query) {
      return 0;
    }

    if (normalizedName.startsWith(query)) {
      return 1;
    }

    if (normalizedName.split(/[^a-z0-9]+/u).some((word) => word.startsWith(query))) {
      return 2;
    }

    if (normalizedName.includes(query)) {
      return 3;
    }

    if (searchableText.includes(query)) return 4;
    // Match names even when users omit or replace spaces, hyphens, and camel-case boundaries.
    const fold = (value) => value.toLocaleLowerCase().replace(/[^\p{L}\p{N}]/gu, '');
    const foldedQuery = fold(query);
    return foldedQuery && fold(searchableText).includes(foldedQuery) ? 5 : null;
  }

  // Filter and rank the complete index before applying visible result limits.
  function getSearchResults(query) {
    const normalizedQuery = query.trim().toLocaleLowerCase();

    if (!normalizedQuery) {
      return {
        packages: [],
        pipelines: [],
        packageTotal: 0,
        pipelineTotal: 0,
      };
    }

    const packages = [];
    const pipelines = [];

    searchIndex.forEach((packageEntry) => {
      const packageText = `${packageEntry.name} ${packageEntry.version}`.toLocaleLowerCase();
      const packageScore = getMatchScore(
        packageEntry.name,
        packageText,
        normalizedQuery,
      );

      if (packageScore !== null) {
        packages.push({ type: "package", packageEntry, score: packageScore });
      }

      // Search every indexed pipeline before limiting the visible result count.
      packageEntry.pipelines.forEach((pipelineEntry) => {
        const pipelineText = `${pipelineEntry.name} ${pipelineEntry.originalName} ${pipelineEntry.version}`.toLocaleLowerCase();
        const pipelineScore = getMatchScore(
          pipelineEntry.name,
          pipelineText,
          normalizedQuery,
        );

        if (pipelineScore !== null) {
          pipelines.push({
            type: "pipeline",
            packageEntry,
            pipelineEntry,
            score: pipelineScore,
          });
        }
      });
    });

    // Keep equally ranked results predictable and easy to scan.
    const sortMatches = (left, right) =>
      left.score - right.score ||
      (left.type === "package" ? left.packageEntry.name : left.pipelineEntry.name)
        .localeCompare(
          right.type === "package"
            ? right.packageEntry.name
            : right.pipelineEntry.name,
        );
    packages.sort(sortMatches);
    pipelines.sort(sortMatches);

    return {
      packageTotal: packages.length,
      pipelineTotal: pipelines.length,
      packages: packages.slice(0, MAX_PACKAGE_RESULTS),
      pipelines: pipelines.slice(0, MAX_PIPELINE_RESULTS),
    };
  }

  // Remove controls and all layout markers to restore Ellucian's original header.
  function removeSearchControls(panel) {
    const headingRegion = panel.children[0];
    const control = panel.querySelector(".ellucian-package-search");
    const resultsElement = panel.querySelector(".ellucian-search-results");
    const headerHost = panel.querySelector('[data-ellucian-search-host="true"]');

    if (activeSearchControl === control) {
      activeSearchControl = null;
    }

    control?.remove();
    resultsElement?.remove();
    headerHost?.removeAttribute("data-ellucian-search-host");
    headingRegion?.removeAttribute("data-ellucian-search-surface");
  }

  // Create the search controls once for one Ellucian package panel.
  function createSearchControls(panel) {
    const headingRegion = panel.children[0];
    const headerHost =
      panel.querySelector("#pipeline-manager-title-container") ??
      panel.querySelector("#home_title-packages");

    if (!headingRegion || !headerHost) {
      return null;
    }

    // Mark existing Ellucian elements only while search is displayed.
    headingRegion.setAttribute("data-ellucian-search-surface", "true");
    headerHost.setAttribute("data-ellucian-search-host", "true");

    // Reuse controls already created for this React panel instance.
    const existingControl = headerHost.querySelector(
      ":scope > .ellucian-package-search",
    );
    if (existingControl) {
      return existingControl;
    }

    // Create a compact control containing both box and icon display modes.
    const control = document.createElement("div");
    control.className = "ellucian-package-search";

    const iconButton = document.createElement("button");
    iconButton.type = "button";
    iconButton.className = "ellucian-search-icon-button";
    iconButton.setAttribute("aria-label", "Open package and pipeline search");
    iconButton.setAttribute("title", "Search packages and pipelines");

    // Draw a single scalable vector icon so the lens and handle stay aligned.
    const searchIcon = document.createElementNS(
      "http://www.w3.org/2000/svg",
      "svg",
    );
    searchIcon.classList.add("ellucian-search-icon");
    searchIcon.setAttribute("viewBox", "0 0 24 24");
    searchIcon.setAttribute("aria-hidden", "true");

    // Build the lens as an unfilled circle with a rounded stroke.
    const searchLens = document.createElementNS(
      "http://www.w3.org/2000/svg",
      "circle",
    );
    searchLens.setAttribute("cx", "10.5");
    searchLens.setAttribute("cy", "10.5");
    searchLens.setAttribute("r", "5.5");

    // Connect the handle directly to the lower-right edge of the lens.
    const searchHandle = document.createElementNS(
      "http://www.w3.org/2000/svg",
      "path",
    );
    searchHandle.setAttribute("d", "M14.5 14.5L20 20");
    searchIcon.append(searchLens, searchHandle);
    iconButton.appendChild(searchIcon);

    const input = document.createElement("input");
    input.type = "search";
    input.className = "ellucian-search-input";
    input.placeholder = "Search packages and pipelines";
    input.setAttribute("aria-label", "Search packages and pipelines");
    input.setAttribute("autocomplete", "off");

    // Place one full-column result panel directly beneath the heading.
    const resultsElement = document.createElement("div");
    resultsElement.className = "ellucian-search-results";
    resultsElement.id = `ellucian-search-results-${crypto.randomUUID()}`;
    resultsElement.setAttribute("role", "region");
    resultsElement.setAttribute("aria-label", "Search results");
    resultsElement.setAttribute("aria-live", "polite");
    resultsElement.hidden = true;

    // Connect the field and overlay for assistive technology.
    input.setAttribute("aria-controls", resultsElement.id);
    input.setAttribute("aria-expanded", "false");

    // Close the overlay and optionally collapse the compact icon field.
    const closeResults = (collapseIcon = false) => {
      resultsElement.hidden = true;
      resultsElement.replaceChildren();
      input.setAttribute("aria-expanded", "false");

      if (collapseIcon && control.dataset.searchMode === "icon") {
        control.removeAttribute("data-icon-expanded");
      }

      if (activeSearchControl === control) {
        activeSearchControl = null;
      }
    };

    // Render the current query, fallback state, and any truncation details.
    const renderResults = () => {
      const results = getSearchResults(input.value);
      resultsElement.replaceChildren();

      // Explain reduced functionality if Ellucian's internal index is unavailable.
      if (indexState === "fallback") {
        const fallbackNotice = document.createElement("div");
        fallbackNotice.className = "ellucian-search-notice";
        fallbackNotice.textContent =
          "Package search is available. Pipeline results may be limited until Ellucian's index is available.";
        resultsElement.appendChild(fallbackNotice);
      }

      appendResultGroup(
        resultsElement,
        "Packages",
        results.packages,
        closeResults,
      );
      appendResultGroup(
        resultsElement,
        "Pipelines",
        results.pipelines,
        closeResults,
      );

      // Explain an empty result rather than showing a blank popup.
      if (
        input.value.trim() &&
        !results.packageTotal &&
        !results.pipelineTotal
      ) {
        const emptyMessage = document.createElement("div");
        emptyMessage.className = "ellucian-search-empty";
        emptyMessage.textContent = "No matching packages or pipelines";
        resultsElement.appendChild(emptyMessage);
      }

      // State when matching items exist beyond the compact visible limits.
      const hiddenMatchCount =
        Math.max(0, results.packageTotal - results.packages.length) +
        Math.max(0, results.pipelineTotal - results.pipelines.length);
      if (hiddenMatchCount) {
        const limitMessage = document.createElement("div");
        limitMessage.className = "ellucian-search-limit";
        limitMessage.textContent = `${hiddenMatchCount} more matches — refine your search to narrow the list.`;
        resultsElement.appendChild(limitMessage);
      }

      const shouldShowResults = Boolean(input.value.trim());
      resultsElement.hidden = !shouldShowResults;
      input.setAttribute("aria-expanded", String(shouldShowResults));

      // Track only a visible result panel for the global outside-click handler.
      if (shouldShowResults) {
        if (
          activeSearchControl &&
          activeSearchControl !== control
        ) {
          activeSearchControl.closeSearchResults?.(true);
        }
        activeSearchControl = control;
      } else if (activeSearchControl === control) {
        activeSearchControl = null;
      }
    };

    // Update results immediately as the user types.
    input.addEventListener("input", renderResults);
    input.addEventListener("focus", () => {
      // Refresh from Ellucian's current in-memory package data before searching.
      requestSearchIndex();

      if (input.value.trim()) {
        renderResults();
      }
    });

    // Support common keyboard interactions without replacing native typing behavior.
    input.addEventListener("keydown", (event) => {
      const resultButtons = resultsElement.querySelectorAll(
        ".ellucian-search-result",
      );

      if (event.key === "Escape") {
        closeResults(true);
        return;
      }

      if (event.key === "Enter" && resultButtons[0]) {
        event.preventDefault();
        resultButtons[0].click();
      }

      if (event.key === "ArrowDown" && resultButtons[0]) {
        event.preventDefault();
        resultButtons[0].focus();
      }

      if (event.key === "ArrowUp" && resultButtons.length) {
        event.preventDefault();
        resultButtons[resultButtons.length - 1].focus();
      }
    });

    // Move predictably among result buttons with standard list-navigation keys.
    resultsElement.addEventListener("keydown", (event) => {
      const resultButtons = Array.from(
        resultsElement.querySelectorAll(".ellucian-search-result"),
      );
      const currentIndex = resultButtons.indexOf(document.activeElement);

      if (event.key === "Escape") {
        event.preventDefault();
        closeResults();
        input.focus();
        return;
      }

      if (!["ArrowDown", "ArrowUp", "Home", "End"].includes(event.key)) {
        return;
      }

      event.preventDefault();
      let nextIndex = currentIndex;

      if (event.key === "ArrowDown") {
        nextIndex = Math.min(resultButtons.length - 1, currentIndex + 1);
      } else if (event.key === "ArrowUp") {
        nextIndex = Math.max(0, currentIndex - 1);
      } else if (event.key === "Home") {
        nextIndex = 0;
      } else if (event.key === "End") {
        nextIndex = resultButtons.length - 1;
      }

      resultButtons[nextIndex]?.focus();
    });

    // Expand the field only when compact icon mode is selected.
    iconButton.addEventListener("click", () => {
      if (activeSearchControl && activeSearchControl !== control) {
        activeSearchControl.closeSearchResults?.(true);
      }
      activeSearchControl = control;
      control.setAttribute("data-icon-expanded", "true");
      input.focus();
    });

    control.append(iconButton, input);

    // Keep Designer's existing add button at the far right of the heading.
    const addPackageButton = headerHost.querySelector(
      "#add-new-package-icon-button",
    );
    headerHost.insertBefore(control, addPackageButton);
    headingRegion.appendChild(resultsElement);

    // Keep control-specific helpers local to the created DOM element.
    control.updateSearchResults = renderResults;
    control.closeSearchResults = closeResults;
    control.searchResultsElement = resultsElement;
    return control;
  }

  // Match the native pipeline table without confusing it with the sharing table.
  function getDesignerPipelineTable() {
    return Array.from(document.querySelectorAll('table')).find((candidate) => {
      const headings = Array.from(candidate.querySelectorAll('thead th')).map((cell) => cell.textContent.trim());
      return headings.includes('Status') && headings.includes('Version') && headings.includes('Draft');
    });
  }

  // Read the single-pipeline share page using its visible Pipeline Details region.
  function getSharePagePipelineName() {
    const region = Array.from(document.querySelectorAll('[role="region"], section')).find((node) =>
      node.getAttribute('aria-label') === 'Pipeline Details' || node.querySelector('h4')?.textContent.trim() === 'Pipeline Details');
    const heading = region && Array.from(region.querySelectorAll('h5')).find((node) => node.textContent.trim() === 'Pipeline');
    return heading?.nextElementSibling?.textContent.trim().replace(/\s+v?\d+\.\d+\.\d+(?:[-+][\w.-]+)?$/u, '') || '';
  }

  // Update visible selections while retaining checked rows from other table pages.
  function readSelectedSharingNames() {
    const table = getDesignerPipelineTable();
    if (!table) return [];
    const packageName = Array.from(document.querySelectorAll('h2')).find((heading) => heading.textContent.trim().startsWith('Package:'))?.textContent || '';
    if (packageName !== sharedSelectionPackage) {
      selectedShareRows.clear();
      sharedSelectionPackage = packageName;
    }
    table.querySelectorAll('tbody tr').forEach((row) => {
      const cell = row.querySelector('[data-shared-name]');
      if (!cell?.dataset.sharedName) return;
      if (row.querySelector('input[type="checkbox"]:checked')) selectedShareRows.set(cell.dataset.sharedKey, cell.dataset.sharedName);
      else selectedShareRows.delete(cell.dataset.sharedKey);
    });
    return [...new Set(selectedShareRows.values())];
  }

  // Read checkbox state after Ellucian has processed the native change event.
  document.addEventListener('change', (event) => {
    if (sharedVersionEnabled && isDesignerPackagePage() && event.target.matches?.('input[type="checkbox"]') && event.target.closest('table') === getDesignerPipelineTable()) {
      queueMicrotask(readSelectedSharingNames);
    }
  });

  // Capture either the checkbox selection or the row-menu pipeline before navigation.
  document.addEventListener('click', (event) => {
    if (!sharedVersionEnabled || !isDesignerPackagePage()) return;
    const control = event.target.closest?.('button, [role="menuitem"]');
    if (!control || control.closest('[data-ellucian-shared-cell]')) return;
    const label = (control.getAttribute('aria-label') || control.textContent).trim();
    if (label === 'More') {
      shareMenuNames = [control.closest('tr')?.querySelector('[data-shared-name]')?.dataset.sharedName].filter(Boolean);
      return;
    }
    if (!/^Share(?: selected)?(?: pipelines?)?$/iu.test(label)) return;
    // The separate share page identifies its pipeline even if no row menu was seen.
    const detailName = getSharePagePipelineName();
    const selected = readSelectedSharingNames();
    const names = detailName ? [detailName] : control.getAttribute('role') === 'menuitem' ? shareMenuNames : selected.length ? selected : pendingShareAttempt?.names || [];
    if (!names.length) return;
    // Preserve the opened state when the confirmation page has its own Share button.
    pendingShareAttempt = { names, opened: Boolean(detailName || pendingShareAttempt?.opened) };
  }, true);

  // Refresh on return after success or cancellation, without depending on toast text.
  function checkShareCompletion() {
    if (!pendingShareAttempt) return;
    if (!isDesignerPackagePage() || !sharedVersionEnabled) {
      // Invalidate on departure too, but the disabled/off-route column issues no calls.
      const names = pendingShareAttempt.names;
      pendingShareAttempt = null;
      refreshSharedPipelines(names);
      return;
    }
    // Wait while either a sharing page or its modal is still visible.
    const dialogOpen = Array.from(document.querySelectorAll('[role="dialog"], [role="alertdialog"]')).some((node) => node.getClientRects().length > 0);
    if (!getDesignerPipelineTable() || getSharePagePipelineName() || dialogOpen) {
      pendingShareAttempt.opened = true;
      return;
    }
    if (!pendingShareAttempt.opened) return;
    // Consume the context before rendering so observer callbacks cannot repeat it.
    const names = pendingShareAttempt.names;
    pendingShareAttempt = null;
    shareMenuNames = [];
    selectedShareRows.clear();
    refreshSharedPipelines(names);
  }

  // Invalidate both caches before requesting fresh data for the displayed rows.
  function refreshSharedPipelines(names) {
    const affected = new Set(names.filter(Boolean));
    if (!affected.size) return;
    for (const key of sharedStatusCache.keys()) {
      if (affected.has(JSON.parse(key)[1])) sharedStatusCache.delete(key);
    }
    // Message order ensures the page helper forgets old lookups before new requests.
    window.postMessage({ source: MESSAGE_SOURCE, type: 'shared-status-invalidate', names: [...affected] }, window.location.origin);
    updateSharedVersionColumn();
  }

  // Index the compact local snapshots once per storage change, not once per table row.
  function loadOwnershipCache(cache) {
    ownershipByName = new Map();
    if (!sharedFromEnabled) return;
    Object.values(cache || {}).forEach((snapshot) => {
      const environment = normalizeText(snapshot?.environment);
      const checkedAt = Number(snapshot?.checkedAt);
      if (!environment || !Number.isFinite(checkedAt) || !Array.isArray(snapshot?.pipelines)) return;
      snapshot.pipelines.slice(0, 10000).forEach((name) => {
        const cleanName = normalizeText(name);
        if (!cleanName) return;
        const owners = ownershipByName.get(cleanName) || [];
        owners.push({ environment, checkedAt });
        ownershipByName.set(cleanName, owners);
      });
    });
  }

  // Complete a manual refresh only after persistence, cancellation, or a bounded failure.
  function finishOwnershipRefresh(result) {
    const respond = ownershipManualResponse;
    ownershipManualResponse = null;
    // Closing settings must not cancel collection or create a console error.
    if (respond) {
      try { respond(result); } catch (_error) { /* The popup may already be closed. */ }
    }
  }

  // Discard the previous visit's requests without clearing saved sources or favorites.
  function resetDesignerOwnership(reason) {
    window.clearTimeout(ownershipTimer);
    window.clearTimeout(ownershipIndexTimer);
    ownershipTimer = 0;
    ownershipIndexTimer = 0;
    ownershipRequest = "";
    ownershipSignature = "";
    ownershipAttempts = 0;
    ownershipIndexReady = false;
    ownershipIndexAttempts = 0;
    finishOwnershipRefresh({ ok: false, reason });
  }

  // Stop this old script's source checks without changing saved cache, favorites, or consent.
  function stopDisconnectedOwnership() {
    if (ownershipExtensionDisconnected) return;
    ownershipExtensionDisconnected = true;
    resetDesignerOwnership('extension-reloaded');
    // Give one recovery hint rather than throwing or repeatedly retrying a missing connection.
    console.info('Integration Navigator connection unavailable. Refresh this page after reloading the extension.');
  }

  // Wait for React's complete package data using bounded local messages, not server polling.
  function requestDesignerOwnershipIndex() {
    if (ownershipExtensionDisconnected || !sharedFromEnabled || !isDesignerPackagePage() || ownershipIndexReady || ownershipIndexTimer) return;
    if (ownershipIndexAttempts >= OWNERSHIP_INDEX_ATTEMPTS) {
      finishOwnershipRefresh({ ok: false, reason: 'not-ready' });
      return;
    }
    ownershipIndexAttempts += 1;
    requestSearchIndex();
    // A successful complete-index response cancels this timer before any further checks.
    ownershipIndexTimer = window.setTimeout(() => {
      ownershipIndexTimer = 0;
      requestDesignerOwnershipIndex();
    }, OWNERSHIP_INDEX_RETRY_MS);
  }

  // Recognize SPA entry and exit even when the browser emits no pageshow or popstate.
  function updateDesignerOwnershipVisit(force = false) {
    const pageKey = sharedFromEnabled && isDesignerPackagePage() ? getFavoritesStorageKey() : '';
    if (!force && pageKey === ownershipPageKey) return;
    resetDesignerOwnership(sharedFromEnabled ? 'left-designer' : 'disabled');
    ownershipPageKey = pageKey;
    if (pageKey) requestDesignerOwnershipIndex();
  }

  // Ask for one source snapshot only after this visit's loaded Designer index is ready.
  function requestDesignerOwnership() {
    if (ownershipExtensionDisconnected || !sharedFromEnabled || !isDesignerPackagePage() || !ownershipIndexReady || indexState !== "ready" || ownershipRequest) return;
    const signature = JSON.stringify([getFavoritesStorageKey(), searchIndex.map((entry) => [entry.name, entry.pipelines.map((pipeline) => pipeline.name)])]);
    // A changed inventory gets its own bounded attempt budget.
    if (signature !== ownershipSignature) {
      ownershipSignature = signature;
      ownershipAttempts = 0;
    }
    if (ownershipAttempts >= 2) return;
    ownershipAttempts += 1;
    ownershipRequest = crypto.randomUUID();
    // Retry a missed or not-yet-ready lookup once, then wait for a genuine revisit.
    ownershipTimer = window.setTimeout(() => {
      ownershipRequest = "";
      // Leaving Designer or disabling the option must not restart collection.
      if (!sharedFromEnabled || !isDesignerPackagePage()) return;
      if (ownershipAttempts < 2) requestDesignerOwnership();
      else {
        console.warn('Designer source cache lookup did not finish. Revisit Designer to retry.');
        finishOwnershipRefresh({ ok: false, reason: 'lookup-failed' });
      }
    }, 15000);
    // Repeat the opt-in handshake in case the page helper loaded after settings did.
    window.postMessage({ source: MESSAGE_SOURCE, type: "designer-ownership-setting", enabled: true }, window.location.origin);
    window.postMessage({ source: MESSAGE_SOURCE, type: "designer-ownership-request", requestId: ownershipRequest }, window.location.origin);
  }

  // Accept manual refresh only from this extension's settings on the current Designer page.
  chrome.runtime.onMessage.addListener((message, sender, respond) => {
    if (message?.type !== 'designer-ownership-refresh' || sender.id !== chrome.runtime?.id || sender.tab) return;
    // Do not leave a settings request waiting after this page has lost its connection.
    if (ownershipExtensionDisconnected) {
      respond({ ok: false, reason: 'extension-reloaded' });
      return;
    }
    if (!sharedFromEnabled || !isDesignerPackagePage()) {
      respond({ ok: false, reason: sharedFromEnabled ? 'open-designer' : 'disabled' });
      return;
    }
    // Prevent repeated settings clicks from launching overlapping manual lookups.
    if (ownershipManualResponse) {
      respond({ ok: false, reason: 'busy' });
      return;
    }
    resetDesignerOwnership('restarted');
    ownershipPageKey = getFavoritesStorageKey();
    ownershipManualResponse = respond;
    requestDesignerOwnershipIndex();
    return true;
  });

  // Confine source-cache guidance to the keyboard-accessible column heading.
  function createOwnershipHeading() {
    const label = 'Shared From';
    const explanation = 'Cached Designer sources. Visit Designer in each environment to update.';
    const value = document.createElement('span');
    value.className = 'ellucian-shared-value';
    value.tabIndex = 0;
    value.textContent = label;
    value.setAttribute('aria-label', `${label}. ${explanation}`);
    const tip = document.createElement('span');
    tip.className = 'ellucian-shared-tooltip';
    tip.textContent = explanation;
    tip.setAttribute('role', 'tooltip');
    tip.setAttribute('popover', 'manual');
    // Position from the actual tooltip height so longer setup guidance stays in view.
    const showTip = () => {
      if (!tip.isConnected || typeof tip.showPopover !== 'function') return;
      tip.showPopover();
      const bounds = value.getBoundingClientRect();
      tip.style.left = `${Math.max(8, Math.min(bounds.left, window.innerWidth - 280))}px`;
      tip.style.top = `${Math.max(8, bounds.top - tip.getBoundingClientRect().height - 8)}px`;
    };
    const hideTip = () => { if (tip.matches(':popover-open')) tip.hidePopover(); };
    value.addEventListener('mouseenter', showTip);
    value.addEventListener('focus', showTip);
    value.addEventListener('mouseleave', hideTip);
    value.addEventListener('blur', hideTip);
    value.addEventListener('keydown', (event) => { if (event.key === 'Escape') hideTip(); });
    value.appendChild(tip);
    return value;
  }

  // Add observed source information only to the native Integration Packages table.
  function updateSharedFromColumn() {
    // Tell the page helper to stop source lookups when the feature or route is inactive.
    window.postMessage({ source: MESSAGE_SOURCE, type: 'designer-ownership-setting', enabled: sharedFromEnabled && isDesignerPackagePage() }, window.location.origin);
    if (!sharedFromEnabled || !/\/data-connect\/home\/?$/iu.test(window.location.pathname)) {
      document.querySelectorAll('[data-ellucian-source-cell]').forEach((cell) => cell.remove());
      return;
    }
    const table = document.getElementById('packageTable-table')?.querySelector('table');
    const headerRow = table?.querySelector('thead tr') || table?.querySelector('tr');
    if (!headerRow) return;
    // Locate the native Version cell, excluding our previously inserted header.
    const nativeHeaders = Array.from(headerRow.children).filter((cell) => !cell.hasAttribute('data-ellucian-source-cell'));
    const versionIndex = nativeHeaders.findIndex((cell) => cell.textContent.trim() === 'Version');
    if (versionIndex < 0) return;
    const versionHeader = nativeHeaders[versionIndex];
    // Match native typography and keep one source header immediately after Version.
    if (!headerRow.querySelector('[data-ellucian-source-cell]')) {
      const header = document.createElement(versionHeader.tagName.toLowerCase());
      header.className = versionHeader.className;
      header.dataset.ellucianSourceCell = 'true';
      header.scope = 'col';
      header.style.fontWeight = '700';
      header.appendChild(createOwnershipHeading());
      versionHeader.after(header);
    }
    // Enhance only actual pipeline links, leaving placeholders and other native rows alone.
    table.querySelectorAll('a[id^="packageTable-pipeline-button"]').forEach((link) => {
      const row = link.closest('tr');
      const nativeCells = Array.from(row.children).filter((cell) => !cell.hasAttribute('data-ellucian-source-cell'));
      const versionCell = nativeCells[versionIndex];
      if (!versionCell) return;
      // Reuse the inserted cell across table refreshes rather than recreating unchanged rows.
      let cell = row.querySelector('[data-ellucian-source-cell]');
      if (!cell) {
        cell = document.createElement('td');
        cell.className = versionCell.className;
        cell.dataset.ellucianSourceCell = 'true';
        versionCell.after(cell);
      }
      // Do not guess a source when no snapshot exists or multiple environments claim a name.
      const owners = ownershipByName.get(link.textContent.trim()) || [];
      const owner = owners.length === 1 ? owners[0] : null;
      const label = owner ? owner.environment : '—';
      // Plain source values have no hover target, icon, or redundant tab stop.
      const summary = label;
      if (cell.dataset.summary === summary) return;
      cell.dataset.summary = summary;
      // Match the actual Version value, including native nested text styling.
      const value = document.createElement('span');
      value.className = 'ellucian-source-value';
      value.textContent = label;
      const nativeStyle = window.getComputedStyle(versionCell.querySelector('p, span') || versionCell);
      ['fontFamily', 'fontSize', 'fontWeight', 'color', 'lineHeight', 'letterSpacing'].forEach((property) => {
        value.style[property] = nativeStyle[property];
      });
      cell.replaceChildren(value);
    });
  }

  // Add sharing information only to the rendered Designer pipeline table.
  function updateSharedVersionColumn() {
    // Tell the page helper to stop queued requests when the option is disabled.
    window.postMessage({ source: MESSAGE_SOURCE, type: 'shared-status-setting', enabled: sharedVersionEnabled && isDesignerPackagePage() }, window.location.origin);
    if (!sharedVersionEnabled || !isDesignerPackagePage()) {
      document.querySelectorAll('[data-ellucian-shared-cell]').forEach((cell) => cell.remove());
      return;
    }

    // Match the table by its native headings so unrelated tables stay untouched.
    const table = getDesignerPipelineTable();
    if (!table) return;
    const headers = Array.from(table.querySelectorAll('thead th')).filter((cell) => !cell.hasAttribute('data-ellucian-shared-cell'));
    const statusIndex = headers.findIndex((cell) => cell.textContent.trim() === 'Status');
    const versionIndex = headers.findIndex((cell) => cell.textContent.trim() === 'Version');
    const statusHeader = headers[statusIndex];
    if (!table.querySelector('th[data-ellucian-shared-cell]')) {
      const header = document.createElement('th');
      header.className = statusHeader.className;
      header.dataset.ellucianSharedCell = 'true';
      header.scope = 'col';
      // Copy the native header label styling as well as the table cell styling.
      const nativeLabel = statusHeader.querySelector('span');
      const label = document.createElement('span');
      if (nativeLabel) label.className = nativeLabel.className;
      // Preserve native color and size; the label wrapper can report a normal weight.
      const nativeStyle = window.getComputedStyle(nativeLabel || statusHeader);
      label.style.color = nativeStyle.color;
      // Explicitly match the bold table headings instead of the wrapper's weight.
      label.style.fontWeight = '700';
      label.style.fontSize = nativeStyle.fontSize;
      label.textContent = 'Shared Environments';
      header.appendChild(label);
      // Provide an accessible manual retry without refreshing the whole page.
      const refresh = document.createElement('button');
      refresh.type = 'button';
      refresh.className = 'ellucian-shared-refresh';
      refresh.setAttribute('aria-label', 'Refresh shared environments');
      refresh.title = 'Refresh sharing information for displayed pipelines';
      // Restore the original two-arrow design with scalable, rounded vector strokes.
      refresh.innerHTML = '<svg viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path d="M20 7v5h-5M4 17v-5h5M6.1 6.1A8 8 0 0 1 20 12M4 12a8 8 0 0 0 13.9 5.9"/></svg>';
      refresh.addEventListener('click', () => {
        // Only currently displayed published pipelines trigger fresh lookups.
        if (sharedVersionEnabled && !refresh.disabled) {
          // Request feedback even when there are no published versions to look up.
          header.dataset.manualRefresh = 'true';
          refreshSharedPipelines(Array.from(table.querySelectorAll('td[data-shared-name]'), (cell) => cell.dataset.sharedName));
          updateSharedVersionColumn();
        }
      });
      header.appendChild(refresh);
      // Announce manual results without adding hover text to unrelated table values.
      const feedback = document.createElement('span');
      feedback.className = 'ellucian-shared-refresh-status';
      feedback.setAttribute('role', 'status');
      feedback.hidden = true;
      header.appendChild(feedback);
      statusHeader.after(header);
    }

    // Cache exact versions for this tab; unknown results never mean unshared.
    const entries = [];
    table.querySelectorAll('tbody tr').forEach((row) => {
      const cells = Array.from(row.children).filter((cell) => !cell.hasAttribute('data-ellucian-shared-cell'));
      if (cells.length !== headers.length) return;
      const name = row.querySelector('a')?.textContent.trim();
      const version = cells[versionIndex]?.textContent.trim();
      const published = cells[statusIndex]?.textContent.trim().toLowerCase() === 'published';
      let cell = row.querySelector('[data-ellucian-shared-cell]');
      if (!cell) {
        cell = document.createElement('td');
        cell.className = cells[statusIndex].className;
        cell.dataset.ellucianSharedCell = 'true';
        cells[statusIndex].after(cell);
      }
      const key = JSON.stringify([window.location.host, name, version]);
      // Retain row identity for refresh controls without parsing rendered tooltips.
      cell.dataset.sharedName = published && name ? name : '';
      cell.dataset.sharedKey = key;
      if (published && name && version && !sharedStatusCache.has(key)) {
        sharedStatusCache.set(key, { pending: true });
        entries.push({ key, name, version });
      }
      const result = sharedStatusCache.get(key);
      const destinations = result?.destinations || [];
      const entriesToShow = published && result?.shared && !result.error ? destinations.map((destination) => ({
        label: destination.environment || destination.tenantName || destination.tenantId,
        tooltip: `Shared version: ${destination.version}${destination.outdated ? ` — differs from published ${version}` : ''}`,
        outdated: destination.outdated,
      })) : [{
        label: !published ? '—' : result?.pending ? '…' : result?.error ? 'Unavailable' : '—',
        tooltip: !published ? 'Draft pipelines cannot be shared.' : result?.pending ? 'Checking sharing history…' : result?.error ? 'Sharing history could not be checked. Use the header refresh button to retry.' : 'No shared releases in this major version.',
      }];
      const summary = JSON.stringify(entriesToShow);
      // Avoid rewriting unchanged cells and retriggering the page observer.
      if (cell.dataset.summary !== summary) {
        cell.dataset.summary = summary;
        cell.replaceChildren();
        // Give each destination its own version tooltip and mismatch indicator.
        entriesToShow.forEach(({ label, tooltip, outdated }, index) => {
        if (index) cell.appendChild(document.createTextNode(', '));
        const value = document.createElement('span');
        value.className = 'ellucian-shared-value';
        value.classList.toggle('ellucian-shared-outdated', outdated === true);
        value.tabIndex = 0;
        value.textContent = label;
        value.setAttribute('aria-label', `${label}. ${tooltip}`);
        const tip = document.createElement('span');
        tip.className = 'ellucian-shared-tooltip';
        tip.textContent = tooltip;
        tip.setAttribute('role', 'tooltip');
        // Use the browser's top layer so preceding rows cannot cover the tooltip.
        tip.setAttribute('popover', 'manual');
        const showTip = () => {
          if (!tip.isConnected || typeof tip.showPopover !== 'function') return;
          const bounds = value.getBoundingClientRect();
          tip.style.left = `${Math.max(8, Math.min(bounds.left, window.innerWidth - 280))}px`;
          tip.style.top = `${Math.max(8, bounds.top - 60)}px`;
          tip.showPopover();
        };
        const hideTip = () => {
          if (tip.matches(':popover-open')) tip.hidePopover();
        };
        value.addEventListener('mouseenter', showTip);
        value.addEventListener('focus', showTip);
        value.addEventListener('mouseleave', hideTip);
        value.addEventListener('blur', hideTip);
        value.addEventListener('keydown', (event) => {
          if (event.key === 'Escape') hideTip();
        });
        value.appendChild(tip);
        cell.appendChild(value);
        });
      }
    });

    // Send bounded batches and mark failed requests without automatic retries.
    for (let offset = 0; offset < entries.length; offset += 25) {
      const batch = entries.slice(offset, offset + 25);
      const requestId = `shared-${++sharedStatusRequestCounter}`;
      // Tag pending results so an older response cannot overwrite a fresh check.
      batch.forEach(({ key }) => sharedStatusCache.set(key, { pending: true, requestId }));
      const timer = window.setTimeout(() => {
        if (!pendingSharedStatusRequests.has(requestId)) return;
        pendingSharedStatusRequests.delete(requestId);
        batch.forEach(({ key }) => {
          if (sharedStatusCache.get(key)?.requestId === requestId) sharedStatusCache.set(key, { error: true });
        });
        updateSharedVersionColumn();
      }, 30000);
      pendingSharedStatusRequests.set(requestId, { timer, batch });
      window.postMessage({ source: MESSAGE_SOURCE, type: SHARED_STATUS_REQUEST, requestId, entries: batch }, window.location.origin);
    }
    // Disable repeated refresh clicks only while displayed rows are being checked.
    const refresh = table.querySelector('.ellucian-shared-refresh');
    const cells = Array.from(table.querySelectorAll('td[data-shared-name]')).filter((cell) => cell.dataset.sharedName);
    const busy = cells.some((cell) => sharedStatusCache.get(cell.dataset.sharedKey)?.pending);
    refresh.disabled = busy;
    refresh.setAttribute('aria-busy', String(busy));
    refresh.setAttribute('aria-label', busy ? 'Refreshing shared environments' : 'Refresh shared environments');
    refresh.title = busy ? 'Refreshing sharing information…' : 'Refresh sharing information for displayed pipelines';
    // Reset manual feedback when React reuses the table for another package.
    const header = refresh.closest('th');
    const packageScope = Array.from(document.querySelectorAll('h2')).find((item) => item.textContent.trim().startsWith('Package:'))?.textContent.trim() || window.location.pathname;
    if (header.dataset.packageScope !== packageScope) {
      header.dataset.packageScope = packageScope;
      delete header.dataset.manualRefresh;
    }
    const feedback = header.querySelector('.ellucian-shared-refresh-status');
    feedback.hidden = header.dataset.manualRefresh !== 'true';
    // Errors remain distinct from a successful lookup that found no shares.
    if (!feedback.hidden) {
      const results = cells.map((cell) => sharedStatusCache.get(cell.dataset.sharedKey));
      const message = busy ? 'Checking sharing information…'
        : results.some((result) => result?.error) ? 'Sharing info unavailable. Try again.'
        : results.some((result) => result?.shared) ? 'Sharing info refreshed.'
        : 'No shared pipelines in this package view.';
      // Avoid repeating the same live-region announcement during unrelated mutations.
      if (feedback.textContent !== message) feedback.textContent = message;
    }
  }

  // Place a package-scoped search beside the Designer Pipelines heading.
  function updateDesignerSearch() {
    const heading = isDesignerPackagePage() && Array.from(document.querySelectorAll('h2')).find((item) => item.textContent.trim() === 'Pipelines:');
    const packageName = Array.from(document.querySelectorAll('h2')).find((item) => item.textContent.trim().startsWith('Package:'))?.textContent.trim() || '';
    document.querySelectorAll('.ellucian-designer-search').forEach((control) => {
      // Restore native heading styling and cancel pending work when the control leaves.
      if (!heading || control.dataset.package !== packageName || designerSearchMode === 'hidden') {
        control.disposeDesignerSearch();
      }
    });
    if (!heading || designerSearchMode === 'hidden') return;
    // Change presentation in place so unrelated page updates do not clear the query.
    const existing = document.querySelector('.ellucian-designer-search');
    if (existing) {
      if (existing.dataset.searchMode !== designerSearchMode) existing.closeDesignerSearch(true);
      existing.dataset.searchMode = designerSearchMode;
      if (designerSearchMode !== 'icon') existing.removeAttribute('data-icon-expanded');
      return;
    }
    const control = document.createElement('span');
    control.className = 'ellucian-designer-search';
    control.dataset.package = packageName;
    control.dataset.searchMode = designerSearchMode;
    // Reuse the sidebar's crisp vector style without loading image assets.
    const iconButton = document.createElement('button');
    iconButton.type = 'button';
    iconButton.className = 'ellucian-search-icon-button';
    iconButton.setAttribute('aria-label', 'Open pipeline search in this package');
    iconButton.title = 'Search pipelines in this package';
    iconButton.setAttribute('aria-expanded', 'false');
    iconButton.innerHTML = '<svg class="ellucian-search-icon" viewBox="0 0 24 24" aria-hidden="true"><circle cx="10.5" cy="10.5" r="5.5"/><path d="M14.5 14.5L20 20"/></svg>';
    const input = document.createElement('input');
    input.type = 'search';
    input.placeholder = 'Search pipelines';
    input.setAttribute('aria-label', 'Search pipelines in this package');
    input.autocomplete = 'off';
    const results = document.createElement('span');
    results.className = 'ellucian-designer-results';
    results.hidden = true;
    results.id = `ellucian-designer-results-${crypto.randomUUID()}`;
    results.setAttribute('role', 'region');
    results.setAttribute('aria-label', 'Pipeline search results');
    results.setAttribute('aria-live', 'polite');
    input.setAttribute('aria-controls', results.id);
    input.setAttribute('aria-expanded', 'false');
    iconButton.setAttribute('aria-controls', results.id);
    let timer;
    // Invalidate delayed results as well as closing the visible overlay.
    const closeResults = (collapseIcon = false) => {
      window.clearTimeout(timer);
      control.removeAttribute('data-request');
      results.hidden = true;
      input.setAttribute('aria-expanded', 'false');
      if (collapseIcon) {
        control.removeAttribute('data-icon-expanded');
        iconButton.setAttribute('aria-expanded', 'false');
      }
    };
    control.closeDesignerSearch = closeResults;
    // Stop debounced messages and release only extension-owned layout classes.
    control.disposeDesignerSearch = () => {
      closeResults();
      heading.classList.remove('ellucian-pipeline-heading');
      heading.parentElement?.classList.remove('ellucian-pipeline-heading-group');
      control.remove();
    };
    // Expand the compact control and focus its editable field.
    iconButton.addEventListener('click', () => {
      control.dataset.iconExpanded = 'true';
      iconButton.setAttribute('aria-expanded', 'true');
      input.focus();
      if (input.value.trim()) input.dispatchEvent(new Event('input'));
    });
    // Debounce local data lookup while the user types.
    input.addEventListener('input', () => {
      closeResults();
      if (!input.value.trim()) return;
      timer = window.setTimeout(() => {
        control.dataset.request = `designer-${Date.now()}`;
        window.postMessage({ source: MESSAGE_SOURCE, type: 'designer-search', requestId: control.dataset.request, query: input.value }, window.location.origin);
      }, 150);
    });
    input.addEventListener('keydown', (event) => {
      if (event.key === 'Escape') {
        closeResults(true);
        if (designerSearchMode === 'icon') iconButton.focus();
      }
      if (event.key === 'ArrowDown') results.querySelector('button')?.focus();
    });
    control.append(iconButton, input, results);
    // Align siblings without moving React-owned nodes out of their native parent.
    heading.classList.add('ellucian-pipeline-heading');
    heading.parentElement.classList.add('ellucian-pipeline-heading-group');
    heading.after(control);
  }

  // Render only the current package search response as safe text and buttons.
  window.addEventListener('message', (event) => {
    if (event.source !== window || event.data?.source !== MESSAGE_SOURCE || event.data?.type !== 'designer-results') return;
    const control = document.querySelector('.ellucian-designer-search');
    if (!control || control.dataset.request !== event.data.requestId) return;
    const results = control.querySelector('.ellucian-designer-results');
    results.replaceChildren();
    const matches = Array.isArray(event.data.results) ? event.data.results.slice(0, 100) : [];
    if (!matches.length) results.textContent = event.data.available ? 'No matching pipelines' : 'Pipeline search is not ready. Try again after the package loads.';
    matches.forEach((pipeline) => {
      const button = document.createElement('button');
      button.type = 'button';
      button.textContent = `${normalizeText(pipeline.name)} · ${normalizeText(pipeline.version) || 'Draft'}`;
      button.addEventListener('click', () => {
        window.postMessage({ source: MESSAGE_SOURCE, type: 'designer-open', packageName: normalizeText(event.data.packageName), name: normalizeText(pipeline.name), version: normalizeText(pipeline.version), status: normalizeText(pipeline.status) }, window.location.origin);
        control.closeDesignerSearch(true);
      });
      results.appendChild(button);
    });
    results.hidden = false;
    control.querySelector('input').setAttribute('aria-expanded', 'true');
  });

  function applySearchMode() {
    // Begin or cancel source collection before applying controls for the current route.
    updateDesignerOwnershipVisit();
    updateDesignerSearch();
    updateSharedVersionColumn();
    updateSharedFromColumn();
    requestDesignerOwnership();
    // Keep the shared Experience shell untouched outside the supported pages.
    if (!isSupportedPage()) {
      document.querySelectorAll('[data-testid="master"]').forEach((panel) => {
        removeFavoritesFromPanel(panel);
        removeSearchControls(panel);
      });
      return;
    }

    document.querySelectorAll('[data-testid="master"]').forEach((panel) => {
      // Keep favorites independent from the selected search presentation mode.
      updateFavoritesForPanel(panel);

      // Fully restore Ellucian's original header when search is turned off.
      if (searchMode === "hidden") {
        removeSearchControls(panel);
        return;
      }

      const control = createSearchControls(panel);

      if (!control) {
        return;
      }

      // Let CSS switch between the full box and compact icon modes.
      control.setAttribute("data-search-mode", searchMode);
      if (searchMode !== "icon") {
        control.removeAttribute("data-icon-expanded");
      }
    });
  }

  // Refresh the search UI after React replaces either page's heading.
  let pendingSearchFrame = 0;
  function scheduleSearchUpdate() {
    if (pendingSearchFrame) {
      return;
    }

    pendingSearchFrame = window.requestAnimationFrame(() => {
      pendingSearchFrame = 0;
      // Route changes need their own source refresh even when the inventory is unchanged.
      updateDesignerOwnershipVisit();

      // Load the destination page's saved state after internal navigation.
      const currentStorageKey = isSupportedPage()
        ? getFavoritesStorageKey()
        : "";
      if (currentStorageKey !== activeFavoritesStorageKey) {
        loadFavoritesForCurrentPage();
        return;
      }

      applySearchMode();
    });
  }

  // Close search overlays when the user clicks elsewhere on the page.
  document.addEventListener(
    "pointerdown",
    (event) => {
      // Reuse the outside-click listener for the independent Designer overlay.
      const designerControl = document.querySelector('.ellucian-designer-search');
      if (designerControl && !designerControl.contains(event.target)) designerControl.closeDesignerSearch(true);
      if (!activeSearchControl) {
        return;
      }

      const resultsElement = activeSearchControl.searchResultsElement;
      if (
        !activeSearchControl.contains(event.target) &&
        !resultsElement?.contains(event.target)
      ) {
        activeSearchControl.closeSearchResults?.(true);
      }
    },
    true,
  );

  // Receive only current, validated index responses from the page-world helper.
  window.addEventListener("message", (event) => {
    if (event.source !== window || event.data?.source !== MESSAGE_SOURCE) {
      return;
    }

    if (event.data.type === INDEX_READY) {
      if (isSupportedPage()) {
        requestSearchIndex();
      }
      return;
    }

    // Only a pending opt-in request may persist sanitized names from the current Designer.
    if (event.data.type === 'designer-ownership-response') {
      if (!sharedFromEnabled || !isDesignerPackagePage() || !ownershipRequest || event.data.requestId !== ownershipRequest) return;
      // Keep this request pending until the background confirms the cache write.
      const requestId = ownershipRequest;
      // Extension reloads can remove the API or make an existing API throw synchronously.
      try {
        const runtime = globalThis.chrome?.runtime;
        if (!runtime?.id || typeof runtime.sendMessage !== 'function') {
          stopDisconnectedOwnership();
          return;
        }
        // Send only the current sanitized source snapshot, never page content or credentials.
        runtime.sendMessage({ type: 'designer-ownership-save', tenantId: normalizeText(event.data.tenantId), environment: normalizeText(event.data.environment),
          pipelines: Array.isArray(event.data.pipelines) ? event.data.pipelines.slice(0, 10001).map(normalizeText) : [] }, (result) => {
          // Ignore a late callback after opt-out, navigation, or a replacement request.
          if (ownershipRequest !== requestId) return;
          let saveFailed;
          // The extension can also disappear between sending and receiving the reply.
          try {
            const lastError = runtime.lastError;
            if (globalThis.chrome?.runtime !== runtime || !runtime.id || /Extension context invalidated/i.test(lastError?.message || '')) {
              stopDisconnectedOwnership();
              return;
            }
            saveFailed = Boolean(lastError) || result?.ok !== true;
          } catch (_error) {
            stopDisconnectedOwnership();
            return;
          }
          // Clear the pending lookup only after the runtime reply can safely be inspected.
          window.clearTimeout(ownershipTimer);
          ownershipRequest = '';
          // Ordinary persistence failures retain the existing single retry budget.
          if (saveFailed) {
            console.warn('Designer source cache could not be saved. Revisit Designer to retry.');
            if (ownershipAttempts < 2) requestDesignerOwnership();
            else finishOwnershipRefresh({ ok: false, reason: 'save-failed' });
          } else {
            // A successful snapshot needs no mutation-driven follow-up request.
            ownershipAttempts = 2;
            finishOwnershipRefresh({ ok: true });
          }
        });
      } catch (_error) {
        stopDisconnectedOwnership();
      }
      return;
    }

    // Accept sharing results only for a request created by this script.
    if (event.data.type === SHARED_STATUS_RESPONSE) {
      const pending = pendingSharedStatusRequests.get(event.data.requestId);
      if (!pending) return;
      window.clearTimeout(pending.timer);
      pendingSharedStatusRequests.delete(event.data.requestId);
      const results = Array.isArray(event.data.results) ? event.data.results : [];
      pending.batch.forEach(({ key }) => {
        // Ignore responses superseded by manual refresh or a completed share.
        if (sharedStatusCache.get(key)?.requestId !== event.data.requestId) return;
        const result = results.find((item) => item?.key === key);
        sharedStatusCache.set(key, result ? {
          error: result.error === true,
          reason: normalizeText(result.reason),
          shared: result.shared === true,
          destinations: Array.isArray(result.destinations) ? result.destinations.slice(0, 50).map((destination) => ({
            environment: normalizeText(destination?.environment),
            tenantName: normalizeText(destination?.tenantName),
            tenantId: normalizeText(destination?.tenantId),
            version: normalizeText(destination?.version),
            outdated: destination?.outdated === true,
          })) : [],
        } : { error: true });
      });
      updateSharedVersionColumn();
      return;
    }

    if (
      event.data.type !== INDEX_RESPONSE ||
      event.data.requestId !== latestRequestId
    ) {
      return;
    }

    window.clearTimeout(indexResponseTimer);
    const normalizedIndex = normalizeSearchIndex(event.data.packages);
    const packageRowsFound = Number(event.data.packageRowsFound) || 0;
    const completeIndex =
      event.data.indexAvailable === true &&
      normalizedIndex.length > 0 &&
      normalizedIndex.length === packageRowsFound;

    // Prefer the complete React index and clearly fall back when it is incomplete.
    if (completeIndex) {
      const currentIndexKey = getFavoritesStorageKey();

      // Merge only within this page so Test, Production, Packages, and Designer stay isolated.
      completeSearchIndex =
        completeSearchIndexKey === currentIndexKey
          ? mergeCompleteSearchIndexes(completeSearchIndex, normalizedIndex)
          : normalizedIndex;
      completeSearchIndexKey = currentIndexKey;
      searchIndex = completeSearchIndex;
      indexState = "ready";
      // Only a complete response for the current Designer visit permits source collection.
      if (sharedFromEnabled && isDesignerPackagePage() && ownershipPageKey === getFavoritesStorageKey()) {
        ownershipIndexReady = true;
        window.clearTimeout(ownershipIndexTimer);
        ownershipIndexTimer = 0;
      }
      requestDesignerOwnership();
      refreshOpenSearchResults();
      refreshFavoritesUI();
    } else {
      activateDomFallback();
    }
  });

  // Reuse content.js's observer instead of watching the entire document twice.
  window.addEventListener(DOM_CHANGE_EVENT, scheduleSearchUpdate);

  // Reattach controls after restored pages, tab returns, or replaced app roots.
  function resumePageControls() {
    // Rechecking after a genuine visit refreshes timestamps without a polling timer.
    updateDesignerOwnershipVisit(true);
    scheduleSearchUpdate();
    if (isSupportedPage()) requestSearchIndex();
    window.dispatchEvent(new Event(LAYOUT_REQUEST_EVENT));
  }
  window.addEventListener('pageshow', resumePageControls);
  window.addEventListener('popstate', resumePageControls);
  document.addEventListener('visibilitychange', () => {
    if (!document.hidden) resumePageControls();
  });
  // A trusted user selection must take precedence over a delayed favorite click.
  document.addEventListener('pointerdown', (event) => {
    if (event.isTrusted) navigationSequence += 1;
  }, true);

  // Observe table updates separately because sidebar-only events miss pagination.
  const detailObserver = new MutationObserver((mutations) => {
    // Both share flows refresh once on return, even when the user cancels.
    checkShareCompletion();
    const changed = mutations.some((mutation) => {
      const target = mutation.target instanceof Element ? mutation.target : mutation.target.parentElement;
      if (target?.closest('[data-ellucian-shared-cell], [data-ellucian-source-cell], .ellucian-designer-search')) return false;
      return target?.closest('table') || Array.from(mutation.addedNodes).some((node) => node instanceof Element && (node.matches('table, h2') || node.querySelector('table')));
    });
    if (changed) scheduleSearchUpdate();
  });
  // Include modal visibility changes for dialogs that remain mounted when closed.
  detailObserver.observe(document.body, { childList: true, subtree: true, characterData: true, attributes: true, attributeFilter: ['hidden', 'aria-hidden'] });

  // Apply popup changes immediately to the open Ellucian page.
  chrome.storage.onChanged.addListener((changes, storageArea) => {
    if (storageArea !== "local") {
      return;
    }

    // Update colors in place; do not rebuild favorites or disturb open pipeline groups.
    if (changes[FavoriteAppearance.KEY] || changes[FavoriteAppearance.ICON_KEY]) {
      if (changes[FavoriteAppearance.KEY]) favoriteAppearance = FavoriteAppearance.normalize(changes[FavoriteAppearance.KEY].newValue);
      if (changes[FavoriteAppearance.ICON_KEY]) iconAppearance = changes[FavoriteAppearance.ICON_KEY].newValue;
      FavoriteAppearance.apply(favoriteAppearance, iconAppearance, document.documentElement);
    }

    // Disabling the option removes the column and prevents further checks.
    if (changes[SHARED_VERSION_ENABLED_KEY]) {
      sharedVersionEnabled = changes[SHARED_VERSION_ENABLED_KEY].newValue === true;
      updateSharedVersionColumn();
    }

    // Collect nothing while disabled, and discard pending results immediately on opt-out.
    if (changes[SHARED_FROM_ENABLED_KEY]) {
      sharedFromEnabled = changes[SHARED_FROM_ENABLED_KEY].newValue === true;
      updateDesignerOwnershipVisit(true);
      if (!sharedFromEnabled) ownershipByName.clear();
      else chrome.storage.local.get({ [OWNERSHIP_CACHE_KEY]: {} }, (settings) => {
        loadOwnershipCache(settings[OWNERSHIP_CACHE_KEY]);
        updateSharedFromColumn();
        requestSearchIndex();
      });
      updateSharedFromColumn();
    }
    // Update open Packages tabs when another environment's Designer is visited.
    if (changes[OWNERSHIP_CACHE_KEY]) {
      loadOwnershipCache(changes[OWNERSHIP_CACHE_KEY].newValue);
      updateSharedFromColumn();
    }

    // Apply search presentation changes without requiring a page refresh.
    if (changes[SEARCH_MODE_KEY] || changes[DESIGNER_SEARCH_MODE_KEY]) {
      // Normalize only the preference that changed; leave the other area untouched.
      if (changes[SEARCH_MODE_KEY]) searchMode = normalizeSearchMode(changes[SEARCH_MODE_KEY].newValue);
      if (changes[DESIGNER_SEARCH_MODE_KEY]) designerSearchMode = normalizeSearchMode(changes[DESIGNER_SEARCH_MODE_KEY].newValue);
      applySearchMode();
    }

    // Add or remove all favorite controls while preserving the saved list.
    if (changes[FAVORITES_ENABLED_KEY]) {
      favoritesEnabled = changes[FAVORITES_ENABLED_KEY].newValue !== false;
      refreshFavoritesUI();
    }

    // Synchronize changes made by another tab in the same environment.
    if (changes[FAVORITES_BY_HOST_KEY]) {
      const favoritesByHost = changes[FAVORITES_BY_HOST_KEY].newValue ?? {};
      loadFavoriteState(favoritesByHost[getFavoritesStorageKey()]);
      refreshFavoritesUI();
    }

    // Synchronize the expanded state across tabs in the same environment.
    if (changes[FAVORITES_EXPANDED_BY_HOST_KEY]) {
      const expandedByHost =
        changes[FAVORITES_EXPANDED_BY_HOST_KEY].newValue ?? {};
      favoritesExpanded =
        expandedByHost[getFavoritesStorageKey()] !== false;
      refreshFavoritesUI();
    }

    // Synchronize a remembered list height changed in another tab.
    if (changes[FAVORITES_HEIGHTS_BY_HOST_KEY]) {
      const heightsByHost =
        changes[FAVORITES_HEIGHTS_BY_HOST_KEY].newValue ?? {};
      const storedHeight = Number(
        heightsByHost[getFavoritesStorageKey()],
      );
      favoriteListHeight =
        Number.isFinite(storedHeight) && storedHeight > 0
          ? storedHeight
          : null;
      refreshFavoritesUI();
    }
  });

  // Re-clamp a custom height when the browser viewport becomes shorter.
  window.addEventListener("resize", () => {
    if (favoriteListHeight !== null) {
      refreshFavoritesUI();
    }
  }, { passive: true });

  // Load search and favorites preferences before inserting the first controls.
  chrome.storage.local.get(
    {
      [SEARCH_MODE_KEY]: DEFAULT_SEARCH_MODE,
      [DESIGNER_SEARCH_MODE_KEY]: DEFAULT_SEARCH_MODE,
      [SHARED_VERSION_ENABLED_KEY]: false,
      [SHARED_FROM_ENABLED_KEY]: false,
      [OWNERSHIP_CACHE_KEY]: {},
      [FAVORITES_ENABLED_KEY]: true,
      [FavoriteAppearance.KEY]: FavoriteAppearance.DEFAULT,
      [FavoriteAppearance.ICON_KEY]: null,
      [FAVORITES_BY_HOST_KEY]: {},
      [FAVORITES_EXPANDED_BY_HOST_KEY]: {},
      [FAVORITES_HEIGHTS_BY_HOST_KEY]: {},
    },
    (settings) => {
      const currentStorageKey = isSupportedPage()
        ? getFavoritesStorageKey()
        : "";
      const favoritesByHost = settings[FAVORITES_BY_HOST_KEY] ?? {};
      const expandedByHost = settings[FAVORITES_EXPANDED_BY_HOST_KEY] ?? {};
      const heightsByHost = settings[FAVORITES_HEIGHTS_BY_HOST_KEY] ?? {};

      // Apply only the current page-specific settings format.
      searchMode = normalizeSearchMode(settings[SEARCH_MODE_KEY]);
      designerSearchMode = normalizeSearchMode(settings[DESIGNER_SEARCH_MODE_KEY]);
      sharedVersionEnabled = settings[SHARED_VERSION_ENABLED_KEY] === true;
      sharedFromEnabled = settings[SHARED_FROM_ENABLED_KEY] === true;
      loadOwnershipCache(settings[OWNERSHIP_CACHE_KEY]);
      favoritesEnabled = settings[FAVORITES_ENABLED_KEY] !== false;
      // Apply the saved color before inserting stars, including after a page refresh.
      favoriteAppearance = FavoriteAppearance.normalize(settings[FavoriteAppearance.KEY]);
      iconAppearance = settings[FavoriteAppearance.ICON_KEY];
      FavoriteAppearance.apply(favoriteAppearance, iconAppearance, document.documentElement);
      activeFavoritesStorageKey = currentStorageKey;

      // Load page-specific values only when starting on a supported route.
      if (currentStorageKey) {
        loadFavoriteState(favoritesByHost[currentStorageKey]);
        favoritesExpanded = expandedByHost[currentStorageKey] !== false;
        const storedHeight = Number(heightsByHost[currentStorageKey]);
        favoriteListHeight =
          Number.isFinite(storedHeight) && storedHeight > 0
            ? storedHeight
            : null;
      }

      applySearchMode();
      if (currentStorageKey) {
        requestSearchIndex();
      }
    },
  );
})();
