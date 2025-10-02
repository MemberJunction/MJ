/**
 * @fileoverview Project-level React debug configuration
 * Controls whether React development or production builds are loaded
 * @module @memberjunction/ng-react/config
 */

/**
 * Global configuration for React library loading.
 * Set this to true in development environments to get detailed React error messages.
 * Set to false in production for smaller bundle sizes and better performance.
 *
 * This must be configured before any React components are loaded.
 * Typically set in your app.module.ts or main.ts file.
 *
 * @example
 * // Option 1: Set via window global (for quick testing):
 * (window as any).__MJ_REACT_DEBUG_MODE__ = true;
 *
 * // Option 2: Use Angular environment (recommended):
 * import { environment } from './environments/environment';
 * import { ReactDebugConfig } from '@memberjunction/ng-react';
 * ReactDebugConfig.setDebugMode(environment.reactDebug || false);
 *
 * // In your environment.ts file:
 * export const environment = {
 *   production: false,
 *   reactDebug: true  // Enable React debug logging
 * };
 */
export class ReactDebugConfig {
  /**
   * Static property that controls React debug mode globally.
   * Can be overridden at application startup before React loads.
   * Defaults to false to avoid verbose console logging.
   * Set to true via environment variable or setDebugMode() for debugging.
   */
  static DEBUG_MODE: boolean = false;

  /**
   * Get the current debug mode setting.
   * Priority order:
   * 1. Window global override (__MJ_REACT_DEBUG_MODE__)
   * 2. Static DEBUG_MODE property (set via setDebugMode() or environment)
   * Defaults to false if none are set.
   */
  static getDebugMode(): boolean {
    // Check if a global override has been set
    if (typeof window !== 'undefined' && (window as any).__MJ_REACT_DEBUG_MODE__ !== undefined) {
      return (window as any).__MJ_REACT_DEBUG_MODE__;
    }

    // Fall back to static property (defaults to false)
    return ReactDebugConfig.DEBUG_MODE;
  }

  /**
   * Set the debug mode (must be called before React loads)
   */
  static setDebugMode(debug: boolean): void {
    ReactDebugConfig.DEBUG_MODE = debug;
    if (typeof window !== 'undefined') {
      (window as any).__MJ_REACT_DEBUG_MODE__ = debug;
    }
  }
}