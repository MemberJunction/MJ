import { Component, Input, Output, EventEmitter, OnChanges, OnInit, SimpleChanges, ChangeDetectorRef, HostListener } from '@angular/core';
import { BaseAngularComponent } from '@memberjunction/ng-base-types';
import { EntityInfo, EntityFieldInfo, EntityAlternateBaseViewInfo, EntityFieldTSType, Metadata, IsDateOnlySQLType, FormatDateOnly, ToPlainJSON, UserViewProperty, ValidateUserViewProperties } from '@memberjunction/core';
import { EscapeSQLString } from '@memberjunction/global';
import {
  MJUserViewEntityExtended,
  ViewColumnInfo,
  ViewGridState,
  MJUserViewEntity_IGridColumnSetting as ViewGridColumnSetting,
  MJUserViewEntity_IColumnFormat as ColumnFormat,
  MJUserViewEntity_IColumnTextStyle as ColumnTextStyle,
  MJUserViewEntity_IColumnConditionalRule as ColumnConditionalRule,
  MJUserViewEntity_IGridAggregatesConfig as ViewGridAggregatesConfig,
  MJUserViewEntity_IGridAggregateDisplay as ViewGridAggregateDisplay,
  MJUserViewEntity_IGridAggregate as ViewGridAggregate,
  MJUserViewEntity_IGridDisplayState as ViewGridDisplayState,
  MJUserViewEntity_IDisplayCardState as ViewCardState,
  MJUserViewEntity_ITimelineState as ViewTimelineState,
  DEFAULT_AGGREGATE_DISPLAY,
  UserInfoEngine
} from '@memberjunction/core-entities';
import {
  CompositeFilterDescriptor,
  FilterDescriptor,
  FilterFieldInfo,
  FilterFieldType,
  CreateEmptyFilter,
  IsCompositeFilter,
  IsSimpleFilter
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
  /** Optional column pinning position ('left', 'right', or null) */
  pinned?: 'left' | 'right' | null;
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
  /** Optional flag indicating whether this view is the default view for the entity */
  IsDefault?: boolean;
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
  /** Optional semantic name of the alternate base view selected for this view */
  AlternateBaseView?: string | null;
  /** Optional flag locking WhereClause to a custom SQL expression */
  CustomWhereClause?: boolean;
  /** Optional custom SQL WHERE clause when CustomWhereClause is true */
  WhereClause?: string;
  /** Optional grid display preferences (rowHeight, wrapText) */
  GridDisplayState?: ViewGridDisplayState | null;
  /** Optional card display preferences (cardSize) */
  CardDisplayState?: ViewCardState | null;
  /** Optional timeline display preferences (dateFieldName, segmentGrouping, orientation) */
  TimelineState?: ViewTimelineState | null;
  /** The view's declared properties; an empty list means none. Absent on events that save no view (defaults). */
  Properties?: UserViewProperty[];
}

/**
 * ViewConfigPanelComponent - Unified Full-Screen View Studio (`mj-view-config-panel`)
 *
 * Architectural & UX Design Notes:
 * 1. **Unified Full-Screen Studio & Alternate Base View Integration**:
 *    Configuring a User View spans five tightly coupled dimensions — `Columns`, `Filters`
 *    (Smart Filter, Visual Rule Builder, and Advanced SQL WHERE override), `Sorting`,
 *    `Aggregates` (Summary KPI Cards & Pinned Grid Totals via an integrated right-side
 *    Slide-In Drawer), and `Display` (Grid, Cards, Timeline) — plus the underlying
 *    **Data Source (Canonical Base View vs. Alternate SQL View)**.
 *    Opening `mj-view-config-panel` as a unified full-screen studio with progressive
 *    disclosure (**Regular Mode** by default vs. **Advanced Mode** on demand) eliminates
 *    fragmented modal popups and keeps Alternate Base View selection, SQL WHERE clause
 *    inspection/override (`<mj-code-editor Language="sql">`), and `__mj_*` system audit
 *    fields behind an intentional Advanced Mode toggle.
 *
 * 2. **Purpose-Built Rich Searchable Dropdowns & Visual Choice Cards (vs. `<mj-combobox>` / `<mj-dropdown>`)**:
 *    Standard `<mj-combobox>` and `<mj-dropdown>` components render single-line text items.
 *    In the View Studio (`Sorting` field picker, `Data Source` Alternate Base View picker,
 *    and `Display` / `Aggregates` field selectors), users need multi-line option cards
 *    displaying human-readable descriptions (`EntityField.Description` /
 *    `EntityAlternateBaseView.Description`), SQL data-type pills (`nvarchar`,
 *    `datetimeoffset`, etc. in Advanced Mode), `__mj_*` system-field badges, and
 *    viewport-aware flip-up positioning. These controls therefore intentionally use
 *    purpose-built searchable listbox dropdowns (`role="listbox"` / `role="option"`) and
 *    visual choice cards (`role="radiogroup"` / `role="radio"`) with keyboard navigation
 *    and `Escape` containment rather than generic single-line comboboxes.
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

  private _boundViewEntity: MJUserViewEntityExtended | null = null;
  private _detachedFromBoundView: boolean = false;

  /**
   * The current view entity (null for default view, or while the open studio session has
   * switched from "Save as New Named View" to "Personal Default Layout" mode).
   */
  @Input()
  get ViewEntity(): MJUserViewEntityExtended | null {
    return this._detachedFromBoundView ? null : this._boundViewEntity;
  }
  set ViewEntity(value: MJUserViewEntityExtended | null) {
    this._boundViewEntity = value;
    this._detachedFromBoundView = false;
  }

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
   * Pre-populated traditional filter from the quick save dialog (used when DefaultSaveAsNew is
   * true). Without it, reopening this panel from the dialog would reset the filter the user had
   * already configured. {@link ExternalFilterState} can't carry it back: the staged filter is the
   * very object this panel is already bound to, so that input never registers a change.
   */
  @Input() PendingNewViewFilterState: CompositeFilterDescriptor | null = null;

  /**
   * Pre-populated smart-filter toggle from the quick save dialog (used when DefaultSaveAsNew is
   * true) — the smart-mode counterpart of {@link PendingNewViewFilterState}.
   */
  @Input() PendingNewViewSmartFilterEnabled: boolean = false;

  /**
   * Pre-populated smart-filter prompt from the quick save dialog (used when DefaultSaveAsNew is true)
   */
  @Input() PendingNewViewSmartFilterPrompt: string = '';

  /**
   * Pre-populated alternate base view from the quick save dialog or workspace (used when DefaultSaveAsNew is true)
   */
  @Input() PendingNewViewAlternateBaseView: string | null = null;

  /**
   * Emitted when user wants to duplicate the current view (F-005)
   */
  @Output() Duplicate = new EventEmitter<void>();

  /**
   * Emitted when the user switches from "Save as New Named View" to "Personal Default Layout"
   * so the host can exit its new-view flow (#6037).
   */
  @Output() SwitchToDefaultLayout = new EventEmitter<void>();

  private _awaitingDefaultLayoutInputSync: boolean = false;

  // Form state
  public ViewName: string = '';
  public ViewDescription: string = '';
  public IsShared: boolean = false;
  public IsDefault: boolean = false;
  public AlternateBaseView: string | null = null;
  public Columns: ColumnConfig[] = [];
  /** @deprecated Use sortItems instead */
  public SortField: string | null = null;
  /** @deprecated Use sortItems instead */
  public SortDirection: 'asc' | 'desc' = 'asc';
  /** Multi-column sort configuration (ordered by priority) */
  public SortItems: SortItem[] = [];

  // Unified View Studio: Pinned Identity Header, Advanced Mode & Progressive Disclosure state
  public IsCreatingNewView: boolean = false;
  public IsAdvancedMode: boolean = false;
  public ShowDescriptionEditor: boolean = false;
  public ShowGeneratedSmartSql: boolean = false;
  public ShowAdvancedSqlSection: boolean = false;
  public CustomWhereClause: boolean = false;
  public WhereClause: string = '';
  public ShowDisplayOptionsSection: boolean = false;
  public GridRowHeight: 'compact' | 'normal' | 'comfortable' = 'normal';
  public GridWrapText: boolean = false;
  public CardSize: 'small' | 'medium' | 'large' = 'medium';
  public TimelineDateField: string = '';
  public TimelineGrouping: 'none' | 'day' | 'week' | 'month' | 'quarter' | 'year' = 'month';
  public TimelineOrientation: 'vertical' | 'horizontal' = 'vertical';
  public ShowAggregateDisplaySection: boolean = false;
  public AggregateDisplay: Required<ViewGridAggregateDisplay> = { ...DEFAULT_AGGREGATE_DISPLAY };

  // Sort drag & custom field dropdown state
  public DraggedSortItem: SortItem | null = null;
  public DropTargetSortItem: SortItem | null = null;
  public SortDropPosition: 'before' | 'after' | null = null;
  public OpenSortFieldDropdownIndex: number | null = null;
  public SortFieldSearchText: string = '';
  public SortDropdownDropUp: boolean = false;

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
  public FilterState: CompositeFilterDescriptor = CreateEmptyFilter();
  public FilterFields: FilterFieldInfo[] = [];

  // Filter mode: 'smart', 'traditional', or 'sql' (mutually exclusive)
  public FilterMode: 'smart' | 'traditional' | 'sql' = 'smart';

  // Aggregates state
  public Aggregates: ViewGridAggregate[] = [];
  public ShowAggregateDialog: boolean = false;
  public EditingAggregate: ViewGridAggregate | null = null;

  // Saved filter state for mode switching (BUG-006: preserve both modes' data)
  private savedSmartFilterPrompt: string = '';
  private savedTraditionalFilter: CompositeFilterDescriptor = CreateEmptyFilter();

  // Filter mode switch confirmation (BUG-006)
  public ShowFilterModeSwitchConfirm: boolean = false;
  public PendingFilterModeSwitch: 'smart' | 'traditional' | 'sql' | null = null;

  // Local saving guard (BUG-003: race condition on double-click)
  private _localSaving: boolean = false;

  // UI state
  public ActiveTab: 'columns' | 'sorting' | 'filters' | 'aggregates' | 'properties' | 'settings' | 'display' = 'columns';

  /** The view's declared properties being edited (a copy; the view changes only on save). */
  public Properties: UserViewProperty[] = [];
  @Input() IsSaving: boolean = false;
  public ColumnSearchText: string = '';

  // Drag state for column reordering
  public DraggedColumn: ColumnConfig | null = null;
  public DropTargetColumn: ColumnConfig | null = null;
  public DropPosition: 'before' | 'after' | null = null;

  // Column format editing & Add Columns on-demand drawer state
  public FormatEditingColumn: ColumnConfig | null = null;
  public ShowAddColumnsDrawer: boolean = false;

  // Custom Alternate Base View & Timeline Date Field dropdown state
  public IsBaseViewDropdownOpen: boolean = false;
  public IsTimelineDateDropdownOpen: boolean = false;
  public SortHighlightIndex: number = 0;
  public ShowDefaultLayoutSwitchConfirm: boolean = false;

  // Full-screen Studio state (always full-screen takeover)
  public IsFullScreen: boolean = true;
  /** True when the Studio was opened via "+ Create New View" (DefaultSaveAsNew), even if a ViewEntity is currently selected */
  public IsSaveAsNewFlow: boolean = false;
  private readonly ADVANCED_MODE_SETTING_KEY = 'view-config-panel/advanced-mode';

  /**
   * Whether the panel is currently in expanded wide / full-screen studio mode
   */
  get IsWideMode(): boolean {
    return true;
  }

  /**
   * Toggle Studio-Wide Advanced Mode (reveals Canonical Base View, SQL WHERE Clause mode,
   * Conditional Formatting Rules, custom hex color overrides, and technical field metadata)
   */
  ToggleAdvancedMode(): void {
    this.IsAdvancedMode = !this.IsAdvancedMode;
    try {
      UserInfoEngine.Instance.SetSettingDebounced(this.ADVANCED_MODE_SETTING_KEY, String(this.IsAdvancedMode));
    } catch (error) {
      console.warn('[ViewConfigPanel] Failed to persist advanced mode setting:', error);
    }
    this.FilterFields = this.buildFilterFields();
    if (!this.IsAdvancedMode && this.FilterMode === 'sql' && !this.CustomWhereClause) {
      // Return to whichever standard filter mode has active data, or Smart Filter (updating SmartFilterEnabled too)
      const targetMode = this.GetFilterCount() > 0 ? 'traditional' : 'smart';
      this.FilterMode = targetMode;
      this.SmartFilterEnabled = targetMode === 'smart';
    }
    this.cdr.detectChanges();
  }

  private metadata = this.ProviderToUse;

  constructor(private cdr: ChangeDetectorRef) {
  super();}

  /**
   * Handle keyboard shortcuts
   * Escape: Close open dropdown, format sub-panel, or the panel itself
   */
  @HostListener('document:keydown.escape', ['$event'])
  HandleEscape(event?: Event): void {
    if (event?.defaultPrevented) {
      return;
    }
    const targetEl = event?.target as HTMLElement | null;
    if (targetEl?.closest?.('mj-code-editor, .cm-editor')) {
      return;
    }
    if (this.ShowAggregateDialog) {
      return; // AggregateSetupDialog handles its own Escape
    } else if (this.OpenSortFieldDropdownIndex !== null) {
      this.OpenSortFieldDropdownIndex = null;
      this.SortFieldSearchText = '';
      this.cdr.detectChanges();
    } else if (this.IsTimelineDateDropdownOpen) {
      this.IsTimelineDateDropdownOpen = false;
      this.cdr.detectChanges();
    } else if (this.IsBaseViewDropdownOpen) {
      this.IsBaseViewDropdownOpen = false;
      this.cdr.detectChanges();
    } else if (this.FormatEditingColumn) {
      this.CloseFormatEditor();
    } else if (this.ShowAddColumnsDrawer) {
      this.CloseAddColumnsDrawer();
    } else if (this.IsOpen) {
      this.OnClose();
    }
  }

  /**
   * Close custom dropdowns (Base View, Timeline Date Field, or Sort Field) when clicking outside
   */
  @HostListener('document:click', ['$event'])
  HandleDocumentClick(event: MouseEvent): void {
    const target = event.target as HTMLElement | null;
    if (this.IsBaseViewDropdownOpen && !target?.closest('.abv-custom-select')) {
      this.IsBaseViewDropdownOpen = false;
      this.cdr.detectChanges();
    }
    if (this.IsTimelineDateDropdownOpen && !target?.closest('.timeline-date-custom-select')) {
      this.IsTimelineDateDropdownOpen = false;
      this.cdr.detectChanges();
    }
    if (this.OpenSortFieldDropdownIndex !== null && !target?.closest('.sort-field-custom-select')) {
      this.OpenSortFieldDropdownIndex = null;
      this.SortFieldSearchText = '';
      this.cdr.detectChanges();
    }
  }

  ngOnInit(): void {
    this.loadSavedStudioPreferences();
    this.initializeFromEntity();
  }

  /**
   * Load saved studio preferences (advanced mode) from user settings
   */
  private loadSavedStudioPreferences(): void {
    try {
      const savedAdvanced = UserInfoEngine.Instance.GetSetting(this.ADVANCED_MODE_SETTING_KEY);
      if (savedAdvanced === 'true') {
        this.IsAdvancedMode = true;
      } else if (savedAdvanced === 'false') {
        this.IsAdvancedMode = false;
      }
    } catch (error) {
      console.warn('[ViewConfigPanel] Failed to load saved studio preferences:', error);
    }
  }

  ngOnChanges(changes: SimpleChanges): void {
    if (changes['IsOpen']) {
      this._awaitingDefaultLayoutInputSync = false;
      this._detachedFromBoundView = false;
    }

    // Reset to first tab and clear search when panel opens
    if (changes['IsOpen'] && this.IsOpen) {
      // Unified View Studio: open on Filters & Source when creating a new view, otherwise Columns
      this.ActiveTab = this.DefaultSaveAsNew ? 'filters' : 'columns';
      this.ColumnSearchText = '';
      this.FormatEditingColumn = null;
      this.ShowAddColumnsDrawer = false;
      this.IsBaseViewDropdownOpen = false;
      this.IsTimelineDateDropdownOpen = false;
      this.OpenSortFieldDropdownIndex = null;
      this.SortFieldSearchText = '';
      this.ShowGeneratedSmartSql = false;
      this.ShowDisplayOptionsSection = false;
      this.ShowAggregateDisplaySection = false;
      this._localSaving = false;
      // Also close any open aggregate dialog
      this.ShowAggregateDialog = false;
      this.EditingAggregate = null;
      // Close filter mode switch confirm
      this.ShowFilterModeSwitchConfirm = false;
      this.PendingFilterModeSwitch = null;
      // Re-initialize from entity to get fresh state
      this.initializeFromEntity();
    } else if (
      changes['Entity'] ||
      changes['ViewEntity'] ||
      changes['DefaultSaveAsNew'] ||
      changes['PendingNewViewAlternateBaseView'] ||
      (changes['CurrentGridState'] && !this.IsOpen)
    ) {
      if (this._awaitingDefaultLayoutInputSync && this.IsOpen && this.isDefaultLayoutEchoChange(changes)) {
        // Host is echoing the null/false input reset from SwitchToDefaultLayout (across one or more
        // change-detection passes); keep in-progress column/sort edits intact.
      } else {
        this._awaitingDefaultLayoutInputSync = false;
        this.initializeFromEntity();
      }
    }

    // BUG-003: Reset local saving guard when isSaving transitions from true to false
    if (changes['IsSaving'] && !this.IsSaving && changes['IsSaving'].previousValue === true) {
      this._localSaving = false;
    }

    // Apply external filter state when it changes (from dashboard-level dialog)
    if (changes['ExternalFilterState'] && this.ExternalFilterState) {
      this.FilterState = this.ExternalFilterState;
      this.cdr.detectChanges();
    }
  }

  /**
   * True when every reinit-triggering input in `changes` is merely echoing the default-layout
   * reset (`ViewEntity → null`, `DefaultSaveAsNew → false`, `PendingNewViewAlternateBaseView → null`).
   * Any genuine entity change, newly selected view, or new-view flow request returns `false` so
   * the panel re-initializes normally even if a host did not bind `(SwitchToDefaultLayout)`.
   */
  private isDefaultLayoutEchoChange(changes: SimpleChanges): boolean {
    if (changes['Entity']) {
      return false;
    }
    if (changes['ViewEntity'] && changes['ViewEntity'].currentValue != null) {
      return false;
    }
    if (changes['DefaultSaveAsNew'] && Boolean(changes['DefaultSaveAsNew'].currentValue)) {
      return false;
    }
    if (changes['PendingNewViewAlternateBaseView'] && Boolean(changes['PendingNewViewAlternateBaseView'].currentValue)) {
      return false;
    }
    return true;
  }

  /**
   * Field names field-level security denies the current user READ on, lowercased. Empty when
   * there is no entity or resolved user, when the entity has field security off, or when nothing
   * is denied — so callers can treat it as "nothing to filter".
   *
   * Uses the BULK primitive rather than the per-field form: `GetDeniedReadFields` aggregates the
   * user's roles once, where the per-field call would repeat that for every field.
   */
  private deniedReadFields(): Set<string> {
    const user = this.ProviderToUse?.CurrentUser;
    if (!this.Entity || !user) {
      return new Set<string>();
    }
    return this.Entity.GetDeniedReadFields(user);
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

    const denied = this.deniedReadFields();
    this.Columns = this.Entity.Fields
      .filter(field => !denied.has(field.Name.trim().toLowerCase()))
      .map((field, index) => ({
        fieldId: field.ID,
        fieldName: field.Name,
        displayName: field.DisplayNameOrName,
        userDisplayName: undefined,
        visible: field.DefaultInView,
        width: field.DefaultColumnWidth || null,
        orderIndex: index,
        field,
        format: undefined,
        pinned: null
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
            column.pinned = vc.pinned ?? null;
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

    const defaultTimelineDateField = this.AvailableDateFields[0]?.Name || '';
    this.IsSaveAsNewFlow = this.DefaultSaveAsNew;

    // Apply view entity metadata (name, description, etc.) when editing an existing view (not "+ Create New View")
    if (this.ViewEntity && !this.IsSaveAsNewFlow) {
      this.IsCreatingNewView = false;
      this.ViewName = this.ViewEntity.Name;
      this.ViewDescription = this.ViewEntity.Description || '';
      this.ShowDescriptionEditor = !!this.ViewDescription.trim();
      this.IsShared = this.ViewEntity.IsShared;
      this.IsDefault = Boolean(this.ViewEntity.IsDefault);
      this.AlternateBaseView = this.ViewEntity.AlternateBaseView || null;
      this.CustomWhereClause = Boolean(this.ViewEntity.CustomWhereClause);
      this.WhereClause = this.ViewEntity.WhereClause || '';
      this.ShowAdvancedSqlSection = this.CustomWhereClause;

      const displayState = this.ViewEntity.ParsedDisplayState;
      this.GridRowHeight = displayState?.grid?.rowHeight || 'normal';
      this.GridWrapText = Boolean(displayState?.grid?.wrapText);
      this.CardSize = displayState?.cards?.cardSize || this.ViewEntity.CardStateObject?.cardSize || 'medium';
      this.TimelineDateField = displayState?.timeline?.dateFieldName || defaultTimelineDateField;
      this.TimelineGrouping = displayState?.timeline?.segmentGrouping || 'month';
      this.TimelineOrientation = displayState?.timeline?.orientation || 'vertical';

      // Apply view's smart filter configuration
      this.SmartFilterEnabled = this.ViewEntity.SmartFilterEnabled || false;
      this.SmartFilterPrompt = this.ViewEntity.SmartFilterPrompt || '';
      this.SmartFilterExplanation = this.ViewEntity.SmartFilterExplanation || '';

      // Apply view's traditional filter state
      this.FilterState = this.parseFilterState(this.ViewEntity.FilterState);

      // Set filter mode based on which type of filter is active
      // Custom SQL WHERE takes precedence when locked, then Smart Filter, then Rule Builder
      if (this.CustomWhereClause) {
        this.FilterMode = 'sql';
        this.SmartFilterEnabled = false;
      } else if (this.SmartFilterEnabled && this.SmartFilterPrompt) {
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
      this.IsCreatingNewView = this.IsSaveAsNewFlow;
      this.ViewName = this.IsSaveAsNewFlow ? this.PendingNewViewName : '';
      this.ViewDescription = this.IsSaveAsNewFlow ? this.PendingNewViewDescription : '';
      this.ShowDescriptionEditor = !!this.ViewDescription.trim();
      this.IsShared = this.IsSaveAsNewFlow ? this.PendingNewViewIsShared : false;
      this.IsDefault = false;
      this.AlternateBaseView = this.PendingNewViewAlternateBaseView || null;
      this.CustomWhereClause = false;
      this.WhereClause = '';
      this.ShowAdvancedSqlSection = false;
      this.GridRowHeight = 'normal';
      this.GridWrapText = false;
      this.CardSize = 'medium';
      this.TimelineDateField = defaultTimelineDateField;
      this.TimelineGrouping = 'month';
      this.TimelineOrientation = 'vertical';

      if (!this.CurrentGridState?.sortSettings?.length) {
        this.SortField = null;
        this.SortDirection = 'asc';
        this.SortItems = [];
      }
      // Carry a filter back from the quick-save dialog when continuing a new-view flow; otherwise
      // start clean. Smart takes precedence, matching how a saved view's filter mode is chosen.
      const carryingSmartFilter = this.IsSaveAsNewFlow && this.PendingNewViewSmartFilterEnabled;
      const carriedFilter = this.IsSaveAsNewFlow && !carryingSmartFilter ? this.PendingNewViewFilterState : null;
      this.SmartFilterPrompt = carryingSmartFilter ? this.PendingNewViewSmartFilterPrompt : '';
      this.SmartFilterExplanation = '';
      if (carriedFilter && this.countFilters(carriedFilter) > 0) {
        this.FilterState = carriedFilter;
        this.FilterMode = 'traditional';
        this.SmartFilterEnabled = false;
      } else {
        this.FilterState = CreateEmptyFilter();
        // Default to smart mode (promote AI filtering)
        this.FilterMode = 'smart';
        this.SmartFilterEnabled = true;
      }
    }

    const declared = this.ViewEntity?.PropertiesObject;
    this.Properties = declared ? ToPlainJSON(declared) : [];

    // Auto-enable Advanced Mode if this view uses any advanced features
    const hasConditionalRules = this.Columns.some(c => (c.format?.conditionalRules?.length ?? 0) > 0);
    if (this.CustomWhereClause || !!this.AlternateBaseView || hasConditionalRules) {
      this.IsAdvancedMode = true;
    }

    // Rebuild filter fields now that FilterState and IsAdvancedMode are resolved
    this.FilterFields = this.buildFilterFields();

    // Load aggregates from currentGridState if available
    if (this.CurrentGridState?.aggregates?.expressions) {
      this.Aggregates = [...this.CurrentGridState.aggregates.expressions];
    } else {
      this.Aggregates = [];
    }

    if (this.CurrentGridState?.aggregates?.display) {
      this.AggregateDisplay = {
        ...DEFAULT_AGGREGATE_DISPLAY,
        ...this.CurrentGridState.aggregates.display
      };
    } else {
      this.AggregateDisplay = { ...DEFAULT_AGGREGATE_DISPLAY };
    }

    this.cdr.detectChanges();
  }

  /**
   * Collect field names referenced anywhere in a CompositeFilterDescriptor
   */
  private collectFilterFieldNames(filter: CompositeFilterDescriptor | null | undefined, acc: Set<string> = new Set()): Set<string> {
    if (!filter?.filters) return acc;
    for (const item of filter.filters) {
      if (IsCompositeFilter(item)) {
        this.collectFilterFieldNames(item, acc);
      } else if (IsSimpleFilter(item) && item.field) {
        acc.add(item.field.toLowerCase());
      }
    }
    return acc;
  }

  /**
   * Build filter fields from entity fields (hiding system __mj_ fields and raw sqlType badges
   * in Standard Mode unless already referenced by an active rule or Advanced Mode is enabled)
   */
  private buildFilterFields(): FilterFieldInfo[] {
    if (!this.Entity) return [];

    const activeFilterFields = this.collectFilterFieldNames(this.FilterState);

    return this.Entity.Fields
      .filter(f => !f.IsBinaryFieldType)
      .filter(f => this.IsAdvancedMode || !f.Name.startsWith('__mj_') || activeFilterFields.has(f.Name.toLowerCase()))
      .map(field => ({
        name: field.Name,
        displayName: field.DisplayNameOrName,
        type: this.mapFieldType(field),
        description: field.Description || undefined,
        sqlType: this.IsAdvancedMode ? (field.Type || undefined) : undefined,
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
      return CreateEmptyFilter();
    }
    try {
      const parsed = JSON.parse(filterStateJson);
      // Validate it has the expected structure
      if (parsed && typeof parsed === 'object' && 'logic' in parsed && 'filters' in parsed) {
        return parsed as CompositeFilterDescriptor;
      }
      return CreateEmptyFilter();
    } catch {
      return CreateEmptyFilter();
    }
  }

  /**
   * Handle filter state change from filter builder
   */
  OnFilterChange(filter: CompositeFilterDescriptor): void {
    this.FilterState = filter;
    if (!this.ViewEntity && this.GetFilterCount() > 0 && !this.ViewName.trim()) {
      this.ViewName = this.BuildSuggestedViewName();
    }
    this.cdr.detectChanges();
  }

  /**
   * Handle Smart Filter prompt change and auto-suggest a view name when promoting from (Default)
   */
  OnSmartFilterPromptChange(value: string): void {
    this.SmartFilterPrompt = value;
    if (!this.ViewEntity && value.trim() && !this.ViewName.trim()) {
      this.ViewName = this.BuildSuggestedViewName();
    }
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
    this.FilterState = CreateEmptyFilter();
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
        column.pinned = gc.pinned ?? null;
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
   * Get hidden columns (in Standard Mode, hides internal __mj_* system columns unless Advanced Mode is ON)
   */
  get HiddenColumns(): ColumnConfig[] {
    return this.Columns.filter(c => !c.visible && (this.IsAdvancedMode || !c.fieldName.startsWith('__mj_')));
  }

  /**
   * Get filtered columns for search (matches display name, technical name, description, or SQL type)
   */
  get FilteredHiddenColumns(): ColumnConfig[] {
    if (!this.ColumnSearchText) {
      return this.HiddenColumns;
    }
    const search = this.ColumnSearchText.toLowerCase();
    return this.HiddenColumns.filter(c =>
      c.displayName.toLowerCase().includes(search) ||
      c.fieldName.toLowerCase().includes(search) ||
      (c.field.Description && c.field.Description.toLowerCase().includes(search)) ||
      (c.field.Type && c.field.Type.toLowerCase().includes(search))
    );
  }

  /**
   * Get sortable fields for dropdown (hiding internal __mj_* fields in Standard Mode unless already sorted)
   */
  get SortableFields(): EntityFieldInfo[] {
    if (!this.Entity) return [];
    const activeSortFields = new Set(this.SortItems.map(s => s.field.toLowerCase()));
    return this.Entity.Fields.filter(f =>
      !f.IsBinaryFieldType &&
      (this.IsAdvancedMode || !f.Name.startsWith('__mj_') || activeSortFields.has(f.Name.toLowerCase()))
    );
  }

  /**
   * Get date/time fields available on the entity for Timeline configuration
   */
  get AvailableDateFields(): EntityFieldInfo[] {
    if (!this.Entity) return [];
    return this.Entity.Fields.filter(f =>
      f.TSType === EntityFieldTSType.Date ||
      f.Type.toLowerCase().includes('date') ||
      f.Type.toLowerCase().includes('time')
    );
  }

  /**
   * Currently selected EntityFieldInfo for the Timeline Date Axis Field
   */
  get SelectedTimelineDateFieldInfo(): EntityFieldInfo | undefined {
    return this.AvailableDateFields.find(f => f.Name === this.TimelineDateField);
  }

  /**
   * Friendly label for the currently selected Timeline Date Axis Field
   */
  get SelectedTimelineDateFieldLabel(): string {
    const info = this.SelectedTimelineDateFieldInfo;
    if (info) {
      return info.DisplayNameOrName;
    }
    return this.TimelineDateField || 'Select a date field...';
  }

  /**
   * Toggle the custom Timeline Date Axis Field dropdown
   */
  ToggleTimelineDateDropdown(event?: MouseEvent): void {
    if (!this.CanEdit) return;
    event?.stopPropagation();
    this.IsTimelineDateDropdownOpen = !this.IsTimelineDateDropdownOpen;
    this.cdr.detectChanges();
  }

  /**
   * Select a date field for Timeline View Defaults
   */
  SelectTimelineDateField(fieldName: string, event?: MouseEvent): void {
    if (!this.CanEdit) return;
    event?.stopPropagation();
    this.TimelineDateField = fieldName;
    this.IsTimelineDateDropdownOpen = false;
    this.cdr.detectChanges();
  }

  /**
   * Keyboard navigation (ArrowDown / ArrowUp / Enter / Escape) for the Timeline Date Axis Field trigger
   */
  OnTimelineDateTriggerKeydown(event: KeyboardEvent): void {
    if (!this.CanEdit) return;
    const fields = this.AvailableDateFields;
    if (fields.length === 0) return;
    if (event.key === 'Escape' && this.IsTimelineDateDropdownOpen) {
      event.preventDefault();
      event.stopPropagation();
      this.IsTimelineDateDropdownOpen = false;
      this.cdr.detectChanges();
      return;
    }
    if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
      event.preventDefault();
      event.stopPropagation();
      this.IsTimelineDateDropdownOpen = true;
      const idx = fields.findIndex(f => f.Name === this.TimelineDateField);
      const nextIdx = event.key === 'ArrowDown'
        ? Math.min(fields.length - 1, idx + 1)
        : Math.max(0, (idx < 0 ? 0 : idx) - 1);
      this.TimelineDateField = fields[nextIdx].Name;
      this.cdr.detectChanges();
      return;
    }
    if (event.key === 'Enter' && this.IsTimelineDateDropdownOpen) {
      event.preventDefault();
      event.stopPropagation();
      this.IsTimelineDateDropdownOpen = false;
      this.cdr.detectChanges();
    }
  }

  /**
   * Set Grid Row Density preference
   */
  SetGridRowHeight(density: 'compact' | 'normal' | 'comfortable'): void {
    if (!this.CanEdit) return;
    this.GridRowHeight = density;
    this.cdr.detectChanges();
  }

  /**
   * Toggle Grid cell text wrapping preference
   */
  ToggleGridWrapText(): void {
    if (!this.CanEdit) return;
    this.GridWrapText = !this.GridWrapText;
    this.cdr.detectChanges();
  }

  /**
   * Set Card View size preference
   */
  SetCardSize(size: 'small' | 'medium' | 'large'): void {
    if (!this.CanEdit) return;
    this.CardSize = size;
    this.cdr.detectChanges();
  }

  /**
   * Set Timeline segment grouping preference
   */
  SetTimelineGrouping(grouping: 'none' | 'day' | 'week' | 'month' | 'quarter' | 'year'): void {
    if (!this.CanEdit) return;
    this.TimelineGrouping = grouping;
    this.cdr.detectChanges();
  }

  /**
   * Set Timeline layout orientation preference
   */
  SetTimelineOrientation(orientation: 'vertical' | 'horizontal'): void {
    if (!this.CanEdit) return;
    this.TimelineOrientation = orientation;
    this.cdr.detectChanges();
  }

  /**
   * Check if the current user can edit the view
   */
  get CanEdit(): boolean {
    if (!this.ViewEntity || this.IsSaveAsNewFlow) return true; // Can always create new
    return this.ViewEntity.UserCanEdit;
  }

  /**
   * Check if the current user can create or modify a custom SQL WHERE clause on this view.
   * Server-side validation (`MJUserViewEntityServer.validateCustomWhereClauseAuthorization`)
   * restricts `CustomWhereClause` to Owner-type administrators (failing closed when user/Type
   * is missing) because raw SQL bypasses client-clause screening (#6037).
   */
  get CanEditCustomSql(): boolean {
    if (!this.CanEdit) {
      return false;
    }
    return this.ProviderToUse?.CurrentUser?.Type?.trim().toLowerCase() === 'owner';
  }

  /**
   * Check if the current user can delete the view
   */
  get CanDelete(): boolean {
    if (!this.ViewEntity || this.IsSaveAsNewFlow) return false; // Can't delete default or unsaved new view
    return this.ViewEntity.UserCanDelete;
  }

  // ========================================
  // UNIFIED VIEW STUDIO: IDENTITY & RECIPE CHIPS
  // ========================================

  /**
   * True when the current configuration has an active filter, alternate base view, or custom SQL
   * that requires a named view rather than the personal default layout setting.
   */
  get HasActiveFilterOrBaseView(): boolean {
    const hasSmart = (this.FilterMode === 'smart' || this.SmartFilterEnabled) && !!this.SmartFilterPrompt.trim();
    const hasRules = this.GetFilterCount() > 0;
    const hasAbv = !!this.AlternateBaseView?.trim();
    const hasCustomSql = this.CustomWhereClause && !!this.WhereClause.trim();
    return hasSmart || hasRules || hasAbv || hasCustomSql;
  }

  /**
   * True when the panel is in "Creating New Named View" mode (either opened with DefaultSaveAsNew,
   * promoted via "Save as Named View...", or automatically promoted because a filter/ABV was configured).
   */
  get IsCreatingNamedView(): boolean {
    return this.IsSaveAsNewFlow || (!this.ViewEntity && (this.IsCreatingNewView || this.HasActiveFilterOrBaseView));
  }

  /**
   * True when the user opened the Studio on (Default) and it automatically promoted to a Named View
   * because a filter, Smart Filter prompt, Alternate Base View, or Custom SQL WHERE was added.
   */
  get WasAutoPromotedToNamedView(): boolean {
    return !this.ViewEntity && !this.IsSaveAsNewFlow && !this.IsCreatingNewView && this.HasActiveFilterOrBaseView;
  }

  /**
   * Promote the panel from Personal Default View mode to Creating New Named View mode in-place
   */
  PromoteToNewView(): void {
    this._awaitingDefaultLayoutInputSync = false;
    this.IsCreatingNewView = true;
    if (!this.ViewName.trim()) {
      this.ViewName = this.BuildSuggestedViewName();
    }
    this.cdr.detectChanges();
  }

  /**
   * Request switching from "Save as New Named View" back to "Personal Default Layout" mode.
   * When active filter rules, a Smart Filter prompt, an Alternate Base View, or Custom SQL WHERE
   * would be discarded, prompts the user for confirmation first.
   */
  RequestSwitchToDefaultLayoutMode(): void {
    if (this.HasActiveFilterOrBaseView) {
      this.ShowDefaultLayoutSwitchConfirm = true;
      this.cdr.detectChanges();
      return;
    }
    this.SwitchToDefaultLayoutMode();
  }

  /**
   * Confirm discarding filter/base-view settings and switching to Personal Default Layout mode.
   */
  OnDefaultLayoutSwitchConfirmed(): void {
    this.ShowDefaultLayoutSwitchConfirm = false;
    this.SwitchToDefaultLayoutMode();
  }

  /**
   * Cancel switching to Personal Default Layout mode.
   */
  OnDefaultLayoutSwitchCancelled(): void {
    this.ShowDefaultLayoutSwitchConfirm = false;
    this.cdr.detectChanges();
  }

  /**
   * Switch from "Save as New Named View" back to "Personal Default Layout" mode.
   * Detaches any bound ViewEntity for this Studio session and clears filters, alternate base view,
   * and properties so saving writes the user's default layout rather than overwriting a previously
   * selected view (#6037).
   */
  SwitchToDefaultLayoutMode(): void {
    const shouldNotifyHost = !!this._boundViewEntity || this.DefaultSaveAsNew || this.IsSaveAsNewFlow;
    this.ShowDefaultLayoutSwitchConfirm = false;
    this._detachedFromBoundView = true;
    if (shouldNotifyHost) {
      this._awaitingDefaultLayoutInputSync = true;
    }
    this.IsCreatingNewView = false;
    this.IsSaveAsNewFlow = false;
    this.ViewName = '';
    this.ViewDescription = '';
    this.ShowDescriptionEditor = false;
    this.IsShared = false;
    this.IsDefault = false;
    this.SmartFilterPrompt = '';
    this.SmartFilterExplanation = '';
    this.FilterState = CreateEmptyFilter();
    this.AlternateBaseView = null;
    this.CustomWhereClause = false;
    this.WhereClause = '';
    this.FilterMode = 'smart';
    this.SmartFilterEnabled = true;
    this.Properties = [];
    if (shouldNotifyHost) {
      this.SwitchToDefaultLayout.emit();
    }
    this.cdr.detectChanges();
  }

  /**
   * Build a smart suggested name based on the entity, alternate base view, or active filter
   */
  BuildSuggestedViewName(): string {
    const entityName = this.Entity?.DisplayNameOrName ?? this.Entity?.Name ?? 'View';
    const prompt = (this.FilterMode === 'smart' || this.SmartFilterEnabled) ? this.SmartFilterPrompt?.trim() : '';
    if (prompt) {
      const budget = Math.max(60 - entityName.length - 3, 12);
      const suffix = prompt.length > budget ? `${prompt.slice(0, budget - 1).trimEnd()}…` : prompt;
      return `${entityName} — ${suffix}`;
    }
    if (this.AlternateBaseView?.trim()) {
      return `${entityName} — ${this.SelectedBaseViewLabel}`;
    }
    if (this.GetFilterCount() > 0 || (this.CustomWhereClause && this.WhereClause.trim())) {
      return `${entityName} — Filtered`;
    }
    return `My ${entityName} View`;
  }

  /**
   * Toggle sharing between Private (My View) and Shared with Team
   */
  ToggleShared(): void {
    if (!this.CanEdit) return;
    this.IsShared = !this.IsShared;
    this.cdr.detectChanges();
  }

  /**
   * Toggle whether this view is the user's Default View for the entity
   */
  ToggleDefaultView(): void {
    if (!this.CanEdit) return;
    this.IsDefault = !this.IsDefault;
    this.cdr.detectChanges();
  }

  /**
   * Toggle the inline description textarea in the Pinned Identity Header
   */
  ToggleDescriptionEditor(): void {
    this.ShowDescriptionEditor = !this.ShowDescriptionEditor;
    this.cdr.detectChanges();
  }

  /**
   * Label shown in the Filter recipe chip in the header
   */
  get FilterChipLabel(): string {
    if (this.CustomWhereClause && this.WhereClause.trim()) {
      return 'Custom SQL';
    }
    if ((this.FilterMode === 'smart' || this.SmartFilterEnabled) && this.SmartFilterPrompt.trim()) {
      return 'AI Smart Filter';
    }
    const count = this.GetFilterCount();
    if (count > 0) {
      return `${count} Filter Rule${count !== 1 ? 's' : ''}`;
    }
    return 'No Filter';
  }

  /**
   * Whether the Filter recipe chip should be highlighted as active
   */
  get HasActiveFilterChip(): boolean {
    return (this.CustomWhereClause && !!this.WhereClause.trim()) ||
           ((this.FilterMode === 'smart' || this.SmartFilterEnabled) && !!this.SmartFilterPrompt.trim()) ||
           this.GetFilterCount() > 0;
  }

  /**
   * Count of visible columns that are pinned left or right
   */
  get PinnedColumnsCount(): number {
    return this.VisibleColumns.filter(c => c.pinned === 'left' || c.pinned === 'right').length;
  }

  /**
   * Summary label for the Sort recipe chip in the header
   */
  get SortSummaryLabel(): string {
    if (this.SortItems.length === 0) {
      return 'Default Sort';
    }
    const first = this.SortItems[0];
    const name = this.GetFieldDisplayName(first.field);
    const dir = first.direction === 'desc' ? '↓' : '↑';
    if (this.SortItems.length === 1) {
      return `${name} ${dir}`;
    }
    return `${name} ${dir} (+${this.SortItems.length - 1})`;
  }

  /**
   * Get available alternate base views for this entity (Active, plus any Deprecated one currently selected)
   */
  get AvailableAlternateBaseViews(): EntityAlternateBaseViewInfo[] {
    if (!this.Entity?.AlternateBaseViews?.length) {
      return [];
    }
    const currentLower = this.AlternateBaseView?.trim().toLowerCase() ?? '';
    return this.Entity.AlternateBaseViews.filter(v => {
      const isUsable = v.IsUsable ?? v.Status !== 'Disabled';
      if (!isUsable) {
        return false;
      }
      const isDeprecated = v.IsDeprecated ?? v.Status === 'Deprecated';
      return !isDeprecated || v.Name.trim().toLowerCase() === currentLower;
    });
  }

  /**
   * True when the view currently pins an AlternateBaseView that is disabled or no longer registered
   * on the entity, so the UI can show it and let the user reset to Default.
   */
  get IsCurrentAlternateBaseViewUnavailable(): boolean {
    const current = this.AlternateBaseView?.trim();
    if (!current || !this.Entity) {
      return false;
    }
    const match = this.Entity.GetAlternateBaseView(current);
    return !match || !match.IsUsable;
  }

  /**
   * Toggle the custom Alternate Base View dropdown
   */
  ToggleBaseViewDropdown(event?: MouseEvent): void {
    if (!this.CanEdit) return;
    event?.stopPropagation();
    this.IsBaseViewDropdownOpen = !this.IsBaseViewDropdownOpen;
    this.cdr.detectChanges();
  }

  /**
   * Select a base view option from the custom dropdown
   */
  SelectBaseView(name: string | null, event?: MouseEvent): void {
    if (!this.CanEdit) return;
    event?.stopPropagation();
    this.AlternateBaseView = name;
    this.IsBaseViewDropdownOpen = false;
    if (!this.ViewEntity && name && !this.ViewName.trim()) {
      this.ViewName = this.BuildSuggestedViewName();
    }
    this.cdr.detectChanges();
  }

  /**
   * Keyboard navigation (ArrowDown / ArrowUp / Enter / Escape) for the Alternate Base View trigger
   */
  OnBaseViewTriggerKeydown(event: KeyboardEvent): void {
    if (!this.CanEdit) return;
    const options: Array<string | null> = [
      null,
      ...this.AvailableAlternateBaseViews.map(v => v.Name)
    ];
    if (event.key === 'Escape' && this.IsBaseViewDropdownOpen) {
      event.preventDefault();
      event.stopPropagation();
      this.IsBaseViewDropdownOpen = false;
      this.cdr.detectChanges();
      return;
    }
    if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
      event.preventDefault();
      event.stopPropagation();
      this.IsBaseViewDropdownOpen = true;
      const currentIdx = options.findIndex(opt => this.IsAlternateBaseViewSelected(opt));
      const nextIdx = event.key === 'ArrowDown'
        ? Math.min(options.length - 1, (currentIdx < 0 ? 0 : currentIdx) + 1)
        : Math.max(0, (currentIdx < 0 ? 0 : currentIdx) - 1);
      this.AlternateBaseView = options[nextIdx];
      if (!this.ViewEntity && this.AlternateBaseView && !this.ViewName.trim()) {
        this.ViewName = this.BuildSuggestedViewName();
      }
      this.cdr.detectChanges();
      return;
    }
    if (event.key === 'Enter' && this.IsBaseViewDropdownOpen) {
      event.preventDefault();
      event.stopPropagation();
      this.IsBaseViewDropdownOpen = false;
      this.cdr.detectChanges();
    }
  }

  /**
   * Check if a given alternate base view name matches the current selection (case-insensitive)
   */
  IsAlternateBaseViewSelected(name: string | null): boolean {
    const current = this.AlternateBaseView?.trim() || null;
    const target = name?.trim() || null;
    if (!current && !target) {
      return true;
    }
    if (!current || !target) {
      return false;
    }
    return current.toLowerCase() === target.toLowerCase();
  }

  /**
   * Currently selected EntityAlternateBaseViewInfo (if an available alternate base view is selected)
   */
  get SelectedAlternateBaseViewInfo(): EntityAlternateBaseViewInfo | null {
    const current = this.AlternateBaseView?.trim();
    if (!current || !this.Entity) {
      return null;
    }
    const match = this.Entity.GetAlternateBaseView(current);
    return match && match.IsUsable ? match : null;
  }

  /**
   * Primary label shown in the custom Base View dropdown trigger
   */
  get SelectedBaseViewLabel(): string {
    if (!this.AlternateBaseView?.trim()) {
      return 'Default Base View';
    }
    const match = this.SelectedAlternateBaseViewInfo;
    if (match) {
      return match.EffectiveDisplayName;
    }
    return this.AlternateBaseView;
  }

  /**
   * Physical SQL view name shown as a monospace badge in the trigger
   */
  get SelectedBaseViewSqlName(): string | null {
    if (!this.AlternateBaseView?.trim()) {
      return this.Entity?.BaseView || null;
    }
    return this.SelectedAlternateBaseViewInfo?.ViewName || null;
  }

  /**
   * Description for the currently selected Base View shown below the trigger
   */
  get SelectedBaseViewDescription(): string {
    if (!this.AlternateBaseView?.trim()) {
      return "Includes all records from the entity's canonical base view without pre-filtering.";
    }
    if (this.IsCurrentAlternateBaseViewUnavailable) {
      return 'This alternate base view is disabled or no longer registered on this entity. Select Default or another view.';
    }
    return this.SelectedAlternateBaseViewInfo?.Description || '';
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
   * Get the EntityFieldInfo for a sort item's field
   */
  GetSortFieldInfo(fieldName: string): EntityFieldInfo | undefined {
    return this.SortableFields.find(f => f.Name === fieldName);
  }

  /**
   * Toggle the custom searchable sort field dropdown for a given sort item index
   */
  ToggleSortFieldDropdown(index: number, event?: MouseEvent): void {
    if (!this.CanEdit) return;
    event?.stopPropagation();
    if (this.OpenSortFieldDropdownIndex === index) {
      this.OpenSortFieldDropdownIndex = null;
      this.SortFieldSearchText = '';
    } else {
      this.OpenSortFieldDropdownIndex = index;
      this.SortFieldSearchText = '';
      const currentItem = this.SortItems[index];
      const available = currentItem ? this.GetAvailableFieldsForSort(currentItem) : [];
      const selectedIdx = currentItem ? available.findIndex(f => f.Name === currentItem.field) : -1;
      this.SortHighlightIndex = selectedIdx >= 0 ? selectedIdx : 0;
      // Determine whether the dropdown should open upward when near bottom of viewport
      const triggerEl = (event?.currentTarget as HTMLElement | null);
      if (triggerEl && typeof window !== 'undefined') {
        const rect = triggerEl.getBoundingClientRect();
        const spaceBelow = window.innerHeight - rect.bottom;
        const spaceAbove = rect.top;
        this.SortDropdownDropUp = spaceBelow < 280 && spaceAbove > spaceBelow;
      } else {
        this.SortDropdownDropUp = false;
      }
    }
    this.cdr.detectChanges();
  }

  /**
   * Get sortable fields filtered by the user's search query (display name, technical name, type, or description)
   */
  GetFilteredSortableFields(currentSortItem: SortItem): EntityFieldInfo[] {
    const available = this.GetAvailableFieldsForSort(currentSortItem);
    const query = this.SortFieldSearchText.trim().toLowerCase();
    if (!query) {
      return available;
    }
    return available.filter(f =>
      f.DisplayNameOrName.toLowerCase().includes(query) ||
      f.Name.toLowerCase().includes(query) ||
      (f.Description && f.Description.toLowerCase().includes(query)) ||
      (f.Type && f.Type.toLowerCase().includes(query))
    );
  }

  /**
   * Select a field from the custom sort field dropdown
   */
  SelectSortField(sortItem: SortItem, fieldName: string, event?: MouseEvent): void {
    if (!this.CanEdit) return;
    event?.stopPropagation();
    sortItem.field = fieldName;
    this.OpenSortFieldDropdownIndex = null;
    this.SortFieldSearchText = '';
    this.syncLegacySortFields();
    this.cdr.detectChanges();
  }

  /**
   * Handle keyboard navigation (ArrowDown / ArrowUp / Enter / Escape) in the sort field search input
   */
  OnSortSearchKeydown(event: KeyboardEvent, sortItem?: SortItem): void {
    event.stopPropagation();
    if (event.key === 'Escape') {
      event.preventDefault();
      this.OpenSortFieldDropdownIndex = null;
      this.SortFieldSearchText = '';
      this.cdr.detectChanges();
      return;
    }
    const targetItem = sortItem ?? (this.OpenSortFieldDropdownIndex !== null ? this.SortItems[this.OpenSortFieldDropdownIndex] : undefined);
    if (!targetItem) return;
    const filtered = this.GetFilteredSortableFields(targetItem);
    if (event.key === 'ArrowDown') {
      event.preventDefault();
      if (filtered.length > 0) {
        this.SortHighlightIndex = Math.min(this.SortHighlightIndex + 1, filtered.length - 1);
        this.cdr.detectChanges();
      }
    } else if (event.key === 'ArrowUp') {
      event.preventDefault();
      if (filtered.length > 0) {
        this.SortHighlightIndex = Math.max(0, this.SortHighlightIndex - 1);
        this.cdr.detectChanges();
      }
    } else if (event.key === 'Enter') {
      event.preventDefault();
      const idx = Math.min(this.SortHighlightIndex, Math.max(0, filtered.length - 1));
      const pick = filtered[idx];
      if (pick) {
        this.SelectSortField(targetItem, pick.Name);
      }
    }
  }

  /**
   * Handle keyboard navigation on the sort field trigger button
   */
  OnSortTriggerKeydown(event: KeyboardEvent, sortItem: SortItem, index: number): void {
    if (!this.CanEdit) return;
    if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
      event.preventDefault();
      if (this.OpenSortFieldDropdownIndex !== index) {
        this.ToggleSortFieldDropdown(index);
      } else {
        this.OnSortSearchKeydown(event, sortItem);
      }
    } else if (event.key === 'Escape' && this.OpenSortFieldDropdownIndex === index) {
      event.preventDefault();
      event.stopPropagation();
      this.OpenSortFieldDropdownIndex = null;
      this.SortFieldSearchText = '';
      this.cdr.detectChanges();
    }
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
  // COLUMN FORMAT EDITOR & ADD COLUMNS DRAWER
  // ========================================

  /**
   * Open the on-demand Add Columns drawer (closing Column Inspector if open)
   */
  OpenAddColumnsDrawer(): void {
    this.FormatEditingColumn = null;
    this.ShowAddColumnsDrawer = true;
    this.cdr.detectChanges();
  }

  /**
   * Close the on-demand Add Columns drawer
   */
  CloseAddColumnsDrawer(): void {
    this.ShowAddColumnsDrawer = false;
    this.ColumnSearchText = '';
    this.cdr.detectChanges();
  }

  /**
   * Toggle the on-demand Add Columns drawer
   */
  ToggleAddColumnsDrawer(): void {
    if (this.ShowAddColumnsDrawer) {
      this.CloseAddColumnsDrawer();
    } else {
      this.OpenAddColumnsDrawer();
    }
  }

  /**
   * Open the format editor for a column (closing Add Columns drawer if open)
   */
  OpenFormatEditor(column: ColumnConfig): void {
    // Initialize format if not present
    if (!column.format) {
      column.format = this.getDefaultFormat(column.field);
    }
    this.ShowAddColumnsDrawer = false;
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
  /**
   * @param field The column's field, so a SQL `date` previews as its stored calendar day rather
   * than shifting into the reader's zone (MJ#4210).
   */
  FormatPreviewValue(value: unknown, format: ColumnFormat | undefined, field?: EntityFieldInfo): string {
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
        return this.formatDate(value as Date, format, IsDateOnlySQLType(field?.Type));
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

  private formatDate(value: Date, format: ColumnFormat, dateOnly: boolean): string {
    const date = value instanceof Date ? value : new Date(value);
    if (isNaN(date.getTime())) return String(value);

    // Parse format string - check for weekday variants
    const formatStr = format.dateFormat || 'medium';
    const includeWeekday = formatStr.includes('-weekday');
    const baseFormat = formatStr.replace('-weekday', '') as 'short' | 'medium' | 'long';
    // A `date` column has no time to show and must not shift into the reader's zone.
    const withTime = format.type === 'datetime' && !dateOnly;

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
      if (withTime) {
        options.hour = 'numeric';
        options.minute = '2-digit';
      }
    } else {
      // No weekday - can use dateStyle shorthand
      options = {
        dateStyle: baseFormat === 'short' ? 'short' : baseFormat === 'long' ? 'long' : 'medium'
      };
      if (withTime) {
        options.timeStyle = 'short';
      }
    }

    return dateOnly ? FormatDateOnly(date, options, 'en-US') : new Intl.DateTimeFormat('en-US', options).format(date);
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
    this.IsBaseViewDropdownOpen = false;
    this.IsTimelineDateDropdownOpen = false;
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
    errors.push(...this.PropertyErrors);
    return errors;
  }

  /** Problems with the view's properties, each naming the property; any one blocks saving. */
  get PropertyErrors(): string[] {
    return ValidateUserViewProperties(this.Properties, (this.Entity?.Fields ?? []).filter(f => !f.IsBinaryFieldType).map(f => f.Name));
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
    return this.VisibleColumns.length > 0 && this.PropertyErrors.length === 0;
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
   * Build the ViewSaveEvent payload with all Unified View Studio & progressive disclosure settings
   */
  private buildSaveEvent(saveAsNew: boolean, overrideName?: string, includeProperties: boolean = true): ViewSaveEvent {
    const existingTimeline = this.ViewEntity?.ParsedDisplayState?.timeline;
    const timelineState: ViewTimelineState | null = this.TimelineDateField
      ? {
          ...(existingTimeline ?? {}),
          dateFieldName: this.TimelineDateField,
          segmentGrouping: this.TimelineGrouping,
          orientation: this.TimelineOrientation,
          sortOrder: existingTimeline?.sortOrder ?? 'desc'
        }
      : null;

    return {
      Name: overrideName ?? this.ViewName,
      Description: this.ViewDescription,
      IsShared: this.IsShared,
      IsDefault: this.IsDefault,
      SaveAsNew: saveAsNew,
      Columns: this.VisibleColumns,
      SortField: this.SortField,
      SortDirection: this.SortDirection,
      SortItems: [...this.SortItems],
      SmartFilterEnabled: this.SmartFilterEnabled,
      SmartFilterPrompt: this.SmartFilterPrompt,
      FilterState: this.hasActiveFilters() ? this.FilterState : null,
      AggregatesConfig: this.buildAggregatesConfig(),
      AlternateBaseView: this.AlternateBaseView || null,
      CustomWhereClause: this.CustomWhereClause,
      WhereClause: this.CustomWhereClause ? this.WhereClause : undefined,
      GridDisplayState: {
        rowHeight: this.GridRowHeight,
        wrapText: this.GridWrapText
      },
      CardDisplayState: {
        cardSize: this.CardSize
      },
      TimelineState: timelineState,
      ...(includeProperties ? { Properties: [...this.Properties] } : {})
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
    this.Save.emit(this.buildSaveEvent(false));
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
    const effectiveName = this.ViewName.trim() || 'New View';
    this.Save.emit(this.buildSaveEvent(true, effectiveName));
  }

  /**
   * Save edits to an existing view as a new personal copy without overwriting the original
   */
  OnSaveAsCopy(): void {
    if (this.IsSaving || this._localSaving) return;
    if (!this.IsValidForSaveAsNew) return;

    this._localSaving = true;
    const baseName = this.ViewName.trim() || this.ViewEntity?.Name || 'View';
    const copyName = baseName === this.ViewEntity?.Name ? `${baseName} (Copy)` : baseName;
    const event = this.buildSaveEvent(true, copyName);
    event.IsShared = false;
    event.IsDefault = false;
    this.Save.emit(event);
  }

  /**
   * Save default view settings to user settings
   * Used for dynamic/default views that don't have a stored view entity
   */
  OnSaveDefaults(): void {
    // BUG-003: Guard against double-clicks with local flag
    if (this.IsSaving || this._localSaving) return;

    this._localSaving = true;
    this.SaveDefaults.emit(this.buildSaveEvent(false, 'Default', false));
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
  SetActiveTab(tab: 'columns' | 'sorting' | 'filters' | 'aggregates' | 'properties' | 'settings' | 'display'): void {
    this.ActiveTab = tab === 'settings' ? 'filters' : tab;
    this.FormatEditingColumn = null; // Close format editor when switching tabs
    this.ShowAddColumnsDrawer = false;
    this.IsBaseViewDropdownOpen = false;
    this.IsTimelineDateDropdownOpen = false;
    this.OpenSortFieldDropdownIndex = null;
    this.SortFieldSearchText = '';
    this.cdr.detectChanges();
  }

  /**
   * Set the filter mode ('smart', 'traditional', or 'sql')
   * Switching to 'sql' shows the read-only compiled SQL from Smart Filter or Rule Builder
   * until the user checks the one-way Custom SQL Override checkbox.
   */
  SetFilterMode(mode: 'smart' | 'traditional' | 'sql'): void {
    if (this.FilterMode === mode) return;

    // Switching into 'sql' mode is non-destructive until the user checks the override box
    if (mode === 'sql') {
      this.FilterMode = 'sql';
      this.cdr.detectChanges();
      return;
    }

    // If returning from 'sql' mode without CustomWhereClause enabled, restore target mode or switch cleanly
    if (this.FilterMode === 'sql' && !this.CustomWhereClause) {
      if ((mode === 'smart' && this.GetFilterCount() > 0) ||
          (mode === 'traditional' && !!this.SmartFilterPrompt.trim())) {
        this.PendingFilterModeSwitch = mode;
        this.ShowFilterModeSwitchConfirm = true;
        this.cdr.detectChanges();
        return;
      }
      this.FilterMode = mode;
      this.SmartFilterEnabled = mode === 'smart';
      this.cdr.detectChanges();
      return;
    }

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
    } else if (this.FilterMode === 'traditional') {
      return this.GetFilterCount() > 0;
    } else {
      return this.CustomWhereClause && !!this.WhereClause.trim();
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
  private applyFilterModeSwitch(mode: 'smart' | 'traditional' | 'sql'): void {
    // Save current mode's data before switching
    if (this.FilterMode === 'smart') {
      this.savedSmartFilterPrompt = this.SmartFilterPrompt;
    } else if (this.FilterMode === 'traditional') {
      this.savedTraditionalFilter = this.FilterState;
    }

    this.FilterMode = mode;

    // Restore target mode's saved data or clear
    if (mode === 'smart') {
      this.CustomWhereClause = false;
      this.SmartFilterEnabled = true;
      this.SmartFilterPrompt = this.savedSmartFilterPrompt;
      this.FilterState = CreateEmptyFilter();
    } else if (mode === 'traditional') {
      this.CustomWhereClause = false;
      this.SmartFilterEnabled = false;
      this.SmartFilterPrompt = '';
      this.SmartFilterExplanation = '';
      this.FilterState = this.savedTraditionalFilter;
    } else {
      this.SmartFilterEnabled = false;
    }

    this.cdr.detectChanges();
  }

  /**
   * Compile a CompositeFilterDescriptor into a SQL WHERE expression using the canonical
   * `MJUserViewEntityExtended.GenerateWhereClauseFromFilterState` compiler when entity metadata is present.
   */
  CompileFilterStateToSqlWhere(filter: CompositeFilterDescriptor = this.FilterState): string {
    if (!filter?.filters?.length) {
      return '';
    }
    if (this.Entity?.Fields?.length) {
      const canonical = MJUserViewEntityExtended.GenerateWhereClauseFromFilterState(
        filter as unknown as Record<string, unknown>,
        this.Entity
      );
      if (canonical) {
        return canonical;
      }
    }
    const parts: string[] = [];
    for (const item of filter.filters) {
      if (IsCompositeFilter(item)) {
        const sub = this.CompileFilterStateToSqlWhere(item);
        if (sub) {
          parts.push(item.filters.length > 1 ? `(${sub})` : sub);
        }
      } else if (IsSimpleFilter(item) && item.field) {
        const clause = this.compileSingleRuleToSql(item);
        if (clause) {
          parts.push(clause);
        }
      }
    }
    const joiner = filter.logic === 'or' ? ' OR ' : ' AND ';
    return parts.join(joiner);
  }

  /**
   * Compile a single FilterDescriptor rule into a SQL condition (fallback when Entity metadata is unavailable)
   */
  private compileSingleRuleToSql(rule: FilterDescriptor): string {
    const col = `[${rule.field}]`;
    const op = rule.operator;
    if (op === 'isnull') return `${col} IS NULL`;
    if (op === 'isnotnull') return `${col} IS NOT NULL`;
    if (op === 'isempty') return `(${col} IS NULL OR ${col} = '')`;
    if (op === 'isnotempty') return `(${col} IS NOT NULL AND ${col} <> '')`;

    const rawVal = rule.value;
    const escaped = EscapeSQLString(String(rawVal ?? ''));

    if (op === 'contains') return `${col} LIKE '%${escaped}%'`;
    if (op === 'doesnotcontain') return `${col} NOT LIKE '%${escaped}%'`;
    if (op === 'startswith') return `${col} LIKE '${escaped}%'`;
    if (op === 'endswith') return `${col} LIKE '%${escaped}'`;

    const entityField = this.Entity?.Fields.find(f => f.Name.trim().toLowerCase() === rule.field.trim().toLowerCase());
    const isBool = entityField?.TSType === EntityFieldTSType.Boolean || typeof rawVal === 'boolean';
    const isNum = entityField?.TSType === EntityFieldTSType.Number || typeof rawVal === 'number';

    let sqlVal: string;
    if (isBool) {
      sqlVal = (rawVal === true || rawVal === 'true' || rawVal === 1) ? '1' : '0';
    } else if (isNum && rawVal !== null && rawVal !== undefined && rawVal !== '') {
      sqlVal = String(rawVal);
    } else {
      sqlVal = `'${escaped}'`;
    }

    const opMap: Record<string, string> = {
      eq: '=',
      neq: '<>',
      gt: '>',
      gte: '>=',
      lt: '<',
      lte: '<='
    };
    const sqlOp = opMap[op] || '=';
    return `${col} ${sqlOp} ${sqlVal}`;
  }

  /**
   * Returns the SQL WHERE clause generated from the active Rule Builder or Smart Filter
   */
  get GeneratedSqlWhereClause(): string {
    if (this.FilterMode === 'smart' || this.SmartFilterEnabled) {
      const savedPrompt = (this.ViewEntity?.SmartFilterPrompt ?? '').trim();
      const currentPrompt = this.SmartFilterPrompt.trim();
      if (!currentPrompt || currentPrompt !== savedPrompt) {
        return '';
      }
      if (this.ViewEntity?.SmartFilterWhereClause) {
        return this.ViewEntity.SmartFilterWhereClause;
      }
      if (this.ViewEntity?.SmartFilterEnabled && !this.ViewEntity?.CustomWhereClause && this.ViewEntity?.WhereClause) {
        return this.ViewEntity.WhereClause;
      }
      return '';
    }
    if (this.GetFilterCount() > 0) {
      return this.CompileFilterStateToSqlWhere(this.FilterState);
    }
    if (this.ViewEntity?.SmartFilterWhereClause) {
      return this.ViewEntity.SmartFilterWhereClause;
    }
    if (this.ViewEntity?.WhereClause && !this.ViewEntity.CustomWhereClause) {
      return this.ViewEntity.WhereClause;
    }
    return '';
  }

  /**
   * Returns the SQL string displayed inside <mj-code-editor Language="sql">:
   * - When CustomWhereClause is true (override checked): returns the editable WhereClause
   * - When CustomWhereClause is false (read-only): returns the live SQL from Rule Builder / Smart Filter
   */
  get DisplayedSqlWhereClause(): string {
    if (this.CustomWhereClause) {
      return this.WhereClause;
    }
    const generated = this.GeneratedSqlWhereClause;
    if (generated) {
      return generated;
    }
    const activePrompt = this.SmartFilterPrompt.trim() || this.savedSmartFilterPrompt.trim();
    if (activePrompt) {
      return `-- Smart Filter Prompt: "${activePrompt}"\n-- AI compiles this prompt into a SQL WHERE clause when the view is saved.\n-- Check "Override with Custom SQL WHERE Clause" above to write custom SQL directly.`;
    }
    return `-- No active filter rules or Smart Filter configured.\n-- Check "Override with Custom SQL WHERE Clause" above to write a custom SQL WHERE expression.`;
  }

  /**
   * Human-readable badge describing the source of the SQL shown in <mj-code-editor>
   */
  get SqlWhereSourceLabel(): string {
    if (this.CustomWhereClause) {
      return this.CanEditCustomSql
        ? 'Custom SQL Override (Editable)'
        : 'Custom SQL Override (Read-Only)';
    }
    if (!this.SmartFilterEnabled && this.GetFilterCount() > 0) {
      const count = this.GetFilterCount();
      return `Generated from Rule Builder (${count} rule${count !== 1 ? 's' : ''} · Read-Only)`;
    }
    if (this.ViewEntity?.SmartFilterWhereClause || (this.SmartFilterPrompt.trim() || this.savedSmartFilterPrompt.trim())) {
      return 'Generated from Smart Filter (AI · Read-Only)';
    }
    return 'Read-Only Preview';
  }

  /**
   * Handle toggling the one-way Custom SQL WHERE Override checkbox.
   * Non-Owner editors may turn an existing override OFF (`enabled === false`) to revert a view
   * to Smart Filter or Rule Builder, matching `MJUserViewEntityServer`, while turning it ON
   * requires `CanEditCustomSql` (#6037).
   */
  OnToggleCustomWhereOverride(enabled: boolean): void {
    if (!this.CanEdit) return;
    if (enabled && !this.CanEditCustomSql) return;
    // Capture generated SQL from the currently active filter mode BEFORE clearing SmartFilterEnabled
    const generated = enabled && !this.WhereClause.trim() ? this.GeneratedSqlWhereClause : '';
    this.CustomWhereClause = enabled;
    if (enabled) {
      this.FilterMode = 'sql';
      this.SmartFilterEnabled = false;
      if (!this.WhereClause.trim() && generated) {
        this.WhereClause = generated;
      }
      if (!this.ViewEntity && this.WhereClause.trim() && !this.ViewName.trim()) {
        this.ViewName = this.BuildSuggestedViewName();
      }
    }
    this.cdr.detectChanges();
  }

  /**
   * Handle changes emitted from <mj-code-editor> when CustomWhereClause is enabled
   */
  OnCustomSqlWhereChange(value: string): void {
    if (!this.CustomWhereClause || !this.CanEditCustomSql) return;
    this.WhereClause = value;
    if (!this.ViewEntity && value.trim() && !this.ViewName.trim()) {
      this.ViewName = this.BuildSuggestedViewName();
    }
    this.cdr.detectChanges();
  }

  /**
   * Apply a smart filter example to the prompt field
   */
  ApplySmartFilterExample(example: string): void {
    this.SmartFilterPrompt = example;
    if (!this.ViewEntity && !this.ViewName.trim()) {
      this.ViewName = this.BuildSuggestedViewName();
    }
    this.cdr.detectChanges();
  }

  // ========================================
  // COLUMN PINNING, BULK ACTIONS & CONDITIONAL FORMATTING
  // ========================================

  /**
   * Cycle a column's pin position: None -> Pin Left -> Pin Right -> None
   */
  ToggleColumnPin(column: ColumnConfig, event?: MouseEvent): void {
    event?.stopPropagation();
    if (!this.CanEdit) return;
    if (!column.pinned) {
      column.pinned = 'left';
    } else if (column.pinned === 'left') {
      column.pinned = 'right';
    } else {
      column.pinned = null;
    }
    this.cdr.detectChanges();
  }

  /**
   * Explicitly set a column's pin position ('left', 'right', or null)
   */
  SetColumnPin(column: ColumnConfig, pinned: 'left' | 'right' | null): void {
    if (!this.CanEdit) return;
    column.pinned = pinned;
    this.cdr.detectChanges();
  }

  /**
   * Reset columns to entity metadata defaults (DefaultInView)
   */
  ResetColumnsToDefault(): void {
    if (!this.Entity || !this.CanEdit) return;
    this.Columns.forEach((col, idx) => {
      col.visible = col.field.DefaultInView;
      col.orderIndex = idx;
      col.pinned = null;
    });
    this.Columns.sort((a, b) => a.orderIndex - b.orderIndex);
    this.cdr.detectChanges();
  }

  /**
   * Make all columns visible
   */
  ShowAllColumns(): void {
    if (!this.CanEdit) return;
    this.Columns.forEach((col, idx) => {
      col.visible = true;
      col.orderIndex = idx;
    });
    this.cdr.detectChanges();
  }

  /**
   * Add a new conditional formatting rule to the currently edited column
   */
  AddConditionalRule(): void {
    if (!this.FormatEditingColumn?.format || !this.CanEdit) return;
    if (!this.FormatEditingColumn.format.conditionalRules) {
      this.FormatEditingColumn.format.conditionalRules = [];
    }
    this.FormatEditingColumn.format.conditionalRules.push({
      condition: 'equals',
      value: '',
      style: {
        color: '#065f46',
        backgroundColor: '#d1fae5',
        bold: true
      }
    });
    this.cdr.detectChanges();
  }

  /**
   * Remove a conditional formatting rule by index
   */
  RemoveConditionalRule(index: number): void {
    if (!this.FormatEditingColumn?.format?.conditionalRules || !this.CanEdit) return;
    this.FormatEditingColumn.format.conditionalRules.splice(index, 1);
    this.cdr.detectChanges();
  }

  /**
   * Apply a semantic color preset to a conditional formatting rule
   */
  ApplyConditionalPreset(rule: ColumnConditionalRule, preset: 'success' | 'warning' | 'danger' | 'info' | 'bold'): void {
    if (!this.CanEdit) return;
    switch (preset) {
      case 'success':
        rule.style = { color: '#065f46', backgroundColor: '#d1fae5', bold: true };
        break;
      case 'warning':
        rule.style = { color: '#92400e', backgroundColor: '#fef3c7', bold: true };
        break;
      case 'danger':
        rule.style = { color: '#991b1b', backgroundColor: '#fee2e2', bold: true };
        break;
      case 'info':
        rule.style = { color: '#1e40af', backgroundColor: '#dbeafe', bold: true };
        break;
      case 'bold':
        rule.style = { bold: true };
        break;
    }
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
      display: { ...this.AggregateDisplay },
      expressions: [...this.Aggregates]
    };
  }
}
