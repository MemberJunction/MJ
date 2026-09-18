import { ChangeDetectorRef, Component, EventEmitter, Input, OnInit, Output, ViewEncapsulation, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { MJButtonDirective } from '@memberjunction/ng-ui-components';
import { MJNotificationService } from '@memberjunction/ng-notifications';
import { UUIDsEqual } from '@memberjunction/global';
import { IMetadataProvider, UserInfo } from '@memberjunction/core';
import { MJMLTrainingPipelineEntity, PredictiveStudioTrainModelOperation } from '@memberjunction/core-entities';
import {
  DOMINANCE_THRESHOLD_DEFAULT,
  parseDenyList,
  type SourceBinding,
  type FeatureStepGraph,
  type FeatureStep,
  type FeatureStepKind,
  type AsOfStrategy,
  type LeakageGuard,
  type ValidationStrategy,
  type ProblemType,
} from '@memberjunction/predictive-studio-core';
import { PredictiveStudioEngine } from '../engine/predictive-studio.engine';

type NodeType = 'src' | 'feat' | 'emb' | 'target' | 'algo' | 'output';

interface DagNode {
  id: string;
  type: NodeType;
  title: string;
  icon: string;
  tag?: string;
  rows: { k: string; v: string }[];
  x: number;
  y: number;
  hasIn: boolean;
  hasOut: boolean;
}

interface DagEdge {
  from: string;
  to: string;
}

const NODE_W = 190;
const NODE_H = 86;
const COL_GAP = 86;
const ROW_GAP = 30;
const PAD_X = 28;
const PAD_Y = 28;

const SOURCE_KINDS: SourceBinding['Kind'][] = ['Entity', 'Query', 'ExternalEntity', 'VectorSet', 'FeaturePipeline'];
const STEP_KINDS: FeatureStepKind[] = ['select', 'impute', 'standardize', 'onehot', 'bin', 'embedding', 'llm-derived', 'flow-agent', 'vision-llm'];
const PROBLEM_TYPES: ProblemType[] = ['classification', 'regression'];
const IMPUTE_STRATEGIES: Array<'mean' | 'median' | 'mode' | 'constant'> = ['mean', 'median', 'mode', 'constant'];

const SOURCE_ICONS: Record<SourceBinding['Kind'], string> = {
  Entity: 'fa-solid fa-table',
  Query: 'fa-solid fa-magnifying-glass-chart',
  ExternalEntity: 'fa-solid fa-arrows-turn-to-dots',
  VectorSet: 'fa-solid fa-vector-square',
  FeaturePipeline: 'fa-solid fa-diagram-project',
};

const STEP_ICONS: Record<FeatureStepKind, string> = {
  select: 'fa-solid fa-list-check',
  impute: 'fa-solid fa-fill-drip',
  standardize: 'fa-solid fa-ruler-combined',
  onehot: 'fa-solid fa-table-cells',
  bin: 'fa-solid fa-chart-simple',
  embedding: 'fa-solid fa-vector-square',
  'llm-derived': 'fa-solid fa-wand-magic-sparkles',
  'flow-agent': 'fa-solid fa-robot',
  'vision-llm': 'fa-solid fa-eye',
};

const PS_PIPELINES_STARTER_PROMPT =
  'Help me build a training pipeline. I will tell you what I want to predict and on which entity; ' +
  'you assemble the features (guarding against leakage), pick an algorithm, and train a versioned model.';

/**
 * Training Pipelines panel — a LIVE, **editable** visual DAG builder over `MJ: ML Training Pipelines`.
 * The whole graph is persisted as JSON (`SourceBindings` + `FeatureSteps` + `AlgorithmID` +
 * `TargetVariable` + `AsOfStrategy`/`LeakageGuard`/`ValidationStrategy`), so the editor reads/writes the
 * REAL spec. The parsed spec is the editable state; nodes/edges are derived from it for rendering, so an
 * edit → re-derive → re-layout. Save serializes back to the entity; Train runs the pipeline. Editing is
 * inspector-driven (explicit controls, no fiddly port-dragging) — better for a structured, persisted DAG.
 * Fully entity-agnostic — every node derives from the pipeline's own refs. See
 * plans/predictive-studio-pipeline-builder.md.
 */
@Component({
  standalone: true,
  selector: 'ps-pipelines',
  imports: [CommonModule, MJButtonDirective],
  encapsulation: ViewEncapsulation.None,
  styleUrls: ['../predictive-studio.shared.css', './ps-pipelines.component.css'],
  template: `
    <div class="ps-panel ps-pipelines" data-testid="ps-pipelines-panel">
      @if (pipelines.length === 0) {
        <div class="ps-empty" data-testid="ps-pipelines-empty">
          <span class="ps-empty-ico"><i class="fa-solid fa-diagram-project"></i></span>
          <h3>No training pipelines yet</h3>
          <p>
            A training pipeline assembles features from your data, picks an algorithm, and trains a
            versioned model. The fastest way to build one is to describe your goal to the Model
            Development Agent — it designs the pipeline, guards against target leakage, and trains for you.
          </p>
          <button mjButton variant="primary" size="sm" data-testid="ps-pipelines-ask-agent"
            (click)="askAgent.emit(starterPrompt)">
            <i class="fa-solid fa-robot"></i> Ask the agent to build one
          </button>
        </div>
      } @else {
        <!-- Pipeline picker (its own scrollable row) -->
        <div class="pl-picker" data-testid="ps-pipelines-picker">
          @for (p of pipelines; track p.ID) {
            <button class="pl-pill" [class.on]="isSelectedPipeline(p)"
              data-testid="ps-pipelines-pill" (click)="selectPipeline(p.ID)" [title]="p.Name">
              <i class="fa-solid fa-diagram-project"></i> <span class="pl-pill-name">{{ p.Name }}</span>
              <span class="ps-badge" [class]="statusClass(p.Status)">{{ p.Status }}</span>
            </button>
          }
        </div>

        <!-- Toolbar for the selected pipeline (its own row) -->
        <div class="pl-toolbar">
          <button mjButton variant="primary" size="sm" data-testid="ps-pipelines-save" [disabled]="!dirty || busy" (click)="save()">
            <i class="fa-solid fa-floppy-disk"></i> Save
          </button>
          <button mjButton variant="secondary" size="sm" data-testid="ps-pipelines-validate" [disabled]="busy" (click)="validate()">
            <i class="fa-solid fa-circle-check"></i> Validate
          </button>
          <button mjButton variant="secondary" size="sm" data-testid="ps-pipelines-train" [disabled]="busy || dirty" (click)="train()">
            <i class="fa-solid fa-play"></i> Train
          </button>
          <button mjButton variant="secondary" size="sm" (click)="refine()">
            <i class="fa-solid fa-wand-magic-sparkles"></i> Agent
          </button>
          <span class="ps-spacer"></span>
          @if (dirty) { <span class="ps-tag amber" data-testid="ps-pipelines-dirty"><i class="fa-solid fa-pen"></i> Unsaved</span> }
        </div>

        <div class="builder">
          <!-- Canvas -->
          <div class="canvas-wrap">
            <div class="canvas-bar">
              <span class="ps-small ps-muted" style="font-weight:600">Add:</span>
              <button class="ps-pchip s" data-testid="ps-pipelines-add-source" (click)="addSource()"><i class="fa-solid fa-database"></i> Source</button>
              <button class="ps-pchip f" data-testid="ps-pipelines-add-step" (click)="addStep()"><i class="fa-solid fa-sliders"></i> Feature step</button>
              <span class="ps-spacer"></span>
              <span class="ps-small ps-muted"><i class="fa-solid fa-circle-nodes"></i> {{ nodes.length }} nodes · {{ edges.length }} edges</span>
            </div>

            <div class="ps-flow big" data-testid="ps-pipelines-canvas"
              [style.width.px]="canvasW" [style.height.px]="canvasH">
              <svg class="ps-edges" data-testid="ps-pipelines-edges"
                [attr.width]="canvasW" [attr.height]="canvasH"
                [attr.viewBox]="'0 0 ' + canvasW + ' ' + canvasH">
                @for (edge of edges; track edge.from + edge.to) {
                  <path [attr.d]="edgePath(edge)"></path>
                }
              </svg>
              @for (node of nodes; track node.id) {
                <div class="ps-node" data-testid="ps-pipelines-node" [attr.data-node-id]="node.id"
                  [ngClass]="node.type" [class.selected]="node.id === selectedId"
                  [style.left.px]="node.x" [style.top.px]="node.y" (click)="selectNode(node.id)">
                  <div class="nh">
                    <i class="tile" [ngClass]="node.icon"></i>
                    <span>{{ node.title }}</span>
                    @if (node.tag) { <span class="ps-tag">{{ node.tag }}</span> }
                  </div>
                  <div class="nb">
                    @for (row of node.rows; track row.k) {
                      <div class="nb-row"><span class="k">{{ row.k }}</span><span>{{ row.v }}</span></div>
                    }
                  </div>
                  @if (node.hasIn) { <span class="port in"></span> }
                  @if (node.hasOut) { <span class="port out"></span> }
                </div>
              }
            </div>

            <div class="flow-toolbar">
              <div class="legend">
                <span><i class="sw src"></i> Source</span>
                <span><i class="sw feat"></i> Feature</span>
                <span><i class="sw emb"></i> Embedding</span>
                <span><i class="sw target"></i> Target</span>
                <span><i class="sw algo"></i> Algorithm</span>
              </div>
            </div>
          </div>

          <!-- Inspector (editable) -->
          <div class="ps-col inspector" data-testid="ps-pipelines-inspector">
            <div class="ps-card insp">
              <div class="ihead">
                <i class="tile" [ngClass]="selectedNode.icon" [attr.data-type]="selectedNode.type"></i>
                <div style="flex:1">
                  <h3 data-testid="ps-pipelines-inspector-title">{{ selectedNode.title }}</h3>
                  <div class="ps-small ps-muted">{{ nodeTypeLabel(selectedNode.type) }} · selected</div>
                </div>
                @if (selectedNode.type === 'src' || selectedNode.type === 'feat' || selectedNode.type === 'emb') {
                  <button mjButton variant="secondary" size="sm" data-testid="ps-pipelines-delete" (click)="deleteSelected()"><i class="fa-solid fa-trash"></i></button>
                }
              </div>
              <div class="ps-card-body">
                <!-- SOURCE editor -->
                @if (selectedSource) {
                  <div class="ps-field"><label>Kind</label>
                    <select class="mj-input" [value]="selectedSource.Kind" (change)="setSourceKind($any($event.target).value)">
                      @for (k of sourceKinds; track k) { <option [value]="k">{{ k }}</option> }
                    </select>
                  </div>
                  <div class="ps-field"><label>Reference (entity / query / id)</label>
                    <input class="mj-input" type="text" [value]="selectedSource.Ref" (input)="setSourceRef($any($event.target).value)" />
                  </div>
                  <div class="ps-field"><label>Alias (optional)</label>
                    <input class="mj-input" type="text" [value]="selectedSource.Alias || ''" (input)="setSourceAlias($any($event.target).value)" />
                  </div>
                }
                <!-- STEP editor -->
                @if (selectedStep) {
                  <div class="ps-field"><label>Kind</label>
                    <select class="mj-input" [value]="selectedStep.Kind" (change)="setStepKind($any($event.target).value)">
                      @for (k of stepKinds; track k) { <option [value]="k">{{ k }}</option> }
                    </select>
                  </div>
                  <div class="ps-field"><label>Label</label>
                    <input class="mj-input" type="text" [value]="selectedStep.Label || ''" (input)="setStepLabel($any($event.target).value)" />
                  </div>
                  @switch (selectedStep.Kind) {
                    @case ('select') { <div class="ps-field"><label>Columns (comma-separated)</label><input class="mj-input" type="text" [value]="columnsText" (input)="setColumns($any($event.target).value)" /></div> }
                    @case ('standardize') { <div class="ps-field"><label>Columns (comma-separated)</label><input class="mj-input" type="text" [value]="columnsText" (input)="setColumns($any($event.target).value)" /></div> }
                    @case ('impute') {
                      <div class="ps-field"><label>Column</label><input class="mj-input" type="text" [value]="stepField('Column')" (input)="setStepStr('Column', $any($event.target).value)" /></div>
                      <div class="ps-field"><label>Strategy</label><select class="mj-input" [value]="stepField('Strategy')" (change)="setStepStr('Strategy', $any($event.target).value)">@for (s of imputeStrategies; track s) { <option [value]="s">{{ s }}</option> }</select></div>
                    }
                    @case ('onehot') { <div class="ps-field"><label>Column</label><input class="mj-input" type="text" [value]="stepField('Column')" (input)="setStepStr('Column', $any($event.target).value)" /></div> }
                    @case ('bin') {
                      <div class="ps-field"><label>Column</label><input class="mj-input" type="text" [value]="stepField('Column')" (input)="setStepStr('Column', $any($event.target).value)" /></div>
                      <div class="ps-field"><label>Bins</label><input class="mj-input" type="number" [value]="stepField('Bins')" (input)="setStepNum('Bins', $any($event.target).value)" /></div>
                    }
                    @case ('embedding') {
                      <div class="ps-field"><label>Entity</label><input class="mj-input" type="text" [value]="stepField('Entity')" (input)="setStepStr('Entity', $any($event.target).value)" /></div>
                      <div class="ps-field"><label>Embedding model ref</label><input class="mj-input" type="text" [value]="stepField('EmbeddingModelRef')" (input)="setStepStr('EmbeddingModelRef', $any($event.target).value)" /></div>
                      <div class="ps-field"><label>Dimensions</label><input class="mj-input" type="number" [value]="stepField('Dims')" (input)="setStepNum('Dims', $any($event.target).value)" /></div>
                    }
                    @case ('llm-derived') { <div class="ps-field"><label>Feature Pipeline ref</label><input class="mj-input" type="text" [value]="stepField('FeaturePipelineRef')" (input)="setStepStr('FeaturePipelineRef', $any($event.target).value)" /></div> }
                    @case ('flow-agent') { <div class="ps-field"><label>Flow Agent ref</label><input class="mj-input" type="text" [value]="stepField('FlowAgentRef')" (input)="setStepStr('FlowAgentRef', $any($event.target).value)" /></div> }
                    @case ('vision-llm') { <div class="ps-field"><label>Image column</label><input class="mj-input" type="text" [value]="stepField('ImageColumn')" (input)="setStepStr('ImageColumn', $any($event.target).value)" /></div> }
                  }
                  <!-- rewire: upstream step inputs -->
                  @if (otherSteps.length > 0) {
                    <div class="ps-field"><label>Inputs (upstream steps)</label>
                      <div class="inputs-list">
                        @for (s of otherSteps; track s.Id) {
                          <label class="inp-row"><input type="checkbox" [checked]="hasInput(s.Id)" (change)="toggleInput(s.Id)" /> {{ s.Label || s.Kind }}</label>
                        }
                      </div>
                      <div class="ps-small ps-muted" style="margin-top:4px">No inputs = a root step fed directly by the sources.</div>
                    </div>
                  }
                }
                <!-- TARGET editor -->
                @if (selectedNode.type === 'target') {
                  <div class="ps-field"><label>Target variable</label><input class="mj-input" type="text" [value]="editTargetVariable" (input)="setTargetVariable($any($event.target).value)" /></div>
                  <div class="ps-field"><label>Problem type</label><select class="mj-input" [value]="editProblemType" (change)="setProblemType($any($event.target).value)">@for (pt of problemTypes; track pt) { <option [value]="pt">{{ pt }}</option> }</select></div>
                }
                <!-- ALGORITHM editor -->
                @if (selectedNode.type === 'algo') {
                  <div class="ps-field"><label>Algorithm</label><select class="mj-input" [value]="editAlgorithmId" (change)="setAlgorithm($any($event.target).value)">@for (a of algorithms; track a.ID) { <option [value]="a.ID">{{ a.Name }}</option> }</select></div>
                  <div class="ps-field"><label>Hyperparameters (JSON)</label><textarea class="mj-textarea" rows="4" [value]="editHyperparams" (input)="setHyperparams($any($event.target).value)"></textarea></div>
                }
                @if (selectedNode.type === 'output') {
                  <div class="ps-small ps-muted">The trained model artifact. Run <strong>Train</strong> to produce a new versioned model from this pipeline.</div>
                }
              </div>
            </div>

            <!-- Leakage guard (editable) -->
            <div class="ps-card">
              <div class="ps-card-head"><i class="fa-solid fa-shield-halved" style="color:var(--mj-status-warning)"></i><h3>Leakage guard</h3></div>
              <div class="ps-card-body">
                <div class="ps-field"><label>Deny-list columns (comma-separated)</label><input class="mj-input" type="text" [value]="denyText" (input)="setDeny($any($event.target).value)" /></div>
                <div class="ps-field"><label>Single-feature dominance threshold</label><input class="mj-input" type="number" step="0.05" min="0" max="1" [value]="editLeakage.SingleFeatureDominanceThreshold" (input)="setThreshold($any($event.target).value)" /></div>
              </div>
            </div>

            <!-- As-of strategy (editable) -->
            <div class="ps-card">
              <div class="ps-card-head"><i class="fa-solid fa-clock-rotate-left" style="color:var(--mj-brand-primary)"></i><h3>As-of strategy</h3></div>
              <div class="ps-card-body">
                <div class="ps-field"><label>Mode</label><select class="mj-input" [value]="editAsOf.Mode" (change)="setAsOfMode($any($event.target).value)"><option value="none">none</option><option value="column">column</option><option value="offset">offset</option></select></div>
                @if (editAsOf.Mode === 'column') { <div class="ps-field"><label>Decision-date column</label><input class="mj-input" type="text" [value]="editAsOf.Column || ''" (input)="setAsOfColumn($any($event.target).value)" /></div> }
                @if (editAsOf.Mode === 'offset') { <div class="ps-field"><label>Offset days before label</label><input class="mj-input" type="number" [value]="editAsOf.OffsetDays ?? 0" (input)="setAsOfOffset($any($event.target).value)" /></div> }
              </div>
            </div>

            <!-- Validation (editable) -->
            <div class="ps-card">
              <div class="ps-card-head"><i class="fa-solid fa-scissors" style="color:var(--mj-brand-primary)"></i><h3>Validation</h3></div>
              <div class="ps-card-body">
                <div class="ps-field"><label>Strategy</label><select class="mj-input" [value]="editValidation.Strategy" (change)="setValStrategy($any($event.target).value)"><option value="train_test_split">train_test_split</option><option value="kfold">kfold</option><option value="holdout">holdout</option></select></div>
                @if (editValidation.Strategy === 'train_test_split') { <div class="ps-field"><label>Test size</label><input class="mj-input" type="number" step="0.05" [value]="editValidation.TestSize ?? 0.2" (input)="setTestSize($any($event.target).value)" /></div> }
                @if (editValidation.Strategy === 'kfold') { <div class="ps-field"><label>Folds (k)</label><input class="mj-input" type="number" [value]="editValidation.K ?? 5" (input)="setK($any($event.target).value)" /></div> }
                <div class="ps-field"><label>Locked holdout fraction</label><input class="mj-input" type="number" step="0.05" [value]="editValidation.LockedHoldoutFraction" (input)="setHoldout($any($event.target).value)" /></div>
              </div>
            </div>
          </div>
        </div>
      }
    </div>
  `,
})
export class PSPipelinesComponent implements OnInit {
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

  @Output() AskAgent = new EventEmitter<string>();

  /**
   * @deprecated Use {@link AskAgent}.
   *
   * The same emitter under the old binding name, so a template still binding
   * (askAgent) keeps working. Must stay AFTER AskAgent: class fields
   * initialise in order, and the other way round this captures undefined.
   */
  @Output() askAgent = this.AskAgent;

  private cdr = inject(ChangeDetectorRef);
  private notifications = inject(MJNotificationService);

  public readonly StarterPrompt = PS_PIPELINES_STARTER_PROMPT;

  /** @deprecated Use {@link StarterPrompt}. */
  public get starterPrompt() {
    return this.StarterPrompt;
  }
  public readonly SourceKinds = SOURCE_KINDS;

  /** @deprecated Use {@link SourceKinds}. */
  public get sourceKinds() {
    return this.SourceKinds;
  }
  public readonly StepKinds = STEP_KINDS;

  /** @deprecated Use {@link StepKinds}. */
  public get stepKinds() {
    return this.StepKinds;
  }
  public readonly ProblemTypes = PROBLEM_TYPES;

  /** @deprecated Use {@link ProblemTypes}. */
  public get problemTypes() {
    return this.ProblemTypes;
  }
  public readonly ImputeStrategies = IMPUTE_STRATEGIES;

  /** @deprecated Use {@link ImputeStrategies}. */
  public get imputeStrategies() {
    return this.ImputeStrategies;
  }

  public Pipelines: MJMLTrainingPipelineEntity[] = [];

  /** @deprecated Use {@link Pipelines}. */
  public get pipelines(): MJMLTrainingPipelineEntity[] {
    return this.Pipelines;
  }
  /** @deprecated Use {@link Pipelines}. */
  public set pipelines(value: MJMLTrainingPipelineEntity[]) {
    this.Pipelines = value;
  }
  public SelectedPipelineId = '';

  /** @deprecated Use {@link SelectedPipelineId}. */
  public get selectedPipelineId() {
    return this.SelectedPipelineId;
  }
  /** @deprecated Use {@link SelectedPipelineId}. */
  public set selectedPipelineId(value) {
    this.SelectedPipelineId = value;
  }

  // Editable spec state (the source of truth; nodes/edges are derived).
  private editSources: SourceBinding[] = [];
  private editSteps: FeatureStep[] = [];
  public EditTargetVariable = '';

  /** @deprecated Use {@link EditTargetVariable}. */
  public get editTargetVariable() {
    return this.EditTargetVariable;
  }
  /** @deprecated Use {@link EditTargetVariable}. */
  public set editTargetVariable(value) {
    this.EditTargetVariable = value;
  }
  public EditProblemType: ProblemType = 'classification';

  /** @deprecated Use {@link EditProblemType}. */
  public get editProblemType(): ProblemType {
    return this.EditProblemType;
  }
  /** @deprecated Use {@link EditProblemType}. */
  public set editProblemType(value: ProblemType) {
    this.EditProblemType = value;
  }
  public EditAlgorithmId = '';

  /** @deprecated Use {@link EditAlgorithmId}. */
  public get editAlgorithmId() {
    return this.EditAlgorithmId;
  }
  /** @deprecated Use {@link EditAlgorithmId}. */
  public set editAlgorithmId(value) {
    this.EditAlgorithmId = value;
  }
  public EditHyperparams = '{}';

  /** @deprecated Use {@link EditHyperparams}. */
  public get editHyperparams() {
    return this.EditHyperparams;
  }
  /** @deprecated Use {@link EditHyperparams}. */
  public set editHyperparams(value) {
    this.EditHyperparams = value;
  }
  public EditLeakage: LeakageGuard = { DenyFields: [], SingleFeatureDominanceThreshold: DOMINANCE_THRESHOLD_DEFAULT };

  /** @deprecated Use {@link EditLeakage}. */
  public get editLeakage(): LeakageGuard {
    return this.EditLeakage;
  }
  /** @deprecated Use {@link EditLeakage}. */
  public set editLeakage(value: LeakageGuard) {
    this.EditLeakage = value;
  }
  public EditAsOf: AsOfStrategy = { Mode: 'none' };

  /** @deprecated Use {@link EditAsOf}. */
  public get editAsOf(): AsOfStrategy {
    return this.EditAsOf;
  }
  /** @deprecated Use {@link EditAsOf}. */
  public set editAsOf(value: AsOfStrategy) {
    this.EditAsOf = value;
  }
  public EditValidation: ValidationStrategy = { Strategy: 'train_test_split', TestSize: 0.2, LockedHoldoutFraction: 0.15 };

  /** @deprecated Use {@link EditValidation}. */
  public get editValidation(): ValidationStrategy {
    return this.EditValidation;
  }
  /** @deprecated Use {@link EditValidation}. */
  public set editValidation(value: ValidationStrategy) {
    this.EditValidation = value;
  }

  public Nodes: DagNode[] = [];

  /** @deprecated Use {@link Nodes}. */
  public get nodes(): DagNode[] {
    return this.Nodes;
  }
  /** @deprecated Use {@link Nodes}. */
  public set nodes(value: DagNode[]) {
    this.Nodes = value;
  }
  public Edges: DagEdge[] = [];

  /** @deprecated Use {@link Edges}. */
  public get edges(): DagEdge[] {
    return this.Edges;
  }
  /** @deprecated Use {@link Edges}. */
  public set edges(value: DagEdge[]) {
    this.Edges = value;
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
  public CanvasW = 800;

  /** @deprecated Use {@link CanvasW}. */
  public get canvasW() {
    return this.CanvasW;
  }
  /** @deprecated Use {@link CanvasW}. */
  public set canvasW(value) {
    this.CanvasW = value;
  }
  public CanvasH = 460;

  /** @deprecated Use {@link CanvasH}. */
  public get canvasH() {
    return this.CanvasH;
  }
  /** @deprecated Use {@link CanvasH}. */
  public set canvasH(value) {
    this.CanvasH = value;
  }
  public Dirty = false;

  /** @deprecated Use {@link Dirty}. */
  public get dirty() {
    return this.Dirty;
  }
  /** @deprecated Use {@link Dirty}. */
  public set dirty(value) {
    this.Dirty = value;
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

  private nodeById = new Map<string, DagNode>();
  private stepSeq = 0;

  ngOnInit(): void {
    this.Pipelines = this.engine?.Pipelines ?? [];
    if (this.Pipelines.length > 0) {
      this.SelectPipeline(this.Pipelines[0].ID);
    }
  }

  // ---- pipeline selection: entity JSON → editable state ----

  public SelectPipeline(id: string): void {
    this.SelectedPipelineId = id;
    const p = this.Pipelines.find((x) => UUIDsEqual(x.ID, id));
    if (!p) {
      return;
    }
    this.editSources = this.parse<SourceBinding[]>(p.SourceBindings, []);
    this.editSteps = this.parse<FeatureStepGraph>(p.FeatureSteps, { Steps: [] }).Steps ?? [];
    this.EditTargetVariable = p.TargetVariable ?? '';
    this.EditProblemType = (p.ProblemType as ProblemType) ?? 'classification';
    this.EditAlgorithmId = p.AlgorithmID ?? '';
    this.EditHyperparams = p.Hyperparameters ?? '{}';
    this.EditLeakage = this.parse<LeakageGuard>(p.LeakageGuard, { DenyFields: [], SingleFeatureDominanceThreshold: DOMINANCE_THRESHOLD_DEFAULT });
    this.EditAsOf = this.parse<AsOfStrategy>(p.AsOfStrategy, { Mode: 'none' });
    this.EditValidation = this.parse<ValidationStrategy>(p.ValidationStrategy, { Strategy: 'train_test_split', TestSize: 0.2, LockedHoldoutFraction: 0.15 });
    this.stepSeq = this.editSteps.length;
    this.Dirty = false;
    this.rebuild();
    this.SelectedId = this.Nodes[0]?.id ?? '';
  }

  /** @deprecated Use {@link SelectPipeline}. */
  public selectPipeline(id: string): void {
    return this.SelectPipeline(id);
  }

  private get selectedPipeline(): MJMLTrainingPipelineEntity | undefined {
    return this.Pipelines.find((p) => UUIDsEqual(p.ID, this.SelectedPipelineId));
  }

  public IsSelectedPipeline(p: MJMLTrainingPipelineEntity): boolean {
    return UUIDsEqual(p.ID, this.SelectedPipelineId);
  }

  /** @deprecated Use {@link IsSelectedPipeline}. */
  public isSelectedPipeline(p: MJMLTrainingPipelineEntity): boolean {
    return this.IsSelectedPipeline(p);
  }

  private parse<T>(raw: string | null | undefined, fallback: T): T {
    if (!raw) {
      return fallback;
    }
    try {
      const value: unknown = JSON.parse(raw);
      return (value ?? fallback) as T;
    } catch {
      return fallback;
    }
  }

  private markDirty(): void {
    this.Dirty = true;
    this.rebuild();
  }

  // ---- derive nodes/edges from editable state ----

  private rebuild(): void {
    const nodes: DagNode[] = [];
    const edges: DagEdge[] = [];

    this.editSources.forEach((sb, i) => nodes.push(this.sourceNode(sb, i)));
    this.editSteps.forEach((step) => nodes.push(this.stepNode(step)));
    nodes.push(this.targetNode());
    nodes.push(this.algoNode());
    nodes.push({ id: '__output', type: 'output', title: 'Model', icon: 'fa-solid fa-cube', x: 0, y: 0, hasIn: false, hasOut: false, rows: [{ k: 'status', v: this.selectedPipeline?.Status ?? 'Draft' }] });

    const stepIds = new Set(this.editSteps.map((s) => s.Id));
    const referenced = new Set<string>();
    for (const step of this.editSteps) {
      for (const input of step.Inputs ?? []) {
        if (stepIds.has(input)) {
          edges.push({ from: input, to: step.Id });
          referenced.add(input);
        }
      }
    }
    const roots = this.editSteps.filter((s) => (s.Inputs ?? []).filter((i) => stepIds.has(i)).length === 0);
    const sourceIds = this.editSources.map((_s, i) => `src:${i}`);
    if (this.editSteps.length > 0) {
      for (const sid of sourceIds) {
        for (const r of roots) {
          edges.push({ from: sid, to: r.Id });
        }
      }
    } else {
      for (const sid of sourceIds) {
        edges.push({ from: sid, to: '__algo' });
      }
    }
    for (const t of this.editSteps.filter((s) => !referenced.has(s.Id))) {
      edges.push({ from: t.Id, to: '__algo' });
    }
    edges.push({ from: '__target', to: '__algo' });
    edges.push({ from: '__algo', to: '__output' });

    this.Nodes = nodes;
    this.Edges = edges;
    this.markPorts();
    this.layoutDag();
  }

  private sourceNode(sb: SourceBinding, i: number): DagNode {
    const rows = [{ k: 'kind', v: sb.Kind }, { k: 'ref', v: sb.Ref || '—' }];
    if (sb.Alias) {
      rows.push({ k: 'alias', v: sb.Alias });
    }
    return { id: `src:${i}`, type: 'src', title: sb.Alias || sb.Ref || 'source', icon: SOURCE_ICONS[sb.Kind] ?? 'fa-solid fa-database', tag: sb.Kind, rows, x: 0, y: 0, hasIn: false, hasOut: true };
  }

  private stepNode(step: FeatureStep): DagNode {
    return { id: step.Id, type: step.Kind === 'embedding' ? 'emb' : 'feat', title: step.Label || step.Kind, icon: STEP_ICONS[step.Kind] ?? 'fa-solid fa-sliders', tag: step.Kind, rows: this.stepRows(step), x: 0, y: 0, hasIn: true, hasOut: true };
  }

  private stepRows(step: FeatureStep): { k: string; v: string }[] {
    switch (step.Kind) {
      case 'select': return [{ k: 'columns', v: `${step.Columns.length} cols` }];
      case 'impute': return [{ k: 'column', v: step.Column }, { k: 'strategy', v: step.Strategy }];
      case 'standardize': return [{ k: 'columns', v: `${step.Columns.length} cols` }, { k: 'scaler', v: 'z-score' }];
      case 'onehot': return [{ k: 'column', v: step.Column }];
      case 'bin': return [{ k: 'column', v: step.Column }, { k: 'bins', v: String(step.Bins) }];
      case 'embedding': return [{ k: 'entity', v: step.Entity }, { k: 'dims', v: String(step.Dims) }];
      case 'llm-derived': return [{ k: 'pipeline', v: step.FeaturePipelineRef }];
      case 'flow-agent': return [{ k: 'agent', v: step.FlowAgentRef }];
      case 'vision-llm': return [{ k: 'image', v: step.ImageColumn }, { k: 'output', v: step.Output.FeatureName }];
      default: return [];
    }
  }

  private targetNode(): DagNode {
    return { id: '__target', type: 'target', title: `Target: ${this.EditTargetVariable || '—'}`, icon: 'fa-solid fa-bullseye', rows: [{ k: 'variable', v: this.EditTargetVariable || '—' }, { k: 'type', v: this.EditProblemType }], x: 0, y: 0, hasIn: false, hasOut: true };
  }

  private algoNode(): DagNode {
    const name = this.engine.AlgorithmName(this.EditAlgorithmId);
    const rows = [{ k: 'algorithm', v: name }];
    const hp = this.parse<Record<string, unknown>>(this.EditHyperparams, {});
    Object.entries(hp).slice(0, 2).forEach(([k, v]) => rows.push({ k, v: String(v) }));
    return { id: '__algo', type: 'algo', title: name, icon: 'fa-solid fa-shapes', rows, x: 0, y: 0, hasIn: true, hasOut: true };
  }

  private markPorts(): void {
    const hasIn = new Set(this.Edges.map((e) => e.to));
    const hasOut = new Set(this.Edges.map((e) => e.from));
    for (const n of this.Nodes) {
      n.hasIn = hasIn.has(n.id);
      n.hasOut = hasOut.has(n.id);
    }
  }

  // ---- selection ----

  public SelectNode(id: string): void {
    this.SelectedId = id;
  }

  /** @deprecated Use {@link SelectNode}. */
  public selectNode(id: string): void {
    return this.SelectNode(id);
  }

  public get SelectedNode(): DagNode {
    return this.nodeById.get(this.SelectedId) ?? this.Nodes[0] ?? { id: '', type: 'feat', title: '—', icon: 'fa-solid fa-sliders', rows: [], x: 0, y: 0, hasIn: false, hasOut: false };
  }

  /** @deprecated Use {@link SelectedNode}. */
  public get selectedNode(): DagNode {
    return this.SelectedNode;
  }

  public get SelectedSourceIndex(): number {
    return this.SelectedId.startsWith('src:') ? Number(this.SelectedId.slice(4)) : -1;
  }

  /** @deprecated Use {@link SelectedSourceIndex}. */
  public get selectedSourceIndex(): number {
    return this.SelectedSourceIndex;
  }
  public get SelectedSource(): SourceBinding | null {
    const i = this.SelectedSourceIndex;
    return i >= 0 ? this.editSources[i] ?? null : null;
  }

  /** @deprecated Use {@link SelectedSource}. */
  public get selectedSource(): SourceBinding | null {
    return this.SelectedSource;
  }
  public get SelectedStep(): FeatureStep | null {
    return this.editSteps.find((s) => s.Id === this.SelectedId) ?? null;
  }

  /** @deprecated Use {@link SelectedStep}. */
  public get selectedStep(): FeatureStep | null {
    return this.SelectedStep;
  }
  public get OtherSteps(): FeatureStep[] {
    return this.editSteps.filter((s) => s.Id !== this.SelectedId);
  }

  /** @deprecated Use {@link OtherSteps}. */
  public get otherSteps(): FeatureStep[] {
    return this.OtherSteps;
  }
  public get Algorithms() {
    return this.engine?.Algorithms ?? [];
  }

  /** @deprecated Use {@link Algorithms}. */
  public get algorithms() {
    return this.Algorithms;
  }

  // ---- source editing ----

  public SetSourceKind(kind: string): void { const s = this.SelectedSource; if (s) { s.Kind = kind as SourceBinding['Kind']; this.markDirty(); } }

  /** @deprecated Use {@link SetSourceKind}. */
  public setSourceKind(kind: string): void {
    return this.SetSourceKind(kind);
  }
  public SetSourceRef(ref: string): void { const s = this.SelectedSource; if (s) { s.Ref = ref; this.markDirty(); } }

  /** @deprecated Use {@link SetSourceRef}. */
  public setSourceRef(ref: string): void {
    return this.SetSourceRef(ref);
  }
  public SetSourceAlias(alias: string): void { const s = this.SelectedSource; if (s) { s.Alias = alias || undefined; this.markDirty(); } }

  /** @deprecated Use {@link SetSourceAlias}. */
  public setSourceAlias(alias: string): void {
    return this.SetSourceAlias(alias);
  }

  // ---- step editing ----

  public get ColumnsText(): string {
    const s = this.SelectedStep;
    if (s && (s.Kind === 'select' || s.Kind === 'standardize')) {
      return s.Columns.join(', ');
    }
    return '';
  }

  /** @deprecated Use {@link ColumnsText}. */
  public get columnsText(): string {
    return this.ColumnsText;
  }
  public SetColumns(text: string): void {
    const s = this.SelectedStep;
    if (s && (s.Kind === 'select' || s.Kind === 'standardize')) {
      s.Columns = text.split(',').map((c) => c.trim()).filter(Boolean);
      this.markDirty();
    }
  }

  /** @deprecated Use {@link SetColumns}. */
  public setColumns(text: string): void {
    return this.SetColumns(text);
  }
  /** Read an arbitrary field off the selected step for display (narrowed by template @switch). */
  public StepField(field: string): string {
    const s = this.SelectedStep as unknown as Record<string, unknown> | null;
    const v = s?.[field];
    return v == null ? '' : String(v);
  }

  /** @deprecated Use {@link StepField}. */
  public stepField(field: string): string {
    return this.StepField(field);
  }
  public SetStepStr(field: string, value: string): void {
    const s = this.SelectedStep as unknown as Record<string, unknown> | null;
    if (s) { s[field] = value; this.markDirty(); }
  }

  /** @deprecated Use {@link SetStepStr}. */
  public setStepStr(field: string, value: string): void {
    return this.SetStepStr(field, value);
  }
  public SetStepNum(field: string, value: string): void {
    const s = this.SelectedStep as unknown as Record<string, unknown> | null;
    const n = Number(value);
    if (s && !Number.isNaN(n)) { s[field] = n; this.markDirty(); }
  }

  /** @deprecated Use {@link SetStepNum}. */
  public setStepNum(field: string, value: string): void {
    return this.SetStepNum(field, value);
  }
  public SetStepLabel(label: string): void { const s = this.SelectedStep; if (s) { s.Label = label || undefined; this.markDirty(); } }

  /** @deprecated Use {@link SetStepLabel}. */
  public setStepLabel(label: string): void {
    return this.SetStepLabel(label);
  }

  /** Change a step's Kind, resetting its config to that Kind's defaults (preserving Id/Label/Inputs). */
  public SetStepKind(kind: string): void {
    const idx = this.editSteps.findIndex((s) => s.Id === this.SelectedId);
    if (idx < 0) {
      return;
    }
    const prev = this.editSteps[idx];
    this.editSteps[idx] = this.defaultStep(kind as FeatureStepKind, prev.Id, prev.Label, prev.Inputs);
    this.markDirty();
  }

  /** @deprecated Use {@link SetStepKind}. */
  public setStepKind(kind: string): void {
    return this.SetStepKind(kind);
  }

  public HasInput(stepId: string): boolean {
    return (this.SelectedStep?.Inputs ?? []).includes(stepId);
  }

  /** @deprecated Use {@link HasInput}. */
  public hasInput(stepId: string): boolean {
    return this.HasInput(stepId);
  }
  /** Toggle an upstream step input, preventing cycles. */
  public ToggleInput(stepId: string): void {
    const s = this.SelectedStep;
    if (!s) {
      return;
    }
    const inputs = s.Inputs ?? [];
    if (inputs.includes(stepId)) {
      s.Inputs = inputs.filter((i) => i !== stepId);
    } else if (!this.createsCycle(stepId, s.Id)) {
      s.Inputs = [...inputs, stepId];
    } else {
      this.notifications.CreateSimpleNotification('That would create a cycle.', 'warning', 2500);
      return;
    }
    this.markDirty();
  }

  /** @deprecated Use {@link ToggleInput}. */
  public toggleInput(stepId: string): void {
    return this.ToggleInput(stepId);
  }
  /** True if making `target` depend on `from` would create a cycle (from is downstream of target). */
  private createsCycle(from: string, target: string): boolean {
    const byId = new Map(this.editSteps.map((s) => [s.Id, s]));
    const seen = new Set<string>();
    const stack = [from];
    while (stack.length) {
      const id = stack.pop()!;
      if (id === target) {
        return true;
      }
      if (seen.has(id)) {
        continue;
      }
      seen.add(id);
      stack.push(...(byId.get(id)?.Inputs ?? []));
    }
    return false;
  }

  // ---- target / algorithm editing ----

  public SetTargetVariable(v: string): void { this.EditTargetVariable = v; this.markDirty(); }

  /** @deprecated Use {@link SetTargetVariable}. */
  public setTargetVariable(v: string): void {
    return this.SetTargetVariable(v);
  }
  public SetProblemType(v: string): void { this.EditProblemType = v as ProblemType; this.markDirty(); }

  /** @deprecated Use {@link SetProblemType}. */
  public setProblemType(v: string): void {
    return this.SetProblemType(v);
  }
  public SetAlgorithm(id: string): void { this.EditAlgorithmId = id; this.markDirty(); }

  /** @deprecated Use {@link SetAlgorithm}. */
  public setAlgorithm(id: string): void {
    return this.SetAlgorithm(id);
  }
  public SetHyperparams(v: string): void { this.EditHyperparams = v; this.markDirty(); }

  /** @deprecated Use {@link SetHyperparams}. */
  public setHyperparams(v: string): void {
    return this.SetHyperparams(v);
  }

  // ---- leakage / as-of / validation editing ----

  public get DenyText(): string { return this.EditLeakage.DenyFields.join(', '); }

  /** @deprecated Use {@link DenyText}. */
  public get denyText(): string {
    return this.DenyText;
  }
  /**
   * Parse the deny-field input. Uses the shared `parseDenyList` so a pasted
   * bracketed list ("[CheckInTime, Status]") yields clean column names rather than
   * "[CheckInTime" / "Status]" — entries which match no column and therefore leave
   * the most dangerous columns silently unguarded. The server re-validates on save.
   */
  public SetDeny(text: string): void { this.EditLeakage.DenyFields = parseDenyList(text); this.Dirty = true; }

  /** @deprecated Use {@link SetDeny}. */
  public setDeny(text: string): void {
    return this.SetDeny(text);
  }
  public SetThreshold(v: string): void { const n = Number(v); if (!Number.isNaN(n)) { this.EditLeakage.SingleFeatureDominanceThreshold = n; this.Dirty = true; } }

  /** @deprecated Use {@link SetThreshold}. */
  public setThreshold(v: string): void {
    return this.SetThreshold(v);
  }
  public SetAsOfMode(v: string): void { this.EditAsOf = { ...this.EditAsOf, Mode: v as AsOfStrategy['Mode'] }; this.Dirty = true; }

  /** @deprecated Use {@link SetAsOfMode}. */
  public setAsOfMode(v: string): void {
    return this.SetAsOfMode(v);
  }
  public SetAsOfColumn(v: string): void { this.EditAsOf.Column = v; this.Dirty = true; }

  /** @deprecated Use {@link SetAsOfColumn}. */
  public setAsOfColumn(v: string): void {
    return this.SetAsOfColumn(v);
  }
  public SetAsOfOffset(v: string): void { const n = Number(v); if (!Number.isNaN(n)) { this.EditAsOf.OffsetDays = n; this.Dirty = true; } }

  /** @deprecated Use {@link SetAsOfOffset}. */
  public setAsOfOffset(v: string): void {
    return this.SetAsOfOffset(v);
  }
  public SetValStrategy(v: string): void { this.EditValidation = { ...this.EditValidation, Strategy: v as ValidationStrategy['Strategy'] }; this.Dirty = true; }

  /** @deprecated Use {@link SetValStrategy}. */
  public setValStrategy(v: string): void {
    return this.SetValStrategy(v);
  }
  public SetTestSize(v: string): void { const n = Number(v); if (!Number.isNaN(n)) { this.EditValidation.TestSize = n; this.Dirty = true; } }

  /** @deprecated Use {@link SetTestSize}. */
  public setTestSize(v: string): void {
    return this.SetTestSize(v);
  }
  public SetK(v: string): void { const n = Number(v); if (!Number.isNaN(n)) { this.EditValidation.K = n; this.Dirty = true; } }

  /** @deprecated Use {@link SetK}. */
  public setK(v: string): void {
    return this.SetK(v);
  }
  public SetHoldout(v: string): void { const n = Number(v); if (!Number.isNaN(n)) { this.EditValidation.LockedHoldoutFraction = n; this.Dirty = true; } }

  /** @deprecated Use {@link SetHoldout}. */
  public setHoldout(v: string): void {
    return this.SetHoldout(v);
  }

  // ---- add / delete nodes ----

  public AddSource(): void {
    this.editSources = [...this.editSources, { Kind: 'Entity', Ref: '' }];
    this.markDirty();
    this.SelectedId = `src:${this.editSources.length - 1}`;
  }

  /** @deprecated Use {@link AddSource}. */
  public addSource(): void {
    return this.AddSource();
  }
  public AddStep(): void {
    const id = `step_${++this.stepSeq}`;
    this.editSteps = [...this.editSteps, this.defaultStep('select', id)];
    this.markDirty();
    this.SelectedId = id;
  }

  /** @deprecated Use {@link AddStep}. */
  public addStep(): void {
    return this.AddStep();
  }
  public DeleteSelected(): void {
    const si = this.SelectedSourceIndex;
    if (si >= 0) {
      this.editSources = this.editSources.filter((_s, i) => i !== si);
      this.markDirty();
      this.SelectedId = this.Nodes[0]?.id ?? '';
      return;
    }
    const step = this.SelectedStep;
    if (step) {
      this.editSteps = this.editSteps.filter((s) => s.Id !== step.Id);
      // Drop the deleted id from any downstream Inputs.
      for (const s of this.editSteps) {
        if (s.Inputs?.includes(step.Id)) {
          s.Inputs = s.Inputs.filter((i) => i !== step.Id);
        }
      }
      this.markDirty();
      this.SelectedId = this.Nodes[0]?.id ?? '';
    }
  }

  /** @deprecated Use {@link DeleteSelected}. */
  public deleteSelected(): void {
    return this.DeleteSelected();
  }

  private defaultStep(kind: FeatureStepKind, id: string, label?: string, inputs?: string[]): FeatureStep {
    const base = { Id: id, Label: label, Inputs: inputs };
    switch (kind) {
      case 'select': return { ...base, Kind: 'select', Columns: [] };
      case 'impute': return { ...base, Kind: 'impute', Column: '', Strategy: 'mean' };
      case 'standardize': return { ...base, Kind: 'standardize', Columns: [] };
      case 'onehot': return { ...base, Kind: 'onehot', Column: '' };
      case 'bin': return { ...base, Kind: 'bin', Column: '', Bins: 5 };
      case 'embedding': return { ...base, Kind: 'embedding', Entity: '', EmbeddingModelRef: '', Dims: 384 };
      case 'llm-derived': return { ...base, Kind: 'llm-derived', FeaturePipelineRef: '' };
      case 'flow-agent': return { ...base, Kind: 'flow-agent', FlowAgentRef: '', InputMapping: {}, OutputMapping: {} };
      case 'vision-llm': return { ...base, Kind: 'vision-llm', ImageColumn: '', Prompt: { InlinePrompt: '' }, Output: { FeatureName: '', Kind: 'category' } };
    }
  }

  // ---- save / validate / train ----

  /** Serialize the editable state back onto the pipeline entity and Save(). */
  public async save(): Promise<void> {
    const p = this.selectedPipeline;
    if (!p || this.Busy) {
      return;
    }
    this.Busy = true;
    try {
      p.SourceBindings = JSON.stringify(this.editSources);
      p.FeatureSteps = JSON.stringify({ Steps: this.editSteps });
      p.TargetVariable = this.EditTargetVariable;
      p.ProblemType = this.EditProblemType;
      p.AlgorithmID = this.EditAlgorithmId;
      p.Hyperparameters = this.EditHyperparams || null;
      p.LeakageGuard = JSON.stringify(this.EditLeakage);
      p.AsOfStrategy = JSON.stringify(this.EditAsOf);
      p.ValidationStrategy = JSON.stringify(this.EditValidation);
      const ok = await p.Save();
      if (ok) {
        this.Dirty = false;
        this.notifications.CreateSimpleNotification(`Saved "${p.Name}".`, 'success', 3000);
      } else {
        this.notifications.CreateSimpleNotification(`Save failed: ${p.LatestResult?.CompleteMessage ?? 'unknown error'}`, 'error', 5000);
      }
    } finally {
      this.Busy = false;
      this.cdr.detectChanges();
    }
  }

  /** Client-side spec sanity check before training. */
  public validate(): void {
    const issues: string[] = [];
    if (this.editSources.length === 0) {
      issues.push('at least one source');
    }
    if (!this.EditTargetVariable) {
      issues.push('a target variable');
    }
    if (!this.EditAlgorithmId) {
      issues.push('an algorithm');
    }
    try {
      JSON.parse(this.EditHyperparams || '{}');
    } catch {
      issues.push('valid hyperparameters JSON');
    }
    if (issues.length > 0) {
      this.notifications.CreateSimpleNotification(`Pipeline needs ${issues.join(', ')}.`, 'warning', 4500);
    } else {
      this.notifications.CreateSimpleNotification('Pipeline looks valid — ready to train.', 'success', 3000);
    }
  }

  /** Run the pipeline via the Train Remote Op, then refresh the engine. */
  public async train(): Promise<void> {
    const p = this.selectedPipeline;
    if (!p || this.Busy || this.Dirty) {
      return;
    }
    this.Busy = true;
    this.notifications.CreateSimpleNotification(`Training "${p.Name}"…`, 'info', 2500);
    try {
      const op = new PredictiveStudioTrainModelOperation();
      const result = await op.Execute({ pipelineId: p.ID }, { provider: this.provider ?? undefined, user: this.CurrentUser ?? undefined });
      if (result.Success && result.Output) {
        const flagged = result.Output.leakageFlagged ? ' (leakage flag raised — needs sign-off)' : '';
        this.notifications.CreateSimpleNotification(`Trained ${p.Name} v${result.Output.version}${flagged}. See Registry.`, 'success', 5000);
        await this.engine.Config(true, this.CurrentUser ?? undefined, this.provider ?? undefined);
      } else {
        this.notifications.CreateSimpleNotification(result.ErrorMessage || 'Training failed.', 'error', 6000);
      }
    } catch (e) {
      this.notifications.CreateSimpleNotification(`Training error: ${e instanceof Error ? e.message : String(e)}`, 'error', 6000);
    } finally {
      this.Busy = false;
      this.cdr.detectChanges();
    }
  }

  public Refine(): void {
    const p = this.selectedPipeline;
    if (!p) {
      this.AskAgent.emit(this.StarterPrompt);
      return;
    }
    const predicts = p.TargetVariable ? ` (predicts ${p.TargetVariable})` : '';
    this.AskAgent.emit(`Help me refine the "${p.Name}" training pipeline${predicts}. Suggest improvements to the features or algorithm to raise holdout performance.`);
  }

  /** @deprecated Use {@link Refine}. */
  public refine(): void {
    return this.Refine();
  }

  public StatusClass(status: string | null): string {
    switch (status) {
      case 'Active': return 'green';
      case 'Draft': return 'amber';
      case 'Disabled': return 'gray';
      default: return 'gray';
    }
  }

  /** @deprecated Use {@link StatusClass}. */
  public statusClass(status: string | null): string {
    return this.StatusClass(status);
  }

  public NodeTypeLabel(type: NodeType): string {
    switch (type) {
      case 'src': return 'Source';
      case 'feat': return 'Feature step';
      case 'emb': return 'Embedding';
      case 'target': return 'Target';
      case 'algo': return 'Algorithm';
      case 'output': return 'Model output';
    }
  }

  /** @deprecated Use {@link NodeTypeLabel}. */
  public nodeTypeLabel(type: NodeType): string {
    return this.NodeTypeLabel(type);
  }

  // ---- layered layout (deterministic, topology-driven) ----

  private layoutDag(): void {
    this.nodeById = new Map(this.Nodes.map((n) => [n.id, n]));
    const incoming = new Map<string, string[]>();
    const outgoing = new Map<string, string[]>();
    for (const n of this.Nodes) {
      incoming.set(n.id, []);
      outgoing.set(n.id, []);
    }
    for (const e of this.Edges) {
      if (this.nodeById.has(e.from) && this.nodeById.has(e.to)) {
        outgoing.get(e.from)!.push(e.to);
        incoming.get(e.to)!.push(e.from);
      }
    }
    const depth = this.computeLayers(incoming, outgoing);
    const maxDepth = Math.max(0, ...depth.values());
    const columns: DagNode[][] = Array.from({ length: maxDepth + 1 }, () => []);
    for (const n of this.Nodes) {
      columns[depth.get(n.id) ?? 0].push(n);
    }
    this.positionColumns(columns);
  }

  private computeLayers(incoming: Map<string, string[]>, outgoing: Map<string, string[]>): Map<string, number> {
    const depth = new Map<string, number>(this.Nodes.map((n) => [n.id, 0]));
    const indeg = new Map<string, number>(this.Nodes.map((n) => [n.id, incoming.get(n.id)!.length]));
    const queue = this.Nodes.filter((n) => indeg.get(n.id) === 0).map((n) => n.id);
    while (queue.length) {
      const id = queue.shift()!;
      const d = depth.get(id)!;
      for (const next of outgoing.get(id)!) {
        depth.set(next, Math.max(depth.get(next)!, d + 1));
        indeg.set(next, indeg.get(next)! - 1);
        if (indeg.get(next) === 0) {
          queue.push(next);
        }
      }
    }
    return depth;
  }

  private positionColumns(columns: DagNode[][]): void {
    const colStep = NODE_W + COL_GAP;
    const rowStep = NODE_H + ROW_GAP;
    const tallest = Math.max(1, ...columns.map((c) => c.length));
    const contentH = tallest * NODE_H + (tallest - 1) * ROW_GAP;
    columns.forEach((col, ci) => {
      const x = PAD_X + ci * colStep;
      const colH = col.length * NODE_H + (col.length - 1) * ROW_GAP;
      const yStart = PAD_Y + (contentH - colH) / 2;
      col.forEach((node, ri) => {
        node.x = x;
        node.y = yStart + ri * rowStep;
      });
    });
    this.CanvasW = PAD_X * 2 + columns.length * NODE_W + (columns.length - 1) * COL_GAP;
    this.CanvasH = PAD_Y * 2 + contentH;
  }

  public EdgePath(edge: DagEdge): string {
    const from = this.nodeById.get(edge.from);
    const to = this.nodeById.get(edge.to);
    if (!from || !to) {
      return '';
    }
    const sx = from.x + NODE_W;
    const sy = from.y + NODE_H / 2;
    const tx = to.x;
    const ty = to.y + NODE_H / 2;
    const dx = tx - sx;
    const c1x = sx + dx * 0.5;
    const c2x = tx - dx * 0.5;
    return `M ${sx} ${sy} C ${c1x} ${sy}, ${c2x} ${ty}, ${tx} ${ty}`;
  }

  /** @deprecated Use {@link EdgePath}. */
  public edgePath(edge: DagEdge): string {
    return this.EdgePath(edge);
  }
}
