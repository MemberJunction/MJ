/**
 * @fileoverview Component error analysis utilities
 * Provides methods to analyze component errors and identify failed components
 * @module @memberjunction/react-runtime/utilities
 */

/**
 * Information about a failed component
 */
export interface FailedComponentInfo {
  /** Component name that failed */
  componentName: string;
  /** Error type (e.g., 'not_defined', 'render_error', 'property_error') */
  errorType: string;
  /** Original error message */
  errorMessage: string;
  /** Line number if available */
  lineNumber?: number;
  /** Additional context */
  context?: string;
}

/**
 * Analyzes component errors to provide detailed failure information
 */
export class ComponentErrorAnalyzer {
  /**
   * Common error patterns for component failures
   */
  private static readonly ERROR_PATTERNS = [
    {
      // Component is not defined
      pattern: /ReferenceError: (\w+) is not defined/,
      errorType: 'not_defined',
      extractComponent: (match: RegExpMatchArray) => match[1]
    },
    {
      // Cannot read property of undefined (component reference)
      pattern: /Cannot read propert(?:y|ies) '(\w+)' of undefined/,
      errorType: 'property_error',
      extractComponent: (match: RegExpMatchArray) => match[1]
    },
    {
      // Component render errors
      pattern: /(\w+)\(\.\.\.\): Nothing was returned from render/,
      errorType: 'render_error',
      extractComponent: (match: RegExpMatchArray) => match[1]
    },
    {
      // Component in stack trace
      pattern: /at (\w+Component\w*)/,
      errorType: 'stack_trace',
      extractComponent: (match: RegExpMatchArray) => match[1]
    },
    {
      // React component errors
      pattern: /Error: Unable to find node on an unmounted component/,
      errorType: 'unmounted_component',
      extractComponent: () => null // Need to look at stack trace
    },
    {
      // Hook errors
      pattern: /Invalid hook call.*component (\w+)/,
      errorType: 'invalid_hook',
      extractComponent: (match: RegExpMatchArray) => match[1]
    },
    {
      // Type errors in components
      pattern: /TypeError:.*in (\w+) \(at/,
      errorType: 'type_error',
      extractComponent: (match: RegExpMatchArray) => match[1]
    },
    {
      // Missing imports/components
      pattern: /Module not found: Error: Can't resolve '\.\/(\w+)'/,
      errorType: 'missing_import',
      extractComponent: (match: RegExpMatchArray) => match[1]
    },
    {
      // Component is not a function
      pattern: /(\w+) is not a function/,
      errorType: 'not_a_function',
      extractComponent: (match: RegExpMatchArray) => match[1]
    },
    {
      // Minified React error with component hint
      pattern: /Minified React error.*Visit.*for the full message.*component[: ](\w+)/s,
      errorType: 'react_error',
      extractComponent: (match: RegExpMatchArray) => match[1]
    }
  ];

  /**
   * Analyzes error messages to identify which components failed
   * @param errors Array of error messages
   * @returns Array of failed component names
   */
  static identifyFailedComponents(errors: string[]): string[] {
    const failedComponents = new Set<string>();
    
    for (const error of errors) {
      const components = this.extractComponentsFromError(error);
      components.forEach(comp => failedComponents.add(comp));
    }
    
    return Array.from(failedComponents);
  }

  /**
   * Analyzes errors and returns detailed information about failures
   * @param errors Array of error messages
   * @returns Array of detailed failure information
   */
  static analyzeComponentErrors(errors: string[]): FailedComponentInfo[] {
    const failures: FailedComponentInfo[] = [];
    
    for (const error of errors) {
      const failureInfo = this.analyzeError(error);
      failures.push(...failureInfo);
    }
    
    // Remove duplicates based on component name and error type
    const uniqueFailures = new Map<string, FailedComponentInfo>();
    failures.forEach(failure => {
      const key = `${failure.componentName}-${failure.errorType}`;
      if (!uniqueFailures.has(key)) {
        uniqueFailures.set(key, failure);
      }
    });
    
    return Array.from(uniqueFailures.values());
  }

  /**
   * Extract component names from a single error message
   */
  private static extractComponentsFromError(error: string): string[] {
    const components: string[] = [];
    
    for (const errorPattern of this.ERROR_PATTERNS) {
      const match = error.match(errorPattern.pattern);
      if (match) {
        const componentName = errorPattern.extractComponent(match);
        if (componentName && this.isLikelyComponentName(componentName)) {
          components.push(componentName);
        }
      }
    }
    
    // Also check for components in stack traces
    const stackComponents = this.extractComponentsFromStackTrace(error);
    components.push(...stackComponents);
    
    return components;
  }

  /**
   * Analyze a single error and return detailed information
   */
  private static analyzeError(error: string): FailedComponentInfo[] {
    const failures: FailedComponentInfo[] = [];
    
    for (const errorPattern of this.ERROR_PATTERNS) {
      const match = error.match(errorPattern.pattern);
      if (match) {
        const componentName = errorPattern.extractComponent(match);
        if (componentName && this.isLikelyComponentName(componentName)) {
          failures.push({
            componentName,
            errorType: errorPattern.errorType,
            errorMessage: error,
            lineNumber: this.extractLineNumber(error),
            context: this.extractContext(error)
          });
        }
      }
    }
    
    // If no specific pattern matched, try to extract from stack trace
    if (failures.length === 0) {
      const stackComponents = this.extractComponentsFromStackTrace(error);
      stackComponents.forEach(componentName => {
        failures.push({
          componentName,
          errorType: 'unknown',
          errorMessage: error,
          lineNumber: this.extractLineNumber(error)
        });
      });
    }
    
    return failures;
  }

  /**
   * Extract component names from stack trace
   */
  private static extractComponentsFromStackTrace(error: string): string[] {
    const components: string[] = [];
    
    // Look for React component patterns in stack traces
    const stackPatterns = [
      /at (\w+Component\w*)/g,
      /at (\w+)\s*\(/g,
      /in (\w+)\s*\(at/g,
      /in (\w+)\s*\(created by/g
    ];
    
    for (const pattern of stackPatterns) {
      let match;
      while ((match = pattern.exec(error)) !== null) {
        const name = match[1];
        if (this.isLikelyComponentName(name)) {
          components.push(name);
        }
      }
    }
    
    return [...new Set(components)]; // Remove duplicates
  }

  /**
   * Check if a string is likely to be a React component name
   */
  private static isLikelyComponentName(name: string): boolean {
    // Component names typically:
    // - Start with uppercase letter
    // - Are not JavaScript built-ins
    // - Are not common non-component names
    
    const jsBuiltins = new Set([
      'Object', 'Array', 'String', 'Number', 'Boolean', 'Function',
      'Promise', 'Error', 'TypeError', 'ReferenceError', 'SyntaxError',
      'undefined', 'null', 'console', 'window', 'document'
    ]);
    
    const nonComponents = new Set([
      'render', 'setState', 'forceUpdate', 'props', 'state', 'context',
      'componentDidMount', 'componentWillUnmount', 'useEffect', 'useState'
    ]);
    
    return (
      name.length > 0 &&
      /^[A-Z]/.test(name) && // Starts with uppercase
      !jsBuiltins.has(name) &&
      !nonComponents.has(name) &&
      !/^use[A-Z]/.test(name) // Not a hook
    );
  }

  /**
   * Extract line number from error message
   */
  private static extractLineNumber(error: string): number | undefined {
    // Look for patterns like ":12:34" or "line 12"
    const patterns = [
      /:(\d+):\d+/,
      /line (\d+)/i,
      /Line (\d+)/
    ];
    
    for (const pattern of patterns) {
      const match = error.match(pattern);
      if (match) {
        return parseInt(match[1], 10);
      }
    }
    
    return undefined;
  }

  /**
   * Extract additional context from error
   */
  private static extractContext(error: string): string | undefined {
    // Extract file names or additional context
    const fileMatch = error.match(/\(at ([^)]+)\)/);
    if (fileMatch) {
      return fileMatch[1];
    }
    
    // Extract "created by" information
    const createdByMatch = error.match(/created by (\w+)/);
    if (createdByMatch) {
      return `Created by ${createdByMatch[1]}`;
    }
    
    return undefined;
  }

  /**
   * Format error analysis results for logging
   */
  static formatAnalysisResults(failures: FailedComponentInfo[]): string {
    if (failures.length === 0) {
      return 'No component failures detected';
    }
    
    let result = `Detected ${failures.length} component failure(s):\n`;
    
    failures.forEach((failure, index) => {
      result += `\n${index + 1}. Component: ${failure.componentName}\n`;
      result += `   Error Type: ${failure.errorType}\n`;
      if (failure.lineNumber) {
        result += `   Line: ${failure.lineNumber}\n`;
      }
      if (failure.context) {
        result += `   Context: ${failure.context}\n`;
      }
      result += `   Message: ${failure.errorMessage.substring(0, 200)}${failure.errorMessage.length > 200 ? '...' : ''}\n`;
    });
    
    return result;
  }
}