'use strict';

// Exercise real response capture and table rendering without a signed-in profile or live service.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { chromium } = require('playwright');
const root = process.env.INTEGRATION_NAVIGATOR_SOURCE || path.resolve(__dirname, '..');

(async () => {
  // Non-persistent launch uses Playwright's owned temporary profile, removed by browser.close().
  const browser = await chromium.launch({ headless: true,
    ...(process.env.INTEGRATION_NAVIGATOR_BROWSER ? { channel: process.env.INTEGRATION_NAVIGATOR_BROWSER } : {}) });
  try {
    const page = await browser.newPage();
    page.setDefaultTimeout(7000);
    const errors = [];
    const requests = [];
    page.on('pageerror', error => errors.push(error.message));
    // Intercept every request so fixture metadata cannot reach an institution service.
    await page.route('**/*', route => {
      requests.push(route.request().url());
      if (route.request().resourceType() === 'document') return route.fulfill({ contentType: 'text/html', body:
        '<div data-testid="master"><div id="home_title-packages">PACKAGES</div><ul role="tree"></ul></div>' +
        '<main><h2 id="packageDetails-title">Package: Fixture</h2><div id="details"></div></main>' });
      // Include unsorted majors, repeated minors, and API majors that must still collapse overall.
      const pipelines = [
        { name: 'Native', type: 'integration', version: 'v1.0.4' },
        { name: 'Native', type: 'integration', version: 'v2.0.5' },
        { name: 'Child', type: 'sub-pipeline', version: 'v3.0.1' },
        { name: 'Child', type: 'subpipeline', version: 'v1.9.9' },
        { name: 'Child', type: 'sub_pipeline', version: 'v2.0.5' },
        { name: 'Child', type: 'subpipeline', version: 'v1.10.0' },
        { name: 'Child', type: 'subpipeline', version: 'v2.0.4' },
        { name: 'Child', type: 'subpipeline', version: 'v3.0.1' },
        { name: 'Service', type: 'api', version: 'v1.10.0' },
        { name: 'Service', type: 'api', version: 'v2.0.1' },
        { name: 'Unpublished', type: 'subpipeline', version: '' },
      ];
      return route.fulfill({ contentType: 'application/json', headers: { 'access-control-allow-origin': '*' },
        body: JSON.stringify({ name: 'Fixture', pipelines }) });
    });
    // Capture before the native consumer mutates its response, as on the real Packages page.
    await page.addInitScript({ content: fs.readFileSync(path.join(root, 'page-index.js'), 'utf8') });
    await page.goto('https://fixture.invalid/tenant/app/all-accounts/Ellucian/data-connect/home');
    await page.evaluate(() => {
      const pkg = { name: 'Fixture', version: 'v1.0.0', pipelines: [] };
      const row = document.createElement('li');
      row.dataset.level = '1'; row.dataset.nodeid = 'fixture'; row.setAttribute('package-element', '');
      row.innerHTML = '<div class="MuiTreeItem-content"><span class="MuiTreeItem-label">Fixture</span></div>';
      row.__reactProps$fixture = { 'package-element': pkg };
      document.querySelector('ul').appendChild(row);
      // Record display messages and storage writes without exposing any real saved state.
      const listeners = [];
      window.stats = { reads: 0, writes: 0, clicks: 0, replies: [] };
      addEventListener('message', event => {
        if (event.data?.type === 'package-artifacts-response') stats.replies.push(event.data);
      });
      window.chrome = { runtime: { id: 'fixture', onMessage: { addListener() {} } }, storage: {
        onChanged: { addListener: listener => listeners.push(listener) },
        local: { get: (defaults, callback) => queueMicrotask(() => callback({ ...defaults,
          favoritesEnabled: false, sharedFromEnabled: false, packageArtifactsEnabled: true })),
          set: () => { stats.writes++; } } } };
      window.toggleRecords = enabled => listeners.forEach(listener => listener({ packageArtifactsEnabled: { newValue: enabled } }, 'local'));
      // Switch between a mixed native table and the truly empty native placeholder.
      window.select = mixed => {
        document.querySelector('#details').innerHTML = mixed
          ? '<div id="packageTable-table"><table><thead><tr><th>Pipeline Name</th><th>Version</th></tr></thead><tbody>' +
            '<tr><td><a id="packageTable-pipeline-button0" href="#native">Native</a></td><td>1.0.4</td></tr>' +
            '<tr><td><a id="packageTable-pipeline-button1" href="#native">Native</a></td><td>2.0.5</td></tr></tbody></table></div>'
          : '<div id="packageTable-empty"><figure><svg role="img"></svg><figcaption><h2 id="packageTable-no-pipelines">No pipelines</h2></figcaption></figure></div>';
        document.querySelectorAll('main a').forEach(link => link.addEventListener('click', event => { event.preventDefault(); stats.clicks++; }));
        dispatchEvent(new Event('ellucian-left-panel-dom-changed'));
      };
      // Exercise both JSON and text XHR paths; native filtering must not erase captured majors.
      window.load = json => new Promise(resolve => {
        const xhr = new XMLHttpRequest();
        xhr.open('GET', 'https://semver-s3-service.prod.10005.elluciancloud.com/artifact/fixture/integration-package/v1.0.0/fixture.json?provisioned=false');
        if (json) xhr.responseType = 'json';
        xhr.onloadend = () => {
          const data = json ? xhr.response : JSON.parse(xhr.responseText);
          data.pipelines = data.pipelines.filter(entry => entry.type === 'integration');
          pkg.pipelines = data.pipelines;
          stats.reads++;
          resolve();
        };
        xhr.send();
      });
      select(true);
    });
    // Load the current isolated helpers in their declared order, excluding unrelated export UI.
    await page.addStyleTag({ content: fs.readFileSync(path.join(root, 'styles.css'), 'utf8') });
    for (const file of ['shared.js', 'favorites-data.js', 'favorite-appearance.js', 'search.js']) {
      await page.addScriptTag({ content: fs.readFileSync(path.join(root, file), 'utf8') });
    }
    await page.waitForFunction(() => stats.replies.length > 0);
    await page.evaluate(() => load(true));
    const rows = page.locator('[data-ellucian-artifact-body] tr');
    await rows.nth(3).waitFor();
    const expected = ['ChildSub-Pipeline1.10.0', 'ChildSub-Pipeline2.0.5', 'ChildSub-Pipeline3.0.1', 'ServiceAPI2.0.1'];
    assert.deepEqual(await rows.allTextContents(), expected);
    // Assert capture separately, so a later UI change cannot hide a MAIN-world regression.
    const captured = await page.evaluate(() => stats.replies.at(-1).pipelines);
    assert.deepEqual(captured.filter(entry => entry.type === 'subpipeline').map(entry => entry.version).sort(), ['v1.10.0', 'v2.0.5', 'v3.0.1']);
    assert.deepEqual(captured.filter(entry => entry.type === 'api').map(entry => entry.version), ['v2.0.1']);
    assert.equal(await rows.locator('a,button,[tabindex]').count(), 0);
    assert.deepEqual(await page.locator('tbody:not([data-ellucian-artifact-body]) tr').allTextContents(), ['NativeIntegration1.0.4', 'NativeIntegration2.0.5']);
    await page.locator('#packageTable-pipeline-button0').click();
    assert.equal(await page.evaluate(() => stats.clicks), 1);
    // A refreshed text response replaces its snapshot instead of appending duplicate majors.
    await page.evaluate(() => { select(false); return load(false); });
    await rows.nth(3).waitFor();
    assert.deepEqual(await rows.allTextContents(), expected);
    assert.equal(await page.locator('#packageTable-empty').isVisible(), false);
    assert.equal(await page.locator('[data-testid="master"] li[data-level="2"]').count(), 0);
    assert.equal(await rows.first().locator('[data-ellucian-artifact-name]').getAttribute('title'), 'For Reference Only; Cannot Be Run From This Page.');
    // Independent display opt-out still restores the empty state without a cache/favorites write.
    await page.evaluate(() => toggleRecords(false));
    await page.waitForFunction(() => !document.querySelector('[data-ellucian-artifact-wrapper]'));
    assert.equal(await page.locator('#packageTable-empty').isVisible(), true);
    assert.equal(await page.evaluate(() => stats.writes), 0);
    assert.equal(requests.length, 3, 'Only the document and two fixture-initiated native reads are allowed');
    assert.deepEqual(errors, []);
    console.log('Package display: all Sub-Pipeline majors, latest minor/patch, API latest-overall, native rows, opt-out, and zero extra reads/writes passed.');
  } finally {
    // Close only the disposable browser, including after a failed assertion.
    await browser.close();
  }
})().catch(error => { console.error(error); process.exitCode = 1; });
