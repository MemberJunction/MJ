/**
 * DOCX rendering engine extracted from WordGeneratorAction.
 * Used by both the single-shot Word Generator action and the incremental ArtifactBuilderService.
 */
import {
    AlignmentType,
    Document,
    HeadingLevel,
    ImageRun,
    Packer,
    Paragraph,
    Table,
    TableCell,
    TableRow,
    TextRun,
    WidthType,
    convertInchesToTwip,
} from "docx";
import { Parser } from 'htmlparser2';

// ── Types ─────────────────────────────────────────────────────────────────────

export interface WordOptions {
    pageSize: 'Letter' | 'A4';
    orientation: 'portrait' | 'landscape';
    margins: { top: number; bottom: number; left: number; right: number }; // inches
    defaultFontSize: number; // half-points (24 = 12pt)
    defaultFont: string;
}

export type DocxContentItem =
    | { type: 'paragraph'; text: string; bold?: boolean; italic?: boolean; align?: string }
    | { type: 'list'; items: string[]; ordered: boolean }
    | { type: 'table'; headers: string[]; rows: string[][] }
    | { type: 'image'; url: string; width?: number; height?: number; caption?: string };

export interface DocxSection {
    heading?: string;
    level?: number;
    content?: DocxContentItem[];
}

export const DEFAULT_WORD_OPTIONS: WordOptions = {
    pageSize: 'Letter',
    orientation: 'portrait',
    margins: { top: 1, bottom: 1, left: 1, right: 1 },
    defaultFontSize: 24,
    defaultFont: 'Calibri',
};

/** A raw item as an agent might send it — either a content item or a section wrapper */
type RawSectionItem = Record<string, unknown>;

// ── Rendering ─────────────────────────────────────────────────────────────────

/**
 * Render an array of DocxSection to a DOCX buffer.
 */
export async function renderDocxFromSections(sections: DocxSection[], options: WordOptions): Promise<Buffer> {
    const children: (Paragraph | Table)[] = [];

    for (const section of sections) {
        if (section.heading) {
            children.push(buildHeading(section.heading, section.level ?? 1, options));
        }
        for (const item of section.content ?? []) {
            const built = buildContentItem(item, options);
            if (built) children.push(...built);
        }
    }

    const doc = new Document({
        sections: [{
            properties: {
                page: {
                    size: {
                        width: options.pageSize === 'A4' ? 11906 : 12240,
                        height: options.pageSize === 'A4' ? 16838 : 15840,
                        orientation: options.orientation === 'landscape' ? 'landscape' : 'portrait',
                    },
                    margin: {
                        top: convertInchesToTwip(options.margins.top),
                        bottom: convertInchesToTwip(options.margins.bottom),
                        left: convertInchesToTwip(options.margins.left),
                        right: convertInchesToTwip(options.margins.right),
                    },
                },
            },
            children,
        }],
    });

    return Packer.toBuffer(doc) as Promise<Buffer>;
}

// ── Element builders ──────────────────────────────────────────────────────────

function buildHeading(text: string, level: number, options: WordOptions): Paragraph {
    const levelMap: Record<number, typeof HeadingLevel[keyof typeof HeadingLevel]> = {
        1: HeadingLevel.HEADING_1,
        2: HeadingLevel.HEADING_2,
        3: HeadingLevel.HEADING_3,
        4: HeadingLevel.HEADING_4,
        5: HeadingLevel.HEADING_5,
        6: HeadingLevel.HEADING_6,
    };
    return new Paragraph({
        heading: levelMap[level] ?? HeadingLevel.HEADING_1,
        children: [new TextRun({ text, font: options.defaultFont })],
    });
}

function buildContentItem(item: DocxContentItem, options: WordOptions): (Paragraph | Table)[] | null {
    switch (item.type) {
        case 'paragraph': return [buildParagraph(item, options)];
        case 'list':      return buildList(item, options);
        case 'table':     return [buildTable(item, options)];
        case 'image':     return buildImage(item, options);
        default:          return null;
    }
}

function buildParagraph(
    item: Extract<DocxContentItem, { type: 'paragraph' }>,
    options: WordOptions
): Paragraph {
    return new Paragraph({
        alignment: resolveAlignment(item.align),
        children: [new TextRun({
            text: item.text,
            bold: item.bold,
            italics: item.italic,
            font: options.defaultFont,
            size: options.defaultFontSize,
        })],
    });
}

function buildList(
    item: Extract<DocxContentItem, { type: 'list' }>,
    options: WordOptions
): Paragraph[] {
    return item.items.map(text => new Paragraph({
        numbering: item.ordered
            ? { reference: 'ordered-list', level: 0 }
            : undefined,
        bullet: item.ordered ? undefined : { level: 0 },
        children: [new TextRun({
            text,
            font: options.defaultFont,
            size: options.defaultFontSize,
        })],
    }));
}

function buildTable(
    item: Extract<DocxContentItem, { type: 'table' }>,
    options: WordOptions
): Table {
    const colCount = Math.max(item.headers.length, ...item.rows.map(r => r.length));

    const headerRow = new TableRow({
        tableHeader: true,
        children: Array.from({ length: colCount }, (_, c) =>
            new TableCell({
                children: [new Paragraph({
                    children: [new TextRun({
                        text: item.headers[c] ?? '',
                        bold: true,
                        font: options.defaultFont,
                        size: options.defaultFontSize,
                    })],
                })],
            })
        ),
    });

    const dataRows = item.rows.map(row =>
        new TableRow({
            children: Array.from({ length: colCount }, (_, c) =>
                new TableCell({
                    children: [new Paragraph({
                        children: [new TextRun({
                            text: row[c] ?? '',
                            font: options.defaultFont,
                            size: options.defaultFontSize,
                        })],
                    })],
                })
            ),
        })
    );

    return new Table({
        width: { size: 100, type: WidthType.PERCENTAGE },
        rows: [headerRow, ...dataRows],
    });
}

function buildImage(
    item: Extract<DocxContentItem, { type: 'image' }>,
    options: WordOptions
): (Paragraph | Table)[] | null {
    if (!item.url) return null;
    const dataUri = /^data:image\/(png|jpe?g|gif|webp);base64,(.+)$/i.exec(item.url);
    if (!dataUri) return null;

    try {
        const imageBuffer = Buffer.from(dataUri[2], 'base64');
        const width = item.width ?? 400;
        const height = item.height ?? Math.round(width * 0.6);
        const results: (Paragraph | Table)[] = [
            new Paragraph({
                children: [new ImageRun({
                    data: imageBuffer,
                    transformation: { width, height },
                    type: dataUri[1].replace('jpeg', 'jpg').replace('webp', 'png') as 'png' | 'jpg' | 'gif' | 'bmp',
                })],
                alignment: AlignmentType.CENTER,
            }),
        ];
        if (item.caption) {
            results.push(new Paragraph({
                alignment: AlignmentType.CENTER,
                children: [new TextRun({
                    text: item.caption,
                    italics: true,
                    font: options.defaultFont,
                    size: options.defaultFontSize - 4,
                })],
            }));
        }
        return results;
    } catch {
        return null;
    }
}

function resolveAlignment(align?: string): typeof AlignmentType[keyof typeof AlignmentType] | undefined {
    switch ((align ?? '').toLowerCase()) {
        case 'center':  return AlignmentType.CENTER;
        case 'right':   return AlignmentType.RIGHT;
        case 'justify': return AlignmentType.JUSTIFIED;
        default:        return AlignmentType.LEFT;
    }
}

// ── Section normalizers ───────────────────────────────────────────────────────

/**
 * Accepts both formats agents may produce:
 *
 * Structured (canonical):
 *   [{ heading: "Title", level: 1, content: [{ type: "paragraph", text: "..." }] }]
 *
 * Flat (what most LLM agents naturally emit):
 *   [{ type: "heading", level: 1, text: "Title" }, { type: "paragraph", text: "..." }]
 */
export function normalizeSections(items: RawSectionItem[]): DocxSection[] {
    if (items.length === 0) return [];

    const isStructured = items.some(i => 'heading' in i || 'content' in i);
    if (isStructured) {
        return items.map(i => normalizeStructuredSection(i));
    }

    return normalizeFlatItems(items);
}

function normalizeStructuredSection(raw: RawSectionItem): DocxSection {
    const section: DocxSection = {};
    if (typeof raw['heading'] === 'string') section.heading = raw['heading'];
    if (typeof raw['level'] === 'number') section.level = raw['level'];
    if (Array.isArray(raw['content'])) {
        section.content = (raw['content'] as RawSectionItem[]).map(normalizeContentItem);
    }
    return section;
}

function normalizeFlatItems(items: RawSectionItem[]): DocxSection[] {
    const sections: DocxSection[] = [];
    let current: DocxSection = { content: [] };

    for (const item of items) {
        if (item['type'] === 'heading') {
            if (current.heading !== undefined || (current.content?.length ?? 0) > 0) {
                sections.push(current);
            }
            current = {
                heading: String(item['text'] ?? item['content'] ?? item['heading'] ?? ''),
                level: typeof item['level'] === 'number' ? item['level'] : 1,
                content: [],
            };
        } else {
            current.content = current.content ?? [];
            current.content.push(normalizeContentItem(item));
        }
    }

    if (current.heading !== undefined || (current.content?.length ?? 0) > 0) {
        sections.push(current);
    }

    return sections;
}

function normalizeContentItem(raw: RawSectionItem): DocxContentItem {
    const type = String(raw['type'] ?? 'paragraph');

    if (type === 'table') return normalizeTable(raw);

    if (type === 'list') {
        return {
            type: 'list',
            items: Array.isArray(raw['items']) ? (raw['items'] as string[]) : [],
            ordered: Boolean(raw['ordered']),
        };
    }

    if (type === 'image') {
        return {
            type: 'image',
            url: String(raw['url'] ?? raw['src'] ?? ''),
            width: typeof raw['width'] === 'number' ? raw['width'] : undefined,
            height: typeof raw['height'] === 'number' ? raw['height'] : undefined,
            caption: typeof raw['caption'] === 'string' ? raw['caption'] : undefined,
        };
    }

    return {
        type: 'paragraph',
        text: String(raw['text'] ?? raw['content'] ?? ''),
        bold: Boolean(raw['bold']),
        italic: Boolean(raw['italic']),
        align: typeof raw['align'] === 'string' ? raw['align'] : undefined,
    };
}

function normalizeTable(raw: RawSectionItem): DocxContentItem {
    const rawRows = Array.isArray(raw['rows']) ? (raw['rows'] as string[][]) : [];
    let headers = Array.isArray(raw['headers'])
        ? (raw['headers'] as string[])
        : Array.isArray(raw['columns']) ? (raw['columns'] as string[]) : [];

    let rows = rawRows;
    if (headers.length === 0 && rawRows.length > 0) {
        headers = rawRows[0];
        rows = rawRows.slice(1);
    }

    return { type: 'table', headers, rows };
}

/**
 * Lightweight HTML → structured sections converter using htmlparser2.
 */
export function htmlToSections(html: string): DocxSection[] {
    const sections: DocxSection[] = [];
    let currentSection: DocxSection = { content: [] };

    const tagStack: string[] = [];
    let boldDepth = 0;
    let italicDepth = 0;
    let inParagraph = false;
    let paragraphText = '';
    let inListItem = false;
    let listItemText = '';
    let listItems: string[] = [];
    let listOrdered = false;
    let inCell = false;
    let cellText = '';
    let currentRow: string[] = [];
    let tableHeaders: string[] = [];
    let tableRows: string[][] = [];
    let inThead = false;
    let inTable = false;

    const flushSection = () => {
        if (currentSection.heading || (currentSection.content?.length ?? 0) > 0) {
            sections.push(currentSection);
        }
        currentSection = { content: [] };
    };

    const parser = new Parser({
        onopentag(name) {
            tagStack.push(name);
            if (/^h[1-6]$/.test(name)) {
                flushSection();
                currentSection.level = parseInt(name[1]);
                currentSection.heading = '';
            } else if (name === 'p') { inParagraph = true; paragraphText = ''; }
            else if (name === 'strong' || name === 'b') { boldDepth++; }
            else if (name === 'em' || name === 'i') { italicDepth++; }
            else if (name === 'ul' || name === 'ol') { listItems = []; listOrdered = name === 'ol'; }
            else if (name === 'li') { inListItem = true; listItemText = ''; }
            else if (name === 'table') { inTable = true; tableHeaders = []; tableRows = []; }
            else if (name === 'thead') { inThead = true; }
            else if (name === 'th' || name === 'td') { inCell = true; cellText = ''; }
            else if (name === 'tr') { currentRow = []; }
        },
        ontext(text) {
            const t = text.replace(/\s+/g, ' ');
            if (inCell) { cellText += t; }
            else if (inListItem) { listItemText += t; }
            else if (inParagraph) { paragraphText += t; }
            else if (currentSection.heading !== undefined && tagStack.some(tag => /^h[1-6]$/.test(tag))) {
                currentSection.heading = (currentSection.heading ?? '') + t;
            }
        },
        onclosetag(name) {
            tagStack.pop();
            if (/^h[1-6]$/.test(name)) { /* heading text already accumulated */ }
            else if (name === 'p' && inParagraph) {
                const text = paragraphText.trim();
                if (text) currentSection.content!.push({ type: 'paragraph', text, bold: boldDepth > 0, italic: italicDepth > 0 });
                inParagraph = false; paragraphText = '';
            } else if (name === 'strong' || name === 'b') { boldDepth = Math.max(0, boldDepth - 1); }
            else if (name === 'em' || name === 'i') { italicDepth = Math.max(0, italicDepth - 1); }
            else if (name === 'li' && inListItem) { if (listItemText.trim()) listItems.push(listItemText.trim()); inListItem = false; listItemText = ''; }
            else if (name === 'ul' || name === 'ol') { if (listItems.length) currentSection.content!.push({ type: 'list', items: listItems, ordered: listOrdered }); listItems = []; }
            else if (name === 'th' || name === 'td') { currentRow.push(cellText.trim()); inCell = false; cellText = ''; }
            else if (name === 'tr') { if (inThead) tableHeaders = currentRow; else tableRows.push(currentRow); currentRow = []; }
            else if (name === 'thead') { inThead = false; }
            else if (name === 'table' && inTable) { currentSection.content!.push({ type: 'table', headers: tableHeaders, rows: tableRows }); inTable = false; }
        }
    }, { decodeEntities: true });

    parser.write(html);
    parser.end();
    flushSection();

    return sections;
}
