import { Component, Input, Output, EventEmitter, OnChanges, OnInit, SimpleChanges, ChangeDetectorRef, HostListener } from '@angular/core';
import { EntityInfo, EntityFieldInfo, Metadata } from '@memberjunction/core';
import {
  UserViewEntityExtended,
  ViewColumnInfo,
  ViewGridState,
  ViewGridColumnSetting,
  ColumnFormat,
  ColumnTextStyle,
  ColumnConditionalRule,
  ViewGridAggregatesConfig,
  ViewGridAggregate,
  DEFAULT_AGGREGATE_DISPLAY,
  UserInfoEngine
} from '@memberjunction/core-entities';
import {
  CompositeFilterDescriptor,
  FilterFieldInfo,
  FilterFieldType,
  createEmptyFilter
} from '@memberjunction/ng-filter-builder';
import { ViewConfigSummary } from '../types';

/**
 * Column configuration for the view (internal use)
 */
export interface ColumnConfig {
  fieldId: string;
  fieldName: string;
  /** Original display name from entity metadata */
  displayName: string;
  /** User-defined custom display name (overrides displayName when set) */
  userDisplayName?: string;
  visible: boolean;
  width: number | null;
  orderIndex: number;
  field: EntityFieldInfo;
  /** Column formatting configuration */
  format?: ColumnFormat;
}

/**
 * Sort item for multi-column sorting
 */
export interface SortItem {
  field: string;
  direction: 'asc' | 'desc';
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
  /** @deprecated Use sortItems instead for multi-sort support */
  sortField: string | null;
  /** @deprecated Use sortItems instead for multi-sort support */
  sortDirection: 'asc' | 'desc';
  /** Multi-column sort configuration (ordered by priority) */
  sortItems: SortItem[];
  smartFilterEnabled: boolean;
  smartFilterPrompt: string;
  /** Traditional filter state in Kendo-compatible JSON format */
  filterState: CompositeFilterDescriptor | null;
  /** Aggregates configuration */
  aggregatesConfig: ViewGridAggregatesConfig | null;
}

/**
 * ViewConfigPanelComponent - Sliding panel for configuring view settings
 *
 * Features:
 * - Column visibility and ordering with drag-drop
 * - Column formatting (number, currency, date, etc.)
 * - Sort configuration
 * - View name and description editing
 * - Share settings
 * - Save / Save As New / Cancel actions
 */
@Component({
  standalone: false,
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
  @Input() currentGridState: ViewGridState | null = null;

  /**
   * Sample data for column format preview (first few records)
   */
  @Input() sampleData: Record<string, unknown>[] = [];

  /**
   * Emitted when the panel should close
   */
  @Output() close = new EventEmitter<void>();

  /**
   * Emitted when the view should be saved
   */
  @Output() save = new EventEmitter<ViewSaveEvent>();

  /**
   * Emitted when default view settings should be saved to user settings
   * (Used for dynamic/default views that persist to MJ: User Settings)
   */
  @Output() saveDefaults = new EventEmitter<ViewSaveEvent>();

  /**
   * Emitted when the view should be deleted
   */
  @Output() delete = new EventEmitter<void>();

  /**
   * Emitted when filter dialog should be opened (at dashboard level for full width)
   */
  @Output() openFilterDialogRequest = new EventEmitter<{
    filterState: CompositeFilterDescriptor;
    filterFields: FilterFieldInfo[];
  }>();

  /**
   * Filter state from external dialog (set by parent after dialog closes)
   */
  @Input() externalFilterState: CompositeFilterDescriptor | null = null;

  /**
   * When true, auto-focus on Settings tab when panel opens (BUG-011: forward saveAsNew intent)
   */
  @Input() DefaultSaveAsNew: boolean = false;

  /**
   * Emitted when user wants to duplicate the current view (F-005)
   */
  @Output() duplicate = new EventEmitter<void>();

  // Form state
  public viewName: string = '';
  public viewDescription: string = '';
  public isShared: boolean = false;
  public columns: ColumnConfig[] = [];
  /** @deprecated Use sortItems instead */
  public sortField: string | null = null;
  /** @deprecated Use sortItems instead */
  public sortDirection: 'asc' | 'desc' = 'asc';
  /** Multi-column sort configuration (ordered by priority) */
  public sortItems: SortItem[] = [];

  // Sort drag state
  public draggedSortItem: SortItem | null = null;
  public dropTargetSortItem: SortItem | null = null;
  public sortDropPosition: 'before' | 'after' | null = null;

  // Available sort directions for dropdown
  public sortDirections = [
    { name: 'Ascending', value: 'asc' as const },
    { name: 'Descending', value: 'desc' as const }
  ];

  // Smart Filter state
  public smartFilterEnabled: boolean = false;
  public smartFilterPrompt: string = '';
  public smartFilterExplanation: string = '';

  // Traditional Filter state
  public filterState: CompositeFilterDescriptor = createEmptyFilter();
  public filterFields: FilterFieldInfo[] = [];

  // Filter mode: 'smart' or 'traditional' (mutually exclusive)
  public filterMode: 'smart' | 'traditional' = 'smart';

  // Aggregates state
  public aggregates: ViewGridAggregate[] = [];
  public showAggregateDialog: boolean = false;
  public editingAggregate: ViewGridAggregate | null = null;

  // Saved filter state for mode switching (BUG-006: preserve both modes' data)
  private savedSmartFilterPrompt: string = '';
  private savedTraditionalFilter: CompositeFilterDescriptor = createEmptyFilter();

  // Filter mode switch confirmation (BUG-006)
  public showFilterModeSwitchConfirm: boolean = false;
  public pendingFilterModeSwitch: 'smart' | 'traditional' | null = null;

  // Local saving guard (BUG-003: race condition on double-click)
  private _localSaving: boolean = false;

  // UI state
  public activeTab: 'columns' | 'sorting' | 'filters' | 'aggregates' | 'settings' = 'columns';
  @Input() isSaving: boolean = false;
  public columnSearchText: string = '';

  // Drag state for column reordering
  public draggedColumn: ColumnConfig | null = null;
  public dropTargetColumn: ColumnConfig | null = null;
  public dropPosition: 'before' | 'after' | null = null;

  // Column format editing state
  public formatEditingColumn: ColumnConfig | null = null;

  // Panel resize state
  public isResizing: boolean = false;
  public panelWidth: number = 520;
  private readonly MIN_PANEL_WIDTH = 360;
  private readonly MAX_PANEL_WIDTH = 800;
  private readonly DEFAULT_PANEL_WIDTH = 520;
  /** Width threshold below which tabs show icons only */
  private readonly ICON_ONLY_THRESHOLD = 440;
  private readonly PANEL_WIDTH_SETTING_KEY = 'view-config-panel/width';
  private resizeStartX: number = 0;
  private resizeStartWidth: number = 0;

  /**
   * Whether tabs should show icons only (narrow panel mode)
   */
  get isIconOnlyMode(): boolean {
    return this.panelWidth < this.ICON_ONLY_THRESHOLD;
  }

  private metadata = new Metadata();

  constructor(private cdr: ChangeDetectorRef) {}

  /**
   * Handle keyboard shortcuts
   * Escape: Close the panel or format sub-panel
   */
  @HostListener('document:keydown.escape')
  handleEscape(): void {
    if (this.formatEditingColumn) {
      this.closeFormatEditor();
    } else if (this.isOpen) {
      this.onClose();
    }
  }

  // ========================================
  // PANEL RESIZE HANDLERS
  // ========================================

  /**
   * Start resizing the panel
   */
  onResizeStart(event: MouseEvent): void {
    event.preventDefault();
    this.isResizing = true;
    this.resizeStartX = event.clientX;
    this.resizeStartWidth = this.panelWidth;

    // Add document-level listeners for mouse move and up
    document.addEventListener('mousemove', this.onResizeMove);
    document.addEventListener('mouseup', this.onResizeEnd);
    document.body.style.cursor = 'ew-resize';
    document.body.style.userSelect = 'none';
  }

  /**
   * Handle resize movement (bound to document)
   */
  private onResizeMove = (event: MouseEvent): void => {
    if (!this.isResizing) return;

    // Calculate new width (panel is on the right, so moving left increases width)
    const deltaX = this.resizeStartX - event.clientX;
    let newWidth = this.resizeStartWidth + deltaX;

    // Clamp to min/max bounds
    newWidth = Math.max(this.MIN_PANEL_WIDTH, Math.min(this.MAX_PANEL_WIDTH, newWidth));

    this.panelWidth = newWidth;
    this.cdr.detectChanges();
  };

  /**
   * End resizing the panel (bound to document)
   */
  private onResizeEnd = (): void => {
    this.isResizing = false;
    document.removeEventListener('mousemove', this.onResizeMove);
    document.removeEventListener('mouseup', this.onResizeEnd);
    document.body.style.cursor = '';
    document.body.style.userSelect = '';
    // Persist the panel width to user settings
    this.savePanelWidth();
    this.cdr.detectChanges();
  };

  ngOnInit(): void {
    this.loadSavedPanelWidth();
    this.initializeFromEntity();
  }

  /**
   * Load saved panel width from user settings
   */
  private loadSavedPanelWidth(): void {
    try {
      const savedWidth = UserInfoEngine.Instance.GetSetting(this.PANEL_WIDTH_SETTING_KEY);
      if (savedWidth) {
        const width = parseInt(savedWidth, 10);
        if (!isNaN(width) && width >= this.MIN_PANEL_WIDTH && width <= this.MAX_PANEL_WIDTH) {
          this.panelWidth = width;
        }
      }
    } catch (error) {
      console.warn('[ViewConfigPanel] Failed to load saved panel width:', error);
    }
  }

  /**
   * Save panel width to user settings
   */
  private async savePanelWidth(): Promise<void> {
    try {
      await UserInfoEngine.Instance.SetSetting(this.PANEL_WIDTH_SETTING_KEY, String(this.panelWidth));
    } catch (error) {
      console.warn('[ViewConfigPanel] Failed to save panel width:', error);
    }
  }

  ngOnChanges(changes: SimpleChanges): void {
    // Reset to first tab and clear search when panel opens
    if (changes['isOpen'] && this.isOpen) {
      // BUG-011: If DefaultSaveAsNew is set, open on Settings tab with name focused
      this.activeTab = this.DefaultSaveAsNew ? 'settings' : 'columns';
      this.columnSearchText = '';
      this.formatEditingColumn = null;
      this._localSaving = false;
      // Also close any open aggregate dialog
      this.showAggregateDialog = false;
      this.editingAggregate = null;
      // Close filter mode switch confirm
      this.showFilterModeSwitchConfirm = false;
      this.pendingFilterModeSwitch = null;
      // Re-initialize from entity to get fresh state
      this.initializeFromEntity();
    }

    // BUG-003: Reset local saving guard when isSaving transitions from true to false
    if (changes['isSaving'] && !this.isSaving && changes['isSaving'].previousValue === true) {
      this._localSaving = false;
    }

    if (changes['entity'] || changes['viewEntity'] || changes['currentGridState']) {
      this.initializeFromEntity();
    }

    // Apply external filter state when it changes (from dashboard-level dialog)
    if (changes['externalFilterState'] && this.externalFilterState) {
      this.filterState = this.externalFilterState;
      this.cdr.detectChanges();
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

    // Initialize columns from entity fields (including __mj_ fields for audit/timestamp info)
    this.columns = this.entity.Fields
      .map((field, index) => ({
        fieldId: field.ID,
        fieldName: field.Name,
        displayName: field.DisplayNameOrName,
        userDisplayName: undefined,
        visible: field.DefaultInView,
        width: field.DefaultColumnWidth || null,
        orderIndex: index,
        field,
        format: undefined
      }));

    // Priority 1: Use currentGridState if available (reflects live grid state including resizes)
    if (this.currentGridState?.columnSettings && this.currentGridState.columnSettings.length > 0) {
      this.applyGridStateToColumns(this.currentGridState.columnSettings);

      // Also apply sort from currentGridState (supports multi-sort)
      if (this.currentGridState.sortSettings && this.currentGridState.sortSettings.length > 0) {
        this.sortItems = this.currentGridState.sortSettings.map(s => ({
          field: s.field,
          direction: s.dir
        }));
        // Keep legacy fields in sync for backward compatibility
        this.sortField = this.currentGridState.sortSettings[0].field;
        this.sortDirection = this.currentGridState.sortSettings[0].dir;
      } else {
        this.sortItems = [];
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
            // Apply userDisplayName if present
            if (vc.userDisplayName) {
              column.userDisplayName = vc.userDisplayName;
            }
            // Apply format if present
            if (vc.format) {
              column.format = vc.format;
            }
          }
        });

        // Sort by orderIndex
        this.columns.sort((a, b) => a.orderIndex - b.orderIndex);
      }

      // Apply view's sort configuration (supports multi-sort)
      const sortInfo = this.viewEntity.ViewSortInfo;
      if (sortInfo && sortInfo.length > 0) {
        this.sortItems = sortInfo.map(s => ({
          field: s.field,
          direction: s.direction === 'Desc' ? 'desc' as const : 'asc' as const
        }));
        // Keep legacy fields in sync for backward compatibility
        this.sortField = sortInfo[0].field;
        this.sortDirection = sortInfo[0].direction === 'Desc' ? 'desc' : 'asc';
      } else {
        this.sortItems = [];
      }
    }

    // Initialize filter fields from entity
    this.filterFields = this.buildFilterFields();

    // Apply view entity metadata (name, description, etc.) if available
    if (this.viewEntity) {
      this.viewName = this.viewEntity.Name;
      this.viewDescription = this.viewEntity.Description || '';
      this.isShared = this.viewEntity.IsShared;

      // Apply view's smart filter configuration
      this.smartFilterEnabled = this.viewEntity.SmartFilterEnabled || false;
      this.smartFilterPrompt = this.viewEntity.SmartFilterPrompt || '';
      this.smartFilterExplanation = this.viewEntity.SmartFilterExplanation || '';

      // Apply view's traditional filter state
      this.filterState = this.parseFilterState(this.viewEntity.FilterState);

      // Set filter mode based on which type of filter is active
      // Smart filter takes precedence if enabled
      if (this.smartFilterEnabled && this.smartFilterPrompt) {
        this.filterMode = 'smart';
      } else if (this.getFilterCount() > 0) {
        this.filterMode = 'traditional';
      } else {
        // Default to smart mode for new/empty filters (promote AI filtering)
        this.filterMode = 'smart';
        this.smartFilterEnabled = true;
      }
    } else {
      // Default view - use entity defaults
      this.viewName = '';
      this.viewDescription = '';
      this.isShared = false;
      if (!this.currentGridState?.sortSettings?.length) {
        this.sortField = null;
        this.sortDirection = 'asc';
        this.sortItems = [];
      }
      this.smartFilterPrompt = '';
      this.smartFilterExplanation = '';
      this.filterState = createEmptyFilter();
      // Default to smart mode (promote AI filtering)
      this.filterMode = 'smart';
      this.smartFilterEnabled = true;
    }

    // Load aggregates from currentGridState if available
    if (this.currentGridState?.aggregates?.expressions) {
      this.aggregates = [...this.currentGridState.aggregates.expressions];
    } else {
      this.aggregates = [];
    }

    this.cdr.detectChanges();
  }

  /**
   * Build filter fields from entity fields (including __mj_ fields for filtering by timestamps)
   */
  private buildFilterFields(): FilterFieldInfo[] {
    if (!this.entity) return [];

    return this.entity.Fields
      .filter(f => !f.IsBinaryFieldType)
      .map(field => ({
        name: field.Name,
        displayName: field.DisplayNameOrName,
        type: this.mapFieldType(field),
        lookupEntityName: field.RelatedEntity || undefined,
        valueList: field.ValueListType === 'List' && field.EntityFieldValues?.length > 0
          ? field.EntityFieldValues.map(v => ({ value: v.Value, label: v.Value }))
          : undefined
      }));
  }

  /**
   * Map entity field type to filter field type
   */
  private mapFieldType(field: EntityFieldInfo): FilterFieldType {
    // Check for lookup first - RelatedEntity is a string (entity name) if it's a lookup field
    if (field.RelatedEntity) {
      return 'lookup';
    }

    // Map based on SQL type
    const sqlType = field.Type.toLowerCase();
    if (sqlType.includes('bit') || sqlType === 'boolean') {
      return 'boolean';
    }
    if (sqlType.includes('date') || sqlType.includes('time')) {
      return 'date';
    }
    if (sqlType.includes('int') || sqlType.includes('decimal') ||
        sqlType.includes('numeric') || sqlType.includes('float') ||
        sqlType.includes('real') || sqlType.includes('money')) {
      return 'number';
    }
    return 'string';
  }

  /**
   * Parse the filter state from JSON string
   */
  private parseFilterState(filterStateJson: string | null | undefined): CompositeFilterDescriptor {
    if (!filterStateJson) {
      return createEmptyFilter();
    }
    try {
      const parsed = JSON.parse(filterStateJson);
      // Validate it has the expected structure
      if (parsed && typeof parsed === 'object' && 'logic' in parsed && 'filters' in parsed) {
        return parsed as CompositeFilterDescriptor;
      }
      return createEmptyFilter();
    } catch {
      return createEmptyFilter();
    }
  }

  /**
   * Handle filter state change from filter builder
   */
  onFilterChange(filter: CompositeFilterDescriptor): void {
    this.filterState = filter;
    this.cdr.detectChanges();
  }

  /**
   * Open the filter dialog - emits event to parent (dashboard) which renders the dialog at viewport level
   */
  openFilterDialog(): void {
    this.openFilterDialogRequest.emit({
      filterState: this.filterState,
      filterFields: this.filterFields
    });
  }

  /**
   * Get the count of active filter rules
   */
  getFilterCount(): number {
    return this.countFilters(this.filterState);
  }

  /**
   * Count filters recursively
   */
  private countFilters(filter: CompositeFilterDescriptor): number {
    let count = 0;
    for (const item of filter.filters || []) {
      if ('logic' in item && 'filters' in item) {
        count += this.countFilters(item as CompositeFilterDescriptor);
      } else if ('field' in item) {
        count++;
      }
    }
    return count;
  }

  /**
   * Get a human-readable summary of the filter state
   */
  getFilterSummary(): string {
    const count = this.getFilterCount();
    if (count === 0) {
      return 'No filters applied';
    }
    return `${count} filter${count !== 1 ? 's' : ''} active`;
  }

  /**
   * Clear all filters
   */
  clearFilters(): void {
    this.filterState = createEmptyFilter();
    this.cdr.detectChanges();
  }

  /**
   * Apply grid state column settings to the columns array
   */
  private applyGridStateToColumns(gridColumns: ViewGridColumnSetting[]): void {
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
        // Apply userDisplayName if present
        if (gc.userDisplayName) {
          column.userDisplayName = gc.userDisplayName;
        }
        // Apply format if present
        if (gc.format) {
          column.format = gc.format;
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
   * Get sortable fields for dropdown (including __mj_ fields for sorting by timestamps)
   */
  get sortableFields(): EntityFieldInfo[] {
    if (!this.entity) return [];
    return this.entity.Fields.filter(f =>
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

  // ========================================
  // DRAG AND DROP WITH DROP INDICATOR
  // ========================================

  /**
   * Handle drag start for column reordering
   */
  onDragStart(event: DragEvent, column: ColumnConfig): void {
    this.draggedColumn = column;
    if (event.dataTransfer) {
      event.dataTransfer.effectAllowed = 'move';
      event.dataTransfer.setData('text/plain', column.fieldId);
    }
    // Add dragging class to the element
    (event.target as HTMLElement).classList.add('dragging');
  }

  /**
   * Handle drag over for column reordering - determines drop position
   */
  onDragOver(event: DragEvent, column: ColumnConfig): void {
    event.preventDefault();
    if (event.dataTransfer) {
      event.dataTransfer.dropEffect = 'move';
    }

    if (!this.draggedColumn || this.draggedColumn === column) {
      this.dropTargetColumn = null;
      this.dropPosition = null;
      return;
    }

    // Calculate if we're in the top or bottom half of the target
    const rect = (event.currentTarget as HTMLElement).getBoundingClientRect();
    const y = event.clientY - rect.top;
    const threshold = rect.height / 2;

    this.dropTargetColumn = column;
    this.dropPosition = y < threshold ? 'before' : 'after';
  }

  /**
   * Handle drag leave - clear drop indicator
   */
  onDragLeave(event: DragEvent): void {
    // Only clear if we're leaving the column item, not entering a child element
    const relatedTarget = event.relatedTarget as HTMLElement;
    const currentTarget = event.currentTarget as HTMLElement;
    if (!currentTarget.contains(relatedTarget)) {
      this.dropTargetColumn = null;
      this.dropPosition = null;
    }
  }

  /**
   * Handle drop for column reordering
   */
  onDrop(event: DragEvent, targetColumn: ColumnConfig): void {
    event.preventDefault();

    if (this.draggedColumn && this.draggedColumn !== targetColumn && this.dropPosition) {
      const visibleCols = this.visibleColumns;
      const draggedIndex = visibleCols.indexOf(this.draggedColumn);
      let targetIndex = visibleCols.indexOf(targetColumn);

      // Adjust target index based on drop position
      if (this.dropPosition === 'after') {
        targetIndex++;
      }

      // If dragging from before target, adjust for removal
      if (draggedIndex < targetIndex) {
        targetIndex--;
      }

      // Reorder the columns
      this.reorderColumn(this.draggedColumn, targetIndex);
    }

    this.clearDragState();
  }

  /**
   * Handle drag end
   */
  onDragEnd(event: DragEvent): void {
    (event.target as HTMLElement).classList.remove('dragging');
    this.clearDragState();
  }

  /**
   * Clear all drag state
   */
  private clearDragState(): void {
    this.draggedColumn = null;
    this.dropTargetColumn = null;
    this.dropPosition = null;
    this.cdr.detectChanges();
  }

  /**
   * Reorder a column to a new position
   */
  private reorderColumn(column: ColumnConfig, newIndex: number): void {
    const visibleCols = this.visibleColumns;

    // Remove from current position
    const currentIndex = visibleCols.indexOf(column);
    if (currentIndex === newIndex) return;

    // Update order indices
    visibleCols.forEach((col, idx) => {
      if (col === column) {
        col.orderIndex = newIndex;
      } else if (currentIndex < newIndex) {
        // Dragging down - shift items between old and new position up
        if (idx > currentIndex && idx <= newIndex) {
          col.orderIndex = idx - 1;
        }
      } else {
        // Dragging up - shift items between new and old position down
        if (idx >= newIndex && idx < currentIndex) {
          col.orderIndex = idx + 1;
        }
      }
    });

    // Re-sort all columns by orderIndex
    this.columns.sort((a, b) => a.orderIndex - b.orderIndex);
    this.cdr.detectChanges();
  }

  /**
   * Check if drop indicator should show before a column
   */
  isDropBefore(column: ColumnConfig): boolean {
    return this.dropTargetColumn === column && this.dropPosition === 'before';
  }

  /**
   * Check if drop indicator should show after a column
   */
  isDropAfter(column: ColumnConfig): boolean {
    return this.dropTargetColumn === column && this.dropPosition === 'after';
  }

  // ========================================
  // MULTI-SORT MANAGEMENT
  // ========================================

  /**
   * Add a new sort level
   */
  addSortLevel(): void {
    // Find the first sortable field not already in use
    const usedFields = new Set(this.sortItems.map(s => s.field));
    const availableField = this.sortableFields.find(f => !usedFields.has(f.Name));

    if (availableField) {
      this.sortItems.push({
        field: availableField.Name,
        direction: 'asc'
      });
      this.syncLegacySortFields();
      this.cdr.detectChanges();
    }
  }

  /**
   * Remove a sort level
   */
  removeSortLevel(sortItem: SortItem): void {
    const index = this.sortItems.indexOf(sortItem);
    if (index > -1) {
      this.sortItems.splice(index, 1);
      this.syncLegacySortFields();
      this.cdr.detectChanges();
    }
  }

  /**
   * Get the display name for a field
   */
  getFieldDisplayName(fieldName: string): string {
    const field = this.sortableFields.find(f => f.Name === fieldName);
    return field?.DisplayNameOrName || fieldName;
  }

  /**
   * Get fields available for a sort item (excludes already selected fields except current)
   */
  getAvailableFieldsForSort(currentSortItem: SortItem): EntityFieldInfo[] {
    const usedFields = new Set(this.sortItems.map(s => s.field));
    return this.sortableFields.filter(f =>
      f.Name === currentSortItem.field || !usedFields.has(f.Name)
    );
  }

  /**
   * Handle sort field change
   */
  onSortFieldChange(sortItem: SortItem, fieldName: string): void {
    sortItem.field = fieldName;
    this.syncLegacySortFields();
    this.cdr.detectChanges();
  }

  /**
   * Handle sort direction change
   */
  onSortDirectionChange(sortItem: SortItem, direction: 'asc' | 'desc'): void {
    sortItem.direction = direction;
    this.syncLegacySortFields();
    this.cdr.detectChanges();
  }

  /**
   * Keep legacy sortField/sortDirection in sync with sortItems[0]
   */
  private syncLegacySortFields(): void {
    if (this.sortItems.length > 0) {
      this.sortField = this.sortItems[0].field;
      this.sortDirection = this.sortItems[0].direction;
    } else {
      this.sortField = null;
      this.sortDirection = 'asc';
    }
  }

  // ----------------------------------------
  // Sort Drag & Drop
  // ----------------------------------------

  /**
   * Handle drag start for sort item reordering
   */
  onSortDragStart(event: DragEvent, sortItem: SortItem): void {
    this.draggedSortItem = sortItem;
    if (event.dataTransfer) {
      event.dataTransfer.effectAllowed = 'move';
      event.dataTransfer.setData('text/plain', sortItem.field);
    }
    (event.target as HTMLElement).classList.add('dragging');
  }

  /**
   * Handle drag over for sort item reordering
   */
  onSortDragOver(event: DragEvent, sortItem: SortItem): void {
    event.preventDefault();
    if (event.dataTransfer) {
      event.dataTransfer.dropEffect = 'move';
    }

    if (!this.draggedSortItem || this.draggedSortItem === sortItem) {
      this.dropTargetSortItem = null;
      this.sortDropPosition = null;
      return;
    }

    const rect = (event.currentTarget as HTMLElement).getBoundingClientRect();
    const y = event.clientY - rect.top;
    const threshold = rect.height / 2;

    this.dropTargetSortItem = sortItem;
    this.sortDropPosition = y < threshold ? 'before' : 'after';
  }

  /**
   * Handle drag leave for sort item
   */
  onSortDragLeave(event: DragEvent): void {
    const relatedTarget = event.relatedTarget as HTMLElement;
    const currentTarget = event.currentTarget as HTMLElement;
    if (!currentTarget.contains(relatedTarget)) {
      this.dropTargetSortItem = null;
      this.sortDropPosition = null;
    }
  }

  /**
   * Handle drop for sort item reordering
   */
  onSortDrop(event: DragEvent, targetSortItem: SortItem): void {
    event.preventDefault();

    if (this.draggedSortItem && this.draggedSortItem !== targetSortItem && this.sortDropPosition) {
      const draggedIndex = this.sortItems.indexOf(this.draggedSortItem);
      let targetIndex = this.sortItems.indexOf(targetSortItem);

      // Adjust target index based on drop position
      if (this.sortDropPosition === 'after') {
        targetIndex++;
      }

      // If dragging from before target, adjust for removal
      if (draggedIndex < targetIndex) {
        targetIndex--;
      }

      // Remove from old position
      this.sortItems.splice(draggedIndex, 1);
      // Insert at new position
      this.sortItems.splice(targetIndex, 0, this.draggedSortItem);

      this.syncLegacySortFields();
    }

    this.clearSortDragState();
  }

  /**
   * Handle drag end for sort item
   */
  onSortDragEnd(event: DragEvent): void {
    (event.target as HTMLElement).classList.remove('dragging');
    this.clearSortDragState();
  }

  /**
   * Clear sort drag state
   */
  private clearSortDragState(): void {
    this.draggedSortItem = null;
    this.dropTargetSortItem = null;
    this.sortDropPosition = null;
    this.cdr.detectChanges();
  }

  /**
   * Check if drop indicator should show before a sort item
   */
  isSortDropBefore(sortItem: SortItem): boolean {
    return this.dropTargetSortItem === sortItem && this.sortDropPosition === 'before';
  }

  /**
   * Check if drop indicator should show after a sort item
   */
  isSortDropAfter(sortItem: SortItem): boolean {
    return this.dropTargetSortItem === sortItem && this.sortDropPosition === 'after';
  }

  // ========================================
  // COLUMN FORMAT EDITOR
  // ========================================

  /**
   * Open the format editor for a column
   */
  openFormatEditor(column: ColumnConfig): void {
    // Initialize format if not present
    if (!column.format) {
      column.format = this.getDefaultFormat(column.field);
    }
    this.formatEditingColumn = column;
    this.cdr.detectChanges();
  }

  /**
   * Close the format editor
   */
  closeFormatEditor(): void {
    this.formatEditingColumn = null;
    this.cdr.detectChanges();
  }

  /**
   * Get default format based on field type
   */
  private getDefaultFormat(field: EntityFieldInfo): ColumnFormat {
    const sqlType = field.Type.toLowerCase();

    if (sqlType.includes('money') || sqlType.includes('currency')) {
      return { type: 'currency', decimals: 2, currencyCode: 'USD', thousandsSeparator: true };
    }
    if (sqlType.includes('percent')) {
      return { type: 'percent', decimals: 1 };
    }
    if (sqlType.includes('decimal') || sqlType.includes('numeric') || sqlType.includes('float') || sqlType.includes('real')) {
      return { type: 'number', decimals: 2, thousandsSeparator: true };
    }
    if (sqlType.includes('int')) {
      return { type: 'number', decimals: 0, thousandsSeparator: true };
    }
    if (sqlType.includes('datetime')) {
      return { type: 'datetime', dateFormat: 'medium' };
    }
    if (sqlType.includes('date')) {
      return { type: 'date', dateFormat: 'medium' };
    }
    if (sqlType.includes('bit') || sqlType === 'boolean') {
      return { type: 'boolean', trueLabel: 'Yes', falseLabel: 'No', booleanDisplay: 'text' };
    }

    return { type: 'auto' };
  }

  /**
   * Check if a column has custom formatting applied
   */
  hasCustomFormat(column: ColumnConfig): boolean {
    return !!column.format && column.format.type !== 'auto';
  }

  /**
   * Clear formatting for a column
   */
  clearColumnFormat(column: ColumnConfig): void {
    column.format = undefined;
    this.cdr.detectChanges();
  }

  /**
   * Get sample values for preview
   */
  getSampleValues(column: ColumnConfig): unknown[] {
    if (!this.sampleData || this.sampleData.length === 0) {
      return this.getPlaceholderSamples(column.field);
    }
    return this.sampleData
      .slice(0, 5)
      .map(row => row[column.fieldName])
      .filter(v => v != null);
  }

  /**
   * Get placeholder sample values when no data available
   */
  private getPlaceholderSamples(field: EntityFieldInfo): unknown[] {
    const sqlType = field.Type.toLowerCase();

    if (sqlType.includes('money') || sqlType.includes('decimal') || sqlType.includes('numeric')) {
      return [1234.56, -567.89, 10000.00, 0.50, 999999.99];
    }
    if (sqlType.includes('int')) {
      return [42, 100, 1500, 0, -25];
    }
    if (sqlType.includes('date')) {
      const now = new Date();
      return [
        new Date(now.getTime() - 86400000),
        new Date(now.getTime() - 172800000),
        now,
        new Date(now.getTime() + 86400000),
        new Date(now.getTime() - 604800000)
      ];
    }
    if (sqlType.includes('bit') || sqlType === 'boolean') {
      return [true, false, true, false, true];
    }

    return ['Sample', 'Text', 'Values', 'Here', 'Preview'];
  }

  /**
   * Format a value for preview display
   */
  formatPreviewValue(value: unknown, format: ColumnFormat | undefined): string {
    if (value == null) return '—';
    if (!format || format.type === 'auto') return String(value);

    switch (format.type) {
      case 'number':
        return this.formatNumber(value as number, format);
      case 'currency':
        return this.formatCurrency(value as number, format);
      case 'percent':
        return this.formatPercent(value as number, format);
      case 'date':
      case 'datetime':
        return this.formatDate(value as Date, format);
      case 'boolean':
        return this.formatBoolean(value as boolean, format);
      default:
        return String(value);
    }
  }

  private formatNumber(value: number, format: ColumnFormat): string {
    const options: Intl.NumberFormatOptions = {
      minimumFractionDigits: format.decimals ?? 0,
      maximumFractionDigits: format.decimals ?? 0,
      useGrouping: format.thousandsSeparator ?? true
    };
    return new Intl.NumberFormat('en-US', options).format(value);
  }

  private formatCurrency(value: number, format: ColumnFormat): string {
    const options: Intl.NumberFormatOptions = {
      style: 'currency',
      currency: format.currencyCode || 'USD',
      minimumFractionDigits: format.decimals ?? 2,
      maximumFractionDigits: format.decimals ?? 2
    };
    return new Intl.NumberFormat('en-US', options).format(value);
  }

  private formatPercent(value: number, format: ColumnFormat): string {
    const options: Intl.NumberFormatOptions = {
      style: 'percent',
      minimumFractionDigits: format.decimals ?? 0,
      maximumFractionDigits: format.decimals ?? 0
    };
    // Assume value is already a percentage (e.g., 50 = 50%), divide by 100
    return new Intl.NumberFormat('en-US', options).format(value / 100);
  }

  private formatDate(value: Date, format: ColumnFormat): string {
    const date = value instanceof Date ? value : new Date(value);
    if (isNaN(date.getTime())) return String(value);

    // Parse format string - check for weekday variants
    const formatStr = format.dateFormat || 'medium';
    const includeWeekday = formatStr.includes('-weekday');
    const baseFormat = formatStr.replace('-weekday', '') as 'short' | 'medium' | 'long';

    let options: Intl.DateTimeFormatOptions;

    // Intl.DateTimeFormat doesn't allow combining dateStyle with weekday
    // So we must use individual components when weekday is requested
    if (includeWeekday) {
      if (baseFormat === 'short') {
        options = { weekday: 'short', month: 'numeric', day: 'numeric', year: '2-digit' };
      } else if (baseFormat === 'long') {
        options = { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' };
      } else {
        // medium
        options = { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' };
      }
      if (format.type === 'datetime') {
        options.hour = 'numeric';
        options.minute = '2-digit';
      }
    } else {
      // No weekday - can use dateStyle shorthand
      options = {
        dateStyle: baseFormat === 'short' ? 'short' : baseFormat === 'long' ? 'long' : 'medium'
      };
      if (format.type === 'datetime') {
        options.timeStyle = 'short';
      }
    }

    return new Intl.DateTimeFormat('en-US', options).format(date);
  }

  private formatBoolean(value: boolean, format: ColumnFormat): string {
    return value ? (format.trueLabel || 'Yes') : (format.falseLabel || 'No');
  }

  // ========================================
  // CLOSE / SAVE / DELETE
  // ========================================

  /**
   * Close the panel
   */
  onClose(): void {
    this.close.emit();
  }

  /**
   * Check if filter state has any active filters
   */
  private hasActiveFilters(): boolean {
    return this.filterState?.filters?.length > 0;
  }

  // ========================================
  // VALIDATION (BUG-004)
  // ========================================

  /**
   * Get validation errors for the current form state
   */
  get ValidationErrors(): string[] {
    const errors: string[] = [];
    if (!this.viewName || !this.viewName.trim()) {
      errors.push('View name is required');
    }
    if (this.visibleColumns.length === 0) {
      errors.push('At least one column must be visible');
    }
    return errors;
  }

  /**
   * Whether the form is valid for saving
   */
  get IsValid(): boolean {
    return this.ValidationErrors.length === 0;
  }

  /**
   * Whether the form is valid for save-as-new (name can default to 'New View')
   */
  get IsValidForSaveAsNew(): boolean {
    return this.visibleColumns.length > 0;
  }

  /**
   * Build a ViewConfigSummary for quick-save preview (F-003)
   */
  BuildSummary(): ViewConfigSummary {
    return {
      ColumnCount: this.visibleColumns.length,
      FilterCount: this.filterMode === 'traditional' ? this.getFilterCount() : 0,
      SortCount: this.sortItems.length,
      SmartFilterActive: this.smartFilterEnabled && !!this.smartFilterPrompt.trim(),
      SmartFilterPrompt: this.smartFilterPrompt,
      AggregateCount: this.aggregates.filter(a => a.enabled !== false).length
    };
  }

  /**
   * Save the view
   */
  onSave(): void {
    // BUG-003: Guard against double-clicks with local flag
    if (this.isSaving || this._localSaving) return;
    // BUG-004: Validate before saving
    if (!this.IsValid) return;

    this._localSaving = true;
    this.save.emit({
      name: this.viewName,
      description: this.viewDescription,
      isShared: this.isShared,
      saveAsNew: false,
      columns: this.visibleColumns,
      sortField: this.sortField,
      sortDirection: this.sortDirection,
      sortItems: [...this.sortItems],
      smartFilterEnabled: this.smartFilterEnabled,
      smartFilterPrompt: this.smartFilterPrompt,
      filterState: this.hasActiveFilters() ? this.filterState : null,
      aggregatesConfig: this.buildAggregatesConfig()
    });
  }

  /**
   * Save as a new view
   */
  onSaveAsNew(): void {
    // BUG-003: Guard against double-clicks with local flag
    if (this.isSaving || this._localSaving) return;
    // BUG-004: Validate (name defaults to 'New View' if empty)
    if (!this.IsValidForSaveAsNew) return;

    this._localSaving = true;
    this.save.emit({
      name: this.viewName || 'New View',
      description: this.viewDescription,
      isShared: this.isShared,
      saveAsNew: true,
      columns: this.visibleColumns,
      sortField: this.sortField,
      sortDirection: this.sortDirection,
      sortItems: [...this.sortItems],
      smartFilterEnabled: this.smartFilterEnabled,
      smartFilterPrompt: this.smartFilterPrompt,
      filterState: this.hasActiveFilters() ? this.filterState : null,
      aggregatesConfig: this.buildAggregatesConfig()
    });
  }

  /**
   * Save default view settings to user settings
   * Used for dynamic/default views that don't have a stored view entity
   */
  onSaveDefaults(): void {
    // BUG-003: Guard against double-clicks with local flag
    if (this.isSaving || this._localSaving) return;

    this._localSaving = true;
    this.saveDefaults.emit({
      name: 'Default',
      description: '',
      isShared: false,
      saveAsNew: false,
      columns: this.visibleColumns,
      sortField: this.sortField,
      sortDirection: this.sortDirection,
      sortItems: [...this.sortItems],
      smartFilterEnabled: this.smartFilterEnabled,
      smartFilterPrompt: this.smartFilterPrompt,
      filterState: this.hasActiveFilters() ? this.filterState : null,
      aggregatesConfig: this.buildAggregatesConfig()
    });
  }

  // Delete confirmation state
  public showDeleteConfirm: boolean = false;

  /**
   * Delete the view - shows confirmation dialog
   */
  onDelete(): void {
    this.showDeleteConfirm = true;
    this.cdr.detectChanges();
  }

  /**
   * Confirmed delete from dialog
   */
  OnDeleteConfirmed(): void {
    this.showDeleteConfirm = false;
    this.delete.emit();
  }

  /**
   * Cancelled delete from dialog
   */
  OnDeleteCancelled(): void {
    this.showDeleteConfirm = false;
    this.cdr.detectChanges();
  }

  /**
   * Duplicate the current view (F-005)
   */
  OnDuplicate(): void {
    this.duplicate.emit();
  }

  /**
   * Set the active tab
   */
  setActiveTab(tab: 'columns' | 'sorting' | 'filters' | 'aggregates' | 'settings'): void {
    this.activeTab = tab;
    this.formatEditingColumn = null; // Close format editor when switching tabs
    this.cdr.detectChanges();
  }

  /**
   * Set the filter mode (smart or traditional)
   * BUG-006: Shows confirmation when switching if active mode has data
   */
  setFilterMode(mode: 'smart' | 'traditional'): void {
    if (this.filterMode === mode) return;

    // Check if current mode has data that would be lost
    const currentModeHasData = this.currentFilterModeHasData();

    if (currentModeHasData) {
      // Show confirmation dialog before switching
      this.pendingFilterModeSwitch = mode;
      this.showFilterModeSwitchConfirm = true;
      this.cdr.detectChanges();
      return;
    }

    this.applyFilterModeSwitch(mode);
  }

  /**
   * Check if the current filter mode has user-entered data
   */
  private currentFilterModeHasData(): boolean {
    if (this.filterMode === 'smart') {
      return !!this.smartFilterPrompt.trim();
    } else {
      return this.getFilterCount() > 0;
    }
  }

  /**
   * Confirm the filter mode switch (called from ConfirmDialog)
   */
  OnFilterModeSwitchConfirmed(): void {
    if (this.pendingFilterModeSwitch) {
      this.applyFilterModeSwitch(this.pendingFilterModeSwitch);
    }
    this.showFilterModeSwitchConfirm = false;
    this.pendingFilterModeSwitch = null;
  }

  /**
   * Cancel the filter mode switch (called from ConfirmDialog)
   */
  OnFilterModeSwitchCancelled(): void {
    this.showFilterModeSwitchConfirm = false;
    this.pendingFilterModeSwitch = null;
  }

  /**
   * Apply the filter mode switch - saves current mode data and restores target mode data
   */
  private applyFilterModeSwitch(mode: 'smart' | 'traditional'): void {
    // Save current mode's data before switching
    if (this.filterMode === 'smart') {
      this.savedSmartFilterPrompt = this.smartFilterPrompt;
    } else {
      this.savedTraditionalFilter = this.filterState;
    }

    this.filterMode = mode;

    // Restore target mode's saved data or clear
    if (mode === 'smart') {
      this.smartFilterEnabled = true;
      this.smartFilterPrompt = this.savedSmartFilterPrompt;
      this.filterState = createEmptyFilter();
    } else {
      this.smartFilterEnabled = false;
      this.smartFilterPrompt = '';
      this.smartFilterExplanation = '';
      this.filterState = this.savedTraditionalFilter;
    }

    this.cdr.detectChanges();
  }

  /**
   * Apply a smart filter example to the prompt field
   */
  applySmartFilterExample(example: string): void {
    this.smartFilterPrompt = example;
    this.cdr.detectChanges();
  }

  // ========================================
  // STYLE UPDATE HELPERS
  // ========================================

  /**
   * Toggle a header style property
   */
  toggleHeaderStyle(prop: keyof ColumnTextStyle): void {
    if (!this.formatEditingColumn?.format) return;

    const format = this.formatEditingColumn.format;
    if (!format.headerStyle) {
      format.headerStyle = {};
    }

    if (prop === 'bold' || prop === 'italic' || prop === 'underline') {
      format.headerStyle[prop] = !format.headerStyle[prop];
    }
    this.cdr.detectChanges();
  }

  /**
   * Update the user-defined display name for a column
   */
  updateUserDisplayName(value: string): void {
    if (!this.formatEditingColumn) return;

    // Set to undefined if empty string, otherwise use the value
    this.formatEditingColumn.userDisplayName = value.trim() || undefined;
    this.cdr.detectChanges();
  }

  /**
   * Update a header style color property
   */
  updateHeaderColor(prop: 'color' | 'backgroundColor', value: string): void {
    if (!this.formatEditingColumn?.format) return;

    const format = this.formatEditingColumn.format;
    if (!format.headerStyle) {
      format.headerStyle = {};
    }
    format.headerStyle[prop] = value;
    this.cdr.detectChanges();
  }

  /**
   * Toggle a cell style property
   */
  toggleCellStyle(prop: keyof ColumnTextStyle): void {
    if (!this.formatEditingColumn?.format) return;

    const format = this.formatEditingColumn.format;
    if (!format.cellStyle) {
      format.cellStyle = {};
    }

    if (prop === 'bold' || prop === 'italic' || prop === 'underline') {
      format.cellStyle[prop] = !format.cellStyle[prop];
    }
    this.cdr.detectChanges();
  }

  /**
   * Update a cell style color property
   */
  updateCellColor(prop: 'color' | 'backgroundColor', value: string): void {
    if (!this.formatEditingColumn?.format) return;

    const format = this.formatEditingColumn.format;
    if (!format.cellStyle) {
      format.cellStyle = {};
    }
    format.cellStyle[prop] = value;
    this.cdr.detectChanges();
  }

  // ========================================
  // AGGREGATE MANAGEMENT
  // ========================================

  /**
   * Open dialog to add a new aggregate
   */
  openAddAggregateDialog(): void {
    this.editingAggregate = null;
    this.showAggregateDialog = true;
    this.cdr.detectChanges();
  }

  /**
   * Open dialog to edit an existing aggregate
   */
  editAggregate(aggregate: ViewGridAggregate): void {
    this.editingAggregate = { ...aggregate };
    this.showAggregateDialog = true;
    this.cdr.detectChanges();
  }

  /**
   * Close the aggregate dialog
   */
  closeAggregateDialog(): void {
    this.showAggregateDialog = false;
    this.editingAggregate = null;
    this.cdr.detectChanges();
  }

  /**
   * Handle saving an aggregate from the dialog
   */
  onAggregateSave(aggregate: ViewGridAggregate): void {
    const existingIndex = this.aggregates.findIndex(a => a.id === aggregate.id);

    if (existingIndex >= 0) {
      // Update existing
      this.aggregates[existingIndex] = aggregate;
    } else {
      // Add new with order at end
      aggregate.order = this.aggregates.length;
      this.aggregates.push(aggregate);
    }

    this.closeAggregateDialog();
  }

  /**
   * Remove an aggregate
   */
  removeAggregate(aggregate: ViewGridAggregate): void {
    const index = this.aggregates.findIndex(a => a.id === aggregate.id);
    if (index >= 0) {
      this.aggregates.splice(index, 1);
      // Re-order remaining aggregates
      this.aggregates.forEach((a, i) => a.order = i);
      this.cdr.detectChanges();
    }
  }

  /**
   * Toggle aggregate enabled state (BUG-012: immutable update, no excessive logging)
   */
  toggleAggregateEnabled(aggregate: ViewGridAggregate, event?: MouseEvent): void {
    // Stop event propagation to prevent any parent handlers
    if (event) {
      event.preventDefault();
      event.stopPropagation();
    }

    // Find by ID first, fall back to object reference or label
    let index = -1;
    if (aggregate.id) {
      index = this.aggregates.findIndex(a => a.id === aggregate.id);
    }
    if (index < 0) {
      index = this.aggregates.indexOf(aggregate);
    }
    if (index < 0 && aggregate.label) {
      index = this.aggregates.findIndex(a => a.label === aggregate.label && a.expression === aggregate.expression);
    }

    if (index >= 0) {
      const updatedAggregate: ViewGridAggregate = {
        ...this.aggregates[index],
        enabled: this.aggregates[index].enabled === false
      };
      // Replace entire array to trigger change detection
      const newAggregates = [...this.aggregates];
      newAggregates[index] = updatedAggregate;
      this.aggregates = newAggregates;
      this.cdr.detectChanges();
    }
  }

  /**
   * Move aggregate up in order
   */
  moveAggregateUp(aggregate: ViewGridAggregate): void {
    const index = this.aggregates.indexOf(aggregate);
    if (index > 0) {
      const prev = this.aggregates[index - 1];
      this.aggregates[index - 1] = aggregate;
      this.aggregates[index] = prev;
      this.aggregates.forEach((a, i) => a.order = i);
      this.cdr.detectChanges();
    }
  }

  /**
   * Move aggregate down in order
   */
  moveAggregateDown(aggregate: ViewGridAggregate): void {
    const index = this.aggregates.indexOf(aggregate);
    if (index < this.aggregates.length - 1) {
      const next = this.aggregates[index + 1];
      this.aggregates[index + 1] = aggregate;
      this.aggregates[index] = next;
      this.aggregates.forEach((a, i) => a.order = i);
      this.cdr.detectChanges();
    }
  }

  /**
   * Get enabled aggregates count
   */
  get enabledAggregatesCount(): number {
    return this.aggregates.filter(a => a.enabled !== false).length;
  }

  /**
   * Get card aggregates
   */
  get cardAggregates(): ViewGridAggregate[] {
    return this.aggregates.filter(a => a.displayType === 'card');
  }

  /**
   * Get column aggregates
   */
  get columnAggregates(): ViewGridAggregate[] {
    return this.aggregates.filter(a => a.displayType === 'column');
  }

  /**
   * Build aggregates config from current state
   */
  private buildAggregatesConfig(): ViewGridAggregatesConfig | null {
    if (this.aggregates.length === 0) return null;

    return {
      display: { ...DEFAULT_AGGREGATE_DISPLAY },
      expressions: [...this.aggregates]
    };
  }
}
