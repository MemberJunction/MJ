/**
 * @fileoverview Registry provider interfaces and implementations for component loading
 * @module @memberjunction/react-runtime/registry
 */

import { ComponentSpec } from '@memberjunction/interactive-component-types';

/**
 * Metadata about a component from a registry
 */
export interface RegistryComponentMetadata {
  name: string;
  namespace: string;
  version: string;
  description: string;
  title?: string;
  type?: string;
  status?: string;
  properties?: ComponentSpec['properties'];
  events?: ComponentSpec['events'];
  libraries?: ComponentSpec['libraries'];
  dependencies?: ComponentSpec['dependencies'];
  sourceRegistryID?: string | null;
  isLocal: boolean;
  lastFetched?: Date;
  cacheDuration?: number;
}

/**
 * Response from fetching a component from a registry
 */
export interface RegistryComponentResponse {
  metadata: RegistryComponentMetadata;
  spec: ComponentSpec;
}

/**
 * Interface for registry providers that can fetch components
 */
export interface RegistryProvider {
  /**
   * Name of the registry provider
   */
  name: string;
  
  /**
   * Fetch a component from the registry
   * @param name - Component name
   * @param namespace - Component namespace
   * @param version - Component version (optional, defaults to latest)
   * @returns Component metadata and specification
   */
  fetchComponent(
    name: string,
    namespace: string,
    version?: string
  ): Promise<RegistryComponentResponse>;
  
  /**
   * Check if a component exists in the registry
   * @param name - Component name
   * @param namespace - Component namespace
   * @param version - Component version (optional)
   * @returns True if component exists
   */
  componentExists?(
    name: string,
    namespace: string,
    version?: string
  ): Promise<boolean>;
  
  /**
   * Get available versions of a component
   * @param name - Component name
   * @param namespace - Component namespace
   * @returns Array of available versions
   */
  getComponentVersions?(
    name: string,
    namespace: string
  ): Promise<string[]>;
}

/**
 * Search filters for registry queries
 */
export interface RegistrySearchFilters {
  type?: string;
  status?: string;
  namespace?: string;
  query?: string;
  limit?: number;
  offset?: number;
}

/**
 * Dependency information for a component
 */
export interface ComponentDependencyInfo {
  name: string;
  namespace: string;
  version?: string;
  isRequired: boolean;
  location: 'embedded' | 'registry';
  sourceRegistryID?: string | null;
}

/**
 * Tree structure for dependency resolution
 */
export interface DependencyTree {
  componentId: string;
  name?: string;
  namespace?: string;
  version?: string;
  dependencies?: DependencyTree[];
  circular?: boolean;
  totalCount?: number;
}