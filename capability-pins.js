(() => {
  'use strict';

  const svgNS = 'http://www.w3.org/2000/svg';
  const symbolPattern = /^#ds-icon-[a-z0-9-]+$/i;
  let scope = null, revision = 0, frame = 0;
  let pins = null, appearance, iconAppearance, strip = null, signature = '';
  const pending = new WeakSet();

  // The native Home link identifies the Experience site and tenant shared by these three pages.
  function currentScope(header) {
    const home = header?.querySelector(':scope > a[href]');
    if (!home || home.origin !== location.origin || home.protocol !== 'https:') return null;
    const base = home.pathname.replace(/\/?$/, '/');
    if (!/^\/[^/]+\/$/.test(base)) return null;
    const path = location.pathname;
    const isHome = path.replace(/\/?$/, '/') === base;
    if (!isHome && !(path.startsWith(base) && /^app\/[^/]+\/[^/]+\/data-connect(?:-designer)?(?:\/|$)/i.test(path.slice(base.length)))) return null;
    return { base, key: 'capabilityPins:' + location.origin + base };
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
      link.href = item.path;
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

  // Read the latest list inside a same-origin lock so clicks in two tabs cannot overwrite one another.
  async function toggle(event, button, link) {
    if (!event.isTrusted || pending.has(button) || !pins || !link?.isConnected) return;
    const site = currentScope(document.getElementById('experience-header'));
    if (!site || site.key !== scope?.key) return;
    const item = menuItem(link, site);
    if (!item) return;
    const add = button.getAttribute('aria-pressed') !== 'true';
    pending.add(button);
    button.setAttribute('aria-busy', 'true');
    try {
      await navigator.locks.request('integration-navigator-capability-pins', async () => {
        const stored = await chrome.storage.local.get(site.key);
        const list = readPins(stored[site.key], site);
        const exists = list.some(pin => pin.path === item.path);
        if (add && !exists) await chrome.storage.local.set({ [site.key]: [...list, item] });
        if (!add && exists) await chrome.storage.local.set({ [site.key]: list.filter(pin => pin.path !== item.path) });
      });
    } catch {
      button.title = 'Could not save this favorite. Try again.';
    } finally {
      pending.delete(button);
      button.removeAttribute('aria-busy');
    }
  }

  // Attach a separate button so starring an app never activates the native link.
  function renderMenu() {
    const drawer = document.getElementById('applicationsHeader')?.closest('[role="presentation"]');
    if (!drawer) return;
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
        link.after(button);
      }
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
    const site = grid ? currentScope(header) : null;
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
    if (!frame) frame = requestAnimationFrame(refresh);
  }

  chrome.storage.onChanged.addListener((changes, area) => {
    if (area !== 'local') return;
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
  observer.observe(document.body, { childList: true, subtree: true, attributes: true, attributeFilter: ['href','xlink:href'] });
  window.addEventListener('popstate', schedule);
  window.addEventListener('pageshow', schedule);
  if (window.navigation) window.navigation.addEventListener('navigatesuccess', schedule);
  schedule();
})();
