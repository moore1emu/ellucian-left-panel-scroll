// Run the actual extension in a disposable browser against synthetic, intercepted pages only.
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const assert = require('node:assert/strict');
const { chromium } = require('playwright');
const extension = process.env.INTEGRATION_NAVIGATOR_SOURCE || path.join(__dirname, '..');
const site = 'https://experience-test.elluciancloud.com';
const route = '/fixture/app/all-accounts/Ellucian/data-connect/home';
const html = `<style>[data-testid=master]{width:480px;height:650px}li{min-height:40px}</style>
  <div data-testid="master"><div id="home_title-packages">PACKAGES</div><div><ul role="tree"></ul></div></div>
  <main id="pipelineManager-main-customBlock"><h1 id="packageDetails-title">Package: Fixture</h1><h2>Pipelines:</h2></main>
  <script>
  // Direct Designer entry has no bootstrap global, matching the observed native page.
  if(!location.pathname.includes('data-connect-designer')) window.__PRELOADED_STATE__={tenant:'stale-bootstrap'};
  // Resolve environment labels locally so opt-in source caching can be tested without any service traffic.
  window.webpackChunkdata_connect_designer=[];
  window.webpackChunkdata_connect_designer.push=(entry)=>entry[2]((name)=>name.includes('ServerHelper')?{JR:async()=>({label:'Fixture Test'})}:{});
  window.switchTenant=(tenant,page='packages')=>{
    if(page==='designer') history.pushState({},'', '/fixture/app/all-accounts/Ellucian/data-connect-designer/');
    else history.pushState({},'', '${route}');
    const list=document.querySelector('ul');list.innerHTML='';
    const row=document.createElement('li');row.dataset.level='1';row.dataset.nodeid=tenant;
    row.setAttribute('package-element','');row.innerHTML='<div class="MuiTreeItem-content"><span class="MuiTreeItem-label">'+tenant+' Package</span></div>';
    row.__reactProps$fixture={'package-element':{name:tenant+' Package',pipelines:[{name:tenant+' Pipeline',version:'1.0.0'}]}};
    // Designer's real tenant owner is outside sidebar ancestry; Packages still exposes its row state.
    row.__reactFiber$fixture=page==='designer'?{}:{stateNode:{state:{currentTenant:tenant}}};list.appendChild(row);
    // Retain a stale Designer root on Packages to verify route-specific lookup, not just priority.
    const owner={stateNode:{state:{currentTenant:page==='designer'?tenant:'stale-designer-root'}}};
    let manager=owner;for(let depth=0;depth<4;depth++) manager={return:manager};
    document.querySelector('#pipelineManager-main-customBlock').__reactFiber$fixture=manager;
    dispatchEvent(new Event('ellucian-left-panel-dom-changed'));
  };
  window.__messages=[];addEventListener('message',e=>{if(e.data?.source==='ellucian-left-panel-scroll') __messages.push(e.data.type)});
  switchTenant('test-a',location.pathname.includes('data-connect-designer')?'designer':'packages');
  </script>`;

(async () => {
  const profile = fs.mkdtempSync(path.join(os.tmpdir(), 'integration-navigator-tenant-'));
  const context = await chromium.launchPersistentContext(profile, { headless: true,
    ...(process.env.INTEGRATION_NAVIGATOR_BROWSER ? { channel: process.env.INTEGRATION_NAVIGATOR_BROWSER } : {}),
    args: [`--disable-extensions-except=${extension}`, `--load-extension=${extension}`] });
  try {
    // Reject any attempt to contact real services: every response comes from this local fixture.
    const requests = [];
    await context.route('**/*', (request) => {
      const url = request.request().url();
      // Packaged extension assets are local; intercept only external page/service traffic.
      if (url.startsWith('chrome-extension:')) return request.continue();
      requests.push(url);
      return request.fulfill({ contentType: 'text/html', body: html });
    });
    const worker = context.serviceWorkers()[0] || await context.waitForEvent('serviceworker', { timeout: 15000 });
    await worker.evaluate(() => pendingOwnershipUpdate);
    await worker.evaluate(() => chrome.storage.local.set({
      favoritePackagesByHost: {
        'experience-test.elluciancloud.com|packages': [{ packageName: 'test-a Package', packagePinned: true, pipelines: [] }],
        'experience-test.elluciancloud.com|designer': [{ packageName: 'Old Designer Pin', packagePinned: true, pipelines: [] }],
      },
    }));
    const page = await context.newPage();
    const errors = [];
    page.on('pageerror', (error) => errors.push(error.message));
    page.setDefaultTimeout(10000);
    await page.goto(site + route);
    const pin = () => page.locator('li[data-level="1"] button[aria-label^="Pin Package:"]');
    await page.locator('li[data-level="1"] button[aria-label^="Unpin Package:"]').waitFor();
    await page.locator('.ellucian-favorite-select').filter({ hasText: 'test-a Package' }).waitFor();
    const read = () => worker.evaluate(() => chrome.storage.local.get('favoritePackagesByTenant'));
    await assertPin('test-a', 'packages');
    // Switching tenants with an unchanged vanity-style URL must separate the list and ignore bootstrap identity.
    await page.evaluate(() => switchTenant('test-b'));
    await pin().waitFor();
    await page.waitForFunction(() => !document.querySelector('.ellucian-favorite-select'));
    await pin().click();
    await assertPin('test-b', 'packages');
    await page.evaluate(() => switchTenant('test-a'));
    await page.locator('.ellucian-favorite-select').filter({ hasText: 'test-a Package' }).waitFor();
    assert.equal(await page.locator('.ellucian-favorite-select').filter({ hasText: 'test-b Package' }).count(), 0);
    // SPA page navigation isolates Designer while keeping Packages intact.
    await page.evaluate(() => switchTenant('test-a', 'designer'));
    await pin().waitFor();
    await page.waitForFunction(() => !document.querySelector('.ellucian-favorite-select'));
    await pin().click();
    await assertPin('test-a', 'designer');
    assert.equal(Object.keys((await read()).favoritePackagesByTenant).length, 3);
    // Missing live identity after a switch cannot fall back to the old bootstrap tenant.
    await page.evaluate(() => switchTenant('', 'designer'));
    await page.waitForFunction(() => !document.querySelector('.ellucian-favorites-section'));
    assert.equal(await page.locator('li button[aria-label^="Pin Package:"]').count(), 0);
    assert.equal(Object.keys((await read()).favoritePackagesByTenant).length, 3);
    await page.evaluate(() => switchTenant('test-a', 'designer'));
    await page.locator('.ellucian-favorite-select').waitFor();
    // Exercise the real settings assignment, local download, and import preview in this profile.
    const popup = await context.newPage();
    popup.on('pageerror', (error) => errors.push(error.message));
    await page.bringToFront();
    const extensionId = new URL(worker.url()).host;
    await popup.goto(`chrome-extension://${extensionId}/popup.html`);
    popup.setDefaultTimeout(10000);
    // A popup opened as a test tab differs from a toolbar popup: point its query at the fixture tab.
    await page.bringToFront();
    const tabId = await worker.evaluate(async () => (await chrome.tabs.query({ active: true, currentWindow: true }))[0]?.id);
    assert.ok(Number.isInteger(tabId), 'The active synthetic tab must have an identifier');
    await popup.evaluate((id) => { chrome.tabs.query = async () => [{ id }]; const card = document.querySelector('.backup-card'); card.open = true; card.dispatchEvent(new Event('toggle')); }, tabId);
    try { await popup.locator('#assign-favorites').waitFor(); }
    catch (error) {
      console.log('Synthetic assignment diagnostics:', errors, await popup.evaluate(async () => ({
        status: document.querySelector('#backup-status').textContent,
        open: document.querySelector('.backup-card').open,
        hidden: document.querySelector('#legacy-favorites').hidden,
        settings: await chrome.storage.local.get(FavoritesData.defaults),
      })));
      throw error;
    }
    await popup.locator('#assign-favorites').click();
    await popup.waitForFunction(() => document.querySelector('#backup-status').textContent.includes('assigned'));
    // Keep portable backup actions together in the final section, with source Refresh unmoved.
    assert.deepEqual(await popup.locator('main > details > summary').allTextContents(), ['Navigation', 'Integration Packages', 'Integration Designer', 'Icon & Favorites', 'Custom Sites', 'Export & Backup']);
    assert.equal(await popup.locator('.backup-card #export-shared-from').count(), 1);
    assert.equal(await popup.locator('.backup-card #import-favorites').count(), 1);
    assert.equal(await popup.locator('.page-behavior-card #export-shared-from').count(), 0);
    assert.deepEqual(await popup.locator('.shared-from-actions button').allTextContents(), ['Refresh']);
    const refreshFeedback = await popup.locator('#shared-from-status').textContent();
    const downloadEvent = popup.waitForEvent('download');
    await popup.locator('#export-shared-from').click();
    const download = await downloadEvent;
    const backup = JSON.parse(fs.readFileSync(await download.path(), 'utf8'));
    assert.ok((await popup.locator('#backup-status').textContent()).includes('Download requested'));
    assert.equal(await popup.locator('#shared-from-status').textContent(), refreshFeedback, 'Export does not replace independent refresh feedback');
    // Verify retry guidance stays beside the moved button, without overwriting saved data.
    await popup.evaluate(() => {
      const original = chrome.storage.local.get;
      chrome.storage.local.get = (_defaults, callback) => { chrome.storage.local.get = original; callback({favoritePackagesByTenant:{invalid:'malformed'}}); };
    });
    await popup.locator('#export-shared-from').click();
    await popup.waitForFunction(() => document.querySelector('#backup-status').textContent === 'Could not export. Please try again.');
    assert.equal(await popup.locator('#export-shared-from').isEnabled(), true);
    assert.equal(await popup.locator('#export-shared-from').getAttribute('aria-busy'), 'false');
    assert.equal(await popup.locator('#shared-from-status').textContent(), refreshFeedback);
    assert.equal(backup.schemaVersion, 1);
    assert.equal(backup.favorites.length, 3);
    assert.ok(backup.favorites.some((group) => group.tenantId === 'test-a' && group.page === 'designer'));
    assert.equal(backup.unassignedFavorites.length, 0);
    assert.equal(backup.assignments.length, 2);
    // Cleanup removes only verified duplicate lists, retaining small migration markers and active pins.
    const retired = await worker.evaluate(() => chrome.storage.local.get(['favoritePackagesByHost','favoriteTenantAssignments']));
    assert.deepEqual(retired.favoritePackagesByHost, {});
    assert.equal(Object.keys(retired.favoriteTenantAssignments).length, 2);
    backup.favorites[0].packages.push({ packageName: 'Imported Pin', packagePinned: true, pipelines: [], pipelinesExpanded: true });
    await popup.locator('#backup-file').setInputFiles({ name: 'fixture-backup.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(backup)) });
    await popup.locator('#backup-preview').waitFor();
    assert.equal(await popup.locator('#backup-mode').inputValue(), 'merge');
    assert.equal(await popup.locator('#backup-sources').isChecked(), false);
    await popup.locator('#confirm-backup').click();
    await popup.waitForFunction(() => document.querySelector('#backup-status').textContent.includes('imported'));
    const restored = (await read()).favoritePackagesByTenant;
    assert.ok(Object.values(restored).some((groups) => groups.some((group) => group.packageName === 'Imported Pin')));
    // Source Refresh still uses its existing real-worker flow and leaves backup feedback alone.
    const importFeedback = await popup.locator('#backup-status').textContent();
    // A toolbar popup has no sender.tab; use the synthetic worker to preserve that same sender shape.
    await popup.exposeFunction('fixtureRefreshSources', () => worker.evaluate((id) => chrome.tabs.sendMessage(id, {type:'designer-ownership-refresh'}), tabId));
    await popup.evaluate(() => {
      const send = chrome.tabs.sendMessage.bind(chrome.tabs);
      chrome.tabs.sendMessage = (...args) => args[1]?.type === 'designer-ownership-refresh' ? window.fixtureRefreshSources() : send(...args);
    });
    // Accept consent through the synthetic settings UI so its switch and status reflect the saved choice.
    await popup.locator('details > summary').filter({ hasText: /^Integration Packages$/ }).click();
    await popup.locator('label[for="shared-from-enabled"]').click();
    await popup.locator('#confirm-shared-from').click();
    await popup.waitForFunction(() => !document.querySelector('#refresh-shared-from').disabled);
    // Wait for the automatic opt-in refresh before requesting the separate manual retry.
    await popup.waitForFunction(() => document.querySelector('#shared-from-cache-status').textContent.startsWith('Cached'));
    await popup.locator('#refresh-shared-from').click();
    await popup.waitForFunction(() => document.querySelector('#shared-from-status').textContent === 'Shared From data refreshed.');
    assert.equal(await popup.locator('#backup-status').textContent(), importFeedback);
    // Optionally capture synthetic settings previews without putting personal paths in the test.
    if (process.env.INTEGRATION_NAVIGATOR_ARTIFACT_DIR) {
      const previews = path.resolve(process.env.INTEGRATION_NAVIGATOR_ARTIFACT_DIR);
      fs.mkdirSync(previews, {recursive:true});
      await popup.setViewportSize({width:360,height:640});
      await popup.locator('.page-behavior-card summary').click();
      // Collapsed behavior and open backups must fit without horizontal overflow or wrapped action labels.
      assert.equal(await popup.evaluate(() => document.body.scrollWidth <= document.body.clientWidth), true);
      for (const colorScheme of ['light','dark']) {
        await popup.emulateMedia({colorScheme});
        await popup.screenshot({path:path.join(previews,`backup-settings-${colorScheme}.png`)});
      }
    }
    await popup.close();
    // A fresh document and hard reload must restore Designer pins without going through Home.
    const beforeDirect = await read();
    // Consent is enabled only in this disposable profile; the user's settings remain untouched.
    await worker.evaluate(() => chrome.storage.local.set({sharedFromEnabled:true}));
    const direct = await context.newPage();
    direct.on('pageerror', (error) => errors.push(error.message));
    await direct.goto(site + '/fixture/app/all-accounts/Ellucian/data-connect-designer/');
    await direct.locator('.ellucian-favorite-select').filter({ hasText: 'test-a Package' }).waitFor();
    assert.equal(await direct.evaluate(() => typeof window.__PRELOADED_STATE__), 'undefined');
    await direct.reload();
    await direct.locator('.ellucian-favorite-select').filter({ hasText: 'test-a Package' }).waitFor();
    assert.deepEqual(await read(), beforeDirect, 'Direct reload preserves saved tenant lists exactly');
    // Both injected search fields have distinct form identities without changing their labels.
    const fields = await direct.locator('input[type="search"]').evaluateAll((inputs) => inputs.map((input) => input.id));
    assert.equal(fields.length, 2);
    assert.ok(fields.every(Boolean));
    assert.equal(new Set(fields).size, fields.length);
    // The same direct-entry identity also lets existing Shared From collection finish automatically.
    const sourceDeadline=Date.now()+10000;
    let sources;
    do {
      sources=await worker.evaluate(()=>chrome.storage.local.get('designerOwnershipCache'));
      if(sources.designerOwnershipCache?.['test-a']?.packages?.some(pkg=>pkg.name==='test-a Package'&&pkg.pipelines.includes('test-a Pipeline'))) break;
      await direct.waitForTimeout(50);
    } while(Date.now()<sourceDeadline);
    assert.ok(sources.designerOwnershipCache?.['test-a']?.packages?.some(pkg=>pkg.pipelines.includes('test-a Pipeline')), 'Direct Designer load automatically saves its opted-in source observations');
    await direct.close();
    // After startup settles, no timer periodically probes tenant data or issues service requests.
    await page.waitForTimeout(1200);
    const count = await page.evaluate(() => __messages.length);
    await page.waitForTimeout(1200);
    assert.equal(await page.evaluate(() => __messages.length), count, 'No idle polling');
    assert.equal(requests.filter((url) => url.startsWith('https:')).length, 3, 'Only the three explicit fixture navigations make requests');
    assert.deepEqual(errors, []);
    console.log('PASS: last-section backup actions, independent export/refresh feedback and retry, real popup export/import/refresh, direct Designer reload/cache, tenant recovery/isolation, and zero idle polling/service lookups.');

    async function assertPin(tenantId, pageName) {
      const deadline = Date.now() + 10000;
      while (Date.now() < deadline) {
        const records = (await read()).favoritePackagesByTenant;
        if (records?.[JSON.stringify([site, tenantId, pageName])]?.[0]?.packageName === tenantId + ' Package') return;
        await page.waitForTimeout(50);
      }
      assert.fail(`Missing ${tenantId}/${pageName} pin: ${JSON.stringify(await read())}`);
    }
  } finally {
    // Close only this generated profile; never reload or alter the user's installed extension.
    await context.close();
  }
})().catch((error) => { console.error(error); process.exitCode = 1; });
