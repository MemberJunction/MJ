/**
 * @fileoverview Configuration types and loaders for MetadataSync
 * @module config
 * 
 * This module defines configuration interfaces and provides utilities for loading
 * various configuration files used by the MetadataSync tool. It supports:
 * - MemberJunction database configuration (mj.config.cjs)
 * - Sync configuration (.mj-sync.json)
 * - Entity-specific configuration (.mj-sync.json with entity field)
 * - Folder-level defaults (.mj-folder.json)
 */

import { cosmiconfigSync } from 'cosmiconfig';
import path from 'path';
import fs from 'fs-extra';
import { configManager } from './lib/config-manager';

/**
 * MemberJunction database configuration
 * 
 * Defines connection parameters and settings for connecting to the MemberJunction
 * database. Typically loaded from mj.config.cjs in the project root.
 */
export interface MJConfig {
  /** Database server hostname or IP address */
  dbHost: string;
  /** Database server port (defaults to 1433 for SQL Server) */
  dbPort?: number;
  /** Database name to connect to */
  dbDatabase: string;
  /** Database authentication username */
  dbUsername: string;
  /** Database authentication password */
  dbPassword: string;
  /** Whether to trust the server certificate (Y/N) */
  dbTrustServerCertificate?: string;
  /** Whether to encrypt the connection (Y/N, auto-detected for Azure SQL) */
  dbEncrypt?: string;
  /** SQL Server instance name (for named instances) */
  dbInstanceName?: string;
  /** Schema name for MemberJunction core tables (defaults to __mj) */
  mjCoreSchema?: string;
  /** Allow additional properties for extensibility */
  [key: string]: any;
}

/**
 * Global sync configuration
 * 
 * Defines settings that apply to the entire sync process, including push/pull
 * behaviors and watch mode configuration. Stored in .mj-sync.json at the root.
 */
export interface SyncConfig {
  /** Version of the sync configuration format */
  version: string;
  /** Glob pattern for finding data files (defaults to "*.json") */
  filePattern?: string;
  /** 
   * Directory processing order (only applies to root-level config, not inherited by subdirectories)
   * Specifies the order in which subdirectories should be processed to handle dependencies.
   * Directories not listed in this array will be processed after the ordered ones in alphabetical order.
   */
  directoryOrder?: string[];
  /** 
   * Directories to ignore during processing
   * Can be directory names or glob patterns relative to the location of the .mj-sync.json file
   * Cumulative: subdirectories inherit and add to parent ignoreDirectories
   * Examples: ["output", "examples", "temp"]
   */
  ignoreDirectories?: string[];
  /** Push command configuration */
  push?: {
    /** Whether to validate records before pushing to database */
    validateBeforePush?: boolean;
    /** Whether to require user confirmation before push */
    requireConfirmation?: boolean;
    /** 
     * Whether to automatically create new records when a primaryKey exists but record is not found
     * Defaults to false - will warn instead of creating
     */
    autoCreateMissingRecords?: boolean;
    /** 
     * When true, forces all records to be saved to database regardless of dirty state.
     * This bypasses dirty checking and always performs database updates.
     * Useful for ensuring complete synchronization or when dirty detection may miss changes.
     * Defaults to false.
     */
    alwaysPush?: boolean;
  };
  /** SQL logging configuration (only applies to root-level config, not inherited by subdirectories) */
  sqlLogging?: {
    /** Whether to enable SQL logging during push operations */
    enabled?: boolean;
    /** Directory to output SQL log files (relative to command execution directory, defaults to './sql_logging') */
    outputDirectory?: string;
    /** Whether to format SQL as migration-ready files with Flyway schema placeholders */
    formatAsMigration?: boolean;
    /**
     * Array of patterns to filter SQL statements.
     * Supports both regex strings and simple wildcard patterns:
     * - Regex: "/spCreate.*Run/i" (must start with "/" and optionally end with flags)
     * - Simple: "*spCreateAIPromptRun*" (uses * as wildcard, case-insensitive by default)
     * Examples: ["*AIPrompt*", "/^EXEC sp_/i", "*EntityFieldValue*"]
     */
    filterPatterns?: string[];
    /**
     * Determines how filterPatterns are applied:
     * - 'exclude': If ANY pattern matches, the SQL is NOT logged (default)
     * - 'include': If ANY pattern matches, the SQL IS logged
     */
    filterType?: 'exclude' | 'include';
    /** Whether to output verbose debug information to console (default: false) */
    verboseOutput?: boolean;
  };
  /** Watch command configuration */
  watch?: {
    /** Milliseconds to wait before processing file changes */
    debounceMs?: number;
    /** File patterns to ignore during watch */
    ignorePatterns?: string[];
  };
  /** User role validation configuration */
  userRoleValidation?: {
    /** Whether to enable user role validation for UserID fields */
    enabled?: boolean;
    /** List of role names that are allowed to be referenced in metadata */
    allowedRoles?: string[];
    /** Whether to allow users without any roles (defaults to false) */
    allowUsersWithoutRoles?: boolean;
  };
  /**
   * Whether to emit __mj_sync_notes in record files during push operations.
   * When enabled, resolution information for @lookup and @parent references is written to files.
   * Defaults to false. Entity-level .mj-sync.json files can override this setting.
   */
  emitSyncNotes?: boolean;
}

/**
 * Configuration for related entity synchronization
 * 
 * Defines how to pull and push related entities that have foreign key relationships
 * with a parent entity. Supports nested relationships for deep object graphs.
 * NEW: Supports automatic recursive patterns for self-referencing entities.
 */
export interface RelatedEntityConfig {
  /** Name of the related entity to sync */
  entity: string;
  /** Field name that contains the foreign key reference to parent (e.g., "PromptID") */
  foreignKey: string;
  /** Optional SQL filter to apply when pulling related records */
  filter?: string;
  /** 
   * Enable recursive fetching for self-referencing entities
   * When true, automatically fetches all levels of the hierarchy until no more children found
   */
  recursive?: boolean;
  /** 
   * Maximum depth for recursive fetching (optional, defaults to 10)
   * Prevents infinite loops and controls memory usage
   * Only applies when recursive is true
   */
  maxDepth?: number;
  /** Fields to externalize to separate files for this related entity */
  externalizeFields?: string[] | {
    [fieldName: string]: {
      /** File extension to use (e.g., ".md", ".txt", ".html") */
      extension?: string;
    }
  } | Array<{
    /** Field name to externalize */
    field: string;
    /** Pattern for the output file. Supports placeholders from the entity */
    pattern: string;
  }>;
  /** Fields to exclude from the pulled data for this related entity */
  excludeFields?: string[];
  /** Foreign key fields to convert to @lookup references for this related entity */
  lookupFields?: {
    [fieldName: string]: {
      entity: string;
      field: string;
    };
  };
  /** Nested related entities for deep object graphs */
  relatedEntities?: Record<string, RelatedEntityConfig>;
}

/**
 * Entity-specific configuration
 * 
 * Defines settings for a specific entity type within a directory. Stored in
 * .mj-sync.json files that contain an "entity" field. Supports defaults,
 * file patterns, and related entity configuration.
 */
export interface EntityConfig {
  /** Name of the entity this directory contains */
  entity: string;
  /** Glob pattern for finding data files (defaults to "*.json") */
  filePattern?: string;
  /** Default field values applied to all records in this directory */
  defaults?: Record<string, any>;
  /** 
   * Directories to ignore during processing
   * Can be directory names or glob patterns relative to the location of the .mj-sync.json file
   * Cumulative: subdirectories inherit and add to parent ignoreDirectories
   * Examples: ["output", "examples", "temp"]
   */
  ignoreDirectories?: string[];
  /** Pull command specific configuration */
  pull?: {
    /** Glob pattern for finding existing files to update (defaults to filePattern) */
    filePattern?: string;
    /** Whether to create new files for records not found locally */
    createNewFileIfNotFound?: boolean;
    /** Filename for new records when createNewFileIfNotFound is true */
    newFileName?: string;
    /** Whether to append multiple new records to a single file */
    appendRecordsToExistingFile?: boolean;
    /** Whether to update existing records found in local files */
    updateExistingRecords?: boolean;
    /** Fields to preserve during updates (never overwrite these) */
    preserveFields?: string[];
    /** Strategy for merging updates: "overwrite" | "merge" | "skip" */
    mergeStrategy?: 'overwrite' | 'merge' | 'skip';
    /** Create backup files before updating existing files */
    backupBeforeUpdate?: boolean;
    /** Directory name for backup files (defaults to ".backups") */
    backupDirectory?: string;
    /** SQL filter to apply when pulling records from database */
    filter?: string;
    /** Configuration for pulling related entities */
    relatedEntities?: Record<string, RelatedEntityConfig>;
    /** Fields to externalize to separate files with optional configuration */
    externalizeFields?: string[] | {
      [fieldName: string]: {
        /** File extension to use (e.g., ".md", ".txt", ".html") */
        extension?: string;
      }
    } | Array<{
      /** Field name to externalize */
      field: string;
      /** Pattern for the output file. Supports placeholders:
       * - {Name}: Entity's name field value
       * - {ID}: Entity's ID
       * - {FieldName}: The field being externalized
       * - Any other {FieldName} from the entity
       * Example: "@file:templates/{Name}.template.md"
       */
      pattern: string;
    }>;
    /** Fields to exclude from the pulled data (e.g., ["TemplateID"]) */
    excludeFields?: string[];
    /** Foreign key fields to convert to @lookup references */
    lookupFields?: {
      /** Field name in this entity (e.g., "CategoryID") */
      [fieldName: string]: {
        /** Target entity name (e.g., "AI Prompt Categories") */
        entity: string;
        /** Field in target entity to use for lookup (e.g., "Name") */
        field: string;
      };
    };
    /** Whether to ignore null field values during pull (defaults to false) */
    ignoreNullFields?: boolean;
    /** Whether to ignore virtual fields during pull (defaults to false) */
    ignoreVirtualFields?: boolean;
  };
  /**
   * Whether to emit __mj_sync_notes in record files during push operations.
   * When enabled, resolution information for @lookup and @parent references is written to files.
   * If not specified, inherits from root .mj-sync.json. Defaults to false if not set anywhere.
   */
  emitSyncNotes?: boolean;
}

/**
 * Folder-level configuration
 * 
 * Defines default values that cascade down to all subdirectories. Stored in
 * .mj-folder.json files. Child folders can override parent defaults.
 */
export interface FolderConfig {
  /** Default field values that apply to all entities in this folder and subfolders */
  defaults: Record<string, any>;
}

/**
 * Load MemberJunction configuration from the filesystem
 * 
 * Searches for mj.config.cjs starting from the current directory and walking up
 * the directory tree. Uses cosmiconfig for flexible configuration loading.
 * 
 * @returns MJConfig object if found, null if not found or invalid
 * 
 * @example
 * ```typescript
 * const config = loadMJConfig();
 * if (config) {
 *   console.log(`Connecting to ${config.dbHost}:${config.dbPort || 1433}`);
 * }
 * ```
 */
export function loadMJConfig(): MJConfig | null {
  return configManager.loadMJConfig();
}

/**
 * Load sync configuration from a directory
 * 
 * Loads .mj-sync.json file from the specified directory. This file can contain
 * either global sync configuration (no entity field) or entity-specific
 * configuration (with entity field).
 * 
 * @param dir - Directory path to load configuration from
 * @returns Promise resolving to SyncConfig if found and valid, null otherwise
 * 
 * @example
 * ```typescript
 * const syncConfig = await loadSyncConfig('/path/to/project');
 * if (syncConfig?.push?.requireConfirmation) {
 *   // Show confirmation prompt
 * }
 * ```
 */
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

/**
 * Load entity-specific configuration from a directory
 * 
 * Loads .mj-sync.json file that contains an "entity" field, indicating this
 * directory contains data for a specific entity type. Returns null if the
 * file doesn't exist or doesn't contain an entity field.
 * 
 * @param dir - Directory path to load configuration from
 * @returns Promise resolving to EntityConfig if found and valid, null otherwise
 * 
 * @example
 * ```typescript
 * const entityConfig = await loadEntityConfig('./ai-prompts');
 * if (entityConfig) {
 *   console.log(`Directory contains ${entityConfig.entity} records`);
 * }
 * ```
 */
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

/**
 * Load folder-level configuration
 * 
 * Loads .mj-folder.json file that contains default values to be applied to
 * all entities in this folder and its subfolders. Used for cascading defaults
 * in deep directory structures.
 * 
 * @param dir - Directory path to load configuration from
 * @returns Promise resolving to FolderConfig if found and valid, null otherwise
 * 
 * @example
 * ```typescript
 * const folderConfig = await loadFolderConfig('./templates');
 * if (folderConfig?.defaults) {
 *   // Apply folder defaults to records
 * }
 * ```
 */
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