"use strict";

// Keep launch tickets ephemeral; a worker restart fails safely without retaining consent.
const pipelineExportTickets = new Map();
chrome.runtime.onMessage.addListener((message, sender, respond) => {
  if (!['pipeline-export-open', 'pipeline-export-claim'].includes(message?.type) || sender.id !== chrome.runtime.id) return;
  const popupUrl = chrome.runtime.getURL('popup.html');
  const exportUrl = chrome.runtime.getURL('pipeline-export.html');
  if (message?.type === 'pipeline-export-open' && sender.url === popupUrl) {
    (async () => {
      // Expire abandoned previews without alarms, storage writes, or idle polling.
      for (const [key, ticket] of pipelineExportTickets) if (ticket.expires < Date.now()) pipelineExportTickets.delete(key);
      if (pipelineExportTickets.size >= 20) throw new Error('too-many-previews');
      const [source] = await chrome.tabs.query({ active: true, currentWindow: true });
      if (!Number.isInteger(source?.id)) throw new Error('no-source-tab');
      const ticket = crypto.randomUUID();
      const record = { sourceTabId: source.id, overrideConfirmed: message.overrideConfirmed === true, expires: Date.now() + 300000, tabId: null };
      pipelineExportTickets.set(ticket, record);
      try {
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
      if (!ticket || pipelineExportTickets.get(message.ticket) !== ticket || ticket.expires < Date.now() || ticket.tabId !== sender.tab?.id) {
        respond({ ok: false });
        return;
      }
      pipelineExportTickets.delete(message.ticket);
      respond({ ok: true, sourceTabId: ticket.sourceTabId, overrideConfirmed: ticket.overrideConfirmed });
    })().catch(() => respond({ ok: false }));
    return true;
  }
});
