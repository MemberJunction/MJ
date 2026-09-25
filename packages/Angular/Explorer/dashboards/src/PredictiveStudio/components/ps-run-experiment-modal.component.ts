import {
  ChangeDetectorRef,
  Component,
  EventEmitter,
  Input,
  OnInit,
  Output,
  ViewEncapsulation,
  inject,
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { MJButtonDirective } from '@memberjunction/ng-ui-components';
import { MJNotificationService } from '@memberjunction/ng-notifications';
import { UUIDsEqual } from '@memberjunction/global';
import { IMetadataProvider, UserInfo } from '@memberjunction/core';
import {
  MJMLAlgorithmEntity,
  MJMLTrainingPipelineEntity,
  PredictiveStudioStartExperimentSessionOperation,
} from '@memberjunction/core-entities';
import {
  DOMINANCE_THRESHOLD_DEFAULT,
  type SourceBinding,
  type FeatureStepGraph,
  type LeakageGuard,
  type AsOfStrategy,
  type ValidationStrategy,
  type ModelingPlanSpec,
  type Budget,
} from '@memberjunction/predictive-studio-core';
import { PredictiveStudioEngine } from '../engine/predictive-studio.engine';

const ALGO_ICONS: Record<string, string> = {
  xgboost: 'fa-solid fa-bolt',
  lightgbm: 'fa-solid fa-feather',
  logistic_regression: 'fa-solid fa-wave-square',
  random_forest: 'fa-solid fa-tree',
  ridge: 'fa-solid fa-ruler',
  linear_regression: 'fa-solid fa-ruler',
  mlp: 'fa-solid fa-network-wired',
};

/**
 * Manual Experiment Runner modal — lets data scientists configure and launch a
 * multi-algorithm tournament session on an existing training pipeline.
 */
@Component({
  standalone: true,
  selector: 'ps-run-experiment-modal',
  imports: [CommonModule, FormsModule, MJButtonDirective],
  encapsulation: ViewEncapsulation.None,
  styleUrls: ['../predictive-studio.shared.css', './ps-run-experiment-modal.component.css'],
  template: `
    <div class="ps-modal-backdrop" (click)="onBackdropClick($event)">
      <div class="ps-modal-dialog ps-run-exp-dialog" role="dialog" aria-modal="true" data-testid="ps-run-experiment-modal">
        <!-- Header -->
        <div class="ps-wizard-header">
          <div class="ps-wizard-header-title">
            <i class="fa-solid fa-flask" style="color: var(--mj-brand-primary)"></i>
            <div>
              <h2>Run Multi-Algorithm Experiment</h2>
              <span class="ps-wizard-subtitle">Execute a tournament search across multiple algorithms under bounded budget</span>
            </div>
          </div>
          <button class="ps-wizard-close" (click)="cancel()" aria-label="Close dialog">
            <i class="fa-solid fa-xmark"></i>
          </button>
        </div>

        <!-- Body -->
        <div class="ps-run-exp-body">
          <!-- Step 1: Select Pipeline -->
          <div class="ps-form-group">
            <label class="ps-form-label">
              <i class="fa-solid fa-diagram-project"></i> Training Pipeline
            </label>
            <select class="mj-input" [ngModel]="selectedPipelineId" (ngModelChange)="onPipelineChange($event)" [disabled]="busy">
              @for (p of engine.Pipelines; track p.ID) {
                <option [value]="p.ID">{{ p.Name }} (Target: {{ p.TargetVariable || 'None' }})</option>
              }
            </select>
            <span class="ps-form-hint">
              The dataset, feature assembly graph, and leakage deny-list are derived from this pipeline.
            </span>
          </div>

          <!-- Session Name & Goal -->
          <div class="exp-grid-2">
            <div class="ps-form-group">
              <label class="ps-form-label">Session Name</label>
              <input class="mj-input" type="text" [(ngModel)]="sessionName" placeholder="e.g. Churn Tournament Q3" [disabled]="busy" />
            </div>
            <div class="ps-form-group">
              <label class="ps-form-label">Evaluation Metric</label>
              <select class="mj-input" [(ngModel)]="successMetric" [disabled]="busy">
                @if (problemType === 'classification') {
                  <option value="AUC">ROC-AUC (Default)</option>
                  <option value="F1">F1 Score</option>
                  <option value="Accuracy">Accuracy</option>
                } @else {
                  <option value="RMSE">RMSE (Default)</option>
                  <option value="MAE">MAE</option>
                  <option value="R2">R-Squared</option>
                }
              </select>
            </div>
          </div>

          <div class="ps-form-group">
            <label class="ps-form-label">Experiment Goal</label>
            <input class="mj-input" type="text" [(ngModel)]="goal" placeholder="e.g. Find best algorithm on holdout split" [disabled]="busy" />
          </div>

          <!-- Step 2: Algorithm Candidates -->
          <div class="ps-form-group">
            <div class="algo-bar-actions">
              <label class="ps-form-label" style="margin-bottom:0">
                <i class="fa-solid fa-shapes"></i> Candidate Algorithms ({{ selectedAlgoIds.size }} selected)
              </label>
              <div style="display:flex; gap:8px">
                <button type="button" class="ps-link-btn" (click)="selectAllAlgos()" [disabled]="busy">Select All</button>
                <span class="ps-muted">·</span>
                <button type="button" class="ps-link-btn" (click)="selectRecommendedAlgos()" [disabled]="busy">Recommended</button>
                <span class="ps-muted">·</span>
                <button type="button" class="ps-link-btn" (click)="clearAlgos()" [disabled]="busy">Clear</button>
              </div>
            </div>

            <div class="algo-selection-grid">
              @for (algo of availableAlgorithms; track algo.ID) {
                <div class="algo-select-card"
                  [class.selected]="isAlgoSelected(algo.ID)"
                  (click)="toggleAlgo(algo.ID)">
                  <input type="checkbox"
                    [checked]="isAlgoSelected(algo.ID)"
                    (click)="$event.stopPropagation()"
                    (change)="toggleAlgo(algo.ID)"
                    [disabled]="busy" />
                  <div class="algo-select-info">
                    <div class="algo-select-name">
                      <i [class]="getAlgoIcon(algo.DriverClass)"></i>
                      <span>{{ algo.Name }}</span>
                    </div>
                    @if (algo.Description) {
                      <div class="algo-select-desc">{{ algo.Description }}</div>
                    }
                    <div class="algo-select-tags">
                      @if (algo.SupportsFeatureImportance) {
                        <span class="ps-badge green" style="font-size:10px">Importance</span>
                      }
                      <span class="ps-tag" style="font-size:10px">{{ algo.DriverClass }}</span>
                    </div>
                  </div>
                </div>
              }
            </div>
          </div>

          <!-- Step 3: Validation & Budget -->
          <div class="exp-grid-3">
            <div class="ps-form-group">
              <label class="ps-form-label">Max Iterations (Trials)</label>
              <input class="mj-input" type="number" min="1" max="100" [(ngModel)]="budgetRuns" [disabled]="busy" />
              <span class="ps-form-hint">Total model training runs bounded</span>
            </div>
            <div class="ps-form-group">
              <label class="ps-form-label">Compute Cost Cap ($)</label>
              <input class="mj-input" type="number" min="1" max="500" [(ngModel)]="budgetCost" [disabled]="busy" />
              <span class="ps-form-hint">Max spending for cloud / GPU compute</span>
            </div>
            <div class="ps-form-group">
              <label class="ps-form-label">Wall-Clock Cap (Minutes)</label>
              <input class="mj-input" type="number" min="5" max="300" [(ngModel)]="budgetMinutes" [disabled]="busy" />
              <span class="ps-form-hint">Session timeouts if exceeded</span>
            </div>
          </div>

          <div class="budget-banner">
            <i class="fa-solid fa-shield-halved"></i>
            <div style="font-size: 12px; color: var(--mj-text-secondary)">
              <strong>Autonomous Guardrails:</strong> The session will run across waves, evaluate each candidate on a locked holdout fraction ({{ holdoutPercent }}%), rank them on the leaderboard by {{ successMetric }}, and automatically prune unpromising configurations.
            </div>
          </div>
        </div>

        <!-- Footer -->
        <div class="ps-wizard-footer">
          <button mjButton variant="secondary" size="md" (click)="cancel()" [disabled]="busy">
            Cancel
          </button>
          <span class="ps-spacer"></span>
          <button mjButton variant="primary" size="md" (click)="launch()" [disabled]="busy || !isValid">
            @if (busy) {
              <i class="fa-solid fa-spinner fa-spin"></i> Launching Experiment…
            } @else {
              <i class="fa-solid fa-play"></i> Launch Experiment
            }
          </button>
        </div>
      </div>
    </div>
  `,
})
export class PSRunExperimentModalComponent implements OnInit {
  @Input() engine!: PredictiveStudioEngine;
  @Input() provider: IMetadataProvider | null = null;
  @Input() CurrentUser: UserInfo | null = null;

  /** @deprecated Use {@link CurrentUser}. */
  @Input() set currentUser(value: UserInfo | null) {
    this.CurrentUser = value;
  }
  /** @deprecated Use {@link CurrentUser}. */
  get currentUser(): UserInfo | null {
    return this.CurrentUser;
  }
  @Input() PreselectedPipelineId?: string;

  /** @deprecated Use {@link PreselectedPipelineId}. */
  @Input() set preselectedPipelineId(value: string | undefined) {
    this.PreselectedPipelineId = value;
  }
  /** @deprecated Use {@link PreselectedPipelineId}. */
  get preselectedPipelineId(): string | undefined {
    return this.PreselectedPipelineId;
  }

  @Output() Closed = new EventEmitter<void>();

  /**
   * @deprecated Use {@link Closed}.
   *
   * The same emitter under the old binding name, so a template still binding
   * (closed) keeps working. Must stay AFTER Closed: class fields
   * initialise in order, and the other way round this captures undefined.
   */
  @Output() closed = this.Closed;
  @Output() Started = new EventEmitter<string>();

  /**
   * @deprecated Use {@link Started}.
   *
   * The same emitter under the old binding name, so a template still binding
   * (started) keeps working. Must stay AFTER Started: class fields
   * initialise in order, and the other way round this captures undefined.
   */
  @Output() started = this.Started;

  private cdr = inject(ChangeDetectorRef);
  private notifications = inject(MJNotificationService);

  public SelectedPipelineId = '';

  /** @deprecated Use {@link SelectedPipelineId}. */
  public get selectedPipelineId() {
    return this.SelectedPipelineId;
  }
  /** @deprecated Use {@link SelectedPipelineId}. */
  public set selectedPipelineId(value) {
    this.SelectedPipelineId = value;
  }
  public sessionName = '';
  public Goal = '';

  /** @deprecated Use {@link Goal}. */
  public get goal() {
    return this.Goal;
  }
  /** @deprecated Use {@link Goal}. */
  public set goal(value) {
    this.Goal = value;
  }
  public SuccessMetric: 'AUC' | 'F1' | 'Accuracy' | 'RMSE' | 'MAE' | 'R2' = 'AUC';

  /** @deprecated Use {@link SuccessMetric}. */
  public get successMetric(): 'AUC' | 'F1' | 'Accuracy' | 'RMSE' | 'MAE' | 'R2' {
    return this.SuccessMetric;
  }
  /** @deprecated Use {@link SuccessMetric}. */
  public set successMetric(value: 'AUC' | 'F1' | 'Accuracy' | 'RMSE' | 'MAE' | 'R2') {
    this.SuccessMetric = value;
  }
  public ProblemType: 'classification' | 'regression' = 'classification';

  /** @deprecated Use {@link ProblemType}. */
  public get problemType(): 'classification' | 'regression' {
    return this.ProblemType;
  }
  /** @deprecated Use {@link ProblemType}. */
  public set problemType(value: 'classification' | 'regression') {
    this.ProblemType = value;
  }

  public SelectedAlgoIds = new Set<string>();

  /** @deprecated Use {@link SelectedAlgoIds}. */
  public get selectedAlgoIds() {
    return this.SelectedAlgoIds;
  }
  /** @deprecated Use {@link SelectedAlgoIds}. */
  public set selectedAlgoIds(value) {
    this.SelectedAlgoIds = value;
  }

  public BudgetRuns = 15;

  /** @deprecated Use {@link BudgetRuns}. */
  public get budgetRuns() {
    return this.BudgetRuns;
  }
  /** @deprecated Use {@link BudgetRuns}. */
  public set budgetRuns(value) {
    this.BudgetRuns = value;
  }
  public BudgetCost = 25;

  /** @deprecated Use {@link BudgetCost}. */
  public get budgetCost() {
    return this.BudgetCost;
  }
  /** @deprecated Use {@link BudgetCost}. */
  public set budgetCost(value) {
    this.BudgetCost = value;
  }
  public BudgetMinutes = 30;

  /** @deprecated Use {@link BudgetMinutes}. */
  public get budgetMinutes() {
    return this.BudgetMinutes;
  }
  /** @deprecated Use {@link BudgetMinutes}. */
  public set budgetMinutes(value) {
    this.BudgetMinutes = value;
  }
  public HoldoutPercent = 15;

  /** @deprecated Use {@link HoldoutPercent}. */
  public get holdoutPercent() {
    return this.HoldoutPercent;
  }
  /** @deprecated Use {@link HoldoutPercent}. */
  public set holdoutPercent(value) {
    this.HoldoutPercent = value;
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

  ngOnInit(): void {
    const pipelines = this.engine?.Pipelines ?? [];
    if (this.PreselectedPipelineId && pipelines.some((p) => UUIDsEqual(p.ID, this.PreselectedPipelineId))) {
      this.SelectedPipelineId = this.PreselectedPipelineId;
    } else if (pipelines.length > 0) {
      this.SelectedPipelineId = pipelines[0].ID;
    }
    this.syncFromSelectedPipeline();
  }

  public get AvailableAlgorithms(): MJMLAlgorithmEntity[] {
    return this.engine?.Algorithms ?? [];
  }

  /** @deprecated Use {@link AvailableAlgorithms}. */
  public get availableAlgorithms(): MJMLAlgorithmEntity[] {
    return this.AvailableAlgorithms;
  }

  public get SelectedPipeline(): MJMLTrainingPipelineEntity | undefined {
    return this.engine?.Pipelines.find((p) => UUIDsEqual(p.ID, this.SelectedPipelineId));
  }

  /** @deprecated Use {@link SelectedPipeline}. */
  public get selectedPipeline(): MJMLTrainingPipelineEntity | undefined {
    return this.SelectedPipeline;
  }

  public OnPipelineChange(newId: string): void {
    this.SelectedPipelineId = newId;
    this.syncFromSelectedPipeline();
  }

  /** @deprecated Use {@link OnPipelineChange}. */
  public onPipelineChange(newId: string): void {
    return this.OnPipelineChange(newId);
  }

  private syncFromSelectedPipeline(): void {
    const p = this.SelectedPipeline;
    if (!p) return;
    this.ProblemType = (p.ProblemType as 'classification' | 'regression') || 'classification';
    this.SuccessMetric = this.ProblemType === 'classification' ? 'AUC' : 'RMSE';
    this.sessionName = `${p.Name} — Multi-Algorithm Tournament`;
    this.Goal = `Evaluate and compare algorithms on ${p.Name} to maximize ${this.SuccessMetric}.`;
    this.SelectRecommendedAlgos();
  }

  public SelectRecommendedAlgos(): void {
    this.SelectedAlgoIds.clear();
    const pt = this.ProblemType;
    for (const algo of this.AvailableAlgorithms) {
      const types = (algo.ProblemTypes || '').toLowerCase();
      if (types.includes(pt) || types.length === 0) {
        // Recommend gradient boosting and random forest by default
        const dc = (algo.DriverClass || '').toLowerCase();
        if (dc.includes('xgboost') || dc.includes('lightgbm') || dc.includes('forest') || dc.includes('logistic')) {
          this.SelectedAlgoIds.add(algo.ID);
        }
      }
    }
    if (this.SelectedAlgoIds.size === 0) {
      // Fallback: select first 3
      this.AvailableAlgorithms.slice(0, 3).forEach((a) => this.SelectedAlgoIds.add(a.ID));
    }
  }

  /** @deprecated Use {@link SelectRecommendedAlgos}. */
  public selectRecommendedAlgos(): void {
    return this.SelectRecommendedAlgos();
  }

  public SelectAllAlgos(): void {
    this.AvailableAlgorithms.forEach((a) => this.SelectedAlgoIds.add(a.ID));
  }

  /** @deprecated Use {@link SelectAllAlgos}. */
  public selectAllAlgos(): void {
    return this.SelectAllAlgos();
  }

  public ClearAlgos(): void {
    this.SelectedAlgoIds.clear();
  }

  /** @deprecated Use {@link ClearAlgos}. */
  public clearAlgos(): void {
    return this.ClearAlgos();
  }

  public IsAlgoSelected(id: string): boolean {
    return this.SelectedAlgoIds.has(id);
  }

  /** @deprecated Use {@link IsAlgoSelected}. */
  public isAlgoSelected(id: string): boolean {
    return this.IsAlgoSelected(id);
  }

  public ToggleAlgo(id: string): void {
    if (this.SelectedAlgoIds.has(id)) {
      this.SelectedAlgoIds.delete(id);
    } else {
      this.SelectedAlgoIds.add(id);
    }
  }

  /** @deprecated Use {@link ToggleAlgo}. */
  public toggleAlgo(id: string): void {
    return this.ToggleAlgo(id);
  }

  public GetAlgoIcon(driverClass: string): string {
    const key = (driverClass || '').toLowerCase();
    for (const [k, icon] of Object.entries(ALGO_ICONS)) {
      if (key.includes(k)) return icon;
    }
    return 'fa-solid fa-chart-line';
  }

  /** @deprecated Use {@link GetAlgoIcon}. */
  public getAlgoIcon(driverClass: string): string {
    return this.GetAlgoIcon(driverClass);
  }

  public get IsValid(): boolean {
    return Boolean(
      this.SelectedPipelineId &&
      this.sessionName.trim() &&
      this.SelectedAlgoIds.size > 0 &&
      this.BudgetRuns > 0 &&
      this.BudgetCost > 0
    );
  }

  /** @deprecated Use {@link IsValid}. */
  public get isValid(): boolean {
    return this.IsValid;
  }

  public cancel(): void {
    if (this.Busy) return;
    this.Closed.emit();
  }

  public OnBackdropClick(event: MouseEvent): void {
    if (event.target === event.currentTarget && !this.Busy) {
      this.cancel();
    }
  }

  /** @deprecated Use {@link OnBackdropClick}. */
  public onBackdropClick(event: MouseEvent): void {
    return this.OnBackdropClick(event);
  }

  public async Launch(): Promise<void> {
    const pipeline = this.SelectedPipeline;
    if (!pipeline || !this.IsValid || this.Busy) return;

    this.Busy = true;
    this.notifications.CreateSimpleNotification('Starting experiment session…', 'info', 3000);

    try {
      // Parse pipeline configuration
      const sources = this.parseJson<SourceBinding[]>(pipeline.SourceBindings, []);
      const stepGraph = this.parseJson<FeatureStepGraph>(pipeline.FeatureSteps, { Steps: [] });
      const leakage = this.parseJson<LeakageGuard>(pipeline.LeakageGuard, {
        DenyFields: [],
        SingleFeatureDominanceThreshold: DOMINANCE_THRESHOLD_DEFAULT,
      });
      const asOf = this.parseJson<AsOfStrategy>(pipeline.AsOfStrategy, { Mode: 'none' });
      const validation = this.parseJson<ValidationStrategy>(pipeline.ValidationStrategy, {
        Strategy: 'train_test_split',
        TestSize: 0.2,
        LockedHoldoutFraction: 0.15,
      });

      const sourceEntity = sources[0]?.Ref || 'Entity';
      const features: string[] = [];
      for (const step of stepGraph.Steps ?? []) {
        if ('Columns' in step && Array.isArray(step.Columns)) {
          features.push(...step.Columns);
        } else if ('Column' in step && typeof step.Column === 'string') {
          features.push(step.Column);
        }
      }

      const selectedAlgos = this.AvailableAlgorithms.filter((a) => this.SelectedAlgoIds.has(a.ID));

      const planSpec: ModelingPlanSpec = {
        Goal: this.Goal.trim() || `Optimize model for ${pipeline.Name}`,
        TargetDefinition: {
          EntityName: sourceEntity,
          TargetVariable: pipeline.TargetVariable || 'Target',
          ProblemType: this.ProblemType,
          SuccessMetric: this.SuccessMetric,
          AsOfStrategy: asOf,
        },
        CandidateSources: sources.map((s) => ({
          Kind: s.Kind,
          Ref: s.Ref,
          Why: 'Configured in training pipeline',
        })),
        CandidateFeatures: features.map((f) => ({
          Name: f,
          SourceRef: sourceEntity,
          Kind: 'numeric',
          Why: 'Selected in pipeline feature steps',
        })),
        LeakageNotes: (leakage.DenyFields || []).map((field) => ({
          Field: field,
          Risk: 'Deny-listed leakage risk',
          Action: 'exclude',
        })),
        ProposedExperiments: selectedAlgos.map((algo, index) => ({
          Label: `${algo.Name} (tournament trial)`,
          AlgorithmName: algo.Name,
          FeatureSet: features,
          Rationale: `Evaluate ${algo.Name} across pipeline features`,
          Priority: index + 1,
        })),
        ValidationStrategy: validation,
        ProposedBudget: {
          MaxRuns: this.BudgetRuns,
          MaxComputeCost: this.BudgetCost,
          MaxWallclockMinutes: this.BudgetMinutes,
        },
        Approved: true,
      };

      const budget: Budget = {
        MaxRuns: this.BudgetRuns,
        MaxComputeCost: this.BudgetCost,
        MaxWallclockMinutes: this.BudgetMinutes,
      };

      const op = new PredictiveStudioStartExperimentSessionOperation();
      const result = await op.Execute(
        {
          planSpec,
          budget,
        },
        { provider: this.provider ?? undefined, user: this.CurrentUser ?? undefined },
      );

      if (result.Success && result.Output) {
        this.notifications.CreateSimpleNotification(
          `Experiment session started! Session ID: ${result.Output.sessionId}`,
          'success',
          5000,
        );
        this.Started.emit(result.Output.sessionId);
        this.Closed.emit();
      } else {
        this.notifications.CreateSimpleNotification(
          result.ErrorMessage || 'Failed to start experiment session.',
          'error',
          6000,
        );
      }
    } catch (err) {
      this.notifications.CreateSimpleNotification(
        `Experiment error: ${err instanceof Error ? err.message : String(err)}`,
        'error',
        6000,
      );
    } finally {
      this.Busy = false;
      this.cdr.detectChanges();
    }
  }

  /** @deprecated Use {@link Launch}. */
  public async launch(): Promise<void> {
    return this.Launch();
  }

  private parseJson<T>(raw: string | null | undefined, fallback: T): T {
    if (!raw) return fallback;
    try {
      const val: unknown = JSON.parse(raw);
      return (val ?? fallback) as T;
    } catch {
      return fallback;
    }
  }
}
