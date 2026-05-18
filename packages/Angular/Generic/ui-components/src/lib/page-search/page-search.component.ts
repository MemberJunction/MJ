import { Component, EventEmitter, Input, Output } from '@angular/core';

/**
 * mj-page-search — Canonical in-page search input for dashboard headers and toolbars.
 * Replaces per-page `.search-input-wrapper` rules so styling can't drift.
 *
 * Distinct from `mj-search-input` (the navbar/global search in `@memberjunction/ng-search`)
 * — this one is a simple text input used for filtering page content.
 *
 * Example:
 * ```html
 * <mj-page-search
 *   Placeholder="Search templates..."
 *   [Value]="searchTerm"
 *   (ValueChange)="onSearch($event)">
 * </mj-page-search>
 * ```
 */
@Component({
  selector: 'mj-page-search',
  standalone: true,
  template: `
    <div class="mj-page-search" [class.mj-page-search--focused]="focused">
      <i [class]="Icon"></i>
      <input
        type="text"
        [placeholder]="Placeholder"
        [value]="Value"
        (input)="onInput($event)"
        (focus)="focused = true"
        (blur)="focused = false" />
    </div>
  `,
  styles: [`
    :host {
      display: inline-flex;
      min-width: 220px;
    }

    /* Compact toolbar density (32px) to match mjButton size="sm" and other
       header widgets. White background + border-default for visual differentiation
       on both the page-header (white) and body (sunken) surfaces.
       Note: this is intentionally tighter than .mj-input (38px) because
       mj-page-search is a toolbar widget, not a form field. */
    .mj-page-search {
      display: flex;
      align-items: center;
      gap: var(--mj-space-2);
      width: 100%;
      padding: var(--mj-space-1) var(--mj-space-3);
      font-family: var(--mj-font-family);
      font-size: var(--mj-text-sm);
      line-height: 1.5;
      color: var(--mj-text-primary);
      background: var(--mj-bg-surface);
      border: 1px solid var(--mj-border-default);
      border-radius: var(--mj-radius-sm);
      transition: var(--mj-transition-colors), box-shadow var(--mj-transition-base);
      min-height: 32px;
      box-sizing: border-box;
    }

    .mj-page-search:hover {
      border-color: var(--mj-border-strong);
    }

    .mj-page-search--focused {
      border-color: var(--mj-brand-primary);
      box-shadow: var(--mj-focus-ring);
    }

    .mj-page-search i {
      color: var(--mj-text-muted);
      font-size: 13px;
      flex-shrink: 0;
    }

    .mj-page-search input {
      flex: 1;
      border: none;
      outline: none;
      background: transparent;
      font: inherit;
      color: var(--mj-text-primary);
      min-width: 0;
    }

    .mj-page-search input::placeholder {
      color: var(--mj-text-disabled);
    }
  `]
})
export class MJPageSearchComponent {
  @Input() Placeholder: string = 'Search...';
  @Input() Value: string = '';
  @Input() Icon: string = 'fa-solid fa-search';
  @Output() ValueChange = new EventEmitter<string>();

  public focused: boolean = false;

  public onInput(event: Event): void {
    const v = (event.target as HTMLInputElement).value;
    this.Value = v;
    this.ValueChange.emit(v);
  }
}
