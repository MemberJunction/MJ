/**
 * PDF rendering engine extracted from PDFGeneratorAction.
 * Used by both the single-shot PDF Generator action and the incremental ArtifactBuilderService.
 */
import PDFDocument from "pdfkit";
import { Parser } from 'htmlparser2';

// ── Types ─────────────────────────────────────────────────────────────────────

export interface PDFOptions {
    margin: { top: number; bottom: number; left: number; right: number };
    fontSize: number;
    font: string;
    orientation: 'portrait' | 'landscape';
    size: string;
}

export type PDFNodeType =
    | { type: 'heading'; level: 1 | 2 | 3 | 4 | 5 | 6; text: string }
    | { type: 'paragraph'; text: string; bold?: boolean; italic?: boolean }
    | { type: 'list'; items: string[]; ordered: boolean }
    | { type: 'table'; headers: string[]; rows: string[][] }
    | { type: 'image'; src: string; alt?: string }
    | { type: 'hr' }
    | { type: 'br' };

export const DEFAULT_PDF_OPTIONS: PDFOptions = {
    margin: { top: 72, bottom: 72, left: 72, right: 72 },
    fontSize: 12,
    font: 'Helvetica',
    orientation: 'portrait',
    size: 'Letter'
};

// ── Rendering ─────────────────────────────────────────────────────────────────

/**
 * Render an array of PDFNodeType nodes to a PDF buffer using pdfkit.
 */
export function renderPDFFromNodes(nodes: PDFNodeType[], options: PDFOptions): Promise<Buffer> {
    return new Promise((resolve, reject) => {
        try {
            const doc = new PDFDocument({
                size: options.size,
                layout: options.orientation,
                margins: options.margin,
                info: { Title: 'Generated Document', Author: 'MemberJunction', Creator: 'PDF Generator Action' }
            });

            const chunks: Buffer[] = [];
            doc.on('data', (chunk: Buffer) => chunks.push(chunk));
            doc.on('end', () => resolve(Buffer.concat(chunks as unknown as Uint8Array[])));
            doc.on('error', reject);

            renderNodes(doc, nodes, options);
            doc.end();
        } catch (error) {
            reject(error);
        }
    });
}

/**
 * Render an HTML string to a PDF buffer.
 * If contentType is 'markdown', converts to HTML first using the provided marked function.
 */
export async function renderPDFFromHTML(
    htmlContent: string,
    options: PDFOptions
): Promise<Buffer> {
    const nodes = parseHTML(htmlContent);
    return renderPDFFromNodes(nodes, options);
}

// ── Internal renderers ────────────────────────────────────────────────────────

function renderNodes(doc: InstanceType<typeof PDFDocument>, nodes: PDFNodeType[], options: PDFOptions): void {
    for (const node of nodes) {
        renderNode(doc, node, options);
    }
}

function renderNode(doc: InstanceType<typeof PDFDocument>, node: PDFNodeType, options: PDFOptions): void {
    switch (node.type) {
        case 'heading':   renderHeading(doc, node, options); break;
        case 'paragraph': renderParagraph(doc, node, options); break;
        case 'list':      renderList(doc, node, options); break;
        case 'table':     renderTable(doc, node, options); break;
        case 'image':     renderImage(doc, node); break;
        case 'hr':        renderHR(doc, options); break;
        case 'br':        doc.moveDown(0.5); break;
    }
}

function renderHeading(
    doc: InstanceType<typeof PDFDocument>,
    node: Extract<PDFNodeType, { type: 'heading' }>,
    options: PDFOptions
): void {
    const sizemap: Record<number, number> = { 1: 24, 2: 20, 3: 16, 4: 14, 5: 13, 6: 12 };
    const size = sizemap[node.level] ?? 12;
    doc.font(`${options.font}-Bold`).fontSize(size).text(node.text, { align: 'left' });
    doc.font(options.font).fontSize(options.fontSize);
    doc.moveDown(0.5);
}

function renderParagraph(
    doc: InstanceType<typeof PDFDocument>,
    node: Extract<PDFNodeType, { type: 'paragraph' }>,
    options: PDFOptions
): void {
    const font = node.bold
        ? `${options.font}-Bold`
        : node.italic
            ? `${options.font}-Oblique`
            : options.font;
    doc.font(font).fontSize(options.fontSize).text(node.text, { align: 'left' });
    doc.font(options.font);
    doc.moveDown(0.3);
}

function renderList(
    doc: InstanceType<typeof PDFDocument>,
    node: Extract<PDFNodeType, { type: 'list' }>,
    options: PDFOptions
): void {
    doc.font(options.font).fontSize(options.fontSize);
    doc.list(node.items, { bulletRadius: 2, textIndent: 20, bulletIndent: 10 });
    doc.moveDown(0.3);
}

function renderTable(
    doc: InstanceType<typeof PDFDocument>,
    node: Extract<PDFNodeType, { type: 'table' }>,
    options: PDFOptions
): void {
    const colCount = Math.max(node.headers.length, ...node.rows.map(r => r.length));
    if (colCount === 0) return;

    const usableWidth = doc.page.width - doc.page.margins.left - doc.page.margins.right;
    const colWidth = usableWidth / colCount;
    const rowHeight = options.fontSize + 8;
    const x = doc.page.margins.left;
    let y = doc.y;

    // Headers
    doc.font(`${options.font}-Bold`).fontSize(options.fontSize);
    for (let c = 0; c < colCount; c++) {
        doc.rect(x + c * colWidth, y, colWidth, rowHeight).stroke();
        doc.text(node.headers[c] ?? '', x + c * colWidth + 4, y + 4, {
            width: colWidth - 8, height: rowHeight - 4, ellipsis: true
        });
    }
    y += rowHeight;

    // Rows
    doc.font(options.font).fontSize(options.fontSize);
    for (const row of node.rows) {
        for (let c = 0; c < colCount; c++) {
            doc.rect(x + c * colWidth, y, colWidth, rowHeight).stroke();
            doc.text(row[c] ?? '', x + c * colWidth + 4, y + 4, {
                width: colWidth - 8, height: rowHeight - 4, ellipsis: true
            });
        }
        y += rowHeight;
    }

    doc.y = y + 4;
    doc.moveDown(0.3);
}

function renderImage(doc: InstanceType<typeof PDFDocument>, node: Extract<PDFNodeType, { type: 'image' }>): void {
    if (!node.src) return;

    const dataUri = /^data:image\/(png|jpe?g|gif|webp);base64,(.+)$/i.exec(node.src);
    if (!dataUri) return;

    try {
        const imageBuffer = Buffer.from(dataUri[2], 'base64');
        const maxWidth = doc.page.width - doc.page.margins.left - doc.page.margins.right;
        doc.image(imageBuffer, { fit: [maxWidth, 400], align: 'center' });
        doc.moveDown(0.3);
    } catch {
        // Skip images that can't be decoded rather than crashing the whole PDF
    }
}

function renderHR(doc: InstanceType<typeof PDFDocument>, options: PDFOptions): void {
    const x = doc.page.margins.left;
    const width = doc.page.width - doc.page.margins.left - doc.page.margins.right;
    doc.moveTo(x, doc.y).lineTo(x + width, doc.y).stroke();
    doc.moveDown(0.5);
    doc.fontSize(options.fontSize);
}

// ── HTML → PDFNodeType[] parser ───────────────────────────────────────────────

/**
 * Parse an HTML string into a flat list of renderable nodes using htmlparser2.
 */
export function parseHTML(html: string): PDFNodeType[] {
    const nodes: PDFNodeType[] = [];

    const tagStack: string[] = [];
    let currentText = '';
    let inHeading = false;
    let headingLevel: 1 | 2 | 3 | 4 | 5 | 6 = 1;
    let inParagraph = false;
    let boldDepth = 0;
    let italicDepth = 0;

    let inList = false;
    let listOrdered = false;
    let listItems: string[] = [];
    let inListItem = false;
    let listItemText = '';

    let inTable = false;
    let inThead = false;
    let tableHeaders: string[] = [];
    let tableRows: string[][] = [];
    let currentRow: string[] = [];
    let inCell = false;
    let cellText = '';

    const flushText = (): string => {
        const t = currentText.trim();
        currentText = '';
        return t;
    };

    const parser = new Parser({
        onopentag(name, attribs) {
            tagStack.push(name);

            if (/^h[1-6]$/.test(name)) {
                inHeading = true;
                headingLevel = parseInt(name[1]) as 1 | 2 | 3 | 4 | 5 | 6;
                currentText = '';
            } else if (name === 'p') {
                inParagraph = true;
                currentText = '';
            } else if (name === 'strong' || name === 'b') {
                boldDepth++;
            } else if (name === 'em' || name === 'i') {
                italicDepth++;
            } else if (name === 'ul' || name === 'ol') {
                inList = true;
                listOrdered = name === 'ol';
                listItems = [];
            } else if (name === 'li') {
                inListItem = true;
                listItemText = '';
            } else if (name === 'table') {
                inTable = true;
                tableHeaders = [];
                tableRows = [];
            } else if (name === 'thead') {
                inThead = true;
            } else if (name === 'tbody') {
                // no-op, tracked via inTable
            } else if (name === 'tr') {
                currentRow = [];
            } else if (name === 'th' || name === 'td') {
                inCell = true;
                cellText = '';
            } else if (name === 'img') {
                nodes.push({ type: 'image', src: attribs['src'] ?? '', alt: attribs['alt'] });
            } else if (name === 'hr') {
                nodes.push({ type: 'hr' });
            } else if (name === 'br') {
                nodes.push({ type: 'br' });
            }
        },

        ontext(text) {
            const cleaned = text.replace(/\s+/g, ' ');
            if (inCell) {
                cellText += cleaned;
            } else if (inListItem) {
                listItemText += cleaned;
            } else if (inHeading || inParagraph) {
                currentText += cleaned;
            }
        },

        onclosetag(name) {
            tagStack.pop();

            if (/^h[1-6]$/.test(name) && inHeading) {
                const text = flushText();
                if (text) nodes.push({ type: 'heading', level: headingLevel, text });
                inHeading = false;
            } else if (name === 'p' && inParagraph) {
                const text = flushText();
                if (text) {
                    nodes.push({ type: 'paragraph', text, bold: boldDepth > 0, italic: italicDepth > 0 });
                }
                inParagraph = false;
            } else if (name === 'strong' || name === 'b') {
                boldDepth = Math.max(0, boldDepth - 1);
            } else if (name === 'em' || name === 'i') {
                italicDepth = Math.max(0, italicDepth - 1);
            } else if (name === 'li' && inListItem) {
                const text = listItemText.trim();
                if (text) listItems.push(text);
                inListItem = false;
                listItemText = '';
            } else if ((name === 'ul' || name === 'ol') && inList) {
                if (listItems.length > 0) {
                    nodes.push({ type: 'list', items: listItems, ordered: listOrdered });
                }
                inList = false;
                listItems = [];
            } else if (name === 'th' || name === 'td') {
                const text = cellText.trim();
                currentRow.push(text);
                inCell = false;
                cellText = '';
            } else if (name === 'tr') {
                if (inThead) {
                    tableHeaders = currentRow;
                } else {
                    tableRows.push(currentRow);
                }
                currentRow = [];
            } else if (name === 'thead') {
                inThead = false;
            } else if (name === 'table' && inTable) {
                nodes.push({ type: 'table', headers: tableHeaders, rows: tableRows });
                inTable = false;
            }
        }
    }, { decodeEntities: true });

    parser.write(html);
    parser.end();

    return nodes;
}
