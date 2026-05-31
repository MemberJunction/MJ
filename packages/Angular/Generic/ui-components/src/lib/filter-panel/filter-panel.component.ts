import { Component, EventEmitter, Input, Output } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { MJDropdownComponent } from '../dropdown/dropdown.component';
import { MJFilterChipComponent } from '../filter-chip/filter-chip.component';
import { MJFilterFieldComponent } from '../filter-field/filter-field.component';

/** Field types supported natively by <mj-filter-panel>. */
export type FilterFieldType = 'text' | 'dropdown' | 'chips';

/** Per-field config understood by <mj-filter-panel>. */
export interface FilterFieldConfig {
  /** State key in the Values record. */
  key: string;
  /** Field type — drives which widget is rendered. */
  type: FilterFieldType;
  /** Display label. */
  label: string;
  /** Optional Font Awesome icon class (e.g. 'fa-solid fa-folder'). */
  icon?: string;
  /** Placeholder for text inputs / dropdowns. */
  placeholder?: string;
  /** Dropdown options (when type === 'dropdown'). Each option needs text + value. */
  options?: { text: string; value: string | number | boolean | null }[];
  /** Whether the dropdown should show an internal search box. */
  filterable?: boolean;
  /** Chip-group options (when type === 'chips'). */
  chipOptions?: { text: string; value: string | number | boolean | null; icon?: string }[];
}

/**
 * mj-filter-panel — Single centralized filter panel for all dashboards.
 *
 * Config-driven: pass an array of `FilterFieldConfig` plus a `Values` record;
 * the panel renders each field using the appropriate widget (text input,
 * `<mj-dropdown>`, or chip group), keeps everything visually consistent, and
 * emits state changes via `(ValuesChange)`.
 *
 * For widgets not covered by the config schema (tree-dropdown, date pickers,
 * etc.), project `<mj-filter-field>` elements as content — they render below
 * the config-driven fields with identical chrome.
 *
 * Example:
 * ```html
 * <mj-filter-panel
 *   [Fields]="filterFields"
 *   [(Values)]="filterValues"
 *   (Reset)="onReset()">
 *
 *   <!-- escape hatch for custom widgets -->
 *   <mj-filter-field Label="Category" Icon="fa-solid fa-folder">
 *     <mj-tree-dropdown ...></mj-tree-dropdown>
 *   </mj-filter-field>
 * </mj-filter-panel>
 * ```
 */
@Component({
  selector: 'mj-filter-panel',
  standalone: true,
  imports: [CommonModule, FormsModule, MJDropdownComponent, MJFilterChipComponent, MJFilterFieldComponent],
  template: `
    <div class="mj-filter-panel">
      <div class="mj-filter-panel-body">
        @for (field of Fields; track field.key) {
          <mj-filter-field [Label]="field.label" [Icon]="field.icon ?? null">
            @switch (field.type) {
              @case ('text') {
                <input
                  type="text"
                  class="mj-filter-panel-text-input"
                  [value]="getValue(field.key) ?? ''"
                  [placeholder]="field.placeholder ?? ''"
                  (input)="setValue(field.key, $any($event.target).value)" />
              }
              @case ('dropdown') {
                <mj-dropdown
                  [Data]="field.options ?? []"
                  TextField="text"
                  ValueField="value"
                  [ValuePrimitive]="true"
                  [Filterable]="!!field.filterable"
                  [Placeholder]="field.placeholder ?? ''"
                  [ngModel]="getValue(field.key)"
                  (ngModelChange)="setValue(field.key, $event)">
                </mj-dropdown>
              }
              @case ('chips') {
                <div class="mj-filter-panel-chip-group">
                  @for (opt of field.chipOptions ?? []; track opt.value) {
                    <mj-filter-chip
                      [Label]="opt.text"
                      [Icon]="opt.icon ?? null"
                      [Active]="getValue(field.key) === opt.value"
                      (Clicked)="setValue(field.key, opt.value)">
                    </mj-filter-chip>
                  }
                </div>
              }
            }
          </mj-filter-field>
        }

        <!-- Escape hatch for custom field widgets (e.g. mj-tree-dropdown, date pickers) -->
        <ng-content></ng-content>
      </div>

      @if (ShowReset) {
        <div class="mj-filter-panel-footer">
          <button type="button" class="mj-filter-panel-reset" (click)="Reset.emit()">
            <i class="fa-solid fa-rotate-left"></i> {{ ResetLabel }}
          </button>
        </div>
      }
    </div>
  `,
  styles: [`
    :host {
      display: block;
    }

    .mj-filter-panel {
      display: flex;
      flex-direction: column;
      gap: 14px;
    }

    .mj-filter-panel-body {
      display: flex;
      flex-direction: column;
      gap: 14px;
    }

    .mj-filter-panel-text-input {
      width: 100%;
      padding: 7px 12px;
      background: var(--mj-bg-surface-card);
      border: 1px solid var(--mj-border-default);
      border-radius: var(--mj-radius-md);
      font: inherit;
      font-size: 13px;
      color: var(--mj-text-primary);
      transition: border-color 0.15s ease, box-shadow 0.15s ease;
    }

    .mj-filter-panel-text-input:focus {
      outline: none;
      border-color: var(--mj-brand-primary);
      box-shadow: 0 0 0 2px color-mix(in srgb, var(--mj-brand-primary) 15%, transparent);
    }

    .mj-filter-panel-text-input::placeholder {
      color: var(--mj-text-muted);
    }

    .mj-filter-panel-chip-group {
      display: flex;
      flex-wrap: wrap;
      gap: 6px;
    }

    .mj-filter-panel-footer {
      display: flex;
      justify-content: flex-end;
      padding-top: 10px;
      border-top: 1px solid var(--mj-border-subtle);
    }

    .mj-filter-panel-reset {
      display: inline-flex;
      align-items: center;
      gap: 6px;
      padding: 6px 12px;
      background: transparent;
      border: 1px solid var(--mj-border-default);
      border-radius: var(--mj-radius-md);
      color: var(--mj-text-secondary);
      font: inherit;
      font-size: 12px;
      font-weight: 500;
      cursor: pointer;
      transition: background-color 0.15s ease, border-color 0.15s ease, color 0.15s ease;
    }

    .mj-filter-panel-reset:hover {
      background: var(--mj-bg-surface-sunken);
      border-color: var(--mj-border-strong);
      color: var(--mj-text-primary);
    }

    .mj-filter-panel-reset i {
      font-size: 11px;
    }
  `]
})
export class MJFilterPanelComponent {
  @Input() Fields: FilterFieldConfig[] = [];
  @Input() Values: Record<string, unknown> = {};
  @Input() ShowReset: boolean = true;
  @Input() ResetLabel: string = 'Reset filters';

  @Output() ValuesChange = new EventEmitter<Record<string, unknown>>();
  @Output() Reset = new EventEmitter<void>();

  public getValue(key: string): unknown {
    return this.Values?.[key];
  }

  public setValue(key: string, value: unknown): void {
    this.Values = { ...this.Values, [key]: value };
    this.ValuesChange.emit(this.Values);
  }
}
