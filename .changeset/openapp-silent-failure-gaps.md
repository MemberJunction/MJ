---
'@memberjunction/open-app-engine': patch
'@memberjunction/global': patch
'@memberjunction/cli': patch
---

Close five silent-failure gaps in Open App config writes, class registration, and update checks.

`dynamicPackages` idempotency matched the whole config file rather than the target array, so a
`shared` package — which must be written to both `server` and `client` — had its client insert
skipped by the server entry written moments earlier. The package never reached
`dynamicPackages.client`, so its `@RegisterClass` components were tree-shaken out of the browser
bundle with no error raised anywhere. The check is now scoped to the target array's body.

Upgrades were add-only, so `mj.config.cjs` converged on the union of every version ever installed
and a package dropped in v2 kept being bootstrapped. `PruneDynamicPackagesNotInManifest` now runs
before the adds on the upgrade path; surviving entries are left byte-identical so an operator's
`Enabled: false` is not silently reset, keep-sets are per-array, and an entry shape that cannot be
parsed is a no-op rather than a guess. A renamed `startupExport` is retargeted in place — keying
only on package name left the old export name in the config forever, and ServerBootstrap then reads
`mod[StartupExport]`, gets `undefined`, skips it because it is not a function, and still logs
`(ran <old name>)`.

`@RegisterClass` passes `priority = 0`, which routes to the auto-increment branch, so a later
registration always wins — correct for an inheritance chain, silently wrong for two unrelated
classes colliding on a key. Only `priority > 0` ever warned, so in practice nothing warned.
`ClassFactory.Register` now warns naming every prior unrelated registration for that
`(base class, key)` pair, using a new `AreClassesRelated` that compares by name as well as identity
so a module loaded through two paths does not read as a collision. Registration behavior is
unchanged; the warning is diagnostic only.

`mj app check-updates` dropped the per-repo `TokenMap` that `install` and `upgrade` both use, so
private repos reported "up to date" forever; dropped each app's `Subpath`, so a multi-app repo
reported a **sibling app's** version as this app's latest; and let one throwing app kill the sweep
or vanish from a report that still concluded "All apps are up to date". The loop moved into a
testable `CheckAppsForUpdates` helper with the version lookup injected, and failures are collected
per app and reported.
