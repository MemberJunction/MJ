import fs from 'fs-extra';
import path from 'path';
import { RunView, EntityInfo, UserInfo, BaseEntity } from '@memberjunction/core';
import { SyncEngine, RecordData } from '../lib/sync-engine';
import { loadEntityConfig, EntityConfig } from '../config';
import { configManager } from '../lib/config-manager';
import { FileWriteBatch } from '../lib/file-write-batch';
import { JsonWriteHelper } from '../lib/json-write-helper';
import { RecordProcessor } from '../lib/RecordProcessor';

export interface PullOptions {
  entity: string;
  filter?: string;
  dryRun?: boolean;
  multiFile?: string;
  verbose?: boolean;
  noValidate?: boolean;
  targetDir?: string;
  updateExistingRecords?: boolean;
  createNewFileIfNotFound?: boolean;
  include?: string[]; // Only process these directories (whitelist, supports patterns)
  exclude?: string[]; // Skip these directories (blacklist, supports patterns)
}

export interface PullCallbacks {
  onProgress?: (message: string) => void;
  onSuccess?: (message: string) => void;
  onError?: (message: string) => void;
  onWarn?: (message: string) => void;
  onLog?: (message: string) => void;
}

export interface PullResult {
  processed: number;
  created: number;
  updated: number;
  skipped: number;
  targetDir: string;
}

export class PullService {
  private syncEngine: SyncEngine;
  private contextUser: UserInfo;
  private createdBackupFiles: string[] = [];
  private createdBackupDirs: Set<string> = new Set();
  private fileWriteBatch: FileWriteBatch;
  private recordProcessor: RecordProcessor;
  
  constructor(syncEngine: SyncEngine, contextUser: UserInfo) {
    this.syncEngine = syncEngine;
    this.contextUser = contextUser;
    this.fileWriteBatch = new FileWriteBatch();
    this.recordProcessor = new RecordProcessor(syncEngine, contextUser);
  }
  
  async pull(options: PullOptions, callbacks?: PullCallbacks): Promise<PullResult> {
    // Validate that include and exclude are not used together
    if (options.include && options.exclude) {
      throw new Error('Cannot specify both --include and --exclude options. Please use one or the other.');
    }

    // Clear any previous batch operations
    this.fileWriteBatch.clear();
    this.createdBackupFiles = [];
    this.createdBackupDirs.clear();
    
    let targetDir: string;
    let entityConfig: EntityConfig | null;
    
    // Check if we should use a specific target directory
    if (options.targetDir) {
      if (options.verbose) {
        callbacks?.onLog?.(`Using specified target directory: ${options.targetDir}`);
      }
      process.chdir(options.targetDir);
      targetDir = process.cwd();
      
      // Load entity config from the current directory
      entityConfig = await loadEntityConfig(targetDir);
      if (!entityConfig) {
        throw new Error(`No .mj-sync.json found in ${targetDir}`);
      }
      if (entityConfig.entity !== options.entity) {
        throw new Error(`Directory ${targetDir} is configured for entity "${entityConfig.entity}", not "${options.entity}"`);
      }
    } else {
      // Original behavior - find entity directory
      const entityDirs = await this.findEntityDirectories(options.entity);
      
      if (entityDirs.length === 0) {
        throw new Error(`No directory found for entity "${options.entity}". Run "mj sync init" first.`);
      }
      
      if (entityDirs.length === 1) {
        targetDir = entityDirs[0];
      } else {
        // Multiple directories found - in service mode, we'll use the first one
        // The CLI can handle prompting for selection
        throw new Error(`Multiple directories found for entity "${options.entity}". Please specify target directory.`);
      }
      
      entityConfig = await loadEntityConfig(targetDir);
      if (!entityConfig) {
        throw new Error(`Invalid entity configuration in ${targetDir}`);
      }
    }
    
    // Show configuration notice only if relevant and in verbose mode
    if (options.verbose && entityConfig?.pull?.appendRecordsToExistingFile && entityConfig?.pull?.newFileName) {
      const targetFile = path.join(targetDir, entityConfig.pull.newFileName.endsWith('.json') 
        ? entityConfig.pull.newFileName 
        : `${entityConfig.pull.newFileName}.json`);
      
      if (await fs.pathExists(targetFile)) {
        callbacks?.onLog?.(`\n📝 Configuration: New records will be appended to existing file '${path.basename(targetFile)}'`);
      }
    }
    
    // Pull records
    callbacks?.onProgress?.(`Pulling ${options.entity} records`);
    const rv = new RunView();
    
    let filter = '';
    if (options.filter) {
      filter = options.filter;
    } else if (entityConfig?.pull?.filter) {
      filter = entityConfig.pull.filter;
    }
    
    const result = await rv.RunView({
      EntityName: options.entity,
      ExtraFilter: filter,
      ResultType: 'entity_object'
    }, this.contextUser);
    
    if (!result.Success) {
      throw new Error(`Failed to pull records: ${result.ErrorMessage}`);
    }
    
    callbacks?.onSuccess?.(`Found ${result.Results.length} records`);
    
    if (options.dryRun) {
      callbacks?.onLog?.(`\nDry run mode - would pull ${result.Results.length} records to ${targetDir}`);
      return {
        processed: 0,
        created: 0,
        updated: 0,
        skipped: 0,
        targetDir
      };
    }
    
    // Process records with error handling and rollback
    let pullResult: Omit<PullResult, 'targetDir'>;
    
    try {
      pullResult = await this.processRecords(
        result.Results,
        options,
        targetDir,
        entityConfig,
        callbacks
      );
      
      // Write all batched file changes at once
      if (!options.dryRun) {
        const filesWritten = await this.fileWriteBatch.flush();
        if (options.verbose && filesWritten > 0) {
          callbacks?.onSuccess?.(`Wrote ${filesWritten} files with consistent property ordering`);
        }
      }
      
      // Operation succeeded - clean up backup files
      if (!options.dryRun) {
        await this.cleanupBackupFiles();
      }
      
    } catch (error) {
      callbacks?.onError?.(`Pull operation failed: ${(error as any).message || error}`);
      
      // Attempt to rollback file changes if not in dry run mode
      if (!options.dryRun) {
        try {
          await this.rollbackFileChanges(callbacks);
          callbacks?.onWarn?.('File changes have been rolled back due to operation failure');
        } catch (rollbackError) {
          callbacks?.onError?.(`Rollback failed: ${(rollbackError as any).message || rollbackError}`);
        }
      }
      
      throw error;
    }
    
    return {
      ...pullResult,
      targetDir
    };
  }
  
  private async processRecords(
    records: BaseEntity[],
    options: PullOptions,
    targetDir: string,
    entityConfig: EntityConfig,
    callbacks?: PullCallbacks
  ): Promise<Omit<PullResult, 'targetDir'>> {
    const entityInfo = this.syncEngine.getEntityInfo(options.entity);
    if (!entityInfo) {
      throw new Error(`Entity information not found for: ${options.entity}`);
    }
    
    callbacks?.onProgress?.('Processing records');
    let processed = 0;
    let updated = 0;
    let created = 0;
    let skipped = 0;
    
    // If multi-file flag is set, collect all records
    if (options.multiFile) {
      const allRecords: RecordData[] = [];
      const errors: string[] = [];
      
      // Process records in parallel for multi-file mode
      const recordPromises = records.map(async (record, index) => {
        try {
          // Build primary key
          const primaryKey: Record<string, any> = {};
          for (const pk of entityInfo.PrimaryKeys) {
            primaryKey[pk.Name] = (record as any)[pk.Name];
          }
          
          // Process record for multi-file
          const recordData = await this.recordProcessor.processRecord(
            record, 
            primaryKey, 
            targetDir, 
            entityConfig, 
            options.verbose, 
            true
          );
          
          return { success: true, recordData, index };
        } catch (error) {
          const errorMessage = `Failed to process record ${index + 1}: ${(error as any).message || error}`;
          errors.push(errorMessage);
          callbacks?.onWarn?.(errorMessage);
          return { success: false, recordData: null, index };
        }
      });
      
      const recordResults = await Promise.all(recordPromises);
      
      // Collect successful records
      for (const result of recordResults) {
        if (result.success && result.recordData) {
          allRecords.push(result.recordData);
          processed++;
        }
      }
      
      if (options.verbose) {
        callbacks?.onProgress?.(`Processed ${processed}/${records.length} records in parallel`);
      }
      
      // Queue all records to single file for batched write
      if (allRecords.length > 0) {
        const fileName = options.multiFile.endsWith('.json') ? options.multiFile : `${options.multiFile}.json`;
        const filePath = path.join(targetDir, fileName);
        this.fileWriteBatch.queueWrite(filePath, allRecords);
        callbacks?.onSuccess?.(`Queued ${processed} records for ${path.basename(filePath)}`);
      }
      
      // If there were errors during parallel processing, throw them
      if (errors.length > 0) {
        throw new Error(`Multi-file processing completed with ${errors.length} errors:\n${errors.join('\n')}`);
      }
    } else {
      // Smart update logic for single-file-per-record
      const result = await this.processIndividualRecords(
        records,
        options,
        targetDir,
        entityConfig,
        entityInfo,
        callbacks
      );
      
      processed = result.processed;
      updated = result.updated;
      created = result.created;
      skipped = result.skipped;
      
      // Final status
      const statusParts = [`Processed ${processed} records`];
      if (updated > 0) statusParts.push(`updated ${updated}`);
      if (created > 0) statusParts.push(`created ${created}`);
      if (skipped > 0) statusParts.push(`skipped ${skipped}`);
      
      callbacks?.onSuccess?.(statusParts.join(', '));
    }
    
    return { processed, created, updated, skipped };
  }
  
  /**
   * Clean up backup files created during the pull operation
   * Should be called after successful pull operations to remove persistent backup files
   */
  async cleanupBackupFiles(): Promise<void> {
    if (this.createdBackupFiles.length === 0 && this.createdBackupDirs.size === 0) {
      return;
    }
    
    const errors: string[] = [];
    
    // Remove backup files
    for (const backupPath of this.createdBackupFiles) {
      try {
        if (await fs.pathExists(backupPath)) {
          await fs.remove(backupPath);
        }
      } catch (error) {
        errors.push(`Failed to remove backup file ${backupPath}: ${error instanceof Error ? error.message : String(error)}`);
      }
    }
    
    // Remove empty backup directories
    for (const backupDir of this.createdBackupDirs) {
      try {
        await this.removeEmptyBackupDirectory(backupDir);
      } catch (error) {
        errors.push(`Failed to remove backup directory ${backupDir}: ${error instanceof Error ? error.message : String(error)}`);
      }
    }
    
    // Clear the tracking arrays
    this.createdBackupFiles = [];
    this.createdBackupDirs.clear();
    
    if (errors.length > 0) {
      throw new Error(`Backup cleanup completed with errors:\n${errors.join('\n')}`);
    }
  }

  /**
   * Remove a backup directory if it's empty
   */
  private async removeEmptyBackupDirectory(backupDir: string): Promise<void> {
    try {
      // Check if directory exists
      if (!(await fs.pathExists(backupDir))) {
        return;
      }
      
      // Only remove if it's actually a .backups directory for safety
      if (!backupDir.endsWith('.backups')) {
        return;
      }
      
      // Check if directory is empty
      const files = await fs.readdir(backupDir);
      if (files.length === 0) {
        await fs.remove(backupDir);
      }
    } catch (error) {
      // Log error but don't throw - cleanup should be non-critical
      // The error will be caught by the caller and included in the error list
      throw error;
    }
  }
  
  /**
   * Get the list of backup files created during the current pull operation
   */
  getCreatedBackupFiles(): string[] {
    return [...this.createdBackupFiles];
  }
  
  /**
   * Rollback file changes by restoring from backup files
   * Called when pull operation fails after files have been modified
   */
  private async rollbackFileChanges(callbacks?: PullCallbacks): Promise<void> {
    if (this.createdBackupFiles.length === 0) {
      callbacks?.onLog?.('No backup files found - no rollback needed');
      return;
    }
    
    callbacks?.onProgress?.(`Rolling back ${this.createdBackupFiles.length} file changes...`);
    
    const errors: string[] = [];
    let restoredCount = 0;
    
    for (const backupPath of this.createdBackupFiles) {
      try {
        // Extract original file path from backup path
        const backupDir = path.dirname(backupPath);
        const backupFileName = path.basename(backupPath);
        
        // Remove timestamp and .backup extension to get original filename
        const originalFileName = backupFileName.replace(/\.\d{4}-\d{2}-\d{2}T\d{2}-\d{2}-\d{2}-\d{3}Z\.backup$/, '.json');
        const originalFilePath = path.join(path.dirname(backupDir), originalFileName);
        
        if (await fs.pathExists(backupPath)) {
          await fs.copy(backupPath, originalFilePath);
          restoredCount++;
        }
      } catch (error) {
        errors.push(`Failed to restore ${backupPath}: ${error instanceof Error ? error.message : String(error)}`);
      }
    }
    
    if (errors.length > 0) {
      throw new Error(`Rollback completed with ${errors.length} errors (${restoredCount} files restored):\n${errors.join('\n')}`);
    }
    
    callbacks?.onSuccess?.(`Successfully rolled back ${restoredCount} file changes`);
  }
  
  private async processIndividualRecords(
    records: BaseEntity[],
    options: PullOptions,
    targetDir: string,
    entityConfig: EntityConfig,
    entityInfo: EntityInfo,
    callbacks?: PullCallbacks
  ): Promise<{ processed: number; updated: number; created: number; skipped: number }> {
    let processed = 0;
    let updated = 0;
    let created = 0;
    let skipped = 0;
    
    // Find existing files
    const filePattern = entityConfig.pull?.filePattern || entityConfig.filePattern || '*.json';
    const existingFiles = await this.findExistingFiles(targetDir, filePattern);
    
    if (options.verbose) {
      callbacks?.onLog?.(`Found ${existingFiles.length} existing files matching pattern '${filePattern}'`);
      existingFiles.forEach(f => callbacks?.onLog?.(`  - ${path.basename(f)}`));
    }
    
    // Load existing records and build lookup map
    const existingRecordsMap = await this.loadExistingRecords(existingFiles, entityInfo);
    
    if (options.verbose) {
      callbacks?.onLog?.(`Loaded ${existingRecordsMap.size} existing records from files`);
    }
    
    // Separate records into new and existing
    const newRecords: Array<{ record: BaseEntity; primaryKey: Record<string, any> }> = [];
    const existingRecordsToUpdate: Array<{ record: BaseEntity; primaryKey: Record<string, any>; filePath: string }> = [];
    
    for (const record of records) {
      // Build primary key
      const primaryKey: Record<string, any> = {};
      for (const pk of entityInfo.PrimaryKeys) {
        primaryKey[pk.Name] = (record as any)[pk.Name];
      }
      
      // Create lookup key
      const lookupKey = this.createPrimaryKeyLookup(primaryKey);
      const existingFileInfo = existingRecordsMap.get(lookupKey);
      
      if (existingFileInfo) {
        // Record exists locally
        if (entityConfig.pull?.updateExistingRecords !== false) {
          existingRecordsToUpdate.push({ record, primaryKey, filePath: existingFileInfo.filePath });
        } else {
          skipped++;
          if (options.verbose) {
            callbacks?.onLog?.(`Skipping existing record: ${lookupKey}`);
          }
        }
      } else {
        // Record doesn't exist locally
        if (entityConfig.pull?.createNewFileIfNotFound !== false) {
          newRecords.push({ record, primaryKey });
        } else {
          skipped++;
          if (options.verbose) {
            callbacks?.onLog?.(`Skipping new record (createNewFileIfNotFound=false): ${lookupKey}`);
          }
        }
      }
    }
    
    // Track which files have been backed up to avoid duplicates
    const backedUpFiles = new Set<string>();
    const errors: string[] = [];
    
    // Process existing records updates in parallel
    if (existingRecordsToUpdate.length > 0) {
      callbacks?.onProgress?.(`Updating existing records (parallel processing)`);
      
      const updatePromises = existingRecordsToUpdate.map(async ({ record, primaryKey, filePath }, index) => {
        try {
          // Create backup if configured (only once per file)
          if (entityConfig.pull?.backupBeforeUpdate && !backedUpFiles.has(filePath)) {
            await this.createBackup(filePath, entityConfig.pull?.backupDirectory);
            backedUpFiles.add(filePath);
          }
          
          // Load existing file data
          const existingData = await fs.readJson(filePath);
          
          // Find the specific existing record that matches this primary key
          let existingRecordData: RecordData;
          if (Array.isArray(existingData)) {
            // Find the matching record in the array
            const matchingRecord = existingData.find(r => 
              this.createPrimaryKeyLookup(r.primaryKey || {}) === this.createPrimaryKeyLookup(primaryKey)
            );
            existingRecordData = matchingRecord || existingData[0]; // Fallback to first if not found
          } else {
            existingRecordData = existingData;
          }
          
          // Process the new record data (isNewRecord = false for updates)
          const newRecordData = await this.recordProcessor.processRecord(
            record, 
            primaryKey, 
            targetDir, 
            entityConfig, 
            options.verbose, 
            false, 
            existingRecordData
          );
          
          // Apply merge strategy
          const mergedData = await this.mergeRecords(
            existingRecordData,
            newRecordData,
            entityConfig.pull?.mergeStrategy || 'merge',
            entityConfig.pull?.preserveFields || []
          );
          
          // Queue updated data for batched write
          if (Array.isArray(existingData)) {
            // Queue array update - batch will handle merging
            const primaryKeyLookup = this.createPrimaryKeyLookup(primaryKey);
            this.fileWriteBatch.queueArrayUpdate(filePath, mergedData, primaryKeyLookup);
          } else {
            // Queue single record update
            this.fileWriteBatch.queueSingleUpdate(filePath, mergedData);
          }
          
          if (options.verbose) {
            callbacks?.onLog?.(`Updated: ${filePath}`);
          }
          
          return { success: true, index };
        } catch (error) {
          const errorMessage = `Failed to update record ${index + 1}: ${(error as any).message || error}`;
          errors.push(errorMessage);
          callbacks?.onWarn?.(errorMessage);
          return { success: false, index };
        }
      });
      
      const updateResults = await Promise.all(updatePromises);
      updated = updateResults.filter(r => r.success).length;
      processed += updated;
      
      if (options.verbose) {
        callbacks?.onSuccess?.(`Completed ${updated}/${existingRecordsToUpdate.length} record updates`);
      }
    }
    
    // Process new records in parallel
    if (newRecords.length > 0) {
      callbacks?.onProgress?.(`Creating new records (parallel processing)`);
      
      if (entityConfig.pull?.appendRecordsToExistingFile && entityConfig.pull?.newFileName) {
        // Append all new records to a single file using parallel processing
        const fileName = entityConfig.pull.newFileName.endsWith('.json') 
          ? entityConfig.pull.newFileName 
          : `${entityConfig.pull.newFileName}.json`;
        const filePath = path.join(targetDir, fileName);
        
        // Process all new records in parallel
        const newRecordPromises = newRecords.map(async ({ record, primaryKey }, index) => {
          try {
            // For new records, pass isNewRecord = true (default)
            const recordData = await this.recordProcessor.processRecord(
              record, 
              primaryKey, 
              targetDir, 
              entityConfig, 
              options.verbose, 
              true
            );
            
            // Use queueArrayUpdate to append the new record without overwriting existing updates
            // For new records, we can use a special lookup key since they don't exist yet
            const newRecordLookup = this.createPrimaryKeyLookup(primaryKey);
            this.fileWriteBatch.queueArrayUpdate(filePath, recordData, newRecordLookup);
            
            return { success: true, index };
          } catch (error) {
            const errorMessage = `Failed to process new record ${index + 1}: ${(error as any).message || error}`;
            errors.push(errorMessage);
            callbacks?.onWarn?.(errorMessage);
            return { success: false, index };
          }
        });
        
        const newRecordResults = await Promise.all(newRecordPromises);
        created = newRecordResults.filter(r => r.success).length;
        processed += created;
        
        if (options.verbose) {
          callbacks?.onLog?.(`Queued ${created} new records for: ${filePath}`);
        }
      } else {
        // Create individual files for each new record in parallel
        const individualRecordPromises = newRecords.map(async ({ record, primaryKey }, index) => {
          try {
            await this.processRecord(record, primaryKey, targetDir, entityConfig, options.verbose);
            return { success: true, index };
          } catch (error) {
            const errorMessage = `Failed to process new record ${index + 1}: ${(error as any).message || error}`;
            errors.push(errorMessage);
            callbacks?.onWarn?.(errorMessage);
            return { success: false, index };
          }
        });
        
        const individualResults = await Promise.all(individualRecordPromises);
        created = individualResults.filter(r => r.success).length;
        processed += created;
        
        if (options.verbose) {
          callbacks?.onSuccess?.(`Created ${created}/${newRecords.length} individual record files`);
        }
      }
    }
    
    // If there were errors during parallel processing, throw them
    if (errors.length > 0) {
      throw new Error(`Parallel processing completed with ${errors.length} errors:\n${errors.join('\n')}`);
    }
    
    return { processed, updated, created, skipped };
  }
  
  private async processRecord(
    record: BaseEntity, 
    primaryKey: Record<string, any>,
    targetDir: string, 
    entityConfig: EntityConfig,
    verbose?: boolean
  ): Promise<void> {
    const recordData = await this.recordProcessor.processRecord(
      record, 
      primaryKey, 
      targetDir, 
      entityConfig, 
      verbose, 
      true
    );
    
    // Determine file path
    const fileName = this.buildFileName(primaryKey, entityConfig);
    const filePath = path.join(targetDir, fileName);
    
    // Queue JSON file for batched write with controlled property order
    this.fileWriteBatch.queueWrite(filePath, recordData);
  }

  



  private async findEntityDirectories(entityName: string): Promise<string[]> {
    const dirs: string[] = [];
    
    // Search for directories with matching entity config
    const searchDirs = async (dir: string) => {
      const entries = await fs.readdir(dir, { withFileTypes: true });
      
      for (const entry of entries) {
        if (entry.isDirectory()) {
          const fullPath = path.join(dir, entry.name);
          const config = await loadEntityConfig(fullPath);
          
          if (config && config.entity === entityName) {
            dirs.push(fullPath);
          } else {
            // Recurse
            await searchDirs(fullPath);
          }
        }
      }
    };
    
    await searchDirs(configManager.getOriginalCwd());
    return dirs;
  }
  
  private buildFileName(primaryKey: Record<string, any>, _entityConfig: EntityConfig): string {
    // Use primary key values to build filename
    const keys = Object.values(primaryKey);
    
    if (keys.length === 1 && typeof keys[0] === 'string') {
      // Single string key - use as base if it's a guid
      const key = keys[0];
      if (key.match(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i)) {
        // It's a GUID, use first 8 chars, prefixed with dot, lowercase
        return `.${key.substring(0, 8).toLowerCase()}.json`;
      }
      // Use the whole key if not too long, prefixed with dot
      if (key.length <= 50) {
        return `.${key.replace(/[^a-zA-Z0-9\-_]/g, '').toLowerCase()}.json`;
      }
    }
    
    // Multiple keys or numeric - create composite name, prefixed with dot
    return '.' + keys.map(k => String(k).replace(/[^a-zA-Z0-9\-_]/g, '').toLowerCase()).join('-') + '.json';
  }
  
  private async findExistingFiles(dir: string, pattern: string): Promise<string[]> {
    const files: string[] = [];

    try {
      const entries = await fs.readdir(dir, { withFileTypes: true });

      for (const entry of entries) {
        if (entry.isFile()) {
          const fileName = entry.name;

          // Normalize pattern by removing leading **/ (glob recursion prefix)
          const normalizedPattern = pattern.startsWith('**/') ? pattern.substring(3) : pattern;

          // Simple pattern matching
          if (normalizedPattern === '*.json' && fileName.endsWith('.json')) {
            files.push(path.join(dir, fileName));
          } else if (normalizedPattern === '.*.json' && fileName.startsWith('.') && fileName.endsWith('.json')) {
            files.push(path.join(dir, fileName));
          } else if (normalizedPattern === fileName) {
            files.push(path.join(dir, fileName));
          }
        }
      }
    } catch (error) {
      // Directory might not exist yet
      if ((error as any).code !== 'ENOENT') {
        throw error;
      }
    }

    return files;
  }
  
  private async loadExistingRecords(
    files: string[], 
    _entityInfo: EntityInfo
  ): Promise<Map<string, { filePath: string; recordData: RecordData }>> {
    const recordsMap = new Map<string, { filePath: string; recordData: RecordData }>();
    
    for (const filePath of files) {
      try {
        const fileData = await fs.readJson(filePath);
        const records = Array.isArray(fileData) ? fileData : [fileData];
        
        for (const record of records) {
          if (record.primaryKey) {
            const lookupKey = this.createPrimaryKeyLookup(record.primaryKey);
            recordsMap.set(lookupKey, { filePath, recordData: record });
          }
        }
      } catch (error) {
        // Skip files that can't be parsed
      }
    }
    
    return recordsMap;
  }
  
  private createPrimaryKeyLookup(primaryKey: Record<string, any>): string {
    const keys = Object.keys(primaryKey).sort();
    return keys.map(k => `${k}:${primaryKey[k]}`).join('|');
  }
  
  private async mergeRecords(
    existing: RecordData,
    newData: RecordData,
    strategy: 'overwrite' | 'merge' | 'skip',
    preserveFields: string[]
  ): Promise<RecordData> {
    if (strategy === 'skip') {
      return existing;
    }

    if (strategy === 'overwrite') {
      // Create result with correct property order: fields, relatedEntities, primaryKey, sync
      const result: RecordData = {
        fields: { ...newData.fields }
      } as RecordData;

      // Restore preserved fields from existing
      if (preserveFields.length > 0 && existing.fields) {
        for (const field of preserveFields) {
          if (field in existing.fields) {
            result.fields[field] = existing.fields[field];
          }
        }
      }

      // Add relatedEntities before primaryKey and sync
      if (newData.relatedEntities) {
        result.relatedEntities = newData.relatedEntities;
      }

      result.primaryKey = newData.primaryKey;
      result.sync = newData.sync;

      return result;
    }

    // Default 'merge' strategy - create with correct property order
    const result: RecordData = {
      fields: { ...existing.fields, ...newData.fields }
    } as RecordData;

    // Restore preserved fields
    if (preserveFields.length > 0 && existing.fields) {
      for (const field of preserveFields) {
        if (field in existing.fields) {
          result.fields[field] = existing.fields[field];
        }
      }
    }

    // Add relatedEntities before primaryKey and sync
    if (existing.relatedEntities || newData.relatedEntities) {
      result.relatedEntities = {
        ...existing.relatedEntities,
        ...newData.relatedEntities
      };
    }

    result.primaryKey = newData.primaryKey || existing.primaryKey;
    result.sync = newData.sync;

    return result;
  }
  
  private async createBackup(filePath: string, backupDirName?: string): Promise<void> {
    const dir = path.dirname(filePath);
    const fileName = path.basename(filePath);
    const backupDir = path.join(dir, backupDirName || '.backups');
    
    // Ensure backup directory exists
    await fs.ensureDir(backupDir);
    // Track the backup directory for cleanup
    this.createdBackupDirs.add(backupDir);
    
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    // Remove .json extension, add timestamp, then add .backup extension
    const backupFileName = fileName.replace(/\.json$/, `.${timestamp}.backup`);
    const backupPath = path.join(backupDir, backupFileName);
    
    try {
      await fs.copy(filePath, backupPath);
      // Track the created backup file for cleanup
      this.createdBackupFiles.push(backupPath);
    } catch (error) {
      // Log error but don't throw
    }
  }
}