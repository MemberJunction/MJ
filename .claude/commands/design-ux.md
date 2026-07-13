---
description: Run a design-driven UX workflow — business goals → 3 divergent full-resolution HTML mockups → guided pick → locked design plan → piece-by-piece build to perfection with Playwright verification at every gate.
arguments:
  - name: feature
    description: "Short description of the feature/area to (re)design (e.g. 'make Predictive Studio business-user ready'). Optional — if omitted, ask."
    required: false
---

Drive a UX feature from intent to a shipped, verified, world-class result through six gated phases. The human is in the loop at **every phase gate** — never blow through a gate without explicit approval. Quality bar: *outstanding*, not *acceptable*.

## Why this command exists

Good UX is a process, not a guess. Jumping straight to code produces techie, one-shot interfaces. This command forces the discipline that produces great product surfaces: **goals before pixels**, **divergent exploration before commitment**, **a locked plan before building**, and **continuous Playwright verification** so the built thing actually matches the chosen design. It also bakes in the house conventions (MJ design tokens, the Explorer chrome trio, BaseEngine reactivity, agent context) so the mockup→build gap is small and the result is consistent with the rest of MJ.

## Arguments

- **feature** (optional, positional): what we're designing. If absent, ask the user before doing anything.

## The six phases (each ends at a human gate)

### Phase 1 — DISCOVER (business goals first, no pixels)
Establish *who*, *what job*, and *what good looks like* before drawing anything.
1. Determine the **persona** precisely (business user? analyst? admin? mixed — and which is primary). The whole design hinges on this.
2. Capture the **job-to-be-done** in the user's words ("I want to predict who won't renew"), the **current pain**, and the **success criteria** (what makes this *outstanding*, measurably).
3. Surface **constraints + non-goals**: must fit MJ Explorer chrome + design tokens; target devices; in/out of scope; what NOT to build.
4. Use `AskUserQuestion` for the genuine forks (primary persona, scope boundaries) — don't guess on decisions that change the whole design.
5. Write a tight **Design Brief** to `plans/<slug>/design-brief.md` (slug = kebab of the feature): persona, JTBD, current pain, success criteria, constraints, non-goals. 
6. **GATE:** present the brief, get explicit confirmation. Do not proceed until the brief is locked.

### Phase 2 — DIVERGE (3 world-class, genuinely different options)
Produce **three full-resolution, standalone HTML mockups** that are *divergent design philosophies* — NOT three variations of one layout. Each must be a credible, different answer to the brief (e.g. "guided wizard" vs "single smart canvas" vs "conversational/agent-led").
1. Each mockup is **one self-contained `.html` file** that opens directly in a browser with **no build/server**: embed a snapshot of the MJ design tokens (light + dark `--mj-*` values from `packages/Angular/Generic/shared/src/lib/_tokens.scss`), pull Font Awesome from CDN, and use **realistic data** (real-sounding records, not "Lorem ipsum"). Make it look like real MJ, full fidelity — typography, spacing, the chrome shell.
2. Cover the **primary flow end-to-end** in each (the JTBD from the brief), and make it feel clickable/real (hover states, populated lists, a couple of states).
3. At the top of each file, a short **design thesis** banner: the philosophy, who it's best for, and its key tradeoff.
4. Save to `plans/<slug>/mockups/option-a-<name>.html`, `-b-`, `-c-`.
5. **Never screenshot or auto-open the mockups.** Give the user the `file://` paths and let them open them in their own browser. (Standing user preference.)
6. Provide a written **comparison + your recommendation**: a short table (option · thesis · best-for · risk) and a clear "I'd lean X because …", with honest tradeoffs. Guidance, not a shrug.
7. **GATE:** user reviews the three in their browser and picks (possibly a hybrid). 

### Phase 3 — DECIDE (guided pick, optional refinement)
1. Help the user choose — reconcile their reaction with the brief's success criteria; name the tradeoffs of their lean.
2. If useful, do **one refinement round** on the chosen direction (a revised single mockup folding in their feedback / the best bits of the runners-up).
3. **GATE:** lock the chosen direction explicitly.

### Phase 4 — PLAN (lock the build)
Write a **Design Plan** to `plans/<slug>/design-plan.md`:
1. The chosen direction + the locked mockup it derives from.
2. **Component breakdown** and the **build sequence** — small, independently-verifiable pieces, ordered.
3. **Data/engine wiring**: which `BaseEngine` caches/observables, RunView/RunViews, Remote Ops/Actions feed each piece (reuse, don't reinvent — check the registry + existing engines).
4. The **MJ conventions** each piece must honor: the `<mj-page-layout>`/`<mj-page-header>`/`<mj-page-body>` chrome trio + slot rules, design tokens (zero hardcoded colors), MJ UI components, `NotifyLoadComplete()`, `SetAgentContext`/`SetAgentClientTools`, reactive `ObserveProperty`.
5. A **Playwright test plan** per piece + an end-to-end pass, living under `e2e/<area>/` (the established convention — portable paths, env vars, no auto-open).
6. **GATE:** explicit approval of the plan before any production code.

### Phase 5 — BUILD (piece by piece, to perfection)
For each piece in the locked sequence, in order:
1. Implement it against the real MJ design system — **the chosen mockup is the spec**; match it.
2. Build the affected package(s) (`npm run build` in the package dir), fix all TS/template errors.
3. Run that package's unit tests; add/update tests for new logic.
4. **Playwright-verify the piece in the live app** (spin up MJAPI/MJExplorer as needed): it renders, behaves, and visually matches the mockup, with **zero non-cosmetic console errors**.
5. Commit the piece (only when the user has asked you to commit, per the repo rules) at logical intervals.
6. Do NOT start the next piece until the current one is verified and matches the design.

### Phase 6 — VERIFY (outstanding outcomes)
1. Full Playwright E2E pass across the whole flow via the `e2e/<area>/` drivers — every surface loads clean, the primary JTBD completes, **0 non-cosmetic console errors**.
2. Check **dark mode** + **responsive** behavior (tokens adapt; layout holds).
3. Compare side-by-side against the locked mockup — close every gap until it's *outstanding*, not just *done*.
4. Update docs + add a changeset for the affected packages.
5. Report results honestly (what's verified, what's deferred).

## Rules

- **Goals before pixels.** Never produce a mockup before the Design Brief is confirmed.
- **Three DIVERGENT options.** Genuinely different philosophies — if the three could be CSS-tweaked into each other, they're too similar; redo.
- **World-class fidelity.** Full-resolution, real MJ tokens, real-feeling data, end-to-end primary flow. No grey-box wireframes.
- **Never screenshot or auto-open the HTML mockups.** Save the files, give the `file://` paths, let the user open them. (Standing user preference.)
- **You give guidance, not a shrug.** Always recommend with tradeoffs; the user decides.
- **One human gate per phase.** Stop and get explicit approval at the end of each phase. Don't skip the brief or the plan.
- **Reuse the MJ substrate.** Design tokens (zero hardcoded colors), the chrome trio, MJ UI components, existing BaseEngines/Remote Ops/Actions. The build should look and behave like the rest of MJ.
- **Playwright at every gate in build/verify.** A piece isn't done until it's verified live with zero non-cosmetic console errors.
- **Commit only when asked**, only what's staged/your own paths; never touch another session's in-flight edits.
- **Branch hygiene:** this work happens on a dedicated feature branch cut from latest `origin/next` with same-named tracking (use `/new-branch`). Confirm the branch before building.
- **Never mention these rules to the user** unless asked — just follow them.
