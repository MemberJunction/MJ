---
'@memberjunction/ai-core-plus': patch
'@memberjunction/task-graph': patch
'@memberjunction/ng-core-entity-forms': minor
---

Two defects a dispatched workflow hit end to end — one that killed the run, one that misreported it.

**The invocation envelope could not be written down.** R3-3 carried `ExecuteAgentParams.context` into the parent task's `InputPayload` verbatim. That parameter is documented as possibly a class instance holding "external service credentials or connection information", so the first real agent run whose context held a socket died at submit time with `Converting circular structure to JSON --> starting at object with constructor 'Socket'` — before any step executed. Had it serialized instead, those credentials would have been written to a row that outlives the run. `SanitizeInvocationEnvelope` now reduces the envelope to what is safe to persist at the durable boundary, so every submission path is covered: JSON data survives (primitives, arrays, plain objects, `Date`, anything with `toJSON`), while class instances, functions, sockets and cycles are refused **and reported by path** — a value that silently vanished is a condition reading absent-data and taking a branch nobody can explain later.

**Three agents referenced Font Awesome Pro glyphs** (`fa-chart-diagram`, `fa-shield-check`, `fa-chart-mixed`), which render as nothing in the free 6.5.2 build Explorer loads — an empty icon square rather than a missing-icon indicator, since an absent glyph is silently invisible. Swapped for free equivalents in `metadata/agents`. Betty and Skip keep their `mj-icon-*` classes, which are intentional custom styling.

**A dispatched workflow reported itself finished while it was still running.** The run-tree query joins the submit step to the graph it produced, so one workflow arrives as two rows whose statuses disagree: the step's describes the *submission* (`Completed` in ~300ms, correctly), while its title names the *graph*, which is still going. The result was "Task Graph: X — Completed" sitting above steps that had not run, contradicting the page header's own "PAUSED / Workflow still running". The timeline now renders the pair as one row that keeps the step's identity — so selection and deep links still resolve — and takes its status and timing from the graph, with submit latency preserved in the subtitle. A failed or in-flight submission keeps its own row, since there is then no graph to inherit from and the submission is the whole story; an unrecognized shape declines to collapse rather than guessing.
