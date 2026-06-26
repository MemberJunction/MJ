import { Component, ElementRef, Input, Output, EventEmitter, ViewChild, OnDestroy, ChangeDetectionStrategy, ViewEncapsulation } from '@angular/core';
import {
  FlowModel, FlowNode, FLOW_COLORS, agentOf, agentShortName, shortLabel, activeLeaf, formatDuration
} from './agent-run-flow.model';
import { svgEl, clip, appendIcon, appendTitle } from './flow-svg.util';
import { PanZoomController } from './pan-zoom';

interface Station { ring: SVGElement; lab?: SVGElement; leaf: FlowNode; r: number; sx: number; sy: number; }
interface Connector { path: SVGGraphicsElement; to: FlowNode; len: number; }

/**
 * Subway Lines — each agent is a transit line; sub-agents branch off and rejoin.
 * Connectors carry the line's (agent's) colour and brighten as the train passes,
 * so you can follow a sub-agent's route end to end. Stations show the real step
 * icon; labels are abbreviated and angled 30° so dense lines stay readable.
 */
@Component({
  standalone: false,
  selector: 'mj-agent-flow-subway',
  template: `<svg #svg class="flow-svg" preserveAspectRatio="xMidYMid meet"></svg>`,
  styleUrls: ['./flow-shared.css'],
  encapsulation: ViewEncapsulation.None,
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class SubwayLinesComponent implements OnDestroy {
  @ViewChild('svg', { static: true }) svgRef!: ElementRef<SVGSVGElement>;
  @Output() nodeSelected = new EventEmitter<FlowNode>();

  private _model: FlowModel | null = null;
  private built = false;
  private stations = new Map<number, Station>();
  private connectors: Connector[] = [];
  private train?: SVGElement;
  private trainHalo?: SVGElement;
  private selectedId = -1;
  private pz?: PanZoomController;

  public ZoomIn(): void { this.pz?.ZoomIn(); }
  public ZoomOut(): void { this.pz?.ZoomOut(); }
  public FitReset(): void { this.pz?.Reset(); }
  ngOnDestroy(): void { this.pz?.Detach(); }

  private readonly VW = 1280;
  private readonly PAD = 188;
  private readonly TOP = 132;
  private readonly LINE_GAP = 168;
  private readonly DWELL = 0.6;
  private readonly MIN_LABEL_GAP = 40;
  private get IW(): number { return this.VW - this.PAD - 90; }

  public SetSelected(id: number | null): void { this.selectedId = id ?? -1; }

  @Input() set Model(m: FlowModel | null) { this._model = m; this.built = false; this.clear(); }

  public Render(p: number, ts: number): void {
    if (!this._model) return;
    if (!this.built) { this.build(); this.built = true; }
    this.update(p, ts);
  }

  private clear(): void {
    this.pz?.Detach(); this.pz = undefined;
    const svg = this.svgRef?.nativeElement;
    if (svg) while (svg.firstChild) svg.removeChild(svg.firstChild);
    this.stations.clear(); this.connectors = [];
  }

  private build(): void {
    const svg = this.svgRef.nativeElement;
    const m = this._model!;
    const agents = m.nodes.filter(n => n.type === 'agent' || n.type === 'subagent');
    const lineY = new Map<number, number>();
    agents.forEach((a, i) => lineY.set(a.id, this.TOP + i * this.LINE_GAP));
    const VH = this.TOP + Math.max(1, agents.length) * this.LINE_GAP + 30;
    svg.setAttribute('viewBox', `0 0 ${this.VW} ${VH}`);

    const main = svgEl('g', {}, svg);
    const lineG = svgEl('g', {}, main);
    const connG = svgEl('g', {}, main);
    const stationG = svgEl('g', {}, main);
    const trainG = svgEl('g', {}, main);

    const sx = (l: FlowNode) => this.PAD + l.tmid * this.IW;
    const sy = (l: FlowNode) => lineY.get(agentOf(l).id) ?? this.TOP;
    const radius = (l: FlowNode) => Math.min(17, 8 + Math.sqrt(l.realDur) * 1.4);

    // line backbones + agent labels (left gutter, with the agent's icon)
    for (const a of agents) {
      const kids = m.leaves.filter(l => agentOf(l) === a);
      const y = lineY.get(a.id)!;
      const col = FLOW_COLORS[a.type];
      if (kids.length) {
        const x0 = Math.min(...kids.map(sx)) - 32, x1 = Math.max(...kids.map(sx)) + 32;
        svgEl('line', { x1: x0, y1: y, x2: x1, y2: y, stroke: col, 'stroke-width': 7, opacity: 0.32, 'stroke-linecap': 'round' }, lineG);
      }
      appendIcon(lineG, 14, y - 11, 22, a.iconClass, a.logoUrl, col);
      svgEl('text', { x: 44, y: y - 6, 'font-size': 13, 'font-weight': 700, fill: col, 'dominant-baseline': 'middle', text: clip(agentShortName(a), 18) }, lineG);
      svgEl('text', { x: 44, y: y + 10, 'font-size': 9.5, 'dominant-baseline': 'middle', class: 'ftxt-muted', text: `${kids.length} step${kids.length === 1 ? '' : 's'} · ${formatDuration(a.realDur)}` }, lineG);
    }

    // connectors carry the destination line's (agent's) colour
    for (let i = 0; i < m.leaves.length - 1; i++) {
      const a = m.leaves[i], b = m.leaves[i + 1];
      const ax = sx(a), ay = sy(a), bx = sx(b), by = sy(b);
      const mx = (ax + bx) / 2;
      const d = ay === by ? `M${ax},${ay} L${bx},${by}` : `M${ax},${ay} L${mx},${ay} L${mx},${by} L${bx},${by}`;
      const path = svgEl('path', { d, fill: 'none', stroke: FLOW_COLORS[agentOf(b).type], 'stroke-width': 3, opacity: 0.14, 'stroke-linejoin': 'round', 'stroke-linecap': 'round' }, connG) as SVGGraphicsElement;
      this.connectors.push({ path, to: b, len: (path as unknown as SVGPathElement).getTotalLength() });
    }

    // stations: ring + step icon; angled abbreviated label (thinned when dense)
    let lastLabelX = -1e9;
    m.leaves.forEach((l) => {
      const x = sx(l), y = sy(l), r = radius(l);
      const col = FLOW_COLORS[l.type];
      const grp = svgEl('g', {}, stationG);
      (grp as SVGElement & { style: CSSStyleDeclaration }).style.color = col;
      (grp as SVGElement & { style: CSSStyleDeclaration }).style.cursor = 'pointer';
      appendTitle(grp, `${l.name} · ${formatDuration(l.realDur)}`);
      const ring = svgEl('circle', { cx: x, cy: y, r, fill: 'var(--mj-bg-surface)', stroke: col, 'stroke-width': 3.2 }, grp);
      appendIcon(grp, x - r * 0.62, y - r * 0.62, r * 1.24, l.iconClass, l.logoUrl, col);

      const show = (x - lastLabelX >= this.MIN_LABEL_GAP) || l.heat >= 2;
      let lab: SVGElement | undefined;
      if (show) {
        lastLabelX = x;
        const lx = x, ly = y - r - 8;
        lab = svgEl('text', {
          x: lx, y: ly, 'font-size': 10.5, 'font-weight': 600, 'text-anchor': 'start',
          transform: `rotate(-30 ${lx} ${ly})`, class: 'ftxt-secondary', opacity: 0.7,
          text: `${clip(shortLabel(l), 22)}  ·  ${formatDuration(l.realDur)}`
        }, grp);
      }
      grp.addEventListener('click', () => { if (!this.pz?.moved) this.nodeSelected.emit(l); });
      this.stations.set(l.id, { ring, lab, leaf: l, r, sx: x, sy: y });
    });

    this.trainHalo = svgEl('circle', { r: 17, opacity: 0, class: 'fhand-dot' }, trainG);
    this.train = svgEl('circle', { r: 9, opacity: 0, stroke: 'var(--mj-bg-surface)', 'stroke-width': 2.5 }, trainG);

    this.pz = new PanZoomController(svg, main, 'mj.agentRunFlow.view.subway.v1');
    this.pz.Load(); this.pz.Attach();
  }

  private update(p: number, ts: number): void {
    const m = this._model!;
    this.stations.forEach(({ ring, lab, leaf, r }) => {
      const started = p >= leaf.t0;
      const active = started && p < leaf.t1;
      const selected = leaf.id === this.selectedId;
      ring.setAttribute('class', selected ? 'glow2' : active ? 'glow' + Math.max(1, leaf.heat) : '');
      ring.setAttribute('stroke-width', selected ? '4.5' : '3.2');
      ring.setAttribute('r', String(active ? r + 2 * Math.abs(Math.sin(ts / 220)) : r));
      ring.setAttribute('fill-opacity', started ? '1' : '0.55');
      lab?.setAttribute('opacity', active || selected ? '1' : started ? '0.85' : '0.6');
    });
    this.connectors.forEach(({ path, to }) => {
      const done = p >= to.t1, lit = p >= to.t0;
      path.setAttribute('opacity', done ? '0.7' : lit ? '0.45' : '0.14');
      path.setAttribute('stroke-width', lit ? '3.6' : '3');
    });

    const leaf = activeLeaf(m, p);
    const idx = m.leaves.indexOf(leaf);
    const frac = p >= leaf.t1 ? 1 : Math.max(0, (p - leaf.t0) / (leaf.t1 - leaf.t0));
    const here = this.stations.get(leaf.id);
    let tx = here?.sx ?? 0, ty = here?.sy ?? 0;
    if (here && idx >= 0 && idx < this.connectors.length && frac >= this.DWELL) {
      const conn = this.connectors[idx];
      const lt = (frac - this.DWELL) / (1 - this.DWELL);
      const pt = (conn.path as unknown as SVGPathElement).getPointAtLength(lt * conn.len);
      tx = pt.x; ty = pt.y;
    }
    const live = p > 0 && p < 1;
    const lineCol = FLOW_COLORS[agentOf(leaf).type];
    if (this.train) {
      this.train.setAttribute('cx', String(tx)); this.train.setAttribute('cy', String(ty));
      this.train.setAttribute('opacity', live ? '1' : '0');
      this.train.setAttribute('fill', lineCol);
      this.train.setAttribute('class', live ? 'glow2' : '');
      (this.train as SVGElement & { style: CSSStyleDeclaration }).style.color = lineCol;
    }
    if (this.trainHalo) {
      this.trainHalo.setAttribute('cx', String(tx)); this.trainHalo.setAttribute('cy', String(ty));
      this.trainHalo.setAttribute('opacity', live ? String(0.16 + 0.08 * Math.sin(ts / 200)) : '0');
    }
  }
}
