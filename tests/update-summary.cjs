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
  // The messaging repair gets its own next-opening notes without changing the existing version gates.
  await summary.recordUpdate({ reason: "update", previousVersion: "2.0.3" }, storage, "2.0.4");
  assert.match(summary.notesFor(saved, "2.0.4")[0], /message routing/);
  // Give the new selection/session behavior and both v1 fixes their own version-gated notes.
  await summary.recordUpdate({ reason: "update", previousVersion: "2.0.4" }, storage, "2.0.5");
  assert.equal(summary.notesFor(saved, "2.0.5").length, 3);
  assert.match(summary.notesFor(saved, "2.0.5")[0], /checkbox/);
  assert.match(summary.notesFor(saved, "2.0.5")[2], /v1.22.8/);
  // Describe the Sub-Pipeline fix only for its own delivered revision.
  await summary.recordUpdate({ reason: "update", previousVersion: "2.0.5" }, storage, "2.0.6");
  assert.equal(summary.notesFor(saved, "2.0.6").length, 3);
  assert.match(summary.notesFor(saved, "2.0.6")[0], /null version/);
  // Transformer notes require the new candidate rather than reappearing for older releases.
  await summary.recordUpdate({ reason: "update", previousVersion: "2.0.6" }, storage, "2.0.7");
  assert.equal(summary.notesFor(saved, "2.0.7").length, 3);
  assert.match(summary.notesFor(saved, "2.0.7")[0], /transformer/i);
  // Queue major-version export notes only for the new delivered version.
  await summary.recordUpdate({ reason: "update", previousVersion: "2.0.7" }, storage, "2.0.8");
  assert.equal(summary.notesFor(saved, "2.0.8").length, 3);
  assert.match(summary.notesFor(saved, "2.0.8")[0], /every major version/);
  // Package summaries and one-click download notes belong only to their delivered revision.
  await summary.recordUpdate({ reason: "update", previousVersion: "2.0.8" }, storage, "2.0.9");
  assert.equal(summary.notesFor(saved, "2.0.9").length, 3);
  assert.match(summary.notesFor(saved, "2.0.9")[1], /one click/);
  // The agreed patch rollover and optional formatting notes belong to 2.1.0 only.
  await summary.recordUpdate({ reason: "update", previousVersion: "2.0.9" }, storage, "2.1.0");
  assert.equal(summary.notesFor(saved, "2.1.0").length, 3);
  assert.match(summary.notesFor(saved, "2.1.0")[1], /Formatted/);
  // The name repair describes local cache reuse, not an unavailable native service.
  await summary.recordUpdate({ reason: "update", previousVersion: "2.1.0" }, storage, "2.1.1");
  assert.equal(summary.notesFor(saved, "2.1.1").length, 3);
  assert.match(summary.notesFor(saved, "2.1.1")[0], /Shared From/);
  // Scope the table-display fix to this revision without replaying older export notes.
  await summary.recordUpdate({ reason: "update", previousVersion: "2.1.1" }, storage, "2.1.2");
  assert.equal(summary.notesFor(saved, "2.1.2").length, 3);
  assert.match(summary.notesFor(saved, "2.1.2")[0], /every published major/);
  assert.equal(summary.notesFor(saved, "2.1.1").length, 0);
  // Task-based settings notes never alter saved preferences or favorites.
  await summary.recordUpdate({ reason: "update", previousVersion: "2.1.2" }, storage, "2.1.3");
  assert.equal(summary.notesFor(saved, "2.1.3").length, 3);
  assert.match(summary.notesFor(saved, "2.1.3")[0], /tabs/);
  // Compact settings notes apply only to their own revision, preserving unrelated saved data.
  await summary.recordUpdate({ reason: "update", previousVersion: "2.1.3" }, storage, "2.1.4");
  assert.equal(summary.notesFor(saved, "2.1.4").length, 3);
  assert.match(summary.notesFor(saved, "2.1.4")[0], /spacing/);
  // Subgroup hierarchy is a presentation update, not a saved-data change.
  await summary.recordUpdate({ reason: "update", previousVersion: "2.1.4" }, storage, "2.1.5");
  assert.equal(summary.notesFor(saved, "2.1.5").length, 3);
  assert.match(summary.notesFor(saved, "2.1.5")[0], /indent/);
  // Reliability notes remain version-scoped and never mutate unrelated saved data.
  await summary.recordUpdate({ reason: "update", previousVersion: "2.1.5" }, storage, "2.1.6");
  assert.equal(summary.notesFor(saved, "2.1.6").length, 3);
  assert.match(summary.notesFor(saved, "2.1.6")[0], /favorite/);
  // Tab-spacing notes are scoped to this presentation-only patch.
  await summary.recordUpdate({ reason: "update", previousVersion: "2.1.6" }, storage, "2.1.7");
  assert.equal(summary.notesFor(saved, "2.1.7").length, 3);
  assert.match(summary.notesFor(saved, "2.1.7")[0], /labels/);
  // The unpublished v2 release highlights its major features for v1 users and candidate testers alike.
  for (const previousVersion of ["1.22.8", "2.1.7"]) {
    await summary.recordUpdate({ reason: "update", previousVersion }, storage, "2.1.8");
    const notes = summary.notesFor(saved, "2.1.8");
    assert.equal(notes.length, 2);
    assert.match(notes[0], /Redesigned settings.*tabs/);
    assert.match(notes[1], /Export published Pipelines, Sub-Pipelines, APIs, and Transformers/);
    assert.match(notes[1], /ZIP.*optional readable formatting/);
    assert.equal(summary.notesFor(saved, "2.1.7").length, 0);
  }
  // Dismissal and repeat-reload guards still apply to the broader release overview.
  saved[summary.SEEN_KEY] = "2.1.8";
  const beforeDismissedReload = writes.length;
  await summary.recordUpdate({ reason: "update", previousVersion: "1.22.8" }, storage, "2.1.8");
  assert.equal(writes.length, beforeDismissedReload);
  assert.equal(summary.notesFor(saved, "2.1.8").length, 0);
  // Submission hardening must not replace the owner-approved v2 overview with minor release notes.
  await summary.recordUpdate({ reason: "update", previousVersion: "2.1.8" }, storage, "2.1.9");
  assert.equal(summary.notesFor(saved, "2.1.9").length, 2);
  assert.match(summary.notesFor(saved, "2.1.9")[0], /Redesigned settings/);
  assert.match(summary.notesFor(saved, "2.1.9")[1], /Export published Pipelines/);
  // A v3 prototype advertises only completed local behavior, not planned repository uploads.
  await summary.recordUpdate({ reason: "update", previousVersion: "2.1.9" }, storage, "3.0.0");
  assert.equal(summary.notesFor(saved, "3.0.0").length, 3);
  assert.match(summary.notesFor(saved, "3.0.0")[1], /not enabled yet/);
  assert.equal(saved.sharedFromEnabled, true);
  assert.deepEqual(saved.favorites, { demo: true });
  console.log("PASS update-summary version gating and unrelated-data preservation");
}
run().catch((error) => { console.error(error); process.exitCode = 1; });
