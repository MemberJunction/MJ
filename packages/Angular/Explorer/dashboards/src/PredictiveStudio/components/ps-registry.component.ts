import { ChangeDetectorRef, Component, Input, OnInit, ViewEncapsulation, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { MJButtonDirective } from '@memberjunction/ng-ui-components';
import { MJNotificationService } from '@memberjunction/ng-notifications';
import { UUIDsEqual } from '@memberjunction/global';
import { IMetadataProvider, UserInfo } from '@memberjunction/core';
import {
  MJMLModelEntity,
  PredictiveStudioPromoteModelOperation,
  PredictiveStudioModelTargetStatus,
} from '@memberjunction/core-entities';
import { PredictiveStudioEngine } from '../engine/predictive-studio.engine';
import { PSFeatureBar, PS_LIFECYCLE_STEPS, PSLifecycleStep } from '../predictive-studio.types';
import {
  PS_FEATURE_DOMINANCE_THRESHOLD,
  PSMetricDisplay,
  maxFeatureImportance,
  metricsToDisplay,
  overfitGap,
  parseFeatureImportance,
  parseMetrics,
  primaryAuc,
} from '../predictive-studio.view-models';
import { PSConfirmModalComponent } from './ps-confirm-modal.component';

interface ModelRowVM {
  id: string;
  name: string;
  version: number;
  algorithm: string;
  holdoutAuc: string;
  status: string;
  iconClass: string;
}

/** A pending promote/archive action awaiting user confirmation. */
interface PendingPromotion {
  modelId: string;
  modelName: string;
  targetStatus: PredictiveStudioModelTargetStatus;
  /** When true, the selected model trips the single-feature dominance leakage flag → sign-off required. */
  leakageFlagged: boolean;
}

/**
 * Model Registry panel: master list of trained ML Models + a rich detail pane with a lifecycle stepper
 * (Draft → Validated → Published → Archived), train-vs-holdout metric comparison, feature-importance
 * bars, a leakage sign-off gate, and lifecycle actions. Fully live against `MJ: ML Models`:
 *
 * - **Feature importance** is parsed from `model.FeatureImportance` (sorted by |value|, top 6, bars).
 * - **Performance metrics** come from `model.Metrics` (train) + `model.HoldoutMetrics` (holdout) —
 *   only the metrics actually recorded are shown.
 * - **Promote / Archive** call the {@link PredictiveStudioPromoteModelOperation} Remote Op behind a
 *   confirmation modal. On a leakage-flagged model, the modal surfaces the sign-off requirement and
 *   captures a required reason; on success the engine refreshes and the list re-renders reactively.
 *
 * 100% entity-agnostic — model names derive from the producing pipeline, never any business entity.
 */
@Component({
  standalone: true,
  selector: 'ps-registry',
  imports: [CommonModule, MJButtonDirective, PSConfirmModalComponent],
  encapsulation: ViewEncapsulation.None,
  styleUrls: ['../predictive-studio.shared.scss', './ps-registry.component.scss'],
  template: `
    <div class="ps-panel ps-registry" data-testid="ps-registry-panel">
      @if (models.length === 0) {
        <div class="ps-empty" data-testid="ps-registry-empty">
          <span class="ps-empty-ico"><i class="fa-solid fa-cubes"></i></span>
          <h3>No trained models yet</h3>
          <p>Train a pipeline to register your first immutable model. Each successful training run produces a versioned model you can validate, publish, and score with here.</p>
        </div>
      } @else {
        <div class="md-layout">
          <!-- master list -->
          <div class="ps-card mlist" data-testid="ps-registry-list">
            <div class="ps-card-head"><h3>ML Models</h3><span class="ps-badge gray">{{ models.length }}</span></div>
            <div class="ps-card-body" style="padding:8px">
              @for (m of models; track m.id) {
                <div class="mrow" data-testid="ps-registry-row" [class.sel]="m.id === selectedId" [class.arc]="m.status === 'Archived'" (click)="select(m.id)">
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
          <div class="ps-col detail" data-testid="ps-registry-detail">
            <div class="ps-card">
              <div class="ps-card-body dh">
                <div class="big-ico"><i class="fa-solid fa-cube"></i></div>
                <div style="flex:1">
                  <h2 data-testid="ps-registry-detail-name">{{ selected.name }} <span class="ps-tag ps-mono">v{{ selected.version }}</span></h2>
                  <div class="ps-muted ps-small sub">{{ selected.algorithm }}{{ targetSuffix }} · immutable snapshot</div>
                </div>
                <span class="ps-badge" [class]="statusBadgeClass(selected.status)">{{ selected.status }}</span>
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
                  <div class="mtile"><div class="ps-section-title">Train AUC</div><div class="v">{{ trainAuc }}</div><div class="ps-muted ps-small">in-sample · optimistic</div></div>
                  <div class="mtile honest"><div class="ps-section-title">Holdout AUC</div><div class="v">{{ selected.holdoutAuc }}</div><div class="ps-muted ps-small">out-of-sample · the honest number</div></div>
                </div>
                @if (secondaryMetrics.length > 0) {
                  <div class="stat-bar">
                    @for (s of secondaryMetrics; track s.key) {
                      <div class="b"><span class="ps-muted ps-small">{{ s.label }}</span><strong>{{ s.value }}</strong></div>
                    }
                  </div>
                } @else {
                  <div class="ps-small ps-muted" style="margin-top:6px">No secondary metrics recorded for this model.</div>
                }
                @if (gapText) {
                  <div class="ps-small ps-muted" style="margin-top:10px">
                    Train–holdout gap of <strong>{{ gapText }}</strong> {{ gapVerdict }}.
                  </div>
                }
              </div>
            </div>

            <!-- feature importance -->
            <div class="ps-card">
              <div class="ps-card-head"><h3>Feature Importance</h3><span class="ps-muted ps-small">{{ importanceCaption }}</span></div>
              <div class="ps-card-body">
                @if (importance.length > 0) {
                  @for (f of importance; track f.name) {
                    <div class="ps-fbar">
                      <span class="name ps-small">{{ f.name }}</span>
                      <div class="track"><span [class.warn]="f.warning" [style.width.%]="f.pct"></span></div>
                      <span class="ps-mono">{{ f.value }}</span>
                    </div>
                  }
                } @else {
                  <div class="ps-small ps-muted">No feature-importance data was recorded for this model.</div>
                }
              </div>
            </div>

            <!-- leakage sign-off gate -->
            @if (importance.length > 0) {
              <div class="ps-callout gate" [class.success]="!leakageFlagged" [class.warn]="leakageFlagged">
                <i [class]="leakageFlagged ? 'fa-solid fa-triangle-exclamation' : 'fa-solid fa-shield-halved'"></i>
                <div>
                  @if (leakageFlagged) {
                    <strong>Leakage flag raised.</strong> A single feature dominates — top importance is
                    <strong>{{ topFeatureName }} at {{ topFeatureValue }}</strong>, at/above the
                    <strong>{{ dominanceThreshold }}</strong> dominance threshold.
                    <div class="ps-small" style="margin-top:6px"><i class="fa-solid fa-pen"></i> Sign-off with a reason is required to publish this model.</div>
                  } @else {
                    <strong>Leakage gate clear.</strong> No single feature dominates — top importance is
                    <strong>{{ topFeatureName }} at {{ topFeatureValue }}</strong>, below the
                    <strong>{{ dominanceThreshold }}</strong> dominance threshold.
                    <div class="ps-small" style="margin-top:6px"><i class="fa-solid fa-check"></i> Sign-off required before any Validated → Published promotion.</div>
                  }
                </div>
              </div>
            }

            <!-- actions -->
            <div class="ps-card">
              <div class="ps-card-body ps-row" style="align-items:center">
                <span class="ps-muted ps-small" style="flex:1">{{ actionHint }}</span>
                @if (canValidate) {
                  <button mjButton variant="secondary" size="sm" data-testid="ps-registry-validate" (click)="requestPromote('Validated')"><i class="fa-solid fa-circle-check"></i> Mark Validated</button>
                }
                @if (canPublish) {
                  <button mjButton variant="primary" size="sm" data-testid="ps-registry-promote" (click)="requestPromote('Published')"><i class="fa-solid fa-arrow-up"></i> Promote to Published</button>
                }
                @if (canArchive) {
                  <button mjButton variant="secondary" size="sm" data-testid="ps-registry-archive" (click)="requestPromote('Archived')"><i class="fa-solid fa-box-archive"></i> Archive</button>
                }
              </div>
            </div>
          </div>
        </div>
      }

      @if (pending) {
        <ps-confirm-modal
          [title]="pendingTitle"
          [icon]="pendingIcon"
          [confirmIcon]="pendingIcon"
          [confirmLabel]="pendingConfirmLabel"
          [variant]="pendingVariant"
          [showReason]="pending.leakageFlagged || pending.targetStatus === 'Archived'"
          [reasonRequired]="pending.leakageFlagged"
          [reasonLabel]="pending.leakageFlagged ? 'Leakage sign-off reason' : 'Reason (optional)'"
          [reasonPlaceholder]="pending.leakageFlagged ? 'Explain why this model is safe to publish despite the leakage flag…' : 'Add an optional note for the record…'"
          [busy]="busy"
          (confirmed)="confirmPromote($event)"
          (cancelled)="cancelPromote()">
          <div [innerHTML]="pendingMessage"></div>
        </ps-confirm-modal>
      }
    </div>
  `,
})
export class PSRegistryComponent implements OnInit {
  @Input() engine!: PredictiveStudioEngine;
  /** Provider to route the promote Remote Op + engine refresh through (multi-provider correctness). */
  @Input() provider: IMetadataProvider | null = null;
  /** Acting user for the engine refresh after a mutation. */
  @Input() currentUser: UserInfo | null = null;

  private cdr = inject(ChangeDetectorRef);
  private notifications = inject(MJNotificationService);

  public models: ModelRowVM[] = [];
  public selectedId = '';
  public lifecycleSteps = PS_LIFECYCLE_STEPS;
  public readonly dominanceThreshold = PS_FEATURE_DOMINANCE_THRESHOLD.toFixed(2);

  /** Pending confirmation (null when no modal is open). */
  public pending: PendingPromotion | null = null;
  /** Remote Op in flight — drives the modal spinner + disables the buttons. */
  public busy = false;

  ngOnInit(): void {
    this.buildModels();
    this.selectedId = this.models[0]?.id ?? '';
  }

  // ---- selection + master list ----

  public select(id: string): void {
    this.selectedId = id;
  }

  public get selected(): ModelRowVM {
    return this.models.find((m) => m.id === this.selectedId) ?? this.models[0] ?? this.placeholder();
  }

  private get selectedEntity(): MJMLModelEntity | undefined {
    return this.engine?.Models.find((m) => UUIDsEqual(m.ID, this.selectedId));
  }

  // ---- live detail: feature importance + metrics ----

  /** Top-6 feature importance bars parsed live from the selected model's `FeatureImportance` JSON. */
  public get importance(): PSFeatureBar[] {
    return parseFeatureImportance(this.selectedEntity?.FeatureImportance, 6);
  }

  public get importanceCaption(): string {
    const n = this.importance.length;
    return n === 0 ? 'no data' : `normalized · top ${n}`;
  }

  public get topFeatureName(): string {
    return this.importance[0]?.name ?? '—';
  }
  public get topFeatureValue(): string {
    return this.importance[0]?.value ?? '—';
  }

  /** True when a single feature's |importance| meets/exceeds the dominance threshold. */
  public get leakageFlagged(): boolean {
    const max = maxFeatureImportance(this.selectedEntity?.FeatureImportance);
    return max != null && max >= PS_FEATURE_DOMINANCE_THRESHOLD;
  }

  /** Holdout AUC hero number, formatted, or '—'. */
  public get trainAuc(): string {
    const train = parseMetrics(this.selectedEntity?.Metrics).AUC;
    return train != null ? train.toFixed(3) : '—';
  }

  /** Secondary metric tiles (precision/recall/F1/log-loss/…) — only those actually recorded. */
  public get secondaryMetrics(): PSMetricDisplay[] {
    const e = this.selectedEntity;
    if (!e) return [];
    // Prefer holdout metrics for the honest secondary numbers; fall back to training metrics.
    const holdout = metricsToDisplay(parseMetrics(e.HoldoutMetrics));
    return holdout.length > 0 ? holdout : metricsToDisplay(parseMetrics(e.Metrics));
  }

  /** The formatted train–holdout overfit gap, or '' when not computable. */
  public get gapText(): string {
    const gap = overfitGap(this.selectedEntity ?? { Metrics: null, HoldoutMetrics: null });
    return gap == null ? '' : Math.abs(gap).toFixed(3);
  }

  public get gapVerdict(): string {
    const gap = overfitGap(this.selectedEntity ?? { Metrics: null, HoldoutMetrics: null });
    if (gap == null) return '';
    return gap > 0.1 ? 'is wide — watch for overfitting' : 'is within tolerance — no overfitting flag';
  }

  public get targetSuffix(): string {
    const target = this.selectedEntity?.TargetVariable;
    return target ? ` · predicts ${target}` : '';
  }

  // ---- lifecycle stepper ----

  public statusClass(status: string): string {
    switch (status) {
      case 'Published': return 'pub';
      case 'Validated': return 'val';
      case 'Draft': return 'dr';
      case 'Archived': return 'arc';
      default: return 'dr';
    }
  }

  public statusBadgeClass(status: string): string {
    switch (status) {
      case 'Published': return 'green';
      case 'Validated': return 'blue';
      case 'Archived': return 'gray';
      default: return 'amber';
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

  // ---- promote/archive availability ----

  public get canValidate(): boolean {
    return this.selected.status === 'Draft';
  }
  public get canPublish(): boolean {
    return this.selected.status === 'Validated' || this.selected.status === 'Draft';
  }
  public get canArchive(): boolean {
    return this.selected.status === 'Published' || this.selected.status === 'Validated';
  }

  public get actionHint(): string {
    switch (this.selected.status) {
      case 'Published': return 'This model is live. Archiving detaches its scoring bindings.';
      case 'Validated': return 'Validated and ready to publish — publishing makes it available for scoring.';
      case 'Draft': return 'Newly registered. Validate it before publishing to production.';
      case 'Archived': return 'Archived — superseded by a newer model.';
      default: return '';
    }
  }

  // ---- promote/archive flow (Remote Op) ----

  /** Open the confirmation modal for a lifecycle transition. */
  public requestPromote(targetStatus: PredictiveStudioModelTargetStatus): void {
    const entity = this.selectedEntity;
    if (!entity) return;
    this.pending = {
      modelId: entity.ID,
      modelName: this.selected.name,
      targetStatus,
      leakageFlagged: targetStatus === 'Published' && this.leakageFlagged,
    };
  }

  public cancelPromote(): void {
    if (this.busy) return;
    this.pending = null;
  }

  public get pendingTitle(): string {
    if (!this.pending) return '';
    return this.pending.targetStatus === 'Archived' ? 'Archive model' : `Promote to ${this.pending.targetStatus}`;
  }
  public get pendingIcon(): string {
    if (!this.pending) return 'fa-solid fa-check';
    return this.pending.targetStatus === 'Archived' ? 'fa-solid fa-box-archive' : 'fa-solid fa-arrow-up';
  }
  public get pendingConfirmLabel(): string {
    if (!this.pending) return 'Confirm';
    return this.pending.targetStatus === 'Archived' ? 'Archive' : `Promote to ${this.pending.targetStatus}`;
  }
  public get pendingVariant(): 'info' | 'warn' | 'danger' {
    if (!this.pending) return 'info';
    if (this.pending.targetStatus === 'Archived') return 'warn';
    return this.pending.leakageFlagged ? 'warn' : 'info';
  }
  public get pendingMessage(): string {
    if (!this.pending) return '';
    const name = escapeHtml(this.pending.modelName);
    if (this.pending.targetStatus === 'Archived') {
      return `Archive <strong>${name}</strong>? This detaches any active scoring bindings and removes it from production scoring. The model artifact remains immutable and recoverable.`;
    }
    if (this.pending.leakageFlagged) {
      return `<strong>${name}</strong> is flagged for possible target leakage. Publishing requires an explicit sign-off — confirm you understand the risk and provide a reason below.`;
    }
    return `Promote <strong>${name}</strong> to <strong>${this.pending.targetStatus}</strong>? This changes only the lifecycle state — the trained weights never change.`;
  }

  /** Run the promote Remote Op, then refresh the engine + close on success. */
  public async confirmPromote(reason: string): Promise<void> {
    if (!this.pending || this.busy) return;
    this.busy = true;
    const { modelId, modelName, targetStatus, leakageFlagged } = this.pending;
    try {
      const op = new PredictiveStudioPromoteModelOperation();
      const result = await op.Execute(
        { modelId, targetStatus, signOff: leakageFlagged ? true : undefined, reason: reason || undefined },
        { provider: this.provider ?? undefined, user: this.currentUser ?? undefined },
      );
      if (result.Success && result.Output?.promoted) {
        this.notifications.CreateSimpleNotification(
          `${modelName} → ${result.Output.status}`,
          'success',
          3500,
        );
        await this.refreshAfterMutation();
        this.pending = null;
      } else {
        this.notifications.CreateSimpleNotification(
          result.ErrorMessage || `Could not promote ${modelName} (status: ${result.Output?.status ?? 'unchanged'}).`,
          'error',
          5000,
        );
      }
    } catch (e) {
      this.notifications.CreateSimpleNotification(
        `Promotion failed: ${e instanceof Error ? e.message : String(e)}`,
        'error',
        5000,
      );
    } finally {
      this.busy = false;
      this.cdr.detectChanges();
    }
  }

  /** Force-refresh the engine's cached models, then rebuild the master list. */
  private async refreshAfterMutation(): Promise<void> {
    const provider = this.provider ?? undefined;
    await this.engine.Config(true, this.currentUser ?? undefined, provider);
    this.buildModels();
    if (!this.models.some((m) => m.id === this.selectedId)) {
      this.selectedId = this.models[0]?.id ?? '';
    }
    this.cdr.detectChanges();
  }

  // ---- master-list view-models ----

  private buildModels(): void {
    this.models = (this.engine?.Models ?? []).map((m) => this.toVM(m));
  }

  private toVM(m: MJMLModelEntity): ModelRowVM {
    const holdout = primaryAuc(m);
    return {
      id: m.ID,
      name: this.engine.ModelDisplayName(m),
      version: m.Version,
      algorithm: this.engine.AlgorithmName(m.AlgorithmID),
      holdoutAuc: holdout != null ? holdout.toFixed(3) : '—',
      status: m.Status,
      iconClass: 'xgb',
    };
  }

  private placeholder(): ModelRowVM {
    return { id: '', name: 'No model', version: 0, algorithm: '—', holdoutAuc: '—', status: 'Draft', iconClass: 'xgb' };
  }
}

/** Minimal HTML-escape for interpolating model names into the modal's innerHTML message. */
function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}
