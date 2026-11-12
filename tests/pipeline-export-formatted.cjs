'use strict';

// Inspect synthetic ZIP entries directly; no service, credential, or institution source is used.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const context = vm.createContext({ TextEncoder, Uint8Array, Uint32Array, DataView, Blob });
for (const file of ['pipeline-export-core.js', 'pipeline-export-session.js']) vm.runInContext(fs.readFileSync(path.join(__dirname, '..', file), 'utf8'), context);
const core = context.PipelineExportCore;
const entries = [
  { packageName: 'Package', name: 'Pipeline', type: 'pipeline', version: 'v1.0.4' },
  { packageName: 'Package', name: 'Pipeline', type: 'pipeline', version: 'v2.0.5' },
  { packageName: 'Package', name: 'Sub', type: 'sub-pipeline', version: 'v3.0.1' },
  { packageName: 'Package', name: 'API', type: 'api', version: 'v1.2.3' },
  { packageName: 'Package', name: 'Function', type: 'transformer', version: 'v1.0.0' },
];
const javascript = '// synthetic\nfunction transform(message) { return message; }\n';
const data = entry => entry.type === 'transformer' ? javascript : {
  name: entry.name, version: entry.type === 'sub-pipeline' ? null : entry.version,
  code: 'function transform() {\r\n\tconst text = "é";\n\treturn "\\n";\n}',
  literal: '\\n\\t', unicode: '你好',
};

async function unpack(zip) {
  const bytes = Buffer.from(await zip.arrayBuffer());
  const files = new Map();
  for (let offset = 0; bytes.readUInt32LE(offset) === 0x04034b50;) {
    const length = bytes.readUInt16LE(offset + 26);
    const start = offset + 30 + length + bytes.readUInt16LE(offset + 28);
    const size = bytes.readUInt32LE(offset + 18);
    files.set(bytes.subarray(offset + 30, offset + 30 + length).toString(), bytes.subarray(start, start + size).toString());
    offset = start + size;
  }
  return files;
}

async function run() {
  // Filename escaping never changes the verified environment/tenant used to authorize source requests.
  assert.equal(core.archiveName('uncproductions'), 'integration-navigator-uncproductions.zip');
  assert.equal(core.archiveName('../A:B'), 'integration-navigator-..%2FA%3AB.zip');
  let reads = 0;
  const options = { read: async entry => { reads++; return data(entry); }, verify: async () => {}, environment: 'uncproductions' };
  const raw = await unpack(await context.PipelineExportSession.collect(entries, options));
  assert.equal(raw.size, 5);
  assert.equal(reads, 5);
  assert.equal([...raw.keys()].some(name => name.includes('README') || name.includes('/Source/')), false);
  const formatted = await unpack(await context.PipelineExportSession.collect(entries, { ...options, formatted: true }));
  assert.equal(formatted.size, 11);
  assert.equal(reads, 10, 'Formatted must not request each source twice');
  for (const entry of entries) {
    const filename = core.filePath(entry).split('/')[1];
    assert.equal(formatted.get('Package/Source/' + filename), raw.get('Package/' + filename));
  }
  // Review decoding expands real JSON whitespace escapes, preserves literal backslashes, quotes, and Unicode.
  const review = formatted.get('Package/Formatted/Pipeline_v1.json');
  assert.ok(review.includes('function transform() {\r\n\tconst text'));
  assert.ok(review.includes('\\\\n\\\\t'));
  assert.ok(review.includes('\\"é\\"'));
  assert.ok(review.includes('你好'));
  assert.throws(() => JSON.parse(review));
  assert.equal(JSON.parse(formatted.get('Package/Source/Sub_v3.json')).version, null);
  assert.equal(formatted.get('Package/Source/Function.js'), javascript);
  assert.equal(formatted.get('Package/Formatted/Function.js'), javascript);
  const readme = formatted.get('Package/README.md');
  assert.match(readme, /Environment: uncproductions/);
  assert.match(readme, /not for import or execution/);
  assert.match(readme, /\| Pipeline \| Pipeline \| 1 \| v1.0.4 \|/);
  assert.match(readme, /\| Pipeline \| Pipeline \| 2 \| v2.0.5 \|/);
  assert.match(readme, /\| Function \| Transformer \| — \| v1.0.0 \|/);
  assert.match(readme, /package-reported/);

  // Malicious labels stay inert Markdown text and cannot create extra README rows or links.
  const unsafe = { ...entries[0], name: '[link](https://invalid.test)|<img>\nnew row' };
  const escaped = await unpack(await context.PipelineExportSession.collect([unsafe], { ...options, formatted: true }));
  assert.match(escaped.get('Package/README.md'), /&#91;link&#93;\(https:\/\/invalid.test\)&#124;&lt;img&gt; new row/);
  // Invalid paths and the unchanged physical-file cap fail before any output/download.
  assert.throws(() => core.makeZip([{ path: 'Package/Source/../Bad.json', bytes: new Uint8Array() }]), /Invalid/);
  assert.throws(() => core.makeZip([{ path: 'Package/Other/Bad.json', bytes: new Uint8Array() }]), /Invalid/);
  assert.throws(() => core.makeZip([{ path: 'Package/Formatted/README.md', bytes: new Uint8Array() }]), /Invalid/);
  const before = reads;
  await assert.rejects(context.PipelineExportSession.collect(Array.from({ length: 5000 }, () => entries[0]), { ...options, formatted: true }), /Too many/);
  assert.equal(reads, before);
  // A tiny synthetic budget proves generated README bytes count too, without allocating a huge test payload.
  const limited = vm.createContext({ TextEncoder, PipelineExportCore: { ...core, MAX_BYTES: 500 } });
  vm.runInContext(fs.readFileSync(path.join(__dirname, '..', 'pipeline-export-session.js'), 'utf8'), limited);
  await assert.rejects(limited.PipelineExportSession.collect([entries[4]], { ...options, formatted: true }), /64 MB/);
  await assert.rejects(context.PipelineExportSession.collect(entries, { ...options, formatted: true, read: async () => { throw Error('Unavailable'); } }), /Unavailable/);
  console.log('PASS formatted export: unchanged raw/Source bytes, per-major folders, auto-sync whitespace/literal escapes, package README, environment filename, one read per source, and archive guards');
}
run().catch(error => { console.error(error); process.exitCode = 1; });
