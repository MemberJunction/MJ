# Unified Workflow — Program Plan

**Status:** v2 — build-ready companion to the finalized engine plan (v8); Track A item 1 updated after the PR #3525 hotfix shipped
**Date:** 2026-08-05 · updated 2026-08-06
**Origin:** Whole-repo workflow study (12-subsystem recon + verified critique) following the merge of PR #3408; companion to [`plans/task-graph-primitive.md`](task-graph-primitive.md) (PR #3456)
**Scope:** the program-level map — what exists, the doctrine, and the tracks. Each track ships as its own gated PR(s); this document is the constitution they reference, not a mega-deliverable.

---

## 1. The model — WHAT × WHEN

MJ does not need a workflow engine; it needs its existing pieces composed under one model:

- **WHAT runs is a DAG.** One generic graph execution engine — delivered by the task-graph plan (PR #3456). A **Loop agent spins up a DAG dynamically**; a **Flow agent IS a DAG** authored at design time, running deterministically through the same execution code (user-facing name: **Workflow**, per its D18). Ephemeral in-run or durable cross-run; producers differ, the engine does not. `TaskGraphSpec` is the one fully-qualified TS contract for a graph (its D16). Even "run one action" is a one-node graph — constant folding (its D9) makes that free at runtime.
- **WHEN it runs is the trigger layer.** Entity Actions (per-record lifecycle, PR #3408 — scope binding, sequencing, safe logging), Scheduled Jobs (system cron), User Routines (user-owned schedule + OnChange monitoring), on-demand (UI / Remote Operations / MCP), and direct agent invocation.

Everything else in the program is making these two axes meet cleanly for two personas — **a human** and **an agent** — each of whom should be able to set up a recurring workflow in minutes.

### Division-of-labor doctrine (already litigated; restated, not reinvented)

| Piece | Owns | Source |
|---|---|---|
| Entity Action | per-record lifecycle **trigger** | `plans/entity-action-workflow-extensions.md` §7 |
| Flow agent / task graph | multi-step **orchestration** (one engine, PR #3456) | `plans/task-graph-primitive.md` |
| Record Process | WORK × SCOPE × TRIGGER for **set-scale** work | `plans/record-set-processing-and-record-processes.md` |
| Actions | the universal **work** currency every trigger dispatches into | `packages/Actions/CLAUDE.md` |
| `MJ: AI Agent Requests` + Plan Mode | pause an agent for **one human decision** | `guides/AGENT_SKILLS_AND_PLAN_MODE_GUIDE.md` |
| `MJ: Tasks` + dispatcher | **durable** work items, incl. human tasks (PR #3456 D8/D14) | `plans/task-graph-primitive.md` |
| User Routines | the **personal** front door that compiles onto the scheduler | `plans/user-routines/design-brief.md` |
| Remote Operations | the typed **control plane** (run/pause/status over one call site) | `guides/REMOTE_OPERATIONS_GUIDE.md` |
| Pipelines | single-turn **data** programs — NOT work orchestration (#3456 D15) | `plans/tool-pipelines.md` |

No new workflow tables, no fifth orchestration model. The #3408 decision that killed the `WorkflowBinding`/`WorkflowRun` trio stands.

---

## 2. Program tracks

Tracks A–C are independent and can start immediately; D–F build on C.

### Track A — Substrate correctness (the unfinished #3408 runbook, minus what D14 re-homed)

The gaps that make the trigger substrate unsafe to promote to users. All verified in code during the study:

1. **Transition filters** — ⚡ *partially closed by hotfix [PR #3525](https://github.com/MemberJunction/MJ/pull/3525), merged to `next` 2026-08-06*: `RunSingleFilter` was `return true` (`ActionEngine.ts:308-310` at baseline); it now genuinely evaluates filters (ClassFactory `BaseActionFilter` subclass first, then compiled `Code`, **fail-closed** on error/non-boolean). **Remaining in this track:** the documented `OldValues`/`NewValues` + changed-fields contract in the filter context (BaseEntity already tracks per-field old values), the seeded `Field Changed` / `Field Changed To Value` filters (`metadata/action-filters/`), and the LTS 5.x backport of the hotfix (pending, tracked in the #3525 thread). Until the seeded filters exist, every AfterUpdate binding still fires on every save — the evaluation engine now exists, the declarative transition vocabulary doesn't yet.
2. **The Validate-path hole** — `EntityActionInvocationValidate.InvokeAction` (`EntityActionInvocationTypes.ts:349-374`) bypasses scope resolution AND provenance, so Validate runs ignore `LoggingMode` and param redaction cannot see the binding's `LogValue` rows — a whole-record Validate param logs raw. Close it.
3. **Retention** — nothing reads `ActionExecutionLog.RetentionPeriod` / `Action.RetentionPeriod`. Ship the bounded purge Scheduled Job (#3408 §5.8) with a config default.
4. **`RunEntityAction` null contract** — `ActionResolver.RunEntityAction` (`MJServer/src/resolvers/ActionResolver.ts:367-374`) dereferences `result.Success` unguarded; an out-of-scope binding (a legitimate `null`) reports as an error over GraphQL.
5. **Integration tests** — Entity Actions are the only workflow subsystem with zero coverage among the 72 deterministic check bundles. Add an `entity-action.checks.ts` bundle covering scope narrowing, sequencing, LoggingMode, redaction, and the Validate gate.
6. **Sync+agent guard** — warn on save / refuse at invocation for a synchronous (Validate/Before\*) binding that dispatches `Execute Agent` (#3408 §9 Q2). An unbounded agent inside a held transaction is a live hazard.

**Re-homed, not lost:** After\*-durability (runbook step 9) targets the #3456 dispatcher per its D14 — do **not** build it against `QueueManager`.

### Track B — v6 legacy retirement

**Executes as Phase 0 of the engine plan** (`plans/task-graph-primitive.md` §4) — first thing after the plan PR merges. v6.0 already shipped, so breaking removals are in-window now:

- **Drop** `Workflow`, `WorkflowRun`, `WorkflowEngine` (+ their `MJ: Workflows` / `MJ: Workflow Runs` / `MJ: Workflow Engines` entities and generated forms). Nothing outside generated code reads or writes them; the referenced `WorkflowBase` class does not exist in the repo. Frees the **Workflow** name for D18.
- **Drop the Skip-era `Report*` family** (scope expanded 2026-08-06): `Report`, `ReportCategory`, `ReportSnapshot`, `ReportUserState`, `ReportVersion` + entities/forms, `MJServer`'s `ReportResolver` (accepted v6 breaking change, same standard as the engine plan's D12), and the `Reports` resource-type metadata + Explorer wiring. Verified self-contained — all inbound `ReportID` FKs are within the family. Subsumes the previously planned `Report.OutputWorkflowID` / `Report.OutputTriggerTypeID` column drops.
- **Drop** `MJ: Scheduled Actions` + `MJ: Scheduled Action Params` and `packages/Actions/ScheduledActions{,Server}`. The legacy cron due-check is mathematically always-false (`scheduler.ts:159-171` — `cronParser.next()` is strictly after `evalTime`), nothing in-repo hosts the Express app, and `MJ: Scheduled Jobs` supersedes it entirely. Also drop `MJ: Output Trigger Types` (its sole referencer was `Report`).
- **Not in this sweep:** Entity AI Actions — deprecated but still live in the save path; absorption belongs with the After\*-durability work (an Entity Action binding to an AI-prompt action covers the use case).
- Mechanics: one v6 migration (+ PG counterpart), metadata removal, CodeGen, package deprecation per the Publish-No-Break philosophy where external surface is touched.

### Track C — The DAG engine (PR #3456, Phases 0–5 + Track R)

Executed in order per that plan (finalized v8): Phase 0 legacy retirement → Phases 1–4 engine → Phase 5 Workflow UX, with Track R (BaseAgent decomposition) parallel. Program-relevant outputs: the durable dispatcher (MJ's one durable-async substrate, D14, with D20 task-row integrity), human tasks as graph nodes (self-assignment only until [#3524](https://github.com/MemberJunction/MJ/issues/3524)), `TaskGraphSpec` (D16), Save as Workflow (D17/§3.9), the Workflow viewer/editor upgrade with its committed mockups (D19, `mockups/workflow-ux/`), and the reconciliation sweep that finally enforces `AIAgentRequest.ExpiresAt` and `Task.DueAt`.

#### Track C.1 — Flow agents onto the engine (**gap found 2026-08-08**) → [`plans/flow-agent-taskgraph-unification.md`](flow-agent-taskgraph-unification.md)

Task Graph is the universal workflow engine in this plan; in the code it is not yet. **Flow agents do
not use it at all.** Verified on a live run (`4d25c954-…`, Demo Flow Agent, Completed): 9
`AIAgentRunStep` rows and **zero `Task` rows — `__mj.Task` has never had a row.**
`@memberjunction/ai-agents` has no dependency on `@memberjunction/task-graph`, so the flow path
cannot reach the dispatcher even in principle; the `GetTaskGraphSubmitter()` seam it does have is
bound to the **loop** agent's `tasks` decomposition.

The consequence is not only bookkeeping. Flow's `traversalMode` defaults to `'sequential'` while a
`TaskGraphSpec` graph *always* runs parallel — in that verified run, five independent searches summed
2332 ms inside a 2469 ms `ForEach`, serially. Two engines, two execution semantics.

The companion plan closes it: a pure `FlowGraphCompiler` (`AIAgentStep` + `AIAgentStepPath` →
`TaskGraphSpec`) feeding the existing submitter seam, with `traversalMode` as a **compiler input** so
existing flows keep their exact order. It also proposes replacing the node's flat
`agentName`/`actionName`/`assignToUser` fields with a discriminated `kind` + typed `configuration`
bag — into which the already-universal `ForEachOperation`/`WhileOperation` contracts drop unchanged.

**Directed:** full cutover — all flows move and the in-run executor is deleted in the same change;
`onError: 'continue'` becomes a supported dispatcher concept. Decisions still open are marked ⬥ in
that document.

### Track D — The trigger layer (WHEN)

1. **Record Process OnChange reconciliation** — the schema (`OnChangeEnabled`/`OnChangeInvocationType`/`OnChangeFilter`) is built and the blocker recorded in the RSP plan (§18.5) is stale: entity actions now fire from the save pipeline (`GenericDatabaseProvider.ts:552-586`). Remaining: `MJRecordProcessEntityServer` reconciles an owned Entity Action binding (the same pattern it already uses for its Scheduled Job), plus the self-trigger guard and per-record coalescing from RSP plan §12. This closes the trigger triangle: every trigger type reaches every work type.
2. **Trigger vocabulary normalization** — one enum family across `ProcessRun.TriggeredBy`, Scheduled Jobs, Entity Action invocation types, and routine types: `OnChange | Schedule | OnDemand | External`.
3. **One-shot scheduling** — "run once at T" on Scheduled Jobs (today it needs a cron hack + manual disable); also makes deferred workflow steps expressible.
4. **Scheduler operational gaps** — real notifications (`NotificationManager` is a "Would send…" stub while `NotificationEngine` sits one package away), a working Execute-Now path (the current action creates a run row nothing picks up), and a missed-run policy field.
5. **Future (explicitly deferred):** a metadata-driven inbound-webhook trigger (`ServerExtensionsCore` is the chassis) and inbound email/SMS (the Communication provider subscription primitive is fully built with zero consumers).

### Track E — WorkflowSpec (the stored definition)

One spec object binding WHAT to WHEN, following the proven `AgentSpec`/`AgentSpecSync` pattern:

```ts
interface WorkflowSpec {
  name: string; description?: string; status: 'Active' | 'Paused' | 'Draft';
  graph: TaskGraphSpec;                    // the WHAT — #3456 D16, verbatim; 1-node graphs constant-fold
  triggers: Array<                         // the WHEN
    | { type: 'EntityEvent'; entityName: string; invocationType: string;
        filter?: string; scopeEntityName?: string; scopeRecordID?: string }
    | { type: 'Schedule'; cron: string; timezone?: string }
    | { type: 'OnDemand' }>;
  notifications?: { condition: 'Always' | 'OnFailure' | 'OnChange'; recipients: string[] };
}
```

- **No new run/graph storage** — `WorkflowSpecSync` *reconciles* the existing substrates (an Entity Action binding, a Scheduled Job, routine rows) exactly the way `MJRecordProcessEntityServer.Save()` already reconciles its owned Scheduled Job. The spec is the authoring surface, not a parallel engine.
- One artifact serves every consumer: the MCP tool (external agents), an Action wrapping it (internal agents — closing the "agents cannot schedule anything" hole: today `Create Scheduled Job` cannot even set `Configuration`), the human wizard's backing model, and the `mj sync` file for the governed iterate-via-MCP / promote-via-Git path (`guides/AGENT_AUTHORING_VIA_MCP_GUIDE.md` §5).
- Driver `Configuration` schemas move from TypeScript-only (`packages/Scheduling/base-types`) into discoverable metadata so an LLM can author them.
- Mind Publish-No-Break: this shape freezes additive once OpenApps publish against it — reviewed before built.

### Track F — Front doors and observability

1. **Human**: an **Automations** surface generalizing the User Routines pattern (≤3 decisions: *When? What? Who should know?*), compiling to the right substrate; personal vs. system as a scope choice. "Automate this" affordances on the Action, Agent (Workflow), and Record Process forms. The unbuilt Screen 4 of `plans/record-process-authoring-flow.html` is the design seed. Terminology per #3456 D18: users see **Workflows**.
2. **Workflow (Flow) visualization upgrade** — **now owned by the engine plan as Phase 5 (D19)**: the `ng-flow-editor` canvas upgraded in place to express joins/`traversalMode`/concurrency/human tasks, a runtime overlay so one visualizer serves both provenances (converging the flow canvas and the Tasks Gantt), a first-class "Create Workflow" entry point, and the D18 terminology sweep. Track F retains only what Phase 5 scopes out: the Automations wizard, the run inbox, and agent-facing tools.
3. **Agent**: the WorkflowSpec tool (Track E) plus a **draft-then-confirm** tool shape (dry-run and Plan Mode are the shipped precedents) so the in-app assistant can *set up* a workflow, not just navigate to the page. Expose Remote Operations to MCP.
4. **One run inbox** — a unified activity feed over `MJ: Scheduled Job Runs`, `MJ: AI Agent Runs`, `MJ: Action Execution Logs`, `MJ: Process Runs`, `MJ: User Routine Runs`, and parent `MJ: Tasks` rows (the workflow-instance record for runtime graphs). The join seams exist: `ScheduledJobType.DomainRunEntity` and the `ActionExecutionLog.TargetRecordID` ↔ `RecordChange.RecordID` format alignment.
5. **"What fires when this record changes"** — the scope-record panel from #3408 runbook step 11, generalized: one place listing every Entity Action binding, process, and routine attached to an entity/record.

---

## 3. Sequencing

```
A (correctness) ── independent, start anytime
C (#3456): Phase 0 (legacy drop = Track B) ──► Phases 1–4 (Track R parallel)
                                          ──► Phase 5 (Workflow UX, D19)
        C ──► D (triggers) ──► E (WorkflowSpec) ──► F (Automations wizard,
                                   run inbox, agent-facing tools)
                                   (D2/D3 of Track D can interleave with C)
```

Definition of done for the program, stated as the user experience: *a human or an agent sets up "every Monday at 8, summarize last week's deals and notify the sales channel — and also run it whenever a Deal hits Closed Won" in under five minutes, watches it in one run inbox, and can hand the underlying workflow to the Agent Manager to evolve.*

---

## 4. Reference — where the full study lives

The 12-subsystem recon reports and the verified critique (file/line evidence for every claim above) were produced in the 2026-08-05 study session. Key verified claims are inlined above with their code locations so this document stands alone.
