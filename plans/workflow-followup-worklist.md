# Workflow follow-up worklist — ACTIVE

> **Read me first if you are resuming this work.** This is the live task list for the planner-agent
> review of PR #3692. It is written to survive a context compaction: every item states what is
> wrong, where, and what "done" looks like, so work can resume without re-deriving anything.
>
> Branch: `feat/workflow-run-visualization` (off `next`, tracks its own remote).
> User is **asleep**; work continuously. Deviation protocol: if an item fights back on contact,
> post to the PR thread rather than forcing it.

## Status legend
`[ ]` not started · `[~]` in progress · `[x]` done + committed · `[!]` blocked, see note

---

## Committed already (do not redo)

- `ba15a3b1c4` — `AgentRunTreeNode` + `BuildAgentRunTree` in CorePlus (10 tests); `Get Records`
  output params declared (`Records`, `TotalCount` only — unique constraint on `(Name, ActionID)`
  forbids re-declaring `EntityName`/`Filter`/`OrderBy` which already exist as inputs).
- `a8d3b2c156` — `maxIterations: 0` = zero iterations (parity with `base-agent.ts:12717`), JSDoc
  corrected at source on both operation types, pinning test corrected.
- `10ca430005` — `ProjectTaskRowsToSpec`, `mj-task-graph-run-view`, Surface A embed, harness
  `'workflow'` mode.

---

## THE FIVE (in order — user approved this order)

### [x] 1a. XOR race — filter `skipSeedTaskIDs` in claiming
**Where:** `packages/TaskGraph/src/TaskGraphDispatcher.ts`, `findClaimableTasks`.
**Wrong:** claiming filters `holdTaskIDs` but **not** `skipSeedTaskIDs`, so a fork's losing branch
can be claimed and executed in the tick before `Skipped` is written.
**Done when:** losers are excluded from claiming; a unit test pins that a task in `skipSeedTaskIDs`
is never returned as claimable.

### [x] 1b. R6 — definite-false ordinary edges settle `Skipped`, not `Blocked`
**Where:** `TaskGraphDispatcher.propagateAndRollup` / `ComputeTasksToBlock` in
`packages/AI/CorePlus/src/task-graph/graph-algorithms.ts`.
**Wrong:** only XOR losers become `Skipped`. An ordinary conditional edge that evaluates definitely
false still Blocks its target, so `Blocked` now means two different things — "branch not taken" and
"something upstream broke". Applies to loop-agent graphs too (declared correction).
**Rule:** `Blocked` is reserved for **failure-driven** unsatisfiability. Not-taken ⇒ `Skipped` +
cascade, exactly like XOR losers.
**Also:** the differential simulator currently writes `Skipped` where the real dispatcher writes
`Blocked` — it was hiding this exact divergence. Make the simulator match the dispatcher, then fix
both.

### [x] 2. Prompt runner (unbreaks a shipped agent)
**Why now:** `User Onboarding Flow Agent` has **6 Prompt steps** and is refused at submission today.
This is a live regression, not a future gap. `Task.PromptID` already exists in the schema.
**Contract (plan §5.7):** payload injection at `CURRENT_PAYLOAD_PLACEHOLDER` + `flowContext`;
deep-merge the JSON response into the payload; a `Chat` escape ⇒ remaining tasks `Skipped`, parent
`Complete`, message in parent output.
**Done when:** `'Prompt'` joins `DISPATCHABLE_KINDS`, a `TaskPromptRunner` seam exists in
`packages/TaskGraph/src/types.ts` implemented in MJServer (mirroring `TaskGraphActionRunner`),
`persistTasks` sets `PromptID`, and the User Onboarding agent submits.
**Note:** until it lands, do not teach `kind:'Prompt'` in the loop prompt template.

### [x] 3. Depth chain + submit-time enforcement
**Where:** `packages/MJServer/src/services/TaskGraphAgentRunner.ts`, `TaskGraphService.Submit`.
**Wrong:** graph-spawned runs never stamp `ContinuationDepth`, so a self-referencing flow recurses
unbounded. Cap exists (`MAX_REINVOKE_DEPTH`) but nothing feeds it.
**Done when:** the runner stamps depth (parent's + 1, read from the parent Task's metadata) and
`Submit` refuses beyond the cap with a message naming the workflow.

### [x] 4. Refuse Flow-agent-as-sub-agent / scheduled target
**Wrong:** both report success-before-work; downstream proceeds on nothing. Most dangerous item in
the review.
**Done when:** submitting a Flow agent as a sub-agent step or a scheduled target fails **loudly** at
submit, with a message saying an await path does not exist yet.
**STATUS: DONE, both halves.** Sub-agent: `FlowAgentType.DetermineInitialStep` refuses when
`params.parentRun` is set. Scheduled: `AgentScheduledJobDriver.Execute` refuses a Flow-type target
before running it — placed there rather than at submission because that is where the caller's
expectation lives (a job expects a completed unit of work).

### [x] 5. Wire `failureSemantics: 'edges'`
**Wrong:** the compiler sets it; nothing persists or reads it. Recovery paths are dead machinery.
**Done when:** persisted at submit (parent metadata), `handledFailureIDs` computed (a `Failed`
origin **with a satisfied outgoing edge**), passed to `ComputeTasksToBlock` / `ComputeParentRollup`,
and `Failed`-decides in `ResolveExclusiveGroups` scoped to `'edges'` specs only.

---

## Also promised to the user

### [x] Max tree depth 100 + loud logging
`MAX_AGENT_RUN_TREE_DEPTH` 50 → **100**. When the cap is hit: log loudly to server logs **and**
persist the fact (so it is visible in the DB, not just in a log nobody reads).

### [x] PR comment covering #16, #3, #1
Post **one** comment on PR #3692 addressed to the planner agent:
- **#16 (three mapping dialects):** agree, but split — `flow-agent-type.ts` copies are behind the
  runtime refusal (dead code, low value); the **live `base-agent.ts` Loop-path clones** are the real
  drift risk. Ask them to confirm the split.
- **#3 (v1-shape templates):** **CHECK FIRST**, then report the finding in the comment.
  Files: `workflow-drafting.template.md`, `workflow-planner.template.md`. Do they still teach flat
  `agentName`/`assignToUser`? If yes → P0. If already converted → say so.
- **#1 (retirement migration):** confirm AN-BC/this branch owns restoring the Workflows app as the
  workflow-runs surface; `V202608082330__Retire_Workflows_Application.sql` should be removed and the
  app restored as metadata. We are the collision they warned about.

---

## Then (previously agreed, still owed)

> **PR #3698** is open for this branch (base `next`). #3692 is MERGED — it was the planner's
> `feat/workflows-single-editor`, not this branch. Post follow-up comments on **#3698**.

### DONE since the review round
- [x] Workflows app restored as the **Runs** surface (`09f270b1f9`). Retirement migration KEPT (it is
      merged to `next`; deleting it would force a from-scratch rebuild on every dev DB). App declared
      in `metadata/applications/.workflows-application.json` with a NEW id `E29BDE35-…`. No second
      editor: the front door calls `Workflow.Save` (Draft, no triggers) then opens the agent form.
- [x] `Configuration.runtime.promptRunID` + `ParentRunID` on spawned runs (`86a23f5ae5`).
      `ITaskStepConfiguration.ts` → `mj sync push --include=entities` → `mj codegen --skipdb`.
- [x] Run-tree stored query + `LoadAgentRunTree` (`730e5a459d`). **Verified against the live DB.**
      Gotcha found: SQL Server forbids an OUTER JOIN in a recursive member — the prompt-cost join
      lives in the final SELECT and the id is carried through the recursion.

### Remaining
- [ ] Refactor the Agent Run timeline onto `LoadAgentRunTree` (fixes the ordering + indent bug the
      user saw in Associated Tasks); task-graph nodes colour-coded as dispatcher-provenance.
- [ ] **Revert** the nested-canvas embed under the TaskGraph step — run-step-style tree nodes, canvas
      in the **right panel on selection** (the pattern already built in `workflow-runs-resource`).
- [ ] Subway Lines visualization consuming the same tree.
- [ ] #16: consolidate the LIVE `base-agent.ts` Loop-path mapping clones onto `payload-mapping.ts`.
      The `flow-agent-type.ts` copies STAY (differential oracle) — user confirmed the split.
- [ ] A3: integration tier `Test`/`TestSuite` records as declarative metadata (user said fix here).
- [ ] Metadata: **Content Pipeline** flow agent — AND-join of Research + Web Research → Copywriter →
      `While (payload.brandOK !== true)` `maxIterations: 3`, body reviews+revises in ONE iteration
      (graphs are acyclic) → HITL → give-up branch → **Create Document (MJ artifact/PDF)**.
      NO external publish — user ruled that out.
- [ ] Metadata: **Schema Documentation Sweep** flow agent — `Get Records` on `MJ: Entity Fields`
      filtered to blank Description → `{"Records": "fields"}` → capped `ForEach` → sub-agent proposes
      → Human approval → `ForEach` → `Update Record`.
- [ ] Integration checks for both, asserting the **run tree** rather than hand-joined tables.
- [ ] **Fresh DB rebuild**, then verify `Workflow.Draft` end to end + both agents (headless AND
      Playwright via MJExplorer). User explicitly asked for this.


## CURRENT STATE (2026-08-10) — read this first

**Branch `feat/workflow-hitl` → PR #3716 (OPEN).** #3701 and #3710 are MERGED. `next` is merged in.

### Landed in this wave (all verified live, not inferred)
- Duplicate workflow on approval — resume hook armed by our own null `ResumingAgentRunID`. DB-confirmed.
- OOM kill (exit 137) — unraisable request retried every poll forever. Split permanent vs transient.
- Loop first-classing — accumulating payload (a `While` can now reach its exit), `ContinuationDepth`
  (recursion hole through loops), `SubmittingAgentRunID`, sub-agent body payload, `prompt.outputMapping`.
- Recovery deadlock — `handledFailureIDs` now reaches eligibility; `unreachableTaskIDs` in claim filter.
- `[object Object]` — `_CURRENT_PAYLOAD` now JSON-serialized for templates.
- Run tree — sub-agent CTE member added; recursion cycle closed; task rows use normal displayers.
- Edge labels — condition not description, hover detail, `1/2` rank badge, token-based chip.
- **Behaviour change:** a second unreachable `StartingStep` now FAILS compile (was silent). Flagged in the PR.

### OPEN — next session picks up here
1. **Content Pipeline still not fully green.** Metadata fixed (single entry; `broad -> focused` path added
   and pushed) but NOT re-verified end to end — the last run was interrupted. Re-run and confirm the
   `approved` branch is now reachable. This is the only demo-blocking item.
2. **R7 decision** — `rollUpCostToSubmittingRun` (prompt-blind, mixed basis) vs the tree query
   (prompt-aware, own-cost). Two authorities disagree by construction. My vote: delete the write-back.
   BLOCKED pending confirmation nothing reads `AIAgentRun.TotalCostRollup` for display.
3. Review items not yet done: #10 envelope truthfulness, #4 input snapshot, #12 hold-aware stall,
   #14/#15/#17/#18.
4. **HITL gaps:** `assignToUserID` compiled+tested then discarded at persist; Cancelled = permanent
   stall (no re-raise path); nothing ever sets `ExpiresAt`; no caller authz on respond; D17 converter
   still drops `Human`; no Human node in the visual editor.
5. **Playwright screenshots** — blocked on an expired Auth0 token in `.playwright-cli/profile`.
   One headed login unblocks `scripts/verification/verify-agent-run-ui.mjs` permanently.

### Pattern worth remembering
Two of the last three bugs shared a shape: reasoned carefully about a trade-off, wrote the reasoning
down, got the direction backwards. Both produced SUCCESSFUL runs with wrong results. Run the demo
agents after each dispatcher change, not at the end of a batch.

---

## Standing facts worth not rediscovering

- **Stale `dist` trap:** `tsc && tsc-alias -f` — a failed `tsc` skips `tsc-alias`, leaving
  extensionless imports that break native ESM. Symptom: `ERR_MODULE_NOT_FOUND` in an *unrelated*
  package (bit MJCLI and TaskGraph). Fix: `rm -rf dist && pnpm run build`.
- **CodeGen ordering:** `mj sync push` **before** `mj codegen`, or `remote_operations.ts` regenerates
  from stale DB definitions and drops classes. Restore with
  `git show HEAD:<path> > <path>` to break the bootstrap cycle.
- **Fresh-install regenerations:** CodeGen on a fresh DB rewrites unrelated form components. Restore
  those from HEAD before committing; keep only the entities you changed.
- **`mj sync push` stamps `sync` blocks** into metadata JSON — revert them before committing
  (release-time concern, `metadata/CLAUDE.md` rule 1b).
- **Integration tier cannot run from scratch:** `metadata/test-suites/` has only two suites and
  `metadata/tests/` no `IT##` records. The check *code* is committed; the records that invoke it are
  not. **User asked for this to be fixed on this branch (A3).**
- **`mj sync push` treats a file with no `sync` block as NEW**, so re-pushing a just-pushed new
  record hits its unique constraint. Harmless on a DB about to be rebuilt; do not "fix" by adding
  `sync` blocks (metadata rule 1b — the build engineer stamps those at release).
- **NEVER `git checkout -- <file>`** (CLAUDE.md rule 2, and the classifier blocks it). Use
  `git show HEAD:<path> > <path>`. Back up pending edits to the scratchpad FIRST — a blocked
  compound command will not have run the `cp`.
- **Servers:** API :4000 (dispatcher), Explorer :4201, DB `MJ_6_1_0_FRESH_0808`. Restart after
  building for UI changes to show.
