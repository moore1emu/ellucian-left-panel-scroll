'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
// Exercise the actual fixed-message boundary without loading credentials or requesting source files.
const source = fs.readFileSync(path.join(__dirname, '..', 'pipeline-export-tab.js'), 'utf8');
const start = source.indexOf('  function gitFailure(error) {');
const end = source.indexOf('\n  // Collect exactly', start);
assert.ok(start >= 0 && end > start);
const context = {};
vm.runInNewContext(source.slice(start, end) + '\nglobalThis.feedback = gitFailure;', context);
// A reader version failure must explain the missing confirmation and pre-upload boundary.
assert.match(context.feedback({ sourceReason: 'version-mismatch' }), /did not confirm.*No files were uploaded/s);
assert.match(context.feedback({ sourceReason: 'request-timeout' }), /timed out/);
// Unknown service data must never escape into the user-visible status.
assert.doesNotMatch(context.feedback({ sourceReason: 'SECRET', message: 'SECRET' }), /SECRET/);
assert.match(context.feedback({ message: 'Git result is uncertain. Check the remote branch/history before any new push.' }), /uncertain/);
console.log('Git source feedback checks passed.');
