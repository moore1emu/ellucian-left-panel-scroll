# Integration Navigator — Agent Guidance

## Scope and Approval

- Make surgical changes within the owner's request. Preserve deliberate behavior and useful comments; ask before broader refactoring, architecture changes, or consequential behavior changes.
- Use `develop` for test builds. Owner-authorized review branches may feed into develop. Keep main unchanged until the owner confirms the intended release works and explicitly authorizes merging. Testing, store submission, store approval, and GitHub merging are separate steps.
- Use draft pull requests to track unconfirmed development. Preserve individual version commits when an approved merge is performed. Do not enable auto-merge or publish/upload a store update without authorization.

## Comments and Execution Worlds

- Put concise, normally one-line comments immediately before meaningful steps and decisions, explaining why. Comment setup, API calls, loops, conditions, transformations, non-obvious assignments, and file writes; do not substitute large headers for inline explanations.
- Preserve `// Keep: <reason> (<version>)` tags and their deliberate behavior. Consult comments, changelog, and tests before changing them; ask before removing behavior beyond an approved request. Use historical version tags only when supported by recorded evidence.
- `shared.js` supplies rules and resize behavior to content.js and search.js in the extension's isolated world. Load it before those scripts; custom-site registrations must mirror the manifest's script order, worlds, and timing.
- page-index.js runs in the page's MAIN world and deliberately duplicates a few equivalent rules/constants. Keep corresponding copies synchronized while preserving intentional scope differences. Do not expose the isolated helper globally in the page world just to remove this duplication.

## Configuration, Privacy, and Files

- Never inspect the contents of any `.env` file. Use synthetic fixtures and disposable browser profiles; software may load configured credentials at runtime. Do not copy credentials, institution identifiers, personal paths, or conversation handoffs into shared artifacts.
- Preserve opt-in consent, exact-domain permissions, site/tenant/page-scoped favorites, major-version pinning, bounded local caches, and the six-request sharing limit unless the owner explicitly approves a change. Tenant identity comes from existing loaded state, never a guessed host or extra lookup. The owner approved automatically carrying older lists to the sole known tenant on that domain; multiple known tenants require explicit assignment. Remember verified visits without pins. Retire assigned recovery copies only after durable read-back confirms all their pin identities exist in the correct tenant list; retain unresolved/unmatched copies and compact assignment associations in backups. Cleanup failures must not hide saved favorites. Never let later tenants inherit old lists or revive removed pins after a backup restore. Imports must be validated, previewed, and consent-safe; never clear unrelated tenants or enable sharing/site access during restoration.
- Keep extension behavior read-only with respect to real packages/pipelines. Do not run, edit, publish, or share real pipelines while testing. Do not add analytics, automatic diagnostic uploads, token reads, or broader permissions without approval.
- Published fitting viewing is opt-in: require the native published marker, set existing Ace editors explicitly read-only, lock non-text/native/custom actions, and block mutations before enabling focus/copy. Unknown editors fail closed. Restore owned UI properties on opt-out/navigation without changing fitting contents or drafts. Do not remove these individual locks as a CSS-only cleanup.
- Resolve paths relative to the relevant file/repository, or use configurable external locations. New or edited maintained text files use CRLF. Preserve downloaded material and historical snapshots byte-for-byte.

## Versions, Packaging, and Documentation

- Each delivered code revision needs its own manifest version and a newest-first entry in docs/CHANGELOG.md. Internal commits and documentation-only changes do not require separate version bumps. Keep patch numbers 0–9; the next version after 1.22.6 is 1.22.7. Do not rename historical releases.
- Preserve the root-level extension layout and the existing release filename `ellucian-left-panel-scroll.zip`. Keep only the latest ZIP/unpacked release in the configured outputs folder; retain any needed prior build in a separate recovery folder.
- Put manifest.json at the ZIP root, with runtime assets and icons beside it. Include README.md, CHANGELOG.md, and PRIVACY.md inside the ZIP and identical copies beside it. Do not package tests, agent instructions, development dependencies, scratch files, or personal workflow notes.
- GitHub keeps a concise root README, detailed guides/screenshots and changelog under docs/, and the full root PRIVACY.md at its existing store-linked URL. Do not replace that policy with a pointer or overwrite the short repository README with the longer packaged guide.

## Verification and Completion

- Check syntax for changed JavaScript and run the applicable maintained synthetic regressions. The repository includes the popup switch-save regression; additional local regressions may be supplied by the owner. Put installation/run commands in README, and clearly report any unavailable tests rather than treating syntax alone as sufficient.
- For shared-helper/message changes, verify script order, direct/SPA entry, sharing opt-out/timeouts, and favorites/resize behavior. For storage changes, test failed reads/writes, pending-save interactions, navigation, and extension-context invalidation. Use no live institution services in automated fixtures.
- Verify manifest version, ZIP root structure, every ZIP entry against unpacked bytes, and matching outside documentation. Verify uploaded runtime file identities against the delivered release and repository documentation against its maintained source.
- Report the tested version, checks performed and limitations, artifact location, and GitHub branch/PR state. Leave main and store publication unchanged while awaiting manual testing/approval.
