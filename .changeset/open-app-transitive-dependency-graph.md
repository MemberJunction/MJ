---
"@memberjunction/open-app-engine": minor
---

feat(open-app): resolve the full transitive dependency graph up front, with real cross-repo cycle detection

`mj app install` now fetches every reachable dependency's manifest and resolves the complete transitive graph before installing anything, installing members in leaf-first topological order. This detects genuine cross-repo cycles (e.g. `A -> B -> A`) and fails fast with a clear message instead of recursing unbounded. Resolution runs once up front; pre-resolved members install without re-resolving their own subtrees. Public `InstallApp`/`UpgradeApp` signatures are unchanged.
