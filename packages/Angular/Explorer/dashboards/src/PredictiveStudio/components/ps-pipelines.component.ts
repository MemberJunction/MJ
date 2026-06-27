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
const NODE_H = 78;

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
    <div class="ps-panel ps-pipelines">
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

          <div class="ps-flow big">
            <svg class="ps-edges" [attr.viewBox]="'0 0 ' + canvasW + ' ' + canvasH" preserveAspectRatio="none">
              @for (edge of edges; track edge.from + edge.to) {
                <path [attr.d]="edgePath(edge)"></path>
              }
            </svg>
            @for (node of nodes; track node.id) {
              <div class="ps-node" [class]="node.type" [class.selected]="node.id === selectedId"
                [style.left.px]="node.x" [style.top.px]="node.y" (click)="selectNode(node.id)">
                <div class="nh">
                  <i class="tile" [class]="node.icon"></i>
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
        <div class="ps-col inspector">
          <div class="ps-card insp">
            <div class="ihead">
              <i class="tile" [class]="selectedNode.icon" [attr.data-type]="selectedNode.type"></i>
              <div>
                <h3>{{ selectedNode.title }}</h3>
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

  public canvasW = 940;
  public canvasH = 620;
  public selectedId = 'recency';

  public nodes: DagNode[] = [
    { id: 'members', type: 'src', title: 'Members', icon: 'fa-solid fa-table', tag: 'entity', x: 18, y: 36, hasIn: false, hasOut: true, rows: [{ k: 'rows', v: '48,210' }, { k: 'primary', v: 'Renewed' }] },
    { id: 'events', type: 'src', title: 'Event Attendance', icon: 'fa-solid fa-magnifying-glass-chart', tag: 'query', x: 18, y: 150, hasIn: false, hasOut: true, rows: [{ k: 'join', v: 'MemberID' }, { k: 'agg', v: 'count, last' }] },
    { id: 'crm', type: 'src', title: 'External CRM', icon: 'fa-solid fa-arrows-turn-to-dots', tag: '#2449', x: 18, y: 264, hasIn: false, hasOut: true, rows: [{ k: 'type', v: 'external' }, { k: 'link', v: 'CRM_ContactID' }] },
    { id: 'numeric', type: 'feat', title: 'Select numeric', icon: 'fa-solid fa-list-check', x: 300, y: 130, hasIn: true, hasOut: true, rows: [{ k: 'cols', v: 'tenure, events…' }] },
    { id: 'impute', type: 'feat', title: 'Impute', icon: 'fa-solid fa-fill-drip', x: 560, y: 130, hasIn: true, hasOut: true, rows: [{ k: 'age', v: '→ mean' }] },
    { id: 'onehot', type: 'feat', title: 'One-hot', icon: 'fa-solid fa-table-cells', x: 266, y: 232, hasIn: true, hasOut: true, rows: [{ k: 'city', v: '→ 18 cols' }] },
    { id: 'recency', type: 'feat', title: 'Recency (as-of)', icon: 'fa-solid fa-clock-rotate-left', x: 526, y: 232, hasIn: true, hasOut: true, rows: [{ k: 'feat', v: 'days_since_last' }, { k: 'as-of', v: 'decision date' }] },
    { id: 'standardize', type: 'feat', title: 'Standardize', icon: 'fa-solid fa-ruler-combined', x: 526, y: 354, hasIn: true, hasOut: true, rows: [{ k: 'scaler', v: 'z-score' }] },
    { id: 'embedding', type: 'emb', title: 'Member embedding', icon: 'fa-solid fa-vector-square', x: 300, y: 362, hasIn: true, hasOut: true, rows: [{ k: 'dims', v: '384' }, { k: 'state', v: 'persisted · pinned' }] },
    { id: 'target', type: 'target', title: 'Target: Renewed', icon: 'fa-solid fa-bullseye', x: 300, y: 484, hasIn: false, hasOut: true, rows: [{ k: 'type', v: 'binary' }, { k: 'pos. rate', v: '0.71' }] },
    { id: 'assemble', type: 'feat', title: 'Assemble matrix', icon: 'fa-solid fa-object-group', x: 760, y: 270, hasIn: true, hasOut: true, rows: [{ k: 'features', v: '411' }, { k: 'incl. emb', v: '384' }] },
    { id: 'xgboost', type: 'algo', title: 'XGBoost', icon: 'fa-solid fa-shapes', x: 660, y: 460, hasIn: true, hasOut: true, rows: [{ k: 'n_estimators', v: '300' }, { k: 'max_depth', v: '6' }] },
    { id: 'output', type: 'output', title: 'Model output', icon: 'fa-solid fa-cube', x: 660, y: 556, hasIn: true, hasOut: false, rows: [{ k: 'artifact', v: 'renewal_v4' }] },
  ];

  public edges: DagEdge[] = [
    { from: 'members', to: 'numeric' }, { from: 'events', to: 'numeric' }, { from: 'crm', to: 'numeric' },
    { from: 'numeric', to: 'impute' }, { from: 'impute', to: 'onehot' }, { from: 'onehot', to: 'recency' },
    { from: 'recency', to: 'standardize' }, { from: 'standardize', to: 'assemble' },
    { from: 'embedding', to: 'assemble' }, { from: 'target', to: 'assemble' },
    { from: 'assemble', to: 'xgboost' }, { from: 'xgboost', to: 'output' },
  ];

  public get selectedNode(): DagNode {
    return this.nodes.find((n) => n.id === this.selectedId) ?? this.nodes[0];
  }

  public selectNode(id: string): void {
    this.selectedId = id;
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

  /** Cubic bezier from a source node's out-port to a target node's in-port. */
  public edgePath(edge: DagEdge): string {
    const from = this.nodes.find((n) => n.id === edge.from);
    const to = this.nodes.find((n) => n.id === edge.to);
    if (!from || !to) return '';
    const x1 = from.x + NODE_W;
    const y1 = from.y + NODE_H / 2;
    const x2 = to.x;
    const y2 = to.y + NODE_H / 2;
    const dx = Math.max(40, Math.abs(x2 - x1) * 0.5);
    return `M ${x1} ${y1} C ${x1 + dx} ${y1}, ${x2 - dx} ${y2}, ${x2} ${y2}`;
  }
}
