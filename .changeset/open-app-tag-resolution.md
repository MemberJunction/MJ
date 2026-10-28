---
"@memberjunction/open-app-engine": patch
---

A monorepo app's version tag is resolved from the tag that exists rather than composed from the app's repo subpath, so an app whose repository tags by package name can be version-resolved, upgraded and pinned instead of only installed at HEAD. All three consumers change together — the tag lookup, the manifest fetch, and the migration download. The migration download mattered most: it always has a version, so it never fell back to HEAD, and a package-tagged app with migrations failed in the Migration phase on every install and upgrade — while the PostgreSQL `-pg` probe, which reads a 404 as "no PG variant here", skipped that app's PG migrations silently.
