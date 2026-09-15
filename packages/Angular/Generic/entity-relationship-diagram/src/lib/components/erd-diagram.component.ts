/**
 * @module erd-diagram.component
 * @description
 * Schema-grouped Entity Relationship Diagram.  Each schema becomes a rounded
 * rectangular band; entities tile in a grid within the band.  Click a node to
 * enter focus mode (neighbours highlighted, everything else dimmed) and see a
 * floating details card with its inbound and outbound FKs.
 *
 * The component is pure Angular + SVG (no D3, no Dagre).  Layout is computed
 * by a pure function in `../layout/compute-erd-layout.ts` that is easily
 * unit-tested.
 *
 * Public API is preserved from the previous D3-based implementation so
 * existing consumers (Database Designer wizard preview, admin ERD dashboard,
 * Entity Record view) continue to work without changes.
 */

import {
    Component,
    Input,
    Output,
    EventEmitter,
    ElementRef,
    ViewChild,
    HostBinding,
    ChangeDetectionStrategy,
    ChangeDetectorRef,
    AfterViewInit,
    OnDestroy,
    OnChanges,
    SimpleChanges,
    inject,
} from '@angular/core';
import {
    ERDNode,
    ERDField,
    ERDLink,
    ERDConfig,
    ERDNodeClickEvent,
    ERDNodeDoubleClickEvent,
    ERDLinkClickEvent,
    ERDZoomEvent,
    ERDState,
    ERDNodeHoverEvent,
    ERDLinkHoverEvent,
    ERDNodeContextMenuEvent,
    ERDLinkContextMenuEvent,
    ERDDiagramContextMenuEvent,
    ERDNodeDragEvent,
} from '../interfaces/erd-types';
import {
    ComputeErdLayout,
    PointsToPath,
    GetNeighbors,
    type ErdLayout,
    type LaidOutNode,
    type LaidOutEdge,
    type LaidOutBand,
} from '../layout/compute-erd-layout';
import { ComputeDagreLayout } from '../layout/compute-dagre-layout';

// ──────────────────────────────────────────────────────────────────────────
// Internal view-model types
// ──────────────────────────────────────────────────────────────────────────

interface SchemaChip {
    name: string;
    count: number;
    active: boolean;
}

/** 2D transform (pan x/y + zoom scale) for the SVG stage. */
interface Transform {
    x: number;
    y: number;
    k: number;
}

@Component({
    standalone: false,
    selector: 'mj-erd-diagram',
    templateUrl: './erd-diagram.component.html',
    styleUrls: ['./erd-diagram.component.css'],
    changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ERDDiagramComponent implements AfterViewInit, OnDestroy, OnChanges {

    private readonly cdr = inject(ChangeDetectorRef);
    private readonly host = inject(ElementRef);

    // ─── INPUTS ───────────────────────────────────────────────────────────

    @Input() public Nodes: ERDNode[] = [];

    /** @deprecated Use {@link Nodes}. */
    @Input() public set nodes(value: ERDNode[]) {
        this.Nodes = value;
    }
    /** @deprecated Use {@link Nodes}. */
    public get nodes(): ERDNode[] {
        return this.Nodes;
    }
    @Input() public SelectedNodeId: string | null = null;

    /** @deprecated Use {@link SelectedNodeId}. */
    @Input() public set selectedNodeId(value: string | null) {
        this.SelectedNodeId = value;
    }
    /** @deprecated Use {@link SelectedNodeId}. */
    public get selectedNodeId(): string | null {
        return this.SelectedNodeId;
    }
    @Input() public HighlightedNodeIds: string[] = [];

    /** @deprecated Use {@link HighlightedNodeIds}. */
    @Input() public set highlightedNodeIds(value: string[]) {
        this.HighlightedNodeIds = value;
    }
    /** @deprecated Use {@link HighlightedNodeIds}. */
    public get highlightedNodeIds(): string[] {
        return this.HighlightedNodeIds;
    }
    @Input() public FocusNodeId: string | null = null;

    /** @deprecated Use {@link FocusNodeId}. */
    @Input() public set focusNodeId(value: string | null) {
        this.FocusNodeId = value;
    }
    /** @deprecated Use {@link FocusNodeId}. */
    public get focusNodeId(): string | null {
        return this.FocusNodeId;
    }
    @Input() public FocusDepth = 1;

    /** @deprecated Use {@link FocusDepth}. */
    @Input() public set focusDepth(value: ERDDiagramComponent['FocusDepth']) {
        this.FocusDepth = value;
    }
    /** @deprecated Use {@link FocusDepth}. */
    public get focusDepth(): ERDDiagramComponent['FocusDepth'] {
        return this.FocusDepth;
    }
    @Input() public IsRefreshing = false;

    /** @deprecated Use {@link IsRefreshing}. */
    @Input() public set isRefreshing(value: ERDDiagramComponent['IsRefreshing']) {
        this.IsRefreshing = value;
    }
    /** @deprecated Use {@link IsRefreshing}. */
    public get isRefreshing(): ERDDiagramComponent['IsRefreshing'] {
        return this.IsRefreshing;
    }
    @Input() public ReadOnly = false;

    /** @deprecated Use {@link ReadOnly}. */
    @Input() public set readOnly(value: ERDDiagramComponent['ReadOnly']) {
        this.ReadOnly = value;
    }
    /** @deprecated Use {@link ReadOnly}. */
    public get readOnly(): ERDDiagramComponent['ReadOnly'] {
        return this.ReadOnly;
    }
    @Input() public config: ERDConfig = {};
    @Input() public ShowHeader = true;

    /** @deprecated Use {@link ShowHeader}. */
    @Input() public set showHeader(value: ERDDiagramComponent['ShowHeader']) {
        this.ShowHeader = value;
    }
    /** @deprecated Use {@link ShowHeader}. */
    public get showHeader(): ERDDiagramComponent['ShowHeader'] {
        return this.ShowHeader;
    }
    @Input() public HeaderTitle = 'Entity Relationship Diagram';

    /** @deprecated Use {@link HeaderTitle}. */
    @Input() public set headerTitle(value: ERDDiagramComponent['HeaderTitle']) {
        this.HeaderTitle = value;
    }
    /** @deprecated Use {@link HeaderTitle}. */
    public get headerTitle(): ERDDiagramComponent['HeaderTitle'] {
        return this.HeaderTitle;
    }

    // ─── OUTPUTS (preserved from legacy API) ──────────────────────────────

    @Output() public NodeClick = new EventEmitter<ERDNodeClickEvent>();

    /**
     * @deprecated Use {@link NodeClick}.
     *
     * The same emitter under the old binding name, so a template still binding
     * (nodeClick) keeps working. Must stay AFTER NodeClick: class fields
     * initialise in order, and the other way round this captures undefined.
     */
    @Output() public nodeClick = this.NodeClick;
    @Output() public NodeDoubleClick = new EventEmitter<ERDNodeDoubleClickEvent>();

    /**
     * @deprecated Use {@link NodeDoubleClick}.
     *
     * The same emitter under the old binding name, so a template still binding
     * (nodeDoubleClick) keeps working. Must stay AFTER NodeDoubleClick: class fields
     * initialise in order, and the other way round this captures undefined.
     */
    @Output() public nodeDoubleClick = this.NodeDoubleClick;
    @Output() public NodeSelected = new EventEmitter<ERDNode>();

    /**
     * @deprecated Use {@link NodeSelected}.
     *
     * The same emitter under the old binding name, so a template still binding
     * (nodeSelected) keeps working. Must stay AFTER NodeSelected: class fields
     * initialise in order, and the other way round this captures undefined.
     */
    @Output() public nodeSelected = this.NodeSelected;
    @Output() public NodeDeselected = new EventEmitter<void>();

    /**
     * @deprecated Use {@link NodeDeselected}.
     *
     * The same emitter under the old binding name, so a template still binding
     * (nodeDeselected) keeps working. Must stay AFTER NodeDeselected: class fields
     * initialise in order, and the other way round this captures undefined.
     */
    @Output() public nodeDeselected = this.NodeDeselected;
    @Output() public LinkClick = new EventEmitter<ERDLinkClickEvent>();

    /**
     * @deprecated Use {@link LinkClick}.
     *
     * The same emitter under the old binding name, so a template still binding
     * (linkClick) keeps working. Must stay AFTER LinkClick: class fields
     * initialise in order, and the other way round this captures undefined.
     */
    @Output() public linkClick = this.LinkClick;
    @Output() public NodeHover = new EventEmitter<ERDNodeHoverEvent>();

    /**
     * @deprecated Use {@link NodeHover}.
     *
     * The same emitter under the old binding name, so a template still binding
     * (nodeHover) keeps working. Must stay AFTER NodeHover: class fields
     * initialise in order, and the other way round this captures undefined.
     */
    @Output() public nodeHover = this.NodeHover;
    @Output() public NodeHoverEnd = new EventEmitter<ERDNode>();

    /**
     * @deprecated Use {@link NodeHoverEnd}.
     *
     * The same emitter under the old binding name, so a template still binding
     * (nodeHoverEnd) keeps working. Must stay AFTER NodeHoverEnd: class fields
     * initialise in order, and the other way round this captures undefined.
     */
    @Output() public nodeHoverEnd = this.NodeHoverEnd;
    @Output() public LinkHover = new EventEmitter<ERDLinkHoverEvent>();

    /**
     * @deprecated Use {@link LinkHover}.
     *
     * The same emitter under the old binding name, so a template still binding
     * (linkHover) keeps working. Must stay AFTER LinkHover: class fields
     * initialise in order, and the other way round this captures undefined.
     */
    @Output() public linkHover = this.LinkHover;
    @Output() public LinkHoverEnd = new EventEmitter<ERDLink>();

    /**
     * @deprecated Use {@link LinkHoverEnd}.
     *
     * The same emitter under the old binding name, so a template still binding
     * (linkHoverEnd) keeps working. Must stay AFTER LinkHoverEnd: class fields
     * initialise in order, and the other way round this captures undefined.
     */
    @Output() public linkHoverEnd = this.LinkHoverEnd;
    @Output() public NodeContextMenu = new EventEmitter<ERDNodeContextMenuEvent>();

    /**
     * @deprecated Use {@link NodeContextMenu}.
     *
     * The same emitter under the old binding name, so a template still binding
     * (nodeContextMenu) keeps working. Must stay AFTER NodeContextMenu: class fields
     * initialise in order, and the other way round this captures undefined.
     */
    @Output() public nodeContextMenu = this.NodeContextMenu;
    @Output() public LinkContextMenu = new EventEmitter<ERDLinkContextMenuEvent>();

    /**
     * @deprecated Use {@link LinkContextMenu}.
     *
     * The same emitter under the old binding name, so a template still binding
     * (linkContextMenu) keeps working. Must stay AFTER LinkContextMenu: class fields
     * initialise in order, and the other way round this captures undefined.
     */
    @Output() public linkContextMenu = this.LinkContextMenu;
    @Output() public DiagramContextMenu = new EventEmitter<ERDDiagramContextMenuEvent>();

    /**
     * @deprecated Use {@link DiagramContextMenu}.
     *
     * The same emitter under the old binding name, so a template still binding
     * (diagramContextMenu) keeps working. Must stay AFTER DiagramContextMenu: class fields
     * initialise in order, and the other way round this captures undefined.
     */
    @Output() public diagramContextMenu = this.DiagramContextMenu;
    @Output() public NodeDragStart = new EventEmitter<ERDNodeDragEvent>();

    /**
     * @deprecated Use {@link NodeDragStart}.
     *
     * The same emitter under the old binding name, so a template still binding
     * (nodeDragStart) keeps working. Must stay AFTER NodeDragStart: class fields
     * initialise in order, and the other way round this captures undefined.
     */
    @Output() public nodeDragStart = this.NodeDragStart;
    @Output() public NodeDragEnd = new EventEmitter<ERDNodeDragEvent>();

    /**
     * @deprecated Use {@link NodeDragEnd}.
     *
     * The same emitter under the old binding name, so a template still binding
     * (nodeDragEnd) keeps working. Must stay AFTER NodeDragEnd: class fields
     * initialise in order, and the other way round this captures undefined.
     */
    @Output() public nodeDragEnd = this.NodeDragEnd;
    @Output() public ZoomChange = new EventEmitter<ERDZoomEvent>();

    /**
     * @deprecated Use {@link ZoomChange}.
     *
     * The same emitter under the old binding name, so a template still binding
     * (zoomChange) keeps working. Must stay AFTER ZoomChange: class fields
     * initialise in order, and the other way round this captures undefined.
     */
    @Output() public zoomChange = this.ZoomChange;
    @Output() public RefreshRequested = new EventEmitter<void>();

    /**
     * @deprecated Use {@link RefreshRequested}.
     *
     * The same emitter under the old binding name, so a template still binding
     * (refreshRequested) keeps working. Must stay AFTER RefreshRequested: class fields
     * initialise in order, and the other way round this captures undefined.
     */
    @Output() public refreshRequested = this.RefreshRequested;
    @Output() public LayoutComplete = new EventEmitter<void>();

    /**
     * @deprecated Use {@link LayoutComplete}.
     *
     * The same emitter under the old binding name, so a template still binding
     * (layoutComplete) keeps working. Must stay AFTER LayoutComplete: class fields
     * initialise in order, and the other way round this captures undefined.
     */
    @Output() public layoutComplete = this.LayoutComplete;
    @Output() public StateChange = new EventEmitter<ERDState>();

    /**
     * @deprecated Use {@link StateChange}.
     *
     * The same emitter under the old binding name, so a template still binding
     * (stateChange) keeps working. Must stay AFTER StateChange: class fields
     * initialise in order, and the other way round this captures undefined.
     */
    @Output() public stateChange = this.StateChange;

    // ─── VIEW CHILDREN ────────────────────────────────────────────────────

    @ViewChild('canvasRef', { static: false }) private canvasRef?: ElementRef<SVGSVGElement>;

    // ─── STATE ────────────────────────────────────────────────────────────

    /** Current pan + zoom. */
    public transform: Transform = { x: 0, y: 0, k: 1 };

    /** Set of schema names the user has filtered IN.  Null means "all". */
    public ActiveSchemas: Set<string> | null = null;

    /** @deprecated Use {@link ActiveSchemas}. */
    public get activeSchemas(): Set<string> | null {
        return this.ActiveSchemas;
    }
    /** @deprecated Use {@link ActiveSchemas}. */
    public set activeSchemas(value: Set<string> | null) {
        this.ActiveSchemas = value;
    }

    /** Search query string. */
    public SearchQuery = '';

    /** @deprecated Use {@link SearchQuery}. */
    public get searchQuery() {
        return this.SearchQuery;
    }
    /** @deprecated Use {@link SearchQuery}. */
    public set searchQuery(value) {
        this.SearchQuery = value;
    }

    /** Node IDs the user has clicked "+N more fields" on. */
    public expandedNodeIds = new Set<string>();

    /** Node currently being hovered (for highlight preview). */
    public HoverNodeId: string | null = null;

    /** @deprecated Use {@link HoverNodeId}. */
    public get hoverNodeId(): string | null {
        return this.HoverNodeId;
    }
    /** @deprecated Use {@link HoverNodeId}. */
    public set hoverNodeId(value: string | null) {
        this.HoverNodeId = value;
    }

    /** Cached layout — recomputed when nodes, filter, search or expansion changes. */
    public Layout: ErdLayout = { nodes: [], edges: [], bands: [], totalWidth: 0, totalHeight: 0 };

    /** @deprecated Use {@link Layout}. */
    public get layout(): ErdLayout {
        return this.Layout;
    }
    /** @deprecated Use {@link Layout}. */
    public set layout(value: ErdLayout) {
        this.Layout = value;
    }

    /**
     * Active layout algorithm.  Starts from `config.layoutAlgorithm` (default
     * `schema-grid`) but can be toggled at runtime via `setLayoutAlgorithm`.
     * Exposed so the chrome toggle + saved user state can drive it.
     */
    public ActiveLayout: 'schema-grid' | 'dagre' = 'schema-grid';

    /** @deprecated Use {@link ActiveLayout}. */
    public get activeLayout(): 'schema-grid' | 'dagre' {
        return this.ActiveLayout;
    }
    /** @deprecated Use {@link ActiveLayout}. */
    public set activeLayout(value: 'schema-grid' | 'dagre') {
        this.ActiveLayout = value;
    }

    /** Derived schema summary for the chip row. */
    public SchemaChips: SchemaChip[] = [];

    /** @deprecated Use {@link SchemaChips}. */
    public get schemaChips(): SchemaChip[] {
        return this.SchemaChips;
    }
    /** @deprecated Use {@link SchemaChips}. */
    public set schemaChips(value: SchemaChip[]) {
        this.SchemaChips = value;
    }

    /** Derived — number of entities currently visible. */
    public VisibleCount = 0;

    /** @deprecated Use {@link VisibleCount}. */
    public get visibleCount() {
        return this.VisibleCount;
    }
    /** @deprecated Use {@link VisibleCount}. */
    public set visibleCount(value) {
        this.VisibleCount = value;
    }

    /** Icon for the empty state — honours `config.emptyStateIcon` when provided. */
    public get EmptyStateIcon(): string {
        return this.config.emptyStateIcon || 'fa-solid fa-diagram-project';
    }

    /** @deprecated Use {@link EmptyStateIcon}. */
    public get emptyStateIcon(): string {
        return this.EmptyStateIcon;
    }

    /** Title for the empty state — distinguishes "nothing here" from "filtered to nothing". */
    public get EmptyStateTitle(): string {
        return this.TotalCount === 0
            ? (this.config.emptyStateMessage || 'No entities to display')
            : 'No entities match';
    }

    /** @deprecated Use {@link EmptyStateTitle}. */
    public get emptyStateTitle(): string {
        return this.EmptyStateTitle;
    }

    /** Derived — total entities in the input, before any filtering. */
    public TotalCount = 0;

    /** @deprecated Use {@link TotalCount}. */
    public get totalCount() {
        return this.TotalCount;
    }
    /** @deprecated Use {@link TotalCount}. */
    public set totalCount(value) {
        this.TotalCount = value;
    }

    /** Derived — the Set of IDs in the focus/hover neighbourhood (null when no highlight active). */
    public HighlightSet: Set<string> | null = null;

    /** @deprecated Use {@link HighlightSet}. */
    public get highlightSet(): Set<string> | null {
        return this.HighlightSet;
    }
    /** @deprecated Use {@link HighlightSet}. */
    public set highlightSet(value: Set<string> | null) {
        this.HighlightSet = value;
    }

    /** Derived — the single selected entity, if any. */
    public SelectedEntity: ERDNode | null = null;

    /** @deprecated Use {@link SelectedEntity}. */
    public get selectedEntity(): ERDNode | null {
        return this.SelectedEntity;
    }
    /** @deprecated Use {@link SelectedEntity}. */
    public set selectedEntity(value: ERDNode | null) {
        this.SelectedEntity = value;
    }

    // Panning bookkeeping (not reactive).  Public so the template can bind a
    // cursor attribute to it; treat as internal state.
    public Panning = false;

    /** @deprecated Use {@link Panning}. */
    public get panning() {
        return this.Panning;
    }
    /** @deprecated Use {@link Panning}. */
    public set panning(value) {
        this.Panning = value;
    }
    private panStart: { x: number; y: number } | null = null;
    /** Raw mousedown coords — used to compute drag distance for the
     *  pan-vs-click threshold. */
    private dragOrigin: { clientX: number; clientY: number } | null = null;
    /** True once movement crossed the drag threshold — used to suppress
     *  the synthetic click that follows the mouseup. */
    private dragMoved = false;
    /** Pixels of movement before mousedown is treated as a drag. */
    private static readonly DRAG_THRESHOLD = 4;
    /** Bound window listeners — kept on the instance so we can detach. */
    private boundWindowMove?: (e: MouseEvent) => void;
    private boundWindowUp?: (e: MouseEvent) => void;

    private resizeObserver?: ResizeObserver;

    @HostBinding('class.erd-root') readonly rootClass = true;

    // ─── LIFECYCLE ────────────────────────────────────────────────────────

    public ngOnChanges(changes: SimpleChanges): void {
        const nodesChanged = !!changes['nodes'];
        // Compare config by the fields we actually use — consumers that bind
        // an inline `[config]="{...}"` object literal get a new reference
        // every CD cycle, so a naive `changes['config']` check would
        // recompute + refit endlessly.
        const configChanged = this.configAffectsLayout(
            changes['config']?.previousValue as ERDConfig | undefined,
            changes['config']?.currentValue as ERDConfig | undefined,
        );
        if (nodesChanged || configChanged) {
            if (nodesChanged) {
                this.ActiveSchemas = null;
                this.expandedNodeIds = new Set();
                this.HoverNodeId = null;
            }
            // Honour `config.layoutAlgorithm` on first arrival; runtime
            // changes happen via `setLayoutAlgorithm`.
            if (this.config.layoutAlgorithm === 'dagre') this.ActiveLayout = 'dagre';
            else if (this.config.layoutAlgorithm === 'schema-grid') this.ActiveLayout = 'schema-grid';
            this.recompute();
            // Fit-to-view once the DOM has the new canvas dimensions.
            queueMicrotask(() => this.FitToView());
        }
        if (changes['focusNodeId']) {
            this.updateHighlightSet();
            this.cdr.markForCheck();
        }
    }

    /** True iff any config field that influences the cached layout changed. */
    private configAffectsLayout(prev: ERDConfig | undefined, curr: ERDConfig | undefined): boolean {
        if (prev === curr) return false;
        return (
            (prev?.nodeWidth ?? null) !== (curr?.nodeWidth ?? null) ||
            (prev?.fieldHeight ?? null) !== (curr?.fieldHeight ?? null) ||
            (prev?.showAllFields ?? null) !== (curr?.showAllFields ?? null) ||
            (prev?.showSchemaBands ?? null) !== (curr?.showSchemaBands ?? null) ||
            (prev?.crowsFoot ?? null) !== (curr?.crowsFoot ?? null) ||
            (prev?.maxFitZoom ?? null) !== (curr?.maxFitZoom ?? null) ||
            (prev?.minZoom ?? null) !== (curr?.minZoom ?? null) ||
            (prev?.maxZoom ?? null) !== (curr?.maxZoom ?? null)
        );
    }

    public ngAfterViewInit(): void {
        this.resizeObserver = this.watchResize();
        this.recompute();
        queueMicrotask(() => this.FitToView());
    }

    public ngOnDestroy(): void {
        this.resizeObserver?.disconnect();
        // Detach any pan listeners still bound from an in-progress drag.
        if (this.boundWindowMove) window.removeEventListener('mousemove', this.boundWindowMove);
        if (this.boundWindowUp) window.removeEventListener('mouseup', this.boundWindowUp);
    }

    // ─── RECOMPUTATION ────────────────────────────────────────────────────

    /** Rebuild the layout + derived view-model from current inputs/state. */
    private recompute(): void {
        this.TotalCount = this.Nodes.length;

        const filteredBySchema = this.ActiveSchemas
            ? this.Nodes.filter(n => this.ActiveSchemas!.has(n.schemaName || '_'))
            : this.Nodes;

        const q = this.SearchQuery.trim().toLowerCase();
        const filtered = q
            ? filteredBySchema.filter(n =>
                n.name.toLowerCase().includes(q) ||
                (n.schemaName?.toLowerCase().includes(q) ?? false) ||
                n.fields.some(f => f.name.toLowerCase().includes(q)))
            : filteredBySchema;

        this.VisibleCount = filtered.length;

        const commonOpts = {
            nodeWidth: this.config.nodeWidth ?? 220,
            fieldHeight: this.config.fieldHeight ?? 22,
            expandedNodeIds: this.expandedNodeIds,
            showAllFields: this.config.showAllFields ?? false,
        };

        this.Layout = this.ActiveLayout === 'dagre'
            ? ComputeDagreLayout(filtered, {
                ...commonOpts,
                rankDir: this.config.dagreConfig?.rankDir ?? 'LR',
                nodeSep: this.config.dagreConfig?.nodeSep,
                rankSep: this.config.dagreConfig?.rankSep,
            })
            : ComputeErdLayout(filtered, commonOpts);

        this.SchemaChips = this.buildSchemaChips();
        this.updateHighlightSet();
        this.updateSelectedEntity();
        this.cdr.markForCheck();
    }

    /**
     * Switch between the schema-grid and dagre hierarchical layouts at
     * runtime.  Emits a state change so the consumer can persist the
     * user's preference (via `userStateChange` on `mj-erd-composite`).
     *
     * Also clears the current focus/selection — switching layouts moves
     * cards to entirely new positions, so the previously-selected entity
     * would otherwise stay highlighted in a different spot with the side
     * panel still open, which is jarring.  A clean slate is better.
     */
    public SetLayoutAlgorithm(algo: 'schema-grid' | 'dagre'): void {
        if (this.ActiveLayout === algo) return;
        this.ActiveLayout = algo;

        const hadSelection = !!(this.FocusNodeId || this.SelectedNodeId);
        this.FocusNodeId = null;
        this.SelectedNodeId = null;
        this.HoverNodeId = null;
        this.updateHighlightSet();
        this.updateSelectedEntity();
        if (hadSelection) this.NodeDeselected.emit();

        this.recompute();
        queueMicrotask(() => this.FitToView());
        this.StateChange.emit(this.GetState());
    }

    /** @deprecated Use {@link SetLayoutAlgorithm}. */
    public setLayoutAlgorithm(algo: 'schema-grid' | 'dagre'): void {
        return this.SetLayoutAlgorithm(algo);
    }

    private buildSchemaChips(): SchemaChip[] {
        const counts = new Map<string, number>();
        for (const n of this.Nodes) {
            const s = n.schemaName || '_';
            counts.set(s, (counts.get(s) ?? 0) + 1);
        }
        return [...counts.entries()]
            .sort(([a], [b]) => a.localeCompare(b))
            .map(([name, count]) => ({
                name,
                count,
                active: this.ActiveSchemas ? this.ActiveSchemas.has(name) : true,
            }));
    }

    private updateHighlightSet(): void {
        const id = this.FocusNodeId ?? this.HoverNodeId;
        this.HighlightSet = id ? GetNeighbors(this.Nodes, id) : null;
    }

    private updateSelectedEntity(): void {
        const id = this.FocusNodeId ?? this.SelectedNodeId;
        this.SelectedEntity = id ? this.Nodes.find(n => n.id === id) ?? null : null;
    }

    private watchResize(): ResizeObserver {
        const observer = new ResizeObserver(() => this.FitToView());
        observer.observe(this.host.nativeElement);
        return observer;
    }

    // ─── PAN / ZOOM / FIT ────────────────────────────────────────────────

    /**
     * Mousedown anywhere on the SVG (background OR a node card).  We
     * arm a potential pan and attach window-level move/up listeners so
     * the drag continues even if the cursor leaves the canvas (passes
     * over the focus card, scrollbars, the chrome, etc.).
     *
     * The actual `panning = true` flip happens in the move handler once
     * the cursor crosses `DRAG_THRESHOLD` — that way short clicks still
     * register as clicks on cards (no accidental selection-toggle from
     * a tiny mouse jitter).
     */
    public OnBackgroundMouseDown(e: MouseEvent): void {
        if (e.button !== 0) return;
        this.dragOrigin = { clientX: e.clientX, clientY: e.clientY };
        this.dragMoved = false;
        this.panStart = { x: e.clientX - this.transform.x, y: e.clientY - this.transform.y };

        this.boundWindowMove = (ev: MouseEvent) => this.onWindowMouseMove(ev);
        this.boundWindowUp = (ev: MouseEvent) => this.onWindowMouseUp(ev);
        window.addEventListener('mousemove', this.boundWindowMove);
        window.addEventListener('mouseup', this.boundWindowUp);
    }

    /** @deprecated Use {@link OnBackgroundMouseDown}. */
    public onBackgroundMouseDown(e: MouseEvent): void {
        return this.OnBackgroundMouseDown(e);
    }

    private onWindowMouseMove(e: MouseEvent): void {
        if (!this.dragOrigin || !this.panStart) return;

        if (!this.Panning) {
            const dx = e.clientX - this.dragOrigin.clientX;
            const dy = e.clientY - this.dragOrigin.clientY;
            if (Math.hypot(dx, dy) < ERDDiagramComponent.DRAG_THRESHOLD) return;
            this.Panning = true;
            this.dragMoved = true;
        }

        this.transform = {
            ...this.transform,
            x: e.clientX - this.panStart.x,
            y: e.clientY - this.panStart.y,
        };
        this.emitZoom();
        this.cdr.markForCheck();
    }

    private onWindowMouseUp(_e: MouseEvent): void {
        // If a drag actually happened, swallow the synthetic click that
        // browsers fire on mouseup so it doesn't reach the node click
        // handler and toggle the focus.  We use capture phase + once so
        // we only catch the immediate next click from this mouse-up.
        if (this.dragMoved) {
            const swallow = (ev: MouseEvent) => {
                ev.stopPropagation();
                ev.preventDefault();
            };
            window.addEventListener('click', swallow, { capture: true, once: true });
        }

        this.Panning = false;
        this.panStart = null;
        this.dragOrigin = null;
        this.dragMoved = false;

        if (this.boundWindowMove) {
            window.removeEventListener('mousemove', this.boundWindowMove);
            this.boundWindowMove = undefined;
        }
        if (this.boundWindowUp) {
            window.removeEventListener('mouseup', this.boundWindowUp);
            this.boundWindowUp = undefined;
        }
    }

    public OnWheel(e: WheelEvent): void {
        if (this.config.enableZoom === false) return;
        e.preventDefault();
        const svg = this.canvasRef?.nativeElement;
        if (!svg) return;
        const rect = svg.getBoundingClientRect();
        const mx = e.clientX - rect.left;
        const my = e.clientY - rect.top;
        const delta = -e.deltaY * 0.001;
        const minZoom = this.config.minZoom ?? 0.15;
        const maxZoom = this.config.maxZoom ?? 2.5;
        const newK = Math.max(minZoom, Math.min(maxZoom, this.transform.k * (1 + delta)));
        const ratio = newK / this.transform.k;
        this.transform = {
            k: newK,
            x: mx - (mx - this.transform.x) * ratio,
            y: my - (my - this.transform.y) * ratio,
        };
        this.emitZoom();
        this.cdr.markForCheck();
    }

    /** @deprecated Use {@link OnWheel}. */
    public onWheel(e: WheelEvent): void {
        return this.OnWheel(e);
    }

    public ZoomBy(factor: number): void {
        const svg = this.canvasRef?.nativeElement;
        if (!svg) return;
        const rect = svg.getBoundingClientRect();
        const mx = rect.width / 2;
        const my = rect.height / 2;
        const minZoom = this.config.minZoom ?? 0.15;
        const maxZoom = this.config.maxZoom ?? 2.5;
        const newK = Math.max(minZoom, Math.min(maxZoom, this.transform.k * factor));
        const ratio = newK / this.transform.k;
        this.transform = {
            k: newK,
            x: mx - (mx - this.transform.x) * ratio,
            y: my - (my - this.transform.y) * ratio,
        };
        this.emitZoom();
        this.cdr.markForCheck();
    }

    /** @deprecated Use {@link ZoomBy}. */
    public zoomBy(factor: number): void {
        return this.ZoomBy(factor);
    }

    public FitToView(): void {
        const svg = this.canvasRef?.nativeElement;
        if (!svg) return;
        const rect = svg.getBoundingClientRect();
        if (rect.width === 0 || rect.height === 0 || this.Layout.totalWidth === 0) return;

        const padding = 60;
        // Allow fit to scale UP for small diagrams (e.g. the Database Designer
        // wizard preview, where a single entity + a couple of satellites
        // would otherwise look lost in the pane).  Consumers can override via
        // `config.maxFitZoom`.  Default 2.5x: a 220px card becomes ~550px,
        // which comfortably fills a typical preview pane without looking
        // cartoonish (13px text → ~33px, still a readable ceiling).
        const maxFit = this.config.maxFitZoom ?? 2.5;
        const idealK = Math.min(
            (rect.width - padding * 2) / this.Layout.totalWidth,
            (rect.height - padding * 2) / this.Layout.totalHeight,
            maxFit,
        );

        // Clamp the fit zoom so cards stay legible.  On very large schemas
        // (hundreds of entities) fit-to-view would otherwise shrink each card
        // to a few pixels wide.  We'd rather show part of the canvas at a
        // readable zoom and let the user pan to see the rest.
        const minZoom = this.config.minZoom ?? 0.35;
        const k = Math.max(idealK, minZoom);

        // Center horizontally only if the canvas fits; otherwise anchor at left
        // so the user starts at the first schema band instead of the middle.
        const canvasFitsX = this.Layout.totalWidth * k <= rect.width - padding * 2;
        const canvasFitsY = this.Layout.totalHeight * k <= rect.height - padding * 2;

        const newX = canvasFitsX ? (rect.width - this.Layout.totalWidth * k) / 2 : padding;
        const newY = canvasFitsY ? (rect.height - this.Layout.totalHeight * k) / 2 : padding;

        // Idempotent guard.  If the computed transform is effectively identical
        // to the current one, bail out without reassigning or calling
        // markForCheck.  Without this, a consumer that passes an inline
        // `[config]="{...}"` object literal re-triggers ngOnChanges on every
        // change-detection tick, producing an infinite fitToView → markForCheck
        // → CD → ngOnChanges → fitToView loop (NG0103).
        const TOL = 0.001;
        if (
            Math.abs(this.transform.k - k) < TOL &&
            Math.abs(this.transform.x - newX) < 0.5 &&
            Math.abs(this.transform.y - newY) < 0.5
        ) {
            return;
        }

        this.transform = { k, x: newX, y: newY };
        this.emitZoom();
        this.LayoutComplete.emit();
        this.cdr.markForCheck();
    }

    /** @deprecated Use {@link FitToView}. */
    public fitToView(): void {
        return this.FitToView();
    }

    private centerOn(nodeId: string): void {
        const n = this.Layout.nodes.find(x => x.id === nodeId);
        const svg = this.canvasRef?.nativeElement;
        if (!n || !svg) return;
        const rect = svg.getBoundingClientRect();
        const k = Math.max(this.transform.k, 0.9);
        this.transform = {
            k,
            x: rect.width / 2 - (n.x + n.width / 2) * k,
            y: rect.height / 2 - (n.y + n.height / 2) * k,
        };
        this.emitZoom();
        // External callers (e.g. zoomToNode invoked from the side panel)
        // need CD to pick up the new transform — onNodeClick used to do
        // this itself but external pathways were silently no-op'ing.
        this.cdr.markForCheck();
    }

    private emitZoom(): void {
        this.ZoomChange.emit({
            zoomLevel: this.transform.k,
            translateX: this.transform.x,
            translateY: this.transform.y,
        });
    }

    // ─── NODE INTERACTIONS ───────────────────────────────────────────────

    public OnNodeClick(node: LaidOutNode, e: MouseEvent): void {
        e.stopPropagation();
        const event: ERDNodeClickEvent = { node, mouseEvent: e, cancel: false };
        this.NodeClick.emit(event);
        if (event.cancel) return;

        if (this.FocusNodeId === node.id) {
            // Toggle off — deselect.
            this.FocusNodeId = null;
            this.SelectedNodeId = null;
            this.NodeDeselected.emit();
        } else {
            this.FocusNodeId = node.id;
            this.SelectedNodeId = node.id;
            this.NodeSelected.emit(node);
            this.centerOn(node.id);
        }
        this.updateHighlightSet();
        this.updateSelectedEntity();
        this.cdr.markForCheck();
    }

    /** @deprecated Use {@link OnNodeClick}. */
    public onNodeClick(node: LaidOutNode, e: MouseEvent): void {
        return this.OnNodeClick(node, e);
    }

    public OnNodeMouseEnter(node: LaidOutNode, e: MouseEvent): void {
        this.HoverNodeId = node.id;
        this.updateHighlightSet();
        const related = this.Nodes.filter(n => this.HighlightSet?.has(n.id) && n.id !== node.id);
        this.NodeHover.emit({
            node, mouseEvent: e, relatedNodes: related,
            position: { x: e.clientX, y: e.clientY },
        });
        this.cdr.markForCheck();
    }

    /** @deprecated Use {@link OnNodeMouseEnter}. */
    public onNodeMouseEnter(node: LaidOutNode, e: MouseEvent): void {
        return this.OnNodeMouseEnter(node, e);
    }

    public OnNodeMouseLeave(node: LaidOutNode): void {
        this.HoverNodeId = null;
        this.updateHighlightSet();
        this.NodeHoverEnd.emit(node);
        this.cdr.markForCheck();
    }

    /** @deprecated Use {@link OnNodeMouseLeave}. */
    public onNodeMouseLeave(node: LaidOutNode): void {
        return this.OnNodeMouseLeave(node);
    }

    public OnToggleExpand(nodeId: string, e: Event): void {
        e.stopPropagation();
        if (this.expandedNodeIds.has(nodeId)) this.expandedNodeIds.delete(nodeId);
        else this.expandedNodeIds.add(nodeId);
        // New Set reference so @for trackBy treats it as changed.
        this.expandedNodeIds = new Set(this.expandedNodeIds);
        this.recompute();
    }

    /** @deprecated Use {@link OnToggleExpand}. */
    public onToggleExpand(nodeId: string, e: Event): void {
        return this.OnToggleExpand(nodeId, e);
    }

    // ─── CHROME INTERACTIONS ─────────────────────────────────────────────

    public OnSearchChange(value: string): void {
        this.SearchQuery = value;
        this.recompute();
    }

    /** @deprecated Use {@link OnSearchChange}. */
    public onSearchChange(value: string): void {
        return this.OnSearchChange(value);
    }

    public OnClearSearch(): void {
        this.SearchQuery = '';
        this.recompute();
    }

    /** @deprecated Use {@link OnClearSearch}. */
    public onClearSearch(): void {
        return this.OnClearSearch();
    }

    public OnSchemaChipToggle(schemaName: string): void {
        const current = this.ActiveSchemas ?? new Set(this.SchemaChips.map(c => c.name));
        const next = new Set(current);
        if (next.has(schemaName)) next.delete(schemaName);
        else next.add(schemaName);
        this.ActiveSchemas = next.size === this.SchemaChips.length ? null : next;
        this.recompute();
    }

    /** @deprecated Use {@link OnSchemaChipToggle}. */
    public onSchemaChipToggle(schemaName: string): void {
        return this.OnSchemaChipToggle(schemaName);
    }

    public OnRequestRefresh(): void {
        this.RefreshRequested.emit();
    }

    /** @deprecated Use {@link OnRequestRefresh}. */
    public onRequestRefresh(): void {
        return this.OnRequestRefresh();
    }

    // ─── DERIVED DATA FOR TEMPLATE ───────────────────────────────────────

    /** Path string for an edge — uses the orthogonal polyline from layout. */
    public EdgePath(edge: LaidOutEdge): string {
        return PointsToPath(edge.points);
    }

    /** @deprecated Use {@link EdgePath}. */
    public edgePath(edge: LaidOutEdge): string {
        return this.EdgePath(edge);
    }

    /**
     * Whether to render FK field labels along edges.  Defaults to ON in
     * both layouts — the zoom-gate (>=0.55x) keeps the labels off when
     * the user is zoomed out far enough to see hundreds of entities, so
     * "noise on dense views" isn't a real concern.  Consumers can still
     * force off via `config.showRelationshipLabels: false`.
     */
    public get ShowEdgeLabels(): boolean {
        const enabled = this.config.showRelationshipLabels ?? true;
        if (!enabled) return false;
        return this.transform.k >= 0.55;
    }

    /** @deprecated Use {@link ShowEdgeLabels}. */
    public get showEdgeLabels(): boolean {
        return this.ShowEdgeLabels;
    }

    /**
     * Pick a point along the edge polyline for a label and approximate
     * its width.  Returns null for self-loops (no good place to put text).
     * Uses the longest horizontal segment when one exists; falls back to
     * the segment midpoint otherwise.
     */
    public EdgeLabelPosition(edge: LaidOutEdge): { x: number; y: number; w: number } | null {
        if (edge.selfReference) return null;
        const pts = edge.points;
        if (pts.length < 2) return null;

        // Find the longest horizontal segment so the label sits on a
        // straight portion, not over a corner.
        let bestIdx = 0;
        let bestLen = 0;
        for (let i = 0; i < pts.length - 1; i++) {
            const [x1, y1] = pts[i];
            const [x2, y2] = pts[i + 1];
            if (Math.abs(y2 - y1) > 0.5) continue; // skip vertical segs
            const len = Math.abs(x2 - x1);
            if (len > bestLen) { bestLen = len; bestIdx = i; }
        }

        const [x1, y1] = pts[bestIdx];
        const [x2, y2] = pts[bestIdx + 1];
        const x = (x1 + x2) / 2;
        const y = (y1 + y2) / 2;

        // 6.5 px per char is a good approximation for the 11px mono we
        // use for labels — only used to size the background rect.
        const w = Math.max(20, edge.sourceField.name.length * 6.5);
        return { x, y, w };
    }

    /** @deprecated Use {@link EdgeLabelPosition}. */
    public edgeLabelPosition(edge: LaidOutEdge): { x: number; y: number; w: number } | null {
        return this.EdgeLabelPosition(edge);
    }

    /** Whether a node should appear dimmed (highlight mode active, node not in set). */
    public IsDimmed(nodeId: string): boolean {
        return !!this.HighlightSet && !this.HighlightSet.has(nodeId);
    }

    /** @deprecated Use {@link IsDimmed}. */
    public isDimmed(nodeId: string): boolean {
        return this.IsDimmed(nodeId);
    }

    /** Whether a node is the current focus (strong border). */
    public IsFocus(nodeId: string): boolean {
        return this.FocusNodeId === nodeId;
    }

    /** @deprecated Use {@link IsFocus}. */
    public isFocus(nodeId: string): boolean {
        return this.IsFocus(nodeId);
    }

    /** Whether a node is a 1-hop neighbour of the focus (medium border). */
    public IsNeighbour(nodeId: string): boolean {
        return !!this.HighlightSet && this.HighlightSet.has(nodeId) && !this.IsFocus(nodeId);
    }

    /** @deprecated Use {@link IsNeighbour}. */
    public isNeighbour(nodeId: string): boolean {
        return this.IsNeighbour(nodeId);
    }

    /** Whether an edge is part of the active highlight subgraph. */
    public IsEdgeActive(edge: LaidOutEdge): boolean {
        return !!this.HighlightSet && this.HighlightSet.has(edge.sourceId) && this.HighlightSet.has(edge.targetId);
    }

    /** @deprecated Use {@link IsEdgeActive}. */
    public isEdgeActive(edge: LaidOutEdge): boolean {
        return this.IsEdgeActive(edge);
    }

    /** Whether an edge should appear dimmed. */
    public IsEdgeDimmed(edge: LaidOutEdge): boolean {
        return !!this.HighlightSet && !this.IsEdgeActive(edge);
    }

    /** @deprecated Use {@link IsEdgeDimmed}. */
    public isEdgeDimmed(edge: LaidOutEdge): boolean {
        return this.IsEdgeDimmed(edge);
    }

    /** Zoom percentage string for the toolbar readout. */
    public get ZoomPercent(): string {
        return Math.round(this.transform.k * 100) + '%';
    }

    /** @deprecated Use {@link ZoomPercent}. */
    public get zoomPercent(): string {
        return this.ZoomPercent;
    }

    /** Short friendly row-count string (e.g. 1248 → "1.2k"). */
    public FormatCount(n: number | undefined): string {
        if (n == null) return '';
        if (n >= 1000) return (n / 1000).toFixed(n >= 10000 ? 0 : 1) + 'k';
        return n.toString();
    }

    /** @deprecated Use {@link FormatCount}. */
    public formatCount(n: number | undefined): string {
        return this.FormatCount(n);
    }

    /** Number of PK fields — handy aggregate (kept for external API parity). */
    public PkCount(entity: ERDNode): number {
        return entity.fields.filter(f => f.isPrimaryKey).length;
    }

    /** @deprecated Use {@link PkCount}. */
    public pkCount(entity: ERDNode): number {
        return this.PkCount(entity);
    }

    /** Number of FK fields — handy aggregate (kept for external API parity). */
    public FkCount(entity: ERDNode): number {
        return entity.fields.filter(f => !!f.relatedNodeId).length;
    }

    /** @deprecated Use {@link FkCount}. */
    public fkCount(entity: ERDNode): number {
        return this.FkCount(entity);
    }

    // ─── LEGACY API SHIMS ────────────────────────────────────────────────
    // Kept so existing consumers (mj-entity-erd wrapper, admin ERD dashboard)
    // continue to compile and work.  The new implementation doesn't need
    // most of these, but we preserve the shape.

    public ZoomIn(): void { this.ZoomBy(1.2); }

    /** @deprecated Use {@link ZoomIn}. */
    public zoomIn(): void {
        return this.ZoomIn();
    }
    public ZoomOut(): void { this.ZoomBy(0.83); }

    /** @deprecated Use {@link ZoomOut}. */
    public zoomOut(): void {
        return this.ZoomOut();
    }
    public ResetZoom(): void { this.FitToView(); }

    /** @deprecated Use {@link ResetZoom}. */
    public resetZoom(): void {
        return this.ResetZoom();
    }
    public ZoomToFit(_padding?: number): void { this.FitToView(); }

    /** @deprecated Use {@link ZoomToFit}. */
    public zoomToFit(_padding?: number): void {
        return this.ZoomToFit(_padding);
    }
    public ZoomToNode(nodeId: string, _scale?: number): void { this.centerOn(nodeId); }

    /** @deprecated Use {@link ZoomToNode}. */
    public zoomToNode(nodeId: string, _scale?: number): void {
        return this.ZoomToNode(nodeId, _scale);
    }
    public TriggerResize(): void { this.FitToView(); }

    /** @deprecated Use {@link TriggerResize}. */
    public triggerResize(): void {
        return this.TriggerResize();
    }

    public Refresh(): void {
        this.recompute();
        queueMicrotask(() => this.FitToView());
    }

    /** @deprecated Use {@link Refresh}. */
    public refresh(): void {
        return this.Refresh();
    }

    public GetState(): ERDState {
        return {
            selectedNodeId: this.SelectedNodeId,
            highlightedNodeIds: [...this.HighlightedNodeIds],
            zoomLevel: this.transform.k,
            translateX: this.transform.x,
            translateY: this.transform.y,
            focusNodeId: this.FocusNodeId,
            focusDepth: this.FocusDepth,
            nodePositions: {},
            layoutAlgorithm: this.ActiveLayout,
        };
    }

    /** @deprecated Use {@link GetState}. */
    public getState(): ERDState {
        return this.GetState();
    }

    public setState(state: Partial<ERDState>, _restorePositions?: boolean): void {
        if (state.selectedNodeId !== undefined) this.SelectedNodeId = state.selectedNodeId;
        if (state.highlightedNodeIds !== undefined) this.HighlightedNodeIds = [...state.highlightedNodeIds];
        if (state.focusNodeId !== undefined) this.FocusNodeId = state.focusNodeId;
        if (state.focusDepth !== undefined) this.FocusDepth = state.focusDepth;
        if (state.zoomLevel !== undefined || state.translateX !== undefined || state.translateY !== undefined) {
            this.transform = {
                k: state.zoomLevel ?? this.transform.k,
                x: state.translateX ?? this.transform.x,
                y: state.translateY ?? this.transform.y,
            };
        }
        if (state.layoutAlgorithm && state.layoutAlgorithm !== this.ActiveLayout) {
            this.ActiveLayout = state.layoutAlgorithm;
            this.recompute();
        }
        this.updateHighlightSet();
        this.updateSelectedEntity();
        this.cdr.markForCheck();
    }

    public ExportAsSVG(): string {
        const svg = this.canvasRef?.nativeElement;
        if (!svg) return '';
        return new XMLSerializer().serializeToString(svg);
    }

    /** @deprecated Use {@link ExportAsSVG}. */
    public exportAsSVG(): string {
        return this.ExportAsSVG();
    }

    // ─── TRACK-BYs ───────────────────────────────────────────────────────

    public TrackByBand = (_: number, b: LaidOutBand) => b.schemaName;

    /** @deprecated Use {@link TrackByBand}. */
    public get trackByBand() {
        return this.TrackByBand;
    }
    /** @deprecated Use {@link TrackByBand}. */
    public set trackByBand(value) {
        this.TrackByBand = value;
    }
    public TrackByEdge = (_: number, e: LaidOutEdge) => e.id;

    /** @deprecated Use {@link TrackByEdge}. */
    public get trackByEdge() {
        return this.TrackByEdge;
    }
    /** @deprecated Use {@link TrackByEdge}. */
    public set trackByEdge(value) {
        this.TrackByEdge = value;
    }
    public TrackByNode = (_: number, n: LaidOutNode) => n.id;

    /** @deprecated Use {@link TrackByNode}. */
    public get trackByNode() {
        return this.TrackByNode;
    }
    /** @deprecated Use {@link TrackByNode}. */
    public set trackByNode(value) {
        this.TrackByNode = value;
    }
    public TrackByField = (_: number, f: ERDField) => f.id || f.name;

    /** @deprecated Use {@link TrackByField}. */
    public get trackByField() {
        return this.TrackByField;
    }
    /** @deprecated Use {@link TrackByField}. */
    public set trackByField(value) {
        this.TrackByField = value;
    }
    public TrackByChip = (_: number, c: SchemaChip) => c.name;

    /** @deprecated Use {@link TrackByChip}. */
    public get trackByChip() {
        return this.TrackByChip;
    }
    /** @deprecated Use {@link TrackByChip}. */
    public set trackByChip(value) {
        this.TrackByChip = value;
    }
}
