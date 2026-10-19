(() => {
  'use strict';
  let pending = Promise.resolve();
  // Both top-level workspace entry points own the same packaged connection form; page/content frames do not.
  const trustedConnection = sender => sender.id===chrome.runtime.id && sender.frameId===0 && ['git-connection.html','pipeline-export.html'].some(page=>sender.url?.split('#')[0]===chrome.runtime.getURL(page));

  // Serialize per-tenant folder saves in the trusted worker, rejecting stale whole-document edits.
  let locationsPending = Promise.resolve();
  chrome.runtime.onMessage.addListener((message,sender,respond)=>{
    if (message?.type!=='git-save-locations' || !trustedConnection(sender)) return;
    locationsPending=locationsPending.catch(()=>{}).then(async()=>{
      await FeatureTools.requireExport();
      const expected=GitLocations.validate(message.expected);
      const next=GitLocations.validate(message.value);
      if (JSON.stringify(await GitLocations.read())!==JSON.stringify(expected)) throw Error('stale');
      const changes={[GitLocations.KEY]:next};
      // A local confirmation records reviewed folder choices only; it never grants source/provider access.
      if (message.confirm) {
        const {tenantId,environment,kind}=message.confirm;
        if (!/^[a-f\d]{8}(?:-[a-f\d]{4}){3}-[a-f\d]{12}$/iu.test(tenantId) || !Object.hasOwn(GitLocations.sources,kind) || typeof environment!=='string' || environment.length>200) throw Error('invalid-confirmation');
        const previous=(await chrome.storage.local.get({[GitLocations.CONFIRM_KEY]:{}}))[GitLocations.CONFIRM_KEY];
        if (!previous || typeof previous!=='object' || Array.isArray(previous)) throw Error('invalid-confirmation');
        const key=tenantId.toLowerCase()+':'+kind;
        changes[GitLocations.CONFIRM_KEY]={...previous,[key]:GitLocations.signature(next,tenantId,environment,kind)};
      }
      await chrome.storage.local.set(changes);
    });
    locationsPending.then(()=>respond({ok:true}),()=>respond({ok:false}));
    return true;
  });

  // Serialize non-secret server reservations before any browser permission is requested.
  chrome.runtime.onMessage.addListener((message, sender, respond) => {
    if (message?.type !== 'git-reserve-server' || !trustedConnection(sender)) return;
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
