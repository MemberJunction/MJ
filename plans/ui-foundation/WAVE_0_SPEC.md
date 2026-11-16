# Project Lego: Wave 0 Spec

**Status:** DRAFT 2026-11-13, for review.
**Parents:** [UNIFIED_PLAN.md](UNIFIED_PLAN.md), [NAMING.md](NAMING.md), [WAVE_0_PLAN.md](WAVE_0_PLAN.md)

This spec defines the Wave 0 foundation in Angular terms: the CSS cascade contract, the three-tier token architecture, the unified CDK overlay/announcer base, the three Wave 0 primitives (`surface`, `layer`, `row`), the event and L0-L3 layering rules, the package shape (D9), the intentional visible changes, and the prototype gate criteria.

Nothing in Wave 0 ships to `@memberjunction/ng-ui-components` until the prototype gate (Section 11) passes.

---

## 1. Facts (Measured Inventory)

Measured from the repository on 2026-11-13:

1. **Encapsulation in `@memberjunction/ng-ui-components`**:
   - 59 `@Component` and `@Directive` declarations exist under `packages/Angular/Generic/ui-components/src/lib`.
   - 0 opt out of Angular's emulated view encapsulation (`ViewEncapsulation.None` is not used).
   - 13 component/feature `.scss` files are copied flat into `dist/lib/` via `copy-assets` in `packages/Angular/Generic/ui-components/package.json` and imported globally by hosts (`explorer-app/src/lib/styles.scss` and `main.scss`).
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
     - `dialog`, `bottom-sheet`, and `dialog.service.ts` each mutate `document.body.style.overflow = 'hidden'` directly.
     - Z-index stacking is fragmented across 5 hardcoded bands (`1000`, `1200`, `9998/9999`, `10000`, `10001`, `20000`).
5. **`explorer-app/_common.scss` globals & `.mj-*` collisions**:
   - `packages/Angular/Explorer/explorer-app/src/lib/styles/_common.scss` (731 lines) declares unlayered global element rules (`*`, `input, textarea, select`, `body, h1, h2, h3`, `a`), form classes (`.form-group`, `.form-label`, `.form-control`), and `.mj-*` classes.
   - CSS class usage of those `.mj-*` classes across `packages/Angular`: `.mj-card` (18 files; header 7, body 7, footer 2), `.mj-grid` (11 files), `.mj-empty-state` (4 files; `<mj-empty-state>` tag is in 368 files), `.mj-toolbar` (3 files), `.mj-modal-header`/`body`/`footer` (3 files each), `.mj-breadcrumb` (1 file), `.mj-header` / `.mj-container` / `.mj-content-container` (1 file each).

---

## 2. Architecture Calls (D1 & D2)

### 2.1 Encapsulation, prefix, and layers (D1)
Every Wave 0+ primitive ships with:
1. `encapsulation: ViewEncapsulation.None` on the Angular `@Component`.
2. **`.mj-` class prefix** on every element and part class inside the primitive (e.g. `.mj-surface`, `.mj-layer`, `.mj-row`, `.mj-row-leading`).
3. **All primitive CSS wrapped in `@layer primitives`**.
4. **No `:host` attribute-leak assumptions**: primitives do not rely on `_ngcontent-*` scoping. Host-element layout (`display`, `box-sizing`) uses the component's tag or `.mj-<name>` host class inside `@layer primitives` so an unlayered host rule always wins without `!important`.

### 2.2 Open axes (D2)
Closed union types for visual axes (`role`, `tone`, `density`, `emphasis`) are prohibited unless they are defaults over an open string axis.
- **Inputs accept `string` with documented defaults** (e.g. `Tone = input<string>('neutral')`, `VisualRole = input<string>('surface')`). Note: the visual role axis uses `VisualRole` (`visual-role` in Custom Elements) so it never collides with HTML's native ARIA `role` attribute.
- **Runtime variable mapping**: primitives bind runtime private variables on their host (`--_mj-tone-text: var(--mj-tone-<name>-text, ...)`, `--_mj-role-bg: var(--mj-role-<name>-bg, ...)`) so a brand adds a custom tone or role purely by declaring `--mj-tone-<name>-*` or `--mj-role-<name>-*` tokens in `:root` without writing CSS selectors against primitive internals.

### 2.3 PascalCase Angular inputs vs. kebab-case Custom Element attributes
MemberJunction's Angular convention uses PascalCase inputs in both TypeScript and Angular templates (`[Density]="'sm'"`, `[AllowPhoneSheet]="true"`), while HTML parsers lowercase Custom Element attributes (`density="sm"`, `allow-phone-sheet="true"`). Note that Angular's `input(..., { alias: 'density' })` would replace the Angular template binding name and create two dialects across MJ components, so `alias` is **not** used.
- **Rule**: Components declare standard unaliased PascalCase `input()` properties (`Density`, `Interactive`, `AllowPhoneSheet`) so Angular templates keep `[Density]` everywhere. In the Angular Elements registrar (`defineElement`), `reflectComponentType(component)` derives kebab-case attribute names (`AllowPhoneSheet` -> `allow-phone-sheet`) and extends `ctor.observedAttributes` and `ctor.prototype.attributeChangedCallback` / `connectedCallback` automatically.
- **Why**: Zero dialect split in Angular templates, zero `MutationObserver`, and native Custom Element attribute reactivity. Primitives run zoneless (`provideZonelessChangeDetection()`) and never bundle `zone.js` into Angular Elements.

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
| `--mj-radius-overlay` | `var(--mj-radius-lg)` (12px) *(note: PR #6609 sets `xl`/16px; align at Monday check-in)* | Dialogs, sheets, popovers, menus, toasts |
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
- Inside a surface container (`.mj-surface-<level>`, matching the utility classes added in PR #6609), text and border role tokens (`--mj-text-primary`, `--mj-text-secondary`, `--mj-text-muted`, `--mj-border-default`) are re-pointed to that level's surface tokens so nested children meet WCAG 2.1 AA contrast on both light and dark elevated surfaces per the Ramp B contrast table.
- PRs #6609 and #6610 also introduce `--mj-bg-canvas`, `--mj-ambient` / `--mj-ambient-strength` (off by default), and `--mj-font-family-display` (Montserrat) in `_tokens.scss`; when Step 7 lands `@layer reset, foundation, primitives;`, those `:root` / `[data-theme="dark"]` / `.mj-surface-*` rules are wrapped in `@layer foundation`.

---

## 4. Cascade Layer Order

### 4.1 Layer order declaration
Every host (Explorer, standalone Angular apps, and Angular Elements) declares this order before any component or reset CSS loads:

```css
@layer reset, foundation, primitives;
```

- **`reset`**: Legacy global resets and element defaults (formerly unlayered in `explorer-app/_common.scss`). Lowest priority.
- **`foundation`**: Design tokens (`:root`, `[data-theme="dark"]`, surface level re-points) and base focus/typography utilities.
- **`primitives`**: All `@memberjunction/ng-ui-components` styles.
- **Unlayered host CSS**: Any host CSS outside `@layer` beats all three layers by construction with zero `!important`.

### 4.2 Where the order is declared
1. `@memberjunction/ng-shared-generic` emits `@layer reset, foundation, primitives;` as the first line of `_tokens.scss` and the compiled `tokens.css`.
2. `explorer-app` (`styles.scss` and `main.scss`) imports tokens before `_common.scss` or third-party stylesheets.
3. Angular Elements bundles (the Wave 0 prototype and `ng-realtime-widget`) open their injected stylesheet with `@layer reset, foundation, primitives;` and wrap defaults in `@layer foundation` and primitive CSS in `@layer primitives`.

### 4.3 Moving `explorer-app/_common.scss` into `@layer reset`
Only after the Step 4 visual regression harness captures baseline Explorer screenshots, the unlayered global rules in `packages/Angular/Explorer/explorer-app/src/lib/styles/_common.scss` are wrapped in `@layer reset { ... }`.

### 4.4 `.mj-*` collision rule
Primitives own the `.mj-` prefix. Because `@layer reset` only loses to `@layer primitives` on properties both rules declare (undeclared properties still bleed through), **no primitive may ship with a class name that still exists in `_common.scss`**.
- Wave 0 (`surface`, `layer`, `row`) has zero collisions with `_common.scss`.
- Colliding `_common.scss` classes (`.mj-card*`, `.mj-grid*`, `.mj-empty-state`, `.mj-toolbar`, `.mj-modal-*`, `.mj-breadcrumb`, `.mj-header`, `.mj-container`) are renamed to `.mj-legacy-*` or retired in the Wave 1/2 PR that introduces the corresponding primitive.

---

## 5. Layer Service and Announcer

A single CDK-backed service pair replaces the four separate overlay implementations (`dialog`, `slide-panel`, `bottom-sheet`, `window`) and supports `popover`, `menu`, `tooltip`, and `toast`:

### 5.1 `MJLayerService` (on `@angular/cdk/overlay` + `@angular/cdk/a11y`)
- **Single overlay stack**: Tracks open layer refs in a LIFO stack (`MJLayerRef[]`). Escape and backdrop clicks target only the topmost dismissible layer.
- **Z-index ladder**: Managed by CDK `OverlayContainer` order plus `--mj-z-overlay` base token, eliminating the 5 hardcoded z-index bands (`1000`, `1200`, `9998`, `10000`, `10001`, `20000`) for new/migrated layers.
- **Focus trap, popover/menu entry, & restore**: Uses `ConfigurableFocusTrapFactory` (`@angular/cdk/a11y`) on modal/sheet/panel layers, moves initial focus into both modal and non-modal `popover`/`menu` portals (since CDK portals render at the end of `document.body` outside natural DOM Tab order), synchronizes `aria-expanded` on anchor triggers, provides Arrow/Home/End roving focus on `Kind="menu"`, and restores focus to the trigger element on close.
- **Angular Elements portal safety (`DomPortal`)**: Uses CDK `DomPortal` backed by a hidden staging wrapper (`.mj-layer-staging`) rather than `TemplatePortal` when hosting custom elements so nested Angular Elements are not destroyed by `@angular/elements`'s disconnect timer while closed.
- **Ref-counted scroll lock**: Replaces direct `document.body.style.overflow = 'hidden'` mutations with a ref-counted lock (or CDK `BlockScrollStrategy`) so closing a nested modal never unlocks scroll while a parent sheet is still open.
- **Responsive collapse**: A `layer` configured as `Kind="dialog"` automatically renders as a bottom sheet on phone viewports (`@media` / `PhoneViewport` breakpoint) unless `AllowPhoneSheet="false"`.

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
  - `Selected: boolean = false`
  - `Padding: string = 'md'` (maps to `--mj-space-*` or `none`)
  - `Radius: string = 'surface'` (maps to `--mj-radius-surface` by default)
- **Named parts**: `mjSurfaceHeader`, `mjSurfaceBody`, `mjSurfaceFooter` (order-free, all optional).
- **Exposed tokens (Tier 3 -> Tier 2)**: `--mj-surface-bg`, `--mj-surface-border`, `--mj-surface-radius`, `--mj-surface-padding`, `--mj-surface-shadow`, plus state variants `-hover` / `-selected`.
- **Accessibility**: Semantic container by default (no forced `role`); when `Interactive` is true without a nested button/link, pairs with `mjClickable` or native `<button>`/`<a>`.

### 6.2 `mj-layer`
The structural primitive rendered inside `MJLayerService` (or declaratively) for `dialog`, `sheet`, `popover`, `menu`, `tooltip`, and `toast`.
- **Inputs**:
  - `Kind: 'dialog' | 'sheet' | 'popover' | 'menu' | 'tooltip' | 'toast' | string = 'dialog'`
  - `Placement: 'center' | 'start' | 'end' | 'bottom' | 'top' | string = 'center'`
  - `Modal: boolean = true`
  - `Closeable: boolean = true`
  - `Size: 'sm' | 'md' | 'lg' | 'full' | string = 'md'`
- **Named parts**: `mjLayerHeader`, `mjLayerTitle` (attribute directive on consumer's `<h2>`/`<h3>`), `mjLayerBody`, `mjLayerFooter` (affirmative button on the left, decline on the right per `packages/Angular/CLAUDE.md`).
- **Exposed tokens**: `--mj-layer-bg` (`--mj-surface-overlay-bg`), `--mj-layer-radius` (`--mj-radius-overlay`), `--mj-layer-shadow`, `--mj-layer-padding`, `--mj-layer-max-width`, `--mj-layer-backdrop-bg` (`--mj-bg-overlay`).
- **Accessibility**: `role="dialog"` + `aria-modal="true"` + `aria-labelledby` wired to `mjLayerTitle` for modal kinds; `role="status"` / `role="alert"` for `toast`; Escape + focus trap + focus return guaranteed by `MJLayerService`.

### 6.3 `mj-row`
A horizontal flex/grid item primitive for list items, nav rows, menu items, picker options, and toolbar rows.
- **Inputs**:
  - `Density: 'sm' | 'md' | 'lg' | string = 'md'` (defaults height to `--mj-control-height-<density>`, 44px on `pointer: coarse` for `sm`/`md`)
  - `Interactive: boolean = false`
  - `Selected: boolean = false`
  - `Disabled: boolean = false`
  - `Tone: string = 'neutral'` (open axis)
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
   - Inputs and outputs use Angular's `input()` / `output()` signal APIs (or remain signal-compatible) per Amith's PR #6181 composition direction.

---

## 8. L0 to L3 Layering

| Piece | MJ UI Layer | Package | Enforcement |
| --- | --- | --- | --- |
| Tier 1 & 2 tokens, `@layer` order | L0 (Foundation) | `@memberjunction/ng-shared-generic` | `mjUILayer` + CSS export check |
| `surface`, `layer`, `row`, `MJLayerService`, `MJAnnouncerService` | L1 (`"mjUILayer": "widgets"`) | `@memberjunction/ng-ui-components` | `pnpm run check:ui-layers` (`mj standards check --check ui-layers`) |
| Explorer `_common.scss` in `@layer reset` | L3 (`"mjUILayer": "shell"`) | `@memberjunction/ng-explorer-app` | `pnpm run check:ui-layers` |

Primitives in L1 (`widgets`) have zero dependencies on `@angular/router`, `NavigationService`, `@memberjunction/ng-shared`, or entity metadata/data access (`RunView`, `Metadata`). Everything arrives via inputs/projection and leaves via events.

---

## 9. Package Shape (D9)

`@memberjunction/ng-ui-components` moves from a single barrel + `copy-assets` flat `.scss` copies to structured `package.json` `"exports"`:

1. **Root barrel (`.`)**: Keeps existing exports for backwards compatibility during Waves 1 to 4.
2. **Secondary entry points per primitive family**:
   - `@memberjunction/ng-ui-components/surface`
   - `@memberjunction/ng-ui-components/layer`
   - `@memberjunction/ng-ui-components/row`
   (Following the same pattern for each Wave 1/2 family so Angular Elements bundles tree-shake to only the primitives they use.)
3. **Explicit style entry points**:
   - `@memberjunction/ng-shared-generic/tokens.css` and `@memberjunction/ng-shared-generic/tokens.scss`
   - `@memberjunction/ng-ui-components/styles/primitives.css` (and per-family CSS exports)
   So `ng-realtime-widget`, `explorer-app` (including `card-grid/card-grid` added in PR #6610), and Angular Elements import documented package exports instead of reaching into `dist/lib/*.scss` by file path.

---

## 10. Intentional Visible Changes

These changes are intentional and must be called out in PR descriptions and verified with visual regression diffs (never shipped silently):

| Change | Before | After | Owner & Wave |
| --- | --- | --- | --- |
| Medium button height (desktop) | 44px | 40px (`--mj-control-height-md`; 44px on `pointer: coarse`) | Tokens: Colin (WS6b, Phase 0). Adoption: Matt (Wave 1/2 `button` PR). |
| Inputs & dropdowns height (desktop) | 38px | 40px (`--mj-control-height-md`; 44px on `pointer: coarse`) | Tokens: Colin (WS6b, Phase 0). Adoption: Matt (Wave 2 `input`/`dropdown` PRs). |
| View toggle height (desktop) | 28px | 32px (`--mj-control-height-sm`; 44px on `pointer: coarse`) | Tokens: Colin (WS6b, Phase 0). Adoption: Matt (Wave 1 `view-toggle` PR). |
| Dark-theme overlays (`dialog`, `sheet`, `slide-panel`, `window`) | Base surface (`neutral-800`) | One step lighter (`elevated` / `neutral-700`) via `--mj-surface-overlay-bg` | Tokens: Colin (WS6b, Phase 0). Adoption: Matt (Wave 2 `layer` conversions). |

---

## 11. Gate Criteria (Step 6 Prototype Gate)

The Wave 0 prototype builds `mj-surface`, `mj-layer`, and `mj-row` in a private, unpublished workspace package compiled as Angular Elements and loaded onto the MJ Elements Phase 0 test page (PR #5916). The gate passes only when **all eight** criteria pass:

1. **Same markup, three looks**: Identical template markup renders in (a) MJ default, (b) LXP, and (c) a dense, flat, square-cornered serif look, with **0 lines of component CSS differing** between them.
2. **Parts**: Removing or reordering any named part (`mjSurfaceHeader`, `mjRowLeading`, `mjLayerFooter`, etc.) in the host template breaks neither layout nor behavior.
3. **Host wins**: A single unlayered host CSS rule overrides a primitive style with **no `!important`**.
4. **Hostile host & strict CSP**: Primitives survive the test page's hostile host CSS, strict CSP mode (no `unsafe-eval`, no inline style violations), and render fonts and icons cleanly.
5. **Open axes**: A custom `Role` and a custom `Tone` not shipped in the library's defaults both render and fall back cleanly.
6. **Layer mechanics**: `dialog`, `sheet`, and `popover` run on `MJLayerService`; keyboard Tab trap, Escape dismiss, ref-counted scroll lock, and focus return all pass, and `dialog` collapses to `sheet` on phone width.
7. **Accessibility**: axe passes with zero violations on the prototype page; focus rings are visible in all three looks; interactive touch targets measure at least 44px at phone width (`pointer: coarse`).
8. **Explorer unaffected**: The Playwright visual regression harness shows zero unexpected diffs on the baseline Explorer screens after `@layer reset, foundation, primitives;` and `_common.scss` move to `@layer reset`.
