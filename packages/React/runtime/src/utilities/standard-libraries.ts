/**
 * @fileoverview Standard libraries configuration for React components
 * @module @memberjunction/react-runtime/utilities
 */

import { LibraryConfiguration, ExternalLibraryConfig } from '../types/library-config';


/**
 * Type for dynamically loaded libraries available to React components
 */
export type StandardLibraries = Record<string, any>;

/**
 * Default empty library configuration
 * Libraries should be configured dynamically at runtime
 */
const DEFAULT_LIBRARY_CONFIG: LibraryConfiguration = {
  libraries: [],
  metadata: {
    version: '1.0.0',
    lastUpdated: new Date().toISOString(),
    description: 'Empty default configuration - libraries should be configured at runtime'
  }
};

/**
 * Manages standard library configurations with dynamic loading support
 */
export class StandardLibraryManager {
  private static configuration: LibraryConfiguration = DEFAULT_LIBRARY_CONFIG;
  
  /**
   * Set a custom library configuration
   */
  static setConfiguration(config: LibraryConfiguration): void {
    this.configuration = config;
  }
  
  /**
   * Get the current library configuration
   */
  static getConfiguration(): LibraryConfiguration {
    return this.configuration;
  }
  
  /**
   * Get all enabled libraries
   */
  static getEnabledLibraries(): ExternalLibraryConfig[] {
    return this.configuration.libraries.filter(lib => lib.isEnabled);
  }
  
  /**
   * Get libraries by category
   */
  static getLibrariesByCategory(category: ExternalLibraryConfig['category']): ExternalLibraryConfig[] {
    return this.configuration.libraries.filter(lib => lib.category === category && lib.isEnabled);
  }
  
  /**
   * Get core libraries (runtime essentials)
   */
  static getCoreLibraries(): ExternalLibraryConfig[] {
    return this.configuration.libraries.filter(lib => lib.isCore && lib.isEnabled);
  }
  
  /**
   * Get component libraries (non-runtime)
   */
  static getComponentLibraries(): ExternalLibraryConfig[] {
    return this.configuration.libraries.filter(lib => !lib.isRuntimeOnly && lib.isEnabled);
  }
  
  /**
   * Get library by ID
   */
  static getLibraryById(id: string): ExternalLibraryConfig | undefined {
    return this.configuration.libraries.find(lib => lib.id === id);
  }
  
  /**
   * Get library URLs as a simple object (for backward compatibility)
   */
  static getLibraryUrls(): Record<string, string> {
    const urls: Record<string, string> = {};
    this.configuration.libraries
      .filter(lib => lib.isEnabled)
      .forEach(lib => {
        // Use uppercase key for backward compatibility
        const key = lib.id.replace(/-/g, '_').toUpperCase();
        urls[key] = lib.cdnUrl;
        if (lib.cdnCssUrl) {
          urls[`${key}_CSS`] = lib.cdnCssUrl;
        }
      });
    return urls;
  }
  
  /**
   * Reset to default configuration
   */
  static resetToDefault(): void {
    this.configuration = DEFAULT_LIBRARY_CONFIG;
  }
}


/**
 * Creates a standard libraries object for browser environments
 * Dynamically collects all libraries based on current configuration
 */
export function createStandardLibraries(): StandardLibraries {
  if (typeof window === 'undefined') {
    // Return empty object in Node.js environments
    return {};
  }
  
  const libs: StandardLibraries = {};
  
  // Add all component libraries as globals based on configuration
  StandardLibraryManager.getComponentLibraries().forEach(lib => {
    const globalValue = (window as any)[lib.globalVariable];
    if (globalValue !== undefined) {
      libs[lib.globalVariable] = globalValue;
    }
  });
  
  return libs;
}