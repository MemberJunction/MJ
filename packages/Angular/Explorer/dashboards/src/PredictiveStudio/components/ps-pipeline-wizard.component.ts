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
import { UUIDsEqual } from '@memberjunction/global';
import { MJButtonDirective } from '@memberjunction/ng-ui-components';
import { MJNotificationService } from '@memberjunction/ng-notifications';
import { IMetadataProvider, UserInfo, EntityInfo, EntityFieldInfo, Metadata } from '@memberjunction/core';
import {
  MJMLTrainingPipelineEntity,
  MJMLAlgorithmEntity,
  PredictiveStudioTrainModelOperation,
} from '@memberjunction/core-entities';
import {
  DOMINANCE_THRESHOLD_DEFAULT,
  type SourceBinding,
  type FeatureStep,
  type AsOfStrategy,
  type LeakageGuard,
  type ValidationStrategy,
  type ProblemType,
} from '@memberjunction/predictive-studio-core';
import { PredictiveStudioEngine } from '../engine/predictive-studio.engine';

export interface FieldSelectionItem {
  field: EntityFieldInfo;  // case-violation-ok-legacy-back-compat: the old name is also read off a value typed `any`, where a rename would compile and silently return undefined
  selected: boolean;  // case-violation-ok-legacy-back-compat: renaming it broke a use the checker could not see from the declaration — the compile proved it
  isDenyList: boolean;  // case-violation-ok-legacy-back-compat: renaming it broke a use the checker could not see from the declaration — the compile proved it
  isTarget: boolean;  // case-violation-ok-legacy-back-compat: renaming it broke a use the checker could not see from the declaration — the compile proved it
}

export type WizardStep = 'goal' | 'features' | 'preprocessing' | 'algorithm';

@Component({
  standalone: true,
  selector: 'ps-pipeline-wizard',
  imports: [CommonModule, FormsModule, MJButtonDirective],
  encapsulation: ViewEncapsulation.None,
  styleUrls: ['../predictive-studio.shared.css', './ps-pipeline-wizard.component.css'],
  template: `
    <div class="ps-modal-backdrop" (click)="onBackdropClick($event)">
      <div class="ps-modal-dialog ps-wizard-dialog" role="dialog" aria-modal="true" data-testid="ps-pipeline-wizard">
        <!-- Header -->
        <div class="ps-wizard-header">
          <div class="ps-wizard-header-title">
            <i class="fa-solid fa-wand-magic-sparkles"></i>
            <div>
              <h2>{{ isEditing ? 'Edit Training Pipeline' : 'New ML Training Pipeline' }}</h2>
              <span class="ps-wizard-subtitle">Step-by-step pipeline configuration with leakage guard</span>
            </div>
          </div>
          <button class="ps-wizard-close" (click)="cancel()" aria-label="Close wizard">
            <i class="fa-solid fa-xmark"></i>
          </button>
        </div>

        <!-- Step Indicator Strip -->
        <div class="ps-wizard-stepper">
          <button class="ps-step-tab" [class.active]="currentStep === 'goal'" [class.done]="isStepDone('goal')" (click)="goToStep('goal')">
            <span class="step-num">1</span>
            <span class="step-label">Goal & Target</span>
          </button>
          <div class="step-line"></div>
          <button class="ps-step-tab" [class.active]="currentStep === 'features'" [class.done]="isStepDone('features')" (click)="goToStep('features')">
            <span class="step-num">2</span>
            <span class="step-label">Features & Leakage</span>
          </button>
          <div class="step-line"></div>
          <button class="ps-step-tab" [class.active]="currentStep === 'preprocessing'" [class.done]="isStepDone('preprocessing')" (click)="goToStep('preprocessing')">
            <span class="step-num">3</span>
            <span class="step-label">Preprocessing</span>
          </button>
          <div class="step-line"></div>
          <button class="ps-step-tab" [class.active]="currentStep === 'algorithm'" [class.done]="isStepDone('algorithm')" (click)="goToStep('algorithm')">
            <span class="step-num">4</span>
            <span class="step-label">Algorithm & Split</span>
          </button>
        </div>

        <!-- Step Content Area -->
        <div class="ps-wizard-body">
          <!-- Step 1: Goal & Target -->
          @if (currentStep === 'goal') {
            <div class="ps-step-content" data-testid="ps-wizard-step-goal">
              <div class="ps-field">
                <label for="pipeline-name">Pipeline Name <span class="req">*</span></label>
                <input id="pipeline-name" class="mj-input" type="text" [(ngModel)]="pipelineName" placeholder="e.g. Member Renewal Risk v1" />
              </div>

              <div class="ps-field">
                <label for="pipeline-desc">Description</label>
                <textarea id="pipeline-desc" class="mj-textarea" rows="2" [(ngModel)]="pipelineDescription" placeholder="Predicts whether active members will renew before their period ends."></textarea>
              </div>

              <div class="ps-grid-2">
                <div class="ps-field">
                  <label for="target-entity">Target Entity <span class="req">*</span></label>
                  <select id="target-entity" class="mj-input" [ngModel]="selectedEntityId" (ngModelChange)="onEntitySelected($event)">
                    <option [value]="''" disabled>-- Select Entity --</option>
                    @for (ent of availableEntities; track ent.ID) {
                      <option [value]="ent.ID">{{ ent.Name }} ({{ ent.BaseView || ent.BaseTable }})</option>
                    }
                  </select>
                </div>

                <div class="ps-field">
                  <label for="target-variable">Target Variable (Label Column) <span class="req">*</span></label>
                  <select id="target-variable" class="mj-input" [(ngModel)]="targetVariable" [disabled]="!selectedEntity">
                    <option [value]="''" disabled>-- Select Label Field --</option>
                    @for (f of availableFields; track f.Name) {
                      <option [value]="f.Name">{{ f.Name }} ({{ f.Type }})</option>
                    }
                  </select>
                </div>
              </div>

              <div class="ps-grid-2">
                <div class="ps-field">
                  <label for="problem-type">Problem Type</label>
                  <select id="problem-type" class="mj-input" [(ngModel)]="problemType" (ngModelChange)="onProblemTypeChange()">
                    <option value="classification">Classification (Predict Categorical / Binary Outcome)</option>
                    <option value="regression">Regression (Predict Numeric Continuous Value)</option>
                  </select>
                </div>

                <div class="ps-field">
                  <label for="eval-metric">Primary Evaluation Metric</label>
                  <select id="eval-metric" class="mj-input" [(ngModel)]="evaluationMetric">
                    @for (m of availableMetrics; track m) {
                      <option [value]="m">{{ m }}</option>
                    }
                  </select>
                </div>
              </div>

              <div class="ps-card as-of-box">
                <div class="ps-card-head">
                  <i class="fa-solid fa-clock-rotate-left"></i>
                  <h4>Point-in-Time Cutoff (Temporal Leakage Guard)</h4>
                </div>
                <div class="ps-card-body">
                  <div class="ps-grid-2">
                    <div class="ps-field">
                      <label>Cutoff Mode</label>
                      <select class="mj-input" [(ngModel)]="asOfMode">
                        <option value="none">None (Static Cross-Sectional Data)</option>
                        <option value="column">Date Column on Entity</option>
                        <option value="offset">Relative Days Offset before Event</option>
                      </select>
                    </div>

                    @if (asOfMode === 'column') {
                      <div class="ps-field">
                        <label>Decision Date Field</label>
                        <select class="mj-input" [(ngModel)]="asOfColumn">
                          <option [value]="''">-- Select Date Field --</option>
                          @for (f of dateFields; track f.Name) {
                            <option [value]="f.Name">{{ f.Name }}</option>
                          }
                        </select>
                      </div>
                    }

                    @if (asOfMode === 'offset') {
                      <div class="ps-field">
                        <label>Offset Days before Outcome</label>
                        <input class="mj-input" type="number" min="1" [(ngModel)]="asOfOffsetDays" />
                      </div>
                    }
                  </div>
                </div>
              </div>
            </div>
          }

          <!-- Step 2: Feature Selection & Leakage Guard -->
          @if (currentStep === 'features') {
            <div class="ps-step-content" data-testid="ps-wizard-step-features">
              <div class="feat-toolbar">
                <div class="feat-search">
                  <i class="fa-solid fa-magnifying-glass"></i>
                  <input class="mj-input" type="text" [(ngModel)]="fieldSearchFilter" placeholder="Filter fields by name or type…" />
                </div>
                <div class="feat-actions">
                  <button mjButton variant="secondary" size="sm" (click)="selectAllFields(true)">Select All</button>
                  <button mjButton variant="secondary" size="sm" (click)="selectAllFields(false)">Deselect All</button>
                  <button mjButton variant="secondary" size="sm" (click)="excludeAuditFields()">Exclude IDs & Timestamps</button>
                </div>
              </div>

              <div class="feat-stats">
                <span>Selected: <strong>{{ selectedFeaturesCount }}</strong> features</span>
                <span>Leakage Deny-List: <strong class="text-danger">{{ denyListCount }}</strong> excluded fields</span>
              </div>

              <div class="feat-table-wrap">
                <table class="ps-table feat-table">
                  <thead>
                    <tr>
                      <th style="width: 40px;">Use</th>
                      <th>Field Name</th>
                      <th>Data Type</th>
                      <th>Nullable</th>
                      <th style="width: 140px; text-align: center;">Leakage Guard</th>
                    </tr>
                  </thead>
                  <tbody>
                    @for (item of filteredFieldItems; track item.field.Name) {
                      <tr [class.target-row]="item.isTarget" [class.deny-row]="item.isDenyList">
                        <td>
                          <input type="checkbox" [(ngModel)]="item.selected" [disabled]="item.isTarget || item.isDenyList" />
                        </td>
                        <td>
                          <strong>{{ item.field.Name }}</strong>
                          @if (item.isTarget) {
                            <span class="ps-badge info" style="margin-left: 6px;">Target Label</span>
                          }
                        </td>
                        <td><code>{{ item.field.Type }}</code></td>
                        <td>{{ item.field.AllowsNull ? 'Yes' : 'No' }}</td>
                        <td style="text-align: center;">
                          @if (!item.isTarget) {
                            <button class="ps-deny-toggle" [class.denied]="item.isDenyList" (click)="toggleDenyList(item)" title="Add to leakage deny-list">
                              <i class="fa-solid" [class.fa-shield-halved]="item.isDenyList" [class.fa-shield]="!item.isDenyList"></i>
                              {{ item.isDenyList ? 'Denied' : 'Allow' }}
                            </button>
                          }
                        </td>
                      </tr>
                    }
                  </tbody>
                </table>
              </div>

              <div class="ps-field" style="margin-top: 14px;">
                <label>Single-Feature Dominance Threshold: <strong>{{ dominanceThreshold | percent }}</strong></label>
                <div class="slider-row">
                  <input type="range" min="0.5" max="0.99" step="0.01" [(ngModel)]="dominanceThreshold" />
                  <span class="ps-muted ps-small">Warns and holds model if any single feature accounts for > {{ dominanceThreshold | percent }} of total importance.</span>
                </div>
              </div>
            </div>
          }

          <!-- Step 3: Preprocessing Recipe -->
          @if (currentStep === 'preprocessing') {
            <div class="ps-step-content" data-testid="ps-wizard-step-preprocessing">
              <div class="recipe-card">
                <div class="recipe-icon"><i class="fa-solid fa-table-cells"></i></div>
                <div class="recipe-details">
                  <h4>Categorical Encoding</h4>
                  <p class="ps-small ps-muted">Converts text and discrete categoricals into numerical representations.</p>
                  <select class="mj-input" [(ngModel)]="categoricalEncoding">
                    <option value="onehot">One-Hot Encoding (Recommended for cardinality &lt; 50)</option>
                    <option value="none">Pass-Through / Native Algorithm Handling</option>
                  </select>
                </div>
              </div>

              <div class="recipe-card">
                <div class="recipe-icon"><i class="fa-solid fa-fill-drip"></i></div>
                <div class="recipe-details">
                  <h4>Missing Value Imputation</h4>
                  <p class="ps-small ps-muted">Strategy for filling null or missing entries in training matrices.</p>
                  <select class="mj-input" [(ngModel)]="imputeStrategy">
                    <option value="median">Median (Robust against numeric outliers)</option>
                    <option value="mean">Mean (Standard arithmetic average)</option>
                    <option value="mode">Mode (Most frequent category)</option>
                    <option value="constant">Constant (Zero / Missing category token)</option>
                  </select>
                </div>
              </div>

              <div class="recipe-card">
                <div class="recipe-icon"><i class="fa-solid fa-ruler-combined"></i></div>
                <div class="recipe-details">
                  <h4>Numeric Standardization</h4>
                  <p class="ps-small ps-muted">Scales numeric features to prevent large magnitudes from dominating.</p>
                  <select class="mj-input" [(ngModel)]="standardizeStrategy">
                    <option value="standard">Standard Scaling (Z-score: mean 0, variance 1)</option>
                    <option value="minmax">Min-Max Scaling (Bounding values to [0, 1])</option>
                    <option value="none">None (Native tree-based scaling)</option>
                  </select>
                </div>
              </div>
            </div>
          }

          <!-- Step 4: Algorithm & Validation Split -->
          @if (currentStep === 'algorithm') {
            <div class="ps-step-content" data-testid="ps-wizard-step-algorithm">
              <div class="ps-field">
                <label for="algorithm-select">Algorithm <span class="req">*</span></label>
                <select id="algorithm-select" class="mj-input" [ngModel]="selectedAlgorithmId" (ngModelChange)="onAlgorithmSelected($event)">
                  @for (a of availableAlgorithms; track a.ID) {
                    <option [value]="a.ID">{{ a.Name }} ({{ a.DriverClass }})</option>
                  }
                </select>
              </div>

              <!-- Hyperparameter controls -->
              <div class="ps-card" style="margin: 12px 0;">
                <div class="ps-card-head">
                  <i class="fa-solid fa-sliders"></i>
                  <h4>Algorithm Hyperparameters</h4>
                </div>
                <div class="ps-card-body">
                  <div class="ps-grid-3">
                    <div class="ps-field">
                      <label>Estimators (Trees)</label>
                      <input class="mj-input" type="number" min="10" max="1000" step="10" [(ngModel)]="hyperparamEstimators" />
                    </div>
                    <div class="ps-field">
                      <label>Max Depth</label>
                      <input class="mj-input" type="number" min="1" max="20" [(ngModel)]="hyperparamMaxDepth" />
                    </div>
                    <div class="ps-field">
                      <label>Learning Rate</label>
                      <input class="mj-input" type="number" min="0.001" max="1" step="0.01" [(ngModel)]="hyperparamLearningRate" />
                    </div>
                  </div>
                </div>
              </div>

              <!-- Validation strategy -->
              <div class="ps-card">
                <div class="ps-card-head">
                  <i class="fa-solid fa-scissors"></i>
                  <h4>Validation Strategy</h4>
                </div>
                <div class="ps-card-body">
                  <div class="ps-grid-2">
                    <div class="ps-field">
                      <label>Strategy</label>
                      <select class="mj-input" [(ngModel)]="validationStrategyType">
                        <option value="train_test_split">Train / Test Split</option>
                        <option value="kfold">K-Fold Cross-Validation</option>
                      </select>
                    </div>

                    @if (validationStrategyType === 'train_test_split') {
                      <div class="ps-field">
                        <label>Test Holdout Percentage: <strong>{{ testSplitRatio | percent }}</strong></label>
                        <input type="range" min="0.1" max="0.4" step="0.05" [(ngModel)]="testSplitRatio" />
                      </div>
                    } @else {
                      <div class="ps-field">
                        <label>Number of Folds (K)</label>
                        <input class="mj-input" type="number" min="2" max="10" [(ngModel)]="kFolds" />
                      </div>
                    }
                  </div>
                </div>
              </div>
            </div>
          }
        </div>

        <!-- Footer Actions -->
        <div class="ps-wizard-footer">
          <button mjButton variant="secondary" size="sm" (click)="cancel()">Cancel</button>
          <span class="ps-spacer"></span>

          @if (currentStep !== 'goal') {
            <button mjButton variant="secondary" size="sm" (click)="prevStep()">
              <i class="fa-solid fa-arrow-left"></i> Back
            </button>
          }

          @if (currentStep !== 'algorithm') {
            <button mjButton variant="primary" size="sm" (click)="nextStep()" [disabled]="!canProceed()">
              Next <i class="fa-solid fa-arrow-right"></i>
            </button>
          } @else {
            <button mjButton variant="secondary" size="sm" (click)="saveDraft()" [disabled]="busy || !canSave()">
              <i class="fa-solid fa-floppy-disk"></i> Save Draft
            </button>
            <button mjButton variant="primary" size="sm" (click)="saveAndTrain()" [disabled]="busy || !canSave()">
              <i class="fa-solid fa-play"></i> Save & Train Now
            </button>
          }
        </div>
      </div>
    </div>
  `,
})
export class PSPipelineWizardComponent implements OnInit {
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
  @Input() engine: PredictiveStudioEngine | null = null;
  @Input() InitialAlgorithmName?: string;

  /** @deprecated Use {@link InitialAlgorithmName}. */
  @Input() set initialAlgorithmName(value: string | undefined) {
    this.InitialAlgorithmName = value;
  }
  /** @deprecated Use {@link InitialAlgorithmName}. */
  get initialAlgorithmName(): string | undefined {
    return this.InitialAlgorithmName;
  }
  @Input() InitialAlgorithmId?: string;

  /** @deprecated Use {@link InitialAlgorithmId}. */
  @Input() set initialAlgorithmId(value: string | undefined) {
    this.InitialAlgorithmId = value;
  }
  /** @deprecated Use {@link InitialAlgorithmId}. */
  get initialAlgorithmId(): string | undefined {
    return this.InitialAlgorithmId;
  }
  @Input() CloneFromPipeline?: MJMLTrainingPipelineEntity;

  /** @deprecated Use {@link CloneFromPipeline}. */
  @Input() set cloneFromPipeline(value: MJMLTrainingPipelineEntity | undefined) {
    this.CloneFromPipeline = value;
  }
  /** @deprecated Use {@link CloneFromPipeline}. */
  get cloneFromPipeline(): MJMLTrainingPipelineEntity | undefined {
    return this.CloneFromPipeline;
  }
  @Input() set CloneFrom(p: MJMLTrainingPipelineEntity | null | undefined) {
    this.CloneFromPipeline = p ?? undefined;
  }

  /** @deprecated Use {@link CloneFrom}. */
  @Input() set cloneFrom(value: MJMLTrainingPipelineEntity | null | undefined) {
    this.CloneFrom = value;
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
  @Output() Saved = new EventEmitter<MJMLTrainingPipelineEntity>();

  /**
   * @deprecated Use {@link Saved}.
   *
   * The same emitter under the old binding name, so a template still binding
   * (saved) keeps working. Must stay AFTER Saved: class fields
   * initialise in order, and the other way round this captures undefined.
   */
  @Output() saved = this.Saved;
  @Output() TrainRequested = new EventEmitter<MJMLTrainingPipelineEntity>();

  /**
   * @deprecated Use {@link TrainRequested}.
   *
   * The same emitter under the old binding name, so a template still binding
   * (trainRequested) keeps working. Must stay AFTER TrainRequested: class fields
   * initialise in order, and the other way round this captures undefined.
   */
  @Output() trainRequested = this.TrainRequested;

  private readonly cdr = inject(ChangeDetectorRef);
  private readonly notifications = inject(MJNotificationService);

  public CurrentStep: WizardStep = 'goal';

  /** @deprecated Use {@link CurrentStep}. */
  public get currentStep(): WizardStep {
    return this.CurrentStep;
  }
  /** @deprecated Use {@link CurrentStep}. */
  public set currentStep(value: WizardStep) {
    this.CurrentStep = value;
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
  public IsEditing = false;

  /** @deprecated Use {@link IsEditing}. */
  public get isEditing() {
    return this.IsEditing;
  }
  /** @deprecated Use {@link IsEditing}. */
  public set isEditing(value) {
    this.IsEditing = value;
  }

  // Step 1: Goal & Target
  public PipelineName = '';

  /** @deprecated Use {@link PipelineName}. */
  public get pipelineName() {
    return this.PipelineName;
  }
  /** @deprecated Use {@link PipelineName}. */
  public set pipelineName(value) {
    this.PipelineName = value;
  }
  public PipelineDescription = '';

  /** @deprecated Use {@link PipelineDescription}. */
  public get pipelineDescription() {
    return this.PipelineDescription;
  }
  /** @deprecated Use {@link PipelineDescription}. */
  public set pipelineDescription(value) {
    this.PipelineDescription = value;
  }
  public SelectedEntityId = '';

  /** @deprecated Use {@link SelectedEntityId}. */
  public get selectedEntityId() {
    return this.SelectedEntityId;
  }
  /** @deprecated Use {@link SelectedEntityId}. */
  public set selectedEntityId(value) {
    this.SelectedEntityId = value;
  }
  public TargetVariable = '';

  /** @deprecated Use {@link TargetVariable}. */
  public get targetVariable() {
    return this.TargetVariable;
  }
  /** @deprecated Use {@link TargetVariable}. */
  public set targetVariable(value) {
    this.TargetVariable = value;
  }
  public ProblemType: ProblemType = 'classification';

  /** @deprecated Use {@link ProblemType}. */
  public get problemType(): ProblemType {
    return this.ProblemType;
  }
  /** @deprecated Use {@link ProblemType}. */
  public set problemType(value: ProblemType) {
    this.ProblemType = value;
  }
  public EvaluationMetric = 'AUC';

  /** @deprecated Use {@link EvaluationMetric}. */
  public get evaluationMetric() {
    return this.EvaluationMetric;
  }
  /** @deprecated Use {@link EvaluationMetric}. */
  public set evaluationMetric(value) {
    this.EvaluationMetric = value;
  }
  public AsOfMode: 'none' | 'column' | 'offset' = 'none';

  /** @deprecated Use {@link AsOfMode}. */
  public get asOfMode(): 'none' | 'column' | 'offset' {
    return this.AsOfMode;
  }
  /** @deprecated Use {@link AsOfMode}. */
  public set asOfMode(value: 'none' | 'column' | 'offset') {
    this.AsOfMode = value;
  }
  public AsOfColumn = '';

  /** @deprecated Use {@link AsOfColumn}. */
  public get asOfColumn() {
    return this.AsOfColumn;
  }
  /** @deprecated Use {@link AsOfColumn}. */
  public set asOfColumn(value) {
    this.AsOfColumn = value;
  }
  public AsOfOffsetDays = 30;

  /** @deprecated Use {@link AsOfOffsetDays}. */
  public get asOfOffsetDays() {
    return this.AsOfOffsetDays;
  }
  /** @deprecated Use {@link AsOfOffsetDays}. */
  public set asOfOffsetDays(value) {
    this.AsOfOffsetDays = value;
  }

  // Step 2: Features
  public FieldItems: FieldSelectionItem[] = [];

  /** @deprecated Use {@link FieldItems}. */
  public get fieldItems(): FieldSelectionItem[] {
    return this.FieldItems;
  }
  /** @deprecated Use {@link FieldItems}. */
  public set fieldItems(value: FieldSelectionItem[]) {
    this.FieldItems = value;
  }
  public FieldSearchFilter = '';

  /** @deprecated Use {@link FieldSearchFilter}. */
  public get fieldSearchFilter() {
    return this.FieldSearchFilter;
  }
  /** @deprecated Use {@link FieldSearchFilter}. */
  public set fieldSearchFilter(value) {
    this.FieldSearchFilter = value;
  }
  public DominanceThreshold = DOMINANCE_THRESHOLD_DEFAULT;

  /** @deprecated Use {@link DominanceThreshold}. */
  public get dominanceThreshold() {
    return this.DominanceThreshold;
  }
  /** @deprecated Use {@link DominanceThreshold}. */
  public set dominanceThreshold(value) {
    this.DominanceThreshold = value;
  }

  // Step 3: Preprocessing
  public CategoricalEncoding: 'onehot' | 'none' = 'onehot';

  /** @deprecated Use {@link CategoricalEncoding}. */
  public get categoricalEncoding(): 'onehot' | 'none' {
    return this.CategoricalEncoding;
  }
  /** @deprecated Use {@link CategoricalEncoding}. */
  public set categoricalEncoding(value: 'onehot' | 'none') {
    this.CategoricalEncoding = value;
  }
  public ImputeStrategy: 'mean' | 'median' | 'mode' | 'constant' = 'median';

  /** @deprecated Use {@link ImputeStrategy}. */
  public get imputeStrategy(): 'mean' | 'median' | 'mode' | 'constant' {
    return this.ImputeStrategy;
  }
  /** @deprecated Use {@link ImputeStrategy}. */
  public set imputeStrategy(value: 'mean' | 'median' | 'mode' | 'constant') {
    this.ImputeStrategy = value;
  }
  public StandardizeStrategy: 'standard' | 'minmax' | 'none' = 'standard';

  /** @deprecated Use {@link StandardizeStrategy}. */
  public get standardizeStrategy(): 'standard' | 'minmax' | 'none' {
    return this.StandardizeStrategy;
  }
  /** @deprecated Use {@link StandardizeStrategy}. */
  public set standardizeStrategy(value: 'standard' | 'minmax' | 'none') {
    this.StandardizeStrategy = value;
  }

  // Step 4: Algorithm & Validation
  public SelectedAlgorithmId = '';

  /** @deprecated Use {@link SelectedAlgorithmId}. */
  public get selectedAlgorithmId() {
    return this.SelectedAlgorithmId;
  }
  /** @deprecated Use {@link SelectedAlgorithmId}. */
  public set selectedAlgorithmId(value) {
    this.SelectedAlgorithmId = value;
  }
  public HyperparamEstimators = 100;

  /** @deprecated Use {@link HyperparamEstimators}. */
  public get hyperparamEstimators() {
    return this.HyperparamEstimators;
  }
  /** @deprecated Use {@link HyperparamEstimators}. */
  public set hyperparamEstimators(value) {
    this.HyperparamEstimators = value;
  }
  public HyperparamMaxDepth = 6;

  /** @deprecated Use {@link HyperparamMaxDepth}. */
  public get hyperparamMaxDepth() {
    return this.HyperparamMaxDepth;
  }
  /** @deprecated Use {@link HyperparamMaxDepth}. */
  public set hyperparamMaxDepth(value) {
    this.HyperparamMaxDepth = value;
  }
  public HyperparamLearningRate = 0.1;

  /** @deprecated Use {@link HyperparamLearningRate}. */
  public get hyperparamLearningRate() {
    return this.HyperparamLearningRate;
  }
  /** @deprecated Use {@link HyperparamLearningRate}. */
  public set hyperparamLearningRate(value) {
    this.HyperparamLearningRate = value;
  }
  public ValidationStrategyType: 'train_test_split' | 'kfold' = 'train_test_split';

  /** @deprecated Use {@link ValidationStrategyType}. */
  public get validationStrategyType(): 'train_test_split' | 'kfold' {
    return this.ValidationStrategyType;
  }
  /** @deprecated Use {@link ValidationStrategyType}. */
  public set validationStrategyType(value: 'train_test_split' | 'kfold') {
    this.ValidationStrategyType = value;
  }
  public TestSplitRatio = 0.2;

  /** @deprecated Use {@link TestSplitRatio}. */
  public get testSplitRatio() {
    return this.TestSplitRatio;
  }
  /** @deprecated Use {@link TestSplitRatio}. */
  public set testSplitRatio(value) {
    this.TestSplitRatio = value;
  }
  public KFolds = 5;

  /** @deprecated Use {@link KFolds}. */
  public get kFolds() {
    return this.KFolds;
  }
  /** @deprecated Use {@link KFolds}. */
  public set kFolds(value) {
    this.KFolds = value;
  }

  public ngOnInit(): void {
    this.initFromDefaults();
  }

  public get AvailableEntities(): EntityInfo[] {
    if (!this.provider) return [];
    return this.provider.Entities.filter((e) => !e.VirtualEntity && e.AllowUserSearchAPI)
      .sort((a, b) => a.Name.localeCompare(b.Name));
  }

  /** @deprecated Use {@link AvailableEntities}. */
  public get availableEntities(): EntityInfo[] {
    return this.AvailableEntities;
  }

  public get SelectedEntity(): EntityInfo | null {
    if (!this.SelectedEntityId || !this.provider) return null;
    return this.provider.Entities.find((e) => UUIDsEqual(e.ID, this.SelectedEntityId)) ?? null;
  }

  /** @deprecated Use {@link SelectedEntity}. */
  public get selectedEntity(): EntityInfo | null {
    return this.SelectedEntity;
  }

  public get AvailableFields(): EntityFieldInfo[] {
    return this.SelectedEntity?.Fields ?? [];
  }

  /** @deprecated Use {@link AvailableFields}. */
  public get availableFields(): EntityFieldInfo[] {
    return this.AvailableFields;
  }

  public get DateFields(): EntityFieldInfo[] {
    return this.AvailableFields.filter((f) => f.Type?.toLowerCase().includes('date') || f.Type?.toLowerCase().includes('time'));
  }

  /** @deprecated Use {@link DateFields}. */
  public get dateFields(): EntityFieldInfo[] {
    return this.DateFields;
  }

  public get AvailableMetrics(): string[] {
    if (this.ProblemType === 'classification') {
      return ['AUC', 'Accuracy', 'F1', 'Log Loss', 'Precision', 'Recall'];
    }
    return ['RMSE', 'MAE', 'R2', 'MSE'];
  }

  /** @deprecated Use {@link AvailableMetrics}. */
  public get availableMetrics(): string[] {
    return this.AvailableMetrics;
  }

  public get AvailableAlgorithms(): MJMLAlgorithmEntity[] {
    return this.engine?.Algorithms ?? [];
  }

  /** @deprecated Use {@link AvailableAlgorithms}. */
  public get availableAlgorithms(): MJMLAlgorithmEntity[] {
    return this.AvailableAlgorithms;
  }

  public get FilteredFieldItems(): FieldSelectionItem[] {
    const q = this.FieldSearchFilter.trim().toLowerCase();
    if (!q) return this.FieldItems;
    return this.FieldItems.filter((item) => item.field.Name.toLowerCase().includes(q) || item.field.Type?.toLowerCase().includes(q));
  }

  /** @deprecated Use {@link FilteredFieldItems}. */
  public get filteredFieldItems(): FieldSelectionItem[] {
    return this.FilteredFieldItems;
  }

  public get SelectedFeaturesCount(): number {
    return this.FieldItems.filter((i) => i.selected && !i.isDenyList && !i.isTarget).length;
  }

  /** @deprecated Use {@link SelectedFeaturesCount}. */
  public get selectedFeaturesCount(): number {
    return this.SelectedFeaturesCount;
  }

  public get DenyListCount(): number {
    return this.FieldItems.filter((i) => i.isDenyList).length;
  }

  /** @deprecated Use {@link DenyListCount}. */
  public get denyListCount(): number {
    return this.DenyListCount;
  }

  public OnEntitySelected(entityId: string): void {
    this.SelectedEntityId = entityId;
    this.TargetVariable = '';
    this.populateFieldItems();
    this.cdr.detectChanges();
  }

  /** @deprecated Use {@link OnEntitySelected}. */
  public onEntitySelected(entityId: string): void {
    return this.OnEntitySelected(entityId);
  }

  public OnProblemTypeChange(): void {
    this.EvaluationMetric = this.ProblemType === 'classification' ? 'AUC' : 'RMSE';
    this.cdr.detectChanges();
  }

  /** @deprecated Use {@link OnProblemTypeChange}. */
  public onProblemTypeChange(): void {
    return this.OnProblemTypeChange();
  }

  public OnAlgorithmSelected(algoId: string): void {
    this.SelectedAlgorithmId = algoId;
    this.cdr.detectChanges();
  }

  /** @deprecated Use {@link OnAlgorithmSelected}. */
  public onAlgorithmSelected(algoId: string): void {
    return this.OnAlgorithmSelected(algoId);
  }

  public ToggleDenyList(item: FieldSelectionItem): void {
    item.isDenyList = !item.isDenyList;
    if (item.isDenyList) {
      item.selected = false;
    }
    this.cdr.detectChanges();
  }

  /** @deprecated Use {@link ToggleDenyList}. */
  public toggleDenyList(item: FieldSelectionItem): void {
    return this.ToggleDenyList(item);
  }

  public SelectAllFields(val: boolean): void {
    for (const item of this.FieldItems) {
      if (!item.isTarget && !item.isDenyList) {
        item.selected = val;
      }
    }
    this.cdr.detectChanges();
  }

  /** @deprecated Use {@link SelectAllFields}. */
  public selectAllFields(val: boolean): void {
    return this.SelectAllFields(val);
  }

  public ExcludeAuditFields(): void {
    for (const item of this.FieldItems) {
      const name = item.field.Name.toLowerCase();
      if (
        name === 'id' ||
        name.startsWith('__mj') ||
        name.includes('created') ||
        name.includes('updated') ||
        name.includes('password')
      ) {
        item.selected = false;
      }
    }
    this.cdr.detectChanges();
  }

  /** @deprecated Use {@link ExcludeAuditFields}. */
  public excludeAuditFields(): void {
    return this.ExcludeAuditFields();
  }

  public IsStepDone(step: WizardStep): boolean {
    switch (step) {
      case 'goal':
        return Boolean(this.PipelineName.trim() && this.SelectedEntityId && this.TargetVariable);
      case 'features':
        return this.SelectedFeaturesCount > 0;
      case 'preprocessing':
        return true;
      case 'algorithm':
        return Boolean(this.SelectedAlgorithmId);
    }
  }

  /** @deprecated Use {@link IsStepDone}. */
  public isStepDone(step: WizardStep): boolean {
    return this.IsStepDone(step);
  }

  public CanProceed(): boolean {
    return this.IsStepDone(this.CurrentStep);
  }

  /** @deprecated Use {@link CanProceed}. */
  public canProceed(): boolean {
    return this.CanProceed();
  }

  public CanSave(): boolean {
    return (
      Boolean(this.PipelineName.trim()) &&
      Boolean(this.SelectedEntityId) &&
      Boolean(this.TargetVariable) &&
      Boolean(this.SelectedAlgorithmId) &&
      this.SelectedFeaturesCount > 0
    );
  }

  /** @deprecated Use {@link CanSave}. */
  public canSave(): boolean {
    return this.CanSave();
  }

  public GoToStep(step: WizardStep): void {
    this.CurrentStep = step;
    this.cdr.detectChanges();
  }

  /** @deprecated Use {@link GoToStep}. */
  public goToStep(step: WizardStep): void {
    return this.GoToStep(step);
  }

  public NextStep(): void {
    if (this.CurrentStep === 'goal') this.CurrentStep = 'features';
    else if (this.CurrentStep === 'features') this.CurrentStep = 'preprocessing';
    else if (this.CurrentStep === 'preprocessing') this.CurrentStep = 'algorithm';
    this.cdr.detectChanges();
  }

  /** @deprecated Use {@link NextStep}. */
  public nextStep(): void {
    return this.NextStep();
  }

  public PrevStep(): void {
    if (this.CurrentStep === 'algorithm') this.CurrentStep = 'preprocessing';
    else if (this.CurrentStep === 'preprocessing') this.CurrentStep = 'features';
    else if (this.CurrentStep === 'features') this.CurrentStep = 'goal';
    this.cdr.detectChanges();
  }

  /** @deprecated Use {@link PrevStep}. */
  public prevStep(): void {
    return this.PrevStep();
  }

  public cancel(): void {
    this.Closed.emit();
  }

  public OnBackdropClick(event: MouseEvent): void {
    if ((event.target as HTMLElement).classList.contains('ps-modal-backdrop')) {
      this.cancel();
    }
  }

  /** @deprecated Use {@link OnBackdropClick}. */
  public onBackdropClick(event: MouseEvent): void {
    return this.OnBackdropClick(event);
  }

  public async SaveDraft(): Promise<MJMLTrainingPipelineEntity | null> {
    return this.persistPipeline(false);
  }

  /** @deprecated Use {@link SaveDraft}. */
  public async saveDraft(): Promise<MJMLTrainingPipelineEntity | null> {
    return this.SaveDraft();
  }

  public async SaveAndTrain(): Promise<void> {
    const pipeline = await this.persistPipeline(true);
    if (!pipeline) return;
    this.TrainRequested.emit(pipeline);
  }

  /** @deprecated Use {@link SaveAndTrain}. */
  public async saveAndTrain(): Promise<void> {
    return this.SaveAndTrain();
  }

  private async persistPipeline(andTrain: boolean): Promise<MJMLTrainingPipelineEntity | null> {
    if (!this.CanSave()) {
      this.notifications.CreateSimpleNotification('Please complete required fields before saving.', 'warning', 3000);
      return null;
    }

    this.Busy = true;
    this.cdr.detectChanges();

    try {
      const prov = this.provider ?? Metadata.Provider;
      const p = await prov.GetEntityObject<MJMLTrainingPipelineEntity>('MJ: ML Training Pipelines', this.CurrentUser ?? undefined);
      p.NewRecord();
      p.Name = this.PipelineName.trim();
      p.Description = this.PipelineDescription.trim();
      p.Version = 1;
      p.Status = 'Draft';
      p.TargetEntityID = this.SelectedEntityId;
      p.TargetVariable = this.TargetVariable;
      p.ProblemType = this.ProblemType;
      p.AlgorithmID = this.SelectedAlgorithmId;

      // Source Bindings
      const sourceBindings: SourceBinding[] = [
        {
          Kind: 'Entity',
          Ref: this.SelectedEntity?.Name ?? this.SelectedEntityId,
          Alias: 'src_primary',
        },
      ];
      p.SourceBindings = JSON.stringify(sourceBindings);

      // Feature Steps
      const selectedColumns = this.FieldItems
        .filter((i) => i.selected && !i.isDenyList && !i.isTarget)
        .map((i) => i.field.Name);

      const steps: FeatureStep[] = [
        {
          Id: 'step_select',
          Kind: 'select',
          Label: 'Select Features',
          Inputs: ['src_primary'],
          Columns: selectedColumns,
        },
      ];

      if (this.CategoricalEncoding === 'onehot') {
        const catCols = this.FieldItems
          .filter((i) => i.selected && !i.isDenyList && !i.isTarget)
          .filter((i) => {
            const t = i.field.Type?.toLowerCase() ?? '';
            return t.includes('char') || t.includes('text') || t.includes('string');
          })
          .map((i) => i.field.Name);

        for (const c of catCols) {
          steps.push({
            Id: `step_onehot_${c}`,
            Kind: 'onehot',
            Label: `One-Hot ${c}`,
            Inputs: ['step_select'],
            Column: c,
          });
        }
      }

      if (this.StandardizeStrategy !== 'none') {
        const numCols = this.FieldItems
          .filter((i) => i.selected && !i.isDenyList && !i.isTarget)
          .filter((i) => {
            const t = i.field.Type?.toLowerCase() ?? '';
            return (
              t.includes('int') ||
              t.includes('decimal') ||
              t.includes('float') ||
              t.includes('money') ||
              t.includes('numeric')
            );
          })
          .map((i) => i.field.Name);

        if (numCols.length > 0) {
          steps.push({
            Id: 'step_standardize',
            Kind: 'standardize',
            Label: 'Standardize Numerics',
            Inputs: ['step_select'],
            Columns: numCols,
          });
        }
      }

      p.FeatureSteps = JSON.stringify({ Steps: steps });

      // As-Of Strategy
      const asOf: AsOfStrategy = {
        Mode: this.AsOfMode,
        ...(this.AsOfMode === 'column' ? { Column: this.AsOfColumn } : {}),
        ...(this.AsOfMode === 'offset' ? { OffsetDays: this.AsOfOffsetDays } : {}),
      };
      p.AsOfStrategy = JSON.stringify(asOf);

      // Leakage Guard
      const denyList = this.FieldItems.filter((i) => i.isDenyList).map((i) => i.field.Name);
      const leakageGuard: LeakageGuard = {
        DenyFields: denyList,
        SingleFeatureDominanceThreshold: this.DominanceThreshold,
      };
      p.LeakageGuard = JSON.stringify(leakageGuard);

      // Validation Strategy
      const valStrategy: ValidationStrategy = {
        Strategy: this.ValidationStrategyType,
        LockedHoldoutFraction: 0.15,
        ...(this.ValidationStrategyType === 'train_test_split' ? { TestSize: this.TestSplitRatio } : {}),
        ...(this.ValidationStrategyType === 'kfold' ? { K: this.KFolds } : {}),
      };
      p.ValidationStrategy = JSON.stringify(valStrategy);

      if (!(await p.Save())) {
        throw new Error(p.LatestResult?.CompleteMessage ?? 'Failed to save pipeline record.');
      }

      this.notifications.CreateSimpleNotification(
        `Training pipeline '${p.Name}' saved successfully.`,
        'success',
        3000
      );
      this.Saved.emit(p);
      return p;
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      this.notifications.CreateSimpleNotification(`Error saving pipeline: ${msg}`, 'error', 5000);
      return null;
    } finally {
      this.Busy = false;
      this.cdr.detectChanges();
    }
  }

  private initFromDefaults(): void {
    // If initial algorithm requested (e.g. from Catalog)
    if (this.InitialAlgorithmId) {
      this.SelectedAlgorithmId = this.InitialAlgorithmId;
    } else if (this.InitialAlgorithmName && (this.engine?.Algorithms.length ?? 0) > 0) {
      const match = this.engine!.Algorithms.find(
        (a) =>
          a.Name.toLowerCase() === this.InitialAlgorithmName!.toLowerCase() ||
          a.DriverClass?.toLowerCase() === this.InitialAlgorithmName!.toLowerCase()
      );
      if (match) this.SelectedAlgorithmId = match.ID;
    } else if ((this.engine?.Algorithms.length ?? 0) > 0) {
      this.SelectedAlgorithmId = this.engine!.Algorithms[0].ID;
    }

    // If cloning from existing pipeline
    if (this.CloneFromPipeline) {
      const cp = this.CloneFromPipeline;
      this.IsEditing = false; // clone creates new
      this.PipelineName = `${cp.Name} (Copy)`;
      this.PipelineDescription = cp.Description || '';
      this.SelectedEntityId = cp.TargetEntityID;
      this.TargetVariable = cp.TargetVariable;
      this.ProblemType = (cp.ProblemType as ProblemType) || 'classification';
      if (cp.AlgorithmID) this.SelectedAlgorithmId = cp.AlgorithmID;

      this.populateFieldItems();

      // Read leakage guard
      try {
        if (cp.LeakageGuard) {
          const lg = JSON.parse(cp.LeakageGuard) as Record<string, unknown>;
          const deny = (lg['DenyFields'] ?? lg['DenyList']) as string[] | undefined;
          if (Array.isArray(deny)) {
            const denySet = new Set(deny.map((d) => d.toLowerCase()));
            for (const item of this.FieldItems) {
              if (denySet.has(item.field.Name.toLowerCase())) {
                item.isDenyList = true;
                item.selected = false;
              }
            }
          }
          if (typeof lg['SingleFeatureDominanceThreshold'] === 'number') {
            this.DominanceThreshold = lg['SingleFeatureDominanceThreshold'];
          }
        }
      } catch {
        // Ignore
      }
    }
  }

  private populateFieldItems(): void {
    if (!this.SelectedEntity) {
      this.FieldItems = [];
      return;
    }
    const targetLower = (this.TargetVariable || '').toLowerCase();
    this.FieldItems = this.SelectedEntity.Fields.map((f) => {
      const nameLower = f.Name.toLowerCase();
      const isTarget = Boolean(targetLower && nameLower === targetLower);
      const isSystem =
        nameLower === 'id' ||
        nameLower.startsWith('__mj') ||
        nameLower.includes('created') ||
        nameLower.includes('updated');
      return {
        field: f,
        selected: !isTarget && !isSystem,
        isDenyList: false,
        isTarget,
      };
    });
  }
}
