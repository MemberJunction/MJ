/**
 * Excel rendering utilities extracted from ExcelWriterAction.
 * The actual rendering is delegated to ExportEngine.toExcelMultiSheet().
 * This module handles input normalization and style conversion.
 */
import {
    ExportEngine,
    SheetDefinition,
    CellStyle,
    FillPattern,
    BorderSide,
    BorderLineStyle
} from '@memberjunction/export-engine';

// ── Types ─────────────────────────────────────────────────────────────────────

export interface ExcelOptions {
    fileName?: string;
    author?: string;
    title?: string;
    description?: string;
}

/**
 * Input sheet definition format (accepts legacy ExcelJS-style objects)
 */
export interface SheetInputDefinition {
    name: string;
    data?: Record<string, unknown>[] | unknown[][];
    /** Alternative to data: LLMs sometimes send rows+columns instead */
    rows?: unknown[][];
    columns?: string[];
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
export interface LegacyStyle {
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

export interface ExcelRenderResult {
    buffer: Buffer;
    sheetCount?: number;
    rowCount?: number;
    sizeBytes?: number;
}

// ── Rendering ─────────────────────────────────────────────────────────────────

/**
 * Render sheet input definitions to an Excel buffer via ExportEngine.
 */
export async function renderExcelFromSheets(
    sheets: SheetInputDefinition[],
    options: ExcelOptions = {}
): Promise<ExcelRenderResult> {
    const sheetDefinitions: SheetDefinition[] = [];
    for (const sheetInput of sheets) {
        // Normalize: LLMs sometimes send columns+rows instead of data
        if (!sheetInput.data && sheetInput.rows) {
            sheetInput.data = normalizeRowsToData(sheetInput.rows, sheetInput.columns);
        }

        if (!sheetInput.name || !sheetInput.data) {
            throw new Error("Each sheet must have a name and data");
        }

        sheetDefinitions.push(convertToSheetDefinition(sheetInput));
    }

    const fileName = (options.fileName || 'workbook.xlsx').replace(/\.xlsx$/i, '');
    const result = await ExportEngine.toExcelMultiSheet(sheetDefinitions, {
        fileName,
        metadata: {
            author: options.author || 'MemberJunction',
            title: options.title,
            description: options.description
        }
    });

    if (!result.success || !result.data) {
        throw new Error(result.error || 'Failed to generate Excel file');
    }

    return {
        buffer: Buffer.from(result.data),
        sheetCount: result.sheetCount,
        rowCount: result.rowCount,
        sizeBytes: result.sizeBytes,
    };
}

// ── Input normalization ───────────────────────────────────────────────────────

/**
 * Convert columns+rows format to the data array format expected by export-engine.
 */
export function normalizeRowsToData(rows: unknown[][], columns?: string[]): Record<string, unknown>[] {
    if (columns && columns.length > 0) {
        return rows.map(row => {
            const obj: Record<string, unknown> = {};
            columns.forEach((col, i) => { obj[col] = (row as unknown[])[i]; });
            return obj;
        });
    }
    return rows as unknown as Record<string, unknown>[];
}

/**
 * Convert the input sheet definition to the export-engine SheetDefinition format
 */
export function convertToSheetDefinition(input: SheetInputDefinition): SheetDefinition {
    const sheetDef: SheetDefinition = {
        name: input.name,
        data: input.data!,
        includeHeaders: true
    };

    if (input.headers) {
        sheetDef.headers = input.headers;
    } else if (input.columns) {
        sheetDef.headers = input.columns;
    }

    if (input.columnWidths) {
        sheetDef.columnWidths = input.columnWidths;
    }

    if (input.styles?.headerStyle) {
        sheetDef.headerStyle = convertLegacyStyle(input.styles.headerStyle);
    } else if (input.headerStyle) {
        sheetDef.headerStyle = convertLegacyStyle(input.headerStyle);
    }

    if (input.styles?.dataStyle) {
        sheetDef.dataStyle = convertLegacyStyle(input.styles.dataStyle);
    } else if (input.dataStyle) {
        sheetDef.dataStyle = convertLegacyStyle(input.dataStyle);
    }

    if (input.formulas) {
        sheetDef.formulas = input.formulas.map(f => ({
            cell: f.cell,
            formula: f.formula,
            result: f.result
        }));
    }

    if (input.autoFilter !== undefined) {
        sheetDef.autoFilter = input.autoFilter;
    }

    if (input.freeze) {
        sheetDef.freeze = input.freeze;
    }

    return sheetDef;
}

// ── Style conversion ──────────────────────────────────────────────────────────

/**
 * Convert legacy ExcelJS-style objects to export-engine CellStyle format
 */
export function convertLegacyStyle(style: LegacyStyle): CellStyle {
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
        const fontColor = extractColorValue(style.font.color);
        if (fontColor) {
            result.font.color = fontColor;
        }
    }

    if (style.fill) {
        result.fill = {
            pattern: (style.fill.pattern || 'solid') as FillPattern
        };
        const fgColor = extractColorValue(style.fill.fgColor);
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
        if (style.border.top) result.border.top = convertBorderSide(style.border.top);
        if (style.border.bottom) result.border.bottom = convertBorderSide(style.border.bottom);
        if (style.border.left) result.border.left = convertBorderSide(style.border.left);
        if (style.border.right) result.border.right = convertBorderSide(style.border.right);
    }

    return result;
}

function extractColorValue(color: { argb?: string } | string | undefined): string | undefined {
    if (!color) return undefined;
    if (typeof color === 'string') return color;
    if (color.argb) return color.argb.substring(2);
    return undefined;
}

function convertBorderSide(side: { style?: string; color?: { argb?: string } | string }): BorderSide {
    return {
        style: (side.style || 'thin') as BorderLineStyle,
        color: extractColorValue(side.color)
    };
}
