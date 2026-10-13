(() => {
  "use strict";

  // Share page rules and the resize gesture between content.js and search.js.
  // Keep: page-index.js keeps its own copies; it runs in the page world, where a global would be visible to Ellucian (1.21.9).

  // Limit the behavior to the two supported Ellucian pages.
  const SUPPORTED_PATHS = Object.freeze(["/data-connect/home", "/data-connect-designer"]);

  // Select the stable semantic marker shared by both Ellucian pages.
  const PANEL_SELECTOR = '[data-testid="master"]';

  // Keep: match both pipeline-element and pipelineelement; Ellucian's pages use either spelling (1.15.1).
  const PIPELINE_ROW_SELECTOR = 'li[data-level="2"][pipeline-element], li[data-level="2"][pipelineelement]';

  // Let search.js reuse content.js's sidebar observer instead of adding its own.
  const DOM_CHANGE_EVENT = "ellucian-left-panel-dom-changed";

  // Ask content.js to recalculate the sidebar after the favorites section changes size.
  const LAYOUT_REQUEST_EVENT = "ellucian-left-panel-layout-request";

  // Confirm that the current single-page-app route is one of the supported pages.
  function isSupportedPage() {
    const currentPath = window.location.pathname.toLowerCase();
    return SUPPORTED_PATHS.some((supportedPath) => currentPath.includes(supportedPath));
  }

  // Match only the Integration Packages page, not Designer or other Experience routes.
  function isPackagesPage() {
    return /\/data-connect\/home\/?$/iu.test(window.location.pathname);
  }

  // Keep saved values separate for each host and for Packages versus Designer.
  function getPageStorageKey() {
    const pageName = window.location.pathname.toLowerCase().includes("/data-connect-designer") ? "designer" : "packages";
    return `${window.location.host}|${pageName}`;
  }

  // Wire pointer dragging and arrow keys to one size value, saving only completed changes.
  function attachResizeDrag(handle, { axis, keys, step, resizingAttribute, getSize, setSize, save, direction = () => 1 }) {
    const position = (event) => (axis === "x" ? event.clientX : event.clientY);
    let dragStart = 0;
    let dragStartSize = 0;
    let isDragging = false;

    // Capture the pointer so resizing continues outside the thin handle.
    handle.addEventListener("pointerdown", (event) => {
      if (event.button !== 0) return;
      event.preventDefault();
      dragStart = position(event);
      dragStartSize = getSize();
      isDragging = true;
      document.documentElement.setAttribute(resizingAttribute, "true");
      handle.setPointerCapture(event.pointerId);
    });

    // Resize as the captured pointer moves, honoring right-to-left layouts when asked.
    handle.addEventListener("pointermove", (event) => {
      if (isDragging) setSize(dragStartSize + (position(event) - dragStart) * direction());
    });

    // End cleanly on release or cancellation, saving only the final size.
    const finishDragging = (event) => {
      if (!isDragging) return;
      isDragging = false;
      document.documentElement.removeAttribute(resizingAttribute);
      if (handle.hasPointerCapture(event.pointerId)) handle.releasePointerCapture(event.pointerId);
      save();
    };
    handle.addEventListener("pointerup", finishDragging);
    handle.addEventListener("pointercancel", finishDragging);

    // Keyboard steps are discrete, so each one is saved immediately.
    handle.addEventListener("keydown", (event) => {
      const change = event.key === keys[1] ? step : event.key === keys[0] ? -step : 0;
      if (!change) return;
      event.preventDefault();
      setSize(getSize() + change);
      save();
    });
  }

  globalThis.NavigatorShared = Object.freeze({
    PANEL_SELECTOR, PIPELINE_ROW_SELECTOR, DOM_CHANGE_EVENT, LAYOUT_REQUEST_EVENT,
    isSupportedPage, isPackagesPage, getPageStorageKey, attachResizeDrag,
  });
})();
