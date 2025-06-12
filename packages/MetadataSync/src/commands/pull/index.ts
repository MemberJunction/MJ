/**
 * @fileoverview Pull command implementation for MetadataSync
 * @module commands/pull
 * 
 * This module implements the pull command which retrieves metadata records from
 * the MemberJunction database and saves them as local JSON files. It supports:
 * - Filtering records with SQL expressions
 * - Pulling related entities with foreign key relationships
 * - Externalizing large text fields to separate files
 * - Creating multi-record JSON files
 * - Recursive directory search for entity configurations
 */

import { Command, Flags } from '@oclif/core';
import fs from 'fs-extra';
import path from 'path';
import { select } from '@inquirer/prompts';
import ora from 'ora-classic';
import { loadMJConfig, loadEntityConfig, RelatedEntityConfig } from '../../config';
import { SyncEngine, RecordData } from '../../lib/sync-engine';
import { RunView, Metadata, EntityInfo } from '@memberjunction/core';
import { getSystemUser, initializeProvider, cleanupProvider } from '../../lib/provider-utils';
import { configManager } from '../../lib/config-manager';
import { getSyncEngine, resetSyncEngine } from '../../lib/singleton-manager';

/**
 * Pull metadata records from database to local files
 * 
 * @class Pull
 * @extends Command
 * 
 * @example
 * ```bash
 * # Pull all records for an entity
 * mj-sync pull --entity="AI Prompts"
 * 
 * # Pull with filter
 * mj-sync pull --entity="AI Prompts" --filter="CategoryID='123'"
 * 
 * # Pull to multi-record file
 * mj-sync pull --entity="AI Prompts" --multi-file="all-prompts.json"
 * ```
 */
export default class Pull extends Command {
  static description = 'Pull metadata from database to local files';
  
  static examples = [
    `<%= config.bin %> <%= command.id %> --entity="AI Prompts"`,
    `<%= config.bin %> <%= command.id %> --entity="AI Prompts" --filter="CategoryID='customer-service-id'"`,
  ];
  
  static flags = {
    entity: Flags.string({ description: 'Entity name to pull', required: true }),
    filter: Flags.string({ description: 'Additional filter for pulling specific records' }),
    'dry-run': Flags.boolean({ description: 'Show what would be pulled without actually pulling' }),
    'multi-file': Flags.string({ description: 'Create a single file with multiple records (provide filename)' }),
    verbose: Flags.boolean({ char: 'v', description: 'Show detailed output' }),
  };
  
  async run(): Promise<void> {
    const { flags } = await this.parse(Pull);
    const spinner = ora();
    
    try {
      // Load MJ config first (before changing directory)
      spinner.start('Loading configuration');
      const mjConfig = loadMJConfig();
      if (!mjConfig) {
        this.error('No mj.config.cjs found in current directory or parent directories');
      }
      
      // Stop spinner before provider initialization (which logs to console)
      spinner.stop();
      
      // Initialize data provider
      const provider = await initializeProvider(mjConfig);
      
      // Get singleton sync engine
      const syncEngine = await getSyncEngine(getSystemUser());
      
      // Show success after all initialization is complete
      spinner.succeed('Configuration and metadata loaded');
      
      let targetDir: string;
      let entityConfig: any;
      
      // Check if we should use a specific target directory
      const envTargetDir = process.env.METADATA_SYNC_TARGET_DIR;
      if (envTargetDir) {
        if (flags.verbose) {
          console.log(`Using specified target directory: ${envTargetDir}`);
        }
        process.chdir(envTargetDir);
        targetDir = process.cwd();
        
        // Load entity config from the current directory
        entityConfig = await loadEntityConfig(targetDir);
        if (!entityConfig) {
          this.error(`No .mj-sync.json found in ${targetDir}`);
        }
        if (entityConfig.entity !== flags.entity) {
          this.error(`Directory ${targetDir} is configured for entity "${entityConfig.entity}", not "${flags.entity}"`);
        }
      } else {
        // Original behavior - find entity directory
        const entityDirs = await this.findEntityDirectories(flags.entity);
        
        if (entityDirs.length === 0) {
          this.error(`No directory found for entity "${flags.entity}". Run "mj-sync init" first.`);
        }
        
        if (entityDirs.length === 1) {
          targetDir = entityDirs[0];
        } else {
          // Multiple directories found, ask user
          targetDir = await select({
            message: `Multiple directories found for entity "${flags.entity}". Which one to use?`,
            choices: entityDirs.map(dir => ({ name: dir, value: dir }))
          });
        }
        
        entityConfig = await loadEntityConfig(targetDir);
        if (!entityConfig) {
          this.error(`Invalid entity configuration in ${targetDir}`);
        }
      }
      
      // Show configuration notice only if relevant
      if (entityConfig.pull?.appendRecordsToExistingFile && entityConfig.pull?.newFileName) {
        const targetFile = path.join(targetDir, entityConfig.pull.newFileName.endsWith('.json') 
          ? entityConfig.pull.newFileName 
          : `${entityConfig.pull.newFileName}.json`);
        
        if (await fs.pathExists(targetFile)) {
          // File exists - inform about append behavior
          this.log(`\n📝 Configuration: New records will be appended to existing file '${path.basename(targetFile)}'`);
        }
        // If file doesn't exist, no need to mention anything special - we're just creating it
      }
      
      // Pull records
      spinner.start(`Pulling ${flags.entity} records`);
      const rv = new RunView();
      
      let filter = '';
      if (flags.filter) {
        filter = flags.filter;
      } else if (entityConfig.pull?.filter) {
        filter = entityConfig.pull.filter;
      }
      
      const result = await rv.RunView({
        EntityName: flags.entity,
        ExtraFilter: filter,
        ResultType: 'entity_object'
      }, getSystemUser());
      
      if (!result.Success) {
        this.error(`Failed to pull records: ${result.ErrorMessage}`);
      }
      
      spinner.succeed(`Found ${result.Results.length} records`);
      
      if (flags['dry-run']) {
        this.log(`\nDry run mode - would pull ${result.Results.length} records to ${targetDir}`);
        return;
      }
      
      // Check if we need to wait for async property loading
      if (entityConfig.pull?.externalizeFields && result.Results.length > 0) {
        const metadata = new Metadata();
        const entityInfo = metadata.EntityByName(flags.entity);
        if (entityInfo) {
          const externalizeConfig = entityConfig.pull.externalizeFields;
          let fieldsToExternalize: string[] = [];
          
          if (Array.isArray(externalizeConfig)) {
            if (externalizeConfig.length > 0 && typeof externalizeConfig[0] === 'string') {
              // Simple string array
              fieldsToExternalize = externalizeConfig as string[];
            } else {
              // New pattern format
              fieldsToExternalize = (externalizeConfig as Array<{field: string; pattern: string}>)
                .map(item => item.field);
            }
          } else {
            // Object format
            fieldsToExternalize = Object.keys(externalizeConfig);
          }
          
          // Get all field names from entity metadata
          const metadataFieldNames = entityInfo.Fields.map(f => f.Name);
          
          // Check if any externalized fields are NOT in metadata (likely computed properties)
          const computedFields = fieldsToExternalize.filter(f => !metadataFieldNames.includes(f));
          
          if (computedFields.length > 0) {
            spinner.start(`Waiting 5 seconds for async property loading in ${flags.entity} (${computedFields.join(', ')})...`);
            await new Promise(resolve => setTimeout(resolve, 5000));
            spinner.succeed('Async property loading wait complete');
          }
        }
      }
      
      // Process each record
      const entityInfo = syncEngine.getEntityInfo(flags.entity);
      if (!entityInfo) {
        this.error(`Entity information not found for: ${flags.entity}`);
      }
      
      spinner.start('Processing records');
      let processed = 0;
      let updated = 0;
      let created = 0;
      let skipped = 0;
      
      // If multi-file flag is set, collect all records
      if (flags['multi-file']) {
        const allRecords: RecordData[] = [];
        
        for (const record of result.Results) {
          try {
            // Build primary key
            const primaryKey: Record<string, any> = {};
            for (const pk of entityInfo.PrimaryKeys) {
              primaryKey[pk.Name] = record[pk.Name];
            }
            
            // Process record for multi-file
            const recordData = await this.processRecordData(record, primaryKey, targetDir, entityConfig, syncEngine, flags, true);
            allRecords.push(recordData);
            processed++;
            
            if (flags.verbose) {
              spinner.text = `Processing records (${processed}/${result.Results.length})`;
            }
          } catch (error) {
            this.warn(`Failed to process record: ${(error as any).message || error}`);
          }
        }
        
        // Write all records to single file
        if (allRecords.length > 0) {
          const fileName = flags['multi-file'].endsWith('.json') ? flags['multi-file'] : `${flags['multi-file']}.json`;
          const filePath = path.join(targetDir, fileName);
          await fs.writeJson(filePath, allRecords, { spaces: 2 });
          spinner.succeed(`Pulled ${processed} records to ${filePath}`);
        }
      } else {
        // Smart update logic for single-file-per-record
        spinner.text = 'Scanning for existing files...';
        
        // Find existing files
        const filePattern = entityConfig.pull?.filePattern || entityConfig.filePattern || '*.json';
        const existingFiles = await this.findExistingFiles(targetDir, filePattern);
        
        if (flags.verbose) {
          this.log(`Found ${existingFiles.length} existing files matching pattern '${filePattern}'`);
          existingFiles.forEach(f => this.log(`  - ${path.basename(f)}`));
        }
        
        // Load existing records and build lookup map
        const existingRecordsMap = await this.loadExistingRecords(existingFiles, entityInfo);
        
        if (flags.verbose) {
          this.log(`Loaded ${existingRecordsMap.size} existing records from files`);
        }
        
        // Separate records into new and existing
        const newRecords: Array<{ record: any; primaryKey: Record<string, any> }> = [];
        const existingRecordsToUpdate: Array<{ record: any; primaryKey: Record<string, any>; filePath: string }> = [];
        
        for (const record of result.Results) {
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
              if (flags.verbose) {
                this.log(`Skipping existing record: ${lookupKey}`);
              }
            }
          } else {
            // Record doesn't exist locally
            if (entityConfig.pull?.createNewFileIfNotFound !== false) {
              newRecords.push({ record, primaryKey });
            } else {
              skipped++;
              if (flags.verbose) {
                this.log(`Skipping new record (createNewFileIfNotFound=false): ${lookupKey}`);
              }
            }
          }
        }
        
        // Track which files have been backed up to avoid duplicates
        const backedUpFiles = new Set<string>();
        
        // Process existing records updates
        for (const { record, primaryKey, filePath } of existingRecordsToUpdate) {
          try {
            spinner.text = `Updating existing records (${updated + 1}/${existingRecordsToUpdate.length})`;
            
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
            const newRecordData = await this.processRecordData(record, primaryKey, targetDir, entityConfig, syncEngine, flags, false, existingRecordData);
            
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
            
            if (flags.verbose) {
              this.log(`Updated: ${filePath}`);
            }
          } catch (error) {
            this.warn(`Failed to update record: ${(error as any).message || error}`);
          }
        }
        
        // Process new records
        if (newRecords.length > 0) {
          spinner.text = `Creating new records (0/${newRecords.length})`;
          
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
                const recordData = await this.processRecordData(record, primaryKey, targetDir, entityConfig, syncEngine, flags, true);
                existingData.push(recordData);
                created++;
                processed++;
                
                if (flags.verbose) {
                  spinner.text = `Creating new records (${created}/${newRecords.length})`;
                }
              } catch (error) {
                this.warn(`Failed to process new record: ${(error as any).message || error}`);
              }
            }
            
            // Write the combined data
            await fs.writeJson(filePath, existingData, { spaces: 2 });
            
            if (flags.verbose) {
              this.log(`Appended ${created} new records to: ${filePath}`);
            }
          } else {
            // Create individual files for each new record
            for (const { record, primaryKey } of newRecords) {
              try {
                await this.processRecord(record, primaryKey, targetDir, entityConfig, syncEngine, flags);
                created++;
                processed++;
                
                if (flags.verbose) {
                  spinner.text = `Creating new records (${created}/${newRecords.length})`;
                }
              } catch (error) {
                this.warn(`Failed to process new record: ${(error as any).message || error}`);
              }
            }
          }
        }
        
        // Final status
        const statusParts = [`Processed ${processed} records`];
        if (updated > 0) statusParts.push(`updated ${updated}`);
        if (created > 0) statusParts.push(`created ${created}`);
        if (skipped > 0) statusParts.push(`skipped ${skipped}`);
        
        spinner.succeed(statusParts.join(', '));
      }
      
    } catch (error) {
      spinner.fail('Pull failed');
      
      // Enhanced error logging for debugging
      this.log('\n=== Pull Error Details ===');
      this.log(`Error type: ${error?.constructor?.name || 'Unknown'}`);
      this.log(`Error message: ${error instanceof Error ? error.message : String(error)}`);
      
      if (error instanceof Error && error.stack) {
        this.log(`\nStack trace:`);
        this.log(error.stack);
      }
      
      // Log context information
      this.log(`\nContext:`);
      this.log(`- Working directory: ${configManager.getOriginalCwd()}`);
      this.log(`- Entity: ${flags.entity || 'not specified'}`);
      this.log(`- Filter: ${flags.filter || 'none'}`);
      this.log(`- Flags: ${JSON.stringify(flags, null, 2)}`);
      
      // Check if error is related to common issues
      const errorMessage = error instanceof Error ? error.message : String(error);
      if (errorMessage.includes('No directory found for entity')) {
        this.log(`\nHint: This appears to be an entity directory configuration issue.`);
        this.log(`Run "mj-sync init" to create directories or ensure .mj-sync.json files exist.`);
      } else if (errorMessage.includes('database') || errorMessage.includes('connection')) {
        this.log(`\nHint: This appears to be a database connectivity issue.`);
        this.log(`Check your mj.config.cjs configuration and database connectivity.`);
      } else if (errorMessage.includes('Failed to pull records')) {
        this.log(`\nHint: This appears to be a database query issue.`);
        this.log(`Check if the entity name "${flags.entity}" is correct and exists in the database.`);
      } else if (errorMessage.includes('Entity information not found')) {
        this.log(`\nHint: The entity "${flags.entity}" was not found in metadata.`);
        this.log(`Check the entity name spelling and ensure it exists in the database.`);
      }
      
      this.error(error as Error);
    } finally {
      // Clean up database connection and reset singletons
      await cleanupProvider();
      resetSyncEngine();
      
      // Exit process to prevent background MJ tasks from throwing errors
      process.exit(0);
    }
  }
  
  /**
   * Find directories containing configuration for the specified entity
   * 
   * Recursively searches the current working directory for .mj-sync.json files
   * that specify the given entity name. Returns all matching directories to
   * allow user selection when multiple locations exist.
   * 
   * @param entityName - Name of the entity to search for
   * @returns Promise resolving to array of directory paths
   * @private
   */
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
  
  /**
   * Process a single record and save to file
   * 
   * Converts a database record into the file format and writes it to disk.
   * This is a wrapper around processRecordData that handles file writing.
   * 
   * @param record - Raw database record
   * @param primaryKey - Primary key fields and values
   * @param targetDir - Directory to save the file
   * @param entityConfig - Entity configuration with pull settings
   * @param syncEngine - Sync engine instance
   * @returns Promise that resolves when file is written
   * @private
   */
  private async processRecord(
    record: any, 
    primaryKey: Record<string, any>,
    targetDir: string, 
    entityConfig: any,
    syncEngine: SyncEngine,
    flags: any
  ): Promise<void> {
    const recordData = await this.processRecordData(record, primaryKey, targetDir, entityConfig, syncEngine, flags, true);
    
    // Determine file path
    const fileName = this.buildFileName(primaryKey, entityConfig);
    const filePath = path.join(targetDir, fileName);
    
    // Write JSON file
    await fs.writeJson(filePath, recordData, { spaces: 2 });
  }
  
  /**
   * Process record data for storage
   * 
   * Transforms a raw database record into the RecordData format used for file storage.
   * Handles field externalization, related entity pulling, and checksum calculation.
   * 
   * @param record - Raw database record
   * @param primaryKey - Primary key fields and values  
   * @param targetDir - Directory where files will be saved
   * @param entityConfig - Entity configuration with defaults and settings
   * @param syncEngine - Sync engine for checksum calculation
   * @param flags - Command flags
   * @param isNewRecord - Whether this is a new record
   * @param existingRecordData - Existing record data to preserve field selection
   * @param currentDepth - Current recursion depth for recursive entities
   * @param processedIds - Set of IDs already processed to prevent circular references
   * @returns Promise resolving to formatted RecordData
   * @private
   */
  private async processRecordData(
    record: any, 
    primaryKey: Record<string, any>,
    targetDir: string, 
    entityConfig: any,
    syncEngine: SyncEngine,
    flags?: any,
    isNewRecord: boolean = true,
    existingRecordData?: RecordData,
    currentDepth: number = 0,
    processedIds: Set<string> = new Set()
  ): Promise<RecordData> {
    // Build record data - we'll restructure at the end for proper ordering
    const fields: Record<string, any> = {};
    const relatedEntities: Record<string, RecordData[]> = {};
    
    // Debug: Log all fields in first record (only in verbose mode)
    if (flags?.verbose) {
      const recordKeys = Object.keys(record);
      console.log('\n=== DEBUG: Processing record ===');
      console.log('Entity:', entityConfig.entity);
      console.log('Total fields:', recordKeys.length);
      console.log('Field names:', recordKeys.filter(k => !k.startsWith('__mj_')).join(', '));
      console.log('Has TemplateText?:', recordKeys.includes('TemplateText'));
      console.log('externalizeFields config:', entityConfig.pull?.externalizeFields);
    }
    
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
          lookupConfig.field,
          syncEngine
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
        externalizeItems = Object.entries(externalizeConfig).map(([field, config]) => ({
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
          if (flags?.verbose) {
            console.log(`Could not get property ${externalField}: ${error}`);
          }
        }
      }
    }
    
    // Pull related entities if configured
    if (entityConfig.pull?.relatedEntities) {
      const related = await this.pullRelatedEntities(
        record,
        entityConfig.pull.relatedEntities,
        syncEngine,
        entityConfig,
        flags,
        currentDepth,
        processedIds
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
            // No default value defined, include if not null/empty
            includeField = true;
          }
        } else {
          // No entity info, include if not null/empty
          includeField = true;
        }
      }
      
      if (includeField) {
        cleanedFields[fieldName] = fieldValue;
      }
    }
    
    // Calculate checksum on cleaned fields
    const checksum = syncEngine.calculateChecksum(cleanedFields);
    
    // Build the final record data with proper ordering
    // Use a new object to ensure property order
    const recordData: RecordData = {} as RecordData;
    
    // 1. User fields first
    recordData.fields = cleanedFields;
    
    // 2. Related entities (if any)
    if (Object.keys(relatedEntities).length > 0) {
      recordData.relatedEntities = relatedEntities;
    }
    
    // 3. Primary key (system field)
    recordData.primaryKey = primaryKey;
    
    // 4. Sync metadata (system field)
    recordData.sync = {
      lastModified: new Date().toISOString(),
      checksum: checksum
    };
    
    return recordData;
  }
  
  /**
   * Convert a foreign key value to a @lookup reference
   * 
   * Looks up the related record and creates a @lookup string that can be
   * resolved during push operations.
   * 
   * @param foreignKeyValue - The foreign key value (ID)
   * @param targetEntity - Name of the target entity
   * @param targetField - Field in target entity to use for lookup
   * @param syncEngine - Sync engine instance
   * @returns @lookup string or null if lookup fails
   * @private
   */
  private async convertToLookup(
    foreignKeyValue: any,
    targetEntity: string,
    targetField: string,
    syncEngine: SyncEngine
  ): Promise<string | null> {
    try {
      // Get the related record
      const metadata = new Metadata();
      const targetEntityInfo = metadata.EntityByName(targetEntity);
      if (!targetEntityInfo) {
        this.warn(`Could not find entity ${targetEntity} for lookup`);
        return null;
      }
      
      // Load the related record
      const primaryKeyField = targetEntityInfo.PrimaryKeys?.[0]?.Name || 'ID';
      const rv = new RunView();
      const result = await rv.RunView({
        EntityName: targetEntity,
        ExtraFilter: `${primaryKeyField} = '${String(foreignKeyValue).replace(/'/g, "''")}'`,
        ResultType: 'entity_object'
      }, getSystemUser());
      
      if (!result.Success || result.Results.length === 0) {
        this.warn(`Could not find ${targetEntity} with ${primaryKeyField} = ${foreignKeyValue}`);
        return null;
      }
      
      const relatedRecord = result.Results[0];
      const lookupValue = relatedRecord[targetField];
      
      if (!lookupValue) {
        this.warn(`${targetEntity} record missing ${targetField} field`);
        return null;
      }
      
      // Return the @lookup reference
      return `@lookup:${targetEntity}.${targetField}=${lookupValue}`;
    } catch (error) {
      this.warn(`Failed to create lookup for ${targetEntity}: ${error}`);
      return null;
    }
  }
  
  /**
   * Determine if a field should be saved to an external file
   * 
   * Checks if a field is configured for externalization or contains substantial
   * text content that would be better stored in a separate file.
   * 
   * @param fieldName - Name of the field to check
   * @param fieldValue - Value of the field
   * @param entityConfig - Entity configuration with externalization settings
   * @returns Promise resolving to true if field should be externalized
   * @private
   */
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
  
  /**
   * Create an external file for a field value
   * 
   * Saves large text content to a separate file and returns the filename.
   * Automatically determines appropriate file extension based on field name
   * and content type (e.g., .md for prompts, .html for templates).
   * Uses the entity's name field for the filename if available.
   * 
   * @param targetDir - Directory to save the file
   * @param record - Full record to extract name field from
   * @param primaryKey - Primary key for filename generation fallback
   * @param fieldName - Name of the field being externalized
   * @param content - Content to write to the file
   * @param entityConfig - Entity configuration
   * @returns Promise resolving to the created filename
   * @private
   */
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
  
  /**
   * Build a filename from primary key values
   * 
   * Creates a safe filename based on the entity's primary key values.
   * Handles GUIDs by using first 8 characters, sanitizes special characters,
   * and creates composite names for multi-field keys.
   * Files are prefixed with a dot to follow the metadata file convention.
   * 
   * @param primaryKey - Primary key fields and values
   * @param entityConfig - Entity configuration (for future extension)
   * @returns Filename with .json extension
   * @private
   */
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
  
  /**
   * Pull related entities for a parent record
   * 
   * Retrieves child records that have foreign key relationships to the parent.
   * Converts foreign key values to @parent references and supports nested
   * related entities for deep object graphs.
   * NEW: Supports automatic recursive patterns for self-referencing entities.
   * 
   * @param parentRecord - Parent entity record
   * @param relatedConfig - Configuration for related entities to pull
   * @param syncEngine - Sync engine instance
   * @param entityConfig - Entity configuration
   * @param flags - Command flags
   * @param currentDepth - Current recursion depth for recursive entities
   * @param processedIds - Set of IDs already processed to prevent circular references
   * @returns Promise resolving to map of entity names to related records
   * @private
   */
  private async pullRelatedEntities(
    parentRecord: any,
    relatedConfig: Record<string, RelatedEntityConfig>,
    syncEngine: SyncEngine,
    entityConfig: any,
    flags?: any,
    currentDepth: number = 0,
    processedIds: Set<string> = new Set()
  ): Promise<Record<string, RecordData[]>> {
    const relatedEntities: Record<string, RecordData[]> = {};
    
    for (const [key, config] of Object.entries(relatedConfig)) {
      try {
        // Get entity metadata to find primary key
        const metadata = new Metadata();
        const parentEntity = metadata.EntityByName(entityConfig.entity);
        if (!parentEntity) {
          this.warn(`Could not find entity metadata for ${entityConfig.entity}`);
          continue;
        }
        
        // Get the parent's primary key value (usually ID)
        const primaryKeyField = parentEntity.PrimaryKeys?.[0]?.Name || 'ID';
        const parentKeyValue = parentRecord[primaryKeyField];
        if (!parentKeyValue) {
          this.warn(`Parent record missing primary key field ${primaryKeyField}`);
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
        }, getSystemUser());
        
        if (!result.Success) {
          this.warn(`Failed to pull related ${config.entity}: ${result.ErrorMessage}`);
          continue;
        }
        
        // Get child entity metadata
        const childEntity = metadata.EntityByName(config.entity);
        if (!childEntity) {
          this.warn(`Could not find entity metadata for ${config.entity}`);
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
            console.log(`Waiting 5 seconds for async property loading in related entity ${config.entity} (${computedFields.join(', ')})...`);
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
          
          // Check for circular references if this is a recursive config
          const recordId = String(relatedPrimaryKey[childEntity.PrimaryKeys[0]?.Name || 'ID']);
          if (config.recursive && processedIds.has(recordId)) {
            if (flags?.verbose) {
              this.log(`Skipping circular reference for ${config.entity} with ID: ${recordId}`);
            }
            continue;
          }
          
          // Add current record ID to processed set for recursion tracking
          const newProcessedIds = new Set(processedIds);
          if (config.recursive) {
            newProcessedIds.add(recordId);
          }
          
          // Determine related entities configuration for recursion
          let childRelatedConfig = config.relatedEntities;
          
          // If recursive is enabled and this is a self-referencing entity
          if (config.recursive && config.entity === entityConfig.entity) {
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
              if (flags?.verbose) {
                this.log(`Max depth ${maxDepth} reached for recursive entity ${config.entity} at record ${recordId}`);
              }
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
            syncEngine,
            flags,
            true, // isNewRecord
            undefined, // existingRecordData
            currentDepth + 1,
            newProcessedIds
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
        this.warn(`Error pulling related ${key}: ${error}`);
      }
    }
    
    return relatedEntities;
  }
  
  /**
   * Find which field in the parent record contains a specific value
   * 
   * Used to convert foreign key references to @parent references by finding
   * the parent field that contains the foreign key value. Typically finds
   * the primary key field but can match any field.
   * 
   * @param parentRecord - Parent record to search
   * @param value - Value to search for
   * @returns Field name containing the value, or null if not found
   * @private
   */
  private findParentField(parentRecord: any, value: any): string | null {
    // Find which field in the parent contains this value
    // Typically this will be the primary key field
    for (const [fieldName, fieldValue] of Object.entries(parentRecord)) {
      if (fieldValue === value && !fieldName.startsWith('__mj_')) {
        return fieldName;
      }
    }
    return null;
  }
  
  /**
   * Find existing files in a directory matching a pattern
   * 
   * Searches for files that match the configured file pattern, used to identify
   * which records already exist locally for smart update functionality.
   * 
   * @param dir - Directory to search in
   * @param pattern - Glob pattern to match files (e.g., "*.json")
   * @returns Promise resolving to array of file paths
   * @private
   */
  private async findExistingFiles(dir: string, pattern: string): Promise<string[]> {
    const files: string[] = [];
    
    try {
      const entries = await fs.readdir(dir, { withFileTypes: true });
      
      for (const entry of entries) {
        if (entry.isFile()) {
          const fileName = entry.name;
          
          // Simple pattern matching - could be enhanced with proper glob support
          if (pattern === '*.json' && fileName.endsWith('.json')) {
            files.push(path.join(dir, fileName));
          } else if (pattern === '.*.json' && fileName.startsWith('.') && fileName.endsWith('.json')) {
            // Handle dot-prefixed JSON files
            files.push(path.join(dir, fileName));
          } else if (pattern === fileName) {
            files.push(path.join(dir, fileName));
          }
          // TODO: Add more sophisticated glob pattern matching if needed
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
  
  /**
   * Load existing records from files and build a lookup map
   * 
   * Reads all existing files and creates a map from primary key to file location,
   * enabling efficient lookup during the update process.
   * 
   * @param files - Array of file paths to load
   * @param entityInfo - Entity metadata for primary key information
   * @returns Map from primary key string to file info
   * @private
   */
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
        this.warn(`Could not load file ${filePath}: ${error}`);
      }
    }
    
    return recordsMap;
  }
  
  /**
   * Create a string lookup key from primary key values
   * 
   * Generates a consistent string representation of primary key values
   * for use in maps and comparisons.
   * 
   * @param primaryKey - Primary key field names and values
   * @returns String representation of the primary key
   * @private
   */
  private createPrimaryKeyLookup(primaryKey: Record<string, any>): string {
    const keys = Object.keys(primaryKey).sort();
    return keys.map(k => `${k}:${primaryKey[k]}`).join('|');
  }
  
  /**
   * Merge two record data objects based on configured strategy
   * 
   * Combines existing and new record data according to the merge strategy:
   * - 'overwrite': Replace all fields with new values
   * - 'merge': Combine fields, with new values taking precedence
   * - 'skip': Keep existing record unchanged
   * 
   * @param existing - Existing record data
   * @param newData - New record data from database
   * @param strategy - Merge strategy to apply
   * @param preserveFields - Field names that should never be overwritten
   * @returns Merged record data
   * @private
   */
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
      // Build with proper ordering
      const result: RecordData = {} as RecordData;
      
      // 1. Fields first
      result.fields = { ...newData.fields };
      
      // Restore preserved fields from existing
      if (preserveFields.length > 0 && existing.fields) {
        for (const field of preserveFields) {
          if (field in existing.fields) {
            result.fields[field] = existing.fields[field];
          }
        }
      }
      
      // 2. Related entities (if any)
      if (newData.relatedEntities) {
        result.relatedEntities = newData.relatedEntities;
      }
      
      // 3. Primary key
      result.primaryKey = newData.primaryKey;
      
      // 4. Sync metadata
      result.sync = newData.sync;
      
      return result;
    }
    
    // Default 'merge' strategy
    // Build with proper ordering
    const result: RecordData = {} as RecordData;
    
    // 1. Fields first
    result.fields = { ...existing.fields, ...newData.fields };
    
    // Restore preserved fields
    if (preserveFields.length > 0 && existing.fields) {
      for (const field of preserveFields) {
        if (field in existing.fields) {
          result.fields[field] = existing.fields[field];
        }
      }
    }
    
    // 2. Related entities (if any)
    if (existing.relatedEntities || newData.relatedEntities) {
      result.relatedEntities = {
        ...existing.relatedEntities,
        ...newData.relatedEntities
      };
    }
    
    // 3. Primary key
    result.primaryKey = newData.primaryKey || existing.primaryKey;
    
    // 4. Sync metadata
    result.sync = newData.sync;
    
    return result;
  }
  
  /**
   * Create a backup of a file before updating
   * 
   * Creates a timestamped backup copy of the file in a backup directory
   * with the original filename, timestamp suffix, and .backup extension.
   * The backup directory defaults to .backups but can be configured.
   * 
   * @param filePath - Path to the file to backup
   * @param backupDirName - Name of the backup directory (optional)
   * @returns Promise that resolves when backup is created
   * @private
   */
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
      this.warn(`Could not create backup of ${filePath}: ${error}`);
    }
  }
}