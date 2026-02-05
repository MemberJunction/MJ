import { ActionResultSimple, RunActionParams, ActionParam } from "@memberjunction/actions-base";
import { RegisterClass } from "@memberjunction/global";
import { BaseAction } from "@memberjunction/actions";
import { BaseFileStorageAction } from "./base-file-storage.action";
import pdfParse from 'pdf-parse';
import mammoth from 'mammoth';
import * as ExcelJS from 'exceljs';

/**
 * Smart file content retrieval action that automatically handles content extraction
 * based on file type. Returns LLM-ready content (text for documents, base64 for images).
 *
 * This action combines file download with intelligent content extraction:
 * - Text formats (txt, md, html, json, csv) → Returns plain text
 * - Images (png, jpg, gif, webp) → Returns base64 for LLM vision
 * - PDFs → Extracts text using pdf-parse
 * - Excel files → Converts to structured JSON/CSV text
 * - Word documents → Extracts text using mammoth
 * - Binary files → Returns base64 with warning
 *
 * @example
 * ```typescript
 * // Get PDF content (auto-extracts text)
 * await runAction({
 *   ActionName: 'File Storage: Get File Content',
 *   Params: [{
 *     Name: 'StorageAccount',
 *     Value: 'Box'
 *   }, {
 *     Name: 'ObjectID',
 *     Value: '347751234567'
 *   }]
 * });
 * // Returns: { Format: "text", Content: "extracted text...", ExtractionMethod: "pdf-parse" }
 *
 * // Get image content (returns base64)
 * await runAction({
 *   ActionName: 'File Storage: Get File Content',
 *   Params: [{
 *     Name: 'StorageAccount',
 *     Value: 'Google Drive'
 *   }, {
 *     Name: 'ObjectName',
 *     Value: 'screenshots/diagram.png'
 *   }]
 * });
 * // Returns: { Format: "image", Content: "base64...", ExtractionMethod: "none" }
 * ```
 */
@RegisterClass(BaseAction, "File Storage: Get File Content")
export class GetFileContentAction extends BaseFileStorageAction {

    /**
     * Retrieve file content with automatic extraction based on file type
     *
     * @param params - The action parameters:
     *   - StorageAccount: Required - Name of the storage provider
     *   - ObjectName: Required if ObjectID not provided - Name/path of the object
     *   - ObjectID: Optional - Provider-specific object ID (bypasses path resolution)
     *
     * @returns Operation result with:
     *   - ContentType: Original MIME type of the file
     *   - Format: "text" | "image" | "structured" | "binary"
     *   - Content: Extracted/converted content ready for LLM
     *   - Size: Original file size in bytes
     *   - ExtractionMethod: Method used ("none" | "pdf-parse" | "excel-parse" | "word-extract")
     *   - Warning: Optional warning for unsupported formats
     */
    protected async InternalRunAction(params: RunActionParams): Promise<ActionResultSimple> {
        try {
            // Get and initialize storage driver
            const { driver, error } = await this.getDriverFromParams(params);
            if (error) return error;

            // Get identifier (prefer ObjectID for performance)
            const objectId = this.getStringParam(params, 'objectid');
            const objectName = this.getStringParam(params, 'objectname');

            if (!objectId && !objectName) {
                return this.createErrorResult(
                    "Either ObjectName or ObjectID parameter is required",
                    "MISSING_IDENTIFIER"
                );
            }

            // Get file metadata to determine content type
            const metadata = await driver!.GetObjectMetadata({
                objectId: objectId || undefined,
                fullPath: objectName || undefined
            });

            // Download file content
            const buffer = await driver!.GetObject({
                objectId: objectId || undefined,
                fullPath: objectName || undefined
            });

            // Route based on content type
            const contentType = metadata.contentType.toLowerCase();
            let format: string;
            let content: string;
            let extractionMethod: string;
            let warning: string | undefined;

            // Check file type and extract accordingly
            if (this.isImage(contentType)) {
                // Images: Return base64 for LLM vision
                format = "image";
                content = buffer.toString('base64');
                extractionMethod = "none";

            } else if (this.isTextFormat(contentType)) {
                // Text formats: Return decoded text
                format = "text";
                content = buffer.toString('utf8');
                extractionMethod = "none";

            } else if (this.isPDF(contentType)) {
                // PDF: Extract text
                const pdfData = await pdfParse(buffer);
                format = "text";
                content = pdfData.text;
                extractionMethod = "pdf-parse";

            } else if (this.isExcel(contentType)) {
                // Excel: Parse to structured text
                const workbook = new ExcelJS.Workbook();
                await workbook.xlsx.load(buffer);

                const sheets: Record<string, unknown[]> = {};
                workbook.eachSheet((worksheet, sheetId) => {
                    const rows: unknown[] = [];
                    worksheet.eachRow((row, rowNumber) => {
                        const rowData: unknown[] = [];
                        row.eachCell((cell, colNumber) => {
                            rowData.push(cell.value);
                        });
                        rows.push(rowData);
                    });
                    sheets[worksheet.name] = rows;
                });

                format = "structured";
                content = JSON.stringify(sheets, null, 2);
                extractionMethod = "excel-parse";

            } else if (this.isWord(contentType)) {
                // Word: Extract text
                const result = await mammoth.extractRawText({ buffer });
                format = "text";
                content = result.value;
                extractionMethod = "word-extract";

            } else {
                // Unknown binary: Return base64 with warning
                format = "binary";
                content = buffer.toString('base64');
                extractionMethod = "none";
                warning = `Unsupported format '${contentType}' - returned as base64. For LLM consumption, consider converting to text, image, or supported document format.`;
            }

            // Build output parameters
            const outputParams: ActionParam[] = [
                { Name: 'ContentType', Value: metadata.contentType, Type: 'Output' },
                { Name: 'Format', Value: format, Type: 'Output' },
                { Name: 'Content', Value: content, Type: 'Output' },
                { Name: 'Size', Value: metadata.size, Type: 'Output' },
                { Name: 'ExtractionMethod', Value: extractionMethod, Type: 'Output' }
            ];

            if (warning) {
                outputParams.push({ Name: 'Warning', Value: warning, Type: 'Output' });
            }

            return {
                Success: true,
                ResultCode: "SUCCESS",
                Message: `Retrieved ${metadata.name} (${format} format, ${extractionMethod !== 'none' ? 'extracted using ' + extractionMethod : 'no extraction needed'})`,
                Params: outputParams
            };

        } catch (error) {
            return this.createErrorResult(
                `Get file content failed: ${error instanceof Error ? error.message : String(error)}`,
                "OPERATION_FAILED"
            );
        }
    }

    /**
     * Check if content type is an image format
     */
    private isImage(contentType: string): boolean {
        return contentType.startsWith('image/');
    }

    /**
     * Check if content type is a text-based format
     */
    private isTextFormat(contentType: string): boolean {
        const textTypes = [
            'text/',
            'application/json',
            'application/xml',
            'application/javascript',
            'application/typescript'
        ];
        return textTypes.some(type => contentType.startsWith(type));
    }

    /**
     * Check if content type is PDF
     */
    private isPDF(contentType: string): boolean {
        return contentType === 'application/pdf';
    }

    /**
     * Check if content type is Excel
     */
    private isExcel(contentType: string): boolean {
        return contentType === 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' || // xlsx
               contentType === 'application/vnd.ms-excel'; // xls
    }

    /**
     * Check if content type is Word
     */
    private isWord(contentType: string): boolean {
        return contentType === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' || // docx
               contentType === 'application/msword'; // doc
    }
}

export function LoadGetFileContentAction() {
    // Stub function to prevent tree shaking
}
