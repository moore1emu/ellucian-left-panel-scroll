(() => {
  'use strict';
  const $ = id => document.getElementById(id);
  let saved = null;
  let busy = false;
  const apiOrigin = config => config.provider === 'github' ? 'https://api.github.com' : config.server;

  // Never echo raw provider/storage errors into UI; only fixed application messages are permitted.
  const messages = new Set(['Connection changed. Reload settings before saving.', 'Use an unlock password of 12–1024 characters.', 'Enter a valid access token.', 'Could not unlock. Check the password or reconnect with a new token.', 'Connection is locked or unavailable. Open Manage Connection.', 'Git authentication failed. Reconnect with a valid token.', 'Git access was denied or rate limited. Check permissions and branch protection.', 'Git repository, branch, or file was not found.', 'Git could not be reached. Check the server and connection.']);
  function error(error) { $('git-status').textContent = messages.has(error.message) ? error.message : 'Git setup could not complete. Check the destination, token, password, and access permission.'; }

  // Keep pending settings writes separate from input controls so another tab cannot silently win.
  function enabled(value) {
    busy = !value;
    const allowed = !globalThis.FeatureTools || FeatureTools.state.export;
    $('git-fields').disabled = !value || !allowed;
    for (const id of ['git-allow', 'git-test', 'git-forget']) $(id).disabled = !value || !saved || !allowed && id !== 'git-forget';
  }

  // Explain the storage boundary; password mode has manual/session locking, not a background idle timer.
  function storageHelp() {
    const mode = $('git-storage').value;
    $('git-password-fields').hidden = mode !== 'password';
    $('git-storage-help').textContent = mode === 'device' ? 'Automatic reuse after restart. This is not an OS vault and does not protect a compromised browser profile.'
      : mode === 'password' ? 'Encrypted at rest; unlock once per browser session. No password is saved.' : 'Only the encrypted token survives on disk; its session key clears on restart, making the saved token unusable.';
  }

  // Render typed folder text safely; this example never changes the actual destination or validates it.
  function folderHelp() {
    $('git-folder-example').textContent = `<Tenant ID>/${$('git-folder').value || '<Base Folder>'}/Designer or Packages/<Package>`;
  }

  // Show only the selected provider's native help, including after a saved connection loads.
  function providerHelp() {
    const provider = $('git-provider').value;
    $('git-server-field').hidden = provider !== 'gitlab';
    for (const name of ['github', 'gitlab']) {
      const help = $('git-' + name + '-help');
      help.hidden = provider !== name;
      // Keep: switching providers starts the newly relevant guide collapsed (3.0.9).
      if (help.hidden) help.open = false;
    }
  }

  // Render only our own constructed commit links and plain text metadata; never provider HTML.
  async function history() {
    $('git-history').replaceChildren();
    for (const entry of await GitVault.history()) {
      try {
        const item = document.createElement('li');
        const link = document.createElement('a');
        link.href = GitProvider.commitUrl(entry.config, entry.commit); link.target = '_blank'; link.rel = 'noopener noreferrer';
        link.textContent = `${new Date(entry.time).toLocaleString()} · ${entry.config.repository} · ${entry.config.folder} · ${entry.count} files`;
        link.title = 'Private repositories require you to sign in to GitHub or GitLab in this browser to view the commit.';
        item.append(link); $('git-history').append(item);
      } catch { /* Ignore corrupt local receipts without exposing their contents. */ }
    }
  }

  // Reload the saved revision before every edit; no token is ever inserted back into an input field.
  async function load() {
    saved = await GitVault.info();
    if (saved) {
      const c = GitProvider.config(saved.config);
      for (const key of ['provider', 'server', 'repository', 'branch', 'folder']) $('git-' + key).value = c[key];
      $('git-storage').value = saved.mode; $('git-history-enabled').checked = saved.history;
    }
    providerHelp(); folderHelp();
    $('git-unlock-form').hidden = saved?.mode !== 'password';
    $('git-lock').hidden = saved?.mode !== 'password';
    storageHelp(); enabled(true); await history();
    $('git-status').textContent = saved ? `Saved ${saved.config.provider === 'github' ? 'GitHub' : 'GitLab'} connection: ${saved.config.repository}. Test access before exporting.` : 'No Git connection saved.';
  }

  $('git-provider').addEventListener('change', providerHelp);
  // Keep the layout example synchronized without waiting for a connection save.
  $('git-folder').addEventListener('input', folderHelp);
  $('git-storage').addEventListener('change', storageHelp);
  // Explain the intentional fresh-token requirement when native required-field validation blocks submission.
  $('git-token').addEventListener('invalid', () => {
    if ($('git-token').value) return;
    const message = 'Every change requires you to re-enter the access token before saving.';
    $('git-token').setCustomValidity(message);
    $('git-status').textContent = message;
  });
  // Clear our own validation text as soon as the user supplies a token; native required validation still applies.
  $('git-token').addEventListener('input', () => $('git-token').setCustomValidity(''));
  $('git-form').addEventListener('submit', async event => {
    event.preventDefault(); if (busy) return;
    enabled(false);
    try {
      const c = GitProvider.config(Object.fromEntries(['provider', 'server', 'repository', 'branch', 'folder'].map(key => [key, $('git-' + key).value])));
      if (!$('git-consent').checked) throw new Error('consent');
      if ($('git-storage').value === 'password' && $('git-password').value !== $('git-password-confirm').value) throw new Error('password-mismatch');
      const origin = apiOrigin(c);
      // Reserve before granting access: Custom Sites must not recover this permission as an Experience site.
      const reserved = await chrome.runtime.sendMessage({ type: 'git-reserve-server', config: c });
      if (!reserved?.ok || !origin) throw new Error('server-reservation');
      await GitVault.save(c, $('git-token').value, $('git-storage').value, $('git-password').value, $('git-history-enabled').checked, saved?.revision || null);
      await load(); $('git-status').textContent = 'Connection encrypted and saved. Allow Server Access, then Test Connection. No files uploaded.';
    } catch (failure) { error(failure); }
    finally {
      // Clear secrets even after a failed save; never retain an entered password in the DOM.
      for (const id of ['git-token', 'git-password', 'git-password-confirm']) $(id).value = '';
      enabled(true);
    }
  });

  // Request exactly the already-reserved origin from a fresh explicit user gesture.
  $('git-allow').addEventListener('click', () => {
    if (!saved || busy) return;
    const origins = [apiOrigin(saved.config) + '/*'];
    const granting = chrome.permissions.request({ origins });
    enabled(false);
    granting.then(allowed => { $('git-status').textContent = allowed ? 'Server access granted. Test Connection next.' : 'Server access was not granted.'; }, error).finally(() => enabled(true));
  });

  // A connection test performs bounded repository metadata reads only, with no source collection or writes.
  $('git-test').addEventListener('click', async () => {
    if (!saved || busy) return; enabled(false);
    try {
      const revision = saved.revision;
      if (!await chrome.permissions.contains({ origins: [apiOrigin(saved.config) + '/*'] })) throw new Error('permission');
      const token = await GitVault.token(revision);
      const result = await GitProvider.preview(saved.config, [{ path: 'ConnectionCheck/check.json', bytes: new Uint8Array() }], token,
        { check: async () => { await GitVault.token(revision); if (!await chrome.permissions.contains({ origins: [apiOrigin(saved.config) + '/*'] })) throw new Error('permission'); } });
      $('git-status').textContent = `Connected. Repository visibility: ${result.visibility}. Existing branch verified. Write permission is checked by the provider only when you confirm a push.`;
    } catch (failure) { error(failure); }
    finally { enabled(true); }
  });

  $('git-unlock-form').addEventListener('submit', async event => {
    event.preventDefault(); if (busy) return; enabled(false);
    try { await GitVault.unlock($('git-unlock-password').value); $('git-status').textContent = 'Unlocked for this browser session.'; }
    catch (failure) { error(failure); }
    finally { $('git-unlock-password').value = ''; enabled(true); }
  });
  $('git-lock').addEventListener('click', async () => {
    if (busy) return;
    try { await GitVault.lock(); $('git-status').textContent = 'Locked. Already-sent requests cannot be recalled.'; } catch (failure) { error(failure); }
  });
  $('git-forget').addEventListener('click', async () => {
    if (!saved || busy || !confirm('Forget the locally saved connection? This does not revoke the provider token, remove browser permissions, or delete remote commits.')) return;
    enabled(false);
    try { await GitVault.forget(saved.revision); saved = null; await load(); }
    catch (failure) { error(failure); }
    finally { enabled(true); }
  });
  $('git-clear-history').addEventListener('click', async () => {
    try { await GitVault.clearHistory(); await history(); } catch (failure) { error(failure); }
  });
  load().catch(failure => {
    error(failure); enabled(false);
    // A malformed saved destination must not make its local credential impossible to forget.
    $('git-forget').disabled = !saved;
  });
  // Keep local Forget usable, but never make a provider request or credential edit while disabled.
  globalThis.FeatureTools?.subscribe(state => {
    enabled(!busy);
    if (!state.export) $('git-status').textContent = 'Enable Export Tools in General.';
  });
})();
