# Idea 3: Operation Safety Net — Undo for Bulk & Agent-Driven Changes

**Week of 2026-08-29 · Creative exploration · Framework-level (core, not a vertical app)**

## The problem, framed for the world, not the codebase

The people most likely to make a costly bulk-editing mistake in a member or donor database are
exactly the people least equipped to recover from one: a volunteer running their first mail-merge
segment, a new program officer who fat-fingered a saved view before a bulk status update, a
part-time admin who let an AI agent "go clean up the stale records" without fully specifying what
"stale" meant. Every one of them faces the same moment of dread — *did I just wreck 400 donor
records, and is there any way back?* — and in most systems the honest answer is "call support and
hope someone has a backup from last night." That fear is exactly why non-technical staff distrust
powerful bulk tools and AI agents even when those tools would save them hours: the cost of a mistake
feels unbounded, so people under-use the capability entirely.

2026's enterprise AI-safety literature is unusually direct about this exact gap. The emerging
consensus is that "every consequential agent action should be undoable where technically feasible,"
via an action log with per-action undo — and, critically, that a rollback plan which just says "undo
the action" is not enough once actions are *compound*: a compensating transaction can itself fail,
be partially applied, or create new side effects, so the runtime has to retain what it needs to
compensate *each completed step*, not just the intent of the whole operation. The framing has
shifted from "the best agent is the fastest" to "the best agent is the most controllable" — and
controllability includes being able to cleanly reverse a mistake, not just prevent one in advance.

MJ is in an unusually strong position to close this gap because the hard part — durable, per-record
before/after state — already exists and just shipped. What's missing is the layer above it: knowing
which `RecordChange` rows belong to the *same* compound operation, so "undo my last bulk update" or
"undo what that agent just did" is one action instead of hundreds of manual per-record restores.

## What already exists (and why this doesn't duplicate it)

- **Record Changes — Restore Prior Version** (`plans/record-changes-restore/plan.md`, shipped) gives
  a correct, complete point-in-time restore for **one record**: `RecordChange.FullRecordJSON` is a
  full post-change snapshot, and the restore flow already has `RestoreContext`/`SetRestoreContext`
  plumbing on `BaseEntity` plus a `RestorePreviewPanelComponent`. This proposal is explicitly the
  **multi-record generalization of that exact capability** — it adds a grouping layer above
  `RecordChange` and reuses its restore machinery wholesale. It does not re-implement diffing,
  snapshotting, or the single-record restore UI.
- **`TransactionGroup`** (client-side) and direct DB transactions (server-side), documented in
  `plans/transaction-group-migration.md`, give **atomicity for one request** — either all the writes
  in a batch commit or none do. That solves "did the write half-fail," a different problem from
  "the write fully succeeded, and now — a day later — we need to reverse it." This proposal is the
  durable, queryable, *after-the-fact* undo layer; TransactionGroup is the in-flight atomicity layer.
  They compose: a TransactionGroup submission is exactly the kind of compound write this proposal
  tags as one Operation.
- **Universal Approval Gates** (2026-08-14 idea 1, open PR #4009, unmerged) is the *preventive* half
  of agent/action safety — pause a risky action **before** it runs and require sign-off. This
  proposal is the *recovery* half — cleanly reverse a compound action **after** it ran and turned
  out to be wrong. Neither substitutes for the other: an approval gate only helps for the risks
  someone thought to configure a rule for in advance; an undo capability helps for the ones nobody
  saw coming. This proposal introduces no dependency on #4009 landing first, and does not touch its
  entities.
- **AI Agent Runs / Agent Run Steps** already log what an agent did and in what order. This proposal
  does not change agent execution logging — it adds one more piece of context (an `OperationID`) to
  the `RecordChange` rows an agent's tool calls produce, so those rows can be grouped and undone
  together without altering how agent runs are recorded today.

## Proposed architecture

### New entities (`__mj` core schema)

| Entity | Purpose |
|---|---|
| `MJ: Operations` | A generic "unit of work" grouping: `Type` (`BulkUpdate` / `AgentRun` / `TaskGraphRun` / `Workflow` / `Import` / `MetadataSyncPush`), `InitiatedByUserID` (nullable), `InitiatedByAgentRunID` (nullable FK), `Description`, `StartedAt`, `CompletedAt`, `RecordCount`, `Status`, `UndoStatus` (`Available` / `Expired` / `Undone` / `PartiallyUndone` / `NotUndoable`), `UndoWindowExpiresAt` |
| `MJ: Operation Record Changes` | A join row: `OperationID` + `RecordChangeID` (FK to the existing `RecordChange` table — **no duplication** of change data, just membership) |

Two small tables. All the actual before/after state this feature needs already exists in
`RecordChange.FullRecordJSON`; these tables answer one question the existing schema can't:
*which changes happened together, as one thing a person might want to undo as one thing.*

### `OperationLedgerEngine` (new package, `packages/Core/OperationLedger`, `Base` + `Engine` split)

- `BeginOperation(type, description)` / `EndOperation(operationID)` — brackets any code path that
  performs a compound Save/Delete sequence. Inside the bracket, every `RecordChange` row the active
  provider writes is tagged with the open `OperationID` — implemented as a thin extension of the
  same restore-context plumbing (`RestoreContext`/`SetRestoreContext`) `BaseEntity` already carries
  for single-record restore, so no new interception point is invented.
- Call sites to bracket, each already a natural "compound write" boundary in the codebase:
  a client `TransactionGroup.Submit()`, a bulk `Action` from `CoreActions` (`update-record.action.ts`
  et al. operating across a record set via the existing Record Set Processing substrate), an AI
  Agent Run's tool-call sequence, and a TaskGraph run's step execution.
- `UndoOperation(operationID)` — walks every `Operation Record Changes` row for that operation, and
  for each restores the record to its *pre-operation* state (the `FullRecordJSON` of the
  `RecordChange` immediately before the operation's first touch of that record), using the existing
  restore path from `record-changes-restore` unchanged. Per the 2026 literature's explicit warning
  that a compensating action can itself fail, **`UndoOperation` never claims blanket success**: it
  restores record-by-record, records a per-record outcome, and sets `UndoStatus = PartiallyUndone`
  with the specific failures listed whenever any single restore fails — never a silent "undo
  succeeded" that isn't true.
- **Explicit non-goal**: irreversible side effects — an email already sent, a webhook already fired,
  a payment already charged, an external system already synced — are not magically undone. Any
  `RecordChange` in the operation that has no valid "before" state (a `Create`, by definition) is
  listed as "Not Undoable — record will be deleted" rather than silently skipped, and any action the
  ledger knows is a side effect (flagged on the `Action`/`Agent` metadata, opt-in) shows as
  "Not Undoable — see below" in the undo preview, so the user sees the truth before confirming.
- **Undo window**: `UndoWindowExpiresAt` is set per `Operation.Type` (e.g., 24h for a manual bulk
  edit, until conversation archival for an agent run) and enforced by a new
  `OperationExpiryScheduledJobDriver` in `packages/Scheduling/engine/src/drivers/`, following the
  exact same driver interface as the five existing drivers there — a sixth driver, not a new
  scheduling mechanism.

### UI (Angular, L1/L2 per the UI layering guide)

- **"Undo" toast** — after any bracketed bulk action completes, a dismissible toast with an "Undo"
  link, the same pattern as a mail client's send-undo, for the common case of catching a mistake in
  the first few seconds.
- **Operations & Safety Net panel** (`packages/Angular/Generic/operations-ledger`, embeddable in
  Explorer's admin surface and, for an agent's own operations, inside the Conversations/Agent Run
  detail view) — a reverse-chronological feed of compound operations (who or which agent, what kind,
  how many records, when), each with an "Undo" action that opens a preview: what would be restored,
  what can't be undone and why, before the user confirms.
- The undo preview panel deliberately reuses `RestorePreviewPanelComponent`'s two-mode
  (field-level opt-out, reason text) pattern from the shipped single-record restore work, extended
  to operate over a record set instead of one record — visual and interaction consistency with a
  capability staff have already learned.

### Why this belongs in core, not an app

Every organization built on MJ runs bulk operations and, increasingly, AI agents that touch many
records at once — a university registrar batch-updating enrollment status, a healthcare network's
agent triaging a queue of cases, an association's membership team running a dues-adjustment segment.
The mechanism (group changes into an undoable unit, restore via already-existing snapshot data,
report partial failure honestly) is completely domain-agnostic. Only which operation types an app
chooses to bracket, and how long an undo window makes sense, are per-deployment configuration.

## Phased rollout

1. **Phase 1** — `Operations` + `Operation Record Changes` entities, `OperationLedgerEngine` bracket
   API, wired into `TransactionGroup.Submit()` and bulk `CoreActions` record-mutation actions (the
   two highest-volume, lowest-risk sources of compound human-initiated writes). Undo toast + basic
   Operations feed, no AI-agent bracketing yet.
2. **Phase 2** — Bracket AI Agent Run tool-call sequences and TaskGraph step execution.
   `OperationExpiryScheduledJobDriver` for undo-window enforcement. Full Operations & Safety Net
   panel with the extended restore-preview UI.
3. **Phase 3** — Side-effect awareness: an opt-in `Action`/`Agent` metadata flag ("this performs an
   irreversible external side effect") so the undo preview can name specifically which steps in a
   mixed operation are and aren't reversible, rather than treating every non-database step as an
   undifferentiated caveat.

## Open questions

- Should `UndoOperation` itself create a *new* Operation (an "undo of Operation X") so that an undo
  can itself be undone (a "redo")? Leaning yes — it costs nothing extra given the ledger already
  exists, and it directly matches the psychological-safety goal: nobody should fear pressing Undo
  either.
- Where an operation's records span entities with different `TrackRecordChanges` settings, some
  records in a compound operation may have no `RecordChange` row to restore from at all. The undo
  preview must surface those as "Not Undoable — change tracking disabled for this entity" rather
  than silently omitting them — flagged as a Phase 1 requirement, not deferred.

## Mockup

See [`mockups/operation-safety-net.html`](./mockups/operation-safety-net.html) — the Operations &
Safety Net panel showing the undo toast, the operations feed, and the undo preview for a compound
agent-driven update, including the "not undoable" callouts. Screenshot:
[`screenshots/idea-3-operation-safety-net.png`](./screenshots/idea-3-operation-safety-net.png).
