---
"@memberjunction/open-app-engine": minor
"@memberjunction/cli": minor
"@memberjunction/core-entities": minor
---

feat(open-app): connector-extraction modality — multi-app repos, in-repo subpath, teardown, and `OpenApp.Subpath`

Adds the Open-App capabilities needed to ship vendor connectors as installable apps from a single multi-app repo (e.g. `MemberJunction/Integrations`):
- **Multi-app repos via in-repo subpath** — `mj app install <repo>/<subpath>` resolves a per-app manifest under a subdirectory; scoped-tag version resolution (`<subpath>@<version>`) per app.
- **`OpenApp.Subpath` column** (migration + CodeGen) persists which in-repo directory an app installed from, so upgrade/remove re-fetch the right manifest.
- **Remove-time teardown** (`migrations.teardownDirectory`) — retires the rows an app's seed migrations wrote into the shared core schema (`__mj` Integration/IO/IOF/Action), which dropping the app's own schema cannot reach. Platform-aware (`-pg` on Postgres) + subpath-aware.
- **Array-form `dependencies`** accepted in the manifest (normalized to a record), so apps that ship `dependencies` as an array of `{ name, repository, versionRange }` validate and install.
