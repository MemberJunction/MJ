---
"@memberjunction/ng-public-host": patch
"@memberjunction/ng-explorer-app": patch
"@memberjunction/ng-explorer-service-worker": patch
---

Adds `@memberjunction/ng-public-host`, which serves public pages from Open Apps at `/p/<slug>` before sign-in, and `StartExplorer()` in the new `@memberjunction/ng-explorer-app/bootstrap` entry. A host's `main.ts` now only calls `StartExplorer()`: a path under `/p/` starts the public host, which loads only the page, and every other path starts Explorer as before. Start-up changes now reach a host with a package update. For a wrong address the public host shows the nearest error page an installed app ships, or its own. Public pages extend `BasePublicPage` and use `PublicPageContext` for the brand, MJAPI URLs, the sign-in link and `ShowNotFound()`. Explorer's service worker no longer answers `/p/` addresses, so the web host always receives them and can serve each page's own HTML file.
