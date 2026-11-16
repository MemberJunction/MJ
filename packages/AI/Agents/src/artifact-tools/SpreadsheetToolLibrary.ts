import { AsyncLocalStorage } from 'node:async_hooks';
import { randomUUID } from 'node:crypto';
import { RegisterClass, UUIDsEqual } from '@memberjunction/global';
import {
    ArtifactJsonValue,
    ArtifactToolArgs,
    ArtifactToolDefinition,
    ArtifactToolExecutionContext,
    ArtifactToolResult,
    BaseArtifactToolLibrary,
    ResolveEmbeddedArtifactId,
    ResolveEmbeddedVersionId
} from '@memberjunction/ai-core-plus';
import {
    ColumnIndexToLetter,
    CompileSafeUserRegex,
    DocumentBlockExecutionResult,
    FormatCellAddress,
    IsSafeUserRegex,
    ParseCellAddress,
    ParseRangeAddress,
    SafeRegexSearchDetailed,
    SpreadsheetCalculatedColumnSpec,
    SpreadsheetCellEditContext,
    SpreadsheetCellFormatType,
    SpreadsheetCellSpec,
    SpreadsheetCellStyleSpec,
    SpreadsheetCellValue,
    SpreadsheetChartSpec,
    SpreadsheetChartType,
    SpreadsheetConditionalFormatRuleSpec,
    SpreadsheetEmbeddedArtifactSpec,
    SpreadsheetEngine,
    SpreadsheetFilterSpec,
    SpreadsheetLiveTableSpec,
    SpreadsheetNamedRangeSpec,
    SpreadsheetProtectedRangeSpec,
    SpreadsheetValidationRuleSpec,
    WorkbookSpec,
    WorksheetSpec
} from '@memberjunction/core-entities';
import { EnsureNodeVmSafeRegexExecutorRegistered, ExecuteSafeRegexBatchWithRecovery } from './node-vm-safe-regex';
import { ComputeNumericExtremum } from './artifact-tool-helpers';
import {
    ExecuteArtifactCommentTool,
    ExecuteListSuggestionsTool,
    ExecuteProposeSuggestionTool,
    ExecuteReviewSuggestionTool,
    GetSharedCommentAndSuggestionToolDefinitions,
    ParseSuggestionAnchor,
    ValidateEmbeddedArtifactAccess
} from './artifact-comment-suggestion-helper';

const MAX_SHEET_ROW_COUNT = 10_000;
const MAX_SHEET_COLUMN_COUNT = 256;
const MAX_INSERT_COUNT = 1_000;
const MAX_READ_RANGE_CELLS = 10_000;
const SEARCH_MATCH_LIMIT = 100;
const TOOL_REGEX_BUDGET_MS = 150;
const BATCH_REGEX_MAX_MS = 40;
const MAX_BATCH_ITEMS = 512;
const MAX_BATCH_CHARS = 262_144;
const MAX_REGEX_INPUT_BYTES = 65_536;
const MAX_SAFE_UTF16_UNITS_FOR_64KB = 21_845;
const MAX_REPORTED_UNSEARCHABLE_CELLS = 25;

function exceedsSheetRegexInputBytes(text: string): boolean {
    if (text.length <= MAX_SAFE_UTF16_UNITS_FOR_64KB) {
        return false;
    }
    return Buffer.byteLength(text, 'utf8') > MAX_REGEX_INPUT_BYTES;
}

EnsureNodeVmSafeRegexExecutorRegistered();

function computeFastCellSortKey(addr: string): number {
    let i = 0;
    const len = addr.length;
    if (i < len && addr.charCodeAt(i) === 36) i++;
    let col = 0;
    while (i < len) {
        let ch = addr.charCodeAt(i);
        if (ch >= 97 && ch <= 122) ch -= 32;
        if (ch >= 65 && ch <= 90) {
            col = col * 26 + (ch - 64);
            i++;
        } else {
            break;
        }
    }
    if (i < len && addr.charCodeAt(i) === 36) i++;
    let row = 0;
    while (i < len) {
        const ch = addr.charCodeAt(i);
        if (ch >= 48 && ch <= 57) {
            row = row * 10 + (ch - 48);
            i++;
        } else {
            break;
        }
    }
    return row * 65_536 + col;
}

export interface UnsearchableSpreadsheetCell {
    sheet: string;
    cell: string;
    reason: 'exceeds_64kb_regex_limit' | 'regex_timeout';
}

type AggregateOperation = 'sum' | 'avg' | 'count' | 'min' | 'max';
const VALID_AGGREGATE_OPS: ReadonlySet<string> = new Set<AggregateOperation>(['sum', 'avg', 'count', 'min', 'max']);

const VALID_HORIZONTAL_ALIGNS: ReadonlySet<'left' | 'center' | 'right'> = new Set(['left', 'center', 'right']);
const VALID_FORMAT_TYPES: ReadonlySet<SpreadsheetCellFormatType> = new Set([
    'general',
    'number',
    'currency',
    'percent',
    'integer',
    'date',
    'datetime',
    'text'
]);

function buildStylePatch(
    rec: ArtifactToolArgs,
    existingStyle?: SpreadsheetCellStyleSpec
): Partial<SpreadsheetCellStyleSpec> | undefined {
    const patch: Partial<SpreadsheetCellStyleSpec> = {};
    let hasKeys = false;

    const rawFmt = typeof rec.formatType === 'string' ? rec.formatType.trim().toLowerCase() : undefined;
    if (rawFmt && VALID_FORMAT_TYPES.has(rawFmt as SpreadsheetCellFormatType)) {
        const formatType = rawFmt as SpreadsheetCellFormatType;
        patch.FormatType = formatType;
        hasKeys = true;
        if (
            typeof rec.numberFormatPattern !== 'string' &&
            (!existingStyle?.NumberFormatPattern || existingStyle.FormatType !== formatType)
        ) {
            const defPattern = SpreadsheetEngine.Instance.DefaultPatternForFormatType(formatType);
            if (defPattern !== undefined) {
                patch.NumberFormatPattern = defPattern;
            }
        }
    }
    if (typeof rec.numberFormatPattern === 'string') {
        patch.NumberFormatPattern = rec.numberFormatPattern;
        hasKeys = true;
    }
    if (typeof rec.bold === 'boolean') {
        patch.Bold = rec.bold;
        hasKeys = true;
    }
    if (typeof rec.italic === 'boolean') {
        patch.Italic = rec.italic;
        hasKeys = true;
    }
    if (typeof rec.horizontalAlign === 'string') {
        const align = rec.horizontalAlign.trim().toLowerCase();
        if (VALID_HORIZONTAL_ALIGNS.has(align as 'left' | 'center' | 'right')) {
            patch.HorizontalAlign = align as 'left' | 'center' | 'right';
            hasKeys = true;
        }
    }
    if (typeof rec.textColor === 'string') {
        patch.TextColor = rec.textColor;
        hasKeys = true;
    }
    if (typeof rec.backgroundColor === 'string') {
        patch.BackgroundColor = rec.backgroundColor;
        hasKeys = true;
    }

    return hasKeys ? patch : undefined;
}

function isActorAllowedForProtectedRule(
    rule: SpreadsheetProtectedRangeSpec,
    editCtx?: SpreadsheetCellEditContext
): boolean {
    if (editCtx?.BypassProtection) {
        return true;
    }
    const actor = (editCtx?.UserID ?? '').trim();
    if (actor && editCtx?.OwnerUserID && UUIDsEqual(actor, editCtx.OwnerUserID)) {
        return true;
    }
    if (actor && rule.LockedByUserID && UUIDsEqual(actor, rule.LockedByUserID)) {
        return true;
    }
    if (rule.AllowEditors && editCtx?.IsEditor) {
        return true;
    }
    return false;
}

function checkBoundsProtection(
    sheet: WorksheetSpec,
    bounds: { startRow: number; endRow: number; startCol: number; endCol: number },
    editCtx: SpreadsheetCellEditContext,
    actionLabel: string
): string | null {
    if (editCtx.BypassProtection || (sheet.ProtectedRanges?.length ?? 0) === 0) {
        return null;
    }
    for (const rule of sheet.ProtectedRanges ?? []) {
        const ruleBounds = ParseRangeAddress(rule.Range, MAX_SHEET_ROW_COUNT, MAX_SHEET_COLUMN_COUNT);
        if (!ruleBounds) continue;
        const overlaps =
            bounds.startRow <= ruleBounds.endRow &&
            bounds.endRow >= ruleBounds.startRow &&
            bounds.startCol <= ruleBounds.endCol &&
            bounds.endCol >= ruleBounds.startCol;
        if (overlaps && !isActorAllowedForProtectedRule(rule, editCtx)) {
            return `Cannot ${actionLabel}: intersects protected range '${rule.Range}' (locked by ${rule.LockedByUserID}).`;
        }
    }
    return null;
}

function resolveColumnNumber(colArg: ArtifactJsonValue | undefined): number | null {
    if (typeof colArg === 'number' && Number.isFinite(colArg)) {
        const n = Math.trunc(colArg);
        return n >= 1 && n <= MAX_SHEET_COLUMN_COUNT ? n : null;
    }
    if (typeof colArg === 'string' && colArg.trim()) {
        const trimmed = colArg.trim();
        if (/^\d+$/.test(trimmed)) {
            const n = parseInt(trimmed, 10);
            return n >= 1 && n <= MAX_SHEET_COLUMN_COUNT ? n : null;
        }
        const parsed = ParseCellAddress(`${trimmed.toUpperCase()}1`);
        return parsed && parsed.col >= 1 && parsed.col <= MAX_SHEET_COLUMN_COUNT ? parsed.col : null;
    }
    return null;
}

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
    /**
     * Wall-clock budget, in milliseconds, for one regex `search_cells` call. Cells not reached in time
     * are reported as unsearchable and the result is marked `partial`. Defaults to
     * {@link TOOL_REGEX_BUDGET_MS}; tests that assert a complete search raise it so a slow CI runner
     * does not turn a timing margin into a failure.
     */
    public RegexBudgetMs: number = TOOL_REGEX_BUDGET_MS;

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
                    'Writes values, formulas (including =SUM, =VLOOKUP, =MJ.QUERY, =MJ.VIEW, =MJ.IMPORTRANGE), and styles into one or more cells on a worksheet while preserving unspecified style attributes, recalculates all dependent formulas headlessly on the server, and returns the updated cells with their computed values.',
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
                                'Array of cell updates: [{ address: "B4", value?: 100, formula?: "=SUM(B2:B3)", formatType?: "currency" | "percent" | "number" | "integer" | "date" | "datetime" | "text" | "general", numberFormatPattern?: "$#,##0.00", bold?: true, italic?: false, horizontalAlign?: "left" | "center" | "right", textColor?: "#111827", backgroundColor?: "#EEF2FF", note?: "..." }]. Also accepts address aliases (cell, ref, coord) or 0-based { r, c, v?, f? }.'
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
                name: 'format_range',
                description:
                    'Applies style attributes (bold, italic, horizontalAlign, textColor, backgroundColor, formatType, numberFormatPattern) across an A1 cell range while preserving existing cell values, formulas, and unspecified style properties.',
                inputSchema: {
                    type: 'object',
                    properties: {
                        sheet: {
                            type: 'string',
                            description: 'Target worksheet SheetID or Name (defaults to active sheet).'
                        },
                        range: {
                            type: 'string',
                            description: 'A1 cell or rectangular range to format (e.g. "A1:D1" or "B2:B10").'
                        },
                        bold: { type: 'boolean', description: 'Bold font weight.' },
                        italic: { type: 'boolean', description: 'Italic font style.' },
                        horizontalAlign: {
                            type: 'string',
                            enum: ['left', 'center', 'right'],
                            description: 'Horizontal text alignment.'
                        },
                        textColor: { type: 'string', description: 'CSS/hex color or token for cell text.' },
                        backgroundColor: { type: 'string', description: 'CSS/hex color or token for cell background fill.' },
                        formatType: {
                            type: 'string',
                            enum: ['general', 'number', 'currency', 'percent', 'integer', 'date', 'datetime', 'text'],
                            description: 'Number display format category.'
                        },
                        numberFormatPattern: {
                            type: 'string',
                            description: 'Excel-compatible number format pattern (e.g. "$#,##0.00", "0.0%").'
                        },
                        expectedRevisionHash: {
                            type: 'string',
                            description: 'Optional optimistic concurrency revision hash from a prior read.'
                        }
                    },
                    required: ['range']
                }
            },
            {
                name: 'clear_range',
                description:
                    'Clears values, styles, notes, or everything inside an A1 cell or rectangular range (including any owned dynamic-array or legacy CSE spill children) and recalculates dependents.',
                inputSchema: {
                    type: 'object',
                    properties: {
                        sheet: {
                            type: 'string',
                            description: 'Target worksheet SheetID or Name (defaults to active sheet).'
                        },
                        range: {
                            type: 'string',
                            description: 'A1 cell or range to clear (e.g. "I6" or "A2:D10").'
                        },
                        mode: {
                            type: 'string',
                            enum: ['all', 'values', 'formats', 'notes'],
                            description: 'What to clear: "all" (default, removes cells completely), "values" (clears values/formulas while keeping styles/notes), "formats" (clears styles), or "notes" (clears notes).'
                        },
                        expectedRevisionHash: {
                            type: 'string',
                            description: 'Optional optimistic concurrency revision hash from a prior read.'
                        }
                    },
                    required: ['range']
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
                name: 'delete_rows',
                description:
                    'Deletes one or more rows starting at 1-based atRowNumber, enforcing ProtectedRanges locks and updating formulas.',
                inputSchema: {
                    type: 'object',
                    properties: {
                        sheet: { type: 'string', description: 'Target worksheet SheetID or Name.' },
                        atRowNumber: { type: 'number', description: '1-based starting row number to delete.' },
                        count: { type: 'number', description: 'Number of rows to delete (default 1).' },
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
                name: 'delete_columns',
                description:
                    'Deletes one or more columns starting at 1-based atColumnNumber, enforcing ProtectedRanges locks and updating formulas.',
                inputSchema: {
                    type: 'object',
                    properties: {
                        sheet: { type: 'string', description: 'Target worksheet SheetID or Name.' },
                        atColumnNumber: { type: 'number', description: '1-based starting column number to delete.' },
                        count: { type: 'number', description: 'Number of columns to delete (default 1).' },
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
                name: 'duplicate_sheet',
                description:
                    'Duplicates an existing worksheet tab (cells, styles, formulas, charts, live tables, embedded artifacts) with fresh internal IDs and inserts it after the source sheet.',
                inputSchema: {
                    type: 'object',
                    properties: {
                        sheet: { type: 'string', description: 'Source worksheet SheetID or Name to duplicate.' },
                        newName: { type: 'string', description: 'Optional display name for the duplicated sheet (up to 31 characters).' },
                        expectedRevisionHash: { type: 'string', description: 'Optional concurrency revision hash.' }
                    },
                    required: ['sheet']
                }
            },
            {
                name: 'reorder_sheets',
                description: 'Reorders worksheet tabs in the workbook according to sheetIds (SheetIDs or Names).',
                inputSchema: {
                    type: 'object',
                    properties: {
                        sheetIds: {
                            type: 'array',
                            items: { type: 'string' },
                            description: 'Ordered array of worksheet SheetIDs or Names.'
                        },
                        expectedRevisionHash: { type: 'string', description: 'Optional concurrency revision hash.' }
                    },
                    required: ['sheetIds']
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
                name: 'set_sheet_layout',
                description:
                    'Updates worksheet layout properties such as frozenRows, frozenColumns, rowHeights/hidden state, and columnWidths/hidden state.',
                inputSchema: {
                    type: 'object',
                    properties: {
                        sheet: { type: 'string', description: 'Target worksheet SheetID or Name (defaults to active sheet).' },
                        frozenRows: { type: 'number', description: 'Number of frozen top rows (0 or greater).' },
                        frozenColumns: { type: 'number', description: 'Number of frozen left columns (0 or greater).' },
                        rowHeights: {
                            type: 'array',
                            description: 'Array of row layout overrides: [{ rowNumber: 1, height?: 32, hidden?: false }].'
                        },
                        columnWidths: {
                            type: 'array',
                            description: 'Array of column layout overrides: [{ column: "A" | 1, width?: 160, hidden?: false }].'
                        },
                        expectedRevisionHash: { type: 'string', description: 'Optional concurrency revision hash.' }
                    }
                }
            },
            {
                name: 'upsert_live_table',
                description:
                    'Binds or updates an MJ EntityView or SavedQuery range table on a worksheet (with optional extraFilter, fields, parameters, maxRows, and calculated formula columns), materializes live rows under the user permissions, and returns the resolved headers, rowCount, and boundingRange.',
                inputSchema: {
                    type: 'object',
                    properties: {
                        sheet: { type: 'string', description: 'Target worksheet SheetID or Name.' },
                        tableId: { type: 'string', description: 'Optional stable TableID.' },
                        title: { type: 'string', description: 'Display title for the bound table.' },
                        sourceType: {
                            type: 'string',
                            description: '"EntityView" (or "view"/"entity") or "SavedQuery" (or "query").'
                        },
                        entityName: { type: 'string', description: 'Target EntityName when sourceType="EntityView".' },
                        viewId: { type: 'string', description: 'Optional saved User View ID.' },
                        viewName: { type: 'string', description: 'Optional saved User View Name.' },
                        extraFilter: { type: 'string', description: 'Optional SQL filter clause for EntityView sources.' },
                        fields: {
                            type: 'array',
                            description: 'Optional subset of field names to include.'
                        },
                        queryId: { type: 'string', description: 'Target Saved Query ID when sourceType="SavedQuery".' },
                        queryName: {
                            type: 'string',
                            description: 'Target Saved Query Name when sourceType="SavedQuery".'
                        },
                        parameters: {
                            type: 'object',
                            description: 'Optional parameter map passed to the SavedQuery.'
                        },
                        maxRows: {
                            type: 'number',
                            description: 'Maximum rows to materialize (default 100).'
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
                name: 'refresh_live_tables',
                description:
                    'Re-executes bound LiveTables and =MJ.* custom functions across the workbook under the current user permissions, updates worksheet cells and dependent formulas, and returns updated bounds and headers.',
                inputSchema: {
                    type: 'object',
                    properties: {
                        tableId: {
                            type: 'string',
                            description: 'Optional TableID to refresh only one bound live table (defaults to all).'
                        },
                        expectedRevisionHash: { type: 'string', description: 'Optional concurrency revision hash.' }
                    },
                    required: []
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
                            description: 'A1 source range on the worksheet, or comma-separated non-contiguous ranges (e.g. "A1:C6" or "A1:A6,D1:D6").'
                        },
                        positionCell: {
                            type: 'string',
                            description: 'Anchor cell for the chart card (default "E2").'
                        },
                        placement: {
                            type: 'string',
                            enum: ['dock', 'sheet'],
                            description: 'Where to render the chart: "dock" in bottom strip (default) or "sheet" floating over grid cells.'
                        },
                        widthPx: { type: 'number', description: 'Optional chart width in pixels.' },
                        heightPx: { type: 'number', description: 'Optional chart height in pixels.' },
                        showLegend: { type: 'boolean', description: 'Whether to display the legend (defaults to true).' },
                        hasHeaderRow: {
                            description: 'Header handling: "auto" (default), true, or false.'
                        },
                        seriesOrientation: {
                            type: 'string',
                            enum: ['columns', 'rows'],
                            description: 'Whether series come from "columns" (default) or "rows".'
                        },
                        categoryColumnIndex: {
                            type: 'number',
                            description: 'Zero-based column (or row) index within sourceRange for category labels.'
                        },
                        includedSeriesIndices: {
                            type: 'array',
                            items: { type: 'number' },
                            description: 'Zero-based series indices within sourceRange to include.'
                        },
                        showDataLabels: {
                            type: 'boolean',
                            description: 'Whether to show numeric value labels on plotted chart elements.'
                        },
                        offsetX: { type: 'number', description: 'Optional horizontal pixel offset when placement is "sheet".' },
                        offsetY: { type: 'number', description: 'Optional vertical pixel offset when placement is "sheet".' },
                        expectedRevisionHash: { type: 'string', description: 'Optional concurrency revision hash.' }
                    },
                    required: ['sourceRange']
                }
            },
            {
                name: 'delete_chart',
                description: 'Removes a range chart from a worksheet by chartId.',
                inputSchema: {
                    type: 'object',
                    properties: {
                        sheet: { type: 'string', description: 'Target worksheet SheetID or Name.' },
                        chartId: { type: 'string', description: 'ChartID to delete.' },
                        expectedRevisionHash: { type: 'string', description: 'Optional concurrency revision hash.' }
                    },
                    required: ['chartId']
                }
            },
            {
                name: 'delete_live_table',
                description: 'Removes a bound LiveTable definition from a worksheet by tableId (optionally clearing its cells).',
                inputSchema: {
                    type: 'object',
                    properties: {
                        sheet: { type: 'string', description: 'Target worksheet SheetID or Name.' },
                        tableId: { type: 'string', description: 'LiveTable TableID to delete.' },
                        clearCells: {
                            type: 'boolean',
                            description: 'When true, also clears materialized cells belonging to this table.'
                        },
                        expectedRevisionHash: { type: 'string', description: 'Optional concurrency revision hash.' }
                    },
                    required: ['tableId']
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
                        artifactId: {
                            type: 'string',
                            description: 'Target MJ: Artifacts UUID (or session short-ID like "B", "D", which is resolved automatically).'
                        },
                        versionId: {
                            type: 'string',
                            description: 'Optional pinned MJ: Artifact Versions UUID (or session short ID such as "E"; omit to track latest).'
                        },
                        artifactTypeName: {
                            type: 'string',
                            description: 'Artifact type name (e.g. "Whiteboard").'
                        },
                        anchorCell: { type: 'string', description: 'Anchor A1 cell (default "F2").' },
                        widthPx: { type: 'number', description: 'Width in pixels (default 520).' },
                        heightPx: { type: 'number', description: 'Height in pixels (default 320).' },
                        allowInlineEdit: { type: 'boolean', description: 'Whether inline editing is allowed (defaults to true).' },
                        expectedRevisionHash: { type: 'string', description: 'Optional concurrency revision hash.' }
                    },
                    required: ['artifactId']
                }
            },
            {
                name: 'delete_embedded_artifact',
                description: 'Removes an embedded OLE Artifact from a worksheet by embedId.',
                inputSchema: {
                    type: 'object',
                    properties: {
                        sheet: { type: 'string', description: 'Target worksheet SheetID or Name.' },
                        embedId: { type: 'string', description: 'Embedded artifact EmbedID to delete.' },
                        expectedRevisionHash: { type: 'string', description: 'Optional concurrency revision hash.' }
                    },
                    required: ['embedId']
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
                description:
                    'Case-insensitive literal substring search (default false for use_regex) or regular expression search (when use_regex is true) across all cells. Optionally scope to a single sheet. Returns up to 100 matches.',
                inputSchema: {
                    type: 'object',
                    properties: {
                        query: {
                            type: 'string',
                            description: 'Plain-text literal substring (default) or case-insensitive regex pattern (when use_regex is true) to search for'
                        },
                        sheet: { type: 'string', description: 'Optional sheet name or SheetID to limit search scope' },
                        use_regex: {
                            type: 'boolean',
                            description:
                                'Optional (default false): set true to evaluate query as a regular expression; defaults to false for literal plain-text search with no 64 KB cap.'
                        },
                        useRegex: {
                            type: 'boolean',
                            description: 'Alias for use_regex (default false).'
                        }
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
            },
            {
                name: 'merge_cells',
                description: 'Merges a rectangular A1 range (>= 2 cells) on a worksheet.',
                inputSchema: {
                    type: 'object',
                    properties: {
                        sheet: { type: 'string', description: 'Sheet name or SheetID.' },
                        range: { type: 'string', description: 'Canonical rectangular A1 range (e.g. "A1:C1").' },
                        expectedRevisionHash: { type: 'string', description: 'Optional revision hash for concurrency control.' }
                    },
                    required: ['range']
                }
            },
            {
                name: 'unmerge_cells',
                description: 'Unmerges any merged ranges matching or overlapping the supplied A1 range.',
                inputSchema: {
                    type: 'object',
                    properties: {
                        sheet: { type: 'string', description: 'Sheet name or SheetID.' },
                        range: { type: 'string', description: 'A1 cell or range to unmerge.' },
                        expectedRevisionHash: { type: 'string', description: 'Optional revision hash for concurrency control.' }
                    },
                    required: ['range']
                }
            },
            {
                name: 'upsert_conditional_format',
                description: 'Creates or updates a conditional formatting rule on a worksheet range.',
                inputSchema: {
                    type: 'object',
                    properties: {
                        sheet: { type: 'string', description: 'Sheet name or SheetID.' },
                        ruleId: { type: 'string', description: 'Optional rule ID to update in place.' },
                        range: { type: 'string', description: 'Target A1 range (e.g. "D2:D50").' },
                        operator: {
                            type: 'string',
                            enum: ['gt', 'lt', 'eq', 'between', 'contains'],
                            description: 'Comparison operator.'
                        },
                        value1: { type: 'string', description: 'Primary threshold value (string or number).' },
                        value2: { type: 'number', description: 'Upper bound numeric threshold when operator is "between".' },
                        highlightTone: {
                            type: 'string',
                            enum: ['success', 'warning', 'danger', 'info'],
                            description: 'Semantic highlight tone.'
                        },
                        expectedRevisionHash: { type: 'string', description: 'Optional revision hash for concurrency control.' }
                    },
                    required: ['range', 'operator', 'value1', 'highlightTone']
                }
            },
            {
                name: 'delete_conditional_format',
                description: 'Removes a conditional formatting rule by ruleId.',
                inputSchema: {
                    type: 'object',
                    properties: {
                        sheet: { type: 'string', description: 'Sheet name or SheetID.' },
                        ruleId: { type: 'string', description: 'Conditional formatting RuleID to remove.' },
                        expectedRevisionHash: { type: 'string', description: 'Optional revision hash for concurrency control.' }
                    },
                    required: ['ruleId']
                }
            },
            {
                name: 'upsert_validation_rule',
                description: 'Creates or updates a data validation rule on a worksheet range.',
                inputSchema: {
                    type: 'object',
                    properties: {
                        sheet: { type: 'string', description: 'Sheet name or SheetID.' },
                        ruleId: { type: 'string', description: 'Optional rule ID to update in place.' },
                        range: { type: 'string', description: 'Target A1 range (e.g. "C2:C50").' },
                        ruleType: {
                            type: 'string',
                            enum: ['list', 'numberRange', 'notEmpty'],
                            description: 'Validation rule type.'
                        },
                        allowedValues: {
                            type: 'array',
                            items: { type: 'string' },
                            description: 'Allowed string values when ruleType is "list".'
                        },
                        minValue: { type: 'number', description: 'Minimum number when ruleType is "numberRange".' },
                        maxValue: { type: 'number', description: 'Maximum number when ruleType is "numberRange".' },
                        errorMessage: { type: 'string', description: 'Optional validation failure message.' },
                        expectedRevisionHash: { type: 'string', description: 'Optional revision hash for concurrency control.' }
                    },
                    required: ['range', 'ruleType']
                }
            },
            {
                name: 'delete_validation_rule',
                description: 'Removes a data validation rule by ruleId.',
                inputSchema: {
                    type: 'object',
                    properties: {
                        sheet: { type: 'string', description: 'Sheet name or SheetID.' },
                        ruleId: { type: 'string', description: 'Validation RuleID to remove.' },
                        expectedRevisionHash: { type: 'string', description: 'Optional revision hash for concurrency control.' }
                    },
                    required: ['ruleId']
                }
            },
            {
                name: 'upsert_named_range',
                description: 'Creates or updates a workbook-level named range and recalculates dependent formulas.',
                inputSchema: {
                    type: 'object',
                    properties: {
                        name: { type: 'string', description: 'Formula identifier (e.g. "TaxRate").' },
                        sheet: { type: 'string', description: 'Sheet name or SheetID owning the range.' },
                        range: { type: 'string', description: 'A1 cell or rectangular range (e.g. "B2:B10").' },
                        description: { type: 'string', description: 'Optional description.' },
                        expectedRevisionHash: { type: 'string', description: 'Optional revision hash for concurrency control.' }
                    },
                    required: ['name', 'range']
                }
            },
            {
                name: 'delete_named_range',
                description: 'Removes a workbook-level named range by name.',
                inputSchema: {
                    type: 'object',
                    properties: {
                        name: { type: 'string', description: 'Named range identifier to remove.' },
                        expectedRevisionHash: { type: 'string', description: 'Optional revision hash for concurrency control.' }
                    },
                    required: ['name']
                }
            },
            {
                name: 'set_lock',
                description: 'Adds or updates a protected range lock on a worksheet.',
                inputSchema: {
                    type: 'object',
                    properties: {
                        sheet: { type: 'string', description: 'Sheet name or SheetID.' },
                        range: { type: 'string', description: 'A1 cell or range to lock.' },
                        rangeId: { type: 'string', description: 'Optional stable RangeID.' },
                        description: { type: 'string', description: 'Optional lock rationale/description.' },
                        allowEditors: { type: 'boolean', description: 'Whether artifact editors may modify cells inside the protected range (default false = owner only).' },
                        expectedRevisionHash: { type: 'string', description: 'Optional revision hash for concurrency control.' }
                    },
                    required: ['range']
                }
            },
            {
                name: 'release_lock',
                description: 'Removes an existing protected range lock on a worksheet if the actor is authorized.',
                inputSchema: {
                    type: 'object',
                    properties: {
                        sheet: { type: 'string', description: 'Sheet name or SheetID.' },
                        rangeId: { type: 'string', description: 'Protected range RuleID / RangeID to unlock.' },
                        range: { type: 'string', description: 'Optional A1 range to match if rangeId is omitted.' },
                        expectedRevisionHash: { type: 'string', description: 'Optional revision hash for concurrency control.' }
                    }
                }
            },
            ...GetSharedCommentAndSuggestionToolDefinitions('spreadsheet')
        ];
    }

    private readonly activeOriginalXlsxStorage = new AsyncLocalStorage<Uint8Array | null>();

    protected override async invokeSubclassTool(
        toolName: string,
        input: ArtifactToolArgs,
        artifactContent: string | Buffer,
        context?: ArtifactToolExecutionContext
    ): Promise<ArtifactToolResult> {
        const originalXlsxBytes =
            Buffer.isBuffer(artifactContent) &&
            artifactContent.length > 4 &&
            artifactContent[0] === 0x50 &&
            artifactContent[1] === 0x4b
                ? new Uint8Array(artifactContent)
                : null;
        return this.activeOriginalXlsxStorage.run(originalXlsxBytes, async () => {
            if (
                toolName === 'list_comments' ||
                toolName === 'add_comment' ||
                toolName === 'reply_comment' ||
                toolName === 'resolve_comment'
            ) {
                return ExecuteArtifactCommentTool({
                    toolName,
                    input,
                    context,
                    domain: 'spreadsheet'
                });
            }

            const engine = SpreadsheetEngine.Instance;
            let workbook: WorkbookSpec;
            try {
                workbook = this.loadWorkbookFromContent(artifactContent);
            } catch (err) {
                return this.errorResult(`Failed to parse spreadsheet content: ${err instanceof Error ? err.message : String(err)}`);
            }
            let cachedCurrentHash: string | null = null;
            const getCurrentHash = (): string => {
                if (cachedCurrentHash === null) {
                    cachedCurrentHash = engine.ComputeRevisionHash(workbook);
                }
                return cachedCurrentHash;
            };

            const expectedHash =
                typeof input.expectedRevisionHash === 'string' ? input.expectedRevisionHash.trim() : '';
            if (expectedHash && expectedHash !== getCurrentHash()) {
                return this.errorResult(
                    `Revision conflict: expectedRevisionHash '${expectedHash}' does not match current workbook revision '${getCurrentHash()}'. Re-read the workbook before retrying.`
                );
            }

            switch (toolName) {
                case 'get_workbook_outline':
                case 'read_workbook':
                    return this.handleGetWorkbookOutline(workbook, getCurrentHash());
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
                    return this.handleReadRange(workbook, input, getCurrentHash());
                case 'write_cells':
                    return this.handleWriteCells(workbook, input, context);
                case 'format_range':
                    return this.handleFormatRange(workbook, input, context);
                case 'clear_range':
                    return this.handleClearRange(workbook, input, context);
                case 'insert_rows':
                    return this.handleInsertRows(workbook, input, context);
                case 'delete_rows':
                    return this.handleDeleteRows(workbook, input, context);
                case 'insert_columns':
                    return this.handleInsertColumns(workbook, input, context);
                case 'delete_columns':
                    return this.handleDeleteColumns(workbook, input, context);
                case 'add_sheet':
                    return this.handleAddSheet(workbook, input);
                case 'rename_sheet':
                    return this.handleRenameSheet(workbook, input);
                case 'duplicate_sheet':
                    return this.handleDuplicateSheet(workbook, input);
                case 'reorder_sheets':
                    return this.handleReorderSheets(workbook, input);
                case 'delete_sheet':
                    return this.handleDeleteSheet(workbook, input, context);
                case 'set_sheet_layout':
                    return this.handleSetSheetLayout(workbook, input, context);
                case 'upsert_live_table':
                    return this.handleUpsertLiveTable(workbook, input, context);
                case 'refresh_live_tables':
                    return this.handleRefreshLiveTables(workbook, input, context);
                case 'delete_live_table':
                    return this.handleDeleteLiveTable(workbook, input, context);
                case 'upsert_chart':
                    return this.handleUpsertChart(workbook, input);
                case 'delete_chart':
                    return this.handleDeleteChart(workbook, input);
                case 'embed_artifact':
                    return this.handleEmbedArtifact(workbook, input, context);
                case 'delete_embedded_artifact':
                    return this.handleDeleteEmbeddedArtifact(workbook, input);
                case 'sort_and_filter':
                    return this.handleSortAndFilter(workbook, input, context);
                case 'merge_cells':
                    return this.handleMergeCells(workbook, input, context);
                case 'unmerge_cells':
                    return this.handleUnmergeCells(workbook, input, context);
                case 'upsert_conditional_format':
                    return this.handleUpsertConditionalFormat(workbook, input, context);
                case 'delete_conditional_format':
                    return this.handleDeleteConditionalFormat(workbook, input, context);
                case 'upsert_validation_rule':
                    return this.handleUpsertValidationRule(workbook, input, context);
                case 'delete_validation_rule':
                    return this.handleDeleteValidationRule(workbook, input, context);
                case 'upsert_named_range':
                    return this.handleUpsertNamedRange(workbook, input, context);
                case 'delete_named_range':
                    return this.handleDeleteNamedRange(workbook, input, context);
                case 'set_lock':
                    return this.handleSetLock(workbook, input, context);
                case 'release_lock':
                    return this.handleReleaseLock(workbook, input, context);
                case 'list_suggestions':
                    return ExecuteListSuggestionsTool({
                        domain: 'spreadsheet',
                        artifactContent,
                        input,
                        context
                    });
                case 'propose_suggestion':
                    return this.handleProposeSuggestion(workbook, artifactContent, input, context);
                case 'review_suggestion':
                    return this.handleReviewSuggestion(workbook, artifactContent, input, context);
                default:
                    return this.errorResult(`Unknown SpreadsheetToolLibrary tool '${toolName}'.`);
            }
        });
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

    /**
     * Evaluates a workbook and computes its revision hash (`R9-9`).
     */
    public ComputeRevisionHash(content: string | Buffer): string {
        const workbook = this.loadWorkbookFromContent(content);
        SpreadsheetEngine.Instance.EvaluateWorkbook(workbook);
        return SpreadsheetEngine.Instance.ComputeRevisionHash(workbook);
    }

    private resolveSheet(workbook: WorkbookSpec, sheetArg: ArtifactJsonValue | undefined): WorksheetSpec | null {
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
        extra: object
    ): ArtifactToolResult {
        const engine = SpreadsheetEngine.Instance;
        engine.EvaluateWorkbook(workbook);
        const serializedJson = engine.SerializeWorkbook(workbook);
        const originalXlsxBytes = this.activeOriginalXlsxStorage.getStore() ?? null;
        const xlsxBytes = originalXlsxBytes
            ? engine.PatchXlsxBytes(originalXlsxBytes, workbook)
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
                    protectedRanges: ws.ProtectedRanges ?? [],
                    liveTables: ws.LiveTables,
                    charts: ws.Charts,
                    embeddedArtifacts: ws.EmbeddedArtifacts
                };
            })
        });
    }

    private handleReadRange(
        workbook: WorkbookSpec,
        input: ArtifactToolArgs,
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
                    engine.FormatCellValue(c.ComputedValue ?? c.RawValue ?? null, c.Style),
                style: c.Style ?? null
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

    private resolveWriteCellEntry(
        rec: ArtifactToolArgs,
        index: number
    ):
        | { ok: true; canonicalAddr: string; row: number; col: number }
        | { ok: false; errorMessage: string } {
        const rawAddr =
            typeof rec.address === 'string'
                ? rec.address.trim()
                : typeof rec.cell === 'string'
                  ? rec.cell.trim()
                  : typeof rec.ref === 'string'
                    ? rec.ref.trim()
                    : typeof rec.coord === 'string'
                      ? rec.coord.trim()
                      : '';

        if (rawAddr) {
            const parsedAddr = ParseCellAddress(rawAddr);
            if (!parsedAddr) {
                return {
                    ok: false,
                    errorMessage: `Invalid cell address '${rawAddr}' at cells[${index}]. Expected A1 notation or 0-based coordinates, e.g. { "address": "A1", "value": "Region" } or { "r": 0, "c": 0, "v": "Region" }.`
                };
            }
            if (parsedAddr.row > MAX_SHEET_ROW_COUNT || parsedAddr.col > MAX_SHEET_COLUMN_COUNT) {
                return {
                    ok: false,
                    errorMessage: `Cell address '${rawAddr}' exceeds maximum worksheet bounds (${MAX_SHEET_ROW_COUNT} rows x ${MAX_SHEET_COLUMN_COUNT} columns).`
                };
            }
            return {
                ok: true,
                canonicalAddr: FormatCellAddress(parsedAddr.row, parsedAddr.col),
                row: parsedAddr.row,
                col: parsedAddr.col
            };
        }

        if (rec.r !== undefined || rec.c !== undefined) {
            if (
                typeof rec.r !== 'number' ||
                typeof rec.c !== 'number' ||
                !Number.isInteger(rec.r) ||
                !Number.isInteger(rec.c) ||
                rec.r < 0 ||
                rec.c < 0
            ) {
                return {
                    ok: false,
                    errorMessage: `Invalid cell coordinates at cells[${index}] (r=${String(rec.r)}, c=${String(rec.c)}): 0-based numeric indices r and c must be non-negative integers, e.g. { "r": 0, "c": 0, "v": "Region" } or { "address": "A1", "value": "Region" }.`
                };
            }
            const row = rec.r + 1;
            const col = rec.c + 1;
            if (row > MAX_SHEET_ROW_COUNT || col > MAX_SHEET_COLUMN_COUNT) {
                return {
                    ok: false,
                    errorMessage: `Cell coordinates (r=${rec.r}, c=${rec.c}) exceed maximum worksheet bounds (${MAX_SHEET_ROW_COUNT} rows x ${MAX_SHEET_COLUMN_COUNT} columns).`
                };
            }
            return {
                ok: true,
                canonicalAddr: FormatCellAddress(row, col),
                row,
                col
            };
        }

        return {
            ok: false,
            errorMessage: `Invalid cell address '' at cells[${index}]. Provide A1 notation or 0-based coordinates, e.g. { "address": "A1", "value": "Region" } or { "r": 0, "c": 0, "v": "Region" }.`
        };
    }

    private async handleWriteCells(
        workbook: WorkbookSpec,
        input: ArtifactToolArgs,
        context?: ArtifactToolExecutionContext
    ): Promise<ArtifactToolResult> {
        const engine = SpreadsheetEngine.Instance;
        const sheet = this.resolveSheet(workbook, input.sheet);
        if (!sheet) {
            return this.errorResult(`Worksheet '${String(input.sheet ?? '')}' not found.`);
        }
        const rawCells = Array.isArray(input.cells) ? input.cells : [];
        if (rawCells.length === 0) {
            return this.errorResult('Parameter "cells" must be a non-empty array of cell updates.');
        }

        const editCtx = this.extractCellEditContext(context);
        const normalizedCells: Array<{ rec: ArtifactToolArgs; canonicalAddr: string }> = [];
        // Pre-validate cell addresses and protected ranges atomically before mutating any cell in the batch
        for (let idx = 0; idx < rawCells.length; idx++) {
            const item = rawCells[idx];
            if (!item || typeof item !== 'object' || Array.isArray(item)) continue;
            const rec = item as ArtifactToolArgs;
            const resolved = this.resolveWriteCellEntry(rec, idx);
            if (resolved.ok === false) {
                return this.errorResult(resolved.errorMessage);
            }
            const perm = engine.CheckCellWritePermission(sheet, resolved.canonicalAddr, editCtx);
            if (!perm.Allowed) {
                return this.errorResult(perm.Reason || `Cell '${resolved.canonicalAddr}' is inside a protected range.`);
            }
            normalizedCells.push({ rec, canonicalAddr: resolved.canonicalAddr });
        }

        const updatedAddresses: string[] = [];
        const mjFormulaCells: string[] = [];
        for (const { rec, canonicalAddr } of normalizedCells) {
            const existingCell = sheet.Cells[canonicalAddr];
            const rawValue =
                rec.value !== undefined ? rec.value : rec.v !== undefined ? rec.v : rec.val;
            const val =
                rawValue === null ||
                typeof rawValue === 'string' ||
                typeof rawValue === 'number' ||
                typeof rawValue === 'boolean'
                    ? (rawValue as SpreadsheetCellValue)
                    : undefined;
            const rawFormula = rec.formula !== undefined ? rec.formula : rec.f;
            const formula = typeof rawFormula === 'string' ? rawFormula : undefined;
            const stylePatch = buildStylePatch(rec, existingCell?.Style);
            const note = typeof rec.note === 'string' ? rec.note : undefined;

            engine.SetCell(
                workbook,
                sheet.SheetID,
                canonicalAddr,
                {
                    Value: val,
                    Formula: formula,
                    Style: stylePatch,
                    Note: note
                },
                false,
                editCtx
            );
            updatedAddresses.push(canonicalAddr);
            if (formula && engine.ParseMjCustomFunctionFormula(formula) !== null) {
                mjFormulaCells.push(canonicalAddr);
            }
        }

        const preEvalSnapshot =
            mjFormulaCells.length > 0
                ? {
                      cells: { ...sheet.Cells },
                      rows: [...sheet.Rows],
                      columns: [...sheet.Columns]
                  }
                : null;

        const spilledRanges: Array<{
            formulaCell: string;
            boundingRange: string;
            headers: string[];
            rowCount: number;
        }> = [];
        if (mjFormulaCells.length > 0 && context?.contextUser && context?.provider) {
            await engine.EvaluateMjCustomFunctions(workbook, context.contextUser, context.provider, {
                HostArtifactID: context.artifactId,
                BypassCache: true
            });
            for (const formulaCell of mjFormulaCells) {
                const summary = this.summarizeSpilledFormulaFootprint(sheet, formulaCell);
                if (summary) {
                    const spillBounds = ParseRangeAddress(summary.boundingRange);
                    if (spillBounds) {
                        const spillProtErr = checkBoundsProtection(
                            sheet,
                            spillBounds,
                            editCtx,
                            `spill formula '${formulaCell}' across '${summary.boundingRange}'`
                        );
                        if (spillProtErr && preEvalSnapshot) {
                            sheet.Cells = preEvalSnapshot.cells;
                            sheet.Rows = preEvalSnapshot.rows;
                            sheet.Columns = preEvalSnapshot.columns;
                            return this.errorResult(spillProtErr);
                        }
                    }
                    spilledRanges.push(summary);
                }
            }
        }

        engine.EvaluateWorkbook(workbook);
        const updatedCells: SpreadsheetCellSpec[] = updatedAddresses
            .map((a) => sheet.Cells[a])
            .filter((c): c is SpreadsheetCellSpec => Boolean(c));

        return this.buildMutationSuccess(workbook, {
            sheetId: sheet.SheetID,
            sheetName: sheet.Name,
            updatedCells: updatedCells.map((c) => ({
                address: c.Address,
                rowId: c.RowID,
                columnId: c.ColumnID,
                rawValue: c.RawValue,
                formula: c.Formula ?? null,
                formulaStable: c.FormulaStable ?? null,
                computedValue: c.ComputedValue ?? null,
                displayValue: c.DisplayValue ?? ''
            })),
            ...(spilledRanges.length > 0 ? { spilledRanges } : {})
        });
    }

    private handleFormatRange(
        workbook: WorkbookSpec,
        input: ArtifactToolArgs,
        context?: ArtifactToolExecutionContext
    ): ArtifactToolResult {
        const engine = SpreadsheetEngine.Instance;
        const sheet = this.resolveSheet(workbook, input.sheet);
        if (!sheet) {
            return this.errorResult(`Worksheet '${String(input.sheet ?? '')}' not found.`);
        }
        const range = typeof input.range === 'string' ? input.range.trim() : '';
        if (!range) {
            return this.errorResult('Parameter "range" is required.');
        }
        const bounds = ParseRangeAddress(range);
        if (!bounds) {
            return this.errorResult(`Invalid A1 range '${range}'.`);
        }
        const cellCount = (bounds.endRow - bounds.startRow + 1) * (bounds.endCol - bounds.startCol + 1);
        if (cellCount > MAX_READ_RANGE_CELLS) {
            return this.errorResult(`Requested range '${range}' spans ${cellCount} cells, exceeding the limit of ${MAX_READ_RANGE_CELLS}.`);
        }
        if (bounds.endRow > MAX_SHEET_ROW_COUNT || bounds.endCol > MAX_SHEET_COLUMN_COUNT) {
            return this.errorResult(`Requested range '${range}' exceeds worksheet bounds.`);
        }

        const stylePreview = buildStylePatch(input);
        if (!stylePreview) {
            return this.errorResult('format_range requires at least one style property (bold, italic, horizontalAlign, textColor, backgroundColor, formatType, numberFormatPattern).');
        }

        const editCtx = this.extractCellEditContext(context);
        const protErr = checkBoundsProtection(sheet, bounds, editCtx, `format range '${range}'`);
        if (protErr) {
            return this.errorResult(protErr);
        }

        let formattedCellCount = 0;
        for (let r = bounds.startRow; r <= bounds.endRow; r++) {
            for (let c = bounds.startCol; c <= bounds.endCol; c++) {
                const addr = FormatCellAddress(r, c);
                const cellPatch = buildStylePatch(input, sheet.Cells[addr]?.Style);
                if (cellPatch) {
                    engine.SetCell(workbook, sheet.SheetID, addr, { Style: cellPatch }, false, editCtx);
                    formattedCellCount++;
                }
            }
        }

        return this.buildMutationSuccess(workbook, {
            sheetId: sheet.SheetID,
            sheetName: sheet.Name,
            range,
            formattedCellCount,
            styleApplied: stylePreview
        });
    }

    private handleClearRange(
        workbook: WorkbookSpec,
        input: ArtifactToolArgs,
        context?: ArtifactToolExecutionContext
    ): ArtifactToolResult {
        const engine = SpreadsheetEngine.Instance;
        const sheet = this.resolveSheet(workbook, input.sheet);
        if (!sheet) {
            return this.errorResult(`Worksheet '${String(input.sheet ?? '')}' not found.`);
        }
        const range = typeof input.range === 'string' ? input.range.trim() : '';
        if (!range) {
            return this.errorResult('Parameter "range" is required.');
        }
        const bounds = ParseRangeAddress(range);
        if (!bounds) {
            return this.errorResult(`Invalid A1 range '${range}'.`);
        }
        const modeRaw = typeof input.mode === 'string' ? input.mode.trim().toLowerCase() : 'all';
        if (modeRaw !== 'all' && modeRaw !== 'values' && modeRaw !== 'formats' && modeRaw !== 'notes') {
            return this.errorResult(`Unsupported clear_range mode '${modeRaw}'. Valid modes: all, values, formats, notes.`);
        }

        const editCtx = this.extractCellEditContext(context);
        if (modeRaw === 'all') {
            let clearedAddresses: string[];
            try {
                clearedAddresses = engine.ClearRange(workbook, sheet.SheetID, range, true, editCtx);
            } catch (err) {
                return this.errorResult(err instanceof Error ? err.message : String(err));
            }
            return this.buildMutationSuccess(workbook, {
                sheetId: sheet.SheetID,
                clearedRange: range,
                mode: 'all',
                clearedAddresses
            });
        }

        const protErr = checkBoundsProtection(sheet, bounds, editCtx, `clear range '${range}'`);
        if (protErr) {
            return this.errorResult(protErr);
        }

        const targetCells: SpreadsheetCellSpec[] = [];
        for (const [addr, cell] of Object.entries(sheet.Cells)) {
            const pos = ParseCellAddress(addr);
            if (
                pos &&
                pos.row >= bounds.startRow &&
                pos.row <= bounds.endRow &&
                pos.col >= bounds.startCol &&
                pos.col <= bounds.endCol
            ) {
                targetCells.push(cell);
            }
        }

        const clearedAddresses: string[] = [];
        for (const cell of targetCells) {
            const addr = cell.Address;
            const perm = engine.CheckCellWritePermission(sheet, addr, editCtx);
            if (!perm.Allowed) {
                return this.errorResult(perm.Reason || `Cell '${addr}' is inside a protected range.`);
            }
            if (modeRaw === 'values') {
                engine.SetCell(workbook, sheet.SheetID, addr, { Value: null }, false, editCtx);
                clearedAddresses.push(addr);
            } else if (modeRaw === 'formats') {
                if (cell.Style) {
                    delete cell.Style;
                    clearedAddresses.push(addr);
                }
            } else if (modeRaw === 'notes') {
                if (cell.Note !== undefined && cell.Note !== null) {
                    cell.Note = null;
                    clearedAddresses.push(addr);
                }
            }
        }

        return this.buildMutationSuccess(workbook, {
            sheetId: sheet.SheetID,
            clearedRange: range,
            mode: modeRaw,
            clearedAddresses
        });
    }

    private extractCellEditContext(context?: ArtifactToolExecutionContext): SpreadsheetCellEditContext {
        return {
            UserID: context?.actorUserId ?? context?.contextUser?.ID ?? null,
            OwnerUserID: context?.ownerUserId ?? null,
            IsEditor: Boolean(context?.isEditor)
        };
    }

    private handleInsertRows(
        workbook: WorkbookSpec,
        input: ArtifactToolArgs,
        context?: ArtifactToolExecutionContext
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
        const editCtx = this.extractCellEditContext(context);
        const protErr = checkBoundsProtection(
            sheet,
            { startRow: atRow, endRow: MAX_SHEET_ROW_COUNT, startCol: 1, endCol: MAX_SHEET_COLUMN_COUNT },
            editCtx,
            `insert ${rawCount} row(s) at row ${atRow}`
        );
        if (protErr) {
            return this.errorResult(protErr);
        }
        const inserted = SpreadsheetEngine.Instance.InsertRows(workbook, sheet.SheetID, atRow, rawCount);
        return this.buildMutationSuccess(workbook, {
            sheetId: sheet.SheetID,
            insertedRowIds: inserted.map((r) => r.RowID),
            rowCount: sheet.Rows.length
        });
    }

    private handleDeleteRows(
        workbook: WorkbookSpec,
        input: ArtifactToolArgs,
        context?: ArtifactToolExecutionContext
    ): ArtifactToolResult {
        const sheet = this.resolveSheet(workbook, input.sheet);
        if (!sheet) {
            return this.errorResult(`Worksheet '${String(input.sheet ?? '')}' not found.`);
        }
        const rawAtRow = Number(input.atRowNumber);
        if (!Number.isFinite(rawAtRow) || rawAtRow < 1) {
            return this.errorResult('Parameter "atRowNumber" must be a positive 1-based row number.');
        }
        const atRow = Math.trunc(rawAtRow);
        const rawCount = input.count !== undefined ? Math.trunc(Number(input.count)) : 1;
        if (Number.isNaN(rawCount) || rawCount < 1 || rawCount > MAX_INSERT_COUNT) {
            return this.errorResult(`Delete row count must be between 1 and ${MAX_INSERT_COUNT}.`);
        }
        if (atRow > MAX_SHEET_ROW_COUNT) {
            return this.errorResult(`Row number ${atRow} exceeds maximum worksheet rows (${MAX_SHEET_ROW_COUNT}).`);
        }
        const endRow = Math.min(MAX_SHEET_ROW_COUNT, atRow + rawCount - 1);
        const editCtx = this.extractCellEditContext(context);
        const protErr = checkBoundsProtection(
            sheet,
            { startRow: atRow, endRow, startCol: 1, endCol: MAX_SHEET_COLUMN_COUNT },
            editCtx,
            `delete row(s) ${atRow}..${endRow}`
        );
        if (protErr) {
            return this.errorResult(protErr);
        }
        SpreadsheetEngine.Instance.DeleteRows(workbook, sheet.SheetID, atRow, rawCount);
        return this.buildMutationSuccess(workbook, {
            sheetId: sheet.SheetID,
            deletedAtRow: atRow,
            deletedCount: rawCount,
            rowCount: sheet.Rows.length
        });
    }

    private handleInsertColumns(
        workbook: WorkbookSpec,
        input: ArtifactToolArgs,
        context?: ArtifactToolExecutionContext
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
        const editCtx = this.extractCellEditContext(context);
        const protErr = checkBoundsProtection(
            sheet,
            { startRow: 1, endRow: MAX_SHEET_ROW_COUNT, startCol: atCol, endCol: MAX_SHEET_COLUMN_COUNT },
            editCtx,
            `insert ${rawCount} column(s) at column ${atCol}`
        );
        if (protErr) {
            return this.errorResult(protErr);
        }
        const inserted = SpreadsheetEngine.Instance.InsertColumns(workbook, sheet.SheetID, atCol, rawCount);
        return this.buildMutationSuccess(workbook, {
            sheetId: sheet.SheetID,
            insertedColumnIds: inserted.map((c) => c.ColumnID),
            columnCount: sheet.Columns.length
        });
    }

    private handleDeleteColumns(
        workbook: WorkbookSpec,
        input: ArtifactToolArgs,
        context?: ArtifactToolExecutionContext
    ): ArtifactToolResult {
        const sheet = this.resolveSheet(workbook, input.sheet);
        if (!sheet) {
            return this.errorResult(`Worksheet '${String(input.sheet ?? '')}' not found.`);
        }
        const rawAtCol = Number(input.atColumnNumber);
        if (!Number.isFinite(rawAtCol) || rawAtCol < 1) {
            return this.errorResult('Parameter "atColumnNumber" must be a positive 1-based column number.');
        }
        const atCol = Math.trunc(rawAtCol);
        const rawCount = input.count !== undefined ? Math.trunc(Number(input.count)) : 1;
        if (Number.isNaN(rawCount) || rawCount < 1 || rawCount > MAX_INSERT_COUNT) {
            return this.errorResult(`Delete column count must be between 1 and ${MAX_INSERT_COUNT}.`);
        }
        if (atCol > MAX_SHEET_COLUMN_COUNT) {
            return this.errorResult(`Column number ${atCol} exceeds maximum worksheet columns (${MAX_SHEET_COLUMN_COUNT}).`);
        }
        const endCol = Math.min(MAX_SHEET_COLUMN_COUNT, atCol + rawCount - 1);
        const editCtx = this.extractCellEditContext(context);
        const protErr = checkBoundsProtection(
            sheet,
            { startRow: 1, endRow: MAX_SHEET_ROW_COUNT, startCol: atCol, endCol },
            editCtx,
            `delete column(s) ${atCol}..${endCol}`
        );
        if (protErr) {
            return this.errorResult(protErr);
        }
        SpreadsheetEngine.Instance.DeleteColumns(workbook, sheet.SheetID, atCol, rawCount);
        return this.buildMutationSuccess(workbook, {
            sheetId: sheet.SheetID,
            deletedAtColumn: atCol,
            deletedCount: rawCount,
            columnCount: sheet.Columns.length
        });
    }

    private handleAddSheet(
        workbook: WorkbookSpec,
        input: ArtifactToolArgs
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
        input: ArtifactToolArgs
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

    private handleDuplicateSheet(
        workbook: WorkbookSpec,
        input: ArtifactToolArgs
    ): ArtifactToolResult {
        const engine = SpreadsheetEngine.Instance;
        const sourceSheet = this.resolveSheet(workbook, input.sheet);
        if (!sourceSheet) {
            return this.errorResult(`Worksheet '${String(input.sheet ?? '')}' not found.`);
        }

        const existingNames = new Set(workbook.Worksheets.map((w) => w.Name.toLowerCase()));
        let targetName: string;
        if (typeof input.newName === 'string' && input.newName.trim()) {
            targetName = input.newName.replace(/[\[\]:*?/\\]/g, ' ').trim().slice(0, 31);
            if (!targetName) {
                return this.errorResult('Parameter "newName" must contain valid worksheet name characters.');
            }
            if (existingNames.has(targetName.toLowerCase())) {
                return this.errorResult(`A worksheet named '${targetName}' already exists.`);
            }
        } else {
            const base = sourceSheet.Name.slice(0, 24);
            let candidate = `${base} (Copy)`.slice(0, 31);
            let suffix = 2;
            while (existingNames.has(candidate.toLowerCase())) {
                const tag = ` (${suffix++})`;
                candidate = `${base.slice(0, 31 - tag.length)}${tag}`;
            }
            targetName = candidate;
        }

        const existingSheetIds = new Set(workbook.Worksheets.map((w) => w.SheetID));
        let newSheetId = `sheet-${randomUUID().slice(0, 8)}`;
        while (existingSheetIds.has(newSheetId)) {
            newSheetId = `sheet-${randomUUID().slice(0, 8)}`;
        }

        const rowIdMap = new Map<string, string>();
        const clonedRows = sourceSheet.Rows.map((row) => {
            const nextRowId = `${newSheetId}-row-${randomUUID().slice(0, 8)}`;
            rowIdMap.set(row.RowID, nextRowId);
            return { ...row, RowID: nextRowId };
        });

        const colIdMap = new Map<string, string>();
        const clonedCols = sourceSheet.Columns.map((col) => {
            const nextColId = `${newSheetId}-col-${randomUUID().slice(0, 8)}`;
            colIdMap.set(col.ColumnID, nextColId);
            return { ...col, ColumnID: nextColId };
        });

        const tableIdMap = new Map<string, string>();
        const clonedLiveTables = sourceSheet.LiveTables.map((tbl) => {
            const nextTableId = `tbl-${randomUUID().slice(0, 8)}`;
            tableIdMap.set(tbl.TableID, nextTableId);
            return {
                ...tbl,
                TableID: nextTableId,
                Fields: tbl.Fields ? [...tbl.Fields] : undefined,
                QueryParameters: tbl.QueryParameters ? { ...tbl.QueryParameters } : undefined,
                CalculatedColumns: tbl.CalculatedColumns ? tbl.CalculatedColumns.map((cc) => ({ ...cc })) : undefined
            };
        });

        const clonedCharts = sourceSheet.Charts.map((ch) => ({
            ...ch,
            ChartID: `chart-${randomUUID().slice(0, 8)}`,
            SheetID: newSheetId,
            IncludedSeriesIndices: ch.IncludedSeriesIndices ? [...ch.IncludedSeriesIndices] : undefined
        }));

        const clonedEmbeds = sourceSheet.EmbeddedArtifacts.map((emb) => ({
            ...emb,
            EmbedID: `embed-${randomUUID().slice(0, 8)}`
        }));

        const clonedProtected = sourceSheet.ProtectedRanges
            ? sourceSheet.ProtectedRanges.map((pr) => ({
                  ...pr,
                  RangeID: `prot-${randomUUID().slice(0, 8)}`
              }))
            : undefined;

        const clonedCells: Record<string, SpreadsheetCellSpec> = {};
        const vrowPrefix = `${sourceSheet.SheetID}-vrow-`;
        const vcolPrefix = `${sourceSheet.SheetID}-vcol-`;
        for (const [addr, cell] of Object.entries(sourceSheet.Cells)) {
            let nextRowId = rowIdMap.get(cell.RowID);
            if (!nextRowId) {
                nextRowId = cell.RowID.startsWith(vrowPrefix)
                    ? `${newSheetId}-vrow-${cell.RowID.slice(vrowPrefix.length)}`
                    : `${newSheetId}-row-${randomUUID().slice(0, 8)}`;
                rowIdMap.set(cell.RowID, nextRowId);
            }
            let nextColId = colIdMap.get(cell.ColumnID);
            if (!nextColId) {
                nextColId = cell.ColumnID.startsWith(vcolPrefix)
                    ? `${newSheetId}-vcol-${cell.ColumnID.slice(vcolPrefix.length)}`
                    : `${newSheetId}-col-${randomUUID().slice(0, 8)}`;
                colIdMap.set(cell.ColumnID, nextColId);
            }
            clonedCells[addr] = {
                ...cell,
                RowID: nextRowId,
                ColumnID: nextColId,
                Style: cell.Style ? { ...cell.Style } : undefined,
                LiveTableID: cell.LiveTableID ? (tableIdMap.get(cell.LiveTableID) ?? cell.LiveTableID) : cell.LiveTableID
            };
        }

        const clonedSheet: WorksheetSpec = {
            SheetID: newSheetId,
            Name: targetName,
            Rows: clonedRows,
            Columns: clonedCols,
            Cells: clonedCells,
            FrozenRows: sourceSheet.FrozenRows,
            FrozenColumns: sourceSheet.FrozenColumns,
            SortSpec: sourceSheet.SortSpec ? { ...sourceSheet.SortSpec } : sourceSheet.SortSpec,
            FilterSpecs: sourceSheet.FilterSpecs.map((f) => ({ ...f })),
            ValidationRules: sourceSheet.ValidationRules.map((v) => ({
                ...v,
                AllowedValues: v.AllowedValues ? [...v.AllowedValues] : undefined
            })),
            ConditionalFormats: sourceSheet.ConditionalFormats.map((cf) => ({
                ...cf,
                RuleID: `cf-${randomUUID().slice(0, 8)}`
            })),
            LiveTables: clonedLiveTables,
            Charts: clonedCharts,
            EmbeddedArtifacts: clonedEmbeds,
            ProtectedRanges: clonedProtected
        };

        const srcIdx = workbook.Worksheets.findIndex((w) => w.SheetID === sourceSheet.SheetID);
        workbook.Worksheets.splice(srcIdx + 1, 0, clonedSheet);

        for (const cell of Object.values(clonedSheet.Cells)) {
            if (cell.Formula && cell.Formula.trim().startsWith('=')) {
                cell.FormulaStable = engine.CompileFormulaToStableIds(clonedSheet, cell.Formula, workbook);
            }
        }

        return this.buildMutationSuccess(workbook, {
            sourceSheetId: sourceSheet.SheetID,
            sheetId: clonedSheet.SheetID,
            name: clonedSheet.Name,
            sheetCount: workbook.Worksheets.length
        });
    }

    private handleReorderSheets(
        workbook: WorkbookSpec,
        input: ArtifactToolArgs
    ): ArtifactToolResult {
        const rawIds = Array.isArray(input.sheetIds) ? input.sheetIds : [];
        const requestedIds = rawIds.filter((s): s is string => typeof s === 'string' && s.trim().length > 0).map((s) => s.trim());
        if (requestedIds.length === 0) {
            return this.errorResult('Parameter "sheetIds" must be a non-empty array of sheet IDs or names.');
        }

        const reordered: WorksheetSpec[] = [];
        const seenIds = new Set<string>();
        for (const ref of requestedIds) {
            const match = this.resolveSheet(workbook, ref);
            if (!match) {
                return this.errorResult(`Worksheet '${ref}' not found.`);
            }
            if (!seenIds.has(match.SheetID)) {
                seenIds.add(match.SheetID);
                reordered.push(match);
            }
        }
        for (const ws of workbook.Worksheets) {
            if (!seenIds.has(ws.SheetID)) {
                reordered.push(ws);
            }
        }

        workbook.Worksheets = reordered;
        return this.buildMutationSuccess(workbook, {
            orderedSheets: reordered.map((w) => ({ sheetId: w.SheetID, name: w.Name }))
        });
    }

    private handleDeleteSheet(
        workbook: WorkbookSpec,
        input: ArtifactToolArgs,
        context?: ArtifactToolExecutionContext
    ): ArtifactToolResult {
        if (workbook.Worksheets.length <= 1) {
            return this.errorResult('Cannot delete the only worksheet in the workbook.');
        }
        const sheet = this.resolveSheet(workbook, input.sheet);
        if (!sheet) {
            return this.errorResult(`Worksheet '${String(input.sheet ?? '')}' not found.`);
        }
        const editCtx = this.extractCellEditContext(context);
        if (!editCtx.BypassProtection && (sheet.ProtectedRanges?.length ?? 0) > 0) {
            const blockingRule = sheet.ProtectedRanges!.find((rule) => !isActorAllowedForProtectedRule(rule, editCtx));
            if (blockingRule) {
                return this.errorResult(
                    `Cannot delete worksheet '${sheet.Name}': contains protected range '${blockingRule.Range}' (locked by ${blockingRule.LockedByUserID}).`
                );
            }
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

    private handleSetSheetLayout(
        workbook: WorkbookSpec,
        input: ArtifactToolArgs,
        context?: ArtifactToolExecutionContext
    ): ArtifactToolResult {
        const sheet = this.resolveSheet(workbook, input.sheet);
        if (!sheet) {
            return this.errorResult(`Worksheet '${String(input.sheet ?? '')}' not found.`);
        }
        const editCtx = this.extractCellEditContext(context);

        if (Array.isArray(input.rowHeights)) {
            for (const entry of input.rowHeights) {
                if (!entry || typeof entry !== 'object' || Array.isArray(entry)) continue;
                const rec = entry as ArtifactToolArgs;
                const rowNumber = typeof rec.rowNumber === 'number' ? Math.trunc(rec.rowNumber) : NaN;
                if (!Number.isFinite(rowNumber) || rowNumber < 1 || rowNumber > MAX_SHEET_ROW_COUNT) {
                    return this.errorResult(`Invalid rowNumber '${String(rec.rowNumber ?? '')}' in rowHeights.`);
                }
                if (rec.hidden === true || (typeof rec.height === 'number' && rec.height === 0)) {
                    const protErr = checkBoundsProtection(
                        sheet,
                        { startRow: rowNumber, endRow: rowNumber, startCol: 1, endCol: MAX_SHEET_COLUMN_COUNT },
                        editCtx,
                        `hide row ${rowNumber}`
                    );
                    if (protErr) {
                        return this.errorResult(protErr);
                    }
                }
            }
        }
        if (Array.isArray(input.columnWidths)) {
            for (const entry of input.columnWidths) {
                if (!entry || typeof entry !== 'object' || Array.isArray(entry)) continue;
                const rec = entry as ArtifactToolArgs;
                const colNum = resolveColumnNumber(rec.column);
                if (!colNum) {
                    return this.errorResult(`Invalid column '${String(rec.column ?? '')}' in columnWidths.`);
                }
                if (rec.hidden === true || (typeof rec.width === 'number' && rec.width === 0)) {
                    const protErr = checkBoundsProtection(
                        sheet,
                        { startRow: 1, endRow: MAX_SHEET_ROW_COUNT, startCol: colNum, endCol: colNum },
                        editCtx,
                        `hide column ${colNum}`
                    );
                    if (protErr) {
                        return this.errorResult(protErr);
                    }
                }
            }
        }

        if (typeof input.frozenRows === 'number' && Number.isFinite(input.frozenRows)) {
            const frozenRows = Math.trunc(input.frozenRows);
            if (frozenRows < 0 || frozenRows > MAX_SHEET_ROW_COUNT) {
                return this.errorResult(`frozenRows must be between 0 and ${MAX_SHEET_ROW_COUNT}.`);
            }
            sheet.FrozenRows = frozenRows;
        }
        if (typeof input.frozenColumns === 'number' && Number.isFinite(input.frozenColumns)) {
            const frozenCols = Math.trunc(input.frozenColumns);
            if (frozenCols < 0 || frozenCols > MAX_SHEET_COLUMN_COUNT) {
                return this.errorResult(`frozenColumns must be between 0 and ${MAX_SHEET_COLUMN_COUNT}.`);
            }
            sheet.FrozenColumns = frozenCols;
        }

        if (Array.isArray(input.rowHeights)) {
            for (const entry of input.rowHeights) {
                if (!entry || typeof entry !== 'object' || Array.isArray(entry)) continue;
                const rec = entry as ArtifactToolArgs;
                const rowNumber = typeof rec.rowNumber === 'number' ? Math.trunc(rec.rowNumber) : NaN;
                if (!Number.isFinite(rowNumber) || rowNumber < 1 || rowNumber > MAX_SHEET_ROW_COUNT) {
                    return this.errorResult(`Invalid rowNumber '${String(rec.rowNumber ?? '')}' in rowHeights.`);
                }
                while (sheet.Rows.length < rowNumber) {
                    sheet.Rows.push({
                        RowID: `${sheet.SheetID}-row-${randomUUID().slice(0, 8)}`,
                        Index: sheet.Rows.length + 1,
                        Height: 24,
                        Hidden: false
                    });
                }
                const targetRow = sheet.Rows[rowNumber - 1];
                if (typeof rec.height === 'number' && Number.isFinite(rec.height) && rec.height >= 0) {
                    targetRow.Height = Math.round(rec.height);
                }
                if (typeof rec.hidden === 'boolean') {
                    targetRow.Hidden = rec.hidden;
                }
            }
        }

        if (Array.isArray(input.columnWidths)) {
            for (const entry of input.columnWidths) {
                if (!entry || typeof entry !== 'object' || Array.isArray(entry)) continue;
                const rec = entry as ArtifactToolArgs;
                const colNum = resolveColumnNumber(rec.column);
                if (!colNum) {
                    return this.errorResult(`Invalid column '${String(rec.column ?? '')}' in columnWidths.`);
                }
                while (sheet.Columns.length < colNum) {
                    const nextIdx = sheet.Columns.length + 1;
                    sheet.Columns.push({
                        ColumnID: `${sheet.SheetID}-col-${randomUUID().slice(0, 8)}`,
                        Index: nextIdx,
                        Letter: ColumnIndexToLetter(nextIdx),
                        Width: 110,
                        Hidden: false
                    });
                }
                const targetCol = sheet.Columns[colNum - 1];
                if (typeof rec.width === 'number' && Number.isFinite(rec.width) && rec.width >= 0) {
                    targetCol.Width = Math.round(rec.width);
                }
                if (typeof rec.hidden === 'boolean') {
                    targetCol.Hidden = rec.hidden;
                }
            }
        }

        return this.buildMutationSuccess(workbook, {
            sheetId: sheet.SheetID,
            frozenRows: sheet.FrozenRows,
            frozenColumns: sheet.FrozenColumns,
            rowCount: sheet.Rows.length,
            columnCount: sheet.Columns.length
        });
    }

    private async handleUpsertLiveTable(
        workbook: WorkbookSpec,
        input: ArtifactToolArgs,
        context?: ArtifactToolExecutionContext
    ): Promise<ArtifactToolResult> {
        const sheet = this.resolveSheet(workbook, input.sheet);
        if (!sheet) {
            return this.errorResult(`Worksheet '${String(input.sheet ?? '')}' not found.`);
        }
        const rawSourceType = typeof input.sourceType === 'string' ? input.sourceType.trim().toLowerCase() : '';
        const sourceType: SpreadsheetLiveTableSpec['SourceType'] =
            rawSourceType === 'savedquery' || rawSourceType === 'query'
                ? 'SavedQuery'
                : 'EntityView';
        const tableId =
            typeof input.tableId === 'string' && input.tableId.trim()
                ? input.tableId.trim()
                : `tbl-${Date.now().toString(36)}`;
        const rawCalcCols = Array.isArray(input.calculatedColumns) ? input.calculatedColumns : [];
        const calcCols: SpreadsheetCalculatedColumnSpec[] = rawCalcCols
            .filter((c): c is ArtifactToolArgs => Boolean(c && typeof c === 'object' && !Array.isArray(c)))
            .map((c) => ({
                Header: String(c.header ?? c.Header ?? 'Calculated'),
                FormulaTemplate: String(c.formulaTemplate ?? c.FormulaTemplate ?? '=0'),
                FormatType:
                    typeof c.formatType === 'string'
                        ? (c.formatType as SpreadsheetCellFormatType)
                        : undefined
            }));

        const rawParamsObj =
            input.parameters && typeof input.parameters === 'object' && !Array.isArray(input.parameters)
                ? (input.parameters as ArtifactToolArgs)
                : input.queryParameters && typeof input.queryParameters === 'object' && !Array.isArray(input.queryParameters)
                  ? (input.queryParameters as ArtifactToolArgs)
                  : undefined;
        let queryParameters: Record<string, string | number | boolean | null> | undefined;
        if (rawParamsObj) {
            queryParameters = {};
            for (const [k, v] of Object.entries(rawParamsObj)) {
                if (v === null) {
                    queryParameters[k] = null;
                } else if (typeof v === 'string') {
                    queryParameters[k] = v;
                } else if (typeof v === 'number') {
                    queryParameters[k] = v;
                } else if (typeof v === 'boolean') {
                    queryParameters[k] = v;
                } else if (v !== undefined) {
                    queryParameters[k] = JSON.stringify(v);
                }
            }
        }

        const anchorCell =
            typeof input.anchorCell === 'string' && input.anchorCell.trim() ? input.anchorCell.trim().toUpperCase() : 'A1';
        const anchorPos = ParseCellAddress(anchorCell);
        if (!anchorPos || anchorPos.row > MAX_SHEET_ROW_COUNT || anchorPos.col > MAX_SHEET_COLUMN_COUNT) {
            return this.errorResult(`Invalid anchorCell '${anchorCell}'.`);
        }

        const spec: SpreadsheetLiveTableSpec = {
            TableID: tableId,
            Title: String(input.title ?? input.entityName ?? input.queryName ?? 'Live Data Table'),
            SourceType: sourceType,
            EntityName: typeof input.entityName === 'string' ? input.entityName : undefined,
            ViewID: typeof input.viewId === 'string' ? input.viewId : undefined,
            ViewName: typeof input.viewName === 'string' ? input.viewName : undefined,
            ExtraFilter: typeof input.extraFilter === 'string' ? input.extraFilter : undefined,
            Fields: Array.isArray(input.fields) ? input.fields.map(String) : undefined,
            QueryID: typeof input.queryId === 'string' ? input.queryId : undefined,
            QueryName: typeof input.queryName === 'string' ? input.queryName : undefined,
            QueryParameters: queryParameters,
            MaxRows: typeof input.maxRows === 'number' && input.maxRows > 0 ? Math.trunc(input.maxRows) : undefined,
            AnchorCell: anchorCell,
            IncludeHeaders: true,
            Mode: 'Live',
            CalculatedColumns: calcCols
        };

        const editCtx = this.extractCellEditContext(context);
        const existingBounds = this.getLiveTableCellBounds(sheet, tableId);
        if (existingBounds) {
            const existingProtErr = checkBoundsProtection(
                sheet,
                existingBounds,
                editCtx,
                `update live table '${tableId}'`
            );
            if (existingProtErr) {
                return this.errorResult(existingProtErr);
            }
        }
        const anchorBounds = this.computeLiveTableResultBounds(spec);
        if (anchorBounds) {
            const anchorProtErr = checkBoundsProtection(
                sheet,
                anchorBounds,
                editCtx,
                `upsert live table '${tableId}' at '${spec.AnchorCell}'`
            );
            if (anchorProtErr) {
                return this.errorResult(anchorProtErr);
            }
        }

        const prevLiveTables = [...sheet.LiveTables];
        const prevCells = { ...sheet.Cells };
        const prevRows = [...sheet.Rows];
        const prevColumns = [...sheet.Columns];

        const existingIdx = sheet.LiveTables.findIndex((t) => t.TableID === tableId);
        if (existingIdx >= 0) {
            sheet.LiveTables[existingIdx] = spec;
        } else {
            sheet.LiveTables.push(spec);
        }

        let materializedSummary = this.buildUnmaterializedTableSummary(sheet, spec);
        if (context?.contextUser && context?.provider) {
            const engine = SpreadsheetEngine.Instance;
            const refreshResults = await engine.RefreshLiveTables(workbook, context.contextUser, context.provider, {
                TableID: spec.TableID
            });
            const tblRes = refreshResults[spec.TableID];
            if (tblRes && (tblRes.AccessDenied || !tblRes.Success)) {
                sheet.LiveTables = prevLiveTables;
                sheet.Cells = prevCells;
                sheet.Rows = prevRows;
                sheet.Columns = prevColumns;
                return this.errorResult(
                    tblRes.ErrorMessage || `Access denied or failed to materialize live table '${spec.TableID}'.`
                );
            }
            const materializedBounds =
                this.getLiveTableCellBounds(sheet, spec.TableID) ??
                this.computeLiveTableResultBounds(spec, tblRes);
            if (materializedBounds) {
                const matProtErr = checkBoundsProtection(
                    sheet,
                    materializedBounds,
                    editCtx,
                    `materialize live table '${tableId}'`
                );
                if (matProtErr) {
                    sheet.LiveTables = prevLiveTables;
                    sheet.Cells = prevCells;
                    sheet.Rows = prevRows;
                    sheet.Columns = prevColumns;
                    return this.errorResult(matProtErr);
                }
            }
            await engine.EvaluateMjCustomFunctions(workbook, context.contextUser, context.provider, {
                HostArtifactID: context.artifactId,
                BypassCache: true
            });
            engine.EvaluateWorkbook(workbook);
            materializedSummary = this.summarizeMaterializedLiveTable(sheet, spec, refreshResults[spec.TableID]);
        }

        return this.buildMutationSuccess(workbook, {
            sheetId: sheet.SheetID,
            sheetName: sheet.Name,
            tableId: spec.TableID,
            anchorCell: spec.AnchorCell,
            liveTable: spec,
            ...materializedSummary
        });
    }

    private async handleRefreshLiveTables(
        workbook: WorkbookSpec,
        input: ArtifactToolArgs,
        context?: ArtifactToolExecutionContext
    ): Promise<ArtifactToolResult> {
        if (!context?.contextUser || !context?.provider) {
            return this.errorResult('refresh_live_tables requires an authenticated user and metadata provider context.');
        }
        const engine = SpreadsheetEngine.Instance;
        const targetTableId =
            typeof input.tableId === 'string' && input.tableId.trim() ? input.tableId.trim() : undefined;
        const editCtx = this.extractCellEditContext(context);

        for (const ws of workbook.Worksheets) {
            for (const tbl of ws.LiveTables) {
                if (targetTableId && tbl.TableID !== targetTableId) continue;
                const existingBounds = this.getLiveTableCellBounds(ws, tbl.TableID);
                if (existingBounds) {
                    const protErr = checkBoundsProtection(
                        ws,
                        existingBounds,
                        editCtx,
                        `refresh live table '${tbl.TableID}'`
                    );
                    if (protErr) {
                        return this.errorResult(protErr);
                    }
                }
                const anchorBounds = this.computeLiveTableResultBounds(tbl);
                if (anchorBounds) {
                    const anchorErr = checkBoundsProtection(
                        ws,
                        anchorBounds,
                        editCtx,
                        `refresh live table '${tbl.TableID}'`
                    );
                    if (anchorErr) {
                        return this.errorResult(anchorErr);
                    }
                }
            }
        }

        const sheetSnapshots = workbook.Worksheets.map((ws) => ({
            ws,
            cells: { ...ws.Cells },
            rows: [...ws.Rows],
            columns: [...ws.Columns],
            liveTables: ws.LiveTables.map((t) => ({ ...t }))
        }));

        const refreshResults = await engine.RefreshLiveTables(workbook, context.contextUser, context.provider, {
            TableID: targetTableId
        });

        for (const ws of workbook.Worksheets) {
            for (const tbl of ws.LiveTables) {
                if (targetTableId && tbl.TableID !== targetTableId) continue;
                const tblRes = refreshResults[tbl.TableID];
                if (tblRes && (tblRes.AccessDenied || !tblRes.Success)) {
                    for (const snap of sheetSnapshots) {
                        snap.ws.Cells = snap.cells;
                        snap.ws.Rows = snap.rows;
                        snap.ws.Columns = snap.columns;
                        snap.ws.LiveTables = snap.liveTables;
                    }
                    return this.errorResult(
                        tblRes.ErrorMessage || `Access denied or failed to refresh live table '${tbl.TableID}'.`
                    );
                }
                const cellBounds = this.getLiveTableCellBounds(ws, tbl.TableID);
                const resultBounds = this.computeLiveTableResultBounds(tbl, refreshResults[tbl.TableID]);
                const boundsToCheck = cellBounds ?? resultBounds;
                if (boundsToCheck) {
                    const matProtErr = checkBoundsProtection(
                        ws,
                        boundsToCheck,
                        editCtx,
                        `refresh live table '${tbl.TableID}'`
                    );
                    if (matProtErr) {
                        for (const snap of sheetSnapshots) {
                            snap.ws.Cells = snap.cells;
                            snap.ws.Rows = snap.rows;
                            snap.ws.Columns = snap.columns;
                            snap.ws.LiveTables = snap.liveTables;
                        }
                        return this.errorResult(matProtErr);
                    }
                }
            }
        }

        await engine.EvaluateMjCustomFunctions(workbook, context.contextUser, context.provider, {
            HostArtifactID: context.artifactId,
            BypassCache: true
        });
        engine.EvaluateWorkbook(workbook);

        const tables: Array<ArtifactToolArgs> = [];
        for (const ws of workbook.Worksheets) {
            for (const tbl of ws.LiveTables) {
                if (targetTableId && tbl.TableID !== targetTableId) continue;
                tables.push({
                    tableId: tbl.TableID,
                    sheetId: ws.SheetID,
                    sheetName: ws.Name,
                    anchorCell: tbl.AnchorCell,
                    ...this.summarizeMaterializedLiveTable(ws, tbl, refreshResults[tbl.TableID])
                });
            }
        }

        return this.buildMutationSuccess(workbook, {
            refreshedCount: tables.length,
            tables
        });
    }

    private handleDeleteLiveTable(
        workbook: WorkbookSpec,
        input: ArtifactToolArgs,
        context?: ArtifactToolExecutionContext
    ): ArtifactToolResult {
        const sheet = this.resolveSheet(workbook, input.sheet);
        if (!sheet) {
            return this.errorResult(`Worksheet '${String(input.sheet ?? '')}' not found.`);
        }
        const tableId = typeof input.tableId === 'string' ? input.tableId.trim() : '';
        if (!tableId) {
            return this.errorResult('Parameter "tableId" is required.');
        }
        const idx = sheet.LiveTables.findIndex((t) => t.TableID === tableId);
        if (idx < 0) {
            return this.errorResult(`LiveTable '${tableId}' was not found on worksheet '${sheet.Name}'.`);
        }

        if (input.clearCells === true) {
            const editCtx = this.extractCellEditContext(context);
            const tableCells = Object.values(sheet.Cells).filter((c) => c.LiveTableID === tableId);
            for (const cell of tableCells) {
                const perm = SpreadsheetEngine.Instance.CheckCellWritePermission(sheet, cell.Address, editCtx);
                if (!perm.Allowed) {
                    return this.errorResult(perm.Reason || `Cell '${cell.Address}' is inside a protected range.`);
                }
            }
            for (const cell of tableCells) {
                SpreadsheetEngine.Instance.ClearRange(workbook, sheet.SheetID, cell.Address, false, editCtx);
            }
        }

        sheet.LiveTables.splice(idx, 1);
        return this.buildMutationSuccess(workbook, {
            sheetId: sheet.SheetID,
            deletedTableId: tableId,
            remainingLiveTables: sheet.LiveTables
        });
    }

    private buildUnmaterializedTableSummary(
        sheet: WorksheetSpec,
        spec: SpreadsheetLiveTableSpec
    ): {
        materialized: boolean;
        headers: string[];
        rowCount: number;
        boundingRange: string;
        dataRange: string | null;
        sampleRows: Array<Record<string, string | number | boolean | null>>;
    } {
        return {
            materialized: false,
            headers: [],
            rowCount: 0,
            boundingRange: spec.AnchorCell || 'A1',
            dataRange: null,
            sampleRows: [],
        };
    }

    private summarizeMaterializedLiveTable(
        sheet: WorksheetSpec,
        spec: SpreadsheetLiveTableSpec,
        execRes?: DocumentBlockExecutionResult
    ): {
        materialized: boolean;
        headers: string[];
        rowCount: number;
        boundingRange: string;
        dataRange: string | null;
        sampleRows: Array<Record<string, string | number | boolean | null>>;
        refreshError?: string;
    } {
        if (!execRes || !execRes.Success || execRes.AccessDenied) {
            return {
                materialized: false,
                headers: [],
                rowCount: 0,
                boundingRange: spec.AnchorCell || 'A1',
                dataRange: null,
                sampleRows: [],
                refreshError: execRes?.ErrorMessage || spec.LastError || 'Failed to materialize live table.'
            };
        }
        const anchor = ParseCellAddress(spec.AnchorCell || 'A1') ?? { row: 1, col: 1 };
        const baseColumns =
            execRes.Columns && execRes.Columns.length > 0
                ? execRes.Columns.map((c) => c.DisplayName || c.Name)
                : execRes.Rows[0]
                  ? Object.keys(execRes.Rows[0])
                  : [];
        const calcHeaders = (spec.CalculatedColumns ?? []).map((cc) => cc.Header);
        const headers = [...baseColumns, ...calcHeaders];
        const totalCols = Math.max(1, headers.length);
        const rowCount = execRes.Rows.length;
        const headerOffset = spec.IncludeHeaders !== false ? 1 : 0;
        const startAddr = FormatCellAddress(anchor.row, anchor.col);
        const lastRow = anchor.row + headerOffset + Math.max(0, rowCount - (headerOffset === 0 ? 1 : 0)) - (rowCount === 0 && headerOffset > 0 ? 0 : 0);
        const boundedLastRow = Math.max(anchor.row, anchor.row + headerOffset + rowCount - 1);
        const endColAddr = FormatCellAddress(boundedLastRow, anchor.col + totalCols - 1);
        const boundingRange = startAddr === endColAddr ? startAddr : `${startAddr}:${endColAddr}`;
        let dataRange: string | null = null;
        if (rowCount > 0) {
            const firstDataRow = anchor.row + headerOffset;
            const lastDataRow = firstDataRow + rowCount - 1;
            dataRange = `${FormatCellAddress(firstDataRow, anchor.col)}:${FormatCellAddress(lastDataRow, anchor.col + totalCols - 1)}`;
        }
        const sampleRows = execRes.Rows.slice(0, 5).map((row) => {
            const out: Record<string, string | number | boolean | null> = {};
            for (const [k, v] of Object.entries(row)) {
                if (v === null || v === undefined) {
                    out[k] = null;
                } else if (typeof v === 'string' || typeof v === 'number' || typeof v === 'boolean') {
                    out[k] = v;
                } else {
                    out[k] = String(v);
                }
            }
            return out;
        });
        // Reconcile unused-param lint while keeping helper cohesive with future sheet-cell checks
        void lastRow;
        void sheet;
        return {
            materialized: true,
            headers,
            rowCount,
            boundingRange,
            dataRange,
            sampleRows
        };
    }

    private summarizeSpilledFormulaFootprint(
        sheet: WorksheetSpec,
        formulaCell: string
    ): { formulaCell: string; boundingRange: string; headers: string[]; rowCount: number } | null {
        const origin = ParseCellAddress(formulaCell);
        if (!origin) return null;
        let maxRow = origin.row;
        let maxCol = origin.col;
        for (const cell of Object.values(sheet.Cells)) {
            if (cell.Address === formulaCell || cell.SpilledFrom === formulaCell) {
                const pos = ParseCellAddress(cell.Address);
                if (pos) {
                    if (pos.row > maxRow) maxRow = pos.row;
                    if (pos.col > maxCol) maxCol = pos.col;
                }
            }
        }
        const headers: string[] = [];
        for (let c = origin.col; c <= maxCol; c++) {
            const hdrCell = sheet.Cells[FormatCellAddress(origin.row, c)];
            if (hdrCell) {
                headers.push(hdrCell.DisplayValue || String(hdrCell.ComputedValue ?? hdrCell.RawValue ?? ''));
            }
        }
        const startAddr = FormatCellAddress(origin.row, origin.col);
        const endAddr = FormatCellAddress(maxRow, maxCol);
        return {
            formulaCell,
            boundingRange: startAddr === endAddr ? startAddr : `${startAddr}:${endAddr}`,
            headers,
            rowCount: Math.max(0, maxRow - origin.row)
        };
    }

    private handleUpsertChart(
        workbook: WorkbookSpec,
        input: ArtifactToolArgs
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
        const existingIdx = sheet.Charts.findIndex((c) => c.ChartID === chartId);
        const existing = existingIdx >= 0 ? sheet.Charts[existingIdx] : undefined;

        const chartTypeRaw = typeof input.chartType === 'string' ? input.chartType.toLowerCase() : existing?.ChartType ?? 'bar';
        const chartType: SpreadsheetChartType =
            chartTypeRaw === 'line' || chartTypeRaw === 'pie' || chartTypeRaw === 'area'
                ? chartTypeRaw
                : 'bar';

        const placement: 'dock' | 'sheet' | undefined =
            input.placement === 'sheet' || input.placement === 'dock' ? input.placement : existing?.Placement;
        const hasHeaderRow: boolean | 'auto' | undefined =
            input.hasHeaderRow === true || input.hasHeaderRow === false || input.hasHeaderRow === 'auto'
                ? input.hasHeaderRow
                : existing?.HasHeaderRow;
        const seriesOrientation: 'columns' | 'rows' | undefined =
            input.seriesOrientation === 'rows' || input.seriesOrientation === 'columns'
                ? input.seriesOrientation
                : existing?.SeriesOrientation;
        const categoryColumnIndex =
            typeof input.categoryColumnIndex === 'number' && Number.isInteger(input.categoryColumnIndex) && input.categoryColumnIndex >= 0
                ? input.categoryColumnIndex
                : existing?.CategoryColumnIndex;
        const includedSeriesIndices = Array.isArray(input.includedSeriesIndices)
            ? input.includedSeriesIndices.filter((n): n is number => typeof n === 'number' && Number.isInteger(n) && n >= 0)
            : existing?.IncludedSeriesIndices;

        const chartSpec: SpreadsheetChartSpec = {
            ...(existing ?? {}),
            ChartID: chartId,
            Title: typeof input.title === 'string' ? input.title : existing?.Title ?? `Chart (${sourceRange})`,
            ChartType: chartType,
            SheetID: sheet.SheetID,
            SourceRange: sourceRange,
            PositionCell: typeof input.positionCell === 'string' ? input.positionCell : existing?.PositionCell ?? 'E2',
            Placement: placement,
            OffsetX: typeof input.offsetX === 'number' && Number.isFinite(input.offsetX) ? Math.round(input.offsetX) : existing?.OffsetX,
            OffsetY: typeof input.offsetY === 'number' && Number.isFinite(input.offsetY) ? Math.round(input.offsetY) : existing?.OffsetY,
            WidthPx: typeof input.widthPx === 'number' && Number.isFinite(input.widthPx) ? Math.round(input.widthPx) : existing?.WidthPx,
            HeightPx: typeof input.heightPx === 'number' && Number.isFinite(input.heightPx) ? Math.round(input.heightPx) : existing?.HeightPx,
            ShowLegend: typeof input.showLegend === 'boolean' ? input.showLegend : existing?.ShowLegend ?? true,
            HasHeaderRow: hasHeaderRow,
            SeriesOrientation: seriesOrientation,
            CategoryColumnIndex: categoryColumnIndex,
            IncludedSeriesIndices: includedSeriesIndices,
            ShowDataLabels: typeof input.showDataLabels === 'boolean' ? input.showDataLabels : existing?.ShowDataLabels
        };

        if (existingIdx >= 0) {
            sheet.Charts[existingIdx] = chartSpec;
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

    private handleDeleteChart(
        workbook: WorkbookSpec,
        input: ArtifactToolArgs
    ): ArtifactToolResult {
        const sheet = this.resolveSheet(workbook, input.sheet);
        if (!sheet) {
            return this.errorResult(`Worksheet '${String(input.sheet ?? '')}' not found.`);
        }
        const chartId = typeof input.chartId === 'string' ? input.chartId.trim() : '';
        if (!chartId) {
            return this.errorResult('Parameter "chartId" is required.');
        }
        const idx = sheet.Charts.findIndex((c) => c.ChartID === chartId);
        if (idx < 0) {
            return this.errorResult(`Chart '${chartId}' was not found on worksheet '${sheet.Name}'.`);
        }
        sheet.Charts.splice(idx, 1);
        return this.buildMutationSuccess(workbook, {
            sheetId: sheet.SheetID,
            deletedChartId: chartId,
            remainingCharts: sheet.Charts
        });
    }

    private async handleEmbedArtifact(
        workbook: WorkbookSpec,
        input: ArtifactToolArgs,
        context?: ArtifactToolExecutionContext
    ): Promise<ArtifactToolResult> {
        const sheet = this.resolveSheet(workbook, input.sheet);
        if (!sheet) {
            return this.errorResult(`Worksheet '${String(input.sheet ?? '')}' not found.`);
        }
        const rawArtifactId = typeof input.artifactId === 'string' ? input.artifactId.trim() : '';
        if (!rawArtifactId) {
            return this.errorResult('Parameter "artifactId" is required.');
        }
        const resolved = ResolveEmbeddedArtifactId(rawArtifactId, context);
        if (!resolved.ok) {
            return this.errorResult(resolved.errorMessage);
        }
        const artifactId = resolved.artifactId;
        let resolvedVersionId: string | null | undefined;
        if (typeof input.versionId === 'string' && input.versionId.trim()) {
            const verResult = ResolveEmbeddedVersionId(input.versionId, context);
            if (!verResult.ok) {
                return this.errorResult(verResult.errorMessage);
            }
            resolvedVersionId = verResult.versionId;
        } else if (input.versionId === null) {
            resolvedVersionId = null;
        }
        const access = await ValidateEmbeddedArtifactAccess({
            targetArtifactId: artifactId,
            targetVersionId: resolvedVersionId,
            context
        });
        if (!access.Ok) {
            return this.errorResult(access.ErrorMessage || `Cannot embed artifact '${artifactId}'.`);
        }
        const embedId =
            typeof input.embedId === 'string' && input.embedId.trim()
                ? input.embedId.trim()
                : `embed-${sheet.EmbeddedArtifacts.length + 1}`;
        const existing = sheet.EmbeddedArtifacts.find((e) => e.EmbedID === embedId);
        const typeName =
            typeof input.artifactTypeName === 'string'
                ? input.artifactTypeName
                : existing?.ArtifactTypeName ?? access.ArtifactTypeName ?? 'Whiteboard';
        const spec: SpreadsheetEmbeddedArtifactSpec = {
            EmbedID: embedId,
            Title: typeof input.title === 'string' ? input.title : existing?.Title ?? `${typeName} Canvas`,
            ArtifactID: artifactId,
            ArtifactVersionID:
                resolvedVersionId !== undefined
                    ? resolvedVersionId
                    : existing?.ArtifactVersionID ?? null,
            ArtifactTypeName: typeName,
            DriverClass:
                access.DriverClass ??
                (typeName === 'Whiteboard' ? 'WhiteboardArtifactViewerPlugin' : existing?.DriverClass),
            AnchorCell: typeof input.anchorCell === 'string' ? input.anchorCell : existing?.AnchorCell ?? 'F2',
            WidthPx:
                typeof input.widthPx === 'number' && Number.isFinite(input.widthPx) && input.widthPx > 0
                    ? Math.round(input.widthPx)
                    : existing?.WidthPx ?? 520,
            HeightPx:
                typeof input.heightPx === 'number' && Number.isFinite(input.heightPx) && input.heightPx > 0
                    ? Math.round(input.heightPx)
                    : existing?.HeightPx ?? 320,
            AllowInlineEdit:
                typeof input.allowInlineEdit === 'boolean'
                    ? input.allowInlineEdit
                    : existing?.AllowInlineEdit ?? true
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

    private handleDeleteEmbeddedArtifact(
        workbook: WorkbookSpec,
        input: ArtifactToolArgs
    ): ArtifactToolResult {
        const sheet = this.resolveSheet(workbook, input.sheet);
        if (!sheet) {
            return this.errorResult(`Worksheet '${String(input.sheet ?? '')}' not found.`);
        }
        const embedId = typeof input.embedId === 'string' ? input.embedId.trim() : '';
        if (!embedId) {
            return this.errorResult('Parameter "embedId" is required.');
        }
        const idx = sheet.EmbeddedArtifacts.findIndex((e) => e.EmbedID === embedId);
        if (idx < 0) {
            return this.errorResult(`Embedded artifact '${embedId}' was not found on worksheet '${sheet.Name}'.`);
        }
        sheet.EmbeddedArtifacts.splice(idx, 1);
        return this.buildMutationSuccess(workbook, {
            sheetId: sheet.SheetID,
            deletedEmbedId: embedId,
            remainingEmbeddedArtifacts: sheet.EmbeddedArtifacts
        });
    }

    private getLiveTableCellBounds(
        sheet: WorksheetSpec,
        tableId: string
    ): { startRow: number; endRow: number; startCol: number; endCol: number } | null {
        let minRow = Infinity;
        let maxRow = 0;
        let minCol = Infinity;
        let maxCol = 0;
        for (const cell of Object.values(sheet.Cells)) {
            if (cell?.LiveTableID !== tableId) continue;
            const pos = ParseCellAddress(cell.Address);
            if (!pos) continue;
            if (pos.row < minRow) minRow = pos.row;
            if (pos.row > maxRow) maxRow = pos.row;
            if (pos.col < minCol) minCol = pos.col;
            if (pos.col > maxCol) maxCol = pos.col;
        }
        if (maxRow === 0 || maxCol === 0) {
            return null;
        }
        return { startRow: minRow, endRow: maxRow, startCol: minCol, endCol: maxCol };
    }

    private computeLiveTableResultBounds(
        table: SpreadsheetLiveTableSpec,
        result?: DocumentBlockExecutionResult
    ): { startRow: number; endRow: number; startCol: number; endCol: number } | null {
        const anchor = ParseCellAddress(table.AnchorCell || 'A1');
        if (!anchor) {
            return null;
        }
        const dataCols = result
            ? result.Columns && result.Columns.length > 0
                ? result.Columns.length
                : result.Rows[0]
                  ? Object.keys(result.Rows[0]).length
                  : 0
            : (table.Fields?.length ?? 0);
        const totalCols = Math.max(1, dataCols + (table.CalculatedColumns?.length ?? 0));
        const headerRows = table.IncludeHeaders !== false ? 1 : 0;
        const dataRows = result ? result.Rows.length : 0;
        const totalRows = Math.max(1, headerRows + dataRows);
        return {
            startRow: anchor.row,
            endRow: Math.min(MAX_SHEET_ROW_COUNT, anchor.row + totalRows - 1),
            startCol: anchor.col,
            endCol: Math.min(MAX_SHEET_COLUMN_COUNT, anchor.col + totalCols - 1)
        };
    }

    private handleSortAndFilter(
        workbook: WorkbookSpec,
        input: ArtifactToolArgs,
        context?: ArtifactToolExecutionContext
    ): ArtifactToolResult {
        const engine = SpreadsheetEngine.Instance;
        const sheet = this.resolveSheet(workbook, input.sheet);
        if (!sheet) {
            return this.errorResult(`Worksheet '${String(input.sheet ?? '')}' not found.`);
        }
        const hasSort = typeof input.sortColumn === 'string' && input.sortColumn.trim().length > 0;
        const hasFilters = Array.isArray(input.filters);
        if (hasSort || hasFilters) {
            const editCtx = this.extractCellEditContext(context);
            const populated = this.getPopulatedBounds(sheet);
            const startRow = 2; // HeaderRows: 1 keeps row 1 fixed
            const endRow = hasFilters
                ? Math.max(startRow, sheet.Rows.length, populated.maxRow)
                : Math.max(startRow, populated.maxRow);
            const protErr = checkBoundsProtection(
                sheet,
                { startRow, endRow, startCol: 1, endCol: MAX_SHEET_COLUMN_COUNT },
                editCtx,
                hasSort && hasFilters ? 'sort and filter worksheet' : hasSort ? 'sort worksheet' : 'filter worksheet'
            );
            if (protErr) {
                return this.errorResult(protErr);
            }
        }
        if (hasSort) {
            engine.SortWorksheet(workbook, sheet.SheetID, {
                ColumnLetter: String(input.sortColumn).trim().toUpperCase(),
                Direction: input.sortDirection === 'desc' ? 'desc' : 'asc',
                HeaderRows: 1
            });
        }
        if (hasFilters) {
            sheet.FilterSpecs = (input.filters as ArtifactJsonValue[])
                .filter((f): f is ArtifactToolArgs => Boolean(f && typeof f === 'object' && !Array.isArray(f)))
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
        input: ArtifactToolArgs
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
        const rows: Array<Record<string, SpreadsheetCellValue>> = [];

        for (let r = firstDataRow; r <= lastDataRow; r++) {
            let hasAnyCellInRow = false;
            const record: Record<string, SpreadsheetCellValue> = {};
            for (const [colIdx, colName] of headerMap.entries()) {
                const addr = FormatCellAddress(r, colIdx);
                const cell = ws.Cells[addr];
                const val: SpreadsheetCellValue = cell ? (cell.ComputedValue ?? cell.RawValue ?? null) : null;
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
        input: ArtifactToolArgs
    ): ArtifactToolResult {
        EnsureNodeVmSafeRegexExecutorRegistered();
        const engine = SpreadsheetEngine.Instance;
        engine.EvaluateWorkbook(workbook);
        const query = typeof input.query === 'string' ? input.query : '';
        if (!query) {
            return this.errorResult('Parameter "query" is required.');
        }

        const explicitRegex = input.use_regex === true || input.useRegex === true;

        let regex: RegExp | null = null;
        if (explicitRegex) {
            if (query.length > 256) {
                return this.errorResult('Unsafe or overly complex regular expression rejected');
            }
            try {
                new RegExp(query, 'i');
            } catch {
                return this.errorResult(`Invalid regex pattern: "${query}".`);
            }
            regex = CompileSafeUserRegex(query, 'i');
            if (!regex || !IsSafeUserRegex(query, 'i')) {
                return this.errorResult('Unsafe or overly complex regular expression rejected');
            }
        }
        const literalNeedle = regex ? '' : query.toLowerCase();

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
        const unsearchableCells: UnsearchableSpreadsheetCell[] = [];
        let tooLongCount = 0;
        let timeoutCount = 0;
        let budgetExpired = false;
        const regexDeadline = regex ? performance.now() + this.RegexBudgetMs : 0;

        const recordUnsearchableCell = (
            sheetName: string,
            cellAddr: string,
            reason: UnsearchableSpreadsheetCell['reason']
        ): void => {
            if (reason === 'exceeds_64kb_regex_limit') {
                tooLongCount++;
            } else {
                timeoutCount++;
            }
            if (unsearchableCells.length < MAX_REPORTED_UNSEARCHABLE_CELLS) {
                unsearchableCells.push({
                    sheet: sheetName,
                    cell: cellAddr,
                    reason
                });
            }
        };

        interface PendingCellCandidate {
            sheetName: string;
            cellAddr: string;
            text: string;
            altRawStr: string | null;
            altTooLong: boolean;
        }
        let pendingBatch: PendingCellCandidate[] = [];
        let pendingTexts: string[] = [];
        let pendingChars = 0;

        const flushCellBatch = (): void => {
            if (pendingBatch.length === 0 || !regex) return;
            if (matches.length >= SEARCH_MATCH_LIMIT) {
                pendingBatch = [];
                pendingTexts = [];
                pendingChars = 0;
                return;
            }
            if (budgetExpired) {
                for (const item of pendingBatch) {
                    recordUnsearchableCell(item.sheetName, item.cellAddr, 'regex_timeout');
                }
                pendingBatch = [];
                pendingTexts = [];
                pendingChars = 0;
                return;
            }
            const recRes = ExecuteSafeRegexBatchWithRecovery(
                regex,
                pendingTexts,
                regexDeadline,
                BATCH_REGEX_MAX_MS,
                MAX_REGEX_INPUT_BYTES
            );
            if (recRes.BudgetExpired) {
                budgetExpired = true;
            }

            for (let k = 0; k < pendingBatch.length; k++) {
                const item = pendingBatch[k];
                if (matches.length >= SEARCH_MATCH_LIMIT) {
                    break;
                }
                if (recRes.Matches[k]) {
                    matches.push({
                        sheet: item.sheetName,
                        cell: item.cellAddr,
                        value: item.text
                    });
                    continue;
                }
                if (recRes.TimedOut[k] || recRes.BudgetSkipped[k]) {
                    recordUnsearchableCell(item.sheetName, item.cellAddr, 'regex_timeout');
                    continue;
                }
                if (recRes.InputTooLong[k]) {
                    recordUnsearchableCell(item.sheetName, item.cellAddr, 'exceeds_64kb_regex_limit');
                    continue;
                }
                if (item.altRawStr !== null) {
                    if (budgetExpired) {
                        recordUnsearchableCell(item.sheetName, item.cellAddr, 'regex_timeout');
                        continue;
                    }
                    const remAlt = regexDeadline - performance.now();
                    if (remAlt <= 0) {
                        budgetExpired = true;
                        recordUnsearchableCell(item.sheetName, item.cellAddr, 'regex_timeout');
                        continue;
                    }
                    const altRes = SafeRegexSearchDetailed(
                        regex,
                        item.altRawStr,
                        Math.min(BATCH_REGEX_MAX_MS, remAlt),
                        MAX_REGEX_INPUT_BYTES
                    );
                    if (altRes.Matched) {
                        matches.push({
                            sheet: item.sheetName,
                            cell: item.cellAddr,
                            value: item.text
                        });
                    } else if (altRes.InputTooLong) {
                        recordUnsearchableCell(item.sheetName, item.cellAddr, 'exceeds_64kb_regex_limit');
                    } else if (altRes.TimedOut) {
                        budgetExpired = true;
                        recordUnsearchableCell(item.sheetName, item.cellAddr, 'regex_timeout');
                    }
                } else if (item.altTooLong) {
                    recordUnsearchableCell(item.sheetName, item.cellAddr, 'exceeds_64kb_regex_limit');
                }
            }

            pendingBatch = [];
            pendingTexts = [];
            pendingChars = 0;
        };

        for (const ws of targetSheets) {
            if (matches.length >= SEARCH_MATCH_LIMIT) break;
            const rawCellList = Object.values(ws.Cells);
            const keyedCells = new Array<{ sortKey: number; cell: SpreadsheetCellSpec }>(rawCellList.length);
            for (let i = 0; i < rawCellList.length; i++) {
                const c = rawCellList[i];
                keyedCells[i] = { sortKey: computeFastCellSortKey(c.Address), cell: c };
            }
            keyedCells.sort((a, b) => a.sortKey - b.sortKey);

            for (let i = 0; i < keyedCells.length; i++) {
                if (matches.length >= SEARCH_MATCH_LIMIT) break;
                const cell = keyedCells[i].cell;
                const val = cell.ComputedValue ?? cell.RawValue;
                if (val === null || val === undefined || val === '') continue;
                const rawStr = String(val);
                const text = cell.DisplayValue || rawStr;

                if (!regex) {
                    const matched =
                        text.toLowerCase().includes(literalNeedle) ||
                        (rawStr !== text && rawStr.toLowerCase().includes(literalNeedle));
                    if (matched) {
                        matches.push({
                            sheet: ws.Name,
                            cell: cell.Address,
                            value: text
                        });
                    }
                    continue;
                }

                if (exceedsSheetRegexInputBytes(text)) {
                    flushCellBatch();
                    recordUnsearchableCell(ws.Name, cell.Address, 'exceeds_64kb_regex_limit');
                    continue;
                }

                if (budgetExpired) {
                    recordUnsearchableCell(ws.Name, cell.Address, 'regex_timeout');
                    continue;
                }

                const hasAlt = rawStr !== text;
                const altTooLong = hasAlt && exceedsSheetRegexInputBytes(rawStr);
                pendingBatch.push({
                    sheetName: ws.Name,
                    cellAddr: cell.Address,
                    text,
                    altRawStr: hasAlt && !altTooLong ? rawStr : null,
                    altTooLong
                });
                pendingTexts.push(text);
                pendingChars += text.length;

                if (pendingBatch.length >= MAX_BATCH_ITEMS || pendingChars >= MAX_BATCH_CHARS) {
                    flushCellBatch();
                }
            }
            flushCellBatch();
        }

        const unsearchableCount = tooLongCount + timeoutCount;
        const warnings: string[] = [];
        if (tooLongCount > 0) {
            warnings.push(
                `${tooLongCount} cell(s) exceeded the 64 KB regex limit and were not searched. Retry with use_regex: false for plain-text search across arbitrarily large cells.`
            );
        }
        if (timeoutCount > 0) {
            warnings.push(
                `${timeoutCount} cell(s) were skipped because regex evaluation reached the ${this.RegexBudgetMs}ms tool time budget. Simplify the pattern or retry with use_regex: false for plain-text search.`
            );
        }
        if (unsearchableCount > unsearchableCells.length) {
            warnings.push(
                `Showing first ${unsearchableCells.length} of ${unsearchableCount} unsearchable cell(s) in unsearchableCells.`
            );
        }

        return this.successResult({
            matches,
            partial: unsearchableCount > 0,
            timedOut: timeoutCount > 0,
            unsearchableCount,
            unsearchableCells,
            warnings
        });
    }

    private handleAggregateColumn(
        workbook: WorkbookSpec,
        input: ArtifactToolArgs
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
                value = ComputeNumericExtremum(numericValues, 'min') ?? 0;
                break;
            case 'max':
                value = ComputeNumericExtremum(numericValues, 'max') ?? 0;
                break;
            default:
                value = numericValues.length;
        }
        return this.successResult({ operation, column: columnName, value: Number(value.toPrecision(15)) });
    }

    private handleGetFormulas(
        workbook: WorkbookSpec,
        input: ArtifactToolArgs
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

    private handleMergeCells(
        workbook: WorkbookSpec,
        input: ArtifactToolArgs,
        context?: ArtifactToolExecutionContext
    ): ArtifactToolResult {
        const sheet = this.resolveSheet(workbook, input.sheet);
        if (!sheet) {
            return this.errorResult(`Worksheet '${String(input.sheet ?? '')}' not found.`);
        }
        const range = typeof input.range === 'string' ? input.range.trim().toUpperCase() : '';
        const parsed = range ? ParseRangeAddress(range) : null;
        if (!parsed) {
            return this.errorResult(`Invalid range '${String(input.range ?? '')}'. Expected A1 notation (e.g. "A1:C1").`);
        }
        const editCtx = this.extractCellEditContext(context);
        const protErr = checkBoundsProtection(sheet, parsed, editCtx, `merge cells '${range}'`);
        if (protErr) {
            return this.errorResult(protErr);
        }
        try {
            const mergedRange = SpreadsheetEngine.Instance.MergeCells(workbook, sheet.SheetID, range, editCtx);
            return this.buildMutationSuccess(workbook, {
                sheetId: sheet.SheetID,
                mergedRange,
                mergeRanges: sheet.MergeRanges ?? []
            });
        } catch (err) {
            return this.errorResult(err instanceof Error ? err.message : String(err));
        }
    }

    private handleUnmergeCells(
        workbook: WorkbookSpec,
        input: ArtifactToolArgs,
        context?: ArtifactToolExecutionContext
    ): ArtifactToolResult {
        const sheet = this.resolveSheet(workbook, input.sheet);
        if (!sheet) {
            return this.errorResult(`Worksheet '${String(input.sheet ?? '')}' not found.`);
        }
        const range = typeof input.range === 'string' ? input.range.trim().toUpperCase() : '';
        const parsed = range ? ParseRangeAddress(range) : null;
        if (!parsed) {
            return this.errorResult(`Invalid range '${String(input.range ?? '')}'.`);
        }
        const editCtx = this.extractCellEditContext(context);
        const protErr = checkBoundsProtection(sheet, parsed, editCtx, `unmerge cells '${range}'`);
        if (protErr) {
            return this.errorResult(protErr);
        }
        try {
            const unmergedCount = SpreadsheetEngine.Instance.UnmergeCells(workbook, sheet.SheetID, range, editCtx);
            return this.buildMutationSuccess(workbook, {
                sheetId: sheet.SheetID,
                unmergedCount,
                mergeRanges: sheet.MergeRanges ?? []
            });
        } catch (err) {
            return this.errorResult(err instanceof Error ? err.message : String(err));
        }
    }

    private handleUpsertConditionalFormat(
        workbook: WorkbookSpec,
        input: ArtifactToolArgs,
        context?: ArtifactToolExecutionContext
    ): ArtifactToolResult {
        const sheet = this.resolveSheet(workbook, input.sheet);
        if (!sheet) {
            return this.errorResult(`Worksheet '${String(input.sheet ?? '')}' not found.`);
        }
        const range = typeof input.range === 'string' ? input.range.trim().toUpperCase() : '';
        const parsed = range ? ParseRangeAddress(range) : null;
        if (!parsed) {
            return this.errorResult(`Invalid range '${String(input.range ?? '')}'.`);
        }
        const editCtx = this.extractCellEditContext(context);
        const protErr = checkBoundsProtection(sheet, parsed, editCtx, `upsert conditional format on '${range}'`);
        if (protErr) {
            return this.errorResult(protErr);
        }
        const operator = String(input.operator ?? '');
        if (
            operator !== 'gt' &&
            operator !== 'lt' &&
            operator !== 'eq' &&
            operator !== 'between' &&
            operator !== 'contains'
        ) {
            return this.errorResult(`Invalid operator '${operator}'.`);
        }
        const highlightTone = String(input.highlightTone ?? '');
        if (
            highlightTone !== 'success' &&
            highlightTone !== 'warning' &&
            highlightTone !== 'danger' &&
            highlightTone !== 'info'
        ) {
            return this.errorResult(`Invalid highlightTone '${highlightTone}'.`);
        }
        const rawVal1 = input.value1;
        if (typeof rawVal1 !== 'string' && typeof rawVal1 !== 'number') {
            return this.errorResult('Parameter "value1" must be a string or number.');
        }
        const rule: SpreadsheetConditionalFormatRuleSpec = {
            RuleID:
                typeof input.ruleId === 'string' && input.ruleId.trim()
                    ? input.ruleId.trim()
                    : `cf-${randomUUID().slice(0, 8)}`,
            Range: range,
            Operator: operator,
            Value1: rawVal1,
            Value2: typeof input.value2 === 'number' && Number.isFinite(input.value2) ? input.value2 : undefined,
            HighlightTone: highlightTone
        };
        const saved = SpreadsheetEngine.Instance.AddConditionalFormat(workbook, sheet.SheetID, rule);
        return this.buildMutationSuccess(workbook, {
            sheetId: sheet.SheetID,
            rule: saved,
            conditionalFormatCount: sheet.ConditionalFormats.length
        });
    }

    private handleDeleteConditionalFormat(
        workbook: WorkbookSpec,
        input: ArtifactToolArgs,
        context?: ArtifactToolExecutionContext
    ): ArtifactToolResult {
        const sheet = this.resolveSheet(workbook, input.sheet);
        if (!sheet) {
            return this.errorResult(`Worksheet '${String(input.sheet ?? '')}' not found.`);
        }
        const ruleId = typeof input.ruleId === 'string' ? input.ruleId.trim() : '';
        if (!ruleId) {
            return this.errorResult('Parameter "ruleId" is required.');
        }
        const existing = sheet.ConditionalFormats.find((r) => r.RuleID === ruleId);
        if (!existing) {
            return this.errorResult(`Conditional format rule '${ruleId}' was not found on sheet '${sheet.Name}'.`);
        }
        const parsed = ParseRangeAddress(existing.Range);
        if (parsed) {
            const protErr = checkBoundsProtection(
                sheet,
                parsed,
                this.extractCellEditContext(context),
                `delete conditional format '${ruleId}'`
            );
            if (protErr) {
                return this.errorResult(protErr);
            }
        }
        SpreadsheetEngine.Instance.RemoveConditionalFormat(workbook, sheet.SheetID, ruleId);
        return this.buildMutationSuccess(workbook, {
            sheetId: sheet.SheetID,
            deletedRuleId: ruleId,
            conditionalFormatCount: sheet.ConditionalFormats.length
        });
    }

    private handleUpsertValidationRule(
        workbook: WorkbookSpec,
        input: ArtifactToolArgs,
        context?: ArtifactToolExecutionContext
    ): ArtifactToolResult {
        const sheet = this.resolveSheet(workbook, input.sheet);
        if (!sheet) {
            return this.errorResult(`Worksheet '${String(input.sheet ?? '')}' not found.`);
        }
        const range = typeof input.range === 'string' ? input.range.trim().toUpperCase() : '';
        const parsed = range ? ParseRangeAddress(range) : null;
        if (!parsed) {
            return this.errorResult(`Invalid range '${String(input.range ?? '')}'.`);
        }
        const editCtx = this.extractCellEditContext(context);
        const protErr = checkBoundsProtection(sheet, parsed, editCtx, `upsert validation rule on '${range}'`);
        if (protErr) {
            return this.errorResult(protErr);
        }
        const ruleType = String(input.ruleType ?? '');
        if (ruleType !== 'list' && ruleType !== 'numberRange' && ruleType !== 'notEmpty') {
            return this.errorResult(`Invalid ruleType '${ruleType}'.`);
        }
        const rule: SpreadsheetValidationRuleSpec = {
            RuleID:
                typeof input.ruleId === 'string' && input.ruleId.trim()
                    ? input.ruleId.trim()
                    : `val-${randomUUID().slice(0, 8)}`,
            Range: range,
            RuleType: ruleType,
            AllowedValues: Array.isArray(input.allowedValues)
                ? input.allowedValues.filter((v): v is string => typeof v === 'string')
                : undefined,
            MinValue: typeof input.minValue === 'number' && Number.isFinite(input.minValue) ? input.minValue : undefined,
            MaxValue: typeof input.maxValue === 'number' && Number.isFinite(input.maxValue) ? input.maxValue : undefined,
            ErrorMessage: typeof input.errorMessage === 'string' ? input.errorMessage : undefined
        };
        const saved = SpreadsheetEngine.Instance.AddValidationRule(workbook, sheet.SheetID, rule);
        return this.buildMutationSuccess(workbook, {
            sheetId: sheet.SheetID,
            rule: saved,
            validationRuleCount: sheet.ValidationRules.length
        });
    }

    private handleDeleteValidationRule(
        workbook: WorkbookSpec,
        input: ArtifactToolArgs,
        context?: ArtifactToolExecutionContext
    ): ArtifactToolResult {
        const sheet = this.resolveSheet(workbook, input.sheet);
        if (!sheet) {
            return this.errorResult(`Worksheet '${String(input.sheet ?? '')}' not found.`);
        }
        const ruleId = typeof input.ruleId === 'string' ? input.ruleId.trim() : '';
        if (!ruleId) {
            return this.errorResult('Parameter "ruleId" is required.');
        }
        const existing = sheet.ValidationRules.find((r) => r.RuleID === ruleId);
        if (!existing) {
            return this.errorResult(`Validation rule '${ruleId}' was not found on sheet '${sheet.Name}'.`);
        }
        const parsed = ParseRangeAddress(existing.Range);
        if (parsed) {
            const protErr = checkBoundsProtection(
                sheet,
                parsed,
                this.extractCellEditContext(context),
                `delete validation rule '${ruleId}'`
            );
            if (protErr) {
                return this.errorResult(protErr);
            }
        }
        SpreadsheetEngine.Instance.RemoveValidationRule(workbook, sheet.SheetID, ruleId);
        return this.buildMutationSuccess(workbook, {
            sheetId: sheet.SheetID,
            deletedRuleId: ruleId,
            validationRuleCount: sheet.ValidationRules.length
        });
    }

    private handleUpsertNamedRange(
        workbook: WorkbookSpec,
        input: ArtifactToolArgs,
        context?: ArtifactToolExecutionContext
    ): ArtifactToolResult {
        const sheet = this.resolveSheet(workbook, input.sheet);
        if (!sheet) {
            return this.errorResult(`Worksheet '${String(input.sheet ?? '')}' not found.`);
        }
        const name = typeof input.name === 'string' ? input.name.trim() : '';
        if (!name || !/^[A-Za-z_][A-Za-z0-9_.]*$/.test(name)) {
            return this.errorResult(`Invalid named range identifier '${name}'.`);
        }
        const range = typeof input.range === 'string' ? input.range.trim().toUpperCase() : '';
        const parsed = range ? ParseRangeAddress(range) : null;
        if (!parsed) {
            return this.errorResult(`Invalid range '${String(input.range ?? '')}'.`);
        }
        const protErr = checkBoundsProtection(
            sheet,
            parsed,
            this.extractCellEditContext(context),
            `upsert named range '${name}' at '${range}'`
        );
        if (protErr) {
            return this.errorResult(protErr);
        }
        const spec: SpreadsheetNamedRangeSpec = {
            Name: name,
            SheetID: sheet.SheetID,
            Range: range,
            Description: typeof input.description === 'string' ? input.description : undefined
        };
        const saved = SpreadsheetEngine.Instance.SetNamedRange(workbook, spec);
        return this.buildMutationSuccess(workbook, {
            namedRange: saved,
            namedRangeCount: workbook.NamedRanges.length
        });
    }

    private handleDeleteNamedRange(
        workbook: WorkbookSpec,
        input: ArtifactToolArgs,
        context?: ArtifactToolExecutionContext
    ): ArtifactToolResult {
        const name = typeof input.name === 'string' ? input.name.trim() : '';
        if (!name) {
            return this.errorResult('Parameter "name" is required.');
        }
        const existing = workbook.NamedRanges.find((n) => n.Name.toLowerCase() === name.toLowerCase());
        if (!existing) {
            return this.errorResult(`Named range '${name}' was not found.`);
        }
        const targetSheet = workbook.Worksheets.find((w) => w.SheetID === existing.SheetID);
        const parsed = ParseRangeAddress(existing.Range);
        if (targetSheet && parsed) {
            const protErr = checkBoundsProtection(
                targetSheet,
                parsed,
                this.extractCellEditContext(context),
                `delete named range '${name}'`
            );
            if (protErr) {
                return this.errorResult(protErr);
            }
        }
        SpreadsheetEngine.Instance.RemoveNamedRange(workbook, existing.Name);
        return this.buildMutationSuccess(workbook, {
            deletedName: existing.Name,
            namedRangeCount: workbook.NamedRanges.length
        });
    }

    private handleSetLock(
        workbook: WorkbookSpec,
        input: ArtifactToolArgs,
        context?: ArtifactToolExecutionContext
    ): ArtifactToolResult {
        const sheet = this.resolveSheet(workbook, input.sheet);
        if (!sheet) {
            return this.errorResult(`Worksheet '${String(input.sheet ?? '')}' not found.`);
        }
        const range = typeof input.range === 'string' ? input.range.trim().toUpperCase() : '';
        if (!range || !ParseRangeAddress(range)) {
            return this.errorResult(`Invalid range '${String(input.range ?? '')}' for set_lock.`);
        }
        const editCtx = this.extractCellEditContext(context);
        const actorUserId = editCtx.UserID ?? editCtx.OwnerUserID ?? 'system';
        const rangeId =
            typeof input.rangeId === 'string' && input.rangeId.trim()
                ? input.rangeId.trim()
                : `prot-${randomUUID().slice(0, 8)}`;
        try {
            const protectedRange = SpreadsheetEngine.Instance.AddProtectedRange(
                workbook,
                sheet.SheetID,
                {
                    RangeID: rangeId,
                    Range: range,
                    LockedByUserID: actorUserId,
                    Description: typeof input.description === 'string' ? input.description : undefined,
                    AllowEditors: input.allowEditors === true
                },
                editCtx
            );
            return this.buildMutationSuccess(workbook, {
                sheetId: sheet.SheetID,
                protectedRange,
                protectedRangeCount: sheet.ProtectedRanges?.length ?? 0
            });
        } catch (err) {
            return this.errorResult(err instanceof Error ? err.message : String(err));
        }
    }

    private handleReleaseLock(
        workbook: WorkbookSpec,
        input: ArtifactToolArgs,
        context?: ArtifactToolExecutionContext
    ): ArtifactToolResult {
        const sheet = this.resolveSheet(workbook, input.sheet);
        if (!sheet) {
            return this.errorResult(`Worksheet '${String(input.sheet ?? '')}' not found.`);
        }
        const explicitId = typeof input.rangeId === 'string' ? input.rangeId.trim() : '';
        const rangeMatch = typeof input.range === 'string' ? input.range.trim().toUpperCase() : '';
        let targetRule = explicitId
            ? (sheet.ProtectedRanges ?? []).find((r) => r.RangeID === explicitId)
            : undefined;
        if (!targetRule && rangeMatch) {
            targetRule = (sheet.ProtectedRanges ?? []).find((r) => r.Range.toUpperCase() === rangeMatch);
        }
        if (!targetRule) {
            return this.errorResult(
                `Protected range lock '${explicitId || rangeMatch}' was not found on sheet '${sheet.Name}'.`
            );
        }
        const editCtx = this.extractCellEditContext(context);
        try {
            const removed = SpreadsheetEngine.Instance.RemoveProtectedRange(
                workbook,
                sheet.SheetID,
                targetRule.RangeID,
                editCtx
            );
            if (!removed) {
                return this.errorResult(`Protected range lock '${targetRule.RangeID}' was not removed.`);
            }
            return this.buildMutationSuccess(workbook, {
                sheetId: sheet.SheetID,
                unlockedRangeId: targetRule.RangeID,
                protectedRangeCount: sheet.ProtectedRanges?.length ?? 0
            });
        } catch (err) {
            return this.errorResult(err instanceof Error ? err.message : String(err));
        }
    }

    private async handleProposeSuggestion(
        workbook: WorkbookSpec,
        artifactContent: string | Buffer,
        input: ArtifactToolArgs,
        context?: ArtifactToolExecutionContext
    ): Promise<ArtifactToolResult> {
        return ExecuteProposeSuggestionTool({
            domain: 'spreadsheet',
            artifactContent,
            input,
            context,
            validateTarget: (anchor) => {
                const sheet = this.resolveSheet(workbook, anchor.SheetId ?? anchor.Sheet);
                if (!sheet) {
                    return { ok: false, errorMessage: `Target sheet '${String(anchor.Sheet ?? anchor.SheetId ?? '')}' not found.` };
                }
                const targetRange = (anchor.Range ?? anchor.CellAddress ?? '').trim().toUpperCase();
                if (!targetRange || !ParseRangeAddress(targetRange)) {
                    return {
                        ok: false,
                        errorMessage: 'propose_suggestion for spreadsheets requires anchor.range (or anchor.cellAddress) in A1 notation.'
                    };
                }
                return { ok: true };
            }
        });
    }

    private async handleReviewSuggestion(
        workbook: WorkbookSpec,
        artifactContent: string | Buffer,
        input: ArtifactToolArgs,
        context?: ArtifactToolExecutionContext
    ): Promise<ArtifactToolResult> {
        return ExecuteReviewSuggestionTool({
            domain: 'spreadsheet',
            artifactContent,
            input,
            context,
            applyAcceptedSuggestion: async (suggestion) => {
                const engine = SpreadsheetEngine.Instance;
                const targetAnchor = ParseSuggestionAnchor(suggestion.Anchor, 'spreadsheet');
                const sheet = this.resolveSheet(workbook, targetAnchor.SheetId ?? targetAnchor.Sheet);
                if (!sheet) {
                    return { ok: false, errorMessage: 'Suggestion target sheet was not found.' };
                }
                const targetRange = (targetAnchor.Range ?? targetAnchor.CellAddress ?? '').trim().toUpperCase();
                const bounds = targetRange ? ParseRangeAddress(targetRange) : null;
                if (!bounds) {
                    return { ok: false, errorMessage: `Invalid suggestion anchor range '${targetRange}'.` };
                }
                const editCtx = this.extractCellEditContext(context);
                const protErr = checkBoundsProtection(sheet, bounds, editCtx, `accept suggestion at '${targetRange}'`);
                if (protErr) {
                    return { ok: false, errorMessage: protErr };
                }
                const anchorAddr = FormatCellAddress(bounds.startRow, bounds.startCol);
                const trimmedReplacement = suggestion.ProposedReplacement.trim();
                const isFormula = trimmedReplacement.startsWith('=');
                let scalarValue: SpreadsheetCellValue = suggestion.ProposedReplacement;
                if (!isFormula) {
                    if (trimmedReplacement === 'true') {
                        scalarValue = true;
                    } else if (trimmedReplacement === 'false') {
                        scalarValue = false;
                    } else if (trimmedReplacement !== '' && Number.isFinite(Number(trimmedReplacement))) {
                        scalarValue = Number(trimmedReplacement);
                    }
                }
                engine.SetCell(
                    workbook,
                    sheet.SheetID,
                    anchorAddr,
                    isFormula ? { Formula: trimmedReplacement } : { Value: scalarValue },
                    false,
                    editCtx
                );
                const mutation = this.buildMutationSuccess(workbook, {
                    sheetId: sheet.SheetID,
                    appliedCell: anchorAddr
                });
                const payload = mutation.data as {
                    updatedContent?: string;
                    revisionHash?: string;
                    xlsxBase64?: string;
                };
                return {
                    ok: true,
                    updatedContent: payload.updatedContent ?? '',
                    revisionHash: payload.revisionHash ?? '',
                    xlsxBase64: payload.xlsxBase64,
                    extra: {
                        sheetId: sheet.SheetID,
                        appliedRange: targetRange
                    }
                };
            }
        });
    }

    private successResult(data: ArtifactToolResult['data']): ArtifactToolResult {
        return { success: true, data };
    }

    private errorResult(errorMessage: string): ArtifactToolResult {
        return { success: false, data: null, errorMessage };
    }
}
