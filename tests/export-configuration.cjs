'use strict';

// Exercise tenant/card settings and physical file plans using synthetic data only.
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');
const root=path.resolve(__dirname,'..');
const box={TextEncoder,Uint8Array,Uint32Array,DataView,Blob};
vm.createContext(box);
for(const name of ['git-provider.js','git-locations.js','pipeline-export-core.js','pipeline-export-session.js'])vm.runInContext(fs.readFileSync(path.join(root,name),'utf8'),box);
const locations=box.GitLocations;
const id='11111111-2222-4333-8444-555555555555';
const base={tenants:locations.defaults(id,'Example Test')};
const key=Object.keys(base.tenants)[0];
assert.equal(Object.hasOwn(base.tenants[key],'IntegrationPackages'),false);
assert.equal(base.tenants[key].IntegrationDesigner.folder,'Example Test/IntegrationDesigner');
assert.equal(base.tenants[key].IntegrationDesigner.exportFileTypes.formatted,true);
assert.equal(base.tenants[key].IntegrationDesigner.folderStructure.separateDraftAndPublished,false);
assert.equal(base.tenants[key].IntegrationDesigner.folderStructure.separateSourceAndFormatted,true);
const source={name:'Flow',code:'line1\nline2'};
const entries=['draft','published'].map(state=>({packageName:'Owned',name:'Flow',type:'pipeline',version:state==='draft'?'Draft':'1.0.4',state}));

(async()=>{
  for(const states of [false,true])for(const copies of [false,true])for(const types of [{source:true,formatted:true},{source:true,formatted:false},{source:false,formatted:true}]){
    const layout=JSON.parse(JSON.stringify(locations.preferences({})));
    layout.folderStructure.separateDraftAndPublished=states;
    layout.folderStructure.separateSourceAndFormatted=copies;
    layout.exportFileTypes=types;
    layout.filenameSuffixes.formatted=!copies&&types.source&&types.formatted?'_formatted':'';
    const value=JSON.parse(JSON.stringify(base));value.tenants[key].IntegrationDesigner={folder:'Test/Designer',...layout};
    locations.validate(value);
    let reads=0;
    const files=await box.PipelineExportSession.collectFiles(entries,{layout,read:async()=>{reads++;return source;},verify:async()=>{}});
    assert.equal(reads,2);
    assert.deepEqual(Array.from(files,f=>f.path).sort(),Array.from(box.PipelineExportSession.paths(entries,false,layout)).sort());
    assert.ok(files.some(f=>f.path.endsWith('Flow.json')||f.path.endsWith('Flow_formatted.json')));
    assert.ok(files.some(f=>f.path.includes('Flow_v1')));
    assert.equal(files.some(f=>f.path.startsWith('Draft/')),states);
    assert.equal(files.some(f=>f.path.includes('/Source/')),copies&&types.source);
    assert.equal(files.some(f=>f.path.includes('/Formatted/')),copies&&types.formatted);
    for(const file of files)if(file.path.includes('/Source/'))assert.equal(JSON.parse(new TextDecoder().decode(file.bytes)).code,source.code);
    const zip=Buffer.from(await (await box.PipelineExportSession.collect(entries,{layout,root:'Test/Designer',read:async()=>source,verify:async()=>{}})).arrayBuffer());
    assert.match(zip.subarray(30,30+zip.readUInt16LE(26)).toString(),/^Test\/Designer\//);
  }
  // Reject unsafe schema/suffixes/collisions before reading source contents.
  for(const invalid of [{filenameSuffixes:{source:'../escape'}},{exportVersions:{draft:false,published:false}},{exportFileTypes:{source:false,formatted:false}},{unknown:true}]){
    const value=JSON.parse(JSON.stringify(base));Object.assign(value.tenants[key].IntegrationDesigner,invalid);
    assert.throws(()=>locations.validate(value));
  }
  const collision=locations.preferences({folderStructure:{separateSourceAndFormatted:false},filenameSuffixes:{formatted:''}});
  await assert.rejects(()=>box.PipelineExportSession.collectFiles(entries,{layout:collision,read:async()=>{throw Error('must not read');},verify:async()=>{}}),/collide/);
  // A different readable label still matches only the UUID; changing one card invalidates only its signature.
  const renamed={tenants:{['Renamed: '+id]:base.tenants[key]}};
  assert.equal(locations.signature(renamed,id,'Example Test','designer'),locations.signature(base,id,'Example Test','designer'));
  const changed=JSON.parse(JSON.stringify(base));changed.tenants[key].APIDesigner.folder='Existing/API';
  assert.equal(locations.signature(changed,id,'Example Test','designer'),locations.signature(base,id,'Example Test','designer'));
  assert.notEqual(locations.signature(changed,id,'Example Test','api-designer'),locations.signature(base,id,'Example Test','api-designer'));
  console.log('PASS export configuration: tenant/card defaults, 12 layout combinations, preview/file/ZIP parity, unchanged Source bytes, suffix/schema/collision guards and independent confirmation signatures');
})().catch(error=>{console.error(error);process.exitCode=1;});
