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
  /** Push command configuration */
  push?: {
    /** Whether to validate records before pushing to database */
    validateBeforePush?: boolean;
    /** Whether to require user confirmation before push */
    requireConfirmation?: boolean;
  };
  /** Watch command configuration */
  watch?: {
    /** Milliseconds to wait before processing file changes */
    debounceMs?: number;
    /** File patterns to ignore during watch */
    ignorePatterns?: string[];
  };
}

/**
 * Configuration for related entity synchronization
 * 
 * Defines how to pull and push related entities that have foreign key relationships
 * with a parent entity. Supports nested relationships for deep object graphs.
 */
export interface RelatedEntityConfig {
  /** Name of the related entity to sync */
  entity: string;
  /** Field name that contains the foreign key reference to parent (e.g., "PromptID") */
  foreignKey: string;
  /** Optional SQL filter to apply when pulling related records */
  filter?: string;
  /** Fields to externalize to separate files for this related entity */
  externalizeFields?: string[] | {
    [fieldName: string]: {
      /** File extension to use (e.g., ".md", ".txt", ".html") */
      extension?: string;
    }
  };
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
  /** Pull command specific configuration */
  pull?: {
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
    };
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
  };
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