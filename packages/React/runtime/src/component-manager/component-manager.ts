/**
 * @fileoverview Unified Component Manager implementation
 * Handles all component operations efficiently with proper caching and registry tracking
 */

import { ComponentSpec, ComponentLibraryDependency } from '@memberjunction/interactive-component-types';
import { UserInfo, Metadata, LogError } from '@memberjunction/core';
import { ComponentMetadataEngine, ComponentLibraryEntity, ComponentEntityExtended } from '@memberjunction/core-entities';

import { ComponentCompiler } from '../compiler';
import { ComponentRegistry } from '../registry';
import { RuntimeContext, ComponentObject } from '../types';
import {
  LoadOptions,
  LoadResult,
  HierarchyResult,
  ComponentManagerConfig,
  CacheEntry,
  ResolutionMode
} from './types';

/**
 * Unified component management system that handles all component operations
 * efficiently with proper caching and registry tracking.
 */
export class ComponentManager {
  private compiler: ComponentCompiler;
  private registry: ComponentRegistry;
  private runtimeContext: RuntimeContext;
  private config: ComponentManagerConfig;
  
  // Caching
  private fetchCache: Map<string, CacheEntry> = new Map();
  private registryNotifications: Set<string> = new Set();
  private loadingPromises: Map<string, Promise<LoadResult>> = new Map();
  
  // Metadata engine
  private componentEngine = ComponentMetadataEngine.Instance;
  private graphQLClient: any = null;
  
  constructor(
    compiler: ComponentCompiler,
    registry: ComponentRegistry,
    runtimeContext: RuntimeContext,
    config: ComponentManagerConfig = {}
  ) {
    this.compiler = compiler;
    this.registry = registry;
    this.runtimeContext = runtimeContext;
    this.config = {
      debug: false,
      maxCacheSize: 100,
      cacheTTL: 3600000, // 1 hour
      enableUsageTracking: true,
      dependencyBatchSize: 5,
      fetchTimeout: 30000,
      ...config
    };
    
    this.log('ComponentManager initialized', {
      debug: this.config.debug,
      cacheTTL: this.config.cacheTTL,
      usageTracking: this.config.enableUsageTracking
    });
  }
  
  /**
   * Main entry point - intelligently handles all component operations
   */
  async loadComponent(
    spec: ComponentSpec,
    options: LoadOptions = {}
  ): Promise<LoadResult> {
    const startTime = Date.now();
    const componentKey = this.getComponentKey(spec, options);
    
    this.log(`Loading component: ${spec.name}`, { 
      key: componentKey, 
      location: spec.location,
      registry: spec.registry,
      forceRefresh: options.forceRefresh 
    });
    
    // Check if already loading to prevent duplicate work
    const existingPromise = this.loadingPromises.get(componentKey);
    if (existingPromise && !options.forceRefresh) {
      this.log(`Component already loading: ${spec.name}, waiting...`);
      return existingPromise;
    }
    
    // Create loading promise
    const loadPromise = this.doLoadComponent(spec, options, componentKey, startTime);
    this.loadingPromises.set(componentKey, loadPromise);
    
    try {
      const result = await loadPromise;
      return result;
    } finally {
      this.loadingPromises.delete(componentKey);
    }
  }
  
  /**
   * Internal method that does the actual loading
   */
  private async doLoadComponent(
    spec: ComponentSpec,
    options: LoadOptions,
    componentKey: string,
    startTime: number
  ): Promise<LoadResult> {
    const errors: LoadResult['errors'] = [];
    
    try {
      // STEP 1: Check if already loaded in ComponentRegistry
      const namespace = spec.namespace || options.defaultNamespace || 'Global';
      const version = spec.version || options.defaultVersion || 'latest';
      
      const existing = this.registry.get(spec.name, namespace, version);
      if (existing && !options.forceRefresh && !options.forceRecompile) {
        this.log(`Component found in registry: ${spec.name}`);
        
        // Still need to notify registry for usage tracking
        if (options.trackUsage !== false) {
          await this.notifyRegistryUsageIfNeeded(spec, componentKey);
        }
        
        // Get cached spec if available
        const cachedEntry = this.fetchCache.get(componentKey);
        
        return {
          success: true,
          component: existing,
          spec: cachedEntry?.spec || spec,
          fromCache: true
        };
      }
      
      // STEP 2: Fetch full spec if needed
      let fullSpec = spec;
      if (this.needsFetch(spec)) {
        this.log(`Fetching component spec: ${spec.name}`);
        try {
          fullSpec = await this.fetchComponentSpec(spec, options.contextUser, {
            resolutionMode: options.resolutionMode
          });

          // Cache the fetched spec
          this.fetchCache.set(componentKey, {
            spec: fullSpec,
            fetchedAt: new Date(),
            hash: await this.calculateHash(fullSpec),
            usageNotified: false
          });
        } catch (error) {
          errors.push({
            message: `Failed to fetch component: ${error instanceof Error ? error.message : String(error)}`,
            phase: 'fetch',
            componentName: spec.name
          });
          throw error;
        }
      } else {
        // Log when we skip fetching because code is already provided
        if (spec.location === 'registry' && spec.code) {
          this.log(`Skipping fetch for registry component: ${spec.name} (code already provided)`, {
            location: spec.location,
            registry: spec.registry
          });
        }
        // Also cache the spec if it has code to avoid re-fetching
        if (spec.code && !this.fetchCache.has(componentKey)) {
          this.fetchCache.set(componentKey, {
            spec: fullSpec,
            fetchedAt: new Date(),
            hash: await this.calculateHash(fullSpec),
            usageNotified: false
          });
        }
      }
      
      // STEP 3: Notify registry of usage (exactly once per session)
      if (options.trackUsage !== false) {
        await this.notifyRegistryUsageIfNeeded(fullSpec, componentKey);
      }
      
      // STEP 4: Compile if needed
      let compiledComponent = existing;
      if (!compiledComponent || options.forceRecompile) {
        this.log(`Compiling component: ${spec.name}`);
        try {
          compiledComponent = await this.compileComponent(fullSpec, options);
        } catch (error) {
          errors.push({
            message: `Failed to compile component: ${error instanceof Error ? error.message : String(error)}`,
            phase: 'compile',
            componentName: spec.name
          });
          throw error;
        }
      }
      
      // STEP 5: Register in ComponentRegistry
      if (!existing || options.forceRefresh || options.forceRecompile) {
        this.log(`Registering component: ${spec.name}`);
        this.registry.register(
          fullSpec.name,
          compiledComponent,
          namespace,
          version
        );
      }
      
      // STEP 6: Process dependencies recursively
      const dependencies: Record<string, ComponentObject> = {};
      if (fullSpec.dependencies && fullSpec.dependencies.length > 0) {
        this.log(`Loading ${fullSpec.dependencies.length} dependencies for ${spec.name}`);
        
        // Load dependencies in batches for efficiency
        const depResults = await this.loadDependenciesBatched(
          fullSpec.dependencies,
          { ...options, isDependent: true }
        );
        
        for (const result of depResults) {
          if (result.success && result.component) {
            const depSpec = fullSpec.dependencies.find(d => 
              d.name === (result.spec?.name || '')
            );
            if (depSpec) {
              dependencies[depSpec.name] = result.component;
            }
          } else if (result.errors) {
            errors.push(...result.errors);
          }
        }
      }
      
      const elapsed = Date.now() - startTime;
      this.log(`Component loaded successfully: ${spec.name} (${elapsed}ms)`, {
        fromCache: false,
        dependencyCount: Object.keys(dependencies).length
      });
      
      return {
        success: errors.length === 0,
        component: compiledComponent,
        spec: fullSpec,
        fromCache: false,
        dependencies,
        errors: errors.length > 0 ? errors : undefined
      };
      
    } catch (error) {
      const elapsed = Date.now() - startTime;
      this.log(`Failed to load component: ${spec.name} (${elapsed}ms)`, error);
      
      return {
        success: false,
        fromCache: false,
        errors: errors.length > 0 ? errors : [{
          message: error instanceof Error ? error.message : String(error),
          phase: 'fetch',
          componentName: spec.name
        }]
      };
    }
  }
  
  /**
   * Load a complete hierarchy efficiently
   */
  async loadHierarchy(
    rootSpec: ComponentSpec,
    options: LoadOptions = {}
  ): Promise<HierarchyResult> {
    const startTime = Date.now();
    const loaded: string[] = [];
    const errors: HierarchyResult['errors'] = [];
    const components: Record<string, ComponentObject> = {};
    const stats = {
      fromCache: 0,
      fetched: 0,
      compiled: 0,
      totalTime: 0
    };
    
    this.log(`Loading component hierarchy: ${rootSpec.name}`, {
      location: rootSpec.location,
      registry: rootSpec.registry
    });
    
    try {
      // Initialize component engine if needed (skip in browser context where it doesn't exist)
      if (this.componentEngine && typeof this.componentEngine.Config === 'function') {
        await this.componentEngine.Config(false, options.contextUser);
      }
      
      // Load the root component and all its dependencies
      const result = await this.loadComponentRecursive(
        rootSpec,
        options,
        loaded,
        errors,
        components,
        stats,
        new Set()
      );
      
      stats.totalTime = Date.now() - startTime;
      
      this.log(`Hierarchy loaded: ${rootSpec.name}`, {
        success: errors.length === 0,
        loadedCount: loaded.length,
        errors: errors.length,
        ...stats
      });
      
      // Unwrap components before returning
      // Components are ComponentObject wrappers, but consumers expect just the React components
      const unwrappedComponents: Record<string, ComponentObject> = {};
      for (const [name, componentObject] of Object.entries(components)) {
        if (componentObject && typeof componentObject === 'object' && 'component' in componentObject) {
          // Extract the actual React component function
          unwrappedComponents[name] = (componentObject as any).component;
        } else {
          // Already a function or something else - use as-is
          unwrappedComponents[name] = componentObject;
        }
      }
      
      return {
        success: errors.length === 0,
        rootComponent: result.component,
        resolvedSpec: result.spec,
        loadedComponents: loaded,
        errors,
        components: unwrappedComponents,
        stats
      };
      
    } catch (error) {
      stats.totalTime = Date.now() - startTime;
      
      this.log(`Failed to load hierarchy: ${rootSpec.name}`, error);
      
      return {
        success: false,
        loadedComponents: loaded,
        errors: [...errors, {
          message: error instanceof Error ? error.message : String(error),
          phase: 'fetch',
          componentName: rootSpec.name
        }],
        stats
      };
    }
  }
  
  /**
   * Recursively load a component and its dependencies
   */
  private async loadComponentRecursive(
    spec: ComponentSpec,
    options: LoadOptions,
    loaded: string[],
    errors: HierarchyResult['errors'],
    components: Record<string, ComponentObject>,
    stats: HierarchyResult['stats'],
    visited: Set<string>
  ): Promise<LoadResult> {
    const componentKey = this.getComponentKey(spec, options);
    
    // Prevent circular dependencies
    if (visited.has(componentKey)) {
      this.log(`Circular dependency detected: ${spec.name}`);
      return {
        success: true,
        component: components[spec.name],
        spec,
        fromCache: true
      };
    }
    visited.add(componentKey);
    
    // Load this component
    const result = await this.loadComponent(spec, options);
    
    if (result.success && result.component) {
      loaded.push(spec.name);
      components[spec.name] = result.component;
      
      // Update stats
      if (stats) {
        if (result.fromCache) stats.fromCache++;
        else {
          stats.fetched++;
          stats.compiled++;
        }
      }
      
      // Load dependencies
      if (result.spec?.dependencies) {
        for (const dep of result.spec.dependencies) {
          // Normalize dependency spec for local registry lookup
          const depSpec = { ...dep };
          // OPTIMIZATION: If the dependency already has code (from registry population),
          // we can skip fetching and go straight to compilation
          if (depSpec.code) {
            this.log(`Dependency ${depSpec.name} already has code (from registry population), optimizing load`);
          }

          // If location is "registry" with undefined registry, ensure it's treated as local
          // This follows the convention that registry components with undefined registry
          // should be looked up in the local ComponentMetadataEngine
          if (depSpec.location === 'registry' && !depSpec.registry) {
            // Explicitly set to undefined for clarity (it may already be undefined)
            depSpec.registry = undefined;

            // Log for debugging
            this.log(`Dependency ${depSpec.name} is a local registry component (registry=undefined)`);
          }

          await this.loadComponentRecursive(
            depSpec,
            { ...options, isDependent: true },
            loaded,
            errors,
            components,
            stats,
            visited
          );
        }
      }
    } else if (result.errors) {
      errors.push(...result.errors);
    }
    
    return result;
  }
  
  /**
   * Load dependencies in batches for efficiency
   */
  private async loadDependenciesBatched(
    dependencies: ComponentSpec[],
    options: LoadOptions
  ): Promise<LoadResult[]> {
    const batchSize = this.config.dependencyBatchSize || 5;
    const results: LoadResult[] = [];
    
    for (let i = 0; i < dependencies.length; i += batchSize) {
      const batch = dependencies.slice(i, i + batchSize);
      const batchPromises = batch.map(dep => this.loadComponent(dep, options));
      const batchResults = await Promise.all(batchPromises);
      results.push(...batchResults);
    }
    
    return results;
  }
  
  /**
   * Check if a component needs to be fetched from a registry
   */
  private needsFetch(spec: ComponentSpec): boolean {
    // Need to fetch if:
    // 1. It's a registry component without code
    // 2. It's missing required fields
    return spec.location === 'registry' && !spec.code;
  }
  
  /**
   * Fetch a component specification from a registry (local or external)
   * 
   * Convention: When location === 'registry' and registry === undefined,
   * the component is looked up in the local ComponentMetadataEngine.
   * This allows components to reference local registry components without
   * having to know if they're embedded or registry-based.
   */
  private async fetchComponentSpec(
    spec: ComponentSpec,
    contextUser?: UserInfo,
    options?: { resolutionMode?: ResolutionMode }
  ): Promise<ComponentSpec> {
    // Check cache first
    const cacheKey = this.getComponentKey(spec, {});
    const cached = this.fetchCache.get(cacheKey);
    
    if (cached && this.isCacheValid(cached)) {
      this.log(`Using cached spec for: ${spec.name}`);
      return cached.spec;
    }
    
    // Handle LOCAL registry components (registry is null/undefined)
    if (!spec.registry) {
      this.log(`Fetching from local registry: ${spec.name}`);
      
      // Find component in local ComponentMetadataEngine
      const localComponent = this.componentEngine.Components?.find(
        (c: ComponentEntityExtended) => {
          // Match by name (case-insensitive for better compatibility)
          const nameMatch = c.Name?.toLowerCase() === spec.name?.toLowerCase();
          
          // Match by namespace if provided (handle different formats)
          const namespaceMatch = !spec.namespace || c.Namespace?.toLowerCase() === spec.namespace?.toLowerCase();

          if (nameMatch && !namespaceMatch) {
          }
          
          return nameMatch && namespaceMatch;
        }
      );
      
      if (!localComponent) {
        throw new Error(`Local component not found: ${spec.name}`);
      }
      
      // Parse specification from local component
      if (!localComponent.Specification) {
        throw new Error(`Local component ${spec.name} has no specification`);
      }
      
      const fullSpec = JSON.parse(localComponent.Specification);
      
      // Cache it
      this.fetchCache.set(cacheKey, {
        spec: fullSpec,
        fetchedAt: new Date(),
        usageNotified: false
      });
      
      return fullSpec;
    }
    
    // Handle EXTERNAL registry components (registry has a name)
    // Initialize GraphQL client if needed
    if (!this.graphQLClient) {
      await this.initializeGraphQLClient();
    }
    
    if (!this.graphQLClient) {
      throw new Error('GraphQL client not available for registry fetching');
    }
    
    // Fetch from external registry
    this.log(`Fetching from external registry: ${spec.registry}/${spec.name}`);
    
    const fullSpec = await this.graphQLClient.GetRegistryComponent({
      registryName: spec.registry,
      namespace: spec.namespace || 'Global',
      name: spec.name,
      version: spec.version || 'latest'
    });
    
    if (!fullSpec) {
      throw new Error(`Component not found in registry: ${spec.registry}/${spec.name}`);
    }
    
    // Apply resolution mode if specified
    const processedSpec = this.applyResolutionMode(fullSpec, spec, options?.resolutionMode);
    
    // Cache it
    this.fetchCache.set(cacheKey, {
      spec: processedSpec,
      fetchedAt: new Date(),
      usageNotified: false
    });
    
    return processedSpec;
  }
  
  /**
   * Apply resolution mode to a fetched spec (recursively including dependencies)
   */
  private applyResolutionMode(
    fullSpec: ComponentSpec,
    originalSpec: ComponentSpec,
    resolutionMode?: ResolutionMode
  ): ComponentSpec {
    let processedSpec: ComponentSpec;
    
    if (resolutionMode === 'embed') {
      // Convert to embedded format for test harness
      processedSpec = {
        ...fullSpec,
        location: 'embedded',
        registry: undefined,
        // namespace and name can stay for identification
      };
    } else {
      // Default: preserve-metadata mode
      // Keep original registry metadata but include fetched code
      processedSpec = {
        ...fullSpec,
        location: originalSpec.location,
        registry: originalSpec.registry,
        namespace: originalSpec.namespace || fullSpec.namespace,
        name: originalSpec.name || fullSpec.name
      };
    }
    
    // Recursively apply resolution mode to dependencies
    if (processedSpec.dependencies && processedSpec.dependencies.length > 0) {
      processedSpec.dependencies = processedSpec.dependencies.map(dep => {
        // For dependencies, use the dep itself as both full and original spec
        // since they've already been fetched and processed
        return this.applyResolutionMode(dep, dep, resolutionMode);
      });
    }
    
    return processedSpec;
  }

  /**
   * Compile a component specification
   */
  private async compileComponent(
    spec: ComponentSpec,
    options: LoadOptions
  ): Promise<ComponentObject> {
    // Get all available libraries - use passed libraries or fall back to ComponentMetadataEngine
    const allLibraries = options.allLibraries || this.componentEngine.ComponentLibraries || [];
    
    // Filter valid libraries
    const validLibraries = spec.libraries?.filter(lib => 
      lib && lib.name && lib.globalVariable && 
      lib.name !== 'unknown' && lib.globalVariable !== 'undefined'
    );
    
    // Compile the component
    const result = await this.compiler.compile({
      componentName: spec.name,
      componentCode: spec.code || '',
      libraries: validLibraries,
      dependencies: spec.dependencies,
      allLibraries
    });
    
    if (!result.success || !result.component) {
      throw new Error(result.error?.message || 'Compilation failed');
    }
    
    // Add loaded libraries to runtime context
    if (result.loadedLibraries && result.loadedLibraries.size > 0) {
      if (!this.runtimeContext.libraries) {
        this.runtimeContext.libraries = {};
      }
      result.loadedLibraries.forEach((value, key) => {
        this.runtimeContext.libraries![key] = value;
      });
    }
    
    // Get the component object from the factory
    const componentObject = result.component.factory(
      this.runtimeContext,
      undefined, // styles
      {} // components - will be injected by parent
    );
    
    return componentObject;
  }
  
  /**
   * Notify registry of component usage for licensing
   * Only happens once per component per session
   */
  private async notifyRegistryUsageIfNeeded(
    spec: ComponentSpec,
    componentKey: string
  ): Promise<void> {
    if (!spec.registry || !this.config.enableUsageTracking) {
      return; // Only for external registry components with tracking enabled
    }
    
    const notificationKey = `${spec.registry}:${componentKey}`;
    if (this.registryNotifications.has(notificationKey)) {
      this.log(`Usage already notified for: ${spec.name}`);
      return; // Already notified this session
    }
    
    try {
      // In the future, make lightweight usage notification call to registry
      // For now, the fetch itself serves as the notification
      this.log(`Notifying registry usage for: ${spec.name}`);
      this.registryNotifications.add(notificationKey);
      
      // Update cache entry
      const cached = this.fetchCache.get(componentKey);
      if (cached) {
        cached.usageNotified = true;
      }
    } catch (error) {
      // Log but don't fail - usage tracking shouldn't break component loading
      console.warn(`Failed to notify registry usage for ${componentKey}:`, error);
    }
  }
  
  /**
   * Initialize GraphQL client for registry operations
   */
  private async initializeGraphQLClient(): Promise<void> {
    try {
      const provider = Metadata?.Provider;
      if (provider && (provider as any).ExecuteGQL) {
        const { GraphQLComponentRegistryClient } = await import('@memberjunction/graphql-dataprovider');
        this.graphQLClient = new GraphQLComponentRegistryClient(provider as any);
        this.log('GraphQL client initialized');
      }
    } catch (error) {
      LogError(`Failed to initialize GraphQL client: ${error instanceof Error ? error.message : String(error)}`);
    }
  }
  
  /**
   * Check if a cache entry is still valid
   */
  private isCacheValid(entry: CacheEntry): boolean {
    const age = Date.now() - entry.fetchedAt.getTime();
    return age < (this.config.cacheTTL || 3600000);
  }
  
  /**
   * Calculate a hash for a component spec (for cache validation)
   */
  private async calculateHash(spec: ComponentSpec): Promise<string> {
    // Simple hash based on spec content
    const content = JSON.stringify({
      name: spec.name,
      version: spec.version,
      code: spec.code,
      libraries: spec.libraries
    });
    
    // Simple hash function (in production, use crypto)
    let hash = 0;
    for (let i = 0; i < content.length; i++) {
      const char = content.charCodeAt(i);
      hash = ((hash << 5) - hash) + char;
      hash = hash & hash; // Convert to 32bit integer
    }
    return hash.toString(16);
  }
  
  /**
   * Generate a unique key for a component
   */
  private getComponentKey(spec: ComponentSpec, options: LoadOptions): string {
    const registry = spec.registry || 'local';
    const namespace = spec.namespace || options.defaultNamespace || 'Global';
    const version = spec.version || options.defaultVersion || 'latest';
    return `${registry}:${namespace}:${spec.name}:${version}`;
  }
  
  /**
   * Clear all caches
   */
  clearCache(): void {
    this.fetchCache.clear();
    this.registryNotifications.clear();
    this.loadingPromises.clear();
    this.log('All caches cleared');
  }
  
  /**
   * Get cache statistics
   */
  getCacheStats(): {
    fetchCacheSize: number;
    notificationsCount: number;
    loadingCount: number;
  } {
    return {
      fetchCacheSize: this.fetchCache.size,
      notificationsCount: this.registryNotifications.size,
      loadingCount: this.loadingPromises.size
    };
  }
  
  /**
   * Log a message if debug is enabled
   */
  private log(message: string, data?: any): void {
    if (this.config.debug) {
      console.log(`🎯 [ComponentManager] ${message}`, data || '');
    }
  }
}