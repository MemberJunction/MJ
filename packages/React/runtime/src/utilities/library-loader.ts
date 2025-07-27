/**
 * @fileoverview Library loading utilities for React runtime
 * Provides methods to load and manage external JavaScript libraries and CSS
 * @module @memberjunction/react-runtime/utilities
 */

import { 
  StandardLibraries,
  StandardLibraryManager
} from './standard-libraries';
import { LibraryConfiguration, ExternalLibraryConfig, LibraryLoadOptions as ConfigLoadOptions } from '../types/library-config';
import { getCoreRuntimeLibraries, isCoreRuntimeLibrary } from './core-libraries';

/**
 * Represents a loaded script or CSS resource
 */
interface LoadedResource {
  element: HTMLScriptElement | HTMLLinkElement;
  promise: Promise<any>;
}

/**
 * Options for loading libraries
 * @deprecated Use LibraryLoadOptions from library-config instead
 */
export interface LibraryLoadOptions {
  /** Load core libraries (lodash, d3, Chart.js, dayjs) */
  loadCore?: boolean;
  /** Load UI libraries (antd, React Bootstrap) */
  loadUI?: boolean;
  /** Load CSS files for UI libraries */
  loadCSS?: boolean;
  /** Custom library URLs to load */
  customLibraries?: { url: string; globalName: string }[];
}

/**
 * Result of loading libraries
 */
export interface LibraryLoadResult {
  React: any;
  ReactDOM: any;
  Babel: any;
  libraries: StandardLibraries;
}

/**
 * Library loader class for managing external script loading
 */
export class LibraryLoader {
  private static loadedResources = new Map<string, LoadedResource>();

  /**
   * Load all standard libraries (core + UI + CSS)
   * This is the main method that should be used by test harness and Angular wrapper
   * @param config Optional full library configuration to replace the default
   * @param additionalLibraries Optional additional libraries to merge with the configuration
   */
  static async loadAllLibraries(
    config?: LibraryConfiguration, 
    additionalLibraries?: ExternalLibraryConfig[]
  ): Promise<LibraryLoadResult> {
    if (config) {
      StandardLibraryManager.setConfiguration(config);
    }
    
    // If additional libraries are provided, merge them with the current configuration
    if (additionalLibraries && additionalLibraries.length > 0) {
      const currentConfig = StandardLibraryManager.getConfiguration();
      const mergedConfig: LibraryConfiguration = {
        libraries: [...currentConfig.libraries, ...additionalLibraries],
        metadata: {
          ...currentConfig.metadata,
          lastUpdated: new Date().toISOString()
        }
      };
      StandardLibraryManager.setConfiguration(mergedConfig);
    }
    
    return this.loadLibrariesFromConfig();
  }

  /**
   * Load libraries based on the current configuration
   */
  static async loadLibrariesFromConfig(options?: ConfigLoadOptions): Promise<LibraryLoadResult> {
    // Always load core runtime libraries first
    const coreLibraries = getCoreRuntimeLibraries();
    const corePromises = coreLibraries.map(lib => 
      this.loadScript(lib.cdnUrl, lib.globalVariable)
    );
    
    const coreResults = await Promise.all(corePromises);
    const React = coreResults.find((_, i) => coreLibraries[i].globalVariable === 'React');
    const ReactDOM = coreResults.find((_, i) => coreLibraries[i].globalVariable === 'ReactDOM');
    const Babel = coreResults.find((_, i) => coreLibraries[i].globalVariable === 'Babel');
    
    // Now load plugin libraries from configuration
    const config = StandardLibraryManager.getConfiguration();
    const enabledLibraries = StandardLibraryManager.getEnabledLibraries();
    
    // Filter out any core runtime libraries from plugin configuration
    let pluginLibraries = enabledLibraries.filter(lib => !isCoreRuntimeLibrary(lib.id));
    
    // Apply options filters if provided
    if (options) {
      if (options.categories) {
        pluginLibraries = pluginLibraries.filter(lib => 
          options.categories!.includes(lib.category)
        );
      }
      if (options.excludeRuntimeOnly) {
        pluginLibraries = pluginLibraries.filter(lib => !lib.isRuntimeOnly);
      }
    }
    
    // Load CSS files for plugin libraries (non-blocking)
    pluginLibraries.forEach(lib => {
      if (lib.cdnCssUrl) {
        this.loadCSS(lib.cdnCssUrl);
      }
    });
    
    // Load plugin libraries
    const pluginPromises = pluginLibraries.map(lib => 
      this.loadScript(lib.cdnUrl, lib.globalVariable)
    );
    
    const pluginResults = await Promise.all(pluginPromises);
    
    // Build libraries object (only contains plugin libraries)
    const libraries: StandardLibraries = {};
    
    pluginLibraries.forEach((lib, index) => {
      libraries[lib.globalVariable] = pluginResults[index];
    });
    
    return {
      React: React || (window as any).React,
      ReactDOM: ReactDOM || (window as any).ReactDOM,
      Babel: Babel || (window as any).Babel,
      libraries
    };
  }

  /**
   * Load libraries with specific options (backward compatibility)
   * @deprecated Use loadLibrariesFromConfig instead
   */
  static async loadLibraries(options: LibraryLoadOptions): Promise<LibraryLoadResult> {
    const {
      loadCore = true,
      loadUI = true,
      loadCSS = true,
      customLibraries = []
    } = options;

    // Map old options to new configuration approach
    const categoriesToLoad: Array<ExternalLibraryConfig['category']> = ['runtime'];
    if (loadCore) {
      categoriesToLoad.push('utility', 'charting');
    }
    if (loadUI) {
      categoriesToLoad.push('ui');
    }
    
    const result = await this.loadLibrariesFromConfig({
      categories: categoriesToLoad
    });
    
    // Load custom libraries if provided
    if (customLibraries.length > 0) {
      const customPromises = customLibraries.map(({ url, globalName }) =>
        this.loadScript(url, globalName)
      );
      
      const customResults = await Promise.all(customPromises);
      customLibraries.forEach(({ globalName }, index) => {
        result.libraries[globalName] = customResults[index];
      });
    }
    
    return result;
  }

  /**
   * Load a script from URL
   */
  private static async loadScript(url: string, globalName: string): Promise<any> {
    // Check if already loaded
    const existing = this.loadedResources.get(url);
    if (existing) {
      return existing.promise;
    }

    const promise = new Promise((resolve, reject) => {
      // Check if global already exists
      const existingGlobal = (window as any)[globalName];
      if (existingGlobal) {
        resolve(existingGlobal);
        return;
      }

      // Check if script tag exists
      const existingScript = document.querySelector(`script[src="${url}"]`);
      if (existingScript) {
        this.waitForScriptLoad(existingScript as HTMLScriptElement, globalName, resolve, reject);
        return;
      }

      // Create new script
      const script = document.createElement('script');
      script.src = url;
      script.async = true;
      script.crossOrigin = 'anonymous';

      script.onload = () => {
        const global = (window as any)[globalName];
        if (global) {
          resolve(global);
        } else {
          // Some libraries may take a moment to initialize
          setTimeout(() => {
            const delayedGlobal = (window as any)[globalName];
            if (delayedGlobal) {
              resolve(delayedGlobal);
            } else {
              reject(new Error(`${globalName} not found after script load`));
            }
          }, 100);
        }
      };

      script.onerror = () => {
        reject(new Error(`Failed to load script: ${url}`));
      };

      document.head.appendChild(script);
    });

    this.loadedResources.set(url, { 
      element: document.querySelector(`script[src="${url}"]`)!, 
      promise 
    });

    return promise;
  }

  /**
   * Load CSS from URL
   */
  private static loadCSS(url: string): void {
    if (this.loadedResources.has(url)) {
      return;
    }

    const existingLink = document.querySelector(`link[href="${url}"]`);
    if (existingLink) {
      return;
    }

    const link = document.createElement('link');
    link.rel = 'stylesheet';
    link.href = url;
    document.head.appendChild(link);

    this.loadedResources.set(url, {
      element: link,
      promise: Promise.resolve()
    });
  }

  /**
   * Wait for existing script to load
   */
  private static waitForScriptLoad(
    script: HTMLScriptElement,
    globalName: string,
    resolve: (value: any) => void,
    reject: (reason: any) => void
  ): void {
    const checkGlobal = () => {
      const global = (window as any)[globalName];
      if (global) {
        resolve(global);
      } else {
        // Retry after a short delay
        setTimeout(() => {
          const delayedGlobal = (window as any)[globalName];
          if (delayedGlobal) {
            resolve(delayedGlobal);
          } else {
            reject(new Error(`${globalName} not found after script load`));
          }
        }, 100);
      }
    };

    // Check if already loaded
    if ((script as any).complete || (script as any).readyState === 'complete') {
      checkGlobal();
      return;
    }

    // Wait for load
    const loadHandler = () => {
      script.removeEventListener('load', loadHandler);
      checkGlobal();
    };
    script.addEventListener('load', loadHandler);
  }


  /**
   * Get all loaded resources (for cleanup)
   */
  static getLoadedResources(): Map<string, LoadedResource> {
    return this.loadedResources;
  }

  /**
   * Clear loaded resources cache
   */
  static clearCache(): void {
    this.loadedResources.clear();
  }
}