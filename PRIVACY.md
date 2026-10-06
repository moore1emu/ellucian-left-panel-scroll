# Privacy Policy

Integration Navigator · Updated October 6, 2026

Publisher: Andrew Moore · Contact: moore.life@gmail.com

## What the extension does

This independent browser extension improves navigation in Ellucian Integration Packages and Integration Designer on the standard Ellucian Experience Test and Production websites and university vanity domains you explicitly add. It adds scrolling, resizing, search, favorites, and optional Shared Environments and Shared From columns.

## Information used

The extension reads package and pipeline names, versions, and relevant page structure from the Ellucian page you are using. Search terms are processed in your browser. It uses the current site, tenant, and page context to keep navigation and optional sharing lookups within your existing Ellucian session.

When you enable Shared Environments, the extension uses Ellucian's existing authenticated page helpers to request pipeline sharing metadata and destination environment details from Ellucian. Those requests include the identifiers and pipeline names or versions needed by Ellucian's services. Results are cached in memory to limit repeated requests and can be refreshed manually. This feature is off by default.

The extension does not read, copy, or store your password or bearer token. It does not request student records or pipeline execution data.

Shared From is a separate, optional feature that is off by default. It requires accepting a local-data notice before collection begins. On Designer pages you visit, it reads the already-loaded pipeline names and uses the existing authenticated page helper to resolve that current environment's label. It does not contact every environment from one page or fetch pipeline contents. Integration Packages matches names against these locally observed Designer sources. This is an ownership inference, not a live record of sharing activity, and may be stale or unavailable.

## Local storage

Your settings, custom Experience site domains, icon background and letter colors, icon letters, favorite-star color and match-icon preference, column widths, favorite package and pipeline names, favorite version identifiers, ordering, and favorites layout preferences are saved in the browser's local extension storage. They are not synchronized by the extension to other devices or sent to the publisher. Pasted custom URLs are reduced to their HTTPS domain; paths, query strings, and fragments are not saved. Temporary search indexes and sharing results remain in page memory.

If you enable Shared From, an additional bounded local cache saves pipeline names, the identifiers and labels of their observed Designer environments, and last-checked timestamps. No pipeline contents, credentials, or execution data are stored in this cache. It is shared between this extension's supported environments on the same browser so Integration Packages can identify sources learned from other Designer environments. Revisit Designer in each source environment to refresh its snapshot. Turning Shared From off clears this cache without deleting favorites or other settings.

## Website permissions

The two standard Experience sites remain enabled. For a custom site, the extension requests optional scripting access and permission for that exact HTTPS domain only after you choose to add or allow it. It also reads the extension's current site permissions to recover previously approved exact HTTPS custom domains into the removable list; this recovery grants no new access and ignores wildcard permissions and the two standard sites. Declaring optional HTTPS access lets users supply their own domains; it does not automatically grant access to every website or its subdomains. Only packaged extension scripts are registered, and the navigation controls remain limited to the supported Integration Packages/Designer routes. No browsing-history permission is requested.

## Sharing and tracking

The extension has no analytics, advertising, or publisher-operated data collection service. It does not sell information or send your browsing activity, search terms, or favorites to the publisher or advertising services.

Optional sharing lookups communicate with Ellucian using your existing session. Ellucian and your institution manage their own services and privacy practices; this policy covers the extension, not those services. Hosting providers and browser stores may process ordinary website visits or installation information under their own policies.

If you email support, the publisher receives the information you choose to include in that email. Please do not send passwords, tokens, student records, or other confidential information.

## Your controls

You can disable search, hide favorites, and turn off Shared Environments or Shared From in the extension settings. Hiding favorites does not delete them; use their stars to remove individual favorites. Turning Shared From off stops collection and clears its additional local cache. Removing a custom site revokes its optional domain access and stops future loading there; refresh any open page to clear previously injected controls. Site-specific favorites and widths are retained locally for reuse if you add the site again. Removing the extension removes its local extension storage through the browser. Closing or reloading the page clears its in-memory data, but not saved preferences or an enabled Shared From cache.

## Updates and contact

This policy will be updated if the extension's information handling changes. Questions can be sent to moore.life@gmail.com.

This extension is not affiliated with or supported by Ellucian.
