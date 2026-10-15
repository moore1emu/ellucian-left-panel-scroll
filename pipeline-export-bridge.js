(() => {
  "use strict";

  // The isolated document accepts preview requests only from the extension's dedicated tab.
  const source = 'ellucian-left-panel-scroll';
  const pending = new Map();
  let sequence = 0;
  // A manual extension reload can invalidate a response callback in an older open document.
  function reply(respond, result) {
    try { respond(result); } catch { /* The disconnected caller no longer needs a response. */ }
  }
  chrome.runtime.onMessage.addListener((message, sender, respond) => {
    if (message?.type !== 'pipeline-export-preview' || !chrome.runtime?.id || sender.id !== chrome.runtime.id || sender.url?.split('#')[0] !== chrome.runtime.getURL('pipeline-export.html')) return;
    const url = window.location.href;
    // Native download helpers are confirmed only for Designer at this checkpoint.
    if (!/\/data-connect-designer\/?$/iu.test(window.location.pathname) || window.location.protocol !== 'https:') {
      reply(respond, { ok: false, reason: 'open-designer' });
      return;
    }
    const requestId = `export-${crypto.randomUUID()}-${++sequence}`;
    const timer = window.setTimeout(() => {
      pending.delete(requestId);
      reply(respond, { ok: false, reason: 'page-unavailable' });
    }, 15000);
    pending.set(requestId, { url, timer, respond });
    // Ask only for metadata already loaded in the manager, never source code or credentials.
    window.postMessage({ source, type: 'pipeline-export-context-request', requestId }, window.location.origin);
    return true;
  });

  // Correlate the native response and verify its route before returning preview metadata.
  window.addEventListener('message', async (event) => {
    if (event.source !== window || event.origin !== window.location.origin || event.data?.source !== source || event.data.type !== 'pipeline-export-context-response') return;
    const request = pending.get(event.data.requestId);
    if (!request) return;
    pending.delete(event.data.requestId);
    window.clearTimeout(request.timer);
    if (request.url !== window.location.href || event.data.pageUrl !== request.url || !event.data.tenantId || !Array.isArray(event.data.packages)) {
      reply(request.respond, { ok: false, reason: 'page-unavailable' });
      return;
    }
    // Project bounded metadata again: page messages are untrusted even when correctly correlated.
    try {
      if (event.data.packages.length > 10000 || typeof event.data.tenantId !== 'string' || event.data.tenantId.length > 500 || typeof event.data.documentKey !== 'string' || event.data.documentKey.length > 500) throw new Error('invalid-metadata');
      const clean = (value) => typeof value === 'string' && value.length <= 500 ? value : '';
      let count = 0;
      const packages = event.data.packages.map((item) => {
        if (!Array.isArray(item?.pipelines)) throw new Error('invalid-metadata');
        count += item.pipelines.length;
        if (count > 100000) throw new Error('invalid-metadata');
        return { name: clean(item.name), version: clean(item.version), pipelines: item.pipelines.map((entry) => ({ name: clean(entry?.name), version: clean(entry?.version), type: clean(entry?.type) })) };
      });
      // Return only fixed fields and the isolated document's URL, never payloads or a page-selected URL.
      reply(request.respond, { ok: true, context: { url: request.url, tenantId: event.data.tenantId, documentKey: event.data.documentKey }, packages });
    } catch {
      reply(request.respond, { ok: false, reason: 'page-unavailable' });
    }
  });

  // Resolve outstanding callers on navigation rather than leaving an apparent working spinner.
  window.addEventListener('pagehide', () => {
    for (const request of pending.values()) {
      window.clearTimeout(request.timer);
      reply(request.respond, { ok: false, reason: 'page-unavailable' });
    }
    pending.clear();
  });
})();
