# Privacy Policy

Integration Navigator · Updated October 13, 2026

Publisher: Andrew Moore · Contact: moore.life@gmail.com

## What the extension does

This independent browser extension improves navigation in Ellucian Integration Packages and Integration Designer on the standard Ellucian Experience Test and Production websites and university vanity domains you explicitly add. It adds scrolling, resizing, search, favorites, and optional Shared To and Shared From columns. A separate **Show APIs & Sub-Pipelines** setting enables a Type column and read-only published records in Integration Packages, independently of Shared From.

For these read-only records, a page-start observer extracts only names, types, and latest published versions from the package metadata response requested by the page, before Ellucian filters its sidebar data. It does not make or change requests, access headers or credentials, or retain response bodies. A bounded in-memory startup buffer is discarded as soon as the saved display opt-out is read; when off, subsequent response collection and record display stop. These records are not saved to browser storage or included in Designer-source exports. Disabling **Show APIs & Sub-Pipelines** or reloading/closing the page discards this transient data. New installs default to off; an upgrade preserves the previous display choice once, then stores the independent boolean preference. Turning Shared From off clears only its source cache and does not disable these reference records.

## Information used

The extension reads package and pipeline names, versions, and relevant page structure from the Ellucian page you are using. Search terms are processed in your browser. It uses the current site, tenant, and page context to keep navigation and optional sharing lookups within your existing Ellucian session.

When you enable Shared To, the extension uses Ellucian's existing authenticated page helpers to request pipeline sharing metadata and destination environment details from Ellucian. Those requests include the identifiers and pipeline names or versions needed by Ellucian's services. Results are cached in memory to limit repeated requests and can be refreshed manually. This feature is off by default.

The extension does not read, copy, or store your password or bearer token. It does not request student records or pipeline execution data.

Shared From is a separate, optional feature that is off by default. It requires accepting a local-data notice before collection begins. On Designer pages you visit, it reads the already-loaded package and pipeline names and uses the existing authenticated page helper to resolve that current environment's label. Grouping pipelines by their package requires no additional service requests. It does not contact every environment from one page or fetch pipeline contents. Integration Packages matches names against these locally observed Designer sources. This is an ownership inference, not a live record of sharing activity, and may be stale or unavailable.

## Local storage

Your settings, custom Experience site domains, icon background and letter colors, icon letters, favorite icon shape, color and match-icon preference, column widths, favorite package and pipeline names, favorite version identifiers, ordering, and favorites layout preferences are saved in the browser's local extension storage. They are not synchronized by the extension to other devices or sent to the publisher. Pasted custom URLs are reduced to their HTTPS domain; paths, query strings, and fragments are not saved. Temporary search indexes and sharing results remain in page memory.

If you enable Shared From, an additional bounded local cache saves package and pipeline names grouped by environment, the identifiers and labels of their observed Designer environments, and last-checked timestamps. It does not keep a duplicate flat list of the same pipelines. Previously saved names without package relationships are preserved in an explicitly unknown-package group, retaining their original last-checked times until that Designer environment is refreshed. No pipeline contents, credentials, or execution data are stored in this cache. It is shared between this extension's supported environments on the same browser so Integration Packages can identify sources learned from other Designer environments. Revisit Designer in each source environment to refresh its snapshot. The **Refresh** button next to **Export JSON** under Shared From uses only the active tab's identifier to request collection from that currently open Designer environment; it does not scan other tabs or contact other environments. Automatic startup waits briefly for loaded page data with a bounded retry budget, not continuous polling. Turning Shared From off clears this cache without deleting favorites or other settings.

Favorites also save the HTTPS site origin, current tenant identifier, and Packages/Designer page type to separate tenants sharing one domain. Identity is read from already-loaded page state without an additional service call. Unknown identity or an incomplete storage read does not reuse another tenant's list. Verified tenant visits are remembered as scoped lists even without pins; this allows the extension to recognize multiple previously visited tenants on one domain. Older host/page-only lists carry over once to the actual loaded tenant when it is the only tenant known on that site. If multiple tenants are known, assignment requires your explicit choice in settings. The extension cannot know about an unvisited tenant; the first detected tenant is treated as the default, and later tenants do not inherit its old pins. Original copies and assignment markers remain local for recovery.

You may explicitly export a JSON backup from settings. The file contains the extension version and export time; favorite site origins, tenant identifiers, page types, package/pipeline names, version identifiers, ordering and layout choices; retained older unassigned favorite lists; and any saved Shared From environment identifiers, labels, grouped names, and last-checked timestamps. Preserved source names without a known package are marked **Package Not Yet Recorded**. This is a local download, not an upload to the publisher or another service, and follows your browser's download preferences.

Import reads only a file you select and previews its tenant lists before you confirm. Merge preserves existing pin order; replacement requires separate confirmation and affects only matching lists in the file. Backups retain any old-list assignment association; when an older backup has one matching current tenant list, that current list takes precedence over its old recovery copy rather than reviving removed pins. Shared From restoration is optional and requires the existing local-data opt-in; it preserves observation times and does not replace newer snapshots with older ones. Import never grants website permissions or changes settings. Exported files are separate snapshots, do not update automatically, and are not deleted when you disable Shared From or remove the extension. You control where you keep or share those files; they may contain institution-specific names and tenant identifiers. Review them before sharing.

## Website permissions

The two standard Experience sites remain enabled. For a custom site, the extension requests optional scripting access and permission for that exact HTTPS domain only after you choose to add or allow it. It also reads the extension's current site permissions to recover previously approved exact HTTPS custom domains into the removable list; this recovery grants no new access and ignores wildcard permissions and the two standard sites. Declaring optional HTTPS access lets users supply their own domains; it does not automatically grant access to every website or its subdomains. Only packaged extension scripts are registered, and the navigation controls remain limited to the supported Integration Packages/Designer routes. No browsing-history permission is requested.

## Sharing and tracking

The extension has no analytics, advertising, or publisher-operated data collection service. It does not sell information or send your browsing activity, search terms, or favorites to the publisher or advertising services.

Optional sharing lookups communicate with Ellucian using your existing session. Ellucian and your institution manage their own services and privacy practices; this policy covers the extension, not those services. Hosting providers and browser stores may process ordinary website visits or installation information under their own policies.

If you email support, the publisher receives the information you choose to include in that email. Please do not send passwords, tokens, student records, or other confidential information.

**Report Bug** opens a public GitHub issue form only when selected. The extension does not attach data or submit a report for you. Sharing-related failure warnings use fixed step/error codes in browser consoles; they do not include raw service exceptions, URLs, environment identifiers, package/pipeline names or contents, credentials, or student records. No persistent diagnostic log or automatic log upload is added. You control what you post, and should review all screenshots, console text, and exported files before sharing them; other page or browser logs are outside this extension's control.

## Your controls

You can disable search, hide favorites, and turn off Shared To or Shared From in the extension settings. Hiding favorites does not delete them; use their favorite icons to remove individual favorites. Turning Shared From off stops collection and clears its additional local cache. Removing a custom site revokes its optional domain access and stops future loading there; refresh any open page to clear previously injected controls. Site-specific favorites and widths are retained locally for reuse if you add the site again. Removing the extension removes its local extension storage through the browser. Closing or reloading the page clears its in-memory data, but not saved preferences or an enabled Shared From cache.

## Updates and contact

This policy will be updated if the extension's information handling changes. Questions can be sent to moore.life@gmail.com.

This extension is not affiliated with or supported by Ellucian.
