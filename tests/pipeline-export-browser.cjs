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
  {name:'Integration',version:'v1.0.0',type:'integration'},{name:'API',version:'v1.0.0',type:'api'},{name:'Sub',version:'v1.0.0',type:'subpipeline'},
  {name:'Sub',version:'v1.0.4',type:'subpipeline'},{name:'Sub',version:'v1.0.5',type:'subpipeline'},{name:'Sub',version:'v2.0.5',type:'subpipeline'}],transformFunctions:[{name:'Function',version:'v1.0.0'}]};
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
 // Sub-Pipeline downloads use a major-only path and retain the service's null source version.
 B0:async(callback,tenant,version,name)=>{stats.sources++;if(name==='Sub'&&!['1','2'].includes(version))throw Error('Wrong Sub-Pipeline route');return {name,version:name==='Sub'?null:version.replace(/^v/,''),requestedRoute:version,fittings:[]};}};
window.webpackChunkexperience_exchange_extension=[];
// The actual adapter passes opaque native configuration to this fixed-endpoint text reader unchanged.
const http={get:async(url,config)=>{if(config!==opaque||url!=='https://semver-s3-service.prod.10005.elluciancloud.com/artifact/synthetic-tenant/transformFunction/latest/Function.js')throw Error('Unexpected transformer request');stats.sources++;return {status:200,data:'// Synthetic source\\nfunction transform(message) { return message; }\\n'};}};
window.webpackChunkexperience_exchange_extension.push=entry=>entry[2](name=>name==='./src/server/ServerHelper.js'?server:name==='./node_modules/axios/lib/axios.js'?{A:http}:{});
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
    await worker.evaluate(() => chrome.storage.local.set({ exportToolsEnabled:true, sharedFromEnabled: true, designerOwnershipCache: {
      'synthetic-tenant': { environment: 'synthetic-production', packages: [{ name: 'Owned Package', pipelines: ['Integration', 'API', 'Sub'], transformFunctions: ['Function'] }] },
    }, syntheticPreserve: { favorites: ['untouched'] } }));
    const id = new URL(worker.url()).host;
    const source = await context.newPage();
    await source.goto(site + home);
    await source.evaluate(() => enterPackages());
    const popup = await context.newPage();
    await popup.goto(`chrome-extension://${id}/popup.html`);
    // Verify actual installed-page enforcement without live services or changing the real source context.
    const policy = await popup.evaluate(async () => {
      const violations = [];
      const observe = event => violations.push(event.effectiveDirective);
      document.addEventListener('securitypolicyviolation', observe);
      const original = document.baseURI;
      const base = document.createElement('base');
      base.href = 'https://blocked.example.invalid/';
      document.head.append(base);
      const unchangedBase = document.baseURI === original;
      const embedded = document.createElement('object');
      embedded.data = 'data:text/html,synthetic';
      document.body.append(embedded);
      const inline = document.createElement('script');
      inline.textContent = 'globalThis.__syntheticInlineRan = true;';
      document.head.append(inline);
      // CSP violation reports are queued; wait briefly before reading their fixed directive names.
      await new Promise(resolve => setTimeout(resolve, 100));
      base.remove(); embedded.remove(); inline.remove();
      document.removeEventListener('securitypolicyviolation', observe);
      return { violations, unchangedBase, inlineRan: globalThis.__syntheticInlineRan === true };
    });
    assert.equal(policy.unchangedBase, true);
    assert.equal(policy.inlineRan, false);
    for (const directive of ['base-uri', 'object-src', 'script-src-elem']) assert.ok(policy.violations.includes(directive), `Missing enforced ${directive}`);
    // An extension opened as a test tab has sender.tab; the worker preserves toolbar-style route reads.
    await popup.exposeFunction('fixturePageContext', () => worker.evaluate(async () => {
      const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
      return chrome.tabs.sendMessage(tab.id, { type: 'designer-ownership-context' }, { frameId: 0 });
    }));
    await popup.evaluate(() => {
      const send = chrome.tabs.sendMessage.bind(chrome.tabs);
      chrome.tabs.sendMessage = (...args) => args[1]?.type === 'designer-ownership-context' ? window.fixturePageContext() : send(...args);
    });

    async function openExport() {
      // Keep the synthetic Packages page active while invoking the real settings button in its own document.
      await source.bringToFront();
      popup.once('dialog',dialog=>dialog.accept());
      await popup.evaluate(async () => { await PopupTabs.refreshContext(); PopupTabs.select('export'); document.dispatchEvent(new KeyboardEvent('keydown',{key:'D',shiftKey:true})); });
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
    assert.equal(await exported.locator('.export-package').count(), 2);
    await exported.locator('.package-name').first().click();
    await exported.locator('.pipeline-checkbox').first().waitFor();
    assert.equal(await exported.locator('.pipeline-checkbox').count(), 6);
    assert.equal(await exported.locator('.package-count').first().innerText(), '6 of 6 selected (Pipelines: 2, Sub-Pipelines: 2, APIs: 1, Transformers: 1)');
    assert.match(await exported.locator('#export-counts').innerText(), /7 of 7 files selected \(Pipelines: 2, Sub-Pipelines: 2, APIs: 2, Transformers: 1\)/);
    // Same-named major rows are independent checkboxes, not one shared selection key.
    const firstMajor = exported.getByRole('checkbox', { name: 'Select Pipeline: Sub (sub-pipeline, v1.0.5)', exact: true });
    const secondMajor = exported.getByRole('checkbox', { name: 'Select Pipeline: Sub (sub-pipeline, v2.0.5)', exact: true });
    await firstMajor.uncheck();
    assert.equal(await exported.locator('.package-count').first().innerText(), '5 of 6 selected (Pipelines: 2, Sub-Pipelines: 1, APIs: 1, Transformers: 1)');
    assert.equal(await secondMajor.isChecked(), true);
    assert.match(await exported.locator('#export-counts').innerText(), /6 of 7 files selected \(Pipelines: 2, Sub-Pipelines: 1, APIs: 2, Transformers: 1\)/);
    await firstMajor.check();
    assert.equal(await source.evaluate(() => stats.sources), 0, 'Preview must not retrieve code');
    assert.equal(await source.evaluate(() => stats.packages), 2, 'Confirmed Packages export includes accessible supplier packages');
    // Exercise a human-length pause before download; the separate worker regression forces cold rehydration.
    // Browser automation can keep debug-attached workers alive, so this delay alone is not a restart proof.
    await new Promise((resolve) => setTimeout(resolve, 35000));
    // Only explicit download traverses worker -> isolated bridge -> native reader and returns source JSON.
    const downloadEvent = exported.waitForEvent('download');
    await exported.locator('#download-zip').click();
    const downloaded = await downloadEvent;
    assert.equal(downloaded.suggestedFilename(), 'integration-navigator-synthetic-tenant.zip');
    await exported.locator('#save-zip').waitFor();
    worker = context.serviceWorkers()[0] || await context.waitForEvent('serviceworker', { timeout: 15000 });
    const chunks = [];
    for await (const chunk of await downloaded.createReadStream()) chunks.push(chunk);
    const bytes = Buffer.concat(chunks);
    assert.equal(await exported.locator('#save-zip').getAttribute('href'), null, 'Retry must not expose an unverified blob link');
    // A valid retry checks the original document but reuses the same complete ZIP without another source read.
    const retryEvent = exported.waitForEvent('download');
    await exported.locator('#save-zip').click();
    const retryChunks = [];
    for await (const chunk of await (await retryEvent).createReadStream()) retryChunks.push(chunk);
    assert.deepEqual(Buffer.concat(retryChunks), bytes);
    assert.equal(await source.evaluate(() => stats.sources), 7);
    assert.equal(bytes.readUInt32LE(0), 0x04034b50);
    for (const name of ['API', 'Integration_v0', 'Integration_v1', 'Sub_v1', 'Sub_v2']) assert.ok(bytes.includes(Buffer.from(`Owned Package/${name}.json`)));
    assert.ok(bytes.includes(Buffer.from('Owned Package/Function.js')));
    // Read STORE entries to prove the ZIP preserves null rather than inserting the package version.
    let offset = 0;
    while (bytes.readUInt32LE(offset) === 0x04034b50) {
      const size = bytes.readUInt32LE(offset + 18);
      const nameLength = bytes.readUInt16LE(offset + 26);
      const start = offset + 30 + nameLength + bytes.readUInt16LE(offset + 28);
      const name = bytes.subarray(offset + 30, offset + 30 + nameLength).toString();
      // Both major-only routes must reach the matching file without relabeling null source versions.
      if (/\/Sub_v[12]\.json$/.test(name)) {
        const data = JSON.parse(bytes.subarray(start, start + size));
        assert.equal(data.version, null);
        assert.equal(data.requestedRoute, /_v(\d+)\.json$/.exec(name)[1]);
      }
      if (name === 'Owned Package/Integration_v0.json') assert.equal(JSON.parse(bytes.subarray(start, start + size)).version, '0.9.0');
      if (name === 'Owned Package/Integration_v1.json') assert.equal(JSON.parse(bytes.subarray(start, start + size)).version, '1.0.0');
      if (name === 'Owned Package/Function.js') assert.equal(bytes.subarray(start, start + size).toString(), '// Synthetic source\nfunction transform(message) { return message; }\n');
      offset = start + size;
    }
    assert.equal(await source.evaluate(() => stats.sources), 7);
    assert.equal(bytes.includes(Buffer.from('Supplier Package/')), true);
    // A new export document cannot replay the consumed ticket or inherit its source authorization.
    const replay = await context.newPage();
    await replay.goto(exported.url());
    await replay.locator('#export-status').filter({ hasText: 'Preview expired' }).waitFor();
    assert.equal(await replay.locator('.export-package').count(), 0);
    await replay.close();

    // Refresh and Cancel keep metadata-only preview distinct from source retrieval.
    await exported.locator('#refresh-preview').click();
    await exported.locator('#export-status').filter({ hasText: 'Preview ready' }).waitFor();
    assert.equal(await source.evaluate(() => stats.sources), 7);
    await exported.locator('#cancel-export').click();
    assert.equal(await exported.locator('#save-zip').isHidden(), true);
    await exported.close();
    // A separately confirmed advanced launch works without saved-source consent, but Cancel revokes it.
    await worker.evaluate(() => chrome.storage.local.set({ sharedFromEnabled: false }));
    const advanced = await openExport();
    assert.equal(await advanced.locator('.export-package').count(), 2);
    for (const group of await advanced.locator('.package-name').all()) await group.click();
    await advanced.waitForFunction(() => document.querySelectorAll('.pipeline-checkbox').length === 7);
    assert.equal(await advanced.locator('.pipeline-checkbox').count(), 7);
    await advanced.locator('#cancel-export').click();
    await advanced.locator('#refresh-preview').click();
    await advanced.locator('#export-status').filter({ hasText: 'Reopen Packages export with Shift+D.' }).waitFor();
    await advanced.close();

    // A source reload cannot silently retarget an existing launch to the replacement document.
    // Opt-out deliberately clears saved observations; restore only this synthetic fixture for the next case.
    await worker.evaluate(() => chrome.storage.local.set({ sharedFromEnabled: true, designerOwnershipCache: {
      'synthetic-tenant': { environment: 'synthetic-production', packages: [{ name: 'Owned Package', pipelines: ['Integration', 'API', 'Sub'], transformFunctions: ['Function'] }] },
    } }));
    const stale = await openExport();
    const staleDownload = stale.waitForEvent('download');
    await stale.locator('#download-zip').click();
    await staleDownload;
    await source.reload();
    await stale.locator('#save-zip').click();
    await stale.locator('#export-status').filter({ hasText: 'The source page, tenant, or consent changed. Reopen export from settings.' }).waitFor();
    assert.equal(await stale.locator('#save-zip').isHidden(), true);
    assert.equal(await source.evaluate(() => stats.sources + stats.packages + stats.lists), 0);
    // A same-document tenant change must also revoke the completed archive, not silently reuse its blob.
    const switched = await openExport();
    const switchedDownload = switched.waitForEvent('download');
    await switched.locator('#download-zip').click();
    await switchedDownload;
    await source.evaluate(() => { owner.context.tenantId = 'different-synthetic-tenant'; });
    await switched.locator('#save-zip').click();
    await switched.locator('#export-status').filter({ hasText: 'The source page, tenant, or consent changed.' }).waitFor();
    assert.equal(await switched.locator('#save-zip').isHidden(), true);
    assert.equal(await source.evaluate(() => stats.sources), 7);
    await source.evaluate(() => { owner.context.tenantId = 'synthetic-tenant'; });
    // Closing the original tab retires its worker grant; retry cannot escape through a local blob link.
    const closed = await openExport();
    const closedDownload = closed.waitForEvent('download');
    await closed.locator('#download-zip').click();
    await closedDownload;
    await source.close();
    await closed.locator('#save-zip').click();
    await closed.locator('#export-status').filter({ hasText: 'The source page, tenant, or consent changed.' }).waitFor();
    assert.equal(await closed.locator('#save-zip').isHidden(), true);
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
