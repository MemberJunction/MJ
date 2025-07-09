import fs from 'fs-extra';
import path from 'path';
import { RunView, Metadata, EntityInfo, UserInfo } from '@memberjunction/core';
import { SyncEngine, RecordData } from '../lib/sync-engine';
import { loadEntityConfig, RelatedEntityConfig } from '../config';
import { configManager } from '../lib/config-manager';
import { JsonWriteHelper } from '../lib/json-write-helper';
import { FileWriteBatch } from '../lib/file-write-batch';

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
  
  constructor(syncEngine: SyncEngine, contextUser: UserInfo) {
    this.syncEngine = syncEngine;
    this.contextUser = contextUser;
    this.fileWriteBatch = new FileWriteBatch();
  }
  
  async pull(options: PullOptions, callbacks?: PullCallbacks): Promise<PullResult> {
    // Clear any previous batch operations
    this.fileWriteBatch.clear();
    
    let targetDir: string;
    let entityConfig: any;
    
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
    if (options.verbose && entityConfig.pull?.appendRecordsToExistingFile && entityConfig.pull?.newFileName) {
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
    } else if (entityConfig.pull?.filter) {
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
    
    // Check if we need to wait for async property loading
    if (entityConfig.pull?.externalizeFields && result.Results.length > 0) {
      await this.handleAsyncPropertyLoading(options.entity, entityConfig, options.verbose, callbacks);
    }
    
    // Process records
    const pullResult = await this.processRecords(
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
    
    return {
      ...pullResult,
      targetDir
    };
  }
  
  private async handleAsyncPropertyLoading(
    entityName: string,
    entityConfig: any,
    verbose?: boolean,
    callbacks?: PullCallbacks
  ): Promise<void> {
    const metadata = new Metadata();
    const entityInfo = metadata.EntityByName(entityName);
    
    if (!entityInfo) return;
    
    const externalizeConfig = entityConfig.pull.externalizeFields;
    let fieldsToExternalize: string[] = [];
    
    if (Array.isArray(externalizeConfig)) {
      if (externalizeConfig.length > 0 && typeof externalizeConfig[0] === 'string') {
        fieldsToExternalize = externalizeConfig as string[];
      } else {
        fieldsToExternalize = (externalizeConfig as Array<{field: string; pattern: string}>)
          .map(item => item.field);
      }
    } else {
      fieldsToExternalize = Object.keys(externalizeConfig);
    }
    
    // Get all field names from entity metadata
    const metadataFieldNames = entityInfo.Fields.map(f => f.Name);
    
    // Check if any externalized fields are NOT in metadata (likely computed properties)
    const computedFields = fieldsToExternalize.filter(f => !metadataFieldNames.includes(f));
    
    if (computedFields.length > 0) {
      if (verbose) {
        callbacks?.onProgress?.(`Waiting 5 seconds for async property loading in ${entityName} (${computedFields.join(', ')})...`);
      }
      await new Promise(resolve => setTimeout(resolve, 5000));
      if (verbose) {
        callbacks?.onSuccess?.('Async property loading wait complete');
      }
    }
  }
  
  private async processRecords(
    records: any[],
    options: PullOptions,
    targetDir: string,
    entityConfig: any,
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
      
      for (const record of records) {
        try {
          // Build primary key
          const primaryKey: Record<string, any> = {};
          for (const pk of entityInfo.PrimaryKeys) {
            primaryKey[pk.Name] = record[pk.Name];
          }
          
          // Process record for multi-file
          const recordData = await this.processRecordData(
            record, 
            primaryKey, 
            targetDir, 
            entityConfig, 
            options.verbose, 
            true
          );
          allRecords.push(recordData);
          processed++;
          
          if (options.verbose) {
            callbacks?.onProgress?.(`Processing records (${processed}/${records.length})`);
          }
        } catch (error) {
          callbacks?.onWarn?.(`Failed to process record: ${(error as any).message || error}`);
        }
      }
      
      // Queue all records to single file for batched write
      if (allRecords.length > 0) {
        const fileName = options.multiFile.endsWith('.json') ? options.multiFile : `${options.multiFile}.json`;
        const filePath = path.join(targetDir, fileName);
        this.fileWriteBatch.queueWrite(filePath, allRecords);
        callbacks?.onSuccess?.(`Queued ${processed} records for ${path.basename(filePath)}`);
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
  
  private async processIndividualRecords(
    records: any[],
    options: PullOptions,
    targetDir: string,
    entityConfig: any,
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
    const newRecords: Array<{ record: any; primaryKey: Record<string, any> }> = [];
    const existingRecordsToUpdate: Array<{ record: any; primaryKey: Record<string, any>; filePath: string }> = [];
    
    for (const record of records) {
      // Build primary key
      const primaryKey: Record<string, any> = {};
      for (const pk of entityInfo.PrimaryKeys) {
        primaryKey[pk.Name] = record[pk.Name];
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
    
    // Process existing records updates
    for (const { record, primaryKey, filePath } of existingRecordsToUpdate) {
      try {
        callbacks?.onProgress?.(`Updating existing records (${updated + 1}/${existingRecordsToUpdate.length})`);
        
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
        const newRecordData = await this.processRecordData(
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
        
        updated++;
        processed++;
        
        if (options.verbose) {
          callbacks?.onLog?.(`Updated: ${filePath}`);
        }
      } catch (error) {
        callbacks?.onWarn?.(`Failed to update record: ${(error as any).message || error}`);
      }
    }
    
    // Process new records
    if (newRecords.length > 0) {
      callbacks?.onProgress?.(`Creating new records (0/${newRecords.length})`);
      
      if (entityConfig.pull?.appendRecordsToExistingFile && entityConfig.pull?.newFileName) {
        // Append all new records to a single file using individual array updates to preserve existing updates
        const fileName = entityConfig.pull.newFileName.endsWith('.json') 
          ? entityConfig.pull.newFileName 
          : `${entityConfig.pull.newFileName}.json`;
        const filePath = path.join(targetDir, fileName);
        
        // Process and append all new records using queueArrayUpdate to preserve existing changes
        for (const { record, primaryKey } of newRecords) {
          try {
            // For new records, pass isNewRecord = true (default)
            const recordData = await this.processRecordData(
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
            
            created++;
            processed++;
            
            if (options.verbose) {
              callbacks?.onProgress?.(`Creating new records (${created}/${newRecords.length})`);
            }
          } catch (error) {
            callbacks?.onWarn?.(`Failed to process new record: ${(error as any).message || error}`);
          }
        }
        
        if (options.verbose) {
          callbacks?.onLog?.(`Queued ${created} new records for: ${filePath}`);
        }
      } else {
        // Create individual files for each new record
        for (const { record, primaryKey } of newRecords) {
          try {
            await this.processRecord(record, primaryKey, targetDir, entityConfig, options.verbose);
            created++;
            processed++;
            
            if (options.verbose) {
              callbacks?.onProgress?.(`Creating new records (${created}/${newRecords.length})`);
            }
          } catch (error) {
            callbacks?.onWarn?.(`Failed to process new record: ${(error as any).message || error}`);
          }
        }
      }
    }
    
    return { processed, updated, created, skipped };
  }
  
  private async processRecord(
    record: any, 
    primaryKey: Record<string, any>,
    targetDir: string, 
    entityConfig: any,
    verbose?: boolean
  ): Promise<void> {
    const recordData = await this.processRecordData(record, primaryKey, targetDir, entityConfig, verbose, true);
    
    // Determine file path
    const fileName = this.buildFileName(primaryKey, entityConfig);
    const filePath = path.join(targetDir, fileName);
    
    // Queue JSON file for batched write with controlled property order
    this.fileWriteBatch.queueWrite(filePath, recordData);
  }

  
  private async processRecordData(
    record: any, 
    primaryKey: Record<string, any>,
    targetDir: string, 
    entityConfig: any,
    verbose?: boolean,
    isNewRecord: boolean = true,
    existingRecordData?: RecordData,
    currentDepth: number = 0,
    ancestryPath: Set<string> = new Set()
  ): Promise<RecordData> {
    
    // Build record data
    const fields: Record<string, any> = {};
    const relatedEntities: Record<string, RecordData[]> = {};
    
    // Get the underlying data from the entity object
    let dataToProcess = record;
    if (typeof record.GetAll === 'function') {
      dataToProcess = record.GetAll();
    }
    
    // Get entity metadata to check for virtual fields
    const entityInfo = this.syncEngine.getEntityInfo(entityConfig.entity);
    
    // Process fields with proper lookupFields conversion
    for (const [fieldName, fieldValue] of Object.entries(dataToProcess)) {
      // Skip primary key fields
      if (primaryKey[fieldName] !== undefined) {
        continue;
      }
      
      // Skip internal fields
      if (fieldName.startsWith('__mj_')) {
        continue;
      }
      
      // Skip excluded fields
      if (entityConfig.pull?.excludeFields?.includes(fieldName)) {
        continue;
      }
      
      // Skip virtual fields if ignoreVirtualFields is enabled (fields that exist only in the view, not in the underlying table)
      if (entityConfig.pull?.ignoreVirtualFields && entityInfo) {
        const fieldInfo = entityInfo.Fields.find(f => f.Name === fieldName);
        if (fieldInfo && fieldInfo.IsVirtual) {
          if (verbose) {
            console.log(`Skipping virtual field: ${fieldName} for entity ${entityConfig.entity}`);
          }
          continue;
        }
      }
      
      // Skip null fields if ignoreNullFields is enabled
      if (entityConfig.pull?.ignoreNullFields && fieldValue === null) {
        continue;
      }
      
      // Process lookupFields - convert GUIDs to @lookup syntax
      let processedValue = fieldValue;
      if (entityConfig.pull?.lookupFields?.[fieldName] && fieldValue != null) {
        try {
          processedValue = await this.convertGuidToLookup(
            String(fieldValue), 
            entityConfig.pull.lookupFields[fieldName],
            verbose
          );
        } catch (error) {
          if (verbose) {
            console.warn(`Failed to convert ${fieldName} to lookup: ${error}`);
          }
          // Keep original value if lookup fails
          processedValue = fieldValue;
        }
      }
      
      // Trim string values to remove leading/trailing whitespace
      if (typeof processedValue === 'string') {
        processedValue = processedValue.trim();
      }
      
      // Handle field externalization if configured
      if (entityConfig.pull?.externalizeFields && processedValue != null) {
        const externalizeConfig = entityConfig.pull.externalizeFields;
        let externalizePattern: string | null = null;
        
        // Check if this field should be externalized
        if (Array.isArray(externalizeConfig)) {
          if (externalizeConfig.length > 0 && typeof externalizeConfig[0] === 'string') {
            // Simple string array format
            if (externalizeConfig.includes(fieldName)) {
              externalizePattern = `@file:{Name}.${fieldName.toLowerCase()}.md`;
            }
          } else {
            // Array of objects format
            const fieldConfig = externalizeConfig.find(config => config.field === fieldName);
            if (fieldConfig) {
              externalizePattern = fieldConfig.pattern;
            }
          }
        } else {
          // Object format
          const fieldConfig = externalizeConfig[fieldName];
          if (fieldConfig) {
            const extension = fieldConfig.extension || '.md';
            externalizePattern = `@file:{Name}.${fieldName.toLowerCase()}${extension}`;
          }
        }
        
        if (externalizePattern) {
          try {
            // Check if we have existing data with @file: reference for merge strategy
            const existingFileReference = existingRecordData?.fields?.[fieldName];
            
            const externalizedValue = await this.externalizeField(
              fieldName,
              processedValue,
              externalizePattern,
              dataToProcess,
              targetDir,
              existingFileReference,
              entityConfig.pull?.mergeStrategy || 'merge',
              verbose
            );
            processedValue = externalizedValue;
            
            if (verbose) {
              console.log(`Externalized field ${fieldName} to file`);  
            }
          } catch (error) {
            if (verbose) {
              console.warn(`Failed to externalize field ${fieldName}: ${error}`);
            }
            // Keep original value if externalization fails
          }
        }
      }
      
      fields[fieldName] = processedValue;
    }
    
    // Process related entities if configured
    if (entityConfig.pull?.relatedEntities) {
      for (const [relationKey, relationConfig] of Object.entries(entityConfig.pull.relatedEntities)) {
        try {
          const relatedRecords = await this.loadRelatedEntities(
            record,
            relationConfig as any,
            entityConfig,
            existingRecordData?.relatedEntities?.[relationKey] || [],
            currentDepth + 1,
            ancestryPath,
            verbose
          );
          if (relatedRecords.length > 0) {
            relatedEntities[relationKey] = relatedRecords;
          }
        } catch (error) {
          if (verbose) {
            console.warn(`Failed to load related entities for ${relationKey}: ${error}`);
          }
        }
      }
    }
    
    // Calculate checksum - include external file content if there are externalized fields
    let checksum: string;
    const hasExternalizedFields = entityConfig.pull?.externalizeFields && 
      Object.values(fields).some(value => typeof value === 'string' && value.startsWith('@file:'));
    
    if (hasExternalizedFields) {
      // Use checksum calculation that resolves @file references
      checksum = await this.syncEngine.calculateChecksumWithFileContent(fields, targetDir);
      if (verbose) {
        console.log(`Calculated checksum including external file content for record`);
      }
    } else {
      // Use standard checksum calculation
      checksum = this.syncEngine.calculateChecksum(fields);
    }
    
    // Determine if data has actually changed by comparing checksums
    let finalSyncData: { lastModified: string; checksum: string };
    
    if (existingRecordData?.sync?.checksum === checksum) {
      // No change detected - preserve existing sync metadata
      finalSyncData = {
        lastModified: existingRecordData.sync.lastModified,
        checksum: checksum
      };
      if (verbose) {
        console.log(`No changes detected for record, preserving existing timestamp`);
      }
    } else {
      // Change detected - update timestamp
      finalSyncData = {
        lastModified: new Date().toISOString(),
        checksum: checksum
      };
      if (verbose && existingRecordData?.sync?.checksum) {
        console.log(`Changes detected for record, updating timestamp`);
      }
    }
    
    // Build the final record data with explicit property order control
    const recordData = JsonWriteHelper.createOrderedRecordData(
      fields,
      relatedEntities,
      primaryKey,
      finalSyncData
    );
    
    return recordData;
  }
  

  /**
   * Convert a GUID value to @lookup syntax by looking up the human-readable value
   */
  private async convertGuidToLookup(
    guidValue: string,
    lookupConfig: { entity: string; field: string },
    verbose?: boolean
  ): Promise<string> {
    if (!guidValue || typeof guidValue !== 'string') {
      return guidValue;
    }

    try {
      // Use RunView to find the record with this GUID
      const rv = new RunView();
      const result = await rv.RunView({
        EntityName: lookupConfig.entity,
        ExtraFilter: `ID = '${guidValue}'`,
        ResultType: 'entity_object'
      }, this.contextUser);

      if (result.Success && result.Results && result.Results.length > 0) {
        const targetRecord = result.Results[0];
        const lookupValue = targetRecord[lookupConfig.field];
        
        if (lookupValue != null) {
          return `@lookup:${lookupConfig.entity}.${lookupConfig.field}=${lookupValue}`;
        }
      }

      if (verbose) {
        console.warn(`Lookup failed for ${guidValue} in ${lookupConfig.entity}.${lookupConfig.field}`);
      }
      
      // Return original GUID if lookup fails
      return guidValue;
    } catch (error) {
      if (verbose) {
        console.warn(`Error during lookup conversion: ${error}`);
      }
      return guidValue;
    }
  }

  /**
   * Externalize a field value to a separate file and return @file: reference
   */
  private async externalizeField(
    fieldName: string,
    fieldValue: any,
    pattern: string,
    recordData: any,
    targetDir: string,
    existingFileReference?: string,
    mergeStrategy: string = 'merge',
    verbose?: boolean
  ): Promise<string> {
    const fs = await import('fs-extra');
    const path = await import('path');
    
    let finalFilePath: string;
    let fileReference: string;
    
    // Check if we should use existing file reference (for merge strategy)
    if (mergeStrategy === 'merge' && existingFileReference && typeof existingFileReference === 'string' && existingFileReference.startsWith('@file:')) {
      // Use existing file reference
      const existingPath = existingFileReference.substring(6); // Remove @file: prefix
      finalFilePath = path.resolve(targetDir, existingPath);
      fileReference = existingFileReference;
      
      if (verbose) {
        console.log(`Using existing external file: ${finalFilePath}`);
      }
    } else {
      // Create new file using pattern
      let processedPattern = pattern;
      
      // Replace common placeholders
      if (recordData.Name) {
        const sanitizedName = this.sanitizeForFilename(recordData.Name);
        processedPattern = processedPattern.replace(/\{Name\}/g, sanitizedName);
      }
      
      if (recordData.ID) {
        processedPattern = processedPattern.replace(/\{ID\}/g, recordData.ID);
      }
      
      processedPattern = processedPattern.replace(/\{FieldName\}/g, fieldName);
      
      // Replace any other field placeholders
      for (const [key, value] of Object.entries(recordData)) {
        if (value != null) {
          const sanitizedValue = this.sanitizeForFilename(String(value));
          processedPattern = processedPattern.replace(new RegExp(`\\{${key}\\}`, 'g'), sanitizedValue);
        }
      }
      
      // Remove @file: prefix if present
      if (processedPattern.startsWith('@file:')) {
        processedPattern = processedPattern.substring(6);
      }
      
      finalFilePath = path.resolve(targetDir, processedPattern);
      fileReference = `@file:${processedPattern}`;
      
      if (verbose) {
        console.log(`Creating new external file: ${finalFilePath}`);
      }
    }
    
    // Check if file already exists and compare content
    let shouldWriteFile = true;
    if (await fs.pathExists(finalFilePath)) {
      try {
        const existingContent = await fs.readFile(finalFilePath, 'utf8');
        
        // Prepare the new content
        let contentToWrite = String(fieldValue);
        
        // If the value looks like JSON, try to pretty-print it
        if (fieldName.toLowerCase().includes('json') || fieldName.toLowerCase().includes('example')) {
          try {
            const parsed = JSON.parse(contentToWrite);
            contentToWrite = JSON.stringify(parsed, null, 2);
          } catch {
            // Not valid JSON, use as-is
          }
        }
        
        // Only write if content has changed
        shouldWriteFile = existingContent !== contentToWrite;
        
        if (verbose && !shouldWriteFile) {
          console.log(`External file ${finalFilePath} unchanged, skipping write`);
        }
      } catch (error) {
        if (verbose) {
          console.warn(`Error reading existing file ${finalFilePath}: ${error}`);
        }
        shouldWriteFile = true; // Write if we can't read existing file
      }
    }
    
    if (shouldWriteFile) {
      // Ensure the directory exists
      await fs.ensureDir(path.dirname(finalFilePath));
      
      // Write the field value to the file
      let contentToWrite = String(fieldValue);
      
      // If the value looks like JSON, try to pretty-print it
      if (fieldName.toLowerCase().includes('json') || fieldName.toLowerCase().includes('example')) {
        try {
          const parsed = JSON.parse(contentToWrite);
          contentToWrite = JSON.stringify(parsed, null, 2);
        } catch {
          // Not valid JSON, use as-is
        }
      }
      
      await fs.writeFile(finalFilePath, contentToWrite, 'utf8');
      
      if (verbose) {
        console.log(`Wrote externalized field ${fieldName} to ${finalFilePath}`);
      }
    }
    
    // Return the @file: reference
    return fileReference;
  }
  
  /**
   * Sanitize a string for use in filenames
   */
  private sanitizeForFilename(input: string): string {
    return input
      .toLowerCase()
      .replace(/\s+/g, '-') // Replace spaces with hyphens
      .replace(/[^a-z0-9.-]/g, '') // Remove special characters except dots and hyphens
      .replace(/--+/g, '-') // Replace multiple hyphens with single hyphen
      .replace(/^-+|-+$/g, ''); // Remove leading/trailing hyphens
  }

  /**
   * Load related entities for a record
   */
  private async loadRelatedEntities(
    parentRecord: any,
    relationConfig: RelatedEntityConfig,
    parentEntityConfig: any,
    existingRelatedEntities: RecordData[],
    currentDepth: number,
    ancestryPath: Set<string>,
    verbose?: boolean
  ): Promise<RecordData[]> {
    try {
      // Get the parent record's primary key value
      const parentPrimaryKey = this.getRecordPrimaryKey(parentRecord);
      if (!parentPrimaryKey) {
        if (verbose) {
          console.warn(`Unable to determine primary key for parent record to load related entities`);
        }
        return [];
      }

      // Build the filter for the related entity query
      let filter = `${relationConfig.foreignKey} = '${parentPrimaryKey}'`;
      if (relationConfig.filter) {
        filter += ` AND (${relationConfig.filter})`;
      }

      if (verbose) {
        console.log(`Loading related entities: ${relationConfig.entity} with filter: ${filter}`);
      }

      // Query for related entities
      const rv = new RunView();
      const result = await rv.RunView({
        EntityName: relationConfig.entity,
        ExtraFilter: filter,
        ResultType: 'entity_object'
      }, this.contextUser);

      if (!result.Success) {
        if (verbose) {
          console.warn(`Failed to load related entities ${relationConfig.entity}: ${result.ErrorMessage}`);
        }
        return [];
      }

      if (verbose) {
        console.log(`Found ${result.Results.length} related records for ${relationConfig.entity}`);
      }

      // Create a mock entity config for the related entity processing
      // Inherit ignoreVirtualFields and ignoreNullFields from parent entity config
      const relatedEntityConfig = {
        entity: relationConfig.entity,
        pull: {
          excludeFields: relationConfig.excludeFields || [],
          lookupFields: relationConfig.lookupFields || {},
          externalizeFields: relationConfig.externalizeFields || [],
          relatedEntities: relationConfig.relatedEntities || {},
          ignoreVirtualFields: parentEntityConfig.pull?.ignoreVirtualFields || false,
          ignoreNullFields: parentEntityConfig.pull?.ignoreNullFields || false
        }
      };

      // Build a map of database records by primary key for efficient lookup
      const dbRecordMap = new Map<string, any>();
      for (const relatedRecord of result.Results) {
        const relatedPrimaryKey = this.getRecordPrimaryKey(relatedRecord);
        if (relatedPrimaryKey) {
          dbRecordMap.set(relatedPrimaryKey, relatedRecord);
        }
      }

      // Process existing related entities first (preserving their order)
      const processedIds = new Set<string>();
      const relatedRecords: RecordData[] = [];

      for (const existingRelatedEntity of existingRelatedEntities) {
        const existingPrimaryKey = existingRelatedEntity.primaryKey?.ID;
        if (!existingPrimaryKey) {
          if (verbose) {
            console.warn(`Existing related entity missing primary key, skipping`);
          }
          continue;
        }

        // Check if this record still exists in the database
        const dbRecord = dbRecordMap.get(existingPrimaryKey);
        if (!dbRecord) {
          if (verbose) {
            console.log(`Related entity ${existingPrimaryKey} no longer exists in database, removing from results`);
          }
          continue; // Skip deleted records
        }

        // Build primary key for this record
        const relatedRecordPrimaryKey: Record<string, any> = {};
        for (const pk of this.syncEngine.getEntityInfo(relationConfig.entity)?.PrimaryKeys || []) {
          if (pk.Name === 'ID') {
            relatedRecordPrimaryKey[pk.Name] = existingPrimaryKey;
          } else {
            // For compound keys, get the value from the related record
            relatedRecordPrimaryKey[pk.Name] = this.getFieldValue(dbRecord, pk.Name);
          }
        }

        // Replace the foreign key field with @parent:ID syntax BEFORE processing
        // This ensures the checksum calculation includes the @parent:ID value, not the GUID
        if (typeof dbRecord.GetAll === 'function') {
          const data = dbRecord.GetAll();
          if (data[relationConfig.foreignKey] !== undefined) {
            // Create a temporary modified version for processing
            const modifiedRecord = { ...data };
            modifiedRecord[relationConfig.foreignKey] = '@parent:ID';
            
            // Process the modified record data with existing data for change detection
            const recordData = await this.processRecordData(
              modifiedRecord,
              relatedRecordPrimaryKey,
              '', // targetDir not needed for related entities
              relatedEntityConfig,
              verbose,
              false, // isNewRecord = false for existing records
              existingRelatedEntity, // Pass existing data for change detection
              currentDepth + 1,
              ancestryPath
            );
            
            relatedRecords.push(recordData);
          }
        } else {
          // Handle plain object case
          const modifiedRecord = { ...dbRecord };
          if (modifiedRecord[relationConfig.foreignKey] !== undefined) {
            modifiedRecord[relationConfig.foreignKey] = '@parent:ID';
          }
          
          // Process the related record data with existing data for change detection
          const recordData = await this.processRecordData(
            modifiedRecord,
            relatedRecordPrimaryKey,
            '', // targetDir not needed for related entities
            relatedEntityConfig,
            verbose,
            false, // isNewRecord = false for existing records
            existingRelatedEntity, // Pass existing data for change detection
            currentDepth + 1,
            ancestryPath
          );
          
          relatedRecords.push(recordData);
        }

        processedIds.add(existingPrimaryKey);
      }

      // Process new related entities (append to end)
      for (const relatedRecord of result.Results) {
        const relatedPrimaryKey = this.getRecordPrimaryKey(relatedRecord);
        if (!relatedPrimaryKey || processedIds.has(relatedPrimaryKey)) {
          continue; // Skip already processed records
        }

        // Build primary key for this record
        const relatedRecordPrimaryKey: Record<string, any> = {};
        for (const pk of this.syncEngine.getEntityInfo(relationConfig.entity)?.PrimaryKeys || []) {
          if (pk.Name === 'ID') {
            relatedRecordPrimaryKey[pk.Name] = relatedPrimaryKey;
          } else {
            // For compound keys, get the value from the related record
            relatedRecordPrimaryKey[pk.Name] = this.getFieldValue(relatedRecord, pk.Name);
          }
        }

        // Replace the foreign key field with @parent:ID syntax BEFORE processing
        // This ensures the checksum calculation includes the @parent:ID value, not the GUID
        if (typeof relatedRecord.GetAll === 'function') {
          const data = relatedRecord.GetAll();
          if (data[relationConfig.foreignKey] !== undefined) {
            // Create a temporary modified version for processing
            const modifiedRecord = { ...data };
            modifiedRecord[relationConfig.foreignKey] = '@parent:ID';
            
            // Process the modified record data (no existing data for new records)
            const recordData = await this.processRecordData(
              modifiedRecord,
              relatedRecordPrimaryKey,
              '', // targetDir not needed for related entities
              relatedEntityConfig,
              verbose,
              true, // isNewRecord = true for new records
              undefined, // No existing data for new records
              currentDepth + 1,
              ancestryPath
            );
            
            relatedRecords.push(recordData);
          }
        } else {
          // Handle plain object case
          const modifiedRecord = { ...relatedRecord };
          if (modifiedRecord[relationConfig.foreignKey] !== undefined) {
            modifiedRecord[relationConfig.foreignKey] = '@parent:ID';
          }
          
          // Process the related record data (no existing data for new records)
          const recordData = await this.processRecordData(
            modifiedRecord,
            relatedRecordPrimaryKey,
            '', // targetDir not needed for related entities
            relatedEntityConfig,
            verbose,
            true, // isNewRecord = true for new records
            undefined, // No existing data for new records
            currentDepth + 1,
            ancestryPath
          );
          
          relatedRecords.push(recordData);
        }
        
        processedIds.add(relatedPrimaryKey);
      }

      return relatedRecords;
    } catch (error) {
      if (verbose) {
        console.error(`Error loading related entities for ${relationConfig.entity}: ${error}`);
      }
      return [];
    }
  }

  /**
   * Get the primary key value from a record
   */
  private getRecordPrimaryKey(record: any): string | null {
    if (!record) return null;
    
    // Try to get ID directly
    if (record.ID) return record.ID;
    
    // Try to get from GetAll() method if it's an entity object
    if (typeof record.GetAll === 'function') {
      const data = record.GetAll();
      if (data.ID) return data.ID;
    }
    
    // Try common variations
    if (record.id) return record.id;
    if (record.Id) return record.Id;
    
    return null;
  }

  /**
   * Get a field value from a record, handling both entity objects and plain objects
   */
  private getFieldValue(record: any, fieldName: string): any {
    if (!record) return null;
    
    // Try to get field directly
    if (record[fieldName] !== undefined) return record[fieldName];
    
    // Try to get from GetAll() method if it's an entity object
    if (typeof record.GetAll === 'function') {
      const data = record.GetAll();
      if (data[fieldName] !== undefined) return data[fieldName];
    }
    
    return null;
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
  
  private buildFileName(primaryKey: Record<string, any>, entityConfig: any): string {
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
          
          // Simple pattern matching
          if (pattern === '*.json' && fileName.endsWith('.json')) {
            files.push(path.join(dir, fileName));
          } else if (pattern === '.*.json' && fileName.startsWith('.') && fileName.endsWith('.json')) {
            files.push(path.join(dir, fileName));
          } else if (pattern === fileName) {
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
    entityInfo: EntityInfo
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
      const result: RecordData = {
        fields: { ...newData.fields },
        primaryKey: newData.primaryKey,
        sync: newData.sync
      };
      
      // Restore preserved fields from existing
      if (preserveFields.length > 0 && existing.fields) {
        for (const field of preserveFields) {
          if (field in existing.fields) {
            result.fields[field] = existing.fields[field];
          }
        }
      }
      
      if (newData.relatedEntities) {
        result.relatedEntities = newData.relatedEntities;
      }
      
      return result;
    }
    
    // Default 'merge' strategy
    const result: RecordData = {
      fields: { ...existing.fields, ...newData.fields },
      primaryKey: newData.primaryKey || existing.primaryKey,
      sync: newData.sync
    };
    
    // Restore preserved fields
    if (preserveFields.length > 0 && existing.fields) {
      for (const field of preserveFields) {
        if (field in existing.fields) {
          result.fields[field] = existing.fields[field];
        }
      }
    }
    
    if (existing.relatedEntities || newData.relatedEntities) {
      result.relatedEntities = {
        ...existing.relatedEntities,
        ...newData.relatedEntities
      };
    }
    
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