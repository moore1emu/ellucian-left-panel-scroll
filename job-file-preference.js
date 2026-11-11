(() => {
  'use strict';

  // Only the isolated script saves display choices. File contents stay in the native editor.
  const formatted = { key: 'jobFilesFormattedView', initial: true, value: true, revision: 0 };
  const wrapping = { key: 'jobFilesWrapText', initial: false, value: false, revision: 0 };
  const preferences = [formatted, wrapping];
  const signal = 'ellucian-job-file-view-change';
  let loaded = false, control = null, frame = 0;
  let navigation = !globalThis.FeatureTools;
  const syncPage = () => document.dispatchEvent(new Event(signal));

  // Release both controls when the native dialog closes or changes to an unsupported file.
  function detach() {
    if (!control) return;
    control.group.remove();
    control = null;
    syncPage();
  }

  function addChoice(group, text, preference) {
    const label = document.createElement('label');
    const input = document.createElement('input');
    input.type = 'checkbox';
    input.checked = preference.value;
    if (preference === formatted) input.setAttribute('role', 'switch');
    label.append(input, text);
    group.append(label);

    // Roll back only this choice if the save fails and a newer storage update has not arrived.
    input.addEventListener('change', async event => {
      if (!event.isTrusted || control?.group !== group) return;
      const previous = preference.value;
      const edit = ++preference.revision;
      preference.value = input.checked;
      input.disabled = true;
      control.wrap.parentElement.hidden = !formatted.value;
      schedule();
      syncPage();
      try {
        await chrome.storage.local.set({ [preference.key]: preference.value });
      } catch {
        if (preference.revision === edit) preference.value = previous;
      } finally {
        input.disabled = false;
        schedule();
      }
    });
    return input;
  }

  function refresh() {
    frame = 0;
    const onPackages = /\/data-connect(?:\/|$)/iu.test(location.pathname);
    const host = navigation && loaded && onPackages && document.querySelector('[role="dialog"] #review-file.ace_editor');
    const dialog = host && host.closest('[role="dialog"]');
    const heading = dialog && dialog.querySelector('h1,h2,h3,[role="heading"]');
    if (!heading?.textContent?.trim().match(/\.(csv|json)$/iu)) { detach(); return; }

    // Prefer the footer's text button over the icon-only Close control in some dialog headers.
    const close = Array.from(dialog.querySelectorAll('button,[role="button"],input[type="button"]'))
      .find(button => (button.textContent.trim() || button.value || '').toLowerCase() === 'close');
    if (!control || control.host !== host || !control.group.isConnected) {
      detach();
      const group = document.createElement('span');
      group.className = 'inav-file-switch';
      const mode = addChoice(group, 'Formatted view', formatted);
      const wrap = addChoice(group, 'Wrap text', wrapping);
      control = { host, group, mode, wrap };
    }
    // The footer may arrive after the editor or be replaced while the same file is open.
    if (close) {
      if (close.previousElementSibling !== control.group) close.before(control.group);
    } else if (!control.group.isConnected) {
      dialog.append(control.group);
    }
    control.mode.checked = formatted.value;
    control.wrap.checked = wrapping.value;
    control.wrap.parentElement.hidden = !formatted.value;
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

  // Apply updates independently so a wrap change cannot overwrite a newer formatted-mode choice.
  chrome.storage.onChanged.addListener((changes, area) => {
    if (area !== 'local') return;
    for (const preference of preferences) {
      if (!changes[preference.key]) continue;
      preference.revision++;
      preference.value = changes[preference.key].newValue ?? preference.initial;
      schedule();
    }
  });
  chrome.storage.local.get({ [formatted.key]: true, [wrapping.key]: false }).then(settings => {
    for (const preference of preferences) {
      if (!preference.revision) preference.value = settings[preference.key] ?? preference.initial;
    }
    loaded = true;
    schedule();
  }).catch(() => {});
  if (globalThis.FeatureTools) FeatureTools.subscribe(state => observe(state.navigation));
  else observe(true);
  window.addEventListener('popstate', schedule);
  window.addEventListener('pageshow', schedule);
})();
