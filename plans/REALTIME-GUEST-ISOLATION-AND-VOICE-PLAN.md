# Realtime guest isolation and voice fixes (MJ#6032, #6043, #6044, #6013, #4629, #6025, #4591, #4806, #4803) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** One PR to `next` that closes nine open realtime issues: three anonymous-guest isolation gaps, a session row left `Active` after a refused connect, the start/teardown race in the runtime, the lost spoken opening and the stuck ElevenLabs narration kind, the ElevenLabs tool-result socket close, and the per-session ElevenLabs REST cost.

**Architecture:** Every fix reuses a decision MJ already has instead of adding a new one: `AuthorizeSessionAccess` for the text turn, the magic-link grantable-role allowlist for widget guest roles, `SessionManager.CloseSession`'s `closeReason` for the failed start, the runtime's existing generation token and in-flight teardown for the race, each driver's existing kind-aware send helper for the spoken turn, and `BaseSingleton` for the process-wide agent cache. No schema change, no new GraphQL resolver, no extra network call on any hot path.

**Tech Stack:** TypeScript, vitest; packages `MJServer`, `LiveKitRoomServer`, `RealtimeRuntime`, `AI/Core`, `AI/RealtimeClient`, `AI/Providers/ElevenLabs`.

**Spec:** the nine GitHub issues (read in the order of the title) plus the design decisions recorded per task below. Decided with Soham on 2026-10-26, one issue at a time, after a live or unit reproduction of each.

**State on 2026-10-26 (final):** Tasks 1 to 11 done; PR MJ#6065 open against `next`, stacked on #6036. Open: Task 12 (Caliber shim decision; smoke API back to `next` after merge) and Task 13 (Caliber issue + caliber#626 comment, blocked by the session's permission rules; drafts written). Earlier note: Tasks 1 to 9 are IMPLEMENTED and green on branch `fix/realtime-guest-isolation-and-voice` in `~/Projects/mj-edge/MJ` (uncommitted, from `origin/next` 172c8396b2 with PR #6036's branch merged in). Five changesets are written. Tasks 10 to 13 remain: the final gates, review, commit and PR, host cleanup, and the Caliber follow-ups. MJ#5516 was reviewed and closed as not planned (one account per provider on every host; the design is in the closing comment).

## Global Constraints

- Branch base: `origin/next` with `agent/issue-6012-20261025021035` (PR #6036) merged; rebase or merge `next` before the PR, never squash #6036's commits away.
- No new GraphQL resolvers, no schema migrations, no `any`, no `.Get()/.Set()`; every `catch` logs with the session or visitor id.
- Named (non-anonymous) users keep today's behaviour on every path: no extra read for them on the text turn, no change to `UI`-role sessions in Explorer.
- The `Widget Guest` role stays the one built-in anonymous-safe role; the opt-in list is `magicLink.grantableRoleNames`, nowhere else.
- `CloseAgentSession(closeReason)` accepts only `Explicit` and `Error` from a client; `Janitor` and `Shutdown` stay server-only.
- `RequestSpokenUpdate` keeps its disposable-narration contract untouched; only `RequestSpokenOpening` moves to `RequestSpokenTurn`.
- Run tests with `npx vitest run` inside the package; build with `pnpm run build` inside the package (type checks the contract change).

## Review Focus

- A widget whose `GuestRoleID` is `UI` on a host that has NOT opted in: mint and refresh must both fail with `guest_role_not_isolated` (403) and log the widget id and the fix. Pinned in Task 2's tests.
- An anonymous visitor's own text turn must still run (same conversation, same scope id). Pinned in Task 1 (`AuthorizeConversationTurn` allow case) and verified live.
- End then Start back to back must leave exactly ONE `CloseAgentSession` on the wire, and the second call live. Pinned in Task 5.
- A fatal client error during a RECORDED call: teardown('error') runs the recording terminal path; the shard upload must still happen. Covered by the existing recording teardown tests, which pass; worth a reviewer's eye.
- An old server that does not know the `closeReason` argument rejects the runtime's close mutation. Documented in the changeset; the runtime and server ship together.

---

### Task 1: Text agent turn checks the visitor's scope (MJ#6032)

**Decision:** Reuse `AuthorizeSessionAccess`. New `LoadConversationScope(conversationId, user, provider)` and `AuthorizeConversationTurn(conversationId, principal, provider)` in `sessionAccess.ts`; `LoadSessionConversationScope` delegates to the former. Named principals are allowed without a read. The resolver calls it in `startConversationTurn` right after `loadPlacementOf`, before any row is written, and throws `Not authorized: you do not own this conversation`.

**Files (done):**
- Modify: `packages/MJServer/src/realtimeSessions/sessionAccess.ts`
- Modify: `packages/MJServer/src/resolvers/RunAIAgentResolver.ts` (import, the gate in `startConversationTurn`, two comments)
- Test: `packages/MJServer/src/__tests__/realtimeSessions/sessionAccess.test.ts` (8 new tests)
- Test fixtures: `RunAIAgentResolver.conversationWriter.test.ts`, `RunAIAgentResolver.runDataGuard.test.ts` — the fake widget guest now carries `MagicLinkScope.ResourceID` and the fake conversation `UserID` + `ExternalID` (a real widget guest always has both; the old fixture modelled an impossible guest).

**Evidence:** live, two guests minted from a `UI`-role widget on `MJ_Edge_Caliber`: before, guest 2's `RunAIAgentFromConversationDetail` on guest 1's message returned `success: true` and wrote an `AI` row into guest 1's conversation; after, `Not authorized: you do not own this conversation`, no row, and guest 1's own turn still succeeds. Script: scratchpad `repro-6032.mjs`.

- [x] Red → green: `cd packages/MJServer && npx vitest run src/__tests__/realtimeSessions/sessionAccess.test.ts` → 33 passed.
- [x] Re-verified after merging `next` (2026-10-26, MJServer 2936 passed): same command, plus `npx vitest run src/__tests__/RunAIAgentResolver.conversationWriter.test.ts src/__tests__/RunAIAgentResolver.runDataGuard.test.ts` → 11 passed.

### Task 2: Widget mints only scope-isolated guest roles (MJ#6043)

**Decision:** Refuse at mint and refresh, not rewrite the `UI` RLS filters. `widgetCore.ts` gains `WIDGET_GUEST_ROLE_NAME`, `GuestRolePolicy { GrantableRoleNames }`, `IsIsolatedGuestRole(roleName, policy)` (= `IsRoleGrantable(name, 'Widget Guest', policy.GrantableRoleNames)`), and the error code `guest_role_not_isolated` (403 through the existing `statusForResult`). `WidgetSessionService` takes the policy as a third constructor argument and decides once in `resolveIsolatedGuestRole(widget)` for both mint and refresh. `WidgetRouter` passes `{ GrantableRoleNames: configInfo.magicLink?.grantableRoleNames ?? [] }`.

**Files (done):** `packages/MJServer/src/realtimeWidget/{widgetCore,WidgetSessionService,WidgetRouter}.ts`; tests in `packages/MJServer/src/__tests__/WidgetSessionService.test.ts` (3 new; the `Metadata.Provider` mock now lists a `UI` role).

**Evidence:** live: with the default host config the `UI`-role widget's mint returned `403 guest_role_not_isolated` and the API log named the widget and the fix; with `'UI'` added to `magicLink.grantableRoleNames` the mint succeeded and the generic reads still leaked (the admin's explicit choice). The opt-in was reverted on the host.

**Behaviour change to call out in the PR:** a host whose widget already uses `UI` as its guest role gets a clear admin error at mint until it lists `UI` in `magicLink.grantableRoleNames`.

- [x] `cd packages/MJServer && npx vitest run src/__tests__/WidgetSessionService.test.ts` → 45 passed.

### Task 3: LiveKit room rule refuses anonymous callers (MJ#6044)

**Decision:** Fail closed in rule 2 of `RoomAuthorizationService.AuthorizeRoomAccess` for `user.IsMagicLinkAnonymous`, before the `UserID` match. No client path sends an anonymous visitor through this rule today (`MintLiveKitClientToken` is called by Explorer's agent picker and the LiveKit room component only), so the issue's "A is still let in" is deliberately not met; the scope-based alternative needs `ResolveSessionScopeIdentity` moved into `@memberjunction/core` and is logged below.

**Files (done):** `packages/LiveKitRoomServer/src/room-authorization.ts`; test in `src/__tests__/roomAuthorization.test.ts` (1 new).

**Evidence:** live: both guests' `MintLiveKitClientToken` for guest 1's room now fail with "Anonymous visitors cannot join a call or agent session room by ownership." (before, both passed the gate and failed only at the unconfigured token service). Side finding, not fixed: the bridge lookup filters `Status = 'Active'`, a value the `AIAgentSessionBridge` check constraint does not allow, so that branch never matches.

- [x] `cd packages/LiveKitRoomServer && npx vitest run` → 272 passed.

### Task 4: A failed start closes its session as Error (MJ#6013)

**Decision:** `teardown(end: SessionEndReason)` with `SessionEndReason = 'explicit' | 'error'` always closes a minted session; `closeServerSession(agentSessionId, closeReason: ClientCloseReason)` sends `CloseAgentSession(agentSessionId, closeReason)`. The resolver gains `@Arg('closeReason', () => String, { nullable: true })`, parsed by `ParseClientCloseReason` (absent → `Explicit`; `Janitor`/`Shutdown`/unknown → throws "Unsupported close reason"). `failSessionStart` and `abortUnusableSession` end with `'error'`; `EndRealtimeSession` with `'explicit'`; abandoned starts close as `Explicit`.

**Files (done):** `packages/RealtimeRuntime/src/session/RealtimeSessionRuntime.ts`, `packages/RealtimeRuntime/src/index.ts` (exports `SessionEndReason`, `ClientCloseReason`), `packages/MJServer/src/resolvers/AgentSessionResolver.ts`; tests in `RealtimeSessionRuntime.test.ts` (2 new, `RecordingProvider` now records variables) and `AgentSessionResolver.ownership.test.ts` (3 new).

**Evidence:** live with the rebuilt Caliber widget and Gemini: Playwright closes the Gemini socket with 1008 at 3.8 s; `CloseAgentSession` follows at 4.2 s; the row reads `Closed | Error`. Before: `Active`, `CloseReason` NULL, no close call. Server half also checked as a real visitor: `Janitor` refused, `Error` accepted.

- [x] `cd packages/RealtimeRuntime && npx vitest run` → 646 passed; `cd packages/MJServer && npx vitest run src/__tests__/AgentSessionResolver.ownership.test.ts` → 6 passed.

### Task 5: One slot, one owner (MJ#4629)

**Decision:** Finish the design already on `next` (generation token, `teardownInFlight`, `unwindAbandonedStart`): a start awaits `teardownInFlight` and then `claimSessionSlot()` SYNCHRONOUSLY (an End issued right after a Start must still find a start to abandon), throwing the exported `RealtimeSessionAlreadyActiveError` when a call is live; a fatal error from the current client sets state `error` and runs `teardown('error')`; `runTeardown` is `try { releaseCallResources(end) } finally { releaseSessionSlot(end) }`.

**Files (done):** same runtime file and `index.ts`; tests in `RealtimeSessionRuntime.test.ts` (3 new, inside the `#5420` describe that owns `HandshakeClient`).

**Evidence:** unit only (the issue says the window is not reachable deterministically from outside): before, End+Start dropped the second start silently, Start during a live call resolved `undefined`, and a fatal error left `IsActive` true with the microphone open; after, all three pass. Every MJ host (`widget-controller.ts`, `conversation-chat-area.component.ts`, `message-input.component.ts`) and Caliber's launch service already wrap the start in try/catch.

- [x] `cd packages/RealtimeRuntime && npx vitest run` → 646 passed.

### Task 6: Spoken opening is a real turn (MJ#4591) and ElevenLabs kind reset (MJ#6025)

**Decision:** Optional `RequestSpokenTurn?(instructions)` on `IRealtimeSession` (`packages/AI/Core/src/generic/baseRealtime.ts`) and `BaseRealtimeClient`; implemented in Gemini (`sendTriggeringUserTurn(…, 'normal', false)`, inherited by Gemini Enterprise), ElevenLabs (`sendUserMessage(…, 'normal', false)`), AssemblyAI (`sendReplyCreate(…, 'normal', false)`) and OpenAI Live (new private `requestInstructedResponse(instructions, kind)` behind both methods). `RequestSpokenOpening` prefers `RequestSpokenTurn`, else `RequestSpokenUpdate`. ElevenLabs `handleUserTranscript` resets `activeResponseKind = 'normal'`.

**Files (done):** the six source files above plus tests: one `RequestSpokenTurn` test per driver in `packages/AI/RealtimeClient/src/__tests__/{gemini-realtime-client,elevenlabs-realtime-client,assemblyai-realtime-client,openai-live-client}.test.ts`, the #6025 test in the ElevenLabs file, two runtime tests in `RealtimeSessionRuntime.test.ts`.

**Evidence:** live Gemini interview saves the greeting before and after, because Caliber's widget carries its own workaround (`requested-turn-capture.ts`); after the fix the greeting arrives as a normal turn and Caliber's capture has nothing to recover, with no duplicate row (4 AI + 4 User rows). The MJ defect is pinned by the runtime test (a narration reply is never relayed; a turn reply is captioned and relayed).

- [x] `cd packages/AI/RealtimeClient && npx vitest run` → 1281 passed, 1 pre-existing failure (Task 10).
- [x] `cd packages/RealtimeRuntime && npx vitest run` → 646 passed.

### Task 7: ElevenLabs tool result as a string (MJ#4806)

**Decision:** `result: outputJson`; `ParseToolOutput` and the `JSONValue` import removed; the two assertions that pinned the object shape now expect the string.

**Files (done):** `packages/AI/RealtimeClient/src/drivers/elevenLabsRealtimeClient.ts`; `src/__tests__/elevenlabs-realtime-client.test.ts` (1 new test, 2 updated assertions).

**Evidence:** unit (the issue's four live runs against api.elevenlabs.io are the field evidence; this session ran Gemini only).

- [x] `cd packages/AI/RealtimeClient && npx vitest run src/__tests__/elevenlabs-realtime-client.test.ts` → 56 passed.

### Task 8: Process-wide managed-agent cache (MJ#4803)

**Decision:** `ElevenLabsManagedAgentCache extends BaseSingleton` in `elevenLabsRealtime.ts`, one `Map<name, ManagedAgentCacheEntry>` per API key (`ForAccount(apiKey)`, `Clear()`); the driver's `agentCache` is a getter over it, so `ensureAgent`'s fingerprint, in-flight-promise and eviction semantics are unchanged. The open question in the issue (why a PATCH fires on every launch) is not answered here; the cache turns it into a once-per-process cost.

**Files (done):** `packages/AI/Providers/ElevenLabs/src/elevenLabsRealtime.ts`; tests in `src/__tests__/elevenLabsRealtime.test.ts` (2 new; a file-level `beforeEach` clears the singleton; the "repairs ANY single override" test clears it per simulated process) and `ElevenLabsAudioGenerator.test.ts` (its `@memberjunction/global` mock now spreads the real module).

- [x] `cd packages/AI/Providers/ElevenLabs && npx vitest run` → 144 passed.

### Task 9: Changesets

- [x] `.changeset/anonymous-guest-isolation-text-livekit-mint.md` (server, livekit-room-server)
- [x] `.changeset/failed-start-closes-session-with-reason.md` (realtime-runtime, server)
- [x] `.changeset/realtime-runtime-one-slot-one-owner.md` (realtime-runtime)
- [x] `.changeset/spoken-opening-is-a-real-turn.md` (ai, ai-realtime-client, realtime-runtime)
- [x] `.changeset/elevenlabs-tool-result-string-and-agent-cache.md` (ai-realtime-client, ai-elevenlabs)

### Task 10: Final gates

- [x] **Step 1: full build** (2026-10-26: exit 0, no TS errors) — `cd ~/Projects/mj-edge/MJ && pnpm run build`. Expected: every task successful (the contract change in Task 6 must compile in every package that implements `BaseRealtimeClient`, including the React Native host). Note: the parent `pnpm-workspace.yaml` needed `MJ/packages/ContentPipeline/*`, `MJ/packages/Rubrics/*`, `MJ/packages/WorkQueue/*` added before `document-parsing` would build; that file is generated and uncommitted.
- [x] **Step 2: full suites** (2026-10-26: MJServer 2847 passed, RealtimeRuntime 646, AI/RealtimeClient 1281 + the one pre-existing failure, ElevenLabs 144, LiveKitRoomServer 272, AI/Core 852) — `npx vitest run` in `packages/MJServer`, `packages/RealtimeRuntime`, `packages/AI/RealtimeClient`, `packages/AI/Providers/ElevenLabs`, `packages/LiveKitRoomServer`, `packages/AI/Core`. Expected: all green except `gemini-enterprise-client-contract.test.ts › fails the connect when the relay closes the socket before Google confirms the setup`, which fails on `next` before this branch (two close handlers race between "closed during setup" and "closed the connection before confirming its setup", `geminiRealtimeClient.ts:941` vs `:1253`; untouched here). Say so in the PR.
- [x] **Step 3: `git diff --stat origin/next`** and confirm no file outside the packages listed in Tech Stack changed. (2026-10-26: all changed files are in the six packages; untracked only `.changeset/*` and this plan.)

### Task 11: Review, commit, PR

- [x] **Step 1:** review done through superpowers:subagent-driven-development on 2026-10-26 (ledger: `.superpowers/sdd/REALTIME-GUEST-ISOLATION-AND-VOICE-PLAN/progress.md`): four task-group reviews, two fix rounds on the runtime (an End during the teardown wait was lost; a Fatal during Connect hid the start error, then a dead-socket go-live window), one fix round adding `RequestSpokenTurn` to the OpenAI Realtime protocol client, the server-bridged ElevenLabs string result and a resolver-level gate test, then a final whole-branch review and one fix wave (10-minute TTL on the ElevenLabs ensure cache, session ids in two catches, displaced JSDoc, stale comments, a teardown guard on the fatal handler, LiveKit refusal before the offer check). All reviews closed clean.
- [x] **Step 2:** committed 2026-10-26 as seven commits grouped by package (the runtime and ElevenLabs client files carry several tasks' hunks, so one-commit-per-task was not separable), then merged `origin/next` — one per task (1 to 8) plus one for the changesets, each message naming the issue (`fix(server): … (MJ#6032)`), ending with the attribution line the session reminder gives. Commits need Soham's explicit go.
- [x] **Step 3:** opened as MJ#6065 against `next` (stacked on #6036) — PR to `next` with the `open-pr` skill. Body: one paragraph per issue (what was wrong, the decision, the evidence line), the two behaviour changes (Task 2's admin error, Task 5's automatic end on a fatal error), the server/runtime shipping-together note from Task 4, the pre-existing enterprise test failure, and `Closes #6032 #6043 #6044 #6013 #4629 #6025 #4591 #4806 #4803`.

### Task 12: Host cleanup (`~/Projects/mj-edge`)

- [x] Remove the repro widget row: `DELETE FROM __mj.ConversationWidgetInstance WHERE ID='A6032000-0000-4000-8000-000000006032'` on `MJ_Edge_Caliber`, and the repro `Interaction` rows named `repro6044-*`.
- [x] `MJ/mj.config.js`: remove the `widget: { ...(base.widget ?? {}), enabled: true }` line added for the repro (backup in the session scratchpad).
- [ ] Keep: the seven `AllowUpdateAPI=0` flags on `MJ: AI Agent Sessions` recording fields (what `mj sync push` of MJ metadata would set after `V202610222240`), and the seven core migrations applied today (`V202610221305` … `V202610252000`).
- [ ] `bizapps-caliber` working tree: six files carry an UNCOMMITTED import shim for caliber#626 plus `@memberjunction/realtime-runtime` in `packages/Angular/package.json`, used only to rebuild the widget bundle for the live checks. Either revert them (`git checkout -- packages/Angular`) or turn them into caliber#626's fix on a Caliber branch; never commit them from this session.
- [ ] The smoke API on `:4010` is running the branch build; restart it from `next` when the branch is done.

### Task 13: Caliber follow-ups to file (bizapps-caliber)

- [ ] caliber#626 is confirmed: `caliber-ng` does not compile on MJ `next` until `RealtimeCaption`, `RealtimeClientToolHandler`, `RealtimeConnectionState`, `BaseRealtimeChannelClient`, `RealtimeChannelContext` are imported from `@memberjunction/realtime-runtime` (the exact six-file change is in the uncommitted shim above).
- [ ] New: `packages/Server/src/runtime/launch/client-direct-launcher.ts:359` assigns `agentSession.RecordingMedia`, which MJ's `V202610222240` made read-only; every consented launch on MJ `next` fails with "Cannot set property RecordingMedia … which has only a getter". The ledger procedures own that column now.
- [ ] After MJ 6.2 ships Task 6, `requested-turn-capture.ts` can be retired (the opening arrives as a normal turn); keep it until then.

## Logged, not fixed

- MJ#5516: closed 2026-10-26 as not planned; design in the closing comment.
- LiveKit scope-based room rule for anonymous owners (move `ResolveSessionScopeIdentity` + `AuthorizeSessionAccess` into `@memberjunction/core`) — only if a host ever sends anonymous visitors through `MintLiveKitClientToken`.
- `AIAgentSessionBridge` lookup uses `Status = 'Active'`, which the check constraint does not allow (Task 3 note).
- ElevenLabs drift PATCH on every first ensure per process (MJ#4803's open question).
- `gemini-enterprise-client-contract.test.ts` close-message race (Task 10).
