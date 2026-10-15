"use strict";

// Exercise actual preview/download assets with synthetic extension APIs and no live service traffic.
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
    runtime: { sendMessage: async (request) => {
      if (request.type === 'pipeline-export-claim') return { ok: true, overrideConfirmed: false };
      if (request.type !== 'pipeline-export-relay') throw new Error('Unexpected runtime message');
      // UI fixtures use fixed runtime operations; direct source-tab messaging must never return.
      return window.__relay({ ...request, type: `pipeline-export-${request.operation}` });
    } },
    storage: { local: { get: async () => saved }, onChanged: { addListener: (listener) => { window.__storageChange = listener; } } },
    tabs: { sendMessage: () => { throw new Error('Direct source messaging is forbidden'); } },
  };
  window.__relay = async (message) => {
      window.__requests.push({ type: message.type });
      if (window.__delay && message.type === 'pipeline-export-preview') await new Promise((resolve) => { window.__release = resolve; });
      if (message.type === 'pipeline-export-read') return { ok: true, data: { name: message.entry.name, version: '1.0.0', fittings: [] } };
      if (message.type !== 'pipeline-export-preview') return { ok: true };
      return { ok: true, context: { url: 'https://packages.test/data-connect/home', tenantId: 'synthetic', documentKey: 'document', sessionId: 'session' },
        plan: { entries: pipelines.map((item, index) => ({ ...item, packageName: index >= 110 ? 'Small Package' : 'Demo Package' })), skipped: 1 } };
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
      // Package selection narrows the full plan without changing its source authorization.
      await page.locator('#export-package').selectOption('Small Package');
      assert.equal(await page.locator('#export-rows tr').count(), 10);
      assert.match(await page.locator('#export-counts').textContent(), /1 package.*10 files/);
      await page.locator('#export-package').selectOption('');
      assert.equal(await page.locator('#export-rows tr').count(), 100);
      await page.locator('#show-more').click();
      assert.equal(await page.locator('#download-zip').isDisabled(), false);
      assert.deepEqual(await page.evaluate(() => [...new Set(window.__requests.map((request) => request.type))]), ['pipeline-export-preview']);
      // Optional local screenshots document actual synthetic UI, not a real account or source export.
      if (process.env.INTEGRATION_NAVIGATOR_SCREENSHOTS) await page.screenshot({ fullPage: true, path: path.join(process.env.INTEGRATION_NAVIGATOR_SCREENSHOTS, `v2-export-preview-${colorScheme}.png`) });

      // Source retrieval requires the explicit action, then produces a valid local ZIP download.
      await page.locator('#download-zip').click();
      await page.waitForFunction(() => !document.querySelector('#save-zip').hidden);
      const payload = await page.evaluate(async () => Array.from(new Uint8Array(await (await fetch(document.querySelector('#save-zip').href)).arrayBuffer())));
      assert.equal(Buffer.from(payload).readUInt32LE(0), 0x04034b50);
      assert.match(Buffer.from(payload).toString('utf8'), /Small Package\/Pipeline 119.json/);
      assert.equal(await page.evaluate(() => window.__requests.filter((request) => request.type === 'pipeline-export-read').length), 120);
      // Removing saved ownership revokes the completed link as well as any in-flight default job.
      await page.evaluate(() => window.__storageChange({ designerOwnershipCache: { newValue: {} } }, 'local'));
      assert.equal(await page.locator('#save-zip').isHidden(), true);

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
      assert.deepEqual(await page.evaluate(() => [...new Set(window.__requests.map((request) => request.type))]), ['pipeline-export-preview', 'pipeline-export-verify', 'pipeline-export-read', 'pipeline-export-cancel']);
      assert.deepEqual(errors, []);
      await page.close();
    }
    console.log('PASS dedicated export tab: 120 records, explicit source download/ZIP, pagination, cancel/late replies, opt-out, and both themes');
  } finally {
    await browser.close();
  }
}
run().catch((error) => { console.error(error); process.exitCode = 1; });
