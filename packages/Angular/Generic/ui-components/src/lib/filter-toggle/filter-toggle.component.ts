import { Component, EventEmitter, Input, Output } from '@angular/core';

/**
 * mj-filter-toggle — Canonical "Show Filters" / "Hide Filters" button used in
 * MJ Explorer dashboard headers. Replaces per-page `.filter-toggle-btn` rules.
 *
 * Example:
 * ```html
 * <mj-filter-toggle [Active]="filterPanelVisible" (Toggled)="toggleFilterPanel()">
 * </mj-filter-toggle>
 * ```
 */
@Component({
  selector: 'mj-filter-toggle',
  standalone: true,
  template: `
    <button
      type="button"
      class="mj-filter-toggle"
      [class.mj-filter-toggle--active]="Active"
      [attr.aria-pressed]="Active"
      [title]="Active ? HideLabel : ShowLabel"
      (click)="Toggled.emit()">
      <i [class]="Icon"></i>
      <span>{{ Active ? HideLabel : ShowLabel }}</span>
    </button>
  `,
  styles: [`
    :host {
      display: inline-flex;
    }

    .mj-filter-toggle {
      display: inline-flex;
      align-items: center;
      gap: 8px;
      padding: 8px 14px;
      background: var(--mj-bg-surface-card);
      border: 1px solid var(--mj-border-default);
      border-radius: var(--mj-radius-md);
      color: var(--mj-text-secondary);
      font-family: inherit;
      font-size: 13px;
      font-weight: 500;
      line-height: 1.2;
      cursor: pointer;
      transition: background-color 0.2s ease, border-color 0.2s ease, color 0.2s ease;
      white-space: nowrap;
    }

    .mj-filter-toggle:hover {
      background: var(--mj-bg-surface-sunken);
      border-color: var(--mj-border-strong);
      color: var(--mj-text-primary);
    }

    .mj-filter-toggle--active {
      background: color-mix(in srgb, var(--mj-brand-primary) 10%, var(--mj-bg-surface));
      border-color: color-mix(in srgb, var(--mj-brand-primary) 30%, var(--mj-border-default));
      color: var(--mj-brand-primary);
    }

    .mj-filter-toggle--active:hover {
      background: color-mix(in srgb, var(--mj-brand-primary) 14%, var(--mj-bg-surface));
    }

    .mj-filter-toggle i {
      font-size: 12px;
      color: var(--mj-brand-primary);
    }

    .mj-filter-toggle--active i {
      color: var(--mj-brand-primary);
    }
  `]
})
export class MJFilterToggleComponent {
  @Input() Active: boolean = false;
  @Input() ShowLabel: string = 'Show Filters';
  @Input() HideLabel: string = 'Hide Filters';
  @Input() Icon: string = 'fa-solid fa-filter';
  @Output() Toggled = new EventEmitter<void>();
}
