/**
 * @fileoverview React error boundary creation utilities.
 * Provides platform-agnostic error boundary components for React applications.
 * @module @memberjunction/react-runtime/runtime
 */

import { ErrorBoundaryOptions, ComponentError } from '../types';

/**
 * Creates a React error boundary component class
 * @param React - React library instance
 * @param options - Error boundary options
 * @returns Error boundary component class
 */
export function CreateErrorBoundary(React: any, options: ErrorBoundaryOptions = {}): any {
  const {
    onError,
    fallback,
    logErrors = true,
    recovery = 'none'
  } = options;

  /**
   * Error boundary component class
   */
  return class ErrorBoundary extends React.Component {
    State: { hasError: boolean; error: Error | null; errorInfo: any; retryCount: number };

    /** @deprecated Use {@link State}. */
    get state(): { hasError: boolean; error: Error | null; errorInfo: any; retryCount: number } {
      return this.State;
    }
    /** @deprecated Use {@link State}. */
    set state(value: { hasError: boolean; error: Error | null; errorInfo: any; retryCount: number }) {
      this.State = value;
    }

    constructor(props: any) {
      super(props);
      this.State = {
        hasError: false,
        error: null,
        errorInfo: null,
        retryCount: 0
      };
    }

    // React reads this static into a local and calls it UNBOUND
    // (`var f = fiber.type.getDerivedStateFromError; f(error)`), so a stub that
    // forwards through `this` throws while handling the child's error and unmounts
    // the whole tree. The name has to stay on the real declaration.
    static getDerivedStateFromError(error: Error): any {
      // Update state to trigger fallback UI
      return { hasError: true, error };
    }

    componentDidCatch(error: Error, errorInfo: any) {
      // Log error if enabled
      if (logErrors) {
        console.error('React Error Boundary caught error:', error);
        console.error('Error Info:', errorInfo);
      }

      // Call custom error handler if provided
      if (onError) {
        try {
          onError(error, errorInfo);
        } catch (handlerError) {
          console.error('Error in custom error handler:', handlerError);
        }
      }

      // Update state with error details
      this.setState({ errorInfo });
    }

    HandleRetry = () => {
      this.setState((prevState: any) => ({
        hasError: false,
        error: null,
        errorInfo: null,
        retryCount: prevState.retryCount + 1
      }));
    };

    /** @deprecated Use {@link HandleRetry}. */
    get handleRetry() {
      return this.HandleRetry;
    }
    /** @deprecated Use {@link HandleRetry}. */
    set handleRetry(value) {
      this.HandleRetry = value;
    }

    HandleReset = () => {
      this.setState({
        hasError: false,
        error: null,
        errorInfo: null,
        retryCount: 0
      });
    };

    /** @deprecated Use {@link HandleReset}. */
    get handleReset() {
      return this.HandleReset;
    }
    /** @deprecated Use {@link HandleReset}. */
    set handleReset(value) {
      this.HandleReset = value;
    }

    render() {
      if (this.State.hasError) {
        // Use custom fallback if provided
        if (fallback) {
          if (typeof fallback === 'function') {
            return fallback({
              error: this.State.error,
              errorInfo: this.State.errorInfo,
              retry: this.HandleRetry,
              reset: this.HandleReset,
              retryCount: this.State.retryCount
            });
          }
          return fallback;
        }

        // Default error UI
        const showRetry = recovery === 'retry' && this.State.retryCount < 3;
        const showReset = recovery === 'reset';

        return React.createElement(
          'div',
          {
            style: {
              padding: '20px',
              backgroundColor: '#f8f8f8',
              border: '1px solid #ddd',
              borderRadius: '4px',
              margin: '10px'
            }
          },
          React.createElement('h2', { style: { color: '#d32f2f' } }, 'Component Error'),
          React.createElement(
            'p',
            { style: { color: '#666' } },
            'An error occurred while rendering this component.'
          ),
          this.State.error && React.createElement(
            'details',
            { style: { marginTop: '10px' } },
            React.createElement(
              'summary',
              { style: { cursor: 'pointer', color: '#333' } },
              'Error Details'
            ),
            React.createElement(
              'pre',
              {
                style: {
                  backgroundColor: '#f0f0f0',
                  padding: '10px',
                  marginTop: '10px',
                  overflow: 'auto',
                  fontSize: '12px'
                }
              },
              this.State.error.toString(),
              '\n\n',
              this.State.error.stack
            )
          ),
          (showRetry || showReset) && React.createElement(
            'div',
            { style: { marginTop: '10px' } },
            showRetry && React.createElement(
              'button',
              {
                onClick: this.HandleRetry,
                style: {
                  padding: '8px 16px',
                  marginRight: '10px',
                  backgroundColor: '#1976d2',
                  color: 'white',
                  border: 'none',
                  borderRadius: '4px',
                  cursor: 'pointer'
                }
              },
              `Retry (${3 - this.State.retryCount} attempts left)`
            ),
            showReset && React.createElement(
              'button',
              {
                onClick: this.HandleReset,
                style: {
                  padding: '8px 16px',
                  backgroundColor: '#757575',
                  color: 'white',
                  border: 'none',
                  borderRadius: '4px',
                  cursor: 'pointer'
                }
              },
              'Reset Component'
            )
          )
        );
      }

      return this.props.children;
    }
  };
}

/** @deprecated Use {@link CreateErrorBoundary}. */
export function createErrorBoundary(React: any, options: ErrorBoundaryOptions = {}): any {
  return CreateErrorBoundary(React, options);
}

/**
 * Creates a functional error boundary wrapper using React hooks
 * @param React - React library instance
 * @param Component - Component to wrap
 * @param options - Error boundary options
 * @returns Wrapped component with error boundary
 */
export function WithErrorBoundary(React: any, Component: any, options: ErrorBoundaryOptions = {}): any {
  const ErrorBoundaryComponent = CreateErrorBoundary(React, options);
  
  return (props: any) => {
    return React.createElement(
      ErrorBoundaryComponent,
      null,
      React.createElement(Component, props)
    );
  };
}

/** @deprecated Use {@link WithErrorBoundary}. */
export function withErrorBoundary(React: any, Component: any, options: ErrorBoundaryOptions = {}): any {
  return WithErrorBoundary(React, Component, options);
}

/**
 * Formats a component error for display or logging
 * @param error - Error to format
 * @param componentName - Name of the component where error occurred
 * @param phase - Phase when error occurred
 * @returns Formatted component error
 */
export function FormatComponentError(
  error: Error,
  componentName: string,
  phase: ComponentError['phase']
): ComponentError {
  return {
    message: error.message || 'Unknown error',
    stack: error.stack,
    componentName,
    phase,
    details: {
      name: error.name,
      timestamp: new Date().toISOString()
    }
  };
}

/** @deprecated Use {@link FormatComponentError}. */
export function formatComponentError(
  error: Error,
  componentName: string,
  phase: ComponentError['phase']
): ComponentError {
  return FormatComponentError(error, componentName, phase);
}

/**
 * Creates a simple error logger for error boundaries
 * @param componentName - Name of the component
 * @returns Error logging function
 */
export function CreateErrorLogger(componentName: string): (error: Error, errorInfo: any) => void {
  return (error: Error, errorInfo: any) => {
    console.group(`🚨 React Component Error: ${componentName}`);
    console.error('Error:', error);
    console.error('Component Stack:', errorInfo.componentStack);
    console.error('Props:', errorInfo.props);
    console.groupEnd();
  };
}

/** @deprecated Use {@link CreateErrorLogger}. */
export function createErrorLogger(componentName: string): (error: Error, errorInfo: any) => void {
  return CreateErrorLogger(componentName);
}