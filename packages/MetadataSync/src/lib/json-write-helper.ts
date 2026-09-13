import fs, { JsonWriteOptions } from 'fs-extra';
import { RecordData } from './sync-engine';

/**
 * Helper class for writing JSON files for RecordData objects.
 * Preserves the caller's key order, recursing into known keys (fields, relatedEntities, primaryKey, sync, etc.).
 */
export class JsonWriteHelper {
  
  /**
   * Write RecordData or arrays of RecordData with consistent property ordering
   * @param filePath - Path to the JSON file to write
   * @param data - RecordData object or array of RecordData objects
   */
  static async writeOrderedRecordData(filePath: string, data: RecordData | RecordData[]): Promise<void> {
    // Pre-process the data to ensure correct ordering before JSON.stringify
    const normalizedData = this.preserveAndRecurseRecordData(data);
    
    // Use JSON.stringify with proper spacing
    const jsonString = JSON.stringify(normalizedData, null, 2);
    await fs.writeFile(filePath, jsonString, 'utf8');
  }

  /**
   * Recursively processes RecordData objects preserving key order while recursing into nested structures
   * @param data - RecordData object, array of RecordData objects, or any nested structure
   * @returns Processed data with preserved property ordering
   */
  private static preserveAndRecurseRecordData(data: unknown): unknown {
    if (Array.isArray(data)) {
      return data.map(item => this.preserveAndRecurseRecordData(item));
    }

    if (data && typeof data === 'object') {
      const dataObj = data as Record<string, unknown>;
      // Check if this looks like a RecordData object
      if (dataObj.fields !== undefined) {
        // This is a RecordData object - rebuild preserving original key order
        const ordered: Record<string, unknown> = {};
        const knownKeys = new Set([
          '$schema',
          'primaryKey',
          'fields',
          'collections',
          'embeds',
          'extension',
          'relatedEntities',
          'sync',
          '__mj_sync_notes',
          'deleteRecord',
        ]);

        // Process keys in original order, preserving user's ordering
        for (const key of Object.keys(dataObj)) {
          if (knownKeys.has(key)) {
            // Known key - process recursively
            ordered[key] = this.preserveAndRecurseRecordData(dataObj[key]);
          } else {
            // Unknown key (like _comments) - preserve exactly as-is
            ordered[key] = dataObj[key];
          }
        }

        return ordered;
      } else {
        // Regular object - recursively process properties
        const processed: Record<string, unknown> = {};
        for (const [key, value] of Object.entries(dataObj)) {
          processed[key] = this.preserveAndRecurseRecordData(value);
        }
        return processed;
      }
    }

    return data;
  }

  /**
   * Create a RecordData object with explicit property ordering for consistent JSON output
   * @param fields - Entity field data
   * @param relatedEntities - Related entity data
   * @param primaryKey - Primary key data
   * @param sync - Sync metadata
   * @param collections - First-class collections data
   * @param embeds - First-class embeds data
   * @param extension - First-class extension data
   * @param schema - Optional $schema URI
   * @returns RecordData object with guaranteed property order
   */
  static createOrderedRecordData(
    fields: Record<string, unknown>,
    relatedEntities: Record<string, RecordData[]>,
    primaryKey: Record<string, unknown>,
    sync: { lastModified: string; checksum: string },
    collections?: Record<string, RecordData[]>,
    embeds?: Record<string, RecordData>,
    extension?: RecordData['extension'],
    schema?: string
  ): RecordData {
    // Use a Map to preserve insertion order, then convert to object
    const orderedProps = new Map<string, unknown>();
    
    if (schema) {
      orderedProps.set('$schema', schema);
    }

    // Canonical order: fields first (matches 5,894 of 5,897 records in corpus)
    orderedProps.set('fields', fields);

    if (collections && Object.keys(collections).length > 0) {
      orderedProps.set('collections', collections);
    }

    if (embeds && Object.keys(embeds).length > 0) {
      orderedProps.set('embeds', embeds);
    }

    if (extension && Object.keys(extension).length > 0) {
      orderedProps.set('extension', extension);
    }
    
    if (relatedEntities && Object.keys(relatedEntities).length > 0) {
      orderedProps.set('relatedEntities', relatedEntities);
    }

    if (primaryKey && Object.keys(primaryKey).length > 0) {
      orderedProps.set('primaryKey', primaryKey);
    }
    
    if (sync) {
      orderedProps.set('sync', sync);
    }
    
    // Convert Map to object while preserving order
    const recordData = {} as RecordData;
    const recordObj = recordData as unknown as Record<string, unknown>;
    for (const [key, value] of orderedProps) {
      recordObj[key] = value;
    }
    
    return recordData;
  }

  /**
   * Write regular JSON data (non-RecordData) with standard formatting
   * @param filePath - Path to the JSON file to write
   * @param data - Any JSON-serializable data
   * @param options - Optional JSON write options
   */
  static async writeJson(filePath: string, data: unknown, options?: JsonWriteOptions): Promise<void> {
    const defaultOptions = { spaces: 2 };
    const writeOptions = typeof options === 'object' && options !== null 
      ? { ...defaultOptions, ...options }
      : defaultOptions;
    await fs.writeJson(filePath, data, writeOptions);
  }
}