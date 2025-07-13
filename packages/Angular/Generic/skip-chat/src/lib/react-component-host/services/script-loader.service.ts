import { Injectable, OnDestroy } from '@angular/core';
import { CDN_URLS } from '../cdn-urls';

interface LoadedScript {
  element: HTMLScriptElement | HTMLLinkElement;
  promise: Promise<any>;
}

/**
 * Service for loading external scripts and CSS with proper cleanup
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
   * Load common React libraries
   */
  async loadReactEcosystem(): Promise<{
    React: any;
    ReactDOM: any;
    Babel: any;
    libraries: any;
  }> {
    // Load React and ReactDOM with enhanced validation
    const [React, ReactDOM, Babel] = await Promise.all([
      this.loadScriptWithValidation(CDN_URLS.REACT, 'React', (obj) => {
        return obj && typeof obj.createElement === 'function' && typeof obj.Component === 'function';
      }),
      this.loadScriptWithValidation(CDN_URLS.REACT_DOM, 'ReactDOM', (obj) => {
        // Just check that ReactDOM exists - createRoot might not be immediately available
        return obj != null && typeof obj === 'object';
      }),
      this.loadScript(CDN_URLS.BABEL_STANDALONE, 'Babel')
    ]);

    // Note: We don't validate createRoot here because it might not be immediately available
    // The ReactBridgeService will handle the delayed validation

    // Load CSS files (non-blocking)
    this.loadCSS(CDN_URLS.ANTD_CSS);
    this.loadCSS(CDN_URLS.BOOTSTRAP_CSS);

    // Load UI libraries
    const [antd, ReactBootstrap, d3, Chart, _, dayjs] = await Promise.all([
      this.loadScript(CDN_URLS.ANTD_JS, 'antd'),
      this.loadScript(CDN_URLS.REACT_BOOTSTRAP_JS, 'ReactBootstrap'),
      this.loadScript(CDN_URLS.D3_JS, 'd3'),
      this.loadScript(CDN_URLS.CHART_JS, 'Chart'),
      this.loadScript(CDN_URLS.LODASH_JS, '_'),
      this.loadScript(CDN_URLS.DAYJS, 'dayjs')
    ]);

    return {
      React,
      ReactDOM,
      Babel,
      libraries: { antd, ReactBootstrap, d3, Chart, _, dayjs }
    };
  }

  /**
   * Remove a specific loaded resource
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