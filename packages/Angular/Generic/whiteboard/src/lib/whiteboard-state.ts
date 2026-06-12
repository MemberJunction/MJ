import { Observable, Subject } from 'rxjs';
import { UUIDsEqual } from '@memberjunction/global';

/**
 * WHITEBOARD — typed board model + state engine.
 *
 * This file is intentionally Angular-free: it is the single mutation API used by BOTH the
 * user-facing board tools (pen, stickies, shapes, …) and any programmatic co-author —
 * typically an AI agent driving the `Whiteboard_*` tool set (`Whiteboard_AddNote`,
 * `Whiteboard_DrawConnector`, …, see `whiteboard-tools.ts`).
 *
 * Pages (OneNote-style): a board is an ordered list of named PAGES, each with its own
 * items collection; exactly one page is ACTIVE at a time and every item operation
 * (add / update / move / remove / connectors / clear / perception) targets the active
 * page. See {@link WhiteboardState.AddPage} / {@link WhiteboardState.SwitchPage} /
 * {@link WhiteboardState.RenamePage} / {@link WhiteboardState.RemovePage}. A fresh
 * board starts with one page named "Page 1"; legacy (pre-pages, flat) persisted JSON
 * rehydrates as that single page.
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
 * AFTER-event args for {@link WhiteboardState.SelectionChanged$} — the selection changed
 * (single OR multi). Selection is UI state: it is not journaled, not undoable and not
 * persisted, so this event is a notification only (not cancelable). Fires for explicit
 * {@link WhiteboardState.Select} / {@link WhiteboardState.ToggleSelect} /
 * {@link WhiteboardState.SelectMany} calls AND for implicit clears (a selected item was
 * removed, the page switched, or a restore dropped it).
 */
export interface WhiteboardSelectionChangedEventArgs {
  /** The PRIMARY selected item's ID (last added to the selection), or null when cleared. */
  SelectedID: string | null;
  /** The previously primary item's ID, or null when nothing was selected. */
  PreviousID: string | null;
  /** The full multi-selection (selection order, last = primary). Empty when cleared. */
  SelectedIDs: string[];
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
  /** How many items the restored board contains (summed across ALL pages). */
  ItemCount: number;
}

// ────────────────────────────────────────────── pages

/**
 * Public, read-only descriptor of one board page — what {@link WhiteboardState.Pages}
 * returns and what every page before/after event carries. A snapshot, not a live view:
 * re-read {@link WhiteboardState.Pages} after mutations.
 */
export interface WhiteboardPageInfo {
  /** Stable page id (e.g. `page-2`) — accepted anywhere a page name is accepted. */
  ID: string;
  /** Display name (e.g. "Page 1"). Not guaranteed unique; IDs are. */
  Name: string;
  /** How many items live on the page (highlights included). */
  ItemCount: number;
  /** Whether this is the board's active page. */
  Active: boolean;
  /**
   * Who CREATED the page. Drives the page strip's delegated-violet garnish for
   * agent-created pages (mirroring the item-level agent treatment). Persisted in the
   * v2 JSON as an additive `author` field; payloads without it rehydrate as `'user'`.
   */
  Author: WhiteboardAuthor;
}

/**
 * BEFORE-event args for {@link WhiteboardState.PageAdding$} — raised by
 * {@link WhiteboardState.AddPage} before the page exists. Handlers may rewrite
 * {@link Name} (the engine trims it; an emptied name falls back to the auto-name) or set
 * `Cancel` to veto the add (the caller receives `null`).
 */
export interface WhiteboardPageAddingEventArgs extends WhiteboardCancelableEventArgs {
  /** The name the page will get (auto-named "Page N" when the caller omitted one). */
  Name: string;
  /** Who is adding the page. */
  Author: WhiteboardAuthor;
}

/** AFTER-event args for {@link WhiteboardState.PageAdded$} — the page exists and is active. */
export interface WhiteboardPageAddedEventArgs {
  /** The added page (now the active page). */
  Page: WhiteboardPageInfo;
  /** Who added the page. */
  Author: WhiteboardAuthor;
}

/**
 * BEFORE-event args for {@link WhiteboardState.PageSwitching$} — raised by
 * {@link WhiteboardState.SwitchPage} before the active page changes. Cancel to stay on
 * the current page.
 */
export interface WhiteboardPageSwitchingEventArgs extends WhiteboardCancelableEventArgs {
  /** The page that is currently active. */
  FromPage: WhiteboardPageInfo;
  /** The page about to become active. */
  ToPage: WhiteboardPageInfo;
  /** Who is switching. */
  Author: WhiteboardAuthor;
}

/** AFTER-event args for {@link WhiteboardState.PageSwitched$} — the active page changed. */
export interface WhiteboardPageSwitchedEventArgs {
  /** The previously active page. */
  FromPage: WhiteboardPageInfo;
  /** The newly active page. */
  ToPage: WhiteboardPageInfo;
  /** Who switched. */
  Author: WhiteboardAuthor;
}

/**
 * BEFORE-event args for {@link WhiteboardState.PageRenaming$} — raised by
 * {@link WhiteboardState.RenamePage}. Handlers may rewrite {@link NewName} (trimmed by
 * the engine; an emptied rewrite aborts the rename) or set `Cancel` to veto.
 */
export interface WhiteboardPageRenamingEventArgs extends WhiteboardCancelableEventArgs {
  /** The page about to be renamed (pre-rename snapshot). */
  Page: WhiteboardPageInfo;
  /** The requested new name. Handlers may adjust it. */
  NewName: string;
  /** Who is renaming. */
  Author: WhiteboardAuthor;
}

/** AFTER-event args for {@link WhiteboardState.PageRenamed$} — the rename applied. */
export interface WhiteboardPageRenamedEventArgs {
  /** The page in its post-rename state. */
  Page: WhiteboardPageInfo;
  /** The name the page had before. */
  OldName: string;
  /** Who renamed it. */
  Author: WhiteboardAuthor;
}

/**
 * BEFORE-event args for {@link WhiteboardState.PageRemoving$} — raised by
 * {@link WhiteboardState.RemovePage} (never for the last remaining page — that is
 * guarded before the event). Cancel to keep the page.
 */
export interface WhiteboardPageRemovingEventArgs extends WhiteboardCancelableEventArgs {
  /** The page about to be removed (with all of its items). */
  Page: WhiteboardPageInfo;
  /** Who is removing it. */
  Author: WhiteboardAuthor;
}

/** AFTER-event args for {@link WhiteboardState.PageRemoved$} — the page is gone. */
export interface WhiteboardPageRemovedEventArgs {
  /** The removed page (its last state). */
  Page: WhiteboardPageInfo;
  /** When the REMOVED page was active: the neighbor page that became active. Else null. */
  ActivatedPage: WhiteboardPageInfo | null;
  /** Who removed it. */
  Author: WhiteboardAuthor;
}

/** Compact page descriptor carried on scene deltas / summaries (model-facing). */
export interface WhiteboardScenePage {
  id: string;
  name: string;
  active: boolean;
  items: number;
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
  /** The board's page list — `active: true` marks the page the item entries describe. */
  pages: WhiteboardScenePage[];
  summary: string;
}

/** Full compact scene snapshot (popover stats + delta-reset payloads). ACTIVE page only. */
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
  /** The board's page list — `active: true` marks the page the item entries describe. */
  pages: WhiteboardScenePage[];
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

/** Serialized shape of one page inside {@link WhiteboardStateJSON} (version 2+). */
interface WhiteboardPageJSON {
  id: string;
  name: string;
  items: WhiteboardItem[];
  /**
   * Who created the page (additive, v2-tolerant: absent in pre-authorship payloads and
   * treated as `'user'` on load). Drives the agent-page chip garnish.
   */
  author?: WhiteboardAuthor;
}

/**
 * Serialized shape produced by {@link WhiteboardState.ToJSON} — VERSION 2 (paged).
 * Version 1 (the legacy flat shape: `{ version: 1, seq, idCounter, zCounter, items }`)
 * is still accepted by {@link WhiteboardState.FromJSON} / {@link WhiteboardState.LoadFromJSON}
 * and rehydrates as a single page named "Page 1".
 */
interface WhiteboardStateJSON {
  version: 2;
  seq: number;
  idCounter: number;
  zCounter: number;
  /** Monotonic page-id/auto-name counter (never decremented, so names don't collide). */
  pageCounter: number;
  /** ID of the active page (always one of `pages`). */
  activePageId: string;
  /** The ordered page list (always at least one page). */
  pages: WhiteboardPageJSON[];
}

/** Internal live record of one page (the active page's map backs `this.items`). */
interface PageRecord {
  ID: string;
  Name: string;
  /** Who created the page (drives the agent-page garnish; persisted). */
  Author: WhiteboardAuthor;
  Items: Map<string, WhiteboardItem>;
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
 * | {@link AddPage} | {@link PageAdding$} | {@link PageAdded$} |
 * | {@link SwitchPage} | {@link PageSwitching$} | {@link PageSwitched$} |
 * | {@link RenamePage} | {@link PageRenaming$} | {@link PageRenamed$} |
 * | {@link RemovePage} | {@link PageRemoving$} | {@link PageRemoved$} |
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

  /**
   * The ordered page list. A fresh board has one page named "Page 1". Every item
   * operation reads/writes the ACTIVE page's map through the `items` accessor below, so
   * the entire pre-pages mutation surface is page-scoped without per-call changes.
   */
  private pages: PageRecord[] = [{ ID: 'page-1', Name: 'Page 1', Author: 'user', Items: new Map<string, WhiteboardItem>() }];
  /** ID of the active page (always present in {@link pages}). */
  private activePageId = 'page-1';
  /** Monotonic page counter — mints page IDs and the "Page N" auto-names. */
  private pageCounter = 1;

  /** The ACTIVE page's item map (accessor keeps all item mutations page-scoped). */
  private get items(): Map<string, WhiteboardItem> {
    return this.activePage.Items;
  }
  private set items(value: Map<string, WhiteboardItem>) {
    this.activePage.Items = value;
  }

  /** The active page record (defensive fallback to the first page — never undefined). */
  private get activePage(): PageRecord {
    return this.pages.find((p) => UUIDsEqual(p.ID, this.activePageId)) ?? this.pages[0];
  }

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

  private pageAdding = new Subject<WhiteboardPageAddingEventArgs>();
  /**
   * Cancelable BEFORE event of {@link AddPage}. Set `Cancel = true` synchronously to
   * veto — {@link AddPage} then returns `null` and nothing changes.
   */
  public readonly PageAdding$: Observable<WhiteboardPageAddingEventArgs> = this.pageAdding.asObservable();

  private pageAdded = new Subject<WhiteboardPageAddedEventArgs>();
  /** AFTER event: a page was added (and became the active page). */
  public readonly PageAdded$: Observable<WhiteboardPageAddedEventArgs> = this.pageAdded.asObservable();

  private pageSwitching = new Subject<WhiteboardPageSwitchingEventArgs>();
  /**
   * Cancelable BEFORE event of {@link SwitchPage}. Set `Cancel = true` synchronously to
   * stay on the current page — {@link SwitchPage} then returns `false`.
   */
  public readonly PageSwitching$: Observable<WhiteboardPageSwitchingEventArgs> = this.pageSwitching.asObservable();

  private pageSwitched = new Subject<WhiteboardPageSwitchedEventArgs>();
  /** AFTER event: the active page changed via {@link SwitchPage}. */
  public readonly PageSwitched$: Observable<WhiteboardPageSwitchedEventArgs> = this.pageSwitched.asObservable();

  private pageRenaming = new Subject<WhiteboardPageRenamingEventArgs>();
  /**
   * Cancelable BEFORE event of {@link RenamePage}. Handlers may rewrite `NewName`; set
   * `Cancel = true` synchronously to veto — {@link RenamePage} then returns `false`.
   */
  public readonly PageRenaming$: Observable<WhiteboardPageRenamingEventArgs> = this.pageRenaming.asObservable();

  private pageRenamed = new Subject<WhiteboardPageRenamedEventArgs>();
  /** AFTER event: a page was renamed. */
  public readonly PageRenamed$: Observable<WhiteboardPageRenamedEventArgs> = this.pageRenamed.asObservable();

  private pageRemoving = new Subject<WhiteboardPageRemovingEventArgs>();
  /**
   * Cancelable BEFORE event of {@link RemovePage} (never raised for the guarded
   * last-page case). Set `Cancel = true` synchronously to keep the page.
   */
  public readonly PageRemoving$: Observable<WhiteboardPageRemovingEventArgs> = this.pageRemoving.asObservable();

  private pageRemoved = new Subject<WhiteboardPageRemovedEventArgs>();
  /** AFTER event: a page (and all of its items) was removed from the board. */
  public readonly PageRemoved$: Observable<WhiteboardPageRemovedEventArgs> = this.pageRemoved.asObservable();

  /**
   * The MULTI-selection, in selection order (last entry is the primary selection).
   * Selection is volatile UI state — never journaled, never undoable, never persisted,
   * and cleared on page switches and whole-scene restores.
   */
  private selectedIds: string[] = [];

  /**
   * The PRIMARY selected item's ID (the most recently selected member of the
   * multi-selection), or null when nothing is selected. Selection is UI state — not
   * persisted. For the full multi-selection see {@link SelectedIDs}.
   */
  public get SelectedID(): string | null {
    return this.selectedIds.length > 0 ? this.selectedIds[this.selectedIds.length - 1] : null;
  }

  /** All selected item IDs in selection order (last = primary). Returns a copy. */
  public get SelectedIDs(): string[] {
    return [...this.selectedIds];
  }

  // ────────────────────────────────────────────── reads

  /** All items on the ACTIVE page in render order (ascending Z). */
  public get Items(): WhiteboardItem[] {
    return Array.from(this.items.values()).sort((a, b) => a.Z - b.Z);
  }

  /** The ordered page list (read-only snapshots — see {@link WhiteboardPageInfo}). */
  public get Pages(): WhiteboardPageInfo[] {
    return this.pages.map((p) => this.pageInfo(p));
  }

  /** ID of the active page (every item operation targets this page). */
  public get ActivePageID(): string {
    return this.activePage.ID;
  }

  /** Display name of the active page. */
  public get ActivePageName(): string {
    return this.activePage.Name;
  }

  /** Total item count summed across ALL pages (the active-page count is {@link ElementCount}). */
  public get TotalItemCount(): number {
    return this.pages.reduce((n, p) => n + p.Items.size, 0);
  }

  /**
   * Tolerant page lookup: by exact ID first, then by case-insensitive, trimmed name
   * (first match wins on duplicate names). Returns `undefined` when nothing matches.
   */
  public FindPage(idOrName: string): WhiteboardPageInfo | undefined {
    const page = this.resolvePage(idOrName);
    return page ? this.pageInfo(page) : undefined;
  }

  /** Current sequence number — use as the `sinceToken` for the next {@link BuildSceneDelta}. */
  public get CurrentSeq(): number {
    return this.seq;
  }

  /** Look up one ACTIVE-page item by ID (items on other pages are not visible here). */
  public GetItem(id: string): WhiteboardItem | undefined {
    return this.items.get(id);
  }

  /** ACTIVE-page "elements" as the status footer reports them (transient highlights excluded). */
  public get ElementCount(): number {
    return this.Items.filter((i) => i.Kind !== 'highlight').length;
  }

  /** Active-page elements by author (highlights excluded, same basis as {@link ElementCount}). */
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
   * Set (or clear) the selection to a SINGLE item. Unknown IDs clear the selection.
   * Fires {@link SelectionChanged$} when the effective selection actually changes.
   */
  public Select(id: string | null): void {
    this.applySelection(id != null && this.items.has(id) ? [id] : []);
  }

  /**
   * Toggle one item's membership in the multi-selection WITHOUT clearing the rest —
   * the shift-click semantics. A newly added item becomes the primary selection
   * ({@link SelectedID}); unknown IDs are a no-op.
   */
  public ToggleSelect(id: string): void {
    if (!this.items.has(id)) {
      return;
    }
    this.applySelection(this.selectedIds.includes(id)
      ? this.selectedIds.filter((s) => s !== id)
      : [...this.selectedIds, id]);
  }

  /**
   * Replace the selection with a set of items (the marquee result). Unknown IDs are
   * dropped and duplicates collapse to their first occurrence; order is preserved
   * (the last surviving entry becomes the primary selection). An empty / fully-unknown
   * list clears the selection.
   */
  public SelectMany(ids: string[]): void {
    const seen = new Set<string>();
    const next: string[] = [];
    for (const id of ids) {
      if (id != null && this.items.has(id) && !seen.has(id)) {
        seen.add(id);
        next.push(id);
      }
    }
    this.applySelection(next);
  }

  /** Whether an item is part of the current (single or multi) selection. */
  public IsItemSelected(id: string): boolean {
    return this.selectedIds.includes(id);
  }

  /**
   * All ACTIVE-page items whose axis-aligned bounds intersect the given rectangle —
   * the marquee (rubber-band) hit test, in render order. Transient highlight regions
   * are excluded: they are "pointing" chrome dismissed by click, never selected.
   * Edge-touching items (zero overlap area) do NOT count as intersecting.
   */
  public ItemsIntersecting(rect: WhiteboardBounds): WhiteboardItem[] {
    return this.Items.filter((item) => {
      if (item.Kind === 'highlight') {
        return false;
      }
      const b = this.ItemBounds(item);
      return b.X < rect.X + rect.W && b.X + b.W > rect.X
        && b.Y < rect.Y + rect.H && b.Y + b.H > rect.Y;
    });
  }

  /** Apply a SINGLE-or-clear selection change (legacy internal path). */
  protected changeSelection(next: string | null): void {
    this.applySelection(next != null ? [next] : []);
  }

  /** Swap the multi-selection and fire {@link SelectionChanged$} when it differs. */
  protected applySelection(next: string[]): void {
    const current = this.selectedIds;
    if (next.length === current.length && next.every((id, i) => id === current[i])) {
      return;
    }
    const previous = this.SelectedID;
    this.selectedIds = next;
    this.selectionChanged.next({ SelectedID: this.SelectedID, PreviousID: previous, SelectedIDs: [...next] });
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
    if (this.selectedIds.includes(id)) {
      this.applySelection(this.selectedIds.filter((s) => s !== id));
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
   * Remove EVERYTHING from the ACTIVE page as ONE undoable operation (other pages are
   * untouched). Journals a single `'replace'` op (perception consumers re-read the
   * now-empty scene) and fires {@link BoardCleared$}. Clears the selection (firing
   * {@link SelectionChanged$} when one existed). Returns false when the active page was
   * already empty.
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
   * Move EVERY selected item by the same delta as ONE undo step (the multi-select group
   * drag). Internally one {@link RunBatch} of per-item {@link MoveItem} calls, so each
   * member still raises its own cancelable `'move'` BEFORE event (a veto skips just that
   * member) and journals normally — but a single Undo reverts the whole group move.
   * Returns how many items actually moved (0 when nothing is selected or the delta is 0).
   */
  public MoveSelectedBy(dx: number, dy: number, author: WhiteboardAuthor): number {
    const ids = this.selectedIds.filter((id) => this.items.has(id));
    if (ids.length === 0 || (dx === 0 && dy === 0)) {
      return 0;
    }
    return this.RunBatch(() => {
      // capture every member's bounds BEFORE any member moves, so anchored-connector
      // bounds (which follow their endpoints) don't skew later members' targets
      const targets = ids
        .map((id) => {
          const item = this.items.get(id);
          return item ? { id, bounds: this.ItemBounds(item) } : null;
        })
        .filter((t): t is { id: string; bounds: WhiteboardBounds } => t !== null);
      let moved = 0;
      for (const t of targets) {
        if (this.MoveItem(t.id, t.bounds.X + dx, t.bounds.Y + dy, author)) {
          moved++;
        }
      }
      return moved;
    });
  }

  /**
   * Remove EVERY selected item as ONE undo step (the multi-select Delete key). One
   * {@link RunBatch} of per-item {@link RemoveItem} calls — each member still raises its
   * cancelable {@link ItemRemoving$} BEFORE event (a veto keeps just that member), and a
   * single Undo restores the whole group. The selection empties as items are removed.
   * Returns how many items were actually removed.
   */
  public RemoveSelected(author: WhiteboardAuthor): number {
    const ids = this.selectedIds.filter((id) => this.items.has(id));
    if (ids.length === 0) {
      return 0;
    }
    return this.RunBatch(() => {
      let removed = 0;
      for (const id of ids) {
        if (this.RemoveItem(id, author)) {
          removed++;
        }
      }
      return removed;
    });
  }

  // ────────────────────────────────────────────── pages

  /** Project a live page record to its public read-only descriptor. */
  protected pageInfo(page: PageRecord): WhiteboardPageInfo {
    return { ID: page.ID, Name: page.Name, ItemCount: page.Items.size, Active: UUIDsEqual(page.ID, this.activePageId), Author: page.Author };
  }

  /** Resolve a page by exact ID first, then case-insensitive trimmed name. */
  private resolvePage(idOrName: string): PageRecord | undefined {
    const key = (idOrName ?? '').trim();
    if (key.length === 0) {
      return undefined;
    }
    return this.pages.find((p) => UUIDsEqual(p.ID, key))
      ?? this.pages.find((p) => p.Name.trim().toLowerCase() === key.toLowerCase());
  }

  /**
   * Add a new page and SWITCH to it. `name` is trimmed; when omitted (or blank) the page
   * auto-names itself "Page N" from the monotonic page counter, so auto-names never
   * repeat even after removals.
   *
   * Raises the cancelable {@link PageAdding$} BEFORE event (handlers may rewrite the
   * name) — returns `null` when vetoed; fires {@link PageAdded$} after. One undoable
   * step; journals a `'replace'` op (the agent's visible scene swaps to the new, empty
   * page), so perception consumers re-read the scene.
   */
  public AddPage(name?: string, author: WhiteboardAuthor = 'user'): WhiteboardPageInfo | null {
    const autoName = `Page ${this.pageCounter + 1}`;
    const requested = (name ?? '').trim();
    const adding: WhiteboardPageAddingEventArgs = { Name: requested.length > 0 ? requested : autoName, Author: author, Cancel: false };
    this.pageAdding.next(adding);
    if (adding.Cancel) {
      return null;
    }
    this.beforeMutate();
    this.pageCounter++;
    const page: PageRecord = {
      ID: `page-${this.pageCounter}`,
      Name: (adding.Name ?? '').trim() || autoName,
      Author: author,
      Items: new Map<string, WhiteboardItem>()
    };
    this.pages.push(page);
    this.activePageId = page.ID;
    this.changeSelection(null);
    this.record('replace', '', author, `added page "${page.Name}"`);
    const info = this.pageInfo(page);
    this.pageAdded.next({ Page: info, Author: author });
    return info;
  }

  /**
   * Make another page the active page. Tolerant lookup: exact ID first, then
   * case-insensitive name (see {@link FindPage}). Switching to the already-active page
   * is a successful no-op (no events, no journal entry).
   *
   * Raises the cancelable {@link PageSwitching$} BEFORE event — returns `false` when
   * vetoed or the page is unknown; fires {@link PageSwitched$} after. Journals a
   * `'replace'` op (the visible scene swaps wholesale) but deliberately pushes NO undo
   * snapshot — switching is navigation, not a content mutation.
   */
  public SwitchPage(idOrName: string, author: WhiteboardAuthor = 'user'): boolean {
    const target = this.resolvePage(idOrName);
    if (!target) {
      return false;
    }
    if (UUIDsEqual(target.ID, this.activePageId)) {
      return true; // already there — successful no-op
    }
    const from = this.pageInfo(this.activePage);
    const switching: WhiteboardPageSwitchingEventArgs = { FromPage: from, ToPage: this.pageInfo(target), Author: author, Cancel: false };
    this.pageSwitching.next(switching);
    if (switching.Cancel) {
      return false;
    }
    this.activePageId = target.ID;
    this.changeSelection(null);
    this.record('replace', '', author, `switched to page "${target.Name}"`);
    this.pageSwitched.next({ FromPage: from, ToPage: this.pageInfo(target), Author: author });
    return true;
  }

  /**
   * Rename a page (tolerant lookup, same as {@link SwitchPage}). The new name is
   * trimmed; an empty result returns `false`. Renaming to the current name is a
   * successful no-op (no events, no journal entry).
   *
   * Raises the cancelable {@link PageRenaming$} BEFORE event (handlers may rewrite
   * `NewName`) — returns `false` when vetoed; fires {@link PageRenamed$} after. One
   * undoable step; journals a `'replace'` op so the agent's page list stays current.
   */
  public RenamePage(idOrName: string, newName: string, author: WhiteboardAuthor = 'user'): boolean {
    const target = this.resolvePage(idOrName);
    const requested = (newName ?? '').trim();
    if (!target || requested.length === 0) {
      return false;
    }
    if (target.Name === requested) {
      return true; // nothing to do
    }
    const renaming: WhiteboardPageRenamingEventArgs = { Page: this.pageInfo(target), NewName: requested, Author: author, Cancel: false };
    this.pageRenaming.next(renaming);
    if (renaming.Cancel) {
      return false;
    }
    const effective = (renaming.NewName ?? '').trim();
    if (effective.length === 0) {
      return false; // a handler emptied the name — treat as an abort
    }
    this.beforeMutate();
    const oldName = target.Name;
    target.Name = effective;
    this.record('replace', '', author, `renamed page "${oldName}" to "${target.Name}"`);
    this.pageRenamed.next({ Page: this.pageInfo(target), OldName: oldName, Author: author });
    return true;
  }

  /**
   * Remove a page AND all of its items (tolerant lookup, same as {@link SwitchPage}).
   * The LAST remaining page can never be removed (`false`, no events). Removing the
   * ACTIVE page activates a neighbor — the next page when one exists, otherwise the
   * previous one.
   *
   * Raises the cancelable {@link PageRemoving$} BEFORE event — returns `false` when
   * vetoed or the page is unknown; fires {@link PageRemoved$} after (with the activated
   * neighbor when the active page was removed). One undoable step; journals a
   * `'replace'` op.
   */
  public RemovePage(idOrName: string, author: WhiteboardAuthor = 'user'): boolean {
    const target = this.resolvePage(idOrName);
    if (!target || this.pages.length <= 1) {
      return false; // unknown, or the guarded last page
    }
    const removingInfo = this.pageInfo(target);
    const removing: WhiteboardPageRemovingEventArgs = { Page: removingInfo, Author: author, Cancel: false };
    this.pageRemoving.next(removing);
    if (removing.Cancel) {
      return false;
    }
    this.beforeMutate();
    const index = this.pages.indexOf(target);
    this.pages.splice(index, 1);
    let activated: WhiteboardPageInfo | null = null;
    if (UUIDsEqual(target.ID, this.activePageId)) {
      // activate the neighbor: the page that slid into the removed slot, else the new last
      const neighbor = this.pages[Math.min(index, this.pages.length - 1)];
      this.activePageId = neighbor.ID;
      activated = this.pageInfo(neighbor);
      this.changeSelection(null);
    }
    this.record('replace', '', author, `removed page "${target.Name}"`);
    this.pageRemoved.next({ Page: removingInfo, ActivatedPage: activated, Author: author });
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
      pages: this.scenePages(),
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
      pages: this.scenePages(),
      summary: this.composeSummaryText({})
    };
  }

  /** Compact page list for deltas / summaries (model-facing). */
  protected scenePages(): WhiteboardScenePage[] {
    return this.pages.map((p) => ({
      id: p.ID,
      name: p.Name,
      active: UUIDsEqual(p.ID, this.activePageId),
      items: p.Items.size
    }));
  }

  // ────────────────────────────────────────────── persistence

  /**
   * Serialize the board (state of record — persisted as the session-channel artifact).
   * Emits the VERSION 2 paged shape (see {@link WhiteboardStateJSON}); the legacy flat
   * shape is still accepted on load and rehydrates as a single page "Page 1".
   */
  public ToJSON(): string {
    return JSON.stringify(this.snapshot());
  }

  /**
   * Rehydrate a board from {@link ToJSON} output — BOTH shapes accepted: the current
   * paged shape (version 2) and the legacy flat shape (version 1, `items` at the root),
   * which migrates to one page named "Page 1". Throws on malformed input (use
   * {@link LoadFromJSON} or `ParseBoardStateJson` for the tolerant variants).
   */
  public static FromJSON(json: string): WhiteboardState {
    const normalized = WhiteboardState.normalizePersisted(JSON.parse(json));
    if (!normalized) {
      throw new Error('WhiteboardState.FromJSON: malformed payload');
    }
    const state = new WhiteboardState();
    state.restore(normalized);
    state.seq = normalized.seq;
    state.journalTrimmedBeforeSeq = state.seq; // older tokens force reset deltas
    return state;
  }

  /**
   * Normalize a parsed persisted payload — EITHER shape — into the current
   * {@link WhiteboardStateJSON}. Returns `null` for anything unrecognizable (the
   * callers decide whether that throws or fails soft). Defensive throughout: page
   * entries missing ids/names/item arrays are repaired, an empty page list gains one
   * "Page 1", and an unknown `activePageId` falls back to the first page.
   */
  private static normalizePersisted(parsed: unknown): WhiteboardStateJSON | null {
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
      return null;
    }
    const raw = parsed as Record<string, unknown>;
    const num = (value: unknown, fallback: number): number =>
      typeof value === 'number' && Number.isFinite(value) ? value : fallback;

    if (Array.isArray(raw['pages'])) {
      // CURRENT shape (version 2, paged)
      const pages: WhiteboardPageJSON[] = [];
      for (const entry of raw['pages'] as unknown[]) {
        if (!entry || typeof entry !== 'object' || Array.isArray(entry)) {
          continue;
        }
        const p = entry as Record<string, unknown>;
        const name = typeof p['name'] === 'string' && (p['name'] as string).trim().length > 0
          ? (p['name'] as string) : `Page ${pages.length + 1}`;
        pages.push({
          id: typeof p['id'] === 'string' && (p['id'] as string).length > 0 ? (p['id'] as string) : `page-${pages.length + 1}`,
          name,
          // additive authorship field — tolerated absent (pre-garnish payloads → 'user')
          author: p['author'] === 'agent' ? 'agent' : 'user',
          items: Array.isArray(p['items']) ? (p['items'] as WhiteboardItem[]) : []
        });
      }
      if (pages.length === 0) {
        pages.push({ id: 'page-1', name: 'Page 1', items: [] });
      }
      const active = raw['activePageId'];
      return {
        version: 2,
        seq: num(raw['seq'], 0),
        idCounter: num(raw['idCounter'], 0),
        zCounter: num(raw['zCounter'], 0),
        pageCounter: Math.max(num(raw['pageCounter'], pages.length), pages.length),
        activePageId: typeof active === 'string' && pages.some((p) => p.id === active) ? active : pages[0].id,
        pages
      };
    }
    if (Array.isArray(raw['items'])) {
      // LEGACY shape (version 1, flat) — migrate to a single page "Page 1"
      return {
        version: 2,
        seq: num(raw['seq'], 0),
        idCounter: num(raw['idCounter'], 0),
        zCounter: num(raw['zCounter'], 0),
        pageCounter: 1,
        activePageId: 'page-1',
        pages: [{ id: 'page-1', name: 'Page 1', items: raw['items'] as WhiteboardItem[] }]
      };
    }
    return null;
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
    let parsed: unknown;
    try {
      parsed = JSON.parse(json);
    }
    catch {
      return false;
    }
    const normalized = WhiteboardState.normalizePersisted(parsed);
    if (!normalized) {
      return false;
    }
    this.restore(normalized);
    this.seq = normalized.seq;
    this.journal = [];
    this.journalTrimmedBeforeSeq = this.seq; // older tokens force reset deltas
    this.undoStack = [];
    this.redoStack = [];
    this.changeSelection(null);
    this.record('replace', '', 'user', 'restored a saved board');
    this.boardLoaded.next({ ItemCount: this.TotalItemCount });
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

  /**
   * Deep-copied serializable snapshot of the WHOLE board — every page's items plus the
   * page structure and counters (undo entries / ToJSON). Page items serialize in render
   * order (ascending Z).
   */
  protected snapshot(): WhiteboardStateJSON {
    return {
      version: 2,
      seq: this.seq,
      idCounter: this.idCounter,
      zCounter: this.zCounter,
      pageCounter: this.pageCounter,
      activePageId: this.activePageId,
      pages: this.pages.map((p) => ({
        id: p.ID,
        name: p.Name,
        author: p.Author,
        items: JSON.parse(JSON.stringify(Array.from(p.Items.values()).sort((a, b) => a.Z - b.Z))) as WhiteboardItem[]
      }))
    };
  }

  /**
   * Swap the whole board to a snapshot's pages/counters (drops a now-missing selection;
   * an unknown active-page id falls back to the first page; an empty page list gains a
   * fresh "Page 1" so the engine never runs page-less).
   */
  protected restore(snap: WhiteboardStateJSON): void {
    this.pages = (snap.pages ?? []).map((p) => ({
      ID: p.id,
      Name: p.name,
      Author: p.author === 'agent' ? 'agent' : 'user',
      Items: new Map((JSON.parse(JSON.stringify(p.items ?? [])) as WhiteboardItem[])
        .filter((i) => !!i && typeof i === 'object' && typeof i.ID === 'string')
        .map((i) => [i.ID, i]))
    }));
    if (this.pages.length === 0) {
      this.pages = [{ ID: 'page-1', Name: 'Page 1', Author: 'user', Items: new Map<string, WhiteboardItem>() }];
    }
    this.activePageId = this.pages.some((p) => UUIDsEqual(p.ID, snap.activePageId)) ? snap.activePageId : this.pages[0].ID;
    this.idCounter = snap.idCounter ?? 0;
    this.zCounter = snap.zCounter ?? 0;
    this.pageCounter = Math.max(snap.pageCounter ?? this.pages.length, this.pages.length);
    // drop selection members the restored active page no longer contains
    const surviving = this.selectedIds.filter((id) => this.items.has(id));
    if (surviving.length !== this.selectedIds.length) {
      this.applySelection(surviving);
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

  /**
   * Compose the human-readable tail line of deltas / summaries ("2 added, 1 moved. …"),
   * including which page is active and the full page list — so the model always knows
   * pages exist and which one its item entries describe.
   */
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
    return `${bits.join(', ')}. ${this.composePagesText()}`;
  }

  /** The page-aware scene sentence shared by every delta / summary tail line. */
  protected composePagesText(): string {
    const active = this.activePage;
    const index = this.pages.indexOf(active) + 1;
    const counts = `${this.ElementCount} elements (user ${this.CountByAuthor('user')} · agent ${this.CountByAuthor('agent')})`;
    if (this.pages.length === 1) {
      return `Active page "${active.Name}" (the only page) has ${counts}.`;
    }
    const others = this.pages
      .filter((p) => !UUIDsEqual(p.ID, active.ID))
      .map((p) => `"${p.Name}" (${p.Items.size})`)
      .join(', ');
    return `Active page "${active.Name}" (${index} of ${this.pages.length}) has ${counts}. Other pages: ${others}.`;
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
