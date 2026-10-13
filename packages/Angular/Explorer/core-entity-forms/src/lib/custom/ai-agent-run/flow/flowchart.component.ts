import {
  Component, ElementRef, Input, Output, EventEmitter, ViewChild,
  ChangeDetectionStrategy, ViewEncapsulation, OnDestroy
} from '@angular/core';
import { FlowModel, FlowNode, FLOW_COLORS, FLOW_LABEL, ShortLabel, FormatDuration } from './agent-run-flow.model';
import { SvgEl, Clip, AppendIcon, AppendTitle } from './flow-svg.util';

interface Box { rect: SVGElement; node: FlowNode; }

/**
 * Flowchart — a clean, static top-down tree of the run (the evolution of the old
 * Visualization tab). No clock: pan (drag), zoom (wheel / buttons), click a node to
 * inspect it (click again or the background to deselect), and collapse/expand
 * sub-agent & loop containers. Built on the same shared FlowModel as the animated
 * renderers, so palette, hierarchy and durations stay consistent.
 */
@Component({
  standalone: false,
  selector: 'mj-agent-flow-flowchart',
  templateUrl: './flowchart.component.html',
  styleUrls: ['./flowchart.component.css', './flow-shared.css'],
  encapsulation: ViewEncapsulation.None,
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class FlowchartComponent implements OnDestroy {
  @ViewChild('svg', { static: true }) SvgRef!: ElementRef<SVGSVGElement>;

  /** @deprecated Use {@link SvgRef}. */
  get svgRef(): ElementRef<SVGSVGElement> {
    return this.SvgRef;
  }
  /** @deprecated Use {@link SvgRef}. */
  set svgRef(value: ElementRef<SVGSVGElement>) {
    this.SvgRef = value;
  }
  @Output() NodeSelected = new EventEmitter<FlowNode>();

  /**
   * @deprecated Use {@link NodeSelected}.
   *
   * The same emitter under the old binding name, so a template still binding
   * (nodeSelected) keeps working. Must stay AFTER NodeSelected: class fields
   * initialise in order, and the other way round this captures undefined.
   */
  @Output() nodeSelected = this.NodeSelected;
  @Output() SelectionCleared = new EventEmitter<void>();

  /**
   * @deprecated Use {@link SelectionCleared}.
   *
   * The same emitter under the old binding name, so a template still binding
   * (selectionCleared) keeps working. Must stay AFTER SelectionCleared: class fields
   * initialise in order, and the other way round this captures undefined.
   */
  @Output() selectionCleared = this.SelectionCleared;

  private _model: FlowModel | null = null;
  private built = false;
  private listening = false;
  private boxes = new Map<number, Box>();
  private mainG?: SVGElement;
  private selectedId = -1;
  private collapsed = new Set<number>();

  private readonly NODE_W = 280;
  private readonly NODE_H = 62;
  private readonly VGAP = 22;
  private readonly INDENT = 48;
  private readonly PADX = 40;

  private view = { s: 1, tx: 0, ty: 0 };
  private panning = false;
  private moved = false;
  private suppressBg = false;
  private start = { x: 0, y: 0, tx: 0, ty: 0 };

  @Input() set Model(m: FlowModel | null) { this._model = m; this.built = false; this.collapsed.clear(); this.selectedId = -1; this.clear(); }

  public Render(_p: number, _ts: number): void {
    if (!this._model) return;
    if (!this.built) { this.buildScene(true); this.built = true; }
  }

  ngOnDestroy(): void { this.detachListeners(); }

  private clear(): void {
    const svg = this.SvgRef?.nativeElement;
    if (svg) while (svg.firstChild) svg.removeChild(svg.firstChild);
    this.boxes.clear();
  }

  /* ------------------------------ scene build ------------------------------ */

  private visibleNodes(): FlowNode[] {
    const out: FlowNode[] = [];
    const walk = (n: FlowNode) => { out.push(n); if (!this.collapsed.has(n.Id)) n.Children.forEach(walk); };
    walk(this._model!.Root);
    return out;
  }

  private descendantCount(n: FlowNode): number {
    return n.Children.reduce((s, c) => s + 1 + this.descendantCount(c), 0);
  }

  private buildScene(fit: boolean): void {
    this.clear();
    const svg = this.SvgRef.nativeElement;
    const ordered = this.visibleNodes();
    const rowY = (i: number) => i * (this.NODE_H + this.VGAP);

    this.mainG = SvgEl('g', {}, svg);
    const main = this.mainG;
    const edges = SvgEl('g', {}, main);
    const nodesG = SvgEl('g', {}, main);

    const pos = new Map<number, { x: number; y: number }>();
    ordered.forEach((n, i) => pos.set(n.Id, { x: this.PADX + n.Depth * this.INDENT, y: rowY(i) }));

    // elbow connectors to parent (file-tree style)
    for (const n of ordered) {
      if (!n.Parent || !pos.has(n.Parent.Id)) continue;
      const c = pos.get(n.Id)!, p = pos.get(n.Parent.Id)!;
      const spineX = p.x + 16, midY = c.y + this.NODE_H / 2;
      SvgEl('path', { d: `M${spineX},${p.y + this.NODE_H} L${spineX},${midY} L${c.x},${midY}`, fill: 'none', stroke: 'var(--mj-border-strong)', 'stroke-width': 1.5 }, edges);
    }

    for (const n of ordered) {
      const { x, y } = pos.get(n.Id)!;
      const col = FLOW_COLORS[n.Type];
      const isContainer = n.Children.length > 0;
      const isCollapsed = this.collapsed.has(n.Id);
      const grp = SvgEl('g', {}, nodesG);
      (grp as SVGElement & { style: CSSStyleDeclaration }).style.color = col;

      const body = SvgEl('g', {}, grp);
      (body as SVGElement & { style: CSSStyleDeclaration }).style.cursor = 'pointer';
      const sel = n.Id === this.selectedId;
      const rect = SvgEl('rect', {
        x, y, width: this.NODE_W, height: this.NODE_H, rx: 12,
        fill: sel ? 'var(--mj-bg-surface-hover)' : 'var(--mj-bg-surface-card)',
        stroke: col, 'stroke-width': sel ? 3 : isContainer ? 2 : 1.4, opacity: 0.98
      }, body);
      if (n.Heat >= 2) rect.setAttribute('class', 'glow' + n.Heat);
      SvgEl('rect', { x, y, width: 5, height: this.NODE_H, rx: 2.5, fill: col }, body);
      AppendTitle(body, `${n.Name} · ${FormatDuration(n.RealDur)}`);
      AppendIcon(body, x + 14, y + this.NODE_H / 2 - 11, 22, n.IconClass, n.LogoUrl, col);
      SvgEl('text', { x: x + 46, y: y + 22, 'font-size': 13, 'font-weight': 600, 'dominant-baseline': 'middle', text: Clip(ShortLabel(n), 26) }, body);
      const baseSub = n.Model ? `${FLOW_LABEL[n.Type]} · ${n.Model}` : FLOW_LABEL[n.Type];
      const sub = isContainer && isCollapsed ? `${FLOW_LABEL[n.Type]} · ${this.descendantCount(n)} hidden` : baseSub;
      SvgEl('text', { x: x + 46, y: y + 41, 'font-size': 10.5, class: 'ftxt-muted', text: Clip(sub, 32) }, body);
      if (n.RealDur) {
        SvgEl('text', { x: x + this.NODE_W - 14, y: y + this.NODE_H / 2, 'font-size': 11, 'font-weight': 600, 'text-anchor': 'end', 'dominant-baseline': 'middle', class: 'ftxt-secondary', text: FormatDuration(n.RealDur) }, body);
      }
      body.addEventListener('mouseup', () => { if (!this.moved) { this.suppressBg = true; this.onNodeClick(n); } });

      // collapse / expand disclosure — in the LEFT gutter, tree convention
      if (isContainer) {
        const gx = x - 15, gy = y + this.NODE_H / 2;
        const tg = SvgEl('g', {}, grp);
        (tg as SVGElement & { style: CSSStyleDeclaration }).style.cursor = 'pointer';
        SvgEl('circle', { cx: gx, cy: gy, r: 9, fill: 'transparent' }, tg); // hit target
        const tri = isCollapsed
          ? `M${gx - 3},${gy - 5} L${gx + 4},${gy} L${gx - 3},${gy + 5} Z`
          : `M${gx - 5},${gy - 3} L${gx + 5},${gy - 3} L${gx},${gy + 4} Z`;
        SvgEl('path', { d: tri, fill: col }, tg);
        tg.addEventListener('mouseup', () => { if (!this.moved) { this.suppressBg = true; this.toggleCollapse(n); } });
      }

      this.boxes.set(n.Id, { rect, node: n });
    }

    if (!this.listening) { this.attachListeners(); this.listening = true; }
    if (fit) requestAnimationFrame(() => this.fitToView());
    else this.applyView();
  }

  private toggleCollapse(n: FlowNode): void {
    if (this.collapsed.has(n.Id)) this.collapsed.delete(n.Id); else this.collapsed.add(n.Id);
    this.buildScene(false);
  }

  /* ------------------------------ pan / zoom ------------------------------- */

  private onWheel = (e: WheelEvent): void => {
    e.preventDefault();
    const r = this.SvgRef.nativeElement.getBoundingClientRect();
    this.zoomAt(e.clientX - r.left, e.clientY - r.top, e.deltaY > 0 ? 0.9 : 1.1);
  };
  private onDown = (): void => { this.panning = true; this.moved = false; this.suppressBg = false; this.start = { x: 0, y: 0, tx: this.view.tx, ty: this.view.ty }; };
  private onDownPos = (e: MouseEvent): void => { this.start.x = e.clientX; this.start.y = e.clientY; };
  private onMove = (e: MouseEvent): void => {
    if (!this.panning) return;
    const dx = e.clientX - this.start.x, dy = e.clientY - this.start.y;
    if (Math.abs(dx) + Math.abs(dy) > 3) this.moved = true;
    this.view.tx = this.start.tx + dx; this.view.ty = this.start.ty + dy;
    this.applyView();
  };
  private onUp = (): void => {
    if (this.panning && !this.moved && !this.suppressBg) this.deselect();
    this.panning = false; this.suppressBg = false;
  };

  private attachListeners(): void {
    const svg = this.SvgRef.nativeElement;
    svg.addEventListener('wheel', this.onWheel, { passive: false });
    svg.addEventListener('mousedown', (e) => { this.onDown(); this.onDownPos(e); });
    window.addEventListener('mousemove', this.onMove);
    window.addEventListener('mouseup', this.onUp);
  }
  private detachListeners(): void {
    const svg = this.SvgRef?.nativeElement;
    svg?.removeEventListener('wheel', this.onWheel);
    window.removeEventListener('mousemove', this.onMove);
    window.removeEventListener('mouseup', this.onUp);
  }

  private applyView(): void {
    this.mainG?.setAttribute('transform', `translate(${this.view.tx},${this.view.ty}) scale(${this.view.s})`);
  }
  private zoomAt(cx: number, cy: number, factor: number): void {
    const ns = Math.max(0.2, Math.min(2.5, this.view.s * factor));
    this.view.tx = cx - (cx - this.view.tx) * (ns / this.view.s);
    this.view.ty = cy - (cy - this.view.ty) * (ns / this.view.s);
    this.view.s = ns; this.applyView();
  }
  private fitToView(): void {
    const svg = this.SvgRef.nativeElement;
    if (!this.mainG) return;
    const bb = (this.mainG as SVGGraphicsElement).getBBox();
    const vw = svg.clientWidth || 900, vh = svg.clientHeight || 600;
    const s = Math.max(0.25, Math.min(1.15, Math.min((vw - 60) / Math.max(1, bb.width), (vh - 48) / Math.max(1, bb.height))));
    this.view = { s, tx: (vw - bb.width * s) / 2 - bb.x * s, ty: 28 - bb.y * s };
    this.applyView();
  }

  public zoomIn(): void { const svg = this.SvgRef.nativeElement; this.zoomAt(svg.clientWidth / 2, svg.clientHeight / 2, 1.2); }  // case-violation-ok-legacy-back-compat: the PascalCase name is already taken in this scope
  public zoomOut(): void { const svg = this.SvgRef.nativeElement; this.zoomAt(svg.clientWidth / 2, svg.clientHeight / 2, 1 / 1.2); }  // case-violation-ok-legacy-back-compat: the PascalCase name is already taken in this scope
  public ResetView(): void { this.fitToView(); }

  /** @deprecated Use {@link ResetView}. */
  public resetView(): void {
    return this.ResetView();
  }

  // unified interface used by the container's shared zoom toolbar
  public ZoomIn(): void { this.zoomIn(); }
  public ZoomOut(): void { this.zoomOut(); }
  public FitReset(): void { this.fitToView(); }

  /* ------------------------------- selection ------------------------------ */

  private onNodeClick(n: FlowNode): void {
    if (this.selectedId === n.Id) { this.deselect(); return; }
    this.selectedId = n.Id;
    this.paintSelection();
    this.NodeSelected.emit(n);
  }
  private deselect(): void {
    if (this.selectedId === -1) return;
    this.selectedId = -1;
    this.paintSelection();
    this.SelectionCleared.emit();
  }

  /** External deselect (e.g. detail panel closed) — clears highlight without re-emitting. */
  public Deselect(): void {
    if (this.selectedId === -1) return;
    this.selectedId = -1;
    this.paintSelection();
  }
  private paintSelection(): void {
    this.boxes.forEach(({ rect, node }) => {
      const sel = node.Id === this.selectedId;
      rect.setAttribute('stroke-width', sel ? '3' : node.Children.length ? '2' : '1.4');
      rect.setAttribute('fill', sel ? 'var(--mj-bg-surface-hover)' : 'var(--mj-bg-surface-card)');
    });
  }
}
