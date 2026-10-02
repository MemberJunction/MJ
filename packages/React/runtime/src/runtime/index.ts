/**
 * @fileoverview Runtime module exports
 * @module @memberjunction/react-runtime/runtime
 */

export {
  CreateErrorBoundary, createErrorBoundary,
  WithErrorBoundary, withErrorBoundary,
  FormatComponentError, formatComponentError,
  CreateErrorLogger, createErrorLogger
} from './error-boundary';


export {
  BuildComponentProps, buildComponentProps,
  NormalizeCallbacks, normalizeCallbacks,
  NormalizeStyles, normalizeStyles,
  ValidateComponentProps, validateComponentProps,
  MergeProps, mergeProps,
  CreatePropsTransformer, createPropsTransformer,
  WrapCallbacksWithLogging, wrapCallbacksWithLogging,
  ExtractPropPaths, extractPropPaths,
  PropBuilderOptions
} from './prop-builder';

export {
  ComponentHierarchyRegistrar,
  RegisterComponentHierarchy, registerComponentHierarchy,
  ValidateComponentSpec, validateComponentSpec,
  FlattenComponentHierarchy, flattenComponentHierarchy,
  CountComponentsInHierarchy, countComponentsInHierarchy,
  HierarchyRegistrationResult,
  ComponentRegistrationError,
  HierarchyRegistrationOptions
} from './component-hierarchy';

export {
  ReactRootManager,
  reactRootManager,
  ManagedReactRoot
} from './react-root-manager';

export {
  RuntimeHook,
  RootHookContext
} from './runtime-hooks';