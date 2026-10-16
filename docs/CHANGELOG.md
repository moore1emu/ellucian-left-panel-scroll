# Update history

Reconstructed from this development chat, including recorded file changes. Dates use America/Denver. Intermediate builds are identified below; entries describe changes made at the time, with later fixes listed separately.

## 2.1.8 — 2026-10-16 — v2 Release Overview

- Changes the current What's New message to the big-ticket improvements since v1: redesigned task-tab settings and published Pipeline/Sub-Pipeline/API/Transformer ZIP export with optional readable formatting. Unpublished candidate tweaks stay in this changelog rather than replacing the release overview.
- Keeps version gating, dismissal/reload behavior, favorites, settings, consent, export eligibility, and actual download behavior unchanged. Tests cover upgrades from v1 and the prior v2 candidate, the real popup's two-item overview, and dismissal preservation. Main/store unchanged.

## 2.1.7 — 2026-10-16 — Settings Tab Hover Spacing

- Gives each settings tab enough width for its full label rather than forcing equal widths. Appearance/Sites hover backgrounds no longer crowd neighboring text, including bold selected labels. Font size, popup width, task layout, and saved behavior are unchanged.
- Adds light/dark browser checks for label containment, hover across every tab, one-line labels, and popup bounds. No permissions, storage, favorites, sources, or export changes; main/store unchanged.

## 2.1.6 — 2026-10-16 — Targeted Reliability Repairs

- Protects rapid same-page favorite edits from older storage notifications while package saves are queued. Reconciles confirmed package state without merging intentionally removed pins or changing tenant/page scope; old-visit callbacks cannot restore another visit's state. This does not recover previously lost pins or introduce multi-tab conflict merging.
- Failed opening settings reads keep preferences locked with retry guidance instead of applying speculative defaults. Both search selectors now lock during their independent saves, restore the last confirmed value on failure, and show separate failure feedback.
- Cancelled/replaced backup-file reads cannot revive stale import previews, overwrite a newer status, or clear a newer file selection. Restore still requires explicit confirmation.
- Normal Pipeline/API JSON must contain a valid exact selected source version. The deliberate Sub-Pipeline null/omitted-version and major-route behavior is unchanged; transformer handling remains separate.
- Download Again verifies the original bound document/context before reusing the complete local ZIP, with no source rereads. Stale retry/context/selection/format/cancel/refresh results cannot download or replace current output. The visible retry control does not expose a blob URL that modified/middle clicks could bypass; the initial complete ZIP still requests download with one click.
- Removes obsolete popup disclosure/footer styles and normalizes moved HTML indentation while preserving the approved tab layout, subgroup offsets, saved-data schema, permissions, consent, six-slot scheduling, and existing authorizations. Adds targeted regressions for the review findings. Main/store unchanged; signed-in testing remains required.

## 2.1.5 — 2026-10-16 — Clearer Settings Subgroups

- Indented controls eight pixels beneath General, Integration Packages, Integration Designer, Icon, Favorites, Pipeline Export, and Backup & Restore headings. Headings retain their original alignment; Sharing and Sites stay unindented because they have no subgroup header. Existing export-card boundaries are preserved.
- Kept the same text size and compact 580px popup. Normal Navigation still fits without scrolling; long notices retain overflow. No new settings, scripts, permissions, saved-data changes, or behavior changes.
- Extended light/dark popup checks to assert each eight-pixel offset, unchanged Sharing/Sites alignment, no normal Navigation scroll, and no horizontally clipped controls. Save-race and update-summary checks remain applicable. Main/store unchanged; signed-in visual confirmation remains required.

## 2.1.4 — 2026-10-16 — Compact Navigation Layout

- Appearance now labels its first group Icon, with Favorites kept as the separate heading below; control behavior and saved appearance values are unchanged.
- Removed repetitive Sharing & Sources and Custom Sites headings from their already-labeled task tabs. Kept meaningful Navigation scope groups, Icon/Favorites, and Pipeline Export/Backup & Restore subgroup titles.
- Removed the repeated footer scope line (Integration Packages & Designer / Test & Production) and slightly reduced Navigation row/group spacing. The normal Navigation view fits without scrolling at the existing 360×580 popup size; setting text remains 13px and descriptions 12px. Version, Report Bug, and affiliation remain visible.
- Kept the active-panel overflow behavior for update notes, consent, imports, long feedback, or larger text. No clipping or blanket scrollbar hiding. Settings, storage, consent, source refresh, export, favorites, and page-specific availability are unchanged.
- Added light/dark assertions for no normal Navigation overflow and an immediately visible Pipeline Search control. Existing popup context/consent/keyboard/long-message checks, switch-save recovery, and update-summary rules remain covered. No main merge/store action; signed-in visual confirmation remains required.

## 2.1.3 — 2026-10-16 — Task-Based Settings Tabs

- Replaced stacked settings disclosures with Navigation, Sharing, Appearance, Sites, and Export tabs. Navigation groups General, Integration Packages, and Integration Designer; Sharing keeps Shared To, Shared From, current-Designer cache status, and Refresh Sources together. Existing control IDs, saved values, consent, favorites, cache formats, and export contents are unchanged; no migration.
- Pipeline Export is grayed out outside Integration Packages; Refresh Sources is grayed out outside Integration Designer. Source-dependent actions also require consent/setup, apart from the existing separately confirmed temporary export override. Visible guidance explains availability. The popup reuses the active top-level page's existing route message for UI context only; no tab-URL permission, new service requests, polling, or saved task selection. Worker/content authorization remains unchanged; JSON backup/restore stays independent.
- Tabs/footer remain visible within the 580px popup while active content, consent notices, and long errors scroll. Keyboard tab navigation, summary-dismissal focus, backup assignment/import, failed-save recovery, and hidden Shift+D behavior are adapted to tabs without rebuilding controls or retaining advanced consent.
- Updated synthetic popup, installed exporter/favorites, switch-save, and summary regressions for the real tab layout, context/connection gates, themes, long feedback, consent/cancellation, and independent backups. Signed-in confirmation remains required. No main merge or store update.

## 2.1.2 — 2026-10-16 — Display Every Published Sub-Pipeline Major

- Integration Packages' optional reference table now shows the newest published minor/patch within every Sub-Pipeline major, rather than only the newest major overall. Both early native-response capture and isolated display normalization preserve the independent majors; same-name rows sort numerically by version.
- APIs deliberately retain latest-overall display. Native Integration rows/links, the left sidebar, export selection, Shared From eligibility, favorites, and cache formats are unchanged. Existing memory bounds, opt-out clearing, and name-only reference tooltips remain; no extra requests, permissions, or storage writes.
- Added a synthetic browser regression covering unsorted v1/v2/v3 releases, duplicate entries, numeric minor ordering, both JSON/text native responses before filtering, mixed/empty tables, unchanged API/native behavior, opt-out, and zero extra reads/writes. Reload the unpacked extension and refresh Integration Packages to capture its normal metadata again. Signed-in confirmation remains required; main/store unchanged.

## 2.1.1 — 2026-10-16 — Reuse Saved Environment Names

- ZIP filenames and Formatted package READMEs now use the saved Shared From environment name for the exact verified current tenant ID. Missing, blank, oversized, or malformed names retain the tenant-ID fallback; another tenant's snapshot or page-supplied name cannot override it.
- Removed the export-only tenant-name service lookup. Signed-in read-only inspection confirmed Packages does not export Designer's JR helper; the earlier synthetic fixture incorrectly supplied it. Existing Designer sharing/source helpers remain unchanged. No additional lookup, URL/path guessing, cache migration, or favorite write.
- Updated native/browser regressions to model Packages without the unavailable helper and verify exact cached name selection, wrong-tenant/malformed-name fallbacks, page-name rejection, and environment-named ZIP downloads. Formatted/raw output, one-click download, context/consent/entry guards, six-request limits, and all-or-nothing behavior are unchanged. Main/store unchanged; signed-in confirmation remains required.

## 2.1.0 — 2026-10-16 — Environment Names and Optional Formatted Export

- Export ZIP filenames include the resolved current tenant name, for example integration-navigator-uncproductions.zip. The existing tenant-details helper runs under the combined six-request budget; missing names fall back to the verified tenant ID, never a guessed domain/path. The display name is bounded metadata, not authorization, and tenant/context checks remain unchanged.
- Added an unchecked-by-default Formatted option on the export page. Unchecked preserves the previous package/file layout and source serialization. Checked writes Package/Source and Package/Formatted plus one Package/README.md listing only selected names, types, majors, and package-reported published versions/environment. Changing the option invalidates Download Again; no setting or preference is saved.
- Matched the owner-confirmed auto-sync reference's whitespace-review behavior: expand escaped CR/LF/tab while preserving literal escaped backslash pairs, quotes, and Unicode. Source JSON remains valid and JavaScript response text stays unchanged; Formatted is review-only, not for import or execution. README versions do not imply exact Sub-Pipeline/transformer source-version verification. No audit/user lookups or source execution.
- Both layouts retain one source read per selected entry, all-or-nothing output, one-click download, six native slots, consent/context/entry guards, and unchanged favorites/cache. Existing 10,000 physical ZIP-file and 64 MB payload limits include generated copies and READMEs; excessive formatted file counts fail before source reads. ZIP paths permit only fixed Source/Formatted children and package README files, with existing containment/collision checks.
- Added synthetic coverage for raw/Source byte equivalence, readable whitespace/literal escapes, inert README labels, multiple majors/types, environment-name/fallback/context behavior, opt-in/retry invalidation, real browser ZIP downloads, and size/path limits. Signed-in confirmation remains required; no main merge, store update, or auto-sync modification. Version rolls from 2.0.9 to 2.1.0 under the agreed convention.

## 2.0.9 — 2026-10-16 — Package Counts and One-Click ZIP

- Package headings now show selected counts by type beside their existing selected/total count, for example 2 of 2 selected (Pipelines: 1, APIs: 1). Counts update with individual, package, and Select All choices; zero-selected types are omitted. The expanded list stays unchanged, and long summaries can wrap rather than overflow.
- Download ZIP now builds the complete archive and automatically requests its browser download with one click. Download Again is available afterward for the same prepared ZIP without more source requests; changing selection, refreshing, cancelling, or losing eligibility invalidates that retry link. Browser download preferences and any save prompt still apply.
- Failed/cancelled/context-invalid exports never start a partial download. Cancellation feedback does not claim that previously completed browser downloads were removed. No new permissions, storage, service endpoints, authentication changes, Git push integration, or favorite/cache migrations.
- Tests cover package-level counts for every type, omitted zero types, live selection updates, actual browser download events and byte-identical ZIP streams, repeated downloads without source reads, and no download after source failure. Existing major-version selection, six-request limits, consent/context guards, and all-or-nothing assembly remain unchanged. Signed-in confirmation remains required; main/store unchanged.

## 2.0.8 — 2026-10-16 — Export Each Published Major

- Pipeline and Sub-Pipeline export selection now retains the latest published minor/patch within every available major, rather than dropping older majors. Each major has its own checkbox and version row; for example, 1.0.4 and 2.0.5 can both be selected. APIs and transformers retain latest-overall selection.
- Pipeline/Sub-Pipeline ZIP filenames always include a stable major suffix, such as Name_v1.json and Name_v2.json, so files cannot overwrite one another. Pipeline requests still use their exact selected full version; Sub-Pipeline requests still use their selected numeric major and preserve null/omitted source versions. No source JSON is relabeled.
- The top preview summary now shows selected Pipeline, Sub-Pipeline, API, and Transformer counts alongside package/file counts. Counts update with individual, package, and Select All changes; each retained major counts separately.
- Synthetic coverage checks numeric major ordering, newest-within-major deduplication, the existing file cap across majors, independent same-name checkboxes, live type counts, correct native routes, and distinct ZIP entries/content. Existing ownership, consent, six-request, context, cancellation, favorites, and transformer safeguards remain unchanged. Signed-in confirmation remains required; no main merge or store update.

## 2.0.7 — 2026-10-16 — Published Transformer Export

- Shared From now records published transform-function names separately under their Designer package/environment, with no source-code collection or extra lookup. Draft-only names and same-named pipelines cannot authorize transformer exports. Existing caches/backups/favorites stay valid; refresh each source Designer to add transformer observations.
- Export preview includes eligible published transformers with a Transformer type and independent checkboxes. Download ZIP retrieves their current published JavaScript using the fixed Packages transformFunction/latest route, matching auto-sync. Package metadata supplies the displayed version; JavaScript has no independently verified exact source version. Files use .js beside package pipeline JSON, preserving the native response text without execution or JSON wrapping.
- The approved reader reuses Packages' existing HTTP client and passes the native authentication configuration untouched, in the MAIN world only. No token/header inspection, direct session-callback invocation, arbitrary URL/method, new permission, permanent override, favorite migration, or source-code storage is introduced. The shared six-request budget, tenant/document/consent checks, cancellation, and all-or-nothing ZIP remain.
- JSON backup/restore preserves optional transformer-name lists with the same validation, consent, timestamps, and total-cache limits. Tests cover typed ownership/legacy-cache exclusion, malformed source/HTML/status rejection, context changes before GET, JavaScript ZIP text, Designer capture, and backup round trips. One owner-approved read verified a JavaScript response without logging its code or credentials; the integrated signed-in ZIP still needs owner confirmation. Main/store remain unchanged.

## 2.0.6 — 2026-10-15 — Sub-Pipeline Major-Version Downloads

- Fixes successful Sub-Pipeline reads being rejected because the service returns version:null. Sub-Pipelines resolve to the current source within the package-reported major version, allowing compatible updates without republishing parent pipelines. Preview metadata retains the package-reported full version; downloaded JSON is not relabeled with it.
- Accepts null/omitted source versions for Sub-Pipelines. If a source version is supplied, it must be valid and match the requested major; compatible minor/patch differences are allowed. Normal Pipeline/API exact-version checks, source name/type checks, native authentication, Designer filtering, six-request limits, and all-or-nothing ZIP behavior remain unchanged.
- Adds null-version installed-browser ZIP coverage and native regressions for compatible updates, wrong major/name/type, malformed versions, unchanged package metadata, and Pipeline/API mismatches. Signed-in inspection confirmed two successful major-route responses with version:null; the repaired download still needs owner confirmation. No auto-sync scripts, favorites, cache format, permissions, main branch, or store state changed.

## 2.0.5 — 2026-10-15 — Export Selection and Session Recovery

- Replaces the export preview's flat Show More list and single-package selector with collapsible packages and package/pipeline checkboxes. All package headings are listed immediately; expanding a package reveals every eligible pipeline. Select All, partial-selection indicators, and live counts make the selection explicit.
- Only checked records are downloaded. Keeps a successful preview for another selection/download and discards the old Save ZIP link when selection changes. Preview remains metadata-only.
- Preserves claimed export document grants in memory-only storage.session through ordinary background-worker sleep. Stores only bounded routing/document identifiers, source URL, client/generation identifiers, extension version, and temporary advanced consent—not pipeline contents, credentials, favorites, or a permanent override. Tab close removes its record; extension reload/update/disable and browser restart clear session storage. Original-document, consent, exact-version, and six-request guards remain; unavailable storage fails safely without native work or permanent-storage fallback.
- Carries the v1.22.7 Packages tenant-context favorites fix and v1.22.8 published-fitting existing-draft fix into v2 with direct-reload, isolation, real-Ace copying, and edit-protection regressions. No favorite reset/migration or new permission is introduced.
- Adds synthetic checkbox/ZIP selection and cold-worker rehydration/fault checks. Settings regrouping and the optional compatibility warning remain deferred. Signed-in export validation is still required; automated tests use no institution data.

## 2.0.4 — 2026-10-15 — Exporter Message Routing

- Fixes the empty Packages export preview caused by requiring sender.tab on a message route where Chrome omits it. The background worker now authenticates the launched export document and relays only preview, verify, read, and cancel to the original top-level Packages document.
- A nonce-bound source handshake captures browser-provided tab/document identity before opening export. One-use launch claims bind the created export document; caller-supplied targets, client IDs, and override flags cannot replace the worker's recorded values. The isolated receiver rejects the old direct route. Reloaded/replayed/closed/restarted contexts fail safely without retargeting a replacement document.
- Cancellation revokes late responses and explicitly cancelled advanced consent. Registering pending previews before storage reads prevents immediate cancellation from starting metadata work afterward; an old response cannot cancel a newer preview.
- Adds an installed-extension disposable-browser regression covering Experience-to-Packages SPA entry, actual settings/worker/isolated/MAIN messaging, metadata-only default preview, latest Integration/API/Sub-Pipeline ZIPs, supplier exclusion, advanced confirmation/revocation, ticket replay, and source reload. Worker/boundary/native/UI tests use realistic sender envelopes and test rejected routing fields; cleanup checks include the new profile.
- No new permissions, credential reads, favorite/source-cache changes, settings regrouping, or changes to native readers/six-request limits. The next-opening update summary describes this fix. Signed-in institution export testing is still required; main/store remain unchanged.

## 2.0.3 — 2026-10-15 — Test Workspace Cleanup

- Browser fixtures now create persistent profiles in the system temporary folder and remove their own profiles in finally blocks, including failed launches/assertions/browser shutdowns. Cleanup validates the owned temp path, retries transient Windows file locks, and reports removal failures instead of silently leaving test data behind.
- Covers tenant-favorites-browser.cjs, published-fitting-details.cjs, and local designer-ownership-worker-browser.cjs, package-capture-worker-browser.cjs, and probe-message-sender.cjs. Adds browser-profile-cleanup.cjs for launch/assertion/close/removal failure regressions. The local source-worker fixture uses the supported synthetic Designer route; assertions remain unchanged.
- Local cache-appearance.cjs, package-artifacts.cjs, page-behavior.cjs, pipeline-column.cjs, search-sharing-browser.cjs, shared-from.cjs, sharing-controls.cjs, and ui-consistency.cjs save screenshots only to an explicitly configured artifact directory. Local Playwright paths are configurable. Release staging also uses owned system-temp storage with finally cleanup.
- Removes verified inactive disposable profiles and one synthetic export ZIP; retains historical screenshots and release/review recovery snapshots. Five real-browser profile fixtures and 20 failure scenarios passed. Seven older local UI fixtures still fail against v2; no full legacy-suite pass is claimed.
- Extension behavior, favorites, source data, permissions, and settings layout are unchanged. The reported empty exporter preview remains unresolved; this maintenance candidate does not fix it. Main/store remain unchanged.

## 2.0.2 — 2026-10-14 — Packages Export Test Candidate

- Both default and temporary advanced exports now start from Integration Packages. Default eligibility requires Shared From consent and exact Designer-recorded package/pipeline names; Shift+D reveals a separately confirmed, unsaved override of that filter only.
- Preview reads latest package metadata, including APIs/Sub-Pipelines omitted from native runnable lists. Select all eligible packages or one package, then explicitly retrieve latest published JSON and save a package-folder ZIP. No background source downloads or changes to favorites, cache format, permissions, or published artifacts.
- Native requests share a six-job budget with sharing lookups. Timeout/cancellation retains occupied capacity until the native calls settle. Context, entry, identity, and version guards stop failures without a partial ZIP; Sub-Pipelines without a verifiable exact version fail safely. JSON may be reformatted, and downloaded source can contain confidential embedded values.
- Synthetic native flow tests cover 120 eligible packages plus an excluded supplier package, all artifact types, opaque authentication configuration, exact filtering, override, tenant switches, version failures, and stalled capacity. Browser checks cover explicit ZIP assembly, selection, pagination, cancellation/late replies, opt-out, both themes, and existing settings/favorites. Signed-in download testing is pending. Main and store remain unchanged; this is a manual-test candidate, not an approved release.

## 2.0.1 — 2026-10-14 — Dedicated Export Preview

- Adds a separate extension export tab, explicitly opened from settings, with Designer metadata preview, counts, Show More, working indicator, Cancel, and Refresh Preview. Preview uses the full loaded manager model rather than search/visible-row caps and does not request source JSON.
- Requires Shared From consent and recorded exact package/pipeline relationships by default. Adds a separately confirmed, temporary Shift+D advanced preview override and one-use, in-memory launch tickets bound to the original source tab and created extension tab. No saved override or new permissions.
- Adds a tested, offline six-reader collection runner with before/after context checks, cancellation, formatted JSON, size limits, and all-or-nothing failure handling. Authenticated adapters are unfinished: Download ZIP stays disabled and Integration Packages export is not connected yet.
- Tests cover 120×120 package/pipeline metadata projection, 120-record collection, bounded requests, sender/route checks, expired/replayed launch tickets, preview pagination, cancellation/late replies, opt-out, both themes, advanced consent, and preference preservation. No live downloads or signed-in account tests claimed. Main, outputs, and store remain unchanged.

## 2.0.0 — 2026-10-14 — Development Checkpoint

- Starts v2 on develop; main and the packaged 1.22.6 release remain unchanged. This is source-only development, not a store-ready release.
- Regroups settings into Navigation, Integration Packages, Integration Designer, Icon & Favorites, Custom Sites, and Export & Backup. Preserves existing preference keys, source consent, refresh, JSON backups/imports, and favorite records. Save errors stay beside the controls they describe.
- Adds a small, dismissible What's New card on the next settings opening after a version update. Dismissal remembers only that version; no automatic tabs, polling, or changes to favorites/source data. Failed saves allow retry.
- Adds offline exporter planning: exact cached package/pipeline ownership by default, latest stable published version per name/type, API/Sub-Pipeline handling, safe folder names, and local uncompressed ZIP generation with unchanged source bytes. Uses no credentials, service requests, or extra permissions.
- The ZIP download action remains disabled. Authenticated download wiring, preview/confirmation/progress/cancel, final partial-failure behavior, and the advanced temporary override are still pending. Stable semantic versions only and a 64 MB/10,000-file draft limit are explicit development limitations, not a claim of complete export support.
- Pure exporter/update tests and synthetic light/dark popup checks cover filtering, version selection, 120-package/pipeline metadata, ZIP interoperability, one-line layout, failed dismissal/reload, and preference preservation. No live downloads or signed-in account tests are claimed.

## 1.22.6 — 2026-10-13

- Removes the blanket grey dimming while **View Published Fitting Details** is enabled, so published fitting text/code is easier to read. Native disabled action styling and all read-only protections remain.
- Restores the original opacity and inline priority when viewing is disabled or the fitting changes, without overwriting a newer native opacity. Draft behavior, preference defaults, copying, storage, permissions, and service requests are unchanged.

## 1.22.5 — 2026-10-13

- Adds optional **View Published Fitting Details** under Page Behavior, off by default. In Designer, published fitting text/code can be scrolled, selected, and copied without creating a draft.
- Replaces the blanket published-fieldset lock with individual read-only text/code and disabled action controls. Preserves dimmed styling, blocks editing shortcuts/paste/cut/drop, leaves drafts unchanged, and restores native locks when switched off or leaving the fitting.
- Unknown/unavailable Ace editors stay locked. Only the preference is saved; no fitting content, credentials, new permissions, polling, or extra service requests are added.

## 1.22.4 — 2026-10-13

- Retires an assigned old favorite copy only after reading back its saved tenant list and verifying that every old package/pipeline pin is present. Active favorites, order, layout, and Shared From data are unchanged.
- Keeps unassigned, unmatched, malformed, or unverified copies. Failed verification or cleanup leaves recovery data intact and does not hide successfully saved favorites; later visits can retry.
- JSON backups now keep compact `assignments` markers separately, without duplicate package/pipeline data for cleaned-up lists. Older backup files remain importable, and markers continue preventing removed pins from being automatically revived.
- Cleanup runs behind the existing serialized favorite writer, with one read-back per eligible batch and no polling or extra service requests.

## 1.22.3 — 2026-10-13

- Moves **Export JSON** into **Backup & Restore**, beside **Import JSON**, and makes that disclosure the last settings section.
- Leaves **Refresh** beneath Shared From in Page Behavior. Export success/failure messages now appear with the backup controls instead of replacing refresh feedback.
- Backup contents, tenant-scoped favorites, source-cache consent, refresh behavior, and permissions are unchanged.

## 1.22.2 — 2026-10-13

- Fixes favorites and opted-in Shared From collection on direct Designer loads when the page has no preloaded tenant global. Reads the existing live Designer manager, so going through Experience Home is no longer needed for that case.
- Preserves tenant/page isolation, original favorite recovery copies, and saved pins. Uses targeted element lookups only, without full-page scanning, polling, extra service requests, or new permissions.
- Gives both search fields unique IDs to resolve the browser's missing form-field identity warning, with no changes to search behavior or presentation.
- Adds regression coverage for direct Designer entry/reload, live tenant switching, root replacement, retained Designer state on Packages, and automatic source caching.

## 1.22.1 — 2026-10-13

- Existing host-only favorites now carry over automatically to the actual loaded tenant when it is the only tenant known on that domain. Packages and Designer lists remain separate; existing tenant pins are merged, and the original copies stay preserved.
- If multiple tenants are already known for the domain, **Backup & Restore → Use Old Favorites for This Tenant** remains the explicit choice. A tenant visited without pins is still remembered, so a later tenant never inherits the first one's old list.
- Prepares migration before showing favorites, retries safely after failed reads/writes, and does not repeat a completed migration or revive pins removed afterward. No guessed tenant IDs, new permissions, extra service requests, or idle polling.
- JSON backups preserve old-list assignment associations. Restoring a current tenant list does not reapply its older recovery copy, including older backups with one matching list.

## 1.22.0 — 2026-10-13

- Favorites are now separate by site, tenant ID, and Packages/Designer page, including multiple tenants on one vanity domain. Tenant identity comes from the already-loaded page; no extra service calls or permissions are needed.
- Older host-only favorites are preserved. Open settings on the intended tenant/page and use **Backup & Restore → Use Old Favorites for This Tenant** once to assign that page's old list. The original copy stays available in exports.
- **Export JSON** now backs up tenant favorites, pinned pipelines/order/layout, old unassigned lists, and saved Shared From observations, even when no sources are cached.
- **Backup & Restore → Import JSON** previews tenant lists before applying them. Merge is the default; replacing matching lists requires confirmation. Restoring Shared From is optional, retains observation dates, requires the existing opt-in, and does not change settings or site permissions.
- Favorites stay unavailable while tenant identity or saved data is unresolved. Delayed replies cannot load another tenant's pins; a serialized worker saves changes without overwriting other tenant lists.

## 1.21.9 — 2026-10-13

- Saving a favorites height or a remembered panel width now keeps the page it started on and skips the save if the stored values cannot be read, so other pages' saved heights and widths are never overwritten.
- Settings switches for **Remember Resized Width**, **Pinned Packages**, and **Shared To** wait for saved values to load, stay disabled while saving, and return to the last saved value with a short message if saving fails. Saved widths are cleared only after reset-on-refresh is actually saved. Adds `tests/popup-switches.regression.js`, which checks that the displayed switch always matches the saved preference.
- A failed settings read when a page first loads no longer starts from empty favorites.
- Designer sharing lookups stop adding a new loader probe on each failed attempt, and opening a Designer pipeline no longer errors on a missing version.
- Marks deliberate code with one-line `Keep:` comments that name the version that introduced it.
- Code cleanup with no intended behavior change: a new `shared.js` holds the page rules and resize gesture used by both page scripts; favorites loading, package/pipeline reordering, and the sidebar and favorites resize handles each share one implementation; the page helper routes messages through one listener; and the settings markup drops unused wrappers.
- No changes to features, saved data formats, permissions, or service requests.

## 1.21.8 — 2026-10-07

- Returns **Refresh** to the action row beside **Export JSON**, keeping the shorter label. Removes the no-longer-needed inline positioning and title spacing.
- Keeps page-specific descriptions, hover/accessibility setup guidance, consent, working-circle feedback, and all saved settings unchanged.

## 1.21.7 — 2026-10-07

- Clarifies the page-specific settings: API/Sub-Pipeline display is **Integration Packages only** and does not hide Designer records; Shared To describes Designer destinations, and Shared From describes sources in Integration Packages.
- Replaces the long **Refresh Shared From Data** button with **Refresh** beside Shared From. Retains its working circle, current-Designer-only behavior, and success/failure feedback.
- Moves the permanent Designer setup line into native hover/accessibility help; consent still explains visiting each source environment. Refresh feedback continues to guide users who need to open Designer. Export and saved preferences are unchanged.

## 1.21.6 — 2026-10-07

- Orders **Page Behavior** into three groups separated by thin dividers: width/favorites/API and Sub-Pipeline display; Shared To/Shared From; then the two search controls.
- Moves **Show APIs & Sub-Pipelines** above sharing controls. Both search labels now match the other setting titles' font size and weight; descriptions remain short. Settings behavior and saved choices are unchanged.

## 1.21.5 — 2026-10-07

- Groups search controls under **Page Behavior**, removing the separate Search Display section. Adds **Show APIs & Sub-Pipelines** there as an independent switch for Integration Packages reference rows and their Type column, with a short one-line description.
- Shared From now controls only Designer-source collection, its cache, and the source column. Disabling either setting leaves the other setting and favorites unchanged.
- New installs default reference display to off; existing users retain their previous display choice once during the upgrade. Reference metadata still uses native package responses without extra requests or persistent record storage.

## 1.21.4 — 2026-10-07

- Uses the browser's built-in tooltip for non-actionable API/Sub-Pipeline names instead of a custom popover. The single-line text is now **For Reference Only; Cannot Be Run From This Page.** Browser timing and presentation are native; guidance stays on the name only.

## 1.21.3 — 2026-10-07

- Hovering an API or Sub-Pipeline name shows “For reference only; cannot be run from this page.” after the existing two-second delay. Guidance stays on the name, not its row, version, or source; normal Integration links and favorite-name help are unchanged.
- Shortens the favorite-shape setting from **Bear Face** to **Bear**, without changing the icon design, saved choice, or colors.

## 1.21.2 — 2026-10-07

- Removes the native empty-package illustration and its reserved blank space when read-only API/Sub-Pipeline records populate the main table. The replacement table is outside the hidden empty-state container.
- Restores the complete original empty state for genuinely empty packages and when Shared From is turned off. Keeps the package heading/description, normal Integration rows, favorites, metadata capture, and storage behavior unchanged.

## 1.21.1 — 2026-10-07

- Fixes missing API/Sub-Pipeline records: captures only their names, types, and latest published versions from the package response before Ellucian filters its sidebar data. Uses the existing request; no extra network traffic or permanent storage.
- Ties the added Type column and read-only API/Sub-Pipeline rows to **Shared From**. Turning it off removes these additions and clears their in-memory records without touching native Integration rows or favorites.
- After installing this update, or enabling Shared From after it was off, refresh Integration Packages once so its normal package loading supplies the records. Handles responses arriving before or after package selection and keeps snapshots separate by tenant and published package version.

## 1.21.0 — 2026-10-07

- Integration Packages adds a **Type** column between **Pipeline Name** and **Version**, followed by optional **Shared From**. Name sizing and manual resizing account for all visible columns without wrapping names.
- Shows the newest published **API** and **Sub-Pipeline** release for each name as plain, non-clickable records in the main package view, including otherwise empty packages. Normal integration links remain unchanged; the sidebar and favorites are not expanded.
- Reuses the package metadata already loaded by Ellucian. Adds no network requests, permissions, persistent metadata, or changes to favorites/Designer source storage.

## 1.20.10 — 2026-10-07

- Adds **Star**, **Circle**, and **Bear Face** favorite icons. Star remains the default; all three use your favorite color or **Match Icon Color**, with gray unpinned outlines. Appearance changes preserve pins, ordering, and expanded packages.
- Renames the appearance section **Icon & Favorites** and shortens Shared From setup wording.
- Settings shows **Cached MM-DD-YY**, **No Cache**, or **Caching…** for the current Designer environment. The date reflects the last successful save; failed refreshes retain it. Status reads reuse existing local state without new Ellucian requests or polling, and missing connections show **Status Unavailable**.

## 1.20.9 — 2026-10-07

- Designer pipeline search displays 20 matches initially, with **Show More** adding 20 at a time and a total count. All loaded matches remain accessible beyond the previous 100-result cutoff, without new Ellucian requests.
- Shared To updates each completed pipeline without waiting for its entire batch. The 30-second service deadline starts when the request begins, not while queued. Timed-out native calls retain their slot until they finish; identical pending calls are reused and actual traffic remains limited to six requests.
- Adds **Report Bug** beside the settings version, opening a public GitHub report template without uploading local data. No diagnostic button is added.
- Shared From failures now distinguish incomplete/loading data, lost page connections, site access, storage read/write failures, and cache limits. Basic console warnings contain fixed failure codes only, not raw exceptions, URLs, source names, or pipeline contents. Existing source data and favorites are preserved on failures.

## 1.20.8 — 2026-10-07

- Adds a spinning working circle to **Refresh Shared From Data** in settings. It stays visible while the current Designer environment is collected and saved, then stops on success or failure.
- Keeps the existing completion messages, disabled button, and accessible busy state. Supports reduced-motion preferences without adding requests, polling, permissions, or changes to saved data.

## 1.20.7 — 2026-10-07

- Fixes Shared From snapshots being rejected after navigating from Experience Home into Designer without refreshing. Automatic collection does not require selecting a package; Designer's loaded package data must be ready.
- Verifies the live Designer location through the existing extension page script, targeting the original top-level document and rechecking before saving. Navigation away, document replacement, or withdrawing consent prevents a pending save.
- No new permissions, extra Ellucian service requests, cache-format changes, or changes to favorites. Includes regression coverage using real extension messaging and storage in a disposable browser profile.

## 1.20.6 — 2026-10-06

- Pinned package and pipeline names use the browser's native tooltip only when their rendered name is cut off, following Andrew's observation of Integration Packages. Fully visible names have no tooltip; name-help timing and typography are browser-managed, with no custom wrapped bubble over the version badge. Native page names are untouched.
- Delays extension-owned action/sharing tooltips for two seconds of continuous hover instead of showing instantly. Each newly hovered control starts its own delay; keyboard focus still shows that help immediately.
- Cancels pending help on pointer exit, click/drag, Escape, scrolling, resizing, tab blur, route changes, or target removal. Uses only one on-demand timeout, with no polling or changes to favorites, settings, sharing requests, or saved data.

## 1.20.5 — 2026-10-06

- Standardized extension-owned in-page help with one reusable styled tooltip for stars, favorites, search, sharing, and resize controls. Supports hover, keyboard focus, Escape, viewport-aware placement, live refresh results, and cleanup on navigation/removal; native page tooltips are untouched. Shared From guidance stays on its heading, not source values.
- Uses Pin Package / Unpin Package and Pin Pipeline / Unpin Pipeline consistently in the normal and pinned lists, with named accessible labels.
- Keeps routine page refresh feedback out of headings while leaving settings errors, permission/setup instructions, and empty-list/search guidance visible. Refresh wording is consistent; pending sharing checks remain distinct from empty or unavailable results.
- Distinguishes disabled controls from active work using explicit busy states. Waiting cursors appear only during source refresh/export/saving or custom-site work. Standardized comparable hover/focus styling and search/refresh vector metrics while preserving native row typography, badge sizing, and custom star colors.
- No changes to favorites, saved formats, permissions, sharing cache behavior, six-request limit, or pipeline navigation.

## 1.20.4 — 2026-10-06

- Moved manual Shared To refresh feedback, including the no-shared-pipelines message, into the refresh icon's hover text instead of displaying it beneath the heading. Retains screen-reader announcements without changing header size.
- Keeps the six-request limit, caching, refresh behavior, favorites, and saved data unchanged.

## 1.20.3 — 2026-10-06

- Raised the global Shared To service-request limit from three to six at Andrew's request, including when checking a single package batch. Keeps the one-scan-per-batch cleanup, existing caching, cancellation, and refresh behavior.
- No changes to favorites, saved data, settings, permissions, column sizing, or Shared From collection.

## 1.20.2 — 2026-10-06

- Limits Shared To history and destination-name service lookups to three simultaneous requests across all check batches. Disabling Shared To stops waiting calls; completed cached results are retained and cancelled calls can be retried when enabled again.
- Scans already-loaded package/version data once per sharing batch instead of again for each pipeline. Exact current-version validation, same-major history matching, cache reuse, and manual/automatic refresh behavior are preserved.
- No changes to favorites, stored data formats, settings, permissions, automatic column sizing, or independent Shared From collection. This is a processing cleanup, not a new user-facing feature.

## 1.20.1 — 2026-10-06

- Automatically fits pipeline names for each selected Integration Packages package, capped to available space after Version and Shared From. Short names use a narrower column; long names use more room without wrapping. Manual resizing remains available and does not carry into another package.
- Double-click or Enter still fits full loaded names, allowing local scrolling when necessary. Home restores automatic sizing, which responds to window resizing without overriding manual adjustments.
- Avoids rewriting unchanged table markers, styles, and resize values. A synthetic 100-update test with 50 rows went from 5,400 redundant attribute updates to none, with no new saved data or service requests.
- Fixed pinned pipeline badges and navigation targets remaining on an older minor/patch release after the loaded index updates. Saved pins and their major-version tracking are unchanged.

## 1.20.0 — 2026-10-06

- Started the 1.20 release series with the wider, resizable pipeline-name column and double-click autofit introduced in 1.19.10. This is a version-number change only; functionality is unchanged.

## 1.19.10 — 2026-10-06

- Gave pipeline names a wider 400-pixel starting column in Integration Packages, independently of Shared From. Names stay on one line; Version and source columns stay compact.
- Added a draggable divider beside **Pipeline Name**. Double-click it to fit the longest loaded name; keyboard arrows resize, Enter autofits, and Home restores the default. Oversized tables scroll within the package detail area, without widening the page.
- Keeps the chosen width during in-app package changes, resetting on a page refresh. No new saved data, permissions, or service requests; favorites and existing panel-width settings are unchanged.

## 1.19.9 — 2026-10-06

- Grouped saved and exported Shared From data by environment, package, and pipeline name. Package relationships come from already-loaded Designer data; no additional service requests or duplicate flat pipeline list are needed.
- Kept the fast pipeline-name lookup, bounded storage, current-environment refresh, and existing privacy controls. Package and pipeline names are sorted and duplicate versions are combined within each package.
- Preserved previously saved pipeline names under **Package Not Yet Recorded** until Designer is refreshed in that source environment. Their original last-checked times remain unchanged, and actual package groups replace the placeholder on refresh. Favorites and other settings are untouched.

## 1.19.8 — 2026-10-06

- Renamed Shared Environments to **Shared To** in the Designer column, settings, refresh-button labels, and current user documentation to pair with **Shared From**. Existing settings and sharing behavior are unchanged.

## 1.19.7 — 2026-10-06

- Protected favorites loading during in-app navigation after an extension reload, including missing storage APIs, synchronous context errors, and delayed replies after disconnection.
- Failed favorites reads no longer restore empty defaults. Disconnected checks stop with a page-refresh hint; saved favorites, settings, and Shared From sources are not cleared.

## 1.19.6 — 2026-10-06

- Prevented Shared From cache saves from throwing when an extension reload disconnects an already-open page. Source checks stop safely and give a page-refresh hint, without clearing saved sources, favorites, or settings.
- Covered missing messaging APIs, invalidated connections, and reloads while a save reply is pending. Normal save failures still have one retry; successful refresh behavior is unchanged.

## 1.19.5 — 2026-10-06

- Fixed Shared From collection when entering or revisiting Designer through Experience without a full refresh. Each visit waits for a fresh, complete package index, with bounded local readiness checks and no continuous polling.
- Added **Refresh Shared From Data** under **Page Behavior**, beside **Export JSON**. It refreshes only the active Designer environment and reports success after the cache is saved.
- Manual refresh gives guidance when disabled, on another page, still loading, or unable to complete. Leaving Designer or disabling Shared From cancels pending checks; closing settings does not cancel an active collection. Favorites and permissions are unchanged.

## 1.19.4 — 2026-10-06

- Fixed a delayed favorites save that could write one page's pins into the other page after navigation. Saves now retain their original page and pin snapshot; failed reads do not overwrite saved lists.
- Restored the original borderless, two-arrow Shared Environments refresh design with stronger vector strokes.
- Moved Shared From guidance to the heading only. Source values match Version and have no individual tooltips or information icons.
- Kept refresh available when no shares or published rows are displayed. Manual checks show checking, success, no-shares, or failure feedback for the current package view, without extra requests for draft-only rows.

## 1.19.3 — 2026-10-06

- Simplified the Shared Environments refresh icon and replaced the Shared From information glyph with a vector icon.
- Matched Shared From value typography and color to Version. Shortened source tooltips and confined them to the source value/info icon, with no header tooltip.

## 1.19.2 — 2026-10-06

- Fixed Shared From collection when Designer does not provide preloaded environment information. It now uses the current environment already held by the page.
- Repeats the opt-in handshake at collection time and retries a missed startup lookup once. Successful snapshots are not repeatedly requested; temporary environment lookup failures can recover.

## 1.19.1 — 2026-10-06

- Added **Export Shared From JSON** under **Page Behavior** to download a readable snapshot of cached source environments, pipeline names, and last-checked times.
- Export uses normal browser download handling, requires no additional permissions, and does not change the live cache or upload data. Exported files do not update automatically and remain after the browser cache is cleared.

## 1.19.0 — 2026-10-06

- Added optional **Shared From** in Integration Packages, using pipeline names observed in Designer across environments. Unknown or conflicting sources show setup guidance; known sources show their last-checked time on hover or keyboard focus.
- Shared From is off by default and requires accepting a notice before saving additional local metadata. Visit Designer in each source environment to populate or update it. Disabling clears only this cache, not favorites; it does not perform cross-environment polling or verify live share history.
- Grouped width, favorites, and sharing switches under collapsible **Page Behavior**, with concise descriptions.
- Refined the Shared Environments refresh button with a clearer circular-arrow icon and larger target.
- Updated the README and privacy policy for the optional local cache.

## 1.18.1 — 2026-10-05

- Issued the current Custom Sites fixes and settings refinements as a distinctly numbered patch release. Existing approved sites appear with Remove, and site setup finishes even if settings close.
- Every subsequent delivered revision receives a new version, with small fixes increasing the patch number.

Earlier development rebuilds reused 1.18.0. Their changes remain grouped below under the version actually delivered, rather than assigning retrospective version numbers.

## 1.18.0 — 2026-10-05

- Added **Favorite Stars** within **Icon & Favorites Appearance**: choose a custom color or **Match Icon Color** to follow the toolbar icon's background.
- Applies the same color to pinned packages, pinned pipelines, and selected stars in the main list without rebuilding favorites. Unpinned stars remain gray outlines.
- Includes a live star preview and **Reset Stars**, which restores independent purple without changing the toolbar icon. Preferences remain local to this browser.
- Renamed the appearance section **Icon & Favorites Appearance** and shortened the main setting descriptions.
- Made **Search Display** collapsible with independent dropdowns for **Package Sidebar Search** (both pages) and **Designer Pipeline Search** (within a selected package). Each supports Search Box, Icon, or Hidden; existing sidebar preferences are preserved.
- Standardized settings labels and extension-added page headings to Title Case; descriptions remain in sentence case.
- Fixed the Star Color swatch to follow the icon when Match Icon Color is enabled. Turning matching off restores the retained custom color.
- Fixed Custom Sites setup when the permission prompt closes settings. The background saves approved domains, existing exact custom-site approvals are recovered into the list, and Remove completes in the background without deleting favorites or widths.

## 1.17.0 — 2026-10-05

- Added a collapsible **Custom sites** list in Settings for university vanity URLs, with Add, Remove, and Allow controls.
- Requests optional access to each added HTTPS domain. The standard Experience Test and Production sites remain enabled without additional setup.
- Remembers approved custom sites across browser restarts, while keeping favorites and widths separate by domain as before.
- Removing a site revokes its optional access; refresh open pages to clear already-loaded controls. Updated the README and privacy policy.

## 1.16.2 — 2026-10-02

- Renamed the extension to **Integration Navigator**, including its toolbar tooltip and settings header.
- Updated the README, privacy policy, and store submission text while keeping Ellucian compatibility and the non-affiliation disclaimer clear.
- Kept the existing unpacked folder, settings, favorites, and icon defaults unchanged. Existing installations update by replacing files in the same folder and selecting Reload.

## 1.16.1 — 2026-10-02

- Selecting a pinned package now raises its normal sidebar row when needed to reveal about five pipelines, depending on the available panel height.
- Already-high packages stay in place. The adjustment follows the expansion animation and stops if you select something else or scroll the list yourself.
- Added an explicit **White/Black** letter-color choice in **Icon appearance**, replacing automatic contrast selection. The default and Reset now use a black E on purple, including crisp packaged toolbar artwork.

## 1.16.0 — 2026-10-02

- Added **Icon appearance** settings for a background color and one or two letters, with a live preview and automatic black/white text contrast.
- Remembers the toolbar icon across browser restarts and provides **Reset** to restore the original purple E. The settings header follows the same appearance; the store icon stays unchanged.
- Kept these controls collapsible and generated toolbar artwork at multiple display scales without extra permissions, network requests, or background polling.

## 1.15.1 — 2026-10-01

- Fixed pinned pipeline and search-result navigation stopping at the package page when versions differ only by a leading `v`, such as `v2.0.0` and `2.0.0`.
- Exact release matching is preserved; this does not select a different minor or patch version.

## 1.15.0 — 2026-09-29

- Added a refresh button beside **Shared Environments** to recheck displayed pipelines, with a loading indicator.
- Refreshes affected sharing information when returning from checkbox sharing or the three-dot share page, including after cancelling.
- Prevents older sharing responses from overwriting refreshed information. Unrelated cached results are retained, with no background polling.

## 1.14.2 — 2026-09-29

- Corrected the column heading to **Shared Environments**.

## 1.14.1 — 2026-09-29

- Made the sharing column heading bold to match the other headings.

## 1.14.0 — 2026-09-29

- Changed the optional sharing column to comma-separated environments, with shared versions on hover and red text for a version mismatch within the same major version.
- Moved Designer pipeline search beside **Pipelines:**.
- Made both sidebar and Designer pipeline searches ignore capitalization, spaces, and separators: `MMR`, `unco mmr`, and `uncommr` can find `UNCO-MMR`.
- Cached sharing-history checks until refresh.

## 1.13.1 — 2026-09-29

- Added pipeline search within the selected Designer package, including other table pages.
- Improved pinned pipeline navigation, returning to Experience, and sharing checks.
- Fixed sharing tooltips appearing behind other rows.

## 1.13.0 — 2026-09-29

- Added an optional shared-version column in Designer, off by default, with destination tooltips.
- Made the settings popup more compact and removed the redundant width explanation.

## 1.12.1 — 2026-09-29

- Made favorited pipelines open their pipeline page more reliably after the package list redraws.

## 1.12.0 — 2026-09-24

- Fixed activation when opening Experience Home and then navigating to Packages or Designer, including after visiting another website.

## 1.11.1 — 2026-09-24

- Added handling for pages restored with the browser's Back/Forward cache. The separate Experience Home navigation issue was addressed in 1.12.0.

## 1.11.0 — 2026-09-24

- Removed support for old favorites-storage formats while preserving current favorites.
- Simplified the README to focus on features, settings, installation, updating, and removal.

## 1.10.0 — 2026-09-24

- Changed pipeline favorites to follow the newest available version within the same major version, rather than one exact version.
- Kept different major versions separate; package favorites remain name-based.

## 1.9.3 — 2026-09-24

- Kept pinned pipeline groups, arrows, and expansion state when Ellucian unloads the original package rows.

## 1.9.2 — 2026-09-24

- Removed extra right-side spacing to better align pinned stars and version badges with the main list.

## 1.9.1 — 2026-09-24

- Improved retention of pinned pipeline children, arrows, and expansion state when selecting another package.

## 1.9.0 — 2026-09-24

- Added drag-and-drop and keyboard reordering for pinned pipelines within each package.
- Improved pinned fonts, stars, version badges, and stability while changing packages.

## 1.8.3 — 2026-09-24

- Improved verification of pinned pipelines against visible rows so saved pipelines appear in Favorites.
- Adjusted version and star alignment.

## 1.8.2 — 2026-09-24

- Stretched pipeline rows to the full available width for consistent version and star alignment.
- Improved parent-package matching and pipeline-name/version matching for favorites.

## 1.8.1 — 2026-09-24

- Introduced consistent name, version, and star columns.
- Improved pipeline pinning and parent-package lookup.

## 1.8.0 — 2026-09-24

- Added pipeline favorites grouped beneath their parent package, with independent package and pipeline pins.
- Added separate navigation and expand/collapse controls, with remembered expansion state.
- Retained unavailable favorites for possible restoration while hiding them from view.

## 1.7.2 — 2026-09-24

- Separated favorites, ordering, expansion state, and favorites-panel height for Test/Production and Packages/Designer.

## 1.7.1 — 2026-09-24

- Reduced unnecessary page checks, layout updates, repeated searches, and settings reads.
- Removed unused assets and cleaned up the extension package.

## 1.7.0 — 2026-09-24

- Added vertical resizing of the favorites area, including keyboard resizing and remembered height.
- Aligned favorites scrollbars, typography, spacing, and hover styling with the sidebar.

## 1.6.4 — 2026-09-24

- Added drag-and-drop and keyboard ordering for pinned packages.
- Matched the sidebar background and remembered custom order.

## 1.6.3 — 2026-09-24

- Fixed pinned-package navigation and allowed unpinning directly from Favorites.
- Matched package fonts and hover effects, with visible keyboard focus.

## 1.6.2 — 2026-09-24

- Changed Favorites to a full-width sidebar section with matching spacing and dividers.
- Used right-facing arrows for collapsed groups and down-facing arrows for expanded groups.

## 1.6.1 — 2026-09-24

- Fixed saved favorites not appearing by improving package-name matching and checking visible rows.

## 1.6.0 — 2026-09-24

- Added a collapsible **Pinned packages** section, package stars, remembered state, and an on/off setting.
- Initially separated favorites by Test and Production; page-specific separation followed in 1.7.2.
- Hid unavailable packages without deleting their saved pins.
- Added the installed version and Ellucian non-affiliation/support disclaimer to settings.

## 1.5.4 — 2026-09-24

- Replaced the search-button graphic with a crisp, properly joined magnifying-glass icon.

## 1.5.3 — 2026-09-24

- Widened the search field so its full placeholder fits while allowing it to shrink on narrow panels.

## 1.5.2 — 2026-09-24

- Fixed the header layout so search stays beside **PACKAGES**, with Designer's **+** button on the right.

## 1.5.1 — 2026-09-24

- Adjusted search positioning to remain beside **PACKAGES** during resizing, including compact icon mode.

## 1.5.0 — 2026-09-24

- Improved keyboard search, Escape/click-away closing, result ranking, and notices when more results exist.
- Added a fallback search when Ellucian's loaded data cannot be read.
- Remembered widths separately for each page and environment; constrained widths when the browser narrows.
- Improved hidden-search behavior, page cleanup, resize guidance, and toolbar icons at different display scales.

## 1.4.0 — 2026-09-24

- Added package-and-pipeline search using data already loaded by Ellucian.
- Added **Search box**, **Search icon**, and **Hidden** display settings, with grouped results and pipeline selection.
- Improved the purple E icons.

## 1.3.1 — 2026-09-24

- Redesigned settings with automatic system light/dark mode and clearer width-memory status.
- Added a purple toolbar icon with a white E.

## 1.3.0 — 2026-09-24

- Made pipeline names use the available column width while keeping version badges visible.

## 1.2.4 — 2026-09-24

- Reduced the gap between the scrollbar and column divider, leaving a narrow resize strip.

## 1.2.3 — 2026-09-24

- Intermediate build: adjusted spacing between the scrollbar and resize edge; refined in 1.2.4.

## 1.2.2 — 2026-09-24

- Fixed the inner package list, heading, tree, and scrollbar not widening with the resized column.

## 1.2.1 — 2026-09-24

- Fixed activation on the separate Integration Designer URL on both Test and Production.

## 1.2.0 — 2026-09-24

- Intermediate build: added the **Remember resized width** settings switch, with reset-on-refresh as the default.

## 1.1.0 — 2026-09-24

- Added thin scrollbars and draggable column resizing, including keyboard controls. Width initially reset on refresh.

## 1.0.0 — 2026-09-24

- Created the Edge/Chrome extension with independent package-list scrolling and fixed package headings.
- Added Production support alongside Test in a same-version update. Designer URL activation was corrected in 1.2.1.

## Planned and deferred

- Next update: add a **Search pipelines in this package** tooltip while keeping the shorter placeholder. The accessibility label already uses this wording.
- Deferred: **Sub-Pipelines** and **Shared** filter buttons beside Draft and Published.
