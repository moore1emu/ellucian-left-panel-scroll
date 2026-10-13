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
let failedVerificationRead = false;
let failedCleanupWrite = false;
let droppedPrimaryWrite = false;
let changedReadBack = false;
let writes = 0;
let current;
let tabContexts = null;
const site = 'https://experience.example.edu';
const sender = { id: 'fixture', tab: { id: 1 }, frameId: 0, documentId: 'document', url: site + '/one/app/data-connect/home' };
const popup = { id: 'fixture' };
const fixture = vm.createContext({ URL, Date, console, pendingOwnershipUpdate: Promise.resolve(),
  CustomSites: { defaults: () => [site] },
  chrome: { runtime: { id: 'fixture', getURL: (name) => `chrome-extension://fixture/${name}`, onMessage: { addListener: (fn) => { handler = fn; } } },
    tabs: { sendMessage: async (tabId) => tabContexts?.[tabId] || current },
    storage: { local: {
      get: async (defaults) => {
        const verification = Object.keys(defaults).length === 3 && Object.hasOwn(defaults, 'favoriteTenantAssignments');
        if (failedRead || (verification && failedVerificationRead)) throw new Error('Synthetic read failure.');
        const result = clone({ ...defaults, ...settings });
        // Model a changed snapshot without modifying the real fixture store or its confirmed assignment.
        if (verification && changedReadBack) Object.values(result.favoritePackagesByTenant)[0].push({packageName:'Changed During Read',packagePinned:true,pipelines:[]});
        return result;
      },
      set: async (values) => {
        const cleanup = Object.keys(values).length === 1 && Object.hasOwn(values, 'favoritePackagesByHost');
        if (failedWrite || (cleanup && failedCleanupWrite)) throw new Error('Synthetic write failure.');
        // A false success acknowledgement must never be enough to delete an original recovery copy.
        if (droppedPrimaryWrite && Object.hasOwn(values, 'favoritePackagesByTenant')) return;
        settings = { ...settings, ...clone(values) }; writes++;
      },
    } },
  },
});
vm.runInContext(read('favorites-data.js'), fixture);
vm.runInContext(read('favorites-worker.js'), fixture);
const data = fixture.FavoritesData;
const scope = (tenantId, page = 'packages') => ({ site, tenantId, page });
const group = (packageName, pipeline = '') => ({ packageName, packagePinned: !pipeline,
  pipelines: pipeline ? [{ name: pipeline, originalName: '', version: 'v1.0.3' }] : [], pipelinesExpanded: true });
// Chrome serializes replies across contexts; mirror that boundary instead of comparing VM prototypes.
const send = (message, origin = sender) => new Promise((resolve) => { assert.equal(handler(message, origin, (result) => resolve(clone(result))), true); });
const enter = (tenantId, page = 'packages') => { current = { scope: scope(tenantId, page), loaded: true, url: `${site}/${tenantId}/app/${page === 'packages' ? 'data-connect/home' : 'data-connect-designer'}` }; };

(async () => {
  // Restore old lists automatically for the first known actual tenant, merging into 1.22.0 pins.
  const packageOldKey = data.legacyKey(scope('test-a'));
  const designerOldKey = data.legacyKey(scope('test-a', 'designer'));
  const oldLists = { [packageOldKey]: [group('Old Package', 'Old Child')], [designerOldKey]: [group('Old Designer')] };
  settings = { [data.LEGACY]: clone(oldLists), [data.KEY]: { [data.key(scope('test-a'))]: [group('Already Pinned')] },
    [data.EXPANDED]: { [packageOldKey]: false }, [data.HEIGHTS]: { [packageOldKey]: 180 } };
  enter('test-a'); current.loaded = false;
  const prepared = await send({ type: 'favorites-prepare', scope: current.scope });
  assert.equal(prepared.ok, true);
  assert.deepEqual(prepared.packages.map((entry) => entry.packageName), ['Already Pinned', 'Old Package']);
  assert.equal(prepared.packages[1].packagePinned, false);
  assert.equal(prepared.packages[1].pipelines[0].name, 'Old Child');
  assert.equal(prepared.expanded, false);
  assert.equal(prepared.height, 180);
  assert.deepEqual(settings[data.LEGACY], { [designerOldKey]: oldLists[designerOldKey] }, 'Only the verified assigned package copy is retired');
  assert.equal(settings[data.ASSIGNED][packageOldKey], data.key(scope('test-a')));
  const preparedWrites = writes;
  await send({ type: 'favorites-prepare', scope: current.scope });
  assert.equal(writes, preparedWrites, 'A completed migration and repeated visit do not rewrite storage');
  enter('test-a', 'designer'); current.loaded = false;
  const designerPrepared = await send({ type: 'favorites-prepare', scope: current.scope });
  assert.equal(designerPrepared.packages[0].packageName, 'Old Designer');
  assert.equal(settings[data.KEY][data.key(scope('test-a'))][1].packageName, 'Old Package');
  assert.deepEqual(settings[data.LEGACY], {}, 'Both verified copies are retired after their own assignment');
  // A second tenant never inherits either retained copy, even after the first tenant unpins everything.
  enter('test-b'); current.loaded = false;
  assert.deepEqual((await send({ type: 'favorites-prepare', scope: current.scope })).packages, []);

  // Backup restoration preserves consumed-copy markers, including older backups with one matching list.
  const recoveryBackup = clone(data.exportData(settings, '1.22.1'));
  assert.equal(recoveryBackup.unassignedFavorites.length, 0);
  assert.equal(recoveryBackup.assignments.find((entry) => entry.page === 'packages').tenantId, 'test-a');
  settings = {};
  assert.equal((await send({ type: 'favorites-import', backup: recoveryBackup, mode: 'merge' }, popup)).ok, true);
  assert.deepEqual((await send({ type: 'favorites-prepare', scope: current.scope })).packages, []);
  const olderRecovery = clone(recoveryBackup);
  delete olderRecovery.assignments;
  olderRecovery.unassignedFavorites = Object.entries(oldLists).map(([oldKey, packages]) => ({site, page:oldKey.split('|').at(-1), packages}));
  olderRecovery.favorites = olderRecovery.favorites.filter((entry) => entry.tenantId === 'test-a');
  olderRecovery.unassignedFavorites.forEach((entry) => delete entry.assignedTenantId);
  settings = {};
  assert.equal((await send({ type: 'favorites-import', backup: olderRecovery, mode: 'merge' }, popup)).ok, true);
  assert.deepEqual((await send({ type: 'favorites-prepare', scope: current.scope })).packages, []);
  settings[data.KEY][data.key(scope('test-a'))] = [];
  enter('test-a'); current.loaded = false;
  assert.deepEqual((await send({ type: 'favorites-prepare', scope: current.scope })).packages, []);

  // Known multiple tenants, including empty/imported scopes, require explicit assignment.
  settings = { [data.LEGACY]: clone(oldLists), [data.KEY]: { [data.key(scope('test-a', 'designer'))]: [], [data.key(scope('test-b'))]: [] } };
  enter('test-a'); current.loaded = false;
  assert.deepEqual((await send({ type: 'favorites-prepare', scope: current.scope })).packages, []);
  assert.equal(settings[data.ASSIGNED]?.[packageOldKey], undefined);
  current.loaded = true;
  assert.equal((await send({ type: 'favorites-assign', scope: current.scope, tabId: 1 }, popup)).ok, true);
  assert.equal(settings[data.KEY][data.key(current.scope)][0].packageName, 'Old Package');

  // A tenant seen without pins is retained; later-added old data cannot be inherited by a second tenant.
  settings = {};
  enter('test-a'); current.loaded = false;
  await send({ type: 'favorites-prepare', scope: current.scope });
  settings[data.LEGACY] = clone(oldLists);
  enter('test-b'); current.loaded = false;
  assert.deepEqual((await send({ type: 'favorites-prepare', scope: current.scope })).packages, []);
  assert.equal(settings[data.ASSIGNED]?.[packageOldKey], undefined);

  // Failed migration reads/writes or unknown identity cannot consume the original list or mark it assigned.
  settings = { [data.LEGACY]: clone(oldLists) };
  enter('test-a'); current.loaded = false;
  const migrationBefore = clone(settings);
  failedRead = true;
  assert.equal((await send({ type: 'favorites-prepare', scope: current.scope })).ok, false);
  failedRead = false; failedWrite = true;
  assert.equal((await send({ type: 'favorites-prepare', scope: current.scope })).ok, false);
  failedWrite = false;
  const actualScope = current.scope; current.scope = null;
  assert.equal((await send({ type: 'favorites-prepare', scope: actualScope })).ok, false);
  assert.deepEqual(settings, migrationBefore);
  current.scope = actualScope;
  assert.equal((await send({ type: 'favorites-prepare', scope: current.scope })).ok, true);

  // Two tabs arriving together share the serialized decision: only the first inherits the old list.
  settings = { [data.LEGACY]: clone(oldLists) };
  tabContexts = { 1: { scope: scope('test-a'), loaded: false, url: `${site}/a/app/data-connect/home` },
    2: { scope: scope('test-b'), loaded: false, url: `${site}/b/app/data-connect/home` } };
  const simultaneous = await Promise.all([
    send({ type: 'favorites-prepare', scope: scope('test-a') }),
    send({ type: 'favorites-prepare', scope: scope('test-b') }, { ...sender, tab: { id: 2 }, documentId: 'second-document' }),
  ]);
  assert.equal(simultaneous[0].packages[0].packageName, 'Old Package');
  assert.deepEqual(simultaneous[1].packages, []);
  assert.deepEqual(settings[data.LEGACY], { [designerOldKey]: oldLists[designerOldKey] });
  tabContexts = null;

  // A failed verification or cleanup keeps the recovery copy and the successfully saved active list.
  for (const fault of ['read', 'write', 'changed', 'acknowledgement']) {
    settings = { [data.LEGACY]: clone(oldLists) };
    enter('test-a'); current.loaded = false;
    failedVerificationRead = fault === 'read';
    failedCleanupWrite = fault === 'write';
    changedReadBack = fault === 'changed';
    droppedPrimaryWrite = fault === 'acknowledgement';
    assert.equal((await send({type:'favorites-prepare',scope:current.scope})).ok, true);
    assert.deepEqual(settings[data.LEGACY], oldLists, 'Unverified or failed cleanup never consumes originals');
    if (!droppedPrimaryWrite) {
      assert.equal(settings[data.KEY][data.key(current.scope)][0].packageName, 'Old Package');
      assert.equal(settings[data.ASSIGNED][packageOldKey], data.key(current.scope));
    }
    failedVerificationRead = failedCleanupWrite = changedReadBack = droppedPrimaryWrite = false;
    // A later normal preparation retries only cleanup and leaves confirmed pins intact.
    assert.equal((await send({type:'favorites-prepare',scope:current.scope})).ok, true);
    assert.equal(settings[data.LEGACY][packageOldKey], undefined);
    assert.deepEqual(settings[data.LEGACY][designerOldKey], oldLists[designerOldKey]);
  }

  // Existing assigned copies with missing pins, missing destinations, or mismatched pages stay saved.
  for (const condition of ['missing-pins', 'missing-list', 'wrong-page', 'malformed']) {
    const assignedKey = data.key(scope('test-a', condition === 'wrong-page' ? 'designer' : 'packages'));
    const active = condition === 'missing-pins' ? [group('Other Pin')] : [group('Old Package', 'Old Child')];
    settings = { [data.LEGACY]: clone(oldLists), [data.ASSIGNED]: {[packageOldKey]:assignedKey},
      [data.KEY]: condition === 'missing-list' ? {} : {[assignedKey]:active} };
    if (condition === 'malformed') settings[data.LEGACY][packageOldKey][0].pipelines = [null];
    const untouched = clone(settings[data.LEGACY]);
    enter('test-a'); current.loaded = false;
    assert.equal((await send({type:'favorites-prepare',scope:current.scope})).ok, true);
    assert.deepEqual(settings[data.LEGACY], untouched);
  }

  // Major-version pin equivalence permits cleanup without downgrading current versions or order.
  const updatedChild = group('Old Package', 'Old Child');
  updatedChild.pipelines[0].version = 'v1.9.5';
  settings = { [data.LEGACY]: clone(oldLists), [data.ASSIGNED]: {[packageOldKey]:data.key(scope('test-a'))},
    [data.KEY]: {[data.key(scope('test-a'))]:[updatedChild]} };
  enter('test-a'); current.loaded = false;
  await send({type:'favorites-prepare',scope:current.scope});
  assert.equal(settings[data.LEGACY][packageOldKey], undefined);
  assert.equal(settings[data.KEY][data.key(current.scope)][0].pipelines[0].version, 'v1.9.5');

  // New marker-only backups survive a fresh install and stop a later old file reviving removed pins.
  settings[data.KEY][data.key(current.scope)] = [];
  const compact = clone(data.exportData(settings, '1.22.4'));
  assert.equal(compact.assignments.length, 1);
  settings = {};
  await send({type:'favorites-import',backup:compact,mode:'merge'},popup);
  const oldFile = {format:'integration-navigator-backup',schemaVersion:1,favorites:[],
    unassignedFavorites:[{site,page:'packages',packages:oldLists[packageOldKey]}],environments:[]};
  await send({type:'favorites-import',backup:oldFile,mode:'merge'},popup);
  assert.deepEqual((await send({type:'favorites-prepare',scope:current.scope})).packages, []);
  assert.equal(settings[data.ASSIGNED][packageOldKey], data.key(current.scope));

  // Reset only synthetic state before exercising the original save/import regression scenarios.
  settings = {};
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

  // Assign an old list once, merging pins and retiring only its verified duplicate package data.
  enter('test-a');
  const oldKey = data.legacyKey(current.scope);
  settings[data.LEGACY] = { [oldKey]: [group('Old')] };
  assert.equal((await send({ type: 'favorites-assign', scope: current.scope, tabId: 1 }, popup)).ok, true);
  assert.equal(settings[data.LEGACY][oldKey], undefined);
  assert.equal(settings[data.ASSIGNED][oldKey], data.key(scope('test-a')));
  assert.deepEqual(settings[data.KEY][data.key(current.scope)].map((entry) => entry.packageName), ['A', 'Old']);
  enter('test-b');
  assert.equal((await send({ type: 'favorites-assign', scope: current.scope, tabId: 1 }, popup)).ok, false);

  // A backup round trip retains tenant IDs, pipeline order, disclosure, and unknown source packages.
  settings.designerOwnershipCache = { 'test-a': { environment: 'Test A', checkedAt: Date.now() - 1000,
    packages: [{ name: null, pipelines: ['Unknown Package Child'] }] } };
  const exported = clone(data.exportData(settings, '1.22.1'));
  assert.equal(exported.favorites.length, 3);
  assert.equal(exported.unassignedFavorites.length, 0);
  assert.equal(exported.assignments.length, 1);
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
    { ...incoming, assignments: [scope('missing-tenant')] }, { ...incoming, assignments: 'not-an-array' },
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
    isSupportedPage: () => true, getFavoriteScopeKey: () => loader.key, getFavoriteScope: () => data.fromKey(loader.key),
    console: { warn() {} },
    chrome: { runtime: { id: 'fixture', sendMessage: (_message, callback) => reads.push(callback) } },
    applyFavoriteSettings: (values, key) => { loader.saved = values[data.KEY]?.[key]; },
    applySearchMode() {}, stopDisconnectedOwnership: () => { loader.disconnected = true; },
  });
  vm.runInContext(loaderSource, loader);
  loader.key = data.key(scope('test-a')); loader.loadFavoritesForCurrentPage();
  loader.key = data.key(scope('test-b')); loader.loadFavoritesForCurrentPage();
  loader.key = data.key(scope('test-a')); loader.loadFavoritesForCurrentPage();
  reads[0]({ ok: true, packages: [group('Stale A')] });
  reads[1]({ ok: true, packages: [group('Stale B')] });
  assert.equal(loader.saved, undefined);
  assert.equal(loader.favoritesLoaded, false);
  reads[2]({ ok: true, packages: [group('Current A')] });
  assert.equal(loader.saved[0].packageName, 'Current A');
  assert.equal(loader.favoritesLoaded, true);
  loader.chrome.runtime.lastError = { message: 'Synthetic read failure' };
  loader.loadFavoritesForCurrentPage(); reads[3]({});
  assert.equal(loader.saved[0].packageName, 'Current A');
  assert.equal(loader.favoritesLoaded, false, 'Failed reads cannot enable edits from fallback data');
  console.log('PASS: durable verified duplicate cleanup, failed/changed read-back retry, unresolved-copy preservation, compact marker backups/no pin revival, tenant isolation, automatic/manual recovery, and failed/delayed storage.');
})().catch((error) => { console.error(error); process.exitCode = 1; });
