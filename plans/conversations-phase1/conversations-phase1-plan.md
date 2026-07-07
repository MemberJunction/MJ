# Conversations Phase 1 — Plan & Work Breakdown Structure

> **This is the single source of truth for Phase 1.** It absorbs the earlier competitive
> study and the first-pass LibreChat proposal (both removed); their key conclusions are
> summarized in §0a below.

**Status:** Finalized build plan for review
**Scope:** `@memberjunction/ng-conversations`, `@memberjunction/conversations-runtime`, new `@memberjunction/ng-user-routines`, `@memberjunction/ai-agents`, `MJCoreEntities`, `Scheduling`, migrations
**Mockups:** `index.html` (browse) → `mockups/` (one file per area, three options each)
**Audience:** Future implementing agents. Every task is executable step-by-step.

> **🚧 In progress — being built in pieces.** Three sub-phases have been **carved out of this
> plan and into their own branch/PR** because they are self-contained agent-framework features
> that should not wait on the rest of the roadmap:
>
> - **P1.3 Plan Mode** + **P1.4 Skills** → ✅ **SHIPPED & 100% COMPLETE** — delivered via
>   PR [#2996](https://github.com/MemberJunction/MJ/pull/2996)/[#3009](https://github.com/MemberJunction/MJ/pull/3009)
>   (v5.44 core feature), then [#3013](https://github.com/MemberJunction/MJ/pull/3013)/[#3014](https://github.com/MemberJunction/MJ/pull/3014)/[#3015](https://github.com/MemberJunction/MJ/pull/3015)/[#3017](https://github.com/MemberJunction/MJ/pull/3017)
>   (5.45 train: core skill library, activation governance, per-step observability). Clean-DB verified
>   end to end (migrations → metadata sync → no-op codegen), covered by a 21-test headless integration
>   suite + ~60 unit tests, live-verified on Research Agent / Query Builder, and documented in the
>   **[Agent Skills & Plan Mode Guide](../../guides/AGENT_SKILLS_AND_PLAN_MODE_GUIDE.md)** — which
>   supersedes §P1.3/§P1.4 of this plan as the authoritative reference.
>
>   **What shipped goes substantially beyond this plan's spec:**
>   - **Skills** (per plan: Instructions + Action/sub-agent bundles, progressive-disclosure catalog,
>     in-loop `Skill` step, three-layer AcceptsSkills gate) — **plus, beyond plan:** a dedicated
>     **`MJ: AI Skill Permissions`** table with full agent-parity (User-xor-Role × View/Run/Edit/Delete;
>     open-by-default runtime helper + closed-by-default unified PermissionEngine provider) — this
>     **supersedes decision D10's Resource-Permissions/RLS design**; user-invoked **`/skill` composer
>     mentions** with guarded pre-activation (`ExecuteAgentParams.requestedSkillIDs`), permission-filtered
>     pickers, and refused-request notifications (server log + injected agent explanation + client toast);
>     **SKILL.md** portable import/export as typed Remote Operations (name-based references, non-fatal
>     unresolved-member warnings); a shipped **core library of 10 skills** (Web Research, Data Analysis &
>     Queries, Data Visualization, Document Builder, Communications, Data Import & Transform, File
>     Management, Scheduling & Automation, Lists & Audiences, Code & Computation — instructions
>     externalized to `metadata/ai-skills/templates/*.skill.md`); and **SkillSmith**, a *Smith-family
>     meta-agent that authors new skills conversationally and persists them Pending-gated.
>   - **Activation governance (5.45; not in this plan)** — the **double activation gate**:
>     `AISkill.ActivationMode` × `AIAgent.SkillActivationMode`, both `'Auto'`/`'RequestedOnly'` defaulting
>     **`RequestedOnly`**, so agent *self*-activation (the "super agent" posture) always requires two
>     deliberate opt-ins while explicit user `/skill` requests remain honored — the anti-skill-leakage
>     control, motivated by observing autonomous skill expansion in live testing.
>   - **Plan Mode** (per plan: per-request HITL gate on the existing `MJ: AI Agent Requests` pause/resume;
>     reject-forces-replan; Realtime/Proxy skip per D14/D15) — **plus, beyond plan:**
>     **`AIAgent.RequirePlanMode`** (mandatory plan mode per agent — callers cannot bypass),
>     **`AIAgentRun.PlanMode`** run-level stamping, and the **plan×skills rule** (post-approval skill
>     activations are rejected with re-plan guidance, so the human always reviews the full tool surface).
>   - **Observability (not in this plan)** — **`AIAgentRunStep.Skills`** records typed
>     `AgentSkillInvocation[]` provenance on every skill-touched step: activation type
>     (requested vs auto), the exact gate values that admitted the skill, and the agent's stated reason
>     (`skills:[{name, reason}]` in the loop response). The agent-run form renders a Plan-Mode header
>     chip, Skill/Plan step icons, per-step skill badges (auto-activations get a warning accent), and a
>     provenance drill-in tab.
>   - Original carve-out refinements retained: `AISkillAction` Min/Max execution columns dropped (the
>     model chooses); `AISkill.Status` defaults `Active`; composition junctions stay status-less. The
>     **consolidated "mega migration" in this PR remains superseded for these pieces** — their schema
>     shipped in `V202606301200__v5.44.x__Agent_Skills_And_Plan_Mode.sql` and
>     `V202607020811__v5.45.x__AISkill_ActivationMode.sql`.
>
> - **P1.5 User Routines** → ✅ **SHIPPED & MERGED** (to `next` 2026-07-03) — delivered via
>   PR [#3035](https://github.com/MemberJunction/MJ/pull/3035) (branch `user-routines`, 5.45):
>   migration `V202607022102__v5.45.x__User_Routines.sql` creates `UserRoutine` /
>   `UserRoutineRecipient` / `UserRoutineRun`, validated by a full virgin-DB replay of all
>   migrations with the CodeGen emit captured from that clean state. The **consolidated
>   "mega migration" in this PR is now also superseded for these three tables.** As-built
>   refinements vs. this plan's §P1.5 spec: `StartAt`/`EndAt` activation window (auto
>   start/sunset without touching Status); `UserRoutineRecipient.Sequence` for explicit
>   recipient ordering; `NotificationTemplateID` FK → Template so notifications render
>   through the MJ templating architecture (metadata-seeded default template when NULL —
>   nothing hardcoded); run telemetry is **linkage-only** (`AgentRunID`/`PromptRunID`/
>   `ActionExecutionLogID` — the planned TokensUsed/Cost columns were dropped as
>   duplicative); and `RequestedSkillIDs` (JSON array) pre-arms Agent targets with AI
>   Skills each run via `ExecuteAgentParams.requestedSkillIDs` (5.45 skills-framework
>   synergy). Dispatcher, `ng-user-routines`, the Routines app, and the conversations
>   entry point all shipped on that PR, documented in the
>   **[User Routines Guide](../../guides/USER_ROUTINES_GUIDE.md)** (which supersedes §P1.5 as the
>   authoritative reference). Two byproducts now exist as shared platform pieces this roadmap
>   builds on: the extracted **`@memberjunction/ng-composer`** package (pluggable
>   `ComposerTriggerProvider`s — `@` agents / `#` records / `/` skills) and the rebuilt Explorer
>   notifications page. Agent runs land inside a dedicated per-routine, **Application-scoped**
>   Conversation — the same hide-from-default-list machinery P1.6's incognito parallels.
>
> - **P1.6 Project-scoped Memory + Incognito** → 🔎 **NEXT UP** — pre-build code study of `next`
>   completed **2026-07-06** (post-#2996/#3009/#3013–#3017/#3035). §P1.6 below is **revised to the
>   as-built codebase**: the note-scoping lattice is now in-memory (the SQL filter the original
>   task targeted is dead code), consolidation project-isolation is NOT inherited and must be added
>   explicitly, Skip's context-bag `notes` is an unimplemented stub (deferred to P1.9),
>   `AIAgentRun.ProjectID` joins the schema, and incognito hiding parallels P1.5's
>   `ApplicationScope` mechanism. Proposed decisions **D17–D20** added to §0.3 (pending
>   ratification at build start). Ships from its **own branch/worktree with its own minimal
>   migration** — the mega migration in this PR is now fully historical (see the P1.0.2 status
>   note).
>
> This planning doc remains the umbrella source of truth for the **remaining** sub-phases.

---

## 0a. Background & competitive context (why this work)

This plan began as a comparison against one tool (LibreChat) and grew, after studying the
broader field, into a roadmap for MemberJunction's conversations platform. We inventoried
the self-hostable OSS field (Open WebUI, LibreChat, Lobe Chat, Big-AGI, AnythingLLM,
Cherry Studio, Jan, Chatbox, Hugging Face Chat UI, Msty) and the three flagship clients
(ChatGPT, Claude, Gemini), then scored MJ against the recurring "world-class" UX patterns.

**Where MJ already leads (defend & amplify):**
- **Agent-native, not model-native** — users talk to *agents* that resolve across many
  providers via the MJ AI framework; provider breadth is an agent-layer concern.
- **Grounding in real business data** — entity/record mentions and actions on governed
  data; unique in the field.
- **Realtime/voice depth** — voice co-agents, whiteboard + remote-browser channels,
  session review, a turn-moderator that already handles multi-agent concurrency.
- **Artifacts as first-class versioned/permissioned entities** with a live React runtime.
- **Embeddable, framework-agnostic runtime** (React/Vue/Node consumable) + enterprise posture.

**Where the field is ahead — the gaps this plan closes:**
editable-plan-before-run, user-visible & project-scoped memory + incognito, user-controlled
scheduled routines, live artifact edit/share/remix, in-chat skills, group chat, and a band
of UX polish (context/cost gauge, quote, keyboard shortcuts, long-thread TOC, fork).

**Deliberate non-goals (consistent with the layering):** no raw model picker, no multi-model
"merge", no provider-breadth-in-chat. Code-interpreter / real-file creation is owned by the
**CodeSmith** agent track, not this plan.

The sub-phases below map each gap to MJ's existing architecture (artifacts/React runtime,
scheduling engine, agent loop, memory scoping, conversation/realtime/proxy paths, unified
permissions), grounded in direct study of those subsystems.

---

## 0. How to use this document

- **Phase 1** is one release-sized effort. It begins with a **Foundations gate (P1.0)** — UX mockups reviewed by the user **and** the complete DB design as **one consolidated migration** — before any feature code. Feature sub-phases **P1.1 … P1.9** then build on that locked schema.
- **Group-chat runtime code and text-chat concurrency are deferred to Phase 2.** P1.8 lands only group-chat metadata + UX mockups; the concurrency coordinator is **design-only** in Phase 1.
- Every task: **Deliverable · Files/Entities · Steps · Acceptance · Tests · Risk**. Task IDs (`P1.4.4`) are stable — reference them in commits/PRs.

### 0.1 Two hard gates before feature work

1. **UX Mockup Review (P1.0.1)** — clickable/wireframe mockups for *every* feature, reviewed and signed off by the user. **No feature UI is built until its mockup is approved.**
2. **DB Design → One Consolidated Migration (P1.0.2)** — all new entities + altered columns designed together, shipped as a **single migration**, then CodeGen runs once. Feature code never invents schema ad hoc.

### 0.2 Standing conventions (apply to EVERY task)

- **Migrations:** highest `migrations/v*/` (currently `v5`). Naming `VYYYYMMDDHHMM__v5.x_[DESCRIPTION].sql`. Hardcoded UUIDs, `${flyway:defaultSchema}`, consolidated `ALTER TABLE` per table, `sp_addextendedproperty` per new column, NO `__mj_*` timestamps, NO FK indexes (CodeGen owns both). New entities use the **`MJ: ` prefix**.
- **CodeGen runs after the consolidated migration** before any TS references new fields. Never `.Get()/.Set()` new columns.
- **Strong typing only** (no `any`); generated `BaseEntity` subclasses everywhere.
- **Runtime-first:** framework-agnostic logic in `conversations-runtime`/engines; Angular only renders.
- **UI:** additive & opt-in behind `@Input()` flags; slot system; `--mj-chat-*`/semantic tokens only (`npm run check:ui`); MJ UI components + `mjButton`; modern `@if/@for`; `inject()`.
- **Preferences** via `UserInfoEngine` (never `localStorage`). **Reactivity** via `BaseEngine` + `ObserveProperty`.
- **Permissions** roll up into the **unified permissioning architecture** (`plans/unified-permissions-architecture.md`, `MJ: Resource Permissions`).
- **Tests:** Vitest for new runtime/engine logic; update affected tests; report results. **Server code** passes `contextUser` everywhere.

### 0.3 Decision log

| # | Decision | Status |
|---|---|---|
| D1 | Folders == `MJ: Projects` (confirmed). Project-scoped memory keys off `Conversation.ProjectID`. | Locked |
| D2 | Routines = single dispatcher job + dedicated entity (NOT per-routine scheduled jobs). | Locked |
| D3 | Skill instructions **appended** to agent system prompt; Skills do NOT use `AIAgentPrompt`. | Locked |
| D4 | New `AIAgentRunStep` StepType values: `Skill`, `Plan`. | Locked |
| D5 | **Plan mode capability `SupportsPlanMode` defaults ON (opt-out)**; the **per-request toggle defaults OFF**. Injection only happens when the per-request toggle is on, so default behavior is unchanged → no regression. Realtime + Proxy agents opt the capability OFF (see D14/D15). | Locked (revised) |
| D6 | Project memory inheritance = **broad** (project notes + global); `projectId` fixed per conversation. | Locked |
| D7 | Incognito = `Conversation.IsTemporary`; persisted-but-hidden; skip memory read+write. | Locked |
| D8 | Group chat: Phase 1 = metadata + mockups; Phase 2 = runtime code. | Locked |
| D9 | Routines: **dedicated app** + reusable **`ng-user-routines`** widget, also embeddable in ng-conversations. | Locked |
| D10 | **Skill authoring** = Entity CRUD on `MJ: AI Skills` + an RLS "own skills" filter (`CreatedByUserID = current user`) → open to self by default. **Skill sharing** = `MJ: Resource Permissions` (ResourceType `AI Skills`, View/Edit/Owner) via the existing `ResourcePermissionProvider`, with the **share action gated by a dedicated "Can Share Skills" privilege**. No bespoke permission tables. | ~~Locked~~ **Superseded at ship time**: skills got a dedicated `MJ: AI Skill Permissions` table with full agent-parity (two access paths over one table); the `AI Skills` Resource-Type sharing was retired. `Can Share Skills` authorization retained as planned. See the Skills & Plan Mode guide. |
| D11 | Public artifact sharing: the **link/session mechanism reuses Magic Links** (server mints a read-only, artifact-scoped RS256 link on publish), but **who may publish is gated by a dedicated lightweight privilege "Can Publish Artifacts Publicly"** — NOT the heavyweight magic-link *issuer* role (which creates external users + assigns roles, far higher risk). UI hides/disables publish when absent. | Locked (revised) |
| D12 | **Concurrency (parallel agent turns) → Phase 2.** Phase 1 ships the **design only** (P1.0.3); chat stays serialized. | Locked (revised) |
| D13 | Routines entity name = **`MJ: User Routines`** (generalizes beyond chat). | Locked |
| D14 | **Realtime agents** run a separate session-driven path: **plan mode is skipped** (HITL via the delegated target's `AwaitingFeedback`, narrated live); **skills append at session build**; **memory uses the shared builder**; **not valid routine targets**; concurrency already handled by the **turn-moderator**. | Locked (from realtime study) |
| D15 | **Proxy agents (Skip-style)** delegate their whole loop to the remote system: plan mode / skills / local memory injection are **OFF locally**; instead MJ passes a rich **context bag** (incl. project-scoped notes) for the remote to use. Betty is a `BaseLLM` used inside loop agents, so local features apply around it. | Locked (from proxy study) |
| D16 | Standardized proxy: **design in Phase 1, implement in Phase 2.** `BaseRemoteProxyAgent` + "Remote Proxy" agent type + a standard context contract; the **Skip API is the template** for how the remote side is invoked generically. | Locked |
| D17 | **Project memory scope = first-class `ProjectID` columns** on `AIAgentNote` / `AIAgentExample` / **`AIAgentRun`** (FK→`MJ: Projects`) — NOT a `SecondaryScopes` JSON dimension, despite the generalized Primary/Secondary scoping that shipped after this plan was written. Rationale: FK integrity on project delete/reparent, indexed memory-panel queries, and consolidation partitioning all want a hard column; the run-level stamp freezes provenance even if a conversation later moves folders. | Proposed (P1.6 study 2026-07-06) |
| D18 | **Server derives `projectId`/`temporary` from the Conversation row** in the conversation-run path — incognito and project scope are enforced server-side, never trusted from the client. `ExecuteAgentParams.projectId?`/`temporary?` remain directly settable for non-conversation callers. | Proposed (P1.6 study 2026-07-06) |
| D19 | **Skip context-bag notes defer to P1.9**: `skip-sdk.ts buildAgentNotes()` is an unimplemented stub today (returns `[]` — the plan's "Skip already passes notes" was contract-only), so wiring project-scoped notes into the bag is greenfield that belongs with the standardized-proxy build. P1.6's proxy test drops accordingly. | Proposed (P1.6 study 2026-07-06) |
| D20 | **Incognito is a creation-time choice**, not a per-send toggle: `IsTemporary` is stamped once at the lazy first-send mint (new-chat empty-state toggle that locks after creation, plus a persistent in-chat banner) — deliberately unlike plan mode's sticky per-user preference. | Proposed (P1.6 study 2026-07-06) |

---

## 1. System map

```mermaid
flowchart TB
  subgraph UI["Layer 3/4 — Angular widgets + apps"]
    CHAT["ng-conversations"]
    ROUTINESAPP["Routines app"]
    ROUTINESW["ng-user-routines (reusable)"]
    SKILLSUI["Skills authoring UI"]
    ARTUI["artifacts (edit/share/remix)"]
  end
  subgraph RT["Layer 2 — conversations-runtime"]
    USAGE["usage rollup"]
    QUOTE["quote/fork helpers"]
    CONC["concurrency coordinator (design-only, P2)"]
  end
  subgraph ENG["Engines / AI"]
    AGENT["ai-agents (loop + plan mode + skills + memory)"]
    RTIME["realtime path (session-driven, turn-moderator)"]
    PROXY["proxy agents (Skip) → remote loop"]
    SKILLENG["Skills engine"]
    SCHED["Scheduling + UserRoutineDispatcherDriver"]
  end
  subgraph DATA["Layer 1 — entities + permissions"]
    ENT["MJ entities (consolidated migration)"]
    PERM["Unified permissions / Magic Links"]
  end
  ROUTINESAPP --> ROUTINESW
  CHAT --> ROUTINESW
  CHAT --> RT
  CHAT --> AGENT
  AGENT --> RTIME
  AGENT --> PROXY
  AGENT --> SKILLENG
  SCHED --> AGENT
  ARTUI --> PERM
  ENG --> DATA
  RT --> DATA
```

## 1b. Feature behavior by agent type (CRITICAL — drives implementation guards)

| Feature | Loop / Flow | Realtime (session-driven) | Proxy (Skip-style) |
|---|---|---|---|
| **Plan mode** | Capability ON by default; injected only when per-request toggle on | **Skipped** — would break live voice; HITL is the delegated target's `AwaitingFeedback`, narrated | **Delegated** to remote; local OFF |
| **Skills** | Activated in-loop (`Skill` run-step) | **Appended at session build** (static for the session) | **Delegated** to remote (optionally passed in context bag, future); local OFF |
| **Memory inject** | Per-iteration via `AgentMemoryContextBuilder` | **Once at session start** (same builder) | MJ **gathers notes (project-scoped) and passes them** in the context bag; local injector not used *(context-bag note passing deferred to P1.9 — D19: `buildAgentNotes` is a stub today)* |
| **Routine target** | ✅ Yes | ❌ No (interactive/live) | ✅ Yes (single-step) |
| **Concurrency** | Phase 2 coordinator | **Already solved** via turn-moderator | N/A (single step) |

Implementation guards: gate plan-mode prompt injection behind `!isSessionDrivenAgentType() && !isProxyAgent`; gate local memory injection / skill catalog off for proxy agents; resolve skills at `buildRealtimeSessionParams()` for realtime.

---

## P1.0 — Foundations gate (mockups + consolidated migration + cross-cutting design)

### P1.0.1 — UX Mockups (USER-REVIEWED GATE) 🚦

**Deliverable:** mockups in `plans/conversations-phase1/mockups/` (browse via `plans/conversations-phase1/index.html`) for: context gauge; plan-mode pill toggle + plan-approval card; skills authoring + activation indicator; routines app (list/create/edit/history) + friendly cron builder + notification config + "turn into a routine" chat entry; project-scoped memory panel + temporary-chat toggle; artifact inline edit + magic-link share + remix; quote/shortcuts/TOC/fork; group-chat roster/invite/attribution/typing/concurrent-agent indicators; (P1.9) remote-proxy agent config. **Gate:** feature UI blocked until its mockup is approved. **Risk:** Low.

### P1.0.2 — DB Design → ONE Consolidated Migration

> **⚠️ Status (2026-07-06): the consolidated mega migration in this PR is now fully historical —
> design reference only; do NOT apply it.** P1.3/P1.4 schema shipped in #2996's migrations
> (`V202606301200`, `V202607020811`), P1.5's in #3035's (`V202607022102`), and **P1.6 ships its
> own minimal migration** (see revised §P1.6 — which also adds `AIAgentRun.ProjectID` beyond the
> table below). The remaining unshipped pieces (`ConversationParticipant`, `Conversation.IsGroup`)
> ship with P1.8 in its own migration. The one-mega-migration gate served its purpose while the
> phase was monolithic; the carve-out-per-sub-phase reality supersedes it.

```mermaid
erDiagram
  Project ||--o{ Conversation : "ProjectID (folder)"
  Conversation ||--o{ ConversationDetail : has
  Conversation ||--o{ ConversationParticipant : "P1.8 (metadata only)"
  User ||--o{ UserRoutine : owns
  UserRoutine ||--o{ UserRoutineRecipient : notifies
  UserRoutine ||--o{ UserRoutineRun : history
  AIAgent ||--o{ AIAgentSkill : "Limited acceptance"
  AISkill ||--o{ AIAgentSkill : "assigned to"
  AISkill ||--o{ AISkillAction : bundles
  AISkill ||--o{ AISkillSubAgent : bundles
  AIAgentNote }o--|| Project : "ProjectID (new)"
  AIAgentExample }o--|| Project : "ProjectID (new)"
```

**New entities:** `MJ: User Routines`, `MJ: User Routine Recipients`, `MJ: User Routine Runs`, `MJ: AI Skills`, `MJ: AI Skill Actions`, `MJ: AI Skill Sub Agents`, `MJ: AI Agent Skills`, `MJ: Conversation Participants` (metadata only). Field lists per the prior revision (unchanged) — see §P1.5 / §P1.4 / §P1.8.

**Altered tables (consolidated ALTER each):**
| Table | Add |
|---|---|
| `AIAgent` | `SupportsPlanMode BIT NOT NULL DEFAULT 1` (opt-out; seed Realtime + Proxy agents to 0), `AcceptsSkills NVARCHAR(20) NOT NULL DEFAULT 'None'` |
| `AIAgentRunStep` | extend `StepType` with `Plan` **and** `Skill` (one constraint edit) |
| `AIAgentNote`, `AIAgentExample` | `ProjectID UNIQUEIDENTIFIER NULL` (FK→`MJ: Projects`) |
| `Conversation` | `IsTemporary BIT NOT NULL DEFAULT 0`, `IsGroup BIT NOT NULL DEFAULT 0` |

**Permissions (unified, seeded via metadata — no bespoke tables):** register an `AI Skills` **Resource Type**; Entity Permissions + an RLS "own skills" filter for `MJ: AI Skills`; a dedicated **"Can Share Skills"** privilege; a dedicated **"Can Publish Artifacts Publicly"** privilege. **Seed** `SupportsPlanMode=0` for existing Realtime + Proxy (Skip) agents.
**Acceptance:** one migration; CodeGen green; strong types generate. **Risk:** Med (size — follow rules exactly).

### P1.0.3 — Concurrency model (DESIGN ONLY in Phase 1) — D12

```mermaid
flowchart LR
  subgraph TODAY["Phase 1 — serialized (unchanged)"]
    U1[User msg] --> A1[Agent turn] --> D1[done] --> U2[next allowed]
  end
  subgraph P2["Phase 2 — concurrent turns"]
    UH["User msg @A @B"] --> PA[Agent A]
    UH --> PB[Agent B]
    PA --> M[merge thread]
    PB --> M
  end
```

**Deliverable:** an ADR for a `conversations-runtime` concurrency coordinator (N in-flight turns/conversation, non-blocking dispatch, multi-"working…" indicators, interleaved-stream ordering, limits, cancellation). **Learn from realtime's `realtime-turn-moderator.ts`** which already serializes the *speaking floor* across multiple agents in a room. **No Phase 1 implementation.** **Risk:** design-only.

### P1.0.4 — Shared primitives
Standardize the **notification delivery path** (in-app + `CommunicationEngine` email) for Routines (reusable later), and a reusable **friendly cron-picker** component.

---

## P1.1 — Context & Cost Gauge
Opt-in per-conversation tokens/window-%/cost. **P1.1.1** runtime `computeConversationUsage()` (pure, tested) from peripheral agent-run data + model context limit via `AIEngineBase`. **P1.1.2** `mj-conversation-context-gauge` (header slot, tokens). **P1.1.3** `@Input() ShowContextGauge=false` + `UserInfoEngine` pref `mj.conversations.contextGauge.v1`. **Risk:** Low.

## P1.2 — UX polish
**P1.2.1** quote/multi-quote (selection→composer, back-ref + accumulator). **P1.2.2** `ConversationKeyboardService` + `?` cheat-sheet (host-focus-scoped). **P1.2.3** long-thread TOC. **P1.2.4** `forkConversation(detailId)` (clone to a point; inherits ProjectID). **Risk:** Med (scope/clone).

---

## P1.3 — Plan Mode

> **➡️ Carved out — now building in PR [#2996](https://github.com/MemberJunction/MJ/pull/2996)** (branch `agent-skills-plan-mode`), bundled with P1.4 Skills. Schema for this sub-phase ships in that PR's migration, not the mega migration above.

Capability **ON by default** (opt-out for Realtime/Proxy), **per-request toggle OFF by default** (set on the agent **pill**/composer). Reuses `AIAgentRequest`. **Single-agent in Phase 1** (concurrent planning deferred with concurrency to Phase 2).

```mermaid
sequenceDiagram
  actor U as User
  participant C as Composer (plan toggle in pill)
  participant L as Loop Agent
  participant R as AIAgentRequest
  U->>C: message @Agent (plan ON for this send)
  C->>L: run (planMode=true)
  L-->>R: persist Plan request (plan + approve/edit/reject)
  L-->>U: render plan card (Plan run-step)
  U->>R: approve / edit / reject
  alt approved/edited
    R->>L: resume with (edited) plan
    L-->>U: execute + stream
  else rejected
    L-->>U: abort cleanly
  end
```

| Task | Detail |
|---|---|
| **P1.3.1** (schema P1.0.2) | `AIAgent.SupportsPlanMode` (default 1; Realtime/Proxy seeded 0); `Plan` run-step. |
| **P1.3.2** Loop prompt | Conditional "Plan Mode" block in the core Loop system prompt; injected only when `SupportsPlanMode && per-request planMode && !isSessionDrivenAgentType() && !isProxyAgent`. |
| **P1.3.3** Loop handling | `LoopAgentType.DetermineNextStep` recognizes `plan` → `Plan` step; `executePlanStep()` persists `AIAgentRequest` (approve/edit/reject schema), records run-step, suspends; resume injects (edited) plan. Reuse Chat suspend/resume. |
| **P1.3.4** Runtime toggle | `ExecuteAgentParams.planMode?` threaded per-request from the conversation runner. |
| **P1.3.5** UI | Plan toggle in the agent **pill**/composer (shown only when agent `SupportsPlanMode`); editable plan-approval card via the response-form path. |
| **Tests** | suspend+resume; approval injects edited plan; realtime/proxy never inject plan prompt. **Risk:** Med. |

---

## P1.4 — Skills (capability bundles)

> **➡️ Carved out — now building in PR [#2996](https://github.com/MemberJunction/MJ/pull/2996)** (branch `agent-skills-plan-mode`). Framed as a `BaseAgent` / `@memberjunction/ai-agents` feature (works for any agent invocation, not just the chat widget). Schema ships in that PR's migration. Carve-out refinements: Min/Max execution columns dropped; `AISkill.Status` defaults `Active`; composition junctions are status-less; `SKILL.md` portable import/export promoted from stretch into scope.

Bundles of (instructions + optional Actions + optional sub-agents) **appended** to the system prompt on activation; new `Skill` run-step; unified-permission governance.

```mermaid
flowchart TB
  AGENT["AIAgent.AcceptsSkills = None | All | Limited"]
  AGENT -- Limited --> J["MJ: AI Agent Skills"]
  J --> SKILL["MJ: AI Skill (Instructions + Actions + Sub-Agents + Status)"]
  AGENT -- All --> SKILL
  RUN["Agent run"] -->|catalog: name+description only| CAT[progressive disclosure]
  RUN -->|"step: skill"| ACT["executeSkillStep(): append Instructions + enable Actions/Sub-Agents"]
  ACT --> STEP["AIAgentRunStep (Skill)"]
```

| Task | Detail |
|---|---|
| **P1.4.1** (schema P1.0.2) | Skills + 3 junctions; `AcceptsSkills`; `Skill` run-step; Skills resource type in unified perms. |
| **P1.4.2** Skills engine | `BaseEngine` caching Active skills + agent-skill map (reactive); resolves available skills per agent. |
| **P1.4.3** Prompt exposure | Inject **catalog (name+description only)** for accepted skills in `gatherPromptTemplateData()`. **For Realtime:** resolve + append skill instructions at `buildRealtimeSessionParams()` (session-static). **For Proxy:** skip local skill catalog (delegated). |
| **P1.4.4** Activation | `step:'skill'` → `executeSkillStep()`: validate acceptance; append `Instructions`; add Actions+sub-agents to run tool-surface; honor min/max executions; record `Skill` run-step. Not a nested agent run. **Risk:** Med. |
| **P1.4.5** Governance | `AcceptsSkills` + junction `Status` + `Skill.Status`. **Authoring:** Entity CRUD on `MJ: AI Skills` + RLS "own skills" (open to self). **Sharing:** `MJ: Resource Permissions` (ResourceType `AI Skills`, View/Edit/Owner) via `ResourcePermissionProvider`, share action gated by the dedicated **"Can Share Skills"** privilege. |
| **P1.4.6** Authoring UI | Skill create/edit (instructions + pick Actions + sub-agents + status); agent form `AcceptsSkills` control + Limited picker; share dialog (permission-gated). |
| **P1.4.7** (stretch) | `SKILL.md` import/export for portability. |
| **Tests** | resolution (All/Limited); activation appends + enables tools; governance; realtime append; proxy skip. |

---

## P1.5 — User Routines (`MJ: User Routines`)

Dedicated **Routines app** + reusable **`ng-user-routines`** widget; single **dispatcher** job. **Routine targets exclude Realtime agents** (interactive); single-step **Proxy agents are valid targets**.

```mermaid
flowchart TB
  CRON["One admin job: 'User Routine Dispatcher' (~1 min)"] --> DRV[UserRoutineDispatcherDriver]
  DRV --> Q{Active routines NextRunAt <= now}
  Q -->|bounded concurrency| CLAIM[claim] --> RUN["run via AgentRunner / ActionEngine / AIPromptRunner"]
  RUN --> REC["write User Routine Run (status/tokens/cost/summary/hash)"]
  REC --> NEXT["NextRunAt = CronExpressionHelper.GetNextRunTime"]
  REC --> COND{NotifyCondition met? OnChange: hash != LastResultHash}
  COND -->|yes| NOTIFY["in-app + email → owner + Recipients"]
  COND -->|no| SKIP[none]
```

**Entities:** `MJ: User Routines` (UserID owner, Name, Description, Status, RoutineType Scheduled/Monitoring, TargetType Agent/Action/Prompt, TargetID, InitialMessage, StartingPayload, CronExpression, Timezone, NextRunAt, LastRunAt, LastRunStatus, LastResultHash, NotifyCondition Always/OnSuccess/OnFailure/OnChange, NotifyViaInApp, NotifyViaEmail); `MJ: User Routine Recipients` (RoutineID, UserID?/Email?, Channel); `MJ: User Routine Runs` (RoutineID, timing, Status, AgentRunID?, Tokens/Cost, ResultSummary, ResultHash, NotificationSent, ErrorMessage?). Row-level owner access.

| Task | Detail |
|---|---|
| **P1.5.1** (schema P1.0.2) | the three entities; owner RLS. |
| **P1.5.2** Dispatcher | seed one admin job; `UserRoutineDispatcherDriver`; bounded concurrency + per-routine isolation + heartbeat; OnChange via hash; **target picker excludes Realtime agent types**. **Risk:** Med (long routines within lease → v1 bounds concurrency). |
| **P1.5.3** `ng-user-routines` | new reusable package: list/create/edit (target picker + cron-picker + notification config) + run-now + history. |
| **P1.5.4** Routines app | dedicated Explorer dashboard hosting the widget (chrome + `NotifyLoadComplete`). |
| **P1.5.5** Conversation entry | "Turn this into a routine" → prefilled create (Agent + InitialMessage). |
| **P1.5.6** Notifications | shared path (P1.0.4): in-app + email per condition/recipients. |
| **Tests** | cron due-eval; OnChange hash; dispatcher isolation; notification firing; realtime excluded from picker. |

---

## P1.6 — Project-scoped Memory + Incognito

> **🔎 Revised 2026-07-06 after a pre-build code study of `next`** (post-Skills/Plan-Mode
> #2996/#3009/#3013–#3017 and Routines #3035). Intent unchanged (D1/D6/D7); the task details below
> are corrected to the as-built codebase, and proposed decisions **D17–D20** were added to §0.3.
> Builds in its **own branch/worktree with its own minimal migration** (see the P1.0.2 status
> note). Key drift the study found vs. the original tasks:
>
> - `Conversation.ProjectID` **already exists**, and P1.5's `ApplicationScope` list-hiding provides
>   the exact pattern `IsTemporary` parallels (one WHERE predicate in the conversations engine's
>   `LoadConversations` + two cache guards + a `CreateConversationOptions` flag) — the hiding half
>   of incognito is now cheap.
> - The note-scoping lattice moved **in-memory**: the SQL `buildNotesScopingFilter` this section
>   originally targeted is **uncalled dead code** — retrieval filters the AIEngine cache via
>   `filterNotesByScoping` (and `AGENT_MEMORY_SCOPING.md` is stale on the same point: wrong line
>   refs + "builds SQL filters" framing).
> - **"Never merges across projects" is not inherited:** Memory Manager consolidation cohorts only
>   by Agent/User/Company and can **already** merge notes that differ in
>   `PrimaryScopeRecordID`/`SecondaryScopes` (contradicting the scoping doc's "within a scope
>   cohort by construction" claim) — project isolation, and the full-scope-tuple fix, must be added
>   explicitly.
> - "Skip already passes `notes`" was **contract-only** — `skip-sdk.ts buildAgentNotes()` is a TODO
>   stub returning `[]`; wiring it is greenfield and moves to P1.9 (D19).
> - Realtime shares `AgentMemoryContextBuilder` but its `assembleMemoryContext` passes only
>   user/company today — projectId needs one explicit threading edit (nearly free, not free).
> - Since this plan was written, notes/examples/runs gained generalized
>   `PrimaryScope*`/`SecondaryScopes` scoping; D17 records why project is a first-class column
>   anyway.

Keys off `Conversation.ProjectID` (folders==projects — the column already exists). Shared
injector; project scope reaches Realtime with one threading edit; **Proxy/Skip note-passing is
deferred to P1.9** (D19).

```mermaid
flowchart LR
  CONV["Conversation (ProjectID, IsTemporary)"] --> PARAMS["ExecuteAgentParams.projectId + temporary (server-derived, D18)"]
  PARAMS --> INJ["AgentContextInjector (in-memory lattice)"]
  INJ --> LAT{scope match}
  LAT --> A["Agent/User/Company (8-level)"]
  LAT --> P["+ Project: ProjectID = X OR NULL (broad, D6)"]
  PARAMS --> T{temporary?}
  T -->|yes| SKIP[skip read + skip write]
  T -->|no| OK["inject + writes stamped ProjectID"]
```

| Task | Detail |
|---|---|
| **P1.6.1** Schema (own migration) | `ProjectID UNIQUEIDENTIFIER NULL` (FK→`MJ: Projects`) on `AIAgentNote`, `AIAgentExample`, **and `AIAgentRun`** (run-level provenance stamp — D17); `Conversation.IsTemporary BIT NOT NULL DEFAULT 0`. (`IsGroup`/`ConversationParticipant` stay with P1.8.) One consolidated ALTER per table + `sp_addextendedproperty`; CodeGen before any dependent TS. |
| **P1.6.2** Scope lattice (in-memory) | `projectId?` on `GetNotesParams`/`GetExamplesParams`; 4th **broad** cascade (`ProjectID = X OR NULL`, D6) in `filterNotesByScoping` + `filterExamplesByScoping`; same dimension in `buildScopePreFilter` **and** `AIEngine.composeNoteFilters`/`FindSimilarAgentNotes` so the semantic path agrees with the cache path. Delete the dead SQL `buildNotesScopingFilter` + helpers and fix stale `AGENT_MEMORY_SCOPING.md` in the same task. **Risk:** Med (cache path + vector path must agree). |
| **P1.6.3** Write scope | `MemoryWriteManager`: `projectId` on `MemoryWriteContext`/`MemoryWriteScope`; clamp in `clampScope`, stamp in `persistNewNote`, and partition the near-dup vector check (`queryVectorService`) by project so dedup never collides across projects. **Temporary write-gate:** skip `ExecuteWrite` when the run's conversation is temporary. |
| **P1.6.4** Thread projectId | Server derives `Conversation.ProjectID`/`IsTemporary` in the conversation-run path (D18) → `ExecuteAgentParams.projectId?`/`temporary?` → `initializeAgentRun()` stamps `AIAgentRun.ProjectID` (alongside the existing UserID/CompanyID/Primary/Secondary stamping). Memory Manager: extraction copies `ProjectID` from the source run (extend `SOURCE_RUN_SCOPE_FIELDS`); temporary-conversation runs are **excluded from extraction** (memory-inert end to end); **consolidation partitions clusters by project — and by the full scope tuple** (`findConsolidationClusters` + `composeNoteFilters` + `createConsolidatedNote`), which also fixes the pre-existing cross-scope merge hazard. Realtime: thread `projectId` through `assembleMemoryContext`. |
| **P1.6.5** Incognito | Parallel #3035's `ApplicationScope` hiding: `IsTemporary=0` predicate in `LoadConversations`' filter + the two cache guards (`CreateConversation` prepend-skip, `EnsureConversationLoaded`) + `CreateConversationOptions.isTemporary` stamped at the lazy first-send mint. UI per D20: new-chat empty-state toggle (locks once minted) + persistent in-chat banner; composer button mirrors the plan-mode contract in `ng-composer` (`message-input-box` → `ai-composer` pass-through → `message-input` wiring). ⚠️ Those composer files are also touched by the in-flight omnibar branch — land this slice after it merges or expect a rebase. |
| **P1.6.6** (opt) Memory panel | User-visible memory panel scoped by project — mockup pick pending (P1.0.1 gate: "What I remember" side panel / inline memory moments / memory-manager dashboard). Can follow P1.6 core as its own slice. |
| **Tests** | 4-dimension lattice: project note injects only in-project + global, on **both** the cache and vector paths; write clamp/stamp + near-dup project partition; consolidation never crosses project/scope tuple; temporary skips read+write **including Memory Manager extraction**; temporary hidden from list + cache; deterministic integration-suite additions per repo rule. ~~Skip context bag carries project notes~~ → moved to P1.9 (D19). |

---

## P1.7 — Artifact edit + share (Magic Links) + remix

| Task | Detail |
|---|---|
| **P1.7.1** Editable viewer | text/code/markdown artifacts editable; user edit → **new `MJ: Artifact Versions` row**; agent stays collaborator. **Risk:** Med. |
| **P1.7.2** Public share (Magic Links mechanism + dedicated privilege) | Link/session **mechanism reuses Magic Links** (`guides/MAGIC_LINK_GUIDE.md`): on publish, the **server** mints a read-only, single-artifact-scoped RS256 link (restricted role scoped to that artifact's read). **Who may publish** is gated by a **dedicated lightweight privilege "Can Publish Artifacts Publicly"** — NOT the magic-link issuer role. UI **hides/disables** publish when the user lacks it (no dead-end). **Risk:** Med (scope the restricted role to single-artifact read). |
| **P1.7.3** Remix | clone artifact + latest version into a new user-owned artifact in a new conversation; original untouched. |
| **P1.7.4** (spike) | component→agent `callAgent()` RPC (artifacts-as-apps). Writeup only. |
| **Tests** | edit→new version; magic-link read-only scope; privilege gate hides action; remix non-mutating. |

---

## P1.8 — Group Chat: metadata + UX mockups (Phase 2 prep)

**No runtime behavior this phase.** Primary driver of Phase 2 concurrency.

| Task | Detail |
|---|---|
| **P1.8.1** (schema P1.0.2) | `MJ: Conversation Participants` (ConversationID, UserID, Role Owner/Member/Guest, Status Invited/Active/Removed, InvitedByUserID, InvitedAt, JoinedAt, NotificationPreference); `Conversation.IsGroup`. Generated, not wired. |
| **P1.8.2** Backfill semantics | existing single-owner → owner sole participant (lazy/backfill). No enforcement yet. |
| **P1.8.3** UX mockups | (in P1.0.1) roster, invite/accept/remove, multi-user attribution, typing/presence, **concurrent-agent** indicators. |
| **P1.8.4** Phase 2 spec | participant engine; PubSub broadcast on `conversation:{id}` (message+typing+presence); the **concurrency coordinator** (P1.0.3) borrowing from the realtime turn-moderator; relax owner-only checks → participant-with-permission; members modal wired; invites. (~3–4 weeks.) |

---

## P1.9 — Standardized Agent Proxy (design Phase 1, build Phase 2)

**Problem:** Skip (`BaseAgent` subclass, single-step, rich context bag) and Betty (`BaseLLM`) are **bespoke**; no shared abstraction. As MJ↔MJ/SaaS proxying grows, we want a richer-than-MCP, MJ-aware standard.

```mermaid
flowchart TB
  A["RemoteProxyAgent (extends BaseAgent, single-step)"] --> REQ["RemoteProxyRequest contract<br/>messages + conversationId + contextBag(entities,queries,notes[project-scoped],artifacts,org,user) + callback auth"]
  REQ --> RO["transport via Remote Operations"]
  RO --> REMOTE["Remote MJ/SaaS system (owns its own loop, planning, skills, memory)"]
  REMOTE --> MAP["map response → BaseAgentNextStep (analysis / clarifying-question / error)"]
```

| Task | Detail |
|---|---|
| **P1.9.1** Design/ADR | `BaseRemoteProxyAgent` + a "Remote Proxy" **agent type** (metadata) + standard `RemoteProxyRequest` context contract; transport on **Remote Operations** (`guides/REMOTE_OPERATIONS_GUIDE.md`) for unified auth/progress. Define the **context-bag** policy (what MJ sends: entities/queries/project-scoped notes/artifacts/org/user/callback auth). |
| **P1.9.2** Behavior policy | For proxy agents: plan mode / skills / local memory injection **OFF**; instead pass context for the remote to use (D15). Document that Betty stays a `BaseLLM` used inside loop agents (local features apply around it). |
| **P1.9.3** Reference migration (Phase 2) | Migrate **Skip** to `BaseRemoteProxyAgent` as the reference impl in **Phase 2**. Phase 1 ships design + base class + agent-type + contract only. The **Skip API contract is the template** for the generic remote-invocation shape future proxies (and remote MJ systems) implement. |
| **Tests** | proxy agent passes project-scoped notes in context bag; plan/skills not injected locally; response maps to next-step. **Risk:** Med-High (touches a shipping integration). |

---

## 2. Sequencing

```mermaid
flowchart LR
  G0["P1.0 gate<br/>(mockups + consolidated migration + concurrency/proxy/perms design)"] --> G1
  subgraph G1["Feature build (parallelizable)"]
    direction TB
    R[P1.5 Routines]
    PL[P1.3 Plan mode]
    M[P1.6 Project memory]
    S[P1.4 Skills]
    AR[P1.7 Artifacts]
    UX[P1.1 Gauge / P1.2 Polish]
    GC[P1.8 Group-chat metadata]
    PX[P1.9 Proxy design]
  end
  G1 --> DONE["Phase 1 done → Phase 2: group-chat runtime + concurrency + (maybe) Skip proxy migration"]
```

- **P1.0 is the gate.** Recommended leverage order in G1: **Routines + Plan mode** first; then **Project memory + Skills**; then **Artifacts + polish**; **group-chat metadata** + **proxy design** any time.

---

## 3. Cross-sub-phase shared work (do once, in P1.0)

| Item | Where |
|---|---|
| `AIAgentRunStep.StepType` extension (`Plan` + `Skill`) | P1.0.2 (single constraint edit) |
| `ExecuteAgentParams` new fields — `planMode` ✅ + `requestedSkillIDs` ✅ shipped (#2996/#3009); `projectId`/`temporary` remain | P1.3 done; P1.6 next (server-derived per D18) |
| Agent-type guards (`isSessionDrivenAgentType`, `isProxyAgent`) for plan/skills/memory | §1b — applied in P1.3/P1.4/P1.6 |
| Concurrency coordinator (design only) | P1.0.3 → Phase 2 |
| Notification path + cron-picker | P1.0.4 |
| Unified-permission resource types (Skills, public-artifact-share) + Magic-link recipe | P1.0.2 / P1.7 |

---

## 4. Definition of Done (Phase 1)

- **P1.0 gate passed:** mockups approved; consolidated migration applied; CodeGen green; no `.Get()/.Set()` on new fields; Realtime/Proxy agents seeded `SupportsPlanMode=0`.
- All sub-phase acceptance criteria met; Vitest green for touched packages; `npm run check:ui` clean.
- **No behavior change** for existing conversations/agents: plan-mode per-request toggle OFF by default; Skills `None`; no routines; memory project-scope additive; temporary OFF; IsGroup OFF; realtime/proxy correctly excluded from plan-mode injection.
- Concurrency coordinator designed (Phase 2); group-chat schema present + Phase 2 spec written; **no group-chat runtime shipped**.
- Proxy: standard design + base class delivered; Skip migration per D16 scope decision.
- Docs: update `CONVERSATIONS_UX_STACK_GUIDE.md` + package READMEs per shipped feature.

## 5. Sign-off status

All major decisions are now **locked** (see Decision Log §0.3): plan-mode default (D5), public-artifact-share via Magic Links + dedicated privilege (D11), skill permissions (D10), proxy design-Phase-1/build-Phase-2 (D16), concurrency deferred to Phase 2 (D12), routines naming (D13), realtime/proxy behavior (D14/D15).

Residual implementation-time choices (not blocking the plan; settle during P1.0):
- Exact names/placement of the **"Can Share Skills"** and **"Can Publish Artifacts Publicly"** privileges in the unified-permissions seed. *(The "Can Share Skills" half was settled at P1.4 ship time — see D10's supersession note.)*
- Whether the public-artifact magic link is per-share (one link) or regenerable, and its TTL.

**P1.6 pre-build study (2026-07-06)** added proposed decisions **D17–D20** — first-class
`ProjectID` columns incl. `AIAgentRun`, server-derived `projectId`/`temporary`, Skip
context-bag notes deferred to P1.9, and creation-time incognito. These are **pending
ratification at P1.6 build start**, and the memory-panel mockup pick (P1.0.1) remains open.

---

## 6. Phase 2 (deferred) — scope at a glance

Phase 2 is intentionally **not** detailed yet — it gets a full WBS once Phase 1 ships and
we've learned from it. Phase 1 deliberately lays the groundwork (schema in the consolidated
migration; designs in P1.0.3 / P1.8.4 / P1.9) so Phase 2 is **code-only**. The three
deferred workstreams:

| # | Workstream | What ships in Phase 2 | Groundwork already in Phase 1 |
|---|---|---|---|
| **P2.1** | **Group-chat runtime** | Participant engine; PubSub broadcast on a `conversation:{id}` topic (new messages + typing + presence); members modal wired to `MJ: Conversation Participants`; invite/accept/remove flow; relax owner-only action checks → participant-with-permission. | `MJ: Conversation Participants` + `Conversation.IsGroup` schema (P1.0.2); per-user message attribution already exists; UX mockups (P1.8.3). |
| **P2.2** | **Parallel-agent concurrency** | The concurrency coordinator in `conversations-runtime`: N in-flight agent turns per conversation, non-blocking dispatch, multi-"working…" indicators, interleaved-stream ordering, limits + cancellation. Lifts today's single-in-flight serialization for group chat (and optionally concurrent planning). | Coordinator **design/ADR** (P1.0.3), informed by the realtime turn-moderator which already serializes a multi-agent speaking floor. |
| **P2.3** | **Skip proxy migration** | Migrate **Skip** onto `BaseRemoteProxyAgent` as the reference implementation of the standardized proxy. | `BaseRemoteProxyAgent` + "Remote Proxy" agent type + context-bag contract (P1.9, design+base in Phase 1); Skip API is the template. |

**Sequencing:** P2.1 and P2.2 are coupled (group chat is the primary driver of concurrency)
and should ship together. P2.3 is independent and can land whenever capacity allows after
the Phase 1 proxy design is in.

Anything else that surfaces during Phase 1 (e.g., artifacts-as-apps from the P1.7.4 spike,
or a deeper memory-panel build) is a candidate for Phase 2 and will be slotted here when scoped.
