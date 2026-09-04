---
'@memberjunction/open-app-engine': patch
'@memberjunction/global': patch
'@memberjunction/cli': patch
'@memberjunction/core-entities-server': patch
---

Close silent-failure gaps in Open App config writes, class registration, and update checks — and
fix the first real collision the new class-registration diagnostic found.

`dynamicPackages` idempotency matched the whole config file rather than the target array, so a
`shared` package — which must be written to both `server` and `client` — had its client insert
skipped by the server entry written moments earlier. The package never reached
`dynamicPackages.client`, so its `@RegisterClass` components were tree-shaken out of the browser
bundle with no error raised anywhere. The check is now scoped to the target array's body.

Upgrades were add-only, so `mj.config.cjs` converged on the union of every version ever installed
and a package dropped in v2 kept being bootstrapped. `PruneDynamicPackagesNotInManifest` now runs
on the upgrade path, after the adds; surviving entries are left byte-identical so an operator's
`Enabled: false` is not silently reset, keep-sets are per-array, and an entry shape that cannot be
parsed is a no-op rather than a guess. A renamed `startupExport` is retargeted in place — keying
only on package name left the old export name in the config forever, and ServerBootstrap then reads
`mod[StartupExport]`, gets `undefined`, skips it because it is not a function, and still logs
`(ran <old name>)`. The add-then-prune order is chosen for the failure case: these are two writes
to the same files with no rollback between them, and adding first leaves that window holding
(old ∪ new), so a server that restarts mid-upgrade still finds every entry it needs. Pruning first
would leave a subset of both versions and the app's registrations would vanish.

`@RegisterClass` passes `priority = 0`, which routes to the auto-increment branch, so a later
registration always wins — correct for an inheritance chain, silently wrong for two unrelated
classes colliding on a key. Only `priority > 0` ever warned, so in practice nothing warned.
`ClassFactory.Register` now warns naming every prior unrelated registration for that
`(base class, key)` pair, using a new `AreClassesRelated` that compares by name as well as identity
so a module loaded through two paths does not read as a collision. Registration behavior is
unchanged; the warning is diagnostic only. Measured over a realistic MJAPI load — 1,318 real
registrations across 697 `(base, key)` groups — it fires on exactly one pair, with no false
positives.

That one pair was a real bug, fixed here. `MJConversationDetailEntityServer` and
`MJConversationDetailEntityExtended` both registered for `BaseEntity` under
`'MJ: Conversation Details'` as siblings, each extending the generated entity directly. The server
package loads last, so it won outright and the Extended class's `Save`/`Delete` permission gate —
the check that only a conversation's owner may set `UserRating`/`UserFeedback`, and that a
non-owner without a resource grant cannot write at all — never ran. The gate is explicitly written
to run server-side (`ProviderType === 'Database'`), which is exactly where it was being shadowed
out. `MJConversationDetailEntityServer` now extends `MJConversationDetailEntityExtended`, so the
edit-flag logic and the permission gate compose instead of one replacing the other. The resolved
class is unchanged; only its base is.

`mj app check-updates` dropped the per-repo `TokenMap` that `install` and `upgrade` both use, so
private repos reported "up to date" forever; dropped each app's `Subpath`, so a multi-app repo
reported a **sibling app's** version as this app's latest; and let one throwing app kill the sweep
or vanish from a report that still concluded "All apps are up to date". The loop moved into a
testable `CheckAppsForUpdates` helper with the version lookup injected, and failures are collected
per app and reported.

A lookup that returns no version at all is now reported as `Unresolved` — a third outcome, distinct
from both an update and a failure — and the green "All apps are up to date" line is printed only
when every app actually produced an answer. Every app in the list is installed, so it resolved from
a real ref once; finding no version now means the resolver and the repository disagree. This matters
because `ListGitHubTags` reads a single page of the GitHub tags API: against
`MemberJunction/Integrations` (374 tags), the scoped `<subpath>@<semver>` tag line for every
installed connector sits past page 1, so all nine apps resolve to nothing. Without this, scoping the
lookup by `Subpath` would have traded a wrong-but-obvious answer for a confident false green.
Pagination itself is fixed separately in #3353, which should land with or before this.
