import { Component, Input, Output, EventEmitter, HostBinding, ContentChild, TemplateRef, Directive } from '@angular/core';
import { NgTemplateOutlet } from '@angular/common';

/** Process-wide counter for generating unique, stable accordion element ids
 *  (used to wire `aria-controls` / `aria-labelledby` between header and body). */
let nextAccordionUid = 0;

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
    <div class="mj-accordion-panel" [class.mj-accordion-panel--expanded]="Expanded" [class.mj-accordion-panel--disabled]="Disabled"
      [class.mj-accordion-panel--muted-icon]="TitleIconMuted"
      [attr.data-variant]="Variant !== 'default' ? Variant : null">
      <button class="mj-accordion-header" type="button"
        [id]="HeaderId"
        [attr.aria-expanded]="Expanded"
        [attr.aria-controls]="BodyId"
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
      <div class="mj-accordion-body-outer" [attr.inert]="Expanded ? null : ''">
        <div class="mj-accordion-body-clip">
          <div class="mj-accordion-body" role="region" [id]="BodyId" [attr.aria-labelledby]="HeaderId">
            <ng-content></ng-content>
          </div>
        </div>
      </div>
    </div>
  `
})
export class MJAccordionPanelComponent {
  @Input() Title = '';
  @Input() Expanded = false;
  @Input() Disabled = false;
  /**
   * Emphasis variant for visual hierarchy:
   * - `primary`   — bold, solid brand-colored header (use to make a panel stand out)
   * - `secondary` — subtle brand tint
   * - `default`   — standard neutral header
   * All brand-token-driven, so dark-mode-safe and themeable.
   */
  @Input() Variant: 'default' | 'primary' | 'secondary' = 'default';
  /**
   * Render icons projected into the title slot in the muted color instead of the
   * header's primary text color. Lets consumers get the common "quiet icon" look
   * without writing CSS. Status/brand-colored icons can still be colored inline.
   */
  @Input() TitleIconMuted = false;
  @Output() ExpandedChange = new EventEmitter<boolean>();
  @ContentChild(MJAccordionTitleDirective) titleTemplate: MJAccordionTitleDirective | null = null;
  @HostBinding('class.mj-accordion-panel-host') readonly hostClass = true;

  /** Stable per-instance ids that programmatically associate the header
   *  `<button>` with its body region (`aria-controls` ↔ `aria-labelledby`),
   *  completing the WAI-ARIA accordion pattern so screen readers announce the
   *  region with the header's name. */
  private readonly _uid = nextAccordionUid++;
  readonly HeaderId = `mj-accordion-header-${this._uid}`;
  readonly BodyId = `mj-accordion-body-${this._uid}`;

  Toggle(): void {
    if (this.Disabled) return;
    this.Expanded = !this.Expanded;
    this.ExpandedChange.emit(this.Expanded);
  }
}
