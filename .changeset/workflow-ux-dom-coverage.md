---
"@memberjunction/ng-task-graph-editor": patch
"@memberjunction/ng-conversations": patch
---

DOM specs for the three components Phase 5 added, which takes the `packages/Angular/Generic` coverage ratchet from **138 (failing) to 135 (passing)** — better than the state it has been in on `next`.

Each covers only what exists in the rendered template rather than the class, because the graph *logic* is already tested against the pure adapter and the component classes where no TestBed is needed:

- **The validation banner** earns DOM coverage specifically. It is the one place author-time feedback from the engine becomes visible, and a template regression there is silent — the component would still compute `IsValid` correctly while showing the user nothing.
- **The properties panel never writes.** Every control emits a request the parent applies; a regression there would not throw, it would quietly bypass the veto contract.
- **When "Save as Workflow" appears** is the plan card's highest-stakes rule. Offering it while work is still running invites saving a shape that may yet change under a retry or a failure routing down a recovery branch — so the graph a user believed they saved would not be the one that ran.
