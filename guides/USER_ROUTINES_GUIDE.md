# User Routines Guide

**Audience**: developers building on, extending, or debugging User Routines — the self-service "agents that work on my schedule" feature (P1.5 of the Conversations roadmap, shipped 5.45 via PR #3035).

User Routines let any user say *"run this for me every weekday morning"* or *"watch this and tell me when it changes"* — no admin, no cron knowledge, no showing up to ask. The system counterpart is `MJ: Scheduled Jobs` (admin-owned infrastructure); routines are the **user-owned, notification-oriented** sibling built on top of it.

---

## 1. The mental model

A **routine** = *target* × *schedule* × *notification contract*, owned by one user.

| Axis | Values | Meaning |
|---|---|---|
| **TargetType** | `Agent` / `Action` / `Prompt` | *What runs.* Agent = full loop (tools, skills, memory) via `AgentRunner`; Prompt = single-shot `AIPromptRunner` (cheap, no tools); Action = deterministic, no AI at all. The conversations UX creates Agent routines only; the other types are API/app territory. |
| **RoutineType** | `Scheduled` / `Monitoring` | *Why it notifies.* Scheduled = report per `NotifyCondition`; Monitoring = a *watch* — result-hash comparison makes `OnChange` meaningful ("quiet until something moves"). |
| **NotifyCondition** | `Always` / `OnSuccess` / `OnFailure` / `OnChange` | When the owner + recipients hear about a run. |

Two orthogonal dials complete the contract: the **activation window** (`StartAt`/`EndAt` — an `Active` routine only runs inside the window; automatic start and sunset without touching `Status`) and **`RequestedSkillIDs`** — a JSON array of `MJ: AI Skills` IDs threaded as `ExecuteAgentParams.requestedSkillIDs`, so an Agent routine starts every run pre-armed with skills (explicit-request path: honors `RequestedOnly` skills, all availability gates apply — see the [Agent Skills & Plan Mode Guide](AGENT_SKILLS_AND_PLAN_MODE_GUIDE.md)).

## 2. Schema (migration `V202607022102__v5.45.x__User_Routines.sql`)

- **`UserRoutine`** — owner (`UserID`), optional `EnvironmentID`, `Status` (`Active`/`Paused`/`Disabled`), the axes above, `InitialMessage` (the message sent to the target each run), `StartingPayload` (JSON), `CronExpression` + IANA `Timezone`, `NextRunAt`/`LastRunAt`/`LastRunStatus`/`LastResultHash`, notification fields incl. `NotificationTemplateID` (FK → `Template`), and `ConversationID` (FK → `Conversation`, second migration `V202607030315` — see §3a).
- **`UserRoutineRecipient`** — additional recipients: `UserID` **xor** `Email` (enforced by `MJUserRoutineRecipientEntityServer.Validate()`, the same pattern as `AISkillPermission` grantee exclusivity — deliberately not a DB CHECK), `Channel` (`InApp`/`Email`), `Sequence` for explicit ordering.
- **`UserRoutineRun`** — per-execution audit: timing, `Status` (`Running`/`Success`/`Failed`/`Skipped`), `ResultSummary`, `ResultHash`, `NotificationSent`, `ErrorMessage`, and **linkage-only telemetry**: `AgentRunID` / `PromptRunID` / `ActionExecutionLogID`. There are deliberately no token/cost columns — join through the FK to the execution record that already owns full telemetry.

## 3. The dispatcher

One admin **`User Routine Dispatcher`** scheduled job (metadata-seeded, 1-minute cron, `ConcurrencyMode=Skip`) drives everything. `UserRoutineDispatcherDriver` (`@memberjunction/scheduling-engine`, `@RegisterClass(BaseScheduledJob, 'UserRoutineDispatcherDriver')`) each sweep:

1. **Selects due routines**: `Status='Active'` ∧ inside `[StartAt, EndAt)` ∧ `NextRunAt <= now (+1s tolerance)`. New routines with `NextRunAt IS NULL` get one computed and saved — they run at their *next* occurrence, never retroactively.
2. **Claims before running**: advances `NextRunAt` to the next cron occurrence and persists *first* — an overlapping sweep or a mid-run crash can never double-run a routine. (`ConcurrencyMode=Skip` on the job is the second, cross-server guard.)
3. **Executes** with bounded concurrency (`Configuration.MaxConcurrentRoutines`, default 3) and per-routine error isolation — one routine failing never kills the sweep.
4. **Records** the `UserRoutineRun` row (linkage FK per target type) and updates `LastRunAt`/`LastRunStatus`/`LastResultHash`.
5. **Notifies** per `NotifyCondition` (`OnChange` = SHA-256 result hash differs from the previous run): renders the routine's `NotificationTemplateID` Template — or the metadata-seeded **`User Routine Notification - Default`** template when NULL (resolved by name; nothing hardcoded) — through the MJ templating engine with `{routine, run, resultSummary, status}` context, then delivers in-app (and email per channel config) to the owner + recipients in `Sequence` order.

**"Run now"** in the UI = set `NextRunAt = now` and save; the next sweep (≤ 1 minute) picks it up. Honest latency, zero extra machinery.

All schedule math lives in **`UserRoutineProcessor`** — pure, DB-free functions (`ComputeRoutineNextRunAt` with the StartAt floor, window evaluation, the notify matrix, result hashing). `MJUserRoutineEntityServer` reuses `ComputeRoutineNextRunAt` on save, so the entity path and the dispatcher can never disagree about when a routine runs next.

### 3a. Conversation mode (Agent targets)

Agent-target routines run **inside a dedicated conversation** so every run is a reviewable chat turn. On the first conversation-mode run the dispatcher's `EnsureRoutineConversation` creates one Conversation per routine — owned by the routine's owner, `Type='Routine'`, **`ApplicationScope='Application'` + the `Routines` Application's ID** (the same mechanism that hides meeting-room and Form Builder cockpit conversations from the default chat list — `ConversationEngine.LoadConversations` filters to `ApplicationScope IN ('Global','Both')`), Linked to the routine record, with the routine's agent pinned as `DefaultAgentID` — and persists `UserRoutine.ConversationID` for reuse. Execution then goes through `AgentRunner.RunAgentInConversation`, which writes the user turn (`InitialMessage`), the assistant turn (agent result), and stamps `AIAgentRun.ConversationID`/`ConversationDetailID` — exactly the path the interactive chat UI uses.

**Best-effort by design**: if the `Routines` application isn't installed or conversation creation fails, the run falls back to standalone `RunAgent` — identical run-row recording, just no thread. Prompt/Action targets always run standalone.

The UI surfaces the thread via a chat icon on the routine card (shown when `ConversationID` is set) → `ConversationOpened` event → the conversations host closes the slide-in and selects the conversation in chat.

### 3b. Deleting a routine

`MJUserRoutineEntityServer.Delete()` cascades **recipients + run bookkeeping rows first** (FK cleanup, per BASE_ENTITY_SERVER_PATTERNS), then the routine row — so deleting a routine that has run works from ANY client with one `Delete()` call. The linked Agent Run / Prompt Run / Action Execution Log records (and the routine's conversation) survive — that's where the real telemetry and content live.

## 4. Client stack

- **`UserRoutineEngine`** (`@memberjunction/core-entities`) — pure-metadata `BaseEngine` subclass, **not** auto-startup (no `@RegisterForStartup`); call `Config(false, user)` where needed. Caches the current user's routines/recipients/recent runs with `ObserveProperty`-reactive getters.
- **`@memberjunction/ng-user-routines`** (Generic — no Router imports) — the widget set: `MyRoutinesList`, `NewRoutine` (Agent-only v1: implicit `TargetType='Agent'`, categorical agent tree picker from `@memberjunction/ng-trees` grouped by category showing each agent's `IconClass`, Realtime-type agents excluded; the per-run message field is the `@memberjunction/ng-composer` mention editor in ClassFactory-discovery mode with `ExcludedTriggerKeys=['agent-mentions']` — `#` records and `/` skills work when ng-conversations' composer plugins are registered, and it degrades to a plain editor when they aren't), `RoutineHistory` (run rows linking to the underlying Agent Run / Prompt Run / Action Log via a `HistoryRecordOpened` event — host does navigation), the **`UserRoutinesCommandCenter`** composite, and a **slide-in wrapper** over the standard `@memberjunction/ng-ui-components` slide-in. Consumer surface follows the ng-conversations idiom: PascalCase inputs/outputs, **cancelable Before/After event pairs** (`BeforeRoutineCreated`, `BeforeRoutineRunNow`, … with `event.Cancel`).
- **Record-open + conversation-open chains** — `RoutineHistory` rows link to the underlying execution record via `HistoryRecordOpened {EntityName, RecordID}`; the conversations hosts bridge it to the standard `openEntityRecord {entityName, compositeKey}` chain (→ `NavigationService.OpenEntityRecord` in Explorer). The card's chat icon raises `ConversationOpened` → hosts select the routine's conversation in chat. The standalone Routines app navigates directly.
- **ng-conversations** hosts the entry point: a **Routines section at the very bottom of the left sidebar** (icon `fa-solid fa-business-time` — the routines mark everywhere). Two gates, both required to show it: the bubbled **`ShowRoutines`** input (default `true`) so consumers can disable the surface, **and** an entity-permission check — if the current user lacks Read on `MJ: User Routines` (via `EntityInfo` user permissions), the section hides regardless of the prop: *admin-disabled is invisible, not noisy*.
- **Routines app** — the full-power Explorer surface (all target types, all fields), standard dashboard chrome.

## 5. Security model

Owner-scoped: routines are private to their creator (entity permissions + owner filtering seeded in `metadata/entity-permissions/`); recipients receive *notifications*, not access. The UI additionally respects entity-level Read as the visibility gate (see §4). The dispatcher executes each routine **as its owner** (`contextUser` = routine owner) so agents/actions run with the owner's data access — a routine can never see more than its creator can.

## 6. Testing surface

| Layer | Where |
|---|---|
| Pure schedule/notify/hash logic | `packages/Scheduling/engine/src/__tests__/UserRoutineProcessor.test.ts` (DB-free) |
| Entity servers (NextRunAt on save, recipient exclusivity) | `packages/MJCoreEntitiesServer/src/__tests__/MJUserRoutine*.test.ts` |
| Live integration (deterministic, self-cleaning) | `packages/MJServer/integration-test-scripts/user-routines-tests.ts` — 16 tests: window edges, claim semantics, a full dispatcher pass over an Action-target fixture with run-row linkage, cascade delete after real runs (UR14), and the conversation contract (UR15/16 — hidden Application-scoped creation + idempotent reuse); part of `npm run test:integration` (required before "done") |
| E2E | Playwright against MJ Explorer: create a routine in conversations, watch the dispatcher execute it live, verify run history + notifications |

## 7. Where to look

| Concern | File |
|---|---|
| Pure schedule/notify primitives | `packages/Scheduling/engine/src/UserRoutineProcessor.ts` |
| Dispatcher | `packages/Scheduling/engine/src/drivers/UserRoutineDispatcherDriver.ts` |
| Entity servers | `packages/MJCoreEntitiesServer/src/custom/MJUserRoutine*.server.ts` |
| Client engine | `packages/MJCoreEntities/src/engines/UserRoutineEngine.ts` |
| Widgets | `packages/Angular/Generic/user-routines/` |
| Conversations entry | `packages/Angular/Generic/conversations/` (sidebar routines section) |
| Metadata bundle | `metadata/scheduled-jobs/.user-routine-dispatcher-job.json`, `metadata/templates/.user-routine-notification-template.json`, `metadata/entity-permissions/.user-routine-permissions.json` |
| Schema | `migrations/v5/V202607022102__v5.45.x__User_Routines.sql` (hand DDL at top) |
| Design record | `plans/user-routines/design-brief.md` (locked decisions) + `mockups/` |
