import {
  Component, Input, Output, EventEmitter,
  ChangeDetectionStrategy, ChangeDetectorRef, inject,
  ContentChildren, QueryList, AfterContentInit, OnDestroy,
  ViewEncapsulation
} from '@angular/core';
import { BaseEntity, EntityInfo } from '@memberjunction/core';
import { Subject } from 'rxjs';
import { takeUntil } from 'rxjs/operators';
import { FormToolbarConfig, DEFAULT_TOOLBAR_CONFIG } from '../types/toolbar-config';
import { FormNavigationEvent } from '../types/navigation-events';
import { FormContext, FormWidthMode } from '../types/form-types';
import { MjCollapsiblePanelComponent } from '../panel/collapsible-panel.component';
import {
  BeforeSaveEventArgs,
  BeforeDeleteEventArgs,
  BeforeCancelEventArgs,
  BeforeHistoryViewEventArgs,
  BeforeListManagementEventArgs,
  CustomToolbarButtonClickEventArgs
} from '../types/form-events';

/**
 * Duck-typed interface for the form component reference.
 * Structurally compatible with BaseFormComponent from `@memberjunction/ng-base-forms`
 * without requiring a direct import (keeps ng-forms Explorer-independent).
 */
interface FormComponentRef {
  record: BaseEntity;
  EditMode: boolean;
  UserCanEdit: boolean;
  UserCanDelete: boolean;
  IsFavorite: boolean;
  FavoriteInitDone: boolean;
  EntityInfo: EntityInfo | undefined;
  searchFilter: string;
  showEmptyFields: boolean;
  formContext: FormContext;

  // Section management
  IsSectionExpanded(sectionKey: string, defaultExpanded?: boolean): boolean;
  SetSectionExpanded(sectionKey: string, expanded: boolean): void;
  getSectionOrder(): string[];
  setSectionOrder(order: string[]): void;
  getSectionDisplayOrder(sectionKey: string): number;
  GetSectionRowCount(sectionKey: string): number | undefined;
  getVisibleSectionCount(): number;
  getTotalSectionCount(): number;
  getExpandedCount(): number;
  hasCustomSectionOrder(): boolean;
  getFormWidthMode(): FormWidthMode;

  // Actions
  SaveRecord(validate: boolean): Promise<boolean>;
  CancelEdit(): void;
  StartEditMode(): void;
  EndEditMode(): void;
  expandAllSections(): void;
  collapseAllSections(): void;
  onFilterChange(searchTerm: string): void;
  setFormWidthMode(mode: FormWidthMode): void;
  resetSectionOrder(): void;
  SetFavoriteStatus(isFavorite: boolean): Promise<void>;
  ShowChanges(): void;
}

/**
 * Top-level container that composes the toolbar, content slots, and sticky behavior.
 *
 * **Two usage modes:**
 *
 * 1. **With FormComponent** (generated forms): Pass `[FormComponent]="this"` and the
 *    container derives all state from the BaseFormComponent instance. Save/Cancel/Edit
 *    are handled internally by calling FormComponent methods.
 *
 * 2. **Standalone**: Pass individual @Input properties and handle all @Output events.
 *
 * @example Generated form usage:
 * ```html
 * <mj-record-form-container [Record]="record" [FormComponent]="this"
 *   (Navigate)="OnFormNavigate($event)"
 *   (DeleteRequested)="OnDeleteRequested()"
 *   (FavoriteToggled)="OnFavoriteToggled()"
 *   (HistoryRequested)="OnHistoryRequested()"
 *   (ListManagementRequested)="OnListManagementRequested()">
 *
 *   <mj-collapsible-panel field-panels ...>
 *     <mj-form-field ...></mj-form-field>
 *   </mj-collapsible-panel>
 *
 *   <mj-collapsible-panel after-panels ...>
 *     <!-- related entity grid -->
 *   </mj-collapsible-panel>
 * </mj-record-form-container>
 * ```
 */
@Component({
  standalone: false,
  selector: 'mj-record-form-container',
  changeDetection: ChangeDetectionStrategy.OnPush,
  encapsulation: ViewEncapsulation.None,
  templateUrl: './record-form-container.component.html',
  styleUrls: ['./record-form-container.component.css']
})
export class MjRecordFormContainerComponent implements AfterContentInit, OnDestroy {
  private cdr = inject(ChangeDetectorRef);
  private destroy$ = new Subject<void>();
  private panelNavReset$ = new Subject<void>();

  // ---- Internal State ----

  /** Controls visibility of record changes drawer */
  ShowRecordChanges = false;

  /** Controls visibility of list management dialog */
  ShowListManagement = false;

  // ---- Primary Inputs ----

  /** The entity record being displayed/edited */
  @Input() Record!: BaseEntity;

  /**
   * Reference to the parent form component (e.g. BaseFormComponent subclass).
   * When provided, the container derives toolbar state from this reference and
   * handles Save/Cancel/Edit internally by calling its methods.
   */
  @Input() FormComponent: unknown;

  // ---- Fallback Inputs (used when FormComponent is NOT provided) ----

  @Input() EntityInfo: EntityInfo | null = null;
  @Input() EditMode = false;
  @Input() UserCanEdit = false;
  @Input() UserCanDelete = false;
  @Input() IsFavorite = false;
  @Input() FavoriteInitDone = false;
  @Input() IsDirty = false;
  @Input() DirtyFieldNames: string[] = [];
  @Input() ListCount = 0;
  @Input() IsSaving = false;
  @Input() ToolbarConfig: FormToolbarConfig = DEFAULT_TOOLBAR_CONFIG;
  @Input() WidthMode: FormWidthMode = 'centered';

  // ---- Outputs ----

  /** Emitted for all navigation actions (the host app maps these to its routing) */
  @Output() Navigate = new EventEmitter<FormNavigationEvent>();

  /** Emitted when edit mode changes (only in standalone mode; FormComponent mode handled internally) */
  @Output() EditModeChange = new EventEmitter<boolean>();

  /** Emitted BEFORE save - can be cancelled by setting event.Cancel = true */
  @Output() BeforeSave = new EventEmitter<BeforeSaveEventArgs>();

  /** Emitted when save is requested (only in standalone mode) */
  @Output() SaveRequested = new EventEmitter<void>();

  /** Emitted BEFORE cancel - can be cancelled by setting event.Cancel = true */
  @Output() BeforeCancel = new EventEmitter<BeforeCancelEventArgs>();

  /** Emitted when cancel is requested (only in standalone mode) */
  @Output() CancelRequested = new EventEmitter<void>();

  /** Emitted BEFORE delete - can be cancelled by setting event.Cancel = true */
  @Output() BeforeDelete = new EventEmitter<BeforeDeleteEventArgs>();

  /** Emitted when delete is confirmed (host app handles actual deletion) */
  @Output() DeleteRequested = new EventEmitter<void>();

  /** Emitted when favorite toggle is requested */
  @Output() FavoriteToggled = new EventEmitter<void>();

  /** Emitted BEFORE history view - can be cancelled by setting event.Cancel = true */
  @Output() BeforeHistoryView = new EventEmitter<BeforeHistoryViewEventArgs>();

  /** Emitted when history view is requested */
  @Output() HistoryRequested = new EventEmitter<void>();

  /** Emitted BEFORE list management - can be cancelled by setting event.Cancel = true */
  @Output() BeforeListManagement = new EventEmitter<BeforeListManagementEventArgs>();

  /** Emitted when list management is requested */
  @Output() ListManagementRequested = new EventEmitter<void>();

  /** Emitted when show-changes is requested */
  @Output() ShowChangesRequested = new EventEmitter<void>();

  /** Emitted when a custom toolbar button is clicked */
  @Output() CustomButtonClick = new EventEmitter<CustomToolbarButtonClickEventArgs>();

  // ---- Content Children ----

  @ContentChildren(MjCollapsiblePanelComponent, { descendants: true })
  Panels!: QueryList<MjCollapsiblePanelComponent>;

  // ---- FormComponent accessor ----

  /** Safely cast FormComponent to the duck-typed interface */
  private get fc(): FormComponentRef | null {
    return this.FormComponent as FormComponentRef | null;
  }

  // ---- Effective state (bridges FormComponent → toolbar inputs) ----

  get EffectiveRecord(): BaseEntity {
    return this.fc?.record ?? this.Record;
  }

  get EffectiveEditMode(): boolean {
    return this.fc?.EditMode ?? this.EditMode;
  }

  get EffectiveUserCanEdit(): boolean {
    return this.fc?.UserCanEdit ?? this.UserCanEdit;
  }

  get EffectiveUserCanDelete(): boolean {
    return this.fc?.UserCanDelete ?? this.UserCanDelete;
  }

  get EffectiveIsFavorite(): boolean {
    return this.fc?.IsFavorite ?? this.IsFavorite;
  }

  get EffectiveFavoriteInitDone(): boolean {
    return this.fc?.FavoriteInitDone ?? this.FavoriteInitDone;
  }

  get EffectiveEntityInfo(): EntityInfo | null {
    return (this.fc?.EntityInfo as EntityInfo) ?? this.EntityInfo;
  }

  get EffectiveIsDirty(): boolean {
    if (this.fc) {
      return this.fc.record?.Dirty ?? false;
    }
    return this.IsDirty;
  }

  get EffectiveDirtyFieldNames(): string[] {
    if (this.fc?.record?.Fields) {
      return this.fc.record.Fields.filter(f => f.Dirty).map(f => f.Name);
    }
    return this.DirtyFieldNames;
  }

  get EffectiveIsSaving(): boolean {
    return this.IsSaving;
  }

  get EffectiveWidthMode(): FormWidthMode {
    if (this.fc?.getFormWidthMode) {
      return this.fc.getFormWidthMode();
    }
    return this.WidthMode;
  }

  get EffectiveSearchFilter(): string {
    return this.fc?.searchFilter ?? '';
  }

  get EffectiveShowEmptyFields(): boolean {
    return this.fc?.showEmptyFields ?? false;
  }

  get EffectiveHasCustomSectionOrder(): boolean {
    if (this.fc?.hasCustomSectionOrder) {
      return this.fc.hasCustomSectionOrder();
    }
    return false;
  }

  // ---- Section counts ----

  get TotalSectionCount(): number {
    if (this.fc?.getTotalSectionCount) {
      return this.fc.getTotalSectionCount();
    }
    return this.Panels?.length ?? 0;
  }

  get VisibleSectionCount(): number {
    if (this.fc?.getVisibleSectionCount) {
      return this.fc.getVisibleSectionCount();
    }
    if (!this.Panels) return 0;
    return this.Panels.filter(p => p.IsVisible).length;
  }

  get ExpandedSectionCount(): number {
    if (this.fc?.getExpandedCount) {
      return this.fc.getExpandedCount();
    }
    if (!this.Panels) return 0;
    return this.Panels.filter(p => p.Expanded && p.IsVisible).length;
  }

  // ---- Lifecycle ----

  ngAfterContentInit(): void {
    // Subscribe to panel Navigate events and relay them
    this.SubscribeToPanelNavigateEvents();

    // Watch for panel changes to update counts and re-subscribe
    this.Panels.changes.pipe(takeUntil(this.destroy$)).subscribe(() => {
      this.SubscribeToPanelNavigateEvents();
      this.cdr.markForCheck();
    });

    // Watch for changes to record dirty state
    this.watchRecordChanges();
  }

  ngOnDestroy(): void {
    this.panelNavReset$.next();
    this.panelNavReset$.complete();
    this.destroy$.next();
    this.destroy$.complete();
  }

  /**
   * Subscribes to Navigate events from all child collapsible panels
   * and relays them through this container's Navigate output.
   */
  private SubscribeToPanelNavigateEvents(): void {
    this.panelNavReset$.next(); // tear down previous subscriptions
    this.Panels.forEach(panel => {
      panel.Navigate.pipe(takeUntil(this.panelNavReset$)).subscribe((event: FormNavigationEvent) => {
        this.Navigate.emit(event);
      });
    });
  }

  /**
   * Monitor record dirty state changes and trigger change detection.
   * This ensures the edit banner updates when fields are modified.
   */
  private watchRecordChanges(): void {
    // Poll for dirty state changes (BaseEntity doesn't expose observables)
    const checkInterval = setInterval(() => {
      if (this.EffectiveRecord?.Dirty !== undefined) {
        this.cdr.markForCheck();
      }
    }, 200);

    // Cleanup on destroy
    this.destroy$.subscribe(() => clearInterval(checkInterval));
  }

  // ---- Toolbar Event Handlers ----

  /**
   * Navigation events are always re-emitted for the host app to handle.
   */
  OnNavigate(event: FormNavigationEvent): void {
    this.Navigate.emit(event);
  }

  /**
   * Edit mode change: delegate to FormComponent if available, otherwise re-emit.
   */
  OnEditModeChange(editMode: boolean): void {
    if (this.fc) {
      if (editMode) {
        this.fc.StartEditMode();
      } else {
        this.fc.EndEditMode();
      }
      this.cdr.markForCheck();
    } else {
      this.EditModeChange.emit(editMode);
    }
  }

  /**
   * Save: delegate to FormComponent if available, otherwise re-emit.
   */
  async OnSaveRequested(): Promise<void> {
    if (this.fc?.SaveRecord) {
      // Mark as saving to prevent double-click
      this.IsSaving = true;
      this.cdr.markForCheck();

      try {
        await this.fc.SaveRecord(true);
      } finally {
        // Use microtask timing to avoid ExpressionChangedAfterItHasBeenCheckedError
        await Promise.resolve();
        this.IsSaving = false;
        this.cdr.markForCheck();
      }
    } else {
      this.SaveRequested.emit();
    }
  }

  /**
   * Cancel: delegate to FormComponent if available, otherwise re-emit.
   */
  OnCancelRequested(): void {
    if (this.fc?.CancelEdit) {
      this.fc.CancelEdit();
      this.cdr.markForCheck();
    } else {
      this.CancelRequested.emit();
    }
  }

  /**
   * Delete, Favorite, History, Lists, ShowChanges: always re-emit for host app.
   */
  OnDeleteRequested(): void {
    this.DeleteRequested.emit();
  }

  OnFavoriteToggled(): void {
    this.FavoriteToggled.emit();
  }

  OnHistoryRequested(): void {
    // Check if event should be cancelled
    const beforeEvent = new BeforeHistoryViewEventArgs();
    this.BeforeHistoryView.emit(beforeEvent);
    if (beforeEvent.Cancel) return;

    // If not cancelled, show built-in record changes drawer
    this.ShowRecordChanges = true;
    this.cdr.markForCheck();

    // Also emit for backward compatibility
    this.HistoryRequested.emit();
  }

  OnListManagementRequested(): void {
    // Check if event should be cancelled
    const beforeEvent = new BeforeListManagementEventArgs();
    this.BeforeListManagement.emit(beforeEvent);
    if (beforeEvent.Cancel) return;

    // If not cancelled, show built-in list management dialog
    this.ShowListManagement = true;
    this.cdr.markForCheck();

    // Also emit for backward compatibility
    this.ListManagementRequested.emit();
  }

  OnRecordChangesClosed(): void {
    this.ShowRecordChanges = false;
    this.cdr.markForCheck();
  }

  OnListManagementClosed(): void {
    this.ShowListManagement = false;
    this.cdr.markForCheck();
  }

  OnShowChangesRequested(): void {
    if (this.fc?.ShowChanges) {
      this.fc.ShowChanges();
    } else {
      this.ShowChangesRequested.emit();
    }
  }

  // ---- Section Control Handlers ----

  OnFilterChange(filter: string): void {
    if (this.fc?.onFilterChange) {
      this.fc.onFilterChange(filter);
      this.cdr.markForCheck();
    }
  }

  OnExpandAll(): void {
    if (this.fc?.expandAllSections) {
      this.fc.expandAllSections();
      this.cdr.markForCheck();
    }
  }

  OnCollapseAll(): void {
    if (this.fc?.collapseAllSections) {
      this.fc.collapseAllSections();
      this.cdr.markForCheck();
    }
  }

  OnShowEmptyFieldsChange(show: boolean): void {
    if (this.fc) {
      this.fc.showEmptyFields = show;
      this.cdr.markForCheck();
    }
  }

  OnWidthModeChange(mode: FormWidthMode): void {
    if (this.fc?.setFormWidthMode) {
      this.fc.setFormWidthMode(mode);
      this.cdr.markForCheck();
    } else {
      this.WidthMode = mode;
      this.cdr.markForCheck();
    }
  }

  OnResetSectionOrder(): void {
    if (this.fc?.resetSectionOrder) {
      this.fc.resetSectionOrder();
      this.cdr.markForCheck();
    }
  }
}
