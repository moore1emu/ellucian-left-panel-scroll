(() => {
  'use strict';
  const navigation = document.querySelector('#navigation-tools-enabled');
  const exports = document.querySelector('#export-tools-enabled');
  const status = document.querySelector('#feature-tools-status');
  let saving = false;

  // Hide Navigation-owned tasks while keeping shared setup and backup/restore accessible.
  function render(state) {
    for (const task of ['navigation','sharing','appearance']) document.querySelector('#tab-'+task).hidden = !state.navigation;
    // An external change must not leave an invisible selected tab or its panel active.
    if (document.querySelector('.settings-tabs [aria-selected="true"]')?.hidden) PopupTabs.select('general',true);
    for (const node of document.querySelectorAll('#panel-navigation .navigation-group, .favorite-appearance-controls')) node.hidden = !state.navigation;
    document.querySelector('#navigation-tools-notice').hidden = state.navigation;
    document.querySelector('.pipeline-export-section').hidden = !state.export;
    document.querySelector('.git-connection-section').hidden = !state.export;
    document.querySelector('#export-tools-notice').hidden = state.export;
    const sharedTo = document.querySelector('label[for="shared-version-enabled"]');
    sharedTo.hidden = !state.navigation;
    document.querySelector('#shared-to-status').hidden = !state.navigation;
    // Sharing columns/cache belong to Navigation; exporting no longer requires Shared From.
    document.querySelector('#panel-sharing').inert = !state.navigation;
    navigation.checked = state.navigation;
    exports.checked = state.export;
    document.dispatchEvent(new Event('settings-tools-changed'));
  }
  FeatureTools.subscribe(render);
  FeatureTools.ready.then(value => {
    if (!value) { status.textContent = 'Could not load tools. Reopen settings.'; return; }
    navigation.disabled = false; exports.disabled = false;
  });

  // Save just the clicked group; a failed write restores confirmed values without touching user data.
  for (const [input,key] of [[navigation,'navigationToolsEnabled'],[exports,'exportToolsEnabled']]) input.addEventListener('change', async () => {
    if (saving) return;
    saving = true; navigation.disabled = true; exports.disabled = true;
    try { await chrome.storage.local.set({ [key]:input.checked }); render(await FeatureTools.read()); status.textContent = ''; }
    catch { render(FeatureTools.state); status.textContent = 'Could not save. Please try again.'; }
    finally { saving = false; navigation.disabled = false; exports.disabled = false; }
  });
})();
