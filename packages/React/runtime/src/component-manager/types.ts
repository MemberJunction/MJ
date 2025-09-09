/**
 * @fileoverview Type definitions for the unified ComponentManager
 */

import { ComponentSpec } from '@memberjunction/interactive-component-types';
import { UserInfo } from '@memberjunction/core';
import { ComponentObject } from '../types';

/**
 * Options for loading a component
 */
export interface LoadOptions {
  /**
   * User context for database operations and registry fetching
   */
  contextUser?: UserInfo;
  
  /**
   * Force re-fetch from registry even if cached
   */
  forceRefresh?: boolean;
  
  /**
   * Force recompilation even if compiled version exists
   */
  forceRecompile?: boolean;
  
  /**
   * Whether this is a dependent component (for tracking)
   */
  isDependent?: boolean;
  
  /**
   * What to return from the load operation
   */
  returnType?: 'component' | 'spec' | 'both';
  
  /**
   * Enable registry usage tracking for licensing (default: true)
   */
  trackUsage?: boolean;
  
  /**
   * Namespace to use if not specified in spec
   */
  defaultNamespace?: string;
  
  /**
   * Version to use if not specified in spec
   */
  defaultVersion?: string;
}

/**
 * Result of loading a single component
 */
export interface LoadResult {
  /**
   * Whether the load operation succeeded
   */
  success: boolean;
  
  /**
   * The compiled component object
   */
  component?: ComponentObject;
  
  /**
   * The fully resolved component specification
   */
  spec?: ComponentSpec;
  
  /**
   * Whether the component was loaded from cache
   */
  fromCache: boolean;
  
  /**
   * Any errors that occurred during loading
   */
  errors?: Array<{
    message: string;
    phase: 'fetch' | 'compile' | 'register' | 'dependency';
    componentName?: string;
  }>;
  
  /**
   * Components that were loaded as dependencies
   */
  dependencies?: Record<string, ComponentObject>;
}

/**
 * Result of loading a component hierarchy
 */
export interface HierarchyResult {
  /**
   * Whether the entire hierarchy loaded successfully
   */
  success: boolean;
  
  /**
   * The root component object
   */
  rootComponent?: ComponentObject;
  
  /**
   * The fully resolved root specification
   */
  resolvedSpec?: ComponentSpec;
  
  /**
   * List of all component names that were loaded
   */
  loadedComponents: string[];
  
  /**
   * Any errors that occurred during loading
   */
  errors: Array<{
    message: string;
    phase: 'fetch' | 'compile' | 'register' | 'dependency';
    componentName?: string;
  }>;
  
  /**
   * Map of all loaded components by name
   */
  components?: Record<string, ComponentObject>;
  
  /**
   * Number of components loaded from cache vs fetched
   */
  stats?: {
    fromCache: number;
    fetched: number;
    compiled: number;
    totalTime: number;
  };
}

/**
 * Configuration for ComponentManager
 */
export interface ComponentManagerConfig {
  /**
   * Enable debug logging
   */
  debug?: boolean;
  
  /**
   * Maximum cache size for fetched specs
   */
  maxCacheSize?: number;
  
  /**
   * Cache TTL in milliseconds (default: 1 hour)
   */
  cacheTTL?: number;
  
  /**
   * Whether to track registry usage for licensing
   */
  enableUsageTracking?: boolean;
  
  /**
   * Batch size for parallel dependency loading
   */
  dependencyBatchSize?: number;
  
  /**
   * Timeout for registry fetch operations (ms)
   */
  fetchTimeout?: number;
}

/**
 * Internal cache entry for fetched specs
 */
export interface CacheEntry {
  spec: ComponentSpec;
  fetchedAt: Date;
  hash?: string;
  usageNotified: boolean;
}