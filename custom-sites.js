"use strict";

// Share domain validation between the settings page and the background worker.
globalThis.CustomSites = (() => {
  const KEY = "customSites";
  const MESSAGE = "custom-sites-sync";
  const SCRIPT_PREFIX = "custom-site-";

  // Accept a domain or a full Experience URL, but save only its HTTPS origin.
  function normalize(value) {
    if (typeof value !== "string" || !value.trim()) throw new Error("Enter your university's Experience URL.");
    const text = value.trim();
    let url;
    try {
      url = new URL(/^[a-z][a-z\d+.-]*:\/\//i.test(text) ? text : `https://${text}`);
    } catch {
      throw new Error("Enter a valid HTTPS website address.");
    }

    // Reject credentials, wildcards, ports, and local/IP addresses rather than widening access.
    const domain = /^(?:[a-z\d](?:[a-z\d-]{0,61}[a-z\d])?\.)+[a-z](?:[a-z\d-]{0,61}[a-z\d])?$/i;
    if (url.protocol !== "https:" || url.username || url.password || url.port || !domain.test(url.hostname) || url.hostname.endsWith(".localhost")) {
      throw new Error("Use an HTTPS domain without credentials, wildcards, or a custom port.");
    }
    return url.origin;
  }

  // Discard malformed saved values and duplicates without changing other preferences.
  function normalizeList(values) {
    if (!Array.isArray(values)) return [];
    const origins = new Set();
    for (const value of values) {
      try { origins.add(normalize(value)); } catch { /* Ignore an invalid saved domain. */ }
    }
    return [...origins];
  }

  // Read built-in sites from the manifest so their list has only one source of truth.
  function defaults() {
    return normalizeList(chrome.runtime.getManifest().content_scripts.flatMap((script) => script.matches));
  }

  // Request only the exact host; do not include its subdomains or every HTTPS site.
  function pattern(origin) {
    return `${origin}/*`;
  }

  // Register the existing page files only for saved domains with user-granted access.
  async function sync() {
    if (!await chrome.permissions.contains({ permissions: ["scripting"] })) return;
    const saved = await chrome.storage.local.get({ [KEY]: [] });
    const builtIn = defaults();
    const candidates = normalizeList(saved[KEY]).filter((origin) => !builtIn.includes(origin));
    const matches = [];
    for (const origin of candidates) {
      if (await chrome.permissions.contains({ origins: [pattern(origin)] })) matches.push(pattern(origin));
    }

    // Mirror the static script order, worlds, CSS, and timing without altering standard sites.
    const desired = matches.length ? chrome.runtime.getManifest().content_scripts.map((script, index) => ({
      id: `${SCRIPT_PREFIX}${index}`,
      matches,
      ...(script.js ? { js: script.js } : {}),
      ...(script.css ? { css: script.css } : {}),
      world: script.world || "ISOLATED",
      runAt: script.run_at || "document_idle",
      allFrames: false,
      persistAcrossSessions: true,
    })) : [];
    const registered = (await chrome.scripting.getRegisteredContentScripts()).filter((script) => script.id.startsWith(SCRIPT_PREFIX));

    // Remove only this feature's obsolete registrations, not another feature's scripts.
    const obsolete = registered.filter((script) => !desired.some((next) => next.id === script.id)).map((script) => script.id);
    if (obsolete.length) await chrome.scripting.unregisterContentScripts({ ids: obsolete });

    // Keep unchanged registrations intact, avoiding gaps when the worker wakes up.
    const updates = [];
    const additions = [];
    for (const script of desired) {
      const previous = registered.find((entry) => entry.id === script.id);
      if (!previous) additions.push(script);
      else if (Object.keys(script).some((key) => JSON.stringify(script[key]) !== JSON.stringify(previous[key]))) updates.push(script);
    }
    if (updates.length) await chrome.scripting.updateContentScripts(updates);
    if (additions.length) await chrome.scripting.registerContentScripts(additions);
  }

  return Object.freeze({ KEY, MESSAGE, normalize, normalizeList, defaults, pattern, sync });
})();
