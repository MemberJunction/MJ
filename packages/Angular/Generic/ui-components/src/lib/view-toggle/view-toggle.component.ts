import { Component, EventEmitter, Input, Output } from '@angular/core';

/** Per-option config understood by <mj-view-toggle>. */
export interface ViewToggleOption {
  /** Unique key — emitted via (KeyChange) when clicked. */
  key: string;
  /** Font Awesome icon class (e.g. 'fa-solid fa-grip'). */
  icon: string;
  /** Tooltip / aria-label (since there's no visible text). */
  title: string;
}

/**
 * mj-view-toggle — Compact icon-only segmented control for view-mode selection
 * (grid / list / tree / card etc.). Visually smaller than `<mj-tab-nav>` to signal
 * "this is a view setting, not page navigation".
 *
 * Example:
 * ```html
 * <mj-view-toggle
 *   [Options]="viewOptions"
 *   [ActiveKey]="viewMode"
 *   (KeyChange)="setViewMode($event)">
 * </mj-view-toggle>
 *
 * // In the component:
 * viewOptions = [
 *   { key: 'grid', icon: 'fa-solid fa-grip',        title: 'Grid View' },
 *   { key: 'list', icon: 'fa-solid fa-list',        title: 'List View' },
 *   { key: 'tree', icon: 'fa-solid fa-folder-tree', title: 'Category Tree View' },
 * ];
 * ```
 */
@Component({
  selector: 'mj-view-toggle',
  standalone: true,
  template: `
    <div class="mj-view-toggle" role="group">
      @for (opt of Options; track opt.key) {
        <button
          type="button"
          class="mj-view-toggle-btn"
          [class.mj-view-toggle-btn--active]="opt.key === ActiveKey"
          [attr.aria-pressed]="opt.key === ActiveKey"
          [attr.aria-label]="opt.title"
          [title]="opt.title"
          (click)="KeyChange.emit(opt.key)">
          <i [class]="opt.icon" aria-hidden="true"></i>
        </button>
      }
    </div>
  `,
  styles: [`
    :host { display: inline-flex; }

    .mj-view-toggle {
      display: inline-flex;
      gap: 2px;
      padding: 3px;
      background: var(--mj-bg-surface-card);
      border: 1px solid var(--mj-border-default);
      border-radius: var(--mj-radius-md);
    }

    .mj-view-toggle-btn {
      display: inline-flex;
      align-items: center;
      justify-content: center;
      width: 28px;
      height: 28px;
      background: transparent;
      border: none;
      border-radius: var(--mj-radius-sm);
      color: var(--mj-text-muted);
      font-size: 13px;
      line-height: 1;
      cursor: pointer;
      transition: background-color 0.15s ease, color 0.15s ease;
    }

    .mj-view-toggle-btn:hover:not(.mj-view-toggle-btn--active) {
      background: color-mix(in srgb, var(--mj-bg-surface) 70%, transparent);
      color: var(--mj-text-primary);
    }

    .mj-view-toggle-btn--active {
      background: var(--mj-bg-surface);
      color: var(--mj-brand-primary);
      box-shadow: 0 1px 2px color-mix(in srgb, var(--mj-text-primary) 12%, transparent);
    }
  `]
})
export class MJViewToggleComponent {
  @Input() Options: ViewToggleOption[] = [];
  @Input() ActiveKey: string = '';
  @Output() KeyChange = new EventEmitter<string>();
}
