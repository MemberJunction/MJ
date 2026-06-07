import {
  Component,
  Input,
  Output,
  EventEmitter,
  ChangeDetectorRef,
  OnInit,
  OnDestroy,
  ViewEncapsulation,
  inject,
} from '@angular/core';
import { Subject } from 'rxjs';
import { debounceTime, takeUntil } from 'rxjs/operators';
import { EntityInfo } from '@memberjunction/core';
import { UUIDsEqual } from '@memberjunction/global';
import { BaseAngularComponent } from '@memberjunction/ng-base-types';
import { IViewRenderer } from '@memberjunction/ng-entity-viewer';
import { ClusteringService } from '../clustering.service';
import { ClusterConfig, ClusterPoint, ClusterInfo } from '../clustering.types';
import { ClusterViewConfig, toClusterViewConfig } from './cluster-view.types';

/**
 * ClusterViewRendererComponent
 * ----------------------------
 * The Cluster **view type** renderer — a thin {@link IViewRenderer} adapter that lets any
 * entity with vectors be visualized as a cluster scatter directly inside `mj-entity-viewer`,
 * reusing the exact same {@link ClusteringService} + `mj-cluster-scatter` the Knowledge Hub
 * uses (no duplicated clustering logic).
 *
 * The host feeds it the standard renderer inputs (entity / records / filterText / config) via
 * `setInput`, and listens for `recordSelected` / `recordOpened`. When the entity or config
 * changes it re-runs the server clustering pipeline and rebinds the scatter.
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
          [IsLoading]="isLoading"
          (PointClicked)="onPointClicked($event)"
          (OpenRecordRequested)="onOpenRecordRequested($event)">
        </mj-cluster-scatter>
      }
    </div>
  `,
  styles: [`
    .cluster-view-renderer { height: 100%; width: 100%; display: flex; flex-direction: column; }
    .cluster-view-renderer mj-cluster-scatter { flex: 1 1 auto; min-height: 0; }
    .cluster-view-message {
      flex: 1 1 auto; display: flex; flex-direction: column; align-items: center; justify-content: center;
      gap: 12px; color: var(--mj-text-muted); padding: 32px; text-align: center;
    }
    .cluster-view-message i { font-size: 32px; opacity: 0.6; }
    .cluster-view-error { color: var(--mj-status-error-text); }
  `],
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
    this._config = value ?? {};
    this.activeConfig = toClusterViewConfig(this._config);
    this.scheduleRecluster();
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
  public isLoading = false;
  public errorMessage: string | null = null;

  private recluster$ = new Subject<void>();
  private destroy$ = new Subject<void>();
  private clusteringService = inject(ClusteringService);

  constructor(private cdr: ChangeDetectorRef) {
    super();
  }

  ngOnInit(): void {
    // Debounce so the entity + config inputs that arrive together on mount cause one run.
    this.recluster$.pipe(debounceTime(50), takeUntil(this.destroy$)).subscribe(() => void this.runClustering());
  }

  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
  }

  private scheduleRecluster(): void {
    this.recluster$.next();
  }

  /** Runs the server clustering pipeline for the current entity + config and rebinds the scatter. */
  private async runClustering(): Promise<void> {
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
      const cfg = this.buildClusterConfig(entity);
      const result = await this.clusteringService.RunClusterAnalysis(
        cfg,
        { Dimensions: this.activeConfig.dimensions, NameClusters: this.activeConfig.nameClusters },
        this.ProviderToUse,
      );

      if (!result) {
        // No GraphQL transport available (e.g. non-browser provider).
        this.errorMessage = 'Clustering requires a GraphQL data provider, which is not available here.';
        this.points = [];
        this.clusters = [];
      } else {
        this.points = result.Points;
        this.clusters = result.Clusters;
      }
    } catch (err) {
      this.errorMessage = err instanceof Error ? err.message : String(err);
      this.points = [];
      this.clusters = [];
    } finally {
      this.isLoading = false;
      this.cdr.detectChanges();
    }
  }

  /** Build the engine {@link ClusterConfig} from the entity + the view-type config. */
  private buildClusterConfig(entity: EntityInfo): ClusterConfig {
    const c = this.activeConfig;
    return {
      EntityName: entity.Name,
      EntityDocumentID: '',
      ColorBy: c.colorBy,
      Dimensions: c.dimensions,
      Algorithm: c.algorithm,
      K: c.k,
      Epsilon: 0.3,
      MinPoints: 3,
      DistanceMetric: 'cosine',
      MaxRecords: c.maxRecords,
      Filter: '',
    };
  }

  onPointClicked(point: ClusterPoint): void {
    this.recordSelected.emit(this.recordForPoint(point) ?? { ID: point.VectorKey });
  }

  onOpenRecordRequested(point: ClusterPoint): void {
    this.recordOpened.emit(this.recordForPoint(point) ?? { ID: point.VectorKey });
  }

  /** Resolve the host record that corresponds to a scatter point, by primary-key match. */
  private recordForPoint(point: ClusterPoint): Record<string, unknown> | null {
    const key = point.VectorKey;
    if (!key) {
      return null;
    }
    return (
      this.records.find(r => {
        const id = r['ID'];
        return typeof id === 'string' && UUIDsEqual(id, key);
      }) ?? null
    );
  }

}
