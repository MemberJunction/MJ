import safeRegexCheck from 'safe-regex';
import { RegisterClass } from '@memberjunction/global';
import { BaseArtifactToolLibrary, ArtifactToolDefinition, ArtifactToolResult } from '@memberjunction/ai-core-plus';
import {
    FormatCellAddress,
    ParseCellAddress,
    ParseRangeAddress,
    SpreadsheetCalculatedColumnSpec,
    SpreadsheetCellFormatType,
    SpreadsheetCellSpec,
    SpreadsheetCellValue,
    SpreadsheetChartSpec,
    SpreadsheetChartType,
    SpreadsheetEngine,
    SpreadsheetFilterSpec,
    SpreadsheetLiveTableSpec,
    WorkbookSpec,
    WorksheetSpec
} from '@memberjunction/core-entities';

const MAX_SHEET_ROW_COUNT = 10_000;
const MAX_SHEET_COLUMN_COUNT = 256;
const MAX_INSERT_COUNT = 1_000;
const MAX_READ_RANGE_CELLS = 10_000;
const SEARCH_MATCH_LIMIT = 100;

type AggregateOperation = 'sum' | 'avg' | 'count' | 'min' | 'max';
const VALID_AGGREGATE_OPS: ReadonlySet<string> = new Set<AggregateOperation>(['sum', 'avg', 'count', 'min', 'max']);

/**
 * Server-side and agent tool library for `Excel Spreadsheet` artifacts (`MJ Sheets`, § 3.6 & § 6).
 *
 * Registered under `'SpreadsheetToolLibrary'` via `@RegisterClass(BaseArtifactToolLibrary, 'SpreadsheetToolLibrary')`
 * to match `metadata/artifact-types/.artifact-types.json` (`O1`).
 *
 * All mutations and reads run headlessly on the server through {@link SpreadsheetEngine} (`§ 6.1`, `O7`),
 * so when an agent writes a formula into a cell and reads it back with no browser open, the computed
 * value is immediately accurate (`Accept #3`).
 */
@RegisterClass(BaseArtifactToolLibrary, 'SpreadsheetToolLibrary')
export class SpreadsheetToolLibrary extends BaseArtifactToolLibrary {
    protected override getSubclassToolList(): ArtifactToolDefinition[] {
        return [
            {
                name: 'get_workbook_outline',
                description:
                    'Returns the workbook title, revisionHash, active sheet ID, named ranges, and each worksheet summary (sheetId, name, rowCount, columnCount, cellCount, formulaCount, liveTables, charts, embeddedArtifacts).',
                inputSchema: {
                    type: 'object',
                    properties: {}
                }
            },
            {
                name: 'read_workbook',
                description: 'Alias for get_workbook_outline: returns full workbook structure and worksheet summaries.',
                inputSchema: {
                    type: 'object',
                    properties: {}
                }
            },
            {
                name: 'read_range',
                description:
                    'Reads a cell or rectangular A1 range (e.g. "B4" or "A1:D10") from a worksheet after headless formula evaluation, returning each cell address, stable RowID/ColumnID, rawValue, formula, computedValue, and displayValue.',
                inputSchema: {
                    type: 'object',
                    properties: {
                        sheet: {
                            type: 'string',
                            description: 'Worksheet SheetID or Name (defaults to the active sheet).'
                        },
                        range: {
                            type: 'string',
                            description: 'A1 cell or range to read (e.g. "B4" or "A1:D10").'
                        }
                    },
                    required: ['range']
                }
            },
            {
                name: 'write_cells',
                description:
                    'Writes values, formulas (including =SUM, =VLOOKUP, =MJ.QUERY, =MJ.VIEW), and styles into one or more cells on a worksheet, recalculates all dependent formulas headlessly on the server, and returns the updated cells with their computed values.',
                inputSchema: {
                    type: 'object',
                    properties: {
                        sheet: {
                            type: 'string',
                            description: 'Target worksheet SheetID or Name (defaults to active sheet).'
                        },
                        cells: {
                            type: 'array',
                            description:
                                'Array of cell updates: [{ address: "B4", value?: 100, formula?: "=SUM(B2:B3)", formatType?: "currency" | "percent" | "number" | "integer" | "date", numberFormatPattern?: "$#,##0.00", bold?: true, note?: "..." }].'
                        },
                        expectedRevisionHash: {
                            type: 'string',
                            description: 'Optional optimistic concurrency revision hash from a prior read.'
                        }
                    },
                    required: ['cells']
                }
            },
            {
                name: 'insert_rows',
                description:
                    'Inserts one or more rows at 1-based atRowNumber with stable RowIDs, automatically shifting cells and updating all A1 formulas.',
                inputSchema: {
                    type: 'object',
                    properties: {
                        sheet: { type: 'string', description: 'Target worksheet SheetID or Name.' },
                        atRowNumber: { type: 'number', description: '1-based row number where new rows are inserted.' },
                        count: { type: 'number', description: 'Number of rows to insert (default 1).' },
                        expectedRevisionHash: { type: 'string', description: 'Optional concurrency revision hash.' }
                    },
                    required: ['atRowNumber']
                }
            },
            {
                name: 'insert_columns',
                description:
                    'Inserts one or more columns at 1-based atColumnNumber with stable ColumnIDs, automatically shifting cells and updating all A1 formulas.',
                inputSchema: {
                    type: 'object',
                    properties: {
                        sheet: { type: 'string', description: 'Target worksheet SheetID or Name.' },
                        atColumnNumber: {
                            type: 'number',
                            description: '1-based column number where new columns are inserted.'
                        },
                        count: { type: 'number', description: 'Number of columns to insert (default 1).' },
                        expectedRevisionHash: { type: 'string', description: 'Optional concurrency revision hash.' }
                    },
                    required: ['atColumnNumber']
                }
            },
            {
                name: 'add_sheet',
                description: 'Adds a new worksheet tab to the workbook.',
                inputSchema: {
                    type: 'object',
                    properties: {
                        name: { type: 'string', description: 'Display name for the new worksheet tab.' },
                        rowCount: { type: 'number', description: 'Initial row count (default 25).' },
                        columnCount: { type: 'number', description: 'Initial column count (default 12).' },
                        expectedRevisionHash: { type: 'string', description: 'Optional concurrency revision hash.' }
                    },
                    required: ['name']
                }
            },
            {
                name: 'rename_sheet',
                description: 'Renames an existing worksheet tab.',
                inputSchema: {
                    type: 'object',
                    properties: {
                        sheet: { type: 'string', description: 'Worksheet SheetID or current Name.' },
                        newName: { type: 'string', description: 'New display name (up to 31 characters).' },
                        expectedRevisionHash: { type: 'string', description: 'Optional concurrency revision hash.' }
                    },
                    required: ['sheet', 'newName']
                }
            },
            {
                name: 'delete_sheet',
                description: 'Deletes a worksheet tab from the workbook (requires at least 2 tabs in the workbook).',
                inputSchema: {
                    type: 'object',
                    properties: {
                        sheet: { type: 'string', description: 'Worksheet SheetID or Name to delete.' },
                        expectedRevisionHash: { type: 'string', description: 'Optional concurrency revision hash.' }
                    },
                    required: ['sheet']
                }
            },
            {
                name: 'upsert_live_table',
                description:
                    'Binds or updates an MJ EntityView or SavedQuery range table on a worksheet, with optional calculated formula columns.',
                inputSchema: {
                    type: 'object',
                    properties: {
                        sheet: { type: 'string', description: 'Target worksheet SheetID or Name.' },
                        tableId: { type: 'string', description: 'Optional stable TableID.' },
                        title: { type: 'string', description: 'Display title for the bound table.' },
                        sourceType: {
                            type: 'string',
                            description: '"EntityView" or "SavedQuery".'
                        },
                        entityName: { type: 'string', description: 'Target EntityName when sourceType="EntityView".' },
                        viewId: { type: 'string', description: 'Optional saved User View ID.' },
                        viewName: { type: 'string', description: 'Optional saved User View Name.' },
                        queryId: { type: 'string', description: 'Target Saved Query ID when sourceType="SavedQuery".' },
                        queryName: {
                            type: 'string',
                            description: 'Target Saved Query Name when sourceType="SavedQuery".'
                        },
                        anchorCell: { type: 'string', description: 'Top-left A1 cell (default "A1").' },
                        calculatedColumns: {
                            type: 'array',
                            description:
                                'Optional calculated formula columns: [{ header: "Total", formulaTemplate: "=B{ROW}*C{ROW}", formatType?: "currency" }].'
                        },
                        expectedRevisionHash: { type: 'string', description: 'Optional concurrency revision hash.' }
                    },
                    required: ['sourceType']
                }
            },
            {
                name: 'upsert_chart',
                description:
                    'Adds or updates a range chart on a worksheet and returns its evaluated chart series dataset.',
                inputSchema: {
                    type: 'object',
                    properties: {
                        sheet: { type: 'string', description: 'Target worksheet SheetID or Name.' },
                        chartId: { type: 'string', description: 'Optional stable ChartID.' },
                        title: { type: 'string', description: 'Chart title.' },
                        chartType: {
                            type: 'string',
                            description: '"bar", "line", "pie", or "area".'
                        },
                        sourceRange: {
                            type: 'string',
                            description: 'A1 source range on the worksheet (e.g. "A1:C6").'
                        },
                        positionCell: {
                            type: 'string',
                            description: 'Anchor cell for the chart card (default "E2").'
                        },
                        expectedRevisionHash: { type: 'string', description: 'Optional concurrency revision hash.' }
                    },
                    required: ['sourceRange']
                }
            },
            {
                name: 'embed_artifact',
                description:
                    'Embeds an inline OLE Artifact (such as an interactive Whiteboard) anchored to a worksheet cell.',
                inputSchema: {
                    type: 'object',
                    properties: {
                        sheet: { type: 'string', description: 'Target worksheet SheetID or Name.' },
                        embedId: { type: 'string', description: 'Optional stable EmbedID.' },
                        title: { type: 'string', description: 'Display title.' },
                        artifactId: { type: 'string', description: 'Target MJ: Artifacts UUID.' },
                        artifactTypeName: {
                            type: 'string',
                            description: 'Artifact type name (e.g. "Whiteboard").'
                        },
                        anchorCell: { type: 'string', description: 'Anchor A1 cell (default "F2").' },
                        expectedRevisionHash: { type: 'string', description: 'Optional concurrency revision hash.' }
                    },
                    required: ['artifactId']
                }
            },
            {
                name: 'sort_and_filter',
                description: 'Sorts a worksheet by a column and/or applies column filters.',
                inputSchema: {
                    type: 'object',
                    properties: {
                        sheet: { type: 'string', description: 'Target worksheet SheetID or Name.' },
                        sortColumn: { type: 'string', description: 'Optional column letter to sort by (e.g. "B").' },
                        sortDirection: { type: 'string', description: '"asc" or "desc" (default "asc").' },
                        filters: {
                            type: 'array',
                            description:
                                'Optional filter specs: [{ columnLetter: "A", operator: "equals" | "contains" | "gt" | "lt" | "notEmpty", value: "..." }].'
                        },
                        expectedRevisionHash: { type: 'string', description: 'Optional concurrency revision hash.' }
                    }
                }
            },
            {
                name: 'get_sheets',
                description: 'Returns sheet names, row counts, and column counts for every sheet in the workbook.',
                inputSchema: { type: 'object', properties: {}, required: [] }
            },
            {
                name: 'get_sheet_data',
                description:
                    'Returns rows from a sheet as key-value objects using the header row as keys. Defaults to first 50 data rows (capped at 10,000).',
                inputSchema: {
                    type: 'object',
                    properties: {
                        sheet: { type: 'string', description: 'Sheet name or SheetID' },
                        startRow: { type: 'number', description: '1-based data row to start from (after header). Default: 1' },
                        rowCount: { type: 'number', description: 'Number of data rows to return (max 10,000). Default: 50' }
                    },
                    required: ['sheet']
                }
            },
            {
                name: 'search_cells',
                description: 'Regex search across all cells. Optionally scope to a single sheet. Returns up to 100 matches.',
                inputSchema: {
                    type: 'object',
                    properties: {
                        query: { type: 'string', description: 'Regex pattern to search for' },
                        sheet: { type: 'string', description: 'Optional sheet name or SheetID to limit search scope' }
                    },
                    required: ['query']
                }
            },
            {
                name: 'aggregate_column',
                description: 'Computes an aggregate (sum, avg, count, min, max) on a column identified by its header name.',
                inputSchema: {
                    type: 'object',
                    properties: {
                        sheet: { type: 'string', description: 'Sheet name or SheetID' },
                        column: { type: 'string', description: 'Column header name' },
                        operation: { type: 'string', description: 'Aggregate operation: sum, avg, count, min, max' }
                    },
                    required: ['sheet', 'column', 'operation']
                }
            },
            {
                name: 'get_formulas',
                description: 'Returns all cells containing formulas in a given sheet.',
                inputSchema: {
                    type: 'object',
                    properties: {
                        sheet: { type: 'string', description: 'Sheet name or SheetID' }
                    },
                    required: ['sheet']
                }
            }
        ];
    }

    private activeOriginalXlsxBytes: Uint8Array | null = null;

    protected override async invokeSubclassTool(
        toolName: string,
        input: Record<string, unknown>,
        artifactContent: string | Buffer
    ): Promise<ArtifactToolResult> {
        const engine = SpreadsheetEngine.Instance;
        let workbook: WorkbookSpec;
        this.activeOriginalXlsxBytes =
            Buffer.isBuffer(artifactContent) &&
            artifactContent.length > 4 &&
            artifactContent[0] === 0x50 &&
            artifactContent[1] === 0x4b
                ? new Uint8Array(artifactContent)
                : null;
        try {
            workbook = this.loadWorkbookFromContent(artifactContent);
        } catch (err) {
            this.activeOriginalXlsxBytes = null;
            return this.errorResult(`Failed to parse spreadsheet content: ${err instanceof Error ? err.message : String(err)}`);
        }
        const currentHash = engine.ComputeRevisionHash(workbook);

        const expectedHash =
            typeof input.expectedRevisionHash === 'string' ? input.expectedRevisionHash.trim() : '';
        if (expectedHash && expectedHash !== currentHash) {
            return this.errorResult(
                `Revision conflict: expectedRevisionHash '${expectedHash}' does not match current workbook revision '${currentHash}'. Re-read the workbook before retrying.`
            );
        }

        switch (toolName) {
            case 'get_workbook_outline':
            case 'read_workbook':
                return this.handleGetWorkbookOutline(workbook, currentHash);
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
            case 'read_range':
                return this.handleReadRange(workbook, input, currentHash);
            case 'write_cells':
                return this.handleWriteCells(workbook, input);
            case 'insert_rows':
                return this.handleInsertRows(workbook, input);
            case 'insert_columns':
                return this.handleInsertColumns(workbook, input);
            case 'add_sheet':
                return this.handleAddSheet(workbook, input);
            case 'rename_sheet':
                return this.handleRenameSheet(workbook, input);
            case 'delete_sheet':
                return this.handleDeleteSheet(workbook, input);
            case 'upsert_live_table':
                return this.handleUpsertLiveTable(workbook, input);
            case 'upsert_chart':
                return this.handleUpsertChart(workbook, input);
            case 'embed_artifact':
                return this.handleEmbedArtifact(workbook, input);
            case 'sort_and_filter':
                return this.handleSortAndFilter(workbook, input);
            default:
                return this.errorResult(`Unknown SpreadsheetToolLibrary tool '${toolName}'.`);
        }
    }

    private loadWorkbookFromContent(artifactContent: string | Buffer): WorkbookSpec {
        const engine = SpreadsheetEngine.Instance;
        if (Buffer.isBuffer(artifactContent)) {
            if (
                artifactContent.length > 4 &&
                artifactContent[0] === 0x50 &&
                artifactContent[1] === 0x4b
            ) {
                return engine.ImportFromXlsxBytes(new Uint8Array(artifactContent));
            }
            return engine.ParseWorkbook(artifactContent.toString('utf-8'));
        }
        return engine.ParseWorkbook(artifactContent);
    }

    private resolveSheet(workbook: WorkbookSpec, sheetArg: unknown): WorksheetSpec | null {
        const engine = SpreadsheetEngine.Instance;
        if (typeof sheetArg === 'string' && sheetArg.trim().length > 0) {
            return engine.GetWorksheet(workbook, sheetArg.trim()) ?? null;
        }
        return (
            engine.GetWorksheet(workbook, workbook.ActiveSheetID) ??
            workbook.Worksheets[0] ??
            null
        );
    }

    private buildMutationSuccess(
        workbook: WorkbookSpec,
        extra: Record<string, unknown>
    ): ArtifactToolResult {
        const engine = SpreadsheetEngine.Instance;
        engine.EvaluateWorkbook(workbook);
        const serializedJson = engine.SerializeWorkbook(workbook);
        const xlsxBytes = this.activeOriginalXlsxBytes
            ? engine.PatchXlsxBytes(this.activeOriginalXlsxBytes, workbook)
            : engine.ExportToXlsxBytes(workbook);
        const xlsxBase64 = Buffer.from(xlsxBytes).toString('base64');
        const revisionHash = engine.ComputeRevisionHash(workbook);
        return this.successResult({
            ...extra,
            revisionHash,
            updatedContent: serializedJson,
            xlsxBase64
        });
    }

    private handleGetWorkbookOutline(
        workbook: WorkbookSpec,
        revisionHash: string
    ): ArtifactToolResult {
        SpreadsheetEngine.Instance.EvaluateWorkbook(workbook);
        return this.successResult({
            workbookId: workbook.WorkbookID,
            title: workbook.Title,
            activeSheetId: workbook.ActiveSheetID,
            revisionHash,
            namedRanges: workbook.NamedRanges,
            sheets: workbook.Worksheets.map((ws) => {
                const cells = Object.values(ws.Cells);
                const formulaCount = cells.filter((c) => Boolean(c.Formula)).length;
                return {
                    sheetId: ws.SheetID,
                    name: ws.Name,
                    rowCount: ws.Rows.length,
                    columnCount: ws.Columns.length,
                    populatedCellCount: cells.length,
                    formulaCount,
                    frozenRows: ws.FrozenRows,
                    frozenColumns: ws.FrozenColumns,
                    liveTables: ws.LiveTables,
                    charts: ws.Charts,
                    embeddedArtifacts: ws.EmbeddedArtifacts
                };
            })
        });
    }

    private handleReadRange(
        workbook: WorkbookSpec,
        input: Record<string, unknown>,
        revisionHash: string
    ): ArtifactToolResult {
        const engine = SpreadsheetEngine.Instance;
        engine.EvaluateWorkbook(workbook);
        const sheet = this.resolveSheet(workbook, input.sheet ?? input.sheetName);
        if (!sheet) {
            return this.errorResult(`Worksheet '${String(input.sheet ?? input.sheetName ?? '')}' not found.`);
        }
        const range = typeof input.range === 'string' ? input.range.trim() : '';
        if (!range) {
            return this.errorResult('Parameter "range" is required (e.g. "B4" or "A1:D10").');
        }
        const bounds = ParseRangeAddress(range);
        if (!bounds) {
            return this.errorResult(`Invalid A1 range '${range}'.`);
        }
        const requestedCellCount =
            (bounds.endRow - bounds.startRow + 1) * (bounds.endCol - bounds.startCol + 1);
        if (requestedCellCount > MAX_READ_RANGE_CELLS) {
            return this.errorResult(
                `Requested range '${range}' spans ${requestedCellCount} cells, exceeding the maximum read_range limit of ${MAX_READ_RANGE_CELLS} cells.`
            );
        }
        if (bounds.endRow > MAX_SHEET_ROW_COUNT || bounds.endCol > MAX_SHEET_COLUMN_COUNT) {
            return this.errorResult(
                `Requested range '${range}' exceeds worksheet bounds (max ${MAX_SHEET_ROW_COUNT} rows x ${MAX_SHEET_COLUMN_COUNT} columns).`
            );
        }
        try {
            const grid = engine.ReadRange(workbook, sheet.SheetID, range);
            const flatCells = grid.flat().map((c) => ({
                address: c.Address,
                rowId: c.RowID,
                columnId: c.ColumnID,
                rawValue: c.RawValue,
                formula: c.Formula ?? null,
                formulaStable: c.FormulaStable ?? null,
                computedValue: c.ComputedValue ?? c.RawValue ?? null,
                displayValue:
                    c.DisplayValue ??
                    engine.FormatCellValue(c.ComputedValue ?? c.RawValue ?? null, c.Style)
            }));
            return this.successResult({
                sheetId: sheet.SheetID,
                sheetName: sheet.Name,
                range,
                revisionHash,
                cell: flatCells.length === 1 ? flatCells[0] : undefined,
                cells: flatCells,
                matrix: grid.map((row) =>
                    row.map((c) => c.ComputedValue ?? c.RawValue ?? null)
                )
            });
        } catch (err) {
            return this.errorResult(err instanceof Error ? err.message : String(err));
        }
    }

    private handleWriteCells(
        workbook: WorkbookSpec,
        input: Record<string, unknown>
    ): ArtifactToolResult {
        const engine = SpreadsheetEngine.Instance;
        const sheet = this.resolveSheet(workbook, input.sheet);
        if (!sheet) {
            return this.errorResult(`Worksheet '${String(input.sheet ?? '')}' not found.`);
        }
        const rawCells = Array.isArray(input.cells) ? input.cells : [];
        if (rawCells.length === 0) {
            return this.errorResult('Parameter "cells" must be a non-empty array of cell updates.');
        }

        const updatedAddresses: string[] = [];
        for (const item of rawCells) {
            if (!item || typeof item !== 'object') continue;
            const rec = item as Record<string, unknown>;
            const addr = typeof rec.address === 'string' ? rec.address.trim() : '';
            const parsedAddr = addr ? ParseCellAddress(addr) : null;
            if (!addr || !parsedAddr) {
                return this.errorResult(`Invalid cell address '${addr}'.`);
            }
            if (parsedAddr.row > MAX_SHEET_ROW_COUNT || parsedAddr.col > MAX_SHEET_COLUMN_COUNT) {
                return this.errorResult(
                    `Cell address '${addr}' exceeds maximum worksheet bounds (${MAX_SHEET_ROW_COUNT} rows x ${MAX_SHEET_COLUMN_COUNT} columns).`
                );
            }
            const val =
                rec.value === null ||
                typeof rec.value === 'string' ||
                typeof rec.value === 'number' ||
                typeof rec.value === 'boolean'
                    ? (rec.value as SpreadsheetCellValue)
                    : undefined;
            const formula = typeof rec.formula === 'string' ? rec.formula : undefined;
            const formatType =
                typeof rec.formatType === 'string'
                    ? (rec.formatType as SpreadsheetCellFormatType)
                    : undefined;
            const numberFormatPattern =
                typeof rec.numberFormatPattern === 'string' ? rec.numberFormatPattern : undefined;
            const bold = typeof rec.bold === 'boolean' ? rec.bold : undefined;
            const note = typeof rec.note === 'string' ? rec.note : undefined;

            engine.SetCell(
                workbook,
                sheet.SheetID,
                addr,
                {
                    Value: val,
                    Formula: formula,
                    Style:
                        formatType || numberFormatPattern || bold !== undefined
                            ? {
                                  FormatType: formatType,
                                  NumberFormatPattern:
                                      numberFormatPattern ??
                                      engine.DefaultPatternForFormatType(formatType),
                                  Bold: bold
                              }
                            : undefined,
                    Note: note
                },
                false
            );
            const p = ParseCellAddress(addr)!;
            updatedAddresses.push(FormatCellAddress(p.row, p.col));
        }

        engine.EvaluateWorkbook(workbook);
        const updatedCells: SpreadsheetCellSpec[] = updatedAddresses
            .map((a) => sheet.Cells[a])
            .filter((c): c is SpreadsheetCellSpec => Boolean(c));

        return this.buildMutationSuccess(workbook, {
            sheetId: sheet.SheetID,
            updatedCells: updatedCells.map((c) => ({
                address: c.Address,
                rowId: c.RowID,
                columnId: c.ColumnID,
                rawValue: c.RawValue,
                formula: c.Formula ?? null,
                formulaStable: c.FormulaStable ?? null,
                computedValue: c.ComputedValue ?? null,
                displayValue: c.DisplayValue ?? ''
            }))
        });
    }

    private handleInsertRows(
        workbook: WorkbookSpec,
        input: Record<string, unknown>
    ): ArtifactToolResult {
        const sheet = this.resolveSheet(workbook, input.sheet);
        if (!sheet) {
            return this.errorResult(`Worksheet '${String(input.sheet ?? '')}' not found.`);
        }
        const atRow = Math.max(1, Math.trunc(Number(input.atRowNumber) || 1));
        const rawCount = input.count !== undefined ? Math.trunc(Number(input.count)) : 1;
        if (Number.isNaN(rawCount) || rawCount < 1 || rawCount > MAX_INSERT_COUNT) {
            return this.errorResult(`Insert row count must be between 1 and ${MAX_INSERT_COUNT}.`);
        }
        if (sheet.Rows.length + rawCount > MAX_SHEET_ROW_COUNT) {
            return this.errorResult(`Cannot exceed maximum worksheet row count (${MAX_SHEET_ROW_COUNT}).`);
        }
        const inserted = SpreadsheetEngine.Instance.InsertRows(workbook, sheet.SheetID, atRow, rawCount);
        return this.buildMutationSuccess(workbook, {
            sheetId: sheet.SheetID,
            insertedRowIds: inserted.map((r) => r.RowID),
            rowCount: sheet.Rows.length
        });
    }

    private handleInsertColumns(
        workbook: WorkbookSpec,
        input: Record<string, unknown>
    ): ArtifactToolResult {
        const sheet = this.resolveSheet(workbook, input.sheet);
        if (!sheet) {
            return this.errorResult(`Worksheet '${String(input.sheet ?? '')}' not found.`);
        }
        const atCol = Math.max(1, Math.trunc(Number(input.atColumnNumber) || 1));
        const rawCount = input.count !== undefined ? Math.trunc(Number(input.count)) : 1;
        if (Number.isNaN(rawCount) || rawCount < 1 || rawCount > MAX_INSERT_COUNT) {
            return this.errorResult(`Insert column count must be between 1 and ${MAX_INSERT_COUNT}.`);
        }
        if (sheet.Columns.length + rawCount > MAX_SHEET_COLUMN_COUNT) {
            return this.errorResult(`Cannot exceed maximum worksheet column count (${MAX_SHEET_COLUMN_COUNT}).`);
        }
        const inserted = SpreadsheetEngine.Instance.InsertColumns(workbook, sheet.SheetID, atCol, rawCount);
        return this.buildMutationSuccess(workbook, {
            sheetId: sheet.SheetID,
            insertedColumnIds: inserted.map((c) => c.ColumnID),
            columnCount: sheet.Columns.length
        });
    }

    private handleAddSheet(
        workbook: WorkbookSpec,
        input: Record<string, unknown>
    ): ArtifactToolResult {
        const name = typeof input.name === 'string' ? input.name.trim() : '';
        if (!name) {
            return this.errorResult('Parameter "name" is required.');
        }
        const rawRows = input.rowCount !== undefined ? Math.trunc(Number(input.rowCount)) : 25;
        const rawCols = input.columnCount !== undefined ? Math.trunc(Number(input.columnCount)) : 12;
        if (Number.isNaN(rawRows) || rawRows < 1 || rawRows > MAX_SHEET_ROW_COUNT) {
            return this.errorResult(`Parameter "rowCount" must be between 1 and ${MAX_SHEET_ROW_COUNT}.`);
        }
        if (Number.isNaN(rawCols) || rawCols < 1 || rawCols > MAX_SHEET_COLUMN_COUNT) {
            return this.errorResult(`Parameter "columnCount" must be between 1 and ${MAX_SHEET_COLUMN_COUNT}.`);
        }
        const ws = SpreadsheetEngine.Instance.AddWorksheet(workbook, name, rawRows, rawCols);
        return this.buildMutationSuccess(workbook, {
            sheetId: ws.SheetID,
            name: ws.Name
        });
    }

    private handleRenameSheet(
        workbook: WorkbookSpec,
        input: Record<string, unknown>
    ): ArtifactToolResult {
        const sheet = this.resolveSheet(workbook, input.sheet);
        if (!sheet) {
            return this.errorResult(`Worksheet '${String(input.sheet ?? '')}' not found.`);
        }
        const newName = typeof input.newName === 'string' ? input.newName.replace(/[\[\]:*?/\\]/g, ' ').trim().slice(0, 31) : '';
        if (!newName) {
            return this.errorResult('Parameter "newName" is required.');
        }
        if (workbook.Worksheets.some((w) => w.SheetID !== sheet.SheetID && w.Name.toLowerCase() === newName.toLowerCase())) {
            return this.errorResult(`A worksheet named '${newName}' already exists.`);
        }
        if (!SpreadsheetEngine.Instance.RenameWorksheet(workbook, sheet.SheetID, newName, false)) {
            return this.errorResult(`Failed to rename worksheet '${sheet.Name}' to '${newName}'.`);
        }
        return this.buildMutationSuccess(workbook, {
            sheetId: sheet.SheetID,
            name: sheet.Name
        });
    }

    private handleDeleteSheet(
        workbook: WorkbookSpec,
        input: Record<string, unknown>
    ): ArtifactToolResult {
        if (workbook.Worksheets.length <= 1) {
            return this.errorResult('Cannot delete the only worksheet in the workbook.');
        }
        const sheet = this.resolveSheet(workbook, input.sheet);
        if (!sheet) {
            return this.errorResult(`Worksheet '${String(input.sheet ?? '')}' not found.`);
        }
        workbook.Worksheets = workbook.Worksheets.filter((w) => w.SheetID !== sheet.SheetID);
        if (workbook.ActiveSheetID === sheet.SheetID) {
            workbook.ActiveSheetID = workbook.Worksheets[0].SheetID;
        }
        return this.buildMutationSuccess(workbook, {
            deletedSheetId: sheet.SheetID,
            remainingSheetIds: workbook.Worksheets.map((w) => w.SheetID)
        });
    }

    private handleUpsertLiveTable(
        workbook: WorkbookSpec,
        input: Record<string, unknown>
    ): ArtifactToolResult {
        const sheet = this.resolveSheet(workbook, input.sheet);
        if (!sheet) {
            return this.errorResult(`Worksheet '${String(input.sheet ?? '')}' not found.`);
        }
        const sourceType = input.sourceType === 'SavedQuery' ? 'SavedQuery' : 'EntityView';
        const tableId =
            typeof input.tableId === 'string' && input.tableId.trim()
                ? input.tableId.trim()
                : `tbl-${Date.now().toString(36)}`;
        const rawCalcCols = Array.isArray(input.calculatedColumns) ? input.calculatedColumns : [];
        const calcCols: SpreadsheetCalculatedColumnSpec[] = rawCalcCols
            .filter((c): c is Record<string, unknown> => Boolean(c && typeof c === 'object'))
            .map((c) => ({
                Header: String(c.header ?? c.Header ?? 'Calculated'),
                FormulaTemplate: String(c.formulaTemplate ?? c.FormulaTemplate ?? '=0'),
                FormatType:
                    typeof c.formatType === 'string'
                        ? (c.formatType as SpreadsheetCellFormatType)
                        : undefined
            }));

        const spec: SpreadsheetLiveTableSpec = {
            TableID: tableId,
            Title: String(input.title ?? input.entityName ?? input.queryName ?? 'Live Data Table'),
            SourceType: sourceType,
            EntityName: typeof input.entityName === 'string' ? input.entityName : undefined,
            ViewID: typeof input.viewId === 'string' ? input.viewId : undefined,
            ViewName: typeof input.viewName === 'string' ? input.viewName : undefined,
            QueryID: typeof input.queryId === 'string' ? input.queryId : undefined,
            QueryName: typeof input.queryName === 'string' ? input.queryName : undefined,
            AnchorCell: typeof input.anchorCell === 'string' ? input.anchorCell : 'A1',
            IncludeHeaders: true,
            Mode: 'Live',
            CalculatedColumns: calcCols
        };

        const existingIdx = sheet.LiveTables.findIndex((t) => t.TableID === tableId);
        if (existingIdx >= 0) {
            sheet.LiveTables[existingIdx] = spec;
        } else {
            sheet.LiveTables.push(spec);
        }

        return this.buildMutationSuccess(workbook, {
            sheetId: sheet.SheetID,
            liveTable: spec
        });
    }

    private handleUpsertChart(
        workbook: WorkbookSpec,
        input: Record<string, unknown>
    ): ArtifactToolResult {
        const sheet = this.resolveSheet(workbook, input.sheet);
        if (!sheet) {
            return this.errorResult(`Worksheet '${String(input.sheet ?? '')}' not found.`);
        }
        const sourceRange = typeof input.sourceRange === 'string' ? input.sourceRange.trim() : '';
        if (!sourceRange) {
            return this.errorResult('Parameter "sourceRange" is required.');
        }
        const chartId =
            typeof input.chartId === 'string' && input.chartId.trim()
                ? input.chartId.trim()
                : `chart-${sheet.Charts.length + 1}`;
        const chartTypeRaw = typeof input.chartType === 'string' ? input.chartType.toLowerCase() : 'bar';
        const chartType: SpreadsheetChartType =
            chartTypeRaw === 'line' || chartTypeRaw === 'pie' || chartTypeRaw === 'area'
                ? chartTypeRaw
                : 'bar';

        const chartSpec: SpreadsheetChartSpec = {
            ChartID: chartId,
            Title: typeof input.title === 'string' ? input.title : `Chart (${sourceRange})`,
            ChartType: chartType,
            SheetID: sheet.SheetID,
            SourceRange: sourceRange,
            PositionCell: typeof input.positionCell === 'string' ? input.positionCell : 'E2',
            ShowLegend: true
        };

        const idx = sheet.Charts.findIndex((c) => c.ChartID === chartId);
        if (idx >= 0) {
            sheet.Charts[idx] = chartSpec;
        } else {
            sheet.Charts.push(chartSpec);
        }

        const dataset = SpreadsheetEngine.Instance.ExtractChartDataset(
            workbook,
            sheet.SheetID,
            chartId
        );

        return this.buildMutationSuccess(workbook, {
            sheetId: sheet.SheetID,
            chart: chartSpec,
            dataset
        });
    }

    private handleEmbedArtifact(
        workbook: WorkbookSpec,
        input: Record<string, unknown>
    ): ArtifactToolResult {
        const sheet = this.resolveSheet(workbook, input.sheet);
        if (!sheet) {
            return this.errorResult(`Worksheet '${String(input.sheet ?? '')}' not found.`);
        }
        const artifactId = typeof input.artifactId === 'string' ? input.artifactId.trim() : '';
        if (!artifactId) {
            return this.errorResult('Parameter "artifactId" is required.');
        }
        const embedId =
            typeof input.embedId === 'string' && input.embedId.trim()
                ? input.embedId.trim()
                : `embed-${sheet.EmbeddedArtifacts.length + 1}`;
        const typeName =
            typeof input.artifactTypeName === 'string' ? input.artifactTypeName : 'Whiteboard';
        const spec = {
            EmbedID: embedId,
            Title: typeof input.title === 'string' ? input.title : `${typeName} Canvas`,
            ArtifactID: artifactId,
            ArtifactTypeName: typeName,
            DriverClass:
                typeName === 'Whiteboard' ? 'WhiteboardArtifactViewerPlugin' : undefined,
            AnchorCell: typeof input.anchorCell === 'string' ? input.anchorCell : 'F2',
            WidthPx: 520,
            HeightPx: 320,
            AllowInlineEdit: true
        };
        const idx = sheet.EmbeddedArtifacts.findIndex((e) => e.EmbedID === embedId);
        if (idx >= 0) {
            sheet.EmbeddedArtifacts[idx] = spec;
        } else {
            sheet.EmbeddedArtifacts.push(spec);
        }
        return this.buildMutationSuccess(workbook, {
            sheetId: sheet.SheetID,
            embeddedArtifact: spec
        });
    }

    private handleSortAndFilter(
        workbook: WorkbookSpec,
        input: Record<string, unknown>
    ): ArtifactToolResult {
        const engine = SpreadsheetEngine.Instance;
        const sheet = this.resolveSheet(workbook, input.sheet);
        if (!sheet) {
            return this.errorResult(`Worksheet '${String(input.sheet ?? '')}' not found.`);
        }
        if (typeof input.sortColumn === 'string' && input.sortColumn.trim()) {
            engine.SortWorksheet(workbook, sheet.SheetID, {
                ColumnLetter: input.sortColumn.trim().toUpperCase(),
                Direction: input.sortDirection === 'desc' ? 'desc' : 'asc',
                HeaderRows: 1
            });
        }
        if (Array.isArray(input.filters)) {
            sheet.FilterSpecs = input.filters
                .filter((f): f is Record<string, unknown> => Boolean(f && typeof f === 'object'))
                .map((f) => ({
                    ColumnLetter: String(f.columnLetter ?? 'A').toUpperCase(),
                    Operator: (f.operator as SpreadsheetFilterSpec['Operator']) ?? 'contains',
                    Value: String(f.value ?? '')
                }));
            engine.ApplyWorksheetFilters(workbook, sheet.SheetID);
        }
        return this.buildMutationSuccess(workbook, {
            sheetId: sheet.SheetID,
            sortSpec: sheet.SortSpec,
            filterSpecs: sheet.FilterSpecs,
            visibleRowCount: sheet.Rows.filter((r) => !r.Hidden).length
        });
    }

    // -----------------------------------------------------------------------
    // ExcelToolLibrary Parity Inspection Tools (E6)
    // -----------------------------------------------------------------------

    private handleGetSheets(workbook: WorkbookSpec): ArtifactToolResult {
        SpreadsheetEngine.Instance.EvaluateWorkbook(workbook);
        const sheets = workbook.Worksheets.map((ws) => {
            const bounds = this.getPopulatedBounds(ws);
            return {
                sheetId: ws.SheetID,
                name: ws.Name,
                rowCount: bounds.maxRow > 0 ? bounds.maxRow : ws.Rows.length,
                columnCount: bounds.maxCol > 0 ? bounds.maxCol : ws.Columns.length
            };
        });
        return this.successResult({ sheets });
    }

    private handleGetSheetData(
        workbook: WorkbookSpec,
        input: Record<string, unknown>
    ): ArtifactToolResult {
        SpreadsheetEngine.Instance.EvaluateWorkbook(workbook);
        const sheetArg = input.sheet ?? input.sheetName;
        const ws = this.resolveSheet(workbook, sheetArg);
        if (!ws) {
            return this.errorResult(`Sheet "${String(sheetArg ?? '')}" not found.`);
        }

        const startRow = Math.max(1, Math.trunc(Number(input.startRow ?? 1) || 1));
        const requestedRowCount = Math.trunc(Number(input.rowCount ?? 50) || 50);
        if (requestedRowCount < 1) {
            return this.errorResult('Parameter "rowCount" must be >= 1.');
        }
        const rowCount = Math.min(MAX_SHEET_ROW_COUNT, requestedRowCount);

        const headerMap = this.buildWorksheetHeaderMap(ws);
        if (headerMap.size === 0) {
            return this.successResult({ rows: [] });
        }

        const bounds = this.getPopulatedBounds(ws);
        const firstDataRow = 1 + startRow;
        const lastDataRow = Math.min(1 + startRow + rowCount - 1, bounds.maxRow);
        const rows: Array<Record<string, unknown>> = [];

        for (let r = firstDataRow; r <= lastDataRow; r++) {
            let hasAnyCellInRow = false;
            const record: Record<string, unknown> = {};
            for (const [colIdx, colName] of headerMap.entries()) {
                const addr = FormatCellAddress(r, colIdx);
                const cell = ws.Cells[addr];
                const val = cell ? (cell.ComputedValue ?? cell.RawValue ?? null) : null;
                if (val !== null && val !== undefined && val !== '') {
                    hasAnyCellInRow = true;
                }
                record[colName] = val;
            }
            if (hasAnyCellInRow) {
                rows.push(record);
            }
        }

        return this.successResult({ rows });
    }

    private handleSearchCells(
        workbook: WorkbookSpec,
        input: Record<string, unknown>
    ): ArtifactToolResult {
        const engine = SpreadsheetEngine.Instance;
        engine.EvaluateWorkbook(workbook);
        const query = typeof input.query === 'string' ? input.query : '';
        if (!query) {
            return this.errorResult('Parameter "query" is required.');
        }
        if (query.length > 256) {
            return this.errorResult('Unsafe or overly complex regular expression rejected');
        }
        let regex: RegExp | null = null;
        if (input.useRegex !== false) {
            try {
                regex = new RegExp(query, 'i');
            } catch {
                if (input.useRegex === true) {
                    return this.errorResult(`Invalid regex pattern: "${query}".`);
                }
                regex = null;
            }
            if (regex && !this.isSafeSearchRegex(query)) {
                return this.errorResult('Unsafe or overly complex regular expression rejected');
            }
        }
        const literalNeedle = query.toLowerCase();

        const sheetScope = input.sheet ?? input.sheetName;
        let targetSheets: WorksheetSpec[];
        if (typeof sheetScope === 'string' && sheetScope.trim().length > 0) {
            const found = engine.GetWorksheet(workbook, sheetScope.trim());
            if (!found) {
                return this.errorResult(`Sheet "${sheetScope}" not found.`);
            }
            targetSheets = [found];
        } else {
            targetSheets = workbook.Worksheets;
        }

        const matches: Array<{ sheet: string; cell: string; value: string }> = [];
        for (const ws of targetSheets) {
            if (matches.length >= SEARCH_MATCH_LIMIT) break;
            const sortedCells = Object.values(ws.Cells).sort((a, b) => {
                const pa = ParseCellAddress(a.Address);
                const pb = ParseCellAddress(b.Address);
                if (!pa || !pb) return 0;
                return pa.row !== pb.row ? pa.row - pb.row : pa.col - pb.col;
            });
            for (const cell of sortedCells) {
                if (matches.length >= SEARCH_MATCH_LIMIT) break;
                const val = cell.ComputedValue ?? cell.RawValue;
                if (val === null || val === undefined || val === '') continue;
                const text = cell.DisplayValue || String(val);
                const matched = regex
                    ? (regex.test(text) || regex.test(String(val)))
                    : (text.toLowerCase().includes(literalNeedle) || String(val).toLowerCase().includes(literalNeedle));
                if (matched) {
                    matches.push({
                        sheet: ws.Name,
                        cell: cell.Address,
                        value: text
                    });
                }
            }
        }

        return this.successResult({ matches });
    }

    private isSafeSearchRegex(pattern: string): boolean {
        if (!pattern || pattern.length > 256 || !safeRegexCheck(pattern) || /\\[1-9]/.test(pattern)) {
            return false;
        }
        const groupStack: Array<{ hasAlternation: boolean }> = [];
        let inCharClass = false;
        for (let i = 0; i < pattern.length; i++) {
            const ch = pattern[i];
            if (ch === '\\') {
                i++;
                continue;
            }
            if (inCharClass) {
                if (ch === ']') inCharClass = false;
                continue;
            }
            if (ch === '[') {
                inCharClass = true;
                continue;
            }
            if (ch === '(') {
                groupStack.push({ hasAlternation: false });
                continue;
            }
            if (ch === '|' && groupStack.length > 0) {
                groupStack[groupStack.length - 1].hasAlternation = true;
                continue;
            }
            if (ch === ')' && groupStack.length > 0) {
                const closed = groupStack.pop()!;
                let nextIdx = i + 1;
                while (nextIdx < pattern.length && /\s/.test(pattern[nextIdx])) nextIdx++;
                const nextCh = pattern[nextIdx];
                if (closed.hasAlternation && (nextCh === '*' || nextCh === '+' || nextCh === '{')) {
                    return false;
                }
                if (closed.hasAlternation && groupStack.length > 0) {
                    groupStack[groupStack.length - 1].hasAlternation = true;
                }
            }
        }
        return true;
    }

    private handleAggregateColumn(
        workbook: WorkbookSpec,
        input: Record<string, unknown>
    ): ArtifactToolResult {
        SpreadsheetEngine.Instance.EvaluateWorkbook(workbook);
        const sheetArg = input.sheet ?? input.sheetName;
        const columnName = typeof input.column === 'string' ? input.column.trim() : '';
        const operation = typeof input.operation === 'string' ? input.operation.trim().toLowerCase() : '';

        const ws = this.resolveSheet(workbook, sheetArg);
        if (!ws) {
            return this.errorResult(`Sheet "${String(sheetArg ?? '')}" not found.`);
        }
        if (!VALID_AGGREGATE_OPS.has(operation)) {
            return this.errorResult(
                `Unsupported aggregate operation: "${operation}". Valid operations: ${[...VALID_AGGREGATE_OPS].join(', ')}.`
            );
        }

        const headerMap = this.buildWorksheetHeaderMap(ws);
        let targetCol = -1;
        for (const [colIdx, name] of headerMap.entries()) {
            if (name === columnName || name.toLowerCase() === columnName.toLowerCase()) {
                targetCol = colIdx;
                break;
            }
        }
        if (targetCol === -1) {
            return this.errorResult(
                `Column "${columnName}" not found in sheet "${ws.Name}". Available columns: ${[...headerMap.values()].join(', ')}.`
            );
        }

        const bounds = this.getPopulatedBounds(ws);
        const numericValues: number[] = [];
        for (let r = 2; r <= bounds.maxRow; r++) {
            const addr = FormatCellAddress(r, targetCol);
            const cell = ws.Cells[addr];
            const raw = cell ? (cell.ComputedValue ?? cell.RawValue) : null;
            if (raw === null || raw === undefined || raw === '') continue;
            const num = typeof raw === 'number' ? raw : Number(raw);
            if (!Number.isNaN(num)) {
                numericValues.push(num);
            }
        }

        if (operation === 'count') {
            return this.successResult({ operation, column: columnName, value: numericValues.length });
        }
        if (numericValues.length === 0) {
            return this.errorResult(`No numeric values found in column "${columnName}".`);
        }

        let value: number;
        switch (operation as AggregateOperation) {
            case 'sum':
                value = numericValues.reduce((acc, v) => acc + v, 0);
                break;
            case 'avg':
                value = numericValues.reduce((acc, v) => acc + v, 0) / numericValues.length;
                break;
            case 'min':
                value = Math.min(...numericValues);
                break;
            case 'max':
                value = Math.max(...numericValues);
                break;
            default:
                value = numericValues.length;
        }
        return this.successResult({ operation, column: columnName, value: Number(value.toPrecision(15)) });
    }

    private handleGetFormulas(
        workbook: WorkbookSpec,
        input: Record<string, unknown>
    ): ArtifactToolResult {
        SpreadsheetEngine.Instance.EvaluateWorkbook(workbook);
        const sheetArg = input.sheet ?? input.sheetName;
        const ws = this.resolveSheet(workbook, sheetArg);
        if (!ws) {
            return this.errorResult(`Sheet "${String(sheetArg ?? '')}" not found.`);
        }

        const formulas = Object.values(ws.Cells)
            .filter((c): c is SpreadsheetCellSpec & { Formula: string } => Boolean(c.Formula))
            .sort((a, b) => {
                const pa = ParseCellAddress(a.Address);
                const pb = ParseCellAddress(b.Address);
                if (!pa || !pb) return 0;
                return pa.row !== pb.row ? pa.row - pb.row : pa.col - pb.col;
            })
            .map((c) => ({
                cell: c.Address,
                formula: c.Formula,
                computedValue: c.ComputedValue ?? null
            }));

        return this.successResult({ formulas });
    }

    private buildWorksheetHeaderMap(ws: WorksheetSpec): Map<number, string> {
        const headerMap = new Map<number, string>();
        const bounds = this.getPopulatedBounds(ws);
        for (let c = 1; c <= bounds.maxCol; c++) {
            const addr = FormatCellAddress(1, c);
            const cell = ws.Cells[addr];
            const val = cell ? (cell.ComputedValue ?? cell.RawValue) : null;
            if (val !== null && val !== undefined && String(val).trim() !== '') {
                headerMap.set(c, String(val).trim());
            }
        }
        return headerMap;
    }

    private getPopulatedBounds(ws: WorksheetSpec): { maxRow: number; maxCol: number } {
        let maxRow = 0;
        let maxCol = 0;
        for (const cell of Object.values(ws.Cells)) {
            const pos = ParseCellAddress(cell.Address);
            if (!pos) continue;
            const val = cell.ComputedValue ?? cell.RawValue ?? cell.Formula;
            if (val !== null && val !== undefined && val !== '') {
                if (pos.row > maxRow) maxRow = pos.row;
                if (pos.col > maxCol) maxCol = pos.col;
            }
        }
        return { maxRow, maxCol };
    }

    private successResult(data: unknown): ArtifactToolResult {
        return { success: true, data };
    }

    private errorResult(errorMessage: string): ArtifactToolResult {
        return { success: false, data: null, errorMessage };
    }
}
