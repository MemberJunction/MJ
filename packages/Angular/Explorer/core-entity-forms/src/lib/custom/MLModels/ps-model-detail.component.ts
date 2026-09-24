import {
  ChangeDetectionStrategy,
  ChangeDetectorRef,
  Component,
  EventEmitter,
  Input,
  Output,
  inject,
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { MJButtonDirective } from '@memberjunction/ng-ui-components';
import { MJNotificationService } from '@memberjunction/ng-notifications';
import { IMetadataProvider, UserInfo } from '@memberjunction/core';
import {
  MJMLModelEntity,
  PredictiveStudioPromoteModelOperation,
  PredictiveStudioModelTargetStatus,
} from '@memberjunction/core-entities';

import {
  PSFeatureBar,
  PSMetricDisplay,
  PS_FEATURE_DOMINANCE_THRESHOLD,
  FormatMetricValue,
  HumanizeFeatureName,
  MaxFeatureImportance,
  MetricsToDisplay,
  OverfitGap,
  ParseFeatureImportance,
  ParseMetrics,
  PrimaryModelScore,
} from './ml-model-view-models';

/** A pending promote/archive action awaiting user confirmation. */
interface PendingPromotion {
  modelId: string;
  modelName: string;
  targetStatus: PredictiveStudioModelTargetStatus;
  leakageFlagged: boolean;
}

/**
 * **PSModelDetailComponent** — Unified enterprise component for inspecting, evaluating,
 * and promoting versioned ML Models. Shared between:
 *   1. **Predictive Studio Model Registry** (`PSRegistryComponent`)
 *   2. **Custom Entity Form for `MJ: ML Models`** (`MLModelFormComponentExtended`)
 *
 * Renders:
 *   - Identity & immutable snapshot badge
 *   - Progressive 4-stage lifecycle stepper (Draft → Validated → Published → Archived)
 *   - In-sample train vs out-of-sample holdout performance cards and overfit gap check
 *   - Key feature importance rankings with single-feature dominance warnings
 *   - Target leakage gate verification and required sign-off rationale capture
 *   - Remote Operation lifecycle promotion (Validate, Publish, Archive)
 */
@Component({
  standalone: true,
  selector: 'ps-model-detail',
  templateUrl: './ps-model-detail.component.html',
  styleUrls: ['./ps-model-detail.component.css'],
  imports: [CommonModule, FormsModule, MJButtonDirective],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class PSModelDetailComponent {
  @Input() Model: MJMLModelEntity | null = null;

  /** @deprecated Use {@link Model}. */
  @Input() set model(value: MJMLModelEntity | null) {
    this.Model = value;
  }
  /** @deprecated Use {@link Model}. */
  get model(): MJMLModelEntity | null {
    return this.Model;
  }
  @Input() Provider: IMetadataProvider | null = null;

  /** @deprecated Use {@link Provider}. */
  @Input() set provider(value: IMetadataProvider | null) {
    this.Provider = value;
  }
  /** @deprecated Use {@link Provider}. */
  get provider(): IMetadataProvider | null {
    return this.Provider;
  }
  @Input() CurrentUser: UserInfo | null = null;

  /** @deprecated Use {@link CurrentUser}. */
  @Input() set currentUser(value: UserInfo | null) {
    this.CurrentUser = value;
  }
  /** @deprecated Use {@link CurrentUser}. */
  get currentUser(): UserInfo | null {
    return this.CurrentUser;
  }
  @Input() ShowActions = true;

  /** @deprecated Use {@link ShowActions}. */
  @Input() set showActions(value: PSModelDetailComponent['ShowActions']) {
    this.ShowActions = value;
  }
  /** @deprecated Use {@link ShowActions}. */
  get showActions(): PSModelDetailComponent['ShowActions'] {
    return this.ShowActions;
  }

  @Output() StatusChanged = new EventEmitter<{ modelId: string; newStatus: string }>();

  /**
   * @deprecated Use {@link StatusChanged}.
   *
   * The same emitter under the old binding name, so a template still binding
   * (statusChanged) keeps working. Must stay AFTER StatusChanged: class fields
   * initialise in order, and the other way round this captures undefined.
   */
  @Output() statusChanged = this.StatusChanged;

  private readonly cdr = inject(ChangeDetectorRef);
  private readonly notifications = inject(MJNotificationService);

  public readonly LifecycleSteps = ['Draft', 'Validated', 'Published', 'Archived'] as const;

  /** @deprecated Use {@link LifecycleSteps}. */
  public get lifecycleSteps() {
    return this.LifecycleSteps;
  }
  public readonly DominanceThreshold = PS_FEATURE_DOMINANCE_THRESHOLD.toFixed(2);

  /** @deprecated Use {@link DominanceThreshold}. */
  public get dominanceThreshold() {
    return this.DominanceThreshold;
  }

  public Pending: PendingPromotion | null = null;

  /** @deprecated Use {@link Pending}. */
  public get pending(): PendingPromotion | null {
    return this.Pending;
  }
  /** @deprecated Use {@link Pending}. */
  public set pending(value: PendingPromotion | null) {
    this.Pending = value;
  }
  public PendingReason = '';

  /** @deprecated Use {@link PendingReason}. */
  public get pendingReason() {
    return this.PendingReason;
  }
  /** @deprecated Use {@link PendingReason}. */
  public set pendingReason(value) {
    this.PendingReason = value;
  }
  public Busy = false;

  /** @deprecated Use {@link Busy}. */
  public get busy() {
    return this.Busy;
  }
  /** @deprecated Use {@link Busy}. */
  public set busy(value) {
    this.Busy = value;
  }

  @Input() displayName?: string;

  public get ModelDisplayName(): string {
    if (this.displayName) return this.displayName;
    if (!this.Model) return '';
    return this.Model.Pipeline || (this.Model.Algorithm ? `${this.Model.Algorithm} Model` : 'ML Model');
  }

  /** @deprecated Use {@link ModelDisplayName}. */
  public get modelDisplayName(): string {
    return this.ModelDisplayName;
  }

  // ── Badges & Lifecycle Stepper ──

  public StatusBadgeClass(status: string | null | undefined): string {
    switch ((status ?? '').toLowerCase()) {
      case 'published':
        return 'green';
      case 'validated':
        return 'blue';
      case 'draft':
        return 'amber';
      case 'archived':
        return 'gray';
      default:
        return 'gray';
    }
  }

  /** @deprecated Use {@link StatusBadgeClass}. */
  public statusBadgeClass(status: string | null | undefined): string {
    return this.StatusBadgeClass(status);
  }

  public StepState(step: string): 'done' | 'curr' | 'todo' {
    const order = ['Draft', 'Validated', 'Published', 'Archived'];
    const currIdx = order.indexOf(this.Model?.Status ?? 'Draft');
    const stepIdx = order.indexOf(step);
    if (stepIdx < currIdx) return 'done';
    if (stepIdx === currIdx) return 'curr';
    return 'todo';
  }

  /** @deprecated Use {@link StepState}. */
  public stepState(step: string): 'done' | 'curr' | 'todo' {
    return this.StepState(step);
  }

  public get TargetSuffix(): string {
    const target = this.Model?.TargetVariable;
    return target ? ` · predicts ${target}` : '';
  }

  /** @deprecated Use {@link TargetSuffix}. */
  public get targetSuffix(): string {
    return this.TargetSuffix;
  }

  // ── Metrics & Performance Derivations ──

  public get PrimaryScoreLabel(): string {
    if (!this.Model) return 'Score';
    const score = PrimaryModelScore(this.Model);
    return score?.label ?? 'AUC';
  }

  /** @deprecated Use {@link PrimaryScoreLabel}. */
  public get primaryScoreLabel(): string {
    return this.PrimaryScoreLabel;
  }

  public get TrainPrimaryScore(): string {
    if (!this.Model) return '—';
    const score = PrimaryModelScore(this.Model);
    const trainMetrics = ParseMetrics(this.Model.Metrics);
    if (score && trainMetrics[score.key] != null) {
      return FormatMetricValue(score.key, trainMetrics[score.key]!);
    }
    return trainMetrics.AUC != null ? trainMetrics.AUC.toFixed(3) : '—';
  }

  /** @deprecated Use {@link TrainPrimaryScore}. */
  public get trainPrimaryScore(): string {
    return this.TrainPrimaryScore;
  }

  public get HoldoutPrimaryScore(): string {
    if (!this.Model) return '—';
    const score = PrimaryModelScore(this.Model);
    const holdoutMetrics = ParseMetrics(this.Model.HoldoutMetrics);
    if (score && holdoutMetrics[score.key] != null) {
      return FormatMetricValue(score.key, holdoutMetrics[score.key]!);
    }
    return holdoutMetrics.AUC != null ? holdoutMetrics.AUC.toFixed(3) : '—';
  }

  /** @deprecated Use {@link HoldoutPrimaryScore}. */
  public get holdoutPrimaryScore(): string {
    return this.HoldoutPrimaryScore;
  }

  public get SecondaryMetrics(): PSMetricDisplay[] {
    if (!this.Model) return [];
    const score = PrimaryModelScore(this.Model);
    const primaryKey = score?.key;
    const holdout = MetricsToDisplay(ParseMetrics(this.Model.HoldoutMetrics), { excludeAuc: false });
    const all = holdout.length > 0 ? holdout : MetricsToDisplay(ParseMetrics(this.Model.Metrics), { excludeAuc: false });
    return primaryKey ? all.filter((m) => m.key !== primaryKey) : all.filter((m) => m.key !== 'AUC');
  }

  /** @deprecated Use {@link SecondaryMetrics}. */
  public get secondaryMetrics(): PSMetricDisplay[] {
    return this.SecondaryMetrics;
  }

  public get GapText(): string {
    if (!this.Model) return '';
    const gap = OverfitGap(this.Model);
    return gap == null ? '' : Math.abs(gap).toFixed(3);
  }

  /** @deprecated Use {@link GapText}. */
  public get gapText(): string {
    return this.GapText;
  }

  public get GapVerdict(): string {
    if (!this.Model) return '';
    const gap = OverfitGap(this.Model);
    if (gap == null) return '';
    return gap > 0.1 ? 'is wide — watch for overfitting' : 'is within tolerance — no overfitting flag';
  }

  /** @deprecated Use {@link GapVerdict}. */
  public get gapVerdict(): string {
    return this.GapVerdict;
  }

  // ── Feature Importance & Leakage Gate ──

  public get Importance(): PSFeatureBar[] {
    if (!this.Model) return [];
    return ParseFeatureImportance(this.Model.FeatureImportance, 6).map((b) => ({
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

  public get LeakageFlagged(): boolean {
    if (!this.Model) return false;
    const max = MaxFeatureImportance(this.Model.FeatureImportance);
    return max != null && max >= PS_FEATURE_DOMINANCE_THRESHOLD;
  }

  /** @deprecated Use {@link LeakageFlagged}. */
  public get leakageFlagged(): boolean {
    return this.LeakageFlagged;
  }

  // ── Actions & Promotion Flow ──

  public get CanValidate(): boolean {
    return this.Model?.Status === 'Draft';
  }

  /** @deprecated Use {@link CanValidate}. */
  public get canValidate(): boolean {
    return this.CanValidate;
  }

  public get CanPublish(): boolean {
    return this.Model?.Status === 'Validated';
  }

  /** @deprecated Use {@link CanPublish}. */
  public get canPublish(): boolean {
    return this.CanPublish;
  }

  public get CanArchive(): boolean {
    return this.Model?.Status === 'Published' || this.Model?.Status === 'Validated';
  }

  /** @deprecated Use {@link CanArchive}. */
  public get canArchive(): boolean {
    return this.CanArchive;
  }

  public get ActionHint(): string {
    switch (this.Model?.Status) {
      case 'Draft':
        return 'Verify metrics and feature importance before validating or publishing.';
      case 'Validated':
        return 'Validated and sign-off clear. Ready to promote to production serving.';
      case 'Published':
        return 'Active in production serving. Archiving will detach live predictions.';
      case 'Archived':
        return 'Archived snapshot. Preserved for governance and historical auditing.';
      default:
        return '';
    }
  }

  /** @deprecated Use {@link ActionHint}. */
  public get actionHint(): string {
    return this.ActionHint;
  }

  public RequestPromote(targetStatus: PredictiveStudioModelTargetStatus): void {
    if (!this.Model) return;
    this.PendingReason = '';
    this.Pending = {
      modelId: this.Model.ID,
      modelName: `${this.ModelDisplayName} v${this.Model.Version}`,
      targetStatus,
      leakageFlagged: this.LeakageFlagged && targetStatus !== 'Archived',
    };
    this.cdr.markForCheck();
  }

  /** @deprecated Use {@link RequestPromote}. */
  public requestPromote(targetStatus: PredictiveStudioModelTargetStatus): void {
    return this.RequestPromote(targetStatus);
  }

  public CancelPromote(): void {
    if (this.Busy) return;
    this.Pending = null;
    this.PendingReason = '';
    this.cdr.markForCheck();
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
    const name = this.escapeHtml(this.Pending.modelName);
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

  public async ConfirmPromote(reason: string): Promise<void> {
    if (!this.Pending || this.Busy || !this.Model) return;
    this.Busy = true;
    this.cdr.markForCheck();

    const { modelId, modelName, targetStatus, leakageFlagged } = this.Pending;

    try {
      const op = new PredictiveStudioPromoteModelOperation();
      const result = await op.Execute(
        {
          modelId,
          targetStatus,
          signOff: leakageFlagged ? true : undefined,
          reason: reason || undefined,
        },
        { provider: this.Provider ?? undefined, user: this.CurrentUser ?? undefined },
      );

      if (result.Success && result.Output?.promoted) {
        const newStatus = result.Output.status;
        this.Model.Status = newStatus as 'Draft' | 'Validated' | 'Published' | 'Archived';
        this.notifications.CreateSimpleNotification(`${modelName} → ${newStatus}`, 'success', 3500);
        this.StatusChanged.emit({ modelId, newStatus });
        this.Pending = null;
        this.PendingReason = '';
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
      this.cdr.markForCheck();
    }
  }

  /** @deprecated Use {@link ConfirmPromote}. */
  public async confirmPromote(reason: string): Promise<void> {
    return this.ConfirmPromote(reason);
  }

  private escapeHtml(value: string): string {
    return value
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }
}
