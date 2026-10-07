# Integration Navigator

A Chrome and Microsoft Edge extension that improves package navigation in:

- Ellucian Integration Packages
- Ellucian Integration Designer

It works on the standard Ellucian Experience Test and Production sites, with optional university vanity URLs. Previously named **Ellucian Left Panel Scroll**.

## Updates

See [CHANGELOG.md](CHANGELOG.md) for version history and recent changes. The installed version is shown at the bottom of the extension settings.

Each delivered update receives a new version; small fixes increase the last number (for example, 1.18.1 → 1.18.2).

## Features

- Adds a separate, thin scrollbar to the package list.
- Keeps the **PACKAGES** heading visible while scrolling.
- Lets you resize the package column.
- Automatically sizes **Pipeline Name** in Integration Packages for the selected package, within the available space after Version and Shared From. Short names use a narrower column; long names use more room, without wrapping. Drag the divider to adjust it, or double-click to fit full loaded names with local horizontal scrolling if needed. Manual adjustments stay with the current selection; switching packages calculates a fresh width. Keyboard arrows resize, Enter fits full names, and Home restores automatic sizing.
- Searches package and pipeline names.
- Adds a search beside **Pipelines:** in Designer for the selected package, including entries on other table pages.
- Pins frequently used packages and pipelines to a favorites area.
- Selecting a pinned package raises it in the normal list when needed to reveal its pipelines, without moving already-high packages down.
- Lets you reorder pinned packages and pipelines by dragging their handles.
- Keeps package names, pipeline versions, and stars neatly aligned.
- Remembers favorites separately for Integration Packages and Integration Designer in Test and Production.
- Follows your system's light or dark appearance in the settings window.

Pipeline favorites follow the same major version. For example, a favorite pinned at `1.0.3` will follow newer `1.x.x` releases, but not a future `2.x.x` release.

## Settings

Select the extension icon in the browser toolbar to:

- Open **Page Behavior** to remember the resized width, show pinned favorites, or enable optional sharing columns.
- Open **Search Display** for two independent dropdowns: **Package Sidebar Search** (beside PACKAGES on both pages) and **Designer Pipeline Search** (inside the selected package). Each offers **Search Box**, **Icon**, or **Hidden**. Icon opens on demand; Escape or clicking elsewhere closes it. Both default to Search Box, and the settings section can be collapsed.
- Show or hide pinned favorites without deleting them.
- Open **Custom Sites** to add your university's Experience URL. Allow access when prompted, then refresh the page. Site setup finishes in the background even if settings close. Previously approved custom domains appear here too, with a **Remove** button for each site; the two standard Experience sites stay enabled.
- Open **Icon & Favorites Appearance** to choose a background color, one or two letters, and white or black lettering, with a live preview above. The default is a black **E** on purple; **Reset** restores it. Your choice stays local to this browser; the store listing icon does not change.
- Under **Icon & Favorites Appearance → Favorite Stars**, choose a star color or enable **Match Icon Color** to follow the icon's background. The swatch and star preview show the matching color; turning matching off restores your custom choice. **Reset Stars** restores independent purple. Unpinned stars stay gray outlines; all pinned package and pipeline stars use your chosen color.
- Optionally show **Shared To** in Designer. Hover or focus a destination to see its newest shared version. Red means it differs from the published row within the same major version. This is off by default.
- Sharing information refreshes when you return from either share flow, including after cancelling. Use the refresh icon beside **Shared To** to recheck displayed published pipelines anytime, even when no shares are shown. A short message confirms the result or reports a failed check. Results otherwise stay cached to limit traffic.
- Optionally show **Shared From** in Integration Packages. Enable it under **Page Behavior** and accept the local-data notice, then visit Designer in each source environment. This browser remembers package and pipeline names, their Designer environment, and when they were last checked. Hover or focus the **Shared From** heading for setup guidance; source values have no tooltips. Unknown or conflicting sources show a dash. Revisit Designer to update the information. It reflects observed Designer ownership, not live share history, and can become stale. Turning it off clears only this source cache, not favorites.
- Search ignores case, spaces, and separators: `MMR`, `unco mmr`, and `uncommr` can all find `UNCO-MMR`.

Shared From sources refresh automatically when you enter Designer through Experience, after its package data is ready. For a manual retry, open Designer in the source environment and select **Page Behavior → Refresh Shared From Data**. It updates only that environment and confirms when the cache is saved; it does not contact other environments or change favorites.

After reloading the extension, refresh any already-open Experience page once. If its old connection is unavailable, Shared From checks and favorites loading stop safely until you refresh; saved sources and favorites remain untouched. A failed favorites read is not treated as an empty list.

To inspect saved Shared From data, use **Page Behavior → Export JSON**. It groups names by **Environment → Package → Pipelines**, with readable last-checked times, using your browser's normal download location or save prompt. Previously saved names whose package was not recorded appear under **Package Not Yet Recorded** until you refresh Designer in that environment. The file is a snapshot, not an automatically updated cache. Nothing is uploaded; exporting does not change settings or favorites. If no sources are saved, enable Shared From and visit Designer first. Turning Shared From off clears the browser cache, but does not delete files you previously exported.

## Install in Edge or Chrome

1. Extract the downloaded ZIP file.
2. Extract into a folder you will keep, such as `ellucian-left-panel-scroll`. The ZIP contains `manifest.json` directly at its root.
3. Open your browser's extension page:
   - Edge: `edge://extensions`
   - Chrome: `chrome://extensions`
4. Turn on **Developer mode**.
5. Select **Load unpacked**.
6. Choose the extracted `ellucian-left-panel-scroll` folder containing `manifest.json`.
7. Refresh the Ellucian page.

## Update the extension

Replace the extension files in the same folder you originally loaded. The folder name is unchanged for existing installations; the display-name change does not require removing the extension or resetting favorites.

1. Open the browser's extension page.
2. Find **Integration Navigator** (or **Ellucian Left Panel Scroll** before the first reload).
3. Select its reload button.
4. Refresh the Ellucian page.

## Notes

- The extension does not modify Ellucian packages or pipelines.
- Settings, favorites, and the optional Designer source cache are stored locally by the browser.
- Custom sites must use HTTPS and the normal Integration Packages/Designer page paths. Adding a vanity URL does not transfer favorites or widths from a different domain.
- Removing a custom site revokes its optional access and stops future loading there. Refresh any open page to clear already-loaded controls; its saved favorites are retained if you add it again.
- To remove the extension, use **Remove** on the browser's extension page.

## Privacy and support

See [PRIVACY.md](PRIVACY.md) for information about local storage and optional Ellucian sharing lookups. Support: moore.life@gmail.com.

## Disclaimer

This extension is not affiliated with or supported by Ellucian.
