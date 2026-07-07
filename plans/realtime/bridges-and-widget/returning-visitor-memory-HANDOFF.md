# Returning-Visitor Memory — Implementation Handoff

**Plan:** [`returning-visitor-memory.md`](./returning-visitor-memory.md) (read it first — this doc only covers *implementation state*, not the design rationale).
**Branch:** `claude/agent-architecture-bridges-mtqsnw` (PR #2936, targets `next`).
**Worktree DB:** `MJ_Uridges_widget` @ `localhost:1451` (container `mj-sql-bridges-widget`, `sa` / `MjParallel99!`). App logins `MJ_Connect` / `MJ_CodeGen` are **sysadmin** (auto-map to dbo — a DB drop needs no user recreation).
**Status:** ✅ **COMPLETE** — RV0–RV5 all implemented; touched packages build; unit tests pass (see [Completion](#completion-2026-06-29) at the bottom).

---

## TL;DR for the next person

1. Run `npm install` at repo root (re-links Web/RealtimeWidget, which I bumped 5.42.0→5.43.0 to match the merged workspace — see [Gotcha 1](#gotcha-1-web-widget-version-skew)).
2. Run `npx mj sync push --dir=metadata --include="prompts"` (lands the new `Returning-Visitor Recap` prompt the recap service loads by name).
3. `cd packages/Web/RealtimeWidget && npm run build` should now pass.
4. Continue with **RV3 → RV4 → RV5** and finish RV2's triggers — exact hook points below.

---

## What is DONE

### RV0 — Schema + CodeGen ✓ (validated end-to-end)

**One consolidated migration:** `migrations/v5/V202606291200__v5.44.x__Widget_And_Returning_Visitor_Memory.sql`
- Folds in what used to be 5 files (WidgetInstance `CREATE TABLE` + 3 RLS-seed migrations + the separate `CodeGen_Run`), **plus** the new returning-visitor schema, **plus** appended CodeGen output. The 5 old files were `git rm`'d.
- Schema added: `Conversation.{VisitorKey, ResolvedEntityID (FK→Entity), ResolvedRecordID nvarchar(450), PreviousConversationID (self-FK)}`, two non-FK lookup indexes, and `WidgetInstance.{RememberReturningVisitors BIT default 0, VisitorMemoryRetentionDays INT null}` folded into its `CREATE TABLE`.
- **AIAgentNote got NO new columns** — see [Decision 1](#decision-1).

**Generated types present** (`packages/MJCoreEntities/src/generated/entity_subclasses.ts`): `MJConversationEntity.VisitorKey/ResolvedEntityID/ResolvedRecordID/PreviousConversationID`, `MJWidgetInstanceEntity.RememberReturningVisitors/VisitorMemoryRetentionDays`.

**How it was validated:** drop DB → `npm run mj:migrate` (baseline + next + ours) → `npm run mj:codegen` → append codegen → **two-pass migrate** (see [Gotcha 2](#gotcha-2-the-recordingfile-sequence-collision--the-two-pass-migrate)). Final codegen run produced no new migration, confirming the appended block is complete.

### RV1 — Durable visitor anchor + linking ✓ (code; server builds clean)

**Loop:** client presents its durable `VisitorKey` cookie at mint → server (gated on `RememberReturningVisitors`) validates/mints the key, finds the most-recent prior conversation for that key *within the widget's application*, and returns `{rememberReturningVisitors, visitorKey, previousConversationId}` → client persists the cookie and stamps `VisitorKey` + `PreviousConversationID` on the new conversation.

| File | Change |
|---|---|
| `packages/Web/RealtimeWidget/src/session/visitor-key-cookie.ts` | **New.** `readVisitorKey/writeVisitorKey/clearVisitorKey` — durable first-party cookie, scoped per widget key. |
| `packages/Web/RealtimeWidget/src/types.ts` | `WidgetSessionResponse` + `WidgetSession` gain `rememberReturningVisitors/visitorKey/previousConversationId`. |
| `packages/Web/RealtimeWidget/src/session/widget-session-client.ts` | `Mint(visitorKey?)` / `Refresh(visitorKey?)` send the key; `toSession` maps the new fields. |
| `packages/Web/RealtimeWidget/src/loader.ts` | Reads cookie before mint, writes it after (gated), passes key on refresh. |
| `packages/Web/RealtimeWidget/src/transport/runtime-widget-transport.ts` | `createConversation` stamps `VisitorKey` + `PreviousConversationID` (gated). |
| `packages/MJServer/src/realtimeWidget/WidgetSessionService.ts` | `MintGuestSessionInput.visitorKey`; result fields; `resolveReturningVisitor()` + `findPreviousConversationByVisitorKey()` (app-scoped, base64url-validated key). |
| `packages/MJServer/src/realtimeWidget/WidgetRouter.ts` | `handleMint` parses `visitorKey` from the body. |

**Gap (deferred to RV1-voice / RV4):** the *voice* path creates its conversation server-side in `SessionManager.createConversation` (`packages/MJServer/src/agentSessions/SessionManager.ts:~307`), which does **not** yet stamp `VisitorKey`/`PreviousConversationID`. The text path is complete. To wire voice: embed the visitor key as a JWT claim in `buildWidgetGuestClaims` (`packages/MJServer/src/realtimeWidget/widgetCore.ts`), surface it on `UserInfo` in `buildMagicLinkSessionUser` (`packages/MJServer/src/context.ts:202`), and stamp it in `createConversation`.

### RV2 — Recap on close ◑ (mechanism built + compiles; triggers partial)

| File | Change |
|---|---|
| `packages/MJServer/src/agentSessions/ReturningVisitorRecap.ts` | **New.** `writeReturningVisitorRecap(conversationId, agentId, contextUser, provider)` — idempotent, best-effort. Loads transcript, runs the recap prompt, writes an **Active `Context`** `MJ: AI Agent Notes` row scoped via `PrimaryScopeEntityID/RecordID`: `(ResolvedEntityID, ResolvedRecordID)` when resolved, else `(Conversations entity, conversation.ID)` for anonymous. |
| `metadata/prompts/.returning-visitor-recap-prompt.json` + `templates/returning-visitor-recap.template.md` | **New.** Plain-text recap prompt; emits `NO_RECAP` when nothing's worth remembering. **Needs `mj sync push`.** |
| `packages/MJServer/src/agentSessions/SessionManager.ts` | `CloseSession` calls the recap (after observability finalize). |

**RV2 remaining:**
1. **Text widget has no server close event** (it uses client-side `ConversationsRuntime`, not an `AIAgentSession`). Add a **lazy-recap-at-mint**: when `MintGuestSession` resolves a `previousConversationId` for a returning visitor, recap that prior conversation if it has no recap note yet. This covers text and is the moment the recap is actually needed.
2. **Voice path** only produces a recap once its conversation carries `VisitorKey`/resolved pair — depends on the RV1-voice wiring above.
3. **Retention:** set `note.ExpiresAt = now + widget.VisitorMemoryRetentionDays` (resolve the widget from the conversation; fall back to system default).
4. Push the prompt metadata before testing.

---

## What REMAINS (RV3–RV5) — exact hook points

These line numbers came from a code map on this branch; re-confirm before editing.

### RV3 — Inject on return ⬜
- **Hook:** `packages/AI/Agents/src/realtime/realtime-client-session-service.ts` → `assembleMemoryContext()` (~line 1818) → `AgentMemoryContextBuilder.InjectContextMemory()`.
- **The injector already filters by the PrimaryScope pair** — see `packages/AI/Agents/src/agent-context-injector.ts` (`GetNotesForContext` ~91; `matchesSecondaryScope` ~518; it builds `PrimaryScopeEntityID = '…' AND PrimaryScopeRecordID = '…'`). So RV3 is mostly *threading the scope in*, not new query logic.
- **Resolve the conversation's identity → scope pair:** if `conversation.ResolvedEntityID/RecordID` set → use it; else if `conversation.PreviousConversationID` set → use `(Conversations entity, PreviousConversationID)` (mirrors how RV2 files the anonymous recap). Pass that as `primaryScopeEntityId/primaryScopeRecordId` into the builder.
- **Acceptance:** returning visitor's agent opens with prior context via the *existing* injection path; brand-new visitor gets none.

### RV4 — Identity resolution + merge ⬜
- **Hooks:** `packages/MJServer/src/context.ts:202` `buildMagicLinkSessionUser` (learns the resolved identity); `SessionManager.createConversation` (~307) and/or the widget upgrade path (`WidgetSessionService.RequestUpgrade`).
- On magic-link verify / host identity: set `Conversation.ResolvedEntityID/ResolvedRecordID` (polymorphic — **not** assumed to be a User; AN-BC's core correction), back-fill the visitor's prior conversations found by `VisitorKey`, and re-key visitor-scoped notes onto the resolved pair (update `PrimaryScopeEntityID/RecordID` on notes currently scoped to `(Conversations, priorId)`).
- **Acceptance:** a verified visitor's prior anonymous context attributes to the resolved record; the next visit pulls memory via the resolved pair, not the cookie.

### RV5 — Privacy controls ⬜
- Visitor-facing notice in the widget UI when `rememberReturningVisitors` is on (`packages/Web/RealtimeWidget/src/ui/…`).
- **"Forget me":** a public widget endpoint (sibling to `/widget/session` in `WidgetRouter.ts`/`WidgetSessionService.ts`) that, given the `VisitorKey`, archives (`Status='Archived'`) the visitor's notes and clears the linkage; client calls `clearVisitorKey(widgetKey)` (already exported).
- **Acceptance:** "forget me" leaves no Active memory and no resolvable cookie linkage.

### RV-final ⬜
- Build all touched packages (`Web/RealtimeWidget`, `MJServer`, `AI/Agents`) and run/refresh unit tests. Web/RealtimeWidget has a vitest suite (mock transport + session client) — add cases for the cookie + the gated stamping.

---

## Key design decisions (and why)

<a name="decision-1"></a>
**Decision 1 — Reuse `PrimaryScope`, don't add note columns (supersedes plan R5).**
The plan's R5 proposed `ScopeEntityID/ScopeRecordID` on AIAgentNote. But the agent-notes system (post-merge from `next`) **already** has `PrimaryScopeEntityID/PrimaryScopeRecordID/SecondaryScopes`, and the injector already filters by them. AN-BC's only correction in the [PR thread](https://github.com/MemberJunction/MJ/pull/2936) was that the **conversation's resolved identity** must be polymorphic (`EntityID` FK + `RecordID nvarchar(450)`, indexed not FK) — which is exactly `Conversation.ResolvedEntityID/ResolvedRecordID`. He never asked for note columns, and the thread ethos is "reuse the memory system, no parallel store." So I removed the redundant columns; recaps file under the existing `PrimaryScope`.

**Decision 2 — Recap text via AIPromptRunner + a metadata prompt** (your call). The Memory Manager exposes no standalone "summarize conversation → note" API (summarization is entangled in its agent-run extraction/hardening). Rather than refactor that sensitive agent, RV2 summarizes via the metadata-defined `Returning-Visitor Recap` prompt; the Memory Manager's existing hardening/consolidation/decay then maintains the resulting note.

**Decision 3 — Anonymous recap is filed against the conversation itself** `(Conversations entity, conversation.ID)`. The next visit's `PreviousConversationID` points back to it, so RV3 resolves it by a single `PrimaryScope` pair (no list query, reuses the existing single-pair injector).

---

## Gotchas

<a name="gotcha-1-web-widget-version-skew"></a>
**Gotcha 1 — Web/RealtimeWidget version skew.** `@memberjunction/realtime-widget` was the lone package still at 5.42.0 (pinning 5.42.0 deps) after the merge bumped the workspace to 5.43.0, so npm installed a **stale 5.42.0 `core-entities`** under `packages/Web/RealtimeWidget/node_modules` that lacks the new columns → `tsc` "Property 'VisitorKey' does not exist". I bumped its `package.json` (version + 7 `@memberjunction/*` deps) to 5.43.0; **a root `npm install` re-links it to the workspace.** (Its code is type-correct; MJServer compiles the same getters fine.)

<a name="gotcha-2-the-recordingfile-sequence-collision--the-two-pass-migrate"></a>
**Gotcha 2 — the `RecordingFile` sequence collision (critical migration lesson).** A single-pass fresh migrate of the consolidated migration **fails** with `UNIQUE KEY UQ_EntityField_EntityID_Sequence` at `(Conversation, 100063)`. Cause: `next`'s `Meeting_Room_Recording` migration hardcodes the virtual `RecordingFile` field at Seq 100063, but `R__RefreshMetadata` (repeatable, runs at migrate-end) renumbers it to a low value — so codegen, run *after* that renumber, assigned our `PreviousConversationID` the now-free 100063, which collides on a fresh replay before R runs. **Fix (do NOT hand-edit sequences):** the two-pass migrate — blank DB → migrate *without* our file (R renumbers RecordingFile off 100063) → move our file back → migrate again. This is the validation gate; a single-pass-from-baseline still collides (acceptable per the team's release model — `mj bump`/new baselines absorb it). `RecordingFile` is never touched by our migration; the many `RecordingFile` mentions in the appended codegen are just the existing column appearing in regenerated views/SPs/cascade-cursors.

**Gotcha 3 — provider, not `new Metadata()`.** The recap service takes the request/session `IMetadataProvider` and uses `provider.GetEntityObject` + `provider.Entities` (multi-provider-safe). Keep that pattern in RV3/RV4.

**Gotcha 4 — `Save()`/`Delete()` return booleans.** RV2 checks them and logs `LatestResult.CompleteMessage`. Do the same in RV3–RV5.

---

## Commands

```bash
# migrate / codegen (worktree DB on :1451, creds from .env)
npm run mj:migrate
npm run mj:codegen

# rebootstrap blank (sa)  — then migrate
sqlcmd -S localhost,1451 -U sa -P 'MjParallel99!' -C -Q \
 "ALTER DATABASE [MJ_Uridges_widget] SET SINGLE_USER WITH ROLLBACK IMMEDIATE; DROP DATABASE [MJ_Uridges_widget]; CREATE DATABASE [MJ_Uridges_widget];"

# builds
cd packages/MJServer && npm run build          # ✓ passes (RV1+RV2)
cd packages/Web/RealtimeWidget && npm run build         # passes AFTER root `npm install`
cd packages/AI/Agents && npm run build          # for RV3

# metadata push (recap prompt)
npx mj sync push --dir=metadata --include="prompts"
```

## Open items needing a human
- ~~`npm install` at root~~ ✅ done (also pruned a stale nested `core-entities@5.42.0` under Web/RealtimeWidget — see Completion).
- ~~`mj sync push` the recap prompt~~ ✅ done.
- Decide whether to also seed/enable `RememberReturningVisitors` on a widget instance in `metadata/widget-instances/` for live testing (default is off).

---

## Completion (2026-06-29)

All phases implemented in this session. **Net new behavior since the handoff was written: RV2 finished, RV3/RV4/RV5 built, and the voice path wired** (it was the deferred gap).

### Per-phase
- **RV2 ✓** — text path: **lazy-recap-at-mint** in `WidgetSessionService.recapPriorConversationIfNeeded` (recaps the prior conversation when the visitor returns; idempotent, awaited so it's ready for RV3). **Retention**: `writeReturningVisitorRecap(retentionDays)` → `note.ExpiresAt` from the widget's `VisitorMemoryRetentionDays`.
- **RV3 ✓** — `realtime-client-session-service.ts`: `assembleMemoryContext` now takes the provider and threads a resolved scope pair (`resolveConversationMemoryScope`: resolved pair → else `(Conversations, PreviousConversationID)` → else none) into the existing `AgentMemoryContextBuilder.InjectContextMemory`.
- **RV4 ✓** — new `packages/MJServer/src/realtimeWidget/visitorIdentity.ts` (`resolveIdentityByEmail` via the deployment-configurable `widget.identityResolution` target, default `Users`/`Email`; `mergeVisitorIdentity` back-fills conversations + re-keys anonymous notes onto the resolved pair). Wired at TWO moments: **host-identity at mint** (`resolveHostIdentityIfApplicable`, surfaces the resolved pair → client stamps the new conversation) and **magic-link verify** via a new AUTHENTICATED `POST /widget/resolve-identity` (reads the verified email from `req.userPayload`).
- **RV5 ✓** — public `POST /widget/forget` → `forgetVisitor` (archives auto-generated recaps by `SourceConversationID`, clears `VisitorKey` linkage); client `WidgetSessionClient.Forget` + loader handler calls `clearVisitorKey`; visitor-facing notice + "Forget me" control in `<mj-support-widget>` (gated on remembering + a wired handler).
- **Voice path ✓ (was the deferred gap)** — the returning-visitor anchor + resolved identity now ride the widget guest JWT as claims (`mj_visitor_key` / `mj_previous_conversation_id` / `mj_resolved_entity_id` / `mj_resolved_record_id` in `buildWidgetGuestClaims`), surfaced on `UserInfo.WidgetVisitorContext` (new field in `@memberjunction/core` `securityInfo.ts`, mirrors `MagicLinkScope`) by `buildMagicLinkSessionUser`, and stamped by `SessionManager.createConversation`. **No client voice changes** — the voice realtime mint already presents the same guest token. RV2's recap-on-close + RV3 injection then work for voice exactly as for text.

### Build + tests
- Full ordered build: **281/284 packages** build. The 3 failures — `@memberjunction/cli`, `@memberjunction/ng-record-merge`, `@memberjunction/record-comparison` — are a **pre-existing** break unrelated to this work: `core-entities` is missing the `RecordComparison*` remote-operation types from PR #2805 (dupe-detection), never generated on this branch. All returning-visitor-touched packages (`core`, `server`, `ai-agents`, `web-widget`) build clean.
- Unit tests: **MJCore 1407/1407 ✓**, **AI/Agents 1458/1458 ✓**, **Web/RealtimeWidget 58/58 ✓** (15 new — cookie round-trip/scoping/clear, gated cookie-write in the loader, `Mint`-with-visitorKey + returning-visitor mapping, `Forget`, `ResolveIdentity`, and the RV5 notice + forget control). **MJServer 466 passed**; 6 test *files* fail to **collect** — all from the same pre-existing RecordComparison break (`Class extends value undefined` → `RecordComparison/src/index.ts`), none touching returning-visitor code.

### Files changed this session
- `packages/MJCore/src/generic/securityInfo.ts` — `WidgetVisitorContext` interface + field on `UserInfo`.
- `packages/MJServer/src/auth/magicLink/types.ts` — 4 `mj_*` returning-visitor claims.
- `packages/MJServer/src/realtimeWidget/widgetCore.ts` — `buildWidgetGuestClaims` emits the claims.
- `packages/MJServer/src/realtimeWidget/WidgetSessionService.ts` — lazy recap, host-identity resolve+merge, `ResolveVisitorIdentity`, `ForgetVisitor`, returning-visitor claims in `mintToken`.
- `packages/MJServer/src/realtimeWidget/visitorIdentity.ts` — **new** (resolve/merge/forget core).
- `packages/MJServer/src/realtimeWidget/WidgetRouter.ts` — `/forget` (public) + `/resolve-identity` (authenticated) + `authenticatedRouter`.
- `packages/MJServer/src/agentSessions/ReturningVisitorRecap.ts` — `retentionDays` → `ExpiresAt`.
- `packages/MJServer/src/agentSessions/SessionManager.ts` — voice conversation stamps `WidgetVisitorContext`.
- `packages/MJServer/src/context.ts` — `extractWidgetVisitorContext` → `UserInfo.WidgetVisitorContext`.
- `packages/MJServer/src/index.ts` — mount the widget authenticated router after auth mw.
- `packages/MJServer/src/config.ts` — optional `widget.identityResolution` target.
- `packages/AI/Agents/src/realtime/realtime-client-session-service.ts` — RV3 scope threading.
- `packages/Web/RealtimeWidget/src/{types,session/widget-session-client,transport/runtime-widget-transport,loader,ui/support-widget-element,ui/tokens}.ts` — resolved-pair mapping/stamping, `Forget`/`ResolveIdentity`, notice + forget control + styles.
- Tests: `widget-session-client.test.ts`, `loader.test.ts`, `support-widget-element.test.ts` (added), `visitor-key-cookie.test.ts` (new).

### Known follow-ups (out of scope here)
- The pre-existing `RecordComparison*` codegen gap blocks 3 builds + 6 MJServer test files — fix by generating the remote-operation types into `core-entities` (separate, PR #2805 territory; do NOT hand-edit codegen).
- Voice recap-on-close passes no `retentionDays` (the widget isn't directly known in `SessionManager`) → voice recaps use system-default retention, not the per-widget value. Resolve the widget from the conversation's `ApplicationID` if per-widget voice retention is needed.
