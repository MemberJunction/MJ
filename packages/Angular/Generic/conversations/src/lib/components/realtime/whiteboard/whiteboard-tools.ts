import { RealtimeToolDefinition } from '@memberjunction/ai';
import {
  WHITEBOARD_FONT_SIZES, WhiteboardBounds, WhiteboardFontFamily, WhiteboardItem,
  WhiteboardItemPatch, WhiteboardPoint, WhiteboardShapeKind, WhiteboardState
} from './whiteboard-state';

/**
 * LIVE WHITEBOARD — the agent-facing channel tool surface.
 *
 * Angular-free on purpose: `ApplyWhiteboardAgentTool` is the pure round-trip the host
 * component delegates to (the host adds the UI garnish — violet pop-in, toast, presence
 * cursor). The integration layer registers {@link WHITEBOARD_TOOL_DEFINITIONS} with the
 * realtime session so the co-agent can call `Whiteboard_AddNote` etc.; tool-call frames
 * are routed back through {@link ApplyWhiteboardAgentTool}, which returns the JSON result
 * string fed to the model as the `tool_response`.
 */

/** Result payload (serialized to JSON) returned from every whiteboard tool call. */
export interface WhiteboardToolResult {
  success: boolean;
  /** ID of the item the tool created / mutated (when applicable). */
  itemId?: string;
  /** Human summary the model can narrate ("Added a sticky note …"). */
  summary?: string;
  /** Error description when `success` is false. */
  error?: string;
}

/**
 * The shared name prefix of every whiteboard channel tool — the key the integration layer
 * registers with `VoiceSessionService.RegisterClientToolHandler` so all `Whiteboard_*` calls
 * route locally to {@link ApplyWhiteboardAgentTool} instead of the server relay.
 */
export const WHITEBOARD_TOOL_PREFIX = 'Whiteboard_';

/** Names of the whiteboard channel tools, as registered with the realtime session. */
export const WHITEBOARD_TOOL_NAMES = {
  AddNote: 'Whiteboard_AddNote',
  AddShape: 'Whiteboard_AddShape',
  AddText: 'Whiteboard_AddText',
  DrawConnector: 'Whiteboard_DrawConnector',
  Highlight: 'Whiteboard_Highlight',
  MoveItem: 'Whiteboard_MoveItem',
  RemoveItem: 'Whiteboard_RemoveItem',
  StyleItem: 'Whiteboard_StyleItem'
} as const;

/**
 * Tool definitions for session registration (shape-compatible with
 * {@link RealtimeToolDefinition} from `@memberjunction/ai`).
 */
export const WHITEBOARD_TOOL_DEFINITIONS: RealtimeToolDefinition[] = [
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
    Description: 'Move a whiteboard item to a new position (board coordinates of its top-left corner).',
    ParametersSchema: {
      type: 'object',
      properties: {
        itemId: { type: 'string', description: 'ID of the item to move.' },
        x: { type: 'number', description: 'New left position.' },
        y: { type: 'number', description: 'New top position.' }
      },
      required: ['itemId', 'x', 'y']
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
  }
];

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
    case WHITEBOARD_TOOL_NAMES.DrawConnector: return drawConnector(state, args);
    case WHITEBOARD_TOOL_NAMES.Highlight: return highlight(state, args);
    case WHITEBOARD_TOOL_NAMES.MoveItem: return moveItem(state, args);
    case WHITEBOARD_TOOL_NAMES.RemoveItem: return removeItem(state, args);
    case WHITEBOARD_TOOL_NAMES.StyleItem: return styleItem(state, args);
    default:
      return fail(`Unknown whiteboard tool "${toolName}".`);
  }
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
  return ok(item.ID, `Added text label "${text}".`);
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
  return ok(region.ID, `Highlighted the region at (${Math.round(x)}, ${Math.round(y)}).`);
}

function moveItem(state: WhiteboardState, args: Record<string, unknown>): string {
  const itemId = asString(args['itemId']);
  const x = asNumber(args['x']);
  const y = asNumber(args['y']);
  if (!itemId || x === undefined || y === undefined) {
    return fail('MoveItem requires "itemId", "x" and "y".');
  }
  if (!state.GetItem(itemId)) {
    return fail(`MoveItem: no item with id "${itemId}".`);
  }
  state.RunBatch(() => state.MoveItem(itemId, x, y, 'agent'));
  return ok(itemId, `Moved ${itemId} to (${Math.round(x)}, ${Math.round(y)}).`);
}

function removeItem(state: WhiteboardState, args: Record<string, unknown>): string {
  const itemId = asString(args['itemId']);
  if (!itemId) {
    return fail('RemoveItem requires "itemId".');
  }
  if (!state.GetItem(itemId)) {
    return fail(`RemoveItem: no item with id "${itemId}".`);
  }
  state.RunBatch(() => state.RemoveItem(itemId, 'agent'));
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
  state.RunBatch(() => state.UpdateItem(itemId, style.patch, 'agent'));
  return ok(itemId, `Restyled ${itemId}.`);
}
