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
import { FormNavigationEvent } from '../types/navigation-events';
import { MjFormFieldComponent } from '../field/form-field.component';
import { CompositeKey } from '@memberjunction/core';

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
export class MjCollapsiblePanelComponent implements OnInit, OnChanges, AfterContentInit, AfterViewInit, OnDestroy {
  private cdr = inject(ChangeDetectorRef);
  private elementRef = inject(ElementRef);
  private ngZone = inject(NgZone);

  /** Unique key for state persistence */
  @Input() SectionKey = '';

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

  @HostBinding('class.mj-search-hidden')
  get IsHidden(): boolean {
    return !this.IsVisible;
  }

  @HostBinding('style.order')
  get CssOrder(): number {
    const formRef = this.Form as { getSectionDisplayOrder?: (key: string) => number };
    return formRef?.getSectionDisplayOrder ? formRef.getSectionDisplayOrder(this.SectionKey) : 0;
  }

  @HostBinding('class.mj-dragging')
  IsDragging = false;

  @HostBinding('class.mj-drag-over')
  IsDragOver = false;

  // ---- Event relay ----

  /** Signals re-subscription when ContentChildren change */
  private fieldNavReset$ = new Subject<void>();

  // ---- Panel content resize ----

  @ViewChild('panelContent') private panelContentRef?: ElementRef<HTMLElement>;
  private resizeObserver?: ResizeObserver;
  private resizeDebounceTimer?: ReturnType<typeof setTimeout>;

  /**
   * Persisted panel height for related-entity panels.
   * Returns undefined to let CSS default (400px) apply.
   */
  get PanelContentHeight(): number | undefined {
    if (this.Variant !== 'related-entity') return undefined;
    const formRef = this.Form as { GetSectionPanelHeight?: (key: string) => number | undefined };
    return formRef?.GetSectionPanelHeight?.(this.SectionKey);
  }

  /** Whether the panel is expanded (delegates to form state) */
  get Expanded(): boolean {
    const formRef = this.Form as { IsSectionExpanded?: (key: string, defaultExpanded?: boolean) => boolean };
    return formRef?.IsSectionExpanded ? formRef.IsSectionExpanded(this.SectionKey, this.DefaultExpanded) : true;
  }

  // ---- Lifecycle ----

  ngOnInit(): void {
    this.DisplayName = this.SectionName;
  }

  ngAfterContentInit(): void {
    this.UpdateFieldNames();
    this.SubscribeToFieldNavigateEvents();
    this.FieldComponents.changes.subscribe(() => {
      this.UpdateFieldNames();
      this.SubscribeToFieldNavigateEvents();
    });
  }

  ngOnChanges(changes: SimpleChanges): void {
    if (changes['SectionName']) {
      this.DisplayName = this.SectionName;
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
    this.fieldNavReset$.next();
    this.fieldNavReset$.complete();
    this.resizeObserver?.disconnect();
    if (this.resizeDebounceTimer) {
      clearTimeout(this.resizeDebounceTimer);
    }
  }

  // ---- Actions ----

  Toggle(): void {
    const formRef = this.Form as { SetSectionExpanded?: (key: string, expanded: boolean) => void };
    if (formRef?.SetSectionExpanded) {
      formRef.SetSectionExpanded(this.SectionKey, !this.Expanded);
      this.cdr.markForCheck();
    }
  }

  /**
   * Navigate to the parent entity when clicking the "Inherited from X" badge.
   */
  OnInheritedBadgeClick(event: MouseEvent): void {
    event.stopPropagation();
    if (!this.InheritedFromEntity) return;

    this.Navigate.emit({
      Kind: 'entity-hierarchy',
      EntityName: this.InheritedFromEntity,
      PrimaryKey: this.InheritedRecordPrimaryKey ?? new CompositeKey([]),
      Direction: 'parent'
    });
  }

  // ---- Drag and Drop ----

  @HostListener('dragover', ['$event'])
  OnDragOver(event: DragEvent): void {
    event.preventDefault();
    event.stopPropagation();
    if (event.dataTransfer?.types.includes('text/plain')) {
      this.IsDragOver = true;
    }
  }

  @HostListener('dragleave', ['$event'])
  OnDragLeave(event: DragEvent): void {
    event.preventDefault();
    this.IsDragOver = false;
  }

  @HostListener('drop', ['$event'])
  OnDrop(event: DragEvent): void {
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
   * and relays them through this panel's Navigate output.
   */
  private SubscribeToFieldNavigateEvents(): void {
    this.fieldNavReset$.next(); // tear down previous subscriptions
    this.FieldComponents.forEach(field => {
      field.Navigate.pipe(takeUntil(this.fieldNavReset$)).subscribe((event: FormNavigationEvent) => {
        this.Navigate.emit(event);
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
        const entry = entries[0];
        if (!entry) return;
        const newHeight = Math.round(entry.contentRect.height);
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
    const searchTerm = (this.FormContext?.sectionFilter || '').toLowerCase().trim();

    if (!searchTerm) {
      this.IsVisible = true;
      this.DisplayName = this.SectionName;
      this.cdr.markForCheck();
      return;
    }

    const sectionMatches = this.SectionName.toLowerCase().includes(searchTerm);
    const fieldsMatch = this.FieldNames.includes(searchTerm);
    this.IsVisible = sectionMatches || fieldsMatch;

    if (this.IsVisible && sectionMatches) {
      const escaped = searchTerm.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      const regex = new RegExp(escaped, 'gi');
      this.DisplayName = this.SectionName.replace(regex, '<mark class="mj-forms-search-highlight">$&</mark>');
    } else {
      this.DisplayName = this.SectionName;
    }

    this.cdr.markForCheck();
  }
}
