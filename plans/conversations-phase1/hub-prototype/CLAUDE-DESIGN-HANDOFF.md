# Claude Design Handoff — Project Hub "Quiet Execution" Polish

> How to brief Claude Design on polishing this prototype without it undoing the design decisions
> underneath. Use the **context block** below as the first message of every session, attach the
> files listed per prompt, then paste one task prompt. One task per session — polish quality drops
> when a single session tries to do everything.

---

## Files to attach (per session)

| File | What it gives the designer |
|---|---|
| `hub-prototype/app.css` | The complete visual system — tokens, both themes, every component style |
| `hub-prototype/index.html` + `app.js` | Structure + rendered markup patterns (attach only for tasks that need markup context) |
| `hub-prototype/DESIGN-NOTES.md` | **The guardrails.** 12 locked positions + deliberately-undrawn boundaries |
| `mockups/projects-hub-quiet.html` | The static design of record — two frames, self-contained |
| Screenshots (light + dark) of the state you're polishing | Claude Design works far better reacting to pixels than imagining them from CSS |
| `projects-ux-brief.md` | Persona + jobs-to-be-done, if the task touches tone/copy |

Repo-side references (paste excerpts if relevant, don't attach whole files):
- `packages/Angular/Generic/shared/src/lib/_tokens.scss` — the REAL token system this mirrors
- `plans/conversations-phase1/redesign-directions.html` — direction A "Quiet Focus" defines the
  aesthetic lineage (screenshot frames from it rather than attaching; it's a packed bundle)

---

## Context block — prepend to every session

```
You are polishing the UI of "Project Hub — Quiet Execution," a design prototype for
MemberJunction's conversations platform (an AI-agent workspace for associations). It is
plain HTML/CSS/JS, styled exclusively with CSS custom properties that mirror the
production design-token system (--mj-*).

THE DESIGN LANGUAGE (do not fight it):
- Quiet execution: hierarchy comes from type scale, weight, and whitespace — never from
  boxes-in-boxes, count badges, or decoration. Sections are small-caps labels + hairline
  dividers on a single centered ~680px column.
- One accent moment per section. Brand blue (--mj-brand-primary) is precious; the page
  should read calm at a glance.
- The "growth contract": chrome earns its place. Sparse projects show less UI (no tabs,
  no avatars); the hub grows as content arrives. Never add chrome that renders empty.
- Metadata uses --mj-text-muted (WCAG AA), never --mj-text-disabled. That token is
  reserved for genuinely disabled things.
- Both themes are first-class. Every change must be checked against the dark values in
  the same stylesheet (data-theme="dark" + prefers-color-scheme). No new hardcoded hex —
  tokens or color-mix() on tokens only.
- Flat colors, no gradients. Brand blue, not indigo/violet.

HARD CONSTRAINTS:
- Do not change behavior: app.js state logic, data-act wiring, and the permission/
  growth-contract rendering rules are settled. CSS and markup-level polish only, unless
  the task says otherwise.
- Do not reintroduce: stat lines, count badges on tabs, card borders around sections,
  always-visible row actions (they reveal on hover/focus by design), or a tinted
  "resume" banner.
- DESIGN-NOTES.md lists 12 locked positions and the deliberately-undrawn boundaries
  (nesting, collections bridge, search scope). Respect both lists.
- The state map panel, personas, and demo toasts are review tooling — ignore them
  aesthetically, break nothing functionally.

OUTPUT FORMAT: return (1) a short rationale of what you changed and why, (2) the exact
CSS additions/replacements as copy-pasteable blocks with selectors matching app.css,
(3) any markup changes as minimal find/replace pairs. Do not return a full rewritten
file. (4) THE PLACEMENT ACCOUNT — the surface's complete baseline item list (provided
in the prompt) with an address for every item: at-rest / on-hover / overflow / consolidated
into X / deleted-on-record. A design with unplaced items is incomplete; do not present
one as finished.
```

---

## Task prompts

### 1 — Typographic rhythm & spacing pass (start here)
```
Task: a pure typography and spacing polish of the hub overview (screenshots attached,
light + dark; CSS attached).

The page works but was built by accretion — audit the vertical rhythm and type scale as
a system: section spacing (currently 38px), label size (11px caps), row padding, title
sizes (22px hub / 14px rows / 12.5px breadcrumb), line-heights, and the left-edge
alignment of every element in the column. Propose a consistent modular scale and spacing
scale (name the steps), show the deltas, and flag anywhere two adjacent text styles are
too close in size to read as different levels. Keep the quiet character — this is about
making the existing hierarchy crisper, not adding contrast through decoration.
```

### 2 — Composer refinement
```
Task: polish the chat composer (screenshots attached: empty state, with chips, with the
mention popover open, plan-armed, and the disabled-plan-chip state under a remote agent).

Areas: the chip row (spacing, remove-button balance), the bottom bar (attach / agent
pill / Plan first / mode / mic / send — their grouping and visual weight feel flat-left
today; should the identity controls read as one cluster?), the mention popover (item
density, group headers, active-item treatment), and the send button's presence. The
agent pill is load-bearing (it says who handles the message) — it may deserve slightly
more identity. Keep every control; keep the per-conversation semantics implied by the
visuals (the pill and chips belong to THIS conversation).
```

### 3 — Dark theme refinement
```
Task: dark mode polish. Attached: dark screenshots of the hub (grown + sparse), a chat,
the artifact page, and the share modal, plus app.css with both theme blocks.

The dark values were converged from the token system and are correct but not yet
*tuned*: check elevation logic (surface vs card vs sunken vs hover — do layers read in
the right order?), hairline divider visibility on surface, the navy sidebar's relationship
to the dark main area (it reads almost same-value now), avatar/identity colors against
dark, and the accent blue's luminance in small text vs buttons. Propose adjusted dark
token values ONLY (the light theme is locked), with a one-line rationale per change.
```

### 4 — First-run and empty states, emotional pass
```
Task: the first-run page ("Ask anything" hero + three starter prompts) and the
just-created-project state work functionally but read utilitarian (screenshots attached).
Make them feel considered and confident WITHOUT decoration debt: type scale of the hero,
starter-row treatment, the seedling footnote, spacing of the empty-project
"Start the first conversation" moment. No illustrations, no gradients, no mascots — the
calm IS the brand. Copy suggestions welcome (persona: association staff, capable
non-technical professionals; tone: plain, warm, zero AI-hype).
```

### 5 — Motion & micro-interaction spec (spec only, no code required)
```
Task: the prototype has almost no motion. Write a micro-interaction spec for: the plan
card's step-by-step execution check-off, the "Remembered" moment appearing under a
reply, a provisional memory note arriving on the hub, the "new" tag on fresh rows (and
its clearing), tab transitions, the companion rail open/close and its context⇄artifact
mode-swap, toasts, and the archive/undo moment. For each: trigger, duration, easing,
what property animates, and what deliberately does NOT move. House rules: motion under
200ms for state changes, one thing moves at a time, nothing loops, respects
prefers-reduced-motion. The aesthetic is quiet — motion should confirm, never perform.
```

### 6 — Fresh-eyes critique (no changes)
```
Task: you are seeing this product for the first time. Attached are screenshots of ten
states (hub grown/sparse/empty, chat, plan card, memory tab, artifact page, share modal,
first-run, dark hub). Without proposing solutions yet: what reads as unfinished, what
reads as inconsistent between surfaces, what would a design director redline? Rank the
ten worst offenders. Then, separately, the three strongest moments worth protecting.
```

---

## Round-trip protocol

1. Run one prompt per session; paste returned CSS into `app.css` (it's append-friendly —
   later rules win), apply markup find/replaces if any.
2. Re-verify locally: open the prototype, walk the affected states light + dark, check
   the state map still works.
3. Anything Claude Design proposes that conflicts with DESIGN-NOTES.md is a *proposal to
   change a decision* — bring it back to the review, don't silently apply it.
4. When a round lands, back-port visual verdicts into `mockups/projects-hub-quiet.html`
   so the static design of record stays true.
