import { SlideDeckEngine } from './SlideDeckEngine';
import { SpreadsheetEngine } from './SpreadsheetEngine';

/**
 * Structured preview metadata stored inside `MJArtifactVersionEntity.Configuration.previewSnapshot`
 * so Library cards can render live miniature previews without fetching full `Content` blobs.
 */
export type ArtifactPreviewSnapshot =
  | {
      Kind: 'doc';
      Heading: string;
      Excerpt: string;
      Callout?: string;
    }
  | {
      Kind: 'sheet';
      Headers: string[];
      Rows: string[][];
    }
  | {
      Kind: 'slides';
      SlideTitle: string;
      LeftMetric?: string;
      RightMetric?: string;
      ThemeAccent?: string;
    }
  | {
      Kind: 'whiteboard';
      Nodes: string[];
    };

/**
 * Typed JSON shape for `MJArtifactVersionEntity.Configuration`.
 */
export interface ArtifactVersionConfiguration {
  previewSnapshot?: ArtifactPreviewSnapshot;
  thumbnailDataUrl?: string;
  [key: string]: unknown;
}

/**
 * Safely parses `MJArtifactVersionEntity.Configuration` JSON.
 */
export function ParseArtifactVersionConfiguration(
  rawConfig: string | null | undefined,
): ArtifactVersionConfiguration | null {
  if (!rawConfig || typeof rawConfig !== 'string') {
    return null;
  }
  const trimmed = rawConfig.trim();
  if (!trimmed.startsWith('{')) {
    return null;
  }
  try {
    const parsed: unknown = JSON.parse(trimmed);
    if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
      return parsed as ArtifactVersionConfiguration;
    }
    return null;
  } catch {
    return null;
  }
}

/**
 * Builds a compact structured preview snapshot from raw artifact `Content` + optional `DriverClass`.
 * When `driverClass` is omitted (e.g. server-side room compaction), JSON payloads for Sheets,
 * Slides, and Whiteboards are auto-detected safely before falling back to Markdown extraction.
 */
export function BuildArtifactPreviewSnapshot(
  content: string | null | undefined,
  driverClass?: string | null,
  fallbackTitle?: string,
): ArtifactPreviewSnapshot | null {
  if (!content || typeof content !== 'string' || !content.trim()) {
    return null;
  }
  const driver = (driverClass ?? '').trim();
  const trimmed = content.trim();

  if (driver === 'MarkdownArtifactViewerPlugin') {
    return extractDocSnapshot(content, fallbackTitle);
  }

  if (driver === 'SpreadsheetArtifactViewerPlugin') {
    return extractSheetSnapshot(content);
  }

  if (driver === 'SlideDeckArtifactViewerPlugin') {
    return extractSlideSnapshot(content, fallbackTitle);
  }

  if (driver === 'WhiteboardArtifactViewerPlugin') {
    return extractWhiteboardSnapshot(content);
  }

  if (!driver) {
    if (!trimmed.startsWith('{')) {
      return extractDocSnapshot(content, fallbackTitle);
    }
    try {
      const parsed: unknown = JSON.parse(trimmed);
      if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
        const obj = parsed as Record<string, unknown>;
        if (Array.isArray(obj['Worksheets'])) {
          return extractSheetSnapshot(content);
        }
        if (Array.isArray(obj['Slides']) || Array.isArray(obj['slides'])) {
          return extractSlideSnapshot(content, fallbackTitle);
        }
        if (Array.isArray(obj['pages']) || Array.isArray(obj['items']) || Array.isArray(obj['elements'])) {
          return extractWhiteboardSnapshot(content);
        }
      }
    } catch {
      return extractDocSnapshot(content, fallbackTitle);
    }
  }

  return null;
}

function extractDocSnapshot(markdown: string, fallbackTitle?: string): ArtifactPreviewSnapshot {
  const lines = markdown.replace(/\r\n/g, '\n').split('\n');
  let heading = '';
  const bodyLines: string[] = [];
  let callout = '';

  for (const rawLine of lines) {
    const line = rawLine.trim();
    if (!line || line.startsWith('```') || line.startsWith(':::')) {
      continue;
    }
    if (!heading && /^#{1,3}\s+/.test(line)) {
      heading = line.replace(/^#{1,3}\s+/, '').replace(/[*_`]/g, '').trim().slice(0, 80);
      continue;
    }
    if (!callout && line.startsWith('>')) {
      callout = line
        .replace(/^>\s*/, '')
        .replace(/\[!(NOTE|TIP|IMPORTANT|WARNING|CAUTION)\]\s*/i, '')
        .replace(/[*_`]/g, '')
        .trim()
        .slice(0, 100);
      continue;
    }
    const clean = line
      .replace(/^[-*+]\s+/, '')
      .replace(/^\d+\.\s+/, '')
      .replace(/[*_`]/g, '')
      .trim();
    if (clean.length > 0 && !clean.startsWith('|') && !clean.startsWith('---')) {
      bodyLines.push(clean);
      if (bodyLines.join(' ').length >= 130) {
        break;
      }
    }
  }

  const excerpt = bodyLines.join(' ').slice(0, 140);
  return {
    Kind: 'doc',
    Heading: heading || (fallbackTitle ?? 'Untitled Document').slice(0, 80),
    Excerpt: excerpt || 'Markdown document',
    ...(callout ? { Callout: callout } : {}),
  };
}

function extractSheetSnapshot(rawContent: string): ArtifactPreviewSnapshot | null {
  try {
    const wb = SpreadsheetEngine.Instance.ParseWorkbook(rawContent);
    const sheet = wb.Worksheets.find((w) => w.SheetID === wb.ActiveSheetID) ?? wb.Worksheets[0];
    if (!sheet) return null;

    const colLetters = ['A', 'B', 'C'];
    const headers: string[] = [];
    for (let c = 0; c < 3; c++) {
      const addr = `${colLetters[c]}1`;
      const cell = sheet.Cells[addr];
      const val = cell?.DisplayValue ?? (cell?.RawValue != null ? String(cell.RawValue) : '');
      headers.push(val.trim() || `Col ${colLetters[c]}`);
    }

    const rows: string[][] = [];
    for (let r = 2; r <= 4; r++) {
      const rowVals: string[] = [];
      let hasData = false;
      for (let c = 0; c < 3; c++) {
        const addr = `${colLetters[c]}${r}`;
        const cell = sheet.Cells[addr];
        const val = cell?.DisplayValue ?? (cell?.RawValue != null ? String(cell.RawValue) : '');
        if (val.trim()) hasData = true;
        rowVals.push(val.trim().slice(0, 18));
      }
      if (hasData) {
        rows.push(rowVals);
      }
    }

    if (rows.length === 0 && headers.every((h, i) => h === `Col ${colLetters[i]}`)) {
      return null;
    }

    return {
      Kind: 'sheet',
      Headers: headers.map((h) => h.slice(0, 18)),
      Rows: rows,
    };
  } catch {
    return null;
  }
}

function extractSlideSnapshot(rawContent: string, fallbackTitle?: string): ArtifactPreviewSnapshot | null {
  try {
    const deck = SlideDeckEngine.Instance.ParseDeckSpec(rawContent);
    const firstSlide = deck.Slides[0];
    if (!firstSlide) return null;

    const textSnippets: string[] = [];
    for (const region of firstSlide.Regions) {
      if (region.MarkdownContent?.trim()) {
        const firstLine = region.MarkdownContent
          .split('\n')
          .map((l) => l.trim().replace(/^[#>*\-\s]+/, ''))
          .find((l) => l.length > 0);
        if (firstLine) {
          textSnippets.push(firstLine.slice(0, 28));
        }
      }
      if (textSnippets.length >= 2) break;
    }

    return {
      Kind: 'slides',
      SlideTitle: (firstSlide.Title || deck.Title || fallbackTitle || 'Slide 1').slice(0, 60),
      ...(textSnippets[0] ? { LeftMetric: textSnippets[0] } : {}),
      ...(textSnippets[1] ? { RightMetric: textSnippets[1] } : {}),
      ...(deck.Theme?.PrimaryColor ? { ThemeAccent: deck.Theme.PrimaryColor } : {}),
    };
  } catch {
    return null;
  }
}

function extractWhiteboardSnapshot(rawContent: string): ArtifactPreviewSnapshot | null {
  try {
    const parsed: unknown = JSON.parse(rawContent);
    if (!parsed || typeof parsed !== 'object') return null;
    const obj = parsed as Record<string, unknown>;
    const rawItems: unknown[] = [];

    if (Array.isArray(obj['items'])) {
      rawItems.push(...obj['items']);
    } else if (Array.isArray(obj['elements'])) {
      rawItems.push(...obj['elements']);
    } else if (Array.isArray(obj['pages'])) {
      for (const page of obj['pages']) {
        if (page && typeof page === 'object') {
          const pRec = page as Record<string, unknown>;
          if (Array.isArray(pRec['items'])) {
            rawItems.push(...pRec['items']);
          }
        }
      }
    }

    const nodes: string[] = [];
    for (const entry of rawItems) {
      if (entry && typeof entry === 'object') {
        const rec = entry as Record<string, unknown>;
        const label =
          typeof rec['text'] === 'string'
            ? rec['text']
            : typeof rec['label'] === 'string'
              ? rec['label']
              : typeof rec['title'] === 'string'
                ? rec['title']
                : '';
        if (label.trim()) {
          nodes.push(label.trim().slice(0, 22));
        }
      }
      if (nodes.length >= 3) break;
    }
    if (nodes.length === 0 && rawItems.length > 0) {
      nodes.push(`${rawItems.length} element${rawItems.length === 1 ? '' : 's'}`);
    }
    return nodes.length > 0 ? { Kind: 'whiteboard', Nodes: nodes } : null;
  } catch {
    return null;
  }
}

function escapeXml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

function encodeUtf8ToBase64(input: string): string {
  if (typeof Buffer !== 'undefined') {
    return Buffer.from(input, 'utf8').toString('base64');
  }
  const bytes = new TextEncoder().encode(input);
  let binary = '';
  for (let i = 0; i < bytes.length; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary);
}

/**
 * Renders a compact, base64-encoded SVG thumbnail (`data:image/svg+xml;base64,...`)
 * from an {@link ArtifactPreviewSnapshot} so it can be stored directly inside
 * `MJArtifactVersionEntity.Configuration.thumbnailDataUrl`.
 */
export function BuildSvgThumbnailDataUrl(snapshot: ArtifactPreviewSnapshot | null): string | null {
  if (!snapshot) return null;

  let body = '';
  if (snapshot.Kind === 'doc') {
    body = `
      <rect x="14" y="14" width="252" height="122" rx="8" fill="#141f31" stroke="#2a3b55"/>
      <text x="26" y="38" fill="#f1f5f9" font-family="system-ui,sans-serif" font-size="13" font-weight="700">${escapeXml(snapshot.Heading.slice(0, 34))}</text>
      <text x="26" y="58" fill="#94a3b8" font-family="system-ui,sans-serif" font-size="10">${escapeXml(snapshot.Excerpt.slice(0, 44))}</text>
      <text x="26" y="73" fill="#94a3b8" font-family="system-ui,sans-serif" font-size="10">${escapeXml(snapshot.Excerpt.slice(44, 88))}</text>
      ${snapshot.Callout ? `<rect x="26" y="88" width="228" height="28" rx="4" fill="#1b3052"/><rect x="26" y="88" width="3" height="28" fill="#3b82f6"/><text x="36" y="106" fill="#cbd5e1" font-family="system-ui,sans-serif" font-size="9.5">${escapeXml(snapshot.Callout.slice(0, 38))}</text>` : ''}
    `;
  } else if (snapshot.Kind === 'sheet') {
    const hdrs = snapshot.Headers.slice(0, 3);
    const rows = snapshot.Rows.slice(0, 3);
    body = `
      <rect x="14" y="16" width="252" height="118" rx="6" fill="#141f31" stroke="#26403c"/>
      <rect x="14" y="16" width="252" height="24" rx="6" fill="#13312a"/>
      ${hdrs.map((h, i) => `<text x="${24 + i * 82}" y="32" fill="#34d399" font-family="system-ui,sans-serif" font-size="10" font-weight="700">${escapeXml(h.slice(0, 12))}</text>`).join('')}
      ${rows.map((r, rIdx) => r.slice(0, 3).map((c, cIdx) => `<text x="${24 + cIdx * 82}" y="${58 + rIdx * 24}" fill="#cbd5e1" font-family="system-ui,sans-serif" font-size="9.5">${escapeXml(c.slice(0, 12))}</text>`).join('')).join('')}
    `;
  } else if (snapshot.Kind === 'slides') {
    const accent = snapshot.ThemeAccent || '#f59e0b';
    body = `
      <rect x="14" y="16" width="252" height="118" rx="8" fill="#171f33" stroke="#473c24"/>
      <text x="26" y="42" fill="#f1f5f9" font-family="system-ui,sans-serif" font-size="12.5" font-weight="700">${escapeXml(snapshot.SlideTitle.slice(0, 32))}</text>
      <rect x="26" y="56" width="108" height="60" rx="5" fill="#1f2a42" stroke="#2f3e5c"/>
      <rect x="146" y="56" width="108" height="60" rx="5" fill="#1f2a42" stroke="#2f3e5c"/>
      <text x="34" y="80" fill="${escapeXml(accent)}" font-family="system-ui,sans-serif" font-size="10" font-weight="600">${escapeXml((snapshot.LeftMetric || 'Key Metric').slice(0, 16))}</text>
      <text x="154" y="80" fill="#34d399" font-family="system-ui,sans-serif" font-size="10" font-weight="600">${escapeXml((snapshot.RightMetric || 'Details').slice(0, 16))}</text>
    `;
  } else {
    const nodes = snapshot.Nodes.slice(0, 3);
    body = `
      <rect x="14" y="16" width="252" height="118" rx="8" fill="#131c2c" stroke="#392e5c"/>
      ${nodes.map((n, i) => `<rect x="${22 + i * 82}" y="58" width="72" height="32" rx="6" fill="#231c3d" stroke="#8b5cf6"/><text x="${58 + i * 82}" y="78" text-anchor="middle" fill="#e2e8f0" font-family="system-ui,sans-serif" font-size="9">${escapeXml(n.slice(0, 11))}</text>`).join('')}
    `;
  }

  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="280" height="144" viewBox="0 0 280 144"><rect width="280" height="144" fill="#0e1623"/>${body}</svg>`;
  return `data:image/svg+xml;base64,${encodeUtf8ToBase64(svg)}`;
}

/**
 * Merges `previewSnapshot` and `thumbnailDataUrl` into an artifact version's `Configuration` JSON string,
 * preserving all existing configuration keys.
 */
export function MergeArtifactVersionPreviewConfig(
  rawConfig: string | null | undefined,
  snapshot: ArtifactPreviewSnapshot | null,
  thumbnailDataUrl?: string | null,
): string | null {
  const existing = ParseArtifactVersionConfiguration(rawConfig) ?? {};
  if (!snapshot && !thumbnailDataUrl) {
    return rawConfig ?? null;
  }
  const merged: ArtifactVersionConfiguration = {
    ...existing,
    ...(snapshot ? { previewSnapshot: snapshot } : {}),
    ...(thumbnailDataUrl ? { thumbnailDataUrl } : {}),
  };
  return JSON.stringify(merged);
}

/**
 * Convenience helper: derives `previewSnapshot` + base64 SVG `thumbnailDataUrl` from raw
 * `content` and merges them into `rawConfig`.
 */
export function BuildArtifactVersionConfigurationWithPreview(
  rawConfig: string | null | undefined,
  content: string | null | undefined,
  driverClass?: string | null,
  fallbackTitle?: string | null,
): string | null {
  const snapshot = BuildArtifactPreviewSnapshot(content, driverClass, fallbackTitle ?? undefined);
  const thumbnailDataUrl = BuildSvgThumbnailDataUrl(snapshot);
  return MergeArtifactVersionPreviewConfig(rawConfig, snapshot, thumbnailDataUrl);
}
