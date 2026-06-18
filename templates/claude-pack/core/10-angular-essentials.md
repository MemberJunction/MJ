# Angular — patterns that work in MJ

MJExplorer (and your own MJ-based SPAs) ship Angular components alongside
CodeGen-generated forms. The standard Angular guidance applies — plus a
handful of MJ-specific patterns that, if you skip, lead to half-broken
forms, missing toolbars, or hanging loading screens.

## Component declaration — standalone or NgModule

MJ supports both styles. **Use whichever the existing code in the package
uses.** If a package's components are `standalone`, your new component
should be too; if they're declared in an `NgModule`, yours should be too.
Mixing in one package adds cognitive overhead with no upside.

When to prefer **standalone** (the modern default):

- New leaf components (dialogs, panels, small widgets)
- Lazy-loaded route components — enables `loadComponent()` directly
- Anything self-contained with explicit dependency list

When to prefer **NgModule**:

- Existing feature modules that already group many related components
- Shared modules consumed by multiple feature areas
- When the surrounding package is module-declared (don't migrate just to migrate)

```typescript
// ✅ Standalone — declare deps in imports[]
@Component({
    standalone: true,
    imports: [MJDialogComponent, MJButtonDirective],
    selector: 'my-thing',
    template: `<mj-dialog>…</mj-dialog>`
})
export class MyThingComponent { … }

// ✅ NgModule-declared — explicit standalone: false (Angular 21+ defaults to true)
@Component({
    standalone: false,
    selector: 'my-thing',
    template: `<mj-dialog>…</mj-dialog>`
})
export class MyThingComponent { … }
```

Never mix the two in one component. A component is either standalone or
NgModule-declared.

## Modern template syntax — required for new code

Use the **block syntax** (`@if`, `@for`, `@switch`), not the legacy
structural directives:

```html
<!-- ✅ Modern — works for standalone AND NgModule components -->
@if (isLoading) {
    <mj-loading text="Loading data..."/>
} @else if (records.length === 0) {
    <p>No records.</p>
} @else {
    @for (record of records; track record.ID) {
        <my-record [data]="record"/>
    }
}

<!-- ❌ Legacy — *ngIf / *ngFor are heading toward deprecation -->
<mj-loading *ngIf="isLoading" text="Loading data..."/>
<p *ngIf="!isLoading && records.length === 0">No records.</p>
<my-record *ngFor="let record of records; trackBy: trackById" [data]="record"/>
```

`@for` has roughly **90% better runtime performance** than `*ngFor` and
requires an explicit `track` expression. The block syntax works
identically with both standalone and NgModule components.

After migrating templates, you can typically drop the `CommonModule`
import — it's only needed for the legacy directives.

## Dependency injection — prefer `inject()`

Angular's `inject()` function is now the recommended DI mechanism for new
components, services, and directives:

```typescript
// ✅ inject() — Angular's official recommendation for new code
import { Component, inject } from '@angular/core';
import { Metadata } from '@memberjunction/core';

@Component({ standalone: true, … })
export class MyComponent {
    private cdr = inject(ChangeDetectorRef);
    private md = new Metadata();

    async loadData() { … }
}

// ✅ Constructor DI — still works fine; don't migrate existing code just for the sake of it
export class MyComponent {
    constructor(private cdr: ChangeDetectorRef) {}
}
```

`inject()` wins on:

- Inheritance — no `super(...)` chains
- Type inference — no string-typed tokens
- Standard decorator compatibility

But existing constructor-injected code doesn't need migration. Mix is fine
across files (just not within one component).

## Custom entity forms — extend the generated class

The single most-important MJ-Angular pattern: **when you customize a form,
you extend the generated form class** — you do not fork it.

```typescript
import { Component } from '@angular/core';
import { RegisterClass } from '@memberjunction/global';
import { BaseFormComponent } from '@memberjunction/ng-base-forms';
// ✅ Import the generated class
import { OrderFormComponent } from '../../generated/Entities/Order/order.form.component';

@RegisterClass(BaseFormComponent, 'Orders')   // entity name
@Component({
    selector: 'mj-order-form-extended',
    // ... your overrides here
})
export class OrderFormComponentExtended extends OrderFormComponent {
    // override hooks, add tabs, embed custom panels, etc.
}
```

Why extend rather than rewrite:

1. **`@RegisterClass` resolves by registration order.** Your extension
   file imports the generated file, so your class compiles AFTER the
   generated one — `@RegisterClass(..., 'Orders')` then wins the
   factory lookup over the parent registration.

2. **You inherit every CodeGen improvement for free.** When the entity
   schema gains a new field, the generated form gains a new control;
   your extension picks it up automatically.

3. **The generated file stays untouched.** No merge conflicts when
   CodeGen regenerates after a schema change.

## Toolbar pattern — `<mj-record-form-container>`, not `<mj-form-toolbar>` directly

Entity form templates must wrap their content in **`<mj-record-form-container>`**.
Using `<mj-form-toolbar>` alone looks identical at first but **silently
breaks the History / Tags / Add-to-List panels** — the container owns the
panels that those toolbar buttons open.

```html
<!-- ✅ CORRECT — container manages toolbar + panels -->
<mj-record-form-container [record]="record">
    <!-- toolbar is rendered by the container -->
    <ng-container slot="content">
        <my-tabs/>
    </ng-container>
</mj-record-form-container>

<!-- ❌ WRONG — toolbar buttons fire events with nothing to handle them -->
<mj-form-toolbar [record]="record"/>
<my-tabs/>
```

If you cargo-culted a `<mj-form-toolbar>` from somewhere, the History
button will visibly do nothing — no error, no console message, just dead
buttons. The container pattern is mandatory.

## Loading indicators — `<mj-loading>`, not custom spinners

```html
<!-- ✅ Use the standard component -->
<mj-loading text="Loading records..."/>

<!-- Variations -->
<mj-loading></mj-loading>                              <!-- default text -->
<mj-loading text="Please wait..." size="medium"/>
<mj-loading [showText]="false"/>                       <!-- icon only -->

<!-- ❌ Don't roll your own spinner -->
<div class="my-spinner"><i class="fa fa-spinner fa-spin"/></div>
```

Sizes: `'small'` (40×22), `'medium'` (80×45), `'large'` (120×67), `'auto'`
(fills container). Import via `SharedGenericModule` from
`@memberjunction/ng-shared-generic`.

The component displays the animated MJ logo with optional text below —
gives every loading state in the app a consistent feel.

## `BaseResourceComponent` — MUST call `NotifyLoadComplete()`

Any class that extends `BaseResourceComponent` (which includes every
`BaseDashboard` subclass) **must call `this.NotifyLoadComplete()` when its
initial load finishes**. Without that call, the app's shell loading screen
hangs forever on direct-URL navigation.

```typescript
// ✅ CORRECT — signal the shell to clear the loading screen
export class MyResourceComponent extends BaseResourceComponent implements OnInit {
    async ngOnInit(): Promise<void> {
        await this.loadMyData();
        this.NotifyLoadComplete();   // REQUIRED
    }
}

// ❌ WRONG — silent permanent loading spinner on direct nav
export class MyResourceComponent extends BaseResourceComponent implements OnInit {
    async ngOnInit(): Promise<void> {
        await this.loadMyData();
        // (forgot to NotifyLoadComplete → shell stays loading forever)
    }
}
```

`BaseDashboard` subclasses get this for free — `BaseDashboard.ngOnInit()`
calls `NotifyLoadComplete()` after `loadData()` finishes. For direct
`BaseResourceComponent` subclasses, you must call it yourself, typically
at the end of `ngOnInit()` or `ngAfterViewInit()`.

## MJ UI components — use `@memberjunction/ng-ui-components`

**All new UI components should use MJ's UI components package**, not Kendo,
PrimeNG, or Angular Material.

| Need | Use |
|---|---|
| Button | `mjButton` directive |
| Dialog | `<mj-dialog>` + `MJDialogService` |
| Window | `<mj-window>` |
| Dropdown / combobox | `<mj-dropdown>` / `<mj-combobox>` |
| Switch | `<mj-switch>` |
| Numeric input | `<mj-numeric-input>` |
| Date picker | `<mj-datepicker>` |
| Progress bar | `<mj-progress-bar>` |
| Accordion | `<mj-accordion-panel>` |
| Splitters | `angular-split` (`as-split` + `as-split-area`) |
| Grids | AG Grid (`ag-grid-angular`) |
| Loading | `<mj-loading>` |

Styled native form elements: `.mj-input`, `.mj-textarea`, `.mj-checkbox` CSS classes.

All MJ components are standalone with `inject()` DI, `PascalCase` inputs /
outputs, and `--mj-*` design tokens (see `11-design-tokens.md`).

Import path: `import { MJButtonDirective, MJDialogComponent, … } from
'@memberjunction/ng-ui-components';`

## `@Input()` properties — use getter/setters for reactive ones

For an `@Input()` that needs to react when it changes, prefer the
getter/setter pattern over `ngOnChanges`. Setters fire immediately on each
write — exact timing, easy to reason about.

```typescript
// ✅ Precise — react in the setter
private _queryId: string | null = null;

@Input()
set queryId(value: string | null) {
    const prev = this._queryId;
    this._queryId = value;
    if (value && value !== prev) {
        this.onQueryIdChanged(value);
    }
}
get queryId(): string | null {
    return this._queryId;
}

// ❌ Less precise — ngOnChanges has timing surprises and harder debugging
@Input() queryId: string | null = null;

ngOnChanges(changes: SimpleChanges) {
    if (changes['queryId']) { … }
}
```

`ngOnChanges` is still fine for simple "react when any input changes"
logic where ordering doesn't matter. For one specific input with derived
state, the setter is cleaner.

## Dialog button placement

Per MJ design system: **confirm/submit buttons on the LEFT, cancel on
the RIGHT**. Opposite of Windows convention, matches MJ's everywhere.

```
[Save] [Update]    [Cancel]      ← MJ convention
```

Apply to all dialogs, modals, and action button groups.

## Change-detection: handling `ExpressionChangedAfterItHasBeenChecked`

When you mutate state outside Angular's normal change-detection rhythm
(e.g. focus management, clearing inputs programmatically, async fixes
after view init), inject `ChangeDetectorRef` and call `cdr.detectChanges()`
after the change. Prefer `Promise.resolve().then(() => ...)` over
`setTimeout(..., 0)` for microtask-timing fixes.

## The day-1 checklist

- [ ] New component matches the existing standalone-vs-NgModule pattern of its package?
- [ ] Template uses `@if`/`@for`/`@switch`, not `*ngIf`/`*ngFor`?
- [ ] Custom entity form extends the generated class with `@RegisterClass`?
- [ ] Form template wraps content in `<mj-record-form-container>` (not raw `<mj-form-toolbar>`)?
- [ ] Loading states use `<mj-loading>` (no custom spinners)?
- [ ] `BaseResourceComponent` subclass calls `this.NotifyLoadComplete()` after initial load?
- [ ] UI built from `@memberjunction/ng-ui-components` (not Kendo/PrimeNG/Material)?
