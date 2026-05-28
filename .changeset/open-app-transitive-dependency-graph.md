---
"@memberjunction/open-app-engine": minor
---

feat(open-app): resolve the full transitive dependency graph up front, with real cross-repo cycle detection; forward `AllowDoubleUnderscoreSchema` / `Verbose` to dependency installs

`mj app install` now fetches every reachable dependency's manifest and resolves the complete transitive graph before installing anything, installing members in leaf-first topological order. This detects genuine cross-repo cycles (e.g. `A -> B -> A`) and fails fast with a clear message instead of recursing unbounded. Resolution runs once up front; pre-resolved members install without re-resolving their own subtrees.

Also fixes a latent bug in the existing recursive install: the `--dangerously-ignore-dbl-underscore-schema-rule` override (and `--verbose`) set on the top-level `mj app install` were not forwarded to the recursive dependency installs. An app whose dependency uses a `__`-prefixed schema (e.g. BCSaaS → `mj-bizapps-common` with schema `__mj_BizAppsCommon`) would fail at the dependency step with "Schema names starting with '__' are reserved for MJ internals" even when the override was set on the parent. Inherited install-behavior options now propagate to dependency installs. App-identity options (`Source`, `Version`) are intentionally not forwarded — each dependency has its own.

Public `InstallApp`/`UpgradeApp` signatures are unchanged.
