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
    // Load React and ReactDOM
    const [React, ReactDOM, Babel] = await Promise.all([
      this.loadScript(CDN_URLS.REACT, 'React'),
      this.loadScript(CDN_URLS.REACT_DOM, 'ReactDOM'),
      this.loadScript(CDN_URLS.BABEL_STANDALONE, 'Babel')
    ]);

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
}