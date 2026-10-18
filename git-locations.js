(() => {
  'use strict';
  // Store only explicit folder preferences, never credentials or exported definition contents.
  const KEY = 'gitTenantLocations';
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
      for (const [source,folder] of Object.entries(mapping)) {
        if (!Object.values(sources).includes(source)) fail();
        path(folder);
      }
    }
    return value;
  }

  // A missing preference uses names from the already verified source snapshot, with ID fallback.
  function defaults(tenantId, environment) {
    if (!identity.test(tenantId)) throw new Error('Verified tenant identity is unavailable. Reopen export.');
    const name = typeof environment==='string' && environment.trim() ? environment.trim() : tenantId;
    return {[`${name===tenantId ? 'Tenant' : name}: ${tenantId}`]:Object.fromEntries(Object.values(sources).map(source=>[source,path(`${name}/${source}`)]))};
  }

  // Resolve only the requested ID; identical destination folders across tenants are an explicit owner choice.
  function destination(config, tenantId, environment, kind, value) {
    if (!identity.test(tenantId) || !Object.hasOwn(sources,kind)) throw new Error('Verified tenant identity is unavailable. Reopen export.');
    const mapping = Object.entries(validate(value).tenants).find(([key])=>key.match(label)[1].toLowerCase()===tenantId.toLowerCase())?.[1];
    const folder = mapping?.[sources[kind]] ?? Object.values(defaults(tenantId,environment))[0][sources[kind]];
    return GitProvider.config({...config,folder:path(folder)});
  }

  // Read failures remain failures: never silently fall back to defaults after a storage error.
  async function read() {
    return validate((await chrome.storage.local.get({[KEY]:{tenants:{}}}))[KEY]);
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
  globalThis.GitLocations = Object.freeze({KEY,sources,validate,defaults,destination,read,tree});
})();
