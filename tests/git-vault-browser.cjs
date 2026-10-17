'use strict';

// Use real WebCrypto/IndexedDB with synthetic Chrome session storage; no provider or real credential access.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { chromium } = require('playwright');
const root = path.resolve(__dirname, '..');
const synthetic = 'SYNTHETIC_TEST_TOKEN_NOT_A_CREDENTIAL';

(async () => {
  const browser = await chromium.launch({ headless: true, ...(process.env.INTEGRATION_NAVIGATOR_BROWSER ? { channel: process.env.INTEGRATION_NAVIGATOR_BROWSER } : {}) });
  try {
    const context = await browser.newContext();
    const memory = {};
    let failMemoryWrite = false;
    await context.exposeBinding('fixtureSession', (_, operation, key, value) => {
      if (operation === 'get') return { [key]: memory[key] };
      if (operation === 'set') { if (failMemoryWrite) throw Error('Synthetic session failure'); Object.assign(memory, value); }
      if (operation === 'remove') delete memory[key];
    });
    await context.addInitScript(() => {
      window.chrome = { storage: { session: {
        setAccessLevel: async value => { if (value.accessLevel !== 'TRUSTED_CONTEXTS') throw Error('Insecure access'); },
        get: key => fixtureSession('get', key), set: value => fixtureSession('set', null, value), remove: key => fixtureSession('remove', key),
      } } };
    });
    await context.route('**/*', route => route.fulfill({ contentType: 'text/html', body: '<!doctype html><title>Synthetic Vault</title>' }));
    const page = await context.newPage();
    const initialize = async target => {
      await target.goto('https://vault.test/');
      await target.addScriptTag({ content: fs.readFileSync(path.join(root, 'git-provider.js'), 'utf8') });
      await target.addScriptTag({ content: fs.readFileSync(path.join(root, 'git-vault.js'), 'utf8') });
    };
    await initialize(page);
    const config = { provider: 'github', repository: 'owner/repo', branch: 'exports', folder: 'DataConnect' };
    const save = (target, mode, expected = null) => target.evaluate(async ({ config, token, mode, expected }) => GitVault.save(config, token, mode, 'SYNTHETIC PASSWORD 123', true, expected), { config, token: synthetic, mode, expected });
    let record = await save(page, 'device');
    assert.equal(await page.evaluate(revision => GitVault.token(revision), record.revision), synthetic);

    // Ciphertext and the non-extractable key survive reload, but plaintext never enters persistent storage.
    const stored = await page.evaluate(async () => {
      const db = await new Promise(resolve => { const request = indexedDB.open('integration-navigator-git-v1'); request.onsuccess = () => resolve(request.result); });
      const read = key => new Promise(resolve => { db.transaction('vault').objectStore('vault').get(key).onsuccess = e => resolve(e.target.result); });
      const value = await read('connection'); const key = await read('device-key');
      const dump = JSON.stringify({ ...value, cipher: Array.from(new Uint8Array(value.cipher)) });
      return { dump, extractable: key.extractable, ivLength: value.iv.length };
    });
    assert.equal(stored.dump.includes(synthetic), false); assert.equal(stored.extractable, false); assert.equal(stored.ivLength, 12);
    await initialize(page); assert.equal(await page.evaluate(revision => GitVault.token(revision), record.revision), synthetic);

    // Different tabs cannot overwrite a connection read before another tab's durable save.
    const other = await context.newPage(); await initialize(other);
    const races = await Promise.allSettled([save(page, 'device', record.revision), save(other, 'device', record.revision)]);
    assert.equal(races.filter(x => x.status === 'fulfilled').length, 1); assert.equal(races.filter(x => x.status === 'rejected').length, 1);
    record = await page.evaluate(() => GitVault.info());
    // Failed memory setup or encryption must not replace the last durably saved usable connection.
    failMemoryWrite = true;
    await assert.rejects(save(page, 'password', record.revision), /Synthetic session failure/);
    failMemoryWrite = false;
    assert.equal((await page.evaluate(() => GitVault.info())).revision, record.revision);
    assert.equal(await page.evaluate(revision => GitVault.token(revision), record.revision), synthetic);
    await assert.rejects(page.evaluate(async ({ config, token, revision }) => {
      const original = crypto.subtle.encrypt.bind(crypto.subtle);
      crypto.subtle.encrypt = async () => { throw Error('Synthetic encryption failure'); };
      try { await GitVault.save(config, token, 'device', '', true, revision); }
      finally { crypto.subtle.encrypt = original; }
    }, { config, token: synthetic, revision: record.revision }), /Synthetic encryption failure/);
    assert.equal((await page.evaluate(() => GitVault.info())).revision, record.revision);
    record = await save(page, 'password', record.revision);
    assert.equal(await page.evaluate(revision => GitVault.token(revision), record.revision), synthetic);
    await page.evaluate(() => GitVault.lock());
    await assert.rejects(page.evaluate(revision => GitVault.token(revision), record.revision), /locked/);
    await assert.rejects(page.evaluate(() => GitVault.unlock('WRONG PASSWORD 12345')), /Could not unlock/);
    await page.evaluate(() => GitVault.unlock('SYNTHETIC PASSWORD 123'));
    assert.equal(await other.evaluate(revision => GitVault.token(revision), record.revision), synthetic);
    // Simulate browser/extension restart: disk remains, memory-only unlock keys disappear.
    for (const key of Object.keys(memory)) delete memory[key];
    await initialize(page); await assert.rejects(page.evaluate(revision => GitVault.token(revision), record.revision), /locked/);
    await page.evaluate(() => GitVault.unlock('SYNTHETIC PASSWORD 123'));
    assert.equal(JSON.stringify(memory).includes(synthetic), false); assert.equal(JSON.stringify(memory).includes('SYNTHETIC PASSWORD'), false);
    record = await save(page, 'session', record.revision);
    assert.equal(await page.evaluate(revision => GitVault.token(revision), record.revision), synthetic);
    for (const key of Object.keys(memory)) delete memory[key];
    await assert.rejects(page.evaluate(revision => GitVault.token(revision), record.revision), /locked/);
    await page.evaluate(revision => GitVault.forget(revision), record.revision);
    assert.equal(await page.evaluate(() => GitVault.info()), null);

    // Corrupt ciphertext never falls back to plaintext; reconnection and bounded history remain independent.
    record = await save(page, 'device');
    await page.evaluate(async () => {
      const db = await new Promise(resolve => { const request = indexedDB.open('integration-navigator-git-v1'); request.onsuccess = () => resolve(request.result); });
      await new Promise((resolve, reject) => { const tx = db.transaction('vault', 'readwrite'); const store = tx.objectStore('vault'); store.get('connection').onsuccess = event => { const value = event.target.result; new Uint8Array(value.cipher)[0] ^= 1; store.put(value, 'connection'); }; tx.oncomplete = resolve; tx.onerror = reject; });
    });
    await assert.rejects(page.evaluate(revision => GitVault.token(revision), record.revision), /unavailable/);
    record = await save(page, 'device', record.revision);
    await page.evaluate(async revision => { for (let i = 0; i < 25; i++) await GitVault.receipt(revision, { commit: 'a'.repeat(40), count: i }); }, record.revision);
    assert.equal((await page.evaluate(() => GitVault.history())).length, 20);
    await page.evaluate(() => GitVault.clearHistory()); assert.equal((await page.evaluate(() => GitVault.history())).length, 0);
    assert.equal(await page.evaluate(revision => GitVault.token(revision), record.revision), synthetic);
    await page.evaluate(revision => GitVault.forget(revision), record.revision);
    await assert.rejects(other.evaluate(revision => GitVault.token(revision), record.revision), /changed/);
    await context.close();
    console.log('PASS Git vault: real encryption, non-extractable device key, password/session restart and lock/unlock, cross-tab save races, corruption, forget, bounded non-secret history, and no plaintext persistence');
  } finally { await browser.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
