"use strict";

// Load only the pure planner/ZIP module, never a live account, session, or reference export.
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const context = vm.createContext({ TextEncoder, Uint8Array, Uint32Array, DataView, Blob });
vm.runInContext(fs.readFileSync(path.resolve(__dirname, "../pipeline-export-core.js"), "utf8"), context);
const core = context.PipelineExportCore;

// Include normal integrations, APIs, sub-pipelines, older releases, and an unrelated supplied record.
const packages = [{ name: "Demo Package", pipelines: [
  { name: "Demo Pipeline", version: "v1.9.9", type: "integration" },
  { name: "Demo Pipeline", version: "v1.10.0", type: "integration" },
  { name: "Demo API", version: "0.2.0", type: "api" },
  { name: "Demo Sub", version: "2.0.0", type: "sub-pipeline" },
  { name: "Supplier Pipeline", version: "1.0.0", type: "pipeline" },
  { name: "Unknown Type", version: "1.0.0", type: "constructor" },
] }];
const cache = { syntheticTenant: { packages: [{ name: "Demo Package", pipelines: ["Demo Pipeline", "Demo API", "Demo Sub"] }] } };

// Default export needs both consent and recorded exact package/name ownership.
assert.throws(() => core.buildPlan(packages, cache), /Enable Shared From/);
assert.throws(() => core.buildPlan(packages, {}, { sharedFromEnabled: true }), /Visit Designer/);
const plan = core.buildPlan(packages, cache, { sharedFromEnabled: true });
assert.equal(plan.entries.length, 3);
assert.equal(plan.entries.find((item) => item.name === "Demo Pipeline").version, "v1.10.0");
assert.equal(plan.skipped, 1);
assert.equal(plan.override, false);
assert.equal(core.buildPlan(packages, { tenant: { packages: [{ name: null, pipelines: ["Supplier Pipeline"] }] } }, { overrideConfirmed: true }).entries.length, 4);

// Similar spelling and an unrecorded package must not expand ownership eligibility.
assert.equal(core.buildPlan([{ ...packages[0], name: "demo package" }], cache, { sharedFromEnabled: true }).entries.length, 0);
assert.throws(() => core.buildPlan(packages, { tenant: { packages: [{ name: null, pipelines: ["Demo Pipeline"] }] } }, { sharedFromEnabled: true }), /Visit Designer/);
assert.throws(() => core.compareVersions("1.0.0-beta", "1.0.0"), /Unsupported/);
assert.equal(core.compareVersions("v2.0.0", "1.99.99"), 1);

// Keep independent published majors and collapse only minor/patch revisions within the same major.
const versions = ['v1.0.0', 'v1.0.4', 'v2.0.1', 'v2.0.5', 'v10.0.0', 'v10.0.2'];
const majors = core.buildPlan([{ name: 'Majors', pipelines: ['pipeline', 'sub-pipeline', 'api', 'transformer'].flatMap((type) =>
  versions.map((version) => ({ name: type, type, version }))) }], { tenant: { packages: [{ name: 'Majors', pipelines: ['pipeline', 'sub-pipeline', 'api'], transformFunctions: ['transformer'] }] } }, { sharedFromEnabled: true });
for (const type of ['pipeline', 'sub-pipeline']) {
  assert.deepEqual(Array.from(majors.entries.filter((entry) => entry.type === type), (entry) => entry.version), ['v1.0.4', 'v2.0.5', 'v10.0.2']);
  assert.deepEqual(Array.from(majors.entries.filter((entry) => entry.type === type), core.filePath), [`Majors/${type}_v1.json`, `Majors/${type}_v2.json`, `Majors/${type}_v10.json`]);
}
// Unrequested API/transformer version selection and filename formats stay unchanged.
assert.equal(majors.entries.filter((entry) => entry.type === 'api').length, 1);
assert.equal(majors.entries.find((entry) => entry.type === 'api').version, 'v10.0.2');
assert.equal(core.filePath(majors.entries.find((entry) => entry.type === 'api')), 'Majors/api.json');
assert.equal(majors.entries.filter((entry) => entry.type === 'transformer').length, 1);
assert.equal(core.filePath(majors.entries.find((entry) => entry.type === 'transformer')), 'Majors/transformer.js');

// Exercise large metadata sets without a 20/100-result display cap.
const many = Array.from({ length: 120 }, (_, index) => ({ name: `Package ${index}`, pipelines: Array.from({ length: 120 }, (_, number) => ({ name: `Pipeline ${index}-${number}`, type: "pipeline", version: "1.0.0" })) }));
assert.equal(core.buildPlan([many[0]], {}, { overrideConfirmed: true }).entries.length, 120);
assert.throws(() => core.buildPlan(many, {}, { overrideConfirmed: true }), /Too many/);
// Every retained major counts toward the existing file limit, even when names repeat.
assert.throws(() => core.buildPlan([{ name: 'Many Majors', pipelines: Array.from({ length: 10001 }, (_, major) => ({ name: 'One Name', type: 'pipeline', version: `${major}.0.0` })) }], {}, { overrideConfirmed: true }), /Too many/);
assert.equal(core.buildPlan(many.map((item) => ({ ...item, pipelines: item.pipelines.slice(0, 1) })), {}, { overrideConfirmed: true }).entries.length, 120);

// Keep folder names portable and distinguish literal percent signs from escaped separators.
assert.equal(core.folderName("../A/B"), "..%2FA%2FB");
assert.equal(core.folderName("CON"), "%43ON");
assert.equal(core.folderName("Trailing. "), "Trailing%2E%20");
assert.notEqual(core.folderName("A/B"), core.folderName("A%2FB"));
assert.equal(core.filePath(plan.entries[0]).split("/").length, 2);
assert.equal(core.crc32(new TextEncoder().encode("123456789")), 0xcbf43926);

// Verify archive headers and payload bytes independently of the producer's file loop.
async function checkZip() {
  const files = [
    { path: "Demo Package/Pipeline.json", bytes: new TextEncoder().encode('{"name":"Demo","segments":{}}\r\n') },
    { path: "Demo Package/Héllo.json", bytes: new TextEncoder().encode('{"name":"Héllo","segments":{}}\n') },
  ];
  const zip = core.makeZip(files);
  const bytes = new Uint8Array(await zip.arrayBuffer());
  const view = new DataView(bytes.buffer);
  let offset = 0;
  for (const file of files) {
    assert.equal(view.getUint32(offset, true), 0x04034b50);
    assert.equal(view.getUint16(offset + 6, true), 0x0800);
    assert.equal(view.getUint16(offset + 8, true), 0);
    const length = view.getUint16(offset + 26, true);
    assert.equal(new TextDecoder().decode(bytes.slice(offset + 30, offset + 30 + length)), file.path);
    const start = offset + 30 + length;
    assert.deepEqual(bytes.slice(start, start + file.bytes.length), file.bytes);
    offset = start + file.bytes.length;
  }
  assert.equal(view.getUint32(offset, true), 0x02014b50);
  assert.equal(view.getUint32(bytes.length - 22, true), 0x06054b50);
  assert.equal(view.getUint16(bytes.length - 12, true), files.length);
  assert.equal(view.getUint32(bytes.length - 6, true), offset);

  // Refuse unsafe paths, case-insensitive collisions, and oversized buffers before hand-off.
  assert.throws(() => core.makeZip([{ path: "../Pipeline.json", bytes: files[0].bytes }]), /Invalid/);
  assert.throws(() => core.makeZip([{ path: "C:/Pipeline.json", bytes: files[0].bytes }]), /Invalid/);
  assert.throws(() => core.makeZip([files[0], { ...files[0], path: "demo package/pipeline.json" }]), /collide/);
  assert.throws(() => core.makeZip([{ path: "Demo/Huge.json", bytes: new Uint8Array(core.MAX_BYTES + 1) }]), /64 MB/);

  // An optional synthetic archive lets an independent system ZIP reader verify interoperability.
  if (process.argv[2]) fs.writeFileSync(process.argv[2], bytes);
  console.log("PASS pipeline export planning, ownership filtering, version selection, paths, and ZIP bytes");
}
checkZip().catch((error) => { console.error(error); process.exitCode = 1; });
