# Wave 0 work plan

**Status:** DRAFT 2026-11-13, for Matt's review. Not committed.

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
| 6 | Gate review | Pass or fail against the criteria below | 5 |
| 7 | Layer order lands in code, globals move | PR to `ng-shared-generic` and `explorer-app` | 4 and 6 |
| 8 | Close out | README on #5911 updated, Phase 0 boxes ticked | 6 and 7 |

## Step 1: inventory

The spec has to start from measured facts, the same way the README did. To measure:

- Which of the library's components opt out of emulated encapsulation today (the README says none)
- What token tiers exist now against the three in [NAMING.md](NAMING.md): scale, role, component
- What the package exports. Today it is one barrel with no `exports` map, and the realtime widget reaches into `dist` by file path for tokens and button styles
- Which CDK pieces are already used, and where the four overlays duplicate each other
- What `explorer-app/src/lib/styles/_common.scss` sets globally

One finding already, from reading `_common.scss` for this plan: it defines global `.mj-card`, `.mj-card-header`, `.mj-card-body`, `.mj-card-footer`, `.mj-empty-state`, `.mj-toolbar`, `.mj-breadcrumb`, `.mj-modal-header`, `.mj-modal-body`, `.mj-modal-footer`, `.mj-grid` and `.mj-header`. With encapsulation off, primitives use a class prefix, and `mj-` is the obvious one. Those names are taken, by rules that will apply to any element carrying them. The spec has to pick a prefix that cannot collide, or retire these globals first.

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

The repo has no screenshot comparison today. Playwright is present only in the AI browser packages.

Proposal: Playwright's built-in screenshot comparison, started small.

- First target is the prototype host page, in light and dark, at desktop and phone widths
- Second target is a fixed list of Explorer screens, captured before step 7
- Runs locally at first. CI comes when the gallery exists in Phase 3, because Explorer screenshots need a seeded database to be stable

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
- **Open axes.** A role and a tone the library never shipped both work.
- **Layer.** Dialog, sheet and popover bodies run on one layer base. Focus trap, Escape, scroll lock and return focus pass by keyboard.
- **Accessibility.** axe passes on the page. Focus is visible in all three looks. Touch targets are 44 on phones.
- **Explorer unaffected.** The harness shows no diffs.

## Step 7: layer order in code

This is the only step that touches shipped code. It declares the layer order and moves the unlayered globals in `_common.scss` into the reset layer. Colin's WS4 contract fixes land in the same package, so the two PRs get sequenced at a Monday check-in.

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
| 4 | Class prefix, given the `_common.scss` collisions | Decide in the spec after the inventory counts how many templates use those global classes |
| 5 | Harness tooling and where it runs | Playwright screenshots, local first |
| 6 | Who implements the control-height and radius role tokens | Colin declares, Matt's component PRs adopt |
| 7 | Branch and file | `WAVE_0_SPEC.md` in this folder, on a new docs branch off `next` |

## Not in wave 0

- Any conversion of an existing component. Those are waves 1 and 2, each with its first conversions
- Badge, metric, card, dialog re-base and the rest of the catalog
- The kit gallery beyond the prototype page
- The CI gate that replaces `check:ui`
