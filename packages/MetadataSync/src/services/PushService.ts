import fs from 'fs-extra';
import path from 'path';
import fastGlob from 'fast-glob';
import { BaseEntity, Metadata, UserInfo, EntitySaveOptions } from '@memberjunction/core';
import { SyncEngine, RecordData, DeferrableLookupError, SyncResolutionCollector } from '../lib/sync-engine';
import { loadEntityConfig, loadSyncConfig, EntityConfig, SyncConfig } from '../config';
import { FileBackupManager } from '../lib/file-backup-manager';
import { configManager } from '../lib/config-manager';
import { SQLLogger } from '../lib/sql-logger';
import { TransactionManager } from '../lib/transaction-manager';
import { JsonWriteHelper } from '../lib/json-write-helper';
import { RecordDependencyAnalyzer, FlattenedRecord } from '../lib/record-dependency-analyzer';
import { JsonPreprocessor } from '../lib/json-preprocessor';
import { findEntityDirectories } from '../lib/provider-utils';
import { DeletionAuditor, DeletionAudit } from '../lib/deletion-auditor';
import { DeletionReportGenerator } from '../lib/deletion-report-generator';
import type { GenericDatabaseProvider, SqlLoggingSession } from '@memberjunction/generic-database-provider';

// Configuration for parallel processing
const PARALLEL_BATCH_SIZE = 1; // Number of records to process in parallel at each dependency level
/// TEMPORARILY DISABLED PARALLEL BY SETTING TO 1 as we were having some issues

export interface PushOptions {
  dir?: string;
  dryRun?: boolean;
  verbose?: boolean;
  noValidate?: boolean;
  parallelBatchSize?: number; // Number of records to process in parallel (default: 10)
  include?: string[]; // Only process these directories (whitelist, supports patterns)
  exclude?: string[]; // Skip these directories (blacklist, supports patterns)
  deleteDbOnly?: boolean; // Delete database-only records that reference records being deleted
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
  deferred: number;
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
  deferred: number;
  errors: number;
}

/**
 * Tracks files that need to be written back after deletions complete
 */
interface DeferredFileWrite {
  filePath: string;
  records: RecordData[];
  isArray: boolean;
}

/**
 * Tracks records that had deferred lookups and need to be re-processed.
 * Used with `?allowDefer` flag in @lookup syntax for handling circular dependencies.
 * Stores the full context needed to re-run processFlattenedRecord identically.
 */
interface DeferredRecord {
  /** The full flattened record to re-process */
  flattenedRecord: FlattenedRecord;
  /** The entity directory for resolving paths */
  entityDir: string;
  /** The entity configuration */
  entityConfig: EntityConfig;
}

export class PushService {
  private syncEngine: SyncEngine;
  private contextUser: UserInfo;
  private warnings: string[] = [];
  private syncConfig: SyncConfig | null = null;
  private deferredFileWrites: Map<string, DeferredFileWrite> = new Map();
  private deferredRecords: DeferredRecord[] = [];

  constructor(syncEngine: SyncEngine, contextUser: UserInfo) {
    this.syncEngine = syncEngine;
    this.contextUser = contextUser;
  }

  /**
   * Determines whether to emit __mj_sync_notes based on config hierarchy.
   * Entity config takes precedence over root config. Defaults to false.
   * @param entityConfig - The entity-specific configuration (if available)
   * @returns true if sync notes should be emitted, false otherwise
   */
  private shouldEmitSyncNotes(entityConfig?: EntityConfig): boolean {
    // Entity config takes precedence if explicitly set
    if (entityConfig?.emitSyncNotes !== undefined) {
      return entityConfig.emitSyncNotes;
    }
    // Fall back to root config, default to false
    return this.syncConfig?.emitSyncNotes ?? false;
  }

  async push(options: PushOptions, callbacks?: PushCallbacks): Promise<PushResult> {
    this.warnings = [];

    // Validate that include and exclude are not used together
    if (options.include && options.exclude) {
      throw new Error('Cannot specify both --include and --exclude options. Please use one or the other.');
    }

    // Reset deferred tracking for this push operation
    this.deferredFileWrites.clear();
    this.deferredRecords = [];
    
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
        const provider = Metadata.Provider as GenericDatabaseProvider;
        
        if (options.verbose) {
          callbacks?.onLog?.(`SQL logging enabled: ${sqlLogger.enabled}`);
          callbacks?.onLog?.(`Provider type: ${provider?.constructor?.name || 'Unknown'}`);
          callbacks?.onLog?.(`Has CreateSqlLogger: ${typeof provider?.CreateSqlLogger === 'function'}`);
        }
        
        if (provider && typeof provider.CreateSqlLogger === 'function') {
          // Generate filename with timestamp
          const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
          const filename = this.syncConfig?.sqlLogging?.formatAsMigration
            ? `MetadataSync_Push_${timestamp}.sql`
            : `push_${timestamp}.sql`;

          // Use .sql-log-push directory in the config directory (where sync was initiated)
          const outputDir = path.join(configDir, this.syncConfig?.sqlLogging?.outputDirectory || './sql-log-push');
          const filepath = path.join(outputDir, filename);

          // Ensure the directory exists
          await fs.ensureDir(path.dirname(filepath));

          // Create the SQL logging session
          sqlLoggingSession = await provider.CreateSqlLogger(filepath, {
            formatAsMigration: this.syncConfig?.sqlLogging?.formatAsMigration || false,
            description: 'MetadataSync push operation',
            statementTypes: "mutations",
            prettyPrint: true,
            filterPatterns: this.syncConfig?.sqlLogging?.filterPatterns,
            filterType: this.syncConfig?.sqlLogging?.filterType,
            verboseOutput: this.syncConfig?.sqlLogging?.verboseOutput || false,
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
      const entityDirs = findEntityDirectories(
        configDir,
        undefined,
        this.syncConfig?.directoryOrder,
        this.syncConfig?.ignoreDirectories,
        options.include,
        options.exclude
      );
      
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
      let totalDeferred = 0;
      let totalErrors = 0;
      
      // PHASE 0: Audit all deletions across all entities (if any exist)
      let deletionAudit: DeletionAudit | null = null;
      try {
        deletionAudit = await this.auditAllDeletions(entityDirs, options, callbacks);
      } catch (auditError) {
        // Audit failed, cannot proceed
        throw auditError;
      }

      // CONFIRMATION PROMPT: Ask user to confirm only if deletions will occur
      if (!options.dryRun && deletionAudit) {
        const shouldProceed = await this.promptForConfirmation(deletionAudit, callbacks);
        if (!shouldProceed) {
          callbacks?.onLog?.('\n❌ Push operation cancelled by user.\n');

          // Clean up SQL logging session and file if it was created
          if (sqlLoggingSession) {
            const sqlLogPath = sqlLoggingSession.filePath;
            try {
              await sqlLoggingSession.dispose();
              // Delete the empty SQL log file since no operations occurred
              if (await fs.pathExists(sqlLogPath)) {
                await fs.remove(sqlLogPath);
                if (options.verbose) {
                  callbacks?.onLog?.(`🗑️  Removed empty SQL log file: ${sqlLogPath}`);
                }
              }
            } catch (cleanupError) {
              callbacks?.onWarn?.(`Failed to clean up SQL logging session: ${cleanupError}`);
            }
          }

          return {
            created: 0,
            updated: 0,
            unchanged: 0,
            deleted: 0,
            skipped: 0,
            deferred: 0,
            errors: 0,
            warnings: this.warnings
          };
        }
      }

      // Begin transaction if not in dry-run mode
      if (!options.dryRun) {
        await transactionManager.beginTransaction();
      }

      try {
        // PHASE 1: Process creates/updates for all entities
        callbacks?.onLog?.('📝 Processing creates and updates...\n');

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
            if (result.deferred > 0) {
              callbacks?.onLog?.(`   ⏳ Deferred: ${result.deferred}`);
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
          totalDeferred += result.deferred;
          totalErrors += result.errors;
        }

        // PHASE 2: Process deletions in reverse dependency order (if any exist)
        if (deletionAudit && totalErrors === 0) {
          const deletionResult = await this.processDeletionsFromAudit(deletionAudit, options, callbacks);
          totalDeleted += deletionResult.deleted;
          totalErrors += deletionResult.errors;
        }

        // PHASE 2.5: Process deferred records (for circular dependencies)
        if (this.deferredRecords.length > 0 && totalErrors === 0) {
          const deferredResult = await this.processDeferredRecords(options, callbacks);
          totalCreated += deferredResult.created;
          totalUpdated += deferredResult.updated;
          totalErrors += deferredResult.errors;
        }

        // Commit transaction if successful
        if (!options.dryRun && totalErrors === 0) {
          await transactionManager.commitTransaction();
        }

        // PHASE 3: Write deferred files with updated deletion timestamps
        if (!options.dryRun && totalErrors === 0 && this.deferredFileWrites.size > 0) {
          await this.writeDeferredFiles(options, callbacks);
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
        deferred: totalDeferred,
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
    let deferred = 0;
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

        // Keep unprocessed data to write back (preserves @file: references)
        const unprocessedRecords = Array.isArray(rawFileData) ? rawFileData : [rawFileData];
        const isArray = Array.isArray(rawFileData);

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
                // Don't count deletion records - they're counted in Phase 2
                if (result.isDeletedRecord) {
                  continue; // Skip entirely
                } else if (result.isDuplicate) {
                  skipped++; // Count duplicates as skipped
                } else {
                  if (result.status === 'created') created++;
                  else if (result.status === 'updated') updated++;
                  else if (result.status === 'unchanged') unchanged++;
                  else if (result.status === 'deleted') deleted++;
                  else if (result.status === 'skipped') skipped++;
                  else if (result.status === 'error') errors++;
                  else if (result.status === 'deferred') {
                    created++; // Deferred records were saved (count as created)
                    deferred++; // Also track separately for reporting
                  }
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
              // Don't count deletion records - they're counted in Phase 2
              if (!result.isDeletedRecord) {
                if (result.isDuplicate) {
                  skipped++; // Count duplicates as skipped
                } else {
                  if (result.status === 'created') created++;
                  else if (result.status === 'updated') updated++;
                  else if (result.status === 'unchanged') unchanged++;
                  else if (result.status === 'deleted') deleted++;
                  else if (result.status === 'skipped') skipped++;
                  else if (result.status === 'error') errors++;
                  else if (result.status === 'deferred') {
                    created++; // Deferred records were saved (count as created)
                    deferred++; // Also track separately for reporting
                  }
                }
              }
            } catch (recordError) {
              const errorMsg = `Error processing ${flattenedRecord.entityName} record at ${flattenedRecord.path}: ${recordError}`;
              callbacks?.onError?.(errorMsg);
              errors++;
            }
          }
        }
        
        // Check if this file has any deletion records (including nested relatedEntities)
        const hasDeletions = this.hasAnyDeletions(records);

        // Write back to file (handles both single records and arrays)
        // Use unprocessedRecords to preserve @file: references
        // Defer writing if file contains deletions - they'll be written after Phase 2
        if (!options.dryRun) {
          if (hasDeletions) {
            // Store for later writing after deletions complete
            this.deferredFileWrites.set(filePath, {
              filePath,
              records: unprocessedRecords,
              isArray
            });
          } else {
            // Write immediately for files without deletions
            if (isArray) {
              await JsonWriteHelper.writeOrderedRecordData(filePath, unprocessedRecords);
            } else {
              await JsonWriteHelper.writeOrderedRecordData(filePath, unprocessedRecords[0]);
            }
          }
        }
      } catch (fileError) {
        // Error details already logged by lower-level handlers, just re-throw
        throw fileError;
      }
    }
    
    return { created, updated, unchanged, deleted, skipped, deferred, errors };
  }

  private async processFlattenedRecord(
    flattenedRecord: FlattenedRecord,
    entityDir: string,
    options: PushOptions,
    batchContext: Map<string, BaseEntity>,
    callbacks?: PushCallbacks,
    entityConfig?: EntityConfig,
    allowDefer: boolean = true
  ): Promise<{ status: 'created' | 'updated' | 'unchanged' | 'error' | 'deleted' | 'skipped' | 'deferred'; isDuplicate?: boolean; isDeletedRecord?: boolean }> {
    const metadata = new Metadata();
    const { record, entityName, parentContext, id: recordId } = flattenedRecord;

    // Skip deletion records - they're handled in Phase 2
    // File writing is deferred for files containing deletions
    // Mark with special flag so they don't count in Phase 1 stats at all
    if (record.deleteRecord && record.deleteRecord.delete === true) {
      return { status: 'unchanged', isDuplicate: false, isDeletedRecord: true };
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

    // Get parent entity from context if available (needed for @parent refs in primaryKey)
    let parentEntity: BaseEntity | null = null;
    if (parentContext) {
      const parentRecordId = flattenedRecord.dependencies.values().next().value;
      if (parentRecordId) {
        parentEntity = batchContext.get(parentRecordId) || null;
      }
      if (!parentEntity) {
        throw new Error(`Parent entity not found in batch context for ${entityName}. Parent dependencies: ${Array.from(flattenedRecord.dependencies).join(', ')}`);
      }
    }

    // Check if record exists
    // Process primaryKey values through processFieldValue to resolve @lookup, @parent, etc.
    // Create a resolution collector to track @lookup and @parent resolutions
    const resolutionCollector: SyncResolutionCollector = { notes: [], fieldPrefix: 'primaryKey' };

    let resolvedPrimaryKey: Record<string, any> | undefined;
    if (record.primaryKey && Object.keys(record.primaryKey).length > 0) {
      resolvedPrimaryKey = {};
      for (const [pkField, pkValue] of Object.entries(record.primaryKey)) {
        try {
          resolvedPrimaryKey[pkField] = await this.syncEngine.processFieldValue(
            pkValue,
            entityDir,
            parentEntity,
            null, // rootRecord
            0,
            batchContext,
            resolutionCollector,
            pkField
          );
        } catch (pkError: unknown) {
          // Check if this is a deferrable lookup error
          if (pkError instanceof DeferrableLookupError) {
            throw new Error(`Cannot defer lookup in primaryKey field '${pkField}': ${(pkError as DeferrableLookupError).message}. Primary key lookups must resolve immediately.`);
          }
          throw pkError;
        }
      }
    }

    let exists = false;
    let isNew = false;

    if (resolvedPrimaryKey && Object.keys(resolvedPrimaryKey).length > 0) {
      // First check if the record exists using the sync engine's loadEntity method
      // This avoids the "Error in BaseEntity.Load" message for missing records
      const existingEntity = await this.syncEngine.loadEntity(entityName, resolvedPrimaryKey);
      
      if (existingEntity) {
        // Record exists, use the loaded entity
        entity = existingEntity;
        exists = true;
      } else {
        // Record doesn't exist in database
        const autoCreate = this.syncConfig?.push?.autoCreateMissingRecords ?? false;
        const pkDisplay = Object.entries(resolvedPrimaryKey)
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

      // Set primary key values for new records if provided (use resolved values)
      if (resolvedPrimaryKey) {
        for (const [pkField, pkValue] of Object.entries(resolvedPrimaryKey)) {
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

    // Process field values with parent context and batch context
    // Note: parentEntity was already resolved above for primaryKey processing
    // Process each field with better error reporting
    // Track if we hit any deferrable lookup errors
    let hasDeferrableLookupError = false;

    // Switch the collector to track field resolutions
    resolutionCollector.fieldPrefix = 'fields';

    for (const [fieldName, fieldValue] of Object.entries(record.fields)) {
      try {
        const processedValue = await this.syncEngine.processFieldValue(
          fieldValue,
          entityDir,
          parentEntity,
          null, // rootRecord
          0,
          batchContext, // Pass batch context for lookups
          resolutionCollector,
          fieldName
        );
        entity.Set(fieldName, processedValue);
      } catch (fieldError: unknown) {
        // Check if this is a deferrable lookup error first
        if (fieldError instanceof DeferrableLookupError) {
          // If allowDefer is false, we're in deferred processing mode - can't defer again
          if (!allowDefer) {
            const err = fieldError as DeferrableLookupError;
            throw new Error(`Deferred lookup still failed: ${err.message}`);
          }

          // Mark that we need to defer this entire record
          hasDeferrableLookupError = true;

          // Log that we're deferring this lookup
          if (options.verbose) {
            callbacks?.onLog?.(`   ⏳ Deferring lookup for ${entityName}.${fieldName} -> ${fieldError.entityName}`);
          }
          // Don't set this field - continue to try other fields
          // We'll re-process the entire record later
          continue;
        }

        // For other errors, use enhanced error reporting
        const err = fieldError as Error;
        const primaryKeyInfo = record.primaryKey ? JSON.stringify(record.primaryKey) : 'NEW';

        // Helper to log to both console and callbacks
        const logError = (msg: string) => {
          console.error(msg);
          callbacks?.onLog?.(msg);
        };

        // Check if this is a lookup failure
        if (err.message?.includes('Lookup failed:')) {
          logError(`\n❌ LOOKUP FAILURE in ${entityName} (${primaryKeyInfo})`);
          logError(`   Field: ${fieldName}`);
          logError(`   Value: ${fieldValue}`);
          logError(`   Error: ${err.message}`);
          logError(`   Tip: Check if the referenced record exists in the target entity\n`);
        } else if (err.message?.includes('Entity not found:')) {
          logError(`\n❌ ENTITY NOT FOUND in ${entityName} (${primaryKeyInfo})`);
          logError(`   Field: ${fieldName}`);
          logError(`   Value: ${fieldValue}`);
          logError(`   Error: ${err.message}`);
          logError(`   Tip: Check if the entity name is spelled correctly\n`);
        } else if (err.message?.includes('Field') && err.message?.includes('not found')) {
          logError(`\n❌ FIELD NOT FOUND in ${entityName} (${primaryKeyInfo})`);
          logError(`   Field: ${fieldName}`);
          logError(`   Value: ${fieldValue}`);
          logError(`   Error: ${err.message}`);
          logError(`   Tip: Check if the field name exists in the target entity\n`);
        } else if (err.message?.includes('File not found:')) {
          logError(`\n❌ FILE NOT FOUND in ${entityName} (${primaryKeyInfo})`);
          logError(`   Field: ${fieldName}`);
          logError(`   Value: ${fieldValue}`);
          logError(`   Error: ${err.message}`);
          logError(`   Tip: Check if the file path is correct relative to ${entityDir}\n`);
        } else {
          logError(`\n❌ FIELD PROCESSING ERROR in ${entityName} (${primaryKeyInfo})`);
          logError(`   Field: ${fieldName}`);
          logError(`   Value: ${fieldValue}`);
          logError(`   Error: ${err.message}\n`);
        }

        // Re-throw with enhanced context
        throw new Error(`Failed to process field '${fieldName}' in ${entityName}: ${err.message}`);
      }
    }

    // Note: If we had deferred fields, we still continue to save the record
    // The deferred fields are not set, but other fields are. We'll queue for
    // re-processing after save succeeds.

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
        const completeMessage = entity.LatestResult.CompleteMessage;
        if (completeMessage) {
          logError(`   Database Error: ${completeMessage}`);
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

    // If we had deferred lookup errors, queue the entire record for re-processing
    // The record has been saved (without the deferred fields), so it exists in the DB.
    // In Phase 2.5, we'll re-run processFlattenedRecord with allowDefer=false to fill in the gaps.
    if (hasDeferrableLookupError && allowDefer && entityConfig) {
      this.deferredRecords.push({
        flattenedRecord,
        entityDir,
        entityConfig
      });

      if (options.verbose) {
        callbacks?.onLog?.(`   📋 Queued ${entityName} for deferred processing (record saved, some fields pending)`);
      }

      // Return 'deferred' status - it's saved but incomplete
      // We don't return early here because we still want to update primaryKey and sync metadata
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

    // Handle __mj_sync_notes based on emitSyncNotes config setting
    // Use type assertion through unknown to handle the dynamic property
    const recordWithNotes = record as unknown as Record<string, unknown>;
    const emitNotes = this.shouldEmitSyncNotes(entityConfig);

    if (emitNotes) {
      // Only update __mj_sync_notes if the record was actually dirty (changed)
      // For unchanged records, preserve existing notes to maintain stability
      if (isNew || isDirty) {
        if (resolutionCollector.notes.length > 0) {
          recordWithNotes.__mj_sync_notes = resolutionCollector.notes;
        } else {
          // Remove existing notes if no resolutions were tracked
          delete recordWithNotes.__mj_sync_notes;
        }
      }
    } else {
      // emitSyncNotes is disabled - always remove existing notes
      delete recordWithNotes.__mj_sync_notes;
    }

    // Return appropriate status
    // If we had deferred lookups, return 'deferred' to indicate partial save
    // The record is saved but will be re-processed in Phase 2.5
    if (hasDeferrableLookupError && allowDefer) {
      return {
        status: 'deferred',
        isDuplicate: false
      };
    }

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
    callbacks?: PushCallbacks,
    isDbOnly: boolean = false
  ): Promise<{ status: 'deleted' | 'skipped' | 'unchanged'; isDuplicate?: boolean }> {
    const { record, entityName } = flattenedRecord;
    
    // Validate that we have a primary key for deletion
    if (!record.primaryKey || Object.keys(record.primaryKey).length === 0) {
      throw new Error(`Cannot delete ${entityName} record without primaryKey. Please specify primaryKey fields.`);
    }
    
    // Load the entity to check if it exists in the target database
    const existingEntity = await this.syncEngine.loadEntity(entityName, record.primaryKey);

    // Check if the deletion has already been processed
    if (record.deleteRecord?.deletedAt) {
      // Verify if record still exists in THIS database
      if (!existingEntity) {
        if (options.verbose) {
          callbacks?.onLog?.(`   ℹ️  Record already deleted on ${record.deleteRecord.deletedAt} and confirmed absent from database`);
        }
        return { status: 'unchanged', isDuplicate: false };
      }

      // Record has deletedAt timestamp but still exists in this database
      // This can happen when syncing to a different database
      if (options.verbose) {
        callbacks?.onLog?.(`   ℹ️  Record marked as deleted on ${record.deleteRecord.deletedAt}, but still exists in this database. Re-deleting...`);
      }
      // Fall through to deletion logic
    }
    
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
    
    if (isDbOnly) {
      callbacks?.onLog?.(`🗑️  Deleting database-only ${entityName} record:`);
    } else {
      callbacks?.onLog?.(`🗑️  Deleting ${entityName} record:`);
    }
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
      
      // Set deletedAt timestamp after successful deletion (only for metadata records)
      if (!isDbOnly) {
        if (!record.deleteRecord) {
          record.deleteRecord = { delete: true };
        }
        record.deleteRecord.deletedAt = new Date().toISOString();

        // Update the corresponding record in deferred file writes
        this.updateDeferredFileRecord(flattenedRecord);
      }

      if (options.verbose) {
        if (isDbOnly) {
          callbacks?.onLog?.(`   ✓ Successfully deleted database-only ${entityName} record`);
        } else {
          callbacks?.onLog?.(`   ✓ Successfully deleted ${entityName} record`);
        }
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
  
  /**
   * Prompt user for confirmation before proceeding with push operation
   * This happens after deletion audit but before any database operations
   */
  private async promptForConfirmation(
    deletionAudit: DeletionAudit | null,
    callbacks?: PushCallbacks
  ): Promise<boolean> {
    // Build confirmation message
    const messages: string[] = [];
    messages.push('\n' + '═'.repeat(80));
    messages.push('CONFIRMATION REQUIRED');
    messages.push('═'.repeat(80));
    messages.push('');
    messages.push('This operation will:');
    messages.push('  • Create new records');
    messages.push('  • Update existing records');

    if (deletionAudit) {
      const metadataDeletes = deletionAudit.explicitDeletes.size + deletionAudit.implicitDeletes.size;
      const dbOnlyDeletes = deletionAudit.databaseOnlyDeletions?.length ?? 0;
      const totalDeletes = metadataDeletes + dbOnlyDeletes;

      if (dbOnlyDeletes > 0) {
        messages.push(`  • Delete ${totalDeletes} record${totalDeletes > 1 ? 's' : ''} (${deletionAudit.explicitDeletes.size} explicit, ${deletionAudit.implicitDeletes.size} implicit, ${dbOnlyDeletes} database-only)`);
      } else {
        messages.push(`  • Delete ${metadataDeletes} record${metadataDeletes > 1 ? 's' : ''} (${deletionAudit.explicitDeletes.size} explicit, ${deletionAudit.implicitDeletes.size} implicit)`);
      }

      if (deletionAudit.orphanedReferences.length > 0 && dbOnlyDeletes === 0) {
        // Only show warning if not deleting DB-only records
        messages.push(`  ⚠️  ${deletionAudit.orphanedReferences.length} database-only reference${deletionAudit.orphanedReferences.length > 1 ? 's' : ''} detected (may cause FK errors)`);
      }
    } else {
      messages.push('  • No deletions');
    }

    messages.push('');
    messages.push('All operations will occur within a transaction and can be rolled back on error.');
    messages.push('');
    messages.push('═'.repeat(80));
    messages.push('');

    // Display messages
    for (const msg of messages) {
      callbacks?.onLog?.(msg);
    }

    // Use onConfirm callback if available, otherwise throw error
    if (callbacks?.onConfirm) {
      const confirmed = await callbacks.onConfirm('Do you want to proceed? (yes/no)');
      return confirmed;
    } else {
      // No confirmation callback provided - this shouldn't happen in interactive mode
      callbacks?.onWarn?.('⚠️  No confirmation callback provided. Proceeding automatically.');
      callbacks?.onWarn?.('   To enable confirmation prompts, provide an onConfirm callback.\n');
      return true;
    }
  }

  /**
   * Audit all deletions across all metadata files
   * This pre-processes all records to identify deletion dependencies and order
   */
  private async auditAllDeletions(
    entityDirs: string[],
    options: PushOptions,
    callbacks?: PushCallbacks
  ): Promise<DeletionAudit | null> {
    // OPTIMIZATION: Quick scan to check if ANY deletions exist before doing expensive loading
    let hasAnyDeletions = false;

    for (const entityDir of entityDirs) {
      if (hasAnyDeletions) break; // Early exit once we find any deletion

      const entityConfig = await loadEntityConfig(entityDir);
      if (!entityConfig) {
        continue;
      }

      const pattern = entityConfig.filePattern || '*.json';
      const files = await fastGlob(pattern, {
        cwd: entityDir,
        absolute: true,
        onlyFiles: true,
        dot: true,
        ignore: ['**/node_modules/**', '**/.mj-*.json']
      });

      // Quick scan for delete directives without full processing
      for (const filePath of files) {
        try {
          const content = await fs.readFile(filePath, 'utf-8');
          // Fast string check for delete directives
          if (content.includes('"delete"') && content.includes('true')) {
            // More precise check - parse JSON to confirm
            const data = JSON.parse(content);
            const records = Array.isArray(data) ? data : [data];

            const hasDelete = records.some((r: RecordData) => r.deleteRecord?.delete === true);
            if (hasDelete) {
              hasAnyDeletions = true;
              break;
            }
          }
        } catch (error) {
          // Ignore errors in quick scan
        }
      }
    }

    // If no deletions found, skip all processing
    if (!hasAnyDeletions) {
      if (options.verbose) {
        callbacks?.onLog?.('No deletion operations found - skipping deletion audit.\n');
      }
      return null;
    }

    // Deletions exist - proceed with full audit
    callbacks?.onLog?.('\n🔍 Analyzing deletion operations...\n');

    // Two-phase approach for cross-file dependency detection:
    // Phase 1: Flatten all records from all files (no dependency analysis yet)
    // Phase 2: Analyze dependencies globally across all records

    const analyzer = new RecordDependencyAnalyzer();
    analyzer.reset(); // Ensure clean state before processing multiple files

    // Phase 1: Flatten all records from all files
    const allFlattenedRecords: FlattenedRecord[] = [];

    for (const entityDir of entityDirs) {
      const entityConfig = await loadEntityConfig(entityDir);
      if (!entityConfig) {
        continue;
      }

      // Find all JSON files
      const pattern = entityConfig.filePattern || '*.json';
      const files = await fastGlob(pattern, {
        cwd: entityDir,
        absolute: true,
        onlyFiles: true,
        dot: true,
        ignore: ['**/node_modules/**', '**/.mj-*.json']
      });

      // Load and flatten records from each file (no dependency analysis yet)
      for (const filePath of files) {
        try {
          const rawFileData = await fs.readJson(filePath);

          // Handle @include directives if present
          let fileData = rawFileData;
          const jsonString = JSON.stringify(rawFileData);
          const hasIncludes = jsonString.includes('"@include"') || jsonString.includes('"@include.');

          if (hasIncludes) {
            const jsonPreprocessor = new JsonPreprocessor();
            fileData = await jsonPreprocessor.processFile(filePath);
          }

          const records = Array.isArray(fileData) ? fileData : [fileData];

          // Phase 1: Flatten only - accumulates into analyzer's internal state
          const flattenedRecords = analyzer.flattenFileRecords(records, entityConfig.entity);
          allFlattenedRecords.push(...flattenedRecords);
        } catch (error) {
          if (options.verbose) {
            callbacks?.onLog?.(`Warning: Could not load ${filePath}: ${error}`);
          }
        }
      }
    }

    // Phase 2: Analyze dependencies globally across ALL records
    // This enables cross-file dependency detection (e.g., AIPromptModel -> AIConfiguration)
    const analysisResult = analyzer.analyzeAllDependencies(allFlattenedRecords);
    const allRecords = analysisResult.sortedRecords;

    // Log any circular dependencies detected across files
    if (analysisResult.circularDependencies.length > 0 && options.verbose) {
      callbacks?.onWarn?.(`⚠️  Detected ${analysisResult.circularDependencies.length} circular dependencies across metadata files`);
    }

    // Perform comprehensive deletion audit
    const md = new Metadata();
    const auditor = new DeletionAuditor(
      md,
      this.contextUser
    );

    const audit = await auditor.auditDeletions(allRecords, options.deleteDbOnly ?? false);

    // Check if any records actually need deletion
    const totalMarkedForDeletion = audit.explicitDeletes.size + audit.implicitDeletes.size;
    const needDeletion = audit.deletionLevels.flat().length; // Only records that exist in DB

    if (needDeletion === 0) {
      // All records marked for deletion are already deleted
      if (options.verbose && totalMarkedForDeletion > 0) {
        callbacks?.onLog?.(`ℹ️  All ${totalMarkedForDeletion} record${totalMarkedForDeletion > 1 ? 's' : ''} marked for deletion are already deleted from the database.`);
        callbacks?.onLog?.('   No deletion operations needed.\n');
      }
      return null; // Signal that no deletion audit is needed
    }

    // Generate and display report (only if records need deletion)
    const report = DeletionReportGenerator.generateReport(audit, options.verbose);
    callbacks?.onLog?.(report);
    callbacks?.onLog?.('');

    // Check for blocking issues (only circular dependencies block execution)
    if (audit.circularDependencies.length > 0) {
      const error = `Cannot proceed: ${audit.circularDependencies.length} circular ${audit.circularDependencies.length > 1 ? 'dependencies' : 'dependency'} detected.\n` +
                   `Please resolve the circular dependencies before attempting deletion.`;
      callbacks?.onError?.(error);
      throw new Error(error);
    }

    // Warn about database-only references
    if (audit.orphanedReferences.length > 0) {
      if (options.deleteDbOnly) {
        // When deleteDbOnly is enabled, these will be deleted
        callbacks?.onLog?.(`ℹ️  ${audit.databaseOnlyDeletions.length} database-only record${audit.databaseOnlyDeletions.length > 1 ? 's' : ''} will be deleted.`);
        callbacks?.onLog?.(`   These records exist in the database but not in metadata files.`);
        callbacks?.onLog?.(`   They reference records being deleted and will be removed first.\n`);
      } else {
        // When deleteDbOnly is NOT enabled, warn about potential FK errors
        callbacks?.onWarn?.(`⚠️  WARNING: ${audit.orphanedReferences.length} database-only reference${audit.orphanedReferences.length > 1 ? 's' : ''} found.`);
        callbacks?.onWarn?.(`   These records exist in the database but not in metadata.`);
        callbacks?.onWarn?.(`   Deletion may fail with FK constraint errors.`);
        callbacks?.onWarn?.(`   Use --delete-db-only flag to automatically delete these records first.\n`);
      }
    }

    // Warn about implicit deletes
    if (audit.implicitDeletes.size > 0) {
      callbacks?.onWarn?.('⚠️  WARNING: Implicit deletions will occur.');
      callbacks?.onWarn?.(`   ${audit.implicitDeletes.size} record${audit.implicitDeletes.size > 1 ? 's' : ''} will be deleted due to FK constraints.`);
      callbacks?.onWarn?.('   Review the deletion audit report above.\n');
    }

    return audit;
  }

  /**
   * Process deletions in reverse dependency order
   */
  private async processDeletionsFromAudit(
    audit: DeletionAudit,
    options: PushOptions,
    callbacks?: PushCallbacks
  ): Promise<{ deleted: number; errors: number }> {
    let deleted = 0;
    let errors = 0;

    callbacks?.onLog?.('🗑️  Processing deletions in reverse dependency order...\n');

    // Count database-only records for summary
    const dbOnlyCount = audit.databaseOnlyDeletions?.length ?? 0;
    let dbOnlyDeleted = 0;

    // Process deletion levels in order (highest dependency level first)
    for (let i = 0; i < audit.deletionLevels.length; i++) {
      const level = audit.deletionLevels[i];
      const levelNumber = audit.deletionLevels.length - i; // Reverse numbering for clarity

      // Count DB-only vs metadata records at this level
      const dbOnlyAtLevel = level.filter(r => r.path === '<DATABASE>').length;
      const metadataAtLevel = level.length - dbOnlyAtLevel;

      if (dbOnlyAtLevel > 0 && metadataAtLevel > 0) {
        callbacks?.onLog?.(`   Level ${levelNumber}: Deleting ${level.length} records (${dbOnlyAtLevel} database-only, ${metadataAtLevel} metadata)...`);
      } else if (dbOnlyAtLevel > 0) {
        callbacks?.onLog?.(`   Level ${levelNumber}: Deleting ${dbOnlyAtLevel} database-only record${dbOnlyAtLevel > 1 ? 's' : ''}...`);
      } else {
        callbacks?.onLog?.(`   Level ${levelNumber}: Deleting ${level.length} record${level.length > 1 ? 's' : ''}...`);
      }

      // Process records within same level (can be done in parallel in the future)
      for (const record of level) {
        const isDbOnly = record.path === '<DATABASE>';

        try {
          const result = await this.processDeleteRecord(record, '', options, callbacks, isDbOnly);

          if (result.status === 'deleted') {
            deleted++;
            if (isDbOnly) {
              dbOnlyDeleted++;
            }
          } else if (result.status === 'skipped') {
            // Record not found, already handled in processDeleteRecord
          }
        } catch (error) {
          callbacks?.onError?.(`   Failed to delete ${record.entityName}: ${error}`);
          errors++;
          throw error; // Fail fast on first deletion error
        }
      }
    }

    if (deleted > 0) {
      callbacks?.onLog?.(`   ✓ Successfully deleted ${deleted} record${deleted > 1 ? 's' : ''}\n`);
    }

    return { deleted, errors };
  }

  /**
   * Recursively check if any records in an array (including nested relatedEntities) have deletions
   */
  private hasAnyDeletions(records: RecordData[]): boolean {
    for (const record of records) {
      // Check this record
      if (record.deleteRecord?.delete === true) {
        return true;
      }

      // Check nested related entities recursively
      if (record.relatedEntities) {
        for (const relatedRecords of Object.values(record.relatedEntities)) {
          if (Array.isArray(relatedRecords)) {
            if (this.hasAnyDeletions(relatedRecords)) {
              return true;
            }
          }
        }
      }
    }

    return false;
  }

  /**
   * Process deferred records that had lookup failures during initial processing.
   * Called in Phase 2.5 after all records are created/updated but before commit.
   * This handles circular dependencies where records reference each other.
   *
   * Re-runs processFlattenedRecord with allowDefer=false, which processes the
   * entire record exactly as in the initial pass. Now that all records exist,
   * the lookups should succeed.
   *
   * @param options - Push options
   * @param callbacks - Callbacks for progress/error reporting
   * @returns Object with created, updated, and errors counts
   */
  private async processDeferredRecords(
    options: PushOptions,
    callbacks?: PushCallbacks
  ): Promise<{ created: number; updated: number; errors: number }> {
    if (this.deferredRecords.length === 0) {
      return { created: 0, updated: 0, errors: 0 };
    }

    callbacks?.onLog?.(`\n⏳ Processing ${this.deferredRecords.length} deferred record${this.deferredRecords.length > 1 ? 's' : ''}...`);

    let created = 0;
    let updated = 0;
    let errors = 0;

    // Create a fresh batch context for deferred processing
    // Records are in DB now, so this is mainly for tracking within this phase
    const batchContext = new Map<string, BaseEntity>();

    for (const deferred of this.deferredRecords) {
      const { flattenedRecord, entityDir, entityConfig } = deferred;
      const entityName = flattenedRecord.entityName;
      const recordId = flattenedRecord.record.primaryKey
        ? Object.entries(flattenedRecord.record.primaryKey).map(([k, v]) => `${k}=${v}`).join(', ')
        : (flattenedRecord.record.fields.Name || 'NEW');

      try {
        // Re-run processFlattenedRecord with allowDefer=false
        // This ensures we use the exact same processing logic
        const result = await this.processFlattenedRecord(
          flattenedRecord,
          entityDir,
          options,
          batchContext,
          callbacks,
          entityConfig,
          false // allowDefer=false - must succeed or fail, no re-deferring
        );

        if (result.status === 'created') {
          created++;
          callbacks?.onLog?.(`   ✓ ${entityName} (${recordId}) - created`);
        } else if (result.status === 'updated') {
          updated++;
          callbacks?.onLog?.(`   ✓ ${entityName} (${recordId}) - updated`);
        } else if (result.status === 'unchanged') {
          callbacks?.onLog?.(`   - ${entityName} (${recordId}) - unchanged`);
        }

      } catch (error) {
        const err = error as Error;

        callbacks?.onError?.(
          `   ✗ Failed to process deferred record: ${entityName} (${recordId})`
        );
        callbacks?.onError?.(
          `     Error: ${err.message}`
        );
        callbacks?.onError?.(
          `     Tip: Ensure all referenced records exist or remove the ?allowDefer flag`
        );

        errors++;
      }
    }

    // Summary
    callbacks?.onLog?.('');
    const total = created + updated;
    if (total > 0) {
      callbacks?.onLog?.(`   ✓ Resolved ${total} deferred record${total > 1 ? 's' : ''} (${created} created, ${updated} updated)`);
    }
    if (errors > 0) {
      callbacks?.onLog?.(`   ✗ Failed to resolve ${errors} deferred record${errors > 1 ? 's' : ''}`);
    }
    callbacks?.onLog?.('');

    return { created, updated, errors };
  }

  /**
   * Write all deferred files with updated deletion timestamps
   * Called in Phase 3 after all deletions complete successfully
   */
  private async writeDeferredFiles(options: PushOptions, callbacks?: PushCallbacks): Promise<void> {
    if (this.deferredFileWrites.size === 0) {
      return;
    }

    if (options.verbose) {
      callbacks?.onLog?.(`\n📝 Writing ${this.deferredFileWrites.size} file${this.deferredFileWrites.size > 1 ? 's' : ''} with deletion timestamps...`);
    }

    for (const deferredWrite of this.deferredFileWrites.values()) {
      try {
        if (deferredWrite.isArray) {
          await JsonWriteHelper.writeOrderedRecordData(deferredWrite.filePath, deferredWrite.records);
        } else {
          await JsonWriteHelper.writeOrderedRecordData(deferredWrite.filePath, deferredWrite.records[0]);
        }
      } catch (error) {
        callbacks?.onWarn?.(`   ⚠️  Failed to write ${deferredWrite.filePath}: ${error}`);
      }
    }

    if (options.verbose) {
      callbacks?.onLog?.(`   ✓ Completed writing deferred files\n`);
    }
  }

  /**
   * Update a record in deferred file writes after successful deletion
   * Finds the matching RecordData by primary key and updates its deleteRecord section
   * Searches recursively through nested relatedEntities
   */
  private updateDeferredFileRecord(flattenedRecord: FlattenedRecord): void {
    const { record } = flattenedRecord;

    // Search through all deferred files to find the matching record
    for (const deferredWrite of this.deferredFileWrites.values()) {
      for (const fileRecord of deferredWrite.records) {
        // Search this record and all nested related entities recursively
        if (this.findAndUpdateRecord(fileRecord, record, flattenedRecord.entityName)) {
          return; // Found and updated
        }
      }
    }
  }

  /**
   * Recursively search a RecordData and its relatedEntities for a matching record
   * Updates the matching record's deleteRecord timestamp
   */
  private findAndUpdateRecord(
    searchIn: RecordData,
    targetRecord: RecordData,
    targetEntityName: string
  ): boolean {
    // Check if this is the matching record
    if (this.recordsMatch(searchIn, targetRecord, targetEntityName)) {
      // Update the deleteRecord section with the timestamp
      if (!searchIn.deleteRecord) {
        searchIn.deleteRecord = { delete: true };
      }
      searchIn.deleteRecord.deletedAt = targetRecord.deleteRecord!.deletedAt;
      return true; // Found and updated
    }

    // Search through related entities recursively
    if (searchIn.relatedEntities) {
      for (const relatedRecords of Object.values(searchIn.relatedEntities)) {
        if (Array.isArray(relatedRecords)) {
          for (const relatedRecord of relatedRecords) {
            if (this.findAndUpdateRecord(relatedRecord, targetRecord, targetEntityName)) {
              return true; // Found in nested record
            }
          }
        }
      }
    }

    return false; // Not found in this branch
  }

  /**
   * Check if two RecordData objects represent the same record
   * Compares primary keys and entity context
   */
  private recordsMatch(record1: RecordData, record2: RecordData, entityName: string): boolean {
    // Must both have primary keys
    if (!record1.primaryKey || !record2.primaryKey) {
      return false;
    }

    // Must have same primary key fields
    const pk1Keys = Object.keys(record1.primaryKey);
    const pk2Keys = Object.keys(record2.primaryKey);

    if (pk1Keys.length !== pk2Keys.length) {
      return false;
    }

    // All primary key values must match
    return pk1Keys.every(key =>
      record1.primaryKey![key] === record2.primaryKey![key]
    );
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
}