/**
 * Extracts text content from document files (PDF, Excel, Word) for LLM context.
 *
 * Used by ConversationUtility.BuildChatMessageContent() to give agents
 * structured text alongside the raw file_url block. This ensures agents
 * can reason about document content even when the model doesn't support
 * native document reading.
 *
 * Libraries are lazy-loaded to avoid pulling them in when not needed.
 */
export class FileContentExtractor {

    /**
     * Extract text content from a document file.
     *
     * @param content - Base64-encoded file content (with or without data URL prefix)
     * @param mimeType - MIME type of the file
     * @param fileName - Optional filename for header context
     * @returns Structured text suitable for LLM context, or empty string if unsupported
     */
    public static async Extract(content: string, mimeType: string, fileName?: string): Promise<string> {
        const base64 = this.stripDataUrlPrefix(content);
        if (!base64) return '';

        switch (mimeType) {
            case 'application/pdf':
                return this.extractPdf(base64, fileName);
            case 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet':
                return this.extractExcel(base64, fileName);
            case 'application/vnd.openxmlformats-officedocument.wordprocessingml.document':
                return this.extractDocx(base64, fileName);
            default:
                return '';
        }
    }

    /**
     * Check whether the given MIME type is supported for text extraction.
     */
    public static IsSupported(mimeType: string): boolean {
        return [
            'application/pdf',
            'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
            'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
        ].includes(mimeType);
    }

    private static stripDataUrlPrefix(content: string): string {
        if (content.startsWith('data:')) {
            const commaIndex = content.indexOf(',');
            return commaIndex >= 0 ? content.slice(commaIndex + 1) : content;
        }
        return content;
    }

    private static async extractPdf(base64: string, fileName?: string): Promise<string> {
        try {
            const pdfjsLib = await import('pdfjs-dist/legacy/build/pdf.mjs');
            const buffer = Buffer.from(base64, 'base64');
            const pdfDoc = await pdfjsLib.getDocument({ data: new Uint8Array(buffer) }).promise;

            const pageTexts: string[] = [];
            for (let i = 1; i <= pdfDoc.numPages; i++) {
                const page = await pdfDoc.getPage(i);
                const textContent = await page.getTextContent();
                const text = textContent.items
                    .filter((item: Record<string, unknown>) => 'str' in item)
                    .map((item: Record<string, unknown>) => item.str as string)
                    .join(' ')
                    .trim();
                if (text) pageTexts.push(text);
            }

            pdfDoc.destroy();

            const header = `[PDF: ${fileName || 'document.pdf'}, ${pdfDoc.numPages} page${pdfDoc.numPages !== 1 ? 's' : ''}]`;
            return `${header}\n\n${pageTexts.join('\n\n')}`;
        } catch (err) {
            console.error('[FileContentExtractor] PDF extraction failed:', err);
            return '';
        }
    }

    private static async extractExcel(base64: string, fileName?: string): Promise<string> {
        try {
            const XLSX = await import('xlsx');
            const buffer = Buffer.from(base64, 'base64');
            const workbook = XLSX.read(buffer, { type: 'buffer' });

            const parts: string[] = [];
            const header = `[Excel: ${fileName || 'spreadsheet.xlsx'}, ${workbook.SheetNames.length} sheet${workbook.SheetNames.length !== 1 ? 's' : ''}]`;
            parts.push(header);

            for (const sheetName of workbook.SheetNames) {
                const sheet = workbook.Sheets[sheetName];
                const csv = XLSX.utils.sheet_to_csv(sheet);
                parts.push(`## Sheet: ${sheetName}\n\n${csv}`);
            }

            return parts.join('\n\n');
        } catch (err) {
            console.error('[FileContentExtractor] Excel extraction failed:', err);
            return '';
        }
    }

    private static async extractDocx(base64: string, fileName?: string): Promise<string> {
        try {
            const mammoth = await import('mammoth');
            const buffer = Buffer.from(base64, 'base64');
            const result = await mammoth.extractRawText({ buffer });

            const header = `[Word: ${fileName || 'document.docx'}]`;
            return `${header}\n\n${result.value}`;
        } catch (err) {
            console.error('[FileContentExtractor] Word extraction failed:', err);
            return '';
        }
    }
}
