# Shell Decisions — Conversations Next-Gen

> The shell-level decision log. Same discipline as hub-prototype/DESIGN-NOTES.md ("positions the
> prototype takes"), promoted one level up: these are the decisions about what the app IS at the
> navigation/layout level. Drift from a locked decision is a decision, not an accident.
>
> Source: the five Claude Design concepts (fresh-brief/MJ Chat Concepts.html, 2026-07-15) read as
> answers to four separate questions, not five competing apps. Ratified with Matt 2026-07-15.
>
> **Door types**: a *two-way door* can be reversed cheaply if it proves wrong — decide by default
> and move on. A *one-way door* builds habits, schema, or product identity — gets an Amith agenda
> slot before it's load-bearing.

## The composed shell (one sentence)

Open the app → **Front Door** · open a project → its **Project Room** · open a conversation →
a **Quiet Desk** thread · while work runs → the **Companion Rail** slides in · when a deliverable
is open → **Studio Split**.

## Decisions

| # | Decision | Rationale | Door | Status |
|---|---|---|---|---|
| D-S1 | **Thread machinery: quiet meta line at rest; Companion Rail as an earned state.** Runs, cost, and memory reads live in one quiet meta line under each agent turn (Concept 1). The right rail (Concept 2) is not permanent chrome: it slides in while a run/task graph is live or on explicit demand, and collapses back. | Tenet 1 (complexity earned by usage) rules out a permanent rail; tenet 3 (legibility) is satisfied at rest by the meta line. The rail's "Working now" card genuinely beats a meta line *during* live work — so it appears exactly then. This is progressive disclosure as designed, not a compromise. | Two-way (presentation; both pieces exist regardless) | **Locked** 2026-07-15 |
| D-S2 | **Front Door is the app-open landing** (Concept 3): big composer up top, then exactly three earned sections — continue where you left off · what needs you · what ran. | Only concept that answers the "Return" job (re-orient in seconds after a week away); nothing in the hub track covers workspace-level re-entry. The composer-first layout keeps "ask a quick question" zero-friction without entering any project. | One-way (landing surface = product identity + user habit) | **Locked** 2026-07-15 · Amith ratification pending |
| D-S3 | **Studio Split is the artifact-open state of a thread** (Concept 4), not a competing shell. When a conversation has a live artifact, chat narrows to a control strip and the artifact rides in a working pane with versions + lenses (Preview / Requirements / Code / Links). | This is how artifacts read as living deliverables (differentiator #2 in BRIEF.md) rather than attachments. As a state, it composes with D-S1 in either mode. | Two-way (a state the thread enters/exits) | **Locked** 2026-07-15 |
| D-S4 | **Project Room is the answer to "what does opening a project show" — NOT the app landing.** Adopt Concept 5's room design (orientation first: what changed · what needs you; then tabs for this project's chats, memory, outputs; members in the header). Explicitly REJECT its tagline "projects are the front door" — that slot belongs to D-S2. | Resolves SYSTEM-MODEL OPEN seam #1 (the biggest one). Front Door and Project Room share one grammar (changed / needs-you / ran) at two scopes — workspace-wide vs one project — so they interlock instead of competing. The room is the hub prototype already in ratification (13 positions, parity audit); the fresh concept validated it, it did not replace it. | Room presentation: two-way. Project = collaboration boundary underneath it: one-way (already on the hub track's Amith agenda) | **Locked** 2026-07-15 |

## Routing (follows from the above)

- App open → Front Door (workspace scope).
- Sidebar → project → that project's Room (project scope).
- Sidebar / Room chats tab / Front Door "continue" → conversation thread (Quiet Desk).
- Live run or task graph in the open thread → Companion Rail in; idle → rail out.
- Artifact opened → Studio Split; artifact closed → full-width thread.
- Notifications and deep links land on the specific thread or Room, never generically on Front Door.
- Quick/ungrouped/temporary chats start from Front Door's composer and never require a project.

## Process rules (the anti-churn contract)

1. **Judge against the brief, not against alternatives.** A surface is done when it passes the
   placement rule (BRIEF tenet 2) and the seven states (tenet 4). "Does another concept feel
   better?" is not an exit condition and doesn't get asked once a decision is locked.
2. **New shell ideas go to the parking lot below**, one line each. A locked decision reopens only
   on new evidence (user testing, a parity conflict, an Amith veto), recorded here as a dated edit.
3. **One prototype from here.** The fresh-brief track folds back into hub-prototype/ as the shell
   around the hub. No second parallel design artifact of the same product.
4. **Two-way doors are decided by default**; only one-way doors wait on ratification.

## Parking lot (v2 candidates — one line each, no reopening)

- (empty)

## Open items carried from elsewhere (not shell decisions, tracked where they live)

- Nesting semantics — hub track, deliberately undrawn until projects-hierarchy questions ratified.
- Projects ↔ Collections relationship — hub DESIGN-NOTES boundary #1.
- Plan-mode toggle semantics (per-request vs sticky) — SYSTEM-MODEL seam #5.
- Threads revive-or-delete — SYSTEM-MODEL seam #6.
- Search scope from inside a project — omnibar lane (#3042).
