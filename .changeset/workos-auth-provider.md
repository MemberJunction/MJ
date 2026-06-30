---
"@memberjunction/auth-providers": minor
"@memberjunction/ng-auth-services": minor
"@memberjunction/core": minor
"@memberjunction/ng-bootstrap": minor
---

Add WorkOS (AuthKit) as a first-class authentication provider — end to end, server-side JWT validation and browser-side login. A deployment can now set `type: 'workos'` (server) / `AUTH_TYPE: 'workos'` (browser) and authenticate users through WorkOS just like Auth0, Okta, MSAL, Cognito, or Google.

- **Server** (`@memberjunction/auth-providers`): `WorkOSProvider` extends `BaseAuthProvider`, registered via `@RegisterClass(BaseAuthProvider, 'workos')`. Maps AuthKit JWT claims to `AuthUserInfo` (with graceful fallbacks) and validates `clientId`; issuer matching, JWKS caching, and retry/backoff are inherited. Wired into `AuthProviderFactory`.
- **Client** (`@memberjunction/ng-auth-services`): `MJWorkOSProvider` extends `MJAuthBase`, registered via `@RegisterClass(MJAuthBase, 'workos')`. Wraps the `@workos-inc/authkit-js` SDK (`createClient`/`signIn`/`signOut`/`getUser`/`getAccessToken`) behind the standardized provider contract with semantic error classification.
- **Core** (`@memberjunction/core`): `AUTH_PROVIDER_TYPES` gains `WORKOS: 'workos'`.
- **Env typing** (`@memberjunction/ng-bootstrap`): the `AUTH_TYPE` union gains `'workos'`, plus `WORKOS_CLIENTID` / `WORKOS_REDIRECT_URI` / `WORKOS_API_HOSTNAME` / `WORKOS_DEV_MODE` keys.

Includes a full end-to-end integration guide (`packages/AuthProviders/WORKOS.md`) covering the two WorkOS-specific gotchas: the required `email` JWT Template (AuthKit access tokens omit email, which MJ keys users on) and matching the enforced `aud` claim. Additive only.
