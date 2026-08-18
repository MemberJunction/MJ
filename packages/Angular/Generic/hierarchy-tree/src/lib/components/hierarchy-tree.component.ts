import {
    Component,
    Input,
    Output,
    EventEmitter,
    ElementRef,
    ViewChild,
    OnInit,
    OnDestroy,
    OnChanges,
    SimpleChanges,
    ChangeDetectorRef,
    inject,
    AfterViewInit
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Metadata, RunView, CompositeKey, EntityInfo } from '@memberjunction/core';
import { UUIDsEqual, NormalizeUUID } from '@memberjunction/global';
import { FormNavigationEvent, RecordNavigationEvent } from '@memberjunction/ng-base-forms';
import * as d3 from 'd3';
import {
    HierarchyTreeConfig,
    HierarchyNodeData,
    HierarchyTreeOrientation,
    HierarchyNodeStyle
} from '../models/hierarchy-tree.types';
import {
    HierarchyNodeEvent,
    CancelableHierarchyNodeEvent,
    ReparentEvent,
    CancelableReparentEvent,
    NodeActionEvent
} from '../events/hierarchy-tree.events';

/**
 * Modern, interactive, canvas-based visual hierarchy and organizational chart component.
 *
 * Automatically generates a dynamic, zoomable tree visualization for any MemberJunction entity
 * with a self-referencing parent foreign key (such as Corporate Subsidiaries, Product Categories,
 * Committee Governance structures, Tag Taxonomies, and Management Lines).
 *
 * Features:
 * - **Metadata Driven**: Auto-derives primary keys (including composite keys) and parent fields from MJ metadata.
 * - **Interactive Canvas**: D3-powered smooth pan, zoom, auto-fit, and mini-toolbar controls.
 * - **Collapsible Subtrees**: Interactive `[+]` / `[-]` badges with direct and total descendant counts.
 * - **Live Search & Path Expansion**: Instant keyword search that highlights matches and auto-expands ancestor branches.
 * - **Subtree Focus**: Isolate any node as the root of the view with 1-click return to full hierarchy.
 * - **Full Design Token Theming**: Uses `--mj-*` surface, border, typography, and accent tokens.
 * - **Extensive Cancelable Events**: Before/After events for expansion, collapse, reparenting, and navigation.
 *
 * @example
 * ```html
 * <mj-hierarchy-tree
 *     [Config]="{
 *         EntityName: 'MJ_BizApps_Common: Organizations',
 *         ParentField: 'ParentID',
 *         SubtitleField: 'OrganizationType',
 *         DefaultIcon: 'fa-solid fa-building'
 *     }"
 *     (Navigate)="onNavigate($event)">
 * </mj-hierarchy-tree>
 * ```
 */
@Component({
    selector: 'mj-hierarchy-tree',
    standalone: true,
    imports: [CommonModule, FormsModule],
    templateUrl: './hierarchy-tree.component.html',
    styleUrls: ['./hierarchy-tree.component.css']
})
export class HierarchyTreeComponent implements OnInit, AfterViewInit, OnChanges, OnDestroy {
    constructor(private cdr?: ChangeDetectorRef) {}

    @ViewChild('svgContainer', { static: false }) svgContainerRef!: ElementRef<HTMLDivElement>;
    @ViewChild('svgElement', { static: false }) svgRef!: ElementRef<SVGSVGElement>;

    /**
     * Declarative configuration defining the target entity and visual layout properties.
     */
    @Input() Config!: HierarchyTreeConfig;

    /**
     * Optional pre-loaded data array. If provided, the component skips the automated
     * `RunView` query and constructs the tree directly from these items.
     */
    @Input() Data?: Record<string, unknown>[];

    /**
     * Optional active / selected record ID. When provided, the node is highlighted and all ancestors
     * are expanded so it is visible in full tree context.
     */
    @Input() ActiveRecordID?: string;

    /**
     * Primary key ID to focus as the subtree root.
     */
    @Input() FocusRecordID?: string;

    /**
     * Controls whether action buttons (Open Record, Focus, Add Child) appear on node cards.
     */
    @Input() AllowNodeActions = true;

    /**
     * Emitted when a node is clicked.
     */
    @Output() NodeClick = new EventEmitter<HierarchyNodeEvent>();

    /**
     * Emitted when a node is double-clicked.
     */
    @Output() NodeDoubleClick = new EventEmitter<HierarchyNodeEvent>();

    /**
     * Emitted when a node is selected / set as active.
     */
    @Output() NodeSelect = new EventEmitter<HierarchyNodeEvent>();

    /**
     * Emitted before a node expands its children. Cancelable.
     */
    @Output() BeforeNodeExpand = new EventEmitter<CancelableHierarchyNodeEvent>();

    /**
     * Emitted after a node has expanded its children.
     */
    @Output() AfterNodeExpand = new EventEmitter<HierarchyNodeEvent>();

    /**
     * Emitted before a node collapses its children. Cancelable.
     */
    @Output() BeforeNodeCollapse = new EventEmitter<CancelableHierarchyNodeEvent>();

    /**
     * Emitted after a node has collapsed its children.
     */
    @Output() AfterNodeCollapse = new EventEmitter<HierarchyNodeEvent>();

    /**
     * Emitted before a node is reparented. Cancelable.
     */
    @Output() BeforeReparent = new EventEmitter<CancelableReparentEvent>();

    /**
     * Emitted after a node has been reparented.
     */
    @Output() AfterReparent = new EventEmitter<ReparentEvent>();

    /**
     * Emitted when an action button (e.g. Open, Add Child, Focus) is invoked on a node.
     */
    @Output() NodeAction = new EventEmitter<NodeActionEvent>();

    /**
     * Optional persisted zoom scale factor to restore.
     */
    @Input() ZoomLevel?: number;

    /**
     * Emitted when the user zooms in or out on the hierarchy canvas.
     */
    @Output() ZoomChange = new EventEmitter<number>();

    /**
     * Emitted when the user requests navigation to a full entity record.
     */
    @Output() Navigate = new EventEmitter<FormNavigationEvent>();

    // --- State ---
    public Loading = false;
    public ErrorMessage: string | null = null;
    public SearchQuery = '';
    public MatchingNodeCount = 0;
    public FocusedNode: HierarchyNodeData | null = null;
    public SelectedNode: HierarchyNodeData | null = null;
    public ShowDetailsDrawer = false;

    /** Flattened list of all loaded hierarchy nodes for search and lookup. */
    public AllNodes: HierarchyNodeData[] = [];
    private nodeMap = new Map<string, HierarchyNodeData>();

    /** The root nodes of the active view. */
    public RootNodes: HierarchyNodeData[] = [];

    /** D3 zoom behavior and SVG group selection */
    private zoomBehavior: d3.ZoomBehavior<SVGSVGElement, unknown> | null = null;
    private svgSelection: d3.Selection<SVGSVGElement, unknown, null, undefined> | null = null;
    private gSelection: d3.Selection<SVGGElement, unknown, null, undefined> | null = null;
    private currentZoomTransform: d3.ZoomTransform = d3.zoomIdentity;

    private resizeObserver: ResizeObserver | null = null;
    private entityInfo: EntityInfo | null = null;
    private previousConfigState: Partial<HierarchyTreeConfig> = {};

    public ngOnInit(): void {
        this.initializeConfig();
        this.log('[HierarchyTree:ngOnInit] Initializing with Config:', this.Config);
        if (this.Config) {
            this.previousConfigState = {
                EntityName: this.Config.EntityName,
                ExtraFilter: this.Config.ExtraFilter,
                OrderBy: this.Config.OrderBy,
                MaxRows: this.Config.MaxRows,
                ParentField: this.Config.ParentField
            };
        }
        this.loadData();
    }

    public ngAfterViewInit(): void {
        this.log('[HierarchyTree:ngAfterViewInit] Initializing D3 Zoom & ResizeObserver. svgRef:', !!this.svgRef?.nativeElement, 'containerRect:', this.svgContainerRef?.nativeElement?.getBoundingClientRect());
        this.initD3Zoom();
        this.setupResizeObserver();
        if (this.AllNodes.length > 0) {
            this.log('[HierarchyTree:ngAfterViewInit] AllNodes already loaded (' + this.AllNodes.length + '), triggering renderTree');
            this.renderTree();
        }
    }

    public ngOnChanges(changes: SimpleChanges): void {
        this.log('[HierarchyTree:ngOnChanges] Changes detected:', Object.keys(changes));
        if (changes['Config'] && !changes['Config'].isFirstChange()) {
            this.initializeConfig();
            if (this.hasDataConfigChanged(this.Config)) {
                this.log('[HierarchyTree:ngOnChanges] Data config changed, triggering loadData');
                this.loadData();
            } else {
                const activeId = this.ActiveRecordID || this.Config?.ActiveRecordID;
                this.log('[HierarchyTree:ngOnChanges] Config changed but data identical, updating active node:', activeId);
                this.updateActiveNodeSelection(activeId);
            }
        } else if (changes['ActiveRecordID'] && !changes['ActiveRecordID'].isFirstChange()) {
            this.updateActiveNodeSelection(this.ActiveRecordID);
        } else if (changes['Data'] && !changes['Data'].isFirstChange()) {
            this.buildTreeFromData(this.Data || []);
        } else if (changes['FocusRecordID'] && !changes['FocusRecordID'].isFirstChange()) {
            this.setFocusRoot(this.FocusRecordID);
        } else if (changes['ZoomLevel'] && !changes['ZoomLevel'].isFirstChange() && this.ZoomLevel !== undefined) {
            this.setZoomLevel(this.ZoomLevel, true);
        }
    }

    private hasDataConfigChanged(newConfig?: HierarchyTreeConfig): boolean {
        if (!newConfig) return false;
        const prev = this.previousConfigState;
        const hasChanged =
            prev.EntityName !== newConfig.EntityName ||
            prev.ExtraFilter !== newConfig.ExtraFilter ||
            prev.OrderBy !== newConfig.OrderBy ||
            prev.MaxRows !== newConfig.MaxRows ||
            prev.ParentField !== newConfig.ParentField;

        if (hasChanged) {
            this.previousConfigState = {
                EntityName: newConfig.EntityName,
                ExtraFilter: newConfig.ExtraFilter,
                OrderBy: newConfig.OrderBy,
                MaxRows: newConfig.MaxRows,
                ParentField: newConfig.ParentField
            };
        }
        return hasChanged;
    }

    private updateActiveNodeSelection(activeId?: string): void {
        if (!activeId) return;
        const activeNode = this.nodeMap.get(NormalizeUUID(activeId));
        if (activeNode && (!this.SelectedNode || !UUIDsEqual(this.SelectedNode.ID, activeNode.ID))) {
            for (const n of this.AllNodes) {
                n.IsSelected = UUIDsEqual(n.ID, activeNode.ID);
            }
            this.SelectedNode = activeNode;
            this.expandAncestors(activeNode);
            this.renderTree();
        }
    }

    public ngOnDestroy(): void {
        if (this.resizeObserver) {
            this.resizeObserver.disconnect();
        }
    }

    // --- Configuration Initialization ---
    private initializeConfig(): void {
        if (!this.Config) return;
        this.Config = {
            DefaultIcon: 'fa-solid fa-sitemap',
            DefaultColor: '#38bdf8',
            Orientation: 'top-to-bottom',
            NodeStyle: 'card',
            AllowDragDropReparent: false,
            AllowNodeActions: true,
            ShowSearch: true,
            ShowToolbar: true,
            NodeWidth: 230,
            NodeHeight: 90,
            SiblingSpacing: 40,
            LevelSpacing: 75,
            Height: '100%',
            MinHeight: '500px',
            NavigateOnNodeClick: true,
            AutoRootFocus: true,
            Verbose: false,
            ...this.Config
        };
    }

    private log(message: string, ...args: unknown[]): void {
        if (this.Config?.Verbose) {
            console.log(message, ...args);
        }
    }

    // --- Data Loading & Tree Construction ---

    /**
     * Loads records from the server via `RunView` using entity metadata.
     */
    public async loadData(): Promise<void> {
        if (!this.Config?.EntityName) return;

        this.Loading = true;
        this.ErrorMessage = null;
        this.cdr?.detectChanges();

        try {
            const md = new Metadata();
            const configEntityLower = this.Config.EntityName.toLowerCase();
            const configEntityStripped = this.Config.EntityName.replace(/^mj[:_\s]+/i, '').trim().toLowerCase();
            this.entityInfo = md.Entities.find((e) => {
                const eNameLower = e.Name.toLowerCase();
                const eNameStripped = e.Name.replace(/^mj[:_\s]+/i, '').trim().toLowerCase();
                return eNameLower === configEntityLower || eNameStripped === configEntityStripped;
            }) || null;

            const targetEntityName = this.entityInfo ? this.entityInfo.Name : this.Config.EntityName;
            this.log('[HierarchyTree:loadData] Starting load for:', targetEntityName, {
                configuredEntity: this.Config.EntityName,
                resolvedEntity: this.entityInfo?.Name,
                activeRecordId: this.ActiveRecordID || this.Config?.ActiveRecordID,
                focusRecordId: this.FocusRecordID || this.Config?.FocusRecordID,
                extraFilter: this.Config.ExtraFilter
            });

            if (this.Data) {
                this.log('[HierarchyTree:loadData] Using provided Data prop:', this.Data.length, 'items');
                this.buildTreeFromData(this.Data);
                return;
            }

            const rv = new RunView();
            const rvParams = {
                EntityName: targetEntityName,
                ExtraFilter: this.Config.ExtraFilter || '',
                OrderBy: this.Config.OrderBy || 'Name ASC',
                ResultType: 'simple' as const,
                MaxRows: this.Config.MaxRows ?? 0
            };
            this.log('[HierarchyTree:loadData] Calling RunView with params:', rvParams);
            const result = await rv.RunView(rvParams);

            this.log('[HierarchyTree:loadData] RunView response:', {
                success: result.Success,
                rowCount: result.RowCount,
                resultsLength: result.Results?.length,
                errorMessage: result.ErrorMessage,
                sampleRow: result.Results?.[0]
            });

            if (!result.Success) {
                this.ErrorMessage = result.ErrorMessage || 'Failed to load hierarchy data.';
                return;
            }

            const rawItems = (result.Results as Record<string, unknown>[]) || [];
            this.buildTreeFromData(rawItems);
        } catch (err) {
            this.ErrorMessage = err instanceof Error ? err.message : 'Error loading hierarchy tree.';
            console.error('[HierarchyTree:loadData] Error:', err);
        } finally {
            this.Loading = false;
            this.cdr?.detectChanges();
            setTimeout(() => {
                this.renderTree();
                this.fitToScreen(false);
            }, 80);
        }
    }

    /**
     * Helper to retrieve a property value from a record item in a case-insensitive manner.
     */
    private getItemValue(item: Record<string, unknown>, fieldName?: string): unknown {
        if (!item || !fieldName) return undefined;
        if (item[fieldName] !== undefined) return item[fieldName];
        const lower = fieldName.toLowerCase();
        for (const [k, v] of Object.entries(item)) {
            if (k.toLowerCase() === lower) return v;
        }
        return undefined;
    }

    /**
     * Constructs the in-memory tree nodes, computes composite keys, descendant counts, and depths.
     */
    public buildTreeFromData(items: Record<string, unknown>[]): void {
        this.nodeMap.clear();
        this.AllNodes = [];

        const parentFieldName = this.resolveParentFieldName();
        const nameFieldName = this.resolveNameFieldName();
        const subtitleFieldName = this.Config?.SubtitleField;
        const iconFieldName = this.Config?.IconField;
        const colorFieldName = this.Config?.ColorField;

        this.log(`[HierarchyTree:buildTreeFromData] Input items: ${items.length}, parentField="${parentFieldName}", nameField="${nameFieldName}"`);

        // 1. Create flat nodes
        for (const item of items) {
            const { pk, id } = this.extractPrimaryKey(item);
            const parentVal = this.getItemValue(item, parentFieldName);
            const parentId = parentVal != null && String(parentVal).trim() !== '' ? String(parentVal) : null;

            const nameVal = this.getItemValue(item, nameFieldName) ?? this.getItemValue(item, 'Name') ?? 'Unnamed';
            const name = String(nameVal);
            const subtitleVal = this.getItemValue(item, subtitleFieldName);
            const subtitle = subtitleVal != null ? String(subtitleVal) : undefined;
            const iconVal = this.getItemValue(item, iconFieldName);
            const icon = iconVal != null ? String(iconVal) : this.Config.DefaultIcon;
            const colorVal = this.getItemValue(item, colorFieldName);
            const color = colorVal != null ? String(colorVal) : this.Config.DefaultColor;

            const node: HierarchyNodeData = {
                ID: id,
                PrimaryKey: pk,
                Name: name,
                Subtitle: subtitle || undefined,
                Icon: icon,
                Color: color,
                ParentID: parentId,
                DirectChildCount: 0,
                TotalDescendantCount: 0,
                Depth: 0,
                IsExpanded: true,
                IsSelected: false,
                IsHighlighted: false,
                IsFocusRoot: false,
                Record: item,
                Children: []
            };

            this.nodeMap.set(NormalizeUUID(id), node);
            this.AllNodes.push(node);
        }

        // 2. Build parent-child relationships and detect cycles
        const roots: HierarchyNodeData[] = [];
        for (const node of this.AllNodes) {
            if (node.ParentID && this.nodeMap.has(NormalizeUUID(node.ParentID))) {
                const parentNode = this.nodeMap.get(NormalizeUUID(node.ParentID))!;
                if (!this.wouldCreateCycle(node, parentNode)) {
                    parentNode.Children.push(node);
                } else {
                    console.warn(`[HierarchyTree] Circular reference detected between ${node.ID} and ${parentNode.ID}. Promoting to root.`);
                    roots.push(node);
                }
            } else {
                roots.push(node);
            }
        }

        // 3. Compute counts and depths
        for (const root of roots) {
            this.computeSubtreeMetrics(root, 0);
        }

        // 4. Preserve _allChildren for collapse/expand
        for (const node of this.AllNodes) {
            node._allChildren = [...node.Children];
        }

        this.RootNodes = roots;
        this.log(`[HierarchyTree:buildTreeFromData] Built ${this.AllNodes.length} nodes, ${roots.length} root(s):`, roots.map(r => ({ Name: r.Name, ID: r.ID, Children: r.Children.length, TotalDescendants: r.TotalDescendantCount })));

        // 5. Apply active record selection & auto-expand ancestors
        const activeId = this.ActiveRecordID || this.Config?.ActiveRecordID;
        if (activeId) {
            const activeNode = this.nodeMap.get(NormalizeUUID(activeId));
            if (activeNode) {
                activeNode.IsSelected = true;
                activeNode.IsHighlighted = true;
                this.SelectedNode = activeNode;
                // Expand all ancestors so the active node is visible in full context
                let curr = activeNode.ParentID ? this.nodeMap.get(NormalizeUUID(activeNode.ParentID)) : undefined;
                while (curr) {
                    curr.IsExpanded = true;
                    curr.Children = [...(curr._allChildren || [])];
                    curr = curr.ParentID ? this.nodeMap.get(NormalizeUUID(curr.ParentID)) : undefined;
                }

                // If AutoRootFocus is enabled and multiple roots exist, focus on the active root tree
                if (this.Config.AutoRootFocus !== false && roots.length > 1 && !this.FocusRecordID && !this.Config.FocusRecordID) {
                    let rootAncestor = activeNode;
                    while (rootAncestor.ParentID && this.nodeMap.has(NormalizeUUID(rootAncestor.ParentID))) {
                        rootAncestor = this.nodeMap.get(NormalizeUUID(rootAncestor.ParentID))!;
                    }
                    rootAncestor.IsFocusRoot = true;
                    this.FocusedNode = rootAncestor;
                }
            }
        }

        // 6. Apply initial expand depth if configured (and not explicitly expanded by active node)
        if (this.Config.InitialExpandDepth && this.Config.InitialExpandDepth > 0 && !activeId) {
            for (const node of this.AllNodes) {
                if (node.Depth >= this.Config.InitialExpandDepth) {
                    node.IsExpanded = false;
                    node.Children = [];
                }
            }
        }

        if (this.FocusRecordID || this.Config?.FocusRecordID) {
            this.setFocusRoot(this.FocusRecordID || this.Config?.FocusRecordID);
        }
    }

    private resolveParentFieldName(): string {
        if (this.Config?.ParentField) return this.Config.ParentField;
        if (this.entityInfo) {
            // Check self-referencing foreign keys
            const selfFk = this.entityInfo.Fields.find(
                (f) => f.RelatedEntity && f.RelatedEntity.toLowerCase() === this.entityInfo!.Name.toLowerCase()
            );
            if (selfFk) return selfFk.Name;
        }
        return 'ParentID';
    }

    private resolveNameFieldName(): string {
        if (this.Config?.NameField) return this.Config.NameField;
        if (this.entityInfo?.NameField) return this.entityInfo.NameField.Name;
        return 'Name';
    }

    private extractPrimaryKey(item: Record<string, unknown>): { pk: CompositeKey; id: string } {
        const pk = new CompositeKey();
        if (this.entityInfo && this.entityInfo.PrimaryKeys.length > 0) {
            for (const k of this.entityInfo.PrimaryKeys) {
                pk.KeyValuePairs.push({
                    FieldName: k.Name,
                    Value: this.getItemValue(item, k.Name)
                });
            }
        } else {
            pk.KeyValuePairs.push({
                FieldName: 'ID',
                Value: this.getItemValue(item, 'ID') ?? this.getItemValue(item, 'id') ?? ''
            });
        }
        const id = pk.KeyValuePairs.length === 1 ? String(pk.KeyValuePairs[0].Value) : pk.ToURLSegment();
        return { pk, id };
    }

    private wouldCreateCycle(node: HierarchyNodeData, proposedParent: HierarchyNodeData): boolean {
        let curr: HierarchyNodeData | undefined = proposedParent;
        while (curr) {
            if (UUIDsEqual(curr.ID, node.ID)) return true;
            curr = curr.ParentID ? this.nodeMap.get(NormalizeUUID(curr.ParentID)) : undefined;
        }
        return false;
    }

    private computeSubtreeMetrics(node: HierarchyNodeData, depth: number): number {
        node.Depth = depth;
        node.DirectChildCount = node.Children.length;
        let descendantCount = node.Children.length;

        for (const child of node.Children) {
            descendantCount += this.computeSubtreeMetrics(child, depth + 1);
        }

        node.TotalDescendantCount = descendantCount;
        return descendantCount;
    }

    // --- D3 Layout & Visual Rendering ---

    private initD3Zoom(): void {
        if (!this.svgRef?.nativeElement) return;

        this.svgSelection = d3.select(this.svgRef.nativeElement);
        this.gSelection = this.svgSelection.select<SVGGElement>('g.mj-hierarchy-canvas');

        this.zoomBehavior = d3.zoom<SVGSVGElement, unknown>()
            .scaleExtent([0.1, 4.0])
            .on('zoom', (event: d3.D3ZoomEvent<SVGSVGElement, unknown>) => {
                this.currentZoomTransform = event.transform;
                if (this.gSelection) {
                    this.gSelection.attr('transform', event.transform.toString());
                }
                if (event.sourceEvent != null) {
                    this.ZoomLevel = event.transform.k;
                    this.ZoomChange.emit(event.transform.k);
                }
            });

        this.svgSelection.call(this.zoomBehavior);
    }

    private setupResizeObserver(): void {
        if (!this.svgContainerRef?.nativeElement) return;

        this.resizeObserver = new ResizeObserver((entries) => {
            for (const entry of entries) {
                if (entry.contentRect.width > 50 && entry.contentRect.height > 50) {
                    if (this.AllNodes.length > 0) {
                        this.renderTree();
                    }
                }
            }
        });
        this.resizeObserver.observe(this.svgContainerRef.nativeElement);
    }

    /**
     * Computes the D3 hierarchy tree layout and updates the SVG rendering.
     */
    public renderTree(preserveTransform = false): void {
        if (!this.svgRef?.nativeElement || !this.gSelection) {
            if (this.svgRef?.nativeElement) {
                this.initD3Zoom();
            }
            if (!this.gSelection) {
                setTimeout(() => this.renderTree(preserveTransform), 30);
                return;
            }
        }

        // Reset positions across all nodes
        for (const n of this.AllNodes) {
            n.x = undefined;
            n.y = undefined;
        }

        const isVertical = this.Config.Orientation !== 'left-to-right';
        const nodeWidth = this.Config.NodeWidth || 230;
        const nodeHeight = this.Config.NodeHeight || 90;
        const siblingGap = this.Config.SiblingSpacing || 40;
        const levelGap = this.Config.LevelSpacing || 75;

        const activeRoots = this.FocusedNode ? [this.FocusedNode] : this.RootNodes;
        this.log(`[HierarchyTree:renderTree] Starting render for ${activeRoots.length} active root(s):`, activeRoots.map(r => r.Name));

        if (activeRoots.length === 0) {
            this.gSelection.selectAll('*').remove();
            return;
        }

        // 1. Create root hierarchy
        let rootHierarchy: d3.HierarchyNode<HierarchyNodeData>;
        if (activeRoots.length === 1) {
            rootHierarchy = d3.hierarchy(activeRoots[0], (d) => (d.IsExpanded ? d.Children : []));
        } else {
            // Multiple roots: wrap under a synthetic virtual root
            const virtualRoot: HierarchyNodeData = {
                ID: '__virtual_root__',
                PrimaryKey: new CompositeKey(),
                Name: 'Root',
                DirectChildCount: activeRoots.length,
                TotalDescendantCount: activeRoots.length,
                Depth: -1,
                IsExpanded: true,
                IsSelected: false,
                IsHighlighted: false,
                IsFocusRoot: false,
                Children: activeRoots
            };
            rootHierarchy = d3.hierarchy(virtualRoot, (d) => (d.IsExpanded ? d.Children : []));
        }

        // 2. Compute tree layout
        const treeLayout = d3.tree<HierarchyNodeData>()
            .nodeSize(isVertical ? [nodeWidth + siblingGap, nodeHeight + levelGap] : [nodeHeight + siblingGap, nodeWidth + levelGap])
            .separation((a, b) => (a.parent === b.parent ? 1.05 : 1.2));

        const treeData = treeLayout(rootHierarchy);

        // Filter out virtual root if multi-root
        const nodes = treeData.descendants().filter((d) => d.data.ID !== '__virtual_root__');
        const links = treeData.links().filter((d) => d.source.data.ID !== '__virtual_root__');

        // Update positions on node data (centered on D3 node point)
        for (const n of nodes) {
            n.data.x = isVertical ? n.x - nodeWidth / 2 : n.y;
            n.data.y = isVertical ? n.y : n.x - nodeHeight / 2;
        }

        this.log(`[HierarchyTree:renderTree] Tree layout computed: ${nodes.length} nodes, ${links.length} links. Node positions:`, nodes.map(n => ({ Name: n.data.Name, x: n.data.x, y: n.data.y })));

        // 3. Render Links
        const linkPathGen = (d: d3.HierarchyLink<HierarchyNodeData>): string => {
            const sx = isVertical ? d.source.data.x! + nodeWidth / 2 : d.source.data.x! + nodeWidth;
            const sy = isVertical ? d.source.data.y! + nodeHeight : d.source.data.y! + nodeHeight / 2;
            const tx = isVertical ? d.target.data.x! + nodeWidth / 2 : d.target.data.x!;
            const ty = isVertical ? d.target.data.y! : d.target.data.y! + nodeHeight / 2;

            if (isVertical) {
                const midY = (sy + ty) / 2;
                return `M ${sx} ${sy} C ${sx} ${midY}, ${tx} ${midY}, ${tx} ${ty}`;
            } else {
                const midX = (sx + tx) / 2;
                return `M ${sx} ${sy} C ${midX} ${sy}, ${midX} ${ty}, ${tx} ${ty}`;
            }
        };

        const linkGroup = this.gSelection.select<SVGGElement>('g.mj-links-group');
        const linkSelection = linkGroup.selectAll<SVGPathElement, d3.HierarchyLink<HierarchyNodeData>>('path.mj-tree-link')
            .data(links, (d) => `${d.source.data.ID}->${d.target.data.ID}`);

        linkSelection.exit().remove();

        linkSelection.enter()
            .append('path')
            .attr('class', 'mj-tree-link')
            .merge(linkSelection)
            .attr('d', linkPathGen)
            .attr('stroke', (d) => (d.target.data.IsHighlighted ? 'var(--mj-brand-primary, #38bdf8)' : 'var(--mj-border-default, #223254)'))
            .attr('stroke-width', (d) => (d.target.data.IsHighlighted ? 2.5 : 1.5))
            .attr('fill', 'none');

        this.AllNodes = [...this.AllNodes];
        this.cdr?.markForCheck();
        this.cdr?.detectChanges();
        if (!preserveTransform) {
            this.fitToScreen(true);
        }
    }

    // --- Interactive Actions ---

    /**
     * Toggles the expand/collapse state of a node, firing cancelable Before and After events.
     */
    public toggleNodeExpansion(node: HierarchyNodeData, event?: MouseEvent): void {
        if (event) event.stopPropagation();

        if (node.IsExpanded) {
            const beforeEvt = new CancelableHierarchyNodeEvent(node, event);
            this.BeforeNodeCollapse.emit(beforeEvt);
            if (beforeEvt.IsCanceled) return;

            node.IsExpanded = false;
            node.Children = [];
            this.AfterNodeCollapse.emit({ Node: node, OriginalEvent: event });
        } else {
            const beforeEvt = new CancelableHierarchyNodeEvent(node, event);
            this.BeforeNodeExpand.emit(beforeEvt);
            if (beforeEvt.IsCanceled) return;

            node.IsExpanded = true;
            node.Children = [...(node._allChildren || [])];
            this.AfterNodeExpand.emit({ Node: node, OriginalEvent: event });
        }

        this.renderTree(true);
    }

    public closeDetailsDrawer(): void {
        this.ShowDetailsDrawer = false;
        this.cdr?.markForCheck();
    }

    public openDetailsDrawer(): void {
        this.ShowDetailsDrawer = true;
        this.cdr?.markForCheck();
    }

    public onCanvasBackgroundClick(event: MouseEvent): void {
        const target = event.target as HTMLElement;
        if (target?.closest('.mj-details-drawer') || target?.closest('.mj-node-card') || target?.closest('.mj-tool-btn')) {
            return;
        }
    }

    public onNodeClick(node: HierarchyNodeData, event: MouseEvent): void {
        event.stopPropagation();
        this.SelectedNode = node;
        this.ShowDetailsDrawer = true;
        for (const n of this.AllNodes) {
            n.IsSelected = UUIDsEqual(n.ID, node.ID);
        }
        this.NodeClick.emit({ Node: node, OriginalEvent: event });
        this.NodeSelect.emit({ Node: node, OriginalEvent: event });
        this.cdr?.markForCheck();
    }

    public onNodeDoubleClick(node: HierarchyNodeData, event: MouseEvent): void {
        event.stopPropagation();
        this.NodeDoubleClick.emit({ Node: node, OriginalEvent: event });
        this.navigateToRecord(node, event);
    }

    public onNodeAction(node: HierarchyNodeData, action: string, event: MouseEvent): void {
        event.stopPropagation();
        this.NodeAction.emit({ Node: node, Action: action });

        switch (action) {
            case 'open':
                this.navigateToRecord(node, event);
                break;
            case 'focus':
                this.setFocusRoot(node.ID);
                break;
            case 'reset-focus':
                this.resetFocus();
                break;
            case 'add-child':
                // Handled via custom subscriber or event
                break;
        }
    }

    public navigateToRecord(node: HierarchyNodeData, event?: MouseEvent): void {
        const entityName = this.entityInfo ? this.entityInfo.Name : this.Config.EntityName;
        const navEvent: RecordNavigationEvent = {
            Kind: 'record',
            EntityName: entityName,
            PrimaryKey: node.PrimaryKey,
            OpenInNewTab: event ? event.ctrlKey || event.metaKey : false
        };
        this.Navigate.emit(navEvent);
    }

    public getRecordAttributeEntries(record: Record<string, unknown>): { key: string; label: string; value: string }[] {
        const entries: { key: string; label: string; value: string }[] = [];
        const skipFields = new Set([
            'id', 'parentid', 'parentproductcategoryid', 'parentcategoryid',
            'companyid', '__mj_version', 'createdat', 'updatedat', 'name'
        ]);

        for (const [k, v] of Object.entries(record)) {
            if (skipFields.has(k.toLowerCase()) || k.startsWith('__mj_') || v == null) continue;
            const strVal = typeof v === 'object' ? JSON.stringify(v) : String(v);
            if (strVal.trim() === '') continue;
            entries.push({
                key: k,
                label: k.replace(/([A-Z])/g, ' $1').trim(),
                value: strVal
            });
        }
        return entries.slice(0, 8);
    }

    // --- Search & Highlight ---

    public onSearchInput(): void {
        const q = this.SearchQuery.trim().toLowerCase();
        if (!q) {
            for (const n of this.AllNodes) {
                n.IsHighlighted = false;
            }
            this.MatchingNodeCount = 0;
            this.renderTree(true);
            return;
        }

        let count = 0;
        let firstMatch: HierarchyNodeData | null = null;
        for (const n of this.AllNodes) {
            const matches = n.Name.toLowerCase().includes(q) || (n.Subtitle && n.Subtitle.toLowerCase().includes(q));
            n.IsHighlighted = !!matches;
            if (matches) {
                count++;
                if (!firstMatch) firstMatch = n;
                this.expandAncestors(n);
            }
        }

        this.MatchingNodeCount = count;
        this.renderTree(true);

        if (firstMatch && firstMatch.x != null && firstMatch.y != null) {
            this.centerOnNode(firstMatch);
        }
    }

    public clearSearch(): void {
        this.SearchQuery = '';
        this.onSearchInput();
    }

    public centerOnNode(node: HierarchyNodeData): void {
        if (!this.svgSelection || !this.zoomBehavior || node.x == null || node.y == null) return;
        const container = this.svgContainerRef?.nativeElement;
        const width = container?.clientWidth || 800;
        const height = container?.clientHeight || 500;
        const currentScale = this.currentZoomTransform?.k || 1;
        const nodeWidth = this.Config.NodeWidth || 230;
        const nodeHeight = this.Config.NodeHeight || 90;

        const nodeCenterX = node.x + nodeWidth / 2;
        const nodeCenterY = node.y + nodeHeight / 2;

        const tx = width / 2 - nodeCenterX * currentScale;
        const ty = height / 2 - nodeCenterY * currentScale;

        const target = d3.zoomIdentity.translate(tx, ty).scale(currentScale);
        this.svgSelection.transition().duration(400).call(this.zoomBehavior.transform, target);
    }

    private expandAncestors(node: HierarchyNodeData): void {
        let curr = node.ParentID ? this.nodeMap.get(NormalizeUUID(node.ParentID)) : undefined;
        while (curr) {
            curr.IsExpanded = true;
            curr.Children = [...(curr._allChildren || [])];
            curr = curr.ParentID ? this.nodeMap.get(NormalizeUUID(curr.ParentID)) : undefined;
        }
    }

    // --- Subtree Focus ---

    public setFocusRoot(recordId?: string): void {
        if (!recordId) {
            this.resetFocus();
            return;
        }

        const target = this.nodeMap.get(NormalizeUUID(recordId));
        if (!target) return;

        for (const n of this.AllNodes) n.IsFocusRoot = false;
        target.IsFocusRoot = true;
        this.FocusedNode = target;
        this.renderTree();
        this.fitToScreen();
    }

    public resetFocus(): void {
        for (const n of this.AllNodes) n.IsFocusRoot = false;
        this.FocusedNode = null;
        this.renderTree();
        this.fitToScreen();
    }

    // --- Toolbar Actions / Verbs ---

    public expandAll(): void {
        for (const n of this.AllNodes) {
            n.IsExpanded = true;
            n.Children = [...(n._allChildren || [])];
        }
        this.renderTree(true);
    }

    public collapseAll(): void {
        for (const n of this.AllNodes) {
            if (n.Depth > 0) {
                n.IsExpanded = false;
                n.Children = [];
            }
        }
        this.renderTree(true);
    }

    public zoomIn(): void {
        if (!this.svgSelection || !this.zoomBehavior) return;
        const currentScale = this.currentZoomTransform?.k || 1;
        const targetScale = Math.min(currentScale * 1.25, 4.0);
        this.setZoomLevel(targetScale, true);
        this.ZoomLevel = targetScale;
        this.ZoomChange.emit(targetScale);
    }

    public zoomOut(): void {
        if (!this.svgSelection || !this.zoomBehavior) return;
        const currentScale = this.currentZoomTransform?.k || 1;
        const targetScale = Math.max(currentScale * 0.8, 0.1);
        this.setZoomLevel(targetScale, true);
        this.ZoomLevel = targetScale;
        this.ZoomChange.emit(targetScale);
    }

    public setZoomLevel(scale: number, animated = true): void {
        if (!this.svgSelection || !this.zoomBehavior || !scale) return;
        const container = this.svgContainerRef?.nativeElement;
        const width = container?.clientWidth || 800;
        const height = container?.clientHeight || 500;
        const current = this.currentZoomTransform || d3.zoomIdentity;
        const cx = width / 2;
        const cy = height / 2;
        const newX = cx - (cx - current.x) * (scale / (current.k || 1));
        const newY = cy - (cy - current.y) * (scale / (current.k || 1));
        const target = d3.zoomIdentity.translate(newX, newY).scale(scale);

        if (animated) {
            this.svgSelection.transition().duration(250).call(this.zoomBehavior.transform, target);
        } else {
            this.svgSelection.call(this.zoomBehavior.transform, target);
        }
    }

    public resetZoom(): void {
        if (!this.svgSelection || !this.zoomBehavior) return;
        this.fitToScreen(false, true);
    }

    public fitToScreen(immediate = false, forceAutoScale = false): void {
        if (!this.svgSelection || !this.zoomBehavior || !this.svgContainerRef?.nativeElement) return;

        const visibleNodes = this.AllNodes.filter((n) => n.x != null && n.y != null);
        if (visibleNodes.length === 0) return;

        const nodeWidth = this.Config.NodeWidth || 230;
        const nodeHeight = this.Config.NodeHeight || 90;

        let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
        for (const n of visibleNodes) {
            minX = Math.min(minX, n.x!);
            maxX = Math.max(maxX, n.x! + nodeWidth);
            minY = Math.min(minY, n.y!);
            maxY = Math.max(maxY, n.y! + nodeHeight);
        }

        const treeWidth = maxX - minX;
        const treeHeight = maxY - minY;
        const treeCenterX = (minX + maxX) / 2;
        const treeCenterY = (minY + maxY) / 2;

        const rect = this.svgContainerRef.nativeElement.getBoundingClientRect();
        const width = rect.width > 50 ? rect.width : (this.svgContainerRef.nativeElement.clientWidth || 800);
        const height = rect.height > 50 ? rect.height : (this.svgContainerRef.nativeElement.clientHeight || 500);
        const padding = 40;

        const availWidth = Math.max(width - padding * 2, 100);
        const availHeight = Math.max(height - padding * 2, 100);
        const autoScale = Math.max(
            Math.min(
                availWidth / treeWidth,
                availHeight / treeHeight,
                1.05
            ),
            0.15
        );

        const scale = (forceAutoScale || !this.ZoomLevel) ? autoScale : this.ZoomLevel;

        if (forceAutoScale) {
            this.ZoomLevel = autoScale;
            this.ZoomChange.emit(autoScale);
        }

        const tx = width / 2 - treeCenterX * scale;
        const ty = height / 2 - treeCenterY * scale;

        const targetTransform = d3.zoomIdentity.translate(tx, ty).scale(scale);

        this.log(`[HierarchyTree:fitToScreen] Container=${width}x${height}, visibleNodes=${visibleNodes.length}, bounds=[${minX.toFixed(1)}, ${minY.toFixed(1)}] to [${maxX.toFixed(1)}, ${maxY.toFixed(1)}] (${treeWidth.toFixed(1)}x${treeHeight.toFixed(1)}), autoScale=${autoScale.toFixed(3)}, usingScale=${scale.toFixed(3)}, translate=(${tx.toFixed(1)}, ${ty.toFixed(1)})`);

        if (immediate) {
            this.svgSelection.call(this.zoomBehavior.transform, targetTransform);
        } else {
            this.svgSelection.transition().duration(350).call(this.zoomBehavior.transform, targetTransform);
        }
    }

    public exportAsSVG(): string {
        return this.svgRef?.nativeElement ? this.svgRef.nativeElement.outerHTML : '';
    }

    public async refresh(): Promise<void> {
        await this.loadData();
    }
}
