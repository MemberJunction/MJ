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
    ComputeFrozenSnapshotHash,
    DocumentBlockColumn,
    DocumentBlockExecutionResult,
    DocumentBlockMode,
    DocumentBlockSpec,
    DocumentLiveBlockEngine,
    FrozenBlockSnapshot,
    ValidateFrozenBlockSnapshot
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
    /** Bound `SpreadsheetLiveTableSpec.TableID` when this cell was populated by a live table (`B4`). */
    LiveTableID?: string | null;
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

/** Maximum compressed `.xlsx` archive size accepted by `ImportFromXlsxBytes` (15 MiB, `B6`). */
export const MAX_XLSX_COMPRESSED_BYTES = 15 * 1024 * 1024;
/** Maximum cumulative uncompressed size across all ZIP entries in `.xlsx` import (32 MiB, `B6`). */
export const MAX_XLSX_UNCOMPRESSED_TOTAL_BYTES = 32 * 1024 * 1024;
/** Maximum uncompressed size of any single ZIP entry in `.xlsx` import (16 MiB, `B6`). */
export const MAX_XLSX_ENTRY_BYTES = 16 * 1024 * 1024;
/** Excel 1900 date serial epoch offset from Unix epoch (`1970-01-01` = serial `25569`). */
const EXCEL_UNIX_EPOCH_SERIAL_OFFSET = 25569;
const MS_PER_DAY = 86_400_000;

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
    private sheetToWorkbook = new WeakMap<WorksheetSpec, WorkbookSpec>();
    private workbookDagCache = new WeakMap<WorkbookSpec, WorkbookDependencyGraph>();
    private monotonicIdCounter = 0;

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
        const wb: WorkbookSpec = {
            WorkbookID: `wb-${Date.now().toString(36)}`,
            Title: title,
            ActiveSheetID: worksheets[0].SheetID,
            Worksheets: worksheets,
            NamedRanges: [],
            CreatedAt: now,
            UpdatedAt: now
        };
        this.bindSheetsToWorkbook(wb);
        return wb;
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
     * Serializes a {@link WorkbookSpec} to canonical formatted JSON, stripping viewer-scoped
     * `=MJ.*` spill cells, `Mode === 'Live'` table cells, and `=MJ.QUERY`/`=MJ.VIEW` computed values
     * so viewer-scoped data is never persisted (`B4`).
     */
    public SerializeWorkbook(workbook: WorkbookSpec): string {
        workbook.UpdatedAt = new Date().toISOString();
        const sanitized = this.cloneWorkbookWithoutViewerScopedData(workbook);
        return JSON.stringify(sanitized, null, 2);
    }

    private cloneWorkbookWithoutViewerScopedData(workbook: WorkbookSpec): WorkbookSpec {
        const cloned: WorkbookSpec = {
            ...workbook,
            NamedRanges: workbook.NamedRanges.map((nr) => ({ ...nr })),
            Worksheets: workbook.Worksheets.map((ws) => {
                const liveModeTableIds = new Set(
                    ws.LiveTables.filter((t) => t.Mode !== 'Frozen').map((t) => t.TableID)
                );
                const cleanedCells: Record<string, SpreadsheetCellSpec> = {};
                for (const [addr, cell] of Object.entries(ws.Cells)) {
                    if (!cell) continue;
                    if (cell.SpilledFrom) continue;
                    if (cell.LiveTableID && liveModeTableIds.has(cell.LiveTableID)) continue;
                    if (cell.Formula && this.ParseMjCustomFunctionFormula(cell.Formula)) {
                        cleanedCells[addr] = {
                            ...cell,
                            RawValue: null,
                            ComputedValue: null,
                            DisplayValue: '',
                            AccessDenied: false,
                            ErrorMessage: null,
                            SpilledFrom: null
                        };
                    } else {
                        cleanedCells[addr] = {
                            ...cell,
                            Style: cell.Style ? { ...cell.Style } : undefined
                        };
                    }
                }
                return {
                    ...ws,
                    Rows: ws.Rows.map((r) => ({ ...r })),
                    Columns: ws.Columns.map((c) => ({ ...c })),
                    Cells: cleanedCells,
                    FilterSpecs: ws.FilterSpecs.map((f) => ({ ...f })),
                    ValidationRules: ws.ValidationRules.map((v) => ({ ...v })),
                    ConditionalFormats: ws.ConditionalFormats.map((cf) => ({ ...cf })),
                    LiveTables: ws.LiveTables.map((t) => ({ ...t })),
                    Charts: ws.Charts.map((c) => ({ ...c })),
                    EmbeddedArtifacts: ws.EmbeddedArtifacts.map((e) => ({ ...e }))
                };
            })
        };

        this.bindSheetsToWorkbook(cloned);
        this.EvaluateWorkbook(cloned);

        // Ensure =MJ.QUERY and =MJ.VIEW cells always persist ComputedValue: null and DisplayValue: ''
        for (const ws of cloned.Worksheets) {
            for (const cell of Object.values(ws.Cells)) {
                if (cell.Formula && this.ParseMjCustomFunctionFormula(cell.Formula)) {
                    cell.ComputedValue = null;
                    cell.DisplayValue = '';
                }
            }
        }
        return cloned;
    }

    private bindSheetsToWorkbook(workbook: WorkbookSpec): void {
        for (const ws of workbook.Worksheets) {
            this.sheetToWorkbook.set(ws, workbook);
        }
    }

    private mintUniqueRowId(sheetId: string, existingIds: Set<string>, preferredNumber: number): string {
        const direct = `${sheetId}-row-${preferredNumber}`;
        if (!existingIds.has(direct)) {
            existingIds.add(direct);
            return direct;
        }
        let n = preferredNumber + 1;
        while (existingIds.has(`${sheetId}-row-${n}`)) {
            n++;
        }
        const candidate = `${sheetId}-row-${n}`;
        existingIds.add(candidate);
        return candidate;
    }

    private mintUniqueColumnId(sheetId: string, existingIds: Set<string>, preferredIndex: number): string {
        const direct = `${sheetId}-col-${ColumnIndexToLetter(preferredIndex)}`;
        if (!existingIds.has(direct)) {
            existingIds.add(direct);
            return direct;
        }
        while (true) {
            this.monotonicIdCounter++;
            const candidate = `${sheetId}-col-${ColumnIndexToLetter(preferredIndex)}-u${this.monotonicIdCounter}`;
            if (!existingIds.has(candidate)) {
                existingIds.add(candidate);
                return candidate;
            }
        }
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

        const wb: WorkbookSpec = {
            WorkbookID: raw.WorkbookID || `wb-${Date.now().toString(36)}`,
            Title: raw.Title || 'Untitled Workbook',
            ActiveSheetID: activeId,
            Worksheets: worksheets,
            NamedRanges: Array.isArray(raw.NamedRanges) ? raw.NamedRanges : [],
            CreatedAt: raw.CreatedAt || now,
            UpdatedAt: raw.UpdatedAt || now
        };
        this.bindSheetsToWorkbook(wb);

        // Second pass now that all sheets in `wb` are bound: compile/resolve any cross-sheet `@SHEET_*` references
        for (const ws of wb.Worksheets) {
            for (const cell of Object.values(ws.Cells)) {
                if (cell.FormulaStable && (cell.FormulaStable.includes('@SHEET_CELL(') || cell.FormulaStable.includes('@SHEET_RANGE('))) {
                    cell.Formula = this.ResolveFormulaFromStableIds(ws, cell.FormulaStable, wb);
                } else if (cell.Formula && cell.Formula.includes('!')) {
                    cell.FormulaStable = this.CompileFormulaToStableIds(ws, cell.Formula, wb);
                }
            }
        }
        return wb;
    }

    /**
     * Normalizes a single worksheet, ensuring `Rows` and `Columns` cover all populated cell coordinates,
     * guaranteeing monotonic unique `RowID`s and `ColumnID`s, and ensuring every formula has both
     * `Formula` and `FormulaStable`.
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
        const usedRowIds = new Set<string>();
        const rows: SpreadsheetRowSpec[] = [];
        for (let r = 1; r <= maxRow; r++) {
            const existing = existingRows[r - 1];
            const candidateId =
                existing?.RowID && !usedRowIds.has(existing.RowID)
                    ? (usedRowIds.add(existing.RowID), existing.RowID)
                    : this.mintUniqueRowId(sheetId, usedRowIds, r);
            rows.push({
                RowID: candidateId,
                Index: r,
                Height: existing?.Height ?? DEFAULT_ROW_HEIGHT,
                Hidden: existing?.Hidden ?? false
            });
        }

        const existingCols = Array.isArray(raw.Columns) ? raw.Columns : [];
        const usedColIds = new Set<string>();
        const columns: SpreadsheetColumnSpec[] = [];
        for (let c = 1; c <= maxCol; c++) {
            const existing = existingCols[c - 1];
            const letter = ColumnIndexToLetter(c);
            const candidateId =
                existing?.ColumnID && !usedColIds.has(existing.ColumnID)
                    ? (usedColIds.add(existing.ColumnID), existing.ColumnID)
                    : this.mintUniqueColumnId(sheetId, usedColIds, c);
            columns.push({
                ColumnID: candidateId,
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
     * (`'=SUM(@RANGE(sheet-1-row-2,sheet-1-col-B,sheet-1-row-9,sheet-1-col-B)) + @CELL($sheet-1-row-2,$sheet-1-col-C)'`
     * and cross-sheet `'@SHEET_CELL(sheetId,r,c)'` / `'@SHEET_RANGE(sheetId,r1,c1,r2,c2)'`)
     * so concurrent row/column insertions and deletions preserve exact logical references (`§ 6.2`, `Accept #1`, `D3`).
     */
    public CompileFormulaToStableIds(sheet: WorksheetSpec, formula: string, workbook?: WorkbookSpec): string {
        if (!formula || !formula.trim().startsWith('=')) {
            return formula;
        }
        const activeWorkbook = workbook ?? this.sheetToWorkbook.get(sheet);

        // 1. Protect Excel double-quoted string literals (handling doubled "" inside strings)
        const literals: string[] = [];
        let masked = formula.replace(/"(?:""|[^"])*"/g, (match) => {
            literals.push(match);
            return `__STR_LIT_${literals.length - 1}__`;
        });

        // 2. Translate or mask cross-sheet references (handling single-quoted names with doubled '' like 'FY24 Q1'!B2)
        const sheetQuotes: string[] = [];
        masked = masked.replace(
            /(?:'((?:''|[^'])*)'|([A-Za-z_][A-Za-z0-9_.]*))!(\$?)([A-Za-z]{1,3})(\$?)([1-9][0-9]*)(?::(\$?)([A-Za-z]{1,3})(\$?)([1-9][0-9]*))?/g,
            (
                full,
                quotedSheet: string | undefined,
                plainSheet: string | undefined,
                absC1: string,
                col1: string,
                absR1: string,
                row1: string,
                absC2: string | undefined,
                col2: string | undefined,
                absR2: string | undefined,
                row2: string | undefined
            ) => {
                const rawSheetName = quotedSheet !== undefined ? quotedSheet.replace(/''/g, "'") : (plainSheet ?? '');
                const targetSheet = activeWorkbook ? this.GetWorksheet(activeWorkbook, rawSheetName) : undefined;
                if (!targetSheet) {
                    // Mask unknown/unattached cross-sheet token so local regexes never corrupt 'FY24 Q1'!B2
                    sheetQuotes.push(full);
                    return `__XSHEET_LIT_${sheetQuotes.length - 1}__`;
                }
                const r1 = parseInt(row1, 10);
                const c1 = ColumnLetterToIndex(col1);
                if (col2 && row2) {
                    const r2 = parseInt(row2, 10);
                    const c2 = ColumnLetterToIndex(col2);
                    this.ensureSheetCapacity(targetSheet, Math.max(r1, r2), Math.max(c1, c2));
                    const rId1 = `${absR1 ? '$' : ''}${targetSheet.Rows[r1 - 1].RowID}`;
                    const cId1 = `${absC1 ? '$' : ''}${targetSheet.Columns[c1 - 1].ColumnID}`;
                    const rId2 = `${absR2 ? '$' : ''}${targetSheet.Rows[r2 - 1].RowID}`;
                    const cId2 = `${absC2 ? '$' : ''}${targetSheet.Columns[c2 - 1].ColumnID}`;
                    return `@SHEET_RANGE(${targetSheet.SheetID},${rId1},${cId1},${rId2},${cId2})`;
                }
                this.ensureSheetCapacity(targetSheet, r1, c1);
                const rId = `${absR1 ? '$' : ''}${targetSheet.Rows[r1 - 1].RowID}`;
                const cId = `${absC1 ? '$' : ''}${targetSheet.Columns[c1 - 1].ColumnID}`;
                return `@SHEET_CELL(${targetSheet.SheetID},${rId},${cId})`;
            }
        );

        // Also mask any remaining single-quoted segments so tokens like Q1 inside 'FY24 Q1' are never touched
        masked = masked.replace(/'(?:''|[^'])*'/g, (match) => {
            sheetQuotes.push(match);
            return `__XSHEET_LIT_${sheetQuotes.length - 1}__`;
        });

        // 3. Replace local A1 ranges (not preceded by '!' or '@')
        const withRanges = masked.replace(
            /(?<![!@A-Za-z0-9_])(\$?)([A-Za-z]{1,3})(\$?)([1-9][0-9]*):(\$?)([A-Za-z]{1,3})(\$?)([1-9][0-9]*)/g,
            (
                _full,
                absC1: string,
                col1: string,
                absR1: string,
                row1: string,
                absC2: string,
                col2: string,
                absR2: string,
                row2: string
            ) => {
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

        // 4. Replace standalone local A1 cell references (not followed by '(' function call or preceded by '!' or '@' or '.')
        const withCells = withRanges.replace(
            /(?<![!@.A-Za-z0-9_])(\$?)([A-Za-z]{1,3})(\$?)([1-9][0-9]*)(?![A-Za-z0-9_.(\[])/g,
            (_full, absC: string, col: string, absR: string, row: string) => {
                const r = parseInt(row, 10);
                const c = ColumnLetterToIndex(col);
                this.ensureSheetCapacity(sheet, r, c);
                const rId = `${absR ? '$' : ''}${sheet.Rows[r - 1].RowID}`;
                const cId = `${absC ? '$' : ''}${sheet.Columns[c - 1].ColumnID}`;
                return `@CELL(${rId},${cId})`;
            }
        );

        const unmaskedSheets = withCells.replace(
            /__XSHEET_LIT_(\d+)__/g,
            (_m, idxStr: string) => sheetQuotes[parseInt(idxStr, 10)] ?? ''
        );
        return unmaskedSheets.replace(
            /__STR_LIT_(\d+)__/g,
            (_m, idxStr: string) => literals[parseInt(idxStr, 10)] ?? ''
        );
    }

    /**
     * Resolves a `FormulaStable` string back to human-readable A1 notation using the current
     * positions of each `RowID` and `ColumnID` in `sheet.Rows` / `sheet.Columns` (and cross-sheet
     * `@SHEET_CELL` / `@SHEET_RANGE` targets when `workbook` is available) (`§ 6.2`, `Accept #1`, `D3`).
     */
    public ResolveFormulaFromStableIds(sheet: WorksheetSpec, formulaStable: string, workbook?: WorkbookSpec): string {
        if (
            !formulaStable ||
            (!formulaStable.includes('@CELL(') &&
                !formulaStable.includes('@RANGE(') &&
                !formulaStable.includes('@SHEET_CELL(') &&
                !formulaStable.includes('@SHEET_RANGE('))
        ) {
            return formulaStable;
        }
        const activeWorkbook = workbook ?? this.sheetToWorkbook.get(sheet);

        const buildSheetLookup = (
            ws: WorksheetSpec
        ): { rowIndexById: Map<string, number>; colIndexById: Map<string, number> } => {
            const rowIndexById = new Map<string, number>();
            for (let i = 0; i < ws.Rows.length; i++) {
                rowIndexById.set(ws.Rows[i].RowID, i + 1);
            }
            const colIndexById = new Map<string, number>();
            for (let i = 0; i < ws.Columns.length; i++) {
                colIndexById.set(ws.Columns[i].ColumnID, i + 1);
            }
            return { rowIndexById, colIndexById };
        };

        const localLookup = buildSheetLookup(sheet);
        const crossLookupCache = new Map<string, { ws: WorksheetSpec; rowIndexById: Map<string, number>; colIndexById: Map<string, number> }>();

        const getCrossLookup = (targetSheetId: string) => {
            const existing = crossLookupCache.get(targetSheetId);
            if (existing) return existing;
            const ws = activeWorkbook?.Worksheets.find((w) => w.SheetID === targetSheetId);
            if (!ws) return null;
            const built = { ws, ...buildSheetLookup(ws) };
            crossLookupCache.set(targetSheetId, built);
            return built;
        };

        const resolveTokenAgainst = (
            lookup: { rowIndexById: Map<string, number>; colIndexById: Map<string, number> },
            rawRowId: string,
            rawColId: string
        ): string => {
            const absR = rawRowId.startsWith('$');
            const absC = rawColId.startsWith('$');
            const rId = absR ? rawRowId.slice(1) : rawRowId;
            const cId = absC ? rawColId.slice(1) : rawColId;
            const rIdx = lookup.rowIndexById.get(rId);
            const cIdx = lookup.colIndexById.get(cId);
            if (!rIdx || !cIdx) {
                return '#REF!';
            }
            return FormatCellAddress(rIdx, cIdx, absR, absC);
        };

        const formatSheetRefPrefix = (sheetName: string): string => {
            if (/^[A-Za-z_][A-Za-z0-9_]*$/.test(sheetName) && !ParseCellAddress(sheetName)) {
                return `${sheetName}!`;
            }
            return `'${sheetName.replace(/'/g, "''")}'!`;
        };

        let resolved = formulaStable.replace(
            /@SHEET_RANGE\(([^,]+),([^,]+),([^,]+),([^,]+),([^)]+)\)/g,
            (_full, sId: string, r1: string, c1: string, r2: string, c2: string) => {
                const cross = getCrossLookup(sId.trim());
                if (!cross) return '#REF!';
                const start = resolveTokenAgainst(cross, r1.trim(), c1.trim());
                const end = resolveTokenAgainst(cross, r2.trim(), c2.trim());
                if (start === '#REF!' || end === '#REF!') {
                    return '#REF!';
                }
                return `${formatSheetRefPrefix(cross.ws.Name)}${start}:${end}`;
            }
        );

        resolved = resolved.replace(
            /@SHEET_CELL\(([^,]+),([^,]+),([^)]+)\)/g,
            (_full, sId: string, r: string, c: string) => {
                const cross = getCrossLookup(sId.trim());
                if (!cross) return '#REF!';
                const addr = resolveTokenAgainst(cross, r.trim(), c.trim());
                if (addr === '#REF!') return '#REF!';
                return `${formatSheetRefPrefix(cross.ws.Name)}${addr}`;
            }
        );

        resolved = resolved.replace(
            /@RANGE\(([^,]+),([^,]+),([^,]+),([^)]+)\)/g,
            (_full, r1: string, c1: string, r2: string, c2: string) => {
                const start = resolveTokenAgainst(localLookup, r1.trim(), c1.trim());
                const end = resolveTokenAgainst(localLookup, r2.trim(), c2.trim());
                if (start === '#REF!' || end === '#REF!') {
                    return '#REF!';
                }
                return `${start}:${end}`;
            }
        );

        return resolved.replace(
            /@CELL\(([^,]+),([^)]+)\)/g,
            (_full, r: string, c: string) => resolveTokenAgainst(localLookup, r.trim(), c.trim())
        );
    }

    /**
     * Inserts `count` new rows at 1-based `atRowNumber` in `sheetId`, assigning fresh monotonic `RowID`s,
     * shifting affected cells and non-cell range metadata down, and resolving all `FormulaStable` references (`§ 6.2`, `Accept #1`, `D3`).
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
        this.bindSheetsToWorkbook(workbook);
        const insertIdx = Math.max(0, Math.min(sheet.Rows.length, Math.floor(atRowNumber) - 1));
        const startRow1Based = insertIdx + 1;
        const numToInsert = Math.max(1, Math.floor(count));
        const existingIds = new Set(sheet.Rows.map((r) => r.RowID));
        const inserted: SpreadsheetRowSpec[] = [];
        for (let i = 0; i < numToInsert; i++) {
            this.monotonicIdCounter++;
            let candidate = `${sheet.SheetID}-row-ins-${this.monotonicIdCounter}`;
            while (existingIds.has(candidate)) {
                this.monotonicIdCounter++;
                candidate = `${sheet.SheetID}-row-ins-${this.monotonicIdCounter}`;
            }
            existingIds.add(candidate);
            inserted.push({
                RowID: candidate,
                Index: insertIdx + i + 1,
                Height: DEFAULT_ROW_HEIGHT,
                Hidden: false
            });
        }
        sheet.Rows.splice(insertIdx, 0, ...inserted);
        this.shiftNonCellMetadataForRowEdit(workbook, sheet, 'insert', startRow1Based, numToInsert);
        this.reindexWorkbookAfterStructuralEdit(workbook, sheet);
        this.EvaluateWorkbook(workbook);
        return inserted;
    }

    /**
     * Deletes `count` rows starting at 1-based `atRowNumber` in `sheetId`, shrinking `@RANGE` endpoints
     * to surviving rows (or `#REF!` if the entire range was deleted) and updating non-cell range metadata (`D3`).
     */
    public DeleteRows(workbook: WorkbookSpec, sheetId: string, atRowNumber: number, count = 1): void {
        const sheet = this.GetWorksheet(workbook, sheetId);
        if (!sheet || sheet.Rows.length <= 1) return;
        this.bindSheetsToWorkbook(workbook);
        const startIdx = Math.max(0, Math.min(sheet.Rows.length - 1, Math.floor(atRowNumber) - 1));
        const startRow1Based = startIdx + 1;
        const maxDeletable = Math.min(Math.max(1, Math.floor(count)), sheet.Rows.length - 1);
        const removedRowSet = new Set(sheet.Rows.slice(startIdx, startIdx + maxDeletable).map((r) => r.RowID));

        // Shrink @RANGE and @SHEET_RANGE endpoints BEFORE removing the rows so surviving endpoints are preserved
        this.shrinkFormulaStableRowEndpointsBeforeDelete(workbook, sheet, removedRowSet);

        sheet.Rows.splice(startIdx, maxDeletable);
        for (const [addr, cell] of Object.entries(sheet.Cells)) {
            if (removedRowSet.has(cell.RowID)) {
                delete sheet.Cells[addr];
            }
        }
        this.shiftNonCellMetadataForRowEdit(workbook, sheet, 'delete', startRow1Based, maxDeletable);
        this.reindexWorkbookAfterStructuralEdit(workbook, sheet);
        this.EvaluateWorkbook(workbook);
    }

    /**
     * Inserts `count` new columns at 1-based `atColumnNumber` in `sheetId`, assigning fresh monotonic `ColumnID`s,
     * shifting affected cells and non-cell range metadata right, and resolving all `FormulaStable` references (`§ 6.2`, `Accept #1`, `D3`).
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
        this.bindSheetsToWorkbook(workbook);
        const insertIdx = Math.max(0, Math.min(sheet.Columns.length, Math.floor(atColumnNumber) - 1));
        const startCol1Based = insertIdx + 1;
        const numToInsert = Math.max(1, Math.floor(count));
        const existingIds = new Set(sheet.Columns.map((c) => c.ColumnID));
        const inserted: SpreadsheetColumnSpec[] = [];
        for (let i = 0; i < numToInsert; i++) {
            this.monotonicIdCounter++;
            let candidate = `${sheet.SheetID}-col-ins-${this.monotonicIdCounter}`;
            while (existingIds.has(candidate)) {
                this.monotonicIdCounter++;
                candidate = `${sheet.SheetID}-col-ins-${this.monotonicIdCounter}`;
            }
            existingIds.add(candidate);
            inserted.push({
                ColumnID: candidate,
                Index: insertIdx + i + 1,
                Letter: ColumnIndexToLetter(insertIdx + i + 1),
                Width: DEFAULT_COLUMN_WIDTH,
                Hidden: false
            });
        }
        sheet.Columns.splice(insertIdx, 0, ...inserted);
        this.shiftNonCellMetadataForColEdit(workbook, sheet, 'insert', startCol1Based, numToInsert);
        this.reindexWorkbookAfterStructuralEdit(workbook, sheet);
        this.EvaluateWorkbook(workbook);
        return inserted;
    }

    /**
     * Deletes `count` columns starting at 1-based `atColumnNumber` in `sheetId`, shrinking `@RANGE` endpoints
     * to surviving columns (or `#REF!` if the entire range was deleted) and updating non-cell range metadata (`D3`).
     */
    public DeleteColumns(workbook: WorkbookSpec, sheetId: string, atColumnNumber: number, count = 1): void {
        const sheet = this.GetWorksheet(workbook, sheetId);
        if (!sheet || sheet.Columns.length <= 1) return;
        this.bindSheetsToWorkbook(workbook);
        const startIdx = Math.max(0, Math.min(sheet.Columns.length - 1, Math.floor(atColumnNumber) - 1));
        const startCol1Based = startIdx + 1;
        const maxDeletable = Math.min(Math.max(1, Math.floor(count)), sheet.Columns.length - 1);
        const removedColSet = new Set(sheet.Columns.slice(startIdx, startIdx + maxDeletable).map((c) => c.ColumnID));

        // Shrink @RANGE and @SHEET_RANGE endpoints BEFORE removing the columns so surviving endpoints are preserved
        this.shrinkFormulaStableColEndpointsBeforeDelete(workbook, sheet, removedColSet);

        sheet.Columns.splice(startIdx, maxDeletable);
        for (const [addr, cell] of Object.entries(sheet.Cells)) {
            if (removedColSet.has(cell.ColumnID)) {
                delete sheet.Cells[addr];
            }
        }
        this.shiftNonCellMetadataForColEdit(workbook, sheet, 'delete', startCol1Based, maxDeletable);
        this.reindexWorkbookAfterStructuralEdit(workbook, sheet);
        this.EvaluateWorkbook(workbook);
    }

    /**
     * Rebuilds 1-based row/column indices, moves cells to their current `(RowID, ColumnID)` A1 coordinates,
     * and updates every cell's `Formula` from its `FormulaStable` (`§ 6.2`, `Accept #1`).
     */
    public ReindexWorksheetAndResolveFormulas(sheet: WorksheetSpec): void {
        this.reindexSheetStructureAndFormulas(sheet);
    }

    private reindexWorkbookAfterStructuralEdit(workbook: WorkbookSpec, editedSheet: WorksheetSpec): void {
        this.workbookDagCache.delete(workbook);
        this.reindexSheetStructureAndFormulas(editedSheet, workbook);
        for (const ws of workbook.Worksheets) {
            if (ws.SheetID === editedSheet.SheetID) continue;
            for (const cell of Object.values(ws.Cells)) {
                if (cell.FormulaStable) {
                    cell.Formula = this.ResolveFormulaFromStableIds(ws, cell.FormulaStable, workbook);
                }
            }
        }
    }

    private reindexSheetStructureAndFormulas(sheet: WorksheetSpec, workbook?: WorkbookSpec): void {
        const activeWorkbook = workbook ?? this.sheetToWorkbook.get(sheet);
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
                ? this.ResolveFormulaFromStableIds(sheet, cell.FormulaStable, activeWorkbook)
                : cell.Formula ?? null;
            nextCells[nextAddr] = {
                ...cell,
                Address: nextAddr,
                Formula: resolvedFormula
            };
        }
        sheet.Cells = nextCells;
    }

    private shrinkFormulaStableRowEndpointsBeforeDelete(
        workbook: WorkbookSpec,
        targetSheet: WorksheetSpec,
        removedRowIds: ReadonlySet<string>
    ): void {
        const preRowIndexById = new Map<string, number>();
        targetSheet.Rows.forEach((r, idx) => preRowIndexById.set(r.RowID, idx));

        const shrinkRowPair = (rawR1: string, rawR2: string): { nextR1: string; nextR2: string } | null => {
            const absR1 = rawR1.trim().startsWith('$');
            const absR2 = rawR2.trim().startsWith('$');
            const id1 = absR1 ? rawR1.trim().slice(1) : rawR1.trim();
            const id2 = absR2 ? rawR2.trim().slice(1) : rawR2.trim();
            const idx1 = preRowIndexById.get(id1);
            const idx2 = preRowIndexById.get(id2);
            if (idx1 === undefined || idx2 === undefined) return null;
            if (!removedRowIds.has(id1) && !removedRowIds.has(id2)) {
                return { nextR1: rawR1.trim(), nextR2: rawR2.trim() };
            }
            const minIdx = Math.min(idx1, idx2);
            const maxIdx = Math.max(idx1, idx2);
            const surviving = targetSheet.Rows.slice(minIdx, maxIdx + 1).filter((r) => !removedRowIds.has(r.RowID));
            if (surviving.length === 0) {
                return null;
            }
            return {
                nextR1: `${absR1 ? '$' : ''}${surviving[0].RowID}`,
                nextR2: `${absR2 ? '$' : ''}${surviving[surviving.length - 1].RowID}`
            };
        };

        for (const ws of workbook.Worksheets) {
            for (const cell of Object.values(ws.Cells)) {
                if (!cell.FormulaStable) continue;
                let updated = cell.FormulaStable;
                if (ws.SheetID === targetSheet.SheetID && updated.includes('@RANGE(')) {
                    updated = updated.replace(
                        /@RANGE\(([^,]+),([^,]+),([^,]+),([^)]+)\)/g,
                        (_full, r1: string, c1: string, r2: string, c2: string) => {
                            const shrunk = shrinkRowPair(r1, r2);
                            if (!shrunk) return '#REF!';
                            return `@RANGE(${shrunk.nextR1},${c1.trim()},${shrunk.nextR2},${c2.trim()})`;
                        }
                    );
                }
                if (updated.includes('@SHEET_RANGE(')) {
                    updated = updated.replace(
                        /@SHEET_RANGE\(([^,]+),([^,]+),([^,]+),([^,]+),([^)]+)\)/g,
                        (full, sId: string, r1: string, c1: string, r2: string, c2: string) => {
                            if (sId.trim() !== targetSheet.SheetID) return full;
                            const shrunk = shrinkRowPair(r1, r2);
                            if (!shrunk) return '#REF!';
                            return `@SHEET_RANGE(${sId.trim()},${shrunk.nextR1},${c1.trim()},${shrunk.nextR2},${c2.trim()})`;
                        }
                    );
                }
                cell.FormulaStable = updated;
            }
        }
    }

    private shrinkFormulaStableColEndpointsBeforeDelete(
        workbook: WorkbookSpec,
        targetSheet: WorksheetSpec,
        removedColIds: ReadonlySet<string>
    ): void {
        const preColIndexById = new Map<string, number>();
        targetSheet.Columns.forEach((c, idx) => preColIndexById.set(c.ColumnID, idx));

        const shrinkColPair = (rawC1: string, rawC2: string): { nextC1: string; nextC2: string } | null => {
            const absC1 = rawC1.trim().startsWith('$');
            const absC2 = rawC2.trim().startsWith('$');
            const id1 = absC1 ? rawC1.trim().slice(1) : rawC1.trim();
            const id2 = absC2 ? rawC2.trim().slice(1) : rawC2.trim();
            const idx1 = preColIndexById.get(id1);
            const idx2 = preColIndexById.get(id2);
            if (idx1 === undefined || idx2 === undefined) return null;
            if (!removedColIds.has(id1) && !removedColIds.has(id2)) {
                return { nextC1: rawC1.trim(), nextC2: rawC2.trim() };
            }
            const minIdx = Math.min(idx1, idx2);
            const maxIdx = Math.max(idx1, idx2);
            const surviving = targetSheet.Columns.slice(minIdx, maxIdx + 1).filter((c) => !removedColIds.has(c.ColumnID));
            if (surviving.length === 0) {
                return null;
            }
            return {
                nextC1: `${absC1 ? '$' : ''}${surviving[0].ColumnID}`,
                nextC2: `${absC2 ? '$' : ''}${surviving[surviving.length - 1].ColumnID}`
            };
        };

        for (const ws of workbook.Worksheets) {
            for (const cell of Object.values(ws.Cells)) {
                if (!cell.FormulaStable) continue;
                let updated = cell.FormulaStable;
                if (ws.SheetID === targetSheet.SheetID && updated.includes('@RANGE(')) {
                    updated = updated.replace(
                        /@RANGE\(([^,]+),([^,]+),([^,]+),([^)]+)\)/g,
                        (_full, r1: string, c1: string, r2: string, c2: string) => {
                            const shrunk = shrinkColPair(c1, c2);
                            if (!shrunk) return '#REF!';
                            return `@RANGE(${r1.trim()},${shrunk.nextC1},${r2.trim()},${shrunk.nextC2})`;
                        }
                    );
                }
                if (updated.includes('@SHEET_RANGE(')) {
                    updated = updated.replace(
                        /@SHEET_RANGE\(([^,]+),([^,]+),([^,]+),([^,]+),([^)]+)\)/g,
                        (full, sId: string, r1: string, c1: string, r2: string, c2: string) => {
                            if (sId.trim() !== targetSheet.SheetID) return full;
                            const shrunk = shrinkColPair(c1, c2);
                            if (!shrunk) return '#REF!';
                            return `@SHEET_RANGE(${sId.trim()},${r1.trim()},${shrunk.nextC1},${r2.trim()},${shrunk.nextC2})`;
                        }
                    );
                }
                cell.FormulaStable = updated;
            }
        }
    }

    private shiftNonCellMetadataForRowEdit(
        workbook: WorkbookSpec,
        sheet: WorksheetSpec,
        op: 'insert' | 'delete',
        startRow1Based: number,
        count: number
    ): void {
        const maxSurvivingRow = Math.max(1, sheet.Rows.length);
        for (const nr of workbook.NamedRanges) {
            if (nr.SheetID !== sheet.SheetID || nr.Range === '#REF!') continue;
            const shifted = shiftA1RangeRows(nr.Range, op, startRow1Based, count, false, maxSurvivingRow);
            nr.Range = shifted ?? '#REF!';
        }
        sheet.ValidationRules = sheet.ValidationRules
            .map((vr) => {
                const shifted = shiftA1RangeRows(vr.Range, op, startRow1Based, count, false, maxSurvivingRow);
                return shifted ? { ...vr, Range: shifted } : null;
            })
            .filter((vr): vr is SpreadsheetValidationRuleSpec => vr !== null);
        sheet.ConditionalFormats = sheet.ConditionalFormats
            .map((cf) => {
                const shifted = shiftA1RangeRows(cf.Range, op, startRow1Based, count, false, maxSurvivingRow);
                return shifted ? { ...cf, Range: shifted } : null;
            })
            .filter((cf): cf is SpreadsheetConditionalFormatRuleSpec => cf !== null);
        for (const ws of workbook.Worksheets) {
            for (const chart of ws.Charts) {
                if (chart.SheetID === sheet.SheetID && chart.SourceRange !== '#REF!') {
                    const shiftedSource = shiftA1RangeRows(chart.SourceRange, op, startRow1Based, count, false, maxSurvivingRow);
                    chart.SourceRange = shiftedSource ?? '#REF!';
                }
            }
        }
        for (const chart of sheet.Charts) {
            const shiftedPos = shiftA1RangeRows(chart.PositionCell, op, startRow1Based, count, true, maxSurvivingRow);
            if (shiftedPos) chart.PositionCell = shiftedPos;
        }
        for (const lt of sheet.LiveTables) {
            const shiftedAnchor = shiftA1RangeRows(lt.AnchorCell, op, startRow1Based, count, true, maxSurvivingRow);
            if (shiftedAnchor) lt.AnchorCell = shiftedAnchor;
        }
        for (const ea of sheet.EmbeddedArtifacts) {
            const shiftedAnchor = shiftA1RangeRows(ea.AnchorCell, op, startRow1Based, count, true, maxSurvivingRow);
            if (shiftedAnchor) ea.AnchorCell = shiftedAnchor;
        }
    }

    private shiftNonCellMetadataForColEdit(
        workbook: WorkbookSpec,
        sheet: WorksheetSpec,
        op: 'insert' | 'delete',
        startCol1Based: number,
        count: number
    ): void {
        const maxSurvivingCol = Math.max(1, sheet.Columns.length);
        for (const nr of workbook.NamedRanges) {
            if (nr.SheetID !== sheet.SheetID || nr.Range === '#REF!') continue;
            const shifted = shiftA1RangeCols(nr.Range, op, startCol1Based, count, false, maxSurvivingCol);
            nr.Range = shifted ?? '#REF!';
        }
        sheet.ValidationRules = sheet.ValidationRules
            .map((vr) => {
                const shifted = shiftA1RangeCols(vr.Range, op, startCol1Based, count, false, maxSurvivingCol);
                return shifted ? { ...vr, Range: shifted } : null;
            })
            .filter((vr): vr is SpreadsheetValidationRuleSpec => vr !== null);
        sheet.ConditionalFormats = sheet.ConditionalFormats
            .map((cf) => {
                const shifted = shiftA1RangeCols(cf.Range, op, startCol1Based, count, false, maxSurvivingCol);
                return shifted ? { ...cf, Range: shifted } : null;
            })
            .filter((cf): cf is SpreadsheetConditionalFormatRuleSpec => cf !== null);
        for (const ws of workbook.Worksheets) {
            for (const chart of ws.Charts) {
                if (chart.SheetID === sheet.SheetID && chart.SourceRange !== '#REF!') {
                    const shiftedSource = shiftA1RangeCols(chart.SourceRange, op, startCol1Based, count, false, maxSurvivingCol);
                    chart.SourceRange = shiftedSource ?? '#REF!';
                }
            }
        }
        for (const chart of sheet.Charts) {
            const shiftedPos = shiftA1RangeCols(chart.PositionCell, op, startCol1Based, count, true, maxSurvivingCol);
            if (shiftedPos) chart.PositionCell = shiftedPos;
        }
        for (const lt of sheet.LiveTables) {
            const shiftedAnchor = shiftA1RangeCols(lt.AnchorCell, op, startCol1Based, count, true, maxSurvivingCol);
            if (shiftedAnchor) lt.AnchorCell = shiftedAnchor;
        }
        for (const ea of sheet.EmbeddedArtifacts) {
            const shiftedAnchor = shiftA1RangeCols(ea.AnchorCell, op, startCol1Based, count, true, maxSurvivingCol);
            if (shiftedAnchor) ea.AnchorCell = shiftedAnchor;
        }
        if (sheet.SortSpec) {
            const shiftedSortCol = shiftColumnLetter(sheet.SortSpec.ColumnLetter, op, startCol1Based, count);
            sheet.SortSpec = shiftedSortCol ? { ...sheet.SortSpec, ColumnLetter: shiftedSortCol } : null;
        }
        sheet.FilterSpecs = sheet.FilterSpecs
            .map((fs) => {
                const shiftedCol = shiftColumnLetter(fs.ColumnLetter, op, startCol1Based, count);
                return shiftedCol ? { ...fs, ColumnLetter: shiftedCol } : null;
            })
            .filter((fs): fs is SpreadsheetFilterSpec => fs !== null);
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
     * and recalculates affected dependents (`Accept #3`, `D2`).
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
        this.bindSheetsToWorkbook(workbook);
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
            formula = this.ResolveFormulaFromStableIds(sheet, formulaStable, workbook);
        } else if (formula && formula.trim().startsWith('=')) {
            formula = formula.trim();
            formulaStable = this.CompileFormulaToStableIds(sheet, formula, workbook);
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
            SpilledFrom: null,
            LiveTableID: null
        };

        sheet.Cells[canonicalAddr] = cell;

        if (recalculate) {
            this.recalculateAfterCellEdit(workbook, sheet, canonicalAddr);
        } else {
            this.workbookDagCache.delete(workbook);
            this.validateCellAgainstSheetRules(sheet, cell);
            cell.DisplayValue = this.formatCellForDisplay(cell);
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
        this.monotonicIdCounter++;
        const sheetId = `sheet-${Date.now().toString(36)}-${nextNum}-${this.monotonicIdCounter}`;
        const uniqueName = this.makeUniqueWorksheetName(workbook, name || `Sheet ${nextNum}`);
        const ws = this.CreateEmptyWorksheet(sheetId, uniqueName, rowCount, colCount);
        workbook.Worksheets.push(ws);
        this.sheetToWorkbook.set(ws, workbook);
        this.workbookDagCache.delete(workbook);
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
        if (sheet.Rows.length < minRow) {
            const existingRowIds = new Set(sheet.Rows.map((r) => r.RowID));
            while (sheet.Rows.length < minRow) {
                const nextIdx = sheet.Rows.length + 1;
                sheet.Rows.push({
                    RowID: this.mintUniqueRowId(sheet.SheetID, existingRowIds, nextIdx),
                    Index: nextIdx,
                    Height: DEFAULT_ROW_HEIGHT,
                    Hidden: false
                });
            }
        }
        if (sheet.Columns.length < minCol) {
            const existingColIds = new Set(sheet.Columns.map((c) => c.ColumnID));
            while (sheet.Columns.length < minCol) {
                const nextIdx = sheet.Columns.length + 1;
                const letter = ColumnIndexToLetter(nextIdx);
                sheet.Columns.push({
                    ColumnID: this.mintUniqueColumnId(sheet.SheetID, existingColIds, nextIdx),
                    Index: nextIdx,
                    Letter: letter,
                    Width: DEFAULT_COLUMN_WIDTH,
                    Hidden: false
                });
            }
        }
    }

    // -----------------------------------------------------------------------
    // Headless Lexical AST + Iterative Topological DAG Formula Evaluator (§ 6.1, O7, D2, D4)
    // -----------------------------------------------------------------------

    /**
     * Synchronously evaluates all standard formulas across all worksheets in `workbook`
     * using an iterative topological DAG traversal (zero JS call-stack recursion across cells).
     *
     * Note: Cells containing `=MJ.QUERY(...)` or `=MJ.VIEW(...)` retain their last viewer-evaluated
     * `ComputedValue` (or `'#MJ_PENDING!'` until `EvaluateMjCustomFunctions` runs with a `UserInfo`).
     */
    public EvaluateWorkbook(workbook: WorkbookSpec): void {
        this.bindSheetsToWorkbook(workbook);

        for (const sheet of workbook.Worksheets) {
            for (const cell of Object.values(sheet.Cells)) {
                if (cell.FormulaStable) {
                    cell.Formula = this.ResolveFormulaFromStableIds(sheet, cell.FormulaStable, workbook);
                }
            }
        }

        const dag = this.buildWorkbookDependencyGraph(workbook);
        this.workbookDagCache.set(workbook, dag);

        const allKeys: string[] = [];
        for (const sheet of workbook.Worksheets) {
            for (const addr of Object.keys(sheet.Cells)) {
                const parsed = ParseCellAddress(addr);
                if (!parsed) continue;
                const canonical = FormatCellAddress(parsed.row, parsed.col);
                allKeys.push(`${sheet.SheetID}::${canonical}`);
            }
        }

        this.evaluateCellKeysIteratively(workbook, dag, allKeys, null);
    }

    /**
     * Incrementally recalculates `canonicalAddr` on `sheet` and ONLY its transitive dependent formula cells
     * in iterative topological order (`D2`).
     */
    private recalculateAfterCellEdit(workbook: WorkbookSpec, sheet: WorksheetSpec, canonicalAddr: string): void {
        const namedSig = JSON.stringify(workbook.NamedRanges);
        const existingDag = this.workbookDagCache.get(workbook);
        if (!existingDag || existingDag.namedRangesSignature !== namedSig) {
            this.EvaluateWorkbook(workbook);
            return;
        }

        const editedKey = `${sheet.SheetID}::${canonicalAddr}`;
        this.updateSingleCellInDag(workbook, sheet, canonicalAddr, existingDag);

        // Collect transitive dependents via iterative BFS
        const dirtySet = new Set<string>([editedKey]);
        const queue: string[] = [editedKey];
        let head = 0;
        while (head < queue.length) {
            const current = queue[head++];
            const dependents = existingDag.reverseCellDeps.get(current);
            if (!dependents) continue;
            for (const depKey of dependents) {
                if (!dirtySet.has(depKey)) {
                    dirtySet.add(depKey);
                    queue.push(depKey);
                }
            }
        }

        this.evaluateCellKeysIteratively(workbook, existingDag, Array.from(dirtySet), dirtySet);
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
        const trimmed = formula.trim();
        const body = trimmed.startsWith('=') ? trimmed.slice(1).trim() : trimmed;
        if (!body) return null;

        // Ensure workbook cells are up-to-date if not yet evaluated
        if (!this.workbookDagCache.has(workbook)) {
            this.EvaluateWorkbook(workbook);
        }
        const ast = compileFormulaAstCached(body);
        return this.evalAstNode(ast, workbook, sheet, null);
    }

    private buildWorkbookDependencyGraph(workbook: WorkbookSpec): WorkbookDependencyGraph {
        const dag: WorkbookDependencyGraph = {
            namedRangesSignature: JSON.stringify(workbook.NamedRanges),
            astByCellKey: new Map<string, FormulaAstNode | null>(),
            directCellDeps: new Map<string, string[]>(),
            reverseCellDeps: new Map<string, Set<string>>(),
            sheetById: new Map<string, WorksheetSpec>()
        };
        for (const ws of workbook.Worksheets) {
            dag.sheetById.set(ws.SheetID, ws);
        }
        for (const ws of workbook.Worksheets) {
            for (const addr of Object.keys(ws.Cells)) {
                const parsed = ParseCellAddress(addr);
                if (!parsed) continue;
                const canonical = FormatCellAddress(parsed.row, parsed.col);
                this.updateSingleCellInDag(workbook, ws, canonical, dag);
            }
        }
        return dag;
    }

    private updateSingleCellInDag(
        workbook: WorkbookSpec,
        sheet: WorksheetSpec,
        canonicalAddr: string,
        dag: WorkbookDependencyGraph
    ): void {
        dag.sheetById.set(sheet.SheetID, sheet);
        const cellKey = `${sheet.SheetID}::${canonicalAddr}`;

        // Remove previous dependency edges
        const oldDeps = dag.directCellDeps.get(cellKey);
        if (oldDeps) {
            for (const dep of oldDeps) {
                const rev = dag.reverseCellDeps.get(dep);
                if (rev) {
                    rev.delete(cellKey);
                    if (rev.size === 0) {
                        dag.reverseCellDeps.delete(dep);
                    }
                }
            }
        }

        const cell = sheet.Cells[canonicalAddr];
        if (!cell || !cell.Formula || !cell.Formula.trim().startsWith('=')) {
            dag.astByCellKey.set(cellKey, null);
            dag.directCellDeps.delete(cellKey);
            return;
        }

        if (this.ParseMjCustomFunctionFormula(cell.Formula)) {
            dag.astByCellKey.set(cellKey, null);
            dag.directCellDeps.delete(cellKey);
            return;
        }

        const exprBody = cell.Formula.trim().slice(1).trim();
        const ast = compileFormulaAstCached(exprBody);
        dag.astByCellKey.set(cellKey, ast);

        const deps = this.extractAstCellDependencies(ast, workbook, sheet);
        dag.directCellDeps.set(cellKey, deps);
        for (const dep of deps) {
            let rev = dag.reverseCellDeps.get(dep);
            if (!rev) {
                rev = new Set<string>();
                dag.reverseCellDeps.set(dep, rev);
            }
            rev.add(cellKey);
        }
    }

    private extractAstCellDependencies(
        root: FormulaAstNode,
        workbook: WorkbookSpec,
        currentSheet: WorksheetSpec
    ): string[] {
        const deps = new Set<string>();
        const stack: FormulaAstNode[] = [root];

        const addRangeDeps = (targetSheet: WorksheetSpec, rangeStr: string): void => {
            const bounds = ParseRangeAddress(rangeStr);
            if (!bounds) return;
            for (let r = bounds.startRow; r <= bounds.endRow; r++) {
                for (let c = bounds.startCol; c <= bounds.endCol; c++) {
                    deps.add(`${targetSheet.SheetID}::${FormatCellAddress(r, c)}`);
                }
            }
        };

        while (stack.length > 0) {
            const node = stack.pop()!;
            switch (node.kind) {
                case 'CellRef': {
                    const ws = node.sheetName ? this.GetWorksheet(workbook, node.sheetName) : currentSheet;
                    const pos = ParseCellAddress(node.address);
                    if (ws && pos) {
                        deps.add(`${ws.SheetID}::${FormatCellAddress(pos.row, pos.col)}`);
                    }
                    break;
                }
                case 'RangeRef': {
                    const ws = node.sheetName ? this.GetWorksheet(workbook, node.sheetName) : currentSheet;
                    if (ws) {
                        addRangeDeps(ws, `${node.startAddress}:${node.endAddress}`);
                    }
                    break;
                }
                case 'Identifier': {
                    const named = workbook.NamedRanges.find(
                        (nr) => nr.Name.toLowerCase() === node.name.toLowerCase()
                    );
                    if (named && named.Range !== '#REF!') {
                        const ws = this.GetWorksheet(workbook, named.SheetID) ?? currentSheet;
                        addRangeDeps(ws, named.Range);
                    }
                    break;
                }
                case 'UnaryOp':
                case 'PostfixPercent':
                    stack.push(node.operand);
                    break;
                case 'BinaryOp':
                    stack.push(node.right, node.left);
                    break;
                case 'FunctionCall':
                    for (let i = node.args.length - 1; i >= 0; i--) {
                        stack.push(node.args[i]);
                    }
                    break;
            }
        }
        return Array.from(deps);
    }

    /**
     * Evaluates `targetKeys` in iterative post-order topological order with explicit cycle detection
     * (`#CYCLE!`), zero JS call-stack recursion across cells, and $O(1)$ lookup for clean cells when
     * `dirtyScope` is non-null.
     */
    private evaluateCellKeysIteratively(
        workbook: WorkbookSpec,
        dag: WorkbookDependencyGraph,
        targetKeys: string[],
        dirtyScope: ReadonlySet<string> | null
    ): void {
        // state: 1 = currently on active DFS path (visiting), 2 = evaluated
        const state = new Map<string, 1 | 2>();
        const memo = new Map<string, SpreadsheetCellValue>();
        const inCycle = new Set<string>();

        interface WorkFrame {
            key: string;
            depsScheduled: boolean;
        }
        const workStack: WorkFrame[] = [];

        const readCleanOrEmptyCell = (key: string): SpreadsheetCellValue => {
            const sep = key.indexOf('::');
            const sheetId = key.slice(0, sep);
            const addr = key.slice(sep + 2);
            const ws = dag.sheetById.get(sheetId);
            const cell = ws?.Cells[addr];
            if (!cell) return null;
            if (!cell.Formula || !cell.Formula.trim().startsWith('=')) {
                return cell.RawValue ?? null;
            }
            return cell.ComputedValue !== undefined ? cell.ComputedValue : null;
        };

        const writeEvaluatedValue = (key: string, val: SpreadsheetCellValue): void => {
            memo.set(key, val);
            state.set(key, 2);
            const sep = key.indexOf('::');
            const sheetId = key.slice(0, sep);
            const addr = key.slice(sep + 2);
            const ws = dag.sheetById.get(sheetId);
            const cell = ws?.Cells[addr];
            if (cell && ws) {
                cell.ComputedValue = val;
                cell.DisplayValue = this.formatCellForDisplay(cell);
                this.validateCellAgainstSheetRules(ws, cell);
            }
        };

        for (const rootKey of targetKeys) {
            if (state.get(rootKey) === 2) continue;
            workStack.push({ key: rootKey, depsScheduled: false });

            while (workStack.length > 0) {
                const top = workStack[workStack.length - 1];
                const curState = state.get(top.key);
                if (curState === 2) {
                    workStack.pop();
                    continue;
                }

                const sep = top.key.indexOf('::');
                const sheetId = top.key.slice(0, sep);
                const addr = top.key.slice(sep + 2);
                const ws = dag.sheetById.get(sheetId);
                const cell = ws?.Cells[addr];

                if (!cell || !ws) {
                    memo.set(top.key, null);
                    state.set(top.key, 2);
                    workStack.pop();
                    continue;
                }

                // Non-formula scalar cell
                if (!cell.Formula || !cell.Formula.trim().startsWith('=')) {
                    writeEvaluatedValue(top.key, cell.RawValue ?? null);
                    workStack.pop();
                    continue;
                }

                // Viewer-scoped =MJ.QUERY / =MJ.VIEW custom function cell
                if (this.ParseMjCustomFunctionFormula(cell.Formula)) {
                    const mjVal: SpreadsheetCellValue = cell.AccessDenied
                        ? '#MJ_ACCESS_DENIED!'
                        : cell.ComputedValue !== undefined && cell.ComputedValue !== null
                          ? cell.ComputedValue
                          : '#MJ_PENDING!';
                    writeEvaluatedValue(top.key, mjVal);
                    workStack.pop();
                    continue;
                }

                if (!top.depsScheduled) {
                    state.set(top.key, 1);
                    top.depsScheduled = true;

                    const deps = dag.directCellDeps.get(top.key) ?? [];
                    let foundCycleHere = false;
                    for (let i = deps.length - 1; i >= 0; i--) {
                        const depKey = deps[i];
                        const depState = state.get(depKey);
                        if (depState === 1) {
                            foundCycleHere = true;
                            inCycle.add(depKey);
                            for (let s = workStack.length - 1; s >= 0; s--) {
                                inCycle.add(workStack[s].key);
                                if (workStack[s].key === depKey) break;
                            }
                        } else if (depState !== 2) {
                            if (dirtyScope && !dirtyScope.has(depKey)) {
                                memo.set(depKey, readCleanOrEmptyCell(depKey));
                                state.set(depKey, 2);
                            } else {
                                workStack.push({ key: depKey, depsScheduled: false });
                            }
                        }
                    }

                    if (foundCycleHere && inCycle.has(top.key)) {
                        // Still allow remaining stack unwinding to mark every cycle member as #CYCLE!
                    }
                    continue;
                }

                // All precedents are now evaluated!
                workStack.pop();
                if (inCycle.has(top.key)) {
                    writeEvaluatedValue(top.key, '#CYCLE!');
                    continue;
                }

                const ast = dag.astByCellKey.get(top.key) ?? compileFormulaAstCached(cell.Formula.trim().slice(1).trim());
                let computed: SpreadsheetCellValue;
                try {
                    computed = this.evalAstNode(ast, workbook, ws, (lookupSheet, lookupAddr) => {
                        const p = ParseCellAddress(lookupAddr);
                        if (!p) return '#REF!';
                        const k = `${lookupSheet.SheetID}::${FormatCellAddress(p.row, p.col)}`;
                        if (memo.has(k)) return memo.get(k) ?? null;
                        return readCleanOrEmptyCell(k);
                    });
                } catch {
                    computed = '#VALUE!';
                }
                writeEvaluatedValue(top.key, computed);
            }
        }
    }

    private evalAstNode(
        node: FormulaAstNode,
        workbook: WorkbookSpec,
        sheet: WorksheetSpec,
        cellLookup: ((targetSheet: WorksheetSpec, addr: string) => SpreadsheetCellValue) | null
    ): SpreadsheetCellValue {
        const getCellVal = (targetSheet: WorksheetSpec, addr: string): SpreadsheetCellValue => {
            if (cellLookup) {
                return cellLookup(targetSheet, addr);
            }
            const parsed = ParseCellAddress(addr);
            if (!parsed) return '#REF!';
            const canonical = FormatCellAddress(parsed.row, parsed.col);
            const c = targetSheet.Cells[canonical];
            if (!c) return null;
            if (c.Formula && c.Formula.trim().startsWith('=')) {
                return c.ComputedValue !== undefined ? c.ComputedValue : null;
            }
            return c.RawValue ?? null;
        };

        switch (node.kind) {
            case 'EmptyArg':
                return null;
            case 'NumberLiteral':
                return node.value;
            case 'StringLiteral':
                return node.value;
            case 'BooleanLiteral':
                return node.value;
            case 'ErrorLiteral':
                return node.error;
            case 'CellRef': {
                const targetSheet = node.sheetName ? this.GetWorksheet(workbook, node.sheetName) : sheet;
                if (!targetSheet) return '#REF!';
                return getCellVal(targetSheet, node.address);
            }
            case 'RangeRef': {
                const matrix = this.resolveAstRangeMatrix(node, workbook, sheet, getCellVal);
                return matrix[0]?.[0] ?? null;
            }
            case 'Identifier': {
                const upper = node.name.toUpperCase();
                if (upper === 'TRUE') return true;
                if (upper === 'FALSE') return false;
                const named = workbook.NamedRanges.find((nr) => nr.Name.toLowerCase() === node.name.toLowerCase());
                if (named) {
                    if (named.Range === '#REF!') return '#REF!';
                    const targetSheet = this.GetWorksheet(workbook, named.SheetID) ?? sheet;
                    if (ParseCellAddress(named.Range)) {
                        return getCellVal(targetSheet, named.Range);
                    }
                    const bounds = ParseRangeAddress(named.Range);
                    if (!bounds) return '#REF!';
                    return getCellVal(targetSheet, FormatCellAddress(bounds.startRow, bounds.startCol));
                }
                return '#NAME?';
            }
            case 'PostfixPercent': {
                const v = this.evalAstNode(node.operand, workbook, sheet, cellLookup);
                if (this.isErrorValue(v)) return v;
                const n = this.toNumberOrError(v);
                if (typeof n === 'string') return n;
                return cleanExcelFloat(n / 100);
            }
            case 'UnaryOp': {
                const v = this.evalAstNode(node.operand, workbook, sheet, cellLookup);
                if (this.isErrorValue(v)) return v;
                const n = this.toNumberOrError(v);
                if (typeof n === 'string') return n;
                return node.op === '-' ? (n === 0 ? 0 : -n) : n;
            }
            case 'BinaryOp': {
                const left = this.evalAstNode(node.left, workbook, sheet, cellLookup);
                if (this.isErrorValue(left)) return left;
                const right = this.evalAstNode(node.right, workbook, sheet, cellLookup);
                if (this.isErrorValue(right)) return right;

                switch (node.op) {
                    case '=':
                    case '<>':
                    case '<':
                    case '<=':
                    case '>':
                    case '>=':
                        return this.compareValues(left, right, node.op);
                    case '&':
                        return `${left ?? ''}${right ?? ''}`;
                    case '+':
                    case '-':
                    case '*':
                    case '/':
                    case '^': {
                        const nl = this.toNumberOrError(left);
                        if (typeof nl === 'string') return nl;
                        const nr = this.toNumberOrError(right);
                        if (typeof nr === 'string') return nr;
                        if (node.op === '+') return cleanExcelFloat(nl + nr);
                        if (node.op === '-') return cleanExcelFloat(nl - nr);
                        if (node.op === '*') return cleanExcelFloat(nl * nr);
                        if (node.op === '/') {
                            if (nr === 0) return '#DIV/0!';
                            return cleanExcelFloat(nl / nr);
                        }
                        const res = Math.pow(nl, nr);
                        return Number.isFinite(res) ? cleanExcelFloat(res) : '#NUM!';
                    }
                }
                return '#VALUE!';
            }
            case 'FunctionCall':
                return this.evalAstFunctionCall(node.name, node.args, workbook, sheet, cellLookup, getCellVal);
        }
    }

    private resolveAstRangeMatrix(
        argNode: FormulaAstNode,
        workbook: WorkbookSpec,
        sheet: WorksheetSpec,
        getCellVal: (targetSheet: WorksheetSpec, addr: string) => SpreadsheetCellValue,
        cellLookup?: ((targetSheet: WorksheetSpec, addr: string) => SpreadsheetCellValue) | null
    ): SpreadsheetCellValue[][] {
        if (argNode.kind === 'RangeRef') {
            const targetSheet = argNode.sheetName ? this.GetWorksheet(workbook, argNode.sheetName) : sheet;
            if (!targetSheet) return [['#REF!']];
            const bounds = ParseRangeAddress(`${argNode.startAddress}:${argNode.endAddress}`);
            if (!bounds) return [['#REF!']];
            const matrix: SpreadsheetCellValue[][] = [];
            for (let r = bounds.startRow; r <= bounds.endRow; r++) {
                const rowVals: SpreadsheetCellValue[] = [];
                for (let c = bounds.startCol; c <= bounds.endCol; c++) {
                    rowVals.push(getCellVal(targetSheet, FormatCellAddress(r, c)));
                }
                matrix.push(rowVals);
            }
            return matrix;
        }
        if (argNode.kind === 'CellRef') {
            const targetSheet = argNode.sheetName ? this.GetWorksheet(workbook, argNode.sheetName) : sheet;
            if (!targetSheet) return [['#REF!']];
            return [[getCellVal(targetSheet, argNode.address)]];
        }
        if (argNode.kind === 'Identifier') {
            const named = workbook.NamedRanges.find((nr) => nr.Name.toLowerCase() === argNode.name.toLowerCase());
            if (named) {
                if (named.Range === '#REF!') return [['#REF!']];
                const targetSheet = this.GetWorksheet(workbook, named.SheetID) ?? sheet;
                const bounds = ParseRangeAddress(named.Range);
                if (!bounds) return [['#REF!']];
                const matrix: SpreadsheetCellValue[][] = [];
                for (let r = bounds.startRow; r <= bounds.endRow; r++) {
                    const rowVals: SpreadsheetCellValue[] = [];
                    for (let c = bounds.startCol; c <= bounds.endCol; c++) {
                        rowVals.push(getCellVal(targetSheet, FormatCellAddress(r, c)));
                    }
                    matrix.push(rowVals);
                }
                return matrix;
            }
        }
        return [[this.evalAstNode(argNode, workbook, sheet, cellLookup ?? null)]];
    }

    private evalAstFunctionCall(
        rawFnName: string,
        args: FormulaAstNode[],
        workbook: WorkbookSpec,
        sheet: WorksheetSpec,
        cellLookup: ((targetSheet: WorksheetSpec, addr: string) => SpreadsheetCellValue) | null,
        getCellVal: (targetSheet: WorksheetSpec, addr: string) => SpreadsheetCellValue
    ): SpreadsheetCellValue {
        const fnName = rawFnName.toUpperCase();
        const evalScalar = (arg?: FormulaAstNode): SpreadsheetCellValue =>
            arg ? this.evalAstNode(arg, workbook, sheet, cellLookup) : null;
        const isArgProvided = (idx: number): boolean => idx < args.length && args[idx].kind !== 'EmptyArg';
        const isDirectRangeOrRef = (arg: FormulaAstNode): boolean =>
            arg.kind === 'RangeRef' ||
            arg.kind === 'CellRef' ||
            (arg.kind === 'Identifier' &&
                workbook.NamedRanges.some((nr) => nr.Name.toLowerCase() === arg.name.toLowerCase()));

        const resolveFlattenedRange = (arg?: FormulaAstNode): SpreadsheetCellValue[] => {
            if (!arg) return [];
            const matrix = this.resolveAstRangeMatrix(arg, workbook, sheet, getCellVal, cellLookup);
            const flat: SpreadsheetCellValue[] = [];
            for (const r of matrix) flat.push(...r);
            return flat;
        };

        // Collect values distinguishing range cells (where text/booleans are ignored in SUM/AVERAGE) from direct scalar args
        const collectAggregateNumbers = (coerceDirectScalars: boolean): number[] | string => {
            const nums: number[] = [];
            for (const arg of args) {
                if (arg.kind === 'EmptyArg') {
                    if (coerceDirectScalars) nums.push(0);
                    continue;
                }
                if (isDirectRangeOrRef(arg)) {
                    const flat = resolveFlattenedRange(arg);
                    for (const v of flat) {
                        if (this.isErrorValue(v)) return v as string;
                        if (typeof v === 'number' && !Number.isNaN(v)) {
                            nums.push(v);
                        }
                    }
                } else {
                    const v = evalScalar(arg);
                    if (this.isErrorValue(v)) return v as string;
                    if (coerceDirectScalars) {
                        const n = this.toNumberOrError(v);
                        if (typeof n === 'string') return n;
                        nums.push(n);
                    } else if (typeof v === 'number' && !Number.isNaN(v)) {
                        nums.push(v);
                    }
                }
            }
            return nums;
        };

        switch (fnName) {
            case 'SUM': {
                const nums = collectAggregateNumbers(true);
                if (typeof nums === 'string') return nums;
                let sum = 0;
                for (const n of nums) sum += n;
                return cleanExcelFloat(sum);
            }
            case 'AVERAGE':
            case 'AVG': {
                const nums = collectAggregateNumbers(true);
                if (typeof nums === 'string') return nums;
                if (nums.length === 0) return '#DIV/0!';
                let sum = 0;
                for (const n of nums) sum += n;
                return cleanExcelFloat(sum / nums.length);
            }
            case 'COUNT': {
                let count = 0;
                for (const arg of args) {
                    if (arg.kind === 'EmptyArg') continue;
                    if (isDirectRangeOrRef(arg)) {
                        for (const v of resolveFlattenedRange(arg)) {
                            if (typeof v === 'number' && !Number.isNaN(v)) count++;
                        }
                    } else {
                        const v = evalScalar(arg);
                        if (typeof v === 'number' && !Number.isNaN(v)) count++;
                        else if (typeof v === 'string' && v.trim() !== '' && !this.isErrorValue(v) && !Number.isNaN(Number(v))) {
                            count++;
                        }
                    }
                }
                return count;
            }
            case 'COUNTA': {
                let count = 0;
                for (const arg of args) {
                    if (arg.kind === 'EmptyArg') continue;
                    if (isDirectRangeOrRef(arg)) {
                        for (const v of resolveFlattenedRange(arg)) {
                            if (v !== null && v !== undefined && v !== '') count++;
                        }
                    } else {
                        const v = evalScalar(arg);
                        if (v !== null && v !== undefined && v !== '') count++;
                    }
                }
                return count;
            }
            case 'MIN': {
                const nums = collectAggregateNumbers(true);
                if (typeof nums === 'string') return nums;
                return nums.length > 0 ? Math.min(...nums) : 0;
            }
            case 'MAX': {
                const nums = collectAggregateNumbers(true);
                if (typeof nums === 'string') return nums;
                return nums.length > 0 ? Math.max(...nums) : 0;
            }
            case 'MEDIAN': {
                const nums = collectAggregateNumbers(true);
                if (typeof nums === 'string') return nums;
                if (nums.length === 0) return '#NUM!';
                nums.sort((a, b) => a - b);
                const mid = Math.floor(nums.length / 2);
                return nums.length % 2 === 0 ? cleanExcelFloat((nums[mid - 1] + nums[mid]) / 2) : nums[mid];
            }
            case 'SUMPRODUCT': {
                if (args.length === 0) return '#VALUE!';
                const matrices = args.map((a) => this.resolveAstRangeMatrix(a, workbook, sheet, getCellVal, cellLookup));
                const rCount = matrices[0].length;
                const cCount = matrices[0][0]?.length ?? 0;
                for (const m of matrices) {
                    if (m.length !== rCount || (m[0]?.length ?? 0) !== cCount) {
                        return '#VALUE!';
                    }
                }
                let total = 0;
                for (let r = 0; r < rCount; r++) {
                    for (let c = 0; c < cCount; c++) {
                        let rowProd = 1;
                        for (let mIdx = 0; mIdx < matrices.length; mIdx++) {
                            const cellVal = matrices[mIdx][r][c];
                            if (this.isErrorValue(cellVal)) return cellVal;
                            const num = typeof cellVal === 'number' && !Number.isNaN(cellVal) ? cellVal : 0;
                            rowProd *= num;
                        }
                        total += rowProd;
                    }
                }
                return cleanExcelFloat(total);
            }
            case 'ROUND':
            case 'ROUNDUP':
            case 'ROUNDDOWN': {
                const numVal = this.toNumberOrError(evalScalar(args[0]));
                if (typeof numVal === 'string') return numVal;
                const digitsVal = isArgProvided(1) ? this.toNumberOrError(evalScalar(args[1])) : 0;
                if (typeof digitsVal === 'string') return digitsVal;
                const digits = Math.trunc(digitsVal);
                if (numVal === 0) return 0;
                const sign = numVal < 0 ? -1 : 1;
                const absClean = cleanExcelFloat(Math.abs(numVal));
                const shifted = decimalShift(absClean, digits);
                let roundedInt: number;
                if (fnName === 'ROUNDUP') {
                    roundedInt = Math.ceil(cleanExcelFloat(shifted));
                } else if (fnName === 'ROUNDDOWN') {
                    roundedInt = Math.floor(cleanExcelFloat(shifted));
                } else {
                    // Excel half-away-from-zero rounding (ROUND(-2.5, 0) -> -3; ROUND(1.005, 2) -> 1.01)
                    roundedInt = Math.floor(cleanExcelFloat(shifted) + 0.5);
                }
                const result = sign * decimalShift(roundedInt, -digits);
                return result === 0 ? 0 : cleanExcelFloat(result);
            }
            case 'INT': {
                const v = this.toNumberOrError(evalScalar(args[0]));
                return typeof v === 'string' ? v : Math.floor(v);
            }
            case 'ABS': {
                const v = this.toNumberOrError(evalScalar(args[0]));
                return typeof v === 'string' ? v : Math.abs(v);
            }
            case 'SQRT': {
                const v = this.toNumberOrError(evalScalar(args[0]));
                if (typeof v === 'string') return v;
                return v < 0 ? '#NUM!' : cleanExcelFloat(Math.sqrt(v));
            }
            case 'POWER': {
                const base = this.toNumberOrError(evalScalar(args[0]));
                if (typeof base === 'string') return base;
                const exp = this.toNumberOrError(isArgProvided(1) ? evalScalar(args[1]) : 1);
                if (typeof exp === 'string') return exp;
                const res = Math.pow(base, exp);
                return Number.isFinite(res) ? cleanExcelFloat(res) : '#NUM!';
            }
            case 'MOD': {
                const n = this.toNumberOrError(evalScalar(args[0]));
                if (typeof n === 'string') return n;
                const d = this.toNumberOrError(isArgProvided(1) ? evalScalar(args[1]) : 1);
                if (typeof d === 'string') return d;
                if (d === 0) return '#DIV/0!';
                // Excel MOD uses floored division: MOD(-1, 3) -> 2
                const modVal = n - d * Math.floor(n / d);
                return modVal === 0 ? 0 : cleanExcelFloat(modVal);
            }
            case 'IF': {
                const cond = evalScalar(args[0]);
                if (this.isErrorValue(cond)) return cond;
                const truthy = this.toBooleanOrError(cond);
                if (typeof truthy === 'string') return truthy;
                if (truthy) {
                    return isArgProvided(1) ? (evalScalar(args[1]) ?? 0) : (args.length >= 2 ? 0 : true);
                }
                return isArgProvided(2) ? (evalScalar(args[2]) ?? 0) : (args.length >= 3 ? 0 : false);
            }
            case 'IFS': {
                for (let i = 0; i + 1 < args.length; i += 2) {
                    const cond = evalScalar(args[i]);
                    if (this.isErrorValue(cond)) return cond;
                    const truthy = this.toBooleanOrError(cond);
                    if (typeof truthy === 'string') return truthy;
                    if (truthy) {
                        return evalScalar(args[i + 1]);
                    }
                }
                return '#N/A';
            }
            case 'IFERROR': {
                const primary = evalScalar(args[0]);
                if (this.isErrorValue(primary)) {
                    return evalScalar(args[1]) ?? '';
                }
                return primary;
            }
            case 'IFNA': {
                // Catches #N/A ONLY (distinct from IFERROR!)
                const primary = evalScalar(args[0]);
                if (primary === '#N/A') {
                    return evalScalar(args[1]) ?? '';
                }
                return primary;
            }
            case 'AND': {
                let sawBoolean = false;
                for (const arg of args) {
                    if (arg.kind === 'EmptyArg') continue;
                    const vals = isDirectRangeOrRef(arg) ? resolveFlattenedRange(arg) : [evalScalar(arg)];
                    for (const v of vals) {
                        if (this.isErrorValue(v)) return v;
                        if (v === null || v === undefined || (typeof v === 'string' && isDirectRangeOrRef(arg))) continue;
                        const b = this.toBooleanOrError(v);
                        if (typeof b === 'string') return b;
                        sawBoolean = true;
                        if (!b) return false;
                    }
                }
                return sawBoolean ? true : '#VALUE!';
            }
            case 'OR': {
                let sawBoolean = false;
                for (const arg of args) {
                    if (arg.kind === 'EmptyArg') continue;
                    const vals = isDirectRangeOrRef(arg) ? resolveFlattenedRange(arg) : [evalScalar(arg)];
                    for (const v of vals) {
                        if (this.isErrorValue(v)) return v;
                        if (v === null || v === undefined || (typeof v === 'string' && isDirectRangeOrRef(arg))) continue;
                        const b = this.toBooleanOrError(v);
                        if (typeof b === 'string') return b;
                        sawBoolean = true;
                        if (b) return true;
                    }
                }
                return sawBoolean ? false : '#VALUE!';
            }
            case 'NOT': {
                const v = evalScalar(args[0]);
                if (this.isErrorValue(v)) return v;
                const b = this.toBooleanOrError(v);
                return typeof b === 'string' ? b : !b;
            }
            case 'ISBLANK': {
                const v = evalScalar(args[0]);
                return v === null || v === undefined;
            }
            case 'ISNUMBER': {
                const v = evalScalar(args[0]);
                return typeof v === 'number' && !Number.isNaN(v);
            }
            case 'ISTEXT': {
                const v = evalScalar(args[0]);
                return typeof v === 'string' && !this.isErrorValue(v);
            }
            case 'ISERROR': {
                const v = evalScalar(args[0]);
                return this.isErrorValue(v);
            }
            case 'ISNA': {
                const v = evalScalar(args[0]);
                return v === '#N/A';
            }
            case 'CONCAT':
            case 'CONCATENATE': {
                const parts: string[] = [];
                for (const arg of args) {
                    const vals = isDirectRangeOrRef(arg) ? resolveFlattenedRange(arg) : [evalScalar(arg)];
                    for (const v of vals) {
                        if (this.isErrorValue(v)) return v;
                        if (v !== null && v !== undefined) {
                            parts.push(typeof v === 'boolean' ? (v ? 'TRUE' : 'FALSE') : String(v));
                        }
                    }
                }
                return parts.join('');
            }
            case 'UPPER': {
                const v = evalScalar(args[0]);
                return this.isErrorValue(v) ? v : String(v ?? '').toUpperCase();
            }
            case 'LOWER': {
                const v = evalScalar(args[0]);
                return this.isErrorValue(v) ? v : String(v ?? '').toLowerCase();
            }
            case 'TRIM': {
                const v = evalScalar(args[0]);
                return this.isErrorValue(v) ? v : String(v ?? '').trim().replace(/\s+/g, ' ');
            }
            case 'LEN': {
                const v = evalScalar(args[0]);
                return this.isErrorValue(v) ? v : String(v ?? '').length;
            }
            case 'LEFT': {
                const rawText = evalScalar(args[0]);
                if (this.isErrorValue(rawText)) return rawText;
                const text = String(rawText ?? '');
                let len = 1;
                if (isArgProvided(1)) {
                    const lenNum = this.toNumberOrError(evalScalar(args[1]));
                    if (typeof lenNum === 'string') return lenNum;
                    if (lenNum < 0) return '#VALUE!';
                    len = Math.trunc(lenNum);
                }
                return text.slice(0, len);
            }
            case 'RIGHT': {
                const rawText = evalScalar(args[0]);
                if (this.isErrorValue(rawText)) return rawText;
                const text = String(rawText ?? '');
                let len = 1;
                if (isArgProvided(1)) {
                    const lenNum = this.toNumberOrError(evalScalar(args[1]));
                    if (typeof lenNum === 'string') return lenNum;
                    if (lenNum < 0) return '#VALUE!';
                    len = Math.trunc(lenNum);
                }
                return len === 0 ? '' : text.slice(-len);
            }
            case 'MID': {
                const rawText = evalScalar(args[0]);
                if (this.isErrorValue(rawText)) return rawText;
                const startNum = this.toNumberOrError(evalScalar(args[1]));
                if (typeof startNum === 'string') return startNum;
                const lenNum = this.toNumberOrError(evalScalar(args[2]));
                if (typeof lenNum === 'string') return lenNum;
                const start = Math.trunc(startNum);
                const len = Math.trunc(lenNum);
                if (start < 1 || len < 0) return '#VALUE!';
                return String(rawText ?? '').slice(start - 1, start - 1 + len);
            }
            case 'TEXT': {
                const val = evalScalar(args[0]);
                if (this.isErrorValue(val)) return val;
                const fmtVal = evalScalar(args[1]);
                if (this.isErrorValue(fmtVal)) return fmtVal;
                return this.formatValueWithCustomPattern(val, String(fmtVal ?? ''));
            }
            case 'COUNTIF':
            case 'SUMIF':
            case 'AVERAGEIF': {
                const criteriaRange = resolveFlattenedRange(args[0]);
                const criteria = evalScalar(args[1]);
                if (this.isErrorValue(criteria) && fnName !== 'COUNTIF') {
                    // Allow matching error literals if criteria is a string like "#N/A"
                }
                const targetRange = isArgProvided(2) ? resolveFlattenedRange(args[2]) : criteriaRange;
                let sum = 0;
                let matchCount = 0;
                let numericCount = 0;
                for (let i = 0; i < criteriaRange.length; i++) {
                    if (this.matchesCriteria(criteriaRange[i], criteria)) {
                        matchCount++;
                        const tv = targetRange[i];
                        if (this.isErrorValue(tv) && fnName !== 'COUNTIF') return tv;
                        if (typeof tv === 'number' && !Number.isNaN(tv)) {
                            sum += tv;
                            numericCount++;
                        }
                    }
                }
                if (fnName === 'COUNTIF') return matchCount;
                if (fnName === 'AVERAGEIF') {
                    return numericCount === 0 ? '#DIV/0!' : cleanExcelFloat(sum / numericCount);
                }
                return cleanExcelFloat(sum);
            }
            case 'COUNTIFS': {
                if (args.length < 2 || args.length % 2 !== 0) return '#VALUE!';
                const pairs: Array<{ range: SpreadsheetCellValue[]; crit: SpreadsheetCellValue }> = [];
                for (let i = 0; i < args.length; i += 2) {
                    const r = resolveFlattenedRange(args[i]);
                    const c = evalScalar(args[i + 1]);
                    if (pairs.length > 0 && r.length !== pairs[0].range.length) return '#VALUE!';
                    pairs.push({ range: r, crit: c });
                }
                const len = pairs[0].range.length;
                let matches = 0;
                for (let idx = 0; idx < len; idx++) {
                    let ok = true;
                    for (const p of pairs) {
                        if (!this.matchesCriteria(p.range[idx], p.crit)) {
                            ok = false;
                            break;
                        }
                    }
                    if (ok) matches++;
                }
                return matches;
            }
            case 'SUMIFS':
            case 'AVERAGEIFS': {
                if (args.length < 3 || (args.length - 1) % 2 !== 0) return '#VALUE!';
                const targetRange = resolveFlattenedRange(args[0]);
                const pairs: Array<{ range: SpreadsheetCellValue[]; crit: SpreadsheetCellValue }> = [];
                for (let i = 1; i < args.length; i += 2) {
                    const r = resolveFlattenedRange(args[i]);
                    if (r.length !== targetRange.length) return '#VALUE!';
                    const c = evalScalar(args[i + 1]);
                    pairs.push({ range: r, crit: c });
                }
                let sum = 0;
                let numericCount = 0;
                for (let idx = 0; idx < targetRange.length; idx++) {
                    let ok = true;
                    for (const p of pairs) {
                        if (!this.matchesCriteria(p.range[idx], p.crit)) {
                            ok = false;
                            break;
                        }
                    }
                    if (ok) {
                        const tv = targetRange[idx];
                        if (this.isErrorValue(tv)) return tv;
                        if (typeof tv === 'number' && !Number.isNaN(tv)) {
                            sum += tv;
                            numericCount++;
                        }
                    }
                }
                if (fnName === 'AVERAGEIFS') {
                    return numericCount === 0 ? '#DIV/0!' : cleanExcelFloat(sum / numericCount);
                }
                return cleanExcelFloat(sum);
            }
            case 'VLOOKUP': {
                const lookupVal = evalScalar(args[0]);
                if (this.isErrorValue(lookupVal)) return lookupVal;
                const matrix = this.resolveAstRangeMatrix(args[1], workbook, sheet, getCellVal, cellLookup);
                const colNum = this.toNumberOrError(evalScalar(args[2]));
                if (typeof colNum === 'string') return colNum;
                const colIdx = Math.trunc(colNum);
                if (colIdx < 1) return '#VALUE!';
                const maxCols = matrix[0]?.length ?? 0;
                if (colIdx > maxCols) return '#REF!';

                let isApprox = true;
                if (isArgProvided(3)) {
                    const approxRaw = evalScalar(args[3]);
                    if (this.isErrorValue(approxRaw)) return approxRaw;
                    const approxBool = this.toBooleanOrError(approxRaw);
                    if (typeof approxBool === 'string') return approxBool;
                    isApprox = approxBool;
                }

                if (!isApprox) {
                    for (const row of matrix) {
                        const candidate = row[0] ?? null;
                        if (candidate === null || this.isErrorValue(candidate)) continue;
                        if (typeof lookupVal === 'string' && hasExcelWildcard(lookupVal)) {
                            if (buildExcelWildcardRegex(lookupVal).test(String(candidate))) {
                                return row[colIdx - 1] ?? null;
                            }
                        } else if (this.strictLookupEqual(candidate, lookupVal)) {
                            return row[colIdx - 1] ?? null;
                        }
                    }
                    return '#N/A';
                }

                // Approximate match (TRUE / omitted): largest value <= lookupVal of matching type
                let bestRowIdx = -1;
                let bestVal: SpreadsheetCellValue = null;
                for (let r = 0; r < matrix.length; r++) {
                    const candidate = matrix[r][0] ?? null;
                    if (candidate === null || this.isErrorValue(candidate)) continue;
                    const cmp = this.compareSameTypeForLookup(candidate, lookupVal);
                    if (cmp !== null && cmp <= 0) {
                        if (bestRowIdx === -1) {
                            bestRowIdx = r;
                            bestVal = candidate;
                        } else {
                            const vsBest = this.compareSameTypeForLookup(candidate, bestVal);
                            if (vsBest !== null && vsBest >= 0) {
                                bestRowIdx = r;
                                bestVal = candidate;
                            }
                        }
                    }
                }
                return bestRowIdx >= 0 ? (matrix[bestRowIdx][colIdx - 1] ?? null) : '#N/A';
            }
            case 'XLOOKUP': {
                const lookupVal = evalScalar(args[0]);
                if (this.isErrorValue(lookupVal)) return lookupVal;
                const lookupArr = resolveFlattenedRange(args[1]);
                const returnArr = resolveFlattenedRange(args[2]);
                if (lookupArr.length === 0 || lookupArr.length !== returnArr.length) return '#VALUE!';

                let matchMode = 0;
                if (isArgProvided(4)) {
                    const mm = this.toNumberOrError(evalScalar(args[4]));
                    if (typeof mm === 'string') return mm;
                    matchMode = Math.trunc(mm);
                }
                let searchMode = 1;
                if (isArgProvided(5)) {
                    const sm = this.toNumberOrError(evalScalar(args[5]));
                    if (typeof sm === 'string') return sm;
                    searchMode = Math.trunc(sm);
                }

                const indices: number[] = [];
                if (searchMode === -1) {
                    for (let i = lookupArr.length - 1; i >= 0; i--) indices.push(i);
                } else {
                    for (let i = 0; i < lookupArr.length; i++) indices.push(i);
                }

                // Exact or wildcard pass first
                for (const i of indices) {
                    const cand = lookupArr[i];
                    if (cand === null || this.isErrorValue(cand)) continue;
                    if (matchMode === 2 && typeof lookupVal === 'string') {
                        if (buildExcelWildcardRegex(lookupVal).test(String(cand))) return returnArr[i] ?? null;
                    } else if (this.strictLookupEqual(cand, lookupVal)) {
                        return returnArr[i] ?? null;
                    }
                }

                if (matchMode === -1 || matchMode === 1) {
                    let bestIdx = -1;
                    let bestVal: SpreadsheetCellValue = null;
                    for (const i of indices) {
                        const cand = lookupArr[i];
                        if (cand === null || this.isErrorValue(cand)) continue;
                        const cmp = this.compareSameTypeForLookup(cand, lookupVal);
                        if (cmp === null) continue;
                        if (matchMode === -1 && cmp < 0) {
                            if (bestIdx === -1 || (this.compareSameTypeForLookup(cand, bestVal) ?? -1) > 0) {
                                bestIdx = i;
                                bestVal = cand;
                            }
                        } else if (matchMode === 1 && cmp > 0) {
                            if (bestIdx === -1 || (this.compareSameTypeForLookup(cand, bestVal) ?? 1) < 0) {
                                bestIdx = i;
                                bestVal = cand;
                            }
                        }
                    }
                    if (bestIdx >= 0) return returnArr[bestIdx] ?? null;
                }

                return isArgProvided(3) ? evalScalar(args[3]) : '#N/A';
            }
            case 'INDEX': {
                const matrix = this.resolveAstRangeMatrix(args[0], workbook, sheet, getCellVal, cellLookup);
                const rows = matrix.length;
                const cols = matrix[0]?.length ?? 0;
                if (rows === 0 || cols === 0) return '#REF!';
                if (rows === 1 && cols === 1 && matrix[0][0] === '#REF!') return '#REF!';

                const firstNum = this.toNumberOrError(evalScalar(args[1]));
                if (typeof firstNum === 'string') return firstNum;
                const idx1 = Math.trunc(firstNum);

                if (!isArgProvided(2)) {
                    // 1D horizontal range (e.g. INDEX(B1:D1, 2)) indexes across columns when 3rd arg is omitted!
                    if (rows === 1 && cols > 1) {
                        if (idx1 < 1 || idx1 > cols) return '#REF!';
                        return matrix[0][idx1 - 1] ?? null;
                    }
                    if (idx1 < 1 || idx1 > rows) return '#REF!';
                    return matrix[idx1 - 1][0] ?? null;
                }

                const secondNum = this.toNumberOrError(evalScalar(args[2]));
                if (typeof secondNum === 'string') return secondNum;
                const idx2 = Math.trunc(secondNum);
                if (idx1 < 1 || idx2 < 1 || idx1 > rows || idx2 > cols) return '#REF!';
                return matrix[idx1 - 1][idx2 - 1] ?? null;
            }
            case 'MATCH': {
                const lookupVal = evalScalar(args[0]);
                if (this.isErrorValue(lookupVal)) return lookupVal;
                const vals = resolveFlattenedRange(args[1]);
                let matchType = 1;
                if (isArgProvided(2)) {
                    const mt = this.toNumberOrError(evalScalar(args[2]));
                    if (typeof mt === 'string') return mt;
                    matchType = Math.trunc(mt);
                }

                if (matchType === 0) {
                    for (let i = 0; i < vals.length; i++) {
                        const cand = vals[i];
                        if (cand === null || this.isErrorValue(cand)) continue;
                        if (typeof lookupVal === 'string' && hasExcelWildcard(lookupVal)) {
                            if (buildExcelWildcardRegex(lookupVal).test(String(cand))) return i + 1;
                        } else if (this.strictLookupEqual(cand, lookupVal)) {
                            return i + 1;
                        }
                    }
                    return '#N/A';
                }

                let bestIdx = -1;
                let bestVal: SpreadsheetCellValue = null;
                for (let i = 0; i < vals.length; i++) {
                    const cand = vals[i];
                    if (cand === null || this.isErrorValue(cand)) continue;
                    const cmp = this.compareSameTypeForLookup(cand, lookupVal);
                    if (cmp === null) continue;
                    if (matchType > 0 && cmp <= 0) {
                        if (bestIdx === -1 || (this.compareSameTypeForLookup(cand, bestVal) ?? -1) >= 0) {
                            bestIdx = i;
                            bestVal = cand;
                        }
                    } else if (matchType < 0 && cmp >= 0) {
                        if (bestIdx === -1 || (this.compareSameTypeForLookup(cand, bestVal) ?? 1) <= 0) {
                            bestIdx = i;
                            bestVal = cand;
                        }
                    }
                }
                return bestIdx >= 0 ? bestIdx + 1 : '#N/A';
            }
            case 'TODAY': {
                const now = new Date();
                return Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()) / 86_400_000 + EXCEL_EPOCH_OFFSET_DAYS;
            }
            case 'NOW': {
                return cleanExcelFloat(Date.now() / 86_400_000 + EXCEL_EPOCH_OFFSET_DAYS);
            }
            case 'DATE': {
                const y = this.toNumberOrError(evalScalar(args[0]));
                if (typeof y === 'string') return y;
                const m = this.toNumberOrError(evalScalar(args[1]));
                if (typeof m === 'string') return m;
                const d = this.toNumberOrError(evalScalar(args[2]));
                if (typeof d === 'string') return d;
                const yi = Math.trunc(y);
                const fullYear = yi >= 0 && yi < 1900 ? 1900 + yi : yi;
                if (fullYear < 1900 || fullYear > 9999) return '#NUM!';
                const utcMs = Date.UTC(fullYear, Math.trunc(m) - 1, Math.trunc(d));
                return Math.round(utcMs / 86_400_000) + EXCEL_EPOCH_OFFSET_DAYS;
            }
            case 'YEAR':
            case 'MONTH':
            case 'DAY': {
                const serial = this.toExcelDateSerialOrError(evalScalar(args[0]));
                if (typeof serial === 'string') return serial;
                const dt = excelSerialToUtcDate(serial);
                if (fnName === 'YEAR') return dt.getUTCFullYear();
                if (fnName === 'MONTH') return dt.getUTCMonth() + 1;
                return dt.getUTCDate();
            }
            case 'DAYS': {
                const endSerial = this.toExcelDateSerialOrError(evalScalar(args[0]));
                if (typeof endSerial === 'string') return endSerial;
                const startSerial = this.toExcelDateSerialOrError(evalScalar(args[1]));
                if (typeof startSerial === 'string') return startSerial;
                return Math.trunc(endSerial) - Math.trunc(startSerial);
            }
            case 'EDATE':
            case 'EOMONTH': {
                const startSerial = this.toExcelDateSerialOrError(evalScalar(args[0]));
                if (typeof startSerial === 'string') return startSerial;
                const monthsNum = this.toNumberOrError(evalScalar(args[1]));
                if (typeof monthsNum === 'string') return monthsNum;
                const dt = excelSerialToUtcDate(startSerial);
                const y = dt.getUTCFullYear();
                const m0 = dt.getUTCMonth() + Math.trunc(monthsNum);
                if (fnName === 'EOMONTH') {
                    return Math.round(Date.UTC(y, m0 + 1, 0) / 86_400_000) + EXCEL_EPOCH_OFFSET_DAYS;
                }
                const lastDayOfTarget = new Date(Date.UTC(y, m0 + 1, 0)).getUTCDate();
                const day = Math.min(dt.getUTCDate(), lastDayOfTarget);
                return Math.round(Date.UTC(y, m0, day) / 86_400_000) + EXCEL_EPOCH_OFFSET_DAYS;
            }
            default:
                return '#NAME?';
        }
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
                if (inQuotes && argsStr[i + 1] === '"') {
                    i++;
                    continue;
                }
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

    private isErrorValue(v: SpreadsheetCellValue): v is `#${string}` {
        return typeof v === 'string' && v.startsWith('#') && (v.endsWith('!') || v.endsWith('?') || v === '#N/A');
    }

    private toNumberOrError(v: SpreadsheetCellValue): number | string {
        if (this.isErrorValue(v)) return v;
        if (v === null || v === undefined) return 0;
        if (typeof v === 'number') return Number.isNaN(v) ? '#NUM!' : v;
        if (typeof v === 'boolean') return v ? 1 : 0;
        const trimmed = v.trim();
        if (trimmed === '') return '#VALUE!';
        const n = Number(trimmed);
        return Number.isNaN(n) ? '#VALUE!' : n;
    }

    private toBooleanOrError(v: SpreadsheetCellValue): boolean | string {
        if (this.isErrorValue(v)) return v;
        if (v === null || v === undefined) return false;
        if (typeof v === 'boolean') return v;
        if (typeof v === 'number') return v !== 0;
        const upper = v.trim().toUpperCase();
        if (upper === 'TRUE') return true;
        if (upper === 'FALSE') return false;
        return '#VALUE!';
    }

    private toExcelDateSerialOrError(v: SpreadsheetCellValue): number | string {
        if (this.isErrorValue(v)) return v;
        if (typeof v === 'number') {
            return Number.isFinite(v) ? v : '#NUM!';
        }
        if (typeof v === 'string') {
            const trimmed = v.trim();
            if (!trimmed) return '#VALUE!';
            if (/^[+-]?\d+(\.\d+)?$/.test(trimmed)) {
                return Number(trimmed);
            }
            const isoDateMatch = /^(\d{4})-(\d{1,2})-(\d{1,2})$/.exec(trimmed);
            if (isoDateMatch) {
                const y = parseInt(isoDateMatch[1], 10);
                const m = parseInt(isoDateMatch[2], 10);
                const d = parseInt(isoDateMatch[3], 10);
                return Math.round(Date.UTC(y, m - 1, d) / 86_400_000) + EXCEL_EPOCH_OFFSET_DAYS;
            }
            const parsedMs = Date.parse(trimmed);
            if (!Number.isNaN(parsedMs)) {
                return parsedMs / 86_400_000 + EXCEL_EPOCH_OFFSET_DAYS;
            }
        }
        return '#VALUE!';
    }

    private compareValues(left: SpreadsheetCellValue, right: SpreadsheetCellValue, op: string): boolean {
        // Excel blank (`null`) coerces to 0 against numbers, "" against strings, and FALSE against booleans
        let l = left === undefined ? null : left;
        let r = right === undefined ? null : right;

        if (l === null && r === null) {
            return op === '=' || op === '<=' || op === '>=';
        }
        if (l === null) {
            l = typeof r === 'number' ? 0 : typeof r === 'boolean' ? false : '';
        } else if (r === null) {
            r = typeof l === 'number' ? 0 : typeof l === 'boolean' ? false : '';
        }

        let cmp: number;
        if (typeof l === 'number' && typeof r === 'number') {
            cmp = l === r ? 0 : l < r ? -1 : 1;
        } else if (typeof l === 'string' && typeof r === 'string') {
            const ls = l.toLowerCase();
            const rs = r.toLowerCase();
            cmp = ls === rs ? 0 : ls < rs ? -1 : 1;
        } else if (typeof l === 'boolean' && typeof r === 'boolean') {
            cmp = l === r ? 0 : l ? 1 : -1;
        } else {
            // Excel cross-type ordering: number (1) < text (2) < boolean (3)
            const rank = (x: SpreadsheetCellValue): number =>
                typeof x === 'number' ? 1 : typeof x === 'string' ? 2 : 3;
            cmp = rank(l) - rank(r);
        }

        switch (op) {
            case '=':
                return cmp === 0;
            case '<>':
                return cmp !== 0;
            case '<':
                return cmp < 0;
            case '<=':
                return cmp <= 0;
            case '>':
                return cmp > 0;
            case '>=':
                return cmp >= 0;
            default:
                return false;
        }
    }

    private strictLookupEqual(a: SpreadsheetCellValue, b: SpreadsheetCellValue): boolean {
        if (a === null || b === null) return false;
        if (typeof a === 'number' && typeof b === 'number') return a === b;
        if (typeof a === 'boolean' && typeof b === 'boolean') return a === b;
        if (typeof a === 'string' && typeof b === 'string') {
            return a.toLowerCase() === b.toLowerCase();
        }
        return false;
    }

    private compareSameTypeForLookup(a: SpreadsheetCellValue, b: SpreadsheetCellValue): number | null {
        if (typeof a === 'number' && typeof b === 'number') {
            return a === b ? 0 : a < b ? -1 : 1;
        }
        if (typeof a === 'string' && typeof b === 'string') {
            const la = a.toLowerCase();
            const lb = b.toLowerCase();
            return la === lb ? 0 : la < lb ? -1 : 1;
        }
        if (typeof a === 'boolean' && typeof b === 'boolean') {
            return a === b ? 0 : a ? 1 : -1;
        }
        return null;
    }

    private valuesEqualCaseInsensitive(a: SpreadsheetCellValue, b: SpreadsheetCellValue): boolean {
        if (a === b) return true;
        if (typeof a === 'string' && typeof b === 'string') {
            return a.trim().toLowerCase() === b.trim().toLowerCase();
        }
        return String(a ?? '').toLowerCase() === String(b ?? '').toLowerCase();
    }

    private matchesCriteria(cellVal: SpreadsheetCellValue, criteria: SpreadsheetCellValue): boolean {
        const val = cellVal === undefined ? null : cellVal;
        if (criteria === null || criteria === undefined || criteria === '') {
            return val === null || val === '';
        }
        if (typeof criteria === 'number') {
            if (val === null || typeof val === 'boolean') return false;
            if (typeof val === 'number') return val === criteria;
            const parsed = val.trim() !== '' ? Number(val) : NaN;
            return !Number.isNaN(parsed) && parsed === criteria;
        }
        if (typeof criteria === 'boolean') {
            return val === criteria;
        }

        const critStr = String(criteria);
        const opMatch = /^(<>|<=|>=|=|<|>)(.*)$/.exec(critStr);
        if (opMatch) {
            const op = opMatch[1];
            const rhsRaw = opMatch[2].trim();

            if (rhsRaw === '') {
                if (op === '=') return val === null || val === '';
                if (op === '<>') return val !== null && val !== '';
                return false;
            }

            if (this.isErrorValue(val)) {
                if (op === '=') return val.toUpperCase() === rhsRaw.toUpperCase();
                if (op === '<>') return val.toUpperCase() !== rhsRaw.toUpperCase();
                return false;
            }

            const rhsNum = Number(rhsRaw);
            const rhsIsNumeric = !Number.isNaN(rhsNum);

            if (rhsIsNumeric) {
                if (op === '<>') {
                    if (val === null || typeof val !== 'number') return true;
                    return val !== rhsNum;
                }
                // For =, <, <=, >, >= with numeric RHS, skip blank/null/boolean/non-numeric cells (Excel COUNTIF parity!)
                if (val === null || typeof val !== 'number') {
                    if (op === '=' && typeof val === 'string' && val.trim() !== '' && Number(val) === rhsNum) {
                        return true;
                    }
                    return false;
                }
                switch (op) {
                    case '=':
                        return val === rhsNum;
                    case '<':
                        return val < rhsNum;
                    case '<=':
                        return val <= rhsNum;
                    case '>':
                        return val > rhsNum;
                    case '>=':
                        return val >= rhsNum;
                }
            }

            // Text operator comparison
            if (op === '=' || op === '<>') {
                if (val === null) return op === '<>';
                const matchesText = hasExcelWildcard(rhsRaw)
                    ? buildExcelWildcardRegex(rhsRaw).test(String(val))
                    : String(val).toLowerCase() === rhsRaw.toLowerCase();
                return op === '=' ? matchesText : !matchesText;
            }
            if (typeof val !== 'string') return false;
            const lv = val.toLowerCase();
            const rv = rhsRaw.toLowerCase();
            if (op === '<') return lv < rv;
            if (op === '<=') return lv <= rv;
            if (op === '>') return lv > rv;
            if (op === '>=') return lv >= rv;
            return false;
        }

        if (this.isErrorValue(val)) {
            return val.toUpperCase() === critStr.trim().toUpperCase();
        }
        if (val === null) return false;

        const trimmedCrit = critStr.trim();
        if (trimmedCrit !== '' && !Number.isNaN(Number(trimmedCrit))) {
            const targetNum = Number(trimmedCrit);
            if (typeof val === 'number') return val === targetNum;
            if (typeof val === 'string' && val.trim() !== '' && !Number.isNaN(Number(val))) {
                return Number(val) === targetNum;
            }
            return false;
        }

        if (hasExcelWildcard(critStr)) {
            return buildExcelWildcardRegex(critStr).test(String(val));
        }
        return String(val).toLowerCase() === critStr.toLowerCase();
    }

    // -----------------------------------------------------------------------
    // Cell Formatting & Validation
    // -----------------------------------------------------------------------

    private formatCellForDisplay(cell: SpreadsheetCellSpec): string {
        const val = cell.ComputedValue !== undefined ? cell.ComputedValue : cell.RawValue;
        if (
            typeof val === 'number' &&
            !cell.Style?.FormatType &&
            !cell.Style?.NumberFormatPattern &&
            cell.Formula &&
            isAutoDateFormattedFormula(cell.Formula)
        ) {
            const inferredType: SpreadsheetCellFormatType = /\bNOW\s*\(/i.test(cell.Formula) ? 'datetime' : 'date';
            return this.FormatCellValue(val, { FormatType: inferredType });
        }
        return this.FormatCellValue(val, cell.Style);
    }

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
                case 'date':
                    return formatExcelSerialDate(value, false);
                case 'datetime':
                    return formatExcelSerialDate(value, true);
                default:
                    if (Number.isInteger(value)) return String(value);
                    if (Math.abs(value) > 0 && Math.abs(value) < 1e-6) return String(cleanExcelFloat(value));
                    return String(Number(value.toFixed(6)));
            }
        }
        return String(value);
    }

    private formatValueWithCustomPattern(value: SpreadsheetCellValue, pattern: string): string {
        if (value === null || value === undefined) return '';
        const p = pattern.trim();
        if (!p) return String(value);

        const num = typeof value === 'number' ? value : Number(value);
        if (!Number.isNaN(num) && value !== '' && typeof value !== 'boolean') {
            if (/yyyy|yy|mm|dd|hh/i.test(p) && !p.includes('#') && !p.includes('0')) {
                const dt = excelSerialToUtcDate(num);
                const yyyy = String(dt.getUTCFullYear()).padStart(4, '0');
                const yy = yyyy.slice(-2);
                const mm = String(dt.getUTCMonth() + 1).padStart(2, '0');
                const dd = String(dt.getUTCDate()).padStart(2, '0');
                const hh = String(dt.getUTCHours()).padStart(2, '0');
                const min = String(dt.getUTCMinutes()).padStart(2, '0');
                const ss = String(dt.getUTCSeconds()).padStart(2, '0');
                const monthNamesShort = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
                const monthNamesFull = [
                    'January', 'February', 'March', 'April', 'May', 'June',
                    'July', 'August', 'September', 'October', 'November', 'December'
                ];
                let formatted = p;
                formatted = formatted.replace(/yyyy/gi, () => yyyy).replace(/yy/gi, () => yy);
                formatted = formatted
                    .replace(/mmmm/gi, () => monthNamesFull[dt.getUTCMonth()])
                    .replace(/mmm/gi, () => monthNamesShort[dt.getUTCMonth()]);
                // Replace hh:mm(:ss) minutes before date mm
                formatted = formatted
                    .replace(/hh:mm:ss/gi, () => `${hh}:${min}:${ss}`)
                    .replace(/hh:mm/gi, () => `${hh}:${min}`);
                formatted = formatted
                    .replace(/mm/gi, () => mm)
                    .replace(/\bm\b/gi, () => String(dt.getUTCMonth() + 1));
                formatted = formatted
                    .replace(/dd/gi, () => dd)
                    .replace(/\bd\b/gi, () => String(dt.getUTCDate()));
                return formatted;
            }
            if (p.endsWith('%')) {
                const decMatch = /\.([0#]+)%$/.exec(p);
                const decimals = decMatch ? decMatch[1].length : 0;
                return `${(num * 100).toFixed(decimals)}%`;
            }
            const hasCurrency = p.includes('$');
            const decMatch = /\.([0#]+)/.exec(p);
            const decimals = decMatch ? decMatch[1].length : 0;
            const useGrouping = p.includes(',');
            if (!hasCurrency && !useGrouping && /^0+$/.test(p)) {
                const sign = num < 0 ? '-' : '';
                return `${sign}${String(Math.round(Math.abs(num))).padStart(p.length, '0')}`;
            }
            const numText = new Intl.NumberFormat('en-US', {
                useGrouping,
                minimumFractionDigits: decimals,
                maximumFractionDigits: decimals
            }).format(num);
            return hasCurrency ? (num < 0 ? `-$${numText.replace(/^-/, '')}` : `$${numText}`) : numText;
        }
        return String(value);
    }

    /**
     * Infers a high-level {@link SpreadsheetCellFormatType} from an Excel `numFmt` pattern string.
     */
    public InferFormatTypeFromPattern(pattern?: string | null): SpreadsheetCellFormatType {
        if (!pattern) return 'general';
        // Strip Excel color/locale tokens like [Red] or [$-409] and trailing ;@ sections in O(N) without regex backtracking
        const primarySection = pattern.split(';')[0] ?? pattern;
        let stripped = '';
        let inBrackets = false;
        for (let i = 0; i < primarySection.length; i++) {
            const ch = primarySection[i];
            if (!inBrackets && ch === '[') {
                const closeAt = primarySection.indexOf(']', i + 1);
                if (closeAt !== -1) {
                    inBrackets = true;
                    continue;
                }
            } else if (inBrackets && ch === ']') {
                inBrackets = false;
                continue;
            }
            if (!inBrackets) {
                stripped += ch;
            }
        }
        const p = stripped.trim();
        if (!p || p.toLowerCase() === 'general') return 'general';
        if (p === '@') return 'text';
        if (p.includes('$') || p.includes('¤')) return 'currency';
        if (p.includes('%')) return 'percent';
        if (/(?:yyyy|yy|mmmm|mmm|mm|dd|m\/d|d-m|y-m|hh:mm|h:mm)/i.test(p) && !p.includes('#')) {
            return /h/i.test(p) ? 'datetime' : 'date';
        }
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

        if (kind === 'VIEW') {
            // A5: For =MJ.VIEW(entity, view, filter), NEVER split remaining[0] (the filter expression,
            // e.g. "Status='Active'") into NamedParameters — keep positional Arguments intact!
            positionalArgs.push(...remaining);
        } else {
            for (let i = 0; i < remaining.length; i++) {
                const val = remaining[i];
                if (typeof val === 'string' && val.includes('=')) {
                    const eqIdx = val.indexOf('=');
                    const k = val.slice(0, eqIdx).trim();
                    const vRaw = val.slice(eqIdx + 1).trim();
                    if (/^[A-Za-z_][A-Za-z0-9_]*$/.test(k) && !vRaw.includes("'") && !vRaw.includes('"')) {
                        namedParameters[k] =
                            vRaw !== '' && !Number.isNaN(Number(vRaw)) ? Number(vRaw) : vRaw;
                        continue;
                    }
                }
                positionalArgs.push(val);
            }
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
                if (table.Mode === 'Frozen' && !options?.ForceRefreshFrozen) {
                    const validation = ValidateFrozenBlockSnapshot(table.FrozenSnapshot);
                    if (!validation.Valid || !table.FrozenSnapshot || table.FrozenSnapshot.SecurityWarningAcknowledged !== true) {
                        const errMsg =
                            validation.ErrorMessage ||
                            'Invalid FrozenSnapshot: Mode is Frozen but snapshot is missing or SecurityWarningAcknowledged is not true.';
                        const failedFrozenRes: DocumentBlockExecutionResult = {
                            BlockID: table.TableID,
                            Kind: table.SourceType,
                            Mode: 'Frozen',
                            Success: false,
                            ErrorMessage: errMsg,
                            Columns: [],
                            Rows: [],
                            TotalRowCount: 0
                        };
                        resultsByTableId[table.TableID] = failedFrozenRes;
                        table.LastError = errMsg;
                        table.LastRowCount = 0;
                        this.clearLiveTableCellsOnAccessDenied(sheet, table);
                        continue;
                    }

                    const snap = table.FrozenSnapshot;
                    const frozenByName = snap.FrozenByUserName || snap.FrozenByUserID;
                    const frozenRes: DocumentBlockExecutionResult = {
                        BlockID: table.TableID,
                        Kind: table.SourceType,
                        Mode: 'Frozen',
                        Success: true,
                        Columns: snap.Columns,
                        Rows: snap.Rows,
                        TotalRowCount: snap.TotalRowCount ?? snap.Rows.length,
                        FrozenMetadata: {
                            FrozenAt: snap.FrozenAt,
                            FrozenByUserID: snap.FrozenByUserID,
                            FrozenByUserName: frozenByName,
                            SnapshotVerified: validation.SnapshotVerified
                        },
                        FrozenSnapshot: {
                            SnapshotVerified: validation.SnapshotVerified,
                            FrozenAt: snap.FrozenAt,
                            FrozenByUserID: snap.FrozenByUserID,
                            FrozenByUserName: frozenByName,
                            SnapshotContentHash: snap.SnapshotContentHash
                        }
                    };
                    resultsByTableId[table.TableID] = frozenRes;
                    table.AccessDenied = false;
                    table.LastError = null;
                    table.LastRowCount = snap.Rows.length;
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

    private clearPreviousLiveTableCells(sheet: WorksheetSpec, tableId: string): void {
        for (const [addr, cell] of Object.entries(sheet.Cells)) {
            if (cell?.LiveTableID === tableId) {
                delete sheet.Cells[addr];
            }
        }
    }

    private clearLiveTableCellsOnAccessDenied(sheet: WorksheetSpec, table: SpreadsheetLiveTableSpec): void {
        this.clearPreviousLiveTableCells(sheet, table.TableID);
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
            ErrorMessage: table.LastError ?? 'Access denied.',
            LiveTableID: table.Mode !== 'Frozen' ? table.TableID : null
        };
    }

    private populateSheetCellsFromLiveTable(
        sheet: WorksheetSpec,
        table: SpreadsheetLiveTableSpec,
        result: DocumentBlockExecutionResult
    ): void {
        // Delete any previously populated cells for this live table so shrinking results never leave stale rows (B4)
        this.clearPreviousLiveTableCells(sheet, table.TableID);

        const liveTableStamp = table.Mode !== 'Frozen' ? table.TableID : null;
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
                    Style: { Bold: true },
                    LiveTableID: liveTableStamp
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
                    Style: { Bold: true },
                    LiveTableID: liveTableStamp
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
                    DisplayValue: this.FormatCellValue(fieldVal),
                    LiveTableID: liveTableStamp
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
                const formulaStable = this.CompileFormulaToStableIds(sheet, normalizedFormula, workbookFromSheet(this.sheetToWorkbook, sheet));
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
                    },
                    LiveTableID: liveTableStamp
                };
            }
        }
    }

    /**
     * Explicitly freezes a live table into a static snapshot (`O5`, `B7`), requiring
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
        const frozenAt = new Date().toISOString();
        const baseSnapshot = {
            FrozenAt: frozenAt,
            FrozenByUserID: freezingUser.ID,
            FrozenByUserName: freezingUser.Name || freezingUser.ID,
            Columns: executionResult.Columns,
            Rows: executionResult.Rows,
            TotalRowCount: executionResult.TotalRowCount,
            SecurityWarningAcknowledged: true
        };
        table.Mode = 'Frozen';
        table.FrozenSnapshot = {
            ...baseSnapshot,
            SnapshotContentHash: ComputeFrozenSnapshotHash(baseSnapshot)
        };
        this.populateSheetCellsFromLiveTable(sheet, table, executionResult);
        this.EvaluateWorkbook(workbook);
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
        if (/^[+-]?(?:\d+(?:\.\d*)?|\.\d+)$/.test(trimmed)) {
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

        // Parse sharedStrings.xml if present using O(N) indexOf tag scanning (avoids polynomial regex backtracking)
        const sharedStrings: string[] = [];
        const ssBytes = files.get('xl/sharedStrings.xml');
        if (ssBytes) {
            const ssXml = this.decodeUtf8(ssBytes);
            for (const siInner of this.extractXmlElementBodies(ssXml, 'si')) {
                const tParts = this.extractXmlElementBodies(siInner, 't').map((part) => this.unescapeXml(part));
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
        // B4: Strip viewer-scoped live table cells, spill cells, and =MJ.* computed values before persisting metadata
        const sanitized = this.cloneWorkbookWithoutViewerScopedData(workbook);
        const json = JSON.stringify(sanitized);
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

    /**
     * Linear O(N) XML element body scanner (`<tag ...>body</tag>`) that avoids polynomial regex backtracking on untrusted OOXML.
     */
    private extractXmlElementBodies(xml: string, tagName: string): string[] {
        const results: string[] = [];
        const openPrefix = `<${tagName}`;
        const closeTag = `</${tagName}>`;
        let cursor = 0;
        while (cursor < xml.length) {
            const openIdx = xml.indexOf(openPrefix, cursor);
            if (openIdx === -1) break;
            const afterNameIdx = openIdx + openPrefix.length;
            const nextCh = xml[afterNameIdx];
            if (nextCh !== '>' && nextCh !== ' ' && nextCh !== '\t' && nextCh !== '\r' && nextCh !== '\n' && nextCh !== '/') {
                cursor = afterNameIdx;
                continue;
            }
            const tagEndIdx = xml.indexOf('>', afterNameIdx);
            if (tagEndIdx === -1) break;
            if (xml[tagEndIdx - 1] === '/') {
                cursor = tagEndIdx + 1;
                continue;
            }
            const closeIdx = xml.indexOf(closeTag, tagEndIdx + 1);
            if (closeIdx === -1) break;
            results.push(xml.slice(tagEndIdx + 1, closeIdx));
            cursor = closeIdx + closeTag.length;
        }
        return results;
    }

    private extractFirstXmlElementBody(xml: string, tagName: string): string | null {
        const bodies = this.extractXmlElementBodies(xml, tagName);
        return bodies.length > 0 ? bodies[0] : null;
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
                const vBody = this.extractFirstXmlElementBody(inner, 'v');
                if (vBody !== null && /^\d+$/.test(vBody.trim())) {
                    chunks.push(sharedStrings[parseInt(vBody.trim(), 10)] ?? '');
                }
            } else {
                const tBody = this.extractFirstXmlElementBody(inner, 't');
                if (tBody !== null) {
                    chunks.push(this.unescapeXml(tBody));
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

        // Track OOXML shared formula masters (<f t="shared" si="0">...</f>) for follower expansion (E6)
        const sharedFormulaMasters = new Map<string, { masterRow: number; masterCol: number; formulaBody: string }>();

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

            const fTagMatch = /<f\b([^>]*?)(?:\/>|>([\s\S]*?)<\/f>)/.exec(inner);
            const vBody = this.extractFirstXmlElementBody(inner, 'v');
            const isBody = this.extractFirstXmlElementBody(inner, 'is');
            const isTBody = isBody !== null ? this.extractFirstXmlElementBody(isBody, 't') : null;

            let rawVal: SpreadsheetCellValue = null;
            if (tAttr === 's' && vBody !== null) {
                const ssIdx = parseInt(vBody.trim(), 10);
                rawVal = sharedStrings[ssIdx] ?? '';
            } else if (tAttr === 'inlineStr' && isTBody !== null) {
                rawVal = this.unescapeXml(isTBody);
            } else if (tAttr === 'b' && vBody !== null) {
                rawVal = vBody.trim() === '1' || vBody.trim().toLowerCase() === 'true';
            } else if ((tAttr === 'str' || tAttr === 'e') && vBody !== null) {
                rawVal = this.unescapeXml(vBody);
            } else if (vBody !== null) {
                const vText = this.unescapeXml(vBody.trim());
                const num = Number(vText);
                rawVal = vText !== '' && !Number.isNaN(num) ? num : vText;
            } else if (isTBody !== null) {
                rawVal = this.unescapeXml(isTBody);
            }

            let formula: string | null = null;
            let formulaStable: string | null = null;
            if (fTagMatch) {
                const fAttrs = fTagMatch[1] ?? '';
                const fBodyRaw = this.unescapeXml((fTagMatch[2] ?? '').trim());
                const fType = (this.extractXmlAttr(fAttrs, 't') ?? '').toLowerCase();
                const sharedIdx = this.extractXmlAttr(fAttrs, 'si');

                if (fType === 'shared' && sharedIdx !== null) {
                    if (fBodyRaw.length > 0) {
                        const cleanMasterBody = fBodyRaw.startsWith('=') ? fBodyRaw.slice(1) : fBodyRaw;
                        sharedFormulaMasters.set(sharedIdx, {
                            masterRow: parsedPos.row,
                            masterCol: parsedPos.col,
                            formulaBody: cleanMasterBody
                        });
                        formula = `=${cleanMasterBody}`;
                    } else {
                        const master = sharedFormulaMasters.get(sharedIdx);
                        if (master) {
                            const shiftedBody = shiftSharedFormulaRelativeRefs(
                                master.formulaBody,
                                parsedPos.row - master.masterRow,
                                parsedPos.col - master.masterCol
                            );
                            formula = `=${shiftedBody}`;
                        }
                    }
                } else if (fBodyRaw.length > 0) {
                    formula = fBodyRaw.startsWith('=') ? fBodyRaw : `=${fBodyRaw}`;
                }

                if (formula) {
                    formulaStable = this.CompileFormulaToStableIds(ws, formula);
                }
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

        // Map all standard OOXML built-in number, currency, percent, date, and datetime numFmtIds (E6)
        const builtinFormats: Record<number, string> = {
            1: '0',
            2: '0.00',
            3: '#,##0',
            4: '#,##0.00',
            5: '$#,##0_);($#,##0)',
            6: '$#,##0_);[Red]($#,##0)',
            7: '$#,##0.00_);($#,##0.00)',
            8: '$#,##0.00_);[Red]($#,##0.00)',
            9: '0%',
            10: '0.00%',
            14: 'yyyy-mm-dd',
            15: 'd-mmm-yy',
            16: 'd-mmm',
            17: 'mmm-yy',
            18: 'h:mm AM/PM',
            19: 'h:mm:ss AM/PM',
            20: 'h:mm',
            21: 'h:mm:ss',
            22: 'yyyy-mm-dd hh:mm',
            27: 'yyyy-mm-dd',
            28: 'yyyy-mm-dd',
            29: 'yyyy-mm-dd',
            30: 'yyyy-mm-dd',
            31: 'yyyy-mm-dd',
            32: 'hh:mm:ss',
            33: 'hh:mm:ss',
            34: 'hh:mm:ss',
            35: 'hh:mm:ss',
            36: 'yyyy-mm-dd',
            45: 'mm:ss',
            46: '[h]:mm:ss',
            47: 'mm:ss.0',
            49: '@'
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
    // Isomorphic Bounded ZIP Archive Builder & Reader (Stored + Safe RFC 1951 Deflate, B6)
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
        if (zipBytes.byteLength > MAX_XLSX_COMPRESSED_BYTES) {
            throw new Error(
                `XLSX archive size (${zipBytes.byteLength} bytes) exceeds maximum allowed compressed size (${MAX_XLSX_COMPRESSED_BYTES} bytes).`
            );
        }
        if (zipBytes.byteLength < 22) {
            throw new Error('Invalid or truncated ZIP archive.');
        }

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
        if (eocdOffset < 0) {
            throw new Error('Invalid ZIP archive: End of Central Directory signature not found.');
        }

        let totalUncompressedBytes = 0;
        const totalEntries = view.getUint16(eocdOffset + 10, true);
        let cdOffset = view.getUint32(eocdOffset + 16, true);

        for (let e = 0; e < totalEntries; e++) {
            if (cdOffset + 46 > zipBytes.length) {
                throw new Error('Truncated ZIP Central Directory entry.');
            }
            if (view.getUint32(cdOffset, true) !== 0x02014b50) {
                throw new Error('Corrupt ZIP Central Directory signature.');
            }
            const method = view.getUint16(cdOffset + 10, true);
            const compSize = view.getUint32(cdOffset + 20, true);
            const uncompSize = view.getUint32(cdOffset + 24, true);
            const nameLen = view.getUint16(cdOffset + 28, true);
            const extraLen = view.getUint16(cdOffset + 30, true);
            const commentLen = view.getUint16(cdOffset + 32, true);
            const localHeaderOffset = view.getUint32(cdOffset + 42, true);

            if (cdOffset + 46 + nameLen > zipBytes.length) {
                throw new Error('Truncated ZIP entry filename.');
            }
            if (uncompSize > MAX_XLSX_ENTRY_BYTES) {
                throw new Error(
                    `ZIP entry declared size (${uncompSize} bytes) exceeds maximum entry limit (${MAX_XLSX_ENTRY_BYTES} bytes).`
                );
            }

            const fileName = this.decodeUtf8(zipBytes.subarray(cdOffset + 46, cdOffset + 46 + nameLen));
            if (localHeaderOffset + 30 > zipBytes.length || view.getUint32(localHeaderOffset, true) !== 0x04034b50) {
                throw new Error(`Invalid or truncated local ZIP header for '${fileName}'.`);
            }

            const localNameLen = view.getUint16(localHeaderOffset + 26, true);
            const localExtraLen = view.getUint16(localHeaderOffset + 28, true);
            const dataStart = localHeaderOffset + 30 + localNameLen + localExtraLen;
            if (dataStart + compSize > zipBytes.length) {
                throw new Error(`Truncated compressed payload for ZIP entry '${fileName}'.`);
            }

            const rawSlice = zipBytes.subarray(dataStart, dataStart + compSize);
            const remainingBudget = MAX_XLSX_UNCOMPRESSED_TOTAL_BYTES - totalUncompressedBytes;
            const entryCap = Math.min(MAX_XLSX_ENTRY_BYTES, remainingBudget);

            if (method === 0) {
                if (rawSlice.byteLength > entryCap) {
                    throw new Error(
                        `Uncompressed ZIP size exceeds maximum allowed limit (${MAX_XLSX_UNCOMPRESSED_TOTAL_BYTES} bytes).`
                    );
                }
                totalUncompressedBytes += rawSlice.byteLength;
                files.set(fileName, rawSlice);
            } else if (method === 8) {
                const inflated = this.inflateRawDeflate(rawSlice, entryCap);
                totalUncompressedBytes += inflated.byteLength;
                if (totalUncompressedBytes > MAX_XLSX_UNCOMPRESSED_TOTAL_BYTES) {
                    throw new Error(
                        `Total uncompressed XLSX size exceeds maximum allowed limit (${MAX_XLSX_UNCOMPRESSED_TOTAL_BYTES} bytes).`
                    );
                }
                files.set(fileName, inflated);
            } else {
                throw new Error(`Unsupported ZIP compression method ${method} for '${fileName}'.`);
            }

            cdOffset += 46 + nameLen + extraLen + commentLen;
        }
        return files;
    }

    /**
     * Bounded, browser-clean pure-TypeScript RFC 1951 raw DEFLATE decompressor (`B6`).
     * Throws immediately on truncated bitstreams, oversubscribed/invalid Huffman codes,
     * invalid lookback distances, or decompression bombs exceeding `maxEntryBytes`.
     */
    private inflateRawDeflate(data: Uint8Array, maxEntryBytes = MAX_XLSX_ENTRY_BYTES): Uint8Array {
        if (maxEntryBytes <= 0) {
            throw new Error('DEFLATE stream exceeds maximum allowed uncompressed size.');
        }
        const totalBitsAvailable = data.length * 8;
        let bitPos = 0;

        let buf = new Uint8Array(Math.min(Math.max(256, data.length * 2), maxEntryBytes));
        let outLen = 0;

        const ensureOutputCapacity = (additional: number): void => {
            const needed = outLen + additional;
            if (needed > maxEntryBytes) {
                throw new Error(`DEFLATE stream exceeds maximum allowed entry size (${maxEntryBytes} bytes).`);
            }
            if (needed <= buf.length) return;
            let nextCap = Math.max(256, buf.length);
            while (nextCap < needed) {
                nextCap = Math.min(maxEntryBytes, nextCap * 2);
                if (nextCap === maxEntryBytes && nextCap < needed) {
                    throw new Error(`DEFLATE stream exceeds maximum allowed entry size (${maxEntryBytes} bytes).`);
                }
            }
            const next = new Uint8Array(nextCap);
            next.set(buf.subarray(0, outLen), 0);
            buf = next;
        };

        const readBits = (n: number): number => {
            if (bitPos + n > totalBitsAvailable) {
                throw new Error('Truncated DEFLATE stream');
            }
            let val = 0;
            for (let i = 0; i < n; i++) {
                const byteIdx = bitPos >>> 3;
                const bit = (data[byteIdx] >>> (bitPos & 7)) & 1;
                val |= bit << i;
                bitPos++;
            }
            return val;
        };

        interface HuffmanTree {
            counts: number[];
            symbols: number[];
            totalSymbols: number;
        }

        const buildHuffman = (lengths: number[]): HuffmanTree => {
            const maxBits = 15;
            const counts = new Array<number>(maxBits + 1).fill(0);
            let totalSymbols = 0;
            for (const len of lengths) {
                if (len < 0 || len > maxBits) {
                    throw new Error('Invalid Huffman code length in DEFLATE stream');
                }
                if (len > 0) {
                    counts[len]++;
                    totalSymbols++;
                }
            }
            // Verify tree is not oversubscribed
            let left = 1;
            for (let bits = 1; bits <= maxBits; bits++) {
                left = (left << 1) - counts[bits];
                if (left < 0) {
                    throw new Error('Invalid oversubscribed Huffman tree in DEFLATE stream');
                }
            }
            const offsets = new Array<number>(maxBits + 1).fill(0);
            for (let bits = 1; bits < maxBits; bits++) {
                offsets[bits + 1] = offsets[bits] + counts[bits];
            }
            const symbols = new Array<number>(totalSymbols).fill(0);
            for (let sym = 0; sym < lengths.length; sym++) {
                const len = lengths[sym];
                if (len > 0) {
                    symbols[offsets[len]++] = sym;
                }
            }
            return { counts, symbols, totalSymbols };
        };

        const decodeSymbol = (tree: HuffmanTree): number => {
            if (tree.totalSymbols === 0) {
                throw new Error('Invalid empty Huffman tree in DEFLATE stream');
            }
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
            throw new Error('Invalid Huffman code in DEFLATE stream');
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
        while (!isFinal) {
            isFinal = readBits(1);
            const bType = readBits(2);
            if (bType === 0) {
                // Stored block
                bitPos = (bitPos + 7) & ~7;
                const len = readBits(16);
                const nlen = readBits(16);
                if ((len ^ 0xffff) !== nlen) {
                    throw new Error('Corrupt stored DEFLATE block length complement');
                }
                const byteStart = bitPos >>> 3;
                if (byteStart + len > data.length) {
                    throw new Error('Truncated DEFLATE stream');
                }
                ensureOutputCapacity(len);
                buf.set(data.subarray(byteStart, byteStart + len), outLen);
                outLen += len;
                bitPos += len * 8;
            } else if (bType === 1 || bType === 2) {
                let litTree: HuffmanTree;
                let distTree: HuffmanTree;
                if (bType === 1) {
                    litTree = buildHuffman(fixedLitLengths);
                    distTree = buildHuffman(fixedDistLengths);
                } else {
                    const hlit = readBits(5) + 257;
                    const hdist = readBits(5) + 1;
                    const hclen = readBits(4) + 4;
                    if (hlit > 286 || hdist > 30) {
                        throw new Error('Invalid DEFLATE dynamic Huffman counts');
                    }
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
                            if (idx === 0) {
                                throw new Error('Invalid DEFLATE repeat previous code at start of table');
                            }
                            const prev = codeLengths[idx - 1];
                            const rep = readBits(2) + 3;
                            if (idx + rep > totalCodes) {
                                throw new Error('Invalid DEFLATE code length repeat overflow');
                            }
                            for (let r = 0; r < rep; r++) codeLengths[idx++] = prev;
                        } else if (sym === 17) {
                            const rep = readBits(3) + 3;
                            if (idx + rep > totalCodes) {
                                throw new Error('Invalid DEFLATE zero repeat overflow');
                            }
                            for (let r = 0; r < rep; r++) codeLengths[idx++] = 0;
                        } else if (sym === 18) {
                            const rep = readBits(7) + 11;
                            if (idx + rep > totalCodes) {
                                throw new Error('Invalid DEFLATE zero repeat overflow');
                            }
                            for (let r = 0; r < rep; r++) codeLengths[idx++] = 0;
                        } else {
                            throw new Error('Invalid DEFLATE code length symbol');
                        }
                    }
                    litTree = buildHuffman(codeLengths.slice(0, hlit));
                    distTree = buildHuffman(codeLengths.slice(hlit));
                }

                while (true) {
                    const sym = decodeSymbol(litTree);
                    if (sym === 256) break;
                    if (sym < 256) {
                        ensureOutputCapacity(1);
                        buf[outLen++] = sym;
                    } else {
                        const lenIdx = sym - 257;
                        if (lenIdx < 0 || lenIdx >= lengthBase.length) {
                            throw new Error('Invalid DEFLATE length symbol');
                        }
                        const length = lengthBase[lenIdx] + readBits(lengthExtra[lenIdx]);
                        const distSym = decodeSymbol(distTree);
                        if (distSym < 0 || distSym >= distBase.length) {
                            throw new Error('Invalid DEFLATE distance symbol');
                        }
                        const distance = distBase[distSym] + readBits(distExtra[distSym]);
                        if (distance <= 0 || distance > outLen) {
                            throw new Error('Invalid DEFLATE lookback distance');
                        }
                        ensureOutputCapacity(length);
                        let srcPos = outLen - distance;
                        for (let i = 0; i < length; i++) {
                            buf[outLen++] = buf[srcPos++];
                        }
                    }
                }
            } else {
                throw new Error('Invalid DEFLATE block type 3');
            }
        }
        return buf.subarray(0, outLen);
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

// ---------------------------------------------------------------------------
// Formula Tokenizer, AST Compiler, DAG Structures, Date & Range Shift Helpers
// ---------------------------------------------------------------------------

/** Excel 1900 serial date offset from Unix epoch days (`1970-01-01 === 25569`). */
const EXCEL_EPOCH_OFFSET_DAYS = 25569;
const MAX_AST_CACHE_ENTRIES = 10_000;

interface WorkbookDependencyGraph {
    namedRangesSignature: string;
    astByCellKey: Map<string, FormulaAstNode | null>;
    directCellDeps: Map<string, string[]>;
    reverseCellDeps: Map<string, Set<string>>;
    sheetById: Map<string, WorksheetSpec>;
}

type BinaryOperator = '=' | '<>' | '<' | '<=' | '>' | '>=' | '&' | '+' | '-' | '*' | '/' | '^';

type FormulaAstNode =
    | { kind: 'EmptyArg' }
    | { kind: 'NumberLiteral'; value: number }
    | { kind: 'StringLiteral'; value: string }
    | { kind: 'BooleanLiteral'; value: boolean }
    | { kind: 'ErrorLiteral'; error: string }
    | { kind: 'CellRef'; sheetName?: string; address: string }
    | { kind: 'RangeRef'; sheetName?: string; startAddress: string; endAddress: string }
    | { kind: 'Identifier'; name: string }
    | { kind: 'UnaryOp'; op: '+' | '-'; operand: FormulaAstNode }
    | { kind: 'PostfixPercent'; operand: FormulaAstNode }
    | { kind: 'BinaryOp'; op: BinaryOperator; left: FormulaAstNode; right: FormulaAstNode }
    | { kind: 'FunctionCall'; name: string; args: FormulaAstNode[] };

type FormulaToken =
    | { type: 'Number'; value: number }
    | { type: 'String'; value: string }
    | { type: 'Error'; value: string }
    | { type: 'SheetPrefix'; sheetName: string }
    | { type: 'Ident'; value: string }
    | { type: 'Op'; value: BinaryOperator }
    | { type: 'Percent' }
    | { type: 'Colon' }
    | { type: 'Comma' }
    | { type: 'LParen' }
    | { type: 'RParen' };

const FORMULA_AST_CACHE = new Map<string, FormulaAstNode>();

function compileFormulaAstCached(exprBody: string): FormulaAstNode {
    const existing = FORMULA_AST_CACHE.get(exprBody);
    if (existing) {
        return existing;
    }
    const ast = parseFormulaAst(exprBody);
    if (FORMULA_AST_CACHE.size >= MAX_AST_CACHE_ENTRIES) {
        const firstKey = FORMULA_AST_CACHE.keys().next().value;
        if (firstKey !== undefined) {
            FORMULA_AST_CACHE.delete(firstKey);
        }
    }
    FORMULA_AST_CACHE.set(exprBody, ast);
    return ast;
}

function tokenizeFormula(expr: string): FormulaToken[] | { error: string } {
    const tokens: FormulaToken[] = [];
    let i = 0;
    const len = expr.length;

    while (i < len) {
        const ch = expr[i];
        if (ch === ' ' || ch === '\t' || ch === '\r' || ch === '\n') {
            i++;
            continue;
        }

        // String literal with doubled "" escapes
        if (ch === '"') {
            i++;
            let buf = '';
            let closed = false;
            while (i < len) {
                if (expr[i] === '"') {
                    if (expr[i + 1] === '"') {
                        buf += '"';
                        i += 2;
                        continue;
                    }
                    i++;
                    closed = true;
                    break;
                }
                buf += expr[i++];
            }
            if (!closed) {
                return { error: '#VALUE!' };
            }
            tokens.push({ type: 'String', value: buf });
            continue;
        }

        // Single-quoted sheet prefix: '2025-2026'! or 'O''Brien'!
        if (ch === "'") {
            i++;
            let sheetBuf = '';
            let closed = false;
            while (i < len) {
                if (expr[i] === "'") {
                    if (expr[i + 1] === "'") {
                        sheetBuf += "'";
                        i += 2;
                        continue;
                    }
                    i++;
                    closed = true;
                    break;
                }
                sheetBuf += expr[i++];
            }
            if (!closed || expr[i] !== '!') {
                return { error: '#VALUE!' };
            }
            i++; // consume '!'
            tokens.push({ type: 'SheetPrefix', sheetName: sheetBuf });
            continue;
        }

        // Error literal: #REF!, #DIV/0!, #VALUE!, #NAME?, #N/A, #NUM!, #NULL!, #CYCLE!, #SPILL!, #MJ_*!
        if (ch === '#') {
            const rest = expr.slice(i);
            const errMatch = /^#(REF!|DIV\/0!|VALUE!|NAME\?|N\/A|NUM!|NULL!|CYCLE!|SPILL!|MJ_ACCESS_DENIED!|MJ_PENDING!)/i.exec(rest);
            if (errMatch) {
                tokens.push({ type: 'Error', value: `#${errMatch[1].toUpperCase()}` });
                i += errMatch[0].length;
                continue;
            }
            return { error: '#VALUE!' };
        }

        // Numeric literal (including leading dot .5 and scientific notation 1e-11, 1.5E+3)
        if ((ch >= '0' && ch <= '9') || (ch === '.' && i + 1 < len && expr[i + 1] >= '0' && expr[i + 1] <= '9')) {
            const numMatch = /^(?:\d+\.?\d*|\.\d+)(?:[eE][+-]?\d+)?/.exec(expr.slice(i));
            if (numMatch) {
                tokens.push({ type: 'Number', value: Number(numMatch[0]) });
                i += numMatch[0].length;
                continue;
            }
        }

        // Two-character comparison operators
        const twoChar = expr.slice(i, i + 2);
        if (twoChar === '<>' || twoChar === '<=' || twoChar === '>=') {
            tokens.push({ type: 'Op', value: twoChar });
            i += 2;
            continue;
        }

        // Single-character operators and punctuation
        if (ch === '=' || ch === '<' || ch === '>' || ch === '&' || ch === '+' || ch === '-' || ch === '*' || ch === '/' || ch === '^') {
            tokens.push({ type: 'Op', value: ch });
            i++;
            continue;
        }
        if (ch === '%') {
            tokens.push({ type: 'Percent' });
            i++;
            continue;
        }
        if (ch === ':') {
            tokens.push({ type: 'Colon' });
            i++;
            continue;
        }
        if (ch === ',') {
            tokens.push({ type: 'Comma' });
            i++;
            continue;
        }
        if (ch === '(') {
            tokens.push({ type: 'LParen' });
            i++;
            continue;
        }
        if (ch === ')') {
            tokens.push({ type: 'RParen' });
            i++;
            continue;
        }

        // Cell reference ($B$2), unquoted SheetName! prefix, function identifier, or NamedRange identifier
        if ((ch >= 'A' && ch <= 'Z') || (ch >= 'a' && ch <= 'z') || ch === '_' || ch === '$') {
            const identMatch = /^[\$A-Za-z_][\$A-Za-z0-9_.]*/.exec(expr.slice(i));
            if (identMatch) {
                const rawIdent = identMatch[0];
                i += rawIdent.length;
                if (expr[i] === '!') {
                    i++; // consume '!'
                    tokens.push({ type: 'SheetPrefix', sheetName: rawIdent });
                } else {
                    tokens.push({ type: 'Ident', value: rawIdent });
                }
                continue;
            }
        }

        return { error: '#VALUE!' };
    }

    return tokens;
}

function parseFormulaAst(expr: string): FormulaAstNode {
    const tokRes = tokenizeFormula(expr);
    if (!Array.isArray(tokRes)) {
        return { kind: 'ErrorLiteral', error: tokRes.error };
    }
    const tokens = tokRes;
    if (tokens.length === 0) {
        return { kind: 'EmptyArg' };
    }

    let pos = 0;
    const peek = (): FormulaToken | undefined => tokens[pos];
    const consume = (): FormulaToken | undefined => tokens[pos++];

    // Precedence 1 (lowest): Comparison (=, <>, <, <=, >, >=)
    const parseComparison = (): FormulaAstNode => {
        let left = parseConcat();
        while (true) {
            const t = peek();
            if (
                t?.type === 'Op' &&
                (t.value === '=' || t.value === '<>' || t.value === '<' || t.value === '<=' || t.value === '>' || t.value === '>=')
            ) {
                consume();
                const right = parseConcat();
                left = { kind: 'BinaryOp', op: t.value, left, right };
            } else {
                break;
            }
        }
        return left;
    };

    // Precedence 2: Concatenation (&)
    const parseConcat = (): FormulaAstNode => {
        let left = parseAddSub();
        while (peek()?.type === 'Op' && (peek() as { type: 'Op'; value: BinaryOperator }).value === '&') {
            consume();
            const right = parseAddSub();
            left = { kind: 'BinaryOp', op: '&', left, right };
        }
        return left;
    };

    // Precedence 3: Addition / Subtraction (+, -)
    const parseAddSub = (): FormulaAstNode => {
        let left = parseMulDiv();
        while (true) {
            const t = peek();
            if (t?.type === 'Op' && (t.value === '+' || t.value === '-')) {
                consume();
                const right = parseMulDiv();
                left = { kind: 'BinaryOp', op: t.value, left, right };
            } else {
                break;
            }
        }
        return left;
    };

    // Precedence 4: Multiplication / Division (*, /)
    const parseMulDiv = (): FormulaAstNode => {
        let left = parseUnary();
        while (true) {
            const t = peek();
            if (t?.type === 'Op' && (t.value === '*' || t.value === '/')) {
                consume();
                const right = parseUnary();
                left = { kind: 'BinaryOp', op: t.value, left, right };
            } else {
                break;
            }
        }
        return left;
    };

    // Precedence 5: Prefix Unary (+, -) and Exponentiation (^)
    const parseUnary = (): FormulaAstNode => {
        const t = peek();
        if (t?.type === 'Op' && (t.value === '+' || t.value === '-')) {
            consume();
            const operand = parseUnary();
            return { kind: 'UnaryOp', op: t.value, operand };
        }
        return parsePower();
    };

    const parsePower = (): FormulaAstNode => {
        let left = parsePostfix();
        while (peek()?.type === 'Op' && (peek() as { type: 'Op'; value: BinaryOperator }).value === '^') {
            consume();
            const right = parseUnary();
            left = { kind: 'BinaryOp', op: '^', left, right };
        }
        return left;
    };

    // Precedence 6: Postfix % (supports 12%, (A1)%, (B2+C2)%)
    const parsePostfix = (): FormulaAstNode => {
        let node = parsePrimary();
        while (peek()?.type === 'Percent') {
            consume();
            node = { kind: 'PostfixPercent', operand: node };
        }
        return node;
    };

    // Precedence 7: Literals, Parenthesized Expressions, Function Calls, Cell/Range Refs, Named Ranges
    const parsePrimary = (): FormulaAstNode => {
        const t = peek();
        if (!t) {
            return { kind: 'ErrorLiteral', error: '#VALUE!' };
        }

        if (t.type === 'Number') {
            consume();
            return { kind: 'NumberLiteral', value: t.value };
        }
        if (t.type === 'String') {
            consume();
            return { kind: 'StringLiteral', value: t.value };
        }
        if (t.type === 'Error') {
            consume();
            return { kind: 'ErrorLiteral', error: t.value };
        }
        if (t.type === 'LParen') {
            consume();
            const inner = parseComparison();
            if (peek()?.type !== 'RParen') {
                return { kind: 'ErrorLiteral', error: '#VALUE!' };
            }
            consume();
            return inner;
        }
        if (t.type === 'SheetPrefix') {
            consume();
            const next = peek();
            if (next?.type === 'Error') {
                consume();
                return { kind: 'ErrorLiteral', error: next.value };
            }
            if (next?.type === 'Ident' && ParseCellAddress(next.value)) {
                const startAddr = next.value;
                consume();
                if (peek()?.type === 'Colon') {
                    consume();
                    // Optional repeated sheet prefix on second endpoint ('Sheet'!A1:'Sheet'!B5)
                    if (peek()?.type === 'SheetPrefix') {
                        consume();
                    }
                    const endTok = peek();
                    if (endTok?.type === 'Ident' && ParseCellAddress(endTok.value)) {
                        consume();
                        return {
                            kind: 'RangeRef',
                            sheetName: t.sheetName,
                            startAddress: startAddr,
                            endAddress: endTok.value
                        };
                    }
                    return { kind: 'ErrorLiteral', error: '#REF!' };
                }
                return { kind: 'CellRef', sheetName: t.sheetName, address: startAddr };
            }
            return { kind: 'ErrorLiteral', error: '#REF!' };
        }
        if (t.type === 'Ident') {
            consume();
            // Function call: IDENT(...)
            if (peek()?.type === 'LParen') {
                consume(); // '('
                const fnArgs: FormulaAstNode[] = [];
                if (peek()?.type === 'RParen') {
                    consume();
                    return { kind: 'FunctionCall', name: t.value, args: fnArgs };
                }
                while (true) {
                    if (peek()?.type === 'Comma' || peek()?.type === 'RParen') {
                        fnArgs.push({ kind: 'EmptyArg' });
                    } else {
                        fnArgs.push(parseComparison());
                    }
                    if (peek()?.type === 'Comma') {
                        consume();
                        if (peek()?.type === 'RParen') {
                            fnArgs.push({ kind: 'EmptyArg' });
                            consume();
                            break;
                        }
                        continue;
                    }
                    if (peek()?.type === 'RParen') {
                        consume();
                        break;
                    }
                    return { kind: 'ErrorLiteral', error: '#VALUE!' };
                }
                return { kind: 'FunctionCall', name: t.value, args: fnArgs };
            }

            // Boolean literals
            const upper = t.value.toUpperCase();
            if (upper === 'TRUE') return { kind: 'BooleanLiteral', value: true };
            if (upper === 'FALSE') return { kind: 'BooleanLiteral', value: false };

            // Local cell or range reference
            if (ParseCellAddress(t.value)) {
                if (peek()?.type === 'Colon') {
                    consume();
                    const endTok = peek();
                    if (endTok?.type === 'Ident' && ParseCellAddress(endTok.value)) {
                        consume();
                        return { kind: 'RangeRef', startAddress: t.value, endAddress: endTok.value };
                    }
                    if (endTok?.type === 'Error') {
                        consume();
                        return { kind: 'ErrorLiteral', error: endTok.value };
                    }
                    return { kind: 'ErrorLiteral', error: '#REF!' };
                }
                return { kind: 'CellRef', address: t.value };
            }

            return { kind: 'Identifier', name: t.value };
        }

        consume();
        return { kind: 'ErrorLiteral', error: '#VALUE!' };
    };

    const root = parseComparison();
    if (pos < tokens.length) {
        return { kind: 'ErrorLiteral', error: '#VALUE!' };
    }
    return root;
}

function cleanExcelFloat(n: number): number {
    if (!Number.isFinite(n)) return n;
    if (n === 0) return 0;
    return Number(n.toPrecision(15));
}

function decimalShift(absVal: number, expShift: number): number {
    if (absVal === 0 || expShift === 0) return absVal;
    const parts = absVal.toString().split(/[eE]/);
    const mantissa = parts[0];
    const currentExp = parts[1] ? parseInt(parts[1], 10) : 0;
    return Number(`${mantissa}e${currentExp + expShift}`);
}

function excelSerialToUtcDate(serial: number): Date {
    const daySerial = Math.floor(serial);
    const fracMs = Math.round((serial - daySerial) * 86_400_000);
    return new Date((daySerial - EXCEL_EPOCH_OFFSET_DAYS) * 86_400_000 + fracMs);
}

function formatExcelSerialDate(serial: number, includeTime: boolean): string {
    const dt = excelSerialToUtcDate(serial);
    const yyyy = String(dt.getUTCFullYear()).padStart(4, '0');
    const mm = String(dt.getUTCMonth() + 1).padStart(2, '0');
    const dd = String(dt.getUTCDate()).padStart(2, '0');
    if (!includeTime) {
        return `${yyyy}-${mm}-${dd}`;
    }
    const hh = String(dt.getUTCHours()).padStart(2, '0');
    const min = String(dt.getUTCMinutes()).padStart(2, '0');
    return `${yyyy}-${mm}-${dd} ${hh}:${min}`;
}

function isAutoDateFormattedFormula(formula: string): boolean {
    const body = formula.trim().replace(/^=\s*/, '');
    if (/^(?:YEAR|MONTH|DAY|DAYS)\s*\(/i.test(body)) {
        return false;
    }
    return /\b(?:TODAY|NOW|DATE|EDATE|EOMONTH)\s*\(/i.test(body);
}

function hasExcelWildcard(pattern: string): boolean {
    for (let i = 0; i < pattern.length; i++) {
        if (pattern[i] === '~') {
            i++;
            continue;
        }
        if (pattern[i] === '*' || pattern[i] === '?') {
            return true;
        }
    }
    return false;
}

function buildExcelWildcardRegex(pattern: string): RegExp {
    let rx = '^';
    for (let i = 0; i < pattern.length; i++) {
        const ch = pattern[i];
        if (ch === '~' && i + 1 < pattern.length) {
            const next = pattern[++i];
            rx += next.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
        } else if (ch === '*') {
            rx += '[\\s\\S]*';
        } else if (ch === '?') {
            rx += '[\\s\\S]';
        } else {
            rx += ch.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
        }
    }
    rx += '$';
    return new RegExp(rx, 'i');
}

function shiftSharedFormulaRelativeRefs(formulaBody: string, dRow: number, dCol: number): string {
    if (dRow === 0 && dCol === 0) return formulaBody;
    const strLiterals: string[] = [];
    let masked = formulaBody.replace(/"(?:""|[^"])*"/g, (m) => {
        strLiterals.push(m);
        return `__SF_STR_${strLiterals.length - 1}__`;
    });
    const sheetPrefixes: string[] = [];
    masked = masked.replace(/'(?:''|[^'])*'!/g, (m) => {
        sheetPrefixes.push(m);
        return `__SF_SH_${sheetPrefixes.length - 1}__!`;
    });

    const shifted = masked.replace(
        /(?<![A-Za-z0-9_.])(\$?)([A-Za-z]{1,3})(\$?)([1-9][0-9]*)(?![A-Za-z0-9_.(\[])/g,
        (_full, absC: string, colLet: string, absR: string, rowStr: string) => {
            const origRow = parseInt(rowStr, 10);
            const origCol = ColumnLetterToIndex(colLet);
            const nextRow = absR === '$' ? origRow : origRow + dRow;
            const nextCol = absC === '$' ? origCol : origCol + dCol;
            if (nextRow < 1 || nextCol < 1) return '#REF!';
            return FormatCellAddress(nextRow, nextCol, absR === '$', absC === '$');
        }
    );

    const withSheets = shifted.replace(
        /__SF_SH_(\d+)__!/g,
        (_m, idx: string) => sheetPrefixes[parseInt(idx, 10)] ?? ''
    );
    return withSheets.replace(/__SF_STR_(\d+)__/g, (_m, idx: string) => strLiterals[parseInt(idx, 10)] ?? '');
}

function shiftA1RangeRows(
    rangeStr: string,
    op: 'insert' | 'delete',
    startRow1Based: number,
    count: number,
    isAnchorCell: boolean,
    maxSurvivingRow: number
): string | null {
    const trimmed = (rangeStr ?? '').trim();
    if (!trimmed || trimmed === '#REF!') return null;
    const parts = trimmed.split(':');
    if (parts.length === 1) {
        const p = ParseCellAddress(parts[0]);
        if (!p) return trimmed;
        if (op === 'insert') {
            const nextR = p.row >= startRow1Based ? p.row + count : p.row;
            return FormatCellAddress(nextR, p.col, p.absRow, p.absCol);
        }
        const delEnd = startRow1Based + count - 1;
        if (p.row >= startRow1Based && p.row <= delEnd) {
            if (isAnchorCell) {
                return FormatCellAddress(Math.min(startRow1Based, maxSurvivingRow), p.col, p.absRow, p.absCol);
            }
            return null;
        }
        const nextR = p.row > delEnd ? p.row - count : p.row;
        return FormatCellAddress(nextR, p.col, p.absRow, p.absCol);
    }
    if (parts.length === 2) {
        const a = ParseCellAddress(parts[0]);
        const b = ParseCellAddress(parts[1]);
        if (!a || !b) return trimmed;
        const r1 = Math.min(a.row, b.row);
        const r2 = Math.max(a.row, b.row);
        if (op === 'insert') {
            const nextR1 = r1 >= startRow1Based ? r1 + count : r1;
            const nextR2 = r2 >= startRow1Based ? r2 + count : r2;
            return `${FormatCellAddress(nextR1, a.col, a.absRow, a.absCol)}:${FormatCellAddress(nextR2, b.col, b.absRow, b.absCol)}`;
        }
        const delEnd = startRow1Based + count - 1;
        if (r1 >= startRow1Based && r2 <= delEnd) {
            return null;
        }
        let survivingStart = r1;
        if (r1 >= startRow1Based && r1 <= delEnd) {
            survivingStart = startRow1Based;
        } else if (r1 > delEnd) {
            survivingStart = r1 - count;
        }
        let survivingEnd = r2;
        if (r2 >= startRow1Based && r2 <= delEnd) {
            survivingEnd = startRow1Based - 1;
        } else if (r2 > delEnd) {
            survivingEnd = r2 - count;
        }
        if (survivingEnd < survivingStart || survivingStart < 1) {
            return null;
        }
        return `${FormatCellAddress(survivingStart, a.col, a.absRow, a.absCol)}:${FormatCellAddress(survivingEnd, b.col, b.absRow, b.absCol)}`;
    }
    return trimmed;
}

function shiftA1RangeCols(
    rangeStr: string,
    op: 'insert' | 'delete',
    startCol1Based: number,
    count: number,
    isAnchorCell: boolean,
    maxSurvivingCol: number
): string | null {
    const trimmed = (rangeStr ?? '').trim();
    if (!trimmed || trimmed === '#REF!') return null;
    const parts = trimmed.split(':');
    if (parts.length === 1) {
        const p = ParseCellAddress(parts[0]);
        if (!p) return trimmed;
        if (op === 'insert') {
            const nextC = p.col >= startCol1Based ? p.col + count : p.col;
            return FormatCellAddress(p.row, nextC, p.absRow, p.absCol);
        }
        const delEnd = startCol1Based + count - 1;
        if (p.col >= startCol1Based && p.col <= delEnd) {
            if (isAnchorCell) {
                return FormatCellAddress(p.row, Math.min(startCol1Based, maxSurvivingCol), p.absRow, p.absCol);
            }
            return null;
        }
        const nextC = p.col > delEnd ? p.col - count : p.col;
        return FormatCellAddress(p.row, nextC, p.absRow, p.absCol);
    }
    if (parts.length === 2) {
        const a = ParseCellAddress(parts[0]);
        const b = ParseCellAddress(parts[1]);
        if (!a || !b) return trimmed;
        const c1 = Math.min(a.col, b.col);
        const c2 = Math.max(a.col, b.col);
        if (op === 'insert') {
            const nextC1 = c1 >= startCol1Based ? c1 + count : c1;
            const nextC2 = c2 >= startCol1Based ? c2 + count : c2;
            return `${FormatCellAddress(a.row, nextC1, a.absRow, a.absCol)}:${FormatCellAddress(b.row, nextC2, b.absRow, b.absCol)}`;
        }
        const delEnd = startCol1Based + count - 1;
        if (c1 >= startCol1Based && c2 <= delEnd) {
            return null;
        }
        let survivingStart = c1;
        if (c1 >= startCol1Based && c1 <= delEnd) {
            survivingStart = startCol1Based;
        } else if (c1 > delEnd) {
            survivingStart = c1 - count;
        }
        let survivingEnd = c2;
        if (c2 >= startCol1Based && c2 <= delEnd) {
            survivingEnd = startCol1Based - 1;
        } else if (c2 > delEnd) {
            survivingEnd = c2 - count;
        }
        if (survivingEnd < survivingStart || survivingStart < 1) {
            return null;
        }
        return `${FormatCellAddress(a.row, survivingStart, a.absRow, a.absCol)}:${FormatCellAddress(b.row, survivingEnd, b.absRow, b.absCol)}`;
    }
    return trimmed;
}

function shiftColumnLetter(
    colLetter: string,
    op: 'insert' | 'delete',
    startCol1Based: number,
    count: number
): string | null {
    const colIdx = ColumnLetterToIndex(colLetter);
    if (op === 'insert') {
        const nextCol = colIdx >= startCol1Based ? colIdx + count : colIdx;
        return ColumnIndexToLetter(nextCol);
    }
    const delEnd = startCol1Based + count - 1;
    if (colIdx >= startCol1Based && colIdx <= delEnd) {
        return null;
    }
    const nextCol = colIdx > delEnd ? colIdx - count : colIdx;
    return ColumnIndexToLetter(nextCol);
}

function workbookFromSheet(
    map: WeakMap<WorksheetSpec, WorkbookSpec>,
    sheet: WorksheetSpec
): WorkbookSpec | undefined {
    return map.get(sheet);
}

/**
 * Registers the {@link SpreadsheetEngine} chart/range dataset extractor with
 * {@link DocumentLiveBlockEngine} (`D5`, breaking circular module imports).
 */
export function LoadSpreadsheetEngine(): void {
    DocumentLiveBlockEngine.Instance.RegisterSpreadsheetChartExtractor(
        (content, configuration, sheetId, chartId, sheetRange) => {
            const wb = SpreadsheetEngine.Instance.ParseWorkbook(content, configuration);
            const targetSheetId = sheetId || wb.ActiveSheetID;
            let dataset = chartId
                ? SpreadsheetEngine.Instance.ExtractChartDataset(wb, targetSheetId, chartId)
                : null;
            if (!dataset && sheetRange) {
                dataset = SpreadsheetEngine.Instance.ExtractChartDataset(wb, targetSheetId, sheetRange);
            }
            return dataset;
        }
    );
}

LoadSpreadsheetEngine();
