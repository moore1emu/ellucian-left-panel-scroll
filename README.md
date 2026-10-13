# Integration Navigator

Make Ellucian Integration Packages and Integration Designer easier to navigate in Chrome and Microsoft Edge.

## What It Does

- Scroll and resize the package sidebar independently of the main page.
- Search package and pipeline names, even with different spacing or separators.
- Pin packages and published pipelines, then drag favorites into your preferred order.
- Automatically fit pipeline-name columns, with manual resizing when needed.
- Optionally show the latest published APIs and Sub-Pipelines as read-only main-table records with a **Type** column, independently of Shared From.
- Optionally show **Shared To** in Designer, highlighting version mismatches in red.
- Optionally show **Shared From** in Integration Packages using locally saved Designer sources.
- Customize your toolbar icon, favorite shapes and colors, and search display.

Favorites stay separate by site, tenant ID, and Packages/Designer page, including multiple tenants behind one vanity domain. Export JSON backs up favorites and saved sources; Backup & Restore lets you preview and import them. Standard Experience Test and Production sites are supported, along with university vanity URLs you add in settings.

Existing favorites carry over automatically when only one tenant is known on that domain. If multiple tenants are known, settings lets you choose which one owns the old list.

## Install

[Install from the Chrome Web Store](https://chromewebstore.google.com/detail/integration-navigator/dbmjmmgocklhjnadhmibaldicbgoignd). The same listing works in Chrome and Edge; Edge may ask you to allow extensions from other stores.

You need an institution-provided Ellucian account with access to the supported pages. The extension does not provide access or change packages or pipelines.

Open the extension's toolbar icon to adjust its settings. Store-installed copies receive updates through the browser; [manual installation and update instructions](docs/User-Guide.md#manual-installation) are in the user guide.

## Screenshots

**Pinned Packages:** keep favorite packages and pipelines within reach.

![Pinned packages, pipeline favorites, search, and independent sidebar scrolling](docs/screenshots/pinned-packages.jpg)

**Integration Designer:** search pipelines in the selected package and see shared destinations.

![Integration Designer showing sidebar favorites, pipeline search, and Shared To](docs/screenshots/integration-designer.jpg)

**Shared From:** see locally remembered Designer sources in Integration Packages.

![Integration Packages showing the optional Shared From column](docs/screenshots/shared-from.jpg)

**Settings:** choose page behavior, search display, icon and favorite colors, and custom sites.

![Integration Navigator settings showing Page Behavior and the collapsible settings sections](docs/screenshots/settings.jpg)

Package and pipeline names in these screenshots are anonymized.

## Help and Documentation

- [User Guide](docs/User-Guide.md): settings, favorites, sharing columns, and installation.
- [Troubleshooting](docs/Troubleshooting.md): updates, page loading, and missing sharing information.
- [Changelog](docs/CHANGELOG.md): version history.
- [Privacy Policy](PRIVACY.md): website access and locally saved data.

Both sharing features are off by default. Shared From requires your consent and visits to Designer in each source environment; its saved information can become stale.

Support: [moore.life@gmail.com](mailto:moore.life@gmail.com).

This extension is not affiliated with or supported by Ellucian.

## Development Checks

Read [AGENTS.md](AGENTS.md) before making changes. The synthetic settings regression needs Node.js and Playwright with Chromium; it does not use your installed extension or Ellucian account.

```sh
npm install --no-save --package-lock=false playwright
npx playwright install chromium
node tests/popup-switches.regression.js
node tests/tenant-favorites.cjs
node tests/tenant-context.cjs
node tests/tenant-favorites-browser.cjs
```

Check changed JavaScript with `node --check <filename>.js`. No build step is required to load the extension unpacked; exclude test tools and dependencies from release ZIPs.
