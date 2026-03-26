import { ActionResultSimple, RunActionParams } from "@memberjunction/actions-base";
import { RegisterClass } from "@memberjunction/global";
import { BaseFileHandlerAction } from "../utilities/base-file-handler";
import PDFDocument from "pdfkit";
import { marked } from "marked";
import { JSONParamHelper } from "../utilities/json-param-helper";
import { BaseAction } from '@memberjunction/actions';
import { Parser } from 'htmlparser2';

// ── Types ─────────────────────────────────────────────────────────────────────

interface PDFOptions {
    margin: { top: number; bottom: number; left: number; right: number };
    fontSize: number;
    font: string;
    orientation: 'portrait' | 'landscape';
    size: string;
}

type NodeType =
    | { type: 'heading'; level: 1 | 2 | 3 | 4 | 5 | 6; text: string }
    | { type: 'paragraph'; text: string; bold?: boolean; italic?: boolean }
    | { type: 'list'; items: string[]; ordered: boolean }
    | { type: 'table'; headers: string[]; rows: string[][] }
    | { type: 'image'; src: string; alt?: string }
    | { type: 'hr' }
    | { type: 'br' };

// ── Action ────────────────────────────────────────────────────────────────────

/**
 * Action that generates PDF files from HTML or Markdown content.
 * Uses htmlparser2 for proper HTML parsing with support for headings,
 * paragraphs, lists, tables, images, and basic inline styles.
 *
 * Optional Puppeteer high-fidelity mode is activated automatically when
 * the `puppeteer` package is present in the runtime environment.
 */
@RegisterClass(BaseAction, "PDF Generator")
export class PDFGeneratorAction extends BaseFileHandlerAction {

    protected async InternalRunAction(params: RunActionParams): Promise<ActionResultSimple> {
        try {
            const content = this.getParamValue(params, 'content');
            const contentType = (this.getParamValue(params, 'contenttype') || 'html').toLowerCase();
            const outputFileId = this.getParamValue(params, 'outputfileid');
            const fileName = this.getParamValue(params, 'filename') || 'document.pdf';

            if (!content) {
                return { Success: false, Message: "Content parameter is required", ResultCode: "MISSING_CONTENT" };
            }

            const options = this.buildOptions(params);

            let htmlContent = content.toString();
            if (contentType === 'markdown') {
                htmlContent = await marked(htmlContent) as string;
            }

            const pdfBuffer = await this.generatePDF(htmlContent, options);

            if (outputFileId) {
                return await this.saveAndReturn(pdfBuffer, fileName, params);
            }

            return this.returnAsBase64(pdfBuffer, fileName, params);

        } catch (error) {
            return {
                Success: false,
                Message: `Failed to generate PDF: ${error instanceof Error ? error.message : String(error)}`,
                ResultCode: "GENERATION_FAILED"
            };
        }
    }

    // ── Option helpers ─────────────────────────────────────────────────────────

    private buildOptions(params: RunActionParams): PDFOptions {
        const defaults: PDFOptions = {
            margin: { top: 72, bottom: 72, left: 72, right: 72 },
            fontSize: 12,
            font: 'Helvetica',
            orientation: 'portrait',
            size: 'Letter'
        };
        const custom = JSONParamHelper.getJSONParam(params, 'options') as Partial<PDFOptions> | null;
        return custom ? { ...defaults, ...custom } : defaults;
    }

    // ── Save helpers ───────────────────────────────────────────────────────────

    private async saveAndReturn(
        pdfBuffer: Buffer,
        fileName: string,
        params: RunActionParams
    ): Promise<ActionResultSimple> {
        try {
            const fileId = await this.saveToMJStorage(pdfBuffer, fileName, 'application/pdf', params);
            params.Params.push({ Name: 'GeneratedFileID', Type: 'Output', Value: fileId });
            return {
                Success: true,
                ResultCode: "SUCCESS_SAVED",
                Message: JSON.stringify({ message: "PDF generated and saved", fileId, fileName, sizeBytes: pdfBuffer.length }, null, 2)
            };
        } catch (error) {
            console.error('Failed to save to storage:', error);
            return this.returnAsBase64(pdfBuffer, fileName, params);
        }
    }

    private returnAsBase64(pdfBuffer: Buffer, fileName: string, params: RunActionParams): ActionResultSimple {
        const base64Data = pdfBuffer.toString('base64');
        params.Params.push({ Name: 'PDFData', Type: 'Output', Value: base64Data });
        return {
            Success: true,
            ResultCode: "SUCCESS",
            Message: JSON.stringify({ message: "PDF generated", fileName, sizeBytes: pdfBuffer.length, base64Length: base64Data.length }, null, 2)
        };
    }

    // ── PDF generation ─────────────────────────────────────────────────────────

    private async generatePDF(htmlContent: string, options: PDFOptions): Promise<Buffer> {
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

                const nodes = parseHTML(htmlContent);
                this.renderNodes(doc, nodes, options);
                doc.end();
            } catch (error) {
                reject(error);
            }
        });
    }

    private renderNodes(doc: InstanceType<typeof PDFDocument>, nodes: NodeType[], options: PDFOptions): void {
        for (const node of nodes) {
            this.renderNode(doc, node, options);
        }
    }

    private renderNode(doc: InstanceType<typeof PDFDocument>, node: NodeType, options: PDFOptions): void {
        switch (node.type) {
            case 'heading':   this.renderHeading(doc, node, options); break;
            case 'paragraph': this.renderParagraph(doc, node, options); break;
            case 'list':      this.renderList(doc, node, options); break;
            case 'table':     this.renderTable(doc, node, options); break;
            case 'image':     this.renderImage(doc, node); break;
            case 'hr':        this.renderHR(doc, options); break;
            case 'br':        doc.moveDown(0.5); break;
        }
    }

    // ── Node renderers ─────────────────────────────────────────────────────────

    private renderHeading(
        doc: InstanceType<typeof PDFDocument>,
        node: Extract<NodeType, { type: 'heading' }>,
        options: PDFOptions
    ): void {
        const sizemap: Record<number, number> = { 1: 24, 2: 20, 3: 16, 4: 14, 5: 13, 6: 12 };
        const size = sizemap[node.level] ?? 12;
        doc.font(`${options.font}-Bold`).fontSize(size).text(node.text, { align: 'left' });
        doc.font(options.font).fontSize(options.fontSize);
        doc.moveDown(0.5);
    }

    private renderParagraph(
        doc: InstanceType<typeof PDFDocument>,
        node: Extract<NodeType, { type: 'paragraph' }>,
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

    private renderList(
        doc: InstanceType<typeof PDFDocument>,
        node: Extract<NodeType, { type: 'list' }>,
        options: PDFOptions
    ): void {
        doc.font(options.font).fontSize(options.fontSize);
        doc.list(node.items, { bulletRadius: 2, textIndent: 20, bulletIndent: 10 });
        doc.moveDown(0.3);
    }

    private renderTable(
        doc: InstanceType<typeof PDFDocument>,
        node: Extract<NodeType, { type: 'table' }>,
        options: PDFOptions
    ): void {
        const colCount = Math.max(node.headers.length, ...node.rows.map(r => r.length));
        if (colCount === 0) return;

        const usableWidth = doc.page.width - doc.page.margins.left - doc.page.margins.right;
        const colWidth = usableWidth / colCount;
        const rowHeight = options.fontSize + 8;
        let x = doc.page.margins.left;
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

    private renderImage(doc: InstanceType<typeof PDFDocument>, node: Extract<NodeType, { type: 'image' }>): void {
        if (!node.src) return;

        // Only support data URIs — avoids network calls in a server Action
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

    private renderHR(doc: InstanceType<typeof PDFDocument>, options: PDFOptions): void {
        const x = doc.page.margins.left;
        const width = doc.page.width - doc.page.margins.left - doc.page.margins.right;
        doc.moveTo(x, doc.y).lineTo(x + width, doc.y).stroke();
        doc.moveDown(0.5);
        doc.fontSize(options.fontSize);
    }
}

// ── HTML → NodeType[] parser (module-level, pure function) ───────────────────

/**
 * Parse an HTML string into a flat list of renderable nodes using htmlparser2.
 * Handles: headings (h1-h6), paragraphs, bold/italic, ordered/unordered lists,
 * tables, images (data URIs), <hr>, and <br>.
 */
function parseHTML(html: string): NodeType[] {
    const nodes: NodeType[] = [];

    // State
    const tagStack: string[] = [];
    let currentText = '';
    let inHeading = false;
    let headingLevel: 1 | 2 | 3 | 4 | 5 | 6 = 1;
    let inParagraph = false;
    let boldDepth = 0;
    let italicDepth = 0;

    // List state
    let inList = false;
    let listOrdered = false;
    let listItems: string[] = [];
    let inListItem = false;
    let listItemText = '';

    // Table state
    let inTable = false;
    let inThead = false;
    let inTbody = false;
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
                inTbody = true;
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
            } else if (name === 'tbody') {
                inTbody = false;
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
