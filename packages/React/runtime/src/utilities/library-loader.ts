/**
 * @fileoverview Library loading utilities for React runtime
 * Provides methods to load and manage external JavaScript libraries and CSS
 * @module @memberjunction/react-runtime/utilities
 */

import { 
  STANDARD_LIBRARY_URLS,
  StandardLibraries,
  getCoreLibraryUrls,
  getUILibraryUrls,
  getCSSUrls
} from './standard-libraries';

/**
 * Represents a loaded script or CSS resource
 */
interface LoadedResource {
  element: HTMLScriptElement | HTMLLinkElement;
  promise: Promise<any>;
}

/**
 * Options for loading libraries
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
   */
  static async loadAllLibraries(): Promise<LibraryLoadResult> {
    return this.loadLibraries({
      loadCore: true,
      loadUI: true,
      loadCSS: true
    });
  }

  /**
   * Load libraries with specific options
   */
  static async loadLibraries(options: LibraryLoadOptions): Promise<LibraryLoadResult> {
    const {
      loadCore = true,
      loadUI = true,
      loadCSS = true,
      customLibraries = []
    } = options;

    // Load React ecosystem first
    const [React, ReactDOM, Babel] = await Promise.all([
      this.loadScript(STANDARD_LIBRARY_URLS.REACT, 'React'),
      this.loadScript(STANDARD_LIBRARY_URLS.REACT_DOM, 'ReactDOM'),
      this.loadScript(STANDARD_LIBRARY_URLS.BABEL, 'Babel')
    ]);

    // Load CSS files if requested (non-blocking)
    if (loadCSS) {
      getCSSUrls().forEach(url => this.loadCSS(url));
    }

    // Prepare library loading promises
    const libraryPromises: Promise<any>[] = [];
    const libraryNames: string[] = [];

    // Core libraries
    if (loadCore) {
      const coreUrls = getCoreLibraryUrls();
      coreUrls.forEach(url => {
        const name = this.getLibraryNameFromUrl(url);
        libraryNames.push(name);
        libraryPromises.push(this.loadScript(url, name));
      });
    }

    // UI libraries
    if (loadUI) {
      const uiUrls = getUILibraryUrls();
      uiUrls.forEach(url => {
        const name = this.getLibraryNameFromUrl(url);
        libraryNames.push(name);
        libraryPromises.push(this.loadScript(url, name));
      });
    }

    // Custom libraries
    customLibraries.forEach(({ url, globalName }) => {
      libraryNames.push(globalName);
      libraryPromises.push(this.loadScript(url, globalName));
    });

    // Load all libraries
    const loadedLibraries = await Promise.all(libraryPromises);

    // Build libraries object
    const libraries: StandardLibraries = {
      _: undefined // Initialize with required property
    };
    libraryNames.forEach((name, index) => {
      // Map common names
      if (name === '_') {
        libraries._ = loadedLibraries[index];
      } else {
        libraries[name] = loadedLibraries[index];
      }
    });

    // Ensure all standard properties exist
    if (!libraries._) libraries._ = (window as any)._;
    if (!libraries.d3) libraries.d3 = (window as any).d3;
    if (!libraries.Chart) libraries.Chart = (window as any).Chart;
    if (!libraries.dayjs) libraries.dayjs = (window as any).dayjs;
    if (!libraries.antd) libraries.antd = (window as any).antd;
    if (!libraries.ReactBootstrap) libraries.ReactBootstrap = (window as any).ReactBootstrap;

    return {
      React,
      ReactDOM,
      Babel,
      libraries
    };
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
   * Get library name from URL for global variable mapping
   */
  private static getLibraryNameFromUrl(url: string): string {
    // Map known URLs to their global variable names
    if (url.includes('lodash')) return '_';
    if (url.includes('d3')) return 'd3';
    if (url.includes('Chart.js') || url.includes('chart')) return 'Chart';
    if (url.includes('dayjs')) return 'dayjs';
    if (url.includes('antd')) return 'antd';
    if (url.includes('react-bootstrap')) return 'ReactBootstrap';
    
    // Default: extract name from URL
    const match = url.match(/\/([^\/]+)(?:\.min)?\.js$/);
    return match ? match[1] : 'unknown';
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