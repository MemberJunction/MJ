/**
 * @fileoverview Service for managing registry-based component loading with caching
 * @module @memberjunction/react-runtime/registry
 */

import { ComponentSpec, ComponentObject } from '@memberjunction/interactive-component-types';
import { ComponentCompiler } from '../compiler';
import { RuntimeContext } from '../types';
import { 
  RegistryProvider, 
  RegistryComponentResponse,
  ComponentDependencyInfo,
  DependencyTree, 
  RegistryComponentMetadata
} from './registry-provider';
import { UserInfo, Metadata } from '@memberjunction/core';
import { 
  ComponentEntity, 
  ComponentRegistryEntity,
  ComponentDependencyEntity,
  ComponentLibraryLinkEntity,
  ComponentMetadataEngine
} from '@memberjunction/core-entities';

// Type-only import for TypeScript - won't be included in UMD bundle
import type { GraphQLDataProvider } from '@memberjunction/graphql-dataprovider';

// Dynamic import of GraphQLComponentRegistryClient to avoid breaking UMD build
let GraphQLComponentRegistryClient: any;


/**
 * Cached compiled component with metadata
 */
interface CachedCompiledComponent {
  component: (context: RuntimeContext, styles?: any, components?: Record<string, any>) => ComponentObject;
  metadata: RegistryComponentResponse['metadata'];
  compiledAt: Date;
  lastUsed: Date;
  useCount: number;
  specHash?: string;  // SHA-256 hash of the spec used for compilation
}

/**
 * GraphQL client interface for registry operations
 */
export interface IComponentRegistryClient {
  GetRegistryComponent(params: {
    registryName: string;
    namespace: string;
    name: string;
    version?: string;
    hash?: string;
  }): Promise<ComponentSpec | null>;
}

/**
 * Service for managing component loading from registries with compilation caching
 */
export class ComponentRegistryService {
  private static instance: ComponentRegistryService | null = null;
  
  // Caches
  private compiledComponentCache = new Map<string, CachedCompiledComponent>();
  private componentReferences = new Map<string, Set<string>>();
  
  // Dependencies
  private compiler: ComponentCompiler;
  private runtimeContext: RuntimeContext;
  private componentEngine = ComponentMetadataEngine.Instance;
  private registryProviders = new Map<string, RegistryProvider>();
  private debug: boolean = false;
  private graphQLClient?: IComponentRegistryClient;
  
  private constructor(
    compiler: ComponentCompiler,
    runtimeContext: RuntimeContext,
    debug: boolean = false,
    graphQLClient?: IComponentRegistryClient
  ) {
    this.compiler = compiler;
    this.runtimeContext = runtimeContext;
    this.debug = debug;
    this.graphQLClient = graphQLClient;
  }
  
  /**
   * Get or create the singleton instance
   */
  static getInstance(
    compiler: ComponentCompiler, 
    context: RuntimeContext,
    debug: boolean = false,
    graphQLClient?: IComponentRegistryClient
  ): ComponentRegistryService {
    if (!ComponentRegistryService.instance) {
      ComponentRegistryService.instance = new ComponentRegistryService(compiler, context, debug, graphQLClient);
    }
    return ComponentRegistryService.instance;
  }
  
  /**
   * Set the GraphQL client for registry operations
   */
  setGraphQLClient(client: IComponentRegistryClient): void {
    this.graphQLClient = client;
    if (this.debug) {
      console.log('✅ GraphQL client configured for component registry');
    }
  }
  
  /**
   * Cached GraphQL client instance created from Metadata.Provider
   */
  private cachedProviderClient: IComponentRegistryClient | null = null;
  
  /**
   * Get the GraphQL client, using the provided one or falling back to creating one with Metadata.Provider
   * @returns The GraphQL client if available
   */
  private async getGraphQLClient(): Promise<IComponentRegistryClient | null> {
    // If explicitly set, use that
    if (this.graphQLClient) {
      return this.graphQLClient;
    }
    
    // If we've already created one from the provider, reuse it
    if (this.cachedProviderClient) {
      return this.cachedProviderClient;
    }
    
    // Try to create GraphQLComponentRegistryClient with Metadata.Provider
    try {
      const provider = Metadata?.Provider;
      if (provider && (provider as any).ExecuteGQL !== undefined) {
        // Dynamically load GraphQLComponentRegistryClient if not already loaded
        if (!GraphQLComponentRegistryClient) {
          try {
            const graphqlModule = await import('@memberjunction/graphql-dataprovider');
            GraphQLComponentRegistryClient = graphqlModule.GraphQLComponentRegistryClient;
          } catch (importError) {
            if (this.debug) {
              console.log('⚠️ [ComponentRegistryService] @memberjunction/graphql-dataprovider not available');
            }
            return null;
          }
        }
        
        // Create the client if we have the class
        if (GraphQLComponentRegistryClient) {
          try {
            const client = new GraphQLComponentRegistryClient(provider as GraphQLDataProvider);
            this.cachedProviderClient = client;
            if (this.debug) {
              console.log('📡 [ComponentRegistryService] Created GraphQL client from Metadata.Provider');
            }
            return client;
          } catch (error) {
            if (this.debug) {
              console.log('⚠️ [ComponentRegistryService] Failed to create GraphQL client:', error);
            }
          }
        }
      }
    } catch (error) {
      // Provider might not be available in all environments
      if (this.debug) {
        console.log('⚠️ [ComponentRegistryService] Could not access Metadata.Provider:', error);
      }
    }
    
    return null;
  }
  
  /**
   * Initialize the service with metadata
   */
  async initialize(contextUser?: UserInfo): Promise<void> {
    // Initialize metadata engine
    await this.componentEngine.Config(false, contextUser);
  }
  
  /**
   * Calculate SHA-256 hash of a component spec for cache comparison
   * Uses Web Crypto API which is available in modern browsers and Node.js 15+
   */
  private async calculateSpecHash(spec: ComponentSpec): Promise<string> {
    // Check for crypto.subtle availability
    if (typeof crypto === 'undefined' || !crypto.subtle) {
      throw new Error(
        'Web Crypto API not available. This typically happens when running in an insecure context. ' +
        'Please use HTTPS or localhost for development. ' +
        'Note: crypto.subtle is available in Node.js 15+ and all modern browsers on secure contexts.'
      );
    }
    
    const specString = JSON.stringify(spec);
    const encoder = new TextEncoder();
    const data = encoder.encode(specString);
    
    // Calculate SHA-256 hash using Web Crypto API
    const hashBuffer = await crypto.subtle.digest('SHA-256', data);
    
    // Convert ArrayBuffer to hex string
    const hashArray = Array.from(new Uint8Array(hashBuffer));
    const hashHex = hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
    
    return hashHex;
  }
  
  /**
   * Get a compiled component, using cache if available
   */
  async getCompiledComponent(
    componentId: string,
    referenceId?: string,
    contextUser?: UserInfo
  ): Promise<ComponentObject> {
    await this.initialize(contextUser);
    
    // Find component in metadata
    const component = this.componentEngine.Components.find((c: ComponentEntity) => c.ID === componentId);
    if (!component) {
      throw new Error(`Component not found: ${componentId}`);
    }
    
    const key = this.getComponentKey(component.Name, component.Namespace, component.Version, component.SourceRegistryID);
    
    // Check if already compiled and cached
    if (this.compiledComponentCache.has(key)) {
      const cached = this.compiledComponentCache.get(key)!;
      cached.lastUsed = new Date();
      cached.useCount++;
      
      // Track reference if provided
      if (referenceId) {
        this.addComponentReference(key, referenceId);
      }
      
      if (this.debug) {
        console.log(`✅ Reusing compiled component from cache: ${key} (use count: ${cached.useCount})`);
      }
      // Call the factory function to get the ComponentObject
      return cached.component(this.runtimeContext);
    }
    
    // Not in cache, need to load and compile
    if (this.debug) {
      console.log(`🔄 Loading and compiling component: ${key}`);
    }
    
    // Get the component specification
    const spec = await this.getComponentSpec(componentId, contextUser);
    
    // Compile the component
    // Load all libraries from metadata engine
    const allLibraries = this.componentEngine.ComponentLibraries || [];
    
    let compilationResult;
    try {
      compilationResult = await this.compiler.compile({
        componentName: component.Name,
        componentCode: spec.code,
        libraries: spec.libraries,
        allLibraries
      });
    }
    catch (compileEx) {
      // log then throw
      console.error(`🔴 Error compiling component ${component.Name}`,compileEx);
      throw compileEx;
    }
    
    if (!compilationResult.success) {
      console.error(`🔴 Error compiling component ${component.Name}`, compilationResult, 'Code', spec.code);
      throw new Error(`Failed to compile component ${component.Name}: ${compilationResult.error}`);
    }
    
    // Cache the compiled component
    const metadata: RegistryComponentMetadata = {
      name: component.Name,
      namespace: component.Namespace || '',
      version: component.Version,
      description: component.Description || '',
      title: component.Title || undefined,
      type: component.Type || undefined,
      status: component.Status || undefined,
      properties: spec.properties,
      events: spec.events,
      libraries: spec.libraries,
      dependencies: spec.dependencies,
      sourceRegistryID: component.SourceRegistryID,
      isLocal: !component.SourceRegistryID
    };
    
    if (!compilationResult.component) {
      throw new Error(`Component compilation succeeded but no component returned`);
    }
    const compiledComponentFactory = compilationResult.component.factory;
    this.compiledComponentCache.set(key, {
      component: compiledComponentFactory,
      metadata,
      compiledAt: new Date(),
      lastUsed: new Date(),
      useCount: 1
    });
    
    // Track reference
    if (referenceId) {
      this.addComponentReference(key, referenceId);
    }
    
    // Call the factory function to get the ComponentObject
    return compiledComponentFactory(this.runtimeContext);
  }
  
  /**
   * Get compiled component from external registry by registry name
   * This is used when spec.registry field is populated
   */
  async getCompiledComponentFromRegistry(
    registryName: string,
    namespace: string,
    name: string,
    version: string,
    referenceId?: string,
    contextUser?: UserInfo
  ): Promise<any> {
    await this.initialize(contextUser);
    
    if (this.debug) {
      console.log(`🌐 [ComponentRegistryService] Fetching from external registry: ${registryName}/${namespace}/${name}@${version}`);
    }
    
    // Find the registry by name in ComponentRegistries
    const registry = this.componentEngine.ComponentRegistries?.find(
      r => r.Name === registryName && r.Status === 'Active'
    );
    
    if (!registry) {
      throw new Error(`Registry not found or inactive: ${registryName}`);
    }
    
    if (this.debug) {
      console.log(`✅ [ComponentRegistryService] Found registry: ${registry.Name} (ID: ${registry.ID})`);
    }
    
    // Get GraphQL client - use provided one or fallback to Metadata.Provider
    const graphQLClient = await this.getGraphQLClient();
    if (!graphQLClient) {
      throw new Error('GraphQL client not available for external registry fetching. No client provided and Metadata.Provider is not a GraphQLDataProvider.');
    }
    
    // Check if we have a cached version first
    const key = `external:${registryName}:${namespace}:${name}:${version}`;
    const cached = this.compiledComponentCache.get(key);
    
    try {
      // Fetch component spec from external registry via MJServer
      // Pass cached hash if available for efficient caching
      const spec = await graphQLClient.GetRegistryComponent({
        registryName: registry.Name,  // Pass registry name, not ID
        namespace,
        name,
        version,
        hash: cached?.specHash  // Pass cached hash if available
      });
      
      // If null returned, it means not modified (304)
      if (!spec && cached?.specHash) {
        if (this.debug) {
          console.log(`♻️ [ComponentRegistryService] Component not modified, using cached: ${key}`);
        }
        cached.lastUsed = new Date();
        cached.useCount++;
        
        // Track reference
        if (referenceId) {
          this.addComponentReference(key, referenceId);
        }
        
        // Call the factory function to get the ComponentObject
        return cached.component(this.runtimeContext);
      }
      
      if (!spec) {
        throw new Error(`Component not found in registry ${registryName}: ${namespace}/${name}@${version}`);
      }
      
      if (this.debug) {
        console.log(`✅ [ComponentRegistryService] Fetched spec from external registry: ${spec.name}`);
      }
      
      // Calculate hash of the fetched spec
      const specHash = await this.calculateSpecHash(spec);
      
      // Check if hash matches cached version (shouldn't happen if server works correctly)
      if (cached && cached.specHash === specHash) {
        if (this.debug) {
          console.log(`♻️ [ComponentRegistryService] Using cached compilation for: ${key} (hash match)`);
        }
        cached.lastUsed = new Date();
        cached.useCount++;
        
        // Track reference
        if (referenceId) {
          this.addComponentReference(key, referenceId);
        }
        
        // Call the factory function to get the ComponentObject
        return cached.component(this.runtimeContext);
      }
      
      // Spec has changed or is new, need to compile
      if (cached && this.debug) {
        console.log(`🔄 [ComponentRegistryService] Spec changed for: ${key}, recompiling (old hash: ${cached.specHash?.substring(0, 8)}..., new hash: ${specHash.substring(0, 8)}...)`);
      }
      
      // Load all libraries from metadata engine
      const allLibraries = this.componentEngine.ComponentLibraries || [];
      
      // Compile the component
      const compilationResult = await this.compiler.compile({
        componentName: spec.name,
        componentCode: spec.code || '',
        allLibraries: allLibraries
      });
      
      if (!compilationResult.success || !compilationResult.component) {
        throw new Error(`Failed to compile component: ${compilationResult.error?.message || 'Unknown error'}`);
      }
      
      // Cache the compiled component with spec hash
      this.compiledComponentCache.set(key, {
        component: compilationResult.component.factory,
        metadata: {
          name: spec.name,
          namespace: spec.namespace || '',
          version: spec.version || '1.0.0',
          description: spec.description || '',
          type: spec.type,
          isLocal: false  // This is from an external registry
        },
        compiledAt: new Date(),
        lastUsed: new Date(),
        useCount: 1,
        specHash: specHash  // Store the hash for future comparison
      });
      
      // Track reference
      if (referenceId) {
        this.addComponentReference(key, referenceId);
      }
      
      if (this.debug) {
        console.log(`🎯 [ComponentRegistryService] Successfully compiled external component: ${spec.name}`);
      }
      
      // Call the factory function to get the ComponentObject
      return compilationResult.component.factory(this.runtimeContext);
    } catch (error) {
      console.error(`❌ [ComponentRegistryService] Failed to fetch from external registry:`, error);
      throw error;
    }
  }
  
  /**
   * Get component specification from database or external registry
   */
  async getComponentSpec(
    componentId: string,
    contextUser?: UserInfo
  ): Promise<ComponentSpec> {
    await this.initialize(contextUser);
    
    const component = this.componentEngine.Components.find((c: ComponentEntity) => c.ID === componentId);
    if (!component) {
      throw new Error(`Component not found: ${componentId}`);
    }
    
    if (!component.SourceRegistryID) {
      // LOCAL: Use specification from database
      if (!component.Specification) {
        throw new Error(`Local component ${component.Name} has no specification`);
      }
      return JSON.parse(component.Specification);
    }
    
    // EXTERNAL: Check if we have a cached version
    if (component.Specification && component.LastSyncedAt) {
      // For now, always use cached version (no expiration)
      if (this.debug) {
        console.log(`Using cached external component: ${component.Name} (synced: ${component.LastSyncedAt})`);
      }
      return JSON.parse(component.Specification);
    }
    
    // Need to fetch from external registry
    const registry = this.componentEngine.ComponentRegistries?.find(
      r => r.ID === component.SourceRegistryID
    );
    
    if (!registry) {
      throw new Error(`Registry not found: ${component.SourceRegistryID}`);
    }
    
    // Try GraphQL client first if available
    let spec: ComponentSpec;
    
    if (this.graphQLClient) {
      if (this.debug) {
        console.log(`Fetching from registry via GraphQL: ${component.Name}`);
      }
      
      const result = await this.graphQLClient.GetRegistryComponent({
        registryName: registry.Name,
        namespace: component.Namespace || '',
        name: component.Name,
        version: component.Version
      });
      
      if (!result) {
        throw new Error(`Component not found in registry: ${component.Name}`);
      }
      
      spec = result;
    } else {
      // Fallback to direct HTTP if no GraphQL client
      spec = await this.fetchFromExternalRegistry(
        registry.URI || '',
        component.Name,
        component.Namespace || '',
        component.Version,
        this.getRegistryApiKey(registry.ID)
      );
    }
    
    // Store in local database for future use
    await this.cacheExternalComponent(componentId, spec, contextUser);
    
    return spec;
  }
  
  /**
   * Fetch component from external registry via HTTP
   */
  private async fetchFromExternalRegistry(
    uri: string,
    name: string,
    namespace: string,
    version: string,
    apiKey?: string
  ): Promise<ComponentSpec> {
    const url = `${uri}/components/${encodeURIComponent(namespace)}/${encodeURIComponent(name)}/${version}`;
    
    const headers: HeadersInit = {
      'Accept': 'application/json'
    };
    
    if (apiKey) {
      headers['Authorization'] = `Bearer ${apiKey}`;
    }
    
    if (this.debug) {
      console.log(`Fetching from external registry: ${url}`);
    }
    
    const response = await fetch(url, { headers });
    
    if (!response.ok) {
      throw new Error(`Registry fetch failed: ${response.status} ${response.statusText}`);
    }
    
    const spec = await response.json() as ComponentSpec;
    return spec;
  }
  
  /**
   * Cache an external component in the local database
   */
  private async cacheExternalComponent(
    componentId: string,
    spec: ComponentSpec,
    contextUser?: UserInfo
  ): Promise<void> {
    // Get the actual entity object to save
    const md = new Metadata();
    const componentEntity = await md.GetEntityObject<ComponentEntity>('MJ: Components', contextUser);
    
    // Load the existing component
    if (!await componentEntity.Load(componentId)) {
      throw new Error(`Failed to load component entity: ${componentId}`);
    }
    
    // Update with fetched specification and all fields from spec
    componentEntity.Specification = JSON.stringify(spec);
    componentEntity.LastSyncedAt = new Date();
    
    // Set ReplicatedAt only on first fetch
    if (!componentEntity.ReplicatedAt) {
      componentEntity.ReplicatedAt = new Date();
    }
    
    // Update all fields from the spec with strong typing
    if (spec.name) {
      componentEntity.Name = spec.name;
    }
    
    if (spec.namespace) {
      componentEntity.Namespace = spec.namespace;
    }
    
    if (spec.version) {
      componentEntity.Version = spec.version;
    }
    
    if (spec.title) {
      componentEntity.Title = spec.title;
    }
    
    if (spec.description) {
      componentEntity.Description = spec.description;
    }
    
    if (spec.type) {
      // Map spec type to entity type (entity has specific enum values)
      const typeMap: Record<string, ComponentEntity['Type']> = {
        'report': 'Report',
        'dashboard': 'Dashboard',
        'form': 'Form',
        'table': 'Table',
        'chart': 'Chart',
        'navigation': 'Navigation',
        'search': 'Search',
        'widget': 'Widget',
        'utility': 'Utility',
        'other': 'Other'
      };
      
      const mappedType = typeMap[spec.type.toLowerCase()];
      if (mappedType) {
        componentEntity.Type = mappedType;
      }
    }
    
    if (spec.functionalRequirements) {
      componentEntity.FunctionalRequirements = spec.functionalRequirements;
    }
    
    if (spec.technicalDesign) {
      componentEntity.TechnicalDesign = spec.technicalDesign;
    }
    
    // Save back to database
    const result = await componentEntity.Save();
    if (!result) {
      throw new Error(`Failed to save cached component: ${componentEntity.Name}\n${componentEntity.LatestResult.CompleteMessage || componentEntity.LatestResult.CompleteMessage || componentEntity.LatestResult.Errors?.join(',')}`);
    }
    
    if (this.debug) {
      console.log(`Cached external component: ${componentEntity.Name} at ${componentEntity.LastSyncedAt}`);
    }
    
    // Refresh metadata cache after saving
    await this.componentEngine.Config(true, contextUser);
  }
  
  /**
   * Load component dependencies from database
   */
  async loadDependencies(
    componentId: string,
    contextUser?: UserInfo
  ): Promise<ComponentDependencyInfo[]> {
    await this.initialize(contextUser);
    
    // Get dependencies from metadata cache
    const dependencies = this.componentEngine.ComponentDependencies?.filter(
      d => d.ComponentID === componentId
    ) || [];
    
    const result: ComponentDependencyInfo[] = [];
    
    for (const dep of dependencies) {
      // Find the dependency component
      const depComponent = this.componentEngine.Components.find(
        (c: ComponentEntity) => c.ID === dep.DependencyComponentID
      );
      
      if (depComponent) {
        result.push({
          name: depComponent.Name,
          namespace: depComponent.Namespace || '',
          version: depComponent.Version, // Version comes from the linked Component record
          isRequired: true, // All dependencies are required in MemberJunction
          location: depComponent.SourceRegistryID ? 'registry' : 'embedded',
          sourceRegistryID: depComponent.SourceRegistryID
        });
      }
    }
    
    return result;
  }
  
  /**
   * Resolve full dependency tree for a component
   */
  async resolveDependencyTree(
    componentId: string,
    contextUser?: UserInfo,
    visited = new Set<string>()
  ): Promise<DependencyTree> {
    if (visited.has(componentId)) {
      return { 
        componentId, 
        circular: true 
      };
    }
    visited.add(componentId);
    
    await this.initialize(contextUser);
    
    const component = this.componentEngine.Components.find((c: ComponentEntity) => c.ID === componentId);
    if (!component) {
      return { componentId, dependencies: [] };
    }
    
    // Get direct dependencies
    const directDeps = await this.loadDependencies(componentId, contextUser);
    
    // Recursively resolve each dependency
    const dependencies: DependencyTree[] = [];
    for (const dep of directDeps) {
      // Find the dependency component
      const depComponent = this.componentEngine.Components.find(
        c => c.Name.trim().toLowerCase() === dep.name.trim().toLowerCase() && 
             c.Namespace?.trim().toLowerCase() === dep.namespace?.trim().toLowerCase()
      );
      
      if (depComponent) {
        const subTree = await this.resolveDependencyTree(
          depComponent.ID, 
          contextUser, 
          visited
        );
        dependencies.push(subTree);
      }
    }
    
    return {
      componentId,
      name: component.Name,
      namespace: component.Namespace || undefined,
      version: component.Version,
      dependencies,
      totalCount: dependencies.reduce((sum, d) => sum + (d.totalCount || 1), 1)
    };
  }
  
  /**
   * Get components to load in dependency order
   */
  async getComponentsToLoad(
    rootComponentId: string,
    contextUser?: UserInfo
  ): Promise<string[]> {
    const tree = await this.resolveDependencyTree(rootComponentId, contextUser);
    
    // Flatten tree in dependency order (depth-first)
    const ordered: string[] = [];
    const processNode = (node: DependencyTree) => {
      if (node.dependencies) {
        node.dependencies.forEach(processNode);
      }
      if (!ordered.includes(node.componentId)) {
        ordered.push(node.componentId);
      }
    };
    processNode(tree);
    
    return ordered;
  }
  
  /**
   * Add a reference to a component
   */
  private addComponentReference(componentKey: string, referenceId: string): void {
    if (!this.componentReferences.has(componentKey)) {
      this.componentReferences.set(componentKey, new Set());
    }
    this.componentReferences.get(componentKey)!.add(referenceId);
  }
  
  /**
   * Remove a reference to a component
   */
  removeComponentReference(componentKey: string, referenceId: string): void {
    const refs = this.componentReferences.get(componentKey);
    if (refs) {
      refs.delete(referenceId);
      
      // If no more references and cache cleanup is enabled
      if (refs.size === 0) {
        this.considerCacheEviction(componentKey);
      }
    }
  }
  
  /**
   * Consider evicting a component from cache
   */
  private considerCacheEviction(componentKey: string): void {
    const cached = this.compiledComponentCache.get(componentKey);
    if (cached) {
      const timeSinceLastUse = Date.now() - cached.lastUsed.getTime();
      const evictionThreshold = 5 * 60 * 1000; // 5 minutes
      
      if (timeSinceLastUse > evictionThreshold) {
        if (this.debug) {
          console.log(`🗑️ Evicting unused component from cache: ${componentKey}`);
        }
        this.compiledComponentCache.delete(componentKey);
      }
    }
  }
  
  /**
   * Get API key for a registry from secure configuration
   * @param registryId - Registry ID
   * @returns API key or undefined
   */
  private getRegistryApiKey(registryId: string): string | undefined {
    // API keys should be stored in environment variables or secure configuration
    // Format: REGISTRY_API_KEY_{registryId} or similar
    // This is a placeholder - actual implementation would depend on the security infrastructure
    const envKey = `REGISTRY_API_KEY_${registryId.replace(/-/g, '_').toUpperCase()}`;
    return process.env[envKey];
  }
  
  /**
   * Get cache statistics
   */
  getCacheStats(): {
    compiledComponents: number;
    totalUseCount: number;
    memoryEstimate: string;
  } {
    let totalUseCount = 0;
    this.compiledComponentCache.forEach(cached => {
      totalUseCount += cached.useCount;
    });
    
    return {
      compiledComponents: this.compiledComponentCache.size,
      totalUseCount,
      memoryEstimate: `~${(this.compiledComponentCache.size * 50)}KB` // Rough estimate
    };
  }
  
  /**
   * Clear all caches
   */
  clearCache(): void {
    if (this.debug) {
      console.log('🧹 Clearing all component caches');
    }
    this.compiledComponentCache.clear();
    this.componentReferences.clear();
  }

  /**
   * Force clear all compiled components
   * Used for Component Studio to ensure fresh loads
   */
  forceClearAll(): void {
    this.compiledComponentCache.clear();
    this.componentReferences.clear();
    console.log('🧹 Component cache force cleared');
  }

  /**
   * Reset the singleton instance
   * Forces new instance creation on next access
   */
  static reset(): void {
    if (ComponentRegistryService.instance) {
      ComponentRegistryService.instance.forceClearAll();
      ComponentRegistryService.instance = null;
    }
  }
  
  /**
   * Generate a cache key for a component
   */
  private getComponentKey(
    name: string, 
    namespace: string | null | undefined, 
    version: string, 
    sourceRegistryId: string | null | undefined
  ): string {
    const registryPart = sourceRegistryId || 'local';
    const namespacePart = namespace || 'global';
    return `${registryPart}/${namespacePart}/${name}@${version}`;
  }
}