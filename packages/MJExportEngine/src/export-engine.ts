import {
  ExportOptions,
  ExportResult,
  ExportFormat,
  ExportData,
  SheetDefinition,
  WorkbookMetadata
} from './types';
import { BaseExporter } from './base-exporter';
import { ExcelExporter } from './excel-exporter';
import { CSVExporter } from './csv-exporter';
import { JSONExporter } from './json-exporter';

/**
 * Main export engine class
 * Provides a unified API for all export formats including multi-sheet Excel workbooks
 */
export class ExportEngine {
  /**
   * Export data to the specified format
   * @param data Array of data objects or arrays to export
   * @param options Export options including format, columns, sampling, etc.
   * @returns Export result with buffer and metadata
   */
  static async export(
    data: ExportData,
    options: Partial<ExportOptions> = {}
  ): Promise<ExportResult> {
    const exporter = this.createExporter(options.format || 'excel', options);
    return exporter.export(data);
  }

  /**
   * Export to Excel format (single sheet)
   */
  static async toExcel(
    data: ExportData,
    options: Omit<Partial<ExportOptions>, 'format'> = {}
  ): Promise<ExportResult> {
    return this.export(data, { ...options, format: 'excel' });
  }

  /**
   * Export to CSV format
   */
  static async toCSV(
    data: ExportData,
    options: Omit<Partial<ExportOptions>, 'format'> = {}
  ): Promise<ExportResult> {
    return this.export(data, { ...options, format: 'csv' });
  }

  /**
   * Export to JSON format
   */
  static async toJSON(
    data: ExportData,
    options: Omit<Partial<ExportOptions>, 'format'> = {}
  ): Promise<ExportResult> {
    return this.export(data, { ...options, format: 'json' });
  }

  /**
   * Create a multi-sheet Excel workbook
   * @param sheets Array of sheet definitions
   * @param options Additional workbook options
   * @returns Export result with buffer and metadata
   *
   * @example
   * ```typescript
   * const result = await ExportEngine.toExcelMultiSheet([
   *   {
   *     name: 'Sales Data',
   *     data: salesData,
   *     headerStyle: { font: { bold: true }, fill: { pattern: 'solid', fgColor: '4472C4' } }
   *   },
   *   {
   *     name: 'Summary',
   *     data: summaryData,
   *     formulas: [{ cell: 'B10', formula: 'SUM(B2:B9)' }]
   *   }
   * ], {
   *   fileName: 'quarterly-report',
   *   metadata: { author: 'Sales Team', title: 'Q1 2024 Report' }
   * });
   * ```
   */
  static async toExcelMultiSheet(
    sheets: SheetDefinition[],
    options: {
      fileName?: string;
      metadata?: WorkbookMetadata;
      defaultDateFormat?: string;
      defaultNumberFormat?: string;
      calcOnSave?: boolean;
    } = {}
  ): Promise<ExportResult> {
    const exporter = new ExcelExporter({
      format: 'excel',
      sheets,
      fileName: options.fileName,
      metadata: options.metadata,
      defaultDateFormat: options.defaultDateFormat,
      defaultNumberFormat: options.defaultNumberFormat,
      calcOnSave: options.calcOnSave
    });

    // Pass empty array since data comes from sheets
    return exporter.export([]);
  }

  /**
   * Create an exporter instance for the specified format
   */
  static createExporter(format: ExportFormat, options: Partial<ExportOptions> = {}): BaseExporter {
    switch (format) {
      case 'excel':
        return new ExcelExporter(options);
      case 'csv':
        return new CSVExporter(options);
      case 'json':
        return new JSONExporter(options);
      default:
        throw new Error(`Unsupported export format: ${format}`);
    }
  }

  /**
   * Get supported export formats
   */
  static getSupportedFormats(): ExportFormat[] {
    return ['excel', 'csv', 'json'];
  }

  /**
   * Get MIME type for a format
   */
  static getMimeType(format: ExportFormat): string {
    const exporter = this.createExporter(format);
    return exporter.getMimeType();
  }

  /**
   * Get file extension for a format
   */
  static getFileExtension(format: ExportFormat): string {
    const exporter = this.createExporter(format);
    return exporter.getFileExtension();
  }

  /**
   * Check if a format supports multi-sheet export
   */
  static supportsMultiSheet(format: ExportFormat): boolean {
    return format === 'excel';
  }

  /**
   * Check if a format supports formulas
   */
  static supportsFormulas(format: ExportFormat): boolean {
    return format === 'excel';
  }

  /**
   * Check if a format supports styling
   */
  static supportsStyling(format: ExportFormat): boolean {
    return format === 'excel';
  }

  /**
   * Get format capabilities
   */
  static getFormatCapabilities(format: ExportFormat): {
    multiSheet: boolean;
    formulas: boolean;
    styling: boolean;
    images: boolean;
    dataValidation: boolean;
    conditionalFormatting: boolean;
    protection: boolean;
  } {
    if (format === 'excel') {
      return {
        multiSheet: true,
        formulas: true,
        styling: true,
        images: true,
        dataValidation: true,
        conditionalFormatting: true,
        protection: true
      };
    }

    return {
      multiSheet: false,
      formulas: false,
      styling: false,
      images: false,
      dataValidation: false,
      conditionalFormatting: false,
      protection: false
    };
  }
}
