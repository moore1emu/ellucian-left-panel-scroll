(() => {
  "use strict";

  // Source code is requested only after the user's explicit Download ZIP action.
  const DOWNLOADS_READY = true;
  const status = document.querySelector('#export-status');
  const counts = document.querySelector('#export-counts');
  const rows = document.querySelector('#export-rows');
  const refresh = document.querySelector('#refresh-preview');
  const download = document.querySelector('#download-zip');
  const cancel = document.querySelector('#cancel-export');
  const more = document.querySelector('#show-more');
  const progress = document.querySelector('#export-progress');
  const save = document.querySelector('#save-zip');
  const packageSelect = document.querySelector('#export-package');
  let launch = null;
  let plan = null;
  let generation = 0;
  let shown = 0;
  let controller = null;
  let objectUrl = null;

  // Clear only temporary output buffers and revoke any prior local download URL.
  function discard() {
    if (objectUrl) URL.revokeObjectURL(objectUrl);
    objectUrl = null;
    save.hidden = true;
    save.removeAttribute('href');
    plan = null;
    packageSelect.replaceChildren(new Option('All Eligible Packages', ''));
    packageSelect.disabled = true;
    rows.replaceChildren();
    counts.textContent = '';
    document.querySelector('#preview-table').hidden = true;
    more.hidden = true;
    download.disabled = true;
  }

  // Selecting one package narrows an authorized preview; it never adds unrecorded content.
  function selectedEntries() {
    return (plan?.entries || []).filter((entry) => !packageSelect.value || entry.packageName === packageSelect.value);
  }

  function selectPackage() {
    rows.replaceChildren();
    shown = 0;
    showMore();
    const entries = selectedEntries();
    const packages = new Set(entries.map((entry) => entry.packageName)).size;
    counts.textContent = `${packages} ${packages === 1 ? 'package' : 'packages'} · ${entries.length} ${entries.length === 1 ? 'file' : 'files'} · ${plan.skipped} unrecorded records in inspected packages skipped`;
    download.disabled = !entries.length;
  }

  // Render bounded batches but keep every planned record independent of the display cap.
  function showMore() {
    const entries = selectedEntries();
    const end = Math.min(shown + 100, entries.length);
    const fragment = document.createDocumentFragment();
    for (const entry of entries.slice(shown, end)) {
      const row = document.createElement('tr');
      for (const value of [entry.packageName, entry.name, entry.type === 'api' ? 'API' : entry.type === 'sub-pipeline' ? 'Sub-Pipeline' : 'Integration', entry.version.replace(/^v/u, '')]) {
        const cell = document.createElement('td');
        cell.textContent = value;
        row.append(cell);
      }
      fragment.append(row);
    }
    rows.append(fragment);
    shown = end;
    more.hidden = shown >= entries.length;
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
      const result = await chrome.tabs.sendMessage(launch.sourceTabId, { type: 'pipeline-export-preview', overrideConfirmed: launch.overrideConfirmed }, { frameId: 0 });
      if (current !== generation) return;
      if (!result?.ok) throw new Error(result?.reason === 'open-packages' ? 'Open Integration Packages, then reopen export from settings.' : result?.reason === 'requests-stalled' ? 'Earlier service requests are still running. Wait, then refresh preview.' : 'Package metadata is unavailable. Refresh the original page and retry.');
      // Default exact-name eligibility is computed in the extension, not in untrusted page code.
      plan = { ...result.plan, context: result.context };
      for (const name of new Set(plan.entries.map((entry) => entry.packageName))) packageSelect.append(new Option(name, name));
      packageSelect.disabled = !plan.entries.length;
      document.querySelector('#export-mode').textContent = launch.overrideConfirmed ? 'Temporary advanced mode: all accessible content. No additional permissions are granted.' : 'Designer-recorded content only. Saved source observations may be stale.';
      selectPackage();
      document.querySelector('#preview-table').hidden = !plan.entries.length;
      download.disabled = !DOWNLOADS_READY || !plan.entries.length;
      status.textContent = plan.entries.length ? 'Preview ready. Select Download ZIP to retrieve these published records.' : 'No eligible published pipelines found. Refresh Shared From in the source Designer first.';
    } catch (error) {
      if (current === generation) {
        // Display only our fixed validation messages, never arbitrary native service exceptions.
        const safe = new Set(['Preview expired. Reopen export from settings.', 'Open Integration Packages, then reopen export from settings.', 'Earlier service requests are still running. Wait, then refresh preview.', 'Package metadata is unavailable. Refresh the original page and retry.', 'Enable Shared From first.', 'Visit Designer in each source environment first.', 'Incomplete package metadata.', 'Unsupported published version.', 'Too many export files.']);
        status.textContent = safe.has(error.message) ? error.message : 'Could not prepare preview. Refresh the original Packages page and retry.';
        discard();
      }
    } finally {
      if (current === generation) { refresh.disabled = false; progress.hidden = true; }
    }
  }

  // Keep source download separate from metadata preview and backup/import actions.
  download.addEventListener('click', async () => {
    if (!DOWNLOADS_READY || !plan?.entries.length || controller) return;
    const snapshot = { ...plan, entries: selectedEntries() };
    const current = ++generation;
    controller = new AbortController();
    download.disabled = true;
    refresh.disabled = true;
    packageSelect.disabled = true;
    progress.hidden = false;
    progress.max = snapshot.entries.length;
    progress.value = 0;
    const verify = async () => {
      const result = await chrome.tabs.sendMessage(launch.sourceTabId, { type: 'pipeline-export-verify', context: snapshot.context });
      if (!result?.ok) throw Object.assign(new Error('Export context changed.'), { reason: result?.reason });
    };
    try {
      const zip = await PipelineExportSession.collect(snapshot.entries, {
        signal: controller.signal, verify,
        read: async (entry) => {
          const result = await chrome.tabs.sendMessage(launch.sourceTabId, { type: 'pipeline-export-read', context: snapshot.context, entry });
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
        const reasons = { 'version-unverified': 'The service did not provide a verifiable Sub-Pipeline version.', 'version-mismatch': 'A published version changed.', 'source-unavailable': 'Published JSON was unavailable or access was denied.', 'requests-stalled': 'Earlier service requests are still running.', 'request-timeout': 'The service timed out.', 'context-changed': 'The source page, tenant, or consent changed.' };
        status.textContent = `${reasons[error.reason] || 'Export stopped.'} No partial ZIP was created. Refresh preview to retry.`;
      }
    } finally {
      controller = null;
      chrome.tabs.sendMessage(launch.sourceTabId, { type: 'pipeline-export-cancel' }).catch(() => {});
      // After cancelled in-flight work settles, Retry becomes available without restoring stale output.
      refresh.disabled = false;
      if (current === generation) { refresh.disabled = false; progress.hidden = true; }
    }
  });

  // Cancellation invalidates late responses immediately and clears every displayed temporary record.
  cancel.addEventListener('click', () => {
    generation += 1;
    controller?.abort();
    if (launch) chrome.tabs.sendMessage(launch.sourceTabId, { type: 'pipeline-export-cancel' }).catch(() => {});
    if (launch) launch.overrideConfirmed = false;
    discard();
    progress.hidden = true;
    refresh.disabled = Boolean(controller);
    status.textContent = 'Cancelled. No ZIP was downloaded.';
  });
  more.addEventListener('click', showMore);
  packageSelect.addEventListener('change', selectPackage);
  refresh.addEventListener('click', preview);
  // A default export loses eligibility immediately when the user withdraws Shared From consent.
  chrome.storage.onChanged.addListener((changes, area) => {
    if (area !== 'local' || launch?.overrideConfirmed) return;
    const known = changes.designerOwnershipCache ? PipelineExportCore.sourceNames(changes.designerOwnershipCache.newValue) : null;
    // Removed eligibility revokes even a completed local Save ZIP link; timestamp-only refreshes do not.
    if (changes.sharedFromEnabled?.newValue === false || known && plan?.entries.some((entry) => !known.get(entry.packageName)?.has(entry.name))) cancel.click();
  });
  window.addEventListener('pagehide', () => { controller?.abort(); if (launch) chrome.tabs.sendMessage(launch.sourceTabId, { type: 'pipeline-export-cancel' }).catch(() => {}); discard(); launch = null; });
  preview();
})();
