import { Component, ElementRef, Input, Output, EventEmitter, ViewChild, OnDestroy, ChangeDetectionStrategy, ViewEncapsulation } from '@angular/core';
import { FlowModel, FlowNode, FLOW_COLORS, shortLabel } from './agent-run-flow.model';
import { svgEl, clip, appendIcon, appendTitle } from './flow-svg.util';
import { PanZoomController } from './pan-zoom';

interface Star { halo: SVGElement; ring: SVGElement; icon: SVGElement; lab: SVGElement; node: FlowNode; rad: number; }
interface Edge { path: SVGGraphicsElement; part: SVGElement; node: FlowNode; len: number; }
type Placed = FlowNode & { _x?: number; _y?: number; _ang?: number };

/**
 * Constellation — the agent tree as a star map. Leaves spread evenly around the
 * circle (radial dendrogram) so dense sub-agents don't clump; stars carry the real
 * step/agent icon, ignite in execution order, and pulse energy down curved edges.
 * Labels stay clutter-free (root + top level + active by default, hover to reveal).
 */
@Component({
  standalone: false,
  selector: 'mj-agent-flow-constellation',
  template: `<svg #svg class="flow-svg" preserveAspectRatio="xMidYMid meet"></svg>`,
  styleUrls: ['./flow-shared.css'],
  encapsulation: ViewEncapsulation.None,
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class ConstellationComponent {
  @ViewChild('svg', { static: true }) svgRef!: ElementRef<SVGSVGElement>;
  @Output() nodeSelected = new EventEmitter<FlowNode>();

  private _model: FlowModel | null = null;
  private built = false;
  private stars = new Map<number, Star>();
  private edges: Edge[] = [];
  private hoveredId = -1;
  private selectedId = -1;
  private pz?: PanZoomController;

  private readonly VW = 1200;
  private readonly VH = 720;
  private readonly CX = 600;
  private readonly CY = 360;

  public SetSelected(id: number | null): void { this.selectedId = id ?? -1; }
  public ZoomIn(): void { this.pz?.ZoomIn(); }
  public ZoomOut(): void { this.pz?.ZoomOut(); }
  public FitReset(): void { this.pz?.Reset(); }
  public ReapplyView(): void { this.pz?.Reapply(); }
  ngOnDestroy(): void { this.pz?.Detach(); }

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
    this.stars.clear(); this.edges = []; this.hoveredId = -1;
  }

  private build(): void {
    const svg = this.svgRef.nativeElement;
    const m = this._model!;
    svg.setAttribute('viewBox', `0 0 ${this.VW} ${this.VH}`);

    const bg = svgEl('g', {}, svg);
    let seed = 7; const rnd = () => { seed = (seed * 9301 + 49297) % 233280; return seed / 233280; };
    for (let i = 0; i < 150; i++) {
      svgEl('circle', { cx: rnd() * this.VW, cy: rnd() * this.VH, r: rnd() * 1.3 + 0.3, class: 'fstar-bg', opacity: rnd() * 0.3 + 0.04 }, bg);
    }
    const main = svgEl('g', {}, svg);
    const edgeG = svgEl('g', {}, main);
    const nodeG = svgEl('g', {}, main);

    const step = Math.min(150, 300 / Math.max(1, m.maxDepth));
    const leafCount = Math.max(1, m.leaves.length);
    let li = 0;
    const assignAngle = (n: Placed): number => {
      if (!n.children.length) { const a = (li + 0.5) / leafCount * 2 * Math.PI; li++; n._ang = a; return a; }
      const cs = n.children.map(c => assignAngle(c as Placed));
      n._ang = cs.reduce((s, a) => s + a, 0) / cs.length; return n._ang;
    };
    assignAngle(m.root as Placed);
    for (const n of m.nodes) {
      const cn = n as Placed, r = n.depth * step;
      cn._x = this.CX + r * Math.cos(cn._ang! - Math.PI / 2);
      cn._y = this.CY + r * Math.sin(cn._ang! - Math.PI / 2);
    }

    for (const n of m.nodes) {
      if (!n.parent) continue;
      const pn = n.parent as Placed, cn = n as Placed;
      const mx = (pn._x! + cn._x!) / 2, my = (pn._y! + cn._y!) / 2;
      const ctrlX = mx + (this.CX - mx) * 0.16, ctrlY = my + (this.CY - my) * 0.16;
      const col = FLOW_COLORS[n.type];
      const path = svgEl('path', { d: `M${pn._x},${pn._y} Q${ctrlX},${ctrlY} ${cn._x},${cn._y}`, fill: 'none', stroke: col, 'stroke-width': 1.4, opacity: 0.12 }, edgeG) as SVGGraphicsElement;
      const part = svgEl('circle', { r: 3.2, class: 'fhand-dot', opacity: 0 }, edgeG);
      this.edges.push({ path, part, node: n, len: (path as unknown as SVGPathElement).getTotalLength() });
    }

    for (const n of m.nodes) {
      const cn = n as Placed;
      const rad = n.depth === 0 ? 22 : Math.min(24, 9 + Math.pow(n.realDur, 0.55) * 2.6);
      const col = FLOW_COLORS[n.type];
      const grp = svgEl('g', {}, nodeG);
      (grp as SVGElement & { style: CSSStyleDeclaration }).style.color = col;
      (grp as SVGElement & { style: CSSStyleDeclaration }).style.cursor = 'pointer';
      appendTitle(grp, `${n.name}`);
      const halo = svgEl('circle', { cx: cn._x!, cy: cn._y!, r: rad + 7, fill: col, opacity: 0 }, grp);
      const ring = svgEl('circle', { cx: cn._x!, cy: cn._y!, r: rad, fill: col, 'fill-opacity': 0.16, stroke: col, 'stroke-width': 1.6 }, grp);
      const icon = appendIcon(grp, cn._x! - rad * 0.6, cn._y! - rad * 0.6, rad * 1.2, n.iconClass, n.logoUrl, col);
      icon.setAttribute('opacity', '0');
      // angle each label along its radial spoke (flip on the left half so it stays upright)
      const dir = cn._ang! - Math.PI / 2;
      const lx = cn._x! + Math.cos(dir) * (rad + 8), ly = cn._y! + Math.sin(dir) * (rad + 8);
      const flip = Math.cos(dir) < 0;
      const deg = dir * 180 / Math.PI + (flip ? 180 : 0);
      const lab = n.depth === 0
        ? svgEl('text', { x: cn._x!, y: cn._y! + rad + 18, 'font-size': 13, 'font-weight': 700, 'text-anchor': 'middle', class: 'fhalo', opacity: 0, text: clip(shortLabel(n), 22) }, grp)
        : svgEl('text', {
            x: lx, y: ly, 'font-size': 10.5, 'font-weight': 600, 'dominant-baseline': 'middle',
            'text-anchor': flip ? 'end' : 'start', transform: `rotate(${deg} ${lx} ${ly})`,
            class: 'fhalo', opacity: 0, text: clip(shortLabel(n), 22)
          }, grp);
      grp.addEventListener('mouseenter', () => { this.hoveredId = n.id; });
      grp.addEventListener('mouseleave', () => { if (this.hoveredId === n.id) this.hoveredId = -1; });
      grp.addEventListener('click', () => { if (!this.pz?.moved) this.nodeSelected.emit(n); });
      this.stars.set(n.id, { halo, ring, icon, lab, node: n, rad });
    }

    this.pz = new PanZoomController(svg, main, 'mj.agentRunFlow.view.constellation.v1');
    this.pz.Load(); this.pz.Attach();
  }

  private update(p: number, ts: number): void {
    this.stars.forEach(({ halo, ring, icon, lab, node, rad }) => {
      const started = p >= node.t0 || node.depth === 0;
      const active = p >= node.t0 && p < node.t1;
      const hovered = this.hoveredId === node.id;
      const selected = this.selectedId === node.id;
      if (started) {
        const tw = 0.6 + 0.4 * Math.sin(ts / (420 + node.realDur * 70));
        ring.setAttribute('fill-opacity', active || hovered || selected ? '0.32' : String(0.16 + 0.06 * tw));
        ring.setAttribute('class', selected ? 'glow2' : active ? 'glow' + Math.max(1, node.heat) : hovered ? 'glow2' : 'glow1');
        ring.setAttribute('stroke-width', selected ? '3' : '1.6');
        icon.setAttribute('opacity', active || hovered || selected ? '1' : '0.8');
        halo.setAttribute('opacity', active ? String(0.16 + 0.12 * Math.sin(ts / 230)) : selected ? '0.16' : hovered ? '0.14' : '0');
        halo.setAttribute('r', String(rad + 7 + (active ? 4 * Math.abs(Math.sin(ts / 240)) : 0)));
      } else {
        ring.setAttribute('fill-opacity', '0.06'); ring.setAttribute('class', hovered ? 'glow2' : '');
        ring.setAttribute('stroke-width', '1.6');
        icon.setAttribute('opacity', hovered ? '0.7' : '0.25');
        halo.setAttribute('opacity', hovered ? '0.1' : '0');
      }
      const showLabel = node.depth <= 1 || active || hovered || selected;
      lab.setAttribute('opacity', showLabel ? (active || hovered || selected ? '1' : node.depth === 0 ? '1' : '0.62') : '0');
    });
    this.edges.forEach(({ path, part, node, len }) => {
      const flowing = p >= node.t0 && p < node.t1;
      const lit = p >= node.t0;
      path.setAttribute('opacity', lit ? (flowing ? '0.6' : '0.2') : '0.1');
      path.setAttribute('stroke-width', flowing ? '2.4' : '1.4');
      if (flowing) {
        const ph = (ts / 700) % 1;
        const pt = (path as unknown as SVGPathElement).getPointAtLength(ph * len);
        part.setAttribute('cx', String(pt.x)); part.setAttribute('cy', String(pt.y));
        part.setAttribute('opacity', '1'); part.setAttribute('class', 'glow2');
        (part as SVGElement & { style: CSSStyleDeclaration }).style.color = FLOW_COLORS[node.type];
      } else {
        part.setAttribute('opacity', '0');
      }
    });
  }
}
