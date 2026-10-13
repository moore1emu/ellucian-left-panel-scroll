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
  <div data-testid="master"><div id="home_title-packages">PACKAGES</div><div><ul role="tree"></ul></div></div><main></main>
  <script>
  window.__PRELOADED_STATE__={tenant:'stale-bootstrap'};
  window.switchTenant=(tenant,page='packages')=>{
    if(page==='designer') history.pushState({},'', '/fixture/app/all-accounts/Ellucian/data-connect-designer/');
    else history.pushState({},'', '${route}');
    const list=document.querySelector('ul');list.innerHTML='';
    const row=document.createElement('li');row.dataset.level='1';row.dataset.nodeid=tenant;
    row.setAttribute('package-element','');row.innerHTML='<div class="MuiTreeItem-content"><span class="MuiTreeItem-label">'+tenant+' Package</span></div>';
    row.__reactProps$fixture={'package-element':{name:tenant+' Package',pipelines:[]}};
    row.__reactFiber$fixture={stateNode:{state:{currentTenant:tenant}}};list.appendChild(row);
    dispatchEvent(new Event('ellucian-left-panel-dom-changed'));
  };
  window.__messages=[];addEventListener('message',e=>{if(e.data?.source==='ellucian-left-panel-scroll') __messages.push(e.data.type)});
  switchTenant('test-a');
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
    await page.evaluate(() => { document.querySelector('li').__reactFiber$fixture.stateNode.state.currentTenant=''; dispatchEvent(new Event('ellucian-left-panel-dom-changed')); });
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
    const downloadEvent = popup.waitForEvent('download');
    await popup.locator('#export-shared-from').click();
    const download = await downloadEvent;
    const backup = JSON.parse(fs.readFileSync(await download.path(), 'utf8'));
    assert.equal(backup.schemaVersion, 1);
    assert.equal(backup.favorites.length, 3);
    assert.ok(backup.favorites.some((group) => group.tenantId === 'test-a' && group.page === 'designer'));
    assert.equal(backup.unassignedFavorites.length, 2);
    backup.favorites[0].packages.push({ packageName: 'Imported Pin', packagePinned: true, pipelines: [], pipelinesExpanded: true });
    await popup.locator('#backup-file').setInputFiles({ name: 'fixture-backup.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(backup)) });
    await popup.locator('#backup-preview').waitFor();
    assert.equal(await popup.locator('#backup-mode').inputValue(), 'merge');
    assert.equal(await popup.locator('#backup-sources').isChecked(), false);
    await popup.locator('#confirm-backup').click();
    await popup.waitForFunction(() => document.querySelector('#backup-status').textContent.includes('imported'));
    const restored = (await read()).favoritePackagesByTenant;
    assert.ok(Object.values(restored).some((groups) => groups.some((group) => group.packageName === 'Imported Pin')));
    await popup.close();
    // After startup settles, no timer periodically probes tenant data or issues service requests.
    await page.waitForTimeout(1200);
    const count = await page.evaluate(() => __messages.length);
    await page.waitForTimeout(1200);
    assert.equal(await page.evaluate(() => __messages.length), count, 'No idle polling');
    assert.equal(requests.filter((url) => url.startsWith('https:')).length, 1, 'Tenant scoping requires no additional service requests');
    assert.deepEqual(errors, []);
    console.log('PASS: real-manifest automatic recovery, second-tenant isolation, ambiguous Designer assignment, actual popup backup/restore, and zero idle polling/service lookups.');

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
