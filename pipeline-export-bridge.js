(() => {
  'use strict';

  // Authorize source reads in the isolated document, never through page-controlled window messages.
  const source = 'ellucian-left-panel-scroll';
  const pending = new Map();
  const sessions = new Map();
  const key = (entry) => JSON.stringify([entry.packageName, entry.name, entry.type, entry.version]);
  const same = (left, right) => left && right && ['url', 'tenantId', 'documentKey', 'sessionId'].every((field) => left[field] === right[field]);
  const reply = (respond, result) => { try { respond(result); } catch { /* Ignore a caller invalidated by manual extension reload. */ } };

  // Project bounded metadata instead of forwarding page-controlled state or native exception objects.
  function project(result, operation) {
    const reasons = new Set(['cancelled', 'context-changed', 'open-packages', 'metadata-changed', 'source-unavailable', 'version-unverified', 'version-mismatch', 'source-mismatch', 'requests-stalled', 'request-timeout', 'entry-unavailable', 'too-many-previews']);
    if (result.ok !== true) return { ok: false, reason: reasons.has(result.reason) ? result.reason : 'source-unavailable' };
    if (operation === 'verify') return { ok: true };
    // Only the requested source payload crosses for read; preview never includes arbitrary extra fields.
    if (operation === 'read') return { ok: true, data: result.data };
    const text = (value, limit = 500) => { if (typeof value !== 'string' || !value || value.length > limit) throw new Error('Invalid metadata'); return value; };
    const context = Object.fromEntries(['url', 'tenantId', 'documentKey', 'sessionId'].map((field) => [field, text(result.context?.[field], field === 'url' ? 2048 : 500)]));
    if (!Array.isArray(result.packages) || result.packages.length > 10000) throw new Error('Invalid metadata');
    let count = 0;
    const packages = result.packages.map((pkg) => {
      if (!Array.isArray(pkg?.pipelines) || (count += pkg.pipelines.length) > 100000) throw new Error('Invalid metadata');
      return { name: text(pkg.name), version: text(pkg.version), pipelines: pkg.pipelines.map((item) => ({ name: text(item.name), version: text(item.version), type: text(item.type) })) };
    });
    return { ok: true, context, packages };
  }

  // Cancel queued native work and resolve local callers; actual native calls retain their service slots.
  function close(id) {
    const session = sessions.get(id);
    if (!session) return;
    sessions.delete(id);
    window.postMessage({ source, type: 'pipeline-export-close', sessionId: session.id }, window.location.origin);
    for (const [requestId, request] of pending) {
      if (request.sessionId !== session.id) continue;
      pending.delete(requestId);
      window.clearTimeout(request.timer);
      request.resolve({ ok: false, reason: 'cancelled' });
    }
  }

  // Send only fixed read operations to the page helper, with a correlated, route-bound deadline.
  function request(session, operation, details = {}) {
    const requestId = crypto.randomUUID();
    return new Promise((resolve) => {
      const timer = window.setTimeout(() => {
        pending.delete(requestId);
        close(session.tabId);
        resolve({ ok: false, reason: 'request-timeout' });
      }, operation === 'prepare' ? 180000 : 60000);
      pending.set(requestId, { sessionId: session.id, operation, url: window.location.href, timer, resolve });
      window.postMessage({ source, type: 'pipeline-export-operation', requestId, operation, sessionId: session.id, context: session.context, ...details }, window.location.origin);
    });
  }

  chrome.runtime.onMessage.addListener((message, sender, respond) => {
    if (!message?.type?.startsWith('pipeline-export-') || !chrome.runtime?.id || sender.id !== chrome.runtime.id ||
      sender.url?.split('#')[0] !== chrome.runtime.getURL('pipeline-export.html') || !Number.isInteger(sender.tab?.id)) return;
    const tabId = sender.tab.id;
    if (message.type === 'pipeline-export-cancel') { close(tabId); reply(respond, { ok: true }); return; }
    (async () => {
      if (message.type === 'pipeline-export-preview') {
        close(tabId);
        if (window.location.protocol !== 'https:' || !/\/data-connect\/home\/?$/iu.test(window.location.pathname)) return { ok: false, reason: 'open-packages' };
        // Read source metadata once per preview; later consent/cache changes invalidate affected sessions.
        const saved = await chrome.storage.local.get({ sharedFromEnabled: false, designerOwnershipCache: {} });
        const options = { sharedFromEnabled: saved.sharedFromEnabled === true, overrideConfirmed: message.overrideConfirmed === true };
        PipelineExportCore.buildPlan([], saved.designerOwnershipCache, options);
        const session = { id: crypto.randomUUID(), tabId, override: options.overrideConfirmed, entries: new Map(), context: null };
        sessions.set(tabId, session);
        const result = await request(session, 'prepare', { overrideConfirmed: session.override,
          packageNames: [...PipelineExportCore.sourceNames(saved.designerOwnershipCache).keys()] });
        if (!result?.ok || sessions.get(tabId) !== session || !result.context || result.context.url !== window.location.href) {
          close(tabId);
          return { ok: false, reason: result?.reason || 'context-changed' };
        }
        // Exact cache filtering stays isolated from untrusted page code and smart-search normalization.
        const current = await chrome.storage.local.get({ sharedFromEnabled: false, designerOwnershipCache: {} });
        if (sessions.get(tabId) !== session) return { ok: false, reason: 'cancelled' };
        const plan = PipelineExportCore.buildPlan(result.packages, current.designerOwnershipCache, { ...options, sharedFromEnabled: current.sharedFromEnabled === true });
        session.context = result.context;
        session.entries = new Map(plan.entries.map((entry) => [key(entry), entry]));
        return { ok: true, context: result.context, plan };
      }
      const session = sessions.get(tabId);
      if (!session || !same(session.context, message.context) || session.context.url !== window.location.href) return { ok: false, reason: 'context-changed' };
      if (message.type === 'pipeline-export-read') {
        const entry = session.entries.get(key(message.entry));
        if (!entry) return { ok: false, reason: 'entry-unavailable' };
        return request(session, 'read', { entry });
      }
      if (message.type === 'pipeline-export-verify') return request(session, 'verify');
      return { ok: false, reason: 'unsupported-operation' };
    })().then((result) => reply(respond, result)).catch(() => { close(tabId); reply(respond, { ok: false, reason: 'setup-required' }); });
    return true;
  });

  // Page content is untrusted; accept only outstanding responses from the same document and origin.
  window.addEventListener('message', (event) => {
    if (event.source !== window || event.origin !== window.location.origin || event.data?.source !== source || event.data.type !== 'pipeline-export-operation-response') return;
    const request = pending.get(event.data.requestId);
    if (!request) return;
    pending.delete(event.data.requestId);
    window.clearTimeout(request.timer);
    if (request.url !== window.location.href) { request.resolve({ ok: false, reason: 'context-changed' }); return; }
    try { request.resolve(project(event.data, request.operation)); }
    catch { request.resolve({ ok: false, reason: 'source-unavailable' }); }
  });

  // Cache timestamps/labels can change without interrupting a valid job; removed membership cannot.
  chrome.storage.onChanged.addListener((changes, area) => {
    if (area !== 'local') return;
    const known = changes.designerOwnershipCache ? PipelineExportCore.sourceNames(changes.designerOwnershipCache.newValue) : null;
    for (const [id, session] of sessions) {
      if (session.override) continue;
      if (changes.sharedFromEnabled?.newValue === false || known && (!session.context || [...session.entries.values()].some((entry) => !known.get(entry.packageName)?.has(entry.name)))) close(id);
    }
  });
  window.addEventListener('pagehide', () => { for (const id of [...sessions.keys()]) close(id); });
})();
