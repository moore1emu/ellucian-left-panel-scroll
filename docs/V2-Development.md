# v2 Development

This is the **2.0.4 manual-test candidate**, not an approved store release. Both contributors use develop; main remains the confirmed 1.22.6 release. V1 fixes can branch from main and be brought into develop afterward.

The reported empty Packages preview was traced to Chrome omitting tab/document sender fields on direct extension-tab-to-content messages. The worker now binds the original source document before opening export and authenticates the one-use claim to the created export document. Only preview, verify, read, and cancel operations are relayed to that original top-level source document. The isolated receiver rejects the old direct route; caller fields cannot replace the source target, client identity, or advanced consent. Reload/close/restart fails safely rather than retargeting a new document. Native tenant/manager checks, consent, exact eligibility, request limits, and explicit downloads remain unchanged. Installed-extension synthetic end-to-end checks now pass; signed-in testing remains required. Settings regrouping remains on hold for discussion.

## Implemented

- Settings grouped by where they apply, preserving existing preference keys, favorites, cache format, and backups.
- A dismissible What's New card on the next settings opening after an update. No automatic tabs or source collection.
- Both export modes launch from **Integration Packages**, in a dedicated extension tab independent of the settings popup. Designer only populates Shared From observations.
- Default eligibility requires Shared From consent and exact Designer-recorded package/pipeline relationships. Unassigned package names cannot authorize downloads; forgiving search normalization does not expand matches. Saved observations may be stale and are not service permissions.
- Fresh latest package references and eligible package definitions populate preview, including API/Sub-Pipeline metadata omitted from native runnable lists. Preview requests no pipeline source code. It renders 100 rows at a time while retaining the full plan; select all eligible packages or one package.
- **Download ZIP** explicitly retrieves the newest published Pipeline, API, or Sub-Pipeline per name/type. **Save ZIP** downloads the locally assembled archive, with each package folder containing its JSON files.
- Shift+D while settings is open and not typing reveals a temporary advanced option. A separate warning confirms Include All Accessible Content. This bypasses only the saved-source filter, not authentication or service access. Consent is bound to a short-lived one-use launch ticket and is not saved. Cancel/close clears it.
- Progress, Cancel, Refresh Preview, fixed failure messages, response projection, and original source document/manager/site/tenant checks. Lost consent, removed membership, navigation, failure, or cancellation discards partial output.

## Native Readers and Limits

Packages' existing native helpers own authentication. The extension passes the existing session callback to them; it does not invoke it itself or inspect token/header values. Their opaque authentication configuration stays in the MAIN world, passed directly between native helpers without inspection, copying, logging, storage, or extension messages.

The native reference-list reader is explicitly called without its default all-package fan-out. Package and source reads use a combined six-job budget with sharing lookups. A cancelled or timed-out call occupies capacity until the actual native promise settles; retry cannot launch six more over stalled calls. The extension cannot stop native services that lack abort support.

Pipeline/API reads use exact full-version paths. Sub-Pipeline paths use the major version and must return a verifiable exact version; missing/mismatched versions stop the job instead of producing mislabeled JSON. Native helpers return parsed JSON, so output preserves content but may use different whitespace. Source filenames use safe Windows-compatible escaping and collision checks. ZIP entries use standard uncompressed storage; limits are 10,000 files and 64 MB of source JSON. An empty or inaccessible response is a failure, not a successful empty export.

## Verification and Next Test

Synthetic native tests cover 120 eligible packages plus an excluded supplier package, all three artifact types, latest metadata, opaque authentication configuration, exact ownership/override, six real request slots, version guards, tenant changes, and timeout capacity retention. Browser tests cover explicit ZIP generation, package selection, preview pagination, late replies/cancel, opt-out, both themes, launch tickets, settings saves, and unrelated-data preservation. No real institution pipelines are downloaded by these tests.

Reload the same unpacked extension folder, refresh Integration Packages, then test one small eligible package from Export & Backup. Check the preview and each JSON file against its latest published version before trying a large export. Sub-Pipeline response shape and native conditional-cache behavior still need this signed-in test; the candidate fails safely if the source cannot be verified. Keep exported code private—it can contain embedded confidential values.

## Release Boundary

The latest local ZIP/unpacked output is a test candidate, not store approval. Main, store listing, artwork, and distribution remain unchanged. JSON backup/import and Shared From Refresh stay independent of pipeline export. No favorite migration, new host permission, pipeline mutation, analytics, or diagnostic upload is part of this update. Owner confirmation and separate release/merge authorization are still required.
