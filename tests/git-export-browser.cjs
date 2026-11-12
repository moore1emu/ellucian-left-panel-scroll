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
window.stats={sources:0};window.__PRELOADED_STATE__={tenant:'11111111-2222-4333-8444-555555555555'};
const owner={state:{currentTenant:'11111111-2222-4333-8444-555555555555',menu:[{'package-element':pkg}]},context:{tenantId:'11111111-2222-4333-8444-555555555555',getJwt:()=>{throw Error('Credentials must remain native-owned');}}};
const row=document.querySelector('li');row.__reactFiber$fixture={return:{stateNode:owner}};row.__reactProps$fixture={'package-element':pkg};
const opaque={};const helper={G9:async()=>[{nameAndExtension:'owned.json',version:'v1.0.0'}],db:async()=>opaque,bP:async()=>pkg,
B0:async()=>{stats.sources++;return {name:'Pipeline',fittings:[]};}};
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
    await worker.evaluate(() => chrome.storage.local.set({ exportToolsEnabled:true, sharedFromEnabled: true, designerOwnershipCache: { '11111111-2222-4333-8444-555555555555': { environment: 'Test', packages: [{ name: 'Owned', pipelines: ['Pipeline'] }] } }, syntheticFavorites: { keep: true } }));
    const id = new URL(worker.url()).host;
    const source = await context.newPage(); await source.goto(site + packagesPath);
    const popup = await context.newPage(); await popup.goto(`chrome-extension://${id}/popup.html`);
    // Follow the real settings connection entry; provider permission prompts are not bypassed in production.
    await popup.evaluate(() => PopupTabs.select('export'));
    const opened = context.waitForEvent('page'); await popup.locator('#manage-git').click();
    const connection = await opened; await connection.waitForFunction(() => !document.querySelector('#git-fields').disabled);
    assert.equal(await connection.locator('#git-folder, #git-legacy-folder').count(),0);
    await connection.waitForFunction(()=>!document.getElementById('location-fields').disabled);
    assert.equal((await connection.locator('#location-json').inputValue()).includes('IntegrationPackages'),false);
    // Tabs preserve one connection surface; repository and authentication groups sit side by side.
    for(const width of [390,1280]) {
      await connection.setViewportSize({width,height:900});
      assert.equal(await connection.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);
      if(width===1280) {
        const left=await connection.locator('.connection-group').nth(0).boundingBox();
        const right=await connection.locator('.connection-group').nth(1).boundingBox();
        assert.ok(left.x+left.width<=right.x);
      }
    }
    assert.equal(await connection.locator('#git-token-help').count(), 0, 'Fresh-token reminder belongs to Save validation, not a permanent paragraph');
    // Help starts collapsed and remains operable by keyboard without submitting the credential form.
    for (const id of ['git-github-help', 'git-gitlab-help']) {
      const provider = id === 'git-github-help' ? 'github' : 'gitlab';
      await connection.locator('#git-provider').selectOption(provider);
      const help = connection.locator('#' + id);
      assert.equal(await help.isVisible(), true);
      assert.equal(await connection.locator('#git-' + (provider === 'github' ? 'gitlab' : 'github') + '-help').isVisible(), false);
      assert.equal(await help.evaluate(element => element.open), false);
      await help.locator('summary').focus(); await connection.keyboard.press('Enter');
      assert.equal(await help.evaluate(element => element.open), true);
      assert.ok(await help.locator('li').count() >= 5);
      assert.equal(await help.locator('summary a, summary button').count(), 0);
      assert.equal(await help.locator('p').first().locator('a').count(), 1, 'Both provider links belong at the top');
      assert.match(await help.innerText(), /Token Name: Integration Navigator Test/);
      assert.match(await help.innerText(), /Expiration:.*7 days/);
      await help.locator('summary').press('Enter');
      assert.equal(await help.evaluate(element => element.open), false);
    }
    await connection.evaluate(() => { chrome.permissions.contains = async () => true; });
    const errors = []; connection.on('pageerror', error => errors.push(error.message));

    for (const provider of ['github', 'gitlab']) {
      remote = old; remoteFiles = []; writes = []; uploaded.clear(); failHead = false;
      await connection.locator('#git-provider').selectOption(provider);
      if (provider === 'gitlab') { await connection.locator('#git-custom-server').check(); await connection.locator('#git-server').fill('https://git.example.edu'); }
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
      // Native validation must explain why an unchanged stored token cannot be silently reused for saving edits.
      const revisionBeforeEmptySave = await connection.evaluate(async () => (await GitVault.info()).revision);
      await connection.getByRole('button', { name: 'Save Connection', exact: true }).click();
      assert.match(await connection.locator('#git-status').innerText(), /Every change requires you to re-enter the access token before saving/);
      assert.equal(await connection.evaluate(async () => (await GitVault.info()).revision), revisionBeforeEmptySave);
      await connection.locator('#git-token').fill(synthetic);
      assert.equal(await connection.locator('#git-token').evaluate(input => input.validationMessage), '');
      await connection.locator('#git-token').fill('');
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
        // Capture optional help in both browser themes without changing its default collapsed state.
        await connection.locator('#git-github-help').evaluate(element => { element.open = true; });
        await connection.locator('#git-gitlab-help').evaluate(element => { element.open = true; });
        await connection.screenshot({ path: path.join(process.env.INTEGRATION_NAVIGATOR_SCREENSHOTS, `v3-token-help-${provider}.png`), fullPage: true });
        await connection.locator('#git-github-help').evaluate(element => { element.open = false; });
        await connection.locator('#git-gitlab-help').evaluate(element => { element.open = false; });
      }

      // Open export with the original Packages document active and its real worker-bound grant intact.
      await source.bringToFront();
      const exporting = context.waitForEvent('page');
      popup.once('dialog',dialog=>dialog.accept());
      await popup.evaluate(async () => { await PopupTabs.refreshContext(); PopupTabs.select('export'); document.dispatchEvent(new KeyboardEvent('keydown',{key:'D',shiftKey:true})); document.querySelector('#export-pipelines').click(); });
      const exported = await exporting; exported.on('pageerror', error => errors.push(error.message));
      await exported.locator('#export-status').filter({ hasText: 'Preview ready' }).waitFor();
      // Saving a readable alias changes this tenant only, without re-entering or changing the saved token.
      const readsBeforeLocations=await source.evaluate(()=>stats.sources);
      await exported.locator('#location-edit').click();
      const locationPage=exported;
      await locationPage.waitForFunction(()=>!document.getElementById('location-fields').disabled);
      assert.equal(await locationPage.locator('#workspace-configuration').isVisible(),true);
      const connectionBeforePaths=await locationPage.evaluate(()=>GitVault.info());
      const locations=JSON.parse(await locationPage.locator('#location-json').inputValue());
      const tenantKey=Object.keys(locations.tenants).find(key=>key.endsWith('11111111-2222-4333-8444-555555555555'));
      locations.tenants[tenantKey].IntegrationPackages={folder:'Test/IntegrationPackages'};
      await locationPage.evaluate(value=>ace.edit('json-code').setValue(value,-1),JSON.stringify(locations,null,2));
      await locationPage.locator('#location-save').click();
      await locationPage.locator('#location-settings-status').filter({hasText:'Export configuration saved.'}).waitFor();
      assert.deepEqual(await locationPage.evaluate(()=>GitVault.info()),connectionBeforePaths);
      await exported.waitForFunction(()=>document.getElementById('location-tree').textContent.startsWith('Test/'));
      // Invalid JSON cannot change saved paths or credentials.
      const acceptedLocations=await worker.evaluate(()=>chrome.storage.local.get('gitTenantLocations'));
      await locationPage.evaluate(()=>ace.edit('json-code').setValue('{broken',-1));
      await locationPage.locator('#location-save').click();
      await locationPage.locator('#location-settings-status').filter({hasText:'Could not save.'}).waitFor();
      assert.deepEqual(await worker.evaluate(()=>chrome.storage.local.get('gitTenantLocations')),acceptedLocations);
      assert.deepEqual(await locationPage.evaluate(()=>GitVault.info()),connectionBeforePaths);
      locationPage.once('dialog',dialog=>dialog.accept());
      await locationPage.locator('#location-reload').click();
      await exported.locator('#workspace-export-tab').click();
      assert.equal(await source.evaluate(()=>stats.sources),readsBeforeLocations,'Location setup reads no source definitions');
      assert.match(await exported.locator('#location-tree').innerText(),/^Test\/\n  IntegrationPackages\//);
      assert.doesNotMatch(await exported.locator('#location-tree').innerText(),/[├└│]/);
      // A popup-opened connection can return to the sole export without changing its document or selection.
      const beforeReturn = exported.url();
      // Keep Return to Export beside the repository controls, not above the form.
      assert.equal(await connection.locator('.actions #git-return-export').count(), 1);
      await connection.locator('#git-return-export').click();
      // Wait for the asynchronous browser lookup rather than asserting a previous missing-export message.
      await connection.waitForFunction(()=>!document.querySelector('#git-return-export').disabled && document.querySelector('#git-return-status').textContent==='');
      assert.equal(await connection.locator('#git-return-status').innerText(), '');
      assert.equal(exported.url(), beforeReturn);
      assert.equal(await exported.locator('#select-all').isChecked(), true);
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
      assert.match(await exported.locator('#git-destination').innerText(), /Folder: Test\/IntegrationPackages/);
      assert.equal(await exported.locator('#git-changes li').count(), 1);
      // A different tab's route edit drops this reviewed comparison before any upload can be confirmed.
      const savedLocations=await worker.evaluate(()=>chrome.storage.local.get('gitTenantLocations'));
      await worker.evaluate(async()=>{
        const saved=await chrome.storage.local.get('gitTenantLocations');
        const key=Object.keys(saved.gitTenantLocations.tenants).find(key=>key.endsWith('11111111-2222-4333-8444-555555555555'));
        saved.gitTenantLocations.tenants[key].IntegrationPackages='Alternate/IntegrationPackages';
        await chrome.storage.local.set(saved);
      });
      await exported.locator('#git-comparison').waitFor({state:'hidden'});
      assert.equal(writes.length,0);
      await worker.evaluate(value=>chrome.storage.local.set(value),savedLocations);
      await exported.locator('#refresh-preview').click();
      await exported.locator('#export-status').filter({hasText:'Preview ready'}).waitFor();
      await exported.locator('#git-prepare').click();
      await exported.locator('#git-comparison').waitFor({state:'visible'});
      // Layout/selection changes invalidate already-prepared source buffers and confirmation.
      await exported.locator('#include-formatted').check(); assert.equal(await exported.locator('#git-comparison').isHidden(), true);
      await exported.locator('#git-prepare').click(); await exported.locator('#git-comparison').waitFor({ state: 'visible' });
      assert.equal(await exported.locator('#git-changes li').count(), 3);
      // Tenant-ID routing is independent of a friendly-name change; preparation still makes no writes.
      await worker.evaluate(async () => { const saved = await chrome.storage.local.get('designerOwnershipCache'); saved.designerOwnershipCache['11111111-2222-4333-8444-555555555555'].environment = 'RenamedTest'; await chrome.storage.local.set(saved); });
      await exported.locator('#git-prepare').click(); await exported.locator('#git-comparison').waitFor({ state: 'visible' });
      assert.match(await exported.locator('#git-destination').innerText(), /Test\/IntegrationPackages/);
      assert.equal(writes.length, 0);
      await worker.evaluate(async () => { const saved = await chrome.storage.local.get('designerOwnershipCache'); saved.designerOwnershipCache['11111111-2222-4333-8444-555555555555'].environment = 'Test'; await chrome.storage.local.set(saved); });
      await exported.locator('#git-prepare').click(); await exported.locator('#git-comparison').waitFor({ state: 'visible' });
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
      assert.match(await exported.locator('#git-result').innerText(), /Private repositories require you to sign in/);
      assert.equal((await exported.evaluate(() => GitVault.history()))[0].config.folder, 'Test/IntegrationPackages');
      await exported.close();
      // The same saved base connection resolves Production into a different folder without changing Test files.
      await worker.evaluate(async () => { const saved = await chrome.storage.local.get('designerOwnershipCache'); saved.designerOwnershipCache['aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee'] = { environment: 'Production', packages: [{ name: 'Owned', pipelines: ['Pipeline'] }] }; await chrome.storage.local.set(saved); });
      await source.evaluate(() => { owner.context.tenantId = 'aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee'; owner.state.currentTenant = 'aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee'; window.__PRELOADED_STATE__.tenant = 'aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee'; });
      await source.bringToFront();
      const prodOpening = context.waitForEvent('page');
      popup.once('dialog',dialog=>dialog.accept());
      await popup.evaluate(async () => { await PopupTabs.refreshContext(); document.dispatchEvent(new KeyboardEvent('keydown',{key:'D',shiftKey:true})); document.querySelector('#export-pipelines').click(); });
      const prodExport = await prodOpening;
      await prodExport.locator('#export-status').filter({ hasText: 'Preview ready' }).waitFor();
      // Override the other synthetic environment independently; no source-cache name is needed.
      await prodExport.locator('#location-edit').click();
      const prodLocationPage=prodExport;
      await prodLocationPage.waitForFunction(()=>!document.getElementById('location-fields').disabled);
      const prodLocations=JSON.parse(await prodLocationPage.locator('#location-json').inputValue());
      const prodKey=Object.keys(prodLocations.tenants).find(key=>key.endsWith('aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee'));
      prodLocations.tenants[prodKey].IntegrationPackages={folder:'Production/IntegrationPackages'};
      await prodLocationPage.evaluate(value=>ace.edit('json-code').setValue(value,-1),JSON.stringify(prodLocations));
      await prodLocationPage.locator('#location-save').click();
      await prodLocationPage.locator('#location-settings-status').filter({hasText:'Export configuration saved.'}).waitFor();
      await prodExport.waitForFunction(()=>document.getElementById('location-tree').textContent.startsWith('Production/'));
      await prodExport.locator('#workspace-export-tab').click();
      await prodExport.evaluate(() => { chrome.permissions.contains = async () => true; });
      const beforeProd = writes.length;
      await prodExport.locator('#git-prepare').click(); await prodExport.locator('#git-comparison').waitFor({ state: 'visible' });
      assert.match(await prodExport.locator('#git-destination').innerText(), /Folder: Production\/IntegrationPackages/);
      assert.ok((await prodExport.locator('#git-changes li').allTextContents()).every(text => text.includes('Production/IntegrationPackages/') && !text.includes('Test/IntegrationPackages/')));
      assert.equal(writes.length, beforeProd, 'Production preview makes no writes');
      await prodExport.close();
      await source.evaluate(() => { owner.context.tenantId = '11111111-2222-4333-8444-555555555555'; owner.state.currentTenant = '11111111-2222-4333-8444-555555555555'; window.__PRELOADED_STATE__.tenant = '11111111-2222-4333-8444-555555555555'; });
    }
    // Reopening Connections without a confirmed export hides old Packages entries but preserves them on save.
    await connection.reload();
    await connection.waitForFunction(()=>!document.getElementById('location-fields').disabled);
    assert.equal((await connection.locator('#location-json').inputValue()).includes('IntegrationPackages'),false);
    const hiddenBefore=await worker.evaluate(()=>chrome.storage.local.get('gitTenantLocations'));
    const ordinaryLocations=JSON.parse(await connection.locator('#location-json').inputValue());
    const ordinaryKey=Object.keys(ordinaryLocations.tenants)[0];
    ordinaryLocations.tenants[ordinaryKey].IntegrationDesigner={folder:'Custom/IntegrationDesigner'};
    await connection.locator('#workspace-configuration-tab').click();
    await connection.evaluate(value=>ace.edit('json-code').setValue(value,-1),JSON.stringify(ordinaryLocations));
    await connection.locator('#location-save').click();
    await connection.locator('#location-settings-status').filter({hasText:'Export configuration saved.'}).waitFor();
    const hiddenAfter=await worker.evaluate(()=>chrome.storage.local.get('gitTenantLocations'));
    for(const [key,mapping] of Object.entries(hiddenBefore.gitTenantLocations.tenants)) assert.deepEqual(hiddenAfter.gitTenantLocations.tenants[key].IntegrationPackages,mapping.IntegrationPackages);
    assert.equal((await connection.locator('#location-json').inputValue()).includes('IntegrationPackages'),false);
    // Cancel keeps the entry hidden; confirmed Shift+D explicitly explains the config addition, not native access.
    await connection.locator('h1').click();
    connection.once('dialog',dialog=>dialog.dismiss());
    await connection.keyboard.press('Shift+D');
    assert.equal((await connection.locator('#location-json').inputValue()).includes('IntegrationPackages'),false);
    connection.once('dialog',dialog=>{assert.match(dialog.message(),/Add IntegrationPackages.*configuration/);dialog.accept();});
    await connection.keyboard.press('Shift+D');
    assert.equal((await connection.locator('#location-json').inputValue()).includes('IntegrationPackages'),true);
    await connection.reload();
    await connection.waitForFunction(()=>!document.getElementById('location-fields').disabled);
    assert.equal((await connection.locator('#location-json').inputValue()).includes('IntegrationPackages'),false,'Reveal is temporary, not a saved permission');
    assert.deepEqual(errors, []);
    assert.ok(calls.length > 0); assert.deepEqual((await worker.evaluate(() => chrome.storage.local.get('syntheticFavorites'))).syntheticFavorites, { keep: true });
    // Saved encrypted settings survive opt-out, but the vault refuses token use from a stale open tab.
    const savedConnection=await connection.evaluate(()=>GitVault.info());
    await worker.evaluate(()=>chrome.storage.local.set({exportToolsEnabled:false}));
    assert.equal(await connection.evaluate(async()=>{try{await GitVault.token((await GitVault.info()).revision);return 'unexpected';}catch(error){return error.message;}}),'Enable Export Tools in General.');
    assert.deepEqual(await connection.evaluate(()=>GitVault.info()),savedConnection);
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
