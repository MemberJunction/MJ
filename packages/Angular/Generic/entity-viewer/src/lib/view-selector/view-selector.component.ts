import { Component, Input, Output, EventEmitter, OnChanges, SimpleChanges, ChangeDetectorRef, OnDestroy, ViewEncapsulation } from '@angular/core';
import { EntityInfo } from '@memberjunction/core';
import { MJUserViewEntityExtended, UserViewEngine, ViewInfo } from '@memberjunction/core-entities';
import { Subject } from 'rxjs';
import { takeUntil } from 'rxjs/operators';
import { UUIDsEqual } from '@memberjunction/global';
import { BaseAngularComponent } from '@memberjunction/ng-base-types';

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
  entity: MJUserViewEntityExtended;
}

/**
 * Event emitted when a view is selected
 */
export interface ViewSelectedEvent {
  ViewID: string | null;
  View: MJUserViewEntityExtended | null;
}

/**
 * Event emitted when user requests to save the current view
 */
export interface SaveViewRequestedEvent {
  /** True if user wants to save as a new view */
  SaveAsNew: boolean;
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
export class ViewSelectorComponent extends BaseAngularComponent implements OnChanges, OnDestroy {
  /**
   * The entity to load views for
   */
  @Input() Entity: EntityInfo | null = null;

  /**
   * Currently selected view ID (null = default view)
   */
  @Input() SelectedViewID: string | null = null;

  /**
   * Whether the current view has unsaved modifications
   */
  @Input() ViewModified: boolean = false;

  /**
   * Emitted when a view is selected
   */
  @Output() ViewSelected = new EventEmitter<ViewSelectedEvent>();

  /**
   * Emitted when user requests to save the current view
   */
  @Output() SaveViewRequested = new EventEmitter<SaveViewRequestedEvent>();

  /**
   * Emitted when user wants to open the view management panel
   */
  @Output() ManageViewsRequested = new EventEmitter<void>();

  /**
   * Emitted when user wants to open the current view in its own tab
   */
  @Output() OpenInTabRequested = new EventEmitter<string>();

  /**
   * Emitted when user wants to configure the current view
   */
  @Output() ConfigureViewRequested = new EventEmitter<void>();

  /**
   * Emitted when user wants to create a new record
   */
  @Output() CreateNewRecordRequested = new EventEmitter<void>();

  /**
   * Emitted when user wants to export data to Excel
   */
  @Output() ExportRequested = new EventEmitter<void>();

  /**
   * Emitted when user wants to duplicate a view (F-005)
   */
  @Output() DuplicateViewRequested = new EventEmitter<string>();

  /**
   * Emitted when user wants to use the quick save dialog (F-001)
   * Emits true when user explicitly requested "Save As New", false for general save
   */
  @Output() QuickSaveRequested = new EventEmitter<boolean>();

  /**
   * Emitted when user wants to revert to saved state (F-007)
   */
  @Output() RevertRequested = new EventEmitter<void>();

  // Internal state
  public IsLoading: boolean = false;
  public IsDropdownOpen: boolean = false;
  public MyViews: ViewListItem[] = [];
  public SharedViews: ViewListItem[] = [];
  public SelectedView: MJUserViewEntityExtended | null = null;
  public SearchText: string = '';

  private destroy$ = new Subject<void>();
  /** Guards the one-time reactive subscription to UserViewEngine set up in {@link ensureEngineSubscription}. */
  private subscribedToEngine = false;
  private get metadata() { return this.ProviderToUse; }

  constructor(private cdr: ChangeDetectorRef) { super(); }

  ngOnChanges(changes: SimpleChanges): void {
    if (changes['Entity']) {
      if (this.Entity) {
        void this.LoadViews();
      } else {
        this.MyViews = [];
        this.SharedViews = [];
        this.SelectedView = null;
      }
    }

    if (changes['SelectedViewID'] && this.SelectedViewID) {
      // If we have a selected view ID and it's in our lists, update selectedView
      this.updateSelectedViewFromId();
    }
  }

  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
  }

  /**
   * Ensure the {@link UserViewEngine} cache is loaded, establish a one-time reactive
   * subscription to it, and (re)derive the view lists for the current entity.
   *
   * The subscription is what keeps this dropdown correct: BaseEntity `.Save()`/`.Delete()`
   * on a User View auto-invalidates the engine cache (an in-place array mutation), which
   * emits on `ObserveProperty('_views')`. So when the workspace creates, updates, duplicates,
   * or deletes a view, the list here re-derives automatically — no manual reload required,
   * and no stale-cache race between a fire-and-forget reload and the async cache update.
   */
  public async LoadViews(): Promise<void> {
    if (!this.Entity) {
      return;
    }

    this.IsLoading = true;
    this.cdr.detectChanges();

    try {
      // Load once; subsequent calls are cheap no-ops. We never force a refresh here — the
      // reactive subscription below keeps the lists fresh once data has changed.
      await UserViewEngine.Instance.Config(false);
    } catch (error) {
      console.error('Failed to load views:', error);
    } finally {
      this.IsLoading = false;
    }

    this.ensureEngineSubscription();
    this.recomputeViews();
  }

  /**
   * Subscribe (once for the component's lifetime) to the engine's cached `_views` array.
   * The BehaviorSubject replays the current array on subscribe and re-emits on every
   * subsequent create/update/delete/refresh, so {@link recomputeViews} runs whenever the
   * underlying data actually changes.
   */
  private ensureEngineSubscription(): void {
    if (this.subscribedToEngine) {
      return;
    }
    this.subscribedToEngine = true;
    UserViewEngine.Instance
      .ObserveProperty<MJUserViewEntityExtended>('_views')
      .pipe(takeUntil(this.destroy$))
      .subscribe(() => this.recomputeViews());
  }

  /**
   * Re-derive the owned/shared view lists for the current entity from the engine cache.
   * `GetAccessibleViewsForEntity()` already filters by owned + shared and checks UserCanView.
   */
  private recomputeViews(): void {
    if (!this.Entity) {
      this.MyViews = [];
      this.SharedViews = [];
      this.SelectedView = null;
      this.cdr.detectChanges();
      return;
    }

    try {
      const userId = this.metadata.CurrentUser?.ID;
      const accessibleViews = UserViewEngine.Instance.GetAccessibleViewsForEntity(this.Entity.ID);

      // Separate into owned and shared
      this.MyViews = accessibleViews
        .filter(v => UUIDsEqual(v.UserID, userId))
        .map(v => this.mapViewToListItem(v, true));

      this.SharedViews = accessibleViews
        .filter(v => !UUIDsEqual(v.UserID, userId))
        .map(v => this.mapViewToListItem(v, false));

      // Update selected view reference
      this.updateSelectedViewFromId();
    } catch (error) {
      console.error('Failed to derive views:', error);
    } finally {
      this.cdr.detectChanges();
    }
  }

  /**
   * Map a view entity to a list item
   */
  private mapViewToListItem(view: MJUserViewEntityExtended, isOwned: boolean): ViewListItem {
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
    if (!this.SelectedViewID) {
      this.SelectedView = null;
      return;
    }

    // Search in both lists
    const myView = this.MyViews.find(v => v.id === this.SelectedViewID);
    if (myView) {
      this.SelectedView = myView.entity;
      return;
    }

    const sharedView = this.SharedViews.find(v => v.id === this.SelectedViewID);
    if (sharedView) {
      this.SelectedView = sharedView.entity;
      return;
    }

    // View not in lists yet - it might need to be loaded
    this.SelectedView = null;
  }

  /**
   * Get the display name for the current selection
   */
  get DisplayName(): string {
    if (this.SelectedView) {
      return this.SelectedView.Name;
    }
    return '(Default)';
  }

  /**
   * Toggle dropdown open/closed
   */
  ToggleDropdown(): void {
    this.IsDropdownOpen = !this.IsDropdownOpen;
    this.cdr.detectChanges();
  }

  /**
   * Close the dropdown
   */
  CloseDropdown(): void {
    this.IsDropdownOpen = false;
    this.SearchText = '';
    this.cdr.detectChanges();
  }

  /**
   * Select the default view (no saved view)
   */
  SelectDefault(): void {
    this.SelectedView = null;
    this.ViewSelected.emit({ ViewID: null, View: null });
    this.CloseDropdown();
  }

  /**
   * Select a view from the list
   */
  SelectView(item: ViewListItem): void {
    this.SelectedView = item.entity;
    this.ViewSelected.emit({ ViewID: item.id, View: item.entity });
    this.CloseDropdown();
  }

  /**
   * Request to save the current view
   */
  OnSaveView(): void {
    this.SaveViewRequested.emit({ SaveAsNew: false });
    this.CloseDropdown();
  }

  /**
   * Request to save as a new view - opens Quick Save dialog in "Save As New" mode
   */
  OnSaveAsNewView(): void {
    this.QuickSaveRequested.emit(true);
    this.CloseDropdown();
  }

  /**
   * Request to manage views
   */
  OnManageViews(): void {
    this.ManageViewsRequested.emit();
    this.CloseDropdown();
  }

  /**
   * Request to open the current view in a tab
   */
  OnOpenInTab(): void {
    if (this.SelectedViewID) {
      this.OpenInTabRequested.emit(this.SelectedViewID);
    }
  }

  /**
   * Request to configure the current view
   */
  OnConfigureView(): void {
    this.ConfigureViewRequested.emit();
  }

  /**
   * Request to create a new record
   */
  OnCreateNewRecord(): void {
    this.CreateNewRecordRequested.emit();
  }

  /**
   * Request to export data to Excel
   */
  OnExport(): void {
    this.ExportRequested.emit();
  }

  /**
   * Request to duplicate a view (F-005)
   */
  OnDuplicateView(viewId: string, event: MouseEvent): void {
    event.stopPropagation(); // Don't select the view
    this.DuplicateViewRequested.emit(viewId);
    this.CloseDropdown();
  }

  /**
   * Request to open the quick save dialog (F-001)
   */
  OnQuickSave(): void {
    this.QuickSaveRequested.emit(false);
    this.CloseDropdown();
  }

  /**
   * Request to revert view to saved state (F-007)
   */
  OnRevert(): void {
    this.RevertRequested.emit();
  }

  /**
   * Check if there are any views to show
   */
  get HasViews(): boolean {
    return this.MyViews.length > 0 || this.SharedViews.length > 0;
  }

  /**
   * Title for the "no search results" empty state — echoes the current search term.
   */
  get NoViewsMatchMessage(): string {
    return `No views match "${this.SearchText}"`;
  }

  /**
   * Check if the current user can edit the selected view
   */
  get CanEditSelectedView(): boolean {
    return this.SelectedView?.UserCanEdit ?? false;
  }

  /**
   * Handle click outside to close dropdown
   */
  OnClickOutside(event: Event): void {
    this.CloseDropdown();
  }

  // ========================================
  // RICH VIEW PANEL: Search & Metadata
  // ========================================

  /**
   * My views filtered by search text
   */
  get FilteredMyViews(): ViewListItem[] {
    if (!this.SearchText.trim()) return this.MyViews;
    const term = this.SearchText.toLowerCase();
    return this.MyViews.filter(v =>
      v.name.toLowerCase().includes(term) ||
      (v.entity.Description || '').toLowerCase().includes(term)
    );
  }

  /**
   * Shared views filtered by search text
   */
  get FilteredSharedViews(): ViewListItem[] {
    if (!this.SearchText.trim()) return this.SharedViews;
    const term = this.SearchText.toLowerCase();
    return this.SharedViews.filter(v =>
      v.name.toLowerCase().includes(term) ||
      (v.entity.Description || '').toLowerCase().includes(term)
    );
  }

  /**
   * Get the number of filters configured in a view by parsing its FilterState
   */
  GetViewFilterCount(view: ViewListItem): number {
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
  GetViewColumnCount(view: ViewListItem): number {
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
  GetViewSortInfo(view: ViewListItem): string {
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
  OnConfigureViewById(viewId: string, event: MouseEvent): void {
    event.stopPropagation();
    // First select the view, then open config
    const item = this.MyViews.find(v => v.id === viewId) || this.SharedViews.find(v => v.id === viewId);
    if (item) {
      this.SelectedView = item.entity;
      this.ViewSelected.emit({ ViewID: item.id, View: item.entity });
    }
    this.ConfigureViewRequested.emit();
    this.CloseDropdown();
  }

  /**
   * Open a specific view in a new tab
   */
  OnOpenViewInTab(viewId: string, event: MouseEvent): void {
    event.stopPropagation();
    this.OpenInTabRequested.emit(viewId);
    this.CloseDropdown();
  }

  /**
   * Reset to default view (select no view)
   */
  OnResetToDefault(): void {
    this.SelectDefault();
  }
}
