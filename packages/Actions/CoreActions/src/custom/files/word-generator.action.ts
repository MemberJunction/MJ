import { ActionResultSimple, RunActionParams } from "@memberjunction/actions-base";
import { RegisterClass } from "@memberjunction/global";
import { BaseFileHandlerAction } from "../utilities/base-file-handler";
import { BaseAction } from '@memberjunction/actions';
import { marked } from "marked";
import { JSONParamHelper } from "../utilities/json-param-helper";
import {
    WordOptions,
    DocxSection,
    DEFAULT_WORD_OPTIONS,
    renderDocxFromSections,
    normalizeSections,
    htmlToSections,
} from "../utilities/docx-renderer";

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
            const options = this.buildOptions(params);

            const sections = await this.resolveSections(params, contentType);
            if (!sections) {
                return { Success: false, Message: "No content provided. Supply Sections, or Content with ContentType 'markdown'/'html'.", ResultCode: "MISSING_CONTENT" };
            }

            const docxBuffer = await renderDocxFromSections(sections, options);

            return await this.saveAndReturn(docxBuffer, fileName, params);

        } catch (error) {
            return {
                Success: false,
                Message: `Failed to generate Word document: ${error instanceof Error ? error.message : String(error)}`,
                ResultCode: "GENERATION_FAILED"
            };
        }
    }

    private buildOptions(params: RunActionParams): WordOptions {
        const custom = JSONParamHelper.getJSONParam(params, 'options') as Partial<WordOptions> | null;
        return custom ? { ...DEFAULT_WORD_OPTIONS, ...custom } : { ...DEFAULT_WORD_OPTIONS };
    }

    private async resolveSections(
        params: RunActionParams,
        contentType: string
    ): Promise<DocxSection[] | null> {
        const sectionsParam = JSONParamHelper.getJSONParam(params, 'sections');
        if (sectionsParam) {
            if (Array.isArray(sectionsParam)) return normalizeSections(sectionsParam as Record<string, unknown>[]);
            const structured = sectionsParam as { sections?: Record<string, unknown>[] };
            if (structured.sections) return normalizeSections(structured.sections);
        }

        const content = this.getParamValue(params, 'content');
        if (content) {
            const html = contentType === 'markdown'
                ? await marked(content.toString()) as string
                : content.toString();
            return htmlToSections(html);
        }

        return null;
    }

    private async saveAndReturn(
        buffer: Buffer,
        fileName: string,
        params: RunActionParams
    ): Promise<ActionResultSimple> {
        try {
            const fileId = await this.saveToMJStorage(buffer, fileName,
                'application/vnd.openxmlformats-officedocument.wordprocessingml.document', params);
            params.Params.push({ Name: 'FileOutput', Type: 'Output', Value: { fileName, mimeType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document', sizeBytes: buffer.length, fileId } });
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
        params.Params.push({ Name: 'FileOutput', Type: 'Output', Value: { fileName, mimeType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document', sizeBytes: buffer.length, fileData: base64Data } });
        return {
            Success: true, ResultCode: "SUCCESS",
            Message: JSON.stringify({ message: "Word document generated", fileName, sizeBytes: buffer.length, base64Length: base64Data.length }, null, 2)
        };
    }
}
