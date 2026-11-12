// Exercise only synthetic page metadata; never read a browser profile or contact an institution.
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const assert = require('node:assert/strict');
const root = process.env.INTEGRATION_NAVIGATOR_SOURCE || path.join(__dirname, '..');
const source = fs.readFileSync(path.join(root, 'page-index.js'), 'utf8');
const designer = '/fixture/app/all-accounts/Ellucian/data-connect-designer/';
const packages = '/fixture/app/all-accounts/Ellucian/data-connect/home';

// Place the native tenant four owners above its main element, outside sidebar ancestry.
function manager(tenant) {
  const state = { currentTenant: tenant };
  let fiber = { stateNode: { state } };
  for (let depth = 0; depth < 4; depth++) fiber = { return: fiber };
  return { node: { __reactFiber$fixture: fiber }, state };
}

// Model a direct Designer document with no preloaded global and no sidebar-owned tenant.
const live = manager('first-tenant');
let managerNode = live.node;
const rowState = { currentTenant: '' };
const row = { __reactFiber$fixture: { stateNode: { state: rowState } } };
let listener;
const messages = [];
let selectors = [];
const window = {
  location: { origin: 'https://experience.example.edu', pathname: designer, href: 'https://experience.example.edu' + designer },
  addEventListener: (_type, callback) => { listener = callback; },
  postMessage: (message) => messages.push(message),
};
const document = {
  querySelector: (selector) => {
    selectors.push(selector);
    if (selector === '#pipelineManager-main-customBlock') return managerNode;
    if (selector === 'li[data-level="1"]') return row;
    return null;
  },
  // Metadata verification must not build inventories or scan every element.
  querySelectorAll: () => { throw new Error('Tenant metadata must not scan the page'); },
};
vm.runInNewContext(source, { window, document });

// Use the production message handler, not a second copy of its identity algorithm.
function probe() {
  selectors = [];
  listener({ source: window, data: { source: 'ellucian-left-panel-scroll', type: 'favorite-context-request', requestId: 'probe' } });
  assert.ok(selectors.length <= 3, 'Each probe uses at most three exact element lookups');
  return messages.at(-1).tenantId;
}
assert.equal(probe(), 'first-tenant', 'Direct Designer entry must not need Home navigation or bootstrap state');
live.state.currentTenant = 'second-tenant';
assert.equal(probe(), 'second-tenant', 'Reread live identity instead of caching the previous tenant');

// Reject missing identity after a switch, even when stale bootstrap state becomes available.
window.__PRELOADED_STATE__ = { tenant: 'stale-bootstrap' };
live.state.currentTenant = '';
assert.equal(probe(), '');
managerNode = null;
assert.equal(probe(), '', 'An unmounted manager must never retain the previous ID');
managerNode = manager('replacement-tenant').node;
assert.equal(probe(), 'replacement-tenant', 'A replacement app root must be discovered without a reload');

// Ignore retained Designer state on Packages; its native sidebar still supplies the actual tenant.
window.location.pathname = packages;
window.location.href = window.location.origin + packages;
rowState.currentTenant = 'packages-tenant';
assert.equal(probe(), 'packages-tenant');
assert.equal(selectors.includes('#pipelineManager-main-customBlock'), false);
rowState.currentTenant = '';
assert.equal(probe(), '');

// The observed Packages owner exposes only context identity, not state.currentTenant.
const packageOwner = row.__reactFiber$fixture.stateNode;
rowState.menu = [];
packageOwner.context = { tenantId: 'context-tenant', getJwt: () => { throw new Error('Never invoke session callbacks for identity'); } };
assert.equal(probe(), 'context-tenant');
packageOwner.context.tenantId = 'switched-context-tenant';
assert.equal(probe(), 'switched-context-tenant', 'Reread context when the same vanity URL switches tenant');
packageOwner.context.tenantId = '';
assert.equal(probe(), '', 'Missing context cannot reuse a previous tenant or stale bootstrap');
packageOwner.context.tenantId = 'unrelated-context';
delete rowState.menu;
assert.equal(probe(), '', 'An unrelated ancestor context is not a verified Packages menu owner');

// Return through Experience Home into a freshly mounted Designer without guessing from the URL.
window.location.pathname = '/fixture/app/home';
window.location.href = window.location.origin + window.location.pathname;
window.location.pathname = designer;
window.location.href = window.location.origin + designer;
managerNode = manager('returned-tenant').node;
assert.equal(probe(), 'returned-tenant');
managerNode = null;
rowState.menu = [];
assert.equal(probe(), '', 'Designer must not inherit a retained Packages context');
console.log('PASS: direct Designer identity, bounded element lookups, live switch/unmount/remount, stale bootstrap rejection, Packages isolation, and Home return.');
