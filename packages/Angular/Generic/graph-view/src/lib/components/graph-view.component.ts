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
import { UUIDsEqual } from '@memberjunction/global';
import * as d3 from 'd3';
import type {
    GraphNode,
    GraphEdge,
    GraphLayoutMode,
    GraphNodeCategory,
    GraphCategoryConfig,
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

export const DEFAULT_GRAPH_CATEGORIES: GraphCategoryConfig[] = [
    { Category: 'person', Label: 'Person', Color: '#10b981', IconClass: 'fa-solid fa-user' },
    { Category: 'organization', Label: 'Organization', Color: '#38bdf8', IconClass: 'fa-solid fa-building' },
    { Category: 'committee', Label: 'Committee', Color: '#8b5cf6', IconClass: 'fa-solid fa-landmark' },
    { Category: 'account', Label: 'Holding / Account', Color: '#f59e0b', IconClass: 'fa-solid fa-building-flag' },
    { Category: 'asset', Label: 'Asset', Color: '#ec4899', IconClass: 'fa-solid fa-gem' },
    { Category: 'group', Label: 'Group', Color: '#06b6d4', IconClass: 'fa-solid fa-users' },
    { Category: 'custom', Label: 'Custom', Color: '#64748b', IconClass: 'fa-solid fa-circle-nodes' }
];

const DYNAMIC_CATEGORY_PALETTE = [
    '#10b981', '#38bdf8', '#8b5cf6', '#f59e0b', '#ec4899',
    '#06b6d4', '#84cc16', '#f43f5e', '#a855f7', '#14b8a6'
];

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

            <!-- 2. Floating Dynamic Category Legend -->
            @if (ShowLegend && ActiveCategories.length > 0) {
                <div class="mj-graph-legend">
                    @for (cat of ActiveCategories; track cat.Category) {
                        <div class="mj-graph-legend-item">
                            <div class="mj-graph-legend-dot" [style.background]="cat.Color"></div>
                            {{ cat.Label }}
                        </div>
                    }
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
                        <div style="overflow: hidden; flex: 1;">
                            <div style="font-size: 13px; font-weight: 700; color: #fff; text-overflow: ellipsis; overflow: hidden; white-space: nowrap;">
                                {{ SelectedNode.Label }}
                            </div>
                            <div style="display: flex; align-items: center; gap: 6px; margin-top: 3px;">
                                <span style="font-size: 11px; color: var(--mj-text-secondary);">
                                    {{ SelectedNode.Sublabel || SelectedNode.Category }}
                                </span>
                                @if (IsFocalNode(SelectedNode)) {
                                    <span style="font-size: 10px; padding: 1px 6px; border-radius: 9999px; background: rgba(56, 189, 248, 0.15); color: #38bdf8; font-weight: 600; border: 1px solid rgba(56, 189, 248, 0.3);">Current Record</span>
                                }
                            </div>
                        </div>
                    </div>

                    <div style="font-size: 11.5px; color: var(--mj-text-secondary); line-height: 1.45;">
                        Direct Connected Edges: <strong>{{ GetNodeEdgeCount(SelectedNode.ID) }}</strong>
                    </div>

                    <div class="mj-graph-inspector-actions">
                        @if (!IsFocalNode(SelectedNode)) {
                            <button
                                type="button"
                                class="mj-graph-tool-btn active"
                                style="justify-content: center; width: 100%;"
                                (click)="NavigateToEntity(SelectedNode)">
                                <i class="fa-solid fa-arrow-up-right-from-square"></i> Open Entity Form
                            </button>
                        }
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
                            (click)="OnNodeClick(node, $event)"
                            (dblclick)="NavigateToEntity(node)">

                            <!-- Outer Selection / Focal Halo -->
                            @if (IsNodeSelected(node)) {
                                <circle r="36" fill="rgba(56, 189, 248, 0.2)" stroke="#38bdf8" stroke-width="2"></circle>
                            } @else if (IsFocalNode(node)) {
                                <circle r="34" fill="none" stroke="rgba(56, 189, 248, 0.45)" stroke-width="2" stroke-dasharray="4 3"></circle>
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
    @Input() public Categories: GraphCategoryConfig[] = DEFAULT_GRAPH_CATEGORIES;
    @Input() public LayoutMode: GraphLayoutMode = 'force';
    @Input() public MaxHopDistance = 2;
    @Input() public SelectedNodeId?: string;
    @Input() public FocalNodeId?: string;
    @Input() public AutoOpenInspector = false;
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
    private simulation: d3.Simulation<GraphNode, d3.SimulationLinkDatum<GraphNode>> | null = null;

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
            const found = this.Nodes.find(n => UUIDsEqual(n.ID, this.SelectedNodeId));
            if (found && this.AutoOpenInspector) {
                this.SelectedNode = found;
            }
        }
    }

    public ngOnDestroy(): void {
        if (this.simulation) {
            this.simulation.stop();
            this.simulation = null;
        }
    }

    // ── Positioning & D3 Physics Engine ──────────────────────────────────
    private InitializePositions(): void {
        const cx = this.GetContainerWidth() / 2 || 400;
        const cy = this.GetContainerHeight() / 2 || 250;
        const count = this.Nodes.length || 1;

        this.Nodes.forEach((node, idx) => {
            if (node.x === undefined || node.y === undefined) {
                if (node.X !== undefined && node.Y !== undefined) {
                    node.x = node.X;
                    node.y = node.Y;
                } else {
                    const angle = (idx / count) * 2 * Math.PI;
                    const r = 100 + Math.random() * 60;
                    node.x = cx + r * Math.cos(angle);
                    node.y = cy + r * Math.sin(angle);
                    node.X = node.x;
                    node.Y = node.y;
                }
                node.vx = 0;
                node.vy = 0;
                node.VX = 0;
                node.VY = 0;
            }
        });
    }

    public SimulatePhysics(): void {
        if (this.LayoutMode === 'circular') {
            this.ApplyCircularLayout();
            if (this.AutoFitOnLoad) {
                this.AutoFitToView();
            }
            this.cdr.markForCheck();
            return;
        }

        if (this.simulation) {
            this.simulation.stop();
            this.simulation = null;
        }

        const cx = this.GetContainerWidth() / 2 || 400;
        const cy = this.GetContainerHeight() / 2 || 250;

        // Build links clone for D3 simulation
        const links: d3.SimulationLinkDatum<GraphNode>[] = this.Edges.map(e => ({
            ...e,
            source: e.SourceID,
            target: e.TargetID
        }));

        this.simulation = d3.forceSimulation<GraphNode>(this.Nodes)
            .force('link', d3.forceLink<GraphNode, d3.SimulationLinkDatum<GraphNode>>(links)
                .id((d: GraphNode) => d.ID)
                .distance(this.Physics.LinkDistance || 120))
            .force('charge', d3.forceManyBody<GraphNode>()
                .strength(this.Physics.Repulsion || -450)
                .distanceMax(700))
            .force('collide', d3.forceCollide<GraphNode>((d: GraphNode) => (d.Radius || 26) + 16).iterations(2))
            .force('center', d3.forceCenter<GraphNode>(cx, cy));

        // Headless Pre-Warming: run 80 ticks synchronously in memory so the SVG renders resting immediately
        this.simulation.stop();
        for (let i = 0; i < 90; ++i) {
            this.simulation.tick();
        }

        this.SyncCoordinates();

        // Auto-center & fit into view
        if (this.AutoFitOnLoad) {
            this.AutoFitToView();
        }

        // Attach live tick handler for interactive drag & drop
        this.simulation.on('tick', () => {
            this.SyncCoordinates();
            this.cdr.markForCheck();
        });

        this.cdr.markForCheck();
    }

    private SyncCoordinates(): void {
        for (const n of this.Nodes) {
            n.X = n.x;
            n.Y = n.y;
            n.VX = n.vx;
            n.VY = n.vy;
        }
    }

    private ApplyCircularLayout(): void {
        const cx = this.GetContainerWidth() / 2 || 400;
        const cy = this.GetContainerHeight() / 2 || 250;
        const r = Math.min(cx, cy) * 0.7 || 160;
        const count = this.Nodes.length || 1;

        this.Nodes.forEach((node, idx) => {
            const angle = (idx / count) * 2 * Math.PI;
            node.x = cx + r * Math.cos(angle);
            node.y = cy + r * Math.sin(angle);
            node.X = node.x;
            node.Y = node.y;
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
        this.AutoFitToView(40);
    }

    public AutoFitToView(padding = 40): void {
        if (!this.Nodes || this.Nodes.length === 0) return;

        const width = this.GetContainerWidth() || 800;
        const height = this.GetContainerHeight() || 420;

        let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
        for (const n of this.Nodes) {
            const nx = n.x ?? n.X ?? 0;
            const ny = n.y ?? n.Y ?? 0;
            const r = (n.Radius || 26) + 20; // include badge & labels
            if (nx - r < minX) minX = nx - r;
            if (nx + r > maxX) maxX = nx + r;
            if (ny - r < minY) minY = ny - r;
            if (ny + r > maxY) maxY = ny + r;
        }

        if (!isFinite(minX) || !isFinite(maxX) || !isFinite(minY) || !isFinite(maxY)) return;

        const bboxW = Math.max(maxX - minX, 100);
        const bboxH = Math.max(maxY - minY, 100);

        const scaleX = (width - padding * 2) / bboxW;
        const scaleY = (height - padding * 2) / bboxH;
        const targetScale = Math.min(Math.max(Math.min(scaleX, scaleY), 0.4), 1.25);

        this.Scale = targetScale;
        this.PanX = (width - (minX + maxX) * this.Scale) / 2;
        this.PanY = (height - (minY + maxY) * this.Scale) / 2;

        this.EmitViewport();
        this.cdr.markForCheck();
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
        const node = this.Nodes.find(n => UUIDsEqual(n.ID, id));
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
        const node = this.Nodes.find(n => UUIDsEqual(n.ID, nodeId));
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
        const src = this.Nodes.find(n => UUIDsEqual(n.ID, edge.SourceID)) || null;
        const tgt = this.Nodes.find(n => UUIDsEqual(n.ID, edge.TargetID)) || null;

        const beforeEvent = new BeforeEdgeSelectEventArgs(edge, src, tgt);
        this.BeforeEdgeSelect.emit(beforeEvent);
        if (beforeEvent.Cancel) return;

        this.SelectedEdge = edge;
        this.EdgeSelected.emit(new EdgeSelectedEventArgs(edge, src, tgt));
        this.cdr.markForCheck();
    }

    public NavigateToEntity(node: GraphNode): void {
        const rawId = String(node.Data?.['ID'] || node.ID).replace(/^(person|org|account|committee|custom):/, '');
        const entityName = String(node.Data?.['EntityName'] || (node.Category === 'person' ? 'MJ_BizApps_Common: People' : 'MJ_BizApps_Common: Organizations'));
        const beforeEvent = new BeforeNodeNavigateEventArgs(node, entityName, rawId);
        this.BeforeNodeNavigate.emit(beforeEvent);
        if (beforeEvent.Cancel) return;

        if (this.navService) {
            const pk = CompositeKey.FromID(rawId);
            this.navService.OpenEntityRecord(entityName, pk);
        }
        this.NodeNavigated.emit(new NodeNavigatedEventArgs(node, entityName, rawId));
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
            const coords = this.GetCanvasRelativeCoords(event);
            this.draggedNode.fx = coords.x;
            this.draggedNode.fy = coords.y;
            this.draggedNode.x = coords.x;
            this.draggedNode.y = coords.y;
            this.draggedNode.X = coords.x;
            this.draggedNode.Y = coords.y;
            this.cdr.markForCheck();
        }
    }

    public OnCanvasMouseUp(_event: MouseEvent): void {
        this.IsPanning = false;
        if (this.draggedNode) {
            this.draggedNode.fx = null;
            this.draggedNode.fy = null;
            this.draggedNode = null;
            if (this.simulation) {
                this.simulation.alphaTarget(0);
            }
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
        node.fx = node.x ?? node.X;
        node.fy = node.y ?? node.Y;
        if (this.simulation) {
            this.simulation.alphaTarget(0.3).restart();
        }
    }

    private EmitViewport(): void {
        this.ViewportTransform.emit(new ViewportTransformEventArgs({ Scale: this.Scale, PanX: this.PanX, PanY: this.PanY }));
        this.cdr.markForCheck();
    }

    private GetCanvasRelativeCoords(event: MouseEvent): { x: number; y: number } {
        const canvas = this.CanvasRef?.nativeElement;
        if (!canvas) {
            return {
                x: (event.clientX - this.PanX) / this.Scale,
                y: (event.clientY - this.PanY) / this.Scale
            };
        }
        const rect = canvas.getBoundingClientRect();
        const mouseX = event.clientX - rect.left;
        const mouseY = event.clientY - rect.top;
        return {
            x: (mouseX - this.PanX) / this.Scale,
            y: (mouseY - this.PanY) / this.Scale
        };
    }

    private GetContainerWidth(): number {
        return this.CanvasRef?.nativeElement?.clientWidth || this.WrapperRef?.nativeElement?.clientWidth || 800;
    }

    private GetContainerHeight(): number {
        return this.CanvasRef?.nativeElement?.clientHeight || this.WrapperRef?.nativeElement?.clientHeight || 420;
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
        const node = this.Nodes.find(n => UUIDsEqual(n.ID, id));
        return node ? (node.X ?? node.x ?? 0) : 0;
    }

    public GetNodeY(id: string): number {
        const node = this.Nodes.find(n => UUIDsEqual(n.ID, id));
        return node ? (node.Y ?? node.y ?? 0) : 0;
    }

    public GetCategoryConfig(category?: string): GraphCategoryConfig {
        const key = String(category || '').toLowerCase();
        const found = this.Categories?.find(c => c.Category.toLowerCase() === key);
        if (found) return found;

        const builtin = DEFAULT_GRAPH_CATEGORIES.find(c => c.Category.toLowerCase() === key);
        if (builtin) return builtin;

        // Deterministic palette hash for arbitrary consumer-defined categories
        const hash = Math.abs(key.split('').reduce((acc, ch) => ((acc << 5) - acc) + ch.charCodeAt(0), 0));
        const fallbackColor = DYNAMIC_CATEGORY_PALETTE[hash % DYNAMIC_CATEGORY_PALETTE.length];
        const formattedLabel = category ? category.charAt(0).toUpperCase() + category.slice(1) : 'Item';
        return {
            Category: category || 'custom',
            Label: formattedLabel,
            Color: fallbackColor,
            IconClass: 'fa-solid fa-circle-dot'
        };
    }

    public get ActiveCategories(): GraphCategoryConfig[] {
        const present = new Set<string>();
        for (const n of this.Nodes) {
            if (n.Category) present.add(n.Category.toLowerCase());
        }
        const result: GraphCategoryConfig[] = [];
        for (const catKey of present) {
            result.push(this.GetCategoryConfig(catKey));
        }
        return result;
    }

    public GetCategoryLabel(category?: string): string {
        return this.GetCategoryConfig(category).Label;
    }

    public GetNodeColor(node: GraphNode): string {
        return node.Color ?? this.GetCategoryConfig(node.Category).Color;
    }

    public GetNodeIcon(node: GraphNode): string {
        return node.IconClass ?? this.GetCategoryConfig(node.Category).IconClass ?? 'fa-solid fa-circle-dot';
    }

    public GetNodeEdgeCount(id: string): number {
        return this.Edges.filter(e => UUIDsEqual(e.SourceID, id) || UUIDsEqual(e.TargetID, id)).length;
    }

    public IsEdgeHighlighted(edge: GraphEdge): boolean {
        return UUIDsEqual(this.SelectedEdge?.ID, edge.ID) ||
            UUIDsEqual(this.SelectedNode?.ID, edge.SourceID) ||
            UUIDsEqual(this.SelectedNode?.ID, edge.TargetID);
    }

    /**
     * Whether this node is the selected one. Exists as a method because the template cannot call
     * an imported function directly, and the comparison must go through UUIDsEqual rather than ===.
     */
    public IsNodeSelected(node: GraphNode): boolean {
        return UUIDsEqual(this.SelectedNode?.ID, node.ID);
    }

    public TruncateLabel(text: string, maxLen: number): string {
        if (!text) return '';
        return text.length > maxLen ? text.substring(0, maxLen - 1) + '…' : text;
    }

    public IsFocalNode(node: GraphNode): boolean {
        if (!node || !this.FocalNodeId) return false;
        const focalClean = this.FocalNodeId.replace(/^(person|org|account|committee|custom):/, '').toLowerCase();
        const nodeClean = node.ID.replace(/^(person|org|account|committee|custom):/, '').toLowerCase();
        const dataClean = node.Data?.['ID'] ? String(node.Data['ID']).toLowerCase() : '';
        return UUIDsEqual(node.ID, this.FocalNodeId) || nodeClean === focalClean || dataClean === focalClean;
    }
}
