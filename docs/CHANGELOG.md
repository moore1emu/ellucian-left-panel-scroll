# Update history

Reconstructed from this development chat, including recorded file changes. Dates use America/Denver. Intermediate builds are identified below; entries describe changes made at the time, with later fixes listed separately.

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
