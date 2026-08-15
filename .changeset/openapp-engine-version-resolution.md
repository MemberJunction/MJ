---
'@memberjunction/open-app-engine': patch
---

Fix version resolution and temp-file handling in the Open App engine's GitHub layer.

`compareSemver` ran `Number()` across the dot-split version string, so any prerelease
parsed to `NaN` (`1.2.0-beta.1` → `[1, 2, NaN, 1]`) and the comparator returned `NaN` —
making `Array.prototype.sort` ordering implementation-defined for any tag list containing
a prerelease, and letting `GetLatestVersion` report an arbitrary tag as the newest version.
Version parsing, precedence and prerelease detection now come from the `semver` package,
which was already a dependency of this package and already imported by
`install/install-orchestrator.ts`. Sorting goes through `semver.rcompare` on the normalized
core; every version this module returns is normalized by `semver.valid`. That also fixes a
second-order case the hand-rolled version had: a release tagged `v1.2.3+build.7` was
returned verbatim, and `1.2.3+build.7` can never equal an installed `1.2.3`, so it read as
a permanent "update available".

`GetLatestVersion` now also picks the highest *version* rather than the first entry in
GitHub's own order, on both paths: the tag path prefers a stable tag over a prerelease, and
the releases path sorts by semver precedence instead of taking the most recently *created*
stable release — which offered a patch backported to an older line as the upgrade target
for an app already on a newer major. Both paths now exclude prereleases by the version
STRING, not only by GitHub's `prerelease` flag. That flag is a checkbox a maintainer can
forget: tag `v2.1.0-rc.1`, leave it unticked, and the releases path offered a release
candidate as the upgrade target while the tag path correctly said `2.0.0`.

`ListGitHubReleases` / `ListGitHubTags` were unpaginated at `per_page: 100`. Since GitHub
returns tags in its own order rather than semver order, a repo that tags many apps could
hide the newest version past the first page: against the live API, `MemberJunction/Integrations`
(374 tags) resolved **every** app to `null` before this change. Both now use `octokit.paginate`.

Pagination is per-REPOSITORY while tag filtering is per-app, so a sweep over several apps
sharing one repo was paying for the whole paginated walk once per app — measured at 36 HTTP
requests where 4 suffice, growing with the repo's tag count on every release. `ListGitHubTags`
now reuses a recently fetched tag list for the same repository (60s TTL, keyed by the resolved
token so a private repo's tags are never served to a caller who did not supply that token;
failed fetches are never cached). Live, the same 9-app sweep went from 36 requests / 9.3s to
4 requests / 1.1s with identical resolved versions. `ClearGitHubTagCache` is exported for
tests and for a caller that has just pushed a tag.

The cache holds the IN-FLIGHT PROMISE rather than the settled array, so concurrent lookups
join one fetch instead of each starting their own — caching the resolved value only helped a
caller that awaited between apps, which left the saving contingent on `check-updates` being
a sequential loop in a package this one does not own. `ListGitHubReleases` is memoized on
the same key and TTL: pagination fixed its silent truncation at 100 but made every call cost
one request per page, and both `GetLatestVersion` and `ResolveVersionRange` call it. Entries
are evicted on write (expired first, then oldest, bounded at 64) so the cache cannot grow for
the life of the process while holding a token in each key.

When a repository has no repo-wide-versioned release at all, `GetLatestVersion` now returns
`null` rather than the first release's tag name. Handing back `@memberjunction/connector-nimble-ams@1.3.2`
as an app's "latest version" — which is what it did — yields a string that can never equal the
installed version, so it reads as a permanent "update available" pointing at a target
`mj app upgrade` would act on. Falling through to the tag path resolves to `null` honestly.

`HandleMigrations` and `HandleTeardown` each created a temp download directory and never
removed it, leaving a copy of the app's `.sql` migrations in the OS temp dir on every
install, upgrade, and remove. Both now clean up in a `finally` via a shared best-effort
helper that warns rather than failing the operation that created the directory.

`ExtractDeclaredApplicationIds`' third temp directory now uses the same shared helper as the
other two rather than its own inline `rmSync`, so a cleanup failure is reported instead of
swallowed.

`IsPrereleaseVersion` and `ClearGitHubTagCache` are newly exported. `ListGitHubTags` still
returns tag TEXT (`v1.0.7`) — only the ordering changed. No other public signature changes.
