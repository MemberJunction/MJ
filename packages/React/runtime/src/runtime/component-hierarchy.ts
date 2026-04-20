/**
 * @fileoverview Component hierarchy registration utilities for MemberJunction React Runtime.
 * Provides functionality to register a hierarchy of components from Skip component specifications.
 * @module @memberjunction/react-runtime/hierarchy
 */

import {
  CompilationResult,
  CompileOptions,
  RuntimeContext,
  CompiledComponent
} from '../types';
import { ComponentCompiler } from '../compiler';
import { ComponentRegistry } from '../registry';

import { ComponentSpec, ComponentStyles } from '@memberjunction/interactive-component-types';
import { UserInfo, Metadata, LogStatus, GetProductionStatus } from '@memberjunction/core';
import { MJComponentLibraryEntity } from '@memberjunction/core-entities';

/**
 * Result of a hierarchy registration operation
 */
export interface HierarchyRegistrationResult {
  success: boolean;
  registeredComponents: string[];
  errors: ComponentRegistrationError[];
  warnings: string[];
  /** The fully resolved component specification with all dependencies and libraries */
  resolvedSpec?: ComponentSpec;
}

/**
 * Error information for component registration
 */
export interface ComponentRegistrationError {
  componentName: string;
  error: string;
  phase: 'compilation' | 'registration' | 'validation';
}

/**
 * Options for hierarchy registration
 */
export interface HierarchyRegistrationOptions {
  /** Component styles to apply to all components */
  styles?: ComponentStyles;
  /** Namespace for component registration */
  namespace?: string;
  /** Version for component registration */
  version?: string;
  /** Whether to continue on errors */
  continueOnError?: boolean;
  /** Whether to override existing components */
  allowOverride?: boolean;
  /**
   * Required, metadata for all possible libraries allowed by the system
   */
  allLibraries: MJComponentLibraryEntity[];
  debug?: boolean;
  /** Optional user context for fetching from external registries */
  contextUser?: UserInfo;
}

/**
 * Utility class for registering component hierarchies
 */
export class ComponentHierarchyRegistrar {
  constructor(
    private compiler: ComponentCompiler,
    private registry: ComponentRegistry,
    private runtimeContext: RuntimeContext
  ) {}
  
  /**
   * Fetches a component specification from an external registry
   */
  private async fetchExternalComponent(
    spec: ComponentSpec,
    contextUser?: UserInfo
  ): Promise<ComponentSpec | null> {
    try {
      const provider = Metadata?.Provider;
      if (!provider || !(provider as any).ExecuteGQL) {
        console.warn('⚠️ [ComponentHierarchyRegistrar] No GraphQL provider available for external registry fetch');
        return null;
      }
      
      // Dynamically import the GraphQL client to avoid circular dependencies
      const { GraphQLComponentRegistryClient } = await import('@memberjunction/graphql-dataprovider');
      const graphQLClient = new GraphQLComponentRegistryClient(provider as any);
      
      const fullSpec = await graphQLClient.GetRegistryComponent({
        registryName: spec.registry!,
        namespace: spec.namespace || 'Global',
        name: spec.name,
        version: spec.version || 'latest'
      });

      if (fullSpec && fullSpec.code) {
        if (!GetProductionStatus()) {
          LogStatus(`✅ [ComponentHierarchyRegistrar] Fetched external component ${spec.name} with code (${fullSpec.code.length} chars)`);
        }
        return fullSpec;
      } else {
        console.warn(`⚠️ [ComponentHierarchyRegistrar] Failed to fetch external component ${spec.name} or no code`);
        return null;
      }
    } catch (error) {
      console.error(`❌ [ComponentHierarchyRegistrar] Error fetching external component ${spec.name}:`, error);
      return null;
    }
  }

  /**
   * Registers a complete component hierarchy from a root specification
   * @param rootSpec - The root component specification
   * @param options - Registration options
   * @returns Registration result with details about success/failures
   */
  async registerHierarchy(
    rootSpec: ComponentSpec,
    options: HierarchyRegistrationOptions
  ): Promise<HierarchyRegistrationResult> {
    // If this is an external registry component without code, fetch it first
    let resolvedRootSpec = rootSpec;
    if (rootSpec.location === 'registry' && rootSpec.registry && !rootSpec.code) {
      if (!GetProductionStatus()) {
        LogStatus(`🌐 [ComponentHierarchyRegistrar] Fetching external registry component: ${rootSpec.registry}/${rootSpec.name}`);
      }
      resolvedRootSpec = await this.fetchExternalComponent(rootSpec, options.contextUser) || rootSpec;
    }
    const {
      styles,
      namespace = 'Global',
      version = 'v1',
      continueOnError = true,
      allowOverride = true
    } = options;

    const registeredComponents: string[] = [];
    const errors: ComponentRegistrationError[] = [];
    const warnings: string[] = [];

    if (!GetProductionStatus()) {
      LogStatus('🌳 ComponentHierarchyRegistrar.registerHierarchy:', undefined, {
        rootComponent: resolvedRootSpec.name,
        hasLibraries: !!(resolvedRootSpec.libraries && resolvedRootSpec.libraries.length > 0),
        libraryCount: resolvedRootSpec.libraries?.length || 0
      });
    }

    // PHASE 1: Compile all components first (but defer factory execution)
    const compiledMap = new Map<string, CompiledComponent>();
    const specMap = new Map<string, ComponentSpec>();
    const allLoadedLibraries = new Map<string, any>(); // Track all loaded libraries
    
    // Helper to compile a component without calling its factory
    const compileOnly = async (spec: ComponentSpec): Promise<{ success: boolean; error?: ComponentRegistrationError }> => {
      if (!spec.code) return { success: true };
      
      try {
        // Filter out invalid library entries before compilation
        const validLibraries = spec.libraries?.filter(lib => {
          if (!lib || typeof lib !== 'object') return false;
          if (!lib.name || lib.name === 'unknown' || lib.name === 'null' || lib.name === 'undefined') return false;
          if (!lib.globalVariable || lib.globalVariable === 'undefined' || lib.globalVariable === 'null') return false;
          return true;
        });
        
        const compileOptions: CompileOptions = {
          componentName: spec.name,
          componentCode: spec.code,
          styles,
          libraries: validLibraries,
          dependencies: spec.dependencies,
          allLibraries: options.allLibraries
        };
        
        const result = await this.compiler.compile(compileOptions);
        if (result.success && result.component) {
          compiledMap.set(spec.name, result.component);
          specMap.set(spec.name, spec);
          
          // Extract and accumulate loaded libraries from the compilation
          if (result.loadedLibraries) {
            result.loadedLibraries.forEach((value, key) => {
              if (!allLoadedLibraries.has(key)) {
                allLoadedLibraries.set(key, value);
                if (!GetProductionStatus()) {
                  LogStatus(`📚 [registerHierarchy] Added library ${key} to accumulated libraries`);
                }
              }
            });
          }
          
          return { success: true };
        } else {
          return {
            success: false,
            error: {
              componentName: spec.name,
              error: result.error?.message || 'Unknown compilation error',
              phase: 'compilation'
            }
          };
        }
      } catch (error) {
        return {
          success: false,
          error: {
            componentName: spec.name,
            error: error instanceof Error ? error.message : String(error),
            phase: 'compilation'
          }
        };
      }
    };
    
    // Compile all components in hierarchy
    const compileQueue = [resolvedRootSpec];
    const visited = new Set<string>();
    
    while (compileQueue.length > 0) {
      let spec = compileQueue.shift()!;
      if (visited.has(spec.name)) continue;
      visited.add(spec.name);
      
      // If this is an external registry component without code, fetch it first
      if (spec.location === 'registry' && spec.registry && !spec.code) {
        const fetched = await this.fetchExternalComponent(spec, options.contextUser);
        if (fetched) {
          spec = fetched;
        } else {
          console.warn(`⚠️ [ComponentHierarchyRegistrar] Could not fetch external component ${spec.name}, skipping`);
          continue;
        }
      }
      
      const result = await compileOnly(spec);
      if (!result.success) {
        errors.push(result.error!);
        if (!continueOnError) {
          return { success: false, registeredComponents, errors, warnings, resolvedSpec: resolvedRootSpec };
        }
      }
      
      if (spec.dependencies) {
        compileQueue.push(...spec.dependencies);
      }
    }
    
    // Add all accumulated libraries to runtime context
    if (allLoadedLibraries.size > 0) {
      if (!this.runtimeContext.libraries) {
        this.runtimeContext.libraries = {};
      }
      allLoadedLibraries.forEach((value, key) => {
        this.runtimeContext.libraries![key] = value;
        if (!GetProductionStatus()) {
          LogStatus(`✅ [registerHierarchy] Added ${key} to runtime context libraries`);
        }
      });
    }
    
    // PHASE 2: Execute all factories with components available
    for (const [name, compiled] of compiledMap) {
      const spec = specMap.get(name)!;
      
      // Build components object from all registered components
      const components: Record<string, any> = {};
      for (const [depName, depCompiled] of compiledMap) {
        // Call factory to get ComponentObject, then extract React component
        const depObject = depCompiled.factory(this.runtimeContext, styles);
        components[depName] = depObject.component;
      }
      
      // Now call factory with components available
      const componentObject = compiled.factory(this.runtimeContext, styles, components);
      
      // Register in registry
      this.registry.register(
        spec.name,
        componentObject,
        spec.namespace || namespace,
        version
      );
      
      registeredComponents.push(spec.name);
    }

    return {
      success: errors.length === 0,
      registeredComponents,
      errors,
      warnings,
      resolvedSpec: resolvedRootSpec
    };
  }

  /**
   * Registers a single component from a specification
   * @param spec - Component specification
   * @param options - Registration options
   * @returns Registration result for this component
   */
  async registerSingleComponent(
    spec: ComponentSpec,
    options: {
      styles?: ComponentStyles;
      namespace?: string;
      version?: string;
      allowOverride?: boolean;
      allLibraries: MJComponentLibraryEntity[];
    }
  ): Promise<{ success: boolean; error?: ComponentRegistrationError }> {
    const { styles, namespace = 'Global', version = 'v1', allowOverride = true } = options;

    try {
      // Skip if no component code
      if (!spec.code) {
        return {
          success: true,
          error: undefined
        };
      }

      // Check if component already exists
      const existingComponent = this.registry.get(spec.name, namespace, version);
      if (existingComponent && !allowOverride) {
        return {
          success: false,
          error: {
            componentName: spec.name,
            error: `Component already registered in ${namespace}/${version}`,
            phase: 'registration'
          }
        };
      }

      // Filter out invalid library entries before compilation
      const validLibraries = spec.libraries?.filter(lib => {
        if (!lib || typeof lib !== 'object') return false;
        if (!lib.name || lib.name === 'unknown' || lib.name === 'null' || lib.name === 'undefined') return false;
        if (!lib.globalVariable || lib.globalVariable === 'undefined' || lib.globalVariable === 'null') return false;
        return true;
      });

      if (!GetProductionStatus()) {
        LogStatus(`🔧 Compiling component ${spec.name} with libraries:`, undefined, {
          originalCount: spec.libraries?.length || 0,
          filteredCount: validLibraries?.length || 0,
          libraries: validLibraries?.map(l => l.name) || []
        });
      }

      // Compile the component
      const compileOptions: CompileOptions = {
        componentName: spec.name,
        componentCode: spec.code,
        styles,
        libraries: validLibraries, // Pass along filtered library dependencies
        dependencies: spec.dependencies, // Pass along child component dependencies
        allLibraries: options.allLibraries
      };

      const compilationResult = await this.compiler.compile(compileOptions);

      if (!compilationResult.success) {
        return {
          success: false,
          error: {
            componentName: spec.name,
            error: compilationResult.error?.message || 'Unknown compilation error',
            phase: 'compilation'
          }
        };
      }

      // Add loaded libraries to runtime context
      if (compilationResult.loadedLibraries && compilationResult.loadedLibraries.size > 0) {
        if (!this.runtimeContext.libraries) {
          this.runtimeContext.libraries = {};
        }
        compilationResult.loadedLibraries.forEach((value, key) => {
          this.runtimeContext.libraries![key] = value;
          if (!GetProductionStatus()) {
            LogStatus(`✅ [registerSingleComponent] Added ${key} to runtime context libraries`);
          }
        });
      }

      // Call the factory to create the ComponentObject
      // IMPORTANT: We don't pass components here because child components may not be registered yet
      // Components are resolved later when the component is actually rendered
      if (!GetProductionStatus()) {
        LogStatus(`🏭 Calling factory for ${spec.name} with runtime context:`, undefined, {
          hasReact: !!this.runtimeContext.React,
          hasReactDOM: !!this.runtimeContext.ReactDOM,
          libraryCount: Object.keys(this.runtimeContext.libraries || {}).length
        });
      }
      const componentObject = compilationResult.component!.factory(this.runtimeContext, styles);

      // Register the full ComponentObject (not just the React component)
      this.registry.register(
        spec.name,
        componentObject,
        spec.namespace || namespace,
        version
      );

      return { success: true };

    } catch (error) {
      return {
        success: false,
        error: {
          componentName: spec.name,
          error: error instanceof Error ? error.message : String(error),
          phase: 'registration'
        }
      };
    }
  }

  /**
   * Recursively registers child components
   * @param children - Array of child component specifications
   * @param options - Registration options
   * @param registeredComponents - Array to track registered components
   * @param errors - Array to collect errors
   * @param warnings - Array to collect warnings
   */
  private async registerChildComponents(
    children: ComponentSpec[],
    options: HierarchyRegistrationOptions,
    registeredComponents: string[],
    errors: ComponentRegistrationError[],
    warnings: string[]
  ): Promise<void> {
    for (const child of children) {
      // Register this child
      const childResult = await this.registerSingleComponent(child, {
        styles: options.styles,
        namespace: options.namespace,
        version: options.version,
        allowOverride: options.allowOverride,
        allLibraries: options.allLibraries
      });

      if (childResult.success) {
        if (child.code) {
          registeredComponents.push(child.name);
        }
      } else {
        errors.push(childResult.error!);
        if (!options.continueOnError) {
          return;
        }
      }

      // Register nested children recursively
      const nestedChildren = child.dependencies || [];
      if (nestedChildren.length > 0) {
        await this.registerChildComponents(
          nestedChildren,
          options,
          registeredComponents,
          errors,
          warnings
        );
      }
    }
  }
}

/**
 * Convenience function to register a component hierarchy
 * @param rootSpec - The root component specification
 * @param compiler - Component compiler instance
 * @param registry - Component registry instance
 * @param runtimeContext - Runtime context with React and other libraries
 * @param options - Registration options
 * @returns Registration result
 */
export async function registerComponentHierarchy(
  rootSpec: ComponentSpec,
  compiler: ComponentCompiler,
  registry: ComponentRegistry,
  runtimeContext: RuntimeContext,
  options: HierarchyRegistrationOptions
): Promise<HierarchyRegistrationResult> {
  const registrar = new ComponentHierarchyRegistrar(compiler, registry, runtimeContext);
  return registrar.registerHierarchy(rootSpec, options);
}

/**
 * Validates a component specification before registration
 * @param spec - Component specification to validate
 * @returns Array of validation errors (empty if valid)
 */
export function validateComponentSpec(spec: ComponentSpec): string[] {
  const errors: string[] = [];

  if (!spec.name) {
    errors.push('Component specification must have a name');
  }

  // If componentCode is provided, do basic validation
  if (spec.code) {
    if (typeof spec.code !== 'string') {
      errors.push(`Component code for ${spec.name} must be a string`);
    }
    if (spec.code.trim().length === 0) {
      errors.push(`Component code for ${spec.name} cannot be empty`);
    }
  }

  // Validate child components recursively
  const children = spec.dependencies || [];
  children.forEach((child, index) => {
    const childErrors = validateComponentSpec(child);
    childErrors.forEach(error => {
      errors.push(`Child ${index} (${child.name || 'unnamed'}): ${error}`);
    });
  });

  return errors;
}

/**
 * Flattens a component hierarchy into a list of all components
 * @param rootSpec - The root component specification
 * @returns Array of all component specifications in the hierarchy
 */
export function flattenComponentHierarchy(rootSpec: ComponentSpec): ComponentSpec[] {
  const components: ComponentSpec[] = [rootSpec];
  
  const children = rootSpec.dependencies || [];
  children.forEach(child => {
    components.push(...flattenComponentHierarchy(child));
  });

  return components;
}

/**
 * Counts the total number of components in a hierarchy
 * @param rootSpec - The root component specification
 * @param includeEmpty - Whether to include components without code
 * @returns Total component count
 */
export function countComponentsInHierarchy(
  rootSpec: ComponentSpec,
  includeEmpty: boolean = false
): number {
  let count = 0;
  
  if (includeEmpty || rootSpec.code) {
    count = 1;
  }

  const children = rootSpec.dependencies || [];
  children.forEach(child => {
    count += countComponentsInHierarchy(child, includeEmpty);
  });

  return count;
}