/**
 * Tree Dropdown Component for @memberjunction/ng-trees
 *
 * A searchable dropdown with tree selection. Features:
 * - Smart positioning (auto-flips above/below based on available space)
 * - Portal rendering to avoid clipping
 * - Type-ahead search with highlighting
 * - Keyboard navigation
 * - Single and multi-select modes
 */

import {
    Component,
    Input,
    Output,
    EventEmitter,
    ChangeDetectorRef,
    OnInit,
    OnDestroy,
    ViewChild,
    ElementRef,  // Still needed for ViewChild type references
    Renderer2,
    AfterViewInit
} from '@angular/core';
import {
    TreeNode,
    TreeBranchConfig,
    TreeLeafConfig,
    TreeSelectionMode,
    TreeSelectableTypes,
    TreeStyleConfig,
    TreeSearchConfig,
    TreeDropdownConfig
} from '../models/tree-types';
import {
    BeforeNodeSelectEventArgs,
    AfterNodeSelectEventArgs,
    BeforeSearchEventArgs,
    AfterSearchEventArgs,
    BeforeDropdownOpenEventArgs,
    AfterDropdownOpenEventArgs,
    BeforeDropdownCloseEventArgs,
    AfterDropdownCloseEventArgs,
    BeforeDataLoadEventArgs,
    AfterDataLoadEventArgs
} from '../events/tree-events';
import { TreeComponent } from '../tree/tree.component';
import { Subject } from 'rxjs';
import { debounceTime, takeUntil } from 'rxjs/operators';

/**
 * Dropdown position calculation result
 */
interface DropdownPosition {
    top: number;
    left: number;
    width: number;
    maxHeight: number;
    renderAbove: boolean;
}

@Component({
    selector: 'mj-tree-dropdown',
    templateUrl: './tree-dropdown.component.html',
    styleUrls: ['./tree-dropdown.component.css']
})
export class TreeDropdownComponent implements OnInit, OnDestroy, AfterViewInit {
    // ========================================
    // Tree Configuration (passed to inner tree)
    // ========================================

    /** Branch (category) entity configuration - REQUIRED */
    @Input() BranchConfig!: TreeBranchConfig;

    /** Optional leaf entity configuration */
    @Input() LeafConfig?: TreeLeafConfig;

    /** Selection mode: 'single' or 'multiple' */
    @Input() SelectionMode: TreeSelectionMode = 'single';

    /** What types can be selected: 'branch', 'leaf', or 'both' */
    @Input() SelectableTypes: TreeSelectableTypes = 'both';

    // ========================================
    // Value Inputs
    // ========================================

    /** Current selected value (ID for single, IDs for multiple) */
    private _value: string | string[] | null = null;

    @Input()
    set Value(val: string | string[] | null) {
        if (val !== this._value) {
            this._value = val;
            this.syncValueToSelection();
        }
    }
    get Value(): string | string[] | null {
        return this._value;
    }

    // ========================================
    // Dropdown-specific Inputs
    // ========================================

    /** Placeholder text when nothing selected */
    @Input() Placeholder: string = 'Select...';

    /** Enable search filtering */
    @Input() EnableSearch: boolean = true;

    /** Search configuration */
    @Input() SearchConfig: TreeSearchConfig = {};

    /** Dropdown configuration */
    @Input() DropdownConfig: TreeDropdownConfig = {};

    /** Style configuration */
    @Input() StyleConfig: TreeStyleConfig = {};

    /** Show clear button */
    @Input() Clearable: boolean = true;

    /** Disabled state */
    @Input() Disabled: boolean = false;

    /** Show node icons in display */
    @Input() ShowIconInDisplay: boolean = true;

    /** Auto-load data on init */
    @Input() AutoLoad: boolean = true;

    /** Show loading in trigger */
    @Input() ShowLoadingInTrigger: boolean = true;

    // ========================================
    // Event Outputs
    // ========================================

    /** Emitted when value changes */
    @Output() ValueChange = new EventEmitter<string | string[] | null>();

    /** Emitted with full node(s) when selection changes */
    @Output() SelectionChange = new EventEmitter<TreeNode | TreeNode[] | null>();

    // Bubble up tree events
    @Output() BeforeNodeSelect = new EventEmitter<BeforeNodeSelectEventArgs>();
    @Output() AfterNodeSelect = new EventEmitter<AfterNodeSelectEventArgs>();
    @Output() BeforeSearch = new EventEmitter<BeforeSearchEventArgs>();
    @Output() AfterSearch = new EventEmitter<AfterSearchEventArgs>();
    @Output() BeforeDropdownOpen = new EventEmitter<BeforeDropdownOpenEventArgs>();
    @Output() AfterDropdownOpen = new EventEmitter<AfterDropdownOpenEventArgs>();
    @Output() BeforeDropdownClose = new EventEmitter<BeforeDropdownCloseEventArgs>();
    @Output() AfterDropdownClose = new EventEmitter<AfterDropdownCloseEventArgs>();
    @Output() BeforeDataLoad = new EventEmitter<BeforeDataLoadEventArgs>();
    @Output() AfterDataLoad = new EventEmitter<AfterDataLoadEventArgs>();

    // ========================================
    // ViewChild References
    // ========================================

    @ViewChild('triggerElement') triggerElement!: ElementRef<HTMLElement>;
    @ViewChild('searchInput') searchInput!: ElementRef<HTMLInputElement>;
    @ViewChild('dropdownPanel') dropdownPanel!: ElementRef<HTMLElement>;
    @ViewChild('treeComponent') treeComponent!: TreeComponent;

    // ========================================
    // State
    // ========================================

    /** Is dropdown open */
    public IsOpen: boolean = false;

    /** Dropdown position */
    public Position: DropdownPosition | null = null;

    /** Search text */
    public SearchText: string = '';

    /** Selected nodes (for display) */
    public SelectedNodes: TreeNode[] = [];

    /** Is tree loading */
    public IsLoading: boolean = false;

    /** Has data loaded */
    public IsLoaded: boolean = false;

    /** Dropdown portal element */
    private dropdownPortal: HTMLElement | null = null;

    /** Search debounce subject */
    private searchSubject = new Subject<string>();

    /** Destroy subject */
    private destroy$ = new Subject<void>();

    /** Click outside listener */
    private clickOutsideListener: (() => void) | null = null;

    /** Scroll listener */
    private scrollListener: (() => void) | null = null;

    /** Resize listener */
    private resizeListener: (() => void) | null = null;

    // ========================================
    // Constructor
    // ========================================

    constructor(
        private readonly cdr: ChangeDetectorRef,
        private readonly renderer: Renderer2
    ) {}

    // ========================================
    // Lifecycle
    // ========================================

    ngOnInit(): void {
        // Setup search debounce
        const debounceMs = this.SearchConfig.DebounceMs ?? 200;
        this.searchSubject.pipe(
            debounceTime(debounceMs),
            takeUntil(this.destroy$)
        ).subscribe(text => {
            this.performSearch(text);
        });
    }

    ngAfterViewInit(): void {
        // Create portal element
        this.createDropdownPortal();
    }

    // Note: Value changes are handled by the getter/setter pattern
    // No ngOnChanges needed for that property

    ngOnDestroy(): void {
        this.destroy$.next();
        this.destroy$.complete();
        this.removeDropdownPortal();
        this.removeEventListeners();
    }

    // ========================================
    // Public Methods
    // ========================================

    /**
     * Open the dropdown
     */
    public Open(): void {
        if (this.Disabled || this.IsOpen) {
            return;
        }

        // Fire before event
        const beforeEvent = new BeforeDropdownOpenEventArgs(this);
        this.BeforeDropdownOpen.emit(beforeEvent);

        if (beforeEvent.Cancel) {
            return;
        }

        this.IsOpen = true;
        this.calculatePosition();
        this.attachEventListeners();

        // Focus search input after opening
        setTimeout(() => {
            if (this.EnableSearch && this.searchInput) {
                this.searchInput.nativeElement.focus();
            }
        }, 50);

        // Fire after event
        const afterEvent = new AfterDropdownOpenEventArgs(
            this,
            this.Position?.renderAbove ? 'above' : 'below'
        );
        this.AfterDropdownOpen.emit(afterEvent);

        this.cdr.detectChanges();
    }

    /**
     * Close the dropdown
     */
    public Close(reason: 'selection' | 'escape' | 'outsideClick' | 'programmatic' = 'programmatic'): void {
        if (!this.IsOpen) {
            return;
        }

        // Fire before event
        const beforeEvent = new BeforeDropdownCloseEventArgs(this, reason);
        this.BeforeDropdownClose.emit(beforeEvent);

        if (beforeEvent.Cancel) {
            return;
        }

        this.IsOpen = false;
        this.SearchText = '';
        this.clearSearch();
        this.removeEventListeners();

        // Fire after event
        const afterEvent = new AfterDropdownCloseEventArgs(this, reason);
        this.AfterDropdownClose.emit(afterEvent);

        this.cdr.detectChanges();
    }

    /**
     * Toggle dropdown
     */
    public Toggle(): void {
        if (this.IsOpen) {
            this.Close('programmatic');
        } else {
            this.Open();
        }
    }

    /**
     * Clear selection
     */
    public Clear(event?: MouseEvent): void {
        if (event) {
            event.stopPropagation();
        }

        this.SelectedNodes = [];
        this._value = this.SelectionMode === 'multiple' ? [] : null;

        if (this.treeComponent) {
            this.treeComponent.ClearSelection();
        }

        this.ValueChange.emit(this._value);
        this.SelectionChange.emit(null);
        this.cdr.detectChanges();
    }

    /**
     * Refresh tree data
     */
    public async Refresh(): Promise<void> {
        if (this.treeComponent) {
            await this.treeComponent.Refresh();
        }
    }

    // ========================================
    // Template Event Handlers
    // ========================================

    /**
     * Handle trigger click
     */
    public onTriggerClick(): void {
        if (!this.Disabled) {
            this.Toggle();
        }
    }

    /**
     * Handle trigger keydown
     */
    public onTriggerKeyDown(event: KeyboardEvent): void {
        if (this.Disabled) {
            return;
        }

        switch (event.key) {
            case 'Enter':
            case ' ':
            case 'ArrowDown':
                event.preventDefault();
                this.Open();
                break;
            case 'Escape':
                if (this.IsOpen) {
                    event.preventDefault();
                    this.Close('escape');
                }
                break;
        }
    }

    /**
     * Handle search input
     */
    public onSearchInput(event: Event): void {
        const value = (event.target as HTMLInputElement).value;
        this.SearchText = value;
        this.searchSubject.next(value);
    }

    /**
     * Handle search keydown
     */
    public onSearchKeyDown(event: KeyboardEvent): void {
        switch (event.key) {
            case 'Escape':
                event.preventDefault();
                event.stopPropagation();
                this.Close('escape');
                break;
            case 'ArrowDown':
                event.preventDefault();
                // Focus first tree node
                if (this.treeComponent) {
                    const visibleNodes = this.getVisibleNodesInOrder(this.treeComponent.Nodes);
                    if (visibleNodes.length > 0) {
                        this.treeComponent.FocusedNode = visibleNodes[0];
                        this.cdr.detectChanges();
                    }
                }
                break;
        }
    }

    /**
     * Handle clear search
     */
    public onClearSearch(): void {
        this.SearchText = '';
        this.clearSearch();
        if (this.searchInput) {
            this.searchInput.nativeElement.focus();
        }
    }

    /**
     * Handle tree selection change
     */
    public onTreeSelectionChange(nodes: TreeNode[]): void {
        this.SelectedNodes = nodes;

        // Update value
        if (this.SelectionMode === 'single') {
            this._value = nodes.length > 0 ? nodes[0].ID : null;
            this.ValueChange.emit(this._value);
            this.SelectionChange.emit(nodes.length > 0 ? nodes[0] : null);

            // Close on selection in single mode (unless disabled)
            if (this.DropdownConfig.CloseOnSelect !== false) {
                this.Close('selection');
            }
        } else {
            this._value = nodes.map(n => n.ID);
            this.ValueChange.emit(this._value);
            this.SelectionChange.emit(nodes.length > 0 ? nodes : null);
        }

        this.cdr.detectChanges();
    }

    /**
     * Handle tree data load events
     */
    public onTreeBeforeDataLoad(event: BeforeDataLoadEventArgs): void {
        this.IsLoading = true;
        this.BeforeDataLoad.emit(event);
        this.cdr.detectChanges();
    }

    public onTreeAfterDataLoad(event: AfterDataLoadEventArgs): void {
        this.IsLoading = false;
        this.IsLoaded = true;

        // Sync selection after load - defer to next microtask to ensure ViewChild is resolved
        Promise.resolve().then(() => {
            this.syncValueToSelection();
            this.cdr.detectChanges();
        });

        this.AfterDataLoad.emit(event);
        this.cdr.detectChanges();
    }

    /**
     * Bubble tree events
     */
    public onTreeBeforeNodeSelect(event: BeforeNodeSelectEventArgs): void {
        this.BeforeNodeSelect.emit(event);
    }

    public onTreeAfterNodeSelect(event: AfterNodeSelectEventArgs): void {
        this.AfterNodeSelect.emit(event);
    }

    // ========================================
    // Private Methods
    // ========================================

    /**
     * Create dropdown portal element (attached to body)
     */
    private createDropdownPortal(): void {
        this.dropdownPortal = this.renderer.createElement('div');
        this.renderer.addClass(this.dropdownPortal, 'mj-tree-dropdown-portal');
        this.renderer.setStyle(this.dropdownPortal, 'position', 'fixed');
        this.renderer.setStyle(this.dropdownPortal, 'z-index', '10000');
        this.renderer.setStyle(this.dropdownPortal, 'display', 'none');
        this.renderer.appendChild(document.body, this.dropdownPortal);
    }

    /**
     * Remove dropdown portal
     */
    private removeDropdownPortal(): void {
        if (this.dropdownPortal && this.dropdownPortal.parentNode) {
            this.dropdownPortal.parentNode.removeChild(this.dropdownPortal);
            this.dropdownPortal = null;
        }
    }

    /**
     * Calculate dropdown position
     */
    private calculatePosition(): void {
        if (!this.triggerElement) {
            return;
        }

        const triggerRect = this.triggerElement.nativeElement.getBoundingClientRect();
        const viewportHeight = window.innerHeight;
        const viewportWidth = window.innerWidth;

        // Parse max height from config
        const maxHeightConfig = this.DropdownConfig.MaxHeight || '300px';
        const maxHeightPx = parseInt(maxHeightConfig, 10) || 300;

        // Calculate available space
        const spaceBelow = viewportHeight - triggerRect.bottom - 8; // 8px margin
        const spaceAbove = triggerRect.top - 8;

        // Determine if we should render above or below
        let renderAbove = false;
        let maxHeight = maxHeightPx;

        if (this.DropdownConfig.Position === 'above') {
            renderAbove = true;
            maxHeight = Math.min(maxHeightPx, spaceAbove);
        } else if (this.DropdownConfig.Position === 'below') {
            renderAbove = false;
            maxHeight = Math.min(maxHeightPx, spaceBelow);
        } else {
            // Auto position
            if (spaceBelow < maxHeightPx && spaceAbove > spaceBelow) {
                renderAbove = true;
                maxHeight = Math.min(maxHeightPx, spaceAbove);
            } else {
                renderAbove = false;
                maxHeight = Math.min(maxHeightPx, spaceBelow);
            }
        }

        // Calculate width
        const minWidth = this.DropdownConfig.MinWidth
            ? parseInt(this.DropdownConfig.MinWidth, 10)
            : triggerRect.width;
        const width = Math.max(minWidth, triggerRect.width);

        // Ensure dropdown doesn't go off screen horizontally
        let left = triggerRect.left;
        if (left + width > viewportWidth - 8) {
            left = viewportWidth - width - 8;
        }
        if (left < 8) {
            left = 8;
        }

        // Calculate top position
        let top: number;
        if (renderAbove) {
            top = triggerRect.top - maxHeight - 4;
        } else {
            top = triggerRect.bottom + 4;
        }

        this.Position = {
            top,
            left,
            width,
            maxHeight,
            renderAbove
        };
    }

    /**
     * Attach event listeners for click outside, scroll, resize
     */
    private attachEventListeners(): void {
        // Click outside - defer with a small timeout to:
        // 1. Allow the opening click event to complete
        // 2. Ensure the dropdown panel DOM element is fully rendered
        // 3. Allow Angular change detection to complete
        if (this.DropdownConfig.CloseOnOutsideClick !== false) {
            setTimeout(() => {
                // Only attach if still open (could have been closed in the meantime)
                if (!this.IsOpen) {
                    return;
                }
                this.clickOutsideListener = this.renderer.listen('document', 'click', (event: MouseEvent) => {
                    // Double check we're still open
                    if (!this.IsOpen) {
                        return;
                    }
                    const target = event.target as HTMLElement;
                    const isInsideTrigger = this.triggerElement?.nativeElement?.contains(target);
                    // Check if click is inside the dropdown panel (rendered inline, not in portal)
                    const isInsideDropdown = this.dropdownPanel?.nativeElement?.contains(target);

                    if (!isInsideTrigger && !isInsideDropdown) {
                        this.Close('outsideClick');
                    }
                });
            }, 100); // 100ms delay to ensure DOM is stable
        }

        // Escape key
        if (this.DropdownConfig.CloseOnEscape !== false) {
            document.addEventListener('keydown', this.handleEscapeKey);
        }

        // Scroll - reposition dropdown
        this.scrollListener = this.renderer.listen('window', 'scroll', () => {
            if (this.IsOpen) {
                this.calculatePosition();
                this.updateDropdownPortalPosition();
            }
        });

        // Resize - reposition dropdown
        this.resizeListener = this.renderer.listen('window', 'resize', () => {
            if (this.IsOpen) {
                this.calculatePosition();
                this.updateDropdownPortalPosition();
            }
        });
    }

    /**
     * Remove event listeners
     */
    private removeEventListeners(): void {
        if (this.clickOutsideListener) {
            this.clickOutsideListener();
            this.clickOutsideListener = null;
        }

        document.removeEventListener('keydown', this.handleEscapeKey);

        if (this.scrollListener) {
            this.scrollListener();
            this.scrollListener = null;
        }

        if (this.resizeListener) {
            this.resizeListener();
            this.resizeListener = null;
        }
    }

    /**
     * Handle escape key
     */
    private handleEscapeKey = (event: KeyboardEvent): void => {
        if (event.key === 'Escape' && this.IsOpen) {
            this.Close('escape');
        }
    };

    /**
     * Update dropdown portal position
     */
    private updateDropdownPortalPosition(): void {
        if (!this.dropdownPortal || !this.Position) {
            return;
        }

        this.renderer.setStyle(this.dropdownPortal, 'top', `${this.Position.top}px`);
        this.renderer.setStyle(this.dropdownPortal, 'left', `${this.Position.left}px`);
        this.renderer.setStyle(this.dropdownPortal, 'width', `${this.Position.width}px`);
    }

    /**
     * Perform search on tree
     */
    private performSearch(text: string): void {
        // Fire before event
        const beforeEvent = new BeforeSearchEventArgs(this, text);
        this.BeforeSearch.emit(beforeEvent);

        if (beforeEvent.Cancel) {
            return;
        }

        const searchText = beforeEvent.ModifiedSearchText ?? text;

        if (!this.treeComponent) {
            return;
        }

        const matchedNodes = this.treeComponent.FilterNodes(
            searchText,
            {
                caseSensitive: this.SearchConfig.CaseSensitive,
                searchBranches: this.SearchConfig.SearchBranches ?? true,
                searchLeaves: this.SearchConfig.SearchLeaves ?? true,
                searchDescription: this.SearchConfig.SearchDescription
            }
        );

        // Auto-expand to show matches
        if (this.SearchConfig.AutoExpandMatches !== false && searchText.trim()) {
            for (const node of matchedNodes) {
                this.treeComponent.ExpandToNode(node.ID);
            }
        }

        // Fire after event
        const afterEvent = new AfterSearchEventArgs(this, searchText, matchedNodes);
        this.AfterSearch.emit(afterEvent);

        this.cdr.detectChanges();
    }

    /**
     * Clear search filter
     */
    private clearSearch(): void {
        if (this.treeComponent) {
            this.treeComponent.FilterNodes('', {});
            this.cdr.detectChanges();
        }
    }

    /**
     * Get all visible nodes in tree order (for keyboard navigation)
     */
    private getVisibleNodesInOrder(nodes: TreeNode[]): TreeNode[] {
        const result: TreeNode[] = [];
        this.collectVisibleNodesRecursive(nodes, result);
        return result;
    }

    private collectVisibleNodesRecursive(nodes: TreeNode[], result: TreeNode[]): void {
        for (const node of nodes) {
            if (node.Visible) {
                result.push(node);
                if (node.Expanded && node.Type === 'branch') {
                    this.collectVisibleNodesRecursive(node.Children, result);
                }
            }
        }
    }

    /**
     * Sync value to tree selection
     */
    private syncValueToSelection(): void {
        if (!this.treeComponent || !this.IsLoaded) {
            return;
        }

        const ids: string[] = Array.isArray(this._value)
            ? this._value
            : this._value ? [this._value] : [];

        this.treeComponent.SelectNodes(ids);

        // Use try-catch as defensive measure since tree component may not be fully ready
        try {
            this.SelectedNodes = this.treeComponent.GetSelectedNodes() || [];
        } catch {
            this.SelectedNodes = [];
        }

        this.cdr.detectChanges();
    }

    // ========================================
    // Template Helpers
    // ========================================

    /**
     * Get display text for selected value(s)
     */
    public getDisplayText(): string {
        if (this.SelectedNodes.length === 0) {
            return '';
        }

        if (this.SelectionMode === 'single') {
            return this.SelectedNodes[0].Label;
        }

        // Multiple selection
        if (this.SelectedNodes.length === 1) {
            return this.SelectedNodes[0].Label;
        }

        return `${this.SelectedNodes.length} items selected`;
    }

    /**
     * Get display icon for single selection
     */
    public getDisplayIcon(): string | null {
        if (!this.ShowIconInDisplay || this.SelectedNodes.length !== 1) {
            return null;
        }
        return this.SelectedNodes[0].Icon;
    }

    /**
     * Get display color for single selection
     */
    public getDisplayColor(): string | null {
        if (this.SelectedNodes.length !== 1) {
            return null;
        }
        return this.SelectedNodes[0].Color || null;
    }

    /**
     * Check if has selection
     */
    public hasSelection(): boolean {
        return this.SelectedNodes.length > 0;
    }

    /**
     * Get dropdown panel styles
     */
    public getDropdownStyles(): Record<string, string> {
        if (!this.Position) {
            return {};
        }

        return {
            top: `${this.Position.top}px`,
            left: `${this.Position.left}px`,
            width: `${this.Position.width}px`,
            maxHeight: `${this.Position.maxHeight}px`
        };
    }

    /**
     * Get trigger classes
     */
    public getTriggerClasses(): Record<string, boolean> {
        return {
            'tree-dropdown-trigger': true,
            'tree-dropdown-trigger--open': this.IsOpen,
            'tree-dropdown-trigger--disabled': this.Disabled,
            'tree-dropdown-trigger--has-value': this.hasSelection(),
            'tree-dropdown-trigger--loading': this.IsLoading && this.ShowLoadingInTrigger
        };
    }

    /**
     * Get selected IDs as a string array for passing to tree component
     */
    public getSelectedIDsArray(): string[] {
        if (!this._value) {
            return [];
        }
        return Array.isArray(this._value) ? this._value : [this._value];
    }
}
