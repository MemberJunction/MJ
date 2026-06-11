import {
  WHITEBOARD_DEFAULTS,
  WhiteboardBounds,
  WhiteboardConnectorItem,
  WhiteboardFontFamily,
  WhiteboardHighlightItem,
  WhiteboardImageItem,
  WhiteboardInkItem,
  WhiteboardItem,
  WhiteboardShapeItem,
  WhiteboardState,
  WhiteboardStickyItem,
  WhiteboardTextItem
} from './whiteboard-state';

/**
 * LIVE WHITEBOARD — EXPORT builders (pure, Angular-free).
 *
 * {@link BuildWhiteboardExportHtml} renders a board snapshot as ONE fully self-contained
 * HTML document (inline CSS only, zero external references) suitable for "Download HTML"
 * and the host's Print path; {@link BuildWhiteboardExportSvg} renders the same snapshot
 * as a standalone SVG document for "Download SVG".
 *
 * Rendering model (mirrors the live board):
 *  - BOX items (sticky / shape / text / image placeholder) become absolutely positioned
 *    divs honoring the optional text-style fields (FontSize / FontFamily / FontWeight /
 *    Color), each garnished with a small ownership chip (You / the agent's name);
 *  - VECTOR items (ink strokes, connectors, highlight regions) render in one inline SVG
 *    layer underneath the boxes — connectors anchor to item centers via the engine's own
 *    {@link WhiteboardState.ResolveEndpoint} bounds math, highlights become dashed
 *    outlines;
 *  - the palette is a light, paper-friendly literal palette (exports must stand alone, so
 *    no design tokens here — this is the documented exception for self-contained output).
 *
 * SECURITY: every piece of user/agent-authored text (item text, labels, names, the title,
 * the agent name, the timestamp) is HTML-escaped via {@link escapeHtml} before it touches
 * the document. Output is deterministic for a given state + options (the caller passes
 * `GeneratedAt`).
 */

/** Options for {@link BuildWhiteboardExportHtml}. */
export interface WhiteboardExportOptions {
  /** Document / header title (e.g. the board title). */
  Title: string;
  /** Display name of the session's agent — ownership chips + header byline. */
  AgentName: string;
  /** Preformatted generation timestamp (passed in so output stays deterministic). */
  GeneratedAt: string;
}

/** Padding (px) added around the content bounds so nothing renders flush to the edge. */
const EXPORT_PAD = 36;
/** Fallback board size when the board is empty. */
const EMPTY_BOARD_W = 640;
const EMPTY_BOARD_H = 240;

/** Paper-friendly literal palette (self-contained exports cannot reference app tokens). */
const PALETTE = {
  PageBg: '#f6f5f1',
  PaperBg: '#ffffff',
  PaperBorder: '#d9d4c8',
  TextPrimary: '#1f2937',
  TextMuted: '#6b7280',
  UserChipBg: '#eef2f7',
  UserChipBorder: '#cbd5e1',
  UserChipText: '#475569',
  AgentChipBg: '#ede9fe',
  AgentChipBorder: '#c4b5fd',
  AgentChipText: '#6d28d9',
  StickyAmberBg: '#fef3c7',
  StickyAmberBorder: '#f0d48a',
  StickyAmberLightBg: '#fffbeb',
  StickyAmberLightBorder: '#f3e3b3',
  StickyAgentBg: '#f1ecfe',
  StickyAgentBorder: '#c4b5fd',
  ShapeUserBg: '#fdfdfb',
  ShapeUserBorder: '#94a3b8',
  ShapeAgentBg: '#f5f3ff',
  ShapeAgentBorder: '#a78bfa',
  ImageBg: '#f1f5f9',
  ImageBorder: '#cbd5e1',
  ConnectorUser: '#64748b',
  ConnectorAgent: '#8b5cf6',
  HighlightUser: '#d97706',
  HighlightAgent: '#8b5cf6'
} as const;

/** Map a {@link WhiteboardFontFamily} key to a literal font stack. */
const FONT_STACKS: Record<WhiteboardFontFamily, string> = {
  sans: "ui-sans-serif, system-ui, 'Segoe UI', Helvetica, Arial, sans-serif",
  serif: "Georgia, 'Times New Roman', serif",
  mono: "ui-monospace, SFMono-Regular, Menlo, Consolas, monospace"
};

/** HTML/SVG-escape every user-authored string: & < > " ' (also valid in XML text/attrs). */
function escapeHtml(text: string): string {
  return (text ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

/** Round to 2 decimals for compact, deterministic coordinate output. */
function n(value: number): number {
  return Math.round(value * 100) / 100;
}

/** Board bounds padded for export (or a default empty stage). */
function exportBounds(state: WhiteboardState): WhiteboardBounds {
  const content = state.ContentBounds();
  if (!content) {
    return { X: 0, Y: 0, W: EMPTY_BOARD_W, H: EMPTY_BOARD_H };
  }
  return {
    X: content.X - EXPORT_PAD,
    Y: content.Y - EXPORT_PAD,
    W: content.W + EXPORT_PAD * 2,
    H: content.H + EXPORT_PAD * 2
  };
}

/** Inline font-style fragment from the optional text-style fields. */
function textStyleCss(item: WhiteboardStickyItem | WhiteboardTextItem): string {
  const parts: string[] = [];
  if (item.FontSize != null) {
    parts.push(`font-size:${n(item.FontSize)}px`);
  }
  if (item.FontFamily) {
    parts.push(`font-family:${FONT_STACKS[item.FontFamily]}`);
  }
  if (item.FontWeight != null) {
    parts.push(`font-weight:${item.FontWeight}`);
  }
  return parts.length > 0 ? parts.join(';') + ';' : '';
}

/** The small ownership chip rendered on each box/ink item. */
function chipHtml(item: WhiteboardItem, agentName: string): string {
  const label = item.Author === 'agent' ? escapeHtml(agentName) : 'You';
  return `<span class="chip chip--${item.Author}">${label}</span>`;
}

// ────────────────────────────────────────────── box items (positioned divs)

function stickyHtml(item: WhiteboardStickyItem, ox: number, oy: number, agentName: string): string {
  const w = item.W ?? WHITEBOARD_DEFAULTS.StickyW;
  const isAgent = item.Author === 'agent';
  const bg = isAgent ? PALETTE.StickyAgentBg : item.Tint === 'amber-light' ? PALETTE.StickyAmberLightBg : PALETTE.StickyAmberBg;
  const border = isAgent ? PALETTE.StickyAgentBorder : item.Tint === 'amber-light' ? PALETTE.StickyAmberLightBorder : PALETTE.StickyAmberBorder;
  const rotate = item.Rotation ? `transform:rotate(${n(item.Rotation)}deg);` : '';
  const style = `left:${n(item.X - ox)}px;top:${n(item.Y - oy)}px;width:${n(w)}px;min-height:${WHITEBOARD_DEFAULTS.StickyH}px;` +
    `background:${bg};border-color:${border};${rotate}${textStyleCss(item)}`;
  return `<div class="it sticky" style="${style}">${chipHtml(item, agentName)}<div class="it-text">${escapeHtml(item.Text)}</div></div>`;
}

function shapeHtml(item: WhiteboardShapeItem, ox: number, oy: number, agentName: string): string {
  const isAgent = item.Author === 'agent';
  const bg = isAgent ? PALETTE.ShapeAgentBg : PALETTE.ShapeUserBg;
  const border = isAgent ? PALETTE.ShapeAgentBorder : PALETTE.ShapeUserBorder;
  const shapeCss =
    item.Shape === 'ellipse' ? 'border-radius:50%;'
      : item.Shape === 'diamond' ? 'clip-path:polygon(50% 0,100% 50%,50% 100%,0 50%);border:none;'
        : '';
  const style = `left:${n(item.X - ox)}px;top:${n(item.Y - oy)}px;width:${n(item.W)}px;height:${n(item.H)}px;` +
    `background:${bg};border-color:${border};${shapeCss}`;
  const sub = item.Sub ? `<div class="it-sub">${escapeHtml(item.Sub)}</div>` : '';
  return `<div class="it shape" style="${style}">${chipHtml(item, agentName)}<div class="it-label">${escapeHtml(item.Label)}</div>${sub}</div>`;
}

function textHtml(item: WhiteboardTextItem, ox: number, oy: number, agentName: string): string {
  const color = item.Color ? `color:${escapeHtml(item.Color)};` : '';
  const style = `left:${n(item.X - ox)}px;top:${n(item.Y - oy)}px;${color}${textStyleCss(item)}`;
  return `<div class="it label" style="${style}">${chipHtml(item, agentName)}<div class="it-text">${escapeHtml(item.Text)}</div></div>`;
}

function imageHtml(item: WhiteboardImageItem, ox: number, oy: number, agentName: string): string {
  const w = item.W ?? WHITEBOARD_DEFAULTS.ImageW;
  const style = `left:${n(item.X - ox)}px;top:${n(item.Y - oy)}px;width:${n(w)}px;height:${WHITEBOARD_DEFAULTS.ImageH}px;`;
  // Url is a runtime object URL (not persisted as pixels) — always export a named placeholder.
  return `<div class="it image" style="${style}">${chipHtml(item, agentName)}` +
    `<div class="image-glyph">▦</div><div class="image-name">${escapeHtml(item.Name)}</div></div>`;
}

/** Ink strokes draw in the SVG layer, but their ownership chip is an HTML div at the stroke's bounds. */
function inkChipHtml(item: WhiteboardInkItem, state: WhiteboardState, ox: number, oy: number, agentName: string): string {
  const b = state.ItemBounds(item);
  return `<div class="ink-chip" style="left:${n(b.X - ox)}px;top:${n(b.Y - oy - 18)}px;">${chipHtml(item, agentName)}</div>`;
}

// ────────────────────────────────────────────── vector layer (one inline SVG)

function inkSvg(item: WhiteboardInkItem, ox: number, oy: number): string {
  const points = item.Points.map((p) => `${n(p.X - ox)},${n(p.Y - oy)}`).join(' ');
  return `<polyline points="${points}" fill="none" stroke="${escapeHtml(item.Color)}" stroke-width="${n(item.StrokeWidth)}" stroke-linecap="round" stroke-linejoin="round"/>`;
}

function connectorSvg(item: WhiteboardConnectorItem, state: WhiteboardState, ox: number, oy: number): string {
  // Reuse the engine's own bounds math: endpoints anchor to the referenced item's center.
  const from = state.ResolveEndpoint(item, 'from');
  const to = state.ResolveEndpoint(item, 'to');
  const stroke = item.Author === 'agent' ? PALETTE.ConnectorAgent : PALETTE.ConnectorUser;
  return `<line x1="${n(from.X - ox)}" y1="${n(from.Y - oy)}" x2="${n(to.X - ox)}" y2="${n(to.Y - oy)}" ` +
    `stroke="${stroke}" stroke-width="2" marker-end="url(#wb-arrow)"/>`;
}

function highlightSvg(item: WhiteboardHighlightItem, ox: number, oy: number): string {
  const stroke = item.Author === 'agent' ? PALETTE.HighlightAgent : PALETTE.HighlightUser;
  const rect = `<rect x="${n(item.X - ox)}" y="${n(item.Y - oy)}" width="${n(item.W)}" height="${n(item.H)}" rx="10" ` +
    `fill="none" stroke="${stroke}" stroke-width="2" stroke-dasharray="7 5"/>`;
  const label = item.Label
    ? `<text x="${n(item.X - ox + 6)}" y="${n(item.Y - oy - 7)}" font-size="11" fill="${stroke}">${escapeHtml(item.Label)}</text>`
    : '';
  return rect + label;
}

/** The single vector layer: ink + connectors + highlight outlines, in render (Z) order. */
function vectorLayerSvg(state: WhiteboardState, b: WhiteboardBounds): string {
  const parts: string[] = [];
  for (const item of state.Items) {
    if (item.Kind === 'ink') {
      parts.push(inkSvg(item, b.X, b.Y));
    }
    else if (item.Kind === 'connector') {
      parts.push(connectorSvg(item, state, b.X, b.Y));
    }
    else if (item.Kind === 'highlight') {
      parts.push(highlightSvg(item, b.X, b.Y));
    }
  }
  return `<svg class="vector" width="${n(b.W)}" height="${n(b.H)}" viewBox="0 0 ${n(b.W)} ${n(b.H)}" xmlns="http://www.w3.org/2000/svg">` +
    `<defs><marker id="wb-arrow" markerWidth="8" markerHeight="8" refX="7" refY="3" orient="auto">` +
    `<path d="M0,0 L7,3 L0,6 Z" fill="${PALETTE.ConnectorUser}"/></marker></defs>${parts.join('')}</svg>`;
}

/** All positioned box-item divs (+ ink ownership chips), in render (Z) order. */
function boxLayerHtml(state: WhiteboardState, b: WhiteboardBounds, agentName: string): string {
  const parts: string[] = [];
  for (const item of state.Items) {
    switch (item.Kind) {
      case 'sticky': parts.push(stickyHtml(item, b.X, b.Y, agentName)); break;
      case 'shape': parts.push(shapeHtml(item, b.X, b.Y, agentName)); break;
      case 'text': parts.push(textHtml(item, b.X, b.Y, agentName)); break;
      case 'image': parts.push(imageHtml(item, b.X, b.Y, agentName)); break;
      case 'ink': parts.push(inkChipHtml(item, state, b.X, b.Y, agentName)); break;
      case 'connector':
      case 'highlight':
        break; // vector layer only
    }
  }
  return parts.join('');
}

// ────────────────────────────────────────────── document chrome

function documentCss(): string {
  return `
  * { box-sizing: border-box; }
  body { margin: 0; padding: 24px; background: ${PALETTE.PageBg}; color: ${PALETTE.TextPrimary};
         font-family: ${FONT_STACKS.sans}; }
  .exp-head { margin-bottom: 14px; }
  .exp-head h1 { margin: 0 0 4px; font-size: 19px; }
  .exp-meta { font-size: 12px; color: ${PALETTE.TextMuted}; }
  .board-wrap { overflow: auto; }
  .board { position: relative; background: ${PALETTE.PaperBg}; border: 1px solid ${PALETTE.PaperBorder};
           border-radius: 8px; box-shadow: 0 2px 10px rgba(15, 23, 42, 0.08); overflow: hidden; }
  .vector { position: absolute; left: 0; top: 0; }
  .it { position: absolute; border: 1px solid transparent; border-radius: 6px; padding: 18px 10px 10px;
        font-size: 12px; line-height: 1.35; box-shadow: 0 1px 4px rgba(15, 23, 42, 0.10); }
  .it-text { white-space: pre-wrap; word-break: break-word; }
  .it.shape { display: flex; flex-direction: column; align-items: center; justify-content: center;
              text-align: center; padding: 10px; }
  .it-label { font-weight: 600; }
  .it-sub { font-size: 10.5px; color: ${PALETTE.TextMuted}; margin-top: 2px; }
  .it.label { background: transparent; border: none; box-shadow: none; padding: 14px 2px 2px; }
  .it.image { background: ${PALETTE.ImageBg}; border-color: ${PALETTE.ImageBorder}; display: flex;
              flex-direction: column; align-items: center; justify-content: center; gap: 6px; }
  .image-glyph { font-size: 22px; color: ${PALETTE.TextMuted}; }
  .image-name { font-size: 10.5px; color: ${PALETTE.TextMuted}; max-width: 100%; overflow: hidden;
                text-overflow: ellipsis; white-space: nowrap; }
  .ink-chip { position: absolute; }
  .chip { position: absolute; top: -9px; left: 8px; font-size: 9px; font-weight: 700; letter-spacing: 0.02em;
          padding: 1px 7px; border-radius: 999px; border: 1px solid ${PALETTE.UserChipBorder};
          background: ${PALETTE.UserChipBg}; color: ${PALETTE.UserChipText}; white-space: nowrap; }
  .chip--agent { border-color: ${PALETTE.AgentChipBorder}; background: ${PALETTE.AgentChipBg};
                 color: ${PALETTE.AgentChipText}; }
  .ink-chip .chip { position: static; }
  .exp-empty { padding: 48px 0; text-align: center; color: ${PALETTE.TextMuted}; font-size: 13px; }
  .exp-foot { margin-top: 12px; font-size: 11px; color: ${PALETTE.TextMuted}; }
  @media print {
    body { background: #ffffff; padding: 0; }
    .board, .it { box-shadow: none !important; }
    .board-wrap { overflow: visible; }
  }
  @page { margin: 12mm; }`;
}

/**
 * Build a fully self-contained HTML document for the given board snapshot — inline CSS
 * only, light paper-friendly palette, header (title / generated-at / agent byline), the
 * positioned board, ownership chips, item-count footer and print-friendly `@media print`
 * rules. Deterministic for a given state + options; all text is HTML-escaped.
 */
export function BuildWhiteboardExportHtml(state: WhiteboardState, opts: WhiteboardExportOptions): string {
  const b = exportBounds(state);
  const title = escapeHtml(opts.Title);
  const agent = escapeHtml(opts.AgentName);
  const empty = state.Items.length === 0;
  const boardInner = empty
    ? `<div class="exp-empty">This whiteboard is empty.</div>`
    : vectorLayerSvg(state, b) + boxLayerHtml(state, b, opts.AgentName);
  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<title>${title}</title>
<style>${documentCss()}</style>
</head>
<body>
<header class="exp-head">
<h1>${title}</h1>
<div class="exp-meta">Generated ${escapeHtml(opts.GeneratedAt)} &middot; Live session with ${agent}</div>
</header>
<main class="board-wrap">
<div class="board" style="width:${n(b.W)}px;height:${n(b.H)}px;">${boardInner}</div>
</main>
<footer class="exp-foot">${state.ElementCount} elements &middot; you ${state.CountByAuthor('user')} &middot; ${agent} ${state.CountByAuthor('agent')}</footer>
</body>
</html>`;
}

// ────────────────────────────────────────────── standalone SVG export

/** First line of a (possibly multi-line) text, clipped for single-line SVG rendering. */
function svgLine(text: string, max = 60): string {
  const line = (text ?? '').split('\n')[0].trim();
  return escapeHtml(line.length > max ? `${line.slice(0, max).trimEnd()}…` : line);
}

function boxItemSvg(item: WhiteboardItem, state: WhiteboardState, ox: number, oy: number): string {
  switch (item.Kind) {
    case 'sticky': {
      const b = state.ItemBounds(item);
      const isAgent = item.Author === 'agent';
      const fill = isAgent ? PALETTE.StickyAgentBg : PALETTE.StickyAmberBg;
      const stroke = isAgent ? PALETTE.StickyAgentBorder : PALETTE.StickyAmberBorder;
      const fs = item.FontSize ?? 12;
      const font = FONT_STACKS[item.FontFamily ?? 'sans'];
      const weight = item.FontWeight ?? 400;
      return `<rect x="${n(b.X - ox)}" y="${n(b.Y - oy)}" width="${n(b.W)}" height="${n(b.H)}" rx="6" fill="${fill}" stroke="${stroke}"/>` +
        `<text x="${n(b.X - ox + 10)}" y="${n(b.Y - oy + 10 + fs)}" font-size="${n(fs)}" font-family="${font}" font-weight="${weight}" fill="${PALETTE.TextPrimary}">${svgLine(item.Text)}</text>`;
    }
    case 'shape': {
      const isAgent = item.Author === 'agent';
      const fill = isAgent ? PALETTE.ShapeAgentBg : PALETTE.ShapeUserBg;
      const stroke = isAgent ? PALETTE.ShapeAgentBorder : PALETTE.ShapeUserBorder;
      const x = item.X - ox, y = item.Y - oy;
      const cx = x + item.W / 2, cy = y + item.H / 2;
      const geom =
        item.Shape === 'ellipse'
          ? `<ellipse cx="${n(cx)}" cy="${n(cy)}" rx="${n(item.W / 2)}" ry="${n(item.H / 2)}" fill="${fill}" stroke="${stroke}"/>`
          : item.Shape === 'diamond'
            ? `<polygon points="${n(cx)},${n(y)} ${n(x + item.W)},${n(cy)} ${n(cx)},${n(y + item.H)} ${n(x)},${n(cy)}" fill="${fill}" stroke="${stroke}"/>`
            : `<rect x="${n(x)}" y="${n(y)}" width="${n(item.W)}" height="${n(item.H)}" rx="6" fill="${fill}" stroke="${stroke}"/>`;
      const sub = item.Sub
        ? `<text x="${n(cx)}" y="${n(cy + 16)}" font-size="10.5" text-anchor="middle" fill="${PALETTE.TextMuted}">${svgLine(item.Sub)}</text>`
        : '';
      return geom +
        `<text x="${n(cx)}" y="${n(cy + 4)}" font-size="12" font-weight="600" text-anchor="middle" fill="${PALETTE.TextPrimary}">${svgLine(item.Label)}</text>` + sub;
    }
    case 'text': {
      const fs = item.FontSize ?? 12;
      const font = FONT_STACKS[item.FontFamily ?? 'sans'];
      const weight = item.FontWeight ?? 400;
      const color = item.Color ? escapeHtml(item.Color) : PALETTE.TextPrimary;
      return `<text x="${n(item.X - ox)}" y="${n(item.Y - oy + fs)}" font-size="${n(fs)}" font-family="${font}" font-weight="${weight}" fill="${color}">${svgLine(item.Text)}</text>`;
    }
    case 'image': {
      const b = state.ItemBounds(item);
      return `<rect x="${n(b.X - ox)}" y="${n(b.Y - oy)}" width="${n(b.W)}" height="${n(b.H)}" rx="6" fill="${PALETTE.ImageBg}" stroke="${PALETTE.ImageBorder}"/>` +
        `<text x="${n(b.X - ox + b.W / 2)}" y="${n(b.Y - oy + b.H / 2 + 4)}" font-size="10.5" text-anchor="middle" fill="${PALETTE.TextMuted}">${svgLine(item.Name)}</text>`;
    }
    default:
      return '';
  }
}

/**
 * Build a standalone SVG document of the board snapshot: box items as SVG rects / shapes /
 * single-line text, plus the same vector layer (ink, connectors, highlight outlines).
 * All text is escaped; output is deterministic for a given state.
 */
export function BuildWhiteboardExportSvg(state: WhiteboardState): string {
  const b = exportBounds(state);
  const parts: string[] = [];
  for (const item of state.Items) {
    if (item.Kind === 'ink') {
      parts.push(inkSvg(item, b.X, b.Y));
    }
    else if (item.Kind === 'connector') {
      parts.push(connectorSvg(item, state, b.X, b.Y));
    }
    else if (item.Kind === 'highlight') {
      parts.push(highlightSvg(item, b.X, b.Y));
    }
    else {
      parts.push(boxItemSvg(item, state, b.X, b.Y));
    }
  }
  return `<?xml version="1.0" encoding="UTF-8"?>\n` +
    `<svg xmlns="http://www.w3.org/2000/svg" width="${n(b.W)}" height="${n(b.H)}" viewBox="0 0 ${n(b.W)} ${n(b.H)}" font-family="${FONT_STACKS.sans}">` +
    `<defs><marker id="wb-arrow" markerWidth="8" markerHeight="8" refX="7" refY="3" orient="auto">` +
    `<path d="M0,0 L7,3 L0,6 Z" fill="${PALETTE.ConnectorUser}"/></marker></defs>` +
    `<rect x="0" y="0" width="${n(b.W)}" height="${n(b.H)}" fill="${PALETTE.PaperBg}"/>` +
    `${parts.join('')}</svg>`;
}
