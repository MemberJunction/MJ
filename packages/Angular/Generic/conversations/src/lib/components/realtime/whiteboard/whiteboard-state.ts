import { Observable, Subject } from 'rxjs';

/**
 * LIVE WHITEBOARD — typed board model + state engine.
 *
 * This file is intentionally Angular-free: it is the single mutation API used by BOTH the
 * user-facing board tools (pen, stickies, shapes, …) and the agent's channel tools
 * (`Whiteboard_AddNote`, `Whiteboard_DrawConnector`, …, see `whiteboard-tools.ts`).
 *
 * Perception model (per plans/ai-agent-sessions.md → "Interactive Channels"):
 *  - every mutation appends to a compact change journal and emits on {@link WhiteboardState.Changed$};
 *  - {@link WhiteboardState.BuildSceneDelta} coalesces the journal since a token into ONE delta
 *    (multiple moves of one item → one `moved` entry) with replace-current-state semantics;
 *  - {@link WhiteboardState.BuildSceneSummary} produces the full compact scene the
 *    "What the agent sees" popover renders;
 *  - {@link WhiteboardState.ToJSON} / {@link WhiteboardState.FromJSON} persist the channel's
 *    state of record (session artifact on AIAgentSessionChannel).
 */

/** Who authored a board item / mutation. The violet treatment is RESERVED for `'agent'`. */
export type WhiteboardAuthor = 'user' | 'agent';

/** The discriminant for the {@link WhiteboardItem} union. */
export type WhiteboardItemKind = 'sticky' | 'shape' | 'ink' | 'text' | 'image' | 'connector' | 'highlight';

/** Shape geometry of a {@link WhiteboardShapeItem}. */
export type WhiteboardShapeKind = 'rect' | 'ellipse' | 'diamond';

/** Visual tint of a USER sticky (agent stickies always render violet, regardless of tint). */
export type WhiteboardStickyTint = 'amber' | 'amber-light';

/**
 * Curated font-size steps for text labels and sticky notes. The toolbar's text-style flyout
 * and the agent's `fontSize` tool params both restrict to these values.
 */
export const WHITEBOARD_FONT_SIZES: readonly number[] = [12, 14, 18, 24, 32];

/**
 * Font family choices for text labels / stickies. The keys are mapped to token-friendly
 * font stacks in the board CSS (`wb-font-serif`, `wb-font-mono`; sans is the default).
 */
export type WhiteboardFontFamily = 'sans' | 'serif' | 'mono';

/** Font weights for text labels / stickies (regular or bold). */
export type WhiteboardFontWeight = 400 | 700;

/** A point in board (content) coordinates. */
export interface WhiteboardPoint {
  X: number;
  Y: number;
}

/** Fields shared by every board item. */
export interface WhiteboardItemBase {
  /** Stable item id (e.g. `sticky-3`) — referenced by connectors, deltas and agent tools. */
  ID: string;
  /** Who placed the item. Drives the ownership chrome (chips / violet vs slate-amber). */
  Author: WhiteboardAuthor;
  /** Render order (higher renders on top). Assigned by the engine. */
  Z: number;
}

/** A sticky note. */
export interface WhiteboardStickyItem extends WhiteboardItemBase {
  Kind: 'sticky';
  X: number;
  Y: number;
  /** Width in px; defaults to {@link WHITEBOARD_DEFAULTS.StickyW} when omitted. */
  W?: number;
  Text: string;
  /** User-palette tint; ignored for agent stickies (always violet). */
  Tint?: WhiteboardStickyTint;
  /** Slight playful tilt, in degrees. */
  Rotation?: number;
  /** Curated font size (see {@link WHITEBOARD_FONT_SIZES}); omitted = the CSS default. */
  FontSize?: number;
  /** Font family key (mapped to token-friendly stacks in CSS); omitted = sans. */
  FontFamily?: WhiteboardFontFamily;
  /** Font weight; omitted = the kind's CSS default. */
  FontWeight?: WhiteboardFontWeight;
}

/** A drawn shape box (rect / ellipse / diamond) with an optional label + sub-label. */
export interface WhiteboardShapeItem extends WhiteboardItemBase {
  Kind: 'shape';
  Shape: WhiteboardShapeKind;
  X: number;
  Y: number;
  W: number;
  H: number;
  Label: string;
  Sub?: string;
}

/** A free-floating text label. */
export interface WhiteboardTextItem extends WhiteboardItemBase {
  Kind: 'text';
  X: number;
  Y: number;
  Text: string;
  /** Wrap width in px — text wraps at this width. Omitted = wrap at the default max width. */
  W?: number;
  /** Curated font size (see {@link WHITEBOARD_FONT_SIZES}); omitted = the CSS default. */
  FontSize?: number;
  /** Font family key (mapped to token-friendly stacks in CSS); omitted = sans. */
  FontFamily?: WhiteboardFontFamily;
  /** Font weight; omitted = the kind's CSS default. */
  FontWeight?: WhiteboardFontWeight;
  /**
   * Text color from the USER pen palette. Violet is reserved for the agent's ownership
   * styling (enforced in the user UI — the palette never offers violet); agent text gets
   * its violet from the Author treatment, never from this field.
   */
  Color?: string;
}

/** A pasted / inserted image card. `Url` is a runtime object URL (not persisted as pixels). */
export interface WhiteboardImageItem extends WhiteboardItemBase {
  Kind: 'image';
  X: number;
  Y: number;
  /** Width in px; defaults to {@link WHITEBOARD_DEFAULTS.ImageW}. */
  W?: number;
  Name: string;
  Url?: string | null;
}

/** A freehand ink stroke (polyline in board coordinates, smoothed at render time). */
export interface WhiteboardInkItem extends WhiteboardItemBase {
  Kind: 'ink';
  Points: WhiteboardPoint[];
  /** Stroke color. The user palette NEVER includes violet — violet ink is the agent's. */
  Color: string;
  StrokeWidth: number;
}

/**
 * A connector between two endpoints. Each endpoint references an item by ID when attached;
 * when the referenced item is removed (or was never set) the endpoint falls back to the
 * absolute `…Point` coordinate.
 */
export interface WhiteboardConnectorItem extends WhiteboardItemBase {
  Kind: 'connector';
  FromItemID?: string | null;
  ToItemID?: string | null;
  FromPoint?: WhiteboardPoint | null;
  ToPoint?: WhiteboardPoint | null;
}

/** A pulsing highlight region ("pointing without touching") — dismissed by clicking it. */
export interface WhiteboardHighlightItem extends WhiteboardItemBase {
  Kind: 'highlight';
  X: number;
  Y: number;
  W: number;
  H: number;
  Label?: string;
}

/** Discriminated union of everything that can live on the board. */
export type WhiteboardItem =
  | WhiteboardStickyItem
  | WhiteboardShapeItem
  | WhiteboardTextItem
  | WhiteboardImageItem
  | WhiteboardInkItem
  | WhiteboardConnectorItem
  | WhiteboardHighlightItem;

/** Distributive Omit that preserves the discriminated union. */
type DistributiveOmit<T, K extends PropertyKey> = T extends unknown ? Omit<T, K> : never;

/** What callers pass to {@link WhiteboardState.AddItem} — the engine stamps ID / Z / Author. */
export type WhiteboardItemInput = DistributiveOmit<WhiteboardItem, 'ID' | 'Z' | 'Author'>;

/** Patchable fields for {@link WhiteboardState.UpdateItem} (kind/identity fields excluded). */
export interface WhiteboardItemPatch {
  X?: number;
  Y?: number;
  W?: number;
  H?: number;
  Text?: string;
  Label?: string;
  Sub?: string;
  Name?: string;
  Url?: string | null;
  Color?: string;
  StrokeWidth?: number;
  Points?: WhiteboardPoint[];
  Tint?: WhiteboardStickyTint;
  Rotation?: number;
  FontSize?: number;
  FontFamily?: WhiteboardFontFamily;
  FontWeight?: WhiteboardFontWeight;
  Shape?: WhiteboardShapeKind;
  FromItemID?: string | null;
  ToItemID?: string | null;
  FromPoint?: WhiteboardPoint | null;
  ToPoint?: WhiteboardPoint | null;
}

/** Mutation kinds carried on {@link WhiteboardChange} and in the journal. */
export type WhiteboardChangeOp = 'add' | 'update' | 'move' | 'remove' | 'replace';

/**
 * One coalesce-able change notification, emitted on {@link WhiteboardState.Changed$}
 * after every mutation. `'replace'` means "the whole scene was swapped" (undo / redo /
 * FromJSON) — consumers should re-read the full state.
 */
export interface WhiteboardChange {
  Op: WhiteboardChangeOp;
  /** Empty string for `'replace'` ops. */
  ItemID: string;
  Author: WhiteboardAuthor;
  /** Human fragment for toasts / activity ("added a sticky note"). */
  SummaryFragment: string;
  /** Monotonic sequence number — also the delta token currency. */
  Seq: number;
}

/** Compact, model-facing representation of one item inside deltas / summaries. */
export interface WhiteboardCompactItem {
  id: string;
  type: WhiteboardItemKind;
  author: WhiteboardAuthor;
  x?: number;
  y?: number;
  w?: number;
  h?: number;
  text?: string;
  shape?: WhiteboardShapeKind;
  name?: string;
  from?: string | WhiteboardPoint | null;
  to?: string | WhiteboardPoint | null;
  points?: number;
  fontSize?: number;
  fontFamily?: WhiteboardFontFamily;
  bold?: boolean;
  color?: string;
}

/**
 * The coalesced scene delta fed into the live agent context ("What the agent sees").
 * Replace-current-state semantics: each entry is the item's CURRENT state, not an edit log.
 * When `reset` is true the `items` array replaces the agent's entire view of the board
 * (emitted after undo/redo/load, or when the journal no longer reaches the caller's token).
 */
export interface WhiteboardSceneDelta {
  op: 'scene-delta';
  seq: number;
  added: WhiteboardCompactItem[];
  moved: { id: string; x: number; y: number }[];
  updated: WhiteboardCompactItem[];
  removed: string[];
  reset?: boolean;
  items?: WhiteboardCompactItem[];
  summary: string;
}

/** Full compact scene snapshot (popover stats + delta-reset payloads). */
export interface WhiteboardSceneSummary {
  op: 'scene-summary';
  seq: number;
  counts: {
    total: number;
    user: number;
    agent: number;
    byKind: Partial<Record<WhiteboardItemKind, number>>;
  };
  items: WhiteboardCompactItem[];
  summary: string;
}

/** Axis-aligned bounds of an item, in board coordinates. */
export interface WhiteboardBounds {
  X: number;
  Y: number;
  W: number;
  H: number;
}

/** Render-time default dimensions for items whose size is content-driven. */
export const WHITEBOARD_DEFAULTS = {
  StickyW: 172,
  StickyH: 96,
  ImageW: 198,
  ImageH: 134,
  TextW: 132,
  TextH: 18,
  ShapeMinH: 56
} as const;

/** Truncate long item text for summary fragments. */
function clip(text: string, max = 42): string {
  const t = (text || '').replace(/\s+/g, ' ').trim();
  return t.length > max ? `${t.slice(0, max).trimEnd()}…` : t;
}

interface JournalEntry {
  Seq: number;
  Op: WhiteboardChangeOp;
  ItemID: string;
}

/** Serialized shape produced by {@link WhiteboardState.ToJSON}. */
interface WhiteboardStateJSON {
  version: 1;
  seq: number;
  idCounter: number;
  zCounter: number;
  items: WhiteboardItem[];
}

/**
 * The whiteboard engine: items + ordered render list, single selection, snapshot-based
 * undo/redo (one entry per user gesture or per agent tool call via {@link RunBatch}),
 * change journal + coalesced scene deltas, and JSON persistence.
 */
export class WhiteboardState {
  private static readonly UndoMax = 100;
  private static readonly JournalMax = 1000;

  private items = new Map<string, WhiteboardItem>();
  private idCounter = 0;
  private zCounter = 0;
  private seq = 0;

  private undoStack: WhiteboardStateJSON[] = [];
  private redoStack: WhiteboardStateJSON[] = [];
  private batchDepth = 0;

  private journal: JournalEntry[] = [];
  /** Per-item snapshot of "did this item exist at journal-trim time" is not needed because
   * trimming forces reset semantics for tokens older than the journal window. */
  private journalTrimmedBeforeSeq = 0;

  private changed = new Subject<WhiteboardChange>();
  /** Fires after every mutation (including undo/redo `'replace'` events). */
  public readonly Changed$: Observable<WhiteboardChange> = this.changed.asObservable();

  /** The single selected item's ID, or null. Selection is UI state — not persisted. */
  public SelectedID: string | null = null;

  // ────────────────────────────────────────────── reads

  /** All items in render order (ascending Z). */
  public get Items(): WhiteboardItem[] {
    return Array.from(this.items.values()).sort((a, b) => a.Z - b.Z);
  }

  /** Current sequence number — use as the `sinceToken` for the next {@link BuildSceneDelta}. */
  public get CurrentSeq(): number {
    return this.seq;
  }

  /** Look up one item by ID. */
  public GetItem(id: string): WhiteboardItem | undefined {
    return this.items.get(id);
  }

  /** Count of "elements" as the status footer reports them (highlights are transient, excluded). */
  public get ElementCount(): number {
    return this.Items.filter((i) => i.Kind !== 'highlight').length;
  }

  /** Elements by author (highlights excluded, same basis as {@link ElementCount}). */
  public CountByAuthor(author: WhiteboardAuthor): number {
    return this.Items.filter((i) => i.Kind !== 'highlight' && i.Author === author).length;
  }

  public get CanUndo(): boolean {
    return this.undoStack.length > 0;
  }

  public get CanRedo(): boolean {
    return this.redoStack.length > 0;
  }

  // ────────────────────────────────────────────── geometry

  /** Axis-aligned bounds for any item (estimates for content-sized kinds). */
  public ItemBounds(item: WhiteboardItem): WhiteboardBounds {
    switch (item.Kind) {
      case 'sticky':
        return { X: item.X, Y: item.Y, W: item.W ?? WHITEBOARD_DEFAULTS.StickyW, H: WHITEBOARD_DEFAULTS.StickyH };
      case 'shape':
        return { X: item.X, Y: item.Y, W: item.W, H: item.H };
      case 'text': {
        // estimate scales with the chosen font size (the CSS default renders ~12px);
        // an explicit wrap width (item.W) wins over the single-line estimate
        const scale = item.FontSize ? item.FontSize / 12 : 1;
        return {
          X: item.X,
          Y: item.Y,
          W: item.W ?? Math.round(WHITEBOARD_DEFAULTS.TextW * scale),
          H: Math.round(WHITEBOARD_DEFAULTS.TextH * scale)
        };
      }
      case 'image':
        return { X: item.X, Y: item.Y, W: item.W ?? WHITEBOARD_DEFAULTS.ImageW, H: WHITEBOARD_DEFAULTS.ImageH };
      case 'highlight':
        return { X: item.X, Y: item.Y, W: item.W, H: item.H };
      case 'ink': {
        return WhiteboardState.pointsBounds(item.Points, item.StrokeWidth);
      }
      case 'connector': {
        const from = this.ResolveEndpoint(item, 'from');
        const to = this.ResolveEndpoint(item, 'to');
        return WhiteboardState.pointsBounds([from, to], 2);
      }
    }
  }

  private static pointsBounds(points: WhiteboardPoint[], pad: number): WhiteboardBounds {
    if (points.length === 0) {
      return { X: 0, Y: 0, W: 0, H: 0 };
    }
    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
    for (const p of points) {
      minX = Math.min(minX, p.X);
      minY = Math.min(minY, p.Y);
      maxX = Math.max(maxX, p.X);
      maxY = Math.max(maxY, p.Y);
    }
    return { X: minX - pad, Y: minY - pad, W: maxX - minX + pad * 2, H: maxY - minY + pad * 2 };
  }

  /** Bounding box of all items (null when the board is empty). Powers fit-to-content + minimap. */
  public ContentBounds(): WhiteboardBounds | null {
    const all = this.Items;
    if (all.length === 0) {
      return null;
    }
    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
    for (const item of all) {
      const b = this.ItemBounds(item);
      minX = Math.min(minX, b.X);
      minY = Math.min(minY, b.Y);
      maxX = Math.max(maxX, b.X + b.W);
      maxY = Math.max(maxY, b.Y + b.H);
    }
    return { X: minX, Y: minY, W: maxX - minX, H: maxY - minY };
  }

  /**
   * Resolve one connector endpoint: anchored to the referenced item's bounds-center when the
   * item still exists, otherwise the absolute fallback point (floating endpoint).
   */
  public ResolveEndpoint(conn: WhiteboardConnectorItem, end: 'from' | 'to'): WhiteboardPoint {
    const refId = end === 'from' ? conn.FromItemID : conn.ToItemID;
    const fallback = end === 'from' ? conn.FromPoint : conn.ToPoint;
    if (refId) {
      const target = this.items.get(refId);
      if (target) {
        const b = this.ItemBounds(target);
        return { X: b.X + b.W / 2, Y: b.Y + b.H / 2 };
      }
    }
    return fallback ?? { X: 0, Y: 0 };
  }

  // ────────────────────────────────────────────── selection

  /** Set (or clear) the single selection. */
  public Select(id: string | null): void {
    this.SelectedID = id != null && this.items.has(id) ? id : null;
  }

  // ────────────────────────────────────────────── mutations

  /** Add an item; the engine stamps ID, Z and Author and emits one change. */
  public AddItem(input: WhiteboardItemInput, author: WhiteboardAuthor): WhiteboardItem {
    this.beforeMutate();
    const item = { ...input, ID: this.nextId(input.Kind), Z: ++this.zCounter, Author: author } as WhiteboardItem;
    this.items.set(item.ID, item);
    this.record('add', item.ID, author, `added ${WhiteboardState.describe(item)}`);
    return item;
  }

  /** Patch an item's mutable fields. Returns false when the ID is unknown. */
  public UpdateItem(id: string, patch: WhiteboardItemPatch, author: WhiteboardAuthor): boolean {
    const item = this.items.get(id);
    if (!item) {
      return false;
    }
    this.beforeMutate();
    const target = item as WhiteboardItemBase & WhiteboardItemPatch;
    for (const [key, value] of Object.entries(patch)) {
      if (value !== undefined) {
        (target as Record<string, typeof value>)[key] = value;
      }
    }
    this.record('update', id, author, `updated ${WhiteboardState.describe(item)}`);
    return true;
  }

  /**
   * Move an item to an absolute board position. Positioned kinds move their origin; ink
   * strokes translate every point; connectors translate their floating endpoints.
   */
  public MoveItem(id: string, x: number, y: number, author: WhiteboardAuthor): boolean {
    const item = this.items.get(id);
    if (!item) {
      return false;
    }
    this.beforeMutate();
    const bounds = this.ItemBounds(item);
    const dx = x - bounds.X;
    const dy = y - bounds.Y;
    if (item.Kind === 'ink') {
      item.Points = item.Points.map((p) => ({ X: p.X + dx, Y: p.Y + dy }));
    }
    else if (item.Kind === 'connector') {
      if (item.FromPoint) {
        item.FromPoint = { X: item.FromPoint.X + dx, Y: item.FromPoint.Y + dy };
      }
      if (item.ToPoint) {
        item.ToPoint = { X: item.ToPoint.X + dx, Y: item.ToPoint.Y + dy };
      }
    }
    else {
      item.X = x;
      item.Y = y;
    }
    this.record('move', id, author, `moved ${WhiteboardState.describe(item)}`);
    return true;
  }

  /**
   * Remove an item. Connectors that referenced it survive: their endpoint freezes to the
   * removed item's last center (the floating-endpoint fallback).
   */
  public RemoveItem(id: string, author: WhiteboardAuthor): boolean {
    const item = this.items.get(id);
    if (!item) {
      return false;
    }
    this.beforeMutate();
    // Freeze any connector endpoints anchored to the item being removed.
    const center = (() => {
      const b = this.ItemBounds(item);
      return { X: b.X + b.W / 2, Y: b.Y + b.H / 2 };
    })();
    for (const other of this.items.values()) {
      if (other.Kind === 'connector') {
        if (other.FromItemID === id) {
          other.FromItemID = null;
          other.FromPoint = { ...center };
        }
        if (other.ToItemID === id) {
          other.ToItemID = null;
          other.ToPoint = { ...center };
        }
      }
    }
    this.items.delete(id);
    if (this.SelectedID === id) {
      this.SelectedID = null;
    }
    this.record('remove', id, author, `removed ${WhiteboardState.describe(item)}`);
    return true;
  }

  /** Convenience: add a pulsing highlight region (agent "pointing without touching"). */
  public Highlight(x: number, y: number, w: number, h: number, label: string | undefined, author: WhiteboardAuthor): WhiteboardHighlightItem {
    return this.AddItem({ Kind: 'highlight', X: x, Y: y, W: w, H: h, Label: label }, author) as WhiteboardHighlightItem;
  }

  /**
   * Run several mutations as ONE undo step (one snapshot). Used per agent tool call and for
   * compound user gestures, so the toast's "Undo" reverts the whole tool effect at once.
   */
  public RunBatch<T>(fn: () => T): T {
    if (this.batchDepth === 0) {
      this.pushUndo();
    }
    this.batchDepth++;
    try {
      return fn();
    }
    finally {
      this.batchDepth--;
    }
  }

  // ────────────────────────────────────────────── undo / redo

  /** Restore the previous snapshot. Emits a `'replace'` change. */
  public Undo(): boolean {
    const snap = this.undoStack.pop();
    if (!snap) {
      return false;
    }
    this.redoStack.push(this.snapshot());
    this.restore(snap);
    this.record('replace', '', 'user', 'undid the last change');
    return true;
  }

  /** Re-apply the most recently undone snapshot. Emits a `'replace'` change. */
  public Redo(): boolean {
    const snap = this.redoStack.pop();
    if (!snap) {
      return false;
    }
    this.undoStack.push(this.snapshot());
    this.restore(snap);
    this.record('replace', '', 'user', 'redid the last change');
    return true;
  }

  // ────────────────────────────────────────────── perception (scene deltas)

  /**
   * Build the coalesced scene delta of everything that changed AFTER `sinceToken`
   * (a previously observed {@link CurrentSeq}; defaults to 0 = everything).
   *
   * Coalescing: per item, the NET effect wins — N moves → one `moved` entry at the current
   * position; add+move → one `added` entry (current state); add+remove → nothing;
   * update+move → one `updated` entry. When the window contains a `'replace'` (undo/redo/load)
   * or the journal no longer reaches the token, the delta carries `reset: true` plus the full
   * compact `items` array — replace-current-state semantics, never an append-only log.
   */
  public BuildSceneDelta(sinceToken = 0): WhiteboardSceneDelta {
    const delta: WhiteboardSceneDelta = {
      op: 'scene-delta',
      seq: this.seq,
      added: [],
      moved: [],
      updated: [],
      removed: [],
      summary: ''
    };

    const tokenTooOld = sinceToken < this.journalTrimmedBeforeSeq;
    const inRange = this.journal.filter((e) => e.Seq > sinceToken);
    const hasReplace = inRange.some((e) => e.Op === 'replace');

    if (tokenTooOld || hasReplace) {
      delta.reset = true;
      delta.items = this.Items.map((i) => this.compact(i));
      delta.summary = this.composeSummaryText({ reset: true });
      return delta;
    }

    // Net-effect per item, preserving first-op semantics.
    const firstOp = new Map<string, WhiteboardChangeOp>();
    const lastOp = new Map<string, WhiteboardChangeOp>();
    const sawUpdate = new Set<string>();
    for (const entry of inRange) {
      if (!firstOp.has(entry.ItemID)) {
        firstOp.set(entry.ItemID, entry.Op);
      }
      lastOp.set(entry.ItemID, entry.Op);
      if (entry.Op === 'update') {
        sawUpdate.add(entry.ItemID);
      }
    }

    for (const [id, first] of firstOp) {
      const last = lastOp.get(id);
      const item = this.items.get(id);
      if (first === 'add') {
        if (item) {
          delta.added.push(this.compact(item)); // add → (move/update)* coalesces into the added entry
        }
        // add → … → remove: net nothing
        continue;
      }
      if (last === 'remove' || !item) {
        delta.removed.push(id);
        continue;
      }
      if (sawUpdate.has(id)) {
        delta.updated.push(this.compact(item)); // update (+ moves) → one updated entry w/ current state
        continue;
      }
      // moves only → one moved entry at the current position
      const b = this.ItemBounds(item);
      delta.moved.push({ id, x: Math.round(b.X), y: Math.round(b.Y) });
    }

    delta.summary = this.composeSummaryText({
      added: delta.added.length,
      moved: delta.moved.length,
      updated: delta.updated.length,
      removed: delta.removed.length
    });
    return delta;
  }

  /** Full compact scene + counts — the popover's stats and the delta-reset payload. */
  public BuildSceneSummary(): WhiteboardSceneSummary {
    const items = this.Items;
    const byKind: Partial<Record<WhiteboardItemKind, number>> = {};
    for (const item of items) {
      byKind[item.Kind] = (byKind[item.Kind] ?? 0) + 1;
    }
    return {
      op: 'scene-summary',
      seq: this.seq,
      counts: {
        total: this.ElementCount,
        user: this.CountByAuthor('user'),
        agent: this.CountByAuthor('agent'),
        byKind
      },
      items: items.map((i) => this.compact(i)),
      summary: this.composeSummaryText({})
    };
  }

  // ────────────────────────────────────────────── persistence

  /** Serialize the board (state of record — persisted as the session-channel artifact). */
  public ToJSON(): string {
    return JSON.stringify(this.snapshot());
  }

  /** Rehydrate a board from {@link ToJSON} output. Throws on malformed input. */
  public static FromJSON(json: string): WhiteboardState {
    const parsed = JSON.parse(json) as WhiteboardStateJSON;
    if (!parsed || !Array.isArray(parsed.items)) {
      throw new Error('WhiteboardState.FromJSON: malformed payload');
    }
    const state = new WhiteboardState();
    state.restore(parsed);
    state.seq = parsed.seq ?? 0;
    state.journalTrimmedBeforeSeq = state.seq; // older tokens force reset deltas
    return state;
  }

  /**
   * Rehydrate THIS instance in place from {@link ToJSON} output — used by the channel's
   * `RestoreState` hook so existing subscriptions (perception feed, save pipeline) and any
   * bound surface keep pointing at the same engine. TOLERANT: malformed input returns
   * `false` and leaves the current state untouched (never throws).
   *
   * On success the undo/redo stacks and journal are cleared (restored state is the new
   * baseline), stale delta tokens force reset semantics, and one `'replace'` change is
   * emitted so consumers re-read the full scene.
   */
  public LoadFromJSON(json: string): boolean {
    let parsed: WhiteboardStateJSON;
    try {
      parsed = JSON.parse(json) as WhiteboardStateJSON;
    }
    catch {
      return false;
    }
    if (!parsed || !Array.isArray(parsed.items)) {
      return false;
    }
    this.restore(parsed);
    this.seq = parsed.seq ?? 0;
    this.journal = [];
    this.journalTrimmedBeforeSeq = this.seq; // older tokens force reset deltas
    this.undoStack = [];
    this.redoStack = [];
    this.SelectedID = null;
    this.record('replace', '', 'user', 'restored a saved board');
    return true;
  }

  // ────────────────────────────────────────────── internals

  private nextId(kind: WhiteboardItemKind): string {
    return `${kind}-${++this.idCounter}`;
  }

  private beforeMutate(): void {
    if (this.batchDepth === 0) {
      this.pushUndo();
    }
    // Any forward mutation invalidates the redo branch (batched mutations included).
    this.redoStack = [];
  }

  private pushUndo(): void {
    this.undoStack.push(this.snapshot());
    if (this.undoStack.length > WhiteboardState.UndoMax) {
      this.undoStack.shift();
    }
    this.redoStack = [];
  }

  private snapshot(): WhiteboardStateJSON {
    return {
      version: 1,
      seq: this.seq,
      idCounter: this.idCounter,
      zCounter: this.zCounter,
      items: JSON.parse(JSON.stringify(this.Items)) as WhiteboardItem[]
    };
  }

  private restore(snap: WhiteboardStateJSON): void {
    this.items = new Map((JSON.parse(JSON.stringify(snap.items)) as WhiteboardItem[]).map((i) => [i.ID, i]));
    this.idCounter = snap.idCounter ?? 0;
    this.zCounter = snap.zCounter ?? 0;
    if (this.SelectedID && !this.items.has(this.SelectedID)) {
      this.SelectedID = null;
    }
  }

  private record(op: WhiteboardChangeOp, itemId: string, author: WhiteboardAuthor, summaryFragment: string): void {
    this.seq++;
    this.journal.push({ Seq: this.seq, Op: op, ItemID: itemId });
    if (this.journal.length > WhiteboardState.JournalMax) {
      const dropped = this.journal.splice(0, this.journal.length - WhiteboardState.JournalMax);
      this.journalTrimmedBeforeSeq = dropped[dropped.length - 1].Seq;
    }
    this.changed.next({ Op: op, ItemID: itemId, Author: author, SummaryFragment: summaryFragment, Seq: this.seq });
  }

  private compact(item: WhiteboardItem): WhiteboardCompactItem {
    const c: WhiteboardCompactItem = { id: item.ID, type: item.Kind, author: item.Author };
    switch (item.Kind) {
      case 'sticky':
        c.x = Math.round(item.X);
        c.y = Math.round(item.Y);
        c.text = clip(item.Text, 120);
        WhiteboardState.compactTextStyle(item, c);
        break;
      case 'shape':
        c.x = Math.round(item.X);
        c.y = Math.round(item.Y);
        c.w = Math.round(item.W);
        c.h = Math.round(item.H);
        c.shape = item.Shape;
        c.text = clip(item.Sub ? `${item.Label} (${item.Sub})` : item.Label, 120);
        break;
      case 'text':
        c.x = Math.round(item.X);
        c.y = Math.round(item.Y);
        if (item.W) {
          c.w = Math.round(item.W);
        }
        c.text = clip(item.Text, 120);
        WhiteboardState.compactTextStyle(item, c);
        if (item.Color) {
          c.color = item.Color;
        }
        break;
      case 'image':
        c.x = Math.round(item.X);
        c.y = Math.round(item.Y);
        c.name = item.Name;
        break;
      case 'ink': {
        const b = this.ItemBounds(item);
        c.x = Math.round(b.X);
        c.y = Math.round(b.Y);
        c.w = Math.round(b.W);
        c.h = Math.round(b.H);
        c.points = item.Points.length;
        break;
      }
      case 'connector':
        c.from = item.FromItemID ?? item.FromPoint ?? null;
        c.to = item.ToItemID ?? item.ToPoint ?? null;
        break;
      case 'highlight':
        c.x = Math.round(item.X);
        c.y = Math.round(item.Y);
        c.w = Math.round(item.W);
        c.h = Math.round(item.H);
        if (item.Label) {
          c.text = clip(item.Label, 120);
        }
        break;
    }
    return c;
  }

  /** Project the optional text-style fields onto a compact item (sticky / text kinds). */
  private static compactTextStyle(item: WhiteboardStickyItem | WhiteboardTextItem, c: WhiteboardCompactItem): void {
    if (item.FontSize != null) {
      c.fontSize = item.FontSize;
    }
    if (item.FontFamily) {
      c.fontFamily = item.FontFamily;
    }
    if (item.FontWeight === 700) {
      c.bold = true;
    }
  }

  private composeSummaryText(parts: { added?: number; moved?: number; updated?: number; removed?: number; reset?: boolean }): string {
    const bits: string[] = [];
    if (parts.reset) {
      bits.push('full scene snapshot (state replaced)');
    }
    else {
      if (parts.added) {
        bits.push(`${parts.added} added`);
      }
      if (parts.moved) {
        bits.push(`${parts.moved} moved`);
      }
      if (parts.updated) {
        bits.push(`${parts.updated} updated`);
      }
      if (parts.removed) {
        bits.push(`${parts.removed} removed`);
      }
      if (bits.length === 0) {
        bits.push('no changes');
      }
    }
    return `${bits.join(', ')}. Board has ${this.ElementCount} elements (user ${this.CountByAuthor('user')} · agent ${this.CountByAuthor('agent')}).`;
  }

  private static describe(item: WhiteboardItem): string {
    switch (item.Kind) {
      case 'sticky': return `a sticky note ("${clip(item.Text)}")`;
      case 'shape': return `a ${item.Shape} ("${clip(item.Label)}")`;
      case 'text': return `a text label ("${clip(item.Text)}")`;
      case 'image': return `an image (${item.Name})`;
      case 'ink': return 'an ink stroke';
      case 'connector': return 'a connector';
      case 'highlight': return 'a highlight region';
    }
  }
}
