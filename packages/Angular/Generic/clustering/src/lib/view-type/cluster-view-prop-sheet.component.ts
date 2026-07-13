import { Component, Input, Output, EventEmitter, ViewEncapsulation } from '@angular/core';
import { EntityInfo } from '@memberjunction/core';
import { IViewPropSheet } from '@memberjunction/ng-entity-viewer';
import { ClusterViewConfig, toClusterViewConfig } from './cluster-view.types';

/**
 * ClusterViewPropSheetComponent
 * -----------------------------
 * The configuration prop-sheet for the Cluster view type — honors {@link IViewPropSheet}.
 * Lets the user pick the algorithm, cluster count, 2D/3D layout, legend coloring, record cap,
 * and LLM naming. Emits the updated config (as the opaque host map) on every change so the host
 * can persist it into `UserView.DisplayState.viewTypeConfigs` and re-render the cluster.
 */
@Component({
  standalone: false,
  selector: 'mj-cluster-view-prop-sheet',
  encapsulation: ViewEncapsulation.None,
  template: `
    <div class="cluster-prop-sheet">
      <label class="cluster-prop-row">
        <span>Algorithm</span>
        <select class="mj-input" [value]="cfg.algorithm" (change)="patch({ algorithm: asAlgorithm($any($event.target).value) })">
          <option value="kmeans">K-Means</option>
          <option value="dbscan">DBSCAN</option>
        </select>
      </label>

      @if (cfg.algorithm === 'kmeans') {
        <label class="cluster-prop-row">
          <span>Clusters (K)</span>
          <input class="mj-input" type="number" min="2" max="20" [value]="cfg.k"
                 (input)="patch({ k: asInt($any($event.target).value, cfg.k) })" />
        </label>
      }

      <label class="cluster-prop-row">
        <span>Layout</span>
        <select class="mj-input" [value]="cfg.dimensions" (change)="patch({ dimensions: asDimensions($any($event.target).value) })">
          <option [value]="2">2D</option>
          <option [value]="3">3D</option>
        </select>
      </label>

      <label class="cluster-prop-row">
        <span>Color by</span>
        <select class="mj-input" [value]="cfg.colorBy" (change)="patch({ colorBy: asColorBy($any($event.target).value) })">
          <option value="cluster">Cluster</option>
          <option value="entity">Entity</option>
        </select>
      </label>

      <label class="cluster-prop-row">
        <span>Max records</span>
        <input class="mj-input" type="number" min="50" max="5000" step="50" [value]="cfg.maxRecords"
               (input)="patch({ maxRecords: asInt($any($event.target).value, cfg.maxRecords) })" />
      </label>

      <label class="cluster-prop-row cluster-prop-row--inline">
        <input class="mj-checkbox" type="checkbox" [checked]="cfg.nameClusters"
               (change)="patch({ nameClusters: $any($event.target).checked })" />
        <span>Name clusters with AI</span>
      </label>
    </div>
  `,
  styles: [`
    .cluster-prop-sheet { display: flex; flex-direction: column; gap: 12px; padding: 12px; }
    .cluster-prop-row { display: flex; flex-direction: column; gap: 4px; font-size: 13px; color: var(--mj-text-secondary); }
    .cluster-prop-row--inline { flex-direction: row; align-items: center; gap: 8px; }
  `],
})
export class ClusterViewPropSheetComponent implements IViewPropSheet<Record<string, unknown>> {
  @Input() entity: EntityInfo | null = null;

  private _config: Record<string, unknown> = {};
  @Input()
  set config(value: Record<string, unknown>) {
    this._config = value ?? {};
    this.cfg = toClusterViewConfig(this._config);
  }
  get config(): Record<string, unknown> {
    return this._config;
  }

  @Output() configChange = new EventEmitter<Record<string, unknown>>();

  /** The current parsed config (defaults applied) bound by the template. */
  public cfg: ClusterViewConfig = toClusterViewConfig({});

  /** Apply a partial change, re-emit the full config map to the host. */
  patch(change: Partial<ClusterViewConfig>): void {
    this.cfg = { ...this.cfg, ...change };
    this._config = { ...this.cfg } as unknown as Record<string, unknown>;
    this.configChange.emit(this._config);
  }

  asAlgorithm(v: string): 'kmeans' | 'dbscan' {
    return v === 'dbscan' ? 'dbscan' : 'kmeans';
  }
  asDimensions(v: string): 2 | 3 {
    return String(v) === '3' ? 3 : 2;
  }
  asColorBy(v: string): 'cluster' | 'entity' {
    return v === 'entity' ? 'entity' : 'cluster';
  }
  asInt(v: string, fallback: number): number {
    const n = parseInt(v, 10);
    return Number.isNaN(n) ? fallback : n;
  }
}
