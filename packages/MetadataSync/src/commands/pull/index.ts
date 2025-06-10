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
import { RunView, Metadata } from '@memberjunction/core';
import { getSystemUser, initializeProvider, cleanupProvider } from '../../lib/provider-utils';
import { configManager } from '../../lib/config-manager';

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
      
      // Initialize data provider
      const provider = await initializeProvider(mjConfig);
      
      // Initialize sync engine
      const syncEngine = new SyncEngine(getSystemUser());
      await syncEngine.initialize();
      spinner.succeed('Configuration loaded');
      
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
          const fieldsToExternalize = Array.isArray(externalizeConfig) 
            ? externalizeConfig 
            : Object.keys(externalizeConfig);
          
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
            const recordData = await this.processRecordData(record, primaryKey, targetDir, entityConfig, syncEngine, flags);
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
        // Original single-file-per-record logic
        for (const record of result.Results) {
          try {
            // Build primary key
            const primaryKey: Record<string, any> = {};
            for (const pk of entityInfo.PrimaryKeys) {
              primaryKey[pk.Name] = record[pk.Name];
            }
            
            // Process record
            await this.processRecord(record, primaryKey, targetDir, entityConfig, syncEngine, flags);
            processed++;
            
            if (flags.verbose) {
              spinner.text = `Processing records (${processed}/${result.Results.length})`;
            }
          } catch (error) {
            this.warn(`Failed to process record: ${(error as any).message || error}`);
          }
        }
        
        spinner.succeed(`Pulled ${processed} records to ${targetDir}`);
      }
      
    } catch (error) {
      spinner.fail('Pull failed');
      this.error(error as Error);
    } finally {
      // Clean up database connection
      await cleanupProvider();
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
    const recordData = await this.processRecordData(record, primaryKey, targetDir, entityConfig, syncEngine, flags);
    
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
   * @returns Promise resolving to formatted RecordData
   * @private
   */
  private async processRecordData(
    record: any, 
    primaryKey: Record<string, any>,
    targetDir: string, 
    entityConfig: any,
    syncEngine: SyncEngine,
    flags?: any
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
        const fileName = await this.createExternalFile(
          targetDir,
          record,
          primaryKey,
          fieldName,
          String(fieldValue),
          entityConfig
        );
        fields[fieldName] = `@file:${fileName}`;
      } else {
        fields[fieldName] = fieldValue;
      }
    }
    
    // Now check for externalized fields that might be computed properties
    // We process ALL externalized fields, including those not in the data
    if (entityConfig.pull?.externalizeFields && typeof record.GetAll === 'function') {
      const externalizeConfig = entityConfig.pull.externalizeFields;
      const fieldsToExternalize = Array.isArray(externalizeConfig) 
        ? externalizeConfig 
        : Object.keys(externalizeConfig);
      
      // Get the keys from the underlying data to identify computed properties
      const dataKeys = Object.keys(dataToProcess);
      
      for (const externalField of fieldsToExternalize) {
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
              const fileName = await this.createExternalFile(
                targetDir,
                record,
                primaryKey,
                externalField,
                String(fieldValue),
                entityConfig
              );
              fields[externalField] = `@file:${fileName}`;
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
        flags
      );
      Object.assign(relatedEntities, related);
    }
    
    // Get entity metadata to check defaults
    const metadata = new Metadata();
    const entityInfo = metadata.EntityByName(entityConfig.entity);
    
    // Filter out null values and fields matching their defaults
    const cleanedFields: Record<string, any> = {};
    for (const [fieldName, fieldValue] of Object.entries(fields)) {
      // Skip null/undefined/empty string values
      if (fieldValue === null || fieldValue === undefined || fieldValue === '') {
        continue;
      }
      
      // Check if value matches the field's default
      if (entityInfo) {
        const fieldInfo = entityInfo.Fields.find(f => f.Name === fieldName);
        if (fieldInfo && fieldInfo.DefaultValue !== null && fieldInfo.DefaultValue !== undefined) {
          // Compare with default value
          if (fieldValue === fieldInfo.DefaultValue) {
            continue;
          }
          // Special handling for boolean defaults (might be stored as strings)
          if (typeof fieldValue === 'boolean' && 
              (fieldInfo.DefaultValue === (fieldValue ? '1' : '0') || 
               fieldInfo.DefaultValue === (fieldValue ? 'true' : 'false'))) {
            continue;
          }
          // Special handling for numeric defaults that might be strings
          if (typeof fieldValue === 'number' && String(fieldValue) === String(fieldInfo.DefaultValue)) {
            continue;
          }
        }
      }
      
      cleanedFields[fieldName] = fieldValue;
    }
    
    // Calculate checksum on cleaned fields
    const checksum = syncEngine.calculateChecksum(cleanedFields);
    
    // Build the final record data with proper ordering
    const recordData: RecordData = {
      fields: cleanedFields
    };
    
    // Only add relatedEntities if we have some
    if (Object.keys(relatedEntities).length > 0) {
      recordData.relatedEntities = relatedEntities;
    }
    
    // Add system fields at the end
    recordData.primaryKey = primaryKey;
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
      return externalizeConfig.includes(fieldName);
    } else {
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
    entityConfig: any
  ): Promise<string> {
    // Get configured extension for this field
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
   * 
   * @param parentRecord - Parent entity record
   * @param relatedConfig - Configuration for related entities to pull
   * @param syncEngine - Sync engine instance
   * @returns Promise resolving to map of entity names to related records
   * @private
   */
  private async pullRelatedEntities(
    parentRecord: any,
    relatedConfig: Record<string, RelatedEntityConfig>,
    syncEngine: SyncEngine,
    entityConfig: any,
    flags?: any
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
          const fieldsToExternalize = Array.isArray(config.externalizeFields) 
            ? config.externalizeFields 
            : Object.keys(config.externalizeFields);
          
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
                relatedEntities: config.relatedEntities
              }
            },
            syncEngine,
            flags
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
}