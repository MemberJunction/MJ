import {
  AfterViewChecked, ChangeDetectorRef, Component, ElementRef, EventEmitter, HostListener,
  Input, OnDestroy, OnInit, Output, ViewChild, inject
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { UUIDsEqual } from '@memberjunction/global';
import { Subscription } from 'rxjs';
import {
  WHITEBOARD_DEFAULTS, WhiteboardBounds, WhiteboardConnectorItem, WhiteboardFontFamily,
  WhiteboardHighlightItem, WhiteboardImageItem, WhiteboardInkItem, WhiteboardItem,
  WhiteboardItemPatch, WhiteboardPoint, WhiteboardShapeItem, WhiteboardState,
  WhiteboardStickyItem, WhiteboardTextItem
} from './whiteboard-state';
import { WhiteboardTool, WhiteboardTextStyleEvent, WHITEBOARD_PEN_COLORS } from './whiteboard-toolbar.component';

/** The agent presence cursor state (input-driven; the host animates it to mutation points). */
export interface WhiteboardAgentPresence {
  Active: boolean;
  X: number;
  Y: number;
  Label: string;
}

type ResizeHandle = 'nw' | 'n' | 'ne' | 'e' | 'se' | 's' | 'sw' | 'w';

type BoardInteraction =
  | { Type: 'move'; ItemID: string; StartX: number; StartY: number; OrigBounds: WhiteboardBounds; DX: number; DY: number; Moved: boolean }
  | { Type: 'resize'; ItemID: string; Handle: ResizeHandle; StartX: number; StartY: number; OrigBounds: WhiteboardBounds; CurBounds: WhiteboardBounds }
  | { Type: 'pen'; Points: WhiteboardPoint[] }
  | { Type: 'shape'; StartX: number; StartY: number; CurX: number; CurY: number }
  | { Type: 'pan'; StartClientX: number; StartClientY: number; OrigPanX: number; OrigPanY: number };

interface PendingConnector {
  FromItemID: string | null;
  FromPoint: WhiteboardPoint | null;
  CurX: number;
  CurY: number;
}

/** Zoom presets stepped by the zoom cluster (25%–200%, matching the mockup's range). */
const ZOOM_STEPS = [0.25, 0.5, 0.75, 0.9, 1, 1.25, 1.5, 2] as const;
const GRID_SIZE = 22;
/** How long an agent-added item keeps its pop-in/flash class. */
const POP_IN_MS = 3200;

/**
 * The LIVE WHITEBOARD canvas surface (`mj-realtime-whiteboard`): dotted-grid board with
 * pan/zoom, per-tool pointer interactions (select/move with ghost + handles, pan, smoothed
 * freehand pen, drag-create shapes, click-place stickies/text with inline edit, image paste,
 * item→item connectors with floating-point fallback, eraser, dismissible highlights),
 * ownership chips, agent pop-in flash and the input-driven agent presence cursor.
 *
 * All mutations go through the shared {@link WhiteboardState} engine — the same API the
 * agent's channel tools use — so undo/redo and the perception feed see one history.
 */
@Component({
  standalone: true,
  selector: 'mj-realtime-whiteboard',
  imports: [CommonModule],
  templateUrl: './whiteboard-board.component.html',
  styleUrl: './whiteboard-board.component.css'
})
export class RealtimeWhiteboardBoardComponent implements OnInit, OnDestroy, AfterViewChecked {
  /** Shared board state engine (owned by the integration layer, passed via the host). */
  @Input({ required: true }) State!: WhiteboardState;
  /** Display name of the session's agent ("Sage") — chips, highlight tags, presence label. */
  @Input() AgentName = 'Agent';
  /** Active tool (owned by the host; toolbar + keyboard drive it). */
  @Input()
  set Tool(value: WhiteboardTool) {
    if (value !== this._tool) {
      this._tool = value;
      this.CancelTransient();
    }
  }
  get Tool(): WhiteboardTool {
    return this._tool;
  }
  /** Selected pen ink color. */
  @Input() PenColor: string = WHITEBOARD_PEN_COLORS[0];
  /** Selected pen stroke width. */
  @Input() PenWidth = 4;
  /** Selected shape kind for drag-create. */
  @Input() ShapeKind: WhiteboardShapeItem['Shape'] = 'rect';
  /** Selected text font size for click-placed text (curated steps; 12 = CSS default). */
  @Input() TextSize = 12;
  /** Selected text font family for click-placed text. */
  @Input() TextFamily: WhiteboardFontFamily = 'sans';
  /** Selected text bold state for click-placed text (labels render bold by default). */
  @Input() TextBold = true;
  /** Selected text color for click-placed text (null = theme default). */
  @Input() TextColor: string | null = null;
  /** Agent presence cursor (pulsing ring + "… is drawing" label), driven by the host. */
  @Input() AgentPresence: WhiteboardAgentPresence | null = null;
  /**
   * Read-only mode (artifact viewer / session review): all mutating pointer interactions,
   * paste, and inline editing are disabled; pan + zoom remain available for navigation.
   */
  @Input() ReadOnly = false;

  /** Requests a tool switch decided by a board gesture (e.g. Esc → select). */
  @Output() ToolChangeRequest = new EventEmitter<WhiteboardTool>();

  @ViewChild('canvas') private canvasRef?: ElementRef<HTMLDivElement>;

  // viewport
  public PanX = 0;
  public PanY = 0;
  public Zoom = 0.9;
  public MinimapOpen = false;

  // transient interaction state
  public Interaction: BoardInteraction | null = null;
  public PendingConnector: PendingConnector | null = null;
  public EditingID: string | null = null;
  private editIsNew = false;
  private pendingFocus = false;
  private userStickyCount = 0;

  /** Agent items that just popped in (drive the .pop-in violet flash). */
  public PopInIDs = new Set<string>();
  private popInTimers: ReturnType<typeof setTimeout>[] = [];

  private _tool: WhiteboardTool = 'select';
  private changedSub?: Subscription;
  private cdr = inject(ChangeDetectorRef);

  ngOnInit(): void {
    this.changedSub = this.State.Changed$.subscribe((change) => {
      if (change.Op === 'add' && change.Author === 'agent') {
        this.PopInIDs.add(change.ItemID);
        this.popInTimers.push(setTimeout(() => {
          this.PopInIDs.delete(change.ItemID);
          this.cdr.markForCheck();
        }, POP_IN_MS));
      }
      this.cdr.markForCheck();
    });
  }

  ngOnDestroy(): void {
    this.changedSub?.unsubscribe();
    for (const t of this.popInTimers) {
      clearTimeout(t);
    }
  }

  ngAfterViewChecked(): void {
    if (this.pendingFocus) {
      this.pendingFocus = false;
      const editor = this.canvasRef?.nativeElement.querySelector<HTMLElement>('.wb-edit');
      editor?.focus();
    }
  }

  // ────────────────────────────────────────────── render-model getters

  public get BoxItems(): (WhiteboardStickyItem | WhiteboardShapeItem | WhiteboardTextItem | WhiteboardImageItem)[] {
    return this.State.Items.filter(
      (i): i is WhiteboardStickyItem | WhiteboardShapeItem | WhiteboardTextItem | WhiteboardImageItem =>
        i.Kind === 'sticky' || i.Kind === 'shape' || i.Kind === 'text' || i.Kind === 'image');
  }

  public get InkItems(): WhiteboardInkItem[] {
    return this.State.Items.filter((i): i is WhiteboardInkItem => i.Kind === 'ink');
  }

  public get ConnectorItems(): WhiteboardConnectorItem[] {
    return this.State.Items.filter((i): i is WhiteboardConnectorItem => i.Kind === 'connector');
  }

  public get HighlightItems(): WhiteboardHighlightItem[] {
    return this.State.Items.filter((i): i is WhiteboardHighlightItem => i.Kind === 'highlight');
  }

  public get ViewportTransform(): string {
    return `translate(${this.PanX}px, ${this.PanY}px) scale(${this.Zoom})`;
  }

  public get GridBackgroundSize(): string {
    const s = GRID_SIZE * this.Zoom;
    return `${s}px ${s}px`;
  }

  public get GridBackgroundPosition(): string {
    return `${this.PanX}px ${this.PanY}px`;
  }

  public get ZoomPercent(): number {
    return Math.round(this.Zoom * 100);
  }

  public get CursorClass(): string {
    switch (this.Tool) {
      case 'pan': return 'cur-pan';
      case 'pen': case 'shape': case 'connector': return 'cur-cross';
      case 'sticky': case 'image': return 'cur-copy';
      case 'text': return 'cur-text';
      case 'eraser': return 'cur-eraser';
      default: return '';
    }
  }

  public TrackItem(index: number, item: WhiteboardItem): string {
    return item.ID;
  }

  /** Left position of an item, honoring an in-flight move/resize transient. */
  public ItemX(item: WhiteboardItem): number {
    const t = this.transientBounds(item.ID);
    return t ? t.X : this.State.ItemBounds(item).X;
  }

  public ItemY(item: WhiteboardItem): number {
    const t = this.transientBounds(item.ID);
    return t ? t.Y : this.State.ItemBounds(item).Y;
  }

  public ItemW(item: WhiteboardItem): number | null {
    const t = this.transientBounds(item.ID);
    if (t) {
      return t.W;
    }
    if (item.Kind === 'shape' || item.Kind === 'highlight') {
      return item.W;
    }
    if (item.Kind === 'sticky') {
      return item.W ?? WHITEBOARD_DEFAULTS.StickyW;
    }
    if (item.Kind === 'image') {
      return item.W ?? WHITEBOARD_DEFAULTS.ImageW;
    }
    return null;
  }

  public ItemH(item: WhiteboardItem): number | null {
    const t = this.transientBounds(item.ID);
    if (t && (item.Kind === 'shape' || item.Kind === 'highlight')) {
      return t.H;
    }
    if (item.Kind === 'shape' || item.Kind === 'highlight') {
      return item.H;
    }
    return null;
  }

  public IsSelected(item: WhiteboardItem): boolean {
    return UUIDsEqual(this.State.SelectedID, item.ID);
  }

  public IsDragging(item: WhiteboardItem): boolean {
    return this.Interaction?.Type === 'move' && this.Interaction.ItemID === item.ID && this.Interaction.Moved;
  }

  /** 8 handles render on the selected, resizable item (mockup: selection chrome). */
  public ShowHandles(item: WhiteboardItem): boolean {
    return this.IsSelected(item)
      && (item.Kind === 'sticky' || item.Kind === 'shape' || item.Kind === 'image' || item.Kind === 'highlight');
  }

  public readonly Handles: ResizeHandle[] = ['nw', 'n', 'ne', 'e', 'se', 's', 'sw', 'w'];

  /** The drag ghost rectangle ("from here") at the moved item's original bounds. */
  public get DragGhost(): WhiteboardBounds | null {
    return this.Interaction?.Type === 'move' && this.Interaction.Moved ? this.Interaction.OrigBounds : null;
  }

  /** Live shape-create preview rectangle. */
  public get ShapePreview(): WhiteboardBounds | null {
    if (this.Interaction?.Type !== 'shape') {
      return null;
    }
    const s = this.Interaction;
    return {
      X: Math.min(s.StartX, s.CurX),
      Y: Math.min(s.StartY, s.CurY),
      W: Math.abs(s.CurX - s.StartX),
      H: Math.abs(s.CurY - s.StartY)
    };
  }

  public StickyRotation(item: WhiteboardStickyItem): string {
    return `rotate(${item.Rotation ?? 0}deg)`;
  }

  public StickyTintClass(item: WhiteboardStickyItem): string {
    if (item.Author === 'agent') {
      return 'sticky--sage';
    }
    return item.Tint === 'amber-light' ? 'sticky--amber2' : 'sticky--amber';
  }

  public HighlightTag(item: WhiteboardHighlightItem): string {
    return item.Label || `${item.Author === 'agent' ? this.AgentName : 'You'} highlighted`;
  }

  // ────────────────────────────────────────────── text styling

  /** Family key → CSS font stack ('sans' = null so the board's default font cascades). */
  private static readonly FontStacks: Record<WhiteboardFontFamily, string | null> = {
    sans: null,
    serif: 'Georgia, "Times New Roman", serif',
    mono: 'var(--mj-font-mono, ui-monospace, "SF Mono", Menlo, monospace)'
  };

  /** Inline font-size for a styled text/sticky item (null = the kind's CSS default). */
  public ItemFontSize(item: WhiteboardStickyItem | WhiteboardTextItem): string | null {
    return item.FontSize != null ? `${item.FontSize}px` : null;
  }

  /** Inline font-family stack for a styled text/sticky item (null = inherit). */
  public ItemFontFamily(item: WhiteboardStickyItem | WhiteboardTextItem): string | null {
    return item.FontFamily ? RealtimeWhiteboardBoardComponent.FontStacks[item.FontFamily] : null;
  }

  /** Inline font-weight for a styled text/sticky item (null = the kind's CSS default). */
  public ItemFontWeight(item: WhiteboardStickyItem | WhiteboardTextItem): string | null {
    return item.FontWeight != null ? `${item.FontWeight}` : null;
  }

  /**
   * Inline color for a USER text label. Agent labels keep their violet authorship
   * treatment from CSS — `Color` never overrides it.
   */
  public ItemTextColor(item: WhiteboardTextItem): string | null {
    return item.Author === 'user' && item.Color ? item.Color : null;
  }

  /**
   * Apply a toolbar style pick to the selected text/sticky item (the "restyle existing"
   * path — the toolbar emits `StyleSelection`, the host routes it here). No-op when
   * nothing applicable is selected; color only applies to user text labels.
   */
  public ApplyTextStyleToSelection(style: WhiteboardTextStyleEvent): void {
    const id = this.State.SelectedID;
    const item = id ? this.State.GetItem(id) : undefined;
    if (!id || !item || (item.Kind !== 'sticky' && item.Kind !== 'text')) {
      return;
    }
    const patch: WhiteboardItemPatch = {};
    if (style.FontSize !== undefined) {
      patch.FontSize = style.FontSize;
    }
    if (style.FontFamily !== undefined) {
      patch.FontFamily = style.FontFamily;
    }
    if (style.Bold !== undefined) {
      patch.FontWeight = style.Bold ? 700 : 400;
    }
    if (style.Color !== undefined && item.Kind === 'text') {
      patch.Color = style.Color;
    }
    if (Object.keys(patch).length > 0) {
      this.State.UpdateItem(id, patch, 'user');
    }
  }

  // ────────────────────────────────────────────── svg path builders

  /** Smoothed freehand path (quadratic curves through segment midpoints). */
  public InkPath(points: WhiteboardPoint[]): string {
    if (points.length === 0) {
      return '';
    }
    if (points.length < 3) {
      const last = points[points.length - 1];
      return `M ${points[0].X} ${points[0].Y} L ${last.X} ${last.Y}`;
    }
    let d = `M ${points[0].X} ${points[0].Y}`;
    for (let i = 1; i < points.length - 1; i++) {
      const midX = (points[i].X + points[i + 1].X) / 2;
      const midY = (points[i].Y + points[i + 1].Y) / 2;
      d += ` Q ${points[i].X} ${points[i].Y} ${midX} ${midY}`;
    }
    const last = points[points.length - 1];
    d += ` L ${last.X} ${last.Y}`;
    return d;
  }

  /** Curved connector path between resolved (edge-clipped) endpoints. */
  public ConnectorPath(conn: WhiteboardConnectorItem): string {
    const { from, to } = this.connectorEndpoints(conn);
    return this.curveBetween(from, to);
  }

  /** Two short arrowhead strokes at the connector's target end. */
  public ConnectorArrow(conn: WhiteboardConnectorItem): string {
    const { from, to } = this.connectorEndpoints(conn);
    return this.arrowAt(from, to);
  }

  public get PendingConnectorPath(): string {
    if (!this.PendingConnector) {
      return '';
    }
    const from = this.pendingFromPoint();
    return this.curveBetween(from, { X: this.PendingConnector.CurX, Y: this.PendingConnector.CurY });
  }

  public get LivePenPath(): string {
    return this.Interaction?.Type === 'pen' ? this.InkPath(this.Interaction.Points) : '';
  }

  private connectorEndpoints(conn: WhiteboardConnectorItem): { from: WhiteboardPoint; to: WhiteboardPoint } {
    let from = this.State.ResolveEndpoint(conn, 'from');
    let to = this.State.ResolveEndpoint(conn, 'to');
    // clip anchored endpoints to the referenced item's bounds edge
    const fromItem = conn.FromItemID ? this.State.GetItem(conn.FromItemID) : undefined;
    const toItem = conn.ToItemID ? this.State.GetItem(conn.ToItemID) : undefined;
    if (fromItem) {
      from = this.edgePoint(this.State.ItemBounds(fromItem), to);
    }
    if (toItem) {
      to = this.edgePoint(this.State.ItemBounds(toItem), from);
    }
    return { from, to };
  }

  /** Intersect the segment bounds-center → towards with the bounds rectangle edge. */
  private edgePoint(b: WhiteboardBounds, towards: WhiteboardPoint): WhiteboardPoint {
    const cx = b.X + b.W / 2;
    const cy = b.Y + b.H / 2;
    const dx = towards.X - cx;
    const dy = towards.Y - cy;
    if (dx === 0 && dy === 0) {
      return { X: cx, Y: cy };
    }
    const sx = dx !== 0 ? (b.W / 2) / Math.abs(dx) : Infinity;
    const sy = dy !== 0 ? (b.H / 2) / Math.abs(dy) : Infinity;
    const s = Math.min(sx, sy);
    return { X: cx + dx * s, Y: cy + dy * s };
  }

  private curveBetween(from: WhiteboardPoint, to: WhiteboardPoint): string {
    const dx = to.X - from.X;
    const dy = to.Y - from.Y;
    if (Math.abs(dy) >= Math.abs(dx)) {
      // vertical bias (matches the mockup's email→webinar curve)
      return `M ${from.X} ${from.Y} C ${from.X + dx * 0.08} ${from.Y + dy * 0.45}, ${to.X - dx * 0.08} ${to.Y - dy * 0.45}, ${to.X} ${to.Y}`;
    }
    return `M ${from.X} ${from.Y} C ${from.X + dx * 0.45} ${from.Y + dy * 0.08}, ${to.X - dx * 0.45} ${to.Y - dy * 0.08}, ${to.X} ${to.Y}`;
  }

  private arrowAt(from: WhiteboardPoint, to: WhiteboardPoint): string {
    const angle = Math.atan2(to.Y - from.Y, to.X - from.X);
    const len = 13;
    const spread = 0.46; // ~26°
    const a1 = angle + Math.PI - spread;
    const a2 = angle + Math.PI + spread;
    const p1 = { X: to.X + Math.cos(a1) * len, Y: to.Y + Math.sin(a1) * len };
    const p2 = { X: to.X + Math.cos(a2) * len, Y: to.Y + Math.sin(a2) * len };
    return `M ${to.X} ${to.Y} L ${p1.X.toFixed(1)} ${p1.Y.toFixed(1)} M ${to.X} ${to.Y} L ${p2.X.toFixed(1)} ${p2.Y.toFixed(1)}`;
  }

  // ────────────────────────────────────────────── pointer interactions

  public OnCanvasPointerDown(event: PointerEvent): void {
    if (event.button !== 0) {
      return;
    }
    if (this.ReadOnly) {
      // Pan stays available for read navigation; every other tool is inert.
      if (this.Tool === 'pan') {
        this.Interaction = { Type: 'pan', StartClientX: event.clientX, StartClientY: event.clientY, OrigPanX: this.PanX, OrigPanY: this.PanY };
      }
      return;
    }
    this.canvasRef?.nativeElement.focus();
    const p = this.toBoard(event);
    switch (this.Tool) {
      case 'select':
        this.State.Select(null);
        break;
      case 'pan':
        this.Interaction = { Type: 'pan', StartClientX: event.clientX, StartClientY: event.clientY, OrigPanX: this.PanX, OrigPanY: this.PanY };
        break;
      case 'pen':
        this.Interaction = { Type: 'pen', Points: [p] };
        break;
      case 'shape':
        this.Interaction = { Type: 'shape', StartX: p.X, StartY: p.Y, CurX: p.X, CurY: p.Y };
        break;
      case 'sticky':
        this.placeSticky(p);
        break;
      case 'text':
        this.placeText(p);
        break;
      case 'image':
        this.placeImage(p, 'pasted-image.png', null);
        break;
      case 'connector':
        this.connectorClick(null, p);
        break;
      case 'eraser':
        break;
    }
  }

  public OnItemPointerDown(event: PointerEvent, item: WhiteboardItem): void {
    if (this.ReadOnly) {
      return;
    }
    if (event.button !== 0) {
      return;
    }
    if (UUIDsEqual(this.EditingID, item.ID)) {
      event.stopPropagation();
      return;
    }
    switch (this.Tool) {
      case 'select': {
        event.stopPropagation();
        this.State.Select(item.ID);
        const p = this.toBoard(event);
        const bounds = this.State.ItemBounds(item);
        this.Interaction = { Type: 'move', ItemID: item.ID, StartX: p.X, StartY: p.Y, OrigBounds: bounds, DX: 0, DY: 0, Moved: false };
        break;
      }
      case 'eraser':
        event.stopPropagation();
        this.State.RemoveItem(item.ID, 'user');
        break;
      case 'connector': {
        event.stopPropagation();
        this.connectorClick(item.ID, this.toBoard(event));
        break;
      }
      default:
        // pen / shape / sticky / text / image gestures begin on the canvas — let it bubble
        break;
    }
  }

  public OnHandlePointerDown(event: PointerEvent, item: WhiteboardItem, handle: ResizeHandle): void {
    if (this.ReadOnly) {
      return;
    }
    if (event.button !== 0 || this.Tool !== 'select') {
      return;
    }
    event.stopPropagation();
    const p = this.toBoard(event);
    const bounds = this.State.ItemBounds(item);
    this.Interaction = { Type: 'resize', ItemID: item.ID, Handle: handle, StartX: p.X, StartY: p.Y, OrigBounds: bounds, CurBounds: { ...bounds } };
  }

  /** Click on a highlight region dismisses it (mockup: "click dismisses"). */
  public OnHighlightClick(event: MouseEvent, item: WhiteboardHighlightItem): void {
    event.stopPropagation();
    this.State.RemoveItem(item.ID, 'user');
  }

  @HostListener('window:pointermove', ['$event'])
  public OnWindowPointerMove(event: PointerEvent): void {
    if (!this.Interaction && !this.PendingConnector) {
      return;
    }
    const p = this.toBoard(event);
    if (this.PendingConnector) {
      this.PendingConnector.CurX = p.X;
      this.PendingConnector.CurY = p.Y;
    }
    const i = this.Interaction;
    if (!i) {
      return;
    }
    switch (i.Type) {
      case 'move': {
        i.DX = p.X - i.StartX;
        i.DY = p.Y - i.StartY;
        if (!i.Moved && Math.hypot(i.DX, i.DY) > 3) {
          i.Moved = true;
        }
        break;
      }
      case 'resize':
        i.CurBounds = this.resizeBounds(i.OrigBounds, i.Handle, p.X - i.StartX, p.Y - i.StartY);
        break;
      case 'pen': {
        const last = i.Points[i.Points.length - 1];
        if (Math.hypot(p.X - last.X, p.Y - last.Y) > 2.2) {
          i.Points.push(p);
        }
        break;
      }
      case 'shape':
        i.CurX = p.X;
        i.CurY = p.Y;
        break;
      case 'pan':
        this.PanX = i.OrigPanX + (event.clientX - i.StartClientX);
        this.PanY = i.OrigPanY + (event.clientY - i.StartClientY);
        break;
    }
  }

  @HostListener('window:pointerup')
  public OnWindowPointerUp(): void {
    const i = this.Interaction;
    if (!i) {
      return;
    }
    this.Interaction = null;
    switch (i.Type) {
      case 'move':
        if (i.Moved) {
          this.State.MoveItem(i.ItemID, i.OrigBounds.X + i.DX, i.OrigBounds.Y + i.DY, 'user');
        }
        break;
      case 'resize': {
        const item = this.State.GetItem(i.ItemID);
        if (item && (item.Kind === 'shape' || item.Kind === 'highlight')) {
          this.State.UpdateItem(i.ItemID, { X: i.CurBounds.X, Y: i.CurBounds.Y, W: i.CurBounds.W, H: i.CurBounds.H }, 'user');
        }
        else if (item && (item.Kind === 'sticky' || item.Kind === 'image')) {
          this.State.UpdateItem(i.ItemID, { X: i.CurBounds.X, Y: i.CurBounds.Y, W: i.CurBounds.W }, 'user');
        }
        break;
      }
      case 'pen':
        if (i.Points.length >= 2) {
          this.State.AddItem({ Kind: 'ink', Points: i.Points, Color: this.PenColor, StrokeWidth: this.PenWidth }, 'user');
        }
        break;
      case 'shape': {
        const r = {
          X: Math.min(i.StartX, i.CurX),
          Y: Math.min(i.StartY, i.CurY),
          W: Math.abs(i.CurX - i.StartX),
          H: Math.abs(i.CurY - i.StartY)
        };
        if (r.W >= 16 && r.H >= 16) {
          const item = this.State.AddItem(
            { Kind: 'shape', Shape: this.ShapeKind, X: r.X, Y: r.Y, W: Math.max(r.W, 60), H: Math.max(r.H, WHITEBOARD_DEFAULTS.ShapeMinH), Label: '' }, 'user');
          this.State.Select(item.ID);
          this.beginEdit(item.ID, true);
        }
        break;
      }
      case 'pan':
        break;
    }
  }

  public OnWheel(event: WheelEvent): void {
    event.preventDefault();
    if (event.ctrlKey || event.metaKey) {
      const factor = event.deltaY < 0 ? 1.1 : 1 / 1.1;
      this.zoomAt(this.clampZoom(this.Zoom * factor), event.clientX, event.clientY);
    }
    else {
      this.PanX -= event.deltaX;
      this.PanY -= event.deltaY;
    }
  }

  /** Paste an image from the clipboard onto the board (mockup: pasted-image card). */
  public OnPaste(event: ClipboardEvent): void {
    if (this.ReadOnly) {
      return;
    }
    const files = event.clipboardData?.files;
    if (!files || files.length === 0) {
      return;
    }
    for (let n = 0; n < files.length; n++) {
      const file = files[n];
      if (file.type.startsWith('image/')) {
        event.preventDefault();
        const center = this.viewportCenter();
        this.placeImage({ X: center.X - WHITEBOARD_DEFAULTS.ImageW / 2, Y: center.Y - WHITEBOARD_DEFAULTS.ImageH / 2 },
          file.name || 'pasted-image.png', URL.createObjectURL(file));
        return;
      }
    }
  }

  // ────────────────────────────────────────────── inline editing

  public BeginItemEdit(event: Event, item: WhiteboardItem): void {
    if (item.Kind !== 'sticky' && item.Kind !== 'text' && item.Kind !== 'shape') {
      return;
    }
    event.stopPropagation();
    this.beginEdit(item.ID, false);
  }

  public CommitEdit(value: string): void {
    const id = this.EditingID;
    if (!id) {
      return;
    }
    this.EditingID = null;
    const item = this.State.GetItem(id);
    if (!item) {
      return;
    }
    const text = value.trim();
    if (text.length === 0 && this.editIsNew && (item.Kind === 'sticky' || item.Kind === 'text')) {
      this.State.RemoveItem(id, 'user'); // abandoned placement
      return;
    }
    if (item.Kind === 'shape') {
      this.State.UpdateItem(id, { Label: text }, 'user');
    }
    else if (item.Kind === 'sticky' || item.Kind === 'text') {
      this.State.UpdateItem(id, { Text: text }, 'user');
    }
    this.editIsNew = false;
  }

  public OnEditKeydown(event: KeyboardEvent, value: string): void {
    event.stopPropagation();
    if (event.key === 'Enter' && !event.shiftKey) {
      event.preventDefault();
      this.CommitEdit(value);
    }
    else if (event.key === 'Escape') {
      event.preventDefault();
      this.CommitEdit(value);
    }
  }

  // ────────────────────────────────────────────── zoom / fit / minimap

  public ZoomIn(): void {
    const next = ZOOM_STEPS.find((z) => z > this.Zoom + 0.001);
    this.zoomCentered(next ?? ZOOM_STEPS[ZOOM_STEPS.length - 1]);
  }

  public ZoomOut(): void {
    const lower = [...ZOOM_STEPS].reverse().find((z) => z < this.Zoom - 0.001);
    this.zoomCentered(lower ?? ZOOM_STEPS[0]);
  }

  /** Fit all content into the viewport (25%–200%, 60px padding). */
  public FitToContent(): void {
    const bounds = this.State.ContentBounds();
    const el = this.canvasRef?.nativeElement;
    if (!bounds || !el || bounds.W === 0 || bounds.H === 0) {
      return;
    }
    const pad = 60;
    const zoom = this.clampZoom(Math.min((el.clientWidth - pad * 2) / bounds.W, (el.clientHeight - pad * 2) / bounds.H));
    this.Zoom = zoom;
    this.PanX = (el.clientWidth - bounds.W * zoom) / 2 - bounds.X * zoom;
    this.PanY = (el.clientHeight - bounds.H * zoom) / 2 - bounds.Y * zoom;
  }

  public ToggleMinimap(): void {
    this.MinimapOpen = !this.MinimapOpen;
  }

  /** Cancel any in-flight transient gesture (tool switch, Esc). */
  public CancelTransient(): void {
    this.Interaction = null;
    this.PendingConnector = null;
  }

  // minimap render model
  public get MinimapViewBox(): string {
    const world = this.minimapWorld();
    return `${world.X} ${world.Y} ${world.W} ${world.H}`;
  }

  public get MinimapItems(): { X: number; Y: number; W: number; H: number; Agent: boolean }[] {
    return this.State.Items
      .filter((i) => i.Kind !== 'highlight')
      .map((i) => {
        const b = this.State.ItemBounds(i);
        return { X: b.X, Y: b.Y, W: Math.max(b.W, 8), H: Math.max(b.H, 8), Agent: i.Author === 'agent' };
      });
  }

  public get MinimapViewport(): WhiteboardBounds {
    const el = this.canvasRef?.nativeElement;
    const w = el ? el.clientWidth : 0;
    const h = el ? el.clientHeight : 0;
    return { X: -this.PanX / this.Zoom, Y: -this.PanY / this.Zoom, W: w / this.Zoom, H: h / this.Zoom };
  }

  private minimapWorld(): WhiteboardBounds {
    const content = this.State.ContentBounds();
    const vp = this.MinimapViewport;
    const minX = Math.min(content?.X ?? vp.X, vp.X) - 40;
    const minY = Math.min(content?.Y ?? vp.Y, vp.Y) - 40;
    const maxX = Math.max(content ? content.X + content.W : vp.X + vp.W, vp.X + vp.W) + 40;
    const maxY = Math.max(content ? content.Y + content.H : vp.Y + vp.H, vp.Y + vp.H) + 40;
    return { X: minX, Y: minY, W: Math.max(maxX - minX, 1), H: Math.max(maxY - minY, 1) };
  }

  // ────────────────────────────────────────────── internals

  private toBoard(event: { clientX: number; clientY: number }): WhiteboardPoint {
    const el = this.canvasRef?.nativeElement;
    const rect = el ? el.getBoundingClientRect() : { left: 0, top: 0 };
    return {
      X: (event.clientX - rect.left - this.PanX) / this.Zoom,
      Y: (event.clientY - rect.top - this.PanY) / this.Zoom
    };
  }

  private viewportCenter(): WhiteboardPoint {
    const el = this.canvasRef?.nativeElement;
    const w = el ? el.clientWidth : 0;
    const h = el ? el.clientHeight : 0;
    return { X: (w / 2 - this.PanX) / this.Zoom, Y: (h / 2 - this.PanY) / this.Zoom };
  }

  private clampZoom(z: number): number {
    return Math.min(2, Math.max(0.25, z));
  }

  private zoomCentered(next: number): void {
    const el = this.canvasRef?.nativeElement;
    if (!el) {
      this.Zoom = next;
      return;
    }
    const rect = el.getBoundingClientRect();
    this.zoomAt(next, rect.left + rect.width / 2, rect.top + rect.height / 2);
  }

  private zoomAt(next: number, clientX: number, clientY: number): void {
    const el = this.canvasRef?.nativeElement;
    if (!el) {
      this.Zoom = next;
      return;
    }
    const rect = el.getBoundingClientRect();
    const px = clientX - rect.left;
    const py = clientY - rect.top;
    const bx = (px - this.PanX) / this.Zoom;
    const by = (py - this.PanY) / this.Zoom;
    this.Zoom = next;
    this.PanX = px - bx * next;
    this.PanY = py - by * next;
  }

  private resizeBounds(orig: WhiteboardBounds, handle: ResizeHandle, dx: number, dy: number): WhiteboardBounds {
    let { X, Y, W, H } = orig;
    if (handle.includes('w')) {
      X = orig.X + dx;
      W = orig.W - dx;
    }
    if (handle.includes('e')) {
      W = orig.W + dx;
    }
    if (handle.includes('n')) {
      Y = orig.Y + dy;
      H = orig.H - dy;
    }
    if (handle.includes('s')) {
      H = orig.H + dy;
    }
    const minSize = 24;
    if (W < minSize) {
      if (handle.includes('w')) {
        X -= minSize - W;
      }
      W = minSize;
    }
    if (H < minSize) {
      if (handle.includes('n')) {
        Y -= minSize - H;
      }
      H = minSize;
    }
    return { X, Y, W, H };
  }

  private transientBounds(itemId: string): WhiteboardBounds | null {
    const i = this.Interaction;
    if (i?.Type === 'move' && i.ItemID === itemId && i.Moved) {
      return { X: i.OrigBounds.X + i.DX, Y: i.OrigBounds.Y + i.DY, W: i.OrigBounds.W, H: i.OrigBounds.H };
    }
    if (i?.Type === 'resize' && i.ItemID === itemId) {
      return i.CurBounds;
    }
    return null;
  }

  private placeSticky(p: WhiteboardPoint): void {
    const tint = this.userStickyCount % 2 === 0 ? 'amber' : 'amber-light';
    const rotation = this.userStickyCount % 2 === 0 ? -1 : 0.8;
    this.userStickyCount++;
    const item = this.State.AddItem(
      { Kind: 'sticky', X: p.X - WHITEBOARD_DEFAULTS.StickyW / 2, Y: p.Y - 24, Text: '', Tint: tint, Rotation: rotation }, 'user');
    this.State.Select(item.ID);
    this.beginEdit(item.ID, true);
  }

  private placeText(p: WhiteboardPoint): void {
    // Stamp only non-default style choices so an untouched flyout keeps the default look
    // (and the compact perception payloads stay free of noise fields).
    const item = this.State.AddItem({
      Kind: 'text',
      X: p.X,
      Y: p.Y - 9,
      Text: '',
      FontSize: this.TextSize !== 12 ? this.TextSize : undefined,
      FontFamily: this.TextFamily !== 'sans' ? this.TextFamily : undefined,
      FontWeight: this.TextBold ? undefined : 400,
      Color: this.TextColor ?? undefined
    }, 'user');
    this.State.Select(item.ID);
    this.beginEdit(item.ID, true);
  }

  private placeImage(p: WhiteboardPoint, name: string, url: string | null): void {
    const item = this.State.AddItem({ Kind: 'image', X: p.X, Y: p.Y, Name: name, Url: url }, 'user');
    this.State.Select(item.ID);
  }

  private beginEdit(id: string, isNew: boolean): void {
    this.EditingID = id;
    this.editIsNew = isNew;
    this.pendingFocus = true;
  }

  private connectorClick(itemId: string | null, p: WhiteboardPoint): void {
    if (!this.PendingConnector) {
      this.PendingConnector = {
        FromItemID: itemId,
        FromPoint: itemId ? null : p,
        CurX: p.X,
        CurY: p.Y
      };
      return;
    }
    const pending = this.PendingConnector;
    this.PendingConnector = null;
    if (itemId && pending.FromItemID === itemId) {
      return; // self-connector — ignore
    }
    this.State.AddItem({
      Kind: 'connector',
      FromItemID: pending.FromItemID,
      ToItemID: itemId,
      FromPoint: pending.FromPoint,
      ToPoint: itemId ? null : p
    }, 'user');
  }

  private pendingFromPoint(): WhiteboardPoint {
    const pc = this.PendingConnector;
    if (!pc) {
      return { X: 0, Y: 0 };
    }
    if (pc.FromItemID) {
      const item = this.State.GetItem(pc.FromItemID);
      if (item) {
        const b = this.State.ItemBounds(item);
        return { X: b.X + b.W / 2, Y: b.Y + b.H / 2 };
      }
    }
    return pc.FromPoint ?? { X: 0, Y: 0 };
  }
}
