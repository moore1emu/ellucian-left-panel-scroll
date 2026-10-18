'use strict';

// Verify the isolated v3 foundation and offline design without repository or credential access.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { chromium } = require('playwright');
const root = path.resolve(__dirname, '..');
const mock = path.join(root, 'docs/mockups/git-export-settings.html');
const manifest = JSON.parse(fs.readFileSync(path.join(root, 'manifest.json'), 'utf8'));
assert.equal(manifest.version, '3.1.0');
assert.deepEqual(manifest.permissions, ['storage']);
assert.deepEqual(manifest.optional_permissions, ['scripting']);

(async () => {
  // A non-persistent fixture owns no signed-in profile and cleans up when the browser closes.
  const browser = await chromium.launch({ headless: true, ...(process.env.INTEGRATION_NAVIGATOR_BROWSER ? { channel: process.env.INTEGRATION_NAVIGATOR_BROWSER } : {}) });
  try {
    for (const colorScheme of ['light', 'dark']) {
      const page = await browser.newPage({ viewport: { width: 1000, height: 1000 }, colorScheme });
      const errors = [];
      const external = [];
      page.on('pageerror', error => errors.push(error.message));
      // Serve one self-contained local mock and block anything resembling a live request.
      await page.route('**/*', route => {
        if (route.request().url() === 'https://mock.test/settings') return route.fulfill({ contentType: 'text/html', body: fs.readFileSync(mock) });
        external.push(route.request().url());
        return route.abort();
      });
      await page.goto('https://mock.test/settings');
      assert.equal(await page.locator('#token').getAttribute('readonly'), '');
      assert.match(await page.locator('.toolbar').textContent(), /No real tokens/);
      assert.equal(await page.locator('#badge').textContent(), 'Demo Ready');

      // Device-key storage is only a visual automatic-reuse proposal, not implemented encryption.
      await page.locator('#restart').click();
      assert.equal(await page.locator('#badge').textContent(), 'Demo Ready');
      await page.locator('#provider').selectOption('gitlab');
      assert.equal(await page.locator('#server-field').isVisible(), true);
      await page.locator('#token-help').click();
      assert.match(await page.locator('#help-copy').textContent(), /legacy write_repository alone/);
      await page.locator('#close-help').click();

      // Password-unlock and session-only proposals clearly differ after a simulated restart.
      await page.locator('#storage').selectOption('password');
      await page.locator('#preview').click();
      assert.equal(await page.locator('#changes').isVisible(), false);
      assert.match(await page.locator('#export-status').textContent(), /Unlock/);
      await page.locator('#unlock').click();
      await page.locator('#preview').click();
      assert.equal(await page.locator('#push').isDisabled(), true);
      await page.locator('#confirm').check();
      await page.locator('#push').click();
      assert.match(await page.locator('#history').textContent(), /3 files.*no real commit/);
      assert.match(await page.locator('#export-status').textContent(), /No files were uploaded/);
      await page.locator('#restart').click();
      assert.equal(await page.locator('#badge').textContent(), 'Demo Locked');
      await page.locator('#storage').selectOption('session');
      await page.locator('#restart').click();
      assert.equal(await page.locator('#badge').textContent(), 'Not Connected');
      await page.locator('#save').click();
      await page.locator('#forget').click();
      assert.equal(await page.locator('#token').inputValue(), '');
      await page.locator('#remember-history').uncheck();
      assert.match(await page.locator('#history').textContent(), /history is off/);
      await page.locator('#close-setup').click();
      await page.locator('#manage').click();
      assert.equal(await page.locator('#setup').isVisible(), true);

      // The compact popup remains contained at narrow widths; setup stacks instead of clipping.
      for (const width of [360, 440, 1000]) {
        await page.setViewportSize({ width, height: 1000 });
        assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
      }
      assert.deepEqual(await page.evaluate(() => [localStorage.length, sessionStorage.length]), [0, 0]);
      assert.deepEqual(external, []);
      assert.deepEqual(errors, []);
      // Screenshots are opt-in and stay outside source unless a caller explicitly supplies a path.
      if (process.env.INTEGRATION_NAVIGATOR_SCREENSHOTS) {
        await page.locator('#storage').selectOption('device');
        await page.locator('#provider').selectOption('github');
        await page.locator('#save').click();
        await page.screenshot({ path: path.join(process.env.INTEGRATION_NAVIGATOR_SCREENSHOTS, `v3-git-settings-${colorScheme}.png`), fullPage: true });
      }
      await page.reload();
      assert.match(await page.locator('#history').textContent(), /No simulated pushes/);
      await page.close();
    }
    console.log('PASS v3 foundation: isolated version/permissions, offline mock, providers, token-storage proposals, restart/forget, explicit demo confirmation, themes, responsive layout, and zero storage/network');
  } finally {
    // Close only the browser owned by this synthetic fixture, including assertion failures.
    await browser.close();
  }
})().catch(error => { console.error(error); process.exitCode = 1; });
