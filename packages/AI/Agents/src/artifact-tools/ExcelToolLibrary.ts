/**
 * @fileoverview Artifact tool library for Excel (.xlsx) content.
 *
 * Parses an Excel workbook from a Buffer and exposes tools for inspecting
 * sheets, reading rows, searching cells, aggregating columns, and listing formulas.
 */
import { RegisterClass } from '@memberjunction/global';
import {
  BaseArtifactToolLibrary,
  type ArtifactJsonValue,
  type ArtifactToolArgs,
  type ArtifactToolDefinition,
  type ArtifactToolResult,
} from '@memberjunction/ai-core-plus';
import { CompileSafeToolRegex, ComputeNumericExtremum, DecodeBinaryArtifactContent } from './artifact-tool-helpers';
import { ExecuteSafeRegexBatchWithRecovery } from './node-vm-safe-regex';

// ---------------------------------------------------------------------------
// Local interfaces for exceljs types (no `any` / `unknown`)
// ---------------------------------------------------------------------------

type ExcelCellValue = ArtifactJsonValue | Date | object | undefined;

interface ExcelJsXlsx {
  load(buffer: ArrayBuffer | Uint8Array | Buffer): Promise<ExcelWorkbook | object>;
}

interface ExcelWorkbook {
  xlsx: ExcelJsXlsx;
  worksheets: ExcelWorksheet[];
  getWorksheet(name: string): ExcelWorksheet | undefined;
}

interface ExcelWorksheet {
  name: string;
  rowCount: number;
  columnCount: number;
  getRow(n: number): ExcelRow;
  eachRow(opts: { includeEmpty: boolean }, cb: (row: ExcelRow, rowNumber: number) => void): void;
}

interface ExcelRow {
  values: ExcelCellValue[] | Record<string, ExcelCellValue>;
  eachCell(opts: { includeEmpty: boolean }, cb: (cell: ExcelCell, colNumber: number) => void): void;
}

interface ExcelCell {
  value: ExcelCellValue;
  text: string;
  formula?: string;
  address: string;
}

type ExcelJsModule = typeof import('exceljs') & {
  default?: {
    Workbook?: typeof import('exceljs').Workbook;
  };
};

let excelJsModulePromise: Promise<ExcelJsModule> | null = null;

function getExcelJsModule(): Promise<ExcelJsModule> {
  if (!excelJsModulePromise) {
    // Genuine bundle-size deferral + optional peer dependency: exceljs is heavy and only loaded for .xlsx artifacts.
    excelJsModulePromise = import('exceljs') as Promise<ExcelJsModule>;
  }
  return excelJsModulePromise;
}

// ---------------------------------------------------------------------------
// Result types
// ---------------------------------------------------------------------------

interface SheetInfo {
  name: string;
  rowCount: number;
  columnCount: number;
}

interface CellMatch {
  sheet: string;
  cell: string;
  value: string;
}

interface FormulaInfo {
  cell: string;
  formula: string;
}

type AggregateOperation = 'sum' | 'avg' | 'count' | 'min' | 'max';

const VALID_AGGREGATE_OPS: ReadonlySet<string> = new Set<AggregateOperation>(['sum', 'avg', 'count', 'min', 'max']);

// ---------------------------------------------------------------------------
// ExcelToolLibrary
// ---------------------------------------------------------------------------

@RegisterClass(BaseArtifactToolLibrary, 'ExcelToolLibrary')
export class ExcelToolLibrary extends BaseArtifactToolLibrary {
  // -----------------------------------------------------------------------
  // getSubclassToolList
  // -----------------------------------------------------------------------

  protected getSubclassToolList(): ArtifactToolDefinition[] {
    return [
      {
        name: 'get_sheets',
        description: 'Returns sheet names, row counts, and column counts for every sheet in the workbook.',
        inputSchema: { type: 'object', properties: {}, required: [] },
      },
      {
        name: 'get_sheet_data',
        description: 'Returns rows from a sheet as key-value objects using the header row as keys. Defaults to first 50 data rows.',
        inputSchema: {
          type: 'object',
          properties: {
            sheet: { type: 'string', description: 'Sheet name' },
            startRow: { type: 'number', description: '1-based data row to start from (after header). Default: 1' },
            rowCount: { type: 'number', description: 'Number of data rows to return. Default: 50' },
          },
          required: ['sheet'],
        },
      },
      {
        name: 'search_cells',
        description:
          'Searches across all cells using case-insensitive literal substring match by default (set isRegex=true for safe regex search). Optionally scope to a single sheet. Returns up to 100 matches.',
        inputSchema: {
          type: 'object',
          properties: {
            query: { type: 'string', description: 'Literal text or regex pattern to search for' },
            sheet: { type: 'string', description: 'Optional sheet name to limit search scope' },
            isRegex: { type: 'boolean', description: 'When true, treat query as a regular expression (default: false)' },
          },
          required: ['query'],
        },
      },
      {
        name: 'aggregate_column',
        description: 'Computes an aggregate (sum, avg, count, min, max) on a column identified by its header name.',
        inputSchema: {
          type: 'object',
          properties: {
            sheet: { type: 'string', description: 'Sheet name' },
            column: { type: 'string', description: 'Column header name' },
            operation: { type: 'string', description: 'Aggregate operation: sum, avg, count, min, max' },
          },
          required: ['sheet', 'column', 'operation'],
        },
      },
      {
        name: 'get_formulas',
        description: 'Returns all cells containing formulas in a given sheet.',
        inputSchema: {
          type: 'object',
          properties: {
            sheet: { type: 'string', description: 'Sheet name' },
          },
          required: ['sheet'],
        },
      },
    ];
  }

  // -----------------------------------------------------------------------
  // invokeSubclassTool — dispatcher
  // -----------------------------------------------------------------------

  protected async invokeSubclassTool(toolName: string, input: ArtifactToolArgs, artifactContent: string | Buffer): Promise<ArtifactToolResult> {
    const buffer = DecodeBinaryArtifactContent(artifactContent);

    let workbook: ExcelWorkbook;
    try {
      const ExcelJS = await getExcelJsModule();
      const WorkbookCtor = ExcelJS.default?.Workbook ?? ExcelJS.Workbook;
      const wb = new WorkbookCtor();
      await wb.xlsx.load(new Uint8Array(buffer).buffer);
      workbook = wb as ExcelWorkbook;
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      return this.errorResult(`Failed to parse Excel content: ${message}`);
    }

    switch (toolName) {
      case 'get_sheets':
        return this.handleGetSheets(workbook);
      case 'get_sheet_data':
        return this.handleGetSheetData(workbook, input);
      case 'search_cells':
        return this.handleSearchCells(workbook, input);
      case 'aggregate_column':
        return this.handleAggregateColumn(workbook, input);
      case 'get_formulas':
        return this.handleGetFormulas(workbook, input);
      default:
        return this.errorResult(`Unknown tool: "${toolName}".`);
    }
  }

  // -----------------------------------------------------------------------
  // Tool handlers
  // -----------------------------------------------------------------------

  private handleGetSheets(workbook: ExcelWorkbook): ArtifactToolResult {
    const sheets: SheetInfo[] = workbook.worksheets.map((ws) => ({
      name: ws.name,
      rowCount: ws.rowCount,
      columnCount: ws.columnCount,
    }));
    return this.successResult({ sheets });
  }

  private handleGetSheetData(workbook: ExcelWorkbook, input: ArtifactToolArgs): ArtifactToolResult {
    const sheetName = String(input.sheet ?? '');
    const ws = workbook.getWorksheet(sheetName);
    if (!ws) {
      return this.errorResult(`Sheet "${sheetName}" not found.`);
    }

    const startRow = typeof input.startRow === 'number' && Number.isFinite(input.startRow) ? input.startRow : 1;
    const rowCount = typeof input.rowCount === 'number' && Number.isFinite(input.rowCount) ? input.rowCount : 50;

    const headerMap = this.buildHeaderMap(ws);
    if (headerMap.size === 0) {
      return this.successResult({ rows: [] });
    }

    const rows: Array<Record<string, ExcelCellValue>> = [];
    // Row 1 is header, data starts at row 2. startRow is 1-based offset after header.
    const firstDataRow = 1 + startRow;
    const lastDataRow = Math.min(1 + startRow + rowCount - 1, ws.rowCount);

    for (let r = firstDataRow; r <= lastDataRow; r++) {
      const row = ws.getRow(r);
      const values = Array.isArray(row?.values) ? row.values : [];
      if (!row || values.length === 0) continue;

      const record: Record<string, ExcelCellValue> = {};
      for (const [colIndex, colName] of headerMap.entries()) {
        record[colName] = values[colIndex] ?? null;
      }
      rows.push(record);
    }

    return this.successResult({ rows });
  }

  private handleSearchCells(workbook: ExcelWorkbook, input: ArtifactToolArgs): ArtifactToolResult {
    const query = typeof input.query === 'string' ? input.query : String(input.query ?? '');
    const isRegex = input.isRegex === true;
    const sheetName = typeof input.sheet === 'string' ? input.sheet : undefined;

    if (sheetName) {
      const ws = workbook.getWorksheet(sheetName);
      if (!ws) {
        return this.errorResult(`Sheet "${sheetName}" not found.`);
      }
    }

    let safeRegex: RegExp | null = null;
    if (isRegex) {
      const compiled = CompileSafeToolRegex(query, 'i');
      if (!compiled.Regex) {
        return this.errorResult(compiled.ErrorMessage ?? `Invalid or unsafe regex pattern: "${query}".`);
      }
      safeRegex = compiled.Regex;
    }

    const targetSheets = sheetName ? [workbook.getWorksheet(sheetName)] : workbook.worksheets;
    const MATCH_LIMIT = 100;

    if (!safeRegex) {
      const lowerQuery = query.toLowerCase();
      const matches: CellMatch[] = [];
      for (const ws of targetSheets) {
        if (!ws) continue;
        ws.eachRow({ includeEmpty: false }, (row) => {
          if (matches.length >= MATCH_LIMIT) return;
          row.eachCell({ includeEmpty: false }, (cell) => {
            if (matches.length >= MATCH_LIMIT) return;
            const text = cell.text ?? String(cell.value ?? '');
            if (text.toLowerCase().includes(lowerQuery)) {
              matches.push({
                sheet: ws.name,
                cell: cell.address,
                value: text,
              });
            }
          });
        });
      }
      return this.successResult({ matches });
    }

    const candidates: CellMatch[] = [];
    for (const ws of targetSheets) {
      if (!ws) continue;
      ws.eachRow({ includeEmpty: false }, (row) => {
        row.eachCell({ includeEmpty: false }, (cell) => {
          const text = cell.text ?? String(cell.value ?? '');
          candidates.push({
            sheet: ws.name,
            cell: cell.address,
            value: text,
          });
        });
      });
    }

    const texts = candidates.map((c) => c.value);
    const batchResult = ExecuteSafeRegexBatchWithRecovery(safeRegex, texts, performance.now() + 1500);
    const matches: CellMatch[] = [];
    for (let i = 0; i < candidates.length && matches.length < MATCH_LIMIT; i++) {
      if (batchResult.Matches[i]) {
        matches.push(candidates[i]);
      }
    }

    return this.successResult({
      matches,
      ...(batchResult.BudgetExpired || batchResult.TimedOut.some(Boolean)
        ? { partial: true, budgetExpired: batchResult.BudgetExpired }
        : {}),
    });
  }

  private handleAggregateColumn(workbook: ExcelWorkbook, input: ArtifactToolArgs): ArtifactToolResult {
    const sheetName = String(input.sheet ?? '');
    const columnName = String(input.column ?? '');
    const operation = String(input.operation ?? '');

    const ws = workbook.getWorksheet(sheetName);
    if (!ws) {
      return this.errorResult(`Sheet "${sheetName}" not found.`);
    }

    if (!VALID_AGGREGATE_OPS.has(operation)) {
      return this.errorResult(`Unsupported aggregate operation: "${operation}". Valid operations: ${[...VALID_AGGREGATE_OPS].join(', ')}.`);
    }

    const headerMap = this.buildHeaderMap(ws);
    let targetCol = -1;
    for (const [colIdx, name] of headerMap.entries()) {
      if (name === columnName) {
        targetCol = colIdx;
        break;
      }
    }
    if (targetCol === -1) {
      return this.errorResult(`Column "${columnName}" not found in sheet "${sheetName}". Available columns: ${[...headerMap.values()].join(', ')}.`);
    }

    const numericValues: number[] = [];
    for (let r = 2; r <= ws.rowCount; r++) {
      const row = ws.getRow(r);
      const values = Array.isArray(row?.values) ? row.values : [];
      const raw = values[targetCol];
      if (raw == null) continue;
      const num = Number(raw);
      if (!isNaN(num)) {
        numericValues.push(num);
      }
    }

    if (operation === 'count') {
      return this.successResult({ operation, column: columnName, value: numericValues.length });
    }

    if (numericValues.length === 0) {
      return this.errorResult(`No numeric values found in column "${columnName}".`);
    }

    const result = this.computeAggregate(numericValues, operation as AggregateOperation);
    return this.successResult({ operation, column: columnName, value: result });
  }

  private handleGetFormulas(workbook: ExcelWorkbook, input: ArtifactToolArgs): ArtifactToolResult {
    const sheetName = String(input.sheet ?? '');
    const ws = workbook.getWorksheet(sheetName);
    if (!ws) {
      return this.errorResult(`Sheet "${sheetName}" not found.`);
    }

    const formulas: FormulaInfo[] = [];
    ws.eachRow({ includeEmpty: false }, (row) => {
      row.eachCell({ includeEmpty: false }, (cell) => {
        if (cell.formula) {
          formulas.push({
            cell: cell.address,
            formula: cell.formula,
          });
        }
      });
    });

    return this.successResult({ formulas });
  }

  // -----------------------------------------------------------------------
  // Aggregate computation (pure)
  // -----------------------------------------------------------------------

  private computeAggregate(values: number[], operation: AggregateOperation): number {
    switch (operation) {
      case 'sum': {
        let sum = 0;
        for (const v of values) sum += v;
        return sum;
      }
      case 'avg': {
        if (values.length === 0) return 0;
        let sum = 0;
        for (const v of values) sum += v;
        return sum / values.length;
      }
      case 'count':
        return values.length;
      case 'min':
        return ComputeNumericExtremum(values, 'min');
      case 'max':
        return ComputeNumericExtremum(values, 'max');
    }
  }

  // -----------------------------------------------------------------------
  // Helpers
  // -----------------------------------------------------------------------

  private buildHeaderMap(ws: ExcelWorksheet): Map<number, string> {
    const headerRow = ws.getRow(1);
    const headerMap = new Map<number, string>();
    if (!headerRow || !headerRow.values) return headerMap;

    const values = Array.isArray(headerRow.values) ? headerRow.values : [];
    for (let i = 1; i < values.length; i++) {
      const val = values[i];
      if (val != null && String(val).trim() !== '') {
        headerMap.set(i, String(val).trim());
      }
    }
    return headerMap;
  }

  private successResult(data: ArtifactToolResult['data']): ArtifactToolResult {
    return { success: true, data };
  }

  private errorResult(errorMessage: string): ArtifactToolResult {
    return { success: false, data: null, errorMessage };
  }
}
