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
const timers = new Map();
const window = { location: { href: 'https://synthetic.test/data-connect/home', origin: 'https://synthetic.test', protocol: 'https:', pathname: '/data-connect/home' },
  addEventListener: (type, callback) => events.set(type, callback), postMessage: (message) => messages.push(message),
  setTimeout: (callback) => { timers.set(++nextTimer, callback); return nextTimer; }, clearTimeout: (id) => timers.delete(id) };
const sender = { id: 'synthetic', url: 'chrome-extension://synthetic/pipeline-export.html#ticket', tab: { id: 7 } };
const chrome = { runtime: { id: sender.id, getURL: () => sender.url.split('#')[0], onMessage: { addListener: (callback) => { runtime = callback; } } },
  storage: { local: { get: async () => ({ sharedFromEnabled: true, designerOwnershipCache: { demo: { packages: [{ name: 'Package', pipelines: ['Pipeline'] }] } } }) }, onChanged: { addListener() {} } } };
const context = vm.createContext({ window, chrome, crypto: { randomUUID }, TextEncoder, Uint8Array, Uint32Array });
for (const file of ['pipeline-export-core.js', 'pipeline-export-bridge.js']) vm.runInContext(fs.readFileSync(path.join(root, file), 'utf8'), context);
const respond = (data, origin = window.location.origin) => events.get('message')({ source: window, origin, data: { source: 'ellucian-left-panel-scroll', type: 'pipeline-export-operation-response', ...data } });

async function run() {
  // Untrusted tabs cannot start inspection, and Designer is never an export entry point.
  assert.equal(runtime({ type: 'pipeline-export-preview' }, { ...sender, url: 'https://synthetic.test' }, () => {}), undefined);
  window.location.pathname = '/data-connect-designer/';
  const unavailable = await new Promise((resolve) => runtime({ type: 'pipeline-export-preview' }, sender, resolve));
  assert.equal(unavailable.reason, 'open-packages');
  window.location.pathname = '/data-connect/home';
  const preview = new Promise((resolve) => runtime({ type: 'pipeline-export-preview' }, sender, resolve));
  await turn();
  const request = messages.at(-1);
  const metadata = { requestId: request.requestId, ok: true,
    context: { url: window.location.href, tenantId: 'tenant', documentKey: 'document', sessionId: request.sessionId, secret: 'discard' },
    packages: [{ name: 'Package', version: 'v1.0.0', secret: 'discard', pipelines: [{ name: 'Pipeline', version: '1.0.0', type: 'api', secret: 'discard' }] }], secret: 'discard' };
  respond(metadata, 'https://other.test');
  assert.equal(timers.size, 1);
  respond(metadata);
  const result = await preview;
  assert.equal(result.ok, true);
  assert.equal(result.plan.entries.length, 1);
  assert.equal(JSON.stringify(result).includes('secret'), false);
  assert.equal(timers.size, 0);

  // Navigation rejects outstanding verification replies, even if their request identifier matches.
  const verification = new Promise((resolve) => runtime({ type: 'pipeline-export-verify', context: result.context }, sender, resolve));
  const verifyRequest = messages.at(-1);
  window.location.href += '?changed';
  respond({ requestId: verifyRequest.requestId, ok: true });
  assert.equal((await verification).reason, 'context-changed');
  assert.doesNotThrow(() => events.get('pagehide')());
  assert.equal(timers.size, 0);
  console.log('PASS export boundary: Packages-only entry, sender/origin/route checks, metadata projection, and navigation cleanup');
}
run().catch((error) => { console.error(error); process.exitCode = 1; });
