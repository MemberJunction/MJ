# Idea 1: Universal Approval Gates for Actions, Agents & Workflows

**Week of 2026-08-14 · Creative exploration · Framework-level (core, not a vertical app)**

## The problem, framed for the world, not the codebase

Every organization running on MJ eventually automates something consequential: an Action that
issues a refund, an AI Agent that drafts and sends a dues-renewal email to 40,000 members, a
workflow step that cancels a membership, an integration sync that overwrites donor records. Once
that automation exists, someone always asks the same question a beat too late: *"wait, who
approved this running?"* Today the only honest answer in MJ is "nobody had to — it just ran."

This is not a hypothetical. The 2026 Gartner AI agent Hype Cycle finds barely 17% of
organizations have deployed agents in production yet, but of the ones that have, the dominant
real-world failure mode reported back is **"tokenmaxxing"** — an agent loop running further and
faster than any human intended, burning budget or taking actions nobody signed off on, discovered
only after the fact. Low-code platforms have converged hard on the fix: n8n's 2026 "Agentic AI
Design Patterns" guidance treats a manual approval gate at high-stakes decision points as a
first-class node, not an afterthought; LangGraph shipped native human-in-the-loop checkpointing as
core infrastructure in its 0.4 release; Budibase ships drag-and-drop approval flows as a headline
primitive. For a small nonprofit's two-person ops team, the stakes are lower in dollar terms but
higher in trust terms: an AI agent that auto-emails every lapsed donor with the wrong tone, or an
automation that silently waives a dues balance, costs relationships that took years to build.

## What already exists (and why this doesn't duplicate it)

- **`Action.CodeApprovalStatus`** (`Approved` / `Pending` / `Rejected`, referenced throughout
  `packages/Actions/Runtime`, e.g. `RuntimeActionExecutor.ts`) exists — but it gates exactly one
  thing: whether **AI-generated Action *code*** is allowed to compile and register at all
  (`plans/runtime-actions.md`). It is a code-review gate, evaluated once at authoring time. It has
  no concept of gating a specific *run* of an already-approved action based on that run's
  parameters (e.g., "this action is approved to exist, but a $6,000 refund invocation of it still
  needs a human to click yes").
- **`TaskGraph`** (`packages/TaskGraph/src/TaskGraphDispatcher.ts`,
  `TaskGraphOperations.ts`) already has a step/node execution model with dependency resolution and
  a `TaskGraphContinuationDeliverer` for resuming a paused graph. This proposal adds one new node
  *outcome* (`AwaitingApproval`) to that existing pause/resume vocabulary — it does not invent a
  new execution engine.
- **Decision Provenance** (proposed 2026-08-07, unshipped) captures *why* a decision was made,
  after the fact, as a narrative annotation. Approval Gates are a different moment in the
  lifecycle: a **before-the-fact control** that blocks execution until a human (or a policy)
  signs off. A resolved Approval Gate is exactly the kind of structured event a later Decision
  Record or Handoff Brief would want to cite — complementary, not overlapping, and this proposal
  does not require idea 2 to ship first.
- **Unified Permissions** (in flight, `plans/unified-permissions-architecture.md`) governs *can
  this identity do X at all*. Approval Gates govern a narrower question: *should this specific
  invocation, with these specific parameters, proceed right now* — a runtime policy decision, not
  an identity/role check. The two compose: only someone with permission to approve a given gate
  type can act on it.

## Proposed architecture

### New entities (`__mj` core schema)

| Entity | Purpose |
|---|---|
| `MJ: Approval Gate Definitions` | Declares a reusable gate: Name, AppliesToType (`Action` / `AIAgent` / `TaskGraphStep`), AppliesToID (nullable FK — null means "any of this type"), TriggerCondition (an MJ Filter/expression evaluated against the run's input parameters — e.g. `Amount > 500`), RequiredApproverRoleID or RequiredApproverUserID, TimeoutBehavior (`AutoReject` / `AutoApprove` / `EscalateTo`), TimeoutMinutes |
| `MJ: Approval Requests` | One instance per gated run: GateDefinitionID, EntityID/RecordID or RunID of the thing being gated, RequestedByUserID (or `System` for agent-initiated), Status (`Pending`/`Approved`/`Rejected`/`Expired`/`AutoApproved`), RequestedParametersJSON (a snapshot — what exactly is being approved), DecidedByUserID, DecidedAt, DecisionNote |

Both entities are generic — `AppliesToType` + polymorphic `AppliesToID`/`RunID` means one gate
mechanism covers Actions, Agent tool-calls, and TaskGraph steps without a parallel table per
subsystem, the same "one generic table, CompositeKey-addressed" pattern Record Changes and
Decision Records already use.

### `ApprovalGateEngine` (new package `packages/Core/ApprovalGates`, `BaseEngine`-derived like
every other MJ engine, e.g. `packages/MJCore/src/generic/baseEngine.ts`)

- `Evaluate(gateContext)`: given an about-to-run Action/Agent-tool-call/TaskGraph-step and its
  resolved parameters, checks all active `Approval Gate Definitions` whose `AppliesToType` +
  `TriggerCondition` match. Returns `Proceed` or `Pause(ApprovalRequestID)`.
  - `RuntimeActionExecutor` calls `Evaluate()` immediately before dispatch, and on `Pause`,
    persists its pending invocation and returns to the caller in a `AwaitingApproval` state — the
    same shape TaskGraph already uses for `Pause(ContinuationID)` via
    `TaskGraphContinuationDeliverer`, so TaskGraph steps get gating for free by wrapping the same
    call.
  - The Agent framework's tool-execution loop calls `Evaluate()` before invoking any tool
    classified as a side-effecting Action (reusing Action metadata's existing
    read/write classification) — an agent that wants to send 40,000 emails pauses mid-loop exactly
    once, at the send step, not after the fact.
- `Resolve(approvalRequestID, decision, note)`: records the decision and, on `Approved`, re-invokes
  the original dispatch path with the *snapshotted* parameters (never re-evaluating live input —
  what was approved is exactly what runs, closing the classic TOCTOU gap).
- Timeout sweep runs on the existing `ScheduledJobEngine` cadence (same substrate query/entity
  materialization and idea 1 from last week both reuse — no new scheduler).

### UI (Angular, L1/L2 per the UI layering guide)

- **Approval Center** — a new inbox-style Explorer dashboard (30th dashboard, `scaffold-mj-dashboard`
  pattern) showing every pending `Approval Request` across Actions/Agents/Workflows the current
  user can approve, with the snapshotted parameters rendered human-readably (reusing each Action's
  existing parameter-schema metadata to label fields, not a raw JSON dump), and one-click
  Approve/Reject with a required note on reject.
- **Inline gate badge** — wherever a run is already visualized (Action run history, Agent run
  timeline, TaskGraph step graph), a small "Awaiting Approval" chip links straight to the Approval
  Center entry, so approval status is visible in-context, not only in a separate inbox.
- **Gate authoring** lives under **Admin → Actions** / **Admin → AI Agents** as a new tab
  ("Approval Rules"), parallel to how permissions are already configured per-entity today — a
  business user (not just a developer) can say "any refund action over $500 needs my sign-off"
  without touching code.

### Why this belongs in core, not an app

Nothing above is nonprofit- or membership-specific. A healthcare network gates a bulk-message
Action the same way a university gates a financial-aid adjustment; the generic mechanism is
"pause a parameterized invocation of *any* Action/Agent-tool/Workflow-step until a policy or
human says go," and only the specific gate definitions (which action, what threshold, who
approves) are domain configuration — exactly MJ's "define your policy in metadata, the engine
enforces it" philosophy, the same shape Unified Permissions and Row-Level Security already use.

## Phased rollout

1. **Phase 1** — `Approval Gate Definitions` + `Approval Requests` entities, `ApprovalGateEngine`
   wired into `RuntimeActionExecutor` only (the narrowest, highest-value integration point —
   financial/destructive Actions), Approval Center dashboard (list + approve/reject).
2. **Phase 2** — TaskGraph step integration via the existing pause/resume continuation mechanism,
   inline gate badges across run-history UIs.
3. **Phase 3** — Agent tool-call integration (pausing mid-agent-loop before a gated tool
   invocation), escalation chains (`EscalateTo` on timeout), and a "simulate this gate" preview in
   the authoring UI so an admin can test a `TriggerCondition` against recent historical runs before
   turning it on.

## Open questions

- Should a rejected gate re-queue for a different approver, or terminate the run outright? Leaning
  toward configurable per-gate (`OnRejectBehavior`), deferred to Phase 1 detailed design.
- Agent mid-loop pausing (Phase 3) needs the agent's execution state to be resumable exactly where
  it left off — this should reuse whatever checkpointing the Agent framework already has for crash
  recovery rather than inventing a second state-serialization format; flagged for architecture
  review before Phase 3 starts.

## Mockup

See [`mockups/approval-center.html`](./mockups/approval-center.html) — the Approval Center inbox
showing pending gates across an Action, an AI Agent tool-call, and a TaskGraph step, plus the
gate-authoring panel. Screenshot:
[`screenshots/idea-1-approval-center.png`](./screenshots/idea-1-approval-center.png).
