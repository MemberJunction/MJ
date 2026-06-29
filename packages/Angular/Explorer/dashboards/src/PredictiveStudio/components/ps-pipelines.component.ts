import { Component, EventEmitter, Input, OnInit, Output, ViewEncapsulation } from '@angular/core';
import { CommonModule } from '@angular/common';
import { MJButtonDirective } from '@memberjunction/ng-ui-components';
import { UUIDsEqual } from '@memberjunction/global';
import { MJMLTrainingPipelineEntity } from '@memberjunction/core-entities';
import type {
  SourceBinding,
  FeatureStepGraph,
  FeatureStep,
  AsOfStrategy,
  LeakageGuard,
  ValidationStrategy,
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
  /** Computed by the layered layout — never authored by hand. */
  x: number;
  y: number;
  hasIn: boolean;
  hasOut: boolean;
}

interface DagEdge {
  from: string;
  to: string;
}

// Layout geometry — shared by the layered layout (positions) and the edge-path math (ports).
const NODE_W = 190;
const NODE_H = 86;
const COL_GAP = 86;
const ROW_GAP = 30;
const PAD_X = 28;
const PAD_Y = 28;

const SOURCE_ICONS: Record<SourceBinding['Kind'], string> = {
  Entity: 'fa-solid fa-table',
  Query: 'fa-solid fa-magnifying-glass-chart',
  ExternalEntity: 'fa-solid fa-arrows-turn-to-dots',
  VectorSet: 'fa-solid fa-vector-square',
  FeaturePipeline: 'fa-solid fa-diagram-project',
};

const STEP_ICONS: Record<FeatureStep['Kind'], string> = {
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

/** Entity-agnostic starter prompt that seeds the Model Development Agent to build a pipeline. */
const PS_PIPELINES_STARTER_PROMPT =
  'Help me build a training pipeline. I will tell you what I want to predict and on which entity; ' +
  'you assemble the features (guarding against leakage), pick an algorithm, and train a versioned model.';

/**
 * Training Pipelines panel — a LIVE visual DAG of each `MJ: ML Training Pipelines` row. The pipeline
 * persists its whole graph as JSON (`SourceBindings` + `FeatureSteps` + `AlgorithmID` + `TargetVariable`
 * + `AsOfStrategy`/`LeakageGuard`/`ValidationStrategy`), so this renders the REAL structure — no mock
 * data. Phase 1 is read-only (pick a pipeline → see its actual sources/steps/algorithm/target; click a
 * node → inspector shows its real config). Editing + persistence + train wiring land in later phases
 * (see plans/predictive-studio-pipeline-builder.md). Fully entity-agnostic — every node derives from
 * the pipeline's own refs.
 */
@Component({
  standalone: true,
  selector: 'ps-pipelines',
  imports: [CommonModule, MJButtonDirective],
  encapsulation: ViewEncapsulation.None,
  styleUrls: ['../predictive-studio.shared.scss', './ps-pipelines.component.scss'],
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
        <!-- Pipeline picker -->
        <div class="pl-bar" data-testid="ps-pipelines-picker">
          @for (p of pipelines; track p.ID) {
            <button class="pl-pill" [class.on]="p.ID === selectedPipelineId"
              data-testid="ps-pipelines-pill" (click)="selectPipeline(p.ID)">
              <i class="fa-solid fa-diagram-project"></i> {{ p.Name }}
              <span class="ps-badge" [class]="statusClass(p.Status)">{{ p.Status }}</span>
            </button>
          }
          <span class="ps-spacer"></span>
          <button mjButton variant="primary" size="sm" data-testid="ps-pipelines-build"
            (click)="askAgent.emit(starterPrompt)">
            <i class="fa-solid fa-robot"></i> Build with agent
          </button>
        </div>

        <div class="builder">
          <!-- Canvas -->
          <div class="canvas-wrap">
            <div class="canvas-bar">
              <span class="ps-small ps-muted" style="font-weight:600">
                <i class="fa-solid fa-circle-nodes"></i> {{ nodes.length }} nodes · {{ edges.length }} edges
              </span>
              <span class="ps-spacer"></span>
              <span class="ps-small ps-muted">Read-only view — edit via the agent (visual editing coming soon)</span>
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
              <span class="ps-spacer"></span>
              <button mjButton variant="secondary" size="sm" data-testid="ps-pipelines-refine"
                (click)="refine()">
                <i class="fa-solid fa-wand-magic-sparkles"></i> Refine with agent
              </button>
            </div>
          </div>

          <!-- Inspector -->
          <div class="ps-col inspector" data-testid="ps-pipelines-inspector">
            <div class="ps-card insp">
              <div class="ihead">
                <i class="tile" [ngClass]="selectedNode.icon" [attr.data-type]="selectedNode.type"></i>
                <div>
                  <h3 data-testid="ps-pipelines-inspector-title">{{ selectedNode.title }}</h3>
                  <div class="ps-small ps-muted">{{ nodeTypeLabel(selectedNode.type) }} · selected</div>
                </div>
              </div>
              <div class="ps-card-body">
                @if (selectedNode.rows.length > 0) {
                  @for (row of selectedNode.rows; track row.k) {
                    <div class="ps-row" style="justify-content:space-between;padding:4px 0">
                      <span class="ps-small ps-muted">{{ row.k }}</span><span class="ps-small">{{ row.v }}</span>
                    </div>
                  }
                } @else {
                  <div class="ps-small ps-muted">No configuration on this node.</div>
                }
              </div>
            </div>

            <!-- Leakage guard (live from the pipeline's LeakageGuard) -->
            <div class="ps-card">
              <div class="ps-card-head"><i class="fa-solid fa-shield-halved" style="color:var(--mj-status-warning)"></i><h3>Leakage guard</h3></div>
              <div class="ps-card-body">
                <div class="ps-row" style="justify-content:space-between">
                  <span class="ps-small ps-muted">Deny-list columns</span><span class="ps-badge gray">{{ leakage.DenyFields.length }}</span>
                </div>
                @if (leakage.DenyFields.length > 0) {
                  <div class="meta-row" style="display:flex;gap:6px;flex-wrap:wrap;margin-top:8px">
                    @for (f of leakage.DenyFields; track f) { <span class="ps-tag">{{ f }}</span> }
                  </div>
                }
                <div class="ps-divider"></div>
                <label class="ps-small ps-muted" style="font-weight:700">Single-feature dominance</label>
                <div class="ps-small ps-muted" style="margin-top:6px">
                  Block promotion if any feature exceeds <span class="ps-mono">{{ leakage.SingleFeatureDominanceThreshold.toFixed(2) }}</span> importance share.
                </div>
              </div>
            </div>

            <!-- As-of strategy (live) -->
            <div class="ps-card">
              <div class="ps-card-head"><i class="fa-solid fa-clock-rotate-left" style="color:var(--mj-brand-primary)"></i><h3>As-of strategy</h3></div>
              <div class="ps-card-body">
                <div class="ps-row" style="justify-content:space-between;padding:4px 0"><span class="ps-muted ps-small">Mode</span><span class="ps-tag">{{ asOf.Mode }}</span></div>
                @if (asOf.Mode === 'column' && asOf.Column) {
                  <div class="ps-row" style="justify-content:space-between;padding:4px 0"><span class="ps-muted ps-small">Decision-date column</span><span class="ps-small ps-mono">{{ asOf.Column }}</span></div>
                }
                @if (asOf.Mode === 'offset' && asOf.OffsetDays != null) {
                  <div class="ps-row" style="justify-content:space-between;padding:4px 0"><span class="ps-muted ps-small">Offset before label</span><strong>{{ asOf.OffsetDays }} days</strong></div>
                }
                <div class="ps-small ps-muted" style="margin-top:6px">Features are assembled as-of the decision point to avoid peeking at the future.</div>
              </div>
            </div>

            <!-- Validation (live) -->
            <div class="ps-card">
              <div class="ps-card-head"><i class="fa-solid fa-scissors" style="color:var(--mj-brand-primary)"></i><h3>Validation</h3></div>
              <div class="ps-card-body">
                <div class="ps-row" style="justify-content:space-between;padding:4px 0"><span class="ps-muted ps-small">Strategy</span><span class="ps-tag">{{ validation.Strategy }}</span></div>
                @if (validation.TestSize != null) {
                  <div class="ps-row" style="justify-content:space-between;padding:4px 0"><span class="ps-muted ps-small">Test size</span><strong>{{ validation.TestSize }}</strong></div>
                }
                @if (validation.K != null) {
                  <div class="ps-row" style="justify-content:space-between;padding:4px 0"><span class="ps-muted ps-small">Folds (k)</span><strong>{{ validation.K }}</strong></div>
                }
                <div class="ps-row" style="justify-content:space-between;padding:4px 0"><span class="ps-muted ps-small">Locked holdout</span><strong>{{ validation.LockedHoldoutFraction }}</strong></div>
                <div class="ps-small ps-muted" style="margin-top:6px">The locked holdout is scored once on the promoted model — the honest number.</div>
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

  /** Emitted with a starter prompt to open + seed the Model Development Agent chat. */
  @Output() askAgent = new EventEmitter<string>();

  public readonly starterPrompt = PS_PIPELINES_STARTER_PROMPT;
  public pipelines: MJMLTrainingPipelineEntity[] = [];
  public selectedPipelineId = '';

  public nodes: DagNode[] = [];
  public edges: DagEdge[] = [];
  public selectedId = '';
  public canvasW = 800;
  public canvasH = 460;

  /** Parsed pipeline-level specs for the inspector (read fresh per selected pipeline). */
  public leakage: LeakageGuard = { DenyFields: [], SingleFeatureDominanceThreshold: 0.6 };
  public asOf: AsOfStrategy = { Mode: 'none' };
  public validation: ValidationStrategy = { Strategy: 'train_test_split', LockedHoldoutFraction: 0.15 };

  private nodeById = new Map<string, DagNode>();

  ngOnInit(): void {
    this.pipelines = this.engine?.Pipelines ?? [];
    if (this.pipelines.length > 0) {
      this.selectPipeline(this.pipelines[0].ID);
    }
  }

  // ---- pipeline selection + graph build ----

  public selectPipeline(id: string): void {
    this.selectedPipelineId = id;
    const pipeline = this.pipelines.find((p) => UUIDsEqual(p.ID, id));
    if (pipeline) {
      this.buildGraph(pipeline);
    }
  }

  private get selectedPipeline(): MJMLTrainingPipelineEntity | undefined {
    return this.pipelines.find((p) => UUIDsEqual(p.ID, this.selectedPipelineId));
  }

  /** Build the node/edge graph + parse the inspector specs from the pipeline's persisted JSON. */
  private buildGraph(pipeline: MJMLTrainingPipelineEntity): void {
    const sources = this.parse<SourceBinding[]>(pipeline.SourceBindings, []);
    const graph = this.parse<FeatureStepGraph>(pipeline.FeatureSteps, { Steps: [] });
    const steps = graph.Steps ?? [];

    this.leakage = this.parse<LeakageGuard>(pipeline.LeakageGuard, { DenyFields: [], SingleFeatureDominanceThreshold: 0.6 });
    this.asOf = this.parse<AsOfStrategy>(pipeline.AsOfStrategy, { Mode: 'none' });
    this.validation = this.parse<ValidationStrategy>(pipeline.ValidationStrategy, { Strategy: 'train_test_split', LockedHoldoutFraction: 0.15 });

    const nodes: DagNode[] = [];
    const edges: DagEdge[] = [];

    // Source nodes
    sources.forEach((sb, i) => nodes.push(this.sourceNode(sb, i)));
    // Step nodes
    steps.forEach((step) => nodes.push(this.stepNode(step)));
    // Target + algorithm + output nodes
    nodes.push(this.targetNode(pipeline));
    nodes.push(this.algoNode(pipeline));
    nodes.push({ id: '__output', type: 'output', title: 'Model', icon: 'fa-solid fa-cube', x: 0, y: 0, hasIn: false, hasOut: false, rows: [{ k: 'status', v: pipeline.Status ?? 'Draft' }] });

    // Edges from each step's Inputs (step → step)
    const stepIds = new Set(steps.map((s) => s.Id));
    const referenced = new Set<string>();
    for (const step of steps) {
      for (const input of step.Inputs ?? []) {
        if (stepIds.has(input)) {
          edges.push({ from: input, to: step.Id });
          referenced.add(input);
        }
      }
    }
    // Sources → root steps (steps with no upstream step inputs). Degenerate: sources → algorithm.
    const roots = steps.filter((s) => (s.Inputs ?? []).filter((i) => stepIds.has(i)).length === 0);
    const sourceIds = sources.map((_s, i) => `src:${i}`);
    if (steps.length > 0) {
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
    // Terminal steps (not referenced by any other step) → algorithm
    const terminals = steps.filter((s) => !referenced.has(s.Id));
    for (const t of terminals) {
      edges.push({ from: t.Id, to: '__algo' });
    }
    // Target → algorithm, algorithm → output
    edges.push({ from: '__target', to: '__algo' });
    edges.push({ from: '__algo', to: '__output' });

    this.nodes = nodes;
    this.edges = edges;
    this.markPorts();
    this.layoutDag();
    this.selectedId = this.nodes[0]?.id ?? '';
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

  // ---- node view-models ----

  private sourceNode(sb: SourceBinding, i: number): DagNode {
    const rows = [{ k: 'kind', v: sb.Kind }, { k: 'ref', v: sb.Ref }];
    if (sb.Alias) {
      rows.push({ k: 'alias', v: sb.Alias });
    }
    return { id: `src:${i}`, type: 'src', title: sb.Alias || sb.Ref, icon: SOURCE_ICONS[sb.Kind] ?? 'fa-solid fa-database', tag: sb.Kind, rows, x: 0, y: 0, hasIn: false, hasOut: true };
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
      hasOut: true,
    };
  }

  /** Real per-Kind config summary rows for a feature step (discriminated union → no `any`). */
  private stepRows(step: FeatureStep): { k: string; v: string }[] {
    switch (step.Kind) {
      case 'select':
        return [{ k: 'columns', v: `${step.Columns.length} cols` }];
      case 'impute':
        return [{ k: 'column', v: step.Column }, { k: 'strategy', v: step.Strategy }];
      case 'standardize':
        return [{ k: 'columns', v: `${step.Columns.length} cols` }, { k: 'scaler', v: 'z-score' }];
      case 'onehot':
        return [{ k: 'column', v: step.Column }];
      case 'bin':
        return [{ k: 'column', v: step.Column }, { k: 'bins', v: String(step.Bins) }];
      case 'embedding':
        return [{ k: 'entity', v: step.Entity }, { k: 'dims', v: String(step.Dims) }];
      case 'llm-derived':
        return [{ k: 'pipeline', v: step.FeaturePipelineRef }];
      case 'flow-agent':
        return [{ k: 'agent', v: step.FlowAgentRef }];
      case 'vision-llm':
        return [{ k: 'image', v: step.ImageColumn }, { k: 'output', v: step.Output.FeatureName }];
      default:
        return [];
    }
  }

  private targetNode(pipeline: MJMLTrainingPipelineEntity): DagNode {
    return {
      id: '__target',
      type: 'target',
      title: `Target: ${pipeline.TargetVariable ?? '—'}`,
      icon: 'fa-solid fa-bullseye',
      rows: [{ k: 'variable', v: pipeline.TargetVariable ?? '—' }, { k: 'type', v: pipeline.ProblemType ?? '—' }],
      x: 0,
      y: 0,
      hasIn: false,
      hasOut: true,
    };
  }

  private algoNode(pipeline: MJMLTrainingPipelineEntity): DagNode {
    const rows = [{ k: 'algorithm', v: this.engine.AlgorithmName(pipeline.AlgorithmID) }];
    const hp = this.parse<Record<string, unknown>>(pipeline.Hyperparameters, {});
    Object.entries(hp).slice(0, 2).forEach(([k, v]) => rows.push({ k, v: String(v) }));
    return { id: '__algo', type: 'algo', title: this.engine.AlgorithmName(pipeline.AlgorithmID), icon: 'fa-solid fa-shapes', rows, x: 0, y: 0, hasIn: true, hasOut: true };
  }

  /** Set each node's port visibility from the built edge set. */
  private markPorts(): void {
    const hasIn = new Set(this.edges.map((e) => e.to));
    const hasOut = new Set(this.edges.map((e) => e.from));
    for (const n of this.nodes) {
      n.hasIn = hasIn.has(n.id);
      n.hasOut = hasOut.has(n.id);
    }
  }

  // ---- selection + inspector ----

  public selectNode(id: string): void {
    this.selectedId = id;
  }

  public get selectedNode(): DagNode {
    return this.nodeById.get(this.selectedId) ?? this.nodes[0] ?? { id: '', type: 'feat', title: '—', icon: 'fa-solid fa-sliders', rows: [], x: 0, y: 0, hasIn: false, hasOut: false };
  }

  public statusClass(status: string | null): string {
    switch (status) {
      case 'Active':
        return 'green';
      case 'Draft':
        return 'amber';
      case 'Disabled':
        return 'gray';
      default:
        return 'gray';
    }
  }

  public nodeTypeLabel(type: NodeType): string {
    switch (type) {
      case 'src':
        return 'Source';
      case 'feat':
        return 'Feature step';
      case 'emb':
        return 'Embedding';
      case 'target':
        return 'Target';
      case 'algo':
        return 'Algorithm';
      case 'output':
        return 'Model output';
    }
  }

  /** Seed the agent to refine the selected pipeline. */
  public refine(): void {
    const p = this.selectedPipeline;
    if (!p) {
      this.askAgent.emit(this.starterPrompt);
      return;
    }
    const predicts = p.TargetVariable ? ` (predicts ${p.TargetVariable})` : '';
    this.askAgent.emit(
      `Help me refine the "${p.Name}" training pipeline${predicts}. ` +
        `Suggest improvements to the features or algorithm to raise holdout performance.`,
    );
  }

  // ---- layered layout (deterministic, topology-driven) ----

  private layoutDag(): void {
    this.nodeById = new Map(this.nodes.map((n) => [n.id, n]));
    const incoming = new Map<string, string[]>();
    const outgoing = new Map<string, string[]>();
    for (const n of this.nodes) {
      incoming.set(n.id, []);
      outgoing.set(n.id, []);
    }
    for (const e of this.edges) {
      if (this.nodeById.has(e.from) && this.nodeById.has(e.to)) {
        outgoing.get(e.from)!.push(e.to);
        incoming.get(e.to)!.push(e.from);
      }
    }
    const depth = this.computeLayers(incoming, outgoing);
    const maxDepth = Math.max(0, ...depth.values());
    const columns: DagNode[][] = Array.from({ length: maxDepth + 1 }, () => []);
    for (const n of this.nodes) {
      columns[depth.get(n.id) ?? 0].push(n);
    }
    this.positionColumns(columns);
  }

  private computeLayers(incoming: Map<string, string[]>, outgoing: Map<string, string[]>): Map<string, number> {
    const depth = new Map<string, number>(this.nodes.map((n) => [n.id, 0]));
    const indeg = new Map<string, number>(this.nodes.map((n) => [n.id, incoming.get(n.id)!.length]));
    const queue = this.nodes.filter((n) => indeg.get(n.id) === 0).map((n) => n.id);
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
    this.canvasW = PAD_X * 2 + columns.length * NODE_W + (columns.length - 1) * COL_GAP;
    this.canvasH = PAD_Y * 2 + contentH;
  }

  public edgePath(edge: DagEdge): string {
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
}
