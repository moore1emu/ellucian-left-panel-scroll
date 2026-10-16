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
    packageArtifactsEnabled: false, pendingUpdateSummary: { version: '2.1.8' }, favorites: { keep: true }, sharedFromEnabled: true,
  };
  window.__messages = [];
  window.__page = 'packages';
  const runtime = { lastError: undefined, getManifest: () => ({ version: '2.1.8', content_scripts: [{ matches: [] }] }),
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
      assert.equal(await page.locator('#panel-appearance > h2').textContent(), 'Icon');
      assert.equal(await page.locator('.favorite-appearance-controls > .setting-title').textContent(), 'Favorites');
      // Task names do not repeat as headings; retain only distinct subgroup titles.
      assert.equal(await page.locator('#panel-sharing > h2, #panel-sites > h2').count(), 0);
      assert.deepEqual(await page.locator('#panel-export h2').allTextContents(), ['Pipeline Export', 'Backup & Restore']);

      // Dismissal failures remain retryable without changing preferences.
      assert.deepEqual(await page.locator('#update-summary li').allTextContents(), [
        'Redesigned settings with task-based tabs for easier navigation.',
        'Export published Pipelines, Sub-Pipelines, APIs, and Transformers from Integration Packages to a ZIP, with optional readable formatting.',
      ]);
      await page.evaluate(() => { window.__failWrite = true; });
      await page.locator('#dismiss-update-summary').click();
      assert.equal(await page.locator('#update-summary').isVisible(), true);
      await page.evaluate(() => { window.__failWrite = false; });
      await page.locator('#dismiss-update-summary').click();
      assert.equal(await page.locator('#update-summary').isVisible(), false);

      // Hover backgrounds must not cover neighboring labels, including the wider bold selected tab.
      for (const active of ['Navigation', 'Appearance', 'Sites']) {
        await task(active);
        for (const hovered of ['Navigation', 'Sharing', 'Appearance', 'Sites', 'Export']) {
          await page.getByRole('tab', { name: hovered, exact: true }).hover();
          const bounds = await page.locator('[role="tab"]').evaluateAll(nodes => nodes.map(node => {
            const range = document.createRange();
            range.selectNodeContents(node);
            const text = range.getBoundingClientRect();
            const box = node.getBoundingClientRect();
            return { name: node.textContent, left: box.left, right: box.right, textLeft: text.left, textRight: text.right, height: text.height };
          }));
          for (const tab of bounds) {
            assert.ok(tab.textLeft >= tab.left + 3 && tab.textRight <= tab.right - 3, `${active}/${hovered}: ${tab.name} needs its own label space`);
            assert.ok(tab.height < 20, 'Tab labels stay on one line');
          }
          assert.ok(bounds[0].left >= 0 && bounds.at(-1).right <= 360, 'All tabs stay inside the popup');
        }
      }
      await task('Navigation');

      // The ordinary Navigation panel must fit without hiding the final search control or shrinking text.
      const navigation = await page.evaluate(() => {
        const scroller = document.querySelector('.settings-panels');
        const search = document.querySelector('#designer-search-display-mode').getBoundingClientRect();
        const viewport = scroller.getBoundingClientRect();
        return { overflow: scroller.scrollHeight > scroller.clientHeight + 1, bottom: search.bottom, limit: viewport.bottom,
          titleSize: getComputedStyle(document.querySelector('.navigation-group .setting-title')).fontSize };
      });
      assert.equal(navigation.overflow, false, 'Normal Navigation needs no scrollbar');
      assert.ok(navigation.bottom <= navigation.limit, 'Pipeline Search is visible without scrolling');
      assert.equal(navigation.titleSize, '13px');
      assert.equal(await page.locator('.footer-scope').count(), 0);

      // Named subgroup controls sit eight pixels inside their heading, without moving ungrouped tasks.
      const pairs = [
        ['Navigation', '#general-title', 'label[for="remember-width"]'],
        ['Navigation', '#packages-title', 'label[for="package-artifacts-enabled"]'],
        ['Navigation', '#designer-title', 'label[for="fitting-details-enabled"]'],
        ['Appearance', '#panel-appearance > h2', '.icon-appearance-controls'],
        ['Appearance', '.favorite-appearance-controls > .setting-title', '.favorite-match-control'],
        ['Export', '.pipeline-export-section h2', '.pipeline-export-section > .card-description'],
        ['Export', '.backup-card > h2', '#export-shared-from'],
      ];
      for (const [name, heading, control] of pairs) {
        await task(name);
        const offset = await page.evaluate(([head, child]) => document.querySelector(child).getBoundingClientRect().left - document.querySelector(head).getBoundingClientRect().left, [heading, control]);
        assert.equal(offset, 8, name + ' subgroup indentation');
      }
      for (const [name, selector] of [['Sharing', 'label[for="shared-version-enabled"]'], ['Sites', '#custom-site-form']]) {
        await task(name);
        const offset = await page.locator(selector).evaluate(node => node.getBoundingClientRect().left - node.closest('.settings-panel').getBoundingClientRect().left);
        assert.equal(offset, 2, name + ' stays unindented');
      }

      // Every task preserves a visible tab strip/footer inside the browser popup height.
      for (const name of ['Navigation', 'Sharing', 'Appearance', 'Sites', 'Export']) {
        await task(name);
        const layout = await page.evaluate(() => ({ width: document.documentElement.scrollWidth, bottom: document.querySelector('footer').getBoundingClientRect().bottom, top: document.querySelector('.settings-tabs').getBoundingClientRect().top,
          clipped: document.querySelector('.settings-panels').scrollWidth > document.querySelector('.settings-panels').clientWidth }));
        assert.ok(layout.width <= 360 && layout.bottom <= 580 && layout.top >= 0, name + ' containment');
        assert.equal(layout.clipped, false, name + ' controls are not horizontally clipped');
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
        for (const name of ['navigation', 'sharing', 'appearance', 'export']) {
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
