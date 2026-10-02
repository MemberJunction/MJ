import { ExportOptions, ExportResult, ExportColumn, ExportData, ExportDataRow, DEFAULT_EXPORT_OPTIONS } from './types';

/**
 * Base class for all exporters
 * Provides common functionality for data processing, sampling, and column handling
 */
export abstract class BaseExporter {
  protected options: ExportOptions;

  constructor(options: Partial<ExportOptions> = {}) {
    this.options = { ...DEFAULT_EXPORT_OPTIONS, ...options } as ExportOptions;
  }

  /**
   * Export data to the target format
   * @param data Array of data objects or arrays to export
   * @returns Export result with buffer and metadata
   */
  abstract export(data: ExportData): Promise<ExportResult>;

  /**
   * Get the MIME type for this export format
   */
  abstract getMimeType(): string;

  /**
   * Get the file extension for this export format
   */
  abstract getFileExtension(): string;

  /**
   * Derive columns from data if not explicitly provided
   */
  protected deriveColumns(data: ExportData): ExportColumn[] {
    if (this.options.columns && this.options.columns.length > 0) {
      return this.options.columns;
    }

    if (data.length === 0) {
      return [];
    }

    const firstRow = data[0];

    if (Array.isArray(firstRow)) {
      // Array of arrays - create generic column names
      return firstRow.map((_, index) => ({
        name: `Column${index + 1}`,
        displayName: `Column ${index + 1}`
      }));
    } else {
      // Array of objects - use keys as column names
      return Object.keys(firstRow as Record<string, unknown>).map(key => ({
        name: key,
        displayName: this.formatColumnName(key)
      }));
    }
  }

  /**
   * Format a column name for display (e.g., "firstName" -> "First Name")
   */
  protected formatColumnName(name: string): string {
    // Handle camelCase and PascalCase
    const withSpaces = name.replace(/([A-Z])/g, ' $1').trim();
    // Handle snake_case
    const withoutUnderscores = withSpaces.replace(/_/g, ' ');
    // Capitalize first letter of each word
    return withoutUnderscores.replace(/\b\w/g, char => char.toUpperCase());
  }

  /**
   * Apply sampling to data based on options
   */
  protected applySampling(data: ExportData): ExportData {
    const sampling = this.options.sampling || { mode: 'all' };

    switch (sampling.mode) {
      case 'all':
        return data;

      case 'top':
        return this.sampleTop(data, sampling.count || 100);

      case 'bottom':
        return this.sampleBottom(data, sampling.count || 100);

      case 'every-nth':
        return this.sampleEveryNth(data, sampling.interval || 10);

      case 'random':
        return this.sampleRandom(data, sampling.count || 100);

      default:
        return data;
    }
  }

  /**
   * Get top N rows
   */
  private sampleTop(data: ExportData, count: number): ExportData {
    return data.slice(0, count);
  }

  /**
   * Get bottom N rows
   */
  private sampleBottom(data: ExportData, count: number): ExportData {
    return data.slice(-count);
  }

  /**
   * Get every Nth row
   */
  private sampleEveryNth(data: ExportData, interval: number): ExportData {
    const result: ExportData = [];
    for (let i = 0; i < data.length; i += interval) {
      result.push(data[i]);
    }
    return result;
  }

  /**
   * Get random N rows
   */
  private sampleRandom(data: ExportData, count: number): ExportData {
    if (data.length <= count) {
      return data;
    }

    // Fisher-Yates shuffle on indices, then take first N
    const indices = Array.from({ length: data.length }, (_, i) => i);
    for (let i = indices.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [indices[i], indices[j]] = [indices[j], indices[i]];
    }

    return indices.slice(0, count).sort((a, b) => a - b).map(i => data[i]);
  }

  /**
   * Extract row values in column order
   */
  protected extractRowValues(row: ExportDataRow, columns: ExportColumn[]): unknown[] {
    if (Array.isArray(row)) {
      return row;
    }

    return columns.map(col => {
      const value = row[col.name];
      return this.formatValue(value, col);
    });
  }

  /**
   * Format a cell value based on column type
   */
  protected formatValue(value: unknown, column: ExportColumn): unknown {
    if (value === null || value === undefined) {
      return '';
    }

    switch (column.dataType) {
      case 'dateonly': {
        // Re-anchored on UTC midnight of the stored day: Excel's serial arithmetic is UTC, and the
        // text exporters read the day back with calendarDay().
        const day = this.calendarDay(value);
        return day ? new Date(`${day}T00:00:00.000Z`) : value;
      }

      case 'date':
        if (value instanceof Date) {
          return value;
        }
        if (typeof value === 'string' || typeof value === 'number') {
          const date = new Date(value);
          return isNaN(date.getTime()) ? value : date;
        }
        return value;

      case 'boolean':
        return typeof value === 'boolean' ? value : Boolean(value);

      case 'number':
      case 'currency':
        if (typeof value === 'number') {
          return value;
        }
        const num = Number(value);
        return isNaN(num) ? value : num;

      default:
        return value;
    }
  }

  /**
   * The calendar day a date-only value stores, as ISO 8601 `YYYY-MM-DD`, or `null` when it names none.
   *
   * A SQL `date` arrives as a Date at UTC midnight or as its ISO string, so the day is read from the
   * UTC parts or the leading `YYYY-MM-DD` of the string — never from local getters, which give the
   * previous day for anyone west of Greenwich.
   *
   * A leading `YYYY-MM-DD` that is not a real day (`2026-13-45`, `2026-02-30`) names none: trusted, it
   * wrote "Invalid Date" or rolled over to another day (`2026-03-02`). The caller writes the original
   * value instead.
   */
  protected calendarDay(value: unknown): string | null {
    if (typeof value === 'string' && /^\d{4}-\d{2}-\d{2}/.test(value)) {
      const day = value.slice(0, 10);
      const parsed = new Date(`${day}T00:00:00.000Z`);
      return !isNaN(parsed.getTime()) && parsed.toISOString().slice(0, 10) === day ? day : null;
    }
    const date = value instanceof Date ? value : typeof value === 'string' || typeof value === 'number' ? new Date(value) : null;
    if (!date || isNaN(date.getTime())) {
      return null;
    }
    return date.toISOString().slice(0, 10);
  }

  /**
   * Generate the full file name with extension
   */
  protected getFullFileName(): string {
    const baseName = this.options.fileName || 'export';
    return `${baseName}.${this.getFileExtension()}`;
  }
}
