import fs from 'fs-extra';
import path from 'path';
import { RunView, EntityInfo, UserInfo, BaseEntity } from '@memberjunction/core';
import { SyncEngine, RecordData } from '../lib/sync-engine';
import { FindExistingRecordFiles } from '../lib/existing-record-files';
import { loadEntityConfig, EntityConfig } from '../config';
import { configManager } from '../lib/config-manager';
import { FileWriteBatch } from '../lib/file-write-batch';
import { JsonWriteHelper } from '../lib/json-write-helper';
import { RecordProcessor } from '../lib/RecordProcessor';
import { SyncStateManager } from '../lib/sync-state-manager';
import { createPrimaryKeyLookup, extractPrimaryKeyValues, PrimaryKeyValues } from '../lib/record-primary-key';
import { DescribeMissingEntitySubclass } from '../lib/entity-subclass-guard';
import { ApplyPullOverrides, PullFieldOverrides } from '../lib/pull-option-overrides';
import { ExistingRecordEntry, ExistingRecordIndex, UnsetPrimaryKeyVariableError } from '../lib/existing-record-index';

/**
 * Resolves `pull.backupDirectory` against the directory of the file being backed up (default
 * `.backups`). An absolute path is taken as relative to that directory, as `path.join` always has.
 *
 * @throws when the result is outside that directory (`../..`): pull must not write copies of
 *         metadata files elsewhere on disk.
 */
function resolveBackupDirectory(fileDir: string, backupDirName?: string): string {
  const backupDir = path.join(fileDir, backupDirName || '.backups');
  const relative = path.relative(fileDir, backupDir);
  if (relative === '..' || relative.startsWith(`..${path.sep}`) || path.isAbsolute(relative)) {
    throw new Error(
      `pull.backupDirectory '${backupDirName}' points outside ${fileDir}. It must be a directory inside the folder of the files it backs up.`
    );
  }
  return backupDir;
}

/** Validates that a string is a well-formed ISO 8601 timestamp. */
function isValidISOTimestamp(value: string): boolean {
  return /^\d{4}-\d{2}-\d{2}(T\d{2}:\d{2}:\d{2}(\.\d+)?(Z|[+-]\d{2}:?\d{2})?)?$/.test(value);
}

export interface PullOptions extends Omit<PullFieldOverrides, 'UpdateExistingRecords' | 'CreateNewFileIfNotFound'> {
  entity: string;
  filter?: string;
  dryRun?: boolean;
  multiFile?: string;
  verbose?: boolean;
  noValidate?: boolean;
  targetDir?: string;
  updateExistingRecords?: boolean;
  createNewFileIfNotFound?: boolean;
  include?: string[]; // Only process these directories (whitelist, supports patterns)
  exclude?: string[]; // Skip these directories (blacklist, supports patterns)
  since?: string;       // ISO timestamp — only pull records updated after this time
  incremental?: boolean; // Use stored last-pull timestamp for this entity
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

/** An unset key variable error and the position of the record that raised it. */
interface UnsetKeyErrorAt {
  Index: number;
  Error: UnsetPrimaryKeyVariableError;
}

export class PullService {
  private syncEngine: SyncEngine;
  private contextUser: UserInfo;
  private createdBackupFiles: string[] = [];
  private createdBackupDirs: Set<string> = new Set();
  /** Backup path → the file it copies, so a rollback restores to the right place for any backupDirectory. */
  private backupSources = new Map<string, string>();
  private fileWriteBatch: FileWriteBatch;
  private recordProcessor: RecordProcessor;
  private stateManager: SyncStateManager | undefined;

  constructor(syncEngine: SyncEngine, contextUser: UserInfo, stateManager?: SyncStateManager) {
    this.syncEngine = syncEngine;
    this.contextUser = contextUser;
    this.fileWriteBatch = new FileWriteBatch();
    this.recordProcessor = new RecordProcessor(syncEngine, contextUser);
    this.stateManager = stateManager;
  }

  /** Set or replace the state manager after construction. */
  SetStateManager(stateManager: SyncStateManager): void {
    this.stateManager = stateManager;
  }

  /** @deprecated Use {@link SetStateManager}. */
  setStateManager(stateManager: SyncStateManager): void {
    return this.SetStateManager(stateManager);
  }
  
  async Pull(options: PullOptions, callbacks?: PullCallbacks): Promise<PullResult> {
    // Validate that include and exclude are not used together
    if (options.include && options.exclude) {
      throw new Error('Cannot specify both --include and --exclude options. Please use one or the other.');
    }

    // Clear any previous batch operations
    this.fileWriteBatch.clear();
    this.createdBackupFiles = [];
    this.createdBackupDirs.clear();
    this.backupSources.clear();
    this.recordProcessor.WarningSink = (message) => callbacks?.onWarn?.(`⚠️  ${message}`);

    let targetDir: string;
    let entityConfig: EntityConfig | null;
    
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
    
    entityConfig = ApplyPullOverrides(entityConfig, this.pullOverridesFor(options));

    // Show configuration notice only if relevant and in verbose mode
    if (options.verbose && entityConfig?.pull?.appendRecordsToExistingFile && entityConfig?.pull?.newFileName) {
      const targetFile = path.join(targetDir, entityConfig.pull.newFileName.endsWith('.json') 
        ? entityConfig.pull.newFileName 
        : `${entityConfig.pull.newFileName}.json`);
      
      if (await fs.pathExists(targetFile)) {
        callbacks?.onLog?.(`\n📝 Configuration: New records will be appended to existing file '${path.basename(targetFile)}'`);
      }
    }
    
    // Records load through the ClassFactory; without the entity's own subclass they arrive as a
    // generic BaseEntity. Pull stays correct (keys are read through Get()), but say so once.
    const subclassWarning = DescribeMissingEntitySubclass(options.entity, { Operation: 'pull', DryRun: options.dryRun });
    if (subclassWarning) {
      callbacks?.onWarn?.(`⚠️  ${subclassWarning}`);
    }

    // Pull records
    callbacks?.onProgress?.(`Pulling ${options.entity} records`);
    const rv = new RunView();

    let filter = '';
    if (options.filter) {
      filter = options.filter;
    } else if (entityConfig?.pull?.filter) {
      filter = entityConfig.pull.filter;
    }

    // Build incremental filter using __mj_UpdatedAt
    let sinceTimestamp: string | undefined;
    if (options.since) {
      sinceTimestamp = options.since;
    } else if (options.incremental && this.stateManager) {
      sinceTimestamp = this.stateManager.getLastPullTimestamp(options.entity);
    }

    if (sinceTimestamp) {
      if (!isValidISOTimestamp(sinceTimestamp)) {
        throw new Error('Invalid --since timestamp format. Expected ISO 8601 (e.g., 2026-04-07T10:00:00Z)');
      }
      const dateFilter = `[__mj_UpdatedAt] > '${sinceTimestamp}'`;
      filter = filter ? `(${filter}) AND ${dateFilter}` : dateFilter;
      callbacks?.onLog?.(`Incremental pull: fetching records updated after ${sinceTimestamp}`);
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
    
    // Process records with error handling and rollback
    let pullResult: Omit<PullResult, 'targetDir'>;
    
    try {
      pullResult = await this.processRecords(
        result.Results,
        options,
        targetDir,
        entityConfig,
        callbacks,
        sinceTimestamp
      );
      
      // Write all batched file changes at once
      if (!options.dryRun) {
        // Back up every existing file this pull is about to rewrite — updated and appended-to
        // alike — before anything is written, so a failed pull can restore all of them.
        if (entityConfig.pull?.backupBeforeUpdate) {
          await this.backupPendingFiles(entityConfig.pull.backupDirectory, options.verbose, callbacks);
        }
        const filesWritten = await this.fileWriteBatch.flush();
        if (options.verbose && filesWritten > 0) {
          callbacks?.onSuccess?.(`Wrote ${filesWritten} files with consistent property ordering`);
        }
      }
      
      // Operation succeeded - clean up backup files
      if (!options.dryRun) {
        await this.cleanupBackupFiles();
      }
      
    } catch (error) {
      callbacks?.onError?.(`Pull operation failed: ${(error as any).message || error}`);
      
      // Attempt to rollback file changes if not in dry run mode
      if (!options.dryRun) {
        try {
          const restored = await this.rollbackFileChanges(callbacks);
          if (restored > 0) {
            callbacks?.onWarn?.('File changes have been rolled back due to operation failure');
          }
        } catch (rollbackError) {
          callbacks?.onError?.(`Rollback failed: ${(rollbackError as any).message || rollbackError}`);
        }
      }
      
      throw error;
    }
    
    // Incremental pull: detect soft-deleted records and remove their local files.
    // Records deleted via __mj_DeletedAt won't appear in the UpdatedAt query,
    // so we need a separate check.
    // A multi-file pull removes soft-deleted entries from the file itself
    if (sinceTimestamp && !options.dryRun && !options.multiFile) {
      await this.removeDeletedRecordFiles(options, sinceTimestamp, targetDir, callbacks);
    }

    // Persist incremental state after a successful pull
    if (this.stateManager && (options.incremental || options.since)) {
      this.stateManager.setLastPullTimestamp(options.entity, new Date().toISOString());
      await this.stateManager.save();
    }

    return {
      ...pullResult,
      targetDir
    };
  }

  /** The CLI overrides of one pull; the update/create options keep their option names. */
  private pullOverridesFor(options: PullOptions): PullFieldOverrides {
    return {
      MergeStrategy: options.MergeStrategy,
      PreserveFields: options.PreserveFields,
      ExcludeFields: options.ExcludeFields,
      UpdateExistingRecords: options.updateExistingRecords,
      CreateNewFileIfNotFound: options.createNewFileIfNotFound,
    };
  }

  /** @deprecated Use {@link Pull}. */
  async pull(options: PullOptions, callbacks?: PullCallbacks): Promise<PullResult> {
    return this.Pull(options, callbacks);
  }
  
  private async processRecords(
    records: BaseEntity[],
    options: PullOptions,
    targetDir: string,
    entityConfig: EntityConfig,
    callbacks?: PullCallbacks,
    sinceTimestamp?: string
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
    
    // Pre-fetch all related entities in batch when there are multiple records
    const batchedRelatedData = await this.prefetchRelatedEntities(
      records, entityConfig, entityInfo, options.verbose, callbacks
    );

    // If multi-file flag is set, collect all records
    if (options.multiFile) {
      const fileName = options.multiFile.endsWith('.json') ? options.multiFile : `${options.multiFile}.json`;
      const filePath = path.join(targetDir, fileName);
      const existingRecords = await this.readMultiFile(filePath);
      const existingIndex = await this.buildMultiFileIndex(filePath, existingRecords, targetDir, entityConfig, entityInfo);
      existingIndex.ThrowIfUnsetKeyVariables(options.entity);

      const allRecords: RecordData[] = [];
      const matched = new Map<RecordData, RecordData>();
      const errors: string[] = [];
      const unsetKeyErrors: UnsetKeyErrorAt[] = [];

      // Process records in parallel for multi-file mode
      const recordPromises = records.map(async (record, index) => {
        try {
          const primaryKey = extractPrimaryKeyValues(record, entityInfo);
          const found = existingIndex.Find(primaryKey);
          const existing = found?.Record;
          // Only an entry of the target file is replaced in place; a record from another file is added
          const targetEntry = found?.FilePath === filePath ? existing : undefined;

          const recordData = await this.recordProcessor.processRecord(
            record,
            primaryKey,
            targetDir,
            entityConfig,
            options.verbose,
            !existing,
            existing,
            0,
            new Set(),
            undefined,
            batchedRelatedData
          );

          return { success: true, recordData, existing: targetEntry, index };
        } catch (error) {
          if (this.keepUnsetKeyError(error, index, filePath, options.entity, unsetKeyErrors)) {
            return { success: false, recordData: null, existing: undefined, index };
          }
          const errorMessage = `Failed to process record ${index + 1}: ${error instanceof Error ? error.message : String(error)}`;
          errors.push(errorMessage);
          callbacks?.onWarn?.(errorMessage);
          return { success: false, recordData: null, existing: undefined, index };
        }
      });

      const recordResults = await Promise.all(recordPromises);
      this.throwFirstUnsetKeyError(unsetKeyErrors);

      // Collect successful records
      for (const result of recordResults) {
        if (result.success && result.recordData) {
          allRecords.push(result.recordData);
          if (result.existing) {
            matched.set(result.existing, result.recordData);
          }
          processed++;
        }
      }

      if (options.verbose) {
        callbacks?.onProgress?.(`Processed ${processed}/${records.length} records in parallel`);
      }

      // A full pull writes the query result; an incremental pull updates the existing file
      if (sinceTimestamp) {
        const deleted = await this.softDeletedMultiFileEntries(options, sinceTimestamp, existingIndex, filePath, entityInfo, callbacks);
        if (allRecords.length > 0 || deleted.size > 0) {
          const kept = existingRecords.filter((existing) => !deleted.has(existing));
          this.fileWriteBatch.queueWrite(filePath, this.upsertMultiFileRecords(kept, matched, allRecords));
          callbacks?.onSuccess?.(`Queued ${processed} records for ${path.basename(filePath)}`);
        }
        if (deleted.size > 0) {
          callbacks?.onSuccess?.(`Removed ${deleted.size} entries for soft-deleted records from ${path.basename(filePath)}`);
        }
      } else if (allRecords.length > 0) {
        this.fileWriteBatch.queueWrite(filePath, allRecords);
        callbacks?.onSuccess?.(`Queued ${processed} records for ${path.basename(filePath)}`);
      }

      // If there were errors during parallel processing, throw them
      if (errors.length > 0) {
        throw new Error(`Multi-file processing completed with ${errors.length} errors:\n${errors.join('\n')}`);
      }
    } else {
      // Smart update logic for single-file-per-record
      const result = await this.processIndividualRecords(
        records,
        options,
        targetDir,
        entityConfig,
        entityInfo,
        callbacks,
        batchedRelatedData
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
  
  /**
   * The existing-record index of a multi-file pull: the target file's entries first, then the records
   * of the folder's other record files (found as a single-file pull finds them), so every `@env:`
   * reference is kept.
   * @throws when another record file cannot be read, before any write
   */
  private async buildMultiFileIndex(
    filePath: string,
    targetRecords: RecordData[],
    targetDir: string,
    entityConfig: EntityConfig,
    entityInfo: EntityInfo
  ): Promise<ExistingRecordIndex> {
    const filePattern = entityConfig.pull?.filePattern || entityConfig.filePattern || '*.json';
    const otherFiles = (await FindExistingRecordFiles(targetDir, filePattern, entityConfig.ignoreDirectories ?? []))
      .filter((other) => path.resolve(other) !== path.resolve(filePath));
    const otherEntries = await this.loadExistingRecords(otherFiles);
    const targetEntries = targetRecords.map((existing) => ({ Record: existing, FilePath: filePath, InArray: true }));
    return ExistingRecordIndex.Build([...targetEntries, ...otherEntries], entityInfo);
  }

  /**
   * Records in a multi-file target: none when the file does not exist or holds only whitespace, one for
   * a file that holds an object.
   * @throws when the file is not valid JSON, with the parse error as the cause
   */
  private async readMultiFile(filePath: string): Promise<RecordData[]> {
    if (!(await fs.pathExists(filePath))) {
      return [];
    }
    let content: RecordData | RecordData[];
    try {
      const text = await fs.readFile(filePath, 'utf8');
      if (text.trim() === '') {
        return [];
      }
      content = JSON.parse(text.replace(/^\uFEFF/, ''));
    } catch (cause) {
      throw new Error(`Cannot read ${filePath}. Pull does not overwrite a file it cannot read.`, { cause });
    }
    return Array.isArray(content) ? content : [content];
  }

  /**
   * The entries of a multi-file target whose rows were soft-deleted since the timestamp. Empty when
   * the entity has no soft-delete column or the query fails. Entries of other record files are left out.
   */
  private async softDeletedMultiFileEntries(
    options: PullOptions,
    sinceTimestamp: string,
    existingIndex: ExistingRecordIndex,
    filePath: string,
    entityInfo: EntityInfo,
    callbacks?: PullCallbacks
  ): Promise<Set<RecordData>> {
    const entries = new Set<RecordData>();
    const rows = await this.findSoftDeletedRows(options, sinceTimestamp, callbacks);
    for (const row of rows) {
      const key: PrimaryKeyValues = {};
      for (const pk of entityInfo.PrimaryKeys) {
        key[pk.Name] = row[pk.Name];
      }
      const entry = existingIndex.Find(key);
      if (entry && entry.FilePath === filePath) {
        entries.add(entry.Record);
      }
    }
    return entries;
  }

  /**
   * Rows soft-deleted since the timestamp (`__mj_DeletedAt`). Empty when the query fails, for example
   * for an entity with hard deletes; a verbose note says so.
   */
  private async findSoftDeletedRows(
    options: PullOptions,
    sinceTimestamp: string,
    callbacks?: PullCallbacks
  ): Promise<Record<string, unknown>[]> {
    try {
      if (!isValidISOTimestamp(sinceTimestamp)) {
        throw new Error('Invalid --since timestamp format. Expected ISO 8601 (e.g., 2026-04-07T10:00:00Z)');
      }
      const deletedFilter = `[__mj_DeletedAt] > '${sinceTimestamp}'`;
      const fullFilter = options.filter ? `(${options.filter}) AND ${deletedFilter}` : deletedFilter;
      const result = await new RunView().RunView<Record<string, unknown>>({
        EntityName: options.entity,
        ExtraFilter: fullFilter,
        ResultType: 'simple',
      }, this.contextUser);
      return result.Success ? result.Results : [];
    } catch {
      // The entity may not support soft deletes (__mj_DeletedAt column may not exist)
      if (options.verbose) {
        callbacks?.onLog?.(`   Note: could not check for deleted records (entity may use hard deletes)`);
      }
      return [];
    }
  }

  /** The existing entries with each matched entry replaced in place, then the pulled records that matched none. */
  private upsertMultiFileRecords(
    existingRecords: RecordData[],
    matched: Map<RecordData, RecordData>,
    pulled: RecordData[]
  ): RecordData[] {
    const replacements = new Set(matched.values());
    const result = existingRecords.map((existing) => matched.get(existing) ?? existing);
    for (const record of pulled) {
      if (!replacements.has(record)) {
        result.push(record);
      }
    }
    return result;
  }

  /**
   * Clean up backup files created during the pull operation
   * Should be called after successful pull operations to remove persistent backup files
   */
  async CleanupBackupFiles(): Promise<void> {
    if (this.createdBackupFiles.length === 0 && this.createdBackupDirs.size === 0) {
      return;
    }
    
    const errors: string[] = [];
    
    // Remove backup files
    for (const backupPath of this.createdBackupFiles) {
      try {
        if (await fs.pathExists(backupPath)) {
          await fs.remove(backupPath);
        }
      } catch (error) {
        errors.push(`Failed to remove backup file ${backupPath}: ${error instanceof Error ? error.message : String(error)}`);
      }
    }
    
    // Remove empty backup directories
    for (const backupDir of this.createdBackupDirs) {
      try {
        await this.removeEmptyBackupDirectory(backupDir);
      } catch (error) {
        errors.push(`Failed to remove backup directory ${backupDir}: ${error instanceof Error ? error.message : String(error)}`);
      }
    }
    
    // Clear the tracking arrays
    this.createdBackupFiles = [];
    this.createdBackupDirs.clear();
    
    if (errors.length > 0) {
      throw new Error(`Backup cleanup completed with errors:\n${errors.join('\n')}`);
    }
  }

  /** @deprecated Use {@link CleanupBackupFiles}. */
  async cleanupBackupFiles(): Promise<void> {
    return this.CleanupBackupFiles();
  }

  /**
   * Remove a backup directory if it's empty
   */
  private async removeEmptyBackupDirectory(backupDir: string): Promise<void> {
    try {
      // Check if directory exists
      if (!(await fs.pathExists(backupDir))) {
        return;
      }
      
      // Only remove if it's actually a .backups directory for safety
      if (!backupDir.endsWith('.backups')) {
        return;
      }
      
      // Check if directory is empty
      const files = await fs.readdir(backupDir);
      if (files.length === 0) {
        await fs.remove(backupDir);
      }
    } catch (error) {
      // Log error but don't throw - cleanup should be non-critical
      // The error will be caught by the caller and included in the error list
      throw error;
    }
  }
  
  /**
   * Get the list of backup files created during the current pull operation
   */
  GetCreatedBackupFiles(): string[] {
    return [...this.createdBackupFiles];
  }

  /** @deprecated Use {@link GetCreatedBackupFiles}. */
  getCreatedBackupFiles(): string[] {
    return this.GetCreatedBackupFiles();
  }
  
  /**
   * Detect records that were soft-deleted since the last pull and remove
   * their corresponding local JSON files. Without this, incremental pull
   * (which filters by __mj_UpdatedAt) would never notice deletions.
   */
  private async removeDeletedRecordFiles(
    options: PullOptions,
    sinceTimestamp: string,
    targetDir: string,
    callbacks?: PullCallbacks,
  ): Promise<void> {
    const rows = await this.findSoftDeletedRows(options, sinceTimestamp, callbacks);
    if (rows.length === 0) {
      return;
    }

    const entityInfo = this.syncEngine.getEntityInfo(options.entity);
    const pkField = entityInfo?.PrimaryKeys?.[0]?.Name ?? 'ID';

    let removed = 0;
    for (const record of rows) {
      const id = record[pkField];
      if (!id) continue;
      const name = typeof record.Name === 'string' ? record.Name : undefined;

      // Try common file naming patterns.
      // NOTE: This is a best-effort heuristic. If the entity uses a custom
      // file naming scheme (e.g., via newFileName config) these patterns may
      // miss. A single-file-per-entity layout is also not covered here.
      const candidates = [
        path.join(targetDir, `${id}.json`),
        path.join(targetDir, `${name ?? id}.json`),
        path.join(targetDir, `${(name ?? '').replace(/[^a-zA-Z0-9-_ ]/g, '')}.json`),
      ];

      try {
        for (const filePath of candidates) {
          if (await fs.pathExists(filePath)) {
            await fs.remove(filePath);
            removed++;
            if (options.verbose) {
              callbacks?.onLog?.(`   Removed deleted record file: ${path.basename(filePath)}`);
            }
            break;
          }
        }
      } catch {
        // Non-fatal: the file stays and the pull goes on
        if (options.verbose) {
          callbacks?.onLog?.(`   Note: could not remove the file of a deleted record`);
        }
      }
    }

    if (removed > 0) {
      callbacks?.onSuccess?.(`Removed ${removed} files for soft-deleted records`);
    }
  }

  /**
   * Rollback file changes by restoring from backup files
   * Called when pull operation fails after files have been modified
   * @returns the number of files restored
   */
  private async rollbackFileChanges(callbacks?: PullCallbacks): Promise<number> {
    if (this.createdBackupFiles.length === 0) {
      callbacks?.onLog?.('No backup files found - no rollback needed');
      return 0;
    }
    
    callbacks?.onProgress?.(`Rolling back ${this.createdBackupFiles.length} file changes...`);
    
    const errors: string[] = [];
    let restoredCount = 0;
    
    for (const backupPath of this.createdBackupFiles) {
      try {
        const originalFilePath = this.backupSources.get(backupPath);
        if (!originalFilePath) {
          errors.push(`No source recorded for backup ${backupPath}`);
          continue;
        }

        if (await fs.pathExists(backupPath)) {
          await fs.copy(backupPath, originalFilePath);
          restoredCount++;
        }
      } catch (error) {
        errors.push(`Failed to restore ${backupPath}: ${error instanceof Error ? error.message : String(error)}`);
      }
    }
    
    if (errors.length > 0) {
      throw new Error(`Rollback completed with ${errors.length} errors (${restoredCount} files restored):\n${errors.join('\n')}`);
    }
    
    callbacks?.onSuccess?.(`Successfully rolled back ${restoredCount} file changes`);
    return restoredCount;
  }
  
  private async processIndividualRecords(
    records: BaseEntity[],
    options: PullOptions,
    targetDir: string,
    entityConfig: EntityConfig,
    entityInfo: EntityInfo,
    callbacks?: PullCallbacks,
    batchedRelatedData?: Map<string, Map<string, BaseEntity[]>>
  ): Promise<{ processed: number; updated: number; created: number; skipped: number }> {
    let processed = 0;
    let updated = 0;
    let created = 0;
    let skipped = 0;
    
    // Find existing files
    const filePattern = entityConfig.pull?.filePattern || entityConfig.filePattern || '*.json';
    const existingFiles = await FindExistingRecordFiles(
      targetDir,
      filePattern,
      entityConfig.ignoreDirectories ?? []
    );
    
    if (options.verbose) {
      callbacks?.onLog?.(`Found ${existingFiles.length} existing files matching pattern '${filePattern}'`);
      existingFiles.forEach(f => callbacks?.onLog?.(`  - ${path.basename(f)}`));
    }
    
    // Load existing records and index them by the resolved primary key
    const existingEntries = await this.loadExistingRecords(existingFiles);
    const existingIndex = ExistingRecordIndex.Build(existingEntries, entityInfo);
    existingIndex.ThrowIfUnsetKeyVariables(options.entity);

    if (options.verbose) {
      callbacks?.onLog?.(`Loaded ${existingEntries.length} existing records from files`);
      if (existingIndex.DuplicateCount > 0) {
        callbacks?.onLog?.(`${existingIndex.DuplicateCount} existing records repeat a primary key; the first one in file order is used`);
      }
    }

    // Separate records into new and existing
    const newRecords: Array<{ record: BaseEntity; primaryKey: Record<string, any> }> = [];
    const existingRecordsToUpdate: Array<{ record: BaseEntity; primaryKey: PrimaryKeyValues; existing: ExistingRecordEntry }> = [];

    for (const record of records) {
      const primaryKey = extractPrimaryKeyValues(record, entityInfo);
      const existing = existingIndex.Find(primaryKey);

      if (existing) {
        // Record exists locally
        if (entityConfig.pull?.updateExistingRecords !== false) {
          existingRecordsToUpdate.push({ record, primaryKey, existing });
        } else {
          skipped++;
          if (options.verbose) {
            callbacks?.onLog?.(`Skipping existing record: ${ExistingRecordIndex.FileLookupOf(existing.Record)}`);
          }
        }
      } else {
        // Record doesn't exist locally
        if (entityConfig.pull?.createNewFileIfNotFound !== false) {
          newRecords.push({ record, primaryKey });
        } else {
          skipped++;
          if (options.verbose) {
            callbacks?.onLog?.(`Skipping new record (createNewFileIfNotFound=false): ${createPrimaryKeyLookup(primaryKey)}`);
          }
        }
      }
    }
    
    const errors: string[] = [];
    const unsetKeyErrors: UnsetKeyErrorAt[] = [];

    // Process existing records updates in parallel
    if (existingRecordsToUpdate.length > 0) {
      callbacks?.onProgress?.(`Updating existing records (parallel processing)`);

      const mergeStrategy = entityConfig.pull?.mergeStrategy || 'merge';
      const updatePromises = existingRecordsToUpdate.map(async ({ record, primaryKey, existing }, index) => {
        const filePath = existing.FilePath ?? '';
        if (mergeStrategy === 'skip') {
          if (options.verbose) {
            callbacks?.onLog?.(`Skipped (mergeStrategy=skip): ${filePath}`);
          }
          return { success: true, skipped: true, index };
        }
        try {
          // Backups are taken for every file the batch will rewrite, just before it flushes.
          const existingRecordData: RecordData = existing.Record;
          
          // Process the new record data (isNewRecord = false for updates)
          const newRecordData = await this.recordProcessor.processRecord(
            record,
            primaryKey,
            targetDir,
            entityConfig,
            options.verbose,
            false,
            existingRecordData,
            0,
            new Set(),
            undefined,
            batchedRelatedData
          );
          
          // Apply merge strategy
          const mergedData = await this.mergeRecords(
            existingRecordData,
            newRecordData,
            mergeStrategy,
            entityConfig.pull?.preserveFields || []
          );
          // A field left out because it holds an env value does not come back from the existing file
          for (const fieldName of this.recordProcessor.EnvOmittedFieldsOf(newRecordData)) {
            delete mergedData.fields[fieldName];
          }
          
          // Queue updated data for batched write
          if (existing.InArray) {
            // The batch finds the entry by the key the file holds
            this.fileWriteBatch.queueArrayUpdate(filePath, mergedData, ExistingRecordIndex.FileLookupOf(existingRecordData));
          } else {
            // Queue single record update
            this.fileWriteBatch.queueSingleUpdate(filePath, mergedData);
          }
          
          if (options.verbose) {
            callbacks?.onLog?.(`Updated: ${filePath}`);
          }
          
          return { success: true, skipped: false, index };
        } catch (error) {
          if (this.keepUnsetKeyError(error, index, filePath, options.entity, unsetKeyErrors)) {
            return { success: false, skipped: false, index };
          }
          const errorMessage = `Failed to update record ${index + 1}: ${(error as any).message || error}`;
          errors.push(errorMessage);
          callbacks?.onWarn?.(errorMessage);
          return { success: false, skipped: false, index };
        }
      });
      
      const updateResults = await Promise.all(updatePromises);
      updated = updateResults.filter(r => r.success && !r.skipped).length;
      skipped += updateResults.filter(r => r.skipped).length;
      processed += updated;
      
      if (options.verbose) {
        callbacks?.onSuccess?.(`Completed ${updated}/${existingRecordsToUpdate.length} record updates`);
      }
    }
    
    // Process new records in parallel
    if (newRecords.length > 0) {
      callbacks?.onProgress?.(`Creating new records (parallel processing)`);
      
      if (entityConfig.pull?.appendRecordsToExistingFile && entityConfig.pull?.newFileName) {
        // Append all new records to a single file using parallel processing
        const fileName = entityConfig.pull.newFileName.endsWith('.json') 
          ? entityConfig.pull.newFileName 
          : `${entityConfig.pull.newFileName}.json`;
        const filePath = path.join(targetDir, fileName);
        
        // Process all new records in parallel
        const newRecordPromises = newRecords.map(async ({ record, primaryKey }, index) => {
          try {
            // For new records, pass isNewRecord = true (default)
            const recordData = await this.recordProcessor.processRecord(
              record,
              primaryKey,
              targetDir,
              entityConfig,
              options.verbose,
              true,
              undefined,
              0,
              new Set(),
              undefined,
              batchedRelatedData
            );
            
            // Use queueArrayUpdate to append the new record without overwriting existing updates
            // For new records, we can use a special lookup key since they don't exist yet
            const newRecordLookup = createPrimaryKeyLookup(primaryKey);
            this.fileWriteBatch.queueArrayUpdate(filePath, recordData, newRecordLookup);
            
            return { success: true, index };
          } catch (error) {
            if (this.keepUnsetKeyError(error, existingRecordsToUpdate.length + index, filePath, options.entity, unsetKeyErrors)) {
              return { success: false, index };
            }
            const errorMessage = `Failed to process new record ${index + 1}: ${(error as any).message || error}`;
            errors.push(errorMessage);
            callbacks?.onWarn?.(errorMessage);
            return { success: false, index };
          }
        });
        
        const newRecordResults = await Promise.all(newRecordPromises);
        created = newRecordResults.filter(r => r.success).length;
        processed += created;
        
        if (options.verbose) {
          callbacks?.onLog?.(`Queued ${created} new records for: ${filePath}`);
        }
      } else {
        // Create individual files for each new record in parallel
        const individualRecordPromises = newRecords.map(async ({ record, primaryKey }, index) => {
          try {
            await this.processRecord(record, primaryKey, targetDir, entityConfig, options.verbose, batchedRelatedData);
            return { success: true, index };
          } catch (error) {
            if (this.keepUnsetKeyError(error, existingRecordsToUpdate.length + index, undefined, options.entity, unsetKeyErrors)) {
              return { success: false, index };
            }
            const errorMessage = `Failed to process new record ${index + 1}: ${(error as any).message || error}`;
            errors.push(errorMessage);
            callbacks?.onWarn?.(errorMessage);
            return { success: false, index };
          }
        });
        
        const individualResults = await Promise.all(individualRecordPromises);
        created = individualResults.filter(r => r.success).length;
        processed += created;
        
        if (options.verbose) {
          callbacks?.onSuccess?.(`Created ${created}/${newRecords.length} individual record files`);
        }
      }
    }
    
    this.throwFirstUnsetKeyError(unsetKeyErrors);

    // If there were errors during parallel processing, throw them
    if (errors.length > 0) {
      throw new Error(`Parallel processing completed with ${errors.length} errors:\n${errors.join('\n')}`);
    }
    
    return { processed, updated, created, skipped };
  }
  
  /**
   * Keeps an unset key variable error, with the record file and the pulled entity in its message,
   * so the pull rethrows it as is. Returns false for any other error.
   */
  private keepUnsetKeyError(
    error: unknown,
    index: number,
    filePath: string | undefined,
    pulledEntityName: string,
    into: UnsetKeyErrorAt[]
  ): boolean {
    if (!(error instanceof UnsetPrimaryKeyVariableError)) {
      return false;
    }
    into.push({ Index: index, Error: error.InRecordFile(filePath, pulledEntityName) });
    return true;
  }

  /** @throws the kept UnsetPrimaryKeyVariableError of the lowest record index, when there is one */
  private throwFirstUnsetKeyError(errors: ReadonlyArray<UnsetKeyErrorAt>): void {
    if (errors.length > 0) {
      throw errors.reduce((first, next) => (next.Index < first.Index ? next : first)).Error;
    }
  }

  private async processRecord(
    record: BaseEntity,
    primaryKey: Record<string, any>,
    targetDir: string,
    entityConfig: EntityConfig,
    verbose?: boolean,
    batchedRelatedData?: Map<string, Map<string, BaseEntity[]>>
  ): Promise<void> {
    const recordData = await this.recordProcessor.processRecord(
      record,
      primaryKey,
      targetDir,
      entityConfig,
      verbose,
      true,
      undefined,
      0,
      new Set(),
      undefined,
      batchedRelatedData
    );
    
    // Determine file path
    const fileName = this.buildFileName(primaryKey, entityConfig);
    const filePath = path.join(targetDir, fileName);
    
    // Queue JSON file for batched write with controlled property order
    this.fileWriteBatch.queueWrite(filePath, recordData);
  }

  



  /**
   * Pre-fetch all related entities in batch for all parent records.
   * Returns undefined if no related entities are configured or only 1 record.
   * Only pre-fetches top-level relations; nested relations fall back to per-record loading.
   */
  private async prefetchRelatedEntities(
    records: BaseEntity[],
    entityConfig: EntityConfig,
    entityInfo: EntityInfo,
    verbose?: boolean,
    callbacks?: PullCallbacks
  ): Promise<Map<string, Map<string, BaseEntity[]>> | undefined> {
    if (!entityConfig.pull?.relatedEntities || records.length <= 1) {
      return undefined;
    }

    const relatedEntityEntries = Object.entries(entityConfig.pull.relatedEntities);
    if (relatedEntityEntries.length === 0) {
      return undefined;
    }

    // Extract all parent primary key values using the entity's actual PK field name
    const pkFieldName = entityInfo.FirstPrimaryKey.Name; // first-pk-ok: parent ids feed the related entity's foreignKey IN (...) filter; FK targets are single-column by design
    const allParentIds: string[] = [];
    for (const record of records) {
      const id = record.Get(pkFieldName);
      if (id != null) {
        allParentIds.push(String(id));
      }
    }

    if (allParentIds.length === 0) {
      return undefined;
    }

    if (verbose) {
      callbacks?.onLog?.(`Batch pre-fetching related entities for ${allParentIds.length} parent records`);
    }

    const batchedRelatedData = new Map<string, Map<string, BaseEntity[]>>();

    for (const [relationKey, relationConfig] of relatedEntityEntries) {
      try {
        const batchResults = await this.recordProcessor.batchPrefetchRelatedEntities(
          allParentIds,
          relationConfig,
          verbose
        );
        batchedRelatedData.set(relationKey, batchResults);

        if (verbose) {
          const totalRelated = Array.from(batchResults.values()).reduce((sum, arr) => sum + arr.length, 0);
          callbacks?.onLog?.(`  ${relationKey}: ${totalRelated} related records across ${batchResults.size} parents`);
        }
      } catch (error: unknown) {
        if (verbose) {
          const message = error instanceof Error ? error.message : String(error);
          callbacks?.onWarn?.(`Failed to batch pre-fetch ${relationKey}: ${message}`);
        }
        // Don't add to batchedRelatedData — processRelatedEntities will fall back to per-record
      }
    }

    return batchedRelatedData.size > 0 ? batchedRelatedData : undefined;
  }
  
  /**
   * Reads every record in the files.
   * @throws when a file cannot be read, before any write: a record in it could otherwise be written again as new
   */
  private async loadExistingRecords(files: string[]): Promise<ExistingRecordEntry[]> {
    const entries: ExistingRecordEntry[] = [];
    for (const filePath of files) {
      let fileData: RecordData | RecordData[];
      try {
        fileData = await fs.readJson(filePath);
      } catch (cause) {
        throw new Error(
          `Cannot read ${filePath}. Pull does not write new records while a record file in the folder cannot be read.`,
          { cause }
        );
      }
      const records = Array.isArray(fileData) ? fileData : [fileData];
      for (const record of records) {
        if (record?.primaryKey) {
          entries.push({ Record: record, FilePath: filePath, InArray: Array.isArray(fileData) });
        }
      }
    }
    return entries;
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
  
  private buildFileName(primaryKey: Record<string, any>, _entityConfig: EntityConfig): string {
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
      // Create result with correct property order: fields, relatedEntities, primaryKey, sync
      const result: RecordData = {
        fields: { ...newData.fields }
      } as RecordData;

      // Restore preserved fields from existing
      if (preserveFields.length > 0 && existing.fields) {
        for (const field of preserveFields) {
          if (field in existing.fields) {
            result.fields[field] = existing.fields[field];
          }
        }
      }

      // Add relatedEntities before primaryKey and sync
      if (newData.relatedEntities) {
        result.relatedEntities = newData.relatedEntities;
      }

      result.primaryKey = newData.primaryKey;
      result.sync = newData.sync;

      return result;
    }

    // Default 'merge' strategy - create with correct property order
    const result: RecordData = {
      fields: { ...existing.fields, ...newData.fields }
    } as RecordData;

    // Restore preserved fields
    if (preserveFields.length > 0 && existing.fields) {
      for (const field of preserveFields) {
        if (field in existing.fields) {
          result.fields[field] = existing.fields[field];
        }
      }
    }

    // Add relatedEntities before primaryKey and sync
    if (existing.relatedEntities || newData.relatedEntities) {
      result.relatedEntities = {
        ...existing.relatedEntities,
        ...newData.relatedEntities
      };
    }

    result.primaryKey = newData.primaryKey || existing.primaryKey;
    result.sync = newData.sync;

    return result;
  }
  
  /**
   * Backs up each existing file the write batch is about to rewrite, once per file. Files the
   * batch will create fresh have nothing to back up.
   */
  private async backupPendingFiles(backupDirName: string | undefined, verbose: boolean | undefined, callbacks?: PullCallbacks): Promise<void> {
    for (const filePath of this.fileWriteBatch.getPendingFiles()) {
      if (!(await fs.pathExists(filePath))) {
        continue;
      }
      const backupPath = await this.createBackup(filePath, backupDirName);
      if (verbose) {
        callbacks?.onLog?.(`Backed up ${path.basename(filePath)} → ${path.relative(path.dirname(filePath), backupPath)}`);
      }
    }
  }

  /**
   * Copies `filePath` to a timestamped `.backup` file under `backupDirName` (default `.backups`,
   * relative to the file's directory). Throws if the copy fails: a pull asked to back up must not
   * go on to rewrite a file it could not back up.
   */
  private async createBackup(filePath: string, backupDirName?: string): Promise<string> {
    const dir = path.dirname(filePath);
    const fileName = path.basename(filePath);
    const backupDir = resolveBackupDirectory(dir, backupDirName);

    // Ensure backup directory exists
    await fs.ensureDir(backupDir);
    this.createdBackupDirs.add(backupDir);

    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    // Remove .json extension, add timestamp, then add .backup extension
    const backupFileName = fileName.replace(/\.json$/, `.${timestamp}.backup`);
    const backupPath = path.join(backupDir, backupFileName);

    try {
      await fs.copy(filePath, backupPath);
    } catch (error) {
      throw new Error(`Failed to back up ${filePath} to ${backupPath}: ${error instanceof Error ? error.message : String(error)}`);
    }
    this.createdBackupFiles.push(backupPath);
    this.backupSources.set(backupPath, filePath);
    return backupPath;
  }
}