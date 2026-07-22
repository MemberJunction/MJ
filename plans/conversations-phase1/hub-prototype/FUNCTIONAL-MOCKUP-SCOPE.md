# Functional Mockup — Composed Shell Walkthrough · Scope

> Status: **RATIFIED 2026-07-22 (Matt)** — v2, incorporating the two same-day revisions:
> (1) the full-fidelity / reuse-manifest rule ("no guesswork": every region has a declared
> spec), and (2) mobile promoted from out-of-scope to a dedicated work package.
> Decision context: the v4 canvas is approved (all D-S decisions locked, P5 ratified
> 2026-07-22) and the mandate is to implement from the mockups, replacing the current
> conversations UI. Before Angular work, we evolve the existing interactive prototype into a
> fully functional composed-shell walkthrough — the shell's thesis is choreography (earned
> states, transitions) that static frames cannot validate, and a working mockup absorbs the
> deferred states pass in clickable form.

## What this artifact is for

1. **The implementation contract** — each Angular slice replicates a working, already-ratified
   behavior instead of interpreting a still frame. No guesswork survives handoff.
2. **The states pass, in working form** — every surface reachable in new / sparse / established /
   heavy / loading / error / read-only, light + dark (+ mobile per WP6), via the state-map panel.
3. **The team ratification vehicle** — Amith/Caeleb/Robert click through it on PR #2953 instead
   of scrolling a 16-frame canvas.

Per SHELL-DECISIONS process rule 3 (one prototype), this is an **evolution of
`hub-prototype/index.html` + `app.js` + `app.css`** — not a new artifact. Inventory verdict
(2026-07-22): ~60% of the v4 target already exists working; the architecture (template-string
render, one state object, delegated `data-act` events, 3 seed personas, role preview, dark mode,
~40-target state-map) extends cleanly. Not a rewrite.

## The fidelity rule (ratified 2026-07-22): every region has a declared spec

Two kinds of surface, opposite treatment:

- **MOCKUP-SPEC** — everything NEW or CHANGED by the redesign (Front Door, Room, Chats,
  Projects grid, Collections, Settings, sidebar, rail choreography, Studio Split layout, the
  complete message row). Full fidelity, no sketches: the mockup IS the implementation contract
  for these regions. "Shallow" here = guesswork later = the failure this artifact exists to
  prevent.
- **MOUNT-POINT** — shipped internals the implementation will reuse by mounting the real
  component (composer engine/orchestration, live React artifact viewer internals, streaming,
  voice stack). The shipped product is already the zero-guesswork reference for these;
  re-implementing them in vanilla JS would create a second, slightly-wrong source of truth.
  The mockup owes **truthful density and placement**: facsimiles that look and weigh like the
  real thing, with the facsimile's dimensions/placement being the contract.

**THE REUSE MANIFEST is a required deliverable**: a table declaring every region of every
surface as MOCKUP-SPEC or MOUNT-POINT (naming the shipped component), with a breakpoint column
declaring its mobile behavior (per WP6). A region with no declaration = the surface is not done.
Guesswork only exists where neither declaration is made; the manifest makes that set empty.

## Scope — six work packages

### WP1 · New chrome / IA (the reshape)
- Sidebar rebuilt to v4's two-path shape: top-level nav (Chats / Projects / Collections /
  Routines + Settings gear at bottom) + Pinned + Recents. The current full project tree moves
  OUT of the sidebar (its DnD, filter, fresh-dot mechanics carry over into the new homes).
- `state.view` dispatch extends from 4 views to ~10: `frontdoor | chat | newchat | artifact |
  room | chats | projects | collections | routines | settings-open`.
- Front-Door-vs-Room routing per SHELL-DECISIONS "Routing" section (app open → Front Door;
  deep links land on thread/Room, never Front Door).

### WP2 · New surfaces — all MOCKUP-SPEC, all full fidelity
- **F1 Front Door** — composer-first landing + Needs you / Continue / Ran overnight (data model
  already exists: fresh dots, workflow states, plan-approval sim). F0 first-run variant with the
  Projects teaching line; F0x opt-out variant.
- **S1 Settings slide-in** — Show Projects toggle (drives F0x), density, default agent,
  notifications, appearance. Reuses modal/scrim plumbing; slide-in panel CSS is new.
- **W0a Chats** — all conversations, by-project/flat toggle, filter, select mode (row templates +
  filter logic reused from the sidebar tree).
- **W0b Projects** — card grid (color/icon, active dot, avatar stacks) opening the Room.
- **W2 Collections** — **FULL treatment** (upgraded 2026-07-22; absorbs GAPLIST 2.2's session):
  the second tree at shipped-workspace parity — breadcrumbs as drop targets, grid/list + sort,
  search, select mode, staging shelf, drag-move, context menus, origin-project chips, share.
  New seed data slice required. This surface replaces the richest shipped workspace; shallow
  here = parity regression by guesswork.

### WP3 · Behavioral upgrades to existing surfaces
- Companion Rail becomes **run-driven** (slides in when the workflow sim starts, collapse-on-finish
  with "Keep open"), replacing the manual toggle.
- **T3 Studio Split** — chat narrows to control strip + artifact working pane. The artifact pane
  is a MOUNT-POINT facsimile at REAL scale. ⚖ **Decision at session start (Matt): facsimile
  structure = the shipped 7-tab viewer (recommended default — the viewer is a mount-point and
  its real shape is the shipped one) vs the v4 canvas's simplified 4-lens model (which would be
  a redesign proposal belonging to GAPLIST 2.1's session, not a silent divergence).**
- **T1 escalation card** ("Create a project from this chat?") — appears on UNGROUPED chats when
  artifacts + memory accumulate (fixes the v4 canvas nit where it sat in a project chat).
- Room: P5 Runs section folded into Overview (mostly re-labeling — Running-now/failed already
  render there); tabs to the ratified four; "Outputs" → "Artifacts" copy.
- Memory capture moment upgraded to **Saved · Edit · Undo + Scope: Project ▾** (GAPLIST 1.13's
  scope-at-capture harvest — cheap here, expensive later).
- Read-status affordances (New divider, unread bold+dot, "since you left") built and rendered
  UNTAGGED as design-of-record (⚖11 resolved 2026-07-22: no FUTURE tags in the mockup; the
  backed-vs-unbacked tracking lives in CONTINUITY-LEDGER §E, not in the UI).

### WP4 · Thread at full fidelity (added 2026-07-22 — the no-guesswork upgrade)
- **The complete message row** (absorbs GAPLIST 1.1): hover actions, gear run-inspector presence,
  last-message footer vs earlier-messages-in-gear placement, rating badge + read-only "Rated
  N/10" pill, forms pills, per-message artifact cards, attachments — per the shipped placement
  facts in BASELINE-INVENTORY §C2. Internals are facsimiles (MOUNT-POINT); placement and density
  are MOCKUP-SPEC.
- **Header state chips consolidation** (GAPLIST 1.6 — a decide-against-the-list item): pins,
  artifacts, members, shared-by, and the project tag (which is secretly a second folder manager,
  §C2) get their consolidated quiet answer here.
- **Heavy-state truthfulness everywhere**: the Stress persona flows through every NEW surface
  (long threads, dense Rooms, 12-project sidebars), so the shell is validated against real
  density, not demo sparsity.

### WP5 · Harvest from the abandoned `prototype/` (2026-07-02)
- **W3 Routines** — port its full Routines surface (list/detail, Scheduled vs Monitoring,
  schedule editor, run history, pause), adapted to the delegated `data-act` style.
- Optionally its Skills catalog if trivially portable; otherwise skip (not a v4 frame).

### WP6 · Mobile grammar (added 2026-07-22 — promoted from out-of-scope)
- Runs AFTER the desktop surfaces stabilize (mobile derives from a settled desktop contract).
- The two mobile-only design decisions, solved here not guessed in Angular:
  (a) **Studio Split on a phone** — full-screen artifact takeover with fast flip back, or
  draggable sheet; (b) **the Companion Rail's mobile expression** — pinned strip or bottom
  sheet (there is no edge to slide in from).
- Breakpoint sweep of every surface reusing the established Explorer mobile conventions
  (drawer nav, bottom-sheet filters, concise chrome) so Explorer stays one product on a phone.
- Escalation moments + read-status affordances audited against notification-spam patterns at
  small sizes.
- The reuse manifest's breakpoint column gets filled for every region.
- Parity floor: today's conversations mobile affordances (sidebar slide-over, responsive
  workspace) must not regress.

## Deliberately faked / out of scope
- MOUNT-POINT internals per the fidelity rule (composer engine, live React artifact rendering,
  streaming, voice stack) — facsimiles at truthful density, never reimplementations.
- No voice/in-call surface — its own design session against #3111 (biggest undesigned surface;
  architecture-dependent; a MOUNT-POINT by definition).
- No omnibar/⌘K redesign — #3042 shipped; reconciliation is GAPLIST 2.5's session.
- No real persistence/backend — in-memory only, as today.
- Remaining out-of-frame surfaces (GAPLIST Part 2 minus 2.2, which WP2 absorbs): artifact viewer
  internals at real interactivity, tasks, notifications entry surface, threads, attachments
  viewer.

## Exit criteria (definition of done)
0. **CONTINUITY-LEDGER.md rows of class MOCKUP are all checked off** by placement accounts;
   the ledger (one disposition per shipped capability: MOCKUP / MOUNT / CONTRACT / DELETE) is
   the master completeness proof for the whole replacement — the mockup owes its class only.
1. Every v4 frame reachable and functional; former-FUTURE items rendered UNTAGGED as
   design-of-record (⚖11), with every such item listed in CONTINUITY-LEDGER §E
   (feature → backing prerequisite → umbrella home). An unbacked feature missing from §E is
   an exit failure.
2. Every surface passes the seven states via the state map, light + dark; WP6 surfaces additionally
   pass at mobile breakpoints.
3. **THE REUSE MANIFEST complete — zero undeclared regions**, breakpoint column included.
4. THE PLACEMENT ACCOUNT written for each surface (per CLAUDE-DESIGN-HANDOFF) — including the
   2026-07-22 sweep addendum items (BASELINE §C) for the surfaces this mockup models.
5. Attached to PR #2953 with the updated COMPOSED-SHELL-GUIDE as the walkthrough script.
6. P5's PROPOSAL badge gone (ratified); canvas v4 remains the frozen reference, the mockup
   becomes the living one.

## Timebox

Target **~7–8 working sessions** (revised from 4–5 when full fidelity + mobile were folded in,
2026-07-22). Suggested split lives in `fresh-brief/PROMPT-functional-mockup-v1.md`. If it
threatens to run past, the cut order is: WP5's optional Skills catalog first, then W0b polish,
then defer WP6's breakpoint sweep of the W-surfaces (never the two mobile design decisions,
never states coverage, never placement accounts, never the reuse manifest).
