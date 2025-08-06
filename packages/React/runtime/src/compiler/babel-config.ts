/**
 * @fileoverview Babel configuration for React component compilation.
 * Provides default presets and plugins for transforming JSX and modern JavaScript.
 * @module @memberjunction/react-runtime/compiler
 */

/**
 * Default Babel presets for React compilation
 */
export const DEFAULT_PRESETS = [
  'react', // Transforms JSX
];

/**
 * Default Babel plugins for enhanced functionality
 */
export const DEFAULT_PLUGINS: string[] = [
  // Add plugins as needed for specific transformations
  // e.g., 'transform-class-properties', 'transform-optional-chaining'
];

/**
 * Production-specific Babel configuration
 */
export const PRODUCTION_CONFIG = {
  presets: DEFAULT_PRESETS,
  plugins: [
    ...DEFAULT_PLUGINS,
    // Production optimizations could go here
  ],
  minified: true,
  comments: false
};

/**
 * Development-specific Babel configuration
 */
export const DEVELOPMENT_CONFIG = {
  presets: DEFAULT_PRESETS,
  plugins: [
    ...DEFAULT_PLUGINS,
    // Development helpers could go here
  ],
  sourceMaps: 'inline',
  minified: false,
  comments: true
};

/**
 * Get Babel configuration based on environment
 * @param production - Whether to use production configuration
 * @returns Babel configuration object
 */
export function getBabelConfig(production: boolean = false) {
  return production ? PRODUCTION_CONFIG : DEVELOPMENT_CONFIG;
}

/**
 * Validates that required Babel presets are available
 * @param babel - Babel instance to check
 * @returns true if all required presets are available
 */
export function validateBabelPresets(babel: any): boolean {
  if (!babel || !babel.availablePresets) {
    return false;
  }

  // Check that React preset is available
  return 'react' in babel.availablePresets;
}

/**
 * Common JSX pragma options for different React versions
 */
export const JSX_PRAGMAS = {
  classic: {
    pragma: 'React.createElement',
    pragmaFrag: 'React.Fragment'
  },
  automatic: {
    runtime: 'automatic',
    importSource: 'react'
  }
};

/**
 * Get appropriate JSX configuration based on React version
 * @param reactVersion - React version (e.g., "18.2.0")
 * @returns JSX configuration options
 */
export function getJSXConfig(reactVersion?: string) {
  // React 17+ supports the new JSX transform
  if (reactVersion && parseInt(reactVersion.split('.')[0]) >= 17) {
    return JSX_PRAGMAS.automatic;
  }
  return JSX_PRAGMAS.classic;
}