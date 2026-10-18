(() => {
  'use strict';

  // Keep task selection and page context in this popup only, never in saved preferences.
  const tabs = [...document.querySelectorAll('.settings-tabs [role="tab"]')];
  const panels = [...document.querySelectorAll('.settings-panel')];
  const label = document.querySelector('#settings-context');
  const scroller = document.querySelector('.settings-panels');
  let page = '';
  let readSequence = 0;
  let pendingContext;

  // Switch tasks without rebuilding controls, losing pending input, or writing settings.
  function select(task, focus = false) {
    const selected = tabs.find(tab => tab.id === `tab-${task}`);
    if (!selected) return;
    tabs.forEach(tab => {
      const active = tab === selected;
      tab.setAttribute('aria-selected', String(active));
      tab.tabIndex = active ? 0 : -1;
    });
    panels.forEach(panel => { panel.hidden = panel.id !== selected.getAttribute('aria-controls'); });
    scroller.scrollTop = 0;
    if (focus) selected.focus();
    // Let backup assignment recheck only when its task becomes visible, not on idle timers.
    document.dispatchEvent(new CustomEvent('settings-task-changed', { detail: { task } }));
  }

  // Standard tab keys keep hidden task controls out of the keyboard sequence.
  tabs.forEach((tab, index) => {
    tab.addEventListener('click', () => select(tab.id.slice(4)));
    tab.addEventListener('keydown', event => {
      if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) return;
      event.preventDefault();
      const next = event.key === 'Home' ? 0 : event.key === 'End' ? tabs.length - 1
        : (index + (event.key === 'ArrowRight' ? 1 : -1) + tabs.length) % tabs.length;
      select(tabs[next].id.slice(4), true);
    });
  });

  // Read the active top-level document's existing route without tab-URL permissions or service calls.
  async function refreshContext() {
    const sequence = ++readSequence;
    page = '';
    label.textContent = 'Checking Current Page…';
    document.dispatchEvent(new Event('settings-context-changed'));
    try {
      const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
      if (!Number.isInteger(tab?.id)) throw new Error('No active document.');
      const context = await chrome.tabs.sendMessage(tab.id, { type: 'designer-ownership-context' }, { frameId: 0 });
      const url = new URL(context?.url);
      if (url.protocol !== 'https:') throw new Error('Unsupported document.');
      const resolved = /\/data-connect\/home\/?$/iu.test(url.pathname) ? 'packages'
        : /\/data-connect-designer\/?$/iu.test(url.pathname) ? 'designer' : /\/APIDesigner\/?$/u.test(url.pathname) ? 'api-designer' : '';
      if (sequence !== readSequence) return page;
      page = resolved;
      label.textContent = page === 'packages' ? 'Integration Packages' : page === 'designer' ? 'Integration Designer' : page === 'api-designer' ? 'API Designer' : 'Open an Integration Page';
    } catch (_error) {
      // Missing receivers or site access must not enable a page-specific action by guessing.
      if (sequence !== readSequence) return page;
      page = '';
      label.textContent = 'Page Connection Unavailable';
    }
    document.dispatchEvent(new Event('settings-context-changed'));
    return page;
  }

  // Existing popup behaviors share only presentation state; worker/content checks still authorize operations.
  globalThis.PopupTabs = Object.freeze({ select, get page() { return page; },
    refreshContext() { pendingContext = refreshContext(); return pendingContext; },
    ready() { return pendingContext; } });
  pendingContext = refreshContext();
})();
