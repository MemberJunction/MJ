# Data Model: MCP Server OAuth Authentication

**Feature**: 601-mcp-oauth
**Date**: 2026-01-27

## Overview

This feature does not require database schema changes. OAuth authentication uses existing infrastructure:
- Existing `User` entity for user identity
- Existing `authProviders` configuration from MJServer
- New configuration schema for MCP Server-specific OAuth settings

---

## Configuration Schema

### MCPServerAuthSettings

New TypeScript interface added to `packages/AI/MCPServer/src/config.ts`:

```typescript
/**
 * OAuth authentication settings for MCP Server
 */
interface MCPServerAuthSettings {
  /**
   * Authentication mode:
   * - 'apiKey': API key authentication only (default, backward compatible)
   * - 'oauth': OAuth Bearer token authentication only
   * - 'both': Accept either API key or OAuth token
   * - 'none': No authentication (local development only)
   */
  mode: 'apiKey' | 'oauth' | 'both' | 'none';

  /**
   * Resource identifier for OAuth audience validation.
   *
   * This value MUST match the 'aud' claim in OAuth tokens.
   * Should be the MCP Server's public URL or a registered API identifier.
   *
   * Examples:
   * - "https://mcp.example.com"
   * - "api://mcp-server-prod"
   *
   * If not specified and autoResourceIdentifier is true,
   * defaults to "http://localhost:{port}"
   */
  resourceIdentifier?: string;

  /**
   * Automatically generate resourceIdentifier from server configuration.
   *
   * When true and resourceIdentifier is not set:
   * - Uses "http://localhost:{port}" where port is mcpServerSettings.port
   *
   * Set to false if you want to require explicit resourceIdentifier.
   *
   * @default true
   */
  autoResourceIdentifier?: boolean;
}
```

### Zod Schema

```typescript
const mcpServerAuthSettingsSchema = z.object({
  mode: z.enum(['apiKey', 'oauth', 'both', 'none']).default('apiKey'),
  resourceIdentifier: z.string().url().optional(),
  autoResourceIdentifier: z.boolean().default(true),
});
```

### Updated MCPServerSettings

```typescript
const mcpServerInfoSchema = z.object({
  port: z.coerce.number().optional().default(3100),

  // Existing tool configurations
  entityTools: z.array(mcpServerEntityToolInfoSchema).optional(),
  actionTools: z.array(mcpServerActionToolInfoSchema).optional(),
  agentTools: z.array(mcpServerAgentToolInfoSchema).optional(),
  queryTools: mcpServerQueryToolInfoSchema.optional(),
  promptTools: z.array(mcpServerPromptToolInfoSchema).optional(),
  communicationTools: mcpServerCommunicationToolInfoSchema.optional(),

  enableMCPServer: z.boolean().optional().default(false),
  systemApiKey: z.string().optional(),

  // NEW: OAuth authentication settings
  auth: mcpServerAuthSettingsSchema.optional(),
});
```

---

## Configuration Examples

### Default (API Key Only)

No configuration needed - backward compatible:

```javascript
// mj.config.cjs
module.exports = {
  mcpServerSettings: {
    port: 3100,
    enableMCPServer: true,
    // auth not specified = mode: 'apiKey' (default)
  }
};
```

### OAuth Only

```javascript
// mj.config.cjs
module.exports = {
  mcpServerSettings: {
    port: 3100,
    enableMCPServer: true,
    auth: {
      mode: 'oauth',
      resourceIdentifier: 'https://mcp.mycompany.com'
    }
  },
  // Auth providers (shared with MJExplorer)
  authProviders: [
    {
      name: 'azure-ad',
      type: 'msal',
      clientId: 'xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx',
      tenantId: 'xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx',
      issuer: 'https://login.microsoftonline.com/xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx/v2.0',
      audience: 'api://mcp-server',
      jwksUri: 'https://login.microsoftonline.com/xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx/discovery/v2.0/keys'
    }
  ]
};
```

### Both (Migration Period)

```javascript
// mj.config.cjs
module.exports = {
  mcpServerSettings: {
    port: 3100,
    enableMCPServer: true,
    auth: {
      mode: 'both',  // Accept API keys OR OAuth tokens
      resourceIdentifier: 'https://mcp.mycompany.com'
    }
  },
  authProviders: [/* ... */]
};
```

### None (Local Development)

```javascript
// mj.config.cjs
module.exports = {
  mcpServerSettings: {
    port: 3100,
    enableMCPServer: true,
    auth: {
      mode: 'none'  // No authentication - WARNING: development only!
    }
  }
};
```

---

## Runtime Types

### OAuthValidationResult

```typescript
/**
 * Result of OAuth token validation
 */
interface OAuthValidationResult {
  /** Whether the token is valid */
  valid: boolean;

  /** JWT payload if valid */
  payload?: jwt.JwtPayload;

  /** Extracted user information */
  userInfo?: {
    email?: string;
    firstName?: string;
    lastName?: string;
    fullName?: string;
    preferredUsername?: string;
  };

  /** Error details if invalid */
  error?: {
    code: 'invalid_token' | 'expired_token' | 'invalid_audience' | 'unknown_issuer';
    message: string;
  };
}
```

### AuthResult

```typescript
/**
 * Result of unified authentication (API key or OAuth)
 */
interface AuthResult {
  /** Whether authentication succeeded */
  authenticated: boolean;

  /** Authentication method used */
  method: 'apiKey' | 'oauth' | 'none';

  /** MemberJunction user (if authenticated) */
  user?: UserInfo;

  /** API key context (if method='apiKey') */
  apiKeyContext?: {
    apiKey: string;
    apiKeyId: string;
    apiKeyHash: string;
  };

  /** OAuth context (if method='oauth') */
  oauthContext?: {
    issuer: string;
    subject: string;
    email: string;
    expiresAt: Date;
  };

  /** Error details (if not authenticated) */
  error?: {
    status: 401 | 403 | 503;
    code: string;
    message: string;
  };
}
```

### MCPSessionContext (Extended)

```typescript
/**
 * Session context for MCP requests
 * Extended to support OAuth authentication
 */
interface MCPSessionContext {
  // Existing fields (required for API key auth)
  apiKey?: string;
  apiKeyId?: string;
  apiKeyHash?: string;

  // Required - always present after successful auth
  user: UserInfo;

  // NEW: Authentication method
  authMethod: 'apiKey' | 'oauth' | 'none';

  // NEW: OAuth-specific context (present when authMethod='oauth')
  oauth?: {
    issuer: string;
    subject: string;
    email: string;
    tokenExpiresAt: Date;
  };
}
```

---

## Protected Resource Metadata

### Schema (RFC 9728)

```typescript
/**
 * OAuth 2.0 Protected Resource Metadata
 * Per RFC 9728
 */
interface ProtectedResourceMetadata {
  /** Protected resource identifier - MUST be the resource's URL */
  resource: string;

  /** Array of authorization server issuer URLs */
  authorization_servers: string[];

  /** OAuth 2.0 scopes supported by this resource */
  scopes_supported?: string[];

  /** Token delivery methods supported */
  bearer_methods_supported?: ('header' | 'body' | 'query')[];

  /** Human-readable name for the resource */
  resource_name?: string;

  /** URL to resource documentation */
  resource_documentation?: string;

  /** JWK Set document URL (if resource validates tokens directly) */
  jwks_uri?: string;
}
```

### Example Response

```json
{
  "resource": "https://mcp.example.com",
  "authorization_servers": [
    "https://login.microsoftonline.com/tenant-id/v2.0"
  ],
  "scopes_supported": [
    "openid",
    "profile",
    "email"
  ],
  "bearer_methods_supported": ["header"],
  "resource_name": "MemberJunction MCP Server",
  "resource_documentation": "https://docs.memberjunction.org/mcp"
}
```

---

## Existing Entities Used

### User Entity

The OAuth flow maps tokens to existing MemberJunction users:

| Field | Usage |
|-------|-------|
| `Email` | Matched against OAuth `email` claim (case-insensitive) |
| `FirstName` | Populated from `given_name` claim (for new users if auto-create enabled) |
| `LastName` | Populated from `family_name` claim (for new users if auto-create enabled) |
| `IsActive` | Must be `true` for authentication to succeed |

### AuthProviderConfig (from @memberjunction/core)

Existing configuration interface used by MJServer:

```typescript
interface AuthProviderConfig {
  name: string;
  type: 'auth0' | 'msal' | 'okta' | 'cognito' | 'google';
  clientId?: string;
  clientSecret?: string;
  issuer?: string;
  audience?: string;
  jwksUri?: string;
  domain?: string;
  tenantId?: string;
  authority?: string;
  region?: string;
  userPoolId?: string;
  redirectUri?: string;
  scopes?: string[];
  [key: string]: unknown;
}
```

---

## Validation Rules

### Configuration Validation

| Rule | Check |
|------|-------|
| Mode is valid | Must be one of: 'apiKey', 'oauth', 'both', 'none' |
| ResourceIdentifier format | If specified, must be valid URL |
| OAuth mode requires providers | If mode is 'oauth' or 'both', `authProviders` must be configured |
| Provider config complete | Each provider must have required fields for its type |

### Runtime Validation

| Rule | Check |
|------|-------|
| Token signature | Verified using JWKS from provider |
| Token expiration | `exp` claim must be in future |
| Token audience | `aud` claim must include resourceIdentifier |
| Token issuer | `iss` claim must match configured provider |
| User exists | Email from token must match active MJ user |

---

## Proxy-Signed JWT Structure (Added 2026-01-28)

### JWT Claims

The OAuth proxy issues its own JWTs after successful upstream authentication and consent:

```typescript
/**
 * Claims structure for proxy-signed JWTs
 */
interface ProxyJWTClaims {
  /** Issuer - always "urn:mj:mcp-server" */
  iss: 'urn:mj:mcp-server';

  /** Subject - user's email address */
  sub: string;

  /** Audience - must match resourceIdentifier */
  aud: string;

  /** Issued at timestamp */
  iat: number;

  /** Expiration timestamp */
  exp: number;

  /** User's email (same as sub) */
  email: string;

  /** MemberJunction User ID (GUID) */
  mjUserId: string;

  /** Granted scopes (selected during consent) */
  scopes: string[];

  /** Upstream provider name for audit trail (from config, not hardcoded enum) */
  upstreamProvider: string;

  /** Upstream subject claim for audit trail */
  upstreamSub: string;
}
```

### JWT Signing Configuration

```typescript
/**
 * Extended auth settings for proxy JWT issuance
 */
interface MCPServerAuthSettings {
  mode: 'apiKey' | 'oauth' | 'both' | 'none';
  resourceIdentifier?: string;
  autoResourceIdentifier?: boolean;

  // NEW: Proxy JWT settings
  /** HS256 signing secret (32+ bytes, base64 encoded) */
  jwtSigningSecret?: string;

  /** JWT expiration time (default: '1h') */
  jwtExpiresIn?: string;

  /** JWT issuer claim (default: 'urn:mj:mcp-server') */
  jwtIssuer?: string;
}
```

---

## Scope-Related Types (Added 2026-01-28)

### APIScopeInfo

Runtime representation of a scope from the database:

```typescript
/**
 * Scope information loaded from __mj.APIScope entity
 */
interface APIScopeInfo {
  /** Unique identifier */
  ID: string;

  /** Scope name (e.g., "entity:read") */
  Name: string;

  /** Category for grouping (e.g., "Entities", "Actions") */
  Category: string;

  /** Human-readable description for consent screen */
  Description: string;

  /** Whether this scope is active */
  IsActive: boolean;
}
```

### ConsentRequest

State tracked during the consent flow:

```typescript
/**
 * Consent flow state (stored in-memory during OAuth flow)
 */
interface ConsentRequest {
  /** Unique request identifier */
  requestId: string;

  /** Timestamp when consent was requested */
  requestedAt: Date;

  /** User information from upstream token */
  user: {
    email: string;
    firstName?: string;
    lastName?: string;
    mjUserId: string;
  };

  /** Upstream provider name that authenticated the user (from config) */
  upstreamProvider: string;

  /** Upstream subject claim */
  upstreamSub: string;

  /** Available scopes user can select from */
  availableScopes: APIScopeInfo[];

  /** Client redirect URI to return to after consent */
  redirectUri: string;

  /** Original OAuth state parameter */
  state: string;

  /** Code verifier for PKCE */
  codeVerifier?: string;
}
```

### ConsentResponse

Result of user consent selection:

```typescript
/**
 * User's consent response
 */
interface ConsentResponse {
  /** Request ID this response is for */
  requestId: string;

  /** Scopes the user granted */
  grantedScopes: string[];

  /** Timestamp of consent */
  consentedAt: Date;
}
```

---

## Extended Session Context (Added 2026-01-28)

### MCPSessionContext (Updated)

```typescript
/**
 * Session context for MCP requests - extended for scope-based authorization
 */
interface MCPSessionContext {
  // Existing fields
  apiKey?: string;
  apiKeyId?: string;
  apiKeyHash?: string;
  user: UserInfo;
  authMethod: 'apiKey' | 'oauth' | 'none';
  oauth?: {
    issuer: string;
    subject: string;
    email: string;
    tokenExpiresAt: Date;
  };

  // NEW: Scope-based authorization
  /** Granted scopes for this session */
  scopes: string[];

  /** Full decoded JWT (for tools that need direct access) */
  jwt?: ProxyJWTClaims;
}
```

### AuthContext (Unified)

```typescript
/**
 * Unified authorization context for both OAuth and API keys
 */
interface AuthContext {
  /** Authentication method */
  type: 'oauth' | 'apikey' | 'none';

  /** MemberJunction User ID */
  userId: string;

  /** User's email address */
  email: string;

  /** Granted scopes (from JWT or APIKeyScope) */
  scopes: string[];

  /** Full user info */
  user: UserInfo;

  /** For OAuth: full JWT claims */
  jwt?: ProxyJWTClaims;

  /** For API key: key details */
  apiKeyContext?: {
    apiKeyId: string;
    apiKeyHash: string;
  };
}
```

---

## Scope Evaluation Helpers

### ScopeEvaluator

```typescript
/**
 * Helper for tools to evaluate scopes
 */
interface ScopeEvaluator {
  /**
   * Check if a specific scope is granted
   */
  hasScope(scope: string): boolean;

  /**
   * Check if any of the specified scopes is granted
   */
  hasAnyScope(scopes: string[]): boolean;

  /**
   * Check if all specified scopes are granted
   */
  hasAllScopes(scopes: string[]): boolean;

  /**
   * Get all granted scopes
   */
  getScopes(): string[];

  /**
   * Get scopes matching a pattern (e.g., "entity:*")
   */
  getScopesMatching(pattern: string): string[];
}
```

---

## State Diagram

```
┌──────────────────────────────────────────────────────────────────────────┐
│                         AUTH MODE STATE MACHINE                          │
└──────────────────────────────────────────────────────────────────────────┘

                              Server Start
                                   │
                                   ▼
                          ┌────────────────┐
                          │ Load Config    │
                          │ auth.mode      │
                          └───────┬────────┘
                                  │
           ┌──────────────────────┼──────────────────────┐
           │                      │                      │
           ▼                      ▼                      ▼
    ┌──────────────┐      ┌──────────────┐      ┌──────────────┐
    │ mode='none'  │      │ mode='apiKey'│      │ mode='oauth' │
    │              │      │  (default)   │      │ or 'both'    │
    └──────┬───────┘      └──────┬───────┘      └──────┬───────┘
           │                     │                     │
           │                     │                     ▼
           │                     │              ┌──────────────┐
           │                     │              │ Initialize   │
           │                     │              │ Auth         │
           │                     │              │ Providers    │
           │                     │              └──────┬───────┘
           │                     │                     │
           │                     │                     ▼
           │                     │              ┌──────────────┐
           │                     │              │ Has Providers?│
           │                     │              └──────┬───────┘
           │                     │                     │
           │                     │          Yes ──────┬────── No
           │                     │                    │         │
           │                     │                    ▼         ▼
           │                     │            ┌──────────┐ ┌──────────┐
           │                     │            │ OAuth    │ │ Fallback │
           │                     │            │ Ready    │ │ to apiKey│
           │                     │            └──────────┘ │ + Warning│
           │                     │                         └──────────┘
           │                     │
           ▼                     ▼
    ┌──────────────────────────────────────────────────────────────┐
    │                    SERVER READY                               │
    │  - Mount /.well-known/oauth-protected-resource (if OAuth)    │
    │  - Mount AuthGate middleware                                  │
    │  - Log active auth mode                                       │
    └──────────────────────────────────────────────────────────────┘
```

---

## OAuth Consent Flow State Diagram (Added 2026-01-28)

```
┌──────────────────────────────────────────────────────────────────────────┐
│                         OAUTH CONSENT FLOW                                │
└──────────────────────────────────────────────────────────────────────────┘

    Client (Claude Code)                    MCP OAuth Proxy                    Upstream IdP
           │                                      │                                  │
           │  1. GET /oauth/authorize             │                                  │
           │─────────────────────────────────────>│                                  │
           │                                      │                                  │
           │                                      │  2. Redirect to upstream         │
           │                                      │─────────────────────────────────>│
           │                                      │                                  │
           │                                      │                                  │ User
           │                                      │                                  │ authenticates
           │                                      │                                  │
           │                                      │  3. Callback with code           │
           │                                      │<─────────────────────────────────│
           │                                      │                                  │
           │                                      │  4. Exchange code for tokens     │
           │                                      │─────────────────────────────────>│
           │                                      │                                  │
           │                                      │  5. Return tokens                │
           │                                      │<─────────────────────────────────│
           │                                      │                                  │
           │                                      │  6. Validate user, lookup MJ ID  │
           │                                      │  7. Load available scopes        │
           │                                      │  8. Store ConsentRequest         │
           │                                      │                                  │
           │  9. Render consent screen            │                                  │
           │<─────────────────────────────────────│                                  │
           │                                      │                                  │
           │  10. User selects scopes, submits    │                                  │
           │─────────────────────────────────────>│                                  │
           │                                      │                                  │
           │                                      │  11. Issue proxy JWT with scopes │
           │                                      │  12. Generate auth code          │
           │                                      │                                  │
           │  13. Redirect with code              │                                  │
           │<─────────────────────────────────────│                                  │
           │                                      │                                  │
           │  14. POST /oauth/token (code)        │                                  │
           │─────────────────────────────────────>│                                  │
           │                                      │                                  │
           │  15. Return proxy JWT                │                                  │
           │<─────────────────────────────────────│                                  │
           │                                      │                                  │
```
