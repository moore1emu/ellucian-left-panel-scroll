(() => {
  'use strict';

  // Authorize source reads in the isolated document, never through page-controlled window messages.
  const source = 'ellucian-left-panel-scroll';
  const pending = new Map();
  const sessions = new Map();
  const key = (entry) => JSON.stringify([entry.packageName, entry.name, entry.type, entry.version, entry.state]);
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
      return { name: text(pkg.name), version: text(pkg.version), pipelines: pkg.pipelines.map((item) => ({ name: text(item.name), version: text(item.version), type: text(item.type),
        ...(item.state === 'draft' || item.state === 'published' ? {state:item.state} : {}),
        ...(Number.isSafeInteger(item.sharing?.observedAt) && Array.isArray(item.sharing.destinations) && item.sharing.destinations.length <= 16 ?
          {sharing:{observedAt:item.sharing.observedAt,destinations:item.sharing.destinations.map(d=>({environment:text(d.environment),version:text(d.version)}))}} : {}) })) };
    });
    return { ok: true, context, packages, environment: typeof result.environment === 'string' ? result.environment.slice(0,500) : '' };
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
        close(session.clientId);
        resolve({ ok: false, reason: 'request-timeout' });
      }, operation === 'prepare' ? 180000 : 60000);
      pending.set(requestId, { sessionId: session.id, operation, url: window.location.href, timer, resolve });
      window.postMessage({ source, type: 'pipeline-export-operation', requestId, operation, sessionId: session.id, context: session.context, ...details }, window.location.origin);
    });
  }

  chrome.runtime.onMessage.addListener((message, sender, respond) => {
    // Only the worker may relay; reject the old direct extension-tab route instead of dropping identity checks.
    if (!chrome.runtime?.id || sender.id !== chrome.runtime.id || sender.tab || sender.url && sender.url !== chrome.runtime.getURL('background.js')) return;
    if (message?.type === 'pipeline-export-bind' && typeof message.bindingId === 'string' && message.bindingId.length <= 100) {
      // Return through runtime messaging so Chrome supplies this source document's real tab/document identity.
      chrome.runtime.sendMessage({ type: 'pipeline-export-bind-source', bindingId: message.bindingId, url: window.location.href })
        .then((result) => reply(respond, { ok: result?.ok === true })).catch(() => reply(respond, { ok: false }));
      return true;
    }
    if (!['pipeline-export-preview', 'pipeline-export-read', 'pipeline-export-verify', 'pipeline-export-cancel'].includes(message?.type) ||
      typeof message.clientId !== 'string' || !message.clientId || message.clientId.length > 100) return;
    const clientId = message.clientId;
    if (message.type === 'pipeline-export-cancel') { close(clientId); reply(respond, { ok: true }); return; }
    (async () => {
      // The worker targets the original browser document; also reject same-document route changes before any reads.
      if (message.sourceUrl !== window.location.href) return { ok: false, reason: 'context-changed' };
      if (message.type === 'pipeline-export-preview') {
        close(clientId);
        const kind = message.sourceKind || 'packages';
        const route = {packages:/\/data-connect\/home\/?$/iu,designer:/\/data-connect-designer\/?$/iu,'api-designer':/\/APIDesigner\/?$/u}[kind];
        if (window.location.protocol !== 'https:' || !route?.test(window.location.pathname)) return { ok: false, reason: kind === 'packages' ? 'open-packages' : 'context-changed' };
        // Register before awaiting storage so immediate cancellation cannot restart metadata work afterward.
        const session = { id: crypto.randomUUID(), clientId, kind, override: kind === 'packages' && message.overrideConfirmed === true, entries: new Map(), context: null };
        sessions.set(clientId, session);
        // Read source metadata once per preview; later consent/cache changes invalidate affected sessions.
        const filtered = kind === 'packages' && !session.override;
        // Current exports do not read/process the Shared From list; retain the old filtered protocol only.
        const defaults = {exportToolsEnabled:false,...(filtered ? {sharedFromEnabled:false,designerOwnershipCache:{}} : {})};
        const saved = await chrome.storage.local.get(defaults);
        if (sessions.get(clientId) !== session) return { ok: false, reason: 'cancelled' };
        // Register before authorization reads so opt-out/cancel cannot be overtaken by a late read.
        if (saved.exportToolsEnabled !== true) { close(clientId); return {ok:false,reason:'tools-disabled'}; }
        const options = { sharedFromEnabled: saved.sharedFromEnabled === true, overrideConfirmed: message.overrideConfirmed === true };
        if (kind === 'packages') PipelineExportCore.buildPlan([], saved.designerOwnershipCache, options);
        const result = await request(session, 'prepare', { overrideConfirmed: session.override,
          sourceKind:kind, exportMode:['draft','published','both'].includes(message.exportMode) ? message.exportMode : 'published',
          packageNames: filtered ? [...PipelineExportCore.sourceNames(saved.designerOwnershipCache).keys()] : [] });
        if (!result?.ok || sessions.get(clientId) !== session || !result.context || result.context.url !== window.location.href) {
          // An old response must not cancel a newer preview owned by the same export client.
          if (sessions.get(clientId) === session) close(clientId);
          return { ok: false, reason: result?.reason || 'context-changed' };
        }
        // Exact cache filtering stays isolated from untrusted page code and smart-search normalization.
        const current = await chrome.storage.local.get(defaults);
        if (sessions.get(clientId) !== session) return { ok: false, reason: 'cancelled' };
        if (current.exportToolsEnabled !== true) { close(clientId); return {ok:false,reason:'tools-disabled'}; }
        const plan = kind === 'packages' ? PipelineExportCore.buildPlan(result.packages, current.designerOwnershipCache, { ...options, sharedFromEnabled: current.sharedFromEnabled === true }) : PipelineExportCore.buildSourcePlan(result.packages);
        session.context = result.context;
        session.entries = new Map(plan.entries.map((entry) => [key(entry), entry]));
        // Keep: use only the saved name for this exact verified tenant ID, never page-supplied names or another tenant (2.1.1).
        const cache = current.designerOwnershipCache || {};
        const name = Object.hasOwn(cache, result.context.tenantId) ? cache[result.context.tenantId]?.environment : null;
        const environment = typeof name === 'string' && name.trim() && name.length <= 500 ? name.trim() : result.context.tenantId;
        return { ok: true, context: result.context, environment:result.environment || environment, sourceKind:kind, plan };
      }
      const session = sessions.get(clientId);
      if (!session || !same(session.context, message.context) || session.context.url !== window.location.href) return { ok: false, reason: 'context-changed' };
      const tools = await chrome.storage.local.get({exportToolsEnabled:false});
      if (sessions.get(clientId) !== session) return {ok:false,reason:'cancelled'};
      if (tools.exportToolsEnabled !== true) { close(clientId); return {ok:false,reason:'tools-disabled'}; }
      if (message.type === 'pipeline-export-read') {
        const entry = session.entries.get(key(message.entry));
        if (!entry) return { ok: false, reason: 'entry-unavailable' };
        return request(session, 'read', { entry });
      }
      if (message.type === 'pipeline-export-verify') return request(session, 'verify');
      return { ok: false, reason: 'unsupported-operation' };
    })().then((result) => reply(respond, result)).catch(() => { close(clientId); reply(respond, { ok: false, reason: 'setup-required' }); });
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
    if (area === 'local' && changes.exportToolsEnabled?.newValue !== true && changes.exportToolsEnabled) {
      for (const id of [...sessions.keys()]) close(id);
    }
    if (area !== 'local') return;
    const known = changes.designerOwnershipCache ? PipelineExportCore.sourceNames(changes.designerOwnershipCache.newValue) : null;
    const knownTransforms = known ? PipelineExportCore.sourceNames(changes.designerOwnershipCache.newValue, 'transformer') : null;
    for (const [id, session] of sessions) {
      if (session.override || session.kind !== 'packages') continue;
      if (changes.sharedFromEnabled?.newValue === false || known && (!session.context || [...session.entries.values()].some((entry) => !(entry.type === 'transformer' ? knownTransforms : known).get(entry.packageName)?.has(entry.name)))) close(id);
    }
  });
  window.addEventListener('pagehide', () => { for (const id of [...sessions.keys()]) close(id); });
})();
