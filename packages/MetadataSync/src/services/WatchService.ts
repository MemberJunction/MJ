import crypto from 'crypto';
import fs from 'fs-extra';
import path from 'path';
import chokidar, { type FSWatcher } from 'chokidar';
import { BaseEntity, Metadata } from '@memberjunction/core';
import { SyncEngine, RecordData, SyncResolutionCollector } from '../lib/sync-engine';
import { OptionalEnvMissingError, OptionalEnvSkipMessage } from '../lib/env-reference';
import { EnvDisplayMask, MaskedError } from '../lib/env-display';
import { EnvSqlLog, AddSkippedOptionalEnvField } from '../lib/env-sql-redactor';
import { CreatedRecordKeyFields } from '../lib/created-record-key';
import { EntityFieldName, RecordFieldNames } from '../lib/entity-field-names';
import { WatchFileFilter } from '../lib/watch-file-filter';
import { METADATA_KEYWORDS } from '../constants/metadata-keywords';
import { LoadEntityConfig, SyncConfig } from '../config';
import { ResolvePushFolders, SkippedDirectoryMessage } from '../lib/push-directories';
import type { SkippedDirectory } from '../lib/push-when';
import { configManager } from '../lib/config-manager';
import { JsonWriteHelper } from '../lib/json-write-helper';
import type { SqlLoggingSession } from '@memberjunction/generic-database-provider';

export interface WatchOptions {
  dir?: string;
  debounceMs?: number;
  ignorePatterns?: string[];
}

export interface WatchCallbacks {
  onFileAdd?: (filePath: string, entityDir: string, entityConfig: any) => void;
  onFileChange?: (filePath: string, entityDir: string, entityConfig: any) => void;
  onFileDelete?: (filePath: string, entityDir: string, entityConfig: any) => void;
  onLog?: (message: string) => void;
  onWarn?: (message: string) => void;
  onError?: (error: Error) => void;
  onRecordCreated?: (entity: BaseEntity, entityConfig: any) => void;
  onRecordUpdated?: (entity: BaseEntity, changes: any, entityConfig: any) => void;
  onRecordSaved?: (entity: BaseEntity, isNew: boolean, entityConfig: any) => void;
}

export interface WatchResult {
  watchers: FSWatcher[];
  stop: () => Promise<void>;
  /** Entity folders that pushWhen left out when the watch started. */
  SkippedDirectories: SkippedDirectory[];
}

export class WatchService {
  private syncEngine: SyncEngine;
  private debounceTimers: Map<string, NodeJS.Timeout> = new Map();
  /** For each record file watch wrote back, the hash of the content it wrote. */
  private ownWrites: Map<string, string> = new Map();
  private sqlLoggingSession: SqlLoggingSession | null = null;
  /** Leaves env-sourced field values out of the watch SQL log; null when no log is open. */
  private envSqlLog: EnvSqlLog | null = null;
  
  constructor(syncEngine: SyncEngine) {
    this.syncEngine = syncEngine;
  }
  
  async Watch(options: WatchOptions = {}, callbacks?: WatchCallbacks): Promise<WatchResult> {
    // Folders are chosen as push chooses them; pushWhen is read once, here
    const folders = await ResolvePushFolders(configManager.getOriginalCwd(), options.dir);
    const selection = folders.SelectDirectories();
    for (const skipped of selection.Skipped) {
      callbacks?.onWarn?.(SkippedDirectoryMessage(folders.ConfigDir, skipped));
    }
    const entityDirs = selection.Included;
    if (entityDirs.length === 0) {
      throw new Error('No entity directories to watch: pushWhen skips every folder');
    }
    
    callbacks?.onLog?.(`Watching ${entityDirs.length} entity ${entityDirs.length === 1 ? 'directory' : 'directories'} for changes`);
    
    // The SQL log, the redactor and the lookup-create hook are closed together if the start fails
    const watchers: FSWatcher[] = [];
    try {
      await this.setupSqlLogging(folders.SyncConfig, callbacks);
      await this.addWatchers(entityDirs, options, watchers, callbacks);
    } catch (error) {
      // A watcher that fails to close does not stop the cleanup or replace the start error
      await Promise.allSettled(watchers.map(w => w.close()));
      await this.closeSqlLogging(callbacks);
      throw error;
    }
    
    return {
      watchers,
      SkippedDirectories: selection.Skipped,
      stop: async () => {
        // Clear all debounce timers
        for (const timer of this.debounceTimers.values()) {
          clearTimeout(timer);
        }
        this.debounceTimers.clear();
        
        // Close all watchers
        await Promise.all(watchers.map(w => w.close()));
        
        await this.closeSqlLogging(callbacks);
      }
    };
  }

  /** Starts one watcher for each entity folder and adds it to `watchers`. */
  private async addWatchers(
    entityDirs: string[],
    options: WatchOptions,
    watchers: FSWatcher[],
    callbacks?: WatchCallbacks
  ): Promise<void> {
    for (const entityDir of entityDirs) {
      const entityConfig = await LoadEntityConfig(entityDir);
      if (!entityConfig) {
        callbacks?.onWarn?.(`Skipping ${entityDir} - no valid entity configuration`);
        continue;
      }
      
      callbacks?.onLog?.(`Watching ${entityConfig.entity} in ${entityDir}`);
      
      // chokidar watches the folder; the filter picks record files and external files
      const filter = new WatchFileFilter(entityDir, entityConfig.filePattern, options.ignorePatterns);
      const watcher = chokidar.watch(entityDir, {
        ignored: filter.Ignored,
        persistent: true,
        ignoreInitial: true
      });
      const onFile = (filePath: string, handle: () => void) => {
        if (filter.Accepts(filePath)) {
          handle();
        }
      };
      
      watcher
        .on('add', (filePath) => onFile(filePath, () => {
          callbacks?.onFileAdd?.(filePath, entityDir, entityConfig);
          this.handleFileChange(filePath, 'added', entityDir, entityConfig, options, callbacks);
        }))
        .on('change', (filePath) => onFile(filePath, () => {
          callbacks?.onFileChange?.(filePath, entityDir, entityConfig);
          this.handleFileChange(filePath, 'changed', entityDir, entityConfig, options, callbacks);
        }))
        .on('unlink', (filePath) => onFile(filePath, () => {
          callbacks?.onFileDelete?.(filePath, entityDir, entityConfig);
          this.handleFileChange(filePath, 'deleted', entityDir, entityConfig, options, callbacks);
        }));
      
      watchers.push(watcher);
    }
  }

  /** Disposes the SQL log session, gives the redactor's warnings, and closes the redactor and its hook. */
  private async closeSqlLogging(callbacks?: WatchCallbacks): Promise<void> {
    try {
      if (this.sqlLoggingSession) {
        const sqlLogPath = this.sqlLoggingSession.filePath;
        await this.sqlLoggingSession.dispose();
        this.sqlLoggingSession = null;
        if (await fs.pathExists(sqlLogPath)) {
          callbacks?.onLog?.(`📝 SQL log written to: ${sqlLogPath}`);
          for (const warning of this.envSqlLog?.Redactor.Warnings(sqlLogPath) ?? []) {
            callbacks?.onWarn?.(warning);
          }
        }
      }
    } catch (error) {
      callbacks?.onWarn?.(`Failed to close SQL logging session: ${error}`);
    } finally {
      this.closeEnvSqlLog();
    }
  }

  /** @deprecated Use {@link Watch}. */
  async watch(options: WatchOptions = {}, callbacks?: WatchCallbacks): Promise<WatchResult> {
    return this.Watch(options, callbacks);
  }
  
  private handleFileChange(
    filePath: string,
    event: string,
    entityDir: string,
    entityConfig: any,
    options: WatchOptions,
    callbacks?: WatchCallbacks
  ): void {
    // Clear existing debounce timer
    const existingTimer = this.debounceTimers.get(filePath);
    if (existingTimer) {
      clearTimeout(existingTimer);
    }
    
    // Set new debounce timer
    const debounceMs = options.debounceMs || 1000;
    const timer = setTimeout(async () => {
      this.debounceTimers.delete(filePath);
      
      try {
        if (event !== 'deleted' && (await this.isOwnWrite(filePath))) {
          return;
        }
        const relativePath = path.relative(entityDir, filePath);
        callbacks?.onLog?.(`File ${event}: ${relativePath}`);
        
        if (event === 'deleted') {
          // Handle deletion
          callbacks?.onLog?.('File deletion detected - manual database cleanup may be required');
        } else if (filePath.endsWith('.json')) {
          // Handle JSON file change
          await this.syncJsonFile(filePath, entityDir, entityConfig, callbacks);
        } else {
          // Handle external file change
          await this.syncExternalFile(filePath, entityDir, entityConfig, callbacks);
        }
      } catch (error) {
        const errorMessage = `Failed to sync ${filePath}: ${(error as any).message || error}`;
        callbacks?.onWarn?.(errorMessage);
        if (error instanceof Error) {
          callbacks?.onError?.(error);
        }
      }
    }, debounceMs);
    
    this.debounceTimers.set(filePath, timer);
  }
  
  /** Keeps the hash of the content watch just wrote to the file. */
  private async rememberOwnWrite(filePath: string): Promise<void> {
    this.ownWrites.set(filePath, await this.contentHash(filePath));
  }

  /**
   * True when the file still holds the content watch last wrote to it (one write can fire more than
   * one event). The entry is cleared at the first event with other content, which is synced.
   */
  private async isOwnWrite(filePath: string): Promise<boolean> {
    const written = this.ownWrites.get(filePath);
    if (written === undefined) {
      return false;
    }
    if ((await this.contentHash(filePath)) === written) {
      return true;
    }
    this.ownWrites.delete(filePath);
    return false;
  }

  private async contentHash(filePath: string): Promise<string> {
    return crypto.createHash('sha256').update(await fs.readFile(filePath)).digest('hex');
  }

  private async syncJsonFile(
    filePath: string,
    entityDir: string,
    entityConfig: any,
    callbacks?: WatchCallbacks
  ): Promise<void> {
    const recordData: RecordData = await fs.readJson(filePath);
    const baseDir = path.dirname(filePath);
    
    // Keep original fields for file writing
    const originalFields = { ...recordData.fields };

    // Field name → the variables whose values went into it; used for masking and the SQL log
    const resolutionCollector: SyncResolutionCollector = { notes: [], fieldPrefix: 'primaryKey', EnvFields: new Map() };
    const envMask = new EnvDisplayMask(resolutionCollector.EnvFields);
    
    // Build defaults from the record file's folders
    const defaultsCollector: SyncResolutionCollector = { notes: [], fieldPrefix: 'fields', EnvFields: new Map() };
    const skippedDefaults = new Map<string, string>();
    const defaults = await this.syncEngine.buildDefaults(filePath, entityConfig, defaultsCollector, skippedDefaults);

    const resolvedPrimaryKey = recordData.primaryKey
      ? await this.resolvePrimaryKey(recordData.primaryKey, baseDir, resolutionCollector)
      : undefined;
    
    // Load or create entity
    let entity: BaseEntity | null = null;
    let isNew = false;
    
    if (resolvedPrimaryKey) {
      entity = await this.syncEngine.loadEntity(entityConfig.entity, resolvedPrimaryKey);
    }
    
    if (!entity) {
      // New record; UUID generation happens in BaseEntity.NewRecord(), and an @env: key field gets its resolved value
      entity = await this.syncEngine.createEntityObject(entityConfig.entity);
      entity.NewRecord();
      isNew = true;
      for (const [pkField, pkValue] of Object.entries(recordData.primaryKey ?? {})) {
        if (isEnvKeyValue(pkValue)) {
          entity.Set(pkField, resolvedPrimaryKey?.[pkField]);
        }
      }
    }
    
    // Field names match the entity's fields without case and are set with the entity's spelling; other names (virtual properties) are set as written
    const recordFields = new RecordFieldNames(recordData.fields);

    // A default left out for an unset optional variable warns when the record would have used it
    for (const [field, variableName] of skippedDefaults) {
      const name = EntityFieldName(entity, field) ?? (field in entity ? field : undefined);
      if (name && !recordFields.Has(name)) {
        callbacks?.onWarn?.(OptionalEnvSkipMessage(entityConfig.entity, name, variableName));
        AddSkippedOptionalEnvField(resolutionCollector.EnvFields, name, variableName);
      }
    }

    // Apply defaults only to fields the record does not set
    for (const [field, value] of Object.entries(defaults)) {
      const name = EntityFieldName(entity, field) ?? (field in entity ? field : undefined);
      if (name && !recordFields.Has(name)) {
        entity.Set(name, value);
        const variables = defaultsCollector.EnvFields?.get(field);
        if (variables) {
          resolutionCollector.EnvFields?.set(name, variables);
        }
      }
    }
    
    // Apply record fields with processed values for database operations
    resolutionCollector.fieldPrefix = 'fields';
    for (const [field, value] of Object.entries(recordData.fields)) {
      const name = EntityFieldName(entity, field) ?? field;
      try {
        const processedValue = await this.syncEngine.processFieldValue(value, baseDir, null, null, 0, undefined, resolutionCollector, name);
        entity.Set(name, processedValue);
      } catch (error) {
        if (!(error instanceof OptionalEnvMissingError)) {
          throw error;
        }
        callbacks?.onWarn?.(OptionalEnvSkipMessage(entityConfig.entity, name, error.VariableName));
        AddSkippedOptionalEnvField(resolutionCollector.EnvFields, name, error.VariableName);
      }
    }
    
    // Check if the record is dirty before saving
    let wasActuallyUpdated = false;
    let changes: Record<string, unknown> | null = null;
    
    if (!isNew && entity.Dirty) {
      // Record is dirty, get the changes
      changes = entity.GetChangesSinceLastSave();
      const changeKeys = Object.keys(changes);
      if (changeKeys.length > 0) {
        wasActuallyUpdated = true;
        
        // Get primary key info for display
        const entityInfo = this.syncEngine.getEntityInfo(entityConfig.entity);
        const primaryKeyDisplay: string[] = [];
        if (entityInfo) {
          for (const pk of entityInfo.PrimaryKeys) {
            primaryKeyDisplay.push(`${pk.Name}: ${envMask.NewValue(pk.Name, String(entity.Get(pk.Name)))}`);
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
          const newValue = changes[fieldName];
          callbacks?.onLog?.(`     ${fieldName}: ${envMask.OldValue(fieldName, String(oldValue))} → ${envMask.NewValue(fieldName, String(newValue))}`);
        }
        
        callbacks?.onRecordUpdated?.(entity, changes, entityConfig);
      }
    } else if (isNew) {
      wasActuallyUpdated = true;
      callbacks?.onRecordCreated?.(entity, entityConfig);
    }
    
    // A save that writes logs the full save SQL (logRecordChangeMetadata), so every env field is in the statement
    if (wasActuallyUpdated) {
      this.envSqlLog?.Redactor.RegisterEntityFields(entity, resolutionCollector.EnvFields, true);
    }

    // Save the record; error text is masked for every variable resolved so far
    const keyFields = this.syncEngine.getEntityInfo(entityConfig.entity)?.PrimaryKeys ?? [];
    const keyBeforeSave = new Map(keyFields.map((pk) => [pk.Name, entity.Get(pk.Name)]));
    const errorTextMask = EnvDisplayMask.ForVariables(this.syncEngine.ResolvedEnvVariables);
    let saved: boolean;
    try {
      saved = await entity.Save();
    } catch (saveError) {
      throw MaskedError(saveError, errorTextMask);
    }
    if (!saved) {
      const message = entity.LatestResult?.Message;
      if (message) {
        throw new Error(`Failed to save record: ${errorTextMask.MaskText(message)}`);
      }
      
      const errors = entity.LatestResult?.Errors?.map(err => 
        typeof err === 'string' ? err : (err?.message || JSON.stringify(err))
      )?.join(', ') || 'Unknown error';
      throw new Error(`Failed to save record: ${errorTextMask.MaskText(errors)}`);
    }
    
    if (wasActuallyUpdated) {
      callbacks?.onLog?.(`Successfully ${isNew ? 'created' : 'updated'} ${entityConfig.entity} record`);
      callbacks?.onRecordSaved?.(entity, isNew, entityConfig);
    } else {
      callbacks?.onLog?.(`No changes detected for ${entityConfig.entity} record - skipped update`);
    }
    
    // Update the local file with primary key and sync metadata
    if (wasActuallyUpdated) {
      const entityInfo = this.syncEngine.getEntityInfo(entityConfig.entity);
      if (entityInfo) {
        // Update primary key for new records
        if (isNew) {
          const newPrimaryKey: Record<string, any> = {};
          // An env-sourced key keeps the file's reference unless the database assigned another value
          for (const key of CreatedRecordKeyFields(entityInfo.PrimaryKeys, entity, keyBeforeSave, recordData.primaryKey, originalFields, envMask)) {
            newPrimaryKey[key.Name] = key.FileValue;
          }
          recordData.primaryKey = newPrimaryKey;
        }
        
        // Always update sync metadata when the record was updated - use original fields for checksum
        recordData.sync = {
          lastModified: new Date().toISOString(),
          checksum: await this.syncEngine.calculateChecksumWithFileContent(originalFields, path.dirname(filePath))
        };
        
        // Restore original field values to preserve @ references
        recordData.fields = originalFields;
        
        // Write back to file
        await JsonWriteHelper.writeOrderedRecordData(filePath, recordData);
        await this.rememberOwnWrite(filePath);
      }
    }
  }
  
  /**
   * The key used to load the record: an `@env:` value is resolved (a malformed or unset reference
   * throws); other values are used as written.
   */
  private async resolvePrimaryKey(
    primaryKey: Record<string, unknown>,
    baseDir: string,
    resolutionCollector: SyncResolutionCollector
  ): Promise<Record<string, unknown>> {
    const resolved: Record<string, unknown> = {};
    for (const [pkField, pkValue] of Object.entries(primaryKey)) {
      resolved[pkField] = isEnvKeyValue(pkValue)
        ? await this.syncEngine.processFieldValue(pkValue, baseDir, null, null, 0, undefined, resolutionCollector, pkField)
        : pkValue;
    }
    return resolved;
  }

  private async syncExternalFile(
    filePath: string,
    entityDir: string,
    entityConfig: any,
    callbacks?: WatchCallbacks
  ): Promise<void> {
    // Find the corresponding JSON file
    const fileName = path.basename(filePath);
    const parts = fileName.split('.');
    
    if (parts.length >= 3) {
      // Format: uuid.fieldname.ext
      const jsonFileName = `${parts[0]}.json`;
      const fieldName = parts[1];
      const jsonFilePath = path.join(path.dirname(filePath), jsonFileName);
      
      if (await fs.pathExists(jsonFilePath)) {
        // Update the JSON file's sync metadata to trigger a sync
        const recordData: RecordData = await fs.readJson(jsonFilePath);
        recordData.sync = {
          lastModified: new Date().toISOString(),
          checksum: recordData.sync?.checksum || ''
        };
        await JsonWriteHelper.writeOrderedRecordData(jsonFilePath, recordData);
        
        callbacks?.onLog?.(`Updated sync metadata for ${jsonFileName} due to external file change`);
      }
    }
  }
  
  private async setupSqlLogging(syncConfig: SyncConfig | null, callbacks?: WatchCallbacks): Promise<void> {
    try {
      if (syncConfig?.sqlLogging?.enabled) {
        const provider = Metadata.Provider as any; // SQLServerDataProvider // global-provider-ok: metadata sync operates on the configured provider only
        
        if (provider && typeof provider.CreateSqlLogger === 'function') {
          // Generate filename with timestamp
          const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
          const filename = syncConfig.sqlLogging?.formatAsMigration 
            ? `MetadataSync_Watch_${timestamp}.sql`
            : `watch_${timestamp}.sql`;
          
          // Use .sql-log-watch directory in the working directory
          const outputDir = path.join(configManager.getOriginalCwd(), '.sql-log-watch');
          const filepath = path.join(outputDir, filename);
          
          // Ensure the directory exists
          await fs.ensureDir(outputDir);
          
          // Create the SQL logging session
          this.envSqlLog = new EnvSqlLog(this.syncEngine);
          this.sqlLoggingSession = await provider.CreateSqlLogger(filepath, {
            TransformStatement: this.envSqlLog.Redactor.Transform,
            formatAsMigration: syncConfig.sqlLogging?.formatAsMigration || false,
            description: 'MetadataSync watch operation',
            logRecordChangeMetadata: true,
            // batchSeparator is intentionally omitted — CreateSqlLogger injects the platform-appropriate
            // separator automatically (GO for SQL Server, nothing for PostgreSQL) via PlatformBatchSeparator.
            variableBatchThreshold: syncConfig.sqlLogging?.variableBatchThreshold ?? 200,
          });
          
          callbacks?.onLog?.(`📝 SQL logging enabled: ${filepath}`);
        }
      }
    } catch (error) {
      // An open session keeps its redactor
      if (!this.sqlLoggingSession) {
        this.closeEnvSqlLog();
      }
      callbacks?.onWarn?.(`Failed to setup SQL logging: ${error}`);
    }
  }

  /** Drops the SQL log redactor and its lookup-create hook, after the log is closed. */
  private closeEnvSqlLog(): void {
    this.envSqlLog?.Close();
    this.envSqlLog = null;
  }
}

/** True for a key value written as an `@env:` reference, valid or not. */
function isEnvKeyValue(value: unknown): value is string {
  return typeof value === 'string' && value.startsWith(METADATA_KEYWORDS.ENV);
}
