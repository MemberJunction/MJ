---
"@memberjunction/ng-task-graph-editor": minor
"@memberjunction/ng-explorer-core": patch
---

Phase 5 continued — the properties panel, the runtime-overlay source, and the Phase 0 carry-over.

**`TaskGraphPropertiesPanelComponent`.** Edits what a step *does*, while the canvas stays about what connects to what. Split into its own component rather than welded into the canvas for a concrete reason: a host embedding the read-only viewer in a chat card or a run-history pane wants the graph *without* a form beside it, and a panel built into the canvas cannot be declined.

It emits intent rather than mutating. The canvas component owns the spec, so every edit here leaves as a request the parent applies through the same `Before*`/`After*` path a drag or a delete takes — two write paths into one spec would be two places for the veto contract to be wrong. Its `Draft` is a working copy for the same reason: editing the live node would make every keystroke an unvetoable mutation, and Cancel would be impossible by construction.

Assignment is derived from the absence of an agent rather than stored separately, because the spec's own rule is that a task has exactly one assignee — a separate boolean could disagree with `agentName`, and the validator would then reject a graph the form said was fine. Cross-user assignment is stated as unavailable rather than offered, since submission rejects it until #3524 lands.

Edge conditions are edited where the step is, and `SetDependencyCondition` is implemented as remove-then-add so it travels the same event path as any other edge change.

**`task-graph-runtime-source`** — pure mappers turning live rows into the canvas's overlay. Deliberately *not* a subscription: a `widgets`-layer component cannot know which provider it is on, whose rows it may read, or when the host wants to start and stop watching. The host owns the subscription and passes rows in. That split is also what lets one renderer serve both provenances — a durable graph watched through `MJ: Tasks`, an in-run flow through `AIAgentRunStep`, same shape by the time it reaches the canvas.

Correlation is **by name with an ID fallback**, and the ordering is deliberate: a submitted graph's Task rows carry database IDs while the spec carries producer-assigned `tempId`s, and the two never match because the producer could not know real IDs at authoring time. A row matching nothing is **skipped rather than guessed at** — the wrong node lighting up green is worse than one staying grey, because the first is believed. An unrecognized status degrades to `Pending` rather than throwing inside a render path.

**Phase 0 carry-over.** Removed the two dead `'reports'` branches in `explorer-core`'s `shell.component.ts` — the `appReportMatch` tab-finder and the `case 'reports':` URL builder. Both have been unreachable since Phase 0 dropped the `Reports` resource type; they survived that sweep because Explorer lowercases resource-type names, so a grep for the capitalized metadata name missed them.

24 new tests (97 in the package).
