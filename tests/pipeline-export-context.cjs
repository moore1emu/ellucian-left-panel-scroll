"use strict";

// Use the actual page helper and isolated bridge with synthetic React ancestry and runtime messages.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const root = path.resolve(__dirname, '..');
const source = 'ellucian-left-panel-scroll';
const origin = 'https://synthetic.test';
const listeners = new Map();
const emitted = [];
const state = { currentTenant: 'synthetic-tenant', packageList: Array.from({ length: 120 }, (_, index) => ({ name: `Package ${index}`, version: 'v1.0.0', pipelines: Array.from({ length: 120 }, (_, number) => ({ name: `Pipeline ${number}`, version: '1.0.0', type: 'api', secretPayload: 'must-not-leave-page' })) })) };
const node = { __reactFiber$fixture: { return: { stateNode: { state } } } };
const window = { location: { origin, protocol: 'https:', pathname: '/fixture/data-connect-designer/', href: origin + '/fixture/data-connect-designer/' },
  addEventListener: (type, callback) => listeners.set(type, callback), postMessage: (message) => emitted.push(message) };
const document = { querySelector: (selector) => selector === '#pipelineManager-main-customBlock' ? node : null };
vm.runInNewContext(fs.readFileSync(path.join(root, 'page-index.js'), 'utf8'), { window, document });
listeners.get('message')({ source: window, data: { source, type: 'pipeline-export-context-request', requestId: 'preview' } });
const metadata = emitted.at(-1);
assert.equal(metadata.packages.length, 120);
assert.equal(metadata.packages[119].pipelines.length, 120);
assert.equal(JSON.stringify(metadata).includes('secretPayload'), false);
assert.equal(metadata.tenantId, 'synthetic-tenant');

// A draft-only package is excluded, and replaced/unmounted roots cannot reuse earlier metadata.
state.packageList = [{ name: 'Draft Only', pipelines: [{ name: 'Draft', version: '', type: 'api' }] }];
listeners.get('message')({ source: window, data: { source, type: 'pipeline-export-context-request', requestId: 'draft' } });
assert.equal(emitted.at(-1).packages.length, 0);
state.currentTenant = '';
const before = emitted.length;
listeners.get('message')({ source: window, data: { source, type: 'pipeline-export-context-request', requestId: 'missing' } });
assert.equal(emitted.length, before);

let runtimeListener;
let timerId = 0;
const timers = new Map();
const bridgeListeners = new Map();
const bridgeMessages = [];
const bridgeWindow = { location: { ...window.location }, addEventListener: (type, callback) => bridgeListeners.set(type, callback), postMessage: (message) => bridgeMessages.push(message),
  setTimeout: (callback) => { const id = ++timerId; timers.set(id, callback); return id; }, clearTimeout: (id) => timers.delete(id) };
const url = 'chrome-extension://synthetic/pipeline-export.html';
const chrome = { runtime: { id: 'synthetic', getURL: () => url, onMessage: { addListener: (callback) => { runtimeListener = callback; } } } };
vm.runInNewContext(fs.readFileSync(path.join(root, 'pipeline-export-bridge.js'), 'utf8'), { window: bridgeWindow, chrome, crypto: { randomUUID: () => 'synthetic-request' } });
const sender = { id: 'synthetic', url: url + '#ticket', tab: { id: 7 } };

// Unknown senders cannot begin page inspection, and arbitrary page fields are not reflected back.
assert.equal(runtimeListener({ type: 'pipeline-export-preview' }, { ...sender, url: origin }, () => { throw new Error('Unauthorized callback'); }), undefined);
let reply;
assert.equal(runtimeListener({ type: 'pipeline-export-preview' }, sender, (result) => { reply = result; }), true);
const request = bridgeMessages.at(-1);
bridgeListeners.get('message')({ source: bridgeWindow, origin, data: { ...metadata, requestId: request.requestId, packages: [{ name: 'Package', pipelines: [{ name: 'Pipeline', version: '1.0.0', type: 'api', secretPayload: 'discard' }], secretPayload: 'discard' }] } });
assert.equal(reply.ok, true);
assert.equal(JSON.stringify(reply).includes('secretPayload'), false);
assert.equal(timers.size, 0);

// A tenant-route switch invalidates an outstanding reply rather than accepting stale metadata.
runtimeListener({ type: 'pipeline-export-preview' }, sender, (result) => { reply = result; });
bridgeWindow.location.href += '?changed';
bridgeListeners.get('message')({ source: bridgeWindow, origin, data: { ...metadata, requestId: bridgeMessages.at(-1).requestId } });
assert.equal(reply.ok, false);
bridgeWindow.location.pathname = '/fixture/data-connect/home';
runtimeListener({ type: 'pipeline-export-preview' }, sender, (result) => { reply = result; });
assert.equal(reply.reason, 'open-designer');
// Old response callbacks may throw after an extension reload; navigation still cleans all requests.
bridgeWindow.location.pathname = '/fixture/data-connect-designer/';
runtimeListener({ type: 'pipeline-export-preview' }, sender, () => { throw new Error('Synthetic extension context invalidated'); });
assert.doesNotThrow(() => bridgeListeners.get('pagehide')());
assert.equal(timers.size, 0);
console.log('PASS export metadata: complete 120×120 model, draft exclusion, no contents, sender/route checks, and response projection');
