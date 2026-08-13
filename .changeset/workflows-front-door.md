---
"@memberjunction/ng-dashboards": minor
"@memberjunction/ng-conversations": minor
"@memberjunction/ng-explorer-core": patch
---

**A Workflows app, and the Create Workflow front door inside it.**

Phase 5 shipped every component this composes — the canvas, the properties panel, the runtime-overlay
source, both Save-as-Workflow surfaces — but not the front door, because the design was not locked.
It is now: `mockups/workflow-ux/front-door-v1.html` carries five ratified answers, and this builds
all three of its screens against them.

**Its own Explorer app, not a tab in AI.** D18 puts *Workflow* in front of end users while *Flow
Agent* survives in metadata and dev docs — filing the surface under "AI" would contradict that at the
navigation level, and D19 exists precisely because the editor is today buried inside a saved agent
record. Scheduling and Routines set the precedent for an AI-adjacent domain getting its own app.

**Three doors**, in the locked order, with "Describe it" pre-selected — the only one that needs no
prior knowledge of the product. Each states *when to pick it*, not just what it does, because that is
the actual question someone has on this screen. Only settled runs are promotable: an in-flight run
may still change shape under a retry or a recovery branch, so the saved workflow would not be the one
that ran. That is enforced three ways — the handler guards, the row leaves the tab order, and
`aria-disabled` is set — because dimming alone leaves a row clickable and keyboard-reachable.

**Save as Workflow now names it inline and offers the editor** (answer ④). The card previously
emitted a save with no name and no way to continue editing, leaving the host to invent both. The name
seeds from the plan's own — making someone invent another is the difference between saving and not
bothering — but once touched it keeps what was typed, including empty. "Open in editor" is secondary
on purpose: making the editor mandatory turns a two-second capture into a task.

**Nothing anywhere asks for a trigger or a schedule.** Saving is capture, not scheduling; a workflow
runs on demand until someone gives it a cadence, and the card says so rather than leaving it to be
discovered.

**D18 is enforced by test.** The vocabulary rule is invisible to a compiler and erodes one label at a
time, so the templates and user-facing copy are asserted to contain no *graph* / *DAG* / *node* /
*Flow Agent* — with a companion assertion that *step* IS present, so the rule cannot be satisfied by
deleting the concept instead of renaming it.

The front door emits a draft rather than persisting anything, because the middle tile promises
"Nothing is saved until you approve it" in so many words, and approval happens on the canvas.
