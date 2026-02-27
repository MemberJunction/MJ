/**
 * @fileoverview Service to manage React and ReactDOM instances with proper lifecycle.
 * Bridges Angular components with React rendering capabilities.
 * @module @memberjunction/ng-react
 */

import { Injectable, OnDestroy } from '@angular/core';
import { BehaviorSubject, firstValueFrom } from 'rxjs';
import { filter } from 'rxjs/operators';
import { AngularAdapterService } from './angular-adapter.service';
import { RuntimeContext } from '@memberjunction/react-runtime';
import { ReactDebugConfig } from '../config/react-debug.config';

/**
 * Service to manage React and ReactDOM instances with proper lifecycle.
 * Provides methods for creating and managing React roots in Angular applications.
 */
@Injectable({ providedIn: 'root' })
export class ReactBridgeService implements OnDestroy {
  private reactRoots = new Set<any>();
  
  // Track React readiness state
  private reactReadySubject = new BehaviorSubject<boolean>(false);
  public reactReady$ = this.reactReadySubject.asObservable();
  
  // Track if this is the first component trying to use React
  private firstComponentAttempted = false;
  private maxWaitTime = 5000; // Maximum 5 seconds wait time
  private checkInterval = 200; // Check every 200ms
  
  // Debug flag from project configuration
  public debug: boolean = ReactDebugConfig.getDebugMode();

  constructor(private adapter: AngularAdapterService) {
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
      // Log the debug mode being used
      console.log(`ReactBridgeService: Initializing React with debug mode = ${this.debug} (from ReactDebugConfig)`);
      
      // Pass debug flag to get development builds when debug is enabled
      await this.adapter.initialize(undefined, undefined, { debug: this.debug });
      
      if (this.debug) {
        console.log('React ecosystem pre-loaded successfully with DEVELOPMENT builds (detailed error messages)');
      } else {
        console.log('React ecosystem pre-loaded successfully with PRODUCTION builds (minified)');
      }
    } catch (error) {
      console.error('Failed to pre-load React ecosystem:', error);
    }
  }

  /**
   * Wait for React to be ready, with special handling for first component
   */
  async waitForReactReady(): Promise<void> {
    const diagTime = Date.now();
    // If already ready, return immediately
    if (this.reactReadySubject.value) {
      console.log(`[DIAG][${diagTime}] waitForReactReady() already ready, returning immediately`);
      return;
    }

    // Check if this is the first component attempting to use React
    const isFirstComponent = !this.firstComponentAttempted;
    this.firstComponentAttempted = true;

    console.log(`[DIAG][${diagTime}] waitForReactReady() isFirstComponent=${isFirstComponent}, starting polling...`);

    if (isFirstComponent) {
      // First component - check periodically until React is ready
      if (this.debug) {
        console.log('First React component loading - checking for React initialization');
      }

      const startTime = Date.now();

      while (Date.now() - startTime < this.maxWaitTime) {
        try {
          const testDiv = document.createElement('div');
          const context = this.adapter.getRuntimeContext();
          
          if (context.ReactDOM?.createRoot) {
            // Try to create a test root
            const testRoot = context.ReactDOM.createRoot(testDiv);
            if (testRoot) {
              testRoot.unmount();
              // React is ready!
              this.reactReadySubject.next(true);
              if (this.debug) {
                console.log(`React is fully ready after ${Date.now() - startTime}ms`);
              }
              return;
            }
          }
        } catch (error) {
          // Not ready yet, continue checking
        }
        
        // Wait before next check
        await new Promise(resolve => setTimeout(resolve, this.checkInterval));
      }
      
      // If we've exhausted the wait time, throw error
      console.error('React readiness test failed after maximum wait time');
      this.firstComponentAttempted = false;
      throw new Error(`ReactDOM.createRoot not available after ${this.maxWaitTime}ms`);
    } else {
      // Subsequent components wait for the ready signal
      await firstValueFrom(this.reactReady$.pipe(filter(ready => ready)));
    }
  }

  /**
   * Get the current React context if loaded
   * @returns React context with React, ReactDOM, Babel, and libraries
   */
  async getReactContext(): Promise<RuntimeContext> {
    await this.adapter.initialize(undefined, undefined, {debug: this.debug});
    return this.adapter.getRuntimeContext();
  }

  /**
   * Get the current React context synchronously
   * @returns React context or null if not loaded
   */
  getCurrentContext(): RuntimeContext | null {
    if (!this.adapter.isInitialized()) {
      return null;
    }
    return this.adapter.getRuntimeContext();
  }

  /**
   * Create a React root for rendering
   * @param container - DOM element to render into
   * @returns React root instance
   */
  createRoot(container: HTMLElement): any {
    const context = this.getCurrentContext();
    if (!context?.ReactDOM?.createRoot) {
      throw new Error('ReactDOM.createRoot not available');
    }

    const root = context.ReactDOM.createRoot(container);
    this.reactRoots.add(root);
    return root;
  }

  /**
   * Unmount and clean up a React root
   * @param root - React root to unmount
   */
  unmountRoot(root: any): void {
    if (root && typeof root.unmount === 'function') {
      try {
        root.unmount();
      } catch (error) {
        console.warn('Failed to unmount React root:', error);
      }
    }
    this.reactRoots.delete(root);
  }

  /**
   * Transpile JSX code to JavaScript
   * @param code - JSX code to transpile
   * @param filename - Optional filename for error messages
   * @returns Transpiled JavaScript code
   */
  transpileJSX(code: string, filename: string): string {
    return this.adapter.transpileJSX(code, filename);
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
    
    // Reset readiness state
    this.reactReadySubject.next(false);
    this.firstComponentAttempted = false;

    // Clean up adapter
    this.adapter.destroy();
  }

  /**
   * Check if React is currently ready
   * @returns true if React is ready
   */
  isReady(): boolean {
    return this.reactReadySubject.value;
  }

  /**
   * Get the number of active React roots
   * @returns Number of active roots
   */
  getActiveRootsCount(): number {
    return this.reactRoots.size;
  }
}