import { cosmiconfigSync } from 'cosmiconfig';
import path from 'path';
import fs from 'fs-extra';

export interface MJConfig {
  dbHost: string;
  dbPort?: number;
  dbDatabase: string;
  dbUsername: string;
  dbPassword: string;
  dbTrustServerCertificate?: string;
  dbEncrypt?: string;  // Add explicit encrypt option
  dbInstanceName?: string;
  mjCoreSchema?: string;
  [key: string]: any; // Allow other properties
}

export interface SyncConfig {
  version: string;
  push?: {
    validateBeforePush?: boolean;
    requireConfirmation?: boolean;
  };
  watch?: {
    debounceMs?: number;
    ignorePatterns?: string[];
  };
}

export interface RelatedEntityConfig {
  entity: string;
  foreignKey: string; // Field that links to parent (e.g., "PromptID")
  filter?: string; // Additional filter
  relatedEntities?: Record<string, RelatedEntityConfig>; // Nested related entities
}

export interface EntityConfig {
  entity: string;
  filePattern?: string;
  defaults?: Record<string, any>;
  pull?: {
    filter?: string; // Default filter for pulling records
    relatedEntities?: Record<string, RelatedEntityConfig>;
  };
}

export interface FolderConfig {
  defaults: Record<string, any>;
}

export function loadMJConfig(): MJConfig | null {
  try {
    const explorer = cosmiconfigSync('mj');
    const result = explorer.search(process.cwd());
    
    if (!result || !result.config) {
      throw new Error('No mj.config.cjs found');
    }
    
    return result.config;
  } catch (error) {
    console.error('Error loading MJ config:', error);
    return null;
  }
}

export async function loadSyncConfig(dir: string): Promise<SyncConfig | null> {
  const configPath = path.join(dir, '.mj-sync.json');
  
  if (await fs.pathExists(configPath)) {
    try {
      return await fs.readJson(configPath);
    } catch (error) {
      console.error('Error loading sync config:', error);
      return null;
    }
  }
  
  return null;
}

export async function loadEntityConfig(dir: string): Promise<EntityConfig | null> {
  const configPath = path.join(dir, '.mj-sync.json');
  
  if (await fs.pathExists(configPath)) {
    try {
      const config = await fs.readJson(configPath);
      if (config.entity) {
        return config;
      }
    } catch (error) {
      console.error('Error loading entity config:', error);
    }
  }
  
  return null;
}

export async function loadFolderConfig(dir: string): Promise<FolderConfig | null> {
  const configPath = path.join(dir, '.mj-folder.json');
  
  if (await fs.pathExists(configPath)) {
    try {
      return await fs.readJson(configPath);
    } catch (error) {
      console.error('Error loading folder config:', error);
      return null;
    }
  }
  
  return null;
}