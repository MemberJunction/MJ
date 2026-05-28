---
"@memberjunction/open-app-engine": minor
---

feat(open-app): resolve the full transitive dependency graph up front, with real cross-repo cycle detection and array-form manifest support

`mj app install` now fetches every reachable dependency's manifest and resolves the complete transitive graph before installing anything, installing members in leaf-first topological order. This detects genuine cross-repo cycles (e.g. `A -> B -> A`) and fails fast with a clear message instead of recursing unbounded. The manifest schema also accepts the array form of `dependencies` (`[{ name, repository, versionRange }]`), normalizing it to the canonical record form — previously such manifests failed validation outright (the defect that blocked `mj app install` for apps like bizapps-tasks and pre-fix BCSaaS). Public `InstallApp`/`UpgradeApp` signatures are unchanged.
