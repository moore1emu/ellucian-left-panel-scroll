'use strict';

// Exercise actual MAIN/isolated adapters with synthetic services; never connect to a live tenant.
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const assert = require('node:assert/strict');
const { randomUUID } = require('node:crypto');
const root = path.resolve(__dirname, '..');
const turn = () => new Promise((resolve) => setImmediate(resolve));

function fixture() {
  const events = new Map();
  const timers = new Map();
  let timerId = 0;
  let runtimeListener;
  let storageListener;
  const refs = Array.from({ length: 120 }, (_, index) => ({ nameAndExtension: `package${index}.json`, version: 'v1.0.0' }));
  refs.push({ nameAndExtension: 'supplier.json', version: 'v1.0.0' });
  const packages = refs.map((ref, index) => ({ name: index === 120 ? 'Supplier' : `Package ${index}`, nameAndExtension: ref.nameAndExtension, version: ref.version,
    pipelines: [{ name: `Pipeline ${index}`, version: 'v1.2.3', type: index % 3 === 0 ? 'subpipeline' : index % 3 === 1 ? 'api' : 'integration' }] }));
  const getJwt = () => { throw new Error('Extension code must not invoke the session callback'); };
  const owner = { context: { getJwt, tenantId: 'synthetic-tenant' }, state: { menu: packages.map((pkg) => ({ 'package-element': pkg })) } };
  const row = { __reactFiber$fixture: { return: { stateNode: owner } } };
  const saved = { sharedFromEnabled: true, designerOwnershipCache: { synthetic: { packages: packages.slice(0, 120).map((pkg) => ({ name: pkg.name, pipelines: pkg.pipelines.map((item) => item.name) })) } } };
  const stats = { active: 0, max: 0, reads: 0, packageReads: 0, lists: 0, storageReads: 0 };
  const holds = [];
  const flags = { hold: false, missingVersion: false, mismatch: false };
  // A proxy catches even accidental inspection/spreading of the opaque native authentication config.
  // Promise resolution checks thenability; reject every actual authentication-property read.
  const opaque = new Proxy({}, { get: (_, key) => { if (key === 'then') return undefined; throw new Error('Authentication config inspected'); }, ownKeys: () => { throw new Error('Authentication config copied'); } });
  const service = async (run) => {
    stats.active++; stats.max = Math.max(stats.max, stats.active);
    try { await turn(); if (flags.hold) await new Promise((resolve) => holds.push(resolve)); return run(); } finally { stats.active--; }
  };
  const server = {
    G9: async (callback, tenant, expand) => { assert.equal(callback, getJwt); assert.equal(tenant, 'synthetic-tenant'); assert.equal(expand, false); stats.lists++; return service(() => refs); },
    db: async (callback) => { assert.equal(callback, getJwt); return opaque; },
    bP: async (config, tenant, release, filename) => { assert.equal(config, opaque); assert.equal(tenant, 'synthetic-tenant'); assert.equal(release, 'v1.0.0'); stats.packageReads++; return service(() => packages.find((pkg) => pkg.nameAndExtension === filename)); },
    B0: async (callback, tenant, release, name) => { assert.equal(callback, getJwt); assert.equal(tenant, 'synthetic-tenant'); stats.reads++; return service(() => ({ name, version: flags.missingVersion ? undefined : flags.mismatch ? '1.2.4' : '1.2.3', fittings: [], routeUsed: release })); },
  };
  const window = { location: { protocol: 'https:', origin: 'https://synthetic.test', pathname: '/fixture/data-connect/home', href: 'https://synthetic.test/fixture/data-connect/home' }, crypto: { randomUUID },
    addEventListener: (type, callback) => { if (!events.has(type)) events.set(type, []); events.get(type).push(callback); },
    postMessage: (data) => queueMicrotask(() => { for (const callback of events.get('message') || []) callback({ source: window, origin: window.location.origin, data }); }),
    setTimeout: (callback, delay) => { const id = ++timerId; timers.set(id, { callback, delay }); return id; }, clearTimeout: (id) => timers.delete(id),
    webpackChunkexperience_exchange_extension: { },
  };
  // Supply the verified webpack module without fetching scripts, executing callbacks, or reading tokens.
  window.webpackChunkexperience_exchange_extension = [];
  window.webpackChunkexperience_exchange_extension.push = (entry) => entry[2]((name) => { assert.equal(name, './src/server/ServerHelper.js'); return server; });
  const document = { querySelector: (selector) => selector === 'li[data-level="1"]' ? row : null };
  const main = vm.createContext({ window, document, crypto: { randomUUID }, TextEncoder, Blob });
  for (const file of ['pipeline-export-native.js', 'page-index.js']) vm.runInContext(fs.readFileSync(path.join(root, file), 'utf8'), main);
  const chrome = { runtime: { id: 'synthetic', getURL: (file) => 'chrome-extension://synthetic/' + file, onMessage: { addListener: (callback) => { runtimeListener = callback; } } },
    storage: { local: { get: async (defaults) => { stats.storageReads++; return { ...defaults, ...saved }; } }, onChanged: { addListener: (callback) => { storageListener = callback; } } } };
  const isolated = vm.createContext({ window, chrome, crypto: { randomUUID }, TextEncoder, Uint8Array, Uint32Array, DataView, Blob });
  for (const file of ['pipeline-export-core.js', 'pipeline-export-session.js', 'pipeline-export-bridge.js']) vm.runInContext(fs.readFileSync(path.join(root, file), 'utf8'), isolated);
  // Model the worker relay, not the fabricated direct sender.tab that hid the browser contract bug.
  const sender = { id: 'synthetic', url: 'chrome-extension://synthetic/background.js' };
  const call = (message, overrideSender = sender) => new Promise((resolve) => { const wait = runtimeListener({ ...message, clientId: 'client', sourceUrl: window.location.href }, overrideSender, resolve); if (wait !== true && !message.type.endsWith('cancel')) resolve(undefined); });
  return { call, isolated, flags, holds, stats, window, timers, saved, owner, storageListener };
}

async function run() {
  const f = fixture();
  const preview = await f.call({ type: 'pipeline-export-preview' });
  assert.equal(preview.ok, true);
  assert.equal(preview.plan.entries.length, 120);
  assert.equal(f.stats.packageReads, 120);
  assert.equal(f.stats.reads, 0, 'Preview must not request pipeline code');
  assert.equal(f.stats.max, 6);
  assert.equal(f.stats.storageReads, 2, 'Consent/ownership reads happen per preview, not per pipeline');

  // Collect all types through the actual isolated authorization and native request queue.
  const zip = await f.isolated.PipelineExportSession.collect(preview.plan.entries, {
    verify: async () => { const result = await f.call({ type: 'pipeline-export-verify', context: preview.context }); assert.equal(result.ok, true); },
    read: async (entry) => { const result = await f.call({ type: 'pipeline-export-read', context: preview.context, entry }); assert.equal(result.ok, true); return result.data; },
  });
  assert.equal(zip.type, 'application/zip');
  assert.equal(f.stats.reads, 120);
  assert.equal(f.stats.max, 6);
  assert.equal(f.stats.storageReads, 2);
  const foreign = await f.call({ type: 'pipeline-export-read', context: preview.context, entry: { packageName: 'Supplier', name: 'Pipeline 120', version: 'v1.2.3', type: 'sub-pipeline' } });
  assert.equal(foreign.ok, false);
  assert.equal(f.stats.reads, 120);

  // The separately confirmed override includes accessible content without requiring source-cache consent.
  await f.call({ type: 'pipeline-export-cancel' });
  f.saved.sharedFromEnabled = false;
  const denied = await f.call({ type: 'pipeline-export-preview' });
  assert.equal(denied.ok, false);
  const all = await f.call({ type: 'pipeline-export-preview', overrideConfirmed: true });
  assert.equal(all.plan.entries.length, 121);

  // Missing or mismatched Sub-Pipeline versions fail closed instead of becoming mislabeled exports.
  const sub = all.plan.entries.find((entry) => entry.type === 'sub-pipeline');
  f.flags.missingVersion = true;
  const missing = await f.call({ type: 'pipeline-export-read', context: all.context, entry: sub });
  assert.equal(missing.reason, 'version-unverified');
  assert.equal(missing.data, undefined);
  f.flags.missingVersion = false; f.flags.mismatch = true;
  assert.equal((await f.call({ type: 'pipeline-export-read', context: all.context, entry: sub })).reason, 'version-mismatch');
  f.flags.mismatch = false;

  // A changed native tenant is detected before another service call can begin.
  const before = f.stats.reads;
  f.owner.context.tenantId = 'different-tenant';
  assert.equal((await f.call({ type: 'pipeline-export-read', context: all.context, entry: sub })).reason, 'context-changed');
  assert.equal(f.stats.reads, before);

  // Native timeouts retain occupied slots; retry cannot start another six actual requests.
  const stalled = fixture();
  const staged = await stalled.call({ type: 'pipeline-export-preview' });
  stalled.flags.hold = true;
  const jobs = staged.plan.entries.slice(0, 6).map((entry) => stalled.call({ type: 'pipeline-export-read', context: staged.context, entry }));
  for (let attempts = 0; stalled.holds.length < 6 && attempts < 50; attempts++) await turn();
  assert.equal(stalled.holds.length, 6);
  for (const timer of [...stalled.timers.values()]) if (timer.delay === 30000) timer.callback();
  assert.ok((await Promise.all(jobs)).every((reply) => reply.ok === false));
  const count = stalled.stats.reads;
  const retry = await stalled.call({ type: 'pipeline-export-preview' });
  assert.equal(retry.ok, false);
  assert.equal(stalled.stats.reads, count);
  assert.equal(stalled.stats.active, 6);
  stalled.flags.hold = false;
  stalled.holds.forEach((resolve) => resolve());
  await turn(); await turn();
  assert.equal(stalled.stats.active, 0);
  console.log('PASS native export flow: Packages-only preview, all types, exact ownership, override, opaque auth, six slots, version guards, tenant changes, and retained timeout capacity');
}
run().catch((error) => { console.error(error); process.exitCode = 1; });
