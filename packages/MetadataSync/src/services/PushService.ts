import fs from 'fs-extra';
import path from 'path';
import fastGlob from 'fast-glob';
import { BaseEntity, Metadata, UserInfo } from '@memberjunction/core';
import { SyncEngine, RecordData } from '../lib/sync-engine';
import { loadEntityConfig, loadSyncConfig } from '../config';
import { FileBackupManager } from '../lib/file-backup-manager';
import { configManager } from '../lib/config-manager';
import { SQLLogger } from '../lib/sql-logger';
import { TransactionManager } from '../lib/transaction-manager';
import { JsonWriteHelper } from '../lib/json-write-helper';
import { RecordDependencyAnalyzer, FlattenedRecord } from '../lib/record-dependency-analyzer';
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
            callbacks
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
    callbacks?: PushCallbacks
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
        const batchContext = new Map<string, BaseEntity>();
        
        // Process all flattened records in dependency order
        for (const flattenedRecord of analysisResult.sortedRecords) {
          try {
            const result = await this.processFlattenedRecord(
              flattenedRecord,
              entityDir,
              options,
              batchContext,
              callbacks
            );
            
            // Update stats
            if (!result.isDuplicate) {
              if (result.status === 'created') created++;
              else if (result.status === 'updated') updated++;
              else if (result.status === 'unchanged') unchanged++;
            }
          } catch (recordError) {
            const errorMsg = `Error processing ${flattenedRecord.entityName} record at ${flattenedRecord.path}: ${recordError}`;
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
  
  private async processFlattenedRecord(
    flattenedRecord: FlattenedRecord,
    entityDir: string,
    options: PushOptions,
    batchContext: Map<string, BaseEntity>,
    callbacks?: PushCallbacks
  ): Promise<{ status: 'created' | 'updated' | 'unchanged' | 'error'; isDuplicate?: boolean }> {
    const metadata = new Metadata();
    const { record, entityName, parentContext } = flattenedRecord;
    
    // Build lookup key for batch context
    const lookupKey = this.buildBatchContextKey(entityName, record);
    
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
          return { status: 'error' };
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
    
    // Get parent entity from context if available
    let parentEntity: BaseEntity | null = null;
    if (parentContext) {
      const parentKey = this.buildBatchContextKey(parentContext.entityName, parentContext.record);
      parentEntity = batchContext.get(parentKey) || null;
    }
    
    // Process field values with parent context and batch context
    for (const [fieldName, fieldValue] of Object.entries(record.fields)) {
      const processedValue = await this.syncEngine.processFieldValue(
        fieldValue,
        entityDir,
        parentEntity,
        null, // rootRecord
        0,
        batchContext // Pass batch context for lookups
      );
      entity.Set(fieldName, processedValue);
    }
    
    // Add to batch context AFTER fields are set
    batchContext.set(lookupKey, entity);
    
    if (options.dryRun) {
      if (exists) {
        callbacks?.onLog?.(`[DRY RUN] Would update ${entityName} record`);
        return { status: 'updated' };
      } else {
        callbacks?.onLog?.(`[DRY RUN] Would create ${entityName} record`);
        return { status: 'created' };
      }
    }
    
    // Save the record
    const saveResult = await entity.Save();
    if (!saveResult) {
      throw new Error(`Failed to save ${entityName} record: ${entity.LatestResult?.Message || 'Unknown error'}`);
    }
    
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
    
    // Update sync metadata
    record.sync = {
      lastModified: new Date().toISOString(),
      checksum: await this.syncEngine.calculateChecksumWithFileContent(record.fields, entityDir)
    };
    
    return { 
      status: isNew ? 'created' : (entity.Dirty ? 'updated' : 'unchanged'),
      isDuplicate: false
    };
  }
  
  private buildBatchContextKey(entityName: string, record: RecordData): string {
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