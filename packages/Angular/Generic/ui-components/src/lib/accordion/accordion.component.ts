import { Component, Input, Output, EventEmitter, HostBinding, ContentChild, TemplateRef, Directive } from '@angular/core';
import { NgTemplateOutlet } from '@angular/common';

/**
 * Directive to mark a template as the accordion panel title.
 * Supports rich HTML content (icons, badges, dynamic text).
 *
 * @example
 * ```html
 * <mj-accordion-panel [Expanded]="true">
 *   <ng-template mjAccordionTitle>
 *     <i class="fa-solid fa-code"></i> Template Editor
 *     <span class="badge">3</span>
 *   </ng-template>
 *   <p>Panel content here</p>
 * </mj-accordion-panel>
 * ```
 */
@Directive({
  selector: '[mjAccordionTitle]',
  standalone: true
})
export class MJAccordionTitleDirective {
  constructor(public templateRef: TemplateRef<unknown>) {}
}

/**
 * mj-accordion-panel — Collapsible panel. Replaces `<kendo-panelbar-item>` and `<kendo-expansionpanel>`.
 *
 * Supports two title modes:
 * - Simple string: `[Title]="'Details'"` — plain text title
 * - Rich template: `<ng-template mjAccordionTitle>` — HTML with icons, badges, etc.
 *
 * @example
 * ```html
 * <!-- Simple string title -->
 * <mj-accordion-panel Title="Details" [Expanded]="true">
 *   <p>Panel content here</p>
 * </mj-accordion-panel>
 *
 * <!-- Rich HTML title -->
 * <mj-accordion-panel [Expanded]="true">
 *   <ng-template mjAccordionTitle>
 *     <i class="fa-solid fa-code"></i> Template Editor
 *   </ng-template>
 *   <p>Panel content here</p>
 * </mj-accordion-panel>
 * ```
 */
@Component({
  selector: 'mj-accordion-panel',
  standalone: true,
  imports: [NgTemplateOutlet],
  template: `
    <div class="mj-accordion-panel" [class.mj-accordion-panel--expanded]="Expanded" [class.mj-accordion-panel--disabled]="Disabled">
      <button class="mj-accordion-header" type="button"
        [attr.aria-expanded]="Expanded"
        [disabled]="Disabled"
        (click)="Toggle()">
        <span class="mj-accordion-title">
          @if (titleTemplate) {
            <ng-container [ngTemplateOutlet]="titleTemplate.templateRef"></ng-container>
          } @else {
            {{ Title }}
          }
        </span>
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
export class MJAccordionPanelComponent {
  @Input() Title = '';
  @Input() Expanded = false;
  @Input() Disabled = false;
  @Output() ExpandedChange = new EventEmitter<boolean>();
  @ContentChild(MJAccordionTitleDirective) titleTemplate: MJAccordionTitleDirective | null = null;
  @HostBinding('class.mj-accordion-panel-host') readonly hostClass = true;

  Toggle(): void {
    if (this.Disabled) return;
    this.Expanded = !this.Expanded;
    this.ExpandedChange.emit(this.Expanded);
  }
}
