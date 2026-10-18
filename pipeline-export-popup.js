(() => {
  "use strict";

  // Keep advanced consent in this settings document only, never in saved preferences.
  const button = document.querySelector('#export-pipelines');
  const advanced = document.querySelector('#export-advanced');
  const override = document.querySelector('#export-all-accessible');
  const status = document.querySelector('#pipeline-export-status');
  const availability = document.querySelector('#pipeline-export-availability');
  const sourceSwitch = document.querySelector('#shared-from-enabled');
  const source = document.querySelector('#export-source');
  const mode = document.querySelector('#export-version-mode');
  let reveal = 0;
  let opening = false;

  // Grey out only Pipeline Export on the wrong page; JSON backup/restore remains usable everywhere.
  function updateAvailability() {
    // Presentation follows the chosen source; worker/document checks remain authoritative.
    const kind = source.value;
    const packages = kind === 'packages';
    const tools = !globalThis.FeatureTools || FeatureTools.state.export;
    const allowed = tools && PopupTabs.page === kind && (!packages || reveal > 0 && override.checked);
    button.disabled = opening || !allowed;
    document.querySelector('#pipeline-export-section').classList.toggle('is-unavailable', !allowed);
    availability.textContent = PopupTabs.page !== kind ? `Open ${kind === 'api-designer' ? 'API Designer' : packages ? 'Integration Packages' : 'Integration Designer'} to export.`
      : !tools ? 'Enable Export Tools in General.' : packages && !override.checked ? 'Press Shift+D to confirm Packages export.' : '';
    availability.hidden = !tools || allowed;
    document.querySelector('.export-setup-notice').hidden = true;
    document.querySelector('#export-mode-field').hidden = kind !== 'designer';
    document.querySelector('#export-source-description').textContent = kind === 'api-designer' ? 'Published APIs, each major version.' : packages ? 'All accessible published package definitions.' : 'Drafts and published definitions.';
  }
  document.addEventListener('settings-context-changed', updateAvailability);
  document.addEventListener('settings-consent-changed', updateAvailability);
  sourceSwitch.addEventListener('change', updateAvailability);
  source.addEventListener('change', () => {
    override.checked = false;
    if (source.value === 'packages') {
      override.checked = window.confirm('Include all accessible published packages, including Ellucian content? This temporary choice does not grant service access.');
      if (!override.checked) source.value = 'designer';
    }
    updateAvailability();
  });
  document.addEventListener('settings-tools-changed', updateAvailability);
  globalThis.FeatureTools?.subscribe(state => { if (!state.export) override.checked = false; updateAvailability(); });
  // Select API Designer automatically only when its native page has positively answered the route query.
  document.addEventListener('settings-context-changed', () => { if (PopupTabs.page === 'api-designer') source.value = 'api-designer'; updateAvailability(); });
  updateAvailability();

  // Reveal advanced export controls only while settings has focus and nobody is typing.
  document.addEventListener('keydown', (event) => {
    if (event.repeat || event.ctrlKey || event.altKey || event.metaKey || !event.shiftKey || event.key.toLowerCase() !== 'd') return;
    if (event.target instanceof Element && event.target.closest('input, textarea, select, [contenteditable="true"]')) return;
    event.preventDefault();
    if (globalThis.FeatureTools && !FeatureTools.state.export) return;
    PopupTabs.select('export');
    // One shortcut confirms/reveals all Packages; keep explicit consent rather than silently broadening access.
    if (window.confirm('Include all accessible published packages, including Ellucian content? This temporary choice does not grant service access.')) {
      reveal = 1;
      document.querySelector('#export-packages-option').hidden = false;
      document.querySelector('#export-packages-option').disabled = false;
      source.value = 'packages'; override.checked = true;
      status.textContent = 'Integration Packages is available for this export.';
    }
    updateAvailability();
  });

  // Revealing an option is not permission to include content absent from Designer observations.
  override.addEventListener('change', () => {
    if (override.checked && !window.confirm('Include all accessible published content in this export preview, including content not recorded in Designer? This does not grant additional service access. This temporary choice is not saved.')) override.checked = false;
    updateAvailability();
  });

  // Capture the original active page before opening the dedicated extension workflow.
  button.addEventListener('click', async () => {
    if (button.disabled || PopupTabs.page !== source.value) return;
    opening = true;
    button.disabled = true;
    try {
      const response = await chrome.runtime.sendMessage({ type: 'pipeline-export-open', sourceKind:source.value, exportMode:mode.value,
        packagesRevealed:reveal > 0, overrideConfirmed:source.value === 'packages' && override.checked });
      if (!response?.ok) throw new Error('open-failed');
      status.textContent = 'Export preview opened in a new tab.';
      override.checked = false;
    } catch {
      // Do not print service errors, URLs, names, or credentials into diagnostic logs.
      status.textContent = 'Could not open export preview. Refresh the source page, then reopen settings.';
    } finally {
      opening = false;
      updateAvailability();
    }
  });

  // Closing settings never leaves a persistent override for the next workflow.
  window.addEventListener('pagehide', () => { override.checked = false; });
})();
