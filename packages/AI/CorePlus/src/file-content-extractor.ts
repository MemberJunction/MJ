/**
 * Extracts text content from document files (PDF, Excel, Word) for LLM context.
 *
 * Used by ConversationUtility.BuildChatMessageContent() to give agents
 * structured text alongside the raw file_url block. This ensures agents
 * can reason about document content even when the model doesn't support
 * native document reading.
 *
 * For large documents that exceed EXTRACTION_CHAR_LIMIT, the text is
 * structurally truncated: all headings are preserved with the first
 * ~1000 chars of each section body, keeping the document's organization
 * intact while fitting within model context limits.
 *
 * Libraries are lazy-loaded to avoid pulling them in when not needed.
 */

/**
 * Maximum character length for extracted text before structured truncation kicks in.
 * ~40K chars ≈ ~10K tokens, leaving room for conversation history.
 */
const EXTRACTION_CHAR_LIMIT = 40_000;

/**
 * Maximum characters to keep per section body when truncating.
 */
const CHARS_PER_SECTION = 1_000;

export class FileContentExtractor {

    /**
     * Extract text content from a document file.
     * If the extracted text exceeds EXTRACTION_CHAR_LIMIT, the document is
     * structurally truncated: headings are preserved with abbreviated section bodies.
     *
     * @param content - Base64-encoded file content (with or without data URL prefix)
     * @param mimeType - MIME type of the file
     * @param fileName - Optional filename for header context
     * @returns Structured text suitable for LLM context, or empty string if unsupported
     */
    public static async Extract(
        content: string,
        mimeType: string,
        fileName?: string
    ): Promise<string> {
        const base64 = this.stripDataUrlPrefix(content);
        if (!base64) return '';

        let rawText: string;
        switch (mimeType) {
            case 'application/pdf':
                rawText = await this.extractPdf(base64, fileName);
                break;
            case 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet':
                rawText = await this.extractExcel(base64, fileName);
                break;
            case 'application/vnd.openxmlformats-officedocument.wordprocessingml.document':
                rawText = await this.extractDocx(base64, fileName);
                break;
            default:
                return '';
        }

        if (!rawText) return '';

        // If within limits, return as-is
        if (rawText.length <= EXTRACTION_CHAR_LIMIT) {
            return rawText;
        }

        // Large document — structurally truncate preserving headings
        return this.structuralTruncate(rawText, fileName);
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
            const sheetCount = workbook.SheetNames.length;
            const header = `[Excel: ${fileName || 'spreadsheet.xlsx'}, ${sheetCount} sheet${sheetCount !== 1 ? 's' : ''}]`;
            parts.push(header);

            // Budget chars across sheets, reserving space for headers
            const budgetPerSheet = Math.floor((EXTRACTION_CHAR_LIMIT - 500) / sheetCount);

            for (const sheetName of workbook.SheetNames) {
                const sheet = workbook.Sheets[sheetName];
                const csv = XLSX.utils.sheet_to_csv(sheet);
                const rows = csv.split('\n');
                const totalRows = rows.length;

                if (csv.length <= budgetPerSheet) {
                    // Fits within budget — include all rows
                    parts.push(`## Sheet: ${sheetName} (${totalRows} rows)\n\n${csv}`);
                } else {
                    // Truncate: keep header row + as many data rows as fit
                    let truncated = '';
                    let rowCount = 0;
                    for (const row of rows) {
                        if (truncated.length + row.length + 1 > budgetPerSheet) break;
                        truncated += (truncated ? '\n' : '') + row;
                        rowCount++;
                    }
                    parts.push(`## Sheet: ${sheetName} (showing ${rowCount} of ${totalRows} rows)\n\n${truncated}\n[...${totalRows - rowCount} more rows truncated]`);
                }
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

    /**
     * Structurally truncate a large document while preserving all headings
     * and the first ~CHARS_PER_SECTION characters of each section body.
     *
     * Headings are detected as lines that look like chapter/section titles:
     * - Lines starting with "Chapter", "#", or numbered patterns like "1.1"
     * - Short lines (under 100 chars) preceded by a blank line
     */
    private static structuralTruncate(rawText: string, fileName: string | undefined): string {
        // Extract the header line (e.g., "[PDF: file.pdf, 38 pages]")
        const firstNewline = rawText.indexOf('\n');
        const docHeader = firstNewline > 0 ? rawText.slice(0, firstNewline).trim() : '';
        const body = firstNewline > 0 ? rawText.slice(firstNewline + 1).trim() : rawText;

        const sections = this.splitIntoSections(body);
        const totalChars = body.length;
        const parts: string[] = [];

        for (const section of sections) {
            // Always keep the heading
            parts.push(section.heading);

            // Truncate the body if needed
            if (section.body.length <= CHARS_PER_SECTION) {
                if (section.body) parts.push(section.body);
            } else {
                parts.push(section.body.slice(0, CHARS_PER_SECTION) + '\n[...truncated]');
            }
        }

        const truncatedBody = parts.join('\n\n');
        const notice = `[Document truncated for context — showing headings + excerpts from ${totalChars.toLocaleString()} characters. Ask about specific sections for full detail.]`;
        return `${docHeader}\n${notice}\n\n${truncatedBody}`;
    }

    /**
     * Split document text into sections based on heading detection.
     * Returns array of { heading, body } pairs.
     */
    private static splitIntoSections(text: string): Array<{ heading: string; body: string }> {
        const lines = text.split('\n');
        const sections: Array<{ heading: string; body: string }> = [];
        let currentHeading = '';
        let currentBody: string[] = [];

        for (let i = 0; i < lines.length; i++) {
            const line = lines[i];
            const trimmed = line.trim();

            if (this.isHeading(trimmed, i > 0 ? lines[i - 1]?.trim() : '')) {
                // Save previous section
                if (currentHeading || currentBody.length > 0) {
                    sections.push({
                        heading: currentHeading,
                        body: currentBody.join('\n').trim()
                    });
                }
                currentHeading = trimmed;
                currentBody = [];
            } else {
                currentBody.push(line);
            }
        }

        // Save last section
        if (currentHeading || currentBody.length > 0) {
            sections.push({
                heading: currentHeading,
                body: currentBody.join('\n').trim()
            });
        }

        return sections;
    }

    /**
     * Detect whether a line is likely a heading/title.
     */
    private static isHeading(line: string, previousLine: string): boolean {
        if (!line || line.length > 120) return false;

        // Markdown headings
        if (/^#{1,4}\s/.test(line)) return true;

        // "Chapter N" patterns
        if (/^chapter\s+\d/i.test(line)) return true;

        // Numbered section patterns: "1.1", "2.3.1", etc.
        if (/^\d+\.\d+/.test(line) && line.length < 100) return true;

        // ALL CAPS lines (common heading style) preceded by blank line
        if (previousLine === '' && line.length < 80 && line === line.toUpperCase() && /[A-Z]/.test(line)) return true;

        // Short line preceded by blank line that starts with a capital letter
        // and doesn't end with typical sentence-ending punctuation
        if (previousLine === '' && line.length < 80 && /^[A-Z]/.test(line) && !/[.!?:,;]$/.test(line)) return true;

        return false;
    }
}
