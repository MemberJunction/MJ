import { Component, EventEmitter, Input, Output } from '@angular/core';

/**
 * One applied filter, as surfaced in the `mj-applied-filters` chip row.
 * `label` is the dimension (e.g. "Status"), `value` is the human-readable
 * selection (e.g. "Active"), `key` uniquely identifies it for removal.
 */
export interface AppliedFilter {
  /** Stable identifier emitted on removal — typically `<field>:<value>`. */
  key: string;
  /** Dimension label shown before the colon (e.g. "Status", "Sort"). */
  label: string;
  /** Human-readable applied value shown after the colon (e.g. "Active"). */
  value: string;
}

/**
 * `mj-applied-filters` — the "Filtered by …" chip row that renders the *state*
 * of filtering, separate from the *input* (a single `mj-filter-popover`
 * "Filter" button). Each applied filter shows as a removable pill; a "Clear
 * all" link clears the lot.
 *
 * Part of the concise-chrome model: one Filter entry point sets filters, this
 * row shows what's on and removes them individually. Identical on desktop
 * (chips wrap) and mobile (chips scroll horizontally) — nothing new to learn
 * between breakpoints.
 *
 * Renders nothing when `Filters` is empty, so consumers can place it
 * unconditionally above their content.
 *
 * ## Example
 * ```html
 * <mj-applied-filters
 *   [Filters]="appliedFilters"
 *   (Remove)="onRemoveFilter($event)"
 *   (ClearAll)="resetAllFilters()">
 * </mj-applied-filters>
 * ```
 */
@Component({
  selector: 'mj-applied-filters',
  standalone: true,
  template: `
    @if (Filters.length > 0) {
      <div class="mj-applied-filters">
        <span class="mj-applied-filters__lead">{{ LeadLabel }}</span>
        @for (f of Filters; track f.key) {
          <span class="mj-applied-filters__token">
            <span class="mj-applied-filters__k">{{ f.label }}:</span>
            <span class="mj-applied-filters__v">{{ f.value }}</span>
            <button
              type="button"
              class="mj-applied-filters__x"
              [attr.aria-label]="'Remove ' + f.label + ' ' + f.value"
              (click)="OnRemove(f)">
              <i class="fa-solid fa-xmark" aria-hidden="true"></i>
            </button>
          </span>
        }
        <button type="button" class="mj-applied-filters__clear" (click)="OnClearAll()">
          {{ ClearAllLabel }}
        </button>
      </div>
    }
  `,
  styles: [`
    :host {
      display: block;
    }

    .mj-applied-filters {
      flex-shrink: 0;
      display: flex;
      align-items: center;
      gap: var(--mj-space-2);
      padding: var(--mj-space-3) var(--mj-space-5);
      background: var(--mj-bg-surface);
      border-bottom: 1px solid var(--mj-border-subtle);
    }

    .mj-applied-filters__lead {
      flex-shrink: 0;
      margin-right: 2px;
      font-size: 11px;
      font-weight: 600;
      text-transform: uppercase;
      letter-spacing: 0.05em;
      color: var(--mj-text-muted);
    }

    .mj-applied-filters__token {
      flex-shrink: 0;
      display: inline-flex;
      align-items: center;
      gap: 7px;
      height: 30px;
      padding: 0 5px 0 12px;
      border: 1px solid var(--mj-border-default);
      border-radius: 999px;
      background: var(--mj-bg-surface);
      font-size: 12.5px;
    }

    .mj-applied-filters__k {
      color: var(--mj-text-muted);
    }

    .mj-applied-filters__v {
      color: var(--mj-text-primary);
      font-weight: 600;
    }

    .mj-applied-filters__x {
      width: 19px;
      height: 19px;
      flex-shrink: 0;
      border: none;
      background: transparent;
      border-radius: 50%;
      display: grid;
      place-items: center;
      cursor: pointer;
      color: var(--mj-text-muted);
      font-size: 11px;
      font-family: inherit;
    }
    .mj-applied-filters__x:hover {
      background: var(--mj-bg-surface-sunken);
      color: var(--mj-text-primary);
    }

    .mj-applied-filters__clear {
      flex-shrink: 0;
      margin-left: 4px;
      border: none;
      background: transparent;
      cursor: pointer;
      font-family: inherit;
      font-size: 12.5px;
      font-weight: 600;
      color: var(--mj-brand-primary);
    }
    .mj-applied-filters__clear:hover {
      text-decoration: underline;
    }

    /* Mobile: the chip row scrolls horizontally rather than wrapping, so it
       stays a single compact line. */
    @media (max-width: 700px) {
      .mj-applied-filters {
        overflow-x: auto;
        flex-wrap: nowrap;
        scrollbar-width: none;
        -webkit-overflow-scrolling: touch;
        padding-left: var(--mj-space-4);
        padding-right: var(--mj-space-4);
      }
      .mj-applied-filters::-webkit-scrollbar {
        display: none;
      }
    }
  `]
})
export class MJAppliedFiltersComponent {
  /** The currently-applied filters rendered as removable chips. */
  @Input() Filters: AppliedFilter[] = [];

  /** Lead label shown before the chips. Defaults to "Filtered by". */
  @Input() LeadLabel: string = 'Filtered by';

  /** Label for the clear-all link. Defaults to "Clear all". */
  @Input() ClearAllLabel: string = 'Clear all';

  /** Emitted when a single filter's ✕ is clicked. */
  @Output() Remove = new EventEmitter<AppliedFilter>();

  /** Emitted when the "Clear all" link is clicked. */
  @Output() ClearAll = new EventEmitter<void>();

  OnRemove(filter: AppliedFilter): void {
    this.Remove.emit(filter);
  }

  OnClearAll(): void {
    this.ClearAll.emit();
  }
}
