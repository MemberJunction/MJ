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
import { ComponentStyles, ComponentObject } from '@memberjunction/interactive-component-types';
import { LibraryRegistry } from '../utilities/library-registry';
import { LibraryLoader } from '../utilities/library-loader';
import { unwrapLibraryComponent, unwrapLibraryComponents, unwrapAllLibraryComponents } from '../utilities/component-unwrapper';
import { MJComponentLibraryEntity } from '@memberjunction/core-entities';

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
  maxCacheSize: 100,
  debug: false
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
      const loadedLibraries = await this.loadRequiredLibraries(options.libraries!, options.allLibraries);

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
        loadedLibraries,
        options
      );

      // Build the compiled component
      const compiledComponent: CompiledComponent = {
        factory: componentFactory,
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
        size: transpiledCode.length,
        loadedLibraries: loadedLibraries
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

    const wrappedCode = this.wrapComponentCode(code, componentName, options.libraries, options.dependencies);

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
   * @param dependencies - Optional child component dependencies
   * @returns Wrapped component code
   */
  // Core libraries that are passed as parameters to createComponent and should not be destructured
  private readonly CORE_LIBRARIES = new Set(['React', 'ReactDOM']);

  private wrapComponentCode(componentCode: string, componentName: string, libraries?: any[], dependencies?: Array<{ name: string }>): string {
    const debug = this.config.debug;
    // Generate library declarations if libraries are provided
    // Skip core libraries as they're passed as parameters to createComponent
    const libraryDeclarations = libraries && libraries.length > 0
      ? libraries
          .filter(lib => lib.globalVariable && !this.CORE_LIBRARIES.has(lib.globalVariable)) // Skip core libraries
          .map(lib => `const ${lib.globalVariable} = libraries['${lib.globalVariable}'];`)
          .join('\n        ')
      : '';
    const libraryLogChecks = libraries && libraries.length > 0  
      ? libraries
          .filter(lib => lib.globalVariable && !this.CORE_LIBRARIES.has(lib.globalVariable)) // Skip core libraries
          .map(lib => `\nif (!${lib.globalVariable}) { console.error('[React-Runtime-JS] Library "${lib.globalVariable}" is not defined'); } else { ${debug ? `console.log('[React-Runtime-JS] Library "${lib.globalVariable}" is defined');` : ''} }`)
          .join('\n        ')
      : '';

    // Generate component declarations if dependencies are provided
    // Filter out the component being compiled to avoid naming conflicts
    // Also detect and warn about duplicates
    const seenDependencies = new Set<string>();
    const uniqueDependencies: Array<{ name: string; code?: string }> = [];
    const duplicates: string[] = [];
    
    if (dependencies && dependencies.length > 0) {
      for (const dep of dependencies) {
        if (dep.name === componentName) {
          // Skip the component being compiled itself
          continue;
        }
        if (seenDependencies.has(dep.name)) {
          duplicates.push(dep.name);
        } else {
          seenDependencies.add(dep.name);
          uniqueDependencies.push(dep);
        }
      }
    }
    
    // Generate warning for duplicates
    const duplicateWarnings = duplicates.length > 0
      ? duplicates
          .map(name => `console.warn('[React-Runtime-JS] WARNING: Component "${name}" is registered multiple times as a dependency. Using first occurrence only.');`)
          .join('\n        ')
      : '';
    
    const componentDeclarations = uniqueDependencies.length > 0
      ? uniqueDependencies
          .map(dep => `const ${dep.name}Raw = componentsOuter['${dep.name}'];
        ${debug ? `console.log('[React-Runtime-JS] Extracting ${dep.name}:');
        console.log('  - Raw value type:', typeof ${dep.name}Raw);
        console.log('  - Raw value:', ${dep.name}Raw);
        if (${dep.name}Raw && typeof ${dep.name}Raw === 'object') {
          console.log('  - Has .component property:', 'component' in ${dep.name}Raw);
          console.log('  - .component type:', typeof ${dep.name}Raw.component);
        }` : ''}
        const ${dep.name} = ${dep.name}Raw?.component || ${dep.name}Raw;
        ${debug ? `console.log('  - Final ${dep.name} type:', typeof ${dep.name});
        console.log('  - Final ${dep.name} is function:', typeof ${dep.name} === 'function');` : ''}`)
          .join('\n        ')
      : '';
    
    const componentLogChecks = uniqueDependencies.length > 0
      ? uniqueDependencies
          .map(dep => `if (!${dep.name}) { console.error('[React-Runtime-JS] Dependency "${dep.name}" is not defined'); } else { ${debug ? `console.log('[React-Runtime-JS] Dependency "${dep.name}" is defined');` : ''} }`)
          .join('\n        ')
      : '';
 

    const wrappedCode = `
      function createComponent(
        React, ReactDOM, 
        useState, useEffect, useCallback, useMemo, useRef, useContext, useReducer, useLayoutEffect,
        libraries, styles, console, components,
        unwrapLibraryComponent, unwrapLibraryComponents, unwrapAllLibraryComponents
      ) {
        if (!React)
            console.log('[React-Runtime-JS] React is not defined');
        if (!ReactDOM)
            console.log('[React-Runtime-JS] ReactDOM is not defined');

        // Make unwrap functions available with legacy names for backward compatibility
        const unwrapComponent = unwrapLibraryComponent;
        const unwrapComponents = unwrapLibraryComponents;
        const unwrapAllComponents = unwrapAllLibraryComponents;
        
        // Code for ${componentName}
        ${componentCode}
        
        // Ensure the component exists
        if (typeof ${componentName} === 'undefined') {
          throw new Error('Component "${componentName}" is not defined in the provided code');
        }
        else {
          ${debug ? `console.log('[React-Runtime-JS] Component "${componentName}" is defined');` : ''}
        }
        
        // Store the component in a variable so we don't lose it
        const UserComponent = ${componentName};

        // Check if the component is already a ComponentObject (has a .component property)
        // If so, extract the actual React component
        const ActualComponent = (typeof UserComponent === 'object' && UserComponent !== null && 'component' in UserComponent)
          ? UserComponent.component
          : UserComponent;
        
        // Debug logging to understand what we're getting
        ${debug ? `
        console.log('[React-Runtime-JS]Component ${componentName} type:', typeof UserComponent);
        if (typeof UserComponent === 'object' && UserComponent !== null) {
          console.log('[React-Runtime-JS]Component ${componentName} keys:', Object.keys(UserComponent));
          console.log('[React-Runtime-JS]Component ${componentName} has .component:', 'component' in UserComponent);
          if ('component' in UserComponent) {
            console.log('[React-Runtime-JS]Component ${componentName}.component type:', typeof UserComponent.component);
          }
        }` : ''}
        
        // Validate that we have a function (React component)
        if (typeof ActualComponent !== 'function') {
          console.error('[React-Runtime-JS] Invalid component type for ${componentName}:', typeof ActualComponent);
          console.error('[React-Runtime-JS] ActualComponent value:', ActualComponent);
          console.error('[React-Runtime-JS] Original UserComponent value:', UserComponent);
          throw new Error('[React-Runtime-JS] Component "${componentName}" must be a function (React component) or an object with a .component property that is a function. Got: ' + typeof ActualComponent);
        }

        let componentsOuter = null, utilitiesOuter = null;
        const DestructureWrapperUserComponent = (props) => {
          if (!componentsOuter) {
            componentsOuter = props?.components || components;
          }
          if (!utilitiesOuter) {
            utilitiesOuter = props?.utilities;
          }
          ${debug ? `
          console.log('[React-Runtime-JS] DestructureWrapperUserComponent for ${componentName}:');
          console.log('  - Props:', props);
          console.log('  - componentsOuter type:', typeof componentsOuter);
          console.log('  - componentsOuter:', componentsOuter);
          if (componentsOuter && typeof componentsOuter === 'object') {
            console.log('  - componentsOuter keys:', Object.keys(componentsOuter));
            for (const key of Object.keys(componentsOuter)) {
              const comp = componentsOuter[key];
              console.log(\`  - componentsOuter[\${key}] type:\`, typeof comp);
              if (comp && typeof comp === 'object') {
                console.log(\`    - Has .component: \${'component' in comp}\`);
                console.log(\`    - .component type: \${typeof comp.component}\`);
              }
            }
          }
          console.log('  - styles:', styles);
          console.log('  - utilities:', utilitiesOuter);
          console.log('  - libraries:', libraries);` : ''}
          ${duplicateWarnings ? '// Duplicate dependency warnings\n        ' + duplicateWarnings + '\n        ' : ''}
          ${libraryDeclarations ? '// Destructure Libraries\n' + libraryDeclarations + '\n        ' : ''}
          ${componentDeclarations ? '// Destructure Dependencies\n' + componentDeclarations + '\n        ' : ''}
          ${libraryLogChecks}
          ${componentLogChecks}          

          const newProps = {
            ...props,
            components: componentsOuter,
            utilities: utilitiesOuter 
          }
          return ActualComponent(newProps);
        };
        
        // Create a fresh method registry for each factory call
        const methodRegistry = new Map();
        
        // Create a wrapper component that provides RegisterMethod in callbacks
        const ComponentWithMethodRegistry = (props) => {
          // Register methods on mount
          React.useEffect(() => {
            // Clear previous methods
            methodRegistry.clear();
            
            // Provide RegisterMethod callback if callbacks exist
            if (props.callbacks && typeof props.callbacks.RegisterMethod === 'function') {
              // Component can now register its methods
              // This will be called from within the component
            }
          }, [props.callbacks]);
          
          // Create enhanced callbacks with RegisterMethod
          const enhancedCallbacks = React.useMemo(() => {
            if (!props.callbacks) return {};
            
            return {
              ...props.callbacks,
              RegisterMethod: (methodName, handler) => {
                if (methodName && handler) {
                  methodRegistry.set(methodName, handler);
                }
              }
            };
          }, [props.callbacks]);
          
          // Render the original component with enhanced callbacks
          return React.createElement(DestructureWrapperUserComponent, {
            ...props,
            callbacks: enhancedCallbacks
          });
        };
        
        ComponentWithMethodRegistry.displayName = '${componentName}WithMethods';
        
        // Return the component object with method access
        return {
          component: ComponentWithMethodRegistry,
          
          print: function() { 
            const printMethod = methodRegistry.get('print');
            if (printMethod) {
              printMethod();
            } else if (typeof window !== 'undefined' && window.print) {
              window.print(); 
            }
          },
          refresh: function(data) { 
            const refreshMethod = methodRegistry.get('refresh');
            if (refreshMethod) {
              refreshMethod(data);
            }
            // Refresh functionality is handled by the host environment
          },
          
          // Standard method accessors with type safety
          getCurrentDataState: function() {
            const method = methodRegistry.get('getCurrentDataState');
            return method ? method() : undefined;
          },
          getDataStateHistory: function() {
            const method = methodRegistry.get('getDataStateHistory');
            return method ? method() : [];
          },
          validate: function() {
            const method = methodRegistry.get('validate');
            return method ? method() : true;
          },
          isDirty: function() {
            const method = methodRegistry.get('isDirty');
            return method ? method() : false;
          },
          reset: function() {
            const method = methodRegistry.get('reset');
            if (method) method();
          },
          scrollTo: function(target) {
            const method = methodRegistry.get('scrollTo');
            if (method) method(target);
          },
          focus: function(target) {
            const method = methodRegistry.get('focus');
            if (method) method(target);
          },
          
          // Generic method invoker for custom methods
          invokeMethod: function(methodName, ...args) {
            const method = methodRegistry.get(methodName);
            if (method) {
              return method(...args);
            }
            console.warn(\`[React-Runtime-JS] Method '\${methodName}' is not registered on component ${componentName}\`);
            return undefined;
          },
          
          // Check if a method exists
          hasMethod: function(methodName) {
            return methodRegistry.has(methodName);
          }
        };
      }
    `;

    return wrappedCode;
  }

  /**
   * Load required libraries from the registry with dependency resolution
   * @param libraries - Array of library dependencies
   * @param componentLibraries - All available component libraries for dependency resolution
   * @returns Map of loaded libraries
   */
  private async loadRequiredLibraries(libraries: any[], componentLibraries: MJComponentLibraryEntity[]): Promise<Map<string, any>> {
    const loadedLibraries = new Map<string, any>();
    
    if (this.config.debug) {
      console.log('🔍 loadRequiredLibraries called with:', {
        librariesCount: libraries?.length || 0,
        libraries: libraries?.map(l => ({ name: l.name, version: l.version, globalVariable: l.globalVariable }))
      });
    }
    
    if (!libraries || libraries.length === 0) {
      if (this.config.debug) {
        console.log('📚 No libraries to load, returning empty map');
      }
      return loadedLibraries;
    }

    // Only works in browser environment
    if (typeof window === 'undefined') {
      console.warn('Library loading is only supported in browser environments');
      return loadedLibraries;
    }

    // Initialize LibraryRegistry with componentLibraries if provided
    if (componentLibraries) {
      await LibraryRegistry.Config(false, componentLibraries);
    } else {
      console.warn('⚠️ No componentLibraries provided for LibraryRegistry initialization');
    }

    // Filter out React, ReactDOM, and invalid library entries
    const filteredLibraries = libraries.filter(lib => {
      // Check if library object is valid
      if (!lib || typeof lib !== 'object' || !lib.name) {
        console.warn(`⚠️ Invalid library entry detected (missing name):`, lib);
        return false;
      }
      
      // Filter out entries with 'unknown' name or missing globalVariable
      if (lib.name === 'unknown' || lib.name === 'null' || lib.name === 'undefined') {
        console.warn(`⚠️ Filtering out invalid library with name '${lib.name}':`, lib);
        return false;
      }
      
      // Check for missing or invalid globalVariable
      if (!lib.globalVariable || lib.globalVariable === 'undefined' || lib.globalVariable === 'null') {
        console.warn(`⚠️ Filtering out library '${lib.name}' with invalid globalVariable:`, lib.globalVariable);
        return false;
      }
      
      const libNameLower = lib.name.toLowerCase();
      if (libNameLower === 'react' || libNameLower === 'reactdom') {
        console.warn(`⚠️ Library '${lib.name}' is automatically loaded by the React runtime and should not be requested separately`);
        return false;
      }
      return true;
    });
    
    // Extract library names from the filtered libraries (with extra safety)
    const libraryNames = filteredLibraries
      .map(lib => lib.name)
      .filter(name => name && typeof name === 'string');
    
    if (this.config.debug) {
      console.log('📦 Using dependency-aware loading for libraries:', libraryNames);
    }
    
    // If all libraries were filtered out, return empty map
    if (filteredLibraries.length === 0) {
      if (this.config.debug) {
        console.log('📚 All requested libraries were filtered out (React/ReactDOM), returning empty map');
      }
      return loadedLibraries;
    }

    try {
      // Use the new dependency-aware loading
      const loadedLibraryMap = await LibraryLoader.loadLibrariesWithDependencies(
        libraryNames,
        componentLibraries,
        'component-compiler',
        { debug: this.config.debug }
      );

      // Map the results to match the expected format
      // We need to map from library name to global variable
      for (const lib of filteredLibraries) {
        // Check if library is approved first
        const isApproved = LibraryRegistry.isApproved(lib.name);
        if (!isApproved) {
          console.error(`❌ Library '${lib.name}' is not approved`);
          throw new Error(`Library '${lib.name}' is not approved. Only approved libraries can be used.`);
        }

        // Get the loaded library from the map
        const loadedValue = loadedLibraryMap.get(lib.name);
        
        if (loadedValue) {
          // Store by global variable name for component access
          loadedLibraries.set(lib.globalVariable, loadedValue);
          if (this.config.debug) {
            console.log(`✅ Mapped ${lib.name} to global variable ${lib.globalVariable}`);
          }
        } else {
          // Fallback: check if it's already globally available (might be a dependency)
          const globalValue = (window as any)[lib.globalVariable];
          if (globalValue) {
            loadedLibraries.set(lib.globalVariable, globalValue);
            if (this.config.debug) {
              console.log(`✅ Found ${lib.name} already loaded as ${lib.globalVariable}`);
            }
          } else {
            console.error(`❌ Library '${lib.name}' failed to load`);
            throw new Error(`Library '${lib.name}' failed to load or did not expose '${lib.globalVariable}'`);
          }
        }
      }
    } catch (error: any) {
      console.error('Failed to load libraries with dependencies:', error);
      
      // Fallback to old loading method if dependency resolution fails
      if (this.config.debug) {
        console.warn('⚠️ Falling back to non-dependency-aware loading due to error');
      }
      
      // Load each library independently (old method)
      for (const lib of libraries) {
        if ((window as any)[lib.globalVariable]) {
          loadedLibraries.set(lib.globalVariable, (window as any)[lib.globalVariable]);
        } else {
          // Try to load using LibraryRegistry
          const libraryDef = LibraryRegistry.getLibrary(lib.name);
          if (libraryDef) {
            const resolvedVersion = LibraryRegistry.resolveVersion(lib.name, lib.version);
            const cdnUrl = LibraryRegistry.getCdnUrl(lib.name, resolvedVersion);
            
            if (cdnUrl) {
              await this.loadScript(cdnUrl, lib.globalVariable);
              const libraryValue = (window as any)[lib.globalVariable];
              if (libraryValue) {
                loadedLibraries.set(lib.globalVariable, libraryValue);
              }
            }
          }
        }
      }
    }
    
    if (this.config.debug) {
      console.log(`✅ All libraries loaded successfully. Total: ${loadedLibraries.size}`);
      console.log('📚 Loaded libraries map:', Array.from(loadedLibraries.keys()));
    }
    
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
        // Wait for it to finish loading with exponential backoff
        let attempts = 0;
        const maxAttempts = 50; // 5 seconds total with 100ms intervals
        const checkLoaded = () => {
          if ((window as any)[globalName]) {
            resolve();
          } else if (attempts >= maxAttempts) {
            reject(new Error(`${globalName} not found after ${maxAttempts * 100}ms waiting for existing script`));
          } else {
            attempts++;
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
        // More robust checking with multiple attempts
        let attempts = 0;
        const maxAttempts = 20; // 2 seconds total
        const checkInterval = 100; // Check every 100ms
        
        const checkGlobal = () => {
          if ((window as any)[globalName]) {
            if (this.config.debug) {
              console.log(`  ✓ Global variable ${globalName} found after ${attempts * checkInterval}ms`);
            }
            resolve();
          } else if (attempts >= maxAttempts) {
            // Final check - some libraries might use a different global name pattern
            if (this.config.debug) {
              console.error(`  ❌ ${globalName} not found after ${attempts * checkInterval}ms`);
              // Only log matching property names, not the entire window object
              const matchingKeys = Object.keys(window).filter(k => k.toLowerCase().includes(globalName.toLowerCase()));
              console.log(`  ℹ️ Matching window properties: ${matchingKeys.join(', ') || 'none'}`);
            }
            reject(new Error(`${globalName} not found after loading script from ${url}`));
          } else {
            attempts++;
            setTimeout(checkGlobal, checkInterval);
          }
        };
        
        // Start checking immediately (don't wait 100ms first)
        checkGlobal();
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
   * @param options - Compile options containing spec and other metadata
   * @returns Component factory function
   */
  private createComponentFactory(
    transpiledCode: string, 
    componentName: string,
    loadedLibraries: Map<string, any>,
    options: CompileOptions
  ): (context: RuntimeContext, styles?: ComponentStyles) => ComponentObject {
    try {
      // Create the factory function with all React hooks and utility functions
      const factoryCreator = new Function(
        'React', 'ReactDOM',
        'useState', 'useEffect', 'useCallback', 'useMemo', 'useRef', 'useContext', 'useReducer', 'useLayoutEffect',
        'libraries', 'styles', 'console', 'components',
        'unwrapLibraryComponent', 'unwrapLibraryComponents', 'unwrapAllLibraryComponents',
        `${transpiledCode}; return createComponent;`
      );

      // Return a function that executes the factory with runtime context
      return (context: RuntimeContext, styles: any = {}, components: Record<string, any> = {}) => {
        const { React, ReactDOM, libraries = {} } = context;
        
        // Diagnostic: Check if React is null when creating component
        if (!React) {
          console.error('🔴 CRITICAL: React is NULL in createComponentFactory!');
          console.error('Context provided:', context);
          console.error('Context keys:', Object.keys(context));
          throw new Error('React is null in runtime context when creating component factory');
        }
        
        // Additional diagnostic for React hooks
        if (!React.useState || !React.useEffect) {
          console.error('🔴 CRITICAL: React hooks are missing!');
          console.error('React object keys:', React ? Object.keys(React) : 'React is null');
          console.error('useState:', typeof React?.useState);
          console.error('useEffect:', typeof React?.useEffect);
        }
        
        // Merge loaded libraries with context libraries
        // IMPORTANT: Only include libraries that are NOT dependency-only
        // We need to filter based on the libraries array from options
        const mergedLibraries = { ...libraries };
        
        // Only add libraries that are explicitly requested in the component
        // This prevents dependency-only libraries from being accessible
        const specLibraryNames = new Set(
          (options.libraries || []).map((lib: any) => lib.globalVariable).filter(Boolean)
        );
        
        loadedLibraries.forEach((value, key) => {
          // Only add if this library is in the spec (not just a dependency)
          if (specLibraryNames.has(key)) {
            mergedLibraries[key] = value;
          } else if (this.config.debug) {
            console.log(`⚠️ Filtering out dependency-only library: ${key}`);
          }
        });

        // Create bound versions of unwrap functions with debug flag
        const boundUnwrapLibraryComponent = (lib: any, name: string) => unwrapLibraryComponent(lib, name, this.config.debug);
        const boundUnwrapLibraryComponents = (lib: any, ...names: string[]) => unwrapLibraryComponents(lib, ...names, this.config.debug as any);
        const boundUnwrapAllLibraryComponents = (lib: any) => unwrapAllLibraryComponents(lib, this.config.debug);

        // Execute the factory creator to get the createComponent function
        let createComponentFn;
        try {
          createComponentFn = factoryCreator(
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
            console,
            components,
            boundUnwrapLibraryComponent,
            boundUnwrapLibraryComponents,
            boundUnwrapAllLibraryComponents
          );
        } catch (error: any) {
          console.error('🔴 CRITICAL: Error calling factoryCreator with React hooks!');
          console.error('Error:', error?.message || error);
          console.error('React is:', React);
          console.error('React type:', typeof React);
          if (React) {
            console.error('React.useState:', typeof React.useState);
            console.error('React.useEffect:', typeof React.useEffect);
          }
          throw new Error(`Failed to create component factory: ${error?.message || error}`);
        }

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
          console,
          components,
          boundUnwrapLibraryComponent,
          boundUnwrapLibraryComponents,
          boundUnwrapAllLibraryComponents
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