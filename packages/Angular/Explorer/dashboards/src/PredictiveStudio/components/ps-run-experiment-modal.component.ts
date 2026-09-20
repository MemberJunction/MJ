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
  @Input() currentUser: UserInfo | null = null;
  @Input() preselectedPipelineId?: string;

  @Output() closed = new EventEmitter<void>();
  @Output() started = new EventEmitter<string>();

  private cdr = inject(ChangeDetectorRef);
  private notifications = inject(MJNotificationService);

  public selectedPipelineId = '';
  public sessionName = '';
  public goal = '';
  public successMetric: 'AUC' | 'F1' | 'Accuracy' | 'RMSE' | 'MAE' | 'R2' = 'AUC';
  public problemType: 'classification' | 'regression' = 'classification';

  public selectedAlgoIds = new Set<string>();

  public budgetRuns = 15;
  public budgetCost = 25;
  public budgetMinutes = 30;
  public holdoutPercent = 15;

  public busy = false;

  ngOnInit(): void {
    const pipelines = this.engine?.Pipelines ?? [];
    if (this.preselectedPipelineId && pipelines.some((p) => UUIDsEqual(p.ID, this.preselectedPipelineId))) {
      this.selectedPipelineId = this.preselectedPipelineId;
    } else if (pipelines.length > 0) {
      this.selectedPipelineId = pipelines[0].ID;
    }
    this.syncFromSelectedPipeline();
  }

  public get availableAlgorithms(): MJMLAlgorithmEntity[] {
    return this.engine?.Algorithms ?? [];
  }

  public get selectedPipeline(): MJMLTrainingPipelineEntity | undefined {
    return this.engine?.Pipelines.find((p) => UUIDsEqual(p.ID, this.selectedPipelineId));
  }

  public onPipelineChange(newId: string): void {
    this.selectedPipelineId = newId;
    this.syncFromSelectedPipeline();
  }

  private syncFromSelectedPipeline(): void {
    const p = this.selectedPipeline;
    if (!p) return;
    this.problemType = (p.ProblemType as 'classification' | 'regression') || 'classification';
    this.successMetric = this.problemType === 'classification' ? 'AUC' : 'RMSE';
    this.sessionName = `${p.Name} — Multi-Algorithm Tournament`;
    this.goal = `Evaluate and compare algorithms on ${p.Name} to maximize ${this.successMetric}.`;
    this.selectRecommendedAlgos();
  }

  public selectRecommendedAlgos(): void {
    this.selectedAlgoIds.clear();
    const pt = this.problemType;
    for (const algo of this.availableAlgorithms) {
      const types = (algo.ProblemTypes || '').toLowerCase();
      if (types.includes(pt) || types.length === 0) {
        // Recommend gradient boosting and random forest by default
        const dc = (algo.DriverClass || '').toLowerCase();
        if (dc.includes('xgboost') || dc.includes('lightgbm') || dc.includes('forest') || dc.includes('logistic')) {
          this.selectedAlgoIds.add(algo.ID);
        }
      }
    }
    if (this.selectedAlgoIds.size === 0) {
      // Fallback: select first 3
      this.availableAlgorithms.slice(0, 3).forEach((a) => this.selectedAlgoIds.add(a.ID));
    }
  }

  public selectAllAlgos(): void {
    this.availableAlgorithms.forEach((a) => this.selectedAlgoIds.add(a.ID));
  }

  public clearAlgos(): void {
    this.selectedAlgoIds.clear();
  }

  public isAlgoSelected(id: string): boolean {
    return this.selectedAlgoIds.has(id);
  }

  public toggleAlgo(id: string): void {
    if (this.selectedAlgoIds.has(id)) {
      this.selectedAlgoIds.delete(id);
    } else {
      this.selectedAlgoIds.add(id);
    }
  }

  public getAlgoIcon(driverClass: string): string {
    const key = (driverClass || '').toLowerCase();
    for (const [k, icon] of Object.entries(ALGO_ICONS)) {
      if (key.includes(k)) return icon;
    }
    return 'fa-solid fa-chart-line';
  }

  public get isValid(): boolean {
    return Boolean(
      this.selectedPipelineId &&
      this.sessionName.trim() &&
      this.selectedAlgoIds.size > 0 &&
      this.budgetRuns > 0 &&
      this.budgetCost > 0
    );
  }

  public cancel(): void {
    if (this.busy) return;
    this.closed.emit();
  }

  public onBackdropClick(event: MouseEvent): void {
    if (event.target === event.currentTarget && !this.busy) {
      this.cancel();
    }
  }

  public async launch(): Promise<void> {
    const pipeline = this.selectedPipeline;
    if (!pipeline || !this.isValid || this.busy) return;

    this.busy = true;
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

      const selectedAlgos = this.availableAlgorithms.filter((a) => this.selectedAlgoIds.has(a.ID));

      const planSpec: ModelingPlanSpec = {
        Goal: this.goal.trim() || `Optimize model for ${pipeline.Name}`,
        TargetDefinition: {
          EntityName: sourceEntity,
          TargetVariable: pipeline.TargetVariable || 'Target',
          ProblemType: this.problemType,
          SuccessMetric: this.successMetric,
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
          MaxRuns: this.budgetRuns,
          MaxComputeCost: this.budgetCost,
          MaxWallclockMinutes: this.budgetMinutes,
        },
        Approved: true,
      };

      const budget: Budget = {
        MaxRuns: this.budgetRuns,
        MaxComputeCost: this.budgetCost,
        MaxWallclockMinutes: this.budgetMinutes,
      };

      const op = new PredictiveStudioStartExperimentSessionOperation();
      const result = await op.Execute(
        {
          planSpec,
          budget,
        },
        { provider: this.provider ?? undefined, user: this.currentUser ?? undefined },
      );

      if (result.Success && result.Output) {
        this.notifications.CreateSimpleNotification(
          `Experiment session started! Session ID: ${result.Output.sessionId}`,
          'success',
          5000,
        );
        this.started.emit(result.Output.sessionId);
        this.closed.emit();
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
      this.busy = false;
      this.cdr.detectChanges();
    }
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
