import fs from 'fs-extra';
import path from 'path';
import { RecordData } from './sync-engine';
import { JsonWriteHelper } from './json-write-helper';

/**
 * Represents a pending change to a file
 */
interface FileChange {
  /** Path to the file */
  filePath: string;
  /** Type of change operation */
  operation: 'write' | 'update-array' | 'update-single';
  /** The data to write */
  data: RecordData | RecordData[];
  /** For array updates: the index of the record to update */
  arrayIndex?: number;
  /** For updates: the primary key lookup to identify the record */
  primaryKeyLookup?: string;
}

/**
 * Batches file write operations to improve performance and ensure consistent property ordering.
 * Collects all changes during processing and writes each file only once at the end.
 */
export class FileWriteBatch {
  private changes = new Map<string, FileChange[]>();
  private fileContents = new Map<string, RecordData | RecordData[]>();
  
  /**
   * Queue a complete file write operation
   * @param filePath - Path to the file
   * @param data - RecordData or array of RecordData to write
   */
  queueWrite(filePath: string, data: RecordData | RecordData[]): void {
    const absolutePath = path.resolve(filePath);
    this.addChange(absolutePath, {
      filePath: absolutePath,
      operation: 'write',
      data
    });
  }
  
  /**
   * Queue an array record update operation
   * @param filePath - Path to the file containing the array
   * @param updatedRecord - The updated record data
   * @param primaryKeyLookup - Primary key lookup string to identify the record
   */
  queueArrayUpdate(filePath: string, updatedRecord: RecordData, primaryKeyLookup: string): void {
    const absolutePath = path.resolve(filePath);
    this.addChange(absolutePath, {
      filePath: absolutePath,
      operation: 'update-array',
      data: updatedRecord,
      primaryKeyLookup
    });
  }
  
  /**
   * Queue a single record update operation
   * @param filePath - Path to the file
   * @param updatedRecord - The updated record data
   */
  queueSingleUpdate(filePath: string, updatedRecord: RecordData): void {
    const absolutePath = path.resolve(filePath);
    this.addChange(absolutePath, {
      filePath: absolutePath,
      operation: 'update-single',
      data: updatedRecord
    });
  }
  
  /**
   * Load and cache file contents if not already loaded
   */
  private async ensureFileLoaded(filePath: string): Promise<void> {
    if (this.fileContents.has(filePath)) {
      return;
    }
    
    try {
      if (await fs.pathExists(filePath)) {
        const content = await fs.readJson(filePath);
        this.fileContents.set(filePath, content);
      }
    } catch (error) {
      // If file doesn't exist or can't be read, we'll create it fresh
      // Don't throw here - let the calling code handle it
    }
  }
  
  /**
   * Apply all queued changes to in-memory file contents
   */
  private async applyChanges(): Promise<void> {
    for (const [filePath, changes] of this.changes) {
      await this.ensureFileLoaded(filePath);

      // Start with existing file content or empty array
      let currentContent: RecordData | RecordData[] = this.fileContents.get(filePath) || [];

      for (const change of changes) {
        switch (change.operation) {
          case 'write':
            // Complete overwrite
            currentContent = change.data;
            break;

          case 'update-array': {
            // Ensure content is an array
            const contentArray = Array.isArray(currentContent) ? currentContent : [];

            if (change.primaryKeyLookup) {
              // Find existing record with matching primary key
              const index = contentArray.findIndex(r =>
                this.createPrimaryKeyLookup(r.primaryKey || {}) === change.primaryKeyLookup
              );

              if (index >= 0) {
                // Update existing record
                contentArray[index] = change.data as RecordData;
              } else {
                // Record not found, append it
                contentArray.push(change.data as RecordData);
              }
            } else {
              // No lookup key, just append
              contentArray.push(change.data as RecordData);
            }

            currentContent = contentArray;
            break;
          }

          case 'update-single':
            // Replace the entire file content with a single record
            currentContent = change.data;
            break;
        }
      }

      // Update the in-memory content
      if (currentContent !== undefined) {
        this.fileContents.set(filePath, currentContent);
      }
    }
  }
  
  /**
   * Write all batched changes to files using JsonWriteHelper for consistent ordering
   * @returns Number of files written
   */
  async flush(): Promise<number> {
    if (this.changes.size === 0) {
      return 0;
    }
    
    // Apply all changes to in-memory content first
    await this.applyChanges();
    
    // Write all files using JsonWriteHelper
    const writePromises: Promise<void>[] = [];
    
    for (const [filePath, content] of this.fileContents.entries()) {
      // Ensure directory exists
      const dir = path.dirname(filePath);
      await fs.ensureDir(dir);
      
      // Write using JsonWriteHelper for consistent property ordering
      writePromises.push(
        JsonWriteHelper.writeOrderedRecordData(filePath, content)
      );
    }
    
    await Promise.all(writePromises);
    
    const filesWritten = this.fileContents.size;
    
    // Clear all batched changes
    this.clear();
    
    return filesWritten;
  }
  
  /**
   * Clear all batched changes without writing
   */
  clear(): void {
    this.changes.clear();
    this.fileContents.clear();
  }
  
  /**
   * Get the number of files that will be written
   */
  getPendingFileCount(): number {
    return this.changes.size;
  }
  
  /**
   * Get all pending file paths
   */
  getPendingFiles(): string[] {
    return Array.from(this.changes.keys());
  }
  
  /**
   * Add a change to the batch
   */
  private addChange(filePath: string, change: FileChange): void {
    if (!this.changes.has(filePath)) {
      this.changes.set(filePath, []);
    }
    this.changes.get(filePath)!.push(change);
  }
  
  /**
   * Create a primary key lookup string (same logic as PullService)
   */
  private createPrimaryKeyLookup(primaryKey: Record<string, any>): string {
    const keys = Object.keys(primaryKey).sort();
    return keys.map(k => `${k}:${primaryKey[k]}`).join('|');
  }
}