# Implementation Plan: MCP OAuth with Dynamic Client Registration

**Branch**: `001-mcp-oauth-dcr` | **Date**: 2026-01-29 | **Spec**: [spec.md](./spec.md)
**Input**: Feature specification from `/specs/001-mcp-oauth-dcr/spec.md`

## Summary

Implement OAuth 2.1 Authorization Code flow with PKCE and Dynamic Client Registration (DCR) for MCP server connections. The implementation intercepts the existing `MCPClientManager.getCredentials()` flow to transparently handle OAuth authentication, including automatic token refresh and re-authorization prompts. Tokens are stored encrypted via the existing `CredentialEngine`, and a new REST callback endpoint handles OAuth redirects.

## Technical Context

**Language/Version**: TypeScript 5.x, Node.js 18+ (strict mode)
**Primary Dependencies**:
- `@memberjunction/ai-mcp-client` - MCPClientManager singleton
- `@memberjunction/credentials-engine` - CredentialEngine for encrypted token storage
- `@memberjunction/core` - Metadata, RunView, BaseEntity patterns
- `@memberjunction/server` - REST endpoint setup via Express
- `jose` - JWT handling for token introspection (optional)
- Node.js built-in `crypto` for PKCE challenge generation

**Storage**: SQL Server via MJ metadata entities with field-level encryption for OAuth tokens
**Testing**: Jest for unit tests, integration tests against Auth0/Cognito test tenants
**Target Platform**: Node.js server (MJAPI) + Browser redirect flow
**Project Type**: Monorepo package additions (`packages/AI/MCPClient`, `packages/MJServer`)
**Performance Goals**: Token refresh < 5 seconds, authorization flow completion < 60 seconds
**Constraints**: Must support concurrent users, RFC 8414/7591 compliance, no breaking changes to existing MCPClientManager API
**Scale/Scope**: Multi-tenant deployment supporting 100+ concurrent OAuth connections

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

| Principle                             | Status | Notes                                                                                                      |
| ------------------------------------- | ------ | ---------------------------------------------------------------------------------------------------------- |
| I. Metadata-Driven Development        | PASS   | New entities defined in database schema, CodeGen will generate TypeScript classes                          |
| II. Type Safety (NON-NEGOTIABLE)      | PASS   | All OAuth interfaces explicitly typed, generics used with RunView/GetEntityObject                          |
| III. Actions as Boundaries            | PASS   | OAuth logic lives in service classes, not Actions. MCPResolver continues as thin GraphQL wrapper           |
| IV. Functional Decomposition          | PASS   | OAuth flows decomposed into small methods: discovery, registration, authorization, token exchange, refresh |
| V. Angular NgModules (NON-NEGOTIABLE) | N/A    | Backend feature, no Angular components                                                                     |
| VI. Entity Access Pattern             | PASS   | All entity access via `md.GetEntityObject<T>()` and `RunView<T>()` with contextUser                        |
| VII. Query Optimization               | PASS   | Metadata cached with TTL, batch queries where applicable                                                   |
| VIII. Batch Operations                | PASS   | Authorization server metadata discovery batched, token operations singleton per connection                 |
| IX. Naming Conventions                | PASS   | PascalCase for public members, camelCase for private                                                       |
| X. CodeGen Workflow                   | PASS   | Migrations exclude timestamp columns and FK indexes, CodeGen generates entity classes                      |

**Gate Status**: PASSED - No constitution violations identified.

## Project Structure

### Documentation (this feature)

```text
specs/001-mcp-oauth-dcr/
├── plan.md              # This file
├── research.md          # Phase 0 output - RFC best practices research
├── data-model.md        # Phase 1 output - Entity definitions
├── quickstart.md        # Phase 1 output - Developer guide
├── contracts/           # Phase 1 output - API contracts
│   ├── oauth-rest-api.yaml      # OpenAPI spec for OAuth endpoints
│   └── graphql-mutations.graphql # GraphQL schema additions
└── tasks.md             # Phase 2 output (via /speckit.tasks)
```

### Source Code (repository root)

```text
packages/AI/MCPClient/
├── src/
│   ├── MCPClientManager.ts      # Modified: OAuth interception in getCredentials()
│   ├── types.ts                 # Modified: OAuth-related type additions
│   ├── oauth/                   # NEW: OAuth handling module
│   │   ├── index.ts
│   │   ├── OAuthManager.ts      # OAuth flow orchestration
│   │   ├── AuthServerDiscovery.ts # RFC 8414 metadata discovery
│   │   ├── ClientRegistration.ts  # RFC 7591 DCR handling
│   │   ├── TokenManager.ts      # Token refresh, storage via CredentialEngine
│   │   ├── PKCEGenerator.ts     # PKCE challenge/verifier generation
│   │   └── types.ts             # OAuth-specific interfaces
│   └── ...existing files
└── package.json                 # Updated dependencies

packages/MJServer/
├── src/
│   ├── rest/
│   │   ├── setupRESTEndpoints.ts # Modified: Register OAuth callback route
│   │   └── OAuthCallbackHandler.ts # NEW: OAuth redirect handler
│   ├── resolvers/
│   │   └── MCPResolver.ts       # Modified: New mutations for OAuth status
│   └── ...existing files
└── package.json

migrations/v2/
└── V202601291200__v2.x_mcp_oauth_entities.sql # NEW: OAuth entity tables
```

**Structure Decision**: Extends existing packages rather than creating new ones. OAuth logic encapsulated in `packages/AI/MCPClient/src/oauth/` module. REST callback handler added to MJServer.

## Complexity Tracking

No constitution violations requiring justification.

## Architecture Overview

### OAuth Flow Integration Points

```
┌─────────────────────────────────────────────────────────────────────┐
│                        MCPClientManager.connect()                    │
├─────────────────────────────────────────────────────────────────────┤
│  1. loadConnectionConfig()                                          │
│  2. checkPermission()                                               │
│  3. loadServerConfig()                                              │
│  4. getCredentials() ← OAuth interception point                     │
│     ├─ If authType !== 'OAuth2' → existing flow                     │
│     └─ If authType === 'OAuth2' → OAuthManager.getAccessToken()     │
│         ├─ Check cached token validity                              │
│         ├─ If valid → return token                                  │
│         ├─ If expired but refresh token valid → refresh             │
│         └─ If no valid tokens → initiate authorization flow         │
│  5. createTransport(credentials)                                    │
│  6. client.connect()                                                │
└─────────────────────────────────────────────────────────────────────┘
```

### Authorization Flow Sequence

```
User                    MJAPI                  Auth Server
  │                       │                        │
  ├──Connect Request────►│                        │
  │                       ├──Discover Metadata───►│
  │                       │◄──Metadata Response───┤
  │                       ├──DCR (if supported)──►│
  │                       │◄──Client Credentials──┤
  │                       │                        │
  │◄─Authorization URL────┤                        │
  │                       │                        │
  ├──Browser Redirect────────────────────────────►│
  │◄─Consent Page────────────────────────────────┤
  ├──Approve──────────────────────────────────────►│
  │◄─Redirect + Code──────────────────────────────┤
  │                       │                        │
  ├──Callback (code)─────►│                        │
  │                       ├──Token Exchange───────►│
  │                       │◄──Tokens──────────────┤
  │                       │                        │
  │◄─Connection Complete──┤                        │
```

### Key Design Decisions

1. **OAuthManager is per-connection singleton**: Each MCP connection has its own OAuthManager instance to handle concurrent users safely.

2. **Token storage via CredentialEngine**: Leverages existing encrypted storage rather than creating a parallel system. New credential type `OAuth2 Authorization Code` stores access_token, refresh_token, expires_at, and DCR client credentials.

3. **Authorization state stored in database**: `MJ: O Auth Authorization States` entity tracks in-progress authorizations for callback validation.

4. **Callback endpoint at `/api/v1/oauth/callback`**: Single endpoint for all OAuth callbacks, state parameter identifies the specific authorization.

5. **Proactive token refresh**: Tokens are refreshed when within 5 minutes of expiry, not on failure. This prevents user-facing errors.

6. **Concurrent refresh protection**: Mutex/lock pattern ensures only one refresh operation per connection at a time.

7. **Event emission for status changes**: New events `authorizationRequired`, `authorizationCompleted`, `tokenRefreshed` added to MCPClientManager for UI reactivity.

## Constitution Re-Check (Post-Design)

*GATE: Re-evaluated after Phase 1 design artifacts completed.*

| Principle                             | Status | Post-Design Notes                                                                                |
| ------------------------------------- | ------ | ------------------------------------------------------------------------------------------------ |
| I. Metadata-Driven Development        | PASS   | 3 new entities defined in data-model.md, migration SQL follows CodeGen conventions               |
| II. Type Safety (NON-NEGOTIABLE)      | PASS   | All interfaces in research.md and contracts/ are explicitly typed, no `any` usage                |
| III. Actions as Boundaries            | PASS   | OAuth logic in service classes (OAuthManager, TokenManager), GraphQL mutations are thin wrappers |
| IV. Functional Decomposition          | PASS   | Design splits OAuth into 5 focused classes: discovery, registration, tokens, PKCE, orchestration |
| V. Angular NgModules (NON-NEGOTIABLE) | N/A    | No Angular components in this feature                                                            |
| VI. Entity Access Pattern             | PASS   | quickstart.md examples use `GetEntityObject<T>()` with contextUser                               |
| VII. Query Optimization               | PASS   | Metadata cached with 24hr TTL, token checks use `simple` ResultType for read-only                |
| VIII. Batch Operations                | PASS   | No per-item loops identified in design                                                           |
| IX. Naming Conventions                | PASS   | All interfaces and methods follow PascalCase/camelCase conventions                               |
| X. CodeGen Workflow                   | PASS   | Migration excludes `__mj_*` columns and FK indexes                                               |

**Post-Design Gate Status**: PASSED - Design complies with all applicable constitution principles.

## Generated Artifacts

| Artifact            | Path                                                          | Purpose                               |
| ------------------- | ------------------------------------------------------------- | ------------------------------------- |
| Implementation Plan | `specs/001-mcp-oauth-dcr/plan.md`                             | This file                             |
| Research Document   | `specs/001-mcp-oauth-dcr/research.md`                         | RFC compliance research and decisions |
| Data Model          | `specs/001-mcp-oauth-dcr/data-model.md`                       | Entity definitions and migration SQL  |
| REST API Contract   | `specs/001-mcp-oauth-dcr/contracts/oauth-rest-api.yaml`       | OpenAPI 3.1 spec for OAuth endpoints  |
| GraphQL Schema      | `specs/001-mcp-oauth-dcr/contracts/graphql-mutations.graphql` | GraphQL types and mutations           |
| Developer Guide     | `specs/001-mcp-oauth-dcr/quickstart.md`                       | Implementation and usage guide        |

## Next Steps

1. **Run `/speckit.tasks`** to generate the detailed task breakdown from this plan
2. **Review generated tasks** with stakeholders for any scope adjustments
3. **Create database migration** using the SQL from data-model.md
4. **Run CodeGen** to generate entity classes after migration
5. **Implement OAuth module** following the structure in this plan
6. **Add REST callback endpoint** to MJServer
7. **Extend MCPResolver** with GraphQL mutations
8. **Integration testing** against Auth0/Cognito test tenants
