import fs from 'fs-extra';
import path from 'path';
import fastGlob from 'fast-glob';
import { BaseEntity, LogStatus, Metadata, UserInfo, CompositeKey } from '@memberjunction/core';
import { SyncEngine, RecordData } from '../lib/sync-engine';
import { loadEntityConfig, loadSyncConfig } from '../config';
import { FileBackupManager } from '../lib/file-backup-manager';
import { configManager } from '../lib/config-manager';
import { SQLLogger } from '../lib/sql-logger';
import { TransactionManager } from '../lib/transaction-manager';
import { JsonWriteHelper } from '../lib/json-write-helper';
import type { SqlLoggingSession, SQLServerDataProvider } from '@memberjunction/sqlserver-dataprovider';

export interface PushOptions {
  dir?: string;
  dryRun?: boolean;
  verbose?: boolean;
  noValidate?: boolean;
}

export interface PushCallbacks {
  onProgress?: (message: string) => void;
  onSuccess?: (message: string) => void;
  onError?: (message: string) => void;
  onWarn?: (message: string) => void;
  onLog?: (message: string) => void;
  onConfirm?: (message: string) => Promise<boolean>;
}

export interface PushResult {
  created: number;
  updated: number;
  unchanged: number;
  errors: number;
  warnings: string[];
  sqlLogPath?: string;
}

export interface EntityPushResult {
  created: number;
  updated: number;
  unchanged: number;
  errors: number;
}

export class PushService {
  private syncEngine: SyncEngine;
  private contextUser: UserInfo;
  private warnings: string[] = [];
  private processedRecords: Map<string, { filePath: string; arrayIndex?: number; lineNumber?: number }> = new Map();
  private syncConfig: any;
  
  constructor(syncEngine: SyncEngine, contextUser: UserInfo) {
    this.syncEngine = syncEngine;
    this.contextUser = contextUser;
  }
  
  async push(options: PushOptions, callbacks?: PushCallbacks): Promise<PushResult> {
    this.warnings = [];
    this.processedRecords.clear();
    
    const fileBackupManager = new FileBackupManager();
    
    // Load sync config for SQL logging settings and autoCreateMissingRecords flag
    // If dir option is specified, load from that directory, otherwise use original CWD
    const configDir = options.dir ? path.resolve(configManager.getOriginalCwd(), options.dir) : configManager.getOriginalCwd();
    this.syncConfig = await loadSyncConfig(configDir);
    
    if (options.verbose) {
      callbacks?.onLog?.(`Original working directory: ${configManager.getOriginalCwd()}`);
      callbacks?.onLog?.(`Config directory (with dir option): ${configDir}`);
      callbacks?.onLog?.(`Config file path: ${path.join(configDir, '.mj-sync.json')}`);
      callbacks?.onLog?.(`Full sync config loaded: ${JSON.stringify(this.syncConfig, null, 2)}`);
      callbacks?.onLog?.(`SQL logging config: ${JSON.stringify(this.syncConfig?.sqlLogging)}`);
    }
    
    const sqlLogger = new SQLLogger(this.syncConfig);
    const transactionManager = new TransactionManager(sqlLogger);
    
    if (options.verbose) {
      callbacks?.onLog?.(`SQLLogger enabled status: ${sqlLogger.enabled}`);
    }
    
    // Setup SQL logging session with the provider if enabled
    let sqlLoggingSession: SqlLoggingSession | null = null;
    
    try {
      // Initialize SQL logger if enabled and not dry-run
      if (sqlLogger.enabled && !options.dryRun) {
        const provider = Metadata.Provider as SQLServerDataProvider;
        
        if (options.verbose) {
          callbacks?.onLog?.(`SQL logging enabled: ${sqlLogger.enabled}`);
          callbacks?.onLog?.(`Provider type: ${provider?.constructor?.name || 'Unknown'}`);
          callbacks?.onLog?.(`Has CreateSqlLogger: ${typeof provider?.CreateSqlLogger === 'function'}`);
        }
        
        if (provider && typeof provider.CreateSqlLogger === 'function') {
          // Generate filename with timestamp
          const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
          const filename = this.syncConfig.sqlLogging?.formatAsMigration 
            ? `MetadataSync_Push_${timestamp}.sql`
            : `push_${timestamp}.sql`;
          
          // Use .sql-log-push directory in the config directory (where sync was initiated)
          const outputDir = path.join(configDir, this.syncConfig?.sqlLogging?.outputDirectory || './sql-log-push');
          const filepath = path.join(outputDir, filename);
          
          // Ensure the directory exists
          await fs.ensureDir(path.dirname(filepath));
          
          // Create the SQL logging session
          sqlLoggingSession = await provider.CreateSqlLogger(filepath, {
            formatAsMigration: this.syncConfig.sqlLogging?.formatAsMigration || false,
            description: 'MetadataSync push operation',
            statementTypes: "mutations",
            prettyPrint: true,
            filterPatterns: this.syncConfig.sqlLogging?.filterPatterns,
            filterType: this.syncConfig.sqlLogging?.filterType,
          });
          
          if (options.verbose) {
            callbacks?.onLog?.(`📝 SQL logging enabled: ${filepath}`);
          }
        } else {
          if (options.verbose) {
            callbacks?.onWarn?.('SQL logging requested but provider does not support it');
          }
        }
      }
      
      // Find entity directories to process
      // Note: If options.dir is specified, configDir already points to that directory
      // So we don't need to pass it as specificDir
      const entityDirs = this.findEntityDirectories(configDir, undefined, this.syncConfig?.directoryOrder);
      
      if (entityDirs.length === 0) {
        throw new Error('No entity directories found');
      }
      
      if (options.verbose) {
        callbacks?.onLog?.(`Found ${entityDirs.length} entity ${entityDirs.length === 1 ? 'directory' : 'directories'} to process`);
      }
      
      // Initialize file backup manager (unless in dry-run mode)
      if (!options.dryRun) {
        await fileBackupManager.initialize();
        if (options.verbose) {
          callbacks?.onLog?.('📁 File backup manager initialized');
        }
      }
      
      // Process each entity directory
      let totalCreated = 0;
      let totalUpdated = 0;
      let totalUnchanged = 0;
      let totalErrors = 0;
      
      // Begin transaction if not in dry-run mode
      if (!options.dryRun) {
        await transactionManager.beginTransaction();
      }
      
      try {
        for (const entityDir of entityDirs) {
          const entityConfig = await loadEntityConfig(entityDir);
          if (!entityConfig) {
            const warning = `Skipping ${entityDir} - no valid entity configuration`;
            this.warnings.push(warning);
            callbacks?.onWarn?.(warning);
            continue;
          }
          
          // Show folder with spinner at start
          const dirName = path.relative(process.cwd(), entityDir) || '.';
          callbacks?.onLog?.(`\n📁 ${dirName}:`);
          
          // Use onProgress for animated spinner if available
          if (callbacks?.onProgress) {
            callbacks.onProgress(`Processing ${dirName}...`);
          } else {
            callbacks?.onLog?.(`   ⏳ Processing...`);
          }
          
          if (options.verbose && callbacks?.onLog) {
            callbacks.onLog(`Processing ${entityConfig.entity} in ${entityDir}`);
          }
          
          const result = await this.processEntityDirectory(
            entityDir,
            entityConfig,
            options,
            fileBackupManager,
            callbacks,
            sqlLogger
          );
          
          // Stop the spinner if we were using onProgress
          if (callbacks?.onProgress && callbacks?.onSuccess) {
            callbacks.onSuccess(`Processed ${dirName}`);
          }
          
          // Show per-directory summary
          const dirTotal = result.created + result.updated + result.unchanged;
          if (dirTotal > 0 || result.errors > 0) {
            callbacks?.onLog?.(`   Total processed: ${dirTotal} unique records`);
            if (result.created > 0) {
              callbacks?.onLog?.(`   ✓ Created: ${result.created}`);
            }
            if (result.updated > 0) {
              callbacks?.onLog?.(`   ✓ Updated: ${result.updated}`);
            }
            if (result.unchanged > 0) {
              callbacks?.onLog?.(`   - Unchanged: ${result.unchanged}`);
            }
            if (result.errors > 0) {
              callbacks?.onLog?.(`   ✗ Errors: ${result.errors}`);
            }
          }
          
          totalCreated += result.created;
          totalUpdated += result.updated;
          totalUnchanged += result.unchanged;
          totalErrors += result.errors;
        }
        
        // Commit transaction if successful
        if (!options.dryRun && totalErrors === 0) {
          await transactionManager.commitTransaction();
        }
      } catch (error) {
        // Rollback transaction on error
        if (!options.dryRun) {
          await transactionManager.rollbackTransaction();
        }
        throw error;
      }
      
      // Commit file backups if successful and not in dry-run mode
      if (!options.dryRun && totalErrors === 0) {
        await fileBackupManager.cleanup();
        if (options.verbose) {
          callbacks?.onLog?.('✅ File backups committed');
        }
      }
      
      // Close SQL logging session if it was created
      let sqlLogPath: string | undefined;
      if (sqlLoggingSession) {
        sqlLogPath = sqlLoggingSession.filePath;
        await sqlLoggingSession.dispose();
        if (options.verbose) {
          callbacks?.onLog?.(`📝 SQL log written to: ${sqlLogPath}`);
        }
      }
      
      return {
        created: totalCreated,
        updated: totalUpdated,
        unchanged: totalUnchanged,
        errors: totalErrors,
        warnings: this.warnings,
        sqlLogPath
      };
      
    } catch (error) {
      // Rollback file backups on error
      if (!options.dryRun) {
        try {
          await fileBackupManager.rollback();
          callbacks?.onWarn?.('File backups rolled back due to error');
        } catch (rollbackError) {
          callbacks?.onWarn?.(`Failed to rollback file backups: ${rollbackError}`);
        }
      }
      
      // Close SQL logging session on error
      if (sqlLoggingSession) {
        try {
          await sqlLoggingSession.dispose();
        } catch (disposeError) {
          callbacks?.onWarn?.(`Failed to close SQL logging session: ${disposeError}`);
        }
      }
      
      throw error;
    }
  }
  
  private async processEntityDirectory(
    entityDir: string,
    entityConfig: any,
    options: PushOptions,
    fileBackupManager: FileBackupManager,
    callbacks?: PushCallbacks,
    sqlLogger?: SQLLogger
  ): Promise<EntityPushResult> {
    let created = 0;
    let updated = 0;
    let unchanged = 0;
    let errors = 0;
    
    // Find all JSON files in the directory
    const pattern = entityConfig.filePattern || '*.json';
    const files = await fastGlob(pattern, {
      cwd: entityDir,
      absolute: true,
      onlyFiles: true,
      dot: true,
      ignore: ['**/node_modules/**', '**/.mj-*.json']
    });
    
    if (options.verbose) {
      callbacks?.onLog?.(`Found ${files.length} files to process`);
    }
    
    // Process each file
    for (const filePath of files) {
      try {
        // Backup the file before any modifications (unless dry-run)
        if (!options.dryRun) {
          await fileBackupManager.backupFile(filePath);
        }
        
        const fileData = await fs.readJson(filePath);
        const records = Array.isArray(fileData) ? fileData : [fileData];
        const isArray = Array.isArray(fileData);
        
        for (let i = 0; i < records.length; i++) {
          const recordData = records[i];
          
          if (!this.isValidRecordData(recordData)) {
            callbacks?.onWarn?.(`Invalid record format in ${filePath}${isArray ? ` at index ${i}` : ''}`);
            errors++;
            continue;
          }
          
          try {
            // For arrays, work with a deep copy to avoid modifying the original
            const recordToProcess = isArray ? JSON.parse(JSON.stringify(recordData)) : recordData;
            
            const result = await this.processRecord(
              recordToProcess,
              entityConfig,
              entityDir,
              options,
              callbacks,
              filePath,
              isArray ? i : undefined
            );
            
            // Don't count duplicates in stats
            if (!result.isDuplicate) {
              if (result.status === 'created') created++;
              else if (result.status === 'updated') updated++;
              else if (result.status === 'unchanged') unchanged++;
            }
            
            // Add related entity stats
            created += result.relatedStats.created;
            updated += result.relatedStats.updated;
            unchanged += result.relatedStats.unchanged;
            
            // For arrays, update the original record's primaryKey, sync, and relatedEntities
            if (isArray) {
              // Update primaryKey if it exists (for new records)
              if (recordToProcess.primaryKey) {
                records[i].primaryKey = recordToProcess.primaryKey;
              }
              // Update sync metadata only if it was updated (dirty records only)
              if (recordToProcess.sync) {
                records[i].sync = recordToProcess.sync;
              }
              // Update relatedEntities to capture primaryKey/sync changes in nested entities
              if (recordToProcess.relatedEntities) {
                records[i].relatedEntities = recordToProcess.relatedEntities;
              }
            }
            
            // Record tracking is now handled inside processRecord
            
          } catch (recordError) {
            const errorMsg = `Error processing record in ${filePath}${isArray ? ` at index ${i}` : ''}: ${recordError}`;
            callbacks?.onError?.(errorMsg);
            errors++;
          }
        }
        
        // Write back the entire file if it's an array (after processing all records)
        if (isArray && !options.dryRun) {
          await JsonWriteHelper.writeOrderedRecordData(filePath, records);
        }
      } catch (fileError) {
        const errorMsg = `Error reading file ${filePath}: ${fileError}`;
        callbacks?.onError?.(errorMsg);
        errors++;
      }
    }
    
    return { created, updated, unchanged, errors };
  }
  
  private async processRecord(
    recordData: RecordData,
    entityConfig: any,
    entityDir: string,
    options: PushOptions,
    callbacks?: PushCallbacks,
    filePath?: string,
    arrayIndex?: number
  ): Promise<{ status: 'created' | 'updated' | 'unchanged' | 'error'; relatedStats: { created: number; updated: number; unchanged: number }; isDuplicate?: boolean }> {
    const metadata = new Metadata();
    
    // Get or create entity instance
    let entity = await metadata.GetEntityObject(entityConfig.entity, this.contextUser);
    if (!entity) {
      throw new Error(`Failed to create entity object for ${entityConfig.entity}`);
    }
    
    // Apply defaults from configuration
    const defaults = { ...entityConfig.defaults };
    
    // Build full record data - keep original values for file writing
    const originalFields = { ...recordData.fields };
    const fullData = {
      ...defaults,
      ...recordData.fields
    };
    
    // Process field values for database operations
    const processedData: Record<string, any> = {};
    for (const [fieldName, fieldValue] of Object.entries(fullData)) {
      const processedValue = await this.syncEngine.processFieldValue(
        fieldValue,
        entityDir,
        null, // parentRecord
        null  // rootRecord
      );
      processedData[fieldName] = processedValue;
    }
    
    // Check if record exists
    const primaryKey = recordData.primaryKey;
    let exists = false;
    let isNew = false;
    
    if (primaryKey && Object.keys(primaryKey).length > 0) {
      // Try to load existing record
      const compositeKey = new CompositeKey();
      compositeKey.LoadFromSimpleObject(primaryKey);
      exists = await entity.InnerLoad(compositeKey);
      
      // Check autoCreateMissingRecords flag if record not found
      if (!exists) {
        const autoCreate = this.syncConfig?.push?.autoCreateMissingRecords ?? false;
        const pkDisplay = Object.entries(primaryKey)
          .map(([key, value]) => `${key}=${value}`)
          .join(', ');
        
        if (!autoCreate) {
          const warning = `Record not found: ${entityConfig.entity} with primaryKey {${pkDisplay}}. To auto-create missing records, set push.autoCreateMissingRecords=true in .mj-sync.json`;
          this.warnings.push(warning);
          callbacks?.onWarn?.(warning);
          return { status: 'error', relatedStats: { created: 0, updated: 0, unchanged: 0 } };
        } else if (options.verbose) {
          callbacks?.onLog?.(`Auto-creating missing ${entityConfig.entity} record with primaryKey {${pkDisplay}}`);
        }
      }
    }
    
    if (options.dryRun) {
      if (exists) {
        callbacks?.onLog?.(`[DRY RUN] Would update ${entityConfig.entity} record`);
        return { status: 'updated', relatedStats: { created: 0, updated: 0, unchanged: 0 } };
      } else {
        callbacks?.onLog?.(`[DRY RUN] Would create ${entityConfig.entity} record`);
        return { status: 'created', relatedStats: { created: 0, updated: 0, unchanged: 0 } };
      }
    }
    
    if (!exists) {
      entity.NewRecord(); // make sure our record starts out fresh
      isNew = true;
      
      // UUID generation now happens automatically in BaseEntity.NewRecord()
      
      // Set primary key values for new records if provided, this is important for the auto-create logic
      if (primaryKey) {
        for (const [pkField, pkValue] of Object.entries(primaryKey)) {
          entity.Set(pkField, pkValue);
        }
      }
    }
    
    // Set field values
    for (const [fieldName, fieldValue] of Object.entries(processedData)) {
      entity.Set(fieldName, fieldValue);
    }

    // Handle related entities
    if (recordData.relatedEntities) {
      // Store related entities to process after parent save
      (entity as any).__pendingRelatedEntities = recordData.relatedEntities;
    }
    
    // Check if the record is actually dirty before considering it changed
    let isDirty = entity.Dirty;
    
    // Also check if file content has changed (for @file references)
    if (!isDirty && !isNew && recordData.sync) {
      const currentChecksum = await this.syncEngine.calculateChecksumWithFileContent(originalFields, entityDir);
      if (currentChecksum !== recordData.sync.checksum) {
        isDirty = true;
        if (options.verbose) {
          callbacks?.onLog?.(`📄 File content changed for ${entityConfig.entity} record (checksum mismatch)`);
        }
      }
    }
    
    // If updating an existing record that's dirty, show what changed
    if (!isNew && isDirty) {
      const changes = entity.GetChangesSinceLastSave();
      const changeKeys = Object.keys(changes);
      if (changeKeys.length > 0) {
        // Get primary key info for display
        const entityInfo = this.syncEngine.getEntityInfo(entityConfig.entity);
        const primaryKeyDisplay: string[] = [];
        if (entityInfo) {
          for (const pk of entityInfo.PrimaryKeys) {
            primaryKeyDisplay.push(`${pk.Name}: ${entity.Get(pk.Name)}`);
          }
        }
        
        callbacks?.onLog?.(`📝 Updating ${entityConfig.entity} record:`);
        if (primaryKeyDisplay.length > 0) {
          callbacks?.onLog?.(`   Primary Key: ${primaryKeyDisplay.join(', ')}`);
        }
        callbacks?.onLog?.(`   Changes:`);
        for (const fieldName of changeKeys) {
          const field = entity.GetFieldByName(fieldName);
          const oldValue = field ? field.OldValue : undefined;
          const newValue = (changes as any)[fieldName];
          callbacks?.onLog?.(`     ${fieldName}: ${this.formatFieldValue(oldValue)} → ${this.formatFieldValue(newValue)}`);
        }
      }
    }
    
    // Check for duplicate processing (but only for existing records that were loaded)
    let isDuplicate = false;
    if (!isNew && entity) {
      isDuplicate = this.checkAndTrackRecord(entityConfig.entity, entity, filePath, arrayIndex);
    }
    
    // Save the record (always call Save, but track if it was actually dirty)
    const saveResult = await entity.Save();
    
    if (!saveResult) {
      throw new Error(`Failed to save ${entityConfig.entity} record: ${entity.LatestResult?.Message || 'Unknown error'}`);
    }
    
    // Update primaryKey for new records
    if (isNew) {
      const entityInfo = this.syncEngine.getEntityInfo(entityConfig.entity);
      if (entityInfo) {
        const newPrimaryKey: Record<string, any> = {};
        for (const pk of entityInfo.PrimaryKeys) {
          newPrimaryKey[pk.Name] = entity.Get(pk.Name);
        }
        recordData.primaryKey = newPrimaryKey;
      }
      
      // Track the new record now that we have its primary key
      this.checkAndTrackRecord(entityConfig.entity, entity, filePath, arrayIndex);
    }
    
    // Only update sync metadata if the record was actually dirty (changed)
    if (isNew || isDirty) {
      recordData.sync = {
        lastModified: new Date().toISOString(),
        checksum: await this.syncEngine.calculateChecksumWithFileContent(originalFields, entityDir)
      };
      if (options.verbose) {
        callbacks?.onLog?.(`   ✓ Updated sync metadata (record was ${isNew ? 'new' : 'changed'})`);
      }
    } else if (options.verbose) {
      callbacks?.onLog?.(`   - Skipped sync metadata update (no changes detected)`);
    }
    
    // Restore original field values to preserve @ references
    recordData.fields = originalFields;
    
    // Write back to file only if it's a single record (not part of an array)
    if (filePath && arrayIndex === undefined && !options.dryRun) {
      await JsonWriteHelper.writeOrderedRecordData(filePath, recordData);
    }
    
    // Process related entities after parent save
    let relatedStats = { created: 0, updated: 0, unchanged: 0 };
    if (recordData.relatedEntities && !options.dryRun) {
      relatedStats = await this.processRelatedEntities(
        recordData.relatedEntities,
        entity,
        entity, // root is same as parent for top level
        entityDir,
        options,
        callbacks,
        undefined, // fileBackupManager
        1, // indentLevel
        filePath,
        arrayIndex
      );
    }
    
    // Store related stats on the result for propagation
    // Don't count duplicates in stats
    const status: 'created' | 'updated' | 'unchanged' = isDuplicate ? 'unchanged' : (isNew ? 'created' : (isDirty ? 'updated' : 'unchanged'));
    const result = {
      status,
      relatedStats,
      isDuplicate
    };
    
    // Return enhanced result with related stats
    return result;
  }
  
  private async processRelatedEntities(
    relatedEntities: Record<string, RecordData[]>,
    parentEntity: BaseEntity,
    rootEntity: BaseEntity,
    baseDir: string,
    options: PushOptions,
    callbacks?: PushCallbacks,
    fileBackupManager?: FileBackupManager,
    indentLevel: number = 1,
    parentFilePath?: string,
    parentArrayIndex?: number
  ): Promise<{ created: number; updated: number; unchanged: number }> {
    const indent = '  '.repeat(indentLevel);
    const stats = { created: 0, updated: 0, unchanged: 0 };
    
    for (const [entityName, records] of Object.entries(relatedEntities)) {
      if (options.verbose) {
        callbacks?.onLog?.(`${indent}↳ Processing ${records.length} related ${entityName} records`);
      }
      
      for (const relatedRecord of records) {
        try {
          // Load or create entity
          let entity = null;
          let isNew = false;
          
          if (relatedRecord.primaryKey) {
            entity = await this.syncEngine.loadEntity(entityName, relatedRecord.primaryKey);
            
            // Warn if record has primaryKey but wasn't found
            if (!entity) {
              const pkDisplay = Object.entries(relatedRecord.primaryKey)
                .map(([key, value]) => `${key}=${value}`)
                .join(', ');
              
              // Load sync config to check autoCreateMissingRecords setting
              const autoCreate = this.syncConfig?.push?.autoCreateMissingRecords ?? false;
              
              if (!autoCreate) {
                const fileRef = parentFilePath ? path.relative(configManager.getOriginalCwd(), parentFilePath) : 'unknown';
                const warning = `${indent}⚠️  Related record not found: ${entityName} with primaryKey {${pkDisplay}} at ${fileRef}`;
                this.warnings.push(warning);
                callbacks?.onWarn?.(warning);
                const warning2 = `${indent}   To auto-create missing records, set push.autoCreateMissingRecords=true in .mj-sync.json`;
                this.warnings.push(warning2);
                callbacks?.onWarn?.(warning2);
                
                // Skip this record
                continue;
              } else {
                if (options.verbose) {
                  callbacks?.onLog?.(`${indent}   Auto-creating missing related ${entityName} record with primaryKey {${pkDisplay}}`);
                }
              }
            }
          }
          
          if (!entity) {
            entity = await this.syncEngine.createEntityObject(entityName);
            entity.NewRecord();
            isNew = true;
            
            // Handle primary keys for new related entity records
            const entityInfo = this.syncEngine.getEntityInfo(entityName);
            if (entityInfo) {
              for (const pk of entityInfo.PrimaryKeys) {
                if (!pk.AutoIncrement) {
                  // Check if we have a value in primaryKey object
                  if (relatedRecord.primaryKey?.[pk.Name]) {
                    // User specified a primary key for new record, set it on entity directly
                    // Don't add to fields as it will be in primaryKey section
                    (entity as any)[pk.Name] = relatedRecord.primaryKey[pk.Name];
                    if (options.verbose) {
                      callbacks?.onLog?.(`${indent}  Using specified primary key ${pk.Name}: ${relatedRecord.primaryKey[pk.Name]}`);
                    }
                  }
                  // Note: BaseEntity.NewRecord() automatically generates UUIDs for uniqueidentifier primary keys
                }
              }
            }
          }
          
          // Apply fields with parent/root context
          for (const [field, value] of Object.entries(relatedRecord.fields)) {
            if (field in entity) {
              try {
                const processedValue = await this.syncEngine.processFieldValue(
                  value, 
                  baseDir, 
                  parentEntity, 
                  rootEntity
                );
                if (options.verbose) {
                  callbacks?.onLog?.(`${indent}  Setting ${field}: ${this.formatFieldValue(value)} -> ${this.formatFieldValue(processedValue)}`);
                }
                (entity as any)[field] = processedValue;
              } catch (error) {
                throw new Error(`Failed to process field '${field}' in ${entityName}: ${error}`);
              }
            } else {
              const warning = `${indent}  Field '${field}' does not exist on entity '${entityName}'`;
              this.warnings.push(warning);
              callbacks?.onWarn?.(warning);
            }
          }
          
          // Check for duplicate processing (but only for existing records that were loaded)
          let isDuplicate = false;
          if (!isNew && entity) {
            // Use parent file path for related entities since they're defined in the parent's file
            const relatedFilePath = parentFilePath || path.join(baseDir, 'unknown');
            isDuplicate = this.checkAndTrackRecord(entityName, entity, relatedFilePath, parentArrayIndex);
          }
          
          // Check if the record is dirty before saving
          let wasActuallyUpdated = false;
          
          // Check for file content changes for related entities
          if (!isNew && relatedRecord.sync) {
            const currentChecksum = await this.syncEngine.calculateChecksumWithFileContent(relatedRecord.fields, baseDir);
            if (currentChecksum !== relatedRecord.sync.checksum) {
              wasActuallyUpdated = true;
              if (options.verbose) {
                callbacks?.onLog?.(`${indent}📄 File content changed for related ${entityName} record (checksum mismatch)`);
              }
            }
          }
          
          if (!isNew && entity.Dirty) {
            // Record is dirty, get the changes
            const changes = entity.GetChangesSinceLastSave();
            const changeKeys = Object.keys(changes);
            if (changeKeys.length > 0) {
              wasActuallyUpdated = true;
              
              // Get primary key info for display
              const entityInfo = this.syncEngine.getEntityInfo(entityName);
              const primaryKeyDisplay: string[] = [];
              if (entityInfo) {
                for (const pk of entityInfo.PrimaryKeys) {
                  primaryKeyDisplay.push(`${pk.Name}: ${entity.Get(pk.Name)}`);
                }
              }
              
              callbacks?.onLog?.(''); // Add newline before update output
              callbacks?.onLog?.(`${indent}📝 Updating related ${entityName} record:`);
              if (primaryKeyDisplay.length > 0) {
                callbacks?.onLog?.(`${indent}   Primary Key: ${primaryKeyDisplay.join(', ')}`);
              }
              callbacks?.onLog?.(`${indent}   Changes:`);
              for (const fieldName of changeKeys) {
                const field = entity.GetFieldByName(fieldName);
                const oldValue = field ? field.OldValue : undefined;
                const newValue = (changes as any)[fieldName];
                callbacks?.onLog?.(`${indent}     ${fieldName}: ${this.formatFieldValue(oldValue)} → ${this.formatFieldValue(newValue)}`);
              }
            }
          } else if (isNew) {
            wasActuallyUpdated = true;
          }
          
          // Save the related entity
          const saved = await entity.Save();
          if (!saved) {
            const message = entity.LatestResult?.Message;
            if (message) {
              throw new Error(`Failed to save related ${entityName}: ${message}`);
            }
            
            const errors = entity.LatestResult?.Errors?.map(err => 
              typeof err === 'string' ? err : (err?.message || JSON.stringify(err))
            )?.join(', ') || 'Unknown error';
            throw new Error(`Failed to save related ${entityName}: ${errors}`);
          }
          
          // Update stats - don't count duplicates
          if (!isDuplicate) {
            if (isNew) {
              stats.created++;
            } else if (wasActuallyUpdated) {
              stats.updated++;
            } else {
              stats.unchanged++;
            }
          }
          
          if (options.verbose && wasActuallyUpdated) {
            callbacks?.onLog?.(`${indent}  ✓ ${isNew ? 'Created' : 'Updated'} ${entityName} record`);
          } else if (options.verbose && !wasActuallyUpdated) {
            callbacks?.onLog?.(`${indent}  - No changes to ${entityName} record`);
          }
          
          // Update the related record with primary key and sync metadata
          const entityInfo = this.syncEngine.getEntityInfo(entityName);
          if (entityInfo) {
            // Update primary key if new
            if (isNew) {
              relatedRecord.primaryKey = {};
              for (const pk of entityInfo.PrimaryKeys) {
                relatedRecord.primaryKey[pk.Name] = entity.Get(pk.Name);
              }
              
              // Track the new related entity now that we have its primary key
              const relatedFilePath = parentFilePath || path.join(baseDir, 'unknown');
              this.checkAndTrackRecord(entityName, entity, relatedFilePath, parentArrayIndex);
            }
            
            // Only update sync metadata if the record was actually changed
            if (isNew || wasActuallyUpdated) {
              relatedRecord.sync = {
                lastModified: new Date().toISOString(),
                checksum: await this.syncEngine.calculateChecksumWithFileContent(relatedRecord.fields, baseDir)
              };
              if (options.verbose) {
                callbacks?.onLog?.(`${indent}  ✓ Updated sync metadata for related ${entityName} (record was ${isNew ? 'new' : 'changed'})`);
              }
            } else if (options.verbose) {
              callbacks?.onLog?.(`${indent}  - Skipped sync metadata update for related ${entityName} (no changes detected)`);
            }
          }
          
          // Process nested related entities if any
          if (relatedRecord.relatedEntities) {
            const nestedStats = await this.processRelatedEntities(
              relatedRecord.relatedEntities,
              entity,
              rootEntity,
              baseDir,
              options,
              callbacks,
              fileBackupManager,
              indentLevel + 1,
              parentFilePath,
              parentArrayIndex
            );
            
            // Accumulate nested stats
            stats.created += nestedStats.created;
            stats.updated += nestedStats.updated;
            stats.unchanged += nestedStats.unchanged;
          }
        } catch (error) {
          throw new Error(`Failed to process related ${entityName}: ${error}`);
        }
      }
    }
    
    return stats;
  }
  
  private isValidRecordData(data: any): data is RecordData {
    return data && 
           typeof data === 'object' && 
           'fields' in data &&
           typeof data.fields === 'object';
  }
  
  
  private formatFieldValue(value: any, maxLength: number = 50): string {
    let strValue = JSON.stringify(value);
    strValue = strValue.trim();

    if (strValue.length > maxLength) {
      return strValue.substring(0, maxLength) + '...';
    }

    return strValue;
  }
  
  /**
   * Generate a unique tracking key for a record based on entity name and primary key values
   */
  private generateRecordKey(entityName: string, entity: BaseEntity): string {
    // Use the built-in CompositeKey ToURLSegment method
    const keySegment = entity.PrimaryKey.ToURLSegment();
    return `${entityName}|${keySegment}`;
  }
  
  /**
   * Check if a record has already been processed and warn if duplicate
   */
  private checkAndTrackRecord(
    entityName: string, 
    entity: BaseEntity, 
    filePath?: string,
    arrayIndex?: number,
    lineNumber?: number
  ): boolean {
    const recordKey = this.generateRecordKey(entityName, entity);
    
    const existing = this.processedRecords.get(recordKey);
    if (existing) {
      const primaryKeyDisplay = entity.EntityInfo?.PrimaryKeys
        .map(pk => `${pk.Name}: ${entity.Get(pk.Name)}`)
        .join(', ') || 'unknown';
      
      // Format file location with clickable link for VSCode
      // Create maps with just the line numbers we have
      const currentLineMap = lineNumber ? new Map([[arrayIndex || 0, lineNumber]]) : undefined;
      const originalLineMap = existing.lineNumber ? new Map([[existing.arrayIndex || 0, existing.lineNumber]]) : undefined;
      
      const currentLocation = this.formatFileLocation(filePath, arrayIndex, currentLineMap);
      const originalLocation = this.formatFileLocation(existing.filePath, existing.arrayIndex, originalLineMap);
      
      const warning = `⚠️  Duplicate record detected for ${entityName} (${primaryKeyDisplay})`;
      this.warnings.push(warning);
      const warning2 = `   Current location:  ${currentLocation}`;
      this.warnings.push(warning2);
      const warning3 = `   Original location: ${originalLocation}`;
      this.warnings.push(warning3);
      const warning4 = `   The duplicate update will proceed, but you should review your data for unintended duplicates.`;
      this.warnings.push(warning4);
      
      return true; // is duplicate
    }
    
    // Track the record with its source location
    this.processedRecords.set(recordKey, {
      filePath: filePath || 'unknown',
      arrayIndex,
      lineNumber
    });
    return false; // not duplicate
  }
  
  /**
   * Format file location with clickable link for VSCode
   */
  private formatFileLocation(filePath?: string, arrayIndex?: number, lineNumbers?: Map<number, number>): string {
    if (!filePath || filePath === 'unknown') {
      return 'unknown';
    }
    
    // Get absolute path for better VSCode integration
    const absolutePath = path.resolve(filePath);
    
    // Try to get actual line number from our tracking
    let lineNumber = 1;
    if (arrayIndex !== undefined && lineNumbers && lineNumbers.has(arrayIndex)) {
      lineNumber = lineNumbers.get(arrayIndex)!;
    } else if (arrayIndex !== undefined) {
      // Fallback estimation if we don't have actual line numbers
      lineNumber = 2 + (arrayIndex * 15);
    }
    
    // Create clickable file path for VSCode - format: file:line
    // VSCode will make this clickable in the terminal
    return `${absolutePath}:${lineNumber}`;
  }
  
  private findEntityDirectories(baseDir: string, specificDir?: string, directoryOrder?: string[]): string[] {
    const dirs: string[] = [];
    
    if (specificDir) {
      // Process specific directory
      const fullPath = path.resolve(baseDir, specificDir);
      if (fs.existsSync(fullPath) && fs.statSync(fullPath).isDirectory()) {
        // Check if this directory has an entity configuration
        const configPath = path.join(fullPath, '.mj-sync.json');
        if (fs.existsSync(configPath)) {
          try {
            const config = fs.readJsonSync(configPath);
            if (config.entity) {
              // It's an entity directory, add it
              dirs.push(fullPath);
            } else {
              // It's a container directory, search its subdirectories
              this.findEntityDirectoriesRecursive(fullPath, dirs);
            }
          } catch {
            // Invalid config, skip
          }
        }
      }
    } else {
      // Find all entity directories
      this.findEntityDirectoriesRecursive(baseDir, dirs);
    }
    
    // Apply directory ordering if specified
    if (directoryOrder && directoryOrder.length > 0 && !specificDir) {
      // Create a map of directory name to order index
      const orderMap = new Map<string, number>();
      directoryOrder.forEach((dir, index) => {
        orderMap.set(dir, index);
      });
      
      // Sort directories based on the order map
      dirs.sort((a, b) => {
        const nameA = path.basename(a);
        const nameB = path.basename(b);
        const orderA = orderMap.get(nameA) ?? Number.MAX_SAFE_INTEGER;
        const orderB = orderMap.get(nameB) ?? Number.MAX_SAFE_INTEGER;
        
        // If both have specified orders, use them
        if (orderA !== Number.MAX_SAFE_INTEGER || orderB !== Number.MAX_SAFE_INTEGER) {
          return orderA - orderB;
        }
        
        // Otherwise, maintain original order (stable sort)
        return 0;
      });
    }
    
    return dirs;
  }

  private findEntityDirectoriesRecursive(dir: string, dirs: string[]): void {
    const entries = fs.readdirSync(dir, { withFileTypes: true });
    
    for (const entry of entries) {
      if (entry.isDirectory() && !entry.name.startsWith('.') && entry.name !== 'node_modules') {
        const fullPath = path.join(dir, entry.name);
        const configPath = path.join(fullPath, '.mj-sync.json');
        
        if (fs.existsSync(configPath)) {
          try {
            const config = fs.readJsonSync(configPath);
            if (config.entity) {
              dirs.push(fullPath);
            }
          } catch {
            // Skip invalid config files
          }
        } else {
          // Recurse into subdirectories
          this.findEntityDirectoriesRecursive(fullPath, dirs);
        }
      }
    }
  }
}