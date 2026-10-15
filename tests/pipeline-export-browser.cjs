'use strict';

// Run the complete installed-extension message path in a disposable profile with intercepted synthetic services.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { chromium } = require('playwright');
const extension = process.env.INTEGRATION_NAVIGATOR_SOURCE || path.resolve(__dirname, '..');
const site = 'https://experience-test.elluciancloud.com';
const home = '/fixture/app/home';
const packagesPath = '/fixture/app/all-accounts/Ellucian/data-connect/home';
const html = `<div data-testid="master"><h2 id="home_title-packages">PACKAGES</h2><ul role="tree"><li data-level="1" data-nodeid="owned" package-element><span>Owned Package</span></li></ul></div>
<main id="pipelineManager-main-customBlock"><h1 id="packageDetails-title">Package: Owned Package</h1></main><script>
// Native fixture helpers accept an opaque config and callback without requesting credentials or service URLs.
const owned={name:'Owned Package',nameAndExtension:'owned.json',pipelines:[{name:'Integration',version:'v0.9.0',type:'integration'},
  {name:'Integration',version:'v1.0.0',type:'integration'},{name:'API',version:'v1.0.0',type:'api'},{name:'Sub',version:'v1.0.0',type:'subpipeline'}]};
const supplied={name:'Supplier Package',nameAndExtension:'supplier.json',pipelines:[{name:'Supplier',version:'v1.0.0',type:'api'}]};
window.stats={lists:0,packages:0,sources:0};
window.__PRELOADED_STATE__={tenant:'synthetic-tenant'};
window.owner={context:{tenantId:'synthetic-tenant',getJwt:()=>{throw Error('Session callback must remain native-owned');}},
  state:{currentTenant:'synthetic-tenant',menu:[{'package-element':owned},{'package-element':supplied}]}};
const row=document.querySelector('li');row.__reactFiber$fixture={return:{stateNode:owner}};
row.__reactProps$fixture={'package-element':owned};
const opaque={};
const server={G9:async(callback,tenant,expand)=>{if(expand!==false)throw Error('Unbounded fan-out');stats.lists++;return [owned,supplied].map(pkg=>({nameAndExtension:pkg.nameAndExtension,version:'v1.0.0'}));},
 db:async()=>opaque,bP:async(config,tenant,version,file)=>{if(config!==opaque)throw Error('Opaque config changed');stats.packages++;return file==='owned.json'?owned:supplied;},
 B0:async(callback,tenant,version,name)=>{stats.sources++;return {name,version:'1.0.0',fittings:[]};}};
window.webpackChunkexperience_exchange_extension=[];
window.webpackChunkexperience_exchange_extension.push=entry=>entry[2](name=>name==='./src/server/ServerHelper.js'?server:{});
window.enterPackages=()=>{history.pushState({},'','${packagesPath}');dispatchEvent(new Event('ellucian-left-panel-dom-changed'));};
</script>`;

(async () => {
  const temporaryRoot = fs.realpathSync(os.tmpdir());
  const profile = fs.mkdtempSync(path.join(temporaryRoot, 'navigator-export-test-'));
  let context;
  try {
    // A failed browser launch must still remove only this run's generated profile.
    context = await chromium.launchPersistentContext(profile, { headless: true,
      ...(process.env.INTEGRATION_NAVIGATOR_BROWSER ? { channel: process.env.INTEGRATION_NAVIGATOR_BROWSER } : {}),
      args: [`--disable-extensions-except=${extension}`, `--load-extension=${extension}`] });
    const network = [];
    await context.route('**/*', (route) => {
      if (route.request().url().startsWith('chrome-extension:')) return route.continue();
      network.push(route.request().url());
      return route.fulfill({ contentType: 'text/html', body: html });
    });
    let worker = context.serviceWorkers()[0] || await context.waitForEvent('serviceworker', { timeout: 15000 });
    await worker.evaluate(() => pendingOwnershipUpdate);
    await worker.evaluate(() => chrome.storage.local.set({ sharedFromEnabled: true, designerOwnershipCache: {
      synthetic: { packages: [{ name: 'Owned Package', pipelines: ['Integration', 'API', 'Sub'] }] },
    }, syntheticPreserve: { favorites: ['untouched'] } }));
    const id = new URL(worker.url()).host;
    const source = await context.newPage();
    await source.goto(site + home);
    await source.evaluate(() => enterPackages());
    const popup = await context.newPage();
    await popup.goto(`chrome-extension://${id}/popup.html`);

    async function openExport() {
      // Keep the synthetic Packages page active while invoking the real settings button in its own document.
      await source.bringToFront();
      const opened = context.waitForEvent('page');
      await popup.evaluate(() => document.querySelector('#export-pipelines').click());
      const page = await opened;
      page.setDefaultTimeout(15000);
      await page.waitForFunction(() => document.querySelector('#export-progress')?.hidden === true);
      await page.locator('#export-status').filter({ hasText: 'Preview ready' }).waitFor();
      return page;
    }

    // SPA entry has a stale original MessageSender URL; live route binding still identifies Packages safely.
    const exported = await openExport();
    assert.equal(await exported.locator('.export-package').count(), 1);
    await exported.locator('.package-name').click();
    await exported.locator('.pipeline-checkbox').first().waitFor();
    assert.equal(await exported.locator('.pipeline-checkbox').count(), 3);
    assert.equal(await source.evaluate(() => stats.sources), 0, 'Preview must not retrieve code');
    assert.equal(await source.evaluate(() => stats.packages), 1, 'Default preview inspects only recorded packages');
    // Exercise a human-length pause before download; the separate worker regression forces cold rehydration.
    // Browser automation can keep debug-attached workers alive, so this delay alone is not a restart proof.
    await new Promise((resolve) => setTimeout(resolve, 35000));
    // Only explicit download traverses worker -> isolated bridge -> native reader and returns source JSON.
    await exported.locator('#download-zip').click();
    await exported.locator('#save-zip').waitFor();
    worker = context.serviceWorkers()[0] || await context.waitForEvent('serviceworker', { timeout: 15000 });
    const bytes = Buffer.from(await exported.evaluate(async () => [...new Uint8Array(await (await fetch(document.querySelector('#save-zip').href)).arrayBuffer())]));
    assert.equal(bytes.readUInt32LE(0), 0x04034b50);
    for (const name of ['API', 'Integration', 'Sub']) assert.ok(bytes.includes(Buffer.from(`Owned Package/${name}.json`)));
    assert.equal(await source.evaluate(() => stats.sources), 3);
    assert.equal(bytes.includes(Buffer.from('Supplier Package/')), false);
    // A new export document cannot replay the consumed ticket or inherit its source authorization.
    const replay = await context.newPage();
    await replay.goto(exported.url());
    await replay.locator('#export-status').filter({ hasText: 'Preview expired' }).waitFor();
    assert.equal(await replay.locator('.export-package').count(), 0);
    await replay.close();

    // Refresh and Cancel keep metadata-only preview distinct from source retrieval.
    await exported.locator('#refresh-preview').click();
    await exported.locator('#export-status').filter({ hasText: 'Preview ready' }).waitFor();
    assert.equal(await source.evaluate(() => stats.sources), 3);
    await exported.locator('#cancel-export').click();
    assert.equal(await exported.locator('#save-zip').isHidden(), true);
    await exported.close();
    // A separately confirmed advanced launch works without saved-source consent, but Cancel revokes it.
    await worker.evaluate(() => chrome.storage.local.set({ sharedFromEnabled: false }));
    await popup.bringToFront();
    await popup.keyboard.press('Shift+D');
    popup.once('dialog', (dialog) => dialog.accept());
    await popup.locator('#export-all-accessible').check();
    const advanced = await openExport();
    assert.equal(await advanced.locator('.export-package').count(), 2);
    for (const group of await advanced.locator('.package-name').all()) await group.click();
    await advanced.waitForFunction(() => document.querySelectorAll('.pipeline-checkbox').length === 4);
    assert.equal(await advanced.locator('.pipeline-checkbox').count(), 4);
    await advanced.locator('#cancel-export').click();
    await advanced.locator('#refresh-preview').click();
    await advanced.locator('#export-status').filter({ hasText: 'Enable Shared From first.' }).waitFor();
    await advanced.close();

    // A source reload cannot silently retarget an existing launch to the replacement document.
    // Opt-out deliberately clears saved observations; restore only this synthetic fixture for the next case.
    await worker.evaluate(() => chrome.storage.local.set({ sharedFromEnabled: true, designerOwnershipCache: {
      synthetic: { packages: [{ name: 'Owned Package', pipelines: ['Integration', 'API', 'Sub'] }] },
    } }));
    const stale = await openExport();
    await source.reload();
    await stale.locator('#refresh-preview').click();
    await stale.locator('#export-status').filter({ hasText: 'Source page changed. Reopen export from settings.' }).waitFor();
    assert.equal(await source.evaluate(() => stats.sources + stats.packages + stats.lists), 0);
    assert.deepEqual(await worker.evaluate(() => chrome.storage.local.get('syntheticPreserve')), { syntheticPreserve: { favorites: ['untouched'] } });
    assert.ok(network.every((url) => url === site + home || url === site + packagesPath), 'No live service or unrelated network request');
    console.log('PASS installed exporter messaging: real SPA/popup/worker/content/MAIN preview, all types, explicit ZIP, exact eligibility, advanced confirmation/revocation, ticket replay, original-document reload isolation, no live services');
  } finally {
    // Keep: browser tests own only this exact temp child and must clean it even when assertions fail (2.0.4).
    try { await context?.close(); }
    finally {
      if (path.dirname(profile) !== temporaryRoot || !path.basename(profile).startsWith('navigator-export-test-') ||
        fs.existsSync(profile) && fs.lstatSync(profile).isSymbolicLink()) throw new Error('Unexpected disposable profile path.');
      fs.rmSync(profile, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 });
    }
  }
})().catch((error) => { console.error(error); process.exitCode = 1; });
