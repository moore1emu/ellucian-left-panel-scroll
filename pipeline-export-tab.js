(() => {
  "use strict";

  // Source code is requested only after the user's explicit Download ZIP action.
  const DOWNLOADS_READY = true;
  const status = document.querySelector('#export-status');
  const counts = document.querySelector('#export-counts');
  const packages = document.querySelector('#export-packages');
  const selection = document.querySelector('#export-selection');
  const selectAll = document.querySelector('#select-all');
  const refresh = document.querySelector('#refresh-preview');
  const download = document.querySelector('#download-zip');
  const cancel = document.querySelector('#cancel-export');
  const progress = document.querySelector('#export-progress');
  const save = document.querySelector('#save-zip');
  let launch = null;
  let plan = null;
  let generation = 0;
  const selected = new Set();
  const groups = new Map();
  let controller = null;
  let objectUrl = null;

  // A changed selection or new download must not leave a Save link pointing to an older archive.
  function discardZip() {
    if (objectUrl) URL.revokeObjectURL(objectUrl);
    objectUrl = null;
    save.hidden = true;
    save.removeAttribute('href');
  }

  // Clear only temporary output and selection, leaving favorites/source observations untouched.
  function discard() {
    discardZip();
    plan = null;
    selected.clear();
    groups.clear();
    selection.hidden = true;
    selection.disabled = true;
    packages.replaceChildren();
    counts.textContent = '';
    download.disabled = true;
  }

  // Checkbox choices only narrow the authorized plan; hidden/collapsed rows never remove eligible records.
  function selectedEntries() {
    return (plan?.entries || []).filter((entry, index) => selected.has(index));
  }

  // Revoke an already-created ZIP when its selection changes instead of leaving a misleading Save link.
  function updateSelection(changed = false) {
    if (changed) discardZip();
    let selectedPackages = 0;
    for (const group of groups.values()) {
      const count = group.items.reduce((total, item) => total + Number(selected.has(item.index)), 0);
      if (count) selectedPackages += 1;
      group.checkbox.checked = count === group.items.length;
      group.checkbox.indeterminate = count > 0 && count < group.items.length;
      group.count.textContent = `${count} of ${group.items.length} selected`;
      for (const item of group.items) if (item.checkbox) item.checkbox.checked = selected.has(item.index);
    }
    selectAll.checked = selected.size === plan.entries.length;
    selectAll.indeterminate = selected.size > 0 && selected.size < plan.entries.length;
    counts.textContent = `${selectedPackages} of ${groups.size} packages · ${selected.size} of ${plan.entries.length} files selected · ${plan.skipped} unrecorded records in inspected packages skipped`;
    download.disabled = !DOWNLOADS_READY || !selected.size || Boolean(controller);
    if (changed) status.textContent = selected.size ? 'Selection updated. Select Download ZIP to retrieve checked records.' : 'No files selected. Check a package or file to download.';
  }

  // Create all rows of an expanded package once; no Show More cap can hide records within it.
  function expandGroup(group) {
    if (group.built || !group.details.open) return;
    group.built = true;
    const wrapper = document.createElement('div');
    wrapper.className = 'pipeline-list';
    const table = document.createElement('table');
    const head = table.createTHead().insertRow();
    for (const label of ['Select', 'Name', 'Type', 'Version']) {
      const cell = document.createElement('th'); cell.scope = 'col'; cell.textContent = label; head.append(cell);
    }
    const body = table.createTBody();
    for (const item of group.items) {
      const row = body.insertRow();
      const checkbox = document.createElement('input'); checkbox.type = 'checkbox';
      checkbox.className = 'pipeline-checkbox';
      checkbox.setAttribute('aria-label', `Select ${item.entry.type === 'transformer' ? 'Transformer' : 'Pipeline'}: ${item.entry.name} (${item.entry.type}, ${item.entry.version})`);
      checkbox.checked = selected.has(item.index);
      item.checkbox = checkbox;
      row.insertCell().append(checkbox);
      for (const value of [item.entry.name, item.entry.type === 'transformer' ? 'Transformer' : item.entry.type === 'api' ? 'API' : item.entry.type === 'sub-pipeline' ? 'Sub-Pipeline' : 'Integration', item.entry.version.replace(/^v/u, '')]) row.insertCell().textContent = value;
      checkbox.addEventListener('change', () => { if (checkbox.checked) selected.add(item.index); else selected.delete(item.index); updateSelection(true); });
    }
    wrapper.append(table);
    group.details.append(wrapper);
  }

  // List every package immediately, with lazy pipeline rendering and native keyboard-accessible disclosure.
  function renderPackages() {
    plan.entries.forEach((entry, index) => {
      if (!groups.has(entry.packageName)) groups.set(entry.packageName, { items: [], built: false });
      groups.get(entry.packageName).items.push({ entry, index });
      selected.add(index);
    });
    const fragment = document.createDocumentFragment();
    for (const [name, group] of groups) {
      const details = document.createElement('details'); details.className = 'export-package';
      const summary = document.createElement('summary');
      const checkbox = document.createElement('input'); checkbox.type = 'checkbox'; checkbox.className = 'package-checkbox';
      checkbox.setAttribute('aria-label', `Select Package: ${name}`);
      const label = document.createElement('span'); label.className = 'package-name'; label.textContent = name;
      const count = document.createElement('span'); count.className = 'package-count';
      Object.assign(group, { details, checkbox, count });
      checkbox.addEventListener('click', (event) => event.stopPropagation());
      checkbox.addEventListener('change', () => {
        for (const item of group.items) { if (checkbox.checked) selected.add(item.index); else selected.delete(item.index); }
        updateSelection(true);
      });
      details.addEventListener('toggle', () => expandGroup(group));
      summary.append(checkbox, label, count); details.append(summary); fragment.append(details);
    }
    packages.append(fragment);
    selection.hidden = !plan.entries.length;
    selection.disabled = false;
    updateSelection();
  }

  // Refresh preview metadata only, never source code or ownership observations.
  async function preview() {
    const current = ++generation;
    discard();
    refresh.disabled = true;
    progress.hidden = false;
    progress.removeAttribute('value');
    status.textContent = 'Preparing preview…';
    try {
      if (!launch) {
        launch = await chrome.runtime.sendMessage({ type: 'pipeline-export-claim', ticket: location.hash.slice(1) });
        if (!launch?.ok) { launch = null; throw new Error('Preview expired. Reopen export from settings.'); }
      }
      // Require saved consent/setup before even requesting the page's existing metadata.
      const saved = await chrome.storage.local.get({ sharedFromEnabled: false, designerOwnershipCache: {} });
      if (current !== generation) return;
      const options = { sharedFromEnabled: saved.sharedFromEnabled === true, overrideConfirmed: launch.overrideConfirmed };
      PipelineExportCore.buildPlan([], saved.designerOwnershipCache, options);
      // The worker derives the original source and consent from this created document's claimed grant.
      const result = await chrome.runtime.sendMessage({ type: 'pipeline-export-relay', operation: 'preview', overrideConfirmed: launch.overrideConfirmed });
      if (current !== generation) return;
      if (!result?.ok) throw new Error(result?.reason === 'session-unavailable' ? 'Temporary export storage is unavailable. Reload the extension, refresh Packages, and reopen export.' : result?.reason === 'preview-expired' ? 'Preview expired. Reopen export from settings.' : result?.reason === 'context-changed' ? 'Source page changed. Reopen export from settings.' : result?.reason === 'open-packages' ? 'Open Integration Packages, then reopen export from settings.' : result?.reason === 'requests-stalled' ? 'Earlier service requests are still running. Wait, then refresh preview.' : 'Package metadata is unavailable. Refresh the original page, then reopen export from settings.');
      // Default exact-name eligibility is computed in the extension, not in untrusted page code.
      plan = { ...result.plan, context: result.context };
      document.querySelector('#export-mode').textContent = launch.overrideConfirmed ? 'Temporary advanced mode: all accessible content. No additional permissions are granted.' : 'Designer-recorded content only. Saved source observations may be stale.';
      renderPackages();
      download.disabled = !DOWNLOADS_READY || !plan.entries.length;
      status.textContent = plan.entries.length ? 'Preview ready. Select Download ZIP to retrieve these published records.' : 'No eligible published files found. Refresh Shared From in the source Designer first.';
    } catch (error) {
      if (current === generation) {
        // Display only our fixed validation messages, never arbitrary native service exceptions.
        const safe = new Set(['Temporary export storage is unavailable. Reload the extension, refresh Packages, and reopen export.', 'Preview expired. Reopen export from settings.', 'Source page changed. Reopen export from settings.', 'Open Integration Packages, then reopen export from settings.', 'Earlier service requests are still running. Wait, then refresh preview.', 'Package metadata is unavailable. Refresh the original page, then reopen export from settings.', 'Enable Shared From first.', 'Visit Designer in each source environment first.', 'Incomplete package metadata.', 'Unsupported published version.', 'Too many export files.']);
        status.textContent = safe.has(error.message) ? error.message : 'Could not prepare preview. Refresh the original Packages page and retry.';
        discard();
      }
    } finally {
      if (current === generation) { refresh.disabled = false; progress.hidden = true; }
    }
  }

  // Keep source download separate from metadata preview and backup/import actions.
  download.addEventListener('click', async () => {
    if (!DOWNLOADS_READY || !selected.size || controller) return;
    const snapshot = { ...plan, entries: selectedEntries() };
    const current = ++generation;
    discardZip();
    controller = new AbortController();
    download.disabled = true;
    refresh.disabled = true;
    selection.disabled = true;
    progress.hidden = false;
    progress.max = snapshot.entries.length;
    progress.value = 0;
    const verify = async () => {
      const result = await chrome.runtime.sendMessage({ type: 'pipeline-export-relay', operation: 'verify', context: snapshot.context });
      if (!result?.ok) throw Object.assign(new Error('Export context changed.'), { reason: result?.reason });
    };
    try {
      const zip = await PipelineExportSession.collect(snapshot.entries, {
        signal: controller.signal, verify,
        read: async (entry) => {
          const result = await chrome.runtime.sendMessage({ type: 'pipeline-export-relay', operation: 'read', context: snapshot.context, entry });
          if (!result?.ok) throw Object.assign(new Error('Published JSON unavailable.'), { reason: result?.reason });
          return result.data;
        },
        onProgress: ({ completed, total }) => { if (current === generation) { progress.value = completed; status.textContent = `Downloading ${completed} of ${total}…`; } },
      });
      if (current !== generation) return;
      objectUrl = URL.createObjectURL(zip);
      save.href = objectUrl;
      save.download = 'integration-navigator-pipelines.zip';
      save.hidden = false;
      status.textContent = 'Export ready. Select Save ZIP to download it.';
    } catch (error) {
      if (current === generation) {
        discard();
        const reasons = { 'version-unverified': 'The service did not provide a verifiable Sub-Pipeline version.', 'version-mismatch': 'A published version changed.', 'source-unavailable': 'Published source was unavailable or access was denied.', 'requests-stalled': 'Earlier service requests are still running.', 'request-timeout': 'The service timed out.', 'context-changed': 'The source page, tenant, or consent changed.', 'preview-expired': 'The export session expired.', 'session-unavailable': 'Temporary export storage is unavailable.' };
        // A replaced source document or cleared browser/extension session requires a new launch.
        const retry = error.reason === 'session-unavailable' ? 'Reload the extension, refresh Packages, and reopen export.' : ['context-changed', 'preview-expired'].includes(error.reason) ? 'Reopen export from settings.' : 'Refresh preview to retry.';
        status.textContent = `${reasons[error.reason] || 'Export stopped.'} No partial ZIP was created. ${retry}`;
      }
    } finally {
      controller = null;
      // Retain a successful preview for another checkbox selection; failed/cancelled jobs still close native work.
      if (!plan || current !== generation) await chrome.runtime.sendMessage({ type: 'pipeline-export-relay', operation: 'cancel' }).catch(() => {});
      // After cancelled in-flight work settles, Retry becomes available without restoring stale output.
      refresh.disabled = false;
      selection.disabled = !plan;
      if (plan && current === generation) updateSelection();
      if (current === generation) { refresh.disabled = false; progress.hidden = true; }
    }
  });

  // Cancellation invalidates late responses immediately and clears every displayed temporary record.
  cancel.addEventListener('click', () => {
    generation += 1;
    controller?.abort();
    if (launch) chrome.runtime.sendMessage({ type: 'pipeline-export-relay', operation: 'cancel', revokeOverride: true }).catch(() => {});
    if (launch) launch.overrideConfirmed = false;
    discard();
    progress.hidden = true;
    refresh.disabled = Boolean(controller);
    status.textContent = 'Cancelled. No ZIP was downloaded.';
  });
  selectAll.addEventListener('change', () => {
    plan.entries.forEach((entry, index) => { if (selectAll.checked) selected.add(index); else selected.delete(index); });
    updateSelection(true);
  });
  refresh.addEventListener('click', preview);
  // A default export loses eligibility immediately when the user withdraws Shared From consent.
  chrome.storage.onChanged.addListener((changes, area) => {
    if (area !== 'local' || launch?.overrideConfirmed) return;
    const known = changes.designerOwnershipCache ? PipelineExportCore.sourceNames(changes.designerOwnershipCache.newValue) : null;
    const knownTransforms = known ? PipelineExportCore.sourceNames(changes.designerOwnershipCache.newValue, 'transformer') : null;
    // Removed eligibility revokes even a completed local Save ZIP link; timestamp-only refreshes do not.
    if (changes.sharedFromEnabled?.newValue === false || known && plan?.entries.some((entry) => !(entry.type === 'transformer' ? knownTransforms : known).get(entry.packageName)?.has(entry.name))) cancel.click();
  });
  window.addEventListener('pagehide', () => { controller?.abort(); if (launch) chrome.runtime.sendMessage({ type: 'pipeline-export-relay', operation: 'cancel', release: true }).catch(() => {}); discard(); launch = null; });
  preview();
})();
