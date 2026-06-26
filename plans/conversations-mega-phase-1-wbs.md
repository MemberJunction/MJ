# Conversations Mega Phase 1 — Work Breakdown Structure (WBS)

**Status:** Detailed build plan for review
**Scope:** `@memberjunction/ng-conversations`, `@memberjunction/conversations-runtime`, `@memberjunction/ai-agents`, `MJCoreEntities`, `Scheduling`, migrations
**Companion docs:** `conversations-competitive-ux-study.md` (the why), `conversations-librechat-parity-proposal.md` (first pass)
**Audience:** Future implementing agents. Each task is written to be executable step-by-step.

---

## 0. How to use this document

- **Mega Phase 1** is one release-sized effort composed of **sub-phases P1.1 … P1.8**. Group-chat *runtime code* is deferred to **Phase 2**; P1.8 lands only its metadata + UX mockups so Phase 2 is code-only.
- Sub-phases are independently shippable PRs. Recommended order is by leverage + dependency (see §2).
- Every task has: **Deliverable · Files/Entities · Steps · Acceptance criteria · Tests · Risk**.
- Task IDs are stable (`P1.4.3`) — reference them in commits/PRs.

### 0.1 Standing conventions (apply to EVERY task)

- **Migrations:** highest `migrations/v*/` folder (currently `v5`). Naming `VYYYYMMDDHHMM__v5.x_[DESCRIPTION].sql`. Hardcoded UUIDs (never `NEWID()`), `${flyway:defaultSchema}`, consolidated `ALTER TABLE`, `sp_addextendedproperty` for every new column, NO `__mj_*` timestamps, NO FK indexes (CodeGen owns both). New entities use the **`MJ: ` name prefix**.
- **CodeGen runs after every migration** before any TypeScript references new fields. Never use `.Get()/.Set()` for new columns — wait for generated types.
- **Strong typing only** — no `any`. Generated `BaseEntity` subclasses everywhere.
- **Runtime-first:** framework-agnostic logic (token rollup, cron eval wrappers, plan/skill models) lives in `@memberjunction/conversations-runtime` or the relevant engine; Angular only renders.
- **UI:** additive & opt-in behind `@Input()` flags; expose chrome via the existing slot system; `--mj-chat-*`/semantic tokens only (`npm run check:ui`); `mjButton`/MJ UI components; modern `@if/@for`; `inject()`.
- **Preferences** via `UserInfoEngine` (never `localStorage`).
- **Reactivity** via `BaseEngine` + `ObserveProperty`.
- **Tests:** Vitest for new runtime/engine logic; update affected package tests; report pass/fail.
- **Server code** passes `contextUser` to all `GetEntityObject`/`RunView`.

### 0.2 Decision log (locked unless flagged ⚠️ NEEDS SIGN-OFF)

| # | Decision | Status |
|---|---|---|
| D1 | Folders == `MJ: Projects` (confirmed in code). Project-scoped memory keys off `Conversation.ProjectID`. | Locked |
| D2 | My Routines = single dispatcher job + dedicated `MJ: User Routines` entity (NOT per-routine scheduled jobs). | Locked |
| D3 | Skill instructions are **appended** to agent system prompt; Skills do NOT use `AIAgentPrompt`. | Locked |
| D4 | New `AIAgentRunStep` StepType values: `Skill`, `Plan`. | Locked |
| D5 | Plan mode default **OFF**; gated by `AIAgent.SupportsPlanMode` + per-run runtime toggle. | Locked |
| D6 | Project memory inheritance = **broad** (project notes + global). `projectId` fixed per conversation. | Locked |
| D7 | Incognito = `Conversation.IsTemporary`; persisted-but-hidden; skip memory read+write. | Locked |
| D8 | Group chat: Phase 1 = metadata + mockups; Phase 2 = runtime code. | Locked |
| D9 | Routines surface = dedicated Routines app + conversation entry point. | ⚠️ confirm app-vs-section |
| D10 | Skill authoring permission model: new role/permission vs. reuse existing admin gate. | ⚠️ NEEDS SIGN-OFF |

---

## 1. Architectural anchors (what we build on — already exists)

| Capability | Anchor (file) |
|---|---|
| Agent loop, system-prompt assembly, Chat/HITL step | `packages/AI/Agents/src/base-agent.ts`; agent-types `loop-agent-type.ts` |
| Human-in-the-loop request/approval | `MJ: AI Agent Requests` (+ `AIAgentRequestType`); `createPersistentAIAgentRequest` |
| Action/sub-agent bundling + governance | `AIAgentAction`, `AIAgentRelationship` junctions |
| Memory scoping (Agent/User/Company + primary/secondary) | `packages/AI/Agents/src/agent-context-injector.ts`, `MemoryWriteManager.ts`, `memory-manager-agent.ts` |
| Scheduling engine + agent driver | `packages/Scheduling/engine/src/ScheduledJobEngine.ts`, `drivers/AgentScheduledJobDriver.ts`, `CronExpressionHelper.ts` |
| Artifact render + React runtime + plugin viewers | `packages/Angular/Generic/artifacts/...`, `@memberjunction/react-runtime`, `@memberjunction/interactive-components` |
| Conversation/Projects/streaming | `packages/MJCoreEntities/src/engines/conversations.ts`; `packages/ConversationsRuntime/src/streaming/ConversationStreaming.ts` |
| Resource permissions (sharing) | `MJ: Resource Permissions` + `ResourcePermissionEngine` |
| Notifications (in-app) + comms (email) | `MJNotificationService`, `CommunicationEngine` |

---

## 2. Sub-phase sequencing & dependencies

```
P1.1 Context & Cost Gauge        (no deps)            ── quick win
P1.2 UX polish bundle            (no deps)            ── quick win
P1.3 Plan Mode                   (no deps)            ── core agent loop
P1.4 Skills                      (no deps; pairs w/ P1.3 run-step work)
P1.5 My Routines                 (no deps; uses Scheduling + Notifications)
P1.6 Project-scoped Memory       (no deps; D1 confirmed)
P1.7 Artifact edit + share/remix (no deps; builds on artifact stack)
P1.8 Group-chat metadata+mockups (no deps; sets up Phase 2)
```
All sub-phases are parallelizable across developers. P1.3 and P1.4 both touch `AIAgentRunStep` StepType + the loop — coordinate the enum migration (do it once, see P1.3.1 / P1.4.1 shared note).

---

## P1.1 — Context & Cost Gauge

**Goal:** Opt-in per-conversation indicator: context-window %, tokens, running cost.

| Task | Detail |
|---|---|
| **P1.1.1** Runtime rollup | In `conversations-runtime`, add a pure function `computeConversationUsage(details, agentRuns)` → `{ inputTokens, outputTokens, cost, contextLimit?, pctUsed? }`. Source data from peripheral `agentRunsByDetailId` (already loaded). Context limit from the active agent's resolved model via `AIEngineBase`. **Acceptance:** unit-tested pure fn; returns partial (tokens+cost) when limit unknown. **Risk:** Low. |
| **P1.1.2** Gauge component | `mj-conversation-context-gauge` (standalone). Renders compact bar + tooltip breakdown. `--mj-chat-*` tokens. **Acceptance:** renders in header; degrades to tokens+cost with no %. |
| **P1.1.3** Wiring + pref | `@Input() ShowContextGauge=false` on chat-area; expose via `header` slot. Persist show/hide via `UserInfoEngine` key `mj.conversations.contextGauge.v1`. **Acceptance:** off by default; pref round-trips. |
| **Tests** | Vitest for P1.1.1; component smoke test. |

---

## P1.2 — UX polish bundle (quote, shortcuts, TOC, fork)

**Goal:** Table-stakes ergonomics. Each is independently small.

| Task | Detail |
|---|---|
| **P1.2.1** Quote / multi-quote | Selection directive on message-list; floating "Quote" button on text selection; inserts blockquote into `mj-mention-editor` with a back-ref to source `ConversationDetailID`. Multi-quote = composer accumulator (runtime state). **Acceptance:** select→quote→send carries quoted text + ref. |
| **P1.2.2** Keyboard registry | `ConversationKeyboardService` (widget-scoped registry `{combo, description, handler, scope}`); `?` opens `mj-keyboard-shortcuts-overlay`. Host-focus-scoped so embeds don't hijack keys. v1 fixed bindings (new convo, focus composer, send, search, toggle sidebar, escape). **Risk:** Med — scope carefully. |
| **P1.2.3** Long-thread TOC | Auto section list for threads > N messages; jump-to. Derive sections from agent turns / headings. **Acceptance:** appears only when long; jumps correctly. |
| **P1.2.4** Conversation fork | "Branch from here" on a message → clone conversation + details up to that point into a new conversation (new `ProjectID` inherited). Runtime helper `forkConversation(detailId)`. **Acceptance:** original untouched; fork starts from chosen point. **Risk:** Med — clone semantics + artifact refs. |
| **Tests** | Quote accumulator + fork-clone logic unit-tested in runtime. |

---

## P1.3 — Plan Mode

**Goal:** Any Loop agent can return a plan for approval before executing, gated by capability + per-run toggle. Reuses `AIAgentRequest`.

| Task | Detail |
|---|---|
| **P1.3.1** Schema | Migration: (a) add `SupportsPlanMode BIT NOT NULL DEFAULT 0` to `AIAgent`; (b) add `Plan` to `AIAgentRunStep.StepType` check-constraint/value list (⚠️ coordinate with P1.4.1 — extend the constraint ONCE to include both `Plan` and `Skill`). `sp_addextendedproperty` for new column. **Then CodeGen.** |
| **P1.3.2** Loop prompt | In the core Loop agent system-prompt template, add a **conditional "Plan Mode" block** instructing the model to return a structured plan first. Injected ONLY when `SupportsPlanMode && runtime planMode active`. **Acceptance:** prompt unchanged for agents without the flag. |
| **P1.3.3** Loop handling | In `LoopAgentType.DetermineNextStep`, recognize a `plan` response → return a `Plan` next-step. In `base-agent.ts`, `executePlanStep()`: persist an `AIAgentRequest` (RequestType=Plan-Approval) carrying the plan + `ResponseSchema` (approve/edit/reject), record an `AIAgentRunStep` (StepType=`Plan`), suspend. On approval/edit response, resume execution with the (possibly edited) plan in context. **Risk:** Med — reuse Chat suspend/resume plumbing. |
| **P1.3.4** Runtime toggle | `ExecuteAgentParams.planMode?: boolean`. Thread from conversation runner. **Acceptance:** capable agent only plans-first when toggle on. |
| **P1.3.5** UI | Plan-mode toggle in composer (shown only when active agent `SupportsPlanMode`); render the plan-approval request as an editable card (approve / edit / reject) reusing the response-form path. Wire `(beforeAgentTurn)` etc. as needed. **Acceptance:** user can approve/edit/reject; rejection aborts cleanly. |
| **Tests** | Loop unit test: plan step suspends + resumes; approval injects edited plan. |

---

## P1.4 — Skills (capability bundles)

**Goal:** Reusable, governed bundles of (instructions + optional Actions + optional sub-agents) attachable to 1+ agents; appended to system prompt on activation; new run-step type.

### Data model (P1.4.1 — one migration, then CodeGen)

| Entity | Key fields |
|---|---|
| `MJ: AI Skills` | `ID`, `Name`, `Description`, `Instructions` (NVARCHAR(MAX) — appended to system prompt), `Status` ('Active'/'Pending'/'Deprecated'), `Category`, `CreatedByUserID`, `Scope` ('Global'/'User') |
| `MJ: AI Skill Actions` | `ID`, `SkillID`→Skills, `ActionID`→Actions, `MinExecutionsPerRun?`, `MaxExecutionsPerRun?` |
| `MJ: AI Skill Sub Agents` | `ID`, `SkillID`→Skills, `SubAgentID`→AIAgent |
| `MJ: AI Agent Skills` | `ID`, `AgentID`→AIAgent, `SkillID`→Skills, `Status` ('Active'/'Pending'/'Revoked') — used when agent `AcceptsSkills='Limited'` |
| `AIAgent` (alter) | add `AcceptsSkills NVARCHAR(20) NOT NULL DEFAULT 'None'` ('None'/'All'/'Limited') |
| `AIAgentRunStep.StepType` | add value `Skill` (⚠️ same constraint edit as P1.3.1 — do `Plan`+`Skill` together) |

All new columns get `sp_addextendedproperty`. Seed reference data (skill categories, if enum-ish) via metadata files, not SQL inserts.

### Implementation

| Task | Detail |
|---|---|
| **P1.4.2** Skills engine | New `BaseEngine` subclass caching Active skills + agent-skill map (reactive via `ObserveProperty`). Resolves "which skills are available to agent X" (All vs Limited-junction). |
| **P1.4.3** Prompt exposure | In `gatherPromptTemplateData()`, inject **skill catalog** (name + description only — progressive disclosure) for skills the agent accepts. **Acceptance:** idle context cost ≈ names/descriptions only. |
| **P1.4.4** Activation step | LLM returns `step: 'skill'` with `skillId`. In `base-agent.ts` `executeSkillStep()`: validate the agent accepts it; **append** the skill `Instructions` to the working system prompt for subsequent turns; add the skill's Actions + sub-agents to the available tool surface for the run; record `AIAgentRunStep` (StepType=`Skill`). NOT a nested agent run. **Risk:** Med — tool-surface mutation mid-run; ensure governance (min/max executions) honored. |
| **P1.4.5** Governance | Enforce `AcceptsSkills`; `AIAgentSkill.Status` for Limited; `Skill.Status` (only Active activatable); author permission (D10). |
| **P1.4.6** Authoring UI | Skills management surface (Explorer dashboard or core-entity-forms): create/edit skill (instructions + pick Actions + pick sub-agents), set status, assign to agents. + agent form: `AcceptsSkills` control + Limited-list picker. |
| **P1.4.7** (stretch) `SKILL.md` import/export | Align skill shape to the open `SKILL.md` standard for portability (name/description/body). Export a skill as `SKILL.md`; import one. **Risk:** Low; defer if time-boxed. |
| **Tests** | Engine resolution (All/Limited); activation appends instructions + enables tools; governance rejects non-accepted skills. |

---

## P1.5 — My Routines (user-controlled scheduled prompts)

**Goal:** Users author prompts/agent-runs that run on a schedule they control, with per-routine notifications — via a single dispatcher job (D2).

### Data model (P1.5.1 — one migration, then CodeGen)

| Entity | Key fields |
|---|---|
| `MJ: User Routines` | `ID`, `UserID` (owner), `EnvironmentID`, `Name`, `Description`, `Status` ('Active'/'Paused'/'Disabled'), `RoutineType` ('Scheduled'/'Monitoring'), `TargetType` ('Agent'/'Action'/'Prompt'), `TargetID`, `InitialMessage` (NVARCHAR(MAX)), `StartingPayload` (NVARCHAR(MAX) JSON), `CronExpression`, `Timezone`, `NextRunAt`, `LastRunAt`, `LastRunStatus`, `LastResultHash` (for OnChange monitoring), `NotifyCondition` ('Always'/'OnSuccess'/'OnFailure'/'OnChange'), `NotifyViaInApp` BIT, `NotifyViaEmail` BIT |
| `MJ: User Routine Recipients` | `ID`, `RoutineID`→User Routines, `UserID?`, `Email?`, `Channel` ('InApp'/'Email') — for "and/or others" |
| `MJ: User Routine Runs` | `ID`, `RoutineID`, `StartedAt`, `CompletedAt`, `Status`, `AgentRunID?`, `TokensUsed?`, `Cost?`, `ResultSummary` (NVARCHAR(MAX)), `ResultHash`, `NotificationSent` BIT, `ErrorMessage?` |

Row-level access: users see only their own routines/runs (owner filter). All new columns `sp_addextendedproperty`.

### Dispatcher (P1.5.2)

- **One** admin `MJ: Scheduled Jobs` row "User Routine Dispatcher" (seeded via `metadata/scheduled-jobs/`), cron e.g. `0 */1 * * * *` (every minute), driver = new `UserRoutineDispatcherDriver` (in `packages/Scheduling/engine/src/drivers/`).
- Driver logic each tick:
  1. Load `Active` routines where `NextRunAt <= now` (or evaluate cron via `CronExpressionHelper.IsExpressionDue`).
  2. For each due routine, **atomically claim** (optimistic: set `LastRunAt`/a running marker), then run target:
     - `Agent` → `AgentRunner.RunAgent({ agent, conversationMessages:[{role:'user',content:InitialMessage}], payload:StartingPayload, contextUser: routine owner })`
     - `Action` → ActionEngine; `Prompt` → AIPromptRunner.
  3. Write a `User Routine Runs` row (status/tokens/cost/summary/hash).
  4. Compute `NextRunAt` via `CronExpressionHelper.GetNextRunTime`.
  5. Evaluate `NotifyCondition` (for `OnChange`, compare `ResultHash` vs `LastResultHash`) → if firing, dispatch notifications (in-app via notification entity; email via `CommunicationEngine`) to owner + `User Routine Recipients`.
  6. Bounded concurrency; per-routine isolation (one failure doesn't break the sweep); heartbeat the dispatcher job for long sweeps. **Risk:** Med — long-running routines within lease; v1 bounds concurrency + heartbeats, note async-queue as a future option.

### UX (P1.5.3 — confirm D9 app-vs-section)

- **Routines app/dashboard** (`BaseDashboard`, follows dashboard guide + chrome): list (owner-filtered), create/edit (target picker, friendly cron builder — daily/weekly/custom, Timezone), Run-now, run history, notification config (condition + channels + recipients).
- **Conversation entry point:** "Turn this into a routine" from a message/prompt in ng-conversations → prefilled create form (TargetType=Agent + InitialMessage from the message). This is the "promote-a-prompt-to-a-schedule" UX.
- Friendly cron picker component (reusable).

| Task | Detail |
|---|---|
| **P1.5.4** Notifications finish | Complete the delivery path the dispatcher needs: in-app notification rows + `CommunicationEngine` email. (Note: `Scheduling/NotificationManager` is a stub; our dispatcher owns delivery directly, or we finish the stub — pick one, document.) |
| **Tests** | Cron due-evaluation; OnChange hash logic; dispatcher isolation (one routine throws, others run); notification firing per condition. |

---

## P1.6 — Project-scoped Memory + Incognito

**Goal:** Memory scoped to a conversation's project (folder), plus a temporary/incognito mode. (D1/D6/D7.)

### Schema (P1.6.1 — one migration, then CodeGen)

- Add `ProjectID UNIQUEIDENTIFIER NULL` FK→`MJ: Projects` to `AIAgentNote` and `AIAgentExample`.
- Add `IsTemporary BIT NOT NULL DEFAULT 0` to `Conversation`.
- `sp_addextendedproperty` for all three.

### Implementation

| Task | Detail |
|---|---|
| **P1.6.2** Scope lattice | Extend `agent-context-injector.ts`: add `projectId?` to `GetNotesParams`/`GetExamplesParams`; extend `filterNotesByScoping()` + `buildNotesScopingFilter()` to include Project as a **broad** dimension (`ProjectID = X OR ProjectID IS NULL`); add to `buildScopePreFilter` vector path. **Risk:** Med — lattice grows from 8 to ~12 conditions; keep SQL + in-memory paths in sync. |
| **P1.6.3** Write scope | `MemoryWriteManager`: add `projectId` to `MemoryWriteContext`/`MemoryWriteScope`; `clampScope()` carries it; `persistNewNote()` stamps `ProjectID`. |
| **P1.6.4** Thread projectId | `BaseAgent.initializeAgentRun()`: when the run originates from a conversation, resolve `Conversation.ProjectID` → `ExecuteAgentParams` → injector + writer. `memory-manager-agent.ts`: carry `ProjectID` onto consolidated notes; never merge across projects. |
| **P1.6.5** Incognito | `ExecuteAgentParams.temporary?: boolean`. When set (or `Conversation.IsTemporary`), `InjectContextMemory()` skips read and the loop skips `MemoryWriteManager`. UI: "Temporary chat" toggle; temporary conversations hidden from the list by default. **Acceptance:** temporary run neither reads nor writes notes. |
| **P1.6.6** (optional) Memory panel hook | If P1 also surfaces the user-visible memory panel (from the study Tier 2.1), scope its view by project filter. (Can be its own task or deferred.) |
| **Tests** | Project note only injects in matching project + global; temporary run is memory-inert; consolidation respects project cohort. |

---

## P1.7 — Artifact edit + share/remix

**Goal:** Close the Canvas gap on our terms — direct edit for text/code artifacts + share/remix. (Builds on the existing artifact + React-runtime stack.)

| Task | Detail |
|---|---|
| **P1.7.1** Editable viewer | For text/code/markdown artifact types, make the viewer editable (not read-only): user edits → saves a **new `MJ: Artifact Versions` row** (preserve immutable-version model). Agent remains a collaborator. **Risk:** Med — reconcile user-edit vs agent-regenerate version lineage. |
| **P1.7.2** Share link | Extend artifact sharing to produce a link viewable per `MJ: Resource Permissions` (and/or a `Public` scope already on `MJ: Conversation Artifacts`). Decide guest-view policy. ⚠️ confirm whether truly public (no-auth) links are in scope. |
| **P1.7.3** Remix | "Remix" → clone artifact (+ latest version) into a new artifact owned by the current user, opened in a new conversation. **Acceptance:** original untouched; remix is independently editable. |
| **P1.7.4** (spike only) Artifacts-as-apps | Evaluate a component→agent `callAgent()` RPC so interactive components can invoke an agent. **Spike + writeup, no commit this phase.** |
| **Tests** | Edit creates new version; remix clones without mutating source. |

---

## P1.8 — Group Chat: metadata + UX mockups (Phase 2 prep)

**Goal:** Land everything a code-only Phase 2 needs: schema + designed flows. **No runtime behavior changes this phase.**

| Task | Detail |
|---|---|
| **P1.8.1** Schema | Migration (then CodeGen): `MJ: Conversation Participants` (`ID`, `ConversationID`, `UserID`, `Role` 'Owner'/'Member'/'Guest', `Status` 'Invited'/'Active'/'Removed', `InvitedByUserID`, `InvitedAt`, `JoinedAt`, `NotificationPreference`); add `IsGroup BIT NOT NULL DEFAULT 0` to `Conversation`. `sp_addextendedproperty` throughout. **Acceptance:** entities generate; no behavior wired. |
| **P1.8.2** Backfill semantics | Document migration semantics: existing single-owner conversations → owner is sole participant (lazy or backfill). No runtime enforcement yet. |
| **P1.8.3** UX mockups | Clickable/wireframe mockups (markdown + optionally static HTML) for: participant roster, invite flow (invite/accept/remove), per-message multi-user attribution, typing/presence indicators, group notifications. |
| **P1.8.4** Phase 2 spec | Write the Phase 2 code-only plan: participant engine, streaming/PubSub broadcast on `conversation:{id}` topic (message + typing + presence events), relax owner-only action checks → participant-with-permission, members modal wired to real entity, invites. (Reference the group-chat study's phased estimate ~3–4 weeks.) |
| **Tests** | Entity generation smoke only (no runtime). |

---

## 3. Cross-sub-phase shared work (do once)

| Item | Where | Note |
|---|---|---|
| `AIAgentRunStep.StepType` constraint edit | P1.3.1 + P1.4.1 | Add `Plan` AND `Skill` in a single constraint change to avoid two migrations clobbering the same constraint. |
| Friendly cron-picker component | P1.5 | Reusable; also useful if any other scheduling UI appears. |
| Notification delivery path (in-app + email) | P1.5.4 | Shared by routines now; reusable by group-chat (P2) and memory alerts later. |
| Conversation→agent param threading | P1.3.4 + P1.6.4 | Both add fields to `ExecuteAgentParams` and the conversation runner — coordinate the param object changes. |

---

## 4. Definition of Done (Mega Phase 1)

- All sub-phase acceptance criteria met; Vitest green for touched packages; `npm run check:ui` clean.
- Migrations applied + CodeGen run; no `.Get()/.Set()` on new fields.
- Every new surface opt-in/off-by-default; no behavior change for existing agents/conversations (Plan mode off, Skills `None`, no routines, memory project-scope additive, temporary off).
- Group-chat schema present + Phase 2 spec written; no group-chat runtime shipped.
- Docs: update `CONVERSATIONS_UX_STACK_GUIDE.md` + relevant package READMEs for each shipped feature.

## 5. Open items needing your sign-off

- **D9** — Routines as a dedicated top-level app vs. a section embedded in ng-conversations (recommend: app + conversation entry point).
- **D10** — Skill authoring permission model (new role/permission vs. reuse an existing admin gate).
- **P1.7.2** — Are truly public (no-auth) artifact share links in scope, or permission-gated only?
- **Plan-mode default** — confirm default OFF (recommended) vs ON.
- **Sequencing** — confirm leverage order (Routines & Plan mode first?) or reprioritize.
