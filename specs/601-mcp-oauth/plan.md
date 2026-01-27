# Implementation Plan: MCP Server OAuth Authentication

**Branch**: `601-mcp-oauth` | **Date**: 2026-01-27 | **Spec**: [spec.md](./spec.md)
**Input**: Feature specification from `/specs/601-mcp-oauth/spec.md`

## Summary

Add optional OAuth 2.1 authorization as a resource server to the existing MCP Server package, controlled entirely via configuration. The MCP Server will:
1. Expose Protected Resource Metadata at `/.well-known/oauth-protected-resource` (RFC 9728)
2. Return `WWW-Authenticate: Bearer` headers on 401 responses
3. Validate Bearer tokens using MJServer's existing auth provider infrastructure
4. Support four authentication modes: `apiKey` (default), `oauth`, `both`, `none`

## Technical Context

**Language/Version**: TypeScript 5.x, Node.js 18+
**Primary Dependencies**: `@memberjunction/server` (auth providers), `express`, `jsonwebtoken`, `@modelcontextprotocol/sdk`
**Storage**: N/A (token validation only, no new persistent state)
**Testing**: Manual testing with MCP clients, unit tests for token validation
**Target Platform**: Node.js server (Linux/macOS/Windows)
**Project Type**: Monorepo package extension (packages/AI/MCPServer)
**Performance Goals**: <100ms token validation overhead (SC-003)
**Constraints**: Backward compatibility with existing API key clients (SC-007)
**Scale/Scope**: Single MCP Server instance, reusing existing auth infrastructure

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

| Principle | Compliance | Notes |
|-----------|------------|-------|
| I. Metadata-Driven Development | ✅ PASS | No new entities needed; user mapping uses existing User entity |
| II. Type Safety (NON-NEGOTIABLE) | ✅ PASS | Will use proper types from `@memberjunction/core` and `@memberjunction/server` |
| III. Actions as Boundaries | ✅ PASS | Internal code uses direct imports to MJServer auth classes |
| IV. Functional Decomposition | ✅ PASS | Auth middleware will be decomposed into focused functions (<40 lines each) |
| V. Angular NgModules | N/A | No Angular components in this feature |
| VI. Entity Access Pattern | ✅ PASS | User lookup uses existing `verifyUserRecord()` from MJServer |
| VII. Query Optimization | N/A | No RunView queries in auth flow |
| VIII. Batch Operations | N/A | No batch queries needed |
| IX. Naming Conventions | ✅ PASS | Will follow PascalCase for public, camelCase for private |
| X. CodeGen Workflow | ✅ PASS | No database schema changes required |

**Gate Status**: ✅ PASS - No violations

## Project Structure

### Documentation (this feature)

```text
specs/601-mcp-oauth/
├── plan.md              # This file
├── research.md          # Phase 0 output - OAuth/MCP research findings
├── data-model.md        # Phase 1 output - Configuration schema
├── quickstart.md        # Phase 1 output - Developer guide
├── contracts/           # Phase 1 output - API contracts
│   └── protected-resource-metadata.json
└── tasks.md             # Phase 2 output (/speckit.tasks command)
```

### Source Code (repository root)

```text
packages/AI/MCPServer/
├── src/
│   ├── index.ts                    # CLI entry point (unchanged)
│   ├── Server.ts                   # Main server - add OAuth middleware mount
│   ├── config.ts                   # Add OAuth config schema
│   └── auth/                       # NEW: OAuth auth module
│       ├── index.ts                # Public exports
│       ├── types.ts                # Auth types and interfaces
│       ├── OAuthConfig.ts          # OAuth configuration handler
│       ├── AuthGate.ts             # Unified auth middleware (API key OR Bearer)
│       ├── TokenValidator.ts       # Bearer token validation using MJServer
│       ├── ProtectedResourceMetadata.ts  # RFC 9728 metadata endpoint
│       └── WWWAuthenticate.ts      # WWW-Authenticate header generation
└── tests/                          # Future: unit tests
    └── auth/
        ├── AuthGate.test.ts
        └── TokenValidator.test.ts
```

**Structure Decision**: Extend existing MCP Server package with isolated `/auth` module. No new packages required - reuses MJServer auth infrastructure via package dependency.

## Complexity Tracking

> No violations requiring justification.

---

## Phase 0: Research Findings

### Research Summary

| Topic | Decision | Rationale |
|-------|----------|-----------|
| Token validation approach | Reuse MJServer `AuthProviderFactory` and `getSigningKeys()` | Already supports Auth0, MSAL, Okta, Cognito, Google with JWKS caching, retry logic, and connection pooling |
| Protected Resource Metadata | Return static JSON at `/.well-known/oauth-protected-resource` | RFC 9728 compliant, MCP specification required |
| WWW-Authenticate format | Include `resource_metadata` URL | RFC 9728 Section 5.1, MCP specification required |
| Auth mode configuration | Add `authMode` enum to mcpServerSettings | Simple config-driven approach, no code changes to switch modes |
| User context resolution | Use existing `verifyUserRecord()` | Maps OAuth `email` claim to MJ User entity |
| Token claims extraction | Use existing `extractUserInfoFromPayload()` | Provider-specific claim extraction already implemented |

### Key Findings

1. **MJServer Auth Infrastructure is Fully Reusable**
   - `AuthProviderFactory.getInstance().getByIssuer()` - finds provider by token issuer
   - `getSigningKeys(issuer)` - returns JWKS signing key getter with retry logic
   - `extractUserInfoFromPayload(payload)` - extracts user info from JWT claims
   - `verifyUserRecord(email, firstName, lastName)` - maps to MJ User entity

2. **MCP Authorization Specification Requirements**
   - MUST implement RFC 9728 Protected Resource Metadata
   - MUST include `resource_metadata` parameter in WWW-Authenticate header
   - MUST validate audience claim matches MCP Server resource identifier
   - Tokens MUST be issued by configured authorization server

3. **Configuration Approach**
   - Add `auth` section to `mcpServerSettings` in mj.config.cjs
   - Reuse existing `authProviders` configuration from MJServer
   - New settings: `authMode`, `resourceIdentifier`

---

## Phase 1: Design Artifacts

### Configuration Schema

Add to `mcpServerSettings` in mj.config.cjs:

```typescript
interface MCPServerAuthSettings {
  /** Authentication mode: 'apiKey' | 'oauth' | 'both' | 'none' */
  mode: 'apiKey' | 'oauth' | 'both' | 'none';

  /**
   * Resource identifier for OAuth audience validation.
   * Should match the MCP Server's public URL.
   * Example: "https://mcp.example.com"
   */
  resourceIdentifier?: string;

  /**
   * Whether to auto-generate resourceIdentifier from server URL.
   * If true and resourceIdentifier not set, uses http://localhost:{port}
   */
  autoResourceIdentifier?: boolean;
}

// Extended mcpServerSettings
interface MCPServerSettings {
  // ... existing fields
  auth?: MCPServerAuthSettings;
}
```

### Authentication Flow

```
┌─────────────────────────────────────────────────────────────────────────┐
│                           REQUEST ARRIVES                                │
└────────────────────────────────────┬────────────────────────────────────┘
                                     │
                                     ▼
┌─────────────────────────────────────────────────────────────────────────┐
│                        AuthGate Middleware                               │
│   1. Check auth mode from config                                         │
│   2. If mode='none', skip auth                                          │
│   3. Extract credentials (API key headers + Bearer token)                │
└────────────────────────────────────┬────────────────────────────────────┘
                                     │
              ┌──────────────────────┼──────────────────────┐
              │                      │                      │
              ▼                      ▼                      ▼
┌──────────────────────┐ ┌──────────────────────┐ ┌──────────────────────┐
│  API Key Present?    │ │  Bearer Token?       │ │  Neither Present?    │
│  (mode: apiKey/both) │ │  (mode: oauth/both)  │ │                      │
└──────────┬───────────┘ └──────────┬───────────┘ └──────────┬───────────┘
           │                        │                        │
           ▼                        ▼                        ▼
┌──────────────────────┐ ┌──────────────────────┐ ┌──────────────────────┐
│ Validate via         │ │ Validate via         │ │ Return 401           │
│ GetAPIKeyEngine()    │ │ MJServer providers   │ │ + WWW-Authenticate   │
│ (existing flow)      │ │ (new TokenValidator) │ │                      │
└──────────┬───────────┘ └──────────┬───────────┘ └──────────────────────┘
           │                        │
           ▼                        ▼
┌──────────────────────┐ ┌──────────────────────┐
│ Get User from        │ │ Extract claims via   │
│ API key owner        │ │ extractUserInfo()    │
│                      │ │ + verifyUserRecord() │
└──────────┬───────────┘ └──────────┬───────────┘
           │                        │
           └──────────┬─────────────┘
                      │
                      ▼
┌─────────────────────────────────────────────────────────────────────────┐
│                    Create MCPSessionContext                              │
│                    Continue to MCP handlers                              │
└─────────────────────────────────────────────────────────────────────────┘
```

### Protected Resource Metadata Response

Endpoint: `GET /.well-known/oauth-protected-resource`

```json
{
  "resource": "https://mcp.example.com",
  "authorization_servers": ["https://login.microsoftonline.com/{tenant}/v2.0"],
  "scopes_supported": ["openid", "profile", "email"],
  "bearer_methods_supported": ["header"],
  "resource_name": "MemberJunction MCP Server",
  "resource_documentation": "https://docs.memberjunction.org/mcp"
}
```

### WWW-Authenticate Header Format

401 Response (missing/invalid token):
```http
HTTP/1.1 401 Unauthorized
WWW-Authenticate: Bearer resource_metadata="https://mcp.example.com/.well-known/oauth-protected-resource"
```

403 Response (valid token, insufficient permissions):
```http
HTTP/1.1 403 Forbidden
WWW-Authenticate: Bearer error="insufficient_scope",
                         resource_metadata="https://mcp.example.com/.well-known/oauth-protected-resource",
                         error_description="User not found in MemberJunction"
```

### Module Dependencies

```
packages/AI/MCPServer
├── @memberjunction/server          # Auth providers, token validation
│   ├── AuthProviderFactory         # Get provider by issuer
│   ├── getSigningKeys              # JWKS key retrieval
│   ├── extractUserInfoFromPayload  # Claim extraction
│   └── verifyUserRecord            # User entity lookup
├── @memberjunction/api-keys        # API key validation (existing)
├── jsonwebtoken                    # JWT decode/verify
└── express                         # HTTP middleware
```

### Error Handling

| Scenario | HTTP Status | Response |
|----------|-------------|----------|
| No credentials and auth required | 401 | WWW-Authenticate with metadata URL |
| Invalid API key | 401 | Existing error response |
| Invalid/expired Bearer token | 401 | WWW-Authenticate with metadata URL |
| Valid token, user not in MJ | 403 | `error="insufficient_scope"`, user must be provisioned |
| OAuth provider unavailable | 503 | Retry-After header, log connectivity issue |
| OAuth config incomplete | N/A | Server logs warning, falls back to apiKey mode |

---

## Implementation Checklist

### Phase 1: Configuration & Types
- [ ] Add `MCPServerAuthSettings` type to config.ts
- [ ] Add Zod schema for auth settings validation
- [ ] Create `auth/types.ts` with OAuth-specific types
- [ ] Create `auth/OAuthConfig.ts` for config handling

### Phase 2: Token Validation
- [ ] Create `auth/TokenValidator.ts` using MJServer providers
- [ ] Implement audience validation for resource identifier
- [ ] Implement user mapping via verifyUserRecord()
- [ ] Add proper error handling (401/403/503)

### Phase 3: Auth Gate Middleware
- [ ] Create `auth/AuthGate.ts` unified middleware
- [ ] Support all four auth modes
- [ ] Handle API key + Bearer token precedence
- [ ] Integrate with existing MCPSessionContext

### Phase 4: MCP Protocol Compliance
- [ ] Create `auth/ProtectedResourceMetadata.ts` endpoint
- [ ] Create `auth/WWWAuthenticate.ts` header generator
- [ ] Add `/.well-known/oauth-protected-resource` route
- [ ] Ensure headers on all 401 responses

### Phase 5: Server Integration
- [ ] Modify Server.ts to mount OAuth routes conditionally
- [ ] Replace direct auth calls with AuthGate middleware
- [ ] Preserve backward compatibility for existing clients
- [ ] Add startup logging for auth mode

### Phase 6: Testing & Documentation
- [ ] Test API key mode (default behavior unchanged)
- [ ] Test OAuth mode with external IdP
- [ ] Test both mode with mixed credentials
- [ ] Test none mode for local development
- [ ] Update README with OAuth configuration guide
