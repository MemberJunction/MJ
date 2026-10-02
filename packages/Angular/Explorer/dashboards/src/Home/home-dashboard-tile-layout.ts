/**
 * @fileoverview Sizes of the live dashboard tiles in Home's Dashboards section: the scale of a tile's
 * dashboard, the rows of tiles for the section's width, the row heights and tile widths the user
 * sets, the user setting that keeps them, and where each tile, gutter and height handle goes.
 * Pure functions without imports.
 */

/** A tile shows its dashboard at this scale: the dashboard lays out in a box 1 / TILE_CONTENT_SCALE times the tile body. */
export const TILE_CONTENT_SCALE = 0.8;

/** The strip width (px) from which two tiles sit side by side. */
export const TWO_COLUMN_MIN_WIDTH = 640;
/** The strip width (px) from which three tiles sit side by side. */
export const THREE_COLUMN_MIN_WIDTH = 1440;

/** The tile body height (px) of a row the user has not resized. */
export const DEFAULT_TILE_BODY_HEIGHT = 360;
/** The tile body height (px) of a row the user has not resized, in one-column mode. */
export const NARROW_TILE_BODY_HEIGHT = 300;
/** The smallest tile body height (px) a user can set. */
export const MIN_TILE_BODY_HEIGHT = 240;
/** The largest tile body height (px) a user can set. */
export const MAX_TILE_BODY_HEIGHT = 900;
/** How far (px) Arrow Up and Arrow Down move a row's height handle. */
export const TILE_HEIGHT_KEY_STEP = 20;

/** The smallest share (%) of its row a tile can have. */
export const MIN_TILE_WIDTH_PERCENT = 25;
/** How far (points of the row) Arrow Left and Arrow Right move a gutter. */
export const TILE_WIDTH_KEY_STEP = 2;

/** The gap (px) between side-by-side tiles and between rows. The gutters and the height handles fill it. */
export const TILE_GAP = 16;

/** The version of the setting's JSON. */
export const HOME_DASHBOARD_TILE_SIZES_VERSION = 1;

/** The setting keeps sizes for at most three rows: the section shows at most three tiles. */
const MAX_ROWS = 3;

/** The sizes of one row of tiles. A missing value means the default. */
export interface HomeDashboardTileRowSizes {
  /** The tile body height (px) of every tile in the row. */
  Height?: number;
  /** The tiles' shares (%) of the row, in tile order, by tile count ("2", "3"). Each list adds up to 100. */
  Widths?: Record<string, number[]>;
}

/** The sizes a user set for the tiles, by row position: row 0 is the first row. */
export interface HomeDashboardTileSizes {
  Version: 1;
  Rows: HomeDashboardTileRowSizes[];
}

/** The gutter between a tile and the next tile in its row. */
export interface HomeDashboardTileGutter {
  /** Share (0-1) of the row's free width before the gutter. */
  Start: number;
  /** The tile's share (%) of the row, rounded: the gutter's value. */
  ValueNow: number;
  /** The largest share (%) the gutter can give the tile. */
  ValueMax: number;
}

/** The height handle under a row. */
export interface HomeDashboardTileHandle {
  Row: number;
  /** The handle's grid line. */
  Line: number;
  /** The row's tile body height (px). */
  Height: number;
}

/** Where a tile goes in the strip grid, and the gutter and handle that follow it. */
export interface HomeDashboardTilePlacement {
  Row: number;
  /** The tile's position in its row. */
  Column: number;
  /** The row's grid line. Rows and handles alternate: row r is line 2r + 1, its handle line 2r + 2. */
  RowLine: number;
  /** How many tiles share the row. */
  RowTileCount: number;
  /** Share (0-1) of the row's free width before the tile. */
  Start: number;
  /** The tile's share (0-1) of the row's free width. */
  Span: number;
  /** The tile body height (px). */
  BodyHeight: number;
  /** The gutter after the tile, or null when the tile is the last in its row. */
  GutterAfter: HomeDashboardTileGutter | null;
  /** The row's height handle, after the last tile of the row; else null. */
  HandleAfter: HomeDashboardTileHandle | null;
}

/** The strip's tiles in rows. */
export interface HomeDashboardTileLayout {
  /** How many tiles fit side by side at the strip's width. */
  Columns: number;
  /** The rows of tile indexes. */
  Rows: number[][];
  /** Each tile's placement, by tile index. */
  Tiles: HomeDashboardTilePlacement[];
}

/** No sizes: every row at its default. */
export function EmptyHomeDashboardTileSizes(): HomeDashboardTileSizes {
  return { Version: HOME_DASHBOARD_TILE_SIZES_VERSION, Rows: [] };
}

/** How many tiles fit side by side: 1 under 640 px, 2 from 640 px, 3 from 1,440 px. */
export function HomeDashboardTileColumns(stripWidth: number): number {
  if (stripWidth >= THREE_COLUMN_MIN_WIDTH) {
    return 3;
  }
  return stripWidth >= TWO_COLUMN_MIN_WIDTH ? 2 : 1;
}

/**
 * The rows of tile indexes for a strip width: as many tiles side by side as fit, never more than
 * there are tiles. A lone last tile is a row of its own, at full width.
 */
export function HomeDashboardTileRows(stripWidth: number, tileCount: number): number[][] {
  const columns = Math.min(HomeDashboardTileColumns(stripWidth), tileCount);
  const rows: number[][] = [];
  for (let first = 0; first < tileCount; first += columns) {
    rows.push(Array.from({ length: Math.min(columns, tileCount - first) }, (_, i) => first + i));
  }
  return rows;
}

/** The tile body height of a row the user has not resized: 300 px in one-column mode (under 640 px), else 360 px. */
export function DefaultTileBodyHeight(stripWidth: number): number {
  return HomeDashboardTileColumns(stripWidth) === 1 ? NARROW_TILE_BODY_HEIGHT : DEFAULT_TILE_BODY_HEIGHT;
}

/** A tile body height in whole px, from 240 to 900 px. */
export function ClampTileBodyHeight(height: number): number {
  return Math.min(MAX_TILE_BODY_HEIGHT, Math.max(MIN_TILE_BODY_HEIGHT, Math.round(height)));
}

/** Equal shares (%) for `count` tiles. */
export function EqualTileWidths(count: number): number[] {
  return Array.from({ length: count }, () => 100 / count);
}

/** The shares scaled to add up to 100 (divided by their total first, so huge values do not overflow). */
export function NormalizeTileWidths(widths: number[]): number[] {
  const total = widths.reduce((sum, width) => sum + width, 0);
  return widths.map(width => (width / total) * 100);
}

/** The shares normalized to 100, with each tile at 25% or more; the wider tiles give up the difference. */
export function ClampTileWidths(widths: number[]): number[] {
  const shares = NormalizeTileWidths(widths);
  const missing = shares.reduce((sum, share) => sum + Math.max(0, MIN_TILE_WIDTH_PERCENT - share), 0);
  if (missing === 0) {
    return shares;
  }
  const spare = shares.reduce((sum, share) => sum + Math.max(0, share - MIN_TILE_WIDTH_PERCENT), 0);
  return shares.map(share =>
    share <= MIN_TILE_WIDTH_PERCENT ? MIN_TILE_WIDTH_PERCENT : share - (missing * (share - MIN_TILE_WIDTH_PERCENT)) / spare
  );
}

/**
 * The shares after moving the gutter between tiles `gutter` and `gutter + 1` by `delta` points of the
 * row (positive moves it right). Only those two tiles change, and each keeps 25% or more.
 */
export function MoveTileGutter(widths: number[], gutter: number, delta: number): number[] {
  const pair = widths[gutter] + widths[gutter + 1];
  const before = Math.min(pair - MIN_TILE_WIDTH_PERCENT, Math.max(MIN_TILE_WIDTH_PERCENT, widths[gutter] + delta));
  const moved = [...widths];
  moved[gutter] = before;
  moved[gutter + 1] = pair - before;
  return moved;
}

/** A row's tile body height: the saved one, else the default for the strip width. */
export function RowBodyHeight(sizes: HomeDashboardTileSizes, row: number, stripWidth: number): number {
  return sizes.Rows[row]?.Height ?? DefaultTileBodyHeight(stripWidth);
}

/** A row's tile shares (%) for `count` tiles: the saved ones for that count when there are `count` of them, else equal shares. */
export function RowTileWidths(sizes: HomeDashboardTileSizes, row: number, count: number): number[] {
  const saved = sizes.Rows[row]?.Widths?.[String(count)];
  return saved && saved.length === count ? [...saved] : EqualTileWidths(count);
}

/** A copy of the sizes with a row's height set, or cleared (the default) for null. */
export function WithRowHeight(sizes: HomeDashboardTileSizes, row: number, height: number | null): HomeDashboardTileSizes {
  return withRow(sizes, row, current => rowSizes(height ?? undefined, current.Widths));
}

/** A copy of the sizes with a row's shares for `count` tiles set, or cleared (equal shares) for null. */
export function WithRowWidths(sizes: HomeDashboardTileSizes, row: number, count: number, widths: number[] | null): HomeDashboardTileSizes {
  return withRow(sizes, row, current => {
    const byCount: Record<string, number[]> = { ...current.Widths };
    if (widths) {
      byCount[String(count)] = [...widths];
    } else {
      delete byCount[String(count)];
    }
    return rowSizes(current.Height, byCount);
  });
}

/**
 * Reads the setting's JSON. Missing or bad JSON, another version, or no Rows list gives no sizes.
 * Each row is read on its own: a height out of 240-900 px, or shares that are not positive numbers,
 * whose total is not finite, or that do not match their tile count (2 or 3), are dropped and that
 * value goes back to its default.
 * Shares are normalized to 100 with each tile at 25% or more. At most three rows are kept.
 */
export function ParseHomeDashboardTileSizes(raw: string | null | undefined): HomeDashboardTileSizes {
  const value = parseJson(raw);
  if (!isRecord(value) || value['Version'] !== HOME_DASHBOARD_TILE_SIZES_VERSION) {
    return EmptyHomeDashboardTileSizes();
  }
  const rows = value['Rows'];
  if (!Array.isArray(rows)) {
    return EmptyHomeDashboardTileSizes();
  }
  const items: unknown[] = rows.slice(0, MAX_ROWS);
  return { Version: HOME_DASHBOARD_TILE_SIZES_VERSION, Rows: items.map(parseRow) };
}

/** The setting's JSON: shares rounded to two decimals, without trailing empty rows. */
export function SerializeHomeDashboardTileSizes(sizes: HomeDashboardTileSizes): string {
  const rows = sizes.Rows.map(row => rowSizes(row.Height, roundedWidths(row.Widths)));
  while (rows.length > 0 && rows[rows.length - 1].Height === undefined && rows[rows.length - 1].Widths === undefined) {
    rows.pop();
  }
  return JSON.stringify({ Version: HOME_DASHBOARD_TILE_SIZES_VERSION, Rows: rows });
}

/** Places each tile, gutter and height handle: rows by the strip width, shares and heights from the sizes. */
export function BuildHomeDashboardTileLayout(stripWidth: number, tileCount: number, sizes: HomeDashboardTileSizes): HomeDashboardTileLayout {
  const rows = HomeDashboardTileRows(stripWidth, tileCount);
  return {
    Columns: HomeDashboardTileColumns(stripWidth),
    Rows: rows,
    Tiles: rows.flatMap((row, index) => placeRow(index, row.length, RowTileWidths(sizes, index, row.length), RowBodyHeight(sizes, index, stripWidth))),
  };
}

/** The placements of one row's tiles, left to right. */
function placeRow(row: number, tileCount: number, widths: number[], height: number): HomeDashboardTilePlacement[] {
  const shares = widths.map(width => width / 100);
  const line = 2 * row + 1;
  let start = 0;
  return shares.map((span, column) => {
    const last = column === tileCount - 1;
    const placement: HomeDashboardTilePlacement = {
      Row: row,
      Column: column,
      RowLine: line,
      RowTileCount: tileCount,
      Start: start,
      Span: span,
      BodyHeight: height,
      GutterAfter: last ? null : gutterAfter(shares, column, start),
      HandleAfter: last ? { Row: row, Line: line + 1, Height: height } : null,
    };
    start += span;
    return placement;
  });
}

/** The gutter between tile `column` and the next tile. */
function gutterAfter(shares: number[], column: number, start: number): HomeDashboardTileGutter {
  const share = shares[column] * 100;
  const pair = share + shares[column + 1] * 100;
  return { Start: start + shares[column], ValueNow: Math.round(share), ValueMax: Math.round(pair - MIN_TILE_WIDTH_PERCENT) };
}

/** A copy of the sizes with one row changed; the rows before it are added when missing. */
function withRow(
  sizes: HomeDashboardTileSizes,
  row: number,
  change: (current: HomeDashboardTileRowSizes) => HomeDashboardTileRowSizes
): HomeDashboardTileSizes {
  const rows = sizes.Rows.map(current => ({ ...current }));
  while (rows.length <= row) {
    rows.push({});
  }
  rows[row] = change(rows[row]);
  return { Version: HOME_DASHBOARD_TILE_SIZES_VERSION, Rows: rows };
}

/** A row with only the values that are set: no Height when undefined, no Widths when empty. */
function rowSizes(height: number | undefined, widths: Record<string, number[]> | undefined): HomeDashboardTileRowSizes {
  const row: HomeDashboardTileRowSizes = {};
  if (height !== undefined) {
    row.Height = height;
  }
  if (widths && Object.keys(widths).length > 0) {
    row.Widths = widths;
  }
  return row;
}

/** The shares rounded to two decimals. */
function roundedWidths(widths: Record<string, number[]> | undefined): Record<string, number[]> | undefined {
  if (!widths) {
    return undefined;
  }
  const rounded: Record<string, number[]> = {};
  for (const [count, shares] of Object.entries(widths)) {
    rounded[count] = shares.map(share => Math.round(share * 100) / 100);
  }
  return rounded;
}

/** The parsed JSON, or null when there is none or it does not parse. */
function parseJson(raw: string | null | undefined): unknown {
  if (!raw) {
    return null;
  }
  try {
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/** One row of the setting; a value that is not valid is left out. */
function parseRow(value: unknown): HomeDashboardTileRowSizes {
  return isRecord(value) ? rowSizes(parseHeight(value['Height']), parseWidths(value['Widths'])) : {};
}

/** A height from 240 to 900 px, in whole px; else undefined. */
function parseHeight(value: unknown): number | undefined {
  const inRange = typeof value === 'number' && value >= MIN_TILE_BODY_HEIGHT && value <= MAX_TILE_BODY_HEIGHT;
  return inRange ? Math.round(value) : undefined;
}

/** The valid shares for two and three tiles, clamped; undefined when there are none. */
function parseWidths(value: unknown): Record<string, number[]> | undefined {
  if (!isRecord(value)) {
    return undefined;
  }
  const byCount: Record<string, number[]> = {};
  for (const count of [2, 3]) {
    const shares = value[String(count)];
    if (isShareList(shares, count)) {
      byCount[String(count)] = ClampTileWidths(shares);
    }
  }
  return Object.keys(byCount).length > 0 ? byCount : undefined;
}

/** True for a list of `count` positive, finite numbers whose total is also finite. */
function isShareList(value: unknown, count: number): value is number[] {
  if (!Array.isArray(value) || value.length !== count) {
    return false;
  }
  const items: unknown[] = value;
  if (!items.every(share => typeof share === 'number' && Number.isFinite(share) && share > 0)) {
    return false;
  }
  const total = items.reduce<number>((sum, share) => sum + Number(share), 0);
  return Number.isFinite(total) && total > 0;
}
