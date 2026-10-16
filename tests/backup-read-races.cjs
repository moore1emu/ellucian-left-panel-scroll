// Test asynchronous local-file selection and cancellation using the maintained popup code.
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const assert = require('node:assert/strict');
const root = process.env.INTEGRATION_NAVIGATOR_SOURCE || path.join(__dirname, '..');
const nodes = new Map();
// Minimal DOM fixtures expose only the popup's user-driven controls and their visible state.
function node(id) {
  if (!nodes.has(id)) nodes.set(id, { hidden: false, disabled: false, textContent: '', value: '', files: [], handlers: {},
    addEventListener(type, handler) { this.handlers[type] = handler; }, setAttribute() {}, click() {} });
  return nodes.get(id);
}
let imported;
const fixture = vm.createContext({ URL, Date, console, window: { confirm: () => true },
  document: { querySelector: node, addEventListener() {} },
  chrome: { tabs: { query: async () => [] }, storage: { local: { get: async () => ({}) } },
    runtime: { sendMessage: async message => { imported = message.backup; return { ok: true }; } } },
});
vm.runInContext(fs.readFileSync(path.join(root, 'favorites-data.js'), 'utf8'), fixture);
vm.runInContext(fs.readFileSync(path.join(root, 'favorites-popup.js'), 'utf8'), fixture);
const backup = packageName => JSON.stringify({ format: 'integration-navigator-backup', schemaVersion: 1,
  favorites: [{ site: 'https://experience.example.edu', tenantId: 'fixture', page: 'packages', packages: [{ packageName, packagePinned: true, pipelines: [] }] }],
  unassignedFavorites: [], environments: [] });
function select(text) {
  node('#backup-file').files = [{ size: 200, text }];
  return node('#backup-file').handlers.change();
}
(async () => {
  let finishOld;
  const oldRead = select(() => new Promise(resolve => { finishOld = resolve; }));
  await select(async () => backup('Newest'));
  finishOld(backup('Older')); await oldRead;
  // The newest preview remains the only file eligible for an explicit confirmed import.
  await node('#confirm-backup').handlers.click();
  assert.equal(imported.favorites[0].packages[0].packageName, 'Newest');
  let finishCancelled;
  const cancelledRead = select(() => new Promise(resolve => { finishCancelled = resolve; }));
  node('#cancel-backup').handlers.click();
  finishCancelled(backup('Cancelled')); await cancelledRead;
  assert.equal(node('#backup-preview').hidden, true);
  imported = null; await node('#confirm-backup').handlers.click(); assert.equal(imported, null);
  // A stale failure/finally must not clear a newer input or replace its guidance.
  let rejectOld;
  const failedRead = select(() => new Promise((_resolve, reject) => { rejectOld = reject; }));
  let finishNewest;
  const newestRead = select(() => new Promise(resolve => { finishNewest = resolve; }));
  node('#backup-file').value = 'newer-selection';
  node('#backup-status').textContent = 'Newer read in progress';
  rejectOld(new Error('Old read failed')); await failedRead;
  assert.equal(node('#backup-file').value, 'newer-selection');
  assert.equal(node('#backup-status').textContent, 'Newer read in progress');
  finishNewest(backup('Newest Again')); await newestRead;
  assert.equal(node('#backup-file').value, '');
  await node('#confirm-backup').handlers.click();
  assert.equal(imported.favorites[0].packages[0].packageName, 'Newest Again');
  console.log('PASS: newest backup wins, cancellation invalidates pending reads, stale failure/cleanup isolation, and explicit import confirmation.');
})().catch(error => { console.error(error); process.exitCode = 1; });
