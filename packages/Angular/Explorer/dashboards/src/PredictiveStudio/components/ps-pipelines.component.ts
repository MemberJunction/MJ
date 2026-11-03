import { ChangeDetectorRef, Component, EventEmitter, Input, OnChanges, OnInit, Output, SimpleChanges, ViewEncapsulation, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { MJButtonDirective } from '@memberjunction/ng-ui-components';
import { MJNotificationService } from '@memberjunction/ng-notifications';
import { UUIDsEqual } from '@memberjunction/global';
import { CompositeKey, IMetadataProvider, Metadata, UserInfo } from '@memberjunction/core';
import { MJMLTrainingPipelineEntity, MJMLModelEntity, PredictiveStudioTrainModelOperation, UserInfoEngine, type PredictiveStudioTrainModelOutput } from '@memberjunction/core-entities';
import { NavigationService } from '@memberjunction/ng-shared';
import { AngularSplitModule } from 'angular-split';
import { PSPipelineWizardComponent } from './ps-pipeline-wizard.component';
import {
  DOMINANCE_THRESHOLD_DEFAULT,
  parseDenyList,
  type SourceBinding,
  type FeatureStepGraph,
  type FeatureStep,
  type FeatureStepKind,
  type AsOfStrategy,
  type LeakageGuard,
  type ProblemType,
  type GateOutcome,
  JsonParse,
  type JsonObject,
} from '@memberjunction/predictive-studio-core';
import { PSPanelKey } from '../predictive-studio.types';
import { PublishedModelTag, ReadStoredGate, type PSPublishedModelTag, type PSStoredGate } from '../predictive-studio.view-models';
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

const NODE_W = 230;
const NODE_H = 96;
const COL_GAP = 96;
const ROW_GAP = 28;
const PAD_X = 40;
const PAD_Y = 40;

const SOURCE_KINDS: SourceBinding['Kind'][] = ['Entity', 'Query', 'ExternalEntity', 'VectorSet', 'FeaturePipeline'];
/**
 * The step kinds the picker offers: the ones that change what trains. `select` produces the feature columns and
 * `impute` sets a numeric column's fill (Engine feature-resolution.ts, Sidecar snapshot.py `_policies`). Every other
 * kind is either ignored by the trainer or refused by the assembler; see TRAINER_STEP_NOTES.
 */
const STEP_KINDS: FeatureStepKind[] = ['select', 'impute'];

/**
 * What the trainer does with a saved step of a kind the picker does not offer. `standardize` and `onehot` only name
 * columns: the assembler one-hot encodes every categorical (as-of-assembler.ts BuildPreprocessingOps) and the trainer
 * scales every numeric (Sidecar encoding.py `_numeric_pipe`); `bin` ops are dropped (snapshot.py `_policies` reads
 * impute ops only). The other four are refused by FeatureResolver.ResolveStep, so training fails on them.
 * `windowed-aggregate` and `series` produce columns, so they carry no note.
 */
const TRAINER_STEP_NOTES: Partial<Record<FeatureStepKind, string>> = {
  standardize: 'Ignored by the trainer: it standardizes every numeric column anyway.',
  onehot: 'Ignored by the trainer: it one-hot encodes every text column anyway.',
  bin: 'Ignored by the trainer: it does not bin columns.',
  embedding: 'Training refuses this step: the trainer cannot assemble an embedding step.',
  'llm-derived': 'Training refuses this step: the trainer cannot assemble an llm-derived step.',
  'flow-agent': 'Training refuses this step: the trainer cannot assemble a flow-agent step.',
  'vision-llm': 'Training refuses this step: the trainer cannot assemble a vision-llm step.',
};
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
  'windowed-aggregate': 'fa-solid fa-calendar-days',
  series: 'fa-solid fa-chart-line',
};

/** Whether a pipeline can score, read from its stored state, and the sentence that says why. */
export interface PSInferenceReadiness {
  /** True only when a published model's training run stored a gate decision that shipped it. */
  Ready: boolean;
  /** What the readiness rests on: the published model the gate shipped, or why there is none. */
  Detail: string;
}

const PS_PIPELINES_STARTER_PROMPT =
  'Help me build a training pipeline. I will tell you what I want to predict and on which entity; ' +
  'you assemble the features (guarding against leakage), pick an algorithm, and train a versioned model.';

@Component({
  standalone: true,
  selector: 'ps-pipelines',
  imports: [CommonModule, MJButtonDirective, PSPipelineWizardComponent, AngularSplitModule],
  encapsulation: ViewEncapsulation.None,
  styleUrls: ['../predictive-studio.shared.css', './ps-pipelines.component.css'],
  template: `
    <div class="ps-panel ps-pipelines" data-testid="ps-pipelines-panel">
      @if (Pipelines.length === 0) {
        <div class="ps-empty" data-testid="ps-pipelines-empty">
          <span class="ps-empty-ico"><i class="fa-solid fa-diagram-project"></i></span>
          <h3>No training pipelines yet</h3>
          <p>
            A training pipeline assembles features from your data, picks an algorithm, and trains a
            versioned model. You can build one step-by-step with the manual wizard or ask the Model
            Development Agent to design one for you.
          </p>
          <div class="empty-actions" style="display: flex; gap: 8px; margin-top: 12px;">
            <button mjButton variant="primary" size="sm" data-testid="ps-pipelines-new-btn-empty"
              (click)="OpenWizard()">
              <i class="fa-solid fa-plus"></i> New Pipeline
            </button>
            <button mjButton variant="secondary" size="sm" data-testid="ps-pipelines-ask-agent"
              (click)="AskAgent.emit(StarterPrompt)">
              <i class="fa-solid fa-robot"></i> Ask the agent
            </button>
          </div>
        </div>
      } @else {
        <div class="pl-layout" [class.catalog-collapsed]="IsCatalogCollapsed">
          @if (IsCatalogCollapsed) {
            <div class="pl-collapsed-strip" role="region" aria-label="Pipelines catalog (collapsed)">
              <button class="pl-rail-collapse" type="button" (click)="ToggleCatalog()" aria-label="Expand pipelines catalog" title="Expand catalog">
                <i class="fa-solid fa-chevron-right"></i>
              </button>
              <div class="pl-collapsed-strip-label"><i class="fa-solid fa-diagram-project"></i></div>
            </div>
          }

          <as-split direction="horizontal" class="pl-splitter" unit="percent" [gutterSize]="6" (dragEnd)="OnSplitDragEnd($event.sizes)">
            @if (!IsCatalogCollapsed) {
              <as-split-area [size]="CatalogSizePct" [minSize]="18" [maxSize]="50">
                <!-- Left Column: Master Pipeline Catalog -->
                <div class="pl-catalog" data-testid="ps-pipelines-catalog">
                  <div class="pl-catalog-header">
                    <div class="pl-catalog-title-row">
                      <h2>Pipelines ({{ FilteredPipelines.length }})</h2>
                      <div style="display:flex;gap:6px;align-items:center">
                        <button mjButton variant="primary" size="sm" data-testid="ps-pipelines-new" (click)="OpenWizard()">
                          <i class="fa-solid fa-plus"></i> New
                        </button>
                        <button class="pl-collapse-btn" type="button" (click)="ToggleCatalog()" title="Collapse catalog" aria-label="Collapse catalog">
                          <i class="fa-solid fa-chevron-left"></i>
                        </button>
                      </div>
                    </div>
                    <div class="pl-search-box">
                      <i class="fa-solid fa-magnifying-glass"></i>
                      <input type="text" [value]="SearchQuery" (input)="OnSearchInput($event)" placeholder="Filter pipelines..." />
                    </div>
                    <div class="pl-filter-chips">
                      <button class="pl-filter-chip" [class.active]="ActiveFilter === 'all'" (click)="SetFilter('all')">All</button>
                      <button class="pl-filter-chip" [class.active]="ActiveFilter === 'published'" (click)="SetFilter('published')">Published</button>
                      <button class="pl-filter-chip" [class.active]="ActiveFilter === 'draft'" (click)="SetFilter('draft')">Draft</button>
                      <button class="pl-filter-chip" [class.active]="ActiveFilter === 'core'" (click)="SetFilter('core')">MJ Core</button>
                    </div>
                  </div>

                  <!-- Scrollable Catalog Cards List (preserves data-testid="ps-pipelines-picker" and "ps-pipelines-pill") -->
                  <div class="pl-picker" data-testid="ps-pipelines-picker">
                    @for (p of FilteredPipelines; track p.ID) {
                      <button class="pl-pill pipeline-card" [class.on]="IsSelectedPipeline(p)"
                        data-testid="ps-pipelines-pill" (click)="SelectPipeline(p.ID)" [title]="p.Name">
                        <div class="pl-card-top">
                          <div class="pl-card-name">{{ p.Name }}</div>
                          <span class="ps-badge" [class]="StatusClass(p.Status)">{{ p.Status }}</span>
                        </div>
                        <div class="pl-card-meta">
                          <span class="pl-entity-tag">{{ TargetEntityName(p) }}</span>
                          <span>&bull;</span>
                          <span class="pl-target-tag">{{ p.TargetVariable || 'Target' }}</span>
                        </div>
                        <div class="pl-card-meta" style="justify-content: space-between; margin-top: 2px;">
                          <span>{{ p.ProblemType }}</span>
                          @if (BestModelForPipeline(p); as bm) {
                            <span class="pl-metric-badge">@if (ModelTag(bm) === 'winner') {<i class="fa-solid fa-trophy pl-metric-trophy"></i> }{{ FormatHoldout(bm) }}</span>
                          }
                        </div>
                      </button>
                    }
                  </div>
                </div>
              </as-split-area>
            }

            <as-split-area [size]="IsCatalogCollapsed ? 100 : WorkspaceSizePct" [minSize]="40">
              <!-- Right Column: Human-Centric Workspace (Stages View Default + DAG View Toggle) -->
              <div class="pl-workspace" data-testid="ps-pipelines-workspace">
            <div class="pl-workspace-header">
              <div class="pl-workspace-title-area">
                <div class="pl-breadcrumbs">
                  <span>Pipelines</span> <i class="fa-solid fa-chevron-right" style="font-size: 10px;"></i>
                  <span>{{ PipelineDomain(SelectedPipeline) }}</span> <i class="fa-solid fa-chevron-right" style="font-size: 10px;"></i>
                  <strong>{{ SelectedPipeline?.Name }}</strong>
                </div>
                <div class="pl-title-row">
                  <h1>{{ SelectedPipeline?.Name }}</h1>
                  @if (SelectedPipeline) {
                    <span class="ps-badge" [class]="StatusClass(SelectedPipeline.Status)">{{ SelectedPipeline.Status }}</span>
                    @if (BestModelForPipeline(SelectedPipeline); as bm) {
                      <span class="pl-metric-badge">@if (ModelTag(bm) === 'winner') {<i class="fa-solid fa-trophy pl-metric-trophy"></i> }{{ FormatHoldout(bm) }}</span>
                    }
                  }
                </div>
              </div>

              <!-- Action Toolbar -->
              <div class="pl-toolbar">
                <button mjButton variant="secondary" size="sm" (click)="ToggleViewMode()" [title]="IsGraphView ? 'Switch to 5-Stage Progressive Flow' : 'Switch to Pipeline Graph View'">
                  <i class="fa-solid" [class.fa-diagram-project]="!IsGraphView" [class.fa-layer-group]="IsGraphView"></i>
                  {{ IsGraphView ? 'Stages View' : 'Graph View' }}
                </button>
                <button mjButton variant="secondary" size="sm" data-testid="ps-pipelines-clone" [disabled]="!SelectedPipeline" (click)="CloneSelected()">
                  <i class="fa-solid fa-copy"></i> Clone
                </button>
                <button mjButton variant="secondary" size="sm" data-testid="ps-pipelines-save" [disabled]="!Dirty || Busy" (click)="save()">
                  <i class="fa-solid fa-floppy-disk"></i> Save
                </button>
                <button mjButton variant="secondary" size="sm" data-testid="ps-pipelines-validate" [disabled]="Busy" (click)="validate()">
                  <i class="fa-solid fa-circle-check"></i> Validate
                </button>
                <button mjButton variant="primary" size="sm" data-testid="ps-pipelines-train" [disabled]="Busy || Dirty" (click)="train()">
                  <i class="fa-solid fa-play"></i> Train
                </button>
                <button mjButton variant="secondary" size="sm" (click)="Refine()">
                  <i class="fa-solid fa-wand-magic-sparkles"></i> Agent
                </button>
                @if (Dirty) { <span class="ps-tag amber" data-testid="ps-pipelines-dirty"><i class="fa-solid fa-pen"></i> Unsaved</span> }
              </div>
            </div>

            <!-- Stages View (Human-Readable Progressive Stages) -->
            @if (ViewMode === 'stages') {
              <div class="pl-stages-body">
                <!-- STAGE 1: Target Definition & Decision Boundary -->
                <div class="pl-stage-card">
                  <div class="pl-stage-header">
                    <div class="pl-stage-title-left">
                      <span class="pl-stage-num">1</span>
                      <div>
                        <h3>Target Definition & Temporal Decision Boundary</h3>
                        <span class="pl-stage-subtitle">Defines the training unit entity, target variable, problem type, and point-in-time cutoff.</span>
                      </div>
                    </div>
                  </div>

                  <div class="pl-grid-4">
                    <div class="pl-metric-box">
                      <label>Target Entity</label>
                      <div class="val"><i class="fa-solid fa-table" style="color:var(--mj-brand-primary)"></i> {{ TargetEntityName(SelectedPipeline) }}</div>
                      <div class="sub">Primary training unit</div>
                    </div>
                    <div class="pl-metric-box">
                      <label>Target Variable</label>
                      <div class="val"><i class="fa-solid fa-bullseye" style="color:var(--mj-status-warning)"></i> {{ EditTargetVariable || 'Not set' }}</div>
                      <div class="sub">{{ EditProblemType }} outcome</div>
                    </div>
                    <div class="pl-metric-box">
                      <label>Problem Type</label>
                      <div class="val"><i class="fa-solid fa-chart-pie" style="color:var(--mj-brand-primary)"></i> {{ EditProblemType }}</div>
                      <div class="sub">Optimization discipline</div>
                    </div>
                    <div class="pl-metric-box" style="border-left: 3px solid var(--mj-brand-primary);">
                      <label>As-Of Temporal Anchor</label>
                      <div class="val"><i class="fa-solid fa-clock-rotate-left" style="color:var(--mj-brand-primary)"></i> {{ AsOfLabel }}</div>
                      <div class="sub">Temporal cutoff to prevent leakage</div>
                    </div>
                  </div>
                </div>

                <!-- STAGE 2: Feature Architecture & Relational Sources -->
                <div class="pl-stage-card">
                  <div class="pl-stage-header">
                    <div class="pl-stage-title-left">
                      <span class="pl-stage-num">2</span>
                      <div>
                        <h3>Feature Architecture & Relational Data Sources</h3>
                        <span class="pl-stage-subtitle">Combines core entity attributes with linked relational features across the database.</span>
                      </div>
                    </div>
                    <div style="display:flex; gap:6px;">
                      @if (!IsUnitBound) {
                        <button mjButton variant="secondary" size="sm" data-testid="ps-pipelines-add-source" (click)="AddSource()"><i class="fa-solid fa-plus"></i> Add Source</button>
                      }
                      <button mjButton variant="secondary" size="sm" data-testid="ps-pipelines-add-step" (click)="AddStep()"><i class="fa-solid fa-sliders"></i> Add Step</button>
                    </div>
                  </div>

                  <div class="pl-grid-3">
                    <!-- Feature Group: Sources -->
                    <div class="pl-feature-group">
                      <div class="pl-fg-head">
                        <span><i class="fa-solid fa-database"></i> Feed-In Sources ({{ EditSources.length }})</span>
                      </div>
                      <div class="pl-fg-body">
                        @for (s of EditSources; track $index) {
                          <div class="pl-feature-row">
                            <span class="pl-feature-name">{{ s.Ref || 'Unnamed source' }}</span>
                            <span class="ps-tag">{{ s.Kind }}</span>
                          </div>
                        }
                      </div>
                    </div>

                    <!-- Feature Group: Feature Steps -->
                    <div class="pl-feature-group">
                      <div class="pl-fg-head">
                        <span><i class="fa-solid fa-sliders"></i> Feature Transforms ({{ EditSteps.length }})</span>
                      </div>
                      <div class="pl-fg-body">
                        @for (st of EditSteps; track st.Id) {
                          <div class="pl-feature-card" data-testid="ps-pipelines-step-card" (click)="SelectStep(st.Id)">
                            <div class="pl-feature-card-header">
                              <span class="pl-feature-name">{{ st.Label || st.Kind }}</span>
                              <span class="ps-tag">{{ st.Kind }}</span>
                            </div>
                            @if (TrainerStepNote(st); as note) {
                              <div class="ps-small ps-step-trainer-note" data-testid="ps-pipelines-step-trainer-note"><i class="fa-solid fa-circle-exclamation"></i> {{ note }}</div>
                            }
                            @if (GetStepColumns(st); as cols) {
                              @if (cols.length > 0) {
                                <div class="pl-col-chips">
                                  @for (col of cols; track col) {
                                    <span class="pl-col-chip">{{ col }}</span>
                                  }
                                </div>
                              }
                            }
                            @if (GetStepInputs(st); as inputs) {
                              @if (inputs.length > 0) {
                                <div class="pl-step-inputs">
                                  <i class="fa-solid fa-arrow-right-to-bracket"></i>
                                  <span>From: {{ inputs.join(', ') }}</span>
                                </div>
                              }
                            }
                          </div>
                        }
                      </div>
                    </div>

                    <!-- Feature Group: Algorithm Selection -->
                    <div class="pl-feature-group">
                      <div class="pl-fg-head">
                        <span><i class="fa-solid fa-shapes"></i> Selected Algorithm</span>
                      </div>
                      <div class="pl-fg-body">
                        <div class="pl-feature-row">
                          <span class="pl-feature-name">{{ SelectedAlgorithmName }}</span>
                          <span class="ps-tag primary">Active</span>
                        </div>
                      </div>
                    </div>
                  </div>

                  <!-- Leakage Guard Bar -->
                  <div class="pl-leakage-box">
                    <i class="fa-solid fa-shield-halved"></i>
                    <div style="flex:1;">
                      <div style="font-size:13px; font-weight:700; color:var(--mj-text-primary);">Leakage Guard Active</div>
                      <div style="font-size:12px; color:var(--mj-text-secondary); margin-top:2px;">
                        Deny-listed columns are excluded prior to matrix assembly. Dominance threshold: <strong>{{ EditLeakage.SingleFeatureDominanceThreshold }}</strong>
                      </div>
                      <div style="margin-top:6px;">
                        @if (EditLeakage.DenyFields.length === 0) {
                          <span style="font-size:12px; color:var(--mj-text-muted);">No deny-list columns configured.</span>
                        } @else {
                          @for (col of EditLeakage.DenyFields; track col) {
                            <span class="pl-deny-chip">{{ col }}</span>
                          }
                        }
                      </div>
                    </div>
                  </div>
                </div>

                <!-- STAGE 3: Preprocessing & Data Hygiene -->
                <div class="pl-stage-card">
                  <div class="pl-stage-header">
                    <div class="pl-stage-title-left">
                      <span class="pl-stage-num">3</span>
                      <div>
                        <h3>Fitted Preprocessing & Validation Discipline</h3>
                        <span class="pl-stage-subtitle">Parameters fitted once on training folds and frozen with the model artifact for inference anti-skew.</span>
                      </div>
                    </div>
                  </div>

                  <div class="pl-grid-4">
                    <div class="pl-metric-box">
                      <label>Holdout &amp; Folds</label>
                      <div class="sub" data-testid="ps-pipelines-evaluation-source">{{ EvaluationSourceText }}</div>
                    </div>
                    <div class="pl-metric-box">
                      <label>Anti-Skew Guarantee</label>
                      <div class="val"><i class="fa-solid fa-lock" style="color:var(--mj-status-success)"></i> Enforced</div>
                      <div class="sub">Frozen params travel with model</div>
                    </div>
                  </div>
                </div>

                <!-- STAGE 4: Multi-Algorithm Tournament & Leaderboard -->
                <div class="pl-stage-card">
                  <div class="pl-stage-header">
                    <div class="pl-stage-title-left">
                      <span class="pl-stage-num">4</span>
                      <div>
                        <h3>Multi-Algorithm Tournament Leaderboard</h3>
                        <span class="pl-stage-subtitle">Models trained and scored on locked holdout data for this pipeline.</span>
                      </div>
                    </div>
                  </div>

                  @if (PipelineModels.length === 0) {
                    <div style="padding: 16px; text-align: center; color: var(--mj-text-muted); font-size: 13px;">
                      <i class="fa-solid fa-flask" style="font-size: 24px; margin-bottom: 8px; display: block; opacity: 0.5;"></i>
                      No models trained yet for this pipeline. Click <strong>Train</strong> to execute the first training run.
                    </div>
                  } @else {
                    <table class="pl-table">
                      <thead>
                        <tr>
                          <th>Version</th>
                          <th>Algorithm</th>
                          <th>Holdout Score</th>
                          <th>Status</th>
                          <th>Trained At</th>
                          <th></th>
                        </tr>
                      </thead>
                      <tbody>
                        @for (m of PipelineModels; track m.ID) {
                          <tr [class.winner-row]="ModelTag(m) === 'winner'" class="pl-model-row" (click)="OpenModelRecord(m.ID)" style="cursor:pointer;" title="Open model record in Explorer">
                            <td>
                              <div style="display:flex;align-items:center;gap:6px">
                                <a class="pl-model-link" href="javascript:void(0)" (click)="$event.stopPropagation(); OpenModelRecord(m.ID)">
                                  <strong>v{{ m.Version }}</strong>
                                </a>
                                @if (ModelTag(m) === 'winner') {
                                  <span class="ps-tag success"><i class="fa-solid fa-trophy"></i> Winner</span>
                                } @else if (ModelTag(m) === 'kept-baseline') {
                                  <span class="ps-tag" data-testid="ps-pipelines-kept-baseline">Kept a simple baseline</span>
                                } @else if (ModelTag(m) === 'not-evaluated') {
                                  <span class="ps-tag" data-testid="ps-pipelines-not-evaluated">Not evaluated</span>
                                }
                              </div>
                            </td>
                            <td>{{ m.Algorithm || 'Algorithm' }}</td>
                            <td><strong>{{ FormatHoldout(m) }}</strong></td>
                            <td><span class="ps-badge" [class]="StatusClass(m.Status)">{{ m.Status }}</span></td>
                            <td>{{ m.TrainedAt | date:'short' }}</td>
                            <td style="text-align:right">
                              <button type="button" class="pl-action-icon-btn" (click)="$event.stopPropagation(); OpenModelRecord(m.ID)" title="Open model record in Explorer">
                                <i class="fa-solid fa-arrow-up-right-from-square"></i>
                              </button>
                            </td>
                          </tr>
                        }
                      </tbody>
                    </table>
                  }
                </div>

                <!-- STAGE 5: Production Serving & Deep Link -->
                <div class="pl-stage-card">
                  <div class="pl-stage-header">
                    <div class="pl-stage-title-left">
                      <span class="pl-stage-num">5</span>
                      <div>
                        <h3>Production Serving & Model Registry</h3>
                        <span class="pl-stage-subtitle">Active inference wiring and model registry status.</span>
                      </div>
                    </div>
                    <div style="display:flex;gap:8px;align-items:center;">
                      @if (PublishedModel; as pub) {
                        <button mjButton variant="secondary" size="sm" type="button"
                          (click)="OpenModelRecord(pub.ID)"
                          title="Open model record in Explorer">
                          <i class="fa-solid fa-arrow-up-right-from-square"></i> Open Model Record
                        </button>
                        <button mjButton variant="secondary" size="sm" type="button"
                          (click)="ViewTrainingRuns(pub.ID)"
                          title="View training runs for this model">
                          <i class="fa-solid fa-flask"></i> View Training Runs
                        </button>
                      }
                    </div>
                  </div>

                  <div class="pl-serving-box">
                    <div class="pl-metric-box" data-testid="ps-pipelines-serving-model">
                      <label>Active Serving Model</label>
                      <div class="val">
                        @if (ServingModel; as srv) {
                          <span>v{{ srv.Version }} ({{ srv.Algorithm || 'Model' }}) &bull; ID: {{ srv.ID.slice(0, 8) }}…</span>
                        } @else {
                          <span style="color:var(--mj-text-muted);">No published model serving live predictions yet.</span>
                        }
                      </div>
                      <div class="sub">Model: {{ ServingModel?.Status || 'None published' }} &bull; Pipeline: {{ SelectedPipeline?.Status }}</div>
                    </div>
                    @if (InferenceReadiness; as readiness) {
                      <div class="pl-metric-box pl-readiness" [class.ready]="readiness.Ready" data-testid="ps-pipelines-readiness">
                        <label>Inference Readiness</label>
                        <div class="val">
                          @if (readiness.Ready) {
                            <i class="fa-solid fa-circle-check"></i> Ready
                          } @else {
                            <i class="fa-solid fa-circle-xmark"></i> Not ready
                          }
                        </div>
                        <div class="sub">{{ readiness.Detail }}</div>
                      </div>
                    }
                  </div>
                </div>

              </div>
            }

            <!-- Graph Canvas & Inspector -->
            @if (IsGraphView) {
              <div class="builder">
                <as-split direction="horizontal" class="builder-splitter" unit="percent" [gutterSize]="6" (dragEnd)="OnInspectorSplitDragEnd($event.sizes)">
                  <as-split-area [size]="IsInspectorCollapsed ? 100 : CanvasSizePct" [minSize]="40">
                    <!-- Canvas Wrap -->
                    <div class="canvas-wrap">
                      <div class="canvas-bar">
                        <div class="canvas-bar-left">
                          <span class="ps-small ps-muted" style="font-weight:600">Add to Graph:</span>
                          @if (!IsUnitBound) {
                            <button class="ps-pchip s" data-testid="ps-pipelines-add-source" (click)="AddSource()"><i class="fa-solid fa-database"></i> Source</button>
                          }
                          <button class="ps-pchip f" data-testid="ps-pipelines-add-step" (click)="AddStep()"><i class="fa-solid fa-sliders"></i> Feature step</button>
                        </div>
                        <div class="canvas-bar-right">
                          <div class="ps-zoom-controls">
                            <button class="ps-icon-btn" (click)="ZoomOut()" [disabled]="ZoomLevel <= 0.5" title="Zoom Out"><i class="fa-solid fa-minus"></i></button>
                            <span class="ps-zoom-label" (click)="ResetZoom()" title="Reset to 100%">{{ Math.round(ZoomLevel * 100) }}%</span>
                            <button class="ps-icon-btn" (click)="ZoomIn()" [disabled]="ZoomLevel >= 2.0" title="Zoom In"><i class="fa-solid fa-plus"></i></button>
                          </div>
                          <button class="ps-icon-btn" [class.active]="!IsInspectorCollapsed" (click)="ToggleInspector()" [title]="IsInspectorCollapsed ? 'Open Inspector' : 'Collapse Inspector'">
                            <i class="fa-solid fa-circle-info"></i>
                          </button>
                          <span class="ps-small ps-muted ps-node-count"><i class="fa-solid fa-circle-nodes"></i> {{ Nodes.length }} nodes · {{ Edges.length }} edges</span>
                        </div>
                      </div>

                  <div class="ps-flow big" data-testid="ps-pipelines-canvas">
                    <div class="ps-graph-viewport"
                         [style.width.px]="CanvasW"
                         [style.height.px]="CanvasH"
                         [style.transform]="'scale(' + ZoomLevel + ')'">
                      <svg class="ps-graph-edges"
                           data-testid="ps-pipelines-edges"
                           [attr.width]="CanvasW"
                           [attr.height]="CanvasH">
                        <defs>
                          <marker id="ps-arrow" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="6" markerHeight="6" orient="auto">
                            <path d="M 0 1.5 L 8 5 L 0 8.5 z" fill="var(--mj-border-strong)" />
                          </marker>
                          <marker id="ps-arrow-active" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="6" markerHeight="6" orient="auto">
                            <path d="M 0 1.5 L 8 5 L 0 8.5 z" fill="var(--mj-brand-primary)" />
                          </marker>
                        </defs>
                        @for (edge of Edges; track edge.from + '->' + edge.to) {
                          <path class="ps-edge-path"
                                [class.active]="IsEdgeActive(edge)"
                                [attr.d]="EdgePath(edge)"
                                [attr.marker-end]="IsEdgeActive(edge) ? 'url(#ps-arrow-active)' : 'url(#ps-arrow)'"></path>
                        }
                      </svg>
                      @for (node of Nodes; track node.id) {
                        <div class="ps-node" data-testid="ps-pipelines-node" [attr.data-node-id]="node.id"
                          [ngClass]="node.type" [class.selected]="node.id === SelectedId"
                          [style.left.px]="node.x" [style.top.px]="node.y"
                          [style.width.px]="NODE_W"
                          (click)="SelectNode(node.id)">
                          <div class="nh">
                            <i class="tile" [ngClass]="node.icon"></i>
                            <span class="ps-node-title" [title]="node.title">{{ node.title }}</span>
                            @if (node.tag) { <span class="ps-tag">{{ node.tag }}</span> }
                          </div>
                          <div class="nb">
                            @for (row of node.rows; track row.k) {
                              <div class="nb-row">
                                <span class="k">{{ row.k }}</span>
                                <span class="v" [title]="row.v">{{ row.v }}</span>
                              </div>
                            }
                          </div>
                          @if (node.hasIn) { <span class="port in"></span> }
                          @if (node.hasOut) { <span class="port out"></span> }
                        </div>
                      }
                    </div>
                  </div>

                  <div class="flow-toolbar">
                    <div class="legend">
                      <span><i class="sw src"></i> Source</span>
                      <span><i class="sw feat"></i> Feature</span>
                      <span><i class="sw emb"></i> Embedding</span>
                      <span><i class="sw target"></i> Target</span>
                      <span><i class="sw algo"></i> Algorithm</span>
                      <span><i class="sw output"></i> Model</span>
                    </div>
                  </div>
                </div>
              </as-split-area>

            @if (!IsInspectorCollapsed) {
              <as-split-area [size]="InspectorSizePct" [minSize]="20" [maxSize]="55">
                <!-- Inspector -->
                <div class="ps-col inspector" data-testid="ps-pipelines-inspector">
                  <div class="ps-card insp">
                    <div class="ihead">
                      <i class="tile" [ngClass]="SelectedNode.icon" [attr.data-type]="SelectedNode.type"></i>
                      <div style="flex:1">
                        <h3 data-testid="ps-pipelines-inspector-title">{{ SelectedNode.title }}</h3>
                        <div class="ps-small ps-muted">{{ NodeTypeLabel(SelectedNode.type) }} · selected</div>
                      </div>
                      <button class="insp-collapse-btn" type="button" (click)="ToggleInspector()" title="Collapse inspector" aria-label="Collapse inspector">
                        <i class="fa-solid fa-chevron-right"></i>
                      </button>
                      @if ((SelectedNode.type === 'src' && !IsUnitBound) || SelectedNode.type === 'feat' || SelectedNode.type === 'emb') {
                        <button mjButton variant="secondary" size="sm" data-testid="ps-pipelines-delete" (click)="DeleteSelected()"><i class="fa-solid fa-trash"></i></button>
                      }
                    </div>
                    <div class="ps-card-body">
                      @if (SelectedSource && IsUnitBound) {
                        <div class="ps-field"><label>Kind</label><span>{{ SelectedSource.Kind }}</span></div>
                        <div class="ps-field"><label>Reference (entity / query / id)</label><span>{{ SelectedSource.Ref }}</span></div>
                        <div class="ps-field"><label>Alias (optional)</label><span>{{ SelectedSource.Alias || '—' }}</span></div>
                        <p class="ps-muted ps-small" data-testid="ps-pipelines-unit-source-note">{{ UnitSourceNote }}</p>
                      } @else if (SelectedSource) {
                        <div class="ps-field"><label>Kind</label>
                          <select class="mj-input" [value]="SelectedSource.Kind" (change)="SetSourceKind(InputVal($event))">
                            @for (k of SourceKinds; track k) { <option [value]="k">{{ k }}</option> }
                          </select>
                        </div>
                        <div class="ps-field"><label>Reference (entity / query / id)</label>
                          <input class="mj-input" type="text" [value]="SelectedSource.Ref" (input)="SetSourceRef(InputVal($event))" />
                        </div>
                        <div class="ps-field"><label>Alias (optional)</label>
                          <input class="mj-input" type="text" [value]="SelectedSource.Alias || ''" (input)="SetSourceAlias(InputVal($event))" />
                        </div>
                      }
                      @if (SelectedStep) {
                        <div class="ps-field"><label>Kind</label>
                          <select class="mj-input" data-testid="ps-pipelines-step-kind" [value]="SelectedStep.Kind" (change)="SetStepKind(InputVal($event))">
                            @for (k of StepKindOptions; track k) { <option [value]="k" [selected]="k === SelectedStep.Kind">{{ k }}</option> }
                          </select>
                        </div>
                        @if (TrainerStepNote(SelectedStep); as note) {
                          <p class="ps-small ps-step-trainer-note" data-testid="ps-pipelines-step-trainer-note"><i class="fa-solid fa-circle-exclamation"></i> {{ note }}</p>
                        }
                        <div class="ps-field"><label>Label</label>
                          <input class="mj-input" type="text" [value]="SelectedStep.Label || ''" (input)="SetStepLabel(InputVal($event))" />
                        </div>
                        @switch (SelectedStep.Kind) {
                          @case ('select') { <div class="ps-field"><label>Columns (comma-separated)</label><input class="mj-input" type="text" [value]="ColumnsText" (input)="SetColumns(InputVal($event))" /></div> }
                          @case ('standardize') { <div class="ps-field"><label>Columns (comma-separated)</label><input class="mj-input" type="text" [value]="ColumnsText" (input)="SetColumns(InputVal($event))" /></div> }
                          @case ('impute') {
                            <div class="ps-field"><label>Column</label><input class="mj-input" type="text" [value]="StepField('Column')" (input)="SetStepStr('Column', InputVal($event))" /></div>
                            <div class="ps-field"><label>Strategy</label><select class="mj-input" [value]="StepField('Strategy')" (change)="SetStepStr('Strategy', InputVal($event))">@for (s of ImputeStrategies; track s) { <option [value]="s">{{ s }}</option> }</select></div>
                            @if (StepField('Strategy') === 'constant') {
                              <div class="ps-field"><label>Fill value</label><input class="mj-input" type="number" data-testid="ps-pipelines-impute-fill" [value]="StepField('FillValue')" (input)="SetStepNum('FillValue', InputVal($event))" /></div>
                            }
                          }
                          @case ('onehot') { <div class="ps-field"><label>Column</label><input class="mj-input" type="text" [value]="StepField('Column')" (input)="SetStepStr('Column', InputVal($event))" /></div> }
                          @case ('bin') {
                            <div class="ps-field"><label>Column</label><input class="mj-input" type="text" [value]="StepField('Column')" (input)="SetStepStr('Column', InputVal($event))" /></div>
                            <div class="ps-field"><label>Bins</label><input class="mj-input" type="number" [value]="StepField('Bins')" (input)="SetStepNum('Bins', InputVal($event))" /></div>
                          }
                          @case ('embedding') {
                            <div class="ps-field"><label>Entity</label><input class="mj-input" type="text" [value]="StepField('Entity')" (input)="SetStepStr('Entity', InputVal($event))" /></div>
                            <div class="ps-field"><label>Embedding model ref</label><input class="mj-input" type="text" [value]="StepField('EmbeddingModelRef')" (input)="SetStepStr('EmbeddingModelRef', InputVal($event))" /></div>
                            <div class="ps-field"><label>Dimensions</label><input class="mj-input" type="number" [value]="StepField('Dims')" (input)="SetStepNum('Dims', InputVal($event))" /></div>
                          }
                          @case ('llm-derived') { <div class="ps-field"><label>Feature Pipeline ref</label><input class="mj-input" type="text" [value]="StepField('FeaturePipelineRef')" (input)="SetStepStr('FeaturePipelineRef', InputVal($event))" /></div> }
                          @case ('flow-agent') { <div class="ps-field"><label>Flow Agent ref</label><input class="mj-input" type="text" [value]="StepField('FlowAgentRef')" (input)="SetStepStr('FlowAgentRef', InputVal($event))" /></div> }
                          @case ('vision-llm') { <div class="ps-field"><label>Image column</label><input class="mj-input" type="text" [value]="StepField('ImageColumn')" (input)="SetStepStr('ImageColumn', InputVal($event))" /></div> }
                        }
                      }
                      @if (SelectedNode.type === 'target' && IsUnitBound) {
                        <div class="ps-field"><label>Target variable</label><span data-testid="ps-pipelines-target-variable">{{ EditTargetVariable }}</span></div>
                        <div class="ps-field"><label>Problem type</label><span data-testid="ps-pipelines-problem-type">{{ EditProblemType }}</span></div>
                        <p class="ps-muted ps-small" data-testid="ps-pipelines-unit-source-note">{{ UnitSourceNote }}</p>
                      } @else if (SelectedNode.type === 'target') {
                        <div class="ps-field"><label>Target variable</label><input class="mj-input" type="text" [value]="EditTargetVariable" (input)="SetTargetVariable(InputVal($event))" /></div>
                        <div class="ps-field"><label>Problem type</label><select class="mj-input" [value]="EditProblemType" (change)="SetProblemType(InputVal($event))">@for (pt of ProblemTypes; track pt) { <option [value]="pt">{{ pt }}</option> }</select></div>
                      }
                      @if (SelectedNode.type === 'algo') {
                        <div class="ps-field"><label>Algorithm</label><select class="mj-input" [value]="EditAlgorithmId" (change)="SetAlgorithm(InputVal($event))">@for (a of Algorithms; track a.ID) { <option [value]="a.ID">{{ a.Name }}</option> }</select></div>
                        <div class="ps-field"><label>Hyperparameters (JSON)</label><textarea class="mj-textarea" rows="4" [value]="EditHyperparams" (input)="SetHyperparams(InputVal($event))"></textarea></div>
                        @if (PublishedModel; as pub) {
                          <div data-testid="ps-pipelines-model-card" style="margin-top:12px;padding:10px;border-radius:var(--mj-radius-sm);background:var(--mj-bg-surface-sunken);border:1px solid var(--mj-border-default);">
                            <div class="ps-small ps-muted" style="margin-bottom:6px;">{{ ModelCardTitle(pub) }}</div>
                            <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:8px;">
                              <span style="font-size:var(--mj-text-xs);font-weight:600;">v{{ pub.Version }} ({{ pub.Algorithm || 'Model' }})</span>
                              @if (ModelTag(pub) === 'winner') {
                                <span class="ps-tag success"><i class="fa-solid fa-trophy"></i> Active</span>
                              } @else if (pub.Status === 'Published') {
                                <span class="ps-tag">Active</span>
                              }
                            </div>
                            <div style="display:flex;gap:6px;">
                              <button mjButton variant="secondary" size="sm" type="button" (click)="OpenModelRecord(pub.ID)" style="flex:1;justify-content:center;" title="Open model record in Explorer">
                                <i class="fa-solid fa-arrow-up-right-from-square"></i> Model
                              </button>
                              <button mjButton variant="secondary" size="sm" type="button" (click)="ViewTrainingRuns(pub.ID)" style="flex:1;justify-content:center;" title="View training runs">
                                <i class="fa-solid fa-flask"></i> Runs
                              </button>
                            </div>
                          </div>
                        }
                      }
                      @if (SelectedNode.type === 'output') {
                        @if (PipelineModels.length === 0) {
                          <div class="ps-small ps-muted">The trained model artifact. Run <strong>Train</strong> to produce a new versioned model from this pipeline.</div>
                        } @else {
                          <div style="display:flex;flex-direction:column;gap:12px;">
                            @if (PipelineModels.length > 1) {
                              <div class="ps-field">
                                <label>Model Version</label>
                                <select class="mj-input" [value]="InspectedModel?.ID" (change)="SelectModelVersion(InputVal($event))">
                                  @for (m of PipelineModels; track m.ID) {
                                    <option [value]="m.ID">v{{ m.Version }} · {{ m.Algorithm || 'Algorithm' }} ({{ m.Status }})</option>
                                  }
                                </select>
                              </div>
                            }
                            @if (InspectedModel; as mdl) {
                              <div style="border:1px solid var(--mj-border-default);border-radius:var(--mj-radius-md);padding:12px;background:var(--mj-bg-surface-sunken);display:flex;flex-direction:column;gap:8px;">
                                <div style="display:flex;justify-content:space-between;align-items:center;">
                                  <div style="display:flex;align-items:center;gap:6px;">
                                    <strong>v{{ mdl.Version }}</strong>
                                    @if (ModelTag(mdl) === 'winner') {
                                      <span class="ps-tag success"><i class="fa-solid fa-trophy"></i> Winner</span>
                                    } @else if (ModelTag(mdl) === 'kept-baseline') {
                                      <span class="ps-tag">Kept a simple baseline</span>
                                    } @else if (ModelTag(mdl) === 'not-evaluated') {
                                      <span class="ps-tag">Not evaluated</span>
                                    }
                                    <span class="ps-badge" [class]="StatusClass(mdl.Status)">{{ mdl.Status }}</span>
                                  </div>
                                  <span class="ps-mono ps-small ps-muted" [title]="mdl.ID">{{ mdl.ID.slice(0, 8) }}…</span>
                                </div>
                                <div style="font-size:var(--mj-text-xs);color:var(--mj-text-secondary);">
                                  Algorithm: <strong>{{ mdl.Algorithm || SelectedAlgorithmName }}</strong>
                                </div>
                                <div style="font-size:var(--mj-text-xs);color:var(--mj-text-secondary);">
                                  Holdout Score: <strong>{{ FormatHoldout(mdl) }}</strong>
                                </div>
                                <div style="display:flex;flex-direction:column;gap:6px;margin-top:4px;">
                                  <button mjButton variant="primary" size="sm" type="button" (click)="OpenModelRecord(mdl.ID)" style="width:100%;justify-content:center;">
                                    <i class="fa-solid fa-arrow-up-right-from-square"></i> Open Model Details
                                  </button>
                                  <button mjButton variant="secondary" size="sm" type="button" (click)="ViewTrainingRuns(mdl.ID)" style="width:100%;justify-content:center;">
                                    <i class="fa-solid fa-flask"></i> View Training Runs
                                  </button>
                                </div>
                              </div>
                            }
                          </div>
                        }
                      }
                    </div>
                  </div>

                  <!-- Leakage guard (editable) -->
                  <div class="ps-card">
                    <div class="ps-card-head"><i class="fa-solid fa-shield-halved" style="color:var(--mj-status-warning)"></i><h3>Leakage guard</h3></div>
                    <div class="ps-card-body">
                      <div class="ps-field"><label>Deny-list columns (comma-separated)</label><input class="mj-input" type="text" [value]="DenyText" (input)="SetDeny(InputVal($event))" /></div>
                      <div class="ps-field"><label>Single-feature dominance threshold</label><input class="mj-input" type="number" step="0.05" min="0" max="1" [value]="EditLeakage.SingleFeatureDominanceThreshold" (input)="SetThreshold(InputVal($event))" /></div>
                    </div>
                  </div>

                  <!-- As-of strategy (editable) -->
                  <div class="ps-card">
                    <div class="ps-card-head"><i class="fa-solid fa-clock-rotate-left" style="color:var(--mj-brand-primary)"></i><h3>As-of strategy</h3></div>
                    <div class="ps-card-body">
                      <div class="ps-field"><label>Mode</label><span data-testid="ps-pipelines-asof-mode">{{ EditAsOf.Mode }}</span></div>
                      @if (EditAsOf.Mode !== 'none') {
                        <button mjButton variant="secondary" size="sm" data-testid="ps-pipelines-asof-reset" [disabled]="Busy" (click)="ResetAsOfToNone()">Reset to none</button>
                        <p class="ps-muted">Training refuses this setting: it reads every feature as it stands today, so a cutoff has no effect. Reset to none, then save, to train this pipeline.</p>
                      }
                    </div>
                  </div>

                  <!-- Holdout & folds (read-only: set by the bound Evaluation Protocol) -->
                  <div class="ps-card">
                    <div class="ps-card-head"><i class="fa-solid fa-scissors" style="color:var(--mj-brand-primary)"></i><h3>Holdout &amp; folds</h3></div>
                    <div class="ps-card-body">
                      <p class="ps-muted" data-testid="ps-pipelines-inspector-evaluation-source">{{ EvaluationSourceText }}</p>
                    </div>
                  </div>
                  </div>
                </as-split-area>
              }
            </as-split>
          </div>
        }
              </div>
            </as-split-area>
          </as-split>
        </div>
      }

      @if (ShowWizard) {
        <ps-pipeline-wizard
          [engine]="engine"
          [provider]="provider"
          [CurrentUser]="CurrentUser"
          [CloneFrom]="WizardClonePipeline"
          [InitialAlgorithmId]="initialWizardAlgorithmId"
          (Saved)="OnWizardSaved($event)"
          (TrainRequested)="OnWizardTrainRequested($event)"
          (Closed)="CloseWizard()">
        </ps-pipeline-wizard>
      }
    </div>
  `,
})
export class PSPipelinesComponent implements OnInit, OnChanges {
  @Input() engine!: PredictiveStudioEngine;
  @Input() provider: IMetadataProvider | null = null;
  @Input() CurrentUser: UserInfo | null = null;

  @Output() AskAgent = new EventEmitter<string>();

  @Output() Navigate = new EventEmitter<PSPanelKey>();

  private cdr = inject(ChangeDetectorRef);
  private notifications = inject(MJNotificationService);
  private navigationService = inject(NavigationService);

  public IsCatalogCollapsed = false;

  public CatalogSizePct = 28;

  public WorkspaceSizePct = 72;

  public IsInspectorCollapsed = false;

  public CanvasSizePct = 72;

  public InspectorSizePct = 28;

  public readonly StarterPrompt = PS_PIPELINES_STARTER_PROMPT;

  public readonly SourceKinds = SOURCE_KINDS;

  /** The kinds the inspector's picker lists: the honoured ones, plus the selected step's own kind when it is not one. */
  public get StepKindOptions(): FeatureStepKind[] {
    const kind = this.SelectedStep?.Kind;
    return kind === undefined || STEP_KINDS.includes(kind) ? STEP_KINDS : [...STEP_KINDS, kind];
  }

  /** The marker a saved step carries when the trainer ignores or refuses its kind; null when the step changes training. */
  public TrainerStepNote(step: FeatureStep): string | null {
    return TRAINER_STEP_NOTES[step.Kind] ?? null;
  }

  public readonly ProblemTypes = PROBLEM_TYPES;

  public readonly ImputeStrategies = IMPUTE_STRATEGIES;

  public Pipelines: MJMLTrainingPipelineEntity[] = [];

  public SelectedPipelineId = '';

  public ShowWizard = false;

  public WizardClonePipeline: MJMLTrainingPipelineEntity | null = null;

  public initialWizardAlgorithmId?: string;  // case-violation-ok-legacy-back-compat: an accessor cannot be optional, so a stub would turn this into a required member

  @Input() public ViewMode: 'stages' | 'graph' | 'dag' = 'stages';

  public SearchQuery = '';

  public ActiveFilter = 'all';

  public readonly NODE_W = NODE_W;
  public readonly NODE_H = NODE_H;
  public Math = Math;
  public ZoomLevel = 1;

  public OpenWizard(algoId?: string): void {
    this.WizardClonePipeline = null;
    this.initialWizardAlgorithmId = algoId;
    this.ShowWizard = true;
  }

  public CloneSelected(): void {
    if (!this.SelectedPipeline) return;
    this.WizardClonePipeline = this.SelectedPipeline;
    this.initialWizardAlgorithmId = undefined;
    this.ShowWizard = true;
  }

  public CloseWizard(): void {
    this.ShowWizard = false;
    this.WizardClonePipeline = null;
    this.initialWizardAlgorithmId = undefined;
  }

  public async OnWizardSaved(pipeline: MJMLTrainingPipelineEntity): Promise<void> {
    this.CloseWizard();
    await this.engine.Config(true, this.CurrentUser ?? undefined, this.provider ?? undefined);
    this.Pipelines = this.engine.Pipelines;
    this.SelectPipeline(pipeline.ID);
    this.cdr.detectChanges();
  }

  public async OnWizardTrainRequested(pipeline: MJMLTrainingPipelineEntity): Promise<void> {
    this.CloseWizard();
    await this.engine.Config(true, this.CurrentUser ?? undefined, this.provider ?? undefined);
    this.Pipelines = this.engine.Pipelines;
    this.SelectPipeline(pipeline.ID);
    await this.train();
  }

  // Editable spec state (the source of truth; nodes/edges are derived).
  public EditSources: SourceBinding[] = [];

  public EditSteps: FeatureStep[] = [];

  /** The selected pipeline's stored FeatureSteps object, so a save replaces only its `Steps` (OutcomeConfig and every other key stay). */
  private storedFeatureSteps: JsonObject = {};

  public EditTargetVariable = '';

  public EditProblemType: ProblemType = 'classification';

  public EditAlgorithmId = '';

  public EditHyperparams = '{}';

  public EditLeakage: LeakageGuard = { DenyFields: [], SingleFeatureDominanceThreshold: DOMINANCE_THRESHOLD_DEFAULT };

  public EditAsOf: AsOfStrategy = { Mode: 'none' };

  public Nodes: DagNode[] = [];

  public Edges: DagEdge[] = [];

  public SelectedId = '';

  public CanvasW = 800;

  public CanvasH = 460;

  public Dirty = false;

  public Busy = false;

  private nodeById = new Map<string, DagNode>();
  private stepSeq = 0;

  public ngOnChanges(_changes?: SimpleChanges): void {
    this.RefreshFromEngine();
  }

  ngOnInit(): void {
    const saved = UserInfoEngine.Instance.GetSetting('mj.predictiveStudio.pipelines.layout');
    if (saved) {
      try {
        const parsed = JSON.parse(saved);
        if (typeof parsed.catalogSizePct === 'number' && parsed.catalogSizePct >= 15 && parsed.catalogSizePct <= 60) {
          this.CatalogSizePct = parsed.catalogSizePct;
          this.WorkspaceSizePct = 100 - this.CatalogSizePct;
        }
        if (typeof parsed.isCatalogCollapsed === 'boolean') {
          this.IsCatalogCollapsed = parsed.isCatalogCollapsed;
        }
        if (typeof parsed.canvasSizePct === 'number' && parsed.canvasSizePct >= 40 && parsed.canvasSizePct <= 85) {
          this.CanvasSizePct = parsed.canvasSizePct;
          this.InspectorSizePct = 100 - this.CanvasSizePct;
        }
        if (typeof parsed.isInspectorCollapsed === 'boolean') {
          this.IsInspectorCollapsed = parsed.isInspectorCollapsed;
        }
      } catch {}
    }
    this.RefreshFromEngine();
  }

  public OnSplitDragEnd(sizes: readonly (number | '*')[]): void {
    if (Array.isArray(sizes) && sizes.length === 2 && typeof sizes[0] === 'number' && typeof sizes[1] === 'number') {
      this.CatalogSizePct = Math.round(sizes[0]);
      this.WorkspaceSizePct = Math.round(sizes[1]);
      this.saveLayoutPrefs();
    }
  }

  public ToggleCatalog(): void {
    this.IsCatalogCollapsed = !this.IsCatalogCollapsed;
    this.saveLayoutPrefs();
    this.cdr.markForCheck();
  }

  public OnInspectorSplitDragEnd(sizes: readonly (number | '*')[]): void {
    if (Array.isArray(sizes) && sizes.length === 2 && typeof sizes[0] === 'number' && typeof sizes[1] === 'number') {
      this.CanvasSizePct = Math.round(sizes[0]);
      this.InspectorSizePct = Math.round(sizes[1]);
      this.saveLayoutPrefs();
    }
  }

  public ToggleInspector(): void {
    this.IsInspectorCollapsed = !this.IsInspectorCollapsed;
    this.saveLayoutPrefs();
    this.cdr.markForCheck();
  }

  private saveLayoutPrefs(): void {
    const prefs = {
      catalogSizePct: this.CatalogSizePct,
      isCatalogCollapsed: this.IsCatalogCollapsed,
      canvasSizePct: this.CanvasSizePct,
      inspectorSizePct: this.InspectorSizePct,
      isInspectorCollapsed: this.IsInspectorCollapsed,
    };
    UserInfoEngine.Instance.SetSettingDebounced('mj.predictiveStudio.pipelines.layout', JSON.stringify(prefs));
  }

  public OpenModelRecord(modelId: string): void {
    if (!modelId) return;
    try {
      const p = this.provider ?? new Metadata();
      if (!p) return;
      const entity = p.EntityByName('MJ: ML Models');
      if (!entity) return;
      const ck = CompositeKey.FromURLSegment(entity, modelId);
      this.navigationService.OpenEntityRecord('MJ: ML Models', ck);
    } catch (err) {
      this.notifications.CreateSimpleNotification(`Could not open model: ${err instanceof Error ? err.message : String(err)}`, 'error');
    }
  }

  public ViewTrainingRuns(modelId?: string): void {
    if (this.Navigate.observed) {
      this.Navigate.emit('experiments');
      return;
    }
    try {
      const p = this.provider ?? new Metadata();
      if (!p) return;
      const runs = this.engine?.TrainingRuns ?? [];
      const match = modelId
        ? runs.find((r) => UUIDsEqual(r.ResultingModelID, modelId))
        : runs.find((r) => this.SelectedPipelineId && UUIDsEqual(r.PipelineID, this.SelectedPipelineId));
      if (match) {
        const entity = p.EntityByName('MJ: ML Training Runs');
        if (entity) {
          const ck = CompositeKey.FromURLSegment(entity, match.ID);
          this.navigationService.OpenEntityRecord('MJ: ML Training Runs', ck);
          return;
        }
      }
      this.navigationService.OpenNavItemByName('Experiments');
    } catch (err) {
      this.notifications.CreateSimpleNotification(`Could not open training runs: ${err instanceof Error ? err.message : String(err)}`, 'error');
    }
  }

  public RefreshFromEngine(): void {
    this.Pipelines = this.engine?.Pipelines ?? [];
    if (!this.SelectedPipelineId && this.Pipelines.length > 0) {
      this.SelectPipeline(this.Pipelines[0].ID);
    } else if (this.SelectedPipelineId && !this.Pipelines.some((p) => UUIDsEqual(p.ID, this.SelectedPipelineId))) {
      if (this.Pipelines.length > 0) {
        this.SelectPipeline(this.Pipelines[0].ID);
      }
    }
  }

  public get IsGraphView(): boolean {
    return this.ViewMode === 'graph' || this.ViewMode === 'dag';
  }

  public ToggleViewMode(): void {
    this.ViewMode = this.IsGraphView ? 'stages' : 'graph';
  }

  public ZoomIn(): void {
    this.ZoomLevel = Math.min(2.0, Math.round((this.ZoomLevel + 0.15) * 100) / 100);
  }

  public ZoomOut(): void {
    this.ZoomLevel = Math.max(0.5, Math.round((this.ZoomLevel - 0.15) * 100) / 100);
  }

  public ResetZoom(): void {
    this.ZoomLevel = 1;
  }

  public InputVal(e: Event): string {
    return (e.target as HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement).value;
  }

  public IsEdgeActive(edge: DagEdge): boolean {
    return this.SelectedId === edge.from || this.SelectedId === edge.to;
  }

  public SetFilter(f: string): void {
    this.ActiveFilter = f;
  }

  public OnSearchInput(ev: Event): void {
    this.SearchQuery = ((ev.target as HTMLInputElement)?.value ?? '').toLowerCase();
  }

  public get FilteredPipelines(): MJMLTrainingPipelineEntity[] {
    return (this.Pipelines ?? []).filter((p) => {
      if (this.SearchQuery) {
        const nameMatch = p.Name?.toLowerCase().includes(this.SearchQuery);
        const entityMatch = p.TargetEntity?.toLowerCase().includes(this.SearchQuery);
        const targetMatch = p.TargetVariable?.toLowerCase().includes(this.SearchQuery);
        if (!nameMatch && !entityMatch && !targetMatch) return false;
      }
      if (this.ActiveFilter === 'published') return p.Status === 'Published';
      if (this.ActiveFilter === 'draft') return p.Status === 'Draft';
      if (this.ActiveFilter === 'core') return p.TargetEntity?.includes('AI') || p.Name?.includes('AI Agent');
      return true;
    });
  }

  public PipelineDomain(p?: MJMLTrainingPipelineEntity): string {
    if (!p) return 'Platform';
    const n = (p.Name || '') + (p.TargetEntity || '');
    if (n.includes('MoreCheese') || n.includes('Membership') || n.includes('Event') || n.includes('Course')) return 'More Cheese Club';
    if (n.includes('AI') || n.includes('Prompt') || n.includes('Agent')) return 'MemberJunction Platform';
    return 'BizApps';
  }

  public TargetEntityName(p?: MJMLTrainingPipelineEntity): string {
    if (!p) return 'Entity';
    return p.TargetEntity || this.EditSources[0]?.Ref || 'Entity';
  }

  public get PipelineModels(): MJMLModelEntity[] {
    if (!this.SelectedPipelineId || !this.engine?.Models) return [];
    return this.engine.Models.filter((m) => UUIDsEqual(m.PipelineID, this.SelectedPipelineId));
  }

  /** The pipeline's published model, else its first model (the card and header actions show the latest when none is published). */
  public get PublishedModel(): MJMLModelEntity | undefined {
    return this.PipelineModels.find((m) => m.Status === 'Published') ?? this.PipelineModels[0];
  }

  /** The pipeline's published model, the one that serves predictions; undefined when none is published (no draft stands in). */
  public get ServingModel(): MJMLModelEntity | undefined {
    return this.PipelineModels.find((m) => m.Status === 'Published');
  }

  /**
   * Whether the pipeline can score, from what is stored: ready only when a model of the pipeline is published and the gate
   * decision its training run stored shipped it (`model`); otherwise not ready, saying why.
   */
  public get InferenceReadiness(): PSInferenceReadiness {
    const serving = this.ServingModel;
    if (serving) return this.readinessOf(serving, this.storedGateOutcome(serving.ID));
    return this.PipelineModels.length === 0
      ? { Ready: false, Detail: 'No model has been trained for this pipeline yet.' }
      : { Ready: false, Detail: 'No model of this pipeline is published; publish a validated model to score with it.' };
  }

  /** The readiness a published model's stored gate outcome gives: only a shipped trained model (`model`) is ready. */
  private readinessOf(serving: MJMLModelEntity, outcome: GateOutcome | null): PSInferenceReadiness {
    switch (outcome) {
      case 'model':
        return { Ready: true, Detail: `v${serving.Version} is published, and its training run's gate shipped it.` };
      case 'keep-simple-baseline':
        return { Ready: false, Detail: `The published v${serving.Version}'s training run kept a simple baseline instead of shipping a trained model.` };
      case 'no-signal':
        return { Ready: false, Detail: `The published v${serving.Version}'s training run found no signal and shipped no model.` };
      default:
        return { Ready: false, Detail: `The published v${serving.Version}'s training run stores no gate decision, so it was not evaluated under an Evaluation Protocol.` };
    }
  }

  public SelectedModelVersionId: string | null = null;

  public get InspectedModel(): MJMLModelEntity | undefined {
    if (this.SelectedModelVersionId) {
      const found = this.PipelineModels.find((m) => UUIDsEqual(m.ID, this.SelectedModelVersionId));
      if (found) return found;
    }
    return this.PublishedModel;
  }

  public SelectModelVersion(id: string): void {
    this.SelectedModelVersionId = id;
    this.cdr.markForCheck();
  }

  /** The model a pipeline's score badge describes: its published model, else its first model; null when it has none. */
  public BestModelForPipeline(p?: MJMLTrainingPipelineEntity): MJMLModelEntity | null {
    if (!p || !this.engine?.Models) return null;
    const models = this.engine.Models.filter((m) => UUIDsEqual(m.PipelineID, p.ID));
    if (models.length === 0) return null;
    return models.find((m) => m.Status === 'Published') ?? models[0];
  }

  public SelectStep(id: string): void {
    this.SelectNode(id);
  }

  public GetStepColumns(step: FeatureStep): string[] {
    switch (step.Kind) {
      case 'select':
      case 'standardize':
        return step.Columns ?? [];
      case 'impute':
      case 'onehot':
      case 'bin':
        return step.Column ? [step.Column] : [];
      default:
        return [];
    }
  }

  public GetStepInputs(step: FeatureStep): string[] {
    return step.Inputs ?? [];
  }

  /**
   * How the pipeline's leaderboard marks a published model: `winner` when its training run's stored gate outcome shipped
   * a model, `kept-baseline` when the gate kept a simple baseline, `not-evaluated` when the run stores no readable gate
   * record (read by {@link ReadStoredGate}, as the results artifact reads it), and `none` when the model is not published
   * or the gate shipped nothing.
   */
  public ModelTag(m: MJMLModelEntity): PSPublishedModelTag {
    return PublishedModelTag(m.Status, this.storedGate(m.ID));
  }

  /**
   * The algorithm card's title for the model it shows: the published model by its gate outcome (the serving winner only
   * when its run shipped it; not evaluated when the run stores no gate record), or, when no model of the pipeline is
   * published, the latest model, which nothing serves yet.
   */
  public ModelCardTitle(m: MJMLModelEntity): string {
    if (m.Status !== 'Published') return 'Latest model (not published)';
    switch (this.ModelTag(m)) {
      case 'winner': return 'Current Serving Winner';
      case 'kept-baseline': return 'Kept a simple baseline';
      case 'not-evaluated': return 'Published model — not evaluated';
      default: return 'Published model';
    }
  }

  /** The stored gate outcome of the run that produced a model; null when the run is missing or stores no readable gate record. */
  private storedGateOutcome(modelId: string): GateOutcome | null {
    return this.storedGate(modelId)?.Outcome ?? null;
  }

  /** The stored gate record of the run that produced a model; null when the run is missing or stores no readable one. */
  private storedGate(modelId: string): PSStoredGate | null {
    const run = (this.engine?.TrainingRuns ?? []).find((r) => UUIDsEqual(r.ResultingModelID, modelId));
    return run ? ReadStoredGate(run.ValidationResults) : null;
  }

  /**
   * The model's primary holdout score as stored: `HoldoutMetrics` lists the primary metric first (then the secondary
   * ones), so the first finite number is the score the gate was decided on, shown under the metric's stored name.
   */
  public FormatHoldout(m: MJMLModelEntity): string {
    if (!m.HoldoutMetrics) return m.Metrics ? 'Trained' : 'Pending';
    const stored = this.parse<Record<string, unknown>>(m.HoldoutMetrics, {});
    const primary = Object.entries(stored).find(([, v]) => typeof v === 'number' && Number.isFinite(v));
    return primary ? `${primary[0]} ${Number(primary[1]).toFixed(4)}` : 'Not scored';
  }

  public get AsOfLabel(): string {
    if (this.EditAsOf.Mode === 'column') return `Column: ${this.EditAsOf.Column || 'DecisionDate'}`;
    if (this.EditAsOf.Mode === 'offset') return `Offset: ${this.EditAsOf.OffsetDays || 0}d prior`;
    return 'None (Static snapshot)';
  }

  public get SelectedAlgorithmName(): string {
    return this.engine?.AlgorithmName(this.EditAlgorithmId) || 'Auto-select (Tournament)';
  }

  public SelectPipeline(id: string): void {
    this.SelectedPipelineId = id;
    this.SelectedModelVersionId = null;
    const p = this.Pipelines.find((x) => UUIDsEqual(x.ID, id));
    if (!p) {
      return;
    }

    // Defensive parsing against non-array JSON schemas
    const rawSources = this.parse<unknown>(p.SourceBindings, []);
    this.EditSources = Array.isArray(rawSources)
      ? (rawSources as SourceBinding[])
      : rawSources && typeof rawSources === 'object'
      ? [{ Kind: 'Entity', Ref: (rawSources as { EntityID?: string }).EntityID || '' }]
      : [];

    const storedSteps = JsonParse.ParseJsonText(p.FeatureSteps, 'FeatureSteps');
    this.storedFeatureSteps = storedSteps.Ok && JsonParse.IsJsonObject(storedSteps.Value) ? storedSteps.Value : {};
    const rawSteps = this.parse<unknown>(p.FeatureSteps, { Steps: [] });
    if (Array.isArray(rawSteps)) {
      this.EditSteps = rawSteps as FeatureStep[];
    } else if (rawSteps && typeof rawSteps === 'object' && 'Steps' in rawSteps && Array.isArray((rawSteps as { Steps: unknown[] }).Steps)) {
      this.EditSteps = (rawSteps as { Steps: FeatureStep[] }).Steps;
    } else {
      this.EditSteps = [];
    }

    this.EditTargetVariable = p.TargetVariable ?? '';
    this.EditProblemType = (p.ProblemType as ProblemType) ?? 'classification';
    this.EditAlgorithmId = p.AlgorithmID ?? '';
    this.EditHyperparams = p.Hyperparameters ?? '{}';
    this.EditLeakage = this.parse<LeakageGuard>(p.LeakageGuard, { DenyFields: [], SingleFeatureDominanceThreshold: DOMINANCE_THRESHOLD_DEFAULT });
    this.EditAsOf = this.parse<AsOfStrategy>(p.AsOfStrategy, { Mode: 'none' });
    this.stepSeq = this.EditSteps.length;
    this.Dirty = false;
    this.rebuild();
    this.SelectedId = this.Nodes[0]?.id ?? '';
  }

  public get SelectedPipeline(): MJMLTrainingPipelineEntity | undefined {
    return this.Pipelines.find((p) => UUIDsEqual(p.ID, this.SelectedPipelineId));
  }

  public IsSelectedPipeline(p: MJMLTrainingPipelineEntity): boolean {
    return UUIDsEqual(p.ID, this.SelectedPipelineId);
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

    this.EditSources.forEach((sb, i) => nodes.push(this.sourceNode(sb, i)));
    this.EditSteps.forEach((step) => nodes.push(this.stepNode(step)));
    nodes.push(this.targetNode());
    nodes.push(this.algoNode());
    nodes.push({
      id: '__output',
      type: 'output',
      title: 'Model Artifact',
      icon: 'fa-solid fa-cube',
      tag: this.SelectedPipeline?.Status ?? 'Draft',
      x: 0,
      y: 0,
      hasIn: true,
      hasOut: false,
      rows: [
        { k: 'status', v: this.SelectedPipeline?.Status ?? 'Draft' },
        { k: 'serving', v: this.SelectedPipeline?.Status === 'Published' ? 'Active' : 'Not Serving' }
      ]
    });

    const stepIds = new Set(this.EditSteps.map((s) => s.Id));
    const sourceKeyToId = new Map<string, string>();
    this.EditSources.forEach((sb, i) => {
      const sid = `src:${i}`;
      sourceKeyToId.set(sid.toLowerCase(), sid);
      if (sb.Ref) sourceKeyToId.set(sb.Ref.toLowerCase(), sid);
      if (sb.Alias) sourceKeyToId.set(sb.Alias.toLowerCase(), sid);
    });

    const stepSourcesConnected = new Set<string>();
    const referenced = new Set<string>();
    for (const step of this.EditSteps) {
      for (const input of step.Inputs ?? []) {
        if (stepIds.has(input)) {
          edges.push({ from: input, to: step.Id });
          referenced.add(input);
        } else {
          const matchedSrc = sourceKeyToId.get(input.toLowerCase());
          if (matchedSrc) {
            edges.push({ from: matchedSrc, to: step.Id });
            stepSourcesConnected.add(step.Id);
          }
        }
      }
    }
    const roots = this.EditSteps.filter((s) => {
      const hasStepInput = (s.Inputs ?? []).some((i) => stepIds.has(i));
      const hasSourceInput = stepSourcesConnected.has(s.Id);
      return !hasStepInput && !hasSourceInput;
    });
    const sourceIds = this.EditSources.map((_s, i) => `src:${i}`);
    if (this.EditSteps.length > 0) {
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
    for (const t of this.EditSteps.filter((s) => !referenced.has(s.Id))) {
      edges.push({ from: t.Id, to: '__algo' });
    }
    // Connect source to target so target sits cleanly in the feature/target layer
    if (sourceIds.length > 0) {
      edges.push({ from: sourceIds[0], to: '__target' });
    }
    edges.push({ from: '__target', to: '__algo' });
    edges.push({ from: '__algo', to: '__output' });

    this.Nodes = nodes;
    this.Edges = edges;
    this.markPorts();
    this.layoutGraph();
  }

  private sourceNode(sb: SourceBinding, i: number): DagNode {
    const md = this.provider ?? new Metadata();
    let title = sb.Alias;
    if (!title && sb.Kind === 'Entity' && sb.Ref) {
      const entity = md.EntityByName(sb.Ref);
      title = entity?.DisplayName || entity?.Name;
    }
    title = title || sb.Ref || 'source';

    const rows: { k: string; v: string }[] = [{ k: 'kind', v: sb.Kind }];
    if (sb.Alias) {
      rows.push({ k: 'alias', v: sb.Alias });
    }
    if (sb.Kind === 'Entity' && title !== sb.Ref) {
      rows.push({ k: 'entity', v: sb.Ref });
    }
    return {
      id: `src:${i}`,
      type: 'src',
      title,
      icon: SOURCE_ICONS[sb.Kind] ?? 'fa-solid fa-database',
      tag: sb.Kind,
      rows,
      x: 0,
      y: 0,
      hasIn: false,
      hasOut: true
    };
  }

  private stepNode(step: FeatureStep): DagNode {
    return {
      id: step.Id,
      type: step.Kind === 'embedding' ? 'emb' : 'feat',
      title: step.Label || step.Kind,
      icon: STEP_ICONS[step.Kind] ?? 'fa-solid fa-sliders',
      tag: step.Kind,
      rows: this.stepRows(step),
      x: 0,
      y: 0,
      hasIn: true,
      hasOut: true
    };
  }

  private stepRows(step: FeatureStep): { k: string; v: string }[] {
    switch (step.Kind) {
      case 'select': {
        const preview = step.Columns.length <= 3
          ? step.Columns.join(', ')
          : `${step.Columns.slice(0, 2).join(', ')} +${step.Columns.length - 2} more`;
        return [{ k: 'columns', v: preview || '0 cols' }];
      }
      case 'impute': return [{ k: 'column', v: step.Column }, { k: 'strategy', v: step.Strategy }];
      case 'standardize': {
        const preview = step.Columns.length <= 3
          ? step.Columns.join(', ')
          : `${step.Columns.slice(0, 2).join(', ')} +${step.Columns.length - 2} more`;
        return [{ k: 'columns', v: preview || '0 cols' }, { k: 'scaler', v: 'z-score' }];
      }
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
    return {
      id: '__target',
      type: 'target',
      title: `Target: ${this.EditTargetVariable || '—'}`,
      icon: 'fa-solid fa-bullseye',
      tag: this.EditProblemType,
      rows: [
        { k: 'variable', v: this.EditTargetVariable || '—' },
        { k: 'type', v: this.EditProblemType }
      ],
      x: 0,
      y: 0,
      hasIn: true,
      hasOut: true
    };
  }

  private algoNode(): DagNode {
    const name = this.engine?.AlgorithmName(this.EditAlgorithmId) || 'Algorithm';
    const rows = [{ k: 'algorithm', v: name }];
    const hp = this.parse<Record<string, unknown>>(this.EditHyperparams, {});
    Object.entries(hp).slice(0, 1).forEach(([k, v]) => rows.push({ k, v: String(v) }));
    return {
      id: '__algo',
      type: 'algo',
      title: name,
      icon: 'fa-solid fa-shapes',
      tag: 'Algorithm',
      rows,
      x: 0,
      y: 0,
      hasIn: true,
      hasOut: true
    };
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

  public get SelectedNode(): DagNode {
    return this.nodeById.get(this.SelectedId) ?? this.Nodes[0] ?? { id: '', type: 'feat', title: '—', icon: 'fa-solid fa-sliders', rows: [], x: 0, y: 0, hasIn: false, hasOut: false };
  }

  public get SelectedSourceIndex(): number {
    return this.SelectedId.startsWith('src:') ? Number(this.SelectedId.slice(4)) : -1;
  }

  public get SelectedSource(): SourceBinding | null {
    const i = this.SelectedSourceIndex;
    return i >= 0 ? this.EditSources[i] ?? null : null;
  }

  public get SelectedStep(): FeatureStep | null {
    return this.EditSteps.find((s) => s.Id === this.SelectedId) ?? null;
  }

  public get OtherSteps(): FeatureStep[] {
    return this.EditSteps.filter((s) => s.Id !== this.SelectedId);
  }

  public get Algorithms() {
    return this.engine?.Algorithms ?? [];
  }

  // ---- source editing ----

  public SetSourceKind(kind: string): void { const s = this.SelectedSource; if (s) { s.Kind = kind as SourceBinding['Kind']; this.markDirty(); } }

  public SetSourceRef(ref: string): void { const s = this.SelectedSource; if (s) { s.Ref = ref; this.markDirty(); } }

  public SetSourceAlias(alias: string): void { const s = this.SelectedSource; if (s) { s.Alias = alias || undefined; this.markDirty(); } }

  // ---- step editing ----

  public get ColumnsText(): string {
    const s = this.SelectedStep;
    if (s && (s.Kind === 'select' || s.Kind === 'standardize')) {
      return s.Columns.join(', ');
    }
    return '';
  }

  public SetColumns(text: string): void {
    const s = this.SelectedStep;
    if (s && (s.Kind === 'select' || s.Kind === 'standardize')) {
      s.Columns = text.split(',').map((c) => c.trim()).filter(Boolean);
      this.markDirty();
    }
  }

  public StepField(field: string): string {
    const s = this.SelectedStep as unknown as Record<string, unknown> | null;
    const v = s?.[field];
    return v == null ? '' : String(v);
  }

  public SetStepStr(field: string, value: string): void {
    const s = this.SelectedStep as unknown as Record<string, unknown> | null;
    if (s) { s[field] = value; this.markDirty(); }
  }

  public SetStepNum(field: string, value: string): void {
    const s = this.SelectedStep as unknown as Record<string, unknown> | null;
    const n = Number(value);
    if (s && !Number.isNaN(n)) { s[field] = n; this.markDirty(); }
  }

  public SetStepLabel(label: string): void { const s = this.SelectedStep; if (s) { s.Label = label || undefined; this.markDirty(); } }

  public SetStepKind(kind: string): void {
    const idx = this.EditSteps.findIndex((s) => s.Id === this.SelectedId);
    if (idx < 0) {
      return;
    }
    const prev = this.EditSteps[idx];
    this.EditSteps[idx] = this.defaultStep(kind as FeatureStepKind, prev.Id, prev.Label, prev.Inputs);
    this.markDirty();
  }

  public HasInput(stepId: string): boolean {
    return (this.SelectedStep?.Inputs ?? []).includes(stepId);
  }

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

  private createsCycle(from: string, target: string): boolean {
    const byId = new Map(this.EditSteps.map((s) => [s.Id, s]));
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

  /**
   * Whether the selected pipeline is bound to a Prediction Unit. The unit then decides the target, the problem type and
   * the rows: training replaces both target values with the unit's (training-engine.ts trainUnitPipeline), the server
   * entity refuses a save whose values differ from it, and neither unit assembly nor unit scoring reads SourceBindings.
   * So the editor shows those fields read-only and does not write them.
   */
  public get IsUnitBound(): boolean {
    return !!this.SelectedPipeline?.PredictionUnitID;
  }

  /** The copy beside a unit-decided field, naming the unit. */
  public get UnitSourceNote(): string {
    const p = this.SelectedPipeline;
    return `Set by the Prediction Unit "${p?.PredictionUnit || p?.PredictionUnitID || ''}": edit the unit to change it.`;
  }

  public SetTargetVariable(v: string): void { this.EditTargetVariable = v; this.markDirty(); }

  public SetProblemType(v: string): void { this.EditProblemType = v as ProblemType; this.markDirty(); }

  public SetAlgorithm(id: string): void { this.EditAlgorithmId = id; this.markDirty(); }

  public SetHyperparams(v: string): void { this.EditHyperparams = v; this.markDirty(); }

  // ---- leakage / as-of / validation editing ----

  public get DenyText(): string { return this.EditLeakage.DenyFields.join(', '); }

  public SetDeny(text: string): void { this.EditLeakage.DenyFields = parseDenyList(text); this.Dirty = true; }

  public SetThreshold(v: string): void { const n = Number(v); if (!Number.isNaN(n)) { this.EditLeakage.SingleFeatureDominanceThreshold = n; this.Dirty = true; } }

  /**
   * Resets a stored as-of cutoff to `none` (training refuses any other mode) as an unsaved edit. It does not save: the
   * user saves with the pipeline's other edits, so a reset never commits half-finished changes.
   */
  public ResetAsOfToNone(): void {
    this.EditAsOf = { Mode: 'none' };
    this.markDirty();
  }

  /**
   * Where the selected pipeline's holdout and folds come from. Training grades a pipeline only on the Evaluation
   * Protocol version it is bound to and refuses one with none, so the workspace names that protocol instead of
   * offering split settings training does not read.
   */
  public get EvaluationSourceText(): string {
    const p = this.SelectedPipeline;
    if (!p?.EvaluationProtocolID) {
      return 'No Evaluation Protocol is bound: training refuses this pipeline until one is. Holdout and folds come from the bound protocol.';
    }
    return `Holdout and folds come from the bound Evaluation Protocol: ${p.EvaluationProtocol || p.EvaluationProtocolID}.`;
  }

  // ---- add / delete nodes ----

  public AddSource(): void {
    this.EditSources = [...this.EditSources, { Kind: 'Entity', Ref: '' }];
    this.markDirty();
    this.SelectedId = `src:${this.EditSources.length - 1}`;
  }

  public AddStep(): void {
    const id = `step_${++this.stepSeq}`;
    this.EditSteps = [...this.EditSteps, this.defaultStep('select', id)];
    this.markDirty();
    this.SelectedId = id;
  }

  public DeleteSelected(): void {
    const si = this.SelectedSourceIndex;
    if (si >= 0) {
      this.EditSources = this.EditSources.filter((_s, i) => i !== si);
      this.markDirty();
      this.SelectedId = this.Nodes[0]?.id ?? '';
      return;
    }
    const step = this.SelectedStep;
    if (step) {
      this.EditSteps = this.EditSteps.filter((s) => s.Id !== step.Id);
      for (const s of this.EditSteps) {
        if (s.Inputs?.includes(step.Id)) {
          s.Inputs = s.Inputs.filter((i) => i !== step.Id);
        }
      }
      this.markDirty();
      this.SelectedId = this.Nodes[0]?.id ?? '';
    }
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
      case 'llm-derived': return { ...base, Kind: 'llm-derived', FeaturePipelineRef: '', Columns: [] };
      case 'flow-agent': return { ...base, Kind: 'flow-agent', FlowAgentRef: '', InputMapping: {}, OutputMapping: {} };
      case 'vision-llm': return { ...base, Kind: 'vision-llm', ImageColumn: '', Prompt: { InlinePrompt: '' }, Output: { FeatureName: '', Kind: 'category' } };
      case 'windowed-aggregate': return { ...base, Kind: 'windowed-aggregate', FeatureName: '', ChildEntity: '', ForeignKey: '', DateField: '', Aggregate: 'count' };
      case 'series': return { ...base, Kind: 'series', FeatureName: '', Feature: { kind: 'lag', index: 0 } };
    }
  }

  // ---- save / validate / train ----

  public async save(): Promise<void> {
    const p = this.SelectedPipeline;
    if (!p || this.Busy) {
      return;
    }
    this.Busy = true;
    try {
      p.FeatureSteps = JSON.stringify({ ...this.storedFeatureSteps, Steps: this.EditSteps });
      if (!this.IsUnitBound) {
        p.SourceBindings = JSON.stringify(this.EditSources);
        p.TargetVariable = this.EditTargetVariable;
        p.ProblemType = this.EditProblemType;
      }
      p.AlgorithmID = this.EditAlgorithmId;
      p.Hyperparameters = this.EditHyperparams || null;
      p.LeakageGuard = JSON.stringify(this.EditLeakage);
      p.AsOfStrategy = JSON.stringify(this.EditAsOf);
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

  public validate(): void {
    const issues: string[] = [];
    if (this.EditSources.length === 0) {
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

  public async train(): Promise<void> {
    const p = this.SelectedPipeline;
    if (!p || this.Busy || this.Dirty) {
      return;
    }
    this.Busy = true;
    this.notifications.CreateSimpleNotification(`Training "${p.Name}"…`, 'info', 2500);
    try {
      const op = new PredictiveStudioTrainModelOperation();
      const result = await op.Execute({ pipelineId: p.ID }, { provider: this.provider ?? undefined, user: this.CurrentUser ?? undefined });
      if (result.Success && result.Output) {
        this.notifications.CreateSimpleNotification(PSPipelinesComponent.TrainResultMessage(p.Name, result.Output), result.Output.modelId ? 'success' : 'info', 5000);
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

  /**
   * The notification for a completed training run: the produced model's version, or, when the stored gate decision
   * shipped no model, the stored reason (there is no version to show).
   */
  public static TrainResultMessage(pipelineName: string, out: PredictiveStudioTrainModelOutput): string {
    if (!out.modelId) return `Trained ${pipelineName}: no model shipped. ${out.gateReason || `See training run ${out.trainingRunId}.`}`;
    const flagged = out.leakageFlagged ? ' (leakage flag raised — needs sign-off)' : '';
    return `Trained ${pipelineName} v${out.version}${flagged}. See Registry.`;
  }

  public Refine(): void {
    const p = this.SelectedPipeline;
    if (!p) {
      this.AskAgent.emit(this.StarterPrompt);
      return;
    }
    const predicts = p.TargetVariable ? ` (predicts ${p.TargetVariable})` : '';
    this.AskAgent.emit(`Help me refine the "${p.Name}" training pipeline${predicts}. Suggest improvements to the features or algorithm to raise holdout performance.`);
  }

  public StatusClass(status: string): string {
    switch (status) {
      case 'Published': return 'published';
      case 'Validated': return 'validated';
      default: return 'draft';
    }
  }

  public NodeTypeLabel(type: NodeType): string {
    switch (type) {
      case 'src': return 'Source';
      case 'feat': return 'Feature Step';
      case 'emb': return 'Embedding';
      case 'target': return 'Target';
      case 'algo': return 'Algorithm';
      case 'output': return 'Output Model';
    }
  }

  // ---- Graph layered layout ----

  private layoutGraph(): void {
    this.nodeById.clear();
    for (const n of this.Nodes) {
      this.nodeById.set(n.id, n);
    }
    const inEdges = new Map<string, string[]>();
    for (const n of this.Nodes) {
      inEdges.set(n.id, []);
    }
    for (const e of this.Edges) {
      inEdges.get(e.to)?.push(e.from);
    }
    const layerOf = new Map<string, number>();
    const computeLayer = (id: string, path: Set<string>): number => {
      if (layerOf.has(id)) {
        return layerOf.get(id)!;
      }
      if (path.has(id)) {
        return 0;
      }
      path.add(id);
      const preds = inEdges.get(id) ?? [];
      let l = 0;
      for (const p of preds) {
        l = Math.max(l, computeLayer(p, path) + 1);
      }
      path.delete(id);
      layerOf.set(id, l);
      return l;
    };
    for (const n of this.Nodes) {
      computeLayer(n.id, new Set());
    }

    const algoNode = this.Nodes.find((n) => n.id === '__algo');
    const outNode = this.Nodes.find((n) => n.id === '__output');
    let maxFeatureLayer = 0;
    for (const n of this.Nodes) {
      if (n.id !== '__algo' && n.id !== '__output') {
        maxFeatureLayer = Math.max(maxFeatureLayer, layerOf.get(n.id) ?? 0);
      }
    }
    if (algoNode) {
      layerOf.set('__algo', maxFeatureLayer + 1);
    }
    if (outNode) {
      layerOf.set('__output', maxFeatureLayer + 2);
    }

    const layers = new Map<number, DagNode[]>();
    for (const n of this.Nodes) {
      const l = layerOf.get(n.id) ?? 0;
      const arr = layers.get(l) ?? [];
      arr.push(n);
      layers.set(l, arr);
    }

    let maxCol = 0;
    let maxRow = 0;
    layers.forEach((nodesInCol, col) => {
      maxCol = Math.max(maxCol, col);
      maxRow = Math.max(maxRow, nodesInCol.length);
    });

    const maxCanvasHeight = PAD_Y * 2 + maxRow * NODE_H + Math.max(0, maxRow - 1) * ROW_GAP;

    layers.forEach((nodesInCol, col) => {
      const colHeight = nodesInCol.length * NODE_H + Math.max(0, nodesInCol.length - 1) * ROW_GAP;
      // Vertically center this column relative to the tallest column in the graph
      const colStartY = PAD_Y + Math.max(0, Math.floor((maxCanvasHeight - PAD_Y * 2 - colHeight) / 2));
      nodesInCol.forEach((n, row) => {
        n.x = PAD_X + col * (NODE_W + COL_GAP);
        n.y = colStartY + row * (NODE_H + ROW_GAP);
      });
    });

    this.CanvasW = Math.max(920, PAD_X * 2 + (maxCol + 1) * NODE_W + maxCol * COL_GAP);
    this.CanvasH = Math.max(540, maxCanvasHeight);
  }

  public EdgePath(edge: DagEdge): string {
    const from = this.nodeById.get(edge.from);
    const to = this.nodeById.get(edge.to);
    if (!from || !to) {
      return '';
    }
    const x1 = from.x + NODE_W;
    const y1 = from.y + NODE_H / 2;
    // Account for port diameter / marker-end: end 2px before port center
    const x2 = to.x - 2;
    const y2 = to.y + NODE_H / 2;
    const dx = Math.max(36, Math.abs(x2 - x1) * 0.45);
    return `M ${x1} ${y1} C ${x1 + dx} ${y1}, ${x2 - dx} ${y2}, ${x2} ${y2}`;
  }

}
