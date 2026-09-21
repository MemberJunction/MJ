import { ChangeDetectorRef, Component, EventEmitter, Input, OnChanges, OnInit, Output, SimpleChanges, ViewEncapsulation, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { MJButtonDirective } from '@memberjunction/ng-ui-components';
import { MJNotificationService } from '@memberjunction/ng-notifications';
import { UUIDsEqual } from '@memberjunction/global';
import { CompositeKey, IMetadataProvider, Metadata, UserInfo } from '@memberjunction/core';
import { MJMLTrainingPipelineEntity, MJMLModelEntity, PredictiveStudioTrainModelOperation, UserInfoEngine } from '@memberjunction/core-entities';
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
  type ValidationStrategy,
  type ProblemType,
} from '@memberjunction/predictive-studio-core';
import { PSPanelKey } from '../predictive-studio.types';
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

@Component({
  standalone: true,
  selector: 'ps-pipelines',
  imports: [CommonModule, MJButtonDirective, PSPipelineWizardComponent, AngularSplitModule],
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
            versioned model. You can build one step-by-step with the manual wizard or ask the Model
            Development Agent to design one for you.
          </p>
          <div class="empty-actions" style="display: flex; gap: 8px; margin-top: 12px;">
            <button mjButton variant="primary" size="sm" data-testid="ps-pipelines-new-btn-empty"
              (click)="openWizard()">
              <i class="fa-solid fa-plus"></i> New Pipeline
            </button>
            <button mjButton variant="secondary" size="sm" data-testid="ps-pipelines-ask-agent"
              (click)="askAgent.emit(starterPrompt)">
              <i class="fa-solid fa-robot"></i> Ask the agent
            </button>
          </div>
        </div>
      } @else {
        <div class="pl-layout" [class.catalog-collapsed]="isCatalogCollapsed">
          @if (isCatalogCollapsed) {
            <div class="pl-collapsed-strip" role="region" aria-label="Pipelines catalog (collapsed)">
              <button class="pl-rail-collapse" type="button" (click)="toggleCatalog()" aria-label="Expand pipelines catalog" title="Expand catalog">
                <i class="fa-solid fa-chevron-right"></i>
              </button>
              <div class="pl-collapsed-strip-label"><i class="fa-solid fa-diagram-project"></i></div>
            </div>
          }

          <as-split direction="horizontal" class="pl-splitter" unit="percent" [gutterSize]="6" (dragEnd)="onSplitDragEnd($event.sizes)">
            @if (!isCatalogCollapsed) {
              <as-split-area [size]="catalogSizePct" [minSize]="18" [maxSize]="50">
                <!-- Left Column: Master Pipeline Catalog -->
                <div class="pl-catalog" data-testid="ps-pipelines-catalog">
                  <div class="pl-catalog-header">
                    <div class="pl-catalog-title-row">
                      <h2>Pipelines ({{ filteredPipelines.length }})</h2>
                      <div style="display:flex;gap:6px;align-items:center">
                        <button mjButton variant="primary" size="sm" data-testid="ps-pipelines-new" (click)="openWizard()">
                          <i class="fa-solid fa-plus"></i> New
                        </button>
                        <button class="pl-collapse-btn" type="button" (click)="toggleCatalog()" title="Collapse catalog" aria-label="Collapse catalog">
                          <i class="fa-solid fa-chevron-left"></i>
                        </button>
                      </div>
                    </div>
                    <div class="pl-search-box">
                      <i class="fa-solid fa-magnifying-glass"></i>
                      <input type="text" [value]="searchQuery" (input)="onSearchInput($event)" placeholder="Filter pipelines..." />
                    </div>
                    <div class="pl-filter-chips">
                      <button class="pl-filter-chip" [class.active]="activeFilter === 'all'" (click)="setFilter('all')">All</button>
                      <button class="pl-filter-chip" [class.active]="activeFilter === 'published'" (click)="setFilter('published')">Published</button>
                      <button class="pl-filter-chip" [class.active]="activeFilter === 'draft'" (click)="setFilter('draft')">Draft</button>
                      <button class="pl-filter-chip" [class.active]="activeFilter === 'core'" (click)="setFilter('core')">MJ Core</button>
                    </div>
                  </div>

                  <!-- Scrollable Catalog Cards List (preserves data-testid="ps-pipelines-picker" and "ps-pipelines-pill") -->
                  <div class="pl-picker" data-testid="ps-pipelines-picker">
                    @for (p of filteredPipelines; track p.ID) {
                      <button class="pl-pill pipeline-card" [class.on]="isSelectedPipeline(p)"
                        data-testid="ps-pipelines-pill" (click)="selectPipeline(p.ID)" [title]="p.Name">
                        <div class="pl-card-top">
                          <div class="pl-card-name">{{ p.Name }}</div>
                          <span class="ps-badge" [class]="statusClass(p.Status)">{{ p.Status }}</span>
                        </div>
                        <div class="pl-card-meta">
                          <span class="pl-entity-tag">{{ targetEntityName(p) }}</span>
                          <span>&bull;</span>
                          <span class="pl-target-tag">{{ p.TargetVariable || 'Target' }}</span>
                        </div>
                        <div class="pl-card-meta" style="justify-content: space-between; margin-top: 2px;">
                          <span>{{ p.ProblemType }}</span>
                          @if (bestMetricForPipeline(p); as bm) {
                            <span class="pl-metric-badge"><i class="fa-solid fa-trophy" style="color:#eab308"></i> {{ bm }}</span>
                          }
                        </div>
                      </button>
                    }
                  </div>
                </div>
              </as-split-area>
            }

            <as-split-area [size]="isCatalogCollapsed ? 100 : workspaceSizePct" [minSize]="40">
              <!-- Right Column: Human-Centric Workspace (Stages View Default + DAG View Toggle) -->
              <div class="pl-workspace" data-testid="ps-pipelines-workspace">
            <div class="pl-workspace-header">
              <div class="pl-workspace-title-area">
                <div class="pl-breadcrumbs">
                  <span>Pipelines</span> <i class="fa-solid fa-chevron-right" style="font-size: 10px;"></i>
                  <span>{{ pipelineDomain(selectedPipeline) }}</span> <i class="fa-solid fa-chevron-right" style="font-size: 10px;"></i>
                  <strong>{{ selectedPipeline?.Name }}</strong>
                </div>
                <div class="pl-title-row">
                  <h1>{{ selectedPipeline?.Name }}</h1>
                  @if (selectedPipeline) {
                    <span class="ps-badge" [class]="statusClass(selectedPipeline.Status)">{{ selectedPipeline.Status }}</span>
                    @if (bestMetricForPipeline(selectedPipeline); as bm) {
                      <span class="pl-metric-badge"><i class="fa-solid fa-trophy" style="color:#eab308"></i> {{ bm }}</span>
                    }
                  }
                </div>
              </div>

              <!-- Action Toolbar -->
              <div class="pl-toolbar">
                <button mjButton variant="secondary" size="sm" (click)="toggleViewMode()" [title]="isGraphView ? 'Switch to 5-Stage Progressive Flow' : 'Switch to Pipeline Graph View'">
                  <i class="fa-solid" [class.fa-diagram-project]="!isGraphView" [class.fa-layer-group]="isGraphView"></i>
                  {{ isGraphView ? 'Stages View' : 'Graph View' }}
                </button>
                <button mjButton variant="secondary" size="sm" data-testid="ps-pipelines-clone" [disabled]="!selectedPipeline" (click)="cloneSelected()">
                  <i class="fa-solid fa-copy"></i> Clone
                </button>
                <button mjButton variant="secondary" size="sm" data-testid="ps-pipelines-save" [disabled]="!dirty || busy" (click)="save()">
                  <i class="fa-solid fa-floppy-disk"></i> Save
                </button>
                <button mjButton variant="secondary" size="sm" data-testid="ps-pipelines-validate" [disabled]="busy" (click)="validate()">
                  <i class="fa-solid fa-circle-check"></i> Validate
                </button>
                <button mjButton variant="primary" size="sm" data-testid="ps-pipelines-train" [disabled]="busy || dirty" (click)="train()">
                  <i class="fa-solid fa-play"></i> Train
                </button>
                <button mjButton variant="secondary" size="sm" (click)="refine()">
                  <i class="fa-solid fa-wand-magic-sparkles"></i> Agent
                </button>
                @if (dirty) { <span class="ps-tag amber" data-testid="ps-pipelines-dirty"><i class="fa-solid fa-pen"></i> Unsaved</span> }
              </div>
            </div>

            <!-- Stages View (Human-Readable Progressive Stages) -->
            @if (viewMode === 'stages') {
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
                      <div class="val"><i class="fa-solid fa-table" style="color:var(--mj-brand-primary)"></i> {{ targetEntityName(selectedPipeline) }}</div>
                      <div class="sub">Primary training unit</div>
                    </div>
                    <div class="pl-metric-box">
                      <label>Target Variable</label>
                      <div class="val"><i class="fa-solid fa-bullseye" style="color:var(--mj-status-warning)"></i> {{ editTargetVariable || 'Not set' }}</div>
                      <div class="sub">{{ editProblemType }} outcome</div>
                    </div>
                    <div class="pl-metric-box">
                      <label>Problem Type</label>
                      <div class="val"><i class="fa-solid fa-chart-pie" style="color:var(--mj-brand-primary)"></i> {{ editProblemType }}</div>
                      <div class="sub">Optimization discipline</div>
                    </div>
                    <div class="pl-metric-box" style="border-left: 3px solid var(--mj-brand-primary);">
                      <label>As-Of Temporal Anchor</label>
                      <div class="val"><i class="fa-solid fa-clock-rotate-left" style="color:var(--mj-brand-primary)"></i> {{ asOfLabel }}</div>
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
                      <button mjButton variant="secondary" size="sm" data-testid="ps-pipelines-add-source" (click)="addSource()"><i class="fa-solid fa-plus"></i> Add Source</button>
                      <button mjButton variant="secondary" size="sm" data-testid="ps-pipelines-add-step" (click)="addStep()"><i class="fa-solid fa-sliders"></i> Add Step</button>
                    </div>
                  </div>

                  <div class="pl-grid-3">
                    <!-- Feature Group: Sources -->
                    <div class="pl-feature-group">
                      <div class="pl-fg-head">
                        <span><i class="fa-solid fa-database"></i> Feed-In Sources ({{ editSources.length }})</span>
                      </div>
                      <div class="pl-fg-body">
                        @for (s of editSources; track $index) {
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
                        <span><i class="fa-solid fa-sliders"></i> Feature Transforms ({{ editSteps.length }})</span>
                      </div>
                      <div class="pl-fg-body">
                        @for (st of editSteps; track st.Id) {
                          <div class="pl-feature-card" data-testid="ps-pipelines-step-card" (click)="selectStep(st.Id)">
                            <div class="pl-feature-card-header">
                              <span class="pl-feature-name">{{ st.Label || st.Kind }}</span>
                              <span class="ps-tag">{{ st.Kind }}</span>
                            </div>
                            @if (getStepColumns(st); as cols) {
                              @if (cols.length > 0) {
                                <div class="pl-col-chips">
                                  @for (col of cols; track col) {
                                    <span class="pl-col-chip">{{ col }}</span>
                                  }
                                </div>
                              }
                            }
                            @if (getStepInputs(st); as inputs) {
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
                          <span class="pl-feature-name">{{ selectedAlgorithmName }}</span>
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
                        Deny-listed columns are excluded prior to matrix assembly. Dominance threshold: <strong>{{ editLeakage.SingleFeatureDominanceThreshold }}</strong>
                      </div>
                      <div style="margin-top:6px;">
                        @if (editLeakage.DenyFields.length === 0) {
                          <span style="font-size:12px; color:var(--mj-text-muted);">No deny-list columns configured.</span>
                        } @else {
                          @for (col of editLeakage.DenyFields; track col) {
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
                      <label>Validation Strategy</label>
                      <div class="val">{{ editValidation.Strategy }}</div>
                      <div class="sub">Cross-validation split</div>
                    </div>
                    <div class="pl-metric-box">
                      <label>Locked Holdout</label>
                      <div class="val">{{ (editValidation.LockedHoldoutFraction * 100).toFixed(0) }}%</div>
                      <div class="sub">Honest benchmark score</div>
                    </div>
                    <div class="pl-metric-box">
                      <label>Folds / Split</label>
                      <div class="val">{{ editValidation.Strategy === 'kfold' ? (editValidation.K || 5) + ' Folds' : ((editValidation.TestSize || 0.2) * 100).toFixed(0) + '% Test' }}</div>
                      <div class="sub">Training evaluation</div>
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

                  @if (pipelineModels.length === 0) {
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
                        @for (m of pipelineModels; track m.ID) {
                          <tr [class.winner-row]="m.Status === 'Published'" class="pl-model-row" (click)="openModelRecord(m.ID)" style="cursor:pointer;" title="Open model record in Explorer">
                            <td>
                              <div style="display:flex;align-items:center;gap:6px">
                                <a class="pl-model-link" href="javascript:void(0)" (click)="$event.stopPropagation(); openModelRecord(m.ID)">
                                  <strong>v{{ m.Version }}</strong>
                                </a>
                                @if (m.Status === 'Published') {
                                  <span class="ps-tag success"><i class="fa-solid fa-trophy"></i> Winner</span>
                                }
                              </div>
                            </td>
                            <td>{{ m.Algorithm || 'Algorithm' }}</td>
                            <td><strong>{{ formatHoldout(m) }}</strong></td>
                            <td><span class="ps-badge" [class]="statusClass(m.Status)">{{ m.Status }}</span></td>
                            <td>{{ m.TrainedAt | date:'short' }}</td>
                            <td style="text-align:right">
                              <button type="button" class="pl-action-icon-btn" (click)="$event.stopPropagation(); openModelRecord(m.ID)" title="Open model record in Explorer">
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
                      @if (publishedModel; as pub) {
                        <button mjButton variant="secondary" size="sm" type="button"
                          (click)="openModelRecord(pub.ID)"
                          title="Open model record in Explorer">
                          <i class="fa-solid fa-arrow-up-right-from-square"></i> Open Model Record
                        </button>
                        <button mjButton variant="secondary" size="sm" type="button"
                          (click)="viewTrainingRuns(pub.ID)"
                          title="View training runs for this model">
                          <i class="fa-solid fa-flask"></i> View Training Runs
                        </button>
                      }
                    </div>
                  </div>

                  <div class="pl-serving-box">
                    <div class="pl-metric-box">
                      <label>Active Serving Model</label>
                      <div class="val">
                        @if (publishedModel; as pub) {
                          <span>v{{ pub.Version }} ({{ pub.Algorithm || 'Model' }}) &bull; ID: {{ pub.ID.slice(0, 8) }}…</span>
                        } @else {
                          <span style="color:var(--mj-text-muted);">No published model serving live predictions yet.</span>
                        }
                      </div>
                      <div class="sub">Model: {{ publishedModel?.Status || 'None' }} &bull; Pipeline: {{ selectedPipeline?.Status }}</div>
                    </div>
                    <div class="pl-metric-box" style="background:var(--mj-brand-primary-subtle); border-color:rgba(0,118,182,0.2);">
                      <label>Inference Readiness</label>
                      <div class="val" style="color:var(--mj-brand-primary)">
                        <i class="fa-solid fa-circle-check"></i> Ready
                      </div>
                      <div class="sub">Batch & on-demand scoring enabled</div>
                    </div>
                  </div>
                </div>

              </div>
            }

            <!-- Graph Canvas & Inspector -->
            @if (isGraphView) {
              <div class="builder">
                <as-split direction="horizontal" class="builder-splitter" unit="percent" [gutterSize]="6" (dragEnd)="onInspectorSplitDragEnd($event.sizes)">
                  <as-split-area [size]="isInspectorCollapsed ? 100 : canvasSizePct" [minSize]="40">
                    <!-- Canvas Wrap -->
                    <div class="canvas-wrap">
                      <div class="canvas-bar">
                        <div class="canvas-bar-left">
                          <span class="ps-small ps-muted" style="font-weight:600">Add to Graph:</span>
                          <button class="ps-pchip s" data-testid="ps-pipelines-add-source" (click)="addSource()"><i class="fa-solid fa-database"></i> Source</button>
                          <button class="ps-pchip f" data-testid="ps-pipelines-add-step" (click)="addStep()"><i class="fa-solid fa-sliders"></i> Feature step</button>
                        </div>
                        <div class="canvas-bar-right">
                          <div class="ps-zoom-controls">
                            <button class="ps-icon-btn" (click)="zoomOut()" [disabled]="zoomLevel <= 0.5" title="Zoom Out"><i class="fa-solid fa-minus"></i></button>
                            <span class="ps-zoom-label" (click)="resetZoom()" title="Reset to 100%">{{ Math.round(zoomLevel * 100) }}%</span>
                            <button class="ps-icon-btn" (click)="zoomIn()" [disabled]="zoomLevel >= 2.0" title="Zoom In"><i class="fa-solid fa-plus"></i></button>
                          </div>
                          <button class="ps-icon-btn" [class.active]="!isInspectorCollapsed" (click)="toggleInspector()" [title]="isInspectorCollapsed ? 'Open Inspector' : 'Collapse Inspector'">
                            <i class="fa-solid fa-circle-info"></i>
                          </button>
                          <span class="ps-small ps-muted ps-node-count"><i class="fa-solid fa-circle-nodes"></i> {{ nodes.length }} nodes · {{ edges.length }} edges</span>
                        </div>
                      </div>

                  <div class="ps-flow big" data-testid="ps-pipelines-canvas">
                    <div class="ps-graph-viewport"
                         [style.width.px]="canvasW"
                         [style.height.px]="canvasH"
                         [style.transform]="'scale(' + zoomLevel + ')'">
                      <svg class="ps-graph-edges"
                           data-testid="ps-pipelines-edges"
                           [attr.width]="canvasW"
                           [attr.height]="canvasH">
                        <defs>
                          <marker id="ps-arrow" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="6" markerHeight="6" orient="auto">
                            <path d="M 0 1.5 L 8 5 L 0 8.5 z" fill="var(--mj-border-strong)" />
                          </marker>
                          <marker id="ps-arrow-active" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="6" markerHeight="6" orient="auto">
                            <path d="M 0 1.5 L 8 5 L 0 8.5 z" fill="var(--mj-brand-primary)" />
                          </marker>
                        </defs>
                        @for (edge of edges; track edge.from + '->' + edge.to) {
                          <path class="ps-edge-path"
                                [class.active]="isEdgeActive(edge)"
                                [attr.d]="edgePath(edge)"
                                [attr.marker-end]="isEdgeActive(edge) ? 'url(#ps-arrow-active)' : 'url(#ps-arrow)'"></path>
                        }
                      </svg>
                      @for (node of nodes; track node.id) {
                        <div class="ps-node" data-testid="ps-pipelines-node" [attr.data-node-id]="node.id"
                          [ngClass]="node.type" [class.selected]="node.id === selectedId"
                          [style.left.px]="node.x" [style.top.px]="node.y"
                          [style.width.px]="NODE_W"
                          (click)="selectNode(node.id)">
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

            @if (!isInspectorCollapsed) {
              <as-split-area [size]="inspectorSizePct" [minSize]="20" [maxSize]="55">
                <!-- Inspector -->
                <div class="ps-col inspector" data-testid="ps-pipelines-inspector">
                  <div class="ps-card insp">
                    <div class="ihead">
                      <i class="tile" [ngClass]="selectedNode.icon" [attr.data-type]="selectedNode.type"></i>
                      <div style="flex:1">
                        <h3 data-testid="ps-pipelines-inspector-title">{{ selectedNode.title }}</h3>
                        <div class="ps-small ps-muted">{{ nodeTypeLabel(selectedNode.type) }} · selected</div>
                      </div>
                      <button class="insp-collapse-btn" type="button" (click)="toggleInspector()" title="Collapse inspector" aria-label="Collapse inspector">
                        <i class="fa-solid fa-chevron-right"></i>
                      </button>
                      @if (selectedNode.type === 'src' || selectedNode.type === 'feat' || selectedNode.type === 'emb') {
                        <button mjButton variant="secondary" size="sm" data-testid="ps-pipelines-delete" (click)="deleteSelected()"><i class="fa-solid fa-trash"></i></button>
                      }
                    </div>
                    <div class="ps-card-body">
                      @if (selectedSource) {
                        <div class="ps-field"><label>Kind</label>
                          <select class="mj-input" [value]="selectedSource.Kind" (change)="setSourceKind(inputVal($event))">
                            @for (k of sourceKinds; track k) { <option [value]="k">{{ k }}</option> }
                          </select>
                        </div>
                        <div class="ps-field"><label>Reference (entity / query / id)</label>
                          <input class="mj-input" type="text" [value]="selectedSource.Ref" (input)="setSourceRef(inputVal($event))" />
                        </div>
                        <div class="ps-field"><label>Alias (optional)</label>
                          <input class="mj-input" type="text" [value]="selectedSource.Alias || ''" (input)="setSourceAlias(inputVal($event))" />
                        </div>
                      }
                      @if (selectedStep) {
                        <div class="ps-field"><label>Kind</label>
                          <select class="mj-input" [value]="selectedStep.Kind" (change)="setStepKind(inputVal($event))">
                            @for (k of stepKinds; track k) { <option [value]="k">{{ k }}</option> }
                          </select>
                        </div>
                        <div class="ps-field"><label>Label</label>
                          <input class="mj-input" type="text" [value]="selectedStep.Label || ''" (input)="setStepLabel(inputVal($event))" />
                        </div>
                        @switch (selectedStep.Kind) {
                          @case ('select') { <div class="ps-field"><label>Columns (comma-separated)</label><input class="mj-input" type="text" [value]="columnsText" (input)="setColumns(inputVal($event))" /></div> }
                          @case ('standardize') { <div class="ps-field"><label>Columns (comma-separated)</label><input class="mj-input" type="text" [value]="columnsText" (input)="setColumns(inputVal($event))" /></div> }
                          @case ('impute') {
                            <div class="ps-field"><label>Column</label><input class="mj-input" type="text" [value]="stepField('Column')" (input)="setStepStr('Column', inputVal($event))" /></div>
                            <div class="ps-field"><label>Strategy</label><select class="mj-input" [value]="stepField('Strategy')" (change)="setStepStr('Strategy', inputVal($event))">@for (s of imputeStrategies; track s) { <option [value]="s">{{ s }}</option> }</select></div>
                          }
                          @case ('onehot') { <div class="ps-field"><label>Column</label><input class="mj-input" type="text" [value]="stepField('Column')" (input)="setStepStr('Column', inputVal($event))" /></div> }
                          @case ('bin') {
                            <div class="ps-field"><label>Column</label><input class="mj-input" type="text" [value]="stepField('Column')" (input)="setStepStr('Column', inputVal($event))" /></div>
                            <div class="ps-field"><label>Bins</label><input class="mj-input" type="number" [value]="stepField('Bins')" (input)="setStepNum('Bins', inputVal($event))" /></div>
                          }
                          @case ('embedding') {
                            <div class="ps-field"><label>Entity</label><input class="mj-input" type="text" [value]="stepField('Entity')" (input)="setStepStr('Entity', inputVal($event))" /></div>
                            <div class="ps-field"><label>Embedding model ref</label><input class="mj-input" type="text" [value]="stepField('EmbeddingModelRef')" (input)="setStepStr('EmbeddingModelRef', inputVal($event))" /></div>
                            <div class="ps-field"><label>Dimensions</label><input class="mj-input" type="number" [value]="stepField('Dims')" (input)="setStepNum('Dims', inputVal($event))" /></div>
                          }
                          @case ('llm-derived') { <div class="ps-field"><label>Feature Pipeline ref</label><input class="mj-input" type="text" [value]="stepField('FeaturePipelineRef')" (input)="setStepStr('FeaturePipelineRef', inputVal($event))" /></div> }
                          @case ('flow-agent') { <div class="ps-field"><label>Flow Agent ref</label><input class="mj-input" type="text" [value]="stepField('FlowAgentRef')" (input)="setStepStr('FlowAgentRef', inputVal($event))" /></div> }
                          @case ('vision-llm') { <div class="ps-field"><label>Image column</label><input class="mj-input" type="text" [value]="stepField('ImageColumn')" (input)="setStepStr('ImageColumn', inputVal($event))" /></div> }
                        }
                      }
                      @if (selectedNode.type === 'target') {
                        <div class="ps-field"><label>Target variable</label><input class="mj-input" type="text" [value]="editTargetVariable" (input)="setTargetVariable(inputVal($event))" /></div>
                        <div class="ps-field"><label>Problem type</label><select class="mj-input" [value]="editProblemType" (change)="setProblemType(inputVal($event))">@for (pt of problemTypes; track pt) { <option [value]="pt">{{ pt }}</option> }</select></div>
                      }
                      @if (selectedNode.type === 'algo') {
                        <div class="ps-field"><label>Algorithm</label><select class="mj-input" [value]="editAlgorithmId" (change)="setAlgorithm(inputVal($event))">@for (a of algorithms; track a.ID) { <option [value]="a.ID">{{ a.Name }}</option> }</select></div>
                        <div class="ps-field"><label>Hyperparameters (JSON)</label><textarea class="mj-textarea" rows="4" [value]="editHyperparams" (input)="setHyperparams(inputVal($event))"></textarea></div>
                        @if (publishedModel; as pub) {
                          <div style="margin-top:12px;padding:10px;border-radius:var(--mj-radius-sm);background:var(--mj-bg-surface-sunken);border:1px solid var(--mj-border-default);">
                            <div class="ps-small ps-muted" style="margin-bottom:6px;">Current Serving Winner</div>
                            <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:8px;">
                              <span style="font-size:var(--mj-text-xs);font-weight:600;">v{{ pub.Version }} ({{ pub.Algorithm || 'Model' }})</span>
                              <span class="ps-tag success"><i class="fa-solid fa-trophy"></i> Active</span>
                            </div>
                            <div style="display:flex;gap:6px;">
                              <button mjButton variant="secondary" size="sm" type="button" (click)="openModelRecord(pub.ID)" style="flex:1;justify-content:center;" title="Open model record in Explorer">
                                <i class="fa-solid fa-arrow-up-right-from-square"></i> Model
                              </button>
                              <button mjButton variant="secondary" size="sm" type="button" (click)="viewTrainingRuns(pub.ID)" style="flex:1;justify-content:center;" title="View training runs">
                                <i class="fa-solid fa-flask"></i> Runs
                              </button>
                            </div>
                          </div>
                        }
                      }
                      @if (selectedNode.type === 'output') {
                        @if (pipelineModels.length === 0) {
                          <div class="ps-small ps-muted">The trained model artifact. Run <strong>Train</strong> to produce a new versioned model from this pipeline.</div>
                        } @else {
                          <div style="display:flex;flex-direction:column;gap:12px;">
                            @if (pipelineModels.length > 1) {
                              <div class="ps-field">
                                <label>Model Version</label>
                                <select class="mj-input" [value]="inspectedModel?.ID" (change)="selectModelVersion(inputVal($event))">
                                  @for (m of pipelineModels; track m.ID) {
                                    <option [value]="m.ID">v{{ m.Version }} · {{ m.Algorithm || 'Algorithm' }} ({{ m.Status }})</option>
                                  }
                                </select>
                              </div>
                            }
                            @if (inspectedModel; as mdl) {
                              <div style="border:1px solid var(--mj-border-default);border-radius:var(--mj-radius-md);padding:12px;background:var(--mj-bg-surface-sunken);display:flex;flex-direction:column;gap:8px;">
                                <div style="display:flex;justify-content:space-between;align-items:center;">
                                  <div style="display:flex;align-items:center;gap:6px;">
                                    <strong>v{{ mdl.Version }}</strong>
                                    @if (mdl.Status === 'Published') {
                                      <span class="ps-tag success"><i class="fa-solid fa-trophy"></i> Winner</span>
                                    }
                                    <span class="ps-badge" [class]="statusClass(mdl.Status)">{{ mdl.Status }}</span>
                                  </div>
                                  <span class="ps-mono ps-small ps-muted" [title]="mdl.ID">{{ mdl.ID.slice(0, 8) }}…</span>
                                </div>
                                <div style="font-size:var(--mj-text-xs);color:var(--mj-text-secondary);">
                                  Algorithm: <strong>{{ mdl.Algorithm || selectedAlgorithmName }}</strong>
                                </div>
                                <div style="font-size:var(--mj-text-xs);color:var(--mj-text-secondary);">
                                  Holdout Score: <strong>{{ formatHoldout(mdl) }}</strong>
                                </div>
                                <div style="display:flex;flex-direction:column;gap:6px;margin-top:4px;">
                                  <button mjButton variant="primary" size="sm" type="button" (click)="openModelRecord(mdl.ID)" style="width:100%;justify-content:center;">
                                    <i class="fa-solid fa-arrow-up-right-from-square"></i> Open Model Details
                                  </button>
                                  <button mjButton variant="secondary" size="sm" type="button" (click)="viewTrainingRuns(mdl.ID)" style="width:100%;justify-content:center;">
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
                      <div class="ps-field"><label>Deny-list columns (comma-separated)</label><input class="mj-input" type="text" [value]="denyText" (input)="setDeny(inputVal($event))" /></div>
                      <div class="ps-field"><label>Single-feature dominance threshold</label><input class="mj-input" type="number" step="0.05" min="0" max="1" [value]="editLeakage.SingleFeatureDominanceThreshold" (input)="setThreshold(inputVal($event))" /></div>
                    </div>
                  </div>

                  <!-- As-of strategy (editable) -->
                  <div class="ps-card">
                    <div class="ps-card-head"><i class="fa-solid fa-clock-rotate-left" style="color:var(--mj-brand-primary)"></i><h3>As-of strategy</h3></div>
                    <div class="ps-card-body">
                      <div class="ps-field"><label>Mode</label><select class="mj-input" [value]="editAsOf.Mode" (change)="setAsOfMode(inputVal($event))"><option value="none">none</option><option value="column">column</option><option value="offset">offset</option></select></div>
                      @if (editAsOf.Mode === 'column') { <div class="ps-field"><label>Decision-date column</label><input class="mj-input" type="text" [value]="editAsOf.Column || ''" (input)="setAsOfColumn(inputVal($event))" /></div> }
                      @if (editAsOf.Mode === 'offset') { <div class="ps-field"><label>Offset days before label</label><input class="mj-input" type="number" [value]="editAsOf.OffsetDays ?? 0" (input)="setAsOfOffset(inputVal($event))" /></div> }
                    </div>
                  </div>

                  <!-- Validation (editable) -->
                  <div class="ps-card">
                    <div class="ps-card-head"><i class="fa-solid fa-scissors" style="color:var(--mj-brand-primary)"></i><h3>Validation</h3></div>
                    <div class="ps-card-body">
                      <div class="ps-field"><label>Strategy</label><select class="mj-input" [value]="editValidation.Strategy" (change)="setValStrategy(inputVal($event))"><option value="train_test_split">train_test_split</option><option value="kfold">kfold</option><option value="holdout">holdout</option></select></div>
                      @if (editValidation.Strategy === 'train_test_split') { <div class="ps-field"><label>Test size</label><input class="mj-input" type="number" step="0.05" [value]="editValidation.TestSize ?? 0.2" (input)="setTestSize(inputVal($event))" /></div> }
                      @if (editValidation.Strategy === 'kfold') { <div class="ps-field"><label>Folds (k)</label><input class="mj-input" type="number" [value]="editValidation.K ?? 5" (input)="setK(inputVal($event))" /></div> }
                      <div class="ps-field"><label>Locked holdout fraction</label><input class="mj-input" type="number" step="0.05" [value]="editValidation.LockedHoldoutFraction" (input)="setHoldout(inputVal($event))" /></div>
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

      @if (showWizard) {
        <ps-pipeline-wizard
          [engine]="engine"
          [provider]="provider"
          [currentUser]="currentUser"
          [cloneFrom]="wizardClonePipeline"
          [initialAlgorithmId]="initialWizardAlgorithmId"
          (saved)="onWizardSaved($event)"
          (trainRequested)="onWizardTrainRequested($event)"
          (closed)="closeWizard()">
        </ps-pipeline-wizard>
      }
    </div>
  `,
})
export class PSPipelinesComponent implements OnInit, OnChanges {
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
  @Output() Navigate = new EventEmitter<PSPanelKey>();

  /**
   * @deprecated Use {@link Navigate}.
   *
   * The same emitter under the old binding name, so a template still binding
   * (navigate) keeps working. Must stay AFTER Navigate: class fields
   * initialise in order, and the other way round this captures undefined.
   */
  @Output() navigate = this.Navigate;

  private cdr = inject(ChangeDetectorRef);
  private notifications = inject(MJNotificationService);
  private navigationService = inject(NavigationService);

  public IsCatalogCollapsed = false;

  /** @deprecated Use {@link IsCatalogCollapsed}. */
  public get isCatalogCollapsed() {
    return this.IsCatalogCollapsed;
  }
  /** @deprecated Use {@link IsCatalogCollapsed}. */
  public set isCatalogCollapsed(value) {
    this.IsCatalogCollapsed = value;
  }
  public CatalogSizePct = 28;

  /** @deprecated Use {@link CatalogSizePct}. */
  public get catalogSizePct() {
    return this.CatalogSizePct;
  }
  /** @deprecated Use {@link CatalogSizePct}. */
  public set catalogSizePct(value) {
    this.CatalogSizePct = value;
  }
  public WorkspaceSizePct = 72;

  /** @deprecated Use {@link WorkspaceSizePct}. */
  public get workspaceSizePct() {
    return this.WorkspaceSizePct;
  }
  /** @deprecated Use {@link WorkspaceSizePct}. */
  public set workspaceSizePct(value) {
    this.WorkspaceSizePct = value;
  }
  public IsInspectorCollapsed = false;

  /** @deprecated Use {@link IsInspectorCollapsed}. */
  public get isInspectorCollapsed() {
    return this.IsInspectorCollapsed;
  }
  /** @deprecated Use {@link IsInspectorCollapsed}. */
  public set isInspectorCollapsed(value) {
    this.IsInspectorCollapsed = value;
  }
  public CanvasSizePct = 72;

  /** @deprecated Use {@link CanvasSizePct}. */
  public get canvasSizePct() {
    return this.CanvasSizePct;
  }
  /** @deprecated Use {@link CanvasSizePct}. */
  public set canvasSizePct(value) {
    this.CanvasSizePct = value;
  }
  public InspectorSizePct = 28;

  /** @deprecated Use {@link InspectorSizePct}. */
  public get inspectorSizePct() {
    return this.InspectorSizePct;
  }
  /** @deprecated Use {@link InspectorSizePct}. */
  public set inspectorSizePct(value) {
    this.InspectorSizePct = value;
  }

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

  public ShowWizard = false;

  /** @deprecated Use {@link ShowWizard}. */
  public get showWizard() {
    return this.ShowWizard;
  }
  /** @deprecated Use {@link ShowWizard}. */
  public set showWizard(value) {
    this.ShowWizard = value;
  }
  public WizardClonePipeline: MJMLTrainingPipelineEntity | null = null;

  /** @deprecated Use {@link WizardClonePipeline}. */
  public get wizardClonePipeline(): MJMLTrainingPipelineEntity | null {
    return this.WizardClonePipeline;
  }
  /** @deprecated Use {@link WizardClonePipeline}. */
  public set wizardClonePipeline(value: MJMLTrainingPipelineEntity | null) {
    this.WizardClonePipeline = value;
  }
  public initialWizardAlgorithmId?: string;  // case-violation-ok-legacy-back-compat: an accessor cannot be optional, so a stub would turn this into a required member

  @Input() public ViewMode: 'stages' | 'graph' | 'dag' = 'stages';

  /** @deprecated Use {@link ViewMode}. */
  @Input() public set viewMode(value: 'stages' | 'graph' | 'dag') {
    this.ViewMode = value;
  }
  /** @deprecated Use {@link ViewMode}. */
  public get viewMode(): 'stages' | 'graph' | 'dag' {
    return this.ViewMode;
  }
  public SearchQuery = '';

  /** @deprecated Use {@link SearchQuery}. */
  public get searchQuery() {
    return this.SearchQuery;
  }
  /** @deprecated Use {@link SearchQuery}. */
  public set searchQuery(value) {
    this.SearchQuery = value;
  }
  public ActiveFilter = 'all';

  /** @deprecated Use {@link ActiveFilter}. */
  public get activeFilter() {
    return this.ActiveFilter;
  }
  /** @deprecated Use {@link ActiveFilter}. */
  public set activeFilter(value) {
    this.ActiveFilter = value;
  }

  public readonly NODE_W = NODE_W;
  public readonly NODE_H = NODE_H;
  public Math = Math;
  public ZoomLevel = 1;

  /** @deprecated Use {@link ZoomLevel}. */
  public get zoomLevel() {
    return this.ZoomLevel;
  }
  /** @deprecated Use {@link ZoomLevel}. */
  public set zoomLevel(value) {
    this.ZoomLevel = value;
  }

  public OpenWizard(algoId?: string): void {
    this.WizardClonePipeline = null;
    this.initialWizardAlgorithmId = algoId;
    this.ShowWizard = true;
  }

  /** @deprecated Use {@link OpenWizard}. */
  public openWizard(algoId?: string): void {
    return this.OpenWizard(algoId);
  }

  public CloneSelected(): void {
    if (!this.SelectedPipeline) return;
    this.WizardClonePipeline = this.SelectedPipeline;
    this.initialWizardAlgorithmId = undefined;
    this.ShowWizard = true;
  }

  /** @deprecated Use {@link CloneSelected}. */
  public cloneSelected(): void {
    return this.CloneSelected();
  }

  public CloseWizard(): void {
    this.ShowWizard = false;
    this.WizardClonePipeline = null;
    this.initialWizardAlgorithmId = undefined;
  }

  /** @deprecated Use {@link CloseWizard}. */
  public closeWizard(): void {
    return this.CloseWizard();
  }

  public async OnWizardSaved(pipeline: MJMLTrainingPipelineEntity): Promise<void> {
    this.CloseWizard();
    await this.engine.Config(true, this.CurrentUser ?? undefined, this.provider ?? undefined);
    this.Pipelines = this.engine.Pipelines;
    this.SelectPipeline(pipeline.ID);
    this.cdr.detectChanges();
  }

  /** @deprecated Use {@link OnWizardSaved}. */
  public async onWizardSaved(pipeline: MJMLTrainingPipelineEntity): Promise<void> {
    return this.OnWizardSaved(pipeline);
  }

  public async OnWizardTrainRequested(pipeline: MJMLTrainingPipelineEntity): Promise<void> {
    this.CloseWizard();
    await this.engine.Config(true, this.CurrentUser ?? undefined, this.provider ?? undefined);
    this.Pipelines = this.engine.Pipelines;
    this.SelectPipeline(pipeline.ID);
    await this.train();
  }

  /** @deprecated Use {@link OnWizardTrainRequested}. */
  public async onWizardTrainRequested(pipeline: MJMLTrainingPipelineEntity): Promise<void> {
    return this.OnWizardTrainRequested(pipeline);
  }

  // Editable spec state (the source of truth; nodes/edges are derived).
  public EditSources: SourceBinding[] = [];

  /** @deprecated Use {@link EditSources}. */
  public get editSources(): SourceBinding[] {
    return this.EditSources;
  }
  /** @deprecated Use {@link EditSources}. */
  public set editSources(value: SourceBinding[]) {
    this.EditSources = value;
  }
  public EditSteps: FeatureStep[] = [];

  /** @deprecated Use {@link EditSteps}. */
  public get editSteps(): FeatureStep[] {
    return this.EditSteps;
  }
  /** @deprecated Use {@link EditSteps}. */
  public set editSteps(value: FeatureStep[]) {
    this.EditSteps = value;
  }
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

  /** @deprecated Use {@link OnSplitDragEnd}. */
  public onSplitDragEnd(sizes: readonly (number | '*')[]): void {
    return this.OnSplitDragEnd(sizes);
  }

  public ToggleCatalog(): void {
    this.IsCatalogCollapsed = !this.IsCatalogCollapsed;
    this.saveLayoutPrefs();
    this.cdr.markForCheck();
  }

  /** @deprecated Use {@link ToggleCatalog}. */
  public toggleCatalog(): void {
    return this.ToggleCatalog();
  }

  public OnInspectorSplitDragEnd(sizes: readonly (number | '*')[]): void {
    if (Array.isArray(sizes) && sizes.length === 2 && typeof sizes[0] === 'number' && typeof sizes[1] === 'number') {
      this.CanvasSizePct = Math.round(sizes[0]);
      this.InspectorSizePct = Math.round(sizes[1]);
      this.saveLayoutPrefs();
    }
  }

  /** @deprecated Use {@link OnInspectorSplitDragEnd}. */
  public onInspectorSplitDragEnd(sizes: readonly (number | '*')[]): void {
    return this.OnInspectorSplitDragEnd(sizes);
  }

  public ToggleInspector(): void {
    this.IsInspectorCollapsed = !this.IsInspectorCollapsed;
    this.saveLayoutPrefs();
    this.cdr.markForCheck();
  }

  /** @deprecated Use {@link ToggleInspector}. */
  public toggleInspector(): void {
    return this.ToggleInspector();
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

  /** @deprecated Use {@link OpenModelRecord}. */
  public openModelRecord(modelId: string): void {
    return this.OpenModelRecord(modelId);
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

  /** @deprecated Use {@link ViewTrainingRuns}. */
  public viewTrainingRuns(modelId?: string): void {
    return this.ViewTrainingRuns(modelId);
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

  /** @deprecated Use {@link RefreshFromEngine}. */
  public refreshFromEngine(): void {
    return this.RefreshFromEngine();
  }

  public get IsGraphView(): boolean {
    return this.ViewMode === 'graph' || this.ViewMode === 'dag';
  }

  /** @deprecated Use {@link IsGraphView}. */
  public get isGraphView(): boolean {
    return this.IsGraphView;
  }

  public ToggleViewMode(): void {
    this.ViewMode = this.IsGraphView ? 'stages' : 'graph';
  }

  /** @deprecated Use {@link ToggleViewMode}. */
  public toggleViewMode(): void {
    return this.ToggleViewMode();
  }

  public ZoomIn(): void {
    this.ZoomLevel = Math.min(2.0, Math.round((this.ZoomLevel + 0.15) * 100) / 100);
  }

  /** @deprecated Use {@link ZoomIn}. */
  public zoomIn(): void {
    return this.ZoomIn();
  }

  public ZoomOut(): void {
    this.ZoomLevel = Math.max(0.5, Math.round((this.ZoomLevel - 0.15) * 100) / 100);
  }

  /** @deprecated Use {@link ZoomOut}. */
  public zoomOut(): void {
    return this.ZoomOut();
  }

  public ResetZoom(): void {
    this.ZoomLevel = 1;
  }

  /** @deprecated Use {@link ResetZoom}. */
  public resetZoom(): void {
    return this.ResetZoom();
  }

  public InputVal(e: Event): string {
    return (e.target as HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement).value;
  }

  /** @deprecated Use {@link InputVal}. */
  public inputVal(e: Event): string {
    return this.InputVal(e);
  }

  public IsEdgeActive(edge: DagEdge): boolean {
    return this.SelectedId === edge.from || this.SelectedId === edge.to;
  }

  /** @deprecated Use {@link IsEdgeActive}. */
  public isEdgeActive(edge: DagEdge): boolean {
    return this.IsEdgeActive(edge);
  }

  public SetFilter(f: string): void {
    this.ActiveFilter = f;
  }

  /** @deprecated Use {@link SetFilter}. */
  public setFilter(f: string): void {
    return this.SetFilter(f);
  }

  public OnSearchInput(ev: Event): void {
    this.SearchQuery = ((ev.target as HTMLInputElement)?.value ?? '').toLowerCase();
  }

  /** @deprecated Use {@link OnSearchInput}. */
  public onSearchInput(ev: Event): void {
    return this.OnSearchInput(ev);
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

  /** @deprecated Use {@link FilteredPipelines}. */
  public get filteredPipelines(): MJMLTrainingPipelineEntity[] {
    return this.FilteredPipelines;
  }

  public PipelineDomain(p?: MJMLTrainingPipelineEntity): string {
    if (!p) return 'Platform';
    const n = (p.Name || '') + (p.TargetEntity || '');
    if (n.includes('MoreCheese') || n.includes('Membership') || n.includes('Event') || n.includes('Course')) return 'More Cheese Club';
    if (n.includes('AI') || n.includes('Prompt') || n.includes('Agent')) return 'MemberJunction Platform';
    return 'BizApps';
  }

  /** @deprecated Use {@link PipelineDomain}. */
  public pipelineDomain(p?: MJMLTrainingPipelineEntity): string {
    return this.PipelineDomain(p);
  }

  public TargetEntityName(p?: MJMLTrainingPipelineEntity): string {
    if (!p) return 'Entity';
    return p.TargetEntity || this.EditSources[0]?.Ref || 'Entity';
  }

  /** @deprecated Use {@link TargetEntityName}. */
  public targetEntityName(p?: MJMLTrainingPipelineEntity): string {
    return this.TargetEntityName(p);
  }

  public get PipelineModels(): MJMLModelEntity[] {
    if (!this.SelectedPipelineId || !this.engine?.Models) return [];
    return this.engine.Models.filter((m) => UUIDsEqual(m.PipelineID, this.SelectedPipelineId));
  }

  /** @deprecated Use {@link PipelineModels}. */
  public get pipelineModels(): MJMLModelEntity[] {
    return this.PipelineModels;
  }

  public get PublishedModel(): MJMLModelEntity | undefined {
    return this.PipelineModels.find((m) => m.Status === 'Published') ?? this.PipelineModels[0];
  }

  /** @deprecated Use {@link PublishedModel}. */
  public get publishedModel(): MJMLModelEntity | undefined {
    return this.PublishedModel;
  }

  public SelectedModelVersionId: string | null = null;

  /** @deprecated Use {@link SelectedModelVersionId}. */
  public get selectedModelVersionId(): string | null {
    return this.SelectedModelVersionId;
  }
  /** @deprecated Use {@link SelectedModelVersionId}. */
  public set selectedModelVersionId(value: string | null) {
    this.SelectedModelVersionId = value;
  }

  public get InspectedModel(): MJMLModelEntity | undefined {
    if (this.SelectedModelVersionId) {
      const found = this.PipelineModels.find((m) => UUIDsEqual(m.ID, this.SelectedModelVersionId));
      if (found) return found;
    }
    return this.PublishedModel;
  }

  /** @deprecated Use {@link InspectedModel}. */
  public get inspectedModel(): MJMLModelEntity | undefined {
    return this.InspectedModel;
  }

  public SelectModelVersion(id: string): void {
    this.SelectedModelVersionId = id;
    this.cdr.markForCheck();
  }

  /** @deprecated Use {@link SelectModelVersion}. */
  public selectModelVersion(id: string): void {
    return this.SelectModelVersion(id);
  }

  public BestMetricForPipeline(p?: MJMLTrainingPipelineEntity): string | null {
    if (!p || !this.engine?.Models) return null;
    const models = this.engine.Models.filter((m) => UUIDsEqual(m.PipelineID, p.ID));
    if (models.length === 0) return null;
    const best = models.find((m) => m.Status === 'Published') ?? models[0];
    return this.FormatHoldout(best);
  }

  /** @deprecated Use {@link BestMetricForPipeline}. */
  public bestMetricForPipeline(p?: MJMLTrainingPipelineEntity): string | null {
    return this.BestMetricForPipeline(p);
  }

  public SelectStep(id: string): void {
    this.SelectNode(id);
  }

  /** @deprecated Use {@link SelectStep}. */
  public selectStep(id: string): void {
    return this.SelectStep(id);
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

  /** @deprecated Use {@link GetStepColumns}. */
  public getStepColumns(step: FeatureStep): string[] {
    return this.GetStepColumns(step);
  }

  public GetStepInputs(step: FeatureStep): string[] {
    return step.Inputs ?? [];
  }

  /** @deprecated Use {@link GetStepInputs}. */
  public getStepInputs(step: FeatureStep): string[] {
    return this.GetStepInputs(step);
  }

  public FormatHoldout(m: MJMLModelEntity): string {
    if (!m.HoldoutMetrics) return m.Metrics ? 'Trained' : 'Pending';
    try {
      const hm = typeof m.HoldoutMetrics === 'string' ? JSON.parse(m.HoldoutMetrics) : m.HoldoutMetrics;
      if (hm.auc != null) return `AUC ${(Number(hm.auc)).toFixed(3)}`;
      if (hm.r2 != null) return `R² ${(Number(hm.r2)).toFixed(3)}`;
      if (hm.rmse != null) return `RMSE ${(Number(hm.rmse)).toFixed(2)}`;
      if (hm.accuracy != null) return `Acc ${(Number(hm.accuracy) * 100).toFixed(1)}%`;
      return 'Scored';
    } catch {
      return 'Scored';
    }
  }

  /** @deprecated Use {@link FormatHoldout}. */
  public formatHoldout(m: MJMLModelEntity): string {
    return this.FormatHoldout(m);
  }

  public get AsOfLabel(): string {
    if (this.EditAsOf.Mode === 'column') return `Column: ${this.EditAsOf.Column || 'DecisionDate'}`;
    if (this.EditAsOf.Mode === 'offset') return `Offset: ${this.EditAsOf.OffsetDays || 0}d prior`;
    return 'None (Static snapshot)';
  }

  /** @deprecated Use {@link AsOfLabel}. */
  public get asOfLabel(): string {
    return this.AsOfLabel;
  }

  public get SelectedAlgorithmName(): string {
    return this.engine?.AlgorithmName(this.EditAlgorithmId) || 'Auto-select (Tournament)';
  }

  /** @deprecated Use {@link SelectedAlgorithmName}. */
  public get selectedAlgorithmName(): string {
    return this.SelectedAlgorithmName;
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
    this.EditValidation = this.parse<ValidationStrategy>(p.ValidationStrategy, { Strategy: 'train_test_split', TestSize: 0.2, LockedHoldoutFraction: 0.15 });
    this.stepSeq = this.EditSteps.length;
    this.Dirty = false;
    this.rebuild();
    this.SelectedId = this.Nodes[0]?.id ?? '';
  }

  /** @deprecated Use {@link SelectPipeline}. */
  public selectPipeline(id: string): void {
    return this.SelectPipeline(id);
  }

  public get SelectedPipeline(): MJMLTrainingPipelineEntity | undefined {
    return this.Pipelines.find((p) => UUIDsEqual(p.ID, this.SelectedPipelineId));
  }

  /** @deprecated Use {@link SelectedPipeline}. */
  public get selectedPipeline(): MJMLTrainingPipelineEntity | undefined {
    return this.SelectedPipeline;
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
    return i >= 0 ? this.EditSources[i] ?? null : null;
  }

  /** @deprecated Use {@link SelectedSource}. */
  public get selectedSource(): SourceBinding | null {
    return this.SelectedSource;
  }
  public get SelectedStep(): FeatureStep | null {
    return this.EditSteps.find((s) => s.Id === this.SelectedId) ?? null;
  }

  /** @deprecated Use {@link SelectedStep}. */
  public get selectedStep(): FeatureStep | null {
    return this.SelectedStep;
  }
  public get OtherSteps(): FeatureStep[] {
    return this.EditSteps.filter((s) => s.Id !== this.SelectedId);
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

  public SetStepKind(kind: string): void {
    const idx = this.EditSteps.findIndex((s) => s.Id === this.SelectedId);
    if (idx < 0) {
      return;
    }
    const prev = this.EditSteps[idx];
    this.EditSteps[idx] = this.defaultStep(kind as FeatureStepKind, prev.Id, prev.Label, prev.Inputs);
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
    this.EditSources = [...this.EditSources, { Kind: 'Entity', Ref: '' }];
    this.markDirty();
    this.SelectedId = `src:${this.EditSources.length - 1}`;
  }

  /** @deprecated Use {@link AddSource}. */
  public addSource(): void {
    return this.AddSource();
  }
  public AddStep(): void {
    const id = `step_${++this.stepSeq}`;
    this.EditSteps = [...this.EditSteps, this.defaultStep('select', id)];
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

  public async save(): Promise<void> {
    const p = this.SelectedPipeline;
    if (!p || this.Busy) {
      return;
    }
    this.Busy = true;
    try {
      p.SourceBindings = JSON.stringify(this.EditSources);
      p.FeatureSteps = JSON.stringify({ Steps: this.EditSteps });
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
    const p = this.SelectedPipeline;
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

  public StatusClass(status: string): string {
    switch (status) {
      case 'Published': return 'published';
      case 'Validated': return 'validated';
      default: return 'draft';
    }
  }

  /** @deprecated Use {@link StatusClass}. */
  public statusClass(status: string): string {
    return this.StatusClass(status);
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

  /** @deprecated Use {@link NodeTypeLabel}. */
  public nodeTypeLabel(type: NodeType): string {
    return this.NodeTypeLabel(type);
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

  /** @deprecated Use {@link EdgePath}. */
  public edgePath(edge: DagEdge): string {
    return this.EdgePath(edge);
  }
}
