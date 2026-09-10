import {
  Component, Input, Output, EventEmitter,
  ChangeDetectionStrategy, ChangeDetectorRef, inject,
  OnChanges, SimpleChanges, OnInit, AfterContentInit, AfterViewInit, OnDestroy,
  ContentChildren, QueryList, HostBinding, HostListener, ElementRef,
  ViewChild, NgZone, ViewEncapsulation
} from '@angular/core';
import { Subject } from 'rxjs';
import { takeUntil } from 'rxjs/operators';
import { FormContext, PanelVariant, PanelDragStartEvent, PanelDropEvent } from '../types/form-types';
import { IsFormSectionHidden } from '../types/entity-form-config';
import { FormNavigationEvent } from '../types/navigation-events';
import { MjFormFieldComponent } from '../field/form-field.component';
import { CompositeKey } from '@memberjunction/core';
import { EscapeHTML, HighlightSearchMatches, type ValidationErrorInfo } from '@memberjunction/global';
import { FormChromeCoordinator } from '../chrome/form-chrome-coordinator.service';
import { FormSectionIndicatorCoordinator, type FormSectionIndicatorSource } from '../section-indicators/form-section-indicator-coordinator.service';
import {
  ClaimedCollectionErrors,
  DescribeSectionDirty,
  DescribeSectionErrors,
  DescribeSectionWarnings,
  SectionOwnsValidationSource,
  SumSectionIndicators,
  TallyValidationErrors,
  type FormSectionIndicators,
  type ParsedValidationSource,
  type SectionValidationScope,
} from '../section-indicators/form-section-indicators';

/**
 * Reusable collapsible panel for form sections.
 *
 * Supports three visual variants:
 * - **default**: White card with accent border (standard field sections)
 * - **related-entity**: Blue-accented card with row count badge (related entity grids)
 * - **inherited**: Purple-accented card with "Inherited from X" badge (IS-A parent field sections)
 *
 * Features:
 * - Expand/collapse with smooth animation
 * - Search filtering (hides non-matching panels, highlights matched names)
 * - Drag-to-reorder sections
 * - Inheritable "Inherited from X" badge with navigation event
 * - Row count badge for related entity sections
 * - Section indicators: an unsaved-changes dot and an invalid-field count derived
 *   live from the projected `mj-form-field`s (plus anything a custom section
 *   supplies through `[Indicators]`), published to the form's chrome rail
 *   through {@link FormSectionIndicatorCoordinator}
 *
 * @example
 * ```html
 * <mj-collapsible-panel
 *   SectionKey="productDetails"
 *   SectionName="Product Details"
 *   Icon="fa fa-box"
 *   Variant="inherited"
 *   InheritedFromEntity="Products"
 *   [Form]="formComponent"
 *   [FormContext]="formContext"
 *   (Navigate)="onNavigate($event)">
 *   <mj-form-field ...></mj-form-field>
 * </mj-collapsible-panel>
 * ```
 */
@Component({
  standalone: false,
  selector: 'mj-collapsible-panel',
  changeDetection: ChangeDetectionStrategy.OnPush,
  encapsulation: ViewEncapsulation.None, // Required to style projected content (grids, etc.)
  templateUrl: './collapsible-panel.component.html',
  styleUrls: ['./collapsible-panel.component.css']
})
export class MjCollapsiblePanelComponent implements OnInit, OnChanges, AfterContentInit, AfterViewInit, OnDestroy, FormSectionIndicatorSource {
  private cdr = inject(ChangeDetectorRef);
  private elementRef = inject(ElementRef);
  private ngZone = inject(NgZone);
  private chrome = inject(FormChromeCoordinator, { optional: true });
  private indicators = inject(FormSectionIndicatorCoordinator, { optional: true });

  /** Unique key for state persistence */
  @Input() SectionKey = '';

  /**
   * Indicator counts a custom section supplies for content that is NOT rendered by
   * `mj-form-field` — a designer, an inline grid, a hand-built editor. Added to the
   * counts this panel derives from its own fields, so a section that mixes both
   * reports the union. Omit for ordinary field panels: their state is derived.
   *
   * ```html
   * <mj-collapsible-panel SectionKey="lines" [Indicators]="{ DirtyCount: LineEditor.EditedRows, ErrorCount: LineEditor.InvalidRows }">
   * ```
   */
  @Input() Indicators?: Partial<FormSectionIndicators> | null;

  /**
   * Graph-path collection names whose validation failures belong to THIS panel —
   * `ValidationSources="Modifications"` claims `Modifications[2].ProvisionID`.
   *
   * Only needed when a panel hosts a child collection whose path name differs from
   * its `SectionKey`: plain field failures are joined automatically from the panel's
   * `mj-form-field` children, and a graph path whose leading segment already matches
   * the `SectionKey` is claimed without any declaration. Declared HERE, on the panel
   * that owns the collection, rather than in an app-side `fieldName -> sectionKey`
   * map that duplicates a fact the panel owns and drifts silently when a
   * `SectionKey` is renamed. Accepts a single name or a list.
   */
  @Input() ValidationSources?: string | readonly string[] | null;

  /** Display name shown in the panel header */
  @Input() SectionName = '';

  /** Font Awesome icon class for the panel header */
  @Input() Icon = 'fa fa-folder';

  /**
   * Reference to the parent form component for state delegation.
   * Expected to have IsSectionExpanded, SetSectionExpanded, getSectionDisplayOrder methods.
   */
  @Input() Form: unknown;

  /** Form-level context (search filter, showEmptyFields) */
  @Input() FormContext?: FormContext;

  /** Panel visual variant */
  @Input() Variant: PanelVariant = 'default';

  /** Row count badge for related entity sections */
  @Input() BadgeCount: number | undefined;

  /** Default expanded state when no persisted state exists */
  @Input() DefaultExpanded: boolean | undefined;

  /**
   * For 'inherited' variant: the parent entity name this section's fields come from.
   * Displayed as "Inherited from X" badge and used for navigation.
   */
  @Input() InheritedFromEntity = '';

  /**
   * For 'inherited' variant: the primary key to navigate to when clicking the badge.
   * (Shared PK in IS-A relationships.)
   */
  @Input() InheritedRecordPrimaryKey?: CompositeKey;

  /**
   * Container-driven hard hide. When true the panel is removed from view
   * regardless of search state — used by the record-form container to honor
   * `EntityFormConfig.showRelatedEntities` / `hiddenSectionKeys` /
   * `visibleSectionKeys`. Composes with (overrides) search visibility so all
   * existing `IsVisible`-based section counts stay correct.
   */
  @Input()
  set Hidden(value: boolean) {
    if (value !== this._hidden) {
      this._hidden = value;
      // Recompute visibility if content has initialized (FieldComponents present).
      if (this.FieldComponents) {
        this.UpdateVisibilityAndHighlighting();
      }
    }
  }
  get Hidden(): boolean {
    return this._hidden;
  }
  private _hidden = false;

  // ---- Deprecated camelCase aliases (backward compat) ----

  /** @deprecated Use [SectionKey] instead */
  @Input('sectionKey') set _deprecatedSectionKey(value: string) { this.SectionKey = value; }

  /** @deprecated Use [SectionName] instead */
  @Input('sectionName') set _deprecatedSectionName(value: string) { this.SectionName = value; }

  /** @deprecated Use [Icon] instead */
  @Input('icon') set _deprecatedIcon(value: string) { this.Icon = value; }

  /** @deprecated Use [Form] instead */
  @Input('form') set _deprecatedForm(value: unknown) { this.Form = value; }

  /** @deprecated Use [FormContext] instead */
  @Input('formContext') set _deprecatedFormContext(value: FormContext | undefined) { this.FormContext = value; }

  // ---- Outputs ----

  @Output() DragStarted = new EventEmitter<PanelDragStartEvent>();
  @Output() DragEnded = new EventEmitter<void>();
  @Output() PanelDrop = new EventEmitter<PanelDropEvent>();
  @Output() Navigate = new EventEmitter<FormNavigationEvent>();

  // ---- Content Children ----

  @ContentChildren(MjFormFieldComponent, { descendants: true }) FieldComponents!: QueryList<MjFormFieldComponent>;

  // ---- State ----

  DisplayName = '';
  FieldNames = '';
  IsVisible = true;

  @HostBinding('attr.data-section-key')
  get HostSectionKey(): string {
    return this.SectionKey;
  }

  @HostBinding('attr.data-variant')
  get HostVariant(): string {
    return this.Variant;
  }

  @HostBinding('attr.data-icon')
  get HostIcon(): string {
    return this.Icon;
  }

  /**
   * Indicator counts mirrored onto the host element, so CSS and any DOM sweep can
   * read a section's state without a component reference.
   */
  @HostBinding('attr.data-dirty-count')
  get HostDirtyCount(): number {
    return this.SectionIndicators.DirtyCount;
  }

  @HostBinding('attr.data-error-count')
  get HostErrorCount(): number {
    return this.SectionIndicators.ErrorCount;
  }

  @HostBinding('class')
  get HostClass(): string {
    const classes = [`mj-panel--${this.Variant}`];
    if (!this.IsVisible) classes.push('mj-search-hidden');
    if (this.IsDragging) classes.push('mj-dragging');
    if (this.IsDragOver) classes.push('mj-drag-over');
    const indicators = this.SectionIndicators;
    if (indicators.DirtyCount > 0) classes.push('mj-panel-dirty');
    if (indicators.ErrorCount > 0) classes.push('mj-panel-has-errors');
    else if (indicators.WarningCount > 0) classes.push('mj-panel-has-warnings');
    if (this.chrome?.Spec.RelatedRoles.get(this.SectionKey) === 'Detail') {
      classes.push('mj-form-role-detail');
    }
    if (this.chrome?.HidesAccordionChrome(this.SectionKey)) {
      classes.push('mj-chrome-plain');
    }
    if (!this.hasRenderableContent()) {
      classes.push('mj-panel-empty');
    }
    return classes.join(' ');
  }

  @HostBinding('style.order')
  get CssOrder(): number {
    const formRef = this.Form as { getSectionDisplayOrder?: (key: string) => number };
    return formRef?.getSectionDisplayOrder ? formRef.getSectionDisplayOrder(this.SectionKey) : 0;
  }

  IsDragging = false;
  IsDragOver = false;

  // ---- Event relay ----

  /** Signals re-subscription when ContentChildren change */
  private fieldNavReset$ = new Subject<void>();
  private destroy$ = new Subject<void>();

  // ---- Panel content resize ----

  @ViewChild('panelContent') private panelContentRef?: ElementRef<HTMLElement>;
  private resizeObserver?: ResizeObserver;
  private resizeDebounceTimer?: ReturnType<typeof setTimeout>;
  /** ResizeObserver fires once synchronously on observe(); that initial measurement is not a user resize. */
  private resizeObserverPrimed = false;

  /**
   * Persisted accordion resize height for related-entity panels.
   * Related grids size themselves from row count (accordion and left-nav),
   * so a pinned pixel height — especially 0 / toolbar-only measured while
   * collapsed — would clip the grid. Only honor a user drag that is at
   * least the CSS min-height.
   */
  get PanelContentHeight(): number | undefined {
    if (this.Variant !== 'related-entity') return undefined;
    if (this.hidesAccordionChrome()) return undefined;
    const formRef = this.Form as { GetSectionPanelHeight?: (key: string) => number | undefined };
    const persisted = formRef?.GetSectionPanelHeight?.(this.SectionKey);
    if (persisted == null || persisted < 120) return undefined;
    return persisted;
  }

  private hidesAccordionChrome(): boolean {
    if (this.chrome?.HidesAccordionChrome(this.SectionKey)) return true;
    const el = this.elementRef.nativeElement as HTMLElement | undefined;
    return !!el?.classList.contains('mj-chrome-show');
  }

  /** Whether drag-to-reorder is allowed (from FormContext) */
  get ReorderAllowed(): boolean {
    return this.FormContext?.allowSectionReorder !== false;
  }

  /**
   * Whether this panel's header may collapse/expand. Driven by
   * `FormContext.collapsibleSections`; when false the panel renders
   * always-expanded with no toggle chevron (used by dialog/slide-in surfaces
   * that lock sections open). Undefined / true means collapsible.
   */
  get Collapsible(): boolean {
    // Selected left-nav item has no accordion chrome. More keeps collapse/expand.
    if (this.hidesAccordionChrome()) return false;
    return this.FormContext?.collapsibleSections !== false;
  }

  /** Whether the panel is expanded (delegates to form state; always true when not collapsible) */
  get Expanded(): boolean {
    if (!this.Collapsible) return true;
    const formRef = this.Form as { IsSectionExpanded?: (key: string, defaultExpanded?: boolean) => boolean };
    return formRef?.IsSectionExpanded ? formRef.IsSectionExpanded(this.SectionKey, this.DefaultExpanded) : true;
  }

  // ---- Section indicators (unsaved-changes dot + invalid-field count) ----

  /**
   * Live state of this section: fields edited since the last save, fields that are
   * invalid or required-and-empty, and fields carrying warnings. Derived from the
   * projected `mj-form-field`s on every read — the same state those fields use for
   * their own amber dot and red underline, so the section can never disagree with
   * its fields — plus graph-path validation failures this section claims, plus
   * whatever a custom section supplies through `[Indicators]`.
   *
   * Read during change detection (host bindings, the header template, the rail via
   * the coordinator). Pure and cheap: one pass over the field list.
   */
  public get SectionIndicators(): FormSectionIndicators {
    return SumSectionIndicators(
      this.fieldIndicators(),
      TallyValidationErrors(this.claimedGraphErrors()),
      this.Indicators,
    );
  }

  public get SectionDirtyCount(): number {
    return this.SectionIndicators.DirtyCount;
  }

  public get SectionErrorCount(): number {
    return this.SectionIndicators.ErrorCount;
  }

  public get SectionWarningCount(): number {
    return this.SectionIndicators.WarningCount;
  }

  public get SectionDirtyTitle(): string {
    return DescribeSectionDirty(this.SectionDirtyCount);
  }

  public get SectionErrorTitle(): string {
    return DescribeSectionErrors(this.SectionErrorCount);
  }

  public get SectionWarningTitle(): string {
    return DescribeSectionWarnings(this.SectionWarningCount);
  }

  /** {@link FormSectionIndicatorSource} — the rail reads this through the coordinator. */
  public GetSectionIndicators(): FormSectionIndicators {
    return this.SectionIndicators;
  }

  /** {@link FormSectionIndicatorSource} — whether a form-level error belongs to this section. */
  public OwnsValidationSource(source: ParsedValidationSource): boolean {
    return SectionOwnsValidationSource(source, this.SectionKey, this.validationScope());
  }

  /** Normalized {@link ValidationSources}. */
  public get ValidationCollectionNames(): string[] {
    const raw = this.ValidationSources;
    if (!raw) return [];
    return (typeof raw === 'string' ? [raw] : [...raw]).map((n) => n.trim()).filter((n) => n.length > 0);
  }

  /** Field names this panel renders — the join between a plain-field error and this section. */
  private renderedFieldNames(): string[] {
    const names: string[] = [];
    this.FieldComponents?.forEach((field) => {
      if (field.FieldName) names.push(field.FieldName);
    });
    return names;
  }

  private validationScope(): SectionValidationScope {
    return { FieldNames: this.renderedFieldNames(), CollectionNames: this.ValidationCollectionNames };
  }

  /**
   * Counts of FIELDS (not messages) in each state. A field is invalid when it shows a
   * failure OR is required and empty in edit mode — exactly the two conditions that
   * paint its underline red. Warnings count only on fields with no failure, mirroring
   * `MjFormFieldComponent.ShowWarnings`.
   */
  private fieldIndicators(): FormSectionIndicators {
    let DirtyCount = 0;
    let ErrorCount = 0;
    let WarningCount = 0;
    this.FieldComponents?.forEach((field) => {
      if (field.IsDirty) DirtyCount++;
      // Only a field that renders an EDITOR can be invalid: a read-only field renders its
      // value as text and never paints an underline, so it is skipped even when
      // `IsRequiredEmpty` would say otherwise (a NOT NULL `__mj_CreatedAt` on a new record
      // is empty and read-only — the user cannot fix it, and it fills itself on save).
      if (!field.EditMode || field.IsFieldReadOnly) return;
      if (field.ShowErrors || field.IsRequiredEmpty) ErrorCount++;
      else if (field.ShowWarnings) WarningCount++;
    });
    return { DirtyCount, ErrorCount, WarningCount };
  }

  /**
   * Graph-path failures (`Lines[2].Amount`) this section owns, once the form has asked
   * for validation to show. Plain field-name failures are NOT counted here — the field
   * that renders them already reports through {@link fieldIndicators}.
   */
  private claimedGraphErrors(): ValidationErrorInfo[] {
    const ctx = this.FormContext;
    if (!ctx?.showValidation || !ctx.validationErrors?.length) return [];
    return ClaimedCollectionErrors(ctx.validationErrors, this.SectionKey, this.validationScope());
  }

  /** (Re)declare this section with the container-scoped registry the rail reads. */
  private registerIndicatorSource(previousKey?: string): void {
    if (!this.indicators) return;
    if (previousKey && previousKey !== this.SectionKey) {
      this.indicators.Unregister(this, previousKey);
    }
    this.indicators.Register(this);
  }

  // ---- Lifecycle ----

  ngOnInit(): void {
    this.DisplayName = this.SectionName;
    this.chrome?.Changes.pipe(takeUntil(this.destroy$)).subscribe(() => {
      this.UpdateVisibilityAndHighlighting();
    });
    this.registerIndicatorSource();
  }

  ngAfterContentInit(): void {
    this.UpdateFieldNames();
    this.SubscribeToFieldNavigateEvents();
    this.FieldComponents.changes.subscribe(() => {
      this.UpdateFieldNames();
      this.SubscribeToFieldNavigateEvents();
      // The set of fields changed, so the section's counts (and which errors it
      // claims) may have too — let the rail re-read.
      this.indicators?.NotifyChanged();
    });
  }

  ngOnChanges(changes: SimpleChanges): void {
    if (changes['SectionName']) {
      this.DisplayName = this.SectionName;
    }
    if (changes['SectionKey'] && !changes['SectionKey'].firstChange) {
      this.registerIndicatorSource(changes['SectionKey'].previousValue as string | undefined);
    }
    if (changes['SectionName'] || changes['FormContext']) {
      this.UpdateVisibilityAndHighlighting();
    }
    if (changes['FormContext'] && this.FieldComponents) {
      this.FieldComponents.forEach(field => {
        field.FormContext = this.FormContext;
      });
    }
  }

  ngAfterViewInit(): void {
    this.SetupResizeObserver();
  }

  ngOnDestroy(): void {
    this.indicators?.Unregister(this);
    this.fieldNavReset$.next();
    this.fieldNavReset$.complete();
    this.destroy$.next();
    this.destroy$.complete();
    this.resizeObserver?.disconnect();
    if (this.resizeDebounceTimer) {
      clearTimeout(this.resizeDebounceTimer);
    }
  }

  // ---- Actions ----

  Toggle(): void {
    if (!this.Collapsible) return;
    const formRef = this.Form as { SetSectionExpanded?: (key: string, expanded: boolean) => void };
    if (formRef?.SetSectionExpanded) {
      formRef.SetSectionExpanded(this.SectionKey, !this.Expanded);
      this.cdr.markForCheck();
    }
  }

  /**
   * Navigate to the parent entity when clicking the "Inherited from X" badge.
   * Derives the PrimaryKey from the Form's record when InheritedRecordPrimaryKey
   * is not explicitly provided (which is the common case in generated templates).
   */
  OnInheritedBadgeClick(event: MouseEvent): void {
    event.stopPropagation();
    if (!this.InheritedFromEntity) return;

    const primaryKey = this.InheritedRecordPrimaryKey
      ?? (this.Form as { record?: { PrimaryKey: CompositeKey } })?.record?.PrimaryKey
      ?? new CompositeKey([]);

    this.Navigate.emit({
      Kind: 'entity-hierarchy',
      EntityName: this.InheritedFromEntity,
      PrimaryKey: primaryKey,
      Direction: 'parent'
    });
  }

  // ---- Drag and Drop ----

  @HostListener('dragover', ['$event'])
  OnDragOver(event: DragEvent): void {
    if (!this.ReorderAllowed) return;
    event.preventDefault();
    event.stopPropagation();
    if (event.dataTransfer?.types.includes('text/plain')) {
      this.IsDragOver = true;
    }
  }

  @HostListener('dragleave', ['$event'])
  OnDragLeave(event: DragEvent): void {
    if (!this.ReorderAllowed) return;
    event.preventDefault();
    this.IsDragOver = false;
  }

  @HostListener('drop', ['$event'])
  OnDrop(event: DragEvent): void {
    if (!this.ReorderAllowed) return;
    event.preventDefault();
    event.stopPropagation();
    this.IsDragOver = false;

    const sourceSectionKey = event.dataTransfer?.getData('text/plain');
    if (sourceSectionKey && sourceSectionKey !== this.SectionKey) {
      this.PanelDrop.emit({
        SourceSectionKey: sourceSectionKey,
        TargetSectionKey: this.SectionKey
      });
      this.ReorderSections(sourceSectionKey, this.SectionKey);
    }
  }

  OnDragStart(event: DragEvent): void {
    if (!this.ReorderAllowed) return;
    this.IsDragging = true;
    event.dataTransfer?.setData('text/plain', this.SectionKey);
    if (event.dataTransfer) {
      event.dataTransfer.effectAllowed = 'move';
    }
    this.DragStarted.emit({ SectionKey: this.SectionKey, Event: event });
  }

  OnDragEnd(): void {
    this.IsDragging = false;
    this.DragEnded.emit();
  }

  // ---- Private Methods ----

  private ReorderSections(sourceSectionKey: string, targetSectionKey: string): void {
    const formRef = this.Form as {
      getSectionOrder?: () => string[];
      setSectionOrder?: (order: string[]) => void;
    };
    if (!formRef?.getSectionOrder || !formRef?.setSectionOrder) return;

    const currentOrder = formRef.getSectionOrder();
    const sourceIndex = currentOrder.indexOf(sourceSectionKey);
    const targetIndex = currentOrder.indexOf(targetSectionKey);
    if (sourceIndex === -1 || targetIndex === -1) return;

    const newOrder = [...currentOrder];
    newOrder.splice(sourceIndex, 1);
    newOrder.splice(targetIndex, 0, sourceSectionKey);
    formRef.setSectionOrder(newOrder);
    this.cdr.markForCheck();
  }

  /**
   * Field panels whose only children are empty/hidden (e.g. leftover
   * `Details` with just unused geo columns) should not take space.
   * Custom widgets and related grids have no FieldComponents — keep them.
   */
  /**
   * Whether this panel matches a section-search term by title or field
   * name. Ignores chrome hide/show — the rail uses this to decide if the
   * *group* matches, even when another section is currently selected.
   */
  public MatchesSearch(term: string): boolean {
    const filter = (term || '').toLowerCase().trim();
    if (!filter) return true;
    if (this.SectionName.toLowerCase().includes(filter)) return true;
    if (this.SectionKey.toLowerCase().includes(filter)) return true;
    return this.FieldNames.includes(filter);
  }

  private hasRenderableContent(): boolean {
    if (this.Variant === 'related-entity') return true;
    if (!this.FieldComponents || this.FieldComponents.length === 0) return true;
    return this.FieldComponents.some((field) => !field.ShouldHideField);
  }

  private isHiddenByChrome(): boolean {
    if (!this.chrome) return false;
    if (this.Variant === 'related-entity') {
      return !this.chrome.IsRelatedSectionVisible(this.SectionKey);
    }
    return !this.chrome.IsFirstClassSectionVisible(this.SectionKey);
  }

  private UpdateFieldNames(): void {
    if (this.FieldComponents) {
      const names: string[] = [];
      this.FieldComponents.forEach(field => {
        if (field.DisplayName) {
          names.push(field.DisplayName.toLowerCase());
        }
      });
      this.FieldNames = names.join(' ');
      this.UpdateVisibilityAndHighlighting();
    }
  }

  /**
   * Subscribes to Navigate events from all child form-field components
   * and relays them through this panel's Navigate output. Also listens for
   * value edits so the section indicators (and the rail reading them) refresh
   * on the same tick as the keystroke rather than on the container's next poll.
   */
  private SubscribeToFieldNavigateEvents(): void {
    this.fieldNavReset$.next(); // tear down previous subscriptions
    this.FieldComponents.forEach(field => {
      field.Navigate.pipe(takeUntil(this.fieldNavReset$)).subscribe((event: FormNavigationEvent) => {
        this.Navigate.emit(event);
      });
      field.ValueChange.pipe(takeUntil(this.fieldNavReset$)).subscribe(() => {
        this.cdr.markForCheck();
        this.indicators?.NotifyChanged();
      });
    });
  }

  /**
   * Sets up a ResizeObserver on the panel content div for related-entity panels.
   * When the user drags the CSS resize handle, we persist the new height.
   */
  private SetupResizeObserver(): void {
    if (this.Variant !== 'related-entity' || !this.panelContentRef) return;

    const el = this.panelContentRef.nativeElement;
    // Run outside Angular zone to avoid triggering change detection on every resize frame
    this.ngZone.runOutsideAngular(() => {
      this.resizeObserver = new ResizeObserver((entries) => {
        // Skip the synchronous initial fire emitted when observe() is called — it's the
        // panel's own first measurement on load, not a user-initiated resize. Persisting
        // it would write a spurious panelHeight for every panel on form open.
        if (!this.resizeObserverPrimed) {
          this.resizeObserverPrimed = true;
          return;
        }
        // Only a height change while the panel is expanded reflects a genuine user drag of
        // the resize handle. Ignore reflows while collapsed (e.g. content settling on load).
        if (!this.Expanded) return;
        // Left-nav sizes the grid from the leftover column. Persisting that
        // computed height would write ~0 (or the toolbar) and then pin it.
        if (this.hidesAccordionChrome()) return;
        const entry = entries[0];
        if (!entry) return;
        const newHeight = Math.round(entry.contentRect.height);
        if (newHeight < 120) return;
        this.DebouncePersistHeight(newHeight);
      });
      this.resizeObserver.observe(el);
    });
  }

  /**
   * Debounces height persistence so we don't write to DB on every resize frame.
   */
  private DebouncePersistHeight(height: number): void {
    if (this.resizeDebounceTimer) {
      clearTimeout(this.resizeDebounceTimer);
    }
    this.resizeDebounceTimer = setTimeout(() => {
      const formRef = this.Form as { SetSectionPanelHeight?: (key: string, height: number) => void };
      formRef?.SetSectionPanelHeight?.(this.SectionKey, height);
    }, 500);
  }

  private UpdateVisibilityAndHighlighting(): void {
    // Hard hide takes precedence over search state. Driven by an explicit
    // `Hidden` input OR the form config's section-visibility rules carried on
    // FormContext (which also reach slot-injected BaseFormPanels, since every
    // panel receives FormContext).
    if (this._hidden || IsFormSectionHidden(this.FormContext, this.SectionKey, this.Variant) || this.isHiddenByChrome()) {
      this.IsVisible = false;
      this.DisplayName = EscapeHTML(this.SectionName);
      this.cdr.markForCheck();
      return;
    }

    const searchTerm = (this.FormContext?.sectionFilter || '').toLowerCase().trim();

    if (!searchTerm) {
      this.IsVisible = this.hasRenderableContent();
      this.DisplayName = this.SectionName;
      this.cdr.markForCheck();
      return;
    }

    const sectionMatches = this.SectionName.toLowerCase().includes(searchTerm);
    const fieldsMatch = this.FieldNames.includes(searchTerm);
    this.IsVisible = this.MatchesSearch(searchTerm);

    // DisplayName is bound to `[innerHTML]` in the template — must always be HTML-safe.
    this.DisplayName =
      this.IsVisible && sectionMatches
        ? HighlightSearchMatches(this.SectionName, searchTerm, 'mj-forms-search-highlight')
        : EscapeHTML(this.SectionName);

    this.cdr.markForCheck();
  }
}
