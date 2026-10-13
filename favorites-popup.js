(() => {
  'use strict';
  const data = FavoritesData;
  const status = document.querySelector('#backup-status');
  const fileInput = document.querySelector('#backup-file');
  const preview = document.querySelector('#backup-preview');
  const sourceSwitch = document.querySelector('#backup-sources');
  const importButton = document.querySelector('#confirm-backup');
  const assignButton = document.querySelector('#assign-favorites');
  let pendingBackup = null;
  let activeTabId = null;
  let activeScope = null;
  let assignmentRead = 0;

  // Offer assignment only for a loaded current tenant; old lists remain in their original storage.
  async function readLegacyAssignment() {
    const sequence = ++assignmentRead;
    document.querySelector('#legacy-favorites').hidden = true;
    activeScope = null;
    try {
      const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
      if (!Number.isInteger(tab?.id)) return;
      const context = await chrome.tabs.sendMessage(tab.id, { type: 'favorites-context' });
      if (sequence !== assignmentRead) return;
      if (!context?.loaded) {
        // Do not replace a confirmed import/export result with unrelated assignment guidance.
        if (!status.textContent) status.textContent = 'Open a loaded Integration page to assign old favorites.';
        return;
      }
      const scope = data.scope(context.scope);
      const settings = await chrome.storage.local.get(data.defaults);
      // Ignore a previous read if the disclosure was reopened on a different active page.
      if (sequence !== assignmentRead) return;
      activeScope = scope;
      activeTabId = tab.id;
      const oldKey = data.legacyKey(scope);
      const oldItems = settings[data.LEGACY]?.[oldKey];
      if (!Array.isArray(oldItems) || !oldItems.length || settings[data.ASSIGNED]?.[oldKey]) return;
      document.querySelector('#legacy-summary').textContent = `Old ${activeScope.page === 'designer' ? 'Designer' : 'Packages'} favorites have no tenant ID. Assign ${oldItems.length} package groups to tenant ${activeScope.tenantId} on ${activeScope.site}? The old copy is kept.`;
      document.querySelector('#legacy-favorites').hidden = false;
      document.querySelector('.backup-card').open = true;
    } catch (_error) {
      // Unsupported tabs need no warning; imports and exports still work from settings.
    }
  }
  assignButton.addEventListener('click', async () => {
    if (!activeScope) return;
    assignButton.disabled = true;
    try {
      const result = await chrome.runtime.sendMessage({ type: 'favorites-assign', tabId: activeTabId, scope: activeScope });
      if (!result?.ok) throw new Error(result?.error || 'Could not assign favorites.');
      status.textContent = 'Old favorites assigned. Their original copy is preserved.';
      await readLegacyAssignment();
    } catch (error) { status.textContent = error.message || 'Refresh the Integration page and try again.'; }
    finally { assignButton.disabled = false; }
  });

  // Read a chosen local file only; reject excessive files before parsing or showing a preview.
  document.querySelector('#import-favorites').addEventListener('click', () => fileInput.click());
  fileInput.addEventListener('change', async () => {
    pendingBackup = null;
    preview.hidden = true;
    try {
      const file = fileInput.files?.[0];
      if (!file) return;
      if (file.size > 4000000) throw new Error('Choose a backup smaller than 4 MB.');
      pendingBackup = data.backup(JSON.parse(await file.text()));
      const groups = pendingBackup.favorites;
      const labels = groups.map((group) => `${group.site} · ${group.tenantId} · ${group.page} (${group.packages.length} packages)`);
      document.querySelector('#backup-summary').textContent = `${groups.length} tenant lists, ${pendingBackup.unassignedFavorites.length} retained old lists, ${pendingBackup.environments.length} source environments. ${labels.join('; ')}`;
      document.querySelector('#backup-mode').value = 'merge';
      sourceSwitch.checked = false;
      sourceSwitch.disabled = !pendingBackup.environments.length;
      preview.hidden = false;
      status.textContent = 'Review the tenant lists before importing. Older recovery copies will not replace current tenant lists.';
    } catch (error) { status.textContent = error.message || 'Could not read this backup.'; }
    finally { fileInput.value = ''; }
  });
  document.querySelector('#cancel-backup').addEventListener('click', () => { pendingBackup = null; preview.hidden = true; status.textContent = ''; });
  importButton.addEventListener('click', async () => {
    if (!pendingBackup) return;
    const mode = document.querySelector('#backup-mode').value;
    // Require a separate explicit confirmation before removing pins from matching tenant lists.
    if (mode === 'replace' && !window.confirm('Replace favorites only for the site/tenant/page lists in this backup? Existing pins in those lists will be replaced. Other lists are untouched.')) return;
    importButton.disabled = true;
    importButton.setAttribute('aria-busy', 'true');
    try {
      const result = await chrome.runtime.sendMessage({ type: 'favorites-import', backup: pendingBackup, mode, restoreSources: sourceSwitch.checked });
      if (!result?.ok) throw new Error(result?.error || 'Could not restore this backup.');
      status.textContent = 'Backup imported. Tenant lists stay separate; source dates are unchanged.';
      pendingBackup = null;
      preview.hidden = true;
      await readLegacyAssignment();
    } catch (error) { status.textContent = error.message || 'Could not import. Please try again.'; }
    finally { importButton.disabled = false; importButton.setAttribute('aria-busy', 'false'); }
  });
  // Recheck when opening the disclosure after the active page has finished loading.
  document.querySelector('.backup-card').addEventListener('toggle', () => {
    if (document.querySelector('.backup-card').open) readLegacyAssignment();
  });
  readLegacyAssignment();
})();
