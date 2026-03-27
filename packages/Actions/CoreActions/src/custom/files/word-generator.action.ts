import { ActionResultSimple, RunActionParams } from "@memberjunction/actions-base";
import { RegisterClass } from "@memberjunction/global";
import { BaseFileHandlerAction } from "../utilities/base-file-handler";
import { BaseAction } from '@memberjunction/actions';
import { marked } from "marked";
import { JSONParamHelper } from "../utilities/json-param-helper";
import {
    AlignmentType,
    Document,
    HeadingLevel,
    ImageRun,
    NumberFormat,
    Packer,
    Paragraph,
    Table,
    TableCell,
    TableRow,
    TextRun,
    WidthType,
    BorderStyle,
    convertInchesToTwip,
} from "docx";

// ── Types ─────────────────────────────────────────────────────────────────────

interface WordOptions {
    pageSize: 'Letter' | 'A4';
    orientation: 'portrait' | 'landscape';
    margins: { top: number; bottom: number; left: number; right: number }; // inches
    defaultFontSize: number; // half-points (24 = 12pt)
    defaultFont: string;
}

type ContentItem =
    | { type: 'paragraph'; text: string; bold?: boolean; italic?: boolean; align?: string }
    | { type: 'list'; items: string[]; ordered: boolean }
    | { type: 'table'; headers: string[]; rows: string[][] }
    | { type: 'image'; url: string; width?: number; height?: number; caption?: string };

interface DocumentSection {
    heading?: string;
    level?: number;
    content?: ContentItem[];
}

interface StructuredInput {
    sections: DocumentSection[];
}

/** A raw item as an agent might send it — either a content item or a section wrapper */
type RawSectionItem = Record<string, unknown>;

// ── Action ────────────────────────────────────────────────────────────────────

/**
 * Action that generates Word (DOCX) documents from structured JSON, HTML, or Markdown.
 *
 * Structured input format:
 * ```json
 * {
 *   "sections": [
 *     {
 *       "heading": "Quarterly Report",
 *       "level": 1,
 *       "content": [
 *         { "type": "paragraph", "text": "..." },
 *         { "type": "table", "headers": ["Col1"], "rows": [["val"]] },
 *         { "type": "list", "items": ["Item 1"], "ordered": false },
 *         { "type": "image", "url": "data:image/png;base64,...", "width": 400 }
 *       ]
 *     }
 *   ]
 * }
 * ```
 */
@RegisterClass(BaseAction, "__WordDocumentGenerator")
export class WordGeneratorAction extends BaseFileHandlerAction {

    protected async InternalRunAction(params: RunActionParams): Promise<ActionResultSimple> {
        try {
            const contentType = (this.getParamValue(params, 'contenttype') || 'structured').toLowerCase();
            const fileName = this.getParamValue(params, 'filename') || 'document.docx';
            const outputFileId = this.getParamValue(params, 'outputfileid');
            const options = this.buildOptions(params);

            const sections = await this.resolveSections(params, contentType);
            if (!sections) {
                return { Success: false, Message: "No content provided. Supply Sections, or Content with ContentType 'markdown'/'html'.", ResultCode: "MISSING_CONTENT" };
            }

            const docxBuffer = await this.generateDocx(sections, options);

            if (outputFileId) {
                return await this.saveAndReturn(docxBuffer, fileName, params);
            }

            return this.returnAsBase64(docxBuffer, fileName, params);

        } catch (error) {
            return {
                Success: false,
                Message: `Failed to generate Word document: ${error instanceof Error ? error.message : String(error)}`,
                ResultCode: "GENERATION_FAILED"
            };
        }
    }

    // ── Option helpers ─────────────────────────────────────────────────────────

    private buildOptions(params: RunActionParams): WordOptions {
        const defaults: WordOptions = {
            pageSize: 'Letter',
            orientation: 'portrait',
            margins: { top: 1, bottom: 1, left: 1, right: 1 },
            defaultFontSize: 24,
            defaultFont: 'Calibri',
        };
        const custom = JSONParamHelper.getJSONParam(params, 'options') as Partial<WordOptions> | null;
        return custom ? { ...defaults, ...custom } : defaults;
    }

    // ── Content resolution ─────────────────────────────────────────────────────

    private async resolveSections(
        params: RunActionParams,
        contentType: string
    ): Promise<DocumentSection[] | null> {
        // Try Sections param (structured JSON)
        const sectionsParam = JSONParamHelper.getJSONParam(params, 'sections');
        if (sectionsParam) {
            if (Array.isArray(sectionsParam)) return normalizeSections(sectionsParam as RawSectionItem[]);
            const structured = sectionsParam as StructuredInput;
            if (structured.sections) return normalizeSections(structured.sections as RawSectionItem[]);
        }

        // Try Content param (markdown or html)
        const content = this.getParamValue(params, 'content');
        if (content) {
            const html = contentType === 'markdown'
                ? await marked(content.toString()) as string
                : content.toString();
            return htmlToSections(html);
        }

        return null;
    }

    // ── DOCX generation ────────────────────────────────────────────────────────

    private async generateDocx(sections: DocumentSection[], options: WordOptions): Promise<Buffer> {
        const children: (Paragraph | Table)[] = [];

        for (const section of sections) {
            if (section.heading) {
                children.push(this.buildHeading(section.heading, section.level ?? 1, options));
            }
            for (const item of section.content ?? []) {
                const built = this.buildContentItem(item, options);
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

    // ── Element builders ───────────────────────────────────────────────────────

    private buildHeading(text: string, level: number, options: WordOptions): Paragraph {
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

    private buildContentItem(item: ContentItem, options: WordOptions): (Paragraph | Table)[] | null {
        switch (item.type) {
            case 'paragraph': return [this.buildParagraph(item, options)];
            case 'list':      return this.buildList(item, options);
            case 'table':     return [this.buildTable(item, options)];
            case 'image':     return this.buildImage(item, options);
            default:          return null;
        }
    }

    private buildParagraph(
        item: Extract<ContentItem, { type: 'paragraph' }>,
        options: WordOptions
    ): Paragraph {
        return new Paragraph({
            alignment: this.resolveAlignment(item.align),
            children: [new TextRun({
                text: item.text,
                bold: item.bold,
                italics: item.italic,
                font: options.defaultFont,
                size: options.defaultFontSize,
            })],
        });
    }

    private buildList(
        item: Extract<ContentItem, { type: 'list' }>,
        options: WordOptions
    ): Paragraph[] {
        return item.items.map((text, idx) => new Paragraph({
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

    private buildTable(
        item: Extract<ContentItem, { type: 'table' }>,
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

    private buildImage(
        item: Extract<ContentItem, { type: 'image' }>,
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

    private resolveAlignment(align?: string): typeof AlignmentType[keyof typeof AlignmentType] | undefined {
        switch ((align ?? '').toLowerCase()) {
            case 'center':  return AlignmentType.CENTER;
            case 'right':   return AlignmentType.RIGHT;
            case 'justify': return AlignmentType.JUSTIFIED;
            default:        return AlignmentType.LEFT;
        }
    }

    // ── Save helpers ───────────────────────────────────────────────────────────

    private async saveAndReturn(
        buffer: Buffer,
        fileName: string,
        params: RunActionParams
    ): Promise<ActionResultSimple> {
        try {
            const fileId = await this.saveToMJStorage(buffer, fileName,
                'application/vnd.openxmlformats-officedocument.wordprocessingml.document', params);
            params.Params.push({ Name: 'GeneratedFileID', Type: 'Output', Value: fileId });
            return {
                Success: true, ResultCode: "SUCCESS_SAVED",
                Message: JSON.stringify({ message: "Word document generated and saved", fileId, fileName, sizeBytes: buffer.length }, null, 2)
            };
        } catch (error) {
            console.error('Failed to save to storage:', error);
            return this.returnAsBase64(buffer, fileName, params);
        }
    }

    private returnAsBase64(buffer: Buffer, fileName: string, params: RunActionParams): ActionResultSimple {
        const base64Data = buffer.toString('base64');
        params.Params.push({ Name: 'DocxData', Type: 'Output', Value: base64Data });
        return {
            Success: true, ResultCode: "SUCCESS",
            Message: JSON.stringify({ message: "Word document generated", fileName, sizeBytes: buffer.length, base64Length: base64Data.length }, null, 2)
        };
    }
}

// ── Section normalizer ────────────────────────────────────────────────────────

/**
 * Accepts both formats agents may produce:
 *
 * Structured (canonical):
 *   [{ heading: "Title", level: 1, content: [{ type: "paragraph", text: "..." }] }]
 *
 * Flat (what most LLM agents naturally emit):
 *   [{ type: "heading", level: 1, text: "Title" }, { type: "paragraph", text: "..." }]
 *
 * Flat items are grouped: a heading item starts a new DocumentSection; non-heading
 * items are collected into the current section's content array.
 */
function normalizeSections(items: RawSectionItem[]): DocumentSection[] {
    if (items.length === 0) return [];

    // Detect format: structured sections have 'heading' or 'content' keys
    const isStructured = items.some(i => 'heading' in i || 'content' in i);
    if (isStructured) {
        return items.map(i => normalizeStructuredSection(i));
    }

    return normalizeFlatItems(items);
}

function normalizeStructuredSection(raw: RawSectionItem): DocumentSection {
    const section: DocumentSection = {};
    if (typeof raw['heading'] === 'string') section.heading = raw['heading'];
    if (typeof raw['level'] === 'number') section.level = raw['level'];
    if (Array.isArray(raw['content'])) {
        section.content = (raw['content'] as RawSectionItem[]).map(normalizeContentItem);
    }
    return section;
}

function normalizeFlatItems(items: RawSectionItem[]): DocumentSection[] {
    const sections: DocumentSection[] = [];
    let current: DocumentSection = { content: [] };

    for (const item of items) {
        if (item['type'] === 'heading') {
            if (current.heading !== undefined || (current.content?.length ?? 0) > 0) {
                sections.push(current);
            }
            current = {
                heading: String(item['text'] ?? item['heading'] ?? ''),
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

function normalizeContentItem(raw: RawSectionItem): ContentItem {
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

    // paragraph (default)
    return {
        type: 'paragraph',
        text: String(raw['text'] ?? ''),
        bold: Boolean(raw['bold']),
        italic: Boolean(raw['italic']),
        align: typeof raw['align'] === 'string' ? raw['align'] : undefined,
    };
}

/**
 * Normalizes a table item. Handles:
 * - `headers` + `rows` (canonical)
 * - `rows` only — treats first row as headers
 * - `columns` alias for `headers`
 */
function normalizeTable(raw: RawSectionItem): ContentItem {
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

// ── HTML → DocumentSection[] parser ──────────────────────────────────────────

/**
 * Lightweight HTML → structured sections converter using htmlparser2.
 * Used when ContentType is 'html' or 'markdown' (markdown is pre-converted to HTML).
 */
function htmlToSections(html: string): DocumentSection[] {
    // Reuse the same htmlparser2-based approach as the PDF generator,
    // but emit DocumentSection[] instead of NodeType[]
    const { Parser } = require('htmlparser2') as typeof import('htmlparser2');

    const sections: DocumentSection[] = [];
    let currentSection: DocumentSection = { content: [] };

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
        onopentag(name, attribs) {
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
