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
      const entityDirs = this.findEntityDirectories(configDir);
      
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
          
          if (options.verbose) {
            callbacks?.onLog?.(`\nProcessing ${entityConfig.entity} in ${entityDir}`);
          }
          
          const result = await this.processEntityDirectory(
            entityDir,
            entityConfig,
            options,
            fileBackupManager,
            callbacks,
            sqlLogger
          );
          
          // Show per-directory summary
          const dirName = path.relative(process.cwd(), entityDir) || '.';
          const dirTotal = result.created + result.updated + result.unchanged;
          if (dirTotal > 0 || result.errors > 0) {
            callbacks?.onLog?.(`\n📁 ${dirName}:`);
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
            
            if (result === 'created') created++;
            else if (result === 'updated') updated++;
            else if (result === 'unchanged') unchanged++;
            
            // For arrays, update the original record's primaryKey and sync only
            if (isArray) {
              // Update primaryKey if it exists (for new records)
              if (recordToProcess.primaryKey) {
                records[i].primaryKey = recordToProcess.primaryKey;
              }
              // Update sync metadata only if it was updated (dirty records only)
              if (recordToProcess.sync) {
                records[i].sync = recordToProcess.sync;
              }
            }
            
            // Track processed record
            const recordKey = this.getRecordKey(recordData, entityConfig.entity);
            this.processedRecords.set(recordKey, {
              filePath,
              arrayIndex: isArray ? i : undefined,
              lineNumber: i + 1 // Simple line number approximation
            });
            
          } catch (recordError) {
            const errorMsg = `Error processing record in ${filePath}${isArray ? ` at index ${i}` : ''}: ${recordError}`;
            callbacks?.onError?.(errorMsg);
            errors++;
          }
        }
        
        // Write back the entire file if it's an array (after processing all records)
        if (isArray && !options.dryRun) {
          await fs.writeJson(filePath, records, { spaces: 2 });
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
  ): Promise<'created' | 'updated' | 'unchanged' | 'error'> {
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
          return 'error';
        } else if (options.verbose) {
          callbacks?.onLog?.(`Auto-creating missing ${entityConfig.entity} record with primaryKey {${pkDisplay}}`);
        }
      }
    }
    
    if (options.dryRun) {
      if (exists) {
        callbacks?.onLog?.(`[DRY RUN] Would update ${entityConfig.entity} record`);
        return 'updated';
      } else {
        callbacks?.onLog?.(`[DRY RUN] Would create ${entityConfig.entity} record`);
        return 'created';
      }
    }
    
    if (!exists) {
      entity.NewRecord(); // make sure our record starts out fresh
      isNew = true;
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
    const isDirty = entity.Dirty;
    
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
    }
    
    // Only update sync metadata if the record was actually dirty (changed)
    if (isNew || isDirty) {
      recordData.sync = {
        lastModified: new Date().toISOString(),
        checksum: this.syncEngine.calculateChecksum(originalFields)
      };
    }
    
    // Restore original field values to preserve @ references
    recordData.fields = originalFields;
    
    // Write back to file only if it's a single record (not part of an array)
    if (filePath && arrayIndex === undefined && !options.dryRun) {
      await fs.writeJson(filePath, recordData, { spaces: 2 });
    }
    
    // Process related entities after parent save
    if (recordData.relatedEntities) {
      await this.processRelatedEntities(
        entity,
        recordData.relatedEntities,
        entityDir,
        options,
        callbacks
      );
    }
    
    // Return the actual status based on whether the record was dirty
    if (isNew) {
      return 'created';
    } else if (isDirty) {
      return 'updated';
    } else {
      return 'unchanged';
    }
  }
  
  private async processRelatedEntities(
    parentEntity: BaseEntity,
    relatedEntities: Record<string, RecordData[]>,
    entityDir: string,
    options: PushOptions,
    callbacks?: PushCallbacks
  ): Promise<void> {
    // TODO: Complete implementation for processing related entities
    // This is a simplified version - full implementation would:
    // 1. Create entity objects for each related entity type
    // 2. Apply field values with proper parent/root references
    // 3. Save related entities with proper error handling
    // 4. Support nested related entities recursively
    for (const [key, records] of Object.entries(relatedEntities)) {
      for (const relatedRecord of records) {
        // Process @parent references but DON'T modify the original fields
        const processedFields: Record<string, any> = {};
        for (const [fieldName, fieldValue] of Object.entries(relatedRecord.fields)) {
          if (typeof fieldValue === 'string' && fieldValue.startsWith('@parent:')) {
            const parentField = fieldValue.substring(8);
            processedFields[fieldName] = parentEntity.Get(parentField);
          } else {
            processedFields[fieldName] = await this.syncEngine.processFieldValue(
              fieldValue,
              entityDir,
              parentEntity,
              null
            );
          }
        }
        
        // TODO: Actually save the related entity with processedFields
        // For now, we're just processing the values but not saving
        // This needs to be implemented to actually create/update the related entities
      }
    }
  }
  
  private isValidRecordData(data: any): data is RecordData {
    return data && 
           typeof data === 'object' && 
           'fields' in data &&
           typeof data.fields === 'object';
  }
  
  private getRecordKey(recordData: RecordData, entityName: string): string {
    if (recordData.primaryKey) {
      const keys = Object.entries(recordData.primaryKey)
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([k, v]) => `${k}:${v}`)
        .join('|');
      return `${entityName}|${keys}`;
    }
    
    // Generate a key from fields if no primary key
    const fieldKeys = Object.keys(recordData.fields).sort().join(',');
    return `${entityName}|fields:${fieldKeys}`;
  }
  
  private findEntityDirectories(baseDir: string, specificDir?: string): string[] {
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