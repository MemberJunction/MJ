import { Component, EventEmitter, Input, Output } from '@angular/core';
import {
    CONTEXT_TOKENS,
    ContextToken,
    PROPERTY_OFFSET_UNITS,
    PropertyDefault,
    PropertyOffsetUnit,
    PropertyValue,
    PropertyValueType,
} from '@memberjunction/core';

/** How a default is given: none, a fixed value, or a context token. */
export type PropertyDefaultMode = 'none' | 'value' | 'token';

const USER_TOKENS: readonly ContextToken[] = ['Context.UserID', 'Context.UserEmail', 'Context.UserName'];

/** A fixed value from what the user typed: a number for a number type, true/false for a boolean, blank for none. */
export function ParseDefaultValueText(text: string, type: PropertyValueType): PropertyValue {
    const trimmed = text.trim();
    if (trimmed.length === 0) return null;
    if (type === 'number') return Number(trimmed);
    if (type === 'boolean') return trimmed === 'true';
    return text;
}

/**
 * Edits one default (a dashboard property's, or a part input mapping's): none, a fixed value of the
 * given type, or a context token with an optional offset for date tokens. Every change emits a new
 * default (undefined for none) through `DefaultChange`, so `[(Default)]` works.
 */
@Component({
    standalone: false,
    selector: 'mj-property-default-editor',
    template: `
      <div class="pde">
        <select class="mj-input pde-mode" [attr.aria-label]="Label + ' kind'" [ngModel]="Mode" (ngModelChange)="SetMode($event)" [disabled]="Disabled">
          <option value="none">{{ NoneLabel }}</option>
          <option value="value">Fixed value</option>
          <option value="token">Context token</option>
        </select>
        @if (Mode === 'value') {
          @if (Type === 'boolean') {
            <select class="mj-input pde-value" [attr.aria-label]="Label" [ngModel]="ValueText" (ngModelChange)="SetValue($event)" [disabled]="Disabled">
              <option value="">(none)</option>
              <option value="true">true</option>
              <option value="false">false</option>
            </select>
          } @else {
            <input class="mj-input pde-value" [attr.aria-label]="Label"
              [type]="Type === 'number' ? 'number' : Type === 'date' ? 'date' : 'text'"
              [ngModel]="ValueText" (ngModelChange)="SetValue($event ?? '')" [disabled]="Disabled" />
          }
        }
        @if (Mode === 'token') {
          <select class="mj-input pde-value" [attr.aria-label]="Label + ' token'" [ngModel]="Default?.Token" (ngModelChange)="SetToken($event)" [disabled]="Disabled">
            @for (token of Tokens; track token) {
              <option [value]="token">{{ token }}</option>
            }
          </select>
          @if (TakesOffset) {
            <input class="mj-input pde-offset" type="number" step="1" [attr.aria-label]="Label + ' offset'" placeholder="Offset"
              [ngModel]="Default?.Offset?.Amount ?? null" (ngModelChange)="SetOffset($event, Default?.Offset?.Unit ?? 'day')" [disabled]="Disabled" />
            <select class="mj-input pde-unit" [attr.aria-label]="Label + ' offset unit'" [ngModel]="Default?.Offset?.Unit ?? 'day'"
              (ngModelChange)="SetOffset(Default?.Offset?.Amount ?? null, $event)" [disabled]="Disabled || !Default?.Offset">
              @for (unit of OffsetUnits; track unit) {
                <option [value]="unit">{{ unit }}</option>
              }
            </select>
          }
        }
      </div>
    `,
    styles: [`
      .pde { display: flex; flex-wrap: wrap; gap: 6px; align-items: center; }
      .pde-mode { flex: 0 0 140px; }
      .pde-value { flex: 1 1 140px; min-width: 120px; }
      .pde-offset { flex: 0 0 90px; }
      .pde-unit { flex: 0 0 100px; }
    `]
})
export class PropertyDefaultEditorComponent {
    /** The default being edited; undefined for none. */
    @Input() Default: PropertyDefault | undefined = undefined;
    /** The type a fixed value takes. */
    @Input() Type: PropertyValueType = 'string';
    /** The accessible name of the controls. */
    @Input() Label = 'Default';
    /** The text of the "no default" choice. */
    @Input() NoneLabel = 'No default';
    @Input() Disabled = false;
    @Output() DefaultChange = new EventEmitter<PropertyDefault | undefined>();

    public readonly Tokens = CONTEXT_TOKENS;
    public readonly OffsetUnits = PROPERTY_OFFSET_UNITS;

    public get Mode(): PropertyDefaultMode {
        if (!this.Default) return 'none';
        return this.Default.Token !== undefined ? 'token' : 'value';
    }

    /** The fixed value as the text an input shows. */
    public get ValueText(): string {
        const value = this.Default?.Value;
        return value === null || value === undefined ? '' : String(value);
    }

    /** True when the default is a date token, which can take an offset. */
    public get TakesOffset(): boolean {
        return !!this.Default?.Token && !USER_TOKENS.includes(this.Default.Token);
    }

    public SetMode(mode: PropertyDefaultMode): void {
        const defaults: Record<PropertyDefaultMode, PropertyDefault | undefined> = {
            none: undefined,
            value: { Value: null },
            token: { Token: this.Type === 'uuid' ? 'Context.UserID' : 'Context.Today' },
        };
        this.emit(defaults[mode]);
    }

    public SetValue(text: string): void {
        this.emit({ Value: ParseDefaultValueText(text, this.Type) });
    }

    /** A user token takes no offset, so choosing one drops it. */
    public SetToken(token: ContextToken): void {
        const offset = USER_TOKENS.includes(token) ? undefined : this.Default?.Offset;
        this.emit(offset ? { Token: token, Offset: offset } : { Token: token });
    }

    /** An offset of 0 (or blank) removes it. */
    public SetOffset(amount: number | null, unit: PropertyOffsetUnit): void {
        const token = this.Default?.Token;
        if (!token) return;
        this.emit(amount ? { Token: token, Offset: { Amount: Math.trunc(amount), Unit: unit } } : { Token: token });
    }

    private emit(value: PropertyDefault | undefined): void {
        this.Default = value;
        this.DefaultChange.emit(value);
    }
}
