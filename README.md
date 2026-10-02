# Ellucian Left Panel Scroll

A Chrome and Microsoft Edge extension that improves package navigation in:

- Ellucian Integration Packages
- Ellucian Integration Designer

It is designed for the Ellucian Experience Test and Production sites.

## Updates

See [CHANGELOG.md](CHANGELOG.md) for version history and recent changes. The installed version is shown at the bottom of the extension settings.

## Features

- Adds a separate, thin scrollbar to the package list.
- Keeps the **PACKAGES** heading visible while scrolling.
- Lets you resize the package column.
- Searches package and pipeline names.
- Adds a search beside **Pipelines:** in Designer for the selected package, including entries on other table pages.
- Pins frequently used packages and pipelines to a favorites area.
- Lets you reorder pinned packages and pipelines by dragging their handles.
- Keeps package names, pipeline versions, and stars neatly aligned.
- Remembers favorites separately for Integration Packages and Integration Designer in Test and Production.
- Follows your system's light or dark appearance in the settings window.

Pipeline favorites follow the same major version. For example, a favorite pinned at `1.0.3` will follow newer `1.x.x` releases, but not a future `2.x.x` release.

## Settings

Select the extension icon in the browser toolbar to:

- Remember or reset the resized column width after refreshing.
- Show search as a full box, a search button, or hide it.
- Show or hide pinned favorites without deleting them.
- Optionally show **Shared Environments** in Designer. Hover or focus a destination to see its newest shared version. Red means it differs from the published row within the same major version. This is off by default.
- Sharing information refreshes when you return from either share flow, including after cancelling. Use the refresh icon beside **Shared Environments** to recheck displayed pipelines anytime. Results otherwise stay cached to limit traffic.
- Search ignores case, spaces, and separators: `MMR`, `unco mmr`, and `uncommr` can all find `UNCO-MMR`.

## Install in Edge or Chrome

1. Extract the downloaded ZIP file.
2. Keep the extracted `ellucian-left-panel-scroll` folder somewhere it will not be deleted.
3. Open your browser's extension page:
   - Edge: `edge://extensions`
   - Chrome: `chrome://extensions`
4. Turn on **Developer mode**.
5. Select **Load unpacked**.
6. Choose the extracted `ellucian-left-panel-scroll` folder containing `manifest.json`.
7. Refresh the Ellucian page.

## Update the extension

After replacing the extension files with a newer version:

1. Open the browser's extension page.
2. Find **Ellucian Left Panel Scroll**.
3. Select its reload button.
4. Refresh the Ellucian page.

## Notes

- The extension does not modify Ellucian packages or pipelines.
- Settings and favorites are stored locally by the browser.
- To remove the extension, use **Remove** on the browser's extension page.

## Privacy and support

See [PRIVACY.md](PRIVACY.md) for information about local storage and optional Ellucian sharing lookups. Support: moore.life@gmail.com.

## Disclaimer

This extension is not affiliated with or supported by Ellucian.
