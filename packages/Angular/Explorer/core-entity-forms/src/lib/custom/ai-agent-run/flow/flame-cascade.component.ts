import { Component, ElementRef, Input, Output, EventEmitter, ViewChild, OnDestroy, ChangeDetectionStrategy, ViewEncapsulation } from '@angular/core';
import { FlowModel, FlowNode, FLOW_COLORS, shortLabel, formatDuration } from './agent-run-flow.model';
import { svgEl, clip, appendIcon, appendTitle } from './flow-svg.util';
import { PanZoomController } from './pan-zoom';

interface FlameCell {
  outline: SVGElement;
  fill: SVGElement;
  x: number;
  fw: number;
  node: FlowNode;
}

/**
 * Flame Cascade — a static icicle of the whole run that's always visible (depth =
 * hierarchy, x = order, bar width = compressed time). Translucent **swimlane bands**
 * sit behind each sub-agent/loop so you can see which steps belong to which. As the
 * clock plays, a fill sweeps each bar and a playhead crosses the chart; longer steps
 * burn hotter.
 */
@Component({
  standalone: false,
  selector: 'mj-agent-flow-flame',
  template: `<svg #svg class="flow-svg" preserveAspectRatio="xMinYMin meet"></svg>`,
  styleUrls: ['./flow-shared.css'],
  encapsulation: ViewEncapsulation.None,
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class FlameCascadeComponent implements OnDestroy {
  @ViewChild('svg', { static: true }) svgRef!: ElementRef<SVGSVGElement>;
  @Output() nodeSelected = new EventEmitter<FlowNode>();

  private static seq = 0;
  private uid = 'flame' + (FlameCascadeComponent.seq++);

  private _model: FlowModel | null = null;
  private built = false;
  private cells = new Map<number, FlameCell>();
  private playhead?: SVGElement;
  private playMark?: SVGElement;
  private selectedId = -1;
  private pz?: PanZoomController;

  public SetSelected(id: number | null): void { this.selectedId = id ?? -1; }
  public ZoomIn(): void { this.pz?.ZoomIn(); }
  public ZoomOut(): void { this.pz?.ZoomOut(); }
  public FitReset(): void { this.pz?.Reset(); }
  ngOnDestroy(): void { this.pz?.Detach(); }

  private readonly VW = 1200;
  private readonly ROW = 46;
  private readonly GAP = 9;
  private readonly PAD = 26;
  private readonly TOP = 44;
  private get IW(): number { return this.VW - this.PAD * 2; }

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
    this.cells.clear();
  }

  private subtreeMaxDepth(n: FlowNode): number {
    return n.children.length ? Math.max(...n.children.map(c => this.subtreeMaxDepth(c))) : n.depth;
  }

  private build(): void {
    const svg = this.svgRef.nativeElement;
    const m = this._model!;
    const VH = this.TOP + (m.maxDepth + 1) * this.ROW + 26;
    svg.setAttribute('viewBox', `0 0 ${this.VW} ${VH}`);
    const defs = svgEl('defs', {}, svg);
    const main = svgEl('g', {}, svg);
    const bands = svgEl('g', {}, main);
    const grid = svgEl('g', {}, main);
    const g = svgEl('g', {}, main);

    // time axis
    for (let i = 0; i <= 10; i++) {
      const x = this.PAD + this.IW * i / 10;
      svgEl('line', { x1: x, y1: this.TOP - 8, x2: x, y2: VH - 18, 'stroke-width': 1, class: 'fgrid' }, grid);
      if (i % 2 === 0) svgEl('text', { x, y: this.TOP - 16, 'font-size': 9.5, 'text-anchor': 'middle', class: 'ftxt-muted', text: i * 10 + '%' }, grid);
    }

    // swimlane bands behind sub-agent / loop containers (nested grouping)
    for (const n of m.nodes) {
      if (n.children.length === 0 || n.depth === 0) continue;
      const x = this.PAD + n.t0 * this.IW;
      const w = Math.max(2, (n.t1 - n.t0) * this.IW);
      const y = this.TOP + n.depth * this.ROW - 3;
      const h = (this.subtreeMaxDepth(n) - n.depth + 1) * this.ROW - this.GAP + 6;
      const band = svgEl('rect', { x: x - 3, y, width: w + 6, height: h, rx: 12, fill: FLOW_COLORS[n.type], opacity: 0.07 }, bands);
      band.setAttribute('stroke', FLOW_COLORS[n.type]);
      band.setAttribute('stroke-width', '1');
      band.setAttribute('stroke-opacity', '0.18');
    }

    for (const n of m.nodes) {
      const x = this.PAD + n.t0 * this.IW;
      const fw = Math.max(2, (n.t1 - n.t0) * this.IW);
      const y = this.TOP + n.depth * this.ROW;
      const h = this.ROW - this.GAP;
      const col = FLOW_COLORS[n.type];
      const grp = svgEl('g', {}, g);
      (grp as SVGElement & { style: CSSStyleDeclaration }).style.color = col;
      (grp as SVGElement & { style: CSSStyleDeclaration }).style.cursor = 'pointer';
      appendTitle(grp, `${n.name} · ${formatDuration(n.realDur)}`);

      // outline = always-visible structure; fill = animated progress overlay
      const outline = svgEl('rect', { x, y, width: fw, height: h, rx: 8, fill: col, 'fill-opacity': 0.14, stroke: col, 'stroke-width': 1.4, 'stroke-opacity': 0.7 }, grp);
      const fill = svgEl('rect', { x, y, width: 0, height: h, rx: 8, fill: col, opacity: 0 }, grp);

      // label group, clipped to the bar so it never bleeds into neighbours
      const clipId = `${this.uid}-${n.id}`;
      const cp = svgEl('clipPath', { id: clipId }, defs);
      svgEl('rect', { x, y, width: fw, height: h, rx: 8 }, cp);
      const content = svgEl('g', { 'clip-path': `url(#${clipId})` }, grp);
      const cy = y + h / 2;
      const name = shortLabel(n);
      const showIcon = fw > 22;
      const iconRight = showIcon ? 30 : 9;
      if (showIcon) appendIcon(content, x + 7, cy - 9, 18, n.iconClass, n.logoUrl, col);
      // shrink the font until the (already abbreviated) label fits, before giving up
      let fontSize = 0;
      for (const fs of [12.5, 11.5, 10.5, 9.5, 8.5]) {
        if (iconRight + name.length * fs * 0.56 + 8 <= fw) { fontSize = fs; break; }
      }
      if (fontSize > 0) {
        svgEl('text', { x: x + iconRight, y: cy + 1, 'font-size': fontSize, 'font-weight': 600, 'dominant-baseline': 'middle', class: 'ftxt-on', text: name }, content);
        if (n.realDur && iconRight + name.length * fontSize * 0.56 + 52 <= fw) {
          svgEl('text', { x: x + fw - 12, y: cy + 1, 'font-size': 10.5, 'text-anchor': 'end', 'dominant-baseline': 'middle', class: 'ftxt-on', opacity: 0.72, text: formatDuration(n.realDur) }, content);
        }
      }
      grp.addEventListener('click', () => { if (!this.pz?.moved) this.nodeSelected.emit(n); });
      this.cells.set(n.id, { outline, fill, x, fw, node: n });
    }

    this.playhead = svgEl('line', { x1: this.PAD, y1: this.TOP - 8, x2: this.PAD, y2: VH - 16, 'stroke-width': 1.5, opacity: 0, class: 'fhand' }, g);
    this.playMark = svgEl('path', { d: `M${this.PAD - 5},${this.TOP - 14} L${this.PAD + 5},${this.TOP - 14} L${this.PAD},${this.TOP - 6} Z`, opacity: 0, class: 'fhand-dot' }, g);

    this.pz = new PanZoomController(svg, main, 'mj.agentRunFlow.view.flame.v1');
    this.pz.Load(); this.pz.Attach();
  }

  private update(p: number, ts: number): void {
    this.cells.forEach(({ outline, fill, fw, node }) => {
      const started = p >= node.t0;
      const active = started && p < node.t1;
      const selected = node.id === this.selectedId;
      const cw = p >= node.t1 ? fw : started ? (p - node.t0) / (node.t1 - node.t0) * fw : 0;
      fill.setAttribute('width', String(Math.max(0, cw)));
      const fillOp = active ? 0.92 + 0.08 * Math.sin(ts / 170) : started ? 0.6 : 0;
      fill.setAttribute('opacity', String(fillOp));
      outline.setAttribute('class', selected ? 'glow2' : active && node.heat ? 'glow' + node.heat : '');
      outline.setAttribute('stroke-width', selected ? '3' : '1.4');
      outline.setAttribute('stroke-opacity', selected || active ? '1' : started ? '0.85' : '0.55');
    });
    const live = p > 0 && p < 1;
    const ph = this.PAD + p * this.IW;
    this.playhead?.setAttribute('x1', String(ph));
    this.playhead?.setAttribute('x2', String(ph));
    this.playhead?.setAttribute('opacity', live ? '0.8' : '0');
    this.playMark?.setAttribute('transform', `translate(${ph - this.PAD},0)`);
    this.playMark?.setAttribute('opacity', live ? '1' : '0');
  }
}
