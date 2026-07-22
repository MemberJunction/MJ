# @memberjunction/auth-providers

Authentication provider interfaces, base classes, and ready-made implementations for validating JWTs from any OAuth 2.0 / OIDC compliant identity provider in MemberJunction.

This package gives the MJ server (and any other Node.js consumer) a uniform, pluggable way to:

- Resolve a JWT's signing key from a remote JWKS endpoint
- Verify the issuer and audience of incoming tokens
- Extract a normalized `AuthUserInfo` from provider-specific claim shapes
- Register additional providers at runtime via the MJ class-factory system

It ships with first-class support for **Auth0**, **Microsoft Entra ID / MSAL**, **Okta**, **AWS Cognito**, **Google Identity Platform**, and **WorkOS (AuthKit)**, and is the extension point used to plug custom providers into [`@memberjunction/server`](../MJServer/README.md).

> **Integrating WorkOS?** See the dedicated end-to-end guide: **[WORKOS.md](WORKOS.md)** — it covers the browser + server setup and the two WorkOS-specific gotchas (the required `email` JWT Template and matching the `aud` claim).

## When to use this package

Use `@memberjunction/auth-providers` when you are:

- Running an MJ GraphQL server and need to validate user JWTs (this is wired up automatically by [`@memberjunction/server`](../MJServer/README.md))
- Building a custom Node.js service that needs to validate tokens issued for an MJ tenant
- Adding support for a new identity provider that is not in the built-in list above
- Implementing an MCP server or other backend that participates in MJ's auth flow (see [`@memberjunction/ai-mcp-server`](../AI/MCPServer))

You generally do **not** need this package directly in browser / Angular code — the front-end auth flow is handled by provider SDKs (MSAL.js, Auth0 SPA SDK, etc.) and the resulting access token is sent to MJ APIs, where this package validates it server-side.

## Installation

```bash
npm install @memberjunction/auth-providers
```

This package is a Node.js / server-side package. It depends on:

- [`@memberjunction/core`](../MJCore/readme.md) — provides `AuthProviderConfig` and `AuthUserInfo` types
- [`@memberjunction/global`](../MJGlobal/README.md) — provides `BaseSingleton`, `MJGlobal`, and `@RegisterClass`
- `jsonwebtoken` — JWT primitives
- `jwks-rsa` — JWKS key retrieval with caching
- `graphql` — used by `TokenExpiredError` to surface a typed GraphQL error

## Architecture

```
┌──────────────────────────────────────────────────────────────────┐
│                         @memberjunction/server                    │
│                                                                  │
│   incoming request ──▶ JWT extracted ──▶ getSigningKeys(issuer)  │
│                                              │                   │
└──────────────────────────────────────────────┼───────────────────┘
                                               ▼
┌──────────────────────────────────────────────────────────────────┐
│                  @memberjunction/auth-providers                   │
│                                                                  │
│   AuthProviderFactory (singleton)                                │
│        │                                                         │
│        ├── getByIssuer(iss) ──▶ IAuthProvider                    │
│        │                            │                            │
│        │                            ├── getSigningKey()          │
│        │                            │     (jwks-rsa + retry)     │
│        │                            │                            │
│        │                            └── extractUserInfo()        │
│        │                                                         │
│        └── createProvider(config)                                │
│                  │                                               │
│                  ▼                                               │
│           MJGlobal.ClassFactory                                  │
│           ├─ @RegisterClass(BaseAuthProvider, 'auth0')           │
│           ├─ @RegisterClass(BaseAuthProvider, 'msal')            │
│           ├─ @RegisterClass(BaseAuthProvider, 'okta')            │
│           ├─ @RegisterClass(BaseAuthProvider, 'cognito')         │
│           ├─ @RegisterClass(BaseAuthProvider, 'google')          │
│           ├─ @RegisterClass(BaseAuthProvider, 'workos')          │
│           └─ @RegisterClass(BaseAuthProvider, 'your-custom')     │
└──────────────────────────────────────────────────────────────────┘
```

### Key pieces

| Export                    | Role                                                                       |
| ------------------------- | -------------------------------------------------------------------------- |
| `IAuthProvider`           | Contract every provider must satisfy                                       |
| `BaseAuthProvider`        | Abstract base class — handles JWKS, retries, issuer matching               |
| `AuthProviderFactory`     | Singleton registry + factory; resolves providers by issuer or name         |
| `TokenExpiredError`       | `GraphQLError` subclass with `JWT_EXPIRED` code and `expiryDate` extension |
| `AuthProviderConfig`      | Re-exported config shape (defined in `@memberjunction/core`)               |
| `AuthUserInfo`            | Re-exported normalized user shape (defined in `@memberjunction/core`)      |

`AuthProviderFactory` extends [`BaseSingleton<T>`](../MJGlobal/README.md) — the global object store guarantees a single instance even if the bundler duplicates the module across execution paths.

## Built-in providers

Each built-in provider is registered with the MJ class factory under a lowercase type key. Set `type` in your config to one of these values to instantiate the matching provider.

| Type key   | Class             | Required config (in addition to the base set)            |
| ---------- | ----------------- | -------------------------------------------------------- |
| `auth0`    | `Auth0Provider`   | `clientId`, `domain`                                     |
| `msal`     | `MSALProvider`    | `clientId`, `tenantId`                                   |
| `okta`     | `OktaProvider`    | `clientId`, `domain`                                     |
| `cognito`  | `CognitoProvider` | `clientId`, `region`, `userPoolId`                       |
| `google`   | `GoogleProvider`  | `clientId`                                               |
| `workos`   | `WorkOSProvider`  | `clientId` (see [WORKOS.md](WORKOS.md) for the required `email` JWT Template + `aud`) |

Every provider also requires the base fields: `name`, `type`, `issuer`, `audience`, `jwksUri`. See [`AuthProviderConfig`](../MJCore/src/generic/authTypes.ts) for the full shape.

## Configuration

In an MJ server, providers are configured under `authProviders` in `mj.config.cjs`. Multiple providers can be registered concurrently — the factory dispatches incoming tokens to the right one based on the `iss` claim.

```javascript
// mj.config.cjs
module.exports = {
  authProviders: [
    {
      name: 'corporate-azure-ad',
      type: 'msal',
      clientId: process.env.AZURE_CLIENT_ID,
      tenantId: process.env.AZURE_TENANT_ID,
      issuer: `https://login.microsoftonline.com/${process.env.AZURE_TENANT_ID}/v2.0`,
      audience: process.env.AZURE_CLIENT_ID,
      jwksUri: `https://login.microsoftonline.com/${process.env.AZURE_TENANT_ID}/discovery/v2.0/keys`,
    },
    {
      name: 'customer-auth0',
      type: 'auth0',
      clientId: process.env.AUTH0_CLIENT_ID,
      domain: 'tenant.auth0.com',
      issuer: 'https://tenant.auth0.com/',
      audience: 'https://api.example.com',
      jwksUri: 'https://tenant.auth0.com/.well-known/jwks.json',
    },
    {
      name: 'workos-prod',
      type: 'workos',
      clientId: process.env.WORKOS_CLIENT_ID, // client_01H...
      issuer: `https://api.workos.com/user_management/${process.env.WORKOS_CLIENT_ID}`,
      jwksUri: `https://api.workos.com/sso/jwks/${process.env.WORKOS_CLIENT_ID}`,
      audience: process.env.WORKOS_CLIENT_ID, // must match the token's `aud` — see WORKOS.md
    },
    // ...add more providers here
  ],
};
```

> **WorkOS needs two extra steps** beyond this config — an `email` JWT Template (its access tokens
> omit email, which MJ keys users on) and matching the `aud` claim. The full walkthrough is in
> **[WORKOS.md](WORKOS.md)**.

> **Multiple audiences on the same issuer.** When two MJ apps share an Auth0 domain but use different client IDs, register both as separate entries — `AuthProviderFactory.getAllByIssuer()` returns every match so the validator can try each audience.

## Usage

### In MJServer (the typical case)

You do not call this package directly when using [`@memberjunction/server`](../MJServer/README.md). The server runs `initializeAuthProviders()` at startup, which reads `authProviders` from your config and registers each one with the factory. The GraphQL middleware then uses the factory automatically.

### Direct programmatic use

```ts
import {
  AuthProviderFactory,
  TokenExpiredError,
} from '@memberjunction/auth-providers';
import jwt, { JwtHeader, SigningKeyCallback } from 'jsonwebtoken';

// One-time setup at app boot
const factory = AuthProviderFactory.Instance;

const provider = AuthProviderFactory.createProvider({
  name: 'main-auth0',
  type: 'auth0',
  clientId: process.env.AUTH0_CLIENT_ID!,
  domain: 'tenant.auth0.com',
  issuer: 'https://tenant.auth0.com/',
  audience: 'https://api.example.com',
  jwksUri: 'https://tenant.auth0.com/.well-known/jwks.json',
});
factory.register(provider);

// Per-request token validation
function validate(token: string) {
  return new Promise((resolve, reject) => {
    // First decode (without verifying) to read the issuer claim
    const decoded = jwt.decode(token, { complete: true });
    const issuer = decoded?.payload && typeof decoded.payload === 'object'
      ? (decoded.payload as jwt.JwtPayload).iss
      : undefined;
    if (!issuer) return reject(new Error('Token missing iss claim'));

    const matched = factory.getByIssuer(issuer);
    if (!matched) return reject(new Error(`Unknown issuer: ${issuer}`));

    jwt.verify(
      token,
      (header: JwtHeader, cb: SigningKeyCallback) => matched.getSigningKey(header, cb),
      { issuer: matched.issuer, audience: matched.audience },
      (err, payload) => {
        if (err?.name === 'TokenExpiredError') {
          return reject(new TokenExpiredError(new Date((err as jwt.TokenExpiredError).expiredAt)));
        }
        if (err || !payload || typeof payload !== 'object') return reject(err);
        resolve({
          payload,
          user: matched.extractUserInfo(payload as jwt.JwtPayload),
        });
      },
    );
  });
}
```

### Building a custom provider

Custom providers extend `BaseAuthProvider` and register themselves with the MJ class factory. Once registered, they're instantiable by `type` like any built-in provider.

```ts
import { JwtPayload } from 'jsonwebtoken';
import { RegisterClass } from '@memberjunction/global';
import { AuthProviderConfig, AuthUserInfo } from '@memberjunction/core';
import { BaseAuthProvider } from '@memberjunction/auth-providers';

@RegisterClass(BaseAuthProvider, 'keycloak')
export class KeycloakProvider extends BaseAuthProvider {
  constructor(config: AuthProviderConfig) {
    super(config);
  }

  extractUserInfo(payload: JwtPayload): AuthUserInfo {
    return {
      email: payload.email as string | undefined,
      firstName: payload.given_name as string | undefined,
      lastName: payload.family_name as string | undefined,
      fullName: payload.name as string | undefined,
      preferredUsername: payload.preferred_username as string | undefined,
      roles: (payload.realm_access as { roles?: string[] } | undefined)?.roles,
    };
  }

  validateConfig(): boolean {
    return super.validateConfig() && !!this.config.clientId;
  }
}

// Then in mj.config.cjs use type: 'keycloak'
```

> **Important:** because the provider is loaded via class-factory metadata and not by direct reference, your bundler may tree-shake it out. Make sure the file containing the `@RegisterClass` decorator is imported (directly or transitively) before `AuthProviderFactory.createProvider()` runs. The built-in providers do this from [`AuthProviderFactory.ts`](src/AuthProviderFactory.ts); follow the same pattern in your own entry point or a manifest. See the class-registration manifest discussion in the [root project guide](../../CLAUDE.md) for background.

## API reference

### `IAuthProvider`

```ts
interface IAuthProvider {
  name: string;
  issuer: string;
  audience: string;
  jwksUri: string;
  clientId?: string;
  validateConfig(): boolean;
  getSigningKey(header: JwtHeader, callback: SigningKeyCallback): void;
  extractUserInfo(payload: JwtPayload): AuthUserInfo;
  matchesIssuer(issuer: string): boolean;
}
```

### `BaseAuthProvider`

Abstract class that implements all of `IAuthProvider` except `extractUserInfo`. It also handles:

- A keep-alive HTTP(S) agent for the JWKS client (50 max sockets, 60s timeout)
- JWKS response caching (5 entries, 10 minute TTL)
- Up to **3 retries with exponential backoff** for JWKS fetches on common transient errors (`socket hang up`, `ECONNRESET`, `ETIMEDOUT`, `ENOTFOUND`, `EAI_AGAIN`)
- Case-insensitive, trailing-slash-tolerant issuer matching

Subclasses must implement `extractUserInfo(payload)` and may override `validateConfig()` to enforce provider-specific required fields.

### `AuthProviderFactory`

Singleton registry/factory. All instance methods are on `AuthProviderFactory.Instance`; `createProvider`, `getRegisteredProviderTypes`, and `isProviderTypeRegistered` are static helpers.

| Method                                     | Purpose                                                              |
| ------------------------------------------ | -------------------------------------------------------------------- |
| `static createProvider(config)`            | Creates a provider via `MJGlobal.ClassFactory` from `config.type`    |
| `register(provider)`                       | Validates and adds a provider; clears issuer caches                  |
| `getByIssuer(iss)`                         | Returns the first provider whose issuer matches (cached)             |
| `getAllByIssuer(iss)`                      | Returns **all** providers for an issuer (multi-app / multi-audience) |
| `getByName(name)`                          | Lookup by configured `name`                                          |
| `getAllProviders()`                        | All registered providers                                             |
| `hasProviders()`                           | Quick boolean check                                                  |
| `clear()`                                  | Drop all providers and caches (used in tests)                        |
| `static getRegisteredProviderTypes()`      | All `type` keys registered with the class factory                    |
| `static isProviderTypeRegistered(type)`    | Whether a given `type` key resolves to a registration                |

### `TokenExpiredError`

```ts
new TokenExpiredError(expiryDate: Date, message?: string)
```

A `GraphQLError` with `extensions.code = 'JWT_EXPIRED'` and `extensions.expiryDate` set to the ISO string of the expiry. Throw this from GraphQL resolvers when you detect an expired token so clients can branch on the error code and trigger a silent refresh.

## Related packages

- [`@memberjunction/core`](../MJCore/readme.md) — defines `AuthProviderConfig`, `AuthUserInfo`, `AuthTokenInfo`, `AuthJwtPayload` and the `AUTH_PROVIDER_TYPES` constants
- [`@memberjunction/global`](../MJGlobal/README.md) — provides `BaseSingleton`, `@RegisterClass`, and the `MJGlobal.ClassFactory` that drives provider instantiation
- [`@memberjunction/server`](../MJServer/README.md) — primary consumer; wires this package into the GraphQL request pipeline
- [`@memberjunction/ai-mcp-server`](../AI/MCPServer) — uses this package to validate tokens on MCP transport endpoints (see [MCP OAuth spec](../../specs/601-mcp-oauth/spec.md))
- [`@memberjunction/api-keys-base`](../APIKeys/Base) and [`@memberjunction/api-keys-engine`](../APIKeys/Engine) — complementary auth path for non-interactive (machine-to-machine) callers

## Project guidelines

- Class registration & tree-shaking caveats: see the manifest section of the [root project guide](../../CLAUDE.md)
- Singleton best practices: see the `BaseSingleton` rules in the [root project guide](../../CLAUDE.md)

## License

ISC — part of the [MemberJunction](https://github.com/MemberJunction/MJ) monorepo.
