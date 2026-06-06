/**
 * @fileoverview SVG scatter plot component for cluster visualization.
 *
 * `ClusterScatterComponent` renders an interactive 2D scatter plot where each
 * dot represents a clustered entity record.  It supports:
 *
 * - **Zoom / pan** via mouse wheel and drag (SVG viewBox manipulation)
 * - **Tooltips** on hover showing point metadata
 * - **Legend** overlay in the bottom-left corner
 * - **Radial gradient glow** per cluster centroid
 * - **Cancelable `BeforeXXX` events** so consumers can intercept interactions
 * - **Programmatic selection and zoom** via public methods
 * - **Full customization** of dot radius, opacity, color palette, and more
 *
 * @example
 * ```html
 * <mj-cluster-scatter
 *     [Points]="result.Points"
 *     [Clusters]="result.Clusters"
 *     [DotRadius]="6"
 *     [ShowTooltip]="true"
 *     [ColorPalette]="['#ff0000','#00ff00','#0000ff']"
 *     (BeforePointClick)="onBeforeClick($event)"
 *     (PointClicked)="onPointClicked($event)"
 *     (AfterClusteringComplete)="onClustered($event)"
 *     (SelectionChanged)="onSelectionChanged($event)">
 * </mj-cluster-scatter>
 * ```
 */

import {
    Component,
    Input,
    Output,
    EventEmitter,
    ElementRef,
    ChangeDetectorRef,
    AfterViewInit,
    OnDestroy,
    OnChanges,
    SimpleChanges,
    ViewChild,
    ViewEncapsulation,
    inject,
} from '@angular/core';
import {
    ClusterPoint,
    ClusterInfo,
    ClusterVisualizationResult,
    CancelableEvent,
    ViewportRect,
    ViewportTransform,
    ClusterSelectedEvent,
    CLUSTER_COLORS,
} from './clustering.types';

@Component({
    standalone: false,
    selector: 'mj-cluster-scatter',
    templateUrl: './cluster-scatter.component.html',
    styleUrls: ['./cluster-scatter.component.css'],
    encapsulation: ViewEncapsulation.None,
})
export class ClusterScatterComponent implements AfterViewInit, OnDestroy, OnChanges {
    private cdr = inject(ChangeDetectorRef);

    // ================================================================
    // Data Inputs
    // ================================================================

    /**
     * Array of 2D-projected points to render.
     *
     * Each point carries its cluster assignment, label, and metadata.
     * Typically produced by `ClusteringService.RunPipeline()`.
     */
    @Input() Points: ClusterPoint[] = [];

    /**
     * Cluster summary information used for the legend and color mapping.
     */
    @Input() Clusters: ClusterInfo[] = [];

    /**
     * Legend / color mode. `'cluster'` (default) colors each point by its assigned
     * cluster; `'entity'` colors by the point's source entity (`Metadata.EntityName`),
     * which is the useful mode for multi-entity analyses.
     */
    @Input() ColorBy: 'cluster' | 'entity' = 'cluster';

    /**
     * When `true`, a semi-transparent loading overlay is displayed
     * on top of the scatter plot.
     */
    @Input() IsLoading = false;

    // ================================================================
    // Customization Inputs
    // ================================================================

    /**
     * Base radius (in SVG units) for each data point dot.
     *
     * @default 5
     */
    @Input() DotRadius = 5;

    /**
     * Base opacity for data point dots (0 to 1).
     *
     * When a point is hovered, non-hovered points are dimmed below this value.
     *
     * @default 0.75
     */
    @Input() DotOpacity = 0.75;

    /**
     * Radius used for the highlight ring on hovered or selected points.
     *
     * @default 8
     */
    @Input() HighlightRadius = 8;

    /**
     * Whether to show the color-coded cluster legend overlay.
     *
     * @default true
     */
    @Input() ShowLegend = true;

    /**
     * Whether to show the tooltip popup on point hover.
     *
     * When `false`, `BeforePointHover` and `PointHovered` still fire but
     * the built-in tooltip DOM is not rendered.
     *
     * @default true
     */
    @Input() ShowTooltip = true;

    /**
     * Which metadata keys to display inside the tooltip.
     *
     * When empty (the default), **all** metadata keys are shown.
     *
     * @default []
     *
     * @example
     * ```html
     * <mj-cluster-scatter [TooltipFields]="['EntityRecordID', 'Score']">
     * </mj-cluster-scatter>
     * ```
     */
    @Input() TooltipFields: string[] = [];

    /**
     * Ordered list of metadata field keys for prioritized display in tooltips
     * and the detail panel. When set, fields are displayed in this order instead
     * of raw metadata key order. Fields not in this list appear after the
     * prioritized fields.
     *
     * Typically computed from entity metadata (DefaultInView, Sequence) by the
     * consuming component and passed in.
     *
     * @default [] (no prioritization — original key order)
     */
    @Input() FieldPriority: string[] = [];

    /**
     * Map of field names to human-readable display names.
     * Used to show "First Name" instead of "FirstName" in tooltips and detail panels.
     * If a field is not in this map, the raw key is shown.
     *
     * @default {} (use raw key names)
     */
    @Input() FieldDisplayNames: Record<string, string> = {};

    /**
     * The entity name for metadata-driven field display in tooltips and
     * detail panels. When set, the mj-entity-card component uses EntityInfo
     * to prioritize fields by IsNameField and DefaultInView.
     */
    @Input() EntityName: string | null = null;

    /**
     * Override the default cluster color palette.
     *
     * Colors are assigned to clusters by index: cluster 0 gets
     * `ColorPalette[0]`, cluster 1 gets `ColorPalette[1]`, etc.
     * Wraps around when there are more clusters than colors.
     *
     * @default CLUSTER_COLORS (10 accessible colors)
     */
    @Input() ColorPalette: string[] = [];

    /**
     * Enable or disable zoom via mouse wheel.
     *
     * @default true
     */
    @Input() EnableZoom = true;

    /**
     * Enable or disable panning via click-and-drag.
     *
     * @default true
     */
    @Input() EnablePan = true;

    /**
     * Whether scatter plot transitions (zoom, highlight) should be animated.
     *
     * @default true
     */
    @Input() AnimateTransitions = true;

    /**
     * Externally controlled set of selected point IDs (by `VectorKey`).
     *
     * When provided, the component renders selection rings for matching
     * points and emits `SelectionChanged` when the user modifies the set
     * interactively.
     *
     * @default (empty Set)
     *
     * @example
     * ```html
     * <mj-cluster-scatter
     *     [SelectedPointIds]="mySelectedIds"
     *     (SelectionChanged)="mySelectedIds = $event">
     * </mj-cluster-scatter>
     * ```
     */
    @Input() SelectedPointIds: Set<string> = new Set<string>();

    /**
     * Minimum zoom level (smallest allowed viewBox multiplier).
     *
     * A value of `0.5` means the user can zoom in until the viewBox is
     * half of the default 1000x700 size.
     *
     * @default 0.5
     */
    @Input() MinZoom = 0.5;

    /**
     * Maximum zoom level (largest allowed viewBox multiplier).
     *
     * A value of `10` means the user can zoom out until the viewBox is
     * 10x the default 1000x700 size.
     *
     * @default 10
     */
    @Input() MaxZoom = 10;

    // ================================================================
    // Outputs (standard events)
    // ================================================================

    /**
     * Emitted when a point is clicked (after `BeforePointClick` completes
     * without cancellation).
     */
    @Output() PointClicked = new EventEmitter<ClusterPoint>();

    /**
     * Emitted when the user clicks "Open Record" in the detail panel.
     * The parent should wire this to `NavigationService.OpenEntityRecord()`.
     */
    @Output() OpenRecordRequested = new EventEmitter<ClusterPoint>();

    /**
     * Emitted when the mouse enters or leaves a data point.
     * Emits `null` on mouse-leave.
     */
    @Output() PointHovered = new EventEmitter<ClusterPoint | null>();

    // ================================================================
    // Outputs (cancelable "Before" events)
    // ================================================================

    /**
     * Fires **before** `PointClicked`.  Set `event.Cancel = true` to
     * suppress the click entirely.
     *
     * @example
     * ```typescript
     * onBeforeClick(event: CancelableEvent<ClusterPoint>): void {
     *     if (event.Data.ClusterId === -1) {
     *         event.Cancel = true; // ignore outlier clicks
     *     }
     * }
     * ```
     */
    @Output() BeforePointClick = new EventEmitter<CancelableEvent<ClusterPoint>>();

    /**
     * Fires **before** the tooltip is shown on hover.  Set
     * `event.Cancel = true` to suppress the tooltip for this point.
     */
    @Output() BeforePointHover = new EventEmitter<CancelableEvent<ClusterPoint>>();

    /**
     * Fires **before** a zoom or pan operation is applied.  Set
     * `event.Cancel = true` to reject the viewport change.
     *
     * The payload contains the **proposed** viewport rectangle.
     */
    @Output() BeforeZoom = new EventEmitter<CancelableEvent<ViewportRect>>();

    // ================================================================
    // Outputs (informational events)
    // ================================================================

    /**
     * Fires after new `Points` and `Clusters` are received and centroids
     * have been computed, delivering the full visualization result.
     */
    @Output() AfterClusteringComplete = new EventEmitter<ClusterVisualizationResult>();

    /**
     * Fires when the user clicks a cluster label or legend swatch.
     */
    @Output() ClusterSelected = new EventEmitter<ClusterSelectedEvent>();

    /**
     * Fires whenever the set of selected point IDs changes
     * (via user click or programmatic `SelectPoints` / `ClearSelection`).
     */
    @Output() SelectionChanged = new EventEmitter<Set<string>>();

    /**
     * Fires after every zoom or pan that changes the visible viewport.
     */
    @Output() ViewportChanged = new EventEmitter<ViewportRect>();

    /**
     * Fires when the user edits a cluster label inline.
     * Payload: `{ ClusterId, OldLabel, NewLabel }`.
     */
    @Output() LabelEdited = new EventEmitter<{ ClusterId: number; OldLabel: string; NewLabel: string }>();

    // ================================================================
    // Label Editing State
    // ================================================================

    /** The cluster ID currently being edited, or null if none. */
    public EditingClusterId: number | null = null;
    /** The draft label text during editing. */
    public EditingLabelDraft = '';

    /** Start inline editing for a cluster label. */
    public StartLabelEdit(cluster: ClusterInfo, event: MouseEvent): void {
        event.stopPropagation();
        this.EditingClusterId = cluster.Id;
        this.EditingLabelDraft = cluster.Label;
        this.cdr.detectChanges();
    }

    /** Commit the edited label. */
    public CommitLabelEdit(cluster: ClusterInfo): void {
        const oldLabel = cluster.Label;
        const newLabel = this.EditingLabelDraft.trim();
        if (newLabel.length > 0 && newLabel !== oldLabel) {
            cluster.Label = newLabel;
            this.LabelEdited.emit({ ClusterId: cluster.Id, OldLabel: oldLabel, NewLabel: newLabel });
        }
        this.EditingClusterId = null;
        this.cdr.detectChanges();
    }

    /** Cancel editing. */
    public CancelLabelEdit(): void {
        this.EditingClusterId = null;
        this.cdr.detectChanges();
    }

    /** Handle keydown in the edit input. */
    public OnLabelEditKeydown(event: KeyboardEvent, cluster: ClusterInfo): void {
        if (event.key === 'Enter') {
            this.CommitLabelEdit(cluster);
        } else if (event.key === 'Escape') {
            this.CancelLabelEdit();
        }
    }

    // ================================================================
    // Internal State
    // ================================================================

    /** SVG viewBox parameters: [minX, minY, width, height]. */
    private _viewBox = [0, 0, 1000, 700];

    /** Cached viewBox string for template binding (avoids NG0100 on recalc). */
    public ViewBoxString = '0 0 1000 700';

    public get ViewBox(): number[] {
        return this._viewBox;
    }

    public set ViewBox(value: number[]) {
        this._viewBox = value;
        this.ViewBoxString = value.join(' ');
    }

    /** Get the current viewport transform for saving/restoring. */
    public GetViewportTransform(): ViewportTransform {
        return {
            TranslateX: this.ViewBox[0],
            TranslateY: this.ViewBox[1],
            Scale: this.defaultWidth / this.ViewBox[2],
        };
    }

    /** Restore a previously saved viewport transform. */
    public SetViewportTransform(vt: ViewportTransform): void {
        const width = this.defaultWidth / vt.Scale;
        const height = this.defaultHeight / vt.Scale;
        this.ViewBox = [vt.TranslateX, vt.TranslateY, width, height];
    }

    /** Currently hovered point (null when idle). */
    public HoveredPoint: ClusterPoint | null = null;
    /** Screen-space tooltip X position. */
    public TooltipX = 0;
    /** Screen-space tooltip Y position. */
    public TooltipY = 0;
    /** Currently highlighted (single-clicked) point key. */
    public HighlightedKey: string | null = null;

    /** Background grid lines for visual orientation. */
    public HorizontalGridLines: number[] = [175, 350, 525];
    /** Background vertical grid lines. */
    public VerticalGridLines: number[] = [250, 500, 750];

    /** Computed cluster centroids used for radial glow effects. */
    public ClusterCentroids: Array<{ ClusterId: number; Cx: number; Cy: number; R: number; Color: string }> = [];

    /** Filtered metadata entries for the tooltip (computed on hover). */
    public TooltipEntries: Array<{ Key: string; Value: unknown }> = [];

    // ================================================================
    // Detail Panel State
    // ================================================================

    /** The currently selected point shown in the detail panel. */
    public SelectedPoint: ClusterPoint | null = null;

    /** Whether the detail panel is visible. */
    public ShowDetailPanel = false;

    /** Metadata entries for the detail panel (computed on selection). */
    public DetailEntries: Array<{ Key: string; Value: unknown }> = [];

    /** Cluster members for the selected point's cluster. */
    public ClusterMembers: ClusterPoint[] = [];

    /** Whether the cluster members list is expanded. */
    public ClusterMembersExpanded = true;

    @ViewChild('svgElement', { static: false }) private svgRef!: ElementRef<SVGSVGElement>;

    // Pan/zoom state
    private isPanning = false;
    private panStartX = 0;
    private panStartY = 0;
    private panStartViewBox = [0, 0, 1000, 700];
    // 3D orbit-drag state
    private isRotating = false;
    private rotateStartX = 0;
    private rotateStartY = 0;
    private rotateStartYaw = 0;
    private rotateStartPitch = 0;
    private boundOnMouseMove: ((e: MouseEvent) => void) | null = null;
    private boundOnMouseUp: ((e: MouseEvent) => void) | null = null;

    /** Default viewBox dimensions used for zoom-limit calculations. */
    private readonly defaultWidth = 1000;
    private readonly defaultHeight = 700;

    // ================================================================
    // Lifecycle
    // ================================================================

    ngAfterViewInit(): void {
        this.boundOnMouseMove = this.onMouseMove.bind(this);
        this.boundOnMouseUp = this.onMouseUp.bind(this);
        document.addEventListener('mousemove', this.boundOnMouseMove);
        document.addEventListener('mouseup', this.boundOnMouseUp);
    }

    ngOnDestroy(): void {
        if (this.boundOnMouseMove) document.removeEventListener('mousemove', this.boundOnMouseMove);
        if (this.boundOnMouseUp) document.removeEventListener('mouseup', this.boundOnMouseUp);
    }

    ngOnChanges(changes: SimpleChanges): void {
        this.computeCentroids();

        // Emit AfterClusteringComplete when new data arrives
        if ((changes['Points'] || changes['Clusters']) && this.Points.length > 0 && this.Clusters.length > 0) {
            this.AfterClusteringComplete.emit({
                Points: this.Points,
                Clusters: this.Clusters,
                Metrics: {
                    SilhouetteScore: 0,
                    ClusterCount: this.Clusters.length,
                    ComputationTimeMs: 0,
                    RecordCount: this.Points.length,
                    OutlierCount: this.Points.filter(p => p.ClusterId < 0).length,
                },
                Config: {
                    EntityName: '',
                    EntityDocumentID: '',
                    Algorithm: 'kmeans',
                    K: this.Clusters.length,
                    Epsilon: 0,
                    MinPoints: 0,
                    DistanceMetric: 'cosine',
                    MaxRecords: this.Points.length,
                    Filter: '',
                },
            });
        }
    }

    // ================================================================
    // Template Helpers
    // ================================================================

    /**
     * Returns the current SVG `viewBox` as a space-separated string.
     *
     * @returns e.g. `"0 0 1000 700"`
     */
    public GetViewBoxString(): string {
        return this.ViewBox.join(' ');
    }

    /**
     * Resolve the display color for a given point based on its cluster
     * assignment and the active `ColorPalette`.
     *
     * @param point  The point to colorize.
     * @returns CSS color string.
     */
    public GetPointColor(point: ClusterPoint): string {
        if (this.ColorBy === 'entity') {
            return this.getEntityColor(point);
        }
        if (point.ClusterId < 0) return '#64748b'; // outlier gray
        const palette = this.getActivePalette();
        const cluster = this.Clusters.find(c => c.Id === point.ClusterId);
        return cluster?.Color ?? palette[point.ClusterId % palette.length];
    }

    // ================================================================
    // Color-by-entity (multi-entity analyses)
    // ================================================================

    /** Stable entity-name → color map, assigned in first-seen order. */
    private entityColorMap = new Map<string, string>();

    /** Resolve a color for a point keyed by its source entity name. */
    private getEntityColor(point: ClusterPoint): string {
        const name = (point.Metadata?.['EntityName'] as string) || (point.Metadata?.['Entity'] as string) || 'Unknown';
        let color = this.entityColorMap.get(name);
        if (!color) {
            const palette = this.getActivePalette();
            color = palette[this.entityColorMap.size % palette.length];
            this.entityColorMap.set(name, color);
        }
        return color;
    }

    /** Distinct source entities present in the data (for the entity legend). */
    public get EntityLegend(): Array<{ Name: string; Color: string; Count: number }> {
        if (this.ColorBy !== 'entity') return [];
        const counts = new Map<string, number>();
        for (const p of this.Points) {
            const name = (p.Metadata?.['EntityName'] as string) || (p.Metadata?.['Entity'] as string) || 'Unknown';
            counts.set(name, (counts.get(name) ?? 0) + 1);
        }
        return [...counts.entries()].map(([Name, Count]) => ({
            Name,
            Count,
            Color: this.getEntityColor({ Metadata: { EntityName: Name } } as unknown as ClusterPoint),
        }));
    }

    // ================================================================
    // 3D projection (static isometric, depth-cued)
    // ================================================================

    /** True when any point carries a Z coordinate (a 3D projection). */
    public get Is3D(): boolean {
        return this.Points.some(p => p.Z != null);
    }

    /** Orbit angles (radians) for the interactive 3D projection. Updated by drag. */
    public Yaw = 0.6;
    public Pitch = 0.45;

    /** Rotate a centered (x,y,z) by the current yaw (around Y) then pitch (around X). */
    private rotate(point: ClusterPoint): { x: number; y: number; z: number } {
        const x0 = point.X - 500;
        const y0 = point.Y - 350;
        const z0 = (point.Z ?? 500) - 500;
        const cy = Math.cos(this.Yaw), sy = Math.sin(this.Yaw);
        // yaw around vertical (Y) axis
        const x1 = x0 * cy + z0 * sy;
        const z1 = -x0 * sy + z0 * cy;
        const y1 = y0;
        // pitch around horizontal (X) axis
        const cp = Math.cos(this.Pitch), sp = Math.sin(this.Pitch);
        const y2 = y1 * cp - z1 * sp;
        const z2 = y1 * sp + z1 * cp;
        return { x: x1, y: y2, z: z2 };
    }

    /** Project a point's (X,Y,Z) to a screen X in the SVG coordinate space. */
    public PX(point: ClusterPoint): number {
        if (!this.Is3D || point.Z == null) return point.X;
        return 500 + this.rotate(point).x;
    }

    /** Project a point's (X,Y,Z) to a screen Y in the SVG coordinate space. */
    public PY(point: ClusterPoint): number {
        if (!this.Is3D || point.Z == null) return point.Y;
        return 350 + this.rotate(point).y;
    }

    /** Normalized depth [0=far, 1=near] for a point, used for size/opacity cues. */
    private depthNorm(point: ClusterPoint): number {
        if (!this.Is3D || point.Z == null) return 1;
        const depth = this.rotate(point).z;
        // centered coords span roughly ±440 per axis; combined depth ~[-760, 760]
        return Math.max(0, Math.min(1, (depth + 600) / 1200));
    }

    /** Reset the 3D orbit to the default viewing angle. */
    public ResetRotation(): void {
        this.Yaw = 0.6;
        this.Pitch = 0.45;
        this.cdr.detectChanges();
    }

    /**
     * Points in render order. In 3D, far points are drawn first so nearer points
     * paint on top (SVG has no z-index); in 2D the original order is preserved.
     */
    public get RenderPoints(): ClusterPoint[] {
        if (!this.Is3D) return this.Points;
        return [...this.Points].sort((a, b) => this.depthNorm(a) - this.depthNorm(b));
    }

    /**
     * Compute the SVG radius for a data point.
     *
     * Selected points use the larger `HighlightRadius`; all others use `DotRadius`.
     *
     * @param point  The point to size.
     * @returns Radius in SVG units.
     */
    public GetPointRadius(point: ClusterPoint): number {
        if (this.SelectedPointIds.has(point.VectorKey)) {
            return this.HighlightRadius;
        }
        if (this.Is3D) {
            // Nearer points (depth→1) render larger to convey depth.
            return this.DotRadius * (0.6 + 0.7 * this.depthNorm(point));
        }
        return this.DotRadius;
    }

    /**
     * Compute the fill opacity for a data point.
     *
     * Non-hovered points are dimmed when another point is hovered.
     *
     * @param point  The point to evaluate.
     * @returns Opacity value between 0 and 1.
     */
    public GetPointOpacity(point: ClusterPoint): number {
        if (this.HoveredPoint && this.HoveredPoint.VectorKey !== point.VectorKey) {
            return this.DotOpacity * 0.5;
        }
        if (this.Is3D) {
            // Fade far points slightly for depth perception.
            return this.DotOpacity * (0.55 + 0.45 * this.depthNorm(point));
        }
        return this.DotOpacity;
    }

    /**
     * Handle mouseenter on a data point: show tooltip, fire hover events.
     *
     * @param point  The hovered point.
     * @param event  The native mouse event (used for tooltip positioning).
     */
    public OnPointMouseEnter(point: ClusterPoint, event: MouseEvent): void {
        const cancelable: CancelableEvent<ClusterPoint> = { Data: point, Cancel: false };
        this.BeforePointHover.emit(cancelable);
        if (cancelable.Cancel) return;

        this.HoveredPoint = point;
        this.TooltipX = event.clientX + 16;
        this.TooltipY = event.clientY - 10;
        this.computeTooltipEntries(point);
        this.PointHovered.emit(point);
        this.cdr.detectChanges();
    }

    /**
     * Handle mouseleave on a data point: hide tooltip, emit null hover.
     */
    public OnPointMouseLeave(): void {
        this.HoveredPoint = null;
        this.TooltipEntries = [];
        this.PointHovered.emit(null);
        this.cdr.detectChanges();
    }

    /**
     * Handle click on a data point: fires `BeforePointClick`, toggles
     * selection, opens the detail panel, then fires `PointClicked` and
     * `SelectionChanged`.
     *
     * @param point  The clicked point.
     */
    public OnPointClick(point: ClusterPoint): void {
        const cancelable: CancelableEvent<ClusterPoint> = { Data: point, Cancel: false };
        this.BeforePointClick.emit(cancelable);
        if (cancelable.Cancel) return;

        this.HighlightedKey = point.VectorKey;

        // Toggle selection
        const newSelection = new Set(this.SelectedPointIds);
        if (newSelection.has(point.VectorKey)) {
            newSelection.delete(point.VectorKey);
        } else {
            newSelection.add(point.VectorKey);
        }
        this.SelectedPointIds = newSelection;
        this.SelectionChanged.emit(newSelection);

        // Open detail panel for the clicked point
        this.selectPointForDetail(point);

        this.PointClicked.emit(point);
        this.cdr.detectChanges();
    }

    /**
     * Whether the given point is the currently highlighted (last-clicked) point.
     *
     * @param point  The point to check.
     * @returns `true` if highlighted.
     */
    public IsHighlighted(point: ClusterPoint): boolean {
        return this.HighlightedKey === point.VectorKey;
    }

    /**
     * Whether the given point is in the current selection set.
     *
     * @param point  The point to check.
     * @returns `true` if selected.
     */
    public IsSelected(point: ClusterPoint): boolean {
        return this.SelectedPointIds.has(point.VectorKey);
    }

    /**
     * Handle mouse wheel events for zooming.
     *
     * Fires `BeforeZoom` and `ViewportChanged`.  Respects `EnableZoom`,
     * `MinZoom`, and `MaxZoom` constraints.
     *
     * @param event  The native wheel event.
     */
    public OnWheel(event: WheelEvent): void {
        event.preventDefault();
        if (!this.EnableZoom) return;

        const zoomFactor = event.deltaY > 0 ? 1.1 : 0.9;
        const [minX, minY, width, height] = this.ViewBox;

        const minWidth = this.defaultWidth * this.MinZoom;
        const maxWidth = this.defaultWidth * this.MaxZoom;
        const minHeight = this.defaultHeight * this.MinZoom;
        const maxHeight = this.defaultHeight * this.MaxZoom;

        const newWidth = Math.max(minWidth, Math.min(maxWidth, width * zoomFactor));
        const newHeight = Math.max(minHeight, Math.min(maxHeight, height * zoomFactor));

        const centerX = minX + width / 2;
        const centerY = minY + height / 2;

        const proposed: ViewportRect = {
            MinX: centerX - newWidth / 2,
            MinY: centerY - newHeight / 2,
            Width: newWidth,
            Height: newHeight,
        };

        const cancelable: CancelableEvent<ViewportRect> = { Data: proposed, Cancel: false };
        this.BeforeZoom.emit(cancelable);
        if (cancelable.Cancel) return;

        this.ViewBox = [proposed.MinX, proposed.MinY, proposed.Width, proposed.Height];
        this.ViewportChanged.emit(proposed);
        this.cdr.detectChanges();
    }

    /**
     * Start panning on left-mousedown.
     *
     * @param event  The native mouse event.
     */
    public OnMouseDown(event: MouseEvent): void {
        if (event.button !== 0) return;
        // In 3D mode a left-drag orbits the camera (so depth is perceivable);
        // in 2D it pans the viewBox.
        if (this.Is3D) {
            this.isRotating = true;
            this.rotateStartX = event.clientX;
            this.rotateStartY = event.clientY;
            this.rotateStartYaw = this.Yaw;
            this.rotateStartPitch = this.Pitch;
            return;
        }
        if (!this.EnablePan) return;
        this.isPanning = true;
        this.panStartX = event.clientX;
        this.panStartY = event.clientY;
        this.panStartViewBox = [...this.ViewBox];
    }

    /**
     * Handle a click on a cluster legend item.
     *
     * @param cluster  The cluster that was clicked.
     */
    public OnClusterLegendClick(cluster: ClusterInfo): void {
        this.ClusterSelected.emit({
            ClusterId: cluster.Id,
            Label: cluster.Label,
            Color: cluster.Color,
            MemberCount: cluster.MemberCount,
        });
    }

    /**
     * Resolve the human-readable label for a point's cluster.
     *
     * @param point  The point to look up.
     * @returns Cluster label string, or `"Outlier"` for noise points.
     */
    public GetClusterLabel(point: ClusterPoint): string {
        if (point.ClusterId < 0) return 'Outlier';
        const cluster = this.Clusters.find(c => c.Id === point.ClusterId);
        return cluster?.Label ?? `Cluster ${point.ClusterId + 1}`;
    }

    /** Get the label for a cluster by ID (used for SVG text labels on the chart). */
    public GetClusterLabelById(clusterId: number): string {
        const cluster = this.Clusters.find(c => c.Id === clusterId);
        return cluster?.Label ?? '';
    }

    /** @internal TrackBy function for point loops. */
    public TrackPointBy(_index: number, point: ClusterPoint): string {
        return point.VectorKey;
    }

    /** @internal TrackBy function for cluster loops. */
    public TrackClusterBy(_index: number, cluster: ClusterInfo): number {
        return cluster.Id;
    }

    /** @internal TrackBy function for centroid loops. */
    public TrackCentroidBy(_index: number, centroid: { ClusterId: number }): number {
        return centroid.ClusterId;
    }

    // ================================================================
    // Public API Methods
    // ================================================================

    /**
     * Animate the viewport to center on a specific cluster's centroid.
     *
     * The zoom level is adjusted so that all cluster members are visible
     * with some padding.
     *
     * @param clusterId  The numeric ID of the cluster to zoom into.
     *
     * @example
     * ```typescript
     * @ViewChild(ClusterScatterComponent) scatter!: ClusterScatterComponent;
     * this.scatter.ZoomToCluster(2);
     * ```
     */
    public ZoomToCluster(clusterId: number): void {
        const members = this.Points.filter(p => p.ClusterId === clusterId);
        if (members.length === 0) return;

        const bounds = this.computeBounds(members);
        const padding = 80;
        const proposed: ViewportRect = {
            MinX: bounds.minX - padding,
            MinY: bounds.minY - padding,
            Width: (bounds.maxX - bounds.minX) + padding * 2,
            Height: (bounds.maxY - bounds.minY) + padding * 2,
        };

        // Ensure minimum dimensions
        if (proposed.Width < 200) {
            const cx = proposed.MinX + proposed.Width / 2;
            proposed.Width = 200;
            proposed.MinX = cx - 100;
        }
        if (proposed.Height < 140) {
            const cy = proposed.MinY + proposed.Height / 2;
            proposed.Height = 140;
            proposed.MinY = cy - 70;
        }

        this.ViewBox = [proposed.MinX, proposed.MinY, proposed.Width, proposed.Height];
        this.ViewportChanged.emit(proposed);
        this.cdr.detectChanges();
    }

    /**
     * Reset the viewport to the default zoom level (full view).
     *
     * @example
     * ```typescript
     * this.scatter.ResetZoom();
     * ```
     */
    public ResetZoom(): void {
        const proposed: ViewportRect = {
            MinX: 0,
            MinY: 0,
            Width: this.defaultWidth,
            Height: this.defaultHeight,
        };
        this.ViewBox = [0, 0, this.defaultWidth, this.defaultHeight];
        this.ViewportChanged.emit(proposed);
        this.cdr.detectChanges();
    }

    /**
     * Return all points currently visible within the viewport bounds.
     *
     * @returns Array of `ClusterPoint` objects whose X/Y fall inside the
     *          current viewBox.
     */
    public GetVisiblePoints(): ClusterPoint[] {
        const [minX, minY, width, height] = this.ViewBox;
        const maxX = minX + width;
        const maxY = minY + height;
        return this.Points.filter(p =>
            p.X >= minX && p.X <= maxX && p.Y >= minY && p.Y <= maxY
        );
    }

    /**
     * Programmatically select points by their `VectorKey` IDs.
     *
     * Merges with the existing selection.  Use `ClearSelection()` first
     * to replace the selection entirely.
     *
     * @param ids  Array of `VectorKey` strings to select.
     *
     * @example
     * ```typescript
     * this.scatter.SelectPoints(['abc-123', 'def-456']);
     * ```
     */
    public SelectPoints(ids: string[]): void {
        const newSelection = new Set(this.SelectedPointIds);
        for (const id of ids) {
            newSelection.add(id);
        }
        this.SelectedPointIds = newSelection;
        this.SelectionChanged.emit(newSelection);
        this.cdr.detectChanges();
    }

    /**
     * Clear all selected points.
     */
    public ClearSelection(): void {
        this.SelectedPointIds = new Set<string>();
        this.HighlightedKey = null;
        this.SelectionChanged.emit(this.SelectedPointIds);
        this.cdr.detectChanges();
    }

    /**
     * Export the current scatter plot as an SVG string.
     *
     * The returned string is a self-contained `<svg>` element that can be
     * saved to a file or embedded in HTML.
     *
     * @returns SVG markup string, or empty string if the SVG element is
     *          not yet rendered.
     */
    public ExportSVG(): string {
        if (!this.svgRef?.nativeElement) return '';
        const svgElement = this.svgRef.nativeElement;
        const serializer = new XMLSerializer();
        return serializer.serializeToString(svgElement);
    }

    /**
     * Visually emphasize all points belonging to a cluster by increasing
     * their radius and dimming non-members.
     *
     * Call `ResetZoom()` or re-assign `Points` to clear the highlight.
     *
     * @param clusterId  The numeric cluster ID to emphasize.
     */
    public HighlightCluster(clusterId: number): void {
        const memberKeys = this.Points
            .filter(p => p.ClusterId === clusterId)
            .map(p => p.VectorKey);
        this.SelectedPointIds = new Set(memberKeys);
        this.SelectionChanged.emit(this.SelectedPointIds);
        this.cdr.detectChanges();
    }

    // ================================================================
    // Detail Panel Methods
    // ================================================================

    /**
     * Close the detail panel.
     */
    public CloseDetailPanel(): void {
        this.ShowDetailPanel = false;
        this.SelectedPoint = null;
        this.DetailEntries = [];
        this.ClusterMembers = [];
        this.cdr.detectChanges();
    }

    /**
     * Emit the `OpenRecordRequested` event for the currently selected point
     * (triggered by the "Open Record" button in the detail panel).
     */
    public OnOpenRecordClick(): void {
        if (this.SelectedPoint) {
            this.OpenRecordRequested.emit(this.SelectedPoint);
        }
    }

    /**
     * Select a point from the cluster members list, updating the detail
     * panel and highlighting the point on the chart.
     *
     * @param point  The cluster member point to select.
     */
    public OnClusterMemberClick(point: ClusterPoint): void {
        this.HighlightedKey = point.VectorKey;
        this.selectPointForDetail(point);
        this.cdr.detectChanges();
    }

    /**
     * Toggle the cluster members list expansion state.
     */
    public ToggleClusterMembers(): void {
        this.ClusterMembersExpanded = !this.ClusterMembersExpanded;
    }

    /**
     * Get the color for a cluster by its ID, used in the detail panel.
     *
     * @param clusterId  The cluster ID.
     * @returns CSS color string.
     */
    public GetClusterColor(clusterId: number): string {
        if (clusterId < 0) return '#64748b';
        const cluster = this.Clusters.find(c => c.Id === clusterId);
        if (cluster?.Color) return cluster.Color;
        const palette = this.getActivePalette();
        return palette[clusterId % palette.length];
    }

    /**
     * Return the metadata keys that should be hidden in the detail panel.
     */
    private get internalMetadataKeys(): Set<string> {
        return new Set([
            'Name', 'Entity', 'EntityIcon', 'RecordID',
            'TemplateID', '__mj_UpdatedAt', '__mj_CreatedAt',
        ]);
    }

    /**
     * Select a point and populate the detail panel state.
     */
    private selectPointForDetail(point: ClusterPoint): void {
        this.SelectedPoint = point;
        this.ShowDetailPanel = true;
        this.computeDetailEntries(point);
        this.computeClusterMembers(point);
    }

    /**
     * Compute the metadata entries for the detail panel, excluding internal fields.
     * Uses FieldPriority for ordering when available.
     */
    private computeDetailEntries(point: ClusterPoint): void {
        const hidden = this.internalMetadataKeys;
        const raw = Object.entries(point.Metadata)
            .filter(([key]) => !hidden.has(key))
            .filter(([, value]) => value != null && String(value).trim() !== '')
            .map(([Key, Value]) => ({ Key, Value }));

        this.DetailEntries = this.sortEntriesByPriority(raw);
    }

    /**
     * Compute the list of cluster members for the selected point's cluster.
     */
    private computeClusterMembers(point: ClusterPoint): void {
        this.ClusterMembers = this.Points
            .filter(p => p.ClusterId === point.ClusterId)
            .sort((a, b) => a.Label.localeCompare(b.Label));
    }

    /** @internal TrackBy function for cluster member loops. */
    public TrackMemberBy(_index: number, point: ClusterPoint): string {
        return point.VectorKey;
    }

    // ================================================================
    // Private Methods
    // ================================================================

    private onMouseMove(event: MouseEvent): void {
        if (this.isRotating) {
            const dx = event.clientX - this.rotateStartX;
            const dy = event.clientY - this.rotateStartY;
            this.Yaw = this.rotateStartYaw + dx * 0.01;
            // clamp pitch so the scene never flips upside down
            this.Pitch = Math.max(-1.3, Math.min(1.3, this.rotateStartPitch + dy * 0.01));
            this.cdr.detectChanges();
            return;
        }
        if (!this.isPanning || !this.svgRef) return;
        const svg = this.svgRef.nativeElement;
        const rect = svg.getBoundingClientRect();
        const scaleX = this.panStartViewBox[2] / rect.width;
        const scaleY = this.panStartViewBox[3] / rect.height;

        const dx = (event.clientX - this.panStartX) * scaleX;
        const dy = (event.clientY - this.panStartY) * scaleY;

        const proposed: ViewportRect = {
            MinX: this.panStartViewBox[0] - dx,
            MinY: this.panStartViewBox[1] - dy,
            Width: this.panStartViewBox[2],
            Height: this.panStartViewBox[3],
        };

        this.ViewBox = [proposed.MinX, proposed.MinY, proposed.Width, proposed.Height];
        this.ViewportChanged.emit(proposed);
        this.cdr.detectChanges();
    }

    private onMouseUp(_event: MouseEvent): void {
        this.isPanning = false;
        this.isRotating = false;
    }

    private computeCentroids(): void {
        if (!this.Points.length || !this.Clusters.length) {
            this.ClusterCentroids = [];
            return;
        }

        this.ClusterCentroids = this.Clusters.map(cluster => {
            const members = this.Points.filter(p => p.ClusterId === cluster.Id);
            if (members.length === 0) {
                return { ClusterId: cluster.Id, Cx: 500, Cy: 350, R: 80, Color: cluster.Color };
            }
            const cx = members.reduce((s, p) => s + p.X, 0) / members.length;
            const cy = members.reduce((s, p) => s + p.Y, 0) / members.length;
            const maxDist = Math.max(
                ...members.map(p => Math.sqrt((p.X - cx) ** 2 + (p.Y - cy) ** 2)),
                40
            );
            return {
                ClusterId: cluster.Id,
                Cx: cx,
                Cy: cy,
                R: Math.min(maxDist + 30, 200),
                Color: cluster.Color,
            };
        });
    }

    /**
     * Compute the bounding box for a set of points.
     */
    private computeBounds(points: ClusterPoint[]): { minX: number; minY: number; maxX: number; maxY: number } {
        let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
        for (const p of points) {
            if (p.X < minX) minX = p.X;
            if (p.X > maxX) maxX = p.X;
            if (p.Y < minY) minY = p.Y;
            if (p.Y > maxY) maxY = p.Y;
        }
        return { minX, minY, maxX, maxY };
    }

    /**
     * Resolve the effective color palette (custom override or default).
     */
    private getActivePalette(): string[] {
        return this.ColorPalette.length > 0 ? this.ColorPalette : CLUSTER_COLORS;
    }

    /**
     * Compute the tooltip entries based on TooltipFields filter.
     * Uses FieldPriority for ordering when available.
     */
    private computeTooltipEntries(point: ClusterPoint): void {
        const entries = Object.entries(point.Metadata);
        let mapped: { Key: string; Value: unknown }[];
        if (this.TooltipFields.length > 0) {
            mapped = entries
                .filter(([key]) => this.TooltipFields.includes(key))
                .map(([Key, Value]) => ({ Key, Value }));
        } else {
            mapped = entries.map(([Key, Value]) => ({ Key, Value }));
        }
        this.TooltipEntries = this.sortEntriesByPriority(mapped);
    }

    /**
     * Sort entries using the FieldPriority ordering.
     * Fields in FieldPriority come first (in priority order), then remaining fields.
     */
    private sortEntriesByPriority(entries: { Key: string; Value: unknown }[]): { Key: string; Value: unknown }[] {
        if (this.FieldPriority.length === 0) return entries;

        const priorityIndex = new Map(this.FieldPriority.map((key, idx) => [key, idx]));
        return [...entries].sort((a, b) => {
            const aIdx = priorityIndex.get(a.Key) ?? 99999;
            const bIdx = priorityIndex.get(b.Key) ?? 99999;
            return aIdx - bIdx;
        });
    }
}
