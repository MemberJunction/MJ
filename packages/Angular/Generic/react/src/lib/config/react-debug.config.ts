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
 * // In your app.module.ts or environment configuration:
 * import { REACT_DEBUG_MODE } from '@memberjunction/ng-react';
 * 
 * // For development:
 * (window as any).__MJ_REACT_DEBUG_MODE__ = true;
 * 
 * // Or use Angular environment:
 * (window as any).__MJ_REACT_DEBUG_MODE__ = !environment.production;
 */
export class ReactDebugConfig {
  /**
   * Static property that controls React debug mode globally.
   * Can be overridden at application startup before React loads.
   * Defaults to true for better development experience.
   * Should be explicitly set to false in production.
   */
  static DEBUG_MODE: boolean = true;

  /**
   * Get the current debug mode setting.
   * Checks window global first (for runtime configuration),
   * then falls back to static property.
   */
  static getDebugMode(): boolean {
    // Check if a global override has been set
    if (typeof window !== 'undefined' && (window as any).__MJ_REACT_DEBUG_MODE__ !== undefined) {
      return (window as any).__MJ_REACT_DEBUG_MODE__;
    }
    
    // Check if we're in development mode (common Angular pattern)
    // ngDevMode is truthy in dev mode, false in prod mode
    if (typeof window !== 'undefined' && (window as any).ngDevMode) {
      return true;
    }
    
    // Fall back to static property
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