# Implementation Plan: MCP Server OAuth Authentication with OAuth Proxy

**Branch**: `601-mcp-oauth` | **Date**: 2026-01-28 | **Spec**: [spec.md](./spec.md)
**Input**: Feature specification from `/specs/601-mcp-oauth/spec.md`

## Summary

Add OAuth 2.1 authentication support to the MCP Server as a toggleable alternative to API key authentication. The implementation includes an OAuth Proxy Authorization Server that enables MCP clients (like Claude Code) to authenticate via browser login using the organization's existing identity provider (Auth0, MSAL/Azure AD, Okta, Cognito, or Google) without requiring manual app registration. The proxy implements RFC 7591 Dynamic Client Registration and issues its own JWTs with MemberJunction-specific scopes stored in the database.

**Note**: This implementation is **substantially complete** in the current codebase. This plan documents the existing architecture and any remaining work.

## Technical Context

**Language/Version**: TypeScript 5.x, Node.js 18+ (20+ recommended)
**Primary Dependencies**:
- `@memberjunction/server` (auth providers: BaseAuthProvider, AuthProviderFactory)
- `@modelcontextprotocol/sdk` (MCP protocol implementation)
- `express` (HTTP server and routing)
- `jsonwebtoken` (JWT signing/verification for proxy tokens)
- `jwks-rsa` (JWKS client for upstream token validation)

**Storage**:
- SQL Server (MemberJunction database) for `APIScope`, `APIKeyScope`, `APIApplication` entities
- In-memory for OAuth proxy state (authorization codes, registered clients)

**Testing**: Manual integration testing with Claude Code and other MCP clients

**Target Platform**: Node.js server (same as MCP Server)

**Performance Goals**:
- <100ms token validation overhead
- <5s dynamic client registration
- <90s full OAuth flow (registration + login + token)

**Constraints**:
- PKCE (S256) required for all OAuth flows
- No client_secret for upstream providers (PKCE-only, same as MJExplorer SPA)
- In-memory state (server restart clears registered clients - they re-register)

**Scale/Scope**: Single upstream identity provider per MCP Server deployment

## Constitution Check

*GATE: Verified against MemberJunction Constitution v1.1.0*

| Principle | Status | Notes |
|-----------|--------|-------|
| I. Metadata-Driven Development | PASS | Scopes stored in `APIScope` entity, managed via MJ admin UI |
| II. Type Safety (NON-NEGOTIABLE) | PASS | All code uses explicit TypeScript types, no `any` usage |
| III. Actions as Boundaries | PASS | OAuth is internal infrastructure, uses `@memberjunction/server` directly |
| IV. Functional Decomposition | PASS | Auth module split into focused files (<300 lines each) |
| V. Angular NgModules | N/A | No Angular components in this feature |
| VI. Entity Access Pattern | PASS | Uses `Metadata.GetEntityObject<T>()` and `RunView<T>()` with contextUser |
| VII. Query Optimization | PASS | Uses `ResultType: 'simple'` for scope lookups with caching |
| VIII. Batch Operations | PASS | Loads all scopes in single query, cached for 5 minutes |
| IX. Naming Conventions | PASS | PascalCase for public members, camelCase for private |
| X. CodeGen Workflow | PASS | Database migrations use CodeGen for views/SPs |

## Project Structure

### Documentation (this feature)

```text
specs/601-mcp-oauth/
├── plan.md              # This file
├── research.md          # Phase 0: OAuth specification research
├── data-model.md        # Phase 1: Entity and scope definitions
├── quickstart.md        # Phase 1: Configuration guide
├── contracts/           # Phase 1: OAuth endpoint specifications
│   └── oauth-api.yaml   # OpenAPI 3.0 specification
└── tasks.md             # Phase 2 output (created by /speckit.tasks)
```

### Source Code (existing implementation)

```text
packages/AI/MCPServer/
├── src/
│   ├── Server.ts              # Main server with OAuth integration
│   ├── config.ts              # Configuration loading and validation
│   └── auth/                  # OAuth authentication module
│       ├── index.ts           # Module exports
│       ├── types.ts           # TypeScript interfaces
│       ├── OAuthConfig.ts     # OAuth configuration types
│       ├── OAuthProxyTypes.ts # OAuth proxy types
│       ├── AuthGate.ts        # Request authentication middleware
│       ├── TokenValidator.ts  # JWT validation logic
│       ├── JWTIssuer.ts       # Proxy JWT signing (HS256)
│       ├── ScopeService.ts    # Database scope loading
│       ├── ScopeEvaluator.ts  # Scope-based authorization
│       ├── ClientRegistry.ts  # RFC 7591 dynamic client registration
│       ├── AuthorizationStateManager.ts  # OAuth state tracking
│       ├── AuthorizationServerMetadataBuilder.ts  # RFC 8414 metadata
│       ├── ProtectedResourceMetadata.ts  # RFC 9728 metadata
│       ├── OAuthProxyRouter.ts    # OAuth proxy endpoints
│       ├── WWWAuthenticate.ts     # RFC 9728 headers
│       ├── ConsentPage.ts         # Scope consent UI
│       ├── LoginPage.ts           # Web login UI
│       └── styles.ts              # Shared CSS styles

packages/MJServer/src/auth/
├── BaseAuthProvider.ts        # Abstract base for auth providers
├── AuthProviderFactory.ts     # Provider registry and factory
└── providers/
    ├── Auth0Provider.ts       # Auth0 implementation
    ├── MSALProvider.ts        # Azure AD implementation
    ├── OktaProvider.ts        # Okta implementation
    ├── CognitoProvider.ts     # AWS Cognito implementation
    └── GoogleProvider.ts      # Google implementation

migrations/v3/
├── V202601211825__v3.2.x__APIKeys.sql           # APIKey, APIScope tables
├── V202601261008__v3.3.x__API_Key_Scopes_Authorization.sql  # Hierarchical scopes
└── V202601271500__v3.4.x__APIScope_UIConfig.sql # UI presentation metadata
```

**Structure Decision**: Monorepo structure using existing packages. OAuth implementation in `packages/AI/MCPServer/src/auth/`, auth providers reused from `packages/MJServer/src/auth/`.

## Complexity Tracking

> No constitution violations requiring justification. Implementation follows all principles.

| Area | Complexity Level | Justification |
|------|-----------------|---------------|
| OAuth Proxy | Medium | Required for RFC 7591 dynamic registration (Azure AD doesn't support it natively) |
| In-memory state | Low | Acceptable for MVP; clients re-register on restart |
| Scope hierarchy | Medium | Enables fine-grained permissions with inheritance |

## Implementation Status

### Completed Components

| Component | File | Status |
|-----------|------|--------|
| Auth modes (apiKey, oauth, both, none) | AuthGate.ts | Complete |
| Token validation | TokenValidator.ts | Complete |
| JWT issuing (HS256) | JWTIssuer.ts | Complete |
| Dynamic client registration | ClientRegistry.ts | Complete |
| OAuth proxy endpoints | OAuthProxyRouter.ts | Complete |
| Protected resource metadata | ProtectedResourceMetadata.ts | Complete |
| Authorization server metadata | AuthorizationServerMetadataBuilder.ts | Complete |
| State management | AuthorizationStateManager.ts | Complete |
| Scope loading from DB | ScopeService.ts | Complete |
| Scope evaluation | ScopeEvaluator.ts | Complete |
| Login page UI | LoginPage.ts | Complete |
| Consent page UI | ConsentPage.ts | Complete |
| Database migrations | migrations/v3/*.sql | Complete |
| Provider implementations | MJServer/src/auth/providers/ | Complete |

### Remaining Work

| Item | Priority | Notes |
|------|----------|-------|
| Integration testing with Claude Code | P1 | Verify full flow works |
| Documentation updates | P2 | README, configuration examples |
| Seed data for default scopes | P2 | Pre-populate common scopes |
| Error page styling | P3 | Improve error UX |

## Key Design Decisions

### 1. OAuth Proxy Pattern
**Decision**: Implement OAuth proxy rather than direct upstream token passthrough
**Rationale**: Azure AD doesn't support RFC 7591 Dynamic Client Registration. The proxy enables MCP clients to authenticate without manual app registration.

### 2. PKCE-Only for Upstream
**Decision**: Use PKCE without client_secret for upstream provider authentication
**Rationale**: Allows reuse of MJExplorer's existing OAuth app registration (public/SPA client). Users only add `/oauth/callback` redirect URI.

### 3. HS256 for Proxy JWTs
**Decision**: Sign proxy-issued tokens with HS256 (symmetric)
**Rationale**: Simpler than asymmetric keys, configurable secret in mj.config.cjs, sufficient for MCP Server's trust model.

### 4. Database-Stored Scopes
**Decision**: Store scopes in `APIScope` entity with hierarchy
**Rationale**: Enables dynamic scope management via MJ admin UI, applies to both OAuth and API keys (system-wide).

### 5. In-Memory State Storage
**Decision**: Store registered clients and authorization state in memory
**Rationale**: Acceptable for MVP. Clients re-register on server restart. Simplifies deployment without external state store.
