import {
  Component, Input, Output, EventEmitter,
  ChangeDetectionStrategy, ChangeDetectorRef, inject, NgZone,
  ContentChildren, QueryList, AfterContentInit, OnDestroy,
  ViewChild, ViewEncapsulation
} from '@angular/core';
import { BaseEntity, CompositeKey, EntityInfo, Metadata, RunView } from '@memberjunction/core';
import { UUIDsEqual } from '@memberjunction/global';
import { BaseAngularComponent } from '@memberjunction/ng-base-types';
import { UserInfoEngine } from '@memberjunction/core-entities';
import { Subject } from 'rxjs';
import { takeUntil } from 'rxjs/operators';
import { FormToolbarConfig, DEFAULT_TOOLBAR_CONFIG } from '../types/toolbar-config';
import { FormNavigationEvent } from '../types/navigation-events';
import { FormWidthMode } from '../types/form-types';
import { MjCollapsiblePanelComponent } from '../panel/collapsible-panel.component';
import { SectionManagerItem } from '../section-manager/section-manager.component';
import {
  BeforeSaveEventArgs,
  BeforeDeleteEventArgs,
  BeforeCancelEventArgs,
  BeforeHistoryViewEventArgs,
  BeforeListManagementEventArgs,
  CustomToolbarButtonClickEventArgs
} from '../types/form-events';
import { BaseFormComponent } from '../base-form-component';
import { RestoreVersionEvent, RecordChangesComponent } from '@memberjunction/ng-record-changes';
import { MJNotificationService } from '@memberjunction/ng-notifications';
import { FormSlotCoordinator } from '../panel-slot/form-slot-coordinator.service';

/**
 * Display shape for the variant picker. Kept minimal so the Generic
 * container doesn't pull in resolver types; the Explorer-level component
 * that owns the resolver shapes its rows into this.
 */
export interface VariantPickerItem {
    ID: string;
    Label: string;
    Scope: 'User' | 'Role' | 'Global';
    Status: 'Active' | 'Pending' | 'Inactive';
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
 *   <mj-collapsible-panel SectionKey="details" ...>
 *     <mj-form-field ...></mj-form-field>
 *   </mj-collapsible-panel>
 *
 *   <mj-collapsible-panel SectionKey="relatedOrders" Variant="related-entity" ...>
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
  styleUrls: ['./record-form-container.component.css'],
  // FormSlotCoordinator scoped per-container so each form has its own
  // slot-presence map for fallback resolution. See FormPanelSlotComponent.
  providers: [FormSlotCoordinator],
})
export class MjRecordFormContainerComponent extends BaseAngularComponent implements AfterContentInit, OnDestroy  {
  private cdr = inject(ChangeDetectorRef);
  private ngZone = inject(NgZone);
  private notificationService = inject(MJNotificationService);
  private destroy$ = new Subject<void>();
  private panelNavReset$ = new Subject<void>();

  // ---- Internal State ----

  /** Reference to the record changes drawer (when visible) for triggering refresh after save */
  @ViewChild(RecordChangesComponent) private recordChangesDrawer?: RecordChangesComponent;

  /** Controls visibility of record changes drawer */
  ShowRecordChanges = false;

  /** Controls visibility of tags panel */
  ShowTagsPanel = false;

  /** Persisted tags panel width */
  TagsPanelWidth = 0;
  private static readonly TAGS_WIDTH_KEY = 'MJ_TagsPanel_Width';

  /** Number of tags on this record */
  TagCount = 0;

  /** Number of tracked record change versions for this record */
  VersionCount = 0;

  /** Controls visibility of list management dialog */
  ShowListManagement = false;

  /** Controls visibility of section manager drawer */
  ShowSectionManager = false;

  // ---- Primary Inputs ----

  /** The entity record being displayed/edited */
  @Input() Record!: BaseEntity;

  /**
   * Reference to the parent form component (e.g. BaseFormComponent subclass).
   * When provided, the container derives toolbar state from this reference and
   * handles Save/Cancel/Edit internally by calling its methods.
   */
  @Input() FormComponent: BaseFormComponent | null = null;

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

  /**
   * Variants available for this entity record. When more than one variant is
   * provided, a compact picker appears between the toolbar and the form body
   * letting the user switch which form is rendered. Empty / single-variant
   * lists hide the picker entirely.
   *
   * Each item is a plain object — we don't take a hard dep on the resolver's
   * row type from here (this is a Generic component; the Explorer-level
   * single-record component shapes the resolver row into this minimal form).
   */
  @Input() Variants: VariantPickerItem[] = [];

  /**
   * Override ID currently rendered. The picker highlights this entry. May be
   * null when the active form is a class-based @RegisterClass form (no
   * override is currently active) — in that case the picker still appears
   * with "Default form" as the leading row.
   */
  @Input() CurrentVariantID: string | null = null;

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

  /**
   * Emitted when the user chooses a different form variant from the picker.
   * Carries the selected variant's override ID, or null when the user picks
   * the "Default form" row. The host is responsible for persisting the choice
   * (via FormResolverService.SetSelectedVariant) and reloading the record so
   * the new form mounts.
   */
  @Output() VariantChange = new EventEmitter<string | null>();

  // ---- Content Children ----

  @ContentChildren(MjCollapsiblePanelComponent, { descendants: true })
  Panels!: QueryList<MjCollapsiblePanelComponent>;

  // ---- FormComponent accessor ----

  /** Typed accessor for the form component reference */
  private get fc(): BaseFormComponent | null {
    return this.FormComponent;
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

  /**
   * Whether the in-form toolbar renders at all. Driven by the form's
   * `Config.toolbar`: an explicit `null` (the dialog/slide-in default) hides
   * the entire toolbar so the surrounding chrome can own Save/Cancel/title.
   * Any other value (undefined or a partial config) keeps the toolbar.
   */
  get EffectiveShowToolbar(): boolean {
    return this.fc?.Config?.toolbar !== null;
  }

  /**
   * Effective toolbar config: the bound `ToolbarConfig` (or the default)
   * with the form's `Config.toolbar` partial merged on top. This is the
   * no-regeneration bridge — generated templates never bind `[Config]`,
   * yet per-instance toolbar tweaks still take effect through `fc.Config`.
   */
  get EffectiveToolbarConfig(): FormToolbarConfig {
    const base = this.ToolbarConfig ?? DEFAULT_TOOLBAR_CONFIG;
    const override = this.fc?.Config?.toolbar;
    return override ? { ...base, ...override } : base;
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

  // ---- IS-A Related Panel ----

  /** Whether the current record has IS-A related items to display in the side panel */
  get HasIsaRelatedItems(): boolean {
    const record = this.EffectiveRecord;
    if (!record?.EntityInfo) return false;

    const entityInfo = record.EntityInfo;

    // Child entity with overlapping parent — may have siblings
    if (entityInfo.IsChildType && entityInfo.ParentEntityInfo?.AllowMultipleSubtypes) {
      const parent = record.ISAParent;
      if (parent?.ISAChildren && parent.ISAChildren.length > 1) return true;
    }

    // Parent entity with children
    if (entityInfo.IsParentType) {
      if (entityInfo.AllowMultipleSubtypes && record.ISAChildren && record.ISAChildren.length > 0) return true;
      if (!entityInfo.AllowMultipleSubtypes && record.ISAChild) return true;
    }

    return false;
  }

  // ---- Section Manager ----

  /** Builds section info array from projected panels for the section manager drawer */
  get SectionManagerItems(): SectionManagerItem[] {
    if (!this.Panels) return [];
    return this.Panels.map(p => ({
      SectionKey: p.SectionKey,
      SectionName: p.SectionName,
      Variant: p.Variant,
      Icon: p.Icon
    }));
  }

  /** Current section order from the form component */
  get SectionManagerOrder(): string[] {
    if (this.fc?.getSectionOrder) {
      return this.fc.getSectionOrder();
    }
    return [];
  }

  // ---- Lifecycle ----

  ngAfterContentInit(): void {
    // Load saved tags panel width
    const savedWidth = UserInfoEngine.Instance.GetSetting(MjRecordFormContainerComponent.TAGS_WIDTH_KEY);
    if (savedWidth) this.TagsPanelWidth = parseInt(savedWidth, 10) || 0;

    // Subscribe to panel Navigate events and relay them
    this.SubscribeToPanelNavigateEvents();

    // Apply Config-driven section visibility (related-entity hide / allow-list).
    this.ApplySectionVisibility();

    // Watch for panel changes to update counts and re-subscribe
    this.Panels.changes.pipe(takeUntil(this.destroy$)).subscribe(() => {
      this.SubscribeToPanelNavigateEvents();
      this.ApplySectionVisibility();
      this.cdr.markForCheck();
    });

    // Watch for changes to record dirty state
    this.watchRecordChanges();

    // Badge counts are loaded when the form emits RecordReady (see SubscribeToPanelNavigateEvents)
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
    // Subscribe to RecordReady on the form component — fires once after record is fully initialized
    if (this.fc) {
      this.fc.RecordReady.pipe(takeUntil(this.panelNavReset$)).subscribe(() => {
        this.LoadBadgeCounts();
      });
    }

    this.Panels.forEach(panel => {
      panel.Navigate.pipe(takeUntil(this.panelNavReset$)).subscribe((event: FormNavigationEvent) => {
        this.Navigate.emit(event);
      });
    });
  }

  /**
   * Applies the form's `EntityFormConfig` section-visibility rules to the
   * projected collapsible panels:
   * - `visibleSectionKeys` (allow-list) hides every section not listed.
   * - otherwise `hiddenSectionKeys` hides the listed sections.
   * - `showRelatedEntities === false` hides all related-entity-variant panels.
   *
   * Deferred to a microtask to avoid ExpressionChangedAfterItHasBeenChecked
   * when toggling panel inputs during/after content init.
   */
  private ApplySectionVisibility(): void {
    const cfg = this.fc?.Config;
    if (!this.Panels) return;
    const allow = cfg?.visibleSectionKeys;
    const hide = cfg?.hiddenSectionKeys;
    const hideRelated = cfg?.showRelatedEntities === false;
    // Nothing to do when no rules are configured — leave panels untouched.
    if (!allow?.length && !hide?.length && !hideRelated) return;

    Promise.resolve().then(() => {
      this.Panels.forEach(p => {
        let hidden = false;
        if (allow && allow.length > 0) {
          hidden = !allow.includes(p.SectionKey);
        } else if (hide && hide.includes(p.SectionKey)) {
          hidden = true;
        }
        if (!hidden && hideRelated && p.Variant === 'related-entity') {
          hidden = true;
        }
        p.Hidden = hidden;
      });
      this.cdr.markForCheck();
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

  // ---- Badge Count Loading ----

  /**
   * Loads tag count and record change version count for toolbar badges.
   * Both queries run in parallel for performance.
   */
  private badgeCountsLoaded = false;

  private LoadBadgeCounts(): void {
    if (this.badgeCountsLoaded) return;

    const record = this.EffectiveRecord;
    if (!record?.EntityInfo) return;

    this.badgeCountsLoaded = true;

    // Fire both queries in parallel — no await needed, they update state async
    this.LoadTagCount(record);
    this.LoadVersionCount(record);
  }

  /**
   * Queries the count of tagged items for the current entity + record
   * and updates the TagCount badge on the toolbar.
   */
  private async LoadTagCount(record: BaseEntity): Promise<void> {
    try {
      const rv = RunView.FromMetadataProvider(this.ProviderToUse);
      // Don't narrow Fields — the server caches RunView results by entity+filter (ignoring Fields),
      // so a narrow query here would poison the cache for the subsequent full-field load in the Tags panel.
      const result = await rv.RunView({
        EntityName: 'MJ: Tagged Items',
        ExtraFilter: `EntityID='${record.EntityInfo.ID}' AND RecordID='${record.PrimaryKey.Values()}'`,
        ResultType: 'simple'
      });
      if (result.Success) {
        this.TagCount = result.Results.length;
        this.cdr.detectChanges();
      }
    } catch {
      // Non-critical — badge just stays at 0
    }
  }

  /**
   * Queries the count of record change entries for the current entity + record
   * and updates the VersionCount badge on the toolbar.
   */
  private async LoadVersionCount(record: BaseEntity): Promise<void> {
    if (!record.EntityInfo.TrackRecordChanges) return;
    try {
      const rv = RunView.FromMetadataProvider(this.ProviderToUse);
      const result = await rv.RunView<{ ID: string }>({
        EntityName: 'MJ: Record Changes',
        Fields: ['ID'],
        ExtraFilter: `EntityID='${record.EntityInfo.ID}' AND RecordID='${record.PrimaryKey.ToConcatenatedString()}'`,
        ResultType: 'simple'
      });
      if (result.Success) {
        this.VersionCount = result.Results.length;
        this.cdr.detectChanges();
      }
    } catch {
      // Non-critical — badge just stays at 0
    }
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

        // After successful save, refresh version count badge and record changes drawer
        this.RefreshAfterSave();
      } finally {
        // Use microtask timing to avoid ExpressionChangedAfterItHasBeenCheckedError
        await Promise.resolve();
        this.ngZone.run(() => {
          this.IsSaving = false;
          this.cdr.markForCheck();
        });
      }
    } else {
      this.SaveRequested.emit();
    }
  }

  /**
   * Refreshes the version count badge and record changes drawer after a save.
   * The save operation creates a new RecordChange entry server-side, so we need
   * to update the UI to reflect the new version.
   */
  private RefreshAfterSave(): void {
    const record = this.EffectiveRecord;
    if (!record?.EntityInfo?.TrackRecordChanges) return;

    // Refresh version count badge
    this.LoadVersionCount(record);

    // If the record changes drawer is open, refresh it too
    if (this.ShowRecordChanges && this.recordChangesDrawer) {
      this.recordChangesDrawer.Refresh();
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

  OnTagsPanelToggled(): void {
    this.ShowTagsPanel = !this.ShowTagsPanel;
    this.cdr.detectChanges();
  }

  OnTagsPanelClosed(): void {
    this.ShowTagsPanel = false;
    this.cdr.detectChanges();

    // Refresh tag count — tags may have been added/removed while panel was open
    const record = this.EffectiveRecord;
    if (record?.EntityInfo) {
      this.LoadTagCount(record);
    }
  }

  /**
   * Handles live tag count updates from the tags panel component.
   */
  OnTagCountChanged(count: number): void {
    this.TagCount = count;
    this.cdr.markForCheck();
  }

  OnTagsPanelWidthChanged(width: number): void {
    this.TagsPanelWidth = width;
    UserInfoEngine.Instance.SetSettingDebounced(MjRecordFormContainerComponent.TAGS_WIDTH_KEY, String(width));
  }

  OnTagsRecordNavigate(event: { EntityName: string; RecordID: string }): void {
    const md = this.ProviderToUse;
    const entityInfo = md.Entities.find(e => e.Name === event.EntityName);
    const pkey = new CompositeKey();
    if (entityInfo) {
      pkey.LoadFromURLSegment(entityInfo, event.RecordID);
    } else {
      pkey.KeyValuePairs = [{ FieldName: 'ID', Value: event.RecordID }];
    }
    this.Navigate.emit({ Kind: 'record', EntityName: event.EntityName, PrimaryKey: pkey });
  }

  OnRecordChangesClosed(): void {
    this.ShowRecordChanges = false;
    this.cdr.markForCheck();

    // Refresh version count — new changes may have occurred
    const record = this.EffectiveRecord;
    if (record?.EntityInfo) {
      this.LoadVersionCount(record);
    }
  }

  /**
   * Handles a restore request from the record-changes panel.
   *
   * The event payload now carries the FULL snapshot the user opted to apply
   * (the panel computes current-vs-snapshot diffs using the source change's
   * FullRecordJSON, and the user can deselect individual fields). Setting
   * the restore context before Save() causes the data provider to write the
   * resulting RecordChange row with `Source='Restore'`, `RestoredFromID`,
   * and `RestoreReason` populated — building the auditable lineage chain.
   */
  async OnRestoreRequested(event: RestoreVersionEvent): Promise<void> {
    const record = this.EffectiveRecord;
    if (!record) return;

    try {
      // Apply each selected snapshot field
      for (const fv of event.FieldValues) {
        record.Set(fv.FieldName, fv.Value);
      }

      // Mark the next save as a restore so the provider populates the
      // lineage columns. ClearRestoreContext is called in finally{} below
      // so it doesn't leak into subsequent saves on this entity instance.
      record.SetRestoreContext(event.SourceChangeID, event.Reason);

      try {
        const saved = await record.Save();
        if (saved) {
          const fieldCount = event.FieldValues.length;
          const reasonSuffix = event.Reason ? ` — "${event.Reason}"` : '';
          this.notificationService.CreateSimpleNotification(
            `Restored ${fieldCount} field${fieldCount === 1 ? '' : 's'} from version dated ${new Date(event.ChangedAt).toLocaleDateString()}${reasonSuffix}`,
            'info', 3500,
          );

          // Refresh version count — the save just produced a new restore-tagged change.
          this.LoadVersionCount(record);
          this.cdr.markForCheck();
        } else {
          const errMsg = record.LatestResult?.CompleteMessage ?? 'unknown error';
          this.notificationService.CreateSimpleNotification(
            `Failed to save restored values: ${errMsg}`,
            'error', 4500,
          );
        }
      } finally {
        record.ClearRestoreContext();
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Unknown error';
      this.notificationService.CreateSimpleNotification(
        `Restore failed: ${message}`,
        'error', 4000,
      );
    }
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

  // ---- Variant picker ----

  /** Whether the variant dropdown menu is currently open. Toggled by the
   *  control's click handler; closed on blur or after a row is picked. */
  _variantMenuOpen = false;

  /**
   * Effective variants — prefer the form component's list (set by the host
   * resolver) when present, fall back to the directly-bound @Input. This
   * means generated form templates don't need to bind [Variants] explicitly;
   * the host populates `instance.Variants` post-construction and the
   * container reads it through this accessor.
   */
  get EffectiveVariants(): VariantPickerItem[] {
    return (this.fc?.Variants as VariantPickerItem[] | undefined)
        ?? this.Variants
        ?? [];
  }

  get EffectiveCurrentVariantID(): string | null {
    return this.fc?.CurrentVariantID ?? this.CurrentVariantID;
  }

  /** Whether to show the variant picker at all. Hidden when the entity has
   *  zero or one applicable variant — there's nothing to switch between. */
  get ShowVariantPicker(): boolean {
    return (this.EffectiveVariants?.length ?? 0) > 1;
  }

  /** Label for the currently-selected variant (or "Default form" if none). */
  get CurrentVariantLabel(): string {
    const v = this.EffectiveVariants?.find(x => UUIDsEqual(x.ID, this.EffectiveCurrentVariantID));
    return v?.Label ?? 'Default form';
  }

  /** Compact subtitle: scope + status, e.g. "User · Active". */
  variantSubtitle(v: VariantPickerItem): string {
    return `${v.Scope} · ${v.Status}`;
  }

  /**
   * User picked an item from the variant menu. If the host installed a
   * handler via `instance.OnVariantChanged`, call it; otherwise emit the
   * VariantChange event for standalone consumers.
   */
  OnVariantPicked(variantID: string | null): void {
    if (variantID === this.EffectiveCurrentVariantID) return;
    if (this.fc && typeof this.fc.OnVariantChanged === 'function') {
      this.fc.OnVariantChanged(variantID);
    } else {
      this.VariantChange.emit(variantID);
    }
  }

  // ---- Section Manager Handlers ----

  OnManageSections(): void {
    this.ShowSectionManager = true;
    this.cdr.markForCheck();
  }

  OnSectionOrderChange(newOrder: string[]): void {
    if (this.fc?.setSectionOrder) {
      this.fc.setSectionOrder(newOrder);
      this.cdr.markForCheck();
    }
  }

  OnSectionManagerReset(): void {
    this.OnResetSectionOrder();
  }

  OnSectionManagerClosed(): void {
    this.ShowSectionManager = false;
    this.cdr.markForCheck();
  }
}
