"use strict";

// Exercise the actual dedicated-tab assets against metadata-only synthetic extension APIs.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const root = path.resolve(__dirname, '..');

function stub() {
  const pipelines = Array.from({ length: 120 }, (_, index) => ({ name: `Pipeline ${index}`, version: '1.0.0', type: index % 2 ? 'api' : 'pipeline' }));
  const saved = { sharedFromEnabled: true, designerOwnershipCache: { synthetic: { packages: [{ name: 'Demo Package', pipelines: pipelines.map((item) => item.name) }] } } };
  window.__requests = [];
  window.__saved = saved;
  window.__storageChange = null;
  window.__delay = false;
  window.__release = null;
  window.chrome = {
    runtime: { sendMessage: async () => ({ ok: true, sourceTabId: 7, overrideConfirmed: false }) },
    storage: { local: { get: async () => saved }, onChanged: { addListener: (listener) => { window.__storageChange = listener; } } },
    tabs: { sendMessage: async (id, message) => {
      window.__requests.push({ id, type: message.type });
      if (window.__delay) await new Promise((resolve) => { window.__release = resolve; });
      return { ok: true, context: { url: 'https://designer.test/data-connect-designer/', tenantId: 'synthetic', documentKey: 'document' }, packages: [{ name: 'Demo Package', pipelines: [...pipelines, { name: 'Unrecorded Supplier', version: '1.0.0', type: 'pipeline' }] }] };
    } },
  };
}

async function run() {
  const browser = await chromium.launch({ headless: true, ...(process.env.INTEGRATION_NAVIGATOR_BROWSER ? { channel: process.env.INTEGRATION_NAVIGATOR_BROWSER } : {}) });
  try {
    for (const colorScheme of ['light', 'dark']) {
      const page = await browser.newPage({ colorScheme, viewport: { width: 1100, height: 800 } });
      const errors = [];
      page.on('pageerror', (error) => errors.push(error.message));
      await page.route('https://export.test/**', (route) => {
        const file = path.join(root, new URL(route.request().url()).pathname);
        if (!file.startsWith(root + path.sep) || !fs.existsSync(file)) return route.fulfill({ status: 404 });
        return route.fulfill({ contentType: file.endsWith('.js') ? 'text/javascript' : file.endsWith('.css') ? 'text/css' : file.endsWith('.png') ? 'image/png' : 'text/html', body: fs.readFileSync(file) });
      });
      await page.addInitScript(stub);
      await page.goto('https://export.test/pipeline-export.html#synthetic-ticket');
      await page.waitForFunction(() => document.querySelector('#export-status').textContent.startsWith('Preview ready'));
      assert.match(await page.locator('#export-counts').textContent(), /120 files.*1 unrecorded/);
      assert.equal(await page.locator('#export-rows tr').count(), 100);
      await page.locator('#show-more').click();
      assert.equal(await page.locator('#export-rows tr').count(), 120);
      assert.equal(await page.locator('#download-zip').isDisabled(), true);
      // Optional local screenshots document actual synthetic UI, not a real account or source export.
      if (process.env.INTEGRATION_NAVIGATOR_SCREENSHOTS) await page.screenshot({ fullPage: true, path: path.join(process.env.INTEGRATION_NAVIGATOR_SCREENSHOTS, `v2-export-preview-${colorScheme}.png`) });

      // Cancel a delayed preview and prove its late result cannot restore records or a download.
      await page.evaluate(() => { window.__delay = true; });
      await page.locator('#refresh-preview').click();
      await page.waitForFunction(() => typeof window.__release === 'function');
      await page.locator('#cancel-export').click();
      await page.evaluate(() => { window.__delay = false; window.__release(); });
      assert.equal(await page.locator('#export-rows tr').count(), 0);
      assert.match(await page.locator('#export-status').textContent(), /Cancelled/);
      await page.locator('#refresh-preview').click();
      await page.waitForFunction(() => document.querySelector('#export-status').textContent.startsWith('Preview ready'));
      await page.evaluate(() => { window.__saved.sharedFromEnabled = false; window.__storageChange({ sharedFromEnabled: { newValue: false } }, 'local'); });
      assert.equal(await page.locator('#export-rows tr').count(), 0);
      await page.locator('#refresh-preview').click();
      await page.waitForFunction(() => document.querySelector('#export-status').textContent === 'Enable Shared From first.');
      assert.deepEqual(await page.evaluate(() => [...new Set(window.__requests.map((request) => request.type))]), ['pipeline-export-preview']);
      assert.deepEqual(errors, []);
      await page.close();
    }
    console.log('PASS dedicated export preview: 120 records, filtering, pagination, cancel/late replies, opt-out, both themes, and no source requests');
  } finally {
    await browser.close();
  }
}
run().catch((error) => { console.error(error); process.exitCode = 1; });
