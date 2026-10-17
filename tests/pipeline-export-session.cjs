"use strict";

// Run export jobs with synthetic readers only; no account, browser storage, or network exists here.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const context = vm.createContext({ TextEncoder, Uint8Array, Uint32Array, DataView, Blob });
for (const file of ['pipeline-export-core.js', 'pipeline-export-session.js']) vm.runInContext(fs.readFileSync(path.join(__dirname, '..', file), 'utf8'), context);
const entries = Array.from({ length: 120 }, (_, index) => ({ packageName: 'Synthetic Package', name: `Pipeline ${index}`, type: 'pipeline', version: '1.0.0' }));
const turn = () => new Promise((resolve) => setImmediate(resolve));

async function run() {
  let active = 0;
  let maximum = 0;
  let reads = 0;
  let checks = 0;
  let progress = 0;
  // Verify the complete 120-record collection, bounded readers, and independent archive output.
  const zip = await context.PipelineExportSession.collect(entries, {
    verify: async () => { checks++; },
    read: async (entry) => { reads++; active++; maximum = Math.max(maximum, active); await turn(); active--; return { name: entry.name, version: entry.version, fittings: [] }; },
    onProgress: ({ completed, total }) => { progress = completed; assert.equal(total, 120); },
  });
  assert.equal(reads, 120);
  assert.equal(progress, 120);
  assert.equal(checks, 241);
  assert.equal(maximum, 6);
  assert.equal(zip.type, 'application/zip');

  // Cancellation cannot start queued records or produce an archive from already-completed files.
  const controller = new AbortController();
  let cancelledReads = 0;
  await assert.rejects(context.PipelineExportSession.collect(entries, {
    signal: controller.signal, verify: async () => {},
    read: async () => { cancelledReads++; controller.abort(); await turn(); return {}; },
  }), /cancelled/);
  assert.equal(cancelledReads, 1);

  // A failed native record discards the whole export, rather than silently omitting it.
  let failedReads = 0;
  await assert.rejects(context.PipelineExportSession.collect(entries, {
    verify: async () => {}, read: async () => { failedReads++; throw new Error('Synthetic unavailable'); },
  }), /Synthetic unavailable/);
  assert.ok(failedReads <= 6);

  // A context/consent failure stops before source JSON is requested.
  await assert.rejects(context.PipelineExportSession.collect(entries, {
    verify: async () => { throw new Error('Synthetic tenant changed'); },
    read: async () => { throw new Error('Should not read'); },
  }), /tenant changed/);

  // Invalid native data cannot become a successful empty pipeline JSON file.
  for (const data of [null, [], { error: true }]) {
    await assert.rejects(context.PipelineExportSession.collect(entries.slice(0, 1), { verify: async () => {}, read: async () => data }), /unavailable/);
  }
  console.log('PASS export runner: six readers, 120 records, cancellation, context checks, and all-or-nothing failures');
}
run().catch((error) => { console.error(error); process.exitCode = 1; });
