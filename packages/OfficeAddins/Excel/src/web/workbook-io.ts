/**
 * Reads the workbook's source list and writes a source's rows into its sheet, through Office.js.
 * Uses Excel API 1.4 and below only, which the manifest requires.
 */
import {
    BuildSheetMatrix,
    EXCEL_SOURCES_SHEET_NAME,
    ExcelCellValue,
    ExcelSourceColumn,
    ExcelWorkbookSource,
    ResolveColumns,
    TableNameForSource,
    ToExcelSerialDate,
} from '../contract';

/** Rows written per round trip; Excel on the web refuses very large single requests. */
const ROWS_PER_WRITE = 2000;
/** Above this many rows, column widths are left as they are instead of fitted (fitting is slow). */
const AUTOFIT_ROW_LIMIT = 5000;
const DATE_FORMAT = 'yyyy-mm-dd';
const DATE_TIME_FORMAT = 'yyyy-mm-dd hh:mm';

/** Column A of the hidden sources sheet, or null when the workbook has no such sheet. */
export async function ReadSourceCells(): Promise<string[] | null> {
    return Excel.run(async ctx => {
        const sheet = ctx.workbook.worksheets.getItemOrNullObject(EXCEL_SOURCES_SHEET_NAME);
        await ctx.sync();
        if (sheet.isNullObject) {
            return null;
        }
        const used = sheet.getUsedRangeOrNullObject(true);
        used.load('values');
        await ctx.sync();
        if (used.isNullObject) {
            return [];
        }
        return used.values.map(row => (typeof row[0] === 'string' ? row[0] : String(row[0] ?? '')));
    });
}

/**
 * Replaces the source's sheet contents with the rows, as an Excel table.
 * Returns the number of data rows written.
 */
export async function WriteSourceRows(source: ExcelWorkbookSource, rows: Record<string, unknown>[]): Promise<number> {
    const columns = ResolveColumns(source, rows);
    const matrix = BuildSheetMatrix(columns, rows, (value, dateOnly) =>
        ToExcelSerialDate(value, dateOnly, ms => new Date(ms).getTimezoneOffset()));
    await Excel.run(async ctx => {
        const sheet = await getOrAddSheet(ctx, source.SheetName);
        await clearSource(ctx, sheet, source);
        if (columns.length === 0) {
            sheet.getRange('A1').values = [['No rows.']];
            await ctx.sync();
            return;
        }
        await writeMatrix(ctx, sheet, matrix);
        const table = sheet.tables.add(sheet.getRangeByIndexes(0, 0, matrix.length, columns.length), true);
        table.name = TableNameForSource(source);
        applyDateFormats(table, columns, rows.length);
        if (rows.length <= AUTOFIT_ROW_LIMIT) {
            table.getRange().format.autofitColumns();
        }
        await ctx.sync();
    });
    return rows.length;
}

async function getOrAddSheet(ctx: Excel.RequestContext, name: string): Promise<Excel.Worksheet> {
    const existing = ctx.workbook.worksheets.getItemOrNullObject(name);
    await ctx.sync();
    return existing.isNullObject ? ctx.workbook.worksheets.add(name) : existing;
}

/** Removes the source's previous table and the sheet's values; leaves the sheet's formatting. */
async function clearSource(ctx: Excel.RequestContext, sheet: Excel.Worksheet, source: ExcelWorkbookSource): Promise<void> {
    const table = ctx.workbook.tables.getItemOrNullObject(TableNameForSource(source));
    await ctx.sync();
    if (!table.isNullObject) {
        table.convertToRange();
    }
    const used = sheet.getUsedRangeOrNullObject();
    await ctx.sync();
    if (!used.isNullObject) {
        used.clear(Excel.ClearApplyTo.contents);
    }
    await ctx.sync();
}

async function writeMatrix(ctx: Excel.RequestContext, sheet: Excel.Worksheet, matrix: ExcelCellValue[][]): Promise<void> {
    const width = matrix[0].length;
    for (let start = 0; start < matrix.length; start += ROWS_PER_WRITE) {
        const part = matrix.slice(start, start + ROWS_PER_WRITE);
        sheet.getRangeByIndexes(start, 0, part.length, width).values = part;
        await ctx.sync();
    }
}

function applyDateFormats(table: Excel.Table, columns: ExcelSourceColumn[], rowCount: number): void {
    if (rowCount === 0) {
        return;
    }
    columns.forEach((column, index) => {
        if (column.DataType !== 'Date' && column.DataType !== 'DateTime') {
            return;
        }
        const format = column.DataType === 'Date' ? DATE_FORMAT : DATE_TIME_FORMAT;
        const formats: string[][] = Array.from({ length: rowCount }, () => [format]);
        table.columns.getItemAt(index).getDataBodyRange().numberFormat = formats;
    });
}
