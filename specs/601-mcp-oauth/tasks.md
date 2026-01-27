# Tasks: MCP Server OAuth Authentication

**Input**: Design documents from `/specs/601-mcp-oauth/`
**Prerequisites**: plan.md, spec.md, research.md, data-model.md, contracts/

**Tests**: Manual testing with MCP clients specified. Automated tests may be added but are not explicitly requested.

**Organization**: Tasks are grouped by user story to enable independent implementation and testing of each story.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel (different files, no dependencies)
- **[Story]**: Which user story this task belongs to (e.g., US1, US2, US3, US4)
- Include exact file paths in descriptions

## Path Conventions

All paths are relative to `packages/AI/MCPServer/`:
- Source: `src/`
- Auth module: `src/auth/`
- Tests: `tests/auth/`

---

## Phase 1: Setup (Shared Infrastructure)

**Purpose**: Create the auth module structure and update configuration

- [x] T001 Create auth module directory structure at `packages/AI/MCPServer/src/auth/`
- [x] T002 [P] Create `packages/AI/MCPServer/src/auth/index.ts` with public exports skeleton
- [x] T003 [P] Add `@memberjunction/server` as explicit dependency in `packages/AI/MCPServer/package.json`

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: Core types and configuration that MUST be complete before ANY user story can be implemented

**⚠️ CRITICAL**: No user story work can begin until this phase is complete

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

## Phase 3: User Story 1 - Developer Authenticates via Browser Login (Priority: P1) 🎯 MVP

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
- [ ] T025 [US1] Replace direct authenticateRequest() calls with AuthGate middleware in Server.ts for Messages endpoint
- [x] T026 [US1] Replace direct authenticateRequest() calls with AuthGate middleware in Server.ts for Streamable HTTP endpoint
- [x] T027 [US1] Add startup logging in Server.ts showing active auth mode and configured providers

### Security Logging (FR-011)

- [x] T028 [US1] Add authentication event logging in AuthGate.ts - log successful OAuth logins with user email and issuer
- [x] T029 [US1] Add authentication event logging in AuthGate.ts - log failed attempts with error reason

**Checkpoint**: User Story 1 complete - developers can authenticate via OAuth with proper 401/403 responses and WWW-Authenticate headers

---

## Phase 4: User Story 2 - Administrator Configures OAuth Provider (Priority: P2)

**Goal**: Administrators can enable OAuth via configuration with clear error messages for misconfiguration.

**Independent Test**:
1. Start MCP Server with no auth config, verify default mode is 'apiKey'
2. Add OAuth config with missing fields, verify startup warning and fallback to apiKey
3. Add complete OAuth config, verify server starts with OAuth enabled
4. Verify same authProviders config works for both MJExplorer and MCP Server

### Configuration Validation

- [ ] T030 [US2] Add OAuth config validation in `packages/AI/MCPServer/src/auth/OAuthConfig.ts` - check required fields when mode='oauth' or 'both'
- [ ] T031 [US2] Add provider availability check in OAuthConfig.ts - verify AuthProviderFactory.hasProviders() when OAuth enabled
- [ ] T032 [US2] Add fallback logic in OAuthConfig.ts - if OAuth config incomplete, log warning and return 'apiKey' mode
- [ ] T033 [US2] Add startup validation in Server.ts - call validateOAuthConfig() and log clear messages for missing/invalid values

### Default Behavior (FR-007, FR-008)

- [ ] T034 [US2] Ensure auth.mode defaults to 'apiKey' in mcpServerAuthSettingsSchema when auth section missing
- [ ] T035 [US2] Verify backward compatibility - API key auth works identically when OAuth not configured

**Checkpoint**: User Story 2 complete - administrators have clear configuration path with helpful error messages

---

## Phase 5: User Story 3 - Session Management and Token Refresh (Priority: P2)

**Goal**: Expired tokens trigger proper 401 responses enabling MCP clients to refresh or re-authenticate.

**Independent Test**:
1. Obtain short-lived access token from IdP
2. Make successful tool call with valid token
3. Wait for token expiration
4. Make tool call with expired token, verify 401 with WWW-Authenticate header
5. Verify MCP client can initiate new auth flow

### Token Expiration Handling (FR-012)

- [ ] T036 [US3] Add explicit expiration check in TokenValidator.ts - verify exp claim before signature verification for fast fail
- [ ] T037 [US3] Return specific error code 'expired_token' from TokenValidator when token expired
- [ ] T038 [US3] Ensure 401 response includes WWW-Authenticate header for expired tokens in AuthGate.ts

### Token Metadata (optional enhancement)

- [ ] T039 [US3] Add token expiry time to MCPSessionContext.oauth.tokenExpiresAt when OAuth auth succeeds
- [ ] T040 [US3] Consider logging remaining token lifetime for monitoring (optional)

**Checkpoint**: User Story 3 complete - expired tokens handled gracefully with proper re-auth prompts

---

## Phase 6: User Story 4 - Dual Authentication Support (Priority: P3)

**Goal**: Organizations can support both OAuth and API keys simultaneously with defined precedence.

**Independent Test**:
1. Configure auth mode='both'
2. Make request with valid API key only, verify success via API key flow
3. Make request with valid OAuth token only (no API key), verify success via OAuth flow
4. Make request with both API key and OAuth token, verify API key takes precedence (backward compatibility)
5. Make request with neither, verify 401 with WWW-Authenticate

### Dual Auth Logic (FR-008)

- [ ] T041 [US4] Update credential extraction in AuthGate.ts to check for both API key headers and Bearer token
- [ ] T042 [US4] Implement precedence logic in AuthGate.ts - API key takes precedence when both present
- [ ] T043 [US4] Ensure mode='both' accepts either credential type successfully
- [ ] T044 [US4] Add logging in AuthGate.ts to indicate which auth method was used

### Edge Cases

- [ ] T045 [US4] Handle case where API key is invalid but Bearer token is valid in mode='both'
- [ ] T046 [US4] Handle case where user has API key but OAuth token for different user (API key wins)

**Checkpoint**: User Story 4 complete - both authentication methods work with clear precedence

---

## Phase 7: Edge Cases and Error Handling

**Purpose**: Handle all edge cases specified in spec.md

### User Not Found (403 Response)

- [ ] T047 Add 403 Forbidden response in AuthGate.ts when OAuth token valid but user not in MemberJunction
- [ ] T048 Include error="insufficient_scope" and descriptive message in 403 WWW-Authenticate header

### Provider Unavailable (503 Response)

- [ ] T049 Add try/catch in TokenValidator.ts around JWKS fetch operations
- [ ] T050 Return 503 Service Unavailable with Retry-After header when OAuth provider unreachable
- [ ] T051 Log connectivity issues with provider URL for debugging

### Mode='none' for Development

- [ ] T052 Implement mode='none' in AuthGate.ts - skip all authentication, use system user
- [ ] T053 Add warning log at startup when mode='none' is configured (development only!)

**Checkpoint**: All edge cases handled with appropriate HTTP status codes and messages

---

## Phase 8: Polish & Cross-Cutting Concerns

**Purpose**: Documentation, cleanup, and final integration

### Documentation

- [ ] T054 [P] Update `packages/AI/MCPServer/README.md` with OAuth configuration section
- [ ] T055 [P] Add OAuth examples to README showing all four auth modes
- [ ] T056 [P] Document environment requirements (HTTPS for production)

### Code Quality

- [ ] T057 Export all public types from `packages/AI/MCPServer/src/auth/index.ts`
- [ ] T058 Add JSDoc comments to all public functions in auth module
- [ ] T059 Verify no `any` types used in auth module (Constitution compliance)
- [ ] T060 Verify all functions under 40 lines (Constitution compliance)

### Integration Validation

- [ ] T061 Run `npm run build` in `packages/AI/MCPServer` to verify TypeScript compilation
- [ ] T062 Validate quickstart.md scenarios work end-to-end

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (Phase 1)**: No dependencies - can start immediately
- **Foundational (Phase 2)**: Depends on Setup completion - BLOCKS all user stories
- **User Stories (Phase 3-6)**: All depend on Foundational phase completion
  - US1 (P1): Can proceed immediately after Foundational
  - US2 (P2): No dependencies on US1, can run in parallel
  - US3 (P2): No dependencies on US1/US2, can run in parallel
  - US4 (P3): Benefits from US1 completion but not strictly required
- **Edge Cases (Phase 7)**: Depends on US1 completion (needs basic OAuth flow)
- **Polish (Phase 8)**: Depends on all user story phases complete

### User Story Dependencies

| Story | Depends On | Can Run In Parallel With |
|-------|------------|-------------------------|
| US1 (P1) | Foundational | - |
| US2 (P2) | Foundational | US1, US3, US4 |
| US3 (P2) | Foundational | US1, US2, US4 |
| US4 (P3) | Foundational | US1, US2, US3 |

### Within Each User Story

1. Types/interfaces first
2. Core implementation (validators, handlers)
3. Middleware integration
4. Server route mounting
5. Logging/observability

### Parallel Opportunities by Phase

**Phase 1 (Setup)**:
```bash
# All [P] tasks can run together:
Task: T002 Create auth/index.ts skeleton
Task: T003 Add @memberjunction/server dependency
```

**Phase 2 (Foundational)**:
```bash
# Config tasks sequential (dependencies):
T004 → T005 → T006 → T007 → T008

# Protocol helpers parallel:
Task: T009 Create WWWAuthenticate.ts
Task: T010 Create ProtectedResourceMetadata.ts
```

**Phase 3 (US1 - MVP)**:
```bash
# Token validation and auth gate can start in parallel:
Task: T011-T014 (TokenValidator)
Task: T015-T020 (AuthGate)

# Then server integration is sequential:
T021 → T022 → T023 → T024 → T025 → T026 → T027
```

---

## Implementation Strategy

### MVP First (User Story 1 Only)

1. Complete Phase 1: Setup (3 tasks)
2. Complete Phase 2: Foundational (7 tasks)
3. Complete Phase 3: User Story 1 (19 tasks)
4. **STOP and VALIDATE**: Test OAuth flow end-to-end
5. Deploy/demo if ready - delivers core value proposition

**MVP Total: 29 tasks**

### Incremental Delivery

1. **MVP (US1)**: OAuth login flow works → Deploy
2. **+US2**: Config validation with clear errors → Deploy
3. **+US3**: Token expiration handling → Deploy
4. **+US4**: Dual auth mode support → Deploy
5. **+Edge Cases + Polish**: Production hardening → Final Deploy

### Parallel Team Strategy

With 2 developers after Foundational phase:

- **Developer A**: US1 (TokenValidator + AuthGate core)
- **Developer B**: US2 (Config validation) then US4 (Dual auth)
- **Together**: Edge cases and polish

---

## Summary

| Phase | Tasks | Parallel Tasks |
|-------|-------|----------------|
| Phase 1: Setup | 3 | 2 |
| Phase 2: Foundational | 7 | 2 |
| Phase 3: US1 (P1) MVP | 19 | 4 |
| Phase 4: US2 (P2) | 6 | 0 |
| Phase 5: US3 (P2) | 5 | 0 |
| Phase 6: US4 (P3) | 6 | 0 |
| Phase 7: Edge Cases | 7 | 0 |
| Phase 8: Polish | 9 | 3 |
| **Total** | **62** | **11** |

### Tasks per User Story

- **US1 (Developer Auth)**: 19 tasks (MVP)
- **US2 (Admin Config)**: 6 tasks
- **US3 (Session Management)**: 5 tasks
- **US4 (Dual Auth)**: 6 tasks
- **Shared/Cross-cutting**: 26 tasks

### Independent Test Criteria

Each user story has a clear independent test defined in its phase header. MVP (US1) can be tested and shipped standalone.
