import type { DocumentBlockExecutionResult, DocumentBlockSpec } from '@memberjunction/core-entities';
import { SafeJSONParse } from '@memberjunction/global';

let sharedCrcTable: Uint32Array | null = null;

function crc32(bytes: Uint8Array): number {
  if (!sharedCrcTable) {
    const table = new Uint32Array(256);
    for (let n = 0; n < 256; n++) {
      let c = n;
      for (let k = 0; k < 8; k++) {
        c = (c & 1) !== 0 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
      }
      table[n] = c >>> 0;
    }
    sharedCrcTable = table;
  }
  const table = sharedCrcTable;
  let crc = 0xffffffff;
  for (let i = 0; i < bytes.byteLength; i++) {
    crc = table[(crc ^ bytes[i]) & 0xff] ^ (crc >>> 8);
  }
  return (crc ^ 0xffffffff) >>> 0;
}

function adler32(bytes: Uint8Array): number {
  let a = 1;
  let b = 0;
  for (let i = 0; i < bytes.byteLength; i++) {
    a = (a + bytes[i]) % 65521;
    b = (b + a) % 65521;
  }
  return ((b << 16) | a) >>> 0;
}

function buildPngChunk(type: string, data: Uint8Array): Uint8Array {
  const chunk = new Uint8Array(12 + data.byteLength);
  const view = new DataView(chunk.buffer);
  view.setUint32(0, data.byteLength, false);
  for (let i = 0; i < 4; i++) {
    chunk[4 + i] = type.charCodeAt(i);
  }
  chunk.set(data, 8);
  const crcInput = chunk.subarray(4, 8 + data.byteLength);
  view.setUint32(8 + data.byteLength, crc32(crcInput), false);
  return chunk;
}

function wrapZlibStoredBlocks(raw: Uint8Array): Uint8Array {
  const maxBlock = 65535;
  const blockCount = Math.max(1, Math.ceil(raw.byteLength / maxBlock));
  const out = new Uint8Array(2 + raw.byteLength + blockCount * 5 + 4);
  out[0] = 0x78;
  out[1] = 0x01;
  let inOffset = 0;
  let outOffset = 2;

  for (let i = 0; i < blockCount; i++) {
    const remaining = raw.byteLength - inOffset;
    const blockLen = Math.min(maxBlock, remaining);
    const isFinal = i === blockCount - 1 ? 1 : 0;
    out[outOffset++] = isFinal;
    out[outOffset++] = blockLen & 0xff;
    out[outOffset++] = (blockLen >>> 8) & 0xff;
    const nlen = (~blockLen) & 0xffff;
    out[outOffset++] = nlen & 0xff;
    out[outOffset++] = (nlen >>> 8) & 0xff;
    if (blockLen > 0) {
      out.set(raw.subarray(inOffset, inOffset + blockLen), outOffset);
      inOffset += blockLen;
      outOffset += blockLen;
    }
  }

  const checksum = adler32(raw);
  const view = new DataView(out.buffer);
  view.setUint32(outOffset, checksum, false);
  return out;
}

/**
 * Encodes an RGBA pixel buffer (`width * height * 4` bytes) into a standards-compliant
 * uncompressed PNG binary without any DOM or canvas dependency.
 */
export function EncodeRgbaToPng(width: number, height: number, rgba: Uint8Array): Uint8Array {
  const stride = width * 4;
  const scanlines = new Uint8Array((stride + 1) * height);
  for (let y = 0; y < height; y++) {
    const rowStart = y * (stride + 1);
    scanlines[rowStart] = 0; // filter type 0 (None)
    scanlines.set(rgba.subarray(y * stride, (y + 1) * stride), rowStart + 1);
  }

  const ihdr = new Uint8Array(13);
  const ihdrView = new DataView(ihdr.buffer);
  ihdrView.setUint32(0, width, false);
  ihdrView.setUint32(4, height, false);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 6; // RGBA
  ihdr[10] = 0;
  ihdr[11] = 0;
  ihdr[12] = 0;

  const idat = wrapZlibStoredBlocks(scanlines);
  const sig = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
  const cIhdr = buildPngChunk('IHDR', ihdr);
  const cIdat = buildPngChunk('IDAT', idat);
  const cIend = buildPngChunk('IEND', new Uint8Array(0));

  const out = new Uint8Array(sig.byteLength + cIhdr.byteLength + cIdat.byteLength + cIend.byteLength);
  let pos = 0;
  for (const part of [sig, cIhdr, cIdat, cIend]) {
    out.set(part, pos);
    pos += part.byteLength;
  }
  return out;
}

function fillRectRgba(
  rgba: Uint8Array,
  canvasWidth: number,
  canvasHeight: number,
  x0: number,
  y0: number,
  w: number,
  h: number,
  r: number,
  g: number,
  b: number,
  a = 255,
): void {
  const xEnd = Math.min(canvasWidth, Math.max(0, Math.round(x0 + w)));
  const yEnd = Math.min(canvasHeight, Math.max(0, Math.round(y0 + h)));
  const xStart = Math.max(0, Math.round(x0));
  const yStart = Math.max(0, Math.round(y0));
  for (let y = yStart; y < yEnd; y++) {
    for (let x = xStart; x < xEnd; x++) {
      const idx = (y * canvasWidth + x) * 4;
      rgba[idx] = r;
      rgba[idx + 1] = g;
      rgba[idx + 2] = b;
      rgba[idx + 3] = a;
    }
  }
}

function parseHexRgb(hex: string | undefined, fallback: [number, number, number]): [number, number, number] {
  const cleaned = (hex || '').replace(/^#/, '').trim();
  if (!/^[0-9a-fA-F]{6}$/.test(cleaned)) {
    return fallback;
  }
  return [
    parseInt(cleaned.slice(0, 2), 16),
    parseInt(cleaned.slice(2, 4), 16),
    parseInt(cleaned.slice(4, 6), 16),
  ];
}

/**
 * Returns true when `block` represents a visual chart or Whiteboard diagram eligible for
 * native PNG rasterization inside `.docx` and `.pptx` exports (`§ 3.4`).
 */
export function IsVisualDiagramOrChartBlock(block: DocumentBlockSpec | null | undefined): boolean {
  if (!block) {
    return false;
  }
  const artType = (block.ArtifactType ?? '').trim().toLowerCase();
  if (block.Kind === 'Artifact' && (artType === 'whiteboard' || Boolean(block.SheetChartID))) {
    return true;
  }
  return block.DisplayMode === 'chart' || Boolean(block.SheetChartID);
}

function drawLineRgba(
  rgba: Uint8Array,
  canvasWidth: number,
  canvasHeight: number,
  x0: number,
  y0: number,
  x1: number,
  y1: number,
  r: number,
  g: number,
  b: number,
  thickness = 2,
): void {
  let ix0 = Math.round(x0);
  let iy0 = Math.round(y0);
  const ix1 = Math.round(x1);
  const iy1 = Math.round(y1);
  const dx = Math.abs(ix1 - ix0);
  const dy = Math.abs(iy1 - iy0);
  const sx = ix0 < ix1 ? 1 : -1;
  const sy = iy0 < iy1 ? 1 : -1;
  let err = dx - dy;
  const half = Math.floor(thickness / 2);
  let steps = 0;
  const maxSteps = canvasWidth + canvasHeight + 16;

  while (steps++ < maxSteps) {
    fillRectRgba(rgba, canvasWidth, canvasHeight, ix0 - half, iy0 - half, thickness, thickness, r, g, b);
    if (ix0 === ix1 && iy0 === iy1) {
      break;
    }
    const e2 = 2 * err;
    if (e2 > -dy) {
      err -= dy;
      ix0 += sx;
    }
    if (e2 < dx) {
      err += dx;
      iy0 += sy;
    }
  }
}

function drawCircleRgba(
  rgba: Uint8Array,
  canvasWidth: number,
  canvasHeight: number,
  cx: number,
  cy: number,
  radius: number,
  r: number,
  g: number,
  b: number,
): void {
  const rad = Math.max(1, Math.round(radius));
  for (let dy = -rad; dy <= rad; dy++) {
    for (let dx = -rad; dx <= rad; dx++) {
      if (dx * dx + dy * dy <= rad * rad) {
        const px = Math.round(cx + dx);
        const py = Math.round(cy + dy);
        if (px >= 0 && px < canvasWidth && py >= 0 && py < canvasHeight) {
          const idx = (py * canvasWidth + px) * 4;
          rgba[idx] = r;
          rgba[idx + 1] = g;
          rgba[idx + 2] = b;
          rgba[idx + 3] = 255;
        }
      }
    }
  }
}

interface ParsedWhiteboardElement {
  ID: string;
  Kind: string;
  Author: string;
  X: number;
  Y: number;
  W: number;
  H: number;
  Color?: string;
  FromItemID?: string | null;
  ToItemID?: string | null;
  FromPoint?: { X: number; Y: number } | null;
  ToPoint?: { X: number; Y: number } | null;
  Points?: Array<{ X: number; Y: number }>;
}

interface RawWhiteboardPoint {
  X?: number;
  Y?: number;
  x?: number;
  y?: number;
}

interface RawWhiteboardItem {
  ID?: string;
  id?: string;
  Kind?: string;
  kind?: string;
  type?: string;
  Author?: string;
  author?: string;
  X?: number;
  Y?: number;
  W?: number;
  H?: number;
  x?: number;
  y?: number;
  w?: number;
  h?: number;
  width?: number;
  height?: number;
  Color?: string;
  color?: string;
  FromItemID?: string | null;
  ToItemID?: string | null;
  from?: string | null;
  to?: string | null;
  FromPoint?: RawWhiteboardPoint | null;
  ToPoint?: RawWhiteboardPoint | null;
  Points?: RawWhiteboardPoint[];
  points?: RawWhiteboardPoint[];
}

interface RawWhiteboardPage {
  ID?: string;
  id?: string;
  Items?: RawWhiteboardItem[];
  items?: RawWhiteboardItem[];
}

interface RawWhiteboardDoc {
  ActivePageID?: string;
  activePageId?: string;
  Pages?: RawWhiteboardPage[];
  pages?: RawWhiteboardPage[];
  Items?: RawWhiteboardItem[];
  items?: RawWhiteboardItem[];
  nodes?: RawWhiteboardItem[];
  edges?: RawWhiteboardItem[];
}

function normalizeWhiteboardPoint(pt: RawWhiteboardPoint | null | undefined): { X: number; Y: number } | null {
  if (!pt || typeof pt !== 'object') {
    return null;
  }
  const x = typeof pt.X === 'number' ? pt.X : typeof pt.x === 'number' ? pt.x : NaN;
  const y = typeof pt.Y === 'number' ? pt.Y : typeof pt.y === 'number' ? pt.y : NaN;
  return Number.isFinite(x) && Number.isFinite(y) ? { X: x, Y: y } : null;
}

function parseWhiteboardElements(snapshotJson: string | undefined): ParsedWhiteboardElement[] {
  if (!snapshotJson || !snapshotJson.trim()) {
    return [];
  }
  const parsed = SafeJSONParse<RawWhiteboardDoc>(snapshotJson);
  if (!parsed || typeof parsed !== 'object') {
    return [];
  }

  let rawItems: RawWhiteboardItem[] = [];
  const pages = Array.isArray(parsed.Pages) ? parsed.Pages : Array.isArray(parsed.pages) ? parsed.pages : null;
  if (pages && pages.length > 0) {
    const activeId = parsed.ActivePageID ?? parsed.activePageId;
    const activePage =
      (activeId ? pages.find((p) => (p.ID ?? p.id) === activeId) : undefined) ?? pages[0];
    if (activePage) {
      rawItems = Array.isArray(activePage.Items)
        ? activePage.Items
        : Array.isArray(activePage.items)
          ? activePage.items
          : [];
    }
  } else if (Array.isArray(parsed.Items)) {
    rawItems = parsed.Items;
  } else if (Array.isArray(parsed.items)) {
    rawItems = parsed.items;
  } else if (Array.isArray(parsed.nodes) || Array.isArray(parsed.edges)) {
    const nodes = (parsed.nodes ?? []).map((n, i) => ({
      ...n,
      Kind: n.Kind ?? 'shape',
      X: typeof n.X === 'number' ? n.X : typeof n.x === 'number' ? n.x : (i % 4) * 180 + 40,
      Y: typeof n.Y === 'number' ? n.Y : typeof n.y === 'number' ? n.y : Math.floor(i / 4) * 110 + 40,
      W: typeof n.W === 'number' ? n.W : typeof n.w === 'number' ? n.w : 140,
      H: typeof n.H === 'number' ? n.H : typeof n.h === 'number' ? n.h : 72,
    }));
    const edges = (parsed.edges ?? []).map((e) => ({
      ...e,
      Kind: 'connector',
      FromItemID: e.FromItemID ?? e.from ?? null,
      ToItemID: e.ToItemID ?? e.to ?? null,
    }));
    rawItems = [...nodes, ...edges];
  }

  const out: ParsedWhiteboardElement[] = [];
  for (let i = 0; i < rawItems.length; i++) {
    const item = rawItems[i];
    if (!item || typeof item !== 'object') {
      continue;
    }
    const kind = String(item.Kind ?? item.kind ?? item.type ?? 'shape').toLowerCase();
    const x = typeof item.X === 'number' ? item.X : typeof item.x === 'number' ? item.x : 0;
    const y = typeof item.Y === 'number' ? item.Y : typeof item.y === 'number' ? item.y : 0;
    const w =
      typeof item.W === 'number'
        ? item.W
        : typeof item.w === 'number'
          ? item.w
          : typeof item.width === 'number'
            ? item.width
            : kind === 'sticky'
              ? 180
              : 140;
    const h =
      typeof item.H === 'number'
        ? item.H
        : typeof item.h === 'number'
          ? item.h
          : typeof item.height === 'number'
            ? item.height
            : kind === 'sticky'
              ? 140
              : 80;
    const rawPts = Array.isArray(item.Points) ? item.Points : Array.isArray(item.points) ? item.points : [];
    const pts = rawPts
      .map((p) => normalizeWhiteboardPoint(p))
      .filter((p): p is { X: number; Y: number } => p !== null);

    out.push({
      ID: String(item.ID ?? item.id ?? `item-${i}`),
      Kind: kind,
      Author: String(item.Author ?? item.author ?? 'user').toLowerCase(),
      X: Number.isFinite(x) ? x : 0,
      Y: Number.isFinite(y) ? y : 0,
      W: Number.isFinite(w) && w > 0 ? w : 140,
      H: Number.isFinite(h) && h > 0 ? h : 80,
      Color: typeof (item.Color ?? item.color) === 'string' ? (item.Color ?? item.color) : undefined,
      FromItemID: item.FromItemID ?? item.from ?? null,
      ToItemID: item.ToItemID ?? item.to ?? null,
      FromPoint: normalizeWhiteboardPoint(item.FromPoint),
      ToPoint: normalizeWhiteboardPoint(item.ToPoint),
      Points: pts,
    });
  }
  return out;
}

function rasterizeWhiteboardElements(
  rgba: Uint8Array,
  width: number,
  height: number,
  elements: ParsedWhiteboardElement[],
  primaryRgb: [number, number, number],
  accentRgb: [number, number, number],
): void {
  const [pr, pg, pb] = primaryRgb;
  const [ar, ag, ab] = accentRgb;

  if (elements.length === 0) {
    // Empty whiteboard canvas: subtle dotted grid only (never fake hardcoded nodes)
    for (let gy = 28; gy < height - 12; gy += 16) {
      for (let gx = 20; gx < width - 16; gx += 16) {
        fillRectRgba(rgba, width, height, gx, gy, 2, 2, 203, 213, 225);
      }
    }
    return;
  }

  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  const itemById = new Map<string, ParsedWhiteboardElement>();
  for (const el of elements) {
    itemById.set(el.ID, el);
    if (el.Kind === 'ink' && el.Points && el.Points.length > 0) {
      for (const p of el.Points) {
        if (p.X < minX) minX = p.X;
        if (p.Y < minY) minY = p.Y;
        if (p.X > maxX) maxX = p.X;
        if (p.Y > maxY) maxY = p.Y;
      }
    } else if (el.Kind === 'connector') {
      if (el.FromPoint) {
        if (el.FromPoint.X < minX) minX = el.FromPoint.X;
        if (el.FromPoint.Y < minY) minY = el.FromPoint.Y;
        if (el.FromPoint.X > maxX) maxX = el.FromPoint.X;
        if (el.FromPoint.Y > maxY) maxY = el.FromPoint.Y;
      }
      if (el.ToPoint) {
        if (el.ToPoint.X < minX) minX = el.ToPoint.X;
        if (el.ToPoint.Y < minY) minY = el.ToPoint.Y;
        if (el.ToPoint.X > maxX) maxX = el.ToPoint.X;
        if (el.ToPoint.Y > maxY) maxY = el.ToPoint.Y;
      }
    } else {
      if (el.X < minX) minX = el.X;
      if (el.Y < minY) minY = el.Y;
      if (el.X + el.W > maxX) maxX = el.X + el.W;
      if (el.Y + el.H > maxY) maxY = el.Y + el.H;
    }
  }

  if (!Number.isFinite(minX) || !Number.isFinite(minY) || !Number.isFinite(maxX) || !Number.isFinite(maxY)) {
    return;
  }

  const padX = 16;
  const padTop = 22;
  const padBottom = 14;
  const srcW = Math.max(1, maxX - minX);
  const srcH = Math.max(1, maxY - minY);
  const dstW = width - padX * 2;
  const dstH = height - padTop - padBottom;
  const scale = Math.min(dstW / srcW, dstH / srcH);
  const offsetX = padX + (dstW - srcW * scale) / 2;
  const offsetY = padTop + (dstH - srcH * scale) / 2;
  const toCanvasX = (wx: number): number => offsetX + (wx - minX) * scale;
  const toCanvasY = (wy: number): number => offsetY + (wy - minY) * scale;

  // Draw boxes first, then connectors and ink strokes on top
  for (const el of elements) {
    if (el.Kind === 'connector' || el.Kind === 'ink') {
      continue;
    }
    const cx = toCanvasX(el.X);
    const cy = toCanvasY(el.Y);
    const cw = Math.max(10, el.W * scale);
    const ch = Math.max(8, el.H * scale);
    const isAgent = el.Author === 'agent';
    const fillRgb: [number, number, number] =
      el.Kind === 'sticky'
        ? isAgent
          ? [237, 233, 254]
          : [254, 243, 199]
        : isAgent
          ? [237, 233, 254]
          : [224, 242, 254];
    const borderRgb: [number, number, number] = isAgent
      ? [124, 58, 237]
      : el.Kind === 'sticky'
        ? [217, 119, 6]
        : [pr, pg, pb];
    fillRectRgba(rgba, width, height, cx, cy, cw, ch, fillRgb[0], fillRgb[1], fillRgb[2]);
    fillRectRgba(rgba, width, height, cx, cy, cw, 3, borderRgb[0], borderRgb[1], borderRgb[2]);
    fillRectRgba(rgba, width, height, cx, cy + ch - 1, cw, 1, borderRgb[0], borderRgb[1], borderRgb[2]);
    fillRectRgba(rgba, width, height, cx, cy, 1, ch, borderRgb[0], borderRgb[1], borderRgb[2]);
    fillRectRgba(rgba, width, height, cx + cw - 1, cy, 1, ch, borderRgb[0], borderRgb[1], borderRgb[2]);
  }

  for (const el of elements) {
    if (el.Kind === 'connector') {
      const fromItem = el.FromItemID ? itemById.get(el.FromItemID) : undefined;
      const toItem = el.ToItemID ? itemById.get(el.ToItemID) : undefined;
      const fx = fromItem ? fromItem.X + fromItem.W / 2 : el.FromPoint?.X;
      const fy = fromItem ? fromItem.Y + fromItem.H / 2 : el.FromPoint?.Y;
      const tx = toItem ? toItem.X + toItem.W / 2 : el.ToPoint?.X;
      const ty = toItem ? toItem.Y + toItem.H / 2 : el.ToPoint?.Y;
      if (fx !== undefined && fy !== undefined && tx !== undefined && ty !== undefined) {
        drawLineRgba(
          rgba,
          width,
          height,
          toCanvasX(fx),
          toCanvasY(fy),
          toCanvasX(tx),
          toCanvasY(ty),
          ar,
          ag,
          ab,
          2,
        );
      }
    } else if (el.Kind === 'ink' && el.Points && el.Points.length >= 2) {
      const [ir, ig, ib] = parseHexRgb(el.Color, [pr, pg, pb]);
      for (let i = 1; i < el.Points.length; i++) {
        drawLineRgba(
          rgba,
          width,
          height,
          toCanvasX(el.Points[i - 1].X),
          toCanvasY(el.Points[i - 1].Y),
          toCanvasX(el.Points[i].X),
          toCanvasY(el.Points[i].Y),
          ir,
          ig,
          ib,
          2,
        );
      }
    }
  }
}

const CHART_PALETTE: ReadonlyArray<[number, number, number]> = [
  [37, 99, 235],
  [14, 165, 233],
  [16, 185, 129],
  [245, 158, 11],
  [139, 92, 246],
  [239, 68, 68],
];

function extractRealChartSeries(
  block: DocumentBlockSpec,
  liveResult?: DocumentBlockExecutionResult | null,
): number[][] {
  const cols = liveResult?.Columns?.length
    ? liveResult.Columns
    : block.FrozenSnapshot?.Columns ?? [];
  const rows = liveResult?.Rows?.length
    ? liveResult.Rows
    : block.FrozenSnapshot?.Rows ?? [];
  if (rows.length === 0) {
    return [];
  }

  const rawX = block.Parameters?.['XColumn'] ?? block.Parameters?.['LabelColumn'];
  const xColLower = typeof rawX === 'string' ? rawX.trim().toLowerCase() : '';
  const rawY = block.Parameters?.['YColumns'] ?? block.Parameters?.['ValueColumns'];
  const explicitY = Array.isArray(rawY)
    ? rawY.filter((c): c is string => typeof c === 'string').map((c) => c.trim()).filter((c) => c.length > 0)
    : [];
  const candidateCols: string[] = [];

  if (explicitY.length > 0) {
    for (const yCol of explicitY) {
      const matched = cols.find((c) => c.Name.toLowerCase() === yCol.toLowerCase())?.Name ?? yCol;
      candidateCols.push(matched);
    }
  } else {
    const colNames = cols.length > 0 ? cols.map((c) => c.Name) : Object.keys(rows[0] ?? {});
    for (const name of colNames) {
      const lower = name.toLowerCase();
      if (lower === xColLower || lower === 'id' || lower.endsWith('id')) {
        continue;
      }
      const hasNumeric = rows.slice(0, 12).some((row) => {
        const raw = row[name];
        return raw !== null && raw !== undefined && raw !== '' && Number.isFinite(Number(raw));
      });
      if (hasNumeric) {
        candidateCols.push(name);
      }
    }
    if (candidateCols.length === 0 && colNames.length > 0) {
      const fallbackCol = colNames.find((name) => name.toLowerCase() !== xColLower) ?? colNames[0];
      if (fallbackCol) {
        candidateCols.push(fallbackCol);
      }
    }
  }

  const sliceRows = rows.slice(0, 12);
  const series: number[][] = [];
  for (const colName of candidateCols.slice(0, 4)) {
    const vals: number[] = [];
    let hasFinite = false;
    for (const row of sliceRows) {
      const num = Number(row[colName]);
      if (Number.isFinite(num)) {
        vals.push(num);
        hasFinite = true;
      } else {
        vals.push(0);
      }
    }
    if (hasFinite) {
      series.push(vals);
    }
  }
  return series;
}

function rasterizeChartData(
  rgba: Uint8Array,
  width: number,
  height: number,
  block: DocumentBlockSpec,
  series: number[][],
  primaryRgb: [number, number, number],
  accentRgb: [number, number, number],
): void {
  const chartLeft = 28;
  const chartRight = width - 24;
  const chartTop = 24;
  const chartBottom = height - 22;
  const chartW = chartRight - chartLeft;
  const chartH = chartBottom - chartTop;

  // Draw chart axes
  fillRectRgba(rgba, width, height, chartLeft - 2, chartTop, 2, chartH, 148, 163, 184);
  fillRectRgba(rgba, width, height, chartLeft - 2, chartBottom, chartW + 4, 2, 148, 163, 184);

  if (series.length === 0 || series[0].length === 0) {
    // Empty dataset: render subtle horizontal baseline ticks only (zero fabricated bars)
    for (let y = chartTop + 20; y < chartBottom; y += 24) {
      fillRectRgba(rgba, width, height, chartLeft + 2, y, chartW - 4, 1, 226, 232, 240);
    }
    return;
  }

  const chartType = (block.ChartType ?? 'bar').toLowerCase();
  const palette: ReadonlyArray<[number, number, number]> = [
    primaryRgb,
    accentRgb,
    ...CHART_PALETTE.slice(2),
  ];

  if (chartType === 'pie') {
    const firstSeries = series[0].map((v) => Math.max(0, Number.isFinite(v) ? v : 0));
    const total = firstSeries.reduce((acc, v) => acc + v, 0);
    if (total <= 0) {
      return;
    }
    const cx = Math.round(width / 2);
    const cy = Math.round((chartTop + chartBottom) / 2);
    const radius = Math.min(Math.floor(chartH / 2) - 4, 54);
    const angles: Array<{ start: number; end: number; rgb: [number, number, number] }> = [];
    let cursor = -Math.PI / 2;
    for (let i = 0; i < firstSeries.length; i++) {
      const span = (firstSeries[i] / total) * Math.PI * 2;
      angles.push({
        start: cursor,
        end: cursor + span,
        rgb: palette[i % palette.length],
      });
      cursor += span;
    }
    for (let dy = -radius; dy <= radius; dy++) {
      for (let dx = -radius; dx <= radius; dx++) {
        if (dx * dx + dy * dy > radius * radius) {
          continue;
        }
        let theta = Math.atan2(dy, dx);
        if (theta < -Math.PI / 2) {
          theta += Math.PI * 2;
        }
        const seg = angles.find((a) => theta >= a.start && theta <= a.end) ?? angles[angles.length - 1];
        if (seg) {
          const px = cx + dx;
          const py = cy + dy;
          if (px >= 0 && px < width && py >= 0 && py < height) {
            const idx = (py * width + px) * 4;
            rgba[idx] = seg.rgb[0];
            rgba[idx + 1] = seg.rgb[1];
            rgba[idx + 2] = seg.rgb[2];
            rgba[idx + 3] = 255;
          }
        }
      }
    }
    return;
  }

  let minVal = 0;
  let maxVal = 0;
  for (const s of series) {
    for (const v of s) {
      if (v < minVal) minVal = v;
      if (v > maxVal) maxVal = v;
    }
  }
  if (minVal === maxVal) {
    maxVal = minVal + 1;
  }
  const span = Math.max(1e-6, maxVal - minVal);
  const valueToY = (v: number): number => chartBottom - ((v - minVal) / span) * chartH;
  const zeroY = Math.min(chartBottom, Math.max(chartTop, valueToY(0)));

  if (minVal < 0) {
    fillRectRgba(rgba, width, height, chartLeft, zeroY, chartW, 1, 100, 116, 139);
  }

  if (chartType === 'line' || chartType === 'area') {
    const pointCount = series[0].length;
    for (let sIdx = 0; sIdx < series.length; sIdx++) {
      const s = series[sIdx];
      const [sr, sg, sb] = palette[sIdx % palette.length];
      const pts = s.map((v, idx) => ({
        x: pointCount === 1 ? chartLeft + chartW / 2 : chartLeft + 8 + (idx * (chartW - 16)) / (pointCount - 1),
        y: valueToY(v),
      }));
      if (chartType === 'area' && sIdx === 0 && pts.length >= 2) {
        const tintR = Math.min(255, Math.round(sr * 0.25 + 248 * 0.75));
        const tintG = Math.min(255, Math.round(sg * 0.25 + 250 * 0.75));
        const tintB = Math.min(255, Math.round(sb * 0.25 + 252 * 0.75));
        for (let i = 1; i < pts.length; i++) {
          const p0 = pts[i - 1];
          const p1 = pts[i];
          const xStart = Math.round(p0.x);
          const xEnd = Math.round(p1.x);
          for (let px = xStart; px <= xEnd; px++) {
            const t = xEnd === xStart ? 0 : (px - xStart) / (xEnd - xStart);
            const py = p0.y + (p1.y - p0.y) * t;
            const topY = Math.min(py, zeroY);
            const h = Math.max(1, Math.abs(zeroY - py));
            fillRectRgba(rgba, width, height, px, topY, 1, h, tintR, tintG, tintB);
          }
        }
      }
      for (let i = 1; i < pts.length; i++) {
        drawLineRgba(rgba, width, height, pts[i - 1].x, pts[i - 1].y, pts[i].x, pts[i].y, sr, sg, sb, 2);
      }
      for (const p of pts) {
        drawCircleRgba(rgba, width, height, p.x, p.y, 3, sr, sg, sb);
      }
    }
    return;
  }

  // Bar / Column chart (grouped by series)
  const catCount = series[0].length;
  const seriesCount = series.length;
  const groupWidth = chartW / catCount;
  const barWidth = Math.max(4, Math.floor((groupWidth * 0.72) / seriesCount));

  for (let cIdx = 0; cIdx < catCount; cIdx++) {
    const groupLeft = chartLeft + cIdx * groupWidth + (groupWidth - barWidth * seriesCount) / 2;
    for (let sIdx = 0; sIdx < seriesCount; sIdx++) {
      const val = series[sIdx][cIdx] ?? 0;
      const yVal = valueToY(val);
      const topY = Math.min(yVal, zeroY);
      const h = Math.max(2, Math.abs(zeroY - yVal));
      const x = groupLeft + sIdx * barWidth;
      const [br, bg, bb] = palette[sIdx % palette.length];
      fillRectRgba(rgba, width, height, x, topY, Math.max(2, barWidth - 1), h, br, bg, bb);
    }
  }
}

/**
 * Produces a deterministic native PNG raster image representing an embedded chart block
 * or Whiteboard canvas when exporting to `.docx` (`ImageRun`) or `.pptx` (`<p:pic>`) (`§ 3.4`).
 */
export function RasterizeBlockDiagramToPng(
  block: DocumentBlockSpec,
  themeColors?: { Primary?: string; Accent?: string },
  liveResult?: DocumentBlockExecutionResult | null,
): Uint8Array {
  const width = 320;
  const height = 160;
  const rgba = new Uint8Array(width * height * 4);
  // Crisp off-white card surface (#F8FAFC)
  fillRectRgba(rgba, width, height, 0, 0, width, height, 248, 250, 252);
  // Subtle 2px border (#CBD5E1)
  fillRectRgba(rgba, width, height, 0, 0, width, 2, 203, 213, 225);
  fillRectRgba(rgba, width, height, 0, height - 2, width, 2, 203, 213, 225);
  fillRectRgba(rgba, width, height, 0, 0, 2, height, 203, 213, 225);
  fillRectRgba(rgba, width, height, width - 2, 0, 2, height, 203, 213, 225);

  const primaryRgb = parseHexRgb(themeColors?.Primary, [37, 99, 235]);
  const accentRgb = parseHexRgb(themeColors?.Accent, [14, 165, 233]);
  // Top header accent stripe
  fillRectRgba(rgba, width, height, 2, 2, width - 4, 8, primaryRgb[0], primaryRgb[1], primaryRgb[2]);

  const isWhiteboard = (block.ArtifactType ?? '').trim().toLowerCase() === 'whiteboard';
  if (isWhiteboard) {
    const snapshotJson = liveResult?.ArtifactContent ?? block.FrozenSnapshot?.ArtifactContentSnapshot;
    const elements = parseWhiteboardElements(snapshotJson);
    rasterizeWhiteboardElements(rgba, width, height, elements, primaryRgb, accentRgb);
  } else {
    const series = extractRealChartSeries(block, liveResult);
    rasterizeChartData(rgba, width, height, block, series, primaryRgb, accentRgb);
  }

  return EncodeRgbaToPng(width, height, rgba);
}
