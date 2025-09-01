import fs, { JsonWriteOptions } from 'fs-extra';
import { RecordData } from './sync-engine';

/**
 * Helper class for writing JSON files with consistent property ordering for RecordData objects.
 * Ensures that all metadata files have the same property order: fields, relatedEntities, primaryKey, sync
 */
export class JsonWriteHelper {
  
  /**
   * Write RecordData or arrays of RecordData with consistent property ordering
   * @param filePath - Path to the JSON file to write
   * @param data - RecordData object or array of RecordData objects
   */
  static async writeOrderedRecordData(filePath: string, data: RecordData | RecordData[]): Promise<void> {
    // Pre-process the data to ensure correct ordering before JSON.stringify
    const normalizedData = this.normalizeRecordDataOrder(data);
    
    // Use JSON.stringify with proper spacing
    const jsonString = JSON.stringify(normalizedData, null, 2);
    await fs.writeFile(filePath, jsonString, 'utf8');
  }

  /**
   * Recursively normalize RecordData objects to ensure correct property ordering
   * @param data - RecordData object, array of RecordData objects, or any nested structure
   * @returns Normalized data with consistent property ordering
   */
  private static normalizeRecordDataOrder(data: any): any {
    if (Array.isArray(data)) {
      return data.map(item => this.normalizeRecordDataOrder(item));
    }
    
    if (data && typeof data === 'object') {
      // Check if this looks like a RecordData object
      if (data.fields !== undefined) {
        // This is a RecordData object - rebuild with correct order
        const ordered: any = {};
        
        // Add properties in desired order: fields, relatedEntities, primaryKey, sync, deleteRecord
        if (data.fields !== undefined) {
          ordered.fields = this.normalizeRecordDataOrder(data.fields);
        }
        if (data.relatedEntities !== undefined) {
          ordered.relatedEntities = this.normalizeRecordDataOrder(data.relatedEntities);
        }
        if (data.primaryKey !== undefined) {
          ordered.primaryKey = this.normalizeRecordDataOrder(data.primaryKey);
        }
        if (data.sync !== undefined) {
          ordered.sync = this.normalizeRecordDataOrder(data.sync);
        }
        if (data.deleteRecord !== undefined) {
          ordered.deleteRecord = this.normalizeRecordDataOrder(data.deleteRecord);
        }
        
        return ordered;
      } else {
        // Regular object - recursively process properties
        const processed: any = {};
        for (const [key, value] of Object.entries(data)) {
          processed[key] = this.normalizeRecordDataOrder(value);
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
   * @returns RecordData object with guaranteed property order
   */
  static createOrderedRecordData(
    fields: Record<string, any>,
    relatedEntities: Record<string, RecordData[]>,
    primaryKey: Record<string, any>,
    sync: { lastModified: string; checksum: string }
  ): RecordData {
    // Use a Map to preserve insertion order, then convert to object
    const orderedProps = new Map<string, any>();
    
    // Add properties in the desired order
    orderedProps.set('fields', fields);
    
    if (Object.keys(relatedEntities).length > 0) {
      orderedProps.set('relatedEntities', relatedEntities);
    }
    
    orderedProps.set('primaryKey', primaryKey);
    orderedProps.set('sync', sync);
    
    // Convert Map to object while preserving order
    const recordData = {} as RecordData;
    for (const [key, value] of orderedProps) {
      (recordData as any)[key] = value;
    }
    
    return recordData;
  }

  /**
   * Write regular JSON data (non-RecordData) with standard formatting
   * @param filePath - Path to the JSON file to write
   * @param data - Any JSON-serializable data
   * @param options - Optional JSON write options
   */
  static async writeJson(filePath: string, data: any, options?: JsonWriteOptions): Promise<void> {
    const defaultOptions = { spaces: 2 };
    const writeOptions = typeof options === 'object' && options !== null 
      ? { ...defaultOptions, ...options }
      : defaultOptions;
    await fs.writeJson(filePath, data, writeOptions);
  }
}