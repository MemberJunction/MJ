# Tasks: MCP Server OAuth with Multi-Provider Support and Scope-Based Authorization

**Input**: Design documents from `/specs/601-mcp-oauth/`
**Prerequisites**: plan.md, spec.md, research.md, data-model.md, contracts/oauth-proxy-api.yaml

**Implementation Status**: Core implementation is **substantially complete** per plan.md. Remaining work focuses on integration testing, documentation, seed data, and polish.

**Tests**: Manual integration testing with Claude Code is the primary validation method.

**Organization**: Tasks are grouped by user story priority (P1 first) to enable MVP and incremental delivery.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel (different files, no dependencies)
- **[Story]**: Which user story this task belongs to (e.g., US1, US5, US7)
- Include exact file paths in descriptions

## Path Conventions

All paths are relative to `packages/AI/MCPServer/`:
- Source: `src/`
- Auth module: `src/auth/`

---

## Phase 1: Setup (Shared Infrastructure)

**Purpose**: Create the auth module structure and update configuration

- [x] T001 Create auth module directory structure at `packages/AI/MCPServer/src/auth/`
- [x] T002 [P] Create `packages/AI/MCPServer/src/auth/index.ts` with public exports skeleton
- [x] T003 [P] Add `@memberjunction/server` as explicit dependency in `packages/AI/MCPServer/package.json`

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: Core types and configuration that MUST be complete before ANY user story can be implemented

**CRITICAL**: No user story work can begin until this phase is complete

### Configuration Schema (FR-006, FR-007)

- [x] T004 Create `packages/AI/MCPServer/src/auth/types.ts` with MCPServerAuthSettings, OAuthValidationResult, AuthResult, and extended MCPSessionContext interfaces
- [x] T005 Add Zod schema `mcpServerAuthSettingsSchema` in `packages/AI/MCPServer/src/config.ts` for auth settings validation
- [x] T006 Update `mcpServerInfoSchema` in `packages/AI/MCPServer/src/config.ts` to include `auth` property
- [x] T007 Add `mcpServerAuth` export in `packages/AI/MCPServer/src/config.ts` for easy access to resolved auth config
- [x] T008 Create `packages/AI/MCPServer/src/auth/OAuthConfig.ts` with functions: getAuthMode(), getResourceIdentifier(), isOAuthEnabled()

### MCP Protocol Helpers (FR-002)

- [x] T009 [P] Create `packages/AI/MCPServer/src/auth/WWWAuthenticate.ts` with functions: buildWWWAuthenticateHeader(), build401Response(), build403Response()
- [x] T010 [P] Create `packages/AI/MCPServer/src/auth/ProtectedResourceMetadata.ts` with function: buildProtectedResourceMetadata() and types

**Checkpoint**: Configuration schema and protocol helpers ready - user story implementation can now begin

---

## Phase 3: User Story 1 - Developer Authenticates via Browser Login (Priority: P1) 🎯

**Goal**: Developers can authenticate to the MCP Server using OAuth via browser login, receiving proper 401 challenges and making tool calls after authentication.

**Independent Test**:
1. Configure OAuth in mj.config.cjs (mode: 'oauth' or 'both')
2. Start MCP Server, verify startup logs show OAuth enabled
3. Connect MCP client without token, verify 401 with WWW-Authenticate header
4. GET `/.well-known/oauth-protected-resource`, verify JSON response with authorization_servers
5. Complete OAuth flow with IdP, retry with Bearer token
6. Make MCP tool call, verify success with authenticated user context

### Token Validation (FR-003, FR-004, FR-005, FR-010, FR-012, FR-013)

- [x] T011 [US1] Create `packages/AI/MCPServer/src/auth/TokenValidator.ts` with function validateBearerToken(token, resourceIdentifier) using MJServer's getSigningKeys() and extractUserInfoFromPayload()
- [x] T012 [US1] Add audience validation in TokenValidator.ts - verify token's `aud` claim includes resourceIdentifier
- [x] T013 [US1] Add user resolution in TokenValidator.ts using verifyUserRecord() from @memberjunction/server
- [x] T014 [US1] Add error handling in TokenValidator.ts for invalid/expired/wrong-issuer tokens with proper error codes

### Auth Gate Middleware (FR-001, FR-003, FR-008, FR-009)

- [x] T015 [US1] Create `packages/AI/MCPServer/src/auth/AuthGate.ts` with createAuthGateMiddleware(config) factory function
- [x] T016 [US1] Implement credential extraction in AuthGate.ts - detect Bearer token vs API key from Authorization header
- [x] T017 [US1] Implement mode-based routing in AuthGate.ts - handle 'apiKey', 'oauth', 'both', 'none' modes
- [x] T018 [US1] Implement OAuth path in AuthGate.ts - call TokenValidator, build MCPSessionContext with oauth context
- [x] T019 [US1] Implement API key path in AuthGate.ts - delegate to existing authenticateRequest() function
- [x] T020 [US1] Implement 401 response with WWW-Authenticate header in AuthGate.ts when no valid credentials provided

### Protected Resource Metadata Endpoint (FR-002)

- [x] T021 [US1] Add Express route handler for `GET /.well-known/oauth-protected-resource` in `packages/AI/MCPServer/src/Server.ts`
- [x] T022 [US1] Implement metadata response generation using ProtectedResourceMetadata.ts and AuthProviderFactory.getAllProviders()

### Server Integration

- [x] T023 [US1] Modify `packages/AI/MCPServer/src/Server.ts` to conditionally mount OAuth routes based on auth mode
- [x] T024 [US1] Replace direct authenticateRequest() calls with AuthGate middleware in Server.ts for SSE endpoint
- [x] T025 [US1] Replace direct authenticateRequest() calls with AuthGate middleware in Server.ts for Messages endpoint
- [x] T026 [US1] Replace direct authenticateRequest() calls with AuthGate middleware in Server.ts for Streamable HTTP endpoint
- [x] T027 [US1] Add startup logging in Server.ts showing active auth mode and configured providers

### Security Logging (FR-011)

- [x] T028 [US1] Add authentication event logging in AuthGate.ts - log successful OAuth logins with user email and issuer
- [x] T029 [US1] Add authentication event logging in AuthGate.ts - log failed attempts with error reason

**Checkpoint**: User Story 1 complete - developers can authenticate via OAuth with proper 401/403 responses and WWW-Authenticate headers

---

## Phase 4: User Story 5 - MCP Client Dynamic Registration (Priority: P1) 🎯 MVP

**Goal**: MCP clients like Claude Code can dynamically register and initiate OAuth flows without manual app registration in upstream identity providers.

**Independent Test**:
1. Run `claude mcp add` with MCP Server URL
2. Verify client receives `client_id` from `/oauth/register`
3. Verify OAuth flow redirects to upstream provider
4. Complete browser login, verify return to Claude Code
5. Verify Claude Code can make authenticated tool calls

### Authorization Server Metadata (FR-014)

- [x] T030 [US5] Create `packages/AI/MCPServer/src/auth/OAuthProxyRouter.ts` with Express router
- [x] T031 [US5] Implement GET `/.well-known/oauth-authorization-server` endpoint returning RFC 8414 metadata in OAuthProxyRouter.ts

### Dynamic Client Registration (FR-015, FR-021)

- [x] T032 [US5] Create `packages/AI/MCPServer/src/auth/ClientStore.ts` with RegisteredClient interface and in-memory store
- [x] T033 [P] [US5] Add client_id generation using crypto.randomUUID() in ClientStore.ts
- [x] T034 [US5] Add redirect_uri validation in ClientStore.ts (validate URL format, allow localhost)
- [x] T035 [US5] Implement POST `/oauth/register` endpoint (RFC 7591) in OAuthProxyRouter.ts
- [x] T036 [US5] Add TTL management and cleanup timer for registered clients in ClientStore.ts

### Authorization Flow (FR-016, FR-019, FR-020)

- [x] T037 [US5] Create `packages/AI/MCPServer/src/auth/StateStore.ts` with AuthorizationState interface and in-memory store
- [x] T038 [P] [US5] Create `packages/AI/MCPServer/src/auth/OIDCDiscovery.ts` with fetchOIDCConfiguration(issuerUrl) function
- [x] T039 [US5] Implement GET `/oauth/authorize` endpoint with PKCE validation (S256) in OAuthProxyRouter.ts
- [x] T040 [US5] Store authorization state (client_id, redirect_uri, code_challenge, state) in StateStore.ts
- [x] T041 [US5] Generate proxy state and redirect to upstream provider's authorization_endpoint in OAuthProxyRouter.ts

### Callback Handling (FR-017)

- [x] T042 [US5] Implement GET `/oauth/callback` endpoint to receive upstream auth codes in OAuthProxyRouter.ts
- [x] T043 [US5] Exchange upstream authorization code for tokens using upstream token_endpoint in OAuthProxyRouter.ts
- [x] T044 [US5] Validate upstream tokens and extract user email using MJServer extractUserInfoFromPayload() in OAuthProxyRouter.ts
- [x] T045 [US5] Lookup MemberJunction user by email using verifyUserRecord() in OAuthProxyRouter.ts

### Proxy Authorization Code (FR-018)

- [x] T046 [US5] Create `packages/AI/MCPServer/src/auth/CodeStore.ts` with AuthorizationCode interface and in-memory store
- [x] T047 [US5] Generate proxy authorization code after successful user validation in OAuthProxyRouter.ts
- [x] T048 [US5] Store code with PKCE verifier, client_id, user info, and granted scopes in CodeStore.ts
- [x] T049 [US5] Redirect to client's redirect_uri with proxy authorization code in OAuthProxyRouter.ts

### Server Integration

- [x] T050 [US5] Mount OAuthProxyRouter on Express app when OAuth mode enabled in packages/AI/MCPServer/src/Server.ts
- [x] T051 [US5] Add state TTL cleanup timer in StateStore.ts (5-minute expiration)
- [x] T052 [US5] Add code TTL cleanup timer in CodeStore.ts (1-minute expiration)

**Checkpoint**: User Story 5 complete - MCP clients can dynamically register and complete OAuth flow through proxy

---

## Phase 5: Proxy JWT Issuance (US1 + US5 Integration)

**Goal**: Issue proxy-signed JWTs to MCP clients with consistent format regardless of upstream provider

**Independent Test**:
1. Complete OAuth flow through proxy
2. Exchange authorization code at `/oauth/token`
3. Decode returned JWT, verify proxy claims structure
4. Use JWT to make authenticated MCP tool call

### JWT Issuer (FR-023, FR-025)

- [x] T053 Add jwtSigningSecret, jwtExpiresIn, jwtIssuer fields to mcpServerAuthSettingsSchema in packages/AI/MCPServer/src/config.ts
- [x] T054 Create `packages/AI/MCPServer/src/auth/JWTIssuer.ts` with signProxyJWT(claims) function using HS256
- [x] T055 [P] Create ProxyJWTClaims interface in packages/AI/MCPServer/src/auth/types.ts matching data-model.md
- [x] T056 Implement JWT signing with configured secret in JWTIssuer.ts
- [x] T057 Add claims population (iss, sub, aud, email, mjUserId, scopes, upstreamProvider, upstreamSub) in JWTIssuer.ts

### Token Endpoint (FR-018)

- [x] T058 Implement POST `/oauth/token` endpoint for authorization_code grant in OAuthProxyRouter.ts
- [x] T059 Validate PKCE code_verifier against stored code_challenge in OAuthProxyRouter.ts
- [x] T060 Issue proxy-signed JWT access token on successful code exchange in OAuthProxyRouter.ts
- [x] T061 Return TokenResponse with access_token, token_type, expires_in, scope in OAuthProxyRouter.ts

### Proxy Token Validation

- [x] T062 Extend TokenValidator.ts to validate proxy-signed JWTs (iss="urn:mj:mcp-server", HS256)
- [x] T063 Update AuthGate.ts to handle both proxy tokens and upstream provider tokens

### Update Protected Resource Metadata (FR-024)

- [x] T064 Update `/.well-known/oauth-protected-resource` to point to OAuth proxy when proxy enabled in ProtectedResourceMetadata.ts

**Checkpoint**: Proxy JWT issuance complete - consistent token format for all providers

---

## Phase 6: User Story 7 - Scope-Based Access Control (Priority: P2)

**Goal**: Users select scopes during consent, tools evaluate scopes from JWT to allow/deny operations

**Independent Test**:
1. Authenticate via OAuth proxy
2. See consent screen with available scopes
3. Select subset of scopes
4. Verify JWT contains only granted scopes
5. Call tool, verify tool evaluates scopes correctly

### Scope Service (FR-026)

- [x] T065 [US7] Create `packages/AI/MCPServer/src/auth/ScopeService.ts` with loadActiveScopes(dataSource) function
- [x] T066 [US7] Implement APIScopeInfo interface matching data-model.md in types.ts
- [x] T067 [US7] Load scopes from __mj.APIScope entity using RunView in ScopeService.ts
- [x] T068 [P] [US7] Implement GET `/oauth/scopes` endpoint to list available scopes in OAuthProxyRouter.ts

### Consent Screen (FR-030, FR-031)

- [x] T069 [US7] Create `packages/AI/MCPServer/src/auth/ConsentPage.ts` with HTML template for scope selection
- [x] T070 [US7] Create ConsentRequest interface in types.ts (requestId, user, availableScopes, redirectUri, state)
- [x] T071 [US7] Store ConsentRequest in StateStore after upstream auth success in OAuthProxyRouter.ts
- [x] T072 [US7] Implement GET `/oauth/consent` endpoint to render consent screen in OAuthProxyRouter.ts
- [x] T073 [US7] Display scopes grouped by category with descriptions in ConsentPage.ts
- [x] T074 [US7] Implement POST `/oauth/consent` endpoint to process scope selection in OAuthProxyRouter.ts

### Scopes in JWT (FR-027)

- [x] T075 [US7] Include granted scopes in proxy-signed JWT claims in JWTIssuer.ts
- [x] T076 [US7] Add scopes array to MCPSessionContext in AuthGate.ts
- [x] T077 [US7] Pass decoded JWT to tool context for scope evaluation in Server.ts

### Scope Evaluation Helper (FR-029)

- [x] T078 [US7] Create `packages/AI/MCPServer/src/auth/ScopeEvaluator.ts` with hasScope(), hasAnyScope(), hasAllScopes() methods
- [x] T079 [US7] Export ScopeEvaluator from auth/index.ts for tool use

### Hierarchical Scope Matching (FR-029a) - Added 2026-01-28

- [ ] T079a [US7] Update `packages/AI/MCPServer/src/auth/ScopeEvaluator.ts` to implement hierarchical prefix matching: hasScope('entity:read') returns true if token contains 'entity:read' OR 'entity' (parent scope)
- [ ] T079b [US7] Add hasParentScope(scope: string) method to ScopeEvaluator for explicit parent scope checking
- [ ] T079c [US7] Update ScopeEvaluator unit tests to verify hierarchical matching behavior
- [ ] T079d [US7] Document hierarchical scope matching in ScopeEvaluator JSDoc comments

**Checkpoint**: User Story 7 complete - scope-based authorization works for OAuth tokens with hierarchical matching

---

## Phase 7: User Story 6 - OAuth Proxy Web Login UI (Priority: P2)

**Goal**: Branded login page with clear user experience during OAuth flow

**Independent Test**:
1. Navigate to `/oauth/authorize` in browser
2. Verify branded login page renders
3. Click to proceed, verify redirect to upstream provider
4. On error, verify user-friendly error page displays

### Login Page (FR-022)

- [x] T080 [US6] Create `packages/AI/MCPServer/src/auth/LoginPage.ts` with HTML template for login UI
- [x] T081 [US6] Add MemberJunction branding and styling to LoginPage.ts
- [x] T082 [US6] Show login page at `/oauth/authorize` before upstream redirect in OAuthProxyRouter.ts
- [x] T083 [P] [US6] Add provider selection UI when multiple providers configured in LoginPage.ts (deferred - single provider flow)

### Error Pages

- [x] T084 [US6] Create `packages/AI/MCPServer/src/auth/ErrorPage.ts` with user-friendly error display (implemented as renderErrorPage in LoginPage.ts)
- [x] T085 [US6] Show error page for invalid_client, expired state, auth failures in OAuthProxyRouter.ts
- [x] T086 [US6] Add "Start Over" link on error page to restart OAuth flow

### Styling

- [x] T087 [P] [US6] Create `packages/AI/MCPServer/src/auth/styles.ts` with CSS consistent with MJ branding
- [x] T088 [US6] Apply styles to LoginPage, ConsentPage, and ErrorPage

**Checkpoint**: User Story 6 complete - polished web UI for OAuth flow

---

## Phase 8: User Story 3 - Session Management and Token Refresh (Priority: P2)

**Goal**: Expired tokens trigger proper 401 responses, refresh tokens enable session continuation

**Independent Test**:
1. Obtain tokens with short expiration
2. Make successful tool call with valid token
3. Wait for access token expiration
4. Use refresh token to obtain new access token
5. Verify new access token works

### Token Expiration Handling (FR-012)

- [x] T089 [US3] Add explicit expiration check in TokenValidator.ts - verify exp claim before signature verification for fast fail
- [x] T090 [US3] Return specific error code 'expired_token' from TokenValidator when token expired
- [x] T091 [US3] Ensure 401 response includes WWW-Authenticate header for expired tokens in AuthGate.ts

### Refresh Token Support

- [x] T092 [US3] Create `packages/AI/MCPServer/src/auth/RefreshTokenStore.ts` with in-memory store and longer TTL (implemented via upstream passthrough - proxy returns upstream refresh tokens directly)
- [x] T093 [US3] Generate refresh tokens alongside access tokens in OAuthProxyRouter.ts (passthrough approach)
- [x] T094 [US3] Implement refresh_token grant type in POST `/oauth/token` endpoint in OAuthProxyRouter.ts
- [x] T095 [US3] Validate refresh token and issue new access token with same scopes in OAuthProxyRouter.ts
- [x] T096 [US3] Return 401 when refresh token expired with clear error message

**Checkpoint**: User Story 3 complete - token refresh works, expired sessions handled gracefully

---

## Phase 9: User Story 2 - Administrator Configures OAuth Provider (Priority: P2)

**Goal**: Administrators can enable OAuth via configuration with clear error messages for misconfiguration

**Independent Test**:
1. Start MCP Server with no auth config, verify default mode is 'apiKey'
2. Add OAuth config with missing jwtSigningSecret, verify startup warning and fallback
3. Add complete OAuth config, verify server starts with OAuth enabled
4. Verify same authProviders config works for both MJExplorer and MCP Server

### Configuration Validation

- [x] T097 [US2] Add OAuth config validation in OAuthConfig.ts - check required fields when mode='oauth' or 'both'
- [x] T098 [US2] Add provider availability check in OAuthConfig.ts - verify AuthProviderFactory.hasProviders() when OAuth enabled
- [x] T099 [US2] Add fallback logic in OAuthConfig.ts - if OAuth config incomplete, log warning and return 'apiKey' mode
- [x] T100 [US2] Add startup validation in Server.ts - call validateOAuthConfig() and log clear messages

### JWT Secret Validation

- [x] T101 [US2] Validate jwtSigningSecret is present and >= 32 bytes when OAuth proxy enabled
- [x] T102 [US2] Log clear error message when jwtSigningSecret missing or too short
- [x] T103 [US2] Disable OAuth proxy and fall back to API-key-only if secret invalid

**Checkpoint**: User Story 2 complete - administrators have clear configuration path

---

## Phase 10: User Story 4 - Dual Authentication Support (Priority: P3)

**Goal**: Organizations can support both OAuth and API keys simultaneously with defined precedence

**Independent Test**:
1. Configure auth mode='both'
2. Make request with valid API key only, verify success via API key flow
3. Make request with valid OAuth token only, verify success via OAuth flow
4. Make request with both, verify API key takes precedence
5. Make request with neither, verify 401 with WWW-Authenticate

### Dual Auth Logic (FR-008, FR-028)

- [x] T104 [US4] Update credential extraction in AuthGate.ts to check for both API key headers and Bearer token
- [x] T105 [US4] Implement precedence logic in AuthGate.ts - API key takes precedence when both present
- [x] T106 [US4] Ensure mode='both' accepts either credential type successfully
- [x] T107 [US4] Add logging in AuthGate.ts to indicate which auth method was used

### API Key Scopes (FR-028, FR-032)

- [x] T108 [US4] Load scopes from __mj.APIKeyScope entity for API key auth in AuthGate.ts
- [x] T109 [US4] Create unified AuthContext with scopes for both auth methods in types.ts
- [x] T110 [US4] Ensure tools receive consistent context (including scopes) regardless of auth method in Server.ts

### Edge Cases

- [x] T111 [US4] Handle case where API key is invalid but Bearer token is valid in mode='both'
- [x] T112 [US4] Handle case where user has API key but OAuth token for different user (API key wins)

**Checkpoint**: User Story 4 complete - dual authentication fully functional

---

## Phase 11: Edge Cases and Error Handling

**Purpose**: Handle all edge cases specified in spec.md

### User Not Found (403 Response)

- [x] T113 Add 403 Forbidden response in AuthGate.ts when OAuth token valid but user not in MemberJunction
- [x] T114 Include error="insufficient_scope" and descriptive message in 403 WWW-Authenticate header

### Provider Unavailable (503 Response)

- [x] T115 Add try/catch in TokenValidator.ts around JWKS fetch operations
- [x] T116 Return 503 Service Unavailable with Retry-After header when OAuth provider unreachable
- [x] T117 Log connectivity issues with provider URL for debugging

### Authorization State Expired

- [x] T118 Return error page when authorization state expired (user took too long to log in)
- [x] T119 Include "Start Over" guidance on state expiration error page

### No Scopes Granted

- [x] T120 Handle case where user grants no scopes on consent screen (issue JWT with empty scopes array)
- [x] T121 Log warning when user grants no scopes

### Mode='none' for Development

- [x] T122 Implement mode='none' in AuthGate.ts - skip all authentication, use system user
- [x] T123 Add warning log at startup when mode='none' is configured (development only!)

**Checkpoint**: All edge cases handled with appropriate HTTP status codes and messages

---

## Phase 12: Remaining Work (Per plan.md)

**Purpose**: Complete remaining items identified in plan.md - integration testing, documentation, seed data, and polish

**Status from plan.md**: Implementation is substantially complete. This phase covers the remaining work.

### Integration Testing with Claude Code (P1) 🎯

- [x] T124 Run `npm run build` in `packages/AI/MCPServer` to verify TypeScript compilation
- [ ] T125 [US5] Configure local MCP Server with OAuth enabled for Claude Code testing
- [ ] T126 [US5] Test `claude mcp add` command with MCP Server URL - verify dynamic registration
- [ ] T127 [US5] Complete full OAuth flow: registration → browser login → consent → token → tool call
- [ ] T128 [US1] Verify authenticated user context is correct in tool execution
- [ ] T129 [US7] Verify scopes are present in JWT and accessible to tools
- [ ] T130 Validate all quickstart.md scenarios work end-to-end with OAuth proxy

### Documentation Updates (P2)

- [x] T131 [P] Update `packages/AI/MCPServer/README.md` with OAuth configuration section
- [ ] T132 [P] Add complete configuration examples for all 5 providers (Auth0, MSAL, Okta, Cognito, Google) to README
- [ ] T133 [P] Document JWT signing secret generation in README
- [ ] T134 [P] Add troubleshooting section for common OAuth issues in specs/601-mcp-oauth/quickstart.md
- [ ] T135 [P] Document API key scope assignment workflow in quickstart.md

### Seed Data for Default Scopes (P2)

- [ ] T136 Create SQL migration V202601281500__v3.5.x__Default_API_Scopes.sql with default scopes
- [ ] T137 Insert default scopes with hierarchical structure: parent scopes (action, agent, communication, entity, prompt, query, view) and child scopes (action:read, action:execute, agent:read, agent:execute, communication:read, entity:create, entity:delete, entity:read, entity:update, prompt:read, prompt:execute, query:read, query:run, view:run)
- [ ] T138 Add scope descriptions and categories for consent screen display
- [ ] T139 Verify scopes appear in /oauth/scopes endpoint after migration

### Error Page Styling (P3)

- [ ] T140 [P] Improve error page visual design in packages/AI/MCPServer/src/auth/styles.ts
- [ ] T141 [P] Add specific error guidance for: user not provisioned in MemberJunction
- [ ] T142 [P] Add specific error guidance for: identity provider unavailable
- [ ] T143 [P] Add specific error guidance for: authorization state expired
- [ ] T144 Review error pages on mobile browser viewport

---

## Dependencies and Execution Order

### Current State

All implementation phases (1-11) are **COMPLETE**. Phase 12 contains the remaining work.

### Phase 12 Dependencies

Since implementation is complete, Phase 12 tasks have minimal dependencies:

- **Integration Testing (T125-T130)**: Requires working OAuth configuration
  - T125 must complete before T126-T130
  - T126 → T127 → T128-T130 (sequential for full flow test)
- **Documentation (T132-T135)**: No dependencies, can run in parallel
- **Seed Data (T136-T139)**: T136 must complete before T137-T139
- **Error Page Styling (T140-T144)**: No dependencies, can run in parallel

### Remaining Tasks Execution Order

```
                    ┌─────────────────────────────────────────┐
                    │  Phase 12: Remaining Work               │
                    │  (All can start after code review)      │
                    └─────────────────────────────────────────┘
                                       │
         ┌─────────────────────────────┼─────────────────────────────┐
         │                             │                             │
         ▼                             ▼                             ▼
┌─────────────────┐         ┌─────────────────┐         ┌─────────────────┐
│ Integration     │         │ Documentation   │         │ Seed Data       │
│ Testing (P1)    │         │ (P2)            │         │ (P2)            │
│ T125 → T126 →   │         │ T132, T133,     │         │ T136 → T137 →   │
│ T127 → T128-130 │         │ T134, T135 [P]  │         │ T138 → T139     │
└─────────────────┘         └─────────────────┘         └─────────────────┘
                                       │
                                       ▼
                            ┌─────────────────┐
                            │ Error Pages     │
                            │ (P3)            │
                            │ T140-T144 [P]   │
                            └─────────────────┘
```

---

## Implementation Strategy

### Current Status

**Implementation COMPLETE** (Phases 1-11):
- All 7 user stories implemented
- All TypeScript code written
- Build compiles successfully

**Remaining Work** (Phase 12):
- Integration testing with Claude Code (P1) - 6 tasks
- Documentation updates (P2) - 4 tasks
- Seed data for default scopes (P2) - 4 tasks
- Error page styling (P3) - 5 tasks

### Recommended Execution

1. **Priority 1**: Run integration tests (T125-T130)
   - This validates all user stories work end-to-end
   - Blocking for release confidence

2. **Priority 2 (Parallel)**:
   - Documentation updates (T132-T135)
   - Seed data migration (T136-T139)

3. **Priority 3**: Error page styling (T140-T144)
   - Can be done incrementally
   - Lower urgency for initial release

### Quick Start for Remaining Work

```bash
# 1. Verify build works
cd packages/AI/MCPServer && npm run build

# 2. Configure OAuth for testing (see quickstart.md)
# 3. Start MCP Server
npm run start:mcp

# 4. Test with Claude Code
claude mcp add http://localhost:3100 --name "MJ MCP Server"
```

---

## Summary

| Phase | Tasks | Status |
|-------|-------|--------|
| Phase 1: Setup | T001-T003 (3) | ✅ Complete |
| Phase 2: Foundational | T004-T010 (7) | ✅ Complete |
| Phase 3: US1 (P1) | T011-T029 (19) | ✅ Complete |
| Phase 4: US5 (P1) | T030-T052 (23) | ✅ Complete |
| Phase 5: JWT Issuance | T053-T064 (12) | ✅ Complete |
| Phase 6: US7 (P2) | T065-T079d (19) | 🔄 In Progress (hierarchical scope matching) |
| Phase 7: US6 (P2) | T080-T088 (9) | ✅ Complete |
| Phase 8: US3 (P2) | T089-T096 (8) | ✅ Complete |
| Phase 9: US2 (P2) | T097-T103 (7) | ✅ Complete |
| Phase 10: US4 (P3) | T104-T112 (9) | ✅ Complete |
| Phase 11: Edge Cases | T113-T123 (11) | ✅ Complete |
| Phase 12: Remaining Work | T124-T144 (21) | 🔄 In Progress |
| **Total** | **148** | |

### Remaining Work Summary (from plan.md)

| Category | Priority | Tasks | Description |
|----------|----------|-------|-------------|
| Hierarchical Scope Matching | P2 | T079a-T079d (4) | Implement FR-029a hierarchical prefix matching |
| Integration Testing | P1 | T125-T130 (6) | Claude Code end-to-end OAuth flow validation |
| Documentation | P2 | T132-T135 (4) | README and quickstart.md updates |
| Seed Data | P2 | T136-T139 (4) | Default API scopes migration (updated for hierarchy) |
| Error Page Styling | P3 | T140-T144 (5) | Improve error UX |
| **Remaining Total** | | **23** | |

### Tasks per User Story (Implementation Complete)

- **US1 (Browser Login)**: 19 tasks ✅ Complete
- **US5 (Dynamic Registration)**: 23 tasks ✅ Complete
- **US7 (Scope-Based Access)**: 19 tasks 🔄 In Progress (hierarchical scope matching)
- **US6 (Web Login UI)**: 9 tasks ✅ Complete
- **US3 (Token Refresh)**: 8 tasks ✅ Complete
- **US2 (Admin Config)**: 7 tasks ✅ Complete
- **US4 (Dual Auth)**: 9 tasks ✅ Complete
- **Shared/Cross-cutting**: 33 tasks ✅ Complete

### Independent Test Criteria Summary

| User Story | Independent Test | Verified |
|------------|------------------|----------|
| US1 | OAuth login, Bearer token, tool call success | 🔄 Pending |
| US5 | `claude mcp add`, dynamic registration, OAuth flow complete | 🔄 Pending |
| US7 | Consent screen, scope selection, JWT contains granted scopes | 🔄 Pending |
| US6 | Login page renders, provider selection, error pages display | 🔄 Pending |
| US3 | Refresh token exchange returns new access token | 🔄 Pending |
| US2 | Config validation, startup messages, fallback behavior | 🔄 Pending |
| US4 | Both auth methods work, API key takes precedence | 🔄 Pending |

---

## Parallel Execution (Phase 12)

Since implementation is complete, remaining tasks can be parallelized:

```bash
# Launch all documentation tasks in parallel:
Task: "Add configuration examples for all 5 providers" (T132)
Task: "Document JWT signing secret generation" (T133)
Task: "Add troubleshooting section" (T134)
Task: "Document API key scope assignment" (T135)

# Launch all error page tasks in parallel:
Task: "Improve error page visual design" (T140)
Task: "Add error guidance for user not provisioned" (T141)
Task: "Add error guidance for provider unavailable" (T142)
Task: "Add error guidance for state expired" (T143)

# Launch seed data creation:
Task: "Create SQL migration for default scopes" (T136)

# Integration testing should run sequentially after setup:
Task: "Configure local MCP Server" (T125) → "Test claude mcp add" (T126) → "Complete full OAuth flow" (T127)
```

---

## Notes

- [P] tasks = different files, no dependencies within phase
- [Story] label maps task to specific user story for traceability
- Implementation is **substantially complete** per plan.md
- Remaining work focuses on verification, documentation, and polish
- OAuth proxy (US5) enables Claude Code support without manual IdP registration
- Proxy-signed JWTs provide consistent format across all upstream providers
- Scopes are system-wide (apply to both OAuth and API keys)
- Provider type stored as string (not hardcoded enum) for loose coupling
