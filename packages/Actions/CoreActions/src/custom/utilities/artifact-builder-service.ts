/**
 * ArtifactBuilderService — manages in-progress artifact/document state for incremental building.
 *
 * The LLM creates a document handle, then adds content across multiple agent turns.
 * At finalize, the accumulated content is rendered to a binary file (PDF, DOCX, XLSX)
 * using the shared renderer utilities.
 *
 * State is held in-memory via a Map keyed by handle UUID. This works because agent runs
 * execute within a single Node.js process. Handles are cleaned up on finalize/dispose,
 * with a TTL safety net for abandoned runs.
 */
import { marked } from 'marked';
import { PDFOptions, PDFNodeType, DEFAULT_PDF_OPTIONS, renderPDFFromNodes, parseHTML } from './pdf-renderer';
import { WordOptions, DocxSection, DocxContentItem, DEFAULT_WORD_OPTIONS, renderDocxFromSections } from './docx-renderer';
import { SheetInputDefinition, ExcelOptions, renderExcelFromSheets } from './xlsx-renderer';

// ── Types ─────────────────────────────────────────────────────────────────────

export type DocumentType = 'pdf' | 'docx' | 'xlsx';

export interface DocumentOptions {
    pdf?: Partial<PDFOptions>;
    word?: Partial<WordOptions>;
    excel?: Partial<ExcelOptions>;
}

/**
 * A single content operation that can be added to a document.
 * This is the union type that the LLM sends in the Operations parameter.
 */
export type DocumentOperation =
    // Common operations (PDF, DOCX)
    | { type: 'heading'; level: 1 | 2 | 3 | 4 | 5 | 6; text: string }
    | { type: 'paragraph'; text: string; bold?: boolean; italic?: boolean; align?: string }
    | { type: 'table'; headers: string[]; rows: string[][] }
    | { type: 'list'; items: string[]; ordered?: boolean }
    | { type: 'image'; src: string; width?: number; height?: number; caption?: string }
    | { type: 'pageBreak' }
    | { type: 'hr' }
    // Excel-specific
    | { type: 'sheet'; name: string; data: Record<string, unknown>[]; headers?: string[]; columnWidths?: number[] }
    | { type: 'formula'; sheet: string; cell: string; formula: string };

export interface DocumentSectionInfo {
    id: string;
    operations: DocumentOperation[];
}

export interface InProgressDocument {
    handle: string;
    documentType: DocumentType;
    fileName: string;
    options: DocumentOptions;
    sections: DocumentSectionInfo[];
    createdAt: Date;
    lastModifiedAt: Date;
}

export interface DocumentPreview {
    handle: string;
    documentType: DocumentType;
    fileName: string;
    sectionCount: number;
    sections: Array<{
        id: string;
        operationCount: number;
        summary: string;
    }>;
    totalOperations: number;
}

// ── TTL ───────────────────────────────────────────────────────────────────────

const TTL_MS = 30 * 60 * 1000; // 30 minutes
const CLEANUP_INTERVAL_MS = 5 * 60 * 1000; // Check every 5 minutes

// ── Service ───────────────────────────────────────────────────────────────────

/**
 * Singleton service managing in-progress documents.
 * Each document is identified by a UUID handle and persists across agent turns
 * within the same Node.js process.
 */
export class ArtifactBuilderService {
    private static _instance: ArtifactBuilderService | null = null;
    private documents: Map<string, InProgressDocument> = new Map();
    private cleanupTimer: ReturnType<typeof setInterval> | null = null;

    private constructor() {
        this.startCleanupTimer();
    }

    public static get Instance(): ArtifactBuilderService {
        if (!ArtifactBuilderService._instance) {
            ArtifactBuilderService._instance = new ArtifactBuilderService();
        }
        return ArtifactBuilderService._instance;
    }

    // ── Lifecycle ─────────────────────────────────────────────────────────────

    /**
     * Create a new in-progress document and return its handle.
     */
    public CreateDocument(
        documentType: DocumentType,
        fileName?: string,
        options?: DocumentOptions
    ): string {
        const handle = crypto.randomUUID();
        const defaultFileName = this.defaultFileName(documentType);

        const doc: InProgressDocument = {
            handle,
            documentType,
            fileName: fileName || defaultFileName,
            options: options || {},
            sections: [],
            createdAt: new Date(),
            lastModifiedAt: new Date(),
        };

        this.documents.set(handle, doc);
        return handle;
    }

    /**
     * Add content operations as a new section to an existing document.
     * Returns the section ID(s) created.
     */
    public AddContent(handle: string, operations: DocumentOperation[]): string[] {
        const doc = this.getDocument(handle);
        const sectionId = crypto.randomUUID();

        doc.sections.push({ id: sectionId, operations });
        doc.lastModifiedAt = new Date();

        return [sectionId];
    }

    /**
     * Get a preview of the document's current state.
     */
    public GetPreview(handle: string): DocumentPreview {
        const doc = this.getDocument(handle);

        return {
            handle: doc.handle,
            documentType: doc.documentType,
            fileName: doc.fileName,
            sectionCount: doc.sections.length,
            sections: doc.sections.map(s => ({
                id: s.id,
                operationCount: s.operations.length,
                summary: this.summarizeSection(s),
            })),
            totalOperations: doc.sections.reduce((sum, s) => sum + s.operations.length, 0),
        };
    }

    /**
     * Replace a section's content by ID.
     */
    public ReplaceSection(handle: string, sectionId: string, operations: DocumentOperation[]): void {
        const doc = this.getDocument(handle);
        const section = doc.sections.find(s => s.id === sectionId);
        if (!section) {
            throw new Error(`Section "${sectionId}" not found in document "${handle}"`);
        }
        section.operations = operations;
        doc.lastModifiedAt = new Date();
    }

    /**
     * Remove a section by ID.
     */
    public RemoveSection(handle: string, sectionId: string): void {
        const doc = this.getDocument(handle);
        const index = doc.sections.findIndex(s => s.id === sectionId);
        if (index === -1) {
            throw new Error(`Section "${sectionId}" not found in document "${handle}"`);
        }
        doc.sections.splice(index, 1);
        doc.lastModifiedAt = new Date();
    }

    /**
     * Render the accumulated document to a binary buffer.
     * The handle is disposed after finalization.
     */
    public async Finalize(handle: string): Promise<{ buffer: Buffer; fileName: string; mimeType: string }> {
        const doc = this.getDocument(handle);

        if (doc.sections.length === 0) {
            throw new Error(`Cannot finalize an empty document (handle: "${handle}")`);
        }

        const allOperations = doc.sections.flatMap(s => s.operations);
        let buffer: Buffer;
        let mimeType: string;

        switch (doc.documentType) {
            case 'pdf':
                buffer = await this.finalizePDF(allOperations, doc.options.pdf);
                mimeType = 'application/pdf';
                break;
            case 'docx':
                buffer = await this.finalizeDocx(allOperations, doc.options.word);
                mimeType = 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';
                break;
            case 'xlsx':
                buffer = await this.finalizeXlsx(allOperations, doc.options.excel);
                mimeType = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';
                break;
            default:
                throw new Error(`Unsupported document type: ${doc.documentType}`);
        }

        const fileName = doc.fileName;
        this.documents.delete(handle);

        return { buffer, fileName, mimeType };
    }

    /**
     * Dispose a document handle without finalizing.
     */
    public Dispose(handle: string): void {
        this.documents.delete(handle);
    }

    /**
     * Check if a handle exists.
     */
    public HasDocument(handle: string): boolean {
        return this.documents.has(handle);
    }

    // ── Finalization renderers ────────────────────────────────────────────────

    private async finalizePDF(operations: DocumentOperation[], pdfOpts?: Partial<PDFOptions>): Promise<Buffer> {
        const options: PDFOptions = { ...DEFAULT_PDF_OPTIONS, ...pdfOpts };
        const nodes = this.operationsToPDFNodes(operations);
        return renderPDFFromNodes(nodes, options);
    }

    private async finalizeDocx(operations: DocumentOperation[], wordOpts?: Partial<WordOptions>): Promise<Buffer> {
        const options: WordOptions = { ...DEFAULT_WORD_OPTIONS, ...wordOpts };
        const sections = this.operationsToDocxSections(operations);
        return renderDocxFromSections(sections, options);
    }

    private async finalizeXlsx(operations: DocumentOperation[], excelOpts?: Partial<ExcelOptions>): Promise<Buffer> {
        const sheets = this.operationsToSheets(operations);
        if (sheets.length === 0) {
            throw new Error('No sheet operations found. Excel documents require at least one "sheet" operation.');
        }
        const result = await renderExcelFromSheets(sheets, excelOpts || {});
        return result.buffer;
    }

    // ── Operation → renderer format converters ────────────────────────────────

    private operationsToPDFNodes(operations: DocumentOperation[]): PDFNodeType[] {
        const nodes: PDFNodeType[] = [];
        for (const op of operations) {
            switch (op.type) {
                case 'heading':
                    nodes.push({ type: 'heading', level: op.level, text: op.text });
                    break;
                case 'paragraph':
                    nodes.push({ type: 'paragraph', text: op.text, bold: op.bold, italic: op.italic });
                    break;
                case 'table':
                    nodes.push({ type: 'table', headers: op.headers, rows: op.rows });
                    break;
                case 'list':
                    nodes.push({ type: 'list', items: op.items, ordered: op.ordered ?? false });
                    break;
                case 'image':
                    nodes.push({ type: 'image', src: op.src, alt: op.caption });
                    break;
                case 'hr':
                    nodes.push({ type: 'hr' });
                    break;
                case 'pageBreak':
                    // pdfkit doesn't have a direct page break node; use hr as separator
                    nodes.push({ type: 'br' });
                    break;
                // Skip Excel-specific operations in PDF
                case 'sheet':
                case 'formula':
                    break;
            }
        }
        return nodes;
    }

    private operationsToDocxSections(operations: DocumentOperation[]): DocxSection[] {
        const sections: DocxSection[] = [];
        let currentSection: DocxSection = { content: [] };

        for (const op of operations) {
            switch (op.type) {
                case 'heading':
                    // Headings start new sections
                    if (currentSection.heading || (currentSection.content?.length ?? 0) > 0) {
                        sections.push(currentSection);
                    }
                    currentSection = {
                        heading: op.text,
                        level: op.level,
                        content: [],
                    };
                    break;
                case 'paragraph':
                    currentSection.content = currentSection.content ?? [];
                    currentSection.content.push({
                        type: 'paragraph',
                        text: op.text,
                        bold: op.bold,
                        italic: op.italic,
                        align: op.align,
                    });
                    break;
                case 'table':
                    currentSection.content = currentSection.content ?? [];
                    currentSection.content.push({
                        type: 'table',
                        headers: op.headers,
                        rows: op.rows,
                    });
                    break;
                case 'list':
                    currentSection.content = currentSection.content ?? [];
                    currentSection.content.push({
                        type: 'list',
                        items: op.items,
                        ordered: op.ordered ?? false,
                    });
                    break;
                case 'image':
                    currentSection.content = currentSection.content ?? [];
                    currentSection.content.push({
                        type: 'image',
                        url: op.src,
                        width: op.width,
                        height: op.height,
                        caption: op.caption,
                    });
                    break;
                // Skip page breaks, hr, and Excel-specific ops for DOCX
                case 'pageBreak':
                case 'hr':
                case 'sheet':
                case 'formula':
                    break;
            }
        }

        // Push remaining section
        if (currentSection.heading || (currentSection.content?.length ?? 0) > 0) {
            sections.push(currentSection);
        }

        return sections;
    }

    private operationsToSheets(operations: DocumentOperation[]): SheetInputDefinition[] {
        const sheets: SheetInputDefinition[] = [];
        const formulasBySheet: Map<string, Array<{ cell: string; formula: string }>> = new Map();

        // Collect formulas first
        for (const op of operations) {
            if (op.type === 'formula') {
                const existing = formulasBySheet.get(op.sheet) || [];
                existing.push({ cell: op.cell, formula: op.formula });
                formulasBySheet.set(op.sheet, existing);
            }
        }

        // Build sheets
        for (const op of operations) {
            if (op.type === 'sheet') {
                const sheet: SheetInputDefinition = {
                    name: op.name,
                    data: op.data,
                    headers: op.headers,
                    columnWidths: op.columnWidths,
                };
                const formulas = formulasBySheet.get(op.name);
                if (formulas) {
                    sheet.formulas = formulas;
                }
                sheets.push(sheet);
            }
        }

        return sheets;
    }

    // ── Helpers ───────────────────────────────────────────────────────────────

    private getDocument(handle: string): InProgressDocument {
        const doc = this.documents.get(handle);
        if (!doc) {
            throw new Error(`Document handle "${handle}" not found. It may have been finalized or expired.`);
        }
        return doc;
    }

    private defaultFileName(documentType: DocumentType): string {
        switch (documentType) {
            case 'pdf': return 'document.pdf';
            case 'docx': return 'document.docx';
            case 'xlsx': return 'workbook.xlsx';
        }
    }

    private summarizeSection(section: DocumentSectionInfo): string {
        const ops = section.operations;
        if (ops.length === 0) return '(empty)';

        const typeCounts: Record<string, number> = {};
        for (const op of ops) {
            typeCounts[op.type] = (typeCounts[op.type] || 0) + 1;
        }

        const parts = Object.entries(typeCounts).map(([type, count]) =>
            count === 1 ? type : `${count} ${type}s`
        );

        // Include first heading text if present
        const firstHeading = ops.find(op => op.type === 'heading');
        if (firstHeading && firstHeading.type === 'heading') {
            return `"${firstHeading.text}" — ${parts.join(', ')}`;
        }

        return parts.join(', ');
    }

    // ── TTL cleanup ───────────────────────────────────────────────────────────

    private startCleanupTimer(): void {
        this.cleanupTimer = setInterval(() => {
            const now = Date.now();
            for (const [handle, doc] of this.documents) {
                if (now - doc.lastModifiedAt.getTime() > TTL_MS) {
                    this.documents.delete(handle);
                }
            }
        }, CLEANUP_INTERVAL_MS);

        // Don't prevent Node.js from exiting
        if (this.cleanupTimer && typeof this.cleanupTimer === 'object' && 'unref' in this.cleanupTimer) {
            this.cleanupTimer.unref();
        }
    }
}
