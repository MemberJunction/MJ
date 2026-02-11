import { Component, Input, Output, EventEmitter, ChangeDetectionStrategy, TemplateRef, ChangeDetectorRef, inject, DoCheck } from '@angular/core';
import { BaseEntity, EntityInfo, CompositeKey } from '@memberjunction/core';
import { FormToolbarConfig, DEFAULT_TOOLBAR_CONFIG } from '../types/toolbar-config';
import { FormNavigationEvent } from '../types/navigation-events';
import { FormWidthMode, FormContext } from '../types/form-types';
import {
  BeforeSaveEventArgs,
  BeforeDeleteEventArgs,
  BeforeCancelEventArgs,
  BeforeHistoryViewEventArgs,
  BeforeListManagementEventArgs,
  CustomToolbarButtonClickEventArgs,
  CustomToolbarButton
} from '../types/form-events';

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
export class MjFormToolbarComponent implements DoCheck {
  private cdr = inject(ChangeDetectorRef);

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

  /** Entity info for IS-A hierarchy and metadata */
  @Input() EntityInfo: EntityInfo | null = null;

  /** Toolbar configuration controlling visibility and behavior */
  @Input() Config: FormToolbarConfig = DEFAULT_TOOLBAR_CONFIG;

  /** Whether to show the toolbar in a saving/loading state */
  @Input() IsSaving = false;

  // Section controls inputs
  @Input() VisibleSectionCount = 0;
  @Input() TotalSectionCount = 0;
  @Input() ExpandedSectionCount = 0;
  @Input() SearchFilter = '';
  @Input() ShowEmptyFields = false;
  @Input() WidthMode: FormWidthMode = 'centered';
  @Input() HasCustomSectionOrder = false;

  /** Optional template for additional toolbar actions */
  @Input() AdditionalActionsTemplate: TemplateRef<unknown> | null = null;

  // ---- Outputs ----

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

  /** Request to show dirty field changes */
  @Output() ShowChangesRequested = new EventEmitter<void>();

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

  // ---- Internal state ----
  ShowDeleteDialog = false;
  ShowDiscardDialog = false;

  // ---- Lifecycle ----

  ngDoCheck(): void {
    if (!this._formRef) return;
    this.SyncFromFormRef();
  }

  /**
   * Sync toolbar state from the legacy form reference.
   * Only active when [Form] is set (backward-compat mode).
   */
  private SyncFromFormRef(): void {
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

  /** Whether this entity is part of any IS-A hierarchy (parent or child side) */
  get IsInHierarchy(): boolean {
    return this.HasParentEntities || this.HasLoadedChild;
  }

  /** Display-friendly names of dirty fields for the edit banner */
  get DirtyFieldDisplayNames(): string[] {
    if (!this.Record?.EntityInfo || this.DirtyFieldNames.length === 0) return [];
    return this.DirtyFieldNames.map(name => {
      const field = this.Record.EntityInfo.Fields.find(f => f.Name === name);
      return field?.DisplayNameOrName ?? name;
    });
  }

  /** Display name for the edit banner */
  get RecordDisplayName(): string {
    if (!this.Record) return '';
    const info = this.Record.EntityInfo;
    if (info?.NameField) {
      const name = this.Record.Get(info.NameField.Name);
      if (name) return String(name);
    }
    return this.Record.PrimaryKey.ToConcatenatedString();
  }

  // ---- Actions ----

  OnEdit(): void {
    if (this.DispatchToFormRef('StartEditMode')) return;
    this.EditModeChange.emit(true);
  }

  OnSave(): void {
    // Use microtask timing to avoid ExpressionChangedAfterItHasBeenCheckedError
    Promise.resolve().then(() => {
      // Emit Before event - handler can cancel by setting event.Cancel = true
      const beforeEvent = new BeforeSaveEventArgs(true);
      this.BeforeSave.emit(beforeEvent);
      if (beforeEvent.Cancel) return;

      if (this.DispatchToFormRef('SaveRecord', true)) return;
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
    this.EmitCancel();
  }

  OnDiscardConfirm(): void {
    this.ShowDiscardDialog = false;
    this.EmitCancel();
    this.cdr.markForCheck();
  }

  OnDiscardCancel(): void {
    this.ShowDiscardDialog = false;
    this.cdr.markForCheck();
  }

  private EmitCancel(): void {
    // Emit Before event - handler can cancel by setting event.Cancel = true
    const beforeEvent = new BeforeCancelEventArgs();
    this.BeforeCancel.emit(beforeEvent);
    if (beforeEvent.Cancel) return;

    if (this.DispatchToFormRef('CancelEdit')) return;
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

    if (this.DispatchToFormRef('OnDeleteRequested')) {
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

  OnFavoriteToggle(): void {
    if (this.DispatchToFormRef('OnFavoriteToggled')) return;
    this.FavoriteToggled.emit();
  }

  OnHistory(): void {
    // Emit Before event - handler can cancel by setting event.Cancel = true
    const beforeEvent = new BeforeHistoryViewEventArgs();
    this.BeforeHistoryView.emit(beforeEvent);
    if (beforeEvent.Cancel) return;

    if (this.DispatchToFormRef('OnHistoryRequested')) return;
    this.HistoryRequested.emit();
  }

  OnListManagement(): void {
    // Emit Before event - handler can cancel by setting event.Cancel = true
    const beforeEvent = new BeforeListManagementEventArgs();
    this.BeforeListManagement.emit(beforeEvent);
    if (beforeEvent.Cancel) return;

    if (this.DispatchToFormRef('OnListManagementRequested')) return;
    this.ListManagementRequested.emit();
  }

  OnCustomButtonClick(button: CustomToolbarButton): void {
    if (button.Disabled) return;

    this.CustomButtonClick.emit({
      ButtonKey: button.Key,
      Button: button
    });
  }

  OnShowChanges(): void {
    if (this.DispatchToFormRef('ShowChanges')) return;
    this.ShowChangesRequested.emit();
  }

  /**
   * Try to call a method on the legacy form reference.
   * Returns true if the method was found and called, false otherwise.
   */
  private DispatchToFormRef(methodName: string, ...args: unknown[]): boolean {
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
