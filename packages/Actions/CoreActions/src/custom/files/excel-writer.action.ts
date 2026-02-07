import { ActionResultSimple, RunActionParams } from "@memberjunction/actions-base";
import { RegisterClass } from "@memberjunction/global";
import { BaseFileHandlerAction } from "../utilities/base-file-handler";
import { JSONParamHelper } from "../utilities/json-param-helper";
import { BaseAction } from '@memberjunction/actions';
import {
    ExportEngine,
    SheetDefinition,
    CellStyle,
    CellFormula,
    FillPattern,
    BorderSide,
    BorderLineStyle
} from '@memberjunction/export-engine';

/**
 * Action that creates Excel files from JSON data using the MemberJunction export-engine.
 * Supports multiple sheets, formatting, styles, and formulas.
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
 *       headerStyle: {
 *         font: { bold: true, color: 'FFFFFF' },
 *         fill: { pattern: 'solid', fgColor: '4472C4' }
 *       }
 *     }, {
 *       name: 'Summary',
 *       data: summaryData,
 *       formulas: [{ cell: 'B10', formula: 'SUM(B2:B9)' }]
 *     }]
 *   }]
 * });
 * ```
 */
@RegisterClass(BaseAction, "Excel Writer")
export class ExcelWriterAction extends BaseFileHandlerAction {

    /**
     * Creates Excel files from JSON data using the export-engine
     *
     * @param params - The action parameters containing:
     *   - Sheets: Array of sheet definitions, each containing:
     *     - name: Sheet name (required)
     *     - data: Array of data rows (required)
     *     - headers: Array of column headers (optional, derived from data if not provided)
     *     - columnWidths: Array of column widths in characters (optional)
     *     - headerStyle: Style object for headers (optional)
     *     - dataStyle: Style object for data rows (optional)
     *     - formulas: Array of formula definitions (optional)
     *     - autoFilter: Enable auto-filter (optional, boolean or range string)
     *     - freeze: Freeze panes configuration (optional)
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

            // Validate and convert sheet definitions
            const sheetDefinitions: SheetDefinition[] = [];
            for (const sheetInput of sheets) {
                if (!sheetInput.name || !sheetInput.data) {
                    return {
                        Success: false,
                        Message: "Each sheet must have a name and data",
                        ResultCode: "INVALID_SHEET_DEFINITION"
                    };
                }

                const sheetDef = this.convertToSheetDefinition(sheetInput);
                sheetDefinitions.push(sheetDef);
            }

            // Use the export-engine to generate the Excel file
            const result = await ExportEngine.toExcelMultiSheet(sheetDefinitions, {
                fileName: fileName.replace(/\.xlsx$/i, ''), // Remove extension, engine adds it
                metadata: {
                    author: author || 'MemberJunction',
                    title,
                    description
                }
            });

            if (!result.success || !result.data) {
                return {
                    Success: false,
                    Message: result.error || 'Failed to generate Excel file',
                    ResultCode: "GENERATION_FAILED"
                };
            }

            // Convert to Buffer for storage/output
            const buffer = Buffer.from(result.data);

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
                            sheets: result.sheetCount,
                            totalRows: result.rowCount,
                            sizeBytes: result.sizeBytes
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

    /**
     * Convert the input sheet definition to the export-engine SheetDefinition format
     */
    private convertToSheetDefinition(input: SheetInputDefinition): SheetDefinition {
        const sheetDef: SheetDefinition = {
            name: input.name,
            data: input.data,
            includeHeaders: true
        };

        // Map headers
        if (input.headers) {
            sheetDef.headers = input.headers;
        }

        // Map column widths
        if (input.columnWidths) {
            sheetDef.columnWidths = input.columnWidths;
        }

        // Map header style - convert legacy format to new format
        if (input.styles?.headerStyle) {
            sheetDef.headerStyle = this.convertLegacyStyle(input.styles.headerStyle);
        } else if (input.headerStyle) {
            sheetDef.headerStyle = this.convertLegacyStyle(input.headerStyle);
        }

        // Map data style
        if (input.styles?.dataStyle) {
            sheetDef.dataStyle = this.convertLegacyStyle(input.styles.dataStyle);
        } else if (input.dataStyle) {
            sheetDef.dataStyle = this.convertLegacyStyle(input.dataStyle);
        }

        // Map formulas
        if (input.formulas) {
            sheetDef.formulas = input.formulas.map(f => ({
                cell: f.cell,
                formula: f.formula,
                result: f.result
            }));
        }

        // Map auto-filter
        if (input.autoFilter !== undefined) {
            sheetDef.autoFilter = input.autoFilter;
        }

        // Map freeze panes
        if (input.freeze) {
            sheetDef.freeze = input.freeze;
        }

        return sheetDef;
    }

    /**
     * Convert legacy ExcelJS-style objects to export-engine CellStyle format
     */
    private convertLegacyStyle(style: LegacyStyle): CellStyle {
        const result: CellStyle = {};

        if (style.font) {
            result.font = {
                bold: style.font.bold,
                italic: style.font.italic,
                underline: style.font.underline,
                strike: style.font.strike,
                size: style.font.size,
                name: style.font.name
            };
            // Handle color - legacy format uses { argb: 'FFFFFFFF' }
            const fontColor = this.extractColorValue(style.font.color);
            if (fontColor) {
                result.font.color = fontColor;
            }
        }

        if (style.fill) {
            result.fill = {
                pattern: (style.fill.pattern || 'solid') as FillPattern
            };
            // Handle fgColor - legacy format uses { argb: 'FFFFFFFF' }
            const fgColor = this.extractColorValue(style.fill.fgColor);
            if (fgColor) {
                result.fill.fgColor = fgColor;
            }
        }

        if (style.alignment) {
            result.alignment = {
                horizontal: style.alignment.horizontal,
                vertical: style.alignment.vertical,
                wrapText: style.alignment.wrapText
            };
        }

        if (style.border) {
            result.border = {};
            if (style.border.top) {
                result.border.top = this.convertBorderSide(style.border.top);
            }
            if (style.border.bottom) {
                result.border.bottom = this.convertBorderSide(style.border.bottom);
            }
            if (style.border.left) {
                result.border.left = this.convertBorderSide(style.border.left);
            }
            if (style.border.right) {
                result.border.right = this.convertBorderSide(style.border.right);
            }
        }

        return result;
    }

    /**
     * Extract color value from legacy format (handles both string and { argb: string } formats)
     */
    private extractColorValue(color: { argb?: string } | string | undefined): string | undefined {
        if (!color) {
            return undefined;
        }
        if (typeof color === 'string') {
            return color;
        }
        if (color.argb) {
            // Remove 'FF' alpha prefix from ARGB format
            return color.argb.substring(2);
        }
        return undefined;
    }

    /**
     * Convert a legacy border side definition to export-engine BorderSide format
     */
    private convertBorderSide(side: { style?: string; color?: { argb?: string } | string }): BorderSide {
        return {
            style: (side.style || 'thin') as BorderLineStyle,
            color: this.extractColorValue(side.color)
        };
    }
}

/**
 * Input sheet definition format (accepts legacy ExcelJS-style objects)
 */
interface SheetInputDefinition {
    name: string;
    data: Record<string, unknown>[] | unknown[][];
    headers?: string[];
    columnWidths?: number[];
    styles?: {
        headerStyle?: LegacyStyle;
        dataStyle?: LegacyStyle;
    };
    headerStyle?: LegacyStyle;
    dataStyle?: LegacyStyle;
    formulas?: Array<{ cell: string; formula: string; result?: unknown }>;
    autoFilter?: boolean | string;
    freeze?: { row?: number; column?: number };
}

/**
 * Legacy ExcelJS-style style object
 */
interface LegacyStyle {
    font?: {
        bold?: boolean;
        italic?: boolean;
        underline?: boolean;
        strike?: boolean;
        size?: number;
        name?: string;
        color?: { argb?: string } | string;
    };
    fill?: {
        type?: string;
        pattern?: string;
        fgColor?: { argb?: string } | string;
        bgColor?: { argb?: string } | string;
    };
    alignment?: {
        horizontal?: 'left' | 'center' | 'right' | 'fill' | 'justify';
        vertical?: 'top' | 'middle' | 'bottom';
        wrapText?: boolean;
    };
    border?: {
        top?: { style?: string; color?: { argb?: string } | string };
        bottom?: { style?: string; color?: { argb?: string } | string };
        left?: { style?: string; color?: { argb?: string } | string };
        right?: { style?: string; color?: { argb?: string } | string };
    };
}