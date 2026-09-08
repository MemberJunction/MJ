---
"@memberjunction/scheduling-engine": patch
---

Guarantee that a `MJ: User Routine Runs` row reaches a terminal status, and that the dispatcher never reports a status the database does not hold.

Three defects, all of which reported success while the row said otherwise:

1. **`finalizeRunRow` let an optional foreign key cost the run its status.** `AgentRunID` / `PromptRunID` / `ActionExecutionLogID` point at artifacts written fire-and-forget by the action/agent/prompt engines, so the id is valid for a row whose INSERT has not landed yet. When that FK rejected the save, the code logged and carried on: `Status` stayed `Success` in memory and the row stayed `Running` forever. The status is now landed first and the linkage re-attached over a few short escalating waits — losing a link is an observability loss, losing the status is a correctness one.

2. **Bookkeeping that threw after the run row existed left it non-terminal.** `updateRoutineAfterRun` and notification delivery run after `finalizeRunRow`; a throw there escaped to the sweep's per-routine catch, which recorded `Failed` in its in-memory summary and returned, leaving the row `Running`. `executeRoutine` now drives the row to a terminal status on every path.

3. **That new catch read the in-memory status, so it could still report a status that was never written.** `finalizeRunRow` sets `Status = 'Success'` before its first save, so when it exhausts its saves and throws, the catch saw `Success` on an object whose row said `Running` — concluded the outcome was already committed, left the row alone, and returned `Success` to the sweep. It now reads the persisted value (`OldValue`, which `BaseEntity` advances only on a save that lands), so an already-committed outcome is preserved and a still-`Running` row is driven to `Failed`.

The third defect lived exactly at the seam between the fixes for the first two, each of which was tested only in isolation; the suite now covers the composition.
