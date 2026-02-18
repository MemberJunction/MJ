import { Component, Input, Output, EventEmitter, OnChanges, SimpleChanges, ChangeDetectorRef, OnDestroy, ViewEncapsulation } from '@angular/core';
import { EntityInfo, Metadata, RunView } from '@memberjunction/core';
import { UserViewEntityExtended, ViewInfo } from '@memberjunction/core-entities';
import { Subject } from 'rxjs';
import { takeUntil } from 'rxjs/operators';

/**
 * Represents a view in the dropdown
 */
export interface ViewListItem {
  id: string;
  name: string;
  isOwned: boolean;
  isShared: boolean;
  isDefault: boolean;
  userCanEdit: boolean;
  entity: UserViewEntityExtended;
}

/**
 * Event emitted when a view is selected
 */
export interface ViewSelectedEvent {
  viewId: string | null;
  view: UserViewEntityExtended | null;
}

/**
 * Event emitted when user requests to save the current view
 */
export interface SaveViewRequestedEvent {
  /** True if user wants to save as a new view */
  saveAsNew: boolean;
}

/**
 * ViewSelectorComponent - Dropdown for selecting saved views
 *
 * Features:
 * - Shows "(Default)" option when no view is selected
 * - Groups views into "My Views" and "Shared Views"
 * - "Save Current View" and "Manage Views" actions
 * - "Open in Tab" button for saved views
 */
@Component({
  standalone: false,
  selector: 'mj-view-selector',
  templateUrl: './view-selector.component.html',
  styleUrls: ['./view-selector.component.css'],
  encapsulation: ViewEncapsulation.None
})
export class ViewSelectorComponent implements OnChanges, OnDestroy {
  /**
   * The entity to load views for
   */
  @Input() entity: EntityInfo | null = null;

  /**
   * Currently selected view ID (null = default view)
   */
  @Input() selectedViewId: string | null = null;

  /**
   * Whether the current view has unsaved modifications
   */
  @Input() viewModified: boolean = false;

  /**
   * Emitted when a view is selected
   */
  @Output() viewSelected = new EventEmitter<ViewSelectedEvent>();

  /**
   * Emitted when user requests to save the current view
   */
  @Output() saveViewRequested = new EventEmitter<SaveViewRequestedEvent>();

  /**
   * Emitted when user wants to open the view management panel
   */
  @Output() manageViewsRequested = new EventEmitter<void>();

  /**
   * Emitted when user wants to open the current view in its own tab
   */
  @Output() openInTabRequested = new EventEmitter<string>();

  /**
   * Emitted when user wants to configure the current view
   */
  @Output() configureViewRequested = new EventEmitter<void>();

  /**
   * Emitted when user wants to create a new record
   */
  @Output() createNewRecordRequested = new EventEmitter<void>();

  /**
   * Emitted when user wants to export data to Excel
   */
  @Output() exportRequested = new EventEmitter<void>();

  /**
   * Emitted when user wants to duplicate a view (F-005)
   */
  @Output() duplicateViewRequested = new EventEmitter<string>();

  /**
   * Emitted when user wants to use the quick save dialog (F-001)
   * Emits true when user explicitly requested "Save As New", false for general save
   */
  @Output() quickSaveRequested = new EventEmitter<boolean>();

  /**
   * Emitted when user wants to revert to saved state (F-007)
   */
  @Output() revertRequested = new EventEmitter<void>();

  // Internal state
  public isLoading: boolean = false;
  public isDropdownOpen: boolean = false;
  public myViews: ViewListItem[] = [];
  public sharedViews: ViewListItem[] = [];
  public selectedView: UserViewEntityExtended | null = null;
  public searchText: string = '';

  private destroy$ = new Subject<void>();
  private metadata = new Metadata();

  constructor(private cdr: ChangeDetectorRef) {}

  ngOnChanges(changes: SimpleChanges): void {
    if (changes['entity']) {
      if (this.entity) {
        this.loadViews();
      } else {
        this.myViews = [];
        this.sharedViews = [];
        this.selectedView = null;
      }
    }

    if (changes['selectedViewId'] && this.selectedViewId) {
      // If we have a selected view ID and it's in our lists, update selectedView
      this.updateSelectedViewFromId();
    }
  }

  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
  }

  /**
   * Load views for the current entity
   */
  public async loadViews(): Promise<void> {
    if (!this.entity) {
      return;
    }

    this.isLoading = true;
    this.cdr.detectChanges();

    try {
      const userId = this.metadata.CurrentUser?.ID;
      const rv = new RunView();

      // Load all views for this entity that the user owns OR that are shared
      const result = await rv.RunView<UserViewEntityExtended>({
        EntityName: 'MJ: User Views',
        ExtraFilter: `EntityID = '${this.entity.ID}' AND (UserID = '${userId}' OR IsShared = 1)`,
        OrderBy: 'Name',
        ResultType: 'entity_object'
      });

      if (result.Success && result.Results) {
        // Filter views the user can actually view
        const accessibleViews = result.Results.filter(v => v.UserCanView);

        // Separate into owned and shared
        this.myViews = accessibleViews
          .filter(v => v.UserID === userId)
          .map(v => this.mapViewToListItem(v, true));

        this.sharedViews = accessibleViews
          .filter(v => v.UserID !== userId)
          .map(v => this.mapViewToListItem(v, false));

        // Update selected view reference
        this.updateSelectedViewFromId();
      }
    } catch (error) {
      console.error('Failed to load views:', error);
    } finally {
      this.isLoading = false;
      this.cdr.detectChanges();
    }
  }

  /**
   * Map a view entity to a list item
   */
  private mapViewToListItem(view: UserViewEntityExtended, isOwned: boolean): ViewListItem {
    return {
      id: view.ID,
      name: view.Name,
      isOwned,
      isShared: view.IsShared,
      isDefault: view.IsDefault,
      userCanEdit: view.UserCanEdit,
      entity: view
    };
  }

  /**
   * Update the selectedView reference based on selectedViewId
   */
  private updateSelectedViewFromId(): void {
    if (!this.selectedViewId) {
      this.selectedView = null;
      return;
    }

    // Search in both lists
    const myView = this.myViews.find(v => v.id === this.selectedViewId);
    if (myView) {
      this.selectedView = myView.entity;
      return;
    }

    const sharedView = this.sharedViews.find(v => v.id === this.selectedViewId);
    if (sharedView) {
      this.selectedView = sharedView.entity;
      return;
    }

    // View not in lists yet - it might need to be loaded
    this.selectedView = null;
  }

  /**
   * Get the display name for the current selection
   */
  get displayName(): string {
    if (this.selectedView) {
      return this.selectedView.Name;
    }
    return '(Default)';
  }

  /**
   * Toggle dropdown open/closed
   */
  toggleDropdown(): void {
    this.isDropdownOpen = !this.isDropdownOpen;
    this.cdr.detectChanges();
  }

  /**
   * Close the dropdown
   */
  closeDropdown(): void {
    this.isDropdownOpen = false;
    this.searchText = '';
    this.cdr.detectChanges();
  }

  /**
   * Select the default view (no saved view)
   */
  selectDefault(): void {
    this.selectedView = null;
    this.viewSelected.emit({ viewId: null, view: null });
    this.closeDropdown();
  }

  /**
   * Select a view from the list
   */
  selectView(item: ViewListItem): void {
    this.selectedView = item.entity;
    this.viewSelected.emit({ viewId: item.id, view: item.entity });
    this.closeDropdown();
  }

  /**
   * Request to save the current view
   */
  onSaveView(): void {
    this.saveViewRequested.emit({ saveAsNew: false });
    this.closeDropdown();
  }

  /**
   * Request to save as a new view - opens Quick Save dialog in "Save As New" mode
   */
  onSaveAsNewView(): void {
    this.quickSaveRequested.emit(true);
    this.closeDropdown();
  }

  /**
   * Request to manage views
   */
  onManageViews(): void {
    this.manageViewsRequested.emit();
    this.closeDropdown();
  }

  /**
   * Request to open the current view in a tab
   */
  onOpenInTab(): void {
    if (this.selectedViewId) {
      this.openInTabRequested.emit(this.selectedViewId);
    }
  }

  /**
   * Request to configure the current view
   */
  onConfigureView(): void {
    this.configureViewRequested.emit();
  }

  /**
   * Request to create a new record
   */
  onCreateNewRecord(): void {
    this.createNewRecordRequested.emit();
  }

  /**
   * Request to export data to Excel
   */
  onExport(): void {
    this.exportRequested.emit();
  }

  /**
   * Request to duplicate a view (F-005)
   */
  onDuplicateView(viewId: string, event: MouseEvent): void {
    event.stopPropagation(); // Don't select the view
    this.duplicateViewRequested.emit(viewId);
    this.closeDropdown();
  }

  /**
   * Request to open the quick save dialog (F-001)
   */
  onQuickSave(): void {
    this.quickSaveRequested.emit(false);
    this.closeDropdown();
  }

  /**
   * Request to revert view to saved state (F-007)
   */
  onRevert(): void {
    this.revertRequested.emit();
  }

  /**
   * Check if there are any views to show
   */
  get hasViews(): boolean {
    return this.myViews.length > 0 || this.sharedViews.length > 0;
  }

  /**
   * Check if the current user can edit the selected view
   */
  get canEditSelectedView(): boolean {
    return this.selectedView?.UserCanEdit ?? false;
  }

  /**
   * Handle click outside to close dropdown
   */
  onClickOutside(event: Event): void {
    this.closeDropdown();
  }

  // ========================================
  // RICH VIEW PANEL: Search & Metadata
  // ========================================

  /**
   * My views filtered by search text
   */
  get filteredMyViews(): ViewListItem[] {
    if (!this.searchText.trim()) return this.myViews;
    const term = this.searchText.toLowerCase();
    return this.myViews.filter(v =>
      v.name.toLowerCase().includes(term) ||
      (v.entity.Description || '').toLowerCase().includes(term)
    );
  }

  /**
   * Shared views filtered by search text
   */
  get filteredSharedViews(): ViewListItem[] {
    if (!this.searchText.trim()) return this.sharedViews;
    const term = this.searchText.toLowerCase();
    return this.sharedViews.filter(v =>
      v.name.toLowerCase().includes(term) ||
      (v.entity.Description || '').toLowerCase().includes(term)
    );
  }

  /**
   * Get the number of filters configured in a view by parsing its FilterState
   */
  getViewFilterCount(view: ViewListItem): number {
    try {
      const filterState = view.entity.FilterState;
      if (!filterState) return 0;
      const parsed = JSON.parse(filterState);
      if (parsed?.filters?.length) return parsed.filters.length;
      // CompositeFilterDescriptor format
      if (parsed?.logic && parsed?.filters) return parsed.filters.length;
      return 0;
    } catch {
      return 0;
    }
  }

  /**
   * Get the number of visible columns in a view by parsing GridState
   */
  getViewColumnCount(view: ViewListItem): number {
    try {
      const gridState = view.entity.GridState;
      if (!gridState) return 0;
      const parsed = JSON.parse(gridState);
      if (Array.isArray(parsed)) {
        return parsed.filter((c: Record<string, unknown>) => !c['hidden']).length;
      }
      return 0;
    } catch {
      return 0;
    }
  }

  /**
   * Get sort info string from a view's SortState
   */
  getViewSortInfo(view: ViewListItem): string {
    try {
      const sortState = view.entity.SortState;
      if (!sortState) return '';
      const parsed = JSON.parse(sortState);
      if (Array.isArray(parsed) && parsed.length > 0) {
        return `${parsed.length} sort${parsed.length > 1 ? 's' : ''}`;
      }
      return '';
    } catch {
      return '';
    }
  }

  /**
   * Select a specific view and open the config panel for it
   */
  onConfigureViewById(viewId: string, event: MouseEvent): void {
    event.stopPropagation();
    // First select the view, then open config
    const item = this.myViews.find(v => v.id === viewId) || this.sharedViews.find(v => v.id === viewId);
    if (item) {
      this.selectedView = item.entity;
      this.viewSelected.emit({ viewId: item.id, view: item.entity });
    }
    this.configureViewRequested.emit();
    this.closeDropdown();
  }

  /**
   * Open a specific view in a new tab
   */
  onOpenViewInTab(viewId: string, event: MouseEvent): void {
    event.stopPropagation();
    this.openInTabRequested.emit(viewId);
    this.closeDropdown();
  }

  /**
   * Reset to default view (select no view)
   */
  onResetToDefault(): void {
    this.selectDefault();
  }
}
