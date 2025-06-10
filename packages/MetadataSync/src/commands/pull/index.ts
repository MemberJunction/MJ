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
import { RunView } from '@memberjunction/core';
import { getSystemUser, initializeProvider, cleanupProvider } from '../../lib/provider-utils';

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
  };
  
  async run(): Promise<void> {
    const { flags } = await this.parse(Pull);
    const spinner = ora();
    
    try {
      // Load MJ config
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
      
      // Find entity directory
      const entityDirs = await this.findEntityDirectories(flags.entity);
      
      if (entityDirs.length === 0) {
        this.error(`No directory found for entity "${flags.entity}". Run "mj-sync init" first.`);
      }
      
      let targetDir: string;
      if (entityDirs.length === 1) {
        targetDir = entityDirs[0];
      } else {
        // Multiple directories found, ask user
        targetDir = await select({
          message: `Multiple directories found for entity "${flags.entity}". Which one to use?`,
          choices: entityDirs.map(dir => ({ name: dir, value: dir }))
        });
      }
      
      const entityConfig = await loadEntityConfig(targetDir);
      if (!entityConfig) {
        this.error(`Invalid entity configuration in ${targetDir}`);
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
        ExtraFilter: filter
      }, getSystemUser());
      
      if (!result.Success) {
        this.error(`Failed to pull records: ${result.ErrorMessage}`);
      }
      
      spinner.succeed(`Found ${result.Results.length} records`);
      
      if (flags['dry-run']) {
        this.log(`\nDry run mode - would pull ${result.Results.length} records to ${targetDir}`);
        return;
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
            const recordData = await this.processRecordData(record, primaryKey, targetDir, entityConfig, syncEngine);
            allRecords.push(recordData);
            processed++;
            
            spinner.text = `Processing records (${processed}/${result.Results.length})`;
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
            await this.processRecord(record, primaryKey, targetDir, entityConfig, syncEngine);
            processed++;
            
            spinner.text = `Processing records (${processed}/${result.Results.length})`;
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
    
    await searchDirs(process.cwd());
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
    syncEngine: SyncEngine
  ): Promise<void> {
    const recordData = await this.processRecordData(record, primaryKey, targetDir, entityConfig, syncEngine);
    
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
    syncEngine: SyncEngine
  ): Promise<RecordData> {
    // Build record data
    const recordData: RecordData = {
      primaryKey: primaryKey,
      fields: {},
      sync: {
        lastModified: new Date().toISOString(),
        checksum: ''
      }
    };
    
    // Process fields
    for (const [fieldName, fieldValue] of Object.entries(record)) {
      // Skip primary key fields
      if (primaryKey[fieldName] !== undefined) {
        continue;
      }
      
      // Skip internal fields
      if (fieldName.startsWith('__mj_')) {
        continue;
      }
      
      // Check if this is an external file field
      if (await this.shouldExternalizeField(fieldName, fieldValue, entityConfig)) {
        const fileName = await this.createExternalFile(
          targetDir,
          primaryKey,
          fieldName,
          String(fieldValue)
        );
        recordData.fields[fieldName] = `@file:${fileName}`;
      } else {
        recordData.fields[fieldName] = fieldValue;
      }
    }
    
    // Pull related entities if configured
    if (entityConfig.pull?.relatedEntities) {
      recordData.relatedEntities = await this.pullRelatedEntities(
        record,
        entityConfig.pull.relatedEntities,
        syncEngine
      );
    }
    
    // Calculate checksum
    recordData.sync!.checksum = syncEngine.calculateChecksum(recordData.fields);
    
    return recordData;
  }
  
  /**
   * Determine if a field should be saved to an external file
   * 
   * Checks if a field contains substantial text content that would be better
   * stored in a separate file rather than inline in the JSON. Uses heuristics
   * based on field name and content length.
   * 
   * @param fieldName - Name of the field to check
   * @param fieldValue - Value of the field
   * @param entityConfig - Entity configuration (for future extension)
   * @returns Promise resolving to true if field should be externalized
   * @private
   */
  private async shouldExternalizeField(
    fieldName: string, 
    fieldValue: any,
    entityConfig: any
  ): Promise<boolean> {
    // Only externalize string fields with significant content
    if (typeof fieldValue !== 'string') {
      return false;
    }
    
    // Check if it's a known large text field
    const largeTextFields = ['Prompt', 'Template', 'Notes', 'Description', 
                           'Content', 'Body', 'Text', 'HTML', 'SQL'];
    
    if (largeTextFields.some(f => fieldName.toLowerCase().includes(f.toLowerCase()))) {
      // Only externalize if content is substantial (more than 100 chars or has newlines)
      return fieldValue.length > 100 || fieldValue.includes('\n');
    }
    
    return false;
  }
  
  /**
   * Create an external file for a field value
   * 
   * Saves large text content to a separate file and returns the filename.
   * Automatically determines appropriate file extension based on field name
   * and content type (e.g., .md for prompts, .html for templates).
   * 
   * @param targetDir - Directory to save the file
   * @param primaryKey - Primary key for filename generation
   * @param fieldName - Name of the field being externalized
   * @param content - Content to write to the file
   * @returns Promise resolving to the created filename
   * @private
   */
  private async createExternalFile(
    targetDir: string,
    primaryKey: Record<string, any>,
    fieldName: string,
    content: string
  ): Promise<string> {
    // Determine file extension based on field name and content
    let extension = '.txt';
    
    if (fieldName.toLowerCase().includes('prompt')) {
      extension = '.md';
    } else if (fieldName.toLowerCase().includes('template')) {
      if (content.includes('<html') || content.includes('<!DOCTYPE')) {
        extension = '.html';
      } else if (content.includes('{{') || content.includes('{%')) {
        extension = '.liquid';
      }
    } else if (fieldName.toLowerCase().includes('sql')) {
      extension = '.sql';
    } else if (fieldName.toLowerCase().includes('notes') || fieldName.toLowerCase().includes('description')) {
      extension = '.md';
    }
    
    const baseFileName = this.buildFileName(primaryKey, null).replace('.json', '');
    const fileName = `${baseFileName}.${fieldName.toLowerCase()}${extension}`;
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
        // It's a GUID, use first 8 chars
        return `${key.substring(0, 8)}.json`;
      }
      // Use the whole key if not too long
      if (key.length <= 50) {
        return `${key.replace(/[^a-zA-Z0-9-_]/g, '_')}.json`;
      }
    }
    
    // Multiple keys or numeric - create composite name
    return keys.map(k => String(k).replace(/[^a-zA-Z0-9-_]/g, '_')).join('-') + '.json';
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
    syncEngine: SyncEngine
  ): Promise<Record<string, RecordData[]>> {
    const relatedEntities: Record<string, RecordData[]> = {};
    
    for (const [key, config] of Object.entries(relatedConfig)) {
      try {
        // Get the parent's primary key value
        const parentKeyValue = parentRecord[config.foreignKey];
        if (!parentKeyValue) {
          continue; // Skip if parent doesn't have the foreign key field
        }
        
        // Build filter for related records
        let filter = `${config.foreignKey} = '${String(parentKeyValue).replace(/'/g, "''")}'`;
        if (config.filter) {
          filter += ` AND (${config.filter})`;
        }
        
        // Pull related records
        const rv = new RunView();
        const result = await rv.RunView({
          EntityName: config.entity,
          ExtraFilter: filter
        }, getSystemUser());
        
        if (!result.Success) {
          this.warn(`Failed to pull related ${config.entity}: ${result.ErrorMessage}`);
          continue;
        }
        
        // Process each related record
        const relatedRecords: RecordData[] = [];
        for (const relatedRecord of result.Results) {
          const recordData: RecordData = {
            fields: {}
          };
          
          // Process fields, omitting the foreign key since it will be set via @parent
          for (const [fieldName, fieldValue] of Object.entries(relatedRecord)) {
            // Skip internal fields
            if (fieldName.startsWith('__mj_')) {
              continue;
            }
            
            // Convert foreign key reference to @parent
            if (fieldName === config.foreignKey) {
              const parentFieldName = this.findParentField(parentRecord, parentKeyValue);
              if (parentFieldName) {
                recordData.fields[fieldName] = `@parent:${parentFieldName}`;
              }
              continue;
            }
            
            recordData.fields[fieldName] = fieldValue;
          }
          
          // Pull nested related entities if configured
          if (config.relatedEntities) {
            recordData.relatedEntities = await this.pullRelatedEntities(
              relatedRecord,
              config.relatedEntities,
              syncEngine
            );
          }
          
          relatedRecords.push(recordData);
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