# MJ UI Foundation (working name: Lego)

**Working name:** Lego. The rest of this plan says Lego.
**Status:** Proposed 2026-10-19, then merged with the Explorer UI/UX Overhaul into one plan. [UNIFIED_PLAN.md](UNIFIED_PLAN.md) (PR [#6503](https://github.com/MemberJunction/MJ/pull/6503)) is the version of record: where this file and it differ, it wins. This file stays as the Lego source it cites, and its seam table's Lego column points at sections here, so section numbers stay stable. Wave 0 spec: PR [#6674](https://github.com/MemberJunction/MJ/pull/6674). Wave 0 prototype and Playwright gate harness: PR [#6673](https://github.com/MemberJunction/MJ/pull/6673). Both open.
**Ask:** Matt, 2026-10-13. Every app built on MemberJunction should be able to rearrange, restyle, and build anything from any design, using MJ's own component library, without asking its permission. Today the library is about 40 finished widgets with no floor under them, so apps rebuild the floor themselves. Lego is the floor plus the catalog that goes on top of it, with every opinion shipped as a default rather than a wall.
**Owner:** @MattC-BC (this plan). The unified plan is Matt Chriest's and Colin Brockman's, and it decides who owns which parts of the library (D11): Matt owns the component contract, catalog and names; Colin owns Explorer IA, Home and runtime; the token mechanics are shared. See §6 and §6.1.
**Scope:** `packages/Angular/Generic/ui-components` (`@memberjunction/ng-ui-components`), expanding it roughly tenfold and rebuilding what exists to one set of principles; `packages/Angular/Generic/shared/src/lib/_tokens.scss`; `packages/ThemeEngine`; the gallery, catalog and agent-instruction tooling that ships with the package. Conversions land in whichever package holds the bespoke copy.
**Related:**
- [`UNIFIED_PLAN.md`](UNIFIED_PLAN.md): Lego and the Explorer overhaul as one plan, and the version of record (principles, decisions, seam table, phases, standing gates).
- [`NAMING.md`](NAMING.md): the naming convention for every public CSS custom property, named part and region.
- MJ Elements plan, PR [#5903](https://github.com/MemberJunction/MJ/pull/5903): the embeddable-widget runtime whose base layer is Lego's wave 0. See §7.
- [`guides/BUILDING_UI_ON_MJ.md`](../../guides/BUILDING_UI_ON_MJ.md) and [`guides/UI_LAYERING_GUIDE.md`](../../guides/UI_LAYERING_GUIDE.md): the four layers Lego's primitives sit under (`widgets` L1/L2 in `packages/Angular/Generic/**` with no router; only the Theme Studio gallery sits in L3 `surface`).
- [`plans/adoption-metrics.md`](../adoption-metrics.md) and `scripts/measure-ui-adoption.sh`: the adoption counter, which under-counts (see §3).
- [`plans/explorer-chrome-conventions.md`](../explorer-chrome-conventions.md): the page chrome trio Lego re-bases in wave 4.
- [`packages/OpenApp/PUBLISH_NO_BREAK_POLICY.md`](../../packages/OpenApp/PUBLISH_NO_BREAK_POLICY.md): OpenApp's additive-within-an-era rule for database schemas (code and component API changes there ship as minors; Lego commits to the stricter additive-within-an-era rule for primitive parts, tokens and events too, see §4).
- The August 2026 artifact series and the Lego Foundation demo, linked in §2 and §5.

---

## 1. What Lego is

Lego is the MJ UI foundation: a first-class, plug-and-play component and services library that lets any app built on MemberJunction rearrange, restyle, and build anything from any design. The name was adopted on 2026-10-13.

Two goals decide every call:

1. **Thirteen MJ developers can build any app without asking Matt.** Today UI and UX questions route through one person because the library has no floor and no catalog.
2. **An app built on MJ can look like itself without fighting MJ.** LXP is the proof it is not true today: 29 MJ tags used, about 98,000 lines of its own CSS, 458 of its own components (§3).

The bar, from the Rearrange, Restyle, Build deck: the test of a component library is whether it can absorb a design made without asking its permission. Every opinion is a default, not a wall.

**How we know it worked:** per-family adoption in `scripts/measure-ui-adoption.sh` (fed by the Phase 3 catalog gate) rises as waves convert, and the bespoke class counts in §3.2 (card, badge, stat, panel, empty, chip) fall with each conversion PR.

## 2. Where this came from

The design thinking was done between 2026-08-22 and 2026-08-27. The session transcript is gone; its artifacts survive and are the record. Nothing in this plan re-opens what that series settled.

| Artifact | Date | What it carries |
|---|---|---|
| [Two Trajectories](https://claude.ai/artifact/W8d4BizrsM45f4UjMZefES) | Aug 22 | Bespoke isn't the enemy, orphaned bespoke is. The widening-gap chart. Gravity, not gates. |
| [MJ Component Foundation](https://claude.ai/artifact/PVkQrQfi2uD4aLwhD3y7ic) | Aug 22 | A primitive is defined by what it is. A card is a bounded surface, not a thing with a title. The four-layer stack. The running record of decisions. |
| [How the Foundation Works](https://claude.ai/artifact/1iEkFUrfk3as8GSHjNt34p) | Aug 24 | The kit, rendered: one card primitive becoming four different objects, then the same move on dialog, empty state, row, and page header. Compositions built only from public primitives. |
| [Build From, Not Build Again](https://claude.ai/artifact/BnGijivkKaCf7nhBXUUu3P) | Aug 26 | The tech-huddle proposal with the cross-product numbers (§3.3). |
| [Talk Plan](https://claude.ai/artifact/Kv6atzXGAXc68672moCAEY) | Aug 26 | Three scopes of visual control (system, semantic, instance), three mechanisms (cascade layers, tokens, slots), and a list of claims the adversarial review killed. |
| [Speaking Script](https://claude.ai/artifact/TccYGaQ4fqh2PDeL4CYEqU) | Aug 27 | The prepared answer to "why not adopt Material or PrimeNG": a library ships a design language, so adopt the behaviour and own the appearance. |
| [Rearrange, Restyle, Build](https://claude.ai/artifact/6bS72pKmtcTWG4G4rXsHYG) | Aug 26 | The 15-slide deck given at the engineering meetup. |

**Settled then:** scope is MJ's library, referenceable by any app built on it. Foundation is Angular CDK. Customizable means reorderable, not just restyleable. Approach is design up front, then prototype, because openness can't be reviewed in a spec.

**Left open then:** what the catalog contains and in what order, and how far the prototype goes before anything is committed. §4 and §5 are the answers so far.

One loose end: the August proposal cites a full analysis at `plans/ui-style-control-gap-analysis.md`. It was never committed to MJ on any branch. The LXP repo's `docs/lxp-planning/mj-alignment/mj-upstream-proposals.md` (P6 and P7) is the surviving written piece of the same thinking.

## 3. What the repo says today

The library is about 40 finished widgets with no floor under them. Matt's verdict, confirmed in code on 2026-10-13: no cards, no reusable surfaces, half baked.

**No surface, no layer, no tone.** `mj-card` is a dashboard widget with a fixed header DOM (icon, h3 title, subtitle, tools, actions, maximize) and zero exposed visual values. Dialog, slide panel, bottom sheet, and window are four overlays with no shared base and no CDK. Every component has a private variant enum mapped to global tokens inside its own stylesheet, so solid versus tint is baked into each one.

### 3.1 Measured against `next`

Re-measured 2026-10-19 against `origin/next` at `f95b0447c5`. Each command runs from the repo root. The 2026-10-13 column is the brief's figure at `72e2685f30`; where the two differ by more than drift, the definition differed and the command column is the one that counts.

| Measure | 2026-10-13 | 2026-10-19 | Command |
|---|---|---|---|
| Files in `ng-ui-components/src/lib` declaring a component or directive (decorators) | 41 | 42 files (57 decorators) | `git grep -l -E "@(Component\|Directive)\(" origin/next -- packages/Angular/Generic/ui-components/src/lib \| grep -v test \| wc -l` |
| Of those using Angular CDK | 7 | 7: combobox, datepicker, dropdown, filter-popover, icon-picker, menu, workspace-tabs | `git grep -l "@angular/cdk" origin/next -- packages/Angular/Generic/ui-components/src/lib \| grep -v test` |
| Component-scoped CSS variables in the whole library | 3, all tabs | measured 2026-10-13, not re-run | |
| Components in the library opting out of emulated encapsulation | "22 sealed" | 0 of 42 set `ViewEncapsulation.None`; 33 carry a stylesheet, so 33 are sealed | `git grep -l "ViewEncapsulation.None" origin/next -- packages/Angular/Generic/ui-components/src/lib \| wc -l` |
| Tokens declared in `_tokens.scss` | 289 | 294 | `git show origin/next:packages/Angular/Generic/shared/src/lib/_tokens.scss \| grep -oE -- '--mj-[a-zA-Z0-9-]+[[:space:]]*:' \| sort -u \| wc -l` |
| Distinct `--mj-*` names referenced via `var()` across `packages/Angular` | 375 | 380 | `git grep -h -o -E 'var\(\s*--mj-[a-zA-Z0-9-]+' origin/next -- packages/Angular \| sed -E 's/var\(\s*//' \| sort -u \| wc -l` |
| Of those, not declared in `_tokens.scss` | 96 | 138 (some are declared elsewhere: ThemeEngine output, component-local) | `comm -23` of the two lists above |
| `--mj-brand-primary` references / files in `packages` | 5,803 / 643 | 6,108 / 687 | `git grep -o -e '--mj-brand-primary' origin/next -- packages \| wc -l` |
| ThemeEngine seed fields / tokens derived from them | 8 / 59 | 10 / 56 | `packages/ThemeEngine/src/seeds.ts` interface fields; `git show origin/next:packages/ThemeEngine/src/derive.ts \| grep -oE "'--mj-[a-z0-9-]+'" \| sort -u \| wc -l` |
| `::ng-deep` occurrences / files in `packages/Angular` | 498 / 81 | 506 / 83 | `git grep -o '::ng-deep' origin/next -- packages/Angular \| wc -l` |
| Hex colour literals in `packages/Angular` `.scss` and `.css` | 1,133 | 711 (plus 1,539 six-digit hex in `.ts` outside tests) | `git grep -o -P '#[0-9a-fA-F]{3,8}(?![0-9a-zA-Z])' origin/next -- 'packages/Angular/**/*.scss' 'packages/Angular/**/*.css' \| wc -l` |
| `<mj-empty-state` grep hits in `packages` | 570 | 613 raw hits; about 560 are template uses (434 `.html`, 129 `.ts`), the rest are `.md` docs, `.css` selectors and tests | `git grep -o '<mj-empty-state' origin/next -- packages \| wc -l` |

### 3.2 Duplication and adoption

**Duplication inside MJ**, counted on 2026-10-13 as files declaring their own class, definition not recorded, not re-run: stat 245, badge 218, card 191, panel 171, empty 161, chip 95, pill 85, avatar 36.

**Adoption where a canonical exists**, from `plans/adoption-metrics.md` (last measured 2026-07-02 by `scripts/measure-ui-adoption.sh`): button 23%, switch 6%, checkbox 12%, numeric 19%, empty state 87%. Empty state is high because it alone got a migration with an adoption marker. The script's markers under-count the bespoke side, so every other percentage is optimistic.

### 3.3 Cross-product numbers

From the Build From, Not Build Again proposal, measured 2026-08-26 across seven products, not re-run: 684 components vs 28 shared, 284 single-use, 78 dialogs with 53 hand-rolled modal machinery, 1,282 components built outside the platform. Token use was 98% colour and 6% spacing.

### 3.4 What's missing

Most of a library, not a short list. Against the catalog a first-class library ships (about 110 primitives and utilities before compositions), MJ has roughly 25 real primitives, and several of those are closed boxes that need rebuilding. The deck's three (table, avatar, skeleton) are the visible tip. The token foundation is largely in place; what is missing above it is the primitives and mechanisms that should consume it, and the services and tooling layers are thin.

| Layer | Missing | Have today |
|---|---|---|
| **Foundation** | Surface, layer, row as bare primitives. A tone and visual-role vocabulary (`bg` rather than `fill`, on-solid vs on-tint text). The token chain: component variables defaulting to role tokens, which default to the shared scales ([NAMING.md](NAMING.md)), so a brand can move one component without moving everything (3 component variables exist today, all in tabs). Density as a user preference selecting a `--mj-control-height-*` step (with container overrides via CSS custom properties, rather than a separate scale). A governed surface and elevation ramp: ramp B keeps light `base` and `elevated` on `neutral-0` (separated by border and shadow) while lifting dark `elevated` and `overlay` surfaces by lightness, backed by a WCAG contrast table and surface-scoped text re-points. Typography as components (heading level, scale, face as inputs). Layout primitives (stack, cluster, grid, container, scroll area). Adoption of the scales that exist: the August count put token use at 98% colour and 6% spacing. | In `_tokens.scss` on `next`: a 23-step spacing scale (`--mj-space-*`), 7 radii, 7 shadows plus 2 brand shadows, an 11-size type scale with 4 weights, 6 line heights and 5 tracking steps, two font-family tokens, a focus-ring system (`--mj-ring-*`, `--mj-focus-ring`), 4 transitions, an 11-step z-index band, 8 background levels (page, surface, elevated, card, sunken, hover, active, overlay), semantic text, border, brand, accent, tertiary, status and data-viz palettes. The `--mj-font-family` token names Inter, which nothing loads; Explorer loads Montserrat from `_typography.scss`. |
| **Services** | One layer service on CDK (overlay, focus trap, dismiss, scroll lock, stacking). Toast. Announcer for live regions. Hotkeys. | Dialog opener, confirm, icon catalogue, each tied to one widget |
| **Primitives** | Inputs: textarea with autogrow, radio group, checkbox group, slider, colour picker, file dropzone, tag input, password reveal, date range, time picker, multiselect, inline edit, rating. Navigation: breadcrumb, stepper, pagination in the library, menu bar, link, back control, anchor nav, bottom nav, command palette. Feedback: tooltip, toast, banner, circular progress, skeleton, spinner, notification center, state region for empty, loading, error and first-run. Data display: table, description list, sparkline, code block, image with fallback, carousel, generic disclosure, avatar, avatar group, metric, generic badge, generic chip, status dot. Overlays: sheet, drawer, popover, context menu, lightbox on one base. Utilities: visually hidden, truncate, copy to clipboard, autofocus, sortable and virtual scroll on CDK. An icon component so the icon library is swappable. | Button, input, switch, dropdown, combobox, datepicker, numeric, dialog, slide panel, bottom sheet, window, menu, accordion, tabs, alert, progress bar, filter chip, stat badge, empty state, page chrome trio, left nav, splitter |
| **Tooling** | A living gallery. A machine-readable catalog. Agent instructions that travel with the package. Visual regression. Codemods for conversions. Theme Studio driving component values. A Claude Design system generated from the real tokens. Zone-tiered lint. An adoption dashboard. | A README catalog, a token doc, an adoption script that under-counts, a token-level Theme Studio |

Three things that do exist are unfindable: toast lives inside the conversations package, the tooltip inside workspace-tabs as `mjTip`, the stepper inside Predictive Studio's wizard. The scattered ones (tab strip, pagination, loading, generic dialog) each live in their own package.

### 3.5 LXP as the case study

Re-measured 2026-10-19 in `Sidecar-Learning-Hub` at `c3ddda402` (branch `feat/1059-pr3-checklist`), worktrees excluded. The brief's 2026-10-13 figures were 29 tags, 89,000 CSS lines, 427 components, 103 `::ng-deep`.

| Measure | Value | Command (from the LXP repo root) |
|---|---|---|
| MJ pin | `@memberjunction/core` and `ng-ui-components` at 5.51.0, while MJ is at 6.2.0-edge.4 | `git grep -h -E '"@memberjunction/(core\|ng-ui-components)"' HEAD -- '**/package.json'` |
| Distinct `<mj-` tags used | 29 | `git grep -h -o -E '<mj-[a-z0-9-]+' HEAD -- '**/*.html' '**/*.ts' ':!.claude/**' \| sort -u \| wc -l` |
| Lines of its own `.scss` and `.css` | 98,541 | `git ls-files -- '*.scss' '*.css' ':!.claude/**' \| xargs cat \| wc -l` |
| `@Component` decorators outside tests | 458 | `git grep -h -c '@Component(' HEAD -- '**/*.ts' ':!.claude/**' ':!**/*.test.ts' ':!**/*.spec.ts' \| paste -sd+ - \| bc` |
| `::ng-deep` occurrences | 105 | `git grep -o '::ng-deep' HEAD -- ':!.claude/**' \| wc -l` |

The pin means `mj-card` and `mj-menu` are unreachable from LXP. Where MJ had a primitive, LXP used it heavily: form field, button, collapsible panel, dialog, empty state. Everything else it built. The cost is not the `::ng-deep` rules. It is the CSS and the components written because the platform had nothing to offer.

## 4. The contract

The contract is the August one, with two rules added in October and an order for the catalog.

**The contract.** A primitive is defined by what it is, not what it contains. Parts are optional and order-free. Every value a component uses is exposed as a result, not an ingredient, and defaults to what renders today. Opinions move up into named compositions built only from public primitives, with no cliff between using one and copying it. The boring half (overlay, focus trap, roving focus, dismiss, announcements) comes from Angular CDK.

**Two rules added 2026-10-14.**

1. Every closed list is a wall unless it is a set of defaults over an open axis. Visual roles, tones, parts, layer kinds, and density steps are all open names with shipped defaults.
2. Every primitive ships with its first conversions in the same PR, or it doesn't ship. The card with slots that landed in August with zero adopters is the lesson.

**The four layers.** App code sits on compositions, compositions on primitives, primitives on the foundation (tokens, scales, the layer service on CDK). Opinions live one layer up from the thing they are opinions about, so a fix in the foundation reaches every layer above it, including screens nobody remembers building. A bare surface doesn't mean every team invents its own anatomy; the anatomy belongs to a named composition one layer up. In package enforcement ([`UI_LAYERING_GUIDE.md`](../../guides/UI_LAYERING_GUIDE.md)), tokens, primitives, and generic compositions live in L1/L2 `widgets` packages under `packages/Angular/Generic/**` (zero router or shell imports), while app screens and the Theme Studio gallery live in L3 `surface`/`shell`.

**The escape-hatch ladder.** When the library didn't foresee a need, there is always a next rung, in this order: a value, then a named part that is stable across releases, then host CSS that always wins by construction, then copy the composition. The rung someone had to use is telemetry for a missing value.

**Three scopes of visual control**, from the Talk Plan: system (tokens and seeds, what a brand sets once), semantic (a variant axis a composition names, such as a visual role or tone), instance (one value on one element, usually from data). Every exposed value says which scope it belongs to.

**Contracts are additive within an era.** [`PUBLISH_NO_BREAK_POLICY.md`](../../packages/OpenApp/PUBLISH_NO_BREAK_POLICY.md) makes OpenApp schema breaks era-bound while allowing code and component API changes in minor releases. Lego commits to the stricter schema-style rule for primitive contracts too: a primitive's named parts, exposed CSS custom properties, inputs, and events only grow inside a major line. That is also the answer to the LXP pin: an app pinned to an older minor loses nothing it relied on when it upgrades.

**Converting an existing component.** Moving one of the 33 existing components off emulated encapsulation and into `@layer primitives` changes specificity for callers (including the 506 `::ng-deep` uses in MJ and 105 in LXP). Every conversion PR captures before-and-after Playwright screenshots, keeps old slot directives and class names forwarding with a dev-mode deprecation warning ([NAMING.md](NAMING.md)), and records any selector migration in the release notes for downstream apps.

### 4.1 Accessibility by default (folded from #3609)

PR #3609 confirmed that the leverage point for form accessibility is the runtime form components in `@memberjunction/ng-base-forms` (`mj-form-field` and `mj-collapsible-panel`), not CodeGen's emitted template strings. Its implementation was closed without merging because it patched hand-rolled widgets (`div.mj-custom-select-trigger` with `setTimeout` blur and `label[for]` on a non-labelable `<div>`, plus `div[role="button"]` wrapping nested interactive controls) instead of building on CDK primitives and the naming/disclosure patterns since shipped in `ng-ui-components` (#3860, #4116, `4938b666e6`). Those requirements fold into Lego's form and tooling work:

- **Replace bespoke `select` and `autocomplete` DOM in `mj-form-field`** with the CDK-backed primitives (`mj-dropdown`, `mj-combobox`), inheriting `MJNamedControlBase` (`aria-labelledby` for `div[role="combobox"]` triggers rather than `label[for]`, which fails on non-labelable elements in Gecko and WebKit), `WarnIfUnnamed`, full keyboard navigation, and overlay-scoped `Escape` handling that does not close a hosting dialog.
- **Re-base `mj-collapsible-panel`'s header onto the sibling-button disclosure pattern** proven in `mj-accordion-panel`: a real `<button type="button">` owning `aria-expanded` and `aria-controls` over a `role="region"` body (`aria-labelledby`), with header actions, comment buttons, and inherited-entity badges rendered as siblings rather than nested interactive children inside `role="button"` (WCAG 4.1.2).
- **Wire label, state, and validation semantics across `mj-form-field`**: per-instance `ControlId` and `LabelId`, `<label [id]="LabelId" [attr.for]="ControlId">` on labelable inputs, `aria-label` fallback from `DisplayName` when `ShowLabel` is false (including read-only checkboxes), `aria-required` from `AllowsNull === false`, `aria-invalid` when error-level failures display, and `aria-describedby` pointing at the rendered error (`role="alert"`) and warning (`role="status"`) containers.
- **Complete FK search grid keyboard and ARIA semantics**: `role="combobox"` with `aria-activedescendant` over the multi-column results grid (`role="grid"`, `row`, `columnheader`, `gridcell`), and fix `scrollActiveOptionIntoView()` to query `.mj-fk-grid-row` instead of the stale `.mj-fk-option` selector.
- **Keyboard-operable read-only Email and URL links**: `role="link"`, `tabindex="0"`, and Enter-key activation in `mj-form-field` (matching `[mjRecordLink]` on FK and Record links), with decorative icons marked `aria-hidden="true"`.
- **Static template CI gate (`check:a11y`) and live axe checks**: run the high-precision static template rules (`img-alt` for WCAG 1.1.1, `positive-tabindex` for 2.4.3, and `hidden-but-focusable` `aria-hidden="true"` + `tabindex="0"` for 4.1.2) alongside `check-focus-ring.sh` (feeding into the Phase 3 catalog gate that replaces `check:ui`), pair Vitest DOM specs with `ExpectNoAxeViolations` from `@memberjunction/ng-test-utils`, and run `@axe-core/playwright` assertions in `e2e/` against the Lego gallery and wave 0 test page rather than carrying an uncalled oracle in `@memberjunction/testing-engine`.

## 5. Catalog order

Foundation first and kept thin, with the prototype gate at its end. Then waves ordered by what blocks other things and by bespoke count.

| Wave | Contents | Why here |
|---|---|---|
| 0 | Component and role tokens over the existing spacing, shape and type scales, named per [NAMING.md](NAMING.md), tone and emphasis, density, the elevation ramp (ramp B, with its contrast table as the contract), the layer service and announcer on CDK, typography and layout primitives, surface, layer, row. Package shape (§7). | Everything else is built from it. Gate: surface, layer, and row each rendered three radically different ways in a host that is not Explorer |
| 1 | Badge, metric, card, stat tile composition, icon component | Highest bespoke counts. Proves surface. Lowest risk |
| 2 | Dialog re-based additively, sheet, panel, popover, menu, tooltip, toast, plus toast and confirm services | Proves layer on the hardest shape. Retires the hand-rolled modals |
| 3 | Avatar, skeleton, chip, state region family, table | The day-one vocabulary apps still lack |
| 4 | Stepper, breadcrumb, pagination, tabs re-based, tree, toolbar, page header on named parts | Structure, mostly reshaping what exists |
| 5+ | Compositions as they recur: agent card, record card, confirm dialog, empty-state family | Whoever needs one |

A first-class library is closer to 110 primitives and utilities before compositions. The rest (inputs, navigation, feedback, data display, layout, typography, utilities) slots into waves 3 and 4 or the backlog behind them, in the same order.

**Tooling is part of the catalog.** The gallery, the machine-readable catalog, and the agent instructions start in wave 0, because the prototype is the gallery's first page and Claude writes most of the UI now. Visual regression lands before the first conversion. Codemods arrive with the first high-count conversion. Theme Studio and the Claude Design system sync wait until component values exist.

### 5.1 The demo

[Lego Foundation](https://claude.ai/artifact/Y7zQH9q4kFyr1tj7Ycrusy) (2026-10-13, static HTML, not Angular) builds one Agents screen from primitives only and puts a knob on each principle. It answers whether the direction is right, not whether it builds in Angular. It is not in this folder; the wave 0 prototype gate is the next artifact and will be.

| Knob | What it shows |
|---|---|
| X-ray | Every outlined region is one primitive. Click any brick for the markup you'd write. The dialog, menu, and toast are bricks too. |
| Swap | Cards become rows with one change. Three page headers. Three dialog bodies in one layer. Neighbors don't move. |
| Rearrange | The agent card's composition as an editable list. Drag or untick a part and every card re-renders, with the source updating to match. |
| Inherit | Radius, density, elevation, focus ring. Turn one and every brick changes, including layers not yet opened. The pill-button toggle moves one component value and leaves the shared scale alone. |
| Three scopes | Brand switch for system. A tone on a selected card for semantic, with strip, avatar, and primary button following while the status badge keeps its meaning. One card coloured from its record for instance. |
| Open the composition | The source of `mj-agent-card` is nothing but public primitives, in whatever order was set. |

**The first version failed the restyle test, and the failure was the lesson.** A brand that only moved colours and one radius looked like a palette swap, which is exactly today's MJ. The fix was to expose treatments as values: the composition names a role (band, primary, status, avatar) and the brand owns two numbers per role, how much of the tone fills the box and whether the text reads as on-solid or on-tint. With shape, type, density, and spacing values added, LXP became a different product with the same markup. The page counts it live: about 50 exposed values differ between the two brands, and zero lines of component CSS.

The LXP preset is honest about what it is. LXP's real theme file sets colours, Poppins, and a 12px radius. Everything else in the preset is what LXP would set if the value existed, and is today 600 lines of overrides.

## 6. Decisions

D1, D2, D9, D10 and D11 are decided, and [UNIFIED_PLAN.md](UNIFIED_PLAN.md) records where each was settled. D3 to D8 are still leans, not decisions; the unified plan's phase 2 already runs waves 1 and 2 in parallel, as D8 proposes.

| # | Question | Options | Lean or decision |
|---|---|---|---|
| **D1** | Encapsulation and CSS layers | (a) Keep Angular's emulated encapsulation, so only exposed values reach consumers. (b) Ship primitives with encapsulation off and their CSS in a named `@layer`. | **Decided, Oct 2026: (b), plus a class prefix.** Primitives ship with Angular's emulated encapsulation off, a class prefix so names do not collide, and all of their CSS in a named `@layer`, so host CSS wins by construction. Prefix and layer do different jobs, so it is both. Without this, named parts and host-wins (ladder rungs 2 and 3) don't work, and Lego is a list someone had to think of in advance. Angular Material and PrimeNG both made this call. Today 0 of the library's 42 files declaring a component or directive (37 files with components, 8 with directives, 3 overlapping) opt out of emulated encapsulation (§3.1). This is a new pattern: `mj-realtime-widget` turns encapsulation off and prefixes its classes (`.mjw-`), but only its generated global defaults sit in a layer. §7 explains why the same answer is needed for MJ Elements. |
| **D2** | Open axes in the real implementation | (a) Hardcode roles and tones as the demo does. (b) Map names to variables at runtime so a brand can add its own. | **Decided: (b).** Roles and tones map to variables at runtime so a brand can add its own; unknown names fall back to the author's explicit emphasis. This is rule 1 of §4 applied to the implementation. Variable names follow [NAMING.md](NAMING.md) (`--mj-visual-role-<name>-*` and `--mj-tone-<name>-*`), not the demo's: it rules out unprefixed names like `--role-fill`, avoids overloading Tier 2 "role", and says `bg`, not `fill`, so `--mj-<role>-fill` does not carry over either. |
| **D3** | Badge, pill, chip, tag | One component with modes, or several | Two: badge is a static label with tone and treatment, chip is interactive. Pill and tag are shapes and uses, so pill becomes an exposed shape value. |
| **D4** | Surface, card, panel | One, two, or three names | Two: surface is the primitive, card is surface with optional parts and the name people reach for. Panel is a surface in a layout slot. |
| **D5** | Empty state | Extend `mj-empty-state` or replace it | Replace with a generic state region named for what it is, and make the old one a thin wrapper so the roughly 560 template uses (613 raw hits, §3.1) don't move. |
| **D6** | Table | CDK table, AG Grid, or both | A CDK-based primitive for the simple case; AG Grid stays as the data grid. Two table stories is the honest shape of the need. |
| **D7** | Row | One component or several | One. The four examples differ only in content. A second component means the first has an opinion it shouldn't. |
| **D8** | First public move | Wave 1 (visible, cheap) or wave 2 (the real contract test) | Run both in parallel. Show wave 1 first if one has to go first. |
| **D9** | Package shape | (a) One barrel, as today. (b) Secondary entry points or chunk boundaries per primitive family, so a consumer that wants surface and button doesn't pay for the data grid. | **Decided: (b).** Entry points or chunk boundaries per primitive family, chosen in wave 0 before the catalog grows. The wave 0 spec (PR [#6674](https://github.com/MemberJunction/MJ/pull/6674)) carries it. See §7. |
| **D10** | Relationship to the Explorer UI overhaul proposal's WS6 (component control surface) | (a) Two parallel streams with a shared token layer. (b) One stream, with the restyle work and the token mechanics split between them. | **Decided: (b), one stream, split per the seam table (§6.1).** The unified plan merges the two plans. WS6a and Lego waves 1 and 2 become one stream in its phase 2: Matt owns the contract and names, and Colin's per-component variables carry over as exposed values with a default chain. WS6b (surface and elevation ramp, control heights, ambient layer, dark text tiers) is Colin's, as wave 0 tokens. |
| **D11** | Ownership | Who owns the component contract, the catalog, the token mechanics, and the compositions | **Decided in the unified plan.** Matt owns the component contract, catalog and names; Colin owns Explorer IA, Home and runtime; the token mechanics are shared under the two principles everyone already works under (name things for what they are; expose every value defaulting to today). §6.1 names an owner for each piece. Matt and Colin confirming it, with Amith and Robert seeing it, is a phase 0 item in the unified plan. |

### 6.1 Seam table: who owns what

Copied from [UNIFIED_PLAN.md](UNIFIED_PLAN.md) so D10 and D11 can be read in place. The unified plan is the version of record; if the two drift, it wins. Every overhaul workstream lands in exactly one place: Colin's, Matt's, or a shared seam with a named contract between them. Overhaul numbering is Colin's v3 proposal; the Lego column is the wave or section of this file that touches the same ground.

| Piece | Overhaul | Lego | Owner | Status | Phase | Contract between them |
| --- | --- | --- | --- | --- | --- | --- |
| App categories entity, nav `Children`, auto-rendered rails | WS1 IA metadata | Out of scope (§10) | Colin | Go now | 1 | Rails and tabs render with Lego's navigation primitives once wave 4 lands; until then, today's components. |
| Homepage: clickable and configurable chips, recents, information over navigation | WS2 Home | Out of scope | Colin | Go now | 1 | Card and stat tile come from Lego wave 1 when it ships; chips default to today's look. |
| Per-user sitemap, scoped shell config, header controls, access map, UX preferences | WS3 UX runtime | Out of scope | Colin | Needs spec | 4 | Setting keys get a governed namespace; access questions go through the authorizations engine. ThemeEngine already carries tenant themes. |
| Font Awesome to npm, Montserrat retoken, card-grid hex, toast cleanup | WS4 contract fixes | §3.1 measurements | Colin | Go now | 0 | Edits land in `explorer-app`, never in MJExplorer. Three toasts exist: conversations, notifications, and the service worker's `mj-update-notification`. Retire the first two to one in wave 2. The update notice is single-purpose and stays as it is. |
| tokens.json and components.json generator, ghost-token ratchet, membership gate, UI guide | WS5 index and gate | Catalog tooling (§5), one catalog (§7) | Colin + Matt | Needs spec | 3 | One machine-readable catalog. The gate replaces `check:ui` and feeds `measure-ui-adoption.sh`, never a third system. |
| Component control surface: exposed values on the top ten primitives, named parts, generic slot | WS6a | Wave 0 contract, waves 1 and 2 | Matt | Needs spec | 2 | Matt owns the contract and names; Colin's per-component variables carry over as exposed values with a default chain. The generic slot is rebuilt as named parts, because D1 turns encapsulation off. |
| Surface and elevation ramp, control-height scale, ambient layer, dark text tiers | WS6b | Wave 0 tokens | Colin | Go now | 0 | Colin implements under the ramp B contrast table signed off 2026-09-18. Any ramp change re-runs the table. |
| Kit gallery (storybook) with when-to-use guidance | WS7 studio kit | Gallery starts in wave 0 | Colin + Matt | Needs spec | 3 | One gallery, likely inside Theme Studio. The wave 0 prototype is its first page. |
| Layout and app builder | WS7 builder | Out of scope | Colin | Study first | Later | Study Form Studio, component spec and metadata dashboards first (Amith). |
| Primitives: badge, metric, card, dialog, sheet, menu, toast, table, tabs, page header | None | Waves 1 to 4 | Matt | Needs spec | 2, 3 | Each ships with its first conversions. Overhaul screens adopt them as they land, never block on them. |
| Explorer deconstruction: auth and first-paint as reusable bundles | New (Amith, 2026-11-03) | D9 package shape | Open | Study first | Later | Decide after D9 lands; the same entry-point work may cover it. |
| Tours, theme from a customer URL, persona palettes | New (ideas logged) | None | Colin | Later | Later | Betty is the proving ground; bring home when a second app needs it. |

## 7. Relationship to MJ Elements (#5903)

The MJ Elements plan (PR [#5903](https://github.com/MemberJunction/MJ/pull/5903)) proposes one loader and one layered runtime for every embeddable MJ widget. Its base layer is "Angular once, the `--mj-*` token layer and base component styles, the page session." That base layer is Lego's wave 0, and four of its questions are Lego questions. They should be decided once, here, and cited from there.

| Seam | In the Elements plan | In Lego |
|---|---|---|
| **Encapsulation** | D3: light DOM or shadow DOM, "decide on the test page." | D1 above. Shadow DOM removes ladder rung 3 (host CSS wins by construction) for every element, and `@font-face` doesn't register inside a shadow root. D1 is decided: light DOM, a class prefix and a named `@layer`. `<mj-realtime-widget>` already turns encapsulation off and prefixes its classes (`.mjw-`), but only its generated global defaults sit in a layer. Host-page breakage (a collapsed `height: 100%`, a `color-scheme` repaint) is answered by layer order and `:not(:defined)` sizing rules, not by a wall. |
| **Icons** | D4: Font Awesome from the runtime, or inline SVG. Forms built `<mjf-icon>` because Font Awesome measured 0 by 0 on a host page. | Wave 1's icon component. The library has Font Awesome class strings in 52 files under `ui-components/src/lib` and no icon primitive. Whatever the Elements test page measures becomes that primitive's spec. |
| **The base layer itself** | The runtime carries tokens and base component styles once for every element. | Wave 0. Today `packages/Angular/Generic/realtime-widget/scripts/build-global-styles.mjs` reaches into `dist/lib/_tokens.scss` from `ng-shared-generic` and `dist/lib/button/button.scss` plus `dist/lib/input/input-switch-progress.scss` from `ng-ui-components` by file path, because none of that SCSS is in the package exports. Wave 0 makes the token layer and base styles a first-class, exported output so the runtime consumes them instead of vendoring them. |
| **Package shape** | Forms stays at about 175 KB gzipped only because a build gate keeps MJ core out of it; joining the runtime must not make elements heavier. | D9 above. `ng-ui-components` is one `ngc` barrel (`main: dist/public-api.js`, `sideEffects: false`, no `exports` map, no secondary entry points). A tenfold catalog behind one barrel would land in every element's base layer. Wave 0 defines entry points or chunk boundaries with the Elements layering in mind. |

Two more things the Elements plan leaves to Lego:

- **Theming contract.** The plan lists `theme` and `theme-tokens` as shared element attributes and stops. Those are the system and instance scopes of §4; the semantic scope (a role or tone a composition names) is not mentioned. The Elements host contract should defer to this plan for what a theme is, rather than define one.
- **One catalog, not three.** The Elements manifest (tag, attributes, events, load policy), the UI overhaul proposal's generated `tokens.json` and `components.json` (not on `next` as of 2026-10-19), and Lego's machine-readable catalog describe the same components. They should be one generated artifact with three consumers. Plumbing; D11 settles who owns it: Matt owns the catalog's shape and Colin builds the generator (the unified plan's phase 3).

In the other direction, the Elements Phase 0 test page (several real elements on one plain HTML page that is not Explorer) is the same asset as Lego's wave 0 gate ("surface, layer, and row each rendered three radically different ways in a host that is not Explorer"). Build it once.

## 8. What MJ's nature adds

MJ is a platform that hosts other people's apps in the same DOM, so the right comparisons are platforms, not React libraries. Almost all of them split into a constrained native kit plus a sandboxed escape, then spent years pulling apps back from the sandbox.

From MJ's own guides: Explorer is the chassis, Open Apps install into it in-process, the schema policy is additive-only inside a platform era, and the UI guide's thesis is to solve UI once in the right layer and let everything above inherit. Its own named failure mode is a global stylesheet rebuilding what the library already ships because nobody found the components.

| Platform | Third-party UI gets | How they handled flexibility | What it cost |
|---|---|---|---|
| Salesforce (SLDS, Lightning) | Native web components in the shell | SLDS 1 was global CSS and class names became the API. SLDS 2 rebuilt it as styling hooks: per-component custom properties with global defaults | A decade of apps against class names and a migration still running |
| Shopify (Polaris, App Bridge) | Embedded apps in an iframe, or UI Extensions with a locked set | Extensions deliberately give less flexibility to keep the admin coherent. Tokens only. Full freedom means the iframe | Nothing in an iframe inherits anything |
| Atlassian (Forge) | UI Kit, small and declarative, or Custom UI in an iframe | Same split, drawn harder | Most serious apps chose Custom UI. Years spent adding flexibility back to UI Kit |
| Microsoft 365 (Fluent 2) | Add-ins in iframes, Fluent for the chrome | Slots: every component is a map of named parts you can replace, reorder, or null out. The strongest precedent for Lego's parts | Griffel is a heavy ask. Add-ins mostly don't adopt Fluent |
| SAP (UI5 web components) | Shadow DOM components with parts and theme parameters | A clean three-rung ladder | Shadow DOM makes host-wins nearly impossible. Consumers fork |
| WordPress (Gutenberg) | Blocks in the same DOM, like MJ | theme.json as a declarative style layer, block supports as exposed values | Years of editor-vs-front-end mismatch, because the same DOM with no contract becomes a specificity war |
| Grafana, Backstage | Plugins in the same React tree | A mandatory themed library, enforced by review | Works only because there is a gate |

Platform comparisons are from general knowledge of those systems, not fetched pages, and should be read as approximate.

**Why MJ can't copy the split.** Open Apps don't get a sandbox. MJ's custom tier is already bespoke Angular next to platform Angular, which is the 1,282 components the August proposal counted. The native tier has to be flexible enough the first time, which is why the series insists on gravity over gates: there is no fence to put a gate in.

**The mechanics have precedent everywhere.** Bootstrap 5.2 shipped per-component CSS variables defaulting to global ones in a minor release with no rendering change. Shoelace and Web Awesome publish a small stable set of `::part()` names. GitHub's Primer moved to cascade layers so consumer CSS wins without specificity games. Angular Material and PrimeNG both ship with view encapsulation off. MUI, Mantine, and Panda let a consumer add a variant name in the theme, not the component. Shopify publishes agent-readable Polaris docs and an MCP server so AI-written code reaches for the library, which is the one direct precedent for Lego's agent instructions and the only part of this nobody had when they built their systems.

**Three conclusions.** Encapsulation off plus a CSS layer for primitives is the baseline MJ skipped, not a risk. Lego's component contracts adopt the same additive-within-an-era discipline the OpenApp schema policy uses (stricter than OpenApp's minor-version rule for code), which also answers the LXP pin. And no sandbox tier, on purpose: MJ's answer to "the kit isn't flexible enough" is to fix the kit, never to offer an iframe.

## 9. Phases

The phases are the unified plan's now. This plan's original phases 0 to 5 used the same numbers for different work, so they are retired here; [UNIFIED_PLAN.md](UNIFIED_PLAN.md) has the full checklist for each phase. Lego's lane, in the unified plan's numbers:

| Phase | Lego's work in it |
|---|---|
| 0 | The wave 0 spec (PR [#6674](https://github.com/MemberJunction/MJ/pull/6674)): token layers, scales, the layer service and announcer on CDK, surface, layer, row, package shape. Cascade layer order, the visual regression harness, and the prototype gate (PR [#6673](https://github.com/MemberJunction/MJ/pull/6673)): surface, layer and row rendered three radically different ways in a host that is not Explorer, which doubles as the Elements Phase 0 test page (§7). Naming is settled in [NAMING.md](NAMING.md). |
| 1 | None. Phase 1 is Colin's metadata and IA work and runs at the same time as phase 0. |
| 2 | Waves 1 and 2 in parallel (D8). Each primitive lands with its first conversions in the same PR (§4, rule 2), with named parts in place of the generic slot. Codemods arrive with the first high-count conversion. Nothing ships to `ng-ui-components` before the prototype gate passes. |
| 3 | Waves 3 and 4 (the seam table spans waves 1 to 4 over phases 2 and 3), when-to-use guidance, visual regression against the gallery, and the gallery itself inside Theme Studio, shared with Colin on the one catalog (§7). |
| 4 | None. Phase 4 is Colin's runtime, access and header controls work. |
| Later | Compositions as they recur (wave 5+), and the Claude Design system sync once component values exist (§5). |

## 10. Out of scope

- Changing what any Explorer surface does. Lego changes what it is built from.
- A sandboxed tier of any kind. See §8.
- Visual redesign. Every exposed value defaults to what renders today; nothing renders differently until someone chooses to change it. The intentional visible changes the unified plan lists for wave 0 (on desktop the medium button from 44 to 40, inputs and dropdowns from 38 to 40, the view toggle from 28 to 32; dialogs, sheets, slide panels and windows one step lighter in the dark theme) are those choices, called out in the wave 0 spec rather than shipped as silent defaults.
- The Elements loader, runtime, page session and host contract, which belong to the MJ Elements plan (PR [#5903](https://github.com/MemberJunction/MJ/pull/5903)). Lego owns only what §7 names.
- The LXP upstream proposals series (P1 to P19), which is separate work; P6 and P7 are the surviving written form of the thinking in §2.

## 11. Sources

The August artifacts linked in §2. The Lego Foundation demo (§5.1). Repo measurements re-run 2026-10-19 against `origin/next` at `f95b0447c5` with the commands shown in §3; the brief's 2026-10-13 figures were taken at `72e2685f30`. LXP measurements from `Sidecar-Learning-Hub` at `c3ddda402` with worktrees excluded. MJ's self-description from `README.md`, `guides/BUILDING_APPS_ON_MJ.md`, `guides/BUILDING_UI_ON_MJ.md`, `packages/OpenApp/README.md`, and `packages/OpenApp/PUBLISH_NO_BREAK_POLICY.md`. The Project Lego Brief (Claude Doc, 2026-10-14) is the immediate source of this file. Every decision marked decided in §6, the seam table in §6.1 and the phases in §9 come from [UNIFIED_PLAN.md](UNIFIED_PLAN.md) and [NAMING.md](NAMING.md).
