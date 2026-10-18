'use strict';

// Exercise group defaults and actual installed UI without accounts, credentials or live services.
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const os=require('node:os');
const vm=require('node:vm');
const {chromium}=require('playwright');
const extension=path.resolve(__dirname,'..');
const script=fs.readFileSync(path.join(extension,'feature-tools.js'),'utf8');

async function unit(){
  const listeners=[];const saved={favorites:{keep:true},designerOwnershipCache:{keep:true}};
  const box={chrome:{storage:{local:{get:async defaults=>({...defaults,...saved}),set:async values=>{
    Object.assign(saved,values);for(const listener of listeners)listener(Object.fromEntries(Object.entries(values).map(([key,newValue])=>[key,{newValue}])),'local');
  }},onChanged:{addListener:listener=>listeners.push(listener)}}}};
  vm.runInNewContext(script,box);await box.FeatureTools.ready;
  assert.deepEqual(JSON.parse(JSON.stringify(box.FeatureTools.state)),{navigation:true,export:false});
  await assert.rejects(()=>box.FeatureTools.requireExport(),/Enable Export Tools/);
  await box.FeatureTools.migrate({reason:'install'});assert.equal(saved.exportToolsEnabled,undefined);
  await box.FeatureTools.migrate({reason:'update',previousVersion:'2.1.9'});assert.equal(saved.exportToolsEnabled,undefined);
  await box.FeatureTools.migrate({reason:'update',previousVersion:'3.1.0'});assert.equal(saved.exportToolsEnabled,true);
  await box.chrome.storage.local.set({exportToolsEnabled:false});
  await box.FeatureTools.migrate({reason:'update',previousVersion:'3.1.0'});assert.equal(saved.exportToolsEnabled,false);
  assert.deepEqual(saved.favorites,{keep:true});assert.deepEqual(saved.designerOwnershipCache,{keep:true});
  // Read failures never make default groups available; authorization still fails closed.
  const broken={chrome:{storage:{local:{get:async()=>{throw Error('Synthetic read failure');}},onChanged:{addListener(){}}}}};
  vm.runInNewContext(script,broken);assert.equal(await broken.FeatureTools.ready,null);
  assert.equal(broken.FeatureTools.state.export,false);
  await assert.rejects(()=>broken.FeatureTools.requireExport(),/Synthetic read failure/);
  // One readiness event is enough; an untouched group must survive a newer asynchronous choice.
  let release;let changed;
  const delayed={chrome:{storage:{local:{get:()=>new Promise(resolve=>{release=resolve;})},onChanged:{addListener:listener=>{changed=listener;}}}}};
  vm.runInNewContext(script,delayed);let calls=0;delayed.FeatureTools.subscribe(()=>calls++);
  changed({exportToolsEnabled:{newValue:true}},'local');
  release({navigationToolsEnabled:false,exportToolsEnabled:false});await delayed.FeatureTools.ready;
  assert.equal(delayed.FeatureTools.state.navigation,false);assert.equal(delayed.FeatureTools.state.export,true);
  assert.equal(calls,2,'One live change and one merged initial result, without duplicate readiness');
}

(async()=>{
  await unit();
  const site='https://experience-test.elluciancloud.com';
  const tenant='11111111-2222-4333-8444-555555555555';
  const route='/fixture/app/all-accounts/Ellucian/data-connect/home';
  const html=`<!doctype html><style>[data-testid=master]{width:420px;height:650px}li{min-height:40px}</style>
    <div data-testid="master"><div id="home_title-packages">PACKAGES</div><div><ul role="tree"><li data-level="1" data-nodeid="owned" package-element><div class="MuiTreeItem-content"><span class="MuiTreeItem-label">Owned</span></div></li></ul></div></div>
    <main id="pipelineManager-main-customBlock"><h1 id="packageDetails-title">Package: Owned</h1></main><script>
      const pkg={name:'Owned',pipelines:[]};const row=document.querySelector('li');row.__reactProps$fixture={'package-element':pkg};
      row.__reactFiber$fixture={stateNode:{state:{menu:[{'package-element':pkg}]},context:{tenantId:'${tenant}',getJwt:()=>{throw Error('No credentials');}}}};
    </script>`;
  const tempRoot=fs.realpathSync(os.tmpdir());const profile=fs.mkdtempSync(path.join(tempRoot,'navigator-tools-test-'));
  let context;
  try{
    // Scope launch and cleanup to this owned synthetic profile, including assertion failures.
    context=await chromium.launchPersistentContext(profile,{headless:true,...(process.env.INTEGRATION_NAVIGATOR_BROWSER?{channel:process.env.INTEGRATION_NAVIGATOR_BROWSER}:{}),args:[`--disable-extensions-except=${extension}`,`--load-extension=${extension}`]});
    await context.route('**/*',r=>new URL(r.request().url()).protocol==='chrome-extension:'?r.continue():r.fulfill({contentType:'text/html',body:html}));
    const worker=context.serviceWorkers()[0]||await context.waitForEvent('serviceworker');
    await worker.evaluate(()=>pendingOwnershipUpdate);
    const key=JSON.stringify([site,tenant,'packages']);
    await worker.evaluate(({key})=>chrome.storage.local.set({favoritePackagesByTenant:{[key]:[{packageName:'Owned',packagePinned:true,pipelines:[],pipelinesExpanded:true}]},syntheticKeep:{source:'unchanged'},sharedFromEnabled:false}),{key});
    const source=await context.newPage();await source.goto(site+route);
    const popup=await context.newPage();await popup.setViewportSize({width:360,height:580});await popup.goto(`chrome-extension://${new URL(worker.url()).host}/popup.html`);
    const errors=[];popup.on('pageerror',e=>errors.push(e.message));source.on('pageerror',e=>errors.push(e.message));
    await popup.evaluate(()=>PopupTabs.select('general'));
    await popup.waitForFunction(()=>!document.querySelector('#navigation-tools-enabled').disabled);
    assert.equal(await popup.locator('#navigation-tools-enabled').isChecked(),true);
    assert.equal(await popup.locator('#export-tools-enabled').isChecked(),false);
    await source.locator('.ellucian-favorites-section').waitFor();
    const retained=await worker.evaluate(()=>chrome.storage.local.get(['favoritePackagesByTenant','syntheticKeep']));
    // Exercise every combination through the real user-facing controls, including same-document restoration.
    for(const [navigation,exports] of [[false,false],[false,true],[true,true],[true,false]]){
      if(await popup.locator('#navigation-tools-enabled').isChecked()!==navigation)await popup.locator('label[for="navigation-tools-enabled"]').click();
      await popup.waitForFunction(()=>!document.querySelector('#export-tools-enabled').disabled);
      if(await popup.locator('#export-tools-enabled').isChecked()!==exports)await popup.locator('label[for="export-tools-enabled"]').click();
      await popup.waitForFunction(()=>!document.querySelector('#navigation-tools-enabled').disabled);
      assert.deepEqual(await popup.locator('[role="tab"]:visible').allTextContents(),navigation?['General','Navigation','Sharing','Appearance','Sites','Export']:['General','Sites','Export']);
      if(!navigation){
        await popup.locator('#tab-general').press('ArrowRight');
        assert.equal(await popup.locator('#tab-sites').getAttribute('aria-selected'),'true');
        await popup.locator('#tab-sites').press('Home');
        assert.equal(await popup.locator('#tab-general').getAttribute('aria-selected'),'true');
      }
      await source.waitForFunction(expected=>Boolean(document.querySelector('.ellucian-favorites-section'))===expected,navigation);
      assert.equal(await source.locator('[data-ellucian-left-panel-scroll]').count()>0,navigation);
      await popup.evaluate(()=>PopupTabs.select('export'));
      assert.equal(await popup.locator('#pipeline-export-section').isVisible(),exports);
      assert.equal(await popup.locator('.git-connection-section').isVisible(),exports);
      assert.equal(await popup.locator('#export-shared-from').isEnabled(),true);
      assert.equal(await popup.locator('#import-favorites').isEnabled(),true);
      if(!navigation&&!exports){
        // Real backup export/import remains usable even when no tool group is enabled.
        const downloading=popup.waitForEvent('download');await popup.locator('#export-shared-from').click();
        const backup=fs.readFileSync(await (await downloading).path());
        await popup.locator('#backup-file').setInputFiles({name:'synthetic-backup.json',mimeType:'application/json',buffer:backup});
        await popup.locator('#confirm-backup').click();
        await popup.waitForFunction(()=>document.querySelector('#backup-status').textContent.startsWith('Backup imported.'));
        assert.deepEqual(await worker.evaluate(()=>chrome.storage.local.get(['navigationToolsEnabled','exportToolsEnabled'])),{navigationToolsEnabled:false});
      }
      // Hidden Packages never appears just because Export Tools was enabled.
      assert.equal(await popup.locator('#export-packages-option').evaluate(e=>e.hidden&&e.disabled),true);
      assert.deepEqual(await worker.evaluate(()=>chrome.storage.local.get(['favoritePackagesByTenant','syntheticKeep'])),retained);
      await popup.evaluate(()=>PopupTabs.select('general'));
    }
    // A direct worker call is denied while off, without creating another browser tab.
    await popup.evaluate(()=>PopupTabs.select('appearance'));
    await worker.evaluate(()=>chrome.storage.local.set({navigationToolsEnabled:false}));
    await popup.waitForFunction(()=>document.querySelector('#tab-general').getAttribute('aria-selected')==='true');
    assert.equal(await popup.evaluate(()=>document.activeElement.id),'tab-general');
    const before=context.pages().length;
    const blocked=await popup.evaluate(()=>chrome.runtime.sendMessage({type:'pipeline-export-open',sourceKind:'packages',packagesRevealed:true,overrideConfirmed:true}));
    assert.equal(blocked.ok,false);assert.equal(context.pages().length,before);
    assert.deepEqual(errors,[]);
    if(process.env.INTEGRATION_NAVIGATOR_SCREENSHOTS){
      // Requested images belong outside the shared source; ordinary test runs create none.
      const artifacts=path.resolve(process.env.INTEGRATION_NAVIGATOR_SCREENSHOTS);
      if(artifacts===extension||artifacts.startsWith(extension+path.sep))throw Error('Screenshots belong outside repository');
      fs.mkdirSync(artifacts,{recursive:true});await popup.screenshot({path:path.join(artifacts,'general-tools.png'),fullPage:true});
    }
    console.log('PASS tool groups: fresh defaults, upgrade opt-in preservation, all four combinations, live navigation restoration, saved pins unchanged, hidden Packages, independent backups and blocked worker launch.');
  }finally{
    // A failed close must still attempt cleanup of this exact owned temporary profile.
    try{if(context)await context.close();}finally{
      const resolved=fs.realpathSync(profile);if(path.dirname(resolved)!==tempRoot||!path.basename(resolved).startsWith('navigator-tools-test-'))throw Error('Unsafe profile cleanup');
      fs.rmSync(resolved,{recursive:true,force:true,maxRetries:8,retryDelay:250});
    }
  }
})().catch(e=>{console.error(e);process.exitCode=1;});
