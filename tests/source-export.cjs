'use strict';

// Exercise only synthetic source contracts; no vendor requests or credentials are needed.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const root = path.resolve(__dirname,'..');
const box = { console,URL,TextEncoder,TextDecoder,Uint8Array,Uint32Array,DataView,Blob,Map,Set,Response,location:{href:'https://example.test/app/'},document:{} };
vm.createContext(box);
for (const file of ['pipeline-export-native.js','pipeline-export-core.js','pipeline-export-session.js','source-export-native.js','git-provider.js']) vm.runInContext(fs.readFileSync(path.join(root,file),'utf8'),box);

(async () => {
  const requests = []; let valid = true;
  const verify = () => { if (!valid) throw Error('changed'); };
  const rows = [1,2].map(major=>({apiName:'x-example',databaseQueryId:'query-'+major,version:major,semanticVersion:`${major}.0.1`}));
  const client = { async authenticatedEthosFetch(resource,options) {
    requests.push({resource,options});
    if (resource.startsWith('database-query-apis?')) {
      const offset=Number(new URL('https://example.test/'+resource).searchParams.get('offset'));
      return new Response(JSON.stringify(rows.slice(offset,offset+1)),{headers:{'X-Total-Count':'2'}});
    }
    const major=resource.endsWith('query-1')?1:2;
    return new Response(JSON.stringify({metaData:{resource:'x-example',semanticVersion:`${major}.0.1`},query:{sql:'synthetic'}}));
  } };
  const adapter=box.SourceExportNative.api(client,run=>run(),verify);
  const packages=await adapter.prepare();
  const plan=box.PipelineExportCore.buildSourcePlan(packages);
  assert.equal(plan.entries.length,2,'API majors must remain independent');
  assert.equal(requests.length,2,'Advance by returned rows, not the requested page size');
  await adapter.read(plan.entries[0]);
  assert.match(requests.at(-1).options.headers.Accept,/database-query-artifacts/);
  valid=false; await assert.rejects(()=>adapter.read(plan.entries[1]),/changed/); valid=true;

  // A repeated page cannot complete an inventory by counting duplicates toward its total.
  const repeated=box.SourceExportNative.api({authenticatedEthosFetch:async()=>new Response(JSON.stringify([rows[0]]),{headers:{'X-Total-Count':'2'}})},run=>run(),verify);
  await assert.rejects(()=>repeated.prepare(),/metadata-changed/);

  // Designer never substitutes draft content for a selected published version.
  const calls=[];
  const server={
    bP:async()=>({name:'Owned',pipelines:[{name:'Flow',version:'v1.0.0'},{name:'Flow',version:'v2.0.0'}]}),
    a$:async()=>[{name:'Owned',draft_pipelines:[{id:'draft-id',name:'Flow',status:'DRAFT',type:null}]}],
    V0:async(...args)=>{calls.push(['draft',...args]);return {content:JSON.stringify({name:'Flow',fittings:[]})};},
    B0:async(...args)=>{calls.push(['published',...args]);return {name:'Flow',version:args[0],fittings:[]};},
  };
  const designer=box.SourceExportNative.designer(server,'tenant',[{name:'Owned',version:'v1.0.0',nameAndExtension:'owned.json'}],run=>run(),verify,'both');
  const designerPlan=box.PipelineExportCore.buildSourcePlan(await designer.prepare());
  assert.equal(designerPlan.entries.length,3);
  for (const entry of designerPlan.entries) await designer.read(entry);
  assert.equal(calls.filter(x=>x[0]==='published').length,2);
  assert.equal(calls.filter(x=>x[0]==='draft').length,1);
  const files=await box.PipelineExportSession.collectFiles(designerPlan.entries,{read:entry=>designer.read(entry),verify,environment:'Synthetic'});
  assert.ok(files.some(f=>f.path==='Owned/Flow.json'));
  assert.ok(files.some(f=>f.path==='Owned/Flow_v1.json'));
  assert.ok(files.some(f=>f.path==='Owned/Flow_v2.json'));
  assert.ok(files.some(f=>f.path==='Owned/README.md'));
  assert.ok(box.PipelineExportCore.makeZip(files).size>0);

  // Reject edited drafts and cross-package IDs rather than exporting a changed selection.
  const changedDraft = box.SourceExportNative.designer({...server,
    a$:async()=>[{id:'package-a',name:'Owned',draft_pipelines:[{id:'draft-id',package_id:'package-a',name:'Flow',status:'DRAFT',updated_on:'first'}]}],
    V0:async()=>({id:'draft-id',updated_on:'second',content:{name:'Flow'}}),
  },'tenant',[],run=>run(),verify,'draft');
  const changedPlan=box.PipelineExportCore.buildSourcePlan(await changedDraft.prepare());
  await assert.rejects(()=>changedDraft.read(changedPlan.entries[0]),/metadata-changed/);
  const wrongPackage = box.SourceExportNative.designer({...server,
    a$:async()=>[{id:'package-a',name:'Owned',draft_pipelines:[{id:'draft-id',package_id:'package-b',name:'Flow',status:'DRAFT'}]}],
  },'tenant',[],run=>run(),verify,'draft');
  await assert.rejects(()=>wrongPackage.prepare(),/metadata-changed/);

  // The shared identity reader refuses unready or ambiguous state without touching other fields.
  const tenant='11111111-2222-4333-8444-555555555555';
  // Tenant-first destinations separate the fixed tools without rewriting the saved base configuration.
  const destination={provider:'github',repository:'example/export-fixture',branch:'main',folder:'DataConnect'};
  for(const [kind,suffix] of [['designer','DataConnect/Designer'],['packages','DataConnect/Packages'],['api-designer','APIDesigner']]){
    assert.equal(box.GitProvider.tenantDestination(destination,tenant,{},kind).folder,tenant+'/'+suffix);
  }
  assert.equal(destination.folder,'DataConnect');
  assert.throws(()=>box.GitProvider.tenantDestination(destination,'unknown',{},'designer'),/Verified tenant/);
  let state={tenant,tenantCheckStatus:'valid-tenant',tenantName:'Example',tenantLabel:'Example Test',tenantAlias:'example'};
  const store={getState:()=>state,dispatch:()=>{throw Error('Must not dispatch');},subscribe:()=>{throw Error('Must not subscribe');}};
  let node={isConnected:true,__reactFiber$fixture:{return:{memoizedProps:{value:{store}}}}};
  box.document.querySelector=()=>node;
  box.document.getElementById=()=>node;
  vm.runInContext(fs.readFileSync(path.join(root,'experience-identity.js'),'utf8'),box);
  assert.equal(box.ExperienceIdentity.read().tenantId,tenant);
  // A detached provider must be rediscovered even when the URL has not changed.
  node.isConnected=false;
  node={isConnected:true,__reactFiber$fixture:{return:{memoizedProps:{value:{store:{...store,getState:()=>({...state,tenant:'aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee'})}}}}}};
  assert.equal(box.ExperienceIdentity.read().tenantId,'aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee');
  node.isConnected=false;
  node={isConnected:true,__reactFiber$fixture:{return:{memoizedProps:{value:{store}}}}};
  state={...state,tenantCheckStatus:'loading'}; assert.equal(box.ExperienceIdentity.read(),null);
  state={...state,tenantCheckStatus:'valid-tenant',tenant:'other'}; assert.equal(box.ExperienceIdentity.read(),null);
  box.location.href+='next'; node.__reactFiber$fixture.return.return={memoizedProps:{value:{store:{...store}}}};
  assert.equal(box.ExperienceIdentity.read(),null);
  console.log('PASS source contracts: API pagination/majors, native export media, context change, repeated pages, Designer draft/published separation, ZIP/README, ready/ambiguous tenant state.');
})().catch(error=>{console.error(error);process.exitCode=1;});
