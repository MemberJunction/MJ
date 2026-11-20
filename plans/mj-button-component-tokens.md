# Give `mjButton` Component Tokens, Fix Focus/Motion/Link-Disabled Bugs, and Add `[FullWidth]`: Implementation Plan

**Status:** DRAFT 2026-11-19, for Matt and Colin's review before merge.
**Related:** [UNIFIED_PLAN.md](ui-foundation/UNIFIED_PLAN.md), [NAMING.md](ui-foundation/NAMING.md), Issue #4845 ([4845-remove-legacy-mj-btn-block.md](4845-remove-legacy-mj-btn-block.md)).

## Goal

Let any theme or Open App restyle `mjButton` end-to-end by setting `--mj-button-*` CSS custom properties instead of writing `.mj-btn` selector overrides (which `check:ui-buttons` forbids), while fixing four defects in `packages/Angular/Generic/ui-components/src/lib/button/`:

1. Hover `box-shadow` at specificity `(0,7,0)` wiping out `:focus-visible` `(0,2,0)` when a keyboard-focused button is hovered (WCAG 2.4.7).
2. Hover `-2px` lift running even under `prefers-reduced-motion: reduce` (WCAG 2.3.3).
3. `a[mjButton]` lacking a disabled contract (`aria-disabled`, tab-order removal, click suppression, and `:not([aria-disabled="true"])` hover/active exclusions).
4. Missing opt-in full-width modifier (`[FullWidth]="true"` -> `.mj-btn--full`) and hardcoded dimensions on `.mj-btn--circle` and `.mj-btn-group` that ignore custom button height and radius tokens.

Zero intended visual change at rest in stock MJ light or dark themes.

---

## Fit with Project Lego

- **Escape-hatch telemetry (`UNIFIED_PLAN.md` Principle 7):** Restyling `mjButton` in an Open App against a finished design took 10 token values and 16 `.mj-btn` rules. Those 16 rules had to jump to rung 3 of the escape-hatch ladder (host CSS) only because rung 1 (Tier 3 component tokens) was missing.
- **Why this can ship ahead of the Phase 0 prototype gate:** `UNIFIED_PLAN.md` holds Phase 2 primitives behind the Phase 0 gate because that gate proves the new component architecture (`ViewEncapsulation.None` on `@Component`, `@layer primitives`, CDK `MJLayerService`, named parts, Custom Elements light DOM). `mjButton` is already an unencapsulated attribute directive with a global stylesheet and adds no parts or overlays. Wave 0/1 structural changes (`@layer primitives`, desktop `44px` -> `40px` height via `--mj-control-height-md`, open string `Variant` axis) stay out of scope here.
- **Additive-within-an-era lock:** Every `--mj-button-*` custom property, `NAMING.md` property word, and `@Input()` shipped here becomes permanent 6.x API. All names below are checked against `origin/next`'s `plans/ui-foundation/NAMING.md` before code is written.

---

## Global Constraints

- Cut branch from `origin/next` (where PRs `#6503`, `#6674`, and `#6609` are already merged, so `--mj-radius-control` and the updated `NAMING.md` property table are present).
- Stage files explicitly (`git add <file>`). Never stage `mj.config.cjs` or local generated host files. Ask before `git commit`.
- No `any` or weak typing in TypeScript (`button.directive.ts`, `button.directive.dom.test.ts`).
- Run `packages/Angular/Generic/ui-components` Vitest suite and all UI CI gates (`check-mj-btn-override.sh`, `check-css-hex-tokens.sh`, `check-focus-ring.sh`, `check-ngc-scss.sh`) before considering work complete.
- Changeset bump: `patch` on `@memberjunction/ng-ui-components` (additive inputs and unset CSS custom properties with identical fallbacks).

---

## Decisions (Read Before Task 1)

### D1. All 8 variants get the symmetric 9-token color matrix (`{bg, text, border} x {rest, hover, active}`)
`NAMING.md`'s inferability test requires that if a developer or AI knows `--mj-button-outline-text-hover`, guessing `--mj-button-secondary-text-hover` or `--mj-button-danger-border` works without opening `button.scss`. Leaving `danger`, `success`, `warning`, or `icon` off the token surface also traps themes that use soft/tinted status buttons (`--mj-status-error-bg` + `--mj-status-error-text`) or neutral icon-button hover instead of MJ's stock brand-blue hover.

To avoid CSS Invalid-At-Computed-Value-Time (`IACVT`) wiping out resting variant colors when a hover, active, or disabled token is unset on `:root`, each variant assigns three private working variables (`--_mj-button-bg`, `--_mj-button-text`, `--_mj-button-border`), and `.mj-btn`, `:hover`, `:active`, and `:disabled` fall back through those private variables.

### D2. Add `transform` and `opacity` to `NAMING.md`'s Tier 3 property table in this PR
`NAMING.md` (`origin/next` lines 155-171) defines a closed list of 14 Tier 3 property words (`bg`, `text`, `border`, `border-width`, `border-style`, `radius`, `shadow`, `height`/`min-height`, `width`/`max-width`, `padding`, `gap`, `font-size`, `font-weight`, `icon-size`). Phase 3's CI token gate builds its regex from that table. Exposing hover/active motion (`--mj-button-transform-hover`, `--mj-button-transform-active`) and disabled/active opacity (`--mj-button-opacity-disabled`, `--mj-button-{danger,success,warning}-opacity-active`) requires adding `transform` and `opacity` to `NAMING.md` in the same PR.

### D3. Keep `px` fallbacks where today's `button.scss` uses `px` (and `--mj-radius-control` where WS6b already matches)
- **Height:** `--mj-button-height` falls back to `44px` (not `--mj-control-height-md`, which is `40px` on `origin/next`), so desktop buttons do not shrink ahead of the Wave 1/2 intentional height conversion. `--mj-button-sm-height` falls back to `var(--mj-control-height-sm, 32px)` (`32px` desktop, `44px` on `pointer: coarse` in `_tokens.scss`) and `--mj-button-lg-height` falls back to `var(--mj-control-height-lg, 52px)`, both of which match today's exact `px` values.
- **Padding & gap:** Today `button.scss` uses `px` (`10px 20px`, `8px`, `6px 12px`, `14px 28px`) rather than `--mj-space-*` (`rem`). Because `ng-realtime-widget` compiles `button.scss` into third-party host pages that may set `html { font-size: 62.5% }`, switching fallbacks from `px` to `rem` would shrink embedded widget buttons on non-16px host pages. Keeping today's exact `px` literals as fallbacks preserves pixel parity everywhere; Wave 0/2's Element font-sizing spec can migrate them with `--mj-space-*` together.
- **Radius:** WS6b (`#6609`, merged on `origin/next`) already defines `--mj-radius-control: var(--mj-radius-md)` (`8px`). `--mj-button-radius` falls back to `var(--mj-radius-control, var(--mj-radius-md))`, matching `NAMING.md` line 176 with zero visual change, and `.mj-btn-group` outer corners read `var(--mj-button-radius, var(--mj-radius-control, var(--mj-radius-md)))`.

### D4. Private `--_mj-button-height` on `.mj-btn--circle` vs `.mj-btn--icon`
`NAMING.md` (lines 212 and 342 on `origin/next`) specifies resolving button height into private `--_mj-button-height` so square controls read one height on both axes:
- `.mj-btn--circle` already renders `44x44` (`md`), `32x32` (`sm`), `52x52` (`lg`), and `44x44` (`sm` on `pointer: coarse`). Driving `.mj-btn--circle`'s `width`, `height`, `min-width`, and `min-height` from `--_mj-button-height` has **zero pixel change** today and keeps circles round under any `--mj-button-height` override.
- **Watch `.mj-btn--icon` + `Size="sm"`:** Today `.mj-btn--icon` sets `min-width: 44px; min-height: 44px` while `.mj-btn--sm` only overrides `min-height: 32px; padding: 6px 12px`, leaving ~30 `Variant="icon" Size="sm"` buttons in MJ at `44x32` instead of `32x32`. To keep this PR strictly zero-diff at rest across Explorer toolbars, `.mj-btn--icon` reads `min-width: var(--mj-button-icon-width, var(--mj-button-height, 44px))` (staying `44px` unless themed) while `min-height` follows `--_mj-button-height`. *(Open call for Matt: if we want `Variant="icon" Size="sm"` fixed to `32x32` now instead of waiting for Wave 1, change `.mj-btn--icon`'s `min-width` fallback to `var(--_mj-button-height)` and list that `44x32` -> `32x32` fix as an intentional visible change.)*

### D5. PascalCase `[Disabled]` setter without hijacking native `<button [disabled]>`
Across ~400 files in MJ, templates bind lowercase `<button mjButton [disabled]="isBusy">` directly to `HTMLButtonElement.disabled`.
- If `MJButtonDirective` declared a lowercase `@Input() disabled`, Angular would route every `<button mjButton [disabled]="...">` in the monorepo through the directive instead of the DOM property.
- If `MJButtonDirective` put `@HostBinding('attr.disabled')` on `Disabled = false`, Angular would clear native `[disabled]="true"` bindings back to enabled on change detection.
- **Solution:** Declare only PascalCase `@Input() set Disabled(value: boolean)` (matching `AriaLabel`'s non-clobbering setter pattern in `button.directive.ts:127`):
  - On `<button>`: when the `Disabled` setter is called, set `buttonEl.disabled = Boolean(value)`. Unbound `<button [disabled]="...">` elements never invoke the setter and keep working natively.
  - On `<a>`: toggle `aria-disabled="true"` (removed when `false`) and manage `tabindex="-1"` (preserving and restoring any author-supplied `tabindex` when re-enabled).
  - In `OnClick(event: MouseEvent)` and `@HostListener('keydown', ['$event'])`: check `isDisabledHost()` (`el.hasAttribute('disabled') || el.getAttribute('aria-disabled') === 'true'`). When disabled, call `event.preventDefault()` and `event.stopImmediatePropagation()` and skip `Toggleable` state toggling.

---

## Complete Token Surface (`NAMING.md` Verified)

Grammar: `--mj-button[-<variant>]-<property>[-<state>]`
All public `--mj-button-*` tokens are **unset** on `:root`.

### Base, Motion, Focus, Disabled, and Selected (22 tokens)

| Token | CSS property | Fallback in `button.scss` | Today's resolved value |
| --- | --- | --- | --- |
| `--mj-button-height` | `min-height` (via `--_mj-button-height`) | `44px` | `44px` |
| `--mj-button-padding` | `padding` | `10px 20px` | `10px 20px` |
| `--mj-button-gap` | `gap` | `var(--mj-space-2, 8px)` | `8px` (`0.5rem`) |
| `--mj-button-border-width` | `border-width` | `1px` | `1px` |
| `--mj-button-border-style` | `border-style` | `solid` | `solid` |
| `--mj-button-radius` | `border-radius` | `var(--mj-radius-control, var(--mj-radius-md))` | `8px` |
| `--mj-button-font-size` | `font-size` | `var(--mj-text-sm)` | `0.875rem` (`14px`) |
| `--mj-button-font-weight` | `font-weight` | `var(--mj-font-semibold)` | `600` |
| `--mj-button-icon-size` | icon `font-size` | `var(--mj-text-base, 1rem)` | `1rem` (`16px`) |
| `--mj-button-shadow-focus` | `:focus-visible` `box-shadow` | `var(--mj-focus-ring)` | focus ring |
| `--mj-button-transform-hover` | lifted `:hover` `transform` | `translateY(-2px)` | `translateY(-2px)` |
| `--mj-button-shadow-hover` | lifted `:hover` `box-shadow` | `0 4px 8px rgba(0, 0, 0, 0.1)` | `0 4px 8px rgba(0, 0, 0, 0.1)` |
| `--mj-button-transform-active` | lifted `:active` `transform` | `translateY(0)` | `translateY(0)` |
| `--mj-button-shadow-active` | lifted `:active` `box-shadow` | `none` | `none` |
| `--mj-button-bg-disabled` | disabled `background` | `var(--_mj-button-bg, transparent)` | variant's rest `bg` |
| `--mj-button-text-disabled` | disabled `color` | `var(--_mj-button-text, inherit)` | variant's rest `text` |
| `--mj-button-border-disabled` | disabled `border-color` | `var(--_mj-button-border, transparent)` | variant's rest `border` |
| `--mj-button-opacity-disabled` | disabled `opacity` | `0.5` | `0.5` |
| `--mj-button-bg-selected` | `.mj-btn--selected` `background` | `var(--mj-brand-primary)` | brand-500 |
| `--mj-button-text-selected` | `.mj-btn--selected` `color` | `var(--mj-brand-on-primary)` | neutral-0 |
| `--mj-button-border-selected` | `.mj-btn--selected` `border-color` | `var(--mj-brand-primary)` | brand-500 |
| `--mj-button-icon-width` | `.mj-btn--icon` `min-width` (see D4) | `var(--mj-button-height, 44px)` | `44px` |

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

---

## Implementation Tasks

### Task 0: Worktree / Branch Setup (from `origin/next`)

- [ ] Cut a fresh worktree or branch `feat/mj-button-component-tokens` from `origin/next` and verify upstream tracking with `git branch -vv`.

---

### Task 1: Update `plans/ui-foundation/NAMING.md` Property Vocabulary

**Files:**
- Modify: `plans/ui-foundation/NAMING.md`

- [ ] Add `opacity` and `transform` to the Tier 3 Property Vocabulary table:
  - `opacity` | `opacity` | disabled controls (`--mj-button-opacity-disabled`) and state attenuation where a token color swap does not apply
  - `transform` | `transform` | micro-interaction motion such as hover lift and press (`--mj-button-transform-hover`, `--mj-button-transform-active`); suppressed under `prefers-reduced-motion: reduce`

---

### Task 2: Add `[FullWidth]` and `[Disabled]` to `MJButtonDirective` + Vitest DOM + Axe Tests

**Files:**
- Modify: `packages/Angular/Generic/ui-components/src/lib/button/button.directive.ts`
- Modify: `packages/Angular/Generic/ui-components/src/lib/button/button.directive.dom.test.ts`

- [ ] **Step 1: Write failing Vitest DOM + axe tests** in `button.directive.dom.test.ts` covering:
  1. `[FullWidth]="true"` adds `mj-btn--full`; `[FullWidth]="false"` (default) omits it.
  2. `<a mjButton href="/docs" [Disabled]="true">` sets `aria-disabled="true"` and `tabindex="-1"`, adds no invalid `disabled` attribute on `<a>`, prevents click default + stops propagation, and restores/removes `tabindex` and removes `aria-disabled` when flipped back to `[Disabled]="false"`.
  3. `<a mjButton href="/docs" tabindex="0" [Disabled]="true">` restores `tabindex="0"` when `[Disabled]` returns to `false`.
  4. `<button mjButton [disabled]="true">` (native lowercase binding, `[Disabled]` unbound) stays `disabled === true` across change detection cycles (non-clobbering regression test) and blocks `Toggleable` state flips on click.
  5. `<button mjButton [Disabled]="true">` sets `button.disabled === true` and clears it when set back to `false`.
  6. `ExpectNoAxeViolations` passes on enabled and disabled `<button mjButton>` and `<a mjButton>`.

- [ ] **Step 2: Implement `[FullWidth]` and `[Disabled]` in `button.directive.ts`:**
  - `@Input() FullWidth = false;` + `@HostBinding('class.mj-btn--full') get isFullWidth(): boolean { return this.FullWidth; }`
  - `@Input() set Disabled(value: boolean)` / `get Disabled(): boolean` using explicit DOM mutation on `this.host.nativeElement` so unbound native `<button [disabled]>` is never touched.
  - Guard `OnClick(event: MouseEvent)` and `@HostListener('keydown', ['$event'])` (Enter/Space on disabled `<a>`) via `isHostDisabled()`.

- [ ] **Step 3: Run unit tests:**
  ```bash
  cd packages/Angular/Generic/ui-components && npm run test
  ```

---

### Task 3: Tokenize `button.scss`, Lower Hover Specificity via `:where()`, Add Reduced Motion & Link-Disabled Styles

**Files:**
- Modify: `packages/Angular/Generic/ui-components/src/lib/button/button.scss`

- [ ] **Step 1: Update base `.mj-btn`:**
  - Add `box-sizing: border-box` so `<a mjButton [FullWidth]="true">` with `width: 100%` + padding + border never overflows its container.
  - Set `--_mj-button-height: var(--mj-button-height, 44px); min-height: var(--_mj-button-height);`.
  - Split `border: 1px solid transparent` into `border-width: var(--mj-button-border-width, 1px)`, `border-style: var(--mj-button-border-style, solid)`, and `border-color: var(--_mj-button-border, transparent)`.
  - Replace hover/active exclusion chains with `:where(:not(:disabled):not([disabled]):not([aria-disabled="true"]):not(.mj-btn--flat):not(.mj-btn--icon):not(.mj-btn--outline):not(.mj-btn--sm))` so specificity drops from `(0,7,0)` to `(0,2,0)`.
  - Keep `&:focus-visible` `(0,2,0)` after hover/active, reading `box-shadow: var(--mj-button-shadow-focus, var(--mj-focus-ring))` so focus ring wins when hovered and focused simultaneously.
  - Extend disabled selector to `&:disabled, &[disabled], &[aria-disabled="true"]` reading `--mj-button-{bg,text,border,opacity}-disabled`.
  - Add `@media (prefers-reduced-motion: reduce)` inside `.mj-btn` setting `transition: var(--mj-transition-colors)` and suppressing hover/active `transform`.

- [ ] **Step 2: Wire all 8 variants, sizes (`sm`, `lg`), `.mj-btn--circle`, `.mj-btn--full`, `.mj-btn--selected`, `.mj-btn-group`, and `@media (pointer: coarse)`:**
  - All variant hover/active rules use `&:where(:not(:disabled):not([disabled]):not([aria-disabled="true"])):hover` and `:active`, keeping specificity at `(0,2,0)`.
  - `.mj-btn--circle` sizes `width`, `height`, `min-width`, and `min-height` from `var(--_mj-button-height)` and keeps `padding: 0` after sizes and `@media (pointer: coarse)`.
  - `.mj-btn--full { width: 100%; }`.
  - `.mj-btn-group` `:first-child` / `:last-child` read `var(--mj-button-radius, var(--mj-radius-control, var(--mj-radius-md)))`.

- [ ] **Step 3: Build `@memberjunction/ng-ui-components` and `@memberjunction/ng-realtime-widget` (to verify `build-global-styles.mjs` drift assertions) and run all UI gates:**
  ```bash
  ./.github/scripts/check-mj-btn-override.sh --file packages/Angular/Generic/ui-components/src/lib/button/button.scss
  ./.github/scripts/check-css-hex-tokens.sh --file packages/Angular/Generic/ui-components/src/lib/button/button.scss
  ./.github/scripts/check-focus-ring.sh --file packages/Angular/Generic/ui-components/src/lib/button/button.scss
  ./.github/scripts/check-ngc-scss.sh --all
  ```

---

### Task 4: Visual & Computed-Style Verification Matrix (Playwright)

Because jsdom does not evaluate `button.scss`, verify the compiled CSS in Chromium via Playwright against a standalone fixture page loading `_tokens.scss` + `button.scss` (before vs. after):

- [ ] **Resting parity (0px diff):** All 8 variants x 3 sizes (`sm`, `md`, `lg`), `Shape="circle"` (`sm`, `md`, `lg`), `Toggleable` + `Selected`, `.mj-btn-group`, and disabled `<button>` in light mode, dark mode (`[data-theme="dark"]`), and `pointer: coarse`.
- [ ] **Bugfix assertions:**
  1. Hovered + `:focus-visible` primary button computes `box-shadow` equal to `--mj-focus-ring` (not `0 4px 8px rgba(0, 0, 0, 0.1)`).
  2. Under `prefers-reduced-motion: reduce`, hovered primary button computes `transform: none`.
  3. `<a mjButton [Disabled]="true">` matches disabled visual styling and blocks navigation on click.
  4. `<button mjButton [FullWidth]="true">` and `<a mjButton [FullWidth]="true">` measure exact container width with zero horizontal overflow.
  5. Open App restyle smoke test: setting only `--mj-button-*` variables on a wrapper container (pill radius, `36px` height, flat hover shadow/transform `none`, custom `outline`/`secondary`/`flat`/`disabled` colors) restyles every variant, circle button, and button group inside the container with **0** `.mj-btn` rules.

---

### Task 5: Changeset & PR Handoff

**Files:**
- Create: `.changeset/mj-button-component-tokens.md`

- [ ] Author a `patch` changeset for `@memberjunction/ng-ui-components` documenting:
  - The `--mj-button-*` Tier 3 custom property surface.
  - New `[FullWidth]` and `[Disabled]` inputs on `mjButton`.
  - Specificity reduction on `.mj-btn` hover/active rules from `(0,7,0)` to `(0,2,0)` via `:where()` (noting that any downstream `.mj-btn:hover` override that previously lost to `(0,7,0)` will now apply).
  - Focus ring, `prefers-reduced-motion`, and `a[mjButton]` disabled fixes.
