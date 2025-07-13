import { Injectable, OnDestroy } from '@angular/core';
import { ScriptLoaderService } from './script-loader.service';

/**
 * Service to manage React and ReactDOM instances with proper lifecycle
 */
@Injectable({ providedIn: 'root' })
export class ReactBridgeService implements OnDestroy {
  private reactContext: { React: any; ReactDOM: any; Babel: any; libraries: any } | null = null;
  private loadingPromise: Promise<any> | null = null;
  private reactRoots = new Set<any>();

  constructor(private scriptLoader: ScriptLoaderService) {}

  ngOnDestroy(): void {
    this.cleanup();
  }

  /**
   * Get the current React context if loaded
   */
  getCurrentContext(): { React: any; ReactDOM: any; Babel: any; libraries: any } | null {
    return this.reactContext;
  }

  /**
   * Get React context, loading if necessary
   */
  async getReactContext(): Promise<{ React: any; ReactDOM: any; Babel: any; libraries: any }> {
    if (this.reactContext) {
      return this.reactContext;
    }

    if (this.loadingPromise) {
      return this.loadingPromise;
    }

    this.loadingPromise = this.loadReactContext();
    
    try {
      this.reactContext = await this.loadingPromise;
      return this.reactContext!;
    } finally {
      this.loadingPromise = null;
    }
  }

  /**
   * Create a React root with tracking for cleanup
   */
  createRoot(container: HTMLElement): any {
    if (!this.reactContext) {
      throw new Error('React context not loaded. Call getReactContext() first.');
    }

    // Just use createRoot directly like the old code did
    const root = this.reactContext.ReactDOM.createRoot(container);
    this.reactRoots.add(root);
    return root;
  }

  /**
   * Unmount and remove a React root
   */
  unmountRoot(root: any): void {
    if (root && this.reactRoots.has(root)) {
      root.unmount();
      this.reactRoots.delete(root);
    }
  }

  /**
   * Transpile JSX code using Babel
   */
  transpileJSX(code: string, filename: string): string {
    if (!this.reactContext?.Babel) {
      throw new Error('Babel not loaded. Call getReactContext() first.');
    }

    try {
      const result = this.reactContext.Babel.transform(code, {
        presets: ['react'],
        filename: filename
      });
      return result.code;
    } catch (error) {
      throw new Error(`Failed to transpile ${filename}: ${error}`);
    }
  }

  /**
   * Clean up all React roots and reset context
   */
  private cleanup(): void {
    // Unmount all tracked React roots
    for (const root of this.reactRoots) {
      try {
        root.unmount();
      } catch (error) {
        console.warn('Failed to unmount React root:', error);
      }
    }
    this.reactRoots.clear();

    // Clear cached context
    this.reactContext = null;
    this.loadingPromise = null;
  }

  private async loadReactContext(): Promise<any> {
    const context = await this.scriptLoader.loadReactEcosystem();
    
    // Validate that everything loaded correctly - same as old code
    if (!context.React) {
      throw new Error('React not loaded');
    }
    
    if (!context.ReactDOM) {
      throw new Error('ReactDOM not loaded');
    }
    
    if (!context.Babel) {
      throw new Error('Babel not loaded');
    }

    return context;
  }
}