import { Component, Input, Output, EventEmitter, ChangeDetectorRef, OnInit, OnDestroy, ViewEncapsulation, inject } from '@angular/core';
import { Subject } from 'rxjs';
import { debounceTime, takeUntil } from 'rxjs/operators';
import { EntityInfo, IMetadataProvider } from '@memberjunction/core';
import { UUIDsEqual } from '@memberjunction/global';
import { GraphQLDataProvider, GraphQLAIClient } from '@memberjunction/graphql-dataprovider';
import { AIEngineBase } from '@memberjunction/ai-engine-base';
import { BaseAngularComponent } from '@memberjunction/ng-base-types';
import { IViewRenderer } from '@memberjunction/ng-entity-viewer';
import { ClusteringService } from '../clustering.service';
import {
  ClusterConfig,
  ClusterPoint,
  ClusterInfo,
  ClusterInputVector,
  ClusterLabel,
  ClusterVisualizationResult,
  DefaultClusterConfig,
} from '../clustering.types';
import { ClusterViewConfig, toClusterViewConfig } from './cluster-view.types';
import { EntityDocumentAvailabilityEngine } from './entity-document-availability.engine';

/**
 * ClusterViewRendererComponent
 * ----------------------------
 * The Cluster **view type** renderer — a thin {@link IViewRenderer} adapter that lets any
 * entity with vectors be visualized as a cluster scatter directly inside `mj-entity-viewer`,
 * reusing the exact same {@link ClusteringService} + `mj-cluster-scatter` the Knowledge Hub
 * "Visualize" cluster surface uses.
 *
 * The host feeds it the standard renderer inputs (entity / records / filterText / config) via
 * `setInput`, and listens for `recordSelected` / `recordOpened`. When the entity or config
 * changes it re-runs the clustering pipeline and rebinds the scatter.
 *
 * **Why this mirrors the Knowledge Hub resource rather than the server `RunClusterAnalysis`
 * path:** the server analysis returns points keyed only by record ID (so labels render as
 * "Unknown"), produces generic "Cluster N" names, and picks an Entity Document
 * non-deterministically when none is supplied (causing flip-flop "no vectors" results). This
 * renderer instead:
 *  1. Resolves the entity's **first active Entity Document explicitly** (deterministic source).
 *  2. Fetches that document's vectors (with their JSON metadata) via {@link GraphQLAIClient.FetchEntityVectors}.
 *  3. Builds real point labels from the entity's `IsNameField` fields ({@link buildLabel}).
 *  4. Clusters in-browser via {@link ClusteringService.RunClustering} (client owns vectors + labels).
 *  5. Requests + applies **LLM cluster names** so clusters read semantically, not "Cluster 1..5".
 *
 * Inputs use the camelCase names mandated by the {@link IViewRenderer} contract (the host
 * binds them by those exact names), rather than MJ's usual PascalCase for public members.
 */
@Component({
  standalone: false,
  selector: 'mj-cluster-view-renderer',
  encapsulation: ViewEncapsulation.None,
  template: `
    <div class="cluster-view-renderer">
      @if (errorMessage) {
        <div class="cluster-view-message cluster-view-error">
          <i class="fa-solid fa-triangle-exclamation"></i>
          <span>{{ errorMessage }}</span>
        </div>
      } @else if (!isLoading && points.length === 0) {
        <div class="cluster-view-message">
          <i class="fa-solid fa-diagram-project"></i>
          <span>No vectors available to cluster for this entity yet.</span>
        </div>
      } @else {
        <mj-cluster-scatter
          [Points]="points"
          [Clusters]="clusters"
          [ColorBy]="activeConfig.colorBy"
          [EntityName]="entity?.Name ?? null"
          [FieldPriority]="fieldPriority"
          [FieldDisplayNames]="fieldDisplayNames"
          [IsLoading]="isLoading"
          (PointClicked)="onPointClicked($event)"
          (OpenRecordRequested)="onOpenRecordRequested($event)"
        >
        </mj-cluster-scatter>
      }
    </div>
  `,
  styles: [
    `
      .cluster-view-renderer {
        height: 100%;
        width: 100%;
        display: flex;
        flex-direction: column;
      }
      .cluster-view-renderer mj-cluster-scatter {
        flex: 1 1 auto;
        min-height: 0;
      }
      .cluster-view-message {
        flex: 1 1 auto;
        display: flex;
        flex-direction: column;
        align-items: center;
        justify-content: center;
        gap: 12px;
        color: var(--mj-text-muted);
        padding: 32px;
        text-align: center;
      }
      .cluster-view-message i {
        font-size: 32px;
        opacity: 0.6;
      }
      .cluster-view-error {
        color: var(--mj-status-error-text);
      }
    `,
  ],
})
export class ClusterViewRendererComponent extends BaseAngularComponent implements IViewRenderer<Record<string, unknown>>, OnInit, OnDestroy {
  // ---- IViewRenderer inputs (camelCase per the host contract) ----

  private _entity: EntityInfo | null = null;
  @Input()
  set entity(value: EntityInfo | null) {
    const changed = value?.ID !== this._entity?.ID;
    this._entity = value;
    if (changed) {
      this.scheduleRecluster();
    }
  }
  get entity(): EntityInfo | null {
    return this._entity;
  }

  /** The view's records — used to map a clicked point back to its record object. */
  @Input() records: Record<string, unknown>[] = [];

  @Input() selectedRecordId: string | null = null;

  @Input() filterText: string | null = null;

  private _config: Record<string, unknown> = {};
  @Input()
  set config(value: Record<string, unknown>) {
    const next = toClusterViewConfig(value ?? {});
    // Only re-cluster when the clustering-relevant config actually changed. The host re-pushes the
    // (unchanged) config on unrelated events — notably when a point is clicked / selection changes —
    // and re-clustering on every push made clicking a point recompute the whole scatter. Comparing
    // the normalized config keeps clustering stable across those no-op re-pushes.
    const changed = JSON.stringify(next) !== JSON.stringify(this.activeConfig);
    this._config = value ?? {};
    this.activeConfig = next;
    if (changed) {
      this.scheduleRecluster();
    }
  }
  get config(): Record<string, unknown> {
    return this._config;
  }

  // ---- IViewRenderer outputs ----

  @Output() recordSelected = new EventEmitter<unknown>();
  @Output() recordOpened = new EventEmitter<unknown>();
  @Output() configChanged = new EventEmitter<Record<string, unknown>>();

  // ---- Render state ----

  /** The current parsed config (defaults applied). */
  public activeConfig: ClusterViewConfig = toClusterViewConfig({});
  public points: ClusterPoint[] = [];
  public clusters: ClusterInfo[] = [];
  /** Ordered field keys for prioritized display in the scatter tooltip / detail panel. */
  public fieldPriority: string[] = [];
  /** Map of field names → human-readable display names for the scatter tooltip / detail panel. */
  public fieldDisplayNames: Record<string, string> = {};
  public isLoading = false;
  public errorMessage: string | null = null;

  private recluster$ = new Subject<void>();
  private destroy$ = new Subject<void>();
  private clusteringService = inject(ClusteringService);

  /**
   * Monotonically increasing token captured at the start of each run. Because runs are async
   * and overlapping (entity/config can change mid-flight), each run compares the token it
   * captured against the latest before applying results — a stale run silently bails so it
   * cannot clobber a newer one.
   */
  private runToken = 0;

  constructor(private cdr: ChangeDetectorRef) {
    super();
  }

  ngOnInit(): void {
    // Debounce so the entity + config inputs that arrive together on mount cause one run.
    this.recluster$.pipe(debounceTime(50), takeUntil(this.destroy$)).subscribe(() => void this.runClustering());
    // Kick an initial run AFTER the subscription exists. The component is dynamic-mounted, so the
    // host sets `entity`/`config` via setInput BEFORE ngOnInit runs — those setters fire
    // scheduleRecluster() into recluster$ while there is no subscriber yet, so the initial emission
    // is dropped (a plain Subject doesn't replay). Without this, the very first Cluster open after
    // app load renders nothing. runClustering() no-ops gracefully if no entity is set yet.
    this.scheduleRecluster();
  }

  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
  }

  private scheduleRecluster(): void {
    this.recluster$.next();
  }

  /**
   * Run the clustering pipeline for the current entity + config and rebind the scatter.
   *
   * Mirrors the Knowledge Hub "Visualize" flow: resolve a deterministic Entity Document →
   * fetch its vectors with metadata → build real labels → cluster client-side → request LLM
   * cluster names. Guarded by {@link runToken} so an overlapping/stale run never clobbers a
   * newer one.
   */
  private async runClustering(): Promise<void> {
    const token = ++this.runToken;
    const entity = this._entity;
    if (!entity) {
      this.points = [];
      this.clusters = [];
      this.cdr.detectChanges();
      return;
    }

    this.isLoading = true;
    this.errorMessage = null;
    this.cdr.detectChanges();

    try {
      const gqlProvider = this.resolveGraphQLProvider();
      if (!gqlProvider) {
        this.applyError(token, 'Clustering requires a GraphQL data provider, which is not available here.');
        return;
      }

      const docID = await this.resolveEntityDocumentID(entity);
      if (this.isStale(token)) {
        return;
      }
      if (!docID) {
        // No active Entity Document for this entity → nothing to cluster (empty state).
        this.applyResult(token, [], []);
        return;
      }

      const vectors = await this.fetchVectors(gqlProvider, entity, docID);
      if (this.isStale(token)) {
        return;
      }
      if (vectors.length === 0) {
        this.applyResult(token, [], []);
        return;
      }

      const cfg = this.buildClusterConfig(entity, docID);
      const result = await this.clusteringService.RunClustering(vectors, cfg);
      if (this.isStale(token)) {
        return;
      }

      this.fieldPriority = this.computeFieldPriority(entity);
      this.applyResult(token, result.Points, result.Clusters);

      // Fire LLM cluster naming in the background (non-blocking) when enabled. Clusters render
      // immediately with provisional names; semantic labels appear when the LLM responds.
      if (this.activeConfig.nameClusters) {
        void this.requestClusterLabelsFromLLM(gqlProvider, token, result);
      }
    } catch (err) {
      this.applyError(token, err instanceof Error ? err.message : String(err));
    }
  }

  /** True when a newer run has started since `token` was captured — the caller should bail. */
  private isStale(token: number): boolean {
    return token !== this.runToken;
  }

  /** Apply a successful clustering result to the view (no-op if the run is stale). */
  private applyResult(token: number, points: ClusterPoint[], clusters: ClusterInfo[]): void {
    if (this.isStale(token)) {
      return;
    }
    this.points = points;
    this.clusters = clusters;
    this.isLoading = false;
    this.cdr.detectChanges();
  }

  /** Apply an error state to the view (no-op if the run is stale). */
  private applyError(token: number, message: string): void {
    if (this.isStale(token)) {
      return;
    }
    this.errorMessage = message;
    this.points = [];
    this.clusters = [];
    this.isLoading = false;
    this.cdr.detectChanges();
  }

  /**
   * Resolve the {@link GraphQLDataProvider} backing this component's metadata provider, or
   * `null` when the active provider is not a GraphQL transport (e.g. non-browser).
   */
  private resolveGraphQLProvider(): GraphQLDataProvider | null {
    const p: IMetadataProvider = this.ProviderToUse;
    return p instanceof GraphQLDataProvider ? p : null;
  }

  /**
   * Resolve the entity's first active Entity Document ID **explicitly** (deterministic),
   * loading the availability engine cache if needed. Returns `null` when the entity has no
   * active document.
   */
  private async resolveEntityDocumentID(entity: EntityInfo): Promise<string | null> {
    const engine = EntityDocumentAvailabilityEngine.Instance;
    const p = this.ProviderToUse;
    await engine.Config(false, p.CurrentUser, p);
    const docs = engine.GetActiveEntityDocumentsForEntity(entity);
    return docs.length > 0 ? docs[0].ID : null;
  }

  /**
   * Fetch the entity document's vectors (with metadata) and build {@link ClusterInputVector}s,
   * deriving each point's display label from the entity's name fields.
   */
  private async fetchVectors(gqlProvider: GraphQLDataProvider, entity: EntityInfo, docID: string): Promise<ClusterInputVector[]> {
    const aiClient = new GraphQLAIClient(gqlProvider);
    const result = await aiClient.FetchEntityVectors({
      entityDocumentID: docID,
      maxRecords: this.activeConfig.maxRecords,
      filter: this.filterText?.trim() ? this.filterText.trim() : undefined,
    });

    if (!result.Success || result.Results.length === 0) {
      return [];
    }

    const vectors: ClusterInputVector[] = [];
    for (const item of result.Results) {
      if (!item.Values || item.Values.length === 0) {
        continue;
      }
      const metadata = this.parseVectorMetadata(item.Metadata);
      vectors.push({
        Key: item.ID,
        Label: this.buildLabel(entity, metadata),
        Vector: item.Values,
        Metadata: metadata,
      });
    }
    return vectors;
  }

  /** Parse the JSON metadata string stored alongside a vector into a flat string map. */
  private parseVectorMetadata(metadataJson: string): Record<string, string> {
    try {
      return JSON.parse(metadataJson) as Record<string, string>;
    } catch {
      return {};
    }
  }

  /**
   * Build a human-readable label for a point from the entity's name-field metadata. Combines
   * all `IsNameField` fields in Sequence order (e.g. "Sarah Chen" from FirstName + LastName),
   * then falls back to the single NameField, then to common heuristic keys, then to the record
   * ID — so points show real names instead of "Unknown".
   */
  private buildLabel(entity: EntityInfo, metadata: Record<string, string>): string {
    const nameFields = entity.Fields.filter((f) => f.IsNameField).sort((a, b) => (a.Sequence ?? 9999) - (b.Sequence ?? 9999));
    if (nameFields.length > 0) {
      const parts = nameFields.map((f) => metadata[f.Name]).filter((v) => v != null && v.trim() !== '');
      if (parts.length > 0) {
        return parts.join(' ');
      }
    }
    if (entity.NameField && metadata[entity.NameField.Name]) {
      return metadata[entity.NameField.Name];
    }
    return metadata['Name'] || metadata['Title'] || metadata['Description']?.substring(0, 60) || metadata['RecordID'] || 'Unknown';
  }

  /**
   * Compute the prioritized field order + display names for the scatter tooltip / detail panel.
   * Orders: name fields first, then default-in-view fields, then the rest by Sequence; skips
   * internal/virtual/primary-key fields. Also populates {@link fieldDisplayNames}.
   */
  private computeFieldPriority(entity: EntityInfo): string[] {
    const internalKeys = new Set(['ID', 'Entity', 'EntityIcon', 'RecordID', 'TemplateID', '__mj_UpdatedAt', '__mj_CreatedAt']);

    const displayNames: Record<string, string> = {};
    for (const f of entity.Fields) {
      displayNames[f.Name] = f.DisplayNameOrName;
    }
    this.fieldDisplayNames = displayNames;

    return entity.Fields.filter((f) => !internalKeys.has(f.Name) && !f.IsVirtual && !f.IsPrimaryKey)
      .sort((a, b) => {
        if (a.IsNameField !== b.IsNameField) return a.IsNameField ? -1 : 1;
        if (a.DefaultInView !== b.DefaultInView) return a.DefaultInView ? -1 : 1;
        return (a.Sequence ?? 9999) - (b.Sequence ?? 9999);
      })
      .map((f) => f.Name);
  }

  /** Build the engine {@link ClusterConfig} from the entity + the view-type config. */
  private buildClusterConfig(entity: EntityInfo, docID: string): ClusterConfig {
    const c = this.activeConfig;
    return {
      ...DefaultClusterConfig(),
      EntityName: entity.Name,
      EntityDocumentID: docID,
      ColorBy: c.colorBy,
      Dimensions: c.dimensions,
      Algorithm: c.algorithm,
      K: c.k,
      MaxRecords: c.maxRecords,
      Filter: this.filterText?.trim() ?? '',
    };
  }

  // ================================================================
  // LLM cluster naming
  // ================================================================

  /**
   * After clustering completes, send sample records per cluster to the "Cluster Naming" AI
   * prompt and apply the returned semantic labels to {@link clusters}. Best-effort: failures
   * are logged and leave the provisional "Cluster N" labels in place. No-op if the run became
   * stale while the LLM call was in flight.
   */
  private async requestClusterLabelsFromLLM(gqlProvider: GraphQLDataProvider, token: number, result: ClusterVisualizationResult): Promise<void> {
    try {
      const clusterData = this.buildClusterDataForPrompt(result);
      if (!clusterData) {
        return;
      }

      // AIEngineBase is deferred at startup; ensure it's loaded before reading .Prompts.
      await AIEngineBase.Instance.EnsureLoaded();
      const promptEntity = AIEngineBase.Instance.Prompts.find((p) => p.Name === 'Cluster Naming');
      if (!promptEntity) {
        console.warn('[ClusterViewRenderer] "Cluster Naming" prompt not found — run metadata sync');
        return;
      }

      const aiClient = new GraphQLAIClient(gqlProvider);
      const promptResult = await aiClient.RunAIPrompt({
        promptId: promptEntity.ID,
        data: { clusterData },
      });

      if (this.isStale(token) || !promptResult.success || !promptResult.parsedResult) {
        return;
      }

      const labels = promptResult.parsedResult as Array<{ clusterId: number; label: string }>;
      const clusterLabels: ClusterLabel[] = labels.map((l) => ({
        ClusterId: l.clusterId,
        Label: l.label,
        IsUserEdited: false,
      }));
      this.applyLabelsToClusters(clusterLabels);
      this.cdr.detectChanges();
    } catch (error) {
      console.warn('[ClusterViewRenderer] LLM cluster naming failed:', error);
    }
  }

  /** Build a text block describing sample records per cluster for the LLM naming prompt. */
  private buildClusterDataForPrompt(result: ClusterVisualizationResult): string | null {
    if (!result.Clusters || result.Clusters.length === 0) {
      return null;
    }

    const lines: string[] = [];
    for (const cluster of result.Clusters) {
      const clusterPoints = result.Points.filter((p) => p.ClusterId === cluster.Id);
      const samples = clusterPoints.slice(0, 5);
      if (samples.length === 0) {
        continue;
      }

      lines.push(`### Cluster ${cluster.Id} (${clusterPoints.length} records)`);
      for (const point of samples) {
        const meta = (point.Metadata ?? {}) as Record<string, unknown>;
        const fields = ['Name', 'Title', 'Description', 'Entity', 'Status', 'Type']
          .filter((f) => meta[f])
          .map((f) => `${f}: ${meta[f]}`)
          .join(', ');
        lines.push(`- ${fields || point.Label}`);
      }
      lines.push('');
    }

    return lines.join('\n');
  }

  /** Apply LLM-generated labels onto the live {@link clusters} array by cluster ID. */
  private applyLabelsToClusters(labels: ClusterLabel[]): void {
    for (const label of labels) {
      const cluster = this.clusters.find((c) => c.Id === label.ClusterId);
      if (cluster) {
        cluster.Label = label.Label;
      }
    }
  }

  // ================================================================
  // Point → record mapping
  // ================================================================

  onPointClicked(point: ClusterPoint): void {
    this.recordSelected.emit(this.recordForPoint(point) ?? { ID: point.VectorKey });
  }

  onOpenRecordRequested(point: ClusterPoint): void {
    this.recordOpened.emit(this.recordForPoint(point) ?? { ID: point.VectorKey });
  }

  /**
   * Resolve the host record corresponding to a scatter point. The vector key is the Entity
   * Record Document ID, so match on the point metadata's `RecordID` (the underlying entity
   * record's primary key) first, then fall back to a direct key match.
   */
  private recordForPoint(point: ClusterPoint): Record<string, unknown> | null {
    const meta = (point.Metadata ?? {}) as Record<string, unknown>;
    const recordID = typeof meta['RecordID'] === 'string' ? (meta['RecordID'] as string) : null;
    const key = recordID ?? point.VectorKey;
    if (!key) {
      return null;
    }
    return (
      this.records.find((r) => {
        const id = r['ID'];
        return typeof id === 'string' && UUIDsEqual(id, key);
      }) ?? null
    );
  }
}
