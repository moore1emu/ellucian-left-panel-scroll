(() => {
  "use strict";

  // Reuse the same storage names as the page script.
  const REMEMBER_WIDTH_KEY = "rememberWidth";
  const SAVED_WIDTHS_KEY = "savedWidths";
  const SEARCH_MODE_KEY = "searchDisplayMode";
  const DESIGNER_SEARCH_MODE_KEY = "designerSearchDisplayMode";
  const SEARCH_MODES = new Set(["box", "icon", "hidden"]);
  const DEFAULT_SEARCH_MODE = "box";
  const FAVORITES_ENABLED_KEY = "favoritesEnabled";
  const SHARED_VERSION_ENABLED_KEY = "sharedVersionEnabled";
  const SHARED_FROM_ENABLED_KEY = "sharedFromEnabled";
  const OWNERSHIP_CACHE_KEY = "designerOwnershipCache";

  // Locate the popup controls after the static popup document loads.
  const rememberWidthSwitch = document.querySelector("#remember-width");
  const favoritesEnabledSwitch = document.querySelector("#favorites-enabled");
  const sharedVersionSwitch = document.querySelector("#shared-version-enabled");
  const sharedFromSwitch = document.querySelector("#shared-from-enabled");
  const sharedFromConfirmation = document.querySelector("#shared-from-confirmation");
  const sharedFromStatus = document.querySelector("#shared-from-status");
  const sharedFromCacheStatus = document.querySelector('#shared-from-cache-status');
  let cacheStatusTabId = null;
  let cacheStatusRead = 0;
  const exportSharedFromButton = document.querySelector("#export-shared-from");
  const refreshSharedFromButton = document.querySelector("#refresh-shared-from");
  const versionLabel = document.querySelector("#extension-version");
  const iconColorInput = document.querySelector("#icon-color");
  const iconLettersInput = document.querySelector("#icon-letters");
  const iconTextColorInput = document.querySelector("#icon-text-color");
  const resetIconButton = document.querySelector("#reset-icon");
  const iconPreview = document.querySelector(".header-icon");
  const iconStatus = document.querySelector("#icon-status");
  const favoriteColorInput = document.querySelector("#favorite-color");
  const favoriteShapeSelect = document.querySelector('#favorite-shape');
  const favoriteMatchSwitch = document.querySelector("#favorite-match-icon");
  const favoritePreview = document.querySelector("#favorite-color-preview");
  const favoriteStatus = document.querySelector("#favorite-color-status");
  const resetFavoriteButton = document.querySelector("#reset-favorite-color");
  let appearanceLoaded = false;
  // Retain the custom choice while the disabled picker displays the linked icon color.
  let independentFavoriteColor = FavoriteAppearance.DEFAULT.color;
  // Keep the existing sidebar preference separate from the Designer package search.
  const searchModeSelect = document.querySelector("#search-display-mode");
  const designerSearchModeSelect = document.querySelector("#designer-search-display-mode");

  // Accept only one of the three supported search presentation modes.
  function normalizeSearchMode(value) {
    return SEARCH_MODES.has(value) ? value : DEFAULT_SEARCH_MODE;
  }

  // Prevent edits from racing the initial asynchronous settings read.
  iconColorInput.disabled = true;
  iconLettersInput.disabled = true;
  iconTextColorInput.disabled = true;
  resetIconButton.disabled = true;
  favoriteColorInput.disabled = true;
  favoriteShapeSelect.disabled = true;
  favoriteMatchSwitch.disabled = true;
  resetFavoriteButton.disabled = true;

  // Load every popup preference in one storage read to avoid redundant startup work.
  chrome.storage.local.get(
    {
      [REMEMBER_WIDTH_KEY]: false,
      [FAVORITES_ENABLED_KEY]: true,
      [SHARED_VERSION_ENABLED_KEY]: false,
      [SHARED_FROM_ENABLED_KEY]: false,
      [SEARCH_MODE_KEY]: DEFAULT_SEARCH_MODE,
      [DESIGNER_SEARCH_MODE_KEY]: DEFAULT_SEARCH_MODE,
      [IconAppearance.KEY]: IconAppearance.DEFAULT,
      [FavoriteAppearance.KEY]: FavoriteAppearance.DEFAULT,
    },
    (settings) => {
      // Display the width preference and its explanatory status.
      rememberWidthSwitch.checked = Boolean(settings[REMEMBER_WIDTH_KEY]);
      sharedVersionSwitch.checked = settings[SHARED_VERSION_ENABLED_KEY] === true;
      // Restore opt-in without collecting anything while the popup initializes.
      sharedFromSwitch.checked = settings[SHARED_FROM_ENABLED_KEY] === true;
      sharedFromSwitch.disabled = false;
      refreshSharedFromButton.disabled = false;
      readOwnershipStatus();

      // Display the favorites preference, defaulting to the visible section.
      favoritesEnabledSwitch.checked =
        settings[FAVORITES_ENABLED_KEY] !== false;

      // Restore both independent choices before allowing changes to be saved.
      searchModeSelect.value = normalizeSearchMode(settings[SEARCH_MODE_KEY]);
      designerSearchModeSelect.value = normalizeSearchMode(settings[DESIGNER_SEARCH_MODE_KEY]);
      searchModeSelect.disabled = false;
      designerSearchModeSelect.disabled = false;

      // Show the saved appearance without changing other popup preferences.
      const appearance = IconAppearance.normalize(settings[IconAppearance.KEY]);
      iconColorInput.value = appearance.color;
      iconLettersInput.value = appearance.letters;
      iconTextColorInput.value = appearance.textColor;
      // Restore the independent color even when stars are linked to the icon.
      const stars = FavoriteAppearance.normalize(settings[FavoriteAppearance.KEY]);
      independentFavoriteColor = stars.color;
      favoriteMatchSwitch.checked = stars.matchIcon;
      favoriteShapeSelect.value = stars.shape;
      appearanceLoaded = true;
      previewIcon();
      iconColorInput.disabled = false;
      iconLettersInput.disabled = false;
      iconTextColorInput.disabled = false;
      resetIconButton.disabled = false;
      favoriteMatchSwitch.disabled = false;
      resetFavoriteButton.disabled = false;
      favoriteShapeSelect.disabled = false;
    },
  );

  // Preview color and initials immediately without generating artwork on every keystroke.
  function previewIcon() {
    const appearance = IconAppearance.normalize({ color: iconColorInput.value, letters: iconLettersInput.value, textColor: iconTextColorInput.value });
    iconPreview.textContent = appearance.letters;
    iconPreview.style.backgroundColor = appearance.color;
    iconPreview.style.color = appearance.textColor;
    iconPreview.style.fontSize = appearance.letters.length === 2 ? "17px" : "21px";
    // Linked stars preview the icon's background as the user edits it.
    previewFavoriteColor();
  }

  // Show the resolved star color without overwriting the user's separate custom color.
  function previewFavoriteColor() {
    const resolvedColor = FavoriteAppearance.resolve(
      { color: independentFavoriteColor, matchIcon: favoriteMatchSwitch.checked },
      { color: iconColorInput.value },
    );
    // Keep the swatch and star preview in sync without losing the independent choice.
    favoriteColorInput.value = resolvedColor;
    favoritePreview.style.color = resolvedColor;
    // Reuse exactly the same filled vector as the sidebar, including the bear's transparent features.
    FavoriteAppearance.render(favoritePreview.querySelector('svg'), { shape: favoriteShapeSelect.value });
    favoriteColorInput.disabled = !appearanceLoaded || favoriteMatchSwitch.checked;
  }

  // Save only the star preference; color changes never alter favorites or icon settings.
  function saveFavoriteColor() {
    // Accept a completed custom picker change only while it is not linked to the icon.
    if (!favoriteMatchSwitch.checked) {
      independentFavoriteColor = FavoriteAppearance.normalize({ color: favoriteColorInput.value }).color;
    }
    const appearance = FavoriteAppearance.normalize({ color: independentFavoriteColor, matchIcon: favoriteMatchSwitch.checked, shape: favoriteShapeSelect.value });
    chrome.storage.local.set({ [FavoriteAppearance.KEY]: appearance }, () => {
      favoriteStatus.textContent = chrome.runtime.lastError ? "Could not save. Please try again." : "Favorites appearance saved on this browser.";
    });
  }

  // Preview the picker live, committing after the completed color change.
  favoriteColorInput.addEventListener("input", () => {
    favoriteStatus.textContent = "";
    // Preview custom edits without replacing the retained choice in matching mode.
    if (!favoriteMatchSwitch.checked) {
      independentFavoriteColor = FavoriteAppearance.normalize({ color: favoriteColorInput.value }).color;
    }
    previewFavoriteColor();
  });
  favoriteColorInput.addEventListener("change", saveFavoriteColor);
  // Preview and save the chosen shape without changing the color or any pinned records.
  favoriteShapeSelect.addEventListener('change', () => { previewFavoriteColor(); saveFavoriteColor(); });
  favoriteMatchSwitch.addEventListener("change", () => {
    previewFavoriteColor();
    saveFavoriteColor();
  });

  // Reset stars to independent purple without changing the toolbar icon.
  resetFavoriteButton.addEventListener("click", () => {
    independentFavoriteColor = FavoriteAppearance.DEFAULT.color;
    favoriteMatchSwitch.checked = FavoriteAppearance.DEFAULT.matchIcon;
    favoriteShapeSelect.value = FavoriteAppearance.DEFAULT.shape;
    previewFavoriteColor();
    saveFavoriteColor();
  });

  // Format the last successful save in the browser's local date, matching MM-DD-YY.
  function renderOwnershipStatus(status) {
    sharedFromCacheStatus.hidden = !sharedFromSwitch.checked || status?.designer !== true;
    if (sharedFromCacheStatus.hidden) { sharedFromCacheStatus.textContent = ''; return; }
    if (status.enabled !== true) { sharedFromCacheStatus.textContent = 'Status Unavailable'; return; }
    if (status.busy === true) { sharedFromCacheStatus.textContent = 'Caching…'; return; }
    const timestamp = Number(status.checkedAt);
    const date = new Date(timestamp);
    if (Number.isFinite(timestamp) && timestamp > 0 && Number.isFinite(date.getTime())) {
      const pad = (number) => String(number).padStart(2, '0');
      sharedFromCacheStatus.textContent = `Cached ${pad(date.getMonth() + 1)}-${pad(date.getDate())}-${String(date.getFullYear()).slice(-2)}`;
    } else sharedFromCacheStatus.textContent = status.tenantId ? 'No Cache' : 'Status Unavailable';
  }

  // Opening settings reads only the active page's existing status, never a new snapshot.
  async function readOwnershipStatus() {
    const read = ++cacheStatusRead;
    if (!sharedFromSwitch.checked) { sharedFromCacheStatus.hidden = true; sharedFromCacheStatus.textContent = ''; return; }
    try {
      const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
      if (read !== cacheStatusRead) return;
      if (!Number.isInteger(tab?.id)) throw new Error('No active tab.');
      cacheStatusTabId = tab.id;
      const status = await chrome.tabs.sendMessage(tab.id, { type: 'designer-ownership-status' });
      if (read === cacheStatusRead) renderOwnershipStatus(status);
    } catch (_error) {
      // A missing page connection is not proof that the environment has no cache.
      if (read !== cacheStatusRead) return;
      sharedFromCacheStatus.hidden = false;
      sharedFromCacheStatus.textContent = 'Status Unavailable';
    }
  }

  // Listen only to this extension's active top-level page, not another Designer tab.
  chrome.runtime.onMessage.addListener((message, sender) => {
    if (message?.type !== 'designer-ownership-status-changed' || sender.id !== chrome.runtime.id ||
        sender.tab?.id !== cacheStatusTabId || sender.frameId !== 0) return;
    // A current event must win over an older asynchronous opening-status response.
    cacheStatusRead += 1;
    renderOwnershipStatus(message);
  });

  // Save only valid initials; the worker updates the toolbar when storage changes.
  function saveIcon() {
    if (!/^[a-z]{1,2}$/i.test(iconLettersInput.value.trim())) {
      iconStatus.textContent = "Enter one or two letters (A–Z).";
      iconLettersInput.setAttribute("aria-invalid", "true");
      return;
    }
    const appearance = IconAppearance.normalize({ color: iconColorInput.value, letters: iconLettersInput.value, textColor: iconTextColorInput.value });
    iconLettersInput.value = appearance.letters;
    iconLettersInput.removeAttribute("aria-invalid");
    chrome.storage.local.set({ [IconAppearance.KEY]: appearance }, () => {
      // Report failures honestly and leave a visible confirmation after saving.
      iconStatus.textContent = chrome.runtime.lastError ? "Could not save. Please try again." : "Icon saved on this browser.";
    });
  }

  // Keep the preview live while committing only completed input changes.
  [iconColorInput, iconLettersInput].forEach((input) => {
    input.addEventListener("input", () => {
      iconStatus.textContent = "";
      iconLettersInput.removeAttribute("aria-invalid");
      previewIcon();
    });
    input.addEventListener("change", saveIcon);
  });

  // Preview and save the explicit white/black choice immediately.
  iconTextColorInput.addEventListener("change", () => {
    previewIcon();
    saveIcon();
  });

  // Restore the original artwork and initials without resetting any other settings.
  resetIconButton.addEventListener("click", () => {
    iconColorInput.value = IconAppearance.DEFAULT.color;
    iconLettersInput.value = IconAppearance.DEFAULT.letters;
    iconTextColorInput.value = IconAppearance.DEFAULT.textColor;
    previewIcon();
    saveIcon();
  });

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

  // Save sidebar changes without changing the Designer pipeline preference.
  searchModeSelect.addEventListener("change", () => {
    chrome.storage.local.set({ [SEARCH_MODE_KEY]: normalizeSearchMode(searchModeSelect.value) });
  });

  // Apply the selected-package search choice independently on open Designer pages.
  designerSearchModeSelect.addEventListener("change", () => {
    chrome.storage.local.set({ [DESIGNER_SEARCH_MODE_KEY]: normalizeSearchMode(designerSearchModeSelect.value) });
  });

  // Persist consent only after confirmation; the worker clears data when disabled.
  function saveSharedFrom(enabled) {
    sharedFromSwitch.disabled = true;
    // Distinguish saving consent from a setting that is simply unavailable.
    sharedFromSwitch.setAttribute('aria-busy', 'true');
    chrome.storage.local.set({ [SHARED_FROM_ENABLED_KEY]: enabled }, () => {
      const failed = Boolean(chrome.runtime.lastError);
      sharedFromSwitch.checked = failed ? !enabled : enabled;
      sharedFromSwitch.disabled = false;
      sharedFromSwitch.setAttribute('aria-busy', 'false');
      sharedFromStatus.textContent = failed ? "Could not save. Please try again." : enabled ? "Enabled. Visit Designer in each source environment." : "Disabled. Clearing source cache; favorites kept.";
      readOwnershipStatus();
    });
  }

  // Opening the confirmation must not enable collection or write any ownership data.
  sharedFromSwitch.addEventListener("change", () => {
    sharedFromStatus.textContent = "";
    sharedFromConfirmation.hidden = !sharedFromSwitch.checked;
    if (sharedFromSwitch.checked) {
      sharedFromSwitch.checked = false;
      document.querySelector("#confirm-shared-from").focus();
    } else saveSharedFrom(false);
  });

  // Make the explicit approval and cancellation equally accessible by keyboard.
  document.querySelector("#confirm-shared-from").addEventListener("click", () => {
    sharedFromConfirmation.hidden = true;
    saveSharedFrom(true);
    sharedFromSwitch.focus();
  });
  document.querySelector("#cancel-shared-from").addEventListener("click", () => {
    sharedFromConfirmation.hidden = true;
    sharedFromSwitch.checked = false;
    sharedFromSwitch.focus();
  });

  // Ask only the active tab to recollect its own Designer sources, without extra permissions.
  refreshSharedFromButton.addEventListener('click', async () => {
    if (!sharedFromSwitch.checked) {
      sharedFromStatus.textContent = 'Enable Shared From first.';
      return;
    }
    refreshSharedFromButton.disabled = true;
    // Show the CSS working circle until collection and persistence return a result.
    refreshSharedFromButton.setAttribute('aria-busy', 'true');
    sharedFromStatus.textContent = 'Refreshing Shared From data…';
    // Preserve other environment dates and existing failure feedback while this refresh is pending.
    if (!sharedFromCacheStatus.hidden) sharedFromCacheStatus.textContent = 'Caching…';
    try {
      // Read the active tab's identifier only; do not scan other tabs or their URLs.
      const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
      if (!Number.isInteger(tab?.id)) throw new Error('No active tab.');
      const result = await chrome.tabs.sendMessage(tab.id, { type: 'designer-ownership-refresh' });
      // Report completion only after the page confirms that the source cache was saved.
      const guidance = {
        disabled: 'Enable Shared From first.',
        'open-designer': 'Open Designer in the source environment, then try again.',
        'left-designer': 'Refresh stopped because you left Designer.',
        'not-ready': 'Designer is still loading. Try again shortly.',
        'extension-reloaded': 'Refresh this page after reloading the extension, then try again.',
        busy: 'A refresh is already running.',
        'lookup-failed': 'Designer sources did not respond. Refresh the page, then try again.',
        'document-unavailable': 'The Designer connection was lost. Refresh the page, then try again.',
        'storage-read': 'Could not read saved sources. Check the extension errors, then try again.',
        'storage-write': 'Could not save Designer sources. Check the extension errors, then try again.',
        'site-access': 'Allow extension access to this site, refresh Designer, then try again.',
        'incomplete-data': 'Designer source data is incomplete. Let it load, then try again.',
        'source-limit': 'Designer exceeds the supported source-data limit. Report this issue on GitHub.',
        'cache-full': 'Saved source data is full. Export it before clearing Shared From data.',
        'save-failed': 'Could not save Designer sources. Check the extension errors, then try again.',
      };
      sharedFromStatus.textContent = result?.ok === true ? 'Shared From data refreshed.'
        : guidance[result?.reason] || 'Could not refresh Shared From data. Please try again.';
    } catch (_error) {
      // Unsupported tabs and pages not refreshed after an extension reload have no receiver.
      sharedFromStatus.textContent = 'Open Designer on an enabled site, then try again. If already open, refresh that page once.';
    } finally {
      // Stop the working circle on success, failure, or a lost page connection.
      refreshSharedFromButton.disabled = false;
      refreshSharedFromButton.setAttribute('aria-busy', 'false');
      readOwnershipStatus();
    }
  });

  // Read a fresh snapshot on demand, without collecting data or changing opt-in.
  exportSharedFromButton.addEventListener("click", () => {
    exportSharedFromButton.disabled = true;
    // Expose the export's busy state without hiding its eventual error or setup guidance.
    exportSharedFromButton.setAttribute('aria-busy', 'true');
    sharedFromStatus.textContent = "";
    chrome.storage.local.get({ [OWNERSHIP_CACHE_KEY]: {} }, (settings) => {
      try {
        // Report failed reads instead of downloading an empty or misleading file.
        if (chrome.runtime.lastError) throw new Error("Cache read failed.");
        const cache = settings[OWNERSHIP_CACHE_KEY];
        // Export only the documented source fields, with human-readable timestamps.
        const environments = Object.entries(cache || {}).flatMap(([environmentId, entry]) => {
          const checkedAt = Number(entry?.checkedAt);
          if (typeof entry?.environment !== "string" || !Array.isArray(entry?.packages) || !Number.isFinite(checkedAt) || !Number.isFinite(new Date(checkedAt).getTime())) return [];
          // Export only grouped names, distinguishing preserved names whose package is still unknown.
          const packages = entry.packages.flatMap((group) => {
            if ((group?.name !== null && typeof group?.name !== 'string') || !Array.isArray(group?.pipelines)) return [];
            const names = group.pipelines.filter((name) => typeof name === 'string');
            return [group.name === null
              ? { name: 'Package Not Yet Recorded', packageNameRecorded: false, pipelines: names }
              : { name: group.name, pipelines: names }];
          });
          return [{ environmentId, environment: entry.environment, lastCheckedAt: new Date(checkedAt).toISOString(),
            packages }];
        });
        // Guide users to populate the cache before requesting another export.
        if (!environments.length) {
          sharedFromStatus.textContent = "No saved sources. Enable Shared From and visit Designer first.";
          return;
        }
        const exportedAt = new Date().toISOString();
        const snapshot = { extensionVersion: chrome.runtime.getManifest().version, exportedAt,
          note: "Observed Designer ownership, not live sharing history. This file is a snapshot and does not update automatically.", environments };
        // Use a local JSON download without new permissions or any network upload.
        const file = new Blob([JSON.stringify(snapshot, null, 2) + "\r\n"], { type: "application/json" });
        const url = URL.createObjectURL(file);
        const link = document.createElement("a");
        link.href = url;
        link.download = `integration-navigator-shared-from-${exportedAt.slice(0, 10)}.json`;
        document.body.appendChild(link);
        try {
          // Let the browser choose the destination using normal download preferences.
          link.click();
          sharedFromStatus.textContent = "Download requested. Exported files do not update automatically.";
        } finally {
          // Remove temporary controls and release the buffer after browser hand-off.
          link.remove();
          window.setTimeout(() => URL.revokeObjectURL(url), 1000);
        }
      } catch (_error) {
        sharedFromStatus.textContent = "Could not export. Please try again.";
      } finally {
        // Allow retries after an empty cache, cancelled download, or temporary failure.
        exportSharedFromButton.disabled = false;
        exportSharedFromButton.setAttribute('aria-busy', 'false');
      }
    });
  });

  // Read the installed manifest so the footer always shows the current version.
  versionLabel.textContent = `Version ${chrome.runtime.getManifest().version}`;
})();
