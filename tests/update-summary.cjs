'use strict';

// Exercise an actual unpacked upgrade using a temporary copy and an isolated browser profile.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { chromium } = require('playwright');
const source = path.resolve(__dirname, '..');

(async () => {
  const temp = fs.realpathSync(os.tmpdir());
  const profile = fs.mkdtempSync(path.join(temp, 'navigator-release-notes-'));
  let context;
  try {
    // Keep the extension path (and therefore its ID and storage) stable during the upgrade.
    const extension = path.join(profile, 'fixture-extension');
    fs.mkdirSync(extension);
    for (const file of fs.readdirSync(source)) {
      if (!file.startsWith('.env') && /\.(css|html|js|json)$/.test(file)) {
        fs.copyFileSync(path.join(source, file), path.join(extension, file));
      }
    }
    fs.cpSync(path.join(source, 'icons'), path.join(extension, 'icons'), { recursive: true });
    const manifestPath = path.join(extension, 'manifest.json');
    const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
    const previous = '1.24.0';
    fs.writeFileSync(manifestPath, JSON.stringify({ ...manifest, version: previous }));
    context = await chromium.launchPersistentContext(profile, { headless: true,
      ...(process.env.INTEGRATION_NAVIGATOR_BROWSER ? { channel: process.env.INTEGRATION_NAVIGATOR_BROWSER } : {}),
      args: ['--disable-extensions-except=' + extension, '--load-extension=' + extension] });
    await context.route('https://**/*', route => route.abort());
    const worker = context.serviceWorkers()[0] || await context.waitForEvent('serviceworker');
    const url = new URL('popup.html', worker.url()).href;
    const page = await context.newPage();
    page.setDefaultTimeout(6000);
    await page.goto(url);
    await page.waitForFunction(() => !document.querySelector('#remember-width').disabled);
    assert.equal(await page.locator('#update-summary').isVisible(), false);

    // Both upgrade paths must get the entire store-release summary, even across another local bump.
    const tested = await worker.evaluate(async ({ current, previous }) => {
      const store = {};
      const storage = { get: async defaults => ({ ...defaults, ...store }), set: async items => Object.assign(store, items) };
      const { LAST_PUBLISHED_VERSION: baseline, recordUpdate, notesFor } = UpdateSummary;
      await recordUpdate({ reason: 'update', previousVersion: baseline }, storage, current);
      const fromStore = notesFor(store, current);
      await recordUpdate({ reason: 'update', previousVersion: previous }, storage, current);
      const fromLocal = notesFor(store, current);
      const later = '1.100.0';
      await recordUpdate({ reason: 'update', previousVersion: current }, storage, later);
      return { baseline, fromStore, fromLocal, later: notesFor(store, later), stale: notesFor(store, current) };
    }, { current: manifest.version, previous });
    assert.ok(tested.fromStore.length);
    assert.deepEqual(tested.fromStore, tested.fromLocal);
    assert.deepEqual(tested.fromStore, tested.later);
    assert.deepEqual(tested.stale, []);

    // Deliver the new manifest, then let Chrome dispatch its real onInstalled update event.
    await worker.evaluate(() => chrome.storage.local.set({ jobFilesWrapText: true, favoritesEnabled: false }));
    await page.close();
    fs.copyFileSync(path.join(source, 'manifest.json'), manifestPath);
    const restarted = context.waitForEvent('serviceworker', { timeout: 12000 });
    await worker.evaluate(() => { setTimeout(() => chrome.runtime.reload(), 50); });
    const updated = await restarted;
    const popup = await context.newPage();
    await popup.goto(url);
    // Wait for the real worker marker before opening the settings UI for this update.
    await popup.waitForFunction(async version => (await chrome.storage.local.get('pendingUpdateSummary')).pendingUpdateSummary?.version === version, manifest.version);
    await popup.reload();
    const card = popup.locator('#update-summary');
    await card.waitFor({ state: 'visible' });
    assert.ok((await card.locator('h2').textContent()).includes(manifest.version));
    assert.ok((await card.locator('#update-summary-baseline').textContent()).includes(tested.baseline));
    assert.deepEqual(await card.locator('li').allTextContents(), tested.fromStore);
    await popup.reload();
    await card.getByRole('button', { name: 'Dismiss update summary' }).press('Enter');
    await card.waitFor({ state: 'hidden' });
    assert.equal(await popup.locator('.page-behavior-card > summary').evaluate(el => el === document.activeElement), true);
    await popup.reload();
    await popup.waitForFunction(() => !document.querySelector('#remember-width').disabled);
    assert.equal(await card.isVisible(), false);

    // An update repeated after dismissal must not revive the notes or change other settings.
    const saved = await updated.evaluate(async previousVersion => {
      const version = chrome.runtime.getManifest().version;
      await UpdateSummary.recordUpdate({ reason:'update', previousVersion }, chrome.storage.local, version);
      return chrome.storage.local.get(['seenUpdateSummaryVersion', 'favoritesEnabled', 'jobFilesWrapText']);
    }, previous);
    assert.deepEqual(saved, { seenUpdateSummaryVersion: manifest.version, favoritesEnabled: false, jobFilesWrapText: true });
    console.log('PASS release notes: fresh install, real version upgrade, cumulative store baseline, dismissal, keyboard focus, and preference preservation.');
  } finally {
    try { await context?.close(); }
    finally {
      // Remove only the exact disposable profile and its fixture, including after a failed launch.
      if (path.dirname(profile) !== temp || !path.basename(profile).startsWith('navigator-release-notes-') || fs.lstatSync(profile).isSymbolicLink()) throw Error('Unexpected profile');
      fs.rmSync(profile, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 });
    }
  }
})().catch(error => { console.error(error); process.exitCode = 1; });
