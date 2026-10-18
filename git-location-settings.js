(() => {
  'use strict';
  // Keep non-secret path preferences outside the credential form and its fresh-token validation.
  const editor=document.getElementById('location-json');
  const fields=document.getElementById('location-fields');
  const status=document.getElementById('location-status');
  let saved=null;
  let busy=false;
  let dirty=false;
  let currentTenant=null;
  let currentContext=null;
  let packagesVisible=false;

  // Reveal only after explicit temporary consent; preserve unsaved ordinary edits when adding the hidden entry.
  function renderEditor(value) {
    const view=GitLocations.visible(value,packagesVisible);
    if (currentContext?.tenantId) {
      const key=Object.keys(view.tenants).find(key=>key.slice(-36).toLowerCase()===currentContext.tenantId.toLowerCase());
      try {
        const defaults=GitLocations.defaults(currentContext.tenantId,currentContext.environment,packagesVisible);
        if (!key) Object.assign(view.tenants,defaults);
        else if (packagesVisible && !Object.hasOwn(view.tenants[key],'IntegrationPackages')) view.tenants[key].IntegrationPackages=Object.values(defaults)[0].IntegrationPackages;
      } catch { status.textContent='Enter safe folder aliases for this environment.'; }
    }
    editor.value=JSON.stringify(view,null,2);
  }

  // Locate only our extension's original or sole export, never arbitrary browsing tabs.
  async function currentEnvironment() {
    const base=chrome.runtime.getURL('pipeline-export.html');
    const current=await chrome.tabs.getCurrent();
    const tabs=(await chrome.tabs.query({url:base+'*'})).filter(tab=>tab.url===base || tab.url?.startsWith(base+'#'));
    const target=tabs.find(tab=>tab.id===current?.openerTabId) || (tabs.length===1 ? tabs[0] : null);
    if (!target) return null;
    // This fixed message projects only the already-open export's display name and UUID.
    try { return await chrome.runtime.sendMessage({type:'git-location-context',exportTabId:target.id}); }
    catch { return null; }
  }

  // Existing overrides remain exact; the active environment is merely a suggested unsaved default entry.
  async function load() {
    busy=true; fields.disabled=true;
    try {
      saved=await GitLocations.read();
      const context=await currentEnvironment();
      currentContext=context;
      packagesVisible ||= context?.packagesConfirmed===true;
      currentTenant=/^[a-f\d]{8}(?:-[a-f\d]{4}){3}-[a-f\d]{12}$/iu.test(context?.tenantId) ? context.tenantId : null;
      document.getElementById('location-reset').hidden=!currentTenant;
      renderEditor(saved);
      dirty=false;
      status.textContent=Object.keys(saved.tenants).length || currentTenant ? 'Location changes do not require an access token.' : 'Using defaults. Open Edit Locations from an export to add its environment.';
    } catch { saved=null; status.textContent='Could not read locations. Reload this page to retry.'; }
    finally { busy=false; fields.disabled=!saved || !FeatureTools.state.export; }
  }

  // The worker serializes saves and rejects edits made against a newer whole-document snapshot.
  async function save(reset=false) {
    if (busy || !saved) return;
    if (reset && (!currentTenant || dirty && !confirm('Discard unsaved edits and use defaults for this tenant?'))) return;
    busy=true; fields.disabled=true;
    try {
      const value=reset ? structuredClone(saved) : GitLocations.mergeVisible(JSON.parse(editor.value),saved,packagesVisible);
      // Reset only the verified current environment, preserving other tenant mappings.
      if (reset) for (const key of Object.keys(value.tenants)) if (key.slice(-36).toLowerCase()===currentTenant.toLowerCase()) {
        if (!packagesVisible && Object.hasOwn(value.tenants[key],'IntegrationPackages')) value.tenants[key]={IntegrationPackages:value.tenants[key].IntegrationPackages};
        else delete value.tenants[key];
      }
      const result=await chrome.runtime.sendMessage({type:'git-save-locations',expected:saved,value});
      if (!result?.ok) throw Error('save-failed');
      saved=value; dirty=false;
      renderEditor(value);
      status.textContent='Locations saved. Existing exports will update; prepare a new Git comparison.';
    } catch(error) {
      status.textContent=error instanceof SyntaxError ? 'Invalid JSON. Check commas and quotation marks.' : error.message==='save-failed' ? 'Could not save. Reload Saved Locations if another tab changed them.' : 'Use unique Name: Tenant ID keys and safe relative folders.';
    } finally { busy=false; fields.disabled=!FeatureTools.state.export; }
  }
  document.getElementById('location-save').addEventListener('click',()=>save());
  document.getElementById('location-reset').addEventListener('click',()=>save(true));
  editor.addEventListener('input',()=>{dirty=true;status.textContent='Unsaved locations.';});
  document.getElementById('location-reload').addEventListener('click',()=>{
    if (!busy && (!dirty || confirm('Discard unsaved location edits?'))) load();
  });
  // Independent tool opt-out never clears saved paths or silently commits unfinished edits.
  FeatureTools.subscribe(state=>{fields.disabled=busy || !saved || !state.export;});
  // The hidden shortcut changes only this editor's visibility, not website access or export authorization.
  document.addEventListener('keydown',event=>{
    if (!event.shiftKey || event.key.toLowerCase()!=='d' || event.ctrlKey || event.altKey || event.metaKey || event.repeat || event.isComposing || event.target.closest('input,textarea,select,[contenteditable]') || busy || !saved || !FeatureTools.state.export || packagesVisible) return;
    event.preventDefault();
    if (!confirm('Add IntegrationPackages locations to this configuration view? Save Locations to keep path changes. This does not grant service access.')) return;
    try {
      const value=GitLocations.mergeVisible(JSON.parse(editor.value),saved,false);
      packagesVisible=true; renderEditor(value); dirty=true;
      document.getElementById('location-advanced').open=true;
      status.textContent='IntegrationPackages is available in this configuration. Save Locations to keep changes.';
    } catch { status.textContent='Correct the JSON before revealing additional locations.'; }
  });
  // Native fragment navigation makes the one editor discoverable without adding a second setup surface.
  document.getElementById('git-open-locations').addEventListener('click',()=>{document.getElementById('location-advanced').open=true;});
  if (['#locations','#location-advanced'].includes(location.hash)) document.getElementById('location-advanced').open=true;
  load();
})();
