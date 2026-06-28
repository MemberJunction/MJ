import { Component, Input, ViewEncapsulation } from '@angular/core';
import { CommonModule } from '@angular/common';
import { MJButtonDirective } from '@memberjunction/ng-ui-components';
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

/**
 * Node geometry. Shared by BOTH the layered layout (which positions nodes) and
 * the edge-path math (which terminates beziers on ports), so ports always line
 * up with the real node boxes. NODE_H must match the rendered node height —
 * nodes have variable content height, but the port + edge anchor is the visual
 * vertical centre, so we use a representative constant and centre on it.
 */
const NODE_W = 190;
const NODE_H = 86;

/** Layout spacing constants — deterministic columns × rows. */
const COL_GAP = 86;   // horizontal gap between layer columns
const ROW_GAP = 30;   // vertical gap between nodes within a column
const PAD_X = 28;     // canvas left/right padding
const PAD_Y = 28;     // canvas top padding

/**
 * Pipeline Builder panel (mockup pipelines-1): a visual DAG of feature-assembly steps. Nodes are
 * absolutely positioned with input/output ports; SVG bezier edges connect them. A left palette
 * lists draggable step types; a right inspector reflects the selected node + the leakage guard and
 * validation config. Built as a clean SVG/CSS DAG (no external flow-editor dependency).
 */
@Component({
  standalone: true,
  selector: 'ps-pipelines',
  imports: [CommonModule, MJButtonDirective],
  encapsulation: ViewEncapsulation.None,
  styleUrls: ['../predictive-studio.shared.scss', './ps-pipelines.component.scss'],
  template: `
    <div class="ps-panel ps-pipelines" data-testid="ps-pipelines-panel">
      <div class="builder">
        <!-- Canvas column -->
        <div class="canvas-wrap">
          <div class="palette">
            <span class="ps-small ps-muted" style="font-weight:600">Drag to add:</span>
            <span class="ps-pchip s"><i class="fa-solid fa-database"></i> Source</span>
            <span class="ps-pchip f"><i class="fa-solid fa-sliders"></i> Feature step</span>
            <span class="ps-pchip e"><i class="fa-solid fa-vector-square"></i> Embedding</span>
            <span class="ps-pchip t"><i class="fa-solid fa-bullseye"></i> Target</span>
            <span class="ps-pchip a"><i class="fa-solid fa-shapes"></i> Algorithm</span>
            <span class="ps-spacer"></span>
            <span class="ps-small ps-muted"><i class="fa-solid fa-circle-nodes"></i> {{ nodes.length }} nodes</span>
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
            <button mjButton variant="secondary" size="sm"><i class="fa-solid fa-arrows-to-dot"></i> Fit</button>
            <button mjButton variant="secondary" size="sm"><i class="fa-solid fa-circle-check"></i> Validate</button>
            <button mjButton variant="primary" size="sm"><i class="fa-solid fa-play"></i> Train</button>
          </div>
        </div>

        <!-- Inspector column -->
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
              <div class="ps-field">
                <label>Output feature</label>
                <input class="ps-input" type="text" [value]="selectedNode.rows[0]?.v || selectedNode.title" />
              </div>
              <div class="ps-field">
                <label>As-of strategy</label>
                <div class="ps-seg">
                  <button class="on">Offset</button>
                  <button>Snapshot</button>
                  <button>Event time</button>
                </div>
              </div>
              <div class="ps-field">
                <label>Offset before renewal</label>
                <div class="ps-row" style="align-items:center">
                  <input class="ps-input" type="number" value="90" style="width:80px" />
                  <select class="ps-input" style="width:auto"><option>days</option><option>weeks</option></select>
                </div>
              </div>
              <div class="ps-callout warn">
                <i class="fa-solid fa-triangle-exclamation"></i>
                <div class="ps-small">
                  <strong>Leakage guard:</strong> this feature must be computed as-of the decision date to
                  avoid peeking at the future.
                </div>
              </div>
            </div>
          </div>

          <div class="ps-card">
            <div class="ps-card-head"><i class="fa-solid fa-shield-halved" style="color:var(--mj-status-warning)"></i><h3>Leakage guard</h3></div>
            <div class="ps-card-body">
              <div class="ps-row" style="justify-content:space-between">
                <span class="ps-small ps-muted">Deny-list columns</span><span class="ps-badge gray">3</span>
              </div>
              <div class="meta-row" style="display:flex;gap:6px;flex-wrap:wrap;margin-top:8px">
                <span class="ps-tag">renewal_date</span><span class="ps-tag">paid_at</span><span class="ps-tag">status_post</span>
              </div>
              <div class="ps-divider"></div>
              <label class="ps-small ps-muted" style="font-weight:700">Single-feature dominance</label>
              <div class="ps-row" style="align-items:center;gap:10px;margin-top:6px">
                <div class="ps-bar warn" style="flex:1"><span style="width:60%"></span></div>
                <span class="ps-mono">0.60</span>
              </div>
              <div class="ps-small ps-muted" style="margin-top:6px">Block training if any feature exceeds this importance share.</div>
            </div>
          </div>

          <div class="ps-card">
            <div class="ps-card-head"><i class="fa-solid fa-scissors" style="color:var(--mj-brand-primary)"></i><h3>Validation</h3></div>
            <div class="ps-card-body">
              <div class="nb-row" style="display:flex;justify-content:space-between;padding:4px 0"><span class="ps-muted">Train / test split</span><strong>0.20</strong></div>
              <div class="nb-row" style="display:flex;justify-content:space-between;padding:4px 0"><span class="ps-muted">Locked holdout</span><strong>0.15</strong></div>
              <div class="nb-row" style="display:flex;justify-content:space-between;padding:4px 0"><span class="ps-muted">Stratify on</span><span class="ps-tag">Renewed</span></div>
              <div class="ps-divider"></div>
              <div class="ps-small ps-muted">65% train · 20% test · 15% locked holdout</div>
              <div class="ps-bar" style="margin-top:8px"><span style="width:65%"></span></div>
            </div>
          </div>
        </div>
      </div>
    </div>
  `,
})
export class PSPipelinesComponent {
  @Input() engine!: PredictiveStudioEngine;

  /** Canvas size is derived from the layout (columns × tallest column). */
  public canvasW = 940;
  public canvasH = 620;
  public selectedId = 'recency';

  /** Fast id → node lookup, rebuilt after layout. Avoids O(n) find() per edge. */
  private nodeById = new Map<string, DagNode>();

  /**
   * Sample DAG. `x`/`y` are placeholders (0) — the real positions are computed
   * deterministically by layoutDag() from the edge topology, so the order here
   * is irrelevant to where nodes land on screen.
   */
  public nodes: DagNode[] = [
    { id: 'members', type: 'src', title: 'Members', icon: 'fa-solid fa-table', tag: 'entity', x: 0, y: 0, hasIn: false, hasOut: true, rows: [{ k: 'rows', v: '48,210' }, { k: 'primary', v: 'Renewed' }] },
    { id: 'events', type: 'src', title: 'Event Attendance', icon: 'fa-solid fa-magnifying-glass-chart', tag: 'query', x: 0, y: 0, hasIn: false, hasOut: true, rows: [{ k: 'join', v: 'MemberID' }, { k: 'agg', v: 'count, last' }] },
    { id: 'crm', type: 'src', title: 'External CRM', icon: 'fa-solid fa-arrows-turn-to-dots', tag: '#2449', x: 0, y: 0, hasIn: false, hasOut: true, rows: [{ k: 'type', v: 'external' }, { k: 'link', v: 'CRM_ContactID' }] },
    { id: 'numeric', type: 'feat', title: 'Select numeric', icon: 'fa-solid fa-list-check', x: 0, y: 0, hasIn: true, hasOut: true, rows: [{ k: 'cols', v: 'tenure, events…' }] },
    { id: 'impute', type: 'feat', title: 'Impute', icon: 'fa-solid fa-fill-drip', x: 0, y: 0, hasIn: true, hasOut: true, rows: [{ k: 'age', v: '→ mean' }] },
    { id: 'onehot', type: 'feat', title: 'One-hot', icon: 'fa-solid fa-table-cells', x: 0, y: 0, hasIn: true, hasOut: true, rows: [{ k: 'city', v: '→ 18 cols' }] },
    { id: 'recency', type: 'feat', title: 'Recency (as-of)', icon: 'fa-solid fa-clock-rotate-left', x: 0, y: 0, hasIn: true, hasOut: true, rows: [{ k: 'feat', v: 'days_since_last' }, { k: 'as-of', v: 'decision date' }] },
    { id: 'standardize', type: 'feat', title: 'Standardize', icon: 'fa-solid fa-ruler-combined', x: 0, y: 0, hasIn: true, hasOut: true, rows: [{ k: 'scaler', v: 'z-score' }] },
    { id: 'embedding', type: 'emb', title: 'Member embedding', icon: 'fa-solid fa-vector-square', x: 0, y: 0, hasIn: true, hasOut: true, rows: [{ k: 'dims', v: '384' }, { k: 'state', v: 'persisted · pinned' }] },
    { id: 'target', type: 'target', title: 'Target: Renewed', icon: 'fa-solid fa-bullseye', x: 0, y: 0, hasIn: false, hasOut: true, rows: [{ k: 'type', v: 'binary' }, { k: 'pos. rate', v: '0.71' }] },
    { id: 'assemble', type: 'feat', title: 'Assemble matrix', icon: 'fa-solid fa-object-group', x: 0, y: 0, hasIn: true, hasOut: true, rows: [{ k: 'features', v: '411' }, { k: 'incl. emb', v: '384' }] },
    { id: 'xgboost', type: 'algo', title: 'XGBoost', icon: 'fa-solid fa-shapes', x: 0, y: 0, hasIn: true, hasOut: true, rows: [{ k: 'n_estimators', v: '300' }, { k: 'max_depth', v: '6' }] },
    { id: 'output', type: 'output', title: 'Model output', icon: 'fa-solid fa-cube', x: 0, y: 0, hasIn: true, hasOut: false, rows: [{ k: 'artifact', v: 'renewal_v4' }] },
  ];

  public edges: DagEdge[] = [
    { from: 'members', to: 'numeric' }, { from: 'events', to: 'numeric' }, { from: 'crm', to: 'numeric' },
    { from: 'numeric', to: 'impute' }, { from: 'impute', to: 'onehot' }, { from: 'onehot', to: 'recency' },
    { from: 'recency', to: 'standardize' }, { from: 'standardize', to: 'assemble' },
    { from: 'embedding', to: 'assemble' }, { from: 'target', to: 'assemble' },
    { from: 'assemble', to: 'xgboost' }, { from: 'xgboost', to: 'output' },
  ];

  constructor() {
    this.layoutDag();
  }

  public get selectedNode(): DagNode {
    return this.nodeById.get(this.selectedId) ?? this.nodes[0];
  }

  public selectNode(id: string): void {
    this.selectedId = id;
  }

  /**
   * Longest-path layering: assigns each node a column = the longest dependency
   * chain leading into it, so the graph reads strictly left-to-right. Within a
   * column nodes are distributed evenly and vertically centred against the
   * tallest column, then the canvas is sized to fit. Deterministic — depends
   * only on the edge topology and the declared node order.
   */
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

    // Bucket nodes into columns, preserving declared order for stable rows.
    const maxDepth = Math.max(0, ...depth.values());
    const columns: DagNode[][] = Array.from({ length: maxDepth + 1 }, () => []);
    for (const n of this.nodes) {
      columns[depth.get(n.id) ?? 0].push(n);
    }

    this.positionColumns(columns);
  }

  /** Longest-path depth per node via topological relaxation (Kahn's order). */
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
        if (indeg.get(next) === 0) queue.push(next);
      }
    }
    return depth;
  }

  /** Place each column at an even X, distribute its nodes vertically centred. */
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

  public nodeTypeLabel(type: NodeType): string {
    switch (type) {
      case 'src': return 'Source';
      case 'feat': return 'Feature step';
      case 'emb': return 'Embedding';
      case 'target': return 'Target';
      case 'algo': return 'Algorithm';
      case 'output': return 'Model output';
    }
  }

  /**
   * Cubic bezier from a source node's OUTPUT port (right-centre) to a target
   * node's INPUT port (left-centre). Coordinates are the same pixel space the
   * nodes are absolutely positioned in AND the SVG viewBox — so paths land
   * exactly on the rendered ports. If either endpoint can't be resolved we emit
   * an empty path (no line) rather than a stray segment to (0,0).
   */
  public edgePath(edge: DagEdge): string {
    const from = this.nodeById.get(edge.from);
    const to = this.nodeById.get(edge.to);
    if (!from || !to) return '';

    const sx = from.x + NODE_W;        // source output port: right edge
    const sy = from.y + NODE_H / 2;    // vertical centre
    const tx = to.x;                   // target input port: left edge
    const ty = to.y + NODE_H / 2;

    const dx = tx - sx;
    const c1x = sx + dx * 0.5;
    const c2x = tx - dx * 0.5;
    return `M ${sx} ${sy} C ${c1x} ${sy}, ${c2x} ${ty}, ${tx} ${ty}`;
  }
}
