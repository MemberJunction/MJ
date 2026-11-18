import {
    BuildBlockIdentityBinding,
    DocumentBlockColumn,
    DocumentBlockSpec,
    DocumentLiveBlockEngine,
    ValidateFrozenBlockSnapshot
} from './DocumentLiveBlockEngine.js';
import type {
    SlideMasterSpec,
    SlideDeckSpec,
    SlideDeckThemeSpec,
    SlideLayoutKind,
    SlideRegionSpec,
    SlideSpec,
    SlideTransitionKind
} from './SlideDeckEngine.js';
import { SpreadsheetEngine } from './SpreadsheetEngine.js';

/**
 * Options controlling headless `.pptx` export from {@link SlideDeckEngine.ExportDeckToPptxBytes}.
 */
export interface SlideDeckPptxExportOptions {
    /** When `true`, slides with `Hidden: true` are exported with `<p:sld show="0">`; defaults to `false` (excluded). */
    IncludeHiddenSlides?: boolean;
    /** Function validating image/logo URLs; injected from `SlideDeckEngine.SanitizeImageUrl`. */
    SanitizeImageUrl?: (raw: string | undefined | null) => string | undefined;
    /**
     * Optional set of server-verified block/region IDs (`block.BlockID`, `region.RegionID`, or
     * `${slide.SlideID}:${region.RegionID}`) whose `FrozenSnapshot` was already authenticated via
     * server verification or guest-share provenance (browser contexts cannot hold the server HMAC secret).
     */
    VerifiedBlockIds?: ReadonlySet<string>;
}

interface CustomPptxMetaSlide {
    SlideID: string;
    Layout: SlideLayoutKind;
    Transition?: SlideTransitionKind;
    Hidden?: boolean;
}

interface CustomPptxMeta {
    DeckID?: string;
    Subtitle?: string;
    Master?: SlideMasterSpec;
    Theme?: Partial<SlideDeckThemeSpec>;
    Slides?: CustomPptxMetaSlide[];
}

interface PptxRelEntry {
    Id: string;
    Type: string;
    Target: string;
}

const SLIDE_W_16_9 = 12192000;
const SLIDE_W_4_3 = 9144000;
const SLIDE_H_STD = 6858000;

const REL_TYPE_SLIDE = 'http://schemas.openxmlformats.org/officeDocument/2006/relationships/slide';
const REL_TYPE_SLIDE_LAYOUT = 'http://schemas.openxmlformats.org/officeDocument/2006/relationships/slideLayout';
const REL_TYPE_SLIDE_MASTER = 'http://schemas.openxmlformats.org/officeDocument/2006/relationships/slideMaster';
const REL_TYPE_NOTES_SLIDE = 'http://schemas.openxmlformats.org/officeDocument/2006/relationships/notesSlide';
const REL_TYPE_NOTES_MASTER = 'http://schemas.openxmlformats.org/officeDocument/2006/relationships/notesMaster';
const REL_TYPE_THEME = 'http://schemas.openxmlformats.org/officeDocument/2006/relationships/theme';
const REL_TYPE_CHART = 'http://schemas.openxmlformats.org/officeDocument/2006/relationships/chart';
const REL_TYPE_OFFICE_DOC = 'http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument';
const REL_TYPE_CORE_PROPS = 'http://schemas.openxmlformats.org/package/2006/relationships/metadata/core-properties';
const REL_TYPE_EXT_PROPS = 'http://schemas.openxmlformats.org/officeDocument/2006/relationships/extended-properties';
const REL_TYPE_CUSTOM_PROPS = 'http://schemas.openxmlformats.org/officeDocument/2006/relationships/custom-properties';

/**
 * Strips illegal XML 1.0 control characters (`U+0000`–`U+0008`, `U+000B`, `U+000C`,
 * `U+000E`–`U+001F`, `U+FFFE`, `U+FFFF`) and escapes XML predefined entities.
 */
function escapePptxXml(raw: string): string {
    const cleaned = String(raw ?? '').replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\uFFFE\uFFFF]/g, '');
    return cleaned
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&apos;');
}

/**
 * Unescapes XML predefined entities, numeric entities (`&#10;`, `&#xA;`, etc.), and OOXML `_xHHHH_` escapes.
 */
function unescapePptxXml(raw: string): string {
    const withOoxml = String(raw ?? '').replace(/_x([0-9A-Fa-f]{4})_/g, (_m, hex: string) => {
        const code = parseInt(hex, 16);
        if (code === 0x005f) return '_';
        if (code === 0x0009 || code === 0x000a || code === 0x000d) {
            return String.fromCharCode(code);
        }
        return code >= 0x20 ? String.fromCharCode(code) : '';
    });
    const withNumeric = withOoxml
        .replace(/&#x([0-9A-Fa-f]+);/gi, (_m, hex: string) => {
            const cp = parseInt(hex, 16);
            if (!Number.isFinite(cp) || cp < 0 || cp > 0x10ffff) return '';
            if ((cp < 0x20 && cp !== 0x09 && cp !== 0x0a && cp !== 0x0d) || cp === 0xfffe || cp === 0xffff) {
                return '';
            }
            return String.fromCodePoint(cp);
        })
        .replace(/&#(\d+);/g, (_m, dec: string) => {
            const cp = parseInt(dec, 10);
            if (!Number.isFinite(cp) || cp < 0 || cp > 0x10ffff) return '';
            if ((cp < 0x20 && cp !== 0x09 && cp !== 0x0a && cp !== 0x0d) || cp === 0xfffe || cp === 0xffff) {
                return '';
            }
            return String.fromCodePoint(cp);
        });
    return withNumeric
        .replace(/&apos;/g, "'")
        .replace(/&quot;/g, '"')
        .replace(/&gt;/g, '>')
        .replace(/&lt;/g, '<')
        .replace(/&amp;/g, '&');
}

function toDrawingHexColor(cssColor: string | undefined, fallbackHex: string): string {
    const trimmed = String(cssColor ?? '').trim();
    const m = /^#([0-9a-f]{3}|[0-9a-f]{6})(?:[0-9a-f]{2})?$/i.exec(trimmed);
    if (!m) return fallbackHex;
    const raw = m[1].toUpperCase();
    if (raw.length === 3) {
        return `${raw[0]}${raw[0]}${raw[1]}${raw[1]}${raw[2]}${raw[2]}`;
    }
    return raw;
}

function primaryFontName(fontStack: string | undefined, fallback: string): string {
    const first = String(fontStack ?? '')
        .split(',')[0]
        ?.trim()
        .replace(/^['"]|['"]$/g, '');
    return first && /^[A-Za-z0-9\s._-]+$/.test(first) ? first : fallback;
}

function normalizePptxRelTarget(baseDir: string, target: string): string | null {
    const cleaned = String(target ?? '').replace(/\\/g, '/').trim();
    if (!cleaned || /^https?:\/\//i.test(cleaned) || cleaned.startsWith('//')) {
        return null;
    }
    const rawSegments = cleaned.startsWith('/')
        ? cleaned.slice(1).split('/')
        : [...(baseDir ? baseDir.split('/').filter(Boolean) : []), ...cleaned.split('/')];
    const resolved: string[] = [];
    for (const seg of rawSegments) {
        if (!seg || seg === '.') continue;
        if (seg === '..') {
            if (resolved.length === 0) {
                return null;
            }
            resolved.pop();
        } else {
            resolved.push(seg);
        }
    }
    return resolved.join('/');
}

function parseRelsXml(xml: string): PptxRelEntry[] {
    const rels: PptxRelEntry[] = [];
    const relRe = /<Relationship\b([^>]*?)\/?>(?:<\/Relationship>)?/gi;
    let m: RegExpExecArray | null;
    while ((m = relRe.exec(xml)) !== null) {
        const attrs = m[1];
        const id = /\bId="([^"]*)"/i.exec(attrs)?.[1] ?? '';
        const type = /\bType="([^"]*)"/i.exec(attrs)?.[1] ?? '';
        const target = /\bTarget="([^"]*)"/i.exec(attrs)?.[1] ?? '';
        if (id && target) {
            rels.push({
                Id: unescapePptxXml(id),
                Type: unescapePptxXml(type),
                Target: unescapePptxXml(target)
            });
        }
    }
    return rels;
}

function buildTextParagraphsXml(
    text: string,
    options: {
        fontSizeHundredthsPt: number;
        bold?: boolean;
        italic?: boolean;
        colorHex: string;
        fontFace: string;
        align?: 'l' | 'ctr' | 'r';
        bullet?: boolean;
    }
): string {
    const lines = String(text ?? '')
        .replace(/\r\n/g, '\n')
        .split('\n');
    if (lines.length === 0) {
        return `<a:p><a:pPr algn="${options.align ?? 'l'}"/><a:endParaRPr lang="en-US" sz="${options.fontSizeHundredthsPt}"/></a:p>`;
    }
    return lines
        .map((line) => {
            const trimmed = line.trim();
            const isBullet = options.bullet && /^[-*]\s+/.test(trimmed);
            const cleanLine = isBullet ? trimmed.replace(/^[-*]\s+/, '') : line;
            const boldFlag = options.bold ? ' b="1"' : '';
            const italicFlag = options.italic ? ' i="1"' : '';
            const bulletXml = isBullet ? '<a:buChar char="•"/>' : '<a:buNone/>';
            const rPr =
                `<a:rPr lang="en-US" sz="${options.fontSizeHundredthsPt}"${boldFlag}${italicFlag} dirty="0">` +
                `<a:solidFill><a:srgbClr val="${options.colorHex}"/></a:solidFill>` +
                `<a:latin typeface="${escapePptxXml(options.fontFace)}"/>` +
                `</a:rPr>`;
            if (!cleanLine) {
                return `<a:p><a:pPr algn="${options.align ?? 'l'}">${bulletXml}</a:pPr><a:endParaRPr lang="en-US" sz="${options.fontSizeHundredthsPt}"/></a:p>`;
            }
            return (
                `<a:p>` +
                `<a:pPr algn="${options.align ?? 'l'}">${bulletXml}</a:pPr>` +
                `<a:r>${rPr}<a:t>${escapePptxXml(cleanLine)}</a:t></a:r>` +
                `<a:endParaRPr lang="en-US" sz="${options.fontSizeHundredthsPt}"/>` +
                `</a:p>`
            );
        })
        .join('');
}

function buildTextShapeXml(params: {
    shapeId: number;
    name: string;
    x: number;
    y: number;
    cx: number;
    cy: number;
    text: string;
    fontSizePt: number;
    bold?: boolean;
    italic?: boolean;
    colorHex: string;
    fontFace: string;
    fillHex?: string;
    borderHex?: string;
    placeholderType?: 'title' | 'subTitle' | 'body';
    align?: 'l' | 'ctr' | 'r';
    bullet?: boolean;
}): string {
    const phXml = params.placeholderType ? `<p:nvPr><p:ph type="${params.placeholderType}"/></p:nvPr>` : '<p:nvPr/>';
    const fillXml = params.fillHex
        ? `<a:solidFill><a:srgbClr val="${params.fillHex}"/></a:solidFill>`
        : '<a:noFill/>';
    const lnXml = params.borderHex
        ? `<a:ln w="12700"><a:solidFill><a:srgbClr val="${params.borderHex}"/></a:solidFill></a:ln>`
        : '<a:ln><a:noFill/></a:ln>';
    const bodyXml = buildTextParagraphsXml(params.text, {
        fontSizeHundredthsPt: Math.round(params.fontSizePt * 100),
        bold: params.bold,
        italic: params.italic,
        colorHex: params.colorHex,
        fontFace: params.fontFace,
        align: params.align,
        bullet: params.bullet
    });

    return [
        '<p:sp>',
        '<p:nvSpPr>',
        `<p:cNvPr id="${params.shapeId}" name="${escapePptxXml(params.name)}"/>`,
        '<p:cNvSpPr/>',
        phXml,
        '</p:nvSpPr>',
        '<p:spPr>',
        `<a:xfrm><a:off x="${Math.round(params.x)}" y="${Math.round(params.y)}"/><a:ext cx="${Math.round(params.cx)}" cy="${Math.round(params.cy)}"/></a:xfrm>`,
        '<a:prstGeom prst="rect"><a:avLst/></a:prstGeom>',
        fillXml,
        lnXml,
        '</p:spPr>',
        '<p:txBody>',
        '<a:bodyPr wrap="square" lIns="91440" tIns="45720" rIns="91440" bIns="45720"/>',
        '<a:lstStyle/>',
        bodyXml,
        '</p:txBody>',
        '</p:sp>'
    ].join('');
}

function parseMarkdownTableRows(markdown: string): string[][] | null {
    const lines = String(markdown ?? '')
        .replace(/\r\n/g, '\n')
        .split('\n')
        .map((l) => l.trim())
        .filter((l) => l.length > 0);
    if (lines.length < 2) return null;
    if (!lines.every((l) => l.startsWith('|'))) return null;
    if (!/^\|[\s:|-]+\|?$/.test(lines[1])) return null;
    const rows: string[][] = [];
    for (let i = 0; i < lines.length; i++) {
        if (i === 1 && /^\|[\s:|-]+\|?$/.test(lines[i])) continue;
        const cells = lines[i]
            .replace(/^\|/, '')
            .replace(/\|$/, '')
            .split('|')
            .map((c) => c.trim());
        rows.push(cells);
    }
    return rows.length > 0 ? rows : null;
}

function buildTableGraphicFrameXml(params: {
    shapeId: number;
    name: string;
    x: number;
    y: number;
    cx: number;
    cy: number;
    headers: string[];
    rows: string[][];
    primaryHex: string;
    surfaceHex: string;
    textHex: string;
    fontFace: string;
}): string {
    const colCount = Math.max(1, params.headers.length);
    const colWidth = Math.max(457200, Math.floor(params.cx / colCount));
    const gridColsXml = Array.from({ length: colCount }, () => `<a:gridCol w="${colWidth}"/>`).join('');

    const buildCell = (cellText: string, isHeader: boolean, rowIdx: number): string => {
        const bgHex = isHeader ? params.primaryHex : rowIdx % 2 === 0 ? 'FFFFFF' : params.surfaceHex;
        const fgHex = isHeader ? 'FFFFFF' : params.textHex;
        const pXml = buildTextParagraphsXml(cellText, {
            fontSizeHundredthsPt: isHeader ? 1200 : 1100,
            bold: isHeader,
            colorHex: fgHex,
            fontFace: params.fontFace
        });
        return (
            `<a:tc>` +
            `<a:txBody><a:bodyPr/><a:lstStyle/>${pXml}</a:txBody>` +
            `<a:tcPr><a:solidFill><a:srgbClr val="${bgHex}"/></a:solidFill></a:tcPr>` +
            `</a:tc>`
        );
    };

    const headerRowXml =
        `<a:tr h="370840">` +
        Array.from({ length: colCount }, (_, idx) => buildCell(params.headers[idx] ?? '', true, -1)).join('') +
        `</a:tr>`;
    const bodyRowsXml = params.rows
        .slice(0, 25)
        .map(
            (r, rIdx) =>
                `<a:tr h="340000">` +
                Array.from({ length: colCount }, (_, idx) => buildCell(r[idx] ?? '', false, rIdx)).join('') +
                `</a:tr>`
        )
        .join('');

    return [
        '<p:graphicFrame>',
        '<p:nvGraphicFramePr>',
        `<p:cNvPr id="${params.shapeId}" name="${escapePptxXml(params.name)}"/>`,
        '<p:cNvGraphicFramePr><a:graphicFrameLocks noGrp="1"/></p:cNvGraphicFramePr>',
        '<p:nvPr/>',
        '</p:nvGraphicFramePr>',
        `<p:xfrm><a:off x="${Math.round(params.x)}" y="${Math.round(params.y)}"/><a:ext cx="${Math.round(params.cx)}" cy="${Math.round(params.cy)}"/></p:xfrm>`,
        '<a:graphic><a:graphicData uri="http://schemas.openxmlformats.org/drawingml/2006/table">',
        `<a:tbl><a:tblPr firstRow="1" bandRow="1"/><a:tblGrid>${gridColsXml}</a:tblGrid>${headerRowXml}${bodyRowsXml}</a:tbl>`,
        '</a:graphicData></a:graphic>',
        '</p:graphicFrame>'
    ].join('');
}

interface ExtractedBlockChartData {
    Title: string;
    ChartType: 'bar' | 'line' | 'pie' | 'area';
    Categories: string[];
    Series: Array<{ Name: string; Values: number[] }>;
}

function tryExtractChartDataFromSnapshot(block: DocumentBlockSpec, regionLabel: string): ExtractedBlockChartData | null {
    const snap = block.FrozenSnapshot;
    if (!snap || !Array.isArray(snap.Columns) || !Array.isArray(snap.Rows) || snap.Rows.length === 0) {
        return null;
    }
    const wantsChart =
        block.DisplayMode === 'chart' ||
        Boolean(block.ChartType) ||
        Boolean(block.SheetChartID);
    if (!wantsChart) {
        return null;
    }

    const numericCols: DocumentBlockColumn[] = [];
    let categoryCol: DocumentBlockColumn | null = null;
    for (const col of snap.Columns) {
        const vals = snap.Rows.map((r) => r[col.Name]);
        const numericCount = vals.filter((v) => typeof v === 'number' && Number.isFinite(v)).length;
        if (numericCount > 0 && numericCount >= Math.ceil(snap.Rows.length * 0.5)) {
            numericCols.push(col);
        } else if (!categoryCol) {
            categoryCol = col;
        }
    }
    if (numericCols.length === 0) {
        return null;
    }
    const resolvedCategoryCol = categoryCol ?? snap.Columns[0];
    const seriesCols = numericCols.filter((c) => c.Name !== resolvedCategoryCol.Name || numericCols.length === 1);
    if (seriesCols.length === 0) {
        return null;
    }

    const categories = snap.Rows.slice(0, 40).map((r, idx) => {
        const raw = r[resolvedCategoryCol.Name];
        return raw !== null && raw !== undefined && String(raw).trim() !== '' ? String(raw) : `Item ${idx + 1}`;
    });
    const series = seriesCols.map((sc) => ({
        Name: sc.DisplayName || sc.Name,
        Values: snap.Rows.slice(0, 40).map((r) => {
            const v = r[sc.Name];
            return typeof v === 'number' && Number.isFinite(v) ? v : 0;
        })
    }));

    return {
        Title: block.Title || regionLabel || 'Chart',
        ChartType: block.ChartType ?? 'bar',
        Categories: categories,
        Series: series
    };
}

function buildDrawingMlChartXml(chart: ExtractedBlockChartData, paletteHex: string[]): string {
    const chartTag =
        chart.ChartType === 'line'
            ? 'lineChart'
            : chart.ChartType === 'pie'
              ? 'pieChart'
              : chart.ChartType === 'area'
                ? 'areaChart'
                : 'barChart';

    const catPts = chart.Categories.map(
        (cat, idx) => `<c:pt idx="${idx}"><c:v>${escapePptxXml(cat)}</c:v></c:pt>`
    ).join('');
    const catCount = chart.Categories.length;

    const seriesXml = chart.Series.map((ser, sIdx) => {
        const colorHex = paletteHex[sIdx % paletteHex.length] || '4F46E5';
        const valPts = ser.Values.map((v, idx) => `<c:pt idx="${idx}"><c:v>${Number.isFinite(v) ? v : 0}</c:v></c:pt>`).join('');
        return [
            '<c:ser>',
            `<c:idx val="${sIdx}"/>`,
            `<c:order val="${sIdx}"/>`,
            `<c:tx><c:v>${escapePptxXml(ser.Name)}</c:v></c:tx>`,
            `<c:spPr><a:solidFill><a:srgbClr val="${colorHex}"/></a:solidFill></c:spPr>`,
            `<c:cat><c:strLit><c:ptCount val="${catCount}"/>${catPts}</c:strLit></c:cat>`,
            `<c:val><c:numLit><c:formatCode>General</c:formatCode><c:ptCount val="${ser.Values.length}"/>${valPts}</c:numLit></c:val>`,
            '</c:ser>'
        ].join('');
    }).join('');

    const barExtra = chartTag === 'barChart' ? '<c:barDir val="col"/><c:grouping val="clustered"/>' : '';
    const lineAreaExtra = chartTag === 'lineChart' || chartTag === 'areaChart' ? '<c:grouping val="standard"/>' : '';
    const axesDecl =
        chartTag === 'pieChart'
            ? ''
            : '<c:axId val="1001"/><c:axId val="1002"/>';
    const axesXml =
        chartTag === 'pieChart'
            ? ''
            : '<c:catAx><c:axId val="1001"/><c:scaling><c:orientation val="minMax"/></c:scaling><c:delete val="0"/><c:axPos val="b"/><c:crossAx val="1002"/></c:catAx>' +
              '<c:valAx><c:axId val="1002"/><c:scaling><c:orientation val="minMax"/></c:scaling><c:delete val="0"/><c:axPos val="l"/><c:crossAx val="1001"/></c:valAx>';

    return [
        '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>',
        '<c:chartSpace xmlns:c="http://schemas.openxmlformats.org/drawingml/2006/chart" xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">',
        '<c:lang val="en-US"/>',
        '<c:chart>',
        `<c:title><c:tx><c:rich><a:bodyPr/><a:lstStyle/><a:p><a:r><a:t>${escapePptxXml(chart.Title)}</a:t></a:r></a:p></c:rich></c:tx><c:overlay val="0"/></c:title>`,
        '<c:plotArea>',
        '<c:layout/>',
        `<c:${chartTag}>${barExtra}${lineAreaExtra}${seriesXml}${axesDecl}</c:${chartTag}>`,
        axesXml,
        '</c:plotArea>',
        '<c:legend><c:legendPos val="b"/><c:overlay val="0"/></c:legend>',
        '</c:chart>',
        '</c:chartSpace>'
    ].join('');
}

function buildChartGraphicFrameXml(params: {
    shapeId: number;
    name: string;
    relId: string;
    x: number;
    y: number;
    cx: number;
    cy: number;
}): string {
    return [
        '<p:graphicFrame>',
        '<p:nvGraphicFramePr>',
        `<p:cNvPr id="${params.shapeId}" name="${escapePptxXml(params.name)}"/>`,
        '<p:cNvGraphicFramePr><a:graphicFrameLocks noGrp="1"/></p:cNvGraphicFramePr>',
        '<p:nvPr/>',
        '</p:nvGraphicFramePr>',
        `<p:xfrm><a:off x="${Math.round(params.x)}" y="${Math.round(params.y)}"/><a:ext cx="${Math.round(params.cx)}" cy="${Math.round(params.cy)}"/></p:xfrm>`,
        '<a:graphic><a:graphicData uri="http://schemas.openxmlformats.org/drawingml/2006/chart">',
        `<c:chart xmlns:c="http://schemas.openxmlformats.org/drawingml/2006/chart" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships" r:id="${escapePptxXml(params.relId)}"/>`,
        '</a:graphicData></a:graphic>',
        '</p:graphicFrame>'
    ].join('');
}

function buildTheme1Xml(theme: SlideDeckThemeSpec): string {
    const primary = toDrawingHexColor(theme.PrimaryColor, '4F46E5');
    const accent = toDrawingHexColor(theme.AccentColor, '0EA5E9');
    const bg = toDrawingHexColor(theme.BackgroundColor, 'FFFFFF');
    const surface = toDrawingHexColor(theme.SurfaceColor, 'F8FAFC');
    const text = toDrawingHexColor(theme.TextColor, '0F172A');
    const muted = toDrawingHexColor(theme.MutedTextColor, '475569');
    const headingFont = primaryFontName(theme.HeadingFont, 'Calibri');
    const bodyFont = primaryFontName(theme.BodyFont, 'Calibri');

    return [
        '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>',
        `<a:theme xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" name="${escapePptxXml(theme.Name || 'MJTheme')}">`,
        '<a:themeElements>',
        `<a:clrScheme name="${escapePptxXml(theme.ThemeID || 'MJColors')}">`,
        `<a:dk1><a:srgbClr val="${text}"/></a:dk1>`,
        `<a:lt1><a:srgbClr val="${bg}"/></a:lt1>`,
        `<a:dk2><a:srgbClr val="${muted}"/></a:dk2>`,
        `<a:lt2><a:srgbClr val="${surface}"/></a:lt2>`,
        `<a:accent1><a:srgbClr val="${primary}"/></a:accent1>`,
        `<a:accent2><a:srgbClr val="${accent}"/></a:accent2>`,
        '<a:accent3><a:srgbClr val="10B981"/></a:accent3>',
        '<a:accent4><a:srgbClr val="F59E0B"/></a:accent4>',
        '<a:accent5><a:srgbClr val="8B5CF6"/></a:accent5>',
        '<a:accent6><a:srgbClr val="EC4899"/></a:accent6>',
        `<a:hlink><a:srgbClr val="${accent}"/></a:hlink>`,
        `<a:folHlink><a:srgbClr val="${primary}"/></a:folHlink>`,
        '</a:clrScheme>',
        '<a:fontScheme name="MJFonts">',
        `<a:majorFont><a:latin typeface="${escapePptxXml(headingFont)}"/><a:ea typeface=""/><a:cs typeface=""/></a:majorFont>`,
        `<a:minorFont><a:latin typeface="${escapePptxXml(bodyFont)}"/><a:ea typeface=""/><a:cs typeface=""/></a:minorFont>`,
        '</a:fontScheme>',
        // ECMA-376 requires exactly 3 items in each fmtScheme list (fill, ln, effect, bgFill)
        '<a:fmtScheme name="MJFormat">',
        '<a:fillStyleLst>',
        '<a:solidFill><a:schemeClr val="phClr"/></a:solidFill>',
        '<a:gradFill rotWithShape="1"><a:gsLst><a:gs pos="0"><a:schemeClr val="phClr"><a:tint val="50000"/></a:schemeClr></a:gs><a:gs pos="100000"><a:schemeClr val="phClr"><a:shade val="50000"/></a:schemeClr></a:gs></a:gsLst><a:lin ang="5400000" scaled="0"/></a:gradFill>',
        '<a:gradFill rotWithShape="1"><a:gsLst><a:gs pos="0"><a:schemeClr val="phClr"><a:tint val="80000"/></a:schemeClr></a:gs><a:gs pos="100000"><a:schemeClr val="phClr"><a:shade val="30000"/></a:schemeClr></a:gs></a:gsLst><a:lin ang="5400000" scaled="0"/></a:gradFill>',
        '</a:fillStyleLst>',
        '<a:lnStyleLst>',
        '<a:ln w="9525" cap="flat" cmpd="sng" algn="ctr"><a:solidFill><a:schemeClr val="phClr"/></a:solidFill></a:ln>',
        '<a:ln w="25400" cap="flat" cmpd="sng" algn="ctr"><a:solidFill><a:schemeClr val="phClr"/></a:solidFill></a:ln>',
        '<a:ln w="38100" cap="flat" cmpd="sng" algn="ctr"><a:solidFill><a:schemeClr val="phClr"/></a:solidFill></a:ln>',
        '</a:lnStyleLst>',
        '<a:effectStyleLst>',
        '<a:effectStyle><a:effectLst/></a:effectStyle>',
        '<a:effectStyle><a:effectLst/></a:effectStyle>',
        '<a:effectStyle><a:effectLst/></a:effectStyle>',
        '</a:effectStyleLst>',
        '<a:bgFillStyleLst>',
        '<a:solidFill><a:schemeClr val="phClr"/></a:solidFill>',
        '<a:solidFill><a:schemeClr val="phClr"><a:tint val="95000"/></a:schemeClr></a:solidFill>',
        '<a:gradFill rotWithShape="1"><a:gsLst><a:gs pos="0"><a:schemeClr val="phClr"><a:tint val="40000"/></a:schemeClr></a:gs><a:gs pos="100000"><a:schemeClr val="phClr"><a:shade val="60000"/></a:schemeClr></a:gs></a:gsLst><a:lin ang="5400000" scaled="0"/></a:gradFill>',
        '</a:bgFillStyleLst>',
        '</a:fmtScheme>',
        '</a:themeElements>',
        '</a:theme>'
    ].join('');
}

/**
 * Exports a {@link SlideDeckSpec} headlessly to valid ECMA-376 `.pptx` archive bytes (`NW-4`).
 */
export function ExportDeckToPptxBytesInternal(
    deck: SlideDeckSpec,
    options?: SlideDeckPptxExportOptions
): Uint8Array {
    const encoder = new TextEncoder();
    const isFourByThree = deck.AspectRatio === '4:3';
    const slideW = isFourByThree ? SLIDE_W_4_3 : SLIDE_W_16_9;
    const slideH = SLIDE_H_STD;
    const sldSzType = isFourByThree ? 'screen4x3' : 'screen16x9';

    const includeHidden = options?.IncludeHiddenSlides === true;
    const slidesToExport = (deck.Slides ?? []).filter((s) => includeHidden || !s.Hidden);

    const primaryHex = toDrawingHexColor(deck.Theme?.PrimaryColor, '4F46E5');
    const accentHex = toDrawingHexColor(deck.Theme?.AccentColor, '0EA5E9');
    const bgHex = toDrawingHexColor(deck.Theme?.BackgroundColor, 'FFFFFF');
    const surfaceHex = toDrawingHexColor(deck.Theme?.SurfaceColor, 'F8FAFC');
    const textHex = toDrawingHexColor(deck.Theme?.TextColor, '0F172A');
    const mutedHex = toDrawingHexColor(deck.Theme?.MutedTextColor, '475569');
    const headingFont = primaryFontName(deck.Theme?.HeadingFont, 'Calibri');
    const bodyFont = primaryFontName(deck.Theme?.BodyFont, 'Calibri');

    const entries: Array<{ Name: string; Data: Uint8Array }> = [];
    const chartPartNames: string[] = [];
    const notesPartNames: string[] = [];
    let chartCounter = 0;

    const addXmlEntry = (name: string, xml: string): void => {
        entries.push({ Name: name, Data: encoder.encode(xml) });
    };

    // Core structural parts
    addXmlEntry('ppt/theme/theme1.xml', buildTheme1Xml(deck.Theme));

    addXmlEntry(
        'ppt/slideLayouts/slideLayout1.xml',
        [
            '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>',
            '<p:sldLayout xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships" xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main" type="blank" preserve="1">',
            '<p:cSld name="Blank"><p:spTree><p:nvGrpSpPr><p:cNvPr id="1" name=""/><p:cNvGrpSpPr/><p:nvPr/></p:nvGrpSpPr><p:grpSpPr><a:xfrm><a:off x="0" y="0"/><a:ext cx="0" cy="0"/><a:chOff x="0" y="0"/><a:chExt cx="0" cy="0"/></a:xfrm></p:grpSpPr></p:spTree></p:cSld>',
            '<p:clrMapOvr><a:masterClrMapping/></p:clrMapOvr>',
            '</p:sldLayout>'
        ].join('')
    );
    addXmlEntry(
        'ppt/slideLayouts/_rels/slideLayout1.xml.rels',
        [
            '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>',
            '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">',
            `<Relationship Id="rId1" Type="${REL_TYPE_SLIDE_MASTER}" Target="../slideMasters/slideMaster1.xml"/>`,
            '</Relationships>'
        ].join('')
    );

    addXmlEntry(
        'ppt/slideMasters/slideMaster1.xml',
        [
            '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>',
            '<p:sldMaster xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships" xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main">',
            '<p:cSld><p:spTree><p:nvGrpSpPr><p:cNvPr id="1" name=""/><p:cNvGrpSpPr/><p:nvPr/></p:nvGrpSpPr><p:grpSpPr><a:xfrm><a:off x="0" y="0"/><a:ext cx="0" cy="0"/><a:chOff x="0" y="0"/><a:chExt cx="0" cy="0"/></a:xfrm></p:grpSpPr></p:spTree></p:cSld>',
            '<p:clrMap bg1="lt1" tx1="dk1" bg2="lt2" tx2="dk2" accent1="accent1" accent2="accent2" accent3="accent3" accent4="accent4" accent5="accent5" accent6="accent6" hlink="hlink" folHlink="folHlink"/>',
            '<p:sldLayoutIdLst><p:sldLayoutId id="2147483649" r:id="rId1"/></p:sldLayoutIdLst>',
            '</p:sldMaster>'
        ].join('')
    );
    addXmlEntry(
        'ppt/slideMasters/_rels/slideMaster1.xml.rels',
        [
            '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>',
            '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">',
            `<Relationship Id="rId1" Type="${REL_TYPE_SLIDE_LAYOUT}" Target="../slideLayouts/slideLayout1.xml"/>`,
            `<Relationship Id="rId2" Type="${REL_TYPE_THEME}" Target="../theme/theme1.xml"/>`,
            '</Relationships>'
        ].join('')
    );

    // Emit each slide
    const marginX = 548640; // 0.6 in
    const contentW = slideW - marginX * 2;

    slidesToExport.forEach((slide, slideIdx) => {
        const slideOrd = slideIdx + 1;
        const slideRels: Array<{ Id: string; Type: string; Target: string }> = [
            { Id: 'rId1', Type: REL_TYPE_SLIDE_LAYOUT, Target: '../slideLayouts/slideLayout1.xml' }
        ];
        let nextRelIdx = 2;
        let nextShapeId = 2;
        const shapeXmlParts: string[] = [];

        // Title & Subtitle shapes
        shapeXmlParts.push(
            buildTextShapeXml({
                shapeId: nextShapeId++,
                name: 'Title',
                x: marginX,
                y: 365760,
                cx: contentW,
                cy: 640080,
                text: slide.Title || `Slide ${slideOrd}`,
                fontSizePt: slide.Layout === 'Title' || slide.Layout === 'SectionHeader' ? 32 : 24,
                bold: true,
                colorHex: primaryHex,
                fontFace: headingFont,
                placeholderType: 'title',
                align: slide.Layout === 'Title' || slide.Layout === 'SectionHeader' ? 'ctr' : 'l'
            })
        );

        let cursorY = 1097280;
        if (slide.Subtitle) {
            shapeXmlParts.push(
                buildTextShapeXml({
                    shapeId: nextShapeId++,
                    name: 'Subtitle',
                    x: marginX,
                    y: cursorY,
                    cx: contentW,
                    cy: 411480,
                    text: slide.Subtitle,
                    fontSizePt: 15,
                    colorHex: mutedHex,
                    fontFace: bodyFont,
                    placeholderType: 'subTitle',
                    align: slide.Layout === 'Title' || slide.Layout === 'SectionHeader' ? 'ctr' : 'l'
                })
            );
            cursorY += 480000;
        }

        // Regions layout calculation
        const regions = slide.Regions ?? [];
        const regionCount = Math.max(1, regions.length);
        const availH = Math.max(1828800, slideH - cursorY - 640080);

        regions.forEach((region, rIdx) => {
            const { x: rx, y: ry, cx: rcx, cy: rcy } = computePptxRegionBounds(
                slide.Layout,
                rIdx,
                regionCount,
                marginX,
                cursorY,
                contentW,
                availH
            );

            const parsedDirectiveBlock = !region.BlockSpec && region.MarkdownContent
                ? DocumentLiveBlockEngine.Instance.ParseMarkdownDirectives(region.MarkdownContent).find(
                      (seg) => seg.Type === 'mj-block'
                  )?.BlockSpec
                : undefined;
            const block = region.BlockSpec ?? parsedDirectiveBlock;

            if (region.Kind === 'mj-block' || block) {
                const verifiedIds = options?.VerifiedBlockIds;
                const isPreVerified = Boolean(
                    block?.FrozenSnapshot &&
                        verifiedIds &&
                        ((block.BlockID && verifiedIds.has(block.BlockID)) ||
                            (region.RegionID && verifiedIds.has(region.RegionID)) ||
                            (slide.SlideID && region.RegionID && verifiedIds.has(`${slide.SlideID}:${region.RegionID}`)))
                );
                const snapValidation = block?.FrozenSnapshot
                    ? isPreVerified
                        ? { Valid: true, SnapshotVerified: true }
                        : ValidateFrozenBlockSnapshot(block.FrozenSnapshot, undefined, BuildBlockIdentityBinding(block))
                    : { Valid: false, SnapshotVerified: false, ErrorMessage: 'FrozenSnapshot missing.' };
                const canRenderFrozenData = Boolean(block && snapValidation.Valid);
                const chartData = block && canRenderFrozenData ? tryExtractChartDataFromSnapshot(block, region.Label) : null;
                if (chartData) {
                    chartCounter++;
                    const chartFileName = `ppt/charts/chart${chartCounter}.xml`;
                    const relId = `rId${nextRelIdx++}`;
                    slideRels.push({
                        Id: relId,
                        Type: REL_TYPE_CHART,
                        Target: `../charts/chart${chartCounter}.xml`
                    });
                    chartPartNames.push(chartFileName);
                    addXmlEntry(
                        chartFileName,
                        buildDrawingMlChartXml(chartData, [primaryHex, accentHex, '10B981', 'F59E0B', '8B5CF6'])
                    );
                    shapeXmlParts.push(
                        buildChartGraphicFrameXml({
                            shapeId: nextShapeId++,
                            name: region.Label || chartData.Title,
                            relId,
                            x: rx,
                            y: ry,
                            cx: rcx,
                            cy: rcy
                        })
                    );
                    return;
                }
                const snap = canRenderFrozenData ? block?.FrozenSnapshot : undefined;
                if (snap && Array.isArray(snap.Columns) && snap.Columns.length > 0 && Array.isArray(snap.Rows)) {
                    const headers = snap.Columns.map((c) => c.DisplayName || c.Name);
                    const tableRows = snap.Rows.map((row) =>
                        snap.Columns.map((col) => {
                            const v = row[col.Name];
                            return v === null || v === undefined ? '' : String(v);
                        })
                    );
                    shapeXmlParts.push(
                        buildTableGraphicFrameXml({
                            shapeId: nextShapeId++,
                            name: region.Label || block?.Title || 'Block Table',
                            x: rx,
                            y: ry,
                            cx: rcx,
                            cy: rcy,
                            headers,
                            rows: tableRows,
                            primaryHex,
                            surfaceHex,
                            textHex,
                            fontFace: bodyFont
                        })
                    );
                    return;
                }
                const fallbackBlockText = block
                    ? block.FrozenSnapshot && !snapValidation.Valid
                        ? `${block.Title || region.Label}\n[${block.Kind} • Frozen snapshot unverified]`
                        : `${block.Title || region.Label}\n[${block.Kind} • ${block.Mode}]`
                    : region.MarkdownContent || region.Label;
                shapeXmlParts.push(
                    buildTextShapeXml({
                        shapeId: nextShapeId++,
                        name: region.Label || region.RegionID,
                        x: rx,
                        y: ry,
                        cx: rcx,
                        cy: rcy,
                        text: fallbackBlockText,
                        fontSizePt: 14,
                        colorHex: textHex,
                        fontFace: bodyFont,
                        fillHex: surfaceHex,
                        borderHex: accentHex
                    })
                );
                return;
            }

            if (region.Kind === 'big-number') {
                const lines: string[] = [];
                if (region.BigNumberValue) lines.push(region.BigNumberValue);
                if (region.BigNumberLabel) lines.push(region.BigNumberLabel);
                if (region.BigNumberDelta) lines.push(region.BigNumberDelta);
                if (lines.length === 0 && region.MarkdownContent) lines.push(region.MarkdownContent);
                shapeXmlParts.push(
                    buildTextShapeXml({
                        shapeId: nextShapeId++,
                        name: region.Label || region.RegionID,
                        x: rx,
                        y: ry,
                        cx: rcx,
                        cy: rcy,
                        text: lines.join('\n'),
                        fontSizePt: 26,
                        bold: true,
                        colorHex: primaryHex,
                        fontFace: headingFont,
                        fillHex: surfaceHex,
                        align: 'ctr'
                    })
                );
                return;
            }

            if (region.Kind === 'quote') {
                const quoteLines = [region.MarkdownContent || region.Label];
                if (region.QuoteAttribution) quoteLines.push(`— ${region.QuoteAttribution}`);
                shapeXmlParts.push(
                    buildTextShapeXml({
                        shapeId: nextShapeId++,
                        name: region.Label || region.RegionID,
                        x: rx,
                        y: ry,
                        cx: rcx,
                        cy: rcy,
                        text: quoteLines.join('\n'),
                        fontSizePt: 18,
                        italic: true,
                        colorHex: textHex,
                        fontFace: headingFont,
                        fillHex: surfaceHex
                    })
                );
                return;
            }

            if (region.Kind === 'image') {
                const safeImg = options?.SanitizeImageUrl ? options.SanitizeImageUrl(region.ImageUrl) : region.ImageUrl;
                const imgText = [region.ImageAlt || region.Label || 'Image', safeImg ? `Source: ${safeImg}` : '']
                    .filter(Boolean)
                    .join('\n');
                shapeXmlParts.push(
                    buildTextShapeXml({
                        shapeId: nextShapeId++,
                        name: region.Label || region.RegionID,
                        x: rx,
                        y: ry,
                        cx: rcx,
                        cy: rcy,
                        text: imgText,
                        fontSizePt: 13,
                        colorHex: mutedHex,
                        fontFace: bodyFont,
                        fillHex: surfaceHex
                    })
                );
                return;
            }

            const mdTable = parseMarkdownTableRows(region.MarkdownContent);
            if (mdTable && mdTable.length >= 2) {
                shapeXmlParts.push(
                    buildTableGraphicFrameXml({
                        shapeId: nextShapeId++,
                        name: region.Label || region.RegionID,
                        x: rx,
                        y: ry,
                        cx: rcx,
                        cy: rcy,
                        headers: mdTable[0],
                        rows: mdTable.slice(1),
                        primaryHex,
                        surfaceHex,
                        textHex,
                        fontFace: bodyFont
                    })
                );
                return;
            }

            shapeXmlParts.push(
                buildTextShapeXml({
                    shapeId: nextShapeId++,
                    name: region.Label || region.RegionID,
                    x: rx,
                    y: ry,
                    cx: rcx,
                    cy: rcy,
                    text: region.MarkdownContent || '',
                    fontSizePt: 14,
                    colorHex: textHex,
                    fontFace: bodyFont,
                    placeholderType: 'body',
                    bullet: true,
                    fillHex: region.Kind === 'callout' ? surfaceHex : undefined,
                    borderHex: region.Kind === 'callout' ? accentHex : undefined
                })
            );
        });

        // Footer caption if configured
        const footerBits: string[] = [];
        if (deck.Master?.FooterText) footerBits.push(deck.Master.FooterText);
        if (deck.Master?.ShowSlideNumbers) footerBits.push(`${slideOrd} / ${slidesToExport.length}`);
        if (footerBits.length > 0) {
            shapeXmlParts.push(
                buildTextShapeXml({
                    shapeId: nextShapeId++,
                    name: 'Footer',
                    x: marginX,
                    y: slideH - 457200,
                    cx: contentW,
                    cy: 320040,
                    text: footerBits.join('   •   '),
                    fontSizePt: 10,
                    colorHex: mutedHex,
                    fontFace: bodyFont,
                    align: 'r'
                })
            );
        }

        // Speaker notes part if non-empty
        if (slide.SpeakerNotes && slide.SpeakerNotes.trim().length > 0) {
            const notesPath = `ppt/notesSlides/notesSlide${slideOrd}.xml`;
            const notesRelId = `rId${nextRelIdx++}`;
            slideRels.push({
                Id: notesRelId,
                Type: REL_TYPE_NOTES_SLIDE,
                Target: `../notesSlides/notesSlide${slideOrd}.xml`
            });
            notesPartNames.push(notesPath);
            addXmlEntry(
                notesPath,
                [
                    '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>',
                    '<p:notes xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships" xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main">',
                    '<p:cSld><p:spTree><p:nvGrpSpPr><p:cNvPr id="1" name=""/><p:cNvGrpSpPr/><p:nvPr/></p:nvGrpSpPr><p:grpSpPr><a:xfrm><a:off x="0" y="0"/><a:ext cx="0" cy="0"/><a:chOff x="0" y="0"/><a:chExt cx="0" cy="0"/></a:xfrm></p:grpSpPr>',
                    buildTextShapeXml({
                        shapeId: 2,
                        name: 'Notes',
                        x: 685800,
                        y: 4343400,
                        cx: 5486400,
                        cy: 4114800,
                        text: slide.SpeakerNotes,
                        fontSizePt: 12,
                        colorHex: '000000',
                        fontFace: bodyFont,
                        placeholderType: 'body'
                    }),
                    '</p:spTree></p:cSld>',
                    '</p:notes>'
                ].join('')
            );
            addXmlEntry(
                `ppt/notesSlides/_rels/notesSlide${slideOrd}.xml.rels`,
                [
                    '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>',
                    '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">',
                    `<Relationship Id="rId1" Type="${REL_TYPE_SLIDE}" Target="../slides/slide${slideOrd}.xml"/>`,
                    '</Relationships>'
                ].join('')
            );
        }

        const showAttr = slide.Hidden ? ' show="0"' : '';
        const secondaryBgHex = toDrawingHexColor(deck.Theme?.SecondaryGradientColor, bgHex);
        const bgFillXml =
            deck.Theme?.BackgroundStyle === 'gradient' || deck.Theme?.BackgroundStyle === 'mesh'
                ? `<p:bg><p:bgPr><a:gradFill rotWithShape="1"><a:gsLst><a:gs pos="0"><a:srgbClr val="${bgHex}"/></a:gs><a:gs pos="100000"><a:srgbClr val="${secondaryBgHex}"/></a:gs></a:gsLst><a:lin ang="2700000" scaled="1"/></a:gradFill><a:effectLst/></p:bgPr></p:bg>`
                : `<p:bg><p:bgPr><a:solidFill><a:srgbClr val="${bgHex}"/></a:solidFill><a:effectLst/></p:bgPr></p:bg>`;
        const slideXml = [
            '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>',
            `<p:sld xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships" xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main"${showAttr}>`,
            '<p:cSld>',
            bgFillXml,
            '<p:spTree>',
            '<p:nvGrpSpPr><p:cNvPr id="1" name=""/><p:cNvGrpSpPr/><p:nvPr/></p:nvGrpSpPr>',
            '<p:grpSpPr><a:xfrm><a:off x="0" y="0"/><a:ext cx="0" cy="0"/><a:chOff x="0" y="0"/><a:chExt cx="0" cy="0"/></a:xfrm></p:grpSpPr>',
            shapeXmlParts.join(''),
            '</p:spTree>',
            '</p:cSld>',
            '<p:clrMapOvr><a:masterClrMapping/></p:clrMapOvr>',
            '</p:sld>'
        ].join('');

        addXmlEntry(`ppt/slides/slide${slideOrd}.xml`, slideXml);
        addXmlEntry(
            `ppt/slides/_rels/slide${slideOrd}.xml.rels`,
            [
                '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>',
                '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">',
                ...slideRels.map(
                    (rel) =>
                        `<Relationship Id="${escapePptxXml(rel.Id)}" Type="${escapePptxXml(rel.Type)}" Target="${escapePptxXml(rel.Target)}"/>`
                ),
                '</Relationships>'
            ].join('')
        );
    });

    // ppt/presentation.xml + rels
    const sldIdListXml = slidesToExport
        .map((_s, idx) => `<p:sldId id="${256 + idx}" r:id="rId${idx + 3}"/>`)
        .join('');
    addXmlEntry(
        'ppt/presentation.xml',
        [
            '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>',
            '<p:presentation xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships" xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main" saveSubsetFonts="1">',
            '<p:sldMasterIdLst><p:sldMasterId id="2147483648" r:id="rId1"/></p:sldMasterIdLst>',
            `<p:sldIdLst>${sldIdListXml}</p:sldIdLst>`,
            `<p:sldSz cx="${slideW}" cy="${slideH}" type="${sldSzType}"/>`,
            '<p:notesSz cx="6858000" cy="9144000"/>',
            '</p:presentation>'
        ].join('')
    );
    addXmlEntry(
        'ppt/_rels/presentation.xml.rels',
        [
            '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>',
            '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">',
            `<Relationship Id="rId1" Type="${REL_TYPE_SLIDE_MASTER}" Target="slideMasters/slideMaster1.xml"/>`,
            `<Relationship Id="rId2" Type="${REL_TYPE_THEME}" Target="theme/theme1.xml"/>`,
            ...slidesToExport.map(
                (_s, idx) => `<Relationship Id="rId${idx + 3}" Type="${REL_TYPE_SLIDE}" Target="slides/slide${idx + 1}.xml"/>`
            ),
            '</Relationships>'
        ].join('')
    );

    // Metadata properties (core, app, custom)
    const customMeta: CustomPptxMeta = {
        DeckID: deck.DeckID,
        Subtitle: deck.Subtitle,
        Master: deck.Master,
        Theme: {
            ThemeID: deck.Theme?.ThemeID,
            Name: deck.Theme?.Name
        },
        Slides: slidesToExport.map((s) => ({
            SlideID: s.SlideID,
            Layout: s.Layout,
            Transition: s.Transition,
            Hidden: Boolean(s.Hidden)
        }))
    };

    addXmlEntry(
        'docProps/core.xml',
        [
            '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>',
            '<cp:coreProperties xmlns:cp="http://schemas.openxmlformats.org/package/2006/metadata/core-properties" xmlns:dc="http://purl.org/dc/elements/1.1/" xmlns:dcterms="http://purl.org/dc/terms/" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance">',
            `<dc:title>${escapePptxXml(deck.Title || 'Presentation')}</dc:title>`,
            `<dc:creator>${escapePptxXml(deck.Master?.OrganizationName || 'MemberJunction')}</dc:creator>`,
            '</cp:coreProperties>'
        ].join('')
    );
    addXmlEntry(
        'docProps/app.xml',
        [
            '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>',
            '<Properties xmlns="http://schemas.openxmlformats.org/officeDocument/2006/extended-properties">',
            '<Application>MemberJunction SlideDeckEngine</Application>',
            `<Slides>${slidesToExport.length}</Slides>`,
            '</Properties>'
        ].join('')
    );
    addXmlEntry(
        'docProps/custom.xml',
        [
            '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>',
            '<Properties xmlns="http://schemas.openxmlformats.org/officeDocument/2006/custom-properties" xmlns:vt="http://schemas.openxmlformats.org/officeDocument/2006/docPropsVTypes">',
            '<property fmtid="{D5CDD505-2E9C-101B-9397-08002B2CF9AE}" pid="2" name="MJSlideDeckMeta">',
            `<vt:lpwstr>${escapePptxXml(JSON.stringify(customMeta))}</vt:lpwstr>`,
            '</property>',
            '</Properties>'
        ].join('')
    );

    addXmlEntry(
        '_rels/.rels',
        [
            '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>',
            '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">',
            `<Relationship Id="rId1" Type="${REL_TYPE_OFFICE_DOC}" Target="ppt/presentation.xml"/>`,
            `<Relationship Id="rId2" Type="${REL_TYPE_CORE_PROPS}" Target="docProps/core.xml"/>`,
            `<Relationship Id="rId3" Type="${REL_TYPE_EXT_PROPS}" Target="docProps/app.xml"/>`,
            `<Relationship Id="rId4" Type="${REL_TYPE_CUSTOM_PROPS}" Target="docProps/custom.xml"/>`,
            '</Relationships>'
        ].join('')
    );

    const overrides: string[] = [
        '<Override PartName="/ppt/presentation.xml" ContentType="application/vnd.openxmlformats-officedocument.presentationml.presentation.main+xml"/>',
        '<Override PartName="/ppt/slideMasters/slideMaster1.xml" ContentType="application/vnd.openxmlformats-officedocument.presentationml.slideMaster+xml"/>',
        '<Override PartName="/ppt/slideLayouts/slideLayout1.xml" ContentType="application/vnd.openxmlformats-officedocument.presentationml.slideLayout+xml"/>',
        '<Override PartName="/ppt/theme/theme1.xml" ContentType="application/vnd.openxmlformats-officedocument.theme+xml"/>',
        '<Override PartName="/docProps/core.xml" ContentType="application/vnd.openxmlformats-package.core-properties+xml"/>',
        '<Override PartName="/docProps/app.xml" ContentType="application/vnd.openxmlformats-officedocument.extended-properties+xml"/>',
        '<Override PartName="/docProps/custom.xml" ContentType="application/vnd.openxmlformats-officedocument.custom-properties+xml"/>'
    ];
    slidesToExport.forEach((_s, idx) => {
        overrides.push(
            `<Override PartName="/ppt/slides/slide${idx + 1}.xml" ContentType="application/vnd.openxmlformats-officedocument.presentationml.slide+xml"/>`
        );
    });
    for (const notesPart of notesPartNames) {
        overrides.push(
            `<Override PartName="/${notesPart}" ContentType="application/vnd.openxmlformats-officedocument.presentationml.notesSlide+xml"/>`
        );
    }
    for (const chartPart of chartPartNames) {
        overrides.push(
            `<Override PartName="/${chartPart}" ContentType="application/vnd.openxmlformats-officedocument.drawingml.chart+xml"/>`
        );
    }

    addXmlEntry(
        '[Content_Types].xml',
        [
            '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>',
            '<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">',
            '<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>',
            '<Default Extension="xml" ContentType="application/xml"/>',
            ...overrides,
            '</Types>'
        ].join('')
    );

    return SpreadsheetEngine.Instance.BuildZipArchive(entries);
}

function extractParagraphsFromXmlBlock(xmlFragment: string): string {
    const paragraphs: string[] = [];
    const pRe = /<a:p\b[^>]*>([\s\S]*?)<\/a:p>/gi;
    let pm: RegExpExecArray | null;
    while ((pm = pRe.exec(xmlFragment)) !== null) {
        const pInner = pm[1];
        const hasBullet = /<a:buChar\b/i.test(pInner);
        const textChunks: string[] = [];
        const tRe = /<a:t\b[^>]*>([\s\S]*?)<\/a:t>/gi;
        let tm: RegExpExecArray | null;
        while ((tm = tRe.exec(pInner)) !== null) {
            textChunks.push(unescapePptxXml(tm[1]));
        }
        const joined = textChunks.join('');
        paragraphs.push(hasBullet && joined.trim() ? `- ${joined}` : joined);
    }
    return paragraphs.join('\n').trim();
}

function parseChartXmlToRegion(chartXml: string, regionId: string): SlideRegionSpec {
    const titleMatch = /<c:title\b[\s\S]*?<a:t\b[^>]*>([\s\S]*?)<\/a:t>/i.exec(chartXml);
    const title = titleMatch ? unescapePptxXml(titleMatch[1]) : 'Imported Chart';
    const chartType: 'bar' | 'line' | 'pie' | 'area' = /<c:lineChart\b/i.test(chartXml)
        ? 'line'
        : /<c:pieChart\b/i.test(chartXml)
          ? 'pie'
          : /<c:areaChart\b/i.test(chartXml)
            ? 'area'
            : 'bar';

    const categories: string[] = [];
    const seriesList: Array<{ name: string; values: number[] }> = [];
    const serRe = /<c:ser\b[^>]*>([\s\S]*?)<\/c:ser>/gi;
    let sm: RegExpExecArray | null;
    while ((sm = serRe.exec(chartXml)) !== null) {
        const serBody = sm[1];
        const nameMatch = /<c:tx\b[\s\S]*?<c:v\b[^>]*>([\s\S]*?)<\/c:v>/i.exec(serBody);
        const serName = nameMatch ? unescapePptxXml(nameMatch[1]) : `Series ${seriesList.length + 1}`;
        if (categories.length === 0) {
            const catBlock = /<c:cat\b[^>]*>([\s\S]*?)<\/c:cat>/i.exec(serBody)?.[1] ?? '';
            const ptRe = /<c:v\b[^>]*>([\s\S]*?)<\/c:v>/gi;
            let pm: RegExpExecArray | null;
            while ((pm = ptRe.exec(catBlock)) !== null) {
                categories.push(unescapePptxXml(pm[1]));
            }
        }
        const valBlock = /<c:val\b[^>]*>([\s\S]*?)<\/c:val>/i.exec(serBody)?.[1] ?? '';
        const vals: number[] = [];
        const ptRe = /<c:v\b[^>]*>([\s\S]*?)<\/c:v>/gi;
        let vm: RegExpExecArray | null;
        while ((vm = ptRe.exec(valBlock)) !== null) {
            const parsed = Number(unescapePptxXml(vm[1]));
            vals.push(Number.isFinite(parsed) ? parsed : 0);
        }
        seriesList.push({ name: serName, values: vals });
    }

    const columns: DocumentBlockColumn[] = [
        { Name: 'Category', DisplayName: 'Category', Type: 'nvarchar' },
        ...seriesList.map((s) => ({ Name: s.name, DisplayName: s.name, Type: 'decimal' }))
    ];
    const rowCount = Math.max(categories.length, seriesList[0]?.values.length ?? 0);
    const rows: Array<Record<string, string | number | boolean | null>> = [];
    for (let r = 0; r < rowCount; r++) {
        const row: Record<string, string | number | boolean | null> = {};
        Object.defineProperty(row, 'Category', {
            value: categories[r] ?? `Item ${r + 1}`,
            writable: true,
            enumerable: true,
            configurable: true
        });
        for (const s of seriesList) {
            const safeKey =
                s.name === '__proto__' || s.name === 'constructor' || s.name === 'prototype'
                    ? `Series_${s.name}`
                    : s.name;
            Object.defineProperty(row, safeKey, {
                value: s.values[r] ?? 0,
                writable: true,
                enumerable: true,
                configurable: true
            });
        }
        rows.push(row);
    }

    // Never forge HMAC-signed FrozenSnapshot blocks from untrusted PPTX chart XML (`S3`);
    // always materialize imported chart data as static rich-text markdown.
    const headerLine = `| ${columns.map((c) => c.DisplayName).join(' | ')} |`;
    const sepLine = `| ${columns.map(() => '---').join(' | ')} |`;
    const dataLines = rows.map(
        (r) => `| ${columns.map((c) => String(r[c.Name] ?? '')).join(' | ')} |`
    );
    return {
        RegionID: regionId,
        Label: title,
        Kind: 'rich-text',
        MarkdownContent: [`### ${title}`, '', headerLine, sepLine, ...dataLines].join('\n')
    };
}

/**
 * Imports a `.pptx` archive (`Uint8Array`) headlessly into a normalized {@link SlideDeckSpec} (`NW-4`).
 */
export function ImportDeckFromPptxBytesInternal(
    pptxBytes: Uint8Array,
    fallbackTitle = 'Imported Presentation'
): SlideDeckSpec {
    const decoder = new TextDecoder();
    const files = SpreadsheetEngine.Instance.ExtractZipArchive(pptxBytes);

    const readText = (path: string): string | null => {
        const bytes = files.get(path);
        return bytes ? decoder.decode(bytes) : null;
    };

    // Parse optional MJ custom metadata
    let customMeta: CustomPptxMeta = {};
    const customXml = readText('docProps/custom.xml');
    if (customXml) {
        const metaMatch = /name="MJSlideDeckMeta"[\s\S]*?<vt:lpwstr>([\s\S]*?)<\/vt:lpwstr>/i.exec(customXml);
        if (metaMatch) {
            try {
                const parsed = JSON.parse(unescapePptxXml(metaMatch[1])) as CustomPptxMeta;
                if (parsed && typeof parsed === 'object') {
                    customMeta = parsed;
                }
            } catch {
                customMeta = {};
            }
        }
    }

    // Parse core title
    const coreXml = readText('docProps/core.xml') ?? '';
    const coreTitleMatch = /<dc:title[^>]*>([\s\S]*?)<\/dc:title>/i.exec(coreXml);
    const title = coreTitleMatch ? unescapePptxXml(coreTitleMatch[1]).trim() || fallbackTitle : fallbackTitle;

    // Parse presentation.xml (size + ordered slide rel IDs)
    const presXml = readText('ppt/presentation.xml') ?? '';
    if (!presXml) {
        throw new Error('Invalid .pptx archive: missing ppt/presentation.xml.');
    }
    const sldSzTag = /<p:sldSz\b([^>]*)/i.exec(presXml)?.[1] ?? '';
    const cxAttr = Number(/\bcx="(\d+)"/i.exec(sldSzTag)?.[1] ?? SLIDE_W_16_9);
    const cyAttr = Number(/\bcy="(\d+)"/i.exec(sldSzTag)?.[1] ?? SLIDE_H_STD);
    const typeAttr = /\btype="([^"]*)"/i.exec(sldSzTag)?.[1] ?? '';
    const aspectRatio: '16:9' | '4:3' =
        typeAttr === 'screen4x3' || (cxAttr > 0 && cyAttr > 0 && cxAttr / cyAttr <= 1.45) ? '4:3' : '16:9';

    // Map presentation rels safely (rejecting '..' escape outside archive root)
    const presRelsXml = readText('ppt/_rels/presentation.xml.rels') ?? '';
    const presRelMap = new Map<string, PptxRelEntry>();
    for (const rel of parseRelsXml(presRelsXml)) {
        presRelMap.set(rel.Id, rel);
    }

    const slidePaths: string[] = [];
    const sldIdRe = /<p:sldId\b[^>]*r:id="([^"]+)"/gi;
    let sidMatch: RegExpExecArray | null;
    while ((sidMatch = sldIdRe.exec(presXml)) !== null) {
        const rel = presRelMap.get(sidMatch[1]);
        if (!rel) continue;
        const normalized = normalizePptxRelTarget('ppt', rel.Target);
        if (normalized && files.has(normalized)) {
            slidePaths.push(normalized);
        }
    }

    // Fallback: collect ppt/slides/slide*.xml sorted numerically if sldIdLst missing
    if (slidePaths.length === 0) {
        const fallbackPaths = Array.from(files.keys())
            .filter((k) => /^ppt\/slides\/slide\d+\.xml$/i.test(k))
            .sort((a, b) => {
                const na = parseInt(/slide(\d+)\.xml/i.exec(a)?.[1] ?? '0', 10);
                const nb = parseInt(/slide(\d+)\.xml/i.exec(b)?.[1] ?? '0', 10);
                return na - nb;
            });
        slidePaths.push(...fallbackPaths);
    }

    // Parse theme1.xml colors & fonts
    const themeXml = readText('ppt/theme/theme1.xml') ?? '';
    const readSchemeHex = (tag: string, fallback: string): string => {
        const block = new RegExp(`<a:${tag}\\b[^>]*>([\\s\\S]*?)<\\/a:${tag}>`, 'i').exec(themeXml)?.[1] ?? '';
        const hex = /<a:srgbClr\s+val="([0-9a-fA-F]{6})"/i.exec(block)?.[1];
        return hex ? `#${hex}` : fallback;
    };
    const majorFontMatch = /<a:majorFont\b[^>]*>[\s\S]*?<a:latin\s+typeface="([^"]+)"/i.exec(themeXml);
    const minorFontMatch = /<a:minorFont\b[^>]*>[\s\S]*?<a:latin\s+typeface="([^"]+)"/i.exec(themeXml);

    const theme: SlideDeckThemeSpec = {
        ThemeID: customMeta.Theme?.ThemeID || 'imported-pptx',
        Name: customMeta.Theme?.Name || 'Imported PPTX Theme',
        PrimaryColor: readSchemeHex('accent1', '#4F46E5'),
        AccentColor: readSchemeHex('accent2', '#0EA5E9'),
        BackgroundColor: readSchemeHex('lt1', '#FFFFFF'),
        SurfaceColor: readSchemeHex('lt2', '#F8FAFC'),
        TextColor: readSchemeHex('dk1', '#0F172A'),
        MutedTextColor: readSchemeHex('dk2', '#475569'),
        HeadingFont: majorFontMatch ? `${unescapePptxXml(majorFontMatch[1])}, sans-serif` : 'Inter, system-ui, sans-serif',
        BodyFont: minorFontMatch ? `${unescapePptxXml(minorFontMatch[1])}, sans-serif` : 'Inter, system-ui, sans-serif'
    };

    const slides: SlideSpec[] = slidePaths.map((slidePath, idx) => {
        const slideXml = readText(slidePath) ?? '';
        const slideDir = slidePath.includes('/') ? slidePath.slice(0, slidePath.lastIndexOf('/')) : '';
        const slideBaseName = slidePath.includes('/') ? slidePath.slice(slidePath.lastIndexOf('/') + 1) : slidePath;
        const relsPath = slideDir ? `${slideDir}/_rels/${slideBaseName}.rels` : `_rels/${slideBaseName}.rels`;
        const slideRelEntries = parseRelsXml(readText(relsPath) ?? '');
        const slideRelById = new Map<string, PptxRelEntry>();
        for (const r of slideRelEntries) {
            slideRelById.set(r.Id, r);
        }

        const showZero = /<p:sld\b[^>]*\bshow="0"/i.test(slideXml);
        const metaSlide = customMeta.Slides?.[idx];

        let slideTitle = `Slide ${idx + 1}`;
        let slideSubtitle: string | undefined;
        const regions: SlideRegionSpec[] = [];
        let regionCounter = 0;

        // Parse <p:sp> shapes
        const spRe = /<p:sp\b[^>]*>([\s\S]*?)<\/p:sp>/gi;
        let spm: RegExpExecArray | null;
        while ((spm = spRe.exec(slideXml)) !== null) {
            const spBody = spm[1];
            const spName = /\bname="([^"]*)"/i.exec(spBody)?.[1] ?? '';
            const phType = /<p:ph\b[^>]*\btype="([^"]*)"/i.exec(spBody)?.[1] ?? '';
            const text = extractParagraphsFromXmlBlock(spBody);
            if (!text) continue;

            if (phType === 'title' || phType === 'ctrTitle' || spName === 'Title') {
                slideTitle = text;
                continue;
            }
            if (phType === 'subTitle' || spName === 'Subtitle') {
                slideSubtitle = text;
                continue;
            }
            if (spName === 'Footer') {
                continue;
            }
            regionCounter++;
            regions.push({
                RegionID: `region-${regionCounter}`,
                Label: unescapePptxXml(spName) || `Region ${regionCounter}`,
                Kind: 'rich-text',
                MarkdownContent: text
            });
        }

        // Parse <p:graphicFrame> (tables + charts)
        const gfRe = /<p:graphicFrame\b[^>]*>([\s\S]*?)<\/p:graphicFrame>/gi;
        let gfm: RegExpExecArray | null;
        while ((gfm = gfRe.exec(slideXml)) !== null) {
            const gfBody = gfm[1];
            const chartRef = /<c:chart\b[^>]*r:id="([^"]+)"/i.exec(gfBody)?.[1];
            if (chartRef) {
                const rel = slideRelById.get(chartRef);
                const chartPath = rel ? normalizePptxRelTarget(slideDir, rel.Target) : null;
                const chartXml = chartPath ? readText(chartPath) : null;
                if (chartXml) {
                    regionCounter++;
                    regions.push(parseChartXmlToRegion(chartXml, `chart-${idx + 1}-${regionCounter}`));
                }
                continue;
            }
            const tblMatch = /<a:tbl\b[^>]*>([\s\S]*?)<\/a:tbl>/i.exec(gfBody);
            if (tblMatch) {
                const tableRows: string[][] = [];
                const trRe = /<a:tr\b[^>]*>([\s\S]*?)<\/a:tr>/gi;
                let trm: RegExpExecArray | null;
                while ((trm = trRe.exec(tblMatch[1])) !== null) {
                    const rowCells: string[] = [];
                    const tcRe = /<a:tc\b[^>]*>([\s\S]*?)<\/a:tc>/gi;
                    let tcm: RegExpExecArray | null;
                    while ((tcm = tcRe.exec(trm[1])) !== null) {
                        rowCells.push(extractParagraphsFromXmlBlock(tcm[1]).replace(/\n/g, ' '));
                    }
                    if (rowCells.length > 0) tableRows.push(rowCells);
                }
                if (tableRows.length > 0) {
                    regionCounter++;
                    const headerLine = `| ${tableRows[0].join(' | ')} |`;
                    const sepLine = `| ${tableRows[0].map(() => '---').join(' | ')} |`;
                    const bodyLines = tableRows.slice(1).map((r) => `| ${r.join(' | ')} |`);
                    regions.push({
                        RegionID: `table-${regionCounter}`,
                        Label: 'Data Table',
                        Kind: 'table',
                        MarkdownContent: [headerLine, sepLine, ...bodyLines].join('\n')
                    });
                }
            }
        }

        // Speaker notes via notesSlide relationship
        let speakerNotes = '';
        const notesRel = slideRelEntries.find((r) => r.Type === REL_TYPE_NOTES_SLIDE);
        if (notesRel) {
            const notesPath = normalizePptxRelTarget(slideDir, notesRel.Target);
            const notesXml = notesPath ? readText(notesPath) : null;
            if (notesXml) {
                speakerNotes = extractParagraphsFromXmlBlock(notesXml);
            }
        }

        return {
            SlideID: metaSlide?.SlideID || `slide-${idx + 1}`,
            SlideNumber: idx + 1,
            Layout: metaSlide?.Layout || 'TitleAndBody',
            Title: slideTitle,
            Subtitle: slideSubtitle,
            Regions:
                regions.length > 0
                    ? regions
                    : [{ RegionID: 'main', Label: 'Content', Kind: 'rich-text', MarkdownContent: '' }],
            SpeakerNotes: speakerNotes,
            Transition: metaSlide?.Transition || 'fade',
            Hidden: metaSlide?.Hidden ?? showZero
        };
    });

    const master: SlideMasterSpec = customMeta.Master ?? {
        HeaderText: '',
        FooterText: '',
        ShowSlideNumbers: true,
        ShowDate: true,
        OrganizationName: 'MemberJunction'
    };

    return {
        SchemaVersion: '1.0',
        DeckID: customMeta.DeckID || 'imported-pptx',
        Title: title,
        Subtitle: customMeta.Subtitle,
        AspectRatio: aspectRatio,
        Theme: theme,
        Master: master,
        Slides: slides.length > 0 ? slides : [{ SlideID: 'slide-1', SlideNumber: 1, Layout: 'TitleAndBody', Title: title, Regions: [{ RegionID: 'main', Label: 'Content', Kind: 'rich-text', MarkdownContent: '' }], SpeakerNotes: '' }],
        UpdatedAt: new Date().toISOString()
    };
}

/**
 * Computes EMU coordinates (`x`, `y`, `cx`, `cy`) for each slide region based on the
 * slide's canonical layout so exported `.pptx` slides preserve grid/card geometry.
 */
function computePptxRegionBounds(
    layout: SlideLayoutKind,
    rIdx: number,
    regionCount: number,
    marginX: number,
    cursorY: number,
    contentW: number,
    availH: number
): { x: number; y: number; cx: number; cy: number } {
    const gap = 228600; // 0.25 in

    if (
        regionCount === 2 &&
        (layout === 'TwoColumn' ||
            layout === 'Comparison' ||
            layout === 'LiveDataSlide' ||
            layout === 'ChartAndText')
    ) {
        const colW = Math.floor((contentW - gap) / 2);
        return {
            x: rIdx === 0 ? marginX : marginX + colW + gap,
            y: cursorY,
            cx: colW,
            cy: availH
        };
    }

    if ((layout === 'KpiStrip' || layout === 'Timeline') && regionCount >= 2) {
        const cols = Math.min(4, regionCount);
        const colW = Math.floor((contentW - gap * (cols - 1)) / cols);
        const col = rIdx % cols;
        const rows = Math.ceil(regionCount / cols);
        const row = Math.floor(rIdx / cols);
        const rowH = Math.max(640080, Math.floor((availH - gap * (rows - 1)) / rows));
        return {
            x: marginX + col * (colW + gap),
            y: cursorY + row * (rowH + gap),
            cx: colW,
            cy: rowH
        };
    }

    if (layout === 'Quadrant' && regionCount >= 3) {
        const colW = Math.floor((contentW - gap) / 2);
        const rowH = Math.max(640080, Math.floor((availH - gap) / 2));
        const col = rIdx % 2;
        const row = Math.floor(rIdx / 2);
        return {
            x: marginX + col * (colW + gap),
            y: cursorY + row * (rowH + gap),
            cx: colW,
            cy: rowH
        };
    }

    if (layout === 'BentoGrid' && regionCount >= 3) {
        const rowH = Math.max(640080, Math.floor((availH - gap) / 2));
        if (rIdx === 0) {
            return { x: marginX, y: cursorY, cx: contentW, cy: rowH };
        }
        const bottomCols = Math.max(1, regionCount - 1);
        const colW = Math.floor((contentW - gap * (bottomCols - 1)) / bottomCols);
        return {
            x: marginX + (rIdx - 1) * (colW + gap),
            y: cursorY + rowH + gap,
            cx: colW,
            cy: rowH
        };
    }

    if (layout === 'MetricComparison' && regionCount >= 2) {
        const topH = Math.floor(availH * 0.54);
        const bottomH = Math.max(640080, availH - topH - gap);
        if (rIdx < 2) {
            const colW = Math.floor((contentW - gap) / 2);
            return {
                x: marginX + rIdx * (colW + gap),
                y: cursorY,
                cx: colW,
                cy: topH
            };
        }
        return {
            x: marginX,
            y: cursorY + topH + gap,
            cx: contentW,
            cy: bottomH
        };
    }

    return {
        x: marginX,
        y: cursorY + Math.floor((availH / regionCount) * rIdx),
        cx: contentW,
        cy: Math.max(640080, Math.floor(availH / regionCount) - 91440)
    };
}
