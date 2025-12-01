import { Component, Input, Output, EventEmitter, OnChanges, OnInit, SimpleChanges, ChangeDetectorRef, HostListener } from '@angular/core';
import { EntityInfo, EntityFieldInfo, Metadata } from '@memberjunction/core';
import { UserViewEntityExtended, ViewColumnInfo, ViewGridState } from '@memberjunction/core-entities';
import { ViewGridStateConfig, ViewColumnConfig } from '@memberjunction/ng-entity-viewer';

/**
 * Column configuration for the view
 */
export interface ColumnConfig {
  fieldId: string;
  fieldName: string;
  displayName: string;
  visible: boolean;
  width: number | null;
  orderIndex: number;
  field: EntityFieldInfo;
}

/**
 * Event emitted when saving the view
 */
export interface ViewSaveEvent {
  name: string;
  description: string;
  isShared: boolean;
  saveAsNew: boolean;
  columns: ColumnConfig[];
  sortField: string | null;
  sortDirection: 'asc' | 'desc';
  smartFilterEnabled: boolean;
  smartFilterPrompt: string;
}

/**
 * ViewConfigPanelComponent - Sliding panel for configuring view settings
 *
 * Features:
 * - Column visibility and ordering
 * - Sort configuration
 * - View name and description editing
 * - Share settings
 * - Save / Save As New / Cancel actions
 */
@Component({
  selector: 'mj-view-config-panel',
  templateUrl: './view-config-panel.component.html',
  styleUrls: ['./view-config-panel.component.css']
})
export class ViewConfigPanelComponent implements OnInit, OnChanges {
  /**
   * The entity being viewed
   */
  @Input() entity: EntityInfo | null = null;

  /**
   * The current view entity (null for default view)
   */
  @Input() viewEntity: UserViewEntityExtended | null = null;

  /**
   * Whether the panel is open
   */
  @Input() isOpen: boolean = false;

  /**
   * Current grid state from the grid (includes live column widths/order from user interaction)
   * This takes precedence over viewEntity.Columns for showing current state
   */
  @Input() currentGridState: ViewGridStateConfig | null = null;

  /**
   * Emitted when the panel should close
   */
  @Output() close = new EventEmitter<void>();

  /**
   * Emitted when the view should be saved
   */
  @Output() save = new EventEmitter<ViewSaveEvent>();

  /**
   * Emitted when the view should be deleted
   */
  @Output() delete = new EventEmitter<void>();

  // Form state
  public viewName: string = '';
  public viewDescription: string = '';
  public isShared: boolean = false;
  public columns: ColumnConfig[] = [];
  public sortField: string | null = null;
  public sortDirection: 'asc' | 'desc' = 'asc';

  // Smart Filter state
  public smartFilterEnabled: boolean = false;
  public smartFilterPrompt: string = '';
  public smartFilterExplanation: string = '';

  // UI state
  public activeTab: 'columns' | 'filters' | 'settings' = 'columns';
  public isSaving: boolean = false;
  public columnSearchText: string = '';

  // Drag state for column reordering
  public draggedColumn: ColumnConfig | null = null;

  private metadata = new Metadata();

  constructor(private cdr: ChangeDetectorRef) {}

  /**
   * Handle keyboard shortcuts
   * Escape: Close the panel
   */
  @HostListener('document:keydown.escape')
  handleEscape(): void {
    if (this.isOpen) {
      this.onClose();
    }
  }

  ngOnInit(): void {
    this.initializeFromEntity();
  }

  ngOnChanges(changes: SimpleChanges): void {
    if (changes['entity'] || changes['viewEntity'] || changes['currentGridState']) {
      this.initializeFromEntity();
    }
  }

  /**
   * Initialize form state from entity and view
   * Priority for column state: currentGridState > viewEntity.Columns > entity defaults
   */
  private initializeFromEntity(): void {
    if (!this.entity) {
      this.columns = [];
      return;
    }

    // Initialize columns from entity fields
    this.columns = this.entity.Fields
      .filter(f => !f.Name.startsWith('__mj_'))
      .map((field, index) => ({
        fieldId: field.ID,
        fieldName: field.Name,
        displayName: field.DisplayNameOrName,
        visible: field.DefaultInView,
        width: field.DefaultColumnWidth || null,
        orderIndex: index,
        field
      }));

    // Priority 1: Use currentGridState if available (reflects live grid state including resizes)
    if (this.currentGridState?.columnSettings && this.currentGridState.columnSettings.length > 0) {
      this.applyGridStateToColumns(this.currentGridState.columnSettings);

      // Also apply sort from currentGridState
      if (this.currentGridState.sortSettings && this.currentGridState.sortSettings.length > 0) {
        this.sortField = this.currentGridState.sortSettings[0].field;
        this.sortDirection = this.currentGridState.sortSettings[0].dir;
      }
    }
    // Priority 2: If we have a view, apply its column configuration
    else if (this.viewEntity) {
      const viewColumns = this.viewEntity.Columns;
      if (viewColumns && viewColumns.length > 0) {
        // Mark all columns as hidden initially
        this.columns.forEach(c => c.visible = false);

        // Apply view column settings
        viewColumns.forEach((vc, idx) => {
          const column = this.columns.find(c => c.fieldName.toLowerCase() === vc.Name?.toLowerCase());
          if (column) {
            column.visible = !vc.hidden;
            column.width = vc.width || null;
            column.orderIndex = vc.orderIndex ?? idx;
          }
        });

        // Sort by orderIndex
        this.columns.sort((a, b) => a.orderIndex - b.orderIndex);
      }

      // Apply view's sort configuration
      const sortInfo = this.viewEntity.ViewSortInfo;
      if (sortInfo && sortInfo.length > 0) {
        this.sortField = sortInfo[0].field;
        this.sortDirection = sortInfo[0].direction === 'Desc' ? 'desc' : 'asc';
      }
    }

    // Apply view entity metadata (name, description, etc.) if available
    if (this.viewEntity) {
      this.viewName = this.viewEntity.Name;
      this.viewDescription = this.viewEntity.Description || '';
      this.isShared = this.viewEntity.IsShared;

      // Apply view's smart filter configuration
      this.smartFilterEnabled = this.viewEntity.SmartFilterEnabled || false;
      this.smartFilterPrompt = this.viewEntity.SmartFilterPrompt || '';
      this.smartFilterExplanation = this.viewEntity.SmartFilterExplanation || '';
    } else {
      // Default view - use entity defaults
      this.viewName = '';
      this.viewDescription = '';
      this.isShared = false;
      if (!this.currentGridState?.sortSettings?.length) {
        this.sortField = null;
        this.sortDirection = 'asc';
      }
      this.smartFilterEnabled = false;
      this.smartFilterPrompt = '';
      this.smartFilterExplanation = '';
    }

    this.cdr.detectChanges();
  }

  /**
   * Apply grid state column settings to the columns array
   */
  private applyGridStateToColumns(gridColumns: ViewColumnConfig[]): void {
    // Mark all columns as hidden initially
    this.columns.forEach(c => c.visible = false);

    // Apply grid state column settings
    gridColumns.forEach((gc, idx) => {
      const column = this.columns.find(c => c.fieldName.toLowerCase() === gc.Name.toLowerCase());
      if (column) {
        column.visible = !gc.hidden;
        column.width = gc.width || null;
        column.orderIndex = gc.orderIndex ?? idx;
        if (gc.DisplayName) {
          column.displayName = gc.DisplayName;
        }
      }
    });

    // Sort by orderIndex
    this.columns.sort((a, b) => a.orderIndex - b.orderIndex);
  }

  /**
   * Get visible columns
   */
  get visibleColumns(): ColumnConfig[] {
    return this.columns.filter(c => c.visible);
  }

  /**
   * Get hidden columns
   */
  get hiddenColumns(): ColumnConfig[] {
    return this.columns.filter(c => !c.visible);
  }

  /**
   * Get filtered columns for search
   */
  get filteredHiddenColumns(): ColumnConfig[] {
    if (!this.columnSearchText) {
      return this.hiddenColumns;
    }
    const search = this.columnSearchText.toLowerCase();
    return this.hiddenColumns.filter(c =>
      c.displayName.toLowerCase().includes(search) ||
      c.fieldName.toLowerCase().includes(search)
    );
  }

  /**
   * Get sortable fields for dropdown
   */
  get sortableFields(): EntityFieldInfo[] {
    if (!this.entity) return [];
    return this.entity.Fields.filter(f =>
      !f.Name.startsWith('__mj_') &&
      !f.IsBinaryFieldType // Exclude binary fields from sorting
    );
  }

  /**
   * Check if the current user can edit the view
   */
  get canEdit(): boolean {
    if (!this.viewEntity) return true; // Can always create new
    return this.viewEntity.UserCanEdit;
  }

  /**
   * Check if the current user can delete the view
   */
  get canDelete(): boolean {
    if (!this.viewEntity) return false; // Can't delete default
    return this.viewEntity.UserCanDelete;
  }

  /**
   * Toggle column visibility
   */
  toggleColumnVisibility(column: ColumnConfig): void {
    column.visible = !column.visible;
    if (column.visible) {
      // Add to end of visible columns
      column.orderIndex = this.visibleColumns.length;
    }
    this.cdr.detectChanges();
  }

  /**
   * Move column up in order
   */
  moveColumnUp(column: ColumnConfig): void {
    const visibleCols = this.visibleColumns;
    const currentIndex = visibleCols.indexOf(column);
    if (currentIndex > 0) {
      const prevColumn = visibleCols[currentIndex - 1];
      const tempOrder = column.orderIndex;
      column.orderIndex = prevColumn.orderIndex;
      prevColumn.orderIndex = tempOrder;
      this.columns.sort((a, b) => a.orderIndex - b.orderIndex);
      this.cdr.detectChanges();
    }
  }

  /**
   * Move column down in order
   */
  moveColumnDown(column: ColumnConfig): void {
    const visibleCols = this.visibleColumns;
    const currentIndex = visibleCols.indexOf(column);
    if (currentIndex < visibleCols.length - 1) {
      const nextColumn = visibleCols[currentIndex + 1];
      const tempOrder = column.orderIndex;
      column.orderIndex = nextColumn.orderIndex;
      nextColumn.orderIndex = tempOrder;
      this.columns.sort((a, b) => a.orderIndex - b.orderIndex);
      this.cdr.detectChanges();
    }
  }

  /**
   * Handle drag start for column reordering
   */
  onDragStart(event: DragEvent, column: ColumnConfig): void {
    this.draggedColumn = column;
    if (event.dataTransfer) {
      event.dataTransfer.effectAllowed = 'move';
    }
  }

  /**
   * Handle drag over for column reordering
   */
  onDragOver(event: DragEvent, column: ColumnConfig): void {
    event.preventDefault();
    if (event.dataTransfer) {
      event.dataTransfer.dropEffect = 'move';
    }
  }

  /**
   * Handle drop for column reordering
   */
  onDrop(event: DragEvent, targetColumn: ColumnConfig): void {
    event.preventDefault();
    if (this.draggedColumn && this.draggedColumn !== targetColumn) {
      const draggedIndex = this.draggedColumn.orderIndex;
      const targetIndex = targetColumn.orderIndex;

      // Reorder columns
      if (draggedIndex < targetIndex) {
        this.columns.forEach(c => {
          if (c.orderIndex > draggedIndex && c.orderIndex <= targetIndex) {
            c.orderIndex--;
          }
        });
      } else {
        this.columns.forEach(c => {
          if (c.orderIndex >= targetIndex && c.orderIndex < draggedIndex) {
            c.orderIndex++;
          }
        });
      }
      this.draggedColumn.orderIndex = targetIndex;
      this.columns.sort((a, b) => a.orderIndex - b.orderIndex);
    }
    this.draggedColumn = null;
    this.cdr.detectChanges();
  }

  /**
   * Handle drag end
   */
  onDragEnd(): void {
    this.draggedColumn = null;
  }

  /**
   * Close the panel
   */
  onClose(): void {
    this.close.emit();
  }

  /**
   * Save the view
   */
  onSave(): void {
    this.save.emit({
      name: this.viewName,
      description: this.viewDescription,
      isShared: this.isShared,
      saveAsNew: false,
      columns: this.visibleColumns,
      sortField: this.sortField,
      sortDirection: this.sortDirection,
      smartFilterEnabled: this.smartFilterEnabled,
      smartFilterPrompt: this.smartFilterPrompt
    });
  }

  /**
   * Save as a new view
   */
  onSaveAsNew(): void {
    this.save.emit({
      name: this.viewName || 'New View',
      description: this.viewDescription,
      isShared: this.isShared,
      saveAsNew: true,
      columns: this.visibleColumns,
      sortField: this.sortField,
      sortDirection: this.sortDirection,
      smartFilterEnabled: this.smartFilterEnabled,
      smartFilterPrompt: this.smartFilterPrompt
    });
  }

  /**
   * Delete the view
   */
  onDelete(): void {
    if (confirm('Are you sure you want to delete this view?')) {
      this.delete.emit();
    }
  }

  /**
   * Set the active tab
   */
  setActiveTab(tab: 'columns' | 'filters' | 'settings'): void {
    this.activeTab = tab;
    this.cdr.detectChanges();
  }
}
