(() => {
  'use strict';

  // Only the isolated script can save the user's preference. File contents stay with the native editor.
  const key = 'jobFilesFormattedView';
  const signal = 'ellucian-job-file-view-change';
  let enabled = true, loaded = false, revision = 0, control = null, frame = 0;
  let navigation = !globalThis.FeatureTools;
  const syncPage = () => document.dispatchEvent(new Event(signal));

  // Release controls when the user closes the dialog, switches file types, or leaves Packages.
  function detach() {
    if (!control) return;
    control.label.remove();
    control = null;
    syncPage();
  }

  function refresh() {
    frame = 0;
    const onPackages = /\/data-connect(?:\/|$)/iu.test(location.pathname);
    const host = navigation && loaded && onPackages && document.querySelector('[role="dialog"] #review-file.ace_editor');
    const heading = host && host.closest('[role="dialog"]').querySelector('h1,h2,h3,[role="heading"]');
    const format = heading?.textContent?.trim().match(/\.(csv|json)$/iu)?.[1]?.toLowerCase();
    if (!format) { detach(); return; }

    // React may reuse the same dialog for a different file or replace just its heading.
    if (control?.host !== host || control.heading !== heading || !control.label.isConnected) {
      detach();
      const label = document.createElement('label');
      label.className = 'inav-file-switch';
      const input = document.createElement('input');
      input.type = 'checkbox';
      input.setAttribute('role', 'switch');
      label.append(input, 'Formatted view');
      heading.after(label);
      control = { host, heading, label, input };

      // Accept only the actual user's switch action, never a synthetic page request to write storage.
      input.addEventListener('change', async event => {
        if (!event.isTrusted || control?.input !== input) return;
        const previous = enabled;
        const value = input.checked;
        const edit = ++revision;
        enabled = value;
        input.disabled = true;
        syncPage();
        try {
          await chrome.storage.local.set({ [key]: value });
        } catch {
          if (revision === edit) enabled = previous;
        } finally {
          input.disabled = false;
          schedule();
        }
      });
    }
    control.input.checked = enabled;
    syncPage();
  }

  // Batch native modal and Ace initialization changes, including after in-app navigation.
  function schedule() {
    if (!frame) frame = requestAnimationFrame(refresh);
  }
  const observer = new MutationObserver(records => {
    if (!control && !/\/data-connect(?:\/|$)/iu.test(location.pathname)) return;
    if (records.some(record => !record.target.parentElement?.closest('.inav-file-output,.inav-file-switch') &&
        !record.target.closest?.('.inav-file-output,.inav-file-switch'))) schedule();
  });
  function observe(value) {
    navigation = value;
    observer.disconnect();
    if (navigation) observer.observe(document.body, { childList: true, characterData: true, subtree: true });
    else detach();
    schedule();
  }

  // Keep all open preview dialogs in sync. A delayed startup read must yield to newer choices.
  chrome.storage.onChanged.addListener((changes, area) => {
    if (area !== 'local' || !changes[key]) return;
    revision++;
    enabled = changes[key].newValue !== false;
    schedule();
  });
  const initial = revision;
  chrome.storage.local.get({ [key]: true }).then(settings => {
    if (revision === initial) enabled = settings[key] !== false;
    loaded = true;
    schedule();
  }).catch(() => {});
  if (globalThis.FeatureTools) FeatureTools.subscribe(state => observe(state.navigation));
  else observe(true);
  window.addEventListener('popstate', schedule);
  window.addEventListener('pageshow', schedule);
})();
