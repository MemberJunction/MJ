import { Injectable } from '@angular/core';
import {
  ExportEngine,
  ExportOptions,
  ExportResult,
  ExportFormat,
  ExportData,
  ExportColumn,
  SamplingMode,
  SamplingOptions
} from '@memberjunction/export-engine';

/**
 * Configuration for the export dialog
 */
export interface ExportDialogConfig {
  /** Data to export */
  data: ExportData;
  /** Columns available for export (derived from data if not provided) */
  columns?: ExportColumn[];
  /** Default file name (without extension) */
  defaultFileName?: string;
  /** Available formats to show in dialog */
  availableFormats?: ExportFormat[];
  /** Default format selection */
  defaultFormat?: ExportFormat;
  /** Whether to show sampling options */
  showSamplingOptions?: boolean;
  /** Default sampling mode */
  defaultSamplingMode?: SamplingMode;
  /** Default sample count */
  defaultSampleCount?: number;
  /** Title for the dialog */
  dialogTitle?: string;
}

/**
 * Result from export dialog
 */
export interface ExportDialogResult {
  /** Whether the user proceeded with export */
  exported: boolean;
  /** The export result if exported */
  result?: ExportResult;
  /** Options used for export */
  options?: ExportOptions;
}

/**
 * Angular service for data export functionality
 * Wraps the @memberjunction/export-engine for Angular usage
 */
@Injectable({
  providedIn: 'root'
})
export class ExportService {
  /**
   * Export data directly without dialog
   * @param data Data to export
   * @param options Export options
   * @returns Export result with buffer and metadata
   */
  async export(data: ExportData, options: Partial<ExportOptions> = {}): Promise<ExportResult> {
    return ExportEngine.export(data, options);
  }

  /**
   * Export to Excel format
   */
  async toExcel(data: ExportData, options: Omit<Partial<ExportOptions>, 'format'> = {}): Promise<ExportResult> {
    return ExportEngine.toExcel(data, options);
  }

  /**
   * Export to CSV format
   */
  async toCSV(data: ExportData, options: Omit<Partial<ExportOptions>, 'format'> = {}): Promise<ExportResult> {
    return ExportEngine.toCSV(data, options);
  }

  /**
   * Export to JSON format
   */
  async toJSON(data: ExportData, options: Omit<Partial<ExportOptions>, 'format'> = {}): Promise<ExportResult> {
    return ExportEngine.toJSON(data, options);
  }

  /**
   * Get supported export formats
   */
  getSupportedFormats(): ExportFormat[] {
    return ExportEngine.getSupportedFormats();
  }

  /**
   * Download the export result as a file
   * @param result Export result containing the data
   */
  downloadResult(result: ExportResult): void {
    if (!result.success || !result.data) {
      throw new Error(result.error || 'Export failed - no data to download');
    }

    const blob = new Blob([result.data as BlobPart], { type: result.mimeType });
    const url = URL.createObjectURL(blob);

    const link = document.createElement('a');
    link.href = url;
    link.download = result.fileName || 'export';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);

    URL.revokeObjectURL(url);
  }

  /**
   * Export and immediately download
   * @param data Data to export
   * @param options Export options
   */
  async exportAndDownload(data: ExportData, options: Partial<ExportOptions> = {}): Promise<ExportResult> {
    const result = await this.export(data, options);
    if (result.success) {
      this.downloadResult(result);
    }
    return result;
  }

  /**
   * Get available sampling modes with display labels
   */
  getSamplingModes(): { mode: SamplingMode; label: string; description: string }[] {
    return [
      { mode: 'all', label: 'All Rows', description: 'Export all data rows' },
      { mode: 'top', label: 'Top N', description: 'Export the first N rows' },
      { mode: 'bottom', label: 'Bottom N', description: 'Export the last N rows' },
      { mode: 'every-nth', label: 'Every Nth', description: 'Export every Nth row' },
      { mode: 'random', label: 'Random N', description: 'Export N random rows' }
    ];
  }

  /**
   * Get format display info
   */
  getFormatInfo(format: ExportFormat): { label: string; icon: string; description: string } {
    switch (format) {
      case 'excel':
        return {
          label: 'Excel',
          icon: 'fa-file-excel',
          description: 'Microsoft Excel spreadsheet (.xlsx)'
        };
      case 'csv':
        return {
          label: 'CSV',
          icon: 'fa-file-csv',
          description: 'Comma-separated values (.csv)'
        };
      case 'json':
        return {
          label: 'JSON',
          icon: 'fa-file-code',
          description: 'JavaScript Object Notation (.json)'
        };
    }
  }

  /**
   * Build sampling options from user selections
   */
  buildSamplingOptions(mode: SamplingMode, count?: number, interval?: number): SamplingOptions {
    const options: SamplingOptions = { mode };

    if (mode === 'top' || mode === 'bottom' || mode === 'random') {
      options.count = count || 100;
    } else if (mode === 'every-nth') {
      options.interval = interval || 10;
    }

    return options;
  }
}
