# Update history

Reconstructed from this development chat, including recorded file changes. Dates use America/Denver. Intermediate builds are identified below; entries describe changes made at the time, with later fixes listed separately.

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
