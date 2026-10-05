(() => {
  "use strict";

  // Keep optional site management separate from existing navigation preferences.
  const form = document.querySelector("#custom-site-form");
  const input = document.querySelector("#custom-site-url");
  const list = document.querySelector("#custom-site-list");
  const status = document.querySelector("#custom-site-status");
  const card = document.querySelector(".custom-sites-card");
  let busy = false;

  // Prevent overlapping permission requests and storage writes in this popup.
  function setBusy(value) {
    busy = value;
    card.querySelectorAll("input, button").forEach((control) => { control.disabled = value; });
  }

  // Wait for the worker to activate the latest list before reporting success.
  async function syncSites() {
    const result = await chrome.runtime.sendMessage({ type: CustomSites.MESSAGE });
    if (!result?.ok) throw new Error("Could not activate custom sites. Reopen settings to retry.");
  }

  // Show exact domains and a restore-access action when browser permissions were revoked.
  async function renderSites() {
    const saved = await chrome.storage.local.get({ [CustomSites.KEY]: [] });
    const origins = CustomSites.normalizeList(saved[CustomSites.KEY]);
    const rows = [];
    for (const origin of origins) {
      const allowed = await chrome.permissions.contains({ permissions: ["scripting"], origins: [CustomSites.pattern(origin)] });
      const row = document.createElement("li");
      const label = document.createElement("span");
      label.textContent = origin;
      label.title = origin;
      row.append(label);

      // Permission approval always comes from an explicit user click, never page content.
      if (!allowed) {
        const allow = document.createElement("button");
        allow.type = "button";
        allow.textContent = "Allow";
        allow.setAttribute("aria-label", `Allow access to ${origin}`);
        allow.addEventListener("click", () => addSite(origin));
        row.append(allow);
      }

      // Remove access without deleting favorites or widths saved under this domain.
      const remove = document.createElement("button");
      remove.type = "button";
      remove.textContent = "Remove";
      remove.setAttribute("aria-label", `Remove ${origin}`);
      remove.addEventListener("click", () => removeSite(origin));
      row.append(remove);
      rows.push(row);
    }
    list.replaceChildren(...rows);
  }

  // Normalize a pasted page URL before requesting the exact HTTPS host permission.
  async function addSite(value) {
    if (busy) return;
    let origin;
    try {
      origin = CustomSites.normalize(value);
      if (CustomSites.defaults().includes(origin)) throw new Error("This standard Experience site is already enabled.");
    } catch (error) {
      status.textContent = error.message;
      return;
    }
    setBusy(true);
    status.textContent = "";
    try {
      // Call immediately inside the click/submit gesture, before awaiting any storage reads.
      const granted = await chrome.permissions.request({ permissions: ["scripting"], origins: [CustomSites.pattern(origin)] });
      if (!granted) {
        status.textContent = "Access was not granted. No site was added.";
        return;
      }

      // Merge against current storage rather than the list shown when the popup opened.
      const saved = await chrome.storage.local.get({ [CustomSites.KEY]: [] });
      const origins = CustomSites.normalizeList([...CustomSites.normalizeList(saved[CustomSites.KEY]), origin]);
      await chrome.storage.local.set({ [CustomSites.KEY]: origins });
      await syncSites();
      input.value = "";
      status.textContent = "Site enabled. Refresh your Experience page to load the extension.";
    } catch (error) {
      status.textContent = error.message || "Could not add this site. Please try again.";
    } finally {
      await refreshList();
    }
  }

  // Revoke this domain only; standard sites and other custom domains are unaffected.
  async function removeSite(origin) {
    if (busy) return;
    setBusy(true);
    try {
      await chrome.permissions.remove({ origins: [CustomSites.pattern(origin)] });
      const saved = await chrome.storage.local.get({ [CustomSites.KEY]: [] });
      await chrome.storage.local.set({ [CustomSites.KEY]: CustomSites.normalizeList(saved[CustomSites.KEY]).filter((site) => site !== origin) });
      await syncSites();
      status.textContent = "Site removed. Refresh any open page to clear the extension's existing controls.";
    } catch (error) {
      status.textContent = error.message || "Could not remove this site. Please try again.";
    } finally {
      await refreshList();
    }
  }

  // Leave the list usable after API failures and report initialization problems visibly.
  async function refreshList() {
    try { await renderSites(); }
    catch { status.textContent = "Could not load custom sites. Reopen settings to retry."; }
    finally { setBusy(false); }
  }

  // Support both the Add button and Enter while retaining the permission-request gesture.
  form.addEventListener("submit", (event) => {
    event.preventDefault();
    addSite(input.value);
  });
  setBusy(true);
  refreshList();
})();
