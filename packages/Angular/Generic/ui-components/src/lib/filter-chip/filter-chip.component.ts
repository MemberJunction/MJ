import { Component, EventEmitter, Input, Output } from '@angular/core';

/**
 * mj-filter-chip — Canonical clickable filter chip / segmented option.
 * Replaces per-page `.filter-chip` rules so styling can't drift.
 *
 * Active state highlights with brand-primary. Optional icon + count.
 *
 * Example:
 * ```html
 * <mj-filter-chip
 *   Label="Failed"
 *   Icon="fa-solid fa-times-circle"
 *   [Active]="statusFilter === 'Failed'"
 *   (Clicked)="onStatusFilter('Failed')">
 * </mj-filter-chip>
 *
 * <mj-filter-chip Label="All" [Count]="totalCount" [Active]="!categoryFilter"
 *   (Clicked)="onCategoryFilter('')"></mj-filter-chip>
 * ```
 */
@Component({
  selector: 'mj-filter-chip',
  standalone: true,
  template: `
    <button
      type="button"
      class="mj-filter-chip"
      [class.mj-filter-chip--active]="Active"
      [attr.aria-pressed]="Active"
      (click)="Clicked.emit()">
      @if (Icon) {
        <i [class]="Icon"></i>
      }
      <span>{{ Label }}</span>
      @if (Count != null) {
        <span class="mj-filter-chip-count">({{ Count }})</span>
      }
    </button>
  `,
  styles: [`
    :host { display: inline-flex; }

    .mj-filter-chip {
      display: inline-flex;
      align-items: center;
      gap: 6px;
      padding: 5px 12px;
      background: var(--mj-bg-surface-card);
      border: 1px solid var(--mj-border-default);
      border-radius: 16px;
      color: var(--mj-text-secondary);
      font-family: inherit;
      font-size: 12px;
      font-weight: 500;
      line-height: 1.4;
      cursor: pointer;
      transition: background-color 0.15s ease, border-color 0.15s ease, color 0.15s ease;
      white-space: nowrap;
    }

    .mj-filter-chip:hover {
      background: var(--mj-bg-surface-sunken);
      border-color: var(--mj-border-strong);
      color: var(--mj-text-primary);
    }

    .mj-filter-chip--active {
      background: color-mix(in srgb, var(--mj-brand-primary) 12%, var(--mj-bg-surface));
      border-color: color-mix(in srgb, var(--mj-brand-primary) 35%, var(--mj-border-default));
      color: var(--mj-brand-primary);
    }

    .mj-filter-chip--active:hover {
      background: color-mix(in srgb, var(--mj-brand-primary) 16%, var(--mj-bg-surface));
    }

    .mj-filter-chip i {
      font-size: 10px;
      flex-shrink: 0;
    }

    .mj-filter-chip-count {
      opacity: 0.7;
      font-weight: 400;
    }
  `]
})
export class MJFilterChipComponent {
  @Input() Label: string = '';
  @Input() Icon: string | null = null;
  @Input() Count: number | null = null;
  @Input() Active: boolean = false;
  @Output() Clicked = new EventEmitter<void>();
}
