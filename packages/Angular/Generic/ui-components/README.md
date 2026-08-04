# @memberjunction/ng-ui-components

Reusable, **standalone** Angular UI components for MemberJunction applications — the house replacement for Kendo UI. Every component is token-driven (`--mj-*` design tokens from `_tokens.scss`), dark-mode safe by construction, and keyboard/ARIA accessible.

**The rule for consuming apps: check here before building.** If a control, layout region, overlay, or pattern exists in this package, use it. Hand-rolling an app-prefixed equivalent (a bespoke button, chip, empty state, dialog…) creates divergence this package exists to eliminate. If what you need doesn't exist, propose it — generic components belong here; app-domain components belong in the app's shared package.

## Installation & usage

The package ships standalone components — no NgModule required (the one exception is `MJAccordionModule`, a convenience bundle). Import the symbols you use directly:

```typescript
import { MJButtonDirective, MJEmptyStateComponent, MJDialogComponent } from '@memberjunction/ng-ui-components';

@Component({
  standalone: true,
  imports: [MJButtonDirective, MJEmptyStateComponent, MJDialogComponent],
  ...
})
```

Dependencies: `@angular/cdk` (overlays) and `angular-split` (splitter) come along as package dependencies; `@angular/common`, `@angular/core`, and `rxjs` are peers.

## Styling model — read this once

Components attach styles one of three ways, and one of them needs host cooperation:

1. **Inline `styles` in the component** (most components) — nothing to do.
2. **`styleUrls` compiled into the component** (`page-header`, `slide-panel`) — nothing to do.
3. **Global stylesheets shipped as assets** — the form controls and overlay chrome (`button`, `dialog`, `dropdown`, `combobox`, `input`, `datepicker`, `splitter`, `accordion`, `window`, `chip`, `switch`/`progress`) ship their `.scss` to `dist` and expect the **host application** to import them globally.

**If your app runs inside MJ Explorer (`explorer-app`), category 3 is already handled** — the shell imports all of them. A standalone host must add these to its global stylesheet:

```scss
@import '@memberjunction/ng-ui-components/dist/lib/button/button';
@import '@memberjunction/ng-ui-components/dist/lib/dialog/dialog';
@import '@memberjunction/ng-ui-components/dist/lib/dropdown/dropdown';
@import '@memberjunction/ng-ui-components/dist/lib/combobox/combobox';
@import '@memberjunction/ng-ui-components/dist/lib/input/input';
@import '@memberjunction/ng-ui-components/dist/lib/input/input-switch-progress';
@import '@memberjunction/ng-ui-components/dist/lib/input/chip';
@import '@memberjunction/ng-ui-components/dist/lib/datepicker/datepicker';
@import '@memberjunction/ng-ui-components/dist/lib/splitter/splitter';
@import '@memberjunction/ng-ui-components/dist/lib/accordion/accordion';
@import '@memberjunction/ng-ui-components/dist/lib/window/window';
```

All colors resolve through `--mj-*` semantic tokens, so light/dark theming requires zero component-level work.

## Forms integration

`mj-combobox`, `mj-dropdown`, `mj-datepicker`, `mj-numeric-input`, and `mj-switch` all implement `ControlValueAccessor` — they work with `[(ngModel)]` and reactive forms, including `setDisabledState`.

---

# Component catalog

## Controls

### `button[mjButton]` / `a[mjButton]` — MJButtonDirective
Attribute directive that styles a **native** button or anchor. Variants: `primary | secondary (default) | outline | flat | danger | icon | success | warning`. Sizes: `sm | md (default) | lg`. Toggle mode via `[toggleable]` + `[(selected)]` (sets `aria-pressed`). Dev-mode warns when an `icon` button lacks an accessible name — pass `ariaLabel`.

```html
<button mjButton variant="primary" (click)="save()">Save</button>
<button mjButton variant="icon" ariaLabel="Remove" (click)="remove()"><i class="fa-solid fa-xmark"></i></button>
<button mjButton variant="flat" [toggleable]="true" [(selected)]="isActive">Toggle</button>
```

### `mj-combobox` — MJComboboxComponent
Editable text-input combobox (CDK overlay): type-to-filter, keyboard nav, optional custom values (`[AllowCustom]`). Inputs: `Data`, `TextField`, `ValueField`, `ValuePrimitive`, `Filterable` (default true), `Placeholder`, `Disabled`. Outputs: `ValueChange`, `FilterChange`. Custom item template via `<ng-template #mjComboboxItem>`.

```html
<mj-combobox [Data]="categories" TextField="text" ValueField="value"
             [(ngModel)]="selected" [ValuePrimitive]="true" [AllowCustom]="true" />
```

### `mj-dropdown` — MJDropdownComponent
Non-editable select (CDK overlay) with optional in-panel filter (`[Filterable]`, default false) and `DefaultItem` clear option. Same `Data`/`TextField`/`ValueField`/`ValuePrimitive` contract as combobox. Custom item template via `<ng-template #mjDropdownItem>`.

```html
<mj-dropdown [Data]="items" TextField="name" ValueField="id"
             [(ngModel)]="selectedId" [ValuePrimitive]="true" />
```

### `mj-datepicker` — MJDatepickerComponent
Text input + calendar popup with `Min`/`Max` range disabling and typed-input parsing. Accepts `Date | string | null` through forms; emits `ValueChange: Date | null`. (Display format is currently fixed at `MM/dd/yyyy`.)

```html
<mj-datepicker [(ngModel)]="dueDate" [Min]="minDate" [Max]="maxDate" Placeholder="Select a date" />
```

### `mj-numeric-input` — MJNumericInputComponent
Native number input that clamps to `Min`/`Max`, rounds to `Decimals`, and formats on blur. Value flows through forms only (no separate output).

```html
<mj-numeric-input [(ngModel)]="quantity" [Min]="0" [Max]="100" [Decimals]="2" />
```

### `mj-switch` — MJSwitchComponent
Boolean toggle with `role="switch"`, optional `OnLabel`/`OffLabel`.

```html
<mj-switch [(ngModel)]="isEnabled" OnLabel="On" OffLabel="Off" />
```

### `[mjClickable]` — MJClickableDirective
Retrofits a non-semantic element (card, tile, row) into an accessible control: sets `role`, `tabindex`, `aria-label`, and makes Enter/Space fire `(click)`. Pass the accessible name as the attribute value; `role` may be `button` (default) or `link`; `testId` emits `data-testid`.

```html
<div class="app-card" [mjClickable]="app.Name" (click)="open(app)">…</div>
```

### Calendar utilities
`calendar/calendar-utils` exports pure helpers shared with the datepicker: `BuildCalendarWeeks`, `FormatDate`, `FormatDateTime`, `GetMonthYearLabel`, `WEEK_DAYS`, `MONTH_NAMES`.

## Layout & page chrome

The `page-*` family composes into the standard page skeleton:

```html
<mj-page-layout>
  <mj-page-header Title="Agents" Icon="fa-solid fa-robot" Subtitle="Manage your agents">
    <span meta><mj-stat-badge [Count]="filtered" [Total]="total" Label="agents" /></span>
    <div actions><button mjButton variant="primary">New</button></div>
    <div toolbar><mj-page-search [Value]="q" (ValueChange)="q = $event" /></div>
  </mj-page-header>
  <mj-page-body>
    <!-- content; scrolling and the 24px gutter are handled for you -->
  </mj-page-body>
</mj-page-layout>
```

And the left-nav shell variant for multi-section pages:

```html
<mj-page-layout>
  <mj-page-header Title="Admin" Icon="fa-solid fa-gear" />
  <mj-page-body [Flex]="true" [Padding]="false" Direction="row">
    <mj-left-nav [Sections]="sections" [ActiveId]="activeId" (ItemClicked)="go($event)" />
    <mj-left-nav-content [Loading]="loading" [Error]="err">
      <mj-page-header-interior Subtitle="Runtime state">
        <div actions><button mjButton size="sm">+ Add</button></div>
      </mj-page-header-interior>
      <mj-page-body-interior><!-- sub-page content --></mj-page-body-interior>
    </mj-left-nav-content>
  </mj-page-body>
</mj-page-layout>
```

### `mj-page-layout` — outer shell
Flex-column, full-height, `overflow:hidden`, page background. No inputs.

### `mj-page-header` — page chrome band
Inputs: `Title`, `Icon`, `Subtitle`. Slots: `[meta]` (badges under the title), `[actions]` (right-aligned), `[toolbar]` (secondary row).

### `mj-page-body` — scrolling body region
Inputs: `Padding` (default true; false removes the gutter), `Flex` (default false), `Direction: 'row' | 'column'` (row stacks to column at ≤700px).

### `mj-page-header-interior` / `mj-page-body-interior`
The same pair for **sub-pages inside a left-nav shell** — card-like chrome, responsive padding. Header-interior adds `Role`/`AriaLabel` inputs and the same three slots.

### `mj-left-nav` / `mj-left-nav-content` — MJLeftNavComponent
Canonical left rail: sections, flat + tree items (badges, descriptions, disabled), off-canvas drawer at ≤700px. Inputs: `Sections: MJLeftNavSection[]`, `ActiveId`, `ExpandedIds`, `Width` (240), `MobileTitle`. Outputs: `ItemClicked`, `ItemToggled`. Slots: `[header]`, `[footer]`. Pair with `mj-left-nav-content`, which provides `Loading`/`Error` states and hides (not destroys) content while busy.

### `mj-tab-nav` — MJTabNavComponent
Data-driven tab strip. `Tabs: TabConfig[]` (`key`, `label`, `icon?`, `badge?`, `badgeVariant?: 'default'|'error'|'warning'|'success'`), `ActiveKey`, `(TabChange)` emits the key.

### `mj-page-search` — MJPageSearchComponent
Compact toolbar search input. `Placeholder`, `Value`, `Icon`; `(ValueChange)` on input.

### `mj-slide-panel` — MjSlidePanelComponent
Chrome-only slide-in panel from the right (resizable) or centered dialog (`Mode: 'slide' | 'dialog'`). Inputs include `Title`, `Visible`, `Resizable`, `MinWidthPx`, `MaxWidthRatio`, `WidthPx`, and a `CanClose` guard callback. Outputs: `Closed`, `WidthChanged`. Dialog-mode body projects into `[dialog-content]`.

### Splitter
Re-export of `angular-split` — use `<as-split>` / `<as-split-area>` directly:

```html
<as-split direction="horizontal">
  <as-split-area [size]="30">Left</as-split-area>
  <as-split-area [size]="70">Right</as-split-area>
</as-split>
```

### `mj-accordion-panel` — MJAccordionPanelComponent (+ directives)
Collapsible panel replacing Kendo panelbar/expansion panel. Inputs: `Title`, `Expanded` (+`ExpandedChange`), `Disabled`, `Variant: 'default'|'primary'|'secondary'`, `Size: 'sm'|'md'`, `Bare`, `FlushBody`, `Fill` (consume leftover height). Rich content via structural directives — `*mjAccordionTitle`, `*mjAccordionActions` (rendered outside the toggle button), and `*mjAccordionBody` (**lazy — instantiated on first expand, then kept alive**). Import `MJAccordionModule` to get the panel plus all three directives in one symbol.

```html
<mj-accordion-panel [Expanded]="open" (ExpandedChange)="open = $event">
  <ng-template mjAccordionTitle><i class="fa-solid fa-code"></i> Template Editor</ng-template>
  <ng-template mjAccordionBody><mj-code-editor /></ng-template>
</mj-accordion-panel>
```

## Overlays

### `mj-dialog` — MJDialogComponent
Modal with backdrop, Esc/backdrop close (`Closeable`), body scroll lock. Inputs: `Visible`, `Title`, `Size: 'sm'|'md'|'lg'|'xl'|'auto'` (400/600/800/1000px), `Width`/`Height`/`MinWidth`, `Role: 'dialog'|'alertdialog'`. Output: `Close`. **`Visible` is not two-way** — set it false in your `(Close)` handler. Slots: default body, `mj-dialog-titlebar`, `mj-dialog-actions`.

```html
<mj-dialog [Visible]="show" Title="Confirm" Size="md" (Close)="show = false">
  <p>Are you sure?</p>
  <mj-dialog-actions>
    <button mjButton variant="primary" (click)="confirm()">Yes</button>
    <button mjButton (click)="show = false">No</button>
  </mj-dialog-actions>
</mj-dialog>
```

### `MJDialogService` — programmatic dialogs
`Open(settings): MJDialogRef` with `{ title, content: string | Type, actions: [{ text, primary?, themeColor? }], width, … }`. `ref.Result` (Observable) emits the clicked action or `undefined` on dismiss; `ref.Content.instance` exposes a mounted content component; `ref.Close(result?)`.

### `mj-confirm-dialog` — MJConfirmDialogComponent
Purpose-built confirmation on top of `mj-dialog`. Inputs: `[(Visible)]` (two-way), `Type: 'default'|'danger'|'warning'|'info'`, `Title`, `Message`, `DetailMessage`, `ConfirmText`, `CancelText`, `Icon`, `Processing` (spinner + blocks dismissal for async work). Outputs: `Confirmed` (**stays open — you close it when the work finishes**), `Cancelled` (auto-closes). Confirm button is leftmost, per MJ dialog convention.

### `MJConfirmService` — promise-based confirms
`await Confirm({ message, title?, detail?, type?, … })` → `boolean`, and `ConfirmDelete(...)` which forces danger styling and "Delete". Mounts above `mj-window` (z-index 20000).

```typescript
private confirm = inject(MJConfirmService);
if (await this.confirm.ConfirmDelete({ message: 'Delete this view?', detail: 'Cannot be undone.' })) { … }
```

### `mj-window` — MJWindowComponent
Floating, **non-modal** panel (no backdrop): `Draggable`, `Resizable` (8 handles), `State: 'default' | 'maximized'` with geometry save/restore, `Top`/`Left`/`Width`/`Height`/`MinWidth`/`MinHeight`. Outputs: `Close`, `StateChange`, `Resize`. Methods: `SetPosition`, `SetSize`, `GetWindowElement`. Slots: default body, `mj-window-titlebar`, `mj-window-actions`. `Visible` is not two-way.

### `mj-filter-popover` — MJFilterPopoverComponent
Filter trigger button + CDK popover on desktop, docked bottom-sheet on mobile. Inputs: `Label`, `Icon`, `ActiveCount` (badge), `ShowClearAll`. Output: `ClearAllRequested`. Project your filter UI (dropdowns, chips) as content.

## Patterns

### `mj-empty-state` — MJEmptyStateComponent
Centered placeholder for empty/error/no-results states. Inputs: `Variant: 'empty'|'no-results'|'success'|'warning'|'error'` (drives default icon + live-region role), `Size: 'compact'|'default'|'large'`, `Icon`, `Title`, `Message`, built-in CTA via `ActionText`/`ActionIcon`/`ActionVariant` with `(Action)`. Extra CTAs project into `[actions]`; richer body projects as default content.

```html
<mj-empty-state Variant="error" Title="Couldn't load permissions" [Message]="error"
                ActionText="Try Again" ActionIcon="fa-solid fa-rotate-right" (Action)="loadData()" />
```

### `mj-stat-badge` — MJStatBadgeComponent
Read-only stat pill, designed for the page-header `[meta]` slot. `Count`, `Total` (renders "X of Y label"), `Label`, `Icon`, `Variant: 'default'|'success'|'error'|'warning'|'running'|'info'`.

```html
<mj-stat-badge [Count]="filteredCount" [Total]="totalCount" Label="agents" />
```

### `mj-alert` — MJAlertComponent
Persistent in-flow banner (not a toast). `Variant: 'info'|'success'|'warning'|'error'`, `Size: 'sm'|'md'`, `Title`, `Message`, `Dismissible` + `(Dismissed)`, action buttons via `[actions]` slot. Correct ARIA live role per variant automatically.

### `mj-progress-bar` — MJProgressBarComponent
`Value` (0–100, clamped) or `Type="infinite"` for indeterminate. Styles ship in the global `input-switch-progress` sheet (see Styling model).

### `mj-view-toggle` — MJViewToggleComponent
Segmented control for view modes. `Options: { key, icon?, label?, title? }[]`, `ActiveKey`, `(KeyChange)`. Provide `title` for icon-only options.

### `mj-refresh-button` — MJRefreshButtonComponent
Canonical refresh: `Loading` spins + disables, label auto-hides on mobile. `(Clicked)` suppressed while loading/disabled.

### `mj-filter-chip` — MJFilterChipComponent
Clickable filter pill: `Label`, `Icon`, `Count`, `Active` (+`aria-pressed`), `(Clicked)`.

### `mj-filter-field` — MJFilterFieldComponent
Labeled row (icon + uppercase label) wrapping any projected widget — the escape hatch inside filter UIs.

### `mj-filter-panel` — MJFilterPanelComponent
Config-driven filter stack: `Fields: FilterFieldConfig[]` with `type: 'text' | 'dropdown' | 'chips'` (chips support `multi`), `[(Values)]` as a plain record, `Reset` handling, plus projected custom `mj-filter-field`s.

### `mj-applied-filters` — MJAppliedFiltersComponent
"Filtered by …" removable chip row. Renders nothing when `Filters` is empty, so it's safe to place unconditionally. `(Remove)`, `(ClearAll)`.

---

## Contributing

- **Generic components belong here; app-domain components don't.** If a component would make sense in any MJ app, add it to this package. If it encodes one app's domain (e.g. scoring bands), keep it in that app's shared package.
- Components must be `standalone: true`, use `--mj-*` tokens for every color (no hardcoded hexes), support both themes, and be keyboard/ARIA accessible.
- If a component ships a global `.scss`, register it in the `copy-assets` script in `package.json` **and** add it to the import list in this README and in `explorer-app`'s global styles.
- Update the catalog above when adding or changing a component's public API.
