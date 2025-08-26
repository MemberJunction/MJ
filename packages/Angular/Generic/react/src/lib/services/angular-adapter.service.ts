/**
 * @fileoverview Angular adapter service that bridges the React runtime with Angular.
 * Provides Angular-specific functionality for the platform-agnostic React runtime.
 * @module @memberjunction/ng-react
 */

import { Injectable } from '@angular/core';
import { 
  ComponentCompiler,
  ComponentRegistry,
  ComponentResolver,
  createReactRuntime,
  CompileOptions,
  RuntimeContext,
  ExternalLibraryConfig,
  LibraryConfiguration
} from '@memberjunction/react-runtime';
import { ScriptLoaderService } from './script-loader.service';
import { DEFAULT_STYLES } from '../default-styles';
import { ComponentStyles } from '@memberjunction/interactive-component-types';

/**
 * Angular-specific adapter for the React runtime.
 * Manages the integration between Angular services and the platform-agnostic React runtime.
 */
@Injectable({ providedIn: 'root' })
export class AngularAdapterService {
  private runtime?: {
    compiler: ComponentCompiler;
    registry: ComponentRegistry;
    resolver: ComponentResolver;
    version: string;
  };
  private runtimeContext?: RuntimeContext;

  constructor(private scriptLoader: ScriptLoaderService) {}

  /**
   * Initialize the React runtime with Angular-specific configuration
   * @param config Optional library configuration
   * @param additionalLibraries Optional additional libraries to merge
   * @returns Promise resolving when runtime is ready
   */
  async initialize(
    config?: LibraryConfiguration,
    additionalLibraries?: ExternalLibraryConfig[]
  ): Promise<void> {
    if (this.runtime) {
      return; // Already initialized
    }

    // Load React ecosystem with optional additional libraries
    const ecosystem = await this.scriptLoader.loadReactEcosystem(config, additionalLibraries);
    
    // Create runtime context
    this.runtimeContext = {
      React: ecosystem.React,
      ReactDOM: ecosystem.ReactDOM,
      libraries: ecosystem.libraries,
      utilities: {
        // Add any Angular-specific utilities here
      }
    };

    // Create the React runtime with runtime context for registry support
    this.runtime = createReactRuntime(ecosystem.Babel, {
      compiler: {
        cache: true,
        maxCacheSize: 100
      },
      registry: {
        maxComponents: 1000,
        cleanupInterval: 60000,
        useLRU: true,
        enableNamespaces: true
      }
    }, this.runtimeContext);
  }

  /**
   * Get the component compiler
   * @returns Component compiler instance
   */
  getCompiler(): ComponentCompiler {
    if (!this.runtime) {
      throw new Error('React runtime not initialized. Call initialize() first.');
    }
    return this.runtime.compiler;
  }

  /**
   * Get the component registry
   * @returns Component registry instance
   */
  getRegistry(): ComponentRegistry {
    if (!this.runtime) {
      throw new Error('React runtime not initialized. Call initialize() first.');
    }
    return this.runtime.registry;
  }

  /**
   * Get the component resolver
   * @returns Component resolver instance
   */
  getResolver(): ComponentResolver {
    if (!this.runtime) {
      throw new Error('React runtime not initialized. Call initialize() first.');
    }
    return this.runtime.resolver;
  }

  /**
   * Get the runtime context
   * @returns Runtime context with React and libraries
   */
  getRuntimeContext(): RuntimeContext {
    if (!this.runtimeContext) {
      throw new Error('React runtime not initialized. Call initialize() first.');
    }
    return this.runtimeContext;
  }


  /**
   * Compile a component with Angular-specific defaults
   * @param options - Compilation options
   * @returns Promise resolving to compilation result
   */
  async compileComponent(options: CompileOptions) {
    // Validate options before initialization
    if (!options) {
      throw new Error(
        'Angular adapter error: No compilation options provided.\n' +
        'This usually means the component spec is null or undefined.\n' +
        'Please check that:\n' +
        '1. Your component data is loaded properly\n' +
        '2. The component spec has "name" and "code" properties\n' +
        '3. The component input is not undefined'
      );
    }

    if (!options.componentName || options.componentName.trim() === '') {
      throw new Error(
        'Angular adapter error: Component name is missing or empty.\n' +
        `Received options: ${JSON.stringify(options, null, 2)}\n` +
        'Make sure your component spec includes a "name" property.'
      );
    }

    if (!options.componentCode || options.componentCode.trim() === '') {
      throw new Error(
        `Angular adapter error: Component code is missing or empty for component "${options.componentName}".\n` +
        'Make sure your component spec includes a "code" property with the React component source.'
      );
    }

    await this.initialize();
    
    // Apply default styles if not provided
    const optionsWithDefaults = {
      ...options,
      styles: options.styles || DEFAULT_STYLES
    };

    return this.runtime!.compiler.compile(optionsWithDefaults);
  }

  /**
   * Register a component in the registry
   * @param name - Component name
   * @param component - Compiled component
   * @param namespace - Component namespace
   * @param version - Component version
   * @returns Component metadata
   */
  registerComponent(
    name: string,
    component: any,
    namespace: string = 'Global',
    version: string = 'v1'
  ) {
    if (!this.runtime) {
      throw new Error('React runtime not initialized. Call initialize() first.');
    }
    return this.runtime.registry.register(name, component, namespace, version);
  }

  /**
   * Get a component from the registry
   * @param name - Component name
   * @param namespace - Component namespace
   * @param version - Component version
   * @returns Component if found
   */
  getComponent(name: string, namespace: string = 'Global', version?: string) {
    if (!this.runtime) {
      throw new Error('React runtime not initialized. Call initialize() first.');
    }
    return this.runtime.registry.get(name, namespace, version);
  }

  /**
   * Check if runtime is initialized
   * @returns true if initialized
   */
  isInitialized(): boolean {
    return !!this.runtime && !!this.runtimeContext;
  }

  /**
   * Get runtime version
   * @returns Runtime version string
   */
  getVersion(): string {
    return this.runtime?.version || 'unknown';
  }

  /**
   * Clean up resources
   */
  destroy(): void {
    if (this.runtime) {
      this.runtime.registry.destroy();
      this.runtime = undefined;
      this.runtimeContext = undefined;
    }
  }

  /**
   * Get Babel instance for direct use
   * @returns Babel instance
   */
  getBabel(): any {
    return this.runtimeContext?.libraries?.Babel || (window as any).Babel;
  }

  /**
   * Transpile JSX code directly
   * @param code - JSX code to transpile
   * @param filename - Optional filename for better error messages
   * @returns Transpiled JavaScript code
   */
  transpileJSX(code: string, filename?: string): string {
    const babel = this.getBabel();
    if (!babel) {
      throw new Error('Babel not loaded. Initialize the runtime first.');
    }

    try {
      const result = babel.transform(code, {
        presets: ['react'],
        filename: filename || 'component.jsx'
      });
      return result.code;
    } catch (error: any) {
      throw new Error(`Failed to transpile JSX: ${error.message}`);
    }
  }
}