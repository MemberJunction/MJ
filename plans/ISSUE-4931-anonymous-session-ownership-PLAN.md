# Anonymous Realtime Session Ownership Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use `superpowers:subagent-driven-development` (recommended) or `superpowers:executing-plans` to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Enforce per-visitor ownership (`AnonymousVisitorID` from signed `mj_sid`) across all realtime session write and read gates (`LoadOwnedRealtimeSession`, `AgentSessionResolver`, `RemoteBrowserActionResolver`, `RealtimeClientSessionResolver` prior-session readers, and `AuthorizeSessionAccess`), and preserve the visitor's `sessionId` (`mj_sid`) across widget token refreshes via bearer-token verification.

**Architecture:**
1. Add a non-enumerable `AnonymousVisitorID?: string` getter/setter on `UserInfo` (`@memberjunction/core`), preserve it in `CloneUserForSessionContext`, populate it from `mj_sid` in `buildMagicLinkSessionUser` when `mj_anon === true` (throwing if `mj_sid` is missing/blank), stamp `conversation.ExternalID` with `AnonymousVisitorID` for anonymous principals in `SessionManager.createConversation`, and check `AnonymousVisitorID` against `ConversationExternalID` for anonymous principals in `AuthorizeSessionAccess` (while keeping `MagicLinkScope.ResourceID` for non-anonymous scoped principals).
2. Update `LoadOwnedRealtimeSession` to load `ConversationExternalID` via `LoadSessionConversationExternalID` and enforce `AuthorizeSessionAccess`; route `AgentSessionResolver` (`CloseAgentSession`, `AgentSessionHeartbeat`) and `RemoteBrowserActionResolver.loadOwnedSession` through `LoadOwnedRealtimeSession`; route `RealtimeClientSessionResolver.loadPriorChannelStatesJson` and `collectOwnedPriorLegIDs` through `LoadSessionForAccess` + `AuthorizeSessionAccess`.
3. Update `WidgetRouter` (`POST /widget/session/refresh`), `WidgetSessionService.RefreshGuestSession` (`REFRESH_GRACE_SECONDS = 300`), `WidgetKeyClient.Refresh`, and `WidgetSessionClient.Refresh` so refresh sends `Authorization: Bearer <token>`, verifies the signature and `mj_widget_id` with a 300-second expiry grace window, and re-mints with the existing `mj_sid`.

**Tech Stack:** TypeScript, Vitest, `@memberjunction/core`, `@memberjunction/server`, `@memberjunction/ng-realtime-widget`, `@memberjunction/realtime-widget`

---

### Task 1: Add `AnonymousVisitorID` to `UserInfo` in `@memberjunction/core`

**Files:**
- Modify: `packages/MJCore/src/generic/securityInfo.ts`
- Modify: `packages/MJCore/src/__tests__/securityInfo.test.ts`

- [ ] **Step 1: Write the failing test in `packages/MJCore/src/__tests__/securityInfo.test.ts`**

Add a unit test verifying `user.AnonymousVisitorID` defaults to `undefined`, stores a string value via its setter, and is non-enumerable (`Object.keys(user)` and `JSON.stringify(user)` do not include `_anonymousVisitorID` or `AnonymousVisitorID`).

- [ ] **Step 2: Run the test to verify it fails**

Run: `cd /Users/sohamdesai/Projects/mj-slots/e1/MJ/packages/MJCore && npx vitest run src/__tests__/securityInfo.test.ts`
Expected: FAIL (`AnonymousVisitorID` is not defined on `UserInfo`).

- [ ] **Step 3: Implement `AnonymousVisitorID` on `UserInfo` in `packages/MJCore/src/generic/securityInfo.ts`**

Add `private _anonymousVisitorID?: string = undefined;` next to `_isMagicLinkAnonymous`, add the `AnonymousVisitorID` getter/setter, and mark `_anonymousVisitorID` non-enumerable in `UserInfo`'s constructor `Object.defineProperty` list.

- [ ] **Step 4: Run the test and build `@memberjunction/core`**

Run:
- `cd /Users/sohamdesai/Projects/mj-slots/e1/MJ/packages/MJCore && npx vitest run src/__tests__/securityInfo.test.ts`
- `cd /Users/sohamdesai/Projects/mj-slots/e1/MJ/packages/MJCore && npm run build`
Expected: PASS and clean build.

- [ ] **Step 5: Commit Task 1**

Commit `packages/MJCore/src/generic/securityInfo.ts` and `packages/MJCore/src/__tests__/securityInfo.test.ts`.

---

### Task 2: Wire `AnonymousVisitorID` through clone, magic-link session user, conversation stamping, and `AuthorizeSessionAccess`

**Files:**
- Modify: `packages/MJServer/src/auth/sessionUserClone.ts`
- Modify: `packages/MJServer/src/context.ts`
- Modify: `packages/MJServer/src/agentSessions/SessionManager.ts`
- Modify: `packages/MJServer/src/realtimeSessions/sessionAccess.ts`
- Modify: `packages/MJServer/src/__tests__/sessionUserClone.test.ts`
- Modify: `packages/MJServer/src/__tests__/SessionManager.test.ts`
- Modify: `packages/MJServer/src/__tests__/realtimeSessions/sessionAccess.test.ts`
- Modify: `packages/MJServer/src/__tests__/realtimeSessions/sessionConfigStamps.test.ts`
- Modify: `packages/MJServer/src/__tests__/realtimeSessions/RealtimeSessionEventsResolver.test.ts`
- Modify: `packages/MJServer/src/__tests__/realtimeSessions/verificationWorkflow.test.ts`
- Modify: `packages/MJServer/src/__tests__/realtimeRecordingHandler.test.ts`

- [ ] **Step 1: Write failing unit tests for clone, `buildMagicLinkSessionUser`, `SessionManager.createConversation`, and `AuthorizeSessionAccess`**

- In `packages/MJServer/src/__tests__/sessionUserClone.test.ts`: assert `CloneUserForSessionContext` copies `AnonymousVisitorID`, does not write back to source when mutated on clone, and leaves `AnonymousVisitorID` undefined on a context-free user.
- In `packages/MJServer/src/__tests__/SessionManager.test.ts`: assert `CreateSession` stamps `conversation.ExternalID = contextUser.AnonymousVisitorID` for an anonymous principal (even when `MagicLinkScope` is undefined or has a different `ResourceID`), and still stamps `contextUser.MagicLinkScope.ResourceID` for a non-anonymous scoped principal.
- In `packages/MJServer/src/__tests__/realtimeSessions/sessionAccess.test.ts`: test `AuthorizeSessionAccess` for:
  - anonymous principal with matching `AnonymousVisitorID` (`Allowed: true`),
  - anonymous principal with mismatched `AnonymousVisitorID` (`Allowed: false, Reason: 'scope_mismatch'`),
  - anonymous principal with missing `AnonymousVisitorID` (`Allowed: false, Reason: 'scope_missing'`),
  - non-anonymous scoped principal with matching `MagicLinkScope.ResourceID` (`Allowed: true`) and mismatched `MagicLinkScope.ResourceID` (`Allowed: false, Reason: 'scope_mismatch'`),
  - named principal without scope (`Allowed: true`),
  - also test `buildMagicLinkSessionUser` (or in a dedicated test block) setting `AnonymousVisitorID` from `mj_sid` when `mj_anon === true`, rejecting an anonymous payload without `mj_sid`, and leaving `AnonymousVisitorID` undefined for a named payload.

- [ ] **Step 2: Run the tests to verify they fail**

Run: `cd /Users/sohamdesai/Projects/mj-slots/e1/MJ/packages/MJServer && npx vitest run src/__tests__/sessionUserClone.test.ts src/__tests__/SessionManager.test.ts src/__tests__/realtimeSessions/sessionAccess.test.ts`
Expected: FAIL.

- [ ] **Step 3: Implement changes in `sessionUserClone.ts`, `context.ts`, `SessionManager.ts`, and `sessionAccess.ts`, and update anonymous test fixtures**

- `packages/MJServer/src/auth/sessionUserClone.ts`: copy `clone.AnonymousVisitorID = user.AnonymousVisitorID;`.
- `packages/MJServer/src/context.ts`: export `buildMagicLinkSessionUser` (or `@internal` named export) and when `isAnon` is true, require `typeof payload['mj_sid'] === 'string' && payload['mj_sid'].trim().length > 0`, setting `sessionUser.AnonymousVisitorID = sid`; throw an `Error` if missing/blank.
- `packages/MJServer/src/agentSessions/SessionManager.ts`: in `createConversation`, if `contextUser.IsMagicLinkAnonymous`, stamp `conversation.ExternalID = contextUser.AnonymousVisitorID` when present; else if `contextUser.MagicLinkScope?.ResourceID`, stamp `conversation.ExternalID = contextUser.MagicLinkScope.ResourceID`.
- `packages/MJServer/src/realtimeSessions/sessionAccess.ts`: add `AnonymousVisitorID?: string;` to `SessionAccessPrincipal`; in `AuthorizeSessionAccess`, branch on `principal.IsMagicLinkAnonymous` to require `principal.AnonymousVisitorID` and match `subject.ConversationExternalID`, and for non-anonymous principals keep checking `principal.MagicLinkScope?.ResourceID` when present.
- Update anonymous principal fixtures in `sessionConfigStamps.test.ts`, `RealtimeSessionEventsResolver.test.ts`, `verificationWorkflow.test.ts`, and `realtimeRecordingHandler.test.ts` to populate `AnonymousVisitorID`.

- [ ] **Step 4: Run the tests to verify they pass**

Run: `cd /Users/sohamdesai/Projects/mj-slots/e1/MJ/packages/MJServer && npx vitest run src/__tests__/sessionUserClone.test.ts src/__tests__/SessionManager.test.ts src/__tests__/realtimeSessions/ src/__tests__/realtimeRecordingHandler.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit Task 2**

Commit the changes for Task 2.

---

### Task 3: Route all 5 realtime session write/read gates through `AuthorizeSessionAccess`

**Files:**
- Modify: `packages/MJServer/src/realtimeSessions/ownedRealtimeSession.ts`
- Modify: `packages/MJServer/src/resolvers/AgentSessionResolver.ts`
- Modify: `packages/MJServer/src/resolvers/RemoteBrowserActionResolver.ts`
- Modify: `packages/MJServer/src/resolvers/RealtimeClientSessionResolver.ts`
- Modify: `packages/MJServer/src/__tests__/realtimeSessions/ownedRealtimeSession.anonymous.test.ts`
- Modify: `packages/MJServer/src/__tests__/RealtimeClientSessionResolver.test.ts`
- Modify: `packages/MJServer/src/__tests__/RealtimeClientSessionResolver.configTamper.test.ts`

- [ ] **Step 1: Write failing tests for all 5 gates with two anonymous visitors sharing `UserID`**

Expand `packages/MJServer/src/__tests__/realtimeSessions/ownedRealtimeSession.anonymous.test.ts` (updating `guest(scope)` to set `AnonymousVisitorID: scope` as well as `MagicLinkScope: { ResourceID: scope }`) to test:
1. `LoadOwnedRealtimeSession` — allows matching visitor, rejects second anonymous visitor sharing `UserID` with `RealtimeSessionOwnershipError`, rejects unscoped anonymous visitor with `RealtimeSessionOwnershipError`.
2. `AgentSessionResolver.CloseAgentSession` and `AgentSessionResolver.AgentSessionHeartbeat` — rejects second anonymous visitor sharing `UserID` with `'Not authorized: you do not own this agent session'`, allows matching visitor, and maps missing session to `'Agent session <id> not found'`.
3. `RemoteBrowserActionResolver` (`loadOwnedSession` via a mutation such as `CloseRemoteBrowserSession` or `HeartbeatRemoteBrowserSession`) — rejects second anonymous visitor sharing `UserID` with `'Not authorized: remote-browser session <id> is not owned by you.'` and maps missing session to `'Remote-browser session <id> not found.'`.
4. `RealtimeClientSessionResolver` (`StartRealtimeClientSession` with `lastSessionId` hitting `loadPriorChannelStatesJson` and `collectOwnedPriorLegIDs`) — omits `PriorChannelStatesJson` and `PriorTranscript` when a second anonymous visitor sharing `UserID` passes the first visitor's `lastSessionId`, and stops walking a multi-leg chain at the first leg owned by another anonymous visitor while keeping the caller's owned legs.

- [ ] **Step 2: Run the test suite to verify the new tests fail**

Run: `cd /Users/sohamdesai/Projects/mj-slots/e1/MJ/packages/MJServer && npx vitest run src/__tests__/realtimeSessions/ownedRealtimeSession.anonymous.test.ts`
Expected: FAIL.

- [ ] **Step 3: Implement the 5 gates**

- `packages/MJServer/src/realtimeSessions/ownedRealtimeSession.ts`: after checking `session.UserID`, call `LoadSessionConversationExternalID(session, contextUser, provider)` and `AuthorizeSessionAccess({ SessionUserID: session.UserID, ConversationExternalID: conversationExternalId }, contextUser)`. When `decision.Allowed === false`, log with `LogError` and throw `new RealtimeSessionOwnershipError(agentSessionId)`.
- `packages/MJServer/src/resolvers/AgentSessionResolver.ts`: remove `assertOwnership`, call `LoadOwnedRealtimeSession(agentSessionId, contextUser, provider)` inside `CloseAgentSession` and `AgentSessionHeartbeat` (via a private helper that maps `RealtimeSessionNotFoundError` to `new Error(\`Agent session \${agentSessionId} not found\`)` and `RealtimeSessionOwnershipError` to `new Error('Not authorized: you do not own this agent session')`).
- `packages/MJServer/src/resolvers/RemoteBrowserActionResolver.ts`: in `loadOwnedSession`, call `LoadOwnedRealtimeSession(agentSessionID, contextUser, provider)` and map `RealtimeSessionNotFoundError` to `new Error(\`Remote-browser session \${agentSessionID} not found.\`)` and `RealtimeSessionOwnershipError` to `new Error(\`Not authorized: remote-browser session \${agentSessionID} is not owned by you.\`)`.
- `packages/MJServer/src/resolvers/RealtimeClientSessionResolver.ts`: in `loadPriorChannelStatesJson` and `collectOwnedPriorLegIDs`, replace inline `GetEntityObject` + `UUIDsEqual` with `LoadSessionForAccess` + `AuthorizeSessionAccess`, preserving existing warning messages and return semantics.
- Update anonymous caller fixtures in `packages/MJServer/src/__tests__/RealtimeClientSessionResolver.test.ts` and `packages/MJServer/src/__tests__/RealtimeClientSessionResolver.configTamper.test.ts` to include `AnonymousVisitorID` and return matching `ExternalID` on `MJ: Conversations`.

- [ ] **Step 4: Run tests to verify all pass**

Run: `cd /Users/sohamdesai/Projects/mj-slots/e1/MJ/packages/MJServer && npx vitest run src/__tests__/realtimeSessions/ownedRealtimeSession.anonymous.test.ts src/__tests__/ownedRealtimeSession.test.ts src/__tests__/RealtimeClientSessionResolver.test.ts src/__tests__/RealtimeClientSessionResolver.configTamper.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit Task 3**

Commit the changes for Task 3.

---

### Task 4: Preserve `sessionId` (`mj_sid`) on widget token refresh across server and clients

**Files:**
- Modify: `packages/MJServer/src/auth/magicLink/MagicLinkKeys.ts`
- Modify: `packages/MJServer/src/realtimeWidget/WidgetRouter.ts`
- Modify: `packages/MJServer/src/realtimeWidget/WidgetSessionService.ts`
- Modify: `packages/MJServer/src/__tests__/WidgetSessionService.test.ts`
- Modify: `packages/Angular/Generic/realtime-widget/src/lib/auth/widget-key-client.ts`
- Modify: `packages/Angular/Generic/realtime-widget/src/lib/__tests__/widget-key-client.test.ts`
- Modify: `packages/Web/RealtimeWidget/src/session/widget-session-client.ts`
- Modify: `packages/Web/RealtimeWidget/src/__tests__/widget-session-client.test.ts`

- [ ] **Step 1: Write failing tests for server and client widget refresh**

- In `packages/MJServer/src/__tests__/WidgetSessionService.test.ts`:
  - `RefreshGuestSession` with a valid bearer token for the same widget preserves `sessionId` (`mj_sid`) on the refreshed token.
  - `RefreshGuestSession` accepts a token expired within `REFRESH_GRACE_SECONDS` (300s) and preserves `sessionId`.
  - `RefreshGuestSession` rejects a missing token, a garbage/bad-signature token, a token expired beyond 300s, and a token minted for a different `mj_widget_id` with a 403-mapped failure result (`success: false`).
  - `WidgetRouter` (`POST /widget/session/refresh`) extracts `Authorization: Bearer <token>` and returns HTTP 403 on missing/invalid/wrong-widget/expired-beyond-grace tokens and HTTP 200 with the preserved `sessionId` on valid refresh.
- In `packages/Angular/Generic/realtime-widget/src/lib/__tests__/widget-key-client.test.ts`:
  - `Mint` does not send an `Authorization` header.
  - `Refresh` sends `Authorization: Bearer <currentToken>` (both after `Mint()` and when passed a token).
- In `packages/Web/RealtimeWidget/src/__tests__/widget-session-client.test.ts`:
  - `Mint` does not send an `Authorization` header.
  - `Refresh` sends `Authorization: Bearer <currentToken>` (both after `Mint()` and when passed a token).

- [ ] **Step 2: Run the tests to verify they fail**

Run:
- `cd /Users/sohamdesai/Projects/mj-slots/e1/MJ/packages/MJServer && npx vitest run src/__tests__/WidgetSessionService.test.ts`
- `cd /Users/sohamdesai/Projects/mj-slots/e1/MJ/packages/Angular/Generic/realtime-widget && npm run test`
- `cd /Users/sohamdesai/Projects/mj-slots/e1/MJ/packages/Web/RealtimeWidget && npm run test`
Expected: FAIL.

- [ ] **Step 3: Implement server and client widget refresh changes**

- In `packages/MJServer/src/auth/magicLink/MagicLinkKeys.ts`: add `VerifyWithGrace(token: string, audience: string, maxExpiredSeconds: number): Record<string, unknown> | null` (or export public key verification helper using `this.keyPair.publicKey` and `jwt.verify` with `algorithms: ['RS256']`, `audience`, `clockTolerance: maxExpiredSeconds`).
- In `packages/MJServer/src/realtimeWidget/WidgetRouter.ts`: extract bearer token from `req.header('authorization')` when `refresh` is true and pass it to `service.RefreshGuestSession(body, origin, clientIp, userAgent, bearerToken)`.
- In `packages/MJServer/src/realtimeWidget/WidgetSessionService.ts`:
  - Export `REFRESH_GRACE_SECONDS = 300`.
  - In `RefreshGuestSession`, verify the bearer token before minting (after resolving widget + origin checks, or verify token + match `claims['mj_widget_id'] === widget.ID` and non-empty `claims['mj_sid']`), returning `{ success: false, errorCode: 'origin_not_allowed', message: 'Invalid or expired widget session token.' }` (which maps to HTTP 403 in `WidgetRouter`) when missing/invalid/expired-past-grace/wrong-widget.
  - Pass `existingSessionId` into `mintToken(..., existingSessionId)` so `mintToken` uses `existingSessionId ?? GenerateSessionId()`.
- In `packages/Angular/Generic/realtime-widget/src/lib/auth/widget-key-client.ts`: store `private currentToken: string | null = null` on `toSession`, accept `Refresh(token?: string): Promise<WidgetMintedSession>`, and include `Authorization: \`Bearer \${bearer}\`` header on `/widget/session/refresh` when `bearer` (`token ?? this.currentToken`) is present.
- In `packages/Web/RealtimeWidget/src/session/widget-session-client.ts`: store `private currentToken: string | undefined` on `toSession`, accept `Refresh(visitorKey?: string, token?: string): Promise<WidgetSession>`, and include `Authorization: \`Bearer \${bearer}\`` header on `/widget/session/refresh` when `bearer` (`token ?? this.currentToken`) is present.

- [ ] **Step 4: Run the tests to verify they pass**

Run:
- `cd /Users/sohamdesai/Projects/mj-slots/e1/MJ/packages/MJServer && npx vitest run src/__tests__/WidgetSessionService.test.ts src/__tests__/widget.test.ts`
- `cd /Users/sohamdesai/Projects/mj-slots/e1/MJ/packages/Angular/Generic/realtime-widget && npm run test`
- `cd /Users/sohamdesai/Projects/mj-slots/e1/MJ/packages/Web/RealtimeWidget && npm run test`
Expected: PASS.

- [ ] **Step 5: Commit Task 4**

Commit the changes for Task 4.

---

### Task 5: Full verification, publish-only checks, and live slot verification

- [ ] **Step 1: Build and test modified packages**
  - `MJCore`, `MJServer`, `@memberjunction/ng-realtime-widget`, `@memberjunction/realtime-widget`
- [ ] **Step 2: Run publish-only checks**
  - `git fetch --tags origin`
  - `pnpm run test:integration`
  - `npm run check:guards`
  - `npm run check:standards`
- [ ] **Step 3: Restart slot API and run live slot verification**
  - Restart API with `node /Users/sohamdesai/Projects/agent-pipeline/bin/sandbox.ts restart-api e1`
  - Verify Done-when #5 (widget guest 1 vs guest 2 + refresh with `Authorization: Bearer <token1>`)
  - Verify Done-when #6 (multi-use anonymous magic-link invite redeemed twice, visitor 2 refused on visitor 1's session)
  - Clean up any temporary rows created in `SBX_e1`.
