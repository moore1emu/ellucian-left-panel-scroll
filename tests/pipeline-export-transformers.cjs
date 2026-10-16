'use strict';

// Exercise transformer reads and typed ownership with synthetic native services only.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const root = path.resolve(__dirname, '..');
const context = vm.createContext({ TextEncoder, Uint8Array, Uint32Array, DataView, Blob });
for (const name of ['pipeline-export-native.js', 'pipeline-export-core.js', 'pipeline-export-session.js', 'favorites-data.js']) {
  vm.runInContext(fs.readFileSync(path.join(root, name), 'utf8'), context);
}
const core = context.PipelineExportCore;
const cache = { tenant: { environment: 'Synthetic', checkedAt: Date.now() - 1000,
  packages: [{ name: 'Owned', pipelines: ['Same'], transformFunctions: ['Function'] }] } };
const metadata = [{ name: 'Owned', pipelines: [
  { name: 'Same', version: 'v1.0.0', type: 'pipeline' },
  { name: 'Same', version: 'v1.0.0', type: 'transformer' },
  { name: 'Function', version: 'v1.0.0', type: 'transformer' },
  { name: 'Function', version: 'v1.1.0', type: 'transformer' },
  { name: 'Supplier', version: 'v1.0.0', type: 'transformer' },
] }];

async function run() {
  // Old caches and same-named pipelines must never authorize transformer downloads.
  const plan = core.buildPlan(metadata, cache, { sharedFromEnabled: true });
  assert.deepEqual(Array.from(plan.entries, item => item.type).sort(), ['pipeline', 'transformer']);
  assert.equal(plan.entries.find(item => item.type === 'transformer').version, 'v1.1.0');
  const old = { tenant: { packages: [{ name: 'Owned', pipelines: ['Same', 'Function'] }] } };
  assert.equal(core.buildPlan(metadata, old, { sharedFromEnabled: true }).entries.length, 1);
  assert.equal(core.buildPlan(metadata, {}, { overrideConfirmed: true }).entries.length, 4);
  assert.equal(core.filePath({ packageName: 'Owned', name: 'Function', type: 'transformer' }), 'Owned/Function.js');

  // Any authentication inspection/copy fails; native helpers alone receive the session callback.
  const opaque = new Proxy({}, { get: (_, key) => { if (key === 'then') return undefined; throw Error('Config inspected'); }, ownKeys: () => { throw Error('Config copied'); } });
  const callback = () => { throw Error('Session callback invoked by extension'); };
  const source = '// Synthetic only\nfunction transform(message) { return message; }\n';
  let reply = { status: 200, data: source };
  let requests = 0;
  let authenticated = 0;
  let changed = false;
  const server = { G9() {}, B0() { throw Error('Transformer used pipeline reader'); },
    db: async (value) => { assert.equal(value, callback); authenticated++; return opaque; },
    bP: async (config) => { assert.equal(config, opaque); return { name: 'Owned', pipelines: [], transformFunctions: [{ name: 'Function', version: 'v1.1.0' }] }; } };
  const http = { get: async (url, config) => {
    requests++;
    assert.equal(url, 'https://semver-s3-service.prod.10005.elluciancloud.com/artifact/synthetic-tenant/transformFunction/latest/Function.js');
    assert.equal(config, opaque);
    return reply;
  } };
  const adapter = context.PipelineExportNative.create(server, callback, 'synthetic-tenant', async job => job(), http,
    () => { if (changed) throw Error('Synthetic context changed'); });
  const ref = { version: 'v1.0.0', filename: 'owned.json' };
  const pkg = await adapter.package(ref);
  assert.equal(pkg.pipelines[0].type, 'transformer');
  assert.equal(requests, 0, 'Preview must not retrieve JavaScript');
  const entry = { packageName: 'Owned', name: 'Function', version: 'v1.1.0', type: 'transformer' };
  assert.equal(await adapter.read(entry, ref), source);

  // Malformed source, login HTML, non-200 replies, or unavailable readers must not produce an archive.
  for (const invalid of [{ status: 200, data: {} }, { status: 200, data: '' }, { status: 200, data: '<!DOCTYPE html><html>Sign in</html>' }, { status: 403, data: source }]) {
    reply = invalid;
    await assert.rejects(adapter.read(entry, ref), /source-unavailable/);
  }
  reply = { status: 200, data: source };
  const before = requests;
  changed = true;
  await assert.rejects(adapter.read(entry, ref), /context changed/);
  assert.equal(requests, before, 'No HTTP source call may start after a context change during authentication');
  changed = false;
  await assert.rejects(adapter.read({ ...entry, name: '../Function' }, ref), /unsupported-name/);
  const noHttp = context.PipelineExportNative.create(server, callback, 'synthetic-tenant', async job => job());
  await assert.rejects(noHttp.read(entry, ref), /reader-unavailable/);

  // Collect plain JavaScript without JSON quoting, newline rewrites, or executing downloaded code.
  const zip = await context.PipelineExportSession.collect([entry], { verify: async () => {}, read: item => adapter.read(item, ref) });
  const bytes = Buffer.from(await zip.arrayBuffer());
  const start = 30 + bytes.readUInt16LE(26) + bytes.readUInt16LE(28);
  assert.equal(bytes.subarray(start, start + bytes.readUInt32LE(18)).toString(), source);
  await assert.rejects(context.PipelineExportSession.collect([entry], { verify: async () => {}, read: async () => ({ code: source }) }), /source unavailable/);
  assert.ok(authenticated > 1);

  // Optional source metadata round-trips without credentials/code or requiring a backup schema migration.
  const backup = context.FavoritesData.exportData({ designerOwnershipCache: cache }, '2.0.7');
  assert.deepEqual(Array.from(backup.environments[0].packages[0].transformFunctions), ['Function']);
  const roundTrip = context.FavoritesData.backup(backup);
  assert.deepEqual(Array.from(roundTrip.environments[0].packages[0].transformFunctions), ['Function']);
  // Legacy groups retain observations in backups but never gain guessed package ownership.
  const unknown = context.FavoritesData.exportData({ designerOwnershipCache: { legacy: { checkedAt: Date.now(), environment: 'Test',
    packages: [{ name: null, pipelines: [], transformFunctions: ['LegacyFunction'] }] } } }, '2.0.7');
  assert.equal(unknown.environments[0].packages[0].packageNameRecorded, false);
  assert.deepEqual(Array.from(unknown.environments[0].packages[0].transformFunctions), ['LegacyFunction']);
  const invalid = JSON.parse(JSON.stringify(backup));
  invalid.environments[0].packages[0].transformFunctions = 'not-an-array';
  assert.throws(() => context.FavoritesData.backup(invalid), /source transformers/);
  console.log('PASS transformer ownership, legacy isolation, latest metadata, fixed native GET/opaque auth, context guard, text validation, exact JS ZIP text, and backup round trip');
}
run().catch(error => { console.error(error); process.exitCode = 1; });
