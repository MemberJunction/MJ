import fs from 'fs-extra';
import path from 'path';
import chokidar from 'chokidar';
import { BaseEntity } from '@memberjunction/core';
import { SyncEngine, RecordData } from '../lib/sync-engine';
import { loadEntityConfig } from '../config';
import { findEntityDirectories } from '../lib/provider-utils';

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
  watchers: chokidar.FSWatcher[];
  stop: () => Promise<void>;
}

export class WatchService {
  private syncEngine: SyncEngine;
  private debounceTimers: Map<string, NodeJS.Timeout> = new Map();
  
  constructor(syncEngine: SyncEngine) {
    this.syncEngine = syncEngine;
  }
  
  async watch(options: WatchOptions = {}, callbacks?: WatchCallbacks): Promise<WatchResult> {
    const entityDirs = findEntityDirectories(process.cwd(), options.dir);
    
    if (entityDirs.length === 0) {
      throw new Error('No entity directories found');
    }
    
    callbacks?.onLog?.(`Watching ${entityDirs.length} entity ${entityDirs.length === 1 ? 'directory' : 'directories'} for changes`);
    
    // Set up watchers
    const watchers: chokidar.FSWatcher[] = [];
    
    for (const entityDir of entityDirs) {
      const entityConfig = await loadEntityConfig(entityDir);
      if (!entityConfig) {
        callbacks?.onWarn?.(`Skipping ${entityDir} - no valid entity configuration`);
        continue;
      }
      
      callbacks?.onLog?.(`Watching ${entityConfig.entity} in ${entityDir}`);
      
      // Watch for JSON files and external files
      const patterns = [
        path.join(entityDir, entityConfig.filePattern || '**/*.json'),
        path.join(entityDir, '**/*.md'),
        path.join(entityDir, '**/*.txt'),
        path.join(entityDir, '**/*.html'),
        path.join(entityDir, '**/*.liquid'),
        path.join(entityDir, '**/*.sql')
      ];
      
      const ignored = [
        '**/node_modules/**',
        '**/.git/**',
        '**/.mj-sync.json',
        '**/.mj-folder.json',
        '**/*.backup',
        ...(options.ignorePatterns || [])
      ];
      
      const watcher = chokidar.watch(patterns, {
        ignored,
        persistent: true,
        ignoreInitial: true
      });
      
      watcher
        .on('add', (filePath) => {
          callbacks?.onFileAdd?.(filePath, entityDir, entityConfig);
          this.handleFileChange(filePath, 'added', entityDir, entityConfig, options, callbacks);
        })
        .on('change', (filePath) => {
          callbacks?.onFileChange?.(filePath, entityDir, entityConfig);
          this.handleFileChange(filePath, 'changed', entityDir, entityConfig, options, callbacks);
        })
        .on('unlink', (filePath) => {
          callbacks?.onFileDelete?.(filePath, entityDir, entityConfig);
          this.handleFileChange(filePath, 'deleted', entityDir, entityConfig, options, callbacks);
        });
      
      watchers.push(watcher);
    }
    
    return {
      watchers,
      stop: async () => {
        // Clear all debounce timers
        for (const timer of this.debounceTimers.values()) {
          clearTimeout(timer);
        }
        this.debounceTimers.clear();
        
        // Close all watchers
        await Promise.all(watchers.map(w => w.close()));
      }
    };
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
  
  private async syncJsonFile(
    filePath: string,
    entityDir: string,
    entityConfig: any,
    callbacks?: WatchCallbacks
  ): Promise<void> {
    const recordData: RecordData = await fs.readJson(filePath);
    
    // Build defaults
    const defaults = await this.syncEngine.buildDefaults(filePath, entityConfig);
    
    // Load or create entity
    let entity: BaseEntity | null = null;
    let isNew = false;
    
    if (recordData.primaryKey) {
      entity = await this.syncEngine.loadEntity(entityConfig.entity, recordData.primaryKey);
    }
    
    if (!entity) {
      // New record
      entity = await this.syncEngine.createEntityObject(entityConfig.entity);
      entity.NewRecord();
      isNew = true;
    }
    
    // Apply defaults first
    for (const [field, value] of Object.entries(defaults)) {
      if (field in entity) {
        (entity as any)[field] = value;
      }
    }
    
    // Apply record fields
    for (const [field, value] of Object.entries(recordData.fields)) {
      if (field in entity) {
        const processedValue = await this.syncEngine.processFieldValue(value, path.dirname(filePath));
        (entity as any)[field] = processedValue;
      }
    }
    
    // Check if the record is dirty before saving
    let wasActuallyUpdated = false;
    let changes: any = null;
    
    if (!isNew && entity.Dirty) {
      // Record is dirty, get the changes
      changes = (entity as any).GetChangesSinceLastSave();
      const changeKeys = Object.keys(changes);
      if (changeKeys.length > 0) {
        wasActuallyUpdated = true;
        
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
          callbacks?.onLog?.(`     ${fieldName}: ${oldValue} → ${newValue}`);
        }
        
        callbacks?.onRecordUpdated?.(entity, changes, entityConfig);
      }
    } else if (isNew) {
      wasActuallyUpdated = true;
      callbacks?.onRecordCreated?.(entity, entityConfig);
    }
    
    // Save the record
    const saved = await entity.Save();
    if (!saved) {
      const message = entity.LatestResult?.Message;
      if (message) {
        throw new Error(`Failed to save record: ${message}`);
      }
      
      const errors = entity.LatestResult?.Errors?.map(err => 
        typeof err === 'string' ? err : (err?.message || JSON.stringify(err))
      )?.join(', ') || 'Unknown error';
      throw new Error(`Failed to save record: ${errors}`);
    }
    
    if (wasActuallyUpdated) {
      callbacks?.onLog?.(`Successfully ${isNew ? 'created' : 'updated'} ${entityConfig.entity} record`);
      callbacks?.onRecordSaved?.(entity, isNew, entityConfig);
    } else {
      callbacks?.onLog?.(`No changes detected for ${entityConfig.entity} record - skipped update`);
    }
    
    // Update the local file with new primary key if created
    if (isNew) {
      const entityInfo = this.syncEngine.getEntityInfo(entityConfig.entity);
      if (entityInfo) {
        const newPrimaryKey: Record<string, any> = {};
        for (const pk of entityInfo.PrimaryKeys) {
          newPrimaryKey[pk.Name] = entity.Get(pk.Name);
        }
        recordData.primaryKey = newPrimaryKey;
        
        // Update sync metadata
        recordData.sync = {
          lastModified: new Date().toISOString(),
          checksum: this.syncEngine.calculateChecksum(recordData.fields)
        };
        
        // Write back to file
        await fs.writeJson(filePath, recordData, { spaces: 2 });
      }
    }
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
        await fs.writeJson(jsonFilePath, recordData, { spaces: 2 });
        
        callbacks?.onLog?.(`Updated sync metadata for ${jsonFileName} due to external file change`);
      }
    }
  }
}