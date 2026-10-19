(() => {
  "use strict";

  // Keep advanced consent in this settings document only, never in saved preferences.
  const button = document.querySelector('#export-pipelines');
  const status = document.querySelector('#pipeline-export-status');
  const availability = document.querySelector('#pipeline-export-availability');
  let packagesConfirmed = false;
  let opening = false;
  // Explain the hidden source and config entry together, without persisting or broadening native access.
  const packagesNotice='Add IntegrationPackages to export and Advanced configuration, including all accessible published packages and Ellucian content? Save Locations to keep path changes. This temporary choice does not grant service access.';

  // Grey out only Pipeline Export on the wrong page; JSON backup/restore remains usable everywhere.
  function updateAvailability() {
    // Presentation follows the chosen source; worker/document checks remain authoritative.
    const kind = PopupTabs.page;
    const packages = kind === 'packages';
    const tools = !globalThis.FeatureTools || FeatureTools.state.export;
    const allowed = tools && ['designer', 'api-designer', 'packages'].includes(kind) && (!packages || packagesConfirmed);
    button.disabled = opening || !allowed;
    document.querySelector('#pipeline-export-section').classList.toggle('is-unavailable', !allowed);
    // Keep: ordinary settings never advertise the hidden Packages source or shortcut (3.1.5).
    availability.textContent = !tools ? 'Enable Export Tools in General.' : allowed ? '' : 'Open Integration Designer or API Designer to enable Preview & Export.';
    availability.hidden = !tools || allowed;
    // Report presentation availability only; worker/document checks remain authoritative.
    return allowed;
  }
  document.addEventListener('settings-context-changed', updateAvailability);
  document.addEventListener('settings-tools-changed', updateAvailability);
  globalThis.FeatureTools?.subscribe(state => { if (!state.export) packagesConfirmed = false; updateAvailability(); });
  updateAvailability();

  // Reveal advanced export controls only while settings has focus and nobody is typing.
  document.addEventListener('keydown', (event) => {
    if (event.repeat || event.ctrlKey || event.altKey || event.metaKey || !event.shiftKey || event.key.toLowerCase() !== 'd') return;
    if (event.target instanceof Element && event.target.closest('input, textarea, select, [contenteditable="true"]')) return;
    event.preventDefault();
    if (globalThis.FeatureTools && !FeatureTools.state.export) return;
    PopupTabs.select('export');
    // One shortcut confirms/reveals all Packages; keep explicit consent rather than silently broadening access.
    if (window.confirm(packagesNotice)) {
      packagesConfirmed = true;
      status.textContent = 'Integration Packages is available for this export.';
    }
    updateAvailability();
  });

  // Capture the original active page before opening the dedicated extension workflow.
  async function open(view = 'export') {
    if (opening || !updateAvailability() || !['export', 'connections', 'configuration'].includes(view)) return;
    const kind = PopupTabs.page;
    opening = true;
    button.disabled = true;
    try {
      // Designer launches both states; the reviewed workspace configuration narrows them without reopening.
      const response = await chrome.runtime.sendMessage({ type: 'pipeline-export-open', sourceKind:kind, exportMode:kind === 'designer' ? 'both' : 'published',
        initialView:view, packagesRevealed:packagesConfirmed, overrideConfirmed:kind === 'packages' && packagesConfirmed });
      if (!response?.ok) throw new Error('open-failed');
      status.textContent = 'Preview & Export opened in a new tab.';
      packagesConfirmed = false;
    } catch {
      // Do not print service errors, URLs, names, or credentials into diagnostic logs.
      status.textContent = 'Could not open Preview & Export. Refresh the source page, then reopen settings.';
    } finally {
      opening = false;
      updateAvailability();
    }
  }
  button.addEventListener('click', () => open());
  // Setup shortcuts reuse a valid source grant when available, never fabricate one on unrelated pages.
  globalThis.ExportLauncher = Object.freeze({ open, available: () => !opening && updateAvailability(), get busy() { return opening; } });

  // Closing settings never leaves a persistent override for the next workflow.
  window.addEventListener('pagehide', () => { packagesConfirmed = false; });
})();
