import { ChangeDetectorRef, Component, EventEmitter, Input, OnInit, Output, ViewEncapsulation, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { MJButtonDirective } from '@memberjunction/ng-ui-components';
import { MJNotificationService } from '@memberjunction/ng-notifications';
import { UUIDsEqual } from '@memberjunction/global';
import { IMetadataProvider, UserInfo } from '@memberjunction/core';
import { MJMLTrainingPipelineEntity, MJMLModelEntity, PredictiveStudioTrainModelOperation } from '@memberjunction/core-entities';
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
  imports: [CommonModule, MJButtonDirective, PSPipelineWizardComponent],
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
        <div class="pl-layout">
          <!-- Left Column: Master Pipeline Catalog -->
          <div class="pl-catalog" data-testid="ps-pipelines-catalog">
            <div class="pl-catalog-header">
              <div class="pl-catalog-title-row">
                <h2>Pipelines ({{ filteredPipelines.length }})</h2>
                <button mjButton variant="primary" size="sm" data-testid="ps-pipelines-new" (click)="openWizard()">
                  <i class="fa-solid fa-plus"></i> New
                </button>
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
                          <div class="pl-feature-row">
                            <span class="pl-feature-name">{{ st.Label || st.Kind }}</span>
                            <span class="ps-tag">{{ st.Kind }}</span>
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
                        </tr>
                      </thead>
                      <tbody>
                        @for (m of pipelineModels; track m.ID) {
                          <tr [class.winner-row]="m.Status === 'Published'">
                            <td>
                              <strong>v{{ m.Version }}</strong>
                              @if (m.Status === 'Published') {
                                <span class="ps-tag success" style="margin-left:6px;"><i class="fa-solid fa-trophy"></i> Winner</span>
                              }
                            </td>
                            <td>{{ m.Algorithm || 'Algorithm' }}</td>
                            <td><strong>{{ formatHoldout(m) }}</strong></td>
                            <td><span class="ps-badge" [class]="statusClass(m.Status)">{{ m.Status }}</span></td>
                            <td>{{ m.TrainedAt | date:'short' }}</td>
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
                    @if (publishedModel; as pub) {
                      <a class="ps-btn ps-btn-secondary" style="font-size:11px; padding:4px 10px; text-decoration:none;"
                        [href]="'/app/predictive-studio/Models?modelId=' + pub.ID">
                        <i class="fa-solid fa-arrow-up-right-from-square"></i> Open in Model Registry
                      </a>
                    }
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

                <!-- Inspector -->
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
              </div>
            }
          </div>
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
export class PSPipelinesComponent implements OnInit {
  @Input() engine!: PredictiveStudioEngine;
  @Input() provider: IMetadataProvider | null = null;
  @Input() currentUser: UserInfo | null = null;

  @Output() askAgent = new EventEmitter<string>();

  private cdr = inject(ChangeDetectorRef);
  private notifications = inject(MJNotificationService);

  public readonly starterPrompt = PS_PIPELINES_STARTER_PROMPT;
  public readonly sourceKinds = SOURCE_KINDS;
  public readonly stepKinds = STEP_KINDS;
  public readonly problemTypes = PROBLEM_TYPES;
  public readonly imputeStrategies = IMPUTE_STRATEGIES;

  public pipelines: MJMLTrainingPipelineEntity[] = [];
  public selectedPipelineId = '';

  public showWizard = false;
  public wizardClonePipeline: MJMLTrainingPipelineEntity | null = null;
  public initialWizardAlgorithmId?: string;

  @Input() public viewMode: 'stages' | 'graph' | 'dag' = 'stages';
  public searchQuery = '';
  public activeFilter = 'all';

  public readonly NODE_W = NODE_W;
  public readonly NODE_H = NODE_H;
  public Math = Math;
  public zoomLevel = 1;

  public openWizard(algoId?: string): void {
    this.wizardClonePipeline = null;
    this.initialWizardAlgorithmId = algoId;
    this.showWizard = true;
  }

  public cloneSelected(): void {
    if (!this.selectedPipeline) return;
    this.wizardClonePipeline = this.selectedPipeline;
    this.initialWizardAlgorithmId = undefined;
    this.showWizard = true;
  }

  public closeWizard(): void {
    this.showWizard = false;
    this.wizardClonePipeline = null;
    this.initialWizardAlgorithmId = undefined;
  }

  public async onWizardSaved(pipeline: MJMLTrainingPipelineEntity): Promise<void> {
    this.closeWizard();
    await this.engine.Config(true, this.currentUser ?? undefined, this.provider ?? undefined);
    this.pipelines = this.engine.Pipelines;
    this.selectPipeline(pipeline.ID);
    this.cdr.detectChanges();
  }

  public async onWizardTrainRequested(pipeline: MJMLTrainingPipelineEntity): Promise<void> {
    this.closeWizard();
    await this.engine.Config(true, this.currentUser ?? undefined, this.provider ?? undefined);
    this.pipelines = this.engine.Pipelines;
    this.selectPipeline(pipeline.ID);
    await this.train();
  }

  // Editable spec state (the source of truth; nodes/edges are derived).
  public editSources: SourceBinding[] = [];
  public editSteps: FeatureStep[] = [];
  public editTargetVariable = '';
  public editProblemType: ProblemType = 'classification';
  public editAlgorithmId = '';
  public editHyperparams = '{}';
  public editLeakage: LeakageGuard = { DenyFields: [], SingleFeatureDominanceThreshold: DOMINANCE_THRESHOLD_DEFAULT };
  public editAsOf: AsOfStrategy = { Mode: 'none' };
  public editValidation: ValidationStrategy = { Strategy: 'train_test_split', TestSize: 0.2, LockedHoldoutFraction: 0.15 };

  public nodes: DagNode[] = [];
  public edges: DagEdge[] = [];
  public selectedId = '';
  public canvasW = 800;
  public canvasH = 460;
  public dirty = false;
  public busy = false;

  private nodeById = new Map<string, DagNode>();
  private stepSeq = 0;

  ngOnInit(): void {
    this.pipelines = this.engine?.Pipelines ?? [];
    if (this.pipelines.length > 0) {
      this.selectPipeline(this.pipelines[0].ID);
    }
  }

  public get isGraphView(): boolean {
    return this.viewMode === 'graph' || this.viewMode === 'dag';
  }

  public toggleViewMode(): void {
    this.viewMode = this.isGraphView ? 'stages' : 'graph';
  }

  public zoomIn(): void {
    this.zoomLevel = Math.min(2.0, Math.round((this.zoomLevel + 0.15) * 100) / 100);
  }

  public zoomOut(): void {
    this.zoomLevel = Math.max(0.5, Math.round((this.zoomLevel - 0.15) * 100) / 100);
  }

  public resetZoom(): void {
    this.zoomLevel = 1;
  }

  public inputVal(e: Event): string {
    return (e.target as HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement).value;
  }

  public isEdgeActive(edge: DagEdge): boolean {
    return this.selectedId === edge.from || this.selectedId === edge.to;
  }

  public setFilter(f: string): void {
    this.activeFilter = f;
  }

  public onSearchInput(ev: Event): void {
    this.searchQuery = ((ev.target as HTMLInputElement)?.value ?? '').toLowerCase();
  }

  public get filteredPipelines(): MJMLTrainingPipelineEntity[] {
    return (this.pipelines ?? []).filter((p) => {
      if (this.searchQuery) {
        const nameMatch = p.Name?.toLowerCase().includes(this.searchQuery);
        const entityMatch = p.TargetEntity?.toLowerCase().includes(this.searchQuery);
        const targetMatch = p.TargetVariable?.toLowerCase().includes(this.searchQuery);
        if (!nameMatch && !entityMatch && !targetMatch) return false;
      }
      if (this.activeFilter === 'published') return p.Status === 'Published';
      if (this.activeFilter === 'draft') return p.Status === 'Draft';
      if (this.activeFilter === 'core') return p.TargetEntity?.includes('AI') || p.Name?.includes('AI Agent');
      return true;
    });
  }

  public pipelineDomain(p?: MJMLTrainingPipelineEntity): string {
    if (!p) return 'Platform';
    const n = (p.Name || '') + (p.TargetEntity || '');
    if (n.includes('MoreCheese') || n.includes('Membership') || n.includes('Event') || n.includes('Course')) return 'More Cheese Club';
    if (n.includes('AI') || n.includes('Prompt') || n.includes('Agent')) return 'MemberJunction Platform';
    return 'BizApps';
  }

  public targetEntityName(p?: MJMLTrainingPipelineEntity): string {
    if (!p) return 'Entity';
    return p.TargetEntity || this.editSources[0]?.Ref || 'Entity';
  }

  public get pipelineModels(): MJMLModelEntity[] {
    if (!this.selectedPipelineId || !this.engine?.Models) return [];
    return this.engine.Models.filter((m) => UUIDsEqual(m.PipelineID, this.selectedPipelineId));
  }

  public get publishedModel(): MJMLModelEntity | undefined {
    return this.pipelineModels.find((m) => m.Status === 'Published') ?? this.pipelineModels[0];
  }

  public bestMetricForPipeline(p?: MJMLTrainingPipelineEntity): string | null {
    if (!p || !this.engine?.Models) return null;
    const models = this.engine.Models.filter((m) => UUIDsEqual(m.PipelineID, p.ID));
    if (models.length === 0) return null;
    const best = models.find((m) => m.Status === 'Published') ?? models[0];
    return this.formatHoldout(best);
  }

  public formatHoldout(m: MJMLModelEntity): string {
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

  public get asOfLabel(): string {
    if (this.editAsOf.Mode === 'column') return `Column: ${this.editAsOf.Column || 'DecisionDate'}`;
    if (this.editAsOf.Mode === 'offset') return `Offset: ${this.editAsOf.OffsetDays || 0}d prior`;
    return 'None (Static snapshot)';
  }

  public get selectedAlgorithmName(): string {
    return this.engine?.AlgorithmName(this.editAlgorithmId) || 'Auto-select (Tournament)';
  }

  public selectPipeline(id: string): void {
    this.selectedPipelineId = id;
    const p = this.pipelines.find((x) => UUIDsEqual(x.ID, id));
    if (!p) {
      return;
    }

    // Defensive parsing against non-array JSON schemas
    const rawSources = this.parse<unknown>(p.SourceBindings, []);
    this.editSources = Array.isArray(rawSources)
      ? (rawSources as SourceBinding[])
      : rawSources && typeof rawSources === 'object'
      ? [{ Kind: 'Entity', Ref: (rawSources as { EntityID?: string }).EntityID || '' }]
      : [];

    const rawSteps = this.parse<unknown>(p.FeatureSteps, { Steps: [] });
    if (Array.isArray(rawSteps)) {
      this.editSteps = rawSteps as FeatureStep[];
    } else if (rawSteps && typeof rawSteps === 'object' && 'Steps' in rawSteps && Array.isArray((rawSteps as { Steps: unknown[] }).Steps)) {
      this.editSteps = (rawSteps as { Steps: FeatureStep[] }).Steps;
    } else {
      this.editSteps = [];
    }

    this.editTargetVariable = p.TargetVariable ?? '';
    this.editProblemType = (p.ProblemType as ProblemType) ?? 'classification';
    this.editAlgorithmId = p.AlgorithmID ?? '';
    this.editHyperparams = p.Hyperparameters ?? '{}';
    this.editLeakage = this.parse<LeakageGuard>(p.LeakageGuard, { DenyFields: [], SingleFeatureDominanceThreshold: DOMINANCE_THRESHOLD_DEFAULT });
    this.editAsOf = this.parse<AsOfStrategy>(p.AsOfStrategy, { Mode: 'none' });
    this.editValidation = this.parse<ValidationStrategy>(p.ValidationStrategy, { Strategy: 'train_test_split', TestSize: 0.2, LockedHoldoutFraction: 0.15 });
    this.stepSeq = this.editSteps.length;
    this.dirty = false;
    this.rebuild();
    this.selectedId = this.nodes[0]?.id ?? '';
  }

  public get selectedPipeline(): MJMLTrainingPipelineEntity | undefined {
    return this.pipelines.find((p) => UUIDsEqual(p.ID, this.selectedPipelineId));
  }

  public isSelectedPipeline(p: MJMLTrainingPipelineEntity): boolean {
    return UUIDsEqual(p.ID, this.selectedPipelineId);
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
    this.dirty = true;
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
    nodes.push({
      id: '__output',
      type: 'output',
      title: 'Model Artifact',
      icon: 'fa-solid fa-cube',
      tag: this.selectedPipeline?.Status ?? 'Draft',
      x: 0,
      y: 0,
      hasIn: true,
      hasOut: false,
      rows: [
        { k: 'status', v: this.selectedPipeline?.Status ?? 'Draft' },
        { k: 'serving', v: this.selectedPipeline?.Status === 'Published' ? 'Active' : 'Not Serving' }
      ]
    });

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
    // Connect source to target so target sits cleanly in the feature/target layer
    if (sourceIds.length > 0) {
      edges.push({ from: sourceIds[0], to: '__target' });
    }
    edges.push({ from: '__target', to: '__algo' });
    edges.push({ from: '__algo', to: '__output' });

    this.nodes = nodes;
    this.edges = edges;
    this.markPorts();
    this.layoutGraph();
  }

  private sourceNode(sb: SourceBinding, i: number): DagNode {
    const rows: { k: string; v: string }[] = [{ k: 'kind', v: sb.Kind }];
    if (sb.Alias) {
      rows.push({ k: 'entity', v: sb.Ref || '—' });
    }
    return {
      id: `src:${i}`,
      type: 'src',
      title: sb.Alias || sb.Ref || 'source',
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
    return {
      id: '__target',
      type: 'target',
      title: `Target: ${this.editTargetVariable || '—'}`,
      icon: 'fa-solid fa-bullseye',
      tag: this.editProblemType,
      rows: [
        { k: 'variable', v: this.editTargetVariable || '—' },
        { k: 'type', v: this.editProblemType }
      ],
      x: 0,
      y: 0,
      hasIn: true,
      hasOut: true
    };
  }

  private algoNode(): DagNode {
    const name = this.engine?.AlgorithmName(this.editAlgorithmId) || 'Algorithm';
    const rows = [{ k: 'algorithm', v: name }];
    const hp = this.parse<Record<string, unknown>>(this.editHyperparams, {});
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
    const hasIn = new Set(this.edges.map((e) => e.to));
    const hasOut = new Set(this.edges.map((e) => e.from));
    for (const n of this.nodes) {
      n.hasIn = hasIn.has(n.id);
      n.hasOut = hasOut.has(n.id);
    }
  }

  // ---- selection ----

  public selectNode(id: string): void {
    this.selectedId = id;
  }

  public get selectedNode(): DagNode {
    return this.nodeById.get(this.selectedId) ?? this.nodes[0] ?? { id: '', type: 'feat', title: '—', icon: 'fa-solid fa-sliders', rows: [], x: 0, y: 0, hasIn: false, hasOut: false };
  }

  public get selectedSourceIndex(): number {
    return this.selectedId.startsWith('src:') ? Number(this.selectedId.slice(4)) : -1;
  }
  public get selectedSource(): SourceBinding | null {
    const i = this.selectedSourceIndex;
    return i >= 0 ? this.editSources[i] ?? null : null;
  }
  public get selectedStep(): FeatureStep | null {
    return this.editSteps.find((s) => s.Id === this.selectedId) ?? null;
  }
  public get otherSteps(): FeatureStep[] {
    return this.editSteps.filter((s) => s.Id !== this.selectedId);
  }
  public get algorithms() {
    return this.engine?.Algorithms ?? [];
  }

  // ---- source editing ----

  public setSourceKind(kind: string): void { const s = this.selectedSource; if (s) { s.Kind = kind as SourceBinding['Kind']; this.markDirty(); } }
  public setSourceRef(ref: string): void { const s = this.selectedSource; if (s) { s.Ref = ref; this.markDirty(); } }
  public setSourceAlias(alias: string): void { const s = this.selectedSource; if (s) { s.Alias = alias || undefined; this.markDirty(); } }

  // ---- step editing ----

  public get columnsText(): string {
    const s = this.selectedStep;
    if (s && (s.Kind === 'select' || s.Kind === 'standardize')) {
      return s.Columns.join(', ');
    }
    return '';
  }
  public setColumns(text: string): void {
    const s = this.selectedStep;
    if (s && (s.Kind === 'select' || s.Kind === 'standardize')) {
      s.Columns = text.split(',').map((c) => c.trim()).filter(Boolean);
      this.markDirty();
    }
  }
  public stepField(field: string): string {
    const s = this.selectedStep as unknown as Record<string, unknown> | null;
    const v = s?.[field];
    return v == null ? '' : String(v);
  }
  public setStepStr(field: string, value: string): void {
    const s = this.selectedStep as unknown as Record<string, unknown> | null;
    if (s) { s[field] = value; this.markDirty(); }
  }
  public setStepNum(field: string, value: string): void {
    const s = this.selectedStep as unknown as Record<string, unknown> | null;
    const n = Number(value);
    if (s && !Number.isNaN(n)) { s[field] = n; this.markDirty(); }
  }
  public setStepLabel(label: string): void { const s = this.selectedStep; if (s) { s.Label = label || undefined; this.markDirty(); } }

  public setStepKind(kind: string): void {
    const idx = this.editSteps.findIndex((s) => s.Id === this.selectedId);
    if (idx < 0) {
      return;
    }
    const prev = this.editSteps[idx];
    this.editSteps[idx] = this.defaultStep(kind as FeatureStepKind, prev.Id, prev.Label, prev.Inputs);
    this.markDirty();
  }

  public hasInput(stepId: string): boolean {
    return (this.selectedStep?.Inputs ?? []).includes(stepId);
  }
  public toggleInput(stepId: string): void {
    const s = this.selectedStep;
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

  public setTargetVariable(v: string): void { this.editTargetVariable = v; this.markDirty(); }
  public setProblemType(v: string): void { this.editProblemType = v as ProblemType; this.markDirty(); }
  public setAlgorithm(id: string): void { this.editAlgorithmId = id; this.markDirty(); }
  public setHyperparams(v: string): void { this.editHyperparams = v; this.markDirty(); }

  // ---- leakage / as-of / validation editing ----

  public get denyText(): string { return this.editLeakage.DenyFields.join(', '); }
  public setDeny(text: string): void { this.editLeakage.DenyFields = parseDenyList(text); this.dirty = true; }
  public setThreshold(v: string): void { const n = Number(v); if (!Number.isNaN(n)) { this.editLeakage.SingleFeatureDominanceThreshold = n; this.dirty = true; } }
  public setAsOfMode(v: string): void { this.editAsOf = { ...this.editAsOf, Mode: v as AsOfStrategy['Mode'] }; this.dirty = true; }
  public setAsOfColumn(v: string): void { this.editAsOf.Column = v; this.dirty = true; }
  public setAsOfOffset(v: string): void { const n = Number(v); if (!Number.isNaN(n)) { this.editAsOf.OffsetDays = n; this.dirty = true; } }
  public setValStrategy(v: string): void { this.editValidation = { ...this.editValidation, Strategy: v as ValidationStrategy['Strategy'] }; this.dirty = true; }
  public setTestSize(v: string): void { const n = Number(v); if (!Number.isNaN(n)) { this.editValidation.TestSize = n; this.dirty = true; } }
  public setK(v: string): void { const n = Number(v); if (!Number.isNaN(n)) { this.editValidation.K = n; this.dirty = true; } }
  public setHoldout(v: string): void { const n = Number(v); if (!Number.isNaN(n)) { this.editValidation.LockedHoldoutFraction = n; this.dirty = true; } }

  // ---- add / delete nodes ----

  public addSource(): void {
    this.editSources = [...this.editSources, { Kind: 'Entity', Ref: '' }];
    this.markDirty();
    this.selectedId = `src:${this.editSources.length - 1}`;
  }
  public addStep(): void {
    const id = `step_${++this.stepSeq}`;
    this.editSteps = [...this.editSteps, this.defaultStep('select', id)];
    this.markDirty();
    this.selectedId = id;
  }
  public deleteSelected(): void {
    const si = this.selectedSourceIndex;
    if (si >= 0) {
      this.editSources = this.editSources.filter((_s, i) => i !== si);
      this.markDirty();
      this.selectedId = this.nodes[0]?.id ?? '';
      return;
    }
    const step = this.selectedStep;
    if (step) {
      this.editSteps = this.editSteps.filter((s) => s.Id !== step.Id);
      for (const s of this.editSteps) {
        if (s.Inputs?.includes(step.Id)) {
          s.Inputs = s.Inputs.filter((i) => i !== step.Id);
        }
      }
      this.markDirty();
      this.selectedId = this.nodes[0]?.id ?? '';
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
      case 'llm-derived': return { ...base, Kind: 'llm-derived', FeaturePipelineRef: '' };
      case 'flow-agent': return { ...base, Kind: 'flow-agent', FlowAgentRef: '', InputMapping: {}, OutputMapping: {} };
      case 'vision-llm': return { ...base, Kind: 'vision-llm', ImageColumn: '', Prompt: { InlinePrompt: '' }, Output: { FeatureName: '', Kind: 'category' } };
    }
  }

  // ---- save / validate / train ----

  public async save(): Promise<void> {
    const p = this.selectedPipeline;
    if (!p || this.busy) {
      return;
    }
    this.busy = true;
    try {
      p.SourceBindings = JSON.stringify(this.editSources);
      p.FeatureSteps = JSON.stringify({ Steps: this.editSteps });
      p.TargetVariable = this.editTargetVariable;
      p.ProblemType = this.editProblemType;
      p.AlgorithmID = this.editAlgorithmId;
      p.Hyperparameters = this.editHyperparams || null;
      p.LeakageGuard = JSON.stringify(this.editLeakage);
      p.AsOfStrategy = JSON.stringify(this.editAsOf);
      p.ValidationStrategy = JSON.stringify(this.editValidation);
      const ok = await p.Save();
      if (ok) {
        this.dirty = false;
        this.notifications.CreateSimpleNotification(`Saved "${p.Name}".`, 'success', 3000);
      } else {
        this.notifications.CreateSimpleNotification(`Save failed: ${p.LatestResult?.CompleteMessage ?? 'unknown error'}`, 'error', 5000);
      }
    } finally {
      this.busy = false;
      this.cdr.detectChanges();
    }
  }

  public validate(): void {
    const issues: string[] = [];
    if (this.editSources.length === 0) {
      issues.push('at least one source');
    }
    if (!this.editTargetVariable) {
      issues.push('a target variable');
    }
    if (!this.editAlgorithmId) {
      issues.push('an algorithm');
    }
    try {
      JSON.parse(this.editHyperparams || '{}');
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
    const p = this.selectedPipeline;
    if (!p || this.busy || this.dirty) {
      return;
    }
    this.busy = true;
    this.notifications.CreateSimpleNotification(`Training "${p.Name}"…`, 'info', 2500);
    try {
      const op = new PredictiveStudioTrainModelOperation();
      const result = await op.Execute({ pipelineId: p.ID }, { provider: this.provider ?? undefined, user: this.currentUser ?? undefined });
      if (result.Success && result.Output) {
        const flagged = result.Output.leakageFlagged ? ' (leakage flag raised — needs sign-off)' : '';
        this.notifications.CreateSimpleNotification(`Trained ${p.Name} v${result.Output.version}${flagged}. See Registry.`, 'success', 5000);
        await this.engine.Config(true, this.currentUser ?? undefined, this.provider ?? undefined);
      } else {
        this.notifications.CreateSimpleNotification(result.ErrorMessage || 'Training failed.', 'error', 6000);
      }
    } catch (e) {
      this.notifications.CreateSimpleNotification(`Training error: ${e instanceof Error ? e.message : String(e)}`, 'error', 6000);
    } finally {
      this.busy = false;
      this.cdr.detectChanges();
    }
  }

  public refine(): void {
    const p = this.selectedPipeline;
    if (!p) {
      this.askAgent.emit(this.starterPrompt);
      return;
    }
    const predicts = p.TargetVariable ? ` (predicts ${p.TargetVariable})` : '';
    this.askAgent.emit(`Help me refine the "${p.Name}" training pipeline${predicts}. Suggest improvements to the features or algorithm to raise holdout performance.`);
  }

  public statusClass(status: string): string {
    switch (status) {
      case 'Published': return 'published';
      case 'Validated': return 'validated';
      default: return 'draft';
    }
  }

  public nodeTypeLabel(type: NodeType): string {
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
    for (const n of this.nodes) {
      this.nodeById.set(n.id, n);
    }
    const inEdges = new Map<string, string[]>();
    for (const n of this.nodes) {
      inEdges.set(n.id, []);
    }
    for (const e of this.edges) {
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
    for (const n of this.nodes) {
      computeLayer(n.id, new Set());
    }

    const algoNode = this.nodes.find((n) => n.id === '__algo');
    const outNode = this.nodes.find((n) => n.id === '__output');
    let maxFeatureLayer = 0;
    for (const n of this.nodes) {
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
    for (const n of this.nodes) {
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

    this.canvasW = Math.max(920, PAD_X * 2 + (maxCol + 1) * NODE_W + maxCol * COL_GAP);
    this.canvasH = Math.max(540, maxCanvasHeight);
  }

  public edgePath(edge: DagEdge): string {
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
