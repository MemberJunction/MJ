import { Component, Input, Output, EventEmitter, HostBinding, ContentChild, TemplateRef, Directive, NgModule, ChangeDetectorRef, ElementRef, OnInit, OnDestroy, inject } from '@angular/core';
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
  constructor(public templateRef: TemplateRef<unknown>) {}  // case-violation-ok-legacy-back-compat: object literals are assigned to this class, so an accessor stub changes what they must supply
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
  constructor(public templateRef: TemplateRef<unknown>) {}  // case-violation-ok-legacy-back-compat: object literals are assigned to this class, so an accessor stub changes what they must supply
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
  constructor(public templateRef: TemplateRef<unknown>) {}  // case-violation-ok-legacy-back-compat: object literals are assigned to this class, so an accessor stub changes what they must supply
}

/**
 * mj-accordion-panel — Collapsible panel.
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
    <div class="mj-accordion-panel" [class.mj-accordion-panel--expanded]="Expanded || IsOpenFlat" [class.mj-accordion-panel--disabled]="Disabled"
      [class.mj-accordion-panel--flat-section]="FlatMode === 'section'"
      [class.mj-accordion-panel--flat-block]="FlatMode === 'block'"
      [class.mj-accordion-panel--muted-icon]="TitleIconMuted"
      [class.mj-accordion-panel--sm]="Size === 'sm'"
      [class.mj-accordion-panel--bare]="Bare"
      [class.mj-accordion-panel--flush-body]="FlushBody"
      [class.mj-accordion-panel--fill]="Fill"
      [attr.data-variant]="Variant !== 'default' ? Variant : null">
      <div class="mj-accordion-header-row">
        @if (FlatMode === 'block') {
          <!-- Flat block: the title is a plain heading over always-open content, no toggle. -->
          <div class="mj-accordion-flat-heading" role="heading" [attr.aria-level]="HeadingLevel ?? 3" [id]="HeaderId">
            <span class="mj-accordion-title"><ng-container [ngTemplateOutlet]="titleContent"></ng-container></span>
          </div>
        } @else if (FlatMode === 'section') {
          <!-- Flat section: the section picker names it on screen; keep the name for the region. -->
          <span class="mj-accordion-section-label" [id]="HeaderId"><ng-container [ngTemplateOutlet]="titleContent"></ng-container></span>
        } @else if (HeadingLevel) {
          <!-- With HeadingLevel set, a heading wraps the toggle; without it, the toggle is a direct child of the row. -->
          <div class="mj-accordion-heading" role="heading" [attr.aria-level]="HeadingLevel">
            <ng-container [ngTemplateOutlet]="toggleButton"></ng-container>
          </div>
        } @else {
          <ng-container [ngTemplateOutlet]="toggleButton"></ng-container>
        }
        @if (actionsTemplate) {
          <div class="mj-accordion-actions">
            <ng-container [ngTemplateOutlet]="actionsTemplate.templateRef"></ng-container>
          </div>
        }
        <!-- The chevron is ALWAYS the rightmost element of the header row (after any
             actions). It's a secondary, a11y-hidden toggle affordance — the primary
             disclosure control is the title button above (which owns aria-expanded). -->
        @if (FlatMode === null) {
          <button class="mj-accordion-chevron" type="button" tabindex="-1" aria-hidden="true"
            [disabled]="Disabled" (click)="Toggle()">
            <i class="fa-solid fa-chevron-down mj-accordion-icon"></i>
          </button>
        }
      </div>
      <div class="mj-accordion-body-outer" [attr.inert]="Expanded || IsOpenFlat ? null : ''">
        <div class="mj-accordion-body-clip">
          <div class="mj-accordion-body" role="region" [id]="BodyId" [attr.aria-labelledby]="HeaderId">
            <!-- Legacy: content placed directly in the panel (eager). -->
            <ng-content></ng-content>
            <!-- Preferred: [mjAccordionBody] template — instantiated lazily on first
                 expand, then kept alive so later toggles still animate. -->
            @if (bodyTemplate && (Expanded || hasBeenExpanded || IsOpenFlat)) {
              <ng-container [ngTemplateOutlet]="bodyTemplate.templateRef"></ng-container>
            }
          </div>
        </div>
      </div>
    </div>
    <!-- The toggle button: the disclosure control that owns aria-expanded -->
    <ng-template #toggleButton>
      <button class="mj-accordion-header" type="button"
        [id]="HeaderId"
        [attr.aria-expanded]="Expanded"
        [attr.aria-controls]="BodyId"
        [disabled]="Disabled"
        (click)="Toggle()">
        <span class="mj-accordion-title"><ng-container [ngTemplateOutlet]="titleContent"></ng-container></span>
      </button>
    </ng-template>
    <ng-template #titleContent>
      @if (TitleTemplate) {
        <ng-container [ngTemplateOutlet]="TitleTemplate.templateRef"></ng-container>
      } @else {
        {{ Title }}
      }
    </ng-template>
  `
})
export class MJAccordionPanelComponent implements OnInit, OnDestroy {
  private readonly cdr = inject(ChangeDetectorRef);
  private readonly el = inject<ElementRef<HTMLElement>>(ElementRef);
  /** The panel this one is nested in, if any; a panel inside a flat panel renders flat too. */
  private readonly parentPanel = inject(MJAccordionPanelComponent, { optional: true, skipSelf: true });
  private readonly childPanels = new Set<MJAccordionPanelComponent>();

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
  protected get hasBeenExpanded(): boolean { return this._everExpanded; }
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
   * Bare chrome — drop the panel's border, header background, body fill and
   * row-wide hover fill, so the panel sits cleanly inside a host that already
   * provides chrome (e.g. an expandable card) or directly on a page as a section.
   * The toggle keeps its focus ring and, on a device that can hover, a hover cue:
   * pointing at the title or the chevron gives both the brand color. A `Variant`
   * keeps its own colors.
   */
  @Input() Bare = false;
  /**
   * Heading level (1–6) for the title. When set, a `role="heading"` element with this
   * `aria-level` wraps the toggle button, so the section title takes part in the page's
   * heading outline. When null, there is no wrapper and the toggle is a direct child of
   * the header row.
   */
  @Input() HeadingLevel: 1 | 2 | 3 | 4 | 5 | 6 | null = null;
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
  /**
   * Flat — render as a plain headed block: the title is a heading, the body is always open,
   * and there is no toggle, border or body padding. Panels nested inside a flat panel, or
   * inside the active section of an `mj-accordion-sections`, render this way automatically.
   */
  @Input() Flat = false;
  /** Stable key for this panel in an `mj-accordion-sections`; falls back to its position. */
  @Input() SectionKey: string | null = null;
  /** The name the section picker shows; falls back to `Title`, then the rendered title text. */
  @Input() SectionTitle: string | null = null;
  /** Font Awesome class string for the section picker row. */
  @Input() SectionIcon: string | null = null;
  /** Count shown on the section picker row. */
  @Input() SectionCount: number | null = null;
  @Output() ExpandedChange = new EventEmitter<boolean>();
  @ContentChild(MJAccordionTitleDirective) TitleTemplate: MJAccordionTitleDirective | null = null;

  /** @deprecated Use {@link TitleTemplate}. */
  get titleTemplate(): MJAccordionTitleDirective | null {
    return this.TitleTemplate;
  }
  /** @deprecated Use {@link TitleTemplate}. */
  set titleTemplate(value: MJAccordionTitleDirective | null) {
    this.TitleTemplate = value;
  }
  @ContentChild(MJAccordionActionsDirective) ActionsTemplate: MJAccordionActionsDirective | null = null;

  /** @deprecated Use {@link ActionsTemplate}. */
  get actionsTemplate(): MJAccordionActionsDirective | null {
    return this.ActionsTemplate;
  }
  /** @deprecated Use {@link ActionsTemplate}. */
  set actionsTemplate(value: MJAccordionActionsDirective | null) {
    this.ActionsTemplate = value;
  }
  @ContentChild(MJAccordionBodyDirective) BodyTemplate: MJAccordionBodyDirective | null = null;

  /** @deprecated Use {@link BodyTemplate}. */
  get bodyTemplate(): MJAccordionBodyDirective | null {
    return this.BodyTemplate;
  }
  /** @deprecated Use {@link BodyTemplate}. */
  set bodyTemplate(value: MJAccordionBodyDirective | null) {
    this.BodyTemplate = value;
  }
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

  // ---------------------------------------------------------------- flat / sections

  private sectionMode = false;
  private sectionHidden = false;
  private parentFlat = false;
  private parentShown = true;

  /** `section`: the active top level of an mj-accordion-sections; `block`: a flat nested panel. */
  get FlatMode(): 'section' | 'block' | null {
    if (this.sectionMode) return 'section';
    if (this.Flat || this.parentFlat) return 'block';
    return null;
  }

  /** Hidden because another section of an `mj-accordion-sections` is active. */
  @HostBinding('class.mj-accordion-section-hidden') get IsSectionHidden(): boolean {
    return this.sectionMode && this.sectionHidden;
  }

  /** On screen in a flat presentation: an active section, or a block whose parent is on screen. */
  get IsShownFlat(): boolean {
    if (this.sectionMode) return !this.sectionHidden;
    return this.parentFlat ? this.parentShown : true;
  }

  /**
   * Open because it is flat and on screen. A hidden section (or a block inside one) is not, so its
   * lazy body is not built until that section is picked; once picked it stays built (it was
   * expanded then), so switching away and back keeps its state.
   */
  get IsOpenFlat(): boolean {
    return this.FlatMode !== null && this.IsShownFlat;
  }

  /** The name the section picker shows for this panel. */
  ResolvedSectionTitle(): string {
    if (this.SectionTitle) return this.SectionTitle;
    if (this.Title) return this.Title;
    const t = this.el.nativeElement.querySelector(':scope > .mj-accordion-panel > .mj-accordion-header-row .mj-accordion-title, :scope > .mj-accordion-panel > .mj-accordion-header-row .mj-accordion-section-label');
    return (t?.textContent ?? '').replace(/\s+/g, ' ').trim();
  }

  /**
   * Called by `mj-accordion-sections`. Enabled, this panel becomes a section: shown and flat
   * when active, hidden otherwise. Opening it emits ExpandedChange(true) once, like a click,
   * so a body that loads on first expand still loads.
   */
  SetSectionState(enabled: boolean, active: boolean): void {
    this.sectionMode = enabled;
    this.sectionHidden = enabled && !active;
    this.syncFlatState();
  }

  ngOnInit(): void {
    if (!this.parentPanel) return;
    this.parentPanel.childPanels.add(this);
    this.setParentFlat(this.parentPanel.FlatMode !== null, this.parentPanel.IsShownFlat);
  }

  ngOnDestroy(): void {
    this.parentPanel?.childPanels.delete(this);
  }

  private setParentFlat(flat: boolean, shown: boolean): void {
    this.parentFlat = flat;
    this.parentShown = shown;
    this.syncFlatState();
  }

  private syncFlatState(): void {
    if (this.FlatMode !== null && this.IsShownFlat) this.openForFlat();
    const flat = this.FlatMode !== null;
    const shown = this.IsShownFlat;
    for (const child of this.childPanels) child.setParentFlat(flat, shown);
    this.cdr.markForCheck();
  }

  /** Opens the panel for a flat presentation and reports it the way a click would. */
  private openForFlat(): void {
    if (this._expanded) return;
    this.Expanded = true;
    // After the current change-detection pass, so a listener that updates bound state does not
    // change it mid-check.
    queueMicrotask(() => this.ExpandedChange.emit(true));
  }
}

/**
 * Convenience module bundling the accordion panel + all of its slot directives.
 * Import this ONE symbol instead of listing the component and each directive
 * separately:
 *
 * ```ts
 * import { MJAccordionModule } from '@memberjunction/ng-ui-components';
 * @NgModule({ imports: [MJAccordionModule, ...] })   // or @Component standalone imports
 * ```
 *
 * Why a module (not a bare `const [...]` array): Angular's AOT compiler can't
 * statically expand a value-array imported across a compiled-package boundary in
 * an `imports` array (NG1010), and `as const` makes it a readonly tuple the
 * `imports` type rejects (TS2322). An NgModule is always a valid `imports` entry
 * in both NgModule and standalone consumers. Adding a future accordion directive
 * here makes it available to every consumer automatically — no per-module churn.
 */
@NgModule({
  imports: [
    MJAccordionPanelComponent,
    MJAccordionTitleDirective,
    MJAccordionActionsDirective,
    MJAccordionBodyDirective,
  ],
  exports: [
    MJAccordionPanelComponent,
    MJAccordionTitleDirective,
    MJAccordionActionsDirective,
    MJAccordionBodyDirective,
  ],
})
export class MJAccordionModule {}
