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
import { DashboardEntity, DashboardCategoryEntity } from '@memberjunction/core-entities';

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
    Dashboard: DashboardEntity;
    OpenInNewTab: boolean;
}

/**
 * Event emitted when a dashboard is selected for editing
 */
export interface DashboardEditEvent {
    Dashboard: DashboardEntity;
}

/**
 * Event emitted when dashboards are requested for deletion
 */
export interface DashboardDeleteEvent {
    Dashboards: DashboardEntity[];
}

/**
 * Event emitted when dashboards are requested to be moved to a folder
 */
export interface DashboardMoveEvent {
    Dashboards: DashboardEntity[];
    TargetCategoryId: string | null;
}

/**
 * Event emitted when the category filter changes
 */
export interface CategoryChangeEvent {
    CategoryId: string | null;
    Category: DashboardCategoryEntity | null;
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
 * Event emitted when view preference should be persisted
 */
export interface ViewPreferenceChangeEvent {
    ViewMode: DashboardBrowserViewMode;
}

/**
 * Generic dashboard browser component.
 * Displays dashboards in card or list view with multi-select, filtering, and bulk actions.
 *
 * This component is GENERIC and has no routing dependencies.
 * All navigation and persistence events are bubbled up for the parent to handle.
 */
@Component({
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
    private _dashboards: DashboardEntity[] = [];

    @Input()
    set Dashboards(value: DashboardEntity[]) {
        this._dashboards = value || [];
        this.applyFilters();
    }
    get Dashboards(): DashboardEntity[] {
        return this._dashboards;
    }

    /** All categories for filtering */
    private _categories: DashboardCategoryEntity[] = [];

    @Input()
    set Categories(value: DashboardCategoryEntity[]) {
        this._categories = value || [];
    }
    get Categories(): DashboardCategoryEntity[] {
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

    /** Whether to allow multi-select */
    @Input() AllowMultiSelect = true;

    /** Whether to allow drag and drop */
    @Input() AllowDragDrop = true;

    /** Title to display in the header */
    @Input() Title = 'Dashboards';

    /** Icon class for the header */
    @Input() IconClass = 'fa-solid fa-gauge-high';

    // ========================================
    // Outputs
    // ========================================

    /** Emitted when a dashboard is opened for viewing */
    @Output() DashboardOpen = new EventEmitter<DashboardOpenEvent>();

    /** Emitted when a dashboard is opened for editing */
    @Output() DashboardEdit = new EventEmitter<DashboardEditEvent>();

    /** Emitted when dashboards are requested for deletion */
    @Output() DashboardDelete = new EventEmitter<DashboardDeleteEvent>();

    /** Emitted when dashboards are requested to move to a folder */
    @Output() DashboardMove = new EventEmitter<DashboardMoveEvent>();

    /** Emitted when a new dashboard should be created */
    @Output() DashboardCreate = new EventEmitter<DashboardCreateEvent>();

    /** Emitted when the category filter changes */
    @Output() CategoryChange = new EventEmitter<CategoryChangeEvent>();

    /** Emitted when view mode changes (for persistence) */
    @Output() ViewModeChange = new EventEmitter<ViewModeChangeEvent>();

    /** Emitted when view preference should be persisted */
    @Output() ViewPreferenceChange = new EventEmitter<ViewPreferenceChangeEvent>();

    // ========================================
    // State
    // ========================================

    /** Filtered dashboards based on search and category */
    public FilteredDashboards: DashboardEntity[] = [];

    /** Current search text */
    public SearchText = '';

    /** Set of selected dashboard IDs */
    public SelectedIds = new Set<string>();

    /** Last clicked dashboard ID (for shift-click range selection) */
    private lastClickedId: string | null = null;

    /** Whether delete confirmation dialog is visible */
    public ShowDeleteConfirm = false;

    /** Whether move-to-folder dialog is visible */
    public ShowMoveDialog = false;

    /** Dashboards pending deletion (for confirm dialog) */
    public DashboardsPendingDelete: DashboardEntity[] = [];

    /** Currently dragging dashboard ID */
    public DraggingId: string | null = null;

    /** Drop target category ID */
    public DropTargetCategoryId: string | null = null;

    private readonly destroy$ = new Subject<void>();

    // ========================================
    // Constructor
    // ========================================

    constructor(private cdr: ChangeDetectorRef) {}

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
     * Handle category filter change
     */
    public OnCategoryChange(categoryId: string | null): void {
        this._selectedCategoryId = categoryId;
        const category = categoryId
            ? this.Categories.find(c => c.ID === categoryId) || null
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

    // ========================================
    // Public Methods - Selection
    // ========================================

    /**
     * Handle dashboard click with multi-select support
     */
    public OnDashboardClick(dashboard: DashboardEntity, event: MouseEvent): void {
        if (!this.AllowMultiSelect) {
            // Single select mode - just open the dashboard
            this.DashboardOpen.emit({ Dashboard: dashboard, OpenInNewTab: event.ctrlKey || event.metaKey });
            return;
        }

        if (event.shiftKey && this.lastClickedId) {
            // Shift-click: range selection
            this.selectRange(this.lastClickedId, dashboard.ID);
        } else if (event.ctrlKey || event.metaKey) {
            // Ctrl/Cmd-click: toggle selection
            this.ToggleSelection(dashboard.ID);
        } else {
            // Normal click: if not selected, open; if selected with others, open
            if (this.SelectedIds.size <= 1) {
                this.SelectedIds.clear();
                this.DashboardOpen.emit({ Dashboard: dashboard, OpenInNewTab: false });
            } else if (this.SelectedIds.has(dashboard.ID)) {
                // Clicking on one of multiple selected items - open just this one
                this.SelectedIds.clear();
                this.DashboardOpen.emit({ Dashboard: dashboard, OpenInNewTab: false });
            } else {
                // Clicking on unselected item - clear selection and open
                this.SelectedIds.clear();
                this.DashboardOpen.emit({ Dashboard: dashboard, OpenInNewTab: false });
            }
        }

        this.lastClickedId = dashboard.ID;
        this.cdr.markForCheck();
    }

    /**
     * Handle double-click to edit
     */
    public OnDashboardDoubleClick(dashboard: DashboardEntity, event: MouseEvent): void {
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
     * Get count of selected dashboards
     */
    public get SelectedCount(): number {
        return this.SelectedIds.size;
    }

    /**
     * Get selected dashboards
     */
    public GetSelectedDashboards(): DashboardEntity[] {
        return this.Dashboards.filter(d => this.SelectedIds.has(d.ID));
    }

    // ========================================
    // Public Methods - Actions
    // ========================================

    /**
     * Request to create a new dashboard
     */
    public OnCreateDashboard(): void {
        this.DashboardCreate.emit({ CategoryId: this.SelectedCategoryId });
    }

    /**
     * Open edit dialog for single dashboard via context menu
     */
    public OnEditDashboard(dashboard: DashboardEntity, event: Event): void {
        event.stopPropagation();
        this.DashboardEdit.emit({ Dashboard: dashboard });
    }

    /**
     * Request to delete a single dashboard
     */
    public OnDeleteDashboard(dashboard: DashboardEntity, event: Event): void {
        event.stopPropagation();
        this.DashboardsPendingDelete = [dashboard];
        this.ShowDeleteConfirm = true;
        this.cdr.markForCheck();
    }

    /**
     * Request to delete selected dashboards
     */
    public OnDeleteSelected(): void {
        if (this.SelectedIds.size === 0) return;
        this.DashboardsPendingDelete = this.GetSelectedDashboards();
        this.ShowDeleteConfirm = true;
        this.cdr.markForCheck();
    }

    /**
     * Confirm deletion
     */
    public ConfirmDelete(): void {
        if (this.DashboardsPendingDelete.length > 0) {
            this.DashboardDelete.emit({ Dashboards: this.DashboardsPendingDelete });
            // Clear selection for deleted items
            for (const d of this.DashboardsPendingDelete) {
                this.SelectedIds.delete(d.ID);
            }
        }
        this.CloseDeleteConfirm();
    }

    /**
     * Cancel deletion
     */
    public CloseDeleteConfirm(): void {
        this.ShowDeleteConfirm = false;
        this.DashboardsPendingDelete = [];
        this.cdr.markForCheck();
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
    }

    /**
     * Cancel move
     */
    public CloseMoveDialog(): void {
        this.ShowMoveDialog = false;
        this.cdr.markForCheck();
    }

    // ========================================
    // Public Methods - Drag and Drop
    // ========================================

    /**
     * Handle drag start
     */
    public OnDragStart(dashboard: DashboardEntity, event: DragEvent): void {
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

        this.cdr.markForCheck();
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
                    const dashboards = this.Dashboards.filter(d => dragData.ids.includes(d.ID));
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
        const category = this.Categories.find(c => c.ID === categoryId);
        return category?.Name || 'Unknown';
    }

    /**
     * Format date for display
     */
    public FormatDate(date: Date): string {
        if (!date) return '';
        const d = new Date(date);
        const now = new Date();
        const diffMs = now.getTime() - d.getTime();
        const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));

        if (diffDays === 0) {
            return 'Today';
        } else if (diffDays === 1) {
            return 'Yesterday';
        } else if (diffDays < 7) {
            return `${diffDays} days ago`;
        } else {
            return d.toLocaleDateString();
        }
    }

    /**
     * Track by function for ngFor
     */
    public TrackByDashboard(_index: number, dashboard: DashboardEntity): string {
        return dashboard.ID;
    }

    /**
     * Track by function for categories
     */
    public TrackByCategory(_index: number, category: DashboardCategoryEntity): string {
        return category.ID;
    }

    // ========================================
    // Private Methods
    // ========================================

    private applyFilters(): void {
        let filtered = [...this._dashboards];

        // Filter by search text
        if (this.SearchText.trim()) {
            const search = this.SearchText.toLowerCase();
            filtered = filtered.filter(d =>
                d.Name.toLowerCase().includes(search) ||
                (d.Description || '').toLowerCase().includes(search)
            );
        }

        // Filter by category
        if (this._selectedCategoryId) {
            filtered = filtered.filter(d => d.CategoryID === this._selectedCategoryId);
        }

        this.FilteredDashboards = filtered;
        this.cdr.markForCheck();
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
        const fromIndex = this.FilteredDashboards.findIndex(d => d.ID === fromId);
        const toIndex = this.FilteredDashboards.findIndex(d => d.ID === toId);

        if (fromIndex === -1 || toIndex === -1) return;

        const start = Math.min(fromIndex, toIndex);
        const end = Math.max(fromIndex, toIndex);

        for (let i = start; i <= end; i++) {
            this.SelectedIds.add(this.FilteredDashboards[i].ID);
        }
    }
}

/**
 * Tree-shaking prevention function
 */
export function LoadDashboardBrowser() {
    // Prevents tree-shaking of the component
}
