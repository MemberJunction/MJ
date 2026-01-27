# Research: MCP Server OAuth Authentication

**Feature**: 601-mcp-oauth
**Date**: 2026-01-27
**Status**: Complete

## Executive Summary

This document captures research findings for implementing OAuth 2.1 authorization in the MemberJunction MCP Server. The key insight is that **MJServer already has a complete OAuth provider infrastructure** that can be reused, making implementation straightforward.

---

## 1. MCP Authorization Specification

### Requirements

The [MCP Authorization Specification](https://modelcontextprotocol.io/specification/draft/basic/authorization) mandates:

1. **MCP servers act as OAuth 2.1 resource servers** - they validate tokens but do not issue them
2. **MUST implement RFC 9728** (OAuth 2.0 Protected Resource Metadata)
3. **MUST include `resource_metadata`** parameter in WWW-Authenticate headers
4. **MUST validate audience claims** - tokens must be issued for this specific MCP server

### WWW-Authenticate Header Format

Per RFC 9728 Section 5.1:

```http
WWW-Authenticate: Bearer resource_metadata="https://mcp.example.com/.well-known/oauth-protected-resource"
```

For 403 responses with scope issues:
```http
WWW-Authenticate: Bearer error="insufficient_scope",
                         resource_metadata="https://mcp.example.com/.well-known/oauth-protected-resource",
                         error_description="Additional permissions required"
```

### Protected Resource Metadata

Endpoint: `/.well-known/oauth-protected-resource`

Required fields:
- `resource`: The protected resource identifier (this server's URL)
- `authorization_servers`: Array of authorization server issuer URLs

Recommended fields:
- `scopes_supported`: Array of OAuth 2.0 scopes
- `bearer_methods_supported`: Should be `["header"]`
- `resource_name`: Human-readable name
- `resource_documentation`: Link to docs

---

## 2. MJServer Auth Provider Infrastructure

### Available Providers

Location: `packages/MJServer/src/auth/providers/`

| Provider | Registration Key | Required Config |
|----------|------------------|-----------------|
| Auth0 | `auth0` | clientId, domain, issuer, audience, jwksUri |
| MSAL (Azure AD) | `msal` | clientId, tenantId, issuer, audience, jwksUri |
| Okta | `okta` | clientId, domain, issuer, audience, jwksUri |
| Cognito | `cognito` | clientId, region, userPoolId, issuer, audience, jwksUri |
| Google | `google` | clientId, issuer, audience, jwksUri |

### Key Classes and Functions

**AuthProviderFactory** (`packages/MJServer/src/auth/AuthProviderFactory.ts`)
- Singleton that manages all registered auth providers
- `getInstance()` - Get singleton instance
- `getByIssuer(issuer)` - Find provider by token's `iss` claim
- `getAllProviders()` - Get all registered providers
- `hasProviders()` - Check if any providers configured

**getSigningKeys** (`packages/MJServer/src/auth/index.ts`)
```typescript
export const getSigningKeys = (issuer: string) =>
  (header: JwtHeader, cb: SigningKeyCallback): void
```
- Returns a function compatible with `jsonwebtoken.verify()`
- Includes retry logic with exponential backoff
- Uses JWKS caching (5 entries, 10-minute TTL)

**extractUserInfoFromPayload** (`packages/MJServer/src/auth/index.ts`)
```typescript
export const extractUserInfoFromPayload = (payload: JwtPayload): {
  email?: string;
  firstName?: string;
  lastName?: string;
  fullName?: string;
  preferredUsername?: string;
}
```
- Provider-specific claim extraction
- Handles different claim formats (Azure AD, Cognito prefixes, etc.)

**verifyUserRecord** (`packages/MJServer/src/auth/index.ts`)
```typescript
export const verifyUserRecord = async (
  email?: string,
  firstName?: string,
  lastName?: string,
  requestDomain?: string,
  dataSource?: sql.ConnectionPool,
  attemptCacheUpdateIfNeeded?: boolean
): Promise<UserInfo | undefined>
```
- Maps OAuth identity to MemberJunction User entity
- Supports auto-provisioning if configured
- Uses UserCache for performance

### Reuse Strategy

Instead of duplicating token validation logic, MCP Server will:

1. **Initialize auth providers** - Call `initializeAuthProviders()` from MJServer
2. **Validate tokens** - Use `getSigningKeys(issuer)` with `jsonwebtoken.verify()`
3. **Extract user info** - Use `extractUserInfoFromPayload(payload)`
4. **Resolve MJ user** - Use `verifyUserRecord(email, firstName, lastName)`

This approach ensures:
- All 5 providers work automatically
- JWKS caching is shared
- Retry logic is reused
- Configuration is unified with MJExplorer

---

## 3. Existing MCP Server Auth Flow

### Current Implementation

Location: `packages/AI/MCPServer/src/Server.ts`

**API Key Extraction** (lines 122-145):
```typescript
function extractAPIKeyFromRequest(req: IncomingMessage): string | undefined {
  // Checks: x-api-key, x-mj-api-key, Authorization: Bearer, query params
}
```

**Authentication** (lines 150-200):
```typescript
async function authenticateRequest(req, dataSource, systemUser): MCPSessionContext {
  const apiKey = extractAPIKeyFromRequest(req);
  // Validates via GetAPIKeyEngine().ValidateAPIKey()
  // Returns { apiKey, apiKeyId, apiKeyHash, user }
}
```

**Session Context Interface**:
```typescript
interface MCPSessionContext {
  apiKey: string;
  apiKeyId: string;
  apiKeyHash: string;
  user: UserInfo;
}
```

### Integration Points

The new OAuth flow needs to:
1. Intercept requests **before** `authenticateRequest()`
2. Check for Bearer token (not API key format)
3. Validate via MJServer providers
4. Create compatible `MCPSessionContext`
5. Fall through to existing API key flow if no Bearer token

---

## 4. Configuration Design

### Existing MCP Server Config

Location: `packages/AI/MCPServer/src/config.ts`

```typescript
const mcpServerInfoSchema = z.object({
  port: z.coerce.number().optional().default(3100),
  entityTools: z.array(mcpServerEntityToolInfoSchema).optional(),
  actionTools: z.array(mcpServerActionToolInfoSchema).optional(),
  // ... tool configs
  enableMCPServer: z.boolean().optional().default(false),
  systemApiKey: z.string().optional(),
});
```

### Proposed Auth Config Addition

```typescript
const mcpServerAuthSettingsSchema = z.object({
  mode: z.enum(['apiKey', 'oauth', 'both', 'none']).default('apiKey'),
  resourceIdentifier: z.string().optional(),
  autoResourceIdentifier: z.boolean().default(true),
});

const mcpServerInfoSchema = z.object({
  // ... existing fields
  auth: mcpServerAuthSettingsSchema.optional(),
});
```

### Config Example

```javascript
// mj.config.cjs
module.exports = {
  // ... existing config
  mcpServerSettings: {
    port: 3100,
    enableMCPServer: true,
    auth: {
      mode: 'both',  // Support API keys AND OAuth
      resourceIdentifier: 'https://mcp.mycompany.com'
    },
    // ... tool configs
  },
  // Auth providers (shared with MJExplorer)
  authProviders: [
    {
      name: 'azure-ad',
      type: 'msal',
      clientId: 'your-client-id',
      tenantId: 'your-tenant-id',
      issuer: 'https://login.microsoftonline.com/{tenant}/v2.0',
      audience: 'api://your-app-id',
      jwksUri: 'https://login.microsoftonline.com/{tenant}/discovery/v2.0/keys'
    }
  ]
};
```

---

## 5. Token Validation Flow

### JWT Verification

Using `jsonwebtoken` (already in dependencies):

```typescript
import jwt from 'jsonwebtoken';
import { getSigningKeys, extractUserInfoFromPayload } from '@memberjunction/server';

async function validateBearerToken(token: string, resourceIdentifier: string): Promise<{
  payload: jwt.JwtPayload;
  userInfo: AuthUserInfo;
}> {
  // 1. Decode without verification to get issuer
  const decoded = jwt.decode(token, { complete: true });
  if (!decoded || typeof decoded.payload === 'string') {
    throw new Error('Invalid token format');
  }

  const issuer = decoded.payload.iss;
  if (!issuer) {
    throw new Error('Token missing issuer');
  }

  // 2. Verify signature using MJServer infrastructure
  const payload = await new Promise<jwt.JwtPayload>((resolve, reject) => {
    jwt.verify(token, getSigningKeys(issuer), {
      issuer,
      audience: resourceIdentifier,  // Validate audience
    }, (err, decoded) => {
      if (err) reject(err);
      else resolve(decoded as jwt.JwtPayload);
    });
  });

  // 3. Extract user info using provider-specific logic
  const userInfo = extractUserInfoFromPayload(payload);

  return { payload, userInfo };
}
```

### Audience Validation

Per RFC 8707 (Resource Indicators), the MCP Server MUST validate that tokens were issued for it:

- Token's `aud` claim must include the MCP Server's `resourceIdentifier`
- If `resourceIdentifier` not configured, use server's URL (e.g., `http://localhost:3100`)

---

## 6. User Mapping

### OAuth Identity to MJ User

The OAuth token provides:
- `email` (or `preferred_username` as fallback)
- `given_name`, `family_name`
- `name` (full name)

MemberJunction requires:
- User record in `User` entity
- Email must match (case-insensitive)

### Mapping Strategy

```typescript
import { verifyUserRecord } from '@memberjunction/server';

async function resolveUser(
  userInfo: { email?: string; firstName?: string; lastName?: string },
  dataSource: sql.ConnectionPool
): Promise<UserInfo> {
  const user = await verifyUserRecord(
    userInfo.email,
    userInfo.firstName,
    userInfo.lastName,
    undefined,  // requestDomain - not needed for MCP
    dataSource
  );

  if (!user) {
    throw new UnauthorizedError('User not found in MemberJunction');
  }

  if (!user.IsActive) {
    throw new UnauthorizedError('User account is inactive');
  }

  return user;
}
```

---

## 7. Error Responses

### 401 Unauthorized

When authentication is required but no valid credentials provided:

```typescript
res.status(401)
   .set('WWW-Authenticate', `Bearer resource_metadata="${metadataUrl}"`)
   .json({ error: 'unauthorized', message: 'Authentication required' });
```

### 403 Forbidden

When token is valid but user not in MJ or inactive:

```typescript
res.status(403)
   .set('WWW-Authenticate', `Bearer error="insufficient_scope", resource_metadata="${metadataUrl}", error_description="User must be provisioned in MemberJunction"`)
   .json({ error: 'forbidden', message: 'User not found in MemberJunction' });
```

### 503 Service Unavailable

When OAuth provider is unreachable:

```typescript
res.status(503)
   .set('Retry-After', '30')
   .json({ error: 'service_unavailable', message: 'Authentication service temporarily unavailable' });
```

---

## 8. Dependencies

### Existing (No New Dependencies)

- `jsonwebtoken` - Already used by MJServer
- `express` - Already used by MCP Server
- `@memberjunction/server` - Need to add as dependency to MCPServer package.json

### Package.json Update

```json
{
  "dependencies": {
    "@memberjunction/server": "^2.x.x"
  }
}
```

Note: MCP Server already imports from `@memberjunction/server` for `DEFAULT_SERVER_CONFIG`, so this dependency exists but may need to be used more directly.

---

## 9. Decisions Summary

| Decision | Choice | Rationale |
|----------|--------|-----------|
| Token validation | Reuse MJServer | 5 providers, caching, retry logic |
| New dependency | `@memberjunction/server` (direct) | Already indirect dependency |
| Config location | mcpServerSettings.auth | Keeps all MCP config together |
| Default mode | `apiKey` | Backward compatibility |
| Resource identifier | Auto-generate from URL | Reduces config burden |
| User provisioning | Require existing user | Per spec, out of scope |
| Scope validation | Not implemented | Future enhancement per spec |

---

## 10. Alternatives Considered

### 1. Build Own Token Validation

**Rejected**: Would duplicate MJServer's JWKS handling, retry logic, and provider-specific extraction.

### 2. Use express-oauth2-jwt-bearer

**Rejected**: Would need separate configuration from MJServer. Doesn't reuse existing provider infrastructure.

### 3. Token Introspection Endpoint

**Rejected**: MJ uses JWTs with JWKS, not opaque tokens. Introspection adds latency and dependency.

### 4. Custom Auth Server

**Rejected**: Per spec, MCP Server is a resource server only. External IdP is preferred.
