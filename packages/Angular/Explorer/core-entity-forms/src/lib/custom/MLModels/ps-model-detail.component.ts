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
import { ImportanceDisplay } from '@memberjunction/predictive-studio-core';

import {
  PSFeatureBar,
  PSMetricDisplay,
  PS_FEATURE_DOMINANCE_THRESHOLD,
  FormatMetricValue,
  HumanizeFeatureName,
  MaxFeatureImportance,
  MetricsToDisplay,
  ModelImportanceView,
  OverfitGap,
  ParseFeatureImportance,
  ParseMetrics,
  PrimaryModelScore,
  TrainScoreIsInnerCv,
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
 *   - Train (inner-CV estimate, or in-sample for older models) vs out-of-sample holdout performance cards and overfit gap check
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

  @Input() Provider: IMetadataProvider | null = null;

  @Input() CurrentUser: UserInfo | null = null;

  @Input() ShowActions = true;

  @Output() StatusChanged = new EventEmitter<{ modelId: string; newStatus: string }>();

  private readonly cdr = inject(ChangeDetectorRef);
  private readonly notifications = inject(MJNotificationService);

  public readonly LifecycleSteps = ['Draft', 'Validated', 'Published', 'Archived'] as const;

  public readonly DominanceThreshold = PS_FEATURE_DOMINANCE_THRESHOLD.toFixed(2);

  public Pending: PendingPromotion | null = null;

  public PendingReason = '';

  public Busy = false;

  @Input() displayName?: string;

  public get ModelDisplayName(): string {
    if (this.displayName) return this.displayName;
    if (!this.Model) return '';
    return this.Model.Pipeline || (this.Model.Algorithm ? `${this.Model.Algorithm} Model` : 'ML Model');
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

  public StepState(step: string): 'done' | 'curr' | 'todo' {
    const order = ['Draft', 'Validated', 'Published', 'Archived'];
    const currIdx = order.indexOf(this.Model?.Status ?? 'Draft');
    const stepIdx = order.indexOf(step);
    if (stepIdx < currIdx) return 'done';
    if (stepIdx === currIdx) return 'curr';
    return 'todo';
  }

  public get TargetSuffix(): string {
    const target = this.Model?.TargetVariable;
    return target ? ` · predicts ${target}` : '';
  }

  // ── Metrics & Performance Derivations ──

  public get PrimaryScoreLabel(): string {
    if (!this.Model) return 'Score';
    const score = PrimaryModelScore(this.Model);
    return score?.label ?? 'Score';
  }

  /**
   * What the train tile's number is: for a model trained under an Evaluation Protocol, the inner cross-validation
   * estimate on the development rows; for an older model, its in-sample training score. Optimistic either way.
   */
  public get TrainScoreCaption(): string {
    return TrainScoreIsInnerCv(this.Model?.Lineage) ? 'inner-CV estimate • optimistic' : 'in-sample • optimistic';
  }

  public get TrainPrimaryScore(): string {
    if (!this.Model) return '—';
    const score = PrimaryModelScore(this.Model);
    const trainMetrics = ParseMetrics(this.Model.Metrics);
    if (score && trainMetrics[score.key] != null) {
      return FormatMetricValue(score.key, trainMetrics[score.key]!);
    }
    // No value of the primary metric: say so, never another metric's number under the primary metric's title.
    return '—';
  }

  public get HoldoutPrimaryScore(): string {
    if (!this.Model) return '—';
    const score = PrimaryModelScore(this.Model);
    const holdoutMetrics = ParseMetrics(this.Model.HoldoutMetrics);
    if (score && holdoutMetrics[score.key] != null) {
      return FormatMetricValue(score.key, holdoutMetrics[score.key]!);
    }
    // No value of the primary metric: say so, never another metric's number under the primary metric's title.
    return '—';
  }

  public get SecondaryMetrics(): PSMetricDisplay[] {
    if (!this.Model) return [];
    const score = PrimaryModelScore(this.Model);
    const primaryKey = score?.key;
    // holdout only: the bar sits under the "Holdout = held-out test fold" heading with unqualified labels
    const holdout = MetricsToDisplay(ParseMetrics(this.Model.HoldoutMetrics), { excludeAuc: false });
    return primaryKey ? holdout.filter((m) => m.key !== primaryKey) : holdout.filter((m) => m.key !== 'AUC');
  }

  public get GapText(): string {
    if (!this.Model) return '';
    const gap = OverfitGap(this.Model);
    return gap == null ? '' : Math.abs(gap).toFixed(3);
  }

  public get GapVerdict(): string {
    if (!this.Model) return '';
    const gap = OverfitGap(this.Model);
    if (gap == null) return '';
    return gap > 0.1 ? 'is wide — watch for overfitting' : 'is within tolerance — no overfitting flag';
  }

  // ── Feature Importance & Leakage Gate ──

  /** Cached parsed and displayed importance bars for the last (Lineage JSON, importance JSON) pair. */
  private importanceCache: { key: string; allBars: PSFeatureBar[]; displayedBars: PSFeatureBar[] } | null = null;

  private get cachedImportance(): { allBars: PSFeatureBar[]; displayedBars: PSFeatureBar[] } {
    if (!this.Model) return { allBars: [], displayedBars: [] };
    const key = `${this.Model.Lineage}\u0000${this.Model.FeatureImportance}`;
    if (this.importanceCache?.key !== key) {
      const allBars = ParseFeatureImportance(this.Model.FeatureImportance, 6).map((b) => ({
        ...b,
        name: HumanizeFeatureName(b.name),
      }));
      const displayedBars = ModelImportanceView.DisplayedFeatureImportance(this.Model.Lineage, this.Model.FeatureImportance, 6).map((b) => ({
        ...b,
        name: HumanizeFeatureName(b.name),
      }));
      this.importanceCache = { key, allBars, displayedBars };
    }
    return this.importanceCache;
  }

  public get Importance(): PSFeatureBar[] {
    return this.cachedImportance.allBars;
  }

  /**
   * The importance bars shown in the Feature Importance card (empty for split / impurity importance). Cached on the
   * Lineage JSON (which holds the stored importance kind) and the importance JSON, so the parse runs once per model and
   * again whenever either value changes
   * (coding standards §7: getters Angular bindings hit).
   */
  public get DisplayedImportance(): PSFeatureBar[] {
    return this.cachedImportance.displayedBars;
  }

  /** True when the model has importance data that is hidden because of its kind. */
  public get ImportanceHidden(): boolean {
    return this.Importance.length > 0 && this.DisplayedImportance.length === 0;
  }

  /** The note shown in place of hidden importance. */
  public readonly ImportanceHiddenNote = ImportanceDisplay.HiddenNote;

  /** The Feature Importance card's caption. The template hides it when {@link ImportanceHidden}, along with the bars. */
  public get ImportanceCaption(): string {
    const n = this.Importance.length;
    return n === 0 ? 'no data' : `normalized · top ${n}`;
  }

  public get TopFeatureName(): string {
    return this.Importance[0]?.name ?? '—';
  }

  public get TopFeatureValue(): string {
    return this.Importance[0]?.value ?? '—';
  }

  public get LeakageFlagged(): boolean {
    if (!this.Model) return false;
    const max = MaxFeatureImportance(this.Model.FeatureImportance);
    return max != null && max >= PS_FEATURE_DOMINANCE_THRESHOLD;
  }

  // ── Actions & Promotion Flow ──

  public get CanValidate(): boolean {
    return this.Model?.Status === 'Draft';
  }

  public get CanPublish(): boolean {
    return this.Model?.Status === 'Validated';
  }

  public get CanArchive(): boolean {
    return this.Model?.Status === 'Published' || this.Model?.Status === 'Validated';
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

  public CancelPromote(): void {
    if (this.Busy) return;
    this.Pending = null;
    this.PendingReason = '';
    this.cdr.markForCheck();
  }

  public get PendingTitle(): string {
    if (!this.Pending) return '';
    return this.Pending.targetStatus === 'Archived' ? 'Archive model' : `Promote to ${this.Pending.targetStatus}`;
  }

  public get PendingIcon(): string {
    if (!this.Pending) return 'fa-solid fa-check';
    return this.Pending.targetStatus === 'Archived' ? 'fa-solid fa-box-archive' : 'fa-solid fa-arrow-up';
  }

  public get PendingConfirmLabel(): string {
    if (!this.Pending) return 'Confirm';
    return this.Pending.targetStatus === 'Archived' ? 'Archive' : `Promote to ${this.Pending.targetStatus}`;
  }

  public get PendingVariant(): 'info' | 'warn' | 'danger' {
    if (!this.Pending) return 'info';
    if (this.Pending.targetStatus === 'Archived') return 'warn';
    return this.Pending.leakageFlagged ? 'warn' : 'info';
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

  private escapeHtml(value: string): string {
    return value
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }
}
