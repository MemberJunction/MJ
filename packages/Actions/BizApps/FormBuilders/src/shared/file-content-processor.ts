import { LogStatus } from '@memberjunction/core';
import pdfParse from 'pdf-parse';
import ExcelJS from 'exceljs';
import mammoth from 'mammoth';

/**
 * File content processing options
 */
export interface FileContentProcessorOptions {
    /** Requested output format: 'auto' (smart detection), 'text', 'base64', 'raw' */
    format?: 'auto' | 'text' | 'base64' | 'raw';
    /** Maximum file size to process (in bytes) */
    maxFileSize?: number;
    /** Whether to include extraction warnings */
    includeWarnings?: boolean;
}

/**
 * Result of file content processing
 */
export interface FileContentProcessorResult {
    /** Processed content */
    content: string;
    /** Detected/processed format */
    format: string;
    /** Original content type */
    contentType: string;
    /** File size in bytes */
    size: number;
    /** Extraction method used */
    extractionMethod: string;
    /** Optional warning message */
    warning?: string;
    /** Processing success status */
    success: boolean;
    /** Error message if processing failed */
    error?: string;
}

/**
 * Reusable file content processor for Form Builders actions
 * Handles intelligent content extraction from various file formats
 */
export class FileContentProcessor {
    private static readonly DEFAULT_MAX_FILE_SIZE = 50 * 1024 * 1024; // 50MB

    /**
     * Process file content based on content type and requested format
     */
    static async processContent(
        buffer: Buffer,
        contentType: string,
        options: FileContentProcessorOptions = {}
    ): Promise<FileContentProcessorResult> {
        try {
            const {
                format = 'auto',
                maxFileSize = this.DEFAULT_MAX_FILE_SIZE,
                includeWarnings = true
            } = options;

            // Check file size
            if (buffer.length > maxFileSize) {
                return {
                    content: '',
                    format: 'error',
                    contentType,
                    size: buffer.length,
                    extractionMethod: 'none',
                    warning: `File too large (${buffer.length} bytes). Maximum allowed: ${maxFileSize} bytes.`,
                    success: false,
                    error: 'File size exceeds limit'
                };
            }

            // Process based on requested format
            if (format === 'raw') {
                return {
                    content: buffer.toString('base64'),
                    format: 'raw',
                    contentType,
                    size: buffer.length,
                    extractionMethod: 'none',
                    success: true
                };
            }

            if (format === 'base64') {
                return {
                    content: buffer.toString('base64'),
                    format: 'base64',
                    contentType,
                    size: buffer.length,
                    extractionMethod: 'none',
                    success: true
                };
            }

            // Auto or text format - intelligent processing
            return await this.intelligentProcessing(buffer, contentType, includeWarnings);

        } catch (error) {
            const errorMessage = error instanceof Error ? error.message : String(error);
            LogStatus(`File content processing failed: ${errorMessage}`);
            
            return {
                content: '',
                format: 'error',
                contentType,
                size: buffer.length,
                extractionMethod: 'none',
                error: errorMessage,
                success: false
            };
        }
    }

    /**
     * Intelligent content extraction based on file type
     */
    private static async intelligentProcessing(
        buffer: Buffer,
        contentType: string,
        includeWarnings: boolean
    ): Promise<FileContentProcessorResult> {
        let content: string;
        let format: string;
        let extractionMethod: string;
        let warning: string | undefined;

        const normalizedContentType = contentType.toLowerCase();

        if (this.isImage(normalizedContentType)) {
            // Images: Return base64 for LLM vision
            format = 'image';
            content = buffer.toString('base64');
            extractionMethod = 'none';

        } else if (this.isTextFormat(normalizedContentType)) {
            // Text formats: Return decoded text
            format = 'text';
            content = buffer.toString('utf8');
            extractionMethod = 'none';

        } else if (this.isPDF(normalizedContentType)) {
            // PDF: Extract text
            try {
                const pdfData = await pdfParse(buffer);
                format = 'text';
                content = pdfData.text;
                extractionMethod = 'pdf-parse';
            } catch (pdfError) {
                format = 'base64';
                content = buffer.toString('base64');
                extractionMethod = 'none';
                warning = 'PDF text extraction failed, returned as base64';
            }

        } else if (this.isExcel(normalizedContentType)) {
            // Excel: Parse to structured text
            try {
                const workbook = new ExcelJS.Workbook();
                await workbook.xlsx.load(buffer as unknown as ExcelJS.Buffer);

                const sheets: Record<string, unknown[]> = {};
                workbook.eachSheet((worksheet) => {
                    const rows: unknown[] = [];
                    worksheet.eachRow((row) => {
                        const rowData: unknown[] = [];
                        row.eachCell((cell) => {
                            rowData.push(cell.value);
                        });
                        rows.push(rowData);
                    });
                    sheets[worksheet.name] = rows;
                });

                format = 'structured';
                content = JSON.stringify(sheets, null, 2);
                extractionMethod = 'excel-parse';
            } catch (excelError) {
                format = 'base64';
                content = buffer.toString('base64');
                extractionMethod = 'none';
                warning = 'Excel parsing failed, returned as base64';
            }

        } else if (this.isWord(normalizedContentType)) {
            // Word: Extract text
            try {
                const result = await mammoth.extractRawText({ buffer });
                format = 'text';
                content = result.value;
                extractionMethod = 'word-extract';
                
                if (result.messages.length > 0) {
                    warning = `Word processing warnings: ${result.messages.map(m => m.message).join(', ')}`;
                }
            } catch (wordError) {
                format = 'base64';
                content = buffer.toString('base64');
                extractionMethod = 'none';
                warning = 'Word text extraction failed, returned as base64';
            }

        } else {
            // Unknown binary: Return base64 with warning
            format = 'binary';
            content = buffer.toString('base64');
            extractionMethod = 'none';
            if (includeWarnings) {
                warning = `Unsupported format '${contentType}' - returned as base64. For LLM consumption, consider converting to text, image, or supported document format.`;
            }
        }

        return {
            content,
            format,
            contentType,
            size: buffer.length,
            extractionMethod,
            warning: includeWarnings ? warning : undefined,
            success: true
        };
    }

    /**
     * Check if content type is an image format
     */
    private static isImage(contentType: string): boolean {
        return contentType.startsWith('image/');
    }

    /**
     * Check if content type is a text-based format
     */
    private static isTextFormat(contentType: string): boolean {
        const textTypes = [
            'text/',
            'application/json',
            'application/xml',
            'application/javascript',
            'application/typescript',
            'application/rtf',
            'text/csv',
            'text/markdown'
        ];
        return textTypes.some(type => contentType.startsWith(type));
    }

    /**
     * Check if content type is PDF
     */
    private static isPDF(contentType: string): boolean {
        return contentType === 'application/pdf';
    }

    /**
     * Check if content type is Excel
     */
    private static isExcel(contentType: string): boolean {
        return contentType === 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' || // xlsx
               contentType === 'application/vnd.ms-excel' || // xls
               contentType === 'application/vnd.ms-excel.sheet.macroEnabled.12'; // xlsm
    }

    /**
     * Check if content type is Word
     */
    private static isWord(contentType: string): boolean {
        return contentType === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' || // docx
               contentType === 'application/msword' || // doc
               contentType === 'application/vnd.ms-word.document.macroEnabled.12'; // docm
    }

    /**
     * Extract filename from URL or Content-Disposition header
     */
    static extractFilename(fileUrl: string, contentDisposition?: string): string {
        // Try to extract from Content-Disposition header first
        if (contentDisposition) {
            const filenameMatch = contentDisposition.match(/filename[^;=\n]*=((['"]).*?\2|[^;\n]*)/);
            if (filenameMatch && filenameMatch[1]) {
                let filename = filenameMatch[1].replace(/['"]/g, '');
                // Handle UTF-8 encoded filenames
                if (filename.startsWith('UTF-8')) {
                    filename = filename.replace(/UTF-8''/, '');
                }
                return filename;
            }
        }

        // Fall back to extracting from URL
        const urlParts = fileUrl.split('/');
        const filename = urlParts[urlParts.length - 1];
        
        // Remove any query parameters and ensure we have a reasonable filename
        const cleanFilename = filename.split('?')[0];
        return cleanFilename || 'download';
    }

    /**
     * Get content format description for easy processing
     */
    static getContentFormat(contentType: string): string {
        const normalizedContentType = contentType.toLowerCase();
        
        if (this.isImage(normalizedContentType)) {
            return 'image';
        } else if (this.isTextFormat(normalizedContentType)) {
            return 'text';
        } else if (this.isPDF(normalizedContentType)) {
            return 'pdf';
        } else if (this.isExcel(normalizedContentType)) {
            return 'spreadsheet';
        } else if (this.isWord(normalizedContentType)) {
            return 'document';
        } else {
            return 'binary';
        }
    }
}
