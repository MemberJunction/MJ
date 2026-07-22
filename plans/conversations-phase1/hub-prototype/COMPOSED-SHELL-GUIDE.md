# Reviewer's Guide — MJ Composed Shell v4

> **2026-07-22 — the living artifact is now the FUNCTIONAL MOCKUP** (`MJ Composed Shell -
> Functional Mockup.html`, same directory): a fully working, clickable walkthrough of
> everything this guide describes, with a state-map jump panel, personas, dark mode, and its
> own embedded changelog / reuse manifest / placement accounts. **Review that.** The v4 canvas
> this guide narrates remains the frozen visual reference behind it. Two reading-rule deltas
> vs this guide: the mockup carries **no FUTURE tags** (⚖11 — it is target-state design of
> record; backed-vs-unbacked tracking lives in CONTINUITY-LEDGER §E), and the artifact pane
> renders the **shipped metadata-driven tab set** (8 tabs for Component artifacts), not the
> canvas's simplified lens strip. P5's fold is ratified (the Room is four tabs; the canvas's
> PROPOSAL badge is historical).

**The canvas:** open `MJ Composed Shellv4.html` in any browser (it's self-contained — give it a
few seconds to unpack). It's one large canvas: **16 full-resolution screens in four rows**.
Scroll freely; each frame is labeled and annotated, and an on-canvas changelog panel (top right)
lists the eight team-review changes that produced v4 from v3. This guide is the companion — what
you're looking at, how it relates to the earlier Option A/B/C mockups, what's real vs proposed,
and what feedback is most useful right now.

---

## If you reviewed the earlier Option A / B / C mockups — start here

The three Projects mockups on #2953 (`mockups/projects.html` — A "Project Hub", B "Project as
Workspace", C "Companion Canvas") were the divergent round. The composed shell is what came
after: we broke the options into the *separate questions* they were each answering and composed
one shell from the best answer to each. Nothing was picked wholesale; here's where each option's
ideas landed:

| Earlier option | What survived into the composed shell |
|---|---|
| **A · Project Hub** | The Room (row 2): opening a project lands on an orientation page — what changed, what needs you — with tabs for its chats, memory, and artifacts. |
| **B · Project as Workspace** | Its two core instincts. (1) A **default "inbox"**: the Front Door (row 1) is the app-open landing — composer first, then what needs you / continue / what ran. You can work all day from it and never touch a project. (2) **Projects are avoidable, not modal**: nothing forces you into a project lens; quick questions and ungrouped chats are first-class, and a per-user "Show Projects" opt-out exists in Settings (S1). What we did NOT keep is the far-left rail that switches the whole workspace lens — the Room gives project focus without a global mode switch. |
| **C · Companion Canvas** | Chat-stays-the-hero became the thread's design (row 3): a calm centered column where the machinery lives in one quiet meta line, a **Companion Rail** that slides in only while a run is live, and the artifact working pane (Studio Split) when a deliverable is open. |

**On the sidebar-clutter concern specifically** (raised on the PR — it's a fair hit on Option A):
the composed sidebar is deliberately two paths only — top-level nav (Chats / Projects /
Collections / Routines, with a Settings gear at the bottom edge) and a Pinned + Recents section
for the fast route. No counts, no badges (a ratified rule; activity is a quiet dot). The full
conversation list with grouping, filtering, and multi-select moved OUT of the sidebar into a
proper **Chats** surface (W0a, row 4) with a by-project / flat toggle — the "inbox" view, one
click away, holding everything so the sidebar doesn't have to. For a brand-new user (F0),
Projects' entire footprint is one quiet teaching line — no empty-state page, no badges, no
demands (D-S7, ratified).

**On cross-project artifacts**: that's **Collections** (W2, row 4) — a second tree, deliberately
separate from Projects. The working model: a project is where an artifact is *born* (its
Artifacts tab shows origin); a collection is where it's *curated* — cross-project, nestable,
shareable. One artifact can live in both. If a cross-project *conversations* view matters too,
say so in the PR thread — today's answer is the Chats surface's flat mode, and it's open to
challenge.

## The 16 frames, one line each

**Row 1 — Front Door (F0 · F0x · F1 · S1).** First run (Projects visible from day one, one
teaching line) · the opt-out state (Projects hidden via Settings; teammate-add re-surfaces it
with a one-time "new" cue) · the canonical app-open landing (composer first, then needs-you /
continue / ran-overnight) · the Conversations Settings slide-in panel (Show Projects toggle,
density, default agent, notifications, appearance).

**Row 2 — Project Room (P1–P5).** Overview (orientation: since you left, needs you) ·
Conversations · Memory (the ledger: every note with agent, scope, provenance, edit/forget) ·
Artifacts (born here, curated anywhere) · **P5 is a PROPOSAL frame**: the former Workflows tab
folded into an Overview "Runs" section (live / completed / failed with Retry) — fold, don't
reduce; the tab row stays four tabs calm.

**Row 3 — The Thread (T1–T3).** At rest (quiet meta line: memory used · steps · cost · Inspect
run; the "Saved to project memory" capture moment with Edit/Undo; the create-a-project
escalation card) · Work running (Companion Rail slides in, collapses after) · Artifact open
(Studio Split: chat narrows, deliverable gets a working pane with versions + lenses).

**Row 4 — Workspace surfaces (W0a · W0b · W2 · W3).** Chats (all conversations, grouped/flat) ·
Projects (cards, each opens its Room) · Collections (curated libraries) · Routines (personal
scheduled runs). There is no Tasks surface anymore — v3's W1 was removed per D-S6 (task graphs
are agent-internal machinery; live-run visibility lives in the Companion Rail and Front Door's
"what ran").

## How to read what you see

- **If it's on screen and untagged, it's real today.** Every affordance was audited against the
  shipped subsystems (memory, plan mode, routines, permissions, artifacts) and the phase-1
  decision log; anything fictional was redrawn. Full evidence trail:
  `plans/conversations-phase1/COMPOSED-SHELL-AUDIT.md`.
- **Small gray `FUTURE` tags** mark direction-not-yet-backed: the read-status affordances
  (last-read "New" divider, unread bold+dot rows, "since you were last here" — all waiting on
  the D-S9 read-status table), "last here N days ago" recency, project members/roles, the
  archived-projects filter, drag-artifact-to-file, Remix/Analyze, the context ring,
  follow-latest collection pins. They're proposals riding along honestly; each needs a
  ratify-or-strike.
- **The blue `PROPOSAL` badge** appears exactly once: P5's Workflows-into-Overview fold. It was
  rendered as a recommendation and has since been **ratified (2026-07-22, D-S6 close-out)** —
  the badge is stale on the canvas until the next pass regenerates it; treat the Runs fold as
  decided.
- **Known not-yet-designed** (coming passes, not oversights): all states beyond the happy path
  (new user / sparse / heavy / loading / error / read-only), dark theme, mobile, and the entire
  voice/in-call surface (designed next against the realtime stack).

## What's already decided vs. what's open

**Locked** (see `plans/conversations-phase1/SHELL-DECISIONS.md` for rationale and dates): Front
Door as the landing (D-S2) · Room as what opening a project shows (D-S4) · quiet meta line at
rest with the rail as an earned state (D-S1) · Studio Split as the artifact state (D-S3) ·
"Artifacts", not "Outputs" (D-S5) · Tasks out of top-level nav (D-S6) · **Projects visible by
default with a Settings opt-out and organic-escalation onboarding (D-S7, ratified)** · the
Settings slide-in surface (D-S8) · user bubbles + agent avatar rows. The per-user read-status
substrate (D-S9) is endorsed but needs an owner and a migration on the umbrella.

**Open and genuinely up for grabs — this is where feedback moves the design:**
1. Nesting semantics (trees are shipped; roll-up/inheritance/move rules aren't ratified).
2. The FUTURE-tagged items above — keep, cut, or reshape any of them.
3. Cross-project surfaces beyond Collections (the PR comment's "cross-project interface" — what
   else needs one?).
4. Anything that feels overwhelming — the bar is a non-technical membership director having a
   calm daily surface with all power reachable. If a frame fails that test for you, that's
   exactly the feedback we want.

(Two former open questions are now closed: v3's ship-whole vs feature-flag was resolved by D-S7
— visible by default, per-user opt-out in Settings, optional org-level default — and the P5
Workflows fold was ratified 2026-07-22 as the D-S6 close-out.)

## Where to comment

Thread feedback on **PR #2953** (the Phase-1 umbrella) so it lands next to the plan and decision
log. Reference frames by their labels (e.g. "P3 Memory", "W0a Chats") — every frame is addressable.
