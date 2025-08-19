/**
 * @fileoverview Platform-agnostic React component compiler.
 * Compiles React component source code into executable components using Babel.
 * @module @memberjunction/react-runtime/compiler
 */

import { UserInfo } from '@memberjunction/core';
import { 
  CompileOptions, 
  CompiledComponent, 
  CompilationResult,
  CompilerConfig,
  ComponentError,
  RuntimeContext
} from '../types';
import { LibraryRegistry } from '../utilities/library-registry';

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

      // Load required libraries if specified
      const loadedLibraries = await this.loadRequiredLibraries(options.libraries!, options.contextUser);

      // Transpile the component code
      const transpiledCode = this.transpileComponent(
        options.componentCode,
        options.componentName,
        options
      );

      // Create the component factory with loaded libraries
      const componentFactory = this.createComponentFactory(
        transpiledCode,
        options.componentName,
        loadedLibraries
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

    const wrappedCode = this.wrapComponentCode(code, componentName, options.libraries);

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
   * @param libraries - Optional library dependencies
   * @returns Wrapped component code
   */
  private wrapComponentCode(componentCode: string, componentName: string, libraries?: any[]): string {
    // Generate library declarations if libraries are provided
    const libraryDeclarations = libraries && libraries.length > 0
      ? libraries
          .filter(lib => lib.globalVariable) // Only include libraries with globalVariable
          .map(lib => `const ${lib.globalVariable} = libraries['${lib.globalVariable}'];`)
          .join('\n        ')
      : '';

    return `
      function createComponent(
        React, ReactDOM, 
        useState, useEffect, useCallback, useMemo, useRef, useContext, useReducer, useLayoutEffect,
        libraries, styles, console
      ) {
        ${libraryDeclarations ? libraryDeclarations + '\n        ' : ''}${componentCode}
        
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
   * Load required libraries from the registry
   * @param libraries - Array of library dependencies
   * @param contextUser - Context user for accessing library registry
   * @returns Map of loaded libraries
   */
  private async loadRequiredLibraries(libraries: any[], contextUser: UserInfo): Promise<Map<string, any>> {
    const loadedLibraries = new Map<string, any>();
    
    console.log('🔍 loadRequiredLibraries called with:', {
      librariesCount: libraries?.length || 0,
      libraries: libraries?.map(l => ({ name: l.name, version: l.version, globalVariable: l.globalVariable })),
      hasContextUser: !!contextUser,
      contextUserEmail: contextUser?.Email
    });
    
    if (!libraries || libraries.length === 0) {
      console.log('📚 No libraries to load, returning empty map');
      return loadedLibraries;
    }

    // Only works in browser environment
    if (typeof window === 'undefined') {
      console.warn('Library loading is only supported in browser environments');
      return loadedLibraries;
    }

    // Initialize LibraryRegistry with contextUser if provided
    if (contextUser) {
      console.log('🔐 Initializing LibraryRegistry with contextUser:', contextUser.Email);
      await LibraryRegistry.Config(false, contextUser);
    } else {
      console.warn('⚠️ No contextUser provided for LibraryRegistry initialization');
    }

    const loadPromises = libraries.map(async (lib) => {
      console.log(`📦 Processing library: ${lib.name}`);
      
      // Check if library is approved
      const isApproved = LibraryRegistry.isApproved(lib.name);
      console.log(`  ✓ Approved check for ${lib.name}: ${isApproved}`);
      
      if (!isApproved) {
        console.error(`  ❌ Library '${lib.name}' is not approved`);
        throw new Error(`Library '${lib.name}' is not approved. Only approved libraries can be used.`);
      }

      // Get library definition for complete info
      const libraryDef = LibraryRegistry.getLibrary(lib.name);
      console.log(`  ✓ Library definition found for ${lib.name}: ${!!libraryDef}`);
      
      if (!libraryDef) {
        console.error(`  ❌ Library '${lib.name}' not found in registry`);
        throw new Error(`Library '${lib.name}' not found in registry`);
      }

      // Get CDN URL for the library
      const resolvedVersion = LibraryRegistry.resolveVersion(lib.name, lib.version);
      console.log(`  ✓ Resolved version for ${lib.name}: ${resolvedVersion}`);
      
      const cdnUrl = LibraryRegistry.getCdnUrl(lib.name, resolvedVersion);
      console.log(`  ✓ CDN URL for ${lib.name}: ${cdnUrl}`);
      
      if (!cdnUrl) {
        console.error(`  ❌ No CDN URL found for library '${lib.name}' version '${lib.version || 'default'}'`);
        throw new Error(`No CDN URL found for library '${lib.name}' version '${lib.version || 'default'}'`);
      }

      // Check if already loaded
      if ((window as any)[lib.globalVariable]) {
        console.log(`  ℹ️ Library ${lib.name} already loaded globally as ${lib.globalVariable}`);
        loadedLibraries.set(lib.globalVariable, (window as any)[lib.globalVariable]);
        return;
      }

      // Load CSS files if the library requires them
      const versionInfo = libraryDef.versions[resolvedVersion || libraryDef.defaultVersion];
      if (versionInfo?.cssUrls) {
        await this.loadStyles(versionInfo.cssUrls);
      }

      // Load the library dynamically (cdnUrl is guaranteed to be non-null here due to check above)
      console.log(`  📥 Loading script from CDN for ${lib.name}...`);
      await this.loadScript(cdnUrl!, lib.globalVariable);
      
      // Capture the library value from global scope
      // Note: Libraries loaded from CDN typically attach to window automatically
      // We capture them here to pass through the component's closure
      const libraryValue = (window as any)[lib.globalVariable];
      console.log(`  ✓ Library ${lib.name} loaded successfully, global variable ${lib.globalVariable} is:`, typeof libraryValue);
      
      if (libraryValue) {
        loadedLibraries.set(lib.globalVariable, libraryValue);
        console.log(`  ✅ Added ${lib.name} to loaded libraries map`);
      } else {
        console.error(`  ❌ Library '${lib.name}' failed to expose global variable '${lib.globalVariable}'`);
        throw new Error(`Library '${lib.name}' failed to load or did not expose '${lib.globalVariable}'`);
      }
    });

    await Promise.all(loadPromises);
    
    console.log(`✅ All libraries loaded successfully. Total: ${loadedLibraries.size}`);
    console.log('📚 Loaded libraries map:', Array.from(loadedLibraries.keys()));
    
    return loadedLibraries;
  }

  /**
   * Load CSS stylesheets dynamically
   * @param urls - Array of CSS URLs to load
   * @returns Promise that resolves when all stylesheets are loaded
   */
  private async loadStyles(urls: string[]): Promise<void> {
    const loadPromises = urls.map(url => {
      return new Promise<void>((resolve) => {
        // Check if stylesheet already exists
        const existingLink = document.querySelector(`link[href="${url}"]`);
        if (existingLink) {
          resolve();
          return;
        }

        // Create new link element
        const link = document.createElement('link');
        link.rel = 'stylesheet';
        link.href = url;
        
        // CSS load events are not reliable cross-browser, so resolve immediately
        // The CSS will load asynchronously but won't block component rendering
        document.head.appendChild(link);
        resolve();
      });
    });

    await Promise.all(loadPromises);
  }

  /**
   * Load a script dynamically
   * @param url - Script URL
   * @param globalName - Expected global variable name
   * @returns Promise that resolves when script is loaded
   */
  private loadScript(url: string, globalName: string): Promise<void> {
    return new Promise((resolve, reject) => {
      // Check if script already exists
      const existingScript = document.querySelector(`script[src="${url}"]`);
      if (existingScript) {
        // Wait for it to finish loading
        const checkLoaded = () => {
          if ((window as any)[globalName]) {
            resolve();
          } else {
            setTimeout(checkLoaded, 100);
          }
        };
        checkLoaded();
        return;
      }

      // Create new script element
      const script = document.createElement('script');
      script.src = url;
      script.async = true;
      
      script.onload = () => {
        // Give the library a moment to initialize
        setTimeout(() => {
          if ((window as any)[globalName]) {
            resolve();
          } else {
            reject(new Error(`${globalName} not found after loading script`));
          }
        }, 100);
      };
      
      script.onerror = () => {
        reject(new Error(`Failed to load script: ${url}`));
      };
      
      document.head.appendChild(script);
    });
  }

  /**
   * Creates a component factory function from transpiled code
   * @param transpiledCode - Transpiled JavaScript code
   * @param componentName - Name of the component
   * @param loadedLibraries - Map of loaded libraries
   * @returns Component factory function
   */
  private createComponentFactory(
    transpiledCode: string, 
    componentName: string,
    loadedLibraries: Map<string, any>
  ): Function {
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
        
        // Merge loaded libraries with context libraries
        const mergedLibraries = { ...libraries };
        loadedLibraries.forEach((value, key) => {
          mergedLibraries[key] = value;
        });

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
          mergedLibraries,
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
          mergedLibraries,
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
      if (firstKey)
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