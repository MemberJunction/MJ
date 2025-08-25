/**
 * @fileoverview Component hierarchy registration utilities for MemberJunction React Runtime.
 * Provides functionality to register a hierarchy of components from Skip component specifications.
 * @module @memberjunction/react-runtime/hierarchy
 */

import { 
  CompilationResult,
  CompileOptions,
  RuntimeContext
} from '../types';
import { ComponentCompiler } from '../compiler';
import { ComponentRegistry } from '../registry';

import { ComponentSpec, ComponentStyles } from '@memberjunction/interactive-component-types';
import { UserInfo } from '@memberjunction/core';
import { ComponentLibraryEntity } from '@memberjunction/core-entities';

/**
 * Result of a hierarchy registration operation
 */
export interface HierarchyRegistrationResult {
  success: boolean;
  registeredComponents: string[];
  errors: ComponentRegistrationError[];
  warnings: string[];
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
  allLibraries: ComponentLibraryEntity[];
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
   * Registers a complete component hierarchy from a root specification
   * @param rootSpec - The root component specification
   * @param options - Registration options
   * @returns Registration result with details about success/failures
   */
  async registerHierarchy(
    rootSpec: ComponentSpec,
    options: HierarchyRegistrationOptions
  ): Promise<HierarchyRegistrationResult> {
    const {
      styles,
      namespace = 'Global',
      version = 'v1',
      continueOnError = true,
      allowOverride = true
    } = options;

    console.log('🌳 ComponentHierarchyRegistrar.registerHierarchy:', {
      rootComponent: rootSpec.name,
      hasLibraries: !!(rootSpec.libraries && rootSpec.libraries.length > 0),
      libraryCount: rootSpec.libraries?.length || 0,
      libraries: rootSpec.libraries?.map(l => l.name)
    });

    const registeredComponents: string[] = [];
    const errors: ComponentRegistrationError[] = [];
    const warnings: string[] = [];

    // Register the root component
    const rootResult = await this.registerSingleComponent(
      rootSpec,
      { styles, namespace, version, allowOverride, allLibraries: options.allLibraries }
    );

    if (rootResult.success) {
      registeredComponents.push(rootSpec.name);
    } else {
      errors.push(rootResult.error!);
      if (!continueOnError) {
        return { success: false, registeredComponents, errors, warnings };
      }
    }

    // Register child components recursively
    const childComponents = rootSpec.dependencies || [];
    if (childComponents.length > 0) {
      const childResult = await this.registerChildComponents(
        childComponents,
        { styles, namespace, version, continueOnError, allowOverride, allLibraries: options.allLibraries },
        registeredComponents,
        errors,
        warnings
      );
    }

    return {
      success: errors.length === 0,
      registeredComponents,
      errors,
      warnings
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
      allLibraries: ComponentLibraryEntity[];
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

      // Compile the component
      const compileOptions: CompileOptions = {
        componentName: spec.name,
        componentCode: spec.code,
        styles,
        libraries: spec.libraries, // Pass along library dependencies from the spec
        dependencies: spec.dependencies, // Pass along child component dependencies
        allLibraries: options.allLibraries
      };

      console.log(`🔧 Compiling component ${spec.name} with libraries:`, {
        libraryCount: spec.libraries?.length || 0,
        libraries: spec.libraries?.map(l => ({ name: l.name, globalVariable: l.globalVariable }))
      });

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

      // Create component factory
      const componentFactory = compilationResult.component!.component(this.runtimeContext, styles);

      // Register the component
      this.registry.register(
        spec.name,
        componentFactory.component,
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