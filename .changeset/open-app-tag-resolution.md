---
"@memberjunction/open-app-engine": patch
---

A monorepo app's version tag is resolved from the tag that exists rather than composed from the app's repo subpath, so an app whose repository tags by package name can be version-resolved, upgraded and pinned instead of only installed at HEAD. Both the tag lookup and the ref resolution change together.
