import { ActionResultSimple, RunActionParams } from "@memberjunction/actions-base";
import { RegisterClass } from "@memberjunction/global";
import { BaseFileHandlerAction } from "../utilities/base-file-handler";
import { BaseAction } from '@memberjunction/actions';
import { marked } from "marked";
import { JSONParamHelper } from "../utilities/json-param-helper";
import { PDFOptions, DEFAULT_PDF_OPTIONS, renderPDFFromHTML } from "../utilities/pdf-renderer";

/**
 * Action that generates PDF files from HTML or Markdown content.
 * Uses htmlparser2 for proper HTML parsing with support for headings,
 * paragraphs, lists, tables, images, and basic inline styles.
 */
@RegisterClass(BaseAction, "__PDFGenerator")
export class PDFGeneratorAction extends BaseFileHandlerAction {

    protected async InternalRunAction(params: RunActionParams): Promise<ActionResultSimple> {
        try {
            const content = this.getParamValue(params, 'content');
            const contentType = (this.getParamValue(params, 'contenttype') || 'html').toLowerCase();
            const fileName = this.getParamValue(params, 'filename') || 'document.pdf';

            if (!content) {
                return { Success: false, Message: "Content parameter is required", ResultCode: "MISSING_CONTENT" };
            }

            const options = this.buildOptions(params);

            let htmlContent = content.toString();
            if (contentType === 'markdown') {
                htmlContent = await marked(htmlContent) as string;
            }

            const pdfBuffer = await renderPDFFromHTML(htmlContent, options);

            return await this.saveAndReturn(pdfBuffer, fileName, params);

        } catch (error) {
            return {
                Success: false,
                Message: `Failed to generate PDF: ${error instanceof Error ? error.message : String(error)}`,
                ResultCode: "GENERATION_FAILED"
            };
        }
    }

    private buildOptions(params: RunActionParams): PDFOptions {
        const custom = JSONParamHelper.getJSONParam(params, 'options') as Partial<PDFOptions> | null;
        return custom ? { ...DEFAULT_PDF_OPTIONS, ...custom } : { ...DEFAULT_PDF_OPTIONS };
    }

    private async saveAndReturn(
        pdfBuffer: Buffer,
        fileName: string,
        params: RunActionParams
    ): Promise<ActionResultSimple> {
        try {
            const fileId = await this.saveToMJStorage(pdfBuffer, fileName, 'application/pdf', params);
            params.Params.push({ Name: 'FileOutput', Type: 'Output', Value: { fileName, mimeType: 'application/pdf', sizeBytes: pdfBuffer.length, fileId } });
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
        params.Params.push({ Name: 'FileOutput', Type: 'Output', Value: { fileName, mimeType: 'application/pdf', sizeBytes: pdfBuffer.length, fileData: base64Data } });
        return {
            Success: true,
            ResultCode: "SUCCESS",
            Message: JSON.stringify({ message: "PDF generated", fileName, sizeBytes: pdfBuffer.length, base64Length: base64Data.length }, null, 2)
        };
    }
}
