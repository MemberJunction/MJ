---
"@memberjunction/open-app-engine": patch
---

`mj app install` now fits within GitHub's anonymous API allowance of 60 requests per hour, so an app with many dependencies installs without a GitHub token.

Installing `https://github.com/MemberJunction/more-cheese` (10 dependency apps, about 230 migration files) used to make about 300 GitHub API requests: one per migration file and per migrations directory, a second one for each file over 1 MB, and per app a release listing, a tag listing, a tag check and two manifest reads. Without `GITHUB_TOKEN` it failed partway with a bare 403. It now makes 21 requests (32 on PostgreSQL, where each app is also checked for a `migrations-pg` directory), and that number no longer grows with the number of migration files:

- File contents (`mj-app.json` manifests and migration `.sql` files) are read from raw.githubusercontent.com, which does not count against the API limit. A configured token is sent there too, for private repositories. If raw.githubusercontent.com cannot serve a file, for example because a network blocks that host or it does not accept the token for a private repository, that file is read through the API exactly as before.
- Each app's migrations directory is listed with one request, however many subdirectories it has.
- A dependency's version tag is no longer checked again when the version was just chosen from the repository's tag list, and its releases are listed only when they could change which version is chosen.

When the limit is reached anyway, the error now says so plainly: what was being done, when the limit resets (in UTC), and that setting `GITHUB_TOKEN` (or `openApps.github.token`) raises it to 5,000 requests per hour.

Installing from a default branch (no version) right after a push can briefly see the previous `mj-app.json`, because raw.githubusercontent.com is cached for a few minutes. Installs of a tagged version are unaffected.

Also new: `ListGitHubTagNames()` returns every tag name in a repository, and `GitHubAccessError` now has `IsRateLimit` and `ResetAt`.

Downloaded migration and teardown scripts now go into a temp directory with a random name, readable only by the user running the install (`mkdtemp`). The name used to be the app name plus a timestamp, which another account on the same machine could guess and create first.
