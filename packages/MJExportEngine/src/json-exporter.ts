import { BaseExporter } from './base-exporter';
import { ExportOptions, ExportResult, ExportData } from './types';

/**
 * JSON exporter - exports data as formatted JSON
 * Lightweight, no external dependencies
 */
export class JSONExporter extends BaseExporter {
  private prettyPrint: boolean;
  private indent: number;

  constructor(options: Partial<ExportOptions> & { prettyPrint?: boolean; indent?: number } = {}) {
    super({ ...options, format: 'json' });
    this.prettyPrint = options.prettyPrint !== false;
    this.indent = options.indent ?? 2;
  }

  getMimeType(): string {
    return 'application/json;charset=utf-8';
  }

  getFileExtension(): string {
    return 'json';
  }

  async export(data: ExportData): Promise<ExportResult> {
    try {
      // Apply sampling
      const sampledData = this.applySampling(data);

      // Derive columns for potential filtering
      const columns = this.deriveColumns(sampledData);

      // If columns specified, filter data to only include those columns
      let outputData: unknown[];
      if (this.options.columns && this.options.columns.length > 0 && !Array.isArray(sampledData[0])) {
        outputData = (sampledData as Record<string, unknown>[]).map(row => {
          const filtered: Record<string, unknown> = {};
          for (const col of columns) {
            filtered[col.displayName || col.name] = row[col.name];
          }
          return filtered;
        });
      } else {
        outputData = sampledData;
      }

      // Serialize to JSON
      const jsonString = this.prettyPrint
        ? JSON.stringify(outputData, null, this.indent)
        : JSON.stringify(outputData);

      // Convert to bytes
      const encoder = new TextEncoder();
      const bytes = encoder.encode(jsonString);

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
}
