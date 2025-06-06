import path from 'path';
import fs from 'fs-extra';
import crypto from 'crypto';
import axios from 'axios';
import { EntityInfo, Metadata, RunView, BaseEntity, CompositeKey, UserInfo, IEntityDataProvider } from '@memberjunction/core';
import { EntityConfig, FolderConfig } from '../config';

export interface RecordData {
  _primaryKey: Record<string, any>;
  _fields: Record<string, any>;
  _sync?: {
    lastModified: string;
    checksum: string;
  };
}

export class SyncEngine {
  private metadata: Metadata;
  private provider: IEntityDataProvider;
  
  constructor(provider: IEntityDataProvider) {
    this.metadata = new Metadata();
    this.provider = provider;
  }
  
  async initialize(): Promise<void> {
    // Initialize metadata
    await this.metadata.Refresh();
  }
  
  /**
   * Process special references in field values
   */
  async processFieldValue(value: any, baseDir: string): Promise<any> {
    if (typeof value !== 'string') {
      return value;
    }
    
    // Check for @file: reference
    if (value.startsWith('@file:')) {
      const filePath = value.substring(6);
      const fullPath = path.resolve(baseDir, filePath);
      
      if (await fs.pathExists(fullPath)) {
        return await fs.readFile(fullPath, 'utf-8');
      } else {
        throw new Error(`File not found: ${fullPath}`);
      }
    }
    
    // Check for @url: reference
    if (value.startsWith('@url:')) {
      const url = value.substring(5);
      
      try {
        const response = await axios.get(url);
        return response.data;
      } catch (error) {
        throw new Error(`Failed to fetch URL: ${url} - ${error}`);
      }
    }
    
    // Check for @lookup: reference
    if (value.startsWith('@lookup:')) {
      const lookupStr = value.substring(8);
      const match = lookupStr.match(/^(.+?)\.(.+?)=(.+)$/);
      
      if (match) {
        const [, entityName, fieldName, fieldValue] = match;
        return await this.resolveLookup(entityName, fieldName, fieldValue);
      } else {
        throw new Error(`Invalid lookup format: ${value}`);
      }
    }
    
    // Check for @env: reference
    if (value.startsWith('@env:')) {
      const envVar = value.substring(5);
      const envValue = process.env[envVar];
      
      if (envValue === undefined) {
        throw new Error(`Environment variable not found: ${envVar}`);
      }
      
      return envValue;
    }
    
    return value;
  }
  
  /**
   * Resolve a lookup reference to an ID
   */
  async resolveLookup(entityName: string, fieldName: string, fieldValue: string): Promise<string> {
    const rv = new RunView();
    const result = await rv.RunView({
      EntityName: entityName,
      ExtraFilter: `${fieldName} = '${fieldValue.replace(/'/g, "''")}'`,
      MaxRows: 1
    });
    
    if (result.Success && result.Results.length > 0) {
      const entityInfo = this.metadata.EntityByName(entityName);
      if (entityInfo && entityInfo.PrimaryKeys.length > 0) {
        const pkeyField = entityInfo.PrimaryKeys[0].Name;
        return result.Results[0][pkeyField];
      }
    }
    
    throw new Error(`Lookup failed: ${entityName}.${fieldName}=${fieldValue}`);
  }
  
  /**
   * Build cascading defaults for a file path
   */
  async buildDefaults(filePath: string, entityConfig: EntityConfig): Promise<Record<string, any>> {
    const parts = path.dirname(filePath).split(path.sep);
    let defaults: Record<string, any> = { ...entityConfig.defaults };
    
    // Walk up the directory tree building defaults
    let currentPath = '';
    for (const part of parts) {
      currentPath = path.join(currentPath, part);
      const folderConfig = await this.loadFolderConfig(currentPath);
      
      if (folderConfig?.defaults) {
        defaults = { ...defaults, ...folderConfig.defaults };
      }
    }
    
    return defaults;
  }
  
  /**
   * Load folder configuration
   */
  private async loadFolderConfig(dir: string): Promise<FolderConfig | null> {
    const configPath = path.join(dir, '.mj-folder.json');
    
    if (await fs.pathExists(configPath)) {
      try {
        return await fs.readJson(configPath);
      } catch (error) {
        console.error(`Error loading folder config at ${configPath}:`, error);
        return null;
      }
    }
    
    return null;
  }
  
  /**
   * Calculate checksum for data
   */
  calculateChecksum(data: any): string {
    const hash = crypto.createHash('sha256');
    hash.update(JSON.stringify(data, null, 2));
    return hash.digest('hex');
  }
  
  /**
   * Get entity info by name
   */
  getEntityInfo(entityName: string): EntityInfo | null {
    return this.metadata.EntityByName(entityName);
  }
  
  /**
   * Create a new entity object
   */
  async createEntityObject(entityName: string): Promise<BaseEntity> {
    const entity = await this.metadata.GetEntityObject(entityName);
    if (!entity) {
      throw new Error(`Failed to create entity object for: ${entityName}`);
    }
    return entity;
  }
  
  /**
   * Load an entity by primary key
   */
  async loadEntity(entityName: string, primaryKey: Record<string, any>): Promise<BaseEntity | null> {
    const entity = await this.createEntityObject(entityName);
    const entityInfo = this.getEntityInfo(entityName);
    
    if (!entityInfo) {
      throw new Error(`Entity not found: ${entityName}`);
    }
    
    // Handle composite keys
    const compositeKey = new CompositeKey();
    compositeKey.LoadFromSimpleObject(primaryKey);
    const loaded = await entity.InnerLoad(compositeKey);
    
    return loaded ? entity : null;
  }
}