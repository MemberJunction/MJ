/**
 * @fileoverview Service for loading external scripts and CSS in Angular applications.
 * Manages the lifecycle of dynamically loaded resources with proper cleanup.
 * @module @memberjunction/ng-react
 */

import { Injectable, OnDestroy } from '@angular/core';
import { 
  LibraryLoader,
  LibraryConfiguration,
  ExternalLibraryConfig
} from '@memberjunction/react-runtime';

/**
 * Represents a loaded script or CSS resource
 */
interface LoadedScript {
  element: HTMLScriptElement | HTMLLinkElement;
  promise: Promise<any>;
}

/**
 * Service for loading external scripts and CSS with proper cleanup.
 * Provides methods to dynamically load React and related libraries from CDN.
 */
@Injectable({ providedIn: 'root' })
export class ScriptLoaderService implements OnDestroy {
  private loadedResources = new Map<string, LoadedScript>();
  private readonly cleanupOnDestroy = new Set<string>();

  ngOnDestroy(): void {
    this.cleanup();
  }

  /**
   * Load a script from URL with automatic cleanup tracking
   * @param url - Script URL to load
   * @param globalName - Expected global variable name
   * @param autoCleanup - Whether to cleanup on service destroy
   * @returns Promise resolving to the global object
   */
  async loadScript(url: string, globalName: string, autoCleanup = false): Promise<any> {
    const existing = this.loadedResources.get(url);
    if (existing) {
      return existing.promise;
    }

    const promise = this.createScriptPromise(url, globalName);
    const element = document.querySelector(`script[src="${url}"]`) as HTMLScriptElement;
    
    if (element) {
      this.loadedResources.set(url, { element, promise });
      if (autoCleanup) {
        this.cleanupOnDestroy.add(url);
      }
    }

    return promise;
  }

  /**
   * Load a script with additional validation function
   * @param url - Script URL to load
   * @param globalName - Expected global variable name
   * @param validator - Function to validate the loaded object
   * @param autoCleanup - Whether to cleanup on service destroy
   * @returns Promise resolving to the validated global object
   */
  async loadScriptWithValidation(
    url: string, 
    globalName: string, 
    validator: (obj: any) => boolean,
    autoCleanup = false
  ): Promise<any> {
    const existing = this.loadedResources.get(url);
    if (existing) {
      const obj = await existing.promise;
      // Re-validate even for cached resources
      if (!validator(obj)) {
        throw new Error(`${globalName} loaded but failed validation`);
      }
      return obj;
    }

    const promise = this.createScriptPromiseWithValidation(url, globalName, validator);
    const element = document.querySelector(`script[src="${url}"]`) as HTMLScriptElement;
    
    if (element) {
      this.loadedResources.set(url, { element, promise });
      if (autoCleanup) {
        this.cleanupOnDestroy.add(url);
      }
    }

    return promise;
  }

  /**
   * Load CSS from URL
   * @param url - CSS URL to load
   */
  loadCSS(url: string): void {
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
   * Load common React libraries and UI frameworks
   * @param config Optional library configuration
   * @param additionalLibraries Optional additional libraries to merge
   * @returns Promise resolving to React ecosystem objects
   */
  async loadReactEcosystem(
    config?: LibraryConfiguration,
    additionalLibraries?: ExternalLibraryConfig[]
  ): Promise<{
    React: any;
    ReactDOM: any;
    Babel: any;
    libraries: any;
  }> {
    // Use the new LibraryLoader from react-runtime for consistency
    const result = await LibraryLoader.loadAllLibraries(config, additionalLibraries);
    
    // The LibraryLoader handles all the loading, but we need to ensure
    // ReactDOM.createRoot is available for Angular's specific needs
    // The ReactBridgeService will handle the delayed validation
    
    // Track loaded resources for cleanup
    LibraryLoader.getLoadedResources().forEach((resource, url) => {
      this.loadedResources.set(url, resource);
    });
    
    return result;
  }

  /**
   * Get library name from URL for global variable mapping
   * @param url - Library URL
   * @returns Global variable name
   */
  private getLibraryNameFromUrl(url: string): string {
    // Map known URLs to their global variable names
    if (url.includes('lodash')) return '_';
    if (url.includes('d3')) return 'd3';
    if (url.includes('Chart.js') || url.includes('chart')) return 'Chart';
    if (url.includes('dayjs')) return 'dayjs';
    if (url.includes('antd')) return 'antd';
    if (url.includes('react-bootstrap')) return 'ReactBootstrap';
    if (url.includes('react-dom')) return 'ReactDOM';
    if (url.includes('react')) return 'React';
    if (url.includes('babel')) return 'Babel';
    
    // Default: extract library name from filename
    const match = url.match(/\/([^/]+?)(?:\.min)?\.js$/i);
    return match ? match[1] : 'UnknownLibrary';
  }

  /**
   * Remove a specific loaded resource
   * @param url - URL of resource to remove
   */
  removeResource(url: string): void {
    const resource = this.loadedResources.get(url);
    if (resource?.element && resource.element.parentNode) {
      resource.element.parentNode.removeChild(resource.element);
    }
    this.loadedResources.delete(url);
    this.cleanupOnDestroy.delete(url);
  }

  /**
   * Clean up all resources marked for auto-cleanup
   */
  private cleanup(): void {
    for (const url of this.cleanupOnDestroy) {
      this.removeResource(url);
    }
    this.cleanupOnDestroy.clear();
  }

  /**
   * Create a promise that resolves when script loads
   * @param url - Script URL
   * @param globalName - Expected global variable
   * @returns Promise resolving to global object
   */
  private createScriptPromise(url: string, globalName: string): Promise<any> {
    return new Promise((resolve, reject) => {
      // Check if already loaded
      if ((window as any)[globalName]) {
        resolve((window as any)[globalName]);
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

      script.onload = () => {
        const global = (window as any)[globalName];
        if (global) {
          resolve(global);
        } else {
          reject(new Error(`${globalName} not found after script load`));
        }
      };

      script.onerror = () => {
        reject(new Error(`Failed to load script: ${url}`));
      };

      document.head.appendChild(script);
      this.loadedResources.set(url, { element: script, promise: Promise.resolve() });
    });
  }

  /**
   * Create a promise that resolves when script loads and passes validation
   * @param url - Script URL
   * @param globalName - Expected global variable
   * @param validator - Validation function
   * @returns Promise resolving to validated global object
   */
  private createScriptPromiseWithValidation(
    url: string, 
    globalName: string, 
    validator: (obj: any) => boolean
  ): Promise<any> {
    return new Promise((resolve, reject) => {
      // Check if already loaded and valid
      const existingGlobal = (window as any)[globalName];
      if (existingGlobal && validator(existingGlobal)) {
        resolve(existingGlobal);
        return;
      }

      // Check if script tag exists
      const existingScript = document.querySelector(`script[src="${url}"]`);
      if (existingScript) {
        this.waitForScriptLoadWithValidation(
          existingScript as HTMLScriptElement, 
          globalName, 
          validator,
          resolve, 
          reject
        );
        return;
      }

      // Create new script
      const script = document.createElement('script');
      script.src = url;
      script.async = true;

      script.onload = () => {
        this.waitForValidation(globalName, validator, resolve, reject);
      };

      script.onerror = () => {
        reject(new Error(`Failed to load script: ${url}`));
      };

      document.head.appendChild(script);
      this.loadedResources.set(url, { element: script, promise: Promise.resolve() });
    });
  }

  /**
   * Wait for global object to be available and valid
   * @param globalName - Global variable name
   * @param validator - Validation function
   * @param resolve - Promise resolve function
   * @param reject - Promise reject function
   * @param attempts - Current attempt number
   * @param maxAttempts - Maximum attempts before failing
   */
  private waitForValidation(
    globalName: string,
    validator: (obj: any) => boolean,
    resolve: (value: any) => void,
    reject: (reason: any) => void,
    attempts = 0,
    maxAttempts = 50 // 5 seconds total with 100ms intervals
  ): void {
    const global = (window as any)[globalName];
    
    if (global && validator(global)) {
      resolve(global);
      return;
    }

    if (attempts >= maxAttempts) {
      if (global) {
        reject(new Error(`${globalName} loaded but validation failed after ${maxAttempts} attempts`));
      } else {
        reject(new Error(`${globalName} not found after ${maxAttempts} attempts`));
      }
      return;
    }

    // Retry with exponential backoff for first few attempts, then fixed interval
    const delay = attempts < 5 ? Math.min(100 * Math.pow(1.5, attempts), 500) : 100;
    setTimeout(() => {
      this.waitForValidation(globalName, validator, resolve, reject, attempts + 1, maxAttempts);
    }, delay);
  }

  /**
   * Wait for existing script to load
   * @param script - Script element
   * @param globalName - Expected global variable
   * @param resolve - Promise resolve function
   * @param reject - Promise reject function
   */
  private waitForScriptLoad(
    script: HTMLScriptElement,
    globalName: string,
    resolve: (value: any) => void,
    reject: (reason: any) => void
  ): void {
    const checkGlobal = () => {
      if ((window as any)[globalName]) {
        resolve((window as any)[globalName]);
        return;
      }
      // Give it a moment for the global to be defined
      setTimeout(() => {
        if ((window as any)[globalName]) {
          resolve((window as any)[globalName]);
        } else {
          reject(new Error(`${globalName} not found after script load`));
        }
      }, 100);
    };

    if ('readyState' in script) {
      // IE support
      (script as any).onreadystatechange = () => {
        if ((script as any).readyState === 'loaded' || (script as any).readyState === 'complete') {
          (script as any).onreadystatechange = null;
          checkGlobal();
        }
      };
    } else {
      // Modern browsers
      const loadHandler = () => {
        script.removeEventListener('load', loadHandler);
        checkGlobal();
      };
      script.addEventListener('load', loadHandler);
    }
  }

  /**
   * Wait for existing script to load with validation
   * @param script - Script element
   * @param globalName - Expected global variable
   * @param validator - Validation function
   * @param resolve - Promise resolve function
   * @param reject - Promise reject function
   */
  private waitForScriptLoadWithValidation(
    script: HTMLScriptElement,
    globalName: string,
    validator: (obj: any) => boolean,
    resolve: (value: any) => void,
    reject: (reason: any) => void
  ): void {
    const checkGlobal = () => {
      this.waitForValidation(globalName, validator, resolve, reject);
    };

    if ('readyState' in script) {
      // IE support
      (script as any).onreadystatechange = () => {
        if ((script as any).readyState === 'loaded' || (script as any).readyState === 'complete') {
          (script as any).onreadystatechange = null;
          checkGlobal();
        }
      };
    } else {
      // Modern browsers
      const loadHandler = () => {
        script.removeEventListener('load', loadHandler);
        checkGlobal();
      };
      script.addEventListener('load', loadHandler);
    }
  }
}