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

## Team-review decisions — Amith feedback, 2026-07-16

Direction confirmed ("heading down the right path"; explicitly liked the Front Door overview —
treat D-S2's pending ratification as endorsed, formal close-out when the umbrella review wraps).
New decisions from the same feedback:

| # | Decision | Rationale | Door | Status |
|---|---|---|---|---|
| D-S5 | **"Artifacts", not "Outputs".** Rename the Room tab and any "outputs" copy. | Artifacts are inputs AND outputs — "Outputs" misdescribes the concept. | Two-way (naming) | **Locked** 2026-07-16 (Amith) |
| D-S6 | **Tasks lose all top-level real estate.** Remove the W1 Tasks surface and the sidebar Tasks nav item. MJ-core tasking = agent operation-graph creation, now lower emphasis; user-facing tasking is the BizApps-Tasks OpenApp's job. Live-run visibility stays in-thread (Companion Rail) and in Front Door "what ran". OPEN sub-question: does the Room's Workflows tab survive at reduced emphasis or fold into Overview's activity feed? | Avoid depicting an agent-internal mechanism as a user-facing tasking product; simplifies the app. | Two-way (surfaces can return) | **Locked** 2026-07-16 (Amith); Workflows-tab fate to resolve in v4 design |
| D-S7 | **Projects are VISIBLE by default** — one quiet nav item + a teaching empty state ("Group related chats, memory, and deliverables · Create your first project"). The Settings toggle exists as opt-OUT ("Show Projects", default ON), plus an optional org-level default for deployments that want it off. The two organic escalation moments ship as ONBOARDING: (a) added-to-a-project by a teammate (section appears with a one-time "new" cue for opted-out users), (b) agent suggests converting a chat into a project via an in-chat button. Post-launch: instrument project-creation rate and first-run drop-off; revisit if visible-default shows real overwhelm. | Hidden organizing models don't get adopted and the cost compounds (flat history accumulates); the sidebar clutter that motivated hiding was an Option A problem the composed shell already fixed; per-user appearing/disappearing nav creates mixed states org-wide, hurting screen-share/training/support; gating projects would undercut the P1.6+ roadmap built on them. History: Amith proposed default-OFF 2026-07-16; Matt counter-proposed visible-by-default same day; **Amith ratified the counter ("I like that, good idea, let's build it!") 2026-07-16.** | One-way-ish (product identity for new users) | **Locked** 2026-07-16 — ratified by Amith |
| D-S8 | **A Conversations-app Settings surface** (gear off the left nav, slide-in panel) hosting the projects toggle and similar app-level controls. | Gives per-user gates like D-S7 a legible home. | Two-way | **Locked** 2026-07-16 (Amith); design in v4 |
| D-S9 | **Per-user read-status substrate** (`ConversationDetailUserReadStatus`-style join table) to power Slack-like last-read markers in threads, unread affordances on rows, and a real "agent completions since you were last here" feed on Front Door. | Amith volunteered the schema; it also converts the audit's FUTURE-tagged "since you left" items from fiction to backed. | Additive schema | **Endorsed** 2026-07-16; needs an owner + migration on the umbrella |

Also noted: Amith is fine with the left-nav-only / no-top-nav direction, with a musing that the
top nav might serve some purpose later — parked, no action now.

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
