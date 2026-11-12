(() => {
  'use strict';
  // Store only explicit folder preferences, never credentials or exported definition contents.
  const KEY = 'gitTenantLocations';
  const CONFIRM_KEY = 'gitExportConfirmations';
  const uuid = '[a-f\\d]{8}(?:-[a-f\\d]{4}){3}-[a-f\\d]{12}';
  const identity = new RegExp('^' + uuid + '$','iu');
  const label = new RegExp('^.+: (' + uuid + ')$','iu');
  const sources = {designer:'IntegrationDesigner',packages:'IntegrationPackages','api-designer':'APIDesigner'};
  const fail = () => { throw new Error('Invalid export locations. Use unique Name: Tenant ID keys and safe relative folders.'); };

  // Retain the provider's dedicated-folder restrictions rather than allowing traversal or Git internals.
  function path(value) {
    if (typeof value !== 'string' || !value || value.length > 500 || value !== value.trim() || value.split('/').some(part=>!(/^[\p{L}\p{N}_][\p{L}\p{N} ._-]{0,99}$/u.test(part)) || /[. ]$/u.test(part) || /^(?:\.git|\.github|\.gitlab)$/iu.test(part))) fail();
    return value;
  }

  // Validate the entire JSON before saving; display-name edits never alter ID-only matching.
  function validate(value) {
    if (!value || typeof value !== 'object' || Array.isArray(value) || Object.keys(value).length!==1 || !value.tenants || typeof value.tenants !== 'object' || Array.isArray(value.tenants)) fail();
    const ids = new Set();
    for (const [key,mapping] of Object.entries(value.tenants)) {
      const match = key.match(label);
      if (!match || key.length>250 || ids.has(match[1].toLowerCase()) || !mapping || typeof mapping!=='object' || Array.isArray(mapping) || !Object.keys(mapping).length) fail();
      ids.add(match[1].toLowerCase());
      for (const [source,card] of Object.entries(mapping)) {
        if (!Object.values(sources).includes(source)) fail();
        // Accept existing path-only records without rewriting them until an explicit save.
        if (typeof card==='string') { path(card); continue; }
        if (!card || typeof card!=='object' || Array.isArray(card)) fail();
        const sections={exportVersions:['draft','published'],exportFileTypes:['source','formatted'],folderStructure:['separateDraftAndPublished','separateSourceAndFormatted'],filenameSuffixes:['draft','published','source','formatted']};
        if (Object.keys(card).some(key=>key!=='folder' && (source!=='IntegrationDesigner' || !Object.hasOwn(sections,key)))) fail();
        if (card.folder!==undefined) path(card.folder);
        for (const [section,keys] of Object.entries(sections)) {
          if (card[section]===undefined) continue;
          if (!card[section] || typeof card[section]!=='object' || Array.isArray(card[section]) || Object.keys(card[section]).some(key=>!keys.includes(key))) fail();
          for (const value of Object.values(card[section])) if (section==='filenameSuffixes' ? typeof value!=='string' || value.length>80 || !/^[\p{L}\p{N}_.-]*$/u.test(value) : typeof value!=='boolean') fail();
        }
        if (source==='IntegrationDesigner') {
          const options=preferences(card);
          if (!options.exportVersions.draft && !options.exportVersions.published || !options.exportFileTypes.source && !options.exportFileTypes.formatted) fail();
          if (!options.folderStructure.separateSourceAndFormatted && options.exportFileTypes.source && options.exportFileTypes.formatted && options.filenameSuffixes.source===options.filenameSuffixes.formatted) fail();
        }
      }
    }
    return value;
  }

  // A missing preference uses names from the already verified source snapshot, with ID fallback.
  function defaults(tenantId, environment, includePackages = false) {
    if (!identity.test(tenantId)) throw new Error('Verified tenant identity is unavailable. Reopen export.');
    const name = typeof environment==='string' && environment.trim() ? environment.trim() : tenantId;
    // Keep hidden Packages out of generated configuration until a temporary Shift+D confirmation.
    return {[`${name===tenantId ? 'Tenant' : name}: ${tenantId}`]:Object.fromEntries(Object.entries(sources).filter(([kind])=>includePackages || kind!=='packages').map(([,source])=>[source,{folder:path(`${name}/${source}`),...(source==='IntegrationDesigner' ? preferences({}) : {})}]))};
  }

  // Resolve only the requested ID; identical destination folders across tenants are an explicit owner choice.
  function destination(config, tenantId, environment, kind, value) {
    if (!identity.test(tenantId) || !Object.hasOwn(sources,kind)) throw new Error('Verified tenant identity is unavailable. Reopen export.');
    const mapping = Object.entries(validate(value).tenants).find(([key])=>key.match(label)[1].toLowerCase()===tenantId.toLowerCase())?.[1];
    const card=mapping?.[sources[kind]] ?? Object.values(defaults(tenantId,environment,kind==='packages'))[0][sources[kind]];
    const folder=typeof card==='string' ? card : card.folder ?? Object.values(defaults(tenantId,environment,kind==='packages'))[0][sources[kind]].folder;
    return GitProvider.config({...config,folder:path(folder)});
  }

  // Read failures remain failures: never silently fall back to defaults after a storage error.
  async function read() {
    return validate((await chrome.storage.local.get({[KEY]:{tenants:{}}}))[KEY]);
  }

  // Hide existing Packages overrides without deleting them or exposing them in an ordinary editor session.
  function visible(value, includePackages) {
    const result=JSON.parse(JSON.stringify(validate(value)));
    if (!includePackages) for (const [key,mapping] of Object.entries(result.tenants)) {
      delete mapping.IntegrationPackages;
      if (!Object.keys(mapping).length) delete result.tenants[key];
    }
    return result;
  }

  // Save ordinary edits without erasing hidden paths, even when the readable prefix was renamed or removed.
  function mergeVisible(value, previous, includePackages) {
    const result=validate(value);
    if (includePackages) return result;
    if (Object.values(result.tenants).some(mapping=>Object.hasOwn(mapping,'IntegrationPackages'))) fail();
    for (const [key,mapping] of Object.entries(validate(previous).tenants)) {
      if (!Object.hasOwn(mapping,'IntegrationPackages')) continue;
      const id=key.match(label)[1].toLowerCase();
      const target=Object.keys(result.tenants).find(key=>key.match(label)[1].toLowerCase()===id) || key;
      result.tenants[target] ||= {};
      result.tenants[target].IntegrationPackages=mapping.IntegrationPackages;
    }
    return validate(result);
  }

  // Merge shared ancestors into an indented text tree, with no branch lines or repeated parent paths.
  function tree(files) {
    const root = new Map();
    for (const file of files) {
      let children = root;
      for (const part of file.split('/')) {
        if (!children.has(part)) children.set(part,new Map());
        children = children.get(part);
      }
    }
    const lines = [];
    function append(children,depth) {
      for (const [name,nested] of children) {
        lines.push('  '.repeat(depth)+name+(nested.size ? '/' : ''));
        if (nested.size) append(nested,depth+1);
      }
    }
    append(root,0);
    return lines.join('\n');
  }
  // Keep: configuration defaults are per tenant/card, independent of credentials or source authority (3.1.4).
  function preferences(card={}) {
    const versions={draft:true,published:true,...card.exportVersions};
    const types={source:true,formatted:true,...card.exportFileTypes};
    const folders={separateDraftAndPublished:false,separateSourceAndFormatted:true,...card.folderStructure};
    return {exportVersions:versions,exportFileTypes:types,folderStructure:folders,filenameSuffixes:{draft:'',published:'',source:'',formatted:types.source && types.formatted && !folders.separateSourceAndFormatted ? '_formatted' : '',...card.filenameSuffixes}};
  }
  function card(value,tenantId,environment,kind) {
    const mapping=Object.entries(validate(value).tenants).find(([key])=>key.match(label)[1].toLowerCase()===tenantId.toLowerCase())?.[1];
    const configured=mapping?.[sources[kind]];
    const fallback=Object.values(defaults(tenantId,environment,kind==='packages'))[0][sources[kind]];
    return typeof configured==='string' ? {...fallback,folder:configured} : {...fallback,...configured};
  }
  function signature(value,tenantId,environment,kind) {
    const item=card(value,tenantId,environment,kind);
    return JSON.stringify({folder:item.folder,...(kind==='designer' ? preferences(item) : {})});
  }
  globalThis.GitLocations = Object.freeze({KEY,CONFIRM_KEY,sources,validate,defaults,destination,read,visible,mergeVisible,tree,preferences,card,signature});
})();
