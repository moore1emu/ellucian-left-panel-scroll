# Troubleshooting

[Back to the README](../README.md) · [User Guide](User-Guide.md)

## Checking for Store Updates

Store-installed copies receive updates through the browser. An update must be published in the store before the browser can offer it.

To request a check, open `edge://extensions` or `chrome://extensions`, enable **Developer mode**, and select **Update**. This checks store-installed extensions; it does not turn your installation into a manually loaded copy. See [Microsoft's update instructions](https://learn.microsoft.com/en-us/microsoft-edge/extensions/update/auto-update) and [Chrome's update guidance](https://developer.chrome.com/docs/extensions/develop/concepts/extensions-update-lifecycle).

If an update is still pending, close the extension settings and restart the browser. Check the version at the bottom of Integration Navigator's settings, then refresh any Experience pages that were already open.

For an unpacked development copy, follow the separate [manual update instructions](User-Guide.md#manual-installation).

## Controls Are Missing

Confirm the extension is enabled and you are on Integration Packages or Integration Designer. If using a vanity URL, add it under **Custom Sites**, allow access, and refresh the page.

After updating or reloading the extension, refresh any Experience pages that were already open once. Their previous extension connection may no longer be available. Disconnected checks stop safely rather than clearing saved favorites or sources.

If a search box is missing, check its dropdown under **Page Behavior**. **Icon** opens it on demand; **Hidden** intentionally removes it. The sidebar and Designer pipeline searches have independent settings.

## APIs or Sub-Pipelines Are Missing

Enable **Page Behavior → Show APIs & Sub-Pipelines**, then refresh Integration Packages once. The extension reads the package response before Ellucian removes non-runnable entries from its sidebar data. The newest API/Sub-Pipeline records appear only in the main table, without links or run actions. Turning this display setting off removes Type and these extra rows. Shared From is independent; it is needed only for source labels. Native Integration links and favorites are unchanged.

## Shared From Is Blank or Shows a Dash

Enable **Shared From**, accept its local-data notice, and visit Designer in each source environment. Let Designer finish loading before returning to Integration Packages. Collection starts automatically; you do not need to select a package. Version 1.20.7 fixes a save rejection when entering Designer from Experience Home without refreshing.

Version 1.22.2 also fixes tenant detection on direct Designer loads where favorites/source collection previously appeared only after navigating through Experience Home. It reads the current Designer environment without changing saved favorites or needing extra service requests.

For a retry, stay in the source Designer environment and select **Page Behavior → Shared From → Refresh**. Hover over the setting or button for setup guidance. The button collects only that environment, not every environment at once. Export JSON is in Backup & Restore, the last settings section.

Settings shows that environment's last successful **Cached MM-DD-YY** date, **No Cache**, or **Caching…**. A failed retry does not replace a saved date. **Status Unavailable** is different from an empty cache: refresh the page after an extension reload and confirm Shared From is enabled.

The working circle remains visible until collection and saving finish. A failure message identifies loading/incomplete data, a lost page connection, site access, storage read/write problems, or a source-cache limit. Do not uninstall the extension or clear favorites to resolve a source-cache error. If the source cache is full, export it before turning Shared From off to clear that cache, then enable it and revisit the needed Designer environments.

A dash means the source is unknown or conflicting. A source may be the same environment you are currently using. **Export JSON** lets you inspect saved names and last-checked times. Revisiting Designer refreshes its snapshot; disabling Shared From clears that cache.

## Shared To Looks Outdated or Unavailable

Enable **Shared To** on Designer and use its column-header refresh icon. Hover over the icon to see the result. No shared pipelines and a failed lookup are different outcomes; a dash alone is not proof that a request failed.

Red destinations indicate a shared-version mismatch within the same major version. Hover or focus the destination to inspect its shared version. The extension cannot share or publish a pipeline for you.

Completed pipelines appear without waiting for a whole batch. A service timeout starts only when the call begins, not while waiting behind the six-request limit. If earlier calls remain stalled, wait or refresh the page before retrying; a retry will not start duplicate pending calls or exceed that limit.

## Favorites Seem Missing

Check that **Pinned Packages** is enabled. Favorites are separate by site, tenant ID, and Packages/Designer page, including tenants on a shared vanity URL. They are local to the browser; another browser or installation has its own saved data.

Version 1.22.1 restores host-only favorites automatically to the actual loaded tenant if it is the only tenant known on that domain. If multiple tenants are known, open settings on the intended tenant/page and use **Backup & Restore → Use Old Favorites for This Tenant**. Original copies are preserved, not deleted. A later tenant never inherits the first tenant's old pins. If the tenant is still loading or cannot be identified, favorites wait rather than guessing. Refresh after reloading the extension, let the page load, and reopen settings if needed. Do not uninstall or clear extension data to recover a list.

Use **Backup & Restore → Export JSON** for a local backup and **Import JSON** in the same section to preview and merge it later. Check the site, tenant ID, and page in the preview; lists from a different domain do not transfer automatically. Shared From restoration is optional and requires the feature's existing opt-in. Older source-only exports do not contain the backup format or favorites needed for import.

Unavailable packages or pipelines may be hidden without deleting their pins. Pipeline favorites follow their pinned major version, not a different major release. After an extension reload, refresh the Experience page before testing favorites again. Avoid uninstalling as a troubleshooting step because that removes local extension data.

## Checking Errors and Reporting a Bug

1. Open `chrome://extensions` or `edge://extensions` and find **Integration Navigator**. If necessary, enable **Developer mode** to reveal debugging controls.
2. Select **Errors** if the browser shows it. Not every warning appears there; no Errors button does not prove that every lookup succeeded.
3. On the affected Experience page, open **F12 → Console** and filter for **Integration Navigator**. Shared To and Shared From failures use short fixed codes, such as `request-timeout`, `requests-stalled`, or `storage-write`.
4. For background source-save failures, open the extension's **service worker** link under **Inspect views** to see its console. Opening settings can expose its console through **Inspect popup** or right-click → **Inspect**, where supported.
5. Use **Report Bug** beside the version in settings, or open the [GitHub report form](https://github.com/moore1emu/ellucian-left-panel-scroll/issues/new?template=bug_report.md). Include the version, browser, steps, and short message/code you observed.

Reports are public. Review console text and screenshots before posting; other page logs can contain confidential information even though the extension's new failure-code warnings omit source names, URLs, credentials, and pipeline contents. Do not attach an unreviewed Shared From JSON export. Nothing is uploaded automatically, there is no diagnostic button, and the extension does not keep a persistent log file.

## Getting Help

Email [moore.life@gmail.com](mailto:moore.life@gmail.com) with the extension version, browser, affected page, and steps to reproduce the issue. A screenshot is helpful if you remove confidential names and information first. Do not include credentials, tokens, student records, or confidential pipeline contents.
