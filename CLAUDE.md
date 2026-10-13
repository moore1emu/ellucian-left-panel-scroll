# Integration Navigator: working notes

## Branches and releases
- Do all work on the `develop` branch. `main` holds only versions the owner has tested and published to the Chrome Web Store.
- Never merge into `main` or open a pull request until the owner says the test build passed.
- Each change gets its own version bump in `manifest.json` and an entry at the top of `docs/CHANGELOG.md`.
- After changes, build a test zip for loading unpacked in Chrome: `manifest.json`, the root `*.js`, `*.html`, `*.css`, and `icons/*.png` only.

## Code comments
- One short line per decision or step, explaining why; no paragraphs.
- Mark deliberate code that could look removable with `// Keep: <reason> (<version>)`. Do not remove `Keep:` code without asking.

## Files
- `shared.js`: page rules and the resize gesture shared by `content.js` and `search.js` (isolated world).
- `page-index.js` runs in the page's own world, so it keeps its own copies of shared constants; keep the two in sync.
- Source files use CRLF line endings; preserve them when editing.
