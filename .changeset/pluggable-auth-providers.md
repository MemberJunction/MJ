---
"@memberjunction/core": minor
"@memberjunction/core-entities": minor
"@memberjunction/auth-providers": minor
"@memberjunction/server": minor
"@memberjunction/ng-auth-services": minor
"@memberjunction/ng-explorer-app": minor
---

feat(auth): metadata-driven pluggable authentication providers

Authentication providers are now discovered the MJ way — a `@RegisterClass(BaseAuthProvider, 'x')`
subclass plus a row in the new `MJ: Authentication Providers` entity, resolved at runtime through
`ClassFactory` by `DriverClass`. Adding a provider requires no core edits.

- **New entity** `__mj.AuthenticationProvider`, with the OIDC connection fields as columns, an
  optional `CredentialID` for the rare provider needing server-side secrets, and login-picker
  presentation fields. Driver configuration is split by trust boundary: `AdditionalConfiguration`
  is server-only, `ClientConfiguration` is published to the browser.
- **`AuthProviderEngine`** loads the catalog at startup and registers it with `AuthProviderFactory`.
- **Layered resolution** — `mj.config.cjs` `authProviders[]` remains fully supported as the baseline
  and fallback, so existing deployments are unaffected and need no changes.
- **`GET /auth/providers`** publishes the non-secret catalog to the pre-auth browser (rate-limited,
  mounted ahead of the auth middleware, allow-list projection).
- **`<mj-login-picker>`** — a reusable, app-agnostic multi-IdP picker built on `mjButton`, rendered
  only when 2+ client-visible providers exist. Single-provider deployments look exactly as before.
- `AuthProviderFactory` no longer carries a hard-wired list of built-in provider imports; the
  package entry point and the class-registration manifests already covered registration.
