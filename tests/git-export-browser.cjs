'use strict';

// Exercise installed extension setup, native collection, comparison, and push against intercepted services only.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const { createHash } = require('node:crypto');
const { chromium } = require('playwright');
const extension = process.env.INTEGRATION_NAVIGATOR_SOURCE || path.resolve(__dirname, '..');
const site = 'https://experience-test.elluciancloud.com';
const packagesPath = '/fixture/app/all-accounts/Ellucian/data-connect/home';
const hash = value => createHash('sha1').update(value).digest('hex');
const old = hash('old'); const tree = hash('tree'); const commit = hash('new-commit');
const synthetic = 'SYNTHETIC_INSTALLED_TOKEN';
const html = `<!doctype html><div data-testid="master"><h2 id="home_title-packages">PACKAGES</h2><ul role="tree"><li data-level="1" package-element>Owned</li></ul></div><main id="pipelineManager-main-customBlock"><h1 id="packageDetails-title">Package: Owned</h1></main><script>
const pkg={name:'Owned',nameAndExtension:'owned.json',pipelines:[{name:'Pipeline',version:'v1.0.0',type:'integration'}]};
window.stats={sources:0};window.__PRELOADED_STATE__={tenant:'synthetic'};
const owner={state:{currentTenant:'synthetic',menu:[{'package-element':pkg}]},context:{tenantId:'synthetic',getJwt:()=>{throw Error('Credentials must remain native-owned');}}};
const row=document.querySelector('li');row.__reactFiber$fixture={return:{stateNode:owner}};row.__reactProps$fixture={'package-element':pkg};
const opaque={};const helper={G9:async()=>[{nameAndExtension:'owned.json',version:'v1.0.0'}],db:async()=>opaque,bP:async()=>pkg,
B0:async()=>{stats.sources++;return {name:'Pipeline',version:'1.0.0',fittings:[]};}};
window.webpackChunkexperience_exchange_extension=[];window.webpackChunkexperience_exchange_extension.push=entry=>entry[2](name=>name==='./src/server/ServerHelper.js'?helper:{});
</script>`;

(async () => {
  const temporaryRoot = fs.realpathSync(os.tmpdir());
  const profile = fs.mkdtempSync(path.join(temporaryRoot, 'navigator-git-test-'));
  let context;
  try {
    context = await chromium.launchPersistentContext(profile, { headless: true,
      ...(process.env.INTEGRATION_NAVIGATOR_BROWSER ? { channel: process.env.INTEGRATION_NAVIGATOR_BROWSER } : {}),
      args: [`--disable-extensions-except=${extension}`, `--load-extension=${extension}`] });
    let remote = old;
    let remoteFiles = [];
    let writes = [];
    let failHead = false;
    const uploaded = new Map();
    const calls = [];
    await context.route('**/*', async route => {
      const request = route.request(); const url = new URL(request.url());
      if (url.protocol === 'chrome-extension:') return route.continue();
      if (url.origin === site) return route.fulfill({ contentType: 'text/html', body: html });
      // No request is allowed through to GitHub, GitLab, or any other live service.
      assert.ok(['https://api.github.com', 'https://git.example.edu'].includes(url.origin), url.origin);
      calls.push({ method: request.method(), path: url.pathname });
      const response = value => route.fulfill({ contentType: 'application/json', headers: { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': '*' }, body: JSON.stringify(value) });
      if (request.method() === 'OPTIONS') return response({});
      const github = url.origin === 'https://api.github.com';
      const root = github ? '/repos/owner/repo' : '/api/v4/projects/group%2Fproject';
      const endpoint = url.pathname.slice(root.length);
      assert.equal(request.headers()[github ? 'authorization' : 'private-token'], github ? 'Bearer ' + synthetic : synthetic);
      if (!endpoint) return response(github ? { private: true } : { visibility: 'private' });
      if (endpoint.startsWith('/git/ref/heads/')) return response({ ref: 'refs/heads/exports', object: { sha: failHead ? hash('other') : remote } });
      if (endpoint.startsWith('/git/commits/') && request.method() === 'GET') return response({ tree: { sha: tree } });
      if (endpoint.startsWith('/git/trees/') && request.method() === 'GET') return response({ tree: remoteFiles, truncated: false });
      if (endpoint.startsWith('/repository/branches/')) return response({ name: 'exports', commit: { id: failHead ? hash('other') : remote } });
      if (endpoint === '/repository/tree') return response(remoteFiles.map(file => ({ ...file, id: file.sha })));
      const body = request.postDataJSON(); writes.push({ endpoint, body });
      if (endpoint === '/git/blobs') {
        const data = Buffer.from(body.content, 'base64');
        const sha = createHash('sha1').update(`blob ${data.length}\0`).update(data).digest('hex'); uploaded.set(sha, data);
        return response({ sha });
      }
      if (endpoint === '/git/trees') {
        remoteFiles = body.tree.map(file => {
          const data = Buffer.from(file.content); const sha = createHash('sha1').update(`blob ${data.length}\0`).update(data).digest('hex');
          uploaded.set(sha, data); return { path: file.path, type: 'blob', mode: file.mode, sha };
        });
        return response({ sha: hash('new-tree') });
      }
      if (endpoint === '/git/commits') return response({ sha: commit });
      if (endpoint.startsWith('/git/refs/heads/')) { assert.equal(body.force, false); remote = commit; return response({ object: { sha: commit } }); }
      if (endpoint === '/repository/commits') {
        for (const action of body.actions) assert.equal(action.action, 'create');
        remote = commit; return response({ id: commit });
      }
      throw Error('Unexpected synthetic endpoint ' + endpoint);
    });
    const worker = context.serviceWorkers()[0] || await context.waitForEvent('serviceworker', { timeout: 15000 });
    await worker.evaluate(() => pendingOwnershipUpdate);
    await worker.evaluate(() => chrome.storage.local.set({ sharedFromEnabled: true, designerOwnershipCache: { synthetic: { environment: 'Test', packages: [{ name: 'Owned', pipelines: ['Pipeline'] }] } }, syntheticFavorites: { keep: true } }));
    const id = new URL(worker.url()).host;
    const source = await context.newPage(); await source.goto(site + packagesPath);
    const popup = await context.newPage(); await popup.goto(`chrome-extension://${id}/popup.html`);
    // Follow the real settings connection entry; provider permission prompts are not bypassed in production.
    await popup.evaluate(() => PopupTabs.select('export'));
    const opened = context.waitForEvent('page'); await popup.locator('#manage-git').click();
    const connection = await opened; await connection.waitForFunction(() => !document.querySelector('#git-fields').disabled);
    await connection.evaluate(() => { chrome.permissions.contains = async () => true; });
    const errors = []; connection.on('pageerror', error => errors.push(error.message));

    for (const provider of ['github', 'gitlab']) {
      remote = old; remoteFiles = []; writes = []; uploaded.clear(); failHead = false;
      await connection.locator('#git-provider').selectOption(provider);
      if (provider === 'gitlab') await connection.locator('#git-server').fill('https://git.example.edu');
      await connection.locator('#git-repository').fill(provider === 'github' ? 'owner/repo' : 'group/project');
      await connection.locator('#git-token').fill(synthetic);
      if (provider === 'gitlab') {
        await connection.locator('#git-storage').selectOption('password');
        await connection.locator('#git-password').fill('SYNTHETIC UNLOCK PASSWORD');
        await connection.locator('#git-password-confirm').fill('SYNTHETIC UNLOCK PASSWORD');
      }
      await connection.locator('#git-consent').check();
      await connection.getByRole('button', { name: 'Save Connection', exact: true }).click();
      await connection.locator('#git-status').filter({ hasText: 'encrypted and saved' }).waitFor();
      assert.equal(await connection.locator('#git-token').inputValue(), ''); assert.equal(await connection.locator('#git-password').inputValue(), '');
      const stored = await worker.evaluate(() => chrome.storage.local.get(null));
      assert.equal(JSON.stringify(stored).includes(synthetic), false); assert.deepEqual(stored.syntheticFavorites, { keep: true });
      assert.ok(stored.gitProviderOrigins.includes(provider === 'github' ? 'https://api.github.com' : 'https://git.example.edu'));
      if (provider === 'gitlab') {
        // Verify the real content-script world cannot read password-unlock keys from trusted session storage.
        const cdp = await context.newCDPSession(source);
        const worlds = [];
        cdp.on('Runtime.executionContextCreated', event => worlds.push(event.context));
        await cdp.send('Runtime.enable');
        let isolated = false;
        for (const world of worlds) {
          const identity = await cdp.send('Runtime.evaluate', { expression: 'globalThis.chrome?.runtime?.id || null', contextId: world.id, returnByValue: true });
          if (identity.result.value !== id) continue;
          isolated = true;
          const access = await cdp.send('Runtime.evaluate', { expression: '(async()=>{try{await chrome.storage.session.get(null);return {denied:false};}catch{return {denied:true};}})()', contextId: world.id, returnByValue: true, awaitPromise: true });
          assert.equal(access.result.value.denied, true, 'Content scripts cannot read Git unlock keys');
        }
        assert.equal(isolated, true); await cdp.detach();
      }
      await connection.locator('#git-test').click();
      await connection.locator('#git-status').filter({ hasText: 'Connected.' }).waitFor();
      assert.equal(writes.length, 0);
      // Keep requested visual artifacts outside the shared repository; ordinary runs write no screenshots.
      if (process.env.INTEGRATION_NAVIGATOR_SCREENSHOTS) {
        fs.mkdirSync(process.env.INTEGRATION_NAVIGATOR_SCREENSHOTS, { recursive: true });
        await connection.emulateMedia({ colorScheme: provider === 'github' ? 'light' : 'dark' });
        await connection.screenshot({ path: path.join(process.env.INTEGRATION_NAVIGATOR_SCREENSHOTS, `v3-connection-${provider}.png`), fullPage: true });
      }

      // Open export with the original Packages document active and its real worker-bound grant intact.
      await source.bringToFront();
      const exporting = context.waitForEvent('page');
      await popup.evaluate(async () => { await PopupTabs.refreshContext(); PopupTabs.select('export'); document.querySelector('#export-pipelines').click(); });
      const exported = await exporting; exported.on('pageerror', error => errors.push(error.message));
      await exported.locator('#export-status').filter({ hasText: 'Preview ready' }).waitFor();
      // Missing permission fails before source collection or provider access.
      await exported.evaluate(() => { chrome.permissions.contains = async () => false; });
      const sourcesBefore = await source.evaluate(() => stats.sources);
      await exported.locator('#git-prepare').click();
      await exported.locator('#git-result').filter({ hasText: 'permission is missing' }).waitFor();
      assert.equal(await source.evaluate(() => stats.sources), sourcesBefore);
      await exported.evaluate(() => { chrome.permissions.contains = async () => true; });
      await exported.locator('#git-prepare').click();
      await exported.locator('#git-comparison').waitFor({ state: 'visible' });
      assert.equal(writes.length, 0); assert.equal(await exported.locator('#git-push').isDisabled(), true);
      assert.match(await exported.locator('#git-destination').innerText(), /Visibility: private/);
      assert.equal(await exported.locator('#git-changes li').count(), 1);
      // Layout/selection changes invalidate already-prepared source buffers and confirmation.
      await exported.locator('#include-formatted').check(); assert.equal(await exported.locator('#git-comparison').isHidden(), true);
      await exported.locator('#git-prepare').click(); await exported.locator('#git-comparison').waitFor({ state: 'visible' });
      assert.equal(await exported.locator('#git-changes li').count(), 3);
      // A changed remote head causes zero writes and requires a new preview rather than a silent rebase.
      await exported.locator('#git-confirm').check(); failHead = true;
      await exported.locator('#git-push').click();
      await exported.locator('#git-result').filter({ hasText: 'Remote branch changed' }).waitFor(); assert.equal(writes.length, 0);
      failHead = false;
      await exported.locator('#git-prepare').click(); await exported.locator('#git-comparison').waitFor({ state: 'visible' });
      await exported.locator('#git-confirm').check(); const collected = await source.evaluate(() => stats.sources);
      if (process.env.INTEGRATION_NAVIGATOR_SCREENSHOTS) await exported.screenshot({ path: path.join(process.env.INTEGRATION_NAVIGATOR_SCREENSHOTS, `v3-comparison-${provider}.png`), fullPage: true });
      await exported.locator('#git-push').click();
      await exported.locator('#git-result').filter({ hasText: '3 files committed.' }).waitFor();
      assert.equal(await source.evaluate(() => stats.sources), collected, 'Push uses the confirmed prepared files without new native source requests');
      assert.ok(writes.length > 0); assert.equal(await exported.locator('#git-comparison').isHidden(), true);
      assert.equal(await exported.locator('#git-result a').getAttribute('href'), provider === 'github' ? `https://github.com/owner/repo/commit/${commit}` : `https://git.example.edu/group/project/-/commit/${commit}`);
      await exported.close();
    }
    assert.deepEqual(errors, []);
    assert.ok(calls.length > 0); assert.deepEqual((await worker.evaluate(() => chrome.storage.local.get('syntheticFavorites'))).syntheticFavorites, { keep: true });
    console.log('PASS installed Git export: real settings/worker/native source flow, both providers, encrypted setup, missing permission, formatted file preview, explicit confirmation, conflict/no writes, and commit links without source rereads');
  } finally {
    // Close only this owned context and remove only its verified system-temp profile, even after startup failure.
    try { await context?.close(); }
    finally {
      if (path.dirname(profile) !== temporaryRoot || !path.basename(profile).startsWith('navigator-git-test-') || fs.existsSync(profile) && fs.lstatSync(profile).isSymbolicLink()) throw Error('Unexpected test profile');
      fs.rmSync(profile, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 });
    }
  }
})().catch(error => { console.error(error); process.exitCode = 1; });
