# v3 Development — Git Export

Checkpoint: **3.1.5 functional Git test candidate**, not a store release. The popup now launches the workspace for its connected source, with direct Git Connections/Export Configuration shortcuts and independent Backup & Restore. Designer launches both states; reviewed configuration narrows them. Source-bound tickets, first-save review, hidden Packages consent, native guards, credentials and separate Git upload confirmation remain intact. Earlier placement/ID-first/default-formatting notes below are historical; see [Git Export](Git-Export.md) for current behavior.

## Branch and Release Boundaries

Current 3.1.1 includes bounded Experience-store identity reads, native API Designer published definitions with explicit pagination, and Designer Draft/Published source separation. Existing six-slot scheduling and document-bound grants are reused. Navigation and Export are independent groups. One confirmed Shift+D reveals all accessible Packages without source-cache setup; native Experience metadata supplies its matching tenant name, with ID fallback. New Git destinations use tenant UUID first; READMEs reuse only already-observed sharing metadata. SQL/GURASPC, draft transformers, advanced JSON location settings, Forms/EIP/Schema exporters remain outside this implementation. Earlier design sections below are historical where they conflict with this source/routing update.

The owner requested a separate major version so v2 can be published independently. Branch `feature/v3-git-export` starts at v2.1.9 commit `56aed733e90d1fc4f53f48f96d0275b6247f6ca4`. Keep `develop` on v2, keep its release ZIP/unpacked folder unchanged, and track v3 in a separate draft PR targeting develop. Do not merge v3 into develop/main without explicit intended-release approval. A draft PR is a comparison, not permission to fold v3 into v2.

Bring confirmed v2 fixes forward deliberately after reviewing their diffs; do not overwrite v3 source or cherry-pick whole release artifacts. Keep the original v2 ancestor recorded so fixes and v3 changes remain distinguishable. Local v3 source and any eventual candidate outputs stay separate from the active v2 release paths.

## Interactive Proposal

Open [Git Export Settings](mockups/git-export-settings.html) directly in a browser. It shows the compact Export tab and a larger connection setup surface, plus a synthetic changes preview. Try GitHub/GitLab, the storage choices, simulated browser restart, and simulated upload confirmation.

All tokens, repositories, environments, files, and commits in the preview are synthetic. Token/password fields are read-only placeholders. No encryption, actual authentication, storage, clipboard access, network request, or repository write is implemented by the mockup. Reload clears its state. Do not paste real credentials into prototypes.

## Intended First Functional Scope

- Manual Push to Git from Integration Packages, supporting GitHub and GitLab through their official APIs. Start with existing repositories and an explicitly selected branch/folder; self-hosted provider origins require exact-origin approval and endpoint validation.
- Reuse the existing selected artifact set, per-major behavior, source-context/consent checks, six native-request slots, environment binding, size/file limits, and optional Source/Formatted generation. Separate file preparation from ZIP packaging only after regression coverage; no need to download/unzip first.
- Prepare changes locally, compare with a pinned remote snapshot, and explicitly confirm the destination and files before uploading. No silent repository creation, force-push, protected-branch bypass, arbitrary URL dispatch, or CI configuration edits.
- Add/update only at first. Unselected/unvisited/missing artifacts are not deletion instructions. Preserve unrelated paths, skip unchanged files, and reject ambiguous file/directory/symlink collisions.
- Detect changed remote state and require a refreshed comparison. GitHub and GitLab have different concurrency semantics; do not call a preflight read a server-enforced whole-branch lease. Do not silently replay our overwrites onto a newer commit.
- Validate and bound provider request sizes/rates separately from native source reads. Stage complete source collection before writes; distinguish an unchanged branch from uploaded-but-unreferenced Git objects. After an ambiguous timeout, verify the remote result before retrying or claiming no write occurred.
- Save only bounded non-secret push history: destination, commit link/ID, time, counts, and outcome. No tokens, headers, source payloads, or raw service errors in logs/history/backups. Clear local history separately from token revocation; neither erases remote Git history.
- Keep ZIP and JSON backups independent and usable without Git setup. No automatic/daily pushes, remote restore, or general-purpose two-way sync in the first implementation.

## Saved Credentials — Decision and Security Gates

The owner wants an API-key-style setup that can remember credentials without repeated provider sign-in. Use user-created, narrowly scoped expiring tokens; organization policy can require administrator approval or disallow them. Never read Ellucian tokens or attempt to reuse page authentication for Git.

The mockup offers three **proposed** storage choices:

1. **Encrypted on this device:** persist ciphertext and a browser-local non-extractable key, allowing automatic reuse after restart. This does not provide a password/OS-vault boundary against compromised extension code or an accessible browser profile.
2. **Encrypted with password unlock:** derive a key from a user password, persist ciphertext/salt/parameters, and unlock only for the session. Never persist the password alongside the ciphertext; forgetting it means reconnecting with a new token, not recovering it from the publisher.
3. **Session only:** remember no token across a browser restart. This describes storage lifetime, not a special type of provider token.

Final storage defaults, idle lock behavior, crypto parameters, key provisioning/race handling, revocation, corrupt-state recovery, and migration policy need design/security review before real credentials are accepted. Keep decrypted credentials in trusted extension contexts; no credential messages to content/MAIN scripts, widget state, source grants, or existing JSON backups. Never treat non-extractability as inability for authorized code to use the key.

New Git uploads are a distinct off-device data flow. Require explicit consent and matching privacy/store disclosures before enabling them. Confirm repository visibility and warn that source can contain embedded secrets and that commits may trigger CI/CD. Do not claim encryption of saved credentials encrypts repository contents or removes credentials already committed to Git.

## Third-Party Reference Review

Read-only source review of [GitSyncMarks](https://github.com/d0dg3r/GitSyncMarks/tree/246c61fda1ecd9672303ba03f93c038b22095e4b) identified useful GitHub/GitLab provider and token-storage modules. The reviewed commit's MIT license permits adaptation with its copyright/permission notice retained. **No code has been copied into this checkpoint.** Users do not need GitSyncMarks installed.

Candidates for selective adaptation: provider request/commit operations, bounded batch handling, and browser-local AES-GCM key storage. Do not import bookmark serialization, bidirectional synchronization/deletion, automatic conflict replay, legacy plaintext-token fallback, unrelated providers, or its broad permissions. Its provider modules depend on shared error/URL/i18n/batch helpers; review those dependencies, endpoints, redirect behavior, secret-safe errors, licensing, and tests rather than copying files blindly. If code is adopted, pin the upstream commit and include attribution/third-party notices in source and relevant deliverables.

## Completion Gates

The October 17 owner decision approves encrypted device reuse and password unlock, plus self-hosted GitLab. At 3.0.1, original project code implements provider operations; no third-party source was copied. Connection consent/privacy/submission drafts describe the data flow. Both APIs and the installed-extension workflow are exercised against synthetic services, not a claim of real provider acceptance. Remaining release gates are a separately approved live disposable-repository push, independent review/owner confirmation, live store-policy/asset checks, and explicit merge/publication authority.

Password unlock lasts one browser session or until manual Lock, with no idle timer. Session keys use trusted-context storage.session, not source grants. Device keys are non-extractable IndexedDB keys, not OS-vault protection. One connection is saved per browser profile. GitLab checks each changed file's last commit plus a final branch read; it does not claim an atomic whole-branch lease. See Git-Export.md and PRIVACY.md for precise behavior.

Future source ideas are deliberately not in this candidate: Forms, EIP, API Designer, Schema Designer, and API Registry/Catalog. Auto-sync may guide each separately after freshness confirmation/read-only review. Ethos application metadata/usernames is a much later security review; API keys must be excluded. Do not infer new API access or implement those sources from this roadmap alone.

- [x] Confirm layout and both encrypted credential choices with the owner.
- [x] Review third-party candidates; use original project code instead of copying modules.
- [x] Implement/test file preparation and both provider interfaces with synthetic services.
- [x] Test crypto/key/save races, corrupt ciphertext, lock/forget/restart, origin isolation, and no plaintext persistence.
- [x] Test conflicts/provider rejection, unrelated paths, limits, no-op exports, lost/server-error responses, and confirmation/cancel boundaries against synthetic services. Live acceptance is separate.
- [x] Update local privacy and submission drafts before enabling the candidate; live store settings remain unchanged.
- [ ] Obtain separate permission for a live push to a disposable test repository, then verify exact files and branch history.
- [ ] Package v3 only in its separate candidate location. Do not replace the v2 release output or submit/merge without explicit approval.

Historical v2 development notes remain in [V2-Development.md](V2-Development.md), not a statement that v3 is ready for publication. Canonical version history is [CHANGELOG.md](CHANGELOG.md).
