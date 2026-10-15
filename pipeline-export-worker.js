"use strict";

// Keep launch tickets ephemeral; a worker restart fails safely without retaining consent.
const pipelineExportTickets = new Map();
// Bind source handshakes and claimed export documents without persistent storage or broader permissions.
const pipelineExportBindings = new Map();
const pipelineExportGrants = new Map();
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
        !/\/data-connect\/home\/?$/iu.test(url.pathname)) throw new Error('Invalid source document');
      record.sourceDocumentId = sender.documentId;
      record.sourceUrl = url.href;
      respond({ ok: true });
    } catch { respond({ ok: false }); }
    return;
  }
  if (message.type === 'pipeline-export-relay') {
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
    if (operation === 'cancel' && message.revokeOverride === true) record.overrideConfirmed = false;
    if (operation === 'cancel' && message.release === true) pipelineExportGrants.delete(sender.tab.id);
    chrome.tabs.sendMessage(record.sourceTabId, {
      type: `pipeline-export-${operation}`, clientId: record.clientId, sourceUrl: record.sourceUrl,
      overrideConfirmed: record.overrideConfirmed, context: message.context, entry: message.entry,
    }, { frameId: 0, documentId: record.sourceDocumentId }).then((result) => {
      // A closed/replaced export document cannot receive a late source result through a renewed grant.
      if (operation !== 'cancel' && (pipelineExportGrants.get(sender.tab.id) !== record || generation !== record.generation)) respond({ ok: false, reason: 'cancelled' });
      else respond(result?.ok === true || result?.ok === false ? result : { ok: false, reason: 'source-unavailable' });
    }).catch(() => respond({ ok: false, reason: 'context-changed' }));
    return true;
  }
  if (message?.type === 'pipeline-export-open' && sender.url === popupUrl) {
    (async () => {
      // Expire abandoned previews without alarms, storage writes, or idle polling.
      for (const [key, ticket] of pipelineExportTickets) if (ticket.expires < Date.now()) pipelineExportTickets.delete(key);
      if (pipelineExportTickets.size + pipelineExportGrants.size >= 20) throw new Error('too-many-previews');
      const [source] = await chrome.tabs.query({ active: true, currentWindow: true });
      if (!Number.isInteger(source?.id)) throw new Error('no-source-tab');
      const ticket = crypto.randomUUID();
      const record = { sourceTabId: source.id, overrideConfirmed: message.overrideConfirmed === true, expires: Date.now() + 300000, tabId: null };
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
      respond({ ok: true, overrideConfirmed: ticket.overrideConfirmed });
    })().catch(() => respond({ ok: false }));
    return true;
  }
});

// Close only this export client's native session when its tab disappears; source work retains native limits.
chrome.tabs.onRemoved.addListener((tabId) => {
  const record = pipelineExportGrants.get(tabId);
  pipelineExportGrants.delete(tabId);
  if (record) chrome.tabs.sendMessage(record.sourceTabId, { type: 'pipeline-export-cancel', clientId: record.clientId, sourceUrl: record.sourceUrl },
    { frameId: 0, documentId: record.sourceDocumentId }).catch(() => {});
  // A removed source also retires its grants rather than retaining unreachable clients in memory.
  for (const [id, grant] of pipelineExportGrants) if (grant.sourceTabId === tabId) pipelineExportGrants.delete(id);
  for (const [key, ticket] of pipelineExportTickets) if (ticket.tabId === tabId || ticket.sourceTabId === tabId) pipelineExportTickets.delete(key);
});
