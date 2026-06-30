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
 * Directive to mark a template as the accordion header **actions** — interactive
 * controls (edit / copy / run / checkbox, etc.) that sit in the header row but
 * are NOT the expand/collapse toggle. Rendered as a sibling of the toggle
 * `<button>`, so there's no button-in-button and the toggle stays a clean,
 * accessible control.
 *
 * @example
 * ```html
 * <mj-accordion-panel>
 *   <ng-template mjAccordionTitle>Connection</ng-template>
 *   <ng-template mjAccordionActions>
 *     <button mjButton variant="icon" (click)="edit()"><i class="fa fa-pen"></i></button>
 *   </ng-template>
 *   …body…
 * </mj-accordion-panel>
 * ```
 */
@Directive({
  selector: '[mjAccordionActions]',
  standalone: true
})
export class MJAccordionActionsDirective {
  constructor(public templateRef: TemplateRef<unknown>) {}
}

/**
 * Directive to mark a template as the accordion **body** — the panel's collapsible
 * content. Use this INSTEAD of placing content directly in the panel when the body
 * may be expensive (code editors, grids, large lists) OR just to be future-proof:
 * the accordion instantiates the template **lazily on first expand** and then keeps
 * it alive, so nothing is created until the user opens the panel, while later
 * open/close still animates. Consumers never have to reason about content weight or
 * write `@if (expanded)` themselves.
 *
 * @example
 * ```html
 * <mj-accordion-panel [Expanded]="open" (ExpandedChange)="open = $event">
 *   <ng-template mjAccordionTitle>Configuration</ng-template>
 *   <ng-template mjAccordionBody>
 *     <mj-code-editor ...></mj-code-editor>   <!-- not created until first opened -->
 *   </ng-template>
 * </mj-accordion-panel>
 * ```
 */
@Directive({
  selector: '[mjAccordionBody]',
  standalone: true
})
export class MJAccordionBodyDirective {
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
      [class.mj-accordion-panel--sm]="Size === 'sm'"
      [class.mj-accordion-panel--bare]="Bare"
      [class.mj-accordion-panel--flush-body]="FlushBody"
      [class.mj-accordion-panel--fill]="Fill"
      [attr.data-variant]="Variant !== 'default' ? Variant : null">
      <div class="mj-accordion-header-row">
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
        </button>
        @if (actionsTemplate) {
          <div class="mj-accordion-actions">
            <ng-container [ngTemplateOutlet]="actionsTemplate.templateRef"></ng-container>
          </div>
        }
        <!-- The chevron is ALWAYS the rightmost element of the header row (after any
             actions). It's a secondary, a11y-hidden toggle affordance — the primary
             disclosure control is the title button above (which owns aria-expanded). -->
        <button class="mj-accordion-chevron" type="button" tabindex="-1" aria-hidden="true"
          [disabled]="Disabled" (click)="Toggle()">
          <i class="fa-solid fa-chevron-down mj-accordion-icon"></i>
        </button>
      </div>
      <div class="mj-accordion-body-outer" [attr.inert]="Expanded ? null : ''">
        <div class="mj-accordion-body-clip">
          <div class="mj-accordion-body" role="region" [id]="BodyId" [attr.aria-labelledby]="HeaderId">
            <!-- Legacy: content placed directly in the panel (eager). -->
            <ng-content></ng-content>
            <!-- Preferred: [mjAccordionBody] template — instantiated lazily on first
                 expand, then kept alive so later toggles still animate. -->
            @if (bodyTemplate && (Expanded || hasBeenExpanded)) {
              <ng-container [ngTemplateOutlet]="bodyTemplate.templateRef"></ng-container>
            }
          </div>
        </div>
      </div>
    </div>
  `
})
export class MJAccordionPanelComponent {
  @Input() Title = '';
  private _expanded = false;
  /** Latches true the first time the panel is expanded; never resets. Lets a
   *  [mjAccordionBody] template instantiate lazily on first open and then stay
   *  alive so subsequent open/close still animates. */
  private _everExpanded = false;
  @Input()
  set Expanded(value: boolean) {
    this._expanded = value;
    if (value) this._everExpanded = true;
  }
  get Expanded(): boolean { return this._expanded; }
  get hasBeenExpanded(): boolean { return this._everExpanded; }
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
  /**
   * Density. `md` (default) is the standard size; `sm` tightens header padding and
   * font for dense contexts (sidebars, flyouts, nested panels).
   */
  @Input() Size: 'sm' | 'md' = 'md';
  /**
   * Bare chrome — drop the panel's own border and header background so the panel
   * sits cleanly inside a host that already provides chrome (e.g. an expandable
   * card). The toggle/title/chevron/body still work; only the box styling is removed.
   */
  @Input() Bare = false;
  /**
   * Remove the body's default padding, for bodies that manage their own spacing
   * (code editors, full-bleed grids, custom forms).
   */
  @Input() FlushBody = false;
  /**
   * Fill mode — for "rail section that owns the leftover height" cases (e.g. an
   * entity tree or grid that should consume all remaining vertical space and
   * scroll *internally*), rather than the default "reveal stacked content"
   * disclosure. When set AND expanded, the panel becomes a flex column that
   * fills its flex parent and its body becomes a `flex:1; min-height:0` region —
   * the projected content is expected to provide its own scroll child. While
   * collapsed, the panel behaves exactly like a normal panel (header only,
   * natural height) and does NOT claim the leftover space.
   *
   * Requires the panel's parent to be a flex column with `min-height:0`.
   * Note: the open/close height animation is skipped in fill mode (the body
   * fills rather than animating to content height).
   */
  @Input() Fill = false;
  @Output() ExpandedChange = new EventEmitter<boolean>();
  @ContentChild(MJAccordionTitleDirective) titleTemplate: MJAccordionTitleDirective | null = null;
  @ContentChild(MJAccordionActionsDirective) actionsTemplate: MJAccordionActionsDirective | null = null;
  @ContentChild(MJAccordionBodyDirective) bodyTemplate: MJAccordionBodyDirective | null = null;
  @HostBinding('class.mj-accordion-panel-host') readonly hostClass = true;
  /** Host claims flex:1 of its parent ONLY while a Fill panel is expanded —
   *  so a collapsed Fill panel sits at natural (header) height like any other. */
  @HostBinding('class.mj-accordion-fill-active') get fillActive(): boolean {
    return this.Fill && this.Expanded;
  }

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
