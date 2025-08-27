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

/**
 * Cached compiled component with metadata
 */
interface CachedCompiledComponent {
  component: ComponentObject;
  metadata: RegistryComponentResponse['metadata'];
  compiledAt: Date;
  lastUsed: Date;
  useCount: number;
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
  
  private constructor(
    compiler: ComponentCompiler,
    runtimeContext: RuntimeContext,
    debug: boolean = false
  ) {
    this.compiler = compiler;
    this.runtimeContext = runtimeContext;
    this.debug = debug;
  }
  
  /**
   * Get or create the singleton instance
   */
  static getInstance(
    compiler: ComponentCompiler, 
    context: RuntimeContext,
    debug: boolean = false
  ): ComponentRegistryService {
    if (!ComponentRegistryService.instance) {
      ComponentRegistryService.instance = new ComponentRegistryService(compiler, context, debug);
    }
    return ComponentRegistryService.instance;
  }
  
  /**
   * Initialize the service with metadata
   */
  async initialize(contextUser?: UserInfo): Promise<void> {
    // Initialize metadata engine
    await this.componentEngine.Config(false, contextUser);
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
      return cached.component;
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
    
    const compilationResult = await this.compiler.compile({
      componentName: component.Name,
      componentCode: spec.code,
      libraries: spec.libraries,
      allLibraries
    });
    
    if (!compilationResult.success) {
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
    const compiledComponent = compilationResult.component.factory(this.runtimeContext);
    this.compiledComponentCache.set(key, {
      component: compiledComponent,
      metadata,
      compiledAt: new Date(),
      lastUsed: new Date(),
      useCount: 1
    });
    
    // Track reference
    if (referenceId) {
      this.addComponentReference(key, referenceId);
    }
    
    return compiledComponent;
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
    
    if (!registry) {
      throw new Error(`Registry not found: ${component.SourceRegistryID}`);
    }
    
    const spec = await this.fetchFromExternalRegistry(
      registry.URI || '',
      component.Name,
      component.Namespace || '',
      component.Version,
      this.getRegistryApiKey(registry.ID) // API keys stored in env vars or secure config
    );
    
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
      throw new Error(`Failed to save cached component: ${componentEntity.Name}\n${componentEntity.LatestResult.Message || componentEntity.LatestResult.Error || componentEntity.LatestResult.Errors?.join(',')}`);
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