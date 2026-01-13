/**
 * Export format types
 */
export type ExportFormat = 'excel' | 'csv' | 'json';

/**
 * Data row type - either an object with string keys or an array
 */
export type ExportDataRow = Record<string, unknown> | unknown[];

/**
 * Data array type for export
 */
export type ExportData = ExportDataRow[];

/**
 * Row sampling mode for exports
 */
export type SamplingMode = 'all' | 'top' | 'bottom' | 'every-nth' | 'random';

/**
 * Column data type hint for formatting
 */
export type ColumnDataType = 'string' | 'number' | 'date' | 'boolean' | 'currency' | 'percentage';

/**
 * Cell border line style
 */
export type BorderLineStyle = 'thin' | 'medium' | 'thick' | 'dotted' | 'dashed' | 'double';

/**
 * Horizontal alignment options
 */
export type HorizontalAlignment = 'left' | 'center' | 'right' | 'fill' | 'justify';

/**
 * Vertical alignment options
 */
export type VerticalAlignment = 'top' | 'middle' | 'bottom';

/**
 * Fill pattern type
 */
export type FillPattern = 'none' | 'solid' | 'darkGray' | 'mediumGray' | 'lightGray' |
  'darkHorizontal' | 'darkVertical' | 'darkDown' | 'darkUp' | 'darkGrid' | 'darkTrellis' |
  'lightHorizontal' | 'lightVertical' | 'lightDown' | 'lightUp' | 'lightGrid' | 'lightTrellis';

/**
 * Font styling options
 */
export interface FontStyle {
  /** Font family name */
  name?: string;
  /** Font size in points */
  size?: number;
  /** Bold text */
  bold?: boolean;
  /** Italic text */
  italic?: boolean;
  /** Underline text */
  underline?: boolean | 'single' | 'double';
  /** Strikethrough text */
  strike?: boolean;
  /** Font color (hex without #, e.g., 'FF0000' for red) */
  color?: string;
}

/**
 * Cell fill/background options
 */
export interface FillStyle {
  /** Fill pattern type */
  pattern?: FillPattern;
  /** Foreground color (hex without #) */
  fgColor?: string;
  /** Background color (hex without #) */
  bgColor?: string;
}

/**
 * Border definition for a single side
 */
export interface BorderSide {
  /** Border style */
  style?: BorderLineStyle;
  /** Border color (hex without #) */
  color?: string;
}

/**
 * Cell border options
 */
export interface CellBorder {
  top?: BorderSide;
  bottom?: BorderSide;
  left?: BorderSide;
  right?: BorderSide;
  diagonal?: BorderSide & { up?: boolean; down?: boolean };
}

/**
 * Cell alignment options
 */
export interface AlignmentStyle {
  /** Horizontal alignment */
  horizontal?: HorizontalAlignment;
  /** Vertical alignment */
  vertical?: VerticalAlignment;
  /** Wrap text */
  wrapText?: boolean;
  /** Shrink to fit */
  shrinkToFit?: boolean;
  /** Text rotation in degrees (-90 to 90) */
  textRotation?: number;
  /** Indent level */
  indent?: number;
}

/**
 * Complete cell style definition
 */
export interface CellStyle {
  /** Font styling */
  font?: FontStyle;
  /** Fill/background styling */
  fill?: FillStyle;
  /** Border styling */
  border?: CellBorder;
  /** Alignment styling */
  alignment?: AlignmentStyle;
  /** Number format string (e.g., '#,##0.00', 'yyyy-mm-dd') */
  numFmt?: string;
}

/**
 * Column definition for export
 */
export interface ExportColumn {
  /** The field/property name in the data */
  name: string;
  /** Display name for the column header */
  displayName?: string;
  /** Column width in characters (Excel only) */
  width?: number;
  /** Data type hint for formatting */
  dataType?: ColumnDataType;
  /** Number format string (Excel only) */
  numberFormat?: string;
  /** Column-level style (applied to all cells in this column) */
  style?: CellStyle;
  /** Whether the column is hidden */
  hidden?: boolean;
}

/**
 * Formula definition for a cell
 */
export interface CellFormula {
  /** Cell address (e.g., 'A1', 'B5') */
  cell: string;
  /** Formula string (without leading =) */
  formula: string;
  /** Optional result value for display before calculation */
  result?: unknown;
}

/**
 * Conditional formatting rule
 */
export interface ConditionalFormatRule {
  /** Cell range (e.g., 'A1:A100', 'B2:D50') */
  range: string;
  /** Rule type */
  type: 'cellIs' | 'containsText' | 'colorScale' | 'dataBar' | 'iconSet' | 'top10' | 'aboveAverage' | 'duplicateValues' | 'expression';
  /** Operator for cellIs type */
  operator?: 'equal' | 'notEqual' | 'greaterThan' | 'lessThan' | 'greaterThanOrEqual' | 'lessThanOrEqual' | 'between' | 'notBetween';
  /** Value(s) for comparison */
  value?: unknown;
  /** Second value for 'between' operator */
  value2?: unknown;
  /** Text to search for (containsText type) */
  text?: string;
  /** Style to apply when rule matches */
  style?: CellStyle;
  /** Priority of the rule (lower = higher priority) */
  priority?: number;
}

/**
 * Data validation rule
 */
export interface DataValidationRule {
  /** Cell range to apply validation */
  range: string;
  /** Validation type */
  type: 'list' | 'whole' | 'decimal' | 'date' | 'time' | 'textLength' | 'custom';
  /** Operator for numeric/date/text validations */
  operator?: 'equal' | 'notEqual' | 'greaterThan' | 'lessThan' | 'greaterThanOrEqual' | 'lessThanOrEqual' | 'between' | 'notBetween';
  /** Formula or value for validation */
  formula1?: string | number | Date;
  /** Second formula/value for between operators */
  formula2?: string | number | Date;
  /** List of allowed values (for list type) */
  allowedValues?: string[];
  /** Show dropdown for list validation */
  showDropdown?: boolean;
  /** Allow blank cells */
  allowBlank?: boolean;
  /** Show error alert */
  showError?: boolean;
  /** Error title */
  errorTitle?: string;
  /** Error message */
  errorMessage?: string;
  /** Error style */
  errorStyle?: 'stop' | 'warning' | 'information';
  /** Show input message */
  showInputMessage?: boolean;
  /** Input title */
  inputTitle?: string;
  /** Input message */
  inputMessage?: string;
}

/**
 * Merged cell range definition
 */
export interface MergedCellRange {
  /** Start row (1-based) */
  startRow: number;
  /** Start column (1-based) */
  startColumn: number;
  /** End row (1-based) */
  endRow: number;
  /** End column (1-based) */
  endColumn: number;
}

/**
 * Image to embed in the worksheet
 */
export interface EmbeddedImage {
  /** Image data as base64 string or Buffer */
  data: string | Buffer;
  /** Image type */
  type: 'png' | 'jpeg' | 'gif';
  /** Top-left cell position */
  position: {
    /** Column (1-based or letter) */
    col: number | string;
    /** Row (1-based) */
    row: number;
    /** Offset from left of cell in pixels */
    colOffset?: number;
    /** Offset from top of cell in pixels */
    rowOffset?: number;
  };
  /** Image dimensions */
  size?: {
    /** Width in pixels */
    width?: number;
    /** Height in pixels */
    height?: number;
  };
}

/**
 * Row-level styling
 */
export interface RowStyle {
  /** Row number (1-based) */
  row: number;
  /** Row height in points */
  height?: number;
  /** Style to apply to entire row */
  style?: CellStyle;
  /** Whether row is hidden */
  hidden?: boolean;
  /** Outline level for grouping (0-7) */
  outlineLevel?: number;
}

/**
 * Specific cell styling (overrides column/row styles)
 */
export interface CellStyleOverride {
  /** Cell address (e.g., 'A1') or range (e.g., 'A1:B5') */
  cell: string;
  /** Style to apply */
  style: CellStyle;
  /** Value to set (optional, overrides data) */
  value?: unknown;
}

/**
 * Page setup options for printing
 */
export interface PageSetup {
  /** Paper size */
  paperSize?: 'letter' | 'legal' | 'tabloid' | 'a3' | 'a4' | 'a5';
  /** Page orientation */
  orientation?: 'portrait' | 'landscape';
  /** Fit to page width (number of pages) */
  fitToWidth?: number;
  /** Fit to page height (number of pages) */
  fitToHeight?: number;
  /** Scale percentage (10-400) */
  scale?: number;
  /** Print gridlines */
  showGridLines?: boolean;
  /** Print row/column headings */
  showRowColHeaders?: boolean;
  /** Margins in inches */
  margins?: {
    left?: number;
    right?: number;
    top?: number;
    bottom?: number;
    header?: number;
    footer?: number;
  };
  /** Header text (use &L, &C, &R for left/center/right) */
  header?: string;
  /** Footer text */
  footer?: string;
  /** Rows to repeat at top (e.g., '1:2' for rows 1-2) */
  printTitlesRow?: string;
  /** Columns to repeat at left (e.g., 'A:B') */
  printTitlesColumn?: string;
}

/**
 * Sheet protection options
 */
export interface SheetProtection {
  /** Password for protection (will be hashed) */
  password?: string;
  /** Allow selecting locked cells */
  selectLockedCells?: boolean;
  /** Allow selecting unlocked cells */
  selectUnlockedCells?: boolean;
  /** Allow formatting cells */
  formatCells?: boolean;
  /** Allow formatting columns */
  formatColumns?: boolean;
  /** Allow formatting rows */
  formatRows?: boolean;
  /** Allow inserting columns */
  insertColumns?: boolean;
  /** Allow inserting rows */
  insertRows?: boolean;
  /** Allow inserting hyperlinks */
  insertHyperlinks?: boolean;
  /** Allow deleting columns */
  deleteColumns?: boolean;
  /** Allow deleting rows */
  deleteRows?: boolean;
  /** Allow sorting */
  sort?: boolean;
  /** Allow auto filter */
  autoFilter?: boolean;
  /** Allow pivot tables */
  pivotTables?: boolean;
}

/**
 * Sheet definition for multi-sheet exports
 */
export interface SheetDefinition {
  /** Sheet name (required) */
  name: string;
  /** Data rows for this sheet */
  data: ExportData;
  /** Column definitions (optional, derived from data if not provided) */
  columns?: ExportColumn[];
  /** Custom column headers (alternative to columns) */
  headers?: string[];
  /** Column widths in characters */
  columnWidths?: number[];
  /** Include headers row */
  includeHeaders?: boolean;
  /** Header row style */
  headerStyle?: CellStyle;
  /** Default data row style */
  dataStyle?: CellStyle;
  /** Alternating row style */
  alternateRowStyle?: CellStyle;
  /** Specific row styles */
  rowStyles?: RowStyle[];
  /** Specific cell style overrides */
  cellStyles?: CellStyleOverride[];
  /** Formulas to add */
  formulas?: CellFormula[];
  /** Conditional formatting rules */
  conditionalFormatting?: ConditionalFormatRule[];
  /** Data validation rules */
  dataValidation?: DataValidationRule[];
  /** Merged cell ranges */
  mergedCells?: MergedCellRange[];
  /** Embedded images */
  images?: EmbeddedImage[];
  /** Freeze panes configuration */
  freeze?: {
    /** Freeze at row (1-based, rows above this are frozen) */
    row?: number;
    /** Freeze at column (1-based, columns left of this are frozen) */
    column?: number;
  };
  /** Auto-filter range (e.g., 'A1:D100' or true for all data) */
  autoFilter?: string | boolean;
  /** Tab color (hex without #) */
  tabColor?: string;
  /** Right-to-left reading order */
  rightToLeft?: boolean;
  /** Show gridlines */
  showGridLines?: boolean;
  /** Page setup for printing */
  pageSetup?: PageSetup;
  /** Sheet protection options */
  protection?: SheetProtection;
  /** Default row height */
  defaultRowHeight?: number;
  /** Default column width */
  defaultColWidth?: number;
  /** Outline/grouping settings */
  outlineProperties?: {
    /** Summary rows below detail */
    summaryBelow?: boolean;
    /** Summary columns to right of detail */
    summaryRight?: boolean;
  };
}

/**
 * Row sampling options
 */
export interface SamplingOptions {
  /** Sampling mode */
  mode: SamplingMode;
  /** Number of rows for top/bottom/random modes */
  count?: number;
  /** Interval for every-nth mode */
  interval?: number;
}

/**
 * Export styling options (Excel only) - simplified version for single-sheet exports
 */
export interface ExportStyleOptions {
  /** Apply bold headers */
  boldHeaders?: boolean;
  /** Header background color (hex without #) */
  headerBackgroundColor?: string;
  /** Header text color (hex without #) */
  headerTextColor?: string;
  /** Apply alternating row colors */
  alternatingRowColors?: boolean;
  /** Alternate row background color (hex without #) */
  alternateRowColor?: string;
  /** Freeze header row */
  freezeHeader?: boolean;
  /** Apply auto-filter to headers */
  autoFilter?: boolean;
  /** Full header style (overrides individual header options) */
  headerStyle?: CellStyle;
  /** Full data style (applied to all data cells) */
  dataStyle?: CellStyle;
  /** Full alternate row style (overrides alternateRowColor) */
  alternateRowStyle?: CellStyle;
}

/**
 * Workbook metadata
 */
export interface WorkbookMetadata {
  /** Author name */
  author?: string;
  /** Title */
  title?: string;
  /** Subject */
  subject?: string;
  /** Description/comments */
  description?: string;
  /** Keywords (comma-separated or array) */
  keywords?: string | string[];
  /** Category */
  category?: string;
  /** Company */
  company?: string;
  /** Manager */
  manager?: string;
}

/**
 * CSV-specific options
 */
export interface CSVOptions {
  /** Field delimiter (default: ',') */
  delimiter?: string;
  /** Line terminator (default: '\r\n') */
  lineTerminator?: string;
  /** Quote character (default: '"') */
  quoteChar?: string;
  /** Always quote fields */
  alwaysQuote?: boolean;
  /** Escape character for quotes within fields */
  escapeChar?: string;
  /** Include BOM for UTF-8 */
  includeBOM?: boolean;
  /** Encoding (default: 'utf-8') */
  encoding?: 'utf-8' | 'utf-16le' | 'utf-16be' | 'ascii' | 'latin1';
}

/**
 * JSON-specific options
 */
export interface JSONOptions {
  /** Pretty print with indentation */
  pretty?: boolean;
  /** Indentation size (default: 2) */
  indent?: number;
  /** Include metadata wrapper */
  includeMetadata?: boolean;
  /** Custom replacer function for JSON.stringify */
  replacer?: (key: string, value: unknown) => unknown;
  /** Date format for serialization */
  dateFormat?: 'iso' | 'timestamp' | 'locale';
}

/**
 * Main export options
 */
export interface ExportOptions {
  /** Export format */
  format: ExportFormat;
  /** Columns to export (if not provided, derives from data) */
  columns?: ExportColumn[];
  /** Include column headers in output */
  includeHeaders?: boolean;
  /** Row sampling options */
  sampling?: SamplingOptions;
  /** File name (without extension) */
  fileName?: string;
  /** Sheet name (Excel only, for single-sheet export) */
  sheetName?: string;
  /** Styling options (Excel only, for single-sheet export) */
  styling?: ExportStyleOptions;
  /** Workbook metadata */
  metadata?: WorkbookMetadata;
  /** @deprecated Use metadata.author instead */
  author?: string;
  /** @deprecated Use metadata.title instead */
  title?: string;

  // Multi-sheet support
  /** Multiple sheet definitions (Excel only) */
  sheets?: SheetDefinition[];

  // Global workbook options (Excel only)
  /** Default date format for all sheets */
  defaultDateFormat?: string;
  /** Default number format for all sheets */
  defaultNumberFormat?: string;
  /** Calculate formulas on save */
  calcOnSave?: boolean;

  // Format-specific options
  /** CSV-specific options */
  csv?: CSVOptions;
  /** JSON-specific options */
  json?: JSONOptions;
}

/**
 * Result of an export operation
 */
export interface ExportResult {
  /** Whether the export succeeded */
  success: boolean;
  /** The exported data as a buffer/blob */
  data?: Uint8Array;
  /** MIME type of the exported data */
  mimeType?: string;
  /** Suggested file name with extension */
  fileName?: string;
  /** Number of rows exported (total across all sheets) */
  rowCount?: number;
  /** Number of columns exported */
  columnCount?: number;
  /** Number of sheets (Excel only) */
  sheetCount?: number;
  /** Per-sheet statistics */
  sheetStats?: Array<{
    name: string;
    rowCount: number;
    columnCount: number;
  }>;
  /** File size in bytes */
  sizeBytes?: number;
  /** Error message if failed */
  error?: string;
}

/**
 * Default export options
 */
export const DEFAULT_EXPORT_OPTIONS: Partial<ExportOptions> = {
  format: 'excel',
  includeHeaders: true,
  sampling: { mode: 'all' },
  fileName: 'export',
  sheetName: 'Sheet1',
  styling: {
    boldHeaders: true,
    freezeHeader: true,
    autoFilter: true
  }
};

/**
 * Common cell styles for convenience
 */
export const CommonStyles = {
  /** Bold text */
  bold: { font: { bold: true } } as CellStyle,

  /** Italic text */
  italic: { font: { italic: true } } as CellStyle,

  /** Red text */
  redText: { font: { color: 'FF0000' } } as CellStyle,

  /** Green text */
  greenText: { font: { color: '008000' } } as CellStyle,

  /** Blue text */
  blueText: { font: { color: '0000FF' } } as CellStyle,

  /** Yellow highlight */
  yellowHighlight: { fill: { pattern: 'solid', fgColor: 'FFFF00' } } as CellStyle,

  /** Light gray background */
  lightGrayBg: { fill: { pattern: 'solid', fgColor: 'F5F5F5' } } as CellStyle,

  /** Centered text */
  centered: { alignment: { horizontal: 'center', vertical: 'middle' } } as CellStyle,

  /** Right-aligned text */
  rightAligned: { alignment: { horizontal: 'right' } } as CellStyle,

  /** Wrapped text */
  wrapped: { alignment: { wrapText: true } } as CellStyle,

  /** Currency format */
  currency: { numFmt: '$#,##0.00' } as CellStyle,

  /** Percentage format */
  percentage: { numFmt: '0.00%' } as CellStyle,

  /** Date format */
  date: { numFmt: 'yyyy-mm-dd' } as CellStyle,

  /** DateTime format */
  dateTime: { numFmt: 'yyyy-mm-dd hh:mm:ss' } as CellStyle,

  /** Thin border all around */
  thinBorder: {
    border: {
      top: { style: 'thin' as BorderLineStyle, color: '000000' },
      bottom: { style: 'thin' as BorderLineStyle, color: '000000' },
      left: { style: 'thin' as BorderLineStyle, color: '000000' },
      right: { style: 'thin' as BorderLineStyle, color: '000000' }
    }
  } as CellStyle,

  /** Header style (bold, centered, with background) */
  header: {
    font: { bold: true, color: 'FFFFFF' },
    fill: { pattern: 'solid' as FillPattern, fgColor: '4472C4' },
    alignment: { horizontal: 'center' as HorizontalAlignment, vertical: 'middle' as VerticalAlignment },
    border: {
      bottom: { style: 'thin' as BorderLineStyle, color: '000000' }
    }
  } as CellStyle
};

/**
 * Helper function to merge cell styles
 */
export function mergeCellStyles(...styles: (CellStyle | undefined)[]): CellStyle {
  const result: CellStyle = {};

  for (const style of styles) {
    if (!style) continue;

    if (style.font) {
      result.font = { ...(result.font || {}), ...style.font };
    }
    if (style.fill) {
      result.fill = { ...(result.fill || {}), ...style.fill };
    }
    if (style.border) {
      result.border = { ...(result.border || {}), ...style.border };
    }
    if (style.alignment) {
      result.alignment = { ...(result.alignment || {}), ...style.alignment };
    }
    if (style.numFmt) {
      result.numFmt = style.numFmt;
    }
  }

  return result;
}
