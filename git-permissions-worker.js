(() => {
  'use strict';
  let pending = Promise.resolve();

  // Serialize non-secret server reservations before any browser permission is requested.
  chrome.runtime.onMessage.addListener((message, sender, respond) => {
    if (message?.type !== 'git-reserve-server' || sender.id !== chrome.runtime.id || sender.url !== chrome.runtime.getURL('git-connection.html') || sender.frameId !== 0) return;
    pending = pending.catch(() => {}).then(async () => {
      if (globalThis.FeatureTools) await FeatureTools.requireExport();
      const c = GitProvider.config(message.config);
      const origin = c.provider === 'github' ? 'https://api.github.com' : c.server;
      const local = await chrome.storage.local.get({ gitProviderOrigins: [], customSites: [] });
      const builtIn = CustomSites.defaults();
      if (!Array.isArray(local.gitProviderOrigins) || !Array.isArray(local.customSites) || builtIn.includes(origin) || local.customSites.includes(origin)) throw new Error('origin');
      const origins = [...new Set([...local.gitProviderOrigins, origin])];
      if (origins.length > 20) throw new Error('limit');
      await chrome.storage.local.set({ gitProviderOrigins: origins });
    });
    pending.then(() => respond({ ok: true }), () => respond({ ok: false }));
    return true;
  });
})();
