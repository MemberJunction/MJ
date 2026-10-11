import {
    Component,
    Input,
    Output,
    EventEmitter,
    OnInit,
    OnDestroy,
    ChangeDetectorRef,
    ChangeDetectionStrategy
} from '@angular/core';
import { Subject } from 'rxjs';
import { MJDashboardEntity, MJDashboardCategoryEntity, DashboardUserPermissions } from '@memberjunction/core-entities';
import { UUIDsEqual, NormalizeUUID, EscapeHTML, HighlightSearchMatches } from '@memberjunction/global';
import { MJConfirmService } from '@memberjunction/ng-ui-components';
import type { MJConfirmOptions } from '@memberjunction/ng-ui-components';
import { DashboardCategoryPath, FormatDashboardDate } from '../dashboard-card/dashboard-card.helpers';

// ========================================
// Event Types
// ========================================

/**
 * View mode for the dashboard browser
 */
export type DashboardBrowserViewMode = 'cards' | 'list';

/**
 * Event emitted when a dashboard is selected for viewing
 */
export interface DashboardOpenEvent {
    Dashboard: MJDashboardEntity;
    /** True for a Shift, Ctrl or Cmd click outside selection mode: open the dashboard in a separate tab. */
    OpenInNewTab: boolean;
}

/**
 * Event emitted when a dashboard is selected for editing
 */
export interface DashboardEditEvent {
    Dashboard: MJDashboardEntity;
}

/**
 * Event emitted after the user confirms deleting dashboards. The host deletes them and does not ask again.
 */
export interface DashboardDeleteEvent {
    Dashboards: MJDashboardEntity[];
}

/**
 * Event emitted when the user stars or unstars a dashboard on its card
 */
export interface DashboardFavoriteToggleEvent {
    Dashboard: MJDashboardEntity;
}

/**
 * Event emitted when dashboards are requested to be moved to a folder
 */
export interface DashboardMoveEvent {
    Dashboards: MJDashboardEntity[];
    TargetCategoryId: string | null;
}

/**
 * Event emitted when the category filter changes
 */
export interface CategoryChangeEvent {
    CategoryId: string | null;
    Category: MJDashboardCategoryEntity | null;
}

/**
 * Event emitted when view mode changes
 */
export interface ViewModeChangeEvent {
    Mode: DashboardBrowserViewMode;
}

/**
 * Event emitted when a new dashboard should be created
 */
export interface DashboardCreateEvent {
    CategoryId: string | null;
}

/**
 * Event emitted when a new category should be created
 */
export interface CategoryCreateEvent {
    ParentCategoryId: string | null;
    Name: string;
    Description: string | null;
}

/**
 * Event emitted when a category should be deleted
 */
export interface CategoryDeleteEvent {
    Category: MJDashboardCategoryEntity;
    IncludeContents: boolean;
}

/**
 * Event emitted when view preference should be persisted
 */
export interface ViewPreferenceChangeEvent {
    ViewMode: DashboardBrowserViewMode;
}

/** The texts of the delete confirm: names one dashboard, counts several. */
function deleteDashboardsConfirm(dashboards: MJDashboardEntity[]): Omit<MJConfirmOptions, 'type'> {
    const count = dashboards.length;
    return {
        title: count === 1 ? 'Delete dashboard' : `Delete ${count} dashboards`,
        message: count === 1 ? `Delete "${dashboards[0].Name}"?` : `Delete ${count} dashboards?`,
        detail: 'This action cannot be undone.',
    };
}

/**
 * Generic dashboard browser component.
 * Displays dashboards in card or list view with multi-select, filtering, and bulk actions.
 *
 * This component is GENERIC and has no routing dependencies.
 * All navigation and persistence events are bubbled up for the parent to handle.
 */
@Component({
  standalone: false,
    selector: 'mj-dashboard-browser',
    templateUrl: './dashboard-browser.component.html',
    styleUrls: ['./dashboard-browser.component.css'],
    changeDetection: ChangeDetectionStrategy.OnPush
})
export class DashboardBrowserComponent implements OnInit, OnDestroy {
    // ========================================
    // Inputs
    // ========================================

    /** All dashboards to display */
    private _dashboards: MJDashboardEntity[] = [];

    @Input()
    set Dashboards(value: MJDashboardEntity[]) {
        this._dashboards = value || [];
        this.applyFilters();
    }
    get Dashboards(): MJDashboardEntity[] {
        return this._dashboards;
    }

    /** All categories for filtering */
    private _categories: MJDashboardCategoryEntity[] = [];

    @Input()
    set Categories(value: MJDashboardCategoryEntity[]) {
        this._categories = value || [];
        // Update child categories when categories change (async loading)
        this.updateChildCategories();
        this.cdr.markForCheck();
    }
    get Categories(): MJDashboardCategoryEntity[] {
        return this._categories;
    }

    /** Currently selected category ID (for deep linking) */
    private _selectedCategoryId: string | null = null;

    @Input()
    set SelectedCategoryId(value: string | null) {
        if (value !== this._selectedCategoryId) {
            this._selectedCategoryId = value;
            this.applyFilters();
        }
    }
    get SelectedCategoryId(): string | null {
        return this._selectedCategoryId;
    }

    private _flatMode = false;

    /**
     * When true, shows every dashboard in `Dashboards` in one flat list and ignores
     * `SelectedCategoryId`: no folder scoping, no folder cards, the breadcrumb stays at the
     * root, and new dashboards and categories are created at the root. Search and the
     * Config-type rule still apply. When false (the default), shows the sub-folders and
     * dashboards of the selected folder.
     */
    @Input()
    set FlatMode(value: boolean) {
        if (value !== this._flatMode) {
            this._flatMode = value;
            this.applyFilters();
        }
    }
    get FlatMode(): boolean {
        return this._flatMode;
    }

    /** Initial view mode */
    private _viewMode: DashboardBrowserViewMode = 'cards';

    @Input()
    set ViewMode(value: DashboardBrowserViewMode) {
        if (value !== this._viewMode) {
            this._viewMode = value;
            this.cdr.markForCheck();
        }
    }
    get ViewMode(): DashboardBrowserViewMode {
        return this._viewMode;
    }

    /** Whether the browser is in loading state */
    @Input() IsLoading = false;

    /** Whether to show the create button */
    @Input() ShowCreateButton = true;

    /** Whether to allow multi-select (enables selection mode toggle) */
    @Input() AllowMultiSelect = true;

    /** Whether to allow drag and drop */
    @Input() AllowDragDrop = true;

    /** Whether currently in selection mode (checkboxes visible) */
    public IsSelectionMode = false;

    /** Title to display in the header */
    @Input() Title = 'Dashboards';

    /** Icon class for the header */
    @Input() IconClass = 'fa-solid fa-gauge-high';

    /**
     * Map of dashboard ID to user permissions.
     * Used to show shared indicators and control edit/delete button visibility.
     */
    private _dashboardPermissions: Map<string, DashboardUserPermissions> = new Map();

    @Input()
    set DashboardPermissions(value: Map<string, DashboardUserPermissions> | null) {
        this._dashboardPermissions = value || new Map();
        this.cdr.markForCheck();
    }
    get DashboardPermissions(): Map<string, DashboardUserPermissions> {
        return this._dashboardPermissions;
    }

    /**
     * Map of dashboard ID to effective category ID for display.
     * Used to show shared dashboards in the user's chosen category instead of owner's category.
     * If a dashboard ID is not in this map, its actual CategoryID is used.
     * Use empty string '' to indicate root/uncategorized.
     */
    private _effectiveCategoryMap: Map<string, string | null> = new Map();

    @Input()
    set EffectiveCategoryMap(value: Map<string, string | null> | null) {
        this._effectiveCategoryMap = value || new Map();
        this.applyFilters();
    }
    get EffectiveCategoryMap(): Map<string, string | null> {
        return this._effectiveCategoryMap;
    }

    /** IDs of the user's favorite dashboards. Their cards show a filled star. */
    private _favoriteIds = new Set<string>();

    @Input()
    set FavoriteIds(value: readonly string[] | null) {
        this._favoriteIds = new Set((value ?? []).map(id => NormalizeUUID(id)));
        this.cdr.markForCheck();
    }
    get FavoriteIds(): string[] {
        return [...this._favoriteIds];
    }

    /** Whether cards show the favorite star. Turn it on when the host handles DashboardFavoriteToggle. */
    @Input() ShowFavorites = false;

    /**
     * Map of dashboard ID to the owner text its card shows ("You", or a name). A dashboard whose ID
     * is not in the map shows no owner. IDs match in any letter case.
     */
    private _ownerLabels = new Map<string, string>();
    private ownerLabelById = new Map<string, string>();

    @Input()
    set OwnerLabels(value: Map<string, string> | null) {
        this._ownerLabels = value ?? new Map();
        this.ownerLabelById = new Map([...this._ownerLabels].map(([id, label]) => [NormalizeUUID(id), label]));
        this.cdr.markForCheck();
    }
    get OwnerLabels(): Map<string, string> {
        return this._ownerLabels;
    }

    /** Icon of the empty state of a flat list with no dashboards and no search. */
    @Input() FlatEmptyIcon = 'fa-solid fa-layer-group';

    /** Title of the empty state of a flat list with no dashboards and no search. */
    @Input() FlatEmptyTitle = 'No dashboards to show';

    /** Message of the empty state of a flat list with no dashboards and no search. */
    @Input() FlatEmptyMessage = 'There are no dashboards in this list yet.';

    /** When true, an empty flat list with no search shows the first-run welcome instead. */
    @Input() FlatEmptyWelcome = false;

    // ========================================
    // Outputs
    // ========================================

    /** Emitted when a dashboard is opened for viewing */
    @Output() DashboardOpen = new EventEmitter<DashboardOpenEvent>();

    /** Emitted when a dashboard is opened for editing */
    @Output() DashboardEdit = new EventEmitter<DashboardEditEvent>();

    /** Emitted after the user confirms a delete. The host deletes the dashboards and does not ask again. */
    @Output() DashboardDelete = new EventEmitter<DashboardDeleteEvent>();

    /** Emitted when dashboards are requested to move to a folder */
    @Output() DashboardMove = new EventEmitter<DashboardMoveEvent>();

    /** Emitted when a new dashboard should be created */
    @Output() DashboardCreate = new EventEmitter<DashboardCreateEvent>();

    /** Emitted when a new category should be created */
    @Output() CategoryCreate = new EventEmitter<CategoryCreateEvent>();

    /** Emitted when a category should be deleted */
    @Output() CategoryDelete = new EventEmitter<CategoryDeleteEvent>();

    /** Emitted when the category filter changes */
    @Output() CategoryChange = new EventEmitter<CategoryChangeEvent>();

    /** Emitted when view mode changes (for persistence) */
    @Output() ViewModeChange = new EventEmitter<ViewModeChangeEvent>();

    /** Emitted when view preference should be persisted */
    @Output() ViewPreferenceChange = new EventEmitter<ViewPreferenceChangeEvent>();

    /** Emitted when the user stars or unstars a dashboard on its card */
    @Output() DashboardFavoriteToggle = new EventEmitter<DashboardFavoriteToggleEvent>();

    // ========================================
    // State
    // ========================================

    /** Filtered dashboards based on search and category */
    public FilteredDashboards: MJDashboardEntity[] = [];

    /** Current search text */
    public SearchText = '';

    /** Set of selected dashboard IDs */
    public SelectedIds = new Set<string>();

    /** The last dashboard clicked in selection mode: where a Shift-click range starts */
    private lastClickedId: string | null = null;

    /** Whether move-to-folder dialog is visible */
    public ShowMoveDialog = false;

    /** Currently dragging dashboard ID */
    public DraggingId: string | null = null;

    /** Drop target category ID */
    public DropTargetCategoryId: string | null = null;

    /** Whether the "New" dropdown menu is open */
    public ShowNewMenu = false;

    /** Whether the create category dialog is visible */
    public ShowCreateCategoryDialog = false;

    /** New category form values */
    public NewCategoryName = '';
    public NewCategoryDescription = '';

    /** Child categories of the current folder */
    public ChildCategories: MJDashboardCategoryEntity[] = [];

    /** Filtered child categories (based on search) */
    public FilteredChildCategories: MJDashboardCategoryEntity[] = [];

    /** Breadcrumb trail from root to current category */
    public Breadcrumbs: MJDashboardCategoryEntity[] = [];

    /** Whether the delete category dialog is visible */
    public ShowDeleteCategoryConfirm = false;

    /** Category pending deletion */
    public CategoryPendingDelete: MJDashboardCategoryEntity | null = null;

    /** Whether to include contents when deleting category */
    public DeleteCategoryIncludeContents = false;

    /** Drop target category ID for drag-over highlighting on category cards */
    public DragOverChildCategoryId: string | null = null;

    private readonly destroy$ = new Subject<void>();

    // ========================================
    // Constructor
    // ========================================

    constructor(private cdr: ChangeDetectorRef, private confirmService: MJConfirmService) {}

    // ========================================
    // Lifecycle
    // ========================================

    ngOnInit(): void {
        this.applyFilters();
    }

    ngOnDestroy(): void {
        this.destroy$.next();
        this.destroy$.complete();
    }

    // ========================================
    // Public Methods - View Mode
    // ========================================

    /**
     * Toggle between card and list view
     */
    public ToggleViewMode(): void {
        this.ViewMode = this.ViewMode === 'cards' ? 'list' : 'cards';
        this.ViewModeChange.emit({ Mode: this.ViewMode });
        this.ViewPreferenceChange.emit({ ViewMode: this.ViewMode });
    }

    /**
     * Set view mode explicitly
     */
    public SetViewMode(mode: DashboardBrowserViewMode): void {
        if (mode !== this.ViewMode) {
            this.ViewMode = mode;
            this.ViewModeChange.emit({ Mode: mode });
            this.ViewPreferenceChange.emit({ ViewMode: mode });
        }
    }

    // ========================================
    // Public Methods - Filtering
    // ========================================

    /**
     * Handle search text change
     */
    public OnSearchChange(): void {
        this.applyFilters();
    }

    /**
     * Clear search text
     */
    public ClearSearch(): void {
        this.SearchText = '';
        this.applyFilters();
    }

    /**
     * Message shown in the search no-results empty state, echoing the search term.
     */
    public get NoResultsMessage(): string {
        return `No dashboards or folders match "${this.SearchText}". Try a different search term.`;
    }

    /**
     * Whether an empty browser shows the first-run welcome: in flat mode when the host asks for it
     * (FlatEmptyWelcome) and there is no search; in folder mode at the root when there are no
     * dashboards at all.
     */
    public get ShowWelcome(): boolean {
        return this._flatMode ? this.FlatEmptyWelcome && !this.SearchText : this.IsAtRoot && this._dashboards.length === 0;
    }

    /**
     * Handle category filter change
     */
    public OnCategoryChange(categoryId: string | null): void {
        this._selectedCategoryId = categoryId;
        const category = categoryId
            ? this.Categories.find(c => UUIDsEqual(c.ID, categoryId)) || null
            : null;
        this.CategoryChange.emit({ CategoryId: categoryId, Category: category });
        this.applyFilters();
    }

    /**
     * Clear all filters
     */
    public ClearFilters(): void {
        this.SearchText = '';
        this._selectedCategoryId = null;
        this.CategoryChange.emit({ CategoryId: null, Category: null });
        this.applyFilters();
    }

    /**
     * Navigate into a category folder
     */
    public NavigateToCategory(categoryId: string | null): void {
        this._selectedCategoryId = categoryId;
        const category = categoryId
            ? this.Categories.find(c => UUIDsEqual(c.ID, categoryId)) || null
            : null;
        this.CategoryChange.emit({ CategoryId: categoryId, Category: category });
        this.applyFilters();
    }

    /**
     * Navigate up to parent category
     */
    public NavigateUp(): void {
        if (!this._selectedCategoryId) return;

        const currentCategory = this.Categories.find(c => UUIDsEqual(c.ID, this._selectedCategoryId));
        const parentId = currentCategory?.ParentID || null;
        this.NavigateToCategory(parentId);
    }

    /**
     * Check if we're at the root level
     */
    public get IsAtRoot(): boolean {
        return !this._selectedCategoryId;
    }

    /**
     * Get the current category (for display)
     */
    public get CurrentCategory(): MJDashboardCategoryEntity | null {
        if (!this._selectedCategoryId) return null;
        return this.Categories.find(c => UUIDsEqual(c.ID, this._selectedCategoryId)) || null;
    }

    // ========================================
    // Public Methods - Selection
    // ========================================

    /**
     * Handles a click on a dashboard. Outside selection mode every click opens the dashboard, and a
     * Shift, Ctrl or Cmd click asks for a separate tab (`OpenInNewTab`). In selection mode a
     * Shift-click selects the range from the last dashboard clicked in selection mode (just this one
     * when there is none yet), a Ctrl or Cmd click toggles the dashboard, and a plain click clears
     * the selection and opens the dashboard.
     */
    public OnDashboardClick(dashboard: MJDashboardEntity, event: MouseEvent): void {
        if (!this.AllowMultiSelect || !this.IsSelectionMode) {
            this.SelectedIds.clear();
            this.DashboardOpen.emit({ Dashboard: dashboard, OpenInNewTab: event.shiftKey || event.ctrlKey || event.metaKey });
            this.cdr.markForCheck();
            return;
        }

        if (event.shiftKey && this.lastClickedId) {
            this.selectRange(this.lastClickedId, dashboard.ID);
        } else if (event.shiftKey || event.ctrlKey || event.metaKey) {
            this.ToggleSelection(dashboard.ID);
        } else {
            this.SelectedIds.clear();
            this.DashboardOpen.emit({ Dashboard: dashboard, OpenInNewTab: false });
        }

        this.lastClickedId = dashboard.ID;
        this.cdr.markForCheck();
    }

    /**
     * Handle double-click to edit
     */
    public OnDashboardDoubleClick(dashboard: MJDashboardEntity, event: MouseEvent): void {
        event.preventDefault();
        event.stopPropagation();
        this.DashboardEdit.emit({ Dashboard: dashboard });
    }

    /**
     * Check if a dashboard is selected
     */
    public IsSelected(dashboardId: string): boolean {
        return this.SelectedIds.has(dashboardId);
    }

    /**
     * Select all visible dashboards
     */
    public SelectAll(): void {
        this.SelectedIds.clear();
        for (const dashboard of this.FilteredDashboards) {
            this.SelectedIds.add(dashboard.ID);
        }
        this.cdr.markForCheck();
    }

    /**
     * Clear all selections
     */
    public ClearSelection(): void {
        this.SelectedIds.clear();
        this.lastClickedId = null;
        this.cdr.markForCheck();
    }

    /**
     * Enter selection mode (show checkboxes)
     */
    public EnterSelectionMode(): void {
        if (!this.AllowMultiSelect) return;
        this.IsSelectionMode = true;
        this.cdr.markForCheck();
    }

    /**
     * Exit selection mode (hide checkboxes and clear selections)
     */
    public ExitSelectionMode(): void {
        this.IsSelectionMode = false;
        this.SelectedIds.clear();
        this.lastClickedId = null;
        this.cdr.markForCheck();
    }

    /**
     * Toggle selection mode
     */
    public ToggleSelectionMode(): void {
        if (this.IsSelectionMode) {
            this.ExitSelectionMode();
        } else {
            this.EnterSelectionMode();
        }
    }

    /**
     * Get count of selected dashboards
     */
    public get SelectedCount(): number {
        return this.SelectedIds.size;
    }

    /**
     * Get selected dashboards
     */
    public GetSelectedDashboards(): MJDashboardEntity[] {
        return this.Dashboards.filter(d => this.SelectedIds.has(d.ID));
    }

    // ========================================
    // Public Methods - Actions
    // ========================================

    /**
     * Toggle the "New" dropdown menu
     */
    public ToggleNewMenu(): void {
        this.ShowNewMenu = !this.ShowNewMenu;
    }

    /**
     * Close the "New" dropdown menu
     */
    public CloseNewMenu(): void {
        this.ShowNewMenu = false;
    }

    /**
     * Request to create a new dashboard
     */
    public OnCreateDashboard(): void {
        this.CloseNewMenu();
        this.DashboardCreate.emit({ CategoryId: this.folderIdForNewItems });
    }

    /**
     * Open the create category dialog
     */
    public OpenCreateCategoryDialog(): void {
        this.CloseNewMenu();
        this.NewCategoryName = '';
        this.NewCategoryDescription = '';
        this.ShowCreateCategoryDialog = true;
        this.cdr.markForCheck();
    }

    /**
     * Close the create category dialog
     */
    public CloseCreateCategoryDialog(): void {
        this.ShowCreateCategoryDialog = false;
        this.NewCategoryName = '';
        this.NewCategoryDescription = '';
        this.cdr.markForCheck();
    }

    /**
     * Confirm category creation
     */
    public ConfirmCreateCategory(): void {
        if (!this.NewCategoryName.trim()) return;

        this.CategoryCreate.emit({
            ParentCategoryId: this.folderIdForNewItems,
            Name: this.NewCategoryName.trim(),
            Description: this.NewCategoryDescription.trim() || null
        });
        this.CloseCreateCategoryDialog();
    }

    /**
     * Asks the host to edit one dashboard. A click event, when given, does not also reach the row or card.
     */
    public OnEditDashboard(dashboard: MJDashboardEntity, event?: Event): void {
        event?.stopPropagation();
        this.DashboardEdit.emit({ Dashboard: dashboard });
    }

    /**
     * Asks the user to confirm deleting one dashboard, then emits DashboardDelete. A click event, when
     * given, does not also reach the row or card.
     */
    public async OnDeleteDashboard(dashboard: MJDashboardEntity, event?: Event): Promise<void> {
        event?.stopPropagation();
        await this.confirmAndDelete([dashboard]);
    }

    /** Emits DashboardFavoriteToggle for the dashboard whose star the user clicked. */
    public OnToggleFavorite(dashboard: MJDashboardEntity): void {
        this.DashboardFavoriteToggle.emit({ Dashboard: dashboard });
    }

    /** Asks the user to confirm deleting the selected dashboards they may delete, then emits DashboardDelete. */
    public async OnDeleteSelected(): Promise<void> {
        const deletable = this.GetDeletableSelectedDashboards();
        if (deletable.length === 0) return;
        await this.confirmAndDelete(deletable);
    }

    /** Emits DashboardDelete and leaves selection mode when the user confirms; keeps everything when they cancel. */
    private async confirmAndDelete(dashboards: MJDashboardEntity[]): Promise<void> {
        if (!(await this.confirmService.ConfirmDelete(deleteDashboardsConfirm(dashboards)))) return;
        this.DashboardDelete.emit({ Dashboards: dashboards });
        this.ExitSelectionMode();   // clears SelectedIds and calls markForCheck
    }

    /**
     * Open move-to-folder dialog for selected dashboards
     */
    public OnMoveSelected(): void {
        if (this.SelectedIds.size === 0) return;
        this.ShowMoveDialog = true;
        this.cdr.markForCheck();
    }

    /**
     * Confirm move to folder
     */
    public ConfirmMove(targetCategoryId: string | null): void {
        const dashboards = this.GetSelectedDashboards();
        if (dashboards.length > 0) {
            this.DashboardMove.emit({
                Dashboards: dashboards,
                TargetCategoryId: targetCategoryId
            });
        }
        this.CloseMoveDialog();
        // Exit selection mode after bulk operation
        this.ExitSelectionMode();
    }

    /**
     * Cancel move
     */
    public CloseMoveDialog(): void {
        this.ShowMoveDialog = false;
        this.cdr.markForCheck();
    }

    // ========================================
    // Public Methods - Category Actions
    // ========================================

    /**
     * Request to delete a category
     */
    public OnDeleteCategory(category: MJDashboardCategoryEntity, event: Event): void {
        event.stopPropagation();
        this.CategoryPendingDelete = category;
        this.DeleteCategoryIncludeContents = false;
        this.ShowDeleteCategoryConfirm = true;
        this.cdr.markForCheck();
    }

    /**
     * Confirm category deletion
     */
    public ConfirmDeleteCategory(): void {
        if (this.CategoryPendingDelete) {
            this.CategoryDelete.emit({
                Category: this.CategoryPendingDelete,
                IncludeContents: this.DeleteCategoryIncludeContents
            });
        }
        this.CloseDeleteCategoryConfirm();
    }

    /**
     * Cancel category deletion
     */
    public CloseDeleteCategoryConfirm(): void {
        this.ShowDeleteCategoryConfirm = false;
        this.CategoryPendingDelete = null;
        this.DeleteCategoryIncludeContents = false;
        this.cdr.markForCheck();
    }

    /**
     * Get count of dashboards and sub-categories in a category
     */
    public GetCategoryContentCount(category: MJDashboardCategoryEntity): { dashboards: number; categories: number } {
        const dashboards = this.Dashboards.filter(d => UUIDsEqual(d.CategoryID, category.ID)).length;
        const categories = this.Categories.filter(c => UUIDsEqual(c.ParentID, category.ID)).length;
        return { dashboards, categories };
    }

    // ========================================
    // Public Methods - Drag and Drop
    // ========================================

    /**
     * Handle drag start
     */
    public OnDragStart(dashboard: MJDashboardEntity, event: DragEvent): void {
        if (!this.AllowDragDrop) return;

        this.DraggingId = dashboard.ID;

        // If dragging an unselected item, select only it
        if (!this.SelectedIds.has(dashboard.ID)) {
            this.SelectedIds.clear();
            this.SelectedIds.add(dashboard.ID);
        }

        // Set drag data
        const dragData = {
            type: 'dashboards',
            ids: Array.from(this.SelectedIds)
        };
        event.dataTransfer?.setData('application/json', JSON.stringify(dragData));
        event.dataTransfer!.effectAllowed = 'move';

        // Create custom drag image for list view (smaller than full row)
        if (this._viewMode === 'list' && event.dataTransfer) {
            const dragPreview = this.createDragPreview(dashboard);
            document.body.appendChild(dragPreview);
            event.dataTransfer.setDragImage(dragPreview, 12, 12);
            // Clean up the preview element after drag starts
            setTimeout(() => dragPreview.remove(), 0);
        }

        this.cdr.markForCheck();
    }

    /**
     * Create a compact drag preview element
     */
    private createDragPreview(dashboard: MJDashboardEntity): HTMLElement {
        const count = this.SelectedIds.size;
        const preview = document.createElement('div');
        preview.style.cssText = `
            position: absolute;
            left: -9999px;
            top: -9999px;
            display: flex;
            align-items: center;
            gap: 8px;
            padding: 8px 12px;
            background: var(--mj-brand-primary);
            color: var(--mj-text-inverse);
            border-radius: 6px;
            font-size: 13px;
            font-weight: 500;
            box-shadow: 0 4px 12px color-mix(in srgb, var(--mj-text-primary) 30%, transparent);
            white-space: nowrap;
        `;

        const icon = document.createElement('i');
        icon.className = 'fa-solid fa-chart-line';
        preview.appendChild(icon);

        const text = document.createElement('span');
        text.textContent = count > 1 ? `${count} dashboards` : dashboard.Name;
        preview.appendChild(text);

        return preview;
    }

    /**
     * Handle drag end
     */
    public OnDragEnd(): void {
        this.DraggingId = null;
        this.DropTargetCategoryId = null;
        this.cdr.markForCheck();
    }

    /**
     * Handle drag over category
     */
    public OnDragOverCategory(categoryId: string | null, event: DragEvent): void {
        if (!this.AllowDragDrop) return;
        event.preventDefault();
        event.dataTransfer!.dropEffect = 'move';
        this.DropTargetCategoryId = categoryId;
        this.cdr.markForCheck();
    }

    /**
     * Handle drag leave category
     */
    public OnDragLeaveCategory(): void {
        this.DropTargetCategoryId = null;
        this.cdr.markForCheck();
    }

    /**
     * Handle drop on category
     */
    public OnDropOnCategory(categoryId: string | null, event: DragEvent): void {
        if (!this.AllowDragDrop) return;
        event.preventDefault();

        const data = event.dataTransfer?.getData('application/json');
        if (data) {
            try {
                const dragData = JSON.parse(data);
                if (dragData.type === 'dashboards' && dragData.ids?.length > 0) {
                    const draggedIds = new Set(dragData.ids.map((id: string) => NormalizeUUID(id)));
                    const dashboards = this.Dashboards.filter(d => draggedIds.has(NormalizeUUID(d.ID)));
                    if (dashboards.length > 0) {
                        this.DashboardMove.emit({
                            Dashboards: dashboards,
                            TargetCategoryId: categoryId
                        });
                    }
                }
            } catch {
                // Invalid drag data
            }
        }

        this.DraggingId = null;
        this.DropTargetCategoryId = null;
        this.cdr.markForCheck();
    }

    // ========================================
    // Public Methods - Helpers
    // ========================================

    /**
     * Get category name for a dashboard
     */
    public GetCategoryName(categoryId: string | null): string {
        if (!categoryId) return 'Uncategorized';
        const category = this.Categories.find(c => UUIDsEqual(c.ID, categoryId));
        return category?.Name || 'Unknown';
    }

    /**
     * Format date for display: "Today", "Yesterday", "N days ago" (under a week), else the local date
     */
    public FormatDate(date: Date): string {
        return FormatDashboardDate(date);
    }

    /** True when the dashboard is one of the user's favorites (FavoriteIds). */
    public IsFavorite(dashboardId: string): boolean {
        return this._favoriteIds.has(NormalizeUUID(dashboardId));
    }

    /** The owner text of the dashboard's card (from OwnerLabels), or null for none. */
    public OwnerLabel(dashboard: MJDashboardEntity): string | null {
        return this.ownerLabelById.get(NormalizeUUID(dashboard.ID)) ?? null;
    }

    /** The category path a card shows: only in flat mode, where the folder is not otherwise visible. */
    public CardCategoryPath(dashboard: MJDashboardEntity): string | null {
        return this._flatMode ? DashboardCategoryPath(this.GetEffectiveCategoryId(dashboard), this._categories) : null;
    }

    /**
     * Track by function for ngFor
     */
    public TrackByDashboard(_index: number, dashboard: MJDashboardEntity): string {
        return dashboard.ID;
    }

    /**
     * Track by function for categories
     */
    public TrackByCategory(_index: number, category: MJDashboardCategoryEntity): string {
        return category.ID;
    }

    // ========================================
    // Public Methods - Category Helpers
    // ========================================

    /**
     * Gets the effective category ID for a dashboard for display purposes.
     * For shared dashboards, this may differ from the actual CategoryID
     * based on the user's DashboardCategoryLink.
     */
    public GetEffectiveCategoryId(dashboard: MJDashboardEntity): string | null {
        // If we have an effective category mapping, use it
        if (this._effectiveCategoryMap.has(dashboard.ID)) {
            return this._effectiveCategoryMap.get(dashboard.ID) ?? null;
        }
        // Otherwise use the dashboard's actual category
        return dashboard.CategoryID || null;
    }

    // ========================================
    // Public Methods - Permission Checks
    // ========================================

    /**
     * Check if a dashboard is shared with the current user (not owned)
     */
    public IsShared(dashboardId: string): boolean {
        const perms = this._dashboardPermissions.get(dashboardId);
        // If permissions exist and user is not owner but can read, it's shared
        return perms ? !perms.IsOwner && perms.CanRead : false;
    }

    /**
     * Check if user can edit a dashboard
     */
    public CanEdit(dashboardId: string): boolean {
        const perms = this._dashboardPermissions.get(dashboardId);
        // Default to true if no permissions provided (backwards compatibility)
        return perms ? perms.CanEdit : true;
    }

    /**
     * Check if user can delete a dashboard
     */
    public CanDelete(dashboardId: string): boolean {
        const perms = this._dashboardPermissions.get(dashboardId);
        // Default to true if no permissions provided (backwards compatibility)
        return perms ? perms.CanDelete : true;
    }

    /**
     * Check if any of the currently selected dashboards can be deleted.
     * Returns true only if at least one selected dashboard can be deleted.
     * Used to enable/disable the bulk delete button in selection mode.
     */
    public get CanDeleteAnySelected(): boolean {
        if (this.SelectedIds.size === 0) return false;

        for (const id of this.SelectedIds) {
            if (this.CanDelete(id)) {
                return true;
            }
        }
        return false;
    }

    /**
     * Gets the list of selected dashboards that can be deleted.
     * Filters out dashboards the user doesn't have permission to delete.
     */
    public GetDeletableSelectedDashboards(): MJDashboardEntity[] {
        return this.GetSelectedDashboards().filter(d => this.CanDelete(d.ID));
    }

    /**
     * Highlight matching search text in a string
     * Returns HTML with <mark> tags around matches
     */
    public HighlightMatch(text: string): string {
        return HighlightSearchMatches(text, this.SearchText);
    }

    // ========================================
    // Drag and Drop on Category Cards
    // ========================================

    /**
     * Handle drag over a category card
     */
    public OnDragOverChildCategory(categoryId: string, event: DragEvent): void {
        if (!this.AllowDragDrop || !this.DraggingId) return;
        event.preventDefault();
        event.stopPropagation();
        event.dataTransfer!.dropEffect = 'move';
        this.DragOverChildCategoryId = categoryId;
        this.cdr.markForCheck();
    }

    /**
     * Handle drag leave from a category card
     */
    public OnDragLeaveChildCategory(): void {
        this.DragOverChildCategoryId = null;
        this.cdr.markForCheck();
    }

    /**
     * Handle drop on a category card
     */
    public OnDropOnChildCategory(categoryId: string, event: DragEvent): void {
        if (!this.AllowDragDrop) return;
        event.preventDefault();
        event.stopPropagation();

        const data = event.dataTransfer?.getData('application/json');
        if (data) {
            try {
                const dragData = JSON.parse(data);
                if (dragData.type === 'dashboards' && dragData.ids?.length > 0) {
                    const draggedIds = new Set(dragData.ids.map((id: string) => NormalizeUUID(id)));
                    const dashboards = this.Dashboards.filter(d => draggedIds.has(NormalizeUUID(d.ID)));
                    if (dashboards.length > 0) {
                        this.DashboardMove.emit({
                            Dashboards: dashboards,
                            TargetCategoryId: categoryId
                        });
                        // Exit selection mode after move
                        this.ExitSelectionMode();
                    }
                }
            } catch {
                // Invalid drag data
            }
        }

        this.DraggingId = null;
        this.DragOverChildCategoryId = null;
        this.DropTargetCategoryId = null;
        this.cdr.markForCheck();
    }

    /**
     * Handle drop from breadcrumb component
     */
    public OnBreadcrumbDrop(event: { TargetCategoryId: string | null; DashboardIds: string[] }): void {
        const droppedIds = new Set(event.DashboardIds.map(id => NormalizeUUID(id)));
        const dashboards = this.Dashboards.filter(d => droppedIds.has(NormalizeUUID(d.ID)));
        if (dashboards.length > 0) {
            this.DashboardMove.emit({
                Dashboards: dashboards,
                TargetCategoryId: event.TargetCategoryId
            });
            // Exit selection mode after move
            this.ExitSelectionMode();
        }
    }

    // ========================================
    // Private Methods
    // ========================================

    /** The folder new dashboards and categories go into: the selected one, or the root in flat mode. */
    private get folderIdForNewItems(): string | null {
        return this._flatMode ? null : this.SelectedCategoryId;
    }

    private applyFilters(): void {
        let filtered = [...this._dashboards];

        // Filter out non-Config dashboards (Code and Dynamic Code types are not viewable/editable in browser)
        filtered = filtered.filter(d => d.Type === 'Config');

        // Filter by search text
        if (this.SearchText.trim()) {
            const search = this.SearchText.toLowerCase();
            filtered = filtered.filter(d =>
                d.Name.toLowerCase().includes(search) ||
                (d.Description || '').toLowerCase().includes(search)
            );
        }

        // Filter by current folder (category); flat mode skips this and shows every dashboard
        // When at root (null), show only uncategorized dashboards
        // When in a category, show only dashboards directly in that category
        // Uses effective category (from EffectiveCategoryMap) for shared dashboards
        if (!this._flatMode) {
            if (this._selectedCategoryId) {
                filtered = filtered.filter(d => this.GetEffectiveCategoryId(d) === this._selectedCategoryId);
            } else {
                // At root level, show only uncategorized dashboards (effective CategoryID is null or empty)
                filtered = filtered.filter(d => !this.GetEffectiveCategoryId(d));
            }
        }

        this.FilteredDashboards = filtered;
        this.updateChildCategories();
        this.updateBreadcrumbs();
        this.cdr.markForCheck();
    }

    /**
     * Update the list of child categories for the current folder
     */
    private updateChildCategories(): void {
        // Find categories that are children of the current category (none in flat mode)
        // Handle both null and undefined ParentID for root-level categories
        if (this._flatMode) {
            this.ChildCategories = [];
        } else if (this._selectedCategoryId) {
            this.ChildCategories = this.Categories.filter(c => UUIDsEqual(c.ParentID, this._selectedCategoryId));
        } else {
            // At root level - show categories with no parent (null or undefined)
            this.ChildCategories = this.Categories.filter(c => !c.ParentID);
        }

        // Apply search filter to categories if search text exists
        if (this.SearchText.trim()) {
            const search = this.SearchText.toLowerCase();
            this.FilteredChildCategories = this.ChildCategories.filter(c =>
                c.Name.toLowerCase().includes(search) ||
                (c.Description || '').toLowerCase().includes(search)
            );
        } else {
            this.FilteredChildCategories = [...this.ChildCategories];
        }
    }

    /**
     * Update breadcrumb trail from root to current category
     */
    private updateBreadcrumbs(): void {
        this.Breadcrumbs = [];

        if (!this._selectedCategoryId || this._flatMode) return;

        // Build the path from current category to root
        const path: MJDashboardCategoryEntity[] = [];
        let currentId: string | null = this._selectedCategoryId;

        while (currentId) {
            const category = this.Categories.find(c => UUIDsEqual(c.ID, currentId));
            if (category) {
                path.unshift(category);
                currentId = category.ParentID;
            } else {
                break;
            }
        }

        this.Breadcrumbs = path;
    }

    /**
     * Toggle selection for a single dashboard
     */
    public ToggleSelection(dashboardId: string): void {
        if (this.SelectedIds.has(dashboardId)) {
            this.SelectedIds.delete(dashboardId);
        } else {
            this.SelectedIds.add(dashboardId);
        }
        this.cdr.markForCheck();
    }

    private selectRange(fromId: string, toId: string): void {
        const fromIndex = this.FilteredDashboards.findIndex(d => UUIDsEqual(d.ID, fromId));
        const toIndex = this.FilteredDashboards.findIndex(d => UUIDsEqual(d.ID, toId));

        if (fromIndex === -1 || toIndex === -1) return;

        const start = Math.min(fromIndex, toIndex);
        const end = Math.max(fromIndex, toIndex);

        for (let i = start; i <= end; i++) {
            this.SelectedIds.add(this.FilteredDashboards[i].ID);
        }
    }
}
