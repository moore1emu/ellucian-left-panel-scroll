(() => {
  'use strict';

  // Keep Git secrets in extension-origin IndexedDB, outside content-script storage and JSON backups.
  const DB = 'integration-navigator-git-v1';
  const SESSION = 'gitUnlockV1';
  const iterations = 600000;
  const encoder = new TextEncoder();
  let opening;

  // Reuse a connection without keeping a read/write transaction alive across cryptographic work.
  function database() {
    if (!opening) opening = new Promise((resolve, reject) => {
      const request = indexedDB.open(DB, 1);
      request.onupgradeneeded = () => request.result.createObjectStore('vault');
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(new Error('Git storage is unavailable.'));
      request.onblocked = () => reject(new Error('Close other connection settings tabs and retry.'));
    }).catch(error => { opening = null; throw error; });
    return opening;
  }

  // Resolve only after durable transaction completion; request success alone is not a saved credential.
  async function transaction(mode, run) {
    const db = await database();
    return new Promise((resolve, reject) => {
      const tx = db.transaction('vault', mode);
      let result;
      let failure;
      tx.oncomplete = () => resolve(result);
      tx.onabort = tx.onerror = () => reject(failure || new Error('Git storage could not be updated.'));
      try { run(tx.objectStore('vault'), value => { result = value; }, error => { failure = error; tx.abort(); }); }
      catch { tx.abort(); }
    });
  }

  // Read a single vault item without exposing keys through Chrome storage notifications.
  const get = key => transaction('readonly', (store, done) => { store.get(key).onsuccess = event => done(event.target.result); });

  // Reject concurrent settings edits instead of silently replacing another tab's newer connection.
  function replace(expected, record) {
    return transaction('readwrite', (store, done, fail) => {
      store.get('connection').onsuccess = event => {
        if ((event.target.result?.revision || null) !== expected) return fail(new Error('Connection changed. Reload settings before saving.'));
        if (record) store.put(record, 'connection'); else store.delete('connection');
        done(record);
      };
    });
  }

  // Store one non-extractable device key atomically even when two settings tabs initialize together.
  async function deviceKey() {
    const proposed = await crypto.subtle.generateKey({ name: 'AES-GCM', length: 256 }, false, ['encrypt', 'decrypt']);
    return transaction('readwrite', (store, done) => {
      store.get('device-key').onsuccess = event => {
        const key = event.target.result || proposed;
        if (!event.target.result) store.put(key, 'device-key');
        done(key);
      };
    });
  }

  // Bind encrypted tokens to their destination/settings revision so records cannot be swapped accidentally.
  const aad = record => encoder.encode(JSON.stringify([1, record.revision, record.config, record.mode]));

  // Derive a separate AES key for each password-protected connection; never save the password.
  async function passwordKey(password, salt) {
    if (typeof password !== 'string' || password.length < 12 || password.length > 1024) throw new Error('Use an unlock password of 12–1024 characters.');
    const material = await crypto.subtle.importKey('raw', encoder.encode(password), 'PBKDF2', false, ['deriveKey']);
    return crypto.subtle.deriveKey({ name: 'PBKDF2', hash: 'SHA-256', salt, iterations }, material,
      { name: 'AES-GCM', length: 256 }, true, ['encrypt', 'decrypt']);
  }

  // Browser-memory unlock keys are trusted-context-only and disappear after browser/extension restart.
  async function session() {
    await chrome.storage.session.setAccessLevel({ accessLevel: 'TRUSTED_CONTEXTS' });
    return chrome.storage.session;
  }

  // Remember only an unlock key, never a plaintext token; use per-revision entries to isolate racing tabs.
  async function remember(record, key) {
    const area = await session();
    const raw = Array.from(new Uint8Array(await crypto.subtle.exportKey('raw', key)));
    await area.set({ [SESSION + record.revision]: raw });
  }

  // Public metadata deliberately omits encrypted payloads, salts, keys, and credential values.
  async function info() {
    const record = await get('connection');
    return record ? { config: record.config, revision: record.revision, mode: record.mode, history: record.history === true } : null;
  }

  // Save a freshly supplied token only after encryption succeeds and the expected revision still matches.
  async function save(config, token, mode, password, history, expected) {
    // Validate at the storage boundary too, not only in the settings form.
    config = GitProvider.config(config);
    if (!['device', 'password', 'session'].includes(mode) || typeof token !== 'string' || !token.trim() || token.length > 8192 || /[\r\n\u0000]/u.test(token)) throw new Error('Enter a valid access token.');
    const record = { config, mode, history: history === true, revision: crypto.randomUUID(), iv: crypto.getRandomValues(new Uint8Array(12)) };
    record.salt = crypto.getRandomValues(new Uint8Array(16));
    const key = mode === 'device' ? await deviceKey() : mode === 'password' ? await passwordKey(password, record.salt)
      : await crypto.subtle.generateKey({ name: 'AES-GCM', length: 256 }, true, ['encrypt', 'decrypt']);
    record.cipher = await crypto.subtle.encrypt({ name: 'AES-GCM', iv: record.iv, additionalData: aad(record) }, key, encoder.encode(token.trim()));
    // Prepare a session unlock before saving so a storage failure cannot advertise an unlocked connection.
    if (mode !== 'device') await remember(record, key);
    try { await replace(expected, record); }
    catch (error) { if (mode !== 'device') await (await session()).remove(SESSION + record.revision); throw error; }
    // Retire only the replaced connection's key after the new record is durably stored.
    if (expected) await (await session()).remove(SESSION + expected);
    return info();
  }

  // Fail closed for a changed/locked/corrupt credential without printing WebCrypto or token details.
  async function token(revision) {
    const record = await get('connection');
    if (!record || record.revision !== revision) throw new Error('Connection changed. Prepare a new preview.');
    try {
      let key;
      if (record.mode === 'device') key = await get('device-key');
      else {
        const raw = (await (await session()).get(SESSION + revision))[SESSION + revision];
        if (!Array.isArray(raw) || raw.length !== 32) throw new Error('locked');
        key = await crypto.subtle.importKey('raw', new Uint8Array(raw), 'AES-GCM', false, ['decrypt']);
      }
      const plain = await crypto.subtle.decrypt({ name: 'AES-GCM', iv: record.iv, additionalData: aad(record) }, key, record.cipher);
      // Recheck after asynchronous crypto so Forget/Save cannot release a stale credential.
      if ((await info())?.revision !== revision) throw new Error('changed');
      return new TextDecoder().decode(plain);
    } catch { throw new Error('Connection is locked or unavailable. Open Manage Connection.'); }
  }

  // Unlock only after a successful authentication-tag check, retaining no entered password.
  async function unlock(password) {
    const record = await get('connection');
    if (!record || record.mode !== 'password') throw new Error('No password-protected connection.');
    try {
      const key = await passwordKey(password, record.salt);
      await crypto.subtle.decrypt({ name: 'AES-GCM', iv: record.iv, additionalData: aad(record) }, key, record.cipher);
      if ((await info())?.revision !== record.revision) throw new Error('changed');
      await remember(record, key);
    } catch { throw new Error('Could not unlock. Check the password or reconnect with a new token.'); }
  }

  // Lock invalidates future requests; already-sent provider requests cannot be recalled.
  async function lock() {
    const record = await info();
    if (record) await (await session()).remove(SESSION + record.revision);
  }

  // Forget is a local revocation, not a provider-token revocation or deletion of remote Git history.
  async function forget(expected) {
    await replace(expected, null);
    if (expected) await (await session()).remove(SESSION + expected);
  }

  // Persist only successful, bounded receipt metadata; no source files or raw service errors enter history.
  async function receipt(revision, result) {
    return transaction('readwrite', (store, done) => {
      store.get('connection').onsuccess = event => {
        if (event.target.result?.revision !== revision || !event.target.result.history) return done();
        const savedConfig = event.target.result.config;
        let config = savedConfig;
        // Retain the actual tenant child in the receipt, without changing the encrypted base connection.
        if (typeof result.folder === 'string') {
          try { config = GitProvider.config({ ...savedConfig, folder: result.folder }); } catch { return done(); }
          const [tenant,...parts] = config.folder.split('/');
          const source = parts.join('/');
          const tenantChild = /^[a-f\d]{8}(?:-[a-f\d]{4}){3}-[a-f\d]{12}$/iu.test(tenant) &&
            [savedConfig.folder + '/Designer',savedConfig.folder + '/Packages','APIDesigner'].includes(source);
          // Keep legacy receipt validation while permitting only the three fixed tenant-first source destinations.
          if (!tenantChild && !config.folder.startsWith(savedConfig.folder + '/')) return done();
        }
        store.get('history').onsuccess = previous => {
          const entry = { time: Date.now(), config, commit: result.commit, count: result.count };
          store.put([entry, ...(previous.target.result || [])].slice(0, 20), 'history');
          done();
        };
      };
    });
  }

  // History clearing never affects credentials, backups, or remote commits.
  const history = () => get('history').then(value => value || []);
  const clearHistory = () => transaction('readwrite', (store, done) => { store.delete('history'); done(); });
  globalThis.GitVault = Object.freeze({ info, save, token, unlock, lock, forget, receipt, history, clearHistory });
})();
