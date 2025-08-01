/**
 * @fileoverview Core type definitions for the MemberJunction React Runtime.
 * These types are platform-agnostic and can be used in any JavaScript environment.
 * @module @memberjunction/react-runtime/types
 */

/**
 * Represents a compiled React component with its metadata
 */
export interface CompiledComponent {
  /** The compiled React component function or class */
  component: any;
  /** Unique identifier for the component */
  id: string;
  /** Original component name */
  name: string;
  /** Compilation timestamp */
  compiledAt: Date;
  /** Any compilation warnings */
  warnings?: string[];
}

/**
 * Options for compiling a React component
 */
export interface CompileOptions {
  /** Component name for identification */
  componentName: string;
  /** Raw component code to compile */
  componentCode: string;
  /** Optional styles to inject */
  styles?: ComponentStyles;
  /** Whether to use production mode optimizations */
  production?: boolean;
  /** Custom Babel plugins to use */
  babelPlugins?: string[];
  /** Custom Babel presets to use */
  babelPresets?: string[];
}

/**
 * Component styles that can be applied
 */
export interface ComponentStyles {
  /** CSS classes to apply */
  className?: string;
  /** Inline styles */
  style?: Record<string, any>;
  /** Global CSS to inject */
  globalCss?: string;
}

/**
 * Registry entry for a compiled component
 */
export interface RegistryEntry {
  /** The compiled component */
  component: any;
  /** Component metadata */
  metadata: ComponentMetadata;
  /** Last access time for LRU cache */
  lastAccessed: Date;
  /** Reference count for cleanup */
  refCount: number;
}

/**
 * Metadata about a registered component
 */
export interface ComponentMetadata {
  /** Unique component identifier */
  id: string;
  /** Component name */
  name: string;
  /** Component version */
  version: string;
  /** Namespace for organization */
  namespace: string;
  /** Registration timestamp */
  registeredAt: Date;
  /** Optional tags for categorization */
  tags?: string[];
}

/**
 * Error information from component execution
 */
export interface ComponentError {
  /** Error message */
  message: string;
  /** Error stack trace */
  stack?: string;
  /** Component name where error occurred */
  componentName: string;
  /** Error phase (compilation, render, etc.) */
  phase: 'compilation' | 'registration' | 'render' | 'runtime';
  /** Additional error details */
  details?: any;
}

/**
 * Props passed to React components
 */
export interface ComponentProps {
  /** Data object for the component */
  data: any;
  /** User-managed state */
  userState: any;
  /** Utility functions available to the component */
  utilities: any;
  /** Callback functions */
  callbacks: ComponentCallbacks;
  /** Child components available for use */
  components?: Record<string, any>;
  /** Component styles */
  styles?: ComponentStyles;
  /** Standard state change handler for controlled components */
  onStateChanged?: (stateUpdate: Record<string, any>) => void;
}

/**
 * Callbacks available to React components
 */
export interface ComponentCallbacks {
  /** Request data refresh */
  RefreshData?: () => void;
  /** Open an entity record */
  OpenEntityRecord?: (entityName: string, key: any) => void;
  /** Update user state */
  UpdateUserState?: (state: any) => void;
  /** Notify of a custom event */
  NotifyEvent?: (event: string, data: any) => void;
}

/**
 * Configuration for the component compiler
 */
export interface CompilerConfig {
  /** Babel configuration */
  babel: {
    /** Presets to use */
    presets: string[];
    /** Plugins to use */
    plugins: string[];
  };
  /** Whether to minify output */
  minify: boolean;
  /** Source map generation */
  sourceMaps: boolean;
  /** Cache compiled components */
  cache: boolean;
  /** Maximum cache size */
  maxCacheSize: number;
}

/**
 * Configuration for the component registry
 */
export interface RegistryConfig {
  /** Maximum number of components to keep in memory */
  maxComponents: number;
  /** Time in ms before removing unused components */
  cleanupInterval: number;
  /** Whether to use LRU eviction */
  useLRU: boolean;
  /** Namespace isolation */
  enableNamespaces: boolean;
}

/**
 * Result of a compilation operation
 */
export interface CompilationResult {
  /** Whether compilation succeeded */
  success: boolean;
  /** The compiled component if successful */
  component?: CompiledComponent;
  /** Error information if failed */
  error?: ComponentError;
  /** Compilation duration in ms */
  duration: number;
  /** Size of compiled code in bytes */
  size?: number;
}

/**
 * Runtime context for component execution
 */
export interface RuntimeContext {
  /** React library reference */
  React: any;
  /** ReactDOM library reference */
  ReactDOM?: any;
  /** Additional libraries available */
  libraries?: Record<string, any>;
  /** Global utilities */
  utilities?: Record<string, any>;
}

/**
 * Component lifecycle events
 */
export interface ComponentLifecycle {
  /** Called before component mounts */
  beforeMount?: () => void;
  /** Called after component mounts */
  afterMount?: () => void;
  /** Called before component updates */
  beforeUpdate?: (prevProps: any, nextProps: any) => void;
  /** Called after component updates */
  afterUpdate?: (prevProps: any, currentProps: any) => void;
  /** Called before component unmounts */
  beforeUnmount?: () => void;
}

/**
 * Options for creating an error boundary
 */
export interface ErrorBoundaryOptions {
  /** Custom error handler */
  onError?: (error: Error, errorInfo: any) => void;
  /** Fallback UI to render on error */
  fallback?: any;
  /** Whether to log errors */
  logErrors?: boolean;
  /** Error recovery strategy */
  recovery?: 'retry' | 'reset' | 'none';
}

// Export library configuration types
export * from './library-config';