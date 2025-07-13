/**
 * @fileoverview Component dependency resolver for managing component relationships.
 * Handles resolution of child components and dependency graphs.
 * @module @memberjunction/react-runtime/registry
 */

import { ComponentRegistry } from './component-registry';

/**
 * Component specification interface matching Skip component structure
 */
export interface ComponentSpec {
  componentName: string;
  componentCode?: string;
  childComponents?: ComponentSpec[];
  components?: ComponentSpec[]; // Alternative property name for children
}

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

  /**
   * Creates a new ComponentResolver instance
   * @param registry - Component registry to use for resolution
   */
  constructor(registry: ComponentRegistry) {
    this.registry = registry;
  }

  /**
   * Resolves all components for a given component specification
   * @param spec - Root component specification
   * @param namespace - Namespace for component resolution
   * @returns Map of component names to resolved components
   */
  resolveComponents(spec: ComponentSpec, namespace: string = 'Global'): ResolvedComponents {
    const resolved: ResolvedComponents = {};
    
    // Resolve the component hierarchy
    this.resolveComponentHierarchy(spec, resolved, namespace);
    
    return resolved;
  }

  /**
   * Recursively resolves a component hierarchy
   * @param spec - Component specification
   * @param resolved - Map to store resolved components
   * @param namespace - Namespace for resolution
   * @param visited - Set of visited component names to prevent cycles
   */
  private resolveComponentHierarchy(
    spec: ComponentSpec,
    resolved: ResolvedComponents,
    namespace: string,
    visited: Set<string> = new Set()
  ): void {
    // Prevent circular dependencies
    if (visited.has(spec.componentName)) {
      console.warn(`Circular dependency detected for component: ${spec.componentName}`);
      return;
    }
    visited.add(spec.componentName);

    // Try to get component from registry
    const component = this.registry.get(spec.componentName, namespace);
    if (component) {
      resolved[spec.componentName] = component;
    }

    // Process child components (handle both property names)
    const children = spec.childComponents || spec.components || [];
    for (const child of children) {
      this.resolveComponentHierarchy(child, resolved, namespace, visited);
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
    if (checked.has(spec.componentName)) return;
    checked.add(spec.componentName);

    // Check if component exists in registry
    if (!this.registry.has(spec.componentName, namespace)) {
      missing.push(spec.componentName);
    }

    // Check children
    const children = spec.childComponents || spec.components || [];
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
    if (visited.has(spec.componentName)) return;
    visited.add(spec.componentName);

    const children = spec.childComponents || spec.components || [];
    const dependencies = children.map(child => child.componentName);
    
    graph.set(spec.componentName, dependencies);

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
    if (visited.has(spec.componentName)) return;
    visited.add(spec.componentName);

    collected.push(spec);

    const children = spec.childComponents || spec.components || [];
    for (const child of children) {
      this.collectComponentSpecs(child, collected, visited);
    }
  }
}