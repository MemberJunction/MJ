/**
 * @fileoverview Main entry point for the MemberJunction React Runtime.
 * Exports all public APIs for platform-agnostic React component compilation and execution.
 * @module @memberjunction/react-runtime
 */

// Import necessary classes for createReactRuntime function
import { ComponentCompiler } from './compiler';
import { ComponentRegistry } from './registry';
import { ComponentResolver } from './registry';

// Export all types
export * from './types';

// Export compiler APIs
export { ComponentCompiler } from './compiler';
export { 
  DEFAULT_PRESETS,
  DEFAULT_PLUGINS,
  PRODUCTION_CONFIG,
  DEVELOPMENT_CONFIG,
  getBabelConfig,
  validateBabelPresets,
  getJSXConfig
} from './compiler';

// Export registry APIs
export { ComponentRegistry } from './registry';
export { 
  ComponentResolver,
  ComponentSpec,
  ResolvedComponents
} from './registry';

// Export runtime APIs
export {
  createErrorBoundary,
  withErrorBoundary,
  formatComponentError,
  createErrorLogger
} from './runtime';

export {
  wrapComponent,
  memoizeComponent,
  lazyComponent,
  injectProps,
  conditionalComponent,
  withErrorHandler,
  portalComponent,
  WrapperOptions
} from './runtime';

export {
  buildComponentProps,
  normalizeCallbacks,
  normalizeStyles,
  validateComponentProps,
  mergeProps,
  createPropsTransformer,
  wrapCallbacksWithLogging,
  extractPropPaths,
  PropBuilderOptions
} from './runtime';

export {
  ComponentHierarchyRegistrar,
  registerComponentHierarchy,
  validateComponentSpec,
  flattenComponentHierarchy,
  countComponentsInHierarchy,
  HierarchyRegistrationResult,
  ComponentRegistrationError,
  HierarchyRegistrationOptions
} from './runtime';

export {
  ReactRootManager,
  reactRootManager,
  ManagedReactRoot
} from './runtime';

// Export utilities
export { 
  RuntimeUtilities, 
  createRuntimeUtilities 
} from './utilities/runtime-utilities';

export { 
  SetupStyles,
  createDefaultComponentStyles 
} from './utilities/component-styles';

export {
  StandardLibraries,
  StandardLibraryManager,
  createStandardLibraries
} from './utilities/standard-libraries';

export {
  LibraryLoader,
  LibraryLoadOptions,
  LibraryLoadResult
} from './utilities/library-loader';

export {
  ComponentErrorAnalyzer,
  FailedComponentInfo
} from './utilities/component-error-analyzer';

export {
  ResourceManager,
  resourceManager,
  ManagedResource
} from './utilities/resource-manager';

export {
  CacheManager,
  CacheEntry,
  CacheOptions
} from './utilities/cache-manager';

// Version information
export const VERSION = '2.69.1';

// Default configurations
export const DEFAULT_CONFIGS = {
  compiler: {
    babel: {
      presets: ['react'],
      plugins: []
    },
    minify: false,
    sourceMaps: false,
    cache: true,
    maxCacheSize: 100
  },
  registry: {
    maxComponents: 1000,
    cleanupInterval: 60000,
    useLRU: true,
    enableNamespaces: true
  }
};

/**
 * Creates a complete React runtime instance with all necessary components
 * @param babelInstance - Babel standalone instance for compilation
 * @param config - Optional configuration overrides
 * @returns Object containing compiler, registry, and resolver instances
 */
export function createReactRuntime(
  babelInstance: any,
  config?: {
    compiler?: Partial<import('./types').CompilerConfig>;
    registry?: Partial<import('./types').RegistryConfig>;
  }
) {
  const compiler = new ComponentCompiler(config?.compiler);
  compiler.setBabelInstance(babelInstance);
  
  const registry = new ComponentRegistry(config?.registry);
  const resolver = new ComponentResolver(registry);

  return {
    compiler,
    registry,
    resolver,
    version: VERSION
  };
}