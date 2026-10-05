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

  // Locate the popup controls after the static popup document loads.
  const rememberWidthSwitch = document.querySelector("#remember-width");
  const favoritesEnabledSwitch = document.querySelector("#favorites-enabled");
  const sharedVersionSwitch = document.querySelector("#shared-version-enabled");
  const versionLabel = document.querySelector("#extension-version");
  const iconColorInput = document.querySelector("#icon-color");
  const iconLettersInput = document.querySelector("#icon-letters");
  const iconTextColorInput = document.querySelector("#icon-text-color");
  const resetIconButton = document.querySelector("#reset-icon");
  const iconPreview = document.querySelector(".header-icon");
  const iconStatus = document.querySelector("#icon-status");
  const favoriteColorInput = document.querySelector("#favorite-color");
  const favoriteMatchSwitch = document.querySelector("#favorite-match-icon");
  const favoritePreview = document.querySelector("#favorite-color-preview");
  const favoriteStatus = document.querySelector("#favorite-color-status");
  const resetFavoriteButton = document.querySelector("#reset-favorite-color");
  let appearanceLoaded = false;
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
  favoriteMatchSwitch.disabled = true;
  resetFavoriteButton.disabled = true;

  // Load every popup preference in one storage read to avoid redundant startup work.
  chrome.storage.local.get(
    {
      [REMEMBER_WIDTH_KEY]: false,
      [FAVORITES_ENABLED_KEY]: true,
      [SHARED_VERSION_ENABLED_KEY]: false,
      [SEARCH_MODE_KEY]: DEFAULT_SEARCH_MODE,
      [DESIGNER_SEARCH_MODE_KEY]: DEFAULT_SEARCH_MODE,
      [IconAppearance.KEY]: IconAppearance.DEFAULT,
      [FavoriteAppearance.KEY]: FavoriteAppearance.DEFAULT,
    },
    (settings) => {
      // Display the width preference and its explanatory status.
      rememberWidthSwitch.checked = Boolean(settings[REMEMBER_WIDTH_KEY]);
      sharedVersionSwitch.checked = settings[SHARED_VERSION_ENABLED_KEY] === true;

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
      favoriteColorInput.value = stars.color;
      favoriteMatchSwitch.checked = stars.matchIcon;
      appearanceLoaded = true;
      previewIcon();
      iconColorInput.disabled = false;
      iconLettersInput.disabled = false;
      iconTextColorInput.disabled = false;
      resetIconButton.disabled = false;
      favoriteMatchSwitch.disabled = false;
      resetFavoriteButton.disabled = false;
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
    favoritePreview.style.color = FavoriteAppearance.resolve(
      { color: favoriteColorInput.value, matchIcon: favoriteMatchSwitch.checked },
      { color: iconColorInput.value },
    );
    favoriteColorInput.disabled = !appearanceLoaded || favoriteMatchSwitch.checked;
  }

  // Save only the star preference; color changes never alter favorites or icon settings.
  function saveFavoriteColor() {
    const appearance = FavoriteAppearance.normalize({ color: favoriteColorInput.value, matchIcon: favoriteMatchSwitch.checked });
    chrome.storage.local.set({ [FavoriteAppearance.KEY]: appearance }, () => {
      favoriteStatus.textContent = chrome.runtime.lastError ? "Could not save. Please try again." : "Star color saved on this browser.";
    });
  }

  // Preview the picker live, committing after the completed color change.
  favoriteColorInput.addEventListener("input", () => {
    favoriteStatus.textContent = "";
    previewFavoriteColor();
  });
  favoriteColorInput.addEventListener("change", saveFavoriteColor);
  favoriteMatchSwitch.addEventListener("change", () => {
    previewFavoriteColor();
    saveFavoriteColor();
  });

  // Reset stars to independent purple without changing the toolbar icon.
  resetFavoriteButton.addEventListener("click", () => {
    favoriteColorInput.value = FavoriteAppearance.DEFAULT.color;
    favoriteMatchSwitch.checked = FavoriteAppearance.DEFAULT.matchIcon;
    previewFavoriteColor();
    saveFavoriteColor();
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

  // Read the installed manifest so the footer always shows the current version.
  versionLabel.textContent = `Version ${chrome.runtime.getManifest().version}`;
})();
