'use strict';

// Check submission metadata against the maintained manifest without credentials or store access.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const root = path.resolve(__dirname, '..');
const manifest = JSON.parse(fs.readFileSync(path.join(root, 'manifest.json'), 'utf8'));
const submission = fs.readFileSync(path.join(root, 'CHROMEWEBSTORE.md'), 'utf8');

// Document-bound messaging is the API floor; explicit CSP hardens objects/base URLs without extra permissions.
assert.equal(manifest.minimum_chrome_version, '106');
assert.equal(manifest.content_security_policy.extension_pages, "script-src 'self'; object-src 'none'; base-uri 'none';");
assert.deepEqual(manifest.permissions, ['storage']);
assert.deepEqual(manifest.optional_permissions, ['scripting']);
assert.deepEqual(manifest.optional_host_permissions, ['https://*/*']);
assert.ok(submission.includes(`Candidate: ${manifest.version}`));
assert.ok(submission.includes(manifest.description));

// Public listing copy excludes the advanced shortcut; reviewer instructions remain a separate disclosure.
const listing = submission.split('## Public Store Listing')[1].split('## Assets')[0];
assert.doesNotMatch(listing, /shift\s*\+?\s*d|include all accessible|advanced override/i);
const reviewer = submission.split('## Reviewer Instructions')[1];
assert.match(reviewer, /Shift\+D/);
assert.match(reviewer, /does not grant/);
assert.equal(manifest.description.length <= 132, true);

// Every shipped reference must exist; inspect PNG headers without image tools or extra dependencies.
const icons = { ...manifest.icons, ...manifest.action.default_icon };
for (const [size, file] of Object.entries(icons)) {
  const png = fs.readFileSync(path.join(root, file));
  assert.equal(png.subarray(1, 4).toString('ascii'), 'PNG');
  assert.equal(png.readUInt32BE(16), Number(size));
  assert.equal(png.readUInt32BE(20), Number(size));
}
for (const entry of manifest.content_scripts) {
  for (const file of [...(entry.js || []), ...(entry.css || [])]) assert.ok(fs.existsSync(path.join(root, file)), file);
}
console.log('PASS release metadata: API floor, explicit CSP, unchanged permissions, icon dimensions, script references, and separate public/reviewer copy');
