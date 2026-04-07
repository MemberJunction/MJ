/**
 * @fileoverview Service to manage React and ReactDOM instances with proper lifecycle.
 * Bridges Angular components with React rendering capabilities.
 * @module @memberjunction/ng-react
 */

import { Injectable, OnDestroy } from '@angular/core';
import { BehaviorSubject, firstValueFrom } from 'rxjs';
import { filter } from 'rxjs/operators';
import { AngularAdapterService } from './angular-adapter.service';
import { RuntimeContext, reactRootManager } from '@memberjunction/react-runtime';
import { ReactDebugConfig } from '../config/react-debug.config';
import { createAntdDropdownPositionHook } from '../hooks/antd-dropdown-position-hook';

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
  private maxWaitTime = 5000; // Maximum 5 seconds wait time for createRoot poll
  private checkInterval = 200; // Check every 200ms
  private maxBootstrapRetries = 2; // Retry bootstrap up to 2 additional times
  private retryBaseDelay = 2000; // Base delay between bootstrap retries (ms)

  // Debug flag from project configuration
  public debug: boolean = ReactDebugConfig.getDebugMode();

  // The current bootstrap attempt — shared between constructor and getReactContext()
  private bootstrapPromise: Promise<void> | null = null;

  constructor(private adapter: AngularAdapterService) {
    // Bootstrap React immediately on service initialization
    this.bootstrapWithRetries();
  }

  ngOnDestroy(): void {
    this.cleanup();
  }

  /**
   * Bootstrap React from CDN with automatic retries.
   * Deduplicates: concurrent callers share the same in-flight promise.
   * On failure, clears the promise so the next call can retry.
   */
  private bootstrapWithRetries(): Promise<void> {
    if (!this.bootstrapPromise) {
      this.bootstrapPromise = this.doBootstrapWithRetries();
    }
    return this.bootstrapPromise;
  }

  /**
   * Attempt to load the React ecosystem from CDN, retrying with exponential
   * backoff if the CDN is unreachable or returns an error.
   */
  private async doBootstrapWithRetries(): Promise<void> {
    console.log(`ReactBridgeService: Initializing React with debug mode = ${this.debug} (from ReactDebugConfig)`);
    let lastError: unknown;

    for (let attempt = 0; attempt <= this.maxBootstrapRetries; attempt++) {
      try {
        if (attempt > 0) {
          const delay = this.retryBaseDelay * Math.pow(2, attempt - 1);
          console.warn(
            `React CDN bootstrap attempt ${attempt + 1} of ${this.maxBootstrapRetries + 1} — retrying in ${delay}ms...`
          );
          await new Promise(resolve => setTimeout(resolve, delay));
        }

        await this.adapter.initialize(undefined, undefined, { debug: this.debug });

        // Register Angular-specific runtime hooks for library compatibility
        reactRootManager.RegisterHook(createAntdDropdownPositionHook());

        if (this.debug) {
          console.log('React ecosystem pre-loaded successfully with DEVELOPMENT builds (detailed error messages)');
        } else {
          console.log('React ecosystem pre-loaded successfully with PRODUCTION builds (minified)');
        }
        return; // Success
      } catch (error) {
        lastError = error;
        console.error(`React bootstrap attempt ${attempt + 1} failed:`, error);
      }
    }

    // All attempts exhausted — clear promise so future calls can retry
    this.bootstrapPromise = null;
    throw lastError;
  }

  /**
   * Wait for React to be ready, with special handling for first component.
   * If bootstrap succeeded but createRoot isn't usable (stale browser cache),
   * forces a re-bootstrap and retries.
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
      await this.pollForReactReadyWithRetries();
    } else {
      // Subsequent components wait for the ready signal
      await firstValueFrom(this.reactReady$.pipe(filter(ready => ready)));
    }
  }

  /**
   * Poll for ReactDOM.createRoot availability. If the poll window expires
   * (bootstrap succeeded but createRoot is broken, e.g. stale cache),
   * force a fresh re-bootstrap and retry.
   */
  private async pollForReactReadyWithRetries(): Promise<void> {
    const overallStart = Date.now();

    for (let attempt = 0; attempt <= this.maxBootstrapRetries; attempt++) {
      if (attempt > 0) {
        console.warn(
          `React createRoot check failed (attempt ${attempt}) — forcing fresh CDN re-bootstrap...`
        );
        // Clear the cached bootstrap promise so doBootstrapWithRetries runs fresh
        this.bootstrapPromise = null;
        this.adapter.destroy();
        try {
          await this.bootstrapWithRetries();
        } catch {
          // Bootstrap itself failed — continue to next poll attempt
          continue;
        }
      }

      const ready = await this.pollForCreateRoot();
      if (ready) {
        this.reactReadySubject.next(true);
        if (this.debug) {
          console.log(`React is fully ready after ${Date.now() - overallStart}ms (attempt ${attempt + 1})`);
        }
        return;
      }
    }

    // All attempts exhausted
    const totalTime = Date.now() - overallStart;
    console.error(
      `React readiness test failed after ${this.maxBootstrapRetries + 1} attempts (${totalTime}ms total)`
    );
    this.firstComponentAttempted = false;
    throw new Error(
      `ReactDOM.createRoot not available after ${this.maxBootstrapRetries + 1} attempts (${totalTime}ms). ` +
      `Try a hard refresh (Ctrl+Shift+R) to clear the browser cache.`
    );
  }

  /**
   * Poll for ReactDOM.createRoot for up to maxWaitTime ms.
   * @returns true if createRoot became available, false if the poll window expired.
   */
  private async pollForCreateRoot(): Promise<boolean> {
    const startTime = Date.now();

    while (Date.now() - startTime < this.maxWaitTime) {
      try {
        const testDiv = document.createElement('div');
        const context = this.adapter.getRuntimeContext();

        if (context.ReactDOM?.createRoot) {
          const testRoot = context.ReactDOM.createRoot(testDiv);
          if (testRoot) {
            testRoot.unmount();
            return true;
          }
        }
      } catch {
        // Not ready yet, continue checking
      }

      await new Promise(resolve => setTimeout(resolve, this.checkInterval));
    }

    return false;
  }

  /**
   * Get the current React context if loaded.
   * Awaits the bootstrap (with retries) rather than calling adapter.initialize() independently.
   * @returns React context with React, ReactDOM, Babel, and libraries
   */
  async getReactContext(): Promise<RuntimeContext> {
    await this.bootstrapWithRetries();
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

    // Clean up runtime hooks (disconnects observers, removes injected styles, etc.)
    reactRootManager.cleanup();

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