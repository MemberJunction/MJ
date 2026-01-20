import { BaseExporter } from './base-exporter';
import { ExportOptions, ExportResult, ExportData } from './types';

/**
 * CSV exporter - lightweight, no external dependencies
 * Properly handles escaping, quotes, and special characters
 */
export class CSVExporter extends BaseExporter {
  private delimiter: string;
  private lineEnding: string;

  constructor(options: Partial<ExportOptions> & { delimiter?: string; lineEnding?: string } = {}) {
    super({ ...options, format: 'csv' });
    this.delimiter = options.delimiter || ',';
    this.lineEnding = options.lineEnding || '\r\n';
  }

  getMimeType(): string {
    return 'text/csv;charset=utf-8';
  }

  getFileExtension(): string {
    return 'csv';
  }

  async export(data: ExportData): Promise<ExportResult> {
    try {
      // Apply sampling
      const sampledData = this.applySampling(data);

      // Derive columns
      const columns = this.deriveColumns(sampledData);

      if (columns.length === 0) {
        return {
          success: false,
          error: 'No columns to export'
        };
      }

      const lines: string[] = [];

      // Add headers
      if (this.options.includeHeaders !== false) {
        const headerLine = columns
          .map(col => this.escapeCSVValue(col.displayName || col.name))
          .join(this.delimiter);
        lines.push(headerLine);
      }

      // Add data rows
      for (const row of sampledData) {
        const values = this.extractRowValues(row, columns);
        const line = values
          .map(value => this.escapeCSVValue(this.formatCSVValue(value)))
          .join(this.delimiter);
        lines.push(line);
      }

      // Join lines and convert to bytes
      const csvContent = lines.join(this.lineEnding);
      // Add BOM for Excel compatibility with UTF-8
      const bom = '\uFEFF';
      const contentWithBom = bom + csvContent;
      const encoder = new TextEncoder();
      const bytes = encoder.encode(contentWithBom);

      return {
        success: true,
        data: bytes,
        mimeType: this.getMimeType(),
        fileName: this.getFullFileName(),
        rowCount: sampledData.length,
        columnCount: columns.length
      };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : String(error)
      };
    }
  }

  /**
   * Escape a value for CSV format
   * Handles quotes, commas, newlines
   */
  private escapeCSVValue(value: string): string {
    // If value contains delimiter, newline, or quote, wrap in quotes
    const needsQuotes = value.includes(this.delimiter) ||
                        value.includes('\n') ||
                        value.includes('\r') ||
                        value.includes('"');

    if (needsQuotes) {
      // Escape quotes by doubling them
      const escaped = value.replace(/"/g, '""');
      return `"${escaped}"`;
    }

    return value;
  }

  /**
   * Format a value for CSV output
   */
  private formatCSVValue(value: unknown): string {
    if (value === null || value === undefined) {
      return '';
    }

    if (value instanceof Date) {
      return value.toISOString();
    }

    if (typeof value === 'boolean') {
      return value ? 'TRUE' : 'FALSE';
    }

    if (typeof value === 'object') {
      return JSON.stringify(value);
    }

    return String(value);
  }
}
