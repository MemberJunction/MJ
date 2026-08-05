# Task Graphs as an Agent Primitive — Design Plan

**Status:** Draft for review
**Date:** 2026-08-05
**Origin:** Architecture study of the Sage → Workflow Planner → TaskOrchestrator pipeline (conversation study, session `claude/sage-task-graph-study-4uvtrc`)

---

## 1. Summary

MemberJunction already has a durable, dependency-aware plan-execution substrate — the `MJ: Tasks` / `MJ: Task Dependencies` schema, the `TaskOrchestrator`, a Gantt/checklist UI, PubSub progress streaming, and completion notifications. Today that substrate is reachable only as a UI convenience of one Angular component: the Explorer conversation client detects a `taskGraph` in an agent's payload and drives execution through a single long-lived GraphQL mutation. Every other channel (Slack/Teams, scheduled routines, headless API) silently drops the plan, the agent framework itself has zero knowledge that Tasks exist, and the executor uses a fraction of what its own schema supports.

This plan makes task graphs a first-class capability of the platform:

1. **Execution moves server-side and becomes invocation-agnostic** — submission is split from execution; a durable dispatcher runs graphs regardless of where they came from; clients (all of them) are observers via the existing PubSub plumbing.
2. **`Tasks` becomes a Loop-agent primitive** side-by-side with `ForEach`/`While`/`Sub-Agent` — any Loop agent can emit a durable, dependency-ordered plan mid-run, gated by an agent-level setting that defaults to **on**, with prompt documentation injected/stripped via the existing `AgentTypePromptParams` mechanism.
3. **The Flow traversal engine becomes the one graph executor.** A runtime LLM-emitted graph is converted into an *ephemeral flow* and run by the same engine that runs design-time flows; runtime-vs-design-time is provenance, not architecture. Flow gains parallel DAG execution (it is strictly single-threaded today), and task graphs gain Flow's conditional paths and recovery branches.
4. **Human-in-the-loop is native**: `MJ: AI Agent Requests` is the pause/resume mechanism for approvals, and the Task schema's existing `UserID`-xor-`AgentID` design makes *human tasks* first-class graph nodes that block downstream agent work.

### Decisions (settled in review discussion)

| # | Decision |
|---|----------|
| D1 | Task-graph execution is server-side and works identically regardless of invocation channel (Explorer, messaging, scheduled, headless). The client never drives execution; updates are pushed to it. |
| D2 | Submission (validate + persist) is split from execution (durable dispatcher). Graph rows are an execution substrate, not bookkeeping. |
| D3 | `Tasks` is a new Loop-agent primitive alongside `ForEach`/`While`. A new agent-level setting opts a Loop agent in/out; **default is on**. Prompt instructions for the primitive are included/excluded via `AgentTypePromptParams` (same pattern as `includeForEachDocs`), with response-type auto-alignment stripping the `nextStep` type when disabled. |
| D4 | Capability is **not** granted by attaching the Workflow Planner sub-agent. The planner remains an optional planning *skill* (decomposition quality, `Find Candidate Agents`, confirmation UX); execution rights are a declarative agent property. |
| D5 | `MJ: AI Agent Requests` is the pause/resume mechanism for HITL approval gates (Plan Mode precedent). |
| D6 | The Flow graph executor is the executor that is kept. Dynamic instructions are converted into an **ephemeral flow** and executed by the shared traversal engine. Useful pieces of the current `TaskOrchestrator` (wave computation, transactional persistence, artifact creation, PubSub frames) carry over. |
| D7 | Flow must gain **parallel DAG execution** — verified today it is single-threaded (single `currentStepId` program counter; only `paths[0]` is followed). Frontier-set traversal + join semantics + concurrency cap are added. |
| D8 | Phasing: (1) make the current engine truthful → (2) fix placement (extract + dispatcher + server-side detection) → (3) ship the primitive → (4) converge executors. Plan PR is reviewed before any build. |

---

## 2. Current state (verified against code)

### The pipeline as it exists

1. **Sage's prompt mandates task-graph format for all delegation** — even single-agent handoffs are a one-task graph (`metadata/prompts/templates/sage/sage.template.md:39`, format at `:45-78`). Multi-agent work goes to the **Workflow Planner** sub-agent (`metadata/agents/.sage-agent.json:571-667`; Loop type; sole action `Find Candidate Agents`), which must present the plan and get user approval before emitting the graph (`workflow-planner.template.md:129-169`).
2. **Detection is client-side only.** `packages/Angular/Generic/conversations/src/lib/components/message/message-input.component.ts:1766` (Sage path) and `:2644` (@mention path — any agent) check `result.payload?.taskGraph`. Single-task graphs bypass the task system entirely (`handleSingleTaskExecution`, `:2159` — direct `invokeSubAgent`, no Task rows). Multi-task graphs call the `ExecuteTaskGraph` mutation and **await the entire workflow in one GraphQL request** (`:1953-1993`).
3. **`TaskOrchestrator`** (`packages/MJServer/src/services/TaskOrchestrator.ts`) persists parent + children + dependencies transactionally (`:106-218`), then loops: find `Pending` tasks with all prerequisites `Complete` (`:356`) → execute each **sequentially** via `AgentRunner.RunAgent` (`:325`, comment: "could be parallelized in the future") → create an artifact per task output (`:707`) → completion notification (`:794`). Progress streams over PubSub frames (`resolver: 'TaskOrchestrator'`) routed by `ConversationStreaming.routeTaskProgress` (`packages/ConversationsRuntime/src/streaming/ConversationStreaming.ts:323`).

### Verified gaps

| Gap | Evidence |
|---|---|
| Messaging channels drop graphs | `BaseMessagingAdapter.detectDelegation` handles `invokeAgent` and a **regex over reply text** ("I'll have the {Agent}…"), never `taskGraph`; a test asserts the graph is suppressed from output (`packages/MessagingAdapters/src/__tests__/BaseMessagingAdapter.test.ts:571-595`). Multi-step over Slack/Teams does not execute. |
| Scheduled routines drop graphs | `UserRoutineDispatcherDriver.executeAgentTarget` serializes `result.payload` into the run record; no graph inspection (`packages/Scheduling/engine/src/drivers/UserRoutineDispatcherDriver.ts:422-458`). |
| No server-side detection | Grep across the repo: `taskGraph` appears in exactly four TS files — the Angular component, `TaskResolver`, `TaskOrchestrator`, and one MessagingAdapters test. Nothing inspects a completed run's payload server-side. |
| Agent framework is blind to Tasks | Zero references to `MJTaskEntity` / `'MJ: Tasks'` / `TaskOrchestrator` anywhere in `packages/AI/**`. Dependency arrow is strictly one-way. |
| Sequential execution despite DAG | `executeTasksForParent` runs each eligible wave in a `for` loop (`TaskOrchestrator.ts:325-341`). Meanwhile `BaseAgent` already ships bounded-parallel sub-agents (concurrency 5, `base-agent.ts:273`) and parallel ForEach (concurrency 10). |
| No failure propagation | A `Failed` dependency leaves dependents `Pending` forever; `completeParentTask` unconditionally sets the parent `Complete` / 100% (`TaskOrchestrator.ts:419-436`). `Blocked`, `Cancelled`, `Deferred` are never written by any code path. |
| No resume / durability | Execution lives inside the mutation request. Server restart orphans `In Progress` tasks; page reload loses the awaited promise. Nothing ever resumes a graph. |
| Payload smuggling | `inputPayload` and outputs ride inside `Task.Description` as `__TASK_METADATA__` / `__TASK_OUTPUT__` markers (`:170-176`, `:533-535`); leaks into search results and the task detail panel. Both design docs called for `InputPayload`/`OutputPayload` columns; never added. |
| `@taskX.output` is fiction | The reference syntax in the planner prompt is resolved nowhere; the literal string reaches the downstream LLM, which copes only because all dependency outputs are also dumped as markdown (`buildConversationMessages`, `:651-684`). |
| Agent-run mis-link in UI | The Gantt maps agent runs via `ConversationDetailID`, which every sibling task shares — all siblings link to the same run (`tasks-full-view.component.ts:373-395`). The correct `agentRunId` is captured in `__TASK_OUTPUT__` but never read. |
| No cycle detection | A cyclic `dependsOn` would deadlock silently: tasks never become eligible, the loop exits, parent completes. |
| Unknown agents silently dropped | `createTasksFromGraph` logs and skips unresolvable `agentName`s (`:140-147`) — the graph executes with holes. |

### Existing machinery this plan builds on (not rebuilt)

- **Loop response contract + validation/retry correctives** — `packages/AI/Agents/src/agent-types/loop-agent-response-type.ts:102` (`nextStep.type` union), `loop-agent-type.ts` (`createRetryStep` correctives for malformed shapes).
- **Prompt-section toggles with auto-alignment** — `LoopAgentTypePromptParams` (`loop-agent-prompt-params.ts:170`), three-level merge in `buildAgentTypePromptParams` (`base-agent.ts:6699`), `applyResponseTypeAutoAlignment` (`:6755`) strips disabled types from the emitted response interface.
- **Pause/resume for HITL** — Plan Mode gate resolves approval by finding a resolved `MJ: AI Agent Requests` row (`base-agent.ts:8066-8113`).
- **Flow traversal** — condition-gated paths via `SafeExpressionEvaluator` (`flow-agent-type.ts:395` `getValidPaths`), recovery branches (Failed-with-path, `:1275`), per-step `ActionOutputMapping` (`:841`, `:1036`).
- **Task schema headroom** — `Status` values `Blocked/Cancelled/Deferred/Failed`; `DependencyType` values `Corequisite/Optional`; `UserID` xor `AgentID` validator (`entity_subclasses.ts:110765-110790`); `DueAt`, `ProjectID`.
- **Concurrency utility** — `mapWithConcurrency` (`base-agent.ts:8389`).
- **PubSub frame contract** — `resolver: 'TaskOrchestrator'` frames and `routeTaskProgress` client routing survive unchanged.

---

## 3. Target architecture

### 3.1 Conceptual model: definition vs. instance

Separate what the two current systems each have half of:

- **Graph definition** — the shape of the work: nodes, edges, conditions, input mappings. Comes from **either** design-time metadata (`MJ: AI Agent Steps` + `Step Paths`) **or** a runtime LLM emission (the `Tasks` primitive). Same logical shape; provenance does not matter.
- **Execution instance** — durable state of one run of a definition: `MJ: Tasks` + `MJ: Task Dependencies` rows carrying status, timing, payloads, agent-run links. This is what the UI renders, what survives restarts, and what humans participate in.

A runtime-submitted graph is materialized as an **ephemeral flow**: an in-memory flow definition built from the task graph (nodes ≈ steps, `dependsOn` ≈ paths) executed by the shared traversal engine, with execution state persisted as Task rows. Nothing is written to the `AIAgentStep` tables for runtime graphs.

### 3.2 Components and package layering

```
@memberjunction/ai-core-plus
    └─ TaskGraph types: TaskGraphRequest, TaskGraphNode, validation helpers
       (moved/evolved from TaskOrchestrator.ts:13-29 — the only typed definition today)

@memberjunction/ai-agents
    └─ LoopAgentType: 'Tasks' nextStep type, shape validation + retry correctives,
       prompt docs section, EnableTaskGraphs → includeTaskGraphDocs mapping.
       Emits a validated graph on the run result; DOES NOT submit or execute.
       (keeps ai-agents 100% Task-free — no dependency cycle)

@memberjunction/task-graph   (new package; name bikeshed welcome)
    ├─ TaskGraphService  — submission: validate (shape, agents resolvable, DAG
    │                      acyclic, limits) + persist (transactional, from
    │                      today's createTasksFromGraph) + enqueue
    ├─ TaskGraphDispatcher — durable execution: eligibility computation, bounded-
    │                      parallel wave launch, failure/cancel propagation,
    │                      startup reconciliation, HITL waits, continuations
    └─ (Phase 4) shared GraphTraversalEngine consumption
       depends on ai-agents (AgentRunner) — legal because ai-agents never imports it

MJServer            — thin resolvers (submit / cancel / retry / compat
                      ExecuteTaskGraph), run-completion detection shim, PubSub bridge
MessagingAdapters   — structured-graph delegation strategy (before the regex)
Scheduling          — routine/agent drivers hand completed-run graphs to the service
Angular             — observer only: subscribes on load, re-attaches to in-flight
                      graphs, renders lifecycle + progress frames
```

**Why the agent emits rather than submits (D2 + layering):** if `BaseAgent` called the executor directly we'd have `ai-agents → task-graph → ai-agents`. Instead the primitive has *submit-and-detach* semantics: emitting `nextStep.type: 'Tasks'` ends the agent's turn with the validated graph on the run result; the hosting layer (server resolver, messaging adapter, scheduler — all of which already depend on both packages) submits it. Validation feedback (malformed graph → retry corrective) still happens inside the agent loop where it belongs. An injected `ITaskGraphSubmitter` on `ExecuteAgentParams` is the fallback design if a genuine mid-run synchronous submission need appears; not in scope for v1.

### 3.3 The `Tasks` primitive (Loop agent type)

**Response contract** — extend `loop-agent-response-type.ts:102`:

```ts
type: 'Actions' | 'ClientTools' | 'Sub-Agent' | 'Chat' | 'Retry' | 'ForEach'
    | 'While' | 'Pipeline' | 'Skill' | 'Plan' | 'Tasks';

nextStep?: {
    // ...existing fields...
    /** Durable task graph to submit. Required when type === 'Tasks'. */
    tasks?: TaskGraphRequest;
}

interface TaskGraphRequest {
    workflowName: string;
    reasoning?: string;
    tasks: Array<{
        tempId: string;
        name: string;
        description: string;
        agentName?: string;          // agent task
        assignToUser?: boolean;      // human task (Phase 4) — mutually exclusive
        dependsOn: string[];
        inputPayload?: Record<string, unknown>;
    }>;
    /** What happens to the submitting agent's conversation when the graph finishes. */
    continuation?: 'message' | 'reinvoke' | 'none';   // default 'message'
}
```

**Mental model** (goes in the prompt docs): `nextStep.subAgents[]` is *ephemeral* fan-out — blocks the run, dies with it. `nextStep.type: 'Tasks'` is *durable* fan-out — dependency-ordered, survives the run, visible in the Tasks UI, resumable, can include waits on humans. Quick nested work → sub-agents; multi-wave / long-running / cross-channel work → task graph.

**Semantics — submit-and-detach (v1):** the step terminates the turn (like `Chat`). The dispatcher executes the graph; on completion it posts a results message into the conversation (`continuation: 'message'`) or re-invokes the submitting agent with the graph outcome as a new turn (`'reinvoke'` — the same continuation pattern as Agent Requests resume). No run suspension is invented.

**Opt-in setting (D3):**
- New column `AIAgent.EnableTaskGraphs` (bit, NOT NULL, **default 1**) — precedent: `SupportsPlanMode` / `RequirePlanMode`.
- `buildAgentTypePromptParams` maps it to the default of a new `includeTaskGraphDocs` param; explicit `AgentTypePromptParams` / per-run overrides win, same three-level merge as every other toggle.
- `applyResponseTypeAutoAlignment` strips `'Tasks'` from the emitted union when disabled — a disabled agent's LLM never sees the type exists.
- Non-Loop agent types ignore the column until Phase 4.

**Validation + guardrails (in `LoopAgentType`, with retry correctives):**
- Shape validation; duplicate `tempId` rejection; `dependsOn` references must resolve; **DAG acyclicity check** (new — currently a silent deadlock); max tasks per graph (proposed 50, matching scratchpad `EnforceTaskLimit`); unknown `agentName` is a **validation failure fed back to the LLM**, not a silent drop.
- Graph-spawn depth: a task's agent may itself submit a graph; a depth counter rides in task metadata (sub-agent `parentDepth` precedent), proposed cap 3.

### 3.4 Submission service and dispatcher

**`TaskGraphService.Submit(graph, context) → parentTaskId`** — validate (same rules as the primitive, re-checked server-side as source of truth), persist parent + children + dependencies in one transaction (carried over from `createTasksFromGraph`), write `InputPayload` to its new column, emit a `graph-submitted` lifecycle frame, hand to dispatcher, return immediately.

**`TaskGraphDispatcher`** — the durable execution loop:
- **Eligibility**: `Pending` + all `Prerequisite` dependencies `Complete` (today's `findEligibleTasks` logic, kept).
- **Parallel waves**: launch all eligible tasks via `mapWithConcurrency` with a configurable cap (proposed default 5, aligned with parallel sub-agents). Each task: fresh entity instances, no shared open transaction (the current code already learned to keep prep outside the txn — that discipline extends to execution).
- **Structured I/O**: dependency outputs are read from `OutputPayload` and injected structurally; `@taskX.output` references in `inputPayload` are **actually resolved** (substitution against the named task's `OutputPayload`). The markdown dump remains as supplementary context during migration.
- **Failure propagation**: task `Failed` → all transitive dependents → `Blocked`; parent → `Failed` unless every child completed. `PercentComplete` stays honest. Retry mutation resets a `Failed` task to `Pending` and unblocks its dependents.
- **Cancellation**: parent `Cancelled` → all non-terminal children `Cancelled`; in-flight agent runs cancelled via the existing BaseAgent cancellation checks.
- **Durability / restart reconciliation**: on server start, find parents `In Progress` with no live execution; re-dispatch their eligible sets. (Single-dispatcher assumption for v1; see Open Questions for multi-server.)
- **HITL**: a task with `UserID` set is never auto-executed — it is surfaced via `MJ: User Notifications` and completed by a human through the UI/mutation, which unblocks dependents (Phase 4 end-to-end). Agent-side approval gates use `MJ: AI Agent Requests` pause/resume.
- **Events**: keep today's frame contract (`resolver: 'TaskOrchestrator'`, `TaskProgress`/`AgentProgress`) so `ConversationStreaming.routeTaskProgress` and existing UI keep working; add graph-lifecycle frames (`submitted`, `wave-started`, `blocked-on-human`, `completed`, `failed`).

**Server-side detection (transition shim):** until prompts migrate to the primitive, a small detection service (`result.payload?.taskGraph`) is called at the three run-completion seams: the MJServer agent-run path, `BaseMessagingAdapter` delegation detection (as a structured strategy **ahead of** the text regex), and the Scheduling drivers. It submits to `TaskGraphService` and is deleted once the primitive is the only producer.

### 3.5 Flow executor convergence + parallel DAG (D6/D7)

**Verified current state:** `FlowExecutionState.currentStepId` is a single program counter (`flow-agent-type.ts:46`); after each step only the highest-priority valid path is followed (`paths[0]`, `:1266`; alternates tried only when the destination step is inactive, `:1285`). Flow cannot fan out today.

**Additions to the traversal model:**
- **Frontier set**: `activeStepIds: Set<string>` replaces the single counter; all newly-eligible nodes launch (concurrency-capped).
- **Join semantics**: AND-join by default — a node with multiple incoming paths becomes eligible when **all** satisfied incoming paths complete. This is exactly `Prerequisite` dependency semantics, which is why the models converge cleanly. OR-join maps to the `Optional` dependency type; `Corequisite` maps to co-scheduled nodes. (Exact mapping table to be finalized in Phase 4 design.)
- **Back-compat**: existing flows keep sequential highest-priority-path behavior unless the flow opts into parallel traversal (metadata flag on the agent or step level — open question below).

**Convergence path:** extract the traversal core (frontier management, path/condition evaluation via `SafeExpressionEvaluator`, join logic, recovery-path handling) from `FlowAgentType` into a shared **GraphTraversalEngine** with two state backends:
- **In-run backend** — `FlowAgentType` keeps executing design-time flows inside a single agent run with in-memory state (today's behavior, now parallel-capable).
- **Durable backend** — `TaskGraphDispatcher` runs ephemeral flows (from runtime submissions) with state persisted to Task rows across runs, restarts, and human waits.

What each side inherits: task graphs gain **conditional edges** (path conditions evaluated against upstream `OutputPayload`), **recovery branches** (Failed-with-a-path = declarative error handling), and **structured output mapping** (the `ActionOutputMapping` analog — the real fix for `@taskX.output`). Flow gains **durability, visibility, and human nodes** when its runs materialize as task instances (optional, stretch).

The bespoke `TaskOrchestrator` wave loop is retired at the end of Phase 4.

### 3.6 Schema changes (additive; `migrations/v5/`)

| Table | Change |
|---|---|
| `Task` | `+ InputPayload NVARCHAR(MAX) NULL`, `+ OutputPayload NVARCHAR(MAX) NULL`, `+ AgentRunID UNIQUEIDENTIFIER NULL` (FK → `AIAgentRun`; fixes the Gantt mis-link), `+ ErrorMessage NVARCHAR(MAX) NULL` |
| `AIAgent` | `+ EnableTaskGraphs BIT NOT NULL DEFAULT 1` |

No new tables. No CHECK changes — `Status` and `DependencyType` already carry the needed values; this plan starts *honoring* `Blocked`/`Cancelled`/`Failed` and (Phase 4) `Optional`/`Corequisite`. `Description` smuggling (`__TASK_METADATA__`/`__TASK_OUTPUT__`) is written no more; readers keep a fallback parse for pre-migration rows. Standard flow: migration → CodeGen → typed properties (no `.Get()`/`.Set()` interim code).

### 3.7 Prompt & metadata migration

- **Sage** (`sage.template.md`): keeps emitting graphs — including one-task graphs — but via the primitive instead of `payloadChangeRequest` smuggling. With server-side execution + existing per-task agent progress frames, the client's single-task fast path is no longer needed; delegation becomes uniform and every delegation appears in the Tasks UI.
- **Workflow Planner** (`workflow-planner.template.md`): unchanged role — decomposition, `Find Candidate Agents` per task, user confirmation — but final submission switches to the primitive. `@taskX.output` stays in the prompt *because it becomes real* (structured resolution).
- **Planner as replanner (Phase 4 option)**: on failure, the dispatcher may re-invoke a configured planner agent with current graph state to append/reroute tasks — plan → execute → replan. The schema supports appending tasks to a live graph today.
- The payload-sniffing shim and the `ExecuteTaskGraph` mutation remain one release for compatibility, then are removed.

### 3.8 Client changes

- `message-input.component.ts`: delete the await-the-mutation flow (`handleTaskGraphExecution`) and the single-task fork (`handleSingleTaskExecution`); render workflow state from lifecycle + progress frames.
- **Re-attach on load**: query active parent tasks for the conversation and subscribe — fixes the today-unfixable "reload mid-workflow loses everything" gap.
- Fix `agentRunMap` to use `Task.AgentRunID` (`tasks-full-view.component.ts:373-395`).
- Render `Blocked`/`Cancelled` states (icons already exist in `simple-task-viewer.component.ts:359`); add cancel/retry affordances wired to the new mutations.

---

## 4. Phases

Ordering is deliberate: each phase ships value alone, and later phases replace as little as possible of earlier ones. Work explicitly marked *(interim)* is the only potentially-throwaway code, chosen because it is small and de-risks the interim.

### Phase 1 — Truthful engine
Make the existing path honest without moving it.

1. Migration: `Task` columns + `AIAgent.EnableTaskGraphs` (+ CodeGen).
2. `TaskOrchestrator`: write/read `InputPayload`/`OutputPayload`/`AgentRunID`/`ErrorMessage` (Description fallback read only); failure propagation (`Blocked` dependents, honest parent terminal status); submission-time cycle detection; unknown `agentName` = hard error; wave parallelization with concurrency cap *(interim in placement, but the eligibility/wave logic carries into the dispatcher unchanged)*.
3. UI: `AgentRunID`-based run links; `Blocked`/`Failed` rendering.

**Exit criteria:** parallel branches actually parallelize; a failed task blocks its dependents and fails its parent; task detail shows clean payloads; Gantt links the right runs.

### Phase 2 — Placement
Execution becomes server-owned, durable, channel-agnostic.

1. Extract to `@memberjunction/task-graph`: `TaskGraphService` (submission) + `TaskGraphDispatcher` (execution). `TaskResolver` becomes a thin wrapper; `ExecuteTaskGraph` kept for compat.
2. Dispatcher: detached execution, startup reconciliation, cancel/retry mutations.
3. Server-side detection shim at the three seams (MJServer run path, `BaseMessagingAdapter` structured strategy before the regex, Scheduling drivers).
4. Client observer refactor + re-attach.

**Exit criteria:** a multi-step graph requested from Slack executes end-to-end; reloading Explorer mid-workflow re-attaches; a server restart resumes an in-flight graph; the client no longer awaits execution.

### Phase 3 — The primitive
Agents get the capability directly.

1. `TaskGraphRequest` types in `ai-core-plus`; `'Tasks'` in the Loop response union; validation + retry correctives; run-step persistence (likely a new `AIAgentRunStep.StepType` value — see open questions).
2. Prompt docs section + `includeTaskGraphDocs` + auto-alignment + `EnableTaskGraphs` mapping (default on).
3. Detach semantics + continuations (`message` / `reinvoke`); approval-gated graphs via `MJ: AI Agent Requests`.
4. Guardrails: task cap, spawn-depth cap.
5. Sage + Workflow Planner prompt migration; single-task client fork retired; payload sniff flagged for removal.

**Exit criteria:** any opted-in Loop agent can decompose work into a durable graph mid-run without Workflow Planner attached; malformed graphs get corrective retries; Sage no longer smuggles graphs through the payload.

### Phase 4 — Convergence
One traversal engine; the full model lights up.

1. Extract `GraphTraversalEngine` from `FlowAgentType` (pure refactor; Flow behavior unchanged; tests prove parity).
2. Frontier set + AND/OR joins + concurrency cap; Flow gains opt-in parallel DAG traversal.
3. Dispatcher adopts the engine; conditional edges + recovery branches + structured output mapping on task graphs; `@taskX.output` fully structural.
4. Human task nodes end-to-end: assignment, notification, complete-to-unblock; approval-as-a-human-task for headless channels. Optional: replanner hook; optional: Flow runs materialize Task rows for visibility.
5. Retire the bespoke `TaskOrchestrator` execution loop.

**Exit criteria:** design-time flows and runtime graphs run on the same engine; a graph can contain a human approval that blocks downstream agent tasks and resumes on completion; parallel branches work identically in both provenances.

---

## 5. Risks and open questions

| # | Item | Notes / proposal |
|---|---|---|
| O1 | **Multi-server dispatch** | v1 assumes a single dispatcher. Multi-instance MJAPI needs a claim mechanism (SQL row-lock claim on task rows is the natural pattern). Flagged, not designed here. |
| O2 | **Headless approval policy** | Interactive channels keep the planner's confirm step. For scheduled/headless: default auto-run, unless the submitting agent has `RequirePlanMode` — in which case approval materializes as a human task / Agent Request. Needs product sign-off. |
| O3 | **Parallel-traversal opt-in for existing flows** | Where does the flag live — agent level or step level? Proposal: agent-level default-off for Flow (back-compat), always-on for ephemeral (runtime) graphs. |
| O4 | **Provider/transaction concurrency** | Parallel task runs must not share entity instances or an open transaction. Pattern exists (prep-outside-txn in `createTasksFromGraph`); needs a test that hammers it. |
| O5 | **Everything-is-a-graph overhead** | Uniform single-task delegation adds a Task row + dispatcher hop per delegation. Accepted for uniformity/visibility; revisit if latency data objects. |
| O6 | **`AIAgentRunStep.StepType` addition** | A `'Tasks'` step type keeps run forensics clean (CHECK-constraint migration + CodeGen union widening). Small, but touches generated types. |
| O7 | **Naming** | Package (`@memberjunction/task-graph`?), column (`EnableTaskGraphs`?), prompt param (`includeTaskGraphDocs`?). Bikeshed at review. |
| O8 | **Compat window** | How long do `ExecuteTaskGraph` + payload sniffing live? Proposal: one release after Phase 3 lands. |

---

## 6. Testing strategy

- **Unit (per package, vitest):** graph validation (cycles, dupes, unknown agents, caps); eligibility/wave computation; failure/cancel propagation matrices; join semantics (AND/OR); `@taskX.output` resolution; prompt-param merge + auto-alignment for the new toggle; Flow traversal parity suite before/after engine extraction (Phase 4 gate).
- **Integration (deterministic tier):** new bundle *"ITxx — Task Graph Orchestration"* per `guides/INTEGRATION_TESTING_QUICKSTART.md`: submit → dispatch → parallel wave → induced failure → `Blocked` propagation → retry → completion; restart-reconciliation simulation; messaging-adapter structured delegation; client re-attach against the streaming contract (existing `ConversationStreaming` test patterns).
- **Prompt/E2E:** Sage emits the primitive for single- and multi-task delegation; Workflow Planner confirm-then-submit loop; an opted-out agent's emitted interface contains no `'Tasks'` type.

---

## Appendix — primary source index

| Concern | Location |
|---|---|
| Loop response union | `packages/AI/Agents/src/agent-types/loop-agent-response-type.ts:102` |
| Prompt-param toggles + auto-alignment | `packages/AI/Agents/src/agent-types/loop-agent-prompt-params.ts:170`; `base-agent.ts:6699`, `:6755` |
| Plan Mode / Agent Requests gate | `base-agent.ts:8066-8113` |
| Parallel sub-agents / concurrency util | `base-agent.ts:273`, `:8389`, `:10208` |
| Flow single-threaded evidence | `flow-agent-type.ts:46` (`currentStepId`), `:1266` (`paths[0]`), `:1285` (inactive-only alternates) |
| Flow conditions / recovery | `flow-agent-type.ts:395`, `:1275` |
| Orchestrator persistence/exec/artifacts | `packages/MJServer/src/services/TaskOrchestrator.ts:106-218`, `:303-351`, `:479-592`, `:707-788` |
| Client detection + execution | `packages/Angular/Generic/conversations/.../message-input.component.ts:1766`, `:1873-2033`, `:2159-2250`, `:2644` |
| Messaging gap | `packages/MessagingAdapters/src/__tests__/BaseMessagingAdapter.test.ts:571-595` |
| Scheduling gap | `packages/Scheduling/engine/src/drivers/UserRoutineDispatcherDriver.ts:422-458` |
| Task schema + validators | `packages/MJCoreEntities/src/generated/entity_subclasses.ts:110746`, `:110765-110790`, `:110495` |
| Streaming routing | `packages/ConversationsRuntime/src/streaming/ConversationStreaming.ts:309-364` |
| Sage / planner prompts | `metadata/prompts/templates/sage/sage.template.md`, `workflow-planner.template.md`; `metadata/agents/.sage-agent.json:571-667` |
