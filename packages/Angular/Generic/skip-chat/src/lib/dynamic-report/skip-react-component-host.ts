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
      // Collect ALL component names from the entire hierarchy
      const allComponentNames = this.collectAllComponentNames(this.config.component);
      
      this.config.metadata = {
        requiredChildComponents: allComponentNames,
        componentContext: 'Global',
        version: 'v1'
      };
    }
  }

  /**
   * Recursively collect all component names from the entire component hierarchy
   * This ensures every component in the tree is available to every other component
   */
  private collectAllComponentNames(spec: SkipComponentRootSpec): string[] {
    const componentNames = new Set<string>();
    
    // Note: Don't add the root component itself - it's not needed in the components object
    
    // Recursive function to collect from children
    const collectFromChildren = (children: SkipComponentChildSpec[]) => {
      for (const child of children) {
        componentNames.add(child.componentName);
        // Recursively collect from sub-components
        if (child.components && child.components.length > 0) {
          collectFromChildren(child.components);
        }
      }
    };
    
    // Start collection from root's children
    if (spec.childComponents && spec.childComponents.length > 0) {
      collectFromChildren(spec.childComponents);
    }
    
    return Array.from(componentNames);
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
      const result = await SkipReactComponentHost.compileAndRegisterComponent(
        rootComponentName,
        this.config.component.componentCode,
        this.config.metadata?.componentContext || 'Global',
        this.config.metadata?.version || 'v1',
        reactContext
      );
      
      if (result.success) {
        registeredComponents.push(rootComponentName);
      } else {
        errors.push(`Failed to register root component: ${rootComponentName} - ${result.error}`);
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
        const result = await SkipReactComponentHost.compileAndRegisterComponent(
          spec.componentName,
          spec.componentCode,
          this.config.metadata?.componentContext || 'Global',
          this.config.metadata?.version || 'v1',
          reactContext
        );
        
        if (result.success) {
          registeredComponents.push(spec.componentName);
        } else {
          errors.push(`Failed to register component: ${spec.componentName} - ${result.error}`);
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
    const missingComponents: string[] = [];
    
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
        missingComponents.push(childName);
      }
    }
    
    // If any required components are missing, throw a descriptive error
    if (missingComponents.length > 0) {
      const errorMessage = `Missing required child components: ${missingComponents.join(', ')}. ` +
        `This usually means the component specification is incomplete or child components failed to compile.`;
      throw new Error(errorMessage);
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
      await this.loadBabel();
      
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
      

      // Create utility functions
      const createStateUpdater = this.createStateUpdaterFunction();
      
      // Get or create the style system
      const styles = this.getOrCreateStyleSystem();

      // Use compileAndRegisterComponent with our enhanced context
      const compilationResult = await SkipReactComponentHost.compileAndRegisterComponent(
        this.config.component.componentName,
        this.config.component.componentCode,
        '', // Don't register in global registry, we'll use the result directly
        '', // No version needed since we're not registering
        {
          React: this.React,
          ReactDOM: this.ReactDOM,
          libraries,
          styles,
          createStateUpdater
        }
      );

      if (!compilationResult.success) {
        const errorMessage = compilationResult.error || 'Unknown compilation error';
        LogError(`Failed to compile component: ${errorMessage}`);
        
        if (this.config.callbacks?.NotifyEvent) {
          this.config.callbacks.NotifyEvent('componentError', {
            error: `Component compilation failed: ${errorMessage}`,
            source: 'Component Compilation'
          });
        }
        throw new Error(`Component compilation failed: ${errorMessage}`);
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

      this.componentResult = compilationResult.componentResult;

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
   * Generate a createComponent wrapper around component code
   * This wrapper provides React context and expected factory interface
   */
  private static generateComponentWrapper(componentCode: string, componentName: string): string {
    return `function createComponent(React, ReactDOM, useState, useEffect, useCallback, createStateUpdater, libraries, styles, console) {
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
  private static transpileJSX(code: string, filename: string): string {
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
  private static getReactContext() {
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
  public static async compileAndRegisterComponent(
    componentName: string,
    componentCode: string,
    context: string = 'Global',
    version: string = 'v1',
    reactContext?: { React: any; ReactDOM: any; libraries: any; styles?: any; createStateUpdater?: any }
  ): Promise<{ success: boolean; componentResult?: any; error?: string }> {
    const registry = GlobalComponentRegistry.Instance;
    
    try {
      const reactContextResolved = reactContext || SkipReactComponentHost.getReactContext();
      const { React, ReactDOM, libraries } = reactContextResolved;
      const styles = (reactContextResolved as any).styles || {};
      const createStateUpdater = (reactContextResolved as any).createStateUpdater || (() => {});
      
      // Auto-generate wrapper around the component code
      const wrappedCode = SkipReactComponentHost.generateComponentWrapper(componentCode, componentName);
      
      // Transpile the wrapped code
      const transpiledCode = SkipReactComponentHost.transpileJSX(wrappedCode, `${componentName}.jsx`);
      
      // Create the component factory with all parameters including styles and console
      const createComponent = new Function(
        'React', 'ReactDOM', 'useState', 'useEffect', 'useCallback', 'createStateUpdater', 'libraries', 'styles', 'console',
        `${transpiledCode}; return createComponent;`
      )(React, ReactDOM, React.useState, React.useEffect, React.useCallback, 
        createStateUpdater || (() => {}), // createStateUpdater with fallback
        libraries,
        styles || {},
        console
      );
      
      // Get the component from the factory
      const componentResult = createComponent(
        React, ReactDOM, React.useState, React.useEffect, React.useCallback,
        createStateUpdater || (() => {}),
        libraries,
        styles || {},
        console
      );
      
      // Register the component if requested
      if (context && version) {
        registry.registerWithMetadata(componentName, context, version, componentResult.component);
        console.log(`Compiled and registered component: ${componentName}`);
      }
      
      return { success: true, componentResult };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      console.error(`Failed to compile component ${componentName}:`, errorMessage);
      return { success: false, error: errorMessage };
    }
  }
}

