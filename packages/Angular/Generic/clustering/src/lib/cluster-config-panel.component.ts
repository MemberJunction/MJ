/**
 * @fileoverview Floating glass-morphism configuration panel for clustering.
 *
 * `ClusterConfigPanelComponent` provides a draggable floating panel with
 * entity picker, algorithm picker, parameter sliders, distance metric
 * selector, max records input, run button, and result metrics display.
 *
 * It emits cancelable `BeforeXXX` events so consumers can intercept and
 * validate before clustering starts or a visualization is saved.
 *
 * @example
 * ```html
 * <mj-cluster-config-panel
 *     [IsRunning]="isRunning"
 *     [Metrics]="result?.Metrics ?? null"
 *     [EntityOptions]="myEntityOptions"
 *     [ShowSaveButton]="true"
 *     [DefaultAlgorithm]="'dbscan'"
 *     [Collapsed]="false"
 *     (BeforeRunClustering)="onBeforeRun($event)"
 *     (RunClustering)="onRunClustering($event)"
 *     (ConfigChanged)="onConfigChanged($event)"
 *     (SaveVisualization)="onSave()">
 * </mj-cluster-config-panel>
 * ```
 */

import {
    Component,
    Input,
    Output,
    EventEmitter,
    ElementRef,
    ChangeDetectorRef,
    OnInit,
    OnDestroy,
    ViewChild,
    inject,
} from '@angular/core';
import {
    ClusterConfig,
    ClusterConfigPanelEntityOption,
    ClusterConfigPanelEntityDocOption,
    ClusterMetrics,
    ClusterAlgorithm,
    ClusterDistanceMetric,
    CancelableEvent,
    DefaultClusterConfig,
} from './clustering.types';

@Component({
    standalone: false,
    selector: 'mj-cluster-config-panel',
    templateUrl: './cluster-config-panel.component.html',
    styleUrls: ['./cluster-config-panel.component.css'],
})
export class ClusterConfigPanelComponent implements OnInit, OnDestroy {
    private cdr = inject(ChangeDetectorRef);

    // ================================================================
    // Data Inputs
    // ================================================================

    /**
     * Whether a clustering run is currently in progress.
     *
     * When `true`, the Run button is disabled and shows a spinner.
     *
     * @default false
     */
    @Input() IsRunning = false;

    /**
     * Result metrics from the most recent clustering run.
     *
     * When non-null, the metrics section is displayed at the bottom
     * of the panel showing silhouette score, cluster count, etc.
     */
    @Input() Metrics: ClusterMetrics | null = null;

    /**
     * Entity options for the dropdown.
     *
     * The parent component is responsible for populating this list,
     * typically from MJ Metadata or a subset filtered by
     * `AvailableEntities`.
     */
    private _entityOptions: ClusterConfigPanelEntityOption[] = [];

    @Input()
    set EntityOptions(value: ClusterConfigPanelEntityOption[]) {
        this._entityOptions = value || [];
        this.rebuildFilteredEntities();
    }
    get EntityOptions(): ClusterConfigPanelEntityOption[] {
        return this._entityOptions;
    }

    /** Entity Document options for the selected entity. Only shown when 2+ docs exist. */
    @Input() EntityDocOptions: ClusterConfigPanelEntityDocOption[] = [];

    /**
     * All Entity Documents across entities (each with `EntityName`), used to power
     * the optional multi-entity source selector. When two or more are selected the
     * run becomes a multi-entity analysis (their vectors are merged server-side).
     */
    @Input() AllEntityDocOptions: ClusterConfigPanelEntityDocOption[] = [];

    /** Whether to show the 2D/3D projection toggle. @default true */
    @Input() ShowDimensionToggle = true;

    /** Whether to show the multi-entity source selector. @default true */
    @Input() ShowMultiEntity = true;

    // ================================================================
    // Customization Inputs
    // ================================================================

    /**
     * Whether to display the "Save this visualization" link.
     *
     * @default true
     */
    @Input() ShowSaveButton = true;

    /**
     * Whether to display the algorithm picker dropdown.
     *
     * When `false`, the algorithm is fixed to `DefaultAlgorithm`.
     *
     * @default true
     */
    @Input() ShowAlgorithmPicker = true;

    /**
     * Whether to display the distance metric picker dropdown.
     *
     * @default true
     */
    @Input() ShowMetricPicker = true;

    /**
     * Default algorithm selection when the panel initializes.
     *
     * @default 'kmeans'
     */
    @Input() DefaultAlgorithm: ClusterAlgorithm = 'kmeans';

    /**
     * Restrict the entity picker to a specific list of entity names.
     *
     * When empty (the default), all entity options from the
     * `EntityOptions` input are shown.  When non-empty, only entities
     * whose `Name` appears in this array are shown.
     *
     * @default []
     *
     * @example
     * ```html
     * <mj-cluster-config-panel
     *     [AvailableEntities]="['Companies', 'Contacts', 'Deals']">
     * </mj-cluster-config-panel>
     * ```
     */
    @Input() AvailableEntities: string[] = [];

    /**
     * Whether the panel starts in a collapsed (minimized) state.
     *
     * The user can toggle between collapsed and expanded by clicking
     * the collapse chevron in the panel header.
     *
     * @default false
     */
    @Input() Collapsed = false;

    // ================================================================
    // Standard Outputs
    // ================================================================

    /**
     * Emitted when the user clicks Run and `BeforeRunClustering` was not
     * canceled.  Payload is a snapshot of the current config.
     */
    @Output() RunClustering = new EventEmitter<ClusterConfig>();

    /**
     * Emitted when the user clicks the Save link and `BeforeSave` was
     * not canceled.
     */
    @Output() SaveVisualization = new EventEmitter<void>();

    // ================================================================
    // Cancelable Outputs
    // ================================================================

    /**
     * Fires **before** a clustering run starts.  Set `event.Cancel = true`
     * to prevent the run (e.g., for validation).
     *
     * @example
     * ```typescript
     * onBeforeRun(event: CancelableEvent<ClusterConfig>): void {
     *     if (!event.Data.EntityName) {
     *         event.Cancel = true;
     *         alert('Please select an entity first.');
     *     }
     * }
     * ```
     */
    @Output() BeforeRunClustering = new EventEmitter<CancelableEvent<ClusterConfig>>();

    /**
     * Fires **before** a visualization is saved.  Set `event.Cancel = true`
     * to prevent the save (e.g., to prompt for a name first).
     */
    @Output() BeforeSave = new EventEmitter<CancelableEvent<ClusterConfig>>();

    // ================================================================
    // Informational Outputs
    // ================================================================

    /**
     * Fires whenever any configuration value changes (entity, algorithm,
     * K, epsilon, distance metric, max records, filter).
     *
     * Payload is a snapshot of the entire config at the time of change.
     */
    @Output() ConfigChanged = new EventEmitter<ClusterConfig>();

    /**
     * Fires specifically when the algorithm selection changes.
     *
     * Useful for showing/hiding algorithm-specific UI in the parent.
     */
    @Output() AlgorithmChanged = new EventEmitter<ClusterAlgorithm>();

    /**
     * Fires when the 2D/3D projection toggle changes. Hosts should re-run (or
     * re-project) so the change is reflected immediately — a 3D projection needs
     * a Z coordinate that only a fresh run produces.
     */
    @Output() DimensionsChanged = new EventEmitter<2 | 3>();

    // ================================================================
    // Internal State
    // ================================================================

    /** The working configuration object. */
    public Config: ClusterConfig = DefaultClusterConfig();

    /** Filtered entity list for display (filtered by AvailableEntities). */
    public FilteredEntityOptions: ClusterConfigPanelEntityOption[] = [];

    /** Whether the panel body is currently visible. */
    public IsExpanded = true;

    /** Whether the multi-entity source selector is expanded. */
    public ShowMultiSource = false;

    /** Algorithm options for the dropdown. */
    public AlgorithmOptions: Array<{ Value: ClusterAlgorithm; Label: string }> = [
        { Value: 'kmeans', Label: 'K-Means' },
        { Value: 'dbscan', Label: 'DBSCAN' },
    ];

    /** Distance metric options for the dropdown. */
    public MetricOptions: Array<{ Value: ClusterDistanceMetric; Label: string }> = [
        { Value: 'cosine', Label: 'Cosine' },
        { Value: 'euclidean', Label: 'Euclidean' },
        { Value: 'dotproduct', Label: 'Dot Product' },
    ];

    // Dragging state
    /** Current panel top offset in pixels. */
    public PanelTop = 12;
    /** Current panel left offset in pixels. */
    public PanelLeft = 12;
    private isDragging = false;
    private dragStartX = 0;
    private dragStartY = 0;
    private dragStartTop = 0;
    private dragStartLeft = 0;
    private boundOnMouseMove: ((e: MouseEvent) => void) | null = null;
    private boundOnMouseUp: ((e: MouseEvent) => void) | null = null;

    @ViewChild('panelElement', { static: false }) private panelRef!: ElementRef<HTMLDivElement>;

    // ================================================================
    // Lifecycle
    // ================================================================

    ngOnInit(): void {
        // Apply defaults
        this.Config.Algorithm = this.DefaultAlgorithm;
        this.IsExpanded = !this.Collapsed;

        this.rebuildFilteredEntities();

        this.boundOnMouseMove = this.onMouseMove.bind(this);
        this.boundOnMouseUp = this.onMouseUp.bind(this);
        document.addEventListener('mousemove', this.boundOnMouseMove);
        document.addEventListener('mouseup', this.boundOnMouseUp);
    }

    ngOnDestroy(): void {
        if (this.boundOnMouseMove) document.removeEventListener('mousemove', this.boundOnMouseMove);
        if (this.boundOnMouseUp) document.removeEventListener('mouseup', this.boundOnMouseUp);
    }

    // ================================================================
    // Public Template Methods
    // ================================================================

    /**
     * Whether the current algorithm is K-Means (controls which
     * parameter sliders are shown).
     */
    public get IsKMeans(): boolean {
        return this.Config.Algorithm === 'kmeans';
    }

    /**
     * Handle algorithm dropdown change.
     *
     * @param value  New algorithm value string.
     */
    public OnAlgorithmChanged(value: string): void {
        const newAlg = value as ClusterAlgorithm;
        this.Config.Algorithm = newAlg;
        this.AlgorithmChanged.emit(newAlg);
        this.emitConfigChanged();
        this.cdr.detectChanges();
    }

    /**
     * Handle distance metric dropdown change.
     *
     * @param value  New metric value string.
     */
    public OnMetricChanged(value: string): void {
        this.Config.DistanceMetric = value as ClusterDistanceMetric;
        this.emitConfigChanged();
    }

    /**
     * Handle entity dropdown change.
     *
     * @param value  New entity name.
     */
    public OnEntityChanged(value: string): void {
        this.Config.EntityName = value;
        this.emitConfigChanged();
    }

    /**
     * Handle changes to any numeric/text config field (K, Epsilon,
     * MinPoints, MaxRecords, Filter).
     */
    public OnFieldChanged(): void {
        this.emitConfigChanged();
    }

    // ----- Multi-entity / dimensions / color-by -----

    /** The currently selected entity-document IDs for multi-entity clustering. */
    public get SelectedDocIDs(): string[] {
        return this.Config.EntityDocumentIDs ?? [];
    }

    /** True when two or more source documents are selected (multi-entity mode). */
    public get IsMultiEntity(): boolean {
        return this.SelectedDocIDs.length >= 2;
    }

    /** Whether there are enough documents to offer multi-entity selection. */
    public get HasMultiSourceOptions(): boolean {
        return this.ShowMultiEntity && this.AllEntityDocOptions.length > 1;
    }

    /** Whether a given document is currently selected. */
    public IsDocSelected(id: string): boolean {
        return this.SelectedDocIDs.includes(id);
    }

    /** Toggle a document in/out of the multi-entity selection. */
    public ToggleDoc(id: string): void {
        const set = new Set(this.Config.EntityDocumentIDs ?? []);
        if (set.has(id)) {
            set.delete(id);
        } else {
            set.add(id);
        }
        this.Config.EntityDocumentIDs = [...set];
        // Once a multi-entity selection exists, color-by-entity is the useful default.
        if (this.IsMultiEntity && this.Config.ColorBy !== 'entity') {
            this.Config.ColorBy = 'entity';
        }
        this.emitConfigChanged();
        this.cdr.detectChanges();
    }

    /** Handle the multi-source accordion's expand/collapse. */
    public OnMultiSourceExpandedChange(expanded: boolean): void {
        this.ShowMultiSource = expanded;
        this.cdr.detectChanges();
    }

    /** Set the projection dimensionality (2 or 3). */
    public SetDimensions(d: 2 | 3): void {
        if (this.Config.Dimensions === d) return;
        this.Config.Dimensions = d;
        this.emitConfigChanged();
        this.DimensionsChanged.emit(d);
        this.cdr.detectChanges();
    }

    /** Set the legend/color mode. */
    public SetColorBy(mode: 'cluster' | 'entity'): void {
        this.Config.ColorBy = mode;
        this.emitConfigChanged();
        this.cdr.detectChanges();
    }

    /** Whether the Run button can be clicked. */
    public get CanRun(): boolean {
        return !this.IsRunning && (!!this.Config.EntityName || this.SelectedDocIDs.length > 0);
    }

    /** Whether the Save button should be offered (there are results to save). */
    public get CanSave(): boolean {
        return this.ShowSaveButton && !!this.Metrics && this.Metrics.RecordCount > 0;
    }

    /**
     * Handle Run button click.  Fires `BeforeRunClustering`, and if not
     * canceled, emits `RunClustering`.
     */
    public OnRun(): void {
        if (!this.CanRun) return;

        const snapshot = { ...this.Config };
        const cancelable: CancelableEvent<ClusterConfig> = { Data: snapshot, Cancel: false };
        this.BeforeRunClustering.emit(cancelable);
        if (cancelable.Cancel) return;

        this.RunClustering.emit(snapshot);
    }

    /**
     * Handle Save link click.  Fires `BeforeSave`, and if not canceled,
     * emits `SaveVisualization`.
     */
    public OnSave(): void {
        const cancelable: CancelableEvent<ClusterConfig> = { Data: { ...this.Config }, Cancel: false };
        this.BeforeSave.emit(cancelable);
        if (cancelable.Cancel) return;

        this.SaveVisualization.emit();
    }

    /**
     * Toggle the panel between expanded and collapsed states.
     */
    public ToggleCollapse(): void {
        this.IsExpanded = !this.IsExpanded;
        this.cdr.detectChanges();
    }

    /**
     * Format a silhouette score to 2 decimal places.
     *
     * @param score  The raw silhouette score.
     * @returns Formatted string (e.g., `"0.72"`).
     */
    public FormatSilhouette(score: number): string {
        return score.toFixed(2);
    }

    /**
     * Whether a silhouette score indicates good clustering quality.
     *
     * @param score  The silhouette score to evaluate.
     * @returns `true` if score >= 0.5.
     */
    public IsSilhouetteGood(score: number): boolean {
        return score >= 0.5;
    }

    /**
     * Format a computation time in milliseconds to a human-readable string.
     *
     * @param ms  Milliseconds.
     * @returns e.g., `"1.2s"` or `"450ms"`.
     */
    public FormatTime(ms: number): string {
        return ms >= 1000 ? `${(ms / 1000).toFixed(1)}s` : `${ms}ms`;
    }

    /**
     * Start dragging the panel via header mousedown.
     *
     * @param event  The native mouse event.
     */
    public OnHeaderMouseDown(event: MouseEvent): void {
        event.preventDefault();
        this.isDragging = true;
        this.dragStartX = event.clientX;
        this.dragStartY = event.clientY;
        this.dragStartTop = this.PanelTop;
        this.dragStartLeft = this.PanelLeft;
    }

    /** @internal TrackBy for algorithm options. */
    public TrackAlgorithmBy(_index: number, item: { Value: string }): string {
        return item.Value;
    }

    /** @internal TrackBy for metric options. */
    public TrackMetricBy(_index: number, item: { Value: string }): string {
        return item.Value;
    }

    /** @internal TrackBy for entity options. */
    public TrackEntityBy(_index: number, item: ClusterConfigPanelEntityOption): string {
        return item.Name;
    }

    // ================================================================
    // Private Methods
    // ================================================================

    /**
     * Rebuild the filtered entity list based on `AvailableEntities`.
     */
    private rebuildFilteredEntities(): void {
        if (this.AvailableEntities.length > 0) {
            const allowedSet = new Set(this.AvailableEntities);
            this.FilteredEntityOptions = this.EntityOptions.filter(e => allowedSet.has(e.Name));
        } else {
            this.FilteredEntityOptions = this.EntityOptions;
        }

        if (this.FilteredEntityOptions.length > 0 && !this.Config.EntityName) {
            this.Config.EntityName = this.FilteredEntityOptions[0].Name;
        }
    }

    /** Emit `ConfigChanged` with a snapshot of the current config. */
    private emitConfigChanged(): void {
        this.ConfigChanged.emit({ ...this.Config });
    }

    private onMouseMove(event: MouseEvent): void {
        if (!this.isDragging) return;
        const dx = event.clientX - this.dragStartX;
        const dy = event.clientY - this.dragStartY;
        this.PanelTop = Math.max(0, this.dragStartTop + dy);
        this.PanelLeft = Math.max(0, this.dragStartLeft + dx);
        this.cdr.detectChanges();
    }

    private onMouseUp(_event: MouseEvent): void {
        this.isDragging = false;
    }
}
