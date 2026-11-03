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
  JsonParse,
  type JsonObject,
  type SourceBinding,
  type FeatureStep,
  type AsOfStrategy,
  type LeakageGuard,
  type ValidationStrategy,
  type ProblemType,
} from '@memberjunction/predictive-studio-core';
import { PredictiveStudioEngine } from '../engine/predictive-studio.engine';
import { PipelineWizardBindings, type BoundTargetRead, type WizardPipelineFields } from './ps-pipeline-wizard.bindings';

/** The wizard's tree hyperparameter inputs and the estimator keyword each one sets. */
const HYPERPARAMETER_INPUTS = { Estimators: 'n_estimators', MaxDepth: 'max_depth', LearningRate: 'learning_rate' } as const;

/** One of the wizard's hyperparameter inputs. */
type HyperparameterInput = keyof typeof HYPERPARAMETER_INPUTS;

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
    <div class="ps-modal-backdrop" (click)="OnBackdropClick($event)">
      <div class="ps-modal-dialog ps-wizard-dialog" role="dialog" aria-modal="true" data-testid="ps-pipeline-wizard">
        <!-- Header -->
        <div class="ps-wizard-header">
          <div class="ps-wizard-header-title">
            <i class="fa-solid fa-wand-magic-sparkles"></i>
            <div>
              <h2>{{ IsEditing ? 'Edit Training Pipeline' : 'New ML Training Pipeline' }}</h2>
              <span class="ps-wizard-subtitle">Step-by-step pipeline configuration with leakage guard</span>
            </div>
          </div>
          <button class="ps-wizard-close" (click)="cancel()" aria-label="Close wizard">
            <i class="fa-solid fa-xmark"></i>
          </button>
        </div>

        <!-- Step Indicator Strip -->
        <div class="ps-wizard-stepper">
          <button class="ps-step-tab" [class.active]="CurrentStep === 'goal'" [class.done]="IsStepDone('goal')" (click)="GoToStep('goal')">
            <span class="step-num">1</span>
            <span class="step-label">Goal & Target</span>
          </button>
          <div class="step-line"></div>
          <button class="ps-step-tab" [class.active]="CurrentStep === 'features'" [class.done]="IsStepDone('features')" (click)="GoToStep('features')">
            <span class="step-num">2</span>
            <span class="step-label">Features & Leakage</span>
          </button>
          <div class="step-line"></div>
          <button class="ps-step-tab" [class.active]="CurrentStep === 'preprocessing'" [class.done]="IsStepDone('preprocessing')" (click)="GoToStep('preprocessing')">
            <span class="step-num">3</span>
            <span class="step-label">Preprocessing</span>
          </button>
          <div class="step-line"></div>
          <button class="ps-step-tab" [class.active]="CurrentStep === 'algorithm'" [class.done]="IsStepDone('algorithm')" (click)="GoToStep('algorithm')">
            <span class="step-num">4</span>
            <span class="step-label">Algorithm & Split</span>
          </button>
        </div>

        <!-- Step Content Area -->
        <div class="ps-wizard-body">
          <!-- Step 1: Goal & Target -->
          @if (CurrentStep === 'goal') {
            <div class="ps-step-content" data-testid="ps-wizard-step-goal">
              <div class="ps-field">
                <label for="pipeline-name">Pipeline Name <span class="req">*</span></label>
                <input id="pipeline-name" class="mj-input" type="text" [(ngModel)]="PipelineName" placeholder="e.g. Member Renewal Risk v1" />
              </div>

              <div class="ps-field">
                <label for="pipeline-desc">Description</label>
                <textarea id="pipeline-desc" class="mj-textarea" rows="2" [(ngModel)]="PipelineDescription" placeholder="Predicts whether active members will renew before their period ends."></textarea>
              </div>

              <div class="ps-grid-2">
                <div class="ps-field">
                  <label for="target-entity">Target Entity <span class="req">*</span></label>
                  <select id="target-entity" class="mj-input" [ngModel]="SelectedEntityId" (ngModelChange)="OnEntitySelected($event)">
                    <option [value]="''" disabled>-- Select Entity --</option>
                    @for (ent of AvailableEntities; track ent.ID) {
                      <option [value]="ent.ID">{{ ent.Name }} ({{ ent.BaseView || ent.BaseTable }})</option>
                    }
                  </select>
                </div>

                <div class="ps-field">
                  <label for="target-variable">Target Variable (Label Column) <span class="req">*</span></label>
                  <select id="target-variable" class="mj-input" [ngModel]="TargetVariable" (ngModelChange)="OnTargetVariableChanged($event)" [disabled]="!SelectedEntity">
                    <option [value]="''" disabled>-- Select Label Field --</option>
                    @for (f of AvailableFields; track f.Name) {
                      <option [value]="f.Name">{{ f.Name }} ({{ f.Type }})</option>
                    }
                  </select>
                </div>
              </div>

              <div class="ps-grid-2">
                <div class="ps-field">
                  <label for="problem-type">Problem Type</label>
                  <select id="problem-type" class="mj-input" [(ngModel)]="ProblemType" (ngModelChange)="OnProblemTypeChange()">
                    <option value="classification">Classification (Predict Categorical / Binary Outcome)</option>
                    <option value="regression">Regression (Predict Numeric Continuous Value)</option>
                  </select>
                </div>

                <div class="ps-field">
                  <label>Primary score</label>
                  <p class="ps-muted ps-small" data-testid="ps-wizard-metric-note">The pipeline's Evaluation Protocol names the score its runs are ranked and gated on.</p>
                </div>
              </div>

              @if (AdverseClassChoices.length > 0) {
                <div class="ps-field" data-testid="ps-wizard-adverse-class">
                  <label for="adverse-class">Adverse outcome class <span class="req">*</span></label>
                  <select id="adverse-class" class="mj-input" [(ngModel)]="AdverseClass">
                    <option [value]="''" disabled>-- Which class is the outcome to act on? --</option>
                    @for (c of AdverseClassChoices; track c) {
                      <option [value]="c">{{ c }}</option>
                    }
                  </select>
                  <span class="ps-muted ps-small">The target's name does not say which of its two classes is the adverse one (the outcome the model flags as risk).</span>
                </div>
              }

              <div class="ps-card as-of-box">
                <div class="ps-card-head">
                  <i class="fa-solid fa-clock-rotate-left"></i>
                  <h4>Point-in-Time Cutoff (Temporal Leakage Guard)</h4>
                </div>
                <div class="ps-card-body">
                  <p class="ps-muted">
                    Not available yet. Training reads every feature as it stands today, so a cutoff date would have no
                    effect, and a pipeline that sets one is refused at training. This pipeline is built without a cutoff.
                  </p>
                </div>
              </div>
            </div>
          }

          <!-- Step 2: Feature Selection & Leakage Guard -->
          @if (CurrentStep === 'features') {
            <div class="ps-step-content" data-testid="ps-wizard-step-features">
              <div class="feat-toolbar">
                <div class="feat-search">
                  <i class="fa-solid fa-magnifying-glass"></i>
                  <input class="mj-input" type="text" [(ngModel)]="FieldSearchFilter" placeholder="Filter fields by name or type…" />
                </div>
                <div class="feat-actions">
                  <button mjButton variant="secondary" size="sm" (click)="SelectAllFields(true)">Select All</button>
                  <button mjButton variant="secondary" size="sm" (click)="SelectAllFields(false)">Deselect All</button>
                  <button mjButton variant="secondary" size="sm" (click)="ExcludeAuditFields()">Exclude IDs & Timestamps</button>
                </div>
              </div>

              <div class="feat-stats">
                <span>Selected: <strong>{{ SelectedFeaturesCount }}</strong> features</span>
                <span>Leakage Deny-List: <strong class="text-danger">{{ DenyListCount }}</strong> excluded fields</span>
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
                    @for (item of FilteredFieldItems; track item.field.Name) {
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
                            <button class="ps-deny-toggle" [class.denied]="item.isDenyList" (click)="ToggleDenyList(item)" title="Add to leakage deny-list">
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
                <label>Single-Feature Dominance Threshold: <strong>{{ DominanceThreshold | percent }}</strong></label>
                <div class="slider-row">
                  <input type="range" min="0.5" max="0.99" step="0.01" [(ngModel)]="DominanceThreshold" />
                  <span class="ps-muted ps-small">Warns and holds model if any single feature accounts for > {{ DominanceThreshold | percent }} of total importance.</span>
                </div>
              </div>
            </div>
          }

          <!-- Step 3: Preprocessing Recipe -->
          @if (CurrentStep === 'preprocessing') {
            <div class="ps-step-content" data-testid="ps-wizard-step-preprocessing">
              <div class="recipe-card">
                <div class="recipe-icon"><i class="fa-solid fa-table-cells"></i></div>
                <div class="recipe-details">
                  <h4>Encoding and Scaling</h4>
                  <p class="ps-small ps-muted" data-testid="ps-wizard-encoding-note">Every time it trains, the trainer standardizes each numeric column (mean 0, variance 1) and one-hot encodes each text column, with its own "missing" level. Neither is a choice.</p>
                </div>
              </div>

              <div class="recipe-card">
                <div class="recipe-icon"><i class="fa-solid fa-fill-drip"></i></div>
                <div class="recipe-details">
                  <h4>Missing Value Imputation</h4>
                  <p class="ps-small ps-muted">Strategy for filling null or missing entries in numeric columns. Text columns always get their own "missing" category.</p>
                  <select class="mj-input" [(ngModel)]="ImputeStrategy">
                    <option value="median">Median (Robust against numeric outliers)</option>
                    <option value="mean">Mean (Standard arithmetic average)</option>
                    <option value="mode">Mode (Most frequent value)</option>
                    <option value="constant">Constant (Zero)</option>
                  </select>
                </div>
              </div>
            </div>
          }

          <!-- Step 4: Algorithm & Validation Split -->
          @if (CurrentStep === 'algorithm') {
            <div class="ps-step-content" data-testid="ps-wizard-step-algorithm">
              <div class="ps-field">
                <label for="algorithm-select">Algorithm <span class="req">*</span></label>
                <select id="algorithm-select" class="mj-input" [ngModel]="SelectedAlgorithmId" (ngModelChange)="OnAlgorithmSelected($event)">
                  @for (a of AvailableAlgorithms; track a.ID) {
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
                  @if (AlgorithmTakesAnyHyperparameterInput) {
                    <div class="ps-grid-3">
                      @if (AlgorithmTakes('Estimators')) {
                        <div class="ps-field">
                          <label for="hp-estimators">Estimators (Trees)</label>
                          <input id="hp-estimators" class="mj-input" type="number" min="10" max="1000" step="10" [(ngModel)]="HyperparamEstimators" />
                        </div>
                      }
                      @if (AlgorithmTakes('MaxDepth')) {
                        <div class="ps-field">
                          <label for="hp-max-depth">Max Depth</label>
                          <input id="hp-max-depth" class="mj-input" type="number" min="1" max="20" [(ngModel)]="HyperparamMaxDepth" />
                        </div>
                      }
                      @if (AlgorithmTakes('LearningRate')) {
                        <div class="ps-field">
                          <label for="hp-learning-rate">Learning Rate</label>
                          <input id="hp-learning-rate" class="mj-input" type="number" min="0.001" max="1" step="0.01" [(ngModel)]="HyperparamLearningRate" />
                        </div>
                      }
                    </div>
                  } @else {
                    <p class="ps-muted ps-small">This algorithm takes none of these settings; it trains with its catalog defaults.</p>
                  }
                </div>
              </div>

              <!-- Evaluation: the Evaluation Protocol the save binds; only its inner cross-validation is chosen here -->
              <div class="ps-card" data-testid="ps-wizard-validation">
                <div class="ps-card-head">
                  <i class="fa-solid fa-scissors"></i>
                  <h4>Evaluation</h4>
                </div>
                <div class="ps-card-body">
                  <p class="ps-muted ps-small" data-testid="ps-wizard-protocol-note">
                    Evaluation follows the Evaluation Protocol "{{ BoundProtocolName }}", version 1, which saving binds this pipeline to:
                    it sets the held-back test rows, the score runs are ranked on and the gate. Here you choose only its inner cross-validation.
                  </p>
                  <div class="ps-grid-2">
                    <div class="ps-field">
                      <label>Inner cross-validation</label>
                      <select class="mj-input" [(ngModel)]="ValidationStrategyType">
                        <option value="train_test_split">Protocol default (5 folds, 3 repeats)</option>
                        <option value="kfold">K folds (3 repeats)</option>
                      </select>
                    </div>

                    @if (ValidationStrategyType === 'kfold') {
                      <div class="ps-field">
                        <label>Number of Folds (K)</label>
                        <input class="mj-input" type="number" min="2" max="10" [(ngModel)]="KFolds" />
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

          @if (CurrentStep !== 'goal') {
            <button mjButton variant="secondary" size="sm" (click)="PrevStep()">
              <i class="fa-solid fa-arrow-left"></i> Back
            </button>
          }

          @if (CurrentStep !== 'algorithm') {
            <button mjButton variant="primary" size="sm" (click)="NextStep()" [disabled]="!CanProceed()">
              Next <i class="fa-solid fa-arrow-right"></i>
            </button>
          } @else {
            <button mjButton variant="secondary" size="sm" (click)="SaveDraft()" [disabled]="Busy || !CanSave()">
              <i class="fa-solid fa-floppy-disk"></i> Save Draft
            </button>
            <button mjButton variant="primary" size="sm" (click)="SaveAndTrain()" [disabled]="Busy || !CanSave()">
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

  @Input() engine: PredictiveStudioEngine | null = null;
  @Input() InitialAlgorithmName?: string;

  @Input() InitialAlgorithmId?: string;

  @Input() CloneFromPipeline?: MJMLTrainingPipelineEntity;

  @Input() set CloneFrom(p: MJMLTrainingPipelineEntity | null | undefined) {
    this.CloneFromPipeline = p ?? undefined;
  }

  @Output() Closed = new EventEmitter<void>();

  @Output() Saved = new EventEmitter<MJMLTrainingPipelineEntity>();

  @Output() TrainRequested = new EventEmitter<MJMLTrainingPipelineEntity>();

  private readonly cdr = inject(ChangeDetectorRef);
  private readonly notifications = inject(MJNotificationService);

  public CurrentStep: WizardStep = 'goal';

  public Busy = false;

  public IsEditing = false;


  // Step 1: Goal & Target
  public PipelineName = '';

  public PipelineDescription = '';

  public SelectedEntityId = '';

  public TargetVariable = '';

  public ProblemType: ProblemType = 'classification';

  /** The two classes of a target whose adverse class nothing declares; empty when the user need not choose. */
  public AdverseClassChoices: readonly string[] = [];

  /** The class the user chose as the adverse outcome; empty until chosen. */
  public AdverseClass = '';

  /** A cloned pipeline's adverse class with the entity and target it was saved for; applied only to a read of that same target. */
  private clonedAdverse: { Entity: string; Target: string; Class: string } | null = null;

  /** Bumped per label read, so a slower earlier read cannot overwrite the choices for a newer target. */
  private labelReadSeq = 0;


  // Step 2: Features
  public FieldItems: FieldSelectionItem[] = [];

  public FieldSearchFilter = '';

  public DominanceThreshold = DOMINANCE_THRESHOLD_DEFAULT;


  // Step 3: Preprocessing
  public ImputeStrategy: 'mean' | 'median' | 'mode' | 'constant' = 'median';


  // Step 4: Algorithm & Validation
  public SelectedAlgorithmId = '';

  public HyperparamEstimators = 100;

  public HyperparamMaxDepth = 6;

  public HyperparamLearningRate = 0.1;

  public ValidationStrategyType: 'train_test_split' | 'kfold' = 'train_test_split';


  public KFolds = 5;


  public ngOnInit(): void {
    this.initFromDefaults();
  }

  public get AvailableEntities(): EntityInfo[] {
    if (!this.provider) return [];
    return this.provider.Entities.filter((e) => !e.VirtualEntity && e.AllowUserSearchAPI)
      .sort((a, b) => a.Name.localeCompare(b.Name));
  }

  public get SelectedEntity(): EntityInfo | null {
    if (!this.SelectedEntityId || !this.provider) return null;
    return this.provider.Entities.find((e) => UUIDsEqual(e.ID, this.SelectedEntityId)) ?? null;
  }

  public get AvailableFields(): EntityFieldInfo[] {
    return this.SelectedEntity?.Fields ?? [];
  }

  /** The name of the Evaluation Protocol saving binds the pipeline to (PipelineWizardBindings writes version 1 under it). */
  public get BoundProtocolName(): string {
    return PipelineWizardBindings.ProtocolNameFor(this.PipelineName.trim() || 'this pipeline');
  }

  public get AvailableAlgorithms(): MJMLAlgorithmEntity[] {
    return this.engine?.Algorithms ?? [];
  }

  public get FilteredFieldItems(): FieldSelectionItem[] {
    const q = this.FieldSearchFilter.trim().toLowerCase();
    if (!q) return this.FieldItems;
    return this.FieldItems.filter((item) => item.field.Name.toLowerCase().includes(q) || item.field.Type?.toLowerCase().includes(q));
  }

  /** The selected algorithm's hyperparameter keywords: its schema's properties, else its default hyperparameters' keys. */
  public get AlgorithmHyperparameterKeys(): readonly string[] {
    const algo = this.AvailableAlgorithms.find((a) => UUIDsEqual(a.ID, this.SelectedAlgorithmId));
    if (!algo) return [];
    const schema = this.jsonObject(algo.HyperparameterSchema);
    const properties = schema === null ? null : JsonParse.JsonObjectField(schema, 'properties');
    if (properties !== null) return Object.keys(properties);
    return Object.keys(this.jsonObject(algo.DefaultHyperparameters) || {});
  }

  /** Whether the selected algorithm takes the keyword one of the wizard's hyperparameter inputs sets. */
  public AlgorithmTakes(input: HyperparameterInput): boolean {
    return this.AlgorithmHyperparameterKeys.includes(HYPERPARAMETER_INPUTS[input]);
  }

  public get AlgorithmTakesAnyHyperparameterInput(): boolean {
    return (Object.keys(HYPERPARAMETER_INPUTS) as HyperparameterInput[]).some((k) => this.AlgorithmTakes(k));
  }

  /** The hyperparameters the pipeline saves: the inputs the selected algorithm takes, by its keyword. */
  public get SelectedHyperparameters(): Record<string, number> {
    const values: Record<HyperparameterInput, number> = {
      Estimators: this.HyperparamEstimators, MaxDepth: this.HyperparamMaxDepth, LearningRate: this.HyperparamLearningRate,
    };
    const out: Record<string, number> = {};
    for (const input of Object.keys(HYPERPARAMETER_INPUTS) as HyperparameterInput[]) {
      if (this.AlgorithmTakes(input)) out[HYPERPARAMETER_INPUTS[input]] = values[input];
    }
    return out;
  }

  public get SelectedFeaturesCount(): number {
    return this.FieldItems.filter((i) => i.selected && !i.isDenyList && !i.isTarget).length;
  }

  public get DenyListCount(): number {
    return this.FieldItems.filter((i) => i.isDenyList).length;
  }

  /** A new entity clears the target, so the target's adverse-class choice goes with it (and any read still in flight). */
  public OnEntitySelected(entityId: string): void {
    this.clonedAdverse = null;
    this.SelectedEntityId = entityId;
    this.TargetVariable = '';
    this.populateFieldItems();
    void this.refreshAdverseClassChoices();
    this.cdr.detectChanges();
  }

  public OnProblemTypeChange(): void {
    void this.refreshAdverseClassChoices();
    this.cdr.detectChanges();
  }

  /** The target column is the label, never a feature: it is marked, unchecked and locked; the previous target is freed. */
  public OnTargetVariableChanged(name: string): void {
    this.clonedAdverse = null;
    this.markTarget(name);
    void this.refreshAdverseClassChoices();
    this.cdr.detectChanges();
  }

  /** Makes `name` the target: marked, unchecked and locked; the previous target is selected again unless denied. */
  private markTarget(name: string): void {
    this.TargetVariable = name;
    const target = name.toLowerCase();
    for (const item of this.FieldItems) {
      const isTarget = item.field.Name.toLowerCase() === target;
      if (isTarget) item.selected = false;
      else if (item.isTarget) item.selected = !item.isDenyList && !this.isSystemField(item.field.Name);
      item.isTarget = isTarget;
    }
  }

  /** Reads the target's class labels and offers the adverse-class choice when nothing else decides it. */
  private async refreshAdverseClassChoices(): Promise<void> {
    const seq = ++this.labelReadSeq;
    const fields = this.wizardFields();
    let choices: readonly string[] = [];
    if (fields !== null && fields.ProblemType === 'classification') {
      try {
        const labels = await PipelineWizardBindings.ReadClassLabels(fields, this.providerToUse, this.CurrentUser || undefined);
        choices = PipelineWizardBindings.AdverseClassChoices(fields, labels);
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        this.notifications.CreateSimpleNotification(`Could not read the target's classes: ${msg}`, 'error', 5000);
      }
    }
    if (seq !== this.labelReadSeq) return;
    this.AdverseClassChoices = choices;
    const cloned = this.clonedAdverse;
    const forThisTarget = cloned !== null && fields !== null && cloned.Entity === fields.TargetEntity && cloned.Target.toLowerCase() === fields.TargetVariable.toLowerCase();
    if (forThisTarget) this.clonedAdverse = null;
    if (!choices.includes(this.AdverseClass)) this.AdverseClass = forThisTarget && choices.includes(cloned.Class) ? cloned.Class : '';
    this.cdr.detectChanges();
  }

  /** The pipeline fields the label read and the adverse-class rule take; null until an entity and a target are chosen. */
  private wizardFields(): WizardPipelineFields | null {
    const entity = this.SelectedEntity;
    if (!entity || !this.TargetVariable) return null;
    return {
      Name: this.PipelineName, TargetVariable: this.TargetVariable, ProblemType: this.ProblemType, AsOfStrategy: null,
      ValidationStrategy: null, LeakageGuard: null, FeatureSteps: null, Hyperparameters: null, TargetEntity: entity.Name,
    };
  }

  /** The bound provider, else the global one. `??` (not `||`): the provider-fallback form the multi-provider guard accepts. */
  private get providerToUse(): IMetadataProvider {
    return this.provider ?? Metadata.Provider;
  }

  /** A JSON object column's value, or null when it is empty or not an object. */
  private jsonObject(json: string | null): JsonObject | null {
    const parsed = JsonParse.ParseJsonText(json, 'wizard JSON');
    return parsed.Ok && JsonParse.IsJsonObject(parsed.Value) ? parsed.Value : null;
  }

  public OnAlgorithmSelected(algoId: string): void {
    this.SelectedAlgorithmId = algoId;
    this.cdr.detectChanges();
  }

  public ToggleDenyList(item: FieldSelectionItem): void {
    item.isDenyList = !item.isDenyList;
    if (item.isDenyList) {
      item.selected = false;
    }
    this.cdr.detectChanges();
  }

  public SelectAllFields(val: boolean): void {
    for (const item of this.FieldItems) {
      if (!item.isTarget && !item.isDenyList) {
        item.selected = val;
      }
    }
    this.cdr.detectChanges();
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

  public IsStepDone(step: WizardStep): boolean {
    switch (step) {
      case 'goal':
        return Boolean(this.PipelineName.trim() && this.SelectedEntityId && this.TargetVariable) && this.AdverseClassDecided;
      case 'features':
        return this.SelectedFeaturesCount > 0;
      case 'preprocessing':
        return true;
      case 'algorithm':
        return Boolean(this.SelectedAlgorithmId);
    }
  }

  public CanProceed(): boolean {
    return this.IsStepDone(this.CurrentStep);
  }

  public CanSave(): boolean {
    return (
      Boolean(this.PipelineName.trim()) &&
      Boolean(this.SelectedEntityId) &&
      Boolean(this.TargetVariable) &&
      Boolean(this.SelectedAlgorithmId) &&
      this.SelectedFeaturesCount > 0 &&
      this.AdverseClassDecided
    );
  }

  /** True unless the target needs an adverse-class choice the user has not made. */
  public get AdverseClassDecided(): boolean {
    return this.AdverseClassChoices.length === 0 || this.AdverseClassChoices.includes(this.AdverseClass);
  }

  public GoToStep(step: WizardStep): void {
    this.CurrentStep = step;
    this.cdr.detectChanges();
  }

  public NextStep(): void {
    if (this.CurrentStep === 'goal') this.CurrentStep = 'features';
    else if (this.CurrentStep === 'features') this.CurrentStep = 'preprocessing';
    else if (this.CurrentStep === 'preprocessing') this.CurrentStep = 'algorithm';
    this.cdr.detectChanges();
  }

  public PrevStep(): void {
    if (this.CurrentStep === 'algorithm') this.CurrentStep = 'preprocessing';
    else if (this.CurrentStep === 'preprocessing') this.CurrentStep = 'features';
    else if (this.CurrentStep === 'features') this.CurrentStep = 'goal';
    this.cdr.detectChanges();
  }

  public cancel(): void {
    this.Closed.emit();
  }

  public OnBackdropClick(event: MouseEvent): void {
    if ((event.target as HTMLElement).classList.contains('ps-modal-backdrop')) {
      this.cancel();
    }
  }

  public async SaveDraft(): Promise<MJMLTrainingPipelineEntity | null> {
    return this.persistPipeline(false);
  }

  public async SaveAndTrain(): Promise<void> {
    const pipeline = await this.persistPipeline(true);
    if (!pipeline) return;
    this.TrainRequested.emit(pipeline);
  }

  private async persistPipeline(andTrain: boolean): Promise<MJMLTrainingPipelineEntity | null> {
    if (!this.CanSave()) {
      this.notifications.CreateSimpleNotification('Please complete required fields before saving.', 'warning', 3000);
      return null;
    }

    this.Busy = true;
    this.cdr.detectChanges();

    try {
      const prov = this.providerToUse;
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

      // A text column's missing values always encode as their own level in the trainer, so only numeric columns take a policy.
      for (const c of this.selectedNumericColumns()) {
        steps.push({
          Id: `step_impute_${c}`,
          Kind: 'impute',
          Label: `Impute ${c}`,
          Inputs: ['step_select'],
          Column: c,
          Strategy: this.ImputeStrategy,
          ...(this.ImputeStrategy === 'constant' ? { FillValue: 0 } : {}),
        });
      }

      // No onehot or standardize step: the trainer one-hot encodes every text column and standardizes every numeric
      // column regardless (as-of-assembler.ts BuildPreprocessingOps, Sidecar encoding.py), so such a step changes nothing.

      p.FeatureSteps = JSON.stringify(
        this.AdverseClassChoices.length > 0
          ? { Steps: steps, OutcomeConfig: PipelineWizardBindings.AdverseClassOutcomeConfig(this.AdverseClass, this.AdverseClassChoices) }
          : { Steps: steps },
      );
      const hyperparameters = this.SelectedHyperparameters;
      p.Hyperparameters = Object.keys(hyperparameters).length > 0 ? JSON.stringify(hyperparameters) : null;

      // As-Of Strategy
      const asOf: AsOfStrategy = { Mode: 'none' };
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
        ...(this.ValidationStrategyType === 'kfold' ? { K: this.KFolds } : {}),
      };
      p.ValidationStrategy = JSON.stringify(valStrategy);

      // Saved already bound to version 1 of its Prediction Unit and Evaluation Protocol: a pipeline without them cannot train.
      const saved = await PipelineWizardBindings.SaveWithBindings(p, this.SelectedEntity?.Name || '', prov, this.CurrentUser || undefined);
      if (saved.Ok === false) {
        throw new Error(saved.Reason);
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

    if (this.CloneFromPipeline) this.initFromClone(this.CloneFromPipeline);
  }

  /**
   * Opens the wizard on a copy of a saved pipeline. A pipeline bound to a Prediction Unit stores the unit's rule text
   * in `TargetVariable` (the bindings' `bind()`), so its target column is read back from the unit; every other
   * setting is restored at once.
   */
  private initFromClone(cp: MJMLTrainingPipelineEntity): void {
    this.IsEditing = false; // clone creates new
    this.PipelineName = `${cp.Name} (Copy)`;
    this.PipelineDescription = cp.Description || '';
    this.SelectedEntityId = cp.TargetEntityID;
    this.TargetVariable = cp.PredictionUnitID ? '' : cp.TargetVariable;
    this.ProblemType = (cp.ProblemType as ProblemType) || 'classification';
    if (cp.AlgorithmID) this.SelectedAlgorithmId = cp.AlgorithmID;

    this.populateFieldItems();
    this.readClonedHyperparameters(cp.Hyperparameters);
    this.restoreClonedFeatureSteps(cp.FeatureSteps);
    this.restoreClonedValidation(cp.ValidationStrategy);
    this.restoreClonedLeakageGuard(cp.LeakageGuard);
    const clonedClass = PipelineWizardBindings.AdverseClassFromFeatureSteps(cp.FeatureSteps);
    if (cp.PredictionUnitID) {
      void this.restoreBoundTarget(cp.PredictionUnitID, clonedClass);
      return;
    }
    this.clonedAdverse = clonedClass === '' ? null : { Entity: this.SelectedEntity?.Name ?? '', Target: cp.TargetVariable, Class: clonedClass };
    void this.refreshAdverseClassChoices();
  }

  /**
   * Restores a bound clone's target from its unit's label rule, then its adverse class against that column. A rule
   * that names no column of the entity leaves the target unset, with a note naming why. A target or entity the user
   * picked while the unit was read wins.
   */
  private async restoreBoundTarget(unitId: string, clonedClass: string): Promise<void> {
    const entityId = this.SelectedEntityId;
    const read = await this.readBoundTarget(unitId);
    if (this.TargetVariable !== '' || !UUIDsEqual(this.SelectedEntityId, entityId)) return;
    const field = read.Ok ? this.AvailableFields.find((f) => f.Name.toLowerCase() === read.Column.toLowerCase()) : undefined;
    if (field === undefined) {
      const reason = read.Ok ? `its Prediction Unit reads the column "${read.Column}", which ${this.SelectedEntity?.Name || 'the entity'} does not have` : read.Reason;
      this.notifications.CreateSimpleNotification(`The copy's target column could not be restored: ${reason}. Choose the target in step 1.`, 'warning', 6000);
      this.cdr.detectChanges();
      return;
    }
    this.markTarget(field.Name);
    this.clonedAdverse = clonedClass === '' ? null : { Entity: this.SelectedEntity?.Name ?? '', Target: field.Name, Class: clonedClass };
    void this.refreshAdverseClassChoices();
    this.cdr.detectChanges();
  }

  /** The bound unit's target column; a read that throws becomes its reason. */
  private async readBoundTarget(unitId: string): Promise<BoundTargetRead> {
    try {
      return await PipelineWizardBindings.ReadBoundTargetColumn(unitId, this.providerToUse, this.CurrentUser || undefined);
    } catch (err) {
      return { Ok: false, Reason: `reading its Prediction Unit failed: ${err instanceof Error ? err.message : String(err)}` };
    }
  }

  /** The cloned pipeline's leakage deny-list and dominance threshold; unreadable JSON leaves the defaults. */
  private restoreClonedLeakageGuard(json: string | null): void {
    const lg = this.jsonObject(json);
    if (lg === null) return;
    const deny = JsonParse.JsonStringArray(lg, 'DenyFields') ?? JsonParse.JsonStringArray(lg, 'DenyList');
    if (deny !== null) {
      const denySet = new Set(deny.map((d) => d.toLowerCase()));
      for (const item of this.FieldItems) {
        if (denySet.has(item.field.Name.toLowerCase())) {
          item.isDenyList = true;
          item.selected = false;
        }
      }
    }
    const threshold = lg['SingleFeatureDominanceThreshold'];
    if (typeof threshold === 'number') this.DominanceThreshold = threshold;
  }

  /** The selected feature columns the trainer treats as numeric. */
  private selectedNumericColumns(): string[] {
    return this.FieldItems
      .filter((i) => i.selected && !i.isDenyList && !i.isTarget)
      .filter((i) => {
        const t = i.field.Type?.toLowerCase() ?? '';
        return t.includes('int') || t.includes('decimal') || t.includes('float') || t.includes('money') || t.includes('numeric');
      })
      .map((i) => i.field.Name);
  }

  /**
   * The cloned pipeline's saved feature columns and imputation strategy (the one preprocessing choice the trainer
   * honours). Unreadable JSON, or a graph without a select step, leaves every default; every other step is ignored.
   */
  private restoreClonedFeatureSteps(json: string | null): void {
    const graph = this.jsonObject(json);
    const steps = graph === null ? null : JsonParse.JsonArrayField(graph, 'Steps');
    if (steps === null) return;
    const objects = steps.filter((st): st is JsonObject => JsonParse.IsJsonObject(st));
    const kind = (st: JsonObject): string | null => JsonParse.JsonString(st, 'Kind');

    const select = objects.find((st) => kind(st) === 'select');
    const columns = select === undefined ? null : JsonParse.JsonStringArray(select, 'Columns');
    if (columns !== null) {
      const chosen = new Set(columns.map((c) => c.toLowerCase()));
      for (const item of this.FieldItems) {
        if (!item.isTarget) item.selected = chosen.has(item.field.Name.toLowerCase());
      }
    }

    const impute = objects.find((st) => kind(st) === 'impute');
    const strategy = impute === undefined ? null : JsonParse.JsonString(impute, 'Strategy');
    if (strategy === 'mean' || strategy === 'median' || strategy === 'mode' || strategy === 'constant') this.ImputeStrategy = strategy;
  }

  /**
   * The cloned pipeline's saved inner-validation choice (Strategy, and K for k-fold: the fields the protocol mapping
   * reads, LegacyPipelines.innerValidation); unreadable JSON leaves the defaults.
   */
  private restoreClonedValidation(json: string | null): void {
    const saved = this.jsonObject(json);
    if (saved === null) return;
    const strategy = JsonParse.JsonString(saved, 'Strategy');
    if (strategy === 'train_test_split' || strategy === 'kfold') this.ValidationStrategyType = strategy;
    const k = JsonParse.JsonInteger(saved, 'K');
    if (k !== null) this.KFolds = k;
  }

  /** The cloned pipeline's saved values for the wizard's hyperparameter inputs. */
  private readClonedHyperparameters(json: string | null): void {
    const saved = this.jsonObject(json);
    if (saved === null) return;
    const read = (key: string, fallback: number): number => {
      const v = saved[key];
      return typeof v === 'number' && Number.isFinite(v) ? v : fallback;
    };
    this.HyperparamEstimators = read(HYPERPARAMETER_INPUTS.Estimators, this.HyperparamEstimators);
    this.HyperparamMaxDepth = read(HYPERPARAMETER_INPUTS.MaxDepth, this.HyperparamMaxDepth);
    this.HyperparamLearningRate = read(HYPERPARAMETER_INPUTS.LearningRate, this.HyperparamLearningRate);
  }

  private isSystemField(name: string): boolean {
    const n = name.toLowerCase();
    return n === 'id' || n.startsWith('__mj') || n.includes('created') || n.includes('updated');
  }

  private populateFieldItems(): void {
    if (!this.SelectedEntity) {
      this.FieldItems = [];
      return;
    }
    const targetLower = (this.TargetVariable || '').toLowerCase();
    this.FieldItems = this.SelectedEntity.Fields.map((f) => {
      const isTarget = Boolean(targetLower && f.Name.toLowerCase() === targetLower);
      const isSystem = this.isSystemField(f.Name);
      return {
        field: f,
        selected: !isTarget && !isSystem,
        isDenyList: false,
        isTarget,
      };
    });
  }
}
