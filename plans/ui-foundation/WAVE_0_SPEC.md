# Project Lego: Wave 0 Spec

**Status:** DRAFT 2026-11-13, for review. Updated 2026-11-18 with decisions from Matt and Colin's UI/UX Check-In. Updated 2026-11-23: every layer kind gets a phone presentation, not only dialogs (Matt; Section 6.2.1).
**Parents:** [UNIFIED_PLAN.md](UNIFIED_PLAN.md), [NAMING.md](NAMING.md), [WAVE_0_PLAN.md](WAVE_0_PLAN.md)

This spec defines the Wave 0 foundation in Angular terms: the CSS cascade contract, the three-tier token architecture, the unified CDK overlay/announcer base, the three Wave 0 primitives (`surface`, `layer`, `row`), the event and L0-L3 layering rules, the package shape (D9), the intentional visible changes, and the prototype gate criteria.

Nothing in Wave 0 ships to `@memberjunction/ng-ui-components` until the prototype gate (Section 11) passes.

---

## 1. Facts (Measured Inventory)

Measured from the repository on 2026-11-13:

1. **Encapsulation in `@memberjunction/ng-ui-components`**:
   - 59 `@Component` and `@Directive` declarations exist under `packages/Angular/Generic/ui-components/src/lib`.
   - 0 opt out of Angular's emulated view encapsulation (`ViewEncapsulation.None` is not used).
   - 13 component/feature `.scss` files are copied flat into `dist/lib/` via `copy-assets` in `packages/Angular/Generic/ui-components/package.json`; on `next`, `explorer-app/src/lib/styles.scss` imports 12 of the 13 (all except `card-grid/card-grid`, proposed in PR #6610) and `explorer-app/src/lib/styles/main.scss` imports 11 (omitting `tabs/tabs` and `card-grid/card-grid`).
2. **Token tiers vs. `NAMING.md`**:
   - Source of truth is `packages/Angular/Generic/shared/src/lib/_tokens.scss` (675 lines), with deprecated aliases in `packages/Angular/Explorer/explorer-app/src/lib/styles/_variables.scss` (29 lines).
   - **Tier 1 (Scale)** exists for color palettes, typography, spacing, radius, shadows, transitions, and z-index (`--mj-z-drawer` and `--mj-z-dialog` in the 1000+ overlay band).
   - **Tier 2 (Role)** exists for surfaces (`--mj-bg-*`), text (`--mj-text-*`), borders (`--mj-border-*`), brand/status/viz roles, and focus rings (`--mj-focus-ring`, `--mj-focus-ring-color`). **Missing today:** radius roles (`--mj-radius-control`, `--mj-radius-surface`, `--mj-radius-overlay`, `--mj-radius-pill`), control-height steps (`--mj-control-height-sm`/`md`/`lg` with `pointer: coarse`), and surface-scoped text re-declarations on dark elevated surfaces.
   - **Tier 3 (Component)** exists centrally only for `--mj-login-*` and `--mj-logo-*` in `_tokens.scss`. Other component variables (such as `--mj-tab-accent`) live ad-hoc in component stylesheets.
3. **Package exports & deep `dist` imports**:
   - `packages/Angular/Generic/ui-components/package.json` exposes a single barrel (`./dist/public-api.js`) with no `"exports"` map and `"mjUILayer": "widgets"`.
   - `packages/Angular/Generic/realtime-widget/scripts/build-global-styles.mjs` reads three files by raw `dist/` path:
     - `@memberjunction/ng-shared-generic/dist/lib/_tokens.scss`
     - `@memberjunction/ng-ui-components/dist/lib/button/button.scss`
     - `@memberjunction/ng-ui-components/dist/lib/input/input-switch-progress.scss`
4. **CDK usage & overlay duplication**:
   - `@angular/cdk/overlay` (`OverlayModule`, `ConnectedPosition`) is used in 5 pickers/popovers: `dropdown`, `combobox`, `datepicker`, `icon-picker`, `filter-popover`.
   - `@angular/cdk/menu` is used in `menu`; `@angular/cdk/drag-drop` is used in `workspace-tab-strip`.
   - `@angular/cdk/a11y` (`FocusTrapFactory`, `LiveAnnouncer`) is not used anywhere in `ui-components`.
   - The 4 overlay containers (`dialog`, `slide-panel`, `bottom-sheet`, `window`) do not use CDK:
     - `dialog` and `bottom-sheet` each hand-roll `querySelectorAll` focus traps and `previousFocus.focus()` restore; `slide-panel` and `window` have none.
     - All 4 implement separate Escape handlers.
     - `dialog.component.ts` and `bottom-sheet.component.ts` each mutate `document.body.style.overflow = 'hidden'` directly.
     - Z-index stacking is fragmented. `_tokens.scss` defines an 11-step `--mj-z-*` scale (`base` 0, `dropdown` 100, `sticky` 200, `fixed` 300, `modal-backdrop` 400, `modal` 500, `popover` 600, `tooltip` 700, `toast` 800, `drawer` 1000, `dialog` 1200), but in `ui-components` only `slide-panel` (`var(--mj-z-drawer, 1000)`) and `dialog` (`var(--mj-z-dialog, 1200)`) read it. Elsewhere the values are hardcoded: `1000` (`datepicker.scss`, `dropdown.scss`, `workspace-tip.directive.ts`), `9998`/`9999` (`bottom-sheet`, `filter-popover`, `left-nav`), `10000` (`window.scss`), `10001` (`dialog.service.ts`) and `20000` (`confirm-dialog.service.ts`).
   - The CDK-backed controls listed above already render in the browser top layer. `@angular/cdk` 21 (`^21.2.14` in `ui-components`) opens overlay panes as native `popover="manual"` elements (`usePopover` defaults to `true` where the Popover API exists), and top-layer content paints above every z-index in the document, so their hardcoded z-index values do not decide what covers them.
5. **`explorer-app/src/lib/styles/` globals & `.mj-*` collisions**:
   - Explorer's live global stylesheet is `explorer-app/src/lib/styles.scss`. MJExplorer's `src/styles.scss` loads it through `@use "@memberjunction/ng-explorer-app/dist/styles.scss"`. It declares unlayered global element and legacy component rules through `_typography.scss` (`body`, `h1`-`h5`, `p`, `a`) and `_common.scss` (731 lines: `*`, `input, textarea, select`, `body, h1, h2, h3`, `a`, `.form-*`, `.mj-*`). It also imports `_badges.scss` (`.badge-*`) and `_utilities.scss` (`.text-*`, `.flex-*` and similar, mostly `!important`), which use no `.mj-` names.
   - The alternate entry `explorer-app/src/lib/styles/main.scss` also imports `_shared-patterns.scss` (`.mj-badge*`, `.mj-card*`, `.mj-dashboard-header`, `.mj-empty-state`, `.mj-input`, `.mj-loading*`, `.mj-panel*`, `.mj-search*`, `.mj-table`). Nothing in this repo loads `main.scss`: MJExplorer's build uses `src/styles.scss`, and its `test` target points at a `src/styles/main.scss` that does not exist. `copy-assets` still ships it as `dist/styles/main.scss`, so a downstream host could import it. Its `.mj-input` block restyles the library's own input class from `ui-components/src/lib/input/input.scss`.
   - CSS class usage of `_common.scss` `.mj-*` classes across `packages/Angular`: `.mj-card` (18 files; header 7, body 7, footer 2), `.mj-grid` (11 files), `.mj-empty-state` (4 files; `<mj-empty-state>` tag is in 368 files), `.mj-toolbar` (3 files), `.mj-modal-header`/`body`/`footer` (3 files each), `.mj-breadcrumb` (1 file), `.mj-header*` / `.mj-container*` / `.mj-content-container` / `.mj-page-container` / `.mj-loading*` / `.mj-search*` (1 to 3 files each, plus downstream BizApps consumers of `explorer-app/styles.scss`).
6. **Existing Playwright & `axe` infrastructure**:
   - `@playwright/test` and `@axe-core/playwright` already run under `e2e/` (`e2e/playwright.config.ts`, `pnpm test:e2e`, `e2e/specs/a11y.spec.ts`, `e2e/visual-capture/`, and `.github/workflows/release-test.yml` with a primed MSAL auth profile), and `@memberjunction/ng-test-utils` exports `ExpectNoAxeViolations` for Vitest DOM specs. Pixel-diff `toHaveScreenshot` assertions are what Wave 0 adds.

---

## 2. Architecture Calls (D1 & D2)

### 2.1 Encapsulation, prefix, and layers (D1)
Every Wave 0+ primitive ships with:
1. `encapsulation: ViewEncapsulation.None` on the Angular `@Component`.
2. **`.mj-` class prefix** on every element and part class inside the primitive (e.g. `.mj-surface`, `.mj-layer`, `.mj-row`, `.mj-row-leading`).
3. **All primitive CSS wrapped in `@layer primitives`**.
4. **No `:host` attribute-leak assumptions**: primitives do not rely on `_ngcontent-*` scoping. Host-element layout (`display`, `box-sizing`) uses the component's tag or `.mj-<name>` host class inside `@layer primitives` so an unlayered host rule always wins without `!important`.
5. **State classes are `.is-hover` and `.is-selected`**, set on the host next to its `.mj-` class (`.mj-surface.is-selected`, `.mj-row.is-hover`). They are the one unprefixed exception, so selectors only ever use them compounded with an `.mj-` class and they never style anything on their own. Primitives do not use `data-*` attributes for visual state. Interactive primitives give `:hover` and `.is-hover` the same rule, so a host can show the hover look on demand. Accessibility state still goes in ARIA (`aria-selected`, `aria-current`); the class is only the styling hook. This matches the `.mj-surface-*` classes proposed in PR #6609.

### 2.2 Open axes (D2)
Closed union types for visual axes (`visual-role`, `tone`, `density`, `emphasis`) are prohibited unless they are defaults over an open string axis.
- **Inputs accept `string` with documented defaults** (e.g. `Tone = input<string>('neutral')`, `VisualRole = input<string>('surface')`). The visual role axis uses `VisualRole` (`visual-role` in Custom Elements) and `--mj-visual-role-<name>-*` tokens ([NAMING.md](NAMING.md)) so it never collides with HTML's native ARIA `role` attribute or overloads the word "role" with Tier 2's name.
- **Runtime variable mapping**: primitives bind runtime private variables on their host (`--_mj-tone-text: var(--mj-tone-<name>-text, ...)`, `--_mj-visual-role-bg: var(--mj-visual-role-<name>-bg, ...)`) so a brand adds a custom tone or visual role purely by declaring `--mj-tone-<name>-*` or `--mj-visual-role-<name>-*` tokens in `:root` without writing CSS selectors against primitive internals. Shipped tones `success`, `warning`, `error`, and `info` default to `--mj-status-<name>-*`.

### 2.3 PascalCase Angular inputs vs. kebab-case Custom Element attributes
MemberJunction's Angular convention uses PascalCase inputs in both TypeScript and Angular templates (`[Density]="'sm'"`, `[PhonePresentation]="'anchored'"`), while HTML parsers lowercase Custom Element attributes (`density="sm"`, `phone-presentation="anchored"`). Note that Angular's `input(..., { alias: 'density' })` would replace the Angular template binding name and create two dialects across MJ components, so `alias` is **not** used.
- **Rule**: New L1 primitives adopt signal `input()` / `output()` properties (`Density`, `Interactive`, `PhonePresentation`) as a deliberate convention so Angular templates keep `[Density]` everywhere. In the Angular Elements registrar (`defineElement`), `reflectComponentType(component)` derives kebab-case attribute names (`PhonePresentation` -> `phone-presentation`) and extends `ctor.observedAttributes` and `ctor.prototype.attributeChangedCallback` / `connectedCallback` automatically.
- **Why**: Zero dialect split in Angular templates, zero `MutationObserver`, and native Custom Element attribute reactivity. Primitives are zoneless-compatible (`provideZonelessChangeDetection()`); the Wave 0 prototype Element bundle runs without `zone.js`, while `ng-realtime-widget` migrates off its `zone.js` entry and `@layer mj-realtime-widget-defaults` in Phase 2.

---

## 3. Token Layers and Scales

### 3.1 Three-tier resolution chain
Every primitive resolves visual properties through the three-tier chain defined in [NAMING.md](NAMING.md):

```css
/* Tier 3 (component) -> Tier 2 (role) -> Tier 1 (scale) */
border-radius: var(--mj-button-radius, var(--mj-radius-control, var(--mj-radius-md)));
```

1. **Tier 1 (Scale)**: `--mj-<family>-<step>`. Context-free values (`--mj-radius-md`, `--mj-space-4`, `--mj-color-brand-500`, `--mj-control-height-md`). Defined on `:root`.
2. **Tier 2 (Role)**: `--mj-<family>-<role>`. System opinions (`--mj-radius-control`, `--mj-bg-surface`, `--mj-surface-elevated-bg`, `--mj-text-primary`). Defined on `:root` and overridden in `[data-theme="dark"]` and `.mj-surface-*` scopes.
3. **Tier 3 (Component)**: `--mj-<component>[-<variant>][-<part>]-<property>[-<state>]`. Unset by default so Tier 2/1 defaults flow through; set by hosts or themes as a targeted override.

### 3.2 File locations and brand overrides
- **Source of truth**: `packages/Angular/Generic/shared/src/lib/_tokens.scss`, also emitted as compiled CSS (`tokens.css`) under the D9 package exports so non-SCSS hosts and Angular Elements load it without `sass`.
- **Theme overrides**: `[data-theme="dark"]` in `_tokens.scss` and `ThemeEngine` runtime seeds override Tier 1 and Tier 2 tokens.
- **How a brand overrides**:
  - Brand palette or typography everywhere: override Tier 1 (`--mj-color-brand-*`, `--mj-font-family`).
  - System opinion (square corners, compact control height): override Tier 2 (`--mj-radius-control: var(--mj-radius-none)`).
  - Single primitive instance or family: override Tier 3 (`--mj-button-radius: var(--mj-radius-full)`).

### 3.3 Wave 0 token additions (WS6b)

#### Radius roles (Tier 2)
| Token | Default | Covers |
| --- | --- | --- |
| `--mj-radius-control` | `var(--mj-radius-md)` (8px) | Buttons, inputs, selects, textareas, toggles, segmented controls |
| `--mj-radius-surface` | `var(--mj-radius-lg)` (12px) | Cards, panels, wells, sections, tiles |
| `--mj-radius-overlay` | `var(--mj-radius-lg)` (12px) | Dialogs, sheets, popovers, menus, toasts |
| `--mj-radius-pill` | `var(--mj-radius-full)` (9999px) | Chips, badges, status dots, avatars, toggle thumbs |

#### Control heights (Scale + touch rule)
```css
:root {
  --mj-control-height-sm: 32px;
  --mj-control-height-md: 40px;
  --mj-control-height-lg: 52px;
}

@media (pointer: coarse) {
  :root {
    --mj-control-height-sm: 44px;
    --mj-control-height-md: 44px;
  }
}
```
- Touch target enforcement (44px, WCAG 2.5.5) lives on the token itself so inputs, dropdowns, and toggles inherit it alongside buttons.
- Density is a user preference (Phase 4) that selects which step (`sm`, `md`, `lg`) controls default to; it adds no new size steps.

#### Surface levels (Tier 2)
Four levels: `sunken`, `base`, `elevated`, `overlay`.
- `--mj-surface-sunken-bg`: `var(--mj-bg-surface-sunken)` (no hover, active, or selected state tokens)
- `--mj-surface-base-bg`: `var(--mj-bg-surface)`
- `--mj-surface-elevated-bg`: `var(--mj-bg-surface-elevated)`
- `--mj-surface-overlay-bg`: `var(--mj-bg-surface-elevated)` (`--mj-bg-overlay` stays the translucent scrim)
- **Border color, width and style are separate tokens.** `--mj-surface-<level>-border` and `--mj-surface-<level>-border-selected` carry color only. Width and style are `--mj-surface-border-width` (`1px`) and `--mj-surface-border-style` (`solid`), with optional per-level overrides `--mj-surface-<level>-border-width` and `--mj-surface-<level>-border-style`. A brand can re-color a surface without restating the stroke, or make surfaces borderless or 2px without touching color. The selected state changes `border-color` only. This matches the token split proposed in PR #6609.
- **State tokens** exist on `base`, `elevated` and `overlay`: `-bg-hover` (`--mj-bg-surface-hover`), `-bg-selected` and `-border-selected` (`--mj-brand-primary`). The selected fill mixes brand primary into the level's background: 8% on `base` and 10% on `elevated` and `overlay` (`color-mix(in srgb, var(--mj-brand-primary) 8%, var(--mj-bg-surface))`). The `.mj-surface-<level>` classes take `.is-hover` and `.is-selected` for these states (Section 2.1).
- Inside a surface container (`.mj-surface-<level>`, matching the utility classes proposed in PR #6609), text and border role tokens (`--mj-text-primary`, `--mj-text-secondary`, `--mj-text-muted`, `--mj-border-default`) are re-pointed to that level's surface tokens so nested children meet WCAG 2.1 AA contrast on both light and dark elevated surfaces per the Ramp B contrast table.
- PRs #6609 and #6610 also propose `--mj-bg-canvas`, `--mj-ambient` / `--mj-ambient-strength` (off by default), and `--mj-font-family-display` (Montserrat) in `_tokens.scss`; when Step 7 lands `@layer reset, foundation, primitives;`, those `:root` / `[data-theme="dark"]` / `.mj-surface-*` rules are wrapped in `@layer foundation`.

---

## 4. Cascade Layer Order

### 4.1 Layer order declaration
Every host (Explorer, standalone Angular apps, and Angular Elements) declares this order before any component or reset CSS loads:

```css
@layer reset, foundation, primitives;
```

- **`reset`**: Legacy global resets and element defaults from Explorer's live entry (`_typography.scss` and `_common.scss`), plus `_shared-patterns.scss` only if the alternate `styles/main.scss` entry survives Section 4.3. Lowest priority.
- **`foundation`**: Design tokens (`:root`, `[data-theme="dark"]`, surface level re-points) and base focus/typography utilities.
- **`primitives`**: New and converted `@memberjunction/ng-ui-components` primitive styles. Note: the 13 existing copied `.scss` files in `ng-ui-components` remain unlayered in Step 7 and move into `@layer primitives` one by one as each component is converted in Waves 1 and 2 (paired with before-and-after screenshot diffs).
- **Unlayered host CSS**: Any host CSS outside `@layer` beats all three layers by construction with zero `!important`.

### 4.2 Where the order is declared
1. `@memberjunction/ng-shared-generic` emits `@layer reset, foundation, primitives;` as the first line of `_tokens.scss` and the compiled `tokens.css`.
2. `explorer-app` (`styles.scss`, and `styles/main.scss` while it exists) imports tokens before `_typography.scss`, `_common.scss`, or third-party stylesheets.
3. Angular Elements bundles (the Wave 0 prototype now, and `ng-realtime-widget` when its `@layer mj-realtime-widget-defaults` migrates in Phase 2) open their injected stylesheet with `@layer reset, foundation, primitives;` and wrap defaults in `@layer foundation` and primitive CSS in `@layer primitives`.

### 4.3 Moving `explorer-app/src/lib/styles/` globals into `@layer reset`
Only after Step 4 (`e2e/specs/ui-foundation-baseline.spec.ts`) captures baseline Explorer screenshots, Step 7 wraps the unlayered global element and legacy rules in `_typography.scss` and `_common.scss` in `@layer reset { ... }` (keeping `@import url(...)` rules at the top of `_typography.scss` outside `@layer` per CSS syntax).
- **The alternate entry.** `styles/main.scss` and `_shared-patterns.scss` are deleted if the Step 1 inventory finds no downstream host importing `@memberjunction/ng-explorer-app/dist/styles/main.scss`. If one does, both get the same `@layer reset` wrap, and that host checks its own screens, because Explorer's baseline never loads them.
- **What stays unlayered.** `_badges.scss`, `_utilities.scss`, `_md3-theme.scss` and `_golden-layout-theme.scss` stay outside `@layer`. None sets element rules or uses an `.mj-` class name, and the utilities rely on `!important`, which reverses inside a layer (a layered `!important` beats an unlayered one).

### 4.4 `.mj-*` collision rule
Primitives own the `.mj-` prefix. Because `@layer reset` only loses to `@layer primitives` on properties both rules declare (undeclared properties still bleed through), **no primitive may ship with a class name that still exists in `_common.scss`** (or in `_shared-patterns.scss`, if that file survives Section 4.3).
- Wave 0 (`surface`, `layer`, `row`) has zero collisions with either file.
- Colliding `_common.scss` classes (`.mj-card*`, `.mj-grid*`, `.mj-empty-state`, `.mj-toolbar*`, `.mj-modal-header`/`-body`/`-footer`, `.mj-breadcrumb*`, `.mj-header*`, `.mj-container*`, `.mj-content-container`, `.mj-page-container`, `.mj-loading`, `.mj-search*`) are renamed to `.mj-legacy-*` or retired in the Wave 1/2 PR that introduces the corresponding primitive. If `_shared-patterns.scss` survives, its `.mj-badge*`, `.mj-panel*`, `.mj-table` and `.mj-dashboard-header` join this list. Because downstream apps (such as BizApps and OpenApps importing `explorer-app/styles.scss`) may reference `.mj-card*`, each conversion PR keeps a deprecated alias or documents the class rename in release notes before removing the rule in a major version.
- **`.mj-btn*` and `.mj-input` are not collisions.** They are the library's own classes (`ui-components` `button.scss` and `input.scss`) and are never renamed. A global rule that restyles one of them, such as the `.mj-input` block in `_shared-patterns.scss`, is deleted, not renamed.

---

## 5. Layer Service and Announcer

A single CDK-backed service pair replaces the four separate overlay implementations (`dialog`, `slide-panel`, `bottom-sheet`, `window`) and supports `popover`, `menu`, `tooltip`, and `toast`:

### 5.1 `MJLayerService` (on `@angular/cdk/overlay` + `@angular/cdk/a11y`)
- **Single overlay stack**: Tracks open layer refs in a LIFO stack (`MJLayerRef[]`). Escape and backdrop clicks target only the topmost dismissible layer.
- **Stacking (top layer, no z-index ladder)**: Every layer opens through CDK `Overlay`, which in `@angular/cdk` 21 renders the pane host as a native `popover="manual"` element in the browser top layer. Top-layer elements paint above every z-index in the document and stack among themselves in the order they open, so a popover opened from a dialog sits above it with no z-index arithmetic, and layers get no z-index token. The `--mj-z-*` scale stays for in-page stacking (sticky headers, the left nav), and the hardcoded overlay bands (`1000`, `9998`/`9999`, `10000`, `10001`, `20000`) retire as their overlays convert.
  - **Migration rule**: a converted layer must not open an unconverted overlay. A bespoke overlay's z-index cannot reach above the top layer, so it would render underneath the layer that opened it. This is why `MJConfirmService` (`20000`) converts together with dialog in Wave 2.
  - **Fallback**: where the Popover API is missing, CDK falls back to `.cdk-overlay-container` at `z-index: 1000`, declared inside CDK's own `@layer cdk-overlay`. The Popover API ships in Chrome and Edge 114+, Safari 17+ and Firefox 125+.
- **Focus trap, popover/menu entry, & restore**: Uses `ConfigurableFocusTrapFactory` (`@angular/cdk/a11y`) on modal/sheet/panel layers, moves initial focus into both modal and non-modal `popover`/`menu` portals (since CDK portals render at the end of `document.body` outside natural DOM Tab order), synchronizes `aria-expanded` on anchor triggers and points their `aria-controls` at the portaled panel while open (the `<mj-layer>` host is an empty shell once its panel is portaled, so consumers never set `aria-controls` themselves), provides Arrow/Home/End roving focus on `Kind="menu"`, and restores focus to the trigger element on close.
- **Angular Elements portal safety (`DomPortal`)**: Uses CDK `DomPortal` backed by a hidden staging wrapper (`.mj-layer-staging`) rather than `TemplatePortal` when hosting custom elements so nested Angular Elements are not destroyed by `@angular/elements`'s disconnect timer while closed.
- **Ref-counted scroll lock**: Replaces direct `document.body.style.overflow = 'hidden'` mutations with a ref-counted lock (or CDK `BlockScrollStrategy`) so closing a nested modal never unlocks scroll while a parent sheet is still open.
- **Phone presentation**: On phone viewports the service presents each layer as a bottom sheet, full screen, or anchored, per its `PhonePresentation` (Section 6.2.1). Dialogs, menus and popovers default to a sheet, side sheets fill an upright phone, and tooltips stay anchored.

### 5.2 `MJAnnouncerService` (on `@angular/cdk/a11y` `LiveAnnouncer`)
- Wraps `LiveAnnouncer` with polite (`polite`) and assertive (`assertive`) channels, deduplicating rapid identical announcements and cleaning up on destroy.
- Used by `MJLayerService` (dialog/sheet open/close announcements when needed), toasts, pickers, and row selection changes.

---

## 6. Wave 0 Primitives: `surface`, `layer`, `row`

All three primitives use `ViewEncapsulation.None`, `.mj-` classes inside `@layer primitives`, open string axes, and named parts (layout boxes as elements/attributes; leaf text as attribute directives so consumers control heading levels).

### 6.1 `mj-surface`
A passive or interactive container that establishes a surface level (applying `.mj-surface-<level>` to its host so it composes directly with the Tier 2 utility classes in `_tokens.scss`) and re-points Tier 2 text/border tokens for its subtree.
- **Inputs**:
  - `Level: 'sunken' | 'base' | 'elevated' | 'overlay' | string = 'base'`
  - `Elevation: 'none' | 'sm' | 'md' | 'lg' | string = 'none'`
  - `Interactive: boolean = false` (enables hover/active/selected state tokens; ignored when `Level === 'sunken'`)
  - `Selected: boolean = false` (adds `.is-selected` to the host)
  - `Padding: string = 'md'` (maps to `--mj-space-*` or `none`)
  - `Radius: string = 'surface'` (maps to `--mj-radius-surface` by default)
  - `Tone: string = 'neutral'` (open semantic axis, `--mj-tone-<name>-*`)
  - `VisualRole: string = 'surface'` (open visual-role axis, `--mj-visual-role-<name>-*`)
- **Named parts**: `mjSurfaceHeader`, `mjSurfaceBody`, `mjSurfaceFooter` (order-free, all optional).
- **Exposed tokens (Tier 3, instance only)**: `--mj-surface-bg`, `--mj-surface-border`, `--mj-surface-radius`, `--mj-surface-padding` and `--mj-surface-shadow`, plus their `-hover` / `-selected` state variants. `--mj-surface-border` and its `-selected` variant carry color only (Section 3.3). `.mj-surface` resets all of them in `@layer primitives` ([NAMING.md](NAMING.md)), so an override set on one surface never cascades into a nested `<mj-surface>`. Each falls back to the Tier 2 token its input selects: `Level` for bg and border (`--mj-surface-<level>-bg`, `--mj-surface-<level>-border`), `Radius`, `Padding` and `Elevation` for the rest.
- **Stroke width and style are Tier 2, not Tier 3.** The primitive reads `--mj-surface-<level>-border-width`, then the cross-level default `--mj-surface-border-width` (`1px`), and the same for `-border-style` (`solid`), as PR #6609 declares them on `:root`. A stroke change is a container-scoped role override by design, so a host that makes one surface borderless also makes the same-level surfaces nested inside it borderless.
- **Accessibility**: Semantic container by default (no forced `role`); when `Interactive` is true without a nested button/link, pairs with `mjClickable` or native `<button>`/`<a>`.

### 6.2 `mj-layer`
The structural primitive rendered inside `MJLayerService` (or declaratively) for `dialog`, `sheet`, `popover`, `menu`, `tooltip`, and `toast`.
- **Inputs**:
  - `Kind: 'dialog' | 'sheet' | 'popover' | 'menu' | 'tooltip' | 'toast' | string = 'dialog'`
  - `Placement: 'center' | 'start' | 'end' | 'bottom' | 'top' | string = 'center'`
  - `Modal: boolean | undefined = undefined` (defaults by `Kind`: `true` for `'dialog'` and `'sheet'`, `false` for `'popover'`, `'menu'`, `'tooltip'`, and `'toast'`, except that a layer presented as a sheet or full screen on a phone defaults to `true` (Section 6.2.1); explicit boolean overrides)
  - `Closeable: boolean = true`
  - `Size: 'sm' | 'md' | 'lg' | 'full' | string = 'md'`
  - `PhonePresentation: 'sheet' | 'full-screen' | 'anchored' | undefined = undefined` (defaults by `Kind`, Section 6.2.1; explicit value overrides). Replaces the earlier `AllowPhoneSheet` boolean, which applied to dialogs only and could not express full screen.
- **Named parts**: `mjLayerHeader`, `mjLayerTitle` (attribute directive on consumer's `<h2>`/`<h3>`), `mjLayerBody`, `mjLayerFooter` (affirmative button on the left, decline on the right per `packages/Angular/CLAUDE.md`).
- **Exposed tokens**: `--mj-layer-bg` (`--mj-surface-overlay-bg`), `--mj-layer-radius` (`--mj-radius-overlay`), `--mj-layer-shadow`, `--mj-layer-padding`, `--mj-layer-max-width`, `--mj-layer-sheet-max-width` (unset: full width on a phone held upright, 640px on a phone held sideways; Section 6.2.1), `--mj-layer-backdrop-bg` (`--mj-bg-overlay`).
- **Accessibility**: `role="dialog"` + `aria-modal="true"` + `aria-labelledby` wired to `mjLayerTitle` when modal; non-modal `role="dialog"` / `role="menu"` / `role="tooltip"` for anchored kinds; `role="status"` / `role="alert"` for `toast`; Escape + focus trap (when modal) + focus return guaranteed by `MJLayerService`.
- **Toasts (for Wave 2)**: A node mounted with `role="status"` and its text already in place is announced unreliably, in Safari with VoiceOver especially: a live region has to exist before its text changes. So `MJAnnouncerService` makes the announcement, and the toast element is the visual. A toast with an action ("Undo", "Dismiss") is not a `status` or `alert`, which flatten their content into one announcement; it is a `role="region"` or a non-modal `role="dialog"`, reachable by keyboard, and it does not auto-dismiss while it has focus or hover (WCAG 2.2.1 Timing Adjustable).

#### 6.2.1 Phone presentation

On phones, anything people choose from or fill in opens as a bottom sheet. Anything read at a glance, or tied to a field being typed into, stays anchored.

- **One breakpoint, two shapes.** "Phone" is the `PhoneViewport` media query: a narrow screen (`max-width: 640px`, a phone held upright) or a short touch screen (`max-height: 480px` and `pointer: coarse`, a phone held sideways). The touch pointer keeps a short desktop window used with a mouse out of phone mode. `MJLayerService` checks the query when a layer opens and marks the overlay pane (`mj-layer-pane-phone-sheet` or `mj-layer-pane-phone-full-screen`, plus `mj-layer-pane-phone-short` when held sideways), and the stylesheet styles only those marks, so CSS and behavior never disagree.
- **Defaults by `Kind`.** An explicit `PhonePresentation` overrides the default.

| `Kind` | On phones | Why |
| --- | --- | --- |
| `dialog` | `sheet` | Thumb reach: the bottom of the screen is where one hand reaches. Heavy configuration sets `full-screen`. |
| `sheet` | bottom: `sheet`; side: `full-screen` upright | A bottom sheet already is one. A side sheet at 92% width leaves a strip of page beside it, which reads as a gap rather than as context, so on a phone held upright it fills the screen and still slides in from its side. Held sideways, the side panel fits beside the page and stays as it is on desktop. |
| `menu` | `sheet` | Menus open from triggers in headers and toolbars, the hardest place to reach one-handed. Full-width rows are bigger targets than a narrow menu's. |
| `popover` | `sheet` | Covers pickers and option lists: the dropdown list, filter popover, datepicker and icon picker. At phone width an anchored panel near an edge gets flipped or squeezed; a sheet always has the full width. |
| `tooltip` | `anchored` | Read at a glance and tied to the element it describes. |
| `toast` | not affected | Toasts have their own placement and are never anchored or presented as a sheet. |

- **`anchored` is for content tied to a field being typed into.** Combobox and autocomplete suggestion lists set `PhonePresentation="anchored"`. The on-screen keyboard covers roughly the bottom 40% of a phone screen, so a sheet would open behind it or pull the suggestions away from the text they match.
- **`full-screen` is for content that needs the whole screen**: side sheets on an upright phone, heavy configuration, long forms, and search-first pickers such as the foreign-key search grid. It is the "or full screen" half of the unified plan's dialog rule. A full-screen layer covers its backdrop and phones have no Escape key, so it must show a visible close or back control.
- **Tooltips on touch.** Phones have no hover, so a tooltip opens on tap or focus, and nothing people need to finish a task lives only in a tooltip.

When a kind that is anchored on desktop is presented as a sheet or full screen on a phone:

- **It becomes modal.** `Modal` defaults to `true`: backdrop (`--mj-layer-backdrop-bg`), focus trap, ref-counted scroll lock, and dismissal by backdrop tap or Escape. An explicit `Modal` still overrides.
- **Roles hold.** The container is `role="dialog"` with `aria-modal="true"`, named by the layer's `Label`, its title, or the trigger's accessible name. For a menu the overlay pane is that container, so the list inside it keeps `role="menu"` and its Arrow/Home/End roving focus. Choosing an item closes the sheet, as it closes the anchored menu, and focus returns to the trigger.
- **It shows a title.** Anchored, a menu is identified by sitting next to its trigger. A sheet at the bottom of the screen loses that link, so it shows `mjLayerTitle`. When the consumer gives none, the layer shows its `Label`, or else the trigger's accessible name.
- **It fits the screen.** The sheet sizes to its content up to a maximum that leaves the top of the page visible, its body scrolls inside, and its bottom padding includes `env(safe-area-inset-bottom)` so the last row clears the iPhone home indicator.
- **Width.** On a phone held upright the sheet spans the full width, as platform sheets do: every row gets the whole screen as its target, and touching both side edges says the sheet came from the screen, not from the trigger. Held sideways, a full-width sheet would be a banner, so it caps at 640px (Material's bottom sheet maximum) and centers. `--mj-layer-sheet-max-width` overrides both, so a brand that wants inset, floating sheets sets one value. It applies to any layer presented as a sheet on a phone, not to `Kind="sheet"` side sheets on desktop.
- **It has a close control.** Phones have no Escape key, and a screen reader stays inside a modal, so the backdrop is out of reach for VoiceOver, TalkBack, Switch Control and Voice Control users. A closeable layer presented as a sheet or full screen on a phone that has no close control of its own gets a generated Close button (`CloseLabel`, default "Close"): full width at the bottom of the sheet, in thumb reach, and a `menuitem` inside a menu so the arrow keys reach it. A consumer marks its own control with `mjLayerClose` (`mj-layer-close` on a Custom Element), which also closes the layer on click and suppresses the generated one.
- **Not in Wave 0:** swipe-down to dismiss and drag handles. The close control, backdrop tap and Escape cover dismissal.

### 6.3 `mj-row`
A horizontal flex/grid item primitive for list items, nav rows, menu items, picker options, and toolbar rows.
- **Inputs**:
  - `Density: 'sm' | 'md' | 'lg' | string = 'md'` (defaults height to `--mj-control-height-<density>`, 44px on `pointer: coarse` for `sm`/`md`)
  - `Interactive: boolean = false`
  - `Selected: boolean = false` (adds `.is-selected` to the host)
  - `Disabled: boolean = false`
  - `Tone: string = 'neutral'` (open semantic axis, `--mj-tone-<name>-*`)
  - `VisualRole: string = 'row'` (open visual-role axis, `--mj-visual-role-<name>-*`)
- **Named parts**: `mjRowLeading` (icon/avatar/checkbox), `mjRowContent` (primary + secondary text), `mjRowTrailing` (badge/action/chevron). Any part can be omitted or reordered in the template without breaking layout.
- **Exposed tokens**: `--mj-row-min-height`, `--mj-row-padding-inline`, `--mj-row-padding-block`, `--mj-row-gap`, `--mj-row-bg`, `--mj-row-bg-hover`, `--mj-row-bg-selected`, `--mj-row-radius`.
- **Accessibility (WCAG 4.1.2 & APG Listbox)**:
  - When `Interactive` is `false` (default), `mj-row` is a pure layout container with no `role` and no `tabindex`; rows that pair a primary link/button with a trailing action button MUST keep `Interactive="false"` so interactive controls are siblings, never nested.
  - When `Interactive` is `true`, `ItemRole` (`'button' | 'option' | 'menuitem' | 'menuitemradio'`) defaults to `'button'` so standalone interactive rows never emit an orphaned `role="option"` outside a listbox. When `ItemRole="option"` inside `[role="listbox"]` (or `@angular/cdk/listbox`), `mj-row` uses roving `tabindex` (one Tab stop per listbox) and `ArrowDown` / `ArrowUp` / `Home` / `End` navigation, guards against missing `[role="listbox"]` ancestors or nested interactive children, renders `--mj-focus-ring`, and enforces a 44px minimum target on `pointer: coarse`.

---

## 7. Events

1. **Cancelable `Before*` and `After*` outputs**:
   - State-changing primitives (`mj-layer`, interactive `mj-row` selection/close) expose `BeforeOpen` / `BeforeClose` / `BeforeSelect` (emitting a cancelable event object `{ Cancel: boolean; Reason?: string }`) and `AfterOpen` / `AfterClose` / `AfterSelect`.
   - Returning or setting `Cancel = true` (or returning `false` from a guard) aborts the transition before DOM/overlay state mutates.
2. **Bubbling & Angular Elements compatibility**:
   - Angular `@Output()` / `output()` events do not bubble across native DOM / Angular Elements boundaries on their own.
   - Where a primitive is exposed as an Angular Element or notifies ancestor non-Angular hosts, lifecycle events dispatch a `CustomEvent('mj-<event>', { bubbles: true, composed: true, detail })` from the host element in addition to the Angular output, matching `ng-realtime-widget`'s event contract.
3. **Signals alignment**:
   - New L1 primitives adopt Angular's signal `input()` / `output()` APIs as a deliberate convention (aligned with PR #6181's composition direction), while existing NgModule components keep `@Input()` / `@Output()` until converted.

---

## 8. L0 to L3 Layering

| Piece | Conceptual Role / `mjUILayer` | Package | Enforcement |
| --- | --- | --- | --- |
| Tier 1 & 2 tokens, `@layer` order | Conceptual foundation (`"mjUILayer": "widgets"` in `package.json`) | `@memberjunction/ng-shared-generic` | `pnpm run check:ui-layers` (TS/manifest boundaries); CSS `@layer` order verified by unit/gate specs until the Phase 3 catalog gate |
| `surface`, `layer`, `row`, `MJLayerService`, `MJAnnouncerService` | L1 (`"mjUILayer": "widgets"`) | `@memberjunction/ng-ui-components` | `pnpm run check:ui-layers` (`mj standards check --check ui-layers`) + co-located DOM specs |
| Explorer `styles/` globals in `@layer reset` | L3 (`"mjUILayer": "shell"`) | `@memberjunction/ng-explorer-app` | `pnpm run check:ui-layers` + Step 7 Playwright baseline check |

Note: `check:ui-layers` enforces TypeScript import and `package.json` `"mjUILayer"` rules only; CSS `@layer` placement is verified by the prototype gate and unit specs now, and automated across all primitives by the Phase 3 catalog gate that replaces `check:ui`. Primitives in L1 (`widgets`) have zero dependencies on `@angular/router`, `NavigationService`, `@memberjunction/ng-shared`, or entity metadata/data access (`RunView`, `Metadata`). Everything arrives via inputs/projection and leaves via events.

---

## 9. Package Shape (D9)

`@memberjunction/ng-ui-components` moves from a single barrel + `copy-assets` flat `.scss` copies to structured `package.json` `"exports"`:

1. **Root barrel (`.`) and transitional `dist/*` passthrough**: Keeps `.` (`./dist/public-api.js`) plus `"./dist/*": "./dist/*"` during Waves 1 to 4 so existing deep SCSS/JS imports do not break before callers migrate. `@memberjunction/ng-shared-generic` gets the same pair when it gains its `exports` map in item 3, because `explorer-app`'s `styles.scss` and `styles/main.scss` import `@memberjunction/ng-shared-generic/dist/lib/tokens` and `build-global-styles.mjs` reads `dist/lib/_tokens.scss` today. Its `.` entry stays a plain path, which every export condition matches, so the realtime widget's `require.resolve('@memberjunction/ng-shared-generic')` keeps working.
2. **Secondary entry points per primitive family**:
   - `@memberjunction/ng-ui-components/surface`
   - `@memberjunction/ng-ui-components/layer`
   - `@memberjunction/ng-ui-components/row`
   (Following the same pattern for each Wave 1/2 family so Angular Elements bundles tree-shake to only the primitives they use.)
3. **Explicit style entry points**:
   - `@memberjunction/ng-shared-generic/tokens.css` and `@memberjunction/ng-shared-generic/tokens.scss`
   - `@memberjunction/ng-ui-components/styles/primitives.css` (and per-family CSS exports)
   So `ng-realtime-widget`, `explorer-app` (including `card-grid/card-grid` proposed in PR #6610), and Angular Elements import documented package exports instead of reaching into `dist/lib/*.scss` by file path.

---

## 10. Intentional Visible Changes

These changes are intentional and must be called out in PR descriptions and verified with visual regression diffs (never shipped silently):

| Change | Before | After | Owner & Wave |
| --- | --- | --- | --- |
| Medium button height (desktop) | 44px | 40px (`--mj-control-height-md`; 44px on `pointer: coarse`) | Tokens: Colin (WS6b, Phase 0). Adoption: Matt (Wave 1/2 `button` PR). |
| Inputs & dropdowns height (desktop) | 38px | 40px (`--mj-control-height-md`; 44px on `pointer: coarse`) | Tokens: Colin (WS6b, Phase 0). Adoption: Matt (Wave 2 `input`/`dropdown` PRs). |
| View toggle height (desktop) | 28px | 32px (`--mj-control-height-sm`; 44px on `pointer: coarse`) | Tokens: Colin (WS6b, Phase 0). Adoption: Matt (Wave 1 `view-toggle` PR). |
| Dark-theme overlays (`dialog`, `sheet`, `slide-panel`, `window`) | Base surface (`neutral-800`) | One step lighter (`elevated` / `neutral-700`) via `--mj-surface-overlay-bg` | Tokens: Colin (WS6b, Phase 0). Adoption: Matt (Wave 2 `layer` conversions). |
| Menus, popovers and pickers on phones (`menu`, `popover`, dropdown list, filter popover, datepicker, icon picker) | Anchored under the trigger | Bottom sheet (`PhonePresentation="sheet"`, Section 6.2.1) | Matt (Wave 2 `popover` and `menu` PRs; each picker as it converts). |

---

## 11. Gate Criteria (Step 6 Prototype Gate & Step 7 Exit Check)

The Wave 0 prototype builds `mj-surface`, `mj-layer`, and `mj-row` in a private, unpublished workspace package compiled as Angular Elements and loaded onto the MJ Elements Phase 0 test page (PR #5916), verified under `e2e/ui-primitives/` with that folder's own Playwright config from PR #6673 (it sits outside the root config's `testDir`, `e2e/specs`). The Step 6 Prototype Gate passes only when **all seven** prototype criteria pass:

1. **Same markup, three looks**: Identical template markup renders in (a) MJ default, (b) LXP, and (c) a dense, flat, square-cornered serif look, with **0 lines of component CSS differing** between them.
2. **Parts**: Removing or reordering any named part (`mjSurfaceHeader`, `mjRowLeading`, `mjLayerFooter`, etc.) in the host template breaks neither layout nor behavior.
3. **Host wins**: A single unlayered host CSS rule overrides a primitive style with **no `!important`**.
4. **Hostile host & strict CSP**: Primitives survive the test page's hostile host CSS, strict CSP mode (no `unsafe-eval`, no inline style violations), and render fonts and icons cleanly.
5. **Open axes**: A custom `VisualRole` (`--mj-visual-role-<name>-*`) and a custom `Tone` (`--mj-tone-<name>-*`) not shipped in the library's defaults both render and fall back cleanly.
6. **Layer mechanics**: `dialog`, `sheet`, and `popover` run on `MJLayerService`; keyboard Tab trap, Escape dismiss, ref-counted scroll lock, and focus return all pass. At phone width `dialog`, `menu` and `popover` present as sheets, a layer set to `PhonePresentation="anchored"` stays anchored, and a menu presented as a sheet keeps `role="menu"` with Arrow-key focus and returns focus to its trigger on close. A side sheet fills an upright phone with no gap. On a phone held sideways a sheet caps at 640px and centers, a side sheet keeps its side panel, and a short desktop window used with a mouse stays in desktop mode.
7. **Accessibility**: `@axe-core/playwright` (`e2e/ui-primitives/`) and `ExpectNoAxeViolations` (`@memberjunction/ng-test-utils` in co-located Vitest DOM specs) pass with zero violations; focus rings are visible in all three looks; interactive touch targets measure at least 44px at phone width (`pointer: coarse`).

**Step 7 Exit Check (Explorer layer migration)**: After the Step 6 Prototype Gate passes, Step 7 declares `@layer reset, foundation, primitives;` in `@memberjunction/ng-shared-generic` and wraps `_typography.scss` and `_common.scss` in `@layer reset`, deleting or wrapping the alternate `styles/main.scss` entry per Section 4.3. Step 7 passes only when `e2e/specs/ui-foundation-baseline.spec.ts` (`PW_VISUAL_BASELINE=1`, reusing `e2e/fixtures.ts`'s authenticated MSAL profile) shows **zero unexpected visual diffs** against the Step 4 baseline screenshots.
