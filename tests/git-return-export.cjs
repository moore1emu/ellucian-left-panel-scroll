'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
// Load only the navigation helper; no credentials, source payloads, or live browser are needed.
const source = fs.readFileSync(path.join(__dirname, '..', 'git-return-export.js'), 'utf8');
const base = 'chrome-extension://synthetic/pipeline-export.html';
async function check(tabs, openerTabId, failure = false) {
  // Capture navigation calls and the accessible missing-session feedback.
  const calls = [];
  const status = { textContent: '' };
  const button = { addEventListener: (_, handler) => { button.click = handler; } };
  vm.runInNewContext(source, {
    document: { getElementById: id => id === 'git-return-export' ? button : status },
    chrome: {
      runtime: { getURL: () => base },
      tabs: {
        getCurrent: async () => ({ openerTabId }),
        query: async options => { assert.equal(options.url, base + '*'); return tabs; },
        update: async (id, options) => { if (failure) throw new Error('closed'); calls.push({ id, ...options }); }
      },
      windows: { update: async (id, options) => { calls.push({ windowId: id, ...options }); } }
    }
  });
  await button.click();
  assert.equal(button.disabled, false);
  return { calls, text: status.textContent };
}
(async () => {
  // Preserve the originating session without navigating or recreating any tab.
  const a = { id: 1, windowId: 8, url: base + '#a' };
  const b = { id: 2, windowId: 9, url: base + '#b' };
  assert.deepEqual((await check([a, b], 2)).calls, [{ id: 2, active: true }, { windowId: 9, focused: true }]);
  // Permit a sole existing export when settings was opened from the popup.
  assert.equal((await check([a])).calls[0].id, 1);
  // Fail safely for ambiguity, absence, deceptive paths, and tabs closed during activation.
  assert.match((await check([a, b])).text, /Multiple exports/);
  assert.match((await check([])).text, /No export/);
  assert.match((await check([{ ...a, url: base + '.other' }])).text, /No export/);
  assert.match((await check([a], 1, true)).text, /Could not return/);
  console.log('Git return navigation checks passed.');
})().catch(error => { console.error(error); process.exitCode = 1; });
