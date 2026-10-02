(() => {
  "use strict";

  // Reuse the same storage names as the page script.
  const REMEMBER_WIDTH_KEY = "rememberWidth";
  const SAVED_WIDTHS_KEY = "savedWidths";
  const SEARCH_MODE_KEY = "searchDisplayMode";
  const SEARCH_MODES = new Set(["box", "icon", "hidden"]);
  const DEFAULT_SEARCH_MODE = "box";
  const FAVORITES_ENABLED_KEY = "favoritesEnabled";
  const SHARED_VERSION_ENABLED_KEY = "sharedVersionEnabled";

  // Locate the popup controls after the static popup document loads.
  const rememberWidthSwitch = document.querySelector("#remember-width");
  const favoritesEnabledSwitch = document.querySelector("#favorites-enabled");
  const sharedVersionSwitch = document.querySelector("#shared-version-enabled");
  const versionLabel = document.querySelector("#extension-version");
  const searchModeInputs = document.querySelectorAll(
    'input[name="search-display-mode"]',
  );

  // Accept only one of the three supported search presentation modes.
  function normalizeSearchMode(value) {
    return SEARCH_MODES.has(value) ? value : DEFAULT_SEARCH_MODE;
  }

  // Load every popup preference in one storage read to avoid redundant startup work.
  chrome.storage.local.get(
    {
      [REMEMBER_WIDTH_KEY]: false,
      [FAVORITES_ENABLED_KEY]: true,
      [SHARED_VERSION_ENABLED_KEY]: false,
      [SEARCH_MODE_KEY]: DEFAULT_SEARCH_MODE,
    },
    (settings) => {
      // Display the width preference and its explanatory status.
      rememberWidthSwitch.checked = Boolean(settings[REMEMBER_WIDTH_KEY]);
      sharedVersionSwitch.checked = settings[SHARED_VERSION_ENABLED_KEY] === true;

      // Display the favorites preference, defaulting to the visible section.
      favoritesEnabledSwitch.checked =
        settings[FAVORITES_ENABLED_KEY] !== false;

      // Select the saved search mode, defaulting to the always-visible box.
      const selectedMode = normalizeSearchMode(settings[SEARCH_MODE_KEY]);
      const selectedInput = document.querySelector(
        `input[name="search-display-mode"][value="${selectedMode}"]`,
      );
      selectedInput.checked = true;
    },
  );

  // Save each switch change immediately.
  rememberWidthSwitch.addEventListener("change", () => {
    const shouldRemember = rememberWidthSwitch.checked;

    chrome.storage.local.set(
      { [REMEMBER_WIDTH_KEY]: shouldRemember },
    );

    // Remove old widths when reset-on-refresh is selected.
    if (!shouldRemember) {
      chrome.storage.local.remove(SAVED_WIDTHS_KEY);
    }
  });

  // Apply optional sharing checks immediately to open Designer pages.
  sharedVersionSwitch.addEventListener("change", () => {
    chrome.storage.local.set({ [SHARED_VERSION_ENABLED_KEY]: sharedVersionSwitch.checked });
  });

  // Show or hide favorite controls immediately while retaining saved packages.
  favoritesEnabledSwitch.addEventListener("change", () => {
    chrome.storage.local.set({
      [FAVORITES_ENABLED_KEY]: favoritesEnabledSwitch.checked,
    });
  });

  // Save each mutually exclusive search display choice immediately.
  searchModeInputs.forEach((searchModeInput) => {
    searchModeInput.addEventListener("change", () => {
      if (!searchModeInput.checked) {
        return;
      }

      chrome.storage.local.set({
        [SEARCH_MODE_KEY]: normalizeSearchMode(searchModeInput.value),
      });
    });
  });

  // Read the installed manifest so the footer always shows the current version.
  versionLabel.textContent = `Version ${chrome.runtime.getManifest().version}`;
})();
