"use strict";

// Exercise actual preview/download assets with synthetic extension APIs and no live service traffic.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const root = path.resolve(__dirname, '..');

function stub() {
  const pipelines = Array.from({ length: 120 }, (_, index) => ({ name: `Pipeline ${index}`, version: '1.0.0', type: index % 2 ? 'api' : 'pipeline' }));
  const saved = { exportToolsEnabled:true, sharedFromEnabled: true, designerOwnershipCache: { synthetic: { packages: [{ name: 'Demo Package', pipelines: pipelines.map((item) => item.name) }] } } };
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
      // Hold only an explicitly requested retry verification; normal source collection remains deterministic.
      if (message.type === 'pipeline-export-verify') {
        if (window.__delayVerify) await new Promise((resolve) => { window.__releaseVerify = resolve; });
        return window.__verifyResult || { ok: true };
      }
      if (message.type === 'pipeline-export-read') return window.__failSource ? { ok: false, reason: 'source-unavailable' }
        : { ok: true, data: { name: message.entry.name, version: '1.0.0', fittings: [] } };
      if (message.type !== 'pipeline-export-preview') return { ok: true };
      return { ok: true, environment: 'synthetic-test', context: { url: 'https://packages.test/data-connect/home', tenantId: 'synthetic', documentKey: 'document', sessionId: 'session' },
        plan: { entries: pipelines.map((item, index) => ({ ...item, packageName: window.__manyPackages ? `Package ${index}` : index >= 110 ? 'Small Package' : 'Demo Package' })), skipped: 1 } };
  };
}

async function run() {
  const browser = await chromium.launch({ headless: true, ...(process.env.INTEGRATION_NAVIGATOR_BROWSER ? { channel: process.env.INTEGRATION_NAVIGATOR_BROWSER } : {}) });
  try {
    for (const colorScheme of ['light', 'dark']) {
      const page = await browser.newPage({ colorScheme, viewport: { width: 1100, height: 800 } });
      const errors = [];
      const downloads = [];
      page.on('pageerror', (error) => errors.push(error.message));
      page.on('download', (file) => downloads.push(file));
      await page.route('https://export.test/**', (route) => {
        const file = path.join(root, new URL(route.request().url()).pathname);
        if (!file.startsWith(root + path.sep) || !fs.existsSync(file)) return route.fulfill({ status: 404 });
        return route.fulfill({ contentType: file.endsWith('.js') ? 'text/javascript' : file.endsWith('.css') ? 'text/css' : file.endsWith('.png') ? 'image/png' : 'text/html', body: fs.readFileSync(file) });
      });
      await page.addInitScript(stub);
      await page.goto('https://export.test/pipeline-export.html#synthetic-ticket');
      await page.waitForFunction(() => document.querySelector('#export-status').textContent.startsWith('Preview ready'));
      assert.match(await page.locator('#export-counts').textContent(), /120 of 120 files.*1 unrecorded/);
      assert.equal(await page.locator('.export-package').count(), 2);
      assert.equal(await page.locator('.pipeline-checkbox').count(), 0, 'Collapsed packages avoid eager row creation');
      assert.equal(await page.locator('#show-more').count(), 0);
      assert.equal(await page.locator('#include-formatted').isChecked(), false);
      const demo = page.locator('.export-package').filter({ hasText: 'Demo Package' });
      assert.equal(await demo.locator('.package-count').innerText(), '110 of 110 selected (Pipelines: 55, APIs: 55)');
      // Package checkboxes select without expanding; individual exclusions set the mixed state.
      await page.getByRole('checkbox', { name: 'Select Package: Demo Package', exact: true }).uncheck();
      assert.equal(await demo.locator('.package-count').innerText(), '0 of 110 selected');
      assert.equal(await demo.evaluate((node) => node.open), false);
      await demo.locator('.package-name').click();
      await demo.locator('.pipeline-checkbox').first().waitFor();
      assert.equal(await demo.locator('.pipeline-checkbox').count(), 110, 'Expanded groups have no hidden result cap');
      await demo.locator('.pipeline-checkbox').first().check();
      assert.equal(await demo.locator('.package-count').innerText(), '1 of 110 selected (Pipelines: 1)');
      assert.equal(await demo.locator('.package-checkbox').evaluate((node) => node.indeterminate), true);
      assert.match(await page.locator('#export-counts').textContent(), /11 of 120 files/);
      await page.locator('#select-all').check();
      await page.locator('#select-all').uncheck();
      assert.equal(await page.locator('#download-zip').isDisabled(), true);
      await page.getByRole('checkbox', { name: 'Select Package: Small Package', exact: true }).check();
      assert.match(await page.locator('#export-counts').textContent(), /1 of 2 packages.*10 of 120 files/);
      assert.equal(await page.locator('#download-zip').isDisabled(), false);
      assert.deepEqual(await page.evaluate(() => [...new Set(window.__requests.map((request) => request.type))]), ['pipeline-export-preview']);
      // Optional local screenshots document actual synthetic UI, not a real account or source export.
      if (process.env.INTEGRATION_NAVIGATOR_SCREENSHOTS) {
        // Show a compact collapsed/expanded example without changing the tested checkbox selection.
        await demo.locator('.package-name').click();
        await page.locator('.export-package').filter({ hasText: 'Small Package' }).locator('.package-name').click();
        await page.locator('.export-package').filter({ hasText: 'Small Package' }).locator('.pipeline-checkbox').first().waitFor();
        await page.screenshot({ fullPage: true, path: path.join(process.env.INTEGRATION_NAVIGATOR_SCREENSHOTS, `v2-export-preview-${colorScheme}.png`) });
      }

      // Source retrieval requires the explicit action, then produces a valid local ZIP download.
      const firstDownload = page.waitForEvent('download');
      await page.locator('#download-zip').click();
      const firstFile = await firstDownload;
      assert.equal(firstFile.suggestedFilename(), 'integration-navigator-synthetic-test.zip');
      await page.waitForFunction(() => !document.querySelector('#save-zip').hidden);
      // Verify the browser really received this complete ZIP, not only that a local link appeared.
      const chunks = [];
      for await (const chunk of await firstFile.createReadStream()) chunks.push(chunk);
      const payload = Buffer.concat(chunks);
      assert.equal(await page.locator('#save-zip').getAttribute('href'), null, 'Retry must not expose a blob URL for unverified navigation');
      assert.equal(await page.locator('#save-zip').innerText(), 'Download Again');
      assert.equal(Buffer.from(payload).readUInt32LE(0), 0x04034b50);
      // Even-numbered fixture rows are Pipelines; odd-numbered APIs keep their original filenames.
      assert.match(Buffer.from(payload).toString('utf8'), /Small Package\/Pipeline 118_v1.json/);
      assert.match(Buffer.from(payload).toString('utf8'), /Small Package\/Pipeline 119.json/);
      assert.equal(await page.evaluate(() => window.__requests.filter((request) => request.type === 'pipeline-export-read').length), 10);
      // Retrying the already prepared archive requires no additional source lookups.
      const repeatedDownload = page.waitForEvent('download');
      const verificationCount = await page.evaluate(() => window.__requests.filter((request) => request.type === 'pipeline-export-verify').length);
      await page.locator('#save-zip').click();
      const repeatedChunks = [];
      for await (const chunk of await (await repeatedDownload).createReadStream()) repeatedChunks.push(chunk);
      assert.deepEqual(Buffer.concat(repeatedChunks), payload);
      assert.equal(await page.evaluate(() => window.__requests.filter((request) => request.type === 'pipeline-export-verify').length), verificationCount + 1);
      assert.equal(await page.evaluate(() => window.__requests.filter((request) => request.type === 'pipeline-export-read').length), 10);
      // Modified and auxiliary clicks cannot navigate directly to an unchecked local archive.
      const beforeModified = downloads.length;
      await page.locator('#save-zip').dispatchEvent('click', { button: 0, ctrlKey: true });
      await page.locator('#save-zip').dispatchEvent('click', { button: 0, metaKey: true });
      await page.locator('#save-zip').dispatchEvent('click', { button: 0, shiftKey: true });
      await page.locator('#save-zip').dispatchEvent('auxclick', { button: 1 });
      assert.equal(downloads.length, beforeModified);
      assert.equal(await page.evaluate(() => window.__requests.filter((request) => request.type === 'pipeline-export-verify').length), verificationCount + 1);
      // Button-style keyboard activation must perform the same verified, same-blob retry.
      const keyboardDownload = page.waitForEvent('download');
      await page.locator('#save-zip').focus();
      await page.keyboard.press('Enter');
      const keyboardChunks = [];
      for await (const chunk of await (await keyboardDownload).createReadStream()) keyboardChunks.push(chunk);
      assert.deepEqual(Buffer.concat(keyboardChunks), payload);
      assert.equal(await page.evaluate(() => window.__requests.filter((request) => request.type === 'pipeline-export-verify').length), verificationCount + 2);
      assert.equal(await page.evaluate(() => window.__requests.filter((request) => request.type === 'pipeline-export-read').length), 10);
      // The opt-in changes only local output and invalidates the old raw archive retry link.
      await page.locator('#include-formatted').check();
      assert.equal(await page.locator('#save-zip').isHidden(), true);
      const formattedDownload = page.waitForEvent('download');
      await page.locator('#download-zip').click();
      const formattedChunks = [];
      for await (const chunk of await (await formattedDownload).createReadStream()) formattedChunks.push(chunk);
      const formattedPayload = Buffer.concat(formattedChunks);
      assert.ok(formattedPayload.includes(Buffer.from('Small Package/Source/Pipeline 118_v1.json')));
      assert.ok(formattedPayload.includes(Buffer.from('Small Package/Formatted/Pipeline 118_v1.json')));
      assert.ok(formattedPayload.includes(Buffer.from('Small Package/README.md')));
      assert.equal(await page.evaluate(() => window.__requests.filter((request) => request.type === 'pipeline-export-read').length), 20);
      // Switching back restores the original layout for the following all-selected export.
      await page.locator('#include-formatted').uncheck();
      assert.equal(Buffer.from(payload).includes(Buffer.from('Demo Package/')), false);
      // A new selection invalidates its old ZIP, then reuses the still-valid preview for another download.
      await page.locator('#select-all').check();
      assert.equal(await page.locator('#save-zip').isHidden(), true);
      const allDownload = page.waitForEvent('download');
      await page.locator('#download-zip').click();
      await allDownload;
      await page.locator('#save-zip').waitFor();
      assert.equal(await page.evaluate(() => window.__requests.filter((request) => request.type === 'pipeline-export-read').length), 140);
      // Selection, formatting, cancellation, and refresh each invalidate a pending retry before its verification resolves.
      for (const change of ['selection', 'formatting', 'cancel', 'refresh']) {
        if (change !== 'selection') {
          await page.locator('#refresh-preview').click();
          await page.waitForFunction(() => document.querySelector('#export-status').textContent.startsWith('Preview ready'));
          const prepared = page.waitForEvent('download');
          await page.locator('#download-zip').click();
          await prepared;
        }
        const beforePending = downloads.length;
        await page.evaluate(() => { window.__delayVerify = true; window.__releaseVerify = null; });
        await page.locator('#save-zip').click();
        await page.waitForFunction(() => typeof window.__releaseVerify === 'function');
        if (change === 'selection') await page.locator('#select-all').uncheck();
        else if (change === 'formatting') await page.locator('#include-formatted').check();
        else if (change === 'cancel') await page.locator('#cancel-export').click();
        else {
          await page.locator('#refresh-preview').click();
          await page.waitForFunction(() => document.querySelector('#export-status').textContent.startsWith('Preview ready'));
        }
        await page.evaluate(() => { window.__delayVerify = false; window.__releaseVerify(); });
        await page.waitForFunction(() => !document.querySelector('#save-zip').hasAttribute('aria-busy'));
        assert.equal(downloads.length, beforePending, `Late ${change} verification must not download`);
        assert.equal(await page.locator('#save-zip').isHidden(), true);
      }
      // A failed context verification discards the local ZIP and never starts another source read or browser download.
      const prepared = page.waitForEvent('download');
      await page.locator('#download-zip').click();
      await prepared;
      const beforeDenied = downloads.length;
      const readsBeforeDenied = await page.evaluate(() => window.__requests.filter((request) => request.type === 'pipeline-export-read').length);
      await page.evaluate(() => { window.__verifyResult = { ok: false, reason: 'context-changed' }; });
      await page.locator('#save-zip').click();
      await page.locator('#export-status').filter({ hasText: 'The source page, tenant, or consent changed.' }).waitFor();
      assert.equal(downloads.length, beforeDenied);
      assert.equal(await page.locator('#save-zip').isHidden(), true);
      assert.equal(await page.evaluate(() => window.__requests.filter((request) => request.type === 'pipeline-export-read').length), readsBeforeDenied);
      await page.evaluate(() => { window.__verifyResult = null; });
      await page.locator('#refresh-preview').click();
      await page.waitForFunction(() => document.querySelector('#export-status').textContent.startsWith('Preview ready'));
      // Removing saved ownership revokes the completed link as well as any in-flight default job.
      await page.evaluate(() => window.__storageChange({ designerOwnershipCache: { newValue: {} } }, 'local'));
      assert.equal(await page.locator('#save-zip').isHidden(), true);

      // Cancel a delayed preview and prove its late result cannot restore records or a download.
      await page.evaluate(() => { window.__delay = true; });
      await page.locator('#refresh-preview').click();
      await page.waitForFunction(() => typeof window.__release === 'function');
      await page.locator('#cancel-export').click();
      await page.evaluate(() => { window.__delay = false; window.__release(); });
      assert.equal(await page.locator('.export-package').count(), 0);
      assert.match(await page.locator('#export-status').textContent(), /Cancelled/);
      await page.locator('#refresh-preview').click();
      await page.waitForFunction(() => document.querySelector('#export-status').textContent.startsWith('Preview ready'));
      // More than 100 package names remain discoverable immediately, with no Show More action.
      await page.evaluate(() => { window.__manyPackages = true; });
      await page.locator('#refresh-preview').click();
      await page.waitForFunction(() => document.querySelectorAll('.export-package').length === 120);
      await page.locator('.export-package').last().locator('.package-name').click();
      await page.locator('.export-package').last().locator('.pipeline-checkbox').waitFor();
      assert.equal(await page.locator('.export-package').last().locator('.pipeline-checkbox').count(), 1);
      // A failed collection must not invoke the automatic download or expose a stale retry link.
      const completedDownloads = downloads.length;
      await page.evaluate(() => { window.__failSource = true; });
      await page.locator('#download-zip').click();
      await page.locator('#export-status').filter({ hasText: 'No partial ZIP was created' }).waitFor();
      assert.equal(downloads.length, completedDownloads);
      assert.equal(await page.locator('#save-zip').isHidden(), true);
      await page.evaluate(() => { window.__failSource = false; });
      await page.evaluate(() => { window.__saved.sharedFromEnabled = false; window.__storageChange({ sharedFromEnabled: { newValue: false } }, 'local'); });
      assert.equal(await page.locator('.export-package').count(), 0);
      await page.locator('#refresh-preview').click();
      await page.waitForFunction(() => document.querySelector('#export-status').textContent === 'Enable Shared From first.');
      assert.deepEqual(await page.evaluate(() => [...new Set(window.__requests.map((request) => request.type))]), ['pipeline-export-preview', 'pipeline-export-verify', 'pipeline-export-read', 'pipeline-export-cancel']);
      assert.deepEqual(errors, []);
      await page.close();
    }
    console.log('PASS export selection: all 120 package headings, uncapped lazy pipeline groups, independent/mixed/select-all checkboxes, selected-only/repeated ZIPs, cancellation, opt-out, and both themes');
  } finally {
    await browser.close();
  }
}
run().catch((error) => { console.error(error); process.exitCode = 1; });
