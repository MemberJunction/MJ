import { Observable, Subject } from 'rxjs';

/**
 * WHITEBOARD — typed board model + state engine.
 *
 * This file is intentionally Angular-free: it is the single mutation API used by BOTH the
 * user-facing board tools (pen, stickies, shapes, …) and any programmatic co-author —
 * typically an AI agent driving the `Whiteboard_*` tool set (`Whiteboard_AddNote`,
 * `Whiteboard_DrawConnector`, …, see `whiteboard-tools.ts`).
 *
 * Perception model (how a programmatic co-author "sees" the board):
 *  - every mutation appends to a compact change journal and emits on {@link WhiteboardState.Changed$};
 *  - {@link WhiteboardState.BuildSceneDelta} coalesces the journal since a token into ONE delta
 *    (multiple moves of one item → one `moved` entry) with replace-current-state semantics;
 *  - {@link WhiteboardState.BuildSceneSummary} produces the full compact scene the
 *    "What the agent sees" popover renders;
 *  - {@link WhiteboardState.ToJSON} / {@link WhiteboardState.FromJSON} persist the board's
 *    state of record (e.g. a session-channel artifact in MJ realtime sessions).
 *
 * Extensibility: every targeted mutation also raises a cancelable BEFORE event and a
 * matching AFTER event (`ItemAdding$` / `ItemAdded$`, `ItemUpdating$` / `ItemUpdated$`,
 * `ItemRemoving$` / `ItemRemoved$`) — see the {@link WhiteboardState} class docs.
 */

/** Who authored a board item / mutation. The violet treatment is RESERVED for `'agent'`. */
export type WhiteboardAuthor = 'user' | 'agent';

/** The discriminant for the {@link WhiteboardItem} union. */
export type WhiteboardItemKind = 'sticky' | 'shape' | 'ink' | 'text' | 'image' | 'connector' | 'highlight' | 'markdown' | 'html';

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

/**
 * A rendered MARKDOWN panel — a rich, formatted card (headings, lists, code, links) for
 * illustrative content that outgrows a sticky note. Width is explicit (the panel's column
 * width); height is content-driven, optionally capped by `H` (overflow clips).
 */
export interface WhiteboardMarkdownItem extends WhiteboardItemBase {
  Kind: 'markdown';
  X: number;
  Y: number;
  /** Panel width in px (required — markdown always renders in an explicit column). */
  W: number;
  /** Optional max height in px; content beyond it is clipped. Omitted = content-driven. */
  H?: number;
  /** The markdown source. Rendered SAFELY (sanitized — never raw HTML passthrough). */
  Markdown: string;
}

/**
 * An interactive HTML widget — arbitrary HTML (scripts included) rendered inside a
 * STRICTLY SANDBOXED iframe (`sandbox="allow-scripts"` only, opaque origin — see the
 * board component for the full security rationale). Dragged/selected by its card chrome —
 * header bar, border ring and lazy placeholder — while pointer events inside the sandboxed
 * frame stay with the widget, so iframe interactivity and board interactions coexist.
 */
export interface WhiteboardHtmlItem extends WhiteboardItemBase {
  Kind: 'html';
  X: number;
  Y: number;
  W: number;
  H: number;
  /** The widget's full HTML source (becomes the sandboxed iframe's `srcdoc`). */
  Html: string;
  /** Optional title shown on the widget's header bar. */
  Title?: string;
}

/** Discriminated union of everything that can live on the board. */
export type WhiteboardItem =
  | WhiteboardStickyItem
  | WhiteboardShapeItem
  | WhiteboardTextItem
  | WhiteboardImageItem
  | WhiteboardInkItem
  | WhiteboardConnectorItem
  | WhiteboardHighlightItem
  | WhiteboardMarkdownItem
  | WhiteboardHtmlItem;

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
  Markdown?: string;
  Html?: string;
  Title?: string;
  FromItemID?: string | null;
  ToItemID?: string | null;
  FromPoint?: WhiteboardPoint | null;
  ToPoint?: WhiteboardPoint | null;
}

/** Mutation kinds carried on {@link WhiteboardChange} and in the journal. */
export type WhiteboardChangeOp = 'add' | 'update' | 'move' | 'remove' | 'replace';

// ────────────────────────────────────────────── before / after mutation events

/**
 * Base shape of every cancelable BEFORE event raised by {@link WhiteboardState} (and by
 * the components layered on top of it). Handlers run SYNCHRONOUSLY during the emit; any
 * handler may set {@link Cancel} to `true` and the operation is aborted before it touches
 * the board (no undo snapshot, no journal entry, no {@link WhiteboardState.Changed$}
 * emission). The matching AFTER event then never fires.
 */
export interface WhiteboardCancelableEventArgs {
  /** Set to `true` (in a synchronous handler) to veto the operation. */
  Cancel: boolean;
}

/**
 * BEFORE-event args for {@link WhiteboardState.ItemAdding$}. Raised by
 * {@link WhiteboardState.AddItem} (and therefore also by {@link WhiteboardState.Highlight}
 * and {@link WhiteboardState.DuplicateItem}, which add through it) before anything is
 * stamped or stored. Handlers may mutate {@link Input} (e.g. clamp coordinates, rewrite
 * text) — the engine adds whatever the args carry after the emit — or set `Cancel` to
 * veto the add entirely (the caller receives `null`).
 */
export interface WhiteboardItemAddingEventArgs extends WhiteboardCancelableEventArgs {
  /** The item about to be added (no ID / Z / Author yet — the engine stamps those). */
  Input: WhiteboardItemInput;
  /** Who is adding the item. */
  Author: WhiteboardAuthor;
}

/** AFTER-event args for {@link WhiteboardState.ItemAdded$} — the item is on the board. */
export interface WhiteboardItemAddedEventArgs {
  /** The added item, with its engine-stamped ID / Z / Author. */
  Item: WhiteboardItem;
  /** Who added the item. */
  Author: WhiteboardAuthor;
}

/**
 * Which mutation family an updating/updated event describes:
 *  - `'update'` — a field patch via {@link WhiteboardState.UpdateItem};
 *  - `'move'` — a reposition via {@link WhiteboardState.MoveItem};
 *  - `'reorder'` — a z-order change via {@link WhiteboardState.BringToFront} /
 *    {@link WhiteboardState.SendToBack}.
 */
export type WhiteboardUpdateOperation = 'update' | 'move' | 'reorder';

/**
 * BEFORE-event args for {@link WhiteboardState.ItemUpdating$}. {@link Item} is the LIVE,
 * pre-mutation item (do not mutate it directly — cancel and apply your own patch
 * instead). For `'update'` operations handlers may adjust {@link Patch}; for `'move'`
 * operations {@link Position} carries the requested top-left target.
 */
export interface WhiteboardItemUpdatingEventArgs extends WhiteboardCancelableEventArgs {
  /** The item about to change (current, pre-mutation state). */
  Item: WhiteboardItem;
  /** Which mutation family is about to run. */
  Operation: WhiteboardUpdateOperation;
  /** The field patch (`'update'` operations only). Handlers may adjust it. */
  Patch?: WhiteboardItemPatch;
  /** The requested top-left position (`'move'` operations only). */
  Position?: WhiteboardPoint;
  /** Who is changing the item. */
  Author: WhiteboardAuthor;
}

/** AFTER-event args for {@link WhiteboardState.ItemUpdated$} — the change has applied. */
export interface WhiteboardItemUpdatedEventArgs {
  /** The item in its post-mutation state. */
  Item: WhiteboardItem;
  /** Which mutation family ran. */
  Operation: WhiteboardUpdateOperation;
  /** Who changed the item. */
  Author: WhiteboardAuthor;
}

/**
 * BEFORE-event args for {@link WhiteboardState.ItemRemoving$} — raised before the item
 * leaves the board (and before any connector endpoints anchored to it are frozen).
 * Cancel to keep the item.
 */
export interface WhiteboardItemRemovingEventArgs extends WhiteboardCancelableEventArgs {
  /** The item about to be removed. */
  Item: WhiteboardItem;
  /** Who is removing the item. */
  Author: WhiteboardAuthor;
}

/** AFTER-event args for {@link WhiteboardState.ItemRemoved$} — the item is gone. */
export interface WhiteboardItemRemovedEventArgs {
  /** The removed item (its last state — no longer on the board). */
  Item: WhiteboardItem;
  /** Who removed the item. */
  Author: WhiteboardAuthor;
}

/**
 * BEFORE-event args for {@link WhiteboardState.ContentChanging$} — raised (in addition to
 * {@link WhiteboardState.ItemUpdating$}) when an {@link WhiteboardState.UpdateItem} patch
 * touches an item's CONTENT fields: `Text`, `Label`, `Sub`, `Markdown`, `Html` or `Title`.
 * This is the hook for content governance (length limits, redaction, moderation) without
 * having to inspect every geometry patch. Cancel to veto the whole update.
 */
export interface WhiteboardContentChangingEventArgs extends WhiteboardCancelableEventArgs {
  /** The item whose content is about to change (current, pre-mutation state). */
  Item: WhiteboardItem;
  /** The full patch being applied (content fields included). Handlers may adjust it. */
  Patch: WhiteboardItemPatch;
  /** Who is changing the content. */
  Author: WhiteboardAuthor;
}

/** AFTER-event args for {@link WhiteboardState.ContentChanged$} — the content has applied. */
export interface WhiteboardContentChangedEventArgs {
  /** The item in its post-mutation state. */
  Item: WhiteboardItem;
  /** The patch that was applied. */
  Patch: WhiteboardItemPatch;
  /** Who changed the content. */
  Author: WhiteboardAuthor;
}

/**
 * AFTER-event args for {@link WhiteboardState.SelectionChanged$} — the single selection
 * moved to a different item (or cleared). Selection is UI state: it is not journaled, not
 * undoable and not persisted, so this event is a notification only (not cancelable).
 * Fires for explicit {@link WhiteboardState.Select} calls AND for implicit clears (the
 * selected item was removed, or a restore dropped it).
 */
export interface WhiteboardSelectionChangedEventArgs {
  /** The newly selected item's ID, or null when the selection was cleared. */
  SelectedID: string | null;
  /** The previously selected item's ID, or null when nothing was selected. */
  PreviousID: string | null;
}

/**
 * AFTER-event args for {@link WhiteboardState.BoardCleared$} — every item was removed in
 * one operation via {@link WhiteboardState.Clear}. The clear is a single undo step; one
 * `'replace'` op lands in the journal so perception consumers re-read the (now empty)
 * scene.
 */
export interface WhiteboardBoardClearedEventArgs {
  /** Who cleared the board. */
  Author: WhiteboardAuthor;
  /** How many items were removed (highlights included). */
  ItemCount: number;
}

/**
 * AFTER-event args for {@link WhiteboardState.BoardLoaded$} — a persisted board was
 * rehydrated IN PLACE via {@link WhiteboardState.LoadFromJSON}. Undo/redo stacks and the
 * journal were reset (the restored state is the new baseline) and one `'replace'` op was
 * journaled, so perception consumers re-read the full scene.
 */
export interface WhiteboardBoardLoadedEventArgs {
  /** How many items the restored board contains. */
  ItemCount: number;
}

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
  /** Clipped text content (sticky/text/shape labels; markdown/html: clipped SOURCE). */
  text?: string;
  shape?: WhiteboardShapeKind;
  /** Image file name, or the html widget's Title. */
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
  ShapeMinH: 56,
  MarkdownW: 280,
  MarkdownMinH: 96,
  HtmlW: 360,
  HtmlH: 240
} as const;

/**
 * Whether an item kind is BOX-RESIZABLE by the user — i.e. the selection chrome shows the
 * 8 resize handles for it. Everything with a box model resizes: stickies, shapes, text
 * labels, images, markdown panels, HTML widgets and highlight regions. Ink strokes and
 * connectors are path-based and are not box-resizable.
 */
export function IsResizableKind(kind: WhiteboardItemKind): boolean {
  return kind === 'sticky' || kind === 'shape' || kind === 'text' || kind === 'image'
    || kind === 'highlight' || kind === 'markdown' || kind === 'html';
}

/**
 * The patch a COMMITTED resize gesture applies for an item kind, given the gesture's
 * final bounds:
 *  - full-box kinds (`shape`, `highlight`, `html`) commit X / Y / W / H;
 *  - content-driven-height kinds (`sticky`, `text`, `image`, `markdown`) commit
 *    X / Y / W only — their rendered height stays content-driven (markdown's optional
 *    `H` max-height cap is set by tools/agents, never by the drag gesture);
 *  - non-resizable kinds (`ink`, `connector`) return `null` (nothing to commit).
 */
export function BuildResizeCommitPatch(kind: WhiteboardItemKind, bounds: WhiteboardBounds): WhiteboardItemPatch | null {
  if (kind === 'shape' || kind === 'highlight' || kind === 'html') {
    return { X: bounds.X, Y: bounds.Y, W: bounds.W, H: bounds.H };
  }
  if (kind === 'sticky' || kind === 'text' || kind === 'image' || kind === 'markdown') {
    return { X: bounds.X, Y: bounds.Y, W: bounds.W };
  }
  return null;
}

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
 * change journal + coalesced scene deltas, JSON persistence, and the cancelable
 * BEFORE / AFTER mutation event surface.
 *
 * ## Before / after events
 *
 * Every targeted mutation raises a cancelable BEFORE event and, when it applies, a
 * matching AFTER event:
 *
 * | Mutation | Before (cancelable) | After |
 * |---|---|---|
 * | {@link AddItem} (incl. {@link Highlight}, {@link DuplicateItem}) | {@link ItemAdding$} | {@link ItemAdded$} |
 * | {@link UpdateItem} / {@link MoveItem} / {@link BringToFront} / {@link SendToBack} | {@link ItemUpdating$} | {@link ItemUpdated$} |
 * | {@link UpdateItem} touching content fields (Text / Label / Sub / Markdown / Html / Title) | {@link ContentChanging$} (after ItemUpdating$) | {@link ContentChanged$} |
 * | {@link RemoveItem} | {@link ItemRemoving$} | {@link ItemRemoved$} |
 * | {@link Select} (and implicit clears) | — | {@link SelectionChanged$} |
 * | {@link Clear} | — | {@link BoardCleared$} |
 * | {@link LoadFromJSON} | — | {@link BoardLoaded$} |
 *
 * Handlers run synchronously during the emit; setting `Cancel = true` on the event args
 * aborts the mutation (the caller sees `null` / `false`) with no undo snapshot, journal
 * entry or {@link Changed$} emission. These events layer ALONGSIDE the existing
 * {@link Changed$} / journal / perception machinery — they never replace it. Undo / redo
 * whole-scene replacements are NOT item mutations and only surface through
 * {@link Changed$} as `'replace'` ops.
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

  private itemAdding = new Subject<WhiteboardItemAddingEventArgs>();
  /**
   * Cancelable BEFORE event of {@link AddItem} (and {@link Highlight} /
   * {@link DuplicateItem}, which add through it). Set `Cancel = true` synchronously to
   * veto the add — {@link AddItem} then returns `null` and nothing changes.
   */
  public readonly ItemAdding$: Observable<WhiteboardItemAddingEventArgs> = this.itemAdding.asObservable();

  private itemAdded = new Subject<WhiteboardItemAddedEventArgs>();
  /** AFTER event: an item was added (fires once per applied {@link AddItem}). */
  public readonly ItemAdded$: Observable<WhiteboardItemAddedEventArgs> = this.itemAdded.asObservable();

  private itemUpdating = new Subject<WhiteboardItemUpdatingEventArgs>();
  /**
   * Cancelable BEFORE event of {@link UpdateItem} (`Operation: 'update'`),
   * {@link MoveItem} (`'move'`) and {@link BringToFront} / {@link SendToBack}
   * (`'reorder'`). Set `Cancel = true` synchronously to veto — the mutator returns `false`.
   */
  public readonly ItemUpdating$: Observable<WhiteboardItemUpdatingEventArgs> = this.itemUpdating.asObservable();

  private itemUpdated = new Subject<WhiteboardItemUpdatedEventArgs>();
  /** AFTER event: an item changed (patch applied / moved / z-reordered). */
  public readonly ItemUpdated$: Observable<WhiteboardItemUpdatedEventArgs> = this.itemUpdated.asObservable();

  private itemRemoving = new Subject<WhiteboardItemRemovingEventArgs>();
  /**
   * Cancelable BEFORE event of {@link RemoveItem}. Set `Cancel = true` synchronously to
   * keep the item — {@link RemoveItem} then returns `false` and nothing changes.
   */
  public readonly ItemRemoving$: Observable<WhiteboardItemRemovingEventArgs> = this.itemRemoving.asObservable();

  private itemRemoved = new Subject<WhiteboardItemRemovedEventArgs>();
  /** AFTER event: an item was removed from the board. */
  public readonly ItemRemoved$: Observable<WhiteboardItemRemovedEventArgs> = this.itemRemoved.asObservable();

  private contentChanging = new Subject<WhiteboardContentChangingEventArgs>();
  /**
   * Cancelable BEFORE event raised — in addition to {@link ItemUpdating$} — when an
   * {@link UpdateItem} patch touches CONTENT fields (Text / Label / Sub / Markdown /
   * Html / Title). The dedicated hook for content governance: set `Cancel = true`
   * synchronously to veto the whole update.
   */
  public readonly ContentChanging$: Observable<WhiteboardContentChangingEventArgs> = this.contentChanging.asObservable();

  private contentChanged = new Subject<WhiteboardContentChangedEventArgs>();
  /** AFTER event: an item's content fields changed (markdown / html / text edits). */
  public readonly ContentChanged$: Observable<WhiteboardContentChangedEventArgs> = this.contentChanged.asObservable();

  private selectionChanged = new Subject<WhiteboardSelectionChangedEventArgs>();
  /**
   * AFTER event: the single selection changed — via {@link Select} or implicitly (the
   * selected item was removed / dropped by a restore). Selection is transient UI state,
   * so this is a notification only (never cancelable, never journaled).
   */
  public readonly SelectionChanged$: Observable<WhiteboardSelectionChangedEventArgs> = this.selectionChanged.asObservable();

  private boardCleared = new Subject<WhiteboardBoardClearedEventArgs>();
  /** AFTER event: {@link Clear} removed everything from the board (one undo step). */
  public readonly BoardCleared$: Observable<WhiteboardBoardClearedEventArgs> = this.boardCleared.asObservable();

  private boardLoaded = new Subject<WhiteboardBoardLoadedEventArgs>();
  /** AFTER event: {@link LoadFromJSON} rehydrated a persisted board into this instance. */
  public readonly BoardLoaded$: Observable<WhiteboardBoardLoadedEventArgs> = this.boardLoaded.asObservable();

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
      case 'markdown':
        // content-driven height: an explicit max (H) wins, otherwise estimate from line count
        return { X: item.X, Y: item.Y, W: item.W, H: item.H ?? WhiteboardState.markdownHeightEstimate(item.Markdown) };
      case 'html':
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

  /** Rough rendered height of a markdown panel (line count · line height + card padding). */
  private static markdownHeightEstimate(markdown: string): number {
    const lines = (markdown || '').split('\n').length;
    return Math.max(WHITEBOARD_DEFAULTS.MarkdownMinH, Math.min(520, 44 + lines * 19));
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

  /**
   * Set (or clear) the single selection. Unknown IDs clear the selection. Fires
   * {@link SelectionChanged$} when the effective selection actually changes.
   */
  public Select(id: string | null): void {
    this.changeSelection(id != null && this.items.has(id) ? id : null);
  }

  /** Apply a selection change and fire {@link SelectionChanged$} when it differs. */
  protected changeSelection(next: string | null): void {
    if (next === this.SelectedID) {
      return;
    }
    const previous = this.SelectedID;
    this.SelectedID = next;
    this.selectionChanged.next({ SelectedID: next, PreviousID: previous });
  }

  // ────────────────────────────────────────────── mutations

  /**
   * Add an item; the engine stamps ID, Z and Author and emits one change.
   *
   * Raises the cancelable {@link ItemAdding$} BEFORE event first — when a handler
   * cancels, nothing changes and `null` is returned. On success the stamped item is
   * returned and {@link ItemAdded$} fires after the journal/{@link Changed$} emission.
   */
  public AddItem(input: WhiteboardItemInput, author: WhiteboardAuthor): WhiteboardItem | null {
    const adding: WhiteboardItemAddingEventArgs = { Input: input, Author: author, Cancel: false };
    this.itemAdding.next(adding);
    if (adding.Cancel) {
      return null;
    }
    this.beforeMutate();
    const item = { ...adding.Input, ID: this.nextId(adding.Input.Kind), Z: ++this.zCounter, Author: author } as WhiteboardItem;
    this.items.set(item.ID, item);
    this.record('add', item.ID, author, `added ${WhiteboardState.describe(item)}`);
    this.itemAdded.next({ Item: item, Author: author });
    return item;
  }

  /**
   * Patch an item's mutable fields. Returns false when the ID is unknown — or when a
   * handler of the cancelable {@link ItemUpdating$} BEFORE event (or, for patches that
   * touch content fields, the cancelable {@link ContentChanging$} event) vetoed the
   * change. On success {@link ItemUpdated$} — and {@link ContentChanged$} for content
   * patches — fires after the journal/{@link Changed$} emission.
   */
  public UpdateItem(id: string, patch: WhiteboardItemPatch, author: WhiteboardAuthor): boolean {
    const item = this.items.get(id);
    if (!item) {
      return false;
    }
    const updating: WhiteboardItemUpdatingEventArgs = { Item: item, Operation: 'update', Patch: patch, Author: author, Cancel: false };
    this.itemUpdating.next(updating);
    if (updating.Cancel) {
      return false;
    }
    const effective = updating.Patch ?? patch;
    const isContent = WhiteboardState.isContentPatch(effective);
    if (isContent) {
      const changing: WhiteboardContentChangingEventArgs = { Item: item, Patch: effective, Author: author, Cancel: false };
      this.contentChanging.next(changing);
      if (changing.Cancel) {
        return false;
      }
    }
    this.beforeMutate();
    const target = item as WhiteboardItemBase & WhiteboardItemPatch;
    for (const [key, value] of Object.entries(effective)) {
      if (value !== undefined) {
        (target as Record<string, typeof value>)[key] = value;
      }
    }
    this.record('update', id, author, `updated ${WhiteboardState.describe(item)}`);
    this.itemUpdated.next({ Item: item, Operation: 'update', Author: author });
    if (isContent) {
      this.contentChanged.next({ Item: item, Patch: effective, Author: author });
    }
    return true;
  }

  /** Whether a patch touches CONTENT fields (drives the ContentChanging/Changed pair). */
  protected static isContentPatch(patch: WhiteboardItemPatch): boolean {
    return patch.Text !== undefined || patch.Label !== undefined || patch.Sub !== undefined
      || patch.Markdown !== undefined || patch.Html !== undefined || patch.Title !== undefined;
  }

  /**
   * Move an item to an absolute board position. Positioned kinds move their origin; ink
   * strokes translate every point; connectors translate their floating endpoints.
   *
   * Raises the cancelable {@link ItemUpdating$} BEFORE event (`Operation: 'move'`,
   * `Position` = the requested top-left) — returns false when vetoed or the ID is
   * unknown; fires {@link ItemUpdated$} after an applied move.
   */
  public MoveItem(id: string, x: number, y: number, author: WhiteboardAuthor): boolean {
    const item = this.items.get(id);
    if (!item) {
      return false;
    }
    const moving: WhiteboardItemUpdatingEventArgs = { Item: item, Operation: 'move', Position: { X: x, Y: y }, Author: author, Cancel: false };
    this.itemUpdating.next(moving);
    if (moving.Cancel) {
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
    this.itemUpdated.next({ Item: item, Operation: 'move', Author: author });
    return true;
  }

  /**
   * Remove an item. Connectors that referenced it survive: their endpoint freezes to the
   * removed item's last center (the floating-endpoint fallback).
   *
   * Raises the cancelable {@link ItemRemoving$} BEFORE event — returns false when vetoed
   * or the ID is unknown; fires {@link ItemRemoved$} after an applied removal.
   */
  public RemoveItem(id: string, author: WhiteboardAuthor): boolean {
    const item = this.items.get(id);
    if (!item) {
      return false;
    }
    const removing: WhiteboardItemRemovingEventArgs = { Item: item, Author: author, Cancel: false };
    this.itemRemoving.next(removing);
    if (removing.Cancel) {
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
      this.changeSelection(null);
    }
    this.record('remove', id, author, `removed ${WhiteboardState.describe(item)}`);
    this.itemRemoved.next({ Item: item, Author: author });
    return true;
  }

  /**
   * Duplicate an item: a DEEP clone (ink points included) with a fresh engine-stamped
   * identity, offset +16/+16 from the source so the copy is visibly distinct. Connectors
   * (which reference other items) and transient highlights cannot be duplicated — returns
   * `null` without mutating. The clone lands through {@link AddItem}, so it journals as a
   * normal `'add'`, is one undo step, and raises the {@link ItemAdding$} /
   * {@link ItemAdded$} pair (a canceled add also returns `null`).
   */
  public DuplicateItem(id: string, author: WhiteboardAuthor): WhiteboardItem | null {
    const source = this.items.get(id);
    if (!source || source.Kind === 'connector' || source.Kind === 'highlight') {
      return null;
    }
    const { ID: _id, Z: _z, Author: _author, ...rest } = JSON.parse(JSON.stringify(source)) as WhiteboardItem;
    const input = rest as WhiteboardItemInput;
    if (input.Kind === 'ink') {
      input.Points = input.Points.map((p) => ({ X: p.X + 16, Y: p.Y + 16 }));
    }
    else if (input.Kind !== 'connector') {
      input.X += 16;
      input.Y += 16;
    }
    return this.AddItem(input, author);
  }

  /**
   * Raise an item above everything else. Follows the engine's existing Z handling:
   * `++zCounter` is by construction greater than every assigned Z (max + 1), exactly how
   * {@link AddItem} stamps new items. Journals as an `'update'`.
   *
   * Raises the cancelable {@link ItemUpdating$} BEFORE event (`Operation: 'reorder'`) —
   * returns false when vetoed or the ID is unknown; fires {@link ItemUpdated$} after.
   */
  public BringToFront(id: string, author: WhiteboardAuthor): boolean {
    const item = this.items.get(id);
    if (!item) {
      return false;
    }
    if (!this.raiseReorder(item, author)) {
      return false;
    }
    this.beforeMutate();
    item.Z = ++this.zCounter;
    this.record('update', id, author, `brought ${WhiteboardState.describe(item)} to the front`);
    this.itemUpdated.next({ Item: item, Operation: 'reorder', Author: author });
    return true;
  }

  /**
   * Drop an item below everything else (current min Z − 1). Journals as an `'update'`.
   *
   * Raises the cancelable {@link ItemUpdating$} BEFORE event (`Operation: 'reorder'`) —
   * returns false when vetoed or the ID is unknown; fires {@link ItemUpdated$} after.
   */
  public SendToBack(id: string, author: WhiteboardAuthor): boolean {
    const item = this.items.get(id);
    if (!item) {
      return false;
    }
    if (!this.raiseReorder(item, author)) {
      return false;
    }
    this.beforeMutate();
    let minZ = item.Z;
    for (const other of this.items.values()) {
      minZ = Math.min(minZ, other.Z);
    }
    item.Z = minZ - 1;
    this.record('update', id, author, `sent ${WhiteboardState.describe(item)} to the back`);
    this.itemUpdated.next({ Item: item, Operation: 'reorder', Author: author });
    return true;
  }

  /** Raise the cancelable `'reorder'` BEFORE event; returns false when a handler vetoed. */
  protected raiseReorder(item: WhiteboardItem, author: WhiteboardAuthor): boolean {
    const reordering: WhiteboardItemUpdatingEventArgs = { Item: item, Operation: 'reorder', Author: author, Cancel: false };
    this.itemUpdating.next(reordering);
    return !reordering.Cancel;
  }

  /**
   * Convenience: add a pulsing highlight region (agent "pointing without touching").
   * Adds through {@link AddItem}, so the {@link ItemAdding$} / {@link ItemAdded$} pair
   * fires — returns `null` when a handler canceled the add.
   */
  public Highlight(x: number, y: number, w: number, h: number, label: string | undefined, author: WhiteboardAuthor): WhiteboardHighlightItem | null {
    return this.AddItem({ Kind: 'highlight', X: x, Y: y, W: w, H: h, Label: label }, author) as WhiteboardHighlightItem | null;
  }

  /**
   * Remove EVERYTHING from the board as ONE undoable operation. Journals a single
   * `'replace'` op (perception consumers re-read the now-empty scene) and fires
   * {@link BoardCleared$}. Clears the selection (firing {@link SelectionChanged$} when
   * one existed). Returns false when the board was already empty.
   */
  public Clear(author: WhiteboardAuthor = 'user'): boolean {
    if (this.items.size === 0) {
      return false;
    }
    const count = this.items.size;
    this.beforeMutate();
    this.items = new Map<string, WhiteboardItem>();
    this.changeSelection(null);
    this.record('replace', '', author, 'cleared the board');
    this.boardCleared.next({ Author: author, ItemCount: count });
    return true;
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
   * baseline), stale delta tokens force reset semantics, one `'replace'` change is
   * emitted so consumers re-read the full scene, and {@link BoardLoaded$} fires.
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
    this.changeSelection(null);
    this.record('replace', '', 'user', 'restored a saved board');
    this.boardLoaded.next({ ItemCount: this.items.size });
    return true;
  }

  // ────────────────────────────────────────────── internals

  /** Mint the next stable item ID for a kind (`sticky-3`, `shape-7`, …). */
  protected nextId(kind: WhiteboardItemKind): string {
    return `${kind}-${++this.idCounter}`;
  }

  /**
   * Pre-mutation bookkeeping shared by every committed mutation: pushes the undo
   * snapshot (unless inside a {@link RunBatch}, which snapshotted at batch start) and
   * invalidates the redo branch. Subclasses extending the mutation paths should call
   * this exactly once per logical change, AFTER any cancelable before-event survived.
   */
  protected beforeMutate(): void {
    if (this.batchDepth === 0) {
      this.pushUndo();
    }
    // Any forward mutation invalidates the redo branch (batched mutations included).
    this.redoStack = [];
  }

  /** Push the current scene onto the undo stack (bounded) and drop the redo branch. */
  protected pushUndo(): void {
    this.undoStack.push(this.snapshot());
    if (this.undoStack.length > WhiteboardState.UndoMax) {
      this.undoStack.shift();
    }
    this.redoStack = [];
  }

  /** Deep-copied serializable snapshot of the whole scene (undo entries / ToJSON). */
  protected snapshot(): WhiteboardStateJSON {
    return {
      version: 1,
      seq: this.seq,
      idCounter: this.idCounter,
      zCounter: this.zCounter,
      items: JSON.parse(JSON.stringify(this.Items)) as WhiteboardItem[]
    };
  }

  /** Swap the scene to a snapshot's items/counters (drops a now-missing selection). */
  protected restore(snap: WhiteboardStateJSON): void {
    this.items = new Map((JSON.parse(JSON.stringify(snap.items)) as WhiteboardItem[]).map((i) => [i.ID, i]));
    this.idCounter = snap.idCounter ?? 0;
    this.zCounter = snap.zCounter ?? 0;
    if (this.SelectedID && !this.items.has(this.SelectedID)) {
      this.changeSelection(null);
    }
  }

  /**
   * Post-mutation bookkeeping shared by every committed mutation: bumps the sequence,
   * appends the journal entry (bounded — trimming forces reset deltas for stale tokens)
   * and emits the {@link Changed$} notification.
   */
  protected record(op: WhiteboardChangeOp, itemId: string, author: WhiteboardAuthor, summaryFragment: string): void {
    this.seq++;
    this.journal.push({ Seq: this.seq, Op: op, ItemID: itemId });
    if (this.journal.length > WhiteboardState.JournalMax) {
      const dropped = this.journal.splice(0, this.journal.length - WhiteboardState.JournalMax);
      this.journalTrimmedBeforeSeq = dropped[dropped.length - 1].Seq;
    }
    this.changed.next({ Op: op, ItemID: itemId, Author: author, SummaryFragment: summaryFragment, Seq: this.seq });
  }

  /** Project one item to its compact, model-facing representation (deltas / summaries). */
  protected compact(item: WhiteboardItem): WhiteboardCompactItem {
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
      case 'markdown':
        // the agent must SEE what's in the panel — project the clipped SOURCE, not a stub
        c.x = Math.round(item.X);
        c.y = Math.round(item.Y);
        c.w = Math.round(item.W);
        if (item.H != null) {
          c.h = Math.round(item.H);
        }
        c.text = clip(item.Markdown, 200);
        break;
      case 'html':
        c.x = Math.round(item.X);
        c.y = Math.round(item.Y);
        c.w = Math.round(item.W);
        c.h = Math.round(item.H);
        if (item.Title) {
          c.name = clip(item.Title, 80);
        }
        c.text = clip(item.Html, 200);
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

  /** Compose the human-readable tail line of deltas / summaries ("2 added, 1 moved. …"). */
  protected composeSummaryText(parts: { added?: number; moved?: number; updated?: number; removed?: number; reset?: boolean }): string {
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
      case 'markdown': return `a markdown panel ("${clip(item.Markdown)}")`;
      case 'html': return `an HTML widget${item.Title ? ` ("${clip(item.Title)}")` : ''}`;
    }
  }
}
