---
"@memberjunction/global": patch
"@memberjunction/core": patch
"@memberjunction/server": patch
"@memberjunction/api-keys": patch
---

security: harden SQL-filter validation, the OAuth callback handler, API-key lookup, and the new-user domain gate

**SQL literal stripping (`@memberjunction/global`, `@memberjunction/core`).** Both of MJ's SQL screens — `DatabaseProviderBase.ValidateUserProvidedSQLClause` (which guards `ExtraFilter`, `OrderBy` and `UserSearchString`) and `SQLExpressionValidator` (which guards `Aggregates` and ad-hoc queries) — stripped string literals with a regex that honored **backslash escaping**. SQL Server and PostgreSQL do not treat `\` as an escape, so a payload such as `x = 'a\') ; DROP TABLE Users; --'` was swallowed whole as one "literal" and stripped away before the keyword denylist ran, while the database closed the literal at the real quote and executed the stacked statement. Both screens now share a single `StripSQLStringLiterals` helper that matches SQL-standard doubled-quote (`''`) semantics, and a regression suite in each package pins the behavior.

**OAuth callback handler (`@memberjunction/server`).** Caller-supplied `connectionId` was interpolated into a raw `ExtraFilter` without escaping; it is now validated as a UUID at the request boundary and escaped at the SQL sink. `frontendReturnUrl` was redirected to after only a URL-parse check, making the callback an open redirect from the trusted MJAPI origin; its origin is now validated against `cors.allowedOrigins` (plus the built-in redirect origins) both when the flow is initiated and when the redirect is issued.

If you run frontends other than MJExplorer against MJAPI, note that the return-URL allowlist is derived from `cors.allowedOrigins`. Deployments on the default `['*']` are unaffected — every return URL is still allowed. Deployments that have narrowed `cors.allowedOrigins` are mostly self-protecting, since a browser frontend must already be on that list to call `/oauth/initiate` at all, but three cases can now fall back to MJAPI's built-in page instead of returning to the app: a return URL on a *different* origin than the caller, a server-to-server initiate whose return origin was never CORS-listed, and any proxy setup where the browser-visible origin differs from the configured one (matching is exact on scheme + host + port). Each rejection is logged with the offending URL.

**API-key lookup (`@memberjunction/api-keys`).** `ValidateKeyByHash` now asserts its argument is a SHA-256 hex digest before building the SQL filter, enforcing the injection-safety invariant at the sink for all present and future callers.

**⚠️ Behavior change — `userHandling.newUserAuthorizedDomains`.** The new-user domain gate previously authorized against the hostname parsed from the request's `Origin` header, which is trivially spoofable on non-browser requests: a holder of any valid IdP token could auto-provision an account under an authorized domain by forging `Origin`. It now authorizes against the **email domain of the verified identity token**.

If `newUserLimitedToAuthorizedDomains` is enabled, review `newUserAuthorizedDomains` before upgrading:

- Entries that are **frontend hostnames** (`app.example.com`, `localhost`) must be replaced with the **email domains** your users sign in with (`example.com`). Deployments where the two happened to coincide are unaffected.
- Wildcards match in full, so `*.example.com` matches `mail.example.com` but **not** `example.com` — list both if you need both.
- Identity providers that issue a bare username with no `email` claim can no longer auto-provision; the denial is logged explicitly. Configure the provider to emit an `email` claim, or set `newUserLimitedToAuthorizedDomains: false`.

The gate is off by default (`newUserLimitedToAuthorizedDomains: false`, `newUserAuthorizedDomains: []`), so deployments that never enabled it are unaffected.

**⚠️ Related expansion — MCP OAuth auto-provisioning.** Auto-provisioning previously also required a non-empty request `Origin` as a precondition for entering the check at all. `MCPServer`'s `resolveOAuthUser` passes no request domain, so with the domain gate enabled, MCP OAuth users could never be auto-created regardless of their email domain. Now that the spoofable precondition is gone, an MCP OAuth user whose **JWKS-verified** token carries an authorized email domain plus given/family name claims **will** be auto-provisioned, consistent with the browser path. If you run MCP with `newUserLimitedToAuthorizedDomains` enabled and were relying on that side effect to keep MJ user records from being created, add the restriction explicitly (narrow `newUserAuthorizedDomains`, or set `autoCreateNewUsers: false`).
