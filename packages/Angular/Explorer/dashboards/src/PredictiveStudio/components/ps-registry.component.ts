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
  MaxFeatureImportance,
  MetricsToDisplay,
  OverfitGap,
  ParseFeatureImportance,
  ParseMetrics,
  PrimaryAuc,
} from '../predictive-studio.view-models';
import { PSConfirmModalComponent } from './ps-confirm-modal.component';
import { HumanizeFeatureName } from '../at-risk.view-models';

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
  styleUrls: ['../predictive-studio.shared.css', './ps-registry.component.css'],
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
                    @for (s of secondaryMetrics; track s.Key) {
                      <div class="b"><span class="ps-muted ps-small">{{ s.Label }}</span><strong>{{ s.Value }}</strong></div>
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
                      <span class="name ps-small" [title]="f.name">{{ f.name }}</span>
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
  @Input() CurrentUser: UserInfo | null = null;

  /** @deprecated Use {@link CurrentUser}. */
  @Input() set currentUser(value: UserInfo | null) {
    this.CurrentUser = value;
  }
  /** @deprecated Use {@link CurrentUser}. */
  get currentUser(): UserInfo | null {
    return this.CurrentUser;
  }

  private cdr = inject(ChangeDetectorRef);
  private notifications = inject(MJNotificationService);

  public Models: ModelRowVM[] = [];

  /** @deprecated Use {@link Models}. */
  public get models(): ModelRowVM[] {
    return this.Models;
  }
  /** @deprecated Use {@link Models}. */
  public set models(value: ModelRowVM[]) {
    this.Models = value;
  }
  public SelectedId = '';

  /** @deprecated Use {@link SelectedId}. */
  public get selectedId() {
    return this.SelectedId;
  }
  /** @deprecated Use {@link SelectedId}. */
  public set selectedId(value) {
    this.SelectedId = value;
  }
  public LifecycleSteps = PS_LIFECYCLE_STEPS;

  /** @deprecated Use {@link LifecycleSteps}. */
  public get lifecycleSteps() {
    return this.LifecycleSteps;
  }
  /** @deprecated Use {@link LifecycleSteps}. */
  public set lifecycleSteps(value) {
    this.LifecycleSteps = value;
  }
  public readonly DominanceThreshold = PS_FEATURE_DOMINANCE_THRESHOLD.toFixed(2);

  /** @deprecated Use {@link DominanceThreshold}. */
  public get dominanceThreshold() {
    return this.DominanceThreshold;
  }

  /** Pending confirmation (null when no modal is open). */
  public Pending: PendingPromotion | null = null;

  /** @deprecated Use {@link Pending}. */
  public get pending(): PendingPromotion | null {
    return this.Pending;
  }
  /** @deprecated Use {@link Pending}. */
  public set pending(value: PendingPromotion | null) {
    this.Pending = value;
  }
  /** Remote Op in flight — drives the modal spinner + disables the buttons. */
  public Busy = false;

  /** @deprecated Use {@link Busy}. */
  public get busy() {
    return this.Busy;
  }
  /** @deprecated Use {@link Busy}. */
  public set busy(value) {
    this.Busy = value;
  }

  ngOnInit(): void {
    this.buildModels();
    this.SelectedId = this.Models[0]?.id ?? '';
  }

  // ---- selection + master list ----

  public Select(id: string): void {
    this.SelectedId = id;
  }

  /** @deprecated Use {@link Select}. */
  public select(id: string): void {
    return this.Select(id);
  }

  public get Selected(): ModelRowVM {
    return this.Models.find((m) => m.id === this.SelectedId) ?? this.Models[0] ?? this.placeholder();
  }

  /** @deprecated Use {@link Selected}. */
  public get selected(): ModelRowVM {
    return this.Selected;
  }

  private get selectedEntity(): MJMLModelEntity | undefined {
    return this.engine?.Models.find((m) => UUIDsEqual(m.ID, this.SelectedId));
  }

  // ---- live detail: feature importance + metrics ----

  /** Top-6 feature importance bars parsed live from the selected model's `FeatureImportance` JSON, with humanized display names. */
  public get Importance(): PSFeatureBar[] {
    return ParseFeatureImportance(this.selectedEntity?.FeatureImportance, 6).map((b) => ({
      ...b,
      name: HumanizeFeatureName(b.name),
    }));
  }

  /** @deprecated Use {@link Importance}. */
  public get importance(): PSFeatureBar[] {
    return this.Importance;
  }

  public get ImportanceCaption(): string {
    const n = this.Importance.length;
    return n === 0 ? 'no data' : `normalized · top ${n}`;
  }

  /** @deprecated Use {@link ImportanceCaption}. */
  public get importanceCaption(): string {
    return this.ImportanceCaption;
  }

  public get TopFeatureName(): string {
    return this.Importance[0]?.name ?? '—';
  }

  /** @deprecated Use {@link TopFeatureName}. */
  public get topFeatureName(): string {
    return this.TopFeatureName;
  }
  public get TopFeatureValue(): string {
    return this.Importance[0]?.value ?? '—';
  }

  /** @deprecated Use {@link TopFeatureValue}. */
  public get topFeatureValue(): string {
    return this.TopFeatureValue;
  }

  /** True when a single feature's |importance| meets/exceeds the dominance threshold. */
  public get LeakageFlagged(): boolean {
    const max = MaxFeatureImportance(this.selectedEntity?.FeatureImportance);
    return max != null && max >= PS_FEATURE_DOMINANCE_THRESHOLD;
  }

  /** @deprecated Use {@link LeakageFlagged}. */
  public get leakageFlagged(): boolean {
    return this.LeakageFlagged;
  }

  /** Holdout AUC hero number, formatted, or '—'. */
  public get TrainAuc(): string {
    const train = ParseMetrics(this.selectedEntity?.Metrics).AUC;
    return train != null ? train.toFixed(3) : '—';
  }

  /** @deprecated Use {@link TrainAuc}. */
  public get trainAuc(): string {
    return this.TrainAuc;
  }

  /** Secondary metric tiles (precision/recall/F1/log-loss/…) — only those actually recorded. */
  public get SecondaryMetrics(): PSMetricDisplay[] {
    const e = this.selectedEntity;
    if (!e) return [];
    // Prefer holdout metrics for the honest secondary numbers; fall back to training metrics.
    const holdout = MetricsToDisplay(ParseMetrics(e.HoldoutMetrics));
    return holdout.length > 0 ? holdout : MetricsToDisplay(ParseMetrics(e.Metrics));
  }

  /** @deprecated Use {@link SecondaryMetrics}. */
  public get secondaryMetrics(): PSMetricDisplay[] {
    return this.SecondaryMetrics;
  }

  /** The formatted train–holdout overfit gap, or '' when not computable. */
  public get GapText(): string {
    const gap = OverfitGap(this.selectedEntity ?? { Metrics: null, HoldoutMetrics: null });
    return gap == null ? '' : Math.abs(gap).toFixed(3);
  }

  /** @deprecated Use {@link GapText}. */
  public get gapText(): string {
    return this.GapText;
  }

  public get GapVerdict(): string {
    const gap = OverfitGap(this.selectedEntity ?? { Metrics: null, HoldoutMetrics: null });
    if (gap == null) return '';
    return gap > 0.1 ? 'is wide — watch for overfitting' : 'is within tolerance — no overfitting flag';
  }

  /** @deprecated Use {@link GapVerdict}. */
  public get gapVerdict(): string {
    return this.GapVerdict;
  }

  public get TargetSuffix(): string {
    const target = this.selectedEntity?.TargetVariable;
    return target ? ` · predicts ${target}` : '';
  }

  /** @deprecated Use {@link TargetSuffix}. */
  public get targetSuffix(): string {
    return this.TargetSuffix;
  }

  // ---- lifecycle stepper ----

  public StatusClass(status: string): string {
    switch (status) {
      case 'Published': return 'pub';
      case 'Validated': return 'val';
      case 'Draft': return 'dr';
      case 'Archived': return 'arc';
      default: return 'dr';
    }
  }

  /** @deprecated Use {@link StatusClass}. */
  public statusClass(status: string): string {
    return this.StatusClass(status);
  }

  public StatusBadgeClass(status: string): string {
    switch (status) {
      case 'Published': return 'green';
      case 'Validated': return 'blue';
      case 'Archived': return 'gray';
      default: return 'amber';
    }
  }

  /** @deprecated Use {@link StatusBadgeClass}. */
  public statusBadgeClass(status: string): string {
    return this.StatusBadgeClass(status);
  }

  /** Stepper state for a lifecycle step relative to the selected model's status. */
  public StepState(step: PSLifecycleStep): 'done' | 'curr' | 'todo' {
    const order = PS_LIFECYCLE_STEPS.indexOf(this.Selected.status as PSLifecycleStep);
    const idx = PS_LIFECYCLE_STEPS.indexOf(step);
    if (order < 0) return 'todo';
    if (idx < order) return 'done';
    if (idx === order) return 'curr';
    return 'todo';
  }

  /** @deprecated Use {@link StepState}. */
  public stepState(step: PSLifecycleStep): 'done' | 'curr' | 'todo' {
    return this.StepState(step);
  }

  // ---- promote/archive availability ----

  public get CanValidate(): boolean {
    return this.Selected.status === 'Draft';
  }

  /** @deprecated Use {@link CanValidate}. */
  public get canValidate(): boolean {
    return this.CanValidate;
  }
  public get CanPublish(): boolean {
    return this.Selected.status === 'Validated' || this.Selected.status === 'Draft';
  }

  /** @deprecated Use {@link CanPublish}. */
  public get canPublish(): boolean {
    return this.CanPublish;
  }
  public get CanArchive(): boolean {
    return this.Selected.status === 'Published' || this.Selected.status === 'Validated';
  }

  /** @deprecated Use {@link CanArchive}. */
  public get canArchive(): boolean {
    return this.CanArchive;
  }

  public get ActionHint(): string {
    switch (this.Selected.status) {
      case 'Published': return 'This model is live. Archiving detaches its scoring bindings.';
      case 'Validated': return 'Validated and ready to publish — publishing makes it available for scoring.';
      case 'Draft': return 'Newly registered. Validate it before publishing to production.';
      case 'Archived': return 'Archived — superseded by a newer model.';
      default: return '';
    }
  }

  /** @deprecated Use {@link ActionHint}. */
  public get actionHint(): string {
    return this.ActionHint;
  }

  // ---- promote/archive flow (Remote Op) ----

  /** Open the confirmation modal for a lifecycle transition. */
  public RequestPromote(targetStatus: PredictiveStudioModelTargetStatus): void {
    const entity = this.selectedEntity;
    if (!entity) return;
    this.Pending = {
      modelId: entity.ID,
      modelName: this.Selected.name,
      targetStatus,
      leakageFlagged: targetStatus === 'Published' && this.LeakageFlagged,
    };
  }

  /** @deprecated Use {@link RequestPromote}. */
  public requestPromote(targetStatus: PredictiveStudioModelTargetStatus): void {
    return this.RequestPromote(targetStatus);
  }

  public CancelPromote(): void {
    if (this.Busy) return;
    this.Pending = null;
  }

  /** @deprecated Use {@link CancelPromote}. */
  public cancelPromote(): void {
    return this.CancelPromote();
  }

  public get PendingTitle(): string {
    if (!this.Pending) return '';
    return this.Pending.targetStatus === 'Archived' ? 'Archive model' : `Promote to ${this.Pending.targetStatus}`;
  }

  /** @deprecated Use {@link PendingTitle}. */
  public get pendingTitle(): string {
    return this.PendingTitle;
  }
  public get PendingIcon(): string {
    if (!this.Pending) return 'fa-solid fa-check';
    return this.Pending.targetStatus === 'Archived' ? 'fa-solid fa-box-archive' : 'fa-solid fa-arrow-up';
  }

  /** @deprecated Use {@link PendingIcon}. */
  public get pendingIcon(): string {
    return this.PendingIcon;
  }
  public get PendingConfirmLabel(): string {
    if (!this.Pending) return 'Confirm';
    return this.Pending.targetStatus === 'Archived' ? 'Archive' : `Promote to ${this.Pending.targetStatus}`;
  }

  /** @deprecated Use {@link PendingConfirmLabel}. */
  public get pendingConfirmLabel(): string {
    return this.PendingConfirmLabel;
  }
  public get PendingVariant(): 'info' | 'warn' | 'danger' {
    if (!this.Pending) return 'info';
    if (this.Pending.targetStatus === 'Archived') return 'warn';
    return this.Pending.leakageFlagged ? 'warn' : 'info';
  }

  /** @deprecated Use {@link PendingVariant}. */
  public get pendingVariant(): 'info' | 'warn' | 'danger' {
    return this.PendingVariant;
  }
  public get PendingMessage(): string {
    if (!this.Pending) return '';
    const name = escapeHtml(this.Pending.modelName);
    if (this.Pending.targetStatus === 'Archived') {
      return `Archive <strong>${name}</strong>? This detaches any active scoring bindings and removes it from production scoring. The model artifact remains immutable and recoverable.`;
    }
    if (this.Pending.leakageFlagged) {
      return `<strong>${name}</strong> is flagged for possible target leakage. Publishing requires an explicit sign-off — confirm you understand the risk and provide a reason below.`;
    }
    return `Promote <strong>${name}</strong> to <strong>${this.Pending.targetStatus}</strong>? This changes only the lifecycle state — the trained weights never change.`;
  }

  /** @deprecated Use {@link PendingMessage}. */
  public get pendingMessage(): string {
    return this.PendingMessage;
  }

  /** Run the promote Remote Op, then refresh the engine + close on success. */
  public async ConfirmPromote(reason: string): Promise<void> {
    if (!this.Pending || this.Busy) return;
    this.Busy = true;
    const { modelId, modelName, targetStatus, leakageFlagged } = this.Pending;
    try {
      const op = new PredictiveStudioPromoteModelOperation();
      const result = await op.Execute(
        { modelId, targetStatus, signOff: leakageFlagged ? true : undefined, reason: reason || undefined },
        { provider: this.provider ?? undefined, user: this.CurrentUser ?? undefined },
      );
      if (result.Success && result.Output?.promoted) {
        this.notifications.CreateSimpleNotification(
          `${modelName} → ${result.Output.status}`,
          'success',
          3500,
        );
        await this.refreshAfterMutation();
        this.Pending = null;
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
      this.Busy = false;
      this.cdr.detectChanges();
    }
  }

  /** @deprecated Use {@link ConfirmPromote}. */
  public async confirmPromote(reason: string): Promise<void> {
    return this.ConfirmPromote(reason);
  }

  /** Force-refresh the engine's cached models, then rebuild the master list. */
  private async refreshAfterMutation(): Promise<void> {
    const provider = this.provider ?? undefined;
    await this.engine.Config(true, this.CurrentUser ?? undefined, provider);
    this.buildModels();
    if (!this.Models.some((m) => m.id === this.SelectedId)) {
      this.SelectedId = this.Models[0]?.id ?? '';
    }
    this.cdr.detectChanges();
  }

  // ---- master-list view-models ----

  private buildModels(): void {
    this.Models = (this.engine?.Models ?? []).map((m) => this.toVM(m));
  }

  private toVM(m: MJMLModelEntity): ModelRowVM {
    const holdout = PrimaryAuc(m);
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
