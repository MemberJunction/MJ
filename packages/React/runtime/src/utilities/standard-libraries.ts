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
  static SetConfiguration(config: LibraryConfiguration): void {
    this.configuration = config;
  }

  /** @deprecated Use {@link SetConfiguration}. */
  static setConfiguration(config: LibraryConfiguration): void {
    return this.SetConfiguration(config);
  }
  
  /**
   * Get the current library configuration
   */
  static GetConfiguration(): LibraryConfiguration {
    return this.configuration;
  }

  /** @deprecated Use {@link GetConfiguration}. */
  static getConfiguration(): LibraryConfiguration {
    return this.GetConfiguration();
  }
  
  /**
   * Get all enabled libraries
   */
  static GetEnabledLibraries(): ExternalLibraryConfig[] {
    return this.configuration.libraries.filter(lib => lib.isEnabled);
  }

  /** @deprecated Use {@link GetEnabledLibraries}. */
  static getEnabledLibraries(): ExternalLibraryConfig[] {
    return this.GetEnabledLibraries();
  }
  
  /**
   * Get libraries by category
   */
  static GetLibrariesByCategory(category: ExternalLibraryConfig['category']): ExternalLibraryConfig[] {
    return this.configuration.libraries.filter(lib => lib.category === category && lib.isEnabled);
  }

  /** @deprecated Use {@link GetLibrariesByCategory}. */
  static getLibrariesByCategory(category: ExternalLibraryConfig['category']): ExternalLibraryConfig[] {
    return this.GetLibrariesByCategory(category);
  }
  
  /**
   * Get core libraries (runtime essentials)
   */
  static GetCoreLibraries(): ExternalLibraryConfig[] {
    return this.configuration.libraries.filter(lib => lib.isCore && lib.isEnabled);
  }

  /** @deprecated Use {@link GetCoreLibraries}. */
  static getCoreLibraries(): ExternalLibraryConfig[] {
    return this.GetCoreLibraries();
  }
  
  /**
   * Get component libraries (non-runtime)
   */
  static GetComponentLibraries(): ExternalLibraryConfig[] {
    return this.configuration.libraries.filter(lib => !lib.isRuntimeOnly && lib.isEnabled);
  }

  /** @deprecated Use {@link GetComponentLibraries}. */
  static getComponentLibraries(): ExternalLibraryConfig[] {
    return this.GetComponentLibraries();
  }
  
  /**
   * Get library by ID
   */
  static GetLibraryById(id: string): ExternalLibraryConfig | undefined {
    return this.configuration.libraries.find(lib => lib.id === id);
  }

  /** @deprecated Use {@link GetLibraryById}. */
  static getLibraryById(id: string): ExternalLibraryConfig | undefined {
    return this.GetLibraryById(id);
  }
  
  /**
   * Get library URLs as a simple object (for backward compatibility)
   */
  static GetLibraryUrls(): Record<string, string> {
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

  /** @deprecated Use {@link GetLibraryUrls}. */
  static getLibraryUrls(): Record<string, string> {
    return this.GetLibraryUrls();
  }
  
  /**
   * Reset to default configuration
   */
  static ResetToDefault(): void {
    this.configuration = DEFAULT_LIBRARY_CONFIG;
  }

  /** @deprecated Use {@link ResetToDefault}. */
  static resetToDefault(): void {
    return this.ResetToDefault();
  }
}


/**
 * Creates a standard libraries object for browser environments
 * Dynamically collects all libraries based on current configuration
 */
export function CreateStandardLibraries(): StandardLibraries {
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

/** @deprecated Use {@link CreateStandardLibraries}. */
export function createStandardLibraries(): StandardLibraries {
  return CreateStandardLibraries();
}