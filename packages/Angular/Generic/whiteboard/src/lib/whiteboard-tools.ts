import {
  WHITEBOARD_FONT_SIZES, WhiteboardBounds, WhiteboardFontFamily, WhiteboardItem,
  WhiteboardItemPatch, WhiteboardPoint, WhiteboardShapeKind, WhiteboardState
} from './whiteboard-state';

/**
 * WHITEBOARD — the programmatic (agent-facing) mutation tool surface.
 *
 * Angular-free on purpose: `ApplyWhiteboardAgentTool` is the pure round-trip the host
 * component delegates to (the host adds the UI garnish — violet pop-in, toast, presence
 * cursor). The integration layer registers {@link WHITEBOARD_TOOL_DEFINITIONS} with its
 * agent/automation runtime so a co-author can call `Whiteboard_AddNote` etc.; tool-call
 * frames are routed back through {@link ApplyWhiteboardAgentTool}, which returns the JSON
 * result string fed back to the caller (e.g. as a realtime model's `tool_response`).
 */

/**
 * Any JSON-serializable value (the building block of {@link WhiteboardToolJSONObject}).
 * Structurally identical to `JSONValue` from `@memberjunction/ai` — re-declared locally
 * so this generic package carries no AI-framework dependency.
 */
export type WhiteboardToolJSONValue =
  | string
  | number
  | boolean
  | null
  | WhiteboardToolJSONValue[]
  | { [key: string]: WhiteboardToolJSONValue };

/** A JSON object (string-keyed map of {@link WhiteboardToolJSONValue}). */
export type WhiteboardToolJSONObject = { [key: string]: WhiteboardToolJSONValue };

/**
 * One JSON-described programmatic whiteboard tool: a name, a model-facing description,
 * and a JSON-schema parameter object. Structurally identical to (mutually assignable
 * with) `RealtimeToolDefinition` from `@memberjunction/ai`, re-declared locally so the
 * package stays dependency-light — consumers integrating with the MJ realtime stack can
 * pass {@link WHITEBOARD_TOOL_DEFINITIONS} straight into APIs typed against
 * `RealtimeToolDefinition[]`.
 */
export interface WhiteboardToolDefinition {
  /** The tool's name, used to match tool-call frames back to {@link ApplyWhiteboardAgentTool}. */
  Name: string;
  /** Human/model-readable description of what the tool does (drives when it gets called). */
  Description: string;
  /** A JSON-schema object describing the tool's parameters. */
  ParametersSchema: WhiteboardToolJSONObject;
}

/** Result payload (serialized to JSON) returned from every whiteboard tool call. */
export interface WhiteboardToolResult {
  success: boolean;
  /** ID of the item the tool created / mutated (when applicable). */
  itemId?: string;
  /** ID of the page the tool created / switched to / renamed (page tools only). */
  pageId?: string;
  /** Human summary the model can narrate ("Added a sticky note …"). */
  summary?: string;
  /** Error description when `success` is false. */
  error?: string;
}

/**
 * The shared name prefix of every whiteboard tool — the key an integration layer uses to
 * route all `Whiteboard_*` tool calls locally to {@link ApplyWhiteboardAgentTool} (e.g.
 * MJ's realtime sessions register it with `VoiceSessionService.RegisterClientToolHandler`
 * so calls execute in the browser instead of the server relay).
 */
export const WHITEBOARD_TOOL_PREFIX = 'Whiteboard_';

/** Names of the whiteboard tools, as registered with the agent/automation runtime. */
export const WHITEBOARD_TOOL_NAMES = {
  AddNote: 'Whiteboard_AddNote',
  AddShape: 'Whiteboard_AddShape',
  AddText: 'Whiteboard_AddText',
  AddMarkdown: 'Whiteboard_AddMarkdown',
  AddHtml: 'Whiteboard_AddHtml',
  UpdateContent: 'Whiteboard_UpdateContent',
  DrawConnector: 'Whiteboard_DrawConnector',
  Highlight: 'Whiteboard_Highlight',
  MoveItem: 'Whiteboard_MoveItem',
  RemoveItem: 'Whiteboard_RemoveItem',
  StyleItem: 'Whiteboard_StyleItem',
  AddPage: 'Whiteboard_AddPage',
  SwitchPage: 'Whiteboard_SwitchPage',
  RenamePage: 'Whiteboard_RenamePage'
} as const;

/** Max markdown source length accepted by AddMarkdown / UpdateContent (chars). */
export const WHITEBOARD_MARKDOWN_MAX_CHARS = 32_000;
/** Max HTML source length accepted by AddHtml / UpdateContent (chars). */
export const WHITEBOARD_HTML_MAX_CHARS = 64_000;

/**
 * The PAGE-level tools (they navigate/manage pages rather than items, so the shared
 * "targets the ACTIVE page" item-tool sentence is not appended to their descriptions).
 */
const WHITEBOARD_PAGE_TOOL_NAMES: ReadonlySet<string> = new Set<string>([
  WHITEBOARD_TOOL_NAMES.AddPage,
  WHITEBOARD_TOOL_NAMES.SwitchPage,
  WHITEBOARD_TOOL_NAMES.RenamePage
]);

/**
 * The shared sentence appended (once, programmatically — see
 * {@link WHITEBOARD_TOOL_DEFINITIONS}) to every ITEM tool's description, so the model
 * always knows item operations are scoped to the page that is currently active.
 */
export const WHITEBOARD_ACTIVE_PAGE_NOTE =
  ' This tool targets the ACTIVE page only — use Whiteboard_SwitchPage first to work with items on another page.';

/** The raw tool definitions, before the shared active-page sentence is appended. */
const RAW_WHITEBOARD_TOOL_DEFINITIONS: WhiteboardToolDefinition[] = [
  {
    Name: WHITEBOARD_TOOL_NAMES.AddNote,
    Description: 'Add a sticky note to the shared whiteboard. Your notes render in your reserved violet style so the user always knows they came from you.',
    ParametersSchema: {
      type: 'object',
      properties: {
        text: { type: 'string', description: 'The note text. Keep it short — sticky-note sized.' },
        x: { type: 'number', description: 'Left position in board coordinates. Omit to auto-place near existing content.' },
        y: { type: 'number', description: 'Top position in board coordinates. Omit to auto-place near existing content.' },
        fontSize: { type: 'number', enum: [...WHITEBOARD_FONT_SIZES], description: 'Optional note font size in px (curated steps).' }
      },
      required: ['text']
    }
  },
  {
    Name: WHITEBOARD_TOOL_NAMES.AddShape,
    Description: 'Add a labeled shape box (rect, ellipse or diamond) to the whiteboard — for process steps, tracks, groupings.',
    ParametersSchema: {
      type: 'object',
      properties: {
        label: { type: 'string', description: 'Main label rendered inside the shape.' },
        sub: { type: 'string', description: 'Optional smaller sub-label under the main label.' },
        shape: { type: 'string', enum: ['rect', 'ellipse', 'diamond'], description: 'Shape geometry. Defaults to rect.' },
        x: { type: 'number', description: 'Left position in board coordinates.' },
        y: { type: 'number', description: 'Top position in board coordinates.' },
        w: { type: 'number', description: 'Width in px. Defaults to 172.' },
        h: { type: 'number', description: 'Height in px. Defaults to 56.' }
      },
      required: ['label']
    }
  },
  {
    Name: WHITEBOARD_TOOL_NAMES.AddText,
    Description: 'Add a small free-floating text label to the whiteboard — for annotating the user\'s diagram without covering it.',
    ParametersSchema: {
      type: 'object',
      properties: {
        text: { type: 'string', description: 'The label text.' },
        x: { type: 'number', description: 'Left position in board coordinates.' },
        y: { type: 'number', description: 'Top position in board coordinates.' },
        w: { type: 'number', description: 'Optional wrap width in px (60-800). Long text wraps at this width — use for sentences/paragraphs; omit for short labels.' },
        fontSize: { type: 'number', enum: [...WHITEBOARD_FONT_SIZES], description: 'Optional label font size in px (curated steps).' },
        fontFamily: { type: 'string', enum: ['sans', 'serif', 'mono'], description: 'Optional font family. Defaults to sans.' },
        bold: { type: 'boolean', description: 'Optional bold weight. Labels render bold by default.' }
      },
      required: ['text']
    }
  },
  {
    Name: WHITEBOARD_TOOL_NAMES.AddMarkdown,
    Description: 'Add a rendered MARKDOWN panel to the whiteboard — headings, lists, code blocks and links, for richer illustrative content than a sticky note. The source is rendered safely (sanitized; raw HTML in the markdown is NOT executed). Renders in your reserved violet chrome.',
    ParametersSchema: {
      type: 'object',
      properties: {
        markdown: { type: 'string', description: `The markdown source (max ${WHITEBOARD_MARKDOWN_MAX_CHARS} chars).` },
        x: { type: 'number', description: 'Left position in board coordinates. Omit to auto-place near existing content.' },
        y: { type: 'number', description: 'Top position in board coordinates.' },
        w: { type: 'number', description: 'Panel width in px (160-800). Defaults to 280.' },
        h: { type: 'number', description: 'Optional max height in px (80-800); content beyond it is clipped. Omit for content-driven height.' }
      },
      required: ['markdown']
    }
  },
  {
    Name: WHITEBOARD_TOOL_NAMES.AddHtml,
    Description: 'Add an interactive HTML widget to the whiteboard — a self-contained HTML document (inline CSS/JS allowed) rendered in a STRICTLY SANDBOXED iframe with an opaque origin: scripts run isolated with NO access to the app, its session, cookies or storage, and network access is not guaranteed — make the widget fully self-contained (no external scripts, styles or data). USE WIDGETS TO TEACH AND GET USER INPUT: inline SVG diagrams and explainers, CSS concept animations, micro-quizzes and micro-forms. To collect input, have a button/form handler call MJWhiteboard.submit(data) — the host injects that helper into every widget automatically, and the submitted data (JSON-serialized, max 8000 chars) reaches you as a "[whiteboard] the user submitted input…" context note. Example: a one-question quiz whose Submit button calls MJWhiteboard.submit({question:"…",answer:picked}). PASSIVE FORMS NEED NO SCRIPTING: button/select/typing activity inside the widget reaches you automatically as ambient "[whiteboard]" background context notes — reserve MJWhiteboard.submit for explicit submissions.',
    ParametersSchema: {
      type: 'object',
      properties: {
        html: { type: 'string', description: `The widget's full HTML source (max ${WHITEBOARD_HTML_MAX_CHARS} chars). Self-contained — inline everything.` },
        title: { type: 'string', description: 'Optional short title shown on the widget header bar.' },
        x: { type: 'number', description: 'Left position in board coordinates. Omit to auto-place near existing content.' },
        y: { type: 'number', description: 'Top position in board coordinates.' },
        w: { type: 'number', description: 'Widget width in px (200-960). Defaults to 360.' },
        h: { type: 'number', description: 'Widget height in px (120-800). Defaults to 240.' }
      },
      required: ['html']
    }
  },
  {
    Name: WHITEBOARD_TOOL_NAMES.UpdateContent,
    Description: 'Replace the CONTENT of an existing whiteboard item: pass exactly one of "markdown" (for a markdown panel), "html" (for an HTML widget — re-renders its sandboxed iframe), or "text" (for a sticky note or text label). The field must match the item\'s kind.',
    ParametersSchema: {
      type: 'object',
      properties: {
        itemId: { type: 'string', description: 'ID of the item to update (from a scene delta), e.g. "markdown-3".' },
        markdown: { type: 'string', description: `New markdown source — markdown panels only (max ${WHITEBOARD_MARKDOWN_MAX_CHARS} chars).` },
        html: { type: 'string', description: `New HTML source — HTML widgets only (max ${WHITEBOARD_HTML_MAX_CHARS} chars). Still rendered sandboxed.` },
        text: { type: 'string', description: 'New text — sticky notes and text labels only.' },
        title: { type: 'string', description: 'Optional new header title — HTML widgets only (alongside "html", or alone).' }
      },
      required: ['itemId']
    }
  },
  {
    Name: WHITEBOARD_TOOL_NAMES.DrawConnector,
    Description: 'Draw an arrow connector between two whiteboard items (by item id), or between two absolute points.',
    ParametersSchema: {
      type: 'object',
      properties: {
        fromId: { type: 'string', description: 'ID of the source item (from a scene delta), e.g. "shape-2".' },
        toId: { type: 'string', description: 'ID of the target item.' },
        fromX: { type: 'number', description: 'Source X when not anchoring to an item.' },
        fromY: { type: 'number', description: 'Source Y when not anchoring to an item.' },
        toX: { type: 'number', description: 'Target X when not anchoring to an item.' },
        toY: { type: 'number', description: 'Target Y when not anchoring to an item.' }
      }
    }
  },
  {
    Name: WHITEBOARD_TOOL_NAMES.Highlight,
    Description: 'Pulse a highlight region on the whiteboard while you narrate — pointing without touching the user\'s work. Pass itemIds to highlight around existing items, or an explicit x/y/w/h region. The user dismisses it with a click.',
    ParametersSchema: {
      type: 'object',
      properties: {
        itemIds: { type: 'array', items: { type: 'string' }, description: 'IDs of items to highlight around (bounding box + padding).' },
        x: { type: 'number', description: 'Region left (when not using itemIds).' },
        y: { type: 'number', description: 'Region top.' },
        w: { type: 'number', description: 'Region width.' },
        h: { type: 'number', description: 'Region height.' },
        label: { type: 'string', description: 'Optional tag shown on the region edge.' }
      }
    }
  },
  {
    Name: WHITEBOARD_TOOL_NAMES.MoveItem,
    Description: 'Move and/or RESIZE a whiteboard item: provide x+y to reposition (board coordinates of the top-left corner), w and/or h to resize (pixels, min 24), or all of them together.',
    ParametersSchema: {
      type: 'object',
      properties: {
        itemId: { type: 'string', description: 'ID of the item to move/resize.' },
        x: { type: 'number', description: 'New left position (provide together with y to move).' },
        y: { type: 'number', description: 'New top position (provide together with x to move).' },
        w: { type: 'number', description: 'New width in pixels (resize; min 24).' },
        h: { type: 'number', description: 'New height in pixels (resize; min 24).' }
      },
      required: ['itemId']
    }
  },
  {
    Name: WHITEBOARD_TOOL_NAMES.RemoveItem,
    Description: 'Remove an item from the whiteboard. Prefer removing only your own items unless the user asks.',
    ParametersSchema: {
      type: 'object',
      properties: {
        itemId: { type: 'string', description: 'ID of the item to remove.' }
      },
      required: ['itemId']
    }
  },
  {
    Name: WHITEBOARD_TOOL_NAMES.StyleItem,
    Description: 'Restyle the text of an existing sticky note or text label — font size, family, bold, and (text labels only) color. Pass at least one style field.',
    ParametersSchema: {
      type: 'object',
      properties: {
        itemId: { type: 'string', description: 'ID of the sticky note or text label to restyle.' },
        fontSize: { type: 'number', enum: [...WHITEBOARD_FONT_SIZES], description: 'New font size in px (curated steps).' },
        fontFamily: { type: 'string', enum: ['sans', 'serif', 'mono'], description: 'New font family.' },
        bold: { type: 'boolean', description: 'Bold on/off.' },
        color: { type: 'string', description: 'Hex text color, e.g. "#fbbf24" (text labels only — violet is already yours).' }
      },
      required: ['itemId']
    }
  },
  {
    Name: WHITEBOARD_TOOL_NAMES.AddPage,
    Description: 'Create a NEW PAGE on the whiteboard and switch to it. Start a new page for a new topic, exercise or diagram instead of crowding the current board — pages keep prior work intact and the user can flip back any time. All item tools (notes, shapes, widgets, …) always target the page that is currently active.',
    ParametersSchema: {
      type: 'object',
      properties: {
        name: { type: 'string', description: 'Optional page name (e.g. "Practice problems"). Omit to auto-name it "Page N".' }
      }
    }
  },
  {
    Name: WHITEBOARD_TOOL_NAMES.SwitchPage,
    Description: 'Switch the whiteboard to another existing page (by page name, case-insensitive, or page id). Use it to return to earlier work — the page list (with the active page marked) is included in every scene update you receive. Item tools only see the active page, so switch before editing items that live elsewhere.',
    ParametersSchema: {
      type: 'object',
      properties: {
        name: { type: 'string', description: 'The target page\'s name (case-insensitive) or its id, e.g. "Page 2" or "page-2".' }
      },
      required: ['name']
    }
  },
  {
    Name: WHITEBOARD_TOOL_NAMES.RenamePage,
    Description: 'Rename an existing whiteboard page — give pages meaningful names ("Warm-up", "Final design") so the user can navigate them. Identify the page by its current name (case-insensitive) or id.',
    ParametersSchema: {
      type: 'object',
      properties: {
        name: { type: 'string', description: 'The page\'s CURRENT name (case-insensitive) or its id.' },
        newName: { type: 'string', description: 'The new page name. Keep it short — it renders on a tab chip.' }
      },
      required: ['name', 'newName']
    }
  }
];

/**
 * The full `Whiteboard_*` tool set, ready for registration with an agent/automation
 * runtime (shape-compatible with `RealtimeToolDefinition` from `@memberjunction/ai`).
 *
 * Every ITEM tool's description carries the shared {@link WHITEBOARD_ACTIVE_PAGE_NOTE}
 * sentence (appended programmatically here — ONE mechanism, not eleven hand edits);
 * the three page tools keep their page-navigation descriptions unmodified.
 */
export const WHITEBOARD_TOOL_DEFINITIONS: WhiteboardToolDefinition[] =
  RAW_WHITEBOARD_TOOL_DEFINITIONS.map((def) =>
    WHITEBOARD_PAGE_TOOL_NAMES.has(def.Name)
      ? def
      : { ...def, Description: `${def.Description}${WHITEBOARD_ACTIVE_PAGE_NOTE}` });

/** Padding added around item bounds when highlighting by itemIds. */
const HIGHLIGHT_PAD = 18;

/** The font family keys accepted by the style tool params. */
const WHITEBOARD_FONT_FAMILIES: readonly WhiteboardFontFamily[] = ['sans', 'serif', 'mono'];

/** Hex colors accepted for text color ("#abc" / "#aabbcc"). */
const HEX_COLOR = /^#(?:[0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/;

function ok(itemId: string | undefined, summary: string): string {
  const result: WhiteboardToolResult = { success: true, itemId, summary };
  return JSON.stringify(result);
}

function fail(error: string): string {
  const result: WhiteboardToolResult = { success: false, error };
  return JSON.stringify(result);
}

function asString(value: unknown): string | undefined {
  return typeof value === 'string' && value.length > 0 ? value : undefined;
}

function asNumber(value: unknown): number | undefined {
  return typeof value === 'number' && Number.isFinite(value) ? value : undefined;
}

/**
 * Extract + validate the optional text-style args shared by AddNote / AddText / StyleItem
 * into an {@link WhiteboardItemPatch}. `allowColor` is true only for text labels — sticky
 * tints are categorical and agent violet comes from authorship, never from `Color`.
 */
function textStylePatch(args: Record<string, unknown>, allowColor: boolean): { patch: WhiteboardItemPatch } | { error: string } {
  const patch: WhiteboardItemPatch = {};
  if (args['fontSize'] !== undefined) {
    const size = asNumber(args['fontSize']);
    if (size === undefined || !WHITEBOARD_FONT_SIZES.includes(size)) {
      return { error: `"fontSize" must be one of ${WHITEBOARD_FONT_SIZES.join(', ')}.` };
    }
    patch.FontSize = size;
  }
  if (args['fontFamily'] !== undefined) {
    const family = args['fontFamily'];
    if (typeof family !== 'string' || !(WHITEBOARD_FONT_FAMILIES as readonly string[]).includes(family)) {
      return { error: `"fontFamily" must be one of ${WHITEBOARD_FONT_FAMILIES.join(', ')}.` };
    }
    patch.FontFamily = family as WhiteboardFontFamily;
  }
  if (args['bold'] !== undefined) {
    if (typeof args['bold'] !== 'boolean') {
      return { error: '"bold" must be a boolean.' };
    }
    patch.FontWeight = args['bold'] ? 700 : 400;
  }
  if (args['color'] !== undefined) {
    if (!allowColor) {
      return { error: '"color" only applies to text labels.' };
    }
    const color = args['color'];
    if (typeof color !== 'string' || !HEX_COLOR.test(color)) {
      return { error: '"color" must be a hex color like "#fbbf24".' };
    }
    patch.Color = color;
  }
  return { patch };
}

/** Auto-placement when the agent omits coordinates: just right of existing content. */
function autoPlace(state: WhiteboardState): WhiteboardPoint {
  const bounds = state.ContentBounds();
  if (!bounds) {
    return { X: 120, Y: 100 };
  }
  return { X: bounds.X + bounds.W + 40, Y: bounds.Y + 20 };
}

function unionBounds(state: WhiteboardState, items: WhiteboardItem[]): WhiteboardBounds {
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  for (const item of items) {
    const b = state.ItemBounds(item);
    minX = Math.min(minX, b.X);
    minY = Math.min(minY, b.Y);
    maxX = Math.max(maxX, b.X + b.W);
    maxY = Math.max(maxY, b.Y + b.H);
  }
  return { X: minX, Y: minY, W: maxX - minX, H: maxY - minY };
}

/**
 * Execute one agent whiteboard tool against the state engine (author `'agent'`, one undo
 * batch per call) and return the JSON result string for the tool round-trip.
 *
 * Never throws: malformed args / unknown tools / unknown item IDs return a
 * `{ success: false, error }` payload so the model can self-correct conversationally.
 */
export function ApplyWhiteboardAgentTool(state: WhiteboardState, toolName: string, argsJson: string): string {
  let args: Record<string, unknown>;
  try {
    const parsed: unknown = argsJson.trim().length === 0 ? {} : JSON.parse(argsJson);
    if (parsed === null || typeof parsed !== 'object' || Array.isArray(parsed)) {
      return fail('Tool arguments must be a JSON object.');
    }
    args = parsed as Record<string, unknown>;
  }
  catch {
    return fail('Tool arguments are not valid JSON.');
  }

  switch (toolName) {
    case WHITEBOARD_TOOL_NAMES.AddNote: return addNote(state, args);
    case WHITEBOARD_TOOL_NAMES.AddShape: return addShape(state, args);
    case WHITEBOARD_TOOL_NAMES.AddText: return addText(state, args);
    case WHITEBOARD_TOOL_NAMES.AddMarkdown: return addMarkdown(state, args);
    case WHITEBOARD_TOOL_NAMES.AddHtml: return addHtml(state, args);
    case WHITEBOARD_TOOL_NAMES.UpdateContent: return updateContent(state, args);
    case WHITEBOARD_TOOL_NAMES.DrawConnector: return drawConnector(state, args);
    case WHITEBOARD_TOOL_NAMES.Highlight: return highlight(state, args);
    case WHITEBOARD_TOOL_NAMES.MoveItem: return moveItem(state, args);
    case WHITEBOARD_TOOL_NAMES.RemoveItem: return removeItem(state, args);
    case WHITEBOARD_TOOL_NAMES.StyleItem: return styleItem(state, args);
    case WHITEBOARD_TOOL_NAMES.AddPage: return addPage(state, args);
    case WHITEBOARD_TOOL_NAMES.SwitchPage: return switchPage(state, args);
    case WHITEBOARD_TOOL_NAMES.RenamePage: return renamePage(state, args);
    default:
      return fail(`Unknown whiteboard tool "${toolName}".`);
  }
}

/** Success payload for the page tools (carries `pageId` instead of `itemId`). */
function okPage(pageId: string, summary: string): string {
  const result: WhiteboardToolResult = { success: true, pageId, summary };
  return JSON.stringify(result);
}

/** The page list rendered into not-found errors so the model can self-correct. */
function pageListText(state: WhiteboardState): string {
  return state.Pages.map((p) => `"${p.Name}"${p.Active ? ' (active)' : ''}`).join(', ');
}

function addPage(state: WhiteboardState, args: Record<string, unknown>): string {
  if (args['name'] !== undefined && typeof args['name'] !== 'string') {
    return fail('AddPage: "name" must be a string when provided.');
  }
  const page = state.AddPage(asString(args['name']), 'agent');
  if (!page) {
    return fail('The host application canceled this operation.');
  }
  return okPage(page.ID, `Created page "${page.Name}" and switched to it — new items will land on this page.`);
}

function switchPage(state: WhiteboardState, args: Record<string, unknown>): string {
  const name = asString(args['name']);
  if (!name) {
    return fail('SwitchPage requires a non-empty "name" (the page\'s name or id).');
  }
  const page = state.FindPage(name);
  if (!page) {
    return fail(`SwitchPage: no page named "${name}". Pages: ${pageListText(state)}.`);
  }
  if (!state.SwitchPage(page.ID, 'agent')) {
    return fail('The host application canceled this operation.');
  }
  return okPage(page.ID, `Switched to page "${page.Name}" (${page.ItemCount} items).`);
}

function renamePage(state: WhiteboardState, args: Record<string, unknown>): string {
  const name = asString(args['name']);
  const newName = asString(args['newName']);
  if (!name || !newName) {
    return fail('RenamePage requires a non-empty "name" (current name or id) and "newName".');
  }
  const page = state.FindPage(name);
  if (!page) {
    return fail(`RenamePage: no page named "${name}". Pages: ${pageListText(state)}.`);
  }
  if (!state.RenamePage(page.ID, newName, 'agent')) {
    return fail('The host application canceled this operation.');
  }
  return okPage(page.ID, `Renamed page "${page.Name}" to "${newName.trim()}".`);
}

function addNote(state: WhiteboardState, args: Record<string, unknown>): string {
  const text = asString(args['text']);
  if (!text) {
    return fail('AddNote requires a non-empty "text".');
  }
  const style = textStylePatch(args, false);
  if ('error' in style) {
    return fail(`AddNote: ${style.error}`);
  }
  const place = autoPlace(state);
  const x = asNumber(args['x']) ?? place.X;
  const y = asNumber(args['y']) ?? place.Y;
  const item = state.RunBatch(() =>
    state.AddItem({ Kind: 'sticky', X: x, Y: y, Text: text, Rotation: 1.2, ...style.patch }, 'agent'));
  if (!item) {
    return fail('The host application canceled this operation.');
  }
  return ok(item.ID, `Added sticky note "${text}" at (${Math.round(x)}, ${Math.round(y)}).`);
}

function addShape(state: WhiteboardState, args: Record<string, unknown>): string {
  const label = asString(args['label']);
  if (!label) {
    return fail('AddShape requires a non-empty "label".');
  }
  const shapeRaw = asString(args['shape']) ?? 'rect';
  if (shapeRaw !== 'rect' && shapeRaw !== 'ellipse' && shapeRaw !== 'diamond') {
    return fail(`AddShape "shape" must be rect, ellipse or diamond (got "${shapeRaw}").`);
  }
  const shape: WhiteboardShapeKind = shapeRaw;
  const place = autoPlace(state);
  const x = asNumber(args['x']) ?? place.X;
  const y = asNumber(args['y']) ?? place.Y;
  const w = asNumber(args['w']) ?? 172;
  const h = asNumber(args['h']) ?? 56;
  const item = state.RunBatch(() =>
    state.AddItem({ Kind: 'shape', Shape: shape, X: x, Y: y, W: w, H: h, Label: label, Sub: asString(args['sub']) }, 'agent'));
  if (!item) {
    return fail('The host application canceled this operation.');
  }
  return ok(item.ID, `Added ${shape} "${label}" at (${Math.round(x)}, ${Math.round(y)}).`);
}

function addText(state: WhiteboardState, args: Record<string, unknown>): string {
  const text = asString(args['text']);
  if (!text) {
    return fail('AddText requires a non-empty "text".');
  }
  const style = textStylePatch(args, false);
  if ('error' in style) {
    return fail(`AddText: ${style.error}`);
  }
  const place = autoPlace(state);
  const x = asNumber(args['x']) ?? place.X;
  const y = asNumber(args['y']) ?? place.Y;
  const wRaw = asNumber(args['w']);
  const w = wRaw !== undefined ? Math.min(800, Math.max(60, Math.round(wRaw))) : undefined;
  const item = state.RunBatch(() => state.AddItem({ Kind: 'text', X: x, Y: y, Text: text, ...(w !== undefined ? { W: w } : {}), ...style.patch }, 'agent'));
  if (!item) {
    return fail('The host application canceled this operation.');
  }
  return ok(item.ID, `Added text label "${text}".`);
}

/** Clamp an optional numeric arg into [min, max], or return the default when omitted. */
function clampedNumber(value: unknown, min: number, max: number, fallback: number | undefined): number | undefined {
  const raw = asNumber(value);
  if (raw === undefined) {
    return fallback;
  }
  return Math.min(max, Math.max(min, Math.round(raw)));
}

function addMarkdown(state: WhiteboardState, args: Record<string, unknown>): string {
  const markdown = asString(args['markdown']);
  if (!markdown) {
    return fail('AddMarkdown requires a non-empty "markdown".');
  }
  if (markdown.length > WHITEBOARD_MARKDOWN_MAX_CHARS) {
    return fail(`AddMarkdown: "markdown" exceeds the ${WHITEBOARD_MARKDOWN_MAX_CHARS}-character limit (got ${markdown.length}).`);
  }
  const place = autoPlace(state);
  const x = asNumber(args['x']) ?? place.X;
  const y = asNumber(args['y']) ?? place.Y;
  const w = clampedNumber(args['w'], 160, 800, 280) as number;
  const h = clampedNumber(args['h'], 80, 800, undefined);
  const item = state.RunBatch(() =>
    state.AddItem({ Kind: 'markdown', X: x, Y: y, W: w, ...(h !== undefined ? { H: h } : {}), Markdown: markdown }, 'agent'));
  if (!item) {
    return fail('The host application canceled this operation.');
  }
  return ok(item.ID, `Added a markdown panel at (${Math.round(x)}, ${Math.round(y)}).`);
}

function addHtml(state: WhiteboardState, args: Record<string, unknown>): string {
  const html = asString(args['html']);
  if (!html) {
    return fail('AddHtml requires a non-empty "html".');
  }
  if (html.length > WHITEBOARD_HTML_MAX_CHARS) {
    return fail(`AddHtml: "html" exceeds the ${WHITEBOARD_HTML_MAX_CHARS}-character limit (got ${html.length}).`);
  }
  const title = asString(args['title']);
  const place = autoPlace(state);
  const x = asNumber(args['x']) ?? place.X;
  const y = asNumber(args['y']) ?? place.Y;
  const w = clampedNumber(args['w'], 200, 960, 360) as number;
  const h = clampedNumber(args['h'], 120, 800, 240) as number;
  const item = state.RunBatch(() =>
    state.AddItem({ Kind: 'html', X: x, Y: y, W: w, H: h, Html: html, Title: title }, 'agent'));
  if (!item) {
    return fail('The host application canceled this operation.');
  }
  return ok(item.ID, `Added an HTML widget${title ? ` "${title}"` : ''} at (${Math.round(x)}, ${Math.round(y)}) — rendered sandboxed.`);
}

/** Validate one UpdateContent content field against the target item's kind. Returns the patch or an error. */
function contentPatchFor(item: WhiteboardItem, args: Record<string, unknown>): { patch: WhiteboardItemPatch } | { error: string } {
  if (args['text'] !== undefined && typeof args['text'] !== 'string') {
    return { error: '"text" must be a string.' };
  }
  const markdown = asString(args['markdown']);
  const html = asString(args['html']);
  const text = args['text'] as string | undefined;
  const title = asString(args['title']);
  const contentFields = [markdown, html, text].filter((v) => v !== undefined).length;
  if (contentFields > 1) {
    return { error: 'pass exactly ONE of "markdown", "html" or "text".' };
  }
  if (contentFields === 0 && title === undefined) {
    return { error: 'pass one of "markdown", "html", "text" (or "title" for an HTML widget).' };
  }
  if (markdown !== undefined) {
    if (item.Kind !== 'markdown') {
      return { error: `"markdown" only applies to markdown panels (item ${item.ID} is a ${item.Kind}).` };
    }
    if (markdown.length > WHITEBOARD_MARKDOWN_MAX_CHARS) {
      return { error: `"markdown" exceeds the ${WHITEBOARD_MARKDOWN_MAX_CHARS}-character limit (got ${markdown.length}).` };
    }
    return { patch: { Markdown: markdown } };
  }
  if (html !== undefined || title !== undefined) {
    if (item.Kind !== 'html') {
      return { error: `"html"/"title" only apply to HTML widgets (item ${item.ID} is a ${item.Kind}).` };
    }
    if (html !== undefined && html.length > WHITEBOARD_HTML_MAX_CHARS) {
      return { error: `"html" exceeds the ${WHITEBOARD_HTML_MAX_CHARS}-character limit (got ${html.length}).` };
    }
    const patch: WhiteboardItemPatch = {};
    if (html !== undefined) {
      patch.Html = html;
    }
    if (title !== undefined) {
      patch.Title = title;
    }
    return { patch };
  }
  // text — sticky notes and free text labels
  if (item.Kind !== 'sticky' && item.Kind !== 'text') {
    return { error: `"text" only applies to sticky notes and text labels (item ${item.ID} is a ${item.Kind}).` };
  }
  if (!text || text.trim().length === 0) {
    return { error: '"text" must be a non-empty string.' };
  }
  return { patch: { Text: text } };
}

function updateContent(state: WhiteboardState, args: Record<string, unknown>): string {
  const itemId = asString(args['itemId']);
  if (!itemId) {
    return fail('UpdateContent requires "itemId".');
  }
  const item = state.GetItem(itemId);
  if (!item) {
    return fail(`UpdateContent: no item with id "${itemId}".`);
  }
  const result = contentPatchFor(item, args);
  if ('error' in result) {
    return fail(`UpdateContent: ${result.error}`);
  }
  // ONE UpdateItem in ONE batch — single undo step, single journal entry.
  const applied = state.RunBatch(() => state.UpdateItem(itemId, result.patch, 'agent'));
  if (!applied) {
    return fail('The host application canceled this operation.');
  }
  return ok(itemId, `Updated the content of ${itemId}.`);
}

function drawConnector(state: WhiteboardState, args: Record<string, unknown>): string {
  const fromId = asString(args['fromId']);
  const toId = asString(args['toId']);
  const fromX = asNumber(args['fromX']);
  const fromY = asNumber(args['fromY']);
  const toX = asNumber(args['toX']);
  const toY = asNumber(args['toY']);

  if (fromId && !state.GetItem(fromId)) {
    return fail(`DrawConnector: no item with id "${fromId}".`);
  }
  if (toId && !state.GetItem(toId)) {
    return fail(`DrawConnector: no item with id "${toId}".`);
  }
  const hasFrom = !!fromId || (fromX !== undefined && fromY !== undefined);
  const hasTo = !!toId || (toX !== undefined && toY !== undefined);
  if (!hasFrom || !hasTo) {
    return fail('DrawConnector requires both endpoints: fromId or fromX/fromY, and toId or toX/toY.');
  }
  const item = state.RunBatch(() =>
    state.AddItem({
      Kind: 'connector',
      FromItemID: fromId ?? null,
      ToItemID: toId ?? null,
      FromPoint: fromId ? null : { X: fromX as number, Y: fromY as number },
      ToPoint: toId ? null : { X: toX as number, Y: toY as number }
    }, 'agent'));
  if (!item) {
    return fail('The host application canceled this operation.');
  }
  return ok(item.ID, `Drew a connector ${fromId ?? '(point)'} → ${toId ?? '(point)'}.`);
}

function highlight(state: WhiteboardState, args: Record<string, unknown>): string {
  const label = asString(args['label']);
  const idsRaw = args['itemIds'];
  if (Array.isArray(idsRaw) && idsRaw.length > 0) {
    const items: WhiteboardItem[] = [];
    for (const raw of idsRaw) {
      const id = asString(raw);
      const item = id ? state.GetItem(id) : undefined;
      if (!item) {
        return fail(`Highlight: no item with id "${String(raw)}".`);
      }
      items.push(item);
    }
    const b = unionBounds(state, items);
    const region = state.RunBatch(() =>
      state.Highlight(b.X - HIGHLIGHT_PAD, b.Y - HIGHLIGHT_PAD, b.W + HIGHLIGHT_PAD * 2, b.H + HIGHLIGHT_PAD * 2, label, 'agent'));
    if (!region) {
      return fail('The host application canceled this operation.');
    }
    return ok(region.ID, `Highlighted ${items.length} item(s).`);
  }
  const x = asNumber(args['x']);
  const y = asNumber(args['y']);
  const w = asNumber(args['w']);
  const h = asNumber(args['h']);
  if (x === undefined || y === undefined || w === undefined || h === undefined) {
    return fail('Highlight requires itemIds, or an explicit x/y/w/h region.');
  }
  const region = state.RunBatch(() => state.Highlight(x, y, w, h, label, 'agent'));
  if (!region) {
    return fail('The host application canceled this operation.');
  }
  return ok(region.ID, `Highlighted the region at (${Math.round(x)}, ${Math.round(y)}).`);
}

function moveItem(state: WhiteboardState, args: Record<string, unknown>): string {
  const itemId = asString(args['itemId']);
  const x = asNumber(args['x']);
  const y = asNumber(args['y']);
  const w = asNumber(args['w']);
  const h = asNumber(args['h']);
  const moving = x !== undefined && y !== undefined;
  const resizing = w !== undefined || h !== undefined;
  if (!itemId || (!moving && !resizing)) {
    return fail('MoveItem requires "itemId" plus "x"+"y" (move), "w"/"h" (resize), or both.');
  }
  if (!state.GetItem(itemId)) {
    // Self-correction context: the id may be mistyped — or the item may live on
    // another PAGE (item lookups are scoped to the active page).
    const ids = state.Items.slice(0, 20).map((i) => i.ID).join(', ') || '(none)';
    return fail(
      `MoveItem: no item with id "${itemId}" on the active page "${state.ActivePageName}". ` +
      `Items here: ${ids}. If it lives on another page, switch first with ${WHITEBOARD_TOOL_NAMES.SwitchPage}.`);
  }
  const applied = state.RunBatch(() => {
    let okAll = true;
    if (moving) {
      okAll = state.MoveItem(itemId, x, y, 'agent') && okAll;
    }
    if (resizing) {
      const patch: WhiteboardItemPatch = {};
      if (w !== undefined) {
        patch.W = Math.max(24, w);
      }
      if (h !== undefined) {
        patch.H = Math.max(24, h);
      }
      okAll = state.UpdateItem(itemId, patch, 'agent') && okAll;
    }
    return okAll;
  });
  if (!applied) {
    return fail('The host application canceled this operation.');
  }
  const parts: string[] = [];
  if (moving) {
    parts.push(`moved to (${Math.round(x)}, ${Math.round(y)})`);
  }
  if (resizing) {
    parts.push(`resized to ${w !== undefined ? Math.round(Math.max(24, w)) : '(unchanged)'}×${h !== undefined ? Math.round(Math.max(24, h)) : '(unchanged)'}`);
  }
  return ok(itemId, `${itemId} ${parts.join(' and ')}.`);
}

function removeItem(state: WhiteboardState, args: Record<string, unknown>): string {
  const itemId = asString(args['itemId']);
  if (!itemId) {
    return fail('RemoveItem requires "itemId".');
  }
  if (!state.GetItem(itemId)) {
    return fail(`RemoveItem: no item with id "${itemId}".`);
  }
  const removed = state.RunBatch(() => state.RemoveItem(itemId, 'agent'));
  if (!removed) {
    return fail('The host application canceled this operation.');
  }
  return ok(itemId, `Removed ${itemId}.`);
}

function styleItem(state: WhiteboardState, args: Record<string, unknown>): string {
  const itemId = asString(args['itemId']);
  if (!itemId) {
    return fail('StyleItem requires "itemId".');
  }
  const item = state.GetItem(itemId);
  if (!item) {
    return fail(`StyleItem: no item with id "${itemId}".`);
  }
  if (item.Kind !== 'sticky' && item.Kind !== 'text') {
    return fail(`StyleItem only styles sticky notes and text labels (got a ${item.Kind}).`);
  }
  const style = textStylePatch(args, item.Kind === 'text');
  if ('error' in style) {
    return fail(`StyleItem: ${style.error}`);
  }
  if (Object.keys(style.patch).length === 0) {
    return fail('StyleItem requires at least one of "fontSize", "fontFamily", "bold" or "color".');
  }
  // ONE UpdateItem inside ONE batch — a single undo step and a single journal entry,
  // so the toast Undo reverts it whole and the perception feed sees one update.
  const styled = state.RunBatch(() => state.UpdateItem(itemId, style.patch, 'agent'));
  if (!styled) {
    return fail('The host application canceled this operation.');
  }
  return ok(itemId, `Restyled ${itemId}.`);
}
