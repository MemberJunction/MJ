# Task Graphs as an Agent Primitive — Design Plan

**Status:** ✅ **v8 — Final, approved for build** (2026-08-06)
**Date:** 2026-08-05 (study) · finalized 2026-08-06
**Origin:** Architecture study of the Sage → Workflow Planner → TaskOrchestrator pipeline (session `claude/sage-task-graph-study-4uvtrc`), revised through a whole-repo unified-workflow review and two external review rounds

**Review record.** Two external reviews, both approving the direction, all findings dispositioned by AN-BC rulings and applied:
- **Round 1 (MarceloT-BC → v6):** D20 task-row integrity (subclass guard + CAS-guarded writes + sweep normalization); D9 folds made observable (the `TaskGraph` run step is written even when folded, so single-node graphs are promotable via D17); D12 tightened to *no external adoption*; one-time Phase 1 backfill replacing the permanent `__TASK_METADATA__` fallback parse; Phase 5 verification posture (structure/behavior + selective visual baselines, not blanket pixel diffs); source refs pinned to the study baseline.
- **Round 2 (rkihm-BC → v7):** `enableTaskGraphs` default flips to **OFF** with named launch opt-ins (Sage, Query Builder, Research Agent + its sub-agents); human tasks exempt from sweep claim-normalization; the continuation/reinvoke contract specified (context shape, idempotency, cycle bound); convergence recorded as accepted risk R6; dispatcher indexes added to the Phase 1 migration; D12 restated as a deliberate, accepted v6 breaking change; human-task assignment authorization deferred to issue [#3524](https://github.com/MemberJunction/MJ/issues/3524).
- **Already shipped from review:** the `RunSingleFilter` stub was pulled out as an immediate hotfix — **PR [#3525](https://github.com/MemberJunction/MJ/pull/3525), merged to `next`** (fail-closed filter evaluation, 12 new tests). LTS 5.x backport is tracked in that PR's thread.

**Revision history:** v3 what/when program framing + D14/D15/D16 + redaction/sweep/notification postures · v4 `TaskGraphSpec` rename, Save as Workflow (D17/§3.9), "Workflow" terminology (D18), companion program plan (`plans/unified-workflow.md`) · v5 Phase 0 (legacy retirement) + Phase 5 (Workflow UX, D19) + mockups · v6 first review applied · v7 second-review dispositions · v8 final consistency pass, build-ready · post-v8: drift review vs `next@7f18ea992` (harness note), Phase 0 scope expanded to the `Report*` family.

**Living document during build — narrowly.** Per AN-BC (2026-08-06), the design above the ledger is **frozen**: the implementation agent updates the build ledger below and nothing else. Detail, blockers, and questions go in comments on [PR #3456](https://github.com/MemberJunction/MJ/pull/3456). A genuine design deviation is raised as a PR comment first and only written into the plan once ruled on — the plan does not drift silently to match the code.

---

## Build ledger

Each phase ships as its own PR, cut fresh from `next` after the prior one merges.

| # | Phase | PR | Status |
|---|---|---|---|
| 0 | Legacy retirement — Workflow trio, the `Report*` family, Scheduled Actions, Output Trigger Types | — | ⬜ Not started |
| 1 | Truthful engine — Task columns + indexes + backfill, failure propagation, cycle detection, wave parallelization | — | ⬜ Not started |
| 2 | Placement — `@memberjunction/task-graph`, dispatcher + claim protocol, server-side detection, client → observer | — | ⬜ Not started |
| 3 | The primitive — `'Tasks'` in the Loop union, `TaskGraphSpec`, folding, continuations, opt-in metadata, prompt migration | — | ⬜ Not started |
| 4 | Convergence — `GraphTraversalEngine`, joins + `traversalMode`, human tasks, sweep enforcement, Save as Workflow | — | ⬜ Not started |
| 5 | Workflow UX — editor upgrade, runtime overlay, Create Workflow entry, D18 vocabulary sweep | — | ⬜ Not started |
| R | `BaseAgent` decomposition ([#2708](https://github.com/MemberJunction/MJ/issues/2708)) — **resequenced to last** (AN-BC, 2026-08-06): run it once the engine is proven rather than ahead of Phase 3, since Phase 3's changes live in `loop-agent-type.ts` / `loop-agent-prompt-params.ts` / `ai-core-plus` and need no `base-agent.ts` change. Supersedes D13's staging. | — | ⬜ Not started |

**Build conventions agreed with AN-BC (2026-08-06).** Target DB is local SQL Server `MJ_6_1_0`, freely droppable. **SQL Server only — PostgreSQL counterparts are handled separately by other developers**, so the usual `migrations/vN` ↔ `migrations-pg/vN` pairing is deliberately deferred for this program; the "+ PG counterpart" phrasing in the phases below is superseded by this. New migrations must sort after `V202608052115`. The deterministic bundle `task-graph-orchestration.checks.ts` opens in Phase 1 and grows each phase rather than being deferred to the end. Phase 3 ends with a manual Sage soak before merge, since it rewrites the flagship agent's most-exercised path.

---

## 1. Summary

MemberJunction already has a durable, dependency-aware plan-execution substrate — the `MJ: Tasks` / `MJ: Task Dependencies` schema, the `TaskOrchestrator`, a Gantt/checklist UI, PubSub progress streaming, and completion notifications. Today that substrate is reachable only as a UI convenience of one Angular component: the Explorer conversation client detects a `taskGraph` in an agent's payload and drives execution through a single long-lived GraphQL mutation. Every other channel (Slack/Teams, scheduled routines, headless API) silently drops the plan, the agent framework itself has zero knowledge that Tasks exist, and the executor uses a fraction of what its own schema supports.

**Why now — the LLM-capability context.** When Sage, the Workflow Planner, and the task-graph concept were originally built, model capability was far below where it is today. Reliable decomposition needed a dedicated planning specialist with a narrow prompt. That assumption no longer holds: a reasonably smart mid-sized model can emit a useful, well-formed task graph directly in its response as a matter of course. That shifts the design center — graph emission becomes an ordinary capability any Loop agent can turn on (rollout is deliberately opt-in per D3), while the Workflow Planner survives as an *optional* specialist for genuinely complex decomposition (and its confirmation UX), needed rarely rather than routinely.

This plan makes task graphs a first-class capability of the platform:

1. **Execution moves server-side and becomes invocation-agnostic** — submission split from execution; a durable dispatcher runs graphs regardless of origin; all clients are observers via the existing PubSub plumbing.
2. **`Tasks` becomes a Loop-agent primitive** side-by-side with `ForEach`/`While`, gated by an `enableTaskGraphs` setting in the agent-type params bag (`AIAgent.AgentTypePromptParams`) — **default off**, enabled at launch for Sage, Query Builder, and Research Agent (+ its sub-agents) via their agent metadata, with prompt documentation injected/stripped via the existing include-docs + auto-alignment mechanism.
3. **The Flow traversal engine becomes the one graph executor.** A runtime LLM-emitted graph is converted into an *ephemeral flow* and run by the same engine that runs design-time flows. Flow gains parallel DAG execution (it is strictly single-threaded today); task graphs gain Flow's conditional paths and recovery branches. Single-node graphs are *constant-folded* into direct in-run execution.
4. **Human-in-the-loop is native**: `MJ: AI Agent Requests` is the pause/resume mechanism for approvals, and the Task schema's existing `UserID`-xor-`AgentID` design makes *human tasks* first-class graph nodes that block downstream agent work.
5. **`BaseAgent.ts` is decomposed** from a ~14.4k-line monolith into composed helper classes as a parallel track, landing before/alongside the primitive work that touches it.

### Where this sits in the workflow program — *what* vs. *when*

MJ's workflow story separates two axes, and this plan owns exactly one of them:

- **WHAT runs is a DAG** — one generic graph execution engine, delivered here. Ephemeral in-run (a Flow agent traversing its design-time graph; a constant-folded single node) or durable cross-run (the dispatcher executing Task rows). A **Loop agent spins up a DAG dynamically** to do its work; a **Flow agent IS a DAG** authored at design time, running deterministically through the same execution code. Producers differ; the engine does not.
- **WHEN it runs is the trigger layer** — Entity Actions (record lifecycle, PR #3408), Scheduled Jobs, User Routines, on-demand invocation (UI / Remote Operations / MCP), and direct agent invocation. Triggers are out of scope here; they dispatch into agents/actions exactly as today, and anything they start can emit a graph.

Companion tracks in the broader program — trigger-vocabulary normalization, a stored workflow-spec object binding a DAG to its triggers, authoring front doors (Flow visualization for business users; Agent Manager already authors flows), and unified run observability — build **on** this engine and are deliberately not in this plan's scope. The companion program plan lives at [`plans/unified-workflow.md`](unified-workflow.md).

**Relationship to the future WorkflowSpec:** the WHAT half of a stored workflow definition IS `TaskGraphSpec` (D16) — even a "run one action" workflow is a one-node graph, which D9's constant folding executes with zero graph overhead at runtime. What `TaskGraphSpec` deliberately does not carry is the WHEN: a stored WorkflowSpec wraps it with identity (name/owner/status), triggers (entity-event / schedule / on-demand), and outcome routing (notifications/audience). Composition, not extension — trigger fields never leak into the graph contract, because runtime producers (a Loop agent mid-run) have no business setting triggers.

### Decisions

| # | Decision |
|---|----------|
| D1 | Task-graph execution is server-side and works identically regardless of invocation channel. The client never drives execution; updates are pushed to it. |
| D2 | Submission (validate + persist) is split from execution (durable dispatcher). Graph rows are an execution substrate, not bookkeeping. |
| D3 | `Tasks` is a new Loop-agent primitive alongside `ForEach`/`While`. Opt-in/out lives in the **agent-type params bag** (`AIAgent.AgentTypePromptParams`, schema per agent type via `AIAgentType.PromptParamsSchema`) as `enableTaskGraphs` — *not* a column on `AIAgent`, since the capability is Loop-specific. **Default is OFF** (review round 2): default-on would be a simultaneous, silent prompt/behavior change to every production Loop agent — availability is justified by current models, blanket activation is not. At launch the capability is enabled via agent metadata for **Sage, Query Builder, and Research Agent (+ its sub-agents)**; other agents opt in as their owners see fit. Auto-alignment strips the `nextStep` type from the emitted response interface when disabled, and `LoopAgentType` validation rejects the step type when disabled (capability gate, not just docs). **Note (post-baseline): `HarnessAgentType` (external agent harnesses, merged via #3412) `extends LoopAgentType` and inherits `DetermineNextStep` unchanged — harness agents therefore inherit both the `Tasks` primitive and this gate. Default-off means an external harness gets no graph capability without explicit opt-in; Phase 3 must verify the gate and prompt-docs injection through the harness prompt path as well as Loop's.** |
| D4 | Capability is **not** granted by attaching the Workflow Planner sub-agent. With current-generation models, any opted-in Loop agent emits graphs directly; the planner remains an optional specialist for complex decomposition and confirmation UX — rarely needed. |
| D5 | `MJ: AI Agent Requests` is the pause/resume mechanism for HITL approval gates (Plan Mode precedent). |
| D6 | The Flow graph executor is the executor that is kept. Dynamic instructions are converted into an **ephemeral flow** and executed by the shared traversal engine. Useful pieces of the current `TaskOrchestrator` (wave computation, transactional persistence, artifact creation, PubSub frames) carry over. |
| D7 | Flow gains **parallel DAG execution** — verified today it is single-threaded (single `currentStepId`; only `paths[0]` followed). Frontier-set traversal + join semantics + concurrency cap are added. Design-time flows opt in via their params bag (`traversalMode`); ephemeral flows built from task graphs are always parallel. |
| D8 | **Task rows are NOT written for in-run Flow execution.** `AIAgentRunStep` already records intra-run execution. The boundary: **run steps = intra-run forensics; Task rows = cross-run durable work items** (dispatcher state, human tasks, UI). Neither replaces the other; nothing is double-written. |
| D9 | **Single-node graphs are flattened** ("constant folding"): a one-task, zero-edge, agent-assigned graph with default continuation semantics is compiled by `LoopAgentType` into the underlying primitive (a `Sub-Agent` step) and executed in-run — no Task row, no dispatcher hop. Flattening is skipped for human tasks, non-default continuations, or when durability is explicitly requested. **The fold is observable, never silent**: the `TaskGraph` run step (D10) is written for every emitted graph — folded or dispatched — carrying the full spec, a `folded` flag, and the reason, so run forensics show the decision and Save as Workflow (D17) attaches to folded graphs too. |
| D10 | The run-step type for graph submission is **`TaskGraph`** (clearer than `Tasks`); type-union recompiles are a non-issue. |
| D11 | Package naming is **not** AI-prefixed (`@memberjunction/task-graph`): the submission API is producer-agnostic — an LLM, deterministic code, or a human UI can all construct and submit a DAG. |
| D12 | `ExecuteTaskGraph` mutation and the client-driven execution path are **removed immediately** in Phase 2. Removing a public GraphQL mutation is formally a breaking external-surface change — stated, not asserted away (review round 2). It is **accepted deliberately**: the Explorer conversation client is the mutation's sole known caller and §3.8 removes it in the same phase; nothing outside the legacy Sage path is known to use it; and v6 is an open breaking-change window (the same standard Track B invokes for its removals). The removal is documented in the v6 release notes; no deprecation window is carried. (The server-side payload-sniff shim still bridges prompts until Phase 3 migrates them.) |
| D13 | `BaseAgent.ts` is refactored into composed helper classes as part of this program (parallel track R), behavior-preserving, staged ahead of the Phase 3 changes that touch it. |
| D14 | **The dispatcher's claim protocol is MJ's durable-async substrate going forward.** `MJQueue`'s durability is illusory today (rows written, never read back; no restart reclaim, no cross-process pickup) and it is not extended. New durable work targets `TaskGraphService` submission — a single-node durable graph is exactly "run this action durably with retry" — including the #3408 plan's After\*-entity-action routing (its runbook step 9), which re-targets here instead of `QueueManager`. MJQueue is absorbed/retired on its own track. |
| D15 | **Pipelines and task graphs stay separate primitives.** A Pipeline (`plans/tool-pipelines.md`) is a single-turn, in-run *data* program — one value out, no durable state. A task graph is durable, multi-run *work* orchestration. Neither grows toward the other; an agent that needs both emits both. |
| D16 | **`TaskGraphSpec` is the fully-qualified DAG spec.** One TS contract in `ai-core-plus` that every producer authors against — the LLM primitive, deterministic code, a human UI, and (future, out of scope here) stored workflow definitions that bind a graph to triggers. Server-side validation in `TaskGraphService` validates against this same contract; there is no looser internal shape. The `Spec` suffix aligns with `AgentSpec`: it memorializes a graph, it doesn't merely request execution. |
| D17 | **"Save as Workflow" — an ephemeral graph can be promoted to a design-time flow.** Because a runtime `TaskGraphSpec` and a design-time flow are the same logical shape (§3.1), a converter (`TaskGraphSpec` → `AgentSpec` with Flow type + Steps/Paths → `AgentSpecSync.Persist`) turns a Loop agent's dynamic approach into a reusable, schedulable flow agent. Surfaced wherever a run's graph is visible: the Agent Run admin UI (via the new `TaskGraph` run-step node) and ng-conversations (detect 1+ graphs on a completed run → offer "Save as Workflow"). See §3.9. |
| D18 | **"Workflow" is the user-facing noun; "Flow Agent" stays the implementation term.** UI surfaces (navigation, save-as affordance, authoring entry points, docs for business users) say *Workflow* — a deterministic pathway that can include AI steps. No schema/entity/agent-type rename; this is vocabulary, applied at the UX layer. The v6 retirement of the dead legacy `Workflow` tables frees the name. **The rule extends past the noun**: end-user surfaces never say *graph*, *DAG*, *node*, or *traversal* — they say *workflow*, *step*, *plan*, *path* (chat cards say "View", not "View graph"; run views say "Planned by Sage", not "Ephemeral graph"). Technical terms stay in dev docs and metadata. |
| D19 | **Workflow UX is in-scope for this program (Phase 5), and the existing `@memberjunction/ng-flow-editor` is upgraded, not replaced.** The Foblex-Flow canvas + `FlowAgentEditorComponent` become THE workflow viewer/editor: every capability this program adds (parallel traversal + joins, `traversalMode`, human tasks, runtime task graphs, Save as Workflow) must be visible and editable there, one visualizer serves both provenances (design-time workflow and runtime graph), and the editor gets a first-class creation entry point instead of being buried inside a saved AI Agent record form. |
| D20 | **Task rows are shared-writable, so dispatcher integrity is enforced, not assumed.** The six machine-state columns land on an entity with ordinary generated CRUD — entity forms, Data Explorer, GraphQL, and any agent holding an update-record action can write `Status` or `ClaimedBy` directly, so the claim protocol must survive human-vs-dispatcher writes, not just dispatcher-vs-dispatcher races. Three layers (§3.4): a server-side `MJTaskEntity` subclass guard on dispatcher-owned columns and claimed-row `Status` transitions; CAS-guarded dispatcher writes so a tampered row fails a stale executor's write cleanly instead of double-completing; and sweep detection/normalization of anomalous states. Legitimate human verbs (Cancel; Complete on a human-assigned task) flow through the first-class mutations. |

---

## 2. Current state (verified against code)

### The pipeline as it exists

1. **Sage's prompt mandates task-graph format for all delegation** — even single-agent handoffs are a one-task graph (`metadata/prompts/templates/sage/sage.template.md:39`, format at `:45-78`). Multi-agent work goes to the **Workflow Planner** sub-agent (`metadata/agents/.sage-agent.json:571-667`; Loop type; sole action `Find Candidate Agents`), which must present the plan and get user approval before emitting the graph (`workflow-planner.template.md:129-169`).
2. **Detection is client-side only.** `packages/Angular/Generic/conversations/src/lib/components/message/message-input.component.ts:1766` (Sage path) and `:2644` (@mention path — any agent) check `result.payload?.taskGraph`. Single-task graphs bypass the task system entirely (`handleSingleTaskExecution`, `:2159`). Multi-task graphs call the `ExecuteTaskGraph` mutation and **await the entire workflow in one GraphQL request** (`:1953-1993`).
3. **`TaskOrchestrator`** (`packages/MJServer/src/services/TaskOrchestrator.ts`) persists parent + children + dependencies transactionally (`:106-218`), then loops: find `Pending` tasks with all prerequisites `Complete` (`:356`) → execute each **sequentially** via `AgentRunner.RunAgent` (`:325`) → create an artifact per task output (`:707`) → completion notification (`:794`). Progress streams over PubSub frames routed by `ConversationStreaming.routeTaskProgress` (`packages/ConversationsRuntime/src/streaming/ConversationStreaming.ts:323`).

### Verified gaps

| Gap | Evidence |
|---|---|
| Messaging channels drop graphs | `BaseMessagingAdapter.detectDelegation` handles `invokeAgent` and a **regex over reply text** ("I'll have the {Agent}…"), never `taskGraph`; a test asserts the graph is suppressed from output (`packages/MessagingAdapters/src/__tests__/BaseMessagingAdapter.test.ts:571-595`). Multi-step over Slack/Teams does not execute. |
| Scheduled routines drop graphs | `UserRoutineDispatcherDriver.executeAgentTarget` serializes `result.payload` into the run record; no graph inspection (`packages/Scheduling/engine/src/drivers/UserRoutineDispatcherDriver.ts:422-458`). |
| No server-side detection | `taskGraph` appears in exactly four TS files repo-wide — the Angular component, `TaskResolver`, `TaskOrchestrator`, one test. Nothing inspects a completed run's payload server-side. |
| Agent framework blind to Tasks | Zero references to `MJTaskEntity` / `'MJ: Tasks'` / `TaskOrchestrator` anywhere in `packages/AI/**`. |
| Sequential execution despite DAG | `executeTasksForParent` runs each eligible wave in a `for` loop (`TaskOrchestrator.ts:325-341`), while `BaseAgent` ships bounded-parallel sub-agents (concurrency 5) and parallel ForEach (concurrency 10). |
| No failure propagation | A `Failed` dependency leaves dependents `Pending` forever; `completeParentTask` unconditionally sets the parent `Complete`/100% (`:419-436`). `Blocked`/`Cancelled`/`Deferred` are never written. |
| No resume / durability | Execution lives inside the mutation request. Server restart orphans `In Progress` tasks; page reload loses the awaited promise. |
| Payload smuggling | Inputs/outputs ride inside `Task.Description` as `__TASK_METADATA__`/`__TASK_OUTPUT__` markers (`:170-176`, `:533-535`); leaks into search and the detail panel. |
| `@taskX.output` is fiction | Resolved nowhere; the literal string reaches the downstream LLM, which copes only because dependency outputs are also dumped as markdown (`:651-684`). |
| Agent-run mis-link in UI | Gantt maps agent runs via shared `ConversationDetailID` — all siblings link to the same run (`tasks-full-view.component.ts:373-395`). |
| No cycle detection | A cyclic `dependsOn` deadlocks silently: nothing becomes eligible, loop exits, parent completes. |
| Unknown agents silently dropped | `createTasksFromGraph` logs and skips unresolvable `agentName`s (`:140-147`) — the graph executes with holes. |

### Existing machinery this plan builds on

- **Loop response contract + validation/retry correctives** — `loop-agent-response-type.ts:102` (`nextStep.type` union); `createRetryStep` correctives for malformed shapes.
- **Agent-type params bag** — `AIAgent.AgentTypePromptParams` (JSON; schema declared by `AIAgentType.PromptParamsSchema` — see column description at `entity_subclasses.ts:4684-4688`), merged schema-defaults → agent JSON → runtime overrides in `buildAgentTypePromptParams` (`base-agent.ts:6699`), auto-alignment in `applyResponseTypeAutoAlignment` (`:6755`). Loop's schema is `LoopAgentTypePromptParams` + `DEFAULT_LOOP_AGENT_PROMPT_PARAMS` (`loop-agent-prompt-params.ts:170`, `:325`) — and it already carries **behavior** settings, not just docs toggles (`scratchpadMaxTasks: 50`).
- **Per-request provider minting** — `createPerRequestProviders` (`packages/MJServer/src/context.ts:727-760`): a fresh `SQLServerDataProvider`/`PostgreSQLDataProvider` per request over the **shared connection pool** (PG via `ConfigWithSharedPool`), with metadata reuse (`loadIfNeeded=false`). Proves provider instances are cheap and gives the dispatcher its concurrency-isolation mechanism.
- **Pause/resume for HITL** — Plan Mode resolves approval via `MJ: AI Agent Requests` (`base-agent.ts:8066-8113`).
- **Flow traversal** — condition-gated paths via `SafeExpressionEvaluator` (`flow-agent-type.ts:395`), recovery branches (`:1275`), per-step `ActionOutputMapping` (`:841`, `:1036`).
- **Task schema headroom** — `Status`: `Blocked/Cancelled/Deferred/Failed`; `DependencyType`: `Corequisite/Optional`; `UserID` xor `AgentID` validator; `DueAt`, `ProjectID`.
- **Concurrency utility** — `mapWithConcurrency` (`base-agent.ts:8389`).
- **PubSub frame contract** — `resolver: 'TaskOrchestrator'` frames + `routeTaskProgress` survive unchanged.

---

## 3. Target architecture

### 3.1 Conceptual model: definition vs. instance

- **Graph definition** — nodes, edges, conditions, input mappings. Comes from design-time metadata (`MJ: AI Agent Steps` + `Step Paths`) **or** a runtime emission (the `Tasks` primitive, deterministic code, or a human UI). Same logical shape; provenance is irrelevant (D11).
- **Execution instance** — durable state of one run of a *cross-run* graph: `MJ: Tasks` + `MJ: Task Dependencies` rows carrying status, timing, payloads, agent-run links, claims.

**The run-step / task-row boundary (D8).** `AIAgentRunStep` records what happened *inside* one agent run — including Flow agents traversing their design-time graphs. Task rows record *cross-run* orchestration: each graph node is typically its own agent run (or a human), the dispatcher is not an agent, and the graph outlives any single run. So: Flow executing in-run → run steps only, no Task rows. Dispatcher executing a durable graph → Task rows for orchestration state, and each node's agent run keeps its own run steps as usual. The tables are complementary, never duplicated. Task rows additionally carry what run steps never will: human assignment, `DueAt`, project linkage, and the user-facing Gantt/checklist surface.

A runtime-submitted graph is materialized as an **ephemeral flow**: an in-memory flow definition built from the task graph, executed by the shared traversal engine, with orchestration state persisted to Task rows. Nothing is written to `AIAgentStep` tables for runtime graphs.

### 3.2 Components and package layering

```
@memberjunction/ai-core-plus
    └─ TaskGraph types: TaskGraphSpec, TaskGraphNode, validation helpers

@memberjunction/ai-agents
    └─ LoopAgentType: 'Tasks' nextStep type, shape validation + retry correctives,
       single-node constant folding (D9), prompt docs section, enableTaskGraphs
       gate. Emits a validated graph on the run result; DOES NOT submit or execute.

@memberjunction/task-graph   (new; not AI-prefixed per D11)
    ├─ TaskGraphService   — submission: validate (shape, agents resolvable, DAG
    │                       acyclic, limits) + persist + enqueue. Producer-agnostic.
    ├─ TaskGraphDispatcher — durable execution: claim protocol, eligibility,
    │                       bounded-parallel launch, failure/cancel propagation,
    │                       startup reconciliation, HITL waits, continuations.
    │                       Host-agnostic via injected ProviderFactory + AgentRunner.
    └─ (Phase 4) consumes the shared GraphTraversalEngine
       depends on ai-agents (AgentRunner) — legal; ai-agents never imports it

MJServer            — thin resolvers (submit/cancel/retry), run-completion detection
                      shim, PubSub bridge, supplies the ProviderFactory (see 3.4)
MessagingAdapters   — structured-graph delegation strategy (ahead of the text regex)
Scheduling          — drivers hand completed-run graphs to TaskGraphService
Angular             — observer only: subscribes on load, re-attaches to in-flight
                      graphs, renders lifecycle + progress frames
```

**Why the agent emits rather than submits:** direct submission from `BaseAgent` would create `ai-agents → task-graph → ai-agents`. Emitting `nextStep.type: 'Tasks'` ends the turn with the validated graph on the run result; the hosting layer submits. Validation feedback (malformed graph → corrective retry) stays inside the agent loop. An injected `ITaskGraphSubmitter` on `ExecuteAgentParams` is the fallback if a mid-run synchronous submission need ever appears; not in v1.

### 3.3 The `Tasks` primitive (Loop agent type)

**Response contract** — extend `loop-agent-response-type.ts:102`:

```ts
type: 'Actions' | 'ClientTools' | 'Sub-Agent' | 'Chat' | 'Retry' | 'ForEach'
    | 'While' | 'Pipeline' | 'Skill' | 'Plan' | 'Tasks';

nextStep?: {
    // ...existing fields...
    /** Durable task graph to submit. Required when type === 'Tasks'. */
    tasks?: TaskGraphSpec;
}

interface TaskGraphSpec {
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
    /** What happens when the graph finishes. Default 'message'. */
    continuation?: 'message' | 'reinvoke' | 'none';
}
```

**The DAG spec (D16).** `TaskGraphSpec` is not a loosely-typed LLM shape — it is the one fully-qualified TypeScript contract for a DAG, shared by every producer. `LoopAgentType` validates emissions against it (with retry correctives), `TaskGraphService.Submit` re-validates the identical contract server-side, and future producers (a manual workflow builder, a stored workflow definition, deterministic code) author against the same interface. When the broader workflow program adds a stored "definition + trigger" spec object, its graph section IS this type — no translation layer.

**Mental model** (goes in the prompt docs): `subAgents[]` is *ephemeral* fan-out — blocks the run, dies with it. `Tasks` is *durable* fan-out — dependency-ordered, survives the run, visible in the Tasks UI, resumable, can wait on humans.

**Semantics — submit-and-detach:** the step terminates the turn. The dispatcher executes; on completion it posts a results message into the conversation or re-invokes the submitting agent with the outcome as a new turn (Agent Requests resume pattern). No run suspension.

**Continuation contract (review round 2).** What `continuation: 'reinvoke'` actually delivers, so decompose → run → synthesize is a specified path rather than an implied one:
- **Context**: the re-invoked agent gets a fresh turn in the same conversation (full history re-primed, ordinary token cost of a turn) plus a structured continuation message: `workflowName`, the parent task ID, per-task `{name, status, summary}`, and **references** to each task's `OutputPayload`/artifact — not inline dumps; the agent pulls what it needs.
- **Idempotency**: delivery is at-least-once; the continuation message carries the parent task ID and the dispatcher records delivery on the parent row (CAS, like every other state write), so a crash between complete and re-invoke cannot double-deliver silently and a duplicate is detectable and skipped.
- **Cycle bound**: re-invocation chains are bounded separately from graph nesting — a continuation-submitted graph carries `reinvokeDepth = parent.reinvokeDepth + 1`, capped (proposed 5); at the cap the dispatcher forces `continuation: 'message'`. The spawn-depth cap (3) governs graphs *nested by tasks*; this governs graphs *chained by continuations* — both exist because they bound different loops.
- **Synchronous in-turn submission** stays post-v1 (`ITaskGraphSubmitter` fallback, §3.2): detach + reinvoke covers the same outcome across turns, and `subAgents[]` covers the truly-synchronous fan-out case in-run.

**Single-node constant folding (D9):** during `DetermineNextStep`, a graph with exactly one node, no edges, an `agentName` assignment, and default continuation is rewritten into a `Sub-Agent` step and executed in-run — the compiler-flattening analogy: don't spin up loop machinery for a loop of one. Tradeoff accepted: no Task row (matches today's single-task fast path). Folding is skipped when the node is a human task, `continuation` is non-default, or the graph explicitly requests durability (a `durable: true` escape hatch on `TaskGraphSpec` — final name at implementation).

**The fold is recorded, not silent** (review): the `TaskGraph` run step is written for every emitted graph — folded or dispatched — carrying the full `TaskGraphSpec`, a `folded` flag, and the reason. Three consequences: run forensics show why a graph did or didn't reach the dispatcher; a user who edits a two-node graph down to one sees the durability/observability change on the run record instead of inferring it; and Save as Workflow attaches to the recorded spec, so the single-node case — the most common shape a user would want to promote — is promotable like any other graph. Wanting single-node *durability* stays explicit via `durable: true`.

**Opt-in via the params bag (D3):**
- `enableTaskGraphs?: boolean` added to `LoopAgentTypePromptParams` (+ `DEFAULT_LOOP_AGENT_PROMPT_PARAMS`, default **false** per D3) and to the Loop row's `PromptParamsSchema` in `metadata/agent-types/.agent-types.json`.
- Launch opt-ins land as Phase 3 metadata: `"AgentTypePromptParams": { "enableTaskGraphs": true }` on Sage (`metadata/agents/.sage-agent.json`), Query Builder (`.query-builder-agent.json`), and Research Agent + its sub-agents (`.research-agent.json`).
- Per-agent override in `AIAgent.AgentTypePromptParams` JSON, per-run override via runtime params — the existing three-level merge.
- Auto-alignment strips `'Tasks'` from the emitted response-type union when false.
- **Unlike pure docs toggles, this one is enforced**: `LoopAgentType` validation rejects `nextStep.type === 'Tasks'` from a disabled agent with a corrective (defense against prompt drift), making it a real capability gate.
- No `AIAgent` column; no migration on that table.

**Validation + guardrails:** duplicate `tempId` rejection; unresolvable `dependsOn` refs; **DAG acyclicity**; max tasks per graph (proposed 50, matching `scratchpadMaxTasks`); unknown `agentName` fed back to the LLM as a validation failure; graph-spawn depth counter in task metadata (sub-agent `parentDepth` precedent), cap 3; reinvoke-chain cap per the continuation contract above.

### 3.4 Submission service and dispatcher

**`TaskGraphService.Submit(graph, context) → parentTaskId`** — re-validate server-side (source of truth), persist parent + children + dependencies in one transaction, write `InputPayload` to its column, emit `graph-submitted`, return immediately. Producer-agnostic: the same API serves the primitive, the transition shim, deterministic code, and a future manual-workflow UI.

**Provider acquisition (resolves O4).** The dispatcher runs outside any request and executes tasks concurrently, so it must never share one provider/transaction scope across parallel work. The mechanism already exists: `createPerRequestProviders` (`context.ts:727`) mints a fresh provider per HTTP request over the shared connection pool, with metadata reuse — proven cheap at request scale. Plan:
- Extract that core into an exported **`ProviderFactory`** (`CreateProvider(): Promise<DatabaseProviderBase>`) in MJServer.
- `TaskGraphDispatcher` takes the factory as a constructor dependency (dependency inversion — the package never imports MJServer; any host process supplies its own factory, same as `TaskOrchestrator` receives `provider` today).
- **One fresh provider per task execution** → isolated transaction scope and entity instances per parallel run; the underlying pool governs real DB concurrency; pool sizing is the tuning knob.

**Multi-server dispatch (resolves O1).** Per-task atomic claim, portable across SQL Server and Postgres:
- Two new `Task` columns: `ClaimedBy NVARCHAR(100) NULL` (instance identifier), `ClaimExpiresAt DATETIMEOFFSET NULL`.
- Claim = compare-and-swap: `UPDATE Task SET Status='In Progress', ClaimedBy=@instance, ClaimExpiresAt=@t, StartedAt=... WHERE ID=@id AND Status='Pending'` — rowcount 1 wins, 0 means another instance took it. No distributed lock manager.
- Long tasks heartbeat-extend `ClaimExpiresAt`; reconciliation (startup + periodic) treats expired claims as orphaned → reset to `Pending`.
- This one protocol covers horizontal scale-out **and** crash/restart recovery, and is near-free to include from day one even though v1 runs single-instance.

**Task-row integrity under shared writability (D20).** `MJ: Tasks` stays a user-facing entity with generated CRUD while becoming the dispatcher's state store — the §3.4 claim protocol handles dispatcher-vs-dispatcher contention, and this layer handles human-vs-dispatcher writes (a user or an update-record-wielding agent flipping a claimed row's `Status` back to `Pending`, or clearing `ClaimedBy`, would otherwise hand the same work to a second executor while the first still runs). Three defenses, cheapest-first:
1. **Server-side entity-subclass guard** (`MJTaskEntity` server subclass — the `BASE_ENTITY_SERVER_PATTERNS` shape): non-dispatcher writers cannot set `ClaimedBy`/`ClaimExpiresAt`, and `Status` on a claimed row accepts only the legitimate human verbs — `Cancelled` (any task, via the cancel mutation so propagation runs) and `Complete` (human-assigned tasks only). Everything else is a validation failure with a message pointing at the mutations.
2. **CAS-guarded dispatcher writes**: every dispatcher state transition — not just the initial claim — carries `WHERE Status=@expected AND ClaimedBy=@me` + rowcount check, so even a row tampered past the guard makes the stale executor's completion write fail cleanly rather than double-complete; the dispatcher then re-reads and defers to the sweep.
3. **Sweep normalization — agent tasks only**: the reconciliation sweep flags and normalizes anomalous states (`Pending` with a live claim, an *agent* task `In Progress` with no claim, terminal with dependents still `Blocked`), logging loudly. **Human and awaiting-feedback tasks are exempt** (review round 2): a task with `UserID` set never carries a claim — `In Progress` with no claim is its *legitimate* parked shape, and normalizing it would reset an approval out from under the user. Human-task lifecycle is driven by `DueAt` notification/escalation (Phase 4), never by claim expiry. Record Changes already gives the tamper audit trail for free.

**Durable-async succession (D14).** This dispatcher is the durable executor MJ has been missing, and it must not become a *third* async substrate next to MJQueue and fire-and-forget promises. The posture: MJQueue is frozen (its one consumer, after-save Entity AI Actions, migrates or retires on its own track); the #3408 After\*-entity-action durability work (runbook step 9) targets `TaskGraphService` submission instead of `QueueManager.AddTask`; and any future "run X durably" need is a single-node graph, not a new queue. The claim protocol's design deliberately carries the litigated lessons from `plans/scheduled-job-engine-decoupling.md` (the wedged-scheduler post-mortem): bounded-parallel dispatch, never a serial await chain; token-checked state transitions; sweep-driven orphan recovery.

**Payload redaction.** `Task.InputPayload`/`OutputPayload` are persistent payload columns, user-visible in the Tasks UI — a new persister under the #3408 §5.7 invariant (*no path writes a raw `ActionParam[]` to persistent storage*). Any submission path that maps entity-action or action params into task payloads routes them through the shared `RedactParams` helper before persistence. Agent-authored payloads (the primitive's normal case) are the agent's own output and are stored as emitted — but the boundary is stated here so the invariant survives the After\*-routing work (D14) landing on this substrate.

**Reconciliation sweep scope.** Beyond expired claims, the periodic sweep is the natural enforcer for two schema promises that currently have none: `MJ: AI Agent Requests.ExpiresAt` (the schema documents "may be marked Expired by a background process" — no such process exists anywhere today) and, once human tasks land in Phase 4, `Task.DueAt` (overdue notification/escalation). Both are cheap additions to a sweep that already scans task state.

**Execution:** claim eligible tasks → run each via `AgentRunner.RunAgent` with a fresh provider → write `OutputPayload`/`AgentRunID`/`ErrorMessage` → recompute eligibility → repeat. Waves are implicit in claim-based dispatch; `mapWithConcurrency` caps in-process parallelism (proposed default 5).

**Structured I/O:** dependency outputs injected from `OutputPayload`; `@taskX.output` references **actually resolved** by substitution. Markdown dump retained as supplementary context during migration.

**Failure/cancel:** `Failed` → transitive dependents `Blocked`; parent `Failed` unless all children completed. Retry resets a `Failed` task to `Pending` and unblocks. Cancel propagates to non-terminal children and in-flight runs.

**Events:** existing frame contract preserved; graph-lifecycle frames added.

### 3.5 Flow executor convergence + parallel DAG (D6/D7)

**Verified:** `FlowExecutionState.currentStepId` is a single program counter (`flow-agent-type.ts:46`); only `paths[0]` is followed (`:1266`); alternates are consulted only when the destination step is inactive (`:1285`).

**Additions:**
- **Frontier set** (`activeStepIds: Set<string>`); all newly-eligible nodes launch, concurrency-capped.
- **Join semantics**: AND-join default (all satisfied incoming paths complete — exactly `Prerequisite` semantics, which is why the models converge); OR-join ↔ `Optional`; `Corequisite` ↔ co-scheduled nodes.
- **Opt-in mapping (resolves O3)**: design-time flows read `traversalMode: 'sequential' | 'parallel'` from **their own agent-type params bag** — a `FlowAgentTypeParams` schema on the Flow agent type row, using the same `AgentTypePromptParams` column and merge machinery as Loop (the column is generic; its schema is per-type). Default `sequential` for back-compat. **Ephemeral flows constructed from task graphs always set `parallel`** — the ephemeral attribute maps directly onto the traversal mode.

**Convergence:** extract the traversal core (frontier, path/condition evaluation via `SafeExpressionEvaluator`, joins, recovery paths) into a shared **GraphTraversalEngine** with two state backends:
- **In-run** — `FlowAgentType` executes design-time flows inside one agent run, state in memory, recorded as run steps (D8: no Task rows).
- **Durable** — `TaskGraphDispatcher` executes ephemeral flows with state persisted to Task rows across runs, restarts, and human waits.

Task graphs inherit conditional edges, recovery branches, and structured output mapping; Flow inherits parallelism. The bespoke `TaskOrchestrator` loop is retired at the end of Phase 4.

### 3.6 Schema changes (additive; `migrations/v6/` — the folder matches the major version in the migration's own filename)

| Table | Change |
|---|---|
| `Task` | `+ InputPayload NVARCHAR(MAX) NULL`, `+ OutputPayload NVARCHAR(MAX) NULL`, `+ AgentRunID UNIQUEIDENTIFIER NULL` (FK → `AIAgentRun`), `+ ErrorMessage NVARCHAR(MAX) NULL`, `+ ClaimedBy NVARCHAR(100) NULL`, `+ ClaimExpiresAt DATETIMEOFFSET NULL` |
| `Task` indexes | `IX_Task_Status_ClaimExpiresAt (Status, ClaimExpiresAt)` — the dispatcher eligibility scan and the sweep's expired-claim/anomaly queries are the inner loop; `IX_Task_ParentID_Status (ParentID, Status)` — per-graph rollup/progress. `TaskDependency` needs nothing new: `UQ_TaskDependency_Pair (TaskID, DependsOnTaskID)` serves forward lookups and the auto FK index on `DependsOnTaskID` (baseline `IDX_AUTO_MJ_FKEY_TaskDependency_DependsOnTaskID`) serves dependents-of-X (failure propagation). |
| `AIAgentRunStep` | `StepType` CHECK gains **`TaskGraph`** (D10) |

No `AIAgent` changes (D3 moved the setting into the params bag). No new tables. `Status`/`DependencyType` CHECKs already carry the needed values — this plan starts honoring `Blocked`/`Cancelled`/`Failed` and (Phase 4) `Optional`/`Corequisite`. `Description` smuggling ends via a **one-time backfill in the Phase 1 migration** (SQL Server + PG flavors): existing `__TASK_METADATA__`/`__TASK_OUTPUT__` marker rows are parsed into the new columns and the markers stripped from `Description` — no permanent code fallback (review: a fallback parse with no backfill never dies). Standard flow: migration → CodeGen → typed properties.

Metadata (not migration): Loop agent type's `PromptParamsSchema` gains `enableTaskGraphs`; Flow agent type's gains `traversalMode`.

### 3.7 Prompt & metadata migration

- **Sage**: emits graphs via the primitive instead of payload smuggling. Single-agent delegations flow through the same primitive and get constant-folded (D9) — the client-side single-task fork dies, behavior stays equivalent, multi-task graphs become durable server-side executions.
- **Workflow Planner**: role narrows per D4 — kept for complex decomposition and the confirm-then-submit UX; ordinary graph emission no longer routes through it. `@taskX.output` stays in prompts because it becomes real.
- **Replanner (Phase 4 option)**: on failure, the dispatcher may re-invoke a planner agent with graph state to append/reroute — plan → execute → replan.
- The server-side payload sniff bridges old prompts from Phase 2 until Phase 3 migrates them, then dies.

### 3.8 Client changes

- Delete `handleTaskGraphExecution` / `handleSingleTaskExecution` and the `ExecuteTaskGraph` call (D12 — the client is the mutation's only caller; both leave in this phase); render workflow state from lifecycle + progress frames.
- **Re-attach on load**: query active parent tasks for the conversation and subscribe — fixes the unfixable reload-mid-workflow gap.
- Fix `agentRunMap` to use `Task.AgentRunID`; render `Blocked`/`Cancelled`; add cancel/retry affordances.

### 3.9 Save as Workflow — promoting an ephemeral graph (D17)

The convergence runs both directions. Phase 4 converts runtime graphs *into* ephemeral flows for execution; the same shape-equivalence makes the inverse nearly free: **persist a runtime graph as a design-time flow** the user can rerun, schedule, or hand to the Agent Manager to refine.

- **Converter**: `TaskGraphSpec` → `AgentSpec` (Flow type; nodes → `Steps` with Sub-Agent/Action assignments, edges → `Step Paths`; `inputPayload` mappings → step input mappings) → `AgentSpecSync.Persist`. No new persistence machinery — AgentSpecSync already owns atomic multi-entity agent writes and the mutation audit.
- **Surfaces**:
  - *Agent Run admin UI* — the `TaskGraph` run-step node (D10) renders the submitted graph; a "Save as Workflow" action sits on it. Written for folded single-node graphs too (D9), so they are equally promotable.
  - *ng-conversations* — when a completed agent run carries 1+ recorded task graphs (dispatched **or** folded), surface a lightweight affordance on the message/plan card ("Save this approach as a Workflow"). The UX challenge is worth design attention: this is the moment a one-off agent plan becomes reusable organizational automation.
- **Naming per D18**: the affordance says *Workflow*, the persisted artifact is a Flow-type agent.
- **Fidelity note**: human-task nodes persist as human-assigned steps once Phase 4 lands them; `continuation` semantics don't persist (a saved workflow is invoked, not continued). The converter states what it drops.
- **Phase**: after Phase 4's engine convergence (the graph→flow mapping must be settled first); the converter + both surfaces are a bounded follow-on deliverable listed there.

---

## 4. Phases

### Track R (parallel) — `BaseAgent.ts` decomposition (D13)

`base-agent.ts` is a ~14.4k-line monolith. Staged, behavior-preserving extraction into composed helper classes, ordered lowest-risk first, with test parity at each stage — landing **before Phase 3** touches the same code. Candidate seams (each already a coherent cluster):

| Helper | Today (approx.) |
|---|---|
| `SubAgentOrchestrator` — resolve/execute child & related sub-agents, parallel fan-out, payload up/downstream mapping | `:6933-7100`, `:9224-10700` |
| `IterationExecutor` — ForEach/While loops, sequential/parallel iteration, result injection/expiry | `:12229-13080` |
| `PromptStepRunner` — prompt execution + inline side-effects (payload change, scratchpad, artifact/conversation tools, memory writes) | `:8528-9060` |
| `PlanModeGate` — plan-mode resolution + approval-form construction | `:8066-8113`, `:11754-11850` |
| `RunStepPersister` — step entity lifecycle, input/output snapshots, run-tree stamping | scattered |
| `GuardrailMonitor` — failed/unproductive/validation counters | `:329-360` + checks |
| `MessageWindowManager` — pruning/compaction/expiration | scattered |

Constraints: `BaseAgent`'s public/protected API stays stable (subclasses exist via `DriverClass`); helpers are instance-composed (not static), receive a context object, follow the repo's functional-decomposition and naming rules. Each extraction is its own PR with vitest parity + the integration tier green.

### Phase 0 — Legacy retirement (the v6 window is open now)

1. Migration (+ PG counterpart) dropping the dead Skip-era workflow schema: `Workflow`, `WorkflowRun`, `WorkflowEngine` tables + their `MJ: Workflows` / `MJ: Workflow Runs` / `MJ: Workflow Engines` entities and generated forms. Nothing outside generated code reads or writes any of them; the `SubclassName`-referenced `WorkflowBase` class does not exist in the repo.
2. **The Skip-era `Report*` family goes in the same sweep** (scope expanded 2026-08-06): `Report`, `ReportCategory`, `ReportSnapshot`, `ReportUserState`, `ReportVersion` tables + their five `MJ: Report*` entities and generated forms. Verified self-contained: every inbound `ReportID` FK is within the family (Snapshot/UserState/Version → Report); the only non-generated consumers are `MJServer`'s `ReportResolver` (delete it — removing the `GetReportData` query and `CreateReportFromConversationDetailID` mutation is a **breaking external-surface change accepted under the same v6-window standard as D12**; the latter has no callers) and the `Reports` resource-type row (`metadata/resource-types/`, `DriverClass: ReportResource`) + its Explorer wiring (`shared.service.ts`) — retire both. Dropping the whole family **subsumes** the previously planned column drops (`Report.OutputWorkflowID`, `Report.OutputTriggerTypeID`) and avoids regenerating `spCreateReport`/`spUpdateReport` for column removal.

   Additional verified surface for the implementer (2026-08-06 recon):
   - **`ReportResource` does not exist.** The resource-type row names a `DriverClass` with no class behind it anywhere in the repo — the same dangling-driver shape as `WorkflowBase`. The renderer is already gone; what remains is wiring that resolves to nothing.
   - **`GraphQLDataProvider.GetReportData` (`graphQLDataProvider.ts:474-492`) also goes.** This is a public method on the client data provider — the more consequential half of the external break, since consumers call it directly rather than through the resolver.
   - **Explorer wiring beyond `shared.service.ts`:** the `/app/:appName/report/:reportId` route (`app-routing.module.ts:337-350`), `TabService.OpenReport` (`tab.service.ts:110-117`), the `'Reports'` resource-type branches in `shell.component.ts:2624` and `tab-container.component.ts:2640`, and the `Reports` branch of the dashboard add-item picker (`single-dashboard/Components/add-item/`).
3. Same sweep: `MJ: Scheduled Actions` + `MJ: Scheduled Action Params` and `packages/Actions/ScheduledActions{,Server}` (the legacy cron due-check is mathematically always-false — `scheduler.ts:159-171`, `cronParser.next()` is strictly after `evalTime` — and nothing in-repo hosts the Express app; `MJ: Scheduled Jobs` supersedes it), plus `MJ: Output Trigger Types` (its sole referencer was `Report`, which is now gone entirely).
4. **Not** in this sweep: Entity AI Actions — deprecated but still live in the save path; absorption belongs with the After\*-durability work (D14).
5. CodeGen + metadata removal (entities, resource types, permissions); `mj sync` state consistent.

**Exit:** the legacy tables/entities/forms/resolver are gone, builds and integration tier green — and the name **Workflow** is freed for D18.

### Phase 1 — Truthful engine
1. Migration: `Task` columns + `AIAgentRunStep.StepType` value (+ CodeGen).
2. `TaskOrchestrator`: structured payload columns (the migration's one-time backfill converts legacy marker rows — no fallback parse in code); failure propagation; cycle detection; unknown-agent hard error; wave parallelization with cap *(the eligibility logic carries into the dispatcher unchanged)*.
3. UI: `AgentRunID` links; `Blocked`/`Failed` rendering.

**Exit:** parallel branches parallelize; failures block dependents and fail the parent honestly; payloads are columns; Gantt links correct runs.

### Phase 2 — Placement
1. Extract `@memberjunction/task-graph` (Service + Dispatcher); MJServer exposes submit/cancel/retry resolvers; **`ExecuteTaskGraph` and the client-driven path removed** (D12).
2. Dispatcher with claim protocol (`ClaimedBy`/`ClaimExpiresAt` CAS), heartbeat, startup/periodic reconciliation; `ProviderFactory` extraction + injection.
3. Server-side detection shim at the three seams (MJServer run path, `BaseMessagingAdapter` — structured strategy ahead of the regex, Scheduling drivers).
4. Client observer refactor + re-attach.

**Exit:** Slack multi-step executes end-to-end; reload re-attaches; restart resumes; two server instances don't double-run a task.

### Phase 3 — The primitive
1. Types in `ai-core-plus`; `'Tasks'` in the union; validation + correctives; `TaskGraph` run-step persistence; single-node constant folding (D9).
2. `enableTaskGraphs` in Loop params (code default **false** + `PromptParamsSchema` metadata), auto-alignment, enforced gate; prompt docs section; launch opt-in metadata for Sage, Query Builder, Research Agent + its sub-agents (D3).
3. Detach semantics + continuations; approval-gated graphs via Agent Requests.
4. Guardrails (task cap, spawn depth, reinvoke-chain cap).
5. Sage + Workflow Planner prompt migration; payload sniff removed.

**Exit:** any opted-in Loop agent emits durable graphs directly; single-node graphs fold to in-run execution; Sage no longer payload-smuggles.

### Phase 4 — Convergence
1. Extract `GraphTraversalEngine` from `FlowAgentType` (pure refactor, parity-tested).
2. Frontier + joins + concurrency; Flow `traversalMode` in its params bag (default sequential); ephemeral flows always parallel.
3. Dispatcher adopts the engine; conditional edges, recovery branches, structured output mapping.
4. Human task nodes end-to-end (assignment, notification, complete-to-unblock; approval-as-human-task for headless). Notification delivery goes through `NotificationEngine` with a typed notification definition in `metadata/notifications/` — the User Routine dispatcher's delivery path is the template; the Scheduling package's stubbed `NotificationManager` ("Would send…") is the anti-pattern this explicitly avoids. **Assignment authorization is deferred to [#3524](https://github.com/MemberJunction/MJ/issues/3524)**; until it lands, human tasks ship self-assignment only (the graph's owning user) — cross-user assignment is rejected at submission validation. Optional: replanner hook.
5. Retire the bespoke `TaskOrchestrator` loop.
6. **Save as Workflow** (§3.9/D17): the `TaskGraphSpec` → Flow-agent converter via `AgentSpecSync`, surfaced in the Agent Run admin UI (`TaskGraph` node) and ng-conversations (completed-run detection).

**Exit:** one traversal engine for both provenances; graphs can contain humans; parallel semantics identical everywhere.

### Phase 5 — Workflow UX (D19): see it, edit it, watch it run

An intentional UX effort, not a trailing cleanup — it addresses the authoring/observability gaps the whole-repo study documented (fragmented surfaces, buried editor, no live graph view) and makes the new engine abilities usable by business users. Base: `@memberjunction/ng-flow-editor` (Foblex Flow + Dagre; generic `FlowEditorComponent` + `FlowAgentEditorComponent`/`AgentFlowTransformerService`) — upgraded in place.

1. **Editor upgrade — express everything the engine can now do.**
   - Parallel semantics: render fan-out visibly; per-step **join type** (AND default / OR ↔ `Optional`; `Corequisite` as co-scheduled) editable on the node; the flow-level `traversalMode` toggle (params bag) with a clear "sequential (legacy) / parallel" affordance; concurrency cap surfaced.
   - **Human-task nodes** as a first-class node type (assignee/role, DueAt) once Phase 4 lands them.
   - Path-condition editing with validation feedback (SafeExpressionEvaluator syntax), recovery-path visualization, and inline graph validation (cycle detection, unreachable nodes, unknown agents) using the same `TaskGraphSpec` validators the engine uses — one validation story, surfaced at author time.
2. **Runtime overlay — the same canvas watches a run.** Per-node live status (pending/running/complete/failed/blocked/awaiting-human) driven by BaseEntity events over `AIAgentRunStep` rows (in-run flows) and `MJ: Tasks` rows (durable graphs) — the agent-run form's existing live-step subscription is the proven mechanism. This is the convergence point with the Tasks Gantt/checklist: one graph renderer, design-time and runtime, replacing two silos. The Agent Run admin UI's `TaskGraph` node (D10) opens this view; **Save as Workflow** (§3.9) is an action on it.
3. **Entry points and terminology (D18).**
   - A first-class **"Create Workflow"** entry (navigation + Agent Manager hand-off) that lands on the canvas — killing the save-the-agent-record-first requirement (`UIFormSectionKey` mount stays for the record-form context, but stops being the only door).
   - The D18 vocabulary sweep across the touched surfaces: *Workflow* in nav, buttons, empty states; *Flow Agent* remains in metadata/dev docs.
4. **Read-only ≠ invisible**: the viewer (not editor) embeds anywhere a graph is referenced — ng-conversations plan cards, the Tasks view, run history — via the existing `ReadOnly` mode.

5. **Design source — the mockups are the contract.** The approved direction lives at [`mockups/workflow-ux/phase5-overview-v1.html`](../mockups/workflow-ux/phase5-overview-v1.html) — four views: (A) the editor canvas with parallel fan-out, AND-join badge, human-task node, recovery path, traversal toggle + concurrency cap, live validation; (B) the runtime overlay on the same canvas with per-step status, activity feed, and Save as Workflow on an agent-planned run; (C) the chat plan cards (running + completed, with the Save as Workflow moment); (D) the "Create Workflow" front door (Blank / Describe it / From a past run). As each screen's design is locked through iteration, the full-resolution per-screen mockup is added to `mockups/workflow-ux/` and **implemented end to end within this phase** — mockup → component → Playwright verification, one screen at a time. Verification posture (review): Playwright asserts **structure and behavior** — nodes/joins/toggles present, validation states, status transitions, vocabulary rule — plus a *small deliberate set* of visual baselines for each screen's identity-defining shots; blanket pixel-diffing against the mockup is explicitly not the bar, because it's the most brittle test class there is. The mockup remains the design contract; the suite verifies the contract's substance. The mockups already apply the D18 vocabulary rule (no "graph"/"DAG"/"node" on end-user surfaces); implementations must not regress it.

Scope boundary: the broader authoring front doors (the "Automations" wizard, unified run inbox, agent-facing draft-then-confirm tools) remain program Track F (`plans/unified-workflow.md`) — Phase 5 is specifically the workflow viewer/editor and its entry points, shipped with the engine so the new abilities are never invisible.

**Exit:** a business user can create, understand, and edit a parallel workflow with human steps entirely on the canvas; a running workflow (either provenance) is watchable live on the same canvas; "Save as Workflow" round-trips through it; every shipped screen matches its locked mockup.

---

## 5. Resolved questions & remaining risks

Resolved this review round:

| Was | Resolution |
|---|---|
| O1 multi-server dispatch | Per-task CAS claim columns + heartbeat + expired-claim reconciliation (§3.4). Included from day one; doubles as crash recovery. |
| O2 headless approval | As proposed: interactive channels keep planner confirmation; scheduled/headless auto-run unless the agent has `RequirePlanMode`, in which case approval materializes as an Agent Request / human task. |
| O3 flow parallel opt-in | `traversalMode` in the Flow agent type's params bag; ephemeral graphs always parallel (§3.5). |
| O4 connection/transaction isolation | `ProviderFactory` extracted from `createPerRequestProviders`, injected into the dispatcher; one fresh provider per task run over the shared pool (§3.4). |
| O5 everything-is-a-graph overhead | Single-node constant folding in `LoopAgentType` (D9). |
| O6 step type name | `TaskGraph` (D10). |
| O7 package naming | Not AI-prefixed — producer-agnostic DAGs (D11). |
| O8 `ExecuteTaskGraph` compat | Removed immediately in Phase 2 as a deliberate, accepted v6 breaking change — sole known (internal) caller leaves in the same phase (D12). |

Remaining risks:

| # | Risk | Mitigation |
|---|---|---|
| R1 | Claim-protocol edge cases (clock skew across instances, heartbeat failure vs. slow task) | Generous claim TTL + monotonic extension; reconciliation only reclaims *expired* claims; integration test with two dispatcher instances. |
| R2 | Pool exhaustion under wide parallel waves | Dispatcher concurrency cap independent of pool size; pool sizing documented as the tuning knob; backpressure = tasks simply stay `Pending`. |
| R3 | Graphs-spawning-graphs runaway | Depth cap 3 + per-graph task cap 50; both configurable. |
| R4 | Track R regressions in `BaseAgent` | Stage-per-PR with vitest parity + integration tier; extraction order lowest-risk first; public/protected API frozen. |
| R5 | Prompt drift during the Phase 2→3 window (old prompts + new engine) | Payload sniff shim keeps old prompts working until migrated; removal gated on Sage/planner prompt PRs landing. |
| R6 | Convergence: the in-run and durable traversal backends may resist sharing one `GraphTraversalEngine` core | **Accepted, drive forward** (review round 2 ruling): Flow is the only graph path in production use today and Phase 4.1 gates on extraction parity before any behavior change. Natural fallback if unification fights back: the dispatcher keeps its Phase 2 loop and convergence is retried later — Save as Workflow and the Phase 5 runtime overlay depend on the `TaskGraphSpec` shape, not on shared execution internals, so neither is stranded. |

---

## 6. Testing strategy

- **Unit:** graph validation (cycles, dupes, unknown agents, caps); eligibility/claim CAS semantics; failure/cancel matrices; join semantics; `@taskX.output` resolution; params-bag merge + auto-alignment + enforced gate; constant-folding decision table; Flow traversal parity before/after engine extraction.
- **Integration (deterministic tier):** new bundle *"ITxx — Task Graph Orchestration"*: submit → claim → parallel wave → induced failure → `Blocked` → retry → complete; restart reconciliation; two-instance no-double-run; messaging-adapter structured delegation; client re-attach against the streaming contract.
- **Prompt/E2E:** Sage single-node fold + multi-node durable paths; planner confirm-then-submit; disabled-agent emitted interface contains no `'Tasks'`.

---

## Appendix — primary source index

Line references are pinned to the study baseline: `next` @ `d26e202e7` (2026-08-05). Expect drift as `next` moves — treat symbols as authoritative and line numbers as hints. Corrections from review applied: `base-agent.ts` is **14,437** lines at baseline (not "~13k"); the Entity-Action filter stub spanned `ActionEngine.ts:308-310` at baseline (since replaced by the PR #3525 hotfix — filters now evaluate, fail-closed).

**Post-baseline drift review (2026-08-06, `next` @ `7f18ea992`).** Every load-bearing claim re-verified against the 124 commits since baseline. Unchanged: `TaskOrchestrator`, the Explorer client's task-graph path, `BaseMessagingAdapter`, the Scheduling drivers, `MJQueue`, `loop-agent-response-type.ts`, `flow-agent-type.ts`, the `AIAgentRunStep.StepType` CHECK (no collisions with `TaskGraph`), `createPerRequestProviders` (the `context.ts` changes in range are API-key auth only), `Report.OutputWorkflowID`, and all Phase 0 drop targets. Drifted but immaterial: `base-agent.ts` gained ~100 lines (guardrail interrupts, memory-write scope fix, harness accounting anchor) — Track R's approximate seam ranges shift accordingly. **New and material: the external agent harness (#3412) merged** — a fourth agent type whose `HarnessAgentType extends LoopAgentType`, covered by the D3 note above. Phase 0/1 migration timestamps must sort after `V202608052115` (the highest v6 migration — `Metadata_Sync_GPT55_APIName_Fix`; an earlier revision of this note said `V202608051834`, which is one migration stale).

| Concern | Location |
|---|---|
| Loop response union | `packages/AI/Agents/src/agent-types/loop-agent-response-type.ts:102` |
| Params bag: interface/defaults, merge, auto-alignment | `loop-agent-prompt-params.ts:170`, `:325`; `base-agent.ts:6699`, `:6755`; column doc `entity_subclasses.ts:4684-4688` |
| Per-request provider minting | `packages/MJServer/src/context.ts:727-760` (+ PG `ConfigWithSharedPool` `:766-833`) |
| Plan Mode / Agent Requests gate | `base-agent.ts:8066-8113` |
| Parallel sub-agents / concurrency util | `base-agent.ts:273`, `:8389`, `:10208` |
| Flow single-threaded evidence | `flow-agent-type.ts:46`, `:1266`, `:1285` |
| Flow conditions / recovery / output mapping | `flow-agent-type.ts:395`, `:1275`, `:841`, `:1036` |
| Orchestrator persistence/exec/artifacts | `packages/MJServer/src/services/TaskOrchestrator.ts:106-218`, `:303-351`, `:479-592`, `:707-788` |
| Client detection + execution | `message-input.component.ts:1766`, `:1873-2033`, `:2159-2250`, `:2644` |
| Messaging gap | `BaseMessagingAdapter.test.ts:571-595` |
| Scheduling gap | `UserRoutineDispatcherDriver.ts:422-458` |
| Task schema + validators | `entity_subclasses.ts:110746`, `:110765-110790`, `:110495` |
| Streaming routing | `ConversationStreaming.ts:309-364` |
| Sage / planner prompts | `metadata/prompts/templates/sage/*.md`; `metadata/agents/.sage-agent.json:571-667` |
