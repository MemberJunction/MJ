import { Component, Input } from '@angular/core';

/**
 * mj-filter-field — Single row inside a filter panel: icon + label above a projected widget.
 * Used either by `<mj-filter-panel>` internally (for config-driven fields) or directly in
 * a page template as the escape hatch for custom widgets (tree-dropdown, date-range, etc.).
 *
 * Example (standalone usage for a custom widget):
 * ```html
 * <mj-filter-panel ...>
 *   <mj-filter-field Label="Category" Icon="fa-solid fa-folder">
 *     <mj-tree-dropdown ...></mj-tree-dropdown>
 *   </mj-filter-field>
 * </mj-filter-panel>
 * ```
 */
@Component({
  selector: 'mj-filter-field',
  standalone: true,
  template: `
    <label class="mj-filter-field">
      <span class="mj-filter-field-label">
        @if (Icon) { <i [class]="Icon"></i> }
        {{ Label }}
      </span>
      <ng-content></ng-content>
    </label>
  `,
  styles: [`
    :host { display: block; }

    .mj-filter-field {
      display: flex;
      flex-direction: column;
      gap: 6px;
    }

    .mj-filter-field-label {
      display: flex;
      align-items: center;
      gap: 6px;
      font-size: 11px;
      font-weight: 600;
      text-transform: uppercase;
      letter-spacing: 0.04em;
      color: var(--mj-brand-primary);
    }

    .mj-filter-field-label i {
      font-size: 11px;
      color: var(--mj-brand-primary);
    }
  `]
})
export class MJFilterFieldComponent {
  @Input() Label: string = '';
  @Input() Icon: string | null = null;
}
