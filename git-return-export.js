(() => {
  'use strict';
  // Keep navigation independent of saved credentials and connection setup failures.
  const button = document.getElementById('git-return-export');
  const status = document.getElementById('git-return-status');
  button.addEventListener('click', async () => {
    // Suppress double clicks while resolving the original export document.
    button.disabled = true;
    try {
      // Inspect only this extension's export tabs, never unrelated browsing history.
      const base = chrome.runtime.getURL('pipeline-export.html');
      const current = await chrome.tabs.getCurrent();
      const tabs = (await chrome.tabs.query({ url: base + '*' }))
        .filter(tab => tab.url === base || tab.url?.startsWith(base + '#'));
      // Prefer the originating export; do not guess between multiple remaining sessions.
      const target = tabs.find(tab => tab.id === current?.openerTabId)
        || (tabs.length === 1 ? tabs[0] : null);
      if (!target) {
        status.textContent = tabs.length ? 'Multiple exports are open. Select the export tab you want to continue.'
          : 'No export is open. Open Integration Packages, then Settings → Export → Preview Pipeline Export.';
        return;
      }
      // Keep: activate without URL changes so selections and private prepared bytes survive.
      await chrome.tabs.update(target.id, { active: true });
      await chrome.windows.update(target.windowId, { focused: true });
      status.textContent = '';
    } catch {
      // A closed tab or browser failure must not affect the saved Git connection.
      status.textContent = 'Could not return to export. Select its existing browser tab or reopen export from settings.';
    } finally {
      // Permit retry after a missing or closed export without reloading connection settings.
      button.disabled = false;
    }
  });
})();
