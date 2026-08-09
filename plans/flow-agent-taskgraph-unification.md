# Flow Agents on the Task Graph engine — unification plan (Track C.1)

**Status:** 🟨 **v2.1 — post-merge amendment** (2026-08-09). The cutover **shipped** in
[PR #3692](https://github.com/MemberJunction/MJ/pull/3692) (merged) as an omnibus carrying the
C1.0–C1.2 substance, partial C1.3, the C1.4 routing, and a parallel authoring-UI track. Review
findings ([5233582557](https://github.com/MemberJunction/MJ/pull/3692#issuecomment-5233582557)),
follow-up punch list ([5234281079](https://github.com/MemberJunction/MJ/pull/3692#issuecomment-5234281079)),
and **rulings R1–R6** ([5234305719](https://github.com/MemberJunction/MJ/pull/3692#issuecomment-5234305719),
AN-BC 2026-08-09) are baked into this revision. §14 is the authoritative post-merge state: what
shipped, what each ruling changed in this document, and the outstanding work.

---

## 14. Post-merge amendment (v2.1) — rulings and current state

**Read §14 first if you are doing follow-up work; the section-level supersession notes below all
point back here.**

### The six rulings (AN-BC, 2026-08-09)

| # | Ruling | Effect on this plan |
|---|---|---|
| **R1** | **Detach-by-design ratified.** Submit-and-detach is the universal flow calling contract; §6's attached-await default is **superseded**. | §6 rewritten in place as a superseded record + the detach contract's two bills: (a) **envelope truthfulness** — on `GraphSettled`, correct the submitting run's outcome and deliver the settled result (today the run claims `Completed` at submission forever and the payload reaches no caller); (b) until an await path exists, **enforce at submit that a Flow agent cannot be a sub-agent step or scheduled target**, failing loudly instead of reporting success-before-work. |
| **R2** | **Hard-cut spec ratified** — AN-BC directed no v1 back-compat; not a deviation. | §3's `NormalizeTaskGraphSpec`/dual-accept mandate is void. Mandatory consequence: the two prompt templates still teaching the flat shape (`workflow-drafting.template.md`, `workflow-planner.template.md`) must be updated to v2 and `Workflow.Draft` live-verified — the validator now rejects what they teach. |
| **R3** | **Typed columns ratified over the InputPayload envelope** — ruled *better* than this plan's design. | §5.7's envelope is superseded by what shipped: `Task.StepType` + `Task.PromptID` columns (queryable, CHECK-constrained; `CK_Task_Assignment` counts `PromptID`) + `Task.Configuration` typed by the `ITaskStepConfiguration` JSONType; `InputPayload` stays the freeform per-workflow data, which cannot be strongly typed — that split is the point. Riders: `PromptID` is intentionally-waiting schema for the Prompt runner; loop tasks carrying the *body's* `AgentID` needs a confirm (display behavior). |
| **R4** | **Workflows-app retirement superseded — the app is being restored** (in flight), repurposed primarily for **reviewing workflow runs** (three of the five run producers have no agent run and are visible nowhere). | The #3692 retirement migration is removed and the app metadata restored rather than patching its hard-coded `[__mj]`; the D18 vocabulary test guard returns with the app; parent-ledger rows 5a/5b stay live with amended purpose. Scope of the restored app to be settled with AN-BC. |
| **R5** | **`maxIterations: 0` = zero iterations (parity)** — the shipped unlimited implementation is reverted. | §4.3/§9 stand exactly as written; revert `TaskLoopExecutor`'s `0 → null` cap and its pinning test; fix the "0=unlimited" doc-fiction JSDoc on both operation types. |
| **R6** | **A walk that ends settles `Complete`, never `Blocked`.** A definite-false *ordinary* conditional edge is a normal not-taken outcome. | New declared change #5 in §5.6: definite-false conditional edges route through the **Skip machinery** (Skipped + cascade) exactly like XOR losers, for **all** graphs — `Blocked` is reserved for failure-driven unsatisfiability. (Loop-agent graphs with not-taken conditional branches currently settle `Blocked` — same illogic, corrected together.) The differential simulator must then match the real dispatcher — it currently writes Skipped where the dispatcher writes Blocked, hiding this divergence — and the terminal-conditioned-step fixture asserts `Complete`. |

### What #3692 verifiably shipped (aligned with this plan)

Spec v2 union incl. `External` + per-kind validator checks + object-form self-dependency fix;
compiler with all five §7 ordered rules (exclusion → single entry → prune → cycle rejection →
emission) and the oracle-order `sequence` tiebreak; pure-layer Skipped/cascade/
`ResolveExclusiveGroups` with XOR edges exempted from the Blocked machinery and writes confined to
`propagateAndRollup`; the §5.5 terminality guard; the §5.10.1 sweep-predicate fix;
`ConvertAgentSpecToTaskGraph` deleted; RO wire fully v2 with zero generated drift; loop prompt
updated behind both gates; cost rollup via the never-written `AIAgentRun …Rollup` columns (a good
design this plan didn't have); a real offline differential suite (synthetic fixtures); total in-run
refusal at the `createStepForFlowNode` choke point.

### Status update (2026-08-09, post-dispatch — per builder report, not yet independently verified)

- **Prompt runner LANDED** — the onboarding-flow brick (P0 item 2) is closed; the loop prompt
  teaches `kind:'Prompt'` again.
- **v1-shape templates FIXED** (P0 item 3) — both `workflow-drafting` and `workflow-planner`
  confirmed genuinely broken (zero `kind` occurrences) and converted.
- **Retirement migration resolved by deletion** (P0 item 1 / R4): the Workflows app never
  shipped, so `V202608082330__Retire_Workflows_Application.sql` is **deleted outright** and the
  app returns as declarative metadata under `metadata/applications/`. Fresh DB required after.
- **R7 (new ruling, AN-BC): cost is a read-time SUM over the run tree, not a dispatcher
  materialization.** The #3692 settlement write-back to the `…Rollup` columns is dropped;
  `ParentRunID` **is now populated on graph-spawned runs** (reversing #3692's "deliberately not
  included" — the `ParentRunID IS NULL` = conversational-root breadth concern is accepted), and
  cost aggregates via a recursive run-tree stored query (`Depth < 100` bound). Gap found and
  fixed en route: Prompt nodes had **no cost path** — `TaskPromptRunResult.PromptRunID` was
  returned and dropped; it now persists into the `Configuration` JSONType bag (strongly typed),
  not a new column. ⚠️ *Planner watch-flag: the run-tree SUM sees `AIAgentRun` children only —
  prompt-node cost lives in `AIPromptRun` reached via the captured `promptRunID`, so the stored
  query must join those too or Prompt nodes vanish from cost a second time.*
- **Item 16 ruled as a SPLIT** (AN-BC): the live `base-agent.ts` Loop-path clones consolidate
  onto `payload-mapping.ts`; the `flow-agent-type.ts` copies **stay** as the refused walker's
  reference implementation, since the differential oracle is currently a re-implementation.
  Planner answer to the builder's standing question: keep that split until **Track R's
  golden-fixture capture** — fixtures must be captured from the *real* walker before deletion,
  and that is the moment the flow-agent-type copies move or die with it.
- **R4 scope concretizing**: run-tree stored query → `LoadAgentRunTree` → timeline refactor →
  nested-canvas embed revert → Subway Lines → two demo flow agents → integration records +
  checks → fresh-DB end-to-end verification.
- **Still open per the builder**: items **4** (input snapshot), **10** (envelope truthfulness +
  result delivery), **12–15** (hold-aware stall, loop parity, differential-to-§9, D17 loop-body
  identity), **17** (joinMode), **18** (NodeProgress + hygiene). ⚠️ *Planner watch-flag: if R6
  (item 5) was implemented dispatcher-side, the differential simulator must be updated in the
  same change (it currently encodes the pre-R6 divergence) — otherwise the suite asserts the
  wrong engine until item 14 lands.*

### The follow-up punch list (authoritative copy in
[5234281079](https://github.com/MemberJunction/MJ/pull/3692#issuecomment-5234281079))

**P0:** CI reds (`as never` ×5; retirement migration handled per R4) · **Prompt runner** (the
shipped User Onboarding Flow Agent is refused at submission — §5.7's runner contract stands;
meanwhile stop teaching `kind:'Prompt'` in the loop prompt) · v1-shape template fixes (R2) ·
**submit-time input snapshot** (starting payload/`data`/`context`/`conversationMessages` →
parent metadata → condition context + `BuildMappedInput`; today they evaluate as `{}`/literals) ·
**R6 implementation** · **`failureSemantics: 'edges'` wiring** (compiled but never persisted or
enforced — recovery paths are dead until this lands) · **depth stamping** (`TaskGraphAgentRunner`
stamps `ContinuationDepth`; cap enforced at `Submit` — a self-referencing flow recurses
unboundedly today) · **XOR race** (`findClaimableTasks` must filter `skipSeedTaskIDs`, not just
`holdTaskIDs`) · **R5 revert**.

**P1:** envelope truthfulness + result delivery (R1a) · submit-time enforcement for
sub-agent/scheduled flow targets (R1b) · hold-aware `IsGraphStalled` + non-group unevaluable HOLD
(§5.3/§5.6 — the "stalls visibly" log line is currently false) · loop-executor parity (sequential
payload threading; per-iteration `[index]` output mapping; While context dialect
`{payload, results, errors}`; sub-agent bodies receive the item — currently `{}` every iteration) ·
differential suite to §9 (metadata-driven, golden fixtures, missing pins: succeeded-chain,
`data.*`/`context.*` dialects, While default 100, cyclic-metadata assertion, cascade-order unit
pin) · D17 loop-body identity (`stepShapeFor` must write `ActionID`/`SubAgentID` — saved
workflows with loops fail recompilation) · mapping-dialect consolidation (three implementations
exist; §5.7's extraction stands) · remove `joinMode:'any'→Optional` + compile diagnostic +
compiler reads `AgentTypePromptParams` (§4.6 stands) · `NodeProgress` frame (§5.11) ·
completion-path retries + claim-TTL derivation (§5.8/§5.10.2 — `policy` is persisted but never
read) · hygiene (stale `TaskGraphService` docstring; `task-graph-spec.ts`'s invented
`AIAgentStepPath.Sequence` column; D18 guard restoration with the app).

---

## Document history (v1 → v2 → v2.1)

**v1:** drafted 2026-08-08 from a live audit of `next` @ `4b76d24fc0` (builder agent)
**Parent program:** Unified Workflow DAG engine ([PR #3456](https://github.com/MemberJunction/MJ/pull/3456)); parent plan `plans/task-graph-primitive.md`

**Review record (all applied in v2):**
- Planner intense review — [comment 5228660150](https://github.com/MemberJunction/MJ/pull/3456#issuecomment-5228660150): §4 chain compilation refuted (sequential is an exclusive choice, not a chain), `ActionInputMapping` inventory row refuted (it IS implemented), Disabled-step handling corrected, oracle-deletion contradiction, calling contract, run identity, streaming greenfield, D6/D7/D8 supersession, `External` in the union, RO wire staleness, sweep blind spot, one projection path, `traversalMode` source.
- First planner pass — [comment 5228591654](https://github.com/MemberJunction/MJ/pull/3456#issuecomment-5228591654).
- Author response — [comment 5228685338](https://github.com/MemberJunction/MJ/pull/3456#issuecomment-5228685338): all corrections accepted; adds **zero production mileage** (`__mj.Task` has never had a row), **event-loop starvation vs. claim expiry**, **differential suites must read metadata files not DB state**, **golden fixtures before deletion**, and the **parity scope reduction** (no shipped flow is parallel — parity = the sequential path only).
- The four v1 open decisions ⬥ are **resolved** in §11.
- **v2 verification round (2026-08-09):** this rewrite was itself adversarially verified by four
  independent reviewers (citations / completeness / executability / semantics) against `next`
  before publication; their findings are baked in — notably the `failureSemantics: 'edges'` design
  (§5.8, replacing a naive `onError` mapping of dead config), the XOR exemption + HOLD machinery
  (§5.3), the §5.5 terminality guard (fixes a latent wave-1 Blocked bug), compiler
  exclusion/pruning/single-entry/cycle rules (§7), the `Sequence` tiebreak (§5.4), and
  completion-path retries (§5.8).

**Goal:** Task Graph becomes the **universal** workflow engine. Flow agents compile to an ephemeral
`TaskGraphSpec` executed by the durable dispatcher. **The cutover has happened** (#3692, merged
2026-08-09): flows route through the dispatcher and the in-run executor is refused at its choke
point, retained unrouted as the differential-test oracle until **Track R** deletes it. No behaviour
change for existing flows except the **declared changes** listed in §5.6 (now five, incl. R6) —
the §14 punch list is what closes the remaining gaps between that promise and the shipped state.

---

## 0. Read this first — repo state and where to branch

🚨 **The plan branch (`claude/sage-task-graph-study-4uvtrc`) is documentation-only and its `packages/`
tree is ~53k lines behind `next`.** `packages/TaskGraph/`, `packages/AI/CorePlus/src/task-graph/`,
`executeTasksStep`, `ContinuationDepth`, and the `TaskGraph.*`/`Workflow.*` Remote Operations exist
**only on `next`**. Every implementation PR for this track is cut **fresh from `next`**, exactly like
the ledger phases before it. `file:line` citations aim at `next`, but `next` moves and a handful of
ranges were captured from slightly older blobs — **identifier names are always the contract**;
when a cited line lands on unrelated code, search for the named identifier instead of trusting the
number.

Per-phase mechanics that apply to every phase below (do not re-derive them):

- **Build**: `cd packages/<Pkg> && pnpm run build` after touching a package; fix all TS errors.
- **Migrations**: SQL Server, target `MJ_6_1_0`, folder `migrations/v6/` (folder must match the
  major version in the migration's own filename), append-only. Value-list changes = drop + re-add
  the CHECK constraint in one migration. PostgreSQL parity is the build engineer's concern post-PR —
  do not block on it.
- **Metadata → CodeGen ordering**: edit JSON under `metadata/` → `mj migrate` (if schema changed) →
  `npx mj sync push --dir=metadata --include="<subdir>"` from repo root → `mj codegen`. Skipping the
  push makes CodeGen regenerate from stale DB definitions and **silently delete** properties
  (`migrations/CLAUDE.md`, the "🚨 CodeGen Ordering" section). Revert the `sync` block write-back that push stamps into the
  JSON before committing. **No per-PR `*__Metadata_Sync.sql` migrations** — the build engineer
  generates one consolidated sync migration per release.
- **New metadata records** need a `primaryKey` UUID from CLI `uuidgen`.
- **Tests**: unit tier per touched package (`pnpm test`); the deterministic integration tier
  (`pnpm run test:integration`) must pass; graph work extends **IT71 - Task Graph Orchestration**
  (extend its description, no new `MJ: Tests` row; keep the suite-sequencing guard green).
- **Standing rule**: every new task-graph control verb ships as a Remote Operation (#3576).
- **Vocabulary (D18)**: end-user surfaces never say graph/DAG/node/traversal — workflow, step, plan,
  path.

---

## 1. The gap

A Flow agent's graph is already persisted metadata (`AIAgentStep` + `AIAgentStepPath`), and
`WorkflowSpecSync` reconciles a `WorkflowSpec` onto that substrate — there is no `Workflow` table and
there will not be one. **Flow agents already *are* the persisted task graph.** What is missing is one
edge: nothing turns that graph into a submitted task graph.

| Concern | Today | Shared? |
|---|---|---|
| Design-time graph | `AIAgentStep` + `AIAgentStepPath` | ✅ one model |
| Condition grammar | `IConditionEvaluator` — `SafeConditionEvaluator` (flow) / `DispatcherConditionEvaluator` (dispatcher) | ✅ one contract — **but two evaluation contexts, see §5.5** |
| Graph algorithms | flow imports `SelectOutgoingEdges` from `graph-traversal-engine.ts`; the dispatcher imports `graph-algorithms.ts` and **never uses `GraphTraversalEngine`** | ⚠️ the traversal layers are fully disjoint today |
| **Loop semantics** | `ForEachOperation` / `WhileOperation` (CorePlus) — *"used by all agent types"* | ✅ contracts universal; executors are not |
| `TaskGraphSpec` → Flow agent | `ConvertTaskGraphToAgentSpec` (`task-graph-to-agent-spec.ts`) | ✅ exists (D17) |
| **Flow agent → `TaskGraphSpec`** | `ConvertAgentSpecToTaskGraph` exists but is **dead code — zero non-test call sites** | ❌ this plan makes it real (§7) |
| Persistence | `AIAgentRunStep` vs `Task` | ❌ only `Task` is durable |

### Evidence

Run `4d25c954-…` (Demo Flow Agent, Completed, 2026-08-08): 9 `AIAgentRunStep` rows; **`__mj.Task`
has zero rows — ever, on the long-lived dev DB and on two clean bootstraps.** The five independent
searches summed **2332 ms inside a 2469 ms** ForEach — serial (that flow's ForEach uses the default
`executionMode: 'sequential'`). `@memberjunction/ai-agents` has no dependency on
`@memberjunction/task-graph`; the flow path cannot reach the dispatcher even in principle. The
`GetTaskGraphSubmitter()` seam it does have (`base-agent.ts` `executeTasksStep`, ~:11938) is emitted
only by the **Loop** agent's `Tasks` primitive.

The zero-rows fact cuts both ways: it is why the gap exists, and it means the durable dispatcher has
**zero production mileage**. Every §8 gate exists because this cutover moves all flows onto an
unexercised substrate in one step.

---

## 2. What `sequential` actually is — an exclusive choice, not a chain

**v1's §4 was wrong and is replaced by this section.** Two verified facts:

1. In sequential mode the engine takes the **highest-priority satisfied edge and discards the
   rest** — discarded branches are never executed (decisive code:
   `packages/AI/CorePlus/src/task-graph/graph-traversal-engine.ts:294-301`, `if (mode ===
   'sequential') break;` over priority-desc-sorted edges; pinned by its own diamond test asserting
   `NextNodeIds` has length 1). The flow runtime is simpler still: every call site takes `paths[0]`
   (`flow-agent-type.ts:281, :666, :1282`). There is no backtracking; after branch B completes the
   walker follows B's outgoing edges and never returns to the fork.
2. **Edge satisfaction is a run-time property** — conditions evaluate against the live payload — so
   "order satisfied edges at compile time" was never constructible.

Therefore the compile target for a sequential fan-out is an **XOR-split resolved at run time by the
dispatcher**: when the origin completes, evaluate its outgoing conditional edges in priority order;
the first satisfied edge's target proceeds; every other branch is **Skipped** — a new, non-failure
terminal that cascades forward. §5 specifies the machinery. With a single `StartingStep` and XOR at
every fan-out, at most one task is in flight, which reproduces the single program counter exactly —
no `maxConcurrent: 1` clamp is used (it would also throttle in-loop parallelism, §5.7).

**Fan-in companion rule.** A join downstream of an XOR must not deadlock on skipped predecessors.
Today's production path performs **no join check at all** (`AdvanceFrontier`, the only caller of
`IsJoinSatisfied`, has zero production callers — the walker enters a join from whichever branch ran).
So: a `Skipped` prerequisite counts as **satisfied-with-no-outputs** for eligibility, and a task all
of whose gating predecessors are Skipped is itself Skipped by the cascade. §5.3 has the formal rules.

**Parity scope (author's reduction, accepted):** `FlowAgentTypePromptParams` is defined and exported
but imported by **nothing**; the runtime hardcodes sequential. **No shipped flow can be parallel**,
so parity for cutover = the sequential/XOR path only. Parallel compilation (§7) is new capability
that cannot regress anything.

---

## 3. Spec v2 — one discriminated union, ruled **adopted**

`TaskGraphSpecNode` currently carries assignment as three flat, mutually-exclusive optional fields
(`agentName` / `actionName` / `assignToUser` — `task-graph-spec.ts:54,64,70`). Spec v2 replaces the
arms with `kind` + a typed `configuration` bag, in `packages/AI/CorePlus/src/task-graph/task-graph-spec.ts`:

```ts
export type TaskGraphNodeKind = 'Agent' | 'Action' | 'Human' | 'Prompt' | 'ForEach' | 'While' | 'External';

/** Per-kind configuration. Adding a node kind = one entry here + one runner. */
export type TaskGraphNodeConfigMap = {
    Agent:    { agentName: string; message?: string; templateParameters?: Record<string, string> };
    Action:   { actionName: string; inputMapping?: string; outputMapping?: string };
    Human:    { assignToUserID?: string; instructions?: string };
    Prompt:   { promptName: string; templateParameters?: Record<string, string> };
    ForEach:  ForEachOperation;   // reused verbatim from CorePlus (maxIterations default 1000)
    While:    WhileOperation;     // reused verbatim from CorePlus (maxIterations default 100 — asymmetric, deliberate)
    External: { domain: string; ref?: string };  // D21/§3.10 of the parent plan — runner ships in Phase 9
};

export type TaskGraphSpecNode<K extends TaskGraphNodeKind = TaskGraphNodeKind> = {
    tempId: string;
    name: string;
    description: string;
    kind: K;
    configuration: TaskGraphNodeConfigMap[K];
    dependsOn: Array<string | TaskGraphDependency>;
    policy?: NodeExecutionPolicy;                 // §5.8
    layout?: NodeLayout;                          // §7; dispatcher MUST ignore; validator MUST never require
    inputPayload?: Record<string, unknown>;
    /** @deprecated v1 flat arm — accepted for one release; NormalizeTaskGraphSpec folds it into kind/configuration */
    agentName?: string;
    /** @deprecated v1 flat arm — as above */
    actionName?: string;
    /** @deprecated v1 flat arm — as above */
    assignToUser?: boolean;
};

export type NodeExecutionPolicy = { timeoutSeconds?: number; retryCount?: number; onError?: 'fail' | 'continue' };
export type NodeLayout = { x?: number; y?: number; width?: number; height?: number };
```

`TaskGraphSpec` itself gains one field: `failureSemantics?: 'block' | 'edges'` (default `'block'`
— §5.8; the compiler sets `'edges'` on every flow-compiled spec).

`TaskGraphDependency` (today `{ tempId; condition?; dependencyType? }`, `task-graph-spec.ts:16-34`)
gains four fields:

```ts
export type TaskGraphDependency = {
    tempId: string;
    condition?: string;
    dependencyType?: 'Prerequisite' | 'Corequisite' | 'Optional';
    priority?: number;          // NEW — XOR ordering; higher wins; default 0
    sequence?: number;          // NEW — deterministic tiebreak for Priority ties (§5.4); default 0
    exclusiveGroup?: string;    // NEW — same non-null value across sibling edges = one XOR group (§5.4)
    pathPoints?: string;        // NEW, layout-only — round-trips AIAgentStepPath.PathPoints; dispatcher ignores
};
```

Why `External` ships in the union **now**: the parent plan's Phase 9 (D21, bizapps-caliber) adds
externally-completed nodes. Under the flat spec that becomes a **fourth arm** — the exact disease
this section cures. The union entry (type only; validator accepts it; dispatcher parks it exactly
like `Human` — never claims, sweep-exempt) costs nothing here and means the first external consumer
never sees the flat shape. **Sequencing consequence: C1.0 lands before program Phase 9** (§10).

**Back-compat — ⟶ SUPERSEDED by R2 (§14): hard-cut ratified, AN-BC-directed.** No
`NormalizeTaskGraphSpec`, no `TaskGraphSpecLike`, no deprecated flat fields, no dual-accept —
"there is no v1 compatibility shim, deliberately." The mandatory consequence: every spec *producer*
(prompt templates, RO callers) must speak v2, and the two templates still teaching the flat shape
must be fixed (§14 P0). The original v2 design is preserved below for the record only:

```ts
/** The v1 flat spec shape ∪ the v2 union shape — what boundaries accept during dual-accept. */
export type TaskGraphSpecLike = TaskGraphSpec | TaskGraphSpecV1Flat;

/** Accepts v1 flat nodes and v2 union nodes; returns canonical v2. Never throws — validation reports. */
export function NormalizeTaskGraphSpec(spec: TaskGraphSpecLike): TaskGraphSpec
```

Mapping: `agentName` → `kind:'Agent'`; `actionName` → `kind:'Action'`; `assignToUser: true` →
`kind:'Human'`; a node with a `kind` passes through. Flat fields stay on the type as
`@deprecated` optional members for one release of dual-accept. Call sites — **all** of them, so
normalisation happens exactly once at each boundary:
`ValidateTaskGraphSpec` entry (`task-graph-validator.ts:30`), `TaskGraphService.Submit`
(`packages/TaskGraph/src/TaskGraphService.ts`), the RO server handlers
(`packages/TaskGraph/src/operations/TaskGraphOperations.ts:91`, `WorkflowOperations.ts:59,93`,
`WorkflowDraftOperation.ts:111-116`), and `LoopAgentType`'s task-graph parse
(`loop-agent-type.ts:187-222`).

**Validator rewrite** (`task-graph-validator.ts`): `AssignmentConflict`/`NoAssignment` become
post-normalisation checks (a legacy node setting two arms → `AssignmentConflict` from the
normaliser's report; a node with neither `kind` nor any arm → `NoAssignment`); per-kind
configuration checks (`Agent` needs `agentName`, `Action` needs `actionName`, `Prompt` needs
`promptName`, `ForEach` needs `collectionPath` + `itemVariable`, `While` needs `condition` +
`itemVariable`, `External` needs `domain`); `exclusiveGroup` sanity (all members share one origin's
tempId-set semantics per §5.4 — members of a group must name the same `tempId`). Also fix the known
escape: an **object-form self-dependency** (`{ tempId: <own tempId> }`) currently bypasses
`SelfDependency`, `UnknownDependency`, and cycle detection entirely (string-only `===` at
`task-graph-validator.ts:90`, exclusions at `:105` and `:121`) — normalise before the check.

**Wire surface — same phase, not later.** The flat shape is the wire contract of four Remote
Operations, and it is **already stale**: `TaskGraph.Submit`'s inline `InputTypeDefinition`
(`metadata/remote-operations/.remote-operations.json:445`) omits `actionName` and allows only
bare-string `dependsOn`; `Workflow.Save` (`:536`), `Workflow.Validate` (`:560` — reuses
`WorkflowSaveInput`), and `Workflow.Draft` output (`:586`) embed the node shape too. All four inline
JSON type definitions are updated to the v2 node shape (with the deprecated flat fields still
accepted — the normaliser sits server-side in the handlers, so old callers keep working), then
push + codegen regenerates `packages/MJCoreEntities/src/generated/remote_operations.ts`
(`TaskGraphSubmitInput` :577, `WorkflowSaveInput` :665, `WorkflowDraftOutput` :635). Not a
Publish-No-Break violation (that policy scopes to published OpenApp DB schema), but it IS the wire
for external `ExecuteRemoteOperation` callers — the dual-accept window is the compat story.

**Prompt docs — both gates.** The loop prompt teaches **two** arms today (no `actionName` anywhere
in `loop-agent-type-system-prompt.template.md`; `dependsOn` string-only at `:66-83`, `:734-777`).
Update the response-type block and the Durable Task Graphs section to the v2 shape (kind +
configuration + object-form dependsOn), behind the existing double gate: the
`includeResponseTypeDefinition.tasks` template conditional (`:51,66,733`) and the
`enableTaskGraphs === true` runtime enforcement (`loop-agent-type.ts:135-165`).

---

## 4. Corrected capability inventory — everything the cutover must preserve

From `flow-agent-type.ts` (1,666 lines on `next`), `base-agent.ts`, the operations contracts, and
the entity schemas. **Nothing here may be dropped.** Corrections vs. v1 are marked ✏️.

### 4.1 Step types (`AIAgentStep.StepType` — union is exactly `Action | ForEach | Prompt | Sub-Agent | While`)

| Type | Runtime behaviour today (verified) | Maps to |
|---|---|---|
| `Action` | ✏️ Step created with `params: {}` **but `ActionInputMapping` IS implemented**: `PreProcessActionStep` (flow-agent-type.ts:857-935 on next, `@since 2.76.0`) parses it at execution time and injects mapped params — **five** resolution dialects: `static:`/`payload.`/`data.`/`context.` prefixes plus `conversation[N].content` references (`resolveNestedValue` via `ConversationMessageResolver`); `ActionOutputMapping` applied by `PostProcessActionStep` (:1052 on next) via `applyActionOutputMapping` (dotted paths, case-insensitive lookup, `'*'`, `$message`/`$reasoning`/`$confidence` special fields, `[]` append). The `// Future: support parameter mapping` comment at :709 is **stale** — delete it in C1.4. | `kind:'Action'`, mappings evaluated at dispatch (§5.7) |
| `Sub-Agent` | Resolves `SubAgentID`→name; `Description` becomes the sub-agent's task message; propagates `params.context` | `kind:'Agent'` |
| `Prompt` | Emits `Retry` carrying `flowPromptStepId` (the **PromptID**, despite the name — flow-agent-type.ts:778 on next); BaseAgent's `GetPromptForStep` hook resolves it; the prompt runs with payload injected at `CURRENT_PAYLOAD_PLACEHOLDER` + `flowContext`; the JSON response is **deep-merged into the payload in place** (`DetermineNextStep`, :241-243); a response with `nextStep.type === 'Chat'` or `taskComplete && message` becomes a terminal Chat step (:224-235) | `kind:'Prompt'` (§5.7 runner reproduces merge + Chat escape) |
| `ForEach` / `While` | ✏️ **Executed by BaseAgent, not FlowAgentType** — flow only converts the step to a `ForEachOperation`/`WhileOperation` decision. §4.3 has the exact iteration semantics the runner must clone. | `kind:'ForEach'` / `kind:'While'` |

### 4.2 Loop bodies (`AIAgentStep.LoopBodyType`)

| Body | Today | Note |
|---|---|---|
| `Action` | ✅ `{ name, params: JSON.parse(node.ActionInputMapping \|\| '{}'), outputMapping: node.ActionOutputMapping }` (flow-agent-type.ts:1396-1400) — raw mapping JSON becomes the params, then **`{{item}}`/`{{index}}` template-resolved per iteration** by BaseAgent (different mechanism than the non-loop `static:`/`payload.` prefixes) | preserve both dialects |
| `Sub-Agent` | ✅ `{ name, message: Description, templateParameters: {}, context }`; **the loop item becomes the sub-agent's payload override** (`processSubAgentStep(..., item)` — skips normal payload computation) | preserve |
| `Prompt` | ❌ returns Failed: `'Prompt loop bodies not yet fully supported'` (:1435, :1523 on next) | closed in **C1.5**, out of the parity gate |

### 4.3 Loop iteration semantics (BaseAgent — the runner's parity contract)

- ✏️ **`executionMode: 'parallel'` IS honoured in-run** (`executeForEachIterations` branches at
  base-agent.ts:12687-12700 on next) — v1 implied otherwise. Sequential: literal `for` loop, payload
  threads iteration-to-iteration, `delayBetweenIterationsMs` between iterations, break on error
  unless `continueOnError`. Parallel: batches of `maxConcurrency ?? 10` via `Promise.all`; **all
  iterations receive the same read-only initial payload**; results sorted by index and applied
  **in order, last-writer-wins full-payload replacement** (`applyForEachResultsSequentially`);
  delay is inter-batch; a failed batch stops subsequent batches unless `continueOnError`.
- `maxIterations` defaults: ForEach `?? 1000`, While `?? 100`. **`maxIterations: 0` executes
  zero iterations** — the "0=unlimited" JSDoc on both operation types is doc-fiction BaseAgent
  never implemented (`Math.min(length, maxIterations)` / `while (count < maxIterations)`, no
  zero special case); the runner must NOT implement it (§9 pins this; C1.2 fixes the JSDoc).
  `While` is always sequential and its operation type has no `executionMode`/`maxConcurrency` —
  do not invent them.
- Template context per iteration: `{ item, index, payload, data }`; `{{itemVariable}}` resolves to
  the item, dotted paths supported; **`indexVariable` is effectively dead** (context key is always
  `index`) — carry the field, do not wire new behaviour to it.
- While condition: `SafeExpressionEvaluator` per pass against `{ payload, results, errors }`;
  `item` = `{ attemptNumber, totalAttempts }`.
- Loop-body action output mapping per iteration: `AfterLoopIteration` applies
  `actionOutputMapping` with literal `[index]` token replacement, deep-merged into the payload;
  special `$` fields are NOT supported in loops.
- A loop node is **one flow step** — iterations never touch the graph. §5.7 keeps that shape.

### 4.4 Per-step fields

| Field | Behaviour (verified) | Target |
|---|---|---|
| `StartingStep` | ✏️ The runtime executes **only `startingSteps[0]`** — the alphabetically-first `StartingStep=true` step (`getStartingSteps` Name sort; "For now, execute the first starting step", flow-agent-type.ts). Additional starting steps never run. | single entry node per §7's reachability rule |
| `Status` (`Active`/`Disabled`/`Pending`) | ✏️ A non-Active **destination is rejected at edge selection** (`DestinationInactive`, graph-traversal-engine.ts:208-214) and the walker falls to the next-priority **alternate sibling** — traversal does NOT continue through the disabled step (recurse-through exists only for `skipSteps`, a different feature). The in-flow status fallbacks are unreachable dead code — `getValidPaths` never returns inactive destinations. | **Exclude non-Active steps from emission entirely** (node + every incident edge, both directions), then prune all nodes unreachable from the entry (§7). Never emit-with-dropped-edges — an edge-less node is *immediately eligible* under `ComputeEligibleTasks` and would RUN at wave 1. A fork whose surviving edges all evaluate unsatisfied ends the walk with the graph settling **`Complete`** (parity with "Flow completed - no more paths to follow", a Success outcome — flow-agent-type.ts:1246-1277), not Blocked/Failed. |
| `TimeoutSeconds` / `RetryCount` | ✏️ **Dead config** — zero runtime consumers on `next` (grep: no `.TimeoutSeconds`/`.RetryCount` reads in `packages/AI/Agents/src`); values set in the editor have never taken effect | `policy.timeoutSeconds`/`policy.retryCount` — the dispatcher makes them real for the first time (§5.8). **Declared change #4**: previously-inert authored values start working. |
| `OnErrorBehavior` (`continue`/`fail`/`retry`) | ✏️ **Dead config** — zero runtime consumers. The REAL failure semantics (flow-agent-type.ts:1245-1279): after ANY Failed step the walker evaluates outgoing paths with `stepResult.Success === false` in context; a satisfied path (including an unconditional one) is a **recovery path** and runs; no satisfied path → the run fails ("Flow step failed with no recovery path"). | **Compiler ignores the column for behaviour** (honouring the editor-default `'fail'` would destroy recovery paths); carried into `policy.onError` for round-trip only. Failure parity comes from spec-level `failureSemantics: 'edges'` (§5.8). |
| `ActionInputMapping` / `ActionOutputMapping` | ✏️ **Both implemented** (§4.1) | `configuration.inputMapping`/`outputMapping`, evaluated at dispatch (§5.7) |
| `Configuration` | Loop config JSON | absorbed by the typed bag |
| `PositionX/Y`, `Width`, `Height` | Layout | `layout` (§7) |

### 4.5 Path fields (`AIAgentStepPath`)

| Field | Target |
|---|---|
| `OriginStepID` / `DestinationStepID` | `dependsOn[].tempId` (direction flips) |
| `Condition` | `dependsOn[].condition` — same grammar; **evaluation context is the §5.5 superset** |
| `Priority` | `dependsOn[].priority` — consumed by XOR resolution at run time (§5.4) |
| `Description` | round-trip only |
| `PathPoints` | `dependsOn[].pathPoints` (layout-only) |

### 4.6 Traversal parameters — where they actually live

`FlowAgentTypePromptParams` (`traversalMode`/`joinMode`/`maxConcurrentSteps`, defaults
`sequential`/`all`/`5`) is stored in **`AIAgent.AgentTypePromptParams`** (nvarchar(MAX) JSON,
schema per `AIAgentType.PromptParamsSchema`) per `flow-agent-prompt-params.ts`'s documented
contract — but **nothing consumes it today**; the runtime hardcodes sequential. The compiler is the
**first consumer**: read the agent's `AgentTypePromptParams` JSON, default `traversalMode` to
`'sequential'` when absent. **`joinMode` is read but ignored by sequential compilation — all
compiled joins are `Prerequisite` (§5.4).** Do NOT map `'any'` → `dependencyType: 'Optional'`:
`isGatingEdge` gates only `Prerequisite`, so an all-Optional node has zero gating deps and is
eligible at wave 1 — it would run *before* its predecessors (OR-join gating is unimplemented). And
because these params were dead, **honouring a stored non-default is itself a behaviour change**:
the compiler treats `traversalMode !== 'sequential'` or `joinMode !== 'all'` as a compile
diagnostic (reject with a workflow-vocabulary message) until parallel compilation and real OR-join
semantics are designed. `maxConcurrentSteps` → reserved for parallel mode.

---

## 5. Graph semantics + dispatcher work (pure layer lands in C1.1, application in C1.2) — exact contracts

The dispatcher doctrine holds: **graph semantics are pure functions in
`packages/AI/CorePlus/src/task-graph/graph-algorithms.ts`; the dispatcher applies them per poll
cycle** (`pollOnce` → `propagateAndRollup` → `findClaimableTasks`, TaskGraphDispatcher.ts:249-278).
There is no per-completion callback today and this plan does not add one — XOR resolution is
computed per cycle from persisted state, which makes it idempotent and restart-safe for free.

### 5.1 Migration (one file, `migrations/v6/`)

1. `CK_Task_Status`: drop + re-add adding **`Skipped`** (8th value; keep the existing seven —
   note `Complete` not `Completed`, `Cancelled` double-L). Update the column description.
2. `TaskDependency`: add `Priority INT NOT NULL CONSTRAINT DF_TaskDependency_Priority DEFAULT (0)`,
   `Sequence INT NOT NULL CONSTRAINT DF_TaskDependency_Sequence DEFAULT (0)`, and
   `ExclusiveGroup NVARCHAR(255) NULL`, with descriptions ("XOR group key: sibling edges
   sharing a non-null ExclusiveGroup are an exclusive fan-out; the highest-Priority satisfied edge
   wins, ties broken by ascending Sequence; the rest are Skipped").
3. Then `mj codegen` — `MJTaskEntity.Status` union gains `'Skipped'`;
   `MJTaskDependencyEntity` gains the three columns. Never hand-edit the generated ORM.

### 5.2 `Skipped` in the pure layer (`graph-algorithms.ts`)

- `TaskGraphNodeStatus` union += `'Skipped'`. `TERMINAL_STATUSES` += `'Skipped'` (a settled graph
  can contain Skipped children). `UNSATISFIABLE_STATUSES` **unchanged** — Skipped is a normal
  outcome, not a failure, and must NOT trip `ComputeTasksToBlock`.
- `ComputeEligibleTasks`: a `Prerequisite` dependency is satisfied when the upstream is
  **`Complete` or `Skipped`** (Skipped contributes no `DependencyOutputs`).
- `ComputeParentRollup`: Skipped children are ignored for failure precedence and count as done for
  `percentComplete`; a graph whose non-Skipped children are all `Complete` rolls up **`Complete`**.
  (Without this, every sequential flow with a fork would settle `Blocked` — the reason Skipped is a
  new status instead of reusing Blocked/Cancelled.)
- New: `ComputeSkipCascade(nodes, edges, seedSkipIDs): string[]` — fixpoint: a `Pending` task is
  Skipped iff it has ≥1 gating (Prerequisite) edge and **all** its gating predecessors are Skipped
  (or in `seedSkipIDs`). `Optional`/`Corequisite` edges are ignored by the cascade — only gating
  edges count. Pure, unit-tested against diamonds, chains, and multi-fork shapes.
- **Ordering invariant**: the skip cascade is computed and persisted **before** eligibility in
  every cycle — a node with all-Skipped gating predecessors is simultaneously "eligible" (Skipped
  satisfies) and "to-be-Skipped" (cascade), and cascade-first is what makes the loser subtree never
  run. The §9 simulator must apply the same order; pin it with a unit test on an XOR-loser chain.

### 5.3 XOR resolution (pure + applied in `loadGraphState`)

New pure function:

```ts
/** Resolve exclusive fan-outs. Within each ExclusiveGroup whose origin task is TERMINAL
 *  (Complete — or Failed under failureSemantics 'edges', §5.8):
 *  - winner = the satisfied edge with the highest Priority, ties broken by ascending Sequence;
 *  - every other group edge is a loser;
 *  - zero satisfied + zero unevaluable ⇒ ALL edges are losers (the walk ends down this fork —
 *    targets skip, and if nothing else remains the graph settles Complete, §4.4 parity);
 *  - ≥1 unevaluable ⇒ the group is UNDECIDED: no winner, no losers, all targets go on HOLD.
 *  Groups whose origin is not terminal resolve to nothing (not yet decidable).
 *  Deterministic on persisted state — safe to recompute every cycle. */
export function ResolveExclusiveGroups(
    edges: readonly EvaluatedEdge[],   // edge + {originStatus, priority, sequence,
                                       //         conditionOutcome: 'satisfied'|'unsatisfied'|'unevaluable'}
): { keptEdgeIDs: string[]; loserEdgeIDs: string[]; skipSeedTaskIDs: string[]; holdTaskIDs: string[] }
```

Application rules — each one exists because the naive wiring is wrong:

- **Exclusive edges are EXEMPT from the generic conditional-edge machinery.** `loadGraphState`'s
  existing loop turns a definite-false edge into `droppedInto` → `unreachableTaskIDs` → `Blocked`
  (:747-769, :397-412). An XOR loser is by definition condition-false — if the generic path
  processes it, the not-taken branch settles **Blocked** and `ComputeParentRollup`'s precedence
  poisons the parent, defeating the entire Skipped design. Edges with a non-null `ExclusiveGroup`
  route **only** through `ResolveExclusiveGroups` → losers → skip cascade; the Blocked path
  remains solely for non-exclusive conditional edges.
- **Split of pure vs. writes**: `ResolveExclusiveGroups` runs inside `loadGraphState` purely —
  loser edges are removed from the returned edge set; `skipSeedTaskIDs` and `holdTaskIDs` ride on
  the returned graph state beside `unreachableTaskIDs`. The `Status='Skipped'` entity writes and
  `TaskSkipped` frames happen **only in `propagateAndRollup`**, beside the existing `TaskBlocked`
  writes (:401-412) — `findClaimableTasks` (the second `loadGraphState` caller) stays a reader.
- **HOLD is what makes "stall visibly" true.** An unevaluable condition ⇒ undecided group ⇒ every
  target task in `holdTaskIDs`: excluded from `ComputeEligibleTasks`' result in
  `findClaimableTasks`, and passed to `IsGraphStalled` so the stall is *actually reported* rather
  than asserted. Without HOLD, a kept edge whose origin is `Complete` is a **satisfied**
  prerequisite and every branch of the fork would fire concurrently — the worst possible XOR
  violation. A typo must not silently reroute (or worse, multiply) a fork.
- New frame kind **`TaskSkipped`** (add to `TaskGraphFrameKind`,
  `packages/TaskGraph/src/types.ts:72-84`).

### 5.4 Compiler emission for sequential mode (consumed by §7)

For every fan-out (origin with >1 outgoing path): each compiled dependency edge carries
`exclusiveGroup: <origin tempId>`, `priority: <AIAgentStepPath.Priority>`, and a `sequence`
ordinal assigned by sorting the fan-out's edges in the **oracle's own order** — `Priority` desc,
then `AIAgentStepPath.ID` ascending (`compareEdges`, graph-traversal-engine.ts:143-148 —
`a.id.localeCompare(b.id)`). Compiled `TaskDependency` rows get fresh UUIDs, so without the
persisted `Sequence` a Priority tie (common — default 0) could deterministically pick a
*different* winner than today's engine; `Sequence` pins the oracle's tiebreak. Original
`Priority` values ride through untouched for the §7 round-trip. Single-successor origins emit
plain edges. Joins on the sequential path stay `Prerequisite` — the Skipped-counts-as-satisfied
rule (§5.2) is what makes them safe; do **not** rewrite them to `Optional` (§4.6: Optional edges
do not gate at all today).

### 5.5 Condition-context superset — parity-critical

Flow conditions are written against `{ payload, stepResult, flowContext, data, context }`
(`buildConditionContext`, flow-agent-type.ts:453-472 on next). Dispatcher conditions see
`{ status, succeeded, failed, output, errorMessage }` (TaskGraphDispatcher.ts:799-805). **A flow's
`payload.x` condition would silently never evaluate under the dispatcher's context.** Fix:
`evaluateEdgeCondition` builds the **superset context** — both dialects readable:

```ts
{ status, succeeded, failed, output, errorMessage,          // dispatcher dialect (unchanged)
  payload,        // the ORIGIN task's post-step payload (OutputPayload.payload, §5.9) — flow dialect;
                  // there is no "global graph payload" — payload is always the origin's snapshot
  stepResult,     // the origin task's stored step result, flow-shaped: { Success, step, result, rawResult? }
  flowContext,    // { currentStepId: originTempId, completedSteps, executionPath, stepCount } rebuilt from Task rows
  data, context } // snapshotted at submit into the parent task's metadata by FlowViaGraphExecutor
                  // (params.data + the JSON-serializable part of params.context) and rebuilt here
```

**Terminality guard — fixes a latent live bug.** `evaluateEdgeCondition` today has **no
origin-terminality check**: it evaluates every conditional edge every cycle, so a condition like
`succeeded` is a *definite false* while the origin is still `Pending` → edge dropped → target
`Blocked` at wave 1, permanently, before the origin ever runs. Any conditioned linear chain —
the most common flow shape — dies at submit. Rule: **conditions are evaluated only against
terminal origins**; a non-terminal origin returns `'keep'` (meaning *undecided*, which is safe
because the prerequisite gate already prevents early execution). §9 pins a 3-node
`succeeded`-conditioned chain (a test that would fail against today's dispatcher).

Differential tests (§9) pin representative conditions from shipped flows in **all** dialects —
including one `data.*` and one `context.*` condition.

### 5.6 Unevaluable conditions + the declared behaviour changes

Flow **rejects** an unevaluable-condition edge (silently takes the alternate path). The
dispatcher's stated intent is the opposite — keep the edge so the graph stalls visibly
(TaskGraphDispatcher.ts:807-814, :742-746) — **but be precise about what the code does today: a
kept edge on a Complete origin is a *satisfied* prerequisite, so the dependent RUNS
(unevaluable ≈ true); nothing stalls.** The visible stall is therefore **new machinery this plan
builds**: the §5.3 HOLD mechanism (undecided groups) plus the same hold applied to non-group
kept-unevaluable edges on terminal origins, both feeding `IsGraphStalled` so the stall is
genuinely reported. **The stall semantic wins at cutover** — a malformed condition changes
behaviour from silent-misroute to visible stall. Fix the stale generated column description on
`TaskDependency.Condition` (it still describes the flow semantics).

**The declared behaviour changes — the complete list** (each gets a release-notes line and a
differential-suite carve-out; anything else surfacing at cutover is a bug):

1. Malformed/unevaluable conditions: silent-alternate-path → visible stall (this section).
2. §4.4's unreachable status-fallback code paths are not ported (dead code, provably unreachable).
3. **Cyclic flows are rejected at compile** with a workflow-vocabulary diagnostic (§7) — the
   in-run walker tolerates back-edges; a run-once Task DAG cannot. No shipped metadata flow is
   cyclic (§9 asserts this stays true).
4. Previously-dead `TimeoutSeconds`/`RetryCount` authored values start taking effect
   (§4.4/§5.8) — fulfilling author intent, but a change for rows where someone set them
   expecting nothing.
5. **(R6, ruled 2026-08-09) Definite-false ordinary conditional edges route through the Skip
   machinery** — Skipped + cascade, exactly like XOR losers — for **all** graphs, and a walk that
   ends settles **`Complete`**, never `Blocked`. `Blocked` is reserved for failure-driven
   unsatisfiability. This corrects the dispatcher's pre-existing behaviour (a not-taken
   conditional branch settled the parent `Blocked`, including for loop-agent graphs). The
   differential simulator must match the *real* dispatcher — as shipped it writes Skipped where
   the dispatcher writes Blocked, hiding this divergence — and the terminal-conditioned-step
   fixture asserts `Complete`.

### 5.7 New runners — host implementations in `packages/MJServer/src/services/`

Pattern: the dispatcher takes runner seams by constructor injection (`types.ts:31-69`), the gate
sits in `findClaimableTasks` (:697-706), the execution branch in `executeClaimed` (:319-340), and
hosts wire them in `StartTaskGraphDispatcher.ts:50-64`. Discrimination today is by assignment
columns (`ActionID` / `AgentID` / neither = human). **Node kind travels in the task's
`InputPayload` metadata** (the compiler/service writes `kind` + `configuration` there) — do NOT
add per-kind columns; `AgentID`/`ActionID`/`UserID` stay authoritative for Agent/Action/Human, and
`Prompt`/`ForEach`/`While` tasks carry `AgentID = <the flow agent>` so the D20 sweep and claim
predicates treat them as runnable agent-side work (see §5.10), the `UserID`-xor-`AgentID`
generated validator passes, and task UIs show the owning workflow. Kind-based routing below keeps
them away from the plain agent runner.

- **⟶ SUPERSEDED by R3 (§14): typed columns shipped instead of this envelope, and were ruled the
  better design.** What exists on `next`: `Task.StepType` (CHECK: the seven kinds) + `Task.PromptID`
  (FK, waiting for the Prompt runner) as real columns, `CK_Task_Assignment` counting `PromptID`,
  and `Task.Configuration` typed by the **`ITaskStepConfiguration`** JSONType (per-kind config,
  `inputMapping`/`outputMapping`, `policy`, `layout`) — strong typing for the machine-known node
  config, while `InputPayload` stays the freeform per-workflow data. Kind routing checks
  `StepType` **before** the `ActionID`/`AgentID` ternary (`runTaskBody`), which is what makes a
  loop-with-ActionID loop instead of running once. The envelope design is preserved below for the
  record only:
- **The `Task.InputPayload` envelope — superseded, historical record.**
  ```ts
  Task.InputPayload = {
      node?: {                       // absent ⇒ legacy column-discriminated task (loop-agent graphs,
          kind: TaskGraphNodeKind;   //          pre-existing rows) — back-compat path, current behaviour
          configuration: TaskGraphNodeConfigMap[K];
          policy?: NodeExecutionPolicy;
          attempt?: number;          // §5.8 retry counter
      };
      input?: unknown;               // the node's starting payload (what runners actually execute on)
  }
  ```
  Every runner reads `input` (never the wrapper): the existing `TaskGraphAgentRunner` /
  `TaskGraphActionRunner` are updated to unwrap when `node` is present — otherwise a compiled
  Sub-Agent node would receive the metadata wrapper as its payload. §5.9's threading reads/writes
  respect the same envelope.
- **Kind routing.** The dispatcher reads `node.kind` **before** the assignment-column ternary: in
  `findClaimableTasks`'s gate (:697-706), a `Prompt`/`ForEach`/`While` task with no matching
  runner injected stays `Pending` (same pattern as action tasks without an `actionRunner`), and
  `kind === 'External'` gets a bare `continue` — **without** calling `notifyHumanTaskReady` (the
  human branch is `else if (!entity.AgentID)`, which would otherwise misfire a 'Task Assignment'
  notification at a null `UserID`; External parks silently — Phase 9's domain driver owns its
  lifecycle). In `executeClaimed`'s execution branch (:319-340), routing is `kind === 'Prompt'` →
  prompt runner, `kind === 'ForEach' | 'While'` → loop runner, else `ActionID` → action runner,
  else `AgentID` → agent runner. External carries neither `AgentID` nor `ActionID`, so the §5.10
  sweep predicate exempts it alongside human tasks for free.
- **`TaskGraphPromptRunner`** — resolves the prompt by name via `AIEngine`, injects payload at
  `CURRENT_PAYLOAD_PLACEHOLDER` + `flowContext` (parity with `InjectPayload`,
  flow-agent-type.ts:318-347), runs `AIPromptRunner.ExecutePrompt`, **deep-merges** the JSON
  response into the graph payload (parity with :241-243). A response with `nextStep.type ===
  'Chat'` or `taskComplete && message` is the **Chat escape**: the runner reports
  `terminal: { message }`; the dispatcher marks every remaining `Pending` task in the graph
  **`Skipped`** (not `Cancelled` — `ComputeParentRollup`'s precedence would otherwise settle
  the parent `Cancelled` when the flow in fact finished by talking to the user), the parent
  rolls up `Complete`, and the message rides in the parent's output metadata → surfaced by the
  §6 waiter exactly like today's terminal Chat step.
- **`TaskGraphLoopRunner`** (ForEach + While) — a loop node stays **one Task row**; the runner
  executes iterations internally, reproducing §4.3 exactly: same defaults, same
  sequential-threading / parallel read-only + ordered last-writer-wins application, same template
  context, same per-iteration output-mapping with `[index]` tokens, same
  item-as-sub-agent-payload-override; iteration bodies invoke `ActionEngineServer.RunAction` /
  `AgentRunner.RunAgent` directly. **Prerequisite refactor**: extract `applyActionOutputMapping`,
  `setMappedValue`, `resolveNestedValue`, and the `{{…}}` template-resolution helpers out of
  `flow-agent-type.ts`/`base-agent.ts` into pure modules in `packages/AI/CorePlus/src/` and
  re-import them from the originals — shared code, not cloned code; this is the anti-drift move
  and it is what makes the differential tests meaningful. Per-iteration expansion into child Task
  rows is explicitly **out of scope** (new semantics, not parity) — recorded as a future option.
- **Existing** `TaskGraphAgentRunner` / `TaskGraphActionRunner` grow: input/output mapping
  evaluation for `Action` nodes using the same extracted helpers — the non-loop dialect is
  **five** resolvers, not four: `static:`/`payload.`/`data.`/`context.` prefixes **plus
  `conversation[N].content` references** (`resolveNestedValue`, flow-agent-type.ts:984-1035 on
  next, via `ConversationMessageResolver` against `params.conversationMessages`). The dispatcher
  has no conversation in scope, so `FlowViaGraphExecutor` snapshots `params.conversationMessages`
  into the parent task's submit-time metadata (§6.1) and the mapping helper receives them from
  there — without this, a flow using a conversation reference silently gets the raw string, and
  the order-comparing differential suite cannot catch it. Also: Sub-Agent message/context
  propagation parity for `Agent` nodes compiled from flow steps.

### 5.8 Failure semantics + policy — the `failureSemantics: 'edges'` design

**Flow's real failure semantics are edge-driven, and the dispatcher's default is the opposite.**
In a flow, after ANY Failed step the walker evaluates the step's outgoing paths with
`stepResult.Success === false` in context — a satisfied path (including an unconditional one) is a
**recovery path** and runs; none satisfied → the run fails ("Flow step failed with no recovery
path", flow-agent-type.ts:1245-1279). In the dispatcher, `Failed` is UNSATISFIABLE and dependents
are Blocked. Honouring either default for the other's graphs would break them, so the semantic is
**scoped by a spec-level flag**, not per node and not by provenance sniffing:

```ts
TaskGraphSpec.failureSemantics?: 'block' | 'edges';   // default 'block' — today's dispatcher behaviour
```

The compiler sets `'edges'` on every flow-compiled spec. Under `'edges'`:

- A `Failed` origin's outgoing edges are **still evaluated** (§5.5 context carries
  `stepResult.Success === false`, `failed === true`); `ResolveExclusiveGroups` decides groups on
  any terminal origin, Complete **or Failed**.
- `ComputeTasksToBlock` does **not** seed from a Failed node that produced a satisfied outgoing
  edge (a *handled* failure); it still seeds from a Failed node with no satisfied outgoing edge
  (*unhandled* — parity with "no recovery path": the graph fails with that step's error).
- `ComputeParentRollup` treats handled-Failed like Skipped for precedence — a flow that recovered
  and reached the end settles **`Complete`**, exactly as today.
- Loop-agent graphs (no flag) keep today's Failed-is-terminal behaviour untouched.

**Policy** (per node, in the `InputPayload` envelope): `policy.timeoutSeconds` → runner-level
timeout + claim-TTL input (§5.10). `policy.retryCount` → **retries live in the completion path,
never as a post-Failed sweep**: on runner failure with `attempt < retryCount`, `executeClaimed`
records `Status = 'Pending'` (incrementing `node.attempt` in the envelope, last error in
`ErrorMessage`) so the pure layer **never observes a transient `Failed`** — by the time a task
reads `Failed`, retries are exhausted. (A post-Failed re-dispatch would race `propagateAndRollup`:
dependents Blocked, parent settled, and `deliverContinuation`'s once-ever marker burned before the
retry ran.) The existing `TaskGraph.RetryTask` RO remains the *manual* verb for terminal Failed
tasks and resets the attempt counter. `policy.onError` is round-trip carriage only (§4.4 — the
column is dead config; behaviour comes from `failureSemantics`). Grep confirms zero
`onError|continueOnError|allowFailure` hits in the dispatcher stack today — all of this is new
machinery. `ForEachOperation.continueOnError` is the same concept at iteration granularity and
shares vocabulary, not code path.

### 5.9 Payload threading for flow-compiled graphs — the total rule

A flow has one evolving payload; the graph substrate has per-task `OutputPayload`. The rule,
**total by construction**: a node threads its starting payload from its **unique predecessor
whose status is `Complete` or handled-`Failed`** (§5.8) — Skipped predecessors are transparent
(they contribute nothing and never block the choice); the entry node reads the submit-time
`input` from the envelope. More than one live predecessor is **impossible for
sequential-compiled graphs** (XOR guarantees one live branch); the dispatcher asserts this and
fails the graph loudly if violated rather than guessing. Runners write the full post-step payload
back as `OutputPayload = { payload, stepResult }` (so §5.5 builds both context dialects) — **on
failure too, including `executeClaimed`'s exception path**: a Failed task persists
`{ payload: <its input snapshot>, stepResult: { Success: false, ... } }`, because flow threads
`currentPayload` through Failed steps into recovery paths today, and a null-payload recovery
target would silently lose the whole flow state. For sequential graphs this reproduces
single-walker threading exactly. Parallel-mode merge semantics are **out of parity scope**
(nothing ships parallel) and are designed when parallel compilation is turned on.

### 5.10 Claim integrity (D20 territory) — two fixes that predate this track but become acute

1. **Sweep blind spot**: `ReleaseExpiredClaims` and `FindOrphanedInProgress` filter
   `AND "AgentID" IS NOT NULL` (TaskClaimStore.ts:170, :185, :216), so an **action** task whose
   dispatcher dies mid-run stays `In Progress` with an expired claim forever. Change the predicate
   to *"has any runnable assignment"* (`AgentID IS NOT NULL OR ActionID IS NOT NULL`); human
   tasks (and Phase 9's External) remain the only exemptions. Post-cutover every flow Action step
   is such a task — this ships **before** cutover.
2. **Event-loop starvation vs. claim expiry** (author's clean-room finding): in-process embedding
   batches froze Node for ~104 s; `DEFAULT_DISPATCHER_CONFIG` is `ClaimTTLSeconds: 300` /
   `HeartbeatIntervalSeconds: 60` — a frozen-but-alive owner stops heartbeating, its claim
   expires, the sweep re-dispatches, and the work runs twice (the CAS in `CompleteClaimed`
   prevents double-*completion*, not double-*execution* — LLM cost and action side effects
   duplicate). Mitigations, all in C1.2: claim TTL for a claimed task derives from
   `max(ClaimTTLSeconds, policy.timeoutSeconds + ClaimTTLSeconds)` so long-running nodes carry
   proportionate claims; the risk register (§12) records the starvation source; no further
   machinery — off-thread heartbeats are out of scope.

### 5.11 Frames

`TaskGraphFrameKind` += `'TaskSkipped'` and `'NodeProgress'` (`NodeProgress` carries
`{ TaskID, TaskName, Message?, Percentage? }`, emitted by runners via a callback the dispatcher
passes in — this is what the §6 streaming bridge consumes). Frames still flow to the observer →
`TaskGraphFrameBroadcaster` → `taskGraphFrames(parentTaskId)` subscription. (Reminder: that
subscription has **zero client consumers today**; §6 makes chat consume it server-side, and the
Workflows dashboard consumer stays with the 5b UI debt.)

---

## 6. The calling contract (C1.3) — what a flow invocation returns after cutover

Today a flow run **is** an `AIAgentRun`: synchronous, awaited, streamed, cost-accounted,
chat-bound. Verified callers and their expectations:

| Caller | Call | Expects |
|---|---|---|
| Conversations | `RunAIAgentResolver` → `RunAgentInConversation` (RunAIAgentResolver.ts:431-448) | awaited result + `onProgress` push updates (`createProgressCallback` :255-305, filtered to `significantSteps = ['prompt_execution','action_execution','subagent_execution','decision_processing']`) |
| Execute Agent action | `execute-agent.action.ts:110-120` | awaited `ExecuteAgentResult`; outputs `AgentRunID`/`Payload`/`AgentResult` |
| Scheduled jobs | `AgentScheduledJobDriver.Execute` (:59-69) | awaited; `onProgress` doubles as the scheduler heartbeat |
| Sub-agent steps | parent BaseAgent awaits the child run | awaited result + payload |
| Loop-agent `Tasks` | `executeTasksStep` — already **submit-and-detach** by design | unchanged |

**⟶ SUPERSEDED by R1 (§14): detach-by-design is ratified — submit-and-detach is the universal
flow calling contract** ("you don't talk to a workflow"). The original ruling below is preserved
as the record of what the caller table's expectations *were*; under detach, those expectations are
resolved instead by R1's two bills: **(a) envelope truthfulness + result delivery** — on
`GraphSettled` the submitting run's outcome is corrected and the settled payload delivered
(without this, an `AIAgentRun` claims `Completed` forever for a workflow that failed, and the
result reaches no caller); **(b) submit-time enforcement** that a Flow agent cannot be a
sub-agent step or a scheduled target until an await path exists — loud failure instead of
success-before-work. §6.1–§6.4 below (FlowViaGraphExecutor, WaitForSettlement, streaming bridge,
HITL/CompleteTask) are the superseded attached-mode design, kept as the reference for whichever
pieces (Prompt runner's Chat escape, `CompleteTask` RO, progress surfaces) get revived under the
detach model — the *needs* they addressed (progress visibility, human-task completion, chat
resume) still exist and are re-homed in the restored Workflows app (R4) and future UX work.

*Historical (superseded) ruling:* attached await-settlement is the default for flow invocation;
detach is opt-in (and remains the loop-primitive's shape). Every caller above keeps its contract.

### 6.1 `FlowViaGraphExecutor` (new module, `packages/AI/Agents/src/`)

**Entry — wired in C1.4, not in C1.3.** At cutover, `BaseAgent`'s execute path routes here
instead of the step loop when `config.agentType` resolves to the Flow type
(`DriverClass === 'FlowAgentType'`, type row `4F6A189B-C068-4736-9F23-3FF540B40FDD`). In C1.3 the
module is built, exported, and reachable **only** from the §9 differential/integration tests,
which construct and invoke it directly — no `BaseAgent` routing change lands before the §8 gates
close (that routing IS the cutover). The executor:

1. Creates the **envelope `AIAgentRun`** via the existing run-init (`initializeAgentRun`) —
   `Status='Running'`, conversation binding, `LastRunID` chain, `ContinuationDepth` all work as
   today because it IS a normal run row.
2. Writes **one `TaskGraph` run step** (D10 pattern, parity with `executeTasksStep`
   :11931-11936) carrying `{ spec, compiled: true, parentTaskID }` — per-node forensics live in
   Task rows and each node's own child `AIAgentRun` (`Task.AgentRunID`); the envelope's run steps
   are deliberately just this one. **This is the D8 restatement** (parent-plan amendment).
3. Compiles (§7) and submits through `GetTaskGraphSubmitter()` with `AgentRunID = envelope.ID`,
   `ReinvokeDepth = envelope.ContinuationDepth` (existing seam,
   `task-graph-submitter.ts:25-53` — unchanged shape), **snapshotting `params.data`, the
   JSON-serializable part of `params.context`, and `params.conversationMessages` into the parent
   task's metadata** — §5.5's condition context and §5.7's conversation-reference mapping dialect
   are rebuilt from these at dispatch.
4. **Awaits settlement** (attached) or returns after submit (detached, when
   `params.data?.detached === true` — the opt-in).

`packages/AI/Agents` still takes **no dependency** on `@memberjunction/task-graph` — the seam
stays in CorePlus.

### 6.2 Settlement seam (CorePlus) + implementation (TaskGraph)

Extend the abstract submitter with:

```ts
public abstract WaitForSettlement(request: {
    ParentTaskID: string;
    TimeoutMs?: number;                 // default: caller's maxExecutionTimeMs, else 30 min
    Signal?: AbortSignal;               // cancellation → TaskGraph.Cancel
    OnFrame?: (frame: TaskGraphFrameLike) => void;   // §6.3 streaming bridge
}): Promise<SettlementOutcome>;
// SettlementOutcome: { Kind: 'Settled' | 'AwaitingHuman' | 'Timeout';
//                      Status?: string; Payload?: unknown; Message?: string; ErrorMessage?: string;
//                      AwaitingTaskID?: string }
```

`TaskGraphSubmitterImpl` implements it: primary signal = an in-process frame tap
(`StartTaskGraphDispatcher` wires a multiplexing observer so waiters can subscribe by
`ParentTaskID`); fallback = polling the parent Task row with `BypassCache: true` (the claim
protocol's direct SQL fires no cache invalidation — every dispatcher-adjacent read must bypass).
Cross-process callers only have the polling path; that is acceptable and stated.

Settlement → result mapping in `FlowViaGraphExecutor`: parent `Complete` →
`ExecuteAgentResult { success: true, payload: <parent payload snapshot>, agentRun: envelope }`,
envelope finalized `Completed` + `FinalPayload`; parent `Failed`/`Cancelled` → `success: false`,
envelope `Failed`/`Cancelled` with `ErrorMessage`. **Finalization rules, complete:**

- **The dispatcher's settlement write is unconditional** — on `GraphSettled`, if the parent Task
  carries an `AgentRunID` whose `AIAgentRun` is still `Running`, finalize it from the rolled-up
  status (add beside `deliverContinuation`). This single rule covers detached graphs AND
  timed-out attached waiters — no "detached" marker exists or is needed.
- **The waiter finalizes only if the envelope is still `Running`.** The residual check-then-act
  race with the dispatcher's write is benign: both writers derive the identical terminal state
  from the same settled graph.
- **`Kind: 'Timeout'`**: the executor returns `success: false` with a timeout message and does
  **not** finalize the envelope — the dispatcher's unconditional write is the eventual finalizer
  when the graph actually settles.
- **§6.4.4's re-attach updates the parent Task's `AgentRunID` to the new envelope**, so
  dispatcher-side finalization always targets the live run, not the pre-pause one.

### 6.3 Streaming bridge — greenfield, named work item (was §8.2's understatement)

Verified: `TaskGraphAgentRunner` passes **no `onProgress`**; dispatcher progress reaches **no UI
at all** today. The bridge: `WaitForSettlement`'s `OnFrame` receives `TaskStarted` /
`TaskCompleted` / `TaskFailed` / `TaskSkipped` / `NodeProgress` frames;
`FlowViaGraphExecutor` translates them into `params.onProgress` callbacks using **step values
inside the resolver's `significantSteps` filter** (`Agent` node → `'subagent_execution'`,
`Action` → `'action_execution'`, `Prompt`/loop → `'prompt_execution'`; message = step name;
percentage from completed/total). Chat streaming then works with **zero resolver and zero client
changes**, and the scheduler heartbeat keeps firing for free. Exit criterion: a chat-invoked flow
shows per-step progress; the demo flow's progress trace pre/post cutover is captured in the
differential evidence.

### 6.4 HITL — reframed by verified facts, with exit criteria (was §8.1)

What exists today, precisely: a flow can pause **only** via a Prompt step's Chat escape — the run
**terminates** (`executeChatStep` → `createFeedbackRequest` writes `MJ: AI Agent Requests`
`Status='Requested'`; `finalizeAgentRun` sets the run `AwaitingFeedback`), and "resume" is a **new
run** chained by `LastRunID` with **fresh flow state** — nothing restores position
(`InitializeAgentTypeState` always builds a fresh `FlowExecutionState`; nothing passes
`startAtStep`). The dashboard's `RespondToAgentRequest` never resumes anything (returns
`resumed: false` unconditionally). So graph-parking is *stronger* continuity than today's
mechanism, and the parity bar is the **chat UX**, not the internals.

C1.3 ships:

1. **Prompt Chat-escape parity** — §5.7's terminal path + §6.2's `Message` surfaces the
   mid-flow "talk to the user and stop" shape identically to today (envelope `AwaitingFeedback`
   when the message is a question — mirror `finalizeAgentRun`'s Chat mapping — plus the feedback
   request row via the existing `createFeedbackRequest` logic against the envelope).
2. **Human task nodes in chat**: on `SettlementOutcome.Kind === 'AwaitingHuman'`, the envelope
   goes `AwaitingFeedback` with a feedback request; the dispatcher's existing
   `notifyHumanTaskReady` ('Task Assignment' notification + `TaskAwaitingHuman` frame) covers the
   task-inbox surface.
3. **`TaskGraph.CompleteTask` Remote Operation** — pulled forward from Phase 9's contract,
   scoped to **human tasks** here (`taskID`, `outputPayload?`; caller must be the assigned
   `UserID` or hold elevated capability; CAS state guard: only `Pending`/`In Progress` human
   tasks complete; second completion rejected). Phase 9 extends the same RO to `External` with
   the elevated-caller domain-driver check — one verb, two phases, per the standing RO rule.
4. **Resume from chat**: when the conversation routes the user's reply back to the flow agent
   with `lastRunId` (existing continuity heuristic), `FlowViaGraphExecutor` detects a live
   parked graph on the prior envelope (parentTaskID in its `TaskGraph` step / metadata),
   completes the awaited human task via the CompleteTask path with the reply as
   `outputPayload`, creates a new envelope run (`LastRunID` chain — parity with today's resume
   shape), and re-attaches to the **same** graph. `syncFeedbackRequestFromConversation` then
   closes the request row exactly as today.

**Exit criterion (gate for C1.4):** one shipped demo flow with a human step runs end-to-end in
chat (pause → notification → reply → downstream released → settled) **and** via the task-inbox
path, on a clean bootstrap database.

---

## 7. Compiler + round-trip (C1.1)

**One projection path.** `ConvertAgentSpecToTaskGraph` (`task-graph-to-agent-spec.ts:212-245`)
already goes AgentSpec → TaskGraphSpec but is dead code with zero non-test call sites — and it
predates spec v2 (writes `agentName`, drops `dependencyType`, no conditions on the reverse of
`Priority`). The new **`FlowGraphCompiler`** (pure, `packages/AI/CorePlus/src/task-graph/flow-graph-compiler.ts`)
**replaces it — delete the old function in the same change** (keeping both is the drift disease
this plan cures). Input: `AgentSpec` (Steps + Paths — the same shape `AgentSpecSync` round-trips)
plus `{ traversalMode, joinMode }` resolved per §4.6. Output: v2 `TaskGraphSpec`.

Rules, in order — the ordering is load-bearing:

1. **Exclusion**: non-Active steps are excluded entirely — no node, and every path touching them
   (either direction) produces no dependency. Never emit-with-dropped-edges (§4.4: an edge-less
   node is immediately eligible and would run at wave 1).
2. **Single entry**: the entry is the **alphabetically-first `StartingStep = true` step** —
   parity with `getStartingSteps`' Name sort + `startingSteps[0]` (§4.4); other starting steps
   are not entries. A non-Active entry (or no Active starting step) is a **compile error** in
   workflow vocabulary (parity with "No active steps found").
3. **Reachability prune**: after exclusion, every node unreachable from the entry is excluded —
   the walker can never reach it, so it must not become a second root that executes.
4. **Cycle rejection** (declared change #3, §5.6): run `DetectCycle` on the compiled edge set;
   a cyclic flow fails compilation with a workflow-vocabulary diagnostic naming the looping
   steps ("these steps form a loop: A → B → A; express repetition as a ForEach or While step").
   The in-run walker tolerates back-edges; a run-once Task DAG cannot, and the task-graph
   validator would otherwise reject it downstream with graph vocabulary (a D18 violation).
5. **Emission**: step → node per §4.1's mapping column; path → dependency with direction flip,
   `condition`, `priority`, `pathPoints`; fan-outs → `exclusiveGroup` + `sequence` per §5.4;
   `TimeoutSeconds`/`RetryCount`/`OnErrorBehavior` → `policy` (behaviour per §4.4/§5.8);
   `PositionX/Y`/`Width`/`Height` → `layout`; loop `Configuration` JSON → the typed operation;
   spec-level `failureSemantics: 'edges'` (§5.8).

**Round-trip property test**: `Flow → TaskGraphSpec → Flow` (compiler ∘ the D17 converter
`ConvertTaskGraphToAgentSpec`) preserves nodes, edges, conditions, priorities, policy, layout, and
configuration. **That property cannot hold against the converter as it exists** — verified: it
emits ONLY `StepType: 'Sub-Agent'` steps, hardcodes `Priority: 0`, and has no handling for
policy, layout, pathPoints, exclusiveGroup, or any v2 kind — so C1.1 explicitly scopes a **full
spec-v2 converter upgrade**, not a patch: `kind` → `StepType` arms for all compiled kinds
(`Agent`→Sub-Agent, `Action`→Action, `Prompt`→Prompt, `ForEach`/`While`→their step types +
`Configuration`; `Human`/`External` keep the stated-loss pattern), dependency `priority` passed
through (replacing the hardcoded 0), `policy` → the three step columns, `layout` →
`PositionX/Y`/`Width`/`Height`, `pathPoints` round-trip, and `exclusiveGroup`/`sequence` elision
(reconstructed as plain fan-out paths — they are compiler artifacts, not authored data). Plus the
two verified bug fixes: silent `dependencyType` drop (no loss entry) and `actionName` nodes
mislabeled as `HumanTask` losses.

**Layout — ruled**: per-node `layout?` + per-edge `pathPoints?` in the spec (an ephemeral contract,
not a stored schema; a side table adds a join for zero benefit). Guardrails: the dispatcher must
ignore layout entirely; the validator must never require it.

---

## 8. Cutover gates — **overtaken by events (§14)**

*The cutover shipped in #3692 with this scorecard: gate 5 shipped; gates 1/4/6 partial; gates
2/3/7 absent. AN-BC accepted the merge; the unmet gates convert into the §14 punch list rather
than blocking. The list below stands as the definition of "the cutover is actually finished":*

1. **Differential suite green** (§9) across every Flow agent in `metadata/`, plus golden fixtures
   captured and committed.
2. **Streaming bridge live** (§6.3 exit criterion).
3. **HITL end-to-end** (§6.4 exit criterion).
4. **`failureSemantics: 'edges'` + policy + Skipped/XOR/HOLD machinery** landed with IT71
   coverage (C1.1 pure layer + C1.2 application).
5. **Sweep predicate fix** (§5.10.1) landed.
6. **Sub-agent depth**: a flow invoking sub-agents through the dispatcher preserves
   `ContinuationDepth` semantics (envelope inherits, children inherit from envelope) — IT-pinned.
7. **Zero-mileage burn-in**: the deterministic tier's graph bundles (IT71 + the new C1 bundles)
   run green on a **clean bootstrap database** (`migrations/` + `metadata/` only), not just the
   long-lived dev DB.

Cutover itself (C1.4): route `FlowAgentType` execution through `FlowViaGraphExecutor`; the in-run
executor and its adapters become **unrouted** (reachable only from the differential suite; no
runtime flag, no dual-run in production — the §10 non-goal is about divergent *live* logic, and the
oracle is not live logic). **Deletion happens in Track R**, after the fixtures (§9) make the suite
runnable without the live oracle.

---

## 9. Testing — the differential suite is the centrepiece

> For every Flow agent defined in **metadata files** (`metadata/agents/`), compile to a
> `TaskGraphSpec`, derive the execution order the dispatcher would produce, and assert it is
> identical to what the in-run walk produces today.

Construction rules, all ruled:

- **Inputs from metadata files, never the database.** A suite that reads live DB state inherits
  the "test goes green by deletion" failure mode (the CD3 incident: the defect survived, the
  evidence rows didn't). Fixture specs may supplement metadata-defined flows.
- **Offline on both sides.** Oracle side: a pure walk over `SelectOutgoingEdges` + `paths[0]`
  semantics (the real production path). Dispatcher side: a pure simulator over
  `ComputeEligibleTasks` / `ComputeTasksToBlock` / `ComputeSkipCascade` /
  `ResolveExclusiveGroups` with scripted step results — all of these are pure functions by
  doctrine, so no DB, no models, no dispatcher process.
- **Golden fixtures before any deletion**: capture the oracle's output for every shipped flow as
  committed fixtures. They are the honest exit from "retain the oracle" — Track R deletes the
  executor, the fixtures keep the suite runnable in CI forever.
- **Determinism carve-outs, stated in the suite**: the §5.6 unevaluable-condition divergence
  (declared change — assert the *dispatcher* behaviour, cite the ruling); anything parallel
  (out of parity scope — nothing shipped is parallel).
- **Per-capability negative tests** (corrected from v1): a `Disabled` step **is absent from the
  compiled spec and never executes**, its incoming edges cause priority fall-through to the
  alternate sibling, and its exclusive successors never run (NOT "must not orphan successors" —
  orphaning the not-taken branch is the correct behaviour); an orphan step (no incoming paths,
  not the entry) never executes; a sequential fan-out produces **exactly one executed
  successor** (NOT a chain); **`maxIterations: 0` executes ZERO iterations** — the
  "0=unlimited" JSDoc on `ForEachOperation`/`WhileOperation` is doc-fiction BaseAgent never
  implemented (`Math.min(length, maxIterations)`, `while (count < maxIterations)`); the runner
  must NOT implement it, and C1.2 fixes the stale JSDoc; ForEach default 1000 vs While default
  100 pinned separately; a Failed step with a satisfied outgoing edge runs the recovery branch
  and the graph settles `Complete`; a Failed step with no satisfied edge fails the graph
  (§5.8); `Priority` decides the XOR winner and a Priority **tie** resolves by `Sequence` to
  the same winner as `compareEdges`; an all-conditions-false fork skips its branches and
  settles `Complete`; a condition-false XOR loser ends **`Skipped`, never `Blocked`**; a 3-node
  `succeeded`-conditioned chain executes in order (fails against today's dispatcher — §5.5
  terminality guard); a Skipped prerequisite satisfies eligibility; an all-Skipped-predecessor
  task is Skipped (cascade-before-eligibility order pinned by a unit test); parent rollup with
  Skipped children settles `Complete`; all §5.5 condition dialects evaluate (incl. `data.*`
  and `context.*`); no Flow agent in `metadata/` is cyclic (guards declared change #3).
- **Integration**: one flow run on both engines comparing `AIAgentRunStep` order to `Task` order.
  Note the mechanics precisely: flows are not *routed* to the dispatcher before C1.4 — the
  dispatcher side of this test drives the compiled spec **directly through the submitter seam**
  (and, in C1.3, through `FlowViaGraphExecutor` invoked explicitly by the test), while the in-run
  side runs the flow normally. After Track R deletes the in-run executor, the golden fixtures
  carry this weight. New IT bundles are **mutation-class** (`RUN_MUTATION_TESTS=1`) following the
  IT75 posture; IT71 extends for the read-only graph checks.

---

## 10. Phasing — **overtaken by events (§14)**

*#3692 shipped C1.0 + C1.1 (minus metadata-driven suite/fixtures) + most of C1.2 (minus Prompt
runner, failureSemantics wiring, policy/retries, NodeProgress) + fragments of C1.3 (cost rollup
only) + the C1.4 routing, in one omnibus. Remaining work proceeds as the §14 punch list in
follow-up PRs, not as these phases; C1.5 (Prompt loop bodies) and Track R (oracle deletion, gated
on golden fixtures) are unchanged. The table below is the historical phasing:*

| Phase | Deliverable | Depends on | Risk |
|---|---|---|---|
| **C1.0** | Spec v2 (§3): union + `External` + policy + layout + dependency `priority`/`sequence`/`exclusiveGroup` + `failureSemantics`; `NormalizeTaskGraphSpec` at **every boundary enumerated in §3** (six call sites across five files); validator rewrite (+ object-form self-dep fix); **RO wire update** (4 inline defs + push + codegen); loop-prompt docs behind both gates | — | none — additive, dual-accept |
| **Phase 9** (parent plan) | Caliber external nodes ride on `kind:'External'` — never sees the flat arms | C1.0 | per parent plan |
| **C1.1** | **Pure layer + compiler + suite** — the §5.2/§5.3 graph-algorithms work is pure TypeScript and lands HERE (Skipped in the TS unions, eligibility/rollup/`failureSemantics` changes, `ComputeSkipCascade`, `ResolveExclusiveGroups`), because §9's simulator is built on it; `FlowGraphCompiler` (replaces `ConvertAgentSpecToTaskGraph`, which is deleted); full spec-v2 D17-converter upgrade (§7); round-trip property test; **differential suite + golden fixtures** (§9). The `Skipped` DB value isn't needed until the dispatcher writes it — the migration stays in C1.2. | C1.0 | none — not wired to execution |
| **C1.2** | **Dispatcher application**: migration (§5.1), applying §5.2-5.4 (Skipped writes, XOR exemption + HOLD), superset condition context + terminality guard (§5.5), §5.6 machinery, Prompt/Loop runners + shared-helper extraction + `InputPayload` envelope (§5.7), `failureSemantics` + policy + completion-path retries (§5.8), payload threading (§5.9), claim fixes (§5.10), new frames (§5.11) | C1.0, C1.1 | none — new paths unused by flows |
| **C1.3** | Calling contract: `FlowViaGraphExecutor`, envelope run + D8-restated forensics, `WaitForSettlement`, streaming bridge, HITL + `TaskGraph.CompleteTask` RO (§6) | C1.1, C1.2 | low — flows still route in-run |
| **C1.4** | **Cutover**: Flow execution routes through the executor; in-run executor unrouted (oracle-only); stale `:709` comment + dead status-fallbacks removed where they're now provably unreachable; §8 gates all closed | §8 | ⚠️ the one risky change, gated |
| **C1.5** | Close `Prompt` loop bodies (new capability, not parity) | C1.4 | additive |
| **Track R** | In-run executor + adapters **deleted**; fixtures keep the suite alive; BaseAgent decomposition proceeds per its own charter | C1.4 + burn-in | per Track R |

Each C1 phase is its own PR cut fresh from `next`, ledger row added on merge, per program
convention. C1.0–C1.2 are no-behaviour-change; risk concentrates in C1.4 behind the §8 gates.

---

## 11. Decisions — resolved (were v1's open ⬥)

1. **Back-compat**: normalise legacy flat fields at parse time, at every boundary listed in §3
   including the RO wire; deprecate, dual-accept for one release. *(Ruled via review + author
   agreement.)*
2. **Prompt loop bodies**: close in C1.5; excluded from the parity gate.
3. **Streaming/HITL**: in scope, as **named cutover gates with exit criteria** (§6.3, §6.4). They
   gate C1.4; they do not gate C1.0–C1.2.
4. **Layout**: per-node `layout?` (+ per-edge `pathPoints?`) in the spec; dispatcher ignores;
   validator never requires.

**Supersessions this track carries into the parent plan** (recorded there as amendments; the freeze
rule is satisfied by AN-BC's direct instruction to bake the review in): **D6** — the kept executor
is now the dispatcher; the in-run executor becomes oracle-only at C1.4 and is deleted in Track R.
**D7** — parallel flow execution arrives via the dispatcher (compiler emits parallel shapes), not
via frontier traversal in the flow engine; `AdvanceFrontier` (zero production callers) goes with
Track R's deletion. **D8** — restated: run steps remain intra-run forensics (each *node's* child
run keeps its steps; the envelope carries the one `TaskGraph` step); Task rows are the
orchestration record for **all** flow execution post-cutover; nothing is double-written.

---

## 12. Risk register

| Risk | Mitigation |
|---|---|
| **Zero production mileage** — `__mj.Task` has never held a row; the substrate the cutover moves every flow onto is exercised only by its own tests | §8.7 clean-bootstrap burn-in; C1.2/C1.3 land weeks of soak before C1.4; oracle retained |
| **Event-loop starvation vs. claim expiry** — a frozen-but-alive dispatcher stops heartbeating; CAS prevents double-completion, not double-execution | §5.10.2 TTL derivation; known starvation source (in-process embeddings) documented; revisit off-thread heartbeats only if observed post-cutover |
| **Condition-dialect miss** — a shipped flow's condition silently never fires under the dispatcher context | §5.5 superset context + differential pinning of real shipped conditions |
| **XOR mis-compile on conditional fan-outs** — the v1 chain bug class | §2/§5.3 design + §9 negative tests; the suite would catch a regression on day one |
| **Wire-type drift recurrence** — RO defs lag the spec again | C1.0 updates all four in the same change; review checklist item for any future spec change |
| **Two projection paths reappear** | `ConvertAgentSpecToTaskGraph` deleted in C1.1, same change that lands the compiler |

---

## 13. Non-goals

- **No `Workflow` table.** A workflow's WHAT is a Flow agent.
- **Not merging the editor's two node-type catalogs.** `AGENT_STEP_TYPE_CONFIGS` are
  `AIAgentStep.StepType` values; the spec's kinds are execution shapes.
- **No runtime `ExecutionMode` flag, no production dual-run.** The oracle-only retention (§8) is
  test harness, not live logic; `flow-graph-adapters.ts`'s drift warning concerns divergent live
  logic and is not violated.
- **No per-iteration Task rows for loops** (§5.7) — parity first; revisit as capability later.
- **No parallel-mode payload-merge design yet** (§5.9) — designed when parallel compilation turns on.
