---
"@memberjunction/open-app-engine": patch
"@memberjunction/cli": patch
---

Tell a missing GitHub credential apart from a missing tag when installing an Open App from a private repository (#4505). GitHub returns 404 rather than 403 for a repo it will not show you, so `mj app install` reported `Tag 'vX.Y.Z' not found` — and pointed at the repo's `/tags` page, where a signed-in maintainer sees the tag and concludes the CLI is right. The engine now probes repository visibility on the 404 path and names all three ways to supply a credential — `GITHUB_TOKEN`, `openApps.github.token`, and the per-repo `openApps.github.tokens` map — when none was supplied, and `mj app install --help` documents them.

Behavioral note for consumers of `@memberjunction/open-app-engine` directly: `ValidateGitHubTag` and `FetchManifestFromGitHub` now issue one extra `GET /repos/{owner}/{repo}` request on every 404, so a caller validating many tags against an unauthenticated rate-limit budget spends two calls per miss instead of one.
