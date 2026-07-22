# PROMPT — Functional Mockup, Composed Shell (v1) · 2026-07-22

> Session type: **working-code evolution of the interactive prototype** — NOT a static canvas
> pass. You are editing `hub-prototype/index.html` + `app.js` + `app.css` so the approved v4
> composed shell becomes a fully clickable walkthrough. The v4 canvas files stay frozen as the
> visual reference; do not modify them.

## Mission

Execute `hub-prototype/FUNCTIONAL-MOCKUP-SCOPE.md` (RATIFIED 2026-07-22, v2: WP1 chrome reshape ·
WP2 new surfaces at full fidelity · WP3 behavioral upgrades · WP4 thread at full fidelity ·
WP5 Routines harvest · WP6 mobile grammar). Extend the existing app; do not rewrite it. The
existing architecture is a deliberate choice: zero dependencies, zero build, template-string
render, one mutable `state` object, delegated `data-act` events, three seed personas, role
preview, dark toggle, state-map jump panel. Every addition follows those patterns.

## The fidelity rule (governs every session)

Every region of every surface is either:
- **MOCKUP-SPEC** — new/changed by the redesign: full fidelity, no sketches. The mockup is the
  implementation contract here. This includes W2 Collections at shipped-workspace parity and
  the complete message row (placement + density).
- **MOUNT-POINT** — shipped internals the implementation will reuse (composer engine, live React
  artifact viewer internals, streaming, voice): build faithful facsimiles at truthful density
  and REAL scale; never reimplement working internals — the facsimile's dimensions/placement
  are the contract, the shipped component is the spec.

Maintain **THE REUSE MANIFEST** (a table in your changelog, cumulative across sessions):
every region declared MOCKUP-SPEC or MOUNT-POINT (naming the shipped component), plus a
breakpoint column (filled in WP6). Zero undeclared regions at exit.

## Input package (attach ALL of these — no session runs without them)

1. `hub-prototype/FUNCTIONAL-MOCKUP-SCOPE.md` — the ratified scope; its exit criteria are the
   definition of done, its fidelity rule and out-of-scope list are binding.
2. `SHELL-DECISIONS.md` — D-S1..D-S9 with status. **All locked. P5 ratified 2026-07-22: the Room
   is four tabs (Overview · Conversations · Memory · Artifacts) with a Runs section inside
   Overview. No Workflows tab. Tasks appear nowhere in navigation.**
3. `hub-prototype/DESIGN-NOTES.md` — the 13 positions. **Position 13 is REVERSED: user messages
   are filled bubbles, agent turns are flat avatar rows. Prior sessions relapsed on this once;
   do not relapse.** The parity checklist row records the conscious divergence.
4. `hub-prototype/COMPOSED-SHELL-GUIDE.md` (v4 edition) — frame taxonomy F0/F0x/F1/S1 · P1–P5 ·
   T1–T3 · W0a/W0b/W2/W3 and the FUTURE/PROPOSAL reading rules.
5. `hub-prototype/MJ Composed Shellv4.html` — the frozen visual reference for every surface.
6. `hub-prototype/BASELINE-INVENTORY.md` **including §C (2026-07-22 sweep addendum)** and
   `hub-prototype/CLAUDE-DESIGN-GAPLIST.md` **including its 2026-07-22 addendum** — the parity
   facts. Placement accounts must address the §C items for any surface this mockup models
   (WP4 leans on §C2's message-row placement facts directly).
7. `hub-prototype/CLAUDE-DESIGN-HANDOFF.md` — prepend its context block verbatim (quiet-execution
   language, hard constraints, motion spec).
8. `prototype/` (the abandoned 2026-07-02 app) — harvest source for the W3 Routines surface only.
9. `hub-prototype/CONTINUITY-LEDGER.md` — the master disposition table for every shipped
   capability. Your placement accounts check off its MOCKUP-class rows; its ⚖ list is the
   complete set of open decisions (do not invent others, do not resolve them yourself — ⚖ rows
   are Matt's). MOUNT/CONTRACT/DELETE rows are NOT your scope.

## Hard constraints (violations are drift, not taste)

- **No count badges, anywhere.** Activity is a quiet dot + "new" tag. This includes the sidebar,
  W0b cards, and Room tabs.
- **User = filled bubbles; agent = flat avatar rows.** (Position 13, reversed 2026-07-15.)
- **The Companion Rail is earned chrome**: it slides in when a run goes live and collapses on
  finish ("Keep open" is the override). It is never permanent. If your layout wants a permanent
  rail, stop and write a proposal instead.
- **S1 Settings is a slide-in panel over the current surface**, never a page or route.
- **Front Door is exactly: composer + three earned sections** (Needs you · Continue · Ran
  overnight). Nothing else gets added to it.
- **The T1 escalation card appears on UNGROUPED chats only** (accumulated artifacts + memory),
  never inside a project chat.
- **"Artifacts", never "Outputs".**
- **Studio Split's artifact facsimile**: real scale; tab structure per Matt's session-start
  decision (recommended default = the shipped 7-tab viewer; the canvas's 4-lens simplification
  is a redesign proposal for GAPLIST 2.1, not a default you may adopt silently).
- FUTURE-tagged items (read-status affordances, "last here", members/roles, drag-to-file,
  context ring, Remix/Analyze, archived filter, follows-latest pins) are BUILT but carry a
  visible FUTURE tag in-UI, exactly as the v4 canvas tags them.
- Muted is not disabled; one accent moment per section; flat colors, no gradients; light AND
  dark first-class via the `--mj-*` tokens already defined in `app.css`.
- **Heavy state is truthful**: the Stress persona flows through every new surface. Do not
  validate the shell against demo sparsity.
- Locked D-S decisions and the 13 positions are not up for re-litigation. A conflict you
  discover mid-build becomes a **written proposal in your changelog**, never a silent change.

## Deliverables per session

1. Updated `index.html` / `app.js` / `app.css` — working, zero-dependency, opens from disk.
2. A dated changelog block (what changed, which WP, any proposals raised).
3. The cumulative **REUSE MANIFEST** updated for every region touched.
4. **THE PLACEMENT ACCOUNT** for every surface touched: each baseline item (including
   BASELINE §C items relevant to that surface) addressed as at-rest / hover / overflow /
   consolidated / deleted-on-record. Blank = the surface is not done.
5. State coverage proof: the state-map panel (re-keyed to the F/P/T/W taxonomy) reaches every
   new surface in new / sparse / established / heavy / loading / error / read-only, light + dark
   (+ mobile breakpoints once WP6 lands).

## Suggested session split (one review gate per session)

- **Session 1 — WP1 + S1**: chrome reshape (two-path sidebar, view routing) + Settings slide-in
  + F0/F0x first-run states. Everything else still reachable through the new nav.
- **Session 2 — F1 + W0a**: Front Door + Chats surface.
- **Session 3 — Room alignment + WP3**: P5 Runs fold, Artifacts rename, run-driven rail, Studio
  Split layout (⚖ viewer-tab decision from Matt at session start), escalation card,
  scope-at-capture memory moment.
- **Session 4 — WP4, thread at full fidelity**: complete message row (per §C2 placement facts),
  header chips consolidation (GAPLIST 1.6), heavy-state truthfulness sweep.
- **Session 5 — W0b + W2 (full)**: Projects grid + Collections at shipped-workspace parity
  (new seed data slice).
- **Session 6 — WP5**: Routines harvest from `prototype/` (+ Skills catalog only if trivial).
- **Session 7 — WP6, mobile grammar**: the two mobile design decisions (Studio Split takeover
  vs sheet; the rail's mobile expression), breakpoint sweep with the established Explorer mobile
  conventions (drawer nav, bottom-sheet filters, concise chrome), manifest breakpoint column.
- **Session 8 — sweep**: state-map re-key completion, placement accounts, states audit, polish.

Stop at the end of each session; Matt reviews in-browser before the next begins. If a session
threatens its scope, cut per the scope doc's order (WP5's Skills catalog first, then W0b polish,
then WP6's W-surface breakpoint sweep — never the two mobile design decisions, states coverage,
placement accounts, or the reuse manifest).
