# Git Export — V3 Test Candidate

Version 3.1.3 is the manual GitHub/GitLab export test candidate. It is separate from v2 and is not published to the store. Automated tests use synthetic services; a live push requires the owner's separate approval.

## Repository Locations

The export page shows selected files as an indented destination tree using metadata only. New Git destinations default to `<Tenant Name>/IntegrationDesigner`, `<Tenant Name>/IntegrationPackages`, or `<Tenant Name>/APIDesigner`. Designer/API state folders and optional Source/Formatted output remain beneath those roots. ZIP layout is unchanged by Git folder preferences.

Ordinary generated defaults and visible saved configuration omit IntegrationPackages. Shift+D must be confirmed before showing that hidden source/configuration entry, with a prompt explaining the addition. This temporary reveal is not saved as access permission. Existing Packages overrides remain stored but hidden; ordinary saves/reset preserve them. Revealing the Connections entry alone does not authorize a Packages export or grant service access. A separately confirmed Packages export can show its entry when opening Connections from that export.

On **Connections**, open **Advanced · Export Locations** to edit and save JSON. Export's **Edit Locations** opens Connections with Advanced expanded and suggests the original export's current environment without reading source contents. Keys show `Name: Tenant ID`; only the trailing ID selects the environment. For example:

```json
{
  "tenants": {
    "ExampleTest: 11111111-2222-4333-8444-555555555555": {
      "IntegrationDesigner": "Test/IntegrationDesigner",
      "APIDesigner": "Test/APIDesigner"
    }
  }
}
```

Missing tenant/source overrides use the verified preview name, with tenant-ID fallback when no name is available. Paths must be safe relative folders; duplicate IDs, traversal and Git-internal directories are rejected. Names with unsupported path characters need a literal safe alias. Different tenants may intentionally target the same folder: matching files can be overwritten after explicit preview/push confirmation. Existing folders/files are never moved or deleted. **Use Defaults for This Tenant** removes only the visible current tenant overrides, preserving hidden Packages paths until separately revealed.

Location saves need no new provider token because they are separate local preferences, not credential/connection edits. Every connection edit still requires a fresh token. Concurrent stale location edits are rejected; saving locations updates open export trees and invalidates prepared comparisons without resetting selections. Review the final folder and every changed path before uploading. The legacy base-folder control is removed; older stored configuration remains intact for compatibility.

Published Data Connect versions come from the selected package metadata. Pipeline/API downloads request the exact full version; Sub-Pipelines request its major. Downloaded JSON may omit or null its version, which is preserved unchanged; an explicit conflicting version is rejected. Package-reported versions are not independently certified from missing source fields. Git Connection's Return to Export button focuses an existing export without reloading its selection; if no export is open, start one from the source page's settings.

## Set Up a Connection

1. In settings, open **Export → Manage Connection**. This opens a full extension-owned browser tab, not a provider login popup.
2. Choose GitHub or GitLab. For self-hosted GitLab enter its HTTPS server origin. DNS domains are supported; custom ports and installations under a URL subpath are not supported in this candidate.
3. Enter an existing repository (`owner/repository` or `group/subgroup/project`) and existing branch in the grouped connection row. Configure tenant locations under Advanced on this Connections page. Empty repositories/branches cannot be created here.
4. Create an expiring, least-privilege provider token. GitHub fine-grained tokens need Contents read/write for the selected repository. GitLab's multi-file REST API needs API access and a role allowed to commit; a repository-only token scope is not enough. Organization approval and protected-branch rules still apply. Never reuse an Ellucian session token.
5. Select encrypted device storage, encrypted password unlock, or session only. Accept the separate upload notice and **Save Connection**. A changed destination requires a freshly entered token; saved tokens never appear back in the form.
6. Select **Allow Server Access**, then **Test Connection**. Testing reads only repository metadata; it does not prove write access to a protected branch or upload a test file.

Git API origins are reserved separately from Custom Sites before permission is requested. Granting Git access does not inject Experience scripts into the server. At most 20 origins can be reserved. Forgetting a connection leaves these safety reservations and browser permissions intact; revoke permission in browser extension details if needed. There is one saved connection per browser profile in this first candidate.

Routing selects overrides by verified tenant UUID, never by the readable key prefix or a URL guess. Defaults use the ready source snapshot's tenant name. Review the final folder in Git preview before confirming. Existing saved connection values are preserved. No old repository folder is moved or deleted; cleanup is manual. Recent Pushes records the actual resolved folder.

Every save requires re-entering the access token, including changes to the base folder. An empty token shows this requirement rather than silently reusing the stored secret. Viewing a private commit on GitHub/GitLab requires signing in to that provider in the same browser; the extension token authenticates API requests, not website browsing.

GitHub Token Settings and GitLab Token Instructions expand optional setup checklists; both start collapsed. GitHub uses a selected-repository fine-grained token with Contents read/write. The GitLab example uses a project token with api scope and Developer access to an unprotected export branch; creating it requires Maintainer/Owner, and GitLab.com project tokens require Premium/Ultimate. Your organization's restrictions still apply. Token values belong only in the extension field, never support messages.

## Current Source Workflow (3.1.3)

Enable Export Tools in General first. Navigation Tools may stay off; export uses native lists/identity without adding favorites, search or sharing columns. Disabling Export keeps encrypted connections but blocks new source/provider requests and clears transient previews. It cannot recall requests already sent. Backup/restore stays usable with either group off.

Open Settings → Export on the source page. Integration Designer offers Drafts, Published, or Both; API Designer exports published definition JSON for each resource major. Designer draft transformers and optional API SQL/GURASPC files are not included yet. Missing/changing tenant identity or source access stops the export.

One Shift+D outside inputs confirms and reveals Integration Packages for all accessible published content. Packages, Designer and API Designer exports do not require Shared From setup. This does not bypass service permissions.

Git routing uses the tenant-name defaults or the matching tenant ID's Advanced overrides described above. Draft and Published files are separated beneath new-source destinations. Existing repository folders are not moved or deleted.

New-source READMEs include source state and any Shared To observations already available from this page session. A timestamp marks cached destinations; absent observations stay unknown. No extra sharing or person-record lookups are made for export.

## Credential Protection

| Mode | After Browser/Extension Restart | Important Boundary |
|---|---|---|
| Encrypted on This Device | Automatically reusable | Non-extractable browser-local key; not an OS vault or protection against a compromised profile/extension. |
| Encrypted with Password Unlock | Locked until you enter the password | Password never saved; unlock lasts this browser session or until Lock. No idle lock. Lost passwords require reconnecting. |
| This Browser Session Only | Token must be entered again | Its key clears with memory; an unusable encrypted record may remain until replacement/Forget. |

Tokens use AES-256-GCM with fresh IVs. Password keys use PBKDF2-SHA-256 with a fresh salt and 600,000 iterations. No plaintext fallback, credential sync, credential JSON backup, or publisher recovery exists. Forget is local; revoke the token at its provider when it must stop working elsewhere. Lock/Forget cannot recall a request already sent. See the [Privacy Policy](../PRIVACY.md).

## Preview and Push

New commit messages summarize only added/updated file counts, excluding unchanged files. Package/file/path lists are omitted; use Git history/diffs for details. Source/Formatted copies and package READMEs are separate files in these counts. A random Export-ID footer (not a tenant identifier) supports uncertain-write verification. Existing commit history is unchanged.

1. Open **Integration Designer** or **API Designer**, then **Export → Preview Export**. Choose the source and, for Designer, Drafts, Published, or Both. Integration Packages is a hidden secondary source as described above.
2. Select the packages/artifacts and optional Formatted layout just as for ZIP export.
3. Choose **Preview Git Changes**. This retrieves selected native sources into local memory and compares Git metadata. No source payload is uploaded yet.
4. Review server, repository, branch, folder, visibility, compared commit, and every added/updated path. Unchanged files are skipped; nothing is deleted. Review sources for embedded secrets and consider provider visibility and CI/CD before confirming.
5. Check the confirmation and select **Push to Git**. Keep the tab open until completion. A successful push provides a constructed commit link; optional local history retains at most 20 successful receipts without source contents or tokens.

Selection/format changes discard the comparison. Source/tenant/consent, connection revision, unlock state, permission, and remote branch are rechecked before requests. Comparisons expire after ten minutes. No automatic replay, force-push, repository creation, deletion, remote restore, or scheduled daily sync is included. ZIP download and JSON backup still work without any Git connection.

## Limits and Failure Handling

- Git has no separate file-count or upload-size cap. Provider-specific limits still apply. Formatted exports generate multiple files per artifact. The extension does not automatically batch requests or split commits; reduce a selection manually if the provider rejects it. Native source/ZIP collection retains its separate 64 MB/10,000-file limits and six request slots. Provider responses retain a 16 MB memory bound and requests a 30-second timeout.
- Tree reads are pinned to a commit, paginated on GitLab, and limited to 50,000 entries. Truncated GitHub trees stop safely. Unexpected folders, links, submodules, executable-file replacements, and ambiguous path collisions are rejected.
- GitHub builds a commit parented to the compared head and uses a non-forced branch update. Uploaded Git objects may remain if later work fails. A preflight read is not a general server-side compare-and-swap lease.
- GitLab submits one multi-action commit, using `last_commit_id` for existing files plus a final head check. This is not an atomic whole-branch lease: concurrent unrelated commits may become the parent, while changed target files/creation collisions must be rejected by the provider. There is no silent application-level rebase/retry.
- Lost write responses are verified once where possible. If the outcome is uncertain, inspect the remote branch/history before preparing another push. Closing/cancelling/revoking access cannot undo already-sent work; browser/network/provider logs may retain normal request information.

## References

Implementation uses original project code, not copied GitSyncMarks modules. Official references: [GitHub references](https://docs.github.com/en/rest/git/refs), [GitHub trees](https://docs.github.com/en/rest/git/trees), [GitLab commits](https://docs.gitlab.com/api/commits/), [GitLab file metadata](https://docs.gitlab.com/api/repository_files/), and [Chrome storage](https://developer.chrome.com/docs/extensions/reference/api/storage). No new required permissions were added; exact-host access uses the existing optional HTTPS declaration.
