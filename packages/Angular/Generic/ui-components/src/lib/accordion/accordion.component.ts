import { Component, Input, HostBinding } from '@angular/core';

/**
 * mj-accordion-panel — Collapsible panel. Replaces `<kendo-panelbar-item>` and `<kendo-expansionpanel>`.
 *
 * @example
 * ```html
 * <mj-accordion-panel Title="Details" [Expanded]="true">
 *   <p>Panel content here</p>
 * </mj-accordion-panel>
 * ```
 */
@Component({
  selector: 'mj-accordion-panel',
  standalone: true,
  template: `
    <div class="mj-accordion-panel" [class.mj-accordion-panel--expanded]="Expanded">
      <button class="mj-accordion-header" type="button"
        [attr.aria-expanded]="Expanded"
        (click)="Toggle()">
        <span class="mj-accordion-title">{{ Title }}</span>
        <i class="fa-solid fa-chevron-down mj-accordion-icon"></i>
      </button>
      @if (Expanded) {
        <div class="mj-accordion-body" role="region">
          <ng-content></ng-content>
        </div>
      }
    </div>
  `
})
export class MjAccordionPanelComponent {
  @Input() Title = '';
  @Input() Expanded = false;
  @HostBinding('class.mj-accordion-panel-host') readonly hostClass = true;

  Toggle(): void {
    this.Expanded = !this.Expanded;
  }
}
