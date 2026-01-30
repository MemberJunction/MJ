# Tasks: MCP OAuth with Dynamic Client Registration

**Input**: Design documents from `/specs/001-mcp-oauth-dcr/`
**Prerequisites**: plan.md, spec.md, research.md, data-model.md, contracts/
**Last Updated**: 2026-01-29

**Tests**: Tests are not explicitly requested in this specification. Tasks focus on implementation.

**Organization**: Tasks are grouped by user story to enable independent implementation and testing of each story.

## Implementation Status Summary

| Phase | Status | Notes |
|-------|--------|-------|
| Phase 1: Setup | ✅ Complete | Module structure created |
| Phase 2: Foundational | ✅ Complete | Migration, CodeGen, entities all done |
| Phase 3: US1 (First-Time Connection) | ✅ Complete | Core OAuth flow working |
| Phase 4: US2 (Token Refresh) | ✅ Complete | Automatic refresh implemented |
| Phase 5: US3 (Re-Auth on Failure) | ✅ Complete | Error handling implemented |
| Phase 6: US4 (Admin Config) | ✅ Complete | DB fields, UI, GraphQL mutations all done |
| Phase 7: US5 (Revocation & Audit) | 🔶 Partial | GraphQL done, audit logging pending (T047-T051) |
| Phase 8: Bug Fixes & Critical UX | 🔶 In Progress | Delete bug fixed, OAuth UI done, redirect flow pending (T063-T070) |
| Phase 9: Live UI Updates | ⬜ Not Started | Event emissions, subscriptions |
| Phase 10: Final Polish | ⬜ Not Started | Cleanup, testing |

**Current State**: Core OAuth flow (US1-US5 core) is functional with GraphQL API:
- ✅ Delete functionality fixed (proper error checking added)
- ✅ UI to configure OAuth settings in server dialog
- ✅ GraphQL operations: GetMCPOAuthConnectionStatus, GetMCPOAuthStatus, InitiateMCPOAuth, RevokeMCPOAuth, RefreshMCPOAuthToken
- ❌ User must copy/paste auth URL (should redirect) - T064-T070 pending
- ❌ No live updates when entities change - Phase 9 pending
- ❌ Audit logging for OAuth events - T047-T051 pending

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel (different files, no dependencies)
- **[Story]**: Which user story this task belongs to (e.g., US1, US2, US3)
- Include exact file paths in descriptions

## Path Conventions

- **Monorepo packages**: `packages/{PackageName}/src/`
- **Migrations**: `migrations/v3/` (v3 baseline migration approach)
- **OAuth module**: `packages/AI/MCPClient/src/oauth/`
- **REST handlers**: `packages/MJServer/src/rest/`

---

## Phase 1: Setup (Shared Infrastructure)

**Purpose**: Project initialization and OAuth module structure

- [X] T001 Create OAuth module directory structure at packages/AI/MCPClient/src/oauth/
- [X] T002 [P] Create OAuth module barrel export at packages/AI/MCPClient/src/oauth/index.ts
- [X] T003 [P] Update package.json dependencies if needed (verify jose is available or use Node crypto) at packages/AI/MCPClient/package.json

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: Core infrastructure that MUST be complete before ANY user story can be implemented

**CRITICAL**: No user story work can begin until this phase is complete

- [X] T004 Create database migration for OAuth entities at migrations/v3/V202601291200__v3.4.x_MCP_OAuth_Entities.sql
- [X] T005 Run Flyway migration to create OAuth tables in database
- [X] T006 Run CodeGen to generate TypeScript entity classes for new OAuth entities
- [X] T007 Verify generated entity classes exist in packages/MJCoreEntities/src/generated/entity_subclasses.ts
- [X] T008 [P] Create OAuth-specific TypeScript interfaces at packages/AI/MCPClient/src/oauth/types.ts
- [X] T009 [P] Create PKCE generator utility at packages/AI/MCPClient/src/oauth/PKCEGenerator.ts
- [X] T010 Add 'OAuth2' to DefaultAuthType value list in MCP Servers entity (added via CodeGen)

**Checkpoint**: Foundation ready - user story implementation can now begin in parallel

---

## Phase 3: User Story 1 - First-Time OAuth Connection (Priority: P1) - MVP

**Goal**: Users can connect to an OAuth-protected MCP server for the first time via browser-based consent flow, without manually managing tokens or client credentials.

**Independent Test**: Configure an MCP server with OAuth2 auth type and OAuthIssuerURL pointing to Auth0/Cognito. Attempt connection and verify authorization URL is returned, user can complete consent in browser, and connection succeeds after callback.

### Implementation for User Story 1

- [X] T011 [US1] Implement AuthServerDiscovery class for RFC 8414 metadata discovery at packages/AI/MCPClient/src/oauth/AuthServerDiscovery.ts
- [X] T012 [US1] Implement metadata caching using MJ: O Auth Auth Server Metadata Cache entity in AuthServerDiscovery.ts
- [X] T013 [US1] Implement ClientRegistration class for RFC 7591 DCR at packages/AI/MCPClient/src/oauth/ClientRegistration.ts
- [X] T014 [US1] Implement fallback to pre-configured client credentials when DCR not supported in ClientRegistration.ts
- [X] T015 [US1] Implement TokenManager class for token storage via CredentialEngine at packages/AI/MCPClient/src/oauth/TokenManager.ts
- [X] T016 [US1] Add method to store new OAuth tokens in TokenManager using OAuth2 Authorization Code credential type
- [X] T017 [US1] Implement OAuthManager class as main orchestrator at packages/AI/MCPClient/src/oauth/OAuthManager.ts
- [X] T018 [US1] Implement initiateAuthorizationFlow() in OAuthManager to create authorization URL with PKCE
- [X] T019 [US1] Implement authorization state tracking using MJ: O Auth Authorization States entity in OAuthManager
- [X] T020 [US1] Implement OAuthCallbackHandler for REST callback at packages/MJServer/src/rest/OAuthCallbackHandler.ts
- [X] T021 [US1] Implement code-to-token exchange in OAuthCallbackHandler
- [X] T022 [US1] Register OAuth callback route at /oauth/callback (unauthenticated) in packages/MJServer/src/rest/setupRESTEndpoints.ts
- [X] T023 [US1] Implement getAccessToken() in OAuthManager to check for valid tokens before connection
- [X] T024 [US1] Integrate OAuthManager into MCPClientManager.getCredentials() at packages/AI/MCPClient/src/MCPClientManager.ts
- [X] T025 [US1] Add OAuth2 authentication type handling in MCPClientManager.connect() flow

**Checkpoint**: At this point, User Story 1 should be fully functional - users can complete first-time OAuth connection

---

## Phase 4: User Story 2 - Automatic Token Refresh (Priority: P1)

**Goal**: Tokens are automatically refreshed before expiration without user interaction, maintaining seamless access.

**Independent Test**: Establish OAuth connection, wait for token to approach expiration (or simulate with short-lived tokens), verify automatic refresh occurs and connection continues working.

**Dependencies**: Requires US1 TokenManager foundation

### Implementation for User Story 2

- [X] T026 [US2] Implement token expiration checking in TokenManager.isTokenValid() with configurable threshold (default 5 min)
- [X] T027 [US2] Implement refreshTokens() method in TokenManager for token refresh flow
- [X] T028 [US2] Implement concurrent refresh protection using async mutex pattern in TokenManager
- [X] T029 [US2] Add proactive token refresh check in OAuthManager.getAccessToken() before returning token
- [X] T030 [US2] Update stored credentials after successful refresh in TokenManager
- [X] T031 [US2] Add retry logic with exponential backoff for refresh failures in TokenManager

**Checkpoint**: At this point, User Story 2 should be fully functional - tokens refresh automatically

---

## Phase 5: User Story 3 - Re-Authorization on Refresh Failure (Priority: P2)

**Goal**: When token refresh fails, users see clear messages and can re-authorize without cryptic errors.

**Independent Test**: Revoke refresh token on auth server side, attempt to use connection, verify clear re-authorization message appears and re-authorization flow works.

**Dependencies**: Requires US1 and US2 foundation

### Implementation for User Story 3

- [X] T032 [US3] Implement user-friendly error message mapping in packages/AI/MCPClient/src/oauth/ErrorMessages.ts
- [X] T033 [US3] Add markRequiresReauthorization() method to OAuthManager for failed refresh handling
- [X] T034 [US3] Implement handleRefreshFailure() in TokenManager to detect revoked/expired refresh tokens
- [X] T035 [US3] Add reauthorization flow that preserves existing client registration when possible in OAuthManager
- [X] T036 [US3] Clear expired authorization states in OAuthManager when re-authorization starts
- [X] T037 [US3] Add 'requiresReauthorization' status to MCPClientManager connection state

**Checkpoint**: At this point, User Story 3 should be fully functional - graceful handling of refresh failures

---

## Phase 6: User Story 4 - Administrator OAuth Server Configuration (Priority: P2)

**Goal**: Administrators can configure OAuth settings for MCP servers, including issuer URL, scopes, and optional pre-configured client credentials.

**Independent Test**: As admin, configure MCP server with OAuth2 auth type, verify metadata discovery runs on save, verify both DCR and pre-configured client modes work.

**Dependencies**: Requires Foundational phase (OAuth fields on MCP Servers entity)

### Implementation for User Story 4

- [X] T038 [US4] Add OAuthIssuerURL, OAuthScopes, OAuthMetadataCacheTTLMinutes fields to MCPServer (via migration + CodeGen)
- [X] T039 [US4] Add OAuthClientID, OAuthClientSecretEncrypted fields for pre-configured client support (via migration + CodeGen)
- [X] T040 [US4] Implement validateOAuthConfiguration() in OAuthManager to verify issuer URL on save
- [ ] T041 [US4] Add metadata pre-fetch on MCP Server save when OAuth is configured
- [X] T042 [US4] Add GraphQL query getMCPOAuthConnectionStatus to MCPResolver at packages/MJServer/src/resolvers/MCPResolver.ts
- [X] T043 [US4] Add GraphQL mutation initiateMCPOAuth to MCPResolver
- [X] T044 [US4] Add REST endpoint POST /oauth/initiate in OAuthCallbackHandler (implemented)

**Checkpoint**: At this point, User Story 4 should be fully functional - admins can configure OAuth servers

---

## Phase 7: User Story 5 - Credential Revocation and Audit (Priority: P3)

**Goal**: Administrators can revoke OAuth access and view audit trail of authorization events.

**Independent Test**: As admin, revoke user's OAuth credentials in MJ, verify connection fails for that user and audit log shows revocation event.

**Dependencies**: Requires US1 token storage foundation

### Implementation for User Story 5

- [X] T045 [US5] Implement revokeCredentials() method in TokenManager to delete stored tokens
- [X] T046 [US5] Add GraphQL mutation revokeMCPOAuth to MCPResolver
- [ ] T047 [US5] Implement audit logging for OAuth authorization initiated event
- [ ] T048 [US5] Implement audit logging for OAuth authorization completed event
- [ ] T049 [US5] Implement audit logging for OAuth token refreshed event
- [ ] T050 [US5] Implement audit logging for OAuth token refresh failed event
- [ ] T051 [US5] Implement audit logging for OAuth credentials revoked event
- [X] T052 [US5] Add GraphQL mutation refreshMCPOAuthToken for manual token refresh
- [X] T053 [US5] Add REST endpoint GET /oauth/status/{stateParameter} in OAuthCallbackHandler (implemented)

**Checkpoint**: At this point, User Story 5 should be fully functional - credential revocation and audit working

---

## Phase 8: Bug Fixes & Critical UX

**Purpose**: Fix blocking issues discovered during implementation

### Bug: MCP Entity Delete Not Working (CRITICAL)

- [X] T054 [BUG] Debug why entity.Delete() doesn't send GraphQL mutation in mcp-dashboard.component.ts
- [X] T055 [BUG] Fix deleteServer() method at packages/Angular/Explorer/dashboards/src/MCP/mcp-dashboard.component.ts:821
- [X] T056 [BUG] Fix deleteConnection() method at packages/Angular/Explorer/dashboards/src/MCP/mcp-dashboard.component.ts:865
- [X] T057 [BUG] Fix deleteTool() method if it exists, or verify tool deletion works (verified: no deleteTool method exists, tools are managed via sync)

### Missing UI: OAuth Fields in Server Dialog (CRITICAL)

- [X] T058 [UI] Add OAuthIssuerURL field to mcp-server-dialog.component.html (show when DefaultAuthType='OAuth2')
- [X] T059 [UI] Add OAuthScopes field to mcp-server-dialog.component.html
- [X] T060 [UI] Add OAuthClientID and OAuthClientSecretEncrypted fields for pre-configured client mode
- [X] T061 [UI] Add OAuthMetadataCacheTTLMinutes field with sensible default (1440 min = 24 hours)
- [X] T062 [UI] Update mcp-server-dialog.component.ts validators to require OAuthIssuerURL when auth type is OAuth2
- [ ] T063 [UI] Add metadata discovery test button to verify OAuth issuer URL is valid

### UX: OAuth Redirect Flow (Instead of Copy/Paste)

- [ ] T064 [UX] Add FrontendReturnURL field to OAuthAuthorizationState entity (migration)
- [ ] T065 [UX] Update initiateAuthorizationFlow() to accept and store frontend return URL
- [ ] T066 [UX] Update REST POST /oauth/initiate to accept frontendReturnUrl parameter
- [ ] T067 [UX] Update OAuth callback success handler to redirect to frontend URL instead of showing HTML page
- [ ] T068 [UX] Create frontend OAuth completion page/component in MJExplorer
- [ ] T069 [UX] Update MCPServerDialog to open OAuth URL in new window/redirect and poll for completion
- [ ] T070 [UX] Handle OAuth completion notification in frontend (close dialog, refresh data)

---

## Phase 9: Live UI Updates & Event Integration

**Purpose**: Real-time UI updates when MCP entities change

### MCPClientManager Event Emissions

- [ ] T071 [P] Add 'authorizationRequired' event emission to MCPClientManager
- [ ] T072 [P] Add 'authorizationCompleted' event emission to MCPClientManager
- [ ] T073 [P] Add 'tokenRefreshed' event emission to MCPClientManager
- [ ] T074 [P] Add 'tokenRefreshFailed' event emission to MCPClientManager

### GraphQL Subscriptions for MCP Entities

- [ ] T075 Implement GraphQL subscription onMCPServerChanged in MCPResolver
- [ ] T076 Implement GraphQL subscription onMCPConnectionChanged in MCPResolver
- [ ] T077 Implement GraphQL subscription onMCPToolChanged in MCPResolver
- [ ] T078 Implement GraphQL subscription onMCPOAuthCompleted in MCPResolver

### Frontend Subscription Integration

- [ ] T079 [UI] Subscribe to MCP entity changes in mcp-dashboard.component.ts
- [ ] T080 [UI] Update dashboard data reactively when subscriptions fire
- [ ] T081 [UI] Show real-time status updates for OAuth flows in progress

---

## Phase 10: Final Polish

**Purpose**: Cleanup, testing, and validation

- [ ] T082 Add cleanup job for expired OAuth Authorization States (older than 24 hours)
- [ ] T083 Add OAuth status indicator integration points in MCPClientManager for UI reactivity
- [ ] T084 Verify all error paths return user-friendly messages per ErrorMessages.ts
- [ ] T085 Run quickstart.md validation scenarios against Auth0 test tenant
- [ ] T086 Run quickstart.md validation scenarios against Cognito test tenant

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (Phase 1)**: ✅ Complete
- **Foundational (Phase 2)**: ✅ Complete
- **User Stories (Phase 3-7)**: ✅ Core implementation complete
  - US1-US3: ✅ Complete (core OAuth flow)
  - US4: 🔶 Partial (DB fields done, UI/GraphQL pending)
  - US5: 🔶 Partial (revocation done, audit pending)
- **Bug Fixes & Critical UX (Phase 8)**: ⬜ **PRIORITY** - Blocks usability
  - Delete bug fix: Independent, can start immediately
  - OAuth UI fields: Independent, can start immediately
  - OAuth redirect flow: Depends on frontend changes
- **Live UI Updates (Phase 9)**: Depends on Phase 8 completion
- **Final Polish (Phase 10)**: Depends on Phase 9 completion

### User Story Dependencies

- **User Story 1 (P1)**: Can start after Foundational (Phase 2) - No dependencies on other stories
- **User Story 2 (P1)**: Can start after US1 TokenManager is complete (T015-T016)
- **User Story 3 (P2)**: Can start after US2 refresh flow is complete
- **User Story 4 (P2)**: Can start after Foundational (Phase 2) - Independent of US1-3
- **User Story 5 (P3)**: Can start after US1 TokenManager is complete (T015-T016)

### Within Each User Story

- OAuthManager depends on AuthServerDiscovery, ClientRegistration, TokenManager, PKCEGenerator
- REST callback handler depends on OAuthManager
- MCPClientManager integration depends on OAuthManager
- GraphQL mutations depend on OAuthManager

### Parallel Opportunities

- All Setup tasks can run in parallel after T001 (directory structure)
- Foundational tasks T008 and T009 can run in parallel
- US1: T011-T014 (discovery, registration, PKCE) can start in parallel
- US4: Can run entirely in parallel with US1-US3
- US5 T047-T051 (audit logging tasks) can run in parallel
- Polish tasks T054-T057 (event emissions) can run in parallel

---

## Parallel Example: User Story 1

```bash
# Launch AuthServerDiscovery and ClientRegistration in parallel (different files):
Task: "Implement AuthServerDiscovery class for RFC 8414 metadata discovery at packages/AI/MCPClient/src/oauth/AuthServerDiscovery.ts"
Task: "Implement ClientRegistration class for RFC 7591 DCR at packages/AI/MCPClient/src/oauth/ClientRegistration.ts"

# Launch OAuthCallbackHandler and GraphQL mutations in parallel (different files):
Task: "Implement OAuthCallbackHandler for REST callback at packages/MJServer/src/rest/OAuthCallbackHandler.ts"
Task: "Add GraphQL mutation initiateMCPOAuth to MCPResolver"
```

---

## Implementation Strategy

### MVP First (User Story 1 Only)

1. Complete Phase 1: Setup
2. Complete Phase 2: Foundational (CRITICAL - blocks all stories)
3. Complete Phase 3: User Story 1 (First-Time OAuth Connection)
4. **STOP and VALIDATE**: Test first-time connection against Auth0 test tenant
5. Deploy/demo if ready - users can now connect to OAuth-protected MCP servers

### Incremental Delivery

1. Complete Setup + Foundational -> Foundation ready
2. Add User Story 1 -> Test independently -> MVP ready (basic OAuth connection)
3. Add User Story 2 -> Test independently -> Seamless token refresh
4. Add User Story 3 -> Test independently -> Graceful error handling
5. Add User Story 4 -> Test independently -> Admin configuration
6. Add User Story 5 -> Test independently -> Revocation and audit
7. Each story adds value without breaking previous stories

### Parallel Team Strategy

With multiple developers:

1. Team completes Setup + Foundational together
2. Once Foundational is done:
   - Developer A: User Story 1 (core OAuth flow)
   - Developer B: User Story 4 (admin configuration, GraphQL)
3. After US1 basics done:
   - Developer A: User Story 2 + 3 (token refresh, error handling)
   - Developer B: User Story 5 (revocation, audit)
4. Stories complete and integrate independently

---

## File Summary

### Existing OAuth Implementation Files

| File                                                       | Tasks                                 | Purpose                     |
| ---------------------------------------------------------- | ------------------------------------- | --------------------------- |
| `packages/AI/MCPClient/src/oauth/index.ts`                 | T002                                  | Module barrel export        |
| `packages/AI/MCPClient/src/oauth/types.ts`                 | T008                                  | OAuth TypeScript interfaces |
| `packages/AI/MCPClient/src/oauth/PKCEGenerator.ts`         | T009                                  | PKCE challenge generation   |
| `packages/AI/MCPClient/src/oauth/AuthServerDiscovery.ts`   | T011-T012                             | RFC 8414 metadata discovery |
| `packages/AI/MCPClient/src/oauth/ClientRegistration.ts`    | T013-T014                             | RFC 7591 DCR                |
| `packages/AI/MCPClient/src/oauth/TokenManager.ts`          | T015-T016, T026-T031, T045            | Token storage and refresh   |
| `packages/AI/MCPClient/src/oauth/OAuthManager.ts`          | T017-T019, T023, T033-T036, T040-T041 | OAuth orchestration         |
| `packages/AI/MCPClient/src/oauth/ErrorMessages.ts`         | T032                                  | User-friendly error mapping |
| `packages/AI/MCPClient/src/MCPClientManager.ts`            | T024-T025, T037, T071-T074            | Integration and events      |
| `packages/MJServer/src/rest/OAuthCallbackHandler.ts`       | T020-T021, T044, T053, T067           | REST callback handling      |
| `packages/MJServer/src/rest/setupRESTEndpoints.ts`         | T022                                  | Route registration          |
| `packages/MJServer/src/resolvers/MCPResolver.ts`           | T042-T043, T046, T052, T075-T078      | GraphQL mutations/queries   |
| `migrations/v3/V202601291200__v3.4.x_MCP_OAuth_Entities.sql` | T004                                  | Database migration          |

### New Files for Bug Fixes & UX (Phase 8-9)

| File                                                       | Tasks                                 | Purpose                     |
| ---------------------------------------------------------- | ------------------------------------- | --------------------------- |
| `packages/Angular/Explorer/dashboards/src/MCP/mcp-dashboard.component.ts` | T054-T057, T079-T081 | Fix delete, add subscriptions |
| `packages/Angular/Explorer/dashboards/src/MCP/components/mcp-server-dialog.component.ts` | T058-T063 | Add OAuth configuration fields |
| `packages/Angular/Explorer/dashboards/src/MCP/components/mcp-server-dialog.component.html` | T058-T061 | OAuth field templates |
| `packages/Angular/Explorer/dashboards/src/MCP/components/mcp-connection-dialog.component.ts` | T069-T070 | OAuth redirect handling |
| TBD: OAuth completion page component | T068 | Frontend OAuth completion UI |

---

## Notes

- [P] tasks = different files, no dependencies
- [Story] label maps task to specific user story for traceability
- Each user story should be independently completable and testable
- Commit after each task or logical group
- Stop at any checkpoint to validate story independently
- Avoid: vague tasks, same file conflicts, cross-story dependencies that break independence
- All OAuth logic should use `contextUser` parameter for multi-tenant safety
- Token storage uses existing CredentialEngine encryption - no custom encryption needed
- PKCE uses S256 method exclusively (OAuth 2.1 requirement)
