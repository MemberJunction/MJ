import { Component, Input, Output, EventEmitter, OnChanges, OnInit, SimpleChanges, ChangeDetectorRef, HostListener } from '@angular/core';
import { BaseAngularComponent } from '@memberjunction/ng-base-types';
import { EntityInfo, EntityFieldInfo, Metadata } from '@memberjunction/core';
import {
  MJUserViewEntityExtended,
  ViewColumnInfo,
  ViewGridState,
  MJUserViewEntity_IGridColumnSetting as ViewGridColumnSetting,
  MJUserViewEntity_IColumnFormat as ColumnFormat,
  MJUserViewEntity_IColumnTextStyle as ColumnTextStyle,
  MJUserViewEntity_IColumnConditionalRule as ColumnConditionalRule,
  MJUserViewEntity_IGridAggregatesConfig as ViewGridAggregatesConfig,
  MJUserViewEntity_IGridAggregate as ViewGridAggregate,
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
  Name: string;
  Description: string;
  IsShared: boolean;
  SaveAsNew: boolean;
  Columns: ColumnConfig[];
  /** @deprecated Use SortItems instead for multi-sort support */
  SortField: string | null;
  /** @deprecated Use SortItems instead for multi-sort support */
  SortDirection: 'asc' | 'desc';
  /** Multi-column sort configuration (ordered by priority) */
  SortItems: SortItem[];
  SmartFilterEnabled: boolean;
  SmartFilterPrompt: string;
  /** Traditional filter state in Kendo-compatible JSON format */
  FilterState: CompositeFilterDescriptor | null;
  /** Aggregates configuration */
  AggregatesConfig: ViewGridAggregatesConfig | null;
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
export class ViewConfigPanelComponent extends BaseAngularComponent implements OnInit, OnChanges  {
  /**
   * The entity being viewed
   */
  @Input() Entity: EntityInfo | null = null;

  /**
   * The current view entity (null for default view)
   */
  @Input() ViewEntity: MJUserViewEntityExtended | null = null;

  /**
   * Whether the panel is open
   */
  @Input() IsOpen: boolean = false;

  /**
   * Current grid state from the grid (includes live column widths/order from user interaction)
   * This takes precedence over viewEntity.Columns for showing current state
   */
  @Input() CurrentGridState: ViewGridState | null = null;

  /**
   * Sample data for column format preview (first few records)
   */
  @Input() SampleData: Record<string, unknown>[] = [];

  /**
   * Emitted when the panel should close
   */
  @Output() Close = new EventEmitter<void>();

  /**
   * Emitted when the view should be saved
   */
  @Output() Save = new EventEmitter<ViewSaveEvent>();

  /**
   * Emitted when default view settings should be saved to user settings
   * (Used for dynamic/default views that persist to MJ: User Settings)
   */
  @Output() SaveDefaults = new EventEmitter<ViewSaveEvent>();

  /**
   * Emitted when the view should be deleted
   */
  @Output() Delete = new EventEmitter<void>();

  /**
   * Emitted when filter dialog should be opened (at dashboard level for full width)
   */
  @Output() OpenFilterDialogRequest = new EventEmitter<{
    filterState: CompositeFilterDescriptor;
    filterFields: FilterFieldInfo[];
  }>();

  /**
   * Filter state from external dialog (set by parent after dialog closes)
   */
  @Input() ExternalFilterState: CompositeFilterDescriptor | null = null;

  /**
   * When true, the panel is in "create new view" mode — shows the Settings tab
   * and a "Create View" button even without a viewEntity.
   */
  @Input() DefaultSaveAsNew: boolean = false;

  /**
   * Pre-populated view name from the quick save dialog (used when DefaultSaveAsNew is true)
   */
  @Input() PendingNewViewName: string = '';

  /**
   * Pre-populated description from the quick save dialog (used when DefaultSaveAsNew is true)
   */
  @Input() PendingNewViewDescription: string = '';

  /**
   * Pre-populated sharing preference from the quick save dialog (used when DefaultSaveAsNew is true)
   */
  @Input() PendingNewViewIsShared: boolean = false;

  /**
   * Emitted when user wants to duplicate the current view (F-005)
   */
  @Output() Duplicate = new EventEmitter<void>();

  // Form state
  public ViewName: string = '';
  public ViewDescription: string = '';
  public IsShared: boolean = false;
  public Columns: ColumnConfig[] = [];
  /** @deprecated Use sortItems instead */
  public SortField: string | null = null;
  /** @deprecated Use sortItems instead */
  public SortDirection: 'asc' | 'desc' = 'asc';
  /** Multi-column sort configuration (ordered by priority) */
  public SortItems: SortItem[] = [];

  // Sort drag state
  public DraggedSortItem: SortItem | null = null;
  public DropTargetSortItem: SortItem | null = null;
  public SortDropPosition: 'before' | 'after' | null = null;

  // Available sort directions for dropdown
  public SortDirections = [
    { name: 'Ascending', value: 'asc' as const },
    { name: 'Descending', value: 'desc' as const }
  ];

  // Smart Filter state
  public SmartFilterEnabled: boolean = false;
  public SmartFilterPrompt: string = '';
  public SmartFilterExplanation: string = '';

  // Traditional Filter state
  public FilterState: CompositeFilterDescriptor = createEmptyFilter();
  public FilterFields: FilterFieldInfo[] = [];

  // Filter mode: 'smart' or 'traditional' (mutually exclusive)
  public FilterMode: 'smart' | 'traditional' = 'smart';

  // Aggregates state
  public Aggregates: ViewGridAggregate[] = [];
  public ShowAggregateDialog: boolean = false;
  public EditingAggregate: ViewGridAggregate | null = null;

  // Saved filter state for mode switching (BUG-006: preserve both modes' data)
  private savedSmartFilterPrompt: string = '';
  private savedTraditionalFilter: CompositeFilterDescriptor = createEmptyFilter();

  // Filter mode switch confirmation (BUG-006)
  public ShowFilterModeSwitchConfirm: boolean = false;
  public PendingFilterModeSwitch: 'smart' | 'traditional' | null = null;

  // Local saving guard (BUG-003: race condition on double-click)
  private _localSaving: boolean = false;

  // UI state
  public ActiveTab: 'columns' | 'sorting' | 'filters' | 'aggregates' | 'settings' = 'columns';
  @Input() IsSaving: boolean = false;
  public ColumnSearchText: string = '';

  // Drag state for column reordering
  public DraggedColumn: ColumnConfig | null = null;
  public DropTargetColumn: ColumnConfig | null = null;
  public DropPosition: 'before' | 'after' | null = null;

  // Column format editing state
  public FormatEditingColumn: ColumnConfig | null = null;

  // Panel resize state
  public IsResizing: boolean = false;
  public PanelWidth: number = 520;
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
  get IsIconOnlyMode(): boolean {
    return this.PanelWidth < this.ICON_ONLY_THRESHOLD;
  }

  private metadata = this.ProviderToUse;

  constructor(private cdr: ChangeDetectorRef) {
  super();}

  /**
   * Handle keyboard shortcuts
   * Escape: Close the panel or format sub-panel
   */
  @HostListener('document:keydown.escape')
  HandleEscape(): void {
    if (this.FormatEditingColumn) {
      this.CloseFormatEditor();
    } else if (this.IsOpen) {
      this.OnClose();
    }
  }

  // ========================================
  // PANEL RESIZE HANDLERS
  // ========================================

  /**
   * Start resizing the panel
   */
  OnResizeStart(event: MouseEvent): void {
    event.preventDefault();
    this.IsResizing = true;
    this.resizeStartX = event.clientX;
    this.resizeStartWidth = this.PanelWidth;

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
    if (!this.IsResizing) return;

    // Calculate new width (panel is on the right, so moving left increases width)
    const deltaX = this.resizeStartX - event.clientX;
    let newWidth = this.resizeStartWidth + deltaX;

    // Clamp to min/max bounds
    newWidth = Math.max(this.MIN_PANEL_WIDTH, Math.min(this.MAX_PANEL_WIDTH, newWidth));

    this.PanelWidth = newWidth;
    this.cdr.detectChanges();
  };

  /**
   * End resizing the panel (bound to document)
   */
  private onResizeEnd = (): void => {
    this.IsResizing = false;
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
          this.PanelWidth = width;
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
      await UserInfoEngine.Instance.SetSetting(this.PANEL_WIDTH_SETTING_KEY, String(this.PanelWidth));
    } catch (error) {
      console.warn('[ViewConfigPanel] Failed to save panel width:', error);
    }
  }

  ngOnChanges(changes: SimpleChanges): void {
    // Reset to first tab and clear search when panel opens
    if (changes['IsOpen'] && this.IsOpen) {
      // BUG-011: If DefaultSaveAsNew is set, open on Settings tab with name focused
      this.ActiveTab = this.DefaultSaveAsNew ? 'settings' : 'columns';
      this.ColumnSearchText = '';
      this.FormatEditingColumn = null;
      this._localSaving = false;
      // Also close any open aggregate dialog
      this.ShowAggregateDialog = false;
      this.EditingAggregate = null;
      // Close filter mode switch confirm
      this.ShowFilterModeSwitchConfirm = false;
      this.PendingFilterModeSwitch = null;
      // Re-initialize from entity to get fresh state
      this.initializeFromEntity();
    }

    // BUG-003: Reset local saving guard when isSaving transitions from true to false
    if (changes['IsSaving'] && !this.IsSaving && changes['IsSaving'].previousValue === true) {
      this._localSaving = false;
    }

    if (changes['Entity'] || changes['ViewEntity'] || changes['CurrentGridState']) {
      this.initializeFromEntity();
    }

    // Apply external filter state when it changes (from dashboard-level dialog)
    if (changes['ExternalFilterState'] && this.ExternalFilterState) {
      this.FilterState = this.ExternalFilterState;
      this.cdr.detectChanges();
    }
  }

  /**
   * Initialize form state from entity and view
   * Priority for column state: currentGridState > viewEntity.Columns > entity defaults
   */
  private initializeFromEntity(): void {
    if (!this.Entity) {
      this.Columns = [];
      return;
    }

    // Initialize columns from entity fields (including __mj_ fields for audit/timestamp info)
    this.Columns = this.Entity.Fields
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
    if (this.CurrentGridState?.columnSettings && this.CurrentGridState.columnSettings.length > 0) {
      this.applyGridStateToColumns(this.CurrentGridState.columnSettings);

      // Also apply sort from currentGridState (supports multi-sort)
      if (this.CurrentGridState.sortSettings && this.CurrentGridState.sortSettings.length > 0) {
        this.SortItems = this.CurrentGridState.sortSettings.map(s => ({
          field: s.field,
          direction: s.dir
        }));
        // Keep legacy fields in sync for backward compatibility
        this.SortField = this.CurrentGridState.sortSettings[0].field;
        this.SortDirection = this.CurrentGridState.sortSettings[0].dir;
      } else {
        this.SortItems = [];
      }
    }
    // Priority 2: If we have a view, apply its column configuration
    else if (this.ViewEntity) {
      const viewColumns = this.ViewEntity.Columns;
      if (viewColumns && viewColumns.length > 0) {
        // Mark all columns as hidden initially
        this.Columns.forEach(c => c.visible = false);

        // Apply view column settings
        viewColumns.forEach((vc, idx) => {
          const column = this.Columns.find(c => c.fieldName.toLowerCase() === vc.Name?.toLowerCase());
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
        this.Columns.sort((a, b) => a.orderIndex - b.orderIndex);
      }

      // Apply view's sort configuration (supports multi-sort)
      const sortInfo = this.ViewEntity.ViewSortInfo;
      if (sortInfo && sortInfo.length > 0) {
        this.SortItems = sortInfo.map(s => ({
          field: s.field,
          direction: s.direction === 'Desc' ? 'desc' as const : 'asc' as const
        }));
        // Keep legacy fields in sync for backward compatibility
        this.SortField = sortInfo[0].field;
        this.SortDirection = sortInfo[0].direction === 'Desc' ? 'desc' : 'asc';
      } else {
        this.SortItems = [];
      }
    }

    // Initialize filter fields from entity
    this.FilterFields = this.buildFilterFields();

    // Apply view entity metadata (name, description, etc.) if available
    if (this.ViewEntity) {
      this.ViewName = this.ViewEntity.Name;
      this.ViewDescription = this.ViewEntity.Description || '';
      this.IsShared = this.ViewEntity.IsShared;

      // Apply view's smart filter configuration
      this.SmartFilterEnabled = this.ViewEntity.SmartFilterEnabled || false;
      this.SmartFilterPrompt = this.ViewEntity.SmartFilterPrompt || '';
      this.SmartFilterExplanation = this.ViewEntity.SmartFilterExplanation || '';

      // Apply view's traditional filter state
      this.FilterState = this.parseFilterState(this.ViewEntity.FilterState);

      // Set filter mode based on which type of filter is active
      // Smart filter takes precedence if enabled
      if (this.SmartFilterEnabled && this.SmartFilterPrompt) {
        this.FilterMode = 'smart';
      } else if (this.GetFilterCount() > 0) {
        this.FilterMode = 'traditional';
      } else {
        // Default to smart mode for new/empty filters (promote AI filtering)
        this.FilterMode = 'smart';
        this.SmartFilterEnabled = true;
      }
    } else {
      // Default view or pending new view — use pending values if creating a new view
      this.ViewName = this.DefaultSaveAsNew ? this.PendingNewViewName : '';
      this.ViewDescription = this.DefaultSaveAsNew ? this.PendingNewViewDescription : '';
      this.IsShared = this.DefaultSaveAsNew ? this.PendingNewViewIsShared : false;
      if (!this.CurrentGridState?.sortSettings?.length) {
        this.SortField = null;
        this.SortDirection = 'asc';
        this.SortItems = [];
      }
      this.SmartFilterPrompt = '';
      this.SmartFilterExplanation = '';
      this.FilterState = createEmptyFilter();
      // Default to smart mode (promote AI filtering)
      this.FilterMode = 'smart';
      this.SmartFilterEnabled = true;
    }

    // Load aggregates from currentGridState if available
    if (this.CurrentGridState?.aggregates?.expressions) {
      this.Aggregates = [...this.CurrentGridState.aggregates.expressions];
    } else {
      this.Aggregates = [];
    }

    this.cdr.detectChanges();
  }

  /**
   * Build filter fields from entity fields (including __mj_ fields for filtering by timestamps)
   */
  private buildFilterFields(): FilterFieldInfo[] {
    if (!this.Entity) return [];

    return this.Entity.Fields
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
  OnFilterChange(filter: CompositeFilterDescriptor): void {
    this.FilterState = filter;
    this.cdr.detectChanges();
  }

  /**
   * Open the filter dialog - emits event to parent (dashboard) which renders the dialog at viewport level
   */
  OpenFilterDialog(): void {
    this.OpenFilterDialogRequest.emit({
      filterState: this.FilterState,
      filterFields: this.FilterFields
    });
  }

  /**
   * Get the count of active filter rules
   */
  GetFilterCount(): number {
    return this.countFilters(this.FilterState);
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
  GetFilterSummary(): string {
    const count = this.GetFilterCount();
    if (count === 0) {
      return 'No filters applied';
    }
    return `${count} filter${count !== 1 ? 's' : ''} active`;
  }

  /**
   * Clear all filters
   */
  ClearFilters(): void {
    this.FilterState = createEmptyFilter();
    this.cdr.detectChanges();
  }

  /**
   * Apply grid state column settings to the columns array
   */
  private applyGridStateToColumns(gridColumns: ViewGridColumnSetting[]): void {
    // Mark all columns as hidden initially
    this.Columns.forEach(c => c.visible = false);

    // Apply grid state column settings
    gridColumns.forEach((gc, idx) => {
      const column = this.Columns.find(c => c.fieldName.toLowerCase() === gc.Name.toLowerCase());
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
    this.Columns.sort((a, b) => a.orderIndex - b.orderIndex);
  }

  /**
   * Get visible columns
   */
  get VisibleColumns(): ColumnConfig[] {
    return this.Columns.filter(c => c.visible);
  }

  /**
   * Get hidden columns
   */
  get HiddenColumns(): ColumnConfig[] {
    return this.Columns.filter(c => !c.visible);
  }

  /**
   * Get filtered columns for search
   */
  get FilteredHiddenColumns(): ColumnConfig[] {
    if (!this.ColumnSearchText) {
      return this.HiddenColumns;
    }
    const search = this.ColumnSearchText.toLowerCase();
    return this.HiddenColumns.filter(c =>
      c.displayName.toLowerCase().includes(search) ||
      c.fieldName.toLowerCase().includes(search)
    );
  }

  /**
   * Get sortable fields for dropdown (including __mj_ fields for sorting by timestamps)
   */
  get SortableFields(): EntityFieldInfo[] {
    if (!this.Entity) return [];
    return this.Entity.Fields.filter(f =>
      !f.IsBinaryFieldType // Exclude binary fields from sorting
    );
  }

  /**
   * Check if the current user can edit the view
   */
  get CanEdit(): boolean {
    if (!this.ViewEntity) return true; // Can always create new
    return this.ViewEntity.UserCanEdit;
  }

  /**
   * Check if the current user can delete the view
   */
  get CanDelete(): boolean {
    if (!this.ViewEntity) return false; // Can't delete default
    return this.ViewEntity.UserCanDelete;
  }

  /**
   * Toggle column visibility
   */
  ToggleColumnVisibility(column: ColumnConfig): void {
    column.visible = !column.visible;
    if (column.visible) {
      // Add to end of visible columns
      column.orderIndex = this.VisibleColumns.length;
    }
    this.cdr.detectChanges();
  }

  /**
   * Move column up in order
   */
  MoveColumnUp(column: ColumnConfig): void {
    const visibleCols = this.VisibleColumns;
    const currentIndex = visibleCols.indexOf(column);
    if (currentIndex > 0) {
      const prevColumn = visibleCols[currentIndex - 1];
      const tempOrder = column.orderIndex;
      column.orderIndex = prevColumn.orderIndex;
      prevColumn.orderIndex = tempOrder;
      this.Columns.sort((a, b) => a.orderIndex - b.orderIndex);
      this.cdr.detectChanges();
    }
  }

  /**
   * Move column down in order
   */
  MoveColumnDown(column: ColumnConfig): void {
    const visibleCols = this.VisibleColumns;
    const currentIndex = visibleCols.indexOf(column);
    if (currentIndex < visibleCols.length - 1) {
      const nextColumn = visibleCols[currentIndex + 1];
      const tempOrder = column.orderIndex;
      column.orderIndex = nextColumn.orderIndex;
      nextColumn.orderIndex = tempOrder;
      this.Columns.sort((a, b) => a.orderIndex - b.orderIndex);
      this.cdr.detectChanges();
    }
  }

  // ========================================
  // DRAG AND DROP WITH DROP INDICATOR
  // ========================================

  /**
   * Handle drag start for column reordering
   */
  OnDragStart(event: DragEvent, column: ColumnConfig): void {
    this.DraggedColumn = column;
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
  OnDragOver(event: DragEvent, column: ColumnConfig): void {
    event.preventDefault();
    if (event.dataTransfer) {
      event.dataTransfer.dropEffect = 'move';
    }

    if (!this.DraggedColumn || this.DraggedColumn === column) {
      this.DropTargetColumn = null;
      this.DropPosition = null;
      return;
    }

    // Calculate if we're in the top or bottom half of the target
    const rect = (event.currentTarget as HTMLElement).getBoundingClientRect();
    const y = event.clientY - rect.top;
    const threshold = rect.height / 2;

    this.DropTargetColumn = column;
    this.DropPosition = y < threshold ? 'before' : 'after';
  }

  /**
   * Handle drag leave - clear drop indicator
   */
  OnDragLeave(event: DragEvent): void {
    // Only clear if we're leaving the column item, not entering a child element
    const relatedTarget = event.relatedTarget as HTMLElement;
    const currentTarget = event.currentTarget as HTMLElement;
    if (!currentTarget.contains(relatedTarget)) {
      this.DropTargetColumn = null;
      this.DropPosition = null;
    }
  }

  /**
   * Handle drop for column reordering
   */
  OnDrop(event: DragEvent, targetColumn: ColumnConfig): void {
    event.preventDefault();

    if (this.DraggedColumn && this.DraggedColumn !== targetColumn && this.DropPosition) {
      const visibleCols = this.VisibleColumns;
      const draggedIndex = visibleCols.indexOf(this.DraggedColumn);
      let targetIndex = visibleCols.indexOf(targetColumn);

      // Adjust target index based on drop position
      if (this.DropPosition === 'after') {
        targetIndex++;
      }

      // If dragging from before target, adjust for removal
      if (draggedIndex < targetIndex) {
        targetIndex--;
      }

      // Reorder the columns
      this.reorderColumn(this.DraggedColumn, targetIndex);
    }

    this.clearDragState();
  }

  /**
   * Handle drag end
   */
  OnDragEnd(event: DragEvent): void {
    (event.target as HTMLElement).classList.remove('dragging');
    this.clearDragState();
  }

  /**
   * Clear all drag state
   */
  private clearDragState(): void {
    this.DraggedColumn = null;
    this.DropTargetColumn = null;
    this.DropPosition = null;
    this.cdr.detectChanges();
  }

  /**
   * Reorder a column to a new position
   */
  private reorderColumn(column: ColumnConfig, newIndex: number): void {
    const visibleCols = this.VisibleColumns;

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
    this.Columns.sort((a, b) => a.orderIndex - b.orderIndex);
    this.cdr.detectChanges();
  }

  /**
   * Check if drop indicator should show before a column
   */
  IsDropBefore(column: ColumnConfig): boolean {
    return this.DropTargetColumn === column && this.DropPosition === 'before';
  }

  /**
   * Check if drop indicator should show after a column
   */
  IsDropAfter(column: ColumnConfig): boolean {
    return this.DropTargetColumn === column && this.DropPosition === 'after';
  }

  // ========================================
  // MULTI-SORT MANAGEMENT
  // ========================================

  /**
   * Add a new sort level
   */
  AddSortLevel(): void {
    // Find the first sortable field not already in use
    const usedFields = new Set(this.SortItems.map(s => s.field));
    const availableField = this.SortableFields.find(f => !usedFields.has(f.Name));

    if (availableField) {
      this.SortItems.push({
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
  RemoveSortLevel(sortItem: SortItem): void {
    const index = this.SortItems.indexOf(sortItem);
    if (index > -1) {
      this.SortItems.splice(index, 1);
      this.syncLegacySortFields();
      this.cdr.detectChanges();
    }
  }

  /**
   * Get the display name for a field
   */
  GetFieldDisplayName(fieldName: string): string {
    const field = this.SortableFields.find(f => f.Name === fieldName);
    return field?.DisplayNameOrName || fieldName;
  }

  /**
   * Get fields available for a sort item (excludes already selected fields except current)
   */
  GetAvailableFieldsForSort(currentSortItem: SortItem): EntityFieldInfo[] {
    const usedFields = new Set(this.SortItems.map(s => s.field));
    return this.SortableFields.filter(f =>
      f.Name === currentSortItem.field || !usedFields.has(f.Name)
    );
  }

  /**
   * Handle sort field change
   */
  OnSortFieldChange(sortItem: SortItem, fieldName: string): void {
    sortItem.field = fieldName;
    this.syncLegacySortFields();
    this.cdr.detectChanges();
  }

  /**
   * Handle sort direction change
   */
  OnSortDirectionChange(sortItem: SortItem, direction: 'asc' | 'desc'): void {
    sortItem.direction = direction;
    this.syncLegacySortFields();
    this.cdr.detectChanges();
  }

  /**
   * Keep legacy sortField/sortDirection in sync with sortItems[0]
   */
  private syncLegacySortFields(): void {
    if (this.SortItems.length > 0) {
      this.SortField = this.SortItems[0].field;
      this.SortDirection = this.SortItems[0].direction;
    } else {
      this.SortField = null;
      this.SortDirection = 'asc';
    }
  }

  // ----------------------------------------
  // Sort Drag & Drop
  // ----------------------------------------

  /**
   * Handle drag start for sort item reordering
   */
  OnSortDragStart(event: DragEvent, sortItem: SortItem): void {
    this.DraggedSortItem = sortItem;
    if (event.dataTransfer) {
      event.dataTransfer.effectAllowed = 'move';
      event.dataTransfer.setData('text/plain', sortItem.field);
    }
    (event.target as HTMLElement).classList.add('dragging');
  }

  /**
   * Handle drag over for sort item reordering
   */
  OnSortDragOver(event: DragEvent, sortItem: SortItem): void {
    event.preventDefault();
    if (event.dataTransfer) {
      event.dataTransfer.dropEffect = 'move';
    }

    if (!this.DraggedSortItem || this.DraggedSortItem === sortItem) {
      this.DropTargetSortItem = null;
      this.SortDropPosition = null;
      return;
    }

    const rect = (event.currentTarget as HTMLElement).getBoundingClientRect();
    const y = event.clientY - rect.top;
    const threshold = rect.height / 2;

    this.DropTargetSortItem = sortItem;
    this.SortDropPosition = y < threshold ? 'before' : 'after';
  }

  /**
   * Handle drag leave for sort item
   */
  OnSortDragLeave(event: DragEvent): void {
    const relatedTarget = event.relatedTarget as HTMLElement;
    const currentTarget = event.currentTarget as HTMLElement;
    if (!currentTarget.contains(relatedTarget)) {
      this.DropTargetSortItem = null;
      this.SortDropPosition = null;
    }
  }

  /**
   * Handle drop for sort item reordering
   */
  OnSortDrop(event: DragEvent, targetSortItem: SortItem): void {
    event.preventDefault();

    if (this.DraggedSortItem && this.DraggedSortItem !== targetSortItem && this.SortDropPosition) {
      const draggedIndex = this.SortItems.indexOf(this.DraggedSortItem);
      let targetIndex = this.SortItems.indexOf(targetSortItem);

      // Adjust target index based on drop position
      if (this.SortDropPosition === 'after') {
        targetIndex++;
      }

      // If dragging from before target, adjust for removal
      if (draggedIndex < targetIndex) {
        targetIndex--;
      }

      // Remove from old position
      this.SortItems.splice(draggedIndex, 1);
      // Insert at new position
      this.SortItems.splice(targetIndex, 0, this.DraggedSortItem);

      this.syncLegacySortFields();
    }

    this.clearSortDragState();
  }

  /**
   * Handle drag end for sort item
   */
  OnSortDragEnd(event: DragEvent): void {
    (event.target as HTMLElement).classList.remove('dragging');
    this.clearSortDragState();
  }

  /**
   * Clear sort drag state
   */
  private clearSortDragState(): void {
    this.DraggedSortItem = null;
    this.DropTargetSortItem = null;
    this.SortDropPosition = null;
    this.cdr.detectChanges();
  }

  /**
   * Check if drop indicator should show before a sort item
   */
  IsSortDropBefore(sortItem: SortItem): boolean {
    return this.DropTargetSortItem === sortItem && this.SortDropPosition === 'before';
  }

  /**
   * Check if drop indicator should show after a sort item
   */
  IsSortDropAfter(sortItem: SortItem): boolean {
    return this.DropTargetSortItem === sortItem && this.SortDropPosition === 'after';
  }

  // ========================================
  // COLUMN FORMAT EDITOR
  // ========================================

  /**
   * Open the format editor for a column
   */
  OpenFormatEditor(column: ColumnConfig): void {
    // Initialize format if not present
    if (!column.format) {
      column.format = this.getDefaultFormat(column.field);
    }
    this.FormatEditingColumn = column;
    this.cdr.detectChanges();
  }

  /**
   * Close the format editor
   */
  CloseFormatEditor(): void {
    this.FormatEditingColumn = null;
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
  HasCustomFormat(column: ColumnConfig): boolean {
    return !!column.format && column.format.type !== 'auto';
  }

  /**
   * Clear formatting for a column
   */
  ClearColumnFormat(column: ColumnConfig): void {
    column.format = undefined;
    this.cdr.detectChanges();
  }

  /**
   * Get sample values for preview
   */
  GetSampleValues(column: ColumnConfig): unknown[] {
    if (!this.SampleData || this.SampleData.length === 0) {
      return this.getPlaceholderSamples(column.field);
    }
    return this.SampleData
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
  FormatPreviewValue(value: unknown, format: ColumnFormat | undefined): string {
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
  OnClose(): void {
    this.Close.emit();
  }

  /**
   * Check if filter state has any active filters
   */
  private hasActiveFilters(): boolean {
    return this.FilterState?.filters?.length > 0;
  }

  // ========================================
  // VALIDATION (BUG-004)
  // ========================================

  /**
   * Get validation errors for the current form state
   */
  get ValidationErrors(): string[] {
    const errors: string[] = [];
    if (!this.ViewName || !this.ViewName.trim()) {
      errors.push('View name is required');
    }
    if (this.VisibleColumns.length === 0) {
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
    return this.VisibleColumns.length > 0;
  }

  /**
   * Build a ViewConfigSummary for quick-save preview (F-003)
   */
  BuildSummary(): ViewConfigSummary {
    return {
      ColumnCount: this.VisibleColumns.length,
      FilterCount: this.FilterMode === 'traditional' ? this.GetFilterCount() : 0,
      SortCount: this.SortItems.length,
      SmartFilterActive: this.SmartFilterEnabled && !!this.SmartFilterPrompt.trim(),
      SmartFilterPrompt: this.SmartFilterPrompt,
      AggregateCount: this.Aggregates.filter(a => a.enabled !== false).length
    };
  }

  /**
   * Save the view
   */
  OnSave(): void {
    // BUG-003: Guard against double-clicks with local flag
    if (this.IsSaving || this._localSaving) return;
    // BUG-004: Validate before saving
    if (!this.IsValid) return;

    this._localSaving = true;
    this.Save.emit({
      Name: this.ViewName,
      Description: this.ViewDescription,
      IsShared: this.IsShared,
      SaveAsNew: false,
      Columns: this.VisibleColumns,
      SortField: this.SortField,
      SortDirection: this.SortDirection,
      SortItems: [...this.SortItems],
      SmartFilterEnabled: this.SmartFilterEnabled,
      SmartFilterPrompt: this.SmartFilterPrompt,
      FilterState: this.hasActiveFilters() ? this.FilterState : null,
      AggregatesConfig: this.buildAggregatesConfig()
    });
  }

  /**
   * Save as a new view
   */
  OnSaveAsNew(): void {
    // BUG-003: Guard against double-clicks with local flag
    if (this.IsSaving || this._localSaving) return;
    // BUG-004: Validate (name defaults to 'New View' if empty)
    if (!this.IsValidForSaveAsNew) return;

    this._localSaving = true;
    this.Save.emit({
      Name: this.ViewName || 'New View',
      Description: this.ViewDescription,
      IsShared: this.IsShared,
      SaveAsNew: true,
      Columns: this.VisibleColumns,
      SortField: this.SortField,
      SortDirection: this.SortDirection,
      SortItems: [...this.SortItems],
      SmartFilterEnabled: this.SmartFilterEnabled,
      SmartFilterPrompt: this.SmartFilterPrompt,
      FilterState: this.hasActiveFilters() ? this.FilterState : null,
      AggregatesConfig: this.buildAggregatesConfig()
    });
  }

  /**
   * Save default view settings to user settings
   * Used for dynamic/default views that don't have a stored view entity
   */
  OnSaveDefaults(): void {
    // BUG-003: Guard against double-clicks with local flag
    if (this.IsSaving || this._localSaving) return;

    this._localSaving = true;
    this.SaveDefaults.emit({
      Name: 'Default',
      Description: '',
      IsShared: false,
      SaveAsNew: false,
      Columns: this.VisibleColumns,
      SortField: this.SortField,
      SortDirection: this.SortDirection,
      SortItems: [...this.SortItems],
      SmartFilterEnabled: this.SmartFilterEnabled,
      SmartFilterPrompt: this.SmartFilterPrompt,
      FilterState: this.hasActiveFilters() ? this.FilterState : null,
      AggregatesConfig: this.buildAggregatesConfig()
    });
  }

  // Delete confirmation state
  public ShowDeleteConfirm: boolean = false;

  /**
   * Delete the view - shows confirmation dialog
   */
  OnDelete(): void {
    this.ShowDeleteConfirm = true;
    this.cdr.detectChanges();
  }

  /**
   * Confirmed delete from dialog
   */
  OnDeleteConfirmed(): void {
    this.ShowDeleteConfirm = false;
    this.Delete.emit();
  }

  /**
   * Cancelled delete from dialog
   */
  OnDeleteCancelled(): void {
    this.ShowDeleteConfirm = false;
    this.cdr.detectChanges();
  }

  /**
   * Duplicate the current view (F-005)
   */
  OnDuplicate(): void {
    this.Duplicate.emit();
  }

  /**
   * Set the active tab
   */
  SetActiveTab(tab: 'columns' | 'sorting' | 'filters' | 'aggregates' | 'settings'): void {
    this.ActiveTab = tab;
    this.FormatEditingColumn = null; // Close format editor when switching tabs
    this.cdr.detectChanges();
  }

  /**
   * Set the filter mode (smart or traditional)
   * BUG-006: Shows confirmation when switching if active mode has data
   */
  SetFilterMode(mode: 'smart' | 'traditional'): void {
    if (this.FilterMode === mode) return;

    // Check if current mode has data that would be lost
    const currentModeHasData = this.currentFilterModeHasData();

    if (currentModeHasData) {
      // Show confirmation dialog before switching
      this.PendingFilterModeSwitch = mode;
      this.ShowFilterModeSwitchConfirm = true;
      this.cdr.detectChanges();
      return;
    }

    this.applyFilterModeSwitch(mode);
  }

  /**
   * Check if the current filter mode has user-entered data
   */
  private currentFilterModeHasData(): boolean {
    if (this.FilterMode === 'smart') {
      return !!this.SmartFilterPrompt.trim();
    } else {
      return this.GetFilterCount() > 0;
    }
  }

  /**
   * Confirm the filter mode switch (called from ConfirmDialog)
   */
  OnFilterModeSwitchConfirmed(): void {
    if (this.PendingFilterModeSwitch) {
      this.applyFilterModeSwitch(this.PendingFilterModeSwitch);
    }
    this.ShowFilterModeSwitchConfirm = false;
    this.PendingFilterModeSwitch = null;
  }

  /**
   * Cancel the filter mode switch (called from ConfirmDialog)
   */
  OnFilterModeSwitchCancelled(): void {
    this.ShowFilterModeSwitchConfirm = false;
    this.PendingFilterModeSwitch = null;
  }

  /**
   * Apply the filter mode switch - saves current mode data and restores target mode data
   */
  private applyFilterModeSwitch(mode: 'smart' | 'traditional'): void {
    // Save current mode's data before switching
    if (this.FilterMode === 'smart') {
      this.savedSmartFilterPrompt = this.SmartFilterPrompt;
    } else {
      this.savedTraditionalFilter = this.FilterState;
    }

    this.FilterMode = mode;

    // Restore target mode's saved data or clear
    if (mode === 'smart') {
      this.SmartFilterEnabled = true;
      this.SmartFilterPrompt = this.savedSmartFilterPrompt;
      this.FilterState = createEmptyFilter();
    } else {
      this.SmartFilterEnabled = false;
      this.SmartFilterPrompt = '';
      this.SmartFilterExplanation = '';
      this.FilterState = this.savedTraditionalFilter;
    }

    this.cdr.detectChanges();
  }

  /**
   * Apply a smart filter example to the prompt field
   */
  ApplySmartFilterExample(example: string): void {
    this.SmartFilterPrompt = example;
    this.cdr.detectChanges();
  }

  // ========================================
  // STYLE UPDATE HELPERS
  // ========================================

  /**
   * Toggle a header style property
   */
  ToggleHeaderStyle(prop: keyof ColumnTextStyle): void {
    if (!this.FormatEditingColumn?.format) return;

    const format = this.FormatEditingColumn.format;
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
  UpdateUserDisplayName(value: string): void {
    if (!this.FormatEditingColumn) return;

    // Set to undefined if empty string, otherwise use the value
    this.FormatEditingColumn.userDisplayName = value.trim() || undefined;
    this.cdr.detectChanges();
  }

  /**
   * Update a header style color property
   */
  UpdateHeaderColor(prop: 'color' | 'backgroundColor', value: string): void {
    if (!this.FormatEditingColumn?.format) return;

    const format = this.FormatEditingColumn.format;
    if (!format.headerStyle) {
      format.headerStyle = {};
    }
    format.headerStyle[prop] = value;
    this.cdr.detectChanges();
  }

  /**
   * Toggle a cell style property
   */
  ToggleCellStyle(prop: keyof ColumnTextStyle): void {
    if (!this.FormatEditingColumn?.format) return;

    const format = this.FormatEditingColumn.format;
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
  UpdateCellColor(prop: 'color' | 'backgroundColor', value: string): void {
    if (!this.FormatEditingColumn?.format) return;

    const format = this.FormatEditingColumn.format;
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
  OpenAddAggregateDialog(): void {
    this.EditingAggregate = null;
    this.ShowAggregateDialog = true;
    this.cdr.detectChanges();
  }

  /**
   * Open dialog to edit an existing aggregate
   */
  EditAggregate(aggregate: ViewGridAggregate): void {
    this.EditingAggregate = { ...aggregate };
    this.ShowAggregateDialog = true;
    this.cdr.detectChanges();
  }

  /**
   * Close the aggregate dialog
   */
  CloseAggregateDialog(): void {
    this.ShowAggregateDialog = false;
    this.EditingAggregate = null;
    this.cdr.detectChanges();
  }

  /**
   * Handle saving an aggregate from the dialog
   */
  OnAggregateSave(aggregate: ViewGridAggregate): void {
    const existingIndex = this.Aggregates.findIndex(a => a.id === aggregate.id);

    if (existingIndex >= 0) {
      // Update existing
      this.Aggregates[existingIndex] = aggregate;
    } else {
      // Add new with order at end
      aggregate.order = this.Aggregates.length;
      this.Aggregates.push(aggregate);
    }

    this.CloseAggregateDialog();
  }

  /**
   * Remove an aggregate
   */
  RemoveAggregate(aggregate: ViewGridAggregate): void {
    const index = this.Aggregates.findIndex(a => a.id === aggregate.id);
    if (index >= 0) {
      this.Aggregates.splice(index, 1);
      // Re-order remaining aggregates
      this.Aggregates.forEach((a, i) => a.order = i);
      this.cdr.detectChanges();
    }
  }

  /**
   * Toggle aggregate enabled state (BUG-012: immutable update, no excessive logging)
   */
  ToggleAggregateEnabled(aggregate: ViewGridAggregate, event?: MouseEvent): void {
    // Stop event propagation to prevent any parent handlers
    if (event) {
      event.preventDefault();
      event.stopPropagation();
    }

    // Find by ID first, fall back to object reference or label
    let index = -1;
    if (aggregate.id) {
      index = this.Aggregates.findIndex(a => a.id === aggregate.id);
    }
    if (index < 0) {
      index = this.Aggregates.indexOf(aggregate);
    }
    if (index < 0 && aggregate.label) {
      index = this.Aggregates.findIndex(a => a.label === aggregate.label && a.expression === aggregate.expression);
    }

    if (index >= 0) {
      const updatedAggregate: ViewGridAggregate = {
        ...this.Aggregates[index],
        enabled: this.Aggregates[index].enabled === false
      };
      // Replace entire array to trigger change detection
      const newAggregates = [...this.Aggregates];
      newAggregates[index] = updatedAggregate;
      this.Aggregates = newAggregates;
      this.cdr.detectChanges();
    }
  }

  /**
   * Move aggregate up in order
   */
  MoveAggregateUp(aggregate: ViewGridAggregate): void {
    const index = this.Aggregates.indexOf(aggregate);
    if (index > 0) {
      const prev = this.Aggregates[index - 1];
      this.Aggregates[index - 1] = aggregate;
      this.Aggregates[index] = prev;
      this.Aggregates.forEach((a, i) => a.order = i);
      this.cdr.detectChanges();
    }
  }

  /**
   * Move aggregate down in order
   */
  MoveAggregateDown(aggregate: ViewGridAggregate): void {
    const index = this.Aggregates.indexOf(aggregate);
    if (index < this.Aggregates.length - 1) {
      const next = this.Aggregates[index + 1];
      this.Aggregates[index + 1] = aggregate;
      this.Aggregates[index] = next;
      this.Aggregates.forEach((a, i) => a.order = i);
      this.cdr.detectChanges();
    }
  }

  /**
   * Get enabled aggregates count
   */
  get EnabledAggregatesCount(): number {
    return this.Aggregates.filter(a => a.enabled !== false).length;
  }

  /**
   * Get card aggregates
   */
  get CardAggregates(): ViewGridAggregate[] {
    return this.Aggregates.filter(a => a.displayType === 'card');
  }

  /**
   * Get column aggregates
   */
  get ColumnAggregates(): ViewGridAggregate[] {
    return this.Aggregates.filter(a => a.displayType === 'column');
  }

  /**
   * Build aggregates config from current state
   */
  private buildAggregatesConfig(): ViewGridAggregatesConfig | null {
    if (this.Aggregates.length === 0) return null;

    return {
      display: { ...DEFAULT_AGGREGATE_DISPLAY },
      expressions: [...this.Aggregates]
    };
  }
}
