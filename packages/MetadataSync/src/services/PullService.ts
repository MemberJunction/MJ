import fs from 'fs-extra';
import path from 'path';
import { RunView, Metadata, EntityInfo, UserInfo } from '@memberjunction/core';
import { SyncEngine, RecordData } from '../lib/sync-engine';
import { loadEntityConfig, RelatedEntityConfig } from '../config';
import { configManager } from '../lib/config-manager';

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
  
  constructor(syncEngine: SyncEngine, contextUser: UserInfo) {
    this.syncEngine = syncEngine;
    this.contextUser = contextUser;
  }
  
  async pull(options: PullOptions, callbacks?: PullCallbacks): Promise<PullResult> {
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
      
      // Write all records to single file
      if (allRecords.length > 0) {
        const fileName = options.multiFile.endsWith('.json') ? options.multiFile : `${options.multiFile}.json`;
        const filePath = path.join(targetDir, fileName);
        await fs.writeJson(filePath, allRecords, { spaces: 2 });
        callbacks?.onSuccess?.(`Pulled ${processed} records to ${path.basename(filePath)}`);
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
        
        // Write updated data
        if (Array.isArray(existingData)) {
          // Update the record in the array
          const index = existingData.findIndex(r => 
            this.createPrimaryKeyLookup(r.primaryKey || {}) === this.createPrimaryKeyLookup(primaryKey)
          );
          if (index >= 0) {
            existingData[index] = mergedData;
            await fs.writeJson(filePath, existingData, { spaces: 2 });
          }
        } else {
          await fs.writeJson(filePath, mergedData, { spaces: 2 });
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
        // Append all new records to a single file
        const fileName = entityConfig.pull.newFileName.endsWith('.json') 
          ? entityConfig.pull.newFileName 
          : `${entityConfig.pull.newFileName}.json`;
        const filePath = path.join(targetDir, fileName);
        
        // Load existing file if it exists
        let existingData: RecordData[] = [];
        if (await fs.pathExists(filePath)) {
          const fileData = await fs.readJson(filePath);
          existingData = Array.isArray(fileData) ? fileData : [fileData];
        }
        
        // Process and append all new records
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
            existingData.push(recordData);
            created++;
            processed++;
            
            if (options.verbose) {
              callbacks?.onProgress?.(`Creating new records (${created}/${newRecords.length})`);
            }
          } catch (error) {
            callbacks?.onWarn?.(`Failed to process new record: ${(error as any).message || error}`);
          }
        }
        
        // Write the combined data
        await fs.writeJson(filePath, existingData, { spaces: 2 });
        
        if (options.verbose) {
          callbacks?.onLog?.(`Appended ${created} new records to: ${filePath}`);
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
    
    // Write JSON file
    await fs.writeJson(filePath, recordData, { spaces: 2 });
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
    // This is a simplified version - the full implementation would need to be extracted
    // from the pull command. For now, we'll delegate to a method that would be
    // implemented in the full service
    
    // Build record data
    const fields: Record<string, any> = {};
    const relatedEntities: Record<string, RecordData[]> = {};
    
    // Get the underlying data from the entity object
    let dataToProcess = record;
    if (typeof record.GetAll === 'function') {
      dataToProcess = record.GetAll();
    }
    
    // Process fields (simplified - full implementation needed)
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
      
      fields[fieldName] = fieldValue;
    }
    
    // Calculate checksum
    const checksum = this.syncEngine.calculateChecksum(fields);
    
    // Build the final record data
    const recordData: RecordData = {
      fields,
      primaryKey,
      sync: {
        lastModified: new Date().toISOString(),
        checksum: checksum
      }
    };
    
    if (Object.keys(relatedEntities).length > 0) {
      recordData.relatedEntities = relatedEntities;
    }
    
    return recordData;
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
    
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    // Remove .json extension, add timestamp, then add .backup extension
    const backupFileName = fileName.replace(/\.json$/, `.${timestamp}.backup`);
    const backupPath = path.join(backupDir, backupFileName);
    
    try {
      await fs.copy(filePath, backupPath);
    } catch (error) {
      // Log error but don't throw
    }
  }
}