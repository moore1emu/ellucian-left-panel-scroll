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
    exportToolsEnabled:true, packageArtifactsEnabled: false, pendingUpdateSummary: { version: '3.1.1' }, favorites: { keep: true }, sharedFromEnabled: true,
  };
  window.__messages = [];
  window.__page = 'packages';
  const runtime = { lastError: undefined, getManifest: () => ({ version: '3.1.1', content_scripts: [{ matches: [] }] }),
    sendMessage: async message => { window.__messages.push(message); return { ok: true }; }, onMessage: { addListener() {} } };
  window.chrome = { runtime, storage: { onChanged:{addListener(){}}, local: {
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
      assert.deepEqual(await page.locator('[role="tab"]').allTextContents(), ['General', 'Navigation', 'Sharing', 'Appearance', 'Sites', 'Export']);
      assert.deepEqual(await page.locator('.navigation-group h2').allTextContents(), ['General', 'Integration Packages', 'Integration Designer']);
      assert.equal(await page.locator('.sharing-card #shared-from-enabled').count(), 1);
      assert.equal(await page.locator('.sharing-card #shared-version-enabled').count(), 1);
      assert.equal(await page.locator('.designer-card #fitting-details-enabled').count(), 1);
      assert.equal(await page.locator('#panel-appearance > h2').textContent(), 'Icon');
      assert.equal(await page.locator('.favorite-appearance-controls > .setting-title').textContent(), 'Favorites');
      // Task names do not repeat as headings; retain only distinct subgroup titles.
      assert.equal(await page.locator('#panel-sharing > h2, #panel-sites > h2').count(), 0);
      assert.deepEqual(await page.locator('#panel-export h2').allTextContents(), ['Git Connections', 'Export Configuration', 'Preview & Export', 'Backup & Restore']);
      assert.deepEqual(await page.locator('.export-launcher-card > .card-description').allTextContents(),['Configure your GitHub or GitLab repository and access token.','Choose folders, file types, and versions.','Select records, review files, then download a ZIP or push to Git.']);
      // Compare shared geometry and button treatment, allowing descriptions to wrap naturally.
      await task('Export');
      const cards=await page.locator('.export-launcher-card').evaluateAll(nodes=>nodes.map(node=>{const style=getComputedStyle(node),button=node.querySelector('button'),box=node.getBoundingClientRect();return {left:box.left,width:box.width,padding:style.padding,border:style.borderRadius,buttonWidth:button.getBoundingClientRect().width};}));
      assert.equal(cards.length,3); assert.deepEqual(cards[0],cards[1]); assert.deepEqual(cards[1],cards[2]);
      // Setup actions precede the source-bound launcher in reading order, not only through CSS.
      assert.deepEqual(await page.locator('#panel-export button').evaluateAll(nodes=>nodes.slice(0,3).map(node=>node.id)),['manage-git','configure-export','export-pipelines']);

      // Dismissal failures remain retryable without changing preferences.
      assert.deepEqual(await page.locator('#update-summary li').allTextContents(), [
        'Use Navigation Tools, Export Tools, or both; saved data stays intact when tools are off.',
        'Packages export now uses one confirmed Shift+D shortcut, without Shared From setup.',
      ]);
      await page.evaluate(() => { window.__failWrite = true; });
      await page.locator('#dismiss-update-summary').click();
      assert.equal(await page.locator('#update-summary').isVisible(), true);
      await page.evaluate(() => { window.__failWrite = false; });
      await page.locator('#dismiss-update-summary').click();
      assert.equal(await page.locator('#update-summary').isVisible(), false);

      // Hover backgrounds must not cover neighboring labels, including the wider bold selected tab.
      for (const active of ['General', 'Navigation', 'Appearance', 'Sites']) {
        await task(active);
        for (const hovered of ['General', 'Navigation', 'Sharing', 'Appearance', 'Sites', 'Export']) {
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
        ['Export', '#backup-title', '#export-shared-from'],
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
      for (const name of ['General', 'Navigation', 'Sharing', 'Appearance', 'Sites', 'Export']) {
        await task(name);
        const layout = await page.evaluate(() => ({ width: document.documentElement.scrollWidth, bottom: document.querySelector('footer').getBoundingClientRect().bottom, top: document.querySelector('.settings-tabs').getBoundingClientRect().top,
          clipped: document.querySelector('.settings-panels').scrollWidth > document.querySelector('.settings-panels').clientWidth }));
        assert.ok(layout.width <= 360 && layout.bottom <= 580 && layout.top >= 0, name + ' containment');
        assert.equal(layout.clipped, false, name + ' controls are not horizontally clipped');
        assert.equal(await page.locator('[role="tabpanel"]:visible').count(), 1);
      }
      await page.locator('#tab-export').press('Home');
      assert.equal(await page.locator('#tab-general').getAttribute('aria-selected'), 'true');
      await page.locator('#tab-general').press('ArrowRight');
      assert.equal(await page.locator('#tab-navigation').getAttribute('aria-selected'), 'true');

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
        assert.equal(await page.locator('#export-pipelines').isDisabled(), current !== 'designer');
        // Keep the explanatory hint readable before the unavailable card, not below its action.
        if (current !== 'designer') {
          assert.equal(await page.locator('#pipeline-export-availability').innerText(),'Open Integration Designer or API Designer to enable Preview & Export.');
          assert.equal(await page.evaluate(()=>document.querySelector('#pipeline-export-availability').getBoundingClientRect().bottom <= document.querySelector('#pipeline-export-section').getBoundingClientRect().top),true);
          const noticeStyle=await page.locator('#pipeline-export-availability').evaluate(node=>{const style=getComputedStyle(node);return {weight:style.fontWeight,color:style.color};});
          assert.deepEqual(noticeStyle,{weight:'700',color:colorScheme==='dark'?'rgb(255, 180, 171)':'rgb(155, 28, 28)'});
        }
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

      // One shortcut confirms all accessible Packages, independent of the Shared From switch.
      await page.locator('#icon-letters').evaluate(node => node.dispatchEvent(new KeyboardEvent('keydown', { key: 'D', shiftKey: true, bubbles: true })));
      assert.equal(await page.locator('#export-source, #export-version-mode, #export-advanced').count(), 0);
      page.once('dialog', dialog => dialog.dismiss());
      await page.locator('#tab-sharing').press('Shift+D');
      assert.equal(await page.locator('#export-pipelines').isDisabled(), true);
      page.once('dialog', dialog => dialog.accept());
      await page.locator('#tab-sharing').press('Shift+D');
      assert.equal(await page.locator('#export-pipelines').isDisabled(),false);
      await page.locator('#export-pipelines').click();
      assert.equal(await page.locator('#export-pipelines').isDisabled(), true, 'Hidden consent is consumed after launch');
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
