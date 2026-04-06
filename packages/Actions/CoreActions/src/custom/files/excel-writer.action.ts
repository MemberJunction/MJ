import { ActionResultSimple, RunActionParams } from "@memberjunction/actions-base";
import { RegisterClass } from "@memberjunction/global";
import { BaseFileHandlerAction } from "../utilities/base-file-handler";
import { BaseAction } from '@memberjunction/actions';
import { JSONParamHelper } from "../utilities/json-param-helper";
import { SheetInputDefinition, renderExcelFromSheets } from "../utilities/xlsx-renderer";

/**
 * Action that creates Excel files from JSON data using the MemberJunction export-engine.
 * Supports multiple sheets, formatting, styles, and formulas.
 */
@RegisterClass(BaseAction, "__ExcelWriter")
export class ExcelWriterAction extends BaseFileHandlerAction {

    protected async InternalRunAction(params: RunActionParams): Promise<ActionResultSimple> {
        try {
            let sheets: SheetInputDefinition[];
            try {
                sheets = JSONParamHelper.getRequiredJSONParam(params, 'sheets');
            } catch (error) {
                return {
                    Success: false,
                    Message: error instanceof Error ? error.message : String(error),
                    ResultCode: "MISSING_SHEETS"
                };
            }

            const fileName = this.getParamValue(params, 'filename') || 'workbook.xlsx';
            const author = this.getParamValue(params, 'author');
            const title = this.getParamValue(params, 'title');
            const description = this.getParamValue(params, 'description');

            if (!Array.isArray(sheets) || sheets.length === 0) {
                return {
                    Success: false,
                    Message: "Sheets must be a non-empty array",
                    ResultCode: "INVALID_SHEETS"
                };
            }

            const result = await renderExcelFromSheets(sheets, { fileName, author, title, description });

            // Always attempt to save to MJStorage
            try {
                const fileId = await this.saveToMJStorage(
                    result.buffer,
                    fileName,
                    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
                    params
                );

                params.Params.push({ Name: 'FileOutput', Type: 'Output', Value: { fileName, mimeType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', sizeBytes: result.buffer.length, fileId } });

                return {
                    Success: true,
                    ResultCode: "SUCCESS_SAVED",
                    Message: JSON.stringify({
                        message: "Excel file generated and saved successfully",
                        fileId,
                        fileName,
                        sheets: result.sheetCount,
                        totalRows: result.rowCount,
                        sizeBytes: result.sizeBytes
                    }, null, 2)
                };
            } catch (error) {
                console.error('Failed to save to storage, returning base64:', error);
            }

            // Fallback: return as base64
            const base64Data = result.buffer.toString('base64');
            params.Params.push({ Name: 'FileOutput', Type: 'Output', Value: { fileName, mimeType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', sizeBytes: result.buffer.length, fileData: base64Data } });

            return {
                Success: true,
                ResultCode: "SUCCESS",
                Message: JSON.stringify({
                    message: "Excel file generated successfully",
                    fileName,
                    sheets: result.sheetCount,
                    totalRows: result.rowCount,
                    sizeBytes: result.sizeBytes,
                    base64Length: base64Data.length
                }, null, 2)
            };

        } catch (error) {
            return {
                Success: false,
                Message: `Failed to create Excel file: ${error instanceof Error ? error.message : String(error)}`,
                ResultCode: "CREATION_FAILED"
            };
        }
    }
}
