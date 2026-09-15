/**
 * @fileoverview Main entry point for the MemberJunction React Runtime.
 * Exports all public APIs for platform-agnostic React component compilation and execution.
 * @module @memberjunction/react-runtime
 */

// Import necessary classes for createReactRuntime function
import { ComponentCompiler } from './compiler';
import { ComponentRegistry } from './registry';
import { ComponentResolver } from './registry';
import { ComponentManager } from './component-manager';

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
  ResolvedComponents,
  ComponentRegistryService,
  IComponentRegistryClient
} from './registry';

// Export unified ComponentManager
export { ComponentManager } from './component-manager';
export type {
  LoadOptions,
  LoadResult,
  HierarchyResult,
  ComponentManagerConfig
} from './component-manager';

// Export runtime APIs
export {
  createErrorBoundary,
  withErrorBoundary,
  formatComponentError,
  createErrorLogger
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
  ManagedReactRoot,
  RuntimeHook,
  RootHookContext
} from './runtime';

// Export utilities

export {
  SetupStyles,
  CreateDefaultComponentStyles, createDefaultComponentStyles,
  BuildStylesFromTheme,
  ApplyStyleOverrides
} from './utilities/component-styles';

export {
  BuildAntdThemeConfig, buildAntdThemeConfig,
  WrapWithLibraryThemeProviders, wrapWithLibraryThemeProviders
} from './utilities/component-library-theming';

export {
  StandardLibraries,
  StandardLibraryManager,
  CreateStandardLibraries, createStandardLibraries
} from './utilities/standard-libraries';

export {
  LibraryLoader,
  LibraryLoadOptions,
  LibraryLoadResult
} from './utilities/library-loader';

export {
  GetCoreRuntimeLibraries, getCoreRuntimeLibraries,
  IsCoreRuntimeLibrary, isCoreRuntimeLibrary
} from './utilities/core-libraries';

export {
  LibraryRegistry,
  LibraryDefinition
} from './utilities/library-registry';

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

export {
  UnwrapLibraryComponent, unwrapLibraryComponent,
  UnwrapLibraryComponents, unwrapLibraryComponents,
  UnwrapAllLibraryComponents, unwrapAllLibraryComponents,
  // Legacy exports for backward compatibility
  UnwrapComponent, unwrapComponent,
  UnwrapComponents, unwrapComponents,
  UnwrapAllComponents, unwrapAllComponents
} from './utilities/component-unwrapper';

export {
  USER_STATE_KEY_PREFIX,
  ResolveUserStateScope, resolveUserStateScope,
  UserStateStorageKey, userStateStorageKey,
  ParseStoredUserSettings, parseStoredUserSettings,
  MergeUserSettings, mergeUserSettings,
  ApplyUserSettingsUpdate, applyUserSettingsUpdate
} from './utilities/user-state';

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
 * @param runtimeContext - Optional runtime context for registry-based components
 * @param debug - Enable debug logging (defaults to false)
 * @returns Object containing compiler, registry, and resolver instances
 */
export function CreateReactRuntime(
  babelInstance: any,
  config?: {
    compiler?: Partial<import('./types').CompilerConfig>;
    registry?: Partial<import('./types').RegistryConfig>;
    manager?: Partial<import('./component-manager').ComponentManagerConfig>;
  },
  runtimeContext?: import('./types').RuntimeContext,
  debug: boolean = false
) {
  // Merge debug flag into configs
  const compilerConfig = {
    ...config?.compiler,
    debug: config?.compiler?.debug ?? debug
  };
  
  const registryConfig = {
    ...config?.registry,
    debug: config?.registry?.debug ?? debug
  };
  
  const managerConfig = {
    ...config?.manager,
    debug: config?.manager?.debug ?? debug
  };
  
  const compiler = new ComponentCompiler(compilerConfig);
  compiler.setBabelInstance(babelInstance);
  
  const registry = new ComponentRegistry(registryConfig);
  const resolver = new ComponentResolver(registry, compiler, runtimeContext);
  
  // Create the unified ComponentManager
  const manager = new ComponentManager(
    compiler,
    registry,
    runtimeContext || { React: null, ReactDOM: null },
    managerConfig
  );

  return {
    compiler,
    registry,
    resolver,
    manager,  // New unified manager
    version: VERSION,
    debug
  };
}

/** @deprecated Use {@link CreateReactRuntime}. */
export function createReactRuntime(
  babelInstance: any,
  config?: {
    compiler?: Partial<import('./types').CompilerConfig>;
    registry?: Partial<import('./types').RegistryConfig>;
    manager?: Partial<import('./component-manager').ComponentManagerConfig>;
  },
  runtimeContext?: import('./types').RuntimeContext,
  debug: boolean = false
) {
  return CreateReactRuntime(babelInstance, config, runtimeContext, debug);
}