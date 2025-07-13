/**
 * @fileoverview React component wrapper utilities.
 * Provides HOCs and utilities for wrapping components with additional functionality.
 * @module @memberjunction/react-runtime/runtime
 */

import { ComponentProps, ComponentLifecycle } from '../types';

/**
 * Options for wrapping a component
 */
export interface WrapperOptions {
  /** Component display name */
  displayName?: string;
  /** Enable performance monitoring */
  enableProfiling?: boolean;
  /** Enable props logging */
  logProps?: boolean;
  /** Lifecycle hooks */
  lifecycle?: ComponentLifecycle;
  /** Default props */
  defaultProps?: Partial<ComponentProps>;
}

/**
 * Wraps a React component with additional functionality
 * @param React - React library instance
 * @param Component - Component to wrap
 * @param options - Wrapper options
 * @returns Wrapped component
 */
export function wrapComponent(React: any, Component: any, options: WrapperOptions = {}): any {
  const {
    displayName,
    enableProfiling = false,
    logProps = false,
    lifecycle = {},
    defaultProps = {}
  } = options;

  // Create wrapper component
  const WrappedComponent = React.forwardRef((props: any, ref: any) => {
    const mergedProps = { ...defaultProps, ...props };

    // Log props if enabled
    React.useEffect(() => {
      if (logProps) {
        console.log(`[${displayName || Component.name}] Props:`, mergedProps);
      }
    }, [mergedProps]);

    // Lifecycle: beforeMount
    React.useEffect(() => {
      if (lifecycle.beforeMount) {
        lifecycle.beforeMount();
      }

      // Lifecycle: afterMount
      if (lifecycle.afterMount) {
        lifecycle.afterMount();
      }

      // Lifecycle: beforeUnmount
      return () => {
        if (lifecycle.beforeUnmount) {
          lifecycle.beforeUnmount();
        }
      };
    }, []);

    // Lifecycle: beforeUpdate/afterUpdate
    const prevPropsRef = React.useRef(mergedProps);
    React.useEffect(() => {
      const prevProps = prevPropsRef.current;
      
      if (lifecycle.beforeUpdate) {
        lifecycle.beforeUpdate(prevProps, mergedProps);
      }

      // Schedule afterUpdate
      if (lifecycle.afterUpdate) {
        Promise.resolve().then(() => {
          lifecycle.afterUpdate!(prevProps, mergedProps);
        });
      }

      prevPropsRef.current = mergedProps;
    });

    // Render with profiling if enabled
    if (enableProfiling && React.Profiler) {
      return React.createElement(
        React.Profiler,
        {
          id: displayName || Component.name || 'WrappedComponent',
          onRender: (id: string, phase: string, actualDuration: number) => {
            console.log(`[Profiler] ${id} (${phase}): ${actualDuration.toFixed(2)}ms`);
          }
        },
        React.createElement(Component, { ...mergedProps, ref })
      );
    }

    return React.createElement(Component, { ...mergedProps, ref });
  });

  // Set display name
  WrappedComponent.displayName = displayName || `Wrapped(${Component.displayName || Component.name || 'Component'})`;

  return WrappedComponent;
}

/**
 * Creates a memoized version of a component
 * @param React - React library instance
 * @param Component - Component to memoize
 * @param propsAreEqual - Optional comparison function
 * @returns Memoized component
 */
export function memoizeComponent(
  React: any,
  Component: any,
  propsAreEqual?: (prevProps: any, nextProps: any) => boolean
): any {
  return React.memo(Component, propsAreEqual);
}

/**
 * Creates a lazy-loaded component
 * @param React - React library instance
 * @param loader - Function that returns a promise resolving to the component
 * @param fallback - Optional loading fallback
 * @returns Lazy component
 */
export function lazyComponent(
  React: any,
  loader: () => Promise<{ default: any }>,
  fallback?: any
): any {
  const LazyComponent = React.lazy(loader);

  if (fallback) {
    return (props: any) => React.createElement(
      React.Suspense,
      { fallback },
      React.createElement(LazyComponent, props)
    );
  }

  return LazyComponent;
}

/**
 * Injects additional props into a component
 * @param React - React library instance
 * @param Component - Component to inject props into
 * @param injectedProps - Props to inject
 * @returns Component with injected props
 */
export function injectProps(React: any, Component: any, injectedProps: any): any {
  return React.forwardRef((props: any, ref: any) => {
    const mergedProps = { ...injectedProps, ...props };
    return React.createElement(Component, { ...mergedProps, ref });
  });
}

/**
 * Creates a component that renders conditionally
 * @param React - React library instance
 * @param Component - Component to render conditionally
 * @param condition - Condition function or boolean
 * @param fallback - Optional fallback component
 * @returns Conditional component
 */
export function conditionalComponent(
  React: any,
  Component: any,
  condition: boolean | ((props: any) => boolean),
  fallback?: any
): any {
  return (props: any) => {
    const shouldRender = typeof condition === 'function' ? condition(props) : condition;
    
    if (shouldRender) {
      return React.createElement(Component, props);
    }
    
    return fallback || null;
  };
}

/**
 * Creates a component with default error handling
 * @param React - React library instance
 * @param Component - Component to wrap
 * @param errorHandler - Error handling function
 * @returns Component with error handling
 */
export function withErrorHandler(
  React: any,
  Component: any,
  errorHandler: (error: Error) => void
): any {
  return class extends React.Component {
    componentDidCatch(error: Error, errorInfo: any) {
      errorHandler(error);
    }

    render() {
      return React.createElement(Component, this.props);
    }
  };
}

/**
 * Creates a portal wrapper component
 * @param React - React library instance
 * @param ReactDOM - ReactDOM library instance
 * @param Component - Component to render in portal
 * @param container - DOM container element or selector
 * @returns Portal component
 */
export function portalComponent(
  React: any,
  ReactDOM: any,
  Component: any,
  container: Element | string
): any {
  return (props: any) => {
    const [mountNode, setMountNode] = React.useState(null as Element | null);

    React.useEffect(() => {
      const node = typeof container === 'string'
        ? document.querySelector(container)
        : container;
      
      setMountNode(node);
    }, []);

    if (!mountNode || !ReactDOM.createPortal) {
      return null;
    }

    return ReactDOM.createPortal(
      React.createElement(Component, props),
      mountNode
    );
  };
}