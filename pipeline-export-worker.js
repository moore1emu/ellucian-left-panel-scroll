"use strict";

// Keep unclaimed launch tickets ephemeral; claimed document grants survive only normal worker sleep.
const pipelineExportTickets = new Map();
// Bind source handshakes and claimed export documents without persistent storage or broader permissions.
const pipelineExportBindings = new Map();
const pipelineExportGrants = new Map();
// Keep: browser-memory session storage survives worker sleep, not extension reload or browser restart (2.0.5).
const pipelineExportGrantKey = 'pipelineExportDocumentGrants';
const pipelineExportVersion = chrome.runtime.getManifest().version;
// Bind allowed source kinds to exact top-level application routes, never arbitrary caller URLs.
const exportSourceRoutes = {packages:/\/data-connect\/home\/?$/iu,designer:/\/data-connect-designer\/?$/iu,'api-designer':/\/APIDesigner\/?$/u};
let pipelineExportStateFailed = false;
let pendingPipelineExportSave = Promise.resolve();
// Contain missing/synchronously failing session APIs so export failure cannot abort unrelated favorites startup.
const pipelineExportGrantsReady = Promise.resolve().then(() => chrome.storage.session.get(pipelineExportGrantKey)).then((saved) => {
  const state = saved[pipelineExportGrantKey];
  if (!state || state.version !== pipelineExportVersion) return;
  // Restore only bounded routing/authorization metadata, never source payloads, tokens, or arbitrary objects.
  if (!Array.isArray(state.records) || state.records.length > 20) throw new Error('Invalid export session state');
  for (const record of state.records) {
    const text = (field, limit = 100) => typeof record?.[field] === 'string' && record[field].length > 0 && record[field].length <= limit;
    if (!Number.isInteger(record?.tabId) || !Number.isInteger(record.sourceTabId) || !['sourceDocumentId', 'exportDocumentId', 'clientId'].every((field) => text(field)) ||
      !text('sourceUrl', 2048) || !Number.isSafeInteger(record.generation) || record.generation < 0 || typeof record.overrideConfirmed !== 'boolean') continue;
    const url = new URL(record.sourceUrl);
    if (url.protocol !== 'https:' || !exportSourceRoutes[record.sourceKind || 'packages']?.test(url.pathname)) continue;
    pipelineExportGrants.set(record.tabId, record);
  }
}).catch(() => { pipelineExportStateFailed = true; pipelineExportGrants.clear(); });

// Serialize only small grant changes; source reads remain concurrent under the existing native six-slot budget.
function savePipelineExportGrants() {
  pendingPipelineExportSave = pendingPipelineExportSave.catch(() => {}).then(async () => {
    if (pipelineExportStateFailed) throw new Error('Session storage unavailable');
    const records = [...pipelineExportGrants.entries()].map(([tabId, record]) => ({ tabId,
      sourceTabId: record.sourceTabId, sourceDocumentId: record.sourceDocumentId, sourceUrl: record.sourceUrl,
      exportDocumentId: record.exportDocumentId, clientId: record.clientId, generation: record.generation, overrideConfirmed: record.overrideConfirmed,
      sourceKind:record.sourceKind || 'packages', exportMode:record.exportMode || 'published' }));
    try { await chrome.storage.session.set({ [pipelineExportGrantKey]: { version: pipelineExportVersion, records } }); }
    catch {
      // Failed durability must not authorize native work or fall back to permanent local storage.
      pipelineExportStateFailed = true;
      pipelineExportGrants.clear();
      await chrome.storage.session.remove(pipelineExportGrantKey).catch(() => {});
      throw new Error('Session storage unavailable');
    }
  });
  return pendingPipelineExportSave;
}
chrome.runtime.onMessage.addListener((message, sender, respond) => {
  if (!['pipeline-export-open', 'pipeline-export-claim', 'pipeline-export-bind-source', 'pipeline-export-relay'].includes(message?.type) || sender.id !== chrome.runtime.id) return;
  const popupUrl = chrome.runtime.getURL('popup.html');
  const exportUrl = chrome.runtime.getURL('pipeline-export.html');
  if (message.type === 'pipeline-export-bind-source') {
    // Browser-supplied document identity comes from this content script's runtime message, never its payload.
    const record = pipelineExportBindings.get(message.bindingId);
    try {
      const url = new URL(message.url);
      if (!record || record.expires < Date.now() || record.sourceDocumentId || sender.tab?.id !== record.sourceTabId || sender.frameId !== 0 ||
        typeof sender.documentId !== 'string' || !sender.documentId || url.protocol !== 'https:' || url.origin !== new URL(sender.url).origin ||
        !exportSourceRoutes[record.sourceKind]?.test(url.pathname)) throw new Error('Invalid source document');
      record.sourceDocumentId = sender.documentId;
      record.sourceUrl = url.href;
      respond({ ok: true });
    } catch { respond({ ok: false }); }
    return;
  }
  if (message.type === 'pipeline-export-relay') {
    (async () => {
      // Rehydrate before authenticating a wake-up event; no heartbeat or background keep-alive is needed.
      await pipelineExportGrantsReady;
      if (pipelineExportStateFailed) { respond({ ok: false, reason: 'session-unavailable' }); return; }
      // Keep: authenticate the created export document in the worker; tabs.sendMessage omits sender.tab in content scripts (2.0.4).
      const record = pipelineExportGrants.get(sender.tab?.id);
      const operation = message.operation;
      if (!record || sender.frameId !== 0 || sender.documentId !== record.exportDocumentId || sender.url?.split('#')[0] !== exportUrl) {
        respond({ ok: false, reason: 'preview-expired' });
        return;
      }
      if (!['preview', 'read', 'verify', 'cancel'].includes(operation)) { respond({ ok: false, reason: 'unsupported-operation' }); return; }
      // Generations revoke late replies after refresh/cancel without freeing native request slots early.
      if (operation === 'preview' || operation === 'cancel') record.generation += 1;
      const generation = record.generation;
      // Capture generation before this read so cancellation cannot be overtaken by an older preview.
      if (operation !== 'cancel' && (await chrome.storage.local.get({ exportToolsEnabled:false })).exportToolsEnabled !== true) {
        respond({ok:false,reason:'tools-disabled'}); return;
      }
      // A caller may narrow previously confirmed advanced mode, but can never elevate a default grant.
      if (operation === 'preview') record.overrideConfirmed = record.overrideConfirmed && message.overrideConfirmed === true;
      if (operation === 'cancel' && message.revokeOverride === true) record.overrideConfirmed = false;
      if (operation === 'cancel' && message.release === true) pipelineExportGrants.delete(sender.tab.id);
      if (operation === 'preview' || operation === 'cancel') await savePipelineExportGrants();
      // A newer cancel/refresh may have arrived while the serialized session write was pending.
      if (operation !== 'cancel' && (pipelineExportGrants.get(sender.tab.id) !== record || generation !== record.generation)) { respond({ ok: false, reason: 'cancelled' }); return; }
      await chrome.tabs.sendMessage(record.sourceTabId, {
        type: `pipeline-export-${operation}`, clientId: record.clientId, sourceUrl: record.sourceUrl,
        overrideConfirmed: record.overrideConfirmed, context: message.context, entry: message.entry,
        sourceKind:record.sourceKind || 'packages', exportMode:record.exportMode || 'published',
      }, { frameId: 0, documentId: record.sourceDocumentId }).then((result) => {
        // A closed/replaced export document cannot receive a late source result through a renewed grant.
        if (operation !== 'cancel' && (pipelineExportGrants.get(sender.tab.id) !== record || generation !== record.generation)) respond({ ok: false, reason: 'cancelled' });
        else respond(result?.ok === true || result?.ok === false ? result : { ok: false, reason: 'source-unavailable' });
      }).catch(() => respond({ ok: false, reason: 'context-changed' }));
    })().catch(() => respond({ ok: false, reason: 'session-unavailable' }));
    return true;
  }
  if (message?.type === 'pipeline-export-open' && sender.url === popupUrl) {
    (async () => {
      if ((await chrome.storage.local.get({ exportToolsEnabled:false })).exportToolsEnabled !== true) throw new Error('tools-disabled');
      await pipelineExportGrantsReady;
      if (pipelineExportStateFailed) throw new Error('Session storage unavailable');
      // Expire abandoned previews without alarms, storage writes, or idle polling.
      for (const [key, ticket] of pipelineExportTickets) if (ticket.expires < Date.now()) pipelineExportTickets.delete(key);
      if (pipelineExportTickets.size + pipelineExportGrants.size >= 20) throw new Error('too-many-previews');
      const [source] = await chrome.tabs.query({ active: true, currentWindow: true });
      if (!Number.isInteger(source?.id)) throw new Error('no-source-tab');
      const ticket = crypto.randomUUID();
      const sourceKind = message.sourceKind || 'packages';
      if (!Object.hasOwn(exportSourceRoutes,sourceKind) || sourceKind === 'packages' && message.packagesRevealed !== true && message.sourceKind) throw new Error('Source not enabled');
      const record = { sourceTabId: source.id, sourceKind, exportMode:['draft','published','both'].includes(message.exportMode) ? message.exportMode : 'published',
        // Initial view is presentation-only; keep it inside the ticket without altering claim URLs or source scope.
        initialView: ['export','connections','configuration'].includes(message.initialView) ? message.initialView : 'export',
        overrideConfirmed: sourceKind === 'packages' && message.overrideConfirmed === true, expires: Date.now() + 300000, tabId: null };
      pipelineExportTickets.set(ticket, record);
      try {
        // Capture the original top-level source document before opening the export tab, including SPA entry.
        const bindingId = crypto.randomUUID();
        pipelineExportBindings.set(bindingId, record);
        try {
          const bound = await chrome.tabs.sendMessage(source.id, { type: 'pipeline-export-bind', bindingId }, { frameId: 0 });
          if (!bound?.ok || !record.sourceDocumentId) throw new Error('no-source-document');
        } finally { pipelineExportBindings.delete(bindingId); }
        // Put only a random launch ticket in the URL, never source names, tokens, or tenant IDs.
        record.creation = chrome.tabs.create({ url: `${exportUrl}#${ticket}` });
        const tab = await record.creation;
        record.tabId = tab.id;
        respond({ ok: true });
      } catch (error) {
        pipelineExportTickets.delete(ticket);
        throw error;
      }
    })().catch(() => respond({ ok: false }));
    return true;
  }
  if (message?.type === 'pipeline-export-claim' && sender.url?.split('#')[0] === exportUrl) {
    const ticket = pipelineExportTickets.get(message.ticket);
    (async () => {
      await pipelineExportGrantsReady;
      if (pipelineExportStateFailed) throw new Error('Session storage unavailable');
      // A fast document may start before tabs.create settles; wait for its exact returned tab.
      if (ticket?.creation) await ticket.creation;
      // A ticket may be consumed once, only by the extension tab the worker created.
      if (!ticket || pipelineExportTickets.get(message.ticket) !== ticket || ticket.expires < Date.now() || ticket.tabId !== sender.tab?.id ||
        sender.frameId !== 0 || typeof sender.documentId !== 'string' || !sender.documentId || sender.url !== `${exportUrl}#${message.ticket}`) {
        respond({ ok: false });
        return;
      }
      pipelineExportTickets.delete(message.ticket);
      // Keep the source target and advanced consent in the worker, not in caller-controlled relay fields.
      pipelineExportGrants.set(sender.tab.id, { ...ticket, creation: undefined, exportDocumentId: sender.documentId, clientId: crypto.randomUUID(), generation: 0 });
      await savePipelineExportGrants();
      respond({ ok: true, overrideConfirmed: ticket.overrideConfirmed, sourceKind:ticket.sourceKind, exportMode:ticket.exportMode, initialView:ticket.initialView });
    })().catch(() => respond({ ok: false }));
    return true;
  }
});

// Close only this export client's native session when its tab disappears; source work retains native limits.
chrome.tabs.onRemoved.addListener(async (tabId) => {
  await pipelineExportGrantsReady;
  if (pipelineExportStateFailed) return;
  const record = pipelineExportGrants.get(tabId);
  let changed = pipelineExportGrants.delete(tabId);
  if (record) chrome.tabs.sendMessage(record.sourceTabId, { type: 'pipeline-export-cancel', clientId: record.clientId, sourceUrl: record.sourceUrl },
    { frameId: 0, documentId: record.sourceDocumentId }).catch(() => {});
  // A removed source also retires its grants rather than retaining unreachable clients in memory.
  for (const [id, grant] of pipelineExportGrants) if (grant.sourceTabId === tabId) { pipelineExportGrants.delete(id); changed = true; }
  for (const [key, ticket] of pipelineExportTickets) if (ticket.tabId === tabId || ticket.sourceTabId === tabId) pipelineExportTickets.delete(key);
  // Remove closed grants without writing session storage for unrelated browser-tab events.
  if (changed) await savePipelineExportGrants().catch(() => {});
});

// Retire transient grants on opt-out; native requests already sent retain their six-slot accounting.
chrome.storage.onChanged.addListener((changes, area) => {
  if (area !== 'local' || !changes.exportToolsEnabled || changes.exportToolsEnabled.newValue === true) return;
  (async () => {
    await pipelineExportGrantsReady;
    pipelineExportTickets.clear(); pipelineExportBindings.clear();
    const records = [...pipelineExportGrants.values()];
    pipelineExportGrants.clear();
    await savePipelineExportGrants();
    for (const record of records) chrome.tabs.sendMessage(record.sourceTabId,
      {type:'pipeline-export-cancel',clientId:record.clientId,sourceUrl:record.sourceUrl},
      {frameId:0,documentId:record.sourceDocumentId}).catch(() => {});
  })().catch(() => console.warn('[Integration Navigator] EXPORT_REVOKE_FAILED'));
});
