import {
  AfterViewChecked, ChangeDetectorRef, Component, ElementRef, EventEmitter, HostListener,
  Input, OnDestroy, OnInit, Output, ViewChild, inject
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { UUIDsEqual } from '@memberjunction/global';
import { Subscription } from 'rxjs';
import { MarkdownModule } from '@memberjunction/ng-markdown';
import { CodeEditorModule } from '@memberjunction/ng-code-editor';
import {
  BuildResizeCommitPatch, IsResizableKind,
  WHITEBOARD_DEFAULTS, WhiteboardBounds, WhiteboardConnectorItem, WhiteboardFontFamily,
  WhiteboardHighlightItem, WhiteboardHtmlItem, WhiteboardImageItem, WhiteboardInkItem,
  WhiteboardItem, WhiteboardItemPatch, WhiteboardMarkdownItem, WhiteboardPageInfo,
  WhiteboardPoint, WhiteboardShapeItem, WhiteboardState, WhiteboardStickyItem, WhiteboardTextItem
} from './whiteboard-state';
import { WhiteboardTool, WhiteboardTextStyleEvent, WHITEBOARD_PEN_COLORS } from './whiteboard-toolbar.component';
import {
  EvaluateWidgetInteractionMessage, EvaluateWidgetSubmitMessage,
  WHITEBOARD_WIDGET_INTERACTION_MAX_CHARS, WHITEBOARD_WIDGET_SUBMIT_MAX_CHARS,
  WhiteboardWidgetInteractionEvent, WhiteboardWidgetSubmitEvent, WhiteboardWidgetSubmittingEventArgs
} from './whiteboard-widget-bridge';
import { WhiteboardWidgetSrcdocPipe } from './whiteboard-srcdoc.pipe';
import {
  BuildWhiteboardContextMenu, BuildWhiteboardPageContextMenu,
  WhiteboardContextMenuAction, WhiteboardContextMenuActionID
} from './whiteboard-context-menu';
import { RealtimeWhiteboardPagesComponent, WhiteboardPageChipContextMenuEvent } from './whiteboard-pages.component';

/** The agent presence cursor state (input-driven; the host animates it to mutation points). */
export interface WhiteboardAgentPresence {
  Active: boolean;
  X: number;
  Y: number;
  Label: string;
}

/** Item kinds whose content can be committed through an in-board editor. */
export type WhiteboardEditableContentKind = 'sticky' | 'text' | 'shape' | 'markdown' | 'html';

/**
 * BEFORE-event args for the board/host `ContentApplying` output — raised when an
 * in-board editor commit (inline sticky/text/shape edit, or the markdown/HTML rich
 * editor's Apply/Done) is about to write the draft into the state engine. Handlers run
 * synchronously; set {@link Cancel} to `true` to discard the commit (the item keeps its
 * previous content and `ContentApplied` never fires). Handlers may also rewrite
 * {@link Content} / {@link Title} — the edited values are what gets applied.
 */
export interface WhiteboardContentApplyingEventArgs {
  /** The target item's ID. */
  ItemID: string;
  /** The target item's kind (decides which field the content lands in). */
  Kind: WhiteboardEditableContentKind;
  /** The committed content: Text (sticky/text), Label (shape), Markdown or Html source. */
  Content: string;
  /** HTML widgets only: the committed header title ('' clears it). */
  Title?: string;
  /** Set to `true` (in a synchronous handler) to discard the commit. */
  Cancel: boolean;
}

/** AFTER-event args for the board/host `ContentApplied` output — the commit applied. */
export interface WhiteboardContentAppliedEventArgs {
  /** The updated item's ID. */
  ItemID: string;
  /** The updated item's kind. */
  Kind: WhiteboardEditableContentKind;
  /** The content that was applied. */
  Content: string;
  /** HTML widgets only: the applied header title. */
  Title?: string;
}

type ResizeHandle = 'nw' | 'n' | 'ne' | 'e' | 'se' | 's' | 'sw' | 'w';

type BoardInteraction =
  | { Type: 'move'; ItemID: string; StartX: number; StartY: number; OrigBounds: WhiteboardBounds; DX: number; DY: number; Moved: boolean; Group: boolean }
  | { Type: 'resize'; ItemID: string; Handle: ResizeHandle; StartX: number; StartY: number; OrigBounds: WhiteboardBounds; CurBounds: WhiteboardBounds }
  | { Type: 'pen'; Points: WhiteboardPoint[] }
  | { Type: 'shape'; StartX: number; StartY: number; CurX: number; CurY: number }
  | { Type: 'marquee'; StartX: number; StartY: number; CurX: number; CurY: number; Additive: boolean }
  | { Type: 'pan'; StartClientX: number; StartClientY: number; OrigPanX: number; OrigPanY: number };

interface PendingConnector {
  FromItemID: string | null;
  FromPoint: WhiteboardPoint | null;
  CurX: number;
  CurY: number;
}

/** Transient state of the in-board rich-content editor panel (markdown / html items). */
interface RichEditorState {
  ItemID: string;
  Kind: 'markdown' | 'html';
  /** The in-flight source draft (committed only on Apply / Done). */
  Draft: string;
  /** HTML widgets only: the in-flight header title draft. */
  TitleDraft: string;
  /** Markdown only: show the rendered preview instead of the source editor. */
  Preview: boolean;
}

/**
 * Starter document placed by the HTML-widget tool (user click-place) — a one-question
 * quiz that demos the `MJWhiteboard.submit` input bridge: the Submit button posts the
 * picked answer to the host, which surfaces it to the session agent as a context note.
 * (Hardcoded colors are fine here: this is an isolated sandboxed document — the app's
 * design tokens cannot reach inside the opaque-origin frame.)
 */
export const WHITEBOARD_WIDGET_STARTER_HTML = `<!doctype html>
<html>
<head>
<style>
  body { font-family: system-ui, sans-serif; margin: 14px; color: #1f2937; }
  h3 { margin: 0 0 6px; }
  label { display: block; margin: 4px 0; }
  button { margin-top: 8px; padding: 5px 12px; border: 1px solid #cbd5e1; border-radius: 6px; background: #f1f5f9; cursor: pointer; }
  .hint { margin-top: 8px; color: #6b7280; font-size: 12px; }
</style>
</head>
<body>
<h3>Quick quiz</h3>
<p>Which planet is closest to the sun?</p>
<label><input type="radio" name="q" value="Mercury"> Mercury</label>
<label><input type="radio" name="q" value="Venus"> Venus</label>
<label><input type="radio" name="q" value="Mars"> Mars</label>
<button id="go">Submit answer</button>
<p class="hint">Submitting sends your answer to the agent via MJWhiteboard.submit.</p>
<script>
  document.getElementById('go').addEventListener('click', function () {
    var picked = document.querySelector('input[name="q"]:checked');
    MJWhiteboard.submit({ question: 'closest planet to the sun', answer: picked ? picked.value : null });
  });
</script>
</body>
</html>`;

/** Starter markdown placed by the markdown-panel tool (user click-place). */
const STARTER_MARKDOWN = '## New note\n\n- point one';

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
  imports: [CommonModule, MarkdownModule, CodeEditorModule, RealtimeWhiteboardPagesComponent, WhiteboardWidgetSrcdocPipe],
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
  /**
   * Cancelable BEFORE event: a sandboxed HTML widget called `MJWhiteboard.submit(data)`
   * and the payload passed validation (marker + tracked source window + size cap).
   * Handlers run synchronously — set `Cancel = true` on the args to drop the submission
   * ({@link WidgetSubmitted} then never fires).
   */
  @Output() WidgetSubmitting = new EventEmitter<WhiteboardWidgetSubmittingEventArgs>();
  /**
   * AFTER event: a validated widget submission was accepted (not canceled). Integration
   * layers forward this to their agent/automation runtime — e.g. MJ's realtime channel
   * plugin surfaces it to the live agent as a `[whiteboard]` context note.
   */
  @Output() WidgetSubmitted = new EventEmitter<WhiteboardWidgetSubmitEvent>();
  /**
   * AMBIENT widget telemetry: the injected recorder observed passive form activity
   * (clicks / changes / typing / focus) inside a sandboxed HTML widget — no widget-authored
   * script involved. The batch was validated (marker + tracked source + size cap + shape)
   * and pre-summarized into one compact human line. Integration layers forward it to their
   * agent runtime as low-priority background context (MJ's channel plugin throttles per
   * widget and frames it as a do-not-respond `[whiteboard]` note).
   */
  @Output() WidgetInteraction = new EventEmitter<WhiteboardWidgetInteractionEvent>();
  /**
   * Cancelable BEFORE event: an in-board editor commit (inline sticky/text/shape edit or
   * the markdown/HTML rich editor's Apply/Done) is about to write to the state engine.
   * Set `Cancel = true` synchronously to discard the commit; handlers may also rewrite
   * the args' `Content` / `Title`.
   */
  @Output() ContentApplying = new EventEmitter<WhiteboardContentApplyingEventArgs>();
  /** AFTER event: an editor commit applied to the state engine. */
  @Output() ContentApplied = new EventEmitter<WhiteboardContentAppliedEventArgs>();

  @ViewChild('canvas') private canvasRef?: ElementRef<HTMLDivElement>;
  /** The page strip — the context menu's "Rename page" routes to its inline editor. */
  @ViewChild(RealtimeWhiteboardPagesComponent) private pagesStrip?: RealtimeWhiteboardPagesComponent;

  // viewport
  public PanX = 0;
  public PanY = 0;
  public Zoom = 0.9;
  public MinimapOpen = false;

  // transient interaction state
  public Interaction: BoardInteraction | null = null;
  public PendingConnector: PendingConnector | null = null;
  public EditingID: string | null = null;
  /** The rich-content editor panel state (markdown / html items), or null when closed. */
  public RichEditor: RichEditorState | null = null;
  /** The open right-click context menu (canvas-relative position + model), or null. */
  public ContextMenu: {
    Left: number;
    Top: number;
    /** Board-coordinate click point — "add … here" placement target. */
    Point: WhiteboardPoint;
    /** Target item, or null for the empty-canvas / page-chip menus. */
    ItemID: string | null;
    /** Target page (a right-clicked page chip), or null for item/canvas menus. */
    PageID: string | null;
    Actions: WhiteboardContextMenuAction[];
  } | null = null;
  private editIsNew = false;
  private pendingFocus = false;
  private userStickyCount = 0;

  /** Agent items that just popped in (drive the .pop-in violet flash). */
  public PopInIDs = new Set<string>();
  private popInTimers: ReturnType<typeof setTimeout>[] = [];

  private _tool: WhiteboardTool = 'select';
  private changedSub?: Subscription;
  private cdr = inject(ChangeDetectorRef);

  /** Whether the single window 'message' listener (the widget input bridge) is attached. */
  private widgetMessageListenerAttached = false;

  ngOnInit(): void {
    this.changedSub = this.State.Changed$.subscribe((change) => {
      if (change.Op === 'add' && change.Author === 'agent') {
        this.PopInIDs.add(change.ItemID);
        this.popInTimers.push(setTimeout(() => {
          this.PopInIDs.delete(change.ItemID);
          this.cdr.markForCheck();
        }, POP_IN_MS));
      }
      // NOTE: HTML-widget srcdoc payloads need no invalidation here — the
      // `wbWidgetSrcdoc` pipe is view-scoped (rebuilt per mount, memoized per source),
      // so journal ops can neither leave a re-mounted frame a stale document nor
      // force-reload a still-mounted widget whose Html didn't change.
      // close the rich editor when its target item no longer exists (erased / undone)
      if (this.RichEditor && !this.State.GetItem(this.RichEditor.ItemID)) {
        this.RichEditor = null;
      }
      // close the context menu when its target item / page no longer exists
      if (this.ContextMenu?.ItemID && !this.State.GetItem(this.ContextMenu.ItemID)) {
        this.ContextMenu = null;
      }
      if (this.ContextMenu?.PageID && !this.State.FindPage(this.ContextMenu.PageID)) {
        this.ContextMenu = null;
      }
      this.syncWidgetMessageListener();
      this.cdr.markForCheck();
    });
    this.syncWidgetMessageListener();
  }

  ngOnDestroy(): void {
    this.changedSub?.unsubscribe();
    for (const t of this.popInTimers) {
      clearTimeout(t);
    }
    if (this.widgetMessageListenerAttached) {
      window.removeEventListener('message', this.onWindowMessage);
      this.widgetMessageListenerAttached = false;
    }
  }

  ngAfterViewChecked(): void {
    if (this.pendingFocus) {
      this.pendingFocus = false;
      const editor = this.canvasRef?.nativeElement.querySelector<HTMLElement>('.wb-edit');
      editor?.focus();
    }
    this.observeCanvasSize();
  }

  // ── Hidden-host layout recovery ─────────────────────────────────────────────
  //
  // The board is often CREATED inside a display:none tab pane (a review session's
  // Whiteboard tab, a collapsed surface panel): the canvas measures 0×0, so the
  // viewport-lazy culling computes everything as off-screen and the board renders
  // BLANK until some interaction forces a re-measure. A ResizeObserver watches for
  // the first REAL layout: it re-runs change detection (fixing the culling) and —
  // when the viewport is still untouched — frames the content via FitToContent so a
  // reviewed board opens centered instead of wherever pan (0,0) happens to land.

  /** Observer driving {@link onCanvasResize}; created once the canvas element exists. */
  private canvasResizeObserver: ResizeObserver | null = null;
  /** True once the canvas has had a real (non-zero) layout. */
  private hadRealLayout = false;
  /** True once the user pans/zooms — the auto-fit must never fight a chosen viewport. */
  private viewportTouched = false;

  /** Attaches the ResizeObserver exactly once (no-op where ResizeObserver is unavailable). */
  private observeCanvasSize(): void {
    const el = this.canvasRef?.nativeElement;
    if (!el || this.canvasResizeObserver || typeof ResizeObserver === 'undefined') {
      return;
    }
    this.canvasResizeObserver = new ResizeObserver(() => this.onCanvasResize());
    this.canvasResizeObserver.observe(el);
    this.onCanvasResize();
  }

  /** First non-zero layout: recompute culling and (if untouched) frame the content. */
  private onCanvasResize(): void {
    const el = this.canvasRef?.nativeElement;
    if (!el || el.clientWidth === 0 || el.clientHeight === 0 || this.hadRealLayout) {
      return;
    }
    this.hadRealLayout = true;
    if (!this.viewportTouched) {
      this.FitToContent();
    }
    this.cdr.markForCheck();
  }

  // ────────────────────────────────────────────── render-model getters

  public get BoxItems(): (WhiteboardStickyItem | WhiteboardShapeItem | WhiteboardTextItem | WhiteboardImageItem | WhiteboardMarkdownItem | WhiteboardHtmlItem)[] {
    return this.State.Items.filter(
      (i): i is WhiteboardStickyItem | WhiteboardShapeItem | WhiteboardTextItem | WhiteboardImageItem | WhiteboardMarkdownItem | WhiteboardHtmlItem =>
        i.Kind === 'sticky' || i.Kind === 'shape' || i.Kind === 'text' || i.Kind === 'image'
        || i.Kind === 'markdown' || i.Kind === 'html');
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
      case 'sticky': case 'image': case 'markdown': case 'html': return 'cur-copy';
      case 'text': return 'cur-text';
      case 'eraser': return 'cur-eraser';
      default: return '';
    }
  }

  public TrackItem(index: number, item: WhiteboardItem): string {
    return item.ID;
  }

  /**
   * Explicit wrap width for a text label (resize / tool w) — null lets the CSS max-width
   * wrap. Honors an in-flight RESIZE transient so the live preview tracks the handle drag
   * (a move transient is deliberately ignored: its W is the rough bounds ESTIMATE, and
   * stamping it inline would re-wrap an unsized label mid-drag).
   */
  public TextWrapWidth(item: WhiteboardItem): number | null {
    if (item.Kind !== 'text') {
      return null;
    }
    if (this.Interaction?.Type === 'resize' && this.Interaction.ItemID === item.ID) {
      return this.Interaction.CurBounds.W;
    }
    return item.W ?? null;
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
    if (item.Kind === 'markdown' || item.Kind === 'html') {
      return item.W;
    }
    return null;
  }

  public ItemH(item: WhiteboardItem): number | null {
    const t = this.transientBounds(item.ID);
    if (t && (item.Kind === 'shape' || item.Kind === 'highlight' || item.Kind === 'html')) {
      return t.H;
    }
    if (item.Kind === 'shape' || item.Kind === 'highlight' || item.Kind === 'html') {
      return item.H;
    }
    return null;
  }

  /** A markdown panel's optional max height (its rendered height stays content-driven). */
  public MarkdownMaxHeight(item: WhiteboardMarkdownItem): number | null {
    return item.H ?? null;
  }

  /** Whether the item is part of the current (single OR multi) selection. */
  public IsSelected(item: WhiteboardItem): boolean {
    return this.State.IsItemSelected(item.ID);
  }

  /** Dragging visuals: the grabbed item, plus every other member during a GROUP drag. */
  public IsDragging(item: WhiteboardItem): boolean {
    const i = this.Interaction;
    if (i?.Type !== 'move' || !i.Moved) {
      return false;
    }
    return UUIDsEqual(i.ItemID, item.ID) || (i.Group && this.State.IsItemSelected(item.ID));
  }

  /**
   * 8 handles render on the selected, resizable item (gate: {@link IsResizableKind}) —
   * but only for a SINGLE selection; a multi-selection shows the outline treatment only.
   */
  public ShowHandles(item: WhiteboardItem): boolean {
    return this.IsSelected(item) && this.State.SelectedIDs.length === 1 && IsResizableKind(item.Kind);
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

  /** Live marquee (rubber-band) selection rectangle, or null when none is in flight. */
  public get MarqueeRect(): WhiteboardBounds | null {
    if (this.Interaction?.Type !== 'marquee') {
      return null;
    }
    const m = this.Interaction;
    const rect: WhiteboardBounds = {
      X: Math.min(m.StartX, m.CurX),
      Y: Math.min(m.StartY, m.CurY),
      W: Math.abs(m.CurX - m.StartX),
      H: Math.abs(m.CurY - m.StartY)
    };
    return rect.W >= 3 || rect.H >= 3 ? rect : null;
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
        // marquee (rubber-band) selection starts on empty canvas; a tiny drag (a plain
        // click) clears the selection at pointerup unless shift is held (additive)
        this.Interaction = { Type: 'marquee', StartX: p.X, StartY: p.Y, CurX: p.X, CurY: p.Y, Additive: event.shiftKey };
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
      case 'markdown':
        this.placeMarkdown(p);
        break;
      case 'html':
        this.placeHtml(p);
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
        if (event.shiftKey) {
          // shift-click toggles membership in the multi-selection (no drag from it)
          this.State.ToggleSelect(item.ID);
          break;
        }
        // pointerdown on an already multi-selected item keeps the selection and drags
        // the whole GROUP; a click without movement collapses to that item at pointerup
        const group = this.State.IsItemSelected(item.ID) && this.State.SelectedIDs.length > 1;
        if (!group) {
          this.State.Select(item.ID);
        }
        const p = this.toBoard(event);
        const bounds = this.State.ItemBounds(item);
        this.Interaction = { Type: 'move', ItemID: item.ID, StartX: p.X, StartY: p.Y, OrigBounds: bounds, DX: 0, DY: 0, Moved: false, Group: group };
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
      case 'marquee':
        i.CurX = p.X;
        i.CurY = p.Y;
        break;
      case 'pan':
        this.viewportTouched = true; // a chosen viewport — the first-layout auto-fit must not fight it
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
          if (i.Group) {
            // group drag: every selected item moves by the same delta — ONE undo step
            this.State.MoveSelectedBy(i.DX, i.DY, 'user');
          }
          else {
            this.State.MoveItem(i.ItemID, i.OrigBounds.X + i.DX, i.OrigBounds.Y + i.DY, 'user');
          }
        }
        else if (i.Group) {
          // click (no drag) on a multi-selected item collapses the selection to it
          this.State.Select(i.ItemID);
        }
        break;
      case 'marquee': {
        const rect: WhiteboardBounds = {
          X: Math.min(i.StartX, i.CurX),
          Y: Math.min(i.StartY, i.CurY),
          W: Math.abs(i.CurX - i.StartX),
          H: Math.abs(i.CurY - i.StartY)
        };
        if (rect.W < 3 && rect.H < 3) {
          // a plain click on empty canvas clears the selection (shift-click keeps it)
          if (!i.Additive) {
            this.State.Select(null);
          }
          break;
        }
        const hits = this.State.ItemsIntersecting(rect).map((it) => it.ID);
        this.State.SelectMany(i.Additive ? [...this.State.SelectedIDs, ...hits] : hits);
        break;
      }
      case 'resize': {
        const item = this.State.GetItem(i.ItemID);
        // per-kind commit: full-box kinds take X/Y/W/H; content-driven-height kinds
        // (sticky/text/image/markdown) take X/Y/W only — see BuildResizeCommitPatch.
        const patch = item ? BuildResizeCommitPatch(item.Kind, i.CurBounds) : null;
        if (patch) {
          this.State.UpdateItem(i.ItemID, patch, 'user');
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
          if (item) {
            this.State.Select(item.ID);
            this.beginEdit(item.ID, true);
          }
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

  /**
   * Commit the inline editor's value to the edited sticky / text / shape item. Routes
   * through the {@link ContentApplying} (cancelable) / {@link ContentApplied} event pair;
   * an empty commit on a JUST-PLACED sticky/text abandons the placement instead (the item
   * is removed — that path raises the engine's remove events, not the content pair).
   */
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
      this.applyContent(id, 'shape', text);
    }
    else if (item.Kind === 'sticky' || item.Kind === 'text') {
      this.applyContent(id, item.Kind, text);
    }
    this.editIsNew = false;
  }

  /**
   * Run one editor commit through the {@link ContentApplying} / {@link ContentApplied}
   * pair: raise the cancelable BEFORE event, apply the (possibly handler-edited) content
   * via the state engine when not canceled, and raise the AFTER event when the engine
   * applied it (an engine-level `ItemUpdating$` veto also suppresses the AFTER event).
   */
  private applyContent(itemId: string, kind: WhiteboardEditableContentKind, content: string, title?: string): void {
    const applying: WhiteboardContentApplyingEventArgs = { ItemID: itemId, Kind: kind, Content: content, Title: title, Cancel: false };
    this.ContentApplying.emit(applying);
    if (applying.Cancel) {
      return;
    }
    let patch: WhiteboardItemPatch;
    switch (kind) {
      case 'shape': patch = { Label: applying.Content }; break;
      case 'markdown': patch = { Markdown: applying.Content }; break;
      case 'html': patch = { Html: applying.Content, Title: applying.Title }; break;
      default: patch = { Text: applying.Content }; break; // sticky / text
    }
    if (this.State.UpdateItem(itemId, patch, 'user')) {
      this.ContentApplied.emit({ ItemID: itemId, Kind: kind, Content: applying.Content, Title: applying.Title });
    }
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

  // ────────────────────────────────────────────── rich widgets (markdown / html)
  // The sandboxed iframe's `srcdoc` is produced by the view-scoped `wbWidgetSrcdoc`
  // pipe (see whiteboard-srcdoc.pipe.ts for the per-mount lifecycle contract and the
  // full security rationale for bypassing Angular's sanitizer into the sandbox).

  // ────────────────────────────────────────────── widget input bridge (MJWhiteboard.submit)

  /** Attach/detach the SINGLE window 'message' listener so it only runs while widgets exist. */
  private syncWidgetMessageListener(): void {
    const hasWidgets = this.State.Items.some((i) => i.Kind === 'html');
    if (hasWidgets && !this.widgetMessageListenerAttached) {
      window.addEventListener('message', this.onWindowMessage);
      this.widgetMessageListenerAttached = true;
    }
    else if (!hasWidgets && this.widgetMessageListenerAttached) {
      window.removeEventListener('message', this.onWindowMessage);
      this.widgetMessageListenerAttached = false;
    }
  }

  /**
   * The widget input bridge's host-side listener. The sandboxed frames have OPAQUE
   * origins (their helper posts with `'*'`), so validation happens HERE: the payload
   * must carry the bridge marker AND `event.source` must be the contentWindow of one of
   * this board's tracked widget iframes — anything else is dropped. Accepted payloads
   * are JSON-capped and surfaced through the {@link WidgetSubmitting} (cancelable) /
   * {@link WidgetSubmitted} event pair.
   */
  private onWindowMessage = (event: MessageEvent): void => {
    const widget = this.resolveWidgetFromSource(event.source);
    const outcome = EvaluateWidgetSubmitMessage(event.data, widget);
    if (outcome.Kind === 'submit') {
      const submitting: WhiteboardWidgetSubmittingEventArgs = { Event: outcome.Event, Cancel: false };
      this.WidgetSubmitting.emit(submitting);
      if (!submitting.Cancel) {
        this.WidgetSubmitted.emit(outcome.Event);
      }
      this.cdr.markForCheck();
      return;
    }
    if (outcome.Reason === 'oversize') {
      console.warn(`Whiteboard widget submit dropped: payload exceeds ${WHITEBOARD_WIDGET_SUBMIT_MAX_CHARS} chars.`);
    }
    else if (outcome.Reason === 'unknown-source') {
      console.warn('Whiteboard widget submit dropped: message source is not a tracked widget frame.');
    }
    else {
      // 'not-submit' — may be the injected recorder's AMBIENT interaction batch instead.
      this.handleInteractionMessage(event.data, widget);
    }
  };

  /**
   * Second leg of the message listener: evaluate a non-submit message against the ambient
   * interaction contract and surface accepted batches through {@link WidgetInteraction}.
   * `'not-interaction'` is unrelated postMessage traffic — ignored silently, like the
   * submit path's `'not-submit'`.
   */
  private handleInteractionMessage(messageData: unknown, widget: { ItemID: string; Title?: string } | null): void {
    const outcome = EvaluateWidgetInteractionMessage(messageData, widget);
    if (outcome.Kind === 'interaction') {
      this.WidgetInteraction.emit(outcome.Event);
      this.cdr.markForCheck();
      return;
    }
    if (outcome.Reason === 'oversize') {
      console.warn(`Whiteboard widget interaction dropped: batch exceeds ${WHITEBOARD_WIDGET_INTERACTION_MAX_CHARS} chars.`);
    }
    else if (outcome.Reason === 'unknown-source') {
      console.warn('Whiteboard widget interaction dropped: message source is not a tracked widget frame.');
    }
    else if (outcome.Reason === 'bad-shape') {
      console.warn('Whiteboard widget interaction dropped: events batch is malformed.');
    }
  }

  /** Resolve a message `event.source` to the tracked widget iframe (window → item) it belongs to. */
  private resolveWidgetFromSource(source: MessageEventSource | null): { ItemID: string; Title?: string } | null {
    if (!source) {
      return null;
    }
    const frames = this.canvasRef?.nativeElement.querySelectorAll<HTMLIFrameElement>('iframe.html-card__frame[data-item-id]');
    if (!frames) {
      return null;
    }
    for (const frame of Array.from(frames)) {
      if (frame.contentWindow === source) {
        const id = frame.dataset['itemId'];
        const item = id ? this.State.GetItem(id) : undefined;
        if (item && item.Kind === 'html') {
          return { ItemID: item.ID, Title: item.Title };
        }
      }
    }
    return null;
  }

  /**
   * Cheap "on-screen-ish" check that gates iframe instantiation for HTML widgets: only
   * widgets within (or near) the current viewport get a live sandboxed frame; the rest
   * render a static placeholder until panned/zoomed into view. Re-entering view re-creates
   * the frame (any internal widget state resets — acceptable for board decorations).
   */
  public IsNearViewport(item: WhiteboardItem): boolean {
    const el = this.canvasRef?.nativeElement;
    if (!el || el.clientWidth === 0 || el.clientHeight === 0) {
      // Before the first layout — or while the host pane is display:none (an
      // unfocused tab) — there is no real viewport to cull against: render rather
      // than blank out (culling resumes on the first real layout).
      return true;
    }
    const margin = 320;
    const b = this.State.ItemBounds(item);
    const vx = -this.PanX / this.Zoom;
    const vy = -this.PanY / this.Zoom;
    const vw = el.clientWidth / this.Zoom;
    const vh = el.clientHeight / this.Zoom;
    return b.X < vx + vw + margin && b.X + b.W > vx - margin
      && b.Y < vy + vh + margin && b.Y + b.H > vy - margin;
  }

  /** Header title for an HTML widget. */
  public HtmlTitle(item: WhiteboardHtmlItem): string {
    return item.Title || 'HTML widget';
  }

  /** Open the rich editor for a markdown panel / HTML widget (dblclick or header edit). */
  public BeginRichEdit(event: Event, item: WhiteboardItem): void {
    if (this.ReadOnly || (item.Kind !== 'markdown' && item.Kind !== 'html')) {
      return;
    }
    event.stopPropagation();
    this.openRichEditor(item);
  }

  /** Delete affordance on the HTML widget header (the user removing their own widget). */
  public RemoveItemClick(event: Event, item: WhiteboardItem): void {
    if (this.ReadOnly) {
      return;
    }
    event.stopPropagation();
    this.State.RemoveItem(item.ID, 'user');
  }

  /** Markdown editor: flip between the source editor and the rendered preview. */
  public RichEditorSetPreview(preview: boolean): void {
    if (this.RichEditor) {
      this.RichEditor.Preview = preview;
    }
  }

  public OnRichEditorDraftChange(value: string): void {
    if (this.RichEditor) {
      this.RichEditor.Draft = value;
    }
  }

  public OnRichEditorTitleChange(value: string): void {
    if (this.RichEditor) {
      this.RichEditor.TitleDraft = value;
    }
  }

  /**
   * Commit the draft to the item (ONE update = one undo step) and keep the panel open.
   * Routes through the {@link ContentApplying} (cancelable) / {@link ContentApplied} pair.
   */
  public RichEditorApply(): void {
    const editor = this.RichEditor;
    if (!editor || !this.State.GetItem(editor.ItemID)) {
      return;
    }
    if (editor.Kind === 'markdown') {
      this.applyContent(editor.ItemID, 'markdown', editor.Draft);
    }
    else {
      // empty title clears the header label (UpdateItem skips undefined, so pass '' to clear)
      this.applyContent(editor.ItemID, 'html', editor.Draft, editor.TitleDraft.trim());
    }
  }

  /** Commit the draft and close the editor panel. */
  public RichEditorDone(): void {
    this.RichEditorApply();
    this.RichEditor = null;
  }

  /** Close the editor, discarding any uncommitted draft changes. */
  public RichEditorCancel(): void {
    this.RichEditor = null;
  }

  /** Esc inside the editor panel closes it; keys must not leak to the board shortcuts. */
  public OnRichEditorKeydown(event: KeyboardEvent): void {
    event.stopPropagation();
    if (event.key === 'Escape') {
      event.preventDefault();
      this.RichEditorCancel();
    }
  }

  private openRichEditor(item: WhiteboardMarkdownItem | WhiteboardHtmlItem): void {
    this.RichEditor = item.Kind === 'markdown'
      ? { ItemID: item.ID, Kind: 'markdown', Draft: item.Markdown, TitleDraft: '', Preview: false }
      : { ItemID: item.ID, Kind: 'html', Draft: item.Html, TitleDraft: item.Title ?? '', Preview: false };
  }

  // ────────────────────────────────────────────── context menu (right-click)

  /** Right-click on empty canvas → the "add … here" menu (suppresses the native menu). */
  public OnCanvasContextMenu(event: MouseEvent): void {
    if (this.ReadOnly) {
      return; // no board menu in read-only — the native browser menu stays available
    }
    event.preventDefault();
    this.openContextMenu(event, null);
  }

  /** Right-click on a board item → the item action menu (selects the item first). */
  public OnItemContextMenu(event: MouseEvent, item: WhiteboardItem): void {
    if (this.ReadOnly) {
      return;
    }
    event.preventDefault();
    event.stopPropagation();
    if (item.Kind !== 'highlight') {
      this.State.Select(item.ID);
    }
    this.openContextMenu(event, item);
  }

  /** Dispatch one picked context-menu action, then close the menu. */
  public OnContextMenuAction(actionId: WhiteboardContextMenuActionID): void {
    const menu = this.ContextMenu;
    this.ContextMenu = null;
    if (!menu) {
      return;
    }
    const item = menu.ItemID ? this.State.GetItem(menu.ItemID) : undefined;
    switch (actionId) {
      case 'edit':
        // same paths as dblclick: inline edit for sticky/text/shape, rich editor for md/html
        if (item && (item.Kind === 'sticky' || item.Kind === 'text' || item.Kind === 'shape')) {
          this.State.Select(item.ID);
          this.beginEdit(item.ID, false);
        }
        else if (item && (item.Kind === 'markdown' || item.Kind === 'html')) {
          this.openRichEditor(item);
        }
        break;
      case 'restyle':
        // open the toolbar's text-style flyout with the item selected — style picks
        // restyle the selection through the existing StyleSelection path
        if (item) {
          this.State.Select(item.ID);
          this.ToolChangeRequest.emit('text');
        }
        break;
      case 'duplicate':
        if (item) {
          const copy = this.State.DuplicateItem(item.ID, 'user');
          if (copy) {
            this.State.Select(copy.ID);
          }
        }
        break;
      case 'bring-front':
        if (item) {
          this.State.BringToFront(item.ID, 'user');
        }
        break;
      case 'send-back':
        if (item) {
          this.State.SendToBack(item.ID, 'user');
        }
        break;
      case 'delete':
        if (item) {
          this.State.RemoveItem(item.ID, 'user');
        }
        break;
      case 'add-sticky':
        this.placeSticky(menu.Point);
        break;
      case 'add-text':
        this.placeText(menu.Point);
        break;
      case 'add-markdown':
        this.placeMarkdown(menu.Point);
        break;
      case 'add-html':
        this.placeHtml(menu.Point);
        break;
      case 'add-page':
        // same path as the strip's "+" — an auto-named page the engine switches to
        this.State.AddPage(undefined, 'user');
        break;
      case 'page-rename':
        if (menu.PageID) {
          this.pagesStrip?.BeginRename(menu.PageID);
        }
        break;
      case 'page-delete':
        if (menu.PageID) {
          this.State.RemovePage(menu.PageID, 'user'); // engine guards the last page
        }
        break;
    }
  }

  /** Click-away closes the menu (the menu root stops pointerdown propagation for itself). */
  @HostListener('document:pointerdown')
  public CloseContextMenu(): void {
    if (this.ContextMenu) {
      this.ContextMenu = null;
    }
  }

  /**
   * Right-click on a PAGE CHIP in the page strip (forwarded by the strip's
   * `ChipContextMenu` output) → the page action menu: Rename (routes back into the
   * strip's inline-rename editor) and Delete (offered only when more than one page
   * exists — the engine's last-page guard). Never opens in ReadOnly.
   */
  public OnPageChipContextMenu(payload: WhiteboardPageChipContextMenuEvent): void {
    if (this.ReadOnly) {
      return;
    }
    const actions = BuildWhiteboardPageContextMenu(payload.Page, {
      CanDelete: this.State.Pages.length > 1,
      ReadOnly: this.ReadOnly
    });
    if (actions.length === 0) {
      return;
    }
    this.showContextMenu(payload.Event, actions, null, payload.Page.ID);
  }

  private openContextMenu(event: MouseEvent, item: WhiteboardItem | null): void {
    this.showContextMenu(event, BuildWhiteboardContextMenu(item), item ? item.ID : null, null);
  }

  /** Position + open the shared context-menu panel for any target (item / canvas / page chip). */
  private showContextMenu(event: MouseEvent, actions: WhiteboardContextMenuAction[], itemId: string | null, pageId: string | null): void {
    const el = this.canvasRef?.nativeElement;
    const rect = el ? el.getBoundingClientRect() : { left: 0, top: 0, width: 0, height: 0 };
    // keep the menu inside the canvas (estimate: ~200px wide, ~31px per row + padding)
    const menuW = 200;
    const menuH = actions.length * 31 + 12;
    const left = Math.max(4, Math.min(event.clientX - rect.left, Math.max(menuW, rect.width) - menuW));
    const top = Math.max(4, Math.min(event.clientY - rect.top, Math.max(menuH, rect.height) - menuH));
    this.ContextMenu = {
      Left: left,
      Top: top,
      Point: this.toBoard(event),
      ItemID: itemId,
      PageID: pageId,
      Actions: actions
    };
  }

  // ────────────────────────────────────────────── zoom / fit / minimap

  public ZoomIn(): void {
    const next = ZOOM_STEPS.find((z) => z > this.Zoom + 0.001);
    this.zoomCentered(next ?? ZOOM_STEPS[ZOOM_STEPS.length - 1]);
  }

  /**
   * Continuous zoom by a multiplicative factor at the viewport center — the
   * hold-to-zoom tick path (the zoom cluster emits ~3.5% factors every 50 ms while a
   * +/− button is held). Clamped to the same 25%–200% limits as the stepped zoom.
   */
  public ZoomByFactor(factor: number): void {
    if (!Number.isFinite(factor) || factor <= 0) {
      return;
    }
    this.zoomCentered(this.clampZoom(this.Zoom * factor));
  }

  public ZoomOut(): void {
    const lower = [...ZOOM_STEPS].reverse().find((z) => z < this.Zoom - 0.001);
    this.zoomCentered(lower ?? ZOOM_STEPS[0]);
  }

  /** Fit all content into the viewport (25%–200%, 60px padding). */
  public FitToContent(): void {
    const bounds = this.State.ContentBounds();
    const el = this.canvasRef?.nativeElement;
    if (!bounds || !el || bounds.W === 0 || bounds.H === 0 || el.clientWidth === 0 || el.clientHeight === 0) {
      return; // a hidden (0×0) host cannot be fit against — wait for a real layout
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

  /** Cancel any in-flight transient gesture (tool switch, Esc) — incl. the rich editor + context menu. */
  public CancelTransient(): void {
    this.Interaction = null;
    this.PendingConnector = null;
    this.RichEditor = null;
    this.ContextMenu = null;
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
    this.viewportTouched = true; // user-driven zoom — disable the first-layout auto-fit
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
    if (i?.Type === 'move' && i.Moved) {
      if (i.ItemID === itemId) {
        return { X: i.OrigBounds.X + i.DX, Y: i.OrigBounds.Y + i.DY, W: i.OrigBounds.W, H: i.OrigBounds.H };
      }
      // GROUP drag: every other selected member previews at the same live delta
      // (state is untouched mid-drag, so ItemBounds still reports the original spot)
      if (i.Group && this.State.IsItemSelected(itemId)) {
        const item = this.State.GetItem(itemId);
        if (item) {
          const b = this.State.ItemBounds(item);
          return { X: b.X + i.DX, Y: b.Y + i.DY, W: b.W, H: b.H };
        }
      }
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
    if (!item) {
      return; // canceled via ItemAdding
    }
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
    if (!item) {
      return; // canceled via ItemAdding
    }
    this.State.Select(item.ID);
    this.beginEdit(item.ID, true);
  }

  private placeImage(p: WhiteboardPoint, name: string, url: string | null): void {
    const item = this.State.AddItem({ Kind: 'image', X: p.X, Y: p.Y, Name: name, Url: url }, 'user');
    if (item) {
      this.State.Select(item.ID);
    }
  }

  /** Click-place a starter markdown panel and open its editor. */
  private placeMarkdown(p: WhiteboardPoint): void {
    const item = this.State.AddItem({
      Kind: 'markdown',
      X: p.X - WHITEBOARD_DEFAULTS.MarkdownW / 2,
      Y: p.Y - 20,
      W: WHITEBOARD_DEFAULTS.MarkdownW,
      Markdown: STARTER_MARKDOWN
    }, 'user') as WhiteboardMarkdownItem | null;
    if (!item) {
      return; // canceled via ItemAdding
    }
    this.State.Select(item.ID);
    this.openRichEditor(item);
  }

  /** Click-place a starter HTML widget (sandboxed) and open its editor. */
  private placeHtml(p: WhiteboardPoint): void {
    const item = this.State.AddItem({
      Kind: 'html',
      X: p.X - WHITEBOARD_DEFAULTS.HtmlW / 2,
      Y: p.Y - 20,
      W: WHITEBOARD_DEFAULTS.HtmlW,
      H: WHITEBOARD_DEFAULTS.HtmlH,
      Html: WHITEBOARD_WIDGET_STARTER_HTML,
      Title: 'New widget'
    }, 'user') as WhiteboardHtmlItem | null;
    if (!item) {
      return; // canceled via ItemAdding
    }
    this.State.Select(item.ID);
    this.openRichEditor(item);
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
