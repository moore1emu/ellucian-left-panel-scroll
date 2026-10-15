"use strict";

// Run summary rules with an in-memory store rather than browser preferences.
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const context = vm.createContext({});
vm.runInContext(fs.readFileSync(path.resolve(__dirname, "../update-summary.js"), "utf8"), context);
const summary = context.UpdateSummary;

async function run() {
  // Seed unrelated preferences to prove install/reload/dismiss markers cannot reset them.
  const saved = { favorites: { demo: true }, sharedFromEnabled: true };
  const writes = [];
  const storage = { get: async (defaults) => ({ ...defaults, ...saved }), set: async (items) => { writes.push(items); Object.assign(saved, items); } };
  await summary.recordUpdate({ reason: "install" }, storage, "2.0.0");
  await summary.recordUpdate({ reason: "update", previousVersion: "2.0.0" }, storage, "2.0.0");
  assert.equal(writes.length, 0);

  // One actual version update queues notes; opening settings itself performs no write.
  await summary.recordUpdate({ reason: "update", previousVersion: "1.22.6" }, storage, "2.0.0");
  assert.equal(writes.length, 1);
  assert.deepEqual(Object.keys(writes[0]), [summary.PENDING_KEY]);
  assert.equal(summary.notesFor(saved, "2.0.0").length, 3);
  assert.equal(summary.notesFor(saved, "1.22.6").length, 0);
  assert.equal(saved.sharedFromEnabled, true);
  assert.deepEqual(saved.favorites, { demo: true });

  // A dismissal remains respected if an extension reload repeats the earlier update event.
  saved[summary.SEEN_KEY] = "2.0.0";
  await summary.recordUpdate({ reason: "update", previousVersion: "1.22.6" }, storage, "2.0.0");
  assert.equal(writes.length, 1);
  assert.equal(summary.notesFor(saved, "2.0.0").length, 0);
  // The tested candidate has its own accurate notes without disturbing a dismissed older release.
  await summary.recordUpdate({ reason: "update", previousVersion: "2.0.1" }, storage, "2.0.2");
  assert.equal(summary.notesFor(saved, "2.0.2").length, 3);
  assert.match(summary.notesFor(saved, "2.0.2")[0], /Integration Packages/);
  assert.equal(saved.sharedFromEnabled, true);
  assert.deepEqual(saved.favorites, { demo: true });
  console.log("PASS update-summary version gating and unrelated-data preservation");
}
run().catch((error) => { console.error(error); process.exitCode = 1; });
