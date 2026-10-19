(() => {
  "use strict";

  // Keep release markers separate from settings, favorite records, and source observations.
  const PENDING_KEY = "pendingUpdateSummary";
  const SEEN_KEY = "seenUpdateSummaryVersion";

  // Describe completed candidate behavior without claiming an approved store release.
  const NOTES = Object.freeze({
    // Describe the approved workspace without exposing the hidden Packages shortcut.
    "3.1.4": Object.freeze([
      "Export, Git Connections, and Export Configuration now share one tabbed workspace.",
      "Review and save tenant-specific folders, file types, and version choices before exporting.",
    ]),
    // Keep location setup in Connections and the destination preview in Export.
    "3.1.3": Object.freeze([
      "Git connection fields are grouped into a compact form without the legacy folder control.",
      "Edit Advanced Export Locations on Connections; Export shows the destination tree.",
    ]),
    // Folder preferences are separate from credentials and never move existing repository files.
    "3.1.2": Object.freeze([
      "Preview destinations as an indented folder tree before downloading source files.",
      "Use tenant-name folders or customize each tenant's export paths in Advanced.",
    ]),
    // Group opt-ins never erase user data or replace the confirmation for hidden Packages exports.
    "3.1.1": Object.freeze([
      "Use Navigation Tools, Export Tools, or both; saved data stays intact when tools are off.",
      "Packages export now uses one confirmed Shift+D shortcut, without Shared From setup.",
    ]),
    // Announce the expanded source workflow without advertising unfinished exporters or hidden shortcuts.
    "3.1.0": Object.freeze([
      "Export Designer drafts and published definitions separately, or published API Designer definitions.",
      "Git destinations now group these exports by verified tenant ID and source tool.",
    ]),
    // Keep provider-specific setup concise and avoid showing irrelevant instructions.
    "3.0.9": Object.freeze([
      "Token help follows your selected provider, with consistent links and clear examples.",
    ]),
    // Keep setup concise; native collapsed examples do not change authentication requirements.
    "3.0.8": Object.freeze([
      "Git setup is shorter, with collapsed GitHub and GitLab token checklists.",
      "The fresh-token reminder appears only when an empty-token Save is attempted.",
    ]),
    // Explain tenant routing and intentional credential/browser-login boundaries before a new export.
    "3.0.7": Object.freeze([
      "Git destinations automatically add the verified tenant name beneath your base folder.",
      "Setup explains base folders and the fresh-token requirement when saving changes.",
      "Commit links remind you to sign in to view private repositories in the browser.",
    ]),
    // Do not imply the owner removed source collection or provider-enforced limits.
    "3.0.6": Object.freeze([
      "Git export no longer applies a separate upload-size cap.",
      "The one-commit workflow, source safeguards, timeouts, and provider limits remain.",
    ]),
    // Keep removal of the arbitrary Git file cap distinct from retained byte/source safeguards.
    "3.0.5": Object.freeze([
      "Git export no longer has a separate 500-file cap, including formatted exports.",
      "Request-size, timeout, and existing source-export safeguards still apply.",
    ]),
    // Describe new commit messages without implying old provider history is rewritten.
    "3.0.4": Object.freeze([
      "Git commits show concise added and updated file totals without path lists.",
      "A small Export-ID footer retains safe verification after a lost response.",
    ]),
    // Keep this placement-only revision distinct from the preceding compatibility release.
    "3.0.3": Object.freeze([
      "Return to Export now sits beside the Git connection action buttons.",
      "Your export selection and saved connection behavior are unchanged.",
    ]),
    // Explain the compatibility repair without implying a completed live Git upload.
    "3.0.2": Object.freeze([
      "Published exports use package versions even when downloaded JSON omits its version, matching auto-sync.",
      "Return to Export from Git Connection without resetting your selection.",
      "Git preview reports specific source-reading failures before any upload.",
    ]),
    // Describe the first functional Git candidate without implying store publication or a live acceptance test.
    "3.0.1": Object.freeze([
      "Manually export selected files to GitHub or GitLab after reviewing and confirming changes.",
      "Save an encrypted connection with automatic reuse or password unlock; self-hosted GitLab is supported.",
      "ZIP exports and JSON backups remain independent. V3 is a test candidate, not a store release.",
    ]),
    // Keep: v3 foundation notes must not claim its planned Git connection is already usable (3.0.0).
    "3.0.0": Object.freeze([
      "Separate v3 development builds on v2 without changing the v2 release candidate.",
      "Git export settings are a design preview; repository uploads are not enabled yet.",
      "Existing local ZIP export and JSON backup remain available.",
    ]),
    // Keep the unpublished v2 overview focused on the same major features, not submission hardening.
    "2.1.9": Object.freeze([
      "Redesigned settings with task-based tabs for easier navigation.",
      "Export published Pipelines, Sub-Pipelines, APIs, and Transformers from Integration Packages to a ZIP, with optional readable formatting.",
    ]),
    // Keep: unpublished v2 candidates summarize the major changes since v1, not individual test-build tweaks (2.1.8).
    "2.1.8": Object.freeze([
      "Redesigned settings with task-based tabs for easier navigation.",
      "Export published Pipelines, Sub-Pipelines, APIs, and Transformers from Integration Packages to a ZIP, with optional readable formatting.",
    ]),
    "2.1.7": Object.freeze([
      "Settings tabs reserve enough space for their full labels on hover.",
      "Appearance and Sites no longer crowd neighboring tab text.",
      "Text size, page behavior, and saved settings are unchanged.",
    ]),
    "2.1.6": Object.freeze([
      "Protects rapid favorite edits and cancelled backup previews from stale responses.",
      "Settings read/save failures now keep confirmed values and explain how to retry.",
      "Tightens normal export version checks and verifies Download Again before retrying.",
    ]),
    "2.1.5": Object.freeze([
      "Controls have a subtle indent beneath their subgroup headings.",
      "Sharing and Sites stay unindented, with no repeated panel titles.",
      "Text size, compact Navigation, and saved settings are unchanged.",
    ]),
    "2.1.4": Object.freeze([
      "Navigation spacing is tighter without shrinking its text.",
      "Removed repeated footer/tab headings; Appearance separates Icon and Favorites.",
      "Normal Navigation fits without scrolling; long messages can still scroll.",
    ]),
    "2.1.3": Object.freeze([
      "Settings use Navigation, Sharing, Appearance, Sites, and Export tabs.",
      "Navigation groups General, Integration Packages, and Integration Designer controls.",
      "Page-specific export/refresh actions explain when unavailable; saved settings are unchanged.",
    ]),
    "2.1.2": Object.freeze([
      "Integration Packages shows the newest Sub-Pipeline release within every published major.",
      "APIs remain latest-overall; native Integration rows and the sidebar stay unchanged.",
      "Reload the extension and refresh Packages; favorites and export behavior are unchanged.",
    ]),
    "2.1.1": Object.freeze([
      "ZIP and package README names use the current tenant's saved Shared From environment name.",
      "Exact tenant-ID matching needs no additional service lookup.",
      "If no matching saved name exists, the verified tenant ID remains the fallback.",
    ]),
    "2.1.0": Object.freeze([
      "Export ZIP filenames include the resolved current environment name.",
      "Optional Formatted exports include Source/Formatted folders and a package README.",
      "Unchecked exports keep their existing layout, source contents, and one-click download.",
    ]),
    "2.0.9": Object.freeze([
      "Package headings show selected counts by type without changing their expanded lists.",
      "Download ZIP now builds the complete archive and starts its download in one click.",
      "Download Again retries the same prepared ZIP without fetching source files again.",
    ]),
    "2.0.8": Object.freeze([
      "Export the latest published Pipeline and Sub-Pipeline within every major version.",
      "Preview selected Pipeline, Sub-Pipeline, API, and Transformer counts.",
      "APIs and transformers retain latest-overall selection; source safeguards stay unchanged.",
    ]),
    "2.0.7": Object.freeze([
      "Export published transformers as JavaScript files beside package pipelines.",
      "Refresh Shared From in Designer to record transformer names separately.",
      "Existing favorites, source consent, and temporary advanced mode are unchanged.",
    ]),
    "2.0.6": Object.freeze([
      "Fixes Sub-Pipeline exports whose source JSON has a null version.",
      "Sub-Pipelines resolve by major; preview versions come from package metadata.",
      "Pipeline/API exact-version checks and export safeguards remain unchanged.",
    ]),
    "2.0.5": Object.freeze([
      "Choose whole packages or individual pipelines with collapsible checkbox lists.",
      "Temporary export sessions survive normal background-worker sleep.",
      "Includes Packages favorites and published fitting viewing fixes from v1.22.8.",
    ]),
    "2.0.4": Object.freeze([
      "Fixes the empty Pipeline Export preview caused by Chrome's message routing.",
      "Preview and Download ZIP stay bound to the original Packages document.",
      "Designer-recorded filtering and temporary advanced confirmation are unchanged.",
    ]),
    "2.0.2": Object.freeze([
      "Export latest published pipelines, APIs, and Sub-Pipelines from Integration Packages.",
      "Preview all eligible packages or select one, then download a package-folder ZIP.",
      "Default exports use Shared From sources; settings and JSON backups remain separate.",
    ]),
    "2.0.1": Object.freeze([
      "Pipeline export previews now open in a separate tab.",
      "Previews use saved Designer sources and include records beyond search display limits.",
      "Authenticated ZIP downloads remain disabled while their adapter is completed.",
    ]),
    "2.0.0": Object.freeze([
      "Settings are grouped by navigation, Packages, and Designer.",
      "ZIP pipeline export is in development; downloads are not enabled yet.",
      "JSON backup and restore remain available under Export & Backup.",
    ]),
  });

  // Repeated manual reloads must not redisplay a version already dismissed.
  async function recordUpdate(details, storage, version) {
    if (details?.reason !== "update" || details.previousVersion === version || !NOTES[version]) return;
    const saved = await storage.get({ [SEEN_KEY]: "" });
    if (saved[SEEN_KEY] === version) return;
    await storage.set({ [PENDING_KEY]: { version } });
  }

  // Reject stale markers so an older popup cannot display another release's notes.
  function notesFor(saved, version) {
    if (saved?.[PENDING_KEY]?.version !== version || saved?.[SEEN_KEY] === version) return [];
    return NOTES[version] || [];
  }

  // The worker and popup share only these small, deterministic release rules.
  globalThis.UpdateSummary = Object.freeze({ PENDING_KEY, SEEN_KEY, recordUpdate, notesFor });
})();
