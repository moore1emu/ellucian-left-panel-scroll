# v2 Development

This is the **2.0.1 development checkpoint**, not a finished store release. Both contributors use develop; main remains the confirmed 1.22.6 release. V1 fixes can branch from main and be brought into develop afterward.

## Implemented

- Settings grouped by where they apply, with the existing preference keys and data unchanged.
- A What's New card on the next settings opening after an update, dismissed once per version. First installs and same-version reloads do not queue it. No automatic browser tabs are opened.
- A dedicated export tab launched explicitly from Export & Backup. It previews the original Designer tab's already-loaded published package/pipeline model, including records beyond search display limits. It does not request pipeline contents. Integration Packages export is not connected yet; open Designer for this preview.
- Exact cached ownership filtering before preview; Shared From consent and recorded package relationships are required by default. No metadata request begins until setup is validated. Preview renders 100 rows at a time while retaining the complete eligible plan.
- Temporary advanced preview override revealed by Shift+D in settings, ignored while typing. A separate warning requires confirmation; the choice is not saved. A one-use, short-lived in-memory launch ticket binds consent to the created extension tab and original source tab. Worker restarts/expired tickets require reopening the workflow.
- Preview progress, Cancel, Refresh Preview, opt-out invalidation, and stale-response suppression. Closing settings does not close an already-open export tab; closing the export tab discards its temporary state.
- Pure export collection and local ZIP assembly, tested with synthetic readers only: six concurrent readers, context checks before/after every record, cancellation, 64 MB input limit, and no partial ZIP on failure. **Download ZIP remains disabled** until its authenticated adapter and identity/version validation are finished. No real downloads are performed by this checkpoint.

## Exporter Design

The default requires Shared From consent and observations collected from Designer. Eligibility matches the exact package name and pipeline name; the forgiving search rules must never expand ownership matches. Names stored without a package relationship cannot authorize a package download. Cached observations can be stale and are not proof of live sharing history or permission; the normal authenticated service remains authoritative.

The planned export uses the latest published package and latest published Pipeline, API, or Sub-Pipeline per name/type, not every historical major version. Each package gets a folder containing its pipeline JSON files. Escape invalid filename characters without collapsing different names and detect collisions. Confirmed native helpers return parsed JSON, not raw response bytes: exported JSON will preserve content but may use different whitespace. The ZIP core preserves the bytes it is supplied; it does not promise byte-identical service responses.

The current planner expects **already-selected latest package definitions**. It does not discover packages, fetch definitions, or read session tokens. The draft ZIP supports stable numeric semantic versions, up to 10,000 files and 64 MB of source data, with standard uncompressed ZIP entries. Compression and broader version/size handling are not yet implemented.

## Remaining Work

1. Wire verified native package/pipeline readers using the current session without reading, storing, logging, or exporting credentials. Static inspection confirmed Designer ServerHelper.bP and B0 signatures; the native G9 list reader has uncontrolled Promise.all fan-out and must not be used for a bounded export. Verify artifact response identity/version and conditional-cache behavior before enabling downloads.
2. Complete authenticated adapters for Designer and Integration Packages, including latest package/record selection and pagination. Designer's full manager model is used for preview, not visible sidebar/search rows. Recheck original document, site, tenant, consent, and allowed entries before each source request; stop if context changes.
3. Connect the tested collection runner to live adapters, with progress and cancellation in the dedicated tab. Failed/cancelled jobs discard partial output. Do not collect or download automatically on install, update, popup opening, or summary dismissal. Account for timed-out native calls until they really settle so cancellation/retry cannot overrun the six-request budget.
4. Keep advanced consent temporary and bound to its launched workflow; it never grants broader service permissions. Verify native adapter authorization separately from metadata-only preview before enabling the all-accessible download option.
5. Verify with synthetic service adapters, then ask the owner to test the real session flow. No real package/pipeline downloads are performed by the current tests.
6. Synchronize the privacy policy and user guide for completed download behavior, finish current-version update notes, and prepare a tested release candidate. Existing store artwork and distribution remain unchanged unless separately approved.

## v1 Safeguards

No favorite migration, sharing-cache format change, new host permission, background pipeline download, or real package/pipeline mutation is part of this checkpoint. JSON backup/import and Shared From Refresh remain independent of pipeline ZIP export. Synthetic checks cover 120 packages with 120 metadata records each, 120-record export collection, both tab themes, the 100-row preview display, cancellation/late responses, opt-out, source projection, launch-ticket authorization, and unchanged preferences. No signed-in account download test is claimed.
