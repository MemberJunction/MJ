/**
 * Example showing how the Angular component would migrate to use the new hierarchy registration
 */

import {
  ComponentCompiler,
  ComponentRegistry,
  ComponentHierarchyRegistrar,
  type RuntimeContext,
  type ComponentStyles
} from '@memberjunction/react-runtime';

/**
 * Example of how the Angular component's registerComponentHierarchy method
 * would be replaced with the new react-runtime functionality
 */
export class AngularComponentMigrationExample {
  private compiler: ComponentCompiler;
  private registry: ComponentRegistry;
  private runtimeContext: RuntimeContext;
  
  constructor(
    compiler: ComponentCompiler,
    registry: ComponentRegistry,
    runtimeContext: RuntimeContext
  ) {
    this.compiler = compiler;
    this.registry = registry;
    this.runtimeContext = runtimeContext;
  }
  
  /**
   * OLD METHOD (from Angular component) - to be replaced
   */
  private async oldRegisterComponentHierarchy(component: any, styles?: any) {
    const errors: string[] = [];
    
    // Register main component
    try {
      const result = await this.compileComponent({
        componentName: component.componentName,
        componentCode: component.componentCode,
        styles
      });
      
      if (result.success && result.component) {
        const componentFactory = result.component.component(this.runtimeContext, styles);
        
        this.registry.register(
          component.componentName,
          componentFactory.component,
          'Global',
          'v1'
        );
      } else {
        errors.push(`Failed to compile ${component.componentName}: ${result.error?.message}`);
      }
    } catch (error) {
      errors.push(`Failed to register ${component.componentName}: ${error}`);
    }
    
    // Register child components
    if (component.childComponents?.length) {
      await this.oldRegisterChildComponents(component.childComponents, errors, styles);
    }
    
    if (errors.length > 0) {
      throw new Error(`Component registration failed: ${errors.join(', ')}`);
    }
  }
  
  private async oldRegisterChildComponents(children: any[], errors: string[], styles?: any) {
    // ... old implementation
  }
  
  private async compileComponent(options: any) {
    // Placeholder for the old compile method
    return this.compiler.compile(options);
  }
  
  /**
   * NEW METHOD - using react-runtime's hierarchy registration
   */
  async registerComponentHierarchy(component: any, styles?: ComponentStyles) {
    // Create the hierarchy registrar
    const registrar = new ComponentHierarchyRegistrar(
      this.compiler,
      this.registry,
      this.runtimeContext
    );
    
    // Register the entire hierarchy
    const result = await registrar.registerHierarchy(component, {
      styles,
      namespace: 'Global',
      version: 'v1',
      continueOnError: true,
      allowOverride: true
    });
    
    // Handle errors the same way as the old implementation
    if (!result.success) {
      const errorMessages = result.errors.map(e => 
        `Failed to ${e.phase} ${e.componentName}: ${e.error}`
      );
      throw new Error(`Component registration failed: ${errorMessages.join(', ')}`);
    }
    
    return result;
  }
  
  /**
   * Example of how the Angular component would use this
   */
  async initializeComponent(rootSpec: any, styles?: any) {
    try {
      // Use the new hierarchy registration
      const result = await this.registerComponentHierarchy(rootSpec, styles);
      
      console.log('Successfully registered components:', result.registeredComponents);
      
      // Continue with component initialization...
      // Compile main component, create React root, etc.
      
    } catch (error) {
      console.error('Failed to initialize React component:', error);
      // Handle error...
    }
  }
}

/**
 * Migration guide for Angular component
 * 
 * 1. Remove the private registerComponentHierarchy and registerChildComponents methods
 * 
 * 2. Import the new functionality from react-runtime:
 *    import { ComponentHierarchyRegistrar } from '@memberjunction/react-runtime';
 * 
 * 3. Replace the call to this.registerComponentHierarchy() with:
 *    const registrar = new ComponentHierarchyRegistrar(
 *      this.adapter.getCompiler(),
 *      this.adapter.getRegistry(), 
 *      this.adapter.getRuntimeContext()
 *    );
 *    const result = await registrar.registerHierarchy(this.component, {
 *      styles: this.styles,
 *      namespace: 'Global',
 *      version: 'v1'
 *    });
 * 
 * 4. Handle the result:
 *    if (!result.success) {
 *      throw new Error(`Component registration failed: ${result.errors.map(e => e.error).join(', ')}`);
 *    }
 */