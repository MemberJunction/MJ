import { ActionResultSimple, RunActionParams } from "@memberjunction/actions-base";
import { RegisterClass } from "@memberjunction/global";
import { BaseFileHandlerAction } from "../utilities/base-file-handler";
import * as ExcelJS from "exceljs";
import { BaseAction } from '@memberjunction/actions';

/**
 * Action that reads Excel files and converts them to JSON format
 * Supports multiple sheets, ranges, and various data types
 * 
 * @example
 * ```typescript
 * // Read entire Excel file
 * await runAction({
 *   ActionName: 'Excel Reader',
 *   Params: [{
 *     Name: 'FileURL',
 *     Value: 'https://example.com/data.xlsx'
 *   }]
 * });
 * 
 * // Read specific sheet with headers
 * await runAction({
 *   ActionName: 'Excel Reader',
 *   Params: [{
 *     Name: 'FileID',
 *     Value: 'uuid-of-excel-file'
 *   }, {
 *     Name: 'SheetName',
 *     Value: 'Sales Data'
 *   }, {
 *     Name: 'HasHeaders',
 *     Value: true
 *   }]
 * });
 * 
 * // Read specific range
 * await runAction({
 *   ActionName: 'Excel Reader',
 *   Params: [{
 *     Name: 'ExcelData',
 *     Value: base64ExcelData
 *   }, {
 *     Name: 'Range',
 *     Value: 'A1:D10'
 *   }]
 * });
 * ```
 */
@RegisterClass(BaseAction, "Excel Reader")
export class ExcelReaderAction extends BaseFileHandlerAction {
    
    /**
     * Reads Excel files and converts to JSON
     * 
     * @param params - The action parameters containing:
     *   - FileID: UUID of MJ Storage file (optional)
     *   - FileURL: URL of Excel file (optional)
     *   - ExcelData: Base64 encoded Excel data (optional)
     *   - SheetName: Specific sheet name to read (optional, default: first sheet)
     *   - SheetIndex: Sheet index (0-based, alternative to SheetName)
     *   - Range: A1 notation range like 'A1:D10' (optional)
     *   - HasHeaders: Boolean - first row contains headers (default: true)
     *   - DateFormat: How to format dates - 'ISO' | 'Excel' | 'Local' (default: 'ISO')
     *   - EmptyCellValue: Value to use for empty cells (default: null)
     *   - IncludeHidden: Include hidden rows/columns (default: false)
     * 
     * @returns Array of objects (if headers) or array of arrays
     */
    protected async InternalRunAction(params: RunActionParams): Promise<ActionResultSimple> {
        try {
            // Get file content
            const fileContent = await this.getFileContent(params, 'exceldata', 'fileid', 'fileurl');
            
            // Get parameters
            const sheetName = this.getParamValue(params, 'sheetname');
            const sheetIndex = this.getNumericParam(params, 'sheetindex', -1);
            const range = this.getParamValue(params, 'range');
            const hasHeaders = this.getBooleanParam(params, 'hasheaders', true);
            const dateFormat = this.getParamValue(params, 'dateformat') || 'ISO';
            const emptyCellValue = this.getParamValue(params, 'emptycellvalue') ?? null;
            const includeHidden = this.getBooleanParam(params, 'includehidden', false);

            // Convert to Buffer if needed
            let excelBuffer: Buffer;
            if (typeof fileContent.content === 'string') {
                // Check if it's base64
                if (this.isBase64(fileContent.content)) {
                    excelBuffer = Buffer.from(fileContent.content, 'base64');
                } else {
                    excelBuffer = Buffer.from(fileContent.content, 'binary');
                }
            } else {
                excelBuffer = fileContent.content;
            }

            // Read Excel file
            const workbook = new ExcelJS.Workbook();
            await workbook.xlsx.load(excelBuffer as unknown as ArrayBuffer);

            // Get the target worksheet
            let worksheet: ExcelJS.Worksheet;
            if (sheetName) {
                worksheet = workbook.getWorksheet(sheetName);
                if (!worksheet) {
                    return {
                        Success: false,
                        Message: `Sheet '${sheetName}' not found in Excel file`,
                        ResultCode: "SHEET_NOT_FOUND"
                    };
                }
            } else if (sheetIndex >= 0) {
                worksheet = workbook.getWorksheet(sheetIndex + 1); // ExcelJS uses 1-based index
                if (!worksheet) {
                    return {
                        Success: false,
                        Message: `Sheet index ${sheetIndex} not found in Excel file`,
                        ResultCode: "SHEET_NOT_FOUND"
                    };
                }
            } else {
                // Get first worksheet
                worksheet = workbook.worksheets[0];
                if (!worksheet) {
                    return {
                        Success: false,
                        Message: "No worksheets found in Excel file",
                        ResultCode: "NO_SHEETS"
                    };
                }
            }

            // Extract data
            const data = this.extractSheetData(worksheet, {
                range,
                hasHeaders,
                dateFormat,
                emptyCellValue,
                includeHidden
            });

            // Get workbook metadata
            const metadata = {
                sheetName: worksheet.name,
                totalSheets: workbook.worksheets.length,
                sheetNames: workbook.worksheets.map(ws => ws.name),
                rowCount: data.rowCount,
                columnCount: data.columnCount,
                source: fileContent.source,
                fileName: fileContent.fileName
            };

            // Add output parameter
            params.Params.push({
                Name: 'ExtractedData',
                Type: 'Output',
                Value: data.data
            });

            return {
                Success: true,
                ResultCode: "SUCCESS",
                Message: JSON.stringify({
                    data: data.data,
                    ...metadata,
                    headers: data.headers
                }, null, 2)
            };

        } catch (error) {
            return {
                Success: false,
                Message: `Failed to read Excel file: ${error instanceof Error ? error.message : String(error)}`,
                ResultCode: "READ_FAILED"
            };
        }
    }

    /**
     * Check if string is base64 encoded
     */
    private isBase64(str: string): boolean {
        try {
            return Buffer.from(str, 'base64').toString('base64') === str;
        } catch {
            return false;
        }
    }

    /**
     * Extract data from worksheet
     */
    private extractSheetData(worksheet: ExcelJS.Worksheet, options: any): any {
        const rows: any[] = [];
        let headers: string[] = [];
        let rowCount = 0;
        let columnCount = 0;

        // Determine range
        let startRow = 1;
        let endRow = worksheet.rowCount;
        let startCol = 1;
        let endCol = worksheet.columnCount;

        if (options.range) {
            const rangeMatch = options.range.match(/([A-Z]+)(\d+):([A-Z]+)(\d+)/);
            if (rangeMatch) {
                startCol = this.columnToNumber(rangeMatch[1]);
                startRow = parseInt(rangeMatch[2]);
                endCol = this.columnToNumber(rangeMatch[3]);
                endRow = parseInt(rangeMatch[4]);
            }
        }

        // Extract headers if present
        if (options.hasHeaders && startRow <= endRow) {
            const headerRow = worksheet.getRow(startRow);
            if (!options.includeHidden && headerRow.hidden) {
                startRow++;
            } else {
                for (let col = startCol; col <= endCol; col++) {
                    const cell = headerRow.getCell(col);
                    headers.push(this.getCellValue(cell, options) || `Column${col}`);
                }
                startRow++;
            }
        }

        // Extract data rows
        for (let rowNum = startRow; rowNum <= endRow; rowNum++) {
            const row = worksheet.getRow(rowNum);
            
            // Skip hidden rows if requested
            if (!options.includeHidden && row.hidden) {
                continue;
            }

            const rowData: any = options.hasHeaders ? {} : [];
            let hasData = false;

            for (let col = startCol; col <= endCol; col++) {
                const cell = row.getCell(col);
                const value = this.getCellValue(cell, options);
                
                if (value !== null && value !== undefined && value !== '') {
                    hasData = true;
                }

                if (options.hasHeaders) {
                    const header = headers[col - startCol];
                    rowData[header] = value;
                } else {
                    rowData.push(value);
                }
            }

            // Only add row if it has data
            if (hasData || options.emptyCellValue !== null) {
                rows.push(rowData);
                rowCount++;
            }
        }

        columnCount = endCol - startCol + 1;

        return {
            data: rows,
            headers: options.hasHeaders ? headers : null,
            rowCount,
            columnCount
        };
    }

    /**
     * Get cell value with proper type handling
     */
    private getCellValue(cell: ExcelJS.Cell, options: any): any {
        if (!cell || cell.value === null || cell.value === undefined) {
            return options.emptyCellValue;
        }

        // Handle different cell types
        switch (cell.type) {
            case ExcelJS.ValueType.Number:
                return cell.value;
                
            case ExcelJS.ValueType.String:
                return cell.value;
                
            case ExcelJS.ValueType.Date:
                const date = cell.value as Date;
                switch (options.dateFormat) {
                    case 'Excel':
                        return cell.value; // Return as Excel serial number
                    case 'Local':
                        return date.toLocaleString();
                    case 'ISO':
                    default:
                        return date.toISOString();
                }
                
            case ExcelJS.ValueType.Boolean:
                return cell.value;
                
            case ExcelJS.ValueType.Error:
                return `#ERROR: ${cell.value}`;
                
            case ExcelJS.ValueType.Formula:
                // Return the result of the formula
                return (cell.value as any).result || options.emptyCellValue;
                
            case ExcelJS.ValueType.Hyperlink:
                const hyperlink = cell.value as ExcelJS.CellHyperlinkValue;
                return hyperlink.text || hyperlink.hyperlink;
                
            case ExcelJS.ValueType.RichText:
                const richText = cell.value as ExcelJS.CellRichTextValue;
                return richText.richText.map(rt => rt.text).join('');
                
            default:
                return cell.value;
        }
    }

    /**
     * Convert column letter to number (A=1, B=2, etc.)
     */
    private columnToNumber(column: string): number {
        let result = 0;
        for (let i = 0; i < column.length; i++) {
            result = result * 26 + (column.charCodeAt(i) - 64);
        }
        return result;
    }
}