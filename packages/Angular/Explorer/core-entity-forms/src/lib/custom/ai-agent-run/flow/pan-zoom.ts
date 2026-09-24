import { UserInfoEngine } from '@memberjunction/core-entities';

interface View { s: number; tx: number; ty: number; }

/**
 * Reusable pan/zoom for the viewBox-based flow renderers (Flame, Subway,
 * Constellation). Wheel zooms about the cursor, drag pans, and the view is
 * persisted per-user (cross-device) via UserInfoEngine under `storageKey`.
 *
 * All math is done in the svg's *viewBox* coordinate space (screen deltas are
 * converted), so zoom-to-cursor and pan stay accurate regardless of how the
 * svg is scaled to fit its container.
 */
export class PanZoomController {
  public View: View = { s: 1, tx: 0, ty: 0 };

  /** @deprecated Use {@link View}. */
  public get view(): View {
    return this.View;
  }
  /** @deprecated Use {@link View}. */
  public set view(value: View) {
    this.View = value;
  }
  /** True when the last gesture actually dragged — renderers use it to suppress click-select. */
  public Moved = false;

  /** @deprecated Use {@link Moved}. */
  public get moved() {
    return this.Moved;
  }
  /** @deprecated Use {@link Moved}. */
  public set moved(value) {
    this.Moved = value;
  }

  private panning = false;
  private startX = 0;
  private startY = 0;
  private startTx = 0;
  private startTy = 0;

  private readonly onWheelB = this.onWheel.bind(this);
  private readonly onDownB = this.onDown.bind(this);
  private readonly onMoveB = this.onMove.bind(this);
  private readonly onUpB = this.onUp.bind(this);

  constructor(
    private svg: SVGSVGElement,
    private group: SVGElement,
    private storageKey: string,
    private minS = 0.4,
    private maxS = 6
  ) {}

  public Load(): void {
    const raw = UserInfoEngine.Instance.GetSetting(this.storageKey);
    if (!raw) return;
    try {
      const v = JSON.parse(raw) as Partial<View>;
      if (v && typeof v.s === 'number' && typeof v.tx === 'number' && typeof v.ty === 'number') {
        this.View = { s: v.s, tx: v.tx, ty: v.ty };
      }
    } catch { /* ignore bad cache */ }
  }

  public Attach(): void {
    this.svg.addEventListener('wheel', this.onWheelB, { passive: false });
    this.svg.addEventListener('mousedown', this.onDownB);
    window.addEventListener('mousemove', this.onMoveB);
    window.addEventListener('mouseup', this.onUpB);
    this.apply();
  }

  public Detach(): void {
    this.svg.removeEventListener('wheel', this.onWheelB);
    this.svg.removeEventListener('mousedown', this.onDownB);
    window.removeEventListener('mousemove', this.onMoveB);
    window.removeEventListener('mouseup', this.onUpB);
  }

  public ZoomIn(): void { const vb = this.vb(); this.zoomAt(vb.w / 2, vb.h / 2, 1.25); }
  public ZoomOut(): void { const vb = this.vb(); this.zoomAt(vb.w / 2, vb.h / 2, 1 / 1.25); }
  public Reset(): void { this.View = { s: 1, tx: 0, ty: 0 }; this.apply(); this.persist(); }
  /** Re-assert this controller's own view onto its group (defensive on mode switch). */
  public Reapply(): void { this.apply(); }

  private vb(): { w: number; h: number } {
    const b = this.svg.viewBox?.baseVal;
    return b && b.width ? { w: b.width, h: b.height } : { w: this.svg.clientWidth || 1, h: this.svg.clientHeight || 1 };
  }
  private toVbScale(): number {
    const r = this.svg.getBoundingClientRect();
    return r.width ? this.vb().w / r.width : 1;
  }

  private onWheel(e: WheelEvent): void {
    e.preventDefault();
    const r = this.svg.getBoundingClientRect();
    const k = this.toVbScale();
    this.zoomAt((e.clientX - r.left) * k, (e.clientY - r.top) * k, e.deltaY > 0 ? 0.9 : 1.1);
  }
  private onDown(e: MouseEvent): void {
    this.panning = true; this.Moved = false;
    this.startX = e.clientX; this.startY = e.clientY;
    this.startTx = this.View.tx; this.startTy = this.View.ty;
  }
  private onMove(e: MouseEvent): void {
    if (!this.panning) return;
    const k = this.toVbScale();
    const dx = (e.clientX - this.startX) * k, dy = (e.clientY - this.startY) * k;
    if (Math.abs(dx) + Math.abs(dy) > 3) this.Moved = true;
    this.View.tx = this.startTx + dx; this.View.ty = this.startTy + dy;
    this.apply();
  }
  private onUp(): void { if (this.panning && this.Moved) this.persist(); this.panning = false; }

  private zoomAt(cx: number, cy: number, factor: number): void {
    const ns = Math.max(this.minS, Math.min(this.maxS, this.View.s * factor));
    this.View.tx = cx - (cx - this.View.tx) * (ns / this.View.s);
    this.View.ty = cy - (cy - this.View.ty) * (ns / this.View.s);
    this.View.s = ns;
    this.apply(); this.persist();
  }
  private apply(): void {
    this.group.setAttribute('transform', `translate(${this.View.tx},${this.View.ty}) scale(${this.View.s})`);
  }
  private persist(): void {
    UserInfoEngine.Instance.SetSettingDebounced(this.storageKey, JSON.stringify(this.View));
  }
}
