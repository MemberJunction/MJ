import fs from 'fs-extra';
import path from 'path';
import fastGlob from 'fast-glob';
import { BaseEntity, Metadata, UserInfo, EntitySaveOptions } from '@memberjunction/core';
import { SyncEngine, RecordData } from '../lib/sync-engine';
import { loadEntityConfig, loadSyncConfig } from '../config';
import { FileBackupManager } from '../lib/file-backup-manager';
import { configManager } from '../lib/config-manager';
import { SQLLogger } from '../lib/sql-logger';
import { TransactionManager } from '../lib/transaction-manager';
import { JsonWriteHelper } from '../lib/json-write-helper';
import { RecordDependencyAnalyzer, FlattenedRecord } from '../lib/record-dependency-analyzer';
import { JsonPreprocessor } from '../lib/json-preprocessor';
import type { SqlLoggingSession, SQLServerDataProvider } from '@memberjunction/sqlserver-dataprovider';

// Configuration for parallel processing
const PARALLEL_BATCH_SIZE = 1; // Number of records to process in parallel at each dependency level
/// TEMPORARILY DISABLED PARALLEL BY SETTING TO 1 as we were having some issues

export interface PushOptions {
  dir?: string;
  dryRun?: boolean;
  verbose?: boolean;
  noValidate?: boolean;
  parallelBatchSize?: number; // Number of records to process in parallel (default: 10)
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
  deleted: number;
  skipped: number;
  errors: number;
  warnings: string[];
  sqlLogPath?: string;
}

export interface EntityPushResult {
  created: number;
  updated: number;
  unchanged: number;
  deleted: number;
  skipped: number;
  errors: number;
}

export class PushService {
  private syncEngine: SyncEngine;
  private contextUser: UserInfo;
  private warnings: string[] = [];
  private syncConfig: any;
  
  constructor(syncEngine: SyncEngine, contextUser: UserInfo) {
    this.syncEngine = syncEngine;
    this.contextUser = contextUser;
  }
  
  async push(options: PushOptions, callbacks?: PushCallbacks): Promise<PushResult> {
    this.warnings = [];
    
    const fileBackupManager = new FileBackupManager();
    
    // Load sync config for SQL logging settings and autoCreateMissingRecords flag
    // If dir option is specified, load from that directory, otherwise use original CWD
    const configDir = options.dir ? path.resolve(configManager.getOriginalCwd(), options.dir) : configManager.getOriginalCwd();
    this.syncConfig = await loadSyncConfig(configDir);
    
    // Display warnings for special flags that are enabled
    if (this.syncConfig?.push?.alwaysPush && !options.dryRun) {
      callbacks?.onWarn?.('\n⚡ WARNING: alwaysPush is enabled - ALL records will be saved to database regardless of changes\n');
    }
    if (this.syncConfig?.push?.autoCreateMissingRecords && !options.dryRun) {
      callbacks?.onWarn?.('\n🔧 WARNING: autoCreateMissingRecords is enabled - Missing records with primaryKey will be created\n');
    }
    
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
      let totalDeleted = 0;
      let totalSkipped = 0;
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
            totalSkipped++; // Count skipped directories
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
            callbacks
          );
          
          // Stop the spinner if we were using onProgress
          if (callbacks?.onProgress && callbacks?.onSuccess) {
            callbacks.onSuccess(`Processed ${dirName}`);
          }
          
          // Show per-directory summary
          const dirTotal = result.created + result.updated + result.unchanged + result.deleted + result.skipped;
          if (dirTotal > 0 || result.errors > 0) {
            callbacks?.onLog?.(`   Total processed: ${dirTotal} records`);
            if (result.created > 0) {
              callbacks?.onLog?.(`   ✓ Created: ${result.created}`);
            }
            if (result.updated > 0) {
              callbacks?.onLog?.(`   ✓ Updated: ${result.updated}`);
            }
            if (result.deleted > 0) {
              callbacks?.onLog?.(`   ✓ Deleted: ${result.deleted}`);
            }
            if (result.unchanged > 0) {
              callbacks?.onLog?.(`   - Unchanged: ${result.unchanged}`);
            }
            if (result.skipped > 0) {
              callbacks?.onLog?.(`   - Skipped: ${result.skipped}`);
            }
            if (result.errors > 0) {
              callbacks?.onLog?.(`   ✗ Errors: ${result.errors}`);
            }
          }
          
          totalCreated += result.created;
          totalUpdated += result.updated;
          totalUnchanged += result.unchanged;
          totalDeleted += result.deleted;
          totalSkipped += result.skipped;
          totalErrors += result.errors;
        }
        
        // Commit transaction if successful
        if (!options.dryRun && totalErrors === 0) {
          await transactionManager.commitTransaction();
        }
      } catch (error) {
        // Rollback transaction on error
        if (!options.dryRun) {
          callbacks?.onLog?.('\n⚠️  Rolling back database transaction due to error...');
          await transactionManager.rollbackTransaction();
          callbacks?.onLog?.('✓ Database transaction rolled back successfully\n');
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
        deleted: totalDeleted,
        skipped: totalSkipped,
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
    callbacks?: PushCallbacks
  ): Promise<EntityPushResult> {
    let created = 0;
    let updated = 0;
    let unchanged = 0;
    let deleted = 0;
    let skipped = 0;
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
        
        // Read the raw file data first
        const rawFileData = await fs.readJson(filePath);
        
        // Only preprocess if there are @include directives
        let fileData = rawFileData;
        const jsonString = JSON.stringify(rawFileData);
        const hasIncludes = jsonString.includes('"@include"') || jsonString.includes('"@include.');
        
        if (hasIncludes) {
          // Preprocess the JSON file to handle @include directives
          // Create a new preprocessor instance for each file to ensure clean state
          const jsonPreprocessor = new JsonPreprocessor();
          fileData = await jsonPreprocessor.processFile(filePath);
        }
        
        const records = Array.isArray(fileData) ? fileData : [fileData];
        const isArray = Array.isArray(fileData);
        
        // Analyze dependencies and get sorted records
        const analyzer = new RecordDependencyAnalyzer();
        const analysisResult = await analyzer.analyzeFileRecords(records, entityConfig.entity);
        
        if (analysisResult.circularDependencies.length > 0) {
          callbacks?.onWarn?.(`⚠️  Circular dependencies detected in ${filePath}`);
          for (const cycle of analysisResult.circularDependencies) {
            callbacks?.onWarn?.(`   Cycle: ${cycle.join(' → ')}`);
          }
        }
        
        if (options.verbose) {
          callbacks?.onLog?.(`   Analyzed ${analysisResult.sortedRecords.length} records (including nested)`);
        }
        
        // Create batch context for in-memory entity resolution
        // Note: While JavaScript is single-threaded, async operations can interleave.
        // Map operations themselves are atomic, but we ensure records are added to
        // the context AFTER successful save to maintain consistency.
        const batchContext = new Map<string, BaseEntity>();
        
        // Process records using dependency levels for parallel processing
        if (analysisResult.dependencyLevels && analysisResult.dependencyLevels.length > 0) {
          // Use parallel processing with dependency levels
          for (let levelIndex = 0; levelIndex < analysisResult.dependencyLevels.length; levelIndex++) {
            const level = analysisResult.dependencyLevels[levelIndex];
            
            if (options.verbose && level.length > 1) {
              callbacks?.onLog?.(`   Processing dependency level ${levelIndex} with ${level.length} records in parallel...`);
            }
            
            // Process records in this level in parallel batches
            const batchSize = options.parallelBatchSize || PARALLEL_BATCH_SIZE;
            for (let i = 0; i < level.length; i += batchSize) {
              const batch = level.slice(i, Math.min(i + batchSize, level.length));
              
              // Process batch in parallel
              const batchResults = await Promise.all(
                batch.map(async (flattenedRecord) => {
                  try {
                    const result = await this.processFlattenedRecord(
                      flattenedRecord,
                      entityDir,
                      options,
                      batchContext,
                      callbacks,
                      entityConfig
                    );
                    return { success: true, result };
                  } catch (error) {
                    // Return error instead of throwing to handle after Promise.all
                    return { success: false, error, record: flattenedRecord };
                  }
                })
              );
              
              // Process results and check for errors
              for (const batchResult of batchResults) {
                if (!batchResult.success) {
                  // Fail fast on first error with detailed logging
                  const err = batchResult.error as Error;
                  const rec = batchResult.record as FlattenedRecord;

                  // Log concise summary - detailed error was already logged by processFlattenedRecord
                  callbacks?.onLog?.(`\n❌ Processing failed for ${rec.entityName} at ${rec.path}`);
                  callbacks?.onLog?.(`   ${err.message}\n`);

                  // Throw concise error to trigger rollback
                  throw err;
                }
                
                // Update stats for successful results
                const result = batchResult.result!;
                if (result.isDuplicate) {
                  skipped++; // Count duplicates as skipped
                } else {
                  if (result.status === 'created') created++;
                  else if (result.status === 'updated') updated++;
                  else if (result.status === 'unchanged') unchanged++;
                  else if (result.status === 'deleted') deleted++;
                  else if (result.status === 'skipped') skipped++;
                  else if (result.status === 'error') errors++;
                }
              }
            }
          }
        } else {
          // Fallback to sequential processing if no dependency levels available
          for (const flattenedRecord of analysisResult.sortedRecords) {
            try {
              const result = await this.processFlattenedRecord(
                flattenedRecord,
                entityDir,
                options,
                batchContext,
                callbacks,
                entityConfig
              );
              
              // Update stats
              if (result.isDuplicate) {
                skipped++; // Count duplicates as skipped
              } else {
                if (result.status === 'created') created++;
                else if (result.status === 'updated') updated++;
                else if (result.status === 'unchanged') unchanged++;
                else if (result.status === 'deleted') deleted++;
                else if (result.status === 'skipped') skipped++;
                else if (result.status === 'error') errors++;
              }
            } catch (recordError) {
              const errorMsg = `Error processing ${flattenedRecord.entityName} record at ${flattenedRecord.path}: ${recordError}`;
              callbacks?.onError?.(errorMsg);
              errors++;
            }
          }
        }
        
        // Write back to file (handles both single records and arrays)
        if (!options.dryRun) {
          if (isArray) {
            await JsonWriteHelper.writeOrderedRecordData(filePath, records);
          } else {
            // For single record files, write back the single record
            await JsonWriteHelper.writeOrderedRecordData(filePath, records[0]);
          }
        }
      } catch (fileError) {
        // Error details already logged by lower-level handlers, just re-throw
        throw fileError;
      }
    }
    
    return { created, updated, unchanged, deleted, skipped, errors };
  }
  
  private async processFlattenedRecord(
    flattenedRecord: FlattenedRecord,
    entityDir: string,
    options: PushOptions,
    batchContext: Map<string, BaseEntity>,
    callbacks?: PushCallbacks,
    entityConfig?: any
  ): Promise<{ status: 'created' | 'updated' | 'unchanged' | 'error' | 'deleted' | 'skipped'; isDuplicate?: boolean }> {
    const metadata = new Metadata();
    const { record, entityName, parentContext, id: recordId } = flattenedRecord;
    
    // Check if this record has a deleteRecord directive
    if (record.deleteRecord && record.deleteRecord.delete === true) {
      return await this.processDeleteRecord(flattenedRecord, entityDir, options, callbacks);
    }
    
    // Use the unique record ID from the flattened record for batch context
    // This ensures we can properly find parent entities even when they're new
    const lookupKey = recordId;
    
    // Check if already in batch context
    let entity = batchContext.get(lookupKey);
    if (entity) {
      // Already processed
      return { status: 'unchanged', isDuplicate: true };
    }
    
    // Get or create entity instance
    entity = await metadata.GetEntityObject(entityName, this.contextUser);
    if (!entity) {
      throw new Error(`Failed to create entity object for ${entityName}`);
    }
    
    // Check if record exists
    const primaryKey = record.primaryKey;
    let exists = false;
    let isNew = false;
    
    if (primaryKey && Object.keys(primaryKey).length > 0) {
      // First check if the record exists using the sync engine's loadEntity method
      // This avoids the "Error in BaseEntity.Load" message for missing records
      const existingEntity = await this.syncEngine.loadEntity(entityName, primaryKey);
      
      if (existingEntity) {
        // Record exists, use the loaded entity
        entity = existingEntity;
        exists = true;
      } else {
        // Record doesn't exist in database
        const autoCreate = this.syncConfig?.push?.autoCreateMissingRecords ?? false;
        const pkDisplay = Object.entries(primaryKey)
          .map(([key, value]) => `${key}=${value}`)
          .join(', ');
        
        if (!autoCreate) {
          const warning = `Record not found: ${entityName} with primaryKey {${pkDisplay}}. To auto-create missing records, set push.autoCreateMissingRecords=true in .mj-sync.json`;
          this.warnings.push(warning);
          callbacks?.onWarn?.(warning);
          return { status: 'error', isDuplicate: false }; // This will be counted as error, not skipped
        } else {
          // Log that we're creating the missing record
          if (options.verbose) {
            callbacks?.onLog?.(`📝 Creating missing ${entityName} record with primaryKey {${pkDisplay}}`);
          }
        }
      }
    }
    
    if (!exists) {
      entity.NewRecord();
      isNew = true;

      // Set primary key values for new records if provided
      if (primaryKey) {
        for (const [pkField, pkValue] of Object.entries(primaryKey)) {
          entity.Set(pkField, pkValue);
        }
      }
    }

    // Apply defaults if entityConfig is provided
    if (entityConfig) {
      const defaults = await this.syncEngine.buildDefaults(flattenedRecord.path, entityConfig);

      // Apply defaults only to fields not explicitly set in record.fields
      for (const [field, value] of Object.entries(defaults)) {
        if (!(field in record.fields) && field in entity) {
          entity.Set(field, value);
        }
      }
    }

    // Store original field values to preserve @ references
    const originalFields = { ...record.fields };
    
    // Get parent entity from context if available
    let parentEntity: BaseEntity | null = null;
    if (parentContext) {
      // Find the parent's flattened record ID
      // The parent record was flattened before this child, so it should have a lower ID number
      const parentRecordId = flattenedRecord.dependencies.values().next().value;
      if (parentRecordId) {
        parentEntity = batchContext.get(parentRecordId) || null;
      }
      
      if (!parentEntity) {
        // Parent should have been processed before child due to dependency ordering
        throw new Error(`Parent entity not found in batch context for ${entityName}. Parent dependencies: ${Array.from(flattenedRecord.dependencies).join(', ')}`);
      }
    }
    
    // Process field values with parent context and batch context
    // Process each field with better error reporting
    for (const [fieldName, fieldValue] of Object.entries(record.fields)) {
      try {
        const processedValue = await this.syncEngine.processFieldValue(
          fieldValue,
          entityDir,
          parentEntity,
          null, // rootRecord
          0,
          batchContext // Pass batch context for lookups
        );
        entity.Set(fieldName, processedValue);
      } catch (fieldError: any) {
        // Enhanced error reporting for field processing failures
        const primaryKeyInfo = record.primaryKey ? JSON.stringify(record.primaryKey) : 'NEW';

        // Helper to log to both console and callbacks
        const logError = (msg: string) => {
          console.error(msg);
          callbacks?.onLog?.(msg);
        };

        // Check if this is a lookup failure
        if (fieldError.message?.includes('Lookup failed:')) {
          logError(`\n❌ LOOKUP FAILURE in ${entityName} (${primaryKeyInfo})`);
          logError(`   Field: ${fieldName}`);
          logError(`   Value: ${fieldValue}`);
          logError(`   Error: ${fieldError.message}`);
          logError(`   Tip: Check if the referenced record exists in the target entity\n`);
        } else if (fieldError.message?.includes('Entity not found:')) {
          logError(`\n❌ ENTITY NOT FOUND in ${entityName} (${primaryKeyInfo})`);
          logError(`   Field: ${fieldName}`);
          logError(`   Value: ${fieldValue}`);
          logError(`   Error: ${fieldError.message}`);
          logError(`   Tip: Check if the entity name is spelled correctly\n`);
        } else if (fieldError.message?.includes('Field') && fieldError.message?.includes('not found')) {
          logError(`\n❌ FIELD NOT FOUND in ${entityName} (${primaryKeyInfo})`);
          logError(`   Field: ${fieldName}`);
          logError(`   Value: ${fieldValue}`);
          logError(`   Error: ${fieldError.message}`);
          logError(`   Tip: Check if the field name exists in the target entity\n`);
        } else if (fieldError.message?.includes('File not found:')) {
          logError(`\n❌ FILE NOT FOUND in ${entityName} (${primaryKeyInfo})`);
          logError(`   Field: ${fieldName}`);
          logError(`   Value: ${fieldValue}`);
          logError(`   Error: ${fieldError.message}`);
          logError(`   Tip: Check if the file path is correct relative to ${entityDir}\n`);
        } else {
          logError(`\n❌ FIELD PROCESSING ERROR in ${entityName} (${primaryKeyInfo})`);
          logError(`   Field: ${fieldName}`);
          logError(`   Value: ${fieldValue}`);
          logError(`   Error: ${fieldError.message}\n`);
        }

        // Re-throw with enhanced context
        throw new Error(`Failed to process field '${fieldName}' in ${entityName}: ${fieldError.message}`);
      }
    }
    
    // Check if the record is actually dirty before considering it changed
    let isDirty = entity.Dirty;
    
    // Force dirty state if alwaysPush is enabled
    const alwaysPush = this.syncConfig?.push?.alwaysPush ?? false;
    if (alwaysPush && !isNew) {
      isDirty = true;
    }
    
    // Also check if file content has changed (for @file references)
    if (!isDirty && !isNew && record.sync) {
      const currentChecksum = await this.syncEngine.calculateChecksumWithFileContent(originalFields, entityDir);
      if (currentChecksum !== record.sync.checksum) {
        isDirty = true;
        if (options.verbose) {
          callbacks?.onLog?.(`📄 File content changed for ${entityName} record (checksum mismatch)`);
        }
      }
    }
    
    if (options.dryRun) {
      if (exists) {
        callbacks?.onLog?.(`[DRY RUN] Would update ${entityName} record`);
        return { status: 'updated' };
      } else {
        callbacks?.onLog?.(`[DRY RUN] Would create ${entityName} record`);
        return { status: 'created' };
      }
    }
    
    // If updating an existing record that's dirty, show what changed
    if (!isNew && isDirty) {
      const changes = entity.GetChangesSinceLastSave();
      const changeKeys = Object.keys(changes);
      if (changeKeys.length > 0) {
        // Get primary key info for display
        const entityInfo = this.syncEngine.getEntityInfo(entityName);
        const primaryKeyDisplay: string[] = [];
        if (entityInfo) {
          for (const pk of entityInfo.PrimaryKeys) {
            primaryKeyDisplay.push(`${pk.Name}: ${entity.Get(pk.Name)}`);
          }
        }
        
        callbacks?.onLog?.(`📝 Updating ${entityName} record:`);
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
    
    // Save the record with detailed error logging
    const recordName = entity.Get('Name');
    const entityRecordId = entity.Get('ID');
    
    let saveResult;
    try {
      // Pass IgnoreDirtyState option when alwaysPush is enabled
      const saveOptions = alwaysPush ? { IgnoreDirtyState: true } : undefined;
      saveResult = await entity.Save(saveOptions);
    } catch (saveError: any) {
      // Helper to log to both console and callbacks
      const logError = (msg: string) => {
        console.error(msg);
        callbacks?.onLog?.(msg);
      };

      logError(`\n❌ SAVE EXCEPTION for ${entityName}`);
      logError(`   Record ID: ${entityRecordId || 'NEW'}`);
      logError(`   Record Name: ${recordName || 'N/A'}`);
      logError(`   File Path: ${flattenedRecord.path}`);
      logError(`   Error: ${saveError.message || saveError}`);

      // Check for specific error patterns
      if (saveError.message?.includes('Cannot insert the value NULL')) {
        logError(`   Tip: A required field is NULL. Check the entity's required fields.`);
      } else if (saveError.message?.includes('FOREIGN KEY constraint')) {
        logError(`   Tip: Foreign key constraint violation. Check that referenced records exist.`);
      } else if (saveError.message?.includes('duplicate key')) {
        logError(`   Tip: Duplicate key violation. A record with these values already exists.`);
      } else if (saveError.message?.includes('Incorrect syntax')) {
        logError(`   Tip: SQL syntax error. Check for special characters in field values.`);
      }

      // Log problematic field values for debugging
      logError(`\n   Failed entity field values:`);
      for (const field of entity.Fields) {
        const value = entity.Get(field.Name);
        if (value !== null && value !== undefined) {
          const displayValue = typeof value === 'string' && value.length > 100
            ? value.substring(0, 100) + '...'
            : value;
          logError(`     ${field.Name}: ${displayValue}`);
        }
      }
      logError(''); // Empty line for readability
      throw saveError;
    }
    
    if (!saveResult) {
      // Helper to log to both console and callbacks
      const logError = (msg: string) => {
        console.error(msg);
        callbacks?.onLog?.(msg);
      };

      logError(`\n❌ SAVE RETURNED FALSE for ${entityName}`);
      logError(`   Record ID: ${entityRecordId || 'NEW'}`);
      logError(`   Record Name: ${recordName || 'N/A'}`);
      logError(`   File Path: ${flattenedRecord.path}`);

      // Log the LatestResult for debugging
      if (entity.LatestResult) {
        if (entity.LatestResult.CompleteMessage) {
          logError(`   Database Message: ${entity.LatestResult.CompleteMessage}`);
        }
        if (entity.LatestResult.Errors && entity.LatestResult.Errors.length > 0) {
          logError(`   Errors:`);
          entity.LatestResult.Errors.forEach((err: any, idx: number) => {
            const errorMsg = typeof err === 'string' ? err : (err?.message || JSON.stringify(err));
            logError(`     ${idx + 1}. ${errorMsg}`);
          });
        }
        if ((entity.LatestResult as any).SQL) {
          // Don't log the full SQL as it might be huge, just indicate it's available
          logError(`   SQL Statement: [Available - check entity.LatestResult.SQL if needed]`);
        }
      }

      // Log field values that might be problematic
      logError(`\n   Entity field values:`);
      for (const field of entity.Fields) {
        const value = entity.Get(field.Name);
        if (value !== null && value !== undefined) {
          const displayValue = typeof value === 'string' && value.length > 100
            ? value.substring(0, 100) + '...'
            : value;
          logError(`     ${field.Name}: ${displayValue}`);
        }
      }
      logError(''); // Empty line for readability
      // Build detailed error information
      const entityInfo = this.syncEngine.getEntityInfo(entityName);
      const primaryKeyInfo: string[] = [];
      const fieldInfo: string[] = [];
      
      // Collect primary key information
      if (entityInfo) {
        for (const pk of entityInfo.PrimaryKeys) {
          const pkValue = entity.Get(pk.Name);
          primaryKeyInfo.push(`${pk.Name}=${this.formatFieldValue(pkValue)}`);
        }
      }
      
      // Collect field values that were being saved
      for (const [fieldName, fieldValue] of Object.entries(record.fields)) {
        const processedValue = entity.Get(fieldName);
        fieldInfo.push(`${fieldName}=${this.formatFieldValue(processedValue)}`);
      }
      
      // Get the actual error details from the entity
      const errorMessage = entity.LatestResult?.CompleteMessage || 'Unknown error';
      const errorDetails = entity.LatestResult?.Errors?.map(err => 
        typeof err === 'string' ? err : (err?.message || JSON.stringify(err))
      )?.join(', ') || '';
      
      // Log detailed error information
      callbacks?.onError?.(`\n❌ FATAL ERROR: Failed to save ${entityName} record`);
      callbacks?.onError?.(`   Entity: ${entityName}`);
      if (primaryKeyInfo.length > 0) {
        callbacks?.onError?.(`   Primary Key: {${primaryKeyInfo.join(', ')}}`);
      }
      callbacks?.onError?.(`   Record Path: ${flattenedRecord.path}`);
      callbacks?.onError?.(`   Is New Record: ${isNew}`);
      callbacks?.onError?.(`   Field Values Being Saved:`);
      for (const field of fieldInfo) {
        callbacks?.onError?.(`     - ${field}`);
      }
      callbacks?.onError?.(`   SQL Error: ${errorMessage}`);
      if (errorDetails) {
        callbacks?.onError?.(`   Additional Details: ${errorDetails}`);
      }
      
      // Check for common issues
      if (errorMessage.includes('conversion failed') || errorMessage.includes('GUID')) {
        callbacks?.onError?.(`   ⚠️  This appears to be a GUID/UUID format error. Check that all ID fields contain valid GUIDs.`);
      }
      if (errorMessage.includes('transaction')) {
        callbacks?.onError?.(`   ⚠️  Transaction error detected. The database transaction may be corrupted.`);
      }
      
      // Throw error to trigger rollback and stop processing
      throw new Error(`Failed to save ${entityName} record at ${flattenedRecord.path}: ${errorMessage}`);
    }
    
    // Add to batch context AFTER save so it has an ID for child @parent:ID references
    // Use the recordId (lookupKey) as the key so child records can find this parent
    batchContext.set(lookupKey, entity);
    
    // Update primaryKey for new records
    if (isNew) {
      const entityInfo = this.syncEngine.getEntityInfo(entityName);
      if (entityInfo) {
        const newPrimaryKey: Record<string, any> = {};
        for (const pk of entityInfo.PrimaryKeys) {
          newPrimaryKey[pk.Name] = entity.Get(pk.Name);
        }
        record.primaryKey = newPrimaryKey;
      }
    }
    
    // Only update sync metadata if the record was actually dirty (changed)
    if (isNew || isDirty) {
      record.sync = {
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
    record.fields = originalFields;
    
    return { 
      status: isNew ? 'created' : (isDirty ? 'updated' : 'unchanged'),
      isDuplicate: false
    };
  }
  
  private formatFieldValue(value: any): string {
    if (value === null || value === undefined) return 'null';
    if (typeof value === 'string') {
      // Truncate long strings and show quotes
      if (value.length > 50) {
        return `"${value.substring(0, 47)}..."`;
      }
      return `"${value}"`;
    }
    if (typeof value === 'object') {
      const str = JSON.stringify(value);
      return str.length > 50 ? `"${str.substring(0, 47)}..."` : `"${str}"`;
    }
    return String(value);
  }
  
  private async processDeleteRecord(
    flattenedRecord: FlattenedRecord,
    _entityDir: string,
    options: PushOptions,
    callbacks?: PushCallbacks
  ): Promise<{ status: 'deleted' | 'skipped' | 'unchanged'; isDuplicate?: boolean }> {
    const { record, entityName } = flattenedRecord;
    
    // Validate that we have a primary key for deletion
    if (!record.primaryKey || Object.keys(record.primaryKey).length === 0) {
      throw new Error(`Cannot delete ${entityName} record without primaryKey. Please specify primaryKey fields.`);
    }
    
    // Check if the deletion has already been processed
    if (record.deleteRecord?.deletedAt) {
      if (options.verbose) {
        callbacks?.onLog?.(`   ℹ️  Record already deleted on ${record.deleteRecord.deletedAt}`);
      }
      // Return unchanged since the record is already in the desired state (deleted)
      return { status: 'unchanged', isDuplicate: false };
    }
    
    // Load the entity to verify it exists
    const existingEntity = await this.syncEngine.loadEntity(entityName, record.primaryKey);
    
    if (!existingEntity) {
      const pkDisplay = Object.entries(record.primaryKey)
        .map(([key, value]) => `${key}=${value}`)
        .join(', ');
      
      const warning = `Record not found for deletion: ${entityName} with primaryKey {${pkDisplay}}`;
      this.warnings.push(warning);
      callbacks?.onWarn?.(warning);
      
      // Mark as deleted anyway since it doesn't exist
      if (!record.deleteRecord) {
        record.deleteRecord = { delete: true };
      }
      record.deleteRecord.deletedAt = undefined; // Indicate it was not found
      record.deleteRecord.notFound = true;
      
      return { status: 'skipped', isDuplicate: false };
    }
    
    // Log the deletion
    const entityInfo = this.syncEngine.getEntityInfo(entityName);
    const primaryKeyDisplay: string[] = [];
    if (entityInfo) {
      for (const pk of entityInfo.PrimaryKeys) {
        primaryKeyDisplay.push(`${pk.Name}: ${existingEntity.Get(pk.Name)}`);
      }
    }
    
    callbacks?.onLog?.(`🗑️  Deleting ${entityName} record:`);
    if (primaryKeyDisplay.length > 0) {
      callbacks?.onLog?.(`   Primary Key: ${primaryKeyDisplay.join(', ')}`);
    }
    
    // Additional info if available
    const recordName = existingEntity.Get('Name');
    if (recordName) {
      callbacks?.onLog?.(`   Name: ${recordName}`);
    }
    
    if (options.dryRun) {
      callbacks?.onLog?.(`[DRY RUN] Would delete ${entityName} record`);
      return { status: 'deleted', isDuplicate: false };
    }
    
    // Delete the record
    try {
      const deleteResult = await existingEntity.Delete();
      
      if (!deleteResult) {
        // Check the LatestResult for error details
        const errorMessage = existingEntity.LatestResult?.CompleteMessage || 'Unknown error';
        const errorDetails = existingEntity.LatestResult?.Errors?.map(err => 
          typeof err === 'string' ? err : (err?.message || JSON.stringify(err))
        )?.join(', ') || '';
        
        callbacks?.onError?.(`\n❌ Failed to delete ${entityName} record`);
        callbacks?.onError?.(`   Primary Key: {${primaryKeyDisplay.join(', ')}}`);
        callbacks?.onError?.(`   Error: ${errorMessage}`);
        if (errorDetails) {
          callbacks?.onError?.(`   Details: ${errorDetails}`);
        }
        
        throw new Error(`Failed to delete ${entityName} record: ${errorMessage}`);
      }
      
      // Update the deleteRecord section with deletedAt timestamp
      if (!record.deleteRecord) {
        record.deleteRecord = { delete: true };
      }
      record.deleteRecord.deletedAt = new Date().toISOString();
      
      // Remove notFound flag if it exists since we successfully found and deleted the record
      if (record.deleteRecord.notFound) {
        delete record.deleteRecord.notFound;
      }
      
      if (options.verbose) {
        callbacks?.onLog?.(`   ✓ Successfully deleted ${entityName} record`);
      }
      
      return { status: 'deleted', isDuplicate: false };
      
    } catch (deleteError: any) {
      console.error(`\n❌ DELETE EXCEPTION for ${entityName}`);
      console.error(`   Primary Key: {${primaryKeyDisplay.join(', ')}}`);
      console.error(`   Error: ${deleteError.message || deleteError}`);
      
      // Check for specific error patterns
      if (deleteError.message?.includes('FOREIGN KEY constraint')) {
        console.error(`   Tip: This record is referenced by other records and cannot be deleted.`);
        console.error(`   Consider deleting dependent records first.`);
      } else if (deleteError.message?.includes('permission')) {
        console.error(`   Tip: You may not have permission to delete this record.`);
      }
      
      throw deleteError;
    }
  }
  
  private _buildBatchContextKey(entityName: string, record: RecordData): string {
    // Build a unique key for the batch context based on entity name and identifying fields
    const keyParts = [entityName];
    
    // Use primary key if available
    if (record.primaryKey) {
      for (const [field, value] of Object.entries(record.primaryKey)) {
        keyParts.push(`${field}=${value}`);
      }
    } else {
      // Use a combination of important fields as fallback
      const identifyingFields = ['Name', 'ID', 'Code', 'Email'];
      for (const field of identifyingFields) {
        if (record.fields[field]) {
          keyParts.push(`${field}=${record.fields[field]}`);
        }
      }
    }
    
    return keyParts.join('|');
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