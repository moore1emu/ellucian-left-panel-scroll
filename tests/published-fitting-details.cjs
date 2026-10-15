// Exercise the delivered extension and real Ace against synthetic, intercepted pages only.
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const assert = require('node:assert/strict');
const { chromium } = require('playwright');
// Resolve dependencies locally; downloaded editor code is never shipped with the extension.
const extension = process.env.INTEGRATION_NAVIGATOR_SOURCE || path.resolve(__dirname, '..');
const aceFile = process.env.INTEGRATION_NAVIGATOR_ACE || require.resolve('ace-builds/src-noconflict/ace.js');
const site = 'https://experience-test.elluciancloud.com';
const designer = '/fixture/app/all-accounts/Ellucian/data-connect-designer/pipelineDesigner';
const html = `<style>#flowItem_contentEdit{opacity:.4;pointer-events:none} #flowItem_contentEdit.draft{opacity:1;pointer-events:auto} .ace_editor{height:180px;width:650px} textarea:not(.ace_text-input){width:500px;height:65px}</style>
  <button id="action_save" aria-label="Create draft from published pipeline.">Create Draft</button><button id="action_publish" disabled>Publish</button>
  <div id="flowItem_contentEdit"><fieldset id="flowItem_contentEdit_fieldset" disabled>
    <input id="name" value="Fixture Name"><textarea id="description">Fixture description\nline two</textarea>
    <input id="check" type="checkbox"><button id="reset">Reset Code</button><select id="choice"><option>Fixture</option><option>Other</option></select>
    <div id="custom" role="combobox" tabindex="0">Artifact</div><a id="action-link" href="#action">Action</a>
    <div id="code" class="ace_editor"></div>
  </fieldset></div><script src="/fixture-ace.js"></script><script>
    // Populate a real editor without service calls or real pipeline contents.
    window.codeValue=Array.from({length:100},(_,i)=>'// Synthetic code line '+i).join('\\n');
    window.editor=ace.edit('code');editor.setValue(codeValue,-1);editor.setReadOnly(false);
    // Observe the real isolated-to-MAIN startup handshake, not an isolated-world global.
    window.__settings=[];addEventListener('message',e=>{if(e.data?.type==='fitting-details-setting')__settings.push(e.data.enabled);});
    window.actions=0;document.querySelectorAll('#reset,#custom,#check,#choice,#action-link').forEach(n=>n.addEventListener('click',()=>actions++));
    window.nativeDraft=()=>{document.getElementById('action_save').setAttribute('aria-label','Save pipeline.');document.getElementById('action_publish').disabled=false;document.querySelector('fieldset').disabled=false;document.querySelector('#flowItem_contentEdit').classList.add('draft');};
    window.nativePublished=()=>{document.getElementById('action_save').setAttribute('aria-label','Create draft from published pipeline.');document.getElementById('action_publish').disabled=true;document.querySelector('fieldset').disabled=true;document.querySelector('#flowItem_contentEdit').classList.remove('draft');};
  </script>`;

(async () => {
  // A new temporary profile cannot touch the user's installed extension or saved preferences.
  const temporaryRoot = fs.realpathSync(os.tmpdir());
  const profile = fs.mkdtempSync(path.join(temporaryRoot, 'navigator-fitting-test-'));
  let context;
  try {
    // Include launch failures in the owned-profile cleanup boundary.
    context = await chromium.launchPersistentContext(profile, { headless: true,
      ...(process.env.INTEGRATION_NAVIGATOR_BROWSER ? { channel: process.env.INTEGRATION_NAVIGATOR_BROWSER } : {}),
      args: [`--disable-extensions-except=${extension}`, `--load-extension=${extension}`] });
    const requests = [];
    // Reject every real network request; only the synthetic page and local Ace bytes are returned.
    await context.route('**/*', route => {
      const url = route.request().url();
      if (url.startsWith('chrome-extension:')) return route.continue();
      requests.push(url);
      if (url === site + '/fixture-ace.js') return route.fulfill({contentType:'text/javascript',body:fs.readFileSync(aceFile)});
      return route.fulfill({contentType:'text/html',body:html});
    });
    const worker = context.serviceWorkers()[0] || await context.waitForEvent('serviceworker');
    // Wait for the pre-existing preference migration before comparing feature-only writes.
    await worker.evaluate(() => pendingOwnershipUpdate);
    const page = await context.newPage();
    const errors = [];
    page.on('pageerror', e => errors.push(e.message));
    await page.goto(site + designer);
    await page.waitForFunction(() => window.editor && window.__settings.length);
    // The default build must leave native published locks and source untouched.
    assert.deepEqual(await page.evaluate(() => ({disabled:document.querySelector('fieldset').disabled,pointer:getComputedStyle(document.querySelector('#flowItem_contentEdit')).pointerEvents,readonly:editor.getReadOnly()})), {disabled:true,pointer:'none',readonly:false});
    const initialStore = await worker.evaluate(() => chrome.storage.local.get(null));
    await worker.evaluate(() => chrome.storage.local.set({fittingDetailsEnabled:true}));
    await page.waitForFunction(() => !document.querySelector('fieldset').disabled && editor.getReadOnly() && getComputedStyle(document.querySelector('#flowItem_contentEdit')).pointerEvents === 'auto');
    // Text fields are readable/copyable while non-text and custom action controls remain locked.
    assert.deepEqual(await page.evaluate(() => ({name:document.querySelector('#name').readOnly,description:document.querySelector('#description').readOnly,check:document.querySelector('#check').disabled,reset:document.querySelector('#reset').disabled,choice:document.querySelector('#choice').disabled,custom:document.querySelector('#custom').inert,link:document.querySelector('#action-link').inert,opacity:getComputedStyle(document.querySelector('#flowItem_contentEdit')).opacity})), {name:true,description:true,check:true,reset:true,choice:true,custom:true,link:true,opacity:'1'});
    // Verify actual editor focus/keyboard selection and clipboard copying, not just DOM attributes.
    await context.grantPermissions(['clipboard-read','clipboard-write'], {origin:site});
    await page.locator('#code').click({position:{x:110,y:20}});
    await page.keyboard.press('Control+a');
    assert.equal(await page.evaluate(() => editor.getSelectedText()), await page.evaluate(() => codeValue));
    await page.keyboard.press('Control+c');
    assert.equal(await page.evaluate(() => navigator.clipboard.readText()), await page.evaluate(() => codeValue));
    // Try typing and common destructive editor shortcuts; the real Ace document must not change.
    await page.keyboard.type('SHOULD NOT CHANGE');
    for (const key of ['Backspace','Delete','Control+d','Control+z','Control+v','Control+x','Enter']) await page.keyboard.press(key);
    await page.evaluate(() => {
      const input=document.querySelector('.ace_text-input');
      for(const type of ['beforeinput','paste','cut','drop']) input.dispatchEvent(new Event(type,{bubbles:true,cancelable:true}));
      document.querySelector('#custom').dispatchEvent(new MouseEvent('click',{bubbles:true,cancelable:true}));
    });
    assert.equal(await page.evaluate(() => editor.getValue()), await page.evaluate(() => codeValue));
    assert.equal(await page.evaluate(() => actions), 0);
    // Wheel scrolling should reveal later lines without changing source or triggering re-lock loops.
    await page.locator('#code').hover();
    await page.mouse.wheel(0,700);
    await page.waitForFunction(() => editor.session.getScrollTop() > 0);
    assert.equal(await page.evaluate(() => getComputedStyle(document.querySelector('#flowItem_contentEdit')).pointerEvents), 'auto');
    // Replaced fitting controls/editors are re-locked without retaining old editor instances.
    await page.evaluate(() => {
      window.oldEditor=editor;
      const code=document.querySelector('#code');
      const replacement=document.createElement('div');replacement.id='code';replacement.className='ace_editor';code.replaceWith(replacement);
      editor=ace.edit(replacement);editor.setValue(codeValue,-1);editor.setReadOnly(false);
      const next=document.createElement('textarea');next.id='late-field';next.value='Fixture late field';document.querySelector('fieldset').append(next);
    });
    await page.waitForFunction(() => editor.getReadOnly() && document.querySelector('#late-field').readOnly && !oldEditor.getReadOnly());
    // Scroll-only Ace redraws and unrelated page changes should schedule no extra fitting work.
    await page.evaluate(() => {
      window.readOnlyChecks=0;const original=editor.getReadOnly.bind(editor);editor.getReadOnly=()=>{readOnlyChecks++;return original();};
      const unrelated=document.createElement('div');unrelated.id='unrelated';document.body.append(unrelated);
      for(let i=0;i<100;i++) unrelated.append(document.createElement('span'));
    });
    await page.waitForTimeout(120);
    assert.equal(await page.evaluate(() => readOnlyChecks), 0, 'Unrelated mutations must not inspect editors');
    // Native draft transitions must restore editable controls and leave the draft fieldset enabled.
    await page.evaluate(() => nativeDraft());
    await page.waitForFunction(() => !editor.getReadOnly() && !document.querySelector('#name').readOnly);
    assert.equal(await page.evaluate(() => document.querySelector('fieldset').disabled), false);
    // Editable synthetic drafts still accept normal mouse/keyboard interaction.
    await page.locator('#name').fill('Synthetic Draft Name');
    await page.locator('#code').click({position:{x:110,y:20}});
    await page.keyboard.type('DRAFT EDIT');
    assert.notEqual(await page.evaluate(() => editor.getValue()), await page.evaluate(() => codeValue));
    await page.evaluate(() => {editor.setValue(codeValue,-1);document.querySelector('#name').value='Fixture Name';});
    await page.evaluate(() => nativePublished());
    await page.waitForFunction(() => editor.getReadOnly() && !document.querySelector('fieldset').disabled);
    // Turning off returns the exact native lock configuration, including inline style absence.
    await worker.evaluate(() => chrome.storage.local.set({fittingDetailsEnabled:false}));
    await page.waitForFunction(() => document.querySelector('fieldset').disabled && !editor.getReadOnly());
    assert.equal(await page.evaluate(() => document.querySelector('#flowItem_contentEdit').style.pointerEvents), '');
    assert.equal(await page.evaluate(() => document.querySelector('#custom').inert), false);
    assert.equal(await page.evaluate(() => document.querySelector('#check').disabled), false);
    assert.equal(await page.evaluate(() => document.querySelector('#late-field').readOnly), false);
    assert.equal(await page.evaluate(() => getComputedStyle(document.querySelector('#flowItem_contentEdit')).opacity), '0.4', 'Native dimming returns on opt-out');
    assert.equal(await page.evaluate(() => document.querySelector('#flowItem_contentEdit').style.opacity), '', 'No opacity override remains');
    // An original inline opacity and its priority return exactly when viewing stops.
    await page.evaluate(() => document.querySelector('#flowItem_contentEdit').style.setProperty('opacity','0.65','important'));
    await worker.evaluate(() => chrome.storage.local.set({fittingDetailsEnabled:true}));
    await page.waitForFunction(() => !document.querySelector('fieldset').disabled && getComputedStyle(document.querySelector('#flowItem_contentEdit')).opacity === '1');
    await worker.evaluate(() => chrome.storage.local.set({fittingDetailsEnabled:false}));
    await page.waitForFunction(() => document.querySelector('fieldset').disabled);
    assert.deepEqual(await page.evaluate(() => {const p=document.querySelector('#flowItem_contentEdit');return [p.style.opacity,p.style.getPropertyPriority('opacity')];}), ['0.65','important']);
    await page.evaluate(() => document.querySelector('#flowItem_contentEdit').style.removeProperty('opacity'));
    // A newer native opacity must not be overwritten by stale restoration snapshots.
    await worker.evaluate(() => chrome.storage.local.set({fittingDetailsEnabled:true}));
    await page.waitForFunction(() => !document.querySelector('fieldset').disabled);
    await page.evaluate(() => document.querySelector('#flowItem_contentEdit').style.opacity='0.75');
    await worker.evaluate(() => chrome.storage.local.set({fittingDetailsEnabled:false}));
    await page.waitForFunction(() => document.querySelector('fieldset').disabled);
    assert.equal(await page.evaluate(() => document.querySelector('#flowItem_contentEdit').style.opacity), '0.75');
    await page.evaluate(() => document.querySelector('#flowItem_contentEdit').style.removeProperty('opacity'));
    // Preserve an editor that was already read-only before the feature took ownership.
    await page.evaluate(() => editor.setReadOnly(true));
    await worker.evaluate(() => chrome.storage.local.set({fittingDetailsEnabled:true}));
    await page.waitForFunction(() => !document.querySelector('fieldset').disabled);
    await worker.evaluate(() => chrome.storage.local.set({fittingDetailsEnabled:false}));
    await page.waitForFunction(() => document.querySelector('fieldset').disabled);
    assert.equal(await page.evaluate(() => editor.getReadOnly()), true);
    await page.evaluate(() => editor.setReadOnly(false));
    // The saved opt-in also works on a direct reload, with no popup interaction required.
    await worker.evaluate(() => chrome.storage.local.set({fittingDetailsEnabled:true}));
    await page.reload();
    await page.waitForFunction(() => window.editor?.getReadOnly() && !document.querySelector('fieldset').disabled);
    // Missing/unsupported Ace bindings fail closed instead of unlocking unknown editors.
    await worker.evaluate(() => chrome.storage.local.set({fittingDetailsEnabled:false}));
    await page.waitForFunction(() => document.querySelector('fieldset').disabled);
    await page.evaluate(() => { document.querySelector('#code').env=null; });
    await worker.evaluate(() => chrome.storage.local.set({fittingDetailsEnabled:true}));
    await page.waitForFunction(() => document.querySelector('fieldset').disabled);
    assert.equal(await page.evaluate(() => getComputedStyle(document.querySelector('#flowItem_contentEdit')).pointerEvents), 'none');
    // Other routes cannot inherit view mode even if native fitting nodes remain mounted.
    await page.goto(site + '/fixture/app/all-accounts/Ellucian/data-connect/home');
    await page.waitForFunction(() => window.editor && window.__settings.length);
    assert.equal(await page.evaluate(() => document.querySelector('fieldset').disabled), true);
    const finalStore = await worker.evaluate(() => chrome.storage.local.get(null));
    const strip = data => { const copy={...data};delete copy.fittingDetailsEnabled;return copy; };
    assert.deepEqual(strip(finalStore), strip(initialStore), 'Only the new preference may be written');
    assert.ok(requests.every(url => url === site + '/fixture-ace.js' || url === site + designer || url.endsWith('/data-connect/home')), 'No service requests');
    assert.deepEqual(errors, []);
    console.log('PASS published fitting details: undimmed read-only view, original/native opacity restoration, real Ace copy/scroll, mutation protection, native drafts, opt-out, unsupported editor, route isolation, no data writes/service calls');
  } finally {
    // Close only the disposable context; leave recovery artifacts available for inspection.
    try { await context?.close(); }
    finally {
      // Refuse a broader path or link before removing this test's temporary profile.
      if (path.dirname(profile) !== temporaryRoot || !path.basename(profile).startsWith('navigator-fitting-test-') ||
        fs.existsSync(profile) && fs.lstatSync(profile).isSymbolicLink()) throw new Error('Unexpected disposable profile path.');
      fs.rmSync(profile, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 });
    }
  }
})().catch(error => { console.error(error); process.exitCode=1; });
