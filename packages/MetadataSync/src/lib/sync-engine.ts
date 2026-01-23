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
import {
  METADATA_KEYWORDS,
  METADATA_KEYWORD_PREFIXES,
  isMetadataKeyword,
  isNonKeywordAtSymbol,
  extractKeywordValue
} from '../constants/metadata-keywords';

/**
 * Custom error class for lookup failures that can be deferred.
 * When a lookup with `?allowDefer` flag fails, this error is thrown instead of a regular Error.
 * The calling code can catch this specific error type and queue the lookup for later retry.
 */
export class DeferrableLookupError extends Error {
  /** The entity name being looked up */
  public readonly entityName: string;
  /** The lookup fields and values that failed */
  public readonly lookupFields: Array<{fieldName: string, fieldValue: string}>;
  /** The original lookup string value */
  public readonly originalValue: string;
  /** The field name where this lookup was used */
  public readonly targetFieldName?: string;

  constructor(
    message: string,
    entityName: string,
    lookupFields: Array<{fieldName: string, fieldValue: string}>,
    originalValue: string,
    targetFieldName?: string
  ) {
    super(message);
    this.name = 'DeferrableLookupError';
    this.entityName = entityName;
    this.lookupFields = lookupFields;
    this.originalValue = originalValue;
    this.targetFieldName = targetFieldName;

    // Maintains proper prototype chain for instanceof checks
    Object.setPrototypeOf(this, DeferrableLookupError.prototype);
  }
}

/**
 * Represents a nested lookup resolution that occurred within a parent lookup
 */
export interface NestedSyncResolution {
  /** The original @lookup expression */
  expression: string;
  /** The resolved value (typically a GUID) */
  resolved: string;
}

/**
 * Represents a single sync resolution note tracking how a reference was resolved
 */
export interface SyncNote {
  /** Type of resolution: 'lookup' for @lookup references, 'parent' for @parent references */
  type: 'lookup' | 'parent';
  /** The field path where this resolution occurred (e.g., "primaryKey.ID" or "fields.CategoryID") */
  field: string;
  /** The original expression before resolution (e.g., "@lookup:Entities.Name=Test") */
  expression: string;
  /** The resolved value (e.g., a GUID) */
  resolved: string;
  /** For lookup resolutions with nested @lookup expressions, tracks each nested resolution */
  nested?: NestedSyncResolution[];
}

/**
 * Collector for gathering sync resolution notes during field processing
 */
export interface SyncResolutionCollector {
  /** Array of collected sync notes */
  notes: SyncNote[];
  /** Current field path prefix (e.g., "fields" or "primaryKey") */
  fieldPrefix: string;
}

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
  /** Delete record directive for removing records from the database */
  deleteRecord?: {
    /** Flag to indicate this record should be deleted */
    delete: boolean;
    /** ISO timestamp of when the deletion was performed */
    deletedAt?: string;
    /** Flag to indicate the record was not found when attempting deletion */
    notFound?: boolean;
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
   * @param depth - Current recursion depth (for preventing infinite loops)
   * @param batchContext - Optional batch context for in-memory entity resolution
   * @param resolutionCollector - Optional collector for tracking @lookup and @parent resolutions
   * @param fieldName - Optional field name for tracking resolutions
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
   *
   * // With resolution collector for tracking
   * const collector: SyncResolutionCollector = { notes: [], fieldPrefix: 'fields' };
   * const result = await processFieldValue('@lookup:Users.Email=admin@example.com', '/path', null, null, 0, undefined, collector, 'UserID');
   * // collector.notes will contain the resolution info
   * ```
   */
  async processFieldValue(
    value: any,
    baseDir: string,
    parentRecord?: BaseEntity | null,
    rootRecord?: BaseEntity | null,
    depth: number = 0,
    batchContext?: Map<string, BaseEntity>,
    resolutionCollector?: SyncResolutionCollector,
    fieldName?: string
  ): Promise<any> {
    // Check recursion depth limit
    const MAX_RECURSION_DEPTH = 50;
    if (depth > MAX_RECURSION_DEPTH) {
      throw new Error(`Maximum recursion depth (${MAX_RECURSION_DEPTH}) exceeded while processing field value: ${value}`);
    }
    // Handle arrays and objects that are directly defined in metadata files
    // Note: Objects loaded from @file references are returned as-is to preserve proper escaping
    if (value !== null && typeof value === 'object') {
      // Check if it's an array or a plain object (not a Date, etc.)
      if (Array.isArray(value) || value.constructor === Object) {
        // First recursively process any @lookup, @file, @parent references inside the object
        const processedValue = await this.processJsonFieldValues(value, baseDir, parentRecord, rootRecord, depth, batchContext);
        // Then convert to pretty-printed JSON string for inline metadata objects
        // Objects from @file references will be handled by BaseEntity during save
        return JSON.stringify(processedValue, null, 2);
      }
    }
    
    // If not a string, return as-is (numbers, booleans, null, etc.)
    if (typeof value !== 'string') {
      return value;
    }
    
    // If string starts with @ but isn't one of our known reference types, return as-is
    // This handles cases like npm package names (@mui/material, @angular/core, etc.)
    if (isNonKeywordAtSymbol(value)) {
      return value; // Not a MetadataSync reference, just a string that happens to start with @
    }
    
    // Check for @parent: reference
    if (value.startsWith(METADATA_KEYWORDS.PARENT)) {
      if (!parentRecord) {
        throw new Error(`@parent reference used but no parent record available: ${value}`);
      }
      const parentFieldName = extractKeywordValue(value) || '';
      const resolvedValue = parentRecord.Get(parentFieldName);

      // Track the resolution if collector is provided
      if (resolutionCollector && fieldName) {
        resolutionCollector.notes.push({
          type: 'parent',
          field: `${resolutionCollector.fieldPrefix}.${fieldName}`,
          expression: value,
          resolved: String(resolvedValue)
        });
      }

      return resolvedValue;
    }

    // Check for @root: reference
    if (value.startsWith(METADATA_KEYWORDS.ROOT)) {
      if (!rootRecord) {
        throw new Error(`@root reference used but no root record available: ${value}`);
      }
      const fieldName = extractKeywordValue(value) || '';
      return rootRecord.Get(fieldName);
    }

    // Check for @file: reference
    if (value.startsWith(METADATA_KEYWORDS.FILE)) {
      const filePath = extractKeywordValue(value) as string;
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
            
            // Return the processed JSON object directly without stringifying
            // Let BaseEntity handle serialization when saving to database
            // This ensures proper escaping of embedded code/scripts
            return processedJson;
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
    if (value.startsWith(METADATA_KEYWORDS.URL)) {
      const url = extractKeywordValue(value) as string;
      
      try {
        const response = await axios.get(url);
        return response.data;
      } catch (error) {
        throw new Error(`Failed to fetch URL: ${url} - ${error}`);
      }
    }
    
    // Check for @lookup: reference
    if (value.startsWith(METADATA_KEYWORDS.LOOKUP)) {
      const lookupStr = extractKeywordValue(value) as string;

      // Parse lookup with optional flags: ?create, ?allowDefer
      // Format: EntityName.Field1=Value1&Field2=Value2?create&allowDefer&OtherField=Value
      const entityMatch = lookupStr.match(/^([^.]+)\./);
      if (!entityMatch) {
        throw new Error(`Invalid lookup format: ${value}`);
      }

      const entityName = entityMatch[1];
      const remaining = lookupStr.substring(entityName.length + 1);

      // Split into lookup part and flags part
      const questionMarkIndex = remaining.indexOf('?');
      const lookupPart = questionMarkIndex >= 0 ? remaining.substring(0, questionMarkIndex) : remaining;
      const flagsPart = questionMarkIndex >= 0 ? remaining.substring(questionMarkIndex + 1) : '';

      // Parse flags from the query string portion
      const flags = new Set(flagsPart.split('&').map(f => f.split('=')[0].toLowerCase()));
      const hasCreate = flags.has('create');
      const allowDefer = flags.has('allowdefer');

      // Parse all lookup fields (can be multiple with &)
      const lookupFields: Array<{fieldName: string, fieldValue: string}> = [];
      const lookupPairs = lookupPart.split('&');

      // Collector for nested resolutions within this lookup
      const nestedResolutions: NestedSyncResolution[] = [];

      for (const pair of lookupPairs) {
        const fieldMatch = pair.match(/^(.+?)=(.+)$/);
        if (!fieldMatch) {
          throw new Error(`Invalid lookup field format: ${pair} in ${value}`);
        }
        const [, lookupFieldName, fieldValue] = fieldMatch;
        const rawFieldValue = fieldValue.trim();

        // Recursively process the field value to resolve any nested @ commands
        // Create a temporary collector to capture nested resolutions
        const nestedCollector: SyncResolutionCollector = { notes: [], fieldPrefix: '' };
        const processedValue = await this.processFieldValue(
          rawFieldValue,
          baseDir,
          parentRecord,
          rootRecord,
          depth + 1,
          batchContext,
          nestedCollector,
          lookupFieldName // Pass field name for tracking
        );

        // If the raw value was a lookup expression that got resolved, track it as nested
        if (rawFieldValue.startsWith(METADATA_KEYWORDS.LOOKUP) && rawFieldValue !== processedValue) {
          nestedResolutions.push({
            expression: rawFieldValue,
            resolved: String(processedValue)
          });
        }

        lookupFields.push({ fieldName: lookupFieldName.trim(), fieldValue: processedValue });
      }

      if (lookupFields.length === 0) {
        throw new Error(`No lookup fields specified: ${value}`);
      }

      // Parse additional fields for creation if ?create is present
      // These are key=value pairs after the flags (e.g., ?create&Description=Some%20Value)
      let createFields: Record<string, any> = {};
      if (hasCreate && flagsPart) {
        const flagPairs = flagsPart.split('&');
        for (const pair of flagPairs) {
          // Skip known flags
          if (pair.toLowerCase() === 'create' || pair.toLowerCase() === 'allowdefer') {
            continue;
          }
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

      const resolvedValue = await this.resolveLookup(entityName, lookupFields, hasCreate, createFields, batchContext, allowDefer, value);

      // Track the resolution if collector is provided
      if (resolutionCollector && fieldName) {
        const note: SyncNote = {
          type: 'lookup',
          field: `${resolutionCollector.fieldPrefix}.${fieldName}`,
          expression: value,
          resolved: String(resolvedValue)
        };

        // Include nested resolutions if any were captured
        if (nestedResolutions.length > 0) {
          note.nested = nestedResolutions;
        }

        resolutionCollector.notes.push(note);
      }

      return resolvedValue;
    }
    
    // Check for @env: reference
    if (value.startsWith(METADATA_KEYWORDS.ENV)) {
      const envVar = extractKeywordValue(value) as string;
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
   * @param batchContext - Optional batch context for in-memory entity resolution
   * @param allowDefer - If true, throws DeferrableLookupError on failure instead of regular Error
   * @param originalValue - Original lookup string (for error context in deferred lookups)
   * @returns The ID of the found or created record
   * @throws Error if lookup fails and autoCreate is false and allowDefer is false
   * @throws DeferrableLookupError if lookup fails and allowDefer is true
   *
   * @example
   * ```typescript
   * // Simple lookup
   * const categoryId = await resolveLookup('Categories', [{ fieldName: 'Name', fieldValue: 'Technology' }]);
   *
   * // Lookup with auto-create
   * const tagId = await resolveLookup('Tags', [{ fieldName: 'Name', fieldValue: 'New Tag' }], true, {
   *   Description: 'Auto-created tag',
   *   Status: 'Active'
   * });
   *
   * // Lookup with allowDefer - will throw DeferrableLookupError on failure
   * try {
   *   const id = await resolveLookup('Dashboards', [{ fieldName: 'Name', fieldValue: 'My Dashboard' }],
   *     false, {}, batchContext, true, '@lookup:Dashboards.Name=My Dashboard?allowDefer');
   * } catch (e) {
   *   if (e instanceof DeferrableLookupError) {
   *     // Queue for later retry
   *   }
   * }
   * ```
   */
  async resolveLookup(
    entityName: string,
    lookupFields: Array<{fieldName: string, fieldValue: string}>,
    autoCreate: boolean = false,
    createFields: Record<string, any> = {},
    batchContext?: Map<string, BaseEntity>,
    allowDefer: boolean = false,
    originalValue?: string
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
    const errorMessage = `Lookup failed: No record found in '${entityName}' where ${filterDesc}`;

    // If allowDefer is true, throw DeferrableLookupError so caller can queue for retry
    if (allowDefer) {
      throw new DeferrableLookupError(
        errorMessage,
        entityName,
        lookupFields,
        originalValue || `@lookup:${entityName}.${filterDesc}`
      );
    }

    throw new Error(errorMessage);
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
    // Use a replacer function to ensure consistent key ordering for deterministic checksums
    const sortedJson = JSON.stringify(data, this.sortedReplacer, 2);
    hash.update(sortedJson);
    return hash.digest('hex');
  }

  /**
   * Replacer function for JSON.stringify that sorts object keys alphabetically
   * Ensures deterministic checksums regardless of property order
   */
  private sortedReplacer(key: string, value: any): any {
    if (value && typeof value === 'object' && !Array.isArray(value)) {
      // Sort object keys alphabetically
      return Object.keys(value)
        .sort()
        .reduce((sorted: any, key: string) => {
          sorted[key] = value[key];
          return sorted;
        }, {});
    }
    return value;
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
      if (typeof value === 'string' && value.startsWith(METADATA_KEYWORDS.FILE)) {
        // Process @file reference and include actual content
        try {
          const filePath = extractKeywordValue(value) as string;
          const fullPath = path.isAbsolute(filePath) ? filePath : path.join(entityDir, filePath);
          
          if (await fs.pathExists(fullPath)) {
            let processedContent: string;
            
            // Check if this is a JSON file that might contain @include directives or nested @file references
            if (fullPath.endsWith('.json')) {
              try {
                const jsonContent = await fs.readJson(fullPath);
                const jsonString = JSON.stringify(jsonContent);
                const hasIncludes = jsonString.includes('"@include') || jsonString.includes('"@include.');

                let resolvedJsonContent: any;
                if (hasIncludes) {
                  // Process @include directives first
                  const preprocessor = new JsonPreprocessor();
                  resolvedJsonContent = await preprocessor.processFile(fullPath);
                } else {
                  resolvedJsonContent = jsonContent;
                }

                // Recursively resolve any nested @file references in the loaded JSON
                // Use the JSON file's directory as the base for resolving relative paths
                const fullyResolvedContent = await this.resolveFileReferencesForChecksum(
                  resolvedJsonContent,
                  path.dirname(fullPath)
                );

                processedContent = JSON.stringify(fullyResolvedContent, null, 2);
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

    // Handle top-level strings (important for array elements that are strings with @ syntax)
    if (typeof obj === 'string') {
      if (isMetadataKeyword(obj)) {
        return this.processFieldValue(obj, baseDir, parentRecord, rootRecord, depth, batchContext);
      }
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
          // Only process known reference types, ignore other @ strings (like npm packages)
          if (isMetadataKeyword(value)) {
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