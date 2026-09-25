import { Component, Input, Output, EventEmitter, ChangeDetectionStrategy, TemplateRef, ChangeDetectorRef, inject, DoCheck, OnInit, OnDestroy, HostListener, ElementRef } from '@angular/core';
import { Subject } from 'rxjs';
import { takeUntil } from 'rxjs/operators';
import { BaseAngularComponent } from '@memberjunction/ng-base-types';
import { BaseEntity, EntityInfo, CompositeKey } from '@memberjunction/core';
import { UUIDsEqual } from '@memberjunction/global';
import { UserInfoEngine } from '@memberjunction/core-entities';
import { RecordCloneService, type CloneCompletedEvent, type CloneNavigationEvent } from '@memberjunction/ng-record-clone';
import { FormToolbarConfig, DEFAULT_TOOLBAR_CONFIG } from '../types/toolbar-config';
import { FormToolbarItemConfig, FormToolbarItemKey, FormToolbarItemClickEventArgs, ResolvedToolbarItem } from '../types/form-toolbar-item';
import { IsAccordionFormChrome } from '../chrome/form-chrome';
import { FormNavigationEvent } from '../types/navigation-events';
import { DiscoverISADescendants, BuildDescendantTree, IsaRelatedItem } from '../isa-related-panel/isa-hierarchy-utils';
import { FormWidthMode, FormContext } from '../types/form-types';
import { FormRecordRefreshCoordinator } from '../form-record-refresh.coordinator';
import {
  BeforeSaveEventArgs,
  BeforeDeleteEventArgs,
  BeforeRefreshEventArgs,
  BeforeCancelEventArgs,
  BeforeHistoryViewEventArgs,
  BeforeListManagementEventArgs,
  BeforeCloneEventArgs,
  CustomToolbarButtonClickEventArgs,
  CustomToolbarButton
} from '../types/form-events';

/** User setting that stores the toolbar actions a user pinned, shared across every form. */
export const TOOLBAR_PINS_SETTING_KEY = 'MJ.Forms.Toolbar.PinnedActions';

/** Built-in actions that start pinned for a user who has not chosen pins. */
export const DEFAULT_PINNED_TOOLBAR_ACTIONS: readonly string[] = ['favorite', 'history'];

/** More-menu labels for the built-in actions, whose buttons are icon-only. */
const STANDARD_MENU_LABELS: Record<string, string> = {
  edit: 'Edit',
  delete: 'Delete record',
  refresh: 'Refresh',
  clone: 'Clone',
  favorite: 'Favorite',
  history: 'History',
  list: 'Add to list',
  tags: 'Tags',
  attachments: 'Attachments',
};

/**
 * Configurable form toolbar component.
 *
 * Renders action buttons (edit, save, delete, favorite, history, lists),
 * the IS-A entity hierarchy breadcrumb, and section controls (search, expand/collapse).
 *
 * All navigation actions are emitted as events - the toolbar never calls any routing
 * service directly. The host application subscribes and maps to its own navigation.
 *
 * @example
 * ```html
 * <mj-form-toolbar
 *   [record]="record"
 *   [editMode]="editMode"
 *   [config]="toolbarConfig"
 *   (Navigate)="onNavigate($event)"
 *   (EditModeChange)="editMode = $event"
 *   (SaveRequested)="onSave()"
 *   (DeleteRequested)="onDelete()">
 * </mj-form-toolbar>
 * ```
 */
@Component({
  standalone: false,
  selector: 'mj-form-toolbar',
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './form-toolbar.component.html',
  styleUrls: ['./form-toolbar.component.css']
})
export class MjFormToolbarComponent extends BaseAngularComponent implements DoCheck, OnInit, OnDestroy {
  private cdr = inject(ChangeDetectorRef);
  private recordRefresh = inject(FormRecordRefreshCoordinator, { optional: true });
  private cloneService = inject(RecordCloneService);
  private host = inject(ElementRef<HTMLElement>);
  private destroy$ = new Subject<void>();

  // ---- Deprecated form reference (backward compat) ----

  private _formRef: unknown;

  /**
   * @deprecated Use `<mj-record-form-container>` or pass individual inputs instead.
   * Accepts a form component reference for backward compatibility.
   * When set, the toolbar reads Record, EditMode, etc. from this reference.
   */
  @Input() set Form(value: unknown) { this._formRef = value; }
  get Form(): unknown { return this._formRef; }

  /** @deprecated Use [Form] or individual inputs instead */
  @Input('form') set _deprecatedForm(value: unknown) { this.Form = value; }

  // ---- Inputs ----

  /** The entity record being displayed/edited */
  @Input() Record!: BaseEntity;

  /** Whether the form is in edit mode */
  @Input() EditMode = false;

  /** Whether the current user has edit permission */
  @Input() UserCanEdit = false;

  /** Whether the current user has delete permission */
  @Input() UserCanDelete = false;

  /** Whether the record is currently a favorite */
  @Input() IsFavorite = false;

  /** Whether favorite init has completed (prevents flash of wrong icon) */
  @Input() FavoriteInitDone = false;

  /** Whether the record has unsaved changes */
  @Input() IsDirty = false;

  /** Names of dirty fields for display in save bar */
  @Input() DirtyFieldNames: string[] = [];

  /** Count of lists this record belongs to */
  @Input() ListCount = 0;

  /** Number of tags applied to this record */
  @Input() TagCount = 0;

  /** Whether the tags panel is currently open */
  @Input() IsTagsPanelOpen = false;

  /** Number of attachments linked to this record */
  @Input() AttachmentCount = 0;

  /** Whether the attachments feature is available for this record */
  @Input() AttachmentsAvailable = false;

  /** Whether the attachments panel is currently open */
  @Input() IsAttachmentsPanelOpen = false;

  /** Number of record change versions for this record (displayed as "vN" badge on history button) */
  @Input() VersionCount = 0;

  /** Entity info for IS-A hierarchy and metadata */
  @Input() EntityInfo: EntityInfo | null = null;

  /** Toolbar configuration controlling visibility and behavior */
  @Input() Config: FormToolbarConfig = DEFAULT_TOOLBAR_CONFIG;

  /** Whether to show the toolbar in a saving/loading state */
  @Input() IsSaving = false;

  /** Whether a refresh from database operation is currently in progress */
  @Input() IsRefreshing = false;

  // Section controls inputs
  @Input() VisibleSectionCount = 0;
  @Input() TotalSectionCount = 0;
  @Input() ExpandedSectionCount = 0;
  @Input() SearchFilter = '';
  @Input() ShowEmptyFields = false;
  @Input() WidthMode: FormWidthMode = 'centered';
  @Input() HasCustomSectionOrder = false;

  /**
   * Form chrome layout. Expand/collapse-all only render for accordion.
   * Left-nav and right-nav show one section at a time.
   */
  @Input() ChromeLayout: 'accordion' | 'left-nav' | 'right-nav' = 'accordion';

  get ShowExpandCollapseAll(): boolean {
    return this.Config.ShowExpandCollapseAllButtons && IsAccordionFormChrome(this.ChromeLayout);
  }

  /** Optional template for additional toolbar actions */
  @Input() AdditionalActionsTemplate: TemplateRef<unknown> | null = null;

  /**
   * Available form variants for this entity. When the array has >1 entry
   * and `Config.ShowFormVariantPicker` is true, the toolbar renders a
   * right-side "form picker" button (icon) that opens a dropdown with
   * the Default form + each variant. Picking emits {@link VariantPicked}
   * with the override ID, or null for the CodeGen Angular default.
   *
   * Shape is intentionally minimal — Generic doesn't depend on the
   * resolver row type. Hosts shape their data into this. See
   * {@link VariantPickerItem} on the container for the canonical shape.
   */
  @Input() Variants: Array<{ ID: string; Label: string; Scope: 'User' | 'Role' | 'Global'; Status: 'Active' | 'Pending' | 'Inactive' }> = [];

  /** Dynamic toolbar items registered by FormComponent or BaseFormPanels */
  @Input() RegisteredItems: FormToolbarItemConfig[] = [];

  /** Toolbar item property overrides */
  @Input() ItemOverrides: ReadonlyMap<string, Partial<FormToolbarItemConfig>> | null = null;

  /** Reference to the form component instance for event payloads */
  @Input() FormComponent: unknown = null;

  /** The currently-applied variant ID, or null when the Default form is active. */
  @Input() CurrentVariantID: string | null = null;

  // ---- Outputs ----

  /** Emitted when any toolbar item (standard or custom) is clicked */
  @Output() ToolbarItemClick = new EventEmitter<FormToolbarItemClickEventArgs>();

  /** Emitted for all navigation actions (record links, hierarchy clicks, etc.) */
  @Output() Navigate = new EventEmitter<FormNavigationEvent>();

  /** Request to enter or exit edit mode */
  @Output() EditModeChange = new EventEmitter<boolean>();

  /** Emitted BEFORE save - can be cancelled by setting event.Cancel = true */
  @Output() BeforeSave = new EventEmitter<BeforeSaveEventArgs>();

  /** Request to save the current record */
  @Output() SaveRequested = new EventEmitter<void>();

  /** Emitted BEFORE cancel - can be cancelled by setting event.Cancel = true */
  @Output() BeforeCancel = new EventEmitter<BeforeCancelEventArgs>();

  /** Request to cancel editing and revert changes */
  @Output() CancelRequested = new EventEmitter<void>();

  /** Emitted BEFORE delete - can be cancelled by setting event.Cancel = true */
  @Output() BeforeDelete = new EventEmitter<BeforeDeleteEventArgs>();

  /** Request to delete the current record */
  @Output() DeleteRequested = new EventEmitter<void>();

  /** Emitted BEFORE refresh - can be cancelled by setting event.Cancel = true */
  @Output() BeforeRefresh = new EventEmitter<BeforeRefreshEventArgs>();

  /** Request to refresh the current record from the database */
  @Output() RefreshRequested = new EventEmitter<void>();

  /** Request to toggle favorite status */
  @Output() FavoriteToggled = new EventEmitter<void>();

  /** Emitted BEFORE history view - can be cancelled by setting event.Cancel = true */
  @Output() BeforeHistoryView = new EventEmitter<BeforeHistoryViewEventArgs>();

  /** Request to show record change history */
  @Output() HistoryRequested = new EventEmitter<void>();

  /** Emitted BEFORE list management - can be cancelled by setting event.Cancel = true */
  @Output() BeforeListManagement = new EventEmitter<BeforeListManagementEventArgs>();

  /** Request to show list management */
  @Output() ListManagementRequested = new EventEmitter<void>();

  /** Emitted when the Tags button is clicked */
  @Output() TagsPanelToggled = new EventEmitter<void>();

  /** Emitted when the Attachments button is clicked */
  @Output() AttachmentsPanelToggled = new EventEmitter<void>();

  /** Request to show dirty field changes */
  @Output() ShowChangesRequested = new EventEmitter<void>();

  /**
   * Emitted when the user picks an item from the form-variant dropdown.
   * Payload is the override ID for a specific variant, or `null` when the
   * user picks the "Default form" row (CodeGen / Angular fallback).
   */
  @Output() VariantPicked = new EventEmitter<string | null>();

  /** Emitted when a custom toolbar button is clicked */
  @Output() CustomButtonClick = new EventEmitter<CustomToolbarButtonClickEventArgs>();

  // Section control outputs
  @Output() FilterChange = new EventEmitter<string>();
  @Output() ExpandAllRequested = new EventEmitter<void>();
  @Output() CollapseAllRequested = new EventEmitter<void>();
  @Output() ShowEmptyFieldsChange = new EventEmitter<boolean>();
  @Output() WidthModeChange = new EventEmitter<FormWidthMode>();
  @Output() ResetSectionOrderRequested = new EventEmitter<void>();
  @Output() ManageSectionsRequested = new EventEmitter<void>();

  /** Emitted before the clone slide-in opens. Set `Cancel` to handle cloning yourself. */
  @Output() BeforeClone = new EventEmitter<BeforeCloneEventArgs>();

  /** Emitted after the clone slide-in commits a clone of this record. */
  @Output() CloneCompleted = new EventEmitter<CloneCompletedEvent>();

  // ---- Internal state ----
  ShowDeleteDialog = false;
  ShowDiscardDialog = false;

  /** Computed descendant tree for breadcrumb display */
  DescendantTree: IsaRelatedItem[] = [];
  private _lastRecordForChains: BaseEntity | null = null;
  private _chainsLoading = false;

  // ---- Lifecycle ----

  ngOnInit(): void {
    this.recordRefresh?.Refreshed$.pipe(takeUntil(this.destroy$)).subscribe(() => {
      this.InvalidateHierarchy();
    });
  }

  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
  }

  ngDoCheck(): void {
    // Inputs and record state may have changed since the last pass: resolve the items afresh.
    this._resolvedItems = null;
    if (this._formRef) {
      this.syncFromFormRef();
    }
    this.checkDescendantChains();
    this.checkCloneCapability();
    this.checkPinsChanged();
  }

  /** Redraws when the saved pins changed elsewhere (another open form, another tab). */
  private checkPinsChanged(): void {
    const before = this._pinsRaw;
    this.readPins();
    if (this._pinsRaw !== before) {
      this.cdr.markForCheck();
    }
  }

  /**
   * Sync toolbar state from the legacy form reference.
   * Only active when [Form] is set (backward-compat mode).
   */
  private syncFromFormRef(): void {
    const ref = this._formRef as Record<string, unknown>;
    const rec = ref['record'] as BaseEntity | undefined;
    let changed = false;

    if (rec && rec !== this.Record) {
      this.Record = rec;
      this.EntityInfo = rec.EntityInfo;
      changed = true;
    }

    if (rec) {
      const dirty = rec.Dirty;
      if (dirty !== this.IsDirty) {
        this.IsDirty = dirty;
        changed = true;
      }
      if (dirty) {
        const dirtyNames = rec.Fields.filter(f => f.Dirty).map(f => f.Name);
        if (dirtyNames.length !== this.DirtyFieldNames.length) {
          this.DirtyFieldNames = dirtyNames;
          changed = true;
        }
      }
    }

    const editMode = !!ref['EditMode'];
    if (editMode !== this.EditMode) { this.EditMode = editMode; changed = true; }

    const canEdit = !!ref['UserCanEdit'];
    if (canEdit !== this.UserCanEdit) { this.UserCanEdit = canEdit; changed = true; }

    const canDelete = !!ref['UserCanDelete'];
    if (canDelete !== this.UserCanDelete) { this.UserCanDelete = canDelete; changed = true; }

    const isFavorite = !!ref['IsFavorite'];
    if (isFavorite !== this.IsFavorite) { this.IsFavorite = isFavorite; changed = true; }

    const favDone = !!ref['FavoriteInitDone'];
    if (favDone !== this.FavoriteInitDone) { this.FavoriteInitDone = favDone; changed = true; }

    if (changed) {
      this.cdr.markForCheck();
    }
  }

  /** Whether entity tracks record changes (for history button) */
  get TracksChanges(): boolean {
    return this.EntityInfo?.TrackRecordChanges === true;
  }

  /** IS-A parent chain for breadcrumb display */
  get ParentChain(): EntityInfo[] {
    if (!this.EntityInfo) return [];
    return this.EntityInfo.ParentChain.slice().reverse();
  }

  /** Whether this entity has parent entities (IS-A child) */
  get HasParentEntities(): boolean {
    return this.ParentChain.length > 0;
  }

  /** Child entity types from metadata (all possible subtypes) */
  get ChildEntities(): EntityInfo[] {
    return this.EntityInfo?.ChildEntities ?? [];
  }

  /** Whether this entity has child entity types (IS-A parent) */
  get HasChildEntities(): boolean {
    return this.ChildEntities.length > 0;
  }

  /**
   * The actual loaded IS-A child chain for the current record.
   * Walks Record.ISAChild → ISAChild.ISAChild → ... collecting each child entity.
   * This differs from ChildEntities (metadata) because it represents the SPECIFIC
   * child type that exists for THIS record, not all possible subtypes.
   *
   * For overlapping subtype parents, this is empty (ISAChild returns null) —
   * use OverlappingChildren instead.
   */
  get ChildChain(): BaseEntity[] {
    if (!this.Record) return [];
    const chain: BaseEntity[] = [];
    let current = this.Record.ISAChild;
    while (current) {
      chain.push(current);
      current = current.ISAChild;
    }
    return chain;
  }

  /** Whether this record has a loaded IS-A child entity */
  get HasLoadedChild(): boolean {
    return this.Record?.ISAChild != null;
  }

  /**
   * For overlapping subtype parents (AllowMultipleSubtypes = true), returns the
   * list of child entity type names that have records for this PK.
   * Populated by InitializeChildEntity() during record load.
   */
  get OverlappingChildren(): { entityName: string }[] {
    return this.Record?.ISAChildren ?? [];
  }

  /** Whether the current record has overlapping child types discovered */
  get HasOverlappingChildren(): boolean {
    return this.OverlappingChildren.length > 0;
  }

  /** Whether this entity is part of any IS-A hierarchy (parent or child side) */
  get IsInHierarchy(): boolean {
    return this.HasParentEntities || this.HasLoadedChild || this.HasOverlappingChildren || this.DescendantTree.length > 0;
  }

  /** Display-friendly names of dirty fields for the edit banner */
  get DirtyFieldDisplayNames(): string[] {
    if (!this.Record?.EntityInfo || this.DirtyFieldNames.length === 0) return [];
    return this.DirtyFieldNames.map(name => {
      const field = this.Record.EntityInfo.Fields.find(f => f.Name === name);
      return field?.DisplayNameOrName ?? name;
    });
  }

  /**
   * Display name for the edit banner.
   *
   * The Name field is readable by the current user in almost every case, but it is an ordinary
   * field and field-level security can deny it. `BaseEntity.Get()` THROWS on a denied field, and
   * this getter runs on every change-detection cycle for the toolbar that sits on top of every
   * form — so an unguarded read here does not hide a title, it takes the whole form down. Fall
   * back to the primary key, which is unrestrictable by construction.
   */
  get RecordDisplayName(): string {
    if (!this.Record) return '';
    const info = this.Record.EntityInfo;
    if (info?.NameField && info.IsFieldReadableByUser(info.NameField.Name, this.ProviderToUse?.CurrentUser)) {
      const name = this.Record.Get(info.NameField.Name);
      if (name) return String(name);
    }
    return this.Record.PrimaryKey.ToConcatenatedString();
  }

  // ---- Descendant Chain Computation ----

  /**
   * Force a recompute of the IS-A descendant breadcrumb. Needed after
   * in-place record refresh because the Record object identity does not
   * change, so {@link CheckDescendantChains} would otherwise skip.
   */
  public InvalidateHierarchy(): void {
    this._lastRecordForChains = null;
    this.computeDescendantChains();
    this.cdr.markForCheck();
  }

  /**
   * Check if descendant chains need recomputation (called from DoCheck).
   * Only triggers async computation when the record identity changes.
   */
  private checkDescendantChains(): void {
    if (!this.Record) {
      if (this.DescendantTree.length > 0) {
        this.DescendantTree = [];
        this._lastRecordForChains = null;
        this.cdr.markForCheck();
      }
      return;
    }
    if (this.Record !== this._lastRecordForChains && !this._chainsLoading) {
      this.computeDescendantChains();
    }
  }

  /**
   * Asynchronously discover all IS-A descendants and convert to chains
   * for breadcrumb display. Each chain is a root-to-leaf path of entity names.
   */
  private computeDescendantChains(): void {
    this._lastRecordForChains = this.Record;

    if (!this.Record?.EntityInfo?.IsParentType) {
      this.DescendantTree = [];
      return;
    }

    this._chainsLoading = true;

    DiscoverISADescendants(this.Record, this.ProviderToUse).then(descendants => {
      this.DescendantTree = BuildDescendantTree(descendants);
      this._chainsLoading = false;
      this.cdr.markForCheck();
    }).catch(() => {
      this.DescendantTree = [];
      this._chainsLoading = false;
      this.cdr.markForCheck();
    });
  }

  /**
   * Navigate to a descendant entity record in the IS-A hierarchy.
   */
  OnDescendantBadgeClick(entityName: string, event: MouseEvent): void {
    if (!this.Record) return;
    this.Navigate.emit({
      Kind: 'entity-hierarchy',
      EntityName: entityName,
      PrimaryKey: this.Record.PrimaryKey,
      Direction: 'child'
    });
  }

  // ---- Actions ----

  OnEdit(): void {
    if (this.dispatchToFormRef('StartEditMode')) return;
    this.EditModeChange.emit(true);
  }

  OnSave(): void {
    // Use microtask timing to avoid ExpressionChangedAfterItHasBeenCheckedError
    Promise.resolve().then(() => {
      // Emit Before event - handler can cancel by setting event.Cancel = true
      const beforeEvent = new BeforeSaveEventArgs(true);
      this.BeforeSave.emit(beforeEvent);
      if (beforeEvent.Cancel) return;

      if (this.dispatchToFormRef('SaveRecord', true)) return;
      this.SaveRequested.emit();
    });
  }

  OnCancel(): void {
    // If there are unsaved changes, show confirmation dialog
    if (this.IsDirty) {
      this.ShowDiscardDialog = true;
      this.cdr.markForCheck();
      return;
    }
    // No changes - cancel immediately
    this.emitCancel();
  }

  OnDiscardConfirm(): void {
    this.ShowDiscardDialog = false;
    this.emitCancel();
    this.cdr.markForCheck();
  }

  OnDiscardCancel(): void {
    this.ShowDiscardDialog = false;
    this.cdr.markForCheck();
  }

  private emitCancel(): void {
    // Emit Before event - handler can cancel by setting event.Cancel = true
    const beforeEvent = new BeforeCancelEventArgs();
    this.BeforeCancel.emit(beforeEvent);
    if (beforeEvent.Cancel) return;

    if (this.dispatchToFormRef('CancelEdit')) return;
    this.CancelRequested.emit();
  }

  OnDeleteClick(): void {
    this.ShowDeleteDialog = true;
    this.cdr.markForCheck();
  }

  OnDeleteConfirm(): void {
    this.ShowDeleteDialog = false;

    // Emit Before event - handler can cancel by setting event.Cancel = true
    const beforeEvent = new BeforeDeleteEventArgs();
    this.BeforeDelete.emit(beforeEvent);
    if (beforeEvent.Cancel) {
      this.cdr.markForCheck();
      return;
    }

    if (this.dispatchToFormRef('OnDeleteRequested')) {
      this.cdr.markForCheck();
      return;
    }
    this.DeleteRequested.emit();
    this.cdr.markForCheck();
  }

  OnDeleteCancel(): void {
    this.ShowDeleteDialog = false;
    this.cdr.markForCheck();
  }

  OnRefresh(): void {
    if (this.IsRefreshing || this.IsSaving) return;

    // Emit Before event - handler can cancel by setting event.Cancel = true
    const beforeEvent = new BeforeRefreshEventArgs();
    this.BeforeRefresh.emit(beforeEvent);
    if (beforeEvent.Cancel) return;

    if (this.dispatchToFormRef('RefreshRecord')) return;
    this.RefreshRequested.emit();
  }

  OnFavoriteToggle(): void {
    if (this.dispatchToFormRef('OnFavoriteToggled')) return;
    this.FavoriteToggled.emit();
  }

  OnHistory(): void {
    // Emit Before event - handler can cancel by setting event.Cancel = true
    const beforeEvent = new BeforeHistoryViewEventArgs();
    this.BeforeHistoryView.emit(beforeEvent);
    if (beforeEvent.Cancel) return;

    if (this.dispatchToFormRef('OnHistoryRequested')) return;
    this.HistoryRequested.emit();
  }

  OnListManagement(): void {
    // Emit Before event - handler can cancel by setting event.Cancel = true
    const beforeEvent = new BeforeListManagementEventArgs();
    this.BeforeListManagement.emit(beforeEvent);
    if (beforeEvent.Cancel) return;

    if (this.dispatchToFormRef('OnListManagementRequested')) return;
    this.ListManagementRequested.emit();
  }

  OnTagsPanel(): void {
    if (this.dispatchToFormRef('HandleTagsPanel')) return;
    this.TagsPanelToggled.emit();
  }

  OnAttachmentsPanel(): void {
    if (this.dispatchToFormRef('HandleAttachmentsPanel')) return;
    this.AttachmentsPanelToggled.emit();
  }

  OnCustomButtonClick(button: CustomToolbarButton): void {
    if (button.Disabled) return;

    this.CustomButtonClick.emit({
      ButtonKey: button.Key,
      Button: button
    });
  }

  /**
   * Resolves all standard and custom toolbar items into their active runtime state,
   * evaluated against the current Record and EditMode.
   */
  public get ResolvedToolbarItems(): ResolvedToolbarItem[] {
    // Many template bindings read this per pass (five per More-menu row); resolve once per pass.
    return (this._resolvedItems ??= this.resolveToolbarItems());
  }

  /** The resolved items for the current change-detection pass; cleared in ngDoCheck. */
  private _resolvedItems: ResolvedToolbarItem[] | null = null;

  private resolveToolbarItems(): ResolvedToolbarItem[] {
    const rawItems: FormToolbarItemConfig[] = [];

    // 1. Standard Built-in Items
    rawItems.push(
      {
        Key: 'edit',
        Text: '',
        Description: 'Edit this Record',
        Icon: 'fa-solid fa-pen-to-square',
        Variant: 'default',
        Mode: 'read',
        Placement: 'actions',
        Order: 10,
        Visible: this.Config.ShowEditButton && this.UserCanEdit,
        Disabled: false,
      },
      {
        Key: 'delete',
        Text: '',
        Description: 'Delete this Record',
        Icon: 'fa-regular fa-trash-can',
        Variant: 'default',
        Mode: 'read',
        Placement: 'actions',
        Order: 20,
        Visible: this.Config.ShowDeleteButton && this.UserCanDelete,
        Disabled: false,
      },
      {
        Key: 'refresh',
        Text: '',
        Description: 'Refresh record from database',
        Icon: 'fa-solid fa-arrows-rotate',
        Variant: 'default',
        Mode: 'read',
        Placement: 'actions',
        Order: 25,
        Visible: this.Config.ShowRefreshButton !== false && (this.Record?.IsSaved ?? false),
        Disabled: this.IsSaving || this.IsRefreshing,
        IsLoading: this.IsRefreshing,
      },
      {
        Key: 'clone',
        Text: '',
        Description: `Clone this ${this.EntityInfo?.DisplayNameOrName ?? 'record'} and the records it owns`,
        Icon: 'fa-solid fa-clone',
        Variant: 'default',
        Mode: 'read',
        Placement: 'actions',
        Order: 15,
        Visible: this.ShowCloneAction,
        Disabled: false,
        CssClass: this.IsClonePanelOpen ? 'active' : '',
      },
      {
        Key: 'favorite',
        Text: '',
        Description: this.IsFavorite ? 'Remove Favorite' : 'Make Favorite',
        Icon: this.IsFavorite ? 'fa-solid fa-star mj-icon--favorite' : 'fa-regular fa-star',
        Variant: 'default',
        Mode: 'read',
        Placement: 'actions',
        Order: 30,
        Visible: this.Config.ShowFavoriteButton && this.FavoriteInitDone,
        Disabled: false,
      },
      {
        Key: 'history',
        Text: '',
        Description: this.VersionCount > 0 ? `${this.VersionCount} version(s) tracked` : 'Record Changes',
        Icon: 'fa-regular fa-clock',
        Badge: this.VersionCount > 0 ? `v${this.VersionCount}` : undefined,
        Variant: 'default',
        Mode: 'read',
        Placement: 'actions',
        Order: 40,
        Visible: this.Config.ShowHistoryButton && this.TracksChanges,
        Disabled: false,
      },
      {
        Key: 'list',
        Text: '',
        Description: this.ListCount > 0 ? `Member of ${this.ListCount} list(s)` : 'Add to a list',
        Icon: 'fa-regular fa-bookmark',
        Badge: this.ListCount > 0 ? this.ListCount : undefined,
        Variant: 'default',
        Mode: 'read',
        Placement: 'actions',
        Order: 50,
        Visible: this.Config.ShowListButton,
        Disabled: false,
      },
      {
        Key: 'tags',
        Text: '',
        Description: this.TagCount > 0 ? `${this.TagCount} tag(s)` : 'View tags',
        Icon: 'fa-solid fa-tags',
        Badge: this.TagCount > 0 ? this.TagCount : undefined,
        Variant: 'default',
        Mode: 'read',
        Placement: 'actions',
        Order: 60,
        Visible: this.Config.ShowTagsButton,
        Disabled: false,
      },
      {
        Key: 'attachments',
        Text: '',
        Description: this.AttachmentCount > 0 ? `${this.AttachmentCount} attachment${this.AttachmentCount === 1 ? '' : 's'}` : 'Attachments',
        Icon: 'fa-solid fa-paperclip',
        Badge: this.AttachmentCount > 0 ? this.AttachmentCount : undefined,
        Variant: 'default',
        Mode: 'read',
        Placement: 'actions',
        Order: 70,
        Visible: this.Config.ShowAttachmentsButton && this.AttachmentsAvailable,
        Disabled: false,
        CssClass: this.IsAttachmentsPanelOpen ? 'active' : '',
      }
    );

    // 2. Legacy Custom Buttons from Config.CustomButtons (if not already registered dynamically)
    if (this.Config.CustomButtons && this.Config.CustomButtons.length > 0) {
      for (const cb of this.Config.CustomButtons) {
        if (!this.RegisteredItems.some(r => r.Key === cb.Key)) {
          rawItems.push({
            Key: cb.Key,
            Text: cb.Name || '',
            Description: cb.Description || '',
            Icon: cb.Icon || '',
            Variant: 'default',
            Mode: 'read',
            Placement: 'actions',
            Order: 100,
            Visible: cb.Visible !== false,
            Disabled: cb.Disabled || false,
            CssClass: cb.CssClass || '',
          });
        }
      }
    }

    // 3. Dynamically Registered Items (from BaseFormComponent / BaseFormPanel)
    if (this.RegisteredItems && this.RegisteredItems.length > 0) {
      for (const item of this.RegisteredItems) {
        const existingIdx = rawItems.findIndex(r => r.Key === item.Key);
        if (existingIdx >= 0) {
          rawItems[existingIdx] = { ...rawItems[existingIdx], ...item };
        } else {
          rawItems.push({ ...item });
        }
      }
    }

    // 4. Resolve states, evaluate predicates, apply overrides
    const resolved: ResolvedToolbarItem[] = [];
    const standardKeys: Set<string> = new Set(['edit', 'delete', 'refresh', 'clone', 'favorite', 'history', 'list', 'tags', 'attachments']);

    for (const item of rawItems) {
      const overrides = this.ItemOverrides?.get(item.Key);
      const merged: FormToolbarItemConfig = overrides ? { ...item, ...overrides } : item;

      // Mode check
      const mode = merged.Mode ?? 'read';
      if (mode === 'read' && this.EditMode) continue;
      if (mode === 'edit' && !this.EditMode) continue;

      // Visibility evaluation
      let visible = true;
      if (typeof merged.Visible === 'function') {
        try {
          visible = merged.Visible(this.Record, this.EditMode);
        } catch {
          visible = false;
        }
      } else if (typeof merged.Visible === 'boolean') {
        visible = merged.Visible;
      }
      if (!visible) continue;

      // Disabled evaluation
      let disabled = false;
      let disabledReason: string | undefined;
      if (typeof merged.Disabled === 'function') {
        try {
          const res = merged.Disabled(this.Record, this.EditMode);
          if (typeof res === 'string') {
            disabled = true;
            disabledReason = res;
          } else {
            disabled = !!res;
          }
        } catch {
          disabled = true;
        }
      } else if (typeof merged.Disabled === 'string') {
        disabled = true;
        disabledReason = merged.Disabled;
      } else if (typeof merged.Disabled === 'boolean') {
        disabled = merged.Disabled;
      }

      // Loading evaluation
      let isLoading = false;
      if (typeof merged.IsLoading === 'function') {
        try {
          isLoading = merged.IsLoading(this.Record, this.EditMode);
        } catch {
          isLoading = false;
        }
      } else if (typeof merged.IsLoading === 'boolean') {
        isLoading = merged.IsLoading;
      }

      // Badge evaluation
      let badge: string | number | undefined;
      if (typeof merged.Badge === 'function') {
        try {
          const b = merged.Badge(this.Record);
          badge = b != null ? b : undefined;
        } catch {
          badge = undefined;
        }
      } else if (merged.Badge != null) {
        badge = merged.Badge;
      }

      const description = disabled && disabledReason ? disabledReason : (merged.Description ?? '');
      const isStandard = standardKeys.has(merged.Key);

      resolved.push({
        Key: merged.Key,
        Text: merged.Text ?? '',
        Description: description,
        Icon: merged.Icon ?? '',
        Variant: merged.Variant ?? 'default',
        Mode: mode,
        Placement: merged.Placement ?? 'actions',
        Order: merged.Order ?? 100,
        Visible: true,
        Disabled: disabled,
        DisabledReason: disabledReason,
        Badge: badge,
        IsLoading: isLoading,
        CssClass: merged.CssClass ?? '',
        IsStandard: isStandard,
        MenuLabel: merged.MenuLabel || merged.Text || (isStandard ? STANDARD_MENU_LABELS[merged.Key] : '') || merged.Description || merged.Key,
        Pinnable: merged.Pinnable ?? (isStandard && merged.Key !== 'edit'),
        Config: merged,
      });
    }

    return resolved.sort((a, b) => a.Order - b.Order);
  }

  public get ResolvedActionItems(): ResolvedToolbarItem[] {
    return this.ResolvedToolbarItems.filter(item => item.Placement === 'actions');
  }

  public get ResolvedEditBeforeSaveItems(): ResolvedToolbarItem[] {
    return this.ResolvedActionItems.filter(item => (item.Order ?? 100) < 50);
  }

  public get ResolvedEditAfterSaveItems(): ResolvedToolbarItem[] {
    return this.ResolvedActionItems.filter(item => (item.Order ?? 100) >= 50);
  }

  public get ResolvedRightItems(): ResolvedToolbarItem[] {
    return this.ResolvedToolbarItems.filter(item => item.Placement === 'right');
  }

  // ── Pinned actions and the More menu ────────────────────────────

  /** Whether the More menu is open. */
  public MoreMenuOpen = false;

  /** Whether the View menu (section and layout controls) is open. */
  public ViewMenuOpen = false;

  /** Last raw pins setting read from UserInfoEngine, and its parse, so each change detection pass doesn't re-parse. */
  private _pinsRaw: string | undefined;
  private _pinsParsed: string[] | null = null;
  /** Pins set in this session when no user settings are available (tests, anonymous hosts). */
  private _localPins: string[] | null = null;

  /** The maximum number of pinned buttons, the same for every user. */
  public get MaxPinnedActions(): number {
    return Math.max(0, this.Config.MaxPinnedActions ?? 3);
  }

  /**
   * Keys the user pinned, in their order, or the configured defaults until they choose. Read from
   * UserInfoEngine on every pass (pending debounced writes included), so every open form agrees.
   * May include actions this form doesn't offer; those neither render nor use a slot here.
   */
  public get PinnedKeys(): string[] {
    return this.readPins() ?? this._localPins ?? this.Config.DefaultPinnedActions ?? [...DEFAULT_PINNED_TOOLBAR_ACTIONS];
  }

  /** Read-mode actions that always render as buttons: Edit and custom items that are not pinnable. */
  public get InlineActionItems(): ResolvedToolbarItem[] {
    return this.ResolvedActionItems.filter(item => !item.Pinnable);
  }

  /** Pinned actions this form offers, in pin order, up to MaxPinnedActions. */
  public get PinnedActionItems(): ResolvedToolbarItem[] {
    const byKey = new Map(this.MoreMenuItems.map(i => [i.Key, i]));
    return this.PinnedKeys
      .map(k => byKey.get(k))
      .filter((i): i is ResolvedToolbarItem => !!i)
      .slice(0, this.MaxPinnedActions);
  }

  /** Pinnable actions listed in the More menu, Delete excluded (it has its own row). */
  public get MoreMenuItems(): ResolvedToolbarItem[] {
    return this.ResolvedActionItems.filter(i => i.Pinnable && i.Key !== 'delete');
  }

  /** The Delete action, shown last in the More menu, unless a host made it an inline button. */
  public get DeleteMenuItem(): ResolvedToolbarItem | undefined {
    return this.ResolvedActionItems.find(i => i.Key === 'delete' && i.Pinnable);
  }

  public get ShowMoreMenu(): boolean {
    return this.MoreMenuItems.length > 0 || !!this.DeleteMenuItem;
  }

  /** Whether the action is pinned and shown as a button on this form. */
  public IsPinned(key: string): boolean {
    return this.PinnedActionItems.some(i => i.Key === key);
  }

  /** Whether another action can be pinned; counts only the pinned buttons this form shows. */
  public get CanPinMore(): boolean {
    return this.PinnedActionItems.length < this.MaxPinnedActions;
  }

  /**
   * Pins or unpins an action for this user and saves the choice. Pins for actions this form
   * doesn't offer are kept, so they come back on forms that do.
   */
  public TogglePin(key: string, event?: Event): void {
    event?.stopPropagation();
    const pins = [...this.PinnedKeys];
    if (this.IsPinned(key)) {
      pins.splice(pins.indexOf(key), 1);
    } else if (this.CanPinMore) {
      if (!pins.includes(key)) pins.push(key);
    } else {
      return;
    }
    this.writePins(pins);
    this.cdr.markForCheck();
  }

  private static nextMenuId = 0;
  /** Prefix for the More and View panels' ids, unique per toolbar, for the triggers' aria-controls. */
  public readonly MenuIdPrefix = `mj-forms-toolbar-${++MjFormToolbarComponent.nextMenuId}`;

  public ToggleMoreMenu(): void {
    this.MoreMenuOpen = !this.MoreMenuOpen;
    this.ViewMenuOpen = false;
    this.cdr.markForCheck();
    if (this.MoreMenuOpen) this.focusFirstIn(`#${this.MenuIdPrefix}-more`);
  }

  public ToggleViewMenu(): void {
    this.ViewMenuOpen = !this.ViewMenuOpen;
    this.MoreMenuOpen = false;
    this.cdr.markForCheck();
    // The section search if there is one, otherwise the first control.
    if (this.ViewMenuOpen) this.focusFirstIn(`#${this.MenuIdPrefix}-view`);
  }

  /** Moves focus into a just-opened panel, once it has rendered, so keyboard users land in it. */
  private focusFirstIn(panelSelector: string): void {
    setTimeout(() => {
      const panel = this.host.nativeElement.querySelector(panelSelector) as HTMLElement | null;
      const first = panel?.querySelector('input, button:not([disabled])') as HTMLElement | null;
      first?.focus();
    });
  }

  /** Runs a More-menu item and closes the menu. */
  public OnMenuItemClick(item: ResolvedToolbarItem, event: MouseEvent): void {
    this.MoreMenuOpen = false;
    void this.OnToolbarItemClick(item, event);
  }

  public CloseMenus(): void {
    if (this.MoreMenuOpen || this.ViewMenuOpen || this.VariantMenuOpen) {
      this.MoreMenuOpen = false;
      this.ViewMenuOpen = false;
      this.VariantMenuOpen = false;
      this.cdr.markForCheck();
    }
  }

  /** Whether the View menu has anything to show. */
  public get ShowViewMenu(): boolean {
    const sections = !!this.Config.ShowSectionControls && (
      !!this.Config.ShowSectionFilter ||
      this.ShowExpandCollapseAll ||
      !!this.Config.ShowSectionManager ||
      this.HasCustomSectionOrder ||
      !!this.Config.ShowWidthToggle
    );
    return sections || this.ShowVariantPickerButton;
  }

  @HostListener('document:click', ['$event'])
  OnDocumentClick(event: MouseEvent): void {
    if (!this.host.nativeElement.contains(event.target as Node)) {
      this.CloseMenus();
    }
  }

  @HostListener('document:keydown.escape')
  OnEscape(): void {
    // Closing a panel that holds focus returns focus to the button that opened it.
    const open = this.MoreMenuOpen ? 'more' : this.ViewMenuOpen ? 'view' : null;
    const focusInside = open !== null && this.host.nativeElement.contains(document.activeElement);
    this.CloseMenus();
    if (open && focusInside) {
      (this.host.nativeElement.querySelector(`[data-menu-trigger="${open}"]`) as HTMLElement | null)?.focus();
    }
  }

  private readPins(): string[] | null {
    let raw: string | undefined;
    try {
      raw = UserInfoEngine.Instance.GetSetting(TOOLBAR_PINS_SETTING_KEY);
    } catch {
      return null;
    }
    if (raw !== this._pinsRaw) {
      this._pinsRaw = raw;
      this._pinsParsed = null;
      if (raw) {
        try {
          const parsed = JSON.parse(raw) as { Pinned?: unknown };
          this._pinsParsed = Array.isArray(parsed.Pinned) ? parsed.Pinned.filter((k): k is string => typeof k === 'string') : null;
        } catch {
          this._pinsParsed = null;
        }
      }
    }
    return this._pinsParsed;
  }

  private writePins(pins: string[]): void {
    this._localPins = pins;
    try {
      UserInfoEngine.Instance.SetSettingDebounced(TOOLBAR_PINS_SETTING_KEY, JSON.stringify({ Version: 1, Pinned: pins }));
    } catch {
      // No user context (tests, anonymous hosts): the pins still apply for this session.
    }
  }

  public async OnToolbarItemClick(item: ResolvedToolbarItem, event: MouseEvent): Promise<void> {
    if (item.Disabled || item.IsLoading) {
      return;
    }

    const clickArgs: FormToolbarItemClickEventArgs = {
      ItemKey: item.Key,
      Item: item.Config,
      Record: this.Record,
      EditMode: this.EditMode,
      FormComponent: this.FormComponent,
      Cancel: false
    };

    if (item.IsStandard) {
      switch (item.Key) {
        case 'edit':
          this.OnEdit();
          break;
        case 'delete':
          this.OnDeleteClick();
          break;
        case 'refresh':
          this.OnRefresh();
          break;
        case 'favorite':
          this.OnFavoriteToggle();
          break;
        case 'history':
          this.OnHistory();
          break;
        case 'list':
          this.OnListManagement();
          break;
        case 'tags':
          this.OnTagsPanel();
          break;
        case 'attachments':
          this.OnAttachmentsPanel();
          break;
        case 'clone':
          this.OnClone();
          break;
      }
    }

    this.ToolbarItemClick.emit(clickArgs);
    this.CustomButtonClick.emit({
      ButtonKey: item.Key,
      Button: {
        Key: item.Key,
        Name: item.Text,
        Description: item.Description,
        Icon: item.Icon,
        Visible: item.Visible,
        Disabled: item.Disabled,
        CssClass: item.CssClass
      }
    });

    if (!clickArgs.Cancel && item.Config.OnClick) {
      try {
        await item.Config.OnClick(clickArgs);
      } catch (err) {
        console.error(`[FormToolbar] Error executing OnClick for toolbar item '${item.Key}':`, err);
      }
    }
  }

  // ── Record cloning ──────────────────────────────────────────────

  /** Whether the clone slide-in is open. */
  public IsClonePanelOpen = false;

  /** Whether the server said this user may clone records of the current entity. */
  public CanCloneEntity = false;

  /** The entity name the last clone capability check ran for. */
  private _cloneCheckedEntity: string | null = null;

  /** True when the Clone action should render for the current record. */
  public get ShowCloneAction(): boolean {
    return !!this.Config.ShowCloneButton && this.CanCloneEntity && !!this.Record?.IsSaved;
  }

  /** Opens the clone slide-in, unless a `BeforeClone` handler cancels. */
  OnClone(): void {
    const beforeEvent = new BeforeCloneEventArgs();
    this.BeforeClone.emit(beforeEvent);
    if (beforeEvent.Cancel) return;

    this.IsClonePanelOpen = true;
    this.cdr.markForCheck();
  }

  OnClonePanelVisibleChange(visible: boolean): void {
    this.IsClonePanelOpen = visible;
    this.cdr.markForCheck();
  }

  OnCloneCompleted(event: CloneCompletedEvent): void {
    this.CloneCompleted.emit(event);
  }

  /** Turns the clone widget's navigation request into the toolbar's own `Navigate` event. */
  OnCloneNavigate(event: CloneNavigationEvent): void {
    const entityInfo = this.ProviderToUse?.EntityByName(event.EntityName);
    this.Navigate.emit({
      Kind: 'record',
      EntityName: event.EntityName,
      PrimaryKey: CompositeKey.FromURLSegment(entityInfo, event.RecordKey),
      OpenInNewTab: true,
    });
  }

  /**
   * Asks `RecordClone.Describe` (cached per entity per session) once per entity whether the
   * user may clone it. Entities whose `Configuration.Clone.Enabled` is not true are skipped
   * without a server call.
   */
  private checkCloneCapability(): void {
    const entityName = this.Config.ShowCloneButton ? this.Record?.EntityInfo?.Name ?? null : null;
    if (entityName === this._cloneCheckedEntity) return;
    this._cloneCheckedEntity = entityName;
    this.CanCloneEntity = false;
    this.IsClonePanelOpen = false; // a panel opened for the previous entity must not reopen itself for this one

    if (!entityName || this.Record?.EntityInfo?.CloneConfig?.Enabled !== true) return;

    this.cloneService
      .DescribeRecord({ EntityName: entityName }, this.ProviderToUse)
      .then((describe) => {
        if (this._cloneCheckedEntity !== entityName) return;
        this.CanCloneEntity = describe.CanClone;
        this.cdr.markForCheck();
      })
      .catch(() => {
        // A failed capability check hides the action; the server re-checks on every clone.
      });
  }

  OnShowChanges(): void {
    if (this.dispatchToFormRef('ShowChanges')) return;
    this.ShowChangesRequested.emit();
  }

  // ── Form-variant picker ─────────────────────────────────────────

  /** Whether the variant-picker dropdown is currently open. */
  public VariantMenuOpen = false;

  /**
   * True iff the toolbar should render the variant-picker button.
   *
   * Note the threshold is `>= 1`, NOT `> 1`. The picker menu always
   * includes the "Default form" row (CodeGen / Angular fallback) — that
   * row isn't in {@link Variants}; it's rendered unconditionally as the
   * first row inside the menu. So any single variant still yields a real
   * choice (Default vs that variant) and the picker should appear. The
   * inline-strip implementation that this replaces used `> 1` and
   * therefore hid the picker for entities with exactly one override,
   * which made that override unreachable from the UI.
   */
  public get ShowVariantPickerButton(): boolean {
    return !!this.Config.ShowFormVariantPicker && (this.Variants?.length ?? 0) >= 1;
  }

  /** Label for the currently-active variant, or "Default form" when none. */
  public get CurrentVariantLabel(): string {
    const v = this.Variants?.find(x => UUIDsEqual(x.ID, this.CurrentVariantID));
    return v?.Label ?? 'Default form';
  }

  /** Compact subtitle for a variant menu row: "Scope · Status". */
  public VariantSubtitle(v: { Scope: string; Status: string }): string {
    return `${v.Scope} · ${v.Status}`;
  }

  public ToggleVariantMenu(): void {
    this.VariantMenuOpen = !this.VariantMenuOpen;
    this.cdr.markForCheck();
  }

  public CloseVariantMenu(): void {
    if (this.VariantMenuOpen) {
      this.VariantMenuOpen = false;
      this.cdr.markForCheck();
    }
  }

  /**
   * User picked a row in the variant menu. Closes the menu and emits
   * `VariantPicked` (null → "Default form" / CodeGen Angular; UUID →
   * specific override). No-op when the picked value matches the current.
   */
  public OnVariantClick(variantID: string | null): void {
    this.VariantMenuOpen = false;
    this.ViewMenuOpen = false;
    if (variantID === this.CurrentVariantID) {
      this.cdr.markForCheck();
      return;
    }
    this.VariantPicked.emit(variantID);
  }

  /**
   * Try to call a method on the legacy form reference.
   * Returns true if the method was found and called, false otherwise.
   */
  private dispatchToFormRef(methodName: string, ...args: unknown[]): boolean {
    if (!this._formRef) return false;
    const ref = this._formRef as Record<string, unknown>;
    const method = ref[methodName];
    if (typeof method === 'function') {
      (method as (...a: unknown[]) => unknown).call(this._formRef, ...args);
      return true;
    }
    return false;
  }

  /**
   * Navigate to a parent entity record in the IS-A hierarchy.
   */
  OnParentBadgeClick(parentEntity: EntityInfo, event: MouseEvent): void {
    if (!this.Record) return;
    this.Navigate.emit({
      Kind: 'entity-hierarchy',
      EntityName: parentEntity.Name,
      PrimaryKey: this.Record.PrimaryKey,
      Direction: 'parent'
    });
  }

  /**
   * Navigate to a child entity type list view.
   */
  OnChildEntityClick(childEntity: EntityInfo): void {
    if (!this.Record) return;
    this.Navigate.emit({
      Kind: 'child-entity-type',
      ChildEntityName: childEntity.Name,
      ParentEntityName: this.EntityInfo!.Name,
      ParentRecordId: this.Record.PrimaryKey.ToConcatenatedString()
    });
  }

  /**
   * Navigate to a loaded child entity record in the IS-A hierarchy.
   * The child shares the same primary key as the parent (IS-A inheritance).
   */
  OnChildBadgeClick(childEntity: BaseEntity, event: MouseEvent): void {
    if (!this.Record) return;
    this.Navigate.emit({
      Kind: 'entity-hierarchy',
      EntityName: childEntity.EntityInfo.Name,
      PrimaryKey: this.Record.PrimaryKey,
      Direction: 'child'
    });
  }

  /**
   * Navigate to an overlapping child entity record.
   * Used when the parent has AllowMultipleSubtypes = true and multiple child
   * types coexist for the same PK.
   */
  OnOverlappingChildClick(childEntityName: string, event: MouseEvent): void {
    if (!this.Record) return;
    this.Navigate.emit({
      Kind: 'entity-hierarchy',
      EntityName: childEntityName,
      PrimaryKey: this.Record.PrimaryKey,
      Direction: 'child'
    });
  }

  // ---- Section Controls ----

  OnFilterInput(event: Event): void {
    const input = event.target as HTMLInputElement;
    this.FilterChange.emit(input.value);
  }

  OnClearFilter(): void {
    this.FilterChange.emit('');
  }

  OnExpandAll(): void {
    this.ExpandAllRequested.emit();
  }

  OnCollapseAll(): void {
    this.CollapseAllRequested.emit();
  }

  OnToggleEmptyFields(): void {
    this.ShowEmptyFieldsChange.emit(!this.ShowEmptyFields);
  }

  OnToggleWidthMode(): void {
    const newMode: FormWidthMode = this.WidthMode === 'centered' ? 'full-width' : 'centered';
    this.WidthModeChange.emit(newMode);
  }

  OnResetSectionOrder(): void {
    this.ResetSectionOrderRequested.emit();
  }

  OnManageSections(): void {
    this.ManageSectionsRequested.emit();
  }
}
