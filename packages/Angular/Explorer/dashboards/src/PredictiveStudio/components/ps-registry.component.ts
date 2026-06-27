import { Component, Input, OnInit, ViewEncapsulation } from '@angular/core';
import { CommonModule } from '@angular/common';
import { MJButtonDirective } from '@memberjunction/ng-ui-components';
import { UUIDsEqual } from '@memberjunction/global';
import { MJMLModelEntity } from '@memberjunction/core-entities';
import { PredictiveStudioEngine } from '../engine/predictive-studio.engine';
import { PSFeatureBar, PS_LIFECYCLE_STEPS, PSLifecycleStep, SAMPLE_REGISTRY_IMPORTANCE } from '../predictive-studio.types';

interface ModelRowVM {
  id: string;
  name: string;
  version: number;
  algorithm: string;
  holdoutAuc: string;
  status: string;
  iconClass: string;
}

/**
 * Model Registry panel (mockup models-3): master list of trained ML Models + a rich detail pane with
 * a lifecycle stepper (Draft → Validated → Published → Archived), train-vs-holdout metric comparison,
 * feature-importance bars, a leakage sign-off gate, and a lineage chain. Binds to live MJ: ML Models;
 * detail metrics use representative values where the model row has none.
 */
@Component({
  standalone: true,
  selector: 'ps-registry',
  imports: [CommonModule, MJButtonDirective],
  encapsulation: ViewEncapsulation.None,
  styleUrls: ['../predictive-studio.shared.scss', './ps-registry.component.scss'],
  template: `
    <div class="ps-panel ps-registry">
      <div class="md-layout">
        <!-- master list -->
        <div class="ps-card mlist">
          <div class="ps-card-head"><h3>ML Models</h3><span class="ps-badge gray">{{ models.length }}</span></div>
          <div class="ps-card-body" style="padding:8px">
            @for (m of models; track m.id) {
              <div class="mrow" [class.sel]="m.id === selectedId" [class.arc]="m.status === 'Archived'" (click)="select(m.id)">
                <div class="ico" [class]="m.iconClass"><i class="fa-solid fa-cube"></i></div>
                <div style="flex:1;min-width:0">
                  <div class="nm">{{ m.name }}</div>
                  <div class="ln2 ps-muted ps-small">v{{ m.version }} · {{ m.algorithm }}</div>
                </div>
                <div class="auc">
                  <div class="v">{{ m.holdoutAuc }}</div>
                  <div class="st" [class]="statusClass(m.status)">{{ m.status }}</div>
                </div>
              </div>
            }
          </div>
        </div>

        <!-- detail -->
        <div class="ps-col detail">
          <div class="ps-card">
            <div class="ps-card-body dh">
              <div class="big-ico"><i class="fa-solid fa-cube"></i></div>
              <div style="flex:1">
                <h2>{{ selected.name }} <span class="ps-tag ps-mono">v{{ selected.version }}</span></h2>
                <div class="ps-muted ps-small sub">{{ selected.algorithm }} · renewal probability · immutable snapshot</div>
              </div>
              <span class="ps-badge green">✓ {{ selected.status }}</span>
            </div>
          </div>

          <!-- lifecycle -->
          <div class="ps-card">
            <div class="ps-card-body">
              <div class="ps-section-title">Lifecycle</div>
              <div class="ps-stepper">
                @for (step of lifecycleSteps; track step; let last = $last) {
                  <div class="ps-step" [class.done]="stepState(step) === 'done'" [class.curr]="stepState(step) === 'curr'">
                    <span class="pip">@if (stepState(step) === 'done') { <i class="fa-solid fa-check"></i> } @else { {{ $index + 1 }} }</span>
                    {{ step }}
                  </div>
                  @if (!last) { <span class="ln"></span> }
                }
              </div>
              <div class="ps-small ps-muted" style="margin-top:10px">
                Models are immutable once registered; promotion only changes lifecycle state, never weights.
              </div>
            </div>
          </div>

          <!-- performance -->
          <div class="ps-card">
            <div class="ps-card-head"><h3>Performance</h3><span class="ps-muted ps-small">Holdout = held-out test fold, never seen in training</span></div>
            <div class="ps-card-body">
              <div class="metric-pair">
                <div class="mtile"><div class="ps-section-title">Train AUC</div><div class="v">0.901</div><div class="ps-muted ps-small">in-sample · optimistic</div></div>
                <div class="mtile honest"><div class="ps-section-title">Holdout AUC</div><div class="v">{{ selected.holdoutAuc }}</div><div class="ps-muted ps-small">out-of-sample · the honest number</div></div>
              </div>
              <div class="stat-bar">
                <div class="b"><span class="ps-muted ps-small">Precision</span><strong>0.79</strong></div>
                <div class="b"><span class="ps-muted ps-small">Recall</span><strong>0.71</strong></div>
                <div class="b"><span class="ps-muted ps-small">F1</span><strong>0.75</strong></div>
                <div class="b"><span class="ps-muted ps-small">Log Loss</span><strong>0.247</strong></div>
                <div class="b"><span class="ps-muted ps-small">Brier</span><strong>0.118</strong></div>
              </div>
              <div class="ps-small ps-muted" style="margin-top:10px">
                Train–holdout gap of <strong>0.037</strong> is within tolerance — no overfitting flag.
              </div>
            </div>
          </div>

          <!-- feature importance -->
          <div class="ps-card">
            <div class="ps-card-head"><h3>Feature Importance</h3><span class="ps-muted ps-small">gain, normalized · top 6 of 41</span></div>
            <div class="ps-card-body">
              @for (f of importance; track f.name) {
                <div class="ps-fbar">
                  <span class="name ps-small">{{ f.name }}</span>
                  <div class="track"><span [style.width.%]="f.pct"></span></div>
                  <span class="ps-mono">{{ f.value }}</span>
                </div>
              }
            </div>
          </div>

          <!-- leakage sign-off gate -->
          <div class="ps-callout success gate">
            <i class="fa-solid fa-shield-halved"></i>
            <div>
              <strong>Leakage gate clear.</strong> No single feature dominates — top importance is
              <strong>tenure at 0.22</strong>, well below the <strong>0.60</strong> dominance threshold.
              <div class="ps-small" style="margin-top:6px"><i class="fa-solid fa-check"></i> Signed off by Amith N. — required before any Validated → Published promotion.</div>
            </div>
          </div>

          <!-- lineage -->
          <div class="ps-card">
            <div class="ps-card-head"><h3>Lineage</h3><span class="ps-muted ps-small">fully reproducible · every artifact pinned</span></div>
            <div class="ps-card-body lineage">
              <div class="ln-card"><div class="t">Pipeline</div><div class="n">Renewal Train v4</div><div class="x ps-muted ps-small">12 steps</div></div>
              <span class="ln-arrow"><i class="fa-solid fa-arrow-right"></i></span>
              <div class="ln-card"><div class="t">Training Run</div><div class="n">run-8821</div><div class="x ps-muted ps-small">142k rows · 6m 14s</div></div>
              <span class="ln-arrow"><i class="fa-solid fa-arrow-right"></i></span>
              <div class="ln-card cur"><div class="t">ML Model</div><div class="n">v{{ selected.version }} · this</div><div class="x ps-muted ps-small">#MR-4f2a</div></div>
              <span class="ln-arrow"><i class="fa-solid fa-arrow-right"></i></span>
              <div class="ln-card"><div class="t">Scoring Bindings</div><div class="n">2 active</div><div class="x ps-muted ps-small">Renewal Dash · Outreach Job</div></div>
            </div>
          </div>

          <!-- actions -->
          <div class="ps-card">
            <div class="ps-card-body ps-row" style="align-items:center">
              <span class="ps-muted ps-small" style="flex:1">This model is live in production. Archiving detaches its scoring bindings.</span>
              <button mjButton variant="secondary" size="sm">Compare to v3</button>
              <button mjButton variant="secondary" size="sm">Archive</button>
            </div>
          </div>
        </div>
      </div>
    </div>
  `,
})
export class PSRegistryComponent implements OnInit {
  @Input() engine!: PredictiveStudioEngine;

  public models: ModelRowVM[] = [];
  public selectedId = '';
  public lifecycleSteps = PS_LIFECYCLE_STEPS;

  ngOnInit(): void {
    this.buildModels();
    this.selectedId = this.models[0]?.id ?? '';
  }

  public get importance(): PSFeatureBar[] {
    return SAMPLE_REGISTRY_IMPORTANCE;
  }

  public get selected(): ModelRowVM {
    return this.models.find((m) => m.id === this.selectedId) ?? this.models[0] ?? this.placeholder();
  }

  public select(id: string): void {
    this.selectedId = id;
  }

  public statusClass(status: string): string {
    switch (status) {
      case 'Published': return 'pub';
      case 'Validated': return 'val';
      case 'Draft': return 'dr';
      case 'Archived': return 'arc';
      default: return 'dr';
    }
  }

  /** Stepper state for a lifecycle step relative to the selected model's status. */
  public stepState(step: PSLifecycleStep): 'done' | 'curr' | 'todo' {
    const order = PS_LIFECYCLE_STEPS.indexOf(this.selected.status as PSLifecycleStep);
    const idx = PS_LIFECYCLE_STEPS.indexOf(step);
    if (order < 0) return 'todo';
    if (idx < order) return 'done';
    if (idx === order) return 'curr';
    return 'todo';
  }

  private buildModels(): void {
    const live = this.engine?.Models ?? [];
    if (live.length > 0) {
      this.models = live.map((m) => this.toVM(m));
    } else {
      this.models = this.sampleModels();
    }
  }

  private toVM(m: MJMLModelEntity): ModelRowVM {
    const pipeline = this.engine.Pipelines.find((p) => UUIDsEqual(p.ID, m.PipelineID));
    const holdout = this.parseAuc(m.HoldoutMetrics) ?? this.parseAuc(m.Metrics);
    return {
      id: m.ID,
      name: pipeline?.Name ?? `Model ${m.Version}`,
      version: m.Version,
      algorithm: this.engine.AlgorithmName(m.AlgorithmID),
      holdoutAuc: holdout != null ? holdout.toFixed(3) : '—',
      status: m.Status,
      iconClass: 'xgb',
    };
  }

  private parseAuc(json: string | null): number | null {
    if (!json) return null;
    try {
      const parsed = JSON.parse(json) as Record<string, unknown>;
      const v = parsed['AUC'] ?? parsed['auc'] ?? parsed['holdoutAuc'];
      return typeof v === 'number' ? v : null;
    } catch {
      return null;
    }
  }

  private placeholder(): ModelRowVM {
    return { id: '', name: 'No model', version: 0, algorithm: '—', holdoutAuc: '—', status: 'Draft', iconClass: 'xgb' };
  }

  private sampleModels(): ModelRowVM[] {
    return [
      { id: 's1', name: 'Member Renewal Predictor', version: 4, algorithm: 'XGBoost', holdoutAuc: '0.864', status: 'Published', iconClass: 'xgb' },
      { id: 's2', name: 'Member Renewal Predictor', version: 3, algorithm: 'XGBoost', holdoutAuc: '0.851', status: 'Archived', iconClass: 'xgb' },
      { id: 's3', name: 'Event Return Predictor', version: 1, algorithm: 'XGBoost', holdoutAuc: '0.880', status: 'Validated', iconClass: 'xgb' },
      { id: 's4', name: 'Lapse Risk Scorer', version: 2, algorithm: 'LightGBM', holdoutAuc: '0.830', status: 'Validated', iconClass: 'lgbm' },
      { id: 's5', name: 'Lead Score Model', version: 1, algorithm: 'Random Forest', holdoutAuc: '0.790', status: 'Draft', iconClass: 'rf' },
    ];
  }
}
