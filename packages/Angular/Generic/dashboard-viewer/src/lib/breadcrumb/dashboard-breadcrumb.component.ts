import {
    Component,
    Input,
    Output,
    EventEmitter,
    ChangeDetectionStrategy,
    ChangeDetectorRef
} from '@angular/core';
import { MJDashboardCategoryEntity, MJDashboardEntity } from '@memberjunction/core-entities';

/**
 * Event emitted when a breadcrumb item is clicked for navigation
 */
export interface BreadcrumbNavigateEvent {
    CategoryId: string | null;
    Category: MJDashboardCategoryEntity | null;
}

/**
 * Event emitted when a dashboard is dropped on a breadcrumb item
 */
export interface BreadcrumbDropEvent {
    TargetCategoryId: string | null;
    DashboardIds: string[];
}

/**
 * Reusable breadcrumb navigation component for dashboards.
 * Shows hierarchical path from root to current location.
 * Supports drag-and-drop of dashboards onto breadcrumb items.
 */
@Component({
  standalone: false,
    selector: 'mj-dashboard-breadcrumb',
    templateUrl: './dashboard-breadcrumb.component.html',
    styleUrls: ['./dashboard-breadcrumb.component.css'],
    changeDetection: ChangeDetectionStrategy.OnPush
})
export class DashboardBreadcrumbComponent {
    // ========================================
    // Inputs
    // ========================================

    /** All categories for building breadcrumb path */
    private _categories: MJDashboardCategoryEntity[] = [];

    @Input()
    set Categories(value: MJDashboardCategoryEntity[]) {
        this._categories = value || [];
        // Rebuild breadcrumbs when categories change (they may load after CurrentCategoryId is set)
        this.updateBreadcrumbs();
    }
    get Categories(): MJDashboardCategoryEntity[] {
        return this._categories;
    }

    /** Current category ID (null = root) */
    private _currentCategoryId: string | null = null;

    @Input()
    set CurrentCategoryId(value: string | null) {
        if (value !== this._currentCategoryId) {
            this._currentCategoryId = value;
            this.updateBreadcrumbs();
        }
    }
    get CurrentCategoryId(): string | null {
        return this._currentCategoryId;
    }

    /** Current dashboard (when viewing a specific dashboard) */
    @Input() CurrentDashboard: MJDashboardEntity | null = null;

    /** Icon class for the root breadcrumb item */
    @Input() RootIcon = 'fa-solid fa-gauge-high';

    /** Label for the root breadcrumb item */
    @Input() RootLabel = 'Dashboards';

    /** Whether to show the current dashboard name at the end */
    @Input() ShowDashboardName = false;

    /** Whether to allow drag-drop onto breadcrumb items */
    @Input() AllowDragDrop = true;

    /** Whether breadcrumb is visible (e.g., hide during edit mode) */
    @Input() Visible = true;

    /** Size variant: 'normal' or 'large' */
    @Input() Size: 'normal' | 'large' = 'normal';

    // ========================================
    // Outputs
    // ========================================

    /** Emitted when a breadcrumb item is clicked for navigation */
    @Output() Navigate = new EventEmitter<BreadcrumbNavigateEvent>();

    /** Emitted when dashboards are dropped on a breadcrumb item */
    @Output() DashboardDrop = new EventEmitter<BreadcrumbDropEvent>();

    // ========================================
    // State
    // ========================================

    /** Breadcrumb trail from root to current category */
    public Breadcrumbs: MJDashboardCategoryEntity[] = [];

    /** Category ID being hovered during drag */
    public DragOverCategoryId: string | null | undefined = undefined;

    // ========================================
    // Constructor
    // ========================================

    constructor(private cdr: ChangeDetectorRef) {}

    // ========================================
    // Public Methods
    // ========================================

    /**
     * Navigate to a category
     */
    public OnNavigate(categoryId: string | null): void {
        const category = categoryId
            ? this.Categories.find(c => c.ID === categoryId) || null
            : null;
        this.Navigate.emit({ CategoryId: categoryId, Category: category });
    }

    /**
     * Check if we're at the root level
     */
    public get IsAtRoot(): boolean {
        return !this._currentCategoryId;
    }

    /**
     * Get the current category
     */
    public get CurrentCategory(): MJDashboardCategoryEntity | null {
        if (!this._currentCategoryId) return null;
        return this.Categories.find(c => c.ID === this._currentCategoryId) || null;
    }

    // ========================================
    // Drag and Drop
    // ========================================

    public OnDragOver(categoryId: string | null, event: DragEvent): void {
        if (!this.AllowDragDrop) return;
        event.preventDefault();
        event.dataTransfer!.dropEffect = 'move';
        this.DragOverCategoryId = categoryId;
        this.cdr.markForCheck();
    }

    public OnDragLeave(): void {
        this.DragOverCategoryId = undefined;
        this.cdr.markForCheck();
    }

    public OnDrop(categoryId: string | null, event: DragEvent): void {
        if (!this.AllowDragDrop) return;
        event.preventDefault();

        const data = event.dataTransfer?.getData('application/json');
        if (data) {
            try {
                const dragData = JSON.parse(data);
                if (dragData.type === 'dashboards' && dragData.ids?.length > 0) {
                    this.DashboardDrop.emit({
                        TargetCategoryId: categoryId,
                        DashboardIds: dragData.ids
                    });
                }
            } catch {
                // Invalid drag data
            }
        }

        this.DragOverCategoryId = undefined;
        this.cdr.markForCheck();
    }

    // ========================================
    // Track By
    // ========================================

    public TrackByCategory(_index: number, category: MJDashboardCategoryEntity): string {
        return category.ID;
    }

    // ========================================
    // Private Methods
    // ========================================

    private updateBreadcrumbs(): void {
        this.Breadcrumbs = [];

        if (!this._currentCategoryId) {
            this.cdr.markForCheck();
            return;
        }

        // Build the path from current category to root
        const path: MJDashboardCategoryEntity[] = [];
        let currentId: string | null = this._currentCategoryId;

        while (currentId) {
            const category = this.Categories.find(c => c.ID === currentId);
            if (category) {
                path.unshift(category);
                currentId = category.ParentID;
            } else {
                break;
            }
        }

        this.Breadcrumbs = path;
        this.cdr.markForCheck();
    }
}
