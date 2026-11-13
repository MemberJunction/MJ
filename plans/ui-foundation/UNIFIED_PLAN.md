# MJ UI Unified Plan: Lego + Explorer Overhaul

Agreed by Matt Chriest and Colin Brockman on 2026-11-09, from the 2026-11-03 planning meeting with Amith and Robert. Working copy: [Claude Doc](https://claude.ai/artifact/VCNzjhfWRxvKw4RXKtrCKi). This file is the version of record once merged.

## Why one plan

On 2026-11-03 Amith asked Colin and Matt to merge the Explorer UI/UX Overhaul (Colin, Sept 2026) and Project Lego (Matt, PR [#5911](https://github.com/MemberJunction/MJ/pull/5911)) into one plan over the next couple of weeks. This document is that plan: one set of principles, the decisions already made, a seam table that says which plan owns each piece, and five phases with owners.

The two plans split cleanly. The overhaul changes what Explorer does for users: how apps are found, what the homepage shows, what a tenant can theme, what a user can hide. Lego changes what Explorer is built from: the primitives, tokens and gates that every Explorer surface, every MJ app and every Angular Element share. They overlap on three things only: the token layer, the component control surface (overhaul WS6, Lego wave 0), and the kit gallery plus CI gate (overhaul WS5, Lego's catalog tooling). Those three are the seams this plan settles.

## Principles both plans already share

Both plans were written under the same rules; this list just puts them in one place so every later decision can point at a number.

1. Name things for what they are. A primitive is defined by what it is, not what it contains. Naming has to be inferable: a developer or an agent who learns one name should guess the next one correctly (Robert, 2026-11-03).
2. Expose every value, defaulting to today. Nothing renders differently until someone chooses to change it. Opinions move up into named compositions.
3. Every closed list is a wall unless it is a set of defaults over an open axis. Roles, tones, parts, categories and density scopes are open names with shipped defaults.
4. Metadata must do something. If a developer can declare it (a nav child, a category), the framework renders it; metadata that nothing reads is debt (Amith, 2026-11-03).
5. Never build the same primitive twice. Before building, study what MJ already has: Form Studio, component spec, metadata dashboards, the authorizations engine, UserInfoEngine settings.
6. Bring patterns home when they repeat; give apps an approved, non-breaking pathway when they don't. A framework that does everything does nothing.
7. Host wins by construction. The escape-hatch ladder is a value, then a named part, then host CSS that always wins, then copy the composition. The rung someone had to use is telemetry for a missing value.
8. Every primitive ships with its first conversions in the same PR, or it doesn't ship.
9. Enforcement is deterministic. A gate in CI, not a review comment, is what keeps the system consistent once agents write most of the UI.
10. Performance is a gate, not a phase. Warm shell load stays at 500 to 700 ms; a deep link opens in about a second; every new indirection has to earn its cost.

## Decisions already made

These are settled. Each row names where it was decided so nobody reopens it by accident.

| Decision | Outcome | Where |
| --- | --- | --- |
| Encapsulation and CSS layers (Lego D1) | Primitives ship with Angular's emulated encapsulation off, a class prefix so names do not collide, and all of their CSS in a named `@layer`, so host CSS wins by construction. Prefix and layer do different jobs, so it is both. This is a new pattern: `mj-realtime-widget` turns encapsulation off and prefixes its classes (`.mjw-`), but only its generated global defaults sit in a layer. | Lego, decided Oct 2026 |
| Open axes (Lego D2) | Roles and tones map to variables at runtime so a brand can add its own; unknown names fall back to the author's explicit emphasis. | Lego |
| Package shape (Lego D9) | Secondary entry points or chunk boundaries per primitive family, decided in wave 0 before the catalog grows. | Lego |
| App categories | A hierarchical `MJ: Application Categories` entity with an `ApplicationCategoryID` FK on Application, rank for display order, per-user order on top. Not a text `Category` column. | Meeting 2026-11-03 (Amith, Matt) |
| Nav `Children` | Recursive nav items in the strongly typed interface. The framework renders level 1 as the top bar, level 2 as a side rail, level 3 as tabs, so dashboards stop hard-coding rails. | Meeting 2026-11-03 |
| URLs | Backwards compatible from here. A breaking change ships with a URL mapping layer. | Meeting 2026-11-03 |
| Elevation ramp | Ramp B (soft), ambient off by default, Montserrat as the one heading face. Ships with its contrast table as the contract. | Mockup review 2026-09-18 (Matt) |
| Control heights and density | One scale with three steps: `--mj-control-height-sm` / `md` / `lg` at 32 / 40 / 52, with sm and md at 44 on touch. This replaces both earlier sets of numbers, the 32 / 44 / 52 from the September mockup review and the five-step 28 / 32 / 38 / 44 / 52 proposal. Density is the same axis, not a second set of numbers: it is the user preference that picks which step controls default to. Details in [NAMING.md](NAMING.md). | Naming review 2026-11-10 (Matt, Colin) |
| Dialogs and sheets | Slide-outs for heavy configuration, dialogs for simple prompts. On phones a dialog becomes a bottom sheet or full screen. | Meeting 2026-11-03 (Matt); shipping in custom-forms-phone-layout |
| Button order | The affirmative button (Yes, OK, Submit) goes on the left and the decline button (Cancel, No) to its right, everywhere: dialogs, modals, popovers and action button groups. This is the Windows order, and it is already the rule in `packages/Angular/CLAUDE.md`. Not part of the overhaul's scope. | Amith, PR review 2026-11-09 |
| App builder (WS7 builder) | Study Form Studio, Form Builder, component spec and metadata dashboards before building. No build until demand is shown. | Meeting 2026-11-03 (Amith) |
| Kit gallery, token index, CI gate | Yes from everyone. Includes when-to-use guidance with positive and negative examples, written for agents as much as people. | Meeting 2026-11-03 |
| Angular Elements | Everything in both plans must work inside an Angular Element on a host page (Grace, LXP checkout). | Meeting 2026-11-03 (Amith) |

## Seam table: who owns what

Every overhaul workstream lands in exactly one place: Colin's, Matt's, or a shared seam with a named contract between them. Overhaul numbering is Colin's v3 proposal; the Lego column is the wave or section of PR #5911 that touches the same ground.

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

| Lane | Phase 0 | Phase 1 | Phase 2 | Phase 3 | Phase 4 |
| --- | --- | --- | --- | --- | --- |
| Matt (Lego) | Wave 0 spec, cascade layers, prototype gate, naming | | Waves 1 and 2 primitives with first conversions, named parts | Guidance content, visual regression | |
| Colin (overhaul) | WS6b ramp tokens, WS4 contract fixes | Categories entity, nav children, Home chips, URL compatibility | Theming additions on ThemeEngine | Catalog generator, CI gate, adoption script, gallery surface | Settings namespace, access map, header controls, UX preferences |
| Shared | Ownership written down | | Per-component variables land on the primitives | One catalog drives gallery, gate and adoption | |
| Gate | Prototype gate | | First conversions | Gate replaces `check:ui` | |

Matt's lane is Lego, Colin's is the overhaul, and the shared lane is the seams. Phases 0 and 1 run at the same time; nothing in phase 2 ships to `ng-ui-components` until the prototype gate passes.
## Phase 0: foundations and the two open decisions

Phase 0 ends when the wave 0 spec is written, the prototype gate passes, and the two naming decisions below are settled. Nothing here is visible to users; all of it is what phases 1 to 4 build on.

- [ ] Wave 0 spec in Angular terms: token layers, scales, the layer service and announcer on CDK, surface, layer, row, package shape (Matt)
- [ ] Cascade layer order declared before any component moves to `@layer`: resets first, then foundation, then primitives. Unlayered Explorer globals in `explorer-app/_common.scss` (input border colors, heading margins) move into the reset layer or they will override every layered primitive (Matt)
- [ ] Visual regression harness lands before the first conversion (Matt)
- [ ] Prototype gate: surface, layer and row rendered three radically different ways in a host that is not Explorer. The host page doubles as the MJ Elements Phase 0 test page (Matt)
- [ ] WS6b tokens: surface and elevation ramp B, control-height scale 32 / 40 / 52 with sm and md at 44 on touch, surface levels mapped per [NAMING.md](NAMING.md), ambient layer off by default, dark text tiers re-declared on elevated surfaces. Ships with the contrast table (Colin)
- [ ] Intentional visible changes called out in the wave 0 spec, not shipped as silent defaults: on desktop the medium button goes from 44 to 40 and inputs and dropdowns from 38 to 40, the view toggle goes from 28 to 32, and dialogs, sheets, slide panels and windows get one step lighter in the dark theme when they move to the overlay surface (Matt)
- [ ] WS4 contract fixes: Font Awesome from npm, Montserrat as the one heading face with Ubuntu removed, card-grid hex to tokens, in `explorer-app` (Colin)
- [x] Naming decision written up in [NAMING.md](NAMING.md): public values `--mj-<component>[-<variant>][-<part>]-<property>[-<state>]`, private variables under `--_mj-`, default chain component value, then role token, then scale token (Matt wrote it, Colin reviewed and agreed 2026-11-09 and 2026-11-10)
- [ ] Ownership decision (Lego D11) written down: Matt owns the component contract, catalog and names; Colin owns Explorer IA, Home and runtime; the token mechanics are shared under the two principles (Matt and Colin confirm, Amith and Robert see it)

## Phase 1: metadata and IA

Phase 1 is Colin's and runs in parallel with Phase 0, because none of it waits on primitives. It ends when apps are grouped by category, nav children render without hand-coded rails, and the homepage chips are clickable and configurable.

- [ ] Migration: `MJ: Application Categories` entity (hierarchical, Rank), `ApplicationCategoryID` on Application, per-user order kept in UserInfoEngine settings (Colin)
- [ ] Seed categories Work, Data, AI, Build, Admin as defaults; categories stay an open list (Colin)
- [ ] `Children` on the nav item interface, recursive; framework renders level 2 as a side rail and level 3 as tabs, replacing the hard-coded rails in dashboards one at a time (Colin)
- [ ] Launcher and header group by category; alphabetical and custom order stay available (Colin, Matt reviews the UX)
- [ ] Homepage chips: clickable, user-configurable, defaults from the first nav items; recents and in-app click tracking considered for smart defaults, with a guard against things moving unexpectedly (Colin)
- [ ] URL compatibility check: every route touched keeps working or gets a mapping (Colin)
- [ ] Usability pass with non-technical users (account directors, customer success, the Betty team) before the category UI ships (Matt runs, Colin observes)

Parked: app color tied to category. Amith wants color to carry a different dimension than grouping; decide when the category UI is testable.

## Phase 2: primitives, exposed values and theming

Phase 2 is where WS6a and Lego waves 1 and 2 become one stream. It ends when the top ten components expose their values through the Lego contract and the first conversions have landed in Explorer.

- [ ] Waves 1 and 2 in parallel (Lego D8): badge, metric, card, stat tile, icon; dialog re-based additively, sheet, panel, popover, menu, tooltip, toast, confirm. Each PR carries its first conversions (Matt)
- [ ] WS6a per-component variables land as exposed values on those primitives, under the Phase 0 naming rule, so nothing Colin already wrote for Betty is lost (Colin lists them, Matt lands them)
- [ ] Generic typed slot becomes named parts on the primitive; the five slot systems in the tree (chat, form panel, card-grid, accordion, login) converge on parts plus one region-override directive, one per release (Matt)
- [ ] Theming additions from overhaul screen 3: type scale splits for subsections, theme-carried settings, ambient as a theme value (Colin, on ThemeEngine seeds)
- [ ] Dialog and sheet rule enforced in the primitives: heavy configuration opens a sheet, simple prompts a dialog, dialogs collapse to sheets on phones (Matt)
- [ ] Codemods with the first high-count conversion (Matt)
- [ ] Angular Elements check: `mj-realtime-widget` rebuilt on wave 0 tokens and base styles instead of vendoring SCSS by file path (Matt, with the Elements owners)

## Phase 3: gallery, index and gate

Phase 3 makes the system inspectable and enforceable. It ends when one machine-readable catalog drives the gallery, the CI gate and the adoption numbers, and an agent can read when to use what.

- [ ] One catalog: `tokens.json` and `components.json` generated from the primitives themselves, replacing the three catalogs that exist today (Colin builds the generator, Matt owns the shape)
- [ ] CI gate: unknown token, unknown component and literal-color checks on changed files, replacing `check:ui`; the ghost-token allowlist ratchets down with a named owner (Colin)
- [ ] Adoption: `measure-ui-adoption.sh` reads the catalog, so markers stop under-counting (Colin)
- [ ] Kit gallery inside Theme Studio: every primitive, every variant, every token behind it, editable live. The wave 0 prototype is page one (Colin + Matt)
- [ ] When-to-use guidance per primitive with a positive and a negative example, written so Claude reads it before building UI (Matt writes, Robert reviews)
- [ ] Visual regression runs against the gallery, so a token change shows every affected component at once (Matt)

## Phase 4: runtime, access and header controls

Phase 4 is WS3 with the two conditions Amith added. It ends when an app can hide or re-arrange shell pieces through metadata instead of CSS, and "what can this user see" is one query.

- [ ] Governed namespace for user setting keys: a registry of known keys, their scope and their default, instead of free strings (Colin proposes, Amith reviews)
- [ ] Access map built on the authorizations engine, not a parallel permissions check; one query answers apps, nav items and header pieces (Colin, with the authorizations engine owner)
- [ ] Header controls: search, notifications, app switcher and theme toggle become scoped shell config an app or a user can turn off. LXP and Betty both hide these with CSS today; both move to the config (Colin, Matt converts LXP)
- [ ] UX preferences: per-user density (picks the default control-height step, adds no new sizes), default landing, chip set, stored through UserInfoEngine (Colin)
- [ ] Settings inspector: a page where a user sees their stored settings and can reset to defaults (Colin)
- [ ] Per-user sitemap and scoped shell config for tenants, on top of the access map (Colin)

## Later, or study first

These were raised on 2026-11-03 and are not scheduled. Each has a first step that costs nothing but reading.

| Idea | First step | Who |
| --- | --- | --- |
| App builder (WS7) | Read Form Studio, Form Builder, component spec and metadata dashboards; write one page on what they already cover and what is left | Colin |
| Explorer deconstruction (auth, first-paint bundles as a reusable layer) | Wait for D9 entry points; then list what an outside Angular app would import | Open |
| Onboarding tours (Appcues-style, metadata-driven, tracked per user) | Betty prototype first; bring home when a second app wants it | Colin |
| Theme from a customer URL | Already partly in Betty; evaluate as a Theme Studio agent skill | Colin |
| Persona palettes | After the gallery exists; needs user research before design | Matt |
| Homepage as information, not navigation | Metadata dashboards on Home; Robert's ask | Colin |

## Standing gates

These apply to every phase and every PR from either plan. A PR that fails one does not merge, whoever wrote it.

| Gate | What passes | How it is checked |
| --- | --- | --- |
| Angular Elements | The change works inside an Angular Element on a host page: light DOM, named `@layer`, no reliance on emulated encapsulation, fonts and icons render, overlays open | The Phase 0 host test page, run in CI once it exists; until then a manual check on `mj-realtime-widget` |
| Performance | Warm Explorer shell in 500 to 700 ms; a deep link to a record in about a second; no new `RunView` outside an engine; no new metadata read without a cache | The over-the-wire integration tier Amith added; a Lighthouse run on Home before and after |
| Accessibility | WCAG 2.1 AA: contrast per the ramp table, focus visible on every interactive primitive, 44 px targets on phones, announcements for pickers and toasts | Automated checks in the gate; Matt's audit on each wave before it ships |
| Design standard | Tokens only, no literal colors; `mjButton`, not bespoke buttons; the dialog and sheet rule; the naming rule | The Phase 3 CI gate; Matt's review blocks on shared components and accessibility, advises elsewhere |
| Research | A user-facing change to Explorer's IA, Home or shell is tried with non-technical users before it ships | Matt schedules the session; account directors and customer success first |
| No duplicate primitives | A new component or metadata construct names what it checked for first (Form Studio, component spec, dashboards, authorizations engine, UserInfoEngine) | One line in the PR description |

## Decisions from the Nov 9 sync

Five things the Nov 3 meeting left to Matt and Colin, settled on the Nov 9 sync. These are decisions now, not proposals.

| Question | Decision (Matt + Colin, 2026-11-09) | Why |
| --- | --- | --- |
| Per-component variables or scale tokens only? | Both, in a chain. A component reads `--mj-button-radius`, which defaults to a role token `--mj-radius-control`, which defaults to the scale `--mj-radius-md`. Per-component deviation stays available and is the last resort, not the first move. | Perceived consistency beats literal consistency: a control and a container at the same radius look wrong because the inner corner should be smaller. The role layer is where the system's opinion lives; the component layer is the escape hatch. Principle 2 and principle 7. |
| Who names things? | Matt writes the naming convention, Colin reviews it. Draft: [MJ UI Naming Convention](https://claude.ai/artifact/To8QVLiCRHssdhbMhBcpLp). Public: `--mj-<component>[-<variant>][-<part>]-<property>[-<state>]`. Private: `--_mj-`. Names are full words, never abbreviations. | Two authors produce two dialects. One namer plus a reviewer keeps every name guessable from the last one, which is what lets a person or an AI pick the right token without reading the stylesheet. Principle 1. |
| Is the generic typed slot (WS6a) still the shape? | No. Named parts, each optional and order-free, plus one region-override directive shared by every component. The surface is separated from its content: a card can be an agent card, a contact card, or anything else. The five existing slot systems converge on this as their hosts are converted. | A generic slot would be a sixth slot system. Named parts collapse the five, and the index can then show how parts are actually used. Colin: nothing from the original proposal is lost by the swap. |
| Where does the gallery live? | Inside the Theme Studio app as a tab, on the one catalog. Theme Studio gets a broader name, since "theme" undersells what it holds (UI Kit and Component Viewer were floated; Colin brings options, Matt and Colin pick one). | One place to configure UI (Amith). A random developer would not look under "theme" for a component gallery. |
| What does Colin build while wave 0 is being specified? | Phase 1 (categories, nav children, Home), the WS4 contract fixes and the WS6b ramp mechanics start now. The only dependency is the naming convention, which gates the token index. Wave 0 runs in parallel; the streams meet at the first conversions. Coordination: a 15-minute check-in Mondays at 11:15 after the team huddle, cancelled freely when there is nothing to report. | Keeps both streams moving and lands visible change first (Lego D8's reasoning). No deadlines imposed on each other; the check-in is there so nothing slips. |

## Next steps

- [x] Matt and Colin walk this document together and settle the five open questions (done 2026-11-09)
- [ ] Matt sends the naming convention for Colin's review; agreed version lands beside this plan
- [ ] This plan lands in the repo as `plans/ui-foundation/UNIFIED_PLAN.md` on its own PR, co-authored, reviewers Colin and Amith, Robert on the gates
- [ ] Lego README (PR #5911) updated: D1 marked decided, D10 answered as "one stream, split per the seam table", D11 answered as above, seam table added as a section
- [ ] Colin's overhaul plan updated to point at this document for WS5, WS6 and WS7, with the app builder marked study first
- [ ] Theme Studio renamed; Colin proposes options
- [ ] Weekly Monday 11:15 check-in on the calendar
- [ ] Amith and Robert see the agreed version; Robert reviews the gates
- [ ] Phase 0 and Phase 1 start the same week

### Links

- Project Lego: [PR #5911](https://github.com/MemberJunction/MJ/pull/5911), with Amith's signals and compositions proposal in [PR #6181](https://github.com/MemberJunction/MJ/pull/6181)
- MJ Elements: [PR #5903](https://github.com/MemberJunction/MJ/pull/5903) (plan) and [PR #5916](https://github.com/MemberJunction/MJ/pull/5916) (Phase 0 test page)
- Naming convention: [NAMING.md](NAMING.md)
- Guides: `guides/UI_LAYERING_GUIDE.md`, `guides/BUILDING_UI_ON_MJ.md`, `.claude/rules/design-tokens.md`
- Meeting: UI/UX Discussion (Plan + Realtime), 2026-11-03, Teams transcript
- Mockup review and ramp B contrast table: 2026-09-18 notes from Matt to Colin
