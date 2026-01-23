/**
 * @fileoverview Component dependency resolver for managing component relationships.
 * Handles resolution of child components and dependency graphs.
 * @module @memberjunction/react-runtime/registry
 */

import { ComponentRegistry } from './component-registry';
import { ComponentRegistryService } from './component-registry-service';
import { ComponentSpec } from '@memberjunction/interactive-component-types';
import { ComponentCompiler } from '../compiler';
import { RuntimeContext } from '../types';
import { UserInfo } from '@memberjunction/core';
import { ComponentMetadataEngine } from '@memberjunction/core-entities';

/**
 * Resolved component map for passing to React components
 */
export interface ResolvedComponents {
  [componentName: string]: any;
}

/**
 * Component dependency resolver.
 * Resolves component hierarchies and manages dependencies between components.
 */
export class ComponentResolver {
  private registry: ComponentRegistry;
  private registryService: ComponentRegistryService | null = null;
  private resolverInstanceId: string;
  private compiler: ComponentCompiler | null = null;
  private runtimeContext: RuntimeContext | null = null;
  private componentEngine = ComponentMetadataEngine.Instance;
  private debug: boolean = false;

  /**
   * Creates a new ComponentResolver instance
   * @param registry - Component registry to use for resolution
   * @param compiler - Optional compiler for registry-based components
   * @param runtimeContext - Optional runtime context for registry-based components
   * @param debug - Enable debug logging (defaults to false)
   */
  constructor(
    registry: ComponentRegistry,
    compiler?: ComponentCompiler,
    runtimeContext?: RuntimeContext,
    debug: boolean = false
  ) {
    this.registry = registry;
    this.resolverInstanceId = `resolver-${Date.now()}-${Math.random()}`;
    this.debug = debug;
    
    if (compiler && runtimeContext) {
      this.compiler = compiler;
      this.runtimeContext = runtimeContext;
      this.registryService = ComponentRegistryService.getInstance(compiler, runtimeContext, debug);
    }
  }

  /**
   * Resolves all components for a given component specification
   * @param spec - Root component specification
   * @param namespace - Namespace for component resolution
   * @param contextUser - Optional user context for database operations
   * @returns Map of component names to resolved components
   */
  async resolveComponents(
    spec: ComponentSpec, 
    namespace: string = 'Global',
    contextUser?: UserInfo
  ): Promise<ResolvedComponents> {
    console.log(`🚀 [ComponentResolver] Starting component resolution for: ${spec.name}`);
    console.log(`📋 [ComponentResolver] Root component spec:`, {
      name: spec.name,
      location: spec.location,
      registry: spec.registry,
      namespace: spec.namespace,
      hasCode: !!spec.code,
      hasDependencies: !!(spec.dependencies && spec.dependencies.length > 0)
    });
    
    if (this.debug) {
      console.log(`📋 [ComponentResolver] Dependencies to resolve:`, (spec.dependencies || []).map(d => ({
        name: d.name,
        location: d.location,
        namespace: d.namespace
      })));
    }
    
    const resolved: ResolvedComponents = {};
    
    // Initialize component engine if we have registry service
    if (this.registryService) {
      if (this.debug) {
        console.log(`🔄 [ComponentResolver] Initializing component engine...`);
      }
      await this.componentEngine.Config(false, contextUser);
      if (this.debug) {
        console.log(`✅ [ComponentResolver] Component engine initialized with ${this.componentEngine.Components?.length || 0} components`);
      }
    }
    
    // Resolve the component hierarchy
    await this.resolveComponentHierarchy(spec, resolved, namespace, new Set(), contextUser);
    
    if (!resolved[spec.name]) {
      console.error(`❌ [ComponentResolver] Root component '${spec.name}' was NOT added to resolved map!`);
      console.log(`📦 [ComponentResolver] What IS in resolved map:`, Object.keys(resolved));
    }
    
    if (this.debug) {
      console.log(`📊 [ComponentResolver] Resolved components before unwrapping:`, Object.keys(resolved));
    }
    
    // Unwrap component wrappers before returning
    // Components from the registry come as objects with component/print/refresh properties
    // We need to extract just the component function for use in child components
    const unwrapped: ResolvedComponents = {};
    for (const [name, value] of Object.entries(resolved)) {
      if (value && typeof value === 'object' && 'component' in value) {
        if (typeof value.component === 'function') {
          // This is a wrapped component - extract the actual React component function
          unwrapped[name] = value.component;
          if (this.debug) {
            console.log(`✅ [ComponentResolver] Unwrapped component: ${name} (was object with .component)`);
          }
        } else {
          // ComponentObject has a component property but it's not a function
          console.error(`❌ [ComponentResolver] Component ${name} has invalid component property:`, typeof value.component, value);
          unwrapped[name] = value; // Pass through the problematic value so we can see the error
        }
      } else if (typeof value === 'function') {
        // Already a function - use as is
        unwrapped[name] = value;
        if (this.debug) {
          console.log(`✅ [ComponentResolver] Component already a function: ${name}`);
        }
      } else {
        // Something else - could be undefined or an error
        console.warn(`⚠️ [ComponentResolver] Component ${name} is not a function or wrapped component:`, typeof value, value);
        unwrapped[name] = value; // Pass through for debugging
      }
    }
    
    if (this.debug) {
      console.log(`🎯 [ComponentResolver] Final resolved components:`, Object.keys(unwrapped).map(name => ({
        name,
        type: typeof unwrapped[name],
        isUndefined: unwrapped[name] === undefined
      })));
    }
    
    return unwrapped;
  }

  /**
   * Recursively resolves a component hierarchy
   * @param spec - Component specification
   * @param resolved - Map to store resolved components
   * @param namespace - Namespace for resolution
   * @param visited - Set of visited component names to prevent cycles
   * @param contextUser - Optional user context for database operations
   */
  private async resolveComponentHierarchy(
    spec: ComponentSpec,
    resolved: ResolvedComponents,
    namespace: string,
    visited: Set<string> = new Set(),
    contextUser?: UserInfo
  ): Promise<void> {
    // Create a unique identifier for this component
    const componentId = `${spec.namespace || namespace}/${spec.name}@${spec.version || 'latest'}`;
    
    // Check if already resolved (not just visited)
    if (resolved[spec.name]) {
      if (this.debug) {
        console.log(`⏭️ [ComponentResolver] Component already resolved: ${spec.name}`);
      }
      return;
    }
    
    // Prevent circular dependencies
    if (visited.has(componentId)) {
      if (this.debug) {
        console.warn(`Circular dependency detected for component: ${componentId}`);
      }
      return;
    }
    visited.add(componentId);

    // *** CRITICAL: Process child components FIRST (depth-first, post-order) ***
    if (this.debug) {
      console.log(`🔄 [ComponentResolver] Resolving dependencies for ${spec.name} BEFORE resolving itself`);
    }
    const children = spec.dependencies || [];
    for (const child of children) {
      if (this.debug) {
        console.log(`  ↳ [ComponentResolver] Resolving dependency: ${child.name} for parent ${spec.name}`);
      }
      await this.resolveComponentHierarchy(child, resolved, namespace, visited, contextUser);
    }
    if (children.length > 0 && this.debug) {
      console.log(`✅ [ComponentResolver] All ${children.length} dependencies resolved for ${spec.name}, now resolving itself`);
    }

    // NOW resolve the current component (it can access its dependencies)
    // Handle based on location
    if (spec.location === 'registry' && this.registryService) {
      // Registry component - need to load from database or external source
      if (this.debug) {
        console.log(`🔍 [ComponentResolver] Looking for registry component: ${spec.name} in namespace: ${spec.namespace || namespace}`);
        if (spec.registry) {
          console.log(`  📍 [ComponentResolver] External registry specified: ${spec.registry}`);
        } else {
          console.log(`  📍 [ComponentResolver] Local registry (no registry field specified)`);
        }
      }
      
      try {
        // If spec.registry is populated, this is an external registry component
        // If spec.registry is blank/undefined, this is a local registry component
        if (spec.registry) {
          // EXTERNAL REGISTRY: Need to fetch from external registry via GraphQL
          if (this.debug) {
            console.log(`🌐 [ComponentResolver] Fetching from external registry: ${spec.registry}`);
          }
          
          // Get compiled component from registry service (which will handle the external fetch)
          const compiledComponent = await this.registryService.getCompiledComponentFromRegistry(
            spec.registry,  // Registry name
            spec.namespace || namespace,
            spec.name,
            spec.version || 'latest',
            this.resolverInstanceId,
            contextUser
          );
          
          if (compiledComponent) {
            resolved[spec.name] = compiledComponent;
            if (this.debug) {
              console.log(`✅ [ComponentResolver] Successfully fetched and compiled from external registry: ${spec.name}`);
            }
          } else {
            console.error(`❌ [ComponentResolver] Failed to fetch from external registry: ${spec.name} from ${spec.registry}`);
          }
        } else {
          // LOCAL REGISTRY: Get from local database
          if (this.debug) {
            console.log(`💾 [ComponentResolver] Looking for locally registered component`);
          }
          
          // First, try to find the component in the metadata engine
          const allComponents = this.componentEngine.Components || [];
          if (this.debug) {
            console.log(`📊 [ComponentResolver] Total components in engine: ${allComponents.length}`);
          }
          
          // Log all matching names to see duplicates
          const matchingNames = allComponents.filter((c: any) => c.Name === spec.name);
          if (matchingNames.length > 0 && this.debug) {
            console.log(`🔎 [ComponentResolver] Found ${matchingNames.length} components with name "${spec.name}":`, 
              matchingNames.map((c: any) => ({
                ID: c.ID,
                Name: c.Name,
                Namespace: c.Namespace,
                Version: c.Version,
                Status: c.Status
              }))
            );
          }
          
          const component = this.componentEngine.Components?.find(
            (c: any) => c.Name === spec.name && 
                 c.Namespace === (spec.namespace || namespace)
          );
          
          if (component) {
            if (this.debug) {
              console.log(`✅ [ComponentResolver] Found component in local DB:`, {
                ID: component.ID,
                Name: component.Name,
                Namespace: component.Namespace,
                Version: component.Version
              });
            }
            
            // Get compiled component from registry service (local compilation)
            const compiledComponent = await this.registryService.getCompiledComponent(
              component.ID,
              this.resolverInstanceId,
              contextUser
            );
            resolved[spec.name] = compiledComponent;
            if (this.debug) {
              console.log(`📦 [ComponentResolver] Successfully compiled and resolved local component: ${spec.name}, type: ${typeof compiledComponent}`);
            }
          } else {
            console.error(`❌ [ComponentResolver] Local registry component NOT found in database: ${spec.name} with namespace: ${spec.namespace || namespace}`);
            if (this.debug) {
              console.warn(`Local registry component not found in database: ${spec.name}`);
            }
          }
        }
      } catch (error) {
        if (this.debug) {
          console.error(`Failed to load registry component ${spec.name}:`, error);
        }
      }
    } else {
      // Embedded/Local component
      // Use the component's specified namespace if it has one, otherwise use parent's namespace
      const componentNamespace = spec.namespace || namespace;
      
      // First check if component has inline code that needs compilation
      if (spec.code && this.compiler) {
        if (this.debug) {
          console.log(`🔨 [ComponentResolver] Component ${spec.name} has inline code, compiling...`);
        }
        
        try {
          // Compile the component with its code
          const compilationResult = await this.compiler.compile({
            componentName: spec.name,
            componentCode: spec.code,
            libraries: spec.libraries,
            dependencies: spec.dependencies,
            allLibraries: [] // TODO: Get from ComponentMetadataEngine if needed
          });
          
          if (compilationResult.success && compilationResult.component) {
            // Get the component object from the factory (only if we have runtimeContext)
            if (!this.runtimeContext) {
              console.error(`❌ [ComponentResolver] Cannot compile without runtime context`);
              return;
            }
            const componentObject = compilationResult.component.factory(this.runtimeContext);
            
            // Register it in the local registry for future use
            this.registry.register(spec.name, componentObject, componentNamespace, spec.version || 'latest');
            
            // Add to resolved
            resolved[spec.name] = componentObject;
            
            if (this.debug) {
              console.log(`✅ [ComponentResolver] Successfully compiled and registered inline component: ${spec.name}`);
            }
          } else {
            console.error(`❌ [ComponentResolver] Failed to compile inline component ${spec.name}:`, compilationResult.error);
          }
        } catch (error) {
          console.error(`❌ [ComponentResolver] Error compiling inline component ${spec.name}:`, error);
        }
      } else {
        // No inline code, try to get from local registry
        if (this.debug) {
          console.log(`🔍 [ComponentResolver] Looking for embedded component: ${spec.name} in namespace: ${componentNamespace}`);
        }
        
        const component = this.registry.get(spec.name, componentNamespace);
        if (component) {
          resolved[spec.name] = component;
          if (this.debug) {
            console.log(`✅ [ComponentResolver] Found embedded component: ${spec.name}, type: ${typeof component}`);
          }
          if (this.debug) {
            console.log(`📄 Resolved embedded component: ${spec.name} from namespace ${componentNamespace}, type:`, typeof component);
          }
        } else {
          // If not found with specified namespace, try the parent namespace as fallback
          if (this.debug) {
            console.log(`⚠️ [ComponentResolver] Not found in namespace ${componentNamespace}, trying fallback namespace: ${namespace}`);
          }
          const fallbackComponent = this.registry.get(spec.name, namespace);
          if (fallbackComponent) {
            resolved[spec.name] = fallbackComponent;
            if (this.debug) {
              console.log(`✅ [ComponentResolver] Found embedded component in fallback namespace: ${spec.name}, type: ${typeof fallbackComponent}`);
            }
            if (this.debug) {
              console.log(`📄 Resolved embedded component: ${spec.name} from fallback namespace ${namespace}, type:`, typeof fallbackComponent);
            }
          } else {
            // Component not found - this might cause issues later
            console.error(`❌ [ComponentResolver] Could not resolve embedded component: ${spec.name} in namespace ${componentNamespace} or ${namespace}`);
            if (this.debug) {
              console.warn(`⚠️ Could not resolve embedded component: ${spec.name} in namespace ${componentNamespace} or ${namespace}`);
            }
            // Store undefined explicitly so we know it failed to resolve
            resolved[spec.name] = undefined;
          }
        }
      }
    }
    
    // Child components have already been processed at the beginning of this method
    // No need to process them again - we're using depth-first, post-order traversal
  }

  /**
   * Cleanup resolver resources
   */
  cleanup(): void {
    // Remove our references when resolver is destroyed
    if (this.registryService) {
      // This would allow the registry service to clean up unused components
      // Implementation would track which components this resolver referenced
      if (this.debug) {
        console.log(`Cleaning up resolver: ${this.resolverInstanceId}`);
      }
    }
  }

  /**
   * Validates that all required components are available
   * @param spec - Component specification to validate
   * @param namespace - Namespace for validation
   * @returns Array of missing component names
   */
  validateDependencies(spec: ComponentSpec, namespace: string = 'Global'): string[] {
    const missing: string[] = [];
    const checked = new Set<string>();
    
    this.checkDependencies(spec, namespace, missing, checked);
    
    return missing;
  }

  /**
   * Recursively checks for missing dependencies
   * @param spec - Component specification
   * @param namespace - Namespace for checking
   * @param missing - Array to collect missing components
   * @param checked - Set of already checked components
   */
  private checkDependencies(
    spec: ComponentSpec,
    namespace: string,
    missing: string[],
    checked: Set<string>
  ): void {
    if (checked.has(spec.name)) return;
    checked.add(spec.name);

    // Check if component exists in registry
    if (!this.registry.has(spec.name, namespace)) {
      missing.push(spec.name);
    }

    // Check children
    const children = spec.dependencies || [];
    for (const child of children) {
      this.checkDependencies(child, namespace, missing, checked);
    }
  }

  /**
   * Gets the dependency graph for a component specification
   * @param spec - Component specification
   * @returns Dependency graph as adjacency list
   */
  getDependencyGraph(spec: ComponentSpec): Map<string, string[]> {
    const graph = new Map<string, string[]>();
    const visited = new Set<string>();
    
    this.buildDependencyGraph(spec, graph, visited);
    
    return graph;
  }

  /**
   * Recursively builds the dependency graph
   * @param spec - Component specification
   * @param graph - Graph to build
   * @param visited - Set of visited components
   */
  private buildDependencyGraph(
    spec: ComponentSpec,
    graph: Map<string, string[]>,
    visited: Set<string>
  ): void {
    if (visited.has(spec.name)) return;
    visited.add(spec.name);

    const children = spec.dependencies || [];
    const dependencies = children.map(child => child.name);
    
    graph.set(spec.name, dependencies);

    // Recursively process children
    for (const child of children) {
      this.buildDependencyGraph(child, graph, visited);
    }
  }

  /**
   * Performs topological sort on component dependencies
   * @param spec - Root component specification
   * @returns Array of component names in dependency order
   */
  getLoadOrder(spec: ComponentSpec): string[] {
    const graph = this.getDependencyGraph(spec);
    const visited = new Set<string>();
    const stack: string[] = [];

    // Perform DFS on all nodes
    for (const node of graph.keys()) {
      if (!visited.has(node)) {
        this.topologicalSortDFS(node, graph, visited, stack);
      }
    }

    // Reverse to get correct load order
    return stack.reverse();
  }

  /**
   * DFS helper for topological sort
   * @param node - Current node
   * @param graph - Dependency graph
   * @param visited - Set of visited nodes
   * @param stack - Result stack
   */
  private topologicalSortDFS(
    node: string,
    graph: Map<string, string[]>,
    visited: Set<string>,
    stack: string[]
  ): void {
    visited.add(node);

    const dependencies = graph.get(node) || [];
    for (const dep of dependencies) {
      if (!visited.has(dep)) {
        this.topologicalSortDFS(dep, graph, visited, stack);
      }
    }

    stack.push(node);
  }

  /**
   * Resolves components in the correct dependency order
   * @param spec - Root component specification
   * @param namespace - Namespace for resolution
   * @returns Ordered array of resolved components
   */
  resolveInOrder(spec: ComponentSpec, namespace: string = 'Global'): Array<{
    name: string;
    component: any;
  }> {
    const loadOrder = this.getLoadOrder(spec);
    const resolved: Array<{ name: string; component: any }> = [];

    for (const name of loadOrder) {
      const component = this.registry.get(name, namespace);
      if (component) {
        resolved.push({ name, component });
      }
    }

    return resolved;
  }

  /**
   * Creates a flattened list of all component specifications
   * @param spec - Root component specification
   * @returns Array of all component specs in the hierarchy
   */
  flattenComponentSpecs(spec: ComponentSpec): ComponentSpec[] {
    const flattened: ComponentSpec[] = [];
    const visited = new Set<string>();

    this.collectComponentSpecs(spec, flattened, visited);

    return flattened;
  }

  /**
   * Recursively collects component specifications
   * @param spec - Current component specification
   * @param collected - Array to collect specs
   * @param visited - Set of visited component names
   */
  private collectComponentSpecs(
    spec: ComponentSpec,
    collected: ComponentSpec[],
    visited: Set<string>
  ): void {
    if (visited.has(spec.name)) return;
    visited.add(spec.name);

    collected.push(spec);

    const children = spec.dependencies || [];
    for (const child of children) {
      this.collectComponentSpecs(child, collected, visited);
    }
  }
}