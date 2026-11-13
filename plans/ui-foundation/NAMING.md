# MJ UI Naming Convention

Written by Matt Chriest. Colin Brockman reviewed the draft on 2026-11-09 and agreed the seven open calls, then on 2026-11-10 agreed the five changes made after that review. The three surface decisions in tier 2 (overlays sit on elevated, sunken has no state tokens, card is a fill and not a level) are Matt's calls, made after Colin's second pass. Working copy: [Claude Doc](https://claude.ai/artifact/To8QVLiCRHssdhbMhBcpLp). This file is the version of record once merged. Companion to [UNIFIED_PLAN.md](UNIFIED_PLAN.md).

The convention every public CSS custom property, named part and region in the MJ UI kit follows, so one name predicts the next.

## Why this shape

Three reasons, strongest first.

1. **MJ already does this for color.** `--mj-text-muted`, `--mj-bg-surface-elevated` and `--mj-border-focus` each name a purpose, default to a palette value, and are what components actually use. That is a role tier in everything but name. This convention extends the same pattern, in the same word order, to radius, height and shadow. Nothing to relearn.
2. **It is the standard shape for design tokens.** Raw values, then purpose-named aliases, then component-specific tokens is how Material 3, Adobe Spectrum and Salesforce Lightning structure theirs, and the W3C Design Tokens format is built around the same aliasing. The vocabulary differs; the three tiers don't. We are using MJ's existing words for a structure everyone else converged on.
3. **Name the purpose, not the look.** `--mj-radius-control` stays true whether a theme makes controls square or pill. `--mj-radius-rounded` lies the moment a theme changes. Purpose names are what let Theme Studio change values without renaming anything, and what let a host app say "all my controls are pills" in one line.

The role lists are short because they follow how a person sees the screen, not how the code is organized: things you act on, things that hold content, things floating above the page, things that are round because of what they are. Similar values group elements into one family; a step change separates layers. There are only so many layers in a UI, so there are only so many roles.

## The pattern

Every public name is `--mj-` + full words, kebab-case, general to specific, property before state. If you know one name you can guess the next one without opening a file.

```
--mj-<component>[-<variant>][-<part>]-<property>[-<state>]
```

Three tiers, each defaulting to the one above it. A component token points at a role token, a role token points at a scale token. Override at whichever tier matches how wide you want the change.

| Tier | Shape | Example | Changing it moves |
| --- | --- | --- | --- |
| Scale | `--mj-<family>-<step>` | `--mj-radius-md` | everything that resolves to that step |
| Role | `--mj-<family>-<role>` | `--mj-radius-control` | every component in that role |
| Component | `--mj-<component>-<property>` | `--mj-button-radius` | that component only |

```css
/* scale, defined once */
--mj-radius-md: 8px;

/* role, defaults to a scale step */
--mj-radius-control: var(--mj-radius-md);

/* component, unset by default, falls back to its role */
.mj-btn { border-radius: var(--mj-button-radius, var(--mj-radius-control)); }
```

Why the component token is unset instead of declared on `:root`: a CSS custom property resolves where it is declared, not where it is used. If `:root` declared `--mj-button-radius: var(--mj-radius-control)`, a host that sets `--mj-radius-control: 999px` on a `.pill-toolbar` container would not affect the buttons inside it, because the button token already resolved at `:root`. Leaving it undefined means the fallback resolves on the button element itself, so container-scoped role overrides work. This is the one line of the architecture that everything else depends on. The same mechanics make scale tokens theme-level knobs: a role resolves where it is declared, at `:root`, so changing `--mj-radius-md` on a container does not move the roles inside it. Inside a container, override the role or the component token.

## Tier 1: scale tokens

Shape: `--mj-<family>-<step>`. One family per CSS property group, one step per value on the scale. These already exist in `packages/Angular/Generic/shared/src/lib/_tokens.scss` (303 tokens, 386 declarations counting the dark-theme overrides) and keep their names.

| Family | Steps today | Note |
| --- | --- | --- |
| `radius` | none, sm, md, lg, xl, 2xl, full | 0 / 4 / 8 / 12 / 16 / 24 / 9999px |
| `space` | 0, px, 0-5, 1, 1-5, 2 ... | numeric steps, Tailwind-style |
| `text` | xs, sm, base, lg, xl, 2xl ... 6xl, display | font-size scale, 12px to 80px. Shares the `text` word with the color roles in tier 2 (`--mj-text-muted`), see note below |
| `shadow` | none, sm, md, lg, xl, 2xl, inner |  |
| `color` | brand-50 ... brand-900, neutral-..., etc. | raw palette, never used directly by components |
| `font` | family, family-mono, normal, medium, semibold, bold | weights and faces share a family today (see Resolved on Colin's review) |
| `leading` | none, tight, snug, normal, relaxed, loose | line-height |
| `tracking` | tighter, tight, normal, wide, wider | letter-spacing |
| `z` | base, dropdown, sticky, fixed, modal-backdrop, modal, popover, drawer, dialog, toast, tooltip |  |
| `transition` | fast, base, slow, colors |  |
| `ring` / `focus-ring` | width, offset, color / the composed box-shadow | focus ring pieces and the assembled ring |

Note on `text`: in tiers 1 and 2 the word is overloaded. `--mj-text-sm` is a size, `--mj-text-muted` is a color. That is existing and stays. To keep tier 3 unambiguous, component tokens use `text` for color only and `font-size` for size: `--mj-input-text` is a color, `--mj-input-font-size` is a size.

Rules for the scale tier:

- Steps are t-shirt sizes (`sm md lg`) or a numeric scale (`space-2`), never the value (`--mj-radius-8` is wrong: change the value and the name lies).
- A new step is added only when a real component needs it and no existing step fits. Today 6px and 10px radii are hand-written 600+ and 380+ times with no step between sm (4) and md (8) or md and lg (12). That is a decision for the gate burn-down, not a reason to add steps now.
- Components never reach into `color-*` directly. They use a role token (next tier).

## Tier 2: role tokens

Shape: `--mj-<family>-<role>`. A role names what the value is for, not what it looks like. Every component defaults to exactly one role per property, in every family that has roles. Roles are a short list; if a component fits none of them it is probably two components.

Color already has roles. They just weren't called that:

| Family | Existing roles | Pattern |
| --- | --- | --- |
| `text` | primary, secondary, muted, disabled, inverse, link | `--mj-text-<role>` |
| `bg` | page, surface, surface-elevated, surface-sunken, surface-card | `--mj-bg-<role>` |
| `border` | default, subtle, strong, focus, error | `--mj-border-<role>` |
| `brand` | primary, secondary, tertiary, accent, on-primary | `--mj-brand-<role>` |
| `status` | success, warning, error, info (+ -bg, -text, -border) | `--mj-status-<role>-<property>` |

New in wave 0, the radius roles:

| Role | Defaults to | Covers |
| --- | --- | --- |
| `--mj-radius-control` | `--mj-radius-md` | buttons, inputs, selects, textareas, toggles, segmented controls |
| `--mj-radius-surface` | `--mj-radius-lg` | cards, panels, wells, sections, tiles |
| `--mj-radius-overlay` | `--mj-radius-lg` | dialogs, sheets, popovers, menus, toasts |
| `--mj-radius-pill` | `--mj-radius-full` | chips, badges, status dots, avatars, toggle thumbs |

Roles for other families get added the same way, when the first component that needs them is converted, never ahead of it:

- `--mj-control-height-<step>`: sm 32, md 40, lg 52 on desktop. This one is a scale, not a role: the steps are t-shirt sizes and hold values directly. It is listed here because it is new in wave 0. Under `pointer: coarse` sm and md both become 44, set on the token itself, so inputs get the touch target too, not only buttons, and the override leaves button.scss. Three steps ship; xs and xl are added only when a component needs them, and never for something people tap: 44px is the touch bar this kit holds (WCAG 2.5.5; the 2.5.8 floor in WCAG 2.2 is 24px). Family is control-height, spelled out, never h. Why 40: today inputs and dropdowns are 38 and the medium button is 44, so a button beside a search box never lines up. One shared token fixes that by construction, and 40 is where desktop density and touch targets both get what they need. This is an intentional visible change, not a silent default: on desktop the medium button goes from 44 to 40, inputs and dropdowns go from 38 to 40, and the view toggle goes from 28 to the sm step at 32 so it lines up with page search and the filter popover in the same toolbar. On touch, buttons stay at 44 and inputs rise to 44.
- `--mj-shadow-<role>`: surface, overlay, raised (the elevation ramp).
- `--mj-space-<role>`: control-padding, surface-padding, stack-gap, inline-gap. Only if the space scale alone proves too loose in practice.

Surfaces are roles too, not components. A surface level is a context content sits on, not a thing you place, so surface tokens live in this tier: `--mj-surface[-<level>]-<role>[-<state>]`. The role slot is the tier 2 token tail the surface re-points for its children, and state is last, same as everywhere else. Leave the level out when the token applies to every level.

| Token | What it does |
| --- | --- |
| `--mj-surface-elevated-bg-hover` | background of an elevated surface on hover |
| `--mj-surface-base-border-selected` | border of a selected base surface |
| `--mj-surface-elevated-text-muted` | what `--mj-text-muted` resolves to inside an elevated surface |
| `--mj-surface-text-muted-selected` | muted text inside a selected surface at any level |

Keeping these here, not in tier 3, is what lets `text-muted` and `text-link` stay role names instead of leaking into the component property vocabulary.

There are four levels. Each has a background token that defaults to an existing `--mj-bg-*` token, so there are two names at most and never two values:

| Level | What it is | `-bg` defaults to | `-bg-hover` defaults to |
| --- | --- | --- | --- |
| `sunken` | a well that content sits in | `--mj-bg-surface-sunken` | none (no state tokens) |
| `base` | the default surface | `--mj-bg-surface` | `--mj-bg-surface-hover` |
| `elevated` | raised above base, still part of the page | `--mj-bg-surface-elevated` | `--mj-bg-surface-hover` |
| `overlay` | floats over the page: dialogs, sheets, popovers, menus, toasts | `--mj-bg-surface-elevated` | `--mj-bg-surface-hover` |

- **Which name to write.** The surface classes (`.mj-surface-base` and the other three) read the `--mj-surface-<level>-*` names, so that is the name to override inside a container. Existing code keeps `--mj-bg-surface*`. Nothing is renamed and there is no mass migration.
- **Why `base` is a word.** Today the default surface is plain `--mj-bg-surface`. It needs a level name so a card or panel nested inside a dialog can declare itself `base` and get its text and state tokens reset.
- **Overlay is the panel, not the scrim.** `--mj-surface-overlay-bg` is the opaque dialog or drawer. `--mj-bg-overlay` stays what it is today, the translucent backdrop behind it.
- **Overlays sit on elevated.** In the light theme base and elevated are the same white, so nothing moves. In the dark theme elevated is one step lighter than base, so dialogs, bottom sheets, slide panels and windows get one step lighter when they are converted. Menus, dropdown panels and the datepicker are already there. This is an intentional visible change. Shadows barely read on a dark background, so height is shown by lightness: the higher the surface, the lighter it is. Overlay keeps its own name so a theme can lift it above elevated later. Check at conversion: dialog and window title bars and the inputs inside dialogs are painted with `--mj-bg-surface-card`, which in dark sits below elevated, so they will read darker than the body around them instead of lighter.
- **Sunken has no state tokens.** A sunken surface is a well, something content sits in, and a well is not something you click. Hover, active and selected exist for base, elevated and overlay only. If a thing in a well is interactive it is a control or a base surface sitting in the well, and it brings its own hover. A state token with no level, such as `--mj-surface-text-muted-selected`, covers those three. This also closes a real hole: in the light theme `--mj-bg-surface-sunken` and `--mj-bg-surface-hover` are the same gray, so a shared hover on a sunken surface would not show at all.
- **Card is not a level.** `--mj-bg-surface-card` keeps its name and its value. It is a fill, not a context: today it paints cards and also chips, tab bars, the view toggle, stat badges, and dialog and window title bars. `--mj-card-bg` defaults to it. For token re-pointing a card sits at the base level.

Rules for the role tier:

- A role defaults to a scale step, never to a literal value.
- A role name is a noun for the thing (`control`, `surface`), not an adjective for the look (`rounded`, `soft`).
- Four or five roles per family is the ceiling. Twelve roles is the component tier wearing a hat.

## Tier 3: component tokens

Shape: `--mj-<component>[-<variant>][-<part>]-<property>[-<state>]`. The component word is the component's own name without the prefix, whether it ships as a tag, a directive or a class (`mj-dialog` → `dialog`, `[mjButton]` → `button`, `.mj-input` → `input`, `mj-bottom-sheet` → `bottom-sheet`). Unset by default; each one falls back to a role token, or to a scale step where the family has no roles yet.

The slots, in order:

| Slot | Required | Values | Example |
| --- | --- | --- | --- |
| component | yes | the component word | `button`, `input`, `card`, `dialog` |
| variant | no | `primary secondary outline flat danger success warning icon` and sizes `sm md lg` | `--mj-button-primary-bg` |
| part | no | from the parts vocabulary (next section) | `--mj-card-header-padding` |
| property | yes | from the fixed list below | `bg`, `radius` |
| state | no | `hover active focus disabled selected checked error` | `--mj-button-primary-bg-hover` |

Property vocabulary. Fixed list; a new word needs a reason and goes in the index first.

| Word | CSS it sets | Why this word |
| --- | --- | --- |
| `bg` | background | matches 26 existing tokens and 8,700+ uses (`--mj-bg-*`, `--mj-status-*-bg`, `--mj-login-*-bg`); `fill` means SVG fill in CSS |
| `text` | color (of text) | matches `--mj-text-*` roles; never a size in tier 3 |
| `border` | border-color | matches `--mj-border-*` |
| `border-width` | border-width | so nobody invents `border-size` or crams `1px solid` into `border`; needed for 2px active indicators and borderless card modes |
| `radius` | border-radius | matches `--mj-radius-*` |
| `shadow` | box-shadow | matches `--mj-shadow-*`; a custom focus ring is `-shadow-focus`, no separate `ring` word |
| `height` | height / min-height | controls only |
| `width` | width / max-width |  |
| `padding` | padding (all sides, or -x / -y) | `--mj-card-body-padding-x` |
| `gap` | gap | between children |
| `font-size` | font-size | `--mj-chart-font-size` is the one existing precedent |
| `font-weight` | font-weight |  |
| `icon-size` | icon width/height |  |

Worked examples, with the default chain each one ships with:

| Token | Falls back to | Then to |
| --- | --- | --- |
| `--mj-button-radius` | `--mj-radius-control` | `--mj-radius-md` |
| `--mj-button-primary-bg` | `--mj-brand-primary` | palette |
| `--mj-button-primary-bg-hover` | `--mj-brand-primary-hover` | palette |
| `--mj-button-height` | `--mj-control-height-md` | 40px |
| `--mj-button-sm-height` | `--mj-control-height-sm` | 32px |
| `--mj-input-border-focus` | `--mj-border-focus` | palette |
| `--mj-card-radius` | `--mj-radius-surface` | `--mj-radius-lg` |
| `--mj-card-header-padding` | `--mj-space-4` | 16px |
| `--mj-dialog-radius` | `--mj-radius-overlay` | `--mj-radius-lg` |
| `--mj-dialog-header-bg` | `--mj-bg-surface-elevated` | palette |
| `--mj-filter-chip-radius` | `--mj-radius-pill` | `--mj-radius-full` |

```css
/* inside the primitive: every value exposed, defaulting to today */
.mj-btn {
  border-radius: var(--mj-button-radius, var(--mj-radius-control));
  min-height: var(--mj-button-height, var(--mj-control-height-md));
}
.mj-btn--primary {
  background: var(--mj-button-primary-bg, var(--mj-brand-primary));
}
.mj-btn--primary:hover {
  background: var(--mj-button-primary-bg-hover, var(--mj-brand-primary-hover));
}

/* a host app: pill buttons, nothing else moves */
[mjButton] { --mj-button-radius: var(--mj-radius-pill); }
```

Rules for the component tier:

- Deviate to a token, never a number. `--mj-filter-chip-radius` → `--mj-radius-pill` is fine. `→ 17px` is not. The gate catches literals in a default chain.
- One token sets one CSS property. No `--mj-button-style` that bundles three things.
- A variant or part is only in the name when the token differs by it. `--mj-button-radius` applies to all variants; there is no `--mj-button-primary-radius` unless primary buttons genuinely round differently.
- State is always last. `-bg-hover`, never `-hover-bg`. Matches `--mj-brand-primary-hover`, `--mj-bg-surface-hover`.
- States are a closed list of seven, and three are easy to mix up. `selected` is an item picked from a set (a tab, a row, a card). `checked` is a control's own on or off value (a switch, a checkbox). `error` is failed validation. So `--mj-switch-bg-checked` falls back to `--mj-brand-primary`, and `--mj-input-border-error` falls back to `--mj-border-error`.
- A square control reads one token on both axes. An icon or circle button sets width and height from the same resolved height, so it stays square at every size and under any density setting. No compound `--mj-button-icon-sm-width`, no `calc()`. The primitive resolves the height once into a private token (`--_mj-button-height`, from `--mj-button-height` or, on a small button, `--mj-button-sm-height`) and uses that for width and height. It never declares the public token itself, so the unset rule above still holds.
- A focus token on a surface that already has a resting shadow composes, it does not replace. `--mj-card-shadow-focus` defaults to `var(--mj-card-shadow), var(--mj-focus-ring)` so the card does not go flat the moment it takes focus. The name fits the grammar; only the default value is layered.

On hyphens: the grammar separates slots with `-`, and several slot values contain hyphens themselves (`slide-panel`, `bottom-sheet`, `font-size`, `padding-x`). Fine for people. It means a linter cannot split on `-` and count slots; the gate's regex has to be assembled from the known word lists (component, variant, part, property, state), which is what the index is for.

## Named parts and regions

A part is a region of a component that content can go into. Parts are optional and order-free. The same part word appears everywhere it is referenced: the tag or directive, the token, the region override, the metadata key, the gallery. One word, five places.

Parts vocabulary. Shared across components so `header` means the same thing on a card, a dialog and a panel:

| Part | What it is | Exists today as |
| --- | --- | --- |
| `header` | top band of the component | `mj-dialog-titlebar`, `mj-window-titlebar`, `mj-page-header` |
| `title` | the heading text inside the header | `[mjCardTitle]`, `[mjAccordionTitle]` |
| `tools` | controls at the right of the header | `[mjCardTools]` |
| `body` | the main content region | `[mjAccordionBody]`, `mj-page-body` |
| `footer` | bottom band | `[mjCardFooter]` |
| `actions` | buttons, usually in the footer | `[mjCardActions]`, `[mjAccordionActions]`, `mj-dialog-actions` |
| `media` | image or illustration | nothing yet (`mj-card-image` in the call, same idea) |
| `icon` | leading icon |  |

Two shapes exist for parts today and both stay valid; new primitives pick one per component and the convention is the word, not the shape:

```html
<!-- element parts: when the part has its own layout -->
<mj-card>
  <mj-card-header>Renewals due</mj-card-header>
  <mj-card-body>...</mj-card-body>
  <mj-card-footer>...</mj-card-footer>
</mj-card>

<!-- attribute parts: when the part just marks existing content -->
<mj-card>
  <h3 mjCardTitle>Renewals due</h3>
  <div mjCardActions><button mjButton>Export</button></div>
</mj-card>
```

Element parts are `mj-<component>-<part>`. Attribute parts are `mj<Component><Part>` in camelCase. Tokens for a part are `--mj-<component>-<part>-<property>`, so `mj-card-header` has `--mj-card-header-padding` and `--mj-card-header-bg`.

Parts and regions are different things, and the boundary is: does the component render anything there by default?

- A **part** is an empty container. The component gives it layout and tokens; the host always supplies the content. `<mj-card-header>` renders nothing until you put something in it.
- A **region** is a default-rendered subtree. The component renders its own UI there out of the box (a record form's toolbar, a dialog's close button) and the host may replace that whole subtree with an `<ng-template>`.

Region override, one directive for every component:

```html
<mj-record-form>
  <ng-template mjRegion="toolbar"><my-toolbar /></ng-template>
</mj-record-form>
```

The region name is the part word. `mjRegion="footer"` on a card replaces what `mj-card-footer` would render. The five existing slot systems (`[mjChatSlot]`, `[mjLoginSlot]`, form panel slots, card-grid directives, accordion directives) converge on this as their host components are converted; the old directives keep working and forward to the new part with a dev-mode deprecation warning.

Title and tools live inside header; actions live inside footer. A component that wants a region with none of these words asks what it is that the eight don't cover before adding one.

## Rules

Do:

- Full words. `button`, `radius`, `background` as `bg` is the one sanctioned abbreviation because 26 tokens and 8,700+ uses already carry it.
- kebab-case, lowercase, digits allowed in scale steps only (`space-2`, `brand-500`).
- General to specific, left to right: component, variant, part, property, state.
- Every public name starts with `--mj-`. Our components get dropped into host apps (LXP, Grace, Betty) that have their own variables; the prefix is the namespace.
- Default to a token, not a value, at every tier below the scale.
- Add a name to the index in the same PR that first uses it.

Don't:

- Abbreviate: `btn`, `rad`, `bdr`, `clr`, `pri`.
- Put the value in the name: `--mj-radius-8`, `--mj-space-16`.
- Describe the look instead of the thing: `--mj-radius-rounded`, `--mj-bg-light-grey`.
- camelCase in custom properties: `--mj-primaryBg`.
- Mix orders: `--mj-button-hover-bg` and `--mj-input-bg-hover` in the same codebase.
- Ship an unprefixed public name: `--role-fill`, `--surface`.

The inferability test. Given one name, a person or an AI guesses the next one without opening a file. If the guess fails, the name is wrong, not the guesser.

| You know | You need | You guess |  |
| --- | --- | --- | --- |
| `--mj-button-radius` | input radius | `--mj-input-radius` | pass |
| `--mj-button-primary-bg` | hover state | `--mj-button-primary-bg-hover` | pass |
| `--mj-card-header-padding` | footer padding | `--mj-card-footer-padding` | pass |
| `--mj-dialog-radius` | bottom sheet radius | `--mj-bottom-sheet-radius` | pass |
| `--mj-text-muted` | muted border | `--mj-border-muted` | fail: border roles are default/subtle/strong. Role lists differ per family and that is fine, but the gallery lists them. |
| `--btn-rad` | input radius | `--inp-rad`? `--input-radius`? | fail |
| `--mj-primaryBg` | secondary | `--mj-secondaryBg`? `--mj-bg-secondary`? | fail, two conventions |

## Private tokens and what stays

Private tokens are a component's own working variables, never set by a host and never in the index. They start with `--_mj-` so the gate can tell them apart from public API and so a host that greps for `--mj-` doesn't find them.

```css
.mj-btn {
  --_mj-button-padding-x: calc(var(--mj-button-height, var(--mj-control-height-md)) * 0.4);
  padding-inline: var(--_mj-button-padding-x);
}
```

Today the tree has `--_as-*` (a splitter component) and `--_this` as private vars. Those stay; new ones follow `--_mj-<component>-...`.

What stays exactly as it is:

- All 303 scale and semantic tokens in `_tokens.scss`. Nothing in this convention renames an existing public token.
- `--mj-login-*` (28 tokens) already fits the component tier shape. It is the proof the pattern works.
- `.mj-btn` and `.mj-btn--primary` class names on the current button. They are internal to the primitive and get revisited when the button is converted in wave 0, not before. Tokens for the button are `--mj-button-*` regardless, because the token names the component, not its CSS class. The code examples in this doc use those class names.
- The 27 `--mj-timeline-*` host variables on ng-timeline. The `:host` mechanism is the precedent wave 0 copies; several of the names (`--mj-timeline-marker-fill`, `--mj-timeline-accent-light`, `--mj-timeline-focus-ring`) predate this grammar and are not. When the timeline is next touched it gets grammar names with the old ones aliased to them.

What the convention does not cover yet, on purpose: TypeScript input names on components, metadata keys for Form Studio and dashboards, and the gallery's own labels. Those should use the same part and property words, but their shapes are their own and get written down when the first primitive is converted.

## Resolved on Colin's review

Colin reviewed the seven open calls on 2026-11-09 and agreed on all of them, then ran his 60-token WS6 list through the grammar and found four spots to align. The decisions, with the reason each one holds:

- **bg, not fill.** Tier 2 already uses `bg` in 26 token names and 8,700+ uses, so `--mj-bg-surface` → `--mj-card-fill` would fail the inferability test, and `fill` means SVG fill in CSS. Colin's proposal had used `fill` by preference only.
- **Size is a variant.** `--mj-button-sm-height`, never `--mj-button-height-sm`. The slot after property stays reserved for interaction state, and sm is a selector-level variant like primary. Colin's proposed list moves from `--mj-btn-height-sm` / `-pad-sm` / `-text-sm` to `--mj-button-sm-height` / `-padding` / `-font-size`. Icon and circle buttons need no compound token: both axes read one height resolved from `--mj-button-height` (component rule above).
- **Gate is both, generated from the index.** Hyphenated words (`card-grid`, `page-header`, `font-size`, `line-height`) rule out a positional split, so the index exports five closed arrays (components, variants, parts, properties, states) and a short script assembles the exact regex. `check:ui` then checks existing uses against the resolved token set and any newly authored `--mj-*` declaration against the grammar. Colin adds the five arrays to the `tokens.json` generator spec.
- **Both part shapes stay, with the rule.** Layout boxes (header, body, footer) are elements because they own flex/grid and padding tokens. Leaf text (title, subtitle) is an attribute so the consumer picks the heading level (`<h2 mjCardTitle>` vs `<h3>`) for the page outline. That fixes the WCAG 1.3.1 bug `mj-card` has today, a hardcoded `h3` in the template. The `components.json` extractor already walks `@Component` and `@Directive`, so indexing both costs nothing.
- **Font weights stay as they are.** `--mj-font-{normal,medium,semibold,bold}` keep their names. "Nothing renames an existing public token" is the strongest promise in this doc; four font weights aren't worth breaking it. Tier 3 uses `font-weight`.
- **Focus rings.** `--mj-button-shadow-focus: var(--mj-focus-ring)` fits the grammar without a new ring word. The one WS6 case to watch is a surface with a resting elevation shadow; there the default composes the two (component rule above) so focus never drops the elevation.
- **All 60 WS6 tokens checked.** Four alignments, all resolved: (1) surface state order flips to state-last, `--mj-surface-elevated-bg-hover` and `--mj-surface-base-border-selected`, 12 tokens. (2) Surface-scoped text re-points are Tier 2 surface roles, written up in the role tier above, so `text-muted` and `text-link` never enter the component property list, 17 tokens. (3) `--mj-control-h-*` is spelled out as `--mj-control-height-*`, three steps, values listed under tier 2. (4) ng-timeline keeps its `:host` mechanism, not its names; the old names get aliased when it is next touched.

## Settled after the review

Five changes were made after Colin's review. He looked at them on 2026-11-10 and agreed all five:

- **Three control heights, 32 / 40 / 52, with 44 on touch.** Nothing in WS6 needs 28 or 38. 38 was only on the earlier five-step list because inputs sit there today. Colin asked that 40 be listed as an intentional change, which it now is under tier 2, and it goes on the Phase 0 checklist in the unified plan.
- **Surfaces live in the role tier.**
- **Square buttons resolve height into the private `--_mj-button-height`.** The public token stays unset on the small button, so a host override on a parent container still wins.
- **`checked` and `error` join the state list.**
- **`--mj-font-normal`** is the token's real name, not `--mj-font-regular`.

Colin also proposed the surface level mapping: each level's background defaults to the matching `--mj-bg-surface*` token, overlay defaults to elevated, and hover on every level defaults to `--mj-bg-surface-hover`. That mapping is adopted in tier 2 with three decisions on top, each made by Matt after checking the tokens file and how Atlassian's and GitHub Primer's systems handle the same question:

- **Overlays on elevated is adopted, and named as a visible change.** Dialogs and sheets use the base surface today, so they get lighter in the dark theme. Atlassian states the same principle for its dark theme: the higher the elevation, the lighter the surface.
- **Sunken gets no hover.** The proposed shared hover is the same gray as the sunken surface in the light theme. Atlassian's elevation guide lists hover and pressed tokens for its default, raised and overlay surfaces and none for sunken.
- **Card stays a fill.** `--mj-bg-surface-card` has 1,600+ uses, and in the shared kit alone it paints chips, tab bars and title bars as well as cards. Atlassian builds a flat card from the default surface plus a border, and Primer keeps a muted fill (`--bgColor-muted`) next to its default, inset and overlay backgrounds.
