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
| 0 | Legacy retirement — Workflow trio, the `Report*` family, Scheduled Actions, Output Trigger Types | [#3553](https://github.com/MemberJunction/MJ/pull/3553) | ✅ Merged 2026-08-06 |
| 1 | Truthful engine — Task columns + indexes + backfill, failure propagation, cycle detection, wave parallelization | [#3562](https://github.com/MemberJunction/MJ/pull/3562) | ✅ Merged 2026-08-07 |
| 2 | Placement — `@memberjunction/task-graph`, dispatcher + claim protocol, server-side detection, client → observer | [#3574](https://github.com/MemberJunction/MJ/pull/3574) | ✅ Merged 2026-08-07 |
| 2a | Follow-up — control plane converted to Remote Operations; dispatcher actually started at boot | [#3576](https://github.com/MemberJunction/MJ/pull/3576) | ✅ Merged 2026-08-07 |
| 3 | The primitive — `'Tasks'` in the Loop union, `TaskGraphSpec`, folding, continuations, opt-in metadata, prompt migration | [#3588](https://github.com/MemberJunction/MJ/pull/3588) | ✅ Merged 2026-08-07 |
| 4 | Convergence — `GraphTraversalEngine`, joins + `traversalMode`, human tasks, sweep enforcement, Save as Workflow | [#3596](https://github.com/MemberJunction/MJ/pull/3596) | ✅ Merged 2026-08-07 |
| 5 | Workflow UX — editor upgrade, runtime overlay, Create Workflow entry, D18 vocabulary sweep | [#3602](https://github.com/MemberJunction/MJ/pull/3602) | ✅ Merged 2026-08-07 — **front door deferred, see below** |
| 6 | Track E — `WorkflowSpec`: WHAT bound to WHEN, reconciled onto existing substrates; entity-change + schedule triggers; Workflow.Save/Validate | [#3606](https://github.com/MemberJunction/MJ/pull/3606) | ✅ Merged 2026-08-07 |
| 7 | Track D — trigger layer: After\*-only + normalized invocation types, scope reconciliation, filter refusal, self-trigger guard, scheduler notification/Execute-Now fixes, `UQ_EntityAction` drop, TG14–TG16 + the Phase 6 round-trip test | [#3610](https://github.com/MemberJunction/MJ/pull/3610) | ✅ Merged 2026-08-07 |
| 7a | Follow-up schema bundle from #3610 — **shipped self-titled "Phase 8"**: live signal resolved as **dispatcher lifecycle frames** (option b, AN-BC ruling — `taskGraphFrames(parentTaskId)` subscription, fail-closed ownership), `AIAgentRun.ContinuationDepth` (reinvoke cap now real), `MissedRunPolicy` (`RunOnce` default — matching actual prior behavior, not assumed behavior), one-shot via `EndAt` + `Status='Expired'` retirement, `TaskOrchestrator` retired. **Trigger vocabulary normalization deferred by AN-BC ruling** — the four surfaces answer different questions (run provenance vs. when-within-the-save vs. schedule-by-definition); collapsing them is over-normalization, scope decided before any migration. | [#3617](https://github.com/MemberJunction/MJ/pull/3617) | ✅ Merged 2026-08-08 |
| 5a | Phase 5 remainder — Create Workflow front door in a new **Workflows** app (D18 at the navigation level: automation seekers don't look under "AI"; Scheduling/Routines set the own-app precedent) + all three `front-door-v1.html` screens per the five ratified answers. Settled-runs-only promotion enforced three ways (handler guard, tab order, `aria-disabled`); answer ④ save flow with name-seeding; no trigger asked at capture, and the card says so; **D18 enforced by test** — templates asserted free of graph/DAG/node/Flow-Agent *with the companion assertion that "step" IS present*, so the rule can't be satisfied by deleting the concept (the guard caught its own template on first run). Canvas embedded, not routed (the invented `NavigateToResource` caught and removed); saved workflows open via `OpenEntityRecord('MJ: AI Agents', …)` until the editor has a route. **⟶ Whiplashed by #3692 then re-ruled (R4, AN-BC 2026-08-09): #3692 retired this app (single-editor pivot — authoring moves to the first-class Flow agent form, which stands), but the retirement is reversed — the app is being restored, repurposed primarily for *reviewing workflow runs* (run history/observability; three of the five run producers have no agent run and are visible nowhere else). The #3692 retirement migration is removed rather than patched; the D18 test guard (deleted with the app) returns with it. Scope of the restored app to be settled.** | [#3648](https://github.com/MemberJunction/MJ/pull/3648) | ✅ Merged — **R4 restoration in flight** |
| 5b | **Playwright debt from 5a, flagged not dropped in #3648:** structure/behavior checks + the small visual-baseline set for the front-door screens (34 unit/DOM tests incl. the D18 guard exist; nothing exercises the screens in a browser). Owed before program wrap-up. **⟶ Retarget after R4 settles: the debt now covers the *restored* Workflows app (run-review focus) + the promoted Flow-agent-form authoring surface, not the original three screens.** | — | ⬜ Not started — retarget pending R4 scope |
| 8 | Track A — substrate correctness: all seven #3408 runbook items (transition filters + `WorkflowEntityEventTrigger.filter` unrefused, Validate-path scope/provenance hole, D14 durable `After*` dispatch via `EntityAction.RunMode='Durable'` + spec-level `actionName` arm, Record Process `OnChangeEnabled` reconciliation, execution-log retention, `RunEntityAction` null-contract guard, IT75 `entity-actions` EA1–EA8). Verification: build 271/271, deterministic tier 61/61 w/ `RUN_MUTATION_TESTS=1`, unit tier green. **Both raised deviations ruled via the merge (AN-BC 2026-08-08):** (1) the `RunAction` refusal fall-through — **accepted as a correction**: #3606's fail-closed claim covered filter *evaluation*, not *enforcement*; both halves now fixed, with regression tests asserting the action is never invoked (message-only assertions would not have caught it), AP4 flipped, B14 split in the bug register; (2) **adopted as a D14 amendment** — the deferral point sits after the gates, recorded in the decision. | [#3644](https://github.com/MemberJunction/MJ/pull/3644) | ✅ Merged 2026-08-08 |
| 8a | Housekeeping surfaced by #3617 — **verified mostly already-resolved rather than assumed** (suite at 61 members, IT71 at sequence 33, #3251 invariant holding 0/0, tier 61/61). #3649 ships the one genuinely missing piece: a **guard** for the suite-membership/transport invariant (`suite-sequencing.test.ts`), which was convention-only and had already been broken once — verified by reproducing the original IT71 mistake and confirming the guard fails it. | [#3649](https://github.com/MemberJunction/MJ/pull/3649) | ✅ Merged 2026-08-08 |
| 9 | **Externally-completed task nodes (D21, §3.10)** — **re-based on Track C.1 spec v2 (AN-BC, 2026-08-08): ships as `kind: 'External'` with `configuration: { domain, ref? }` in the discriminated union, NOT as a fourth flat arm** (the union entry itself lands in C1.0 so the first external consumer never sees the flat shape). Everything else per the memo: dispatcher parks (never claims; sweep-exempt per the generalized D20 exemption; `DueAt` notify/escalate applies — free reminder semantics for the domain), completion via the `TaskGraph.CompleteTask` Remote Operation with `OutputPayload` (elevated-caller check + CAS; second completion rejected — **the RO itself is introduced in C1.3 scoped to human tasks; this phase extends it to `External`**), Task-row assignment validator gains the deliberate parked state, converter fidelity stated, IT71 + validator test coverage per the memo's acceptance criteria. Ruled from the bizapps-caliber memo (its P3 engine adoption is the consumer). | — | ⬜ Not started — **after C1.0, before Track R** |
| C.1 | **Flow agents onto the engine** ([`plans/flow-agent-taskgraph-unification.md`](flow-agent-taskgraph-unification.md) **v2.1** — gap found 2026-08-08: `__mj.Task` had never held a row; flows never touched the dispatcher). **Shipped as omnibus [#3692](https://github.com/MemberJunction/MJ/pull/3692)** (merged 2026-08-09): spec v2 + compiler + Skipped/XOR pure layer + dispatcher machinery + **the C1.4 cutover routing**, plus the authoring-UI track. Builder verification: from-scratch DB, XOR fork one-branch + `Skipped`, ForEach 5/5, migration replays standalone; walker refuses at its single choke point, so a workflow that runs provably ran on the new engine; mapping semantics lifted once into `ai-core-plus/task-graph/payload-mapping.ts`. Six post-merge rulings (AN-BC, [comment 5234305719](https://github.com/MemberJunction/MJ/pull/3692#issuecomment-5234305719)): **R1** detach-by-design ratified (supersedes attached-await; bills = envelope truthfulness + submit-time sub-agent/scheduled enforcement); **R2** hard-cut spec ratified (AN-BC-directed, no v1 shim — verified safe because nothing persists a spec; `AssignmentConflict` deleted as unrepresentable); **R3** typed Task columns (`StepType`/`PromptID`/`Configuration` `ITaskStepConfiguration` JSONType + `CK_Task_Assignment` counts `PromptID`) ratified over the envelope — without them a ForEach became an unauthored human task stalling forever, and dropped mappings made branch conditions evaluate `undefined`; **R4** Workflows-app retirement **reversed** — app being restored, repurposed for run review; **R5** `maxIterations: 0` = zero iterations (parity — shipped unlimited implementation reverted); **R6** false terminal edges settle `Complete` via Skip machinery, never `Blocked` (declared correction, all graphs; simulator must match the real dispatcher). Outstanding: the **§14 punch list** (Prompt runner un-bricks the onboarding flow; input snapshot; `failureSemantics` wiring; depth chain; XOR race; envelope truthfulness; loop parity; metadata-driven differential + golden fixtures; template fixes) — the builder's own note flagged the missing differential suite/fixtures. C1.5 + Track R unchanged. | [#3692](https://github.com/MemberJunction/MJ/pull/3692) | 🟨 **Cutover merged; §14 follow-ups in progress** || R | `BaseAgent` decomposition ([#2708](https://github.com/MemberJunction/MJ/issues/2708)) — **resequenced to last** (AN-BC, 2026-08-06): run it once the engine is proven rather than ahead of Phase 3, since Phase 3's changes live in `loop-agent-type.ts` / `loop-agent-prompt-params.ts` / `ai-core-plus` and need no `base-agent.ts` change. Supersedes D13's staging. **Starts only after Phase 9 and Track C.1 complete, as its own separate PR (AN-BC, 2026-08-08). Absorbs the in-run flow executor deletion (C.1's oracle) — golden fixtures keep the differential suite runnable in CI after deletion.** | — | ⬜ Not started |

**Amendment — the control plane is Remote Operations, not resolvers (AN-BC review of #3574, 2026-08-07).** Phase 2 exposed submit / cancel / retry as bespoke GraphQL mutations. That fixed durability but not *reachability*: a mutation is callable from the Explorer client and nothing else, which undercuts this program's own goal of letting agents **set up** workflows rather than only navigate to them. Record Set Processing — the closest analogous substrate — exposes `Run` / `Pause` / `Resume` / `Cancel` / `Get Run Status` entirely as Remote Operations, and the doctrine table in `unified-workflow.md` already names Remote Operations "the typed control plane." #3576 converts them to `TaskGraph.Submit` / `.Cancel` / `.RetryTask` / `.GetStatus` (`GetStatus` is new — the observation half of durable execution). No `TaskGraph.Pause`: pausing a claimed task means deciding what happens to its claim, which is a Phase 4 call, not a verb-set-rounding one. **Standing rule for later phases: any new task-graph control verb ships as a Remote Operation.** #3576 also fixes a Phase 2 gap — the dispatcher class shipped but nothing instantiated it, so a submitted graph was durable and inert; MJServer now starts one per process at boot.

**Coverage note (2026-08-07).** The `task-graph-orchestration` check bundle had **no `MJ: Tests` row**, so TG1–TG6 had never actually been runnable via the deterministic tier despite shipping in Phases 1–2 — a check bundle is inert until a metadata row registers it. #3576 adds **IT71 - Task Graph Orchestration** and it now runs 7/7 green. Later phases that grow this bundle need no new row; they extend IT71's description.

**Phase 3 deviations from this plan, both deliberate (#3588).**

1. **Workflow Planner is opted in**, though D3's launch list omits it (Sage, Query Builder, Research Agent + sub-agents). Emitting task graphs is that agent's entire job, so the enforced gate would have broken it outright the moment it landed. The opt-in set is therefore 9 agents, and IT71's TG8 asserts all of them.
2. **`continuation: 'reinvoke'` is specified but not wired.** Delivering it requires running an agent from the dispatcher, which would invert the dependency to `task-graph` → `ai-agents`. It degrades to `'message'` with a log line rather than silently doing nothing, and belongs in **Phase 4**, where the dispatcher already holds an execution engine. The durable half of the contract *is* implemented: `reinvokeDepth`, the cap-at-5 downgrade, and the mark-before-act delivery guard all ship in Phase 3.

**Also in Phase 3:** `TaskGraphSpec` + its validator **moved** from `@memberjunction/task-graph` to `@memberjunction/ai-core-plus` (beside the pure algorithms). Without that move, `ai-agents` would have to depend on the durable-execution package to validate a graph, dragging the entity layer and dispatcher into every context that merely runs an agent — including DB-less unit tests. Later phases should treat `ai-core-plus` as the home of the *contract* and `task-graph` as the home of *execution*.

**Phase 4 findings worth carrying into Phase 5 (#3596).**

- **`FlowAgentType` had no traversal loop.** It is a step function driven by `BaseAgent`, and the "get edges → take `paths[0]` → if inactive scan alternates" block was written **four times** (post-prompt, post-action, initial-step, skip-recursion). They had already drifted — the skip copy omits the inactive-destination fallback. That duplication *was* the engine; the extraction is what makes the convergence claim true rather than aspirational.
- **The repository seam is synchronous.** `AIEngine.GetAgentSteps` / `GetPathsFromStep` are array filters over a preloaded cache, so every `await` on the old traversal path was ceremony. The engine is testable against plain-object fixtures as a result.
- **Four behaviors deliberately diverge from the old code**, each pinned by a named test: fan-out returns every satisfied edge (the old code silently dropped branches); a missing destination is a rejection not a fatal error; a broken condition is distinguishable from a false one; results are keyed by node id rather than `executionPath[last]`. The old `Priority <= 0` fallback was **dead code** and is not ported.
- **`traversalMode` defaults to `'sequential'` and that must stay.** Existing flows have fan-out shapes drawn in the editor that have never actually run in parallel; flipping the default would execute branches their authors have never seen run.
- **The flow executor and the dispatcher treat an unevaluable condition oppositely, on purpose.** Flow skips the edge; the dispatcher keeps it, because dropping a prerequisite would run a dependent task *early* — a typo becoming out-of-order execution. Do not "fix" this asymmetry.
- **Save as Workflow's converter is done; its two UI surfaces are not.** They are UX work and belong in Phase 5 alongside the rest of the workflow surface area.
- **Two latent test failures were found hiding**, both of the same species: a vitest file that fails to *collect* reports zero tests rather than failures, so the summary line still reads green (`flow-agent-type.test.ts`, 18 parity tests); and **IT71 had a metadata row but was never joined to the integration suite**, so it would never have run in the deterministic tier. **Check `Test Files` counts, not just `Tests` counts** — and when adding an IT, add both the `MJ: Tests` row *and* the `MJ: Test Suite Tests` membership.

**DEFERRED — the "Create Workflow" front door needs its own app (AN-BC, 2026-08-07). Scheduled AFTER Phase 7 so it is not lost.**

Phase 5 shipped every *component* the front door composes — the `TaskGraphSpec` canvas, the properties panel, the runtime-overlay source, and both Save-as-Workflow surfaces — but not the front door itself. Two reasons, both still true:

1. **The design is not locked.** The plan's own rule is *mockup locked → implement, one screen at a time*, and the only committed mockup is `mockups/workflow-ux/phase5-overview-v1.html`, which ends with **five open questions for iteration**. Two bear directly on this screen: ④ whether Save-as-Workflow in chat prompts for name/trigger immediately or drops the user into the editor, and ① toolbar-vs-per-node placement for the concurrency cap. Building it now means inventing answers the plan explicitly flags as open.
2. **It does not belong in an existing app.** Placement decision below.

**Placement: a new `Workflows` Explorer app**, not a tab inside the AI dashboard.

- **D18 makes this nearly forced.** The vocabulary rule is that end users see *Workflow*; *Flow Agent* survives only in metadata and dev docs. Putting the front door inside the **AI** app contradicts that at the navigation level — a business user looking to automate something does not look under "AI", and the whole point of D19 was that the editor is currently *buried*.
- **The surface area is bigger than one screen.** The front door, the workflow list, the run inbox (Track F), and the Tasks/Gantt view are one domain. They want a left-nav shell of their own, which is what an app is.
- **Precedent supports it.** `Scheduling` and `Routines` are already separate Explorer apps despite being AI-adjacent; workflows are at least as distinct.
- **Mechanics:** scaffold with the `scaffold-mj-dashboard` skill so the page chrome (`mj-page-layout` / `mj-page-header` / `mj-page-body`), `BaseResourceComponent` + `NotifyLoadComplete`, `NavigationService` routing and the query-param round-trip come out right by construction. The canvas embeds as-is — it is a `widgets`-layer component, so the app supplies the routing and provider that the widget deliberately refuses to know about.
- **Scope when it lands:** the three entry tiles from the mockup (Blank canvas / Describe it / From a past run), the workflow list, and the Agent Manager hand-off — replacing today's save-the-agent-record-first requirement. `UIFormSectionKey` stays mounted for the record-form context but stops being the only door.

**Phase 7 (Track D) carries one committed debt from Phase 6 (AN-BC, 2026-08-07).**

`WorkflowSpecSync.reconcileEntityEvent` writes the Entity Action rows that bind an entity-change trigger, and TG13 asserts its *prerequisites* (the `Execute Agent` action exposes `AgentID` and `Data`; `Entity Object Data` and `Static` are still legal ValueTypes). **No test drives the actual save-to-binding round-trip against a live database.** Phase 7 must add a mutation-class integration check that saves a workflow with an `EntityEvent` trigger and asserts the three rows appear correctly — `EntityAction`, `EntityActionInvocation`, `EntityActionParam` × 2 — then tears them down.

This is not hypothetical caution. Phase 6 shipped a binding that set *which agent* to run but never *which record changed*, so a triggered workflow would have run on every matching change knowing nothing about any of them. Unit tests missed it because they mock `reconcileTriggers`; the path had never executed. A round-trip check is the only thing that would have caught it.

**Also revised in Phase 6:** the plan's Track D item 1 assumed entity-action *invocation* still needed work. It does not — `HandleEntityActions` has fired entity actions from the save pipeline all along (validate, before/after save, before/after delete), and `Execute Agent` already exists as the dispatch target. Track D item 1 is therefore smaller than written: the binding now ships in Phase 6, leaving the self-trigger guard and per-record coalescing.

**Build conventions agreed with AN-BC (2026-08-06).** Target DB is local SQL Server `MJ_6_1_0`, freely droppable. **SQL Server only — PostgreSQL counterparts are handled separately by other developers**, so the usual `migrations/vN` ↔ `migrations-pg/vN` pairing is deliberately deferred for this program; the "+ PG counterpart" phrasing in the phases below is superseded by this. **This extends to the pg-parity ratchet (AN-BC ruling, 2026-08-08): `PENDING_CONVERSION` entries for program migrations are the build engineer's concern at release, post-PR — reviews should not flag their absence.** New migrations must sort after `V202608052115`. The deterministic bundle `task-graph-orchestration.checks.ts` opens in Phase 1 and grows each phase rather than being deferred to the end. Phase 3 ends with a manual Sage soak before merge, since it rewrites the flagship agent's most-exercised path.

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
| D6 | The Flow graph executor is the executor that is kept. Dynamic instructions are converted into an **ephemeral flow** and executed by the shared traversal engine. Useful pieces of the current `TaskOrchestrator` (wave computation, transactional persistence, artifact creation, PubSub frames) carry over. **⟶ Superseded by Track C.1 (AN-BC, 2026-08-08, [`plans/flow-agent-taskgraph-unification.md`](flow-agent-taskgraph-unification.md)): the kept executor is the durable dispatcher; flows compile to `TaskGraphSpec` and route through it at C1.4 cutover. The in-run executor becomes differential-test-oracle-only at cutover and is deleted in Track R (golden fixtures then carry the suite).** |
| D7 | Flow gains **parallel DAG execution** — verified today it is single-threaded (single `currentStepId`; only `paths[0]` followed). Frontier-set traversal + join semantics + concurrency cap are added. Design-time flows opt in via their params bag (`traversalMode`); ephemeral flows built from task graphs are always parallel. **⟶ Amended by Track C.1 (AN-BC, 2026-08-08): the goal stands, the mechanism changes — parallelism arrives via the dispatcher (the compiler emits parallel shapes from `traversalMode`), not via frontier traversal in the flow engine. `AdvanceFrontier` (zero production callers on `next`) goes with Track R's deletion. Verified scope fact: `FlowAgentTypePromptParams` is consumed by nothing, so no shipped flow is parallel — cutover parity is the sequential/XOR path only.** |
| D8 | **Task rows are NOT written for in-run Flow execution.** `AIAgentRunStep` already records intra-run execution. The boundary: **run steps = intra-run forensics; Task rows = cross-run durable work items** (dispatcher state, human tasks, UI). Neither replaces the other; nothing is double-written. **⟶ Restated by Track C.1 (AN-BC, 2026-08-08): post-cutover there is no in-run flow execution, so Task rows become the orchestration record for *all* flow execution. The forensics boundary survives intact: each node's child `AIAgentRun` keeps its run steps; the flow's envelope `AIAgentRun` carries exactly one `TaskGraph` run step (D10 pattern) pointing at the parent Task. Still nothing double-written.** |
| D9 | **Single-node graphs are flattened** ("constant folding"): a one-task, zero-edge, agent-assigned graph with default continuation semantics is compiled by `LoopAgentType` into the underlying primitive (a `Sub-Agent` step) and executed in-run — no Task row, no dispatcher hop. Flattening is skipped for human tasks, non-default continuations, or when durability is explicitly requested. **The fold is observable, never silent**: the `TaskGraph` run step (D10) is written for every emitted graph — folded or dispatched — carrying the full spec, a `folded` flag, and the reason, so run forensics show the decision and Save as Workflow (D17) attaches to folded graphs too. |
| D10 | The run-step type for graph submission is **`TaskGraph`** (clearer than `Tasks`); type-union recompiles are a non-issue. |
| D11 | Package naming is **not** AI-prefixed (`@memberjunction/task-graph`): the submission API is producer-agnostic — an LLM, deterministic code, or a human UI can all construct and submit a DAG. |
| D12 | `ExecuteTaskGraph` mutation and the client-driven execution path are **removed immediately** in Phase 2. Removing a public GraphQL mutation is formally a breaking external-surface change — stated, not asserted away (review round 2). It is **accepted deliberately**: the Explorer conversation client is the mutation's sole known caller and §3.8 removes it in the same phase; nothing outside the legacy Sage path is known to use it; and v6 is an open breaking-change window (the same standard Track B invokes for its removals). The removal is documented in the v6 release notes; no deprecation window is carried. (The server-side payload-sniff shim still bridges prompts until Phase 3 migrates them.) |
| D13 | `BaseAgent.ts` is refactored into composed helper classes as part of this program (parallel track R), behavior-preserving, staged ahead of the Phase 3 changes that touch it. |
| D14 | **The dispatcher's claim protocol is MJ's durable-async substrate going forward.** `MJQueue`'s durability is illusory today (rows written, never read back; no restart reclaim, no cross-process pickup) and it is not extended. New durable work targets `TaskGraphService` submission — a single-node durable graph is exactly "run this action durably with retry" — including the #3408 plan's After\*-entity-action routing (its runbook step 9), which re-targets here instead of `QueueManager`. MJQueue is absorbed/retired on its own track. **Amendment (accepted via the #3644 merge, AN-BC 2026-08-08): the deferral point for any "run X durably" surface sits *after* the gates — validation, scope, filters — never before them.** Durability replaces *execution*, not *dispatch*: `RunActionParams.DeferExecution` is invoked by `RunAction` in place of running the action once the gates pass, and a declined deferral (`null`) falls back to inline execution so opting into durability can never make a binding *less* reliable. (#3644's first cut deferred at dispatch — a scoped durable trigger would have fired on every record; the rework is the constraint.) |
| D15 | **Pipelines and task graphs stay separate primitives.** A Pipeline (`plans/tool-pipelines.md`) is a single-turn, in-run *data* program — one value out, no durable state. A task graph is durable, multi-run *work* orchestration. Neither grows toward the other; an agent that needs both emits both. |
| D16 | **`TaskGraphSpec` is the fully-qualified DAG spec.** One TS contract in `ai-core-plus` that every producer authors against — the LLM primitive, deterministic code, a human UI, and (future, out of scope here) stored workflow definitions that bind a graph to triggers. Server-side validation in `TaskGraphService` validates against this same contract; there is no looser internal shape. The `Spec` suffix aligns with `AgentSpec`: it memorializes a graph, it doesn't merely request execution. |
| D17 | **"Save as Workflow" — an ephemeral graph can be promoted to a design-time flow.** Because a runtime `TaskGraphSpec` and a design-time flow are the same logical shape (§3.1), a converter (`TaskGraphSpec` → `AgentSpec` with Flow type + Steps/Paths → `AgentSpecSync.Persist`) turns a Loop agent's dynamic approach into a reusable, schedulable flow agent. Surfaced wherever a run's graph is visible: the Agent Run admin UI (via the new `TaskGraph` run-step node) and ng-conversations (detect 1+ graphs on a completed run → offer "Save as Workflow"). See §3.9. |
| D18 | **"Workflow" is the user-facing noun; "Flow Agent" stays the implementation term.** UI surfaces (navigation, save-as affordance, authoring entry points, docs for business users) say *Workflow* — a deterministic pathway that can include AI steps. No schema/entity/agent-type rename; this is vocabulary, applied at the UX layer. The v6 retirement of the dead legacy `Workflow` tables frees the name. **The rule extends past the noun**: end-user surfaces never say *graph*, *DAG*, *node*, or *traversal* — they say *workflow*, *step*, *plan*, *path* (chat cards say "View", not "View graph"; run views say "Planned by Sage", not "Ephemeral graph"). Technical terms stay in dev docs and metadata. |
| D19 | **Workflow UX is in-scope for this program (Phase 5), and the existing `@memberjunction/ng-flow-editor` is upgraded, not replaced.** The Foblex-Flow canvas + `FlowAgentEditorComponent` become THE workflow viewer/editor: every capability this program adds (parallel traversal + joins, `traversalMode`, human tasks, runtime task graphs, Save as Workflow) must be visible and editable there, one visualizer serves both provenances (design-time workflow and runtime graph), and the editor gets a first-class creation entry point instead of being buried inside a saved AI Agent record form. |
| D20 | **Task rows are shared-writable, so dispatcher integrity is enforced, not assumed.** The six machine-state columns land on an entity with ordinary generated CRUD — entity forms, Data Explorer, GraphQL, and any agent holding an update-record action can write `Status` or `ClaimedBy` directly, so the claim protocol must survive human-vs-dispatcher writes, not just dispatcher-vs-dispatcher races. Three layers (§3.4): a server-side `MJTaskEntity` subclass guard on dispatcher-owned columns and claimed-row `Status` transitions; CAS-guarded dispatcher writes so a tampered row fails a stale executor's write cleanly instead of double-completing; and sweep detection/normalization of anomalous states. Legitimate human verbs (Cancel; Complete on a human-assigned task) flow through the first-class mutations. |
| D21 | **Externally-completed task nodes — a third assignment shape** (ruled by AN-BC 2026-08-08; driving consumer: bizapps-caliber PR #179, whose Blueprints compile to `TaskGraphSpec` and whose steps are completed by anonymous invitees signaled through Caliber's evaluation driver). A node the dispatcher never executes and never claims, completed by an **authorized server-side domain driver** when an event in that domain occurs — a signed document, a paid invoice, an evaluated assessment session. Not an agent task (must not be claimed or run); not a human task (`assignToUser` means an MJ user completes it via the task UI — an anonymous invitee is not an MJ user, and nominal staff assignment misrepresents ownership and pollutes a real person's task list). Completion goes through a new **`TaskGraph.CompleteTask` Remote Operation** (the #3576 standing rule), gated by a server-side/elevated capability check + the CAS state guard — end-user surfaces never get a "complete" verb on these nodes. The D20 human-task sweep exemption **generalizes verbatim**: "parked" is this node's legitimate shape. D18: end-user surfaces render "Waiting on ⟨label⟩" — never "external node". Full contract: §3.10. Scheduled as **Phase 9**, after the wrap-up PRs and before Track R. |

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

### 3.10 Externally-completed task nodes (D21) — Phase 9

A node whose work happens *outside* MJ's execution machinery — an anonymous assessment session, a signed document, a paid invoice, an inbound webhook — and whose completion is signaled by an authorized server-side **domain driver**. First consumer: bizapps-caliber (PR #179), whose Blueprints compile to `TaskGraphSpec`; the shape is generic to any vertical whose "task" is an event in its own domain.

1. **Spec.** *(Re-based on Track C.1 spec v2, AN-BC 2026-08-08 — supersedes the fourth-flat-arm shape below.)* The assignment ships as **`kind: 'External'`** with `configuration: { domain: string; ref?: string }` in the C1.0 discriminated union — `domain` names the completing driver's domain, `ref` optionally identifies the domain object. The union entry itself (type + validator acceptance + dispatcher parks-like-Human) lands in **C1.0**, so the first external consumer never sees the flat arms; this phase ships the completion path and the domain-driver contract. Exclusivity is structural (`kind` picks exactly one configuration) rather than a validator rule. *(Historical: pre-C.1 this was specified as `externalRef?: { domain, ref? }`, a fourth flat arm beside `agentName`/`actionName`/`assignToUser`.)*
2. **Dispatcher.** Parked, exactly as human tasks: never claimed, never launched, **exempt from sweep claim-normalization** (the D20 round-2 exemption generalizes verbatim — "parked" is its legitimate shape; restart while parked must not touch it). `DueAt` notify/escalate applies — the domain gets reminder semantics for free.
3. **Completion.** Through the first-class mutation path only, per D20's discipline: the **`TaskGraph.CompleteTask` Remote Operation** carrying `OutputPayload` (the #3576 standing rule — every new control verb is an RO). *(C.1 update: the RO itself is introduced in **C1.3**, scoped to human tasks — assigned-user or elevated caller; this phase **extends** it to `External` nodes rather than creating it.)* Authorization is *not* #3524's cross-user-assignment problem: the completer is a registered server-side domain driver running elevated, so the gate is a server-side/elevated capability check plus the CAS state guard (`WHERE Status='In Progress' AND ...` — a second completion rejects cleanly). End-user surfaces never expose a "complete" verb on these nodes.
4. **Task row.** `CK_Task_Assignment` is **three-way after #3644** (`AgentID` / `UserID` / `ActionID`); this phase widens it to **four** with a deliberate external state rather than relaxing it silently. Implementation constraint, mechanism open for the builder to propose via the standard deviation path: the marker must be durable on the row and cheaply visible to the sweep — the exemption must not depend on parsing `InputPayload`.
5. **Edges.** Nothing new: conditional `dependsOn` evaluates over the completed node's `OutputPayload` exactly as for agent nodes — disposition/score payloads are what downstream edges branch on.
6. **D18.** End-user surfaces say **"Waiting on ⟨label⟩"** — never "external node"; the runtime overlay renders it with the awaiting styling (amber, like human tasks), not as an error.
7. **Converter (Save as Workflow / `ConvertTaskGraphToAgentSpec`).** Must state what external nodes become — open sub-decision for the builder to propose (map to a human-assigned step with a stated fidelity note, or refuse with a clear message); the converter's existing "states what it drops" pattern is the bar either way.

**Acceptance (from the driving memo):** an `agent → external → agent` graph validates, submits, parks (no claim; sweep leaves it alone across restart), completes via the RO with a payload, and the downstream conditional edge branches on it; a non-elevated caller cannot complete it; a second completion is CAS-rejected; IT71 gains the end-to-end check and the validator tests gain third-arm exclusivity cases.

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

An intentional UX effort, not a trailing cleanup — it addresses the authoring/observability gaps the whole-repo study documented (fragmented surfaces, buried editor, no live graph view) and makes the new engine abilities usable by business users.

#### 0. **A new generic graph package — `@memberjunction/ng-task-graph-editor` (AN-BC, 2026-08-07).**

**This supersedes the earlier "upgrade `ng-flow-editor` in place" framing.** The direction is a *new* package in `packages/Angular/Generic/`, compliant with the `widgets` layer, whose subject is **`TaskGraphSpec`** — the one graph contract every producer already authors against (D16). The Flow Agent editor then *consumes* it rather than owning a parallel implementation.

**Why a new package rather than an upgrade.** `ng-flow-editor`'s generic half (`FlowEditorComponent`, `FlowNode`/`FlowConnection`, the Dagre layout + Foblex canvas services) is genuinely reusable and is the **starting point** — lift it, don't rewrite it. But its *domain* half (`FlowAgentEditorComponent`, `AgentFlowTransformerService`, `agent-properties-panel`) is bound to `AIAgentStep`/`AIAgentStepPath` entities. Phase 4 established that a runtime task graph and a design-time flow are the **same model**; a graph editor that can only speak the agent-entity dialect cannot serve the other provenance, and adding a second dialect to the same component is how the two drift apart again — exactly the failure the traversal-engine extraction just fixed.

So the split mirrors the engine's own: **`TaskGraphSpec` is the contract, the editor edits the contract**, and each host supplies its own adapter to/from whatever it persists.

**Layer + conventions (non-negotiable, see [`guides/UI_LAYERING_GUIDE.md`](../guides/UI_LAYERING_GUIDE.md)).**
- `"mjUILayer": "widgets"` declared in `package.json` from the first commit — a new Generic package without the field is the only way layer drift gets back in.
- **No `@angular/router`, no `@memberjunction/ng-shared`, no `NavigationService`.** Route-derived state arrives as `@Input()`; navigation intent leaves as an `@Output()` the host acts on.
- **No global-provider construction.** No `new RunView()` / `new Metadata()` — extend `BaseAngularComponent` and use `this.ProviderToUse` / `RunView.FromMetadataProvider(...)`, and forward `[Provider]` to every child. (AN-BC reinforced this repo-wide during Phase 3.)
- **Events follow the `Before*`/`After*` cancelable contract** (§6 of the layering guide): vetoable actions ship as a pair with args **classes** extending a `CancellableTaskGraphEventArgs` base carrying `Cancel`/`CancelReason`; the component checks `if (args.Cancel) return;` and **does not** emit `After*` on the canceled path. Informational events (selection changed, layout finished, validation ran) are single emitters with no `Before` pair — don't invent a veto for something that cannot be vetoed. `Before*` handlers must not be `async`; where a host genuinely needs to await (a confirm dialog), expose an imperative method instead of pretending the veto is asynchronous.
- **PascalCase** for every public input, output, event-arg property and method; camelCase for private/protected.
- Modern Angular: `@if`/`@for` with `track`, `inject()`, setter-based `@Input` change detection (never `ngOnChanges`), `mjButton` + `--mj-*` design tokens, `<mj-loading>`, Font Awesome. Reference conventions: `packages/Angular/CLAUDE.md`, `packages/Angular/Generic/CLAUDE.md`, and **`ng-conversations`** as the in-repo exemplar for provider threading and event shape.

**Surface (the public contract that makes it reusable).** Inputs at minimum: `Spec` (a `TaskGraphSpec`), `ReadOnly`, `Provider`, `RuntimeStatus` (per-node live state for the runtime overlay), plus the existing canvas toggles (`ShowMinimap`/`ShowPalette`/`ShowToolbar`/`AutoLayoutDirection`…). Outputs: `SpecChanged` (informational), the `Before*`/`After*` pairs for node/edge add-remove-edit, `NodeSelected`, `ValidationChanged`, and **intent-only** events (`RecordOpenRequested`, `AgentOpenRequested`) that the host — not the widget — turns into navigation. Public methods for host-driven operations that need an `await` (`ApplyAutoLayout()`, `Validate()`, `FitToView()`).

**Validation is the engine's, not the editor's.** The canvas reports cycles, unknown dependency refs, unreachable nodes and assignment conflicts by calling `ValidateTaskGraphSpec` from `@memberjunction/ai-core-plus` — the same function the Loop agent type and `TaskGraphService.Submit` call. One validation story, surfaced at author time; a graph that passes in the editor cannot fail a different check on submit.

**Consumers, all from one component:** the Flow Agent editor (via an `AgentSpec` ⇄ `TaskGraphSpec` adapter — Phase 4's `ConvertTaskGraphToAgentSpec` is one direction of it already), the Agent Run admin UI's `TaskGraph` node, ng-conversations plan cards (read-only), the Tasks view, and any future MJ or downstream app surface.

1. **Editor upgrade — express everything the engine can now do.**
   - Parallel semantics: render fan-out visibly; per-step **join type** (AND default / OR ↔ `Optional`; `Corequisite` as co-scheduled) editable on the node; the flow-level `traversalMode` toggle (params bag) with a clear "sequential (legacy) / parallel" affordance; concurrency cap surfaced.
   - **Human-task nodes** as a first-class node type (assignee/role, DueAt) once Phase 4 lands them.
   - Path-condition editing with validation feedback (SafeExpressionEvaluator syntax), recovery-path visualization, and inline graph validation (cycle detection, unreachable nodes, unknown agents) using the same `TaskGraphSpec` validators the engine uses — one validation story, surfaced at author time.
2. **Runtime overlay — the same canvas watches a run.** Per-node live status (pending/running/complete/failed/blocked/awaiting-human) driven by BaseEntity events over `AIAgentRunStep` rows (in-run flows) and `MJ: Tasks` rows (durable graphs) — the agent-run form's existing live-step subscription is the proven mechanism. This is the convergence point with the Tasks Gantt/checklist: one graph renderer, design-time and runtime, replacing two silos. The Agent Run admin UI's `TaskGraph` node (D10) opens this view; **Save as Workflow** (§3.9) is an action on it. **Both of these are the two Save-as-Workflow surfaces deferred out of Phase 4** — its converter (`ConvertTaskGraphToAgentSpec`) shipped and is tested; the surfaces are UX and land here, on the new graph component, rather than as one-off renderers.
3. **Entry points and terminology (D18).**
   - A first-class **"Create Workflow"** entry (navigation + Agent Manager hand-off) that lands on the canvas — killing the save-the-agent-record-first requirement (`UIFormSectionKey` mount stays for the record-form context, but stops being the only door).
   - The D18 vocabulary sweep across the touched surfaces: *Workflow* in nav, buttons, empty states; *Flow Agent* remains in metadata/dev docs.
   - **Phase 0 carry-over (ruled by AN-BC 2026-08-06):** remove the two dead `'reports'` branches left in `explorer-core`'s `shell.component.ts` — the `appReportMatch` tab-finder (~`:1306-1318`) and the `case 'reports':` URL builder (~`:1615`). Unreachable since Phase 0 dropped the `Reports` resource type (no tab can carry `resourceType === 'reports'`), but this Explorer sweep is where they get deleted so the leftover isn't overlooked.
4. **Read-only ≠ invisible**: the viewer (not editor) embeds anywhere a graph is referenced — ng-conversations plan cards, the Tasks view, run history — via the same component's `ReadOnly` mode. This is the second Phase 4 carry-over: the ng-conversations completed-run affordance that offers *"Save this approach as a Workflow"*.

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
