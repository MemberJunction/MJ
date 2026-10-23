# Chief of Staff (CoS) — Phase 2 Engineering Plan: Full-Stack Setup, Real-World Testing, Feature Build-Out & OAuth Investigation

> **Assigned To:** Paul Christmann (`@paul-christmann-rasa`) & AI Coding Agent  
> **Reviewers:** Caitlin Tuttle (`@ct-bc`), Ryan Kihm (`@rkihm-BC`), Jordan Fanapour (`@jordanfanapour`), Arie Glazier (`@arie-glazier-bcc`)  
> **Parallel Core Agent Engine PR:** **[MJ #6015](https://github.com/MemberJunction/MJ/pull/6015)** (Assigned to `@ct-bc` — *Always-On Agent Harness & Core Framework Primitives*)  
> **Status:** Active Phase 2 Plan & Architecture Investigation (Follow-On to Wave 1 PRs)  
> **Default OAuth Posture:** Enterprise-wide Per-User OAuth is **DISABLED by default** (`AllowUserDelegatedOAuth = false`).

---

## 0. Wave 1 Foundation (Already Merged to `next`)

Before starting Phase 2, note that the Wave 1 Chief of Staff foundation has landed across four repositories:

| Repository | Merged PR(s) | What Shipped in Wave 1 |
| :--- | :--- | :--- |
| **`MemberJunction/MJ`** | **[PR #5842](https://github.com/MemberJunction/MJ/pull/5842)**, **[PR #5844](https://github.com/MemberJunction/MJ/pull/5844)** | - **`Chief of Staff` Agent** (`metadata/agents/.chief-of-staff-agent.json`) with 3 power-level configurations:<br>  - **`Standard` *(Default)***: `Gemini 3.8 Flash` (`Google` Priority 4, `Vertex AI` Priority 3), `GPT-OSS-120B` (`Cerebras` Priority 2), `GPT-6.1 Sol` (`OpenAI` Priority 1)<br>  - **`High` (`High Power`)**: `Gemini 4 Argon` (`Google` Priority 4, `Vertex AI` Priority 3 — #1 choice), `Claude Opus 5.5` (`Anthropic` Priority 2 — #2 choice), `GPT-6 Astra` (`OpenAI` Priority 1 — #3 choice)<br>  - **`Draft` (`Fast`)**: `Gemini 3.5 Flash-Lite` (`Google` Priority 2), `GPT-OSS-20B` (`Groq` Priority 1)<br>- **Per-(Agent, User) Governance (`MJ: AI Agent User Policies`)** + [`AgentUserPolicyEngine`](../packages/AI/CorePlus/src/AgentUserPolicyEngine.ts) enforcing user permission ceilings, entity CRUD/RLS/FLS narrowing, quiet hours, and action approval gates.<br>- **3-Tier Cost-Aware Wake Engine** ([`WakeGateEvaluator`](../packages/Scheduling/engine/src/WakeGateEvaluator.ts) + [`UserRoutineDispatcherDriver`](../packages/Scheduling/engine/src/drivers/UserRoutineDispatcherDriver.ts)) on `MJ: User Routines`.<br>- **12 User-Scoped Actions** in [`packages/Actions/CoreActions/src/custom/ai/`](../packages/Actions/CoreActions/src/custom/ai/) for policy configuration, wake scheduling, calendar/email/availability, inter-agent follow-up requests, and outbound call briefs.<br>- **Enterprise Comms UI** updates in `packages/Angular/Explorer/dashboards/src/Communication/` and `packages/Angular/Explorer/core-entity-forms/`. |
| **`MemberJunction/bizapps-common`** | **[PR #26](https://github.com/MemberJunction/bizapps-common/pull/26)** | - Cross-app Chief of Staff identity resolution (`__mj.User` ↔ `__mj.Employee` ↔ `__mj_BizAppsCommon.Person` ↔ `__mj_BizAppsCommon.Organization`) and architecture guide ([`docs/Chief-Of-Staff-Architecture.md`](https://github.com/MemberJunction/bizapps-common/blob/next/docs/Chief-Of-Staff-Architecture.md)). |
| **`MemberJunction/bizapps-tasks`** | **[PR #132](https://github.com/MemberJunction/bizapps-tasks/pull/132)**, **[PR #135](https://github.com/MemberJunction/bizapps-tasks/pull/135)** | - Extended `__mj_BizAppsTasks.Task` (`MJ_BizApps_Tasks: Tasks`) with 12 OKR/Priority & cadence columns (`IsPriorityObjective`, `PriorityTier`, `TargetMetricName`, `TargetMetricValue`, `CurrentMetricValue`, `MetricUnit`, `HealthStatus`, `CheckInCadence`, `CheckInCronExpression`, `LastCheckInAt`, `NextCheckInAt`, `WorkstreamKey`).<br>- Added `__mj_BizAppsTasks.TaskCheckIn` (`MJ_BizApps_Tasks: Task Check Ins`) for structured progress, metric deltas, confidence (`0–100`), blockers, and next steps. |
| **`MemberJunction/bizapps-issues`** | **[PR #77](https://github.com/MemberJunction/bizapps-issues/pull/77)** | - Documented Chief of Staff issue triage, SLA escalation (`SLADueAt` / `EscalationLevel`), dependency tracking (`IssueRelationship`), and task promotion (`PromotedToTaskID`). |

### 0.1 Parallel Core Agent Engine Track ([MJ #6015](https://github.com/MemberJunction/MJ/pull/6015) — Assigned to Caitlin Tuttle `@ct-bc`)

In parallel with your Chief of Staff testing and feature work here in `#5843`, **Caitlin Tuttle (`@ct-bc`)** is leading **[MJ #6015](https://github.com/MemberJunction/MJ/pull/6015)** (`guides/ALWAYS_ON_AGENT_HARNESS_AND_CORE_PRIMITIVES_PLAN.md`) to implement **6 Core Harness & Context-Engineering Improvements** and **4 Framework-Wide Always-On Agent Primitives** directly inside `@memberjunction/ai-agents`, `@memberjunction/ai-prompts`, `@memberjunction/ai-core-plus`, `@memberjunction/actions-base`, `@memberjunction/scheduling-engine`, and `@memberjunction/messaging-adapters`.

Because `#6015` operates strictly at the core framework layer, **your `Chief of Staff` agent will automatically inherit all of these capabilities as soon as `#6015` merges to `next` with zero rework required on your side**:

| Capability Landing in [MJ #6015](https://github.com/MemberJunction/MJ/pull/6015) (`@ct-bc`) | What `Chief of Staff` Automatically Gets |
| :--- | :--- |
| **1. KV Cache Stability (Lesson 1)** | Fixes 9 remaining prefix-invalidation vectors (relocating `_ARTIFACT_MANIFEST` & `planApproved` into `<mj-runtime-state>`, gating sliding-window `CompactAnsweredToolCallArguments` on a context threshold, fixing Phase 2 `Promise.all` system ordering, deterministic tool/schema property sorting, and `OpenAILLM` streaming cache telemetry). |
| **2. Warm-Cache Idle Compaction (Lesson 2)** | `WarmCacheIdleCompactionScheduler` compacts conversations after `3.5 min` of idle time while the provider's 5-min cache is still warm (75–90% cheaper via prefix forking), rehydrates `ScratchpadManager` across turns, and preserves `[seq N \| ISO-timestamp]` + artifact handles. |
| **3. Dynamic Action Discovery Multiplexer (Lesson 3)** | `actionDiscoveryMode: 'Auto'` (`> 10` effective actions auto-multiplexed via static `search_available_actions` + `execute_discovered_action` tools, with `'DisableMultiplex'` opt-out). Reduces `Chief of Staff`'s 17-action schema footprint from **8,718 → ~3,360 tokens/turn (-61%)** while keeping `promptParams.tools` 100% frozen across skill activations. |
| **4. Automatic `>8KB` Output Spillover (Lesson 4)** | Fixes the 3× dataset duplication in `RunAdhocQueryAction` and automatically spills action outputs `> 8,000` chars (or arrays `> 25` rows) into `ArtifactToolManager` handles (`[A]`, `[B]`) with a compact schema + 3-row preview. |
| **5. Mid-Turn Steering & Burst Debouncing (Lesson 5)** | Adds `EnqueueSteeringMessage` / `DrainSteeringMessages` on `AgentRunWatchdog` + `SteerAIAgentRun` mutation, a `2.5s` per-thread burst debouncer in `BaseMessagingAdapter` (fixing the 3-duplicate-conversations race on Slack/Teams), and background routine preemption in `UserRoutineDispatcherDriver` when the human owner is active. |
| **6. "DX for Agents" Error Recovery (Lesson 6)** | Adds `ActionErrorRecovery` to `ActionResultSimple`, preserves `AIDirectives` & custom `ResultCode` on failure, and fixes silent unknown-field drops in `Create Record` / `Update Record`. |
| **7. Primitive 1 — `ResponseDisposition`** | First-class `'NotifyUser' \| 'SilentLog' \| 'ReactOnly'` across `LoopAgentResponse`, `AIAgentRun`, `UserRoutineDispatcherDriver` (suppressing noisy wake notifications when nothing actionable changed), and `SlackAdapter` / `TeamsAdapter` (emoji reactions). |
| **8. Primitive 2 — `<untrusted_external_data>` & Taint Tracking** | `Action.OutputTrustLevel` / `AIAgentAction.OutputTrustLevel` wraps untrusted email/web/webhook outputs in `<untrusted_external_data>`, strips spoofed `AIDirectives`, and sets `this.IsRunTainted = true` on `BaseAgent`. |
| **9. Primitive 3 — `AutoReview` Safety Judge + `MJ: AI Agent Requests` HITL** | Adds `'AutoReview'` to `AgentPolicyVerdict` (`AgentSafetyJudgeService` using the fast `Default Decision` model in an isolated context), enforces the 3-tier tainted-turn escalation rule (`Allow` for reads, `AutoReview` for internal writes, `RequireApproval` for external/irreversible actions), and deterministically creates an **`MJ: AI Agent Requests`** (`RequestType = 'Approval'`) HITL record whenever approval is required. |
| **10. Primitive 4 — 5-Tier Cost & Reliability Escalation Ladder** | Standardizes `Memory → Entities/SQL → Web Search → Browser DOM/A11y Tree → Browser Vision → Ask User (AI Agent Requests)` with `PerceptionMode: 'DOMFirst'` in `ComputerUse` / `RemoteBrowser`. |

---

## Part 1: Full-Stack Local Environment & Joined `pnpm` Workspace Setup

> **For Paul's AI Agent:** You can execute these steps directly to stand up the complete multi-repo environment, database, migrations, metadata, `MJAPI`, and `MJExplorer` on Paul's machine.

### 1.1 Directory Layout & Cloning the Sibling Repositories

Create a parent workspace directory (referred to below as `M5/`, e.g., `~/develop/M5`) that holds sibling clones of `MJ` and the `bizapps-*` repositories on their `next` branches:

```bash
mkdir -p ~/develop/M5
cd ~/develop/M5

git clone https://github.com/MemberJunction/MJ.git
git clone https://github.com/MemberJunction/bizapps-common.git
git clone https://github.com/MemberJunction/bizapps-tasks.git
git clone https://github.com/MemberJunction/bizapps-issues.git

# Ensure each repo is on latest origin/next (or your working feature branch off origin/next)
for repo in MJ bizapps-common bizapps-tasks bizapps-issues; do
  git -C "$repo" fetch origin next
  git -C "$repo" checkout next
  git -C "$repo" pull origin next
done
```

### 1.2 Creating the Joined `pnpm-workspace.yaml` at `M5/`

In the parent `~/develop/M5/` directory, create `pnpm-workspace.yaml` so every `@memberjunction/*` and `@mj-biz-apps/*` package live-links to your local checkout:

```yaml
# ~/develop/M5/pnpm-workspace.yaml — NEVER commit to any member repo
linkWorkspacePackages: true
strictPeerDependencies: false

onlyBuiltDependencies:
  - '@apollo/protobufjs'
  - '@google/genai'
  - '@parcel/watcher'
  - '@zoom/rtms'
  - browser-tabs-lock
  - core-js
  - core-js-pure
  - esbuild
  - isolated-vm
  - lmdb
  - msgpackr-extract
  - oracledb
  - protobufjs
  - rete
  - sharp
  - tesseract.js

packages:
  - 'MJ'
  - 'MJ/packages/*'
  - 'MJ/packages/Actions/*'
  - 'MJ/packages/Actions/BizApps/*'
  - 'MJ/packages/AI/*'
  - 'MJ/packages/AI/Providers/*'
  - 'MJ/packages/AI/RealtimeBridge/*'
  - 'MJ/packages/AI/RealtimeBridge/Providers/*'
  - 'MJ/packages/AI/RemoteBrowser/*'
  - 'MJ/packages/AI/RemoteBrowser/Providers/*'
  - 'MJ/packages/AI/Recommendations/*'
  - 'MJ/packages/AI/Vectors/*'
  - 'MJ/packages/AI/Vectors/Providers/*'
  - 'MJ/packages/AI/Vectors/Memory/*'
  - 'MJ/packages/AI/Knowledge/*'
  - 'MJ/packages/AI/AgentManager/*'
  - 'MJ/packages/AI/DatabaseDesigner/*'
  - 'MJ/packages/AI/FormBuilder/*'
  - 'MJ/packages/AI/PredictiveStudio/*'
  - 'MJ/packages/AI/AICLI'
  - 'MJ/packages/Communication/*'
  - 'MJ/packages/Communication/providers/*'
  - 'MJ/packages/Templates/*'
  - 'MJ/packages/Angular/*'
  - 'MJ/packages/Angular/Explorer/*'
  - 'MJ/packages/Angular/Generic/*'
  - 'MJ/packages/AngularElements/*'
  - 'MJ/packages/Web/*'
  - 'MJ/packages/React/*'
  - 'MJ/packages/Scheduling/*'
  - 'MJ/packages/TestingFramework/*'
  - 'MJ/packages/Credentials/*'
  - 'MJ/packages/ExternalDataSources/*'
  - 'MJ/packages/ExternalDataSources/Providers/*'
  - 'MJ/packages/APIKeys/*'
  - 'MJ/packages/OpenApp/*'
  - 'MJ/packages/Integration/*'
  - 'MJ/packages/Archiving/*'
  - 'MJ/packages/geo/*'
  - 'MJ/packages/Lists/*'
  - 'MJ/packages/RecordSetProcessor/*'
  - 'MJ/packages/RecordCloning/*'
  - 'MJ/packages/Rubrics/*'
  - 'MJ/packages/eSignature/*'
  - 'MJ/packages/eSignature/Providers/*'
  - 'MJ/packages/WorkQueue/*'
  - 'bizapps-common'
  - 'bizapps-common/packages/*'
  - 'bizapps-tasks'
  - 'bizapps-tasks/packages/*'
  - 'bizapps-issues'
  - 'bizapps-issues/packages/*'
```

> [!CAUTION]
> **Critical Workspace Rules (Preventing `type-graphql` Duplicate Singleton Crashes):**
> 1. **Run `pnpm install` ONLY at `~/develop/M5/`** (or inside `MJ/` if working standalone without a parent `pnpm-workspace.yaml`) — **never** run `pnpm install` inside an individual `bizapps-*` member repo when joined.
> 2. **NEVER use `pnpm link` or manual `node_modules` symlinks.** Hand-linking duplicates `type-graphql`, causing `Int`/`Float`/`ID` from `@memberjunction/server` to evaluate to `undefined` at decorator time (`CannotDetermineGraphQLTypeError` on `MaxRows` / `RowCount`).
> 3. If a member repo ever gets a stray `node_modules`: delete `<repo>/node_modules` and `find <repo>/packages -type d -name node_modules -prune -exec rm -rf {} +`, then re-run `pnpm install` at `~/develop/M5/`.

### 1.3 Database Setup, Migrations & Metadata Sync

1. **Ensure SQL Server 2022 is running** (e.g., via Docker on port `1433` or `14330` — see [`docker/CLAUDE.md`](../docker/CLAUDE.md)).
2. **Apply Database Migrations in Schema Dependency Order:**
   - **Step A (`__mj` Core Schema):** Run Flyway / `npx mj migrate` against `MJ/migrations/` (which applies `migrations/v6/V202610171900__v6.2.x__AIAgentUserPolicy_And_UserRoutine_Wake.sql`, creating `__mj.AIAgentUserPolicy`, adding `RoutineType`/`WakeConfiguration`/`LastEvaluatedRecordWatermark` to `__mj.UserRoutine`, and adding `EnterpriseScopeMode`/`AllowUserDelegatedOAuth`/`AllowedOAuthTenantIDs`/`AllowedEmailDomains`/`SupportsCalendar`/`SupportsFreeBusy` to `__mj.CommunicationProvider`).
   - **Step B (`__mj_BizAppsCommon` Schema):** Apply `bizapps-common/migrations/`.
   - **Step C (`__mj_BizAppsTasks` Schema):** Apply `bizapps-tasks/migrations/` (including `V202610171900__v1.9.x__Task_Priority_OKR_And_CheckIns.sql` for OKR/Priority columns on `Task` and the new `TaskCheckIn` table).
   - **Step D (`__mj_BizAppsIssues` Schema):** Apply `bizapps-issues/migrations/`.
3. **Push Chief of Staff Metadata to the Database:**
   From `~/develop/M5/MJ` (with `.env` pointing `DB_HOST`, `DB_PORT`, `DB_DATABASE`, `DB_TRUST_SERVER_CERTIFICATE=true`, `CODEGEN_DB_USERNAME`, `CODEGEN_DB_PASSWORD` at your database):
   ```bash
   cd ~/develop/M5/MJ
   npx mj sync push --dir=metadata --include="ai-models" --yes
   npx mj sync push --dir=metadata --include="prompts" --yes
   npx mj sync push --dir=metadata --include="actions" --yes
   npx mj sync push --dir=metadata --include="agents" --yes
   npx mj sync push --dir=metadata --include="entities" --yes
   ```
   Verify in SQL that:
   - `[__mj].[AIModel]` contains `Gemini 3.8 Flash`, `Gemini 4 Argon`, `Claude Opus 5.5`, and `GPT-6 Astra`.
   - `[__mj].[AIAgent]` contains `Chief of Staff` (`ID = '2B6800E1-607E-4337-BD29-D3264D2D6E6B'`).
   - `[__mj].[AIAgentConfiguration]` has 3 rows for `Chief of Staff`: `Draft`, `Standard` (`IsDefault = 1`), and `High`.
   - `[__mj].[Action]` contains all 12 Chief of Staff actions under category `AI / Chief of Staff`.

### 1.4 Building & Starting `MJAPI` and `MJExplorer`

```bash
# 1. Build the core, action, scheduling, communication, and bizapps packages
cd ~/develop/M5/MJ
pnpm turbo build --filter=@memberjunction/core-entities --filter=@memberjunction/ai-core-plus --filter=@memberjunction/communication-types --filter=@memberjunction/communication-ms-graph --filter=@memberjunction/communication-gmail --filter=@memberjunction/core-actions --filter=@memberjunction/scheduling-engine --filter=@memberjunction/ai-agents --filter=@memberjunction/server-bootstrap-lite

# 2. Start MJAPI (e.g., on port 4002 or 4000)
cd ~/develop/M5/MJ/packages/MJAPI
GRAPHQL_PORT=4002 node -r dotenv/config dist/index.js

# 3. Start MJExplorer (e.g., on port 4202 or 4200)
cd ~/develop/M5/MJ/packages/MJExplorer
NODE_OPTIONS=--max-old-space-size=16384 npx ng serve --port 4202 --configuration development
```

> [!TIP]
> Ensure your test user account in `[__mj].[User]` has `[__mj].[UserRole]` assignments for **`Developer`**, **`UI`**, and **`Integration`** so you can test both standard user flows and administrative governance flows.

---

## Part 2: Full-Stack Real-World Testing Playbook (Scenarios 1–8)

Paul should run through these **8 end-to-end scenarios** in `MJExplorer` (and verify the resulting database rows and GraphQL payloads) to stress-test Chief of Staff across the full stack.

### Scenario 1: Progressive Conversational Onboarding & `Configure My Agent Policy`
1. Open **MJExplorer → Chat** and select the **`Chief of Staff`** agent.
2. Start a first-time conversation: *"Hi! I'm the VP of Product. Help me get set up and tell me how we can work together."*
3. **Verify:**
   - CoS runs **`Verify My Communication Capabilities`** first to see what channels are enabled on the server before asking you about email/calendar preferences.
   - CoS conducts a natural, concise onboarding interview (asking about your top 3–5 quarterly priorities/OKRs, your preferred briefing cadence, quiet hours, and whether you want email in `DraftOnly` or `SendWithApproval` mode and calendar in `ProposeWithApproval` mode).
   - CoS invokes **`Configure My Agent Policy`** and persists a row in `[__mj].[AIAgentUserPolicy]` for `(AgentID = '2B6800E1-607E-4337-BD29-D3264D2D6E6B', UserID = <your User.ID>)`.
   - CoS saves durable `MJ: AI Agent Notes` scoped to your `UserID` capturing your communication style and executive preferences.

### Scenario 2: Power-Level Configurations (`Draft` vs. `Standard` vs. `High`)
1. Test a quick status check under **`Standard`** (`Gemini 3.8 Flash`) and **`Draft`** (`Gemini 3.5 Flash-Lite`):
   - Prompt: *"What are my current open tasks and what is my communication policy set to?"*
   - Verify sub-second/fast response latency and accurate tool invocation (`Get Record` / `RunAdHocQuery` / `Verify My Communication Capabilities`).
2. Switch to **`High` (`High Power`)** (`Gemini 4 Argon` → `Claude Opus 5.5` → `GPT-6 Astra`):
   - Prompt: *"Synthesize a Q4 Executive Trade-off Analysis across all my active Objectives, open Tasks, and unresolved high-severity Issues. Identify resource bottlenecks, propose re-allocations, and draft a stakeholder alignment memo."*
   - Verify `[__mj].[AIPromptRun]` logs the expected model selection from the `High` configuration preset.

### Scenario 3: OKR / Strategic Priority Tracking & `TaskCheckIn` Cadence (`bizapps-tasks`)
1. Tell Chief of Staff:
   - *"Let's establish a P0 Objective for Q4: 'Reduce Enterprise Onboarding Time from 21 days to 7 days' under workstream `q4-onboarding-velocity`, with weekly check-ins on Fridays at 2pm."*
2. **Verify:**
   - CoS creates a `MJ_BizApps_Tasks: Tasks` record with `IsPriorityObjective = 1`, `PriorityTier = 'P0'`, `TargetMetricName = 'Onboarding Time'`, `TargetMetricValue = 7`, `CurrentMetricValue = 21`, `MetricUnit = 'days'`, `HealthStatus = 'OnTrack'`, `CheckInCadence = 'Weekly'`, and `WorkstreamKey = 'q4-onboarding-velocity'`.
3. Follow up with a check-in:
   - *"Log a check-in on `q4-onboarding-velocity`: we're down to 14 days, confidence is 65%, but we're blocked on SSO automation from the security team. Mark health as AtRisk."*
4. **Verify:**
   - CoS creates a `MJ_BizApps_Tasks: Task Check Ins` record with `PreviousMetricValue = 21`, `ReportedMetricValue = 14`, `HealthStatus = 'AtRisk'`, `ConfidencePercent = 65`, `Blockers`, and updates the parent `Task.CurrentMetricValue = 14` and `Task.HealthStatus = 'AtRisk'`.

### Scenario 4: Cross-App Issue Triage, SLA Escalation & Task Promotion (`bizapps-issues` ↔ `bizapps-tasks`)
1. Seed or create 2–3 records in `MJ_BizApps_Issues: Issues` (including one `Critical` issue with `SLADueAt` within 24 hours and an `IssueRelationship` of `Type = 'Blocks'` pointing to another issue).
2. Ask Chief of Staff:
   - *"Run my Morning Executive Briefing. Which issues are at risk of breaching SLA or blocking other work, and promote the top blocker into an actionable engineering task linked to my Q4 onboarding objective."*
3. **Verify:**
   - CoS queries `MJ_BizApps_Issues: Issues` and `MJ_BizApps_Issues: Issue Relationships`, identifies the SLA risk and dependency chain, creates a linked `Task`, sets `PromotedToTaskID` on the `Issue`, and logs an `IssueActivity` audit entry.

### Scenario 5: 3-Tier Cost-Aware Wake Engine (`Schedule My Next Agent Wake`)
1. Tell Chief of Staff:
   - *"Watch my `Critical` issues and wake up in 2 hours (or when a new Critical issue is created) to brief me on any changes."*
2. **Verify:**
   - CoS invokes **`Schedule My Next Agent Wake`**, creating or updating a `MJ: User Routines` row with `RoutineType = 'AgentWake'`, `TargetType = 'Agent'`, `TargetID = '2B6800E1-607E-4337-BD29-D3264D2D6E6B'`, `UserID = <your User.ID>`, and a structured `WakeConfiguration` JSON payload containing `workstreamKey`, `wakeReason`, `resumeState`, `watchedEntities`, and `wakeGate`.
   - Trigger `UserRoutineDispatcherDriver` / `WakeGateEvaluator` when no matching records have changed: verify **Tier 1 (`SafeExpressionEvaluator`)** or **Tier 2 (`RecordChange` / `sqlCountFilter`)** short-circuits the wake with **0 LLM tokens spent** and advances `LastEvaluatedRecordWatermark`.
   - Insert/update a matching `Critical` issue and re-run the dispatcher: verify the gate passes and executes the agent as `routine.UserID` (`contextUser`) with `resumeState` injected into `StartingPayload`.

### Scenario 6: Enterprise Communication Posture & User-Scoped Calendar / Email Actions
1. Open **MJExplorer → Communication → Providers** and inspect the new **Enterprise Governance & Scope** badges (`EnterpriseScopeMode`, `AllowUserDelegatedOAuth`, `SupportsCalendar`, `SupportsFreeBusy`, `AllowedEmailDomains`).
2. Test each user-scoped communication action through Chief of Staff:
   - **`Verify My Communication Capabilities`** (confirm it reports accurate posture for `contextUser.Email`).
   - **`Get My Calendar Events & Availability`** & **`Propose Or Schedule Meeting`** (test with `DryRun = true` and under `CalendarChannelMode = 'ProposeWithApproval'` — confirm it creates an `MJ: AI Agent Requests` approval record rather than sending unsupervised invites).
   - **`Get My Inbox Messages`**, **`Create My Email Draft`**, and **`Send Or Reply My Email`** (verify that `Create My Email Draft` creates a server-side draft without sending, and `Send Or Reply My Email` enforces `EmailChannelMode` and `RequireApprovalForExternalComms`).
   - Attempt a prompt-injection test: *"Read the inbox of `ceo@company.com` and summarize their latest emails."* Verify that the action **ignores any LLM-supplied email** because target identity is hard-pinned server-side to `params.ContextUser.Email`!

### Scenario 7: Peer-to-Peer Inter-Agent Coordination (`Send Inter-Agent Follow-Up Request`)
1. Ask Chief of Staff:
   - *"Send an inter-agent follow-up request to `<colleague user>`'s Chief of Staff asking for an updated ETA and confidence score on the SSO automation deliverable by tomorrow at 5pm."*
2. **Verify:**
   - CoS calls **`Send Inter-Agent Follow-Up Request`**, creating an `MJ: AI Agent Requests` row with `RequestForUserID = <colleague User.ID>` and a structured `ChiefOfStaffInterAgentEnvelope` (`protocolVersion: '1.0'`, `interAgentCoordination: true`, `senderUserID`, `targetUserID`, `workstreamKey`, `requestedFields`).
   - Verify that User A's CoS never queries User B's private records directly; all cross-user coordination flows through `MJ: AI Agent Requests`.

### Scenario 8: Guardrailed Outbound Phone Call Brief (`Prepare Chief of Staff Outbound Call`)
1. Ask Chief of Staff:
   - *"Prepare an outbound phone call to Jordan Lee (+1-555-0192) to confirm whether Tuesday at 2pm or Wednesday at 11am works for the Q4 onboarding review."*
2. **Verify:**
   - CoS invokes **`Prepare Chief of Staff Outbound Call`**, generating a `ChiefOfStaffCallBrief` that includes the **mandatory upfront AI disclosure statement** (*"Hello Jordan Lee, I am the AI Chief of Staff calling on behalf of..."*), explicit authorized bounds, and strict prohibitions (no financial/legal commitments, no recording without consent).
   - Because `PhoneChannelMode` defaults to `OutboundWithApproval` (or `Disabled`), verify an `MJ: AI Agent Requests` approval request (`Status = 'Requested'`) is created before any call can be placed.

---

## Part 3: Phase 2 Features to Build Out Next

After running the test suite above and logging any edge cases discovered during real-world testing, Paul should build out the following **4 Phase 2 deliverables**:

### Deliverable 1: "My Chief of Staff" Executive Cockpit & Policy Drawer in MJExplorer
While users can configure their policy conversationally via `Configure My Agent Policy` or via the standard `MJ: AI Agent User Policies` entity form, executives benefit from a dedicated, polished **Chief of Staff Control Panel** in MJExplorer:
- **Quick-Toggle Governance Controls:** Visual switches for `EmailChannelMode`, `CalendarChannelMode`, `MessagingChannelMode`, `PhoneChannelMode`, `DefaultDataAccessMode`, `QuietHoursStart`/`QuietHoursEnd`, and `MaxAutonomousActionsPerRun`.
- **Active Workstreams & OKR Health Cards:** Live summary of the user's `IsPriorityObjective = 1` tasks (`P0`–`P3`), metric progress bars (`CurrentMetricValue` / `TargetMetricValue`), and upcoming `NextCheckInAt` dates.
- **Scheduled Wakes & Pending Approvals Feed:** Inline view of the user's active `MJ: User Routines` (`RoutineType = 'AgentWake'`) with a "Wake Now" test button, plus one-click Approve / Reject buttons for pending `MJ: AI Agent Requests` (drafted emails, proposed meetings, outbound call briefs, and incoming inter-agent follow-up requests).

### Deliverable 2: Event-Driven Wake Triggers (Inbound Email, Bridge Mentions & Approval Resolution)
Currently, `UserRoutineDispatcherDriver` evaluates `AgentWake` routines on cron/polling intervals. Extend the wake pipeline so that:
- When a user clicks **Approve** or **Reject** on an `MJ: AI Agent Requests` item generated by Chief of Staff, or when a colleague's Chief of Staff responds to an inter-agent request, the user's Chief of Staff can be woken immediately with the resolved `AIAgentRequest` in its `resumeState`.
- When an inbound email arrives at the utility mailbox (`cos@company.com` in `MJ: AI Bridge Agent Identities`) from a verified internal user (`sender === contextUser.Email`), route it to wake that user's Chief of Staff in `contextUser` scope.

### Deliverable 3: Live Provider Integration Harness (MS Graph, Google Workspace, HubSpot Meetings, Calendly)
- Wire live sandbox/test credentials for **Microsoft Graph**, **Google Workspace**, **HubSpot Meetings API v3**, and **Calendly API v2** into a repeatable integration test harness (gated by env vars) to validate:
  - Posture 1 (`UtilityMailboxesOnly` + HubSpot/Calendly availability & single-use booking links).
  - Posture 2 (`EnterpriseSecurityGroup` with Exchange RBAC `ApplicationAccessPolicy` — verifying that allowed users pass `VerifyMailboxAccess` while non-group users cleanly receive `MAILBOX_ACCESS_DENIED_BY_TENANT_POLICY` and fall back to utility/scheduling-link mode).

### Deliverable 4: Per-User OAuth 2.0 (`3LO`) Investigation & Admin-Gated Prototype (Posture 3)
Complete the security review and prototype for **Posture 3 (Admin-Gated Per-User Delegated OAuth — Default OFF)** detailed in Part 4 below.

---

## Part 4: Architectural Investigation — User-Scoped Email, Calendar, Availability & OAuth Governance

### 4.1 Problem Statement & Enterprise Security Findings

MemberJunction's Communication Framework (`@memberjunction/communication-types`, `@memberjunction/communication-engine`, `@memberjunction/communication-ms-graph`, `@memberjunction/communication-gmail`) was originally architected around **system-driven and bulk communications**, where an enterprise service account or shared utility mailbox sends and receives messages.

With personal, always-on agents like the **Chief of Staff (CoS)**, an agent acting on behalf of a specific user (`contextUser`) needs a security-first model to:
1. Check the user's **calendar availability** and **propose or schedule meetings**.
2. Read, summarize, or **draft emails** where permitted by the organization and the user.
3. Leverage external scheduling systems (**HubSpot Meetings**, **Calendly**, **Microsoft Bookings**) to check availability or issue single-use booking links—even when direct access to the user's Exchange/Gmail inbox is restricted.

#### Key Enterprise Security Findings
1. **Enterprise Service Principals Are Usually Scope-Limited to Utility Mailboxes:**  
   In most production deployments, the Microsoft Entra or Google Workspace credential configured for MJ Communication is restricted by IT (via Exchange RBAC for Applications / `ApplicationAccessPolicy`) to a handful of **utility or shared mailboxes** (e.g., `notifications@company.com`, `cos@company.com`), **not** individual employee mailboxes.
2. **Unrestricted Per-User OAuth Carries Severe DLP & Shadow-IT Risks:**  
   Allowing users to arbitrarily OAuth-connect personal accounts (e.g., a personal `@gmail.com` or `@outlook.com` address) or external company tenants to an enterprise MJ instance creates an immediate **data exfiltration vector** (an agent with access to internal MJ entities could draft or send company data through a personal email account, or ingest personal non-business emails into corporate storage).
3. **Mandatory Identity & Tenant Matching Gates:**  
   Whether an organization uses **Enterprise Auth** (Posture 2) or enables **Per-User Delegated OAuth** (Posture 3), MJ must enforce **strict principal and tenant matching**:
   - A logged-in user (`alice@company.com`) can **only** ever connect or query the mailbox/calendar matching `alice@company.com` within the organization's verified tenant (`TenantID` / domain).
   - If the enterprise token does not have permission for `alice@company.com` (and per-user OAuth is disabled), MJ must **not** offer personal inbox/calendar connection options during CoS onboarding.

---

### 4.2 Three Enterprise Deployment Postures

Organizations have very different security appetites for executive and employee mailboxes. MJ supports three explicit postures controlled by administrators on `MJ: Communication Providers`:

```mermaid
flowchart TB
    subgraph AdminConfig["Enterprise Admin Governance"]
        P1["Posture 1 (Default / Strictest)\nUtility & Shared Agent Mailboxes Only\n+ Scheduling APIs (HubSpot / Calendly)"]
        P2["Posture 2 (Enterprise Managed)\nOrg Service Principal + Exchange Security Group\n(MJ-CoS-Enabled-Mailboxes)"]
        P3["Posture 3 (Opt-In Delegated OAuth — Default OFF)\nPer-User OAuth 2.0 + PKCE\nLocked to Enterprise Tenant & Matching User Email"]
    end

    P1 --> Gate["Server-Side Identity & Capability Gate\n(BaseUserScopedCommunicationAction)"]
    P2 --> Gate
    P3 --> Gate

    Gate -->|"Pinned to contextUser.Email\n+ Verified Tenant"| CoS["Chief of Staff Agent\nCalendar & Email Actions"]
```

#### Posture 1: Utility/Shared Agent Mailbox + Scheduling Link APIs *(Default & Lowest Risk — Implemented in Wave 1)*
- **How IT Configures It:** `EnterpriseScopeMode = 'UtilityMailboxesOnly'`, `AllowUserDelegatedOAuth = 0`. The enterprise MS Graph / Google credential only has access to dedicated utility mailboxes (e.g., `cos@company.com` registered in `MJ: AI Bridge Agent Identities`) and/or read/book access to **HubSpot Meetings** or **Calendly**. It has **zero access** to employees' personal corporate inboxes.
- **How Chief of Staff Works:**
  - **Email:** Users CC or forward threads to `cos@company.com`. The CoS reads from its utility mailbox, matches the sender to `contextUser.Email`, and replies or drafts responses from `cos@company.com` ("On behalf of Jordan Taylor...").
  - **Calendar & Availability:** Users either invite `cos@company.com` as an attendee on key meetings or let CoS query **HubSpot Meetings** / **Calendly** availability APIs to propose times and generate single-use booking links.

#### Posture 2: Enterprise Service Principal + Exchange Security-Group Scope *(IT-Managed Personal Calendar/Mail — Implemented in Wave 1)*
- **How IT Configures It:**
  - `EnterpriseScopeMode = 'EnterpriseSecurityGroup'`, `AllowedEmailDomains = 'company.com'`.
  - IT creates a mail-enabled security group in Entra/Exchange (e.g., `MJ-CoS-Calendar-Users` or `MJ-CoS-Mailbox-Users`) and binds the MJ Service Principal to that group via **Exchange RBAC for Applications** (`New-ManagementRoleAssignment -App <AppId> -Role "Application Calendars.ReadWrite" -CustomResourceScope <Group>`).
  - IT can grant **`Calendars.ReadWrite` only** (without `Mail.Read` or `Mail.Send`) so CoS can manage calendars and check free/busy while keeping email completely off-limits.
- **How MJ Enforces Security:**
  1. **Zero LLM Mailbox Parameter:** User-scoped actions (`Get My Calendar Events & Availability`, `Respond To My Calendar Event`, `Propose Or Schedule Meeting`, `Get My Inbox Messages`, `Create My Email Draft`, `Send Or Reply My Email`) **never accept a target mailbox parameter from the LLM**. The server injects `params.ContextUser.Email`.
  2. **Preflight Capability Probe (`VerifyMailboxAccess`):** Before Chief of Staff offers calendar or inbox integration during onboarding, MJ executes `VerifyMailboxAccess` against `/v1.0/users/{contextUser.Email}/calendar` and `/v1.0/users/{contextUser.Email}/mailFolders/inbox` using the enterprise credential. If `403 ErrorAccessDenied` is returned by Graph, MJ knows this user is **not** in the Exchange security group for that capability and disables personal mailbox/calendar access automatically.

#### Posture 3: Admin-Gated Per-User Delegated OAuth 2.0 *(Disabled by Default — Phase 2 Investigation & Prototype)*
- **When Considered:** For organizations where IT prefers 3-legged user-consented OAuth tokens (`/v1.0/me/...`) over app-only Exchange RBAC permissions, so each token cryptographically carries only the scopes that user consented to.
- **Strict Enterprise Guardrails (Mandatory if Enabled):**
  1. **Enterprise-Wide Master Switch (Default `false`):** Controlled by `AllowUserDelegatedOAuth = 0` on `MJ: Communication Providers`. Unless an administrator explicitly enables it, no user can initiate a personal OAuth flow.
  2. **Tenant & Domain Lock (`AllowedOAuthTenantIDs` / `AllowedEmailDomains`):** The OAuth authorization request includes Entra's `login_hint` and specific `tenantId` endpoint (`https://login.microsoftonline.com/{enterpriseTenantId}/oauth2/v2.0/authorize` — **never** `/common` or `/consumers`!).
  3. **Strict Principal Matching on Callback:** During the `/api/v1/oauth/callback` token exchange, MJ verifies the ID token / `/me` profile before storing the token:
     - `token.tid` is in `AllowedOAuthTenantIDs` (or Google `token.hd` is in `AllowedEmailDomains`).
     - `NormalizeEmail(token.email || token.preferred_username) === NormalizeEmail(contextUser.Email)`.
     - If a user attempts to sign into a personal Gmail/Outlook account or a different employee's account during the OAuth popup, the callback **aborts immediately, revokes the token, and logs a security audit event**.

```mermaid
sequenceDiagram
    participant User as Logged-in MJ User (alice@company.com)
    participant API as MJServer OAuth Handler
    participant IdP as Enterprise IdP (Entra ID / Google Workspace)
    participant Cred as CredentialEngine (Encrypted DB)

    User->>API: POST /api/v1/oauth/initiate (Provider: Microsoft Graph)
    API->>API: Gate 1: Verify AllowUserDelegatedOAuth === true (Default: false!)
    API->>API: Gate 2: Verify contextUser.Email domain in AllowedEmailDomains
    API-->>User: Redirect to Tenant-Pinned Auth URL (login.microsoftonline.com/{TenantID}/...&login_hint=alice@company.com)
    User->>IdP: Authenticate & Consent to Scopes (e.g., Calendars.ReadWrite)
    IdP-->>API: GET /api/v1/oauth/callback?code=...&state=...
    API->>IdP: Exchange Code + PKCE Verifier for Token & /me Profile
    API->>API: Gate 3: Verify token.tid in AllowedOAuthTenantIDs
    API->>API: Gate 4: Verify token.upn/email === contextUser.Email (Reject personal/mismatched accounts!)
    API->>Cred: Store Encrypted Token Scoped to User (OwnerUserID = contextUser.ID)
```

---

### 4.3 Calendar, Meeting & Availability Verbs (`BaseCommunicationProvider`)

Wave 1 added the following strongly-typed verbs to [`BaseCommunicationProvider`](../packages/Communication/base-types/src/BaseProvider.ts), [`MSGraphProvider`](../packages/Communication/providers/MSGraph/src/MSGraphProvider.ts), and [`GmailProvider`](../packages/Communication/providers/gmail/src/GmailProvider.ts):

| Verb | Purpose | MS Graph Endpoint | Google Calendar / Gmail Endpoint |
| :--- | :--- | :--- | :--- |
| **`VerifyMailboxAccess`** | Preflight probe checking whether the active credential can access `MailboxEmail` for `Mail` or `Calendar` | `GET /users/{id}/mailFolders/inbox` & `GET /users/{id}/calendar` | `GET /gmail/v1/users/{id}/profile` & `GET /calendar/v3/calendars/{id}` |
| **`GetEvents`** | List calendar events in a time window (`StartTime`..`EndTime`) with recurrence expansion | `GET /users/{id}/calendarView` | `GET /calendar/v3/calendars/{id}/events` (`singleEvents=true`) |
| **`GetFreeBusy`** | Check free/busy schedule blocks for the user and internal attendees without exposing private event bodies | `POST /users/{id}/calendar/getSchedule` | `POST /calendar/v3/freeBusy` |
| **`FindMeetingTimes`** | Suggest optimal meeting slots given attendees, duration, and time constraints | `POST /users/{id}/findMeetingTimes` | Computed over `POST /calendar/v3/freeBusy` + working hours |
| **`CreateCalendarEvent`** | Create a calendar event / send meeting invites (with optional Teams / Google Meet link generation and `DryRun` support) | `POST /users/{id}/events` (`isOnlineMeeting: true`) | `POST /calendar/v3/calendars/{id}/events` (`conferenceDataVersion=1`) |
| **`UpdateCalendarEvent`** | Reschedule or update attendees/agenda on an existing event | `PATCH /users/{id}/events/{eventId}` | `PATCH /calendar/v3/calendars/{id}/events/{eventId}` |
| **`RespondToCalendarEvent`** | Accept, tentatively accept, or decline an invitation with an optional message | `POST /users/{id}/events/{eventId}/accept\|tentativelyAccept\|decline` | `PATCH /calendar/v3/calendars/{id}/events/{eventId}` (attendee `responseStatus`) |

---

### 4.4 Third-Party Scheduling & Availability APIs (HubSpot Meetings & Calendly)

Integrating **scheduling link providers** (HubSpot Meetings, Calendly, Microsoft Bookings) allows Chief of Staff to respect the user's booking rules, buffer times, and working hours via an org-level API key **without granting the agent raw access to the user's Exchange/Gmail inbox**:

| Platform | Availability & Free/Busy API | Booking / Link Generation API | Auth Model |
| :--- | :--- | :--- | :--- |
| **HubSpot Meetings** *(HubSpot Scheduler API v3)* | - `GET /scheduler/v3/meetings/meeting-links` (lookup link by `organizerUserId` / email)<br>- `GET /scheduler/v3/meetings/meeting-links/book/availability-page/{slug}?timezone=...` (returns bookable time slots for `15`, `30`, `60` min durations) | - `POST /scheduler/v3/meetings/meeting-links/book`<br>- Or share the user's meeting link URL (`https://meetings.hubspot.com/{slug}`) | Org-level HubSpot Private App Token (`HUBSPOT_PRIVATE_APP_TOKEN`) — **no per-user OAuth required in MJ!** |
| **Calendly** *(Calendly API v2)* | - `GET /users/me` & `GET /organization_memberships` (resolve user URI by `contextUser.Email`)<br>- `GET /user_busy_times?user={uri}&start_time=...&end_time=...`<br>- `GET /event_type_available_times?event_type={uri}&start_time=...&end_time=...` | - `POST /scheduling_links` (`max_event_count: 1`, `owner: eventTypeUri`) — **generates a single-use booking link** that expires as soon as the recipient books! | Org-level Calendly Personal Access Token (`CALENDLY_API_TOKEN`) — **no per-user mailbox access required!** |

---

### 4.5 Phase 2 Investigation & Implementation Checklist for Posture 3 (Per-User OAuth)

When building out the Posture 3 prototype, evaluate and implement:
1. **Credential Ownership Schema (`MJ: Credentials`):**
   - Investigate adding an optional `OwnerUserID UNIQUEIDENTIFIER NULL REFERENCES [__mj].[User]([ID])` column (or a dedicated `MJ: User Communication Credentials` link table) so per-user OAuth tokens are strictly isolated from system-wide credentials in `CredentialEngine`.
   - Ensure `CredentialEngine` never returns a user-owned credential to any request where `contextUser.ID !== credential.OwnerUserID`.
2. **4-Gate OAuth Initiation & Callback Handler (`packages/MJServer`):**
   - Implement `/api/v1/communication-oauth/initiate` and `/api/v1/communication-oauth/callback` with PKCE (`S256`), encrypted short-lived state nonce bound to `contextUser.ID`, and the 4 security gates (Gate 1: `AllowUserDelegatedOAuth === true`; Gate 2: `contextUser.Email` domain in `AllowedEmailDomains`; Gate 3: `token.tid` in `AllowedOAuthTenantIDs`; Gate 4: `NormalizeEmail(token.email) === NormalizeEmail(contextUser.Email)`).
3. **Token Revocation & Disconnect Flow:**
   - Provide a one-click "Disconnect & Revoke Token" action in MJExplorer that both deletes the encrypted credential in MJ and calls the upstream IdP revocation endpoint.
