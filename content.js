(() => {
  "use strict";

  // Select the stable semantic marker shared by both Ellucian pages.
  const PANEL_SELECTOR = '[data-testid="master"]';

  // Mark only panels that contain the package tree structure we expect.
  const TREE_SELECTOR = ':scope > [role="tree"]';

  // Limit the behavior to the two requested pages.
  const SUPPORTED_PATHS = [
    "/data-connect/home",
    "/data-connect-designer",
  ];

  // Leave a small buffer so borders do not create a new whole-page scrollbar.
  const VIEWPORT_BOTTOM_BUFFER = 2;

  // Keep resizing within practical limits for the package names and main content.
  const MIN_PANEL_WIDTH = 240;
  const MAX_PANEL_VIEWPORT_RATIO = 0.6;
  const KEYBOARD_RESIZE_STEP = 16;
  const RESIZE_HANDLE_WIDTH = 8;

  // Store only the optional preference and per-site width when remembering is enabled.
  const REMEMBER_WIDTH_KEY = "rememberWidth";
  const SAVED_WIDTHS_KEY = "savedWidths";

  // Let the search script reuse this script's scoped React-change observer.
  const DOM_CHANGE_EVENT = "ellucian-left-panel-dom-changed";

  // Accept explicit layout requests after the favorites section is resized.
  const LAYOUT_REQUEST_EVENT = "ellucian-left-panel-layout-request";

  // Default to resetting the width on every refresh, as requested.
  let rememberWidth = false;
  let savedWidthForCurrentPage = null;
  let savedWidthsByPage = {};
  let activeWidthStorageKey = "";

  // Avoid applying repeated layout updates within the same animation frame.
  let pendingAnimationFrame = 0;

  // Confirm that the current single-page-app route is one of the requested pages.
  function isSupportedPage() {
    const currentPath = window.location.pathname.toLowerCase();

    return SUPPORTED_PATHS.some((supportedPath) =>
      currentPath.includes(supportedPath),
    );
  }

  // Keep Designer and Integration Packages widths independent on each host.
  function getCurrentWidthStorageKey() {
    const currentPath = window.location.pathname.toLowerCase();
    const pageName = currentPath.includes("/data-connect-designer")
      ? "designer"
      : "packages";

    return `${window.location.host}|${pageName}`;
  }

  // Remove this extension's marker and size from panels on unrelated routes.
  function clearPanelAdjustments() {
    document
      .querySelectorAll(`${PANEL_SELECTOR}[data-ellucian-left-panel-scroll]`)
      .forEach((panel) => {
        // Remove only values owned by this extension.
        panel.removeAttribute("data-ellucian-left-panel-scroll");
        panel.removeAttribute("data-ellucian-panel-resized");
        panel.style.removeProperty("--ellucian-left-panel-height");
        panel.style.removeProperty("--ellucian-package-list-height");
        panel.style.removeProperty("--ellucian-package-list-width");
        panel.style.removeProperty("--ellucian-left-panel-width");

        // Remove the extension-owned handle when this is no longer a supported page.
        panel
          .querySelector(":scope > .ellucian-left-panel-resize-handle")
          ?.remove();

        // Remove the scroll marker from the child list wrapper that owns it.
        panel
          .querySelector(':scope > [data-ellucian-scroll-region="true"]')
          ?.removeAttribute("data-ellucian-scroll-region");

        // Remove responsive pipeline markers owned by this extension.
        panel
          .querySelectorAll(
            "[data-ellucian-pipeline-item], [data-ellucian-pipeline-row], [data-ellucian-pipeline-name], [data-ellucian-pipeline-version]",
          )
          .forEach((element) => {
            element.removeAttribute("data-ellucian-pipeline-item");
            element.removeAttribute("data-ellucian-pipeline-row");
            element.removeAttribute("data-ellucian-pipeline-name");
            element.removeAttribute("data-ellucian-pipeline-version");
          });
      });

    document.documentElement.removeAttribute("data-ellucian-panel-resizing");
  }

  // Calculate the widest safe panel for the current browser window.
  function getMaximumPanelWidth() {
    return Math.max(
      MIN_PANEL_WIDTH,
      Math.floor(window.innerWidth * MAX_PANEL_VIEWPORT_RATIO),
    );
  }

  // Find the direct panel child that owns Ellucian's package tree.
  function getPackageListRegion(panel) {
    return Array.from(panel.children).find((child) =>
      child.querySelector(TREE_SELECTOR),
    );
  }

  // Avoid invalidating layout when a calculated CSS value is already current.
  function setStylePropertyIfChanged(element, propertyName, value) {
    if (element.style.getPropertyValue(propertyName) !== value) {
      element.style.setProperty(propertyName, value);
    }
  }

  // Apply a session-only width without writing to browser storage.
  function setPanelWidth(panel, requestedWidth) {
    const maximumWidth = getMaximumPanelWidth();
    const adjustedWidth = Math.min(
      maximumWidth,
      Math.max(MIN_PANEL_WIDTH, Math.round(requestedWidth)),
    );

    // Enable the width rules and expose the current value to assistive technology.
    if (!panel.hasAttribute("data-ellucian-panel-resized")) {
      panel.setAttribute("data-ellucian-panel-resized", "true");
    }
    setStylePropertyIfChanged(
      panel,
      "--ellucian-left-panel-width",
      `${adjustedWidth}px`,
    );

    // Recalculate the inner list width as the outer divider moves.
    schedulePanelAdjustment();

    // Keep the resize handle's accessible value synchronized with the visible width.
    const resizeHandle = panel.querySelector(
      ":scope > .ellucian-left-panel-resize-handle",
    );
    resizeHandle?.setAttribute("aria-valuenow", String(adjustedWidth));
    resizeHandle?.setAttribute("aria-valuemax", String(maximumWidth));
  }

  // Save the current width only when the toolbar switch is enabled.
  function savePanelWidth(panel) {
    if (!rememberWidth) {
      return;
    }

    // Keep Test/Production and the two Ellucian pages independent.
    const currentWidth = Math.round(panel.getBoundingClientRect().width);
    chrome.storage.local.get({ [SAVED_WIDTHS_KEY]: {} }, (settings) => {
      const savedWidths = {
        ...settings[SAVED_WIDTHS_KEY],
        [getCurrentWidthStorageKey()]: currentWidth,
      };

      // Update the local cache and persist the completed resize.
      savedWidthForCurrentPage = currentWidth;
      savedWidthsByPage = savedWidths;
      chrome.storage.local.set({ [SAVED_WIDTHS_KEY]: savedWidths });
    });
  }

  // Keep the resize help text accurate when the popup switch changes.
  function updateResizeHandleHelp(resizeHandle) {
    const persistenceMessage = rememberWidth
      ? "This page's width will be remembered after a refresh."
      : "The width resets when the page reloads.";

    resizeHandle.setAttribute(
      "data-ellucian-tooltip",
      `Drag to resize the package column. ${persistenceMessage}`,
    );
  }

  // Mark expanded child-pipeline rows using stable semantic attributes.
  function preparePipelineRows(listRegion) {
    listRegion
      .querySelectorAll(
        'li[data-level="2"][pipeline-element]:not([data-ellucian-pipeline-item="true"]), li[data-level="2"][pipelineelement]:not([data-ellucian-pipeline-item="true"])',
      )
      .forEach((pipelineItem) => {
        // Identify the name and version without using generated JSS class names.
        const pipelineName = pipelineItem.querySelector("span[title]");
        const pipelineVersion = pipelineItem.querySelector(
          'span[id$="-chip"]',
        );

        // Ignore an unexpected future row shape instead of styling it incorrectly.
        if (
          !pipelineName ||
          !pipelineVersion ||
          pipelineName.parentElement !== pipelineVersion.parentElement
        ) {
          return;
        }

        // Expose stable extension-owned selectors for the responsive row CSS.
        pipelineItem.setAttribute("data-ellucian-pipeline-item", "true");
        pipelineName.parentElement.setAttribute(
          "data-ellucian-pipeline-row",
          "true",
        );
        pipelineName.setAttribute("data-ellucian-pipeline-name", "true");
        pipelineVersion.setAttribute(
          "data-ellucian-pipeline-version",
          "true",
        );
      });
  }

  // Add one accessible drag handle to a matching package panel.
  function ensureResizeHandle(panel) {
    const existingHandle = panel.querySelector(
      ":scope > .ellucian-left-panel-resize-handle",
    );

    // Reuse the existing handle after React updates other panel content.
    if (existingHandle) {
      return;
    }

    // Build the right-edge handle without modifying Ellucian's package controls.
    const resizeHandle = document.createElement("div");
    resizeHandle.className = "ellucian-left-panel-resize-handle";
    resizeHandle.setAttribute("role", "separator");
    resizeHandle.setAttribute("aria-label", "Resize package column");
    resizeHandle.setAttribute("aria-orientation", "vertical");
    resizeHandle.setAttribute("aria-valuemin", String(MIN_PANEL_WIDTH));
    resizeHandle.setAttribute("aria-valuemax", String(getMaximumPanelWidth()));
    resizeHandle.setAttribute(
      "aria-valuenow",
      String(Math.round(panel.getBoundingClientRect().width)),
    );
    resizeHandle.setAttribute("tabindex", "0");
    updateResizeHandleHelp(resizeHandle);

    // Track the starting pointer and width for the current drag only.
    let dragStartX = 0;
    let dragStartWidth = 0;
    let isDragging = false;

    // Begin resizing and capture future pointer events on the same handle.
    resizeHandle.addEventListener("pointerdown", (event) => {
      if (event.button !== 0) {
        return;
      }

      event.preventDefault();
      dragStartX = event.clientX;
      dragStartWidth = panel.getBoundingClientRect().width;
      isDragging = true;
      document.documentElement.setAttribute(
        "data-ellucian-panel-resizing",
        "true",
      );
      resizeHandle.setPointerCapture(event.pointerId);
    });

    // Update the column width as the captured pointer moves horizontally.
    resizeHandle.addEventListener("pointermove", (event) => {
      if (!isDragging) {
        return;
      }

      const directionMultiplier =
        window.getComputedStyle(panel).direction === "rtl" ? -1 : 1;
      const horizontalChange =
        (event.clientX - dragStartX) * directionMultiplier;
      setPanelWidth(panel, dragStartWidth + horizontalChange);
    });

    // End a drag cleanly whether the pointer is released or cancelled.
    const finishDragging = (event) => {
      if (!isDragging) {
        return;
      }

      isDragging = false;
      document.documentElement.removeAttribute(
        "data-ellucian-panel-resizing",
      );

      // Release capture only when this handle still owns the pointer.
      if (resizeHandle.hasPointerCapture(event.pointerId)) {
        resizeHandle.releasePointerCapture(event.pointerId);
      }

      // Persist only the final width rather than writing on every pointer movement.
      savePanelWidth(panel);
    };

    resizeHandle.addEventListener("pointerup", finishDragging);
    resizeHandle.addEventListener("pointercancel", finishDragging);

    // Allow precise resizing without requiring a mouse or touch drag.
    resizeHandle.addEventListener("keydown", (event) => {
      if (event.key !== "ArrowLeft" && event.key !== "ArrowRight") {
        return;
      }

      event.preventDefault();
      const currentWidth = panel.getBoundingClientRect().width;
      const widthChange =
        event.key === "ArrowRight"
          ? KEYBOARD_RESIZE_STEP
          : -KEYBOARD_RESIZE_STEP;
      setPanelWidth(panel, currentWidth + widthChange);

      // Keyboard resize actions are discrete, so save each completed step.
      savePanelWidth(panel);
    });

    // Insert the handle last so it overlays only the panel's rightmost edge.
    panel.appendChild(resizeHandle);
  }

  // Size each package panel to the visible viewport below its current top edge.
  function applyPanelAdjustments() {
    // Disable the behavior if Ellucian navigates to a different in-app route.
    if (!isSupportedPage()) {
      clearPanelAdjustments();
      return;
    }

    // Refresh the remembered width when Ellucian changes pages without reloading.
    const currentWidthStorageKey = getCurrentWidthStorageKey();
    if (activeWidthStorageKey !== currentWidthStorageKey) {
      activeWidthStorageKey = currentWidthStorageKey;
      savedWidthForCurrentPage =
        savedWidthsByPage[currentWidthStorageKey] ?? null;
    }

    // Inspect every semantic master panel in case the application renders more than one.
    document.querySelectorAll(PANEL_SELECTOR).forEach((panel) => {
      // Resolve the two direct children used on both requested Ellucian pages.
      const headingRegion = panel.children[0];
      const listRegion = getPackageListRegion(panel);

      // Ignore unrelated master panels that do not directly contain a package tree.
      if (!headingRegion || !listRegion) {
        return;
      }

      // Measure the panel's current top so it fills exactly to the viewport bottom.
      const panelBounds = panel.getBoundingClientRect();
      const panelTop = Math.max(0, panelBounds.top);
      const availableHeight = Math.max(
        160,
        Math.floor(window.innerHeight - panelTop - VIEWPORT_BOTTOM_BUFFER),
      );

      // Explicitly size the list because Designer and Packages use different layout rules.
      const headingHeight = Math.ceil(
        headingRegion.getBoundingClientRect().height,
      );

      // Keep the full-width favorites row fixed above the independently scrolling tree.
      const favoritesHeight = Math.ceil(
        panel
          .querySelector(":scope > .ellucian-favorites-section")
          ?.getBoundingClientRect().height ?? 0,
      );
      const listHeight = Math.max(
        100,
        availableHeight - headingHeight - favoritesHeight,
      );

      // Extend through Ellucian's right padding and stop before the resize strip.
      const listLeft = listRegion.getBoundingClientRect().left;
      const listWidth = Math.max(
        100,
        Math.floor(panelBounds.right - listLeft - RESIZE_HANDLE_WIDTH),
      );

      // Enable the scoped CSS and provide the calculated available height.
      if (
        panel.getAttribute("data-ellucian-left-panel-scroll") !== "enabled"
      ) {
        panel.setAttribute("data-ellucian-left-panel-scroll", "enabled");
      }
      if (listRegion.getAttribute("data-ellucian-scroll-region") !== "true") {
        listRegion.setAttribute("data-ellucian-scroll-region", "true");
      }
      setStylePropertyIfChanged(
        panel,
        "--ellucian-left-panel-height",
        `${availableHeight}px`,
      );
      setStylePropertyIfChanged(
        panel,
        "--ellucian-package-list-height",
        `${listHeight}px`,
      );
      setStylePropertyIfChanged(
        panel,
        "--ellucian-package-list-width",
        `${listWidth}px`,
      );

      // Make any currently expanded pipeline rows respond to the column width.
      preparePipelineRows(listRegion);

      // Restore this site's width once when the preference is enabled.
      if (
        rememberWidth &&
        savedWidthForCurrentPage &&
        !panel.hasAttribute("data-ellucian-panel-resized")
      ) {
        setPanelWidth(panel, savedWidthForCurrentPage);
      }

      // Add the resize handle after the panel has been identified and sized.
      ensureResizeHandle(panel);
    });
  }

  // Batch mutation, resize, and scroll events into one layout calculation.
  function schedulePanelAdjustment() {
    if (pendingAnimationFrame) {
      return;
    }

    // Wait until the browser is ready to perform the next visual update.
    pendingAnimationFrame = window.requestAnimationFrame(() => {
      pendingAnimationFrame = 0;
      applyPanelAdjustments();
    });
  }

  // Re-clamp a user width when the browser becomes narrower, then recalculate height.
  function handleViewportResize() {
    document
      .querySelectorAll(
        `${PANEL_SELECTOR}[data-ellucian-panel-resized="true"]`,
      )
      .forEach((panel) => {
        setPanelWidth(panel, panel.getBoundingClientRect().width);
      });

    schedulePanelAdjustment();
  }

  // Recalculate when the viewport changes size or the sticky panel changes position.
  window.addEventListener("resize", handleViewportResize, { passive: true });
  window.addEventListener("scroll", schedulePanelAdjustment, { passive: true });
  window.addEventListener("popstate", schedulePanelAdjustment);
  // Browser-restored documents need their panel geometry recalculated.
  window.addEventListener("pageshow", schedulePanelAdjustment);
  window.addEventListener(LAYOUT_REQUEST_EVENT, schedulePanelAdjustment);

  // Identify mutation batches that can actually change the package panel.
  function mutationsAffectPackagePanel(mutations) {
    return mutations.some((mutation) => {
      const target = mutation.target;

      // React changes inside an existing panel can add packages or pipelines.
      if (target instanceof Element && target.closest(PANEL_SELECTOR)) {
        return true;
      }

      // Route changes can add or remove a complete package panel at the app root.
      return [...mutation.addedNodes, ...mutation.removedNodes].some((node) =>
        node instanceof Element &&
        (node.matches(PANEL_SELECTOR) || node.querySelector(PANEL_SELECTOR)),
      );
    });
  }

  // Watch only React changes that add, remove, or update the package panel.
  const pageObserver = new MutationObserver((mutations) => {
    if (!mutationsAffectPackagePanel(mutations)) {
      return;
    }

    schedulePanelAdjustment();

    // Notify the search script so it does not need a second page-wide observer.
    window.dispatchEvent(new Event(DOM_CHANGE_EVENT));
  });
  pageObserver.observe(document.body, {
    childList: true,
    subtree: true,
  });

  // React immediately when the popup changes the remember/reset preference.
  chrome.storage.onChanged.addListener((changes, storageArea) => {
    if (storageArea !== "local" || !changes[REMEMBER_WIDTH_KEY]) {
      return;
    }

    // Update this page without requiring a refresh after the switch changes.
    rememberWidth = Boolean(changes[REMEMBER_WIDTH_KEY].newValue);

    // Refresh the help text on every existing handle immediately.
    document
      .querySelectorAll(".ellucian-left-panel-resize-handle")
      .forEach(updateResizeHandleHelp);

    // Save the visible width when remembering is newly enabled.
    if (rememberWidth) {
      document
        .querySelectorAll(
          `${PANEL_SELECTOR}[data-ellucian-left-panel-scroll="enabled"]`,
        )
        .forEach(savePanelWidth);
    }
  });

  // Load the switch and any saved host width before the first visual adjustment.
  chrome.storage.local.get(
    {
      [REMEMBER_WIDTH_KEY]: false,
      [SAVED_WIDTHS_KEY]: {},
    },
    (settings) => {
      rememberWidth = Boolean(settings[REMEMBER_WIDTH_KEY]);
      savedWidthsByPage = settings[SAVED_WIDTHS_KEY] ?? {};
      activeWidthStorageKey = isSupportedPage()
        ? getCurrentWidthStorageKey()
        : "";

      // Load only the current page-specific width format.
      savedWidthForCurrentPage = activeWidthStorageKey
        ? savedWidthsByPage[activeWidthStorageKey] ?? null
        : null;

      // Apply the behavior to the panel already present when the script loads.
      schedulePanelAdjustment();
    },
  );
})();
