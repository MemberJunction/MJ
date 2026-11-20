# Give `mjButton` Component Tokens, Fix Focus/Motion/Link-Disabled Bugs, and Add `[FullWidth]`: Implementation Plan

**Status:** IMPLEMENTED on PR #6791 (2026-11-20), pending Colin's review on the two naming questions below before merge.
**Related:** [UNIFIED_PLAN.md](ui-foundation/UNIFIED_PLAN.md), [NAMING.md](ui-foundation/NAMING.md), Issue #4845 ([4845-remove-legacy-mj-btn-block.md](4845-remove-legacy-mj-btn-block.md)).

## Goal

Let any theme or Open App restyle `mjButton` end-to-end by setting `--mj-button-*` CSS custom properties instead of writing `.mj-btn` selector overrides (which `check:ui-buttons` forbids), while fixing four defects in `packages/Angular/Generic/ui-components/src/lib/button/`:

1. Hover `box-shadow` at specificity `(0,7,0)` wiping out `:focus-visible` `(0,2,0)` when a keyboard-focused button is hovered (WCAG 2.4.7).
2. Hover `-2px` lift running even when reduced motion is requested (WCAG 2.3.3).
3. `a[mjButton]` lacking a disabled contract (`aria-disabled`, tab-order removal, click/keyboard suppression, and `:not(:disabled, [disabled], [aria-disabled="true"])` hover/active exclusions).
4. Missing opt-in full-width modifier (`[FullWidth]="true"` -> `.mj-btn--full`) and hardcoded dimensions on `.mj-btn--circle` and `.mj-btn-group` that ignore custom button height and radius tokens.

Zero intended visual change at rest in stock MJ light or dark themes.

---

## Fit with Project Lego

- **Escape-hatch telemetry (`UNIFIED_PLAN.md` Principle 7):** Restyling `mjButton` in an Open App against a finished design took 10 token values and 16 `.mj-btn` rules. Those 16 rules had to jump to rung 3 of the escape-hatch ladder (host CSS) only because rung 1 (Tier 3 component tokens) was missing.
- **Why this can ship ahead of the Phase 0 prototype gate:** `UNIFIED_PLAN.md` holds Phase 2 primitives behind the Phase 0 gate because that gate proves the new component architecture (`ViewEncapsulation.None` on `@Component`, `@layer primitives`, CDK `MJLayerService`, named parts, Custom Elements light DOM). `mjButton` is already an unencapsulated attribute directive with a global stylesheet and adds no parts or overlays. Wave 0/1 structural changes (`@layer primitives`, desktop `44px` -> `40px` height via `--mj-control-height-md`, open string `Variant` axis) stay out of scope here.
- **Additive-within-an-era lock:** Every `--mj-button-*` custom property, `NAMING.md` property word, and `@Input()` shipped here becomes permanent 6.x API. All names below are checked against `plans/ui-foundation/NAMING.md` and pinned by `button.styles.dom.test.ts`.

---

## Architecture Decisions

### D1. All 8 variants get the symmetric 9-token color matrix (`{bg, text, border} x {rest, hover, active}`)
`NAMING.md`'s inferability test requires that if a developer or AI knows `--mj-button-outline-text-hover`, guessing `--mj-button-secondary-text-hover` or `--mj-button-danger-border` works without opening `button.scss`. Leaving `danger`, `success`, `warning`, or `icon` off the token surface also traps themes that use soft/tinted status buttons (`--mj-status-error-bg` + `--mj-status-error-text`) or neutral icon-button hover instead of MJ's stock brand-blue hover.

To avoid CSS Invalid-At-Computed-Value-Time (`IACVT`) wiping out resting variant colors when a hover, active, or disabled token is unset on `:root`, each variant assigns three private working variables (`--_mj-button-bg`, `--_mj-button-text`, `--_mj-button-border`), and `.mj-btn`, `:hover`, `:active`, and `:disabled` fall back through those private variables.

### D2. Add `transform` and `opacity` to `NAMING.md`'s Tier 3 property table in this PR
`NAMING.md` defines a closed list of Tier 3 property words, from which Phase 3's CI token gate builds its regex. Exposing hover/active motion (`--mj-button-transform-hover`, `--mj-button-transform-active`) and disabled/active opacity (`--mj-button-opacity-disabled`, `--mj-button-{danger,success,warning}-opacity-active`) adds `transform` and `opacity` to `NAMING.md` in the same PR.

### D3. Keep `px` fallbacks where today's `button.scss` uses `px` (and `--mj-radius-control` where WS6b already matches)
- **Height:** `--mj-button-height` falls back to `44px` (not `--mj-control-height-md`, which is `40px`), so desktop buttons do not shrink ahead of Wave 1's intentional height conversion. `--mj-button-sm-height` falls back to `var(--mj-control-height-sm, 32px)` (`32px` desktop, `44px` on `pointer: coarse` in `_tokens.scss`) and `--mj-button-lg-height` falls back to `var(--mj-control-height-lg, 52px)`.
- **Padding & gap:** Today `button.scss` uses `px` (`10px 20px`, `8px`, `6px 12px`, `14px 28px`) rather than `--mj-space-*` (`rem`). Because `ng-realtime-widget` compiles both `_tokens.scss` and `button.scss` into third-party host pages that may set `html { font-size: 62.5% }`, switching fallbacks from `px` to `rem` (such as `--mj-space-2`) would shrink embedded widget spacing from `8px` to `5px`. Keeping today's exact `px` literals (`8px`, `6px`, `10px`, `10px 20px`, etc.) preserves pixel parity everywhere.
- **Radius:** WS6b (`#6609`) defines `--mj-radius-control: var(--mj-radius-md)` (`8px`). `--mj-button-radius` falls back to `var(--mj-radius-control, var(--mj-radius-md))` with zero visual change, and `.mj-btn-group` outer corners read `var(--mj-button-radius, var(--mj-radius-control, var(--mj-radius-md)))`.

### D4. Private `--_mj-button-height` on `.mj-btn--circle` vs `.mj-btn--icon`
`NAMING.md` (lines 216 and 345) specifies resolving button height into private `--_mj-button-height` so square controls read one height on both axes and forbids per-axis width tokens on square controls:
- `.mj-btn--circle` sizes `width`, `height`, `min-width`, and `min-height` from `--_mj-button-height` (`32x32` / `44x44` / `52x52`, `44x44` on `pointer: coarse`) with zero pixel change today.
- `.mj-btn--icon` currently sets `min-width: 44px` on `next` while `.mj-btn--sm` only lowers `min-height: 32px`, leaving ~30 `Variant="icon" Size="sm"` buttons in MJ at `44x32`. To keep zero resting layout shift here without publishing a forbidden `--mj-button-icon-width` token, `.mj-btn--icon` sets `min-width: var(--mj-button-height, 44px)` while `min-height` follows `--_mj-button-height`. Switching `min-width` to `var(--_mj-button-height)` (`44x32` -> `32x32`) waits for Wave 1.

### D5. PascalCase `[Disabled]` setter + capture-phase event guards without hijacking native `<button [disabled]>`
Across ~400 files in MJ, templates bind lowercase `<button mjButton [disabled]="isBusy">` directly to `HTMLButtonElement.disabled`.
- Declaring only PascalCase `@Input() set Disabled(value: boolean)` leaves unbound `<button [disabled]="...">` elements untouched on `<button>` while forwarding `disabled` when `[Disabled]` is explicitly bound.
- On `<a>`: sets `aria-disabled="true"` and `tabindex="-1"` (saving and restoring any author-supplied `tabindex` on re-enable).
- Capture-phase `click` and `keydown` (`Enter` / `Space`) listeners on `host.nativeElement` (`addEventListener(..., true)`, cleaned up in `ngOnDestroy`) run before bubble-phase handlers on the same element (including `RouterLink` and template `(click)` bindings) and block activation alongside `OnClick()`.

### D6. `:where()` on base lift `(0,2,0)` vs `:not(:disabled, [disabled], [aria-disabled="true"])` on variants `(0,3,0)`
Only the base `.mj-btn` hover/active lift rules carried `(0,7,0)` specificity and collided with `:focus-visible` `(0,2,0)` on `box-shadow`. Variant hover/active rules only set colors, and four components in `ng-mj-livekit-room` plus `dialog.service.ts` still carry inline `styles: [...]` `.mj-btn--*` rules under emulated encapsulation (`.mj-btn--primary[_ngcontent-...]`, `(0,2,0)` loaded after global styles). Using a single Selectors Level 4 `:not(:disabled, [disabled], [aria-disabled="true"])` list keeps variant hover/active at `next`'s `(0,3,0)` so those components keep their hover state until migrated to `mjButton`, while base lift drops to `(0,2,0)` via `:where()`.

---

## Complete Token Surface (`NAMING.md` Verified: 106 Tokens)

Grammar: `--mj-button[-<variant>]-<property>[-<state>]`
All public `--mj-button-*` tokens are **unset** on `:root`.

### Base, Motion, Focus, Disabled, and Selected (21 tokens)

| Token | CSS property | Fallback in `button.scss` | Today's resolved value |
| --- | --- | --- | --- |
| `--mj-button-height` | `min-height` (via `--_mj-button-height`) | `44px` | `44px` |
| `--mj-button-padding` | `padding` | `10px 20px` | `10px 20px` |
| `--mj-button-gap` | `gap` | `8px` | `8px` |
| `--mj-button-border-width` | `border-width` | `1px` | `1px` |
| `--mj-button-border-style` | `border-style` | `solid` | `solid` |
| `--mj-button-radius` | `border-radius` | `var(--mj-radius-control, var(--mj-radius-md))` | `8px` |
| `--mj-button-font-size` | `font-size` | `var(--mj-text-sm)` | `0.875rem` (`14px`) |
| `--mj-button-font-weight` | `font-weight` | `var(--mj-font-semibold)` | `600` |
| `--mj-button-icon-size` | icon `font-size` | `var(--mj-text-base, 1rem)` | `1rem` (`16px`) |
| `--mj-button-shadow-focus` | `:focus-visible` `box-shadow` | `var(--mj-focus-ring)` | focus ring |
| `--mj-button-transform-hover` | lifted `:hover` `transform` (`no-preference`) | `translateY(-2px)` | `translateY(-2px)` |
| `--mj-button-shadow-hover` | lifted `:hover` `box-shadow` | `0 4px 8px rgba(0, 0, 0, 0.1)` | `0 4px 8px rgba(0, 0, 0, 0.1)` |
| `--mj-button-transform-active` | lifted `:active` `transform` (`no-preference`) | `translateY(0)` | `translateY(0)` |
| `--mj-button-shadow-active` | lifted `:active` `box-shadow` | `none` | `none` |
| `--mj-button-bg-disabled` | disabled `background` | `var(--_mj-button-bg, transparent)` | variant's rest `bg` |
| `--mj-button-text-disabled` | disabled `color` | `var(--_mj-button-text, inherit)` | variant's rest `text` |
| `--mj-button-border-disabled` | disabled `border-color` | `var(--_mj-button-border, transparent)` | variant's rest `border` |
| `--mj-button-opacity-disabled` | disabled `opacity` | `0.5` | `0.5` |
| `--mj-button-bg-selected` | `.mj-btn--selected` `background` | `var(--mj-brand-primary)` | brand-500 |
| `--mj-button-text-selected` | `.mj-btn--selected` `color` | `var(--mj-brand-on-primary)` | neutral-0 |
| `--mj-button-border-selected` | `.mj-btn--selected` `border-color` | `var(--mj-brand-primary)` | brand-500 |

### Size Variants: `sm` and `lg` (8 tokens)

| Token | CSS property | Fallback in `button.scss` | Today's resolved value |
| --- | --- | --- | --- |
| `--mj-button-sm-height` | `min-height` (via `--_mj-button-height`) | `var(--mj-control-height-sm, 32px)` (`44px` on `pointer: coarse`) | `32px` (`44px` touch) |
| `--mj-button-sm-padding` | `padding` | `6px 12px` (`10px 12px` on `pointer: coarse`) | `6px 12px` (`10px 12px` touch) |
| `--mj-button-sm-font-size` | `font-size` | `0.8125rem` | `0.8125rem` (`13px`) |
| `--mj-button-sm-gap` | `gap` | `6px` | `6px` |
| `--mj-button-lg-height` | `min-height` (via `--_mj-button-height`) | `var(--mj-control-height-lg, 52px)` | `52px` |
| `--mj-button-lg-padding` | `padding` | `14px 28px` | `14px 28px` |
| `--mj-button-lg-font-size` | `font-size` | `var(--mj-text-base, 1rem)` | `1rem` (`16px`) |
| `--mj-button-lg-gap` | `gap` | `10px` | `10px` |

### Visual Variants: All 8 Variants (77 tokens)

Every variant exposes the 9-token set `--mj-button-<variant>-{bg,text,border}[-{hover,active}]`:

| Variant | Rest (`bg` / `text` / `border`) | Hover (`bg-hover` / `text-hover` / `border-hover`) | Active (`bg-active` / `text-active` / `border-active` + extras) |
| --- | --- | --- | --- |
| `primary` | `--mj-brand-primary` / `--mj-brand-on-primary` / `--mj-brand-primary` | `--mj-brand-primary-hover` / rest `text` / `--mj-brand-primary-hover` | `--mj-brand-primary-active` / hover `text` / `--mj-brand-primary-active` |
| `secondary` | `--mj-bg-surface-sunken` / `--mj-text-primary` / `--mj-border-default` | `--mj-bg-surface-active` / rest `text` / `--mj-border-strong` | `color-mix(in srgb, var(--mj-text-primary) 8%, var(--mj-bg-surface-active))` / hover `text` / hover `border` |
| `outline` | `transparent` / `--mj-brand-primary` / `--mj-brand-primary` | `--mj-brand-primary` / `--mj-brand-on-primary` / rest `border` | `--mj-brand-primary-active` / `--mj-brand-on-primary` / rest `border` |
| `flat` | `transparent` / `--mj-text-secondary` / `transparent` (+ `--mj-button-flat-padding`: `8px 12px`) | `--mj-bg-surface-hover` / `--mj-text-primary` / rest `border` | `--mj-bg-surface-active` / hover `text` / hover `border` |
| `danger` | `--mj-status-error` / `--mj-text-inverse` / `--mj-status-error` | `--mj-status-error-text` / rest `text` / `--mj-status-error-text` | hover `bg` / hover `text` / hover `border` (+ `--mj-button-danger-opacity-active`: `0.9`) |
| `success` | `--mj-status-success` / `--mj-text-inverse` / `--mj-status-success` | `--mj-status-success-text` / rest `text` / `--mj-status-success-text` | hover `bg` / hover `text` / hover `border` (+ `--mj-button-success-opacity-active`: `0.9`) |
| `warning` | `--mj-status-warning` / `--mj-text-inverse` / `--mj-status-warning` | `--mj-status-warning-text` / rest `text` / `--mj-status-warning-text` | hover `bg` / hover `text` / hover `border` (+ `--mj-button-warning-opacity-active`: `0.9`) |
| `icon` | `transparent` / `--mj-text-muted` / `transparent` (+ `--mj-button-icon-padding`: `8px`) | `--mj-bg-surface-hover` / `--mj-brand-primary` / rest `border` | `--mj-bg-surface-active` / hover `text` / hover `border` |

*(Note on `warning`: `--mj-button-warning-text` retains today's `--mj-text-inverse` fallback so this PR stays visually zero-diff at rest; Issue `#3372` tracks switching filled status button contrast to `--mj-status-on-warning` separately.)*

### Known Grammar Gaps Flagged for Naming Review (Matt + Colin)

1. **Orthogonal states (`selected` + `hover`):** `NAMING.md` restricts `state` to a single slot (`hover | active | focus | disabled | selected | checked | error`), so `.mj-btn--selected:hover` cannot expose `--mj-button-bg-selected-hover` and currently borrows `--mj-button-primary-bg-hover` / `--mj-button-primary-border-hover` as an internal fallback to preserve stock MJ's exact `#006aa3` hover color. Because this is a fallback rather than a public token name, changing it once `NAMING.md` settles orthogonal states across controls (`selected` + `hover` on buttons, rows, and surfaces; `checked` + `hover` on switches) is non-breaking.
2. **`icon-size` property vs `icon` variant and `icon` part:** In `NAMING.md`, `icon` appears as a `variant` (`Variant="icon"`), a named `part` (`icon` leading icon), and the prefix of the `icon-size` property. While `--mj-button-icon-size` parses unambiguously because `size` is not a property word, a per-variant or per-part override produces `--mj-button-icon-icon-size` or `--mj-card-icon-icon-size`, which fails the inferability test. Flagged for Matt and Colin to confirm whether `icon-size` stays or renames (for example `glyph-size`) before `--mj-button-icon-size` ships in a release.

---

## Completed Verification Checklist

- [x] `plans/ui-foundation/NAMING.md` updated with `opacity` and `transform` properties plus temporary `44px` button-height notes.
- [x] `MJButtonDirective` (`button.directive.ts`) updated with `[FullWidth]` and `[Disabled]` (capture-phase `click` and `Enter`/`Space` guards, `tabindex` save/restore on `<a>`, non-clobbering setter for native `<button [disabled]>`).
- [x] `button.scss` tokenized across all 106 `--mj-button-*` variables; base hover/active lift gated behind `@media (prefers-reduced-motion: no-preference)` and lowered to `(0,2,0)` via `:where()`; `:focus-visible` paired with a `@media (forced-colors: active)` outline fallback; variant hover/active kept at `(0,3,0)` via `:not(:disabled, [disabled], [aria-disabled="true"])`.
- [x] Vitest + DOM + axe + strict column-1 `NAMING.md` grammar and CSS mutation-pinning specs (`65/65` suites, `861/861` tests in `@memberjunction/ng-ui-components`).
- [x] Playwright Chromium before/after computed-style matrix (`76` elements x `19` properties across `light-desktop`, `dark-desktop`, and `light-coarse` with `0` diffs, plus focus+hover, reduced-motion, `[FullWidth]`, and Open App token-only restyle assertions).
- [x] Follow-up noted: migrate inline `styles: [...]` `.mj-btn` rules in `ng-mj-livekit-room` and `dialog.service.ts` to `mjButton`, and extend `check-mj-btn-override.sh` to scan inline TypeScript `styles`.
