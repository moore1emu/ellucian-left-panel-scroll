'use strict';

// Exercise both extension worlds and the real Ace document in a disposable, fully intercepted browser.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { chromium } = require('playwright');
const root = path.resolve(__dirname, '..');
const acePath = process.env.INTEGRATION_NAVIGATOR_ACE || require.resolve('ace-builds/src-noconflict/ace.js');
const origin = 'https://experience-test.elluciancloud.com';
const route = '/fixture/app/all-accounts/Ellucian/data-connect/jobDetail/fixture';
const html = '<!doctype html><meta charset="utf-8"><body><script src="/fixture-ace.js"></script></body>';

// Exercise storage failures in a second fixture using the same preference script and real user clicks.
async function checkStorageFailures(context) {
  const page = await context.newPage();
  const fixture = 'https://viewer.invalid/data-connect/jobDetail/test';
  const markup = '<div role="dialog"><h2>File Output: test.csv</h2><div class="ace_editor" id="review-file">A,B</div><footer><button>Close</button></footer></div>';
  await page.route(fixture, r => r.fulfill({ contentType: 'text/html', body: markup }));
  await page.goto(fixture);
  const script = path.join(root, 'job-file-preference.js');
  const control = page.getByRole('switch', { name: 'Formatted view' });
  async function start(mode) {
    await page.evaluate(mode => {
      let writes = 0;
      window.fixtureStorage = { writes: () => writes };
      window.chrome.storage = {
        onChanged: { addListener() {} },
        local: {
          get: async () => {
            if (mode === 'read-failure') throw Error('Storage unavailable');
            return { jobFilesFormattedView: true };
          },
          set: () => {
            writes++;
            if (mode === 'invalidated') throw Error('Extension context invalidated.');
            return new Promise((resolve, reject) => { window.fixtureStorage.reject = reject; });
          }
        }
      };
    }, mode);
    await page.addScriptTag({ path: script });
    await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
  }
  // A failed startup read leaves the native file available without guessing the user's saved mode.
  await start('read-failure');
  assert.equal(await control.count(), 0);
  assert.equal(await page.locator('#review-file').isVisible(), true);
  await page.reload();
  await start('pending');
  await control.uncheck();
  assert.equal(await control.isDisabled(), true);
  assert.equal(await page.evaluate(() => fixtureStorage.writes()), 1);
  // A failed write after a dialog replacement must restore the last confirmed mode on the new dialog.
  await page.evaluate(markup => { document.body.innerHTML = markup; }, markup);
  await page.evaluate(() => fixtureStorage.reject(Error('Save failed')));
  await page.waitForFunction(() => document.querySelector('.inav-file-switch input')?.checked);
  await page.reload();
  await start('invalidated');
  await control.click();
  await page.waitForFunction(() => document.querySelector('.inav-file-switch input')?.checked);
  assert.equal(await control.isEnabled(), true);
  // A failed wrap save restores only wrapping; the native formatted-mode preference stays selected.
  await page.reload();
  await start('pending');
  const wrap = page.getByRole('checkbox', {name: 'Wrap text'});
  await wrap.check();
  assert.equal(await wrap.isDisabled(), true);
  await page.evaluate(() => fixtureStorage.reject(Error('Wrap save failed')));
  await page.waitForFunction(() => {
    const input = document.querySelector('.inav-file-switch input:not([role])');
    return input && !input.disabled && !input.checked;
  });
  assert.equal(await control.isChecked(), true);
  await page.close();
}

(async () => {
  const temp = fs.realpathSync(os.tmpdir());
  const profile = fs.mkdtempSync(path.join(temp, 'navigator-job-view-'));
  let context;
  try {
    context = await chromium.launchPersistentContext(profile, { headless:true,
      ...(process.env.INTEGRATION_NAVIGATOR_BROWSER ? {channel:process.env.INTEGRATION_NAVIGATOR_BROWSER} : {}),
      args:['--disable-extensions-except=' + root, '--load-extension=' + root] });
    const unexpected = [];
    await context.route('**/*', request => {
      const url = request.request().url();
      if (url.startsWith('chrome-extension:')) return request.continue();
      if (url === origin + route) return request.fulfill({contentType:'text/html',body:html});
      if (url === origin + '/fixture-ace.js') return request.fulfill({contentType:'application/javascript',path:acePath});
      unexpected.push(new URL(url).pathname);
      return request.abort();
    });
    const worker = context.serviceWorkers()[0] || await context.waitForEvent('serviceworker');
    const page = await context.newPage();
    const errors = [];
    page.on('pageerror', e => errors.push(e.message));
    await page.goto(origin + route);
    page.setDefaultTimeout(5000);
    // Match the observed heading, nested role dialogs and stable native editor id.
    async function open(name, source) {
      await page.evaluate(([name, source]) => {
        const outer = document.createElement('div');
        outer.setAttribute('role','dialog');
        outer.innerHTML = '<div role="dialog" style="width:min(560px,100%)"><h2>View File Output<span></span></h2><div id="review-file" style="width:100%;height:200px"></div><footer><button>Close</button></footer></div>';
        outer.querySelector('span').textContent = 'File Output: ' + name;
        document.body.append(outer);
        window.fixtureEditor = ace.edit('review-file');
        fixtureEditor.session.setUseWorker(false);
        fixtureEditor.setValue(source,-1);
        fixtureEditor.setReadOnly(true);
        outer.querySelector('button').onclick = () => { outer.remove(); fixtureEditor.destroy(); };
      }, [name, source]);
    }
    const control = page.getByRole('switch',{name:'Formatted view'});
    const panel = page.locator('.inav-file-output');
    const raw = page.locator('#review-file');
    // Include a multiline field, quoted comma, escaped quote, literal markup and trailing empty column.
    const csv = 'Name,Notes,Extra\nExample,"one, two\nthree ""quotes""",\nBlank,<img src=x>,';
    await open('records.CSV',csv);
    await panel.locator('tbody tr').first().waitFor();
    assert.equal(await control.isChecked(), true);
    assert.deepEqual(await panel.locator('tbody tr').first().locator('td').allTextContents(), ['Example','one, two\nthree "quotes"','']);
    assert.equal(await panel.locator('img').count(),0);
    assert.equal(await raw.isVisible(),false);
    // The horizontal scroll range belongs to the preview; the footer stays fixed while reading wide records.
    const wrap = page.getByRole('checkbox', {name: 'Wrap text'});
    const footer = page.locator('footer');
    assert.equal(await footer.getByRole('switch',{name:'Formatted view'}).count(), 1);
    // Both the visible left-to-right order and the keyboard order should end at Close.
    const close = footer.getByRole('button',{name:'Close'});
    assert.equal(await close.evaluate(b=>b.previousElementSibling?.className),'inav-file-switch');
    const [modeBox, wrapBox, closeBox] = await Promise.all([control.boundingBox(), wrap.boundingBox(), close.boundingBox()]);
    assert.ok(modeBox.x + modeBox.width <= wrapBox.x && wrapBox.x + wrapBox.width <= closeBox.x);
    await control.focus();
    await page.keyboard.press('Tab');
    assert.equal(await wrap.evaluate(el=>el === document.activeElement),true);
    await page.keyboard.press('Tab');
    assert.equal(await close.evaluate(el=>el === document.activeElement),true);
    assert.equal(await wrap.isChecked(), false);
    const wide = 'W'.repeat(300);
    await page.evaluate(text => fixtureEditor.setValue('Key,Description\n1,'+text,-1),wide);
    await panel.getByRole('cell',{name:wide,exact:true}).waitFor();
    await panel.focus();
    await page.keyboard.press('ArrowRight');
    await page.waitForFunction(() => document.querySelector('.inav-file-output').scrollLeft > 0);
    assert.ok(await panel.evaluate(el => el.scrollLeft > 0));
    assert.ok(await footer.evaluate(el => el.scrollWidth <= el.clientWidth));
    await wrap.check();
    await page.waitForFunction(() => {
      const el = document.querySelector('.inav-file-output');
      return el.scrollWidth <= el.clientWidth && el.querySelector('tbody tr').getBoundingClientRect().height > 40;
    });
    await page.evaluate(text=>fixtureEditor.setValue(text,-1),csv);
    await panel.getByText('Example',{exact:true}).waitFor();
    await control.uncheck();
    await raw.waitFor();
    assert.equal(await wrap.isVisible(),false);
    assert.equal(await page.evaluate(()=>fixtureEditor.getValue()),csv);
    await page.getByRole('button',{name:'Close',exact:true}).click();
    await page.reload();
    // The choice applies to the next format and survives a full document reload.
    const json = '{"record":{"id":900719925474099312345,"note":"safe <tag>","id":2}}';
    await open('result.json',json);
    await control.waitFor();
    assert.equal(await control.isChecked(),false);
    await control.check();
    const branch = panel.locator('summary').filter({hasText:'"record"'});
    await branch.focus();
    await page.keyboard.press('Enter');
    await panel.getByText('"id": 900719925474099312345,',{exact:true}).waitFor();
    assert.equal(await panel.getByText('"id": 2',{exact:true}).count(),1);
    // Wrapping survives reopening, and toggling it reflows long JSON values without closing branches.
    assert.equal(await wrap.isChecked(),true);
    const wideJSON = JSON.stringify({record:{note:wide}});
    await page.evaluate(text=>fixtureEditor.setValue(text,-1),wideJSON);
    await panel.locator('summary').filter({hasText:'"record"'}).click();
    await panel.getByText(wide,{exact:false}).last().waitFor();
    const openBefore = await panel.locator('details[open]').count();
    await wrap.uncheck();
    await page.waitForFunction(() => {
      const el=document.querySelector('.inav-file-output');
      return el.scrollWidth > el.clientWidth;
    });
    assert.equal(await panel.locator('details[open]').count(),openBefore);
    await wrap.check();
    await page.waitForFunction(() => {
      const el=document.querySelector('.inav-file-output');
      return el.scrollWidth <= el.clientWidth;
    });
    // Invalid, replaced and unsupported content must expose the complete original file again.
    await page.evaluate(()=>fixtureEditor.setValue('{"broken":',-1));
    await panel.getByText(/Unable to format/).waitFor();
    await raw.waitFor();
    await page.evaluate(()=>{document.querySelector('h2 span').textContent='File Output: data.csv';
      fixtureEditor.setValue('A,B\n'+Array.from({length:250},(_,i)=>i+',ok').join('\n'),-1);});
    await panel.getByRole('button',{name:'Next'}).click();
    await panel.getByText('Rows 101–200 of 250').waitFor();
    assert.equal(await panel.locator('td').first().textContent(),'100');
    await wrap.uncheck();
    assert.equal(await panel.getByText('Rows 101–200 of 250').count(),1);
    // Preserve the saved preference while the v3 Navigation group is disabled.
    if (JSON.parse(fs.readFileSync(path.join(root,'manifest.json'))).version.startsWith('3.')) {
      await worker.evaluate(()=>chrome.storage.local.set({navigationToolsEnabled:false}));
      await control.waitFor({state:'detached'});
      await raw.waitFor();
      await worker.evaluate(()=>chrome.storage.local.set({navigationToolsEnabled:true}));
      await panel.getByRole('table').waitFor();
      assert.equal(await control.isChecked(),true);
    }
    await page.evaluate(()=>document.querySelector('h2 span').textContent='File Output: native.log');
    await control.waitFor({state:'detached'});
    await raw.waitFor();
    assert.equal(await panel.count(),0);
    await page.getByRole('button',{name:'Close',exact:true}).click();
    await checkStorageFailures(context);
    assert.deepEqual(unexpected,[]);
    assert.deepEqual(errors,[]);
    console.log('PASS installed Job Run Files: footer controls, horizontal scrolling, CSV and JSON wrapping, saved preferences, pagination, JSON disclosure, native fallback and zero extra requests.');
  } finally {
    try { await context?.close(); }
    finally {
      // Delete only the profile allocated by this test, even when launch or assertions fail.
      if (path.dirname(profile)!==temp || !path.basename(profile).startsWith('navigator-job-view-') || fs.lstatSync(profile).isSymbolicLink()) throw Error('Unexpected test profile');
      fs.rmSync(profile,{recursive:true,force:true,maxRetries:5,retryDelay:200});
    }
  }
})().catch(error=>{console.error(error);process.exitCode=1;});
