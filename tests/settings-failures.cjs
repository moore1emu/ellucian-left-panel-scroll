'use strict';

// Exercise the real preference script with controlled storage failures and no browser or services.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const root = process.env.INTEGRATION_NAVIGATOR_SOURCE || path.resolve(__dirname, '..');
const source = fs.readFileSync(path.join(root, 'popup.js'), 'utf8');
const selectors = [
  ['#search-display-mode', 'searchDisplayMode', '#sidebar-search-status'],
  ['#designer-search-display-mode', 'designerSearchDisplayMode', '#designer-search-status'],
];

function fixture() {
  // Mirror initially disabled preference controls without implementing unrelated browser behavior.
  const nodes = new Map();
  function node(selector) {
    if (!nodes.has(selector)) nodes.set(selector, {
      disabled: true, checked: false, value: 'box', textContent: '', hidden: false, style: {}, attributes: {}, listeners: {},
      classList: { toggle() {} },
      addEventListener(type, listener) { this.listeners[type] = listener; },
      setAttribute(name, value) { this.attributes[name] = value; },
      removeAttribute(name) { delete this.attributes[name]; },
      querySelector() { return {}; },
    });
    return nodes.get(selector);
  }
  const writes = [];
  let openingRead;
  const runtime = { lastError: undefined, getManifest: () => ({ version: 'synthetic' }), onMessage: { addListener() {} } };
  const store = { packageArtifactsEnabled: false, searchDisplayMode: 'box', designerSearchDisplayMode: 'box' };
  const scope = {
    document: { querySelector: node, addEventListener() {}, dispatchEvent() {} },
    chrome: { runtime, storage: { local: {
      get(defaults, callback) { openingRead = { defaults, callback }; },
      set(values, callback) { writes.push({ values, callback }); },
    } } },
    IconAppearance: { KEY: 'iconAppearance', DEFAULT: {}, normalize: () => ({ color: '#123456', letters: 'E', textColor: '#000000' }) },
    FavoriteAppearance: { KEY: 'favoriteAppearance', DEFAULT: { color: '#123456' },
      normalize: () => ({ color: '#123456', matchIcon: false, shape: 'star' }), resolve: () => '#123456', render() {} },
    PopupTabs: { page: 'packages' }, Event: class {}, window: { addEventListener() {} },
  };
  // Preserve callbacks until the test explicitly settles the opening read or a pending write.
  vm.runInNewContext(source, scope, { filename: 'popup.js' });
  function load(value, fail = false) {
    runtime.lastError = fail ? { message: 'Synthetic read failure' } : undefined;
    try { openingRead.callback(value); } finally { runtime.lastError = undefined; }
  }
  function settle(fail) {
    const write = writes.shift();
    assert.ok(write, 'A pending search save is required');
    if (!fail) Object.assign(store, write.values);
    runtime.lastError = fail ? { message: 'Synthetic write failure' } : undefined;
    try { write.callback(); } finally { runtime.lastError = undefined; }
  }
  return { node, store, writes, load, settle, initial: () => ({ ...openingRead.defaults, ...store }) };
}

// Missing callback results and lastError with plausible defaults must both fail closed.
for (const kind of ['undefined', 'lastError']) {
  const test = fixture();
  assert.doesNotThrow(() => test.load(kind === 'undefined' ? undefined : test.initial(), kind === 'lastError'));
  for (const id of ['#remember-width', '#favorites-enabled', '#shared-version-enabled', '#shared-from-enabled',
    '#fitting-details-enabled', '#package-artifacts-enabled', '#icon-color', '#icon-letters', '#icon-text-color',
    '#favorite-color', '#favorite-shape', '#favorite-match-icon', ...selectors.map(([id]) => id)]) {
    assert.equal(test.node(id).disabled, true, id + ' remains locked after a failed read');
  }
  assert.match(test.node('#navigation-status').textContent, /Close and reopen settings/);
  assert.match(test.node('#shared-from-status').textContent, /Could not load settings/);
  assert.match(test.node('#icon-status').textContent, /Could not load settings/);
  assert.equal(test.writes.length, 0, 'A failed read never writes speculative defaults');
}

// Each selector locks pending input, rolls back a failure, and advances only its confirmed value.
for (const [id, key, status] of selectors) {
  const test = fixture();
  test.load(test.initial());
  const select = test.node(id);
  select.value = 'icon';
  select.listeners.change();
  assert.equal(select.disabled, true);
  assert.equal(select.attributes['aria-busy'], 'true');
  // Even a synthetic second event must not queue another write while the control is disabled.
  select.value = 'hidden';
  select.listeners.change();
  assert.equal(test.writes.length, 1);
  test.settle(true);
  assert.equal(select.value, 'box');
  assert.equal(test.store[key], 'box');
  assert.match(test.node(status).textContent, /Could not save search display/);
  assert.equal(select.disabled, false);
  assert.equal(select.attributes['aria-busy'], 'false');
  select.value = 'icon';
  select.listeners.change();
  test.settle(false);
  assert.equal(select.value, 'icon');
  assert.equal(test.store[key], 'icon');
  assert.equal(test.node(status).textContent, '');
  select.value = 'hidden';
  select.listeners.change();
  test.settle(true);
  assert.equal(select.value, 'icon', 'A later failure restores the most recent successful selection');
}

// Independent simultaneous saves cannot clear the other search selector's failure message.
const concurrent = fixture();
concurrent.load(concurrent.initial());
for (const [id] of selectors) {
  concurrent.node(id).value = 'hidden';
  concurrent.node(id).listeners.change();
}
assert.equal(concurrent.writes.length, 2);
concurrent.settle(true);
concurrent.settle(false);
assert.match(concurrent.node('#sidebar-search-status').textContent, /Could not save/);
assert.equal(concurrent.node('#designer-search-status').textContent, '');
assert.equal(concurrent.store.searchDisplayMode, 'box');
assert.equal(concurrent.store.designerSearchDisplayMode, 'hidden');
console.log('PASS settings failures: opening-read guards, no speculative writes, delayed/failed saves, rapid events, independent feedback');
