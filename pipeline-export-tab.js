(() => {
  "use strict";

  // Source code requires an explicit ZIP or Git preparation action; Git uploading needs a second confirmation.
  const DOWNLOADS_READY = true;
  const status = document.querySelector('#export-status');
  const counts = document.querySelector('#export-counts');
  const packages = document.querySelector('#export-packages');
  const selection = document.querySelector('#export-selection');
  const selectAll = document.querySelector('#select-all');
  const formatted = document.querySelector('#include-formatted');
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
  let zipContext = null;
  let retry = null;
  // Git comparisons and source buffers exist only in this export document, never in messages/backups.
  const gitPrepare = document.querySelector('#git-prepare');
  const gitComparison = document.querySelector('#git-comparison');
  const gitConfirm = document.querySelector('#git-confirm');
  const gitPush = document.querySelector('#git-push');
  const gitResult = document.querySelector('#git-result');
  let gitPlan = null;
  let gitWriting = false;

  // Any selection/layout/source change invalidates confirmation and drops all prepared Git payloads.
  function discardGit() {
    gitPlan = null;
    if (!gitComparison) return;
    gitComparison.hidden = true;
    gitConfirm.checked = false;
    gitPush.disabled = true;
    document.querySelector('#git-changes').replaceChildren();
  }

  // Keep the blob URL off the visible control so modified clicks cannot bypass source-context verification.
  save.setAttribute('role', 'button');
  save.tabIndex = 0;

  // Hand the complete local archive to the browser only after the caller has checked its context.
  function requestDownload(url, filename) {
    const link = document.createElement('a');
    link.href = url;
    link.download = filename;
    link.hidden = true;
    document.body.append(link);
    try { link.click(); }
    finally { link.remove(); }
  }

  // A changed selection or new download must not leave a Save link pointing to an older archive.
  function discardZip() {
    discardGit();
    if (objectUrl) URL.revokeObjectURL(objectUrl);
    objectUrl = null;
    zipContext = null;
    retry = null;
    save.removeAttribute('aria-busy');
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
    if (gitPrepare) gitPrepare.disabled = true;
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
      // Summarize checked types beside this package without regrouping or rebuilding its full list.
      const types = new Map();
      const count = group.items.reduce((total, item) => {
        if (!selected.has(item.index)) return total;
        types.set(item.entry.type, (types.get(item.entry.type) || 0) + 1);
        return total + 1;
      }, 0);
      if (count) selectedPackages += 1;
      group.checkbox.checked = count === group.items.length;
      group.checkbox.indeterminate = count > 0 && count < group.items.length;
      // Omit zero-selected types and keep the same type order as the top summary.
      const details = [['pipeline', 'Pipelines'], ['sub-pipeline', 'Sub-Pipelines'], ['api', 'APIs'], ['transformer', 'Transformers']]
        .filter(([type]) => types.has(type)).map(([type, label]) => `${label}: ${types.get(type)}`).join(', ');
      group.count.textContent = `${count} of ${group.items.length} selected${details ? ` (${details})` : ''}`;
      for (const item of group.items) if (item.checkbox) item.checkbox.checked = selected.has(item.index);
    }
    selectAll.checked = selected.size === plan.entries.length;
    selectAll.indeterminate = selected.size > 0 && selected.size < plan.entries.length;
    // Count checked artifacts by type so independent major versions and non-pipeline files are visible.
    const byType = { pipeline: 0, 'sub-pipeline': 0, api: 0, transformer: 0 };
    for (const entry of selectedEntries()) byType[entry.type] += 1;
    counts.textContent = `${selectedPackages} of ${groups.size} packages · ${selected.size} of ${plan.entries.length} files selected (Pipelines: ${byType.pipeline}, Sub-Pipelines: ${byType['sub-pipeline']}, APIs: ${byType.api}, Transformers: ${byType.transformer}) · ${plan.skipped} unrecorded records in inspected packages skipped`;
    download.disabled = !DOWNLOADS_READY || !selected.size || Boolean(controller);
    if (gitPrepare) gitPrepare.disabled = !selected.size || Boolean(controller) || !globalThis.GitProvider || !globalThis.GitVault;
    if (changed) status.textContent = selected.size ? 'Selection updated. Choose Download ZIP or Preview Git Changes to retrieve checked records.' : 'No files selected. Check a package or file to export.';
  }

  // Verify both the original native source context and the still-unlocked saved Git destination.
  async function verifyGit(snapshot, connection, signal) {
    if (signal.aborted) throw new Error('Git operation cancelled.');
    const source = await chrome.runtime.sendMessage({ type: 'pipeline-export-relay', operation: 'verify', context: snapshot.context });
    if (!source?.ok || (await GitVault.info())?.revision !== connection.revision) throw new Error('Source or connection changed. Prepare a new Git preview.');
    const origin = connection.config.provider === 'github' ? 'https://api.github.com' : connection.config.server;
    if (!await chrome.permissions.contains({ origins: [origin + '/*'] })) throw new Error('Git server permission is missing. Open Manage Connection.');
    // Rechecking unlock before every request makes Lock/Forget stop unsent requests in other tabs too.
    await GitVault.token(connection.revision);
    if (signal.aborted) throw new Error('Git operation cancelled.');
  }

  // Display only application-owned messages; no provider response body or credential can appear here.
  function gitFailure(error) {
    const known = new Set(['Git operation cancelled.', 'Source or connection changed. Prepare a new Git preview.', 'Git server permission is missing. Open Manage Connection.', 'Connection changed. Prepare a new preview.', 'Connection is locked or unavailable. Open Manage Connection.',
      'Git authentication failed. Reconnect with a valid token.', 'Git access was denied or rate limited. Check permissions and branch protection.', 'Git repository, branch, or file was not found.', 'Git changed or rejected this commit. Refresh Git preview.', 'Git rejected this change. Check branch protection and refresh preview.', 'Git rate limit reached. Wait before preparing another preview.', 'Git could not be reached. Check the server and connection.',
      'Git supports 1–500 generated files per push. Choose a smaller selection if formatted.', 'Git selection exceeds the request limit. Choose fewer files.', 'Repository tree is too large to compare safely.', 'Git repository visibility could not be verified.', 'Git destination has a file or link where a folder is needed.', 'Git destination collides with a folder, executable, link, or submodule.', 'Git file changed. Refresh Git preview.', 'Remote branch changed. Prepare and confirm a new Git preview.',
      'Git branch was not advanced by this export, but uploaded Git objects may remain. Prepare a fresh preview before retrying.', 'Git result is uncertain. Check the remote branch/history before any new push.']);
    return known.has(error?.message) ? error.message : 'Git export stopped. Check the connection and source page, then prepare a new comparison. Do not retry an uncertain write without checking remote history.';
  }

  // Collect exactly the current selected files locally, then perform read-only remote comparisons.
  gitPrepare?.addEventListener('click', async () => {
    if (!selected.size || controller || !plan) return;
    const snapshot = { ...plan, entries: selectedEntries(), formatted: formatted.checked };
    const current = ++generation;
    discardZip();
    controller = new AbortController();
    const signal = controller.signal;
    download.disabled = true; gitPrepare.disabled = true; refresh.disabled = true; selection.disabled = true;
    progress.hidden = false; progress.max = snapshot.entries.length; progress.value = 0;
    gitResult.textContent = 'Preparing selected files locally. No source files uploaded.';
    try {
      const connection = await GitVault.info();
      if (!connection) throw new Error('Git server permission is missing. Open Manage Connection.');
      const check = () => verifyGit(snapshot, connection, signal);
      await check();
      const files = await PipelineExportSession.collectFiles(snapshot.entries, {
        verify: check, signal, formatted: snapshot.formatted, environment: snapshot.environment,
        read: async entry => {
          const result = await chrome.runtime.sendMessage({ type: 'pipeline-export-relay', operation: 'read', context: snapshot.context, entry });
          if (!result?.ok) throw new Error('Published source unavailable.');
          return result.data;
        },
        onProgress: ({ completed }) => { if (current === generation) { progress.value = completed; gitResult.textContent = `Preparing ${completed} of ${snapshot.entries.length} locally…`; } },
      });
      const comparison = await GitProvider.preview(connection.config, files, await GitVault.token(connection.revision), { check, signal });
      await check();
      if (current !== generation) return;
      gitPlan = { comparison, connection, snapshot, created: Date.now() };
      const c = comparison.config;
      document.querySelector('#git-destination').textContent = `${c.server} · ${c.repository} · Branch: ${c.branch} · Folder: ${c.folder} · Visibility: ${comparison.visibility}`;
      document.querySelector('#git-remote-head').textContent = `Compared commit: ${comparison.head}. ${comparison.total - comparison.changes.length} unchanged; ${comparison.changes.length} additions/updates. No deletions.`;
      for (const file of comparison.changes) {
        const row = document.createElement('li'); row.textContent = `${file.action === 'create' ? 'Add' : 'Update'} · ${file.path} · ${file.bytes.length} bytes`;
        document.querySelector('#git-changes').append(row);
      }
      gitComparison.hidden = false;
      gitResult.textContent = comparison.changes.length ? 'Review and confirm below. Nothing has been uploaded. Keep this tab open until push completes.' : 'Everything selected already matches Git. No commit is needed.';
    } catch (error) {
      if (current === generation) { discardGit(); gitResult.textContent = gitFailure(error); }
    } finally {
      controller = null; refresh.disabled = false; selection.disabled = !plan; progress.hidden = true;
      if (plan && current === generation) updateSelection();
    }
  });

  // A second explicit action confirms a single immutable comparison; never silently rebuild and push it.
  gitConfirm?.addEventListener('change', () => { gitPush.disabled = !gitConfirm.checked || !gitPlan?.comparison.changes.length || Boolean(controller); });
  gitPush?.addEventListener('click', async () => {
    if (!gitPlan || !gitConfirm.checked || controller || !gitPlan.comparison.changes.length) return;
    const job = gitPlan;
    gitPlan = null;
    controller = new AbortController();
    const signal = controller.signal;
    gitWriting = true;
    gitPush.disabled = true; gitPrepare.disabled = true; download.disabled = true; refresh.disabled = true; selection.disabled = true;
    gitResult.textContent = 'Pushing confirmed changes. Keep this tab open; closing or cancelling cannot undo requests already sent.';
    try {
      if (Date.now() - job.created > 10 * 60 * 1000) throw new Error('Source or connection changed. Prepare a new Git preview.');
      const check = () => verifyGit(job.snapshot, job.connection, signal);
      await check();
      const result = await GitProvider.push(job.comparison, await GitVault.token(job.connection.revision), { check, signal });
      gitResult.replaceChildren(document.createTextNode(`${result.count} files committed. `));
      if (result.commit) {
        const link = document.createElement('a'); link.href = GitProvider.commitUrl(job.connection.config, result.commit);
        link.textContent = 'View Commit'; link.target = '_blank'; link.rel = 'noopener noreferrer'; gitResult.append(link);
        try { await GitVault.receipt(job.connection.revision, result); }
        catch { gitResult.append(document.createTextNode(' Commit succeeded, but its local receipt could not be saved.')); }
      }
    } catch (error) { gitResult.textContent = gitFailure(error); }
    finally {
      gitWriting = false; controller = null; discardGit(); refresh.disabled = false; selection.disabled = !plan;
      if (plan) updateSelection();
    }
  });
  document.querySelector('#git-dismiss')?.addEventListener('click', () => { if (!controller) { discardGit(); gitResult.textContent = 'Git preview discarded. No files uploaded.'; } });
  document.querySelector('#git-manage')?.addEventListener('click', () => {
    chrome.tabs.create({ url: chrome.runtime.getURL('git-connection.html') }).catch(() => { gitResult.textContent = 'Could not open connection settings.'; });
  });

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
      plan = { ...result.plan, context: result.context, environment: result.environment || result.context.tenantId };
      document.querySelector('#export-mode').textContent = launch.overrideConfirmed ? 'Temporary advanced mode: all accessible content. No additional permissions are granted.' : 'Designer-recorded content only. Saved source observations may be stale.';
      renderPackages();
      download.disabled = !DOWNLOADS_READY || !plan.entries.length;
      status.textContent = plan.entries.length ? 'Preview ready. Choose Download ZIP or Preview Git Changes to retrieve these published records.' : 'No eligible published files found. Refresh Shared From in the source Designer first.';
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
    const snapshot = { ...plan, entries: selectedEntries(), formatted: formatted.checked };
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
        signal: controller.signal, verify, formatted: snapshot.formatted, environment: snapshot.environment,
        read: async (entry) => {
          const result = await chrome.runtime.sendMessage({ type: 'pipeline-export-relay', operation: 'read', context: snapshot.context, entry });
          if (!result?.ok) throw Object.assign(new Error('Published JSON unavailable.'), { reason: result?.reason });
          return result.data;
        },
        onProgress: ({ completed, total }) => { if (current === generation) { progress.value = completed; status.textContent = `Downloading ${completed} of ${total}…`; } },
      });
      if (current !== generation) return;
      objectUrl = URL.createObjectURL(zip);
      zipContext = snapshot.context;
      save.download = PipelineExportCore.archiveName(snapshot.environment);
      save.hidden = false;
      // Keep: one explicit Download ZIP action builds the complete archive and requests its browser download (2.0.9).
      status.textContent = 'ZIP prepared. Download requested; use Download Again if needed.';
      requestDownload(objectUrl, save.download);
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

  // Keep: retry the same complete blob only after verifying the original source document, with no source rereads (2.1.6).
  save.addEventListener('click', async (event) => {
    event.preventDefault();
    if (event.button !== 0 || event.ctrlKey || event.metaKey || event.shiftKey || event.altKey || retry || controller || !objectUrl || save.hidden) return;
    const attempt = { url: objectUrl, context: zipContext, filename: save.download, generation };
    retry = attempt;
    save.setAttribute('aria-busy', 'true');
    try {
      const result = await chrome.runtime.sendMessage({ type: 'pipeline-export-relay', operation: 'verify', context: attempt.context });
      // Selection, formatting, cancellation, consent, or a new preview/archive invalidates a pending retry.
      if (retry !== attempt || objectUrl !== attempt.url || generation !== attempt.generation) return;
      if (!result?.ok) throw new Error('context-changed');
      requestDownload(attempt.url, attempt.filename);
      status.textContent = 'Download requested again. No source files were retrieved.';
    } catch {
      // A stale reply must not discard a replacement preview or overwrite its current status.
      if (retry !== attempt || objectUrl !== attempt.url || generation !== attempt.generation) return;
      discard();
      status.textContent = 'The source page, tenant, or consent changed. Reopen export from settings.';
    } finally {
      if (retry === attempt) { retry = null; save.removeAttribute('aria-busy'); }
    }
  });
  // The retry has button semantics: keyboard activation follows the same verification, while auxiliary clicks do nothing.
  save.addEventListener('keydown', (event) => {
    if (!['Enter', ' '].includes(event.key) || event.ctrlKey || event.metaKey || event.shiftKey || event.altKey) return;
    event.preventDefault();
    if (!event.repeat) save.click();
  });
  save.addEventListener('auxclick', (event) => event.preventDefault());

  // Cancellation invalidates late responses immediately and clears every displayed temporary record.
  cancel.addEventListener('click', () => {
    generation += 1;
    controller?.abort();
    if (launch) chrome.runtime.sendMessage({ type: 'pipeline-export-relay', operation: 'cancel', revokeOverride: true }).catch(() => {});
    if (launch) launch.overrideConfirmed = false;
    discard();
    progress.hidden = true;
    refresh.disabled = Boolean(controller);
    status.textContent = gitWriting ? 'Git cancellation requested. An already-sent request may have committed; check remote history before another push.' : 'Cancelled. Existing browser downloads are unchanged.';
  });
  selectAll.addEventListener('change', () => {
    plan.entries.forEach((entry, index) => { if (selectAll.checked) selected.add(index); else selected.delete(index); });
    updateSelection(true);
  });
  // A changed layout must not leave Download Again pointing at the previous archive format.
  formatted.addEventListener('change', () => updateSelection(true));
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
