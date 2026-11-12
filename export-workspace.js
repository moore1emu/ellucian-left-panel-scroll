(() => {
  'use strict';
  // Keep tabs in one top-level extension document; no iframe, reload, ticket change or new source authority.
  const tabs = [...document.querySelectorAll('.workspace-tabs [role="tab"]')];
  let contextReader = () => null;
  function show(view, advanced = false) {
    const target = document.getElementById('workspace-' + view);
    if (!target) { document.getElementById('git-return-export')?.click(); return false; }
    for (const tab of tabs) {
      const active = tab.getAttribute('aria-controls') === target.id;
      tab.setAttribute('aria-selected', String(active));
      tab.tabIndex = active ? 0 : -1;
      const panel = document.getElementById(tab.getAttribute('aria-controls'));
      if (panel) panel.hidden = !active;
    }
    if (advanced) document.querySelector('.manual-config').open = true;
    document.dispatchEvent(new CustomEvent('workspace-view', {detail:{view}}));
    return true;
  }
  // Use normal reading order with arrow/Home/End navigation, without touching the export URL hash.
  tabs.forEach((tab,index) => {
    tab.addEventListener('click', () => show(tab.getAttribute('aria-controls').replace('workspace-','')));
    tab.addEventListener('keydown', event => {
      const next = {ArrowRight:tabs[(index+1)%tabs.length],ArrowLeft:tabs[(index+tabs.length-1)%tabs.length],Home:tabs[0],End:tabs.at(-1)}[event.key];
      if (!next) return;
      event.preventDefault(); next.click(); next.focus();
    });
  });
  // Share only already-verified display context locally; this never grants native access or consent.
  globalThis.GitWorkspace = Object.freeze({show, context:()=>contextReader(), setContextReader:reader=>{contextReader=reader;}});
  if (!document.getElementById('workspace-export')) show(['#locations','#location-advanced'].includes(location.hash) ? 'configuration' : 'connections');
})();
