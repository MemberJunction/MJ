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
    const existingRecordsMap = await this.loadExistingRecords(existingFiles);
    
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
    // Build record data - we'll restructure at the end for proper ordering
    const fields: Record<string, any> = {};
    const relatedEntities: Record<string, RecordData[]> = {};
    
    // Get the underlying data from the entity object
    // If it's an entity object, it will have a GetAll() method
    let dataToProcess = record;
    if (typeof record.GetAll === 'function') {
      // It's an entity object, get the underlying data
      dataToProcess = record.GetAll();
    }
    
    // Get externalize configuration for pattern lookup
    const externalizeConfig = entityConfig.pull?.externalizeFields;
    let externalizeMap = new Map<string, string | undefined>();
    
    if (externalizeConfig) {
      if (Array.isArray(externalizeConfig)) {
        if (externalizeConfig.length > 0 && typeof externalizeConfig[0] === 'string') {
          // Simple string array
          (externalizeConfig as string[]).forEach(f => externalizeMap.set(f, undefined));
        } else {
          // New pattern format
          (externalizeConfig as Array<{field: string; pattern: string}>).forEach(item => 
            externalizeMap.set(item.field, item.pattern)
          );
        }
      } else {
        // Object format
        Object.keys(externalizeConfig).forEach(f => externalizeMap.set(f, undefined));
      }
    }
    
    // Process regular fields from the underlying data
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
      
      // Skip fields already externalized
      if (fields[fieldName]) {
        continue;
      }
      
      // Skip virtual/computed fields - check entity metadata
      const metadata = new Metadata();
      const entityInfo = metadata.EntityByName(entityConfig.entity);
      
      
      if (entityInfo) {
        const fieldInfo = entityInfo.Fields.find(f => f.Name === fieldName);
        if (fieldInfo && !fieldInfo.IsVirtual) {
          // Field exists in metadata and is not virtual, keep it
        } else if (fieldInfo && fieldInfo.IsVirtual) {
          // Skip virtual fields
          continue;
        } else if (!fieldInfo) {
          // Field not in metadata at all
          // Check if it's explicitly configured for externalization, lookup, or exclusion
          const isConfiguredField = 
            entityConfig.pull?.externalizeFields?.includes(fieldName) ||
            entityConfig.pull?.lookupFields?.[fieldName] ||
            entityConfig.pull?.excludeFields?.includes(fieldName);
          
          
          if (!isConfiguredField) {
            // Skip fields not in metadata and not explicitly configured
            continue;
          }
          // Otherwise, allow the field to be processed since it's explicitly configured
        }
      }
      
      // Check if this field should be converted to a lookup
      const lookupConfig = entityConfig.pull?.lookupFields?.[fieldName];
      if (lookupConfig && fieldValue) {
        // Convert foreign key to @lookup reference
        const lookupValue = await this.convertToLookup(
          fieldValue,
          lookupConfig.entity,
          lookupConfig.field
        );
        if (lookupValue) {
          fields[fieldName] = lookupValue;
          continue;
        }
      }
      
      // Check if this is an external file field
      if (await this.shouldExternalizeField(fieldName, fieldValue, entityConfig)) {
        // Check if this field is preserved and already has a @file: reference
        const isPreservedField = entityConfig.pull?.preserveFields?.includes(fieldName);
        const existingFieldValue = existingRecordData?.fields?.[fieldName];
        
        if (isPreservedField && existingFieldValue && typeof existingFieldValue === 'string' && existingFieldValue.startsWith('@file:')) {
          // Field is preserved and has existing @file: reference - update the existing file
          const existingFilePath = existingFieldValue.replace('@file:', '');
          const fullPath = path.join(targetDir, existingFilePath);
          
          // Ensure directory exists
          await fs.ensureDir(path.dirname(fullPath));
          
          // Write the content to the existing file path
          await fs.writeFile(fullPath, String(fieldValue), 'utf-8');
          
          // Keep the existing @file: reference
          fields[fieldName] = existingFieldValue;
        } else {
          // Normal externalization - create new file
          const pattern = externalizeMap.get(fieldName);
          const fileName = await this.createExternalFile(
            targetDir,
            record,
            primaryKey,
            fieldName,
            String(fieldValue),
            entityConfig,
            pattern
          );
          fields[fieldName] = fileName; // fileName already includes @file: prefix if pattern-based
        }
      } else {
        fields[fieldName] = fieldValue;
      }
    }
    
    // Now check for externalized fields that might be computed properties
    // We process ALL externalized fields, including those not in the data
    if (entityConfig.pull?.externalizeFields && typeof record.GetAll === 'function') {
      const externalizeConfig = entityConfig.pull.externalizeFields;
      
      // Normalize configuration to array format
      let externalizeItems: Array<{field: string; pattern?: string}> = [];
      if (Array.isArray(externalizeConfig)) {
        if (externalizeConfig.length > 0 && typeof externalizeConfig[0] === 'string') {
          // Simple string array
          externalizeItems = (externalizeConfig as string[]).map(f => ({field: f}));
        } else {
          // Already in the new format
          externalizeItems = externalizeConfig as Array<{field: string; pattern: string}>;
        }
      } else {
        // Object format
        externalizeItems = Object.entries(externalizeConfig).map(([field]) => ({
          field,
          pattern: undefined // Will use default pattern
        }));
      }
      
      // Get the keys from the underlying data to identify computed properties
      const dataKeys = Object.keys(dataToProcess);
      
      for (const externalItem of externalizeItems) {
        const externalField = externalItem.field;
        
        // Only process fields that are NOT in the underlying data
        // (these are likely computed properties)
        if (dataKeys.includes(externalField)) {
          continue; // This was already processed in the main loop
        }
        
        try {
          // Use bracket notation to access properties (including getters)
          const fieldValue = record[externalField];
          if (fieldValue !== undefined && fieldValue !== null && fieldValue !== '') {
            if (await this.shouldExternalizeField(externalField, fieldValue, entityConfig)) {
              // Check if this field is preserved and already has a @file: reference
              const isPreservedField = entityConfig.pull?.preserveFields?.includes(externalField);
              const existingFieldValue = existingRecordData?.fields?.[externalField];
              
              if (isPreservedField && existingFieldValue && typeof existingFieldValue === 'string' && existingFieldValue.startsWith('@file:')) {
                // Field is preserved and has existing @file: reference - update the existing file
                const existingFilePath = existingFieldValue.replace('@file:', '');
                const fullPath = path.join(targetDir, existingFilePath);
                
                // Ensure directory exists
                await fs.ensureDir(path.dirname(fullPath));
                
                // Write the content to the existing file path
                await fs.writeFile(fullPath, String(fieldValue), 'utf-8');
                
                // Keep the existing @file: reference
                fields[externalField] = existingFieldValue;
              } else {
                // Normal externalization - create new file
                const fileName = await this.createExternalFile(
                  targetDir,
                  record,
                  primaryKey,
                  externalField,
                  String(fieldValue),
                  entityConfig,
                  externalItem.pattern
                );
                fields[externalField] = fileName; // fileName already includes @file: prefix if pattern-based
              }
            } else {
              // Include the field value if not externalized
              fields[externalField] = fieldValue;
            }
          }
        } catch (error) {
          // Property might not exist, that's okay
        }
      }
    }
    
    // Pull related entities if configured
    if (entityConfig.pull?.relatedEntities) {
      const related = await this.pullRelatedEntities(
        record,
        entityConfig.pull.relatedEntities,
        entityConfig,
        verbose,
        currentDepth,
        ancestryPath
      );
      Object.assign(relatedEntities, related);
    }
    
    // Get entity metadata to check defaults
    const metadata = new Metadata();
    const entityInfo = metadata.EntityByName(entityConfig.entity);
    
    // Filter out null values and fields matching their defaults
    const cleanedFields: Record<string, any> = {};
    
    // Get the set of fields that existed in the original record (if updating)
    const existingFieldNames = existingRecordData?.fields ? new Set(Object.keys(existingRecordData.fields)) : new Set<string>();
    
    for (const [fieldName, fieldValue] of Object.entries(fields)) {
      let includeField = false;
      
      if (!isNewRecord && existingFieldNames.has(fieldName)) {
        // For updates: Always preserve fields that existed in the original record
        includeField = true;
      } else {
        // For new records or new fields in existing records:
        // Skip null/undefined/empty string values
        if (fieldValue === null || fieldValue === undefined || fieldValue === '') {
          includeField = false;
        } else if (entityInfo) {
          // Check if value matches the field's default
          const fieldInfo = entityInfo.Fields.find(f => f.Name === fieldName);
          if (fieldInfo && fieldInfo.DefaultValue !== null && fieldInfo.DefaultValue !== undefined) {
            // Compare with default value
            if (fieldValue === fieldInfo.DefaultValue) {
              includeField = false;
            }
            // Special handling for boolean defaults (might be stored as strings)
            else if (typeof fieldValue === 'boolean' && 
                (fieldInfo.DefaultValue === (fieldValue ? '1' : '0') || 
                 fieldInfo.DefaultValue === (fieldValue ? 'true' : 'false'))) {
              includeField = false;
            }
            // Special handling for numeric defaults that might be strings
            else if (typeof fieldValue === 'number' && String(fieldValue) === String(fieldInfo.DefaultValue)) {
              includeField = false;
            } else {
              includeField = true;
            }
          } else {
            // No default value or field not found - include it
            includeField = true;
          }
        } else {
          // No entity info - include it
          includeField = true;
        }
      }
      
      if (includeField) {
        cleanedFields[fieldName] = fieldValue;
      }
    }
    
    // Calculate checksum based on cleaned fields
    const checksum = this.syncEngine.calculateChecksum(cleanedFields);
    
    // Build the final record data with proper ordering
    const recordData: RecordData = {
      fields: cleanedFields,
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

  private async convertToLookup(
    foreignKeyValue: any,
    targetEntity: string,
    targetField: string
  ): Promise<string | null> {
    try {
      // Get the related record
      const metadata = new Metadata();
      const targetEntityInfo = metadata.EntityByName(targetEntity);
      if (!targetEntityInfo) {
        return null;
      }
      
      // Load the related record
      const primaryKeyField = targetEntityInfo.PrimaryKeys?.[0]?.Name || 'ID';
      const rv = new RunView();
      const result = await rv.RunView({
        EntityName: targetEntity,
        ExtraFilter: `${primaryKeyField} = '${String(foreignKeyValue).replace(/'/g, "''")}'`,
        ResultType: 'entity_object'
      }, this.contextUser);
      
      if (!result.Success || result.Results.length === 0) {
        return null;
      }
      
      const relatedRecord = result.Results[0];
      const lookupValue = relatedRecord[targetField];
      
      if (!lookupValue) {
        return null;
      }
      
      // Return the @lookup reference
      return `@lookup:${targetEntity}.${targetField}=${lookupValue}`;
    } catch (error) {
      return null;
    }
  }

  private async shouldExternalizeField(
    fieldName: string, 
    fieldValue: any,
    entityConfig: any
  ): Promise<boolean> {
    
    // Only externalize string fields
    if (typeof fieldValue !== 'string') {
      return false;
    }
    
    // Check if field is configured for externalization
    const externalizeConfig = entityConfig.pull?.externalizeFields;
    if (!externalizeConfig) {
      return false;
    }
    
    if (Array.isArray(externalizeConfig)) {
      if (externalizeConfig.length > 0 && typeof externalizeConfig[0] === 'string') {
        // Simple string array
        return (externalizeConfig as string[]).includes(fieldName);
      } else {
        // New pattern format
        return (externalizeConfig as Array<{field: string; pattern: string}>)
          .some(item => item.field === fieldName);
      }
    } else {
      // Object format
      return fieldName in externalizeConfig;
    }
  }

  private async createExternalFile(
    targetDir: string,
    record: any,
    primaryKey: Record<string, any>,
    fieldName: string,
    content: string,
    entityConfig: any,
    pattern?: string
  ): Promise<string> {
    // If pattern is provided, use it to generate the full path
    if (pattern) {
      // Replace placeholders in the pattern
      let resolvedPattern = pattern;
      
      // Get entity metadata for field lookups
      const metadata = new Metadata();
      const entityInfo = metadata.EntityByName(entityConfig.entity);
      
      // Replace {Name} with the entity's name field value
      if (entityInfo) {
        const nameField = entityInfo.Fields.find(f => f.IsNameField);
        if (nameField && record[nameField.Name]) {
          const nameValue = String(record[nameField.Name])
            .replace(/[^a-zA-Z0-9\-_ ]/g, '') // Remove disallowed characters
            .replace(/\s+/g, '-') // Replace spaces with -
            .toLowerCase(); // Make lowercase
          resolvedPattern = resolvedPattern.replace(/{Name}/g, nameValue);
        }
      }
      
      // Replace {ID} with the primary key
      const idValue = primaryKey.ID || Object.values(primaryKey)[0];
      if (idValue) {
        resolvedPattern = resolvedPattern.replace(/{ID}/g, String(idValue).toLowerCase());
      }
      
      // Replace {FieldName} with the current field name
      resolvedPattern = resolvedPattern.replace(/{FieldName}/g, fieldName.toLowerCase());
      
      // Replace any other {field} placeholders with field values from the record
      const placeholderRegex = /{(\w+)}/g;
      resolvedPattern = resolvedPattern.replace(placeholderRegex, (match, fieldName) => {
        const value = record[fieldName];
        if (value !== undefined && value !== null) {
          return String(value)
            .replace(/[^a-zA-Z0-9\-_ ]/g, '')
            .replace(/\s+/g, '-')
            .toLowerCase();
        }
        return match; // Keep placeholder if field not found
      });
      
      // Extract the file path from the pattern
      const filePath = path.join(targetDir, resolvedPattern.replace('@file:', ''));
      
      // Ensure directory exists
      await fs.ensureDir(path.dirname(filePath));
      
      // Write the file
      await fs.writeFile(filePath, content, 'utf-8');
      
      // Return the pattern as-is (it includes @file: prefix)
      return resolvedPattern;
    }
    
    // Original logic for non-pattern based externalization
    let extension = '.md'; // default to markdown
    
    const externalizeConfig = entityConfig.pull?.externalizeFields;
    if (externalizeConfig && !Array.isArray(externalizeConfig) && externalizeConfig[fieldName]?.extension) {
      extension = externalizeConfig[fieldName].extension;
      // Ensure extension starts with a dot
      if (!extension.startsWith('.')) {
        extension = '.' + extension;
      }
    }
    
    // Try to use the entity's name field for the filename
    let baseFileName: string;
    
    // Get entity metadata to find the name field
    const metadata = new Metadata();
    const entityInfo = metadata.EntityByName(entityConfig.entity);
    
    if (entityInfo) {
      // Find the name field
      const nameField = entityInfo.Fields.find(f => f.IsNameField);
      if (nameField && record[nameField.Name]) {
        // Use the name field value, sanitized for filesystem
        const nameValue = String(record[nameField.Name]);
        // Remove disallowed characters (don't replace with _), replace spaces with -, and lowercase
        baseFileName = nameValue
          .replace(/[^a-zA-Z0-9\-_ ]/g, '') // Remove disallowed characters
          .replace(/\s+/g, '-') // Replace spaces with -
          .toLowerCase(); // Make lowercase
      } else {
        // Fallback to primary key
        baseFileName = this.buildFileName(primaryKey, null).replace('.json', '');
      }
    } else {
      // Fallback to primary key
      baseFileName = this.buildFileName(primaryKey, null).replace('.json', '');
    }
    
    // Remove dot prefix from baseFileName if it exists (it will be a dot-prefixed name from buildFileName)
    const cleanBaseFileName = baseFileName.startsWith('.') ? baseFileName.substring(1) : baseFileName;
    const fileName = `.${cleanBaseFileName}.${fieldName.toLowerCase()}${extension}`;
    const filePath = path.join(targetDir, fileName);
    
    await fs.writeFile(filePath, content, 'utf-8');
    
    return fileName;
  }

  private async pullRelatedEntities(
    parentRecord: any,
    relatedConfig: Record<string, RelatedEntityConfig>,
    entityConfig: any,
    verbose?: boolean,
    currentDepth: number = 0,
    ancestryPath: Set<string> = new Set()
  ): Promise<Record<string, RecordData[]>> {
    const relatedEntities: Record<string, RecordData[]> = {};
    
    for (const [key, config] of Object.entries(relatedConfig)) {
      try {
        // Get entity metadata to find primary key
        const metadata = new Metadata();
        const parentEntity = metadata.EntityByName(entityConfig.entity);
        if (!parentEntity) {
          continue;
        }
        
        // Get the parent's primary key value (usually ID)
        const primaryKeyField = parentEntity.PrimaryKeys?.[0]?.Name || 'ID';
        const parentKeyValue = parentRecord[primaryKeyField];
        if (!parentKeyValue) {
          continue;
        }
        
        // Build filter for related records
        // The foreignKey is the field in the CHILD entity that points to this parent
        let filter = `${config.foreignKey} = '${String(parentKeyValue).replace(/'/g, "''")}'`;
        if (config.filter) {
          filter += ` AND (${config.filter})`;
        }
        
        // Pull related records
        const rv = new RunView();
        const result = await rv.RunView({
          EntityName: config.entity,
          ExtraFilter: filter,
          ResultType: 'entity_object'
        }, this.contextUser);
        
        if (!result.Success) {
          continue;
        }
        
        // Get child entity metadata
        const childEntity = metadata.EntityByName(config.entity);
        if (!childEntity) {
          continue;
        }
        
        // Check if we need to wait for async property loading for related entities
        if (config.externalizeFields && result.Results.length > 0) {
          let fieldsToExternalize: string[] = [];
          
          if (Array.isArray(config.externalizeFields)) {
            if (config.externalizeFields.length > 0 && typeof config.externalizeFields[0] === 'string') {
              // Simple string array
              fieldsToExternalize = config.externalizeFields as string[];
            } else {
              // New pattern format
              fieldsToExternalize = (config.externalizeFields as Array<{field: string; pattern: string}>)
                .map(item => item.field);
            }
          } else {
            // Object format
            fieldsToExternalize = Object.keys(config.externalizeFields);
          }
          
          // Get all field names from entity metadata
          const metadataFieldNames = childEntity.Fields.map(f => f.Name);
          
          // Check if any externalized fields are NOT in metadata (likely computed properties)
          const computedFields = fieldsToExternalize.filter(f => !metadataFieldNames.includes(f));
          
          if (computedFields.length > 0) {
            // Wait for async property loading
            await new Promise(resolve => setTimeout(resolve, 5000));
          }
        }
        
        // Process each related record
        const relatedRecords: RecordData[] = [];
        
        for (const relatedRecord of result.Results) {
          // Build primary key for the related record
          const relatedPrimaryKey: Record<string, any> = {};
          for (const pk of childEntity.PrimaryKeys) {
            relatedPrimaryKey[pk.Name] = relatedRecord[pk.Name];
          }
          
          // Check for circular references in the current ancestry path
          const recordId = String(relatedPrimaryKey[childEntity.PrimaryKeys[0]?.Name || 'ID']);
          if (config.recursive && ancestryPath.has(recordId)) {
            continue;
          }
          
          // Create new ancestry path for this branch (only track current hierarchy chain)
          const newAncestryPath = new Set(ancestryPath);
          if (config.recursive) {
            newAncestryPath.add(recordId);
          }
          
          // Determine related entities configuration for recursion
          let childRelatedConfig = config.relatedEntities;
          
          // If recursive is enabled, continue recursive fetching at child level
          if (config.recursive) {
            const maxDepth = config.maxDepth || 10;
            
            if (currentDepth < maxDepth) {
              // Create recursive configuration that references the same entity
              childRelatedConfig = {
                [key]: {
                  ...config,
                  // Keep same configuration but increment depth internally
                }
              };
            } else {
              // At max depth, don't recurse further
              childRelatedConfig = undefined;
            }
          }
          
          // Process the related record using the same logic as parent records
          const relatedData = await this.processRecordData(
            relatedRecord,
            relatedPrimaryKey,
            '', // Not used for related entities since we don't externalize their fields
            { 
              entity: config.entity,
              pull: {
                excludeFields: config.excludeFields || entityConfig.pull?.excludeFields,
                lookupFields: config.lookupFields || entityConfig.pull?.lookupFields,
                externalizeFields: config.externalizeFields,
                relatedEntities: childRelatedConfig
              }
            },
            verbose,
            true, // isNewRecord
            undefined, // existingRecordData
            currentDepth + 1,
            newAncestryPath
          );
          
          // Convert foreign key reference to @parent
          if (relatedData.fields[config.foreignKey]) {
            relatedData.fields[config.foreignKey] = `@parent:${primaryKeyField}`;
          }
          
          // The processRecordData method already filters nulls and defaults
          // No need to do it again here
          
          relatedRecords.push(relatedData);
        }
        
        if (relatedRecords.length > 0) {
          relatedEntities[key] = relatedRecords;
        }
      } catch (error) {
        // Silent error handling
      }
    }
    
    return relatedEntities;
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
    files: string[]
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