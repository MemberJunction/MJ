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
        const cached = this.getCachedComponent(options.componentName);
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
        this.cacheComponent(compiledComponent);
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
      function createComponent(React, ReactDOM, useState, useEffect, useCallback, createStateUpdater, libraries, styles, console) {
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
      // Create the factory function
      const factoryCreator = new Function(
        'React', 'ReactDOM', 'useState', 'useEffect', 'useCallback',
        'createStateUpdater', 'libraries', 'styles', 'console',
        `${transpiledCode}; return createComponent;`
      );

      // Return a function that executes the factory with runtime context
      return (context: RuntimeContext, styles: any = {}) => {
        const { React, ReactDOM, libraries = {} } = context;
        
        // Create state updater utility
        const createStateUpdater = this.createStateUpdaterUtility();

        // Execute the factory creator to get the createComponent function
        const createComponentFn = factoryCreator(
          React,
          ReactDOM,
          React.useState,
          React.useEffect,
          React.useCallback,
          createStateUpdater,
          libraries,
          styles,
          console
        );

        // Call createComponent to get the actual component
        return createComponentFn(
          React,
          ReactDOM,
          React.useState,
          React.useEffect,
          React.useCallback,
          createStateUpdater,
          libraries,
          styles,
          console
        );
      };
    } catch (error: any) {
      throw new Error(`Failed to create component factory: ${error.message}`);
    }
  }

  /**
   * Creates the state updater utility function for nested components
   * @returns State updater function
   */
  private createStateUpdaterUtility(): Function {
    return (statePath: string, parentStateUpdater: Function) => {
      return (componentStateUpdate: any) => {
        if (!statePath) {
          // Root component - pass through directly
          parentStateUpdater(componentStateUpdate);
        } else {
          // Sub-component - bubble up with path context
          const pathParts = statePath.split('.');
          const componentKey = pathParts[pathParts.length - 1];
          
          parentStateUpdater({
            [componentKey]: componentStateUpdate
          });
        }
      };
    };
  }

  /**
   * Validates compilation options
   * @param options - Options to validate
   * @throws Error if validation fails
   */
  private validateCompileOptions(options: CompileOptions): void {
    if (!options.componentName) {
      throw new Error('Component name is required');
    }

    if (!options.componentCode) {
      throw new Error('Component code is required');
    }

    if (typeof options.componentCode !== 'string') {
      throw new Error('Component code must be a string');
    }

    // Basic syntax check
    if (!options.componentCode.includes(options.componentName)) {
      throw new Error(`Component code must define a component named "${options.componentName}"`);
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
   * @returns Cached component or undefined
   */
  private getCachedComponent(componentName: string): CompiledComponent | undefined {
    // Simple cache lookup by name
    // In production, might want to include code hash for cache key
    for (const [key, component] of this.compilationCache) {
      if (component.name === componentName) {
        return component;
      }
    }
    return undefined;
  }

  /**
   * Caches a compiled component
   * @param component - Component to cache
   */
  private cacheComponent(component: CompiledComponent): void {
    // Enforce cache size limit
    if (this.compilationCache.size >= this.config.maxCacheSize) {
      // Remove oldest entry (first in map)
      const firstKey = this.compilationCache.keys().next().value;
      this.compilationCache.delete(firstKey);
    }

    this.compilationCache.set(component.id, component);
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