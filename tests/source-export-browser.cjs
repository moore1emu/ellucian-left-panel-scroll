'use strict';

// Test installed source/worker/export wiring against synthetic pages, never a signed-in browser.
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const os=require('node:os');
const {chromium}=require('playwright');
const extension=path.resolve(__dirname,'..');
const site='https://experience-test.elluciancloud.com';
const tenant='11111111-2222-4333-8444-555555555555';
const html=`<!doctype html><div role="main" id="pipelineManager-main-customBlock"><h1>Fixture</h1></div><script>
const tenant='${tenant}'; window.fixtureStats={metadata:0,reads:0};
window.fixtureState={tenant,tenantCheckStatus:'valid-tenant',tenantName:'ExampleTest',tenantLabel:'Example Test',tenantAlias:'fixture'};
const store={getState:()=>window.fixtureState,dispatch:()=>{throw Error('No state writes');},subscribe:()=>{throw Error('No subscriptions');}};
const server={a$:async()=>[{name:'Owned',draft_pipelines:[{name:'Flow',id:'draft-id',type:null,status:'DRAFT'}]}],bP:async()=>({name:'Owned',pipelines:[{name:'Flow',version:'v1.0.4'},{name:'Flow',version:'v2.0.5'}]}),V0:async()=>{fixtureStats.reads++;return {content:JSON.stringify({name:'Flow',fittings:[]})};},B0:async(version)=>{fixtureStats.reads++;return {name:'Flow',version,fittings:[]};}};
const manager={state:{currentTenant:tenant,packageList:[{name:'Owned',nameAndExtension:'owned.json',version:'v1.0.0'}]}};
const client={authenticatedEthosFetch:async(resource)=>{if(resource.startsWith('database-query-apis?')){fixtureStats.metadata++;return new Response(JSON.stringify([1,2].map(v=>({apiName:'x-example',databaseQueryId:'query-'+v,version:v,semanticVersion:v+'.0.1'}))),{headers:{'X-Total-Count':'2'}});}fixtureStats.reads++;return new Response(JSON.stringify({metaData:{resource:'x-example',semanticVersion:resource.endsWith('query-1')?'1.0.1':'2.0.1'},query:{name:'synthetic'}}));}};
document.querySelector('[role="main"]').__reactFiber$fixture={memoizedProps:{data:client},return:{stateNode:manager,return:{memoizedProps:{value:{store}}}}};
window.webpackChunkdata_connect_designer=[];window.webpackChunkdata_connect_designer.push=entry=>entry[2](key=>key==='./src/server/ServerHelper.js'?server:{});
</script>`;

(async()=>{
  const tempRoot=fs.realpathSync(os.tmpdir());
  const profile=fs.mkdtempSync(path.join(tempRoot,'navigator-sources-test-'));
  let context;
  try {
    context=await chromium.launchPersistentContext(profile,{headless:true,...(process.env.INTEGRATION_NAVIGATOR_BROWSER?{channel:process.env.INTEGRATION_NAVIGATOR_BROWSER}:{}),args:[`--disable-extensions-except=${extension}`,`--load-extension=${extension}`]});
    await context.route('**/*',route=>{
      const url=new URL(route.request().url());
      if(url.protocol==='chrome-extension:')return route.continue();
      assert.equal(url.origin,site,'No live provider or institution request');
      return route.fulfill({contentType:'text/html',body:html});
    });
    const worker=context.serviceWorkers()[0]||await context.waitForEvent('serviceworker');
    await worker.evaluate(()=>chrome.storage.local.set({navigationToolsEnabled:false,exportToolsEnabled:true}));
    const id=new URL(worker.url()).host;
    const source=await context.newPage();
    const popup=await context.newPage();
    const errors=[];popup.on('pageerror',e=>errors.push(e.message));
    for(const kind of ['api-designer','designer']){
      await source.goto(site+'/fixture/app/all-accounts/Ellucian/'+(kind==='designer'?'data-connect-designer/':'APIDesigner/'));
      await popup.goto(`chrome-extension://${id}/popup.html`);
      await source.bringToFront();
      await popup.evaluate(async()=>{await PopupTabs.refreshContext();PopupTabs.select('export');});
      await popup.waitForFunction(()=>!document.querySelector('#export-pipelines').disabled);
      assert.equal(await popup.locator('#export-source').inputValue(),kind);
      assert.equal(await popup.locator('#export-packages-option').evaluate(e=>e.disabled&&e.hidden),true);
      // Retain requested visual checks outside the shared repository; normal runs create no images.
      const artifacts=process.env.INTEGRATION_NAVIGATOR_SCREENSHOTS;
      if(artifacts){
        const target=path.resolve(artifacts);
        if(target===extension||target.startsWith(extension+path.sep))throw Error('Screenshots belong outside repository');
        fs.mkdirSync(target,{recursive:true});
        await popup.screenshot({path:path.join(target,kind+'-settings.png'),fullPage:true});
      }
      const opened=context.waitForEvent('page');
      await popup.evaluate(()=>document.querySelector('#export-pipelines').click());
      const exported=await opened;
      exported.on('pageerror',e=>errors.push(e.message));
      await exported.waitForFunction(()=>document.querySelector('#export-status').textContent.startsWith('Preview ready'));
      assert.equal(await source.evaluate(()=>fixtureStats.reads),0,'Preview must not read definitions');
      assert.match(await exported.locator('#export-counts').innerText(),kind==='designer'?/3 of 3/:/2 of 2/);
      if(kind==='designer'){
        await exported.locator('details.export-package').first().locator('summary').click();
        assert.match(await exported.locator('table').innerText(),/Draft/);
        assert.match(await exported.locator('table').innerText(),/Published/);
      }
      if(artifacts)await exported.screenshot({path:path.join(path.resolve(artifacts),kind+'-preview.png'),fullPage:true});
      // Verify the existing ZIP path invokes each selected native reader once after user action.
      const download=exported.waitForEvent('download');
      await exported.locator('#download-zip').click();
      await download;
      assert.equal(await source.evaluate(()=>fixtureStats.reads),kind==='designer'?3:2);
      // A changed tenant invalidates even the already-prepared retry instead of exporting another tenant.
      await source.evaluate(()=>{fixtureState={...fixtureState,tenant:'aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee'};});
      await exported.locator('#save-zip').click();
      await exported.waitForFunction(()=>document.querySelector('#save-zip').hidden);
      await exported.close();
    }
    // One hidden gesture still needs confirmation, but no Shared From cache or second shortcut.
    await popup.bringToFront();
    await popup.locator('h1').click();
    popup.once('dialog',d=>d.dismiss());
    await popup.keyboard.press('Shift+D');
    assert.equal(await popup.locator('#export-packages-option').evaluate(e=>e.disabled||e.hidden),true);
    assert.equal(await popup.locator('#export-all-accessible').isChecked(),false);
    popup.once('dialog',d=>d.accept());
    await popup.keyboard.press('Shift+D');
    assert.equal(await popup.locator('#export-packages-option').evaluate(e=>e.disabled||e.hidden),false);
    assert.equal(await popup.locator('#export-all-accessible').isChecked(),true);
    // Turning off Export while a real preview is open retires the grant and clears prepared actions.
    await source.evaluate(()=>{fixtureState={...fixtureState,tenant:'11111111-2222-4333-8444-555555555555'};});
    await popup.selectOption('#export-source','designer');
    await source.bringToFront();
    await popup.evaluate(async()=>{await PopupTabs.refreshContext();});
    const opening=context.waitForEvent('page');
    await popup.evaluate(()=>document.querySelector('#export-pipelines').click());
    const active=await opening;
    await active.waitForFunction(()=>document.querySelector('#export-status').textContent.startsWith('Preview ready'));
    const reads=await source.evaluate(()=>fixtureStats.reads);
    await worker.evaluate(()=>chrome.storage.local.set({exportToolsEnabled:false}));
    await active.waitForFunction(()=>document.querySelector('#export-status').textContent==='Enable Export Tools in General.');
    assert.equal(await active.locator('#download-zip').isDisabled(),true);
    assert.equal(await active.locator('#save-zip').isHidden(),true);
    assert.equal(await source.evaluate(()=>fixtureStats.reads),reads);
    assert.deepEqual(errors,[]);
    console.log('PASS installed sources: API/Designer page gating, worker grants, no preview source reads, both API majors, separate drafts/published, complete ZIP and tenant-change retry revocation.');
  } finally {
    // Closing failure must not skip the owned-profile removal attempt.
    try{if(context)await context.close();}finally{
      const resolved=fs.realpathSync(profile);
      if(path.dirname(resolved)!==tempRoot||!path.basename(resolved).startsWith('navigator-sources-test-'))throw Error('Unsafe cleanup target');
      fs.rmSync(resolved,{recursive:true,force:true,maxRetries:8,retryDelay:250});
    }
  }
})().catch(error=>{console.error(error);process.exitCode=1;});
