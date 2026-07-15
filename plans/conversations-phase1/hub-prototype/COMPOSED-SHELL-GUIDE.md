# Reviewer's Guide — MJ Composed Shell v3

**The mockup:** open `MJ Composed Shellv3.html` in any browser (it's self-contained — give it a
few seconds to unpack). It's one large canvas: **14 full-resolution screens in four rows**.
Scroll freely; each frame is labeled and annotated. This guide is the companion — what you're
looking at, how it relates to the earlier Option A/B/C mockups, what's real vs proposed, and
what feedback is most useful right now.

---

## If you reviewed the earlier Option A / B / C mockups — start here

The three Projects mockups on #2953 (`mockups/projects.html` — A "Project Hub", B "Project as
Workspace", C "Companion Canvas") were the divergent round. The composed shell is what came
after: we broke the options into the *separate questions* they were each answering and composed
one shell from the best answer to each. Nothing was picked wholesale; here's where each option's
ideas landed:

| Earlier option | What survived into the composed shell |
|---|---|
| **A · Project Hub** | The Room (row 2): opening a project lands on an orientation page — what changed, what needs you — with tabs for its chats, memory, outputs, workflows. |
| **B · Project as Workspace** | Its two core instincts. (1) A **default "inbox"**: the Front Door (row 1) is the app-open landing — composer first, then what needs you / continue / what ran. You can work all day from it and never touch a project. (2) **Projects are avoidable, not modal**: nothing forces you into a project lens; quick questions and ungrouped chats are first-class. What we did NOT keep is the far-left rail that switches the whole workspace lens — the Room gives project focus without a global mode switch. |
| **C · Companion Canvas** | Chat-stays-the-hero became the thread's design (row 3): a calm centered column where the machinery lives in one quiet meta line, a **Companion Rail** that slides in only while a run is live, and the artifact working pane (Studio Split) when a deliverable is open. |

**On the sidebar-clutter concern specifically** (raised on the PR — it's a fair hit on Option A):
the composed sidebar is deliberately two paths only — top-level nav (Chats / Projects /
Collections / Tasks / Routines) and a Pinned + Recent Projects section for the fast route.
No counts, no badges (a ratified rule; activity is a quiet dot). The full conversation list with
grouping, filtering, and multi-select moved OUT of the sidebar into a proper **Chats** surface
(W0a, row 4) with a by-project / flat toggle — the "inbox" view, one click away, holding
everything so the sidebar doesn't have to.

**On cross-project artifacts**: that's **Collections** (W2, row 4) — a second tree, deliberately
separate from Projects. The working model: a project is where an artifact is *born* (its Outputs
tab shows origin); a collection is where it's *curated* — cross-project, nestable, shareable.
One artifact can live in both. If a cross-project *conversations* view matters too, say so in
the PR thread — today's answer is the Chats surface's flat mode, and it's open to challenge.

## The 14 frames, one line each

**Row 1 — Front Door (F1).** App-open landing: composer first, then needs-you / continue /
ran-overnight. The return-after-a-week story.

**Row 2 — Project Room (P1–P5).** Overview (orientation: since you left, needs you) ·
Conversations · Memory (the ledger: every note with agent, scope, provenance, edit/forget) ·
Outputs (artifacts born here) · Workflows (live task graph + history).

**Row 3 — The Thread (T1–T3).** At rest (quiet meta line: steps · cost · Inspect run) ·
Work running (Companion Rail slides in, collapses after) · Artifact open (Studio Split: chat
narrows, deliverable gets a working pane with versions + lenses).

**Row 4 — Workspace surfaces (W0a–W3).** Chats (all conversations, grouped/flat) · Projects
(cards, each opens its Room) · Tasks (all graphs, live + history) · Collections (curated
libraries) · Routines (personal scheduled runs).

## How to read what you see

- **If it's on screen and untagged, it's real today.** Every affordance was audited against the
  shipped subsystems (memory, plan mode, routines, permissions, artifacts) and the phase-1
  decision log; anything fictional was redrawn. Full evidence trail:
  `plans/conversations-phase1/COMPOSED-SHELL-AUDIT.md`.
- **Small `FUTURE` tags** mark direction-not-yet-backed: project members/roles, project archive,
  drag-artifact-to-project, Remix/Analyze, the context ring, follow-latest collection pins.
  They're proposals riding along honestly, each needs a ratify-or-strike.
- **Known not-yet-designed** (coming passes, not oversights): all states beyond the happy path
  (new user / sparse / heavy / loading / error / read-only), dark theme, mobile, and the entire
  voice/in-call surface (designed next against the realtime stack).

## What's already decided vs. what's open

**Locked** (see `plans/conversations-phase1/SHELL-DECISIONS.md` for rationale): Front Door as
the landing · Room as what opening a project shows · quiet meta line at rest with the rail as an
earned state · Studio Split as the artifact state · user bubbles + agent avatar rows.

**Open and genuinely up for grabs — this is where feedback moves the design:**
1. Nesting semantics (trees are shipped; roll-up/inheritance/move rules aren't ratified).
2. The FUTURE-tagged items above — keep, cut, or reshape any of them.
3. Cross-project surfaces beyond Collections (the PR comment's "cross-project interface" — what
   else needs one?).
4. Rollout shape: ship whole vs feature-flag Projects per-user (the shell works either way).
5. Anything that feels overwhelming — the bar is a non-technical membership director having a
   calm daily surface with all power reachable. If a frame fails that test for you, that's
   exactly the feedback we want.

## Where to comment

Thread feedback on **PR #2953** (the Phase-1 umbrella) so it lands next to the plan and decision
log. Reference frames by their labels (e.g. "P3 Memory", "W0a Chats") — every frame is addressable.
