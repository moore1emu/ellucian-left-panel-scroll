(() => {
  'use strict';
  let pending = Promise.resolve();

  // Serialize per-tenant folder saves in the trusted worker, rejecting stale whole-document edits.
  let locationsPending = Promise.resolve();
  chrome.runtime.onMessage.addListener((message,sender,respond)=>{
    if (message?.type!=='git-save-locations' || sender.id!==chrome.runtime.id || sender.url?.split('#')[0]!==chrome.runtime.getURL('pipeline-export.html') || sender.frameId!==0) return;
    locationsPending=locationsPending.catch(()=>{}).then(async()=>{
      await FeatureTools.requireExport();
      const expected=GitLocations.validate(message.expected);
      const next=GitLocations.validate(message.value);
      if (JSON.stringify(await GitLocations.read())!==JSON.stringify(expected)) throw Error('stale');
      await chrome.storage.local.set({[GitLocations.KEY]:next});
    });
    locationsPending.then(()=>respond({ok:true}),()=>respond({ok:false}));
    return true;
  });

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
