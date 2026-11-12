"use strict";

// Probe the isolated boundary with synthetic messages, without touching account data or services.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { randomUUID } = require('node:crypto');
const root = path.resolve(__dirname, '..');
const turn = () => new Promise((resolve) => setImmediate(resolve));
const events = new Map();
const messages = [];
let runtime;
let nextTimer = 0;
let storageHold;
let storageChanged;
let sourceCache = { tenant: { environment: 'Saved Environment', packages: [{ name: 'Package', pipelines: ['Pipeline', 'Function'], transformFunctions: ['Function'] }] } };
const timers = new Map();
const window = { location: { href: 'https://synthetic.test/data-connect/home', origin: 'https://synthetic.test', protocol: 'https:', pathname: '/data-connect/home' },
  addEventListener: (type, callback) => events.set(type, callback), postMessage: (message) => messages.push(message),
  setTimeout: (callback) => { timers.set(++nextTimer, callback); return nextTimer; }, clearTimeout: (id) => timers.delete(id) };
// Worker-to-content envelopes omit sender.tab; routing fields come from the authenticated worker.
const sender = { id: 'synthetic', url: 'chrome-extension://synthetic/background.js' };
const chrome = { runtime: { id: sender.id, getURL: (file) => 'chrome-extension://synthetic/' + file, onMessage: { addListener: (callback) => { runtime = callback; } } },
  storage: { local: { get: async () => { if (storageHold) await storageHold; return { exportToolsEnabled:true, sharedFromEnabled: true, designerOwnershipCache: sourceCache }; } }, onChanged: { addListener(callback) { storageChanged = callback; } } } };
const context = vm.createContext({ window, chrome, crypto: { randomUUID }, TextEncoder, Uint8Array, Uint32Array });
for (const file of ['pipeline-export-core.js', 'pipeline-export-bridge.js']) vm.runInContext(fs.readFileSync(path.join(root, file), 'utf8'), context);
const respond = (data, origin = window.location.origin) => events.get('message')({ source: window, origin, data: { source: 'ellucian-left-panel-scroll', type: 'pipeline-export-operation-response', ...data } });
// Only the trusted worker supplies these bound routing fields.
const call = (message) => new Promise((resolve) => runtime({ ...message, clientId: 'client', sourceUrl: window.location.href }, sender, resolve));

async function run() {
  // Untrusted tabs cannot start inspection, and Designer is never an export entry point.
  assert.equal(runtime({ type: 'pipeline-export-preview' }, { ...sender, url: 'https://synthetic.test' }, () => {}), undefined);
  assert.equal(runtime({ type: 'pipeline-export-preview', clientId: 'client' }, { ...sender, url: 'chrome-extension://synthetic/pipeline-export.html#ticket' }, () => {}), undefined);
  assert.equal(runtime({ type: 'pipeline-export-preview', clientId: 'client' }, { ...sender, tab: { id: 7 } }, () => {}), undefined);
  window.location.pathname = '/data-connect-designer/';
  const unavailable = await call({ type: 'pipeline-export-preview' });
  assert.equal(unavailable.reason, 'open-packages');
  window.location.pathname = '/data-connect/home';
  const preview = call({ type: 'pipeline-export-preview' });
  await turn();
  const request = messages.at(-1);
  const metadata = { requestId: request.requestId, ok: true, environment: 'Synthetic Environment',
    context: { url: window.location.href, tenantId: 'tenant', documentKey: 'document', sessionId: request.sessionId, secret: 'discard' },
    packages: [{ name: 'Package', version: 'v1.0.0', secret: 'discard', pipelines: [{ name: 'Pipeline', version: '1.0.0', type: 'api', secret: 'discard' }] }], secret: 'discard' };
  respond(metadata, 'https://other.test');
  assert.equal(timers.size, 1);
  respond(metadata);
  const result = await preview;
  assert.equal(result.ok, true);
  assert.equal(result.plan.entries.length, 1);
  assert.equal(result.environment, 'Synthetic Environment', 'Native Experience labels are display metadata only, never tenant authorization');
  assert.equal(JSON.stringify(result).includes('secret'), false);
  assert.equal(timers.size, 0);

  // Navigation rejects outstanding verification replies, even if their request identifier matches.
  const verification = call({ type: 'pipeline-export-verify', context: result.context });
  await turn();
  const verifyRequest = messages.at(-1);
  window.location.href += '?changed';
  respond({ requestId: verifyRequest.requestId, ok: true });
  assert.equal((await verification).reason, 'context-changed');
  assert.doesNotThrow(() => events.get('pagehide')());
  assert.equal(timers.size, 0);
  // Cancellation during the first storage read cannot restart preparation after storage settles.
  let release;
  storageHold = new Promise((resolve) => { release = resolve; });
  const before = messages.length;
  const blocked = call({ type: 'pipeline-export-preview' });
  await call({ type: 'pipeline-export-cancel' });
  release();
  assert.equal((await blocked).reason, 'cancelled');
  storageHold = null;
  assert.equal(messages.slice(before).some((message) => message.operation === 'prepare'), false);
  // A superseded preview's late failure must not close the replacement session's pending operation.
  const first = call({ type: 'pipeline-export-preview' });
  await turn();
  const second = call({ type: 'pipeline-export-preview' });
  await turn();
  assert.equal((await first).ok, false);
  const latest = messages.at(-1);
  assert.equal(latest.operation, 'prepare');
  respond({ ...metadata, requestId: latest.requestId, context: { ...metadata.context, url: window.location.href, sessionId: latest.sessionId } });
  assert.equal((await second).ok, true);
  await call({ type: 'pipeline-export-cancel' });
  assert.equal(timers.size, 0);
  // A same-named pipeline cannot retain authorization after transformer membership is removed.
  const transformerPreview = call({ type: 'pipeline-export-preview' });
  await turn();
  const transformerRequest = messages.at(-1);
  respond({ ...metadata, requestId: transformerRequest.requestId,
    context: { ...metadata.context, url: window.location.href, sessionId: transformerRequest.sessionId },
    packages: [{ name: 'Package', version: 'v1.0.0', pipelines: [{ name: 'Function', version: 'v1.0.0', type: 'transformer' }] }] });
  const transformerResult = await transformerPreview;
  assert.equal(transformerResult.plan.entries.length, 1);
  sourceCache = { demo: { packages: [{ name: 'Package', pipelines: ['Pipeline', 'Function'] }] } };
  storageChanged({ designerOwnershipCache: { newValue: sourceCache } }, 'local');
  assert.equal((await call({ type: 'pipeline-export-read', context: transformerResult.context, entry: transformerResult.plan.entries[0] })).reason, 'context-changed');
  console.log('PASS export boundary: Packages-only entry, sender/origin/route checks, metadata projection, and navigation cleanup');
}
run().catch((error) => { console.error(error); process.exitCode = 1; });
