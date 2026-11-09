import {
    EntityInfo,
    IMetadataProvider,
    IRunQueryProvider,
    Metadata,
    ProjectEntityValueRowsForUser,
    QueryInfo,
    RunQuery,
    RunView,
    StripServerOnlyRunQueryParams,
    UserInfo
} from '@memberjunction/core';
import { BaseSingleton, EscapeSQLString, UUIDsEqual } from '@memberjunction/global';
import {
    DocumentBlockColumn,
    DocumentBlockExecutionResult,
    DocumentBlockMode,
    DocumentBlockSpec,
    DocumentLiveBlockEngine,
    FrozenBlockSnapshot
} from './DocumentLiveBlockEngine';

/**
 * Supported value display formats for MJ Sheets cells (`§ 6.3`).
 */
export type SpreadsheetCellFormatType =
    | 'general'
    | 'number'
    | 'currency'
    | 'percent'
    | 'integer'
    | 'date'
    | 'datetime'
    | 'text';

/**
 * Cell formatting and visual style properties.
 */
export interface SpreadsheetCellStyleSpec {
    /** Bold font weight. */
    Bold?: boolean;
    /** Italic font style. */
    Italic?: boolean;
    /** Semantic or CSS color token for text. */
    TextColor?: string;
    /** Semantic or CSS color token for background fill. */
    BackgroundColor?: string;
    /** Horizontal text alignment. */
    HorizontalAlign?: 'left' | 'center' | 'right';
    /** High-level format category. */
    FormatType?: SpreadsheetCellFormatType;
    /** Excel-compatible `numFmt` pattern (e.g. `'$#,##0.00'`, `'0.0%'`, `'#,##0'`, `'yyyy-mm-dd'`). */
    NumberFormatPattern?: string;
}

/**
 * Primitive scalar value stored or computed in a spreadsheet cell.
 */
export type SpreadsheetCellValue = string | number | boolean | null;

/**
 * Specification for a single populated cell in a worksheet (`§ 6.2`).
 *
 * Formulas are stored both in human-readable A1 notation (`Formula`) and against
 * stable row/column IDs (`FormulaStable`) so concurrent row/column insertions
 * and formula edits over Yjs never corrupt cell references (`Accept #1`).
 */
export interface SpreadsheetCellSpec {
    /** Stable row identifier (`SpreadsheetRowSpec.RowID`). */
    RowID: string;
    /** Stable column identifier (`SpreadsheetColumnSpec.ColumnID`). */
    ColumnID: string;
    /** Current A1 coordinate (e.g. `'B2'`). */
    Address: string;
    /** Raw scalar literal when not a formula cell. */
    RawValue: SpreadsheetCellValue;
    /** Display A1 formula starting with `'='` (e.g. `'=SUM(B2:B9)'`). */
    Formula?: string | null;
    /**
     * Stable-ID formula representation (`@CELL(rowId,colId)` / `@RANGE(r1,c1,r2,c2)`)
     * used to reconstruct `Formula` after row or column insertions/deletions (`§ 6.2`, `Accept #1`).
     */
    FormulaStable?: string | null;
    /** Latest evaluated value (or error code such as `'#DIV/0!'`, `'#REF!'`, `'#MJ_ACCESS_DENIED!'`). */
    ComputedValue?: SpreadsheetCellValue;
    /** Formatted string representation rendered in the grid. */
    DisplayValue?: string;
    /** Optional style & number format metadata. */
    Style?: SpreadsheetCellStyleSpec;
    /** Optional data validation error message when the cell violates a worksheet validation rule. */
    ValidationError?: string | null;
    /** True when an `=MJ.QUERY` or `=MJ.VIEW` formula was refused due to viewer RLS/entity/query permissions. */
    AccessDenied?: boolean;
    /** Detailed error message when evaluation or viewer permission check fails. */
    ErrorMessage?: string | null;
    /** Anchor cell coordinate (`'B2'`) when this cell was populated by a multi-cell `=MJ.*` spill. */
    SpilledFrom?: string | null;
    /** Optional plain-text cell note. */
    Note?: string | null;
}

/**
 * Stable row descriptor (`§ 6.2`).
 */
export interface SpreadsheetRowSpec {
    /** Immutable unique ID for this row within the worksheet. */
    RowID: string;
    /** 1-based row number (`1`, `2`, ...). */
    Index: number;
    /** Optional row height in pixels. */
    Height?: number;
    /** True when hidden by user or active filter. */
    Hidden?: boolean;
}

/**
 * Stable column descriptor (`§ 6.2`).
 */
export interface SpreadsheetColumnSpec {
    /** Immutable unique ID for this column within the worksheet. */
    ColumnID: string;
    /** 1-based column number (`1 = A`, `2 = B`, ...). */
    Index: number;
    /** Column letter code (`'A'`, `'B'`, ..., `'AA'`). */
    Letter: string;
    /** Optional custom column label. */
    Header?: string;
    /** Optional width in characters/pixels (Excel column width units, default 14). */
    Width?: number;
    /** True when hidden. */
    Hidden?: boolean;
}

/**
 * Active sort specification on a worksheet.
 */
export interface SpreadsheetSortSpec {
    /** Column letter to sort by (e.g. `'B'`). */
    ColumnLetter: string;
    /** Sort direction. */
    Direction: 'asc' | 'desc';
    /** Number of header rows at the top of the sheet excluded from sorting (default 1). */
    HeaderRows?: number;
}

/**
 * Active filter criterion on a worksheet column.
 */
export interface SpreadsheetFilterSpec {
    /** Column letter to filter on (e.g. `'A'`). */
    ColumnLetter: string;
    /** Filter operator. */
    Operator: 'equals' | 'contains' | 'gt' | 'lt' | 'notEmpty';
    /** Filter comparison value. */
    Value: string;
    /** Number of header rows at top of sheet always kept visible (default 1). */
    HeaderRows?: number;
}

/**
 * Data validation rule applied to a cell range.
 */
export interface SpreadsheetValidationRuleSpec {
    /** Unique rule ID. */
    RuleID: string;
    /** Target A1 range (e.g. `'C2:C50'`). */
    Range: string;
    /** Validation rule type. */
    RuleType: 'list' | 'numberRange' | 'notEmpty';
    /** Allowed values when `RuleType === 'list'`. */
    AllowedValues?: string[];
    /** Minimum numeric value when `RuleType === 'numberRange'`. */
    MinValue?: number;
    /** Maximum numeric value when `RuleType === 'numberRange'`. */
    MaxValue?: number;
    /** Custom error message shown when violated. */
    ErrorMessage?: string;
}

/**
 * Conditional formatting rule applied to a cell range.
 */
export interface SpreadsheetConditionalFormatRuleSpec {
    /** Unique rule ID. */
    RuleID: string;
    /** Target A1 range (e.g. `'D2:D50'`). */
    Range: string;
    /** Comparison operator. */
    Operator: 'gt' | 'lt' | 'eq' | 'between' | 'contains';
    /** Primary threshold value. */
    Value1: string | number;
    /** Upper bound when `Operator === 'between'`. */
    Value2?: number;
    /** Semantic highlight tone mapped to `--mj-status-*` tokens. */
    HighlightTone: 'success' | 'warning' | 'danger' | 'info';
}

/**
 * Calculated formula column attached to a live data table (`§ 6.3`).
 * When the bound view/query refreshes and expands/contracts rows, each calculated column's
 * `FormulaTemplate` (using `{ROW}` for the 1-based worksheet row number) is automatically
 * filled down for every data row.
 */
export interface SpreadsheetCalculatedColumnSpec {
    /** Column heading written in the table's header row. */
    Header: string;
    /** Formula template where `{ROW}` is replaced with each data row's 1-based row number (e.g. `'=B{ROW}*C{ROW}'`). */
    FormulaTemplate: string;
    /** Optional format type applied to the calculated cells. */
    FormatType?: SpreadsheetCellFormatType;
    /** Optional Excel number format pattern (e.g. `'$#,##0.00'`). */
    NumberFormatPattern?: string;
}

/**
 * Range source bound to an MJ `EntityView` or `SavedQuery` (`§ 6.3`, `D10`, `Accept #2`).
 */
export interface SpreadsheetLiveTableSpec {
    /** Unique identifier for this live table binding. */
    TableID: string;
    /** Display title for the bound table. */
    Title: string;
    /** Source kind (`'EntityView'` or `'SavedQuery'`). */
    SourceType: 'EntityView' | 'SavedQuery';
    /** Target MJ entity name when `SourceType === 'EntityView'`. */
    EntityName?: string;
    /** Optional saved `MJ: User Views` ID. */
    ViewID?: string;
    /** Optional saved `MJ: User Views` name. */
    ViewName?: string;
    /** Optional structured filter when `SourceType === 'EntityView'`. */
    ExtraFilter?: string;
    /** Optional explicit field list. */
    Fields?: string[];
    /** Target `MJ: Queries` ID when `SourceType === 'SavedQuery'`. */
    QueryID?: string;
    /** Target `MJ: Queries` name when `SourceType === 'SavedQuery'`. */
    QueryName?: string;
    /** Caller-settable query parameters (`IsServerSet` parameters are stripped automatically). */
    QueryParameters?: Record<string, unknown>;
    /** Maximum rows to fetch (default 100). */
    MaxRows?: number;
    /** Top-left A1 cell where headers (and rows below) are written (default `'A1'`). */
    AnchorCell: string;
    /** Whether to write a header row at `AnchorCell` (default `true`). */
    IncludeHeaders?: boolean;
    /** `'Live'` (viewer-scoped refresh) or `'Frozen'` (static snapshot per `O5`). */
    Mode: DocumentBlockMode;
    /** Captured snapshot when `Mode === 'Frozen'`. */
    FrozenSnapshot?: FrozenBlockSnapshot | null;
    /** Calculated formula columns appended to the right of the bound source columns. */
    CalculatedColumns?: SpreadsheetCalculatedColumnSpec[];
    /** ISO timestamp of last live execution. */
    LastRefreshedAt?: string | null;
    /** Number of data rows written on the last refresh. */
    LastRowCount?: number;
    /** True when the current viewer was denied access to the underlying entity/view/query. */
    AccessDenied?: boolean;
    /** Error or access-denied message from the last execution. */
    LastError?: string | null;
}

/**
 * Supported chart visualization types for MJ Sheets range charts (`§ 6.3`).
 */
export type SpreadsheetChartType = 'bar' | 'line' | 'pie' | 'area';

/**
 * Chart specification bound to a cell range on a worksheet (`§ 6.3`, `Accept #5`).
 */
export interface SpreadsheetChartSpec {
    /** Unique chart ID (`'chart-1'`, etc.). */
    ChartID: string;
    /** Chart title. */
    Title: string;
    /** Chart visualization type. */
    ChartType: SpreadsheetChartType;
    /** Worksheet ID owning the source range. */
    SheetID: string;
    /** A1 range feeding the chart (e.g. `'A1:C6'`). First column provides category labels; subsequent numeric columns become series. */
    SourceRange: string;
    /** Anchor cell where the floating chart card sits on the worksheet (e.g. `'E2'`). */
    PositionCell: string;
    /** Optional width in pixels. */
    WidthPx?: number;
    /** Optional height in pixels. */
    HeightPx?: number;
    /** Whether to display the series legend (default `true`). */
    ShowLegend?: boolean;
}

/**
 * Evaluated chart dataset extracted from a worksheet range (`Accept #5`).
 */
export interface SpreadsheetChartDataset {
    ChartID: string;
    Title: string;
    ChartType: SpreadsheetChartType;
    SheetID: string;
    SourceRange: string;
    Categories: string[];
    Series: Array<{ Name: string; Values: number[] }>;
    Columns: DocumentBlockColumn[];
    Rows: Array<Record<string, unknown>>;
    RevisionHash: string;
}

/**
 * Embedded OLE `Artifact` (such as an interactive `Whiteboard`) anchored on a worksheet (`§ 3.4.1`).
 */
export interface SpreadsheetEmbeddedArtifactSpec {
    /** Unique embed ID within the worksheet. */
    EmbedID: string;
    /** Display title. */
    Title: string;
    /** Target `MJ: Artifacts` ID. */
    ArtifactID: string;
    /** Optional pinned `MJ: Artifact Versions` ID. */
    ArtifactVersionID?: string | null;
    /** Target artifact type name (e.g. `'Whiteboard'`). */
    ArtifactTypeName: string;
    /** Viewer plugin driver class (e.g. `'WhiteboardArtifactViewerPlugin'`). */
    DriverClass?: string;
    /** Anchor cell coordinate on the worksheet (e.g. `'F2'`). */
    AnchorCell: string;
    /** Width in pixels. */
    WidthPx: number;
    /** Height in pixels. */
    HeightPx: number;
    /** Whether inline editing is enabled. */
    AllowInlineEdit: boolean;
    /** Latest inline JSON payload (e.g. serialized Whiteboard state). */
    InlineContentJSON?: string | null;
}

/**
 * Workbook-level named range (`§ 6.3`).
 */
export interface SpreadsheetNamedRangeSpec {
    /** Identifier usable inside formulas (e.g. `'TaxRate'` or `'Q1Revenue'`). */
    Name: string;
    /** Worksheet ID containing the range. */
    SheetID: string;
    /** A1 cell or range (e.g. `'B2'` or `'B2:B10'`). */
    Range: string;
    /** Optional description. */
    Description?: string;
}

/**
 * Single worksheet tab in an MJ Sheets workbook (`§ 6.2`).
 */
export interface WorksheetSpec {
    /** Stable unique ID for this worksheet tab. */
    SheetID: string;
    /** Tab display name (up to 31 chars for Excel compatibility). */
    Name: string;
    /** Ordered list of rows with stable `RowID`s. */
    Rows: SpreadsheetRowSpec[];
    /** Ordered list of columns with stable `ColumnID`s. */
    Columns: SpreadsheetColumnSpec[];
    /** Map of A1 coordinate (`'A1'`, `'B2'`) to cell specification. */
    Cells: Record<string, SpreadsheetCellSpec>;
    /** Number of frozen top rows. */
    FrozenRows: number;
    /** Number of frozen left columns. */
    FrozenColumns: number;
    /** Optional active sort configuration. */
    SortSpec?: SpreadsheetSortSpec | null;
    /** Active column filter criteria. */
    FilterSpecs: SpreadsheetFilterSpec[];
    /** Data validation rules. */
    ValidationRules: SpreadsheetValidationRuleSpec[];
    /** Conditional formatting rules. */
    ConditionalFormats: SpreadsheetConditionalFormatRuleSpec[];
    /** Range sources bound to MJ Views or Queries. */
    LiveTables: SpreadsheetLiveTableSpec[];
    /** Embedded range charts. */
    Charts: SpreadsheetChartSpec[];
    /** Embedded OLE Artifact / Whiteboard objects. */
    EmbeddedArtifacts: SpreadsheetEmbeddedArtifactSpec[];
}

/**
 * Complete multi-tab MJ Sheets workbook specification (`§ 6.2`).
 */
export interface WorkbookSpec {
    /** Stable workbook ID. */
    WorkbookID: string;
    /** Workbook title. */
    Title: string;
    /** Currently active worksheet ID. */
    ActiveSheetID: string;
    /** Ordered worksheets. */
    Worksheets: WorksheetSpec[];
    /** Workbook-level named ranges. */
    NamedRanges: SpreadsheetNamedRangeSpec[];
    /** ISO creation timestamp. */
    CreatedAt: string;
    /** ISO last-modified timestamp. */
    UpdatedAt: string;
}

/**
 * Parsed representation of an `=MJ.QUERY(...)` or `=MJ.VIEW(...)` custom function call (`§ 6.3`, `§ 7.2`).
 */
export interface ParsedMjCustomFunctionCall {
    /** Function kind (`'QUERY'` or `'VIEW'`). */
    Kind: 'QUERY' | 'VIEW';
    /** Query name/ID (for `QUERY`) or Entity name (for `VIEW`). */
    PrimaryTarget: string;
    /** View name/ID when `Kind === 'VIEW'`. */
    SecondaryTarget?: string;
    /** Positional or key=value arguments passed to the function. */
    Arguments: SpreadsheetCellValue[];
    /** Structured key-value parameters extracted from arguments. */
    NamedParameters: Record<string, SpreadsheetCellValue>;
}

/**
 * Options for evaluating `=MJ.QUERY` and `=MJ.VIEW` custom functions and live tables.
 */
export interface SpreadsheetMjEvaluationOptions {
    /** Override cache TTL in milliseconds (defaults to 60,000 ms). */
    CacheTtlMs?: number;
    /** Maximum concurrent requests in flight (defaults to 5). */
    MaxConcurrency?: number;
    /** Bypass the viewer result cache when `true`. */
    BypassCache?: boolean;
}

interface ViewerFunctionCacheEntry {
    ExpiresAt: number;
    Result: DocumentBlockExecutionResult;
}

const DEFAULT_ROW_COUNT = 25;
const DEFAULT_COLUMN_COUNT = 12;
const DEFAULT_COLUMN_WIDTH = 14;
const DEFAULT_ROW_HEIGHT = 24;
const DEFAULT_CACHE_TTL_MS = 60_000;
const DEFAULT_MAX_CONCURRENCY = 5;
const HIDDEN_META_SHEET_NAME = '_mj_sheets_meta';
const META_CHUNK_SIZE = 28_000;

// ---------------------------------------------------------------------------
// A1 Coordinate & Column Letter Helpers
// ---------------------------------------------------------------------------

/**
 * Converts a 1-based column index (`1 = A`, `26 = Z`, `27 = AA`) to its Excel column letter.
 */
export function ColumnIndexToLetter(index: number): string {
    let n = Math.max(1, Math.floor(index));
    let letters = '';
    while (n > 0) {
        const rem = (n - 1) % 26;
        letters = String.fromCharCode(65 + rem) + letters;
        n = Math.floor((n - 1) / 26);
    }
    return letters;
}

/**
 * Converts an Excel column letter (`'A'`, `'Z'`, `'AA'`) to a 1-based column index.
 */
export function ColumnLetterToIndex(letter: string): number {
    const clean = letter.replace(/\$/g, '').trim().toUpperCase();
    let result = 0;
    for (let i = 0; i < clean.length; i++) {
        const code = clean.charCodeAt(i);
        if (code < 65 || code > 90) {
            return 1;
        }
        result = result * 26 + (code - 64);
    }
    return Math.max(1, result);
}

/**
 * Parses an A1 cell coordinate (`'B2'`, `'$B$2'`) into 1-based `{ row, col, absRow, absCol }`.
 */
export function ParseCellAddress(address: string): {
    row: number;
    col: number;
    colLetter: string;
    absRow: boolean;
    absCol: boolean;
} | null {
    const match = /^(\$?)([A-Za-z]{1,3})(\$?)([1-9][0-9]*)$/.exec(address.trim());
    if (!match) {
        return null;
    }
    const colLetter = match[2].toUpperCase();
    return {
        col: ColumnLetterToIndex(colLetter),
        row: parseInt(match[4], 10),
        colLetter,
        absCol: match[1] === '$',
        absRow: match[3] === '$'
    };
}

/**
 * Formats a 1-based `(row, col)` coordinate as an A1 cell address (`'B2'`).
 */
export function FormatCellAddress(row: number, col: number, absRow = false, absCol = false): string {
    const colLetter = ColumnIndexToLetter(col);
    return `${absCol ? '$' : ''}${colLetter}${absRow ? '$' : ''}${Math.max(1, Math.floor(row))}`;
}

/**
 * Expands an A1 range string (`'A1:C3'` or single cell `'B2'`) into `{ startRow, endRow, startCol, endCol }`.
 */
export function ParseRangeAddress(range: string): {
    startRow: number;
    endRow: number;
    startCol: number;
    endCol: number;
} | null {
    const parts = range.trim().split(':');
    if (parts.length === 1) {
        const single = ParseCellAddress(parts[0]);
        if (!single) return null;
        return {
            startRow: single.row,
            endRow: single.row,
            startCol: single.col,
            endCol: single.col
        };
    }
    if (parts.length === 2) {
        const a = ParseCellAddress(parts[0]);
        const b = ParseCellAddress(parts[1]);
        if (!a || !b) return null;
        return {
            startRow: Math.min(a.row, b.row),
            endRow: Math.max(a.row, b.row),
            startCol: Math.min(a.col, b.col),
            endCol: Math.max(a.col, b.col)
        };
    }
    return null;
}

// ---------------------------------------------------------------------------
// SpreadsheetEngine Singleton
// ---------------------------------------------------------------------------

/**
 * Isomorphic engine for MJ Sheets (`Excel Spreadsheet` artifact type, `§ 6` & `§ 7.2`).
 *
 * Provides:
 * - Multi-tab workbook creation, normalization, and revision hashing
 * - Stable RowID / ColumnID formula storage (`CompileFormulaToStableIds` / `ResolveFormulaFromStableIds`)
 *   so concurrent row/column insertions and formula edits over Yjs preserve exact cell targets (`Accept #1`)
 * - Headless Node + browser formula evaluation covering 35+ spreadsheet functions (`Accept #3`)
 * - Viewer-scoped `=MJ.QUERY(name, ...params)` and `=MJ.VIEW(entity, view, filter)` evaluation with
 *   RLS + FLS projection, `IsServerSet` stripping, 60s viewer cache, and concurrency cap (`§ 6.3`, `§ 7.2`)
 * - Range sources (`SpreadsheetLiveTableSpec`) bound to MJ Views/Queries with calculated formula columns
 *   and explicit recorded `O5` freeze (`Accept #2`)
 * - Lossless `.xlsx` (OpenXML ZIP with `<f>` formulas and `numFmt` styles) and `.csv` import/export (`Accept #4`)
 * - Range chart dataset extraction for live Sheet-to-Slide / Sheet-to-Doc chart blocks (`Accept #5`)
 */
export class SpreadsheetEngine extends BaseSingleton<SpreadsheetEngine> {
    private viewerCache = new Map<string, ViewerFunctionCacheEntry>();

    protected constructor() {
        super();
    }

    /** Returns the process-wide singleton instance of {@link SpreadsheetEngine}. */
    public static get Instance(): SpreadsheetEngine {
        return super.getInstance<SpreadsheetEngine>();
    }

    /** Clears the viewer-scoped `=MJ.QUERY` / `=MJ.VIEW` result cache. */
    public ClearViewerFunctionCache(userId?: string): void {
        if (!userId) {
            this.viewerCache.clear();
            return;
        }
        const prefix = `${userId.toLowerCase()}::`;
        for (const key of Array.from(this.viewerCache.keys())) {
            if (key.startsWith(prefix)) {
                this.viewerCache.delete(key);
            }
        }
    }

    /**
     * Creates a new multi-tab {@link WorkbookSpec} with stable `RowID`s and `ColumnID`s.
     */
    public CreateEmptyWorkbook(
        title = 'Untitled Workbook',
        sheetNames: string[] = ['Sheet 1'],
        rowCount = DEFAULT_ROW_COUNT,
        colCount = DEFAULT_COLUMN_COUNT
    ): WorkbookSpec {
        const now = new Date().toISOString();
        const names = sheetNames.length > 0 ? sheetNames : ['Sheet 1'];
        const worksheets = names.map((name, idx) =>
            this.CreateEmptyWorksheet(`sheet-${idx + 1}`, name, rowCount, colCount)
        );
        return {
            WorkbookID: `wb-${Date.now().toString(36)}`,
            Title: title,
            ActiveSheetID: worksheets[0].SheetID,
            Worksheets: worksheets,
            NamedRanges: [],
            CreatedAt: now,
            UpdatedAt: now
        };
    }

    /**
     * Creates a single empty {@link WorksheetSpec} with initialized stable `Rows` and `Columns`.
     */
    public CreateEmptyWorksheet(
        sheetId: string,
        name: string,
        rowCount = DEFAULT_ROW_COUNT,
        colCount = DEFAULT_COLUMN_COUNT
    ): WorksheetSpec {
        const rows: SpreadsheetRowSpec[] = [];
        for (let r = 1; r <= Math.max(1, rowCount); r++) {
            rows.push({
                RowID: `${sheetId}-row-${r}`,
                Index: r,
                Height: DEFAULT_ROW_HEIGHT,
                Hidden: false
            });
        }
        const columns: SpreadsheetColumnSpec[] = [];
        for (let c = 1; c <= Math.max(1, colCount); c++) {
            const letter = ColumnIndexToLetter(c);
            columns.push({
                ColumnID: `${sheetId}-col-${letter}`,
                Index: c,
                Letter: letter,
                Width: DEFAULT_COLUMN_WIDTH,
                Hidden: false
            });
        }
        return {
            SheetID: sheetId,
            Name: name.slice(0, 31) || 'Sheet 1',
            Rows: rows,
            Columns: columns,
            Cells: {},
            FrozenRows: 1,
            FrozenColumns: 0,
            SortSpec: null,
            FilterSpecs: [],
            ValidationRules: [],
            ConditionalFormats: [],
            LiveTables: [],
            Charts: [],
            EmbeddedArtifacts: []
        };
    }

    /**
     * Parses a workbook from JSON string, `Configuration` metadata string, CSV text, or returns a default workbook.
     */
    public ParseWorkbook(content?: string | null, configuration?: string | null): WorkbookSpec {
        for (const candidate of [configuration, content]) {
            if (!candidate || typeof candidate !== 'string') continue;
            const trimmed = candidate.trim();
            if (!trimmed.startsWith('{')) continue;
            try {
                const parsed = JSON.parse(trimmed) as Partial<WorkbookSpec>;
                if (parsed && Array.isArray(parsed.Worksheets) && parsed.Worksheets.length > 0) {
                    const wb = this.NormalizeWorkbook(parsed);
                    this.EvaluateWorkbook(wb);
                    return wb;
                }
            } catch {
                // Continue to next candidate
            }
        }

        if (content && typeof content === 'string') {
            const trimmed = content.trim();
            // Data URL or base64 XLSX
            if (trimmed.startsWith('data:') || trimmed.startsWith('UEsDB')) {
                const bytes = this.decodeBase64OrDataUrl(trimmed);
                if (bytes && bytes.length > 4 && bytes[0] === 0x50 && bytes[1] === 0x4b) {
                    const imported = this.ImportFromXlsxBytes(bytes, configuration);
                    return imported;
                }
            }
            // Plain CSV fallback
            if (trimmed.length > 0 && !trimmed.startsWith('{') && !trimmed.startsWith('data:')) {
                return this.ImportFromCsv(trimmed, 'Sheet 1');
            }
        }

        return this.CreateEmptyWorkbook();
    }

    /**
     * Serializes a {@link WorkbookSpec} to canonical formatted JSON after ensuring formulas are evaluated.
     */
    public SerializeWorkbook(workbook: WorkbookSpec): string {
        workbook.UpdatedAt = new Date().toISOString();
        return JSON.stringify(workbook, null, 2);
    }

    /**
     * Computes a deterministic FNV-1a revision hash over the workbook for optimistic concurrency checks.
     */
    public ComputeRevisionHash(workbook: WorkbookSpec): string {
        const canonical = JSON.stringify({
            WorkbookID: workbook.WorkbookID,
            Title: workbook.Title,
            Worksheets: workbook.Worksheets.map((ws) => ({
                SheetID: ws.SheetID,
                Name: ws.Name,
                Rows: ws.Rows.map((r) => r.RowID),
                Columns: ws.Columns.map((c) => c.ColumnID),
                Cells: Object.keys(ws.Cells)
                    .sort()
                    .map((k) => ({
                        k,
                        r: ws.Cells[k].RawValue,
                        f: ws.Cells[k].Formula ?? null,
                        fs: ws.Cells[k].FormulaStable ?? null,
                        v: ws.Cells[k].ComputedValue ?? null
                    })),
                LiveTables: ws.LiveTables.map((t) => ({ id: t.TableID, mode: t.Mode, anchor: t.AnchorCell })),
                Charts: ws.Charts.map((c) => ({ id: c.ChartID, range: c.SourceRange, type: c.ChartType }))
            }))
        });
        let hash = 0x811c9dc5;
        for (let i = 0; i < canonical.length; i++) {
            hash ^= canonical.charCodeAt(i);
            hash = Math.imul(hash, 0x01000193) >>> 0;
        }
        return `wb-rev-${hash.toString(16).padStart(8, '0')}`;
    }

    /**
     * Ensures a partial or deserialized workbook has valid `Rows`, `Columns`, `Cells`, and stable IDs.
     */
    public NormalizeWorkbook(raw: Partial<WorkbookSpec>): WorkbookSpec {
        const now = new Date().toISOString();
        const rawSheets = Array.isArray(raw.Worksheets) && raw.Worksheets.length > 0
            ? raw.Worksheets
            : [this.CreateEmptyWorksheet('sheet-1', 'Sheet 1')];

        const worksheets: WorksheetSpec[] = rawSheets.map((ws, idx) =>
            this.NormalizeWorksheet(ws, `sheet-${idx + 1}`, `Sheet ${idx + 1}`)
        );
        const activeId = worksheets.some((w) => w.SheetID === raw.ActiveSheetID)
            ? (raw.ActiveSheetID as string)
            : worksheets[0].SheetID;

        return {
            WorkbookID: raw.WorkbookID || `wb-${Date.now().toString(36)}`,
            Title: raw.Title || 'Untitled Workbook',
            ActiveSheetID: activeId,
            Worksheets: worksheets,
            NamedRanges: Array.isArray(raw.NamedRanges) ? raw.NamedRanges : [],
            CreatedAt: raw.CreatedAt || now,
            UpdatedAt: raw.UpdatedAt || now
        };
    }

    /**
     * Normalizes a single worksheet, ensuring `Rows` and `Columns` cover all populated cell coordinates
     * and every formula has both `Formula` and `FormulaStable`.
     */
    public NormalizeWorksheet(
        raw: Partial<WorksheetSpec>,
        fallbackId = 'sheet-1',
        fallbackName = 'Sheet 1'
    ): WorksheetSpec {
        const sheetId = raw.SheetID || fallbackId;
        let maxRow = Math.max(DEFAULT_ROW_COUNT, Array.isArray(raw.Rows) ? raw.Rows.length : 0);
        let maxCol = Math.max(DEFAULT_COLUMN_COUNT, Array.isArray(raw.Columns) ? raw.Columns.length : 0);

        const rawCells = raw.Cells ?? {};
        for (const addr of Object.keys(rawCells)) {
            const parsed = ParseCellAddress(addr);
            if (parsed) {
                if (parsed.row > maxRow) maxRow = parsed.row;
                if (parsed.col > maxCol) maxCol = parsed.col;
            }
        }

        const existingRows = Array.isArray(raw.Rows) ? raw.Rows : [];
        const rows: SpreadsheetRowSpec[] = [];
        for (let r = 1; r <= maxRow; r++) {
            const existing = existingRows[r - 1];
            rows.push({
                RowID: existing?.RowID || `${sheetId}-row-${r}`,
                Index: r,
                Height: existing?.Height ?? DEFAULT_ROW_HEIGHT,
                Hidden: existing?.Hidden ?? false
            });
        }

        const existingCols = Array.isArray(raw.Columns) ? raw.Columns : [];
        const columns: SpreadsheetColumnSpec[] = [];
        for (let c = 1; c <= maxCol; c++) {
            const existing = existingCols[c - 1];
            const letter = ColumnIndexToLetter(c);
            columns.push({
                ColumnID: existing?.ColumnID || `${sheetId}-col-${letter}`,
                Index: c,
                Letter: letter,
                Header: existing?.Header,
                Width: existing?.Width ?? DEFAULT_COLUMN_WIDTH,
                Hidden: existing?.Hidden ?? false
            });
        }

        const sheet: WorksheetSpec = {
            SheetID: sheetId,
            Name: (raw.Name || fallbackName).slice(0, 31),
            Rows: rows,
            Columns: columns,
            Cells: {},
            FrozenRows: typeof raw.FrozenRows === 'number' ? raw.FrozenRows : 1,
            FrozenColumns: typeof raw.FrozenColumns === 'number' ? raw.FrozenColumns : 0,
            SortSpec: raw.SortSpec ?? null,
            FilterSpecs: Array.isArray(raw.FilterSpecs) ? raw.FilterSpecs : [],
            ValidationRules: Array.isArray(raw.ValidationRules) ? raw.ValidationRules : [],
            ConditionalFormats: Array.isArray(raw.ConditionalFormats) ? raw.ConditionalFormats : [],
            LiveTables: Array.isArray(raw.LiveTables) ? raw.LiveTables : [],
            Charts: Array.isArray(raw.Charts) ? raw.Charts : [],
            EmbeddedArtifacts: Array.isArray(raw.EmbeddedArtifacts) ? raw.EmbeddedArtifacts : []
        };

        const rowIndexById = new Map<string, number>();
        for (const r of sheet.Rows) rowIndexById.set(r.RowID, r.Index);
        const colIndexById = new Map<string, number>();
        for (const c of sheet.Columns) colIndexById.set(c.ColumnID, c.Index);

        for (const [key, cell] of Object.entries(rawCells)) {
            if (!cell) continue;
            // Determine canonical position from RowID/ColumnID if valid, else from Address/key
            let rowIdx = cell.RowID ? rowIndexById.get(cell.RowID) : undefined;
            let colIdx = cell.ColumnID ? colIndexById.get(cell.ColumnID) : undefined;
            if (!rowIdx || !colIdx) {
                const parsed = ParseCellAddress(cell.Address || key);
                if (!parsed) continue;
                rowIdx = parsed.row;
                colIdx = parsed.col;
            }
            this.ensureSheetCapacity(sheet, rowIdx, colIdx);
            const rowSpec = sheet.Rows[rowIdx - 1];
            const colSpec = sheet.Columns[colIdx - 1];
            const canonicalAddr = FormatCellAddress(rowIdx, colIdx);

            let formula = cell.Formula ?? null;
            let formulaStable = cell.FormulaStable ?? null;
            if (formulaStable) {
                formula = this.ResolveFormulaFromStableIds(sheet, formulaStable);
            } else if (formula) {
                formulaStable = this.CompileFormulaToStableIds(sheet, formula);
            }

            sheet.Cells[canonicalAddr] = {
                ...cell,
                RowID: rowSpec.RowID,
                ColumnID: colSpec.ColumnID,
                Address: canonicalAddr,
                RawValue: cell.RawValue ?? null,
                Formula: formula,
                FormulaStable: formulaStable
            };
        }

        return sheet;
    }

    // -----------------------------------------------------------------------
    // Stable Row & Column ID Formula Translation (§ 6.2 & Accept #1)
    // -----------------------------------------------------------------------

    /**
     * Translates an A1 formula (e.g. `'=SUM(B2:B9) + $C$2'`) into a stable-ID formula
     * (`'=SUM(@RANGE(sheet-1-row-2,sheet-1-col-B,sheet-1-row-9,sheet-1-col-B)) + @CELL($sheet-1-row-2,$sheet-1-col-C)'`)
     * so concurrent row/column insertions preserve exact logical references (`§ 6.2`, `Accept #1`).
     */
    public CompileFormulaToStableIds(sheet: WorksheetSpec, formula: string): string {
        if (!formula || !formula.trim().startsWith('=')) {
            return formula;
        }
        // Protect string literals first so we never rewrite A1 tokens inside quotes
        const literals: string[] = [];
        const masked = formula.replace(/"([^"\\]|\\.)*"/g, (match) => {
            literals.push(match);
            return `__STR_LIT_${literals.length - 1}__`;
        });

        // Replace A1 ranges (not preceded by '!' cross-sheet prefix)
        const withRanges = masked.replace(
            /(?<![!A-Za-z0-9_])(\$?)([A-Za-z]{1,3})(\$?)([1-9][0-9]*):(\$?)([A-Za-z]{1,3})(\$?)([1-9][0-9]*)/g,
            (_full, absC1: string, col1: string, absR1: string, row1: string, absC2: string, col2: string, absR2: string, row2: string) => {
                const r1 = parseInt(row1, 10);
                const c1 = ColumnLetterToIndex(col1);
                const r2 = parseInt(row2, 10);
                const c2 = ColumnLetterToIndex(col2);
                this.ensureSheetCapacity(sheet, Math.max(r1, r2), Math.max(c1, c2));
                const rId1 = `${absR1 ? '$' : ''}${sheet.Rows[r1 - 1].RowID}`;
                const cId1 = `${absC1 ? '$' : ''}${sheet.Columns[c1 - 1].ColumnID}`;
                const rId2 = `${absR2 ? '$' : ''}${sheet.Rows[r2 - 1].RowID}`;
                const cId2 = `${absC2 ? '$' : ''}${sheet.Columns[c2 - 1].ColumnID}`;
                return `@RANGE(${rId1},${cId1},${rId2},${cId2})`;
            }
        );

        // Replace standalone A1 cell references (not followed by '(' function call or preceded by '!' or '@')
        const withCells = withRanges.replace(
            /(?<![!@A-Za-z0-9_])(\$?)([A-Za-z]{1,3})(\$?)([1-9][0-9]*)(?![A-Za-z0-9_(\[])/g,
            (_full, absC: string, col: string, absR: string, row: string) => {
                const r = parseInt(row, 10);
                const c = ColumnLetterToIndex(col);
                this.ensureSheetCapacity(sheet, r, c);
                const rId = `${absR ? '$' : ''}${sheet.Rows[r - 1].RowID}`;
                const cId = `${absC ? '$' : ''}${sheet.Columns[c - 1].ColumnID}`;
                return `@CELL(${rId},${cId})`;
            }
        );

        return withCells.replace(/__STR_LIT_(\d+)__/g, (_m, idxStr: string) => literals[parseInt(idxStr, 10)] ?? '');
    }

    /**
     * Resolves a `FormulaStable` string back to human-readable A1 notation using the current
     * positions of each `RowID` and `ColumnID` in `sheet.Rows` and `sheet.Columns` (`§ 6.2`, `Accept #1`).
     */
    public ResolveFormulaFromStableIds(sheet: WorksheetSpec, formulaStable: string): string {
        if (!formulaStable || (!formulaStable.includes('@CELL(') && !formulaStable.includes('@RANGE('))) {
            return formulaStable;
        }
        const rowIndexById = new Map<string, number>();
        for (let i = 0; i < sheet.Rows.length; i++) {
            rowIndexById.set(sheet.Rows[i].RowID, i + 1);
        }
        const colIndexById = new Map<string, number>();
        for (let i = 0; i < sheet.Columns.length; i++) {
            colIndexById.set(sheet.Columns[i].ColumnID, i + 1);
        }

        const resolveToken = (rawRowId: string, rawColId: string): string => {
            const absR = rawRowId.startsWith('$');
            const absC = rawColId.startsWith('$');
            const rId = absR ? rawRowId.slice(1) : rawRowId;
            const cId = absC ? rawColId.slice(1) : rawColId;
            const rIdx = rowIndexById.get(rId);
            const cIdx = colIndexById.get(cId);
            if (!rIdx || !cIdx) {
                return '#REF!';
            }
            return FormatCellAddress(rIdx, cIdx, absR, absC);
        };

        const withRanges = formulaStable.replace(
            /@RANGE\(([^,]+),([^,]+),([^,]+),([^)]+)\)/g,
            (_full, r1: string, c1: string, r2: string, c2: string) => {
                const start = resolveToken(r1.trim(), c1.trim());
                const end = resolveToken(r2.trim(), c2.trim());
                if (start === '#REF!' || end === '#REF!') {
                    return '#REF!';
                }
                return `${start}:${end}`;
            }
        );

        return withRanges.replace(
            /@CELL\(([^,]+),([^)]+)\)/g,
            (_full, r: string, c: string) => resolveToken(r.trim(), c.trim())
        );
    }

    /**
     * Inserts `count` new rows at 1-based `atRowNumber` in `sheetId`, assigning fresh stable `RowID`s,
     * shifting affected cells down, and resolving all `FormulaStable` references (`§ 6.2`, `Accept #1`).
     */
    public InsertRows(
        workbook: WorkbookSpec,
        sheetId: string,
        atRowNumber: number,
        count = 1
    ): SpreadsheetRowSpec[] {
        const sheet = this.GetWorksheet(workbook, sheetId);
        if (!sheet) {
            throw new Error(`Worksheet '${sheetId}' not found.`);
        }
        const insertIdx = Math.max(0, Math.min(sheet.Rows.length, Math.floor(atRowNumber) - 1));
        const numToInsert = Math.max(1, Math.floor(count));
        const inserted: SpreadsheetRowSpec[] = [];
        const uniqueSeed = `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`;
        for (let i = 0; i < numToInsert; i++) {
            inserted.push({
                RowID: `${sheet.SheetID}-row-ins-${uniqueSeed}-${i + 1}`,
                Index: insertIdx + i + 1,
                Height: DEFAULT_ROW_HEIGHT,
                Hidden: false
            });
        }
        sheet.Rows.splice(insertIdx, 0, ...inserted);
        this.reindexSheetStructureAndFormulas(sheet);
        this.EvaluateWorkbook(workbook);
        return inserted;
    }

    /**
     * Deletes `count` rows starting at 1-based `atRowNumber` in `sheetId`, updating all cells and formulas.
     */
    public DeleteRows(workbook: WorkbookSpec, sheetId: string, atRowNumber: number, count = 1): void {
        const sheet = this.GetWorksheet(workbook, sheetId);
        if (!sheet || sheet.Rows.length <= 1) return;
        const startIdx = Math.max(0, Math.min(sheet.Rows.length - 1, Math.floor(atRowNumber) - 1));
        const maxDeletable = Math.min(Math.max(1, count), sheet.Rows.length - 1);
        const removedRows = sheet.Rows.splice(startIdx, maxDeletable);
        const removedRowIds = new Set(removedRows.map((r) => r.RowID));
        for (const [addr, cell] of Object.entries(sheet.Cells)) {
            if (removedRowIds.has(cell.RowID)) {
                delete sheet.Cells[addr];
            }
        }
        this.reindexSheetStructureAndFormulas(sheet);
        this.EvaluateWorkbook(workbook);
    }

    /**
     * Inserts `count` new columns at 1-based `atColumnNumber` in `sheetId`, assigning fresh stable `ColumnID`s,
     * shifting affected cells right, and resolving all `FormulaStable` references (`§ 6.2`, `Accept #1`).
     */
    public InsertColumns(
        workbook: WorkbookSpec,
        sheetId: string,
        atColumnNumber: number,
        count = 1
    ): SpreadsheetColumnSpec[] {
        const sheet = this.GetWorksheet(workbook, sheetId);
        if (!sheet) {
            throw new Error(`Worksheet '${sheetId}' not found.`);
        }
        const insertIdx = Math.max(0, Math.min(sheet.Columns.length, Math.floor(atColumnNumber) - 1));
        const numToInsert = Math.max(1, Math.floor(count));
        const inserted: SpreadsheetColumnSpec[] = [];
        const uniqueSeed = `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`;
        for (let i = 0; i < numToInsert; i++) {
            inserted.push({
                ColumnID: `${sheet.SheetID}-col-ins-${uniqueSeed}-${i + 1}`,
                Index: insertIdx + i + 1,
                Letter: ColumnIndexToLetter(insertIdx + i + 1),
                Width: DEFAULT_COLUMN_WIDTH,
                Hidden: false
            });
        }
        sheet.Columns.splice(insertIdx, 0, ...inserted);
        this.reindexSheetStructureAndFormulas(sheet);
        this.EvaluateWorkbook(workbook);
        return inserted;
    }

    /**
     * Deletes `count` columns starting at 1-based `atColumnNumber` in `sheetId`.
     */
    public DeleteColumns(workbook: WorkbookSpec, sheetId: string, atColumnNumber: number, count = 1): void {
        const sheet = this.GetWorksheet(workbook, sheetId);
        if (!sheet || sheet.Columns.length <= 1) return;
        const startIdx = Math.max(0, Math.min(sheet.Columns.length - 1, Math.floor(atColumnNumber) - 1));
        const maxDeletable = Math.min(Math.max(1, count), sheet.Columns.length - 1);
        const removedCols = sheet.Columns.splice(startIdx, maxDeletable);
        const removedColIds = new Set(removedCols.map((c) => c.ColumnID));
        for (const [addr, cell] of Object.entries(sheet.Cells)) {
            if (removedColIds.has(cell.ColumnID)) {
                delete sheet.Cells[addr];
            }
        }
        this.reindexSheetStructureAndFormulas(sheet);
        this.EvaluateWorkbook(workbook);
    }

    /**
     * Rebuilds 1-based row/column indices, moves cells to their current `(RowID, ColumnID)` A1 coordinates,
     * and updates every cell's `Formula` from its `FormulaStable` (`§ 6.2`, `Accept #1`).
     */
    public ReindexWorksheetAndResolveFormulas(sheet: WorksheetSpec): void {
        this.reindexSheetStructureAndFormulas(sheet);
    }

    private reindexSheetStructureAndFormulas(sheet: WorksheetSpec): void {
        const rowIndexById = new Map<string, number>();
        for (let i = 0; i < sheet.Rows.length; i++) {
            sheet.Rows[i].Index = i + 1;
            rowIndexById.set(sheet.Rows[i].RowID, i + 1);
        }
        const colIndexById = new Map<string, number>();
        for (let i = 0; i < sheet.Columns.length; i++) {
            sheet.Columns[i].Index = i + 1;
            sheet.Columns[i].Letter = ColumnIndexToLetter(i + 1);
            colIndexById.set(sheet.Columns[i].ColumnID, i + 1);
        }

        const nextCells: Record<string, SpreadsheetCellSpec> = {};
        for (const cell of Object.values(sheet.Cells)) {
            const rIdx = rowIndexById.get(cell.RowID);
            const cIdx = colIndexById.get(cell.ColumnID);
            if (!rIdx || !cIdx) continue;
            const nextAddr = FormatCellAddress(rIdx, cIdx);
            const resolvedFormula = cell.FormulaStable
                ? this.ResolveFormulaFromStableIds(sheet, cell.FormulaStable)
                : cell.Formula ?? null;
            nextCells[nextAddr] = {
                ...cell,
                Address: nextAddr,
                Formula: resolvedFormula
            };
        }
        sheet.Cells = nextCells;
    }

    // -----------------------------------------------------------------------
    // Cell Read / Write & Worksheet Management
    // -----------------------------------------------------------------------

    /**
     * Finds a worksheet by `SheetID` or case-insensitive `Name`.
     */
    public GetWorksheet(workbook: WorkbookSpec, sheetIdOrName: string): WorksheetSpec | undefined {
        const trimmed = (sheetIdOrName ?? '').trim();
        return (
            workbook.Worksheets.find((w) => w.SheetID === trimmed) ??
            workbook.Worksheets.find((w) => w.Name.toLowerCase() === trimmed.toLowerCase())
        );
    }

    /**
     * Writes a value or formula into a single cell (addressed by A1 coordinate or `{ rowId, columnId }`)
     * and recalculates the workbook (`Accept #3`).
     */
    public SetCell(
        workbook: WorkbookSpec,
        sheetIdOrName: string,
        address: string,
        input: {
            Value?: SpreadsheetCellValue;
            Formula?: string | null;
            FormulaStable?: string | null;
            Style?: Partial<SpreadsheetCellStyleSpec>;
            Note?: string | null;
        },
        recalculate = true
    ): SpreadsheetCellSpec {
        const sheet = this.GetWorksheet(workbook, sheetIdOrName);
        if (!sheet) {
            throw new Error(`Worksheet '${sheetIdOrName}' not found.`);
        }
        const parsed = ParseCellAddress(address);
        if (!parsed) {
            throw new Error(`Invalid cell address '${address}'.`);
        }
        this.ensureSheetCapacity(sheet, parsed.row, parsed.col);
        const canonicalAddr = FormatCellAddress(parsed.row, parsed.col);
        const rowSpec = sheet.Rows[parsed.row - 1];
        const colSpec = sheet.Columns[parsed.col - 1];
        const existing = sheet.Cells[canonicalAddr];

        // Determine whether input is a formula
        let formula: string | null = input.Formula !== undefined ? input.Formula : existing?.Formula ?? null;
        let rawValue: SpreadsheetCellValue = input.Value !== undefined ? input.Value : existing?.RawValue ?? null;

        if (typeof input.Value === 'string' && input.Value.trim().startsWith('=') && input.Formula === undefined) {
            formula = input.Value.trim();
            rawValue = null;
        } else if (input.Value !== undefined && input.Formula === undefined) {
            formula = null;
        }

        let formulaStable: string | null = null;
        if (input.FormulaStable) {
            formulaStable = input.FormulaStable;
            formula = this.ResolveFormulaFromStableIds(sheet, formulaStable);
        } else if (formula && formula.trim().startsWith('=')) {
            formula = formula.trim();
            formulaStable = this.CompileFormulaToStableIds(sheet, formula);
        }

        const mergedStyle: SpreadsheetCellStyleSpec | undefined =
            input.Style || existing?.Style
                ? { ...(existing?.Style ?? {}), ...(input.Style ?? {}) }
                : undefined;

        const cell: SpreadsheetCellSpec = {
            RowID: rowSpec.RowID,
            ColumnID: colSpec.ColumnID,
            Address: canonicalAddr,
            RawValue: rawValue,
            Formula: formula,
            FormulaStable: formulaStable,
            ComputedValue: formula ? existing?.ComputedValue ?? null : rawValue,
            DisplayValue: '',
            Style: mergedStyle,
            Note: input.Note !== undefined ? input.Note : existing?.Note ?? null,
            AccessDenied: false,
            ErrorMessage: null,
            SpilledFrom: null
        };

        sheet.Cells[canonicalAddr] = cell;
        this.validateCellAgainstSheetRules(sheet, cell);

        if (recalculate) {
            this.EvaluateWorkbook(workbook);
        } else {
            cell.DisplayValue = this.FormatCellValue(cell.ComputedValue ?? cell.RawValue, cell.Style);
        }
        workbook.UpdatedAt = new Date().toISOString();
        return sheet.Cells[canonicalAddr];
    }

    /**
     * Reads a rectangular A1 range from `sheetIdOrName` as a 2D array of cell specs.
     */
    public ReadRange(
        workbook: WorkbookSpec,
        sheetIdOrName: string,
        rangeA1: string
    ): SpreadsheetCellSpec[][] {
        const sheet = this.GetWorksheet(workbook, sheetIdOrName);
        if (!sheet) {
            throw new Error(`Worksheet '${sheetIdOrName}' not found.`);
        }
        const bounds = ParseRangeAddress(rangeA1);
        if (!bounds) {
            throw new Error(`Invalid A1 range '${rangeA1}'.`);
        }
        this.ensureSheetCapacity(sheet, bounds.endRow, bounds.endCol);
        const grid: SpreadsheetCellSpec[][] = [];
        for (let r = bounds.startRow; r <= bounds.endRow; r++) {
            const rowCells: SpreadsheetCellSpec[] = [];
            for (let c = bounds.startCol; c <= bounds.endCol; c++) {
                const addr = FormatCellAddress(r, c);
                const cell = sheet.Cells[addr] ?? {
                    RowID: sheet.Rows[r - 1].RowID,
                    ColumnID: sheet.Columns[c - 1].ColumnID,
                    Address: addr,
                    RawValue: null,
                    ComputedValue: null,
                    DisplayValue: ''
                };
                rowCells.push(cell);
            }
            grid.push(rowCells);
        }
        return grid;
    }

    /**
     * Adds a new worksheet tab to `workbook`.
     */
    public AddWorksheet(
        workbook: WorkbookSpec,
        name: string,
        rowCount = DEFAULT_ROW_COUNT,
        colCount = DEFAULT_COLUMN_COUNT
    ): WorksheetSpec {
        const nextNum = workbook.Worksheets.length + 1;
        const sheetId = `sheet-${Date.now().toString(36)}-${nextNum}`;
        const uniqueName = this.makeUniqueWorksheetName(workbook, name || `Sheet ${nextNum}`);
        const ws = this.CreateEmptyWorksheet(sheetId, uniqueName, rowCount, colCount);
        workbook.Worksheets.push(ws);
        workbook.UpdatedAt = new Date().toISOString();
        return ws;
    }

    private makeUniqueWorksheetName(workbook: WorkbookSpec, desired: string): string {
        const existing = new Set(workbook.Worksheets.map((w) => w.Name.toLowerCase()));
        const base = desired.replace(/[\[\]:*?/\\]/g, ' ').trim().slice(0, 31) || 'Sheet';
        if (!existing.has(base.toLowerCase())) return base;
        for (let i = 2; i < 999; i++) {
            const suffix = ` (${i})`;
            const candidate = `${base.slice(0, 31 - suffix.length)}${suffix}`;
            if (!existing.has(candidate.toLowerCase())) return candidate;
        }
        return base;
    }

    private ensureSheetCapacity(sheet: WorksheetSpec, minRow: number, minCol: number): void {
        while (sheet.Rows.length < minRow) {
            const nextIdx = sheet.Rows.length + 1;
            sheet.Rows.push({
                RowID: `${sheet.SheetID}-row-${nextIdx}`,
                Index: nextIdx,
                Height: DEFAULT_ROW_HEIGHT,
                Hidden: false
            });
        }
        while (sheet.Columns.length < minCol) {
            const nextIdx = sheet.Columns.length + 1;
            const letter = ColumnIndexToLetter(nextIdx);
            sheet.Columns.push({
                ColumnID: `${sheet.SheetID}-col-${letter}`,
                Index: nextIdx,
                Letter: letter,
                Width: DEFAULT_COLUMN_WIDTH,
                Hidden: false
            });
        }
    }

    // -----------------------------------------------------------------------
    // Headless Formula Evaluator (§ 6.1, O7, Accept #3)
    // -----------------------------------------------------------------------

    /**
     * Synchronously evaluates all standard formulas across all worksheets in `workbook`.
     *
     * Note: Cells containing `=MJ.QUERY(...)` or `=MJ.VIEW(...)` retain their last viewer-evaluated
     * `ComputedValue` (or `'#MJ_PENDING!'` until `EvaluateMjCustomFunctions` runs with a `UserInfo`).
     */
    public EvaluateWorkbook(workbook: WorkbookSpec): void {
        const memo = new Map<string, SpreadsheetCellValue>();
        const visiting = new Set<string>();

        for (const sheet of workbook.Worksheets) {
            // Ensure all stable-ID formulas are resolved to current A1 coordinates first
            for (const cell of Object.values(sheet.Cells)) {
                if (cell.FormulaStable) {
                    cell.Formula = this.ResolveFormulaFromStableIds(sheet, cell.FormulaStable);
                }
            }
        }

        for (const sheet of workbook.Worksheets) {
            for (const [addr, cell] of Object.entries(sheet.Cells)) {
                const value = this.evaluateCellInternal(workbook, sheet, addr, memo, visiting);
                cell.ComputedValue = value;
                cell.DisplayValue = this.FormatCellValue(value, cell.Style);
                this.validateCellAgainstSheetRules(sheet, cell);
            }
        }
    }

    /**
     * Evaluates an arbitrary formula expression against `sheet` in `workbook` without mutating cells.
     */
    public EvaluateFormulaExpression(
        workbook: WorkbookSpec,
        sheetIdOrName: string,
        formula: string
    ): SpreadsheetCellValue {
        const sheet = this.GetWorksheet(workbook, sheetIdOrName) ?? workbook.Worksheets[0];
        if (!sheet) return '#REF!';
        const memo = new Map<string, SpreadsheetCellValue>();
        const visiting = new Set<string>();
        const clean = formula.trim().startsWith('=') ? formula.trim().slice(1).trim() : formula.trim();
        return this.evalExpression(clean, workbook, sheet, memo, visiting);
    }

    private evaluateCellInternal(
        workbook: WorkbookSpec,
        sheet: WorksheetSpec,
        address: string,
        memo: Map<string, SpreadsheetCellValue>,
        visiting: Set<string>
    ): SpreadsheetCellValue {
        const parsed = ParseCellAddress(address);
        if (!parsed) return '#REF!';
        const canonical = FormatCellAddress(parsed.row, parsed.col);
        const cacheKey = `${sheet.SheetID}::${canonical}`;
        if (memo.has(cacheKey)) {
            return memo.get(cacheKey) ?? null;
        }
        const cell = sheet.Cells[canonical];
        if (!cell) {
            memo.set(cacheKey, null);
            return null;
        }
        if (!cell.Formula || !cell.Formula.trim().startsWith('=')) {
            memo.set(cacheKey, cell.RawValue ?? null);
            return cell.RawValue ?? null;
        }
        if (visiting.has(cacheKey)) {
            return '#CYCLE!';
        }

        const expr = cell.Formula.trim().slice(1).trim();
        if (expr.includes('#REF!')) {
            memo.set(cacheKey, '#REF!');
            return '#REF!';
        }

        // Preserve viewer-scoped MJ.QUERY / MJ.VIEW result if already evaluated
        const mjParsed = this.ParseMjCustomFunctionFormula(cell.Formula);
        if (mjParsed) {
            const existingVal = cell.AccessDenied
                ? '#MJ_ACCESS_DENIED!'
                : cell.ComputedValue !== undefined && cell.ComputedValue !== null
                  ? cell.ComputedValue
                  : '#MJ_PENDING!';
            memo.set(cacheKey, existingVal);
            return existingVal;
        }

        visiting.add(cacheKey);
        let computed: SpreadsheetCellValue;
        try {
            computed = this.evalExpression(expr, workbook, sheet, memo, visiting);
        } catch {
            computed = '#VALUE!';
        } finally {
            visiting.delete(cacheKey);
        }
        memo.set(cacheKey, computed);
        return computed;
    }

    private evalExpression(
        rawExpr: string,
        workbook: WorkbookSpec,
        sheet: WorksheetSpec,
        memo: Map<string, SpreadsheetCellValue>,
        visiting: Set<string>
    ): SpreadsheetCellValue {
        const expr = this.stripOuterParens(rawExpr.trim());
        if (!expr) return null;

        // Error literal passthrough
        if (/^#(REF!|DIV\/0!|VALUE!|NAME\?|CYCLE!|N\/A|MJ_ACCESS_DENIED!|MJ_PENDING!|SPILL!)$/.test(expr)) {
            return expr;
        }

        // String literal
        if (expr.startsWith('"') && expr.endsWith('"') && expr.length >= 2) {
            const inner = expr.slice(1, -1);
            if (!inner.includes('"') || inner.replace(/""/g, '').indexOf('"') === -1) {
                return inner.replace(/""/g, '"');
            }
        }

        // Boolean literal
        if (expr.toUpperCase() === 'TRUE') return true;
        if (expr.toUpperCase() === 'FALSE') return false;

        // Numeric literal (including trailing %)
        if (/^[+-]?(\d+\.?\d*|\.\d+)%$/.test(expr)) {
            return parseFloat(expr.slice(0, -1)) / 100;
        }
        if (/^[+-]?(\d+\.?\d*|\.\d+)([eE][+-]?\d+)?$/.test(expr)) {
            return parseFloat(expr);
        }

        // Binary operators in precedence order (lowest to highest):
        // 1. Comparison: <>, <=, >=, =, <, >
        const cmpSplit = this.findTopLevelOperator(expr, ['<>', '<=', '>=', '=', '<', '>']);
        if (cmpSplit) {
            const left = this.evalExpression(cmpSplit.left, workbook, sheet, memo, visiting);
            const right = this.evalExpression(cmpSplit.right, workbook, sheet, memo, visiting);
            if (this.isErrorValue(left)) return left;
            if (this.isErrorValue(right)) return right;
            return this.compareValues(left, right, cmpSplit.op);
        }

        // 2. String concatenation: &
        const concatSplit = this.findTopLevelOperator(expr, ['&']);
        if (concatSplit) {
            const left = this.evalExpression(concatSplit.left, workbook, sheet, memo, visiting);
            const right = this.evalExpression(concatSplit.right, workbook, sheet, memo, visiting);
            if (this.isErrorValue(left)) return left;
            if (this.isErrorValue(right)) return right;
            return `${left ?? ''}${right ?? ''}`;
        }

        // 3. Addition / Subtraction: +, - (right-to-left scan for left-associativity, ignoring unary sign)
        const addSubSplit = this.findTopLevelAddSub(expr);
        if (addSubSplit) {
            const left = this.evalExpression(addSubSplit.left, workbook, sheet, memo, visiting);
            const right = this.evalExpression(addSubSplit.right, workbook, sheet, memo, visiting);
            if (this.isErrorValue(left)) return left;
            if (this.isErrorValue(right)) return right;
            const nLeft = this.toNumberOrError(left);
            const nRight = this.toNumberOrError(right);
            if (typeof nLeft === 'string') return nLeft;
            if (typeof nRight === 'string') return nRight;
            return addSubSplit.op === '+' ? nLeft + nRight : nLeft - nRight;
        }

        // 4. Multiplication / Division: *, /
        const mulDivSplit = this.findTopLevelOperatorRightToLeft(expr, ['*', '/']);
        if (mulDivSplit) {
            const left = this.evalExpression(mulDivSplit.left, workbook, sheet, memo, visiting);
            const right = this.evalExpression(mulDivSplit.right, workbook, sheet, memo, visiting);
            if (this.isErrorValue(left)) return left;
            if (this.isErrorValue(right)) return right;
            const nLeft = this.toNumberOrError(left);
            const nRight = this.toNumberOrError(right);
            if (typeof nLeft === 'string') return nLeft;
            if (typeof nRight === 'string') return nRight;
            if (mulDivSplit.op === '/') {
                if (nRight === 0) return '#DIV/0!';
                return nLeft / nRight;
            }
            return nLeft * nRight;
        }

        // 5. Exponentiation: ^
        const powSplit = this.findTopLevelOperatorRightToLeft(expr, ['^']);
        if (powSplit) {
            const left = this.evalExpression(powSplit.left, workbook, sheet, memo, visiting);
            const right = this.evalExpression(powSplit.right, workbook, sheet, memo, visiting);
            if (this.isErrorValue(left)) return left;
            if (this.isErrorValue(right)) return right;
            const nLeft = this.toNumberOrError(left);
            const nRight = this.toNumberOrError(right);
            if (typeof nLeft === 'string') return nLeft;
            if (typeof nRight === 'string') return nRight;
            return Math.pow(nLeft, nRight);
        }

        // 6. Unary + / -
        if (expr.startsWith('-') || expr.startsWith('+')) {
            const inner = this.evalExpression(expr.slice(1), workbook, sheet, memo, visiting);
            if (this.isErrorValue(inner)) return inner;
            const num = this.toNumberOrError(inner);
            if (typeof num === 'string') return num;
            return expr.startsWith('-') ? -num : num;
        }

        // 7. Function call: FUNC(arg1, arg2, ...)
        const fnMatch = /^([A-Za-z_][A-Za-z0-9_.]*)\(([\s\S]*)\)$/.exec(expr);
        if (fnMatch && this.hasBalancedParentheses(fnMatch[2])) {
            const fnName = fnMatch[1].toUpperCase();
            const rawArgs = this.splitTopLevelArgs(fnMatch[2]);
            return this.evalFunctionCall(fnName, rawArgs, workbook, sheet, memo, visiting);
        }

        // 8. Cross-sheet cell reference: 'Sheet 2'!B2 or Sheet2!B2
        const crossCell = /^(?:'([^']+)'|([A-Za-z0-9_]+))!(\$?[A-Za-z]{1,3}\$?[1-9][0-9]*)$/.exec(expr);
        if (crossCell) {
            const targetSheetName = crossCell[1] || crossCell[2];
            const targetSheet = this.GetWorksheet(workbook, targetSheetName);
            if (!targetSheet) return '#REF!';
            return this.evaluateCellInternal(workbook, targetSheet, crossCell[3], memo, visiting);
        }

        // 9. Local cell reference: B2, $B$2
        if (ParseCellAddress(expr)) {
            return this.evaluateCellInternal(workbook, sheet, expr, memo, visiting);
        }

        // 10. Workbook Named Range reference
        const named = workbook.NamedRanges.find((nr) => nr.Name.toLowerCase() === expr.toLowerCase());
        if (named) {
            const targetSheet = this.GetWorksheet(workbook, named.SheetID) ?? sheet;
            if (ParseCellAddress(named.Range)) {
                return this.evaluateCellInternal(workbook, targetSheet, named.Range, memo, visiting);
            }
            const values = this.resolveRangeValues(named.Range, workbook, targetSheet, memo, visiting);
            return values[0] ?? null;
        }

        return '#NAME?';
    }

    private evalFunctionCall(
        fnName: string,
        rawArgs: string[],
        workbook: WorkbookSpec,
        sheet: WorksheetSpec,
        memo: Map<string, SpreadsheetCellValue>,
        visiting: Set<string>
    ): SpreadsheetCellValue {
        const evalArgScalar = (arg: string): SpreadsheetCellValue =>
            this.evalExpression(arg, workbook, sheet, memo, visiting);

        const evalArgsFlattened = (): SpreadsheetCellValue[] => {
            const out: SpreadsheetCellValue[] = [];
            for (const raw of rawArgs) {
                const trimmed = raw.trim();
                if (!trimmed) continue;
                if (this.isRangeExpression(trimmed, workbook)) {
                    out.push(...this.resolveRangeValues(trimmed, workbook, sheet, memo, visiting));
                } else {
                    out.push(evalArgScalar(trimmed));
                }
            }
            return out;
        };

        switch (fnName) {
            case 'SUM': {
                const vals = evalArgsFlattened();
                let sum = 0;
                for (const v of vals) {
                    if (this.isErrorValue(v)) return v;
                    if (typeof v === 'number') sum += v;
                    else if (typeof v === 'string' && v.trim() !== '' && !Number.isNaN(Number(v))) {
                        sum += Number(v);
                    }
                }
                return Number(sum.toFixed(10));
            }
            case 'AVERAGE':
            case 'AVG': {
                const vals = evalArgsFlattened();
                let sum = 0;
                let count = 0;
                for (const v of vals) {
                    if (this.isErrorValue(v)) return v;
                    if (typeof v === 'number') {
                        sum += v;
                        count++;
                    }
                }
                if (count === 0) return '#DIV/0!';
                return Number((sum / count).toFixed(10));
            }
            case 'COUNT': {
                const vals = evalArgsFlattened();
                let count = 0;
                for (const v of vals) {
                    if (typeof v === 'number') count++;
                }
                return count;
            }
            case 'COUNTA': {
                const vals = evalArgsFlattened();
                return vals.filter((v) => v !== null && v !== undefined && v !== '').length;
            }
            case 'MIN': {
                const vals = evalArgsFlattened();
                const nums: number[] = [];
                for (const v of vals) {
                    if (this.isErrorValue(v)) return v;
                    if (typeof v === 'number') nums.push(v);
                }
                return nums.length > 0 ? Math.min(...nums) : 0;
            }
            case 'MAX': {
                const vals = evalArgsFlattened();
                const nums: number[] = [];
                for (const v of vals) {
                    if (this.isErrorValue(v)) return v;
                    if (typeof v === 'number') nums.push(v);
                }
                return nums.length > 0 ? Math.max(...nums) : 0;
            }
            case 'MEDIAN': {
                const vals = evalArgsFlattened();
                const nums: number[] = [];
                for (const v of vals) {
                    if (this.isErrorValue(v)) return v;
                    if (typeof v === 'number') nums.push(v);
                }
                if (nums.length === 0) return '#VALUE!';
                nums.sort((a, b) => a - b);
                const mid = Math.floor(nums.length / 2);
                return nums.length % 2 === 0 ? (nums[mid - 1] + nums[mid]) / 2 : nums[mid];
            }
            case 'ROUND':
            case 'ROUNDUP':
            case 'ROUNDDOWN': {
                const numVal = this.toNumberOrError(evalArgScalar(rawArgs[0] ?? '0'));
                if (typeof numVal === 'string') return numVal;
                const digitsVal = this.toNumberOrError(evalArgScalar(rawArgs[1] ?? '0'));
                if (typeof digitsVal === 'string') return digitsVal;
                const factor = Math.pow(10, Math.floor(digitsVal));
                if (fnName === 'ROUNDUP') {
                    return (numVal >= 0 ? Math.ceil(numVal * factor) : Math.floor(numVal * factor)) / factor;
                }
                if (fnName === 'ROUNDDOWN') {
                    return (numVal >= 0 ? Math.floor(numVal * factor) : Math.ceil(numVal * factor)) / factor;
                }
                return Math.round(numVal * factor) / factor;
            }
            case 'ABS': {
                const v = this.toNumberOrError(evalArgScalar(rawArgs[0] ?? '0'));
                return typeof v === 'string' ? v : Math.abs(v);
            }
            case 'SQRT': {
                const v = this.toNumberOrError(evalArgScalar(rawArgs[0] ?? '0'));
                if (typeof v === 'string') return v;
                return v < 0 ? '#VALUE!' : Math.sqrt(v);
            }
            case 'POWER': {
                const base = this.toNumberOrError(evalArgScalar(rawArgs[0] ?? '0'));
                const exp = this.toNumberOrError(evalArgScalar(rawArgs[1] ?? '1'));
                if (typeof base === 'string') return base;
                if (typeof exp === 'string') return exp;
                return Math.pow(base, exp);
            }
            case 'MOD': {
                const n = this.toNumberOrError(evalArgScalar(rawArgs[0] ?? '0'));
                const d = this.toNumberOrError(evalArgScalar(rawArgs[1] ?? '1'));
                if (typeof n === 'string') return n;
                if (typeof d === 'string') return d;
                if (d === 0) return '#DIV/0!';
                return n % d;
            }
            case 'IF': {
                const cond = evalArgScalar(rawArgs[0] ?? 'FALSE');
                if (this.isErrorValue(cond)) return cond;
                const truthy = Boolean(cond) && cond !== 0 && cond !== 'FALSE';
                if (truthy) {
                    return rawArgs[1] !== undefined ? evalArgScalar(rawArgs[1]) : true;
                }
                return rawArgs[2] !== undefined ? evalArgScalar(rawArgs[2]) : false;
            }
            case 'IFS': {
                for (let i = 0; i + 1 < rawArgs.length; i += 2) {
                    const cond = evalArgScalar(rawArgs[i]);
                    if (this.isErrorValue(cond)) return cond;
                    if (Boolean(cond) && cond !== 0) {
                        return evalArgScalar(rawArgs[i + 1]);
                    }
                }
                return '#N/A';
            }
            case 'IFERROR':
            case 'IFNA': {
                const primary = evalArgScalar(rawArgs[0] ?? '');
                if (this.isErrorValue(primary)) {
                    return evalArgScalar(rawArgs[1] ?? '');
                }
                return primary;
            }
            case 'AND': {
                const vals = evalArgsFlattened();
                for (const v of vals) {
                    if (this.isErrorValue(v)) return v;
                    if (!v || v === 0) return false;
                }
                return true;
            }
            case 'OR': {
                const vals = evalArgsFlattened();
                for (const v of vals) {
                    if (this.isErrorValue(v)) return v;
                    if (Boolean(v) && v !== 0) return true;
                }
                return false;
            }
            case 'NOT': {
                const v = evalArgScalar(rawArgs[0] ?? 'FALSE');
                if (this.isErrorValue(v)) return v;
                return !(Boolean(v) && v !== 0);
            }
            case 'CONCAT':
            case 'CONCATENATE': {
                const vals = evalArgsFlattened();
                for (const v of vals) {
                    if (this.isErrorValue(v)) return v;
                }
                return vals.map((v) => (v === null || v === undefined ? '' : String(v))).join('');
            }
            case 'UPPER': {
                const v = evalArgScalar(rawArgs[0] ?? '');
                return this.isErrorValue(v) ? v : String(v ?? '').toUpperCase();
            }
            case 'LOWER': {
                const v = evalArgScalar(rawArgs[0] ?? '');
                return this.isErrorValue(v) ? v : String(v ?? '').toLowerCase();
            }
            case 'TRIM': {
                const v = evalArgScalar(rawArgs[0] ?? '');
                return this.isErrorValue(v) ? v : String(v ?? '').trim().replace(/\s+/g, ' ');
            }
            case 'LEN': {
                const v = evalArgScalar(rawArgs[0] ?? '');
                return this.isErrorValue(v) ? v : String(v ?? '').length;
            }
            case 'LEFT': {
                const text = String(evalArgScalar(rawArgs[0] ?? '') ?? '');
                const len = rawArgs[1] ? Number(evalArgScalar(rawArgs[1])) || 1 : 1;
                return text.slice(0, Math.max(0, len));
            }
            case 'RIGHT': {
                const text = String(evalArgScalar(rawArgs[0] ?? '') ?? '');
                const len = rawArgs[1] ? Number(evalArgScalar(rawArgs[1])) || 1 : 1;
                return len <= 0 ? '' : text.slice(-len);
            }
            case 'MID': {
                const text = String(evalArgScalar(rawArgs[0] ?? '') ?? '');
                const start = Math.max(1, Number(evalArgScalar(rawArgs[1] ?? '1')) || 1);
                const len = Math.max(0, Number(evalArgScalar(rawArgs[2] ?? '0')) || 0);
                return text.slice(start - 1, start - 1 + len);
            }
            case 'SUMIF':
            case 'COUNTIF':
            case 'AVERAGEIF': {
                const criteriaRange = this.resolveRangeValues(rawArgs[0] ?? '', workbook, sheet, memo, visiting);
                const criteria = evalArgScalar(rawArgs[1] ?? '');
                const sumRange = rawArgs[2]
                    ? this.resolveRangeValues(rawArgs[2], workbook, sheet, memo, visiting)
                    : criteriaRange;
                let sum = 0;
                let matches = 0;
                for (let i = 0; i < criteriaRange.length; i++) {
                    if (this.matchesCriteria(criteriaRange[i], criteria)) {
                        matches++;
                        const targetVal = sumRange[i];
                        if (typeof targetVal === 'number') {
                            sum += targetVal;
                        } else if (typeof targetVal === 'string' && targetVal.trim() !== '' && !Number.isNaN(Number(targetVal))) {
                            sum += Number(targetVal);
                        }
                    }
                }
                if (fnName === 'COUNTIF') return matches;
                if (fnName === 'AVERAGEIF') return matches === 0 ? '#DIV/0!' : Number((sum / matches).toFixed(10));
                return Number(sum.toFixed(10));
            }
            case 'VLOOKUP': {
                const lookupVal = evalArgScalar(rawArgs[0] ?? '');
                const matrix = this.resolveRangeMatrix(rawArgs[1] ?? '', workbook, sheet, memo, visiting);
                const colIndex = Math.max(1, Math.floor(Number(evalArgScalar(rawArgs[2] ?? '1')) || 1));
                for (const row of matrix) {
                    if (this.valuesEqualCaseInsensitive(row[0] ?? null, lookupVal)) {
                        return colIndex <= row.length ? (row[colIndex - 1] ?? null) : '#REF!';
                    }
                }
                return '#N/A';
            }
            case 'INDEX': {
                const matrix = this.resolveRangeMatrix(rawArgs[0] ?? '', workbook, sheet, memo, visiting);
                const r = Math.max(1, Math.floor(Number(evalArgScalar(rawArgs[1] ?? '1')) || 1));
                const c = Math.max(1, Math.floor(Number(evalArgScalar(rawArgs[2] ?? '1')) || 1));
                if (r > matrix.length || c > (matrix[0]?.length ?? 0)) return '#REF!';
                return matrix[r - 1][c - 1] ?? null;
            }
            case 'MATCH': {
                const lookupVal = evalArgScalar(rawArgs[0] ?? '');
                const vals = this.resolveRangeValues(rawArgs[1] ?? '', workbook, sheet, memo, visiting);
                for (let i = 0; i < vals.length; i++) {
                    if (this.valuesEqualCaseInsensitive(vals[i], lookupVal)) {
                        return i + 1;
                    }
                }
                return '#N/A';
            }
            case 'TODAY':
                return new Date().toISOString().slice(0, 10);
            case 'NOW':
                return new Date().toISOString();
            case 'YEAR':
            case 'MONTH':
            case 'DAY': {
                const v = String(evalArgScalar(rawArgs[0] ?? '') ?? '');
                const d = new Date(v);
                if (Number.isNaN(d.getTime())) return '#VALUE!';
                if (fnName === 'YEAR') return d.getUTCFullYear();
                if (fnName === 'MONTH') return d.getUTCMonth() + 1;
                return d.getUTCDate();
            }
            default:
                return '#NAME?';
        }
    }

    private isRangeExpression(token: string, workbook: WorkbookSpec): boolean {
        const clean = token.trim();
        if (clean.includes(':')) return true;
        return workbook.NamedRanges.some((nr) => nr.Name.toLowerCase() === clean.toLowerCase() && nr.Range.includes(':'));
    }

    private resolveRangeValues(
        rangeToken: string,
        workbook: WorkbookSpec,
        sheet: WorksheetSpec,
        memo: Map<string, SpreadsheetCellValue>,
        visiting: Set<string>
    ): SpreadsheetCellValue[] {
        const matrix = this.resolveRangeMatrix(rangeToken, workbook, sheet, memo, visiting);
        const flat: SpreadsheetCellValue[] = [];
        for (const r of matrix) {
            flat.push(...r);
        }
        return flat;
    }

    private resolveRangeMatrix(
        rangeToken: string,
        workbook: WorkbookSpec,
        sheet: WorksheetSpec,
        memo: Map<string, SpreadsheetCellValue>,
        visiting: Set<string>
    ): SpreadsheetCellValue[][] {
        let targetSheet = sheet;
        let rangeExpr = rangeToken.trim();

        // Check named range first
        const named = workbook.NamedRanges.find((nr) => nr.Name.toLowerCase() === rangeExpr.toLowerCase());
        if (named) {
            targetSheet = this.GetWorksheet(workbook, named.SheetID) ?? sheet;
            rangeExpr = named.Range;
        } else {
            const crossMatch = /^(?:'([^']+)'|([A-Za-z0-9_]+))!(.+)$/.exec(rangeExpr);
            if (crossMatch) {
                const sName = crossMatch[1] || crossMatch[2];
                const resolved = this.GetWorksheet(workbook, sName);
                if (!resolved) return [['#REF!']];
                targetSheet = resolved;
                rangeExpr = crossMatch[3];
            }
        }

        const bounds = ParseRangeAddress(rangeExpr);
        if (!bounds) {
            return [[this.evalExpression(rangeExpr, workbook, targetSheet, memo, visiting)]];
        }
        const matrix: SpreadsheetCellValue[][] = [];
        for (let r = bounds.startRow; r <= bounds.endRow; r++) {
            const rowVals: SpreadsheetCellValue[] = [];
            for (let c = bounds.startCol; c <= bounds.endCol; c++) {
                const addr = FormatCellAddress(r, c);
                rowVals.push(this.evaluateCellInternal(workbook, targetSheet, addr, memo, visiting));
            }
            matrix.push(rowVals);
        }
        return matrix;
    }

    // -----------------------------------------------------------------------
    // Expression Parsing Helpers
    // -----------------------------------------------------------------------

    private stripOuterParens(expr: string): string {
        let cur = expr.trim();
        while (cur.startsWith('(') && cur.endsWith(')')) {
            const inner = cur.slice(1, -1);
            if (this.hasBalancedParentheses(inner)) {
                cur = inner.trim();
            } else {
                break;
            }
        }
        return cur;
    }

    private hasBalancedParentheses(s: string): boolean {
        let depth = 0;
        let inQuotes = false;
        for (let i = 0; i < s.length; i++) {
            const ch = s[i];
            if (ch === '"') {
                inQuotes = !inQuotes;
            } else if (!inQuotes) {
                if (ch === '(') depth++;
                else if (ch === ')') {
                    depth--;
                    if (depth < 0) return false;
                }
            }
        }
        return depth === 0 && !inQuotes;
    }

    private splitTopLevelArgs(argsStr: string): string[] {
        const trimmed = argsStr.trim();
        if (!trimmed) return [];
        const parts: string[] = [];
        let depth = 0;
        let inQuotes = false;
        let start = 0;
        for (let i = 0; i < argsStr.length; i++) {
            const ch = argsStr[i];
            if (ch === '"') {
                inQuotes = !inQuotes;
            } else if (!inQuotes) {
                if (ch === '(') depth++;
                else if (ch === ')') depth--;
                else if (ch === ',' && depth === 0) {
                    parts.push(argsStr.slice(start, i).trim());
                    start = i + 1;
                }
            }
        }
        parts.push(argsStr.slice(start).trim());
        return parts;
    }

    private findTopLevelOperator(
        expr: string,
        ops: string[]
    ): { left: string; op: string; right: string } | null {
        let depth = 0;
        let inQuotes = false;
        for (let i = 0; i < expr.length; i++) {
            const ch = expr[i];
            if (ch === '"') {
                inQuotes = !inQuotes;
                continue;
            }
            if (inQuotes) continue;
            if (ch === '(') {
                depth++;
                continue;
            }
            if (ch === ')') {
                depth--;
                continue;
            }
            if (depth === 0) {
                for (const op of ops) {
                    if (expr.startsWith(op, i)) {
                        const left = expr.slice(0, i).trim();
                        const right = expr.slice(i + op.length).trim();
                        if (left && right) {
                            return { left, op, right };
                        }
                    }
                }
            }
        }
        return null;
    }

    private findTopLevelOperatorRightToLeft(
        expr: string,
        ops: string[]
    ): { left: string; op: string; right: string } | null {
        let depth = 0;
        let inQuotes = false;
        for (let i = expr.length - 1; i >= 0; i--) {
            const ch = expr[i];
            if (ch === '"') {
                inQuotes = !inQuotes;
                continue;
            }
            if (inQuotes) continue;
            if (ch === ')') {
                depth++;
                continue;
            }
            if (ch === '(') {
                depth--;
                continue;
            }
            if (depth === 0) {
                for (const op of ops) {
                    if (expr.startsWith(op, i)) {
                        const left = expr.slice(0, i).trim();
                        const right = expr.slice(i + op.length).trim();
                        if (left && right) {
                            return { left, op, right };
                        }
                    }
                }
            }
        }
        return null;
    }

    private findTopLevelAddSub(expr: string): { left: string; op: '+' | '-'; right: string } | null {
        let depth = 0;
        let inQuotes = false;
        for (let i = expr.length - 1; i > 0; i--) {
            const ch = expr[i];
            if (ch === '"') {
                inQuotes = !inQuotes;
                continue;
            }
            if (inQuotes) continue;
            if (ch === ')') {
                depth++;
                continue;
            }
            if (ch === '(') {
                depth--;
                continue;
            }
            if (depth === 0 && (ch === '+' || ch === '-')) {
                // Ensure this is binary, not unary after another operator or scientific notation
                const prev = expr.slice(0, i).trim();
                if (!prev) continue;
                const prevChar = prev[prev.length - 1];
                if ('+-*/^=<>(&,'.includes(prevChar)) continue;
                if ((prevChar === 'e' || prevChar === 'E') && prev.length >= 2 && /\d/.test(prev[prev.length - 2])) {
                    continue;
                }
                const right = expr.slice(i + 1).trim();
                if (right) {
                    return { left: prev, op: ch, right };
                }
            }
        }
        return null;
    }

    private isErrorValue(v: SpreadsheetCellValue): boolean {
        return typeof v === 'string' && v.startsWith('#') && (v.endsWith('!') || v.endsWith('?') || v === '#N/A');
    }

    private toNumberOrError(v: SpreadsheetCellValue): number | string {
        if (this.isErrorValue(v)) return v as string;
        if (v === null || v === undefined || v === '') return 0;
        if (typeof v === 'number') return v;
        if (typeof v === 'boolean') return v ? 1 : 0;
        const n = Number(v);
        return Number.isNaN(n) ? '#VALUE!' : n;
    }

    private compareValues(left: SpreadsheetCellValue, right: SpreadsheetCellValue, op: string): boolean {
        const lNum = typeof left === 'number' ? left : Number(left);
        const rNum = typeof right === 'number' ? right : Number(right);
        const bothNumeric =
            left !== null &&
            right !== null &&
            left !== '' &&
            right !== '' &&
            !Number.isNaN(lNum) &&
            !Number.isNaN(rNum);
        if (bothNumeric) {
            switch (op) {
                case '=':
                    return lNum === rNum;
                case '<>':
                    return lNum !== rNum;
                case '<':
                    return lNum < rNum;
                case '<=':
                    return lNum <= rNum;
                case '>':
                    return lNum > rNum;
                case '>=':
                    return lNum >= rNum;
            }
        }
        const lStr = String(left ?? '').toLowerCase();
        const rStr = String(right ?? '').toLowerCase();
        switch (op) {
            case '=':
                return lStr === rStr;
            case '<>':
                return lStr !== rStr;
            case '<':
                return lStr < rStr;
            case '<=':
                return lStr <= rStr;
            case '>':
                return lStr > rStr;
            case '>=':
                return lStr >= rStr;
            default:
                return false;
        }
    }

    private valuesEqualCaseInsensitive(a: SpreadsheetCellValue, b: SpreadsheetCellValue): boolean {
        if (a === b) return true;
        if (typeof a === 'string' && typeof b === 'string') {
            return a.trim().toLowerCase() === b.trim().toLowerCase();
        }
        return String(a ?? '').toLowerCase() === String(b ?? '').toLowerCase();
    }

    private matchesCriteria(cellVal: SpreadsheetCellValue, criteria: SpreadsheetCellValue): boolean {
        if (criteria === null || criteria === undefined) return cellVal === null;
        const critStr = String(criteria).trim();
        const opMatch = /^(<>|<=|>=|=|<|>)(.*)$/.exec(critStr);
        if (opMatch) {
            const op = opMatch[1];
            const rhsRaw = opMatch[2].trim();
            const rhsVal: SpreadsheetCellValue =
                rhsRaw !== '' && !Number.isNaN(Number(rhsRaw)) ? Number(rhsRaw) : rhsRaw;
            return this.compareValues(cellVal, rhsVal, op);
        }
        return this.valuesEqualCaseInsensitive(cellVal, criteria);
    }

    // -----------------------------------------------------------------------
    // Cell Formatting & Validation
    // -----------------------------------------------------------------------

    /**
     * Formats a raw or computed scalar value according to its {@link SpreadsheetCellStyleSpec}.
     */
    public FormatCellValue(value: SpreadsheetCellValue, style?: SpreadsheetCellStyleSpec): string {
        if (value === null || value === undefined) return '';
        if (typeof value === 'boolean') return value ? 'TRUE' : 'FALSE';
        if (typeof value === 'string' && this.isErrorValue(value)) return value;

        const formatType = style?.FormatType ?? this.InferFormatTypeFromPattern(style?.NumberFormatPattern);
        if (typeof value === 'number') {
            switch (formatType) {
                case 'currency':
                    return new Intl.NumberFormat('en-US', {
                        style: 'currency',
                        currency: 'USD',
                        minimumFractionDigits: 2,
                        maximumFractionDigits: 2
                    }).format(value);
                case 'percent':
                    return `${(value * 100).toFixed(1)}%`;
                case 'integer':
                    return new Intl.NumberFormat('en-US', { maximumFractionDigits: 0 }).format(Math.round(value));
                case 'number':
                    return new Intl.NumberFormat('en-US', {
                        minimumFractionDigits: 2,
                        maximumFractionDigits: 2
                    }).format(value);
                default:
                    return Number.isInteger(value) ? String(value) : String(Number(value.toFixed(6)));
            }
        }
        return String(value);
    }

    /**
     * Infers a high-level {@link SpreadsheetCellFormatType} from an Excel `numFmt` pattern string.
     */
    public InferFormatTypeFromPattern(pattern?: string | null): SpreadsheetCellFormatType {
        if (!pattern) return 'general';
        const p = pattern.trim();
        if (p.includes('$') || p.includes('¤')) return 'currency';
        if (p.includes('%')) return 'percent';
        if (/yyyy|mm|dd/i.test(p)) return p.includes('h') ? 'datetime' : 'date';
        if (p === '#,##0' || p === '0') return 'integer';
        if (p.includes('0.0')) return 'number';
        return 'general';
    }

    /**
     * Returns the default Excel `numFmt` pattern for a {@link SpreadsheetCellFormatType}.
     */
    public DefaultPatternForFormatType(formatType?: SpreadsheetCellFormatType): string | undefined {
        switch (formatType) {
            case 'currency':
                return '$#,##0.00';
            case 'percent':
                return '0.0%';
            case 'integer':
                return '#,##0';
            case 'number':
                return '#,##0.00';
            case 'date':
                return 'yyyy-mm-dd';
            case 'datetime':
                return 'yyyy-mm-dd hh:mm';
            default:
                return undefined;
        }
    }

    private validateCellAgainstSheetRules(sheet: WorksheetSpec, cell: SpreadsheetCellSpec): void {
        cell.ValidationError = null;
        if (!sheet.ValidationRules || sheet.ValidationRules.length === 0) return;
        const pos = ParseCellAddress(cell.Address);
        if (!pos) return;
        const effectiveVal = cell.ComputedValue ?? cell.RawValue;

        for (const rule of sheet.ValidationRules) {
            const bounds = ParseRangeAddress(rule.Range);
            if (!bounds) continue;
            if (
                pos.row >= bounds.startRow &&
                pos.row <= bounds.endRow &&
                pos.col >= bounds.startCol &&
                pos.col <= bounds.endCol
            ) {
                if (rule.RuleType === 'notEmpty') {
                    if (effectiveVal === null || effectiveVal === undefined || String(effectiveVal).trim() === '') {
                        cell.ValidationError = rule.ErrorMessage || 'This cell cannot be empty.';
                        return;
                    }
                } else if (rule.RuleType === 'list' && Array.isArray(rule.AllowedValues)) {
                    if (effectiveVal !== null && effectiveVal !== undefined && String(effectiveVal) !== '') {
                        const allowed = rule.AllowedValues.some(
                            (a) => a.toLowerCase() === String(effectiveVal).toLowerCase()
                        );
                        if (!allowed) {
                            cell.ValidationError =
                                rule.ErrorMessage || `Value must be one of: ${rule.AllowedValues.join(', ')}.`;
                            return;
                        }
                    }
                } else if (rule.RuleType === 'numberRange') {
                    if (effectiveVal !== null && effectiveVal !== undefined && String(effectiveVal) !== '') {
                        const num = Number(effectiveVal);
                        if (
                            Number.isNaN(num) ||
                            (rule.MinValue !== undefined && num < rule.MinValue) ||
                            (rule.MaxValue !== undefined && num > rule.MaxValue)
                        ) {
                            cell.ValidationError =
                                rule.ErrorMessage ||
                                `Value must be between ${rule.MinValue ?? '-∞'} and ${rule.MaxValue ?? '∞'}.`;
                            return;
                        }
                    }
                }
            }
        }
    }

    /**
     * Evaluates conditional formatting rules for `cell` on `sheet`, returning the matching highlight tone if any.
     */
    public GetCellConditionalHighlight(
        sheet: WorksheetSpec,
        cell: SpreadsheetCellSpec
    ): 'success' | 'warning' | 'danger' | 'info' | null {
        if (!sheet.ConditionalFormats || sheet.ConditionalFormats.length === 0) return null;
        const pos = ParseCellAddress(cell.Address);
        if (!pos) return null;
        const val = cell.ComputedValue ?? cell.RawValue;
        if (val === null || val === undefined || val === '') return null;

        for (const rule of sheet.ConditionalFormats) {
            const bounds = ParseRangeAddress(rule.Range);
            if (!bounds) continue;
            if (
                pos.row < bounds.startRow ||
                pos.row > bounds.endRow ||
                pos.col < bounds.startCol ||
                pos.col > bounds.endCol
            ) {
                continue;
            }
            const num = Number(val);
            switch (rule.Operator) {
                case 'gt':
                    if (!Number.isNaN(num) && num > Number(rule.Value1)) return rule.HighlightTone;
                    break;
                case 'lt':
                    if (!Number.isNaN(num) && num < Number(rule.Value1)) return rule.HighlightTone;
                    break;
                case 'eq':
                    if (this.valuesEqualCaseInsensitive(val, rule.Value1)) return rule.HighlightTone;
                    break;
                case 'between':
                    if (
                        !Number.isNaN(num) &&
                        num >= Number(rule.Value1) &&
                        num <= Number(rule.Value2 ?? rule.Value1)
                    ) {
                        return rule.HighlightTone;
                    }
                    break;
                case 'contains':
                    if (String(val).toLowerCase().includes(String(rule.Value1).toLowerCase())) {
                        return rule.HighlightTone;
                    }
                    break;
            }
        }
        return null;
    }

    // -----------------------------------------------------------------------
    // =MJ.QUERY(...) and =MJ.VIEW(...) Custom Functions (§ 6.3, § 7.2)
    // -----------------------------------------------------------------------

    /**
     * Parses an `=MJ.QUERY(name, ...params)` or `=MJ.VIEW(entity, view, ...params)` formula string.
     * Returns `null` if `formula` is not an `=MJ.QUERY` or `=MJ.VIEW` call.
     */
    public ParseMjCustomFunctionFormula(formula?: string | null): ParsedMjCustomFunctionCall | null {
        if (!formula || typeof formula !== 'string') return null;
        const trimmed = formula.trim();
        const match = /^=\s*MJ\.(QUERY|VIEW)\s*\(([\s\S]*)\)$/i.exec(trimmed);
        if (!match) return null;

        const kind = match[1].toUpperCase() as 'QUERY' | 'VIEW';
        const rawArgs = this.splitTopLevelArgs(match[2]);
        if (rawArgs.length === 0) return null;

        const parseLiteral = (token: string): SpreadsheetCellValue => {
            const t = token.trim();
            if (t.startsWith('"') && t.endsWith('"') && t.length >= 2) {
                return t.slice(1, -1).replace(/""/g, '"');
            }
            if (t.toUpperCase() === 'TRUE') return true;
            if (t.toUpperCase() === 'FALSE') return false;
            if (t !== '' && !Number.isNaN(Number(t))) return Number(t);
            return t;
        };

        const evaluatedArgs = rawArgs.map(parseLiteral);
        const primaryTarget = String(evaluatedArgs[0] ?? '').trim();
        if (!primaryTarget) return null;

        let secondaryTarget: string | undefined;
        let paramStartIndex = 1;
        if (kind === 'VIEW') {
            if (evaluatedArgs.length >= 2) {
                secondaryTarget = String(evaluatedArgs[1] ?? '').trim();
                paramStartIndex = 2;
            }
        }

        const namedParameters: Record<string, SpreadsheetCellValue> = {};
        const positionalArgs: SpreadsheetCellValue[] = [];
        const remaining = evaluatedArgs.slice(paramStartIndex);

        for (let i = 0; i < remaining.length; i++) {
            const val = remaining[i];
            if (typeof val === 'string' && val.includes('=')) {
                const eqIdx = val.indexOf('=');
                const k = val.slice(0, eqIdx).trim();
                const vRaw = val.slice(eqIdx + 1).trim();
                if (k) {
                    namedParameters[k] =
                        vRaw !== '' && !Number.isNaN(Number(vRaw)) ? Number(vRaw) : vRaw;
                    continue;
                }
            }
            positionalArgs.push(val);
        }

        return {
            Kind: kind,
            PrimaryTarget: primaryTarget,
            SecondaryTarget: secondaryTarget,
            Arguments: positionalArgs,
            NamedParameters: namedParameters
        };
    }

    /**
     * Evaluates all `=MJ.QUERY(...)` and `=MJ.VIEW(...)` custom function cells across `workbook`
     * under the active viewer's `contextUser` permissions (`§ 6.3`, `§ 7.2`, `§ 8`).
     *
     * Enforces:
     * - Viewer-scoped RLS + FLS projection (`ProjectEntityValueRowsForUser`)
     * - Server-set parameter stripping (`StripServerOnlyRunQueryParams`)
     * - No raw SQL `WhereClause` injection in `=MJ.VIEW`
     * - Per-viewer 60s result caching (`contextUser.ID + canonicalKey`)
     * - Concurrency cap (default 5 simultaneous queries)
     * - Multi-cell spill or scalar return, followed by full workbook formula recalculation
     */
    public async EvaluateMjCustomFunctions(
        workbook: WorkbookSpec,
        contextUser: UserInfo,
        provider?: IMetadataProvider,
        options?: SpreadsheetMjEvaluationOptions
    ): Promise<{ EvaluatedCount: number; AccessDeniedCount: number }> {
        const effectiveProvider = provider ?? Metadata.Provider;
        const ttlMs = options?.CacheTtlMs ?? DEFAULT_CACHE_TTL_MS;
        const maxConcurrency = Math.max(1, options?.MaxConcurrency ?? DEFAULT_MAX_CONCURRENCY);

        // Clear any previously spilled cells first
        for (const sheet of workbook.Worksheets) {
            for (const [addr, cell] of Object.entries(sheet.Cells)) {
                if (cell.SpilledFrom) {
                    delete sheet.Cells[addr];
                }
            }
        }

        interface PendingFunctionTask {
            sheet: WorksheetSpec;
            cell: SpreadsheetCellSpec;
            parsed: ParsedMjCustomFunctionCall;
        }

        const tasks: PendingFunctionTask[] = [];
        for (const sheet of workbook.Worksheets) {
            for (const cell of Object.values(sheet.Cells)) {
                if (!cell.Formula) continue;
                const parsed = this.ParseMjCustomFunctionFormula(cell.Formula);
                if (parsed) {
                    tasks.push({ sheet, cell, parsed });
                }
            }
        }

        let evaluatedCount = 0;
        let accessDeniedCount = 0;

        // Execute in bounded concurrency batches
        for (let i = 0; i < tasks.length; i += maxConcurrency) {
            const batch = tasks.slice(i, i + maxConcurrency);
            await Promise.all(
                batch.map(async ({ sheet, cell, parsed }) => {
                    evaluatedCount++;
                    const execResult = await this.executeSingleMjCustomFunction(
                        parsed,
                        contextUser,
                        effectiveProvider,
                        ttlMs,
                        options?.BypassCache === true
                    );

                    if (!execResult.Success || execResult.AccessDenied) {
                        accessDeniedCount++;
                        cell.AccessDenied = true;
                        cell.ErrorMessage =
                            execResult.ErrorMessage || 'You do not have permission to run this MemberJunction function.';
                        cell.ComputedValue = '#MJ_ACCESS_DENIED!';
                        cell.DisplayValue = '#MJ_ACCESS_DENIED!';
                        return;
                    }

                    cell.AccessDenied = false;
                    cell.ErrorMessage = null;
                    this.applyMjFunctionResultToSheet(sheet, cell, execResult);
                })
            );
        }

        this.EvaluateWorkbook(workbook);
        return { EvaluatedCount: evaluatedCount, AccessDeniedCount: accessDeniedCount };
    }

    private async executeSingleMjCustomFunction(
        parsed: ParsedMjCustomFunctionCall,
        contextUser: UserInfo,
        provider: IMetadataProvider,
        ttlMs: number,
        bypassCache: boolean
    ): Promise<DocumentBlockExecutionResult> {
        if (!contextUser?.ID) {
            return {
                BlockID: 'mj-fn',
                Kind: parsed.Kind === 'QUERY' ? 'SavedQuery' : 'EntityView',
                Mode: 'Live',
                Success: false,
                AccessDenied: true,
                ErrorMessage: 'Authenticated UserInfo is required to execute =MJ.* functions.',
                Columns: [],
                Rows: [],
                TotalRowCount: 0
            };
        }

        const cacheKey = `${contextUser.ID.toLowerCase()}::${JSON.stringify(parsed)}`;
        const now = Date.now();
        if (!bypassCache) {
            const cached = this.viewerCache.get(cacheKey);
            if (cached && cached.ExpiresAt > now) {
                return cached.Result;
            }
        }

        let spec: DocumentBlockSpec;
        if (parsed.Kind === 'QUERY') {
            // Map positional args to non-server-set query parameters if the query metadata is available
            const params: Record<string, unknown> = { ...parsed.NamedParameters };
            const queries: QueryInfo[] = (provider as { Queries?: QueryInfo[] }).Queries ?? [];
            const matchedQuery = queries.find(
                (q) =>
                    UUIDsEqual(q.ID, parsed.PrimaryTarget) ||
                    q.Name.toLowerCase() === parsed.PrimaryTarget.toLowerCase()
            );
            if (matchedQuery && parsed.Arguments.length > 0) {
                const clientParams = (matchedQuery.Parameters ?? []).filter((p) => !p.IsServerSet);
                for (let idx = 0; idx < parsed.Arguments.length && idx < clientParams.length; idx++) {
                    const paramName = clientParams[idx].Name;
                    if (params[paramName] === undefined) {
                        params[paramName] = parsed.Arguments[idx];
                    }
                }
            } else if (parsed.Arguments.length > 0 && Object.keys(params).length === 0) {
                // Provide positional fallback parameter keys (Param1, Year, etc.)
                params['Year'] = parsed.Arguments[0];
                parsed.Arguments.forEach((arg, idx) => {
                    params[`Param${idx + 1}`] = arg;
                });
            }

            const isUuid = /^[0-9a-fA-F-]{36}$/.test(parsed.PrimaryTarget);
            spec = {
                BlockID: `mj-query-${parsed.PrimaryTarget}`,
                Kind: 'SavedQuery',
                Mode: 'Live',
                QueryID: isUuid ? parsed.PrimaryTarget : matchedQuery?.ID,
                QueryName: isUuid ? matchedQuery?.Name : parsed.PrimaryTarget,
                Parameters: params,
                MaxRows: 100
            };
        } else {
            // =MJ.VIEW(EntityName, ViewNameOrId, OptionalStructuredEqFilter)
            // Enforce § 7.1: No raw filter SQL! Only allow simple Field=Value equality or reject unsafe SQL tokens.
            let safeExtraFilter: string | undefined;
            const rawFilterCandidate = parsed.Arguments[0];
            if (typeof rawFilterCandidate === 'string' && rawFilterCandidate.trim().length > 0) {
                const candidate = rawFilterCandidate.trim();
                if (/;|--|\/\*|\b(DROP|DELETE|UPDATE|INSERT|EXEC|UNION|SELECT)\b/i.test(candidate)) {
                    return {
                        BlockID: 'mj-view-filter-rejected',
                        Kind: 'EntityView',
                        Mode: 'Live',
                        Success: false,
                        AccessDenied: true,
                        ErrorMessage: 'Unsafe SQL filter expression rejected in =MJ.VIEW.',
                        Columns: [],
                        Rows: [],
                        TotalRowCount: 0
                    };
                }
                const simpleEq = /^([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(['"]?)([^'"]*)\2$/.exec(candidate);
                if (simpleEq) {
                    const col = simpleEq[1];
                    const val = simpleEq[3];
                    safeExtraFilter =
                        val !== '' && !Number.isNaN(Number(val))
                            ? `${col} = ${Number(val)}`
                            : `${col} = '${EscapeSQLString(val)}'`;
                }
            }

            const secondary = (parsed.SecondaryTarget ?? '').trim();
            const isViewUuid = /^[0-9a-fA-F-]{36}$/.test(secondary);
            spec = {
                BlockID: `mj-view-${parsed.PrimaryTarget}`,
                Kind: 'EntityView',
                Mode: 'Live',
                EntityName: parsed.PrimaryTarget,
                ViewID: isViewUuid ? secondary : undefined,
                ViewName: !isViewUuid && secondary && secondary.toLowerCase() !== '(default)' ? secondary : undefined,
                ExtraFilter: safeExtraFilter,
                MaxRows: 100
            };
        }

        const result = await DocumentLiveBlockEngine.Instance.ExecuteBlock(spec, contextUser, provider);
        this.viewerCache.set(cacheKey, {
            ExpiresAt: now + ttlMs,
            Result: result
        });
        return result;
    }

    private applyMjFunctionResultToSheet(
        sheet: WorksheetSpec,
        anchorCell: SpreadsheetCellSpec,
        result: DocumentBlockExecutionResult
    ): void {
        const rows = result.Rows ?? [];
        const cols =
            result.Columns && result.Columns.length > 0
                ? result.Columns.map((c) => c.Name)
                : rows[0]
                  ? Object.keys(rows[0])
                  : [];

        if (rows.length === 0 || cols.length === 0) {
            anchorCell.ComputedValue = 0;
            anchorCell.DisplayValue = '0';
            return;
        }

        // Single scalar result (1 row x 1 col, or 1 row where the last column is a numeric metric)
        if (rows.length === 1 && cols.length === 1) {
            const raw = rows[0][cols[0]];
            const scalar = this.toCellScalar(raw);
            anchorCell.ComputedValue = scalar;
            anchorCell.DisplayValue = this.FormatCellValue(scalar, anchorCell.Style);
            return;
        }

        // Multi-row or multi-column spill starting at anchorCell
        const anchorPos = ParseCellAddress(anchorCell.Address);
        if (!anchorPos) return;
        const firstVal = this.toCellScalar(rows[0][cols[0]]);
        anchorCell.ComputedValue = firstVal;
        anchorCell.DisplayValue = this.FormatCellValue(firstVal, anchorCell.Style);

        this.ensureSheetCapacity(sheet, anchorPos.row + rows.length, anchorPos.col + cols.length);
        for (let rIdx = 0; rIdx < rows.length; rIdx++) {
            const rowObj = rows[rIdx];
            for (let cIdx = 0; cIdx < cols.length; cIdx++) {
                if (rIdx === 0 && cIdx === 0) continue;
                const targetR = anchorPos.row + rIdx;
                const targetC = anchorPos.col + cIdx;
                const targetAddr = FormatCellAddress(targetR, targetC);
                const existing = sheet.Cells[targetAddr];
                if (existing && !existing.SpilledFrom && (existing.Formula || existing.RawValue !== null)) {
                    // Do not overwrite user-authored cells
                    continue;
                }
                const val = this.toCellScalar(rowObj[cols[cIdx]]);
                sheet.Cells[targetAddr] = {
                    RowID: sheet.Rows[targetR - 1].RowID,
                    ColumnID: sheet.Columns[targetC - 1].ColumnID,
                    Address: targetAddr,
                    RawValue: val,
                    ComputedValue: val,
                    DisplayValue: this.FormatCellValue(val),
                    SpilledFrom: anchorCell.Address
                };
            }
        }
    }

    private toCellScalar(val: unknown): SpreadsheetCellValue {
        if (val === null || val === undefined) return null;
        if (typeof val === 'number' || typeof val === 'boolean' || typeof val === 'string') return val;
        if (val instanceof Date) return val.toISOString().slice(0, 10);
        return JSON.stringify(val);
    }

    // -----------------------------------------------------------------------
    // Live Data Table Ranges Bound to Views / Queries (§ 6.3, Accept #2, O5)
    // -----------------------------------------------------------------------

    /**
     * Refreshes all `LiveTables` across `workbook` under `contextUser`'s permissions (`§ 6.3`, `Accept #2`),
     * expanding rows, filling down `CalculatedColumns` formulas, and recalculating the workbook.
     */
    public async RefreshLiveTables(
        workbook: WorkbookSpec,
        contextUser: UserInfo,
        provider?: IMetadataProvider,
        options?: { TableID?: string; ForceRefreshFrozen?: boolean }
    ): Promise<Record<string, DocumentBlockExecutionResult>> {
        const effectiveProvider = provider ?? Metadata.Provider;
        const resultsByTableId: Record<string, DocumentBlockExecutionResult> = {};

        for (const sheet of workbook.Worksheets) {
            for (const table of sheet.LiveTables) {
                if (options?.TableID && table.TableID !== options.TableID) continue;
                if (table.Mode === 'Frozen' && table.FrozenSnapshot && !options?.ForceRefreshFrozen) {
                    const frozenRes: DocumentBlockExecutionResult = {
                        BlockID: table.TableID,
                        Kind: table.SourceType,
                        Mode: 'Frozen',
                        Success: true,
                        Columns: table.FrozenSnapshot.Columns,
                        Rows: table.FrozenSnapshot.Rows,
                        TotalRowCount: table.FrozenSnapshot.TotalRowCount,
                        FrozenMetadata: {
                            FrozenAt: table.FrozenSnapshot.FrozenAt,
                            FrozenByUserID: table.FrozenSnapshot.FrozenByUserID,
                            FrozenByUserName: table.FrozenSnapshot.FrozenByUserName
                        }
                    };
                    resultsByTableId[table.TableID] = frozenRes;
                    this.populateSheetCellsFromLiveTable(sheet, table, frozenRes);
                    continue;
                }

                const blockSpec: DocumentBlockSpec = {
                    BlockID: table.TableID,
                    Kind: table.SourceType,
                    Title: table.Title,
                    Mode: 'Live',
                    EntityName: table.EntityName,
                    ViewID: table.ViewID,
                    ViewName: table.ViewName,
                    ExtraFilter: table.ExtraFilter,
                    Fields: table.Fields,
                    QueryID: table.QueryID,
                    QueryName: table.QueryName,
                    Parameters: table.QueryParameters,
                    MaxRows: table.MaxRows ?? 100
                };

                const execRes = await DocumentLiveBlockEngine.Instance.ExecuteBlock(
                    blockSpec,
                    contextUser,
                    effectiveProvider
                );
                resultsByTableId[table.TableID] = execRes;

                if (!execRes.Success || execRes.AccessDenied) {
                    table.AccessDenied = Boolean(execRes.AccessDenied);
                    table.LastError =
                        execRes.ErrorMessage || 'You do not have permission to view this bound data source.';
                    table.LastRowCount = 0;
                    this.clearLiveTableCellsOnAccessDenied(sheet, table);
                    continue;
                }

                table.AccessDenied = false;
                table.LastError = null;
                table.LastRefreshedAt = new Date().toISOString();
                table.LastRowCount = execRes.Rows.length;
                this.populateSheetCellsFromLiveTable(sheet, table, execRes);
            }
        }

        this.EvaluateWorkbook(workbook);
        return resultsByTableId;
    }

    private clearLiveTableCellsOnAccessDenied(sheet: WorksheetSpec, table: SpreadsheetLiveTableSpec): void {
        const anchor = ParseCellAddress(table.AnchorCell || 'A1');
        if (!anchor) return;
        const addr = FormatCellAddress(anchor.row, anchor.col);
        this.ensureSheetCapacity(sheet, anchor.row, anchor.col);
        sheet.Cells[addr] = {
            RowID: sheet.Rows[anchor.row - 1].RowID,
            ColumnID: sheet.Columns[anchor.col - 1].ColumnID,
            Address: addr,
            RawValue: '#MJ_ACCESS_DENIED!',
            ComputedValue: '#MJ_ACCESS_DENIED!',
            DisplayValue: '#MJ_ACCESS_DENIED!',
            AccessDenied: true,
            ErrorMessage: table.LastError ?? 'Access denied.'
        };
    }

    private populateSheetCellsFromLiveTable(
        sheet: WorksheetSpec,
        table: SpreadsheetLiveTableSpec,
        result: DocumentBlockExecutionResult
    ): void {
        const anchor = ParseCellAddress(table.AnchorCell || 'A1') ?? { row: 1, col: 1 };
        const includeHeaders = table.IncludeHeaders !== false;
        const columns: DocumentBlockColumn[] =
            result.Columns && result.Columns.length > 0
                ? result.Columns
                : result.Rows[0]
                  ? Object.keys(result.Rows[0]).map((k) => ({ Name: k, DisplayName: k }))
                  : [];
        const calcCols = table.CalculatedColumns ?? [];
        const totalRowsNeeded = anchor.row + (includeHeaders ? 1 : 0) + result.Rows.length + 2;
        const totalColsNeeded = anchor.col + columns.length + calcCols.length + 1;
        this.ensureSheetCapacity(sheet, totalRowsNeeded, totalColsNeeded);

        let currentRow = anchor.row;
        if (includeHeaders) {
            for (let c = 0; c < columns.length; c++) {
                const colIdx = anchor.col + c;
                const addr = FormatCellAddress(currentRow, colIdx);
                const headerText = columns[c].DisplayName || columns[c].Name;
                sheet.Cells[addr] = {
                    RowID: sheet.Rows[currentRow - 1].RowID,
                    ColumnID: sheet.Columns[colIdx - 1].ColumnID,
                    Address: addr,
                    RawValue: headerText,
                    ComputedValue: headerText,
                    DisplayValue: headerText,
                    Style: { Bold: true }
                };
            }
            for (let cc = 0; cc < calcCols.length; cc++) {
                const colIdx = anchor.col + columns.length + cc;
                const addr = FormatCellAddress(currentRow, colIdx);
                const headerText = calcCols[cc].Header;
                sheet.Cells[addr] = {
                    RowID: sheet.Rows[currentRow - 1].RowID,
                    ColumnID: sheet.Columns[colIdx - 1].ColumnID,
                    Address: addr,
                    RawValue: headerText,
                    ComputedValue: headerText,
                    DisplayValue: headerText,
                    Style: { Bold: true }
                };
            }
            currentRow++;
        }

        for (let r = 0; r < result.Rows.length; r++) {
            const rowData = result.Rows[r];
            const sheetRowNum = currentRow + r;
            for (let c = 0; c < columns.length; c++) {
                const colIdx = anchor.col + c;
                const addr = FormatCellAddress(sheetRowNum, colIdx);
                const fieldVal = this.toCellScalar(rowData[columns[c].Name]);
                sheet.Cells[addr] = {
                    RowID: sheet.Rows[sheetRowNum - 1].RowID,
                    ColumnID: sheet.Columns[colIdx - 1].ColumnID,
                    Address: addr,
                    RawValue: fieldVal,
                    ComputedValue: fieldVal,
                    DisplayValue: this.FormatCellValue(fieldVal)
                };
            }

            // Fill down calculated formula columns (§ 6.3)
            for (let cc = 0; cc < calcCols.length; cc++) {
                const calcCol = calcCols[cc];
                const colIdx = anchor.col + columns.length + cc;
                const addr = FormatCellAddress(sheetRowNum, colIdx);
                const expandedFormula = calcCol.FormulaTemplate.replace(/\{ROW\}/gi, () => String(sheetRowNum));
                const normalizedFormula = expandedFormula.trim().startsWith('=')
                    ? expandedFormula.trim()
                    : `=${expandedFormula.trim()}`;
                const formulaStable = this.CompileFormulaToStableIds(sheet, normalizedFormula);
                sheet.Cells[addr] = {
                    RowID: sheet.Rows[sheetRowNum - 1].RowID,
                    ColumnID: sheet.Columns[colIdx - 1].ColumnID,
                    Address: addr,
                    RawValue: null,
                    Formula: normalizedFormula,
                    FormulaStable: formulaStable,
                    Style: {
                        FormatType: calcCol.FormatType,
                        NumberFormatPattern:
                            calcCol.NumberFormatPattern ?? this.DefaultPatternForFormatType(calcCol.FormatType)
                    }
                };
            }
        }
    }

    /**
     * Explicitly freezes a live table into a static snapshot (`O5`), requiring
     * `acknowledgeSecurityWarning === true` because frozen rows become visible to all readers.
     */
    public FreezeLiveTable(
        workbook: WorkbookSpec,
        sheetIdOrName: string,
        tableId: string,
        executionResult: DocumentBlockExecutionResult,
        freezingUser: Pick<UserInfo, 'ID' | 'Name'>,
        acknowledgeSecurityWarning: boolean
    ): SpreadsheetLiveTableSpec {
        if (!acknowledgeSecurityWarning) {
            throw new Error(
                'Freezing a live table requires explicit security warning acknowledgment (acknowledgeSecurityWarning: true).'
            );
        }
        const sheet = this.GetWorksheet(workbook, sheetIdOrName);
        if (!sheet) {
            throw new Error(`Worksheet '${sheetIdOrName}' not found.`);
        }
        const table = sheet.LiveTables.find((t) => t.TableID === tableId);
        if (!table) {
            throw new Error(`Live table '${tableId}' not found on worksheet '${sheet.Name}'.`);
        }
        table.Mode = 'Frozen';
        table.FrozenSnapshot = {
            FrozenAt: new Date().toISOString(),
            FrozenByUserID: freezingUser.ID,
            FrozenByUserName: freezingUser.Name || freezingUser.ID,
            Columns: executionResult.Columns,
            Rows: executionResult.Rows,
            TotalRowCount: executionResult.TotalRowCount,
            SecurityWarningAcknowledged: true
        };
        workbook.UpdatedAt = new Date().toISOString();
        return table;
    }

    /**
     * Unfreezes a frozen table back to `'Live'` viewer-scoped mode.
     */
    public UnfreezeLiveTable(
        workbook: WorkbookSpec,
        sheetIdOrName: string,
        tableId: string
    ): SpreadsheetLiveTableSpec {
        const sheet = this.GetWorksheet(workbook, sheetIdOrName);
        if (!sheet) {
            throw new Error(`Worksheet '${sheetIdOrName}' not found.`);
        }
        const table = sheet.LiveTables.find((t) => t.TableID === tableId);
        if (!table) {
            throw new Error(`Live table '${tableId}' not found on worksheet '${sheet.Name}'.`);
        }
        table.Mode = 'Live';
        table.FrozenSnapshot = null;
        workbook.UpdatedAt = new Date().toISOString();
        return table;
    }

    // -----------------------------------------------------------------------
    // Range Charts & Cross-Artifact Sheet-to-Slide / Sheet-to-Doc Extraction (§ 6.3, Accept #5)
    // -----------------------------------------------------------------------

    /**
     * Extracts a live {@link SpreadsheetChartDataset} from a chart spec (or ad-hoc range) on `workbook`.
     * Always evaluates the workbook first so formula cells in the chart range reflect latest values (`Accept #5`).
     */
    public ExtractChartDataset(
        workbook: WorkbookSpec,
        sheetIdOrName: string,
        chartIdOrRange: string
    ): SpreadsheetChartDataset | null {
        this.EvaluateWorkbook(workbook);
        const sheet = this.GetWorksheet(workbook, sheetIdOrName) ?? workbook.Worksheets[0];
        if (!sheet) return null;

        const existingChart = sheet.Charts.find((c) => c.ChartID === chartIdOrRange);
        const sourceRange = existingChart ? existingChart.SourceRange : chartIdOrRange;
        const bounds = ParseRangeAddress(sourceRange);
        if (!bounds) return null;

        const grid = this.ReadRange(workbook, sheet.SheetID, sourceRange);
        if (grid.length === 0 || grid[0].length === 0) return null;

        // Determine if row 0 is headers
        const firstRow = grid[0];
        const hasHeaderRow =
            grid.length > 1 &&
            firstRow.slice(1).some((cell) => typeof (cell.ComputedValue ?? cell.RawValue) === 'string');

        const dataRows = hasHeaderRow ? grid.slice(1) : grid;
        const categories: string[] = dataRows.map((r, idx) => {
            const v = r[0]?.ComputedValue ?? r[0]?.RawValue;
            return v !== null && v !== undefined && String(v).trim() !== '' ? String(v) : `Row ${idx + 1}`;
        });

        const series: Array<{ Name: string; Values: number[] }> = [];
        const colCount = firstRow.length;
        for (let c = 1; c < colCount; c++) {
            const headerCell = firstRow[c];
            const sName = hasHeaderRow
                ? String(headerCell?.ComputedValue ?? headerCell?.RawValue ?? `Series ${c}`)
                : `Series ${c}`;
            const vals = dataRows.map((r) => {
                const raw = r[c]?.ComputedValue ?? r[c]?.RawValue;
                const num = Number(raw);
                return Number.isNaN(num) ? 0 : num;
            });
            series.push({ Name: sName, Values: vals });
        }

        // If only 1 column was selected, treat that column as values
        if (colCount === 1) {
            series.push({
                Name: hasHeaderRow ? String(firstRow[0]?.ComputedValue ?? 'Value') : 'Value',
                Values: dataRows.map((r) => Number(r[0]?.ComputedValue ?? r[0]?.RawValue) || 0)
            });
        }

        const categoryColName = hasHeaderRow
            ? String(firstRow[0]?.ComputedValue ?? firstRow[0]?.RawValue ?? 'Category')
            : 'Category';
        const columns: DocumentBlockColumn[] = [
            { Name: categoryColName, DisplayName: categoryColName, Type: 'string' },
            ...series.map((s) => ({ Name: s.Name, DisplayName: s.Name, Type: 'number' }))
        ];
        const rows: Array<Record<string, unknown>> = categories.map((cat, rIdx) => {
            const rowObj: Record<string, unknown> = { [categoryColName]: cat };
            for (const s of series) {
                rowObj[s.Name] = s.Values[rIdx] ?? 0;
            }
            return rowObj;
        });

        return {
            ChartID: existingChart?.ChartID ?? `range-${sourceRange}`,
            Title: existingChart?.Title ?? `${sheet.Name} (${sourceRange})`,
            ChartType: existingChart?.ChartType ?? 'bar',
            SheetID: sheet.SheetID,
            SourceRange: sourceRange,
            Categories: categories,
            Series: series,
            Columns: columns,
            Rows: rows,
            RevisionHash: this.ComputeRevisionHash(workbook)
        };
    }

    // -----------------------------------------------------------------------
    // Sort & Filter Evaluation (§ 6.3)
    // -----------------------------------------------------------------------

    /**
     * Sorts the data rows of `sheetIdOrName` in-place by `sortSpec.ColumnLetter` while preserving
     * each row's stable `RowID` so formulas referencing those rows update cleanly (`§ 6.2`, `§ 6.3`).
     */
    public SortWorksheet(
        workbook: WorkbookSpec,
        sheetIdOrName: string,
        sortSpec: SpreadsheetSortSpec
    ): void {
        const sheet = this.GetWorksheet(workbook, sheetIdOrName);
        if (!sheet) return;
        sheet.SortSpec = sortSpec;
        const headerRows = Math.max(0, sortSpec.HeaderRows ?? 1);
        const colIdx = ColumnLetterToIndex(sortSpec.ColumnLetter);
        const targetColId = sheet.Columns[colIdx - 1]?.ColumnID;
        if (!targetColId) return;

        // Build map of (RowID, ColumnID) -> Cell for fast lookup
        const cellByRowId = new Map<string, SpreadsheetCellValue>();
        for (const cell of Object.values(sheet.Cells)) {
            if (cell.ColumnID === targetColId) {
                cellByRowId.set(cell.RowID, cell.ComputedValue ?? cell.RawValue ?? null);
            }
        }

        // Only sort populated rows (up to the last row containing any cell)
        let lastPopulatedRowIndex = headerRows;
        for (const cell of Object.values(sheet.Cells)) {
            const pos = ParseCellAddress(cell.Address);
            if (pos && pos.row > lastPopulatedRowIndex) {
                lastPopulatedRowIndex = pos.row;
            }
        }
        if (lastPopulatedRowIndex <= headerRows + 1) return;

        const fixedTop = sheet.Rows.slice(0, headerRows);
        const sortable = sheet.Rows.slice(headerRows, lastPopulatedRowIndex);
        const trailingEmpty = sheet.Rows.slice(lastPopulatedRowIndex);

        const dir = sortSpec.Direction === 'desc' ? -1 : 1;
        sortable.sort((rA, rB) => {
            const vA = cellByRowId.get(rA.RowID) ?? null;
            const vB = cellByRowId.get(rB.RowID) ?? null;
            if (vA === null && vB === null) return 0;
            if (vA === null) return 1;
            if (vB === null) return -1;
            if (typeof vA === 'number' && typeof vB === 'number') {
                return (vA - vB) * dir;
            }
            return String(vA).localeCompare(String(vB)) * dir;
        });

        sheet.Rows = [...fixedTop, ...sortable, ...trailingEmpty];
        this.reindexSheetStructureAndFormulas(sheet);
        this.EvaluateWorkbook(workbook);
    }

    /**
     * Applies `sheet.FilterSpecs` to mark non-matching data rows as `Hidden = true` (`§ 6.3`).
     */
    public ApplyWorksheetFilters(workbook: WorkbookSpec, sheetIdOrName: string): void {
        const sheet = this.GetWorksheet(workbook, sheetIdOrName);
        if (!sheet) return;
        const filters = sheet.FilterSpecs ?? [];
        if (filters.length === 0) {
            for (const row of sheet.Rows) {
                row.Hidden = false;
            }
            return;
        }
        const headerRows = Math.max(0, filters[0]?.HeaderRows ?? 1);
        for (let rIdx = 0; rIdx < sheet.Rows.length; rIdx++) {
            const row = sheet.Rows[rIdx];
            if (rIdx < headerRows) {
                row.Hidden = false;
                continue;
            }
            let matchesAll = true;
            for (const f of filters) {
                const colNum = ColumnLetterToIndex(f.ColumnLetter);
                const addr = FormatCellAddress(rIdx + 1, colNum);
                const cell = sheet.Cells[addr];
                const val = cell ? (cell.ComputedValue ?? cell.RawValue) : null;
                const strVal = val === null || val === undefined ? '' : String(val);

                switch (f.Operator) {
                    case 'notEmpty':
                        if (strVal.trim() === '') matchesAll = false;
                        break;
                    case 'equals':
                        if (strVal.toLowerCase() !== f.Value.trim().toLowerCase()) matchesAll = false;
                        break;
                    case 'contains':
                        if (!strVal.toLowerCase().includes(f.Value.trim().toLowerCase())) matchesAll = false;
                        break;
                    case 'gt':
                        if (Number.isNaN(Number(val)) || Number(val) <= Number(f.Value)) matchesAll = false;
                        break;
                    case 'lt':
                        if (Number.isNaN(Number(val)) || Number(val) >= Number(f.Value)) matchesAll = false;
                        break;
                }
                if (!matchesAll) break;
            }
            row.Hidden = !matchesAll;
        }
    }

    // -----------------------------------------------------------------------
    // CSV Import & Export (§ 6.3)
    // -----------------------------------------------------------------------

    /**
     * Imports a CSV string into a single-tab {@link WorkbookSpec}, inferring numeric/boolean values
     * and formulas (`=...`).
     */
    public ImportFromCsv(csvText: string, sheetName = 'Sheet 1', workbookTitle = 'Imported CSV'): WorkbookSpec {
        const lines = this.parseCsvRows(csvText);
        const rowCount = Math.max(DEFAULT_ROW_COUNT, lines.length + 5);
        const maxCols = lines.reduce((acc, r) => Math.max(acc, r.length), 0);
        const colCount = Math.max(DEFAULT_COLUMN_COUNT, maxCols + 2);

        const wb = this.CreateEmptyWorkbook(workbookTitle, [sheetName], rowCount, colCount);
        const ws = wb.Worksheets[0];

        for (let r = 0; r < lines.length; r++) {
            const rowVals = lines[r];
            for (let c = 0; c < rowVals.length; c++) {
                const rawToken = rowVals[c];
                if (rawToken === '') continue;
                const addr = FormatCellAddress(r + 1, c + 1);
                if (rawToken.startsWith('=')) {
                    this.SetCell(wb, ws.SheetID, addr, { Formula: rawToken }, false);
                } else {
                    const coerced = this.coerceCsvScalar(rawToken);
                    this.SetCell(
                        wb,
                        ws.SheetID,
                        addr,
                        {
                            Value: coerced,
                            Style: r === 0 ? { Bold: true } : undefined
                        },
                        false
                    );
                }
            }
        }
        this.EvaluateWorkbook(wb);
        return wb;
    }

    /**
     * Exports a worksheet of `workbook` to RFC 4180 CSV format (using computed values).
     */
    public ExportToCsv(workbook: WorkbookSpec, sheetIdOrName?: string): string {
        this.EvaluateWorkbook(workbook);
        const sheet = sheetIdOrName
            ? this.GetWorksheet(workbook, sheetIdOrName)
            : this.GetWorksheet(workbook, workbook.ActiveSheetID) ?? workbook.Worksheets[0];
        if (!sheet) return '';

        let maxRow = 0;
        let maxCol = 0;
        for (const cell of Object.values(sheet.Cells)) {
            const pos = ParseCellAddress(cell.Address);
            if (!pos) continue;
            const val = cell.ComputedValue ?? cell.RawValue;
            if (val !== null && val !== undefined && String(val) !== '') {
                if (pos.row > maxRow) maxRow = pos.row;
                if (pos.col > maxCol) maxCol = pos.col;
            }
        }
        if (maxRow === 0 || maxCol === 0) return '';

        const outLines: string[] = [];
        for (let r = 1; r <= maxRow; r++) {
            const rowTokens: string[] = [];
            for (let c = 1; c <= maxCol; c++) {
                const addr = FormatCellAddress(r, c);
                const cell = sheet.Cells[addr];
                const val = cell ? (cell.ComputedValue ?? cell.RawValue) : null;
                const text = val === null || val === undefined ? '' : String(val);
                if (text.includes(',') || text.includes('"') || text.includes('\n') || text.includes('\r')) {
                    rowTokens.push(`"${text.replace(/"/g, '""')}"`);
                } else {
                    rowTokens.push(text);
                }
            }
            outLines.push(rowTokens.join(','));
        }
        return outLines.join('\n');
    }

    private parseCsvRows(csvText: string): string[][] {
        const rows: string[][] = [];
        let currentRow: string[] = [];
        let currentField = '';
        let inQuotes = false;

        for (let i = 0; i < csvText.length; i++) {
            const ch = csvText[i];
            if (inQuotes) {
                if (ch === '"') {
                    if (csvText[i + 1] === '"') {
                        currentField += '"';
                        i++;
                    } else {
                        inQuotes = false;
                    }
                } else {
                    currentField += ch;
                }
            } else {
                if (ch === '"') {
                    inQuotes = true;
                } else if (ch === ',') {
                    currentRow.push(currentField);
                    currentField = '';
                } else if (ch === '\r') {
                    if (csvText[i + 1] === '\n') i++;
                    currentRow.push(currentField);
                    rows.push(currentRow);
                    currentRow = [];
                    currentField = '';
                } else if (ch === '\n') {
                    currentRow.push(currentField);
                    rows.push(currentRow);
                    currentRow = [];
                    currentField = '';
                } else {
                    currentField += ch;
                }
            }
        }
        if (currentField.length > 0 || currentRow.length > 0) {
            currentRow.push(currentField);
            rows.push(currentRow);
        }
        return rows;
    }

    private coerceCsvScalar(token: string): SpreadsheetCellValue {
        const trimmed = token.trim();
        if (trimmed === '') return null;
        if (trimmed.toUpperCase() === 'TRUE') return true;
        if (trimmed.toUpperCase() === 'FALSE') return false;
        if (/^[+-]?(\d+\.?\d*|\.\d+)$/.test(trimmed)) {
            return Number(trimmed);
        }
        return token;
    }

    // -----------------------------------------------------------------------
    // OpenXML .xlsx Export & Import (§ 6.2, § 6.3, Accept #4)
    // -----------------------------------------------------------------------

    /**
     * Exports `workbook` to a standards-compliant OpenXML `.xlsx` binary (`Uint8Array`)
     * that opens cleanly in Microsoft Excel, Apple Numbers, LibreOffice, and `exceljs` (`Accept #4`).
     *
     * Preserves:
     * - Multiple worksheet tabs
     * - Cell values (`n`, `b`, `inlineStr`, `str`)
     * - Standard Excel formulas (`<f>SUM(B2:B9)</f>`) with pre-evaluated `<v>` results
     *   (while freezing `=MJ.QUERY`/`=MJ.VIEW` cells to their computed scalar values so Excel never shows `#NAME?`)
     * - Number formats (`numFmt`: currency `$#,##0.00`, percent `0.0%`, integer `#,##0`, date `yyyy-mm-dd`)
     * - Bold styles and custom column widths (`<col min="..." max="..." width="..." customWidth="1"/>`)
     * - Frozen panes (`<pane ySplit="..." xSplit="..." state="frozen"/>`)
     * - Hidden `_mj_sheets_meta` worksheet holding the chunked `WorkbookSpec` JSON for lossless round-tripping
     */
    public ExportToXlsxBytes(workbook: WorkbookSpec, includeMjMetadataSheet = true): Uint8Array {
        this.EvaluateWorkbook(workbook);

        // Build custom numFmt + xf style table
        const numFmts: Array<{ Id: number; FormatCode: string }> = [];
        const numFmtIdByPattern = new Map<string, number>();
        let nextNumFmtId = 164;

        interface XfStyleEntry {
            NumFmtId: number;
            FontId: number;
        }
        // Index 0 = default general, Index 1 = bold general
        const cellXfs: XfStyleEntry[] = [
            { NumFmtId: 0, FontId: 0 },
            { NumFmtId: 0, FontId: 1 }
        ];
        const xfIndexByKey = new Map<string, number>([
            ['0:0', 0],
            ['0:1', 1]
        ]);

        const getStyleIndex = (style?: SpreadsheetCellStyleSpec): number => {
            if (!style) return 0;
            const pattern = style.NumberFormatPattern ?? this.DefaultPatternForFormatType(style.FormatType);
            let numFmtId = 0;
            if (pattern) {
                const existingId = numFmtIdByPattern.get(pattern);
                if (existingId !== undefined) {
                    numFmtId = existingId;
                } else {
                    numFmtId = nextNumFmtId++;
                    numFmtIdByPattern.set(pattern, numFmtId);
                    numFmts.push({ Id: numFmtId, FormatCode: pattern });
                }
            }
            const fontId = style.Bold ? 1 : 0;
            const key = `${numFmtId}:${fontId}`;
            const existingXf = xfIndexByKey.get(key);
            if (existingXf !== undefined) return existingXf;
            const newIdx = cellXfs.length;
            cellXfs.push({ NumFmtId: numFmtId, FontId: fontId });
            xfIndexByKey.set(key, newIdx);
            return newIdx;
        };

        const zipEntries: Array<{ Name: string; Data: Uint8Array }> = [];
        const sheetDefs: Array<{ Name: string; SheetId: number; RelId: string; Path: string; Hidden: boolean }> = [];

        workbook.Worksheets.forEach((ws, idx) => {
            const sheetNum = idx + 1;
            const relId = `rId${sheetNum}`;
            const path = `xl/worksheets/sheet${sheetNum}.xml`;
            sheetDefs.push({
                Name: ws.Name.slice(0, 31) || `Sheet ${sheetNum}`,
                SheetId: sheetNum,
                RelId: relId,
                Path: path,
                Hidden: false
            });
            const xml = this.buildWorksheetXml(ws, getStyleIndex);
            zipEntries.push({ Name: path, Data: this.encodeUtf8(xml) });
        });

        if (includeMjMetadataSheet) {
            const metaSheetNum = sheetDefs.length + 1;
            const metaRelId = `rId${metaSheetNum}`;
            const metaPath = `xl/worksheets/sheet${metaSheetNum}.xml`;
            sheetDefs.push({
                Name: HIDDEN_META_SHEET_NAME,
                SheetId: metaSheetNum,
                RelId: metaRelId,
                Path: metaPath,
                Hidden: true
            });
            const metaXml = this.buildHiddenMetadataSheetXml(workbook);
            zipEntries.push({ Name: metaPath, Data: this.encodeUtf8(metaXml) });
        }

        const stylesRelId = `rId${sheetDefs.length + 1}`;
        zipEntries.unshift(
            { Name: '[Content_Types].xml', Data: this.encodeUtf8(this.buildContentTypesXml(sheetDefs.length)) },
            { Name: '_rels/.rels', Data: this.encodeUtf8(this.buildRootRelsXml()) },
            { Name: 'xl/workbook.xml', Data: this.encodeUtf8(this.buildWorkbookXml(sheetDefs)) },
            {
                Name: 'xl/_rels/workbook.xml.rels',
                Data: this.encodeUtf8(this.buildWorkbookRelsXml(sheetDefs, stylesRelId))
            },
            { Name: 'xl/styles.xml', Data: this.encodeUtf8(this.buildStylesXml(numFmts, cellXfs)) }
        );

        return this.buildZipArchive(zipEntries);
    }

    /**
     * Imports an OpenXML `.xlsx` binary (`Uint8Array` or `ArrayBuffer`) into a {@link WorkbookSpec},
     * preserving worksheets, cell values, formulas (`<f>`), number/currency/percent/date formats (`numFmt`),
     * column widths, frozen panes, and any MJ metadata (`_mj_sheets_meta` or `configuration`) (`Accept #4`).
     */
    public ImportFromXlsxBytes(
        bytes: Uint8Array | ArrayBuffer,
        configurationJson?: string | null
    ): WorkbookSpec {
        const u8 = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
        const files = this.extractZipArchive(u8);

        // Parse sharedStrings.xml if present
        const sharedStrings: string[] = [];
        const ssBytes = files.get('xl/sharedStrings.xml');
        if (ssBytes) {
            const ssXml = this.decodeUtf8(ssBytes);
            const siRegex = /<si\b[^>]*>([\s\S]*?)<\/si>/g;
            let siMatch: RegExpExecArray | null;
            while ((siMatch = siRegex.exec(ssXml)) !== null) {
                const inner = siMatch[1];
                const tParts: string[] = [];
                const tRegex = /<t(?:\s+[^>]*)?>([\s\S]*?)<\/t>/g;
                let tMatch: RegExpExecArray | null;
                while ((tMatch = tRegex.exec(inner)) !== null) {
                    tParts.push(this.unescapeXml(tMatch[1]));
                }
                sharedStrings.push(tParts.join(''));
            }
        }

        // Parse styles.xml for numFmt and bold fonts
        const styleLookup = this.parseStylesXml(
            files.has('xl/styles.xml') ? this.decodeUtf8(files.get('xl/styles.xml')!) : ''
        );

        // Parse workbook.xml + workbook.xml.rels to map sheet names to worksheet XML paths
        const wbXml = files.has('xl/workbook.xml') ? this.decodeUtf8(files.get('xl/workbook.xml')!) : '';
        const wbRelsXml = files.has('xl/_rels/workbook.xml.rels')
            ? this.decodeUtf8(files.get('xl/_rels/workbook.xml.rels')!)
            : '';

        const targetByRelId = new Map<string, string>();
        const relRegex = /<Relationship\b[^>]*?>/g;
        let relMatch: RegExpExecArray | null;
        while ((relMatch = relRegex.exec(wbRelsXml)) !== null) {
            const tag = relMatch[0];
            const id = this.extractXmlAttr(tag, 'Id');
            const target = this.extractXmlAttr(tag, 'Target');
            if (id && target) {
                const cleanTarget = target.startsWith('/')
                    ? target.slice(1)
                    : target.startsWith('xl/')
                      ? target
                      : `xl/${target}`;
                targetByRelId.set(id, cleanTarget);
            }
        }

        interface SheetEntry {
            name: string;
            path: string;
            hidden: boolean;
        }
        const sheetEntries: SheetEntry[] = [];
        const sheetTagRegex = /<sheet\b[^>]*?>/g;
        let sheetMatch: RegExpExecArray | null;
        while ((sheetMatch = sheetTagRegex.exec(wbXml)) !== null) {
            const tag = sheetMatch[0];
            const name = this.unescapeXml(this.extractXmlAttr(tag, 'name') || 'Sheet');
            const rId = this.extractXmlAttr(tag, 'r:id') || this.extractXmlAttr(tag, 'id') || '';
            const state = this.extractXmlAttr(tag, 'state') || '';
            const path = targetByRelId.get(rId) || `xl/worksheets/sheet${sheetEntries.length + 1}.xml`;
            sheetEntries.push({
                name,
                path,
                hidden: state === 'hidden' || state === 'veryHidden'
            });
        }

        if (sheetEntries.length === 0) {
            for (const key of Array.from(files.keys()).sort()) {
                if (/^xl\/worksheets\/sheet\d+\.xml$/.test(key)) {
                    sheetEntries.push({
                        name: `Sheet ${sheetEntries.length + 1}`,
                        path: key,
                        hidden: false
                    });
                }
            }
        }

        let embeddedMetaJson: string | null = null;
        const worksheets: WorksheetSpec[] = [];

        for (let idx = 0; idx < sheetEntries.length; idx++) {
            const entry = sheetEntries[idx];
            const wsBytes = files.get(entry.path);
            if (!wsBytes) continue;
            const wsXml = this.decodeUtf8(wsBytes);

            if (entry.name === HIDDEN_META_SHEET_NAME) {
                embeddedMetaJson = this.extractMetadataFromHiddenSheetXml(wsXml, sharedStrings);
                continue;
            }

            const ws = this.parseWorksheetXml(
                wsXml,
                `sheet-${worksheets.length + 1}`,
                entry.name,
                sharedStrings,
                styleLookup
            );
            worksheets.push(ws);
        }

        // If MJ metadata was stored in Configuration or _mj_sheets_meta, merge its MJ-specific extensions
        // (stable RowIDs/ColumnIDs, LiveTables, Charts, EmbeddedArtifacts, NamedRanges) onto the parsed sheets
        const metaCandidate = configurationJson || embeddedMetaJson;
        let metaWorkbook: Partial<WorkbookSpec> | null = null;
        if (metaCandidate && metaCandidate.trim().startsWith('{')) {
            try {
                metaWorkbook = JSON.parse(metaCandidate) as Partial<WorkbookSpec>;
            } catch {
                metaWorkbook = null;
            }
        }

        const now = new Date().toISOString();
        const finalWorksheets =
            worksheets.length > 0 ? worksheets : [this.CreateEmptyWorksheet('sheet-1', 'Sheet 1')];

        if (metaWorkbook && Array.isArray(metaWorkbook.Worksheets)) {
            for (let i = 0; i < finalWorksheets.length; i++) {
                const ws = finalWorksheets[i];
                const metaWs =
                    metaWorkbook.Worksheets.find((m) => m.Name === ws.Name || m.SheetID === ws.SheetID) ??
                    metaWorkbook.Worksheets[i];
                if (metaWs) {
                    ws.SheetID = metaWs.SheetID || ws.SheetID;
                    ws.LiveTables = Array.isArray(metaWs.LiveTables) ? metaWs.LiveTables : ws.LiveTables;
                    ws.Charts = Array.isArray(metaWs.Charts) ? metaWs.Charts : ws.Charts;
                    ws.EmbeddedArtifacts = Array.isArray(metaWs.EmbeddedArtifacts)
                        ? metaWs.EmbeddedArtifacts
                        : ws.EmbeddedArtifacts;
                    ws.ValidationRules = Array.isArray(metaWs.ValidationRules)
                        ? metaWs.ValidationRules
                        : ws.ValidationRules;
                    ws.ConditionalFormats = Array.isArray(metaWs.ConditionalFormats)
                        ? metaWs.ConditionalFormats
                        : ws.ConditionalFormats;
                    // Restore any =MJ.QUERY / =MJ.VIEW formulas preserved in metaWs
                    if (metaWs.Cells) {
                        for (const [addr, metaCell] of Object.entries(metaWs.Cells)) {
                            if (metaCell?.Formula && this.ParseMjCustomFunctionFormula(metaCell.Formula)) {
                                const targetCell = ws.Cells[addr];
                                if (targetCell) {
                                    targetCell.Formula = metaCell.Formula;
                                    targetCell.FormulaStable =
                                        metaCell.FormulaStable ??
                                        this.CompileFormulaToStableIds(ws, metaCell.Formula);
                                }
                            }
                        }
                    }
                }
            }
        }

        const wb: WorkbookSpec = {
            WorkbookID: metaWorkbook?.WorkbookID || `wb-${Date.now().toString(36)}`,
            Title: metaWorkbook?.Title || 'Imported Workbook',
            ActiveSheetID: finalWorksheets[0].SheetID,
            Worksheets: finalWorksheets,
            NamedRanges: Array.isArray(metaWorkbook?.NamedRanges) ? metaWorkbook!.NamedRanges! : [],
            CreatedAt: metaWorkbook?.CreatedAt || now,
            UpdatedAt: now
        };

        this.EvaluateWorkbook(wb);
        return wb;
    }

    // -----------------------------------------------------------------------
    // OpenXML Worksheet & Styles Builders / Parsers
    // -----------------------------------------------------------------------

    private buildWorksheetXml(
        ws: WorksheetSpec,
        getStyleIndex: (style?: SpreadsheetCellStyleSpec) => number
    ): string {
        let maxRow = 1;
        let maxCol = 1;
        for (const cell of Object.values(ws.Cells)) {
            const pos = ParseCellAddress(cell.Address);
            if (pos) {
                if (pos.row > maxRow) maxRow = pos.row;
                if (pos.col > maxCol) maxCol = pos.col;
            }
        }

        const colsXmlParts: string[] = [];
        for (const col of ws.Columns) {
            if (col.Width && col.Width !== DEFAULT_COLUMN_WIDTH) {
                colsXmlParts.push(
                    `<col min="${col.Index}" max="${col.Index}" width="${col.Width}" customWidth="1"/>`
                );
            }
        }
        const colsSection = colsXmlParts.length > 0 ? `<cols>${colsXmlParts.join('')}</cols>` : '';

        const sheetViewsXml =
            ws.FrozenRows > 0 || ws.FrozenColumns > 0
                ? `<sheetViews><sheetView workbookViewId="0"><pane ${
                      ws.FrozenColumns > 0 ? `xSplit="${ws.FrozenColumns}" ` : ''
                  }${
                      ws.FrozenRows > 0 ? `ySplit="${ws.FrozenRows}" ` : ''
                  }topLeftCell="${FormatCellAddress(ws.FrozenRows + 1, ws.FrozenColumns + 1)}" activePane="bottomRight" state="frozen"/></sheetView></sheetViews>`
                : '<sheetViews><sheetView workbookViewId="0"/></sheetViews>';

        // Group cells by row number
        const cellsByRow = new Map<number, SpreadsheetCellSpec[]>();
        for (const cell of Object.values(ws.Cells)) {
            const pos = ParseCellAddress(cell.Address);
            if (!pos) continue;
            const list = cellsByRow.get(pos.row) ?? [];
            list.push(cell);
            cellsByRow.set(pos.row, list);
        }

        const rowNums = Array.from(cellsByRow.keys()).sort((a, b) => a - b);
        const rowsXmlParts: string[] = [];

        for (const rNum of rowNums) {
            const rowCells = (cellsByRow.get(rNum) ?? []).sort((a, b) => {
                const pA = ParseCellAddress(a.Address);
                const pB = ParseCellAddress(b.Address);
                return (pA?.col ?? 0) - (pB?.col ?? 0);
            });
            const cellTags: string[] = [];
            for (const cell of rowCells) {
                const sIdx = getStyleIndex(cell.Style);
                const sAttr = sIdx > 0 ? ` s="${sIdx}"` : '';
                const val = cell.ComputedValue ?? cell.RawValue;
                const hasStandardFormula =
                    cell.Formula &&
                    cell.Formula.trim().startsWith('=') &&
                    !this.ParseMjCustomFunctionFormula(cell.Formula);
                const formulaXml = hasStandardFormula
                    ? `<f>${this.escapeXml(cell.Formula!.trim().slice(1))}</f>`
                    : '';

                if (typeof val === 'number' && !Number.isNaN(val)) {
                    cellTags.push(`<c r="${cell.Address}"${sAttr} t="n">${formulaXml}<v>${val}</v></c>`);
                } else if (typeof val === 'boolean') {
                    cellTags.push(`<c r="${cell.Address}"${sAttr} t="b">${formulaXml}<v>${val ? 1 : 0}</v></c>`);
                } else if (val !== null && val !== undefined && String(val) !== '') {
                    if (formulaXml) {
                        cellTags.push(
                            `<c r="${cell.Address}"${sAttr} t="str">${formulaXml}<v>${this.escapeXml(String(val))}</v></c>`
                        );
                    } else {
                        cellTags.push(
                            `<c r="${cell.Address}"${sAttr} t="inlineStr"><is><t xml:space="preserve">${this.escapeXml(String(val))}</t></is></c>`
                        );
                    }
                } else if (formulaXml) {
                    cellTags.push(`<c r="${cell.Address}"${sAttr}>${formulaXml}</c>`);
                }
            }
            if (cellTags.length > 0) {
                rowsXmlParts.push(`<row r="${rNum}">${cellTags.join('')}</row>`);
            }
        }

        const dimensionRef = `A1:${FormatCellAddress(maxRow, maxCol)}`;
        return [
            '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>',
            '<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">',
            `<dimension ref="${dimensionRef}"/>`,
            sheetViewsXml,
            '<sheetFormatPr defaultRowHeight="15"/>',
            colsSection,
            `<sheetData>${rowsXmlParts.join('')}</sheetData>`,
            '</worksheet>'
        ].join('');
    }

    private buildHiddenMetadataSheetXml(workbook: WorkbookSpec): string {
        const json = JSON.stringify(workbook);
        const chunks: string[] = [];
        for (let i = 0; i < json.length; i += META_CHUNK_SIZE) {
            chunks.push(json.slice(i, i + META_CHUNK_SIZE));
        }
        const rowsXml = chunks
            .map(
                (chunk, idx) =>
                    `<row r="${idx + 1}"><c r="A${idx + 1}" t="inlineStr"><is><t xml:space="preserve">${this.escapeXml(chunk)}</t></is></c></row>`
            )
            .join('');
        return [
            '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>',
            '<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">',
            `<sheetData>${rowsXml}</sheetData>`,
            '</worksheet>'
        ].join('');
    }

    private extractMetadataFromHiddenSheetXml(wsXml: string, sharedStrings: string[]): string | null {
        const chunks: string[] = [];
        const cRegex = /<c\b([^>]*)>([\s\S]*?)<\/c>/g;
        let match: RegExpExecArray | null;
        while ((match = cRegex.exec(wsXml)) !== null) {
            const attrs = match[1];
            const inner = match[2];
            const t = this.extractXmlAttr(attrs, 't');
            if (t === 's') {
                const vMatch = /<v>(\d+)<\/v>/.exec(inner);
                if (vMatch) {
                    chunks.push(sharedStrings[parseInt(vMatch[1], 10)] ?? '');
                }
            } else {
                const tMatch = /<t(?:\s+[^>]*)?>([\s\S]*?)<\/t>/.exec(inner);
                if (tMatch) {
                    chunks.push(this.unescapeXml(tMatch[1]));
                }
            }
        }
        const combined = chunks.join('').trim();
        return combined.startsWith('{') ? combined : null;
    }

    private parseWorksheetXml(
        wsXml: string,
        sheetId: string,
        sheetName: string,
        sharedStrings: string[],
        styleLookup: Array<{ FormatPattern?: string; Bold?: boolean }>
    ): WorksheetSpec {
        const ws = this.CreateEmptyWorksheet(sheetId, sheetName);

        // Parse frozen panes if present
        const paneMatch = /<pane\b([^>]*?)\/?>/.exec(wsXml);
        if (paneMatch) {
            const ySplit = this.extractXmlAttr(paneMatch[1], 'ySplit');
            const xSplit = this.extractXmlAttr(paneMatch[1], 'xSplit');
            if (ySplit) ws.FrozenRows = parseInt(ySplit, 10) || 0;
            if (xSplit) ws.FrozenColumns = parseInt(xSplit, 10) || 0;
        }

        // Parse column widths
        const colRegex = /<col\b([^>]*?)\/?>/g;
        let colMatch: RegExpExecArray | null;
        while ((colMatch = colRegex.exec(wsXml)) !== null) {
            const attrs = colMatch[1];
            const min = parseInt(this.extractXmlAttr(attrs, 'min') || '0', 10);
            const max = parseInt(this.extractXmlAttr(attrs, 'max') || '0', 10);
            const width = parseFloat(this.extractXmlAttr(attrs, 'width') || '0');
            if (min > 0 && max >= min && width > 0) {
                this.ensureSheetCapacity(ws, 1, max);
                for (let c = min; c <= max; c++) {
                    ws.Columns[c - 1].Width = Number(width.toFixed(2));
                }
            }
        }

        // Parse cells
        const cellRegex = /<c\b([^>]*?)(?:\/>|>([\s\S]*?)<\/c>)/g;
        let cellMatch: RegExpExecArray | null;
        while ((cellMatch = cellRegex.exec(wsXml)) !== null) {
            const attrs = cellMatch[1];
            const inner = cellMatch[2] || '';
            const addr = this.extractXmlAttr(attrs, 'r');
            if (!addr) continue;
            const parsedPos = ParseCellAddress(addr);
            if (!parsedPos) continue;
            this.ensureSheetCapacity(ws, parsedPos.row, parsedPos.col);

            const tAttr = this.extractXmlAttr(attrs, 't') || '';
            const sAttr = this.extractXmlAttr(attrs, 's');
            const styleIdx = sAttr ? parseInt(sAttr, 10) : 0;
            const styleInfo = styleLookup[styleIdx];

            const fMatch = /<f(?:\s+[^>]*)?>([\s\S]*?)<\/f>/.exec(inner);
            const vMatch = /<v>([\s\S]*?)<\/v>/.exec(inner);
            const isTMatch = /<is>[\s\S]*?<t(?:\s+[^>]*)?>([\s\S]*?)<\/t>[\s\S]*?<\/is>/.exec(inner);

            let rawVal: SpreadsheetCellValue = null;
            if (tAttr === 's' && vMatch) {
                const ssIdx = parseInt(vMatch[1].trim(), 10);
                rawVal = sharedStrings[ssIdx] ?? '';
            } else if (tAttr === 'inlineStr' && isTMatch) {
                rawVal = this.unescapeXml(isTMatch[1]);
            } else if (tAttr === 'b' && vMatch) {
                rawVal = vMatch[1].trim() === '1' || vMatch[1].trim().toLowerCase() === 'true';
            } else if ((tAttr === 'str' || tAttr === 'e') && vMatch) {
                rawVal = this.unescapeXml(vMatch[1]);
            } else if (vMatch) {
                const vText = this.unescapeXml(vMatch[1].trim());
                const num = Number(vText);
                rawVal = vText !== '' && !Number.isNaN(num) ? num : vText;
            } else if (isTMatch) {
                rawVal = this.unescapeXml(isTMatch[1]);
            }

            let formula: string | null = null;
            let formulaStable: string | null = null;
            if (fMatch && fMatch[1].trim().length > 0) {
                const fBody = this.unescapeXml(fMatch[1].trim());
                formula = fBody.startsWith('=') ? fBody : `=${fBody}`;
                formulaStable = this.CompileFormulaToStableIds(ws, formula);
            }

            let cellStyle: SpreadsheetCellStyleSpec | undefined;
            if (styleInfo && (styleInfo.FormatPattern || styleInfo.Bold)) {
                cellStyle = {
                    Bold: styleInfo.Bold,
                    NumberFormatPattern: styleInfo.FormatPattern,
                    FormatType: this.InferFormatTypeFromPattern(styleInfo.FormatPattern)
                };
            }

            const canonicalAddr = FormatCellAddress(parsedPos.row, parsedPos.col);
            ws.Cells[canonicalAddr] = {
                RowID: ws.Rows[parsedPos.row - 1].RowID,
                ColumnID: ws.Columns[parsedPos.col - 1].ColumnID,
                Address: canonicalAddr,
                RawValue: formula ? null : rawVal,
                Formula: formula,
                FormulaStable: formulaStable,
                ComputedValue: rawVal,
                DisplayValue: this.FormatCellValue(rawVal, cellStyle),
                Style: cellStyle
            };
        }

        return ws;
    }

    private parseStylesXml(stylesXml: string): Array<{ FormatPattern?: string; Bold?: boolean }> {
        if (!stylesXml) return [{ FormatPattern: undefined, Bold: false }];

        const builtinFormats: Record<number, string> = {
            1: '0',
            2: '0.00',
            3: '#,##0',
            4: '#,##0.00',
            5: '$#,##0_);($#,##0)',
            7: '$#,##0.00_);($#,##0.00)',
            9: '0%',
            10: '0.00%',
            14: 'yyyy-mm-dd',
            22: 'yyyy-mm-dd hh:mm'
        };
        const formatById = new Map<number, string>(Object.entries(builtinFormats).map(([k, v]) => [Number(k), v]));

        const numFmtRegex = /<numFmt\b([^>]*?)\/?>/g;
        let nfMatch: RegExpExecArray | null;
        while ((nfMatch = numFmtRegex.exec(stylesXml)) !== null) {
            const idStr = this.extractXmlAttr(nfMatch[1], 'numFmtId');
            const code = this.extractXmlAttr(nfMatch[1], 'formatCode');
            if (idStr && code) {
                formatById.set(parseInt(idStr, 10), this.unescapeXml(code));
            }
        }

        const fontBoldFlags: boolean[] = [];
        const fontsSection = /<fonts\b[^>]*>([\s\S]*?)<\/fonts>/.exec(stylesXml);
        if (fontsSection) {
            const fontRegex = /<font\b[^>]*>([\s\S]*?)<\/font>/g;
            let fMatch: RegExpExecArray | null;
            while ((fMatch = fontRegex.exec(fontsSection[1])) !== null) {
                fontBoldFlags.push(/<b\b/.test(fMatch[1]));
            }
        }

        const result: Array<{ FormatPattern?: string; Bold?: boolean }> = [];
        const cellXfsSection = /<cellXfs\b[^>]*>([\s\S]*?)<\/cellXfs>/.exec(stylesXml);
        if (cellXfsSection) {
            const xfRegex = /<xf\b([^>]*?)(?:\/>|>[\s\S]*?<\/xf>)/g;
            let xfMatch: RegExpExecArray | null;
            while ((xfMatch = xfRegex.exec(cellXfsSection[1])) !== null) {
                const attrs = xfMatch[1];
                const nfId = parseInt(this.extractXmlAttr(attrs, 'numFmtId') || '0', 10);
                const fontId = parseInt(this.extractXmlAttr(attrs, 'fontId') || '0', 10);
                result.push({
                    FormatPattern: formatById.get(nfId),
                    Bold: fontBoldFlags[fontId] ?? false
                });
            }
        }

        if (result.length === 0) {
            result.push({ FormatPattern: undefined, Bold: false });
        }
        return result;
    }

    private buildContentTypesXml(sheetCount: number): string {
        const sheetOverrides: string[] = [];
        for (let i = 1; i <= sheetCount; i++) {
            sheetOverrides.push(
                `<Override PartName="/xl/worksheets/sheet${i}.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>`
            );
        }
        return [
            '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>',
            '<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">',
            '<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>',
            '<Default Extension="xml" ContentType="application/xml"/>',
            '<Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>',
            '<Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/>',
            ...sheetOverrides,
            '</Types>'
        ].join('');
    }

    private buildRootRelsXml(): string {
        return [
            '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>',
            '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">',
            '<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/>',
            '</Relationships>'
        ].join('');
    }

    private buildWorkbookXml(
        sheets: Array<{ Name: string; SheetId: number; RelId: string; Hidden: boolean }>
    ): string {
        const sheetTags = sheets
            .map(
                (s) =>
                    `<sheet name="${this.escapeXml(s.Name)}" sheetId="${s.SheetId}"${
                        s.Hidden ? ' state="veryHidden"' : ''
                    } r:id="${s.RelId}"/>`
            )
            .join('');
        return [
            '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>',
            '<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">',
            `<sheets>${sheetTags}</sheets>`,
            '</workbook>'
        ].join('');
    }

    private buildWorkbookRelsXml(
        sheets: Array<{ RelId: string; SheetId: number }>,
        stylesRelId: string
    ): string {
        const rels = sheets
            .map(
                (s) =>
                    `<Relationship Id="${s.RelId}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet${s.SheetId}.xml"/>`
            )
            .join('');
        return [
            '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>',
            '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">',
            rels,
            `<Relationship Id="${stylesRelId}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/>`,
            '</Relationships>'
        ].join('');
    }

    private buildStylesXml(
        numFmts: Array<{ Id: number; FormatCode: string }>,
        cellXfs: Array<{ NumFmtId: number; FontId: number }>
    ): string {
        const numFmtsXml =
            numFmts.length > 0
                ? `<numFmts count="${numFmts.length}">${numFmts
                      .map((nf) => `<numFmt numFmtId="${nf.Id}" formatCode="${this.escapeXml(nf.FormatCode)}"/>`)
                      .join('')}</numFmts>`
                : '';
        const xfsXml = cellXfs
            .map(
                (xf) =>
                    `<xf numFmtId="${xf.NumFmtId}" fontId="${xf.FontId}" fillId="0" borderId="0" xfId="0"${
                        xf.NumFmtId > 0 ? ' applyNumberFormat="1"' : ''
                    }${xf.FontId > 0 ? ' applyFont="1"' : ''}/>`
            )
            .join('');
        return [
            '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>',
            '<styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">',
            numFmtsXml,
            '<fonts count="2"><font><sz val="11"/><name val="Calibri"/></font><font><b/><sz val="11"/><name val="Calibri"/></font></fonts>',
            '<fills count="2"><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="gray125"/></fill></fills>',
            '<borders count="1"><border><left/><right/><top/><bottom/><diagonal/></border></borders>',
            '<cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs>',
            `<cellXfs count="${cellXfs.length}">${xfsXml}</cellXfs>`,
            '</styleSheet>'
        ].join('');
    }

    private escapeXml(str: string): string {
        return str
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;')
            .replace(/'/g, '&apos;');
    }

    private unescapeXml(str: string): string {
        return str
            .replace(/&apos;/g, "'")
            .replace(/&quot;/g, '"')
            .replace(/&gt;/g, '>')
            .replace(/&lt;/g, '<')
            .replace(/&amp;/g, '&');
    }

    private extractXmlAttr(tagText: string, attrName: string): string | null {
        const regex = new RegExp(`(?:^|\\s)${attrName}="([^"]*)"`, 'i');
        const m = regex.exec(tagText);
        return m ? m[1] : null;
    }

    private encodeUtf8(str: string): Uint8Array {
        return new TextEncoder().encode(str);
    }

    private decodeUtf8(bytes: Uint8Array): string {
        return new TextDecoder('utf-8').decode(bytes);
    }

    private decodeBase64OrDataUrl(input: string): Uint8Array | null {
        try {
            const commaIdx = input.indexOf(',');
            const rawB64 = input.startsWith('data:') && commaIdx >= 0 ? input.slice(commaIdx + 1) : input;
            const clean = rawB64.replace(/\s+/g, '');
            if (typeof Buffer !== 'undefined') {
                return new Uint8Array(Buffer.from(clean, 'base64'));
            }
            const bin = atob(clean);
            const out = new Uint8Array(bin.length);
            for (let i = 0; i < bin.length; i++) {
                out[i] = bin.charCodeAt(i);
            }
            return out;
        } catch {
            return null;
        }
    }

    // -----------------------------------------------------------------------
    // Isomorphic ZIP Archive Builder & Reader (Stored + RFC 1951 Deflate)
    // -----------------------------------------------------------------------

    private buildZipArchive(entries: Array<{ Name: string; Data: Uint8Array }>): Uint8Array {
        const localParts: Uint8Array[] = [];
        const centralParts: Uint8Array[] = [];
        let offset = 0;

        for (const entry of entries) {
            const nameBytes = this.encodeUtf8(entry.Name);
            const crc = this.crc32(entry.Data);
            const size = entry.Data.length;

            const localHeader = new Uint8Array(30 + nameBytes.length);
            const lv = new DataView(localHeader.buffer);
            lv.setUint32(0, 0x04034b50, true);
            lv.setUint16(4, 20, true);
            lv.setUint16(6, 0, true);
            lv.setUint16(8, 0, true); // Stored (no compression)
            lv.setUint16(10, 0, true);
            lv.setUint16(12, 0x2100, true);
            lv.setUint32(14, crc, true);
            lv.setUint32(18, size, true);
            lv.setUint32(22, size, true);
            lv.setUint16(26, nameBytes.length, true);
            lv.setUint16(28, 0, true);
            localHeader.set(nameBytes, 30);

            const centralHeader = new Uint8Array(46 + nameBytes.length);
            const cv = new DataView(centralHeader.buffer);
            cv.setUint32(0, 0x02014b50, true);
            cv.setUint16(4, 20, true);
            cv.setUint16(6, 20, true);
            cv.setUint16(8, 0, true);
            cv.setUint16(10, 0, true);
            cv.setUint16(12, 0, true);
            cv.setUint16(14, 0x2100, true);
            cv.setUint32(16, crc, true);
            cv.setUint32(20, size, true);
            cv.setUint32(24, size, true);
            cv.setUint16(28, nameBytes.length, true);
            cv.setUint16(30, 0, true);
            cv.setUint16(32, 0, true);
            cv.setUint16(34, 0, true);
            cv.setUint16(36, 0, true);
            cv.setUint32(38, 0, true);
            cv.setUint32(42, offset, true);
            centralHeader.set(nameBytes, 46);

            localParts.push(localHeader, entry.Data);
            centralParts.push(centralHeader);
            offset += localHeader.length + size;
        }

        const centralSize = centralParts.reduce((s, p) => s + p.length, 0);
        const eocd = new Uint8Array(22);
        const ev = new DataView(eocd.buffer);
        ev.setUint32(0, 0x06054b50, true);
        ev.setUint16(4, 0, true);
        ev.setUint16(6, 0, true);
        ev.setUint16(8, entries.length, true);
        ev.setUint16(10, entries.length, true);
        ev.setUint32(12, centralSize, true);
        ev.setUint32(16, offset, true);
        ev.setUint16(20, 0, true);

        const total = offset + centralSize + eocd.length;
        const out = new Uint8Array(total);
        let pos = 0;
        for (const p of localParts) {
            out.set(p, pos);
            pos += p.length;
        }
        for (const p of centralParts) {
            out.set(p, pos);
            pos += p.length;
        }
        out.set(eocd, pos);
        return out;
    }

    private extractZipArchive(zipBytes: Uint8Array): Map<string, Uint8Array> {
        const files = new Map<string, Uint8Array>();
        const view = new DataView(zipBytes.buffer, zipBytes.byteOffset, zipBytes.byteLength);

        // Locate End of Central Directory (EOCD) signature 0x06054b50 from end
        let eocdOffset = -1;
        for (let i = zipBytes.length - 22; i >= Math.max(0, zipBytes.length - 65557); i--) {
            if (view.getUint32(i, true) === 0x06054b50) {
                eocdOffset = i;
                break;
            }
        }

        if (eocdOffset >= 0) {
            const totalEntries = view.getUint16(eocdOffset + 10, true);
            let cdOffset = view.getUint32(eocdOffset + 16, true);
            for (let e = 0; e < totalEntries && cdOffset + 46 <= zipBytes.length; e++) {
                if (view.getUint32(cdOffset, true) !== 0x02014b50) break;
                const method = view.getUint16(cdOffset + 10, true);
                const compSize = view.getUint32(cdOffset + 20, true);
                const uncompSize = view.getUint32(cdOffset + 24, true);
                const nameLen = view.getUint16(cdOffset + 28, true);
                const extraLen = view.getUint16(cdOffset + 30, true);
                const commentLen = view.getUint16(cdOffset + 32, true);
                const localHeaderOffset = view.getUint32(cdOffset + 42, true);
                const fileName = this.decodeUtf8(zipBytes.subarray(cdOffset + 46, cdOffset + 46 + nameLen));

                if (localHeaderOffset + 30 <= zipBytes.length) {
                    const localNameLen = view.getUint16(localHeaderOffset + 26, true);
                    const localExtraLen = view.getUint16(localHeaderOffset + 28, true);
                    const dataStart = localHeaderOffset + 30 + localNameLen + localExtraLen;
                    const rawSlice = zipBytes.subarray(dataStart, dataStart + compSize);
                    if (method === 0) {
                        files.set(fileName, rawSlice);
                    } else if (method === 8) {
                        files.set(fileName, this.inflateRawDeflate(rawSlice, uncompSize));
                    }
                }
                cdOffset += 46 + nameLen + extraLen + commentLen;
            }
        }
        return files;
    }

    /**
     * Pure-TypeScript RFC 1951 raw DEFLATE decompressor so `.xlsx` files written by `exceljs`,
     * Microsoft Excel, or SheetJS decompress synchronously in both Node and browser.
     */
    private inflateRawDeflate(data: Uint8Array, expectedSize?: number): Uint8Array {
        const out: number[] = [];
        let bitPos = 0;

        const readBits = (n: number): number => {
            let val = 0;
            for (let i = 0; i < n; i++) {
                const byteIdx = bitPos >>> 3;
                if (byteIdx >= data.length) return val;
                const bit = (data[byteIdx] >>> (bitPos & 7)) & 1;
                val |= bit << i;
                bitPos++;
            }
            return val;
        };

        const buildHuffman = (lengths: number[]): { counts: number[]; symbols: number[] } => {
            const maxBits = 15;
            const counts = new Array<number>(maxBits + 1).fill(0);
            for (const len of lengths) {
                if (len > 0) counts[len]++;
            }
            const offsets = new Array<number>(maxBits + 1).fill(0);
            for (let bits = 1; bits < maxBits; bits++) {
                offsets[bits + 1] = offsets[bits] + counts[bits];
            }
            const symbols = new Array<number>(lengths.length).fill(0);
            for (let sym = 0; sym < lengths.length; sym++) {
                const len = lengths[sym];
                if (len > 0) {
                    symbols[offsets[len]++] = sym;
                }
            }
            return { counts, symbols };
        };

        const decodeSymbol = (tree: { counts: number[]; symbols: number[] }): number => {
            let code = 0;
            let first = 0;
            let index = 0;
            for (let len = 1; len <= 15; len++) {
                code |= readBits(1);
                const count = tree.counts[len];
                if (code - count < first) {
                    return tree.symbols[index + (code - first)];
                }
                index += count;
                first += count;
                first <<= 1;
                code <<= 1;
            }
            return 0;
        };

        const lengthBase = [
            3, 4, 5, 6, 7, 8, 9, 10, 11, 13, 15, 17, 19, 23, 27, 31, 35, 43, 51, 59, 67, 83, 99, 115, 131, 163, 195,
            227, 258
        ];
        const lengthExtra = [
            0, 0, 0, 0, 0, 0, 0, 0, 1, 1, 1, 1, 2, 2, 2, 2, 3, 3, 3, 3, 4, 4, 4, 4, 5, 5, 5, 5, 0
        ];
        const distBase = [
            1, 2, 3, 4, 5, 7, 9, 13, 17, 25, 33, 49, 65, 97, 129, 193, 257, 385, 513, 769, 1025, 1537, 2049, 3073,
            4097, 6145, 8193, 12289, 16385, 24577
        ];
        const distExtra = [
            0, 0, 0, 0, 1, 1, 2, 2, 3, 3, 4, 4, 5, 5, 6, 6, 7, 7, 8, 8, 9, 9, 10, 10, 11, 11, 12, 12, 13, 13
        ];

        const fixedLitLengths = new Array<number>(288);
        for (let i = 0; i <= 143; i++) fixedLitLengths[i] = 8;
        for (let i = 144; i <= 255; i++) fixedLitLengths[i] = 9;
        for (let i = 256; i <= 279; i++) fixedLitLengths[i] = 7;
        for (let i = 280; i <= 287; i++) fixedLitLengths[i] = 8;
        const fixedDistLengths = new Array<number>(30).fill(5);

        let isFinal = 0;
        while (!isFinal && (bitPos >>> 3) < data.length) {
            isFinal = readBits(1);
            const bType = readBits(2);
            if (bType === 0) {
                // Stored block
                bitPos = (bitPos + 7) & ~7;
                const len = readBits(16);
                readBits(16); // nlen
                const byteStart = bitPos >>> 3;
                for (let i = 0; i < len && byteStart + i < data.length; i++) {
                    out.push(data[byteStart + i]);
                }
                bitPos += len * 8;
            } else if (bType === 1 || bType === 2) {
                let litTree: { counts: number[]; symbols: number[] };
                let distTree: { counts: number[]; symbols: number[] };
                if (bType === 1) {
                    litTree = buildHuffman(fixedLitLengths);
                    distTree = buildHuffman(fixedDistLengths);
                } else {
                    const hlit = readBits(5) + 257;
                    const hdist = readBits(5) + 1;
                    const hclen = readBits(4) + 4;
                    const clOrder = [16, 17, 18, 0, 8, 7, 9, 6, 10, 5, 11, 4, 12, 3, 13, 2, 14, 1, 15];
                    const clLengths = new Array<number>(19).fill(0);
                    for (let i = 0; i < hclen; i++) {
                        clLengths[clOrder[i]] = readBits(3);
                    }
                    const clTree = buildHuffman(clLengths);
                    const totalCodes = hlit + hdist;
                    const codeLengths = new Array<number>(totalCodes).fill(0);
                    let idx = 0;
                    while (idx < totalCodes) {
                        const sym = decodeSymbol(clTree);
                        if (sym < 16) {
                            codeLengths[idx++] = sym;
                        } else if (sym === 16) {
                            const prev = idx > 0 ? codeLengths[idx - 1] : 0;
                            const rep = readBits(2) + 3;
                            for (let r = 0; r < rep && idx < totalCodes; r++) codeLengths[idx++] = prev;
                        } else if (sym === 17) {
                            const rep = readBits(3) + 3;
                            for (let r = 0; r < rep && idx < totalCodes; r++) codeLengths[idx++] = 0;
                        } else if (sym === 18) {
                            const rep = readBits(7) + 11;
                            for (let r = 0; r < rep && idx < totalCodes; r++) codeLengths[idx++] = 0;
                        }
                    }
                    litTree = buildHuffman(codeLengths.slice(0, hlit));
                    distTree = buildHuffman(codeLengths.slice(hlit));
                }

                while (true) {
                    const sym = decodeSymbol(litTree);
                    if (sym === 256) break;
                    if (sym < 256) {
                        out.push(sym);
                    } else {
                        const lenIdx = sym - 257;
                        const length = lengthBase[lenIdx] + readBits(lengthExtra[lenIdx]);
                        const distSym = decodeSymbol(distTree);
                        const distance = distBase[distSym] + readBits(distExtra[distSym]);
                        const startPos = out.length - distance;
                        for (let i = 0; i < length; i++) {
                            out.push(out[startPos + i] ?? 0);
                        }
                    }
                    if (expectedSize && out.length >= expectedSize && (bitPos >>> 3) >= data.length) {
                        break;
                    }
                }
            } else {
                break;
            }
        }
        return new Uint8Array(out);
    }

    private crc32(bytes: Uint8Array): number {
        let c = 0xffffffff;
        for (let i = 0; i < bytes.length; i++) {
            c ^= bytes[i];
            for (let k = 0; k < 8; k++) {
                c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
            }
        }
        return (c ^ 0xffffffff) >>> 0;
    }
}
