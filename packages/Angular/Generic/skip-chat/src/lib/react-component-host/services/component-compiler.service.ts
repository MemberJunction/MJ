import { Injectable } from '@angular/core';
import { ReactBridgeService } from './react-bridge.service';
import { SkipComponentStyles } from '@memberjunction/skip-types';
import { DEFAULT_STYLES } from '../default-styles';

export interface CompiledComponent {
  component: any;
  print?: () => void;
  refresh?: (data: any) => void;
}

/**
 * Service to compile React components from string code
 */
@Injectable({ providedIn: 'root' })
export class ComponentCompilerService {
  constructor(private reactBridge: ReactBridgeService) {}

  /**
   * Compile a React component from source code
   */
  async compileComponent(
    componentName: string,
    componentCode: string,
    styles?: Partial<SkipComponentStyles>
  ): Promise<CompiledComponent> {
    // Get React context
    const context = await this.reactBridge.getReactContext();
    const { React, libraries } = context;

    // Wrap component code in factory function
    const wrappedCode = this.wrapComponentCode(componentCode, componentName);

    // Transpile JSX to JavaScript
    const transpiledCode = this.reactBridge.transpileJSX(wrappedCode, `${componentName}.jsx`);

    // Create the component factory
    const createComponent = this.createComponentFactory(transpiledCode);

    // Create styles object
    const mergedStyles = { ...DEFAULT_STYLES, ...styles };

    // Execute factory to get the createComponent function
    const createComponentFn = createComponent(
      React,
      context.ReactDOM,
      React.useState,
      React.useEffect,
      React.useCallback,
      this.createStateUpdater,
      libraries,
      mergedStyles,
      console
    );

    // Now call the createComponent function to get the actual component result
    const componentResult = createComponentFn(
      React,
      context.ReactDOM,
      React.useState,
      React.useEffect,
      React.useCallback,
      this.createStateUpdater,
      libraries,
      mergedStyles,
      console
    );

    return componentResult;
  }

  /**
   * Wrap component code in a factory function
   */
  private wrapComponentCode(componentCode: string, componentName: string): string {
    return `function createComponent(React, ReactDOM, useState, useEffect, useCallback, createStateUpdater, libraries, styles, console) {
      ${componentCode}
      
      return {
        component: ${componentName},
        print: function() { window.print(); },
        refresh: function(data) { /* Managed by Angular host */ }
      };
    }`;
  }

  /**
   * Create component factory function
   */
  private createComponentFactory(transpiledCode: string): Function {
    try {
      return new Function(
        'React', 'ReactDOM', 'useState', 'useEffect', 'useCallback', 
        'createStateUpdater', 'libraries', 'styles', 'console',
        `${transpiledCode}; return createComponent;`
      );
    } catch (error) {
      throw new Error(`Failed to create component factory: ${error}`);
    }
  }

  /**
   * State updater utility for nested components
   */
  private createStateUpdater(statePath: string, parentStateUpdater: Function): Function {
    return (componentStateUpdate: any) => {
      if (!statePath) {
        // Root component
        parentStateUpdater(componentStateUpdate);
      } else {
        // Sub-component - bubble up with path context
        const pathParts = statePath.split('.');
        const componentKey = pathParts[pathParts.length - 1];
        
        parentStateUpdater({
          [componentKey]: componentStateUpdate
        });
      }
    };
  }
}