---
"@memberjunction/server": patch
"@memberjunction/ng-dashboard-viewer": patch
---

Security hardening across three surfaces.

- **TestQuerySQL authorizes the read** (critical). The resolver ran caller-supplied raw SQL on the read-only pool with only the `query:test` API-key scope check, which is a no-op for JWT users. It now applies the same two guards as `ExecuteAdhocQuery`: scope-limited principals (magic-link sessions) are refused outright, and the RENDERED SQL — composition, inline dependencies and Nunjucks templates resolved with the same inputs the execution spec will use — must read only entity base views the caller can read unscoped (CanRead, no row-level filter, no denied fields) via `assertFullQueryUsesReadableEntityViews`, with `RequireReadStatement` enforced at render time.
- **Integration webhook goes through the SSRF guard.** `IntegrationDiscoveryResolver.sendWebhook` posted to the caller-supplied webhook URL with bare `fetch`; it now uses `SafeFetch` from `@memberjunction/network-utils`, which validates the URL and every redirect hop resolves to a public address.
- **Dashboard WebURL panels embed http(s) only.** The WebURL part handed any stored URL to `bypassSecurityTrustResourceUrl`, so a `javascript:` URL in a shared dashboard panel would execute in viewers' browsers (the iframes use `allow-same-origin`). The URL is now parsed and must be `http:` or `https:`; anything else renders the part's error state instead of an iframe.
