# v2 Development

This is the initial **2.0.0 development checkpoint**, not a finished store release. Both contributors use develop; main remains the confirmed 1.22.6 release. V1 fixes can branch from main and be brought into develop afterward.

## Implemented

- Settings grouped by where they apply, with the existing preference keys and data unchanged.
- A What's New card on the next settings opening after an update, dismissed once per version. First installs and same-version reloads do not queue it. No automatic browser tabs are opened.
- Pure exporter planning and local ZIP assembly, tested with synthetic data only. The download button is disabled until the session adapter and user-confirmation flow are implemented.

## Exporter Design

The default requires Shared From consent and observations collected from Designer. Eligibility matches the exact package name and pipeline name; the forgiving search rules must never expand ownership matches. Names stored without a package relationship cannot authorize a package download. Cached observations can be stale and are not proof of live sharing history or permission; the normal authenticated service remains authoritative.

The planned export uses the latest published package and latest published Pipeline, API, or Sub-Pipeline per name/type, not every historical major version. Each package gets a folder containing its pipeline JSON files. Escape invalid filename characters without collapsing different names, detect collisions, and preserve the supplied source bytes.

The current planner expects **already-selected latest package definitions**. It does not discover packages, fetch definitions, or read session tokens. The draft ZIP supports stable numeric semantic versions, up to 10,000 files and 64 MB of source data, with standard uncompressed ZIP entries. Compression and broader version/size handling are not yet implemented.

## Remaining Work

1. Verify the page's native authenticated package/artifact helper signatures before wiring them. Reuse its current session without reading, storing, logging, or exporting credentials; do not guess minified method names.
2. Collect a complete latest-package list and load each eligible definition, handling pagination independently of the search display cap. Recheck the original document, site, and tenant before starting each download; stop if that context changes.
3. Preview eligible records and skipped content before downloading. Add bounded request concurrency, progress, cancellation, clear failure reporting, and an explicit decision for partial exports. Do not collect or download automatically on install, update, popup opening, or summary dismissal.
4. Add the owner-requested temporary advanced override: Shift+D while settings has focus and the user is not typing. Revealing the option is not consent to download all content. Require separate confirmation, retain normal service permissions, and reset the override when settings closes; never persist it or enable it by default.
5. Verify with synthetic service adapters, then ask the owner to test the real session flow. No real package/pipeline downloads are performed by the current tests.
6. Synchronize the privacy policy and user guide for completed download behavior, finish current-version update notes, and prepare a tested release candidate. Existing store artwork and distribution remain unchanged unless separately approved.

## v1 Safeguards

No favorite migration, sharing-cache format change, new host permission, background pipeline download, or real package/pipeline mutation is part of this checkpoint. JSON backup/import and Shared From Refresh remain independent of pipeline ZIP export.
