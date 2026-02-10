import { ActionResultSimple, RunActionParams } from "@memberjunction/actions-base";
import { RegisterClass } from "@memberjunction/global";
import { BaseFileHandlerAction } from "../utilities/base-file-handler";
import * as PDFDocument from "pdfkit";
import { marked } from "marked";
import { JSONParamHelper } from "../utilities/json-param-helper";
import { BaseAction } from '@memberjunction/actions';

/**
 * Action that generates PDF files from HTML or Markdown content
 * Supports various formatting options and can save to MJ Storage
 * 
 * @example
 * ```typescript
 * // Generate PDF from Markdown
 * await runAction({
 *   ActionName: 'PDF Generator',
 *   Params: [{
 *     Name: 'Content',
 *     Value: '# Report Title\n\nThis is the report content...'
 *   }, {
 *     Name: 'ContentType',
 *     Value: 'markdown'
 *   }]
 * });
 * 
 * // Generate PDF from HTML with custom options
 * await runAction({
 *   ActionName: 'PDF Generator',
 *   Params: [{
 *     Name: 'Content',
 *     Value: '<h1>Report</h1><p>Content here...</p>'
 *   }, {
 *     Name: 'Options',
 *     Value: {
 *       margin: { top: 50, bottom: 50, left: 72, right: 72 },
 *       fontSize: 12,
 *       font: 'Helvetica'
 *     }
 *   }]
 * });
 * ```
 */
@RegisterClass(BaseAction, "PDF Generator")
export class PDFGeneratorAction extends BaseFileHandlerAction {
    
    /**
     * Generates a PDF from HTML or Markdown content
     * 
     * @param params - The action parameters containing:
     *   - Content: HTML or Markdown string to convert to PDF
     *   - ContentType: "html" | "markdown" (default: "html")
     *   - Options: PDF generation options object containing:
     *     - margin: { top, bottom, left, right } in points (default: 72)
     *     - fontSize: Base font size (default: 12)
     *     - font: Font family (default: 'Helvetica')
     *     - orientation: 'portrait' | 'landscape' (default: 'portrait')
     *     - size: Paper size like 'A4', 'Letter', etc. (default: 'Letter')
     *   - OutputFileID: Optional MJ Storage file ID to save to
     *   - FileName: Name for the generated PDF (default: 'document.pdf')
     * 
     * @returns Base64 encoded PDF data or FileID if saved to storage
     */
    protected async InternalRunAction(params: RunActionParams): Promise<ActionResultSimple> {
        try {
            // Extract parameters
            const content = this.getParamValue(params, 'content');
            const contentType = (this.getParamValue(params, 'contenttype') || 'html').toLowerCase();
            const outputFileId = this.getParamValue(params, 'outputfileid');
            const fileName = this.getParamValue(params, 'filename') || 'document.pdf';

            // Validate content
            if (!content) {
                return {
                    Success: false,
                    Message: "Content parameter is required",
                    ResultCode: "MISSING_CONTENT"
                };
            }

            // Parse options
            let options: any = {
                margin: { top: 72, bottom: 72, left: 72, right: 72 },
                fontSize: 12,
                font: 'Helvetica',
                orientation: 'portrait',
                size: 'Letter'
            };

            const customOptions = JSONParamHelper.getJSONParam(params, 'options');
            if (customOptions) {
                options = { ...options, ...customOptions };
            }

            // Convert content if needed
            let htmlContent = content.toString();
            if (contentType === 'markdown') {
                // Convert markdown to HTML
                htmlContent = await marked(htmlContent);
            }

            // Generate PDF
            const pdfBuffer = await this.generatePDF(htmlContent, options);

            // Save to storage if requested
            if (outputFileId) {
                try {
                    const fileId = await this.saveToMJStorage(
                        pdfBuffer,
                        fileName,
                        'application/pdf',
                        params
                    );
                    
                    // Add output parameter
                    params.Params.push({
                        Name: 'GeneratedFileID',
                        Type: 'Output',
                        Value: fileId
                    });

                    return {
                        Success: true,
                        ResultCode: "SUCCESS_SAVED",
                        Message: JSON.stringify({
                            message: "PDF generated and saved successfully",
                            fileId: fileId,
                            fileName: fileName,
                            sizeBytes: pdfBuffer.length
                        }, null, 2)
                    };
                } catch (error) {
                    // If save fails, still return the PDF data
                    console.error('Failed to save to storage:', error);
                }
            }

            // Return as base64
            const base64Data = pdfBuffer.toString('base64');
            
            // Add output parameter
            params.Params.push({
                Name: 'PDFData',
                Type: 'Output',
                Value: base64Data
            });

            return {
                Success: true,
                ResultCode: "SUCCESS",
                Message: JSON.stringify({
                    message: "PDF generated successfully",
                    fileName: fileName,
                    sizeBytes: pdfBuffer.length,
                    base64Length: base64Data.length
                }, null, 2)
            };

        } catch (error) {
            return {
                Success: false,
                Message: `Failed to generate PDF: ${error instanceof Error ? error.message : String(error)}`,
                ResultCode: "GENERATION_FAILED"
            };
        }
    }

    /**
     * Generate PDF from HTML content
     */
    private async generatePDF(htmlContent: string, options: any): Promise<Buffer> {
        return new Promise((resolve, reject) => {
            try {
                // Create PDF document
                const doc = new PDFDocument({
                    size: options.size,
                    layout: options.orientation,
                    margins: options.margin,
                    info: {
                        Title: 'Generated Document',
                        Author: 'MemberJunction',
                        Creator: 'PDF Generator Action'
                    }
                });

                // Collect PDF data
                const chunks: Buffer[] = [];
                doc.on('data', (chunk) => chunks.push(chunk));
                doc.on('end', () => resolve(Buffer.concat(chunks as unknown as Uint8Array[])));
                doc.on('error', reject);

                // Set default font
                doc.font(options.font || 'Helvetica');
                doc.fontSize(options.fontSize || 12);

                // Parse and render HTML (simplified - real implementation would need proper HTML parsing)
                const lines = this.parseHTMLToLines(htmlContent);
                
                for (const line of lines) {
                    if (line.type === 'heading') {
                        doc.fontSize(line.size || 16).text(line.text, { 
                            align: line.align || 'left',
                            continued: false 
                        });
                        doc.fontSize(options.fontSize || 12);
                    } else if (line.type === 'paragraph') {
                        doc.text(line.text, { 
                            align: line.align || 'left',
                            continued: false 
                        });
                    } else if (line.type === 'list') {
                        doc.list([line.text], { 
                            bulletRadius: 2,
                            textIndent: 20,
                            bulletIndent: 10
                        });
                    }
                    
                    // Add spacing between elements
                    doc.moveDown(0.5);
                }

                // Finalize PDF
                doc.end();
            } catch (error) {
                reject(error);
            }
        });
    }

    /**
     * Simple HTML parser (for demonstration - real implementation would use proper HTML parser)
     */
    private parseHTMLToLines(html: string): any[] {
        const lines: any[] = [];
        
        // Remove HTML tags but preserve structure
        const text = html
            .replace(/<h1[^>]*>(.*?)<\/h1>/gi, (match, content) => {
                lines.push({ type: 'heading', text: content.trim(), size: 24 });
                return '';
            })
            .replace(/<h2[^>]*>(.*?)<\/h2>/gi, (match, content) => {
                lines.push({ type: 'heading', text: content.trim(), size: 20 });
                return '';
            })
            .replace(/<h3[^>]*>(.*?)<\/h3>/gi, (match, content) => {
                lines.push({ type: 'heading', text: content.trim(), size: 16 });
                return '';
            })
            .replace(/<p[^>]*>(.*?)<\/p>/gi, (match, content) => {
                lines.push({ type: 'paragraph', text: content.trim() });
                return '';
            })
            .replace(/<li[^>]*>(.*?)<\/li>/gi, (match, content) => {
                lines.push({ type: 'list', text: content.trim() });
                return '';
            })
            .replace(/<br\s*\/?>/gi, '\n')
            .replace(/<[^>]+>/g, '');

        // Add any remaining text
        const remainingText = text.trim();
        if (remainingText) {
            lines.push({ type: 'paragraph', text: remainingText });
        }

        return lines;
    }
}