---
"@memberjunction/open-app-engine": patch
"@memberjunction/cli": patch
---

Tell a missing GitHub credential apart from a missing tag when installing an Open App from a private repository (#4505). GitHub returns 404 rather than 403 for a repo it will not show you, so `mj app install` reported `Tag 'vX.Y.Z' not found` — and pointed at the repo's `/tags` page, where a signed-in maintainer sees the tag and concludes the CLI is right. The engine now probes repository visibility on the 404 path and names all three ways to supply a credential — `GITHUB_TOKEN`, `openApps.github.token`, and the per-repo `openApps.github.tokens` map — when none was supplied, and `mj app install --help` documents them.

Behavioral note for consumers of `@memberjunction/open-app-engine` directly: `ValidateGitHubTag` and `FetchManifestFromGitHub` now issue one extra `GET /repos/{owner}/{repo}` request on every 404, so a caller validating many tags against an unauthenticated rate-limit budget spends two calls per miss instead of one.

Two related fixes on the same path. An `openApps.github.tokens` entry keyed by the repository URL now also applies when a multi-app Open App is installed by its subpath URL (`https://github.com/<owner>/<repo>/<subpath>`); before, the token was not sent. An entry keyed by the exact subpath URL still wins. The "Available versions" link for such an app now points at the repository's tags page; before, it kept the subpath and led to a 404 page. And `mj app install` / `mj app upgrade` now exit 1 after one failure line when the install or upgrade fails; before, they printed a second failure line and `Error: EEXIT: 1`, and exited 2.

`mj app upgrade <app>` with no `--version` now says why it could not resolve a version: for a repository the credential cannot see, it names the missing or insufficient credential instead of `Could not determine target version`. `@memberjunction/open-app-engine` exports one new function for this, `DescribeUnresolvedVersion(repoUrl, options, subpath?)`; nothing existing changed signature.
