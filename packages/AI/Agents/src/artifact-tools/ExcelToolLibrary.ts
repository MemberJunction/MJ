/**
 * @fileoverview Artifact tool library for Excel (.xlsx) content.
 *
 * Parses an Excel workbook from a Buffer and exposes tools for inspecting
 * sheets, reading rows, searching cells, aggregating columns, and listing formulas.
 */
import { RegisterClass } from '@memberjunction/global';
import { BaseArtifactToolLibrary, type ArtifactToolDefinition, type ArtifactToolResult } from '@memberjunction/ai-core-plus';

// ---------------------------------------------------------------------------
// Local interfaces for exceljs types (no `any`)
// ---------------------------------------------------------------------------

interface ExcelWorkbook {
  xlsx: { load(buffer: Buffer): Promise<void> };
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
  values: unknown[];
  eachCell(opts: { includeEmpty: boolean }, cb: (cell: ExcelCell, colNumber: number) => void): void;
}

interface ExcelCell {
  value: unknown;
  text: string;
  formula?: string;
  address: string;
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
  // GetToolList
  // -----------------------------------------------------------------------

  public GetToolList(): ArtifactToolDefinition[] {
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
        description: 'Regex search across all cells. Optionally scope to a single sheet. Returns up to 100 matches.',
        inputSchema: {
          type: 'object',
          properties: {
            query: { type: 'string', description: 'Regex pattern to search for' },
            sheet: { type: 'string', description: 'Optional sheet name to limit search scope' },
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
  // InvokeTool — dispatcher
  // -----------------------------------------------------------------------

  public async InvokeTool(toolName: string, input: Record<string, unknown>, artifactContent: string | Buffer): Promise<ArtifactToolResult> {
    const buffer = this.toBuffer(artifactContent);

    let workbook: ExcelWorkbook;
    try {
      const ExcelJS = await import('exceljs');
      workbook = new ExcelJS.default.Workbook() as unknown as ExcelWorkbook;
      await workbook.xlsx.load(buffer);
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

  private handleGetSheetData(workbook: ExcelWorkbook, input: Record<string, unknown>): ArtifactToolResult {
    const sheetName = input.sheet as string;
    const ws = workbook.getWorksheet(sheetName);
    if (!ws) {
      return this.errorResult(`Sheet "${sheetName}" not found.`);
    }

    const startRow = (input.startRow as number) ?? 1;
    const rowCount = (input.rowCount as number) ?? 50;

    const headerMap = this.buildHeaderMap(ws);
    if (headerMap.size === 0) {
      return this.successResult({ rows: [] });
    }

    const rows: Array<Record<string, unknown>> = [];
    // Row 1 is header, data starts at row 2. startRow is 1-based offset after header.
    const firstDataRow = 1 + startRow;
    const lastDataRow = Math.min(1 + startRow + rowCount - 1, ws.rowCount);

    for (let r = firstDataRow; r <= lastDataRow; r++) {
      const row = ws.getRow(r);
      if (!row || !row.values || (row.values as unknown[]).length === 0) continue;

      const record: Record<string, unknown> = {};
      const values = row.values as unknown[];
      for (const [colIndex, colName] of headerMap.entries()) {
        record[colName] = values[colIndex] ?? null;
      }
      rows.push(record);
    }

    return this.successResult({ rows });
  }

  private handleSearchCells(workbook: ExcelWorkbook, input: Record<string, unknown>): ArtifactToolResult {
    const query = input.query as string;
    let regex: RegExp;
    try {
      regex = new RegExp(query, 'i');
    } catch {
      return this.errorResult(`Invalid regex pattern: "${query}".`);
    }

    const targetSheets = input.sheet ? [workbook.getWorksheet(input.sheet as string)] : workbook.worksheets;

    const matches: CellMatch[] = [];
    const MATCH_LIMIT = 100;

    for (const ws of targetSheets) {
      if (!ws) continue;
      ws.eachRow({ includeEmpty: false }, (row) => {
        if (matches.length >= MATCH_LIMIT) return;
        row.eachCell({ includeEmpty: false }, (cell) => {
          if (matches.length >= MATCH_LIMIT) return;
          const text = cell.text ?? String(cell.value ?? '');
          if (regex.test(text)) {
            matches.push({
              sheet: ws.name,
              cell: cell.address,
              value: text,
            });
          }
        });
      });
    }

    if (input.sheet && !targetSheets[0]) {
      return this.errorResult(`Sheet "${input.sheet as string}" not found.`);
    }

    return this.successResult({ matches });
  }

  private handleAggregateColumn(workbook: ExcelWorkbook, input: Record<string, unknown>): ArtifactToolResult {
    const sheetName = input.sheet as string;
    const columnName = input.column as string;
    const operation = input.operation as string;

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
      const values = row.values as unknown[];
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

  private handleGetFormulas(workbook: ExcelWorkbook, input: Record<string, unknown>): ArtifactToolResult {
    const sheetName = input.sheet as string;
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
      case 'sum':
        return values.reduce((acc, v) => acc + v, 0);
      case 'avg': {
        const sum = values.reduce((acc, v) => acc + v, 0);
        return values.length > 0 ? sum / values.length : 0;
      }
      case 'count':
        return values.length;
      case 'min':
        return Math.min(...values);
      case 'max':
        return Math.max(...values);
    }
  }

  // -----------------------------------------------------------------------
  // Helpers
  // -----------------------------------------------------------------------

  private buildHeaderMap(ws: ExcelWorksheet): Map<number, string> {
    const headerRow = ws.getRow(1);
    const headerMap = new Map<number, string>();
    if (!headerRow || !headerRow.values) return headerMap;

    const values = headerRow.values as unknown[];
    for (let i = 1; i < values.length; i++) {
      const val = values[i];
      if (val != null && String(val).trim() !== '') {
        headerMap.set(i, String(val).trim());
      }
    }
    return headerMap;
  }

  private toBuffer(content: string | Buffer): Buffer {
    return typeof content === 'string' ? Buffer.from(content, 'base64') : content;
  }

  private successResult(data: unknown): ArtifactToolResult {
    return { success: true, data };
  }

  private errorResult(errorMessage: string): ArtifactToolResult {
    return { success: false, data: null, errorMessage };
  }
}
