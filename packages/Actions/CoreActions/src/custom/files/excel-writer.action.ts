import { ActionResultSimple, RunActionParams } from "@memberjunction/actions-base";
import { RegisterClass } from "@memberjunction/global";
import { BaseFileHandlerAction } from "../utilities/base-file-handler";
import * as ExcelJS from "exceljs";
import { JSONParamHelper } from "../utilities/json-param-helper";
import { BaseAction } from '@memberjunction/actions';

/**
 * Action that creates Excel files from JSON data
 * Supports multiple sheets, formatting, and formulas
 * 
 * @example
 * ```typescript
 * // Create simple Excel with one sheet
 * await runAction({
 *   ActionName: 'Excel Writer',
 *   Params: [{
 *     Name: 'Sheets',
 *     Value: [{
 *       name: 'Sales Data',
 *       data: [
 *         { Product: 'Widget A', Sales: 100, Revenue: 1000 },
 *         { Product: 'Widget B', Sales: 150, Revenue: 1500 }
 *       ]
 *     }]
 *   }]
 * });
 * 
 * // Create Excel with multiple sheets and formatting
 * await runAction({
 *   ActionName: 'Excel Writer',
 *   Params: [{
 *     Name: 'Sheets',
 *     Value: [{
 *       name: 'Q1 Sales',
 *       data: salesData,
 *       headers: ['Product', 'Units', 'Revenue'],
 *       columnWidths: [20, 10, 15],
 *       styles: {
 *         headerStyle: { font: { bold: true }, fill: { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF4472C4' } } }
 *       }
 *     }, {
 *       name: 'Summary',
 *       data: summaryData
 *     }]
 *   }]
 * });
 * ```
 */
@RegisterClass(BaseAction, "Excel Writer")
export class ExcelWriterAction extends BaseFileHandlerAction {
    
    /**
     * Creates Excel files from JSON data
     * 
     * @param params - The action parameters containing:
     *   - Sheets: Array of sheet definitions, each containing:
     *     - name: Sheet name (required)
     *     - data: Array of data rows (required)
     *     - headers: Array of column headers (optional, derived from data if not provided)
     *     - columnWidths: Array of column widths in characters (optional)
     *     - styles: Object with style definitions (optional)
     *     - formulas: Array of formula definitions (optional)
     *   - OutputFileID: Optional MJ Storage file ID to save to
     *   - FileName: Name for the generated Excel file (default: 'workbook.xlsx')
     *   - Author: Author metadata (optional)
     *   - Title: Title metadata (optional)
     *   - Description: Description metadata (optional)
     * 
     * @returns Base64 encoded Excel data or FileID if saved
     */
    protected async InternalRunAction(params: RunActionParams): Promise<ActionResultSimple> {
        try {
            // Extract parameters
            let sheets: any[];
            try {
                sheets = JSONParamHelper.getRequiredJSONParam(params, 'sheets');
            } catch (error) {
                return {
                    Success: false,
                    Message: error instanceof Error ? error.message : String(error),
                    ResultCode: "MISSING_SHEETS"
                };
            }
            
            const outputFileId = this.getParamValue(params, 'outputfileid');
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

            // Create workbook
            const workbook = new ExcelJS.Workbook();
            
            // Set metadata
            workbook.creator = author || 'MemberJunction';
            workbook.created = new Date();
            workbook.modified = new Date();
            if (title) workbook.title = title;
            if (description) workbook.description = description;

            // Add sheets
            let totalRows = 0;
            let totalColumns = 0;

            for (const sheetDef of sheets) {
                if (!sheetDef.name || !sheetDef.data) {
                    return {
                        Success: false,
                        Message: "Each sheet must have a name and data",
                        ResultCode: "INVALID_SHEET_DEFINITION"
                    };
                }

                const worksheet = workbook.addWorksheet(sheetDef.name);
                const result = this.populateWorksheet(worksheet, sheetDef);
                totalRows += result.rowCount;
                totalColumns = Math.max(totalColumns, result.columnCount);
            }

            // Generate Excel buffer
            const buffer = await workbook.xlsx.writeBuffer() as Buffer;

            // Save to storage if requested
            if (outputFileId) {
                try {
                    const fileId = await this.saveToMJStorage(
                        buffer,
                        fileName,
                        'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
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
                            message: "Excel file generated and saved successfully",
                            fileId: fileId,
                            fileName: fileName,
                            sheets: sheets.length,
                            totalRows: totalRows,
                            sizeBytes: buffer.length
                        }, null, 2)
                    };
                } catch (error) {
                    // If save fails, still return the Excel data
                    console.error('Failed to save to storage:', error);
                }
            }

            // Return as base64
            const base64Data = buffer.toString('base64');
            
            // Add output parameter
            params.Params.push({
                Name: 'ExcelData',
                Type: 'Output',
                Value: base64Data
            });

            return {
                Success: true,
                ResultCode: "SUCCESS",
                Message: JSON.stringify({
                    message: "Excel file generated successfully",
                    fileName: fileName,
                    sheets: sheets.length,
                    totalRows: totalRows,
                    sizeBytes: buffer.length,
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

    /**
     * Populate worksheet with data
     */
    private populateWorksheet(worksheet: ExcelJS.Worksheet, sheetDef: any): { rowCount: number; columnCount: number } {
        const data = sheetDef.data;
        if (!Array.isArray(data) || data.length === 0) {
            return { rowCount: 0, columnCount: 0 };
        }

        // Determine headers
        let headers = sheetDef.headers;
        if (!headers && data.length > 0 && typeof data[0] === 'object' && !Array.isArray(data[0])) {
            headers = Object.keys(data[0]);
        }

        let rowCount = 0;
        let columnCount = 0;

        // Add headers if present
        if (headers) {
            worksheet.addRow(headers);
            rowCount++;
            columnCount = headers.length;

            // Apply header styles if provided
            if (sheetDef.styles?.headerStyle) {
                const headerRow = worksheet.getRow(1);
                this.applyRowStyle(headerRow, sheetDef.styles.headerStyle);
            }

            // Set column widths if provided
            if (sheetDef.columnWidths && Array.isArray(sheetDef.columnWidths)) {
                headers.forEach((header, index) => {
                    if (index < sheetDef.columnWidths.length) {
                        worksheet.getColumn(index + 1).width = sheetDef.columnWidths[index];
                    }
                });
            }
        }

        // Add data rows
        for (const row of data) {
            if (Array.isArray(row)) {
                // Array of arrays
                worksheet.addRow(row);
                columnCount = Math.max(columnCount, row.length);
            } else if (typeof row === 'object' && headers) {
                // Array of objects with headers
                const rowData = headers.map(header => row[header] ?? '');
                worksheet.addRow(rowData);
            } else {
                // Single value
                worksheet.addRow([row]);
                columnCount = Math.max(columnCount, 1);
            }
            rowCount++;
        }

        // Apply data styles if provided
        if (sheetDef.styles?.dataStyle) {
            for (let i = headers ? 2 : 1; i <= rowCount; i++) {
                const row = worksheet.getRow(i);
                this.applyRowStyle(row, sheetDef.styles.dataStyle);
            }
        }

        // Add formulas if provided
        if (sheetDef.formulas && Array.isArray(sheetDef.formulas)) {
            for (const formula of sheetDef.formulas) {
                if (formula.cell && formula.formula) {
                    worksheet.getCell(formula.cell).value = { formula: formula.formula };
                }
            }
        }

        // Auto-fit columns if no widths provided
        if (!sheetDef.columnWidths) {
            worksheet.columns.forEach(column => {
                let maxLength = 0;
                column.eachCell({ includeEmpty: false }, cell => {
                    const columnLength = cell.value ? cell.value.toString().length : 10;
                    if (columnLength > maxLength) {
                        maxLength = columnLength;
                    }
                });
                column.width = Math.min(maxLength + 2, 50); // Cap at 50 characters
            });
        }

        return { rowCount, columnCount };
    }

    /**
     * Apply style to a row
     */
    private applyRowStyle(row: ExcelJS.Row, style: any): void {
        if (style.font) {
            row.font = style.font;
        }
        if (style.fill) {
            row.fill = style.fill;
        }
        if (style.alignment) {
            row.alignment = style.alignment;
        }
        if (style.border) {
            row.border = style.border;
        }
        if (style.height) {
            row.height = style.height;
        }
    }
}

/**
 * Loader function to ensure the ExcelWriterAction class is included in the bundle
 */
export function LoadExcelWriterAction() {
    // Stub function to prevent tree shaking
}