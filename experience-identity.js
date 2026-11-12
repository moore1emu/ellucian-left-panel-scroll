(() => {
  'use strict';

  // Share only the ready tenant snapshot, never Redux state or account information.
  const uuid = value => typeof value === 'string' && /^[a-f\d]{8}(?:-[a-f\d]{4}){3}-[a-f\d]{12}$/iu.test(value);
  let cached = null;
  let anchor = null;
  let route = '';

  // Search one bounded ancestor chain per route instead of rescanning for every record.
  function discover() {
    const node = document.querySelector('[role="main"]') || document.querySelector('main') || document.getElementById('root');
    anchor = node;
    const key = node && Object.keys(node).find(name => name.startsWith('__reactFiber$'));
    let fiber = key ? node[key] : null;
    const stores = new Set();
    for (let depth = 0; fiber && depth < 80; depth += 1, fiber = fiber.return) {
      const store = fiber.memoizedProps?.value?.store;
      if (typeof store?.getState === 'function' && typeof store?.dispatch === 'function' && typeof store?.subscribe === 'function') stores.add(store);
    }
    return stores.size === 1 ? [...stores][0] : null;
  }

  function read() {
    try {
      // A same-route React remount must not keep the previous provider's tenant snapshot alive.
      if (route !== location.href || !cached || !anchor?.isConnected) { route = location.href; cached = discover(); }
      const state = cached?.getState();
      if (state?.tenantCheckStatus !== 'valid-tenant' || !uuid(state.tenant)) return null;
      const text = value => typeof value === 'string' && value.length <= 500 ? value.trim() : '';
      return { tenantId: state.tenant, name: text(state.tenantName), label: text(state.tenantLabel), alias: text(state.tenantAlias) };
    } catch { cached = null; return null; }
  }

  // Expose only fixed identity metadata, not the native store or credential callbacks.
  globalThis.ExperienceIdentity = Object.freeze({ read, uuid });
})();
