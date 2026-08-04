import { Component, EventEmitter, Input, Output, forwardRef } from '@angular/core';
import { NG_VALUE_ACCESSOR, type ControlValueAccessor } from '@angular/forms';

/**
 * Shared lightweight stand-ins for the handful of MJ UI components that DOM specs
 * stub over and over (`mj-loading`, `mj-empty-state`, `mj-dropdown`, `mj-numeric-input`).
 *
 * When to use these vs. the real component (per `guides/ANGULAR_TESTING_GUIDE.md`):
 * import the REAL component when it is light and has no data/service dependencies
 * (e.g. `MJButtonDirective`, `MJDialogComponent`); reach for a stub only when the real
 * one drags in a heavy package, template machinery, or async behavior the spec doesn't
 * care about. If your spec needs bespoke stub behavior these don't provide (custom
 * interactive template, recording inputs for assertion), keep a local stub — these
 * cover the common "render something inert with the right selector/API" case.
 *
 * All stubs are standalone — add them to the TestBed `imports` array (they work fine
 * alongside `declarations` of a module-declared component under test).
 */

/**
 * Inert double for `<mj-loading>` (`LoadingComponent` in `@memberjunction/ng-shared-generic`).
 *
 * Mirrors the real component's public inputs (`text`, `showText`, `size`, plus the cosmetic
 * animation/color knobs) so any template binding compiles. Renders
 * `<span class="stub-loading">{{ text }}</span>` — assert presence/absence via the
 * `mj-loading` element or the `.stub-loading` hook.
 *
 * Note: `size`/`animation` are typed as plain `string` (the real component uses literal
 * unions) so the stub stays permissive; the real component remains the source of truth.
 */
@Component({
  standalone: true,
  selector: 'mj-loading',
  template: '<span class="stub-loading">{{ text }}</span>',
})
export class StubLoadingComponent {
  @Input() text = 'Loading...';
  @Input() showText = true;
  @Input() size = 'auto';
  @Input() animation = 'pulse';
  @Input() animationDuration = 1.5;
  @Input() textColor = '';
  @Input() logoColor = '';
}

/**
 * Inert double for `<mj-empty-state>` (`MJEmptyStateComponent` in
 * `@memberjunction/ng-ui-components`), mirroring its full public API
 * (Icon/Title/Message/ActionText/ActionIcon/ActionVariant/Variant/Size/Role inputs + the
 * `Action` output).
 *
 * Template hooks for assertions:
 * - `.stub-empty` / `.stub-empty-title` — trimmed text content equals `Title`
 * - `.stub-empty-action` — a clickable button showing `ActionText`, rendered only when
 *   `ActionText` is non-empty; clicking it emits `Action` (like the real CTA button)
 * - projected content passes through `<ng-content>`
 *
 * `Variant`/`Size`/`ActionVariant` are typed as plain `string` (real component uses
 * literal unions) to keep the stub permissive.
 */
@Component({
  standalone: true,
  selector: 'mj-empty-state',
  template:
    '<span class="stub-empty"><span class="stub-empty-title">{{ Title }}</span></span>' +
    '@if (ActionText) {<button type="button" class="stub-empty-action" (click)="Action.emit($event)">{{ ActionText }}</button>}' +
    '<ng-content></ng-content>',
})
export class StubEmptyStateComponent {
  @Input() Icon: string | null = null;
  @Input() Title = '';
  @Input() Message = '';
  @Input() ActionText = '';
  @Input() ActionIcon = '';
  @Input() ActionVariant = 'primary';
  @Input() Variant = 'empty';
  @Input() Size = 'default';
  @Input() Role: string | null = null;
  @Output() Action = new EventEmitter<MouseEvent>();
}

/**
 * ControlValueAccessor double for `<mj-dropdown>` (`MJDropdownComponent` in
 * `@memberjunction/ng-ui-components`). Registers `NG_VALUE_ACCESSOR`, so templates
 * binding `[(ngModel)]` / `formControlName` to it compile and run (without a CVA,
 * Angular throws NG01203).
 *
 * Mirrors the real inputs (`Data`, `TextField`, `ValueField`, `Filterable`,
 * `ValuePrimitive`, `Disabled`, `Placeholder`, `DefaultItem`) and outputs
 * (`ValueChange`, `FilterChange`). The template renders an empty
 * `<select class="mj-dropdown">`; specs that want to push a value through the form can
 * set the select's value and dispatch `change`, or call the stub's CVA hooks directly.
 * The last written value is exposed as `value` for assertions.
 */
@Component({
  standalone: true,
  selector: 'mj-dropdown',
  template: '<select class="mj-dropdown" (change)="onSelect($event)"></select><ng-content></ng-content>',
  providers: [{ provide: NG_VALUE_ACCESSOR, useExisting: forwardRef(() => StubDropdownComponent), multi: true }],
})
export class StubDropdownComponent implements ControlValueAccessor {
  @Input() Data: Record<string, unknown>[] | string[] | readonly unknown[] | null = [];
  @Input() TextField = '';
  @Input() ValueField = '';
  @Input() Filterable = false;
  @Input() ValuePrimitive = false;
  @Input() Disabled = false;
  @Input() Placeholder = 'Select...';
  @Input() DefaultItem: Record<string, unknown> | string | null = null;
  @Output() FilterChange = new EventEmitter<string>();
  @Output() ValueChange = new EventEmitter<string>();

  /** Last value written through the CVA (by the form or by user interaction). */
  value: unknown;
  private onChange: (v: unknown) => void = () => undefined;
  private onTouched: () => void = () => undefined;

  writeValue(v: unknown): void {
    this.value = v;
  }
  registerOnChange(fn: (v: unknown) => void): void {
    this.onChange = fn;
  }
  registerOnTouched(fn: () => void): void {
    this.onTouched = fn;
  }
  onSelect(e: Event): void {
    const v = (e.target as HTMLSelectElement).value;
    this.value = v;
    this.onChange(v);
    this.onTouched();
    this.ValueChange.emit(v);
  }
}

/**
 * ControlValueAccessor double for `<mj-numeric-input>` (`MJNumericInputComponent` in
 * `@memberjunction/ng-ui-components`), mirroring its public inputs
 * (`Min`/`Max`/`Step`/`Format`/`Decimals`/`Disabled`/`Placeholder`).
 *
 * Renders a real `<input type="number" class="mj-numeric-input">` wired to the CVA, so
 * specs can type into it (`typeInto(fixture, '.mj-numeric-input', '5')`) and the bound
 * form control receives the parsed number (empty input → `null`).
 */
@Component({
  standalone: true,
  selector: 'mj-numeric-input',
  template: '<input type="number" class="mj-numeric-input" [value]="value ?? \'\'" (input)="onInput($event)" />',
  providers: [{ provide: NG_VALUE_ACCESSOR, useExisting: forwardRef(() => StubNumericInputComponent), multi: true }],
})
export class StubNumericInputComponent implements ControlValueAccessor {
  @Input() Min: number | null = null;
  @Input() Max: number | null = null;
  @Input() Step = 1;
  @Input() Format = '';
  @Input() Decimals: number | null = null;
  @Input() Disabled = false;
  @Input() Placeholder = '';

  /** Last value written through the CVA (by the form or by typing into the input). */
  value: number | null = null;
  private onChange: (v: number | null) => void = () => undefined;
  private onTouched: () => void = () => undefined;

  writeValue(v: number | null): void {
    this.value = v;
  }
  registerOnChange(fn: (v: number | null) => void): void {
    this.onChange = fn;
  }
  registerOnTouched(fn: () => void): void {
    this.onTouched = fn;
  }
  onInput(e: Event): void {
    const raw = (e.target as HTMLInputElement).value;
    this.value = raw === '' ? null : Number(raw);
    this.onChange(this.value);
    this.onTouched();
  }
}
