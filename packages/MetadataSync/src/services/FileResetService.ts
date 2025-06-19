import fs from 'fs-extra';
import path from 'path';
import fastGlob from 'fast-glob';
import { loadSyncConfig } from '../config';
import { configManager } from '../lib/config-manager';

export interface FileResetOptions {
  sections?: 'both' | 'primaryKey' | 'sync';
  dryRun?: boolean;
  noBackup?: boolean;
  verbose?: boolean;
}

export interface FileResetCallbacks {
  onProgress?: (message: string) => void;
  onLog?: (message: string) => void;
  onWarn?: (message: string) => void;
  onConfirm?: (message: string) => Promise<boolean>;
}

export interface FileResetResult {
  processedFiles: number;
  modifiedFiles: number;
  totalPrimaryKeys: number;
  totalSyncs: number;
  filesWithPrimaryKey: number;
  filesWithSync: number;
  backupsCreated: number;
}

export interface FileStats {
  primaryKeyCount: number;
  syncCount: number;
}

export class FileResetService {
  
  async resetFiles(options: FileResetOptions = {}, callbacks?: FileResetCallbacks): Promise<FileResetResult> {
    const sections = options.sections || 'both';
    
    // Load sync config
    const syncConfig = await loadSyncConfig(configManager.getOriginalCwd());
    if (!syncConfig) {
      throw new Error('No .mj-sync.json found in current directory');
    }
    
    // Find all metadata JSON files
    callbacks?.onProgress?.('Finding metadata files');
    const pattern = syncConfig.filePattern || '.*.json';
    const files = await fastGlob(pattern, {
      cwd: configManager.getOriginalCwd(),
      absolute: true,
      ignore: ['.mj-sync.json', '.mj-folder.json'],
    });
    
    if (files.length === 0) {
      callbacks?.onLog?.('No metadata files found');
      return {
        processedFiles: 0,
        modifiedFiles: 0,
        totalPrimaryKeys: 0,
        totalSyncs: 0,
        filesWithPrimaryKey: 0,
        filesWithSync: 0,
        backupsCreated: 0
      };
    }
    
    callbacks?.onLog?.(`Found ${files.length} metadata file${files.length === 1 ? '' : 's'}`);
    
    // Count what will be removed
    let filesWithPrimaryKey = 0;
    let filesWithSync = 0;
    let totalPrimaryKeys = 0;
    let totalSyncs = 0;
    
    for (const file of files) {
      const content = await fs.readJson(file);
      const stats = this.countSections(content);
      if (stats.primaryKeyCount > 0) {
        filesWithPrimaryKey++;
        totalPrimaryKeys += stats.primaryKeyCount;
      }
      if (stats.syncCount > 0) {
        filesWithSync++;
        totalSyncs += stats.syncCount;
      }
    }
    
    // Report what will be removed
    if (sections === 'both' || sections === 'primaryKey') {
      callbacks?.onLog?.(`Will remove ${totalPrimaryKeys} primaryKey section${totalPrimaryKeys === 1 ? '' : 's'} from ${filesWithPrimaryKey} file${filesWithPrimaryKey === 1 ? '' : 's'}`);
    }
    if (sections === 'both' || sections === 'sync') {
      callbacks?.onLog?.(`Will remove ${totalSyncs} sync section${totalSyncs === 1 ? '' : 's'} from ${filesWithSync} file${filesWithSync === 1 ? '' : 's'}`);
    }
    
    if (options.dryRun) {
      callbacks?.onLog?.('Dry run mode - no files will be modified');
      
      if (options.verbose) {
        for (const file of files) {
          const content = await fs.readJson(file);
          const stats = this.countSections(content);
          if (stats.primaryKeyCount > 0 || stats.syncCount > 0) {
            callbacks?.onLog?.(`${path.relative(configManager.getOriginalCwd(), file)}:`);
            if (stats.primaryKeyCount > 0) {
              callbacks?.onLog?.(`  - ${stats.primaryKeyCount} primaryKey section${stats.primaryKeyCount === 1 ? '' : 's'}`);
            }
            if (stats.syncCount > 0) {
              callbacks?.onLog?.(`  - ${stats.syncCount} sync section${stats.syncCount === 1 ? '' : 's'}`);
            }
          }
        }
      }
      
      return {
        processedFiles: files.length,
        modifiedFiles: 0,
        totalPrimaryKeys,
        totalSyncs,
        filesWithPrimaryKey,
        filesWithSync,
        backupsCreated: 0
      };
    }
    
    // Process files
    callbacks?.onProgress?.('Processing files');
    let processedFiles = 0;
    let modifiedFiles = 0;
    let backupsCreated = 0;
    
    for (const file of files) {
      processedFiles++;
      const content = await fs.readJson(file);
      const originalContent = JSON.stringify(content);
      
      // Remove sections
      const cleanedContent = this.removeSections(content, sections);
      
      // Only write if content changed
      if (JSON.stringify(cleanedContent) !== originalContent) {
        // Create backup if requested
        if (!options.noBackup) {
          const backupPath = `${file}.backup`;
          await fs.writeJson(backupPath, content, { spaces: 2 });
          backupsCreated++;
        }
        
        // Write cleaned content
        await fs.writeJson(file, cleanedContent, { spaces: 2 });
        modifiedFiles++;
        
        if (options.verbose) {
          callbacks?.onLog?.(`✓ ${path.relative(configManager.getOriginalCwd(), file)}`);
        }
      }
    }
    
    return {
      processedFiles,
      modifiedFiles,
      totalPrimaryKeys,
      totalSyncs,
      filesWithPrimaryKey,
      filesWithSync,
      backupsCreated
    };
  }
  
  private countSections(data: any): FileStats {
    let primaryKeyCount = 0;
    let syncCount = 0;
    
    if (Array.isArray(data)) {
      for (const item of data) {
        const stats = this.countSections(item);
        primaryKeyCount += stats.primaryKeyCount;
        syncCount += stats.syncCount;
      }
    } else if (data && typeof data === 'object') {
      if ('primaryKey' in data) primaryKeyCount++;
      if ('sync' in data) syncCount++;
      
      // Check related entities
      if (data.relatedEntities) {
        for (const entityData of Object.values(data.relatedEntities)) {
          const stats = this.countSections(entityData);
          primaryKeyCount += stats.primaryKeyCount;
          syncCount += stats.syncCount;
        }
      }
    }
    
    return { primaryKeyCount, syncCount };
  }
  
  private removeSections(data: any, sections: string): any {
    if (Array.isArray(data)) {
      return data.map(item => this.removeSections(item, sections));
    } else if (data && typeof data === 'object') {
      const cleaned = { ...data };
      
      // Remove specified sections
      if (sections === 'both' || sections === 'primaryKey') {
        delete cleaned.primaryKey;
      }
      if (sections === 'both' || sections === 'sync') {
        delete cleaned.sync;
      }
      
      // Process related entities
      if (cleaned.relatedEntities) {
        const cleanedRelated: any = {};
        for (const [entityName, entityData] of Object.entries(cleaned.relatedEntities)) {
          cleanedRelated[entityName] = this.removeSections(entityData, sections);
        }
        cleaned.relatedEntities = cleanedRelated;
      }
      
      return cleaned;
    }
    
    return data;
  }
}