(() => {
  'use strict';
  // Open a trusted extension tab; never place a provider token or repository identifier in its URL.
  for (const [id, view] of [['manage-git', 'connections'], ['configure-export', 'configuration']]) document.getElementById(id).addEventListener('click', async () => {
    // Do not turn a second click during source binding into an unrelated standalone setup tab.
    if (globalThis.ExportLauncher?.busy) return;
    if (globalThis.FeatureTools) { try { await FeatureTools.requireExport(); } catch { return; } }
    // Recheck after the settings read in case another shortcut began binding while it was pending.
    if (globalThis.ExportLauncher?.busy) return;
    // Keep an eligible source attached; standalone setup never authorizes source reads.
    if (globalThis.ExportLauncher?.available()) { await ExportLauncher.open(view); return; }
    try {
      await chrome.tabs.create({ url: chrome.runtime.getURL('git-connection.html') + (view === 'configuration' ? '#locations' : '') });
    } catch {
      document.getElementById('pipeline-export-status').textContent = 'Could not open workspace setup. Reopen settings and retry.';
    }
  });
})();
