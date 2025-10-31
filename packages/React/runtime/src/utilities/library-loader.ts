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
import { resourceManager } from './resource-manager';
import { ComponentLibraryEntity } from '@memberjunction/core-entities';
import { LibraryDependencyResolver } from './library-dependency-resolver';
import { LoadedLibraryState, DependencyResolutionOptions } from '../types/dependency-types';
import { LibraryRegistry } from './library-registry';

// Unique component ID for resource tracking
const LIBRARY_LOADER_COMPONENT_ID = 'mj-react-runtime-library-loader-singleton';

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
  private static loadedLibraryStates = new Map<string, LoadedLibraryState>();
  private static dependencyResolver = new LibraryDependencyResolver({ debug: false });
  
  /**
   * Enable progressive delay for library initialization (useful for test harness)
   */
  public static enableProgressiveDelay: boolean = false;

  /**
   * Load all standard libraries (core + UI + CSS)
   * This is the main method that should be used by test harness and Angular wrapper
   * @param config Optional full library configuration to replace the default
   * @param additionalLibraries Optional additional libraries to merge with the configuration
   * @param options Optional options including debug mode flag
   */
  static async loadAllLibraries(
    config?: LibraryConfiguration, 
    additionalLibraries?: ExternalLibraryConfig[],
    options?: { debug?: boolean }
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
    
    return this.loadLibrariesFromConfig(undefined, options?.debug);
  }

  /**
   * Load libraries based on the current configuration
   */
  static async loadLibrariesFromConfig(options?: ConfigLoadOptions, debug?: boolean): Promise<LibraryLoadResult> {
    // Always load core runtime libraries first
    const coreLibraries = getCoreRuntimeLibraries(debug);
    const corePromises = coreLibraries.map(lib => 
      this.loadScript(lib.cdnUrl, lib.globalVariable, debug)
    );
    
    const coreResults = await Promise.all(corePromises);
    const React = coreResults.find((_, i) => coreLibraries[i].globalVariable === 'React');
    const ReactDOM = coreResults.find((_, i) => coreLibraries[i].globalVariable === 'ReactDOM');
    const Babel = coreResults.find((_, i) => coreLibraries[i].globalVariable === 'Babel');
    
    // Expose React and ReactDOM as globals for UMD libraries that expect them
    // Many React component libraries (Recharts, Victory, etc.) expect these as globals
    if (typeof window !== 'undefined') {
      if (React && !(window as any).React) {
        (window as any).React = React;
        console.log('✓ Exposed React as window.React for UMD compatibility');
      }
      if (ReactDOM && !(window as any).ReactDOM) {
        (window as any).ReactDOM = ReactDOM;
        console.log('✓ Exposed ReactDOM as window.ReactDOM for UMD compatibility');
      }
      // Also expose PropTypes as empty object if not present (for older libraries)
      if (!(window as any).PropTypes) {
        (window as any).PropTypes = {};
        console.log('✓ Exposed empty PropTypes as window.PropTypes for UMD compatibility');
      }
    }
    
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
      this.loadScript(lib.cdnUrl, lib.globalVariable, debug)
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
  private static async loadScript(url: string, globalName: string, debug: boolean = false): Promise<any> {
    // Check if already loaded
    const existing = this.loadedResources.get(url);
    if (existing) {
      if (debug) {
        console.log(`✅ Library '${globalName}' already loaded (cached)`);
      }
      return existing.promise;
    }

    const promise = new Promise((resolve, reject) => {
      // Check if global already exists
      const existingGlobal = (window as any)[globalName];
      if (existingGlobal) {
        if (debug) {
          console.log(`✅ Library '${globalName}' already available globally`);
        }
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

      const cleanup = () => {
        script.removeEventListener('load', onLoad);
        script.removeEventListener('error', onError);
      };

      const onLoad = async () => {
        cleanup();
        
        // Use progressive delay if enabled, otherwise use original behavior
        if (LibraryLoader.enableProgressiveDelay) {
          try {
            const global = await LibraryLoader.waitForGlobalVariable(globalName, url, debug);
            resolve(global);
          } catch (error) {
            reject(error);
          }
        } else {
          // Original behavior
          const global = (window as any)[globalName];
          if (global) {
            if (debug) {
              console.log(`✅ Library '${globalName}' loaded successfully from ${url}`);
            }
            resolve(global);
          } else {
            // Some libraries may take a moment to initialize
            const timeoutId = resourceManager.setTimeout(
              LIBRARY_LOADER_COMPONENT_ID,
              () => {
                const delayedGlobal = (window as any)[globalName];
                if (delayedGlobal) {
                  if (debug) {
                    console.log(`✅ Library '${globalName}' loaded successfully (delayed initialization)`);
                  }
                  resolve(delayedGlobal);
                } else {
                  reject(new Error(`${globalName} not found after script load`));
                }
              },
              100,
              { url, globalName }
            );
          }
        }
      };

      const onError = () => {
        cleanup();
        reject(new Error(`Failed to load script: ${url}`));
      };

      script.addEventListener('load', onLoad);
      script.addEventListener('error', onError);

      if (debug) {
        console.log(`📦 Loading library '${globalName}' from ${url}...`);
      }

      // Note: Browser may show "Could not read source map" warnings for external libraries.
      // These are harmless and expected when loading minified libraries from CDNs
      // that reference source maps which aren't available. This doesn't affect functionality.
      document.head.appendChild(script);
      
      // Register the script element for cleanup
      resourceManager.registerDOMElement(LIBRARY_LOADER_COMPONENT_ID, script);
    });

    this.loadedResources.set(url, { 
      element: document.querySelector(`script[src="${url}"]`)!, 
      promise 
    });

    return promise;
  }

  /**
   * Check if a library global variable is properly initialized
   * Generic check that works for any library
   */
  private static isLibraryReady(globalVariable: any): boolean {
    if (!globalVariable) {
      return false;
    }
    
    // For functions, they're ready immediately
    if (typeof globalVariable === 'function') {
      return true;
    }
    
    // For objects, check if they have properties (not an empty object)
    if (typeof globalVariable === 'object') {
      // Check for non-empty object with enumerable properties
      const keys = Object.keys(globalVariable);
      // Some libraries might have only non-enumerable properties, 
      // so also check for common indicators of initialization
      return keys.length > 0 || 
             Object.getOwnPropertyNames(globalVariable).length > 1 || // > 1 to exclude just constructor
             globalVariable.constructor !== Object; // Has a custom constructor
    }
    
    // For other types (string, number, etc.), consider them ready
    return true;
  }

  /**
   * Wait for a global variable to be available with progressive delays
   * @param globalName The name of the global variable to wait for
   * @param url The URL of the script (for debugging)
   * @param debug Whether to log debug information
   * @returns The global variable once it's available
   */
  private static async waitForGlobalVariable(
    globalName: string, 
    url: string, 
    debug: boolean = false
  ): Promise<any> {
    const delays = [0, 100, 200, 300, 400]; // Total: 1000ms max delay
    const maxAttempts = delays.length;
    let totalDelay = 0;

    for (let attempt = 0; attempt < maxAttempts; attempt++) {
      // Wait for the specified delay (0ms on first attempt)
      if (attempt > 0) {
        const delay = delays[attempt];
        if (debug) {
          console.log(`⏳ Waiting ${delay}ms for ${globalName} to initialize (attempt ${attempt + 1}/${maxAttempts})...`);
        }
        await new Promise(resolve => {
          resourceManager.setTimeout(
            LIBRARY_LOADER_COMPONENT_ID,
            () => resolve(undefined),
            delay,
            { globalName, attempt }
          );
        });
        totalDelay += delay;
      }

      // Check if the global variable exists
      const global = (window as any)[globalName];
      if (global) {
        // Use generic library readiness check
        const isReady = this.isLibraryReady(global);

        if (isReady) {
          if (debug) {
            if (totalDelay > 0) {
              console.log(`✅ ${globalName} ready after ${totalDelay}ms delay`);
            } else {
              console.log(`✅ Library '${globalName}' loaded successfully from ${url}`);
            }
          }
          return global;
        } else if (debug && attempt < maxAttempts - 1) {
          console.log(`🔄 ${globalName} exists but not fully initialized, will retry...`);
        }
      }
    }

    // Final check after all attempts
    const finalGlobal = (window as any)[globalName];
    if (finalGlobal) {
      console.warn(`⚠️ ${globalName} loaded but may not be fully initialized after ${totalDelay}ms`);
      return finalGlobal;
    }

    throw new Error(`${globalName} not found after script load and ${totalDelay}ms delay`);
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
    
    // Register the link element for cleanup
    resourceManager.registerDOMElement(LIBRARY_LOADER_COMPONENT_ID, link);

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
        resourceManager.setTimeout(
          LIBRARY_LOADER_COMPONENT_ID,
          () => {
            const delayedGlobal = (window as any)[globalName];
            if (delayedGlobal) {
              resolve(delayedGlobal);
            } else {
              reject(new Error(`${globalName} not found after script load`));
            }
          },
          100,
          { context: 'waitForScriptLoad', globalName }
        );
      }
    };

    // Check if already loaded
    if ((script as any).complete || (script as any).readyState === 'complete') {
      checkGlobal();
      return;
    }

    // Wait for load
    const loadHandler = () => {
      checkGlobal();
    };
    resourceManager.addEventListener(
      LIBRARY_LOADER_COMPONENT_ID,
      script,
      'load',
      loadHandler,
      { once: true }
    );
  }


  /**
   * Get all loaded resources (for cleanup)
   */
  static getLoadedResources(): Map<string, LoadedResource> {
    return this.loadedResources;
  }

  /**
   * Clear loaded resources cache and cleanup DOM elements
   */
  static clearCache(): void {
    // Remove all script and link elements we added
    this.loadedResources.forEach((resource, url) => {
      if (resource.element && resource.element.parentNode) {
        resource.element.parentNode.removeChild(resource.element);
      }
    });
    
    this.loadedResources.clear();
    this.loadedLibraryStates.clear();
    
    // Clean up any resources managed by resource manager
    resourceManager.cleanupComponent(LIBRARY_LOADER_COMPONENT_ID);
  }

  /**
   * Load a library with its dependencies
   * @param libraryName - Name of the library to load
   * @param allLibraries - All available libraries for dependency resolution
   * @param requestedBy - Name of the component/library requesting this load
   * @param options - Dependency resolution options
   * @returns Promise resolving to the loaded library global object
   */
  static async loadLibraryWithDependencies(
    libraryName: string,
    allLibraries: ComponentLibraryEntity[],
    requestedBy: string = 'user',
    options?: DependencyResolutionOptions
  ): Promise<any> {
    const debug = options?.debug || false;
    
    if (debug) {
      console.log(`📚 Loading library '${libraryName}' with dependencies`);
    }

    // Check if already loaded
    const existingState = this.loadedLibraryStates.get(libraryName);
    if (existingState) {
      if (debug) {
        console.log(`✅ Library '${libraryName}' already loaded (version: ${existingState.version})`);
      }
      // Track who requested it
      if (!existingState.requestedBy.includes(requestedBy)) {
        existingState.requestedBy.push(requestedBy);
      }
      return (window as any)[existingState.globalVariable];
    }

    // Get load order including dependencies
    const loadOrderResult = this.dependencyResolver.getLoadOrder(
      [libraryName],
      allLibraries,
      options
    );

    if (!loadOrderResult.success) {
      const errors = loadOrderResult.errors?.join(', ') || 'Unknown error';
      throw new Error(`Failed to resolve dependencies for '${libraryName}': ${errors}`);
    }

    if (loadOrderResult.warnings && debug) {
      console.warn(`⚠️ Warnings for '${libraryName}':`, loadOrderResult.warnings);
    }

    const loadOrder = loadOrderResult.order || [];
    if (debug) {
      console.log(`📋 Load order for '${libraryName}':`, loadOrder.map(lib => `${lib.Name}@${lib.Version}`));
    }

    // Load libraries in order
    for (const library of loadOrder) {
      // Skip if already loaded
      if (this.loadedLibraryStates.has(library.Name)) {
        if (debug) {
          console.log(`⏭️ Skipping '${library.Name}' (already loaded)`);
        }
        continue;
      }

      // Check library status
      if (library.Status) {
        if (library.Status === 'Disabled') {
          console.error(`🚫 ERROR: Library '${library.Name}' is DISABLED and should not be used`);
          // Continue loading anyway per requirements
        } else if (library.Status === 'Deprecated') {
          console.warn(`⚠️ WARNING: Library '${library.Name}' is DEPRECATED. Consider using an alternative.`);
        }
        // Active status is fine, no message needed
      }

      if (debug) {
        console.log(`📥 Loading '${library.Name}@${library.Version}'`);
      }

      // Load the library
      if (!library.CDNUrl || !library.GlobalVariable) {
        throw new Error(`Library '${library.Name}' missing CDN URL or global variable`);
      }

      // Load CSS if available
      if (library.CDNCssUrl) {
        const cssUrls = library.CDNCssUrl.split(',').map(url => url.trim());
        for (const cssUrl of cssUrls) {
          if (cssUrl) {
            this.loadCSS(cssUrl);
          }
        }
      }

      // Load the script
      const loadedGlobal = await this.loadScript(library.CDNUrl, library.GlobalVariable, debug);

      // Track the loaded state
      const dependencies = Array.from(
        this.dependencyResolver.getDirectDependencies(library).keys()
      );

      this.loadedLibraryStates.set(library.Name, {
        name: library.Name,
        version: library.Version || 'unknown',
        globalVariable: library.GlobalVariable,
        loadedAt: new Date(),
        requestedBy: library.Name === libraryName ? [requestedBy] : [],
        dependencies
      });

      if (debug) {
        console.log(`✅ Loaded '${library.Name}@${library.Version}'`);
      }
    }

    // Return the originally requested library's global
    const targetLibrary = loadOrder.find(lib => lib.Name === libraryName);
    if (!targetLibrary || !targetLibrary.GlobalVariable) {
      throw new Error(`Failed to load library '${libraryName}'`);
    }

    return (window as any)[targetLibrary.GlobalVariable];
  }

  /**
   * Load multiple libraries with dependency resolution
   * @param libraryNames - Names of libraries to load
   * @param allLibraries - All available libraries for dependency resolution
   * @param requestedBy - Name of the component requesting these libraries
   * @param options - Dependency resolution options
   * @returns Map of library names to their loaded global objects
   */
  static async loadLibrariesWithDependencies(
    libraryNames: string[],
    allLibraries: ComponentLibraryEntity[],
    requestedBy: string = 'user',
    options?: DependencyResolutionOptions
  ): Promise<Map<string, any>> {
    const debug = options?.debug || false;
    const result = new Map<string, any>();
    
    if (debug) {
      console.log(`📚 Loading libraries with dependencies:`, libraryNames);
      console.log(`  📦 Total available libraries: ${allLibraries.length}`);
    }

    // Get combined load order for all requested libraries
    const loadOrderResult = this.dependencyResolver.getLoadOrder(
      libraryNames,
      allLibraries,
      options
    );

    if (!loadOrderResult.success) {
      const errors = loadOrderResult.errors?.join(', ') || 'Unknown error';
      throw new Error(`Failed to resolve dependencies: ${errors}`);
    }

    if (debug) {
      console.log(`  📊 Dependency resolution result:`, {
        success: loadOrderResult.success,
        errors: loadOrderResult.errors || [],
        warnings: loadOrderResult.warnings || []
      });
      
      if (loadOrderResult.order) {
        console.log(`  🔄 Resolved dependencies for each library:`);
        loadOrderResult.order.forEach(lib => {
          const deps = this.dependencyResolver.parseDependencies(lib.Dependencies);
          if (deps.size > 0) {
            console.log(`    • ${lib.Name}@${lib.Version} requires:`, Array.from(deps.entries()));
          } else {
            console.log(`    • ${lib.Name}@${lib.Version} (no dependencies)`);
          }
        });
      }
    }

    if (loadOrderResult.warnings && debug) {
      console.warn(`  ⚠️ Warnings:`, loadOrderResult.warnings);
    }

    const loadOrder = loadOrderResult.order || [];
    if (debug) {
      console.log(`  📋 Final load order:`, loadOrder.map(lib => `${lib.Name}@${lib.Version}`));
    }

    // Load all libraries in order
    for (const library of loadOrder) {
      // Skip if already loaded
      if (this.loadedLibraryStates.has(library.Name)) {
        if (debug) {
          console.log(`⏭️ Skipping '${library.Name}' (already loaded)`);
        }
        const state = this.loadedLibraryStates.get(library.Name)!;
        if (libraryNames.includes(library.Name)) {
          result.set(library.Name, (window as any)[state.globalVariable]);
        }
        continue;
      }

      // Check library status
      if (library.Status) {
        if (library.Status === 'Disabled') {
          console.error(`🚫 ERROR: Library '${library.Name}' is DISABLED and should not be used`);
          // Continue loading anyway per requirements
        } else if (library.Status === 'Deprecated') {
          console.warn(`⚠️ WARNING: Library '${library.Name}' is DEPRECATED. Consider using an alternative.`);
        }
        // Active status is fine, no message needed
      }

      if (debug) {
        console.log(`📥 Loading '${library.Name}@${library.Version}'`);
      }

      // Load the library
      if (!library.CDNUrl || !library.GlobalVariable) {
        throw new Error(`Library '${library.Name}' missing CDN URL or global variable`);
      }

      // Load CSS if available
      if (library.CDNCssUrl) {
        const cssUrls = library.CDNCssUrl.split(',').map(url => url.trim());
        for (const cssUrl of cssUrls) {
          if (cssUrl) {
            this.loadCSS(cssUrl);
          }
        }
      }

      // Load the script
      const loadedGlobal = await this.loadScript(library.CDNUrl, library.GlobalVariable, debug);

      // Track the loaded state
      const dependencies = Array.from(
        this.dependencyResolver.getDirectDependencies(library).keys()
      );

      this.loadedLibraryStates.set(library.Name, {
        name: library.Name,
        version: library.Version || 'unknown',
        globalVariable: library.GlobalVariable,
        loadedAt: new Date(),
        requestedBy: libraryNames.includes(library.Name) ? [requestedBy] : [],
        dependencies
      });

      // Add to result if it was directly requested
      if (libraryNames.includes(library.Name)) {
        result.set(library.Name, loadedGlobal);
      }

      if (debug) {
        console.log(`✅ Loaded '${library.Name}@${library.Version}'`);
      }
    }

    return result;
  }

  /**
   * Get information about loaded libraries
   * @returns Map of loaded library states
   */
  static getLoadedLibraryStates(): Map<string, LoadedLibraryState> {
    return new Map(this.loadedLibraryStates);
  }

  /**
   * Check if a library is loaded
   * @param libraryName - Name of the library
   * @returns True if the library is loaded
   */
  static isLibraryLoaded(libraryName: string): boolean {
    return this.loadedLibraryStates.has(libraryName);
  }

  /**
   * Get the version of a loaded library
   * @param libraryName - Name of the library
   * @returns Version string or undefined if not loaded
   */
  static getLoadedLibraryVersion(libraryName: string): string | undefined {
    return this.loadedLibraryStates.get(libraryName)?.version;
  }
}