# Anonymous Visitor Realtime Session Ownership & Refresh Identity Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

> **As shipped — corrections to this plan.** The plan was written before the branch was built; where it and the code differ, the code is right. The behavioural corrections are also marked inline (`[As shipped: …]`); renamed test paths are corrected in this table only.
>
> | Plan says | As shipped |
> |---|---|
> | `CloneSessionUserForRequest` | `CloneUserForSessionContext` (`packages/MJServer/src/auth/sessionUserClone.ts`) |
> | `WidgetSessionMintInput.bearerToken` | `MintGuestSessionInput.BearerToken` (the camelCase `bearerToken` is a deprecated alias) |
> | `jwt.verify(…, issuer: this.config.issuer, …)` | no issuer option: the token is signed by this server's own `MagicLinkKeyManager` key, checked with `algorithms`, `audience` and the manual grace window |
> | `loadAndAuthorizeWidget(…)` | `RefreshGuestSession` repeats `MintGuestSession`'s checks inline |
> | a bad, expired-past-grace or other-widget refresh token returns `errorCode: 'invalid_key'` / "Widget is unavailable for this origin." | it returns the uniform `{ success: false, errorCode: 'not_found', error: 'Unknown widget key.' }` (HTTP 403); an origin rejection keeps `EvaluateWidgetMint`'s own code |
> | `renewGuestToken` passes `this.guestSession?.Token` to `this.config.guestSource.Refresh(…)` | it passes `this.guest.token` to `this.guestSource.Refresh(…)` through `mintGuest` |
> | anonymous identity = `AnonymousVisitorID` (`mj_sid`) everywhere | `ResolveSessionScopeIdentity` (`realtimeSessions/sessionAccess.ts`): the token's `MagicLinkScope.ResourceID` when it carries one, else `mj_sid`; used by both `SessionManager` (the `ExternalID` stamp) and `AuthorizeSessionAccess`, so a resource-scoped anonymous invite visitor keeps matching the `{{ScopeResourceID}}` row filters |
> | (not in the plan) | `MJ: Conversations` / `MJ: AI Agent Sessions` server entities refuse an anonymous visitor changing `ExternalID` / `ConversationID` on an existing row (`MJCoreEntitiesServer/src/custom/anonymousOwnershipKeyGuard.ts`) |
> | `__tests__/agentSessions/SessionManager.createConversation.test.ts` | `__tests__/SessionManager.test.ts` |
> | `__tests__/realtimeSessions/ownedRealtimeSession.test.ts` | `__tests__/realtimeSessions/ownedRealtimeSession.anonymous.test.ts` |
> | `__tests__/agentSessions/AgentSessionResolver.test.ts` | `__tests__/AgentSessionResolver.ownership.test.ts` |
> | `__tests__/resolvers/RemoteBrowserActionResolver.ownership.test.ts` | `__tests__/RemoteBrowserActionResolver.ownership.test.ts` |
> | `__tests__/realtimeWidget/widgetSessionService.test.ts`, `…/widgetRouter.test.ts` | `__tests__/WidgetSessionService.test.ts` (no router test file) |
> | `src/lib/auth/widget-key-client.spec.ts`, `src/lib/session/widget-controller.spec.ts` | `src/__tests__/widget-key-client.test.ts`, `src/__tests__/widget-controller.test.ts` |

**Goal:** Enforce per-visitor ownership on all realtime session write gates using the per-token `mj_sid` claim (`UserInfo.AnonymousVisitorID`) and preserve `mj_sid` across widget guest token refreshes.

**Architecture:**
1. Add non-enumerable `AnonymousVisitorID?: string` on `UserInfo` (`@memberjunction/core`), populate it in `BuildMagicLinkSessionUser` (`@memberjunction/server`) from `payload['mj_sid']` when `mj_anon === true` (rejecting anonymous tokens without `mj_sid`), copy it in `CloneSessionUserForRequest`, stamp `conversation.ExternalID` with `AnonymousVisitorID` for anonymous principals in `SessionManager.createConversation`, and compare `principal.AnonymousVisitorID` with `subject.ConversationExternalID` in `AuthorizeSessionAccess`. **[As shipped: the clone is `CloneUserForSessionContext`; the stamp and the comparison both use `ResolveSessionScopeIdentity` — resource scope when present, else `mj_sid`.]**
2. Route all five realtime session write gates (`LoadOwnedRealtimeSession`, `AgentSessionResolver`, `RemoteBrowserActionResolver.loadOwnedSession`, `RealtimeClientSessionResolver.loadPriorChannelStatesJson`, and `RealtimeClientSessionResolver.collectOwnedPriorLegIDs`) through `AuthorizeSessionAccess`.
3. Require `Authorization: Bearer <currentToken>` on `POST /widget/session/refresh`, verify the token in `WidgetSessionService.RefreshGuestSession` with `MagicLinkKeyManager.Instance` (allowing up to `REFRESH_GRACE_SECONDS = 300` past `exp` and verifying `mj_widget_id`), re-mint with the existing `mj_sid`, and send the bearer header in both `WidgetKeyClient.Refresh` (`@memberjunction/ng-realtime-widget`) and `WidgetSessionClient.Refresh` (`@memberjunction/realtime-widget`).

**Tech Stack:** TypeScript, Vitest, Express, TypeGraphQL, jsonwebtoken, Angular (`@memberjunction/ng-realtime-widget`), Web (`@memberjunction/realtime-widget`).

---

### Task 1: Per-Visitor `AnonymousVisitorID` on `UserInfo`, Context Hydration, Conversation Stamping, and `AuthorizeSessionAccess`

**Files:**
- Modify: `packages/MJCore/src/generic/securityInfo.ts`
- Modify: `packages/MJCore/src/__tests__/securityInfo.test.ts`
- Modify: `packages/MJServer/src/context.ts`
- Modify: `packages/MJServer/src/auth/sessionUserClone.ts`
- Modify: `packages/MJServer/src/agentSessions/SessionManager.ts`
- Modify: `packages/MJServer/src/realtimeSessions/sessionAccess.ts`
- Create: `packages/MJServer/src/__tests__/buildMagicLinkSessionUser.test.ts`
- Create: `packages/MJServer/src/__tests__/agentSessions/SessionManager.createConversation.test.ts`
- Modify: `packages/MJServer/src/__tests__/realtimeSessions/sessionAccess.test.ts`
- Modify: `packages/MJServer/src/__tests__/realtimeSessions/sessionConfigStamps.test.ts`
- Modify: `packages/MJServer/src/__tests__/realtimeSessions/RealtimeSessionEventsResolver.test.ts`
- Modify: `packages/MJServer/src/__tests__/realtimeSessions/verificationWorkflow.test.ts`
- Modify: `packages/MJServer/src/__tests__/realtimeRecordingHandler.test.ts`

- [ ] **Step 1: Write failing tests for `UserInfo.AnonymousVisitorID`, `BuildMagicLinkSessionUser`, `SessionManager.createConversation`, and `AuthorizeSessionAccess`**

Add tests covering:
- `UserInfo.AnonymousVisitorID` getter/setter and non-enumerability in `packages/MJCore/src/__tests__/securityInfo.test.ts`.
- `BuildMagicLinkSessionUser` / `buildMagicLinkSessionUser` in `packages/MJServer/src/__tests__/buildMagicLinkSessionUser.test.ts`:
  - anonymous token with `mj_sid` sets `AnonymousVisitorID` equal to the claim (and preserves `CloneSessionUserForRequest` copying `AnonymousVisitorID`);
  - anonymous token without `mj_sid` (missing or empty) throws `AuthenticationError`;
  - named token leaves `AnonymousVisitorID` undefined.
- `SessionManager` conversation creation in `packages/MJServer/src/__tests__/agentSessions/SessionManager.createConversation.test.ts`:
  - anonymous principal's new conversation has `ExternalID` equal to `AnonymousVisitorID`;
  - non-anonymous scoped principal's new conversation has `ExternalID` equal to `MagicLinkScope.ResourceID`;
  - named principal without scope has no `ExternalID` set.
- `AuthorizeSessionAccess` in `packages/MJServer/src/__tests__/realtimeSessions/sessionAccess.test.ts`:
  - anonymous principal with matching `AnonymousVisitorID` allowed;
  - anonymous principal with different `AnonymousVisitorID` refused with `scope_mismatch`;
  - anonymous principal with no `AnonymousVisitorID` refused with `scope_missing` even when `MagicLinkScope.ResourceID` matches;
  - non-anonymous scoped principal still compared on `MagicLinkScope.ResourceID`;
  - named user without scope allowed.

- [ ] **Step 2: Run the new tests to verify they fail**

Run:
- `cd packages/MJCore && pnpm test src/__tests__/securityInfo.test.ts`
- `cd packages/MJServer && pnpm test src/__tests__/buildMagicLinkSessionUser.test.ts src/__tests__/agentSessions/SessionManager.createConversation.test.ts src/__tests__/realtimeSessions/sessionAccess.test.ts`

- [ ] **Step 3: Implement `UserInfo.AnonymousVisitorID`, `BuildMagicLinkSessionUser`, `CloneSessionUserForRequest`, `SessionManager.createConversation`, and `AuthorizeSessionAccess`**

1. In `packages/MJCore/src/generic/securityInfo.ts`:
   - Add `private _anonymousVisitorID?: string = undefined;` next to `_magicLinkScope`.
   - In the constructor, define `'AnonymousVisitorID'` in the non-enumerable properties list alongside `'MagicLinkScope'` and `'IsMagicLinkAnonymous'`.
   - Add TSDoc-commented `get AnonymousVisitorID(): string | undefined` and `set AnonymousVisitorID(value: string | undefined)`.
   - Rebuild `@memberjunction/core` (`cd packages/MJCore && npm run build`) so downstream packages see `UserInfo.AnonymousVisitorID`.
2. In `packages/MJServer/src/context.ts`:
   - Export `BuildMagicLinkSessionUser(userRecord: UserInfo, payload: jwt.JwtPayload): UserInfo` (and keep `/** @deprecated Use {@link BuildMagicLinkSessionUser}. */ export function buildMagicLinkSessionUser(userRecord: UserInfo, payload: jwt.JwtPayload): UserInfo` delegating to it).
   - When `isAnon` (`payload['mj_anon'] === true`), check `const mjSid = payload['mj_sid']; if (typeof mjSid !== 'string' || !mjSid.trim()) { throw new AuthenticationError('Anonymous magic-link session token is missing required mj_sid claim'); }` and assign `sessionUser.AnonymousVisitorID = mjSid;`.
3. In `packages/MJServer/src/auth/sessionUserClone.ts`:
   - Copy `clone.AnonymousVisitorID = user.AnonymousVisitorID;` right after `clone.IsMagicLinkAnonymous = user.IsMagicLinkAnonymous;`.
4. In `packages/MJServer/src/agentSessions/SessionManager.ts` (`createConversation`):
   - When `contextUser.IsMagicLinkAnonymous` is true, stamp `conversation.ExternalID = contextUser.AnonymousVisitorID` (when truthy). Otherwise, if `contextUser.MagicLinkScope?.ResourceID` is present, stamp `conversation.ExternalID = contextUser.MagicLinkScope.ResourceID`.
5. In `packages/MJServer/src/realtimeSessions/sessionAccess.ts`:
   - Add `readonly AnonymousVisitorID?: string;` to `SessionAccessPrincipal`.
   - In `AuthorizeSessionAccess(subject, principal)`:
     - If `principal.IsMagicLinkAnonymous === true`, read `const visitorId = principal.AnonymousVisitorID ?? null;`. If `!visitorId`, return `{ Allowed: false, Reason: 'scope_missing' }`. If `!subject.ConversationExternalID || subject.ConversationExternalID !== visitorId`, return `{ Allowed: false, Reason: 'scope_mismatch' }`. Return `{ Allowed: true }`.
     - Otherwise, if `principal.MagicLinkScope?.ResourceID` is present, compare `subject.ConversationExternalID` with `principal.MagicLinkScope.ResourceID` as before.
     - Otherwise return `{ Allowed: true }`.
6. Update existing anonymous test fixtures in `sessionConfigStamps.test.ts`, `RealtimeSessionEventsResolver.test.ts`, `verificationWorkflow.test.ts`, and `realtimeRecordingHandler.test.ts` so anonymous principals carry `AnonymousVisitorID`.

- [ ] **Step 4: Run tests to verify they pass and commit**

Run:
- `cd packages/MJCore && pnpm test`
- `cd packages/MJServer && pnpm test src/__tests__/buildMagicLinkSessionUser.test.ts src/__tests__/agentSessions/SessionManager.createConversation.test.ts src/__tests__/realtimeSessions/sessionAccess.test.ts src/__tests__/realtimeSessions/sessionConfigStamps.test.ts src/__tests__/realtimeSessions/RealtimeSessionEventsResolver.test.ts src/__tests__/realtimeSessions/verificationWorkflow.test.ts src/__tests__/realtimeRecordingHandler.test.ts`

---

### Task 2: Route All Five Write Gates Through `AuthorizeSessionAccess`

**Files:**
- Modify: `packages/MJServer/src/realtimeSessions/ownedRealtimeSession.ts`
- Modify: `packages/MJServer/src/resolvers/AgentSessionResolver.ts`
- Modify: `packages/MJServer/src/resolvers/RemoteBrowserActionResolver.ts`
- Modify: `packages/MJServer/src/resolvers/RealtimeClientSessionResolver.ts`
- Modify: `packages/MJServer/src/__tests__/realtimeSessions/ownedRealtimeSession.anonymous.test.ts`
- Modify: `packages/MJServer/src/__tests__/realtimeSessions/ownedRealtimeSession.test.ts`
- Modify: `packages/MJServer/src/__tests__/agentSessions/AgentSessionResolver.test.ts`
- Create: `packages/MJServer/src/__tests__/resolvers/RemoteBrowserActionResolver.ownership.test.ts`
- Modify: `packages/MJServer/src/__tests__/RealtimeClientSessionResolver.test.ts`
- Modify: `packages/MJServer/src/__tests__/RealtimeClientSessionResolver.configTamper.test.ts`

- [ ] **Step 1: Write failing tests for the five write gates**

1. Update `packages/MJServer/src/__tests__/realtimeSessions/ownedRealtimeSession.anonymous.test.ts` so `guest(scope)` sets `AnonymousVisitorID: scope` as well as `MagicLinkScope: { ResourceID: scope }`.
2. Add tests in `packages/MJServer/src/__tests__/realtimeSessions/ownedRealtimeSession.test.ts` covering anonymous visitor matching vs mismatching `AnonymousVisitorID`.
3. Add tests in `packages/MJServer/src/__tests__/agentSessions/AgentSessionResolver.test.ts` (`CloseAgentSession` and `AgentSessionHeartbeat`) showing that a second anonymous visitor (same `UserID`, different `AnonymousVisitorID`) is refused with `Not authorized: you do not own this agent session`, while the matching anonymous visitor is allowed.
4. Create `packages/MJServer/src/__tests__/resolvers/RemoteBrowserActionResolver.ownership.test.ts` testing `loadOwnedSession` via `RemoteBrowserActionResolver` for two anonymous visitors: the matching visitor is allowed and a second anonymous visitor is refused with `Not authorized: remote-browser session <id> is not owned by you.`.
5. Add unit tests in `packages/MJServer/src/__tests__/RealtimeClientSessionResolver.test.ts` for `loadPriorChannelStatesJson` and `collectOwnedPriorLegIDs` with anonymous visitors: when starting a session with `lastSessionId`, the matching anonymous visitor restores prior channel state and prior leg IDs, while a second anonymous visitor (same `UserID`, different `AnonymousVisitorID`) is skipped and receives neither. Update existing `lastSessionId` fixtures in `RealtimeClientSessionResolver.test.ts` and `RealtimeClientSessionResolver.configTamper.test.ts` to use runtime-constructed UUIDs and include conversation `ExternalID` / principal `AnonymousVisitorID`.

- [ ] **Step 2: Run the tests to verify they fail**

Run:
- `cd packages/MJServer && pnpm test src/__tests__/realtimeSessions/ownedRealtimeSession.anonymous.test.ts src/__tests__/realtimeSessions/ownedRealtimeSession.test.ts src/__tests__/agentSessions/AgentSessionResolver.test.ts src/__tests__/resolvers/RemoteBrowserActionResolver.ownership.test.ts src/__tests__/RealtimeClientSessionResolver.test.ts src/__tests__/RealtimeClientSessionResolver.configTamper.test.ts`

- [ ] **Step 3: Implement `AuthorizeSessionAccess` in all five write gates**

1. `packages/MJServer/src/realtimeSessions/ownedRealtimeSession.ts`:
   - Import `AuthorizeSessionAccess` and `LoadSessionConversationExternalID` from `./sessionAccess.js`.
   - After the `!UUIDsEqual(session.UserID, contextUser.ID)` check, call `const externalId = await LoadSessionConversationExternalID(session, contextUser, provider);` and `const decision = AuthorizeSessionAccess({ SessionUserID: session.UserID, ConversationExternalID: externalId }, contextUser);`.
   - When `!decision.Allowed`, `LogError(\`LoadOwnedRealtimeSession: user \${contextUser.ID} refused access to realtime session \${agentSessionId} (\${decision.Reason})\`);` and `throw new RealtimeSessionOwnershipError(agentSessionId);`.
2. `packages/MJServer/src/resolvers/AgentSessionResolver.ts`:
   - Delete `assertOwnership`.
   - Call `LoadOwnedRealtimeSession(agentSessionId, contextUser, provider)` in `CloseAgentSession` and `AgentSessionHeartbeat` (via a private helper that catches `RealtimeSessionNotFoundError` → `throw new Error(\`Agent session \${agentSessionId} not found\`)` and `RealtimeSessionOwnershipError` → `throw new Error('Not authorized: you do not own this agent session')`).
3. `packages/MJServer/src/resolvers/RemoteBrowserActionResolver.ts`:
   - Replace the body of `loadOwnedSession` with `LoadOwnedRealtimeSession(agentSessionID, contextUser, provider)`, catching `RealtimeSessionNotFoundError` → `throw new Error(\`Remote-browser session \${agentSessionID} not found.\`)` and `RealtimeSessionOwnershipError` → `throw new Error(\`Not authorized: remote-browser session \${agentSessionID} is not owned by you.\`)`.
4. `packages/MJServer/src/resolvers/RealtimeClientSessionResolver.ts`:
   - Import `AuthorizeSessionAccess` and `LoadSessionForAccess` from `../realtimeSessions/sessionAccess.js`.
   - In `loadPriorChannelStatesJson`: replace the inline `GetEntityObject('MJ: AI Agent Sessions')` + `UUIDsEqual` check with `LoadSessionForAccess(priorSessionId, contextUser, provider)` and `AuthorizeSessionAccess(loaded.Subject, contextUser)`. When `!loaded` or `!decision.Allowed`, log and return `undefined`. Otherwise read `loaded.Session.Config`.
   - In `collectOwnedPriorLegIDs`: replace the inline `GetEntityObject('MJ: AI Agent Sessions')` + `UUIDsEqual` check with `LoadSessionForAccess(currentId, contextUser, provider)` and `AuthorizeSessionAccess(loaded.Subject, contextUser)`. When `!loaded` or `!decision.Allowed`, log and break. Otherwise push `currentId` and follow `extractLastSessionIdFromConfig(loaded.Session.Config)`.
   - In `stampVerificationPolicy`: wrap `LoadInheritedVerifiedIdentity` in `try/catch` (logging a warning on failure) so a thrown `GetEntityObject` error when probing a prior session does not abort `StartRealtimeClientSession`.

- [ ] **Step 4: Run tests to verify they pass and commit**

Run:
- `cd packages/MJServer && pnpm test src/__tests__/realtimeSessions/ownedRealtimeSession.anonymous.test.ts src/__tests__/realtimeSessions/ownedRealtimeSession.test.ts src/__tests__/agentSessions/AgentSessionResolver.test.ts src/__tests__/resolvers/RemoteBrowserActionResolver.ownership.test.ts src/__tests__/RealtimeClientSessionResolver.test.ts src/__tests__/RealtimeClientSessionResolver.configTamper.test.ts`

---

### Task 3: Widget Guest Token Refresh Preserves `mj_sid` (`WidgetRouter` & `WidgetSessionService`)

**Files:**
- Modify: `packages/MJServer/src/realtimeWidget/WidgetRouter.ts`
- Modify: `packages/MJServer/src/realtimeWidget/WidgetSessionService.ts`
- Modify: `packages/MJServer/src/__tests__/realtimeWidget/widgetSessionService.test.ts`
- Modify: `packages/MJServer/src/__tests__/realtimeWidget/widgetRouter.test.ts`

- [ ] **Step 1: Write failing tests for `WidgetSessionService.RefreshGuestSession` and `WidgetRouter` `/session/refresh`**

1. In `packages/MJServer/src/__tests__/realtimeWidget/widgetSessionService.test.ts`, replace the old `RefreshGuestSession delegates to MintGuestSession` test with tests covering:
   - a valid bearer token re-mints with the same `mj_sid` (and `sessionId` in result matches original `mj_sid`);
   - a token expired within `REFRESH_GRACE_SECONDS` (`300` seconds) is accepted and re-mints with the same `mj_sid`;
   - a token expired beyond `REFRESH_GRACE_SECONDS` is refused with uniform 403 error result (`success: false`, `errorCode: 'invalid_key'`); **[As shipped: `errorCode: 'not_found'`, "Unknown widget key."]**
   - a token signed for another widget (`mj_widget_id` mismatch) is refused with uniform 403 error result;
   - a missing or malformed token is refused with the uniform 403 error result.
2. In `packages/MJServer/src/__tests__/realtimeWidget/widgetRouter.test.ts`, add/update tests verifying `POST /widget/session/refresh` extracts the `Authorization: Bearer <token>` header and passes it to `RefreshGuestSession`, returning 403 when missing or rejected.

- [ ] **Step 2: Run the widget server tests to verify they fail**

Run:
- `cd packages/MJServer && pnpm test src/__tests__/realtimeWidget/widgetSessionService.test.ts src/__tests__/realtimeWidget/widgetRouter.test.ts`

- [ ] **Step 3: Implement `REFRESH_GRACE_SECONDS`, `RefreshGuestSession` token verification, and `WidgetRouter` bearer extraction**

1. In `packages/MJServer/src/realtimeWidget/WidgetSessionService.ts`:
   - Export `export const REFRESH_GRACE_SECONDS = 300;`.
   - Extend `WidgetSessionMintInput` with `bearerToken?: string;`. **[As shipped: `MintGuestSessionInput.BearerToken`.]**
   - Update `mintToken` signature to accept an optional 5th parameter `existingSessionId?: string` and use `const sessionId = existingSessionId ?? GenerateSessionId();`.
   - In `RefreshGuestSession(input: WidgetSessionMintInput)`:
     - Validate `input.widgetKey` and resolve the widget via `this.loadAndAuthorizeWidget(input.widgetKey, origin, input.hostAssertion)` (returning the uniform 403 result on failure).
     - Verify `input.bearerToken` is a non-empty string; verify its signature with `MagicLinkKeyManager.Instance` using `jwt.verify(token, publicKeyPem, { algorithms: ['RS256'], audience: this.config.audience, issuer: this.config.issuer, ignoreExpiration: true })`. **[As shipped: no `issuer` option — see the corrections table.]**
     - Check `exp` is a finite number and `Math.floor(Date.now() / 1000) <= exp + REFRESH_GRACE_SECONDS`.
     - Check `decoded['mj_magic_link'] === true`, `decoded['mj_anon'] === true`, `typeof decoded['mj_widget_id'] === 'string' && UUIDsEqual(decoded['mj_widget_id'], auth.widget.ID)`, and `typeof decoded['mj_sid'] === 'string' && decoded['mj_sid'].trim().length > 0`.
     - On any token validation failure, return `{ success: false, error: 'Widget is unavailable for this origin.', errorCode: 'invalid_key' }`. **[As shipped: `{ success: false, errorCode: 'not_found', error: 'Unknown widget key.' }`.]**
     - Resolve returning visitor context as in `MintGuestSession` and call `this.mintToken(auth.widget, appId, resolved, origin, decoded['mj_sid'])`.
2. In `packages/MJServer/src/realtimeWidget/WidgetRouter.ts`:
   - Extract `bearerToken` from `req.get('authorization')` (matching `/^Bearer\s+(\S+)$/i`) and pass `bearerToken` in `input` to `service.RefreshGuestSession(input)` when `refresh === true`.

- [ ] **Step 4: Run the widget server tests to verify they pass and commit**

Run:
- `cd packages/MJServer && pnpm test src/__tests__/realtimeWidget/widgetSessionService.test.ts src/__tests__/realtimeWidget/widgetRouter.test.ts`

---

### Task 4: Send Bearer Token on Refresh in Angular `WidgetKeyClient` and Web `WidgetSessionClient`

**Files:**
- Modify: `packages/Angular/Generic/realtime-widget/src/lib/auth/widget-key-client.ts`
- Modify: `packages/Angular/Generic/realtime-widget/src/lib/session/widget-controller.ts`
- Modify: `packages/Angular/Generic/realtime-widget/src/lib/auth/widget-key-client.spec.ts`
- Modify: `packages/Angular/Generic/realtime-widget/src/lib/session/widget-controller.spec.ts`
- Modify: `packages/Web/RealtimeWidget/src/session/widget-session-client.ts`
- Modify: `packages/Web/RealtimeWidget/src/loader.ts`
- Modify: `packages/Web/RealtimeWidget/src/__tests__/widget-session-client.test.ts`

- [ ] **Step 1: Write failing tests for `WidgetKeyClient.Refresh` and `WidgetSessionClient.Refresh`**

1. In `packages/Angular/Generic/realtime-widget/src/lib/auth/widget-key-client.spec.ts`:
   - Update `Refresh()` test and add assertions showing `Refresh(currentToken)` sends `authorization: 'Bearer <currentToken>'` header, while `Mint()` sends no `authorization` header.
2. In `packages/Angular/Generic/realtime-widget/src/lib/session/widget-controller.spec.ts`:
   - Update mock `Refresh` expectations so `renewGuestToken` passes the current session token to `guestSource.Refresh(currentToken)`.
3. In `packages/Web/RealtimeWidget/src/__tests__/widget-session-client.test.ts`:
   - Update `Refresh()` tests to verify `Refresh(currentToken, visitorKey)` sends `authorization: 'Bearer <currentToken>'` header, and `Mint()` sends no `authorization` header.

- [ ] **Step 2: Run the client unit tests to verify they fail**

Run:
- `cd packages/Angular/Generic/realtime-widget && pnpm test`
- `cd packages/Web/RealtimeWidget && pnpm test`

- [ ] **Step 3: Implement bearer token header in `WidgetKeyClient.Refresh` and `WidgetSessionClient.Refresh`**

1. In `packages/Angular/Generic/realtime-widget/src/lib/auth/widget-key-client.ts`:
   - Update `Refresh(currentToken: string): Promise<WidgetGuestSession>` to pass `currentToken` to `postSessionRequest('/widget/session/refresh', currentToken)`, which includes `authorization: \`Bearer \${bearerToken}\`` when `bearerToken` is provided (and omits it for `Mint()`).
2. In `packages/Angular/Generic/realtime-widget/src/lib/session/widget-controller.ts`:
   - Update `WidgetGuestSessionSource.Refresh(currentToken: string): Promise<WidgetGuestSession>`.
   - In `renewGuestToken`, pass `this.guestSession?.Token ?? ''` to `this.config.guestSource.Refresh(...)`. **[As shipped: `this.guest.token` to `this.guestSource.Refresh(…)` via `mintGuest`.]**
3. In `packages/Web/RealtimeWidget/src/session/widget-session-client.ts`:
   - Update `Refresh(currentToken: string, visitorKey?: string): Promise<WidgetSession>` to pass `currentToken` to `callEndpoint('/widget/session/refresh', visitorKey, currentToken)`, which includes `authorization: \`Bearer \${bearerToken}\`` when `bearerToken` is provided (and omits it for `Mint()`).
4. In `packages/Web/RealtimeWidget/src/loader.ts`:
   - Update `scheduleRefresh` (`line 201`) to call `await client.Refresh(session.token, session.visitorKey)`.

- [ ] **Step 4: Run the client unit tests to verify they pass and commit**

Run:
- `cd packages/Angular/Generic/realtime-widget && pnpm test`
- `cd packages/Web/RealtimeWidget && pnpm test`
