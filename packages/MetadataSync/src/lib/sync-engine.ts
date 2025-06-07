import path from 'path';
import fs from 'fs-extra';
import crypto from 'crypto';
import axios from 'axios';
import { EntityInfo, Metadata, RunView, BaseEntity, CompositeKey, UserInfo } from '@memberjunction/core';
import { EntityConfig, FolderConfig } from '../config';

export interface RecordData {
  primaryKey?: Record<string, any>;
  fields: Record<string, any>;
  relatedEntities?: Record<string, RecordData[]>;
  sync?: {
    lastModified: string;
    checksum: string;
  };
}

export class SyncEngine {
  private metadata: Metadata;
  private contextUser: UserInfo;

  constructor(contextUser: UserInfo) {
    this.metadata = new Metadata();
    this.contextUser = contextUser;
  }
  
  async initialize(): Promise<void> {
    // Initialize metadata
    await this.metadata.Refresh();
  }
  
  /**
   * Process special references in field values
   */
  async processFieldValue(value: any, baseDir: string, parentRecord?: BaseEntity | null, rootRecord?: BaseEntity | null): Promise<any> {
    if (typeof value !== 'string') {
      return value;
    }
    
    // Check for @parent: reference
    if (value.startsWith('@parent:')) {
      if (!parentRecord) {
        throw new Error(`@parent reference used but no parent record available: ${value}`);
      }
      const fieldName = value.substring(8);
      return parentRecord.Get(fieldName);
    }
    
    // Check for @root: reference
    if (value.startsWith('@root:')) {
      if (!rootRecord) {
        throw new Error(`@root reference used but no root record available: ${value}`);
      }
      const fieldName = value.substring(6);
      return rootRecord.Get(fieldName);
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
      
      // Parse lookup with optional create syntax
      // Format: EntityName.FieldName=Value?create&OtherField=Value
      const entityMatch = lookupStr.match(/^([^.]+)\./);
      if (!entityMatch) {
        throw new Error(`Invalid lookup format: ${value}`);
      }
      
      const entityName = entityMatch[1];
      const remaining = lookupStr.substring(entityName.length + 1);
      
      // Check if this has ?create syntax
      const hasCreate = remaining.includes('?create');
      const lookupPart = hasCreate ? remaining.split('?')[0] : remaining;
      
      // Parse the main lookup field
      const fieldMatch = lookupPart.match(/^(.+?)=(.+)$/);
      if (!fieldMatch) {
        throw new Error(`Invalid lookup format: ${value}`);
      }
      
      const [, fieldName, fieldValue] = fieldMatch;
      
      // Parse additional fields for creation if ?create is present
      let createFields: Record<string, any> = {};
      if (hasCreate && remaining.includes('?create&')) {
        const createPart = remaining.split('?create&')[1];
        const pairs = createPart.split('&');
        for (const pair of pairs) {
          const [key, val] = pair.split('=');
          if (key && val) {
            createFields[key] = decodeURIComponent(val);
          }
        }
      }
      
      return await this.resolveLookup(entityName, fieldName, fieldValue, hasCreate, createFields);
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
   * Resolve a lookup reference to an ID, optionally creating the record if it doesn't exist
   */
  async resolveLookup(
    entityName: string, 
    fieldName: string, 
    fieldValue: string,
    autoCreate: boolean = false,
    createFields: Record<string, any> = {}
  ): Promise<string> {
    // Debug logging handled by caller if needed
    
    const rv = new RunView();
    const entityInfo = this.metadata.EntityByName(entityName);
    if (!entityInfo) {
      throw new Error(`Entity not found: ${entityName}`);
    }
    
    const field = entityInfo.Fields.find(f => f.Name.trim().toLowerCase() === fieldName.trim().toLowerCase());
    const quotes = field?.NeedsQuotes ? "'" : '';
    const result = await rv.RunView({
      EntityName: entityName,
      ExtraFilter: `${fieldName} = ${quotes}${fieldValue.replace(/'/g, "''")}${quotes}`,
      MaxRows: 1
    }, this.contextUser);
    
    if (result.Success && result.Results.length > 0) {
      if (entityInfo.PrimaryKeys.length > 0) {
        const pkeyField = entityInfo.PrimaryKeys[0].Name;
        const id = result.Results[0][pkeyField];
        return id;
      }
    }
    
    // If not found and auto-create is enabled, create the record
    if (autoCreate) {
      
      const newEntity = await this.metadata.GetEntityObject(entityName, this.contextUser);
      if (!newEntity) {
        throw new Error(`Failed to create entity object for: ${entityName}`);
      }
      
      newEntity.NewRecord();
      
      // Set the lookup field
      if (fieldName in newEntity) {
        (newEntity as any)[fieldName] = fieldValue;
      }
      
      // Set any additional fields provided
      for (const [key, value] of Object.entries(createFields)) {
        if (key in newEntity) {
          (newEntity as any)[key] = value;
        }
      }
      
      // Save the new record
      const saved = await newEntity.Save();
      if (!saved) {
        const errors = newEntity.LatestResult?.Errors?.join(', ') || 'Unknown error';
        throw new Error(`Failed to auto-create ${entityName}: ${errors}`);
      }
      
      // Return the new ID
      if (entityInfo.PrimaryKeys.length > 0) {
        const pkeyField = entityInfo.PrimaryKeys[0].Name;
        const newId = newEntity.Get(pkeyField);
        return newId;
      }
    }
    
    throw new Error(`Lookup failed: No record found in '${entityName}' where ${fieldName}='${fieldValue}'`);
  }
  
  /**
   * Build cascading defaults for a file path and process field values
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
    
    // Process all default values (lookups, file references, etc.)
    const processedDefaults: Record<string, any> = {};
    const baseDir = path.dirname(filePath);
    
    for (const [field, value] of Object.entries(defaults)) {
      try {
        processedDefaults[field] = await this.processFieldValue(value, baseDir, null, null);
      } catch (error) {
        throw new Error(`Failed to process default for field '${field}': ${error}`);
      }
    }
    
    return processedDefaults;
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
    const entity = await this.metadata.GetEntityObject(entityName, this.contextUser);
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
  
  /**
   * Process JSON object with template references
   * Templates can be used at any level and are recursively resolved
   */
  async processTemplates(data: any, baseDir: string): Promise<any> {
    // Handle arrays
    if (Array.isArray(data)) {
      const processedArray = [];
      for (const item of data) {
        processedArray.push(await this.processTemplates(item, baseDir));
      }
      return processedArray;
    }
    
    // Handle objects
    if (data && typeof data === 'object') {
      // Check for @template reference
      if (typeof data === 'string' && data.startsWith('@template:')) {
        const templatePath = data.substring(10);
        return await this.loadAndProcessTemplate(templatePath, baseDir);
      }
      
      // Process object with possible @template field
      const processed: any = {};
      let templateData: any = {};
      
      // First, check if there's a @template field to process
      if (data['@template']) {
        const templates = Array.isArray(data['@template']) ? data['@template'] : [data['@template']];
        
        // Process templates in order, merging them
        for (const templateRef of templates) {
          const templateContent = await this.loadAndProcessTemplate(templateRef, baseDir);
          templateData = this.deepMerge(templateData, templateContent);
        }
      }
      
      // Process all other fields
      for (const [key, value] of Object.entries(data)) {
        if (key === '@template') continue; // Skip the template field itself
        
        // Process the value recursively
        processed[key] = await this.processTemplates(value, baseDir);
      }
      
      // Merge template data with processed data (processed data takes precedence)
      return this.deepMerge(templateData, processed);
    }
    
    // Return primitive values as-is
    return data;
  }
  
  /**
   * Load and process a template file
   */
  private async loadAndProcessTemplate(templatePath: string, baseDir: string): Promise<any> {
    const fullPath = path.resolve(baseDir, templatePath);
    
    if (!await fs.pathExists(fullPath)) {
      throw new Error(`Template file not found: ${fullPath}`);
    }
    
    try {
      const templateContent = await fs.readJson(fullPath);
      
      // Recursively process any nested templates
      const templateDir = path.dirname(fullPath);
      return await this.processTemplates(templateContent, templateDir);
    } catch (error) {
      throw new Error(`Failed to load template ${fullPath}: ${error}`);
    }
  }
  
  /**
   * Deep merge two objects (target takes precedence)
   */
  private deepMerge(source: any, target: any): any {
    if (!source) return target;
    if (!target) return source;
    
    // If target is not an object, it completely overrides source
    if (typeof target !== 'object' || target === null || Array.isArray(target)) {
      return target;
    }
    
    // If source is not an object, target wins
    if (typeof source !== 'object' || source === null || Array.isArray(source)) {
      return target;
    }
    
    // Both are objects, merge them
    const result: any = { ...source };
    
    for (const [key, value] of Object.entries(target)) {
      if (value === undefined) {
        continue; // Skip undefined values
      }
      
      if (typeof value === 'object' && value !== null && !Array.isArray(value) &&
          typeof result[key] === 'object' && result[key] !== null && !Array.isArray(result[key])) {
        // Both are objects, merge recursively
        result[key] = this.deepMerge(result[key], value);
      } else {
        // Otherwise, target value wins
        result[key] = value;
      }
    }
    
    return result;
  }
}