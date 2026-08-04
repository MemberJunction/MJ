# WorkOS (AuthKit) Authentication Integration

**Status:** ✅ Complete — server + client providers implemented, built, and unit-tested; docs written.
**Branch:** `claude/workos-integration-explore-fn0nw8`
**Author:** Claude (for amith@bluecypress.io)
**Date:** 2026-06-30

## Goal

Add first-class **WorkOS AuthKit** support to MemberJunction's pluggable auth system —
end to end: server-side JWT validation **and** browser-side login — so a deployment can
set `type: 'workos'` / `AUTH_TYPE: 'workos'` and authenticate users through WorkOS exactly
like Auth0, Okta, MSAL, Cognito, or Google.

## Why WorkOS

WorkOS AuthKit is an OIDC-compliant identity platform (hosted login, SSO, Directory Sync,
MFA). Because MJ's auth layer already speaks OIDC/JWT + JWKS, WorkOS slots into the existing
extension points with no framework changes. MJ's value-add (entities, agents, metadata) is
orthogonal to auth, so WorkOS is consumed as an IdP, not a replacement for anything.

## Packaging decision

**Extend the existing packages** — do NOT create a new npm package. Every built-in provider
(Auth0, Okta, MSAL, Cognito, Google, Magic Link) already lives as a file inside two shared
packages. A standalone package for one ~50-line provider would diverge from the established
pattern, add cross-package wiring, and bump against the repo's "no re-exports between
packages" rule. Instead we ship a dedicated **`packages/AuthProviders/WORKOS.md`** deep-dive
guide as the centerpiece documentation.

- **Server validation** → `@memberjunction/auth-providers`
- **Browser login** → `@memberjunction/ng-auth-services`

## Architecture (unchanged extension points)

```
Browser (MJExplorer)                         MJ GraphQL Server
─────────────────────                        ─────────────────
MJWorkOSProvider  (extends MJAuthBase)        WorkOSProvider (extends BaseAuthProvider)
  @RegisterClass(MJAuthBase,'workos')           @RegisterClass(BaseAuthProvider,'workos')
  └─ @workos-inc/authkit-js                      └─ jwks-rsa + jsonwebtoken (inherited)
       createClient → signIn/signOut/            extractUserInfo(payload) → AuthUserInfo
       getUser/getAccessToken                  AuthProviderFactory.getByIssuer(iss)
  getIdToken() → authkit.getAccessToken()  ─────► Bearer token validated against JWKS
```

## WorkOS specifics (verified)

| Item | Value |
|---|---|
| Token issuer (`iss`) | `https://api.workos.com/user_management/<clientId>` |
| JWKS endpoint | `https://api.workos.com/sso/jwks/<clientId>` |
| Algorithm | RS256 |
| `aud` claim | Present by default (environment-unique value, or a configured **Resource Indicator**). MJ enforces audience, so config `audience` must match the token's `aud`. |
| `email` claim | **NOT present by default.** Must be added via a WorkOS **JWT Template** (`email: {{user.email}}`). MJ resolves users by email, so this is required. |
| Client SDK | `@workos-inc/authkit-js@^0.20.1` — `createClient(clientId, opts)` → `{ signIn, signOut, getUser, getAccessToken({forceRefresh}), dispose }`. `getAccessToken()` returns the JWT and auto-refreshes. |

### The #1 integration gotcha (documented prominently)

MJ keys users by **email**. WorkOS AuthKit access tokens omit `email` unless a JWT Template
adds it. The guide must instruct users to create a JWT Template:

```
{ "email": "{{user.email}}", "given_name": "{{user.first_name}}", "family_name": "{{user.last_name}}" }
```

## Work items

### Server (`packages/AuthProviders`)
- [x] `src/providers/WorkOSProvider.ts` — new provider, claim mapping + `validateConfig()`
- [x] `src/AuthProviderFactory.ts` — add side-effect import so it registers
- [x] `src/__tests__/WorkOSProvider.test.ts` — comprehensive unit tests

### Core types (`packages/MJCore`)
- [x] `src/generic/authTypes.ts` — add `WORKOS: 'workos'` to `AUTH_PROVIDER_TYPES`

### Client (`packages/Angular/Explorer/auth-services`)
- [x] `src/lib/providers/mjexplorer-workos-provider.service.ts` — `MJWorkOSProvider`
- [x] `src/public-api.ts` — export it
- [x] `package.json` — add `@workos-inc/authkit-js` (peer + dev)
- [x] `src/__tests__/mjexplorer-workos-provider.service.test.ts` — unit tests (mock SDK)

### Env typing (`packages/Angular/Bootstrap`)
- [x] `src/lib/bootstrap.types.ts` — add `'workos'` to `AUTH_TYPE` union + `WORKOS_*` keys

### Docs
- [x] `packages/AuthProviders/WORKOS.md` — deep-dive integration guide (the centerpiece)
- [x] `packages/AuthProviders/README.md` — add WorkOS to built-ins table + config example
- [x] `packages/Angular/Explorer/auth-services/README.md` — add WorkOS client section
- [x] root `README.md` — mention WorkOS in the two auth references

### Verification
- [x] `npm run build` in AuthProviders + run vitest
- [x] `npm install` at root for the new client dep; build ng-auth-services
- [x] Final: commit, push, open PR with thorough documentation

## Non-goals (call out in docs)
- WorkOS **SSO/SAML** and **Directory Sync (SCIM)** provisioning — AuthKit (OIDC/JWT) is the
  scope here. SAML assertions + SCIM are a larger, separate effort (MJ's providers are all
  OIDC/JWT-bearer today).
- No changes to MJServer's shared verify path — WorkOS works within the existing
  issuer+audience model.
```
