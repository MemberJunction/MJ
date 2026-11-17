---
"@memberjunction/ng-public-host": patch
---

Adds `@memberjunction/ng-public-host`, which serves public pages from Open Apps at `/p/<slug>` before sign-in. A host's `main.ts` calls `TryStartPublicPage()` (from `@memberjunction/ng-public-host/bootstrap`) first: a path under `/p/` starts the public host, which loads only the page, and every other path returns false so `main.ts` starts Explorer as before. Public pages extend `BasePublicPage` and use `PublicPageContext` for the brand, MJAPI URLs and the sign-in link.
