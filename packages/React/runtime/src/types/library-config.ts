/**
 * Configuration for external libraries used in React components
 */

export interface ExternalLibraryConfig {
  /** Unique identifier for the library */
  id: string;
  
  /** Library name (e.g., 'lodash') */
  name: string;
  
  /** Display name for UI (e.g., 'Lodash') */
  displayName: string;
  
  /** Library category */
  category: 'core' | 'runtime' | 'ui' | 'charting' | 'utility';
  
  /** Global variable name when loaded (e.g., '_' for lodash) */
  globalVariable: string;
  
  /** Library version */
  version: string;
  
  /** CDN URL for the library JavaScript */
  cdnUrl: string;

  /** Fallback CDN URLs to try if the primary cdnUrl fails (tried in order) */
  fallbackCdnUrls?: string[];

  /** Optional CDN URL for library CSS */
  cdnCssUrl?: string;
  
  /** Library description */
  description: string;
  
  /** Instructions for AI when using this library */
  aiInstructions?: string;
  
  /** Example usage code */
  exampleUsage?: string;
  
  /** Whether the library is enabled */
  isEnabled: boolean;
  
  /** Whether this is a core library (always loaded) */
  isCore: boolean;
  
  /** Whether this is runtime-only (not exposed to generated components) */
  isRuntimeOnly?: boolean;
}

export interface LibraryConfigurationMetadata {
  version: string;
  lastUpdated: string;
  description?: string;
}

export interface LibraryConfiguration {
  libraries: ExternalLibraryConfig[];
  metadata: LibraryConfigurationMetadata;
}

/**
 * Library loading options
 */
export interface LibraryLoadOptions {
  /** Skip loading if already loaded */
  skipIfLoaded?: boolean;
  
  /** Timeout for loading (ms) */
  timeout?: number;
  
  /** Filter to specific categories */
  categories?: Array<ExternalLibraryConfig['category']>;
  
  /** Exclude runtime-only libraries */
  excludeRuntimeOnly?: boolean;
}