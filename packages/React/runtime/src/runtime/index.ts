/**
 * @fileoverview Runtime module exports
 * @module @memberjunction/react-runtime/runtime
 */

export {
  createErrorBoundary,
  withErrorBoundary,
  formatComponentError,
  createErrorLogger
} from './error-boundary';

export {
  wrapComponent,
  memoizeComponent,
  lazyComponent,
  injectProps,
  conditionalComponent,
  withErrorHandler,
  portalComponent,
  WrapperOptions
} from './component-wrapper';

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
} from './prop-builder';

export {
  ComponentHierarchyRegistrar,
  registerComponentHierarchy,
  validateComponentSpec,
  flattenComponentHierarchy,
  countComponentsInHierarchy,
  HierarchyRegistrationResult,
  ComponentRegistrationError,
  HierarchyRegistrationOptions
} from './component-hierarchy';

export {
  ReactRootManager,
  reactRootManager,
  ManagedReactRoot
} from './react-root-manager';