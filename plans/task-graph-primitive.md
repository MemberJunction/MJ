# Task Graphs as an Agent Primitive — Design Plan

**Status:** Draft v4 — v3 added the what/when program framing, the DAG-spec contract (D16), durable-async succession over MJQueue (D14), the Pipeline boundary (D15), payload-redaction posture, reconciliation-sweep scope, and the human-task notification path; v4 renames the contract to **`TaskGraphSpec`** (aligned with `AgentSpec`), adds **Save as Workflow** (§3.9/D17), and the **"Workflow" user-facing terminology** decision (D18)
**Date:** 2026-08-05
**Origin:** Architecture study of the Sage → Workflow Planner → TaskOrchestrator pipeline (session `claude/sage-task-graph-study-4uvtrc`)

---

## 1. Summary

MemberJunction already has a durable, dependency-aware plan-execution substrate — the `MJ: Tasks` / `MJ: Task Dependencies` schema, the `TaskOrchestrator`, a Gantt/checklist UI, PubSub progress streaming, and completion notifications. Today that substrate is reachable only as a UI convenience of one Angular component: the Explorer conversation client detects a `taskGraph` in an agent's payload and drives execution through a single long-lived GraphQL mutation. Every other channel (Slack/Teams, scheduled routines, headless API) silently drops the plan, the agent framework itself has zero knowledge that Tasks exist, and the executor uses a fraction of what its own schema supports.

**Why now — the LLM-capability context.** When Sage, the Workflow Planner, and the task-graph concept were originally built, model capability was far below where it is today. Reliable decomposition needed a dedicated planning specialist with a narrow prompt. That assumption no longer holds: a reasonably smart mid-sized model can emit a useful, well-formed task graph directly in its response as a matter of course. That shifts the design center — graph emission becomes an ordinary, default-on capability of any Loop agent, while the Workflow Planner survives as an *optional* specialist for genuinely complex decomposition (and its confirmation UX), needed rarely rather than routinely.

This plan makes task graphs a first-class capability of the platform:

1. **Execution moves server-side and becomes invocation-agnostic** — submission split from execution; a durable dispatcher runs graphs regardless of origin; all clients are observers via the existing PubSub plumbing.
2. **`Tasks` becomes a Loop-agent primitive** side-by-side with `ForEach`/`While`, gated by an `enableTaskGraphs` setting in the agent-type params bag (`AIAgent.AgentTypePromptParams`), **default on**, with prompt documentation injected/stripped via the existing include-docs + auto-alignment mechanism.
3. **The Flow traversal engine becomes the one graph executor.** A runtime LLM-emitted graph is converted into an *ephemeral flow* and run by the same engine that runs design-time flows. Flow gains parallel DAG execution (it is strictly single-threaded today); task graphs gain Flow's conditional paths and recovery branches. Single-node graphs are *constant-folded* into direct in-run execution.
4. **Human-in-the-loop is native**: `MJ: AI Agent Requests` is the pause/resume mechanism for approvals, and the Task schema's existing `UserID`-xor-`AgentID` design makes *human tasks* first-class graph nodes that block downstream agent work.
5. **`BaseAgent.ts` is decomposed** from a ~13k-line monolith into composed helper classes as a parallel track, landing before/alongside the primitive work that touches it.

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
| D3 | `Tasks` is a new Loop-agent primitive alongside `ForEach`/`While`. Opt-in/out lives in the **agent-type params bag** (`AIAgent.AgentTypePromptParams`, schema per agent type via `AIAgentType.PromptParamsSchema`) as `enableTaskGraphs`, **default on** — *not* a column on `AIAgent`, since the capability is Loop-specific. Auto-alignment strips the `nextStep` type from the emitted response interface when disabled, and `LoopAgentType` validation rejects the step type when disabled (capability gate, not just docs). |
| D4 | Capability is **not** granted by attaching the Workflow Planner sub-agent. With current-generation models, any opted-in Loop agent emits graphs directly; the planner remains an optional specialist for complex decomposition and confirmation UX — rarely needed. |
| D5 | `MJ: AI Agent Requests` is the pause/resume mechanism for HITL approval gates (Plan Mode precedent). |
| D6 | The Flow graph executor is the executor that is kept. Dynamic instructions are converted into an **ephemeral flow** and executed by the shared traversal engine. Useful pieces of the current `TaskOrchestrator` (wave computation, transactional persistence, artifact creation, PubSub frames) carry over. |
| D7 | Flow gains **parallel DAG execution** — verified today it is single-threaded (single `currentStepId`; only `paths[0]` followed). Frontier-set traversal + join semantics + concurrency cap are added. Design-time flows opt in via their params bag (`traversalMode`); ephemeral flows built from task graphs are always parallel. |
| D8 | **Task rows are NOT written for in-run Flow execution.** `AIAgentRunStep` already records intra-run execution. The boundary: **run steps = intra-run forensics; Task rows = cross-run durable work items** (dispatcher state, human tasks, UI). Neither replaces the other; nothing is double-written. |
| D9 | **Single-node graphs are flattened** ("constant folding"): a one-task, zero-edge, agent-assigned graph with default continuation semantics is compiled by `LoopAgentType` into the underlying primitive (a `Sub-Agent` step) and executed in-run — no Task row, no dispatcher hop. Flattening is skipped for human tasks, non-default continuations, or when durability is explicitly requested. |
| D10 | The run-step type for graph submission is **`TaskGraph`** (clearer than `Tasks`); type-union recompiles are a non-issue. |
| D11 | Package naming is **not** AI-prefixed (`@memberjunction/task-graph`): the submission API is producer-agnostic — an LLM, deterministic code, or a human UI can all construct and submit a DAG. |
| D12 | `ExecuteTaskGraph` mutation and the client-driven execution path are **removed immediately** in Phase 2 — no adoption exists, so no compat window. (The server-side payload-sniff shim still bridges prompts until Phase 3 migrates them.) |
| D13 | `BaseAgent.ts` is refactored into composed helper classes as part of this program (parallel track R), behavior-preserving, staged ahead of the Phase 3 changes that touch it. |
| D14 | **The dispatcher's claim protocol is MJ's durable-async substrate going forward.** `MJQueue`'s durability is illusory today (rows written, never read back; no restart reclaim, no cross-process pickup) and it is not extended. New durable work targets `TaskGraphService` submission — a single-node durable graph is exactly "run this action durably with retry" — including the #3408 plan's After\*-entity-action routing (its runbook step 9), which re-targets here instead of `QueueManager`. MJQueue is absorbed/retired on its own track. |
| D15 | **Pipelines and task graphs stay separate primitives.** A Pipeline (`plans/tool-pipelines.md`) is a single-turn, in-run *data* program — one value out, no durable state. A task graph is durable, multi-run *work* orchestration. Neither grows toward the other; an agent that needs both emits both. |
| D16 | **`TaskGraphSpec` is the fully-qualified DAG spec.** One TS contract in `ai-core-plus` that every producer authors against — the LLM primitive, deterministic code, a human UI, and (future, out of scope here) stored workflow definitions that bind a graph to triggers. Server-side validation in `TaskGraphService` validates against this same contract; there is no looser internal shape. The `Spec` suffix aligns with `AgentSpec`: it memorializes a graph, it doesn't merely request execution. |
| D17 | **"Save as Workflow" — an ephemeral graph can be promoted to a design-time flow.** Because a runtime `TaskGraphSpec` and a design-time flow are the same logical shape (§3.1), a converter (`TaskGraphSpec` → `AgentSpec` with Flow type + Steps/Paths → `AgentSpecSync.Persist`) turns a Loop agent's dynamic approach into a reusable, schedulable flow agent. Surfaced wherever a run's graph is visible: the Agent Run admin UI (via the new `TaskGraph` run-step node) and ng-conversations (detect 1+ graphs on a completed run → offer "Save as Workflow"). See §3.9. |
| D18 | **"Workflow" is the user-facing noun; "Flow Agent" stays the implementation term.** UI surfaces (navigation, save-as affordance, authoring entry points, docs for business users) say *Workflow* — a deterministic pathway that can include AI steps. No schema/entity/agent-type rename; this is vocabulary, applied at the UX layer. The v6 retirement of the dead legacy `Workflow` tables frees the name. |

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

**Single-node constant folding (D9):** during `DetermineNextStep`, a graph with exactly one node, no edges, an `agentName` assignment, and default continuation is rewritten into a `Sub-Agent` step and executed in-run — the compiler-flattening analogy: don't spin up loop machinery for a loop of one. Tradeoff accepted: no Task row (matches today's single-task fast path). Folding is skipped when the node is a human task, `continuation` is non-default, or the graph explicitly requests durability (a `durable: true` escape hatch on `TaskGraphSpec` — final name at implementation).

**Opt-in via the params bag (D3):**
- `enableTaskGraphs?: boolean` added to `LoopAgentTypePromptParams` (+ `DEFAULT_LOOP_AGENT_PROMPT_PARAMS`, default **true**) and to the Loop row's `PromptParamsSchema` in `metadata/agent-types/.agent-types.json`.
- Per-agent override in `AIAgent.AgentTypePromptParams` JSON, per-run override via runtime params — the existing three-level merge.
- Auto-alignment strips `'Tasks'` from the emitted response-type union when false.
- **Unlike pure docs toggles, this one is enforced**: `LoopAgentType` validation rejects `nextStep.type === 'Tasks'` from a disabled agent with a corrective (defense against prompt drift), making it a real capability gate.
- No `AIAgent` column; no migration on that table.

**Validation + guardrails:** duplicate `tempId` rejection; unresolvable `dependsOn` refs; **DAG acyclicity**; max tasks per graph (proposed 50, matching `scratchpadMaxTasks`); unknown `agentName` fed back to the LLM as a validation failure; graph-spawn depth counter in task metadata (sub-agent `parentDepth` precedent), cap 3.

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
| `AIAgentRunStep` | `StepType` CHECK gains **`TaskGraph`** (D10) |

No `AIAgent` changes (D3 moved the setting into the params bag). No new tables. `Status`/`DependencyType` CHECKs already carry the needed values — this plan starts honoring `Blocked`/`Cancelled`/`Failed` and (Phase 4) `Optional`/`Corequisite`. `Description` smuggling ends; readers keep a fallback parse for pre-migration rows. Standard flow: migration → CodeGen → typed properties.

Metadata (not migration): Loop agent type's `PromptParamsSchema` gains `enableTaskGraphs`; Flow agent type's gains `traversalMode`.

### 3.7 Prompt & metadata migration

- **Sage**: emits graphs via the primitive instead of payload smuggling. Single-agent delegations flow through the same primitive and get constant-folded (D9) — the client-side single-task fork dies, behavior stays equivalent, multi-task graphs become durable server-side executions.
- **Workflow Planner**: role narrows per D4 — kept for complex decomposition and the confirm-then-submit UX; ordinary graph emission no longer routes through it. `@taskX.output` stays in prompts because it becomes real.
- **Replanner (Phase 4 option)**: on failure, the dispatcher may re-invoke a planner agent with graph state to append/reroute — plan → execute → replan.
- The server-side payload sniff bridges old prompts from Phase 2 until Phase 3 migrates them, then dies.

### 3.8 Client changes

- Delete `handleTaskGraphExecution` / `handleSingleTaskExecution` and the `ExecuteTaskGraph` call (D12 — no adoption, no compat window); render workflow state from lifecycle + progress frames.
- **Re-attach on load**: query active parent tasks for the conversation and subscribe — fixes the unfixable reload-mid-workflow gap.
- Fix `agentRunMap` to use `Task.AgentRunID`; render `Blocked`/`Cancelled`; add cancel/retry affordances.

### 3.9 Save as Workflow — promoting an ephemeral graph (D17)

The convergence runs both directions. Phase 4 converts runtime graphs *into* ephemeral flows for execution; the same shape-equivalence makes the inverse nearly free: **persist a runtime graph as a design-time flow** the user can rerun, schedule, or hand to the Agent Manager to refine.

- **Converter**: `TaskGraphSpec` → `AgentSpec` (Flow type; nodes → `Steps` with Sub-Agent/Action assignments, edges → `Step Paths`; `inputPayload` mappings → step input mappings) → `AgentSpecSync.Persist`. No new persistence machinery — AgentSpecSync already owns atomic multi-entity agent writes and the mutation audit.
- **Surfaces**:
  - *Agent Run admin UI* — the `TaskGraph` run-step node (D10) renders the submitted graph; a "Save as Workflow" action sits on it.
  - *ng-conversations* — when a completed agent run carries 1+ task graphs, surface a lightweight affordance on the message/plan card ("Save this approach as a Workflow"). The UX challenge is worth design attention: this is the moment a one-off agent plan becomes reusable organizational automation.
- **Naming per D18**: the affordance says *Workflow*, the persisted artifact is a Flow-type agent.
- **Fidelity note**: human-task nodes persist as human-assigned steps once Phase 4 lands them; `continuation` semantics don't persist (a saved workflow is invoked, not continued). The converter states what it drops.
- **Phase**: after Phase 4's engine convergence (the graph→flow mapping must be settled first); the converter + both surfaces are a bounded follow-on deliverable listed there.

---

## 4. Phases

### Track R (parallel) — `BaseAgent.ts` decomposition (D13)

`base-agent.ts` is a ~13k-line monolith. Staged, behavior-preserving extraction into composed helper classes, ordered lowest-risk first, with test parity at each stage — landing **before Phase 3** touches the same code. Candidate seams (each already a coherent cluster):

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

### Phase 1 — Truthful engine
1. Migration: `Task` columns + `AIAgentRunStep.StepType` value (+ CodeGen).
2. `TaskOrchestrator`: structured payload columns (Description fallback read only); failure propagation; cycle detection; unknown-agent hard error; wave parallelization with cap *(the eligibility logic carries into the dispatcher unchanged)*.
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
2. `enableTaskGraphs` in Loop params (code defaults + `PromptParamsSchema` metadata), auto-alignment, enforced gate; prompt docs section.
3. Detach semantics + continuations; approval-gated graphs via Agent Requests.
4. Guardrails (task cap, spawn depth).
5. Sage + Workflow Planner prompt migration; payload sniff removed.

**Exit:** any opted-in Loop agent emits durable graphs directly; single-node graphs fold to in-run execution; Sage no longer payload-smuggles.

### Phase 4 — Convergence
1. Extract `GraphTraversalEngine` from `FlowAgentType` (pure refactor, parity-tested).
2. Frontier + joins + concurrency; Flow `traversalMode` in its params bag (default sequential); ephemeral flows always parallel.
3. Dispatcher adopts the engine; conditional edges, recovery branches, structured output mapping.
4. Human task nodes end-to-end (assignment, notification, complete-to-unblock; approval-as-human-task for headless). Notification delivery goes through `NotificationEngine` with a typed notification definition in `metadata/notifications/` — the User Routine dispatcher's delivery path is the template; the Scheduling package's stubbed `NotificationManager` ("Would send…") is the anti-pattern this explicitly avoids. Optional: replanner hook.
5. Retire the bespoke `TaskOrchestrator` loop.
6. **Save as Workflow** (§3.9/D17): the `TaskGraphSpec` → Flow-agent converter via `AgentSpecSync`, surfaced in the Agent Run admin UI (`TaskGraph` node) and ng-conversations (completed-run detection).

**Exit:** one traversal engine for both provenances; graphs can contain humans; parallel semantics identical everywhere.

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
| O8 `ExecuteTaskGraph` compat | Removed immediately in Phase 2; no adoption exists (D12). |

Remaining risks:

| # | Risk | Mitigation |
|---|---|---|
| R1 | Claim-protocol edge cases (clock skew across instances, heartbeat failure vs. slow task) | Generous claim TTL + monotonic extension; reconciliation only reclaims *expired* claims; integration test with two dispatcher instances. |
| R2 | Pool exhaustion under wide parallel waves | Dispatcher concurrency cap independent of pool size; pool sizing documented as the tuning knob; backpressure = tasks simply stay `Pending`. |
| R3 | Graphs-spawning-graphs runaway | Depth cap 3 + per-graph task cap 50; both configurable. |
| R4 | Track R regressions in `BaseAgent` | Stage-per-PR with vitest parity + integration tier; extraction order lowest-risk first; public/protected API frozen. |
| R5 | Prompt drift during the Phase 2→3 window (old prompts + new engine) | Payload sniff shim keeps old prompts working until migrated; removal gated on Sage/planner prompt PRs landing. |

---

## 6. Testing strategy

- **Unit:** graph validation (cycles, dupes, unknown agents, caps); eligibility/claim CAS semantics; failure/cancel matrices; join semantics; `@taskX.output` resolution; params-bag merge + auto-alignment + enforced gate; constant-folding decision table; Flow traversal parity before/after engine extraction.
- **Integration (deterministic tier):** new bundle *"ITxx — Task Graph Orchestration"*: submit → claim → parallel wave → induced failure → `Blocked` → retry → complete; restart reconciliation; two-instance no-double-run; messaging-adapter structured delegation; client re-attach against the streaming contract.
- **Prompt/E2E:** Sage single-node fold + multi-node durable paths; planner confirm-then-submit; disabled-agent emitted interface contains no `'Tasks'`.

---

## Appendix — primary source index

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
