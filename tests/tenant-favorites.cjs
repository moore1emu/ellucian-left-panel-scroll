// Test synthetic favorites and worker transactions without using a browser account or network.
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const assert = require('node:assert/strict');
const root = process.env.INTEGRATION_NAVIGATOR_SOURCE || path.join(__dirname, '..');
const read = (name) => fs.readFileSync(path.join(root, name), 'utf8');
const clone = (value) => JSON.parse(JSON.stringify(value));
let handler;
let settings = {};
let failedRead = false;
let failedWrite = false;
let writes = 0;
let current;
const site = 'https://experience.example.edu';
const sender = { id: 'fixture', tab: { id: 1 }, frameId: 0, documentId: 'document', url: site + '/one/app/data-connect/home' };
const popup = { id: 'fixture' };
const fixture = vm.createContext({ URL, Date, console, pendingOwnershipUpdate: Promise.resolve(),
  CustomSites: { defaults: () => [site] },
  chrome: { runtime: { id: 'fixture', getURL: (name) => `chrome-extension://fixture/${name}`, onMessage: { addListener: (fn) => { handler = fn; } } },
    tabs: { sendMessage: async () => current },
    storage: { local: {
      get: async (defaults) => { if (failedRead) throw new Error('Synthetic read failure.'); return clone({ ...defaults, ...settings }); },
      set: async (values) => { if (failedWrite) throw new Error('Synthetic write failure.'); settings = { ...settings, ...clone(values) }; writes++; },
    } },
  },
});
vm.runInContext(read('favorites-data.js'), fixture);
vm.runInContext(read('favorites-worker.js'), fixture);
const data = fixture.FavoritesData;
const scope = (tenantId, page = 'packages') => ({ site, tenantId, page });
const group = (packageName, pipeline = '') => ({ packageName, packagePinned: !pipeline,
  pipelines: pipeline ? [{ name: pipeline, originalName: '', version: 'v1.0.3' }] : [], pipelinesExpanded: true });
const send = (message, origin = sender) => new Promise((resolve) => { assert.equal(handler(message, origin, resolve), true); });
const enter = (tenantId, page = 'packages') => { current = { scope: scope(tenantId, page), loaded: true, url: `${site}/${tenantId}/app/${page === 'packages' ? 'data-connect/home' : 'data-connect-designer'}` }; };

(async () => {
  // Two test tenants on one vanity site and the Designer page must have different tuples.
  assert.notEqual(data.key(scope('test-a')), data.key(scope('test-b')));
  assert.notEqual(data.key(scope('test-a')), data.key(scope('test-a', 'designer')));
  enter('test-a');
  assert.equal((await send({ type: 'favorites-save', scope: scope('test-a'), packages: [group('A')] })).ok, true);
  enter('test-b');
  assert.equal((await send({ type: 'favorites-save', scope: scope('test-b'), packages: [group('B', 'Child')] })).ok, true);
  enter('test-a', 'designer');
  assert.equal((await send({ type: 'favorites-save', scope: scope('test-a', 'designer'), packages: [group('Designer')] })).ok, true);
  assert.equal(settings[data.KEY][data.key(scope('test-a'))][0].packageName, 'A');
  assert.equal(settings[data.KEY][data.key(scope('test-b'))][0].packagePinned, false);

  // Refuse stale tenant edits, incomplete identities, failed reads, and failed writes.
  const before = clone(settings);
  assert.equal((await send({ type: 'favorites-save', scope: scope('test-a'), packages: [] })).ok, false);
  current.loaded = false;
  assert.equal((await send({ type: 'favorites-save', scope: current.scope, packages: [] })).ok, false);
  current.loaded = true;
  failedRead = true;
  assert.equal((await send({ type: 'favorites-save', scope: current.scope, packages: [] })).ok, false);
  failedRead = false;
  failedWrite = true;
  assert.equal((await send({ type: 'favorites-save', scope: current.scope, packages: [] })).ok, false);
  failedWrite = false;
  assert.deepEqual(settings, before);

  // Assign an old host/page list once, merging without removing current pins or its recovery copy.
  enter('test-a');
  const oldKey = data.legacyKey(current.scope);
  settings[data.LEGACY] = { [oldKey]: [group('Old')] };
  assert.equal((await send({ type: 'favorites-assign', scope: current.scope, tabId: 1 }, popup)).ok, true);
  assert.equal(settings[data.LEGACY][oldKey][0].packageName, 'Old');
  assert.deepEqual(settings[data.KEY][data.key(current.scope)].map((entry) => entry.packageName), ['A', 'Old']);
  enter('test-b');
  assert.equal((await send({ type: 'favorites-assign', scope: current.scope, tabId: 1 }, popup)).ok, false);

  // A backup round trip retains tenant IDs, pipeline order, disclosure, and unknown source packages.
  settings.designerOwnershipCache = { 'test-a': { environment: 'Test A', checkedAt: Date.now() - 1000,
    packages: [{ name: null, pipelines: ['Unknown Package Child'] }] } };
  const exported = clone(data.exportData(settings, '1.22.0'));
  assert.equal(exported.favorites.length, 3);
  assert.equal(exported.unassignedFavorites.length, 1);
  assert.equal(exported.environments[0].packages[0].packageNameRecorded, false);
  assert.deepEqual(clone(data.backup(data.backup(exported))), clone(data.backup(exported)));
  const incoming = { ...exported, favorites: [{ ...scope('test-a'), packages: [group('New')], expanded: false }] };
  assert.equal((await send({ type: 'favorites-import', backup: incoming, mode: 'merge' }, popup)).ok, true);
  assert.deepEqual(settings[data.KEY][data.key(scope('test-a'))].map((entry) => entry.packageName), ['A', 'Old', 'New']);
  assert.equal((await send({ type: 'favorites-import', backup: incoming, mode: 'replace' }, popup)).ok, true);
  assert.deepEqual(settings[data.KEY][data.key(scope('test-a'))].map((entry) => entry.packageName), ['New']);
  assert.equal(settings[data.KEY][data.key(scope('test-b'))][0].packageName, 'B');

  // Source restore is opt-in, cannot enable collection, and never replaces a fresher snapshot.
  const savedSources = clone(settings.designerOwnershipCache);
  assert.equal((await send({ type: 'favorites-import', backup: incoming, mode: 'merge', restoreSources: true }, popup)).ok, false);
  assert.deepEqual(settings.designerOwnershipCache, savedSources);
  settings.sharedFromEnabled = true;
  settings.designerOwnershipCache['test-a'].checkedAt = Date.now();
  assert.equal((await send({ type: 'favorites-import', backup: incoming, mode: 'merge', restoreSources: true }, popup)).ok, true);
  assert.equal(settings.designerOwnershipCache['test-a'].packages[0].name, null);
  assert.ok(settings.designerOwnershipCache['test-a'].checkedAt > Date.parse(exported.environments[0].lastCheckedAt));

  // Invalid backups must fail before any write; importing cannot be called by a web page sender.
  const count = writes;
  for (const invalid of [{}, { ...incoming, schemaVersion: 2 }, { ...incoming, favorites: [{ ...scope(''), packages: [] }] },
    { ...incoming, favorites: [{ ...scope('test-a'), packages: [{ packageName: 'Bad', pipelines: [{}] }] }] }]) {
    assert.equal((await send({ type: 'favorites-import', backup: invalid, mode: 'merge' }, popup)).ok, false);
  }
  assert.equal((await send({ type: 'favorites-import', backup: incoming, mode: 'merge' })).ok, false);
  assert.equal(writes, count);
  // Delayed storage replies cannot win an A → B → A route switch, even when the key matches again.
  const search = read('search.js');
  const loaderSource = search.slice(search.indexOf('  function loadFavoritesForCurrentPage()'), search.indexOf('  // Keep: use the visible package tree'));
  const reads = [];
  const loader = vm.createContext({ ownershipExtensionDisconnected: false, preferencesLoaded: true,
    favoriteLoadSequence: 0, favoritesLoaded: false, activeFavoritesStorageKey: '',
    FAVORITES_BY_HOST_KEY: data.KEY, FAVORITES_EXPANDED_BY_HOST_KEY: data.EXPANDED, FAVORITES_HEIGHTS_BY_HOST_KEY: data.HEIGHTS,
    isSupportedPage: () => true, getFavoriteScopeKey: () => loader.key,
    chrome: { runtime: { id: 'fixture' }, storage: { local: { get: (_defaults, callback) => reads.push(callback) } } },
    applyFavoriteSettings: (values, key) => { loader.saved = values[data.KEY]?.[key]; },
    applySearchMode() {}, stopDisconnectedOwnership: () => { loader.disconnected = true; },
  });
  vm.runInContext(loaderSource, loader);
  loader.key = data.key(scope('test-a')); loader.loadFavoritesForCurrentPage();
  loader.key = data.key(scope('test-b')); loader.loadFavoritesForCurrentPage();
  loader.key = data.key(scope('test-a')); loader.loadFavoritesForCurrentPage();
  reads[0]({ [data.KEY]: { [loader.key]: [group('Stale A')] } });
  reads[1]({ [data.KEY]: { [data.key(scope('test-b'))]: [group('Stale B')] } });
  assert.equal(loader.saved, undefined);
  assert.equal(loader.favoritesLoaded, false);
  reads[2]({ [data.KEY]: { [loader.key]: [group('Current A')] } });
  assert.equal(loader.saved[0].packageName, 'Current A');
  assert.equal(loader.favoritesLoaded, true);
  loader.chrome.runtime.lastError = { message: 'Synthetic read failure' };
  loader.loadFavoritesForCurrentPage(); reads[3]({});
  assert.equal(loader.saved[0].packageName, 'Current A');
  assert.equal(loader.favoritesLoaded, false, 'Failed reads cannot enable edits from fallback data');
  console.log('PASS: tenant isolation, legacy assignment, JSON round trip, merge/replace, consent, and failed storage.');
})().catch((error) => { console.error(error); process.exitCode = 1; });
