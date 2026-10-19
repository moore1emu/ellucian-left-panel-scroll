(() => {
  'use strict';
  // Configuration owns no secrets and never changes the saved Git credential revision.
  const $=id=>document.getElementById(id);
  const editor=$('location-json'),fields=$('location-fields'),status=$('location-settings-status');
  let saved=null,staged=null,currentContext=null,busy=false,dirty=false,packagesVisible=false,loadRevision=0;
  let activeKind='designer',syncing=false,automaticSuffix=true;
  const ids=['designer-folder','api-folder','include-draft','include-published','include-source','config-formatted','separate-states','formatted-layout'];
  // Bundle editor modules locally; disabling the worker first avoids dynamic blob/script requests.
  const code=ace.edit('json-code',{useWorker:false,fontSize:13,tabSize:2,useSoftTabs:true,showPrintMargin:false,showFoldWidgets:true,fadeFoldWidgets:false,displayIndentGuides:true,enableKeyboardAccessibility:true});
  code.session.setMode('ace/mode/json');
  code.textInput.getElement().setAttribute('aria-label','Folder Config JSON');
  code.textInput.getElement().setAttribute('aria-describedby','location-settings-status');
  const theme=matchMedia('(prefers-color-scheme:dark)');
  function applyTheme(){code.setTheme(theme.matches?'ace/theme/tomorrow_night':'ace/theme/chrome');}
  theme.addEventListener('change',applyTheme);applyTheme();
  new ResizeObserver(()=>code.resize()).observe($('json-code'));
  document.querySelector('.manual-config').addEventListener('toggle',()=>code.resize());
  function notice(text,error=false){status.textContent=text;status.dataset.error=String(error);code.textInput.getElement().setAttribute('aria-invalid',String(error));}
  function setText(value){
    editor.value=JSON.stringify(value,null,2);
    if(code.getValue()===editor.value)return;
    syncing=true;try{code.setValue(editor.value,-1);}finally{syncing=false;}
  }
  function tenantKey(value){
    return Object.keys(value.tenants).find(key=>key.slice(-36).toLowerCase()===currentContext?.tenantId?.toLowerCase());
  }
  function view(value){
    const result=GitLocations.visible(value,packagesVisible);
    if(currentContext?.tenantId){
      const defaults=GitLocations.defaults(currentContext.tenantId,currentContext.environment,packagesVisible);
      const key=tenantKey(result)||Object.keys(defaults)[0];
      result.tenants[key]||={};
      // Show supported defaults without replacing existing overrides or hidden Packages data.
      for(const [area,card] of Object.entries(Object.values(defaults)[0])){
        const prior=result.tenants[key][area];
        result.tenants[key][area]=typeof prior==='string'?{...card,folder:prior}:{...card,...prior};
      }
      // Keep supported card sections in a predictable order even after API-only setup happened first.
      result.tenants[key]=Object.fromEntries(Object.values(GitLocations.sources).filter(area=>Object.hasOwn(result.tenants[key],area)).map(area=>[area,result.tenants[key][area]]));
    }
    return result;
  }
  function options(value){return GitLocations.card(value,currentContext.tenantId,currentContext.environment,activeKind);}
  function sampleEntries(){
    if(activeKind!=='designer')return [{packageName:'Example Package',name:activeKind==='api-designer'?'example-api':'example-pipeline',type:'api',version:'1.0.0',state:'published'}];
    const choices=GitLocations.preferences(options(staged));
    return [{packageName:'Example Package',name:'student-sync',type:'pipeline',version:'1.0.0',state:'published'},{packageName:'Example Package',name:'address-cleanup',type:'pipeline',version:'Draft',state:'draft'}].filter(entry=>choices.exportVersions[entry.state]);
  }
  function render(){
    if(!staged||!currentContext?.tenantId){$('staged-tree').textContent='Open Export Configuration from a source export to select its tenant.';return;}
    const card=options(staged);
    const designer=GitLocations.card(staged,currentContext.tenantId,currentContext.environment,'designer');
    const api=GitLocations.card(staged,currentContext.tenantId,currentContext.environment,'api-designer');
    $('designer-folder').value=activeKind==='packages'?card.folder:designer.folder;
    $('api-folder').value=api.folder;
    const prefs=GitLocations.preferences(designer);
    for(const [id,value] of Object.entries({'include-draft':prefs.exportVersions.draft,'include-published':prefs.exportVersions.published,'include-source':prefs.exportFileTypes.source,'config-formatted':prefs.exportFileTypes.formatted,'separate-states':prefs.folderStructure.separateDraftAndPublished,'formatted-layout':prefs.folderStructure.separateSourceAndFormatted}))$(id).checked=value;
    // The preview is explicitly illustrative; only Export shows metadata for the actual selected records.
    try{$('staged-tree').textContent=GitLocations.tree(PipelineExportSession.paths(sampleEntries(),false,activeKind==='designer'?prefs:null).map(path=>card.folder+'/'+path));}
    catch{$('staged-tree').textContent='Correct the configuration to preview folders.';}
    $('preview-state').textContent=dirty?'Unsaved preview · example files':'Saved/default preview · example files';
  }
  function selectCard(kind){
    activeKind=kind;
    for(const tab of document.querySelectorAll('.card-tabs [role="tab"]')){
      const active=tab.dataset.kind===kind;tab.setAttribute('aria-selected',String(active));tab.tabIndex=active?0:-1;
    }
    $('designer-settings').hidden=kind==='api-designer';
    $('api-settings').hidden=kind!=='api-designer';
    document.querySelector('.folder-grid').hidden=kind!=='designer';
    render();
  }
  for(const [id,kind]of [['designer-settings-tab','designer'],['api-settings-tab','api-designer']])$(id).dataset.kind=kind;
  document.querySelector('.card-tabs').addEventListener('click',event=>{const tab=event.target.closest('[role="tab"]');if(tab)selectCard(tab.dataset.kind);});
  document.querySelector('.card-tabs').addEventListener('keydown',event=>{
    const tabs=[...document.querySelectorAll('.card-tabs [role="tab"]')],index=tabs.indexOf(document.activeElement);
    if(index<0)return;const next={ArrowRight:tabs[(index+1)%tabs.length],ArrowLeft:tabs[(index+tabs.length-1)%tabs.length],Home:tabs[0],End:tabs.at(-1)}[event.key];
    if(next){event.preventDefault();selectCard(next.dataset.kind);next.focus();}
  });
  function revealTab(){
    if(!packagesVisible||$('packages-settings-tab'))return;
    const tab=document.createElement('button');tab.id='packages-settings-tab';tab.type='button';tab.role='tab';tab.dataset.kind='packages';tab.textContent='Integration Packages';tab.setAttribute('aria-controls','designer-settings');tab.setAttribute('aria-selected','false');tab.tabIndex=-1;
    document.querySelector('.card-tabs').append(tab);
  }
  // Locate only the originating or sole extension export; do not read unrelated browsing tabs.
  async function context(){
    const local=globalThis.GitWorkspace?.context();if(local)return local;
    const base=chrome.runtime.getURL('pipeline-export.html'),current=await chrome.tabs.getCurrent();
    const tabs=(await chrome.tabs.query({url:base+'*'})).filter(tab=>tab.url===base||tab.url?.startsWith(base+'#'));
    const target=tabs.find(tab=>tab.id===current?.openerTabId)||(tabs.length===1?tabs[0]:null);
    if(!target)return null;
    try{return await chrome.runtime.sendMessage({type:'git-location-context',exportTabId:target.id});}catch{return null;}
  }
  async function load(){
    const revision=++loadRevision;busy=true;fields.disabled=true;code.setReadOnly(true);
    try{
      const value=await GitLocations.read(),nextContext=await context();
      if(revision!==loadRevision)return;
      saved=value;currentContext=nextContext;
      packagesVisible||=nextContext?.packagesConfirmed===true;revealTab();
      staged=view(saved);dirty=false;automaticSuffix=true;setText(staged);
      $('location-current-tenant').textContent=nextContext?nextContext.environment+': '+nextContext.tenantId:'No export selected';
      selectCard(nextContext?.sourceKind||activeKind);
      notice('Review your folders, then save to confirm this tenant and card.');
    }catch{saved=null;notice('Could not read export configuration. Reload Saved Config to retry.',true);}
    finally{if(revision===loadRevision){busy=false;fields.disabled=!saved||!FeatureTools.state.export;code.setReadOnly(fields.disabled);}}
  }
  code.session.on('change',()=>{
    if(syncing)return;
    editor.value=code.getValue();dirty=true;
    try{
      const value=GitLocations.validate(JSON.parse(editor.value));
      if(!packagesVisible&&Object.values(value.tenants).some(card=>Object.hasOwn(card,'IntegrationPackages')))throw Error();
      const prior=staged&&currentContext?GitLocations.preferences(GitLocations.card(staged,currentContext.tenantId,currentContext.environment,'designer')).filenameSuffixes.formatted:null;
      if(currentContext&&GitLocations.preferences(GitLocations.card(value,currentContext.tenantId,currentContext.environment,'designer')).filenameSuffixes.formatted!==prior)automaticSuffix=false;
      staged=value;render();notice('Unsaved changes. Save to apply.');
    }catch{notice('Correct the JSON before saving. Saved configuration is unchanged.',true);}
  });
  for(const id of ids)$(id).addEventListener(id.endsWith('-folder')?'input':'change',event=>{
    if(busy||!currentContext)return;
    try{
      const value=JSON.parse(editor.value),key=tenantKey(value);
      if(!key)throw Error();
      const area=GitLocations.sources[activeKind];
      let card=value.tenants[key][area];if(typeof card==='string')card=value.tenants[key][area]={folder:card};
      card.folder=$(activeKind==='api-designer'?'api-folder':'designer-folder').value;
      if(activeKind==='designer'){
        const prefs=GitLocations.preferences(card);
        prefs.exportVersions={draft:$('include-draft').checked,published:$('include-published').checked};
        prefs.exportFileTypes={source:$('include-source').checked,formatted:$('config-formatted').checked};
        prefs.folderStructure={separateDraftAndPublished:$('separate-states').checked,separateSourceAndFormatted:$('formatted-layout').checked};
        if(!prefs.exportVersions.draft&&!prefs.exportVersions.published||!prefs.exportFileTypes.source&&!prefs.exportFileTypes.formatted){event.target.checked=true;throw Error();}
        if(automaticSuffix)prefs.filenameSuffixes.formatted=prefs.exportFileTypes.source&&prefs.exportFileTypes.formatted&&!prefs.folderStructure.separateSourceAndFormatted?'_formatted':'';
        Object.assign(card,prefs);
      }
      dirty=true;setText(value);GitLocations.validate(value);staged=value;render();notice('Unsaved changes. Save to apply.');
    }catch{notice('Choose at least one version/file type and a safe folder. Saved settings are unchanged.',true);}
  });
  async function save(){
    if(busy||!saved)return;
    busy=true;fields.disabled=true;code.setReadOnly(true);
    try{
      const value=GitLocations.mergeVisible(JSON.parse(editor.value),structuredClone(saved),packagesVisible);
      const confirm=currentContext?{tenantId:currentContext.tenantId,environment:currentContext.environment,kind:activeKind}:undefined;
      const result=await chrome.runtime.sendMessage({type:'git-save-locations',expected:saved,value,confirm});
      if(!result?.ok)throw Error();
      saved=value;staged=view(value);dirty=false;setText(staged);render();notice('Export configuration saved. Review the destination on Export.');
      document.dispatchEvent(new Event('export-configuration-saved'));
    }catch{notice('Could not save. Correct the JSON, or reload if another tab changed it.',true);}
    finally{busy=false;fields.disabled=!FeatureTools.state.export;code.setReadOnly(fields.disabled);}
  }
  $('location-save').addEventListener('click',save);
  $('location-reset').addEventListener('click',()=>{
    if(busy||!saved||!currentContext)return;
    // Reset is staged and card-scoped; it cannot erase other tenant/card or hidden configuration.
    try{const value=JSON.parse(editor.value),key=tenantKey(value);value.tenants[key][GitLocations.sources[activeKind]]=Object.values(GitLocations.defaults(currentContext.tenantId,currentContext.environment,packagesVisible))[0][GitLocations.sources[activeKind]];staged=value;dirty=true;automaticSuffix=true;setText(value);render();notice('Defaults restored in preview. Save to apply.');}catch{notice('Correct the JSON before resetting.',true);}
  });
  $('location-reload').addEventListener('click',()=>{if(!busy&&(!dirty||confirm('Discard unsaved configuration edits?')))load();});
  FeatureTools.subscribe(state=>{fields.disabled=busy||!saved||!state.export;code.setReadOnly(fields.disabled);});
  document.addEventListener('export-context-ready',()=>{if(!dirty)load();});
  document.addEventListener('workspace-view',event=>{if(event.detail.view==='configuration'){code.resize();if(!dirty&&!busy)load();}});
  // A configuration reveal changes only UI; it never grants hidden source or provider access.
  document.addEventListener('keydown',event=>{
    if(!event.shiftKey||event.key.toLowerCase()!=='d'||event.ctrlKey||event.altKey||event.metaKey||event.repeat||event.isComposing||event.target.closest('input,textarea,select,[contenteditable]')||busy||!saved||!FeatureTools.state.export||packagesVisible)return;
    event.preventDefault();if(!confirm('Add IntegrationPackages to this configuration view? Save Export Configuration to keep changes. This does not grant source access.'))return;
    try{const value=GitLocations.mergeVisible(JSON.parse(editor.value),structuredClone(saved),false);packagesVisible=true;revealTab();staged=view(value);dirty=true;setText(staged);selectCard('packages');GitWorkspace.show('configuration');notice('Hidden source configuration revealed for this session. Save to keep folder choices.');}catch{notice('Correct the JSON before revealing additional configuration.',true);}
  });
  load();
})();
