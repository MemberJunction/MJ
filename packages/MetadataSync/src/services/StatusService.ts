import fs from 'fs-extra';
import path from 'path';
import fastGlob from 'fast-glob';
import { SyncEngine, RecordData } from '../lib/sync-engine';
import { loadEntityConfig } from '../config';
import { findEntityDirectories } from '../lib/provider-utils';

export interface StatusOptions {
  dir?: string;
}

export interface StatusCallbacks {
  onProgress?: (message: string) => void;
  onLog?: (message: string) => void;
  onWarn?: (message: string) => void;
}

export interface StatusResult {
  new: number;
  modified: number;
  deleted: number;
  unchanged: number;
}

export interface EntityStatusResult {
  entityName: string;
  directory: string;
  new: number;
  modified: number;
  deleted: number;
  unchanged: number;
}

export class StatusService {
  private syncEngine: SyncEngine;
  
  constructor(syncEngine: SyncEngine) {
    this.syncEngine = syncEngine;
  }
  
  async checkStatus(options: StatusOptions, callbacks?: StatusCallbacks): Promise<{
    summary: StatusResult;
    details: EntityStatusResult[];
  }> {
    const entityDirs = findEntityDirectories(process.cwd(), options.dir);
    
    if (entityDirs.length === 0) {
      throw new Error('No entity directories found');
    }
    
    callbacks?.onLog?.(`Found ${entityDirs.length} entity ${entityDirs.length === 1 ? 'directory' : 'directories'} to check`);
    
    const details: EntityStatusResult[] = [];
    let totalNew = 0;
    let totalModified = 0;
    let totalDeleted = 0;
    let totalUnchanged = 0;
    
    for (const entityDir of entityDirs) {
      const entityConfig = await loadEntityConfig(entityDir);
      if (!entityConfig) {
        callbacks?.onWarn?.(`Skipping ${entityDir} - no valid entity configuration`);
        continue;
      }
      
      callbacks?.onLog?.(`Checking ${entityConfig.entity} in ${entityDir}`);
      
      const result = await this.checkEntityDirectory(
        entityDir,
        entityConfig,
        callbacks
      );
      
      details.push({
        entityName: entityConfig.entity,
        directory: entityDir,
        ...result
      });
      
      totalNew += result.new;
      totalModified += result.modified;
      totalDeleted += result.deleted;
      totalUnchanged += result.unchanged;
      
      // Report directory summary
      if (result.new > 0 || result.modified > 0 || result.deleted > 0) {
        callbacks?.onLog?.(`  New: ${result.new}, Modified: ${result.modified}, Deleted: ${result.deleted}, Unchanged: ${result.unchanged}`);
      } else {
        callbacks?.onLog?.(`  All ${result.unchanged} records are up to date`);
      }
    }
    
    return {
      summary: {
        new: totalNew,
        modified: totalModified,
        deleted: totalDeleted,
        unchanged: totalUnchanged
      },
      details
    };
  }
  
  private async checkEntityDirectory(
    entityDir: string,
    entityConfig: any,
    callbacks?: StatusCallbacks
  ): Promise<StatusResult> {
    const result: StatusResult = { new: 0, modified: 0, deleted: 0, unchanged: 0 };
    
    // Find files matching the configured pattern
    const pattern = entityConfig.filePattern || '*.json';
    const jsonFiles = await fastGlob(pattern, {
      cwd: entityDir,
      ignore: ['.mj-sync.json', '.mj-folder.json', '**/*.backup'],
      dot: true  // Include dotfiles (files starting with .)
    });
    
    for (const file of jsonFiles) {
      try {
        const filePath = path.join(entityDir, file);
        const recordData: RecordData = await fs.readJson(filePath);
        
        if (recordData.primaryKey) {
          // Check if record exists in database
          const entity = await this.syncEngine.loadEntity(entityConfig.entity, recordData.primaryKey);
          
          if (!entity) {
            result.deleted++;
          } else {
            // Check if modified
            const currentChecksum = this.syncEngine.calculateChecksum(recordData.fields);
            if (recordData.sync?.checksum !== currentChecksum) {
              result.modified++;
            } else {
              result.unchanged++;
            }
          }
        } else {
          // New record
          result.new++;
        }
        
      } catch (error) {
        callbacks?.onWarn?.(`Failed to check ${file}: ${error}`);
      }
    }
    
    // Recursively process subdirectories
    const entries = await fs.readdir(entityDir, { withFileTypes: true });
    for (const entry of entries) {
      if (entry.isDirectory() && !entry.name.startsWith('.')) {
        const subDir = path.join(entityDir, entry.name);
        
        // Load subdirectory config and merge with parent config
        let subEntityConfig = { ...entityConfig };
        const subDirConfig = await loadEntityConfig(subDir);
        
        if (subDirConfig) {
          // Check if this is a new entity type (has different entity name)
          if (subDirConfig.entity && subDirConfig.entity !== entityConfig.entity) {
            // This is a different entity type, skip it (will be processed separately)
            continue;
          }
          
          // Merge defaults: parent defaults + subdirectory overrides
          subEntityConfig = {
            ...entityConfig,
            ...subDirConfig,
            defaults: {
              ...entityConfig.defaults,
              ...(subDirConfig.defaults || {})
            }
          };
        }
        
        // Process subdirectory with merged config
        const subResult = await this.checkEntityDirectory(
          subDir,
          subEntityConfig,
          callbacks
        );
        
        result.new += subResult.new;
        result.modified += subResult.modified;
        result.deleted += subResult.deleted;
        result.unchanged += subResult.unchanged;
      }
    }
    
    return result;
  }
}