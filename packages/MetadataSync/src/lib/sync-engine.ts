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
import { EntityConfig, FolderConfig } from '../config';
import { JsonPreprocessor } from './json-preprocessor';

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
    // Currently no initialization needed as metadata is managed globally
    // Keeping this method for backward compatibility and future use
  }
  
  /**
   * Process special references in field values and handle complex objects
   * 
   * Automatically handles:
   * - Arrays and objects are converted to JSON strings
   * - Scalars (strings, numbers, booleans, null) pass through unchanged
   * 
   * Handles the following reference types for string values:
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
   * 
   * // Complex object - automatically stringified
   * const jsonStr = await processFieldValue({items: [{id: 1}, {id: 2}]}, '/path');
   * // Returns: '{\n  "items": [\n    {\n      "id": 1\n    },\n    {\n      "id": 2\n    }\n  ]\n}'
   * ```
   */
  async processFieldValue(value: any, baseDir: string, parentRecord?: BaseEntity | null, rootRecord?: BaseEntity | null, depth: number = 0, batchContext?: Map<string, BaseEntity>): Promise<any> {
    // Check recursion depth limit
    const MAX_RECURSION_DEPTH = 50;
    if (depth > MAX_RECURSION_DEPTH) {
      throw new Error(`Maximum recursion depth (${MAX_RECURSION_DEPTH}) exceeded while processing field value: ${value}`);
    }
    // Handle arrays and objects by converting them to JSON strings
    if (value !== null && typeof value === 'object') {
      // Check if it's an array or a plain object (not a Date, etc.)
      if (Array.isArray(value) || value.constructor === Object) {
        // Convert to pretty-printed JSON string
        return JSON.stringify(value, null, 2);
      }
    }
    
    // If not a string, return as-is (numbers, booleans, null, etc.)
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
        // Check if this is a JSON file that might contain @include directives
        if (fullPath.endsWith('.json')) {
          try {
            // Parse as JSON and check for @include directives
            const jsonContent = await fs.readJson(fullPath);
            
            // Check if the JSON contains any @include directives
            const jsonString = JSON.stringify(jsonContent);
            const hasIncludes = jsonString.includes('"@include') || jsonString.includes('"@include.');
            
            let processedJson: any;
            if (hasIncludes) {
              // Process @include directives with a fresh preprocessor instance
              const preprocessor = new JsonPreprocessor();
              processedJson = await preprocessor.processFile(fullPath);
            } else {
              processedJson = jsonContent;
            }
            
            // Now recursively process any @file references within the JSON
            const fileDir = path.dirname(fullPath);
            processedJson = await this.processJsonFieldValues(processedJson, fileDir, parentRecord, rootRecord, depth + 1, batchContext);
            
            // Return as JSON string since @file references typically expect string content
            return JSON.stringify(processedJson, null, 2);
          } catch (jsonError) {
            // Not valid JSON or error processing, fall back to text file handling
            const fileContent = await fs.readFile(fullPath, 'utf-8');
            // Process the file content for {@include} references in text files
            return await this.processFileContentWithIncludes(fileContent, fullPath);
          }
        } else {
          // Not a JSON file, process as text with {@include} support
          const fileContent = await fs.readFile(fullPath, 'utf-8');
          // Process the file content for {@include} references
          return await this.processFileContentWithIncludes(fileContent, fullPath);
        }
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
        
        // Recursively process the field value to resolve any nested @ commands
        const processedValue = await this.processFieldValue(
          fieldValue.trim(), 
          baseDir, 
          parentRecord, 
          rootRecord,
          depth + 1,
          batchContext
        );
        
        lookupFields.push({ fieldName: fieldName.trim(), fieldValue: processedValue });
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
            const decodedVal = decodeURIComponent(val);
            // Recursively process the field value to resolve any nested @ commands
            createFields[key] = await this.processFieldValue(
              decodedVal, 
              baseDir, 
              parentRecord, 
              rootRecord,
              depth + 1,
              batchContext
            );
          }
        }
      }
      
      return await this.resolveLookup(entityName, lookupFields, hasCreate, createFields, batchContext);
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
    createFields: Record<string, any> = {},
    batchContext?: Map<string, BaseEntity>
  ): Promise<string> {
    // First check batch context for in-memory entities
    if (batchContext) {
      // Try to find the entity in batch context
      for (const [, entity] of batchContext) {
        // Check if this is the right entity type
        if (entity.EntityInfo?.Name === entityName) {
          // Check if all lookup fields match
          let allMatch = true;
          for (const {fieldName, fieldValue} of lookupFields) {
            const entityValue = entity.Get(fieldName);
            const normalizedEntityValue = entityValue?.toString() || '';
            const normalizedLookupValue = fieldValue?.toString() || '';
            
            if (normalizedEntityValue !== normalizedLookupValue) {
              allMatch = false;
              break;
            }
          }
          
          if (allMatch) {
            // Found in batch context, return primary key
            const entityInfo = this.metadata.EntityByName(entityName);
            if (entityInfo && entityInfo.PrimaryKeys.length > 0) {
              const pkeyField = entityInfo.PrimaryKeys[0].Name;
              return entity.Get(pkeyField);
            }
          }
        }
      }
    }
    
    // Not found in batch context, check database
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
      
      // UUID generation now happens automatically in BaseEntity.NewRecord()
      
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
        processedDefaults[field] = await this.processFieldValue(value, baseDir, null, null, 0);
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
   * Calculate checksum including resolved file content
   * 
   * Enhanced checksum calculation that resolves @file references and includes
   * the actual file content (with @include directives processed) in the checksum.
   * This ensures that changes to referenced files are detected.
   * 
   * @param data - Fields object that may contain @file references
   * @param entityDir - Directory for resolving relative file paths
   * @returns Promise resolving to checksum string
   */
  async calculateChecksumWithFileContent(data: any, entityDir: string): Promise<string> {
    const processedData = await this.resolveFileReferencesForChecksum(data, entityDir);
    return this.calculateChecksum(processedData);
  }

  /**
   * Resolve @file references for checksum calculation
   * 
   * Recursively processes an object and replaces @file references with their
   * actual content (including resolved @include directives). This ensures the
   * checksum reflects the actual content, not just the reference.
   * 
   * @param obj - Object to process
   * @param entityDir - Directory for resolving relative paths
   * @returns Promise resolving to processed object
   * @private
   */
  private async resolveFileReferencesForChecksum(obj: any, entityDir: string): Promise<any> {
    if (!obj || typeof obj !== 'object') {
      return obj;
    }

    if (Array.isArray(obj)) {
      return Promise.all(obj.map(item => this.resolveFileReferencesForChecksum(item, entityDir)));
    }

    const result: any = {};
    for (const [key, value] of Object.entries(obj)) {
      if (typeof value === 'string' && value.startsWith('@file:')) {
        // Process @file reference and include actual content
        try {
          const filePath = value.substring(6);
          const fullPath = path.isAbsolute(filePath) ? filePath : path.join(entityDir, filePath);
          
          if (await fs.pathExists(fullPath)) {
            let processedContent: string;
            
            // Check if this is a JSON file that might contain @include directives
            if (fullPath.endsWith('.json')) {
              try {
                const jsonContent = await fs.readJson(fullPath);
                const jsonString = JSON.stringify(jsonContent);
                const hasIncludes = jsonString.includes('"@include') || jsonString.includes('"@include.');
                
                if (hasIncludes) {
                  // Process @include directives
                  const preprocessor = new JsonPreprocessor();
                  const processedJson = await preprocessor.processFile(fullPath);
                  processedContent = JSON.stringify(processedJson, null, 2);
                } else {
                  processedContent = JSON.stringify(jsonContent, null, 2);
                }
              } catch {
                // Not valid JSON, process as text
                const content = await fs.readFile(fullPath, 'utf-8');
                processedContent = await this.processFileContentWithIncludes(content, fullPath);
              }
            } else {
              // Text file - process {@include} references
              const content = await fs.readFile(fullPath, 'utf-8');
              processedContent = await this.processFileContentWithIncludes(content, fullPath);
            }
            
            result[key] = {
              _checksumType: 'file',
              _reference: value,
              _content: processedContent
            };
          } else {
            // File doesn't exist, keep the reference
            result[key] = value;
          }
        } catch (error) {
          // Error reading file, keep the reference
          result[key] = value;
        }
      } else if (typeof value === 'object') {
        result[key] = await this.resolveFileReferencesForChecksum(value, entityDir);
      } else {
        result[key] = value;
      }
    }
    return result;
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
   * Process file content with {@include} references
   * 
   * Recursively processes a file's content to resolve `{@include path}` references.
   * Include references use JSDoc-style syntax and support:
   * - Relative paths resolved from the containing file's directory
   * - Recursive includes (includes within included files)
   * - Circular reference detection to prevent infinite loops
   * - Seamless content substitution maintaining surrounding text
   * 
   * @param content - The file content to process
   * @param filePath - Path to the file being processed
   * @param visitedPaths - Set of already visited file paths for circular reference detection
   * @returns Promise resolving to the content with all includes resolved
   * @throws Error if circular reference detected or included file not found
   * 
   * @example
   * ```typescript
   * // Content with include reference
   * const content = 'This is a {@include ./shared/header.md} example';
   * 
   * // Resolves to:
   * const result = await processFileContentWithIncludes('/path/to/file.md', content);
   * // 'This is a [contents of header.md] example'
   * ```
   */
  private async processFileContentWithIncludes(
    content: string,
    filePath: string, 
    visitedPaths: Set<string> = new Set()
  ): Promise<string> {
    // Add current file to visited set
    const absolutePath = path.resolve(filePath);
    if (visitedPaths.has(absolutePath)) {
      throw new Error(`Circular reference detected: ${absolutePath} is already being processed`);
    }
    visitedPaths.add(absolutePath);
    
    // Pattern to match {@include path} references
    // Supports whitespace around the path for flexibility
    const includePattern = /\{@include\s+([^\}]+)\s*\}/g;
    
    let processedContent = content;
    let match: RegExpExecArray | null;
    
    // Process all {@include} references
    while ((match = includePattern.exec(content)) !== null) {
      const [fullMatch, includePath] = match;
      const trimmedPath = includePath.trim();
      
      // Resolve the include path relative to the current file's directory
      const currentDir = path.dirname(filePath);
      const resolvedPath = path.resolve(currentDir, trimmedPath);
      
      try {
        // Check if the included file exists
        if (!await fs.pathExists(resolvedPath)) {
          throw new Error(`Included file not found: ${resolvedPath}`);
        }
        
        // Read the included file
        const includedContent = await fs.readFile(resolvedPath, 'utf-8');
        
        // Recursively process the included content for nested includes
        const processedInclude = await this.processFileContentWithIncludes(
          includedContent,
          resolvedPath, 
          new Set(visitedPaths) // Pass a copy to allow the same file in different branches
        );
        
        // Replace the {@include} reference with the processed content
        processedContent = processedContent.replace(fullMatch, processedInclude);
      } catch (error) {
        // Enhance error message with context
        throw new Error(`Failed to process {@include ${trimmedPath}} in ${filePath}: ${error}`);
      }
    }
    
    return processedContent;
  }

  /**
   * Recursively process field values in a JSON object
   * 
   * Processes all string values in a JSON object through processFieldValue,
   * which handles @file, @lookup, @parent, @root references. This ensures
   * that nested @file references within JSON files are properly resolved.
   * 
   * @param obj - JSON object to process
   * @param baseDir - Base directory for resolving relative file paths
   * @param parentRecord - Parent entity record for @parent references
   * @param rootRecord - Root entity record for @root references
   * @param depth - Current recursion depth
   * @param batchContext - Batch processing context
   * @returns Promise resolving to processed JSON object
   * @private
   */
  private async processJsonFieldValues(
    obj: any,
    baseDir: string,
    parentRecord?: BaseEntity | null,
    rootRecord?: BaseEntity | null,
    depth: number = 0,
    batchContext?: Map<string, BaseEntity>
  ): Promise<any> {
    // Handle null and undefined
    if (obj === null || obj === undefined) {
      return obj;
    }

    // Handle arrays
    if (Array.isArray(obj)) {
      return Promise.all(
        obj.map(item => 
          this.processJsonFieldValues(item, baseDir, parentRecord, rootRecord, depth, batchContext)
        )
      );
    }

    // Handle objects
    if (typeof obj === 'object') {
      const result: any = {};
      for (const [key, value] of Object.entries(obj)) {
        // Process string values that might contain references
        if (typeof value === 'string') {
          // Check if this looks like a reference that needs processing
          if (value.startsWith('@file:') || value.startsWith('@lookup:') || 
              value.startsWith('@parent:') || value.startsWith('@root:')) {
            result[key] = await this.processFieldValue(value, baseDir, parentRecord, rootRecord, depth, batchContext);
          } else {
            result[key] = value;
          }
        } else if (typeof value === 'object') {
          // Recursively process nested objects
          result[key] = await this.processJsonFieldValues(value, baseDir, parentRecord, rootRecord, depth, batchContext);
        } else {
          // Keep primitive values as-is
          result[key] = value;
        }
      }
      return result;
    }

    // Return primitive values as-is
    return obj;
  }
  
}