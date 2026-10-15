"use strict";

// Test worker authorization with realistic runtime senders, without accounts, storage, or services.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const base = 'chrome-extension://synthetic-extension/';
const popup = { id: 'synthetic-extension', url: base + 'popup.html' };
const source = { id: popup.id, url: 'https://synthetic.test/experience', tab: { id: 7 }, frameId: 0, documentId: 'source-document' };
const sourceUrl = 'https://synthetic.test/fixture/data-connect/home';

function fixture() {
  let listener;
  let removed;
  let counter = 0;
  let nextTab = 8;
  let now = 1;
  let sourceDocument = source.documentId;
  let hold;
  const calls = [];
  const created = [];
  const call = (message, sender) => new Promise((resolve) => {
    const waiting = listener(message, sender, resolve);
    if (waiting !== true) resolve(undefined);
  });
  const context = vm.createContext({ URL, Date: { now: () => now }, crypto: { randomUUID: () => `ticket-${++counter}` }, chrome: {
    runtime: { id: popup.id, getURL: (file) => base + file, onMessage: { addListener: (callback) => { listener = callback; } } },
    tabs: {
      query: async () => [{ id: 7 }],
      create: async (details) => { const tab = { ...details, id: nextTab++ }; created.push(tab); return tab; },
      onRemoved: { addListener: (callback) => { removed = callback; } },
      sendMessage: async (id, message, options) => {
        if (message.type === 'pipeline-export-bind') {
          // A nonce cannot select a source tab/frame; only browser-provided identities authorize binding.
          assert.equal((await call({ type: 'pipeline-export-bind-source', bindingId: message.bindingId, url: sourceUrl }, { ...source, tab: { id: 99 } })).ok, false);
          assert.equal((await call({ type: 'pipeline-export-bind-source', bindingId: message.bindingId, url: sourceUrl }, { ...source, frameId: 1 })).ok, false);
          return call({ type: 'pipeline-export-bind-source', bindingId: message.bindingId, url: sourceUrl }, source);
        }
        // Chromium document targeting must fail instead of messaging a replacement source document.
        if (options.documentId !== sourceDocument) throw new Error('Original document no longer exists');
        calls.push({ id, message, options });
        if (hold && message.type === 'pipeline-export-preview') { const pending = hold; hold = null; await pending; }
        return { ok: true, plan: { entries: [] } };
      },
    },
  } });
  vm.runInContext(fs.readFileSync(path.join(__dirname, '..', 'pipeline-export-worker.js'), 'utf8'), context);
  const open = async (overrideConfirmed = false) => {
    assert.equal((await call({ type: 'pipeline-export-open', overrideConfirmed }, popup)).ok, true);
    const tab = created.at(-1);
    return { id: popup.id, url: tab.url, tab: { id: tab.id }, frameId: 0, documentId: `export-document-${tab.id}` };
  };
  const claim = (sender) => call({ type: 'pipeline-export-claim', ticket: sender.url.split('#')[1] }, sender);
  const relay = (sender, operation, details = {}) => call({ type: 'pipeline-export-relay', operation, ...details }, sender);
  return { call, open, claim, relay, calls, removed: (id) => removed(id), expire: () => { now = 300002; },
    replaceSource: () => { sourceDocument = 'replacement-document'; }, defer: (promise) => { hold = promise; } };
}

async function run() {
  const f = fixture();
  const page = await f.open(true);
  // Wrong tab/frame/document/URL/extension and replay cannot borrow a launch grant.
  assert.equal((await f.claim({ ...page, tab: { id: 99 } })).ok, false);
  assert.equal((await f.claim({ ...page, frameId: 1 })).ok, false);
  const grant = await f.claim(page);
  assert.equal(grant.ok, true);
  assert.equal(grant.overrideConfirmed, true);
  assert.equal(grant.sourceTabId, undefined);
  assert.equal((await f.claim(page)).ok, false);
  for (const impostor of [{ ...page, tab: { id: 99 } }, { ...page, frameId: 1 }, { ...page, documentId: 'replacement' }, { ...page, url: base + 'popup.html' }]) {
    assert.equal((await f.relay(impostor, 'preview')).reason, 'preview-expired');
  }
  assert.equal(await f.relay({ ...page, id: 'other-extension' }, 'preview'), undefined);
  assert.equal((await f.relay(page, 'arbitrary-native-call')).reason, 'unsupported-operation');
  assert.equal(f.calls.length, 0);
  // Spoofed source/consent/client fields cannot replace the worker's recorded routing decisions.
  assert.equal((await f.relay(page, 'preview', { sourceTabId: 99, clientId: 'fake', overrideConfirmed: false })).ok, true);
  const forwarded = f.calls.at(-1);
  assert.equal(forwarded.id, 7);
  assert.equal(forwarded.options.frameId, 0);
  assert.equal(forwarded.options.documentId, source.documentId);
  assert.equal(forwarded.message.sourceUrl, sourceUrl);
  assert.equal(forwarded.message.overrideConfirmed, true);
  assert.notEqual(forwarded.message.clientId, 'fake');
  // User cancellation revokes advanced consent; a forged true flag cannot restore it.
  await f.relay(page, 'cancel', { revokeOverride: true });
  await f.relay(page, 'preview', { overrideConfirmed: true });
  assert.equal(f.calls.at(-1).message.overrideConfirmed, false);
  let release;
  f.defer(new Promise((resolve) => { release = resolve; }));
  const pending = f.relay(page, 'preview');
  await f.relay(page, 'cancel');
  release();
  assert.equal((await pending).reason, 'cancelled');
  // Source reload, export close, expiry, and worker restart all fail closed.
  f.replaceSource();
  assert.equal((await f.relay(page, 'read')).reason, 'context-changed');
  const previous = f.calls.length;
  f.removed(page.tab.id);
  assert.equal((await f.relay(page, 'verify')).reason, 'preview-expired');
  assert.equal(f.calls.length, previous);
  const expired = await f.open();
  f.expire();
  assert.equal((await f.claim(expired)).ok, false);
  assert.equal((await fixture().relay(page, 'preview', { overrideConfirmed: true })).reason, 'preview-expired');
  console.log('PASS export worker relay: source/document binding, one-use launch, sender/frame/replay guards, fixed operations, override revocation, cancel/reload/close/restart isolation, no storage writes');
}
run().catch((error) => { console.error(error); process.exitCode = 1; });
