---
"@memberjunction/codegen-lib": patch
"@memberjunction/integration-test-suite": patch
---

Two silent failures made loud: the manifest generator's unbuilt-package fallback, and UR13's race with the live routine dispatcher.

**The manifest generator no longer guesses when a lazy package hasn't been built.** `resolveSubpathExportsDetailed()` resolves a package's lazy-loading subpaths by reading the `.d.ts` each `exports` entry's `types` field names, and skips any it cannot find. On an unbuilt workspace it finds none, returns an empty map, and the package falls through to the whole-package branch of `groupClassesIntoChunks()` — which replaces its per-subpath lazy chunks with one eager chunk. The result is valid TypeScript that compiles and passes review with its code splitting quietly removed. Running `mj codegen manifest` against an unbuilt tree collapsed `ng-dashboards`' twelve per-dashboard chunks into a single import and deleted 254 lines from `lazy-feature-config.ts` without a single warning.

`resolveLazySubpathExports()` now throws instead, naming the package and the directory it searched.

The guard is deliberately narrow, because "declares subpaths that didn't resolve" is a much weaker signal than it first appears — two innocent cases produce it:

- Every ng-packagr output publishes `"./package.json": { "default": "./package.json" }`, an entry with no `types` field that resolution skips by design. Only entries carrying `types` are counted.
- A subpath whose `.d.ts` declares no classes is skipped exactly like a missing one. `BootstrapLite`'s `./mj-class-registrations` is a real example — a generated manifest of const arrays, built and present, with nothing to reach.

So the check fires only for a package that actually **contributes lazy classes**, since that is the only case where an empty map mis-groups anything. A package contributing no classes has nothing to lose to the fallback.

**UR13 no longer races the product it is testing.** The check asserted an exact global run-row count for a routine that the shipped `User Routine Dispatcher` scheduled job — `Status=Active`, per-minute cron — is equally entitled to claim. `ConcurrencyMode=Skip` cannot prevent the overlap: it serialises *scheduled* runs against each other, while the check constructs a driver in-process against a fabricated `MJScheduledJobEntity` that is never saved, so the engine cannot see it. The scheduler polls on a timer anchored to MJAPI's boot rather than to the wall clock, so whether a sweep lands inside the bundle's ~3-second window varies run to run — which is why this failed on `next` after a slow boot with no relevant code change.

It now snapshots the run rows before the pass and asserts on the delta, which is strictly stronger than what it replaced:

- `Details.RoutinesRun === 1` states the no-double-run property directly against *our* sweep, where it is deterministic, rather than inferring it from a row count anyone may write to.
- Every new run row must satisfy the OnChange contract, not just the one at index 1 — all of them replay the same expression, so the property has to hold for each regardless of which dispatcher produced it.

`UR11` and `UR14` share the same exposure and are left alone here; they are not currently failing, and the durable fix for them is a fixture-level decision (pausing the live dispatcher for the bundle) that belongs to the suite's owner.
