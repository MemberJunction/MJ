# @memberjunction/task-graph

## 6.1.0-edge.2

### Minor Changes

- 59def38: The entity-action substrate finishes what its schema has been promising. Seven pieces, all of which
  share a failure shape: a column, a flag or a field that read as configured and did nothing.

  **Action Filters now actually prevent execution.** `RunAction`'s filter-refusal branch built its
  result, logged it, and then fell through to run the action anyway — there was no `return`. Every
  Action Filter has therefore recorded that it prevented something while preventing nothing, since the
  mechanism shipped. The refusal row is why it went unnoticed: the observable said "prevented" and the
  side effect happened regardless, so #3606's claim that filters fail closed described evaluation,
  which landed, rather than enforcement, which did not. **Anyone relying on an Action Filter to gate an
  action has been getting the action anyway; after this it stops, which is the configured behaviour but
  a visible change.** A prevented run still writes a log row, deliberately — an operator should be able
  to see that a filter refused rather than wonder why nothing happened — so its `Message` is now an
  exported constant, since that is the only thing distinguishing a prevented run from an executed one.

  **Transition filters.** An entity action could see a record's current state and nothing else, so
  "when Status _becomes_ Approved" was indistinguishable from "when Status _is_ Approved" — which is
  true on every subsequent save too. `EntityChangeContext` now carries both sides of the save to where
  filters run, built from `EntityField.OldValue`, which `BaseEntity` has tracked all along and simply
  never carried anywhere. Filter code gets `DidFieldChange`, `DidFieldChangeToValue`, `OldValues` and
  `NewValues` on `ActionFilterContext`. A create reports no changes, because a record whose Status
  started at Approved did not _become_ anything. Comparison is loose across the string boundary
  metadata forces, so a configured `'1'` matches a numeric `1` rather than silently never matching.

  The capture happens as the first statement of `HandleEntityActions`, deliberately before its first
  `await`: After-hooks are fire-and-forget, and the moment that method yields, the save completes and
  reloads the entity, resetting every `OldValue`. Reading `IsCreate` from that same synchronous
  snapshot also closes a latent bug — `entity.IsSaved` was previously read _after_ an await, so a
  create whose save finalized in that window dispatched as `AfterUpdate`.

  **Two filter-substrate fixes fall out of using it for real.** `EntityActionFilter.Status` was never
  consulted, so a `Disabled` binding still gated — and filters fail closed, so that was not an inert
  row but a permanent block whose only symptom is a trigger that quietly stopped firing. And a binding
  pointing at an unresolvable filter used to reach the evaluator as `undefined` and throw there:
  fail-closed by accident, with no usable reason logged. It now returns a failed result naming the
  filter.

  **Workflow triggers accept a filter.** `ValidateWorkflowSpec` refused `WorkflowEntityEventTrigger.filter`
  outright because the contract to honor it did not exist. It now reconciles onto an owned
  `ActionFilter` bound through `EntityActionFilter` — the additive path — and validates that the
  expression parses, because filters fail closed and a syntax error is not a loud failure, it is a
  trigger that silently never fires.

  **Record Process on-change triggers.** `OnChangeEnabled` has described itself as running "per-record
  on save via an owned Entity Action" since the column shipped, and `OnChangeFilter` promised to
  "compile into the owned Entity Action Filter". Neither owned anything. Saving a Record Process now
  reconciles that binding, matching ownership on the `RecordProcessID` param — `Run Record Process` is
  one shared action, so matching on entity + action alone would let a second process silently repoint
  the first one's trigger. `OnChangeFilter` compiles through the same builder workflow triggers use, so
  one expression vocabulary covers both surfaces.

  **Durable `After*` dispatch (D14).** After-hooks are fire-and-forget, so a process dying mid-flight
  loses the action with nothing to retry it. `EntityAction.RunMode = 'Durable'` routes the dispatch to
  the task-graph substrate as a single-node durable graph — the claim protocol, restart recovery and
  orphan reclaim that already exist there — rather than adding a third async substrate. Opt-in per
  binding, because it costs a Task row, a dispatcher hop, and params persisted at rest. When no
  submitter is registered or submission fails, the work runs **inline**: `Durable` asks for the work to
  be harder to lose, so dropping it would make opting in less reliable than leaving it off. New
  `Task.ActionID` widens the assignment exclusivity to three ways, and `TaskGraphSpecNode.actionName`
  joins `agentName`/`assignToUser`.

  Durability replaces _execution_, not _dispatch_: `RunActionParams.DeferExecution` is called by
  `RunAction` in place of running the action, after validation and filters have passed, so a durable
  binding is gated by exactly what an inline one is gated by. Submitting at dispatch time instead —
  which is where this first landed — would have fired a scoped durable trigger for every record of the
  entity and a filtered one on every save.

  **Execution-log retention.** `Action.RetentionPeriod` and `ActionExecutionLog.RetentionPeriod` shipped
  with descriptions and no reader anywhere in the codebase; the log grew forever while the schema
  claimed otherwise. Retention is now stamped onto each row when the run starts — decided at write
  time, so editing an action's retention is a going-forward change rather than a retroactive deletion —
  and a new opt-in `Action Log Retention` scheduled job purges expired rows oldest-first, bounded per
  run, reporting when it stopped at its ceiling rather than because it was finished.

  **The `Validate` invocation hole.** `EntityActionInvocationValidate` overrode single-record invocation
  with a near-copy that had drifted into a strict subset: no scope resolution (so a binding narrowed to
  one record ran `Validate` against every record of the entity) and no provenance (so a whole-record
  parameter was logged raw, ignoring the binding's `LogValue` rows). The override is deleted; the class
  inherits, which is what keeps both facts true for `Validate` permanently rather than until the copies
  drift again.

  **The `RunEntityAction` null contract.** `null` means the action did not run — the binding is scoped
  and this record falls outside it. `HandleEntityActions` guarded for it; the GraphQL resolver did not,
  so an out-of-scope binding surfaced to clients as a server error. The signature now says so and the
  resolver reports it as the ordinary outcome it is.

- ca4feb4: Workflow cost becomes a projection of the run tree, and a graph now runs in the order it was drawn.

  **Cost is the tree, not arithmetic beside it.** `AIAgentRun`'s four `…Rollup` columns are now written from `SumAgentRunTreeCost(LoadAgentRunTree(runID))` at settlement — one basis (per-node own spend), prompt-aware through `Configuration.runtime.promptRunID`, and structurally incapable of disagreeing with what the run viewer shows. The previous per-child loop filtered on `AgentRunID`, so every Prompt step's spend was absent, and mixed a descendant-inclusive number with an own-spend one. The tree now also carries the prompt/completion token split so all four columns share a basis. Writing the sum back makes the column an _output_ of the tree, which is non-circular only because the query reads own cost and never a rollup — stated in the query header and pinned by a test that plants an absurd rollup on a real run. When the tree cannot be summed (load failure, depth cap, graph not reachable), the columns are **cleared** rather than left holding a stale total from an earlier settlement.

  **A loop's passes exist.** The run tree reaches nested work through six relationships and a loop iteration was none of them, so a `While` that spent real money across three passes reported one childless node with no cost. The dispatcher now records one entry per pass (`ITaskStepRuntime.iterations`) and the tree expands them into nodes. On a real workflow this moved `TotalCostRollup` from `0.00049725` to `0.00555375` — the loop had been spent and not counted.

  **A graph is dispatched only once its edges exist.** Children and dependencies are now written in one transaction. Previously a poll could land between the two writes, see tasks with no prerequisites, and claim the whole graph at once — observed running a closing branch before the draft it was meant to judge existed, then reporting Complete.

  **Steps see their payload.** A step with no input mapping fell back to the raw input instead of the merged payload, so a Prompt step — which declares no mapping by design — rendered `{{ _CURRENT_PAYLOAD }}` as `{}` and wrote from an empty brief. Separately, a step with no output mapping _replaced_ the payload with its own output rather than merging; for a loop, whose output is a summary, that discarded everything the iterations had established and made a downstream `payload.x === true` edge unreachable.

  **An output mapping that names a parameter the step never returns now says so** (`unmapped`), naming what the step did return, instead of skipping in silence.

  **Human steps**: a cancelled request re-raises instead of stalling forever; cancelling a graph withdraws its open requests instead of leaving them in someone's inbox; cross-user `assignToUserID` is refused at submission rather than silently reassigned to the submitter; and a step can declare `expiresInHours`, which finally makes the existing expiry machinery reachable.

  **Web Search** captured each result with a non-greedy match that stopped at the first nested `</div>`, cutting the snippet out of every result — ten well-formed hits carrying no content. Results are now sliced between block starts, and an all-snippets-empty parse is reported rather than returned silently.

  **Testing**: a bundle whose every check is gated out now records an explicit skip naming the flag that would run it, instead of reporting PASS with zero checks executed.

- 1c0d586: Flow agents now execute on the durable task-graph dispatcher instead of walking their own graph
  inside an agent run.

  `FlowAgentType.DetermineInitialStep` compiles the agent's steps and paths into a `TaskGraphSpec` and
  returns a `Tasks` step; `BaseAgent.executeTasksStep` submits it and detaches. From there a workflow
  is `Task` rows owned by a server-side dispatcher, with the same claiming, conditions, skip cascade,
  retry and failure semantics as any other graph — one traversal engine rather than two that drift.
  The in-run walker is retained as the reference implementation the compiler is checked against, but
  refuses at its single choke point, so a workflow that runs at all provably ran on the new engine.

  Also in this change:
  - `Task` gains `StepType`, `PromptID` and a typed `Configuration` bag (`ITaskStepConfiguration`)
    carrying kind-specific settings, the payload mappings, the execution policy and the author's
    canvas layout. `CK_Task_Assignment` now counts `PromptID`.
  - Payload mapping semantics are lifted into `@memberjunction/ai-core-plus` so both engines share one
    dialect — the `*` wildcard, case-insensitive result lookup, `[]` append, `$message` fields, and the
    `static:` / `payload.` / `data.` / `context.` prefixes.
  - `ForEach` and `While` steps run through a new `TaskLoopExecutor`: bounds (`maxIterations: 0` means
    unlimited), `continueOnError`, delay, and parallel batches that keep results in **iteration** order.
  - New deterministic DAG layout (`LayoutTaskGraph` / `LayoutGraphNodes` / `GraphLayoutBounds`) — a
    `Task` row has no position columns, so a run view previously drew every node on the origin.
  - A settled graph credits its spending back to the submitting run through the `…Rollup` columns on
    `AIAgentRun`, which existed since v3 and were never written. `TotalCost` keeps its current meaning.
  - `TaskGraphActionRunner` returns a flat, name-addressable result instead of an `ActionParam[]`, so
    output mappings resolve and branch conditions can be evaluated.
  - `GetTaskGraphSubmitter()` now honours its documented contract and returns `null` when no
    durable-execution package is loaded, instead of an instantiated abstract base.

  New guide: `guides/WORKFLOW_AND_TASK_GRAPH_GUIDE.md`.

### Patch Changes

- 82a8585: A stopped task-graph dispatcher stops

  `pollOnce` checked `running` only when the tick fired, then awaited a provider, a rollup pass and a
  claim query before taking work. `Stop` could land in any of those gaps, so a dispatcher that had
  already been stopped went on to roll up graphs — emitting `GraphSettled` to observers that had been
  torn down — and to claim tasks it would never execute, leaving them claimed until their lease
  expired. On a graceful shutdown or a rolling restart that strands freshly claimed work for the whole
  TTL.

  `running` is now re-read after every await in the pass, including per iteration of the claim loop,
  and `Stop` waits for an in-flight pass before draining in-flight tasks. Without that ordering the
  drain loop could observe an empty `inFlight` set while a pass was moments from populating it, which
  is the exact state the drain exists to prevent — and is why `Stop`'s documented promise to wait for
  in-flight tasks did not hold.

- Updated dependencies [255d506]
- Updated dependencies [5ecfdb4]
- Updated dependencies [59def38]
- Updated dependencies [080f4cd]
- Updated dependencies [8288711]
- Updated dependencies [48ff99f]
- Updated dependencies [9fc0e2d]
- Updated dependencies [fccd0b2]
- Updated dependencies [9a29da4]
- Updated dependencies [0967ba7]
- Updated dependencies [de343b5]
- Updated dependencies [d8adda1]
- Updated dependencies [15319b4]
- Updated dependencies [ca4feb4]
- Updated dependencies [1c0d586]
  - @memberjunction/core-entities@6.1.0-edge.2
  - @memberjunction/ai-agents@6.1.0-edge.2
  - @memberjunction/actions-base@6.1.0-edge.2
  - @memberjunction/ai-core-plus@6.1.0-edge.2
  - @memberjunction/global@6.1.0-edge.2
  - @memberjunction/core@6.1.0-edge.2
  - @memberjunction/aiengine@6.1.0-edge.2
  - @memberjunction/notifications@6.1.0-edge.2
  - @memberjunction/ai-prompts@6.1.0-edge.2

## 6.1.0-edge.1

### Minor Changes

- 394d276: Phase 2 of the unified workflow DAG engine program (plan: PR #3456) — task-graph execution moves server-side and becomes invocation-agnostic.

  **New package `@memberjunction/task-graph`.** Deliberately not AI-prefixed (D11): an LLM, deterministic code, or a human UI can all construct and submit a DAG. It contains `TaskGraphSpec` (the one fully-qualified contract every producer authors against, D16), a pure validator, `TaskGraphService` (submission), `TaskClaimStore` (the CAS claim protocol), and `TaskGraphDispatcher` (durable execution). Graph _semantics_ stay in the Phase 1 pure algorithms in `ai-core-plus` — eligibility, failure propagation, parent rollup and stall detection are consumed unchanged, so the in-run and durable executors cannot drift apart.

  **Submission is split from execution (D2).** `TaskGraphService.Submit` validates, resolves agents, persists parent + children + edges, and returns. Nothing waits for the work. That is what makes every channel equal (D1).

  **BREAKING: `ExecuteTaskGraph` is removed (D12).** It awaited an entire multi-step workflow inside one long-lived GraphQL request, so a page reload lost the awaited promise, a server restart orphaned every in-flight task, and no channel but Explorer could reach the substrate. Replaced by `SubmitTaskGraph`, `CancelTaskGraph`, and `RetryTask`. Accepted deliberately in the open v6 window; its sole known caller — the Explorer conversation client — becomes an observer in this same change.

  **The durable dispatcher.** A compare-and-swap claim protocol over `ClaimedBy`/`ClaimExpiresAt` (the columns Phase 1 landed): claiming is a single guarded `UPDATE ... WHERE Status='Pending'` whose rowcount decides the winner, so two instances never run the same task without a distributed lock manager. Long tasks heartbeat to extend their claim; startup and periodic reconciliation return expired claims to `Pending`, which is what turns a crash from "work stranded forever" into "work resumes". Per D20 _every_ state transition is guarded on `ClaimedBy=@me`, not just the initial claim, because `MJ: Tasks` stays user-writable — a stale executor's completion write fails cleanly instead of double-completing. Human tasks are exempt from reclamation: a task parked on a person legitimately has no claim, and reclaiming it would reset an approval out from under the user.

  **Server-side detection at three seams.** Task graphs emitted in an agent's payload are now detected and submitted from the MJServer run path, `BaseMessagingAdapter` (ahead of the existing text-regex delegation, since a structured graph is unambiguous), and the Scheduling drivers. Previously only the Explorer client looked, so **Slack/Teams and scheduled routines silently dropped every graph an agent emitted** — the plan's core verified gap. The detection shim is explicitly temporary and dies in Phase 3 when `Tasks` becomes a typed `nextStep`.

  **Provider isolation.** The dispatcher mints a fresh provider per task via an injected `ProviderFactory`, so parallel tasks never share a transaction scope. MJServer supplies the implementation, keeping the dependency MJServer → task-graph and never the reverse.

  **Also:** 18 new unit tests for the validator; integration bundle grows with the three seam checks deferred from Phase 1 (cycle rejection, unknown-agent rejection, payload columns), now targeting `TaskGraphService`'s public API.

- 394d276: Phase 3 of the unified workflow DAG engine program (plan: PR #3456) — durable task graphs become a first-class agent primitive.

  **`'Tasks'` joins the Loop response union.** An opted-in agent emits `nextStep.type = 'Tasks'` with a `TaskGraphSpec` and the framework does the rest. The distinction from `subAgents[]` is durability, not parallelism: `subAgents[]` is ephemeral fan-out that blocks the run and dies with it, while a task graph becomes real Task rows a server-side dispatcher owns — visible in the Tasks UI, resumable after a restart, able to wait on a human.

  **The capability is gated, and the gate is enforced rather than advisory.** `enableTaskGraphs` defaults to **false**, unlike every other Loop prompt parameter. The others only shape the prompt — turning one off saves tokens and an agent that emits the feature anyway still works. This one governs whether an agent may create durable rows that outlive its run, execute on a dispatcher under the submitting user, and spawn further agent runs. So beyond omitting the type from the prompt, `LoopAgentType` _rejects_ a `'Tasks'` step from a disabled agent with a corrective that steers it back to Sub-Agent/Actions. The gate fails closed: an absent flag, an absent params bag, and the string `"true"` are all refusals.

  This matters more than it looks, because `HarnessAgentType extends LoopAgentType` and intentionally inherits `DetermineNextStep` — so the primitive reaches external agent harnesses (Claude Code / Codex / Pi running inside MJ) the moment it reaches Loop agents. That inheritance is the design working, but it moves the gate from a nice property of one class to the thing standing between a sandboxed external CLI and durable server-side work. It is therefore tested through the harness path, with the inheritance itself pinned so a later override cannot silently move those assertions onto a different code path.

  **`TaskGraphSpec` and its validator move to `@memberjunction/ai-core-plus`,** next to the pure graph algorithms they belong with. That is what lets the agent framework validate a graph without depending on the durable-execution package — which would otherwise drag the entity layer and the dispatcher into every context that merely runs an agent, including unit tests with no database. The Loop type validates against the identical contract the server re-validates at submission (D16), so a graph cannot pass one check and fail a different one later.

  **Single-node constant folding (D9), recorded rather than silent.** A one-node graph with no edges, an agent assignee and default continuation is rewritten into an ordinary in-run sub-agent call — don't spin up loop machinery for a loop of one. The `TaskGraph` run step is written either way, carrying the spec, a `folded` flag and the reason. Three consequences: run forensics show why a graph did or didn't reach the dispatcher; a user who edits a two-node graph down to one can read the durability change off the run record instead of inferring it; and Save as Workflow (D17) attaches to the recorded spec, so the single-node case — the shape most likely worth promoting — stays promotable. `durable: true` opts back into a Task row.

  **Submission crosses a registered seam.** `TaskGraphSubmitter` is declared in `ai-core-plus` and implemented in `@memberjunction/task-graph`, resolved through the ClassFactory. A host with no durable-execution package gets `null` and the agent reports an honest failure — what must never happen is a graph vanishing quietly while the model believes it scheduled work.

  **Continuation contract.** The parent Task row durably carries `continuation`, `reinvokeDepth` and the delivery marker, because the dispatcher instance that finishes a graph is routinely not the one that accepted it. Delivery marks _before_ it acts: the worst case becomes a missed notification visible in the task record rather than a notification repeated on every reconciliation sweep forever — which, for `reinvoke`, would be an unbounded agent-run loop. Chains are capped at 5 hops, bounded separately from task-nesting depth because they are different loops; at the cap the mode degrades to `message` so results still reach the user. `'reinvoke'` itself is not wired here — it would invert the dependency to task-graph → ai-agents — and lands in Phase 4 where the dispatcher already holds an execution engine.

  **Sage and the Workflow Planner stop payload-smuggling.** Both prompts move from `payloadChangeRequest.newElements.taskGraph` to the real `nextStep`, and the temporary server-side payload sniff introduced in Phase 2 is deleted along with its messaging and scheduling call sites — the primitive submits inside the run, so channel seams no longer need to look.

  **Launch opt-ins (D3):** Sage, Workflow Planner, Query Builder, and the Research Agent with its four sub-agents. Workflow Planner is not on the plan's opt-in list, but emitting task graphs is that agent's entire job, so leaving it gated would have broken it outright.

  **Coverage:** 43 new unit tests (18 Loop, 5 harness, 20 continuation-metadata) and a new integration check, TG8, asserting both directions the metadata gate can be wrong — an opt-in that was never pushed leaves an agent unable to delegate at all, and a Loop _type_ default left on would hand durable reach to every Loop agent in the install at once. IT71 runs 8/8.

- 394d276: Phase 4 of the unified workflow DAG engine program (plan: PR #3456) — convergence. Design-time flows and runtime task graphs stop being two graph models and become one.

  **One traversal engine, `GraphTraversalEngine`.** Flow agents and task graphs were always the same shape — nodes, conditional edges, joins — reached from opposite directions. `FlowAgentType` did not merely have its own copy of the traversal rules; it had **four**, written out separately for the post-prompt, post-action, initial-step and skip-recursion paths. They had already drifted: the skip recursion omits the inactive-destination fallback the other three have, so a skipped node routed differently from a normal one for reasons nobody chose. Both executors now consume one dependency-free engine — graph storage arrives through a synchronous repository seam, condition evaluation through an injected evaluator — so the in-run and durable executors keep completely different state backends while sharing one definition of the rules.

  **Four behaviors deliberately changed, each pinned by a named test** so a future "restore parity" pass has to argue with a test rather than quietly undo a fix:
  1. **Fan-out follows every satisfied edge.** The old code fetched the full edge list and then indexed `[0]`, silently discarding the rest — a genuine fan-out ran one branch and dropped the others with no diagnostic.
  2. **A missing destination is a rejection, not a fatal error.** Previously an _inactive_ destination fell through to the next alternate while a _dangling_ one failed the graph outright. A data problem should not be more fatal than a deliberately disabled step.
  3. **A condition that throws is distinguishable from one that evaluated false.** Both still refuse the edge — a malformed expression must never become an accidental `true` — but a graph stalled by a typo no longer looks identical to one that finished normally.
  4. **Results are addressed by node id.** The old lookup read the tail of the execution path, which was deduped on revisit, so a condition on a loop-back edge silently read a _different_ node's output.

  Also not ported: the `Priority <= 0` fallback branch, which was unreachable. Unconditional edges are collected in the main pass, so it could only run when every edge had a condition — in which case it matched nothing. Fallbacks work, and always did, via an unconditional low-priority edge.

  **Frontier, joins and concurrency.** `TraversalState` tracks a set of active nodes rather than a single program counter. AND-joins (matching `Prerequisite`) are the default and OR-joins map to `Optional` — which is _why_ the two models converge: "wait for every predecessor" is the same rule in both. A predecessor that failed, or that can no longer be reached, counts as settled rather than pending, so an AND-join behind an untaken branch cannot deadlock.

  **Flow gets a params bag.** `traversalMode` defaults to `'sequential'`, and that default is load-bearing: existing flows have fan-out shapes drawn in the editor that have never actually run in parallel, and flipping the default would start executing branches their authors have never seen run. Graphs built from a `TaskGraphSpec` always run parallel regardless.

  **Conditional edges for durable graphs** (migration: `TaskDependency.Condition`, NULL = unconditional, so no existing graph changes meaning). Same column shape and same grammar as `AIAgentStepPath.Condition` — deliberately, because if the two needed different storage then Save as Workflow would need a translation layer and the models had not really converged. The dispatcher resolves conditions by _dropping_ edges rather than adding a second rule to eligibility, which keeps one definition of "ready". One asymmetry is intentional: where the flow executor skips an edge whose condition cannot be evaluated, the dispatcher **keeps** it — there, dropping a prerequisite would run a dependent task early, turning a typo into out-of-order execution, whereas keeping it stalls the graph visibly.

  **Human tasks are announced.** A human task becoming eligible is the moment its assignee can finally act, and nothing else in the system knew that moment had arrived — the task sat `Pending` behind prerequisites and no save touched it when they cleared. Without a notification the workflow simply stopped, waiting on someone who was never told. The dispatcher now sends one through `NotificationEngine` (new metadata-seeded `Task Assignment` type) exactly once, marked durably so a restart cannot resend. Assignment stays self-only until the authorization model in #3524 lands.

  **`continuation: 'reinvoke'` is now delivered**, via a `TaskContinuationDeliverer` seam. Deferred out of Phase 3 because implementing it inside the dispatcher would have inverted the dependency to task-graph → ai-agents; the seam keeps the direction correct, and a host that cannot start agent turns degrades to a message rather than dropping the outcome of work that genuinely ran.

  **Save as Workflow (D17)** — `ConvertTaskGraphToAgentSpec` projects a runtime graph onto a Flow `AgentSpec`. That it is a projection and not a translation is the empirical test of whether the convergence was real. The one inversion: `dependsOn` points backwards, a flow path points forwards. Losses are **returned, never swallowed** — a conversion that quietly dropped a human approval step would hand someone a workflow that skips an approval they believed they had saved.

  **`TaskOrchestrator` retired.** Phase 2 orphaned it; it had zero callers and was not even exported.

  **Coverage:** 47 new unit tests (29 traversal engine, 18 converter) plus integration checks TG9 (conditional edges round-trip) and TG10 (the notification type is seeded). IT71 runs 10/10.

  Two latent test failures fixed along the way, both of which were hiding: `flow-agent-type.test.ts` (18 parity tests) stopped collecting once the adapters pulled `core-entities` into its module graph, and IT71 had a metadata record but was **never joined to the integration suite**, so it would not have run in the deterministic tier at all.

- 394d276: Phase 7 of the unified workflow DAG engine program (plan: PR #3456) — Track D, the trigger layer. Everything here closes a gap where something _claimed_ to work and did not.

  **Entity-change triggers only bind where an agent can safely run.** A `WorkflowSpec` trigger passed its `invocationType` straight through, and `Validate` / `BeforeCreate` / `BeforeUpdate` / `BeforeDelete` are real invocation names — so a workflow could bind an unbounded agent run _inside_ a user's save, in the held transaction, with the power to abort it. Validation now refuses anything but the `After*` forms, and the shorthand an author writes (`Update`) resolves to `AfterUpdate` rather than drifting from the name the platform actually fires. That drift was live: the contract documented `Create | Update | Delete`, none of which the platform matches, so the first trigger ever saved through it failed to resolve.

  **Trigger scope stopped being decorative.** `scopeEntityName` / `scopeRecordID` were declared, documented, accepted by validation — and then referenced nowhere in reconciliation. A workflow the author scoped to one record fired on _every_ record of the entity while the UI showed it as scoped. They now reconcile onto the binding's own `ScopeEntityID` / `ScopeRecordID`, which the engine's scope resolver already honored. `filter` is **refused** rather than accepted-and-ignored: narrowing by predicate needs the before/after values of a change, a contract that does not exist yet, and a workflow runs an agent — over-firing costs real money. Accepting it later is additive; the reverse would break specs already published against it.

  **An entity may bind the same action more than once (`UQ_EntityAction_ActionID_EntityID` dropped).** The v5.37.x junction sweep added that constraint under a stated scope of _"pure junction tables — two foreign-key columns plus ID/Sequence/timestamps, with no other meaningful data columns."_ `EntityAction` never met it: even then it carried `Status`, `Sequence` and `LoggingMode` and owned three child collections. Three months later #3408 added `ScopeEntityID`/`ScopeRecordID` so a binding could attach to "this Deal Type" — a feature the constraint makes unusable, since one binding per (entity, action) means one scope, so "every Deal" and "this Deal Type" cannot coexist. It also forced a single param set, filter set and scope to be shared across _every_ event an action responds to, making "on create run agent X, on update run agent Y" unexpressible. `V202608080100__v6.1.x__Drop_EntityAction_Uniqueness` removes it with no replacement; a narrower index would still refuse two unscoped bindings differing only by invocation type. Nothing in the runtime assumed uniqueness — every accessor already returns a collection and `HandleEntityActions` already iterates — so this is schema-only. Each workflow now owns its own binding, matched on the agent it dispatches to plus its scope; reusing a shared row would have rewritten `AgentID` and silently repointed one workflow's trigger at another's agent.

  **A self-trigger guard, because enrich-and-write-back is the normal shape.** "When a ticket changes, summarize it and store the summary" saves the ticket, which re-fires the action, forever. `EntityActionDispatchGuard` keys every automatic dispatch by `(entity action, entity, record)` and tracks origin through the async call tree with `AsyncLocalStorage`, so re-entry is detected however deep inside an agent run the write-back happens — no call site threads anything. Re-entry is **suppressed**, not deferred: queuing it would turn an infinite loop into an infinite sequence. A merely _overlapping_ save is a different problem with the same key, so it **coalesces** — latest wins, one pending rerun, and a burst of ten saves collapses to two runs instead of ten. Only after-hooks are guarded; `Validate` and `Before*` participate in the save and must neither be skipped nor deferred. Work that has detached from the async context (a durable task graph, a queued job) declares its origin explicitly through the new `EntitySaveOptions.OriginatingEntityActionIDs`.

  **Scheduled-job notifications actually send.** `NotificationManager` logged `"Would send notification to user …"` while `NotificationEngine` sat one package away. It now delivers for real, and composes the two people who have a say: the job's `NotifyViaEmail` / `NotifyViaInApp` toggles are a **ceiling**, the recipient's preferences decide within it. Neither existing knob expressed that — `forceDeliveryChannels` would let a job override a recipient's opt-out, and omitting the toggles would let a type default fire a channel the job never asked for. `SendNotificationParams.allowedDeliveryChannels` is the new primitive; it can only subtract, which is what makes it safe to expose.

  **"Execute Scheduled Job Now" runs the job.** It used to insert a `Status='Running'` run row and report success. Nothing consumed those rows — the poller selects jobs by _schedule_, never by pending run record — so the action left a row that said Running forever and ran nothing. It now executes through `SchedulingEngine`, and a failed job is a failed action rather than a successful insert. `Wait=false` starts it without blocking.

  **The dispatcher has somewhere to deliver.** `StartTaskGraphDispatcher` constructed it with no continuation deliverer at all, so a finished graph logged its outcome, marked itself delivered, and said nothing to the conversation that asked for it. `TaskGraphContinuationDeliverer` posts the roll-up with per-step detail. `Reinvoke` stays unimplemented on purpose: a safe one needs the new agent run to remember it was a continuation at depth N so `MAX_REINVOKE_DEPTH` can stop the chain, and nothing durable records that — a cap that never trips is worse than degrading to a message.

  **IT71 grows to 16 checks.** TG14 drives the save-to-binding round trip that Phase 6 owed; TG15 pins that a scoped trigger actually narrows; TG16 pins that two workflows on one entity keep separate bindings pointing at their own agents, and that re-saving finds its own row rather than adding a third. TG14 caught a second real bug on its first run — the invocation-type mismatch above — and TG16 is what surfaced the unique constraint.

- 394d276: Phase 8 of the unified workflow DAG engine program (plan: PR #3456) — the remaining Track D mechanisms, plus the observability decision that had been open across three reviews.

  **A live signal from the dispatcher.** The choice was between claim-store cache invalidation and semantic frames; frames won because a consumer should render "step 3 of 7 running" from the event itself rather than re-reading Task rows and diffing them to guess what changed. `TaskGraphObserver` emits `TaskStarted` / `TaskCompleted` / `TaskFailed` / `TaskBlocked` / `TaskAwaitingHuman` / `GraphSettled`, and MJServer publishes them on a new `taskGraphFrames(parentTaskId)` subscription.

  Addressed by **`ParentTaskID`, deliberately not by session**: a durable graph outlives the tab that submitted it and may be started by a schedule with no session at all, so keying on the graph means "watch this workflow run" works for whoever is permitted to see it, whenever they arrive — including after a refresh, which a session-keyed push cannot survive. Emit points sit where the fact is already true: `TaskStarted` after the claim is held, `Task{Completed,Failed}` only once the guarded write lands, `GraphSettled` outside the continuation's once-only CAS. The observer is optional and its errors are swallowed in one place, because a frame is commentary on work and must never stall or fail a graph.

  Delivery **fails closed**. A `parentTaskId` is discoverable, so without a connection-identity check anyone holding one could watch another user's workflow, per-step error messages included. Ownership rides on the frame — resolved once per graph and memoized, since a subscription filter runs per frame and synchronously, and a database round trip there would make watching a run cost more than running it. It lives in the parent's durable metadata rather than a column because `Task.UserID` already means "the person this task waits on"; setting it on a parent would make every graph look like a human task.

  **`MAX_REINVOKE_DEPTH` finally compares against a real number.** Phase 3 shipped the cap and Phase 4 shipped the metadata carrying `reinvokeDepth`, but the value was permanently zero: `Submit` reads it from its caller, `BaseAgent` never passed one, and a reinvoked agent had no way to know it _was_ a continuation. Phase 7 therefore left `Reinvoke` unimplemented on purpose — a cap that never fires is worse than one continuation mode being unavailable, because the failure mode is an unbounded chain of real agent runs. `AIAgentRun.ContinuationDepth` closes the loop: the deliverer stamps depth + 1 on the run it starts, `BaseAgent` passes its own run's depth into any graph it submits, and the chain is bounded. `Reinvoke` degrades to posting whenever it cannot restart a turn (no submitting run, run or agent unloadable) and never throws, since the dispatcher calls it inside the delivery CAS.

  **Scheduled jobs answer what to do about fire times they missed.** `MissedRunPolicy` — `RunOnce` (default), `RunAll`, `Skip`. The default is not a preference: `updateJobStatistics` already computed the next run from _now_, so a job whose `NextRunAt` had passed ran once and jumped forward. That is `RunOnce`, and defaulting to `Skip` would have silently stopped every existing job in every install from catching up. `RunAll` is safe to offer because its next run is computed from the occurrence just consumed, so a week-long outage walks one occurrence per poll tick rather than firing 168 jobs at once. "Missed" is defined cron-relatively — a _later_ occurrence has also come due — rather than by a grace window, which would misjudge a per-minute job after a short pause and a monthly job that is a week late in opposite directions.

  The decision **fails open** throughout: it can only ever withhold a run the schedule already said was due, so an unparseable cron or a helper returning anything but a date lets the job through. And it is **synchronous** on purpose — it runs immediately before lock acquisition, where an added microtask reorders against the sweep's fire-and-forget cleanup; only the skip branch writes, and that is awaited separately.

  **One-shot scheduling needed no new schedule shape.** `Status='Expired'` had been a declared value that nothing ever set. `isJobDue` already refused a job past its `EndAt`, so such a job stopped running on its own — but stayed `Active` forever, permanently inert, and kept driving `UpdatePollingInterval`, so "cron at T plus `EndAt` just after T" left the whole scheduler polling at that job's cadence for a job that would never run again. Retiring it is the fix; "run once at T" was already expressible. Deliberately narrow: only `Active`/`Pending` transition, because a `Paused` job was put there by a person, and only `EndAt` triggers it, since a cron always has a next occurrence and inferring exhaustion would be guessing.

  **IT71 grows to 18.** TG17 asserts the new schema through the ORM rather than trusting the migration — the pair that drifted in Phase 4 when a migration applied but CodeGen ran against a stale definition. TG18 saves a job with `RunAll`, reloads it to prove the value survives the CHECK constraint, and saves a policy-less job to prove the `RunOnce` default.

- 394d276: Follow-up to Phase 2 of the unified workflow DAG program (plan: PR #3456) — the task-graph control plane becomes **Remote Operations**, and the durable dispatcher actually starts.

  **BREAKING: the `SubmitTaskGraph`, `CancelTaskGraph`, and `RetryTask` GraphQL mutations are removed**, one release after they were added. They shipped in Phase 2 as bespoke resolvers, which fixed the _durability_ problem — nothing awaits a whole workflow inside one request anymore — but left the _reachability_ problem exactly where it was: callable from the Explorer client and nothing else. That undercuts the program's own goal of letting agents **set up** workflows rather than only navigate to them.

  Remote Operations are MJ's typed control plane, and the closest analogous substrate already uses them for precisely this shape of verb: Record Set Processing exposes `Run` / `Pause` / `Resume` / `Cancel` / `Get Run Status` entirely as Remote Operations. One registration is reachable from MCP (external agents), from an Action wrapper (internal agents), and from the UI, with the framework's authorization scopes applied uniformly rather than re-implemented per resolver.

  The replacements are `TaskGraph.Submit`, `TaskGraph.Cancel`, `TaskGraph.RetryTask`, and `TaskGraph.GetStatus`. `GetStatus` is new — it has no mutation predecessor. It is the observation half of making execution durable: once nobody holds a request open, a caller re-attaching after a reload, an agent checking work it submitted, or an external MCP caller all need a way to ask "where is it?". Its rollup runs the same pure algorithm the dispatcher runs, so the reported status cannot disagree with the engine's own view.

  There is deliberately no `TaskGraph.Pause`. The dispatcher has no pause concept — pausing a claimed task means deciding what happens to its claim, and inventing that here to round out a verb set would be guessing ahead of Phase 4.

  **The durable dispatcher now starts.** Phase 2 landed `TaskGraphDispatcher` but nothing ever instantiated it, so a submitted graph persisted correctly and then sat in `Pending` forever — durable and inert, which is strictly worse than the client-driven path it replaced. MJServer now starts one instance per process after `listen()`, alongside the other boot-time reconcilers, keyed by hostname + pid so reconciliation can tell its own orphaned work from a peer's live work. It is gated on SQL Server because the provider factory mints a `SQLServerDataProvider`; the PostgreSQL branch lands with PG parity.

  **The dispatcher self-registers with `ShutdownRegistry`** rather than making each host remember to stop it. A dispatcher still polling through a graceful shutdown would claim work the process is about to abandon — creating exactly the orphaned-claim state reconciliation exists to clean up.

  The Angular conversation client now calls `TaskGraph.Submit` through the generic `ExecuteRemoteOperation` transport, so the hand-written GraphQL document is gone from the client as well.

- 394d276: Phase 6 (Track E) — **`WorkflowSpec`: one object binding WHAT runs to WHEN it runs.**

  `TaskGraphSpec` answered _what_ a workflow does; the scheduling and entity-action substrates answered _when_ something fires. Nothing expressed both at once, so "a workflow" was not a thing anyone could hand over — it was a graph plus a separately-configured trigger that only a human knew were related.

  **`graph` is `TaskGraphSpec` verbatim, not a copy.** That is why this composes rather than translates: a graph authored on the canvas, emitted by an agent, or promoted from a past run is _already_ this shape. A parallel graph type would have re-created the drift Phase 4 spent itself removing.

  **No new storage, and that is the design.** There is no `Workflow` table. A workflow's WHAT is a Flow agent; its WHEN is a Scheduled Job. `WorkflowSpecSync` **reconciles** those, following the pattern `MJRecordProcessEntityServer.Save()` already proved — resolve the type, find the rows this definition owns, upsert or disable. Inventing a `Workflow` row would create a second definition of "a scheduled thing" and give the scheduler two masters that can disagree.

  Rows are owned by a marker inside their own `Configuration`, not by name, so **renaming a workflow cannot orphan its schedule** and leave a second one firing beside the new row. A trigger the spec no longer names is **disabled, not deleted** — the row carries run counts, last-run and next-run, which are the only record it ever fired.

  **Order is load-bearing.** The agent persists _before_ triggers reconcile, because a Scheduled Job needs its ID to point at. Reversed, you get a job referencing an agent that does not exist — a schedule that fires forever and does nothing, with no error anyone sees. Validation runs before either, so a rejected save leaves no orphan agent behind.

  **Two operations, because drafting and committing are different acts.** `Workflow.Validate` writes nothing, so an agent can iterate a draft before anything reaches the scheduler — the draft-then-confirm shape dry-run and Plan Mode established. `Workflow.Save` commits. Both run the identical validator, so a workflow that validates cannot be rejected on save for a different reason. Together they close the "agents cannot schedule anything" hole: today `Create Scheduled Job` cannot even set `Configuration`.

  **Agent persistence crosses a seam.** `AgentSpecSync` is the one place that writes an agent; importing it into the execution substrate would invert the dependency, so the host registers a writer instead. A host without one gets an honest failure rather than a half-saved workflow. The writer reuses Phase 4's `ConvertTaskGraphToAgentSpec` unchanged — "save a runtime graph as a workflow" and "persist a workflow's graph" turn out to be the same operation, which is the practical payoff of the convergence.

  **A discovery worth recording:** `AgentScheduledJobDriver` has existed since the scheduling engine shipped, and `ScheduledJobType.DriverClass` is UNIQUE — so the `Agent` job type was already seeded. The substrate for scheduling an agent was there all along; only the authoring surface was missing. TG12 now pins that seed, because without it a scheduled workflow throws at the moment a user is least able to interpret it.

  **Draft is the default status**, not Active. Every authoring surface — the canvas, a chat card, an agent's MCP call — produces something the author has not yet watched run against real data.

  **Entity-change triggers reconcile too.** My first pass deferred these to Track D on the belief that entity-action invocation was not wired. AN-BC challenged that and was right: `HandleEntityActions` has fired entity actions from the save pipeline all along — validate, before/after save, before/after delete — and `Execute Agent` exists as the dispatch target, written for exactly this. Nothing was missing but the **binding row**. `WorkflowSpecSync` now creates the three rows that express "when an Invoice is updated, run Execute Agent with this agent": the `EntityAction`, the `EntityActionInvocation`, and an `EntityActionParam` carrying the agent. Idempotent by lookup rather than delete-and-recreate, because re-saving a workflow must not detach and re-attach a live trigger — a change landing in that window would be missed.

  40 new unit tests (29 validator, 11 sync) plus integration checks TG11 and TG12. IT71 runs 12/12.

### Patch Changes

- 394d276: **IT74 executes task graphs for real, and fixes the three production bugs that found.**

  IT71 has eighteen checks and not one of them runs a graph — nine assert metadata, nine verify the rows a save produces. Everything past "the rows are correct" was unit-tested against fixtures and never against SQL Server. IT74 stands up a real `TaskGraphDispatcher` with a stub `TaskAgentRunner` injected through its existing seam, so the claim protocol, condition evaluator and rollup all run with no model calls, no tokens and no network.

  **The dispatcher read its own work queue through a stale cache.** `TaskClaimStore` mutates task rows via direct SQL — correct, since the CAS guarantee _is_ the database's atomicity — but direct DML fires no invalidation, and the discovery queries used `RunView` without `BypassCache`. Completions written on the claim path stayed invisible, so `loadGraphState` kept seeing `In Progress` and graphs never rolled up.

  **A graph that succeeded could never settle.** `findActiveGraphIDs` selected graphs by non-terminal _children_, so the moment the last child completed the graph left that set — and the pass that would have rolled the parent up never saw it. Every fully-successful graph stayed `In Progress` forever and its continuation never fired. A _failing_ graph happened to survive, because blocking its dependents left them non-terminal for one more pass, which is why the bug hid behind a passing failure-path test.

  **A not-taken branch ran instead of being skipped.** A definitely-false edge condition was resolved by _dropping_ the edge — which removes the dependent's only prerequisite and makes it eligible in the very next wave, potentially before the node that gated it. The code's own argument against dropping unevaluable edges ("a prerequisite silently disappears and the dependent task runs early") applies verbatim to the false case. Such a dependent is now recorded unreachable and blocked, and only when _every_ route in was cut.

  Also hardened: `ComputeParentRollup` treats an empty child set as Complete-and-terminal, which is right for a childless graph and catastrophic for one whose reload came back empty transiently — it would mark live work finished and fire its continuation. The outer guard covered the first load only.

  `TaskGraphDispatcherConfig.PollIntervalSeconds` is new (default 5, unchanged behavior). The interval was hardcoded; five seconds is right for production, where steps are agent runs, but it made a four-node graph take twenty seconds to observe.

- Updated dependencies [394d276]
- Updated dependencies [394d276]
- Updated dependencies [394d276]
- Updated dependencies [394d276]
- Updated dependencies [394d276]
- Updated dependencies [394d276]
- Updated dependencies [394d276]
- Updated dependencies [394d276]
- Updated dependencies [394d276]
- Updated dependencies [394d276]
- Updated dependencies [394d276]
- Updated dependencies [394d276]
- Updated dependencies [394d276]
- Updated dependencies [394d276]
  - @memberjunction/core@6.1.0-edge.1
  - @memberjunction/core-entities@6.1.0-edge.1
  - @memberjunction/ai-agents@6.1.0-edge.1
  - @memberjunction/ai-core-plus@6.1.0-edge.1
  - @memberjunction/notifications@6.1.0-edge.1
  - @memberjunction/global@6.1.0-edge.1
