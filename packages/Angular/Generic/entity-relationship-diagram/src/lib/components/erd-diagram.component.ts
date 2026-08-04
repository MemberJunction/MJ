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
    computeErdLayout,
    pointsToPath,
    getNeighbors,
    type ErdLayout,
    type LaidOutNode,
    type LaidOutEdge,
    type LaidOutBand,
} from '../layout/compute-erd-layout';
import { computeDagreLayout } from '../layout/compute-dagre-layout';

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

    @Input() public nodes: ERDNode[] = [];
    @Input() public selectedNodeId: string | null = null;
    @Input() public highlightedNodeIds: string[] = [];
    @Input() public focusNodeId: string | null = null;
    @Input() public focusDepth = 1;
    @Input() public isRefreshing = false;
    @Input() public readOnly = false;
    @Input() public config: ERDConfig = {};
    @Input() public showHeader = true;
    @Input() public headerTitle = 'Entity Relationship Diagram';

    // ─── OUTPUTS (preserved from legacy API) ──────────────────────────────

    @Output() public nodeClick = new EventEmitter<ERDNodeClickEvent>();
    @Output() public nodeDoubleClick = new EventEmitter<ERDNodeDoubleClickEvent>();
    @Output() public nodeSelected = new EventEmitter<ERDNode>();
    @Output() public nodeDeselected = new EventEmitter<void>();
    @Output() public linkClick = new EventEmitter<ERDLinkClickEvent>();
    @Output() public nodeHover = new EventEmitter<ERDNodeHoverEvent>();
    @Output() public nodeHoverEnd = new EventEmitter<ERDNode>();
    @Output() public linkHover = new EventEmitter<ERDLinkHoverEvent>();
    @Output() public linkHoverEnd = new EventEmitter<ERDLink>();
    @Output() public nodeContextMenu = new EventEmitter<ERDNodeContextMenuEvent>();
    @Output() public linkContextMenu = new EventEmitter<ERDLinkContextMenuEvent>();
    @Output() public diagramContextMenu = new EventEmitter<ERDDiagramContextMenuEvent>();
    @Output() public nodeDragStart = new EventEmitter<ERDNodeDragEvent>();
    @Output() public nodeDragEnd = new EventEmitter<ERDNodeDragEvent>();
    @Output() public zoomChange = new EventEmitter<ERDZoomEvent>();
    @Output() public refreshRequested = new EventEmitter<void>();
    @Output() public layoutComplete = new EventEmitter<void>();
    @Output() public stateChange = new EventEmitter<ERDState>();

    // ─── VIEW CHILDREN ────────────────────────────────────────────────────

    @ViewChild('canvasRef', { static: false }) private canvasRef?: ElementRef<SVGSVGElement>;

    // ─── STATE ────────────────────────────────────────────────────────────

    /** Current pan + zoom. */
    public transform: Transform = { x: 0, y: 0, k: 1 };

    /** Set of schema names the user has filtered IN.  Null means "all". */
    public activeSchemas: Set<string> | null = null;

    /** Search query string. */
    public searchQuery = '';

    /** Node IDs the user has clicked "+N more fields" on. */
    public expandedNodeIds = new Set<string>();

    /** Node currently being hovered (for highlight preview). */
    public hoverNodeId: string | null = null;

    /** Cached layout — recomputed when nodes, filter, search or expansion changes. */
    public layout: ErdLayout = { nodes: [], edges: [], bands: [], totalWidth: 0, totalHeight: 0 };

    /**
     * Active layout algorithm.  Starts from `config.layoutAlgorithm` (default
     * `schema-grid`) but can be toggled at runtime via `setLayoutAlgorithm`.
     * Exposed so the chrome toggle + saved user state can drive it.
     */
    public activeLayout: 'schema-grid' | 'dagre' = 'schema-grid';

    /** Derived schema summary for the chip row. */
    public schemaChips: SchemaChip[] = [];

    /** Derived — number of entities currently visible. */
    public visibleCount = 0;

    /** Icon for the empty state — honours `config.emptyStateIcon` when provided. */
    public get emptyStateIcon(): string {
        return this.config.emptyStateIcon || 'fa-solid fa-diagram-project';
    }

    /** Title for the empty state — distinguishes "nothing here" from "filtered to nothing". */
    public get emptyStateTitle(): string {
        return this.totalCount === 0
            ? (this.config.emptyStateMessage || 'No entities to display')
            : 'No entities match';
    }

    /** Derived — total entities in the input, before any filtering. */
    public totalCount = 0;

    /** Derived — the Set of IDs in the focus/hover neighbourhood (null when no highlight active). */
    public highlightSet: Set<string> | null = null;

    /** Derived — the single selected entity, if any. */
    public selectedEntity: ERDNode | null = null;

    // Panning bookkeeping (not reactive).  Public so the template can bind a
    // cursor attribute to it; treat as internal state.
    public panning = false;
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
                this.activeSchemas = null;
                this.expandedNodeIds = new Set();
                this.hoverNodeId = null;
            }
            // Honour `config.layoutAlgorithm` on first arrival; runtime
            // changes happen via `setLayoutAlgorithm`.
            if (this.config.layoutAlgorithm === 'dagre') this.activeLayout = 'dagre';
            else if (this.config.layoutAlgorithm === 'schema-grid') this.activeLayout = 'schema-grid';
            this.recompute();
            // Fit-to-view once the DOM has the new canvas dimensions.
            queueMicrotask(() => this.fitToView());
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
        queueMicrotask(() => this.fitToView());
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
        this.totalCount = this.nodes.length;

        const filteredBySchema = this.activeSchemas
            ? this.nodes.filter(n => this.activeSchemas!.has(n.schemaName || '_'))
            : this.nodes;

        const q = this.searchQuery.trim().toLowerCase();
        const filtered = q
            ? filteredBySchema.filter(n =>
                n.name.toLowerCase().includes(q) ||
                (n.schemaName?.toLowerCase().includes(q) ?? false) ||
                n.fields.some(f => f.name.toLowerCase().includes(q)))
            : filteredBySchema;

        this.visibleCount = filtered.length;

        const commonOpts = {
            nodeWidth: this.config.nodeWidth ?? 220,
            fieldHeight: this.config.fieldHeight ?? 22,
            expandedNodeIds: this.expandedNodeIds,
            showAllFields: this.config.showAllFields ?? false,
        };

        this.layout = this.activeLayout === 'dagre'
            ? computeDagreLayout(filtered, {
                ...commonOpts,
                rankDir: this.config.dagreConfig?.rankDir ?? 'LR',
                nodeSep: this.config.dagreConfig?.nodeSep,
                rankSep: this.config.dagreConfig?.rankSep,
            })
            : computeErdLayout(filtered, commonOpts);

        this.schemaChips = this.buildSchemaChips();
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
    public setLayoutAlgorithm(algo: 'schema-grid' | 'dagre'): void {
        if (this.activeLayout === algo) return;
        this.activeLayout = algo;

        const hadSelection = !!(this.focusNodeId || this.selectedNodeId);
        this.focusNodeId = null;
        this.selectedNodeId = null;
        this.hoverNodeId = null;
        this.updateHighlightSet();
        this.updateSelectedEntity();
        if (hadSelection) this.nodeDeselected.emit();

        this.recompute();
        queueMicrotask(() => this.fitToView());
        this.stateChange.emit(this.getState());
    }

    private buildSchemaChips(): SchemaChip[] {
        const counts = new Map<string, number>();
        for (const n of this.nodes) {
            const s = n.schemaName || '_';
            counts.set(s, (counts.get(s) ?? 0) + 1);
        }
        return [...counts.entries()]
            .sort(([a], [b]) => a.localeCompare(b))
            .map(([name, count]) => ({
                name,
                count,
                active: this.activeSchemas ? this.activeSchemas.has(name) : true,
            }));
    }

    private updateHighlightSet(): void {
        const id = this.focusNodeId ?? this.hoverNodeId;
        this.highlightSet = id ? getNeighbors(this.nodes, id) : null;
    }

    private updateSelectedEntity(): void {
        const id = this.focusNodeId ?? this.selectedNodeId;
        this.selectedEntity = id ? this.nodes.find(n => n.id === id) ?? null : null;
    }

    private watchResize(): ResizeObserver {
        const observer = new ResizeObserver(() => this.fitToView());
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
    public onBackgroundMouseDown(e: MouseEvent): void {
        if (e.button !== 0) return;
        this.dragOrigin = { clientX: e.clientX, clientY: e.clientY };
        this.dragMoved = false;
        this.panStart = { x: e.clientX - this.transform.x, y: e.clientY - this.transform.y };

        this.boundWindowMove = (ev: MouseEvent) => this.onWindowMouseMove(ev);
        this.boundWindowUp = (ev: MouseEvent) => this.onWindowMouseUp(ev);
        window.addEventListener('mousemove', this.boundWindowMove);
        window.addEventListener('mouseup', this.boundWindowUp);
    }

    private onWindowMouseMove(e: MouseEvent): void {
        if (!this.dragOrigin || !this.panStart) return;

        if (!this.panning) {
            const dx = e.clientX - this.dragOrigin.clientX;
            const dy = e.clientY - this.dragOrigin.clientY;
            if (Math.hypot(dx, dy) < ERDDiagramComponent.DRAG_THRESHOLD) return;
            this.panning = true;
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

        this.panning = false;
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

    public onWheel(e: WheelEvent): void {
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

    public zoomBy(factor: number): void {
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

    public fitToView(): void {
        const svg = this.canvasRef?.nativeElement;
        if (!svg) return;
        const rect = svg.getBoundingClientRect();
        if (rect.width === 0 || rect.height === 0 || this.layout.totalWidth === 0) return;

        const padding = 60;
        // Allow fit to scale UP for small diagrams (e.g. the Database Designer
        // wizard preview, where a single entity + a couple of satellites
        // would otherwise look lost in the pane).  Consumers can override via
        // `config.maxFitZoom`.  Default 2.5x: a 220px card becomes ~550px,
        // which comfortably fills a typical preview pane without looking
        // cartoonish (13px text → ~33px, still a readable ceiling).
        const maxFit = this.config.maxFitZoom ?? 2.5;
        const idealK = Math.min(
            (rect.width - padding * 2) / this.layout.totalWidth,
            (rect.height - padding * 2) / this.layout.totalHeight,
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
        const canvasFitsX = this.layout.totalWidth * k <= rect.width - padding * 2;
        const canvasFitsY = this.layout.totalHeight * k <= rect.height - padding * 2;

        const newX = canvasFitsX ? (rect.width - this.layout.totalWidth * k) / 2 : padding;
        const newY = canvasFitsY ? (rect.height - this.layout.totalHeight * k) / 2 : padding;

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
        this.layoutComplete.emit();
        this.cdr.markForCheck();
    }

    private centerOn(nodeId: string): void {
        const n = this.layout.nodes.find(x => x.id === nodeId);
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
        this.zoomChange.emit({
            zoomLevel: this.transform.k,
            translateX: this.transform.x,
            translateY: this.transform.y,
        });
    }

    // ─── NODE INTERACTIONS ───────────────────────────────────────────────

    public onNodeClick(node: LaidOutNode, e: MouseEvent): void {
        e.stopPropagation();
        const event: ERDNodeClickEvent = { node, mouseEvent: e, cancel: false };
        this.nodeClick.emit(event);
        if (event.cancel) return;

        if (this.focusNodeId === node.id) {
            // Toggle off — deselect.
            this.focusNodeId = null;
            this.selectedNodeId = null;
            this.nodeDeselected.emit();
        } else {
            this.focusNodeId = node.id;
            this.selectedNodeId = node.id;
            this.nodeSelected.emit(node);
            this.centerOn(node.id);
        }
        this.updateHighlightSet();
        this.updateSelectedEntity();
        this.cdr.markForCheck();
    }

    public onNodeMouseEnter(node: LaidOutNode, e: MouseEvent): void {
        this.hoverNodeId = node.id;
        this.updateHighlightSet();
        const related = this.nodes.filter(n => this.highlightSet?.has(n.id) && n.id !== node.id);
        this.nodeHover.emit({
            node, mouseEvent: e, relatedNodes: related,
            position: { x: e.clientX, y: e.clientY },
        });
        this.cdr.markForCheck();
    }

    public onNodeMouseLeave(node: LaidOutNode): void {
        this.hoverNodeId = null;
        this.updateHighlightSet();
        this.nodeHoverEnd.emit(node);
        this.cdr.markForCheck();
    }

    public onToggleExpand(nodeId: string, e: Event): void {
        e.stopPropagation();
        if (this.expandedNodeIds.has(nodeId)) this.expandedNodeIds.delete(nodeId);
        else this.expandedNodeIds.add(nodeId);
        // New Set reference so @for trackBy treats it as changed.
        this.expandedNodeIds = new Set(this.expandedNodeIds);
        this.recompute();
    }

    // ─── CHROME INTERACTIONS ─────────────────────────────────────────────

    public onSearchChange(value: string): void {
        this.searchQuery = value;
        this.recompute();
    }

    public onClearSearch(): void {
        this.searchQuery = '';
        this.recompute();
    }

    public onSchemaChipToggle(schemaName: string): void {
        const current = this.activeSchemas ?? new Set(this.schemaChips.map(c => c.name));
        const next = new Set(current);
        if (next.has(schemaName)) next.delete(schemaName);
        else next.add(schemaName);
        this.activeSchemas = next.size === this.schemaChips.length ? null : next;
        this.recompute();
    }

    public onRequestRefresh(): void {
        this.refreshRequested.emit();
    }

    // ─── DERIVED DATA FOR TEMPLATE ───────────────────────────────────────

    /** Path string for an edge — uses the orthogonal polyline from layout. */
    public edgePath(edge: LaidOutEdge): string {
        return pointsToPath(edge.points);
    }

    /**
     * Whether to render FK field labels along edges.  Defaults to ON in
     * both layouts — the zoom-gate (>=0.55x) keeps the labels off when
     * the user is zoomed out far enough to see hundreds of entities, so
     * "noise on dense views" isn't a real concern.  Consumers can still
     * force off via `config.showRelationshipLabels: false`.
     */
    public get showEdgeLabels(): boolean {
        const enabled = this.config.showRelationshipLabels ?? true;
        if (!enabled) return false;
        return this.transform.k >= 0.55;
    }

    /**
     * Pick a point along the edge polyline for a label and approximate
     * its width.  Returns null for self-loops (no good place to put text).
     * Uses the longest horizontal segment when one exists; falls back to
     * the segment midpoint otherwise.
     */
    public edgeLabelPosition(edge: LaidOutEdge): { x: number; y: number; w: number } | null {
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

    /** Whether a node should appear dimmed (highlight mode active, node not in set). */
    public isDimmed(nodeId: string): boolean {
        return !!this.highlightSet && !this.highlightSet.has(nodeId);
    }

    /** Whether a node is the current focus (strong border). */
    public isFocus(nodeId: string): boolean {
        return this.focusNodeId === nodeId;
    }

    /** Whether a node is a 1-hop neighbour of the focus (medium border). */
    public isNeighbour(nodeId: string): boolean {
        return !!this.highlightSet && this.highlightSet.has(nodeId) && !this.isFocus(nodeId);
    }

    /** Whether an edge is part of the active highlight subgraph. */
    public isEdgeActive(edge: LaidOutEdge): boolean {
        return !!this.highlightSet && this.highlightSet.has(edge.sourceId) && this.highlightSet.has(edge.targetId);
    }

    /** Whether an edge should appear dimmed. */
    public isEdgeDimmed(edge: LaidOutEdge): boolean {
        return !!this.highlightSet && !this.isEdgeActive(edge);
    }

    /** Zoom percentage string for the toolbar readout. */
    public get zoomPercent(): string {
        return Math.round(this.transform.k * 100) + '%';
    }

    /** Short friendly row-count string (e.g. 1248 → "1.2k"). */
    public formatCount(n: number | undefined): string {
        if (n == null) return '';
        if (n >= 1000) return (n / 1000).toFixed(n >= 10000 ? 0 : 1) + 'k';
        return n.toString();
    }

    /** Number of PK fields — handy aggregate (kept for external API parity). */
    public pkCount(entity: ERDNode): number {
        return entity.fields.filter(f => f.isPrimaryKey).length;
    }

    /** Number of FK fields — handy aggregate (kept for external API parity). */
    public fkCount(entity: ERDNode): number {
        return entity.fields.filter(f => !!f.relatedNodeId).length;
    }

    // ─── LEGACY API SHIMS ────────────────────────────────────────────────
    // Kept so existing consumers (mj-entity-erd wrapper, admin ERD dashboard)
    // continue to compile and work.  The new implementation doesn't need
    // most of these, but we preserve the shape.

    public zoomIn(): void { this.zoomBy(1.2); }
    public zoomOut(): void { this.zoomBy(0.83); }
    public resetZoom(): void { this.fitToView(); }
    public zoomToFit(_padding?: number): void { this.fitToView(); }
    public zoomToNode(nodeId: string, _scale?: number): void { this.centerOn(nodeId); }
    public triggerResize(): void { this.fitToView(); }

    public refresh(): void {
        this.recompute();
        queueMicrotask(() => this.fitToView());
    }

    public getState(): ERDState {
        return {
            selectedNodeId: this.selectedNodeId,
            highlightedNodeIds: [...this.highlightedNodeIds],
            zoomLevel: this.transform.k,
            translateX: this.transform.x,
            translateY: this.transform.y,
            focusNodeId: this.focusNodeId,
            focusDepth: this.focusDepth,
            nodePositions: {},
            layoutAlgorithm: this.activeLayout,
        };
    }

    public setState(state: Partial<ERDState>, _restorePositions?: boolean): void {
        if (state.selectedNodeId !== undefined) this.selectedNodeId = state.selectedNodeId;
        if (state.highlightedNodeIds !== undefined) this.highlightedNodeIds = [...state.highlightedNodeIds];
        if (state.focusNodeId !== undefined) this.focusNodeId = state.focusNodeId;
        if (state.focusDepth !== undefined) this.focusDepth = state.focusDepth;
        if (state.zoomLevel !== undefined || state.translateX !== undefined || state.translateY !== undefined) {
            this.transform = {
                k: state.zoomLevel ?? this.transform.k,
                x: state.translateX ?? this.transform.x,
                y: state.translateY ?? this.transform.y,
            };
        }
        if (state.layoutAlgorithm && state.layoutAlgorithm !== this.activeLayout) {
            this.activeLayout = state.layoutAlgorithm;
            this.recompute();
        }
        this.updateHighlightSet();
        this.updateSelectedEntity();
        this.cdr.markForCheck();
    }

    public exportAsSVG(): string {
        const svg = this.canvasRef?.nativeElement;
        if (!svg) return '';
        return new XMLSerializer().serializeToString(svg);
    }

    // ─── TRACK-BYs ───────────────────────────────────────────────────────

    public trackByBand = (_: number, b: LaidOutBand) => b.schemaName;
    public trackByEdge = (_: number, e: LaidOutEdge) => e.id;
    public trackByNode = (_: number, n: LaidOutNode) => n.id;
    public trackByField = (_: number, f: ERDField) => f.id || f.name;
    public trackByChip = (_: number, c: SchemaChip) => c.name;
}
