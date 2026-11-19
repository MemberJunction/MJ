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
  PredictiveStudioModelTransition,
} from '@memberjunction/core-entities';
import { ImportanceDisplay, StatusWriteRules, TransitionRefusalText } from '@memberjunction/predictive-studio-core';

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
import { PSLifecycleChipComponent } from './ps-lifecycle-chip.component';
import { PSPublishHistoryComponent } from './ps-publish-history.component';
import { PSSignOffPanelComponent } from './ps-sign-off-panel.component';
import { PSScoringRunsComponent } from './ps-scoring-runs.component';
import { PSModelMonitoringComponent } from './ps-model-monitoring.component';
import { PSOutputBindingsEditorComponent } from './ps-output-bindings-editor.component';
import type { PSOpenRecordRequest } from './ps-model-detail-events';

/** The transitions the detail's action bar offers; a publish goes through the sign-off panel (D4-49). */
type DetailTransition = Exclude<PredictiveStudioModelTransition, 'publish'>;

/** A pending lifecycle transition awaiting user confirmation. */
interface PendingTransition {
  ModelID: string;
  ModelName: string;
  Transition: DetailTransition;
}

/** The detail's tabs. */
export type PSModelDetailTab = 'overview' | 'history' | 'scoring' | 'monitoring' | 'bindings';

/** Each tab's key and label, in the order shown. */
const DETAIL_TABS: readonly { readonly Key: PSModelDetailTab; readonly Label: string }[] = [
  { Key: 'overview', Label: 'Overview' },
  { Key: 'history', Label: 'Publish history' },
  { Key: 'scoring', Label: 'Scoring runs' },
  { Key: 'monitoring', Label: 'Monitoring' },
  { Key: 'bindings', Label: 'Output bindings' },
];

/** How each lifecycle transition is offered: its button, its confirm dialog, and whether it needs a reason. */
interface TransitionPresentation {
  readonly Label: string;
  readonly Icon: string;
  readonly TestID: string;
  readonly Primary: boolean;
  readonly ReasonRequired: boolean;
}

const TRANSITION_PRESENTATION: Readonly<Record<DetailTransition, TransitionPresentation>> = {
  evaluate: { Label: 'Evaluate', Icon: 'fa-solid fa-circle-check', TestID: 'ps-registry-validate', Primary: false, ReasonRequired: false },
  archive: { Label: 'Archive', Icon: 'fa-solid fa-box-archive', TestID: 'ps-registry-archive', Primary: false, ReasonRequired: true },
  rollback: { Label: 'Roll back to this model', Icon: 'fa-solid fa-clock-rotate-left', TestID: 'ps-registry-rollback', Primary: false, ReasonRequired: true },
};

/** The transitions in the order the action bar offers them. */
const TRANSITION_ORDER: readonly DetailTransition[] = ['evaluate', 'rollback', 'archive'];

/**
 * **PSModelDetailComponent** — Unified enterprise component for inspecting, evaluating,
 * and promoting versioned ML Models. Shared between:
 *   1. **Predictive Studio Model Registry** (`PSRegistryComponent`)
 *   2. **Custom Entity Form for `MJ: ML Models`** (`MLModelFormComponentExtended`)
 *
 * Renders:
 *   - Identity, immutable snapshot badge and the lifecycle chip (`KeepBaseline`, `Unevaluated` serving or not, with the
 *     stored `StatusReason`)
 *   - Progressive 4-stage lifecycle stepper (Draft → Validated → Published → Archived)
 *   - Train (inner-CV estimate, or in-sample for older models) vs out-of-sample holdout performance cards and overfit gap check
 *   - Key feature importance rankings with single-feature dominance warnings
 *   - Target leakage gate verification
 *   - The lifecycle transitions the §5.1 table allows from the model's status (evaluate, archive, rollback), each
 *     applied by the lifecycle gate through the `PredictiveStudio.PromoteModel` Remote Operation; a publish goes through
 *     the optional publish and sign-off flow ({@link PSSignOffPanelComponent}) on the stored evidence
 *   - Tabs for the publish history, the scoring runs, the monitoring periods and the output-bindings label editor
 *
 * Never routes: a record a tab links to is the {@link OpenRecord} request, which the host turns into navigation.
 */
@Component({
  standalone: true,
  selector: 'ps-model-detail',
  templateUrl: './ps-model-detail.component.html',
  styleUrls: ['./ps-model-detail.component.css'],
  imports: [
    CommonModule,
    FormsModule,
    MJButtonDirective,
    PSLifecycleChipComponent,
    PSPublishHistoryComponent,
    PSSignOffPanelComponent,
    PSScoringRunsComponent,
    PSModelMonitoringComponent,
    PSOutputBindingsEditorComponent,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class PSModelDetailComponent {
  @Input() Model: MJMLModelEntity | null = null;

  @Input() Provider: IMetadataProvider | null = null;

  @Input() CurrentUser: UserInfo | null = null;

  @Input() ShowActions = true;

  @Output() StatusChanged = new EventEmitter<{ modelId: string; newStatus: string }>();

  /** A request to open a record a tab links to (an initiator, a publish record); the host navigates. */
  @Output() OpenRecord = new EventEmitter<PSOpenRecordRequest>();

  /** The tabs, in the order shown. */
  public readonly Tabs = DETAIL_TABS;

  /** The tab shown; the other tabs are not rendered, so each loads its rows only when opened. */
  public ActiveTab: PSModelDetailTab = 'overview';

  private readonly cdr = inject(ChangeDetectorRef);
  private readonly notifications = inject(MJNotificationService);

  public readonly LifecycleSteps = ['Draft', 'Validated', 'Published', 'Archived'] as const;

  public readonly DominanceThreshold = PS_FEATURE_DOMINANCE_THRESHOLD.toFixed(2);

  public Pending: PendingTransition | null = null;

  public PendingReason = '';

  public Busy = false;

  @Input() displayName?: string;

  public get ModelDisplayName(): string {
    if (this.displayName) return this.displayName;
    if (!this.Model) return '';
    return this.Model.Pipeline || (this.Model.Algorithm ? `${this.Model.Algorithm} Model` : 'ML Model');
  }

  // ── Badges & Lifecycle Stepper ──

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

  // ── Lifecycle transitions ──

  /** The transitions the §5.1 lifecycle table allows from the model's status, in the order the action bar offers them. */
  public get AvailableTransitions(): DetailTransition[] {
    const status = this.Model?.Status;
    if (!status) return [];
    return TRANSITION_ORDER.filter((t) => PSModelDetailComponent.IsAllowedFrom(status, t));
  }

  /** True when the lifecycle table has the row `transition` asks for from `status` (rollback is Archived → Published). */
  public static IsAllowedFrom(status: MJMLModelEntity['Status'], transition: PredictiveStudioModelTransition): boolean {
    switch (transition) {
      case 'evaluate':
        return StatusWriteRules.IsAuthorisedTransition(status, 'Validated') || StatusWriteRules.IsAuthorisedTransition(status, 'KeepBaseline');
      case 'publish':
        return status !== 'Archived' && StatusWriteRules.IsAuthorisedTransition(status, 'Published');
      case 'rollback':
        return status === 'Archived' && StatusWriteRules.IsAuthorisedTransition(status, 'Published');
      case 'archive':
        return StatusWriteRules.IsAuthorisedTransition(status, 'Archived');
      default:
        return false;
    }
  }

  /** True when the action bar offers `transition` for the model's status (one of {@link AvailableTransitions}). */
  public Offers(transition: DetailTransition): boolean {
    return this.AvailableTransitions.includes(transition);
  }

  /** How `transition` is offered (label, icon, test id). */
  public Presentation(transition: DetailTransition): TransitionPresentation {
    return TRANSITION_PRESENTATION[transition];
  }

  /** True when the publish and sign-off panel is shown: actions are on and the lifecycle table allows a publish. */
  public get ShowsSignOff(): boolean {
    return this.ShowActions && !!this.Model && PSModelDetailComponent.IsAllowedFrom(this.Model.Status, 'publish');
  }

  /** Shows tab `tab`. */
  public SelectTab(tab: PSModelDetailTab): void {
    this.ActiveTab = tab;
    this.cdr.markForCheck();
  }

  /** Forwards a tab's request to open a record to the host. */
  public OnOpenRecord(request: PSOpenRecordRequest): void {
    this.OpenRecord.emit(request);
  }

  /** Forwards the monitoring tab's request to open a publish record to the host. */
  public OnOpenPublishRecord(recordId: string): void {
    this.OpenRecord.emit({ EntityName: 'MJ: ML Model Publish Records', RecordID: recordId });
  }

  /** After the sign-off panel's applied publish: re-reads the model and tells the host the status the gate wrote. */
  public async OnPublished(status: MJMLModelEntity['Status']): Promise<void> {
    if (!this.Model) return;
    const name = `${this.ModelDisplayName} v${this.Model.Version}`;
    await this.reloadModel();
    this.notifications.CreateSimpleNotification(`${name} → ${status}`, 'success', 3500);
    this.StatusChanged.emit({ modelId: this.Model.ID, newStatus: this.Model.Status });
    this.cdr.markForCheck();
  }

  public get ActionHint(): string {
    switch (this.Model?.Status) {
      case 'Draft':
        return 'Evaluate records the training run\'s stored gate decision; it moves the model to Validated or KeepBaseline.';
      case 'Validated':
      case 'KeepBaseline':
        return 'Publish from the panel above: the lifecycle gate re-checks the stored evidence; a flagged model needs a sign-off.';
      case 'Published':
        return 'Active in production serving. Archiving will detach live predictions.';
      case 'Archived':
        return 'Archived snapshot. A model published before can be rolled back to, with a reason.';
      default:
        return '';
    }
  }

  /** Opens the confirm dialog for `transition`. */
  public RequestTransition(transition: DetailTransition): void {
    if (!this.Model) return;
    this.PendingReason = '';
    this.Pending = { ModelID: this.Model.ID, ModelName: `${this.ModelDisplayName} v${this.Model.Version}`, Transition: transition };
    this.cdr.markForCheck();
  }

  public CancelTransition(): void {
    if (this.Busy) return;
    this.Pending = null;
    this.PendingReason = '';
    this.cdr.markForCheck();
  }

  public get PendingPresentation(): TransitionPresentation | null {
    return this.Pending ? TRANSITION_PRESENTATION[this.Pending.Transition] : null;
  }

  public get PendingVariant(): 'info' | 'warn' | 'danger' {
    if (!this.Pending) return 'info';
    return this.Pending.Transition === 'archive' || this.Pending.Transition === 'rollback' ? 'warn' : 'info';
  }

  public get PendingMessage(): string {
    if (!this.Pending) return '';
    const name = this.escapeHtml(this.Pending.ModelName);
    switch (this.Pending.Transition) {
      case 'evaluate':
        return `Evaluate <strong>${name}</strong>? Its training run's stored gate decision moves it to Validated or KeepBaseline.`;
      case 'archive':
        return `Archive <strong>${name}</strong>? This removes it from production scoring. The model artifact remains immutable and recoverable.`;
      case 'rollback':
        return `Roll back to <strong>${name}</strong>? It is published again and the current model is archived.`;
      default:
        return '';
    }
  }

  /** True when the confirm button may be pressed: not busy, and a reason given when the transition needs one. */
  public get CanConfirm(): boolean {
    const presentation = this.PendingPresentation;
    return !this.Busy && presentation !== null && (!presentation.ReasonRequired || this.PendingReason.trim().length > 0);
  }

  /** Applies the pending transition through `PredictiveStudio.PromoteModel`, then reloads the model through its provider. */
  public async ConfirmTransition(reason: string): Promise<void> {
    if (!this.Pending || this.Busy || !this.Model) return;
    this.Busy = true;
    this.cdr.markForCheck();
    const { ModelID, ModelName, Transition } = this.Pending;
    try {
      const op = new PredictiveStudioPromoteModelOperation();
      const result = await op.Execute(
        { modelId: ModelID, transition: Transition, reason: reason || undefined },
        { provider: this.Provider ?? undefined, user: this.CurrentUser ?? undefined },
      );
      if (result.Success && result.Output?.applied) {
        await this.reloadModel();
        const newStatus = this.Model.Status;
        this.notifications.CreateSimpleNotification(`${ModelName} → ${newStatus}`, 'success', 3500);
        this.StatusChanged.emit({ modelId: ModelID, newStatus });
        this.Pending = null;
        this.PendingReason = '';
      } else if (result.Success && result.Output) {
        const refusal = result.Output.refusal ? TransitionRefusalText.For(result.Output.refusal) : 'The lifecycle gate refused it.';
        this.notifications.CreateSimpleNotification(`${ModelName} stays ${result.Output.status}: ${refusal}`, 'error', 6000);
      } else {
        this.notifications.CreateSimpleNotification(result.ErrorMessage || `Could not ${Transition} ${ModelName}.`, 'error', 5000);
      }
    } catch (e) {
      this.notifications.CreateSimpleNotification(`The ${Transition} failed: ${e instanceof Error ? e.message : String(e)}`, 'error', 5000);
    } finally {
      this.Busy = false;
      this.cdr.markForCheck();
    }
  }

  /** Re-reads the model row through its own provider, so the form shows the status the gate wrote (never set locally). */
  private async reloadModel(): Promise<void> {
    if (!this.Model) return;
    if (!(await this.Model.Load(this.Model.ID))) {
      this.notifications.CreateSimpleNotification(`The model was updated but could not be re-read: ${this.Model.LatestResult?.CompleteMessage || 'unknown error'}`, 'warning', 5000);
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
