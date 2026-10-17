# Chrome Web Store Preparation — Integration Navigator

Updated: 2026-10-16 · Candidate: 3.0.0 · Status: v3 foundation only, not submitted

This v3 branch is not ready for store preparation. The public listing below retains v2's existing functionality and does not advertise planned Git uploads. Do not use it to submit v3 until credential handling, upload consent, privacy, assets, and actual functionality are implemented and verified.

This is the maintained preparation document, not proof of the live dashboard state. Copy only the Public Store Listing section into the public description fields. Reviewer Instructions are separate and must not be appended to that description. Publishing, changing distribution, and merging main each require owner authorization. Preserve existing account, pricing, visibility, and unrelated dashboard fields.

## Public Store Listing

### Name

Integration Navigator

### Short Description

Adds independent scrolling, adjustable panels, search, and pinned package and pipeline favorites to Ellucian Integration pages.

### Detailed Description

Integration Navigator improves navigation and published-content review in Ellucian Integration Packages and Integration Designer.

Find packages and pipelines with configurable search controls. Resize the package sidebar, scroll it independently, and pin frequently used packages and pipelines. Choose a Star, Circle, or Bear favorite icon and customize its color or match it to your toolbar icon.

The redesigned settings use Navigation, Sharing, Appearance, Sites, and Export tabs, with page-specific actions available where they work.

Shared To shows sharing destinations in Integration Designer and highlights published/shared version differences. Optional Shared From identifies likely sources in Integration Packages using information saved when you visit Designer in each source environment. Shared From requires a local-data opt-in; its saved observations may be incomplete or stale. Refresh sources from Designer when needed.

Export eligible published Pipelines, Sub-Pipelines, APIs, and Transformers from Integration Packages into a ZIP organized by package. Select whole packages or individual artifacts. Pipelines and Sub-Pipelines include the latest published release within each available major; APIs and Transformers use their latest overall published release. Exports use your saved Designer source observations and existing access. Optional readable formatting adds Source and Formatted folders with a package README; Formatted copies are for review, not import or execution.

Show reference-only APIs and Sub-Pipelines in Integration Packages. In Designer, optionally view published fitting details at normal contrast for scrolling, selection, and copying while editing and action controls remain locked. Neither feature runs or changes your published content.

Back up and restore saved favorites and optional Shared From observations using local JSON files. Favorites are separated by site, tenant, and page. Add your institution's exact HTTPS vanity domain only when you choose to grant access.

Sharing features are off by default. Settings and favorites stay in your browser. Optional sharing/export operations use your existing Ellucian session; the extension does not inspect or store your password or bearer token, upload exported files, or send analytics to the publisher. Exported source files can contain confidential embedded values; review and protect them before sharing.

Install, open a supported Integration page, and use the toolbar button to configure settings. To prepare Shared From and the default export, enable Shared From, visit Designer in each source environment, then open Integration Packages and select Export.

Support: moore.life@gmail.com

This independent extension is not affiliated with or supported by Ellucian.

### Other Listing Fields

- Primary language: English; verify the existing dashboard value rather than changing it automatically.
- Single purpose: improve navigation, review, and local backup of published content in Ellucian Integration Packages and Designer.
- Category: retain the existing selection; confirm it in the dashboard before submission.
- Visibility: retain the existing unlisted distribution; do not change regions, price, or account settings.
- Homepage: https://github.com/moore1emu/ellucian-left-panel-scroll
- Support: https://github.com/moore1emu/ellucian-left-panel-scroll/issues

## Assets

- Manifest icons exist at their declared sizes; automated metadata checks verify their PNG headers.
- Before v2 submission, refresh the settings screenshot for the task-tab layout and add a real export-preview screenshot using anonymized or synthetic content. Do not claim existing v1 screenshots represent the v2 layout.
- Confirm store screenshots are 1280×800 or 640×400. Preserve approved promotional artwork unless separately asked to change it.
- Inspect the current dashboard assets before any upload. Existing asset/review history is retained in the project's publishing records; do not replace those historical records.

## Permissions and Site Access

| Manifest capability | Why it is needed |
| --- | --- |
| storage | Save local settings, tenant/page-specific favorites, optional Designer source observations, and small update markers; keep temporary export document grants in browser-memory session storage. |
| Optional scripting | Register only the bundled content scripts on an institution's exact custom domain after the user adds it and grants access. |
| Optional https://*/* host pattern | Allow the user to supply their own institution's unknown-in-advance vanity domain. The declaration is not blanket granted access: the UI validates and requests only one exact HTTPS origin, excluding subdomains, wildcards, credentials, ports, local names, and IP addresses. |
| Static content scripts on https://experience-test.elluciancloud.com/* and https://experience.elluciancloud.com/* | Provide the navigation, search, favorites, and optional review/export helpers on the two standard Experience sites. Behavior is limited to supported Integration routes. |

No tabs, history, downloads, clipboard, identity, unlimitedStorage, or externally-connectable permission is requested. Reading the active tab identifier does not read unrelated tab URLs. Native service helpers own authentication. Exported JavaScript is saved as text, never executed by the extension.

## Privacy and Dashboard Disclosures

Canonical policy: [PRIVACY.md](PRIVACY.md). Intended existing store policy URL: https://github.com/moore1emu/ellucian-left-panel-scroll/blob/main/PRIVACY.md — confirm the actual dashboard URL and live contents before submission. The main branch currently has the older release; the v2 policy must be made live through an authorized release process before claiming this URL explains v2.

| Information involved | Processing and destination |
| --- | --- |
| Settings, favorites, site origins, tenant identifiers, package/pipeline names, source observations and timestamps | Stored locally for the requested navigation/sharing features. JSON backup is an explicit user download. No publisher-operated collection or sync service. |
| Active Integration page context and selected published metadata/source | Used only for the current feature. Optional sharing/export requests go to existing Ellucian services through the page session; identifiers needed by those services are included. Do not describe this as zero network activity. |
| Pipeline JSON and Transformer JavaScript | Retrieved only after explicit download, held temporarily, and assembled into a local ZIP. May contain confidential embedded values. Not uploaded to the publisher or executed. |
| Authentication | Existing page helpers authenticate their own requests; the extension does not inspect, copy, log, or store passwords, tokens, or authentication headers. |
| Temporary export grants | Bounded document/routing metadata and consent in memory-only storage.session; no source payloads, credentials, or favorites. |

No analytics, advertising, sale of data, unrelated use, or credit/lending use. No student records or execution data are requested. Review the current dashboard's data-use questions against this processing description; local use of website content must not be confused with an assertion that the extension never accesses content. Do not automatically submit certifications or infer unchecked data categories from the absence of publisher uploads.

## Reviewer Instructions

These notes are for the reviewer/testing field and GitHub documentation, not the public store description. Do not provide real credentials, tokens, institution exports, or student data in this file. If the reviewer needs an account or institution-specific access, coordinate an approved test arrangement with the owner; do not invent one.

1. Open a permitted Ellucian Experience Integration Packages or Designer page. Check navigation, resizing, search, and favorites independently of the optional sharing features.
2. In Sharing, enable Shared From and accept the local-data notice. Visit Designer in the intended source environment, wait for the cache status, or select Refresh. Refresh is unavailable outside Designer.
3. Open Integration Packages and select Export → Preview Pipeline Export. Default eligibility uses exact Designer-recorded package/artifact relationships, not a live ownership certification. Review selections, then choose Download ZIP. Refresh/replacement of the original source document requires reopening export.
4. Formatted is off by default. When selected, inspect Source/Formatted folders and the selected-artifact package README. Sub-Pipeline source may report null/omitted version because the native route resolves by major. Transformer displayed versions are package metadata, not independent verification of the latest endpoint's source version.
5. To test the temporary advanced filter option, keep settings open, stop typing, and press Shift+D. Reveal does not enable it: explicitly confirm Include All Accessible Content before opening export. It bypasses only the saved Designer-source filter and does not grant website, service, or account permissions. It can include vendor-provided content accessible to that session; use it only when authorized. It is not a persistent preference and resets when settings closes/launches; the launched workflow retains temporary consent until cancelled or closed. Disclose this behavior to reviewers; never use it to conceal functionality or bypass review.
6. Optional published fitting viewing is read-only; verify copying/scrolling while actions and edits remain blocked, including when a draft exists. Unknown editor/state fails closed.

Known limitations: source observations can become stale; unvisited environments are unknown; same-list simultaneous favorite edits in different tabs retain whole-list conflict limitations. Failed/cancelled exports do not download partial ZIPs. Already completed browser downloads remain under the user's control.

## Compatibility and Security Review

- API-derived minimum Chrome version: 106, because export binds messages to runtime sender/document IDs and targets the same document. storage.session and dynamic MAIN registrations are older APIs. JavaScript structuredClone, Object.hasOwn, Array.at and the nonessential CSS :has state styling do not raise that floor.
- Tests use the installed current Chromium-based browser, not historical Chrome 106. This is an API compatibility floor, not a claim of running the suite on Chrome 106 or every Edge version. Users should run a supported, current browser.
- Explicit extension-page CSP: script-src 'self'; object-src 'none'; base-uri 'none';. No inline scripts, remote executable code, or eval permission is enabled. This tightens embedded-object/base-URL handling without broadly restricting existing styles, images, native page services, or blob downloads.
- No additional permissions, session-token readers, service endpoints, analytics, remote debugging setup, or browser tooling are added by this preparation pass.

## Release Readiness

- [ ] Owner confirms the intended v2 release and separately authorizes main merge and store submission.
- [ ] Inspect live package/review state and prevent duplicate upload/submission; do not cancel another review without approval.
- [ ] Verify latest ZIP root manifest/version/hash and every entry against the tested unpacked build.
- [ ] Keep CHROMEWEBSTORE.md, tests, agent guidance, dependencies, and scratch files out of the ZIP. Retain the project's established packaged README/changelog/privacy copies; the generic checklist does not override that owner-approved layout.
- [ ] Refresh v2 screenshots and review anonymization, dimensions, and label accuracy.
- [ ] Confirm live privacy policy and dashboard disclosures match v2 before submission.
- [ ] Copy only Public Store Listing text; put Reviewer Instructions in the separate reviewer/testing field when available.
- [ ] Preserve unlisted distribution, existing artwork unless updated with approval, account settings, price, and unrelated fields.
- [ ] Record the dashboard-confirmed submitted version, review/publication state, and publication choice; do not call a pending review live.

Canonical code history is [docs/CHANGELOG.md](docs/CHANGELOG.md). This preparation document intentionally does not reconstruct unverified submission history. Candidate 3.0.0 is a separate foundation checkpoint and has not been submitted by this work.

## Official References

- https://developer.chrome.com/docs/extensions/ai/build-with-ai
- https://github.com/GoogleChrome/modern-web-guidance/tree/main/skills/chrome-extensions
- https://developer.chrome.com/docs/extensions/develop/security-privacy/stay-secure
- https://developer.chrome.com/docs/extensions/reference/manifest/content-security-policy
- https://developer.chrome.com/docs/extensions/reference/api/runtime#type-MessageSender
- https://developer.chrome.com/docs/extensions/reference/api/tabs#method-sendMessage

Guidance was consulted as a reference, not installed as a new dependency or substituted for project approval rules. Do not blindly apply generic recommendations to remove packaged user docs, rewrite asynchronous code, widen permissions, persist source payloads, or attach debugging to a user's normal browser profile.
