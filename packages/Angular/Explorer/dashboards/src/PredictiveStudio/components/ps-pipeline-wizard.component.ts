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
  field: EntityFieldInfo;
  selected: boolean;
  isDenyList: boolean;
  isTarget: boolean;
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
  @Input() currentUser: UserInfo | null = null;
  @Input() engine: PredictiveStudioEngine | null = null;
  @Input() initialAlgorithmName?: string;
  @Input() initialAlgorithmId?: string;
  @Input() cloneFromPipeline?: MJMLTrainingPipelineEntity;
  @Input() set cloneFrom(p: MJMLTrainingPipelineEntity | null | undefined) {
    this.cloneFromPipeline = p ?? undefined;
  }

  @Output() closed = new EventEmitter<void>();
  @Output() saved = new EventEmitter<MJMLTrainingPipelineEntity>();
  @Output() trainRequested = new EventEmitter<MJMLTrainingPipelineEntity>();

  private readonly cdr = inject(ChangeDetectorRef);
  private readonly notifications = inject(MJNotificationService);

  public currentStep: WizardStep = 'goal';
  public busy = false;
  public isEditing = false;

  // Step 1: Goal & Target
  public pipelineName = '';
  public pipelineDescription = '';
  public selectedEntityId = '';
  public targetVariable = '';
  public problemType: ProblemType = 'classification';
  public evaluationMetric = 'AUC';
  public asOfMode: 'none' | 'column' | 'offset' = 'none';
  public asOfColumn = '';
  public asOfOffsetDays = 30;

  // Step 2: Features
  public fieldItems: FieldSelectionItem[] = [];
  public fieldSearchFilter = '';
  public dominanceThreshold = DOMINANCE_THRESHOLD_DEFAULT;

  // Step 3: Preprocessing
  public categoricalEncoding: 'onehot' | 'none' = 'onehot';
  public imputeStrategy: 'mean' | 'median' | 'mode' | 'constant' = 'median';
  public standardizeStrategy: 'standard' | 'minmax' | 'none' = 'standard';

  // Step 4: Algorithm & Validation
  public selectedAlgorithmId = '';
  public hyperparamEstimators = 100;
  public hyperparamMaxDepth = 6;
  public hyperparamLearningRate = 0.1;
  public validationStrategyType: 'train_test_split' | 'kfold' = 'train_test_split';
  public testSplitRatio = 0.2;
  public kFolds = 5;

  public ngOnInit(): void {
    this.initFromDefaults();
  }

  public get availableEntities(): EntityInfo[] {
    if (!this.provider) return [];
    return this.provider.Entities.filter((e) => !e.VirtualEntity && e.AllowUserSearchAPI)
      .sort((a, b) => a.Name.localeCompare(b.Name));
  }

  public get selectedEntity(): EntityInfo | null {
    if (!this.selectedEntityId || !this.provider) return null;
    return this.provider.Entities.find((e) => e.ID === this.selectedEntityId) ?? null;
  }

  public get availableFields(): EntityFieldInfo[] {
    return this.selectedEntity?.Fields ?? [];
  }

  public get dateFields(): EntityFieldInfo[] {
    return this.availableFields.filter((f) => f.Type?.toLowerCase().includes('date') || f.Type?.toLowerCase().includes('time'));
  }

  public get availableMetrics(): string[] {
    if (this.problemType === 'classification') {
      return ['AUC', 'Accuracy', 'F1', 'Log Loss', 'Precision', 'Recall'];
    }
    return ['RMSE', 'MAE', 'R2', 'MSE'];
  }

  public get availableAlgorithms(): MJMLAlgorithmEntity[] {
    return this.engine?.Algorithms ?? [];
  }

  public get filteredFieldItems(): FieldSelectionItem[] {
    const q = this.fieldSearchFilter.trim().toLowerCase();
    if (!q) return this.fieldItems;
    return this.fieldItems.filter((item) => item.field.Name.toLowerCase().includes(q) || item.field.Type?.toLowerCase().includes(q));
  }

  public get selectedFeaturesCount(): number {
    return this.fieldItems.filter((i) => i.selected && !i.isDenyList && !i.isTarget).length;
  }

  public get denyListCount(): number {
    return this.fieldItems.filter((i) => i.isDenyList).length;
  }

  public onEntitySelected(entityId: string): void {
    this.selectedEntityId = entityId;
    this.targetVariable = '';
    this.populateFieldItems();
    this.cdr.detectChanges();
  }

  public onProblemTypeChange(): void {
    this.evaluationMetric = this.problemType === 'classification' ? 'AUC' : 'RMSE';
    this.cdr.detectChanges();
  }

  public onAlgorithmSelected(algoId: string): void {
    this.selectedAlgorithmId = algoId;
    this.cdr.detectChanges();
  }

  public toggleDenyList(item: FieldSelectionItem): void {
    item.isDenyList = !item.isDenyList;
    if (item.isDenyList) {
      item.selected = false;
    }
    this.cdr.detectChanges();
  }

  public selectAllFields(val: boolean): void {
    for (const item of this.fieldItems) {
      if (!item.isTarget && !item.isDenyList) {
        item.selected = val;
      }
    }
    this.cdr.detectChanges();
  }

  public excludeAuditFields(): void {
    for (const item of this.fieldItems) {
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

  public isStepDone(step: WizardStep): boolean {
    switch (step) {
      case 'goal':
        return Boolean(this.pipelineName.trim() && this.selectedEntityId && this.targetVariable);
      case 'features':
        return this.selectedFeaturesCount > 0;
      case 'preprocessing':
        return true;
      case 'algorithm':
        return Boolean(this.selectedAlgorithmId);
    }
  }

  public canProceed(): boolean {
    return this.isStepDone(this.currentStep);
  }

  public canSave(): boolean {
    return (
      Boolean(this.pipelineName.trim()) &&
      Boolean(this.selectedEntityId) &&
      Boolean(this.targetVariable) &&
      Boolean(this.selectedAlgorithmId) &&
      this.selectedFeaturesCount > 0
    );
  }

  public goToStep(step: WizardStep): void {
    this.currentStep = step;
    this.cdr.detectChanges();
  }

  public nextStep(): void {
    if (this.currentStep === 'goal') this.currentStep = 'features';
    else if (this.currentStep === 'features') this.currentStep = 'preprocessing';
    else if (this.currentStep === 'preprocessing') this.currentStep = 'algorithm';
    this.cdr.detectChanges();
  }

  public prevStep(): void {
    if (this.currentStep === 'algorithm') this.currentStep = 'preprocessing';
    else if (this.currentStep === 'preprocessing') this.currentStep = 'features';
    else if (this.currentStep === 'features') this.currentStep = 'goal';
    this.cdr.detectChanges();
  }

  public cancel(): void {
    this.closed.emit();
  }

  public onBackdropClick(event: MouseEvent): void {
    if ((event.target as HTMLElement).classList.contains('ps-modal-backdrop')) {
      this.cancel();
    }
  }

  public async saveDraft(): Promise<MJMLTrainingPipelineEntity | null> {
    return this.persistPipeline(false);
  }

  public async saveAndTrain(): Promise<void> {
    const pipeline = await this.persistPipeline(true);
    if (!pipeline) return;
    this.trainRequested.emit(pipeline);
  }

  private async persistPipeline(andTrain: boolean): Promise<MJMLTrainingPipelineEntity | null> {
    if (!this.canSave()) {
      this.notifications.CreateSimpleNotification('Please complete required fields before saving.', 'warning', 3000);
      return null;
    }

    this.busy = true;
    this.cdr.detectChanges();

    try {
      const prov = this.provider ?? Metadata.Provider;
      const p = await prov.GetEntityObject<MJMLTrainingPipelineEntity>('MJ: ML Training Pipelines', this.currentUser ?? undefined);
      p.NewRecord();
      p.Name = this.pipelineName.trim();
      p.Description = this.pipelineDescription.trim();
      p.Version = 1;
      p.Status = 'Draft';
      p.TargetEntityID = this.selectedEntityId;
      p.TargetVariable = this.targetVariable;
      p.ProblemType = this.problemType;
      p.AlgorithmID = this.selectedAlgorithmId;

      // Source Bindings
      const sourceBindings: SourceBinding[] = [
        {
          Kind: 'Entity',
          Ref: this.selectedEntity?.Name ?? this.selectedEntityId,
          Alias: 'src_primary',
        },
      ];
      p.SourceBindings = JSON.stringify(sourceBindings);

      // Feature Steps
      const selectedColumns = this.fieldItems
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

      if (this.categoricalEncoding === 'onehot') {
        const catCols = this.fieldItems
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

      if (this.standardizeStrategy !== 'none') {
        const numCols = this.fieldItems
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
        Mode: this.asOfMode,
        ...(this.asOfMode === 'column' ? { Column: this.asOfColumn } : {}),
        ...(this.asOfMode === 'offset' ? { OffsetDays: this.asOfOffsetDays } : {}),
      };
      p.AsOfStrategy = JSON.stringify(asOf);

      // Leakage Guard
      const denyList = this.fieldItems.filter((i) => i.isDenyList).map((i) => i.field.Name);
      const leakageGuard: LeakageGuard = {
        DenyFields: denyList,
        SingleFeatureDominanceThreshold: this.dominanceThreshold,
      };
      p.LeakageGuard = JSON.stringify(leakageGuard);

      // Validation Strategy
      const valStrategy: ValidationStrategy = {
        Strategy: this.validationStrategyType,
        LockedHoldoutFraction: 0.15,
        ...(this.validationStrategyType === 'train_test_split' ? { TestSize: this.testSplitRatio } : {}),
        ...(this.validationStrategyType === 'kfold' ? { K: this.kFolds } : {}),
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
      this.saved.emit(p);
      return p;
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      this.notifications.CreateSimpleNotification(`Error saving pipeline: ${msg}`, 'error', 5000);
      return null;
    } finally {
      this.busy = false;
      this.cdr.detectChanges();
    }
  }

  private initFromDefaults(): void {
    // If initial algorithm requested (e.g. from Catalog)
    if (this.initialAlgorithmId) {
      this.selectedAlgorithmId = this.initialAlgorithmId;
    } else if (this.initialAlgorithmName && (this.engine?.Algorithms.length ?? 0) > 0) {
      const match = this.engine!.Algorithms.find(
        (a) =>
          a.Name.toLowerCase() === this.initialAlgorithmName!.toLowerCase() ||
          a.DriverClass?.toLowerCase() === this.initialAlgorithmName!.toLowerCase()
      );
      if (match) this.selectedAlgorithmId = match.ID;
    } else if ((this.engine?.Algorithms.length ?? 0) > 0) {
      this.selectedAlgorithmId = this.engine!.Algorithms[0].ID;
    }

    // If cloning from existing pipeline
    if (this.cloneFromPipeline) {
      const cp = this.cloneFromPipeline;
      this.isEditing = false; // clone creates new
      this.pipelineName = `${cp.Name} (Copy)`;
      this.pipelineDescription = cp.Description || '';
      this.selectedEntityId = cp.TargetEntityID;
      this.targetVariable = cp.TargetVariable;
      this.problemType = (cp.ProblemType as ProblemType) || 'classification';
      if (cp.AlgorithmID) this.selectedAlgorithmId = cp.AlgorithmID;

      this.populateFieldItems();

      // Read leakage guard
      try {
        if (cp.LeakageGuard) {
          const lg = JSON.parse(cp.LeakageGuard) as Record<string, unknown>;
          const deny = (lg['DenyFields'] ?? lg['DenyList']) as string[] | undefined;
          if (Array.isArray(deny)) {
            const denySet = new Set(deny.map((d) => d.toLowerCase()));
            for (const item of this.fieldItems) {
              if (denySet.has(item.field.Name.toLowerCase())) {
                item.isDenyList = true;
                item.selected = false;
              }
            }
          }
          if (typeof lg['SingleFeatureDominanceThreshold'] === 'number') {
            this.dominanceThreshold = lg['SingleFeatureDominanceThreshold'];
          }
        }
      } catch {
        // Ignore
      }
    }
  }

  private populateFieldItems(): void {
    if (!this.selectedEntity) {
      this.fieldItems = [];
      return;
    }
    const targetLower = (this.targetVariable || '').toLowerCase();
    this.fieldItems = this.selectedEntity.Fields.map((f) => {
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
