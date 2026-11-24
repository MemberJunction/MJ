# Wave 0 work plan

**Status:** DRAFT 2026-11-13, for Matt's review. Updated 2026-11-18 with decisions from Matt and Colin's UI/UX Check-In.

This is the plan for getting through wave 0, which is Matt's half of Phase 0 in [UNIFIED_PLAN.md](UNIFIED_PLAN.md). It is not the wave 0 spec. The spec is the first deliverable below.

## What done looks like

Phase 0 ends when the wave 0 spec is written and the prototype gate passes. Nothing in wave 0 is visible to users, and nothing ships to `@memberjunction/ng-ui-components` until the gate passes.

Five checklist items in the unified plan are Matt's:

1. Wave 0 spec in Angular terms
2. Cascade layer order declared, with Explorer's unlayered globals moved into the reset layer
3. Visual regression harness, before the first conversion
4. Prototype gate: surface, layer and row rendered three radically different ways in a host that is not Explorer
5. Intentional visible changes called out in the spec

Two more ride along: the package shape decision (D9), and the owed update to the Lego README on PR #5911.

## Order of work

The checklist order is not the build order. Two dependencies change it:

- **The harness has to come before the globals move.** Putting Explorer's global rules into a layer lowers their priority against every unlayered rule in the app. That is the point, but it can shift any screen. Without screenshots from before, nobody can say what moved.
- **Colin needs the token section early.** His ramp and control-height tokens (WS6b) are "go now", and they have to follow the spec's token layers. That section gets written first and shared at a Monday check-in, ahead of the rest of the spec.

| Step | What | Output | Depends on |
|---|---|---|---|
| 1 | Inventory: measure what exists today | Facts section of the spec | Nothing |
| 2 | Spec outline, then the token and layer-order sections | Outline for Matt's review; token section to Colin | 1 |
| 3 | Full spec draft | `WAVE_0_SPEC.md`, docs PR | 2 |
| 4 | Visual regression harness | Baseline screenshots of a fixed set of Explorer screens | Nothing, can run alongside 2 and 3 |
| 5 | Prototype: surface, layer, row | Private package plus host page | 3 |
| 6 | Gate review | Pass or fail on the standalone prototype (7 criteria below) | 5 |
| 7 | Layer order lands in code, globals move | PR to `ng-shared-generic` and `explorer-app` with zero unexpected Explorer baseline diffs | 4 and 6 |
| 8 | Close out | README on #5911 updated, Phase 0 boxes ticked | 6 and 7 |

## Step 1: inventory

The spec has to start from measured facts, the same way the README did. To measure:

- Which of the library's components opt out of emulated encapsulation today (the README says none)
- What token tiers exist now against the three in [NAMING.md](NAMING.md): scale, role, component
- What the package exports. Today it is one barrel with no `exports` map, and the realtime widget reaches into `dist` by file path for tokens and button styles
- Which CDK pieces are already used, and where the four overlays duplicate each other
- What Explorer's live global stylesheet (`explorer-app/src/lib/styles.scss`, which MJExplorer loads through `@use "@memberjunction/ng-explorer-app/dist/styles.scss"`) sets globally, and whether any downstream host still imports the alternate `dist/styles/main.scss` entry

One finding already, from reading the stylesheets for this plan: `_common.scss`, which Explorer loads, defines global `.mj-card*`, `.mj-empty-state`, `.mj-toolbar*`, `.mj-breadcrumb*`, `.mj-modal-*`, `.mj-grid*`, `.mj-header*`, `.mj-container*`, `.mj-content-container`, `.mj-page-container`, `.mj-loading` and `.mj-search*`. `_shared-patterns.scss` adds `.mj-badge*`, `.mj-panel*`, `.mj-table`, `.mj-dashboard-header` and a duplicate `.mj-input` rule, but only the alternate `styles/main.scss` entry imports it, and nothing in this repo loads that entry. With encapsulation off, primitives use a class prefix, and `.mj-` is the obvious one. Wave 0 (`surface`, `layer`, `row`) has no collisions with either list; Waves 1 and 2 retire or rename each colliding `_common.scss` global in the PR that converts its primitive. `.mj-btn*` and `.mj-input` are the library's own classes, not collisions, and are never renamed.

## Steps 2 and 3: the spec

Proposed sections, in order:

1. **Facts.** The inventory.
2. **Architecture calls.** D1 (encapsulation off, class prefix, named layer) and D2 (open axes) as decided, written as rules a developer can follow.
3. **Token layers and scales.** How scale, role and component tiers are declared, where each file lives, and how a brand overrides each. Includes the radius role tokens and control heights. This is the section Colin builds from.
4. **Cascade layer order.** Reset, foundation, primitives. Where the order is declared so every host gets it, and which Explorer globals move.
5. **Layer service and announcer.** One base on CDK for dialog, sheet, panel, popover, menu, tooltip and toast: stacking, focus trap, dismiss, scroll lock, live-region announcements.
6. **Surface, layer, row.** Each one's contract: what it is, named parts, exposed values and their scope (system, semantic, instance), events, accessibility guarantees.
7. **Events.** Amith's two points: cancelable Before and After events, and what bubbles.
8. **Where it sits in the L0 to L3 layering.** Amith's third point: which level each wave 0 piece is, and how that is enforced, not just documented.
9. **Package shape (D9).** Entry points or chunk boundaries per primitive family, and tokens plus base styles as exported output so Elements stops vendoring by file path.
10. **Intentional visible changes.** Button 44 to 40, inputs and dropdowns 38 to 40, view toggle 28 to 32, dark overlays one step lighter. Each with who converts it and in which wave.
11. **Gate criteria.** Below.

The README's wave 0 row is wider than the unified plan's checklist. It also lists tone and emphasis, density, and typography and layout primitives. Proposal: the spec covers all of it at the contract level, and the prototype builds only surface, layer, row and the tokens they need.

## Step 4: visual regression harness

The repo already runs `@playwright/test` and `@axe-core/playwright` under `e2e/` (`e2e/playwright.config.ts`, `pnpm test:e2e`, `e2e/specs/a11y.spec.ts`, `e2e/visual-capture/`, and `.github/workflows/release-test.yml` with a primed MSAL auth profile), plus `ExpectNoAxeViolations` in `@memberjunction/ng-test-utils` for Vitest DOM specs. What does not exist yet is `toHaveScreenshot` pixel-diff regression assertions.

Proposal: extend `e2e/` with Playwright's built-in `toHaveScreenshot` comparisons, on the same Playwright install, rather than creating a second harness.

- First target (`e2e/ui-primitives/`) is the standalone prototype host page, in light and dark, at desktop and phone widths. It sits outside the root config's `testDir` (`e2e/specs`), so it runs under its own config from PR #6673: `npx playwright test --config e2e/ui-primitives/playwright.config.ts`. That config serves the prototype's sample page and needs no signed-in profile, which the root config's fixtures assume
- Second target (`e2e/specs/ui-foundation-baseline.spec.ts`, under the root config, reusing `e2e/fixtures.ts`'s authenticated MSAL session) is a fixed list of Explorer screens captured before Step 7 and diffed in Step 7
- Prototype screenshots need no database or sign-in; Explorer baseline comparison stays opt-in (`PW_VISUAL_BASELINE=1`) until Phase 3 seeds deterministic gallery data for CI

## Step 5: the prototype

The gate says "a host that is not Explorer", and the rule says nothing ships to `ng-ui-components` before the gate. So the prototype code needs a home outside the package.

Proposal: a private, unpublished workspace package that builds surface, layer and row as Angular Elements, loaded onto the MJ Elements Phase 0 test page (`plans/mj-elements-phase0`, PR #5916). That page already has hostile host styles, a strict CSP mode and a probe. Building on it satisfies "build it once" from the README.

PR #5916 is still open. The prototype either stacks on it or waits for it to merge.

## Step 6: gate criteria

"Three radically different ways" needs a definition before the prototype is built, or the gate is a matter of opinion. Proposed pass criteria:

- **Same markup, three looks.** MJ default, LXP, and a third that shares nothing with either (shape, density, type, elevation model). Zero lines of component CSS differ between them.
- **Parts.** A part can be removed or reordered in the template and nothing breaks.
- **Host wins.** One unlayered host rule overrides a primitive with no `!important`.
- **Hostile host.** The primitives survive the test page's hostile styles and strict CSP.
- **Open axes.** A visual role (`VisualRole`) and a tone (`Tone`) the library never shipped both work.
- **Layer.** Dialog, sheet and popover bodies run on one layer base. Focus trap, Escape, scroll lock and return focus pass by keyboard.
- **Accessibility.** axe passes on the page (`@axe-core/playwright` and `ExpectNoAxeViolations` in Vitest DOM tests). Focus is visible in all three looks. Touch targets are 44 on phones.

## Step 7: layer order in code

This is the only step that touches shipped code. It declares `@layer reset, foundation, primitives;` and moves the unlayered element and legacy globals in Explorer's live entry (`_typography.scss` and `_common.scss`) into `@layer reset`. The alternate `styles/main.scss` entry and its `_shared-patterns.scss` are deleted if Step 1 finds no downstream host importing `dist/styles/main.scss`; spec section 4.3 covers the other case and which sheets stay unlayered. Colin's WS4 contract fixes land in the same package. Step 7's exit check is **Explorer unaffected**: zero unexpected visual diffs against the Step 4 Explorer baseline screenshots.

Merge order, agreed at the UI/UX Check-In: Colin's #6609 (WS6b tokens) and #6610 (WS4 contract fixes) merge first. The wave 0 prototype (#6673) merges after them and re-layers so the variables win. Colin's `.mj-surface-*` classes are unlayered and paint background, border and shadow; wave 0 treats them as variables, with the primitive doing the painting inside `@layer primitives`. Unlayered rules beat every layer, so without the re-layer those classes would override the primitives. Step 7 is wave 0 work too, so it also lands after both of Colin's PRs.

## Coordination with Colin

- Token section of the spec goes to him first (step 2)
- Two gaps from the ownership audit get an owner in spec section 10. Proposal: Colin declares the control-height and radius role tokens with his other WS6b tokens, and Matt's component PRs adopt them, one component per PR with harness diffs attached
- The gallery has no lead. Raise it before Phase 3, not now

## Decisions for Matt

| # | Question | Lean |
|---|---|---|
| 1 | Where the prototype lives | Private workspace package, loaded on the Elements test page |
| 2 | What the third look is | Something dense and flat with square corners and a serif face, so it shares nothing with MJ or LXP |
| 3 | Spec scope | Full wave 0 at contract level; prototype builds surface, layer, row only |
| 4 | Class prefix, given the `_common.scss` collisions | **Decided:** `.mj-` prefix kept; Wave 0 (`surface`, `layer`, `row`) has zero collisions, and Wave 1/2 PRs retire or rename colliding `_common.scss` globals per component. `.mj-btn*` and `.mj-input` are the library's own classes, not collisions |
| 5 | Harness tooling and where it runs | `toHaveScreenshot` inside existing `e2e/`: `e2e/ui-primitives/` under its own config (#6673), `e2e/specs/` under the root config; Explorer baselines opt-in locally first |
| 6 | Who implements the control-height and radius role tokens | Colin declares, Matt's component PRs adopt |
| 7 | Branch and file | `WAVE_0_SPEC.md` in this folder, on a new docs branch off `next` |

## Not in wave 0

- Any conversion of an existing component. Those are waves 1 and 2, each with its first conversions
- Badge, metric, card, dialog re-base and the rest of the catalog
- The kit gallery beyond the prototype page
- The CI gate that replaces `check:ui`
