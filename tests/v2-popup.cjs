"use strict";

// Exercise the actual popup assets with synthetic extension APIs and no Ellucian traffic.
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || "playwright");
const root = path.resolve(__dirname, "..");

// Keep every fixture preference in memory, including version markers and failed dismissals.
function installStub() {
  // Preserve the synthetic store across reloads, mirroring extension-local persistence.
  const saved = JSON.parse(localStorage.getItem("syntheticPreferences") || "null") || { packageArtifactsEnabled: false, pendingUpdateSummary: { version: "2.0.1" }, favorites: { keep: true } };
  window.__messages = [];
  const runtime = { lastError: undefined, getManifest: () => ({ version: "2.0.1", content_scripts: [{ matches: [] }] }), sendMessage: async (message) => { window.__messages.push(message); return { ok: true }; }, onMessage: { addListener() {} } };
  window.chrome = {
    runtime,
    storage: { local: {
      get(defaults, callback) { const result = { ...defaults }; for (const key of Object.keys(result)) if (Object.hasOwn(saved, key)) result[key] = saved[key]; if (callback) setTimeout(() => callback(result), 0); return Promise.resolve(result); },
      set(values, callback) { const failed = window.__failDismiss === true; if (!failed) { Object.assign(saved, values); localStorage.setItem("syntheticPreferences", JSON.stringify(saved)); } runtime.lastError = failed ? { message: "Synthetic failure" } : undefined; callback?.(); runtime.lastError = undefined; return Promise.resolve(); },
      remove() { return Promise.resolve(); },
    } },
    permissions: { getAll: async () => ({ origins: [] }), contains: async () => false },
    tabs: { query: async () => [], sendMessage: async () => ({}) },
  };
  window.__saved = saved;
}

async function run() {
  // Use a disposable test browser; never connect to an installed browser profile.
  const browser = await chromium.launch(process.env.INTEGRATION_NAVIGATOR_BROWSER ? { channel: process.env.INTEGRATION_NAVIGATOR_BROWSER, headless: true } : { headless: true });
  try {
    for (const colorScheme of ["light", "dark"]) {
      const page = await browser.newPage({ viewport: { width: 360, height: 900 }, colorScheme });
      const errors = [];
      page.on("pageerror", (error) => errors.push(error.message));
      await page.route("https://popup.test/**", (route) => {
        const file = path.join(root, new URL(route.request().url()).pathname);
        if (!file.startsWith(root + path.sep) || !fs.existsSync(file)) return route.fulfill({ status: 404 });
        return route.fulfill({ contentType: file.endsWith(".js") ? "text/javascript" : file.endsWith(".css") ? "text/css" : "text/html", body: fs.readFileSync(file) });
      });
      await page.addInitScript(installStub);
      await page.goto("https://popup.test/popup.html");
      await page.locator("#update-summary").waitFor({ state: "visible" });
      assert.deepEqual(await page.locator("details > summary").allTextContents(), ["Navigation", "Integration Packages", "Integration Designer", "Icon & Favorites", "Custom Sites", "Export & Backup"]);

      // Verify controls moved, but their IDs, consent notice, and source-refresh action remain intact.
      assert.equal(await page.locator(".navigation-card #search-display-mode").count(), 1);
      assert.equal(await page.locator(".packages-card #shared-from-enabled").count(), 1);
      assert.equal(await page.locator(".packages-card #refresh-shared-from").count(), 1);
      assert.equal(await page.locator(".designer-card #shared-version-enabled").count(), 1);
      assert.equal(await page.locator(".designer-card #fitting-details-enabled").count(), 1);
      assert.equal(await page.locator(".backup-card #export-shared-from").count(), 1);
      assert.equal(await page.locator("#export-pipelines").isDisabled(), false);
      // Shift+D is ignored while typing, and a revealed override still needs separate confirmation.
      await page.locator('#icon-letters').evaluate((node) => node.dispatchEvent(new KeyboardEvent('keydown', { key: 'D', shiftKey: true, bubbles: true })));
      assert.equal(await page.locator('#export-advanced').isVisible(), false);
      await page.locator('body').press('Shift+D');
      assert.equal(await page.locator('#export-advanced').isVisible(), true);
      page.once('dialog', (dialog) => dialog.dismiss());
      await page.locator('#export-all-accessible').click();
      assert.equal(await page.locator('#export-all-accessible').isChecked(), false);
      page.once('dialog', (dialog) => dialog.accept());
      await page.locator('#export-all-accessible').click();
      await page.locator('#export-pipelines').click();
      assert.equal(await page.locator('#export-all-accessible').isChecked(), false);
      assert.equal(await page.evaluate(() => window.__messages.find((message) => message.type === 'pipeline-export-open').overrideConfirmed), true);
      assert.equal(await page.evaluate(() => Object.hasOwn(window.__saved, 'overrideConfirmed')), false);

      // Failed dismissal leaves notes visible and retries cannot change any favorite data.
      await page.evaluate(() => { window.__failDismiss = true; });
      await page.locator("#dismiss-update-summary").click();
      assert.equal(await page.locator("#update-summary").isVisible(), true);
      assert.match(await page.locator("#update-summary-status").textContent(), /Could not dismiss/);
      await page.evaluate(() => { window.__failDismiss = false; });
      await page.locator("#dismiss-update-summary").click();
      assert.equal(await page.locator("#update-summary").isVisible(), false);
      assert.deepEqual(await page.evaluate(() => window.__saved.favorites), { keep: true });
      await page.reload();
      assert.equal(await page.locator("#update-summary").isVisible(), false);

      // Expanded settings keep one-line descriptions and avoid horizontal overflow at the actual width.
      await page.locator(".behavior-card").evaluateAll((cards) => cards.forEach((card) => { card.open = true; }));
      const layout = await page.evaluate(() => ({
        overflow: document.documentElement.scrollWidth > innerWidth,
        wrapped: [...document.querySelectorAll(".setting-description")].filter((node) => !node.hidden && node.textContent.trim() && node.getBoundingClientRect().height > parseFloat(getComputedStyle(node).lineHeight) + 1).map((node) => node.textContent.trim()),
      }));
      assert.equal(layout.overflow, false);
      assert.deepEqual(layout.wrapped, []);
      assert.deepEqual(errors, []);

      // Optional screenshots are synthetic visual QA, not altered live account screenshots.
      if (process.env.INTEGRATION_NAVIGATOR_SCREENSHOTS) {
        await page.locator(".popup-shell").screenshot({ path: path.join(process.env.INTEGRATION_NAVIGATOR_SCREENSHOTS, `v2-settings-${colorScheme}.png`) });
      }
      await page.close();
    }
    console.log("PASS v2 popup grouping, themes, one-line layout, update-summary dismissal, and preference preservation");
  } finally {
    // Close only the disposable fixture browser, even if an assertion fails.
    await browser.close();
  }
}
run().catch((error) => { console.error(error); process.exitCode = 1; });
