"use strict";

// Test ephemeral launch authorization without opening any real browser tabs.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
let listener;
let created;
let count = 0;
let now = 1;
const base = 'chrome-extension://synthetic-extension/';
const context = vm.createContext({ Date: { now: () => now }, crypto: { randomUUID: () => `ticket-${++count}` }, chrome: {
  runtime: { id: 'synthetic-extension', getURL: (file) => base + file, onMessage: { addListener: (callback) => { listener = callback; } } },
  tabs: { query: async () => [{ id: 7 }], create: async (details) => { created = details; return { id: 8 }; } },
} });
vm.runInContext(fs.readFileSync(path.join(__dirname, '..', 'pipeline-export-worker.js'), 'utf8'), context);
const popup = { id: 'synthetic-extension', url: base + 'popup.html' };
const page = { id: 'synthetic-extension', url: base + 'pipeline-export.html#ticket-1', tab: { id: 8 } };
const call = (message, sender) => new Promise((resolve) => { const wait = listener(message, sender, resolve); if (wait !== true && message.type !== 'pipeline-export-claim') resolve(undefined); });

async function run() {
  assert.equal((await call({ type: 'pipeline-export-open', overrideConfirmed: true }, popup)).ok, true);
  assert.equal(created.url, base + 'pipeline-export.html#ticket-1');
  // A different extension tab cannot consume or reuse the grant intended for this tab.
  assert.equal((await call({ type: 'pipeline-export-claim', ticket: 'ticket-1' }, { ...page, tab: { id: 9 } })).ok, false);
  const grant = await call({ type: 'pipeline-export-claim', ticket: 'ticket-1' }, page);
  assert.equal(grant.ok, true);
  assert.equal(grant.sourceTabId, 7);
  assert.equal(grant.overrideConfirmed, true);
  assert.equal((await call({ type: 'pipeline-export-claim', ticket: 'ticket-1' }, page)).ok, false);
  assert.equal(await call({ type: 'pipeline-export-open' }, { ...popup, url: 'https://unrelated.test/' }), undefined);
  await call({ type: 'pipeline-export-open' }, popup);
  now = 300002;
  assert.equal((await call({ type: 'pipeline-export-claim', ticket: 'ticket-2' }, page)).ok, false);
  console.log('PASS export launch tickets: source binding, one-use grants, expiry, sender checks, and no storage writes');
}
run().catch((error) => { console.error(error); process.exitCode = 1; });
