'use strict';

// Validate serialized Git reservations and Experience registration against synthetic browser APIs.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const saved = { customSites: [], gitProviderOrigins: [], favorites: { keep: true } };
const listeners = [];
const registered = [];
const chrome = {
  runtime: { id: 'fixture', getURL: value => 'chrome-extension://fixture/' + value, getManifest: () => ({ content_scripts: [{ matches: ['https://experience.test/*'], js: ['content.js'], run_at: 'document_idle' }] }), onMessage: { addListener: listener => listeners.push(listener) } },
  storage: { local: { get: async defaults => ({ ...defaults, ...structuredClone(saved) }), set: async value => { await new Promise(resolve => setTimeout(resolve, 1)); Object.assign(saved, structuredClone(value)); } } },
  permissions: { getAll: async () => ({ origins: ['https://api.github.com/*', 'https://git.example.edu/*', 'https://vanity.example.edu/*'] }), contains: async () => true },
  scripting: { getRegisteredContentScripts: async () => [], registerContentScripts: async value => registered.push(...value), updateContentScripts: async () => {}, unregisterContentScripts: async () => {} },
};
const sandbox = { chrome, URL, TextEncoder, TextDecoder, Uint8Array, setTimeout, clearTimeout };
vm.createContext(sandbox);
for (const file of ['custom-sites.js', 'git-provider.js', 'git-permissions-worker.js']) vm.runInContext(fs.readFileSync(path.join(__dirname, '..', file), 'utf8'), sandbox);
const sender = { id: 'fixture', url: 'chrome-extension://fixture/git-connection.html', frameId: 0 };
const destination = provider => ({ provider, server: 'https://git.example.edu', repository: 'owner/repo', branch: 'exports', folder: 'DataConnect' });
const reserve = (provider, from = sender) => new Promise(resolve => {
  const accepted = listeners[0]({ type: 'git-reserve-server', config: destination(provider) }, from, resolve);
  if (!accepted) resolve(null);
});
(async () => {
  const result = await Promise.all([reserve('github'), reserve('gitlab')]);
  assert.equal(result.every(value => value.ok), true);
  assert.deepEqual(saved.gitProviderOrigins.sort(), ['https://api.github.com', 'https://git.example.edu']);
  for (const from of [{ ...sender, url: 'https://experience.test/' }, { ...sender, id: 'other' }, { ...sender, frameId: 1 }]) assert.equal(await reserve('github', from), null);
  const sites = await sandbox.CustomSites.readSites();
  assert.deepEqual(Array.from(sites), ['https://vanity.example.edu'], 'Genuine interrupted custom-site grants still recover');
  await sandbox.CustomSites.sync();
  assert.equal(registered.length, 1); assert.deepEqual(Array.from(registered[0].matches), ['https://vanity.example.edu/*']);
  assert.deepEqual(saved.favorites, { keep: true });
  saved.customSites.push('https://git.example.edu');
  assert.equal((await reserve('gitlab')).ok, false, 'An Experience site cannot also be reserved as a Git server');
  console.log('PASS Git permissions: serialized reservations, exact trusted sender, no Git content-script injection, interrupted Experience grant recovery, and unchanged favorites');
})().catch(error => { console.error(error); process.exitCode = 1; });
