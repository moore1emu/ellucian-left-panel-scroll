// Synthetic regression: settings switches must always show the value actually saved in storage.
// Run from the repo root: node tests/popup-switches.regression.js (needs Playwright with Chromium).
"use strict";

const fs = require("fs");
const path = require("path");
const assert = require("assert");
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || "playwright");

const ROOT = process.env.INTEGRATION_NAVIGATOR_SOURCE || path.resolve(__dirname, "..");
const ORIGIN = "https://popup.test";

// Stand-in for the extension APIs; storage writes wait until the test settles them.
function installChromeStub() {
  // Mirror the worker's initialized default so this fixture does not show a false migration failure.
  const store = { packageArtifactsEnabled: false };
  const pending = [];
  const later = (callback) => setTimeout(callback, 0);
  const runtime = {
    lastError: undefined,
    getManifest: () => ({ version: "0.0.0-test", content_scripts: [{ matches: [] }] }),
    sendMessage: () => Promise.resolve({ ok: true }),
    onMessage: { addListener() {} },
  };
  window.chrome = {
    runtime,
    storage: {
      local: {
        get(defaults, callback) {
          const result = typeof defaults === "object" && defaults ? { ...defaults } : {};
          Object.keys(result).forEach((key) => { if (Object.hasOwn(store, key)) result[key] = store[key]; });
          if (callback) later(() => callback(result));
          return Promise.resolve(result);
        },
        set(items, callback) { pending.push({ items, callback }); },
        remove(key) { delete store[key]; return Promise.resolve(); },
      },
    },
    permissions: { getAll: async () => ({ origins: [] }), contains: async () => false, request: async () => false },
    tabs: { query: async () => [], sendMessage: async () => ({}) },
  };
  // Settle the oldest pending write, optionally as a failure that leaves storage unchanged.
  window.__settleWrite = (fail) => {
    const write = pending.shift();
    if (!write) throw new Error("No pending storage write.");
    if (!fail) Object.assign(store, write.items);
    runtime.lastError = fail ? { message: "Synthetic write failure" } : undefined;
    try { write.callback?.(); } finally { runtime.lastError = undefined; }
  };
  window.__store = store;
  window.__pendingWrites = () => pending.length;
}

const SWITCHES = [
  { id: "remember-width", key: "rememberWidth", label: "Remember Resized Width", status: "navigation-status" },
  { id: "favorites-enabled", key: "favoritesEnabled", label: "Pinned Packages", status: "navigation-status" },
  { id: "shared-version-enabled", key: "sharedVersionEnabled", label: "Shared To", status: "shared-to-status" },
  // The new opt-in must preserve the same failed-save/rapid-click guarantees.
  { id: "fitting-details-enabled", key: "fittingDetailsEnabled", label: "View Published Fitting Details", status: "fitting-details-status" },
];

async function openPopup(browser, savedValues) {
  const page = await browser.newPage();
  const errors = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.route(`${ORIGIN}/**`, (route) => {
    const file = path.join(ROOT, new URL(route.request().url()).pathname);
    if (!file.startsWith(ROOT) || !fs.existsSync(file)) return route.fulfill({ status: 404, body: "" });
    const type = file.endsWith(".js") ? "text/javascript" : file.endsWith(".css") ? "text/css" : "text/html";
    return route.fulfill({ contentType: type, body: fs.readFileSync(file) });
  });
  await page.addInitScript(installChromeStub);
  await page.addInitScript((values) => { Object.assign(window.__store, values); }, savedValues);
  await page.goto(`${ORIGIN}/popup.html`);
  // The Navigation task is visible initially; individual tests select other tasks when needed.
  await page.waitForFunction(() => !document.querySelector("#remember-width").disabled);
  return { page, errors };
}

// Read what the user sees next to what storage holds.
const readSwitch = (page, item) => page.evaluate(({ id, key, status }) => {
  const input = document.getElementById(id);
  return { shown: input.checked, saved: window.__store[key], disabled: input.disabled,
    busy: input.getAttribute("aria-busy"), message: document.getElementById(status).textContent,
    pending: window.__pendingWrites() };
}, item);

// Two clicks in a row, as fast as possible, before any write completes.
const clickTwice = (page, id) => page.evaluate((switchId) => {
  const input = document.getElementById(switchId);
  input.click();
  input.click();
}, id);

async function expectMatches(page, item, expected, step) {
  const state = await readSwitch(page, item);
  assert.strictEqual(state.saved, expected, `${item.label} ${step}: storage should hold ${expected}`);
  assert.strictEqual(state.shown, state.saved, `${item.label} ${step}: switch shows ${state.shown} but storage holds ${state.saved}`);
  assert.strictEqual(state.disabled, false, `${item.label} ${step}: switch should be enabled after saving`);
  return state;
}

(async () => {
  // Allow a locally installed Chromium-based engine without changing any assertions.
  const browser = await chromium.launch(process.env.INTEGRATION_NAVIGATOR_BROWSER ? { channel: process.env.INTEGRATION_NAVIGATOR_BROWSER } : {});
  try {
    for (const item of SWITCHES) {
      const { page, errors } = await openPopup(browser, { [item.key]: false });
      if (item.id === 'shared-version-enabled') await page.getByRole('tab', { name: 'Sharing', exact: true }).click();
      // Keep the new label and help compact in the actual 360px settings layout.
      if (item.id === 'fitting-details-enabled') {
        await page.setViewportSize({ width: 360, height: 580 });
        const layout = await page.evaluate(() => {
          const row=document.querySelector('label[for="fitting-details-enabled"]');
          const title=row.querySelector('.setting-title'), help=row.querySelector('.setting-description');
          return {width:document.documentElement.scrollWidth, titleHeight:title.getBoundingClientRect().height,
            titleLine:parseFloat(getComputedStyle(title).lineHeight),helpHeight:help.getBoundingClientRect().height,
            helpLine:parseFloat(getComputedStyle(help).lineHeight)};
        });
        assert.ok(layout.width <= 360, 'Settings must not overflow horizontally');
        assert.ok(layout.titleHeight <= layout.titleLine + 1 && layout.helpHeight <= layout.helpLine + 1, 'Viewing title/help must each stay on one line');
        // Optional local previews are not public assets or store screenshots.
        if (process.env.INTEGRATION_NAVIGATOR_PREVIEW) {
          await page.locator('label[for="fitting-details-enabled"]').scrollIntoViewIfNeeded();
          for (const colorScheme of ['light','dark']) {
            await page.emulateMedia({colorScheme});
            await page.screenshot({path:path.join(process.env.INTEGRATION_NAVIGATOR_PREVIEW,`settings-${colorScheme}.png`)});
          }
        }
      }
      await expectMatches(page, item, false, "after load");

      // The reported bug: rapid ON/OFF while pending, then every write fails; the switch must show the saved OFF.
      await clickTwice(page, item.id);
      const whileSaving = await readSwitch(page, item);
      await page.evaluate(() => { while (window.__pendingWrites()) window.__settleWrite(true); });
      let state = await expectMatches(page, item, false, "after rapid clicks and failed writes");
      assert.match(state.message, new RegExp(`Could not save ${item.label}`), `${item.label}: failure message`);

      // The switch stays locked while saving, so a second click cannot start another write.
      assert.strictEqual(whileSaving.pending, 1, `${item.label}: a second click must not start another write`);
      assert.strictEqual(whileSaving.disabled, true, `${item.label}: switch should be disabled while saving`);
      assert.strictEqual(whileSaving.busy, "true", `${item.label}: switch should report busy while saving`);

      // Success updates the confirmed value; a later failure restores to it.
      await clickTwice(page, item.id);
      await page.evaluate(() => window.__settleWrite(false));
      state = await expectMatches(page, item, true, "after saved ON");
      assert.strictEqual(state.message, "", `${item.label}: success clears the failure message`);
      await clickTwice(page, item.id);
      await page.evaluate(() => window.__settleWrite(true));
      await expectMatches(page, item, true, "after failed OFF");

      assert.deepStrictEqual(errors, [], `${item.label}: page errors`);
      await page.close();
      console.log(`ok - ${item.label}`);
    }

    // Saved widths are cleared only after reset-on-refresh actually saves.
    const widths = { "example.test|packages": 320 };
    const { page } = await openPopup(browser, { rememberWidth: true, savedWidths: widths });
    await page.evaluate(() => document.getElementById("remember-width").click());
    await page.evaluate(() => window.__settleWrite(true));
    assert.deepStrictEqual(await page.evaluate(() => window.__store.savedWidths), widths, "failed OFF must keep saved widths");
    await page.evaluate(() => document.getElementById("remember-width").click());
    await page.evaluate(() => window.__settleWrite(false));
    assert.strictEqual(await page.evaluate(() => window.__store.savedWidths), undefined, "saved OFF clears saved widths");
    console.log("ok - saved widths cleared only after a successful reset");
  } finally {
    await browser.close();
  }
})().catch((error) => {
  console.error(`not ok - ${error.message}`);
  process.exitCode = 1;
});
