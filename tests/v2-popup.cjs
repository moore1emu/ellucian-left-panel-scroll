'use strict';

// Exercise real popup assets with synthetic preferences/routes, without Ellucian traffic.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const root = path.resolve(__dirname, '..');

function installStub() {
  // Retain unrelated settings across reloads to catch accidental resets.
  const saved = JSON.parse(localStorage.getItem('syntheticPreferences') || 'null') || {
    packageArtifactsEnabled: false, pendingUpdateSummary: { version: '2.1.3' }, favorites: { keep: true }, sharedFromEnabled: true,
  };
  window.__messages = [];
  window.__page = 'packages';
  const runtime = { lastError: undefined, getManifest: () => ({ version: '2.1.3', content_scripts: [{ matches: [] }] }),
    sendMessage: async message => { window.__messages.push(message); return { ok: true }; }, onMessage: { addListener() {} } };
  window.chrome = { runtime, storage: { local: {
    get(defaults, callback) { const result = { ...defaults }; for (const key of Object.keys(result)) if (Object.hasOwn(saved, key)) result[key] = saved[key]; if (callback) setTimeout(() => callback(result), 0); return Promise.resolve(result); },
    set(values, callback) {
      const failed = window.__failWrite === true;
      if (!failed) { Object.assign(saved, values); localStorage.setItem('syntheticPreferences', JSON.stringify(saved)); }
      runtime.lastError = failed ? { message: 'Synthetic failure' } : undefined; callback?.(); runtime.lastError = undefined; return Promise.resolve();
    }, remove() { return Promise.resolve(); },
  } }, permissions: { getAll: async () => ({ origins: [] }), contains: async () => false },
  tabs: { query: async () => [{ id: 7 }], sendMessage: async (_id, message) => {
    window.__messages.push(message);
    if (window.__page === 'missing') throw Error('No receiver');
    if (message.type === 'designer-ownership-context') return { url: 'https://fixture.test/tenant/app/' + (window.__page === 'designer' ? 'data-connect-designer/' : window.__page === 'packages' ? 'data-connect/home' : 'home') };
    if (message.type === 'designer-ownership-status') return { designer: window.__page === 'designer', enabled: saved.sharedFromEnabled, tenantId: 'fixture', checkedAt: 1792100000000 };
    if (message.type === 'designer-ownership-refresh') { await new Promise(resolve => setTimeout(resolve, 80)); return { ok: true }; }
    return {};
  } } };
  window.__saved = saved;
}

(async () => {
  // Closing this non-persistent browser also removes its owned temporary profile.
  const browser = await chromium.launch({ headless: true, ...(process.env.INTEGRATION_NAVIGATOR_BROWSER ? { channel: process.env.INTEGRATION_NAVIGATOR_BROWSER } : {}) });
  try {
    for (const colorScheme of ['light', 'dark']) {
      const page = await browser.newPage({ viewport: { width: 360, height: 580 }, colorScheme });
      page.setDefaultTimeout(7000);
      const errors = [];
      page.on('pageerror', error => errors.push(error.message));
      // Serve current local assets only, using neither signed-in pages nor live services.
      await page.route('https://popup.test/**', route => {
        const file = path.join(root, new URL(route.request().url()).pathname);
        if (!file.startsWith(root + path.sep) || !fs.existsSync(file)) return route.fulfill({ status: 404 });
        return route.fulfill({ contentType: file.endsWith('.js') ? 'text/javascript' : file.endsWith('.css') ? 'text/css' : 'text/html', body: fs.readFileSync(file) });
      });
      await page.addInitScript(installStub);
      await page.goto('https://popup.test/popup.html');
      await page.evaluate(() => PopupTabs.ready());
      await page.waitForFunction(() => !document.querySelector('#shared-from-enabled').disabled);
      const task = name => page.getByRole('tab', { name, exact: true }).click();
      assert.deepEqual(await page.locator('[role="tab"]').allTextContents(), ['Navigation', 'Sharing', 'Appearance', 'Sites', 'Export']);
      assert.deepEqual(await page.locator('.navigation-group h2').allTextContents(), ['General', 'Integration Packages', 'Integration Designer']);
      assert.equal(await page.locator('.sharing-card #shared-from-enabled').count(), 1);
      assert.equal(await page.locator('.sharing-card #shared-version-enabled').count(), 1);
      assert.equal(await page.locator('.designer-card #fitting-details-enabled').count(), 1);

      // Dismissal failures remain retryable without changing preferences.
      await page.evaluate(() => { window.__failWrite = true; });
      await page.locator('#dismiss-update-summary').click();
      assert.equal(await page.locator('#update-summary').isVisible(), true);
      await page.evaluate(() => { window.__failWrite = false; });
      await page.locator('#dismiss-update-summary').click();
      assert.equal(await page.locator('#update-summary').isVisible(), false);

      // Every task preserves a visible tab strip/footer inside the browser popup height.
      for (const name of ['Navigation', 'Sharing', 'Appearance', 'Sites', 'Export']) {
        await task(name);
        const layout = await page.evaluate(() => ({ width: document.documentElement.scrollWidth, bottom: document.querySelector('footer').getBoundingClientRect().bottom, top: document.querySelector('.settings-tabs').getBoundingClientRect().top }));
        assert.ok(layout.width <= 360 && layout.bottom <= 580 && layout.top >= 0, name + ' containment');
        assert.equal(await page.locator('[role="tabpanel"]:visible').count(), 1);
      }
      await page.locator('#tab-export').press('Home');
      assert.equal(await page.locator('#tab-navigation').getAttribute('aria-selected'), 'true');
      await page.locator('#tab-navigation').press('ArrowRight');
      assert.equal(await page.locator('#tab-sharing').getAttribute('aria-selected'), 'true');

      // Wrong/unsupported/unconnected pages fail closed while JSON backups remain available.
      for (const current of ['packages', 'designer', 'other', 'missing']) {
        await page.evaluate(async current => { window.__page = current; await PopupTabs.refreshContext(); }, current);
        await task('Sharing');
        assert.equal(await page.locator('#refresh-shared-from').isDisabled(), current !== 'designer');
        if (current === 'designer') {
          await page.locator('#refresh-shared-from').click();
          assert.equal(await page.locator('#refresh-shared-from').getAttribute('aria-busy'), 'true');
          await page.waitForFunction(() => document.querySelector('#shared-from-status').textContent === 'Shared From data refreshed.');
        }
        await task('Export');
        assert.equal(await page.locator('#export-pipelines').isDisabled(), current !== 'packages');
        assert.equal(await page.locator('#export-shared-from').isEnabled(), true);
        assert.equal(await page.locator('#import-favorites').isEnabled(), true);
      }

      // Source opt-in still requires confirmation and can be cancelled without a write.
      await page.evaluate(async () => { window.__page = 'packages'; await PopupTabs.refreshContext(); });
      await task('Sharing');
      await page.locator('label[for="shared-from-enabled"]').click();
      await task('Export');
      assert.equal(await page.locator('#export-pipelines').isDisabled(), true);
      await task('Sharing');
      await page.locator('label[for="shared-from-enabled"]').click();
      assert.equal(await page.locator('#shared-from-confirmation').isVisible(), true);
      assert.equal(await page.evaluate(() => __saved.sharedFromEnabled), false);
      await page.locator('#cancel-shared-from').click();

      // The hidden shortcut selects Export, but typing and revelation never grant override consent.
      await page.locator('#icon-letters').evaluate(node => node.dispatchEvent(new KeyboardEvent('keydown', { key: 'D', shiftKey: true, bubbles: true })));
      assert.equal(await page.locator('#export-advanced').isVisible(), false);
      await page.locator('#tab-sharing').press('Shift+D');
      assert.equal(await page.locator('#export-advanced').isVisible(), true, JSON.stringify({ errors, state: await page.evaluate(() => ({ hidden: document.querySelector('#export-advanced').hidden, panel: document.querySelector('#panel-export').hidden, selected: document.querySelector('[role="tab"][aria-selected="true"]').id })) }));
      page.once('dialog', dialog => dialog.dismiss());
      await page.locator('#export-all-accessible').click();
      assert.equal(await page.locator('#export-pipelines').isDisabled(), true);
      page.once('dialog', dialog => dialog.accept());
      await page.locator('#export-all-accessible').click();
      await page.locator('#export-pipelines').click();
      assert.equal(await page.locator('#export-all-accessible').isChecked(), false);
      assert.equal(await page.evaluate(() => __messages.find(message => message.type === 'pipeline-export-open').overrideConfirmed), true);
      assert.equal(await page.evaluate(() => Object.hasOwn(__saved, 'overrideConfirmed')), false);

      // Long feedback scrolls inside its task without pushing navigation/footer out of reach.
      await task('Sharing');
      await page.locator('label[for="shared-from-enabled"]').click();
      await page.locator('#confirm-shared-from').click();
      assert.equal(await page.evaluate(() => __saved.sharedFromEnabled), true);
      await page.evaluate(() => { document.querySelector('#shared-from-status').textContent = 'Example failure guidance. '.repeat(80); });
      await page.locator('#shared-from-status').scrollIntoViewIfNeeded();
      assert.ok(await page.locator('.settings-tabs').evaluate(node => node.getBoundingClientRect().top >= 0));
      assert.deepEqual(await page.evaluate(() => __saved.favorites), { keep: true });
      assert.deepEqual(errors, []);
      if (process.env.INTEGRATION_NAVIGATOR_SCREENSHOTS) {
        await page.evaluate(() => { document.querySelector('#shared-from-status').textContent = ''; });
        for (const name of ['navigation', 'sharing', 'export']) {
          await page.evaluate(name => PopupTabs.select(name), name);
          await page.locator('.popup-shell').screenshot({ path: path.join(process.env.INTEGRATION_NAVIGATOR_SCREENSHOTS, 'v2-' + name + '-' + colorScheme + '.png') });
        }
      }
      await page.reload();
      assert.equal(await page.locator('#update-summary').isVisible(), false);
      await page.close();
    }
    console.log('PASS task tabs: groups, keyboard, themes, contained scrolling, page gates, consent, refresh busy, backups, hidden override, and preferences');
  } finally {
    // Close only this generated fixture browser after success or failure.
    await browser.close();
  }
})().catch(error => { console.error(error); process.exitCode = 1; });
