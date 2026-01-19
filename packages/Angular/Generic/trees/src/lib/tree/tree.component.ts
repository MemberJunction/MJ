/**
 * Tree Component for @memberjunction/ng-trees
 *
 * A generic, reusable tree component for displaying hierarchical entity data.
 */

import {
    Component,
    Input,
    Output,
    EventEmitter,
    ChangeDetectorRef,
    OnInit,
    OnDestroy,
    ElementRef,
    HostListener
} from '@angular/core';
import { RunView } from '@memberjunction/core';
import {
    TreeNode,
    TreeBranchConfig,
    TreeLeafConfig,
    TreeJunctionConfig,
    TreeSelectionMode,
    TreeSelectableTypes,
    TreeStyleConfig,
    TreeKeyboardConfig,
    createDefaultTreeNode
} from '../models/tree-types';
import {
    BeforeNodeSelectEventArgs,
    AfterNodeSelectEventArgs,
    BeforeNodeDeselectEventArgs,
    AfterNodeDeselectEventArgs,
    BeforeNodeExpandEventArgs,
    AfterNodeExpandEventArgs,
    BeforeNodeCollapseEventArgs,
    AfterNodeCollapseEventArgs,
    BeforeNodeClickEventArgs,
    AfterNodeClickEventArgs,
    BeforeNodeDoubleClickEventArgs,
    AfterNodeDoubleClickEventArgs,
    BeforeDataLoadEventArgs,
    AfterDataLoadEventArgs,
    BeforeKeyboardNavigateEventArgs,
    AfterKeyboardNavigateEventArgs
} from '../events/tree-events';

@Component({
    selector: 'mj-tree',
    templateUrl: './tree.component.html',
    styleUrls: ['./tree.component.css']
})
export class TreeComponent implements OnInit, OnDestroy {
    // ========================================
    // Configuration Inputs with Getter/Setter
    // ========================================

    /** Branch (category) entity configuration - REQUIRED */
    private _branchConfig: TreeBranchConfig | null = null;
    @Input()
    set BranchConfig(value: TreeBranchConfig) {
        const previousValue = this._branchConfig;
        this._branchConfig = value;
        // Only reload if config actually changed and we have a valid config
        if (value && previousValue !== value && this.isInitialized) {
            this.clearCache();
            if (this._autoLoad) {
                this.loadData(false);
            }
        }
    }
    get BranchConfig(): TreeBranchConfig {
        return this._branchConfig!;
    }

    /** Optional leaf entity configuration */
    private _leafConfig?: TreeLeafConfig;
    @Input()
    set LeafConfig(value: TreeLeafConfig | undefined) {
        const previousValue = this._leafConfig;
        this._leafConfig = value;
        // Only reload if config actually changed
        if (previousValue !== value && this._branchConfig && this.isInitialized) {
            this.clearCache();
            if (this._autoLoad) {
                this.loadData(false);
            }
        }
    }
    get LeafConfig(): TreeLeafConfig | undefined {
        return this._leafConfig;
    }

    /** Selection mode: 'single', 'multiple', or 'none' */
    private _selectionMode: TreeSelectionMode = 'single';
    @Input()
    set SelectionMode(value: TreeSelectionMode) {
        this._selectionMode = value;
    }
    get SelectionMode(): TreeSelectionMode {
        return this._selectionMode;
    }

    /** What types can be selected: 'branch', 'leaf', or 'both' */
    private _selectableTypes: TreeSelectableTypes = 'both';
    @Input()
    set SelectableTypes(value: TreeSelectableTypes) {
        this._selectableTypes = value;
    }
    get SelectableTypes(): TreeSelectableTypes {
        return this._selectableTypes;
    }

    /** Initially selected node IDs */
    private _selectedIDs: string[] = [];
    @Input()
    set SelectedIDs(value: string[]) {
        const previousValue = this._selectedIDs;
        this._selectedIDs = value || [];
        // Only sync selection if the IDs actually changed
        if (this.isInitialized && this.IsLoaded && JSON.stringify(previousValue) !== JSON.stringify(value)) {
            this.syncSelectionFromIDs();
        }
    }
    get SelectedIDs(): string[] {
        return this._selectedIDs;
    }

    /** Initially expanded node IDs (null = auto-expand first level) */
    private _expandedIDs: string[] | null = null;
    @Input()
    set ExpandedIDs(value: string[] | null) {
        this._expandedIDs = value;
    }
    get ExpandedIDs(): string[] | null {
        return this._expandedIDs;
    }

    /** Show expand/collapse all buttons */
    private _showExpandCollapseAll: boolean = false;
    @Input()
    set ShowExpandCollapseAll(value: boolean) {
        this._showExpandCollapseAll = value;
    }
    get ShowExpandCollapseAll(): boolean {
        return this._showExpandCollapseAll;
    }

    /** Enable keyboard navigation */
    private _enableKeyboardNavigation: boolean = true;
    @Input()
    set EnableKeyboardNavigation(value: boolean) {
        this._enableKeyboardNavigation = value;
    }
    get EnableKeyboardNavigation(): boolean {
        return this._enableKeyboardNavigation;
    }

    /** Keyboard configuration */
    private _keyboardConfig: TreeKeyboardConfig = {};
    @Input()
    set KeyboardConfig(value: TreeKeyboardConfig) {
        this._keyboardConfig = value || {};
    }
    get KeyboardConfig(): TreeKeyboardConfig {
        return this._keyboardConfig;
    }

    /** CSS style overrides */
    private _styleConfig: TreeStyleConfig = {};
    @Input()
    set StyleConfig(value: TreeStyleConfig) {
        this._styleConfig = value || {};
    }
    get StyleConfig(): TreeStyleConfig {
        return this._styleConfig;
    }

    /** Indent per level in pixels */
    private _indentSize: number = 20;
    @Input()
    set IndentSize(value: number) {
        this._indentSize = value;
    }
    get IndentSize(): number {
        return this._indentSize;
    }

    /** Show loading indicator */
    private _showLoading: boolean = true;
    @Input()
    set ShowLoading(value: boolean) {
        this._showLoading = value;
    }
    get ShowLoading(): boolean {
        return this._showLoading;
    }

    /** Empty state message */
    private _emptyMessage: string = 'No items found';
    @Input()
    set EmptyMessage(value: string) {
        this._emptyMessage = value;
    }
    get EmptyMessage(): string {
        return this._emptyMessage;
    }

    /** Empty state icon */
    private _emptyIcon: string = 'fa-solid fa-folder-open';
    @Input()
    set EmptyIcon(value: string) {
        this._emptyIcon = value;
    }
    get EmptyIcon(): string {
        return this._emptyIcon;
    }

    /** Auto-load data on init */
    private _autoLoad: boolean = true;
    @Input()
    set AutoLoad(value: boolean) {
        this._autoLoad = value;
    }
    get AutoLoad(): boolean {
        return this._autoLoad;
    }

    /** Show node icons */
    private _showIcons: boolean = true;
    @Input()
    set ShowIcons(value: boolean) {
        this._showIcons = value;
    }
    get ShowIcons(): boolean {
        return this._showIcons;
    }

    /** Show node descriptions */
    private _showDescriptions: boolean = false;
    @Input()
    set ShowDescriptions(value: boolean) {
        this._showDescriptions = value;
    }
    get ShowDescriptions(): boolean {
        return this._showDescriptions;
    }

    /** Show node badges */
    private _showBadges: boolean = true;
    @Input()
    set ShowBadges(value: boolean) {
        this._showBadges = value;
    }
    get ShowBadges(): boolean {
        return this._showBadges;
    }

    /** Animate expand/collapse */
    private _animateExpandCollapse: boolean = true;
    @Input()
    set AnimateExpandCollapse(value: boolean) {
        this._animateExpandCollapse = value;
    }
    get AnimateExpandCollapse(): boolean {
        return this._animateExpandCollapse;
    }

    // ========================================
    // Event Outputs
    // ========================================

    @Output() BeforeNodeSelect = new EventEmitter<BeforeNodeSelectEventArgs>();
    @Output() AfterNodeSelect = new EventEmitter<AfterNodeSelectEventArgs>();
    @Output() BeforeNodeDeselect = new EventEmitter<BeforeNodeDeselectEventArgs>();
    @Output() AfterNodeDeselect = new EventEmitter<AfterNodeDeselectEventArgs>();
    @Output() BeforeNodeExpand = new EventEmitter<BeforeNodeExpandEventArgs>();
    @Output() AfterNodeExpand = new EventEmitter<AfterNodeExpandEventArgs>();
    @Output() BeforeNodeCollapse = new EventEmitter<BeforeNodeCollapseEventArgs>();
    @Output() AfterNodeCollapse = new EventEmitter<AfterNodeCollapseEventArgs>();
    @Output() BeforeNodeClick = new EventEmitter<BeforeNodeClickEventArgs>();
    @Output() AfterNodeClick = new EventEmitter<AfterNodeClickEventArgs>();
    @Output() BeforeNodeDoubleClick = new EventEmitter<BeforeNodeDoubleClickEventArgs>();
    @Output() AfterNodeDoubleClick = new EventEmitter<AfterNodeDoubleClickEventArgs>();
    @Output() BeforeDataLoad = new EventEmitter<BeforeDataLoadEventArgs>();
    @Output() AfterDataLoad = new EventEmitter<AfterDataLoadEventArgs>();
    @Output() BeforeKeyboardNavigate = new EventEmitter<BeforeKeyboardNavigateEventArgs>();
    @Output() AfterKeyboardNavigate = new EventEmitter<AfterKeyboardNavigateEventArgs>();

    /** Emitted when selection changes (convenience event with just the selected nodes) */
    @Output() SelectionChange = new EventEmitter<TreeNode[]>();

    // ========================================
    // State
    // ========================================

    /** Root nodes of the tree */
    public Nodes: TreeNode[] = [];

    /** All branch nodes (flat) */
    public AllBranches: TreeNode[] = [];

    /** All leaf nodes (flat) */
    public AllLeaves: TreeNode[] = [];

    /** Currently selected nodes */
    public SelectedNodes: TreeNode[] = [];

    /** Currently focused node (for keyboard navigation) */
    public FocusedNode: TreeNode | null = null;

    /** Loading state */
    public IsLoading: boolean = false;

    /** Error message if load failed */
    public ErrorMessage: string | null = null;

    /** Has data been loaded */
    public IsLoaded: boolean = false;

    /** Current search text (for highlighting) */
    public CurrentSearchText: string = '';

    // ========================================
    // Private State
    // ========================================

    private nodeMap: Map<string, TreeNode> = new Map();
    private isInitialized: boolean = false;
    private isCurrentlyLoading: boolean = false;

    /** Instance-level cache for loaded data */
    private cachedNodes: TreeNode[] | null = null;
    private cachedBranches: TreeNode[] | null = null;
    private cachedLeaves: TreeNode[] | null = null;

    // ========================================
    // Constructor
    // ========================================

    constructor(
        private readonly cdr: ChangeDetectorRef,
        private readonly elementRef: ElementRef
    ) {}

    // ========================================
    // Lifecycle
    // ========================================

    ngOnInit(): void {
        this.isInitialized = true;
        if (this._autoLoad && this._branchConfig) {
            this.loadData(false);
        }
    }

    ngOnDestroy(): void {
        this.clearCache();
    }

    // ========================================
    // Public Methods
    // ========================================

    /**
     * Reload tree data (forces fresh load from database)
     */
    public async Refresh(): Promise<void> {
        this.clearCache();
        await this.loadData(true);
    }

    /**
     * Get currently selected nodes
     */
    public GetSelectedNodes(): TreeNode[] {
        return [...this.SelectedNodes];
    }

    /**
     * Get selected IDs
     */
    public GetSelectedIDs(): string[] {
        return this.SelectedNodes.map(n => n.ID);
    }

    /**
     * Programmatically select node(s)
     * @param emitChange Whether to emit SelectionChange event (default: true).
     *                   Set to false during sync operations to avoid unnecessary events.
     */
    public SelectNodes(ids: string[], emitChange: boolean = true): void {
        const previousSelection = [...this.SelectedNodes];
        const previousIds = previousSelection.map(n => n.ID).sort().join(',');

        if (this._selectionMode === 'single' && ids.length > 0) {
            ids = [ids[0]];
        }

        this.SelectedNodes = [];
        for (const id of ids) {
            const node = this.nodeMap.get(id);
            if (node && this.isNodeSelectable(node)) {
                node.Selected = true;
                this.SelectedNodes.push(node);
            }
        }

        // Deselect previously selected nodes not in new selection
        for (const prev of previousSelection) {
            if (!this.SelectedNodes.includes(prev)) {
                prev.Selected = false;
            }
        }

        // Only emit if selection actually changed
        const newIds = this.SelectedNodes.map(n => n.ID).sort().join(',');
        if (emitChange && previousIds !== newIds) {
            this.SelectionChange.emit([...this.SelectedNodes]);
        }
        this.cdr.detectChanges();
    }

    /**
     * Clear selection
     */
    public ClearSelection(): void {
        for (const node of this.SelectedNodes) {
            node.Selected = false;
        }
        this.SelectedNodes = [];
        this.SelectionChange.emit([]);
        this.cdr.detectChanges();
    }

    /**
     * Expand all nodes
     */
    public ExpandAll(): void {
        this.expandAllRecursive(this.Nodes);
        this.cdr.detectChanges();
    }

    /**
     * Collapse all nodes
     */
    public CollapseAll(): void {
        this.collapseAllRecursive(this.Nodes);
        this.cdr.detectChanges();
    }

    /**
     * Expand to specific node (expands all ancestors)
     */
    public ExpandToNode(id: string): TreeNode | null {
        const target = this.nodeMap.get(id);
        if (!target) {
            return null;
        }

        // Walk up the tree and expand each ancestor
        let current = target;
        while (current.ParentID && this.nodeMap.has(current.ParentID)) {
            const parent = this.nodeMap.get(current.ParentID)!;
            parent.Expanded = true;
            current = parent;
        }

        this.cdr.detectChanges();
        return target;
    }

    /**
     * Find node by ID
     */
    public FindNode(id: string): TreeNode | null {
        return this.nodeMap.get(id) || null;
    }

    /**
     * Get all nodes matching a predicate
     */
    public FindNodes(predicate: (node: TreeNode) => boolean): TreeNode[] {
        const results: TreeNode[] = [];
        for (const node of this.nodeMap.values()) {
            if (predicate(node)) {
                results.push(node);
            }
        }
        return results;
    }

    /**
     * Filter nodes by search text
     */
    public FilterNodes(
        searchText: string,
        options: {
            caseSensitive?: boolean;
            searchBranches?: boolean;
            searchLeaves?: boolean;
            searchDescription?: boolean;
        } = {}
    ): TreeNode[] {
        const {
            caseSensitive = false,
            searchBranches = true,
            searchLeaves = true,
            searchDescription = false
        } = options;

        // Store search text for highlighting
        this.CurrentSearchText = searchText.trim();

        if (!searchText.trim()) {
            // Reset all nodes to visible
            this.setVisibilityRecursive(this.Nodes, true, false);
            this.cdr.detectChanges();
            return [];
        }

        const searchLower = caseSensitive ? searchText : searchText.toLowerCase();
        const matchedNodes: TreeNode[] = [];

        // First pass: mark matching nodes
        this.markMatchingNodesRecursive(
            this.Nodes,
            searchLower,
            caseSensitive,
            searchBranches,
            searchLeaves,
            searchDescription,
            matchedNodes
        );

        // Second pass: make ancestors of matches visible
        this.makeAncestorsVisibleRecursive(this.Nodes);

        this.cdr.detectChanges();
        return matchedNodes;
    }

    /**
     * Clear cache (call before Refresh if you want fresh data)
     */
    public ClearCache(): void {
        this.clearCache();
    }

    // ========================================
    // Template Event Handlers
    // ========================================

    /**
     * Handle node click
     */
    public onNodeClick(node: TreeNode, event: MouseEvent): void {
        // Fire before click event
        const beforeClickEvent = new BeforeNodeClickEventArgs(this, node, event);
        this.BeforeNodeClick.emit(beforeClickEvent);

        if (beforeClickEvent.Cancel) {
            return;
        }

        // Set focus
        this.FocusedNode = node;

        // Handle toggle for branches
        if (node.Type === 'branch' && node.Children.length > 0) {
            // Click on the chevron area toggles expansion
            const target = event.target as HTMLElement;
            if (target.closest('.tree-node-toggle')) {
                this.toggleNodeExpansion(node);
                return;
            }
        }

        // Handle selection
        if (this._selectionMode !== 'none' && this.isNodeSelectable(node)) {
            this.handleNodeSelection(node, event);
        }

        // Fire after click event
        const afterClickEvent = new AfterNodeClickEventArgs(this, node, event);
        this.AfterNodeClick.emit(afterClickEvent);
    }

    /**
     * Handle node double-click
     */
    public onNodeDoubleClick(node: TreeNode, event: MouseEvent): void {
        // Fire before event
        const beforeEvent = new BeforeNodeDoubleClickEventArgs(this, node, event);
        this.BeforeNodeDoubleClick.emit(beforeEvent);

        if (beforeEvent.Cancel) {
            return;
        }

        // Toggle expansion for branches
        if (node.Type === 'branch') {
            this.toggleNodeExpansion(node);
        }

        // Fire after event
        const afterEvent = new AfterNodeDoubleClickEventArgs(this, node, event);
        this.AfterNodeDoubleClick.emit(afterEvent);
    }

    /**
     * Handle toggle click
     */
    public onToggleClick(node: TreeNode, event: MouseEvent): void {
        event.stopPropagation();
        this.toggleNodeExpansion(node);
    }

    // ========================================
    // Keyboard Navigation
    // ========================================

    @HostListener('keydown', ['$event'])
    public onKeyDown(event: KeyboardEvent): void {
        if (!this._enableKeyboardNavigation) {
            return;
        }

        const visibleNodes = this.getVisibleNodesInOrder(this.Nodes);
        if (visibleNodes.length === 0) {
            return;
        }

        const currentIndex = this.FocusedNode
            ? visibleNodes.indexOf(this.FocusedNode)
            : -1;

        let targetNode: TreeNode | null = null;
        let handled = false;

        switch (event.key) {
            case 'ArrowDown':
                if (currentIndex < visibleNodes.length - 1) {
                    targetNode = visibleNodes[currentIndex + 1];
                }
                handled = true;
                break;

            case 'ArrowUp':
                if (currentIndex > 0) {
                    targetNode = visibleNodes[currentIndex - 1];
                } else if (currentIndex === -1 && visibleNodes.length > 0) {
                    targetNode = visibleNodes[visibleNodes.length - 1];
                }
                handled = true;
                break;

            case 'ArrowRight':
                if (this.FocusedNode?.Type === 'branch') {
                    if (!this.FocusedNode.Expanded && this.FocusedNode.Children.length > 0) {
                        this.expandNode(this.FocusedNode);
                    } else if (this.FocusedNode.Expanded && this.FocusedNode.Children.length > 0) {
                        // Move to first child
                        const firstVisible = this.FocusedNode.Children.find(c => c.Visible);
                        if (firstVisible) {
                            targetNode = firstVisible;
                        }
                    }
                }
                handled = true;
                break;

            case 'ArrowLeft':
                if (this.FocusedNode?.Type === 'branch' && this.FocusedNode.Expanded) {
                    this.collapseNode(this.FocusedNode);
                } else if (this.FocusedNode?.ParentID) {
                    // Move to parent
                    targetNode = this.nodeMap.get(this.FocusedNode.ParentID) || null;
                }
                handled = true;
                break;

            case 'Enter':
            case ' ':
                if (this.FocusedNode && this._selectionMode !== 'none' && this.isNodeSelectable(this.FocusedNode)) {
                    this.handleNodeSelection(this.FocusedNode, event as unknown as MouseEvent);
                }
                handled = true;
                break;

            case 'Home':
                if (visibleNodes.length > 0) {
                    targetNode = visibleNodes[0];
                }
                handled = true;
                break;

            case 'End':
                if (visibleNodes.length > 0) {
                    targetNode = visibleNodes[visibleNodes.length - 1];
                }
                handled = true;
                break;
        }

        if (handled) {
            event.preventDefault();
            event.stopPropagation();
        }

        if (targetNode && targetNode !== this.FocusedNode) {
            // Fire before navigate event
            const beforeEvent = new BeforeKeyboardNavigateEventArgs(
                this,
                event,
                this.FocusedNode,
                targetNode
            );
            this.BeforeKeyboardNavigate.emit(beforeEvent);

            if (!beforeEvent.Cancel) {
                const previousNode = this.FocusedNode;
                this.FocusedNode = targetNode;

                // Fire after navigate event
                const afterEvent = new AfterKeyboardNavigateEventArgs(
                    this,
                    event.key,
                    previousNode,
                    this.FocusedNode
                );
                this.AfterKeyboardNavigate.emit(afterEvent);

                this.scrollNodeIntoView(targetNode);
                this.cdr.detectChanges();
            }
        }
    }

    // ========================================
    // Private Methods - Data Loading
    // ========================================

    /**
     * Load tree data
     */
    private async loadData(forceRefresh: boolean): Promise<void> {
        if (!this._branchConfig) {
            console.warn('[TreeComponent] loadData() - BranchConfig is required');
            return;
        }

        // Prevent concurrent loads
        if (this.isCurrentlyLoading) {
            return;
        }

        // Check instance cache first (unless force refresh)
        if (!forceRefresh && this.cachedNodes) {
            this.Nodes = this.cloneNodes(this.cachedNodes);
            this.AllBranches = this.cloneNodes(this.cachedBranches || []);
            this.AllLeaves = this.cloneNodes(this.cachedLeaves || []);
            this.nodeMap = this.buildNodeMap(this.Nodes);
            this.applyInitialExpansion();
            this.syncSelectionFromIDs();
            this.IsLoaded = true;
            this.cdr.detectChanges();
            return;
        }

        // Fire before event
        const beforeEvent = new BeforeDataLoadEventArgs(this, this._branchConfig, this._leafConfig);
        this.BeforeDataLoad.emit(beforeEvent);

        if (beforeEvent.Cancel) {
            return;
        }

        this.isCurrentlyLoading = true;
        this.IsLoading = true;
        this.ErrorMessage = null;
        this.cdr.detectChanges();

        const startTime = performance.now();

        // Apply any modified filters from event
        const branchConfig = { ...this._branchConfig };
        if (beforeEvent.ModifiedBranchFilter !== undefined) {
            branchConfig.ExtraFilter = beforeEvent.ModifiedBranchFilter;
        }

        const leafConfig = this._leafConfig ? { ...this._leafConfig } : undefined;
        if (leafConfig && beforeEvent.ModifiedLeafFilter !== undefined) {
            leafConfig.ExtraFilter = beforeEvent.ModifiedLeafFilter;
        }

        try {
            // Load branches and leaves in parallel
            const [branchData, leafData] = await Promise.all([
                this.loadBranches(branchConfig),
                leafConfig ? this.loadLeaves(leafConfig) : Promise.resolve([])
            ]);

            // Build tree structure
            const { rootNodes, allBranches, branchMap } = this.buildBranchHierarchy(branchData, branchConfig);

            // Load junction mappings if configured (for M2M relationships)
            let junctionMappings: Map<string, string[]> | null = null;
            if (leafConfig?.JunctionConfig) {
                junctionMappings = await this.loadJunctionMappings(leafConfig.JunctionConfig, leafConfig.IDField || 'ID');
            }

            // Attach leaves to branches (or root if orphans)
            const allLeaves = this.attachLeavesToBranches(rootNodes, branchMap, leafData, leafConfig, junctionMappings);

            const loadTimeMs = performance.now() - startTime;

            // Store in instance cache
            this.cachedNodes = this.cloneNodes(rootNodes);
            this.cachedBranches = this.cloneNodes(allBranches);
            this.cachedLeaves = this.cloneNodes(allLeaves);

            // Set state
            this.Nodes = rootNodes;
            this.AllBranches = allBranches;
            this.AllLeaves = allLeaves;
            this.nodeMap = this.buildNodeMap(this.Nodes);
            this.IsLoading = false;
            this.IsLoaded = true;
            this.isCurrentlyLoading = false;

            // Apply initial expansion
            this.applyInitialExpansion();

            // Apply initial selection
            this.syncSelectionFromIDs();

            // Fire after event
            const afterEvent = new AfterDataLoadEventArgs(
                this,
                true,
                allBranches.length,
                allLeaves.length,
                loadTimeMs,
                undefined
            );
            this.AfterDataLoad.emit(afterEvent);

        } catch (error) {
            const loadTimeMs = performance.now() - startTime;
            const errorMessage = error instanceof Error ? error.message : String(error);
            console.error('[TreeComponent] loadData() error:', errorMessage, error);

            this.IsLoading = false;
            this.IsLoaded = true;
            this.isCurrentlyLoading = false;
            this.ErrorMessage = errorMessage;
            this.Nodes = [];
            this.AllBranches = [];
            this.AllLeaves = [];

            // Fire after event with error
            const afterEvent = new AfterDataLoadEventArgs(
                this,
                false,
                0,
                0,
                loadTimeMs,
                errorMessage
            );
            this.AfterDataLoad.emit(afterEvent);
        }

        this.cdr.detectChanges();
    }

    /**
     * Load branch entities from database
     */
    private async loadBranches(config: TreeBranchConfig): Promise<Record<string, unknown>[]> {
        const rv = new RunView();
        const result = await rv.RunView({
            EntityName: config.EntityName,
            ExtraFilter: config.ExtraFilter || '',
            OrderBy: config.OrderBy || 'Name ASC',
            ResultType: 'simple',
            CacheLocal: config.CacheLocal ?? true
        });

        console.log('[TreeComponent] Branches query result:', {
            entityName: config.EntityName,
            filter: config.ExtraFilter || '(none)',
            cacheLocal: config.CacheLocal ?? true,
            success: result.Success,
            recordCount: result.Results?.length || 0,
            records: result.Results?.map((r: Record<string, unknown>) => ({ ID: r['ID'], Name: r['Name'] }))
        });

        if (!result.Success) {
            throw new Error(`Failed to load branches: ${result.ErrorMessage}`);
        }

        return result.Results as Record<string, unknown>[];
    }

    /**
     * Load leaf entities from database
     */
    private async loadLeaves(config: TreeLeafConfig): Promise<Record<string, unknown>[]> {
        const rv = new RunView();
        const result = await rv.RunView({
            EntityName: config.EntityName,
            ExtraFilter: config.ExtraFilter || '',
            OrderBy: config.OrderBy || 'Name ASC',
            ResultType: 'simple',
            CacheLocal: config.CacheLocal ?? true
        });

        console.log('[TreeComponent] Leaves query result:', {
            entityName: config.EntityName,
            filter: config.ExtraFilter || '(none)',
            cacheLocal: config.CacheLocal ?? true,
            success: result.Success,
            recordCount: result.Results?.length || 0,
            records: result.Results?.map((r: Record<string, unknown>) => ({ ID: r['ID'], Name: r['Name'] }))
        });

        if (!result.Success) {
            throw new Error(`Failed to load leaves: ${result.ErrorMessage}`);
        }

        return result.Results as Record<string, unknown>[];
    }

    /**
     * Load junction mappings for M2M relationships.
     * Returns a map of leafId -> branchIds[]
     */
    private async loadJunctionMappings(
        junctionConfig: TreeJunctionConfig,
        leafIdField: string
    ): Promise<Map<string, string[]>> {
        const rv = new RunView();
        const mappings = new Map<string, string[]>();

        // Load junction records
        const junctionResult = await rv.RunView({
            EntityName: junctionConfig.EntityName,
            ExtraFilter: junctionConfig.ExtraFilter || '',
            ResultType: 'simple',
            CacheLocal: junctionConfig.CacheLocal ?? true
        });

        console.log('[TreeComponent] Junction query result:', {
            entityName: junctionConfig.EntityName,
            filter: junctionConfig.ExtraFilter || '(none)',
            cacheLocal: junctionConfig.CacheLocal ?? true,
            success: junctionResult.Success,
            recordCount: junctionResult.Results?.length || 0,
            records: junctionResult.Results
        });

        if (!junctionResult.Success) {
            console.warn(`Failed to load junction data: ${junctionResult.ErrorMessage}`);
            return mappings;
        }

        const junctionRecords = junctionResult.Results as Record<string, unknown>[];

        // If there's an indirect mapping, we need to resolve it
        if (junctionConfig.IndirectLeafMapping) {
            const indirect = junctionConfig.IndirectLeafMapping;

            // Load the intermediate entity records to build the mapping
            const intermediateResult = await rv.RunView({
                EntityName: indirect.IntermediateEntity,
                ExtraFilter: indirect.ExtraFilter || '',
                ResultType: 'simple',
                CacheLocal: indirect.CacheLocal ?? true
            });

            console.log('[TreeComponent] Intermediate entity query result:', {
                entityName: indirect.IntermediateEntity,
                filter: indirect.ExtraFilter || '(none)',
                cacheLocal: indirect.CacheLocal ?? true,
                success: intermediateResult.Success,
                recordCount: intermediateResult.Results?.length || 0,
                records: intermediateResult.Results
            });

            if (!intermediateResult.Success) {
                console.warn(`Failed to load intermediate data: ${intermediateResult.ErrorMessage}`);
                return mappings;
            }

            // Build intermediate ID -> leaf ID map
            const intermediateToLeaf = new Map<string, string>();
            for (const record of intermediateResult.Results as Record<string, unknown>[]) {
                const intermediateId = String(record[indirect.IntermediateIDField] || '');
                const leafId = String(record[indirect.LeafIDField] || '');
                if (intermediateId && leafId) {
                    intermediateToLeaf.set(intermediateId, leafId);
                }
            }

            console.log('[TreeComponent] Intermediate to leaf mapping:', {
                mapSize: intermediateToLeaf.size,
                entries: Array.from(intermediateToLeaf.entries())
            });

            // Now process junction records using the intermediate mapping
            for (const junction of junctionRecords) {
                const intermediateId = String(junction[junctionConfig.LeafForeignKey] || '');
                const branchId = String(junction[junctionConfig.BranchForeignKey] || '');

                if (intermediateId && branchId) {
                    const leafId = intermediateToLeaf.get(intermediateId);
                    if (leafId) {
                        if (!mappings.has(leafId)) {
                            mappings.set(leafId, []);
                        }
                        const branchIds = mappings.get(leafId)!;
                        if (!branchIds.includes(branchId)) {
                            branchIds.push(branchId);
                        }
                    }
                }
            }
        } else {
            // Direct mapping - junction directly references the leaf
            for (const junction of junctionRecords) {
                const leafId = String(junction[junctionConfig.LeafForeignKey] || '');
                const branchId = String(junction[junctionConfig.BranchForeignKey] || '');

                if (leafId && branchId) {
                    if (!mappings.has(leafId)) {
                        mappings.set(leafId, []);
                    }
                    const branchIds = mappings.get(leafId)!;
                    if (!branchIds.includes(branchId)) {
                        branchIds.push(branchId);
                    }
                }
            }
        }

        console.log('[TreeComponent] Final junction mappings (leafId -> branchIds):', {
            mapSize: mappings.size,
            entries: Array.from(mappings.entries())
        });

        return mappings;
    }

    /**
     * Build branch hierarchy from flat data
     */
    private buildBranchHierarchy(
        branchData: Record<string, unknown>[],
        config: TreeBranchConfig
    ): { rootNodes: TreeNode[]; allBranches: TreeNode[]; branchMap: Map<string, TreeNode> } {
        const idField = config.IDField || 'ID';
        const parentIdField = config.ParentIDField || 'ParentID';
        const displayField = config.DisplayField || 'Name';

        const nodeMap = new Map<string, TreeNode>();
        const allBranches: TreeNode[] = [];

        for (const data of branchData) {
            const id = String(data[idField] || '');
            const parentId = data[parentIdField] ? String(data[parentIdField]) : null;

            const node = createDefaultTreeNode({
                ID: id,
                Label: String(data[displayField] || ''),
                Type: 'branch',
                ParentID: parentId,
                Icon: this.getNodeIcon(data, config.IconField, config.DefaultIcon || 'fa-solid fa-folder'),
                Color: this.getNodeColor(data, config.ColorField, config.DefaultColor),
                Data: { ...data },
                Description: config.DescriptionField ? String(data[config.DescriptionField] || '') : undefined,
                Badge: config.BadgeField ? String(data[config.BadgeField] || '') : undefined,
                EntityName: config.EntityName
            });

            nodeMap.set(id, node);
            allBranches.push(node);
        }

        // Build parent-child relationships
        const rootNodes: TreeNode[] = [];

        for (const node of allBranches) {
            if (node.ParentID && nodeMap.has(node.ParentID)) {
                const parent = nodeMap.get(node.ParentID)!;
                parent.Children.push(node);
                node.Level = this.calculateLevel(node, nodeMap);
            } else {
                rootNodes.push(node);
                node.Level = 0;
            }
        }

        // Sort children at each level
        this.sortChildrenRecursive(rootNodes);

        return { rootNodes, allBranches, branchMap: nodeMap };
    }

    /**
     * Attach leaf nodes to their parent branches or root level.
     * Supports both direct parent field relationships and M2M junction mappings.
     *
     * @param rootNodes Root nodes to attach orphan leaves to
     * @param branchMap Map of branch IDs to branch nodes
     * @param leafData Raw leaf data from database
     * @param config Leaf configuration
     * @param junctionMappings Optional M2M mappings (leafId -> branchIds[])
     */
    private attachLeavesToBranches(
        rootNodes: TreeNode[],
        branchMap: Map<string, TreeNode>,
        leafData: Record<string, unknown>[],
        config?: TreeLeafConfig,
        junctionMappings?: Map<string, string[]> | null
    ): TreeNode[] {
        if (!config || leafData.length === 0) {
            return [];
        }

        const idField = config.IDField || 'ID';
        const parentField = config.ParentField;
        const displayField = config.DisplayField || 'Name';
        const useJunction = !!junctionMappings && junctionMappings.size > 0;

        console.log('[TreeComponent] attachLeavesToBranches input:', {
            leafDataCount: leafData.length,
            leafIds: leafData.map((d: Record<string, unknown>) => ({ id: d[idField], name: d[displayField] })),
            branchMapKeys: Array.from(branchMap.keys()),
            branchMapEntries: Array.from(branchMap.entries()).map(([k, v]) => ({ id: k, name: v.Label })),
            useJunction,
            junctionMappingKeys: junctionMappings ? Array.from(junctionMappings.keys()) : []
        });

        const allLeaves: TreeNode[] = [];
        const addedLeafIds = new Set<string>(); // Track leaves already added to avoid duplicates

        for (const data of leafData) {
            const id = String(data[idField] || '');

            // If using junction mappings, only include leaves that have junction entries
            if (useJunction && !junctionMappings!.has(id)) {
                console.log(`[TreeComponent] Skipping leaf ${id} (${data[displayField]}) - not in junction mappings`);
                continue; // Skip leaves not in any branch via junction
            }

            const leaf = createDefaultTreeNode({
                ID: id,
                Label: String(data[displayField] || ''),
                Type: 'leaf',
                ParentID: null, // Will be set based on attachment
                Icon: this.getNodeIcon(data, config.IconField, config.DefaultIcon || 'fa-solid fa-file'),
                Data: { ...data },
                Description: config.DescriptionField ? String(data[config.DescriptionField] || '') : undefined,
                Badge: config.BadgeField ? String(data[config.BadgeField] || '') : undefined,
                EntityName: config.EntityName
            });

            allLeaves.push(leaf);
            console.log(`[TreeComponent] Processing leaf ${id} (${leaf.Label})`);

            if (useJunction) {
                // M2M relationship: attach to all mapped branches
                const branchIds = junctionMappings!.get(id) || [];
                let attached = false;

                console.log(`[TreeComponent] Leaf ${id} junction branchIds:`, branchIds);

                for (const branchId of branchIds) {
                    if (branchMap.has(branchId)) {
                        const parent = branchMap.get(branchId)!;
                        console.log(`[TreeComponent] Attaching leaf ${id} to branch ${branchId} (${parent.Label})`);

                        if (!attached) {
                            // First attachment: use the original leaf
                            leaf.ParentID = branchId;
                            leaf.Level = parent.Level + 1;
                            parent.Children.push(leaf);
                            attached = true;
                        } else {
                            // Additional attachments: create a clone of the leaf
                            // This allows the same artifact to appear under multiple collections
                            const leafClone = createDefaultTreeNode({
                                ...leaf,
                                ParentID: branchId,
                                Level: parent.Level + 1,
                                Children: [],
                                Data: { ...leaf.Data }
                            });
                            parent.Children.push(leafClone);
                        }
                    } else {
                        console.log(`[TreeComponent] Branch ${branchId} NOT FOUND in branchMap for leaf ${id}`);
                    }
                }

                // If no valid branch found, add to root
                if (!attached) {
                    console.log(`[TreeComponent] Leaf ${id} not attached to any branch, adding to root`);
                    rootNodes.push(leaf);
                    leaf.Level = 0;
                }
            } else {
                // Direct parent field relationship
                const parentFieldValue = parentField ? data[parentField] : null;
                const parentId = parentFieldValue ? String(parentFieldValue) : null;
                leaf.ParentID = parentId;

                if (parentId && branchMap.has(parentId)) {
                    const parent = branchMap.get(parentId)!;
                    parent.Children.push(leaf);
                    leaf.Level = parent.Level + 1;
                } else {
                    // Orphan leaf (no parent or parent not found) - add to root level
                    rootNodes.push(leaf);
                    leaf.Level = 0;
                }
            }
        }

        // Re-sort children to interleave branches and leaves properly
        this.sortChildrenByTypeAndName(rootNodes);
        for (const branch of branchMap.values()) {
            this.sortChildrenByTypeAndName(branch.Children);
        }

        return allLeaves;
    }

    /**
     * Calculate node level in hierarchy
     */
    private calculateLevel(node: TreeNode, nodeMap: Map<string, TreeNode>): number {
        let level = 0;
        let current = node;

        while (current.ParentID && nodeMap.has(current.ParentID)) {
            level++;
            current = nodeMap.get(current.ParentID)!;
            if (level > 100) break; // Safety for circular refs
        }

        return level;
    }

    /**
     * Sort children recursively (alphabetically)
     */
    private sortChildrenRecursive(nodes: TreeNode[]): void {
        nodes.sort((a, b) => a.Label.localeCompare(b.Label));

        for (const node of nodes) {
            if (node.Children.length > 0) {
                this.sortChildrenRecursive(node.Children);
            }
        }
    }

    /**
     * Sort children: branches first (alphabetically), then leaves (alphabetically)
     */
    private sortChildrenByTypeAndName(nodes: TreeNode[]): void {
        nodes.sort((a, b) => {
            if (a.Type !== b.Type) {
                return a.Type === 'branch' ? -1 : 1;
            }
            return a.Label.localeCompare(b.Label);
        });
    }

    /**
     * Get icon for a node from field or default
     */
    private getNodeIcon(
        data: Record<string, unknown>,
        iconField?: string,
        defaultIcon: string = 'fa-solid fa-folder'
    ): string {
        if (iconField && data[iconField]) {
            return String(data[iconField]);
        }
        return defaultIcon;
    }

    /**
     * Get color for a node from field or default
     */
    private getNodeColor(
        data: Record<string, unknown>,
        colorField?: string,
        defaultColor?: string
    ): string | undefined {
        if (colorField && data[colorField]) {
            return String(data[colorField]);
        }
        return defaultColor;
    }

    /**
     * Clear instance cache
     */
    private clearCache(): void {
        this.cachedNodes = null;
        this.cachedBranches = null;
        this.cachedLeaves = null;
    }

    /**
     * Deep clone tree nodes
     */
    private cloneNodes(nodes: TreeNode[]): TreeNode[] {
        return nodes.map(node => this.cloneNode(node));
    }

    private cloneNode(node: TreeNode): TreeNode {
        return {
            ...node,
            Data: { ...node.Data },
            Children: this.cloneNodes(node.Children)
        };
    }

    /**
     * Build a flat map of all nodes by ID
     */
    private buildNodeMap(nodes: TreeNode[]): Map<string, TreeNode> {
        const map = new Map<string, TreeNode>();
        this.addNodesToMapRecursive(nodes, map);
        return map;
    }

    private addNodesToMapRecursive(nodes: TreeNode[], map: Map<string, TreeNode>): void {
        for (const node of nodes) {
            map.set(node.ID, node);
            this.addNodesToMapRecursive(node.Children, map);
        }
    }

    // ========================================
    // Private Methods - Tree Operations
    // ========================================

    /**
     * Apply initial expansion state
     */
    private applyInitialExpansion(): void {
        if (this._expandedIDs === null) {
            // Auto-expand first level
            for (const node of this.Nodes) {
                if (node.Type === 'branch') {
                    node.Expanded = true;
                }
            }
        } else {
            // Expand specified nodes
            for (const id of this._expandedIDs) {
                const node = this.nodeMap.get(id);
                if (node && node.Type === 'branch') {
                    node.Expanded = true;
                }
            }
        }
    }

    /**
     * Sync selection state from SelectedIDs input
     */
    private syncSelectionFromIDs(): void {
        // Clear current selection
        for (const node of this.SelectedNodes) {
            node.Selected = false;
        }
        this.SelectedNodes = [];

        // Apply new selection
        for (const id of this._selectedIDs) {
            const node = this.nodeMap.get(id);
            if (node && this.isNodeSelectable(node)) {
                node.Selected = true;
                this.SelectedNodes.push(node);
            }
        }
    }

    /**
     * Check if a node can be selected based on SelectableTypes
     */
    private isNodeSelectable(node: TreeNode): boolean {
        if (this._selectableTypes === 'both') return true;
        return node.Type === this._selectableTypes;
    }

    /**
     * Handle node selection logic
     */
    private handleNodeSelection(node: TreeNode, event: MouseEvent | KeyboardEvent): void {
        const isCtrlClick = event.ctrlKey || event.metaKey;
        const isSelected = node.Selected;
        const previousSelection = [...this.SelectedNodes];

        if (isSelected) {
            // Deselect
            const beforeEvent = new BeforeNodeDeselectEventArgs(this, node, previousSelection);
            this.BeforeNodeDeselect.emit(beforeEvent);

            if (beforeEvent.Cancel) {
                return;
            }

            node.Selected = false;
            this.SelectedNodes = this.SelectedNodes.filter(n => n !== node);

            const afterEvent = new AfterNodeDeselectEventArgs(
                this,
                node,
                [...this.SelectedNodes],
                previousSelection
            );
            this.AfterNodeDeselect.emit(afterEvent);
        } else {
            // Select
            const isAdditive = this._selectionMode === 'multiple' && isCtrlClick;

            const beforeEvent = new BeforeNodeSelectEventArgs(
                this,
                node,
                isAdditive,
                previousSelection
            );
            this.BeforeNodeSelect.emit(beforeEvent);

            if (beforeEvent.Cancel) {
                return;
            }

            if (this._selectionMode === 'single' || !isAdditive) {
                // Clear previous selection
                for (const prev of this.SelectedNodes) {
                    prev.Selected = false;
                }
                this.SelectedNodes = [];
            }

            node.Selected = true;
            this.SelectedNodes.push(node);

            const afterEvent = new AfterNodeSelectEventArgs(
                this,
                node,
                isAdditive,
                [...this.SelectedNodes],
                previousSelection
            );
            this.AfterNodeSelect.emit(afterEvent);
        }

        this.SelectionChange.emit([...this.SelectedNodes]);
        this.cdr.detectChanges();
    }

    /**
     * Toggle node expansion
     */
    private toggleNodeExpansion(node: TreeNode): void {
        if (node.Expanded) {
            this.collapseNode(node);
        } else {
            this.expandNode(node);
        }
    }

    /**
     * Expand a node
     */
    private expandNode(node: TreeNode): void {
        if (node.Type !== 'branch' || node.Children.length === 0) {
            return;
        }

        const beforeEvent = new BeforeNodeExpandEventArgs(this, node);
        this.BeforeNodeExpand.emit(beforeEvent);

        if (beforeEvent.Cancel) {
            return;
        }

        node.Expanded = true;

        const afterEvent = new AfterNodeExpandEventArgs(
            this,
            node,
            node.Children.filter(c => c.Visible).length
        );
        this.AfterNodeExpand.emit(afterEvent);

        this.cdr.detectChanges();
    }

    /**
     * Collapse a node
     */
    private collapseNode(node: TreeNode): void {
        if (node.Type !== 'branch') {
            return;
        }

        const beforeEvent = new BeforeNodeCollapseEventArgs(this, node);
        this.BeforeNodeCollapse.emit(beforeEvent);

        if (beforeEvent.Cancel) {
            return;
        }

        node.Expanded = false;

        const afterEvent = new AfterNodeCollapseEventArgs(this, node);
        this.AfterNodeCollapse.emit(afterEvent);

        this.cdr.detectChanges();
    }

    /**
     * Expand all nodes recursively
     */
    private expandAllRecursive(nodes: TreeNode[]): void {
        for (const node of nodes) {
            if (node.Type === 'branch') {
                node.Expanded = true;
                this.expandAllRecursive(node.Children);
            }
        }
    }

    /**
     * Collapse all nodes recursively
     */
    private collapseAllRecursive(nodes: TreeNode[]): void {
        for (const node of nodes) {
            if (node.Type === 'branch') {
                node.Expanded = false;
                this.collapseAllRecursive(node.Children);
            }
        }
    }

    /**
     * Get all visible nodes in tree order
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
     * Scroll a node into view
     */
    private scrollNodeIntoView(node: TreeNode): void {
        const element = this.elementRef.nativeElement.querySelector(
            `[data-node-id="${node.ID}"]`
        );
        if (element) {
            element.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
        }
    }

    // ========================================
    // Private Methods - Search/Filter
    // ========================================

    /**
     * Set visibility recursively
     */
    private setVisibilityRecursive(nodes: TreeNode[], visible: boolean, matchesSearch: boolean): void {
        for (const node of nodes) {
            node.Visible = visible;
            node.MatchesSearch = matchesSearch;
            this.setVisibilityRecursive(node.Children, visible, matchesSearch);
        }
    }

    /**
     * Recursively mark nodes that match the search
     */
    private markMatchingNodesRecursive(
        nodes: TreeNode[],
        searchText: string,
        caseSensitive: boolean,
        searchBranches: boolean,
        searchLeaves: boolean,
        searchDescription: boolean,
        matchedNodes: TreeNode[]
    ): boolean {
        let hasVisibleChild = false;

        for (const node of nodes) {
            const shouldSearch =
                (node.Type === 'branch' && searchBranches) ||
                (node.Type === 'leaf' && searchLeaves);

            let matches = false;
            if (shouldSearch) {
                const label = caseSensitive ? node.Label : node.Label.toLowerCase();
                matches = label.includes(searchText);

                if (!matches && searchDescription && node.Description) {
                    const desc = caseSensitive ? node.Description : node.Description.toLowerCase();
                    matches = desc.includes(searchText);
                }
            }

            node.MatchesSearch = matches;

            const childHasMatch = this.markMatchingNodesRecursive(
                node.Children,
                searchText,
                caseSensitive,
                searchBranches,
                searchLeaves,
                searchDescription,
                matchedNodes
            );

            node.Visible = matches || childHasMatch;

            if (matches) {
                matchedNodes.push(node);
            }

            if (node.Visible) {
                hasVisibleChild = true;
            }
        }

        return hasVisibleChild;
    }

    /**
     * Make ancestors of visible nodes also visible
     */
    private makeAncestorsVisibleRecursive(nodes: TreeNode[]): boolean {
        let hasVisibleChild = false;

        for (const node of nodes) {
            const childVisible = this.makeAncestorsVisibleRecursive(node.Children);

            if (childVisible && !node.Visible) {
                node.Visible = true;
            }

            if (node.Visible) {
                hasVisibleChild = true;
            }
        }

        return hasVisibleChild;
    }

    // ========================================
    // Template Helpers
    // ========================================

    /**
     * Get the padding for a node based on its level
     */
    public getNodePadding(node: TreeNode): string {
        const basePadding = node.Level * this._indentSize;
        // Root-level leaves need a small indent since they have no toggle button
        // to align them with nested items
        if (node.Type === 'leaf' && node.Level === 0) {
            return `${basePadding + 8}px`;
        }
        return `${basePadding}px`;
    }

    /**
     * Get CSS classes for a node
     */
    public getNodeClasses(node: TreeNode): Record<string, boolean> {
        return {
            'tree-node': true,
            'tree-node--branch': node.Type === 'branch',
            'tree-node--leaf': node.Type === 'leaf',
            'tree-node--root-level': node.Level === 0,
            'tree-node--selected': node.Selected,
            'tree-node--focused': node === this.FocusedNode,
            'tree-node--expanded': node.Expanded,
            'tree-node--has-children': node.Children.length > 0,
            'tree-node--match': node.MatchesSearch,
            [this._styleConfig.NodeClass || '']: !!this._styleConfig.NodeClass,
            [this._styleConfig.SelectedClass || '']: node.Selected && !!this._styleConfig.SelectedClass,
            [this._styleConfig.BranchClass || '']: node.Type === 'branch' && !!this._styleConfig.BranchClass,
            [this._styleConfig.LeafClass || '']: node.Type === 'leaf' && !!this._styleConfig.LeafClass,
            [this._styleConfig.ExpandedClass || '']: node.Expanded && !!this._styleConfig.ExpandedClass
        };
    }

    /**
     * Get container classes
     */
    public getContainerClasses(): Record<string, boolean> {
        return {
            'tree-container': true,
            'tree-container--loading': this.IsLoading,
            'tree-container--empty': this.IsLoaded && this.Nodes.length === 0,
            [this._styleConfig.ContainerClass || '']: !!this._styleConfig.ContainerClass
        };
    }

    /**
     * Track nodes for ngFor
     */
    public trackNode(index: number, node: TreeNode): string {
        return node.ID;
    }

    /**
     * Get label HTML with search text highlighted
     */
    public getHighlightedLabel(node: TreeNode): string {
        const label = node.Label;

        // No search text or node doesn't match - return plain label (escaped)
        if (!this.CurrentSearchText || !node.MatchesSearch) {
            return this.escapeHtml(label);
        }

        // Find and highlight the matching portion (case-insensitive)
        const searchLower = this.CurrentSearchText.toLowerCase();
        const labelLower = label.toLowerCase();
        const matchIndex = labelLower.indexOf(searchLower);

        if (matchIndex === -1) {
            return this.escapeHtml(label);
        }

        // Split into before, match, and after parts
        const before = label.substring(0, matchIndex);
        const match = label.substring(matchIndex, matchIndex + this.CurrentSearchText.length);
        const after = label.substring(matchIndex + this.CurrentSearchText.length);

        return `${this.escapeHtml(before)}<mark class="tree-search-highlight">${this.escapeHtml(match)}</mark>${this.escapeHtml(after)}`;
    }

    /**
     * Escape HTML special characters to prevent XSS
     */
    private escapeHtml(text: string): string {
        const div = document.createElement('div');
        div.textContent = text;
        return div.innerHTML;
    }
}
