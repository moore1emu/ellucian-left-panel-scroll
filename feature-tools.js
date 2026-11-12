(() => {
  'use strict';

  // Keep group choices separate from individual settings, favorites, source caches and Git secrets.
  const defaults = { navigationToolsEnabled: true, exportToolsEnabled: false };
  let state = { navigation: false, export: false };
  let revision = 0;
  const changed = new Set();
  const listeners = new Set();
  const normalize = saved => ({ navigation: saved.navigationToolsEnabled !== false, export: saved.exportToolsEnabled === true });

  // Read persisted authorization at operation boundaries instead of trusting a hidden or disabled button.
  async function read() { return normalize(await chrome.storage.local.get(defaults)); }
  async function requireExport() {
    if (!(await read()).export) throw new Error('Enable Export Tools in General.');
  }

  // Notify all local consumers without rewriting any subordinate preference or saved record.
  function notify(next) { state = next; for (const listener of listeners) listener(state); }
  chrome.storage.onChanged.addListener((changes, area) => {
    if (area !== 'local' || !changes.navigationToolsEnabled && !changes.exportToolsEnabled) return;
    revision += 1;
    if (changes.navigationToolsEnabled) changed.add('navigation');
    if (changes.exportToolsEnabled) changed.add('export');
    notify({ navigation: changes.navigationToolsEnabled ? changes.navigationToolsEnabled.newValue !== false : state.navigation,
      export: changes.exportToolsEnabled ? changes.exportToolsEnabled.newValue === true : state.export });
  });
  const initial = revision;
  const ready = read().then(value => {
    // Merge only newer choices; a delayed read must still load the untouched group.
    notify(initial === revision ? value : { ...value, ...Object.fromEntries([...changed].map(key => [key,state[key]])) });
    return state;
  }).catch(() => null);

  // Keep legacy v3 export access on upgrade; new installs start opt-in and explicit choices always win.
  async function migrate(details) {
    if (details?.reason !== 'update' || !/^3\./u.test(details.previousVersion || '')) return;
    const saved = await chrome.storage.local.get({ exportToolsEnabled: null });
    if (saved.exportToolsEnabled === null) await chrome.storage.local.set({ exportToolsEnabled: true });
  }

  globalThis.FeatureTools = Object.freeze({ read, requireExport, migrate, ready, get state() { return state; },
    subscribe(listener) {
      // Initial readiness already notifies early subscribers; do not replay it and reset their UI twice.
      let delivered = false;
      const receive = value => { delivered = true; listener(value); };
      listeners.add(receive);
      ready.then(value => { if (value && !delivered) receive(state); });
      return () => listeners.delete(receive);
    } });
})();
