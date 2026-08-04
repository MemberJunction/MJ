---
'@memberjunction/open-app-engine': patch
---

Fix version resolution and temp-file handling in the Open App engine's GitHub layer.

`compareSemver` ran `Number()` across the dot-split version string, so any prerelease
parsed to `NaN` (`1.2.0-beta.1` → `[1, 2, NaN, 1]`) and the comparator returned `NaN` —
making `Array.prototype.sort` ordering implementation-defined for any tag list containing
a prerelease, and letting `GetLatestVersion` report an arbitrary tag as the newest version.
Replaced with a spec-correct `CompareSemver` (numeric release triple, then semver
prerelease precedence), verified against the reference `semver` package over 14,400 ordered
pairs with zero mismatches.

`GetLatestVersion` now also picks the highest *version* rather than the first entry in
GitHub's own order, on both paths: the tag path prefers a stable tag over a prerelease, and
the releases path sorts by semver precedence instead of taking the most recently *created*
stable release — which offered a patch backported to an older line as the upgrade target
for an app already on a newer major.

`ListGitHubReleases` / `ListGitHubTags` were unpaginated at `per_page: 100`. Since GitHub
returns tags in its own order rather than semver order, a repo that tags many apps could
hide the newest version past the first page: against the live API, `MemberJunction/Integrations`
(344 tags) resolved **every** app to `null` before this change. Both now use `octokit.paginate`.

`HandleMigrations` and `HandleTeardown` each created a temp download directory and never
removed it, leaving a copy of the app's `.sql` migrations in the OS temp dir on every
install, upgrade, and remove. Both now clean up in a `finally` via a shared best-effort
helper that warns rather than failing the operation that created the directory.

`CompareSemver` and `IsPrereleaseVersion` are newly exported as reusable utilities. No
other public signature changes.
