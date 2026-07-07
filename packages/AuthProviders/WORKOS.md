# WorkOS (AuthKit) Integration Guide

This guide walks you through wiring **WorkOS AuthKit** into MemberJunction end to end —
browser login and server-side token validation — so users sign in through WorkOS exactly like
they would through Auth0, Okta, MSAL, Cognito, or Google.

WorkOS is consumed as an OIDC/JWT identity provider. MemberJunction does **not** replace WorkOS;
WorkOS handles authentication (hosted login, SSO, MFA, Directory Sync) and MJ handles everything
after the user is identified (entities, permissions, agents, audit).

> **TL;DR — the one thing that trips everyone up:** a WorkOS AuthKit **access token does not
> include the user's email by default**, and MemberJunction resolves users by email. You must add
> an `email` claim with a [WorkOS **JWT Template**](#step-3--add-an-email-claim-jwt-template).
> Skip this and every login will fail user lookup on the server. See
> [Step 3](#step-3--add-an-email-claim-jwt-template).

---

## Table of contents

1. [How it fits together](#how-it-fits-together)
2. [What's in this package](#whats-in-this-package)
3. [Prerequisites](#prerequisites)
4. [Step 1 — Configure the WorkOS dashboard](#step-1--configure-the-workos-dashboard)
5. [Step 2 — Configure the MJ server (`mj.config.cjs`)](#step-2--configure-the-mj-server-mjconfigcjs)
6. [Step 3 — Add an `email` claim (JWT Template)](#step-3--add-an-email-claim-jwt-template)
7. [Step 4 — Configure the browser (MJExplorer)](#step-4--configure-the-browser-mjexplorer)
8. [Token claims reference](#token-claims-reference)
9. [How validation works under the hood](#how-validation-works-under-the-hood)
10. [Troubleshooting](#troubleshooting)
11. [Scope & non-goals](#scope--non-goals)

---

## How it fits together

```
┌─ Browser (MJExplorer) ─────────────────┐        ┌─ MJ GraphQL Server ─────────────────────┐
│                                         │        │                                          │
│  MJWorkOSProvider (extends MJAuthBase)  │        │  WorkOSProvider (extends BaseAuthProvider)│
│   @RegisterClass(MJAuthBase,'workos')   │        │   @RegisterClass(BaseAuthProvider,'workos')│
│        │                                │        │        ▲                                 │
│   @workos-inc/authkit-js                │        │        │ jwks-rsa + jsonwebtoken         │
│        │  signIn → hosted login         │        │        │ (verify signature, iss, aud)    │
│        │  getUser()  (email for display)│        │        │                                 │
│        └─ getAccessToken() ── Bearer ───┼────────┼──▶ AuthProviderFactory.getByIssuer(iss)  │
│                                         │        │      → WorkOSProvider.extractUserInfo()  │
│                                         │        │      → verifyUserRecord(email)           │
└─────────────────────────────────────────┘        └──────────────────────────────────────────┘
```

Both ends register under the same lowercase key, `workos`, through MJ's class factory. The server
trusts the issuer/JWKS to verify the signature; the browser SDK manages the session and silent
token refresh.

## What's in this package

| Side | Class | File | Registers as |
|---|---|---|---|
| Server | `WorkOSProvider` | [`src/providers/WorkOSProvider.ts`](src/providers/WorkOSProvider.ts) | `@RegisterClass(BaseAuthProvider, 'workos')` |
| Browser | `MJWorkOSProvider` | `@memberjunction/ng-auth-services` → `src/lib/providers/mjexplorer-workos-provider.service.ts` | `@RegisterClass(MJAuthBase, 'workos')` |

The server provider is registered automatically (it's imported by
[`AuthProviderFactory.ts`](src/AuthProviderFactory.ts)); you only need to add a config entry.

## Prerequisites

- A [WorkOS](https://workos.com) account with **AuthKit / User Management** enabled.
- Your **Client ID** (looks like `client_01H...`) from the WorkOS dashboard.
- The browser app must depend on `@workos-inc/authkit-js` (already declared as a peer dependency
  of `@memberjunction/ng-auth-services`, and a direct dependency of MJExplorer).

---

## Step 1 — Configure the WorkOS dashboard

1. In the WorkOS dashboard, go to **Authentication → AuthKit** and enable it.
2. Under **Redirects**, add your app's redirect URI (e.g. `http://localhost:4200` for local
   development, plus your production origin). This is where WorkOS returns the user after login.
3. Set a **Logout URI** (the page WorkOS returns to after sign-out — typically the same origin).
4. Note your **Client ID**. You'll use it in three places: the server `issuer`/`jwksUri`, the
   server `clientId`, and the browser `WORKOS_CLIENTID`.

## Step 2 — Configure the MJ server (`mj.config.cjs`)

Add a `workos` entry to `authProviders`. The `issuer` and `jwksUri` are derived from your Client
ID:

```javascript
// mj.config.cjs
module.exports = {
  authProviders: [
    {
      name: 'workos-prod',
      type: 'workos',
      clientId: process.env.WORKOS_CLIENT_ID,            // client_01H...
      issuer: `https://api.workos.com/user_management/${process.env.WORKOS_CLIENT_ID}`,
      jwksUri: `https://api.workos.com/sso/jwks/${process.env.WORKOS_CLIENT_ID}`,
      // The audience MUST match the token's `aud` claim — see the note below.
      audience: process.env.WORKOS_CLIENT_ID,
    },
    // ...other providers can coexist; the factory routes by the token's `iss` claim
  ],
};
```

### Getting `audience` right

MemberJunction **always enforces the `aud` claim** during verification. WorkOS sets `aud`
automatically (you cannot override it via a JWT Template — it's a reserved claim):

- **No Resource Indicators configured (default):** WorkOS uses a default audience unique to your
  WorkOS environment. Decode a real access token (e.g. at [jwt.io](https://jwt.io)) and copy the
  exact `aud` value into your `audience` config.
- **Resource Indicators configured:** the `aud` matches the requested resource — set `audience`
  to that resource identifier.

> If `audience` does not match the token's `aud`, verification fails with
> `jwt audience invalid`. This is the second most common misconfiguration after the missing email
> claim.

## Step 3 — Add an `email` claim (JWT Template)

**This step is required.** A WorkOS AuthKit access token carries identity/session claims
(`sub`, `sid`, `org_id`, `role`, `permissions`) but **not** the user's email. MemberJunction
looks the user up by email server-side, so you must add it.

In the WorkOS dashboard, go to **Authentication → Sessions → JWT Template** (or
**JWT Templates**) and add:

```json
{
  "email": "{{user.email}}",
  "given_name": "{{user.first_name}}",
  "family_name": "{{user.last_name}}"
}
```

- `email` is what MJ matches against the `User.Email` column — **required**.
- `given_name` / `family_name` are optional but recommended: they let MJ
  [auto-provision new users](../MJServer/README.md) with proper names when
  `userHandling.autoCreateNewUsers` is enabled.
- WorkOS JWT Templates drop any claim whose value renders to `null`, so users missing a first/last
  name simply won't have those claims — the provider handles that gracefully (it falls back to
  splitting a `name` claim, or to the email).

> **Why not just read email from the ID token?** The browser SDK's `getUser()` always has the
> email (used for display), but the **server** only sees the bearer **access token**. The JWT
> Template is what puts the email into that access token.

## Step 4 — Configure the browser (MJExplorer)

Set `AUTH_TYPE` to `workos` and provide the WorkOS environment keys. These flow into the provider
through `AuthServicesModule.forRoot(environment)`:

```typescript
// environment.ts
export const environment = {
  // ...
  AUTH_TYPE: 'workos',
  WORKOS_CLIENTID: 'client_01H...',          // required
  WORKOS_REDIRECT_URI: window.location.origin, // optional; defaults to window.location.origin
  WORKOS_API_HOSTNAME: undefined,             // optional; only for custom domains / proxies
  WORKOS_DEV_MODE: false,                      // optional; localStorage session for local dev
};
```

| Env key | Required | Purpose |
|---|---|---|
| `AUTH_TYPE` | ✅ | Must be `'workos'` to select this provider |
| `WORKOS_CLIENTID` | ✅ | Your AuthKit Client ID |
| `WORKOS_REDIRECT_URI` | — | Redirect target after login (default: `window.location.origin`) |
| `WORKOS_API_HOSTNAME` | — | Override the WorkOS API hostname (custom domains / proxy) |
| `WORKOS_DEV_MODE` | — | AuthKit dev mode — localStorage-backed session for local development |

That's it. On startup, `MJWorkOSProvider.initialize()` constructs the AuthKit client (which also
processes any pending redirect callback), establishes the session, and the rest of MJ works
unchanged — `getIdToken()` hands the access token to the GraphQL client as a Bearer token.

---

## Token claims reference

A WorkOS AuthKit **access token** (what `getAccessToken()` returns and the server validates),
**after** adding the recommended JWT Template:

```jsonc
{
  "iss": "https://api.workos.com/user_management/client_01H...",
  "sub": "user_01HXYZ...",       // WorkOS user id → AuthUserInfo.userId
  "sid": "session_01H...",       // session id
  "jti": "01H...",
  "aud": "<environment default or resource indicator>",  // MJ enforces this
  "org_id": "org_01H...",        // present for organization-scoped sessions
  "role": "admin",               // organization-membership role
  "permissions": ["posts:read"], // role permissions
  "exp": 1717000000,
  "iat": 1716996400,

  // ── added by your JWT Template ──
  "email": "ada@example.com",    // REQUIRED for MJ user resolution
  "given_name": "Ada",
  "family_name": "Lovelace"
}
```

`WorkOSProvider.extractUserInfo()` maps this to MJ's `AuthUserInfo`:

| `AuthUserInfo` field | Source claim | Fallback |
|---|---|---|
| `email` | `email` | — (undefined if no JWT Template) |
| `firstName` | `given_name` | first word of `name` |
| `lastName` | `family_name` | second word of `name`, else first word |
| `fullName` | `name` | — |
| `preferredUsername` | `preferred_username` | `email` |
| `userId` | `sub` | — |

## How validation works under the hood

1. The browser sends `Authorization: Bearer <accessToken>` to the MJ GraphQL API.
2. MJServer decodes the token (without verifying) to read the `iss` claim.
3. `AuthProviderFactory.getByIssuer(iss)` resolves the `WorkOSProvider` instance (issuer matching
   is case-insensitive and trailing-slash tolerant).
4. `jwt.verify()` validates the RS256 signature against the JWKS at
   `https://api.workos.com/sso/jwks/<clientId>` (cached, with retry/backoff handled by
   `BaseAuthProvider`), and checks `iss` + `aud`.
5. `WorkOSProvider.extractUserInfo(payload)` produces the normalized identity.
6. MJServer resolves/creates the `User` record by **email** and builds the request context.

See [`@memberjunction/auth-providers` README](README.md) and
[`@memberjunction/server`](../MJServer/README.md) for the shared validation pipeline.

## Troubleshooting

| Symptom | Likely cause | Fix |
|---|---|---|
| Server logs "user not found" / login bounces | Access token has no `email` claim | [Add the JWT Template](#step-3--add-an-email-claim-jwt-template) |
| `jwt audience invalid` | `audience` config ≠ token `aud` | Decode a real token, copy its `aud` into `audience` ([Step 2](#getting-audience-right)) |
| `No authentication provider found for issuer` | `issuer` config doesn't match the token | Ensure `issuer` is `https://api.workos.com/user_management/<clientId>` with your real Client ID |
| `jwt expired` right after login | Clock skew or stale token | The browser SDK auto-refreshes; ensure server time is correct |
| Login redirect loops | Redirect URI not registered | Add your exact origin under WorkOS dashboard → Redirects |
| New users not auto-created | Missing `given_name`/`family_name` or `autoCreateNewUsers` off | Add name claims to the JWT Template; check `userHandling` config |

## Scope & non-goals

- **In scope:** WorkOS **AuthKit / User Management** (OIDC/JWT bearer login + validation). This is
  the same OIDC/JWT model every other MJ provider uses.
- **Out of scope (today):** WorkOS **SSO via SAML assertions** and **Directory Sync (SCIM)**
  user provisioning as distinct flows. AuthKit can itself broker SSO connections behind its hosted
  login, so SSO end-users still authenticate through the `workos` provider — but MJ does not parse
  raw SAML assertions or run SCIM provisioning. Those would be a separate, larger effort.

---

*Part of [`@memberjunction/auth-providers`](README.md) in the
[MemberJunction](https://github.com/MemberJunction/MJ) monorepo.*
