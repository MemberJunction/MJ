import { Injectable, OnDestroy } from '@angular/core';
import { BehaviorSubject, firstValueFrom } from 'rxjs';
import { filter } from 'rxjs/operators';
import { ScriptLoaderService } from './script-loader.service';

/**
 * Service to manage React and ReactDOM instances with proper lifecycle
 */
@Injectable({ providedIn: 'root' })
export class ReactBridgeService implements OnDestroy {
  private reactContext: { React: any; ReactDOM: any; Babel: any; libraries: any } | null = null;
  private loadingPromise: Promise<any> | null = null;
  private reactRoots = new Set<any>();
  
  // Track React readiness state
  private reactReadySubject = new BehaviorSubject<boolean>(false);
  public reactReady$ = this.reactReadySubject.asObservable();
  
  // Track if this is the first component trying to use React
  private firstComponentAttempted = false;
  private firstComponentDelay = 2000; // 2 second delay for first component

  constructor(private scriptLoader: ScriptLoaderService) {
    // Bootstrap React immediately on service initialization
    this.bootstrapReact();
  }

  ngOnDestroy(): void {
    this.cleanup();
  }

  /**
   * Bootstrap React early during service initialization
   */
  private async bootstrapReact(): Promise<void> {
    try {
      await this.getReactContext();
      console.log('React ecosystem pre-loaded successfully');
    } catch (error) {
      console.error('Failed to pre-load React ecosystem:', error);
    }
  }

  /**
   * Wait for React to be ready, with special handling for first component
   */
  async waitForReactReady(): Promise<void> {
    // If already ready, return immediately
    if (this.reactReadySubject.value) {
      return;
    }

    // Check if this is the first component attempting to use React
    const isFirstComponent = !this.firstComponentAttempted;
    this.firstComponentAttempted = true;

    if (isFirstComponent) {
      // First component adds a delay to ensure React is fully initialized
      console.log('First React component loading - adding initialization delay');
      await new Promise(resolve => setTimeout(resolve, this.firstComponentDelay));
      
      // Verify React is working by creating a test root
      try {
        const testDiv = document.createElement('div');
        
        // Make sure we have the context and createRoot is available
        if (!this.reactContext) {
          throw new Error('React context not loaded');
        }
        
        if (!this.reactContext.ReactDOM?.createRoot) {
          throw new Error('ReactDOM.createRoot not available after delay');
        }
        
        const testRoot = this.reactContext.ReactDOM.createRoot(testDiv);
        if (testRoot) {
          testRoot.unmount();
          // React is ready!
          this.reactReadySubject.next(true);
          console.log('React is fully ready - first component initialized successfully');
        }
      } catch (error) {
        console.error('React readiness test failed:', error);
        // Don't mark as ready, let next component retry
        this.firstComponentAttempted = false;
        throw error;
      }
    } else {
      // Subsequent components wait for the ready signal
      await firstValueFrom(this.reactReady$.pipe(filter(ready => ready)));
    }
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
    
    // Reset readiness state
    this.reactReadySubject.next(false);
    this.firstComponentAttempted = false;
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