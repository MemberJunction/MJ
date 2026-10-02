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
    fileName?: string;  // case-violation-ok-legacy-back-compat: optional, and the old name is also read off a value the checker cannot type; renaming it stays assignable and silently yields undefined
    author?: string;  // case-violation-ok-legacy-back-compat: optional, and the old name is also read off a value the checker cannot type; renaming it stays assignable and silently yields undefined
    title?: string;  // case-violation-ok-legacy-back-compat: optional, and the old name is also read off a value the checker cannot type; renaming it stays assignable and silently yields undefined
    description?: string;  // case-violation-ok-legacy-back-compat: optional, and the old name is also read off a value the checker cannot type; renaming it stays assignable and silently yields undefined
}

/**
 * Input sheet definition format (accepts legacy ExcelJS-style objects)
 */
export interface SheetInputDefinition {
    name: string;  // case-violation-ok-legacy-back-compat: the old name is also read off a value typed `any`, where a rename would compile and silently return undefined
    data?: Record<string, unknown>[] | unknown[][];  // case-violation-ok-legacy-back-compat: optional, and the old name is also read off a value the checker cannot type; renaming it stays assignable and silently yields undefined
    /** Alternative to data: LLMs sometimes send rows+columns instead */
    rows?: unknown[][];  // case-violation-ok-legacy-back-compat: optional, and the old name is also read off a value the checker cannot type; renaming it stays assignable and silently yields undefined
    columns?: string[];  // case-violation-ok-legacy-back-compat: optional, and the old name is also read off a value the checker cannot type; renaming it stays assignable and silently yields undefined
    headers?: string[];  // case-violation-ok-legacy-back-compat: optional, and the old name is also read off a value the checker cannot type; renaming it stays assignable and silently yields undefined
    ColumnWidths?: number[];
    Styles?: {
        headerStyle?: LegacyStyle;
        dataStyle?: LegacyStyle;
    };
    HeaderStyle?: LegacyStyle;
    DataStyle?: LegacyStyle;
    Formulas?: Array<{ cell: string; formula: string; result?: unknown }>;
    AutoFilter?: boolean | string;
    Freeze?: { row?: number; column?: number };
}

/**
 * Legacy ExcelJS-style style object
 */
export interface LegacyStyle {
    font?: {  // case-violation-ok-legacy-back-compat: optional, and the old name is also read off a value the checker cannot type; renaming it stays assignable and silently yields undefined
        bold?: boolean;
        italic?: boolean;
        underline?: boolean;
        strike?: boolean;
        size?: number;
        name?: string;
        color?: { argb?: string } | string;
    };
    Fill?: {
        type?: string;
        pattern?: string;
        fgColor?: { argb?: string } | string;
        bgColor?: { argb?: string } | string;
    };
    Alignment?: {
        horizontal?: 'left' | 'center' | 'right' | 'fill' | 'justify';
        vertical?: 'top' | 'middle' | 'bottom';
        wrapText?: boolean;
    };
    Border?: {
        top?: { style?: string; color?: { argb?: string } | string };
        bottom?: { style?: string; color?: { argb?: string } | string };
        left?: { style?: string; color?: { argb?: string } | string };
        right?: { style?: string; color?: { argb?: string } | string };
    };
}

export interface ExcelRenderResult {
    buffer: Buffer;  // case-violation-ok-legacy-back-compat: the old name is also read off a value typed `any`, where a rename would compile and silently return undefined
    SheetCount?: number;
    rowCount?: number;  // case-violation-ok-legacy-back-compat: optional, and the old name is also read off a value the checker cannot type; renaming it stays assignable and silently yields undefined
    sizeBytes?: number;  // case-violation-ok-legacy-back-compat: optional, and the old name is also read off a value the checker cannot type; renaming it stays assignable and silently yields undefined
}

// ── Rendering ─────────────────────────────────────────────────────────────────

/**
 * Render sheet input definitions to an Excel buffer via ExportEngine.
 */
export async function RenderExcelFromSheets(
    sheets: SheetInputDefinition[],
    options: ExcelOptions = {}
): Promise<ExcelRenderResult> {
    const sheetDefinitions: SheetDefinition[] = [];
    for (const sheetInput of sheets) {
        // Normalize: LLMs sometimes send columns+rows instead of data
        if (!sheetInput.data && sheetInput.rows) {
            sheetInput.data = NormalizeRowsToData(sheetInput.rows, sheetInput.columns);
        }

        if (!sheetInput.name || !sheetInput.data) {
            throw new Error("Each sheet must have a name and data");
        }

        sheetDefinitions.push(ConvertToSheetDefinition(sheetInput));
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
        SheetCount: result.sheetCount,
        rowCount: result.rowCount,
        sizeBytes: result.sizeBytes,
    };
}

/** @deprecated Use {@link RenderExcelFromSheets}. */
export async function renderExcelFromSheets(
    sheets: SheetInputDefinition[],
    options: ExcelOptions = {}
): Promise<ExcelRenderResult> {
    return RenderExcelFromSheets(sheets, options);
}

// ── Input normalization ───────────────────────────────────────────────────────

/**
 * Convert columns+rows format to the data array format expected by export-engine.
 */
export function NormalizeRowsToData(rows: unknown[][], columns?: string[]): Record<string, unknown>[] {
    if (columns && columns.length > 0) {
        return rows.map(row => {
            const obj: Record<string, unknown> = {};
            columns.forEach((col, i) => { obj[col] = (row as unknown[])[i]; });
            return obj;
        });
    }
    return rows as unknown as Record<string, unknown>[];
}

/** @deprecated Use {@link NormalizeRowsToData}. */
export function normalizeRowsToData(rows: unknown[][], columns?: string[]): Record<string, unknown>[] {
    return NormalizeRowsToData(rows, columns);
}

/**
 * Convert the input sheet definition to the export-engine SheetDefinition format
 */
export function ConvertToSheetDefinition(input: SheetInputDefinition): SheetDefinition {
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

    if (input.ColumnWidths) {
        sheetDef.columnWidths = input.ColumnWidths;
    }

    if (input.Styles?.headerStyle) {
        sheetDef.headerStyle = ConvertLegacyStyle(input.Styles.headerStyle);
    } else if (input.HeaderStyle) {
        sheetDef.headerStyle = ConvertLegacyStyle(input.HeaderStyle);
    }

    if (input.Styles?.dataStyle) {
        sheetDef.dataStyle = ConvertLegacyStyle(input.Styles.dataStyle);
    } else if (input.DataStyle) {
        sheetDef.dataStyle = ConvertLegacyStyle(input.DataStyle);
    }

    if (input.Formulas) {
        sheetDef.formulas = input.Formulas.map(f => ({
            cell: f.cell,
            formula: f.formula,
            result: f.result
        }));
    }

    if (input.AutoFilter !== undefined) {
        sheetDef.autoFilter = input.AutoFilter;
    }

    if (input.Freeze) {
        sheetDef.freeze = input.Freeze;
    }

    return sheetDef;
}

/** @deprecated Use {@link ConvertToSheetDefinition}. */
export function convertToSheetDefinition(input: SheetInputDefinition): SheetDefinition {
    return ConvertToSheetDefinition(input);
}

// ── Style conversion ──────────────────────────────────────────────────────────

/**
 * Convert legacy ExcelJS-style objects to export-engine CellStyle format
 */
export function ConvertLegacyStyle(style: LegacyStyle): CellStyle {
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

    if (style.Fill) {
        result.fill = {
            pattern: (style.Fill.pattern || 'solid') as FillPattern
        };
        const fgColor = extractColorValue(style.Fill.fgColor);
        if (fgColor) {
            result.fill.fgColor = fgColor;
        }
    }

    if (style.Alignment) {
        result.alignment = {
            horizontal: style.Alignment.horizontal,
            vertical: style.Alignment.vertical,
            wrapText: style.Alignment.wrapText
        };
    }

    if (style.Border) {
        result.border = {};
        if (style.Border.top) result.border.top = convertBorderSide(style.Border.top);
        if (style.Border.bottom) result.border.bottom = convertBorderSide(style.Border.bottom);
        if (style.Border.left) result.border.left = convertBorderSide(style.Border.left);
        if (style.Border.right) result.border.right = convertBorderSide(style.Border.right);
    }

    return result;
}

/** @deprecated Use {@link ConvertLegacyStyle}. */
export function convertLegacyStyle(style: LegacyStyle): CellStyle {
    return ConvertLegacyStyle(style);
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
