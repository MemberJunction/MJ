---
"@memberjunction/global": patch
"@memberjunction/core": patch
"@memberjunction/server": patch
"@memberjunction/api-keys": patch
---

security: harden SQL-filter validation, the OAuth callback handler, API-key lookup, and the new-user domain gate

**SQL literal stripping (`@memberjunction/global`, `@memberjunction/core`).** Both of MJ's SQL screens — `DatabaseProviderBase.ValidateUserProvidedSQLClause` (which guards `ExtraFilter`, `OrderBy` and `UserSearchString`) and `SQLExpressionValidator` (which guards `Aggregates` and ad-hoc queries) — stripped string literals with a regex that honored **backslash escaping**. SQL Server and PostgreSQL do not treat `\` as an escape, so a payload such as `x = 'a\') ; DROP TABLE Users; --'` was swallowed whole as one "literal" and stripped away before the keyword denylist ran, while the database closed the literal at the real quote and executed the stacked statement. Both screens now share a single `StripSQLStringLiterals` helper that matches SQL-standard doubled-quote (`''`) semantics, and a regression suite in each package pins the behavior.

**OAuth callback handler (`@memberjunction/server`).** Caller-supplied `connectionId` was interpolated into a raw `ExtraFilter` without escaping; it is now validated as a UUID at the request boundary and escaped at the SQL sink. `frontendReturnUrl` was redirected to after only a URL-parse check, making the callback an open redirect from the trusted MJAPI origin; its origin is now validated against `cors.allowedOrigins` (plus the built-in redirect origins) both when the flow is initiated and when the redirect is issued.

**API-key lookup (`@memberjunction/api-keys`).** `ValidateKeyByHash` now asserts its argument is a SHA-256 hex digest before building the SQL filter, enforcing the injection-safety invariant at the sink for all present and future callers.

**⚠️ Behavior change — `userHandling.newUserAuthorizedDomains`.** The new-user domain gate previously authorized against the hostname parsed from the request's `Origin` header, which is trivially spoofable on non-browser requests: a holder of any valid IdP token could auto-provision an account under an authorized domain by forging `Origin`. It now authorizes against the **email domain of the verified identity token**.

If `newUserLimitedToAuthorizedDomains` is enabled, review `newUserAuthorizedDomains` before upgrading:

- Entries that are **frontend hostnames** (`app.example.com`, `localhost`) must be replaced with the **email domains** your users sign in with (`example.com`). Deployments where the two happened to coincide are unaffected.
- Wildcards match in full, so `*.example.com` matches `mail.example.com` but **not** `example.com` — list both if you need both.
- Identity providers that issue a bare username with no `email` claim can no longer auto-provision; the denial is logged explicitly. Configure the provider to emit an `email` claim, or set `newUserLimitedToAuthorizedDomains: false`.

The gate is off by default (`newUserLimitedToAuthorizedDomains: false`, `newUserAuthorizedDomains: []`), so deployments that never enabled it are unaffected.
