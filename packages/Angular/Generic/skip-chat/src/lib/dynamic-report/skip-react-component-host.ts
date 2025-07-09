import { SimpleChanges, EventEmitter, ElementRef, Injectable } from '@angular/core';
import { SkipComponentCallbacks, SkipComponentRootSpec, SkipComponentStyles, SkipComponentUtilities, SkipComponentChildSpec } from '@memberjunction/skip-types';
import { LogError } from '@memberjunction/core';
import { BaseSingleton } from '@memberjunction/global';

/**
 * CDN URLs for external dependencies
 * These can be configured via environment variables in the future
 */
const CDN_URLS = {
  // Core React dependencies
  BABEL_STANDALONE: 'https://unpkg.com/@babel/standalone@7/babel.min.js',
  REACT: 'https://unpkg.com/react@18/umd/react.development.js',
  REACT_DOM: 'https://unpkg.com/react-dom@18/umd/react-dom.development.js',
  
  // Ant Design dependencies
  DAYJS: 'https://unpkg.com/dayjs@1.11.10/dayjs.min.js',
  
  // UI Libraries - Using UMD builds that work with global React
  ANTD_JS: 'https://unpkg.com/antd@5.12.8/dist/antd.js',
  ANTD_CSS: 'https://unpkg.com/antd@5.12.8/dist/reset.css',
  REACT_BOOTSTRAP_JS: 'https://unpkg.com/react-bootstrap@2.9.1/dist/react-bootstrap.js',
  BOOTSTRAP_CSS: 'https://cdn.jsdelivr.net/npm/bootstrap@5.3.2/dist/css/bootstrap.min.css',
  
  // Data Visualization
  D3_JS: 'https://cdnjs.cloudflare.com/ajax/libs/d3/7.8.5/d3.min.js',
  CHART_JS: 'https://cdnjs.cloudflare.com/ajax/libs/Chart.js/4.4.0/chart.umd.js',
  
  // Utilities
  LODASH_JS: 'https://cdnjs.cloudflare.com/ajax/libs/lodash.js/4.17.21/lodash.min.js'
};

/**
 * Component metadata for component registry system
 */
export interface ComponentMetadata {
  /** List of child component names required by this component */
  requiredChildComponents: string[];
  /** Context for component resolution (e.g., 'CRM', 'Finance', 'Standard') */
  componentContext: string;
  /** Version of the component specification */
  version: string;
}

/**
 * Component registration entry with metadata
 */
interface ComponentRegistryEntry {
  component: any;
  metadata?: {
    context?: string;
    version?: string;
    description?: string;
  };
}

/**
 * Global component registry service for managing reusable React components
 * Extends BaseSingleton to ensure a truly global singleton instance across
 * the entire application, even if this code is loaded multiple times.
 */
export class GlobalComponentRegistry extends BaseSingleton<GlobalComponentRegistry> {
  private components = new Map<string, ComponentRegistryEntry>();
  
  protected constructor() {
    super(); // Call parent constructor to register in global store
  }
  
  /**
   * Get the singleton instance
   */
  public static get Instance(): GlobalComponentRegistry {
    return super.getInstance<GlobalComponentRegistry>();
  }
  
  /**
   * Register a component with a simple key
   */
  public register(key: string, component: any): void {
    this.components.set(key, { component });
  }
  
  /**
   * Get a component by key
   */
  public get(key: string): any {
    const entry = this.components.get(key);
    return entry?.component;
  }
  
  /**
   * Register a component with metadata for versioning and context
   */
  public registerWithMetadata(
    name: string, 
    context: string, 
    version: string, 
    component: any,
    description?: string
  ): void {
    const key = this.createKey(name, context, version);
    this.components.set(key, {
      component,
      metadata: { context, version, description }
    });
    
    // Also register without version for backwards compatibility
    const contextKey = `${name}_${context}`;
    if (!this.components.has(contextKey)) {
      this.register(contextKey, component);
    }
  }
  
  /**
   * Create a standardized key from component metadata
   */
  private createKey(name: string, context: string, version: string): string {
    return `${name}_${context}_${version}`;
  }
  
  /**
   * Get all registered component keys (useful for debugging)
   */
  public getRegisteredKeys(): string[] {
    return Array.from(this.components.keys());
  }
  
  /**
   * Clear all registered components
   */
  public clear(): void {
    this.components.clear();
  }
  
  /**
   * Check if a component is registered
   */
  public has(key: string): boolean {
    return this.components.has(key);
  }
  
  /**
   * Get component with fallback options
   */
  public getWithFallback(name: string, context: string, version: string): any {
    // Try exact match first
    let key = this.createKey(name, context, version);
    if (this.has(key)) {
      return this.get(key);
    }
    
    // Try without version
    key = `${name}_${context}`;
    if (this.has(key)) {
      return this.get(key);
    }
    
    // Try global version
    key = `${name}_Global`;
    if (this.has(key)) {
      return this.get(key);
    }
    
    // Try just the name
    if (this.has(name)) {
      return this.get(name);
    }
    
    return null;
  }
  
  /**
   * Remove a component from the registry
   */
  public remove(key: string): void {
    this.components.delete(key);
  }
}

/**
 * Configuration for a React component to be hosted in Angular
 */
export interface ReactComponentConfig {
  component: SkipComponentRootSpec 
  
  /** The HTML container element where the React component will be rendered */
  container: HTMLElement;
  
  /** Data to pass to the component (e.g., entities, lists, etc.) */
  data?: any;
  
  /** Callbacks for component lifecycle events */
  callbacks?: SkipComponentCallbacks;
  
  /** Initial state for the component */
  initialState?: any;
  
  /** Utilities to pass to the component */
  utilities?: SkipComponentUtilities;
  
  /** Styles to pass to the component */
  styles?: SkipComponentStyles;
  
  /** Component metadata for registry integration */
  metadata?: ComponentMetadata;
}

/**
 * Interface for component factory function that's generated by Skip
 */
export interface ComponentFactoryResult {
  component: any; // React component
  print?: () => void;
  refresh?: (data?: any) => void;
}

/**
 * Default styles that match the Skip design system
 */
const DEFAULT_STYLES: SkipComponentStyles = {
  colors: {
    // Primary colors - modern purple/blue gradient feel
    primary: '#5B4FE9',
    primaryHover: '#4940D4',
    primaryLight: '#E8E6FF',
    
    // Secondary colors - sophisticated gray
    secondary: '#64748B',
    secondaryHover: '#475569',
    
    // Status colors
    success: '#10B981',
    successLight: '#D1FAE5',
    warning: '#F59E0B',
    warningLight: '#FEF3C7',
    error: '#EF4444',
    errorLight: '#FEE2E2',
    info: '#3B82F6',
    infoLight: '#DBEAFE',
    
    // Base colors
    background: '#FFFFFF',
    surface: '#F8FAFC',
    surfaceHover: '#F1F5F9',
    
    // Text colors with better contrast
    text: '#1E293B',
    textSecondary: '#64748B',
    textTertiary: '#94A3B8',
    textInverse: '#FFFFFF',
    
    // Border colors
    border: '#E2E8F0',
    borderLight: '#F1F5F9',
    borderFocus: '#5B4FE9',
    
    // Shadows (as color strings for easy use)
    shadow: 'rgba(0, 0, 0, 0.05)',
    shadowMedium: 'rgba(0, 0, 0, 0.1)',
    shadowLarge: 'rgba(0, 0, 0, 0.15)',
  },
  spacing: {
    xs: '4px',
    sm: '8px',
    md: '16px',
    lg: '24px',
    xl: '32px',
    xxl: '48px',
    xxxl: '64px',
  },
  typography: {
    fontFamily: '-apple-system, BlinkMacSystemFont, "Inter", "Segoe UI", Roboto, sans-serif',
    fontSize: {
      xs: '11px',
      sm: '12px',
      md: '14px',
      lg: '16px',
      xl: '20px',
      xxl: '24px',
      xxxl: '32px',
    },
    fontWeight: {
      light: '300',
      regular: '400',
      medium: '500',
      semibold: '600',
      bold: '700',
    },
    lineHeight: {
      tight: '1.25',
      normal: '1.5',
      relaxed: '1.75',
    },
  },
  borders: {
    radius: {
      sm: '6px',
      md: '8px',
      lg: '12px',
      xl: '16px',
      full: '9999px',
    },
    width: {
      thin: '1px',
      medium: '2px',
      thick: '3px',
    },
  },
  shadows: {
    sm: '0 1px 2px 0 rgba(0, 0, 0, 0.05)',
    md: '0 4px 6px -1px rgba(0, 0, 0, 0.1), 0 2px 4px -1px rgba(0, 0, 0, 0.06)',
    lg: '0 10px 15px -3px rgba(0, 0, 0, 0.1), 0 4px 6px -2px rgba(0, 0, 0, 0.05)',
    xl: '0 20px 25px -5px rgba(0, 0, 0, 0.1), 0 10px 10px -5px rgba(0, 0, 0, 0.04)',
    inner: 'inset 0 2px 4px 0 rgba(0, 0, 0, 0.06)',
  },
  transitions: {
    fast: '150ms ease-in-out',
    normal: '250ms ease-in-out',
    slow: '350ms ease-in-out',
  },
  overflow: 'auto'
};

/**
 * Host class for integrating Skip-generated React components into Angular applications.
 * This class handles the lifecycle management, state synchronization, and communication
 * between React components and their Angular host containers.
 */
export class SkipReactComponentHost {
  private componentResult: ComponentFactoryResult | null = null;
  private reactRoot: any = null;
  private componentContainer: HTMLElement | null = null;
  private destroyed = false;
  private currentState: any = {};

  // React and ReactDOM references (will be loaded dynamically)
  private React: any;
  private ReactDOM: any;

  // Static style system that's created once and reused
  private static cachedStyleSystem: SkipComponentStyles | null = null;

  // Static cached libraries
  private static cachedLibraries: any = null;
  private static libraryLoadPromise: Promise<any> | null = null;

  constructor(private config: ReactComponentConfig) {
    // Auto-populate metadata if not provided
    if (!this.config.metadata) {
      const childComponentNames = (this.config.component.childComponents || []).map(
        (child: SkipComponentChildSpec) => child.componentName
      );
      this.config.metadata = {
        requiredChildComponents: childComponentNames,
        componentContext: 'Global',
        version: 'v1'
      };
    }
  }

  /**
   * Register all components in the hierarchy before initialization
   * This ensures all child components are available in the registry
   */
  private async registerComponentHierarchy(): Promise<{
    success: boolean;
    registeredComponents: string[];
    errors: string[];
  }> {
    const errors: string[] = [];
    const registeredComponents: string[] = [];
    
    try {
      // Get React context for registration
      const reactContext = {
        React: this.React,
        ReactDOM: this.ReactDOM,
        libraries: {} // Libraries will be loaded later
      };
      
      // Register root component
      const rootComponentName = this.config.component.componentName;
      const success = await compileAndRegisterComponent(
        rootComponentName,
        this.config.component.componentCode,
        this.config.metadata?.componentContext || 'Global',
        this.config.metadata?.version || 'v1',
        reactContext
      );
      
      if (success) {
        registeredComponents.push(rootComponentName);
      } else {
        errors.push(`Failed to register root component: ${rootComponentName}`);
      }
      
      // Recursively register child components if they exist
      if (this.config.component.childComponents && Array.isArray(this.config.component.childComponents)) {
        for (const child of this.config.component.childComponents) {
          await this.registerChildComponent(child, registeredComponents, errors, reactContext);
        }
      }
      
      return {
        success: errors.length === 0,
        registeredComponents,
        errors
      };
    } catch (error: any) {
      errors.push(`Error processing component hierarchy: ${error.message}`);
      return {
        success: false,
        registeredComponents,
        errors
      };
    }
  }
  
  /**
   * Recursively register child components
   */
  private async registerChildComponent(
    spec: SkipComponentChildSpec,
    registeredComponents: string[],
    errors: string[],
    reactContext: { React: any; ReactDOM: any; libraries: any }
  ): Promise<void> {
    try {
      if (spec.componentCode) {
        const success = await compileAndRegisterComponent(
          spec.componentName,
          spec.componentCode,
          this.config.metadata?.componentContext || 'Global',
          this.config.metadata?.version || 'v1',
          reactContext
        );
        
        if (success) {
          registeredComponents.push(spec.componentName);
        } else {
          errors.push(`Failed to register component: ${spec.componentName}`);
        }
      }
      
      // Process nested children
      const childArray = spec.components || [];
      for (const child of childArray) {
        await this.registerChildComponent(child, registeredComponents, errors, reactContext);
      }
    } catch (error: any) {
      errors.push(`Error registering ${spec.componentName}: ${error.message}`);
    }
  }
  
  /**
   * Create a plain JavaScript object containing only the components needed by the generated component
   */
  private createComponentsObject(): any {
    if (!this.config.metadata?.requiredChildComponents) {
      return {}; // No child components required
    }
    
    const registry = GlobalComponentRegistry.Instance;
    const components: any = {};
    
    console.log('Creating components object. Required:', this.config.metadata.requiredChildComponents);
    console.log('Available components in registry:', registry.getRegisteredKeys());

    for (const childName of this.config.metadata.requiredChildComponents) {
      // Try to resolve the component with metadata context
      const component = registry.getWithFallback(
        childName,
        this.config.metadata.componentContext,
        this.config.metadata.version
      );
      
      if (component) {
        components[childName] = component;
        console.log(`Found component "${childName}"`);
      } else {
        console.warn(`Component "${childName}" not found in registry. Tried contexts: ${this.config.metadata.componentContext}, Global`);
      }
    }
    
    return components;
  }

  /**
   * Load React and ReactDOM dynamically
   */
  private async loadReactLibraries(): Promise<void> {
    // Check if React is already loaded globally
    if ((window as any).React && (window as any).ReactDOM) {
      this.React = (window as any).React;
      this.ReactDOM = (window as any).ReactDOM;
      return;
    }

    // Load React from CDN to ensure it's available globally for other libraries
    try {
      // Load React first
      await this.loadScriptFromCDN(CDN_URLS.REACT, 'React');
      
      // Then load ReactDOM (it depends on React being available)
      await this.loadScriptFromCDN(CDN_URLS.REACT_DOM, 'ReactDOM');
      
      this.React = (window as any).React;
      this.ReactDOM = (window as any).ReactDOM;
      
      // Verify they loaded correctly
      if (!this.React || !this.ReactDOM) {
        throw new Error('React and ReactDOM failed to load from CDN');
      }
    } catch (error) {
      // Try ES modules as fallback
      try {
        const [ReactModule, ReactDOMModule] = await Promise.all([
          import('react'),
          import('react-dom/client')
        ]);
        this.React = ReactModule;
        this.ReactDOM = ReactDOMModule;
        
        // Also set them globally for other libraries
        (window as any).React = ReactModule;
        (window as any).ReactDOM = ReactDOMModule;
      } catch (moduleError) {
        throw new Error('Failed to load React and ReactDOM from any source');
      }
    }
  }

  /**
   * Generic method to load a script from CDN
   */
  private loadScriptFromCDN(url: string, globalName: string): Promise<any> {
    return new Promise((resolve, reject) => {
      // Check if already loaded
      if ((window as any)[globalName]) {
        resolve((window as any)[globalName]);
        return;
      }

      // Check if script is already in DOM
      const existingScript = document.querySelector(`script[src="${url}"]`);
      if (existingScript) {
        // Wait for it to load
        existingScript.addEventListener('load', () => {
          if ((window as any)[globalName]) {
            resolve((window as any)[globalName]);
          } else {
            reject(new Error(`${globalName} not found after script load`));
          }
        });
        return;
      }

      // Load new script
      const script = document.createElement('script');
      script.src = url;
      script.onload = () => {
        if ((window as any)[globalName]) {
          resolve((window as any)[globalName]);
        } else {
          reject(new Error(`${globalName} not found after script load`));
        }
      };
      script.onerror = () => reject(new Error(`Failed to load script: ${url}`));
      document.head.appendChild(script);
    });
  }

  /**
   * Load Babel standalone for JSX transpilation
   */
  private async loadBabel(): Promise<any> {
    return this.loadScriptFromCDN(CDN_URLS.BABEL_STANDALONE, 'Babel');
  }

  /**
   * Load a CSS file from CDN
   */
  private loadCSS(url: string): void {
    // Check if CSS is already loaded
    const existingLink = document.querySelector(`link[href="${url}"]`);
    if (existingLink) {
      return;
    }

    const link = document.createElement('link');
    link.rel = 'stylesheet';
    link.href = url;
    document.head.appendChild(link);
  }

  /**
   * Load a script from CDN with promise
   */
  private loadScript(url: string, globalName: string): Promise<any> {
    return this.loadScriptFromCDN(url, globalName);
  }

  /**
   * Load common UI and utility libraries
   */
  private async loadCommonLibraries(): Promise<any> {
    // If already cached, return immediately
    if (SkipReactComponentHost.cachedLibraries) {
      return SkipReactComponentHost.cachedLibraries;
    }

    // If currently loading, wait for the existing promise
    if (SkipReactComponentHost.libraryLoadPromise) {
      return SkipReactComponentHost.libraryLoadPromise;
    }

    // Start loading libraries
    SkipReactComponentHost.libraryLoadPromise = this.doLoadLibraries();
    
    try {
      SkipReactComponentHost.cachedLibraries = await SkipReactComponentHost.libraryLoadPromise;
      return SkipReactComponentHost.cachedLibraries;
    } finally {
      SkipReactComponentHost.libraryLoadPromise = null;
    }
  }

  /**
   * Actually load the libraries
   */
  private async doLoadLibraries(): Promise<any> {
    // Load CSS files first (these don't need to be awaited)
    this.loadCSS(CDN_URLS.ANTD_CSS);
    this.loadCSS(CDN_URLS.BOOTSTRAP_CSS);

    // Load base dependencies first
    const [dayjs, _, d3, Chart] = await Promise.all([
      this.loadScript(CDN_URLS.DAYJS, 'dayjs'),
      this.loadScript(CDN_URLS.LODASH_JS, '_'),
      this.loadScript(CDN_URLS.D3_JS, 'd3'),
      this.loadScript(CDN_URLS.CHART_JS, 'Chart')
    ]);

    // Then load UI libraries that depend on React
    const [antd, ReactBootstrap] = await Promise.all([
      this.loadScript(CDN_URLS.ANTD_JS, 'antd'),
      this.loadScript(CDN_URLS.REACT_BOOTSTRAP_JS, 'ReactBootstrap')
    ]);

    return {
      antd,
      ReactBootstrap,
      d3,
      Chart,
      _,
      dayjs
    };
  }

  /**
   * Initialize the React component
   */
  public async initialize(): Promise<void> {
    try {
      // Step 1: Load React and ReactDOM first
      await this.loadReactLibraries();
      
      // Step 2: Load Babel (needed for JSX transpilation during component registration)
      const Babel = await this.loadBabel();
      
      // Step 3: Now we can register components (React and Babel are both loaded)
      const registrationResult = await this.registerComponentHierarchy();
      
      if (!registrationResult.success) {
        const errorMessage = `Failed to register components: ${registrationResult.errors.join(', ')}`;
        LogError(errorMessage);
        if (this.config.callbacks?.NotifyEvent) {
          this.config.callbacks.NotifyEvent('componentError', {
            error: errorMessage,
            source: 'Component Registration'
          });
        }
        throw new Error(errorMessage);
      }
      
      console.log('Successfully registered components:', registrationResult.registeredComponents);
      
      // Step 4: Load common libraries
      const libraries = await this.loadCommonLibraries();
      
      // Register example components if needed (for testing)
      if (this.config.metadata?.requiredChildComponents?.length) {
        // Check if we need to register example components
        const registry = GlobalComponentRegistry.Instance;
        const hasComponents = this.config.metadata.requiredChildComponents.every(name => 
          registry.getWithFallback(name, this.config.metadata!.componentContext, this.config.metadata!.version)
        );
        
        if (!hasComponents && typeof (window as any).registerExampleComponents === 'function') {
          // Try to register example components
          (window as any).registerExampleComponents(this.React, libraries.Chart);
        }
      }

      // Create utility functions
      const createStateUpdater = this.createStateUpdaterFunction();
      const createStandardEventHandler = this.createStandardEventHandlerFunction();
      
      // Get or create the style system
      const styles = this.getOrCreateStyleSystem();

      // Transpile the JSX code to JavaScript
      let transpiledCode: string;
      try {
        const wrappedCode = generateComponentWrapper(this.config.component.componentCode,this.config.component.componentName)
        const result = Babel.transform(wrappedCode, {
          presets: ['react'],
          filename: 'component.jsx'
        });
        transpiledCode = result.code;
      } catch (transpileError) {
        LogError(`Failed to transpile JSX: ${transpileError}`);
        if (this.config.callbacks?.NotifyEvent) {
          this.config.callbacks.NotifyEvent('componentError', {
            error: `JSX transpilation failed: ${transpileError}`,
            source: 'JSX Transpilation'
          });
        }
        throw new Error(`JSX transpilation failed: ${transpileError}`);
      }

      // Create the component factory function from the transpiled code
      // Always pass all libraries - unused ones will just be undefined in older components
      let createComponent;
      try {
        createComponent = new Function(
          'React', 'styles', 'console', 'antd', 'ReactBootstrap', 'd3', 'Chart', '_', 'dayjs',
          `${transpiledCode}; return createComponent;`
        )(this.React, styles, console, libraries.antd, libraries.ReactBootstrap, libraries.d3, libraries.Chart, libraries._, libraries.dayjs);
      } catch (evalError) {
        LogError(`Failed to evaluate component code: ${evalError}`);
        console.error('Component code evaluation error:', evalError);
        console.error('Transpiled code:', transpiledCode);
        if (this.config.callbacks?.NotifyEvent) {
          this.config.callbacks.NotifyEvent('componentError', {
            error: `Component code evaluation failed: ${evalError}`,
            source: 'Code Evaluation'
          });
        }
        throw new Error(`Component code evaluation failed: ${evalError}`);
      }

      // Debug: Check if React hooks are available
      if (!this.React.useState) {
        console.error('React.useState is not available. React object:', this.React);
        if (this.config.callbacks?.NotifyEvent) {
          this.config.callbacks.NotifyEvent('componentError', {
            error: 'React hooks are not available. Make sure React is loaded correctly.',
            source: 'React Initialization'
          });
        }
        throw new Error('React hooks are not available. Make sure React is loaded correctly.');
      }

      // Call createComponent with all parameters - older components will just ignore the extra libraries parameter
      try {
        this.componentResult = createComponent(
          this.React, 
          this.ReactDOM, 
          this.React.useState, 
          this.React.useEffect,
          this.React.useCallback,
          createStateUpdater,
          createStandardEventHandler,
          libraries
        );
      } catch (factoryError) {
        LogError(`Component factory failed: ${factoryError}`);
        if (this.config.callbacks?.NotifyEvent) {
          this.config.callbacks.NotifyEvent('componentError', {
            error: `Component factory failed: ${factoryError}`,
            source: 'Component Factory'
          });
        }
        throw factoryError;
      }

      // Create container if it doesn't exist
      if (!this.componentContainer) {
        this.componentContainer = document.createElement('div');
        this.componentContainer.className = 'react-component-container';
        this.componentContainer.style.width = '100%';
        this.componentContainer.style.height = '100%';
        this.config.container.appendChild(this.componentContainer);
      }

      // Store initial state
      this.currentState = this.config.initialState || {};
      
      // Render the component
      this.render();
    } catch (error) {
      LogError(error);
      if (this.config.callbacks?.NotifyEvent) {
        this.config.callbacks.NotifyEvent('componentError', {
          error: String(error),
          source: 'Component Initialization'
        });
      }
    }
  }

  /**
   * Create an error boundary component
   */
  private createErrorBoundary(): any {
    const React = this.React;
    
    class ErrorBoundary extends React.Component {
      constructor(props: any) {
        super(props);
        this.state = { 
          hasError: false, 
          error: null, 
          errorInfo: null
        };
      }

      static getDerivedStateFromError(_error: any) {
        return { hasError: true };
      }

      componentDidCatch(error: any, errorInfo: any) {
        console.error('React Error Boundary caught:', error, errorInfo);
        // Bubble error up to Angular
        const host = (this as any).props.host;
        if (host?.config?.callbacks?.NotifyEvent) {
          host.config.callbacks.NotifyEvent('componentError', {
            error: error?.toString() || 'Unknown error',
            errorInfo: errorInfo,
            stackTrace: errorInfo?.componentStack,
            source: 'React Error Boundary'
          });
        }
        // Set state to prevent re-rendering the broken component
        this.setState({
          error: error,
          errorInfo: errorInfo
        });
      }

      render() {
        if ((this.state as any).hasError) {
          // Just return an empty div - Angular will show the error
          return React.createElement('div', {
            style: {
              display: 'none'
            }
          });
        }

        return (this.props as any).children;
      }
    }

    return ErrorBoundary;
  }

  /**
   * Render or re-render the React component with new props
   */
  public render(): void {
    if (!this.componentResult || !this.componentResult.component || this.destroyed) {
      return;
    }

    const Component = this.componentResult.component;
    const ErrorBoundary = this.createErrorBoundary();
    
    // Ensure utilities and callbacks are available
    const utilities = this.config.utilities || {};
    const callbacks = this.createCallbacks();
    const styles = this.getOrCreateStyleSystem();
    
    const componentProps = {
      data: this.config.data || {},
      utilities: utilities,
      userState: this.currentState,
      callbacks: callbacks,
      styles: styles,
      components: this.createComponentsObject() // Add the filtered components object
    };
    
    // Debug: Log the data being passed to the component
    console.log('=== SkipReactComponentHost: Rendering component ===');
    console.log('Data:', componentProps.data);
    console.log('User state:', componentProps.userState);
    console.log('Components:', Object.keys(componentProps.components));
    if (componentProps.data?.data_item_0) {
      console.log('First entity:', componentProps.data.data_item_0[0]);
      console.log('Entity count:', componentProps.data.data_item_0.length);
    } else {
      console.log('WARNING: No data_item_0 found in data');
    }
    console.log('=== End component props debug ===');

    if (!this.reactRoot && this.componentContainer) {
      this.reactRoot = this.ReactDOM.createRoot(this.componentContainer);
    }

    if (this.reactRoot) {
      try {
        // Wrap component in error boundary, passing host reference
        const wrappedElement = this.React.createElement(ErrorBoundary, { host: this },
          this.React.createElement(Component, componentProps)
        );
        
        // Set a timeout to prevent infinite loops from freezing the browser
        const renderTimeout = setTimeout(() => {
          console.error('Component render timeout - possible infinite loop detected');
          if (this.config.callbacks?.NotifyEvent) {
            this.config.callbacks.NotifyEvent('componentError', {
              error: 'Component render timeout - possible infinite loop or heavy computation detected',
              source: 'Render Timeout'
            });
          }
        }, 5000); // 5 second timeout
        
        this.reactRoot.render(wrappedElement);
        
        // Clear timeout if render completes
        clearTimeout(renderTimeout);
      } catch (renderError) {
        console.error('Failed to render React component:', renderError);
        console.error('Component:', Component);
        console.error('Props:', componentProps);
        
        if (this.config.callbacks?.NotifyEvent) {
          this.config.callbacks.NotifyEvent('componentError', {
            error: `Component render failed: ${renderError}`,
            source: 'React Render'
          });
        }
      }
    }
  }

  /**
   * Update the component state
   */
  public updateState(path: string, value: any): void {
    // Update the current state
    this.currentState = {
      ...this.currentState,
      [path]: value
    };
    
    // Re-render with new state
    this.render();
  }

  /**
   * Update the component data
   */
  public updateData(newData: any): void {
    this.config.data = {
      ...this.config.data,
      ...newData
    };
    
    // Re-render with new data
    this.render();
  }

  /**
   * Refresh the component with optional new data
   */
  public refresh(newData?: any): void {
    if (newData) {
      this.updateData(newData);
    }
    
    if (this.componentResult && this.componentResult.refresh) {
      this.componentResult.refresh(this.config.data);
    } else {
      // Re-render the component if no refresh method is available
      this.render();
    }
  }

  /**
   * Print the component
   */
  public print(): void {
    if (this.componentResult && this.componentResult.print) {
      this.componentResult.print();
    } else {
      window.print();
    }
  }


  /**
   * Clean up resources
   */
  public destroy(): void {
    this.destroyed = true;
    if (this.reactRoot) {
      this.reactRoot.unmount();
      this.reactRoot = null;
    }
    if (this.componentContainer && this.componentContainer.parentNode) {
      this.componentContainer.parentNode.removeChild(this.componentContainer);
    }
    this.componentContainer = null;
    this.componentResult = null;
  }

  /**
   * Create the callbacks object to pass to the React component
   */
  private createCallbacks(): SkipComponentCallbacks {
    return this.config.callbacks || {
      RefreshData: () => {},
      OpenEntityRecord: () => {},
      UpdateUserState: () => {},
      NotifyEvent: () => {}
    };
  }

  /**
   * Get or create the cached style system
   */
  private getOrCreateStyleSystem(): SkipComponentStyles {
    // If we already have a cached style system, return it
    if (SkipReactComponentHost.cachedStyleSystem) {
      return SkipReactComponentHost.cachedStyleSystem;
    }

    // Create the style system by merging defaults with config
    SkipReactComponentHost.cachedStyleSystem = this.createStyleSystem(this.config.styles);
    
    return SkipReactComponentHost.cachedStyleSystem;
  }

  /**
   * Create a unified style system for the component
   */
  private createStyleSystem(baseStyles?: Partial<SkipComponentStyles>): SkipComponentStyles {
    return {
      ...DEFAULT_STYLES,
      ...baseStyles
    };
  }



  /**
   * Create the state updater utility function for the React component
   */
  private createStateUpdaterFunction(): any {
    return function createStateUpdater(statePath: string, parentStateUpdater: Function) {
      return (componentStateUpdate: any) => {
        if (!statePath) {
          // Root component - call container callback directly
          parentStateUpdater(componentStateUpdate);
        } else {
          // Sub-component - bubble up with path context
          const pathParts = statePath.split('.');
          const componentKey = pathParts[pathParts.length - 1];
          
          parentStateUpdater({
            [componentKey]: {
              ...componentStateUpdate
            }
          });
        }
      };
    };
  }

  /**
   * Create the standard event handler utility function for the React component
   */
  private createStandardEventHandlerFunction(): any {
    return function createStandardEventHandler(updateUserState: Function, callbacksParam: any) {
      return (event: any) => {
        switch (event.type) {
          case 'stateChanged':
            if (event.payload?.statePath && event.payload?.newState) {
              const update: any = {};
              update[event.payload.statePath] = event.payload.newState;
              updateUserState(update);
            }
            break;
          case 'navigate':
            if (callbacksParam?.OpenEntityRecord && event.payload) {
              callbacksParam.OpenEntityRecord(event.payload.entityName, event.payload.key);
            }
            break;
          default:
            if (callbacksParam?.NotifyEvent) {
              callbacksParam.NotifyEvent(event.type, event.payload);
            }
        }
      };
    };
  }
}

/**
 * Example child components for testing the component registry system
 * These would normally be defined in separate files and imported
 */

// Example SearchBox component
export const createSearchBoxComponent = (React: any) => {
  return function SearchBox({ data, config, state, onEvent, styles, statePath }: any) {
    const [searchValue, setSearchValue] = React.useState(state?.searchValue || '');
    
    const handleSearch = (value: string) => {
      setSearchValue(value);
      if (onEvent) {
        onEvent({
          type: 'stateChanged',
          payload: {
            statePath: statePath,
            newState: { searchValue: value }
          }
        });
      }
    };
    
    return React.createElement('div', {
      style: {
        padding: styles?.spacing?.md || '16px',
        backgroundColor: styles?.colors?.surface || '#f8f9fa',
        borderRadius: styles?.borders?.radius?.md || '8px',
        marginBottom: styles?.spacing?.md || '16px'
      }
    }, [
      React.createElement('input', {
        key: 'search-input',
        type: 'text',
        value: searchValue,
        onChange: (e: any) => handleSearch(e.target.value),
        placeholder: config?.placeholder || 'Search...',
        style: {
          width: '100%',
          padding: styles?.spacing?.sm || '8px',
          border: `1px solid ${styles?.colors?.border || '#dee2e6'}`,
          borderRadius: styles?.borders?.radius?.sm || '4px',
          fontSize: styles?.typography?.fontSize?.md || '14px',
          fontFamily: styles?.typography?.fontFamily || 'inherit'
        }
      })
    ]);
  };
};

// Example OrderList component
export const createOrderListComponent = (React: any) => {
  return function OrderList({ data, config, state, onEvent, styles, statePath }: any) {
    const [sortBy, setSortBy] = React.useState(state?.sortBy || 'date');
    const [currentPage, setCurrentPage] = React.useState(state?.currentPage || 1);
    
    const orders = data || [];
    const pageSize = config?.pageSize || 10;
    const totalPages = Math.ceil(orders.length / pageSize);
    
    const updateState = (newState: any) => {
      if (onEvent) {
        onEvent({
          type: 'stateChanged',
          payload: {
            statePath: statePath,
            newState: { ...state, ...newState }
          }
        });
      }
    };
    
    const handleSort = (field: string) => {
      setSortBy(field);
      updateState({ sortBy: field });
    };
    
    const handlePageChange = (page: number) => {
      setCurrentPage(page);
      updateState({ currentPage: page });
    };
    
    // Simple pagination
    const startIndex = (currentPage - 1) * pageSize;
    const endIndex = startIndex + pageSize;
    const displayedOrders = orders.slice(startIndex, endIndex);
    
    return React.createElement('div', {
      style: {
        backgroundColor: styles?.colors?.background || '#ffffff',
        border: `1px solid ${styles?.colors?.border || '#dee2e6'}`,
        borderRadius: styles?.borders?.radius?.md || '8px',
        padding: styles?.spacing?.lg || '24px'
      }
    }, [
      // Header
      React.createElement('div', {
        key: 'header',
        style: {
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          marginBottom: styles?.spacing?.md || '16px'
        }
      }, [
        React.createElement('h3', {
          key: 'title',
          style: {
            margin: 0,
            fontSize: styles?.typography?.fontSize?.lg || '16px',
            fontWeight: styles?.typography?.fontWeight?.semibold || '600'
          }
        }, 'Orders'),
        config?.sortable && React.createElement('select', {
          key: 'sort',
          value: sortBy,
          onChange: (e: any) => handleSort(e.target.value),
          style: {
            padding: styles?.spacing?.sm || '8px',
            border: `1px solid ${styles?.colors?.border || '#dee2e6'}`,
            borderRadius: styles?.borders?.radius?.sm || '4px'
          }
        }, [
          React.createElement('option', { key: 'date', value: 'date' }, 'Sort by Date'),
          React.createElement('option', { key: 'amount', value: 'amount' }, 'Sort by Amount'),
          React.createElement('option', { key: 'status', value: 'status' }, 'Sort by Status')
        ])
      ]),
      
      // List
      React.createElement('div', {
        key: 'list',
        style: { marginBottom: styles?.spacing?.md || '16px' }
      }, displayedOrders.length > 0 ? displayedOrders.map((order: any, index: number) =>
        React.createElement('div', {
          key: order.id || index,
          style: {
            padding: styles?.spacing?.md || '16px',
            borderBottom: `1px solid ${styles?.colors?.borderLight || '#f1f5f9'}`,
            cursor: 'pointer'
          },
          onClick: () => onEvent && onEvent({
            type: 'navigate',
            payload: { entityName: 'Orders', key: order.id }
          })
        }, [
          React.createElement('div', { 
            key: 'order-number',
            style: { fontWeight: styles?.typography?.fontWeight?.medium || '500' }
          }, `Order #${order.orderNumber || order.id}`),
          React.createElement('div', {
            key: 'order-details',
            style: { 
              fontSize: styles?.typography?.fontSize?.sm || '12px',
              color: styles?.colors?.textSecondary || '#6c757d'
            }
          }, `$${order.amount || 0} - ${order.status || 'Pending'}`)
        ])
      ) : React.createElement('div', {
        style: {
          textAlign: 'center',
          padding: styles?.spacing?.xl || '32px',
          color: styles?.colors?.textSecondary || '#6c757d'
        }
      }, 'No orders found')),
      
      // Pagination
      totalPages > 1 && React.createElement('div', {
        key: 'pagination',
        style: {
          display: 'flex',
          justifyContent: 'center',
          gap: styles?.spacing?.sm || '8px'
        }
      }, Array.from({ length: totalPages }, (_, i) => i + 1).map(page =>
        React.createElement('button', {
          key: page,
          onClick: () => handlePageChange(page),
          style: {
            padding: `${styles?.spacing?.xs || '4px'} ${styles?.spacing?.sm || '8px'}`,
            border: `1px solid ${styles?.colors?.border || '#dee2e6'}`,
            borderRadius: styles?.borders?.radius?.sm || '4px',
            backgroundColor: page === currentPage ? styles?.colors?.primary || '#5B4FE9' : 'transparent',
            color: page === currentPage ? styles?.colors?.textInverse || '#ffffff' : styles?.colors?.text || '#212529',
            cursor: 'pointer'
          }
        }, page)
      ))
    ]);
  };
};

// Example CategoryChart component  
export const createCategoryChartComponent = (React: any, Chart: any) => {
  return function CategoryChart({ data, config, state, onEvent, styles, statePath }: any) {
    const chartRef = React.useRef(null);
    const chartInstanceRef = React.useRef(null);
    
    React.useEffect(() => {
      if (!chartRef.current || !Chart) return;
      
      // Destroy existing chart
      if (chartInstanceRef.current) {
        chartInstanceRef.current.destroy();
      }
      
      // Create new chart
      const ctx = chartRef.current.getContext('2d');
      chartInstanceRef.current = new Chart(ctx, {
        type: 'bar',
        data: {
          labels: data?.map((item: any) => item.category) || [],
          datasets: [{
            label: 'Sales by Category',
            data: data?.map((item: any) => item.value) || [],
            backgroundColor: styles?.colors?.primary || '#5B4FE9',
            borderColor: styles?.colors?.primaryHover || '#4940D4',
            borderWidth: 1
          }]
        },
        options: {
          responsive: true,
          maintainAspectRatio: false,
          plugins: {
            legend: {
              display: config?.showLegend !== false
            },
            tooltip: {
              callbacks: {
                label: (context: any) => {
                  return `$${context.parsed.y.toLocaleString()}`;
                }
              }
            }
          },
          scales: {
            y: {
              beginAtZero: true,
              ticks: {
                callback: (value: any) => `$${value.toLocaleString()}`
              }
            }
          },
          onClick: (event: any, elements: any) => {
            if (elements.length > 0 && onEvent) {
              const index = elements[0].index;
              const category = data[index];
              onEvent({
                type: 'chartClick',
                payload: { category: category.category, value: category.value }
              });
            }
          }
        }
      });
      
      return () => {
        if (chartInstanceRef.current) {
          chartInstanceRef.current.destroy();
        }
      };
    }, [data, config, styles]);
    
    return React.createElement('div', {
      style: {
        backgroundColor: styles?.colors?.background || '#ffffff',
        border: `1px solid ${styles?.colors?.border || '#dee2e6'}`,
        borderRadius: styles?.borders?.radius?.md || '8px',
        padding: styles?.spacing?.lg || '24px',
        height: '400px'
      }
    }, [
      React.createElement('h3', {
        key: 'title',
        style: {
          margin: `0 0 ${styles?.spacing?.md || '16px'} 0`,
          fontSize: styles?.typography?.fontSize?.lg || '16px',
          fontWeight: styles?.typography?.fontWeight?.semibold || '600'
        }
      }, 'Sales by Category'),
      React.createElement('canvas', {
        key: 'chart',
        ref: chartRef,
        style: { maxHeight: '320px' }
      })
    ]);
  };
};

// Example ActionCategoryList component string - simulates AI-generated code
export const getActionCategoryListComponentString = () => {
  return String.raw`
    function createComponent(React, ReactDOM, useState, useEffect, useCallback, createStateUpdater, createStandardEventHandler) {
      function ActionCategoryList({ data, config, state, onEvent, styles, statePath, utilities, selectedCategoryID }) {
        const [categories, setCategories] = useState([]);
        const [expandedCategories, setExpandedCategories] = useState(new Set());
        const [loading, setLoading] = useState(true);
        const [error, setError] = useState(null);
        
        useEffect(() => {
          loadCategories();
        }, []);
        
        const loadCategories = async () => {
          if (!utilities?.rv) {
            setError('RunView utility not available');
            setLoading(false);
            return;
          }
          
          try {
            setLoading(true);
            setError(null);
            
            const result = await utilities.rv.RunView({
              EntityName: 'Action Categories',
              ExtraFilter: '',
              OrderBy: 'Name',
              MaxRows: 1000,
              ResultType: 'entity_object'
            });
            
            if (result.Success && result.Results) {
              setCategories(result.Results);
            } else {
              setError(result.ErrorMessage || 'Failed to load categories');
            }
          } catch (err) {
            setError('Error loading categories: ' + err);
          } finally {
            setLoading(false);
          }
        };
        
        const handleCategoryClick = (category) => {
          if (onEvent) {
            onEvent({
              type: 'categorySelected',
              source: 'ActionCategoryList',
              payload: { 
                categoryID: category.ID,
                categoryName: category.Name
              }
            });
          }
        };
        
        if (loading) {
          return React.createElement('div', {
            style: {
              padding: styles?.spacing?.lg || '24px',
              textAlign: 'center',
              color: styles?.colors?.textSecondary || '#6c757d'
            }
          }, 'Loading categories...');
        }
        
        if (error) {
          return React.createElement('div', {
            style: {
              padding: styles?.spacing?.lg || '24px',
              color: styles?.colors?.error || '#dc3545'
            }
          }, error);
        }
        
        return React.createElement('div', {
          style: {
            height: '100%',
            overflow: 'auto'
          }
        }, [
          React.createElement('h3', {
            key: 'title',
            style: {
              margin: '0 0 ' + (styles?.spacing?.md || '16px') + ' 0',
              padding: '0 ' + (styles?.spacing?.md || '16px'),
              fontSize: styles?.typography?.fontSize?.lg || '16px',
              fontWeight: styles?.typography?.fontWeight?.semibold || '600'
            }
          }, 'Action Categories'),
          
          React.createElement('div', {
            key: 'list',
            style: {
              display: 'flex',
              flexDirection: 'column',
              gap: styles?.spacing?.xs || '4px'
            }
          }, categories.map((category) =>
            React.createElement('div', {
              key: category.ID,
              onClick: () => handleCategoryClick(category),
              style: {
                padding: styles?.spacing?.md || '16px',
                cursor: 'pointer',
                backgroundColor: selectedCategoryID === category.ID 
                  ? styles?.colors?.primaryLight || '#e8e6ff'
                  : 'transparent',
                borderLeft: selectedCategoryID === category.ID
                  ? '3px solid ' + (styles?.colors?.primary || '#5B4FE9')
                  : '3px solid transparent',
                transition: styles?.transitions?.fast || '150ms ease-in-out'
              },
              onMouseEnter: (e) => {
                if (selectedCategoryID !== category.ID) {
                  e.currentTarget.style.backgroundColor = styles?.colors?.surfaceHover || '#f1f5f9';
                }
              },
              onMouseLeave: (e) => {
                if (selectedCategoryID !== category.ID) {
                  e.currentTarget.style.backgroundColor = 'transparent';
                }
              }
            }, [
              React.createElement('div', {
                key: 'name',
                style: {
                  fontSize: styles?.typography?.fontSize?.md || '14px',
                  fontWeight: selectedCategoryID === category.ID 
                    ? styles?.typography?.fontWeight?.medium || '500'
                    : styles?.typography?.fontWeight?.regular || '400',
                  color: styles?.colors?.text || '#212529',
                  marginBottom: styles?.spacing?.xs || '4px'
                }
              }, category.Name),
              
              category.Description && React.createElement('div', {
                key: 'description',
                style: {
                  fontSize: styles?.typography?.fontSize?.sm || '12px',
                  color: styles?.colors?.textSecondary || '#6c757d',
                  lineHeight: styles?.typography?.lineHeight?.normal || '1.5'
                }
              }, category.Description)
            ])
          ))
        ]);
      }
      
      return { component: ActionCategoryList };
    }
  `;
};

// Example ActionList component string - simulates AI-generated code
export const getActionListComponentString = () => {
  return String.raw`
    function createComponent(React, ReactDOM, useState, useEffect, useCallback, createStateUpdater, createStandardEventHandler) {
      function ActionList({ data, config, state, onEvent, styles, statePath, utilities, selectedCategoryID }) {
        const [actions, setActions] = useState([]);
        const [expandedActions, setExpandedActions] = useState(new Set());
        const [actionDetails, setActionDetails] = useState({});
        const [loading, setLoading] = useState(false);
        const [error, setError] = useState(null);
    
        useEffect(() => {
          if (selectedCategoryID) {
            loadActions(selectedCategoryID);
          } else {
            setActions([]);
          }
        }, [selectedCategoryID]);
        
        const loadActions = async (categoryID) => {
          if (!utilities?.rv) {
            setError('RunView utility not available');
            return;
          }
          
          try {
            setLoading(true);
            setError(null);
            
            const result = await utilities.rv.RunView({
              EntityName: 'Actions',
              ExtraFilter: 'CategoryID = \'' + categoryID + '\'',
              OrderBy: 'Name',
              MaxRows: 1000,
              ResultType: 'entity_object'
            });
            
            if (result.Success && result.Results) {
              setActions(result.Results);
            } else {
              setError(result.ErrorMessage || 'Failed to load actions');
            }
          } catch (err) {
            setError('Error loading actions: ' + err);
          } finally {
            setLoading(false);
          }
        };
        
        const handleActionClick = async (action) => {
          // Toggle expanded state
          const newExpanded = new Set(expandedActions);
          if (newExpanded.has(action.ID)) {
            newExpanded.delete(action.ID);
          } else {
            newExpanded.add(action.ID);
            // Load details if not already loaded
            if (!actionDetails[action.ID]) {
              await loadActionDetails(action.ID);
            }
          }
          setExpandedActions(newExpanded);
          
          if (onEvent) {
            onEvent({
              type: 'actionSelected',
              source: 'ActionList',
              payload: { 
                actionID: action.ID,
                actionName: action.Name
              }
            });
          }
        };
        
        const loadActionDetails = async (actionID) => {
          if (!utilities?.rv) return;
          
          try {
            // Load params and result codes in parallel
            const [paramsResult, resultCodesResult] = await Promise.all([
              utilities.rv.RunView({
                EntityName: 'Action Params',
                ExtraFilter: 'ActionID = \'' + actionID + '\'',
                OrderBy: 'Name',
                ResultType: 'entity_object'
              }),
              utilities.rv.RunView({
                EntityName: 'Action Result Codes',
                ExtraFilter: 'ActionID = \'' + actionID + '\'',
                OrderBy: 'ResultCode',
                ResultType: 'entity_object'
              })
            ]);
            
            const details = {
              params: paramsResult.Success ? paramsResult.Results : [],
              resultCodes: resultCodesResult.Success ? resultCodesResult.Results : []
            };
            
            setActionDetails(prev => ({ ...prev, [actionID]: details }));
          } catch (err) {
            console.error('Error loading action details:', err);
          }
        };
        
        if (!selectedCategoryID) {
          return React.createElement('div', {
            style: {
              padding: styles?.spacing?.xl || '32px',
              textAlign: 'center',
              color: styles?.colors?.textSecondary || '#6c757d'
            }
          }, 'Select a category to view actions');
        }
        
        if (loading) {
          return React.createElement('div', {
            style: {
              padding: styles?.spacing?.xl || '32px',
              textAlign: 'center',
              color: styles?.colors?.textSecondary || '#6c757d'
            }
          }, 'Loading actions...');
        }
        
        if (error) {
          return React.createElement('div', {
            style: {
              padding: styles?.spacing?.lg || '24px',
              color: styles?.colors?.error || '#dc3545'
            }
          }, error);
        }
        
        if (actions.length === 0) {
          return React.createElement('div', {
            style: {
              padding: styles?.spacing?.xl || '32px',
              textAlign: 'center',
              color: styles?.colors?.textSecondary || '#6c757d'
            }
          }, 'No actions found in this category');
        }
        
        return React.createElement('div', {
          style: {
            padding: styles?.spacing?.lg || '24px'
          }
        }, [
          React.createElement('h3', {
            key: 'title',
            style: {
              margin: '0 0 ' + (styles?.spacing?.lg || '24px') + ' 0',
              fontSize: styles?.typography?.fontSize?.lg || '16px',
              fontWeight: styles?.typography?.fontWeight?.semibold || '600'
            }
          }, 'Actions (' + actions.length + ')'),
          
          React.createElement('div', {
            key: 'grid',
            style: {
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))',
              gap: styles?.spacing?.md || '16px'
            }
          }, actions.map((action) => {
            const isExpanded = expandedActions.has(action.ID);
            const details = actionDetails[action.ID] || { params: [], resultCodes: [] };
            
            return React.createElement('div', {
              key: action.ID,
              style: {
                backgroundColor: styles?.colors?.surface || '#f8f9fa',
                border: '1px solid ' + (styles?.colors?.border || '#dee2e6'),
                borderRadius: styles?.borders?.radius?.md || '8px',
                overflow: 'hidden',
                transition: styles?.transitions?.fast || '150ms ease-in-out'
              }
            }, [
              React.createElement('div', {
                key: 'header',
                onClick: () => handleActionClick(action),
                style: {
                  padding: styles?.spacing?.md || '16px',
                  cursor: 'pointer'
                },
                onMouseEnter: (e) => {
                  e.currentTarget.style.backgroundColor = styles?.colors?.surfaceHover || '#f1f5f9';
                },
                onMouseLeave: (e) => {
                  e.currentTarget.style.backgroundColor = 'transparent';
                }
              }, [
                React.createElement('div', {
                  key: 'header-content',
                  style: {
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between'
                  }
                }, [
                  React.createElement('div', { key: 'main-content' }, [
                    React.createElement('div', {
                      key: 'name',
                      style: {
                        fontSize: styles?.typography?.fontSize?.md || '14px',
                        fontWeight: styles?.typography?.fontWeight?.medium || '500',
                        color: styles?.colors?.text || '#212529',
                        marginBottom: styles?.spacing?.xs || '4px'
                      }
                    }, action.Name),
                    
                    action.Description && React.createElement('div', {
                      key: 'description',
                      style: {
                        fontSize: styles?.typography?.fontSize?.sm || '12px',
                        color: styles?.colors?.textSecondary || '#6c757d',
                        lineHeight: styles?.typography?.lineHeight?.normal || '1.5',
                        marginBottom: styles?.spacing?.xs || '4px'
                      }
                    }, action.Description),
                    
                    React.createElement('div', {
                      key: 'metadata',
                      style: {
                        display: 'flex',
                        gap: styles?.spacing?.md || '16px',
                        fontSize: styles?.typography?.fontSize?.xs || '11px',
                        color: styles?.colors?.textTertiary || '#94a3b8'
                      }
                    }, [
                      action.Type && React.createElement('span', { key: 'type' }, 'Type: ' + action.Type),
                      action.Status && React.createElement('span', { key: 'status' }, 'Status: ' + action.Status)
                    ])
                  ]),
                  
                  React.createElement('span', {
                    key: 'expand-icon',
                    style: {
                      fontSize: '12px',
                      color: styles?.colors?.textSecondary || '#6c757d',
                      marginLeft: '8px'
                    }
                  }, isExpanded ? '▼' : '▶')
                ])
              ]),
              
              isExpanded && React.createElement('div', {
                key: 'details',
                style: {
                  borderTop: '1px solid ' + (styles?.colors?.border || '#dee2e6'),
                  backgroundColor: styles?.colors?.background || '#ffffff'
                }
              }, [
                // Parameters section
                details.params.length > 0 && React.createElement('div', {
                  key: 'params',
                  style: {
                    padding: styles?.spacing?.md || '16px',
                    borderBottom: '1px solid ' + (styles?.colors?.borderLight || '#f1f5f9')
                  }
                }, [
                  React.createElement('h4', {
                    key: 'params-title',
                    style: {
                      margin: '0 0 ' + (styles?.spacing?.sm || '8px') + ' 0',
                      fontSize: styles?.typography?.fontSize?.sm || '13px',
                      fontWeight: styles?.typography?.fontWeight?.semibold || '600',
                      color: styles?.colors?.text || '#212529'
                    }
                  }, 'Parameters'),
                  
                  React.createElement('div', {
                    key: 'params-list',
                    style: {
                      display: 'flex',
                      flexDirection: 'column',
                      gap: styles?.spacing?.xs || '4px'
                    }
                  }, details.params.map(param =>
                    React.createElement('div', {
                      key: param.ID,
                      style: {
                        display: 'flex',
                        alignItems: 'center',
                        fontSize: styles?.typography?.fontSize?.xs || '12px',
                        padding: '4px 0'
                      }
                    }, [
                      React.createElement('span', {
                        key: 'name',
                        style: {
                          fontWeight: styles?.typography?.fontWeight?.medium || '500',
                          color: styles?.colors?.text || '#212529',
                          marginRight: '8px'
                        }
                      }, param.Name),
                      
                      React.createElement('span', {
                        key: 'type',
                        style: {
                          color: styles?.colors?.textSecondary || '#6c757d',
                          fontSize: '11px',
                          backgroundColor: styles?.colors?.surfaceHover || '#f1f5f9',
                          padding: '2px 6px',
                          borderRadius: '3px',
                          marginRight: '8px'
                        }
                      }, param.Type),
                      
                      param.IsRequired && React.createElement('span', {
                        key: 'required',
                        style: {
                          color: styles?.colors?.error || '#dc3545',
                          fontSize: '10px',
                          fontWeight: styles?.typography?.fontWeight?.semibold || '600'
                        }
                      }, 'REQUIRED'),
                      
                      param.Description && React.createElement('span', {
                        key: 'desc',
                        style: {
                          color: styles?.colors?.textTertiary || '#94a3b8',
                          marginLeft: 'auto',
                          fontSize: '11px'
                        }
                      }, param.Description)
                    ])
                  ))
                ]),
                
                // Result codes section
                details.resultCodes.length > 0 && React.createElement('div', {
                  key: 'result-codes',
                  style: {
                    padding: styles?.spacing?.md || '16px'
                  }
                }, [
                  React.createElement('h4', {
                    key: 'codes-title',
                    style: {
                      margin: '0 0 ' + (styles?.spacing?.sm || '8px') + ' 0',
                      fontSize: styles?.typography?.fontSize?.sm || '13px',
                      fontWeight: styles?.typography?.fontWeight?.semibold || '600',
                      color: styles?.colors?.text || '#212529'
                    }
                  }, 'Result Codes'),
                  
                  React.createElement('div', {
                    key: 'codes-list',
                    style: {
                      display: 'flex',
                      flexDirection: 'column',
                      gap: styles?.spacing?.xs || '4px'
                    }
                  }, details.resultCodes.map(code =>
                    React.createElement('div', {
                      key: code.ID,
                      style: {
                        display: 'flex',
                        alignItems: 'center',
                        fontSize: styles?.typography?.fontSize?.xs || '12px',
                        padding: '4px 0'
                      }
                    }, [
                      React.createElement('span', {
                        key: 'code',
                        style: {
                          fontFamily: 'monospace',
                          fontWeight: styles?.typography?.fontWeight?.medium || '500',
                          color: code.IsSuccess ? styles?.colors?.success || '#10b981' : styles?.colors?.error || '#dc3545',
                          marginRight: '8px'
                        }
                      }, code.ResultCode),
                      
                      code.Description && React.createElement('span', {
                        key: 'desc',
                        style: {
                          color: styles?.colors?.textSecondary || '#6c757d'
                        }
                      }, code.Description)
                    ])
                  ))
                ])
              ])
            ]);
          }))
        ]);
      }
      
      return { component: ActionList };
    }
  `;
};

// Example composite ActionBrowser component string - simulates AI-generated code
export const getActionBrowserComponentString = () => {
  return String.raw`
    function createComponent(React, ReactDOM, useState, useEffect, useCallback, createStateUpdater, createStandardEventHandler) {
      function ActionBrowser({ data, utilities, userState, callbacks, styles, components }) {
        const [fullUserState, setFullUserState] = useState({
          selectedCategoryID: null,
          selectedActionID: null,
          categoryList: {},
          actionList: {},
          ...userState
        });
        
        // Destructure child components from registry
        const { ActionCategoryList, ActionList } = components;
        
        const updateUserState = (stateUpdate) => {
          const newState = { ...fullUserState, ...stateUpdate };
          setFullUserState(newState);
          if (callbacks?.UpdateUserState) {
            callbacks.UpdateUserState(newState);
          }
        };
        
        const handleComponentEvent = (event) => {
          if (event.type === 'categorySelected' && event.source === 'ActionCategoryList') {
            updateUserState({
              selectedCategoryID: event.payload.categoryID,
              selectedActionID: null // Reset action selection
            });
            return;
          }
          
          if (event.type === 'actionSelected' && event.source === 'ActionList') {
            updateUserState({
              selectedActionID: event.payload.actionID
            });
            if (callbacks?.NotifyEvent) {
              callbacks.NotifyEvent('actionSelected', event.payload);
            }
            return;
          }
          
          // Handle standard state changes
          if (event.type === 'stateChanged') {
            const update = {};
            update[event.payload.statePath] = event.payload.newState;
            updateUserState(update);
          }
        };
        
        return React.createElement('div', {
          style: {
            display: 'flex',
            height: '100%',
            minHeight: '600px',
            backgroundColor: styles.colors.background,
            fontFamily: styles.typography.fontFamily
          }
        }, [
          // Left sidebar with categories
          React.createElement('div', {
            key: 'sidebar',
            style: {
              width: '300px',
              backgroundColor: styles.colors.surface,
              borderRight: '1px solid ' + styles.colors.border,
              overflow: 'hidden',
              display: 'flex',
              flexDirection: 'column'
            }
          }, [
            ActionCategoryList && React.createElement(ActionCategoryList, {
              key: 'categories',
              data: [],
              config: {},
              state: fullUserState.categoryList || {},
              onEvent: handleComponentEvent,
              styles: styles,
              utilities: utilities,
              statePath: 'categoryList',
              selectedCategoryID: fullUserState.selectedCategoryID
            })
          ]),
          
          // Main content area with actions
          React.createElement('div', {
            key: 'main',
            style: {
              flex: 1,
              overflow: 'auto'
            }
          }, [
            ActionList && React.createElement(ActionList, {
              key: 'actions',
              data: [],
              config: {},
              state: fullUserState.actionList || {},
              onEvent: handleComponentEvent,
              styles: styles,
              utilities: utilities,
              statePath: 'actionList',
              selectedCategoryID: fullUserState.selectedCategoryID
            })
          ])
        ]);
      }
      
      return { component: ActionBrowser };
    }
  `;
};

/**
 * Unit tests for GlobalComponentRegistry
 * These would normally be in a separate .spec.ts file
 * Run these tests to ensure the registry works correctly
 */
export function testGlobalComponentRegistry() {
  const registry = GlobalComponentRegistry.Instance;
  const testResults: { test: string; passed: boolean; error?: string }[] = [];
  
  const assert = (condition: boolean, testName: string, error?: string) => {
    testResults.push({ test: testName, passed: condition, error: condition ? undefined : error });
    if (!condition) {
      console.error(`Test failed: ${testName}`, error);
    } else {
      console.log(`Test passed: ${testName}`);
    }
  };
  
  // Test 1: Singleton pattern
  const registry2 = GlobalComponentRegistry.Instance;
  assert(registry === registry2, 'Singleton pattern', 'Multiple instances created');
  
  // Test 2: Basic registration and retrieval
  registry.clear(); // Start fresh
  const mockComponent = { name: 'MockComponent' };
  registry.register('TestComponent', mockComponent);
  assert(registry.get('TestComponent') === mockComponent, 'Basic register/get', 'Component not retrieved correctly');
  
  // Test 3: Has method
  assert(registry.has('TestComponent') === true, 'Has method - existing', 'Should return true for existing component');
  assert(registry.has('NonExistent') === false, 'Has method - non-existing', 'Should return false for non-existing component');
  
  // Test 4: Register with metadata
  const mockSearchBox = { name: 'SearchBox' };
  registry.registerWithMetadata('SearchBox', 'CRM', 'v1', mockSearchBox, 'CRM-specific search');
  assert(registry.get('SearchBox_CRM_v1') === mockSearchBox, 'Register with metadata', 'Component not found with metadata key');
  assert(registry.get('SearchBox_CRM') === mockSearchBox, 'Backwards compatibility key', 'Component not found with context-only key');
  
  // Test 5: Multiple versions
  const mockSearchBoxV2 = { name: 'SearchBoxV2' };
  registry.registerWithMetadata('SearchBox', 'CRM', 'v2', mockSearchBoxV2);
  assert(registry.get('SearchBox_CRM_v1') === mockSearchBox, 'Version v1 still accessible', 'v1 component overwritten');
  assert(registry.get('SearchBox_CRM_v2') === mockSearchBoxV2, 'Version v2 accessible', 'v2 component not found');
  
  // Test 6: GetWithFallback - exact match
  const found1 = registry.getWithFallback('SearchBox', 'CRM', 'v2');
  assert(found1 === mockSearchBoxV2, 'GetWithFallback - exact match', 'Should find exact version match');
  
  // Test 7: GetWithFallback - context fallback
  const found2 = registry.getWithFallback('SearchBox', 'CRM', 'v3'); // v3 doesn't exist
  assert(found2 === mockSearchBoxV2, 'GetWithFallback - context fallback', 'Should fall back to context match');
  
  // Test 8: GetWithFallback - global fallback
  const globalComponent = { name: 'GlobalSearch' };
  registry.register('SearchBox_Global', globalComponent);
  const found3 = registry.getWithFallback('SearchBox', 'Finance', 'v1'); // Finance context doesn't exist
  assert(found3 === globalComponent, 'GetWithFallback - global fallback', 'Should fall back to global component');
  
  // Test 9: GetWithFallback - name only fallback
  const nameOnlyComponent = { name: 'NameOnly' };
  registry.register('UniqueComponent', nameOnlyComponent);
  const found4 = registry.getWithFallback('UniqueComponent', 'Any', 'v1');
  assert(found4 === nameOnlyComponent, 'GetWithFallback - name only fallback', 'Should fall back to name-only registration');
  
  // Test 10: GetWithFallback - not found
  const found5 = registry.getWithFallback('NotRegistered', 'Any', 'v1');
  assert(found5 === null, 'GetWithFallback - not found', 'Should return null when component not found');
  
  // Test 11: Get registered keys
  const keys = registry.getRegisteredKeys();
  assert(keys.includes('SearchBox_CRM_v1'), 'Get registered keys', 'Should include registered components');
  assert(keys.length > 5, 'Multiple registrations', `Should have multiple keys registered, found ${keys.length}`);
  
  // Test 12: Clear registry
  registry.clear();
  assert(registry.getRegisteredKeys().length === 0, 'Clear registry', 'Registry should be empty after clear');
  
  // Summary
  const passed = testResults.filter(r => r.passed).length;
  const failed = testResults.filter(r => !r.passed).length;
  console.log(`\nTest Summary: ${passed} passed, ${failed} failed out of ${testResults.length} total tests`);
  
  // Important: Clear the registry at the end of tests so it's ready for actual use
  registry.clear();
  
  return testResults;
}

/**
 * Generate a createComponent wrapper around component code
 * This wrapper provides React context and expected factory interface
 */
function generateComponentWrapper(componentCode: string, componentName: string): string {
  return `function createComponent(React, ReactDOM, useState, useEffect, useCallback, createStateUpdater, createStandardEventHandler, libraries) {
  ${componentCode}
  
  return {
    component: ${componentName},
    print: function() { window.print(); },
    refresh: function() { /* Managed by parent */ }
  };
}`;
}

/**
 * Transpile JSX code to JavaScript using Babel
 */
function transpileJSX(code: string, filename: string): string {
  const Babel = (window as any).Babel;
  if (!Babel) {
    throw new Error('Babel not loaded - cannot transpile JSX');
  }
  
  const result = Babel.transform(code, {
    presets: ['react'],
    filename: filename
  });
  
  return result.code;
}

/**
 * Get React context and libraries for component compilation
 */
function getReactContext() {
  const React = (window as any).React;
  const ReactDOM = (window as any).ReactDOM;
  
  if (!React || !ReactDOM) {
    throw new Error('React and ReactDOM must be loaded before compiling components');
  }
  
  const libraries = {
    antd: (window as any).antd,
    ReactBootstrap: (window as any).ReactBootstrap,
    d3: (window as any).d3,
    Chart: (window as any).Chart,
    _: (window as any)._,
    dayjs: (window as any).dayjs
  };
  
  return { React, ReactDOM, libraries };
}

/**
 * Compile and register a component from string code
 * Always wraps plain function components with createComponent factory
 */
export async function compileAndRegisterComponent(
  componentName: string,
  componentCode: string,
  context: string = 'Global',
  version: string = 'v1',
  reactContext?: { React: any; ReactDOM: any; libraries: any }
): Promise<boolean> {
  const registry = GlobalComponentRegistry.Instance;
  
  try {
    const { React, ReactDOM, libraries } = reactContext || getReactContext();
    
    // Auto-generate wrapper around the component code
    const wrappedCode = generateComponentWrapper(componentCode, componentName);
    
    // Transpile the wrapped code
    const transpiledCode = transpileJSX(wrappedCode, `${componentName}.jsx`);
    
    // Create the component factory
    const createComponent = new Function(
      'React', 'ReactDOM', 'useState', 'useEffect', 'useCallback', 'createStateUpdater', 'createStandardEventHandler', 'libraries',
      `${transpiledCode}; return createComponent;`
    )(React, ReactDOM, React.useState, React.useEffect, React.useCallback, 
      () => {}, // createStateUpdater placeholder
      () => {}, // createStandardEventHandler placeholder
      libraries
    );
    
    // Get the component from the factory
    const componentResult = createComponent(
      React, ReactDOM, React.useState, React.useEffect, React.useCallback,
      () => {}, // createStateUpdater
      () => {}  // createStandardEventHandler
    );
    
    // Register the component
    registry.registerWithMetadata(componentName, context, version, componentResult.component);
    console.log(`Compiled and registered component: ${componentName}`);
    
    return true;
  } catch (error) {
    console.error(`Failed to compile component ${componentName}:`, error);
    return false;
  }
}

/**
 * Helper function to register example components for testing
 * Call this during application initialization
 */
export async function registerExampleComponents(React?: any, Chart?: any) {
  const registry = GlobalComponentRegistry.Instance;
  
  // Get React reference - either passed in or from window
  React = React || (window as any).React;
  Chart = Chart || (window as any).Chart;
  
  // Also make this function available globally for debugging
  (window as any).registerExampleComponents = registerExampleComponents;
  (window as any).compileAndRegisterComponent = compileAndRegisterComponent;
  
  if (React) {
    // Register simple test components (these use the real React components directly)
    registry.registerWithMetadata('SearchBox', 'CRM', 'v1', createSearchBoxComponent(React));
    registry.registerWithMetadata('SearchBox', 'Global', 'v1', createSearchBoxComponent(React));
    
    // Register OrderList variants  
    registry.registerWithMetadata('OrderList', 'Standard', 'v1', createOrderListComponent(React));
    registry.registerWithMetadata('OrderList', 'Advanced', 'v1', createOrderListComponent(React));
    
    // Register chart components
    if (Chart) {
      registry.registerWithMetadata('CategoryChart', 'Global', 'v1', createCategoryChartComponent(React, Chart));
    }
    
    // Compile and register Action browser components from strings
    // This simulates how AI-generated components are processed
    await compileAndRegisterComponent('ActionCategoryList', getActionCategoryListComponentString(), 'Global', 'v1');
    await compileAndRegisterComponent('ActionList', getActionListComponentString(), 'Global', 'v1');
    await compileAndRegisterComponent('ActionBrowser', getActionBrowserComponentString(), 'Global', 'v1');
    
    console.log('Example components registered successfully');
    console.log('Registered components:', registry.getRegisteredKeys());
    return true;
  } else {
    console.warn('React not found - cannot register example components');
    return false;
  }
}