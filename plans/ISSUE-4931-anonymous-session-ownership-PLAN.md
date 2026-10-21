# Issue #4931 Implementation Plan: Per-Visitor Anonymous Session Ownership and Widget Token Refresh

> **For agentic workers:** REQUIRED SUB-SKILL: Use `superpowers:subagent-driven-development` and `superpowers:test-driven-development` to implement this plan task-by-task.

**Goal:** Enforce per-visitor ownership on every realtime session write and restore path using the anonymous token's `mj_sid` (`UserInfo.AnonymousVisitorID`), and preserve the visitor's `mj_sid` across widget token refreshes.

**Architecture:**
1. **Per-visitor identity (`AnonymousVisitorID`)**: Add non-enumerable `AnonymousVisitorID?: string` on `UserInfo` (`@memberjunction/core`). Populate it from `payload['mj_sid']` for every anonymous magic-link token in `buildMagicLinkSessionUser` (rejecting anonymous tokens without a non-empty `mj_sid`), copy it in `CloneUserForSessionContext`, stamp it onto `conversation.ExternalID` in `SessionManager.createConversation` for anonymous principals, and check it in `AuthorizeSessionAccess` when `principal.IsMagicLinkAnonymous` is true.
2. **Write and restore gates through `AuthorizeSessionAccess`**: `LoadOwnedRealtimeSession` loads the session conversation's `ExternalID` via `LoadSessionConversationExternalID` and enforces `AuthorizeSessionAccess`, throwing `RealtimeSessionOwnershipError` on refusal while logging the refusal reason. `AgentSessionResolver` (`CloseAgentSession`, `AgentSessionHeartbeat`) and `RemoteBrowserActionResolver.loadOwnedSession` delegate to `LoadOwnedRealtimeSession` while preserving their existing error messages. `RealtimeClientSessionResolver.loadPriorChannelStatesJson` and `collectOwnedPriorLegIDs` use `LoadSessionForAccess` + `AuthorizeSessionAccess`.
3. **Widget refresh keeps `sessionId`**: `WidgetSessionService.RefreshGuestSession` verifies the caller's `Authorization: Bearer <token>` via `MagicLinkKeyManager` (allowing expired tokens within `REFRESH_GRACE_SECONDS = 300`), checks `mj_widget_id` matches the widget resolved from `widgetKey`, and re-mints with the token's `mj_sid`. `WidgetRouter.handleMint` forwards the `Authorization` header on `refresh = true`. Both the Angular (`WidgetKeyClient.Refresh`) and standalone (`WidgetSessionClient.Refresh`) widget clients pass the current token in `Authorization: Bearer <token>`.

**Tech Stack:** TypeScript, Vitest, Express, TypeGraphQL, `@memberjunction/core`, `@memberjunction/server`, `@memberjunction/ng-realtime-widget`, `@memberjunction/realtime-widget`.

---

### Task 1: `UserInfo.AnonymousVisitorID` in `@memberjunction/core`

**Files:**
- Modify: `packages/MJCore/src/generic/securityInfo.ts`
- Modify: `packages/MJCore/src/__tests__/securityInfo.test.ts` (or add test in `packages/MJCore/src/__tests__/`)

**Steps:**
1. Write a failing unit test in `packages/MJCore/src/__tests__/securityInfo.test.ts` verifying that `UserInfo.AnonymousVisitorID` defaults to `undefined`, can be set and read, and is non-enumerable (`Object.keys(user)` and `JSON.stringify(user)` do not include `_anonymousVisitorID` or `AnonymousVisitorID`).
2. Add `private _anonymousVisitorID?: string = undefined;` to `UserInfo` in `packages/MJCore/src/generic/securityInfo.ts`, mark `_anonymousVisitorID` non-enumerable in the constructor alongside `_magicLinkScope` and `_isMagicLinkAnonymous`, and expose `get AnonymousVisitorID(): string | undefined` and `set AnonymousVisitorID(value: string | undefined)`.
3. Run `cd packages/MJCore && pnpm test` and `cd packages/MJCore && pnpm run build` so `@memberjunction/server` sees the updated type.
4. Commit Task 1.

---

### Task 2: `AnonymousVisitorID` Population, Cloning, Conversation Stamping, and `AuthorizeSessionAccess`

**Files:**
- Modify: `packages/MJServer/src/auth/sessionUserClone.ts`
- Modify: `packages/MJServer/src/context.ts`
- Modify: `packages/MJServer/src/agentSessions/SessionManager.ts`
- Modify: `packages/MJServer/src/realtimeSessions/sessionAccess.ts`
- Modify: `packages/MJServer/src/__tests__/sessionUserClone.test.ts`
- Modify: `packages/MJServer/src/__tests__/WidgetAuthIntegration.test.ts`
- Modify: `packages/MJServer/src/__tests__/SessionManager.test.ts`
- Modify: `packages/MJServer/src/__tests__/realtimeSessions/sessionAccess.test.ts`

**Steps:**
1. Write failing tests:
   - `sessionUserClone.test.ts`: `CloneUserForSessionContext` copies `AnonymousVisitorID` onto the clone and keeps it isolated from mutations on the source.
   - `WidgetAuthIntegration.test.ts`: `buildMagicLinkSessionUser` sets `sessionUser.AnonymousVisitorID` from `mj_sid` on an anonymous token (`mj_anon: true`), rejects an anonymous token whose `mj_sid` is missing or empty, and leaves `AnonymousVisitorID` `undefined` on a non-anonymous token while keeping `MagicLinkScope.ResourceID` untouched.
   - `SessionManager.test.ts`: `CreateSession` stamps `conversation.ExternalID` with `contextUser.AnonymousVisitorID` when `contextUser.IsMagicLinkAnonymous` is true, and continues stamping `contextUser.MagicLinkScope?.ResourceID` for non-anonymous scoped principals.
   - `sessionAccess.test.ts`: `AuthorizeSessionAccess` compares `principal.AnonymousVisitorID` with `subject.ConversationExternalID` when `principal.IsMagicLinkAnonymous` is true (even when `MagicLinkScope` is `{}` or has a shared `ResourceID`), refuses with `scope_missing` when `AnonymousVisitorID` is absent on an anonymous principal, and compares `principal.MagicLinkScope?.ResourceID` for a non-anonymous scoped principal.
2. Implement the changes in `sessionUserClone.ts`, `context.ts`, `SessionManager.ts`, and `sessionAccess.ts`. Also export `LoadSessionConversationExternalID` from `sessionAccess.ts` so `LoadOwnedRealtimeSession` can share the exact conversation `ExternalID` loader.
3. Run the unit tests in `packages/MJServer` for those four test files and verify they pass.
4. Commit Task 2.

---

### Task 3: Route Every Realtime Session Write and Restore Gate Through `AuthorizeSessionAccess`

**Files:**
- Modify: `packages/MJServer/src/realtimeSessions/ownedRealtimeSession.ts`
- Modify: `packages/MJServer/src/resolvers/AgentSessionResolver.ts`
- Modify: `packages/MJServer/src/resolvers/RemoteBrowserActionResolver.ts`
- Modify: `packages/MJServer/src/resolvers/RealtimeClientSessionResolver.ts`
- Modify: `packages/MJServer/src/__tests__/realtimeSessions/ownedRealtimeSession.anonymous.test.ts`
- Modify: `packages/MJServer/src/__tests__/RemoteBrowserActionResolver.test.ts`
- Modify: `packages/MJServer/src/__tests__/RealtimeClientSessionResolver.test.ts`
- Modify: `packages/MJServer/src/__tests__/realtimeSessions/RealtimeSessionEventsResolver.test.ts`
- Modify: `packages/MJServer/src/__tests__/realtimeSessions/verificationWorkflow.test.ts`
- Modify: `packages/MJServer/src/__tests__/realtimeSessions/sessionConfigStamps.test.ts`
- Modify: `packages/MJServer/src/__tests__/RealtimeRecordingHandler.test.ts`

**Steps:**
1. Update the anonymous test fixtures (`ownedRealtimeSession.anonymous.test.ts`, `RealtimeSessionEventsResolver.test.ts`, `verificationWorkflow.test.ts`, `sessionConfigStamps.test.ts`, `RealtimeRecordingHandler.test.ts`, `RealtimeClientSessionResolver.test.ts`) so anonymous principals carry `AnonymousVisitorID` and anonymous fixture sessions carry matching conversation `ExternalID`.
2. Add tests covering:
   - `LoadOwnedRealtimeSession`: allows the matching anonymous visitor, refuses a different anonymous visitor (`RealtimeSessionOwnershipError`) and logs the refusal reason, refuses an anonymous visitor with no `AnonymousVisitorID`, and refuses when the session has no conversation or no `ExternalID` while still allowing a named user with no conversation.
   - `AgentSessionResolver`: `CloseAgentSession` and `AgentSessionHeartbeat` refuse another anonymous visitor with `'Not authorized: you do not own this agent session'` and do not call `SessionManager.CloseSession` or `Heartbeat`, while preserving `'Agent session <id> not found'` on missing sessions.
   - `RemoteBrowserActionResolver`: refuses another anonymous visitor with `'Not authorized: remote-browser session <id> is not owned by you.'` while preserving `'Remote-browser session <id> not found.'` on missing sessions.
   - `RealtimeClientSessionResolver`: `StartRealtimeClientSession` with `lastSessionId` skips `loadPriorChannelStatesJson` and `collectOwnedPriorLegIDs` when an anonymous visitor passes another anonymous visitor's session ID (or when a deeper leg in the chain belongs to another anonymous visitor), and restores them when the anonymous visitor owns the session.
3. Implement the changes in `ownedRealtimeSession.ts`, `AgentSessionResolver.ts`, `RemoteBrowserActionResolver.ts`, and `RealtimeClientSessionResolver.ts`.
4. Run `cd packages/MJServer && pnpm test` and verify all tests pass.
5. Commit Task 3.

---

### Task 4: Preserve `sessionId` (`mj_sid`) Across Widget Token Refresh in Server and Both Widget Clients

**Files:**
- Modify: `packages/MJServer/src/realtimeWidget/WidgetSessionService.ts`
- Modify: `packages/MJServer/src/realtimeWidget/WidgetRouter.ts`
- Modify: `packages/Angular/Generic/realtime-widget/src/lib/auth/widget-key-client.ts`
- Modify: `packages/Angular/Generic/realtime-widget/src/lib/session/widget-controller.ts`
- Modify: `packages/Web/RealtimeWidget/src/session/widget-session-client.ts`
- Modify: `packages/Web/RealtimeWidget/src/loader.ts`
- Modify: `packages/MJServer/src/__tests__/WidgetSessionService.test.ts`
- Modify: `packages/MJServer/src/__tests__/WidgetRouter.test.ts`
- Modify: `packages/Angular/Generic/realtime-widget/src/__tests__/widget-key-client.spec.ts`
- Modify: `packages/Angular/Generic/realtime-widget/src/__tests__/widget-controller.spec.ts`
- Modify: `packages/Web/RealtimeWidget/src/__tests__/widget-session-client.test.ts`

**Steps:**
1. Write failing tests:
   - `WidgetSessionService.test.ts`: `RefreshGuestSession` returns a token with the same `sessionId` (`mj_sid`) as the bearer token when valid or expired within `REFRESH_GRACE_SECONDS = 300`, and refuses (`not_found`) when the bearer token is missing, malformed, has a bad signature, is expired beyond `REFRESH_GRACE_SECONDS`, or has a `mj_widget_id` for a different widget.
   - `WidgetRouter.test.ts`: `POST /api/v1/realtime-widget/session` with `refresh: true` extracts the bearer token from the `Authorization` header and passes it to `RefreshGuestSession`.
   - `packages/Angular/Generic/realtime-widget/src/__tests__/widget-key-client.spec.ts` & `widget-controller.spec.ts`: `WidgetKeyClient.Refresh` sends `authorization: Bearer <token>`, `Mint` does not, and `WidgetController` passes its current token to `Refresh`.
   - `packages/Web/RealtimeWidget/src/__tests__/widget-session-client.test.ts`: `WidgetSessionClient.Refresh` sends `authorization: Bearer <token>` and `Mint` does not.
2. Implement the server and client refresh changes.
3. Run tests in `packages/MJServer`, `packages/Angular/Generic/realtime-widget`, and `packages/Web/RealtimeWidget`.
4. Commit Task 4.

---

### Task 5: Full Verification, Live Slot Smoke Checks, and PR Preparation

**Steps:**
1. Run unit tests across all touched packages (`packages/MJCore`, `packages/MJServer`, `packages/Angular/Generic/realtime-widget`, `packages/Web/RealtimeWidget`), plus `pnpm run test:integration`, `npm run check:guards`, and `npm run check:standards`.
2. Build server packages, restart slot `e1` API with `node /Users/sohamdesai/Projects/agent-pipeline/bin/sandbox.ts restart-api e1`, and run the live slot smoke checks against `http://localhost:4511/` verifying:
   - Visitor A mints a session, starts a conversation/realtime session, refreshes via `POST /api/v1/realtime-widget/session` with `refresh: true` and `Authorization: Bearer <tokenA>`, keeps the same `sessionId`, and can still act on its session (`AgentSessionHeartbeat`).
   - Visitor B mints a separate token for the same widget (`UserID` is the same shared `Anonymous` user, different `mj_sid`), attempts `CloseAgentSession`, `AgentSessionHeartbeat`, `SaveSessionChannelState`, and `StartRealtimeClientSession(lastSessionId: sessionA)` against Visitor A's session, and is refused on every write while `sessionA` stays untouched in `SBX_e1`.
3. Push to `origin HEAD:agent/issue-4931-20261021224920`, write the PR body and summary files, and emit `PIPELINE_RESULT`.
