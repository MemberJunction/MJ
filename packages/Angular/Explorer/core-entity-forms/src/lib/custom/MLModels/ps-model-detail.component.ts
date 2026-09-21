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
  formatMetricValue,
  humanizeFeatureName,
  maxFeatureImportance,
  metricsToDisplay,
  overfitGap,
  parseFeatureImportance,
  parseMetrics,
  primaryModelScore,
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
  @Input() model: MJMLModelEntity | null = null;
  @Input() provider: IMetadataProvider | null = null;
  @Input() currentUser: UserInfo | null = null;
  @Input() showActions = true;

  @Output() statusChanged = new EventEmitter<{ modelId: string; newStatus: string }>();

  private readonly cdr = inject(ChangeDetectorRef);
  private readonly notifications = inject(MJNotificationService);

  public readonly lifecycleSteps = ['Draft', 'Validated', 'Published', 'Archived'] as const;
  public readonly dominanceThreshold = PS_FEATURE_DOMINANCE_THRESHOLD.toFixed(2);

  public pending: PendingPromotion | null = null;
  public pendingReason = '';
  public busy = false;

  @Input() displayName?: string;

  public get modelDisplayName(): string {
    if (this.displayName) return this.displayName;
    if (!this.model) return '';
    return this.model.Pipeline || (this.model.Algorithm ? `${this.model.Algorithm} Model` : 'ML Model');
  }

  // ── Badges & Lifecycle Stepper ──

  public statusBadgeClass(status: string | null | undefined): string {
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

  public stepState(step: string): 'done' | 'curr' | 'todo' {
    const order = ['Draft', 'Validated', 'Published', 'Archived'];
    const currIdx = order.indexOf(this.model?.Status ?? 'Draft');
    const stepIdx = order.indexOf(step);
    if (stepIdx < currIdx) return 'done';
    if (stepIdx === currIdx) return 'curr';
    return 'todo';
  }

  public get targetSuffix(): string {
    const target = this.model?.TargetVariable;
    return target ? ` · predicts ${target}` : '';
  }

  // ── Metrics & Performance Derivations ──

  public get primaryScoreLabel(): string {
    if (!this.model) return 'Score';
    const score = primaryModelScore(this.model);
    return score?.label ?? 'AUC';
  }

  public get trainPrimaryScore(): string {
    if (!this.model) return '—';
    const score = primaryModelScore(this.model);
    const trainMetrics = parseMetrics(this.model.Metrics);
    if (score && trainMetrics[score.key] != null) {
      return formatMetricValue(score.key, trainMetrics[score.key]!);
    }
    return trainMetrics.AUC != null ? trainMetrics.AUC.toFixed(3) : '—';
  }

  public get holdoutPrimaryScore(): string {
    if (!this.model) return '—';
    const score = primaryModelScore(this.model);
    const holdoutMetrics = parseMetrics(this.model.HoldoutMetrics);
    if (score && holdoutMetrics[score.key] != null) {
      return formatMetricValue(score.key, holdoutMetrics[score.key]!);
    }
    return holdoutMetrics.AUC != null ? holdoutMetrics.AUC.toFixed(3) : '—';
  }

  public get secondaryMetrics(): PSMetricDisplay[] {
    if (!this.model) return [];
    const score = primaryModelScore(this.model);
    const primaryKey = score?.key;
    const holdout = metricsToDisplay(parseMetrics(this.model.HoldoutMetrics), { excludeAuc: false });
    const all = holdout.length > 0 ? holdout : metricsToDisplay(parseMetrics(this.model.Metrics), { excludeAuc: false });
    return primaryKey ? all.filter((m) => m.key !== primaryKey) : all.filter((m) => m.key !== 'AUC');
  }

  public get gapText(): string {
    if (!this.model) return '';
    const gap = overfitGap(this.model);
    return gap == null ? '' : Math.abs(gap).toFixed(3);
  }

  public get gapVerdict(): string {
    if (!this.model) return '';
    const gap = overfitGap(this.model);
    if (gap == null) return '';
    return gap > 0.1 ? 'is wide — watch for overfitting' : 'is within tolerance — no overfitting flag';
  }

  // ── Feature Importance & Leakage Gate ──

  public get importance(): PSFeatureBar[] {
    if (!this.model) return [];
    return parseFeatureImportance(this.model.FeatureImportance, 6).map((b) => ({
      ...b,
      name: humanizeFeatureName(b.name),
    }));
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

  public get leakageFlagged(): boolean {
    if (!this.model) return false;
    const max = maxFeatureImportance(this.model.FeatureImportance);
    return max != null && max >= PS_FEATURE_DOMINANCE_THRESHOLD;
  }

  // ── Actions & Promotion Flow ──

  public get canValidate(): boolean {
    return this.model?.Status === 'Draft';
  }

  public get canPublish(): boolean {
    return this.model?.Status === 'Validated';
  }

  public get canArchive(): boolean {
    return this.model?.Status === 'Published' || this.model?.Status === 'Validated';
  }

  public get actionHint(): string {
    switch (this.model?.Status) {
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

  public requestPromote(targetStatus: PredictiveStudioModelTargetStatus): void {
    if (!this.model) return;
    this.pendingReason = '';
    this.pending = {
      modelId: this.model.ID,
      modelName: `${this.modelDisplayName} v${this.model.Version}`,
      targetStatus,
      leakageFlagged: this.leakageFlagged && targetStatus !== 'Archived',
    };
    this.cdr.markForCheck();
  }

  public cancelPromote(): void {
    if (this.busy) return;
    this.pending = null;
    this.pendingReason = '';
    this.cdr.markForCheck();
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
    const name = this.escapeHtml(this.pending.modelName);
    if (this.pending.targetStatus === 'Archived') {
      return `Archive <strong>${name}</strong>? This detaches any active scoring bindings and removes it from production scoring. The model artifact remains immutable and recoverable.`;
    }
    if (this.pending.leakageFlagged) {
      return `<strong>${name}</strong> is flagged for possible target leakage. Publishing requires an explicit sign-off — confirm you understand the risk and provide a reason below.`;
    }
    return `Promote <strong>${name}</strong> to <strong>${this.pending.targetStatus}</strong>? This changes only the lifecycle state — the trained weights never change.`;
  }

  public async confirmPromote(reason: string): Promise<void> {
    if (!this.pending || this.busy || !this.model) return;
    this.busy = true;
    this.cdr.markForCheck();

    const { modelId, modelName, targetStatus, leakageFlagged } = this.pending;

    try {
      const op = new PredictiveStudioPromoteModelOperation();
      const result = await op.Execute(
        {
          modelId,
          targetStatus,
          signOff: leakageFlagged ? true : undefined,
          reason: reason || undefined,
        },
        { provider: this.provider ?? undefined, user: this.currentUser ?? undefined },
      );

      if (result.Success && result.Output?.promoted) {
        const newStatus = result.Output.status;
        this.model.Status = newStatus as 'Draft' | 'Validated' | 'Published' | 'Archived';
        this.notifications.CreateSimpleNotification(`${modelName} → ${newStatus}`, 'success', 3500);
        this.statusChanged.emit({ modelId, newStatus });
        this.pending = null;
        this.pendingReason = '';
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
