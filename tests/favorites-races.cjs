// Exercise real worker writes and page save/storage handlers without browser accounts or network.
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const assert = require('node:assert/strict');
const root = process.env.INTEGRATION_NAVIGATOR_SOURCE || path.join(__dirname, '..');
const read = name => fs.readFileSync(path.join(root, name), 'utf8');
const clone = value => structuredClone(value);
const scope = { site: 'https://experience.example.edu', tenantId: 'synthetic', page: 'packages' };
const key = JSON.stringify([scope.site, scope.tenantId, scope.page]);
const group = packageName => ({ packageName, packagePinned: true, pipelines: [], pipelinesExpanded: true });
const store = { favoritePackagesByTenant: { [key]: [] } };
let handler;
let local = [];
let reconcileCount = 0;
let releaseFirst;
let firstWritten;
let writes = 0;
let failNextWrite = false;
const firstWrite = new Promise(resolve => { firstWritten = resolve; });
const release = new Promise(resolve => { releaseFirst = resolve; });
const responses = [];
const callbacks = [];
const reconcileReads = [];
const source = read('search.js');
// Extract maintained functions and the actual storage handler, rather than reimplementing their rules.
const saves = source.slice(source.indexOf('  function saveFavorites()'), source.indexOf('  // Persist whether this environment'));
const changesStart = source.indexOf('    if (changes[FAVORITES_BY_HOST_KEY]) {');
const changeHandler = source.slice(changesStart, source.indexOf('\n    // Synchronize the expanded state', changesStart));
const loader = source.slice(source.indexOf('  function loadFavoritesForCurrentPage()'), source.indexOf('  // Keep: use the visible package tree'));
let page;
const chrome = { runtime: { id: 'fixture', getURL: name => `chrome-extension://fixture/${name}`,
  onMessage: { addListener: fn => { handler = fn; } },
  sendMessage: (message, callback) => {
    handler(message, { id: 'fixture', tab: { id: 1 }, frameId: 0, documentId: 'fixture', url: `${scope.site}/tenant/data-connect/home` }, result => {
      responses.push(result); callbacks.push(() => callback(result));
    });
  } },
  tabs: { sendMessage: async () => ({ scope, loaded: true, url: `${scope.site}/tenant/data-connect/home` }) },
  storage: { local: {
    get: (defaults, callback) => {
      const snapshot = clone({ ...defaults, ...store });
      if (!callback) return Promise.resolve(snapshot);
      // Delay successful reconciliation independently of durable worker writes and new clicks.
      reconcileReads.push(() => { reconcileCount += 1; callback(snapshot); });
    },
    set: async patch => {
      // A rejected save must restore confirmed pins rather than leave an unsaved optimistic entry.
      if (failNextWrite) { failNextWrite = false; throw new Error('Synthetic write failure'); }
      Object.assign(store, clone(patch)); writes += 1;
      // Publish a durable early write while deliberately delaying its worker acknowledgement.
      page.changes = { favoritePackagesByTenant: { newValue: clone(store.favoritePackagesByTenant) } };
      vm.runInContext(changeHandler, page);
      if (writes === 1) { firstWritten(); await release; }
    },
  } },
};
const worker = vm.createContext({ chrome, URL, Date, console, CustomSites: { defaults: () => [scope.site] }, pendingOwnershipUpdate: Promise.resolve() });
vm.runInContext(read('favorites-data.js'), worker);
vm.runInContext(read('favorites-worker.js'), worker);
page = vm.createContext({ chrome, console, structuredClone, FavoritesData: worker.FavoritesData,
  favoritesLoaded: true, activeFavoritesStorageKey: key, favoriteLoadSequence: 1,
  favoritePackageEditSequence: 0, ownershipExtensionDisconnected: false, preferencesLoaded: true,
  pendingFavoritePackageSaves: new Map(), FAVORITES_BY_HOST_KEY: 'favoritePackagesByTenant',
  FAVORITES_EXPANDED_BY_HOST_KEY: 'favoritesExpandedByHost', FAVORITES_HEIGHTS_BY_HOST_KEY: 'favoritesHeightsByHost',
  getFavoriteScope: () => scope, getFavoriteScopeKey: () => key,
  serializeFavoriteState: () => local, loadFavoriteState: values => { local = clone(values); }, refreshFavoritesUI() {},
  isSupportedPage: () => true, applySearchMode() {},
  applyFavoriteSettings: (values, storageKey) => { local = clone(values.favoritePackagesByTenant[storageKey]); },
  stopDisconnectedOwnership: () => { throw new Error('Unexpected disconnection'); },
});
vm.runInContext(saves, page);
// Include the actual loader so successful edits cannot accidentally re-enter its locked loading state.
vm.runInContext(loader, page);
const tick = () => new Promise(resolve => setImmediate(resolve));
(async () => {
  local = [group('A')]; page.saveFavorites();
  local.push(group('B')); page.saveFavorites();
  await firstWrite;
  assert.deepEqual(local.map(item => item.packageName), ['A', 'B'], 'Early storage notifications preserve newer optimistic pins');
  local.push(group('C')); page.saveFavorites();
  releaseFirst();
  // Let the real serialized worker finish, then deliver callbacks in a different order.
  for (let attempt = 0; responses.length < 3 && attempt < 50; attempt += 1) await tick();
  assert.equal(responses.length, 3); assert.ok(responses.every(result => result.ok));
  callbacks[1](); callbacks[0](); assert.equal(reconcileCount, 0);
  callbacks[2](); assert.equal(reconcileReads.length, 1);
  assert.equal(page.favoritesLoaded, true, 'Successful saves keep visible favorite controls actionable');
  assert.equal(page.favoriteLoadSequence, 1, 'Successful saves do not reload migration or layout');
  assert.deepEqual(local.map(item => item.packageName), ['A', 'B', 'C']);
  // Removing a pin remains removal; the guard never merges older lists back into current data.
  local = local.filter(item => item.packageName !== 'B'); page.saveFavorites();
  reconcileReads[0]();
  assert.deepEqual(local.map(item => item.packageName), ['A', 'C'], 'An older reread cannot undo a newer removal');
  for (let attempt = 0; responses.length < 4 && attempt < 50; attempt += 1) await tick();
  callbacks[3](); reconcileReads[1](); assert.deepEqual(local.map(item => item.packageName), ['A', 'C']);
  // An old failure after A → B → A navigation cannot reload or overwrite the newer visit.
  page.favoriteLoadSequence = 2; local.push(group('D')); page.saveFavorites();
  for (let attempt = 0; responses.length < 5 && attempt < 50; attempt += 1) await tick();
  page.favoriteLoadSequence = 4;
  chrome.runtime.lastError = { message: 'Synthetic delayed failure' };
  callbacks[4](); delete chrome.runtime.lastError;
  assert.equal(reconcileCount, 2);
  assert.equal(page.pendingFavoritePackageSaves.size, 0);
  // The newest failed save reloads durable storage without reviving intentionally removed pins.
  local = clone(store.favoritePackagesByTenant[key]);
  local.push(group('Not Saved')); failNextWrite = true; page.saveFavorites();
  for (let attempt = 0; responses.length < 6 && attempt < 50; attempt += 1) await tick();
  assert.equal(responses[5].ok, false); callbacks[5]();
  assert.equal(page.favoritesLoaded, false, 'Failed batches alone use the real fail-closed recovery loader');
  for (let attempt = 0; responses.length < 7 && attempt < 50; attempt += 1) await tick();
  callbacks[6](); assert.equal(page.favoritesLoaded, true);
  assert.deepEqual(local.map(item => item.packageName), ['A', 'C', 'D']);
  // Failed confirmation reads retain the displayed list rather than applying fallback defaults.
  local.push(group('E')); page.saveFavorites();
  for (let attempt = 0; responses.length < 8 && attempt < 50; attempt += 1) await tick();
  callbacks[7](); chrome.runtime.lastError = { message: 'Synthetic read failure' };
  reconcileReads[2](); delete chrome.runtime.lastError;
  assert.deepEqual(local.map(item => item.packageName), ['A', 'C', 'D', 'E']);
  assert.equal(page.favoritesLoaded, true);
  // An earlier failure cannot trigger recovery while a newer full snapshot is still pending.
  local.push(group('F')); failNextWrite = true; page.saveFavorites();
  local.push(group('G')); page.saveFavorites();
  for (let attempt = 0; responses.length < 10 && attempt < 50; attempt += 1) await tick();
  callbacks[8](); assert.equal(page.favoritesLoaded, true);
  callbacks[9](); assert.equal(page.favoritesLoaded, false);
  for (let attempt = 0; responses.length < 11 && attempt < 50; attempt += 1) await tick();
  callbacks[10](); assert.equal(page.favoritesLoaded, true);
  assert.deepEqual(local.map(item => item.packageName), ['A', 'C', 'D', 'E', 'F', 'G']);
  // A quick remove/add round trip keeps the final choice, without merging removed pins back.
  local = local.filter(item => item.packageName !== 'G'); page.saveFavorites();
  local.push(group('G')); page.saveFavorites();
  for (let attempt = 0; responses.length < 13 && attempt < 50; attempt += 1) await tick();
  callbacks[11](); callbacks[12](); reconcileReads[3]();
  assert.deepEqual(local.map(item => item.packageName), ['A', 'C', 'D', 'E', 'F', 'G']);
  console.log('PASS: rapid pin saves, delayed/reordered notifications, intentional removal, confirmed reconciliation, and old-visit callback isolation.');
})().catch(error => { console.error(error); process.exitCode = 1; });
