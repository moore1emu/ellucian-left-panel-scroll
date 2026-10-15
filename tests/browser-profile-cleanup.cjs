'use strict';

// Exercise real test cleanup code without launching browsers or using real account data.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const vm = require('node:vm');
const { createRequire } = require('node:module');
const temporaryRoot = fs.realpathSync(os.tmpdir());
const files = process.argv.length > 2 ? process.argv.slice(2).map((file) => path.resolve(file)) :
  ['published-fitting-details.cjs', 'tenant-favorites-browser.cjs'].map((file) => path.join(__dirname, file));

async function check(file, scenario) {
  // Inspect authored tests only, never environment files or browser storage contents.
  assert.ok(/\.(?:cjs|js)$/u.test(file) && !path.basename(file).startsWith('.env'));
  const profiles = [];
  let closed = false;
  const messages = [];
  const testProcess = { env: { ...process.env, INTEGRATION_NAVIGATOR_ACE: 'unused-synthetic-ace.js' }, exitCode: 0,
    exit: () => { throw new Error('Unexpected forced process exit'); } };
  const fakeContext = { route: async () => { throw new Error('Synthetic assertion failure'); },
    close: async () => { closed = true; if (scenario === 'close-failure') throw new Error('Synthetic close failure'); } };
  const fakePlaywright = { chromium: { launchPersistentContext: async (profile) => {
    assert.equal(path.dirname(profile), temporaryRoot);
    if (scenario === 'launch-failure') throw new Error('Synthetic launch failure');
    return fakeContext;
  } } };
  const fakeFs = { ...fs,
    mkdtempSync: (prefix) => { assert.equal(path.dirname(prefix), temporaryRoot); const profile = fs.mkdtempSync(prefix); profiles.push(profile); return profile; },
    rmSync: (profile, options) => {
      // A failed removal must surface as failure rather than quietly preserving a profile.
      assert.ok(profiles.includes(profile));
      assert.ok(options.maxRetries > 0 && options.retryDelay > 0);
      if (scenario === 'remove-failure') throw Object.assign(new Error('Synthetic locked profile'), { code: 'EBUSY' });
      fs.rmSync(profile, options);
    },
  };
  const localRequire = createRequire(file);
  const context = vm.createContext({ __dirname: path.dirname(file), __filename: file, process: testProcess, setTimeout, clearTimeout,
    console: { log: (...values) => messages.push(values), error: (...values) => messages.push(values) },
    require: (name) => name === 'node:fs' ? fakeFs : name === 'playwright' || name === process.env.PLAYWRIGHT_MODULE ? fakePlaywright : localRequire(name) });
  try {
    // Expose only the existing asynchronous test's completion promise; preserve its assertions and finally block.
    const source = fs.readFileSync(file, 'utf8');
    assert.ok(source.includes('(async () => {'), 'Test completion pattern changed');
    vm.runInContext(source.replace('(async () => {', 'globalThis.cleanupCompletion = (async () => {'), context, { filename: file });
    await context.cleanupCompletion;
    assert.equal(profiles.length, 1);
    assert.equal(testProcess.exitCode, 1, 'A failed test or cleanup must not report success');
    assert.equal(closed, scenario !== 'launch-failure');
    assert.equal(fs.existsSync(profiles[0]), scenario === 'remove-failure');
    assert.ok(messages.length > 0, 'Failures must be reported');
  } finally {
    // Remove even intentionally locked-fixture leftovers, validating their exact owned temp parent first.
    for (const profile of profiles) {
      assert.equal(path.dirname(profile), temporaryRoot);
      if (fs.existsSync(profile)) assert.equal(fs.lstatSync(profile).isSymbolicLink(), false);
      fs.rmSync(profile, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 });
    }
  }
}

(async () => {
  for (const file of files) {
    for (const scenario of ['launch-failure', 'assertion-failure', 'close-failure', 'remove-failure']) await check(file, scenario);
  }
  console.log(`PASS profile cleanup: ${files.length} tests; launch/assertion/close/remove failures, owned-temp containment, and no leftover profiles`);
})().catch((error) => { console.error(error); process.exitCode = 1; });
