(() => {
  'use strict';
  // Open a trusted extension tab; never place a provider token or repository identifier in its URL.
  document.getElementById('manage-git').addEventListener('click', async () => {
    if (globalThis.FeatureTools) { try { await FeatureTools.requireExport(); } catch { return; } }
    chrome.tabs.create({ url: chrome.runtime.getURL('git-connection.html') }).catch(() => {
      document.getElementById('pipeline-export-status').textContent = 'Could not open Git Connection. Reopen settings and retry.';
    });
  });
})();
