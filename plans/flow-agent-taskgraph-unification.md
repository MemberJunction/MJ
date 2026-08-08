# Flow Agents on the Task Graph engine — unification plan

**Status:** proposal for planner review — decisions marked ⬥
**Drafted:** 2026-08-08 from a live audit of `next` @ `4b76d24fc0`
**Parent program:** Unified Workflow DAG engine (PR #3456)

**Goal:** Task Graph becomes the **universal** workflow engine. Flow agents compile to an ephemeral
`TaskGraphSpec` executed by the dispatcher. **All** flows move; the in-run executor is deleted in the
same change. No behaviour change for existing flows.

---

## 1. The gap

A Flow agent's graph is already persisted metadata (`AIAgentStep` + `AIAgentStepPath`), and
`WorkflowSpecSync` reconciles a `WorkflowSpec` onto that substrate — there is no `Workflow` table and
there will not be one. **Flow agents already *are* the persisted task graph.** What is missing is one
edge: nothing turns that graph into a submitted task graph.

| Concern | Today | Shared? |
|---|---|---|
| Design-time graph | `AIAgentStep` + `AIAgentStepPath` | ✅ one model |
| Condition grammar | `IConditionEvaluator` — `SafeConditionEvaluator` / `DispatcherConditionEvaluator` | ✅ one contract |
| Graph algorithms | `graph-algorithms.ts` (CorePlus) | ✅ shared |
| **Loop semantics** | `ForEachOperation` / `WhileOperation` (CorePlus) — *"used by all agent types"* | ✅ **already universal** |
| `TaskGraphSpec` → Flow agent | `task-graph-to-agent-spec.ts` | ✅ exists |
| **Flow agent → `TaskGraphSpec`** | — | ❌ **missing — this plan** |
| Traversal | `GraphTraversalEngine` (flow) vs dependency waves (dispatcher) | ❌ two implementations |
| Persistence | `AIAgentRunStep` vs `Task` | ❌ only `Task` is durable |

### Evidence

Run `4d25c954-…` (Demo Flow Agent, Completed, 2026-08-08 22:12:54): 9 `AIAgentRunStep` rows;
**`__mj.Task` has zero rows, ever.** The five independent searches summed **2332 ms inside a 2469 ms**
ForEach — serial. `@memberjunction/ai-agents` has **no dependency** on `@memberjunction/task-graph`,
so the flow path cannot reach the dispatcher even in principle.

---

## 2. Design change: typed node configuration ⬥ **adopted**

`TaskGraphSpecNode` currently carries assignment as three flat, mutually-exclusive optional fields
(`agentName` / `actionName` / `assignToUser`). Adding `Prompt`, `ForEach` and `While` that way means
three more flat fields plus a combinatorial validator, and every future node kind repeats it.

Instead: **one discriminated union — a `kind` plus a typed `configuration` bag.**

```ts
export type TaskGraphNodeKind = 'Agent' | 'Action' | 'Human' | 'Prompt' | 'ForEach' | 'While';

/** Per-kind configuration. Adding a node kind = one entry here + one runner. */
export type TaskGraphNodeConfigMap = {
    Agent:   { agentName: string; message?: string; templateParameters?: Record<string, string> };
    Action:  { actionName: string; inputMapping?: string; outputMapping?: string };
    Human:   { assignToUserID?: string; instructions?: string };
    Prompt:  { promptName: string; templateParameters?: Record<string, string> };
    ForEach: ForEachOperation;   // reused verbatim from CorePlus
    While:   WhileOperation;     // reused verbatim from CorePlus
};

export type TaskGraphSpecNode<K extends TaskGraphNodeKind = TaskGraphNodeKind> = {
    tempId: string;
    name: string;
    description: string;
    kind: K;
    configuration: TaskGraphNodeConfigMap[K];
    dependsOn: Array<string | TaskGraphDependency>;
    policy?: NodeExecutionPolicy;
    inputPayload?: Record<string, unknown>;
};
```

Why this is the right shape here specifically:

- **`ForEach`/`While` need no new invention.** `ForEachOperation` and `WhileOperation` already exist
  in CorePlus and are explicitly documented as *"used by all agent types — Flow agents convert
  `AIAgentStep` configuration to this format; Loop agents receive this from LLM responses."* They
  drop straight into the map. The loop contract was already universal; only the executor wasn't.
- **The validator collapses.** `AssignmentConflict` / `NoAssignment` become unrepresentable states
  rather than rules — `kind` picks exactly one config shape.
- **Extensibility without spec churn.** A new kind is one map entry plus one runner.
- **Discriminated narrowing** gives the dispatcher exhaustive `switch` checking; a new kind with no
  runner fails to compile rather than at run time.

⬥ **Decision — back-compat.** The loop agent's prompt currently emits flat `agentName` / `actionName`.
Recommendation: accept both at parse time and **normalise legacy → `kind`+`configuration`** in one
place, so prompts and stored specs migrate lazily; mark the flat fields deprecated in the type. The
alternative (hard cutover of the prompt schema) risks breaking every in-flight loop-agent run.

---

## 3. Complete capability inventory

Every capability the flow engine has today, from reading `flow-agent-type.ts` (1,666 lines),
`foreach-operation.ts`, `while-operation.ts` and the entity schemas. **Nothing may be dropped.**

### 3.1 Step types (`AIAgentStep.StepType`)

| Type | Runtime behaviour today | Maps to |
|---|---|---|
| `Action` | Resolves `ActionID`→name, emits an `Actions` step; `ActionOutputMapping` passed via a marker property. **`params: {}` — input mapping is NOT implemented** (`"Future: support parameter mapping"`) | `kind:'Action'` |
| `Sub-Agent` | Resolves `SubAgentID`→name; `Description` becomes the sub-agent's task message; propagates `params.context` | `kind:'Agent'` |
| `Prompt` | Emits a `Retry` step carrying `flowPromptStepId` — a marker BaseAgent interprets | `kind:'Prompt'` |
| `ForEach` | Parses `Configuration` JSON → `ForEachOperation`; body from `LoopBodyType` | `kind:'ForEach'` |
| `While` | Parses `Configuration` JSON → `WhileOperation`; body from `LoopBodyType` | `kind:'While'` |

### 3.2 Loop bodies (`AIAgentStep.LoopBodyType`)

| Body | Today | Note |
|---|---|---|
| `Action` | ✅ `{ name, params, outputMapping }` | |
| `Sub-Agent` | ✅ `{ name, message, templateParameters, context }` | |
| `Prompt` | ❌ **`"Prompt loop bodies not yet fully supported"` — returns Failed** | Existing gap in today's engine; the new engine can close it, but parity does not require it |

### 3.3 `ForEachOperation` — every field must survive

`collectionPath` (payload path — **inherently dynamic**, so no compile-time unrolling is needed),
`itemVariable`, `indexVariable`, `maxIterations` (undefined=1000, 0=unlimited),
`continueOnError`, `delayBetweenIterationsMs`, `executionMode` (`'sequential' | 'parallel'`),
`maxConcurrency`, `action?`, `subAgent?`.

> This retires the earlier "unroll static collections" idea entirely. `collectionPath` resolves
> against the payload at run time, so the dispatcher must expand the loop — and `executionMode` +
> `maxConcurrency` already say how.

### 3.4 `WhileOperation`

`condition`, `itemVariable`, `maxIterations`, `continueOnError`, `delayBetweenIterationsMs`,
`action?`, `subAgent?`. No `executionMode` — a conditional loop is inherently sequential.

### 3.5 Per-step fields

| Field | Behaviour | Target |
|---|---|---|
| `StartingStep` | Entry node | empty `dependsOn` |
| `Status` (`Active`/`Disabled`/`Pending`) | Non-active steps are **skipped, and traversal continues through them** (`createStepForFlowNode` recurses to the next node) | **Elide at compile time and splice edges** — emitting the node would deadlock dependents |
| `TimeoutSeconds` | Per-step timeout | `policy.timeoutSeconds` |
| `RetryCount` | Retry attempts | `policy.retryCount` |
| `OnErrorBehavior` (`continue`/`fail`/`retry`) | `continue` ⇒ successors run despite failure | `policy.onError` — **requires a dispatcher change** (§5.3) |
| `ActionInputMapping` | **Not implemented today** | `configuration.inputMapping`, evaluated at dispatch |
| `ActionOutputMapping` | Maps action outputs into payload | `configuration.outputMapping`, evaluated at dispatch |
| `Configuration` | Loop config JSON | absorbed by the typed bag |
| `PositionX/Y`, `Width`, `Height` | Layout | round-trip only (§6) |

### 3.6 Path fields (`AIAgentStepPath`)

| Field | Target |
|---|---|
| `OriginStepID` / `DestinationStepID` | `dependsOn[].tempId` (direction flips) |
| `Condition` | `dependsOn[].condition` — **same grammar by design** |
| `Priority` | consumed by sequential compilation (§4) |
| `Description`, `PathPoints` | round-trip only |

### 3.7 Traversal parameters (`FlowAgentTypePromptParams`)

| Param | Default | Target |
|---|---|---|
| `traversalMode` | `'sequential'` | **compiler input** (§4) |
| `joinMode` | `'all'` | `dependencyType`: `'Prerequisite'` (all) / `'Optional'` (any) |
| `maxConcurrentSteps` | `5` | `TaskGraphSpec.maxConcurrent` |

---

## 4. `traversalMode` is a compiler input, not a runtime flag

`TaskGraphSpec` graphs always run parallel; flow defaults to `'sequential'`, and that default is
deliberately load-bearing — flows drawn with fan-out shapes were historically walked by a single
program counter that followed the highest-priority edge and discarded the rest. Running them parallel
would execute branches their authors have never seen run.

- **`'sequential'`** → emit a dependency **chain**: at each fan-out, order satisfied edges by
  `Priority` and make each depend on the previous. Order is identical to today's walk, and only one
  step is ever in flight — expressed purely in dependencies.
- **`'parallel'`** → siblings, with `dependencyType` from `joinMode`.

Flipping a flow to parallel later becomes a **metadata edit**, not an engine migration.

---

## 5. Dispatcher work required

### 5.1 New node kinds
`Prompt`, `ForEach`, `While` runners. `ForEach`/`While` expand at run time against the payload,
honouring `maxIterations`, `delayBetweenIterationsMs`, `executionMode`, `maxConcurrency`.

### 5.2 Payload mapping ⬥ **decided: carry expressions**
`inputMapping` / `outputMapping` travel on the node and are evaluated by the dispatcher against
`DependencyOutputs` at dispatch time. Evaluating at submit time would silently break any step whose
input depends on a predecessor's output — i.e. most non-trivial flows.

### 5.3 `onError: 'continue'` ⬥ **decided: required**
The dispatcher currently treats a failed task as terminal for its dependents. It must gain: a node
whose policy says `continue` marks itself failed **and still releases its dependents**, with the
failure recorded on the `Task` row. `ForEachOperation.continueOnError` is the same concept at
iteration granularity and should share the implementation.

### 5.4 Policy
`policy?: { timeoutSeconds?, retryCount?, onError? }` per node; `maxConcurrent?` per spec.

### 5.5 Human tasks, streaming, sub-agent depth
Cutover blockers, not spec gaps — see §8.

---

## 6. Round-trip fidelity

`ConvertAgentSpecToTaskGraph` already goes spec ← flow. With the compiler added, both directions
exist and must be **property-tested as inverses**: `Flow → TaskGraphSpec → Flow` preserves nodes,
edges, conditions, layout and configuration. Layout (`PositionX/Y`, `Width`, `Height`, `PathPoints`)
is not needed to execute but **is** needed to reopen the graph on the canvas without it re-arranging,
so it rides in an optional `layout?` on the node.

---

## 7. Phasing — full cutover ⬥ **as directed**

No opt-in flag, no long dual-run. The old engine goes in the same change that moves the flows.

| Phase | Deliverable | Risk gate |
|---|---|---|
| **0** | Spec v2: `kind` + `configuration` + `policy` + `layout`; legacy normaliser; validator rewrite | none — additive |
| **1** | `FlowGraphCompiler` (pure, CorePlus) + **differential test suite** (§9) | none — not wired to execution |
| **2** | Dispatcher: `Prompt`/`ForEach`/`While` runners, policy, `onError: continue`, mapping evaluation | none — new paths unused |
| **3** | **Cutover.** Flow execution routes through the submitter; `GraphTraversalEngine`'s in-run executor and its adapters are **deleted in the same PR** | ⚠️ the one risky change — gated on §8 |
| **4** | Close `Prompt` loop bodies (§3.2), which today fail outright | additive |

Phases 0–2 are all no-behaviour-change, so the risk is concentrated in one reviewable step with a
differential test standing behind it.

---

## 8. Cutover blockers (must close before Phase 3)

1. **Human-in-the-loop.** Runs reach `AwaitingFeedback`. The dispatcher has human-task claim support,
   but flow's in-run pause/resume and the dispatcher's are not demonstrably the same mechanism.
2. **Streaming / progress.** Flow steps stream progress into chat; dispatcher tasks are polled.
   Cutting over without this is a visible UX regression.
3. **Sub-agent invocation depth.** `ReinvokeDepth` exists on the submitter; flow sub-agent steps nest
   in-process today. Semantics must be reconciled.
4. **`onError: 'continue'`** (§5.3) — no dispatcher equivalent until built.

---

## 9. Testing — the differential suite is the centrepiece

> For every Flow agent in metadata, compile to a `TaskGraphSpec`, derive the execution order the
> dispatcher would produce, and assert it is **identical** to what `GraphTraversalEngine` produces
> today.

Runs entirely offline — no database, no models, no dispatcher — and fails loudly on semantic drift
*before* anything changes engines. Ordering is an emergent property, so this is a far stronger
guarantee than per-node unit tests.

Plus:

- **Round-trip property test** (§6), pinning both directions at once.
- **Golden specs** for the shipped demo flows, reviewed once then diffed.
- **Per-capability negative tests**: a `Disabled` step must not appear and must not orphan its
  successors; sequential fan-out must produce a chain, not siblings; `maxIterations: 0` must mean
  unlimited, not zero; `onError: 'continue'` must release dependents; `Priority` must decide order.
- **Integration**: one flow run on both engines, comparing `AIAgentRunStep` order to `Task` order —
  runnable only during Phase 2, which is a reason to keep Phase 2 landed before Phase 3.

---

## 10. Non-goals

- **No `Workflow` table.** A workflow's WHAT is a Flow agent.
- **Not merging the editor's two node-type catalogs.** `AGENT_STEP_TYPE_CONFIGS` are
  `AIAgentStep.StepType` values; the spec's kinds are execution shapes. They converge only as far as
  §3 says.
- **No `ExecutionMode` flag keeping both traversals.** `flow-graph-adapters.ts` warns in its own
  header that divergent logic there is "the exact drift the extraction was meant to end."

---

## 11. Open decisions ⬥

1. **§2 back-compat** — normalise legacy flat `agentName`/`actionName` at parse time (recommended),
   or hard-cut the loop agent's prompt schema?
2. **§3.2** — close `Prompt` loop bodies during Phase 4, or leave failing as today?
3. **§8** — are streaming/progress parity and human-task parity in scope for this program, or
   prerequisites tracked separately?
4. **Layout in the spec** (§6) — optional `layout?` on the node, or a side table keyed by `tempId`?
   Putting it in the spec keeps round-trip trivial but puts presentation data in an execution
   contract.
