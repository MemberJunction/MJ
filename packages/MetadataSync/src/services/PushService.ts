import fs from 'fs-extra';
import path from 'path';
import fastGlob from 'fast-glob';
import { BaseEntity, LogStatus, Metadata, UserInfo, CompositeKey } from '@memberjunction/core';
import { SyncEngine, RecordData } from '../lib/sync-engine';
import { loadEntityConfig } from '../config';
import { FileBackupManager } from '../lib/file-backup-manager';
import { configManager } from '../lib/config-manager';

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
  
  constructor(syncEngine: SyncEngine, contextUser: UserInfo) {
    this.syncEngine = syncEngine;
    this.contextUser = contextUser;
  }
  
  async push(options: PushOptions, callbacks?: PushCallbacks): Promise<PushResult> {
    this.warnings = [];
    this.processedRecords.clear();
    
    const fileBackupManager = new FileBackupManager();
    
    try {
      // Find entity directories to process
      const entityDirs = this.findEntityDirectories(configManager.getOriginalCwd(), options.dir);
      
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
          callbacks
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
      
      // Commit file backups if successful and not in dry-run mode
      if (!options.dryRun && totalErrors === 0) {
        await fileBackupManager.cleanup();
        if (options.verbose) {
          callbacks?.onLog?.('✅ File backups committed');
        }
      }
      
      return {
        created: totalCreated,
        updated: totalUpdated,
        unchanged: totalUnchanged,
        errors: totalErrors,
        warnings: this.warnings
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
      ignore: ['**/node_modules/**', '**/.mj-*.json']
    });
    
    if (options.verbose) {
      callbacks?.onLog?.(`Found ${files.length} files to process`);
    }
    
    // Process each file
    for (const filePath of files) {
      try {
        const fileData = await fs.readJson(filePath);
        const records = Array.isArray(fileData) ? fileData : [fileData];
        
        for (let i = 0; i < records.length; i++) {
          const recordData = records[i];
          
          if (!this.isValidRecordData(recordData)) {
            callbacks?.onWarn?.(`Invalid record format in ${filePath}${Array.isArray(fileData) ? ` at index ${i}` : ''}`);
            errors++;
            continue;
          }
          
          try {
            const result = await this.processRecord(
              recordData,
              entityConfig,
              entityDir,
              options,
              callbacks
            );
            
            if (result === 'created') created++;
            else if (result === 'updated') updated++;
            else if (result === 'unchanged') unchanged++;
            
            // Track processed record
            const recordKey = this.getRecordKey(recordData, entityConfig.entity);
            this.processedRecords.set(recordKey, {
              filePath,
              arrayIndex: Array.isArray(fileData) ? i : undefined,
              lineNumber: i + 1 // Simple line number approximation
            });
            
          } catch (recordError) {
            const errorMsg = `Error processing record in ${filePath}${Array.isArray(fileData) ? ` at index ${i}` : ''}: ${recordError}`;
            callbacks?.onError?.(errorMsg);
            errors++;
          }
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
    callbacks?: PushCallbacks
  ): Promise<'created' | 'updated' | 'unchanged' | 'error'> {
    const metadata = new Metadata();
    const entityInfo = metadata.EntityByName(entityConfig.entity);
    
    if (!entityInfo) {
      throw new Error(`Entity ${entityConfig.entity} not found in metadata`);
    }
    
    // Get or create entity instance
    const entity = await metadata.GetEntityObject(entityConfig.entity, this.contextUser);
    if (!entity) {
      throw new Error(`Failed to create entity object for ${entityConfig.entity}`);
    }
    
    // Apply defaults from configuration
    const defaults = { ...entityConfig.defaults };
    
    // Build full record data
    const fullData = {
      ...defaults,
      ...recordData.fields
    };
    
    // Process field values
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
    let existingEntity: BaseEntity | null = null;
    
    if (primaryKey && Object.keys(primaryKey).length > 0) {
      // Try to load existing record
      const compositeKey = new CompositeKey();
      compositeKey.LoadFromSimpleObject(primaryKey);
      existingEntity = await metadata.GetEntityObject(entityConfig.entity, this.contextUser);
      if (existingEntity) {
        exists = await existingEntity.InnerLoad(compositeKey);
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
    
    // Set field values
    for (const [fieldName, fieldValue] of Object.entries(processedData)) {
      entity.Set(fieldName, fieldValue);
    }
    
    // Handle related entities
    if (recordData.relatedEntities) {
      // Store related entities to process after parent save
      (entity as any).__pendingRelatedEntities = recordData.relatedEntities;
    }
    
    // Save the record
    const saveResult = await entity.Save();
    
    if (!saveResult) {
      throw new Error(`Failed to save ${entityConfig.entity} record: ${entity.LatestResult?.Message || 'Unknown error'}`);
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
    
    return exists ? 'updated' : 'created';
  }
  
  private async processRelatedEntities(
    parentEntity: BaseEntity,
    relatedEntities: Record<string, RecordData[]>,
    entityDir: string,
    options: PushOptions,
    callbacks?: PushCallbacks
  ): Promise<void> {
    // This is a simplified version - full implementation would process
    // related entities with proper parent references
    for (const [key, records] of Object.entries(relatedEntities)) {
      for (const relatedRecord of records) {
        // Process @parent references
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
        
        // Save related entity (simplified - full implementation needed)
        relatedRecord.fields = processedFields;
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
        dirs.push(fullPath);
      }
    } else {
      // Find all entity directories
      const searchDirs = (dir: string) => {
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
              searchDirs(fullPath);
            }
          }
        }
      };
      
      searchDirs(baseDir);
    }
    
    return dirs;
  }
}