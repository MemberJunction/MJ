/**
 * @fileoverview Platform-agnostic React component compiler.
 * Compiles React component source code into executable components using Babel.
 * @module @memberjunction/react-runtime/compiler
 */

import { 
  CompileOptions, 
  CompiledComponent, 
  CompilationResult,
  CompilerConfig,
  ComponentError,
  RuntimeContext
} from '../types';

/**
 * Default compiler configuration
 */
const DEFAULT_COMPILER_CONFIG: CompilerConfig = {
  babel: {
    presets: ['react'],
    plugins: []
  },
  minify: false,
  sourceMaps: false,
  cache: true,
  maxCacheSize: 100
};

/**
 * Platform-agnostic React component compiler.
 * Transforms JSX/React component source code into executable JavaScript.
 */
export class ComponentCompiler {
  private config: CompilerConfig;
  private compilationCache: Map<string, CompiledComponent>;
  private cacheAccessOrder: string[]; // Track access order for LRU
  private babelInstance: any;

  /**
   * Creates a new ComponentCompiler instance
   * @param config - Optional compiler configuration
   */
  constructor(config?: Partial<CompilerConfig>) {
    this.config = { ...DEFAULT_COMPILER_CONFIG, ...config };
    this.compilationCache = new Map();
  }

  /**
   * Sets the Babel instance to use for compilation
   * @param babel - The Babel standalone instance
   */
  setBabelInstance(babel: any): void {
    this.babelInstance = babel;
  }

  /**
   * Compiles a React component from source code
   * @param options - Compilation options
   * @returns Promise resolving to compilation result
   */
  async compile(options: CompileOptions): Promise<CompilationResult> {
    const startTime = Date.now();

    try {
      // Check cache first if enabled
      if (this.config.cache) {
        const cached = this.getCachedComponent(options.componentName, options.componentCode);
        if (cached) {
          return {
            success: true,
            component: cached,
            duration: Date.now() - startTime
          };
        }
      }

      // Validate inputs
      this.validateCompileOptions(options);

      // Transpile the component code
      const transpiledCode = this.transpileComponent(
        options.componentCode,
        options.componentName,
        options
      );

      // Create the component factory
      const componentFactory = this.createComponentFactory(
        transpiledCode,
        options.componentName
      );

      // Build the compiled component
      const compiledComponent: CompiledComponent = {
        component: componentFactory,
        id: this.generateComponentId(options.componentName),
        name: options.componentName,
        compiledAt: new Date(),
        warnings: []
      };

      // Cache if enabled
      if (this.config.cache) {
        this.cacheComponent(compiledComponent, options.componentCode);
      }

      return {
        success: true,
        component: compiledComponent,
        duration: Date.now() - startTime,
        size: transpiledCode.length
      };

    } catch (error) {
      return {
        success: false,
        error: this.createCompilationError(error, options.componentName),
        duration: Date.now() - startTime
      };
    }
  }

  /**
   * Transpiles JSX/React code to JavaScript
   * @param code - Source code to transpile
   * @param componentName - Name of the component
   * @param options - Compilation options
   * @returns Transpiled JavaScript code
   */
  private transpileComponent(
    code: string,
    componentName: string,
    options: CompileOptions
  ): string {
    if (!this.babelInstance) {
      throw new Error('Babel instance not set. Call setBabelInstance() first.');
    }

    const wrappedCode = this.wrapComponentCode(code, componentName);

    try {
      const result = this.babelInstance.transform(wrappedCode, {
        presets: options.babelPresets || this.config.babel.presets,
        plugins: options.babelPlugins || this.config.babel.plugins,
        filename: `${componentName}.jsx`,
        sourceMaps: this.config.sourceMaps,
        minified: this.config.minify
      });

      return result.code;
    } catch (error: any) {
      throw new Error(`Transpilation failed: ${error.message}`);
    }
  }

  /**
   * Wraps component code in a factory function for execution
   * @param componentCode - Raw component code
   * @param componentName - Name of the component
   * @returns Wrapped component code
   */
  private wrapComponentCode(componentCode: string, componentName: string): string {
    return `
      function createComponent(
        React, ReactDOM, 
        useState, useEffect, useCallback, useMemo, useRef, useContext, useReducer, useLayoutEffect,
        libraries, styles, console
      ) {
        ${componentCode}
        
        // Ensure the component exists
        if (typeof ${componentName} === 'undefined') {
          throw new Error('Component "${componentName}" is not defined in the provided code');
        }
        
        // Return the component with utilities
        return {
          component: ${componentName},
          print: function() { 
            if (typeof window !== 'undefined' && window.print) {
              window.print(); 
            }
          },
          refresh: function(data) { 
            // Refresh functionality is handled by the host environment
          }
        };
      }
    `;
  }

  /**
   * Creates a component factory function from transpiled code
   * @param transpiledCode - Transpiled JavaScript code
   * @param componentName - Name of the component
   * @returns Component factory function
   */
  private createComponentFactory(transpiledCode: string, componentName: string): Function {
    try {
      // Create the factory function with all React hooks
      const factoryCreator = new Function(
        'React', 'ReactDOM',
        'useState', 'useEffect', 'useCallback', 'useMemo', 'useRef', 'useContext', 'useReducer', 'useLayoutEffect',
        'libraries', 'styles', 'console',
        `${transpiledCode}; return createComponent;`
      );

      // Return a function that executes the factory with runtime context
      return (context: RuntimeContext, styles: any = {}) => {
        const { React, ReactDOM, libraries = {} } = context;

        // Execute the factory creator to get the createComponent function
        const createComponentFn = factoryCreator(
          React,
          ReactDOM,
          React.useState,
          React.useEffect,
          React.useCallback,
          React.useMemo,
          React.useRef,
          React.useContext,
          React.useReducer,
          React.useLayoutEffect,
          libraries,
          styles,
          console
        );

        // Call createComponent to get the actual component
        const Component = createComponentFn(
          React,
          ReactDOM,
          React.useState,
          React.useEffect,
          React.useCallback,
          React.useMemo,
          React.useRef,
          React.useContext,
          React.useReducer,
          React.useLayoutEffect,
          libraries,
          styles,
          console
        );

        // Return the component directly
        return Component;
      };
    } catch (error: any) {
      throw new Error(`Failed to create component factory: ${error.message}`);
    }
  }


  /**
   * Validates compilation options
   * @param options - Options to validate
   * @throws Error if validation fails
   */
  private validateCompileOptions(options: CompileOptions): void {
    // Check if options object exists
    if (!options) {
      throw new Error(
        'Component compilation failed: No options provided.\n' +
        'Expected an object with componentName and componentCode properties.\n' +
        'Example: { componentName: "MyComponent", componentCode: "function MyComponent() { ... }" }'
      );
    }

    // Check component name
    if (!options.componentName) {
      const providedKeys = Object.keys(options).join(', ');
      throw new Error(
        'Component compilation failed: Component name is required.\n' +
        `Received options with keys: [${providedKeys}]\n` +
        'Please ensure your component spec includes a "name" property.\n' +
        'Example: { name: "MyComponent", code: "..." }'
      );
    }

    // Check component code
    if (!options.componentCode) {
      throw new Error(
        `Component compilation failed: Component code is required for "${options.componentName}".\n` +
        'Please ensure your component spec includes a "code" property with the component source code.\n' +
        'Example: { name: "MyComponent", code: "function MyComponent() { return <div>Hello</div>; }" }'
      );
    }

    // Check code type
    if (typeof options.componentCode !== 'string') {
      const actualType = typeof options.componentCode;
      throw new Error(
        `Component compilation failed: Component code must be a string for "${options.componentName}".\n` +
        `Received type: ${actualType}\n` +
        `Received value: ${JSON.stringify(options.componentCode).substring(0, 100)}...\n` +
        'Please ensure the code property contains a string of JavaScript/JSX code.'
      );
    }

    // Check if code is empty or whitespace only
    if (options.componentCode.trim().length === 0) {
      throw new Error(
        `Component compilation failed: Component code is empty for "${options.componentName}".\n` +
        'The code property must contain valid JavaScript/JSX code defining a React component.'
      );
    }

    // Basic syntax check
    if (!options.componentCode.includes(options.componentName)) {
      throw new Error(
        `Component compilation failed: Component code must define a component named "${options.componentName}".\n` +
        'The function/component name in the code must match the componentName property.\n' +
        `Expected to find: function ${options.componentName}(...) or const ${options.componentName} = ...\n` +
        'Code preview: ' + options.componentCode.substring(0, 200) + '...'
      );
    }
  }

  /**
   * Generates a unique component ID
   * @param componentName - Name of the component
   * @returns Unique component ID
   */
  private generateComponentId(componentName: string): string {
    return `${componentName}_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }

  /**
   * Gets a cached component if available
   * @param componentName - Name of the component
   * @param code - Component source code
   * @returns Cached component or undefined
   */
  private getCachedComponent(componentName: string, code: string): CompiledComponent | undefined {
    // Create cache key based on name AND content hash
    const cacheKey = this.createCacheKey(componentName, code);
    return this.compilationCache.get(cacheKey);
  }

  /**
   * Creates a cache key based on component name and code content
   * @param componentName - Name of the component
   * @param code - Component source code
   * @returns Cache key
   */
  private createCacheKey(componentName: string, code: string): string {
    // Simple hash function for code content
    let hash = 0;
    for (let i = 0; i < code.length; i++) {
      const char = code.charCodeAt(i);
      hash = ((hash << 5) - hash) + char;
      hash = hash & hash; // Convert to 32-bit integer
    }
    return `${componentName}_${hash.toString(36)}`;
  }

  /**
   * Caches a compiled component
   * @param component - Component to cache
   * @param code - Original source code
   */
  private cacheComponent(component: CompiledComponent, code: string): void {
    // Enforce cache size limit
    if (this.compilationCache.size >= this.config.maxCacheSize) {
      // Remove oldest entry (first in map)
      const firstKey = this.compilationCache.keys().next().value;
      this.compilationCache.delete(firstKey);
    }

    const cacheKey = this.createCacheKey(component.name, code);
    this.compilationCache.set(cacheKey, component);
  }

  /**
   * Creates a standardized compilation error
   * @param error - Original error
   * @param componentName - Name of the component
   * @returns Formatted component error
   */
  private createCompilationError(error: any, componentName: string): ComponentError {
    return {
      message: error.message || 'Unknown compilation error',
      stack: error.stack,
      componentName,
      phase: 'compilation',
      details: error
    };
  }

  /**
   * Clears the compilation cache
   */
  clearCache(): void {
    this.compilationCache.clear();
  }

  /**
   * Gets current cache size
   * @returns Number of cached components
   */
  getCacheSize(): number {
    return this.compilationCache.size;
  }

  /**
   * Updates compiler configuration
   * @param config - New configuration options
   */
  updateConfig(config: Partial<CompilerConfig>): void {
    this.config = { ...this.config, ...config };
  }
}