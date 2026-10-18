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
  ComponentManager,
  createReactRuntime,
  CompileOptions,
  RuntimeContext,
  ExternalLibraryConfig,
  LibraryConfiguration,
  LibraryLoader,
  BuildStylesFromTheme
} from '@memberjunction/react-runtime';
import { ScriptLoaderService } from './script-loader.service';
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
    manager: ComponentManager;
    version: string;
  };
  private runtimeContext?: RuntimeContext;
  private initializationPromise: Promise<void> | undefined;

  constructor(private scriptLoader: ScriptLoaderService) {}

  /**
   * Eagerly start loading the React runtime in the background.
   * Call this at app startup (e.g., in APP_INITIALIZER or after auth) so that
   * React, ReactDOM, and Babel are already downloaded from CDN by the time the
   * user opens an interactive component artifact.
   *
   * Two-phase approach:
   * 1. Immediately inject `<link rel="preload">` hints so the browser starts
   *    downloading the CDN scripts in parallel with other page work.
   * 2. Fire-and-forget `initialize()` which creates `<script>` tags and
   *    executes them. If the preload hints already fetched the bytes, the
   *    script load is nearly instant (served from HTTP cache).
   *
   * Safe to call multiple times — the underlying initialize() deduplicates.
   * Does not block: returns immediately, initialization continues in background.
   */
  Preload(): void {
    // Phase 1: Inject browser preload hints for CDN scripts
    LibraryLoader.preloadCoreScripts();

    // Phase 2: Fire-and-forget full initialization (script execution + runtime setup)
    this.Initialize().catch(err => {
      console.warn('React runtime preload failed (will retry on demand):', err);
    });
  }

  /** @deprecated Use {@link Preload}. */
  preload(): void {
    return this.Preload();
  }

  /**
   * Initialize the React runtime with Angular-specific configuration
   * @param config Optional library configuration
   * @param additionalLibraries Optional additional libraries to merge
   * @param options Optional options including debug flag
   * @returns Promise resolving when runtime is ready
   */
  async Initialize(
    config?: LibraryConfiguration,
    additionalLibraries?: ExternalLibraryConfig[],
    options?: { debug?: boolean }
  ): Promise<void> {
    if (this.runtime) {
      return; // Already initialized
    }
    if (this.initializationPromise) {
      return this.initializationPromise; // in progress
    }

    // Start initialization and store the promise immediately
    this.initializationPromise = this.doInitialize(config, additionalLibraries, options);

    try {
        await this.initializationPromise;
    } catch (error) {
        // Clear the promise on error so it can be retried
        this.initializationPromise = undefined;
        throw error;
    }

    return;
  }

  /** @deprecated Use {@link Initialize}. */
  async initialize(
    config?: LibraryConfiguration,
    additionalLibraries?: ExternalLibraryConfig[],
    options?: { debug?: boolean }
  ): Promise<void> {
    return this.Initialize(config, additionalLibraries, options);
  }

  private async doInitialize(
    config?: LibraryConfiguration,
    additionalLibraries?: ExternalLibraryConfig[],
    options?: { debug?: boolean }
  ): Promise<void> {
    // Load React ecosystem with optional additional libraries
    const ecosystem = await this.scriptLoader.loadReactEcosystem(config, additionalLibraries, options);
    
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
        maxCacheSize: 100,
        debug: options?.debug
      },
      registry: {
        maxComponents: 1000,
        cleanupInterval: 60000,
        useLRU: true,
        enableNamespaces: true,
        debug: options?.debug
      }
    }, this.runtimeContext, options?.debug);
  }

  /**
   * Get the component compiler
   * @returns Component compiler instance
   */
  GetCompiler(): ComponentCompiler {
    if (!this.runtime) {
      throw new Error('React runtime not initialized. Call initialize() first.');
    }
    return this.runtime.compiler;
  }

  /** @deprecated Use {@link GetCompiler}. */
  getCompiler(): ComponentCompiler {
    return this.GetCompiler();
  }

  /**
   * Get the component registry
   * @returns Component registry instance
   */
  GetRegistry(): ComponentRegistry {
    if (!this.runtime) {
      throw new Error('React runtime not initialized. Call initialize() first.');
    }
    return this.runtime.registry;
  }

  /** @deprecated Use {@link GetRegistry}. */
  getRegistry(): ComponentRegistry {
    return this.GetRegistry();
  }

  /**
   * Get the component resolver
   * @returns Component resolver instance
   */
  GetResolver(): ComponentResolver {
    if (!this.runtime) {
      throw new Error('React runtime not initialized. Call initialize() first.');
    }
    return this.runtime.resolver;
  }

  /** @deprecated Use {@link GetResolver}. */
  getResolver(): ComponentResolver {
    return this.GetResolver();
  }

  /**
   * Get the runtime context
   * @returns Runtime context with React and libraries
   */
  GetRuntimeContext(): RuntimeContext {
    if (!this.runtimeContext) {
      throw new Error('React runtime not initialized. Call initialize() first.');
    }
    return this.runtimeContext;
  }

  /** @deprecated Use {@link GetRuntimeContext}. */
  getRuntimeContext(): RuntimeContext {
    return this.GetRuntimeContext();
  }

  /**
   * Get the unified component manager
   * @returns Component manager instance
   */
  GetComponentManager(): ComponentManager {
    if (!this.runtime) {
      throw new Error('React runtime not initialized. Call initialize() first.');
    }
    return this.runtime.manager;
  }

  /** @deprecated Use {@link GetComponentManager}. */
  getComponentManager(): ComponentManager {
    return this.GetComponentManager();
  }


  /**
   * Compile a component with Angular-specific defaults
   * @param options - Compilation options
   * @returns Promise resolving to compilation result
   */
  async CompileComponent(options: CompileOptions) {
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

    await this.Initialize();
    
    // Apply default styles if not provided — bridge the host's live MJ theme
    // (--mj-* tokens) so compiled components match the active theme, including
    // dark mode. Falls back to SetupStyles() defaults when no themed DOM exists.
    const optionsWithDefaults = {
      ...options,
      styles: options.styles || BuildStylesFromTheme()
    };

    return this.runtime!.compiler.compile(optionsWithDefaults);
  }

  /** @deprecated Use {@link CompileComponent}. */
  async compileComponent(options: CompileOptions) {
    return this.CompileComponent(options);
  }

  /**
   * Register a component in the registry
   * @param name - Component name
   * @param component - Compiled component
   * @param namespace - Component namespace
   * @param version - Component version
   * @returns Component metadata
   */
  RegisterComponent(
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

  /** @deprecated Use {@link RegisterComponent}. */
  registerComponent(
    name: string,
    component: any,
    namespace: string = 'Global',
    version: string = 'v1'
  ) {
    return this.RegisterComponent(name, component, namespace, version);
  }

  /**
   * Get a component from the registry
   * @param name - Component name
   * @param namespace - Component namespace
   * @param version - Component version
   * @returns Component if found
   */
  GetComponent(name: string, namespace: string = 'Global', version?: string) {
    if (!this.runtime) {
      throw new Error('React runtime not initialized. Call initialize() first.');
    }
    return this.runtime.registry.get(name, namespace, version);
  }

  /** @deprecated Use {@link GetComponent}. */
  getComponent(name: string, namespace: string = 'Global', version?: string) {
    return this.GetComponent(name, namespace, version);
  }

  /**
   * Check if runtime is initialized
   * @returns true if initialized
   */
  IsInitialized(): boolean {
    return !!this.runtime && !!this.runtimeContext;
  }

  /** @deprecated Use {@link IsInitialized}. */
  isInitialized(): boolean {
    return this.IsInitialized();
  }

  /**
   * Get runtime version
   * @returns Runtime version string
   */
  GetVersion(): string {
    return this.runtime?.version || 'unknown';
  }

  /** @deprecated Use {@link GetVersion}. */
  getVersion(): string {
    return this.GetVersion();
  }

  /**
   * Clean up resources
   */
  Destroy(): void {
    if (this.runtime) {
      this.runtime.registry.destroy();
      this.runtime = undefined;
      this.runtimeContext = undefined;
    }
    // Clear the cached initialization promise so a subsequent initialize()
    // actually runs doInitialize() instead of returning the stale resolved promise.
    this.initializationPromise = undefined;
  }

  /** @deprecated Use {@link Destroy}. */
  destroy(): void {
    return this.Destroy();
  }

  /**
   * Get Babel instance for direct use
   * @returns Babel instance
   */
  GetBabel(): any {
    return this.runtimeContext?.libraries?.Babel || (window as any).Babel;
  }

  /** @deprecated Use {@link GetBabel}. */
  getBabel(): any {
    return this.GetBabel();
  }

  /**
   * Transpile JSX code directly
   * @param code - JSX code to transpile
   * @param filename - Optional filename for better error messages
   * @returns Transpiled JavaScript code
   */
  TranspileJSX(code: string, filename?: string): string {
    const babel = this.GetBabel();
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

  /** @deprecated Use {@link TranspileJSX}. */
  transpileJSX(code: string, filename?: string): string {
    return this.TranspileJSX(code, filename);
  }
}