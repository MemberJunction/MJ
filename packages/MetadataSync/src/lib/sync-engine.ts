/**
 * @fileoverview Core synchronization engine for MemberJunction metadata
 * @module sync-engine
 * 
 * This module provides the core functionality for synchronizing metadata between
 * the MemberJunction database and local file system representations. It handles
 * special reference types (@file, @url, @lookup, @env, @parent, @root, @template),
 * manages entity operations, and provides utilities for data transformation.
 */

import path from 'path';
import fs from 'fs-extra';
import crypto from 'crypto';
import axios from 'axios';
import { EntityInfo, Metadata, RunView, BaseEntity, CompositeKey, UserInfo } from '@memberjunction/core';
import { uuidv4 } from '@memberjunction/global';
import { EntityConfig, FolderConfig } from '../config';

/**
 * Represents the structure of a metadata record with optional sync tracking
 */
export interface RecordData {
  /** Primary key field(s) and their values */
  primaryKey?: Record<string, any>;
  /** Entity field names and their values */
  fields: Record<string, any>;
  /** Related entities organized by entity name */
  relatedEntities?: Record<string, RecordData[]>;
  /** Synchronization metadata for change tracking */
  sync?: {
    /** ISO timestamp of last modification */
    lastModified: string;
    /** SHA256 checksum of the fields object */
    checksum: string;
  };
}

/**
 * Core engine for synchronizing MemberJunction metadata between database and files
 * 
 * @class SyncEngine
 * @example
 * ```typescript
 * const syncEngine = new SyncEngine(systemUser);
 * await syncEngine.initialize();
 * 
 * // Process a field value with special references
 * const value = await syncEngine.processFieldValue('@lookup:Users.Email=admin@example.com', '/path/to/base');
 * ```
 */
export class SyncEngine {
  private metadata: Metadata;
  private contextUser: UserInfo;

  /**
   * Creates a new SyncEngine instance
   * @param contextUser - The user context for database operations
   */
  constructor(contextUser: UserInfo) {
    this.metadata = new Metadata();
    this.contextUser = contextUser;
  }
  
  /**
   * Initializes the sync engine by refreshing metadata cache
   * @returns Promise that resolves when initialization is complete
   */
  async initialize(): Promise<void> {
    // Initialize metadata
    await this.metadata.Refresh();
  }
  
  /**
   * Process special references in field values
   * 
   * Handles the following reference types:
   * - `@parent:fieldName` - References a field from the parent record
   * - `@root:fieldName` - References a field from the root record
   * - `@file:path` - Reads content from an external file
   * - `@url:address` - Fetches content from a URL
   * - `@lookup:Entity.Field=Value` - Looks up an entity ID by field value
   * - `@env:VARIABLE` - Reads an environment variable
   * 
   * @param value - The field value to process
   * @param baseDir - Base directory for resolving relative file paths
   * @param parentRecord - Optional parent entity for @parent references
   * @param rootRecord - Optional root entity for @root references
   * @returns The processed value with all references resolved
   * @throws Error if a reference cannot be resolved
   * 
   * @example
   * ```typescript
   * // File reference
   * const content = await processFieldValue('@file:template.md', '/path/to/dir');
   * 
   * // Lookup with auto-create
   * const userId = await processFieldValue('@lookup:Users.Email=john@example.com?create', '/path');
   * ```
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
      // Format: EntityName.Field1=Value1&Field2=Value2?create&OtherField=Value
      const entityMatch = lookupStr.match(/^([^.]+)\./);
      if (!entityMatch) {
        throw new Error(`Invalid lookup format: ${value}`);
      }
      
      const entityName = entityMatch[1];
      const remaining = lookupStr.substring(entityName.length + 1);
      
      // Check if this has ?create syntax
      const hasCreate = remaining.includes('?create');
      const lookupPart = hasCreate ? remaining.split('?')[0] : remaining;
      
      // Parse all lookup fields (can be multiple with &)
      const lookupFields: Array<{fieldName: string, fieldValue: string}> = [];
      const lookupPairs = lookupPart.split('&');
      
      for (const pair of lookupPairs) {
        const fieldMatch = pair.match(/^(.+?)=(.+)$/);
        if (!fieldMatch) {
          throw new Error(`Invalid lookup field format: ${pair} in ${value}`);
        }
        const [, fieldName, fieldValue] = fieldMatch;
        lookupFields.push({ fieldName: fieldName.trim(), fieldValue: fieldValue.trim() });
      }
      
      if (lookupFields.length === 0) {
        throw new Error(`No lookup fields specified: ${value}`);
      }
      
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
      
      return await this.resolveLookup(entityName, lookupFields, hasCreate, createFields);
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
   * 
   * @param entityName - Name of the entity to search in
   * @param fieldName - Field to match against
   * @param fieldValue - Value to search for
   * @param autoCreate - Whether to create the record if not found
   * @param createFields - Additional fields to set when creating
   * @returns The ID of the found or created record
   * @throws Error if lookup fails and autoCreate is false
   * 
   * @example
   * ```typescript
   * // Simple lookup
   * const categoryId = await resolveLookup('Categories', 'Name', 'Technology');
   * 
   * // Lookup with auto-create
   * const tagId = await resolveLookup('Tags', 'Name', 'New Tag', true, {
   *   Description: 'Auto-created tag',
   *   Status: 'Active'
   * });
   * ```
   */
  async resolveLookup(
    entityName: string, 
    lookupFields: Array<{fieldName: string, fieldValue: string}>,
    autoCreate: boolean = false,
    createFields: Record<string, any> = {}
  ): Promise<string> {
    // Debug logging handled by caller if needed
    
    const rv = new RunView();
    const entityInfo = this.metadata.EntityByName(entityName);
    if (!entityInfo) {
      throw new Error(`Entity not found: ${entityName}`);
    }
    
    // Build compound filter for all lookup fields
    const filterParts: string[] = [];
    for (const {fieldName, fieldValue} of lookupFields) {
      const field = entityInfo.Fields.find(f => f.Name.trim().toLowerCase() === fieldName.trim().toLowerCase());
      if (!field) {
        throw new Error(`Field '${fieldName}' not found in entity '${entityName}'`);
      }
      
      // Handle null values properly
      if (fieldValue.trim().toLowerCase() === 'null') {
        filterParts.push(`${fieldName} IS NULL`);
      } else {
        const quotes = field.NeedsQuotes ? "'" : '';
        filterParts.push(`${fieldName} = ${quotes}${fieldValue.replace(/'/g, "''")}${quotes}`);
      }
    }
    
    const extraFilter = filterParts.join(' AND ');
    const result = await rv.RunView({
      EntityName: entityName,
      ExtraFilter: extraFilter,
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
      
      // Handle explicit ID setting for new records
      if (entityInfo.PrimaryKeys.length > 0) {
        for (const pk of entityInfo.PrimaryKeys) {
          if (!pk.AutoIncrement && pk.Type.toLowerCase() === 'uniqueidentifier') {
            // Generate UUID for this primary key and set it explicitly
            const uuid = uuidv4();
            (newEntity as any)[pk.Name] = uuid;
          }
        }
      }
      
      // Set all lookup fields
      for (const {fieldName, fieldValue} of lookupFields) {
        if (fieldName in newEntity) {
          // Handle null values properly
          if (fieldValue.toLowerCase() === 'null') {
            (newEntity as any)[fieldName] = null;
          } else {
            (newEntity as any)[fieldName] = fieldValue;
          }
        }
      }
      
      // Set any additional fields provided
      for (const [key, value] of Object.entries(createFields)) {
        if (key in newEntity) {
          (newEntity as any)[key] = value;
        }
      }
      
      // Save the new record (new records are always dirty)
      const filterDesc = lookupFields.map(({fieldName, fieldValue}) => `${fieldName}='${fieldValue}'`).join(' AND ');
      console.log(`📝 Auto-creating ${entityName} record where ${filterDesc}`);
      const saved = await newEntity.Save();
      if (!saved) {
        const message = newEntity.LatestResult?.Message;
        if (message) {
          throw new Error(`Failed to auto-create ${entityName}: ${message}`);
        }
        
        const errors = newEntity.LatestResult?.Errors?.map(err => 
          typeof err === 'string' ? err : (err?.message || JSON.stringify(err))
        )?.join(', ') || 'Unknown error';
        throw new Error(`Failed to auto-create ${entityName}: ${errors}`);
      }
      
      // Return the new ID
      if (entityInfo.PrimaryKeys.length > 0) {
        const pkeyField = entityInfo.PrimaryKeys[0].Name;
        const newId = newEntity.Get(pkeyField);
        return newId;
      }
    }
    
    const filterDesc = lookupFields.map(({fieldName, fieldValue}) => `${fieldName}='${fieldValue}'`).join(' AND ');
    throw new Error(`Lookup failed: No record found in '${entityName}' where ${filterDesc}`);
  }
  
  /**
   * Build cascading defaults for a file path and process field values
   * 
   * Walks up the directory tree from the file location, collecting defaults from
   * entity config and folder configs, with deeper folders overriding parent values.
   * All default values are processed for special references.
   * 
   * @param filePath - Path to the file being processed
   * @param entityConfig - Entity configuration containing base defaults
   * @returns Processed defaults with all references resolved
   * @throws Error if any default value processing fails
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
   * Load folder configuration from .mj-folder.json file
   * 
   * @param dir - Directory to check for configuration
   * @returns Folder configuration or null if not found/invalid
   * @private
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
   * Calculate SHA256 checksum for data
   * 
   * Generates a deterministic hash of the provided data by converting it to
   * formatted JSON and calculating a SHA256 digest. Used for change detection
   * in sync operations.
   * 
   * @param data - Any data structure to calculate checksum for
   * @returns Hexadecimal string representation of the SHA256 hash
   * 
   * @example
   * ```typescript
   * const checksum = syncEngine.calculateChecksum({
   *   name: 'Test Record',
   *   value: 42,
   *   tags: ['a', 'b']
   * });
   * // Returns consistent hash for same data structure
   * ```
   */
  calculateChecksum(data: any): string {
    const hash = crypto.createHash('sha256');
    hash.update(JSON.stringify(data, null, 2));
    return hash.digest('hex');
  }
  
  /**
   * Get entity metadata information by name
   * 
   * Retrieves the EntityInfo object containing schema metadata for the specified entity.
   * Returns null if the entity is not found in the metadata cache.
   * 
   * @param entityName - Name of the entity to look up
   * @returns EntityInfo object with schema details or null if not found
   * 
   * @example
   * ```typescript
   * const entityInfo = syncEngine.getEntityInfo('AI Prompts');
   * if (entityInfo) {
   *   console.log(`Primary keys: ${entityInfo.PrimaryKeys.map(pk => pk.Name).join(', ')}`);
   * }
   * ```
   */
  getEntityInfo(entityName: string): EntityInfo | null {
    return this.metadata.EntityByName(entityName);
  }
  
  /**
   * Create a new entity object instance
   * 
   * Uses the MemberJunction metadata system to properly instantiate an entity object.
   * This ensures correct class registration and respects any custom entity subclasses.
   * 
   * @param entityName - Name of the entity to create
   * @returns Promise resolving to the new BaseEntity instance
   * @throws Error if entity creation fails
   * 
   * @example
   * ```typescript
   * const entity = await syncEngine.createEntityObject('AI Prompts');
   * entity.NewRecord();
   * entity.Set('Name', 'My Prompt');
   * await entity.Save();
   * ```
   */
  async createEntityObject(entityName: string): Promise<BaseEntity> {
    const entity = await this.metadata.GetEntityObject(entityName, this.contextUser);
    if (!entity) {
      throw new Error(`Failed to create entity object for: ${entityName}`);
    }
    return entity;
  }
  
  /**
   * Load an entity record by primary key
   * 
   * Retrieves an existing entity record from the database using its primary key values.
   * Supports both single and composite primary keys. Returns null if the record is not found.
   * 
   * @param entityName - Name of the entity to load
   * @param primaryKey - Object containing primary key field names and values
   * @returns Promise resolving to the loaded entity or null if not found
   * @throws Error if entity metadata is not found
   * 
   * @example
   * ```typescript
   * // Single primary key
   * const entity = await syncEngine.loadEntity('Users', { ID: '123-456' });
   * 
   * // Composite primary key
   * const entity = await syncEngine.loadEntity('UserRoles', { 
   *   UserID: '123-456',
   *   RoleID: '789-012'
   * });
   * ```
   */
  async loadEntity(entityName: string, primaryKey: Record<string, any>): Promise<BaseEntity | null> {
    const entityInfo = this.getEntityInfo(entityName);
    
    if (!entityInfo) {
      throw new Error(`Entity not found: ${entityName}`);
    }
    
    // First, check if the record exists using RunView to avoid "Error in BaseEntity.Load" messages
    // when records don't exist (which is a normal scenario during sync operations)
    const rv = new RunView();
    
    // Build filter for primary key(s)
    const filters: string[] = [];
    for (const pk of entityInfo.PrimaryKeys) {
      const value = primaryKey[pk.Name];
      if (value === undefined || value === null) {
        throw new Error(`Missing primary key value for ${pk.Name} in entity ${entityName}`);
      }
      
      // Check if field needs quotes
      const field = entityInfo.Fields.find(f => f.Name === pk.Name);
      const quotes = field?.NeedsQuotes ? "'" : '';
      const escapedValue = field?.NeedsQuotes && typeof value === 'string' ? value.replace(/'/g, "''") : value;
      filters.push(`${pk.Name} = ${quotes}${escapedValue}${quotes}`);
    }
    
    const result = await rv.RunView({
      EntityName: entityName,
      ExtraFilter: filters.join(' AND '),
      MaxRows: 1
    }, this.contextUser);
    
    // If no record found, return null without attempting to load
    if (!result.Success || result.Results.length === 0) {
      return null;
    }
    
    // Record exists, now load it properly through the entity
    const entity = await this.createEntityObject(entityName);
    const compositeKey = new CompositeKey();
    compositeKey.LoadFromSimpleObject(primaryKey);
    const loaded = await entity.InnerLoad(compositeKey);
    
    return loaded ? entity : null;
  }
  
  /**
   * Process JSON object with template references
   * 
   * Recursively processes JSON data structures to resolve `@template` references.
   * Templates can be defined at any level and support:
   * - Single template references: `"@template:path/to/template.json"`
   * - Object with @template field: `{ "@template": "file.json", "override": "value" }`
   * - Array of templates for merging: `{ "@template": ["base.json", "overrides.json"] }`
   * - Nested template references within templates
   * 
   * @param data - JSON data structure to process
   * @param baseDir - Base directory for resolving relative template paths
   * @returns Promise resolving to the processed data with all templates resolved
   * @throws Error if template file is not found or contains invalid JSON
   * 
   * @example
   * ```typescript
   * // Input data with template reference
   * const data = {
   *   "@template": "defaults/ai-prompt.json",
   *   "Name": "Custom Prompt",
   *   "Prompt": "Override the template prompt"
   * };
   * 
   * // Resolves template and merges with overrides
   * const result = await syncEngine.processTemplates(data, '/path/to/dir');
   * ```
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
   * 
   * Loads a JSON template file from the filesystem and recursively processes any
   * nested template references within it. Template paths are resolved relative to
   * the template file's directory, enabling template composition.
   * 
   * @param templatePath - Path to the template file (relative or absolute)
   * @param baseDir - Base directory for resolving relative paths
   * @returns Promise resolving to the processed template content
   * @throws Error if template file not found or contains invalid JSON
   * @private
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
   * Deep merge two objects with target taking precedence
   * 
   * Recursively merges two objects, with values from the target object overriding
   * values from the source object. Arrays and primitive values are not merged but
   * replaced entirely by the target value. Undefined values in target are skipped.
   * 
   * @param source - Base object to merge from
   * @param target - Object with values that override source
   * @returns New object with merged values
   * @private
   * 
   * @example
   * ```typescript
   * const source = {
   *   a: 1,
   *   b: { x: 10, y: 20 },
   *   c: [1, 2, 3]
   * };
   * const target = {
   *   a: 2,
   *   b: { y: 30, z: 40 },
   *   d: 'new'
   * };
   * const result = deepMerge(source, target);
   * // Result: { a: 2, b: { x: 10, y: 30, z: 40 }, c: [1, 2, 3], d: 'new' }
   * ```
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