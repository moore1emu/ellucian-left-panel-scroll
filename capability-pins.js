(() => {
  'use strict';

  const svgNS = 'http://www.w3.org/2000/svg';
  const symbolPattern = /^#ds-icon-[a-z0-9-]+$/i;
  let scope = null, revision = 0, frame = 0;
  let pins = null, appearance, iconAppearance, strip = null, signature = '';
  const pending = new WeakSet();

  const enabledKey = FavoritesData.CAPABILITIES_ENABLED;
  let enabled = false;
  let preferenceChanged = false;
  let scopeCheck = 0;
  let pendingRootRead;

  // On a custom site with Home at "/", the path alone cannot distinguish tenants.
  // Reuse the extension's existing same-document tenant lookup. Only the tenant ID crosses worlds.
  function rootTenant(url) {
    if (pendingRootRead?.url === url) return pendingRootRead.result;
    const requestId = crypto.randomUUID();
    const source = 'ellucian-left-panel-scroll';
    const result = new Promise(resolve => {
      function finish(tenant) {
        clearTimeout(timeout);
        window.removeEventListener('message', receive);
        if (pendingRootRead?.requestId === requestId) pendingRootRead = null;
        resolve(tenant);
      }
      function receive(event) {
        const data = event.data;
        if (event.source !== window || event.origin !== location.origin || data?.source !== source ||
            data.type !== 'favorite-context-response' || data.requestId !== requestId) return;
        const tenant = data.pageUrl === url && location.href === url && typeof data.tenantId === 'string' ? data.tenantId.trim() : '';
        finish(tenant);
      }
      const timeout = setTimeout(() => finish(''), 1000);
      window.addEventListener('message', receive);
      window.postMessage({ source, type: 'favorite-context-request', requestId }, location.origin);
    });
    pendingRootRead = { url, requestId, result };
    return result;
  }

  // Follow the native Home link so a custom domain may mount Experience at any depth.
  function capabilityBase(header) {
    const home = header?.querySelector(':scope > a[href]');
    if (!home || home.origin !== location.origin || home.protocol !== 'https:' || home.username || home.password) return null;
    const base = home.pathname.replace(/\/?$/, '/');
    if (base.includes('//')) return null;
    const path = location.pathname;
    // The shell's Home link identifies the tenant on cards and future routes, too.
    return path.startsWith(base) || path + '/' === base ? base : null;
  }
  async function currentScope(header) {
    const base = capabilityBase(header);
    if (!base) return null;
    const key = 'capabilityPins:' + location.origin + base;
    if (base !== '/') return { base, key };
    const tenant = await rootTenant(location.href);
    return tenant ? { base, key: key + ':tenant:' + tenant } : null;
  }

  // Only reuse ordinary app paths from this tenant. Never save URL parameters, fragments or remote icons.
  function validPath(path, site) {
    if (typeof path !== 'string' || !path.startsWith(site.base + 'app/')) return false;
    const url = new URL(path, location.origin);
    return url.origin === location.origin && url.pathname === path && !url.search && !url.hash;
  }
  function readPins(value, site) {
    if (!Array.isArray(value)) return [];
    return value.filter(pin => pin && validPath(pin.path, site) &&
      typeof pin.name === 'string' && pin.name.trim() && pin.name.length <= 256);
  }
  function menuItem(link, site) {
    if (link.origin !== location.origin || link.username || link.password || link.search || link.hash || !validPath(link.pathname, site)) return null;
    const name = link.textContent.trim() || link.getAttribute('aria-label')?.trim();
    if (!name || name.length > 256) return null;
    const use = link.querySelector('svg use');
    const icon = use?.getAttribute('href') || use?.getAttribute('xlink:href');
    return { path: link.pathname, name, icon: symbolPattern.test(icon) ? icon : '' };
  }

  // A shortcut remains readable when the current shell has not loaded the app's icon.
  function renderHeader(header, grid) {
    if (!pins?.length || !grid) { strip?.remove(); strip = null; signature = ''; return; }
    const firstAction = header.querySelector('#calendar-btn, #notifications-btn') || grid;
    let anchor = firstAction;
    while (anchor.parentElement !== header) anchor = anchor.parentElement;
    if (!strip) {
      strip = document.createElement('nav');
      strip.className = 'inav-cap-pins';
      strip.setAttribute('aria-label', 'Favorite capabilities');
    }
    if (anchor.previousElementSibling !== strip) {
      // A rebuilt header can already contain a detached copy of the old shortcut strip.
      for (const copy of header.querySelectorAll(':scope > .inav-cap-pins')) if (copy !== strip) copy.remove();
      anchor.before(strip);
    }
    strip.style.color = getComputedStyle(firstAction).color;
    const items = pins.map(pin => ({
      path: pin.path, name: pin.name,
      icon: symbolPattern.test(pin.icon) && document.getElementById(pin.icon.slice(1))?.localName === 'symbol' ? pin.icon : ''
    }));
    const next = JSON.stringify(items);
    if (signature === next) return;
    signature = next;
    const focused = strip.contains(document.activeElement) ? document.activeElement.pathname : null;
    const links = items.map(item => {
      const link = document.createElement('a');
      link.href = new URL(item.path, location.origin).href;
      // Experience can set the document-wide default to open links in a new tab.
      link.target = '_self';
      link.title = item.name;
      link.setAttribute('aria-label', item.name);
      if (item.icon) {
        const svg = document.createElementNS(svgNS, 'svg');
        svg.setAttribute('aria-hidden', 'true');
        const use = document.createElementNS(svgNS, 'use');
        use.setAttribute('href', item.icon);
        svg.append(use);
        link.append(svg);
      }
      const name = document.createElement('span');
      name.textContent = item.name;
      link.append(name);
      return link;
    });
    strip.replaceChildren(...links);
    if (focused) links.find(link => link.pathname === focused)?.focus();
  }

  // Resolve the selected menu entry in the current tenant before asking the worker to save it.
  async function toggle(event, button, link) {
    if (!enabled || !event.isTrusted || pending.has(button) || !pins || !link?.isConnected) return;
    const originalScope = scope;
    const site = await currentScope(document.getElementById('experience-header'));
    if (!enabled || scope !== originalScope || !site || site.key !== scope?.key) return;
    const item = menuItem(link, site);
    if (!item) return;
    const add = button.getAttribute('aria-pressed') !== 'true';
    pending.add(button);
    button.setAttribute('aria-busy', 'true');
    try {
      // The worker serializes individual clicks with imports and other tabs' edits.
      const result = await chrome.runtime.sendMessage({type:'capability-pin', key:site.key, item, add});
      if (!result?.ok) throw new Error('Pin could not be saved.');
    } catch {
      button.title = 'Could not save this favorite. Try again.';
    } finally {
      pending.delete(button);
      button.removeAttribute('aria-busy');
    }
  }

  // Confirm the active Home path in this document when a queued write reaches the worker.
  chrome.runtime.onMessage.addListener((message, sender, respond) => {
    if (message?.type !== 'capability-pin-context' || sender.id !== chrome.runtime.id || sender.tab) return;
    const header = document.getElementById('experience-header');
    if (!enabled || !header?.querySelector('#grid-btn')) { respond(null); return; }
    currentScope(header).then(site => respond(enabled && site?.key === scope?.key ? site?.key : null), () => respond(null));
    return true;
  });

  // A newly opened drawer can receive a click or Enter before its first animation frame.
  // Set the native anchor's target at activation and leave the browser's modifier-key behavior intact.
  document.addEventListener('click', event => {
    if (!enabled) return;
    const link = event.target.closest?.('li > a[href]');
    const drawer = link?.closest('[role="presentation"]');
    if (!drawer || !drawer.querySelector('#applicationsHeader')) return;
    const header = document.getElementById('experience-header');
    const base = header?.querySelector('#grid-btn') && capabilityBase(header);
    if (!base || !menuItem(link, {base})) return;
    // Apply the override only to this activation so disabling favorites restores native behavior.
    const previous = link.getAttribute('target');
    link.target = '_self';
    setTimeout(() => {
      if (link.target !== '_self') return;
      if (previous === null) link.removeAttribute('target');
      else link.target = previous;
    }, 0);
  }, true);

  // Attach a separate button so starring an app never activates the native link.
  function renderMenu() {
    const drawer = document.getElementById('applicationsHeader')?.closest('[role="presentation"]');
    if (!drawer) return;
    // The drawer may keep a row in place while removing or replacing its app link.
    for (const star of drawer.querySelectorAll('li > .inav-cap-star')) {
      if (!star.parentElement.querySelector(':scope > a[href]')) star.remove();
    }
    for (const link of drawer.querySelectorAll('li > a[href]')) {
      const item = scope && pins && menuItem(link, scope);
      let button = link.parentElement.querySelector(':scope > .inav-cap-star');
      if (!item) { button?.remove(); continue; }
      if (!button) {
        button = document.createElement('button');
        button.type = 'button';
        button.className = 'inav-cap-star';
        const svg = document.createElementNS(svgNS, 'svg');
        svg.setAttribute('viewBox', '0 0 24 24');
        svg.setAttribute('aria-hidden', 'true');
        button.append(svg);
        button.addEventListener('click', event => toggle(event, button, button.parentElement.querySelector(':scope > a[href]')));
      }
      // Put the independent pin action before the native app icon in both visual and keyboard order.
      if (button.nextElementSibling !== link) link.before(button);
      const saved = pins.some(pin => pin.path === item.path);
      button.setAttribute('aria-label', 'Favorite ' + item.name);
      button.setAttribute('aria-pressed', String(saved));
      button.title = (saved ? 'Unpin ' : 'Pin ') + item.name;
      button.style.color = FavoriteAppearance.resolve(appearance, iconAppearance);
      FavoriteAppearance.render(button.firstElementChild, appearance);
    }
  }

  async function refresh() {
    frame = 0;
    const header = document.getElementById('experience-header');
    const grid = header?.querySelector('#grid-btn');
    const check = ++scopeCheck;
    const url = location.href;
    const site = grid ? await currentScope(header) : null;
    if (check !== scopeCheck || location.href !== url || (grid && !grid.isConnected)) return;
    if (scope?.key !== site?.key) {
      scope = site;
      pins = null;
      const read = ++revision;
      renderHeader(header, null);
      renderMenu();
      if (site) {
        try {
          const data = await chrome.storage.local.get([site.key, FavoriteAppearance.KEY, FavoriteAppearance.ICON_KEY]);
          if (scope?.key !== site.key) return;
          if (read === revision) pins = readPins(data[site.key], site);
          appearance = data[FavoriteAppearance.KEY];
          iconAppearance = data[FavoriteAppearance.ICON_KEY];
          schedule();
        } catch { /* Leave the native launcher available when storage cannot be read. */ }
      }
      return;
    }
    renderHeader(header, grid);
    renderMenu();
  }
  function schedule() {
    if (enabled && !frame) frame = requestAnimationFrame(refresh);
  }

  chrome.storage.onChanged.addListener((changes, area) => {
    if (area !== 'local') return;
    if (changes[enabledKey]) {
      preferenceChanged = true;
      setEnabled(changes[enabledKey].newValue !== false);
    }
    if (scope && changes[scope.key]) {
      revision++;
      pins = readPins(changes[scope.key].newValue, scope);
    }
    if (changes[FavoriteAppearance.KEY]) appearance = changes[FavoriteAppearance.KEY].newValue;
    if (changes[FavoriteAppearance.ICON_KEY]) iconAppearance = changes[FavoriteAppearance.ICON_KEY].newValue;
    if ((scope && changes[scope.key]) || changes[FavoriteAppearance.KEY] || changes[FavoriteAppearance.ICON_KEY]) schedule();
  });

  // Ellucian mounts the drawer on demand and can replace the entire header during navigation.
  const relevant = '#experience-header, #applicationsHeader, symbol[id^="ds-icon-"]';
  const observer = new MutationObserver(records => {
    for (const record of records) {
      if (record.target.closest?.('.inav-cap-pins, .inav-cap-star')) continue;
      if (record.target.closest?.('#experience-header, [role="presentation"]') ||
          [...record.addedNodes, ...record.removedNodes].some(n => n.matches?.(relevant) || n.querySelector?.(relevant))) {
        schedule(); break;
      }
    }
  });
  function setEnabled(value) {
    if (enabled === value) return;
    enabled = value;
    if (enabled) {
      observer.observe(document.body, { childList: true, subtree: true, attributes: true, attributeFilter: ['href','xlink:href'] });
      schedule();
      return;
    }
    // Drop pending lookups and remove injected controls without clearing the saved pins.
    scopeCheck++;
    revision++;
    observer.disconnect();
    cancelAnimationFrame(frame);
    frame = 0;
    scope = null;
    pins = null;
    renderHeader(null, null);
    for (const star of document.querySelectorAll('.inav-cap-star')) star.remove();
  }
  // A change delivered during startup takes precedence over an older preference read.
  chrome.storage.local.get({ [enabledKey]: true }).then(settings => {
    if (!preferenceChanged) setEnabled(settings[enabledKey] !== false);
  }).catch(() => {});
  window.addEventListener('popstate', schedule);
  window.addEventListener('pageshow', schedule);
  if (window.navigation) window.navigation.addEventListener('navigatesuccess', schedule);
})();
