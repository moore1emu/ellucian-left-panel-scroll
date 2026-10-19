'use strict';
// Exercise readable keys, exact-ID matching and destination rendering without real storage or services.
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');
const {webcrypto}=require('node:crypto');
const root=path.resolve(__dirname,'..');
let stored={tenants:{}};
const box={TextEncoder,crypto:webcrypto,chrome:{storage:{local:{get:async()=>({gitTenantLocations:stored})}}}};
vm.createContext(box);
for(const file of ['git-provider.js','git-locations.js','pipeline-export-core.js','pipeline-export-session.js']) vm.runInContext(fs.readFileSync(path.join(root,file),'utf8'),box);
const locations=box.GitLocations;
const id='11111111-2222-4333-8444-555555555555';
const other='aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee';
const config={provider:'github',repository:'example/fixture',branch:'exports',folder:'Legacy'};
const value={tenants:{['SaaSTest: '+id]:{IntegrationDesigner:'Test/IntegrationDesigner',IntegrationPackages:'Existing/IntegrationPackages'}}};
assert.equal(locations.destination(config,id,'SaaSTest','designer',value).folder,'Test/IntegrationDesigner');
assert.equal(locations.destination(config,other,'Production','designer',value).folder,'Production/IntegrationDesigner');
assert.equal(locations.destination(config,other,'Production Test','api-designer',value).folder,'Production Test/APIDesigner');
assert.equal(config.folder,'Legacy');
// Ordinary defaults and existing config views never advertise the hidden Packages source.
assert.equal(JSON.stringify(locations.defaults(id,'SaaSTest')).includes('IntegrationPackages'),false);
assert.equal(JSON.stringify(locations.visible(value,false)).includes('IntegrationPackages'),false);
assert.equal(JSON.stringify(locations.visible(value,true)).includes('IntegrationPackages'),true);
const ordinary={tenants:{['Renamed: '+id]:{IntegrationDesigner:'New/IntegrationDesigner'}}};
const merged=locations.mergeVisible(ordinary,value,false);
assert.equal(merged.tenants['Renamed: '+id].IntegrationPackages,'Existing/IntegrationPackages');
assert.equal(locations.mergeVisible({tenants:{}},value,false).tenants['SaaSTest: '+id].IntegrationPackages,'Existing/IntegrationPackages');
assert.throws(()=>locations.mergeVisible(value,value,false));
// Names never select identity; renamed readable prefixes and uppercase UUIDs still match the same ID.
const renamed={tenants:{['Different: '+id.toUpperCase()]:value.tenants['SaaSTest: '+id]}};
assert.equal(locations.destination(config,id,'New Name','packages',renamed).folder,'Existing/IntegrationPackages');
for(const folder of ['../escape','/root','a//b','a/.git','a/.github','a\\b','https://example.org','a/Trailing.']) assert.throws(()=>locations.validate({tenants:{['Test: '+id]:{IntegrationDesigner:folder}}}));
assert.throws(()=>locations.validate({tenants:{['One: '+id]:{IntegrationDesigner:'Same'},['Two: '+id]:{IntegrationDesigner:'Same'}}}));
const shared={tenants:{['Test: '+id]:{IntegrationDesigner:'Same'},['Prod: '+other]:{IntegrationDesigner:'Same'}}};
assert.doesNotThrow(()=>locations.validate(shared));
assert.throws(()=>locations.destination(config,'unknown','Test','designer',value));
assert.equal(locations.tree(['Test/Designer/Draft/A.json','Test/Designer/Published/A.json']),'Test/\n  Designer/\n    Draft/\n      A.json\n    Published/\n      A.json');
// Compare planned tree leaves with real generated physical files, without reading source contents twice.
(async()=>{
  const entries=[{packageName:'Package',name:'Flow',type:'pipeline',version:'1.0.0',state:'draft'},{packageName:'Package',name:'Flow',type:'pipeline',version:'1.0.0',state:'published'}];
  for(const formatted of [false,true]) {
    const files=await box.PipelineExportSession.collectFiles(entries,{formatted,verify:async()=>{},read:async()=>({name:'Flow',fittings:[]})});
    assert.deepEqual(Array.from(box.PipelineExportSession.paths(entries,formatted)).sort(),Array.from(files,file=>file.path).sort());
  }
  assert.equal(JSON.stringify(await locations.read()),'{"tenants":{}}');
  stored=value;
  assert.equal(JSON.stringify(await locations.read()),JSON.stringify(value));
  box.chrome.storage.local.get=async()=>{throw Error('read-failed');};
  await assert.rejects(()=>locations.read(),/read-failed/);
  console.log('PASS tenant locations: ID-only matching, readable names, independent/shared overrides, validation, storage failure, indented tree and actual file-layout parity');
})().catch(error=>{console.error(error);process.exitCode=1;});
