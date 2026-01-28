# Implementation Plan: MCP Server OAuth with Multi-Provider Support and Scope-Based Authorization

**Branch**: `601-mcp-oauth` | **Date**: 2026-01-28 | **Spec**: [spec.md](spec.md)
**Input**: Feature specification from `/specs/601-mcp-oauth/spec.md`

## Summary

Extend the existing MCP Server OAuth implementation to support all configured auth providers (Auth0, Okta, Cognito, Google) beyond the current MSAL/Azure AD focus. Additionally, implement scope-based authorization where users select scopes during OAuth consent, and tools evaluate these scopes from the JWT to control access and behavior.

**Key Technical Approach:**
1. Leverage existing `@memberjunction/server` auth providers via OIDC Discovery
2. Extend the OAuth proxy to issue proxy-signed JWTs with consistent format and granted scopes
3. Extend existing `__mj.APIScope` entity for MCP-relevant scopes
4. Add consent screen to OAuth flow for scope selection
5. Pass full JWT to tools for scope evaluation

## Technical Context

**Language/Version**: TypeScript 5.x, Node.js 18+
**Primary Dependencies**: `@memberjunction/server` (auth providers), `@modelcontextprotocol/sdk`, `express`, `jsonwebtoken`, `jwks-rsa`
**Storage**: SQL Server (MemberJunction database) for `APIScope`, `APIKeyScope` entities; In-memory for OAuth proxy state
**Testing**: Manual integration testing with Claude Code, unit tests for token validation
**Target Platform**: Node.js server (Linux/Windows), HTTPS required for production
**Project Type**: Monorepo package (`packages/AI/MCPServer`)
**Performance Goals**: <100ms token validation overhead, <5s client registration, <90s full OAuth flow
**Constraints**: Must maintain backward compatibility with API key auth; No new database tables (extend existing APIScope)
**Scale/Scope**: Single upstream provider per deployment; In-memory state acceptable for MVP

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

| Principle | Status | Notes |
|-----------|--------|-------|
| I. Metadata-Driven Development | PASS | Using existing `APIScope` entity; no manual entity class edits |
| II. Type Safety (NON-NEGOTIABLE) | PASS | All code uses explicit TypeScript types; no `any` |
| III. Actions as Boundaries | PASS | OAuth is system boundary; internal code uses direct imports |
| IV. Functional Decomposition | PASS | Auth modules already decomposed; will maintain <40 line functions |
| V. Angular NgModules | N/A | No Angular components in this feature |
| VI. Entity Access Pattern | PASS | Will use `Metadata.GetEntityObject<T>()` and `RunView<T>()` |
| VII. Query Optimization | PASS | Scope lookups use simple queries with proper typing |
| VIII. Batch Operations | PASS | Scopes loaded in batch during authorization |
| IX. Naming Conventions | PASS | PascalCase for public, camelCase for private |
| X. CodeGen Workflow | PASS | Will run CodeGen after any schema changes |

**Constitution Compliance**: All gates PASS. No violations to justify.

## Project Structure

### Documentation (this feature)

```text
specs/601-mcp-oauth/
├── plan.md              # This file
├── spec.md              # Feature specification
├── research.md          # Phase 0 output - provider differences, JWT signing
├── data-model.md        # Phase 1 output - APIScope extensions
├── quickstart.md        # Phase 1 output - testing guide
├── contracts/           # Phase 1 output - OAuth endpoint contracts
│   └── oauth-proxy-api.yaml
└── tasks.md             # Phase 2 output (created by /speckit.tasks)
```

### Source Code (existing structure)

```text
packages/AI/MCPServer/
├── src/
│   ├── Server.ts                    # Main server - extend auth integration
│   ├── config.ts                    # Config loader - add JWT signing secret
│   ├── auth/
│   │   ├── AuthGate.ts             # Auth middleware - pass JWT to tools
│   │   ├── TokenValidator.ts       # Token validation - already multi-provider
│   │   ├── OAuthProxyRouter.ts     # Proxy endpoints - add consent, scopes
│   │   ├── OAuthConfig.ts          # Config helpers - extend
│   │   ├── LoginPage.ts            # Login UI - add consent screen
│   │   ├── ConsentPage.ts          # NEW: Scope consent UI
│   │   ├── JWTIssuer.ts            # NEW: Proxy JWT signing
│   │   └── ScopeService.ts         # NEW: Scope loading from DB
│   └── index.ts
└── package.json

packages/MJServer/src/auth/
├── providers/
│   ├── Auth0Provider.ts            # Existing - verify OIDC Discovery
│   ├── MSALProvider.ts             # Existing - works
│   ├── OktaProvider.ts             # Existing - verify OIDC Discovery
│   ├── CognitoProvider.ts          # Existing - verify OIDC Discovery
│   └── GoogleProvider.ts           # Existing - verify OIDC Discovery
├── BaseAuthProvider.ts             # Existing - JWKS handling
└── AuthProviderFactory.ts          # Existing - provider lookup
```

**Structure Decision**: Extend existing `packages/AI/MCPServer/src/auth/` module with new files for consent UI, JWT issuance, and scope service. No new packages required.

## Complexity Tracking

> No Constitution violations. All complexity within existing patterns.

| Area | Approach | Rationale |
|------|----------|-----------|
| Multi-provider | Use OIDC Discovery | Standard across all providers; no provider-specific code |
| Proxy JWTs | HS256 with configured secret | Simple, stateless; secret in mj.config.cjs |
| Scope storage | Extend existing APIScope entity | Reuse existing infrastructure; no new tables |
| Consent UI | Server-rendered HTML | Consistent with existing LoginPage.ts pattern |

## Phase 0 Deliverables

- [ ] `research.md` - Provider OIDC Discovery patterns, JWT signing approaches, consent flow best practices

## Phase 1 Deliverables

- [ ] `data-model.md` - APIScope entity field additions (if any), JWT claims structure
- [ ] `contracts/oauth-proxy-api.yaml` - OpenAPI spec for OAuth proxy endpoints
- [ ] `quickstart.md` - Testing guide for Claude Code integration

## Implementation Phases (Preview)

### Phase 1: Multi-Provider Support
- Verify all 5 providers work with OIDC Discovery
- Test token validation with each provider type
- Update configuration documentation

### Phase 2: Proxy JWT Issuance
- Implement JWTIssuer with HS256 signing
- Configure signing secret in mj.config.cjs
- Issue consistent JWTs regardless of upstream provider

### Phase 3: Scope-Based Authorization
- Create ScopeService to load APIScope from database
- Add consent screen to OAuth flow
- Include granted scopes in proxy-issued JWTs
- Pass JWT to tools for scope evaluation

### Phase 4: API Key Scope Integration
- Extend APIKeyScope junction table usage
- Ensure tools evaluate scopes consistently for both OAuth and API keys
