(() => {
  "use strict";

  // Keep advanced consent in this settings document only, never in saved preferences.
  const button = document.querySelector('#export-pipelines');
  const advanced = document.querySelector('#export-advanced');
  const override = document.querySelector('#export-all-accessible');
  const status = document.querySelector('#pipeline-export-status');
  const availability = document.querySelector('#pipeline-export-availability');
  const sourceSwitch = document.querySelector('#shared-from-enabled');
  let opening = false;

  // Grey out only Pipeline Export on the wrong page; JSON backup/restore remains usable everywhere.
  function updateAvailability() {
    const packages = PopupTabs.page === 'packages';
    const consent = !sourceSwitch.disabled && sourceSwitch.checked;
    const allowed = packages && (consent || override.checked);
    button.disabled = opening || !allowed;
    document.querySelector('#pipeline-export-section').classList.toggle('is-unavailable', !allowed);
    availability.textContent = !packages ? 'Open Integration Packages to export pipelines.'
      : !consent && !override.checked ? 'Set up Shared From in Sharing before exporting.' : '';
    availability.hidden = allowed;
    document.querySelector('.export-setup-notice').hidden = consent || override.checked;
  }
  document.addEventListener('settings-context-changed', updateAvailability);
  document.addEventListener('settings-consent-changed', updateAvailability);
  sourceSwitch.addEventListener('change', updateAvailability);
  updateAvailability();

  // Reveal advanced export controls only while settings has focus and nobody is typing.
  document.addEventListener('keydown', (event) => {
    if (event.repeat || event.ctrlKey || event.altKey || event.metaKey || !event.shiftKey || event.key.toLowerCase() !== 'd') return;
    if (event.target instanceof Element && event.target.closest('input, textarea, select, [contenteditable="true"]')) return;
    event.preventDefault();
    advanced.hidden = false;
    PopupTabs.select('export');
  });

  // Revealing an option is not permission to include content absent from Designer observations.
  override.addEventListener('change', () => {
    if (override.checked && !window.confirm('Include all accessible published content in this export preview, including content not recorded in Designer? This does not grant additional service access. This temporary choice is not saved.')) override.checked = false;
    updateAvailability();
  });

  // Capture the original active page before opening the dedicated extension workflow.
  button.addEventListener('click', async () => {
    if (button.disabled || PopupTabs.page !== 'packages') return;
    opening = true;
    button.disabled = true;
    try {
      const response = await chrome.runtime.sendMessage({ type: 'pipeline-export-open', overrideConfirmed: override.checked });
      if (!response?.ok) throw new Error('open-failed');
      status.textContent = 'Export preview opened in a new tab.';
      override.checked = false;
    } catch {
      // Do not print service errors, URLs, names, or credentials into diagnostic logs.
      status.textContent = 'Could not open export preview. Refresh Integration Packages, then reopen settings.';
    } finally {
      opening = false;
      updateAvailability();
    }
  });

  // Closing settings never leaves a persistent override for the next workflow.
  window.addEventListener('pagehide', () => { override.checked = false; });
})();
