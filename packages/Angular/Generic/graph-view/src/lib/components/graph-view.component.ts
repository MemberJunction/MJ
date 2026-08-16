import {
    Component,
    Input,
    Output,
    EventEmitter,
    OnInit,
    OnChanges,
    OnDestroy,
    SimpleChanges,
    ChangeDetectionStrategy,
    ChangeDetectorRef,
    ElementRef,
    ViewChild,
    inject
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { NavigationService } from '@memberjunction/ng-shared';
import { CompositeKey } from '@memberjunction/core';
import type {
    GraphNode,
    GraphEdge,
    GraphLayoutMode,
    GraphNodeCategory,
    GraphViewportTransform,
    GraphPhysicsConfig
} from '../models/graph-models';
import {
    BeforeNodeSelectEventArgs,
    NodeSelectedEventArgs,
    BeforeEdgeSelectEventArgs,
    EdgeSelectedEventArgs,
    BeforeHopExpandEventArgs,
    HopExpandedEventArgs,
    BeforeLayoutChangeEventArgs,
    LayoutChangedEventArgs,
    BeforeNodeNavigateEventArgs,
    NodeNavigatedEventArgs,
    ViewportTransformEventArgs
} from '../events/graph-events';

const GRAPH_VIEW_CSS = `
:host {
    display: block;
    width: 100%;
    height: 100%;
    position: relative;
    overflow: hidden;
    background: var(--mj-bg-surface-sunken, #0b1220);
    border-radius: var(--mj-radius-lg, 12px);
    border: 1px solid var(--mj-border-default, #223254);
    user-select: none;
}

.mj-graph-wrapper {
    width: 100%;
    height: 100%;
    position: relative;
    overflow: hidden;
    display: flex;
    flex-direction: column;
}

.mj-graph-svg-canvas {
    width: 100%;
    height: 100%;
    cursor: grab;
}

.mj-graph-svg-canvas.is-panning {
    cursor: grabbing;
}

/* Floating Toolbar */
.mj-graph-toolbar {
    position: absolute;
    top: 14px;
    left: 14px;
    z-index: 20;
    display: flex;
    align-items: center;
    gap: 8px;
    background: rgba(20, 31, 54, 0.88);
    backdrop-filter: blur(10px);
    border: 1px solid var(--mj-border-default, #223254);
    padding: 6px 12px;
    border-radius: var(--mj-radius-lg, 10px);
    box-shadow: 0 8px 24px rgba(0, 0, 0, 0.4);
}

.mj-graph-tool-btn {
    background: var(--mj-bg-surface-elevated, #1a2744);
    border: 1px solid var(--mj-border-default, #223254);
    color: var(--mj-text-primary, #f8fafc);
    border-radius: 6px;
    padding: 5px 10px;
    font-size: 11.5px;
    font-weight: 600;
    cursor: pointer;
    display: flex;
    align-items: center;
    gap: 6px;
    transition: all 0.15s ease;
}

.mj-graph-tool-btn:hover {
    border-color: var(--mj-brand-primary, #38bdf8);
    background: var(--mj-border-hover, #334876);
}

.mj-graph-tool-btn.active {
    background: var(--mj-brand-primary, #38bdf8);
    color: #090e1a;
    border-color: var(--mj-brand-primary, #38bdf8);
}

.mj-graph-separator {
    width: 1px;
    height: 18px;
    background: var(--mj-border-default, #223254);
}

.mj-graph-search-input {
    background: var(--mj-bg-surface-sunken, #090e1a);
    border: 1px solid var(--mj-border-default, #223254);
    border-radius: 6px;
    color: var(--mj-text-primary, #f8fafc);
    padding: 4px 8px 4px 24px;
    font-size: 11.5px;
    width: 150px;
}

.mj-graph-search-input:focus {
    outline: none;
    border-color: var(--mj-brand-primary, #38bdf8);
    width: 190px;
}

/* Floating Legend */
.mj-graph-legend {
    position: absolute;
    bottom: 14px;
    left: 14px;
    z-index: 20;
    display: flex;
    align-items: center;
    gap: 12px;
    background: rgba(20, 31, 54, 0.88);
    backdrop-filter: blur(10px);
    border: 1px solid var(--mj-border-default, #223254);
    padding: 6px 14px;
    border-radius: var(--mj-radius-lg, 10px);
    font-size: 11.5px;
    color: var(--mj-text-secondary, #94a3b8);
}

.mj-graph-legend-item {
    display: flex;
    align-items: center;
    gap: 6px;
}

.mj-graph-legend-dot {
    width: 10px;
    height: 10px;
    border-radius: 50%;
}

/* Inspector Drawer */
.mj-graph-inspector {
    position: absolute;
    top: 14px;
    right: 14px;
    width: 300px;
    max-height: calc(100% - 28px);
    background: rgba(20, 31, 54, 0.95);
    backdrop-filter: blur(14px);
    border: 1px solid var(--mj-border-default, #223254);
    border-radius: var(--mj-radius-lg, 12px);
    padding: 16px;
    display: flex;
    flex-direction: column;
    gap: 12px;
    z-index: 25;
    box-shadow: 0 10px 30px rgba(0, 0, 0, 0.5);
    overflow-y: auto;
    scrollbar-width: thin;
    animation: mjGraphSlide 0.2s ease;
}

.mj-graph-inspector-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
}

.mj-graph-inspector-title {
    font-size: 11px;
    font-weight: 700;
    text-transform: uppercase;
    letter-spacing: 0.05em;
    color: var(--mj-text-muted, #64748b);
}

.mj-graph-inspector-close {
    background: none;
    border: none;
    color: var(--mj-text-muted, #64748b);
    cursor: pointer;
    font-size: 14px;
}

.mj-graph-inspector-card {
    display: flex;
    align-items: center;
    gap: 12px;
    background: var(--mj-bg-surface, #111a2e);
    border: 1px solid var(--mj-border-default, #223254);
    border-radius: 8px;
    padding: 10px 12px;
}

.mj-graph-inspector-avatar {
    width: 40px;
    height: 40px;
    border-radius: 8px;
    display: flex;
    align-items: center;
    justify-content: center;
    font-size: 16px;
    color: #fff;
    flex-shrink: 0;
}

.mj-graph-inspector-actions {
    display: flex;
    flex-direction: column;
    gap: 6px;
    margin-top: 4px;
}

/* SVG Rendering Elements */
.mj-edge-path {
    stroke: var(--mj-border-hover, #2d416b);
    stroke-width: 2;
    fill: none;
    transition: stroke 0.2s ease;
}

.mj-edge-path.is-highlighted {
    stroke: var(--mj-brand-primary, #38bdf8);
    stroke-width: 3;
}

.mj-edge-text {
    font-size: 10px;
    font-weight: 500;
    fill: var(--mj-text-muted, #64748b);
    text-anchor: middle;
    pointer-events: none;
    paint-order: stroke;
    stroke: var(--mj-bg-surface-sunken, #0b1220);
    stroke-width: 3px;
    stroke-linecap: butt;
    stroke-linejoin: miter;
}

.mj-node-group {
    cursor: pointer;
    transition: transform 0.1s ease;
}

.mj-node-group:hover .mj-node-circle {
    filter: drop-shadow(0 0 10px var(--mj-brand-primary, #38bdf8));
}

.mj-node-circle {
    transition: all 0.2s ease;
}

.mj-node-label {
    font-size: 11px;
    font-weight: 700;
    fill: var(--mj-text-primary, #f8fafc);
    text-anchor: middle;
    pointer-events: none;
}

.mj-node-sublabel {
    font-size: 9.5px;
    font-weight: 500;
    fill: var(--mj-text-secondary, #94a3b8);
    text-anchor: middle;
    pointer-events: none;
}

@keyframes mjGraphSlide {
    from { opacity: 0; transform: translateX(20px); }
    to { opacity: 1; transform: translateX(0); }
}
`;

/**
 * `<mj-graph-view>` — Interactive network and entity relationship graph visualization.
 *
 * Supports force-directed dynamic layout, multi-category entity badges, hop-expansion,
 * zoom/pan controls, inspector drawer, search filters, and cancelable Before/After event pairs.
 */
@Component({
    selector: 'mj-graph-view',
    standalone: true,
    imports: [CommonModule, FormsModule],
    changeDetection: ChangeDetectionStrategy.OnPush,
    template: `
        <div class="mj-graph-wrapper" #wrapper>
            <!-- 1. Floating Action Toolbar -->
            @if (ShowToolbar) {
                <div class="mj-graph-toolbar">
                    <span style="font-size: 12px; font-weight: 700; color: #fff; display: flex; align-items: center; gap: 6px;">
                        <i class="fa-solid fa-circle-nodes" style="color: var(--mj-brand-primary);"></i>
                        Network Graph
                    </span>

                    <div class="mj-graph-separator"></div>

                    <!-- Layout Mode Selector -->
                    <button
                        type="button"
                        class="mj-graph-tool-btn"
                        [class.active]="LayoutMode === 'force'"
                        (click)="SetLayoutMode('force')"
                        title="Force-Directed Physics">
                        <i class="fa-solid fa-atom"></i> Force
                    </button>
                    <button
                        type="button"
                        class="mj-graph-tool-btn"
                        [class.active]="LayoutMode === 'circular'"
                        (click)="SetLayoutMode('circular')"
                        title="Circular Layout">
                        <i class="fa-solid fa-circle-notch"></i> Circular
                    </button>

                    <div class="mj-graph-separator"></div>

                    <!-- Zoom Controls -->
                    <button type="button" class="mj-graph-tool-btn" (click)="ZoomIn()" title="Zoom In">
                        <i class="fa-solid fa-magnifying-glass-plus"></i>
                    </button>
                    <button type="button" class="mj-graph-tool-btn" (click)="ZoomOut()" title="Zoom Out">
                        <i class="fa-solid fa-magnifying-glass-minus"></i>
                    </button>
                    <button type="button" class="mj-graph-tool-btn" (click)="FitToView()" title="Fit View">
                        <i class="fa-solid fa-expand"></i>
                    </button>
                    <button type="button" class="mj-graph-tool-btn" (click)="Rearrange()" title="Re-simulate Physics">
                        <i class="fa-solid fa-arrows-rotate"></i>
                    </button>

                    @if (Searchable) {
                        <div class="mj-graph-separator"></div>
                        <div style="position: relative;">
                            <i class="fa-solid fa-magnifying-glass" style="position: absolute; left: 8px; top: 50%; transform: translateY(-50%); font-size: 10px; color: var(--mj-text-muted);"></i>
                            <input
                                class="mj-graph-search-input"
                                [(ngModel)]="SearchQuery"
                                (ngModelChange)="SearchNodes($event)"
                                placeholder="Search graph nodes..." />
                        </div>
                    }
                </div>
            }

            <!-- 2. Floating Category Legend -->
            @if (ShowLegend) {
                <div class="mj-graph-legend">
                    <div class="mj-graph-legend-item">
                        <div class="mj-graph-legend-dot" style="background: #10b981;"></div> Person
                    </div>
                    <div class="mj-graph-legend-item">
                        <div class="mj-graph-legend-dot" style="background: #38bdf8;"></div> Organization
                    </div>
                    <div class="mj-graph-legend-item">
                        <div class="mj-graph-legend-dot" style="background: #8b5cf6;"></div> Committee
                    </div>
                    <div class="mj-graph-legend-item">
                        <div class="mj-graph-legend-dot" style="background: #f59e0b;"></div> Holding / Account
                    </div>
                </div>
            }

            <!-- 3. Selected Node Inspector Drawer -->
            @if (ShowInspector && SelectedNode) {
                <div class="mj-graph-inspector">
                    <div class="mj-graph-inspector-header">
                        <span class="mj-graph-inspector-title">Node Inspector</span>
                        <button class="mj-graph-inspector-close" type="button" (click)="ClearSelection()">
                            <i class="fa-solid fa-xmark"></i>
                        </button>
                    </div>

                    <div class="mj-graph-inspector-card">
                        <div class="mj-graph-inspector-avatar" [style.background]="GetNodeColor(SelectedNode)">
                            <i [class]="GetNodeIcon(SelectedNode)"></i>
                        </div>
                        <div style="overflow: hidden;">
                            <div style="font-size: 13px; font-weight: 700; color: #fff; text-overflow: ellipsis; overflow: hidden; white-space: nowrap;">
                                {{ SelectedNode.Label }}
                            </div>
                            <div style="font-size: 11px; color: var(--mj-text-secondary);">
                                {{ SelectedNode.Sublabel || SelectedNode.Category }}
                            </div>
                        </div>
                    </div>

                    <div style="font-size: 11.5px; color: var(--mj-text-secondary); line-height: 1.45;">
                        Direct Connected Edges: <strong>{{ GetNodeEdgeCount(SelectedNode.ID) }}</strong>
                    </div>

                    <div class="mj-graph-inspector-actions">
                        <button
                            type="button"
                            class="mj-graph-tool-btn active"
                            style="justify-content: center; width: 100%;"
                            (click)="NavigateToEntity(SelectedNode)">
                            <i class="fa-solid fa-arrow-up-right-from-square"></i> Open Entity Form
                        </button>
                        <button
                            type="button"
                            class="mj-graph-tool-btn"
                            style="justify-content: center; width: 100%;"
                            (click)="ExpandHops(SelectedNode.ID, 1)">
                            <i class="fa-solid fa-circle-nodes"></i> Expand 1-Hop Neighbors
                        </button>
                    </div>
                </div>
            }

            <!-- 4. Interactive SVG Graph Canvas -->
            <svg
                #svgCanvas
                class="mj-graph-svg-canvas"
                [class.is-panning]="IsPanning"
                (mousedown)="OnCanvasMouseDown($event)"
                (mousemove)="OnCanvasMouseMove($event)"
                (mouseup)="OnCanvasMouseUp($event)"
                (mouseleave)="OnCanvasMouseUp($event)"
                (wheel)="OnCanvasWheel($event)">

                <g [attr.transform]="'translate(' + PanX + ',' + PanY + ') scale(' + Scale + ')'">
                    <!-- Edges Layer -->
                    @for (edge of Edges; track edge.ID) {
                        <g>
                            <line
                                class="mj-edge-path"
                                [class.is-highlighted]="IsEdgeHighlighted(edge)"
                                [attr.x1]="GetNodeX(edge.SourceID)"
                                [attr.y1]="GetNodeY(edge.SourceID)"
                                [attr.x2]="GetNodeX(edge.TargetID)"
                                [attr.y2]="GetNodeY(edge.TargetID)"
                                (click)="OnEdgeClick(edge, $event)">
                            </line>
                            <text
                                class="mj-edge-text"
                                [attr.x]="(GetNodeX(edge.SourceID) + GetNodeX(edge.TargetID)) / 2"
                                [attr.y]="(GetNodeY(edge.SourceID) + GetNodeY(edge.TargetID)) / 2 - 4">
                                {{ edge.Label }}
                            </text>
                        </g>
                    }

                    <!-- Nodes Layer -->
                    @for (node of FilteredNodes; track node.ID) {
                        <g
                            class="mj-node-group"
                            [attr.transform]="'translate(' + (node.X || 0) + ',' + (node.Y || 0) + ')'"
                            (mousedown)="OnNodeMouseDown(node, $event)"
                            (click)="OnNodeClick(node, $event)">

                            <!-- Outer Selection Glow -->
                            @if (SelectedNode?.ID === node.ID) {
                                <circle r="36" fill="rgba(56, 189, 248, 0.2)" stroke="#38bdf8" stroke-width="2"></circle>
                            }

                            <!-- Node Body Circle -->
                            <circle
                                class="mj-node-circle"
                                [attr.r]="node.Radius || 26"
                                fill="#141f36"
                                [attr.stroke]="GetNodeColor(node)"
                                stroke-width="3">
                            </circle>

                            <!-- Node Icon Center -->
                            <circle [attr.r]="(node.Radius || 26) - 8" [attr.fill]="GetNodeColor(node)"></circle>

                            <!-- Labels -->
                            <text class="mj-node-label" [attr.y]="(node.Radius || 26) + 16">
                                {{ TruncateLabel(node.Label, 18) }}
                            </text>
                            @if (node.Sublabel) {
                                <text class="mj-node-sublabel" [attr.y]="(node.Radius || 26) + 28">
                                    {{ TruncateLabel(node.Sublabel, 20) }}
                                </text>
                            }
                        </g>
                    }
                </g>
            </svg>
        </div>
    `,
    styles: [GRAPH_VIEW_CSS]
})
export class GraphViewComponent implements OnInit, OnChanges, OnDestroy {
    private cdr = inject(ChangeDetectorRef);
    private navService = inject(NavigationService, { optional: true });

    @ViewChild('wrapper', { static: true }) public WrapperRef!: ElementRef<HTMLDivElement>;
    @ViewChild('svgCanvas', { static: true }) public CanvasRef!: ElementRef<SVGSVGElement>;

    // ── Inputs ────────────────────────────────────────────────────────
    @Input() public Nodes: GraphNode[] = [];
    @Input() public Edges: GraphEdge[] = [];
    @Input() public LayoutMode: GraphLayoutMode = 'force';
    @Input() public MaxHopDistance = 2;
    @Input() public SelectedNodeId?: string;
    @Input() public ShowToolbar = true;
    @Input() public ShowLegend = true;
    @Input() public ShowInspector = true;
    @Input() public Searchable = true;
    @Input() public AutoFitOnLoad = true;
    @Input() public Physics: GraphPhysicsConfig = {
        Repulsion: -500,
        LinkDistance: 130,
        Gravity: 0.05,
        Damping: 0.88,
        MaxIterations: 200
    };

    // ── Cancelable Before/After Outputs ────────────────────────────────
    @Output() public BeforeNodeSelect = new EventEmitter<BeforeNodeSelectEventArgs>();
    @Output() public NodeSelected = new EventEmitter<NodeSelectedEventArgs>();

    @Output() public BeforeEdgeSelect = new EventEmitter<BeforeEdgeSelectEventArgs>();
    @Output() public EdgeSelected = new EventEmitter<EdgeSelectedEventArgs>();

    @Output() public BeforeHopExpand = new EventEmitter<BeforeHopExpandEventArgs>();
    @Output() public HopExpanded = new EventEmitter<HopExpandedEventArgs>();

    @Output() public BeforeLayoutChange = new EventEmitter<BeforeLayoutChangeEventArgs>();
    @Output() public LayoutChanged = new EventEmitter<LayoutChangedEventArgs>();

    @Output() public BeforeNodeNavigate = new EventEmitter<BeforeNodeNavigateEventArgs>();
    @Output() public NodeNavigated = new EventEmitter<NodeNavigatedEventArgs>();

    @Output() public ViewportTransform = new EventEmitter<ViewportTransformEventArgs>();

    // ── Internal State ────────────────────────────────────────────────
    public FilteredNodes: GraphNode[] = [];
    public SelectedNode: GraphNode | null = null;
    public SelectedEdge: GraphEdge | null = null;
    public SearchQuery = '';

    public Scale = 1.0;
    public PanX = 200;
    public PanY = 150;
    public IsPanning = false;
    private panStartX = 0;
    private panStartY = 0;

    private draggedNode: GraphNode | null = null;
    private animationFrameId: number | null = null;

    public ngOnInit(): void {
        this.InitializePositions();
        this.ApplyFilters();
        this.SimulatePhysics();
    }

    public ngOnChanges(changes: SimpleChanges): void {
        if (changes['Nodes'] || changes['Edges']) {
            this.InitializePositions();
            this.ApplyFilters();
            this.SimulatePhysics();
        }
        if (changes['SelectedNodeId'] && this.SelectedNodeId) {
            const found = this.Nodes.find(n => n.ID === this.SelectedNodeId);
            if (found) this.SelectedNode = found;
        }
    }

    public ngOnDestroy(): void {
        if (this.animationFrameId !== null) {
            cancelAnimationFrame(this.animationFrameId);
        }
    }

    // ── Positioning & Physics Engine ──────────────────────────────────
    private InitializePositions(): void {
        const cx = 500;
        const cy = 300;
        const count = this.Nodes.length || 1;

        this.Nodes.forEach((node, idx) => {
            if (node.X === undefined || node.Y === undefined) {
                const angle = (idx / count) * 2 * Math.PI;
                const r = 120 + Math.random() * 80;
                node.X = cx + r * Math.cos(angle);
                node.Y = cy + r * Math.sin(angle);
                node.VX = 0;
                node.VY = 0;
            }
        });
    }

    public SimulatePhysics(): void {
        if (this.LayoutMode === 'circular') {
            this.ApplyCircularLayout();
            this.cdr.markForCheck();
            return;
        }

        let iteration = 0;
        const step = () => {
            if (iteration++ > this.Physics.MaxIterations) return;

            const cx = 500;
            const cy = 300;

            // 1. Repulsion between all node pairs
            for (let i = 0; i < this.Nodes.length; i++) {
                for (let j = i + 1; j < this.Nodes.length; j++) {
                    const a = this.Nodes[i];
                    const b = this.Nodes[j];
                    const dx = (b.X || 0) - (a.X || 0);
                    const dy = (b.Y || 0) - (a.Y || 0);
                    const distSq = dx * dx + dy * dy || 1;
                    const dist = Math.sqrt(distSq);

                    const force = this.Physics.Repulsion / (distSq * 0.5);
                    const fx = (dx / dist) * force;
                    const fy = (dy / dist) * force;

                    if (!a.FX) { a.VX = (a.VX || 0) - fx; a.VY = (a.VY || 0) - fy; }
                    if (!b.FX) { b.VX = (b.VX || 0) + fx; b.VY = (b.VY || 0) + fy; }
                }
            }

            // 2. Link Attraction
            this.Edges.forEach(edge => {
                const src = this.Nodes.find(n => n.ID === edge.SourceID);
                const tgt = this.Nodes.find(n => n.ID === edge.TargetID);
                if (src && tgt) {
                    const dx = (tgt.X || 0) - (src.X || 0);
                    const dy = (tgt.Y || 0) - (src.Y || 0);
                    const dist = Math.sqrt(dx * dx + dy * dy) || 1;
                    const displacement = dist - this.Physics.LinkDistance;

                    const force = displacement * 0.04;
                    const fx = (dx / dist) * force;
                    const fy = (dy / dist) * force;

                    if (!src.FX) { src.VX = (src.VX || 0) + fx; src.VY = (src.VY || 0) + fy; }
                    if (!tgt.FX) { tgt.VX = (tgt.VX || 0) - fx; tgt.VY = (tgt.VY || 0) - fy; }
                }
            });

            // 3. Gravity & Position Update
            this.Nodes.forEach(node => {
                if (node.FX) return;
                const gx = (cx - (node.X || cx)) * this.Physics.Gravity;
                const gy = (cy - (node.Y || cy)) * this.Physics.Gravity;

                node.VX = ((node.VX || 0) + gx) * this.Physics.Damping;
                node.VY = ((node.VY || 0) + gy) * this.Physics.Damping;

                node.X = (node.X || 0) + (node.VX || 0);
                node.Y = (node.Y || 0) + (node.VY || 0);
            });

            this.cdr.markForCheck();
            if (iteration < this.Physics.MaxIterations) {
                this.animationFrameId = requestAnimationFrame(step);
            }
        };

        if (this.animationFrameId !== null) cancelAnimationFrame(this.animationFrameId);
        this.animationFrameId = requestAnimationFrame(step);
    }

    private ApplyCircularLayout(): void {
        const cx = 500;
        const cy = 300;
        const r = 180;
        const count = this.Nodes.length || 1;

        this.Nodes.forEach((node, idx) => {
            const angle = (idx / count) * 2 * Math.PI;
            node.X = cx + r * Math.cos(angle);
            node.Y = cy + r * Math.sin(angle);
        });
    }

    // ── Public Programmatic Methods ───────────────────────────────────
    public ZoomIn(): void {
        this.Scale = Math.min(this.Scale * 1.2, 3.0);
        this.EmitViewport();
    }

    public ZoomOut(): void {
        this.Scale = Math.max(this.Scale / 1.2, 0.3);
        this.EmitViewport();
    }

    public FitToView(): void {
        this.Scale = 1.0;
        this.PanX = 120;
        this.PanY = 80;
        this.EmitViewport();
    }

    public Rearrange(): void {
        this.InitializePositions();
        this.SimulatePhysics();
    }

    public SetLayoutMode(mode: GraphLayoutMode): void {
        const beforeEvent = new BeforeLayoutChangeEventArgs(mode, this.LayoutMode);
        this.BeforeLayoutChange.emit(beforeEvent);
        if (beforeEvent.Cancel) return;

        const prev = this.LayoutMode;
        this.LayoutMode = mode;
        this.SimulatePhysics();
        this.LayoutChanged.emit(new LayoutChangedEventArgs(mode, prev));
    }

    public SelectNode(id: string): void {
        const node = this.Nodes.find(n => n.ID === id);
        if (node) this.OnNodeClick(node, new MouseEvent('click'));
    }

    public ClearSelection(): void {
        this.SelectedNode = null;
        this.SelectedEdge = null;
        this.cdr.markForCheck();
    }

    public SearchNodes(query: string): void {
        this.SearchQuery = query;
        this.ApplyFilters();
    }

    public ExpandHops(nodeId: string, depth: number): void {
        const node = this.Nodes.find(n => n.ID === nodeId);
        if (!node) return;

        const beforeEvent = new BeforeHopExpandEventArgs(node, (node.HopDistance || 0) + depth, node.HopDistance || 0);
        this.BeforeHopExpand.emit(beforeEvent);
        if (beforeEvent.Cancel) return;

        // Fire after event for host listener to fetch incremental relations
        this.HopExpanded.emit(new HopExpandedEventArgs(node, [], [], (node.HopDistance || 0) + depth));
    }

    // ── Event Handlers ────────────────────────────────────────────────
    public OnNodeClick(node: GraphNode, event: MouseEvent): void {
        event.stopPropagation();
        const beforeEvent = new BeforeNodeSelectEventArgs(node, this.SelectedNode);
        this.BeforeNodeSelect.emit(beforeEvent);
        if (beforeEvent.Cancel) return;

        const prev = this.SelectedNode;
        this.SelectedNode = node;
        this.SelectedEdge = null;
        this.NodeSelected.emit(new NodeSelectedEventArgs(node, prev));
        this.cdr.markForCheck();
    }

    public OnEdgeClick(edge: GraphEdge, event: MouseEvent): void {
        event.stopPropagation();
        const src = this.Nodes.find(n => n.ID === edge.SourceID) || null;
        const tgt = this.Nodes.find(n => n.ID === edge.TargetID) || null;

        const beforeEvent = new BeforeEdgeSelectEventArgs(edge, src, tgt);
        this.BeforeEdgeSelect.emit(beforeEvent);
        if (beforeEvent.Cancel) return;

        this.SelectedEdge = edge;
        this.EdgeSelected.emit(new EdgeSelectedEventArgs(edge, src, tgt));
        this.cdr.markForCheck();
    }

    public NavigateToEntity(node: GraphNode): void {
        const entityName = String(node.Data?.['EntityName'] || (node.Category === 'person' ? 'MJ_BizApps_Common: People' : 'MJ_BizApps_Common: Organizations'));
        const beforeEvent = new BeforeNodeNavigateEventArgs(node, entityName, node.ID);
        this.BeforeNodeNavigate.emit(beforeEvent);
        if (beforeEvent.Cancel) return;

        if (this.navService) {
            const pk = CompositeKey.FromID(node.ID);
            this.navService.OpenEntityRecord(entityName, pk);
        }
        this.NodeNavigated.emit(new NodeNavigatedEventArgs(node, entityName, node.ID));
    }

    // ── Mouse Drag & Pan Handlers ─────────────────────────────────────
    public OnCanvasMouseDown(event: MouseEvent): void {
        if (event.target === this.CanvasRef.nativeElement || (event.target as HTMLElement).tagName === 'svg') {
            this.IsPanning = true;
            this.panStartX = event.clientX - this.PanX;
            this.panStartY = event.clientY - this.PanY;
        }
    }

    public OnCanvasMouseMove(event: MouseEvent): void {
        if (this.IsPanning) {
            this.PanX = event.clientX - this.panStartX;
            this.PanY = event.clientY - this.panStartY;
            this.EmitViewport();
            this.cdr.markForCheck();
        } else if (this.draggedNode) {
            this.draggedNode.X = (event.clientX - this.PanX) / this.Scale;
            this.draggedNode.Y = (event.clientY - this.PanY) / this.Scale;
            this.cdr.markForCheck();
        }
    }

    public OnCanvasMouseUp(_event: MouseEvent): void {
        this.IsPanning = false;
        if (this.draggedNode) {
            this.draggedNode.FX = null;
            this.draggedNode.FY = null;
            this.draggedNode = null;
        }
    }

    public OnCanvasWheel(event: WheelEvent): void {
        event.preventDefault();
        const delta = event.deltaY > 0 ? 0.9 : 1.1;
        this.Scale = Math.min(Math.max(this.Scale * delta, 0.3), 3.0);
        this.EmitViewport();
        this.cdr.markForCheck();
    }

    public OnNodeMouseDown(node: GraphNode, event: MouseEvent): void {
        event.stopPropagation();
        this.draggedNode = node;
        node.FX = node.X;
        node.FY = node.Y;
    }

    private EmitViewport(): void {
        this.ViewportTransform.emit(new ViewportTransformEventArgs({ Scale: this.Scale, PanX: this.PanX, PanY: this.PanY }));
        this.cdr.markForCheck();
    }

    // ── Helpers ───────────────────────────────────────────────────────
    public ApplyFilters(): void {
        const q = this.SearchQuery.trim().toLowerCase();
        this.FilteredNodes = this.Nodes.filter(n => {
            return !q || n.Label.toLowerCase().includes(q) || (n.Sublabel && n.Sublabel.toLowerCase().includes(q));
        });
        this.cdr.markForCheck();
    }

    public GetNodeX(id: string): number {
        return this.Nodes.find(n => n.ID === id)?.X || 0;
    }

    public GetNodeY(id: string): number {
        return this.Nodes.find(n => n.ID === id)?.Y || 0;
    }

    public GetNodeColor(node: GraphNode): string {
        if (node.Color) return node.Color;
        switch (node.Category) {
            case 'person': return '#10b981';
            case 'organization': return '#38bdf8';
            case 'committee': return '#8b5cf6';
            case 'account': return '#f59e0b';
            default: return '#38bdf8';
        }
    }

    public GetNodeIcon(node: GraphNode): string {
        if (node.IconClass) return node.IconClass;
        switch (node.Category) {
            case 'person': return 'fa-solid fa-user';
            case 'organization': return 'fa-solid fa-building';
            case 'committee': return 'fa-solid fa-landmark';
            case 'account': return 'fa-solid fa-building-flag';
            default: return 'fa-solid fa-circle-dot';
        }
    }

    public GetNodeEdgeCount(id: string): number {
        return this.Edges.filter(e => e.SourceID === id || e.TargetID === id).length;
    }

    public IsEdgeHighlighted(edge: GraphEdge): boolean {
        return this.SelectedEdge?.ID === edge.ID || this.SelectedNode?.ID === edge.SourceID || this.SelectedNode?.ID === edge.TargetID;
    }

    public TruncateLabel(text: string, maxLen: number): string {
        if (!text) return '';
        return text.length > maxLen ? text.substring(0, maxLen - 1) + '…' : text;
    }
}
