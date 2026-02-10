# Research: MCP OAuth with Dynamic Client Registration

**Feature**: 001-mcp-oauth-dcr
**Date**: 2026-01-29
**Purpose**: Resolve technical unknowns and establish best practices for OAuth 2.1 implementation

## Research Questions

### 1. RFC 8414 - OAuth 2.0 Authorization Server Metadata

**Question**: How should we discover and cache authorization server metadata?

**Decision**: Fetch metadata from `{issuer}/.well-known/oauth-authorization-server` with fallback to `{issuer}/.well-known/openid-configuration` for OIDC-compliant servers.

**Rationale**:
- RFC 8414 defines the standard discovery endpoint for OAuth 2.0
- Many servers (Auth0, Okta, Azure AD) also support OIDC discovery
- Fallback ensures maximum compatibility

**Key Metadata Fields to Extract**:
```typescript
interface AuthServerMetadata {
  issuer: string;                           // REQUIRED
  authorization_endpoint: string;           // REQUIRED
  token_endpoint: string;                   // REQUIRED
  registration_endpoint?: string;           // OPTIONAL - DCR support
  revocation_endpoint?: string;             // OPTIONAL
  introspection_endpoint?: string;          // OPTIONAL
  jwks_uri?: string;                        // OPTIONAL
  scopes_supported?: string[];              // RECOMMENDED
  response_types_supported: string[];       // REQUIRED
  grant_types_supported?: string[];         // OPTIONAL (defaults: authorization_code, implicit)
  token_endpoint_auth_methods_supported?: string[];  // OPTIONAL
  code_challenge_methods_supported?: string[];       // OPTIONAL (for PKCE)
}
```

**Caching Strategy**:
- Default TTL: 24 hours (configurable per MCP server)
- Cache key: issuer URL
- Invalidate on fetch failure after retry
- Store in `MJ: O Auth Auth Server Metadata Cache` entity

**Alternatives Considered**:
- No caching (rejected: too many requests)
- In-memory only (rejected: lost on server restart)
- Longer TTL (rejected: metadata can change)

---

### 2. RFC 7591 - Dynamic Client Registration

**Question**: What client metadata should we include in DCR requests?

**Decision**: Include minimal required metadata with MemberJunction-specific identifiers.

**Rationale**:
- Fewer fields = fewer potential rejection reasons
- Different auth servers have different requirements
- We can always re-register if rejected

**DCR Request Payload**:
```typescript
interface DCRRequest {
  client_name: string;                      // "MemberJunction MCP Client - {ServerName}"
  redirect_uris: string[];                  // ["{MJAPI_PUBLIC_URL}/api/v1/oauth/callback"]
  grant_types: string[];                    // ["authorization_code", "refresh_token"]
  response_types: string[];                 // ["code"]
  token_endpoint_auth_method: string;       // "client_secret_basic" or "client_secret_post"
  scope?: string;                           // Requested scopes from MCP server config
}
```

**DCR Response Handling**:
- Store `client_id`, `client_secret`, `client_id_issued_at`, `client_secret_expires_at`
- If `client_secret_expires_at` provided, track and re-register before expiry
- Handle `client_id` only responses (public clients) gracefully

**Error Handling**:
| Error                        | Action                                             |
| ---------------------------- | -------------------------------------------------- |
| `invalid_redirect_uri`       | Log error, prompt admin to verify MJAPI_PUBLIC_URL |
| `invalid_client_metadata`    | Log fields, fall back to manual client config      |
| `registration_not_supported` | Fall back to manual client config                  |
| Network error                | Retry with exponential backoff (3 attempts)        |

**Alternatives Considered**:
- Shared client per MCP server (rejected: violates per-user isolation)
- Pre-registration requirement (rejected: increases admin burden)

---

### 3. PKCE Implementation (RFC 7636)

**Question**: How should we generate and manage PKCE challenges?

**Decision**: Generate 43-128 character code_verifier using cryptographically secure random bytes, use S256 challenge method exclusively.

**Rationale**:
- S256 is required by OAuth 2.1 (plain method is deprecated)
- 43-128 characters is the RFC-specified range
- 64 characters (48 bytes base64url encoded) provides good entropy

**Implementation**:
```typescript
// Generate code_verifier: 48 random bytes → 64 character base64url string
const codeVerifier = base64url(crypto.randomBytes(48));

// Generate code_challenge: SHA256(code_verifier) → base64url
const codeChallenge = base64url(crypto.createHash('sha256').update(codeVerifier).digest());
```

**Storage**: Store `code_verifier` in `MJ: O Auth Authorization States` entity, encrypted at rest.

**Alternatives Considered**:
- Plain challenge method (rejected: deprecated in OAuth 2.1)
- Shorter verifier (rejected: less entropy)
- In-memory storage (rejected: lost on server restart during auth flow)

---

### 4. Token Storage Strategy

**Question**: How should OAuth tokens be stored securely?

**Decision**: Create new credential type `OAuth2 Authorization Code` with encrypted Values JSON blob containing all token data.

**Rationale**:
- Leverages existing CredentialEngine encryption
- Maintains audit trail via CredentialEngine logging
- Consistent with existing MJ patterns

**Token Storage Schema**:
```typescript
interface OAuth2AuthCodeCredentialValues {
  // Token data
  access_token: string;
  token_type: string;                       // Usually "Bearer"
  expires_at: number;                       // Unix timestamp (calculated from expires_in)
  refresh_token?: string;
  scope?: string;

  // DCR client data (if dynamically registered)
  client_id?: string;
  client_secret?: string;
  client_id_issued_at?: number;
  client_secret_expires_at?: number;

  // Metadata for management
  authorization_server_issuer: string;
  last_refresh_at?: number;
  refresh_count?: number;
}
```

**Credential Lifecycle**:
1. Created after successful token exchange
2. Updated on each token refresh
3. Deleted on user revocation or admin action
4. Expires based on refresh_token validity

**Alternatives Considered**:
- Separate token table (rejected: duplicates credential infrastructure)
- Redis/cache only (rejected: must survive restarts)
- Unencrypted storage (rejected: security requirement)

---

### 5. Concurrent Refresh Handling

**Question**: How do we prevent multiple simultaneous token refresh operations?

**Decision**: Use async mutex pattern with per-connection locks stored in a Map.

**Rationale**:
- MCPClientManager is a singleton handling multiple connections
- Concurrent refresh attempts waste resources and can cause race conditions
- Some auth servers may reject rapid successive refresh requests

**Implementation Pattern**:
```typescript
class TokenManager {
  private refreshLocks: Map<string, Promise<void>> = new Map();

  async refreshToken(connectionId: string): Promise<OAuthTokenSet> {
    // Check if refresh already in progress
    const existingRefresh = this.refreshLocks.get(connectionId);
    if (existingRefresh) {
      await existingRefresh;
      return this.getCachedToken(connectionId);
    }

    // Start new refresh with lock
    const refreshPromise = this.performRefresh(connectionId);
    this.refreshLocks.set(connectionId, refreshPromise.finally(() => {
      this.refreshLocks.delete(connectionId);
    }));

    return refreshPromise;
  }
}
```

**Alternatives Considered**:
- Database-level locking (rejected: overkill, adds latency)
- No protection (rejected: race conditions)
- Queue-based (rejected: adds complexity)

---

### 6. Authorization Flow Communication

**Question**: How does the callback endpoint communicate completion back to the waiting connect request?

**Decision**: Use database polling with WebSocket/PubSub notification as optimization.

**Rationale**:
- The original connect() call may be on a different server instance in scaled deployments
- Database is the shared state between instances
- PubSub provides faster notification for single-instance deployments

**Flow**:
1. `connect()` creates authorization state record with `status: 'pending'`
2. `connect()` returns authorization URL to client
3. Client opens URL in browser, user completes consent
4. Callback endpoint receives code, exchanges for tokens
5. Callback updates authorization state to `status: 'completed'`, stores tokens
6. Callback publishes completion event via PubSub
7. Client polls for completion or receives PubSub notification
8. Client retries `connect()` which now succeeds with stored tokens

**Timeout**: Authorization flow times out after 5 minutes (configurable).

**Alternatives Considered**:
- Long-polling only (rejected: doesn't scale well)
- WebSocket only (rejected: not all clients support)
- Server-to-server callback (rejected: auth servers don't support this)

---

### 7. MCP Server OAuth Configuration

**Question**: What configuration fields are needed on MCP Server entities?

**Decision**: Add OAuth-specific fields to existing `MJ: MCP Servers` entity.

**New Fields**:
```sql
ALTER TABLE ${flyway:defaultSchema}.[MCP Servers] ADD
  OAuthIssuerURL NVARCHAR(500) NULL,        -- Authorization server issuer URL
  OAuthScopes NVARCHAR(500) NULL,           -- Space-delimited required scopes
  OAuthMetadataCacheTTLMinutes INT NULL,    -- Cache TTL (default 1440 = 24 hours)
  OAuthClientID NVARCHAR(200) NULL,         -- Pre-registered client ID (if no DCR)
  OAuthClientSecret NVARCHAR(500) NULL;     -- Pre-registered client secret (encrypted)
```

**Rationale**:
- Keeps OAuth config with server config (logical grouping)
- Avoids new entity for simple key-value config
- Supports both DCR and pre-registered client scenarios

**Alternatives Considered**:
- Separate OAuth Config entity (rejected: over-normalized)
- JSON blob in existing field (rejected: loses type safety)

---

### 8. Error Messages and User Experience

**Question**: What error messages should users see for OAuth failures?

**Decision**: Map technical errors to user-friendly messages with actionable guidance.

**Error Message Mapping**:
| Technical Error                  | User Message                                                                                                 |
| -------------------------------- | ------------------------------------------------------------------------------------------------------------ |
| `invalid_grant` (expired code)   | "Authorization timed out. Please try connecting again."                                                      |
| `invalid_grant` (refresh failed) | "Your session has expired. Please reconnect to continue."                                                    |
| `access_denied`                  | "Access was denied by the authorization server. Contact your administrator if you believe this is an error." |
| `invalid_client`                 | "Connection configuration error. Please contact your administrator."                                         |
| `server_error`                   | "The authorization server is temporarily unavailable. Please try again later."                               |
| Network timeout                  | "Could not reach the authorization server. Check your network connection."                                   |
| DCR failed                       | "Automatic registration failed. Your administrator may need to configure this connection manually."          |

**Event Emission**:
```typescript
interface OAuthErrorEvent {
  type: 'authorizationError';
  connectionId: string;
  errorCode: string;           // Technical code for logging
  userMessage: string;         // Display to user
  isRetryable: boolean;        // Whether retry might succeed
  requiresReauthorization: boolean;
}
```

---

## Best Practices Applied

### From OAuth 2.1 Draft Specification

1. **PKCE is mandatory** for all authorization code flows
2. **State parameter** must be cryptographically random and validated
3. **Exact redirect URI matching** (no wildcards)
4. **Bearer token in Authorization header** (not query string)

### From MemberJunction Constitution

1. **Type safety**: All interfaces explicitly typed, no `any`
2. **Entity access pattern**: `GetEntityObject<T>()` with contextUser
3. **Functional decomposition**: OAuth flow broken into small, focused functions
4. **Naming conventions**: PascalCase for public members

### From Existing MJ Patterns

1. **Singleton managers**: OAuthManager follows MCPClientManager pattern
2. **Event emission**: Uses same event pattern as MCPClientManager
3. **Credential storage**: Integrates with CredentialEngine
4. **REST endpoint pattern**: Follows setupRESTEndpoints pattern

## Dependencies Identified

### Required NPM Packages

| Package    | Purpose       | Notes                                |
| ---------- | ------------- | ------------------------------------ |
| (none new) | PKCE/crypto   | Use Node.js built-in `crypto` module |
| (none new) | HTTP requests | Use existing `fetch` or node's http  |

### Existing MJ Dependencies Used

| Package                              | Purpose                       |
| ------------------------------------ | ----------------------------- |
| `@memberjunction/core`               | Metadata, RunView, UserInfo   |
| `@memberjunction/core-entities`      | Generated entity classes      |
| `@memberjunction/credentials-engine` | Token storage with encryption |
| `@memberjunction/server`             | REST endpoint setup           |

## Unresolved Items

None - all technical questions resolved through research.
