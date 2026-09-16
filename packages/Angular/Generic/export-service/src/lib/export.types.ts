/**
 * Export dialog configuration
 */
export interface ExportDialogConfig {
  /** Title for the dialog */
  title?: string;
  /** Total number of rows available for export */
  totalRows: number;
  /** Column definitions for the data */
  columns?: ExportColumnInfo[];
  /** Whether to show advanced options by default */
  showAdvancedOptions?: boolean;
  /** Default file name */
  fileName?: string;
}

/**
 * Column information for export
 */
export interface ExportColumnInfo {
  name: string;  // case-violation-ok-legacy-back-compat: the type is named in an exported signature, so consumers build object literals against it; an interface has no runtime carrier for a stub
  displayName: string;  // case-violation-ok-legacy-back-compat: the type is named in an exported signature, so consumers build object literals against it; an interface has no runtime carrier for a stub
  dataType?: 'string' | 'number' | 'date' | 'boolean' | 'currency';  // case-violation-ok-legacy-back-compat: the type is named in an exported signature, so consumers build object literals against it; an interface has no runtime carrier for a stub
  selected?: boolean;  // case-violation-ok-legacy-back-compat: the type is named in an exported signature, so consumers build object literals against it; an interface has no runtime carrier for a stub
}

/**
 * Result from the export dialog
 */
export interface ExportDialogResult {
  /** Whether the user confirmed the export */
  confirmed: boolean;
  /** Selected export format */
  format?: 'excel' | 'csv' | 'json';
  /** Whether to include headers */
  includeHeaders?: boolean;
  /** Row sampling configuration */
  sampling?: {
    mode: 'all' | 'top' | 'bottom' | 'every-nth' | 'random';
    count?: number;
    interval?: number;
  };
  /** Selected columns (if column selection was enabled) */
  selectedColumns?: string[];
  /** Custom file name */
  fileName?: string;
}

/**
 * Options for the export service
 */
export interface ExportServiceOptions {
  /** Data to export */
  data: Record<string, unknown>[];
  /** Export format */
  format: 'excel' | 'csv' | 'json';
  /** File name without extension */
  fileName?: string;
  /** Include column headers */
  includeHeaders?: boolean;
  /** Row sampling options */
  sampling?: {
    mode: 'all' | 'top' | 'bottom' | 'every-nth' | 'random';
    count?: number;
    interval?: number;
  };
  /** Columns to export */
  columns?: ExportColumnInfo[];
}
