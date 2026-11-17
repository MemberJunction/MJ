---
"@memberjunction/ng-public-host": patch
---

Adds `@memberjunction/ng-public-host`, which serves public pages from Open Apps at `/p/<slug>` before sign-in. `BootstrapMJ()` (from `@memberjunction/ng-public-host/bootstrap`) replaces the body of a host's `main.ts`: a path under `/p/` starts the public host, which loads only the page, and every other path starts Explorer as before. Public pages extend `BasePublicPage` and use `PublicPageContext` for the brand, MJAPI URLs and the sign-in link.
