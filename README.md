# Integration Navigator

A Chrome and Microsoft Edge extension that improves package navigation in:

- Ellucian Integration Packages
- Ellucian Integration Designer

It works on the standard Ellucian Experience Test and Production sites, with optional university vanity URLs. Previously named **Ellucian Left Panel Scroll**.

## Updates

See [CHANGELOG.md](CHANGELOG.md) for version history and recent changes. The installed version is shown at the bottom of the extension settings.

## Features

- Adds a separate, thin scrollbar to the package list.
- Keeps the **PACKAGES** heading visible while scrolling.
- Lets you resize the package column.
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

- Remember or reset the resized column width after refreshing.
- Open **Search display** for two independent dropdowns: **Package sidebar search** (beside PACKAGES on both pages) and **Designer pipeline search** (inside the selected package). Each offers **Search box**, **Icon**, or **Hidden**. Icon opens on demand; Escape or clicking elsewhere closes it. Both default to Search box, and the settings section can be collapsed.
- Show or hide pinned favorites without deleting them.
- Open **Custom sites** to add your university's Experience URL. Allow access when prompted, then refresh the page. You can add multiple sites or remove them later; the two standard Experience sites stay enabled.
- Open **Icon & Favorites appearance** to choose a background color, one or two letters, and white or black lettering, with a live preview above. The default is a black **E** on purple; **Reset** restores it. Your choice stays local to this browser; the store listing icon does not change.
- Under **Icon & Favorites appearance → Favorite stars**, choose a star color or enable **Match icon color** to follow the icon's background. **Reset stars** restores independent purple. Unpinned stars stay gray outlines; all pinned package and pipeline stars use your chosen color.
- Optionally show **Shared Environments** in Designer. Hover or focus a destination to see its newest shared version. Red means it differs from the published row within the same major version. This is off by default.
- Sharing information refreshes when you return from either share flow, including after cancelling. Use the refresh icon beside **Shared Environments** to recheck displayed pipelines anytime. Results otherwise stay cached to limit traffic.
- Search ignores case, spaces, and separators: `MMR`, `unco mmr`, and `uncommr` can all find `UNCO-MMR`.

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
- Settings and favorites are stored locally by the browser.
- Custom sites must use HTTPS and the normal Integration Packages/Designer page paths. Adding a vanity URL does not transfer favorites or widths from a different domain.
- Removing a custom site revokes its optional access and stops future loading there. Refresh any open page to clear already-loaded controls; its saved favorites are retained if you add it again.
- To remove the extension, use **Remove** on the browser's extension page.

## Privacy and support

See [PRIVACY.md](PRIVACY.md) for information about local storage and optional Ellucian sharing lookups. Support: moore.life@gmail.com.

## Disclaimer

This extension is not affiliated with or supported by Ellucian.
