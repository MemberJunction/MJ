import { BrowserManager } from './browser-context';
import { 
  ComponentCompiler, 
  RuntimeContext,
  ComponentRegistry,
  ComponentErrorAnalyzer,
  StandardLibraryManager,
  LibraryConfiguration
} from '@memberjunction/react-runtime';
import { Metadata, RunView, RunQuery } from '@memberjunction/core';
import type { RunViewParams, RunQueryParams, UserInfo } from '@memberjunction/core';
import { ComponentLinter, FixSuggestion } from './component-linter';
import { ComponentSpec } from '@memberjunction/interactive-component-types';

export interface ComponentExecutionOptions {
  componentSpec: ComponentSpec;
  props?: Record<string, any>;
  setupCode?: string;
  timeout?: number;
  waitForSelector?: string;
  waitForLoadState?: 'load' | 'domcontentloaded' | 'networkidle';
  contextUser: UserInfo;
  libraryConfiguration?: LibraryConfiguration;
}
 

export interface ComponentExecutionResult {
  success: boolean;
  html: string;
  errors: string[];
  warnings: string[];
  criticalWarnings: string[];
  console: { type: string; text: string }[];
  screenshot?: Buffer;
  executionTime: number;
  renderCount?: number;
  lintViolations?: string[];
  fixSuggestions?: FixSuggestion[];
}

export class ComponentRunner {
  private compiler: ComponentCompiler;
  private registry: ComponentRegistry;
  private runtimeContext: RuntimeContext;

  // Critical warning patterns that should fail tests
  private static readonly CRITICAL_WARNING_PATTERNS = [
    /Maximum update depth exceeded/i,
    /Cannot update a component .* while rendering a different component/i,
    /Cannot update during an existing state transition/i,
    /Warning: setState.*unmounted component/i,
    /Warning: Can't perform a React state update on an unmounted component/i,
    /Encountered two children with the same key/i,
    /Error: Minified React error/i,
    /too many re-renders/i,
  ];

  // Maximum allowed renders before considering it excessive
  private static readonly MAX_RENDER_COUNT = 1000;

  constructor(private browserManager: BrowserManager) {
    this.compiler = new ComponentCompiler();
    this.registry = new ComponentRegistry();
    
    // Set up runtime context (will be populated in browser)
    this.runtimeContext = {} as RuntimeContext;
  }

  /**
   * Lint component code before execution
   */
  async lintComponent(
    componentCode: string, 
    componentName: string,
    componentSpec?: any
  ): Promise<{ violations: string[]; suggestions: FixSuggestion[]; hasErrors: boolean }> {
    const lintResult = await ComponentLinter.lintComponent(
      componentCode,
      componentName,
      componentSpec
    );

    const violations = lintResult.violations.map(v => v.message);
    const hasErrors = lintResult.violations.some(v => v.severity === 'error');

    return {
      violations,
      suggestions: lintResult.suggestions,
      hasErrors
    };
  }

  async executeComponent(options: ComponentExecutionOptions): Promise<ComponentExecutionResult> {
    const startTime = Date.now();
    const errors: string[] = [];
    const warnings: string[] = [];
    const criticalWarnings: string[] = [];
    const consoleLogs: { type: string; text: string }[] = [];
    let renderCount = 0;

    try {
      const page = await this.browserManager.getPage();

      // Set up monitoring
      this.setupConsoleLogging(page, consoleLogs, warnings, criticalWarnings);
      this.setupErrorHandling(page, errors);
      await this.injectRenderTracking(page);
      
      // Expose MJ utilities to the page
      await this.exposeMJUtilities(page, options.contextUser);

      // Create and load the component
      const htmlContent = this.createHTMLTemplate(options);
      await page.goto(`data:text/html;charset=utf-8,${encodeURIComponent(htmlContent)}`);

      // Wait for render with timeout detection
      const renderSuccess = await this.waitForRender(page, options, errors);
      
      // Get render count
      renderCount = await this.getRenderCount(page);

      // Get the rendered HTML
      const html = await this.browserManager.getContent();

      // Take screenshot if needed
      const screenshot = await this.browserManager.screenshot();

      // Determine success and collect any additional errors
      const { success, additionalErrors } = this.determineSuccess(
        errors,
        criticalWarnings,
        renderCount,
        !renderSuccess
      );
      
      // Add any additional errors
      errors.push(...additionalErrors);

      return {
        success,
        html,
        errors,
        warnings,
        criticalWarnings,
        console: consoleLogs,
        screenshot,
        executionTime: Date.now() - startTime,
        renderCount
      };
    } catch (error) {
      errors.push(error instanceof Error ? error.message : String(error));
      return {
        success: false,
        html: '',
        errors,
        warnings,
        criticalWarnings,
        console: consoleLogs,
        executionTime: Date.now() - startTime,
        renderCount
      };
    }
  }

  private createHTMLTemplate(options: ComponentExecutionOptions): string {
    const propsJson = JSON.stringify(options.props || {});
    const specJson = JSON.stringify(options.componentSpec);
    
    // Set configuration if provided
    if (options.libraryConfiguration) {
      StandardLibraryManager.setConfiguration(options.libraryConfiguration);
    }
    
    // Get all enabled libraries from configuration
    const enabledLibraries = StandardLibraryManager.getEnabledLibraries();
    
    // Separate runtime and component libraries
    const runtimeLibraries = enabledLibraries.filter((lib: any) => lib.category === 'runtime');
    const componentLibraries = enabledLibraries.filter((lib: any) => lib.category !== 'runtime');
    
    // Generate script tags for runtime libraries
    const runtimeScripts = runtimeLibraries
      .map((lib: any) => `  <script crossorigin src="${lib.cdnUrl}"></script>`)
      .join('\n');
    
    // Generate script tags for component libraries
    const componentScripts = componentLibraries
      .map((lib: any) => `  <script src="${lib.cdnUrl}"></script>`)
      .join('\n');
    
    // Generate CSS links
    const cssLinks = enabledLibraries
      .filter((lib: any) => lib.cdnCssUrl)
      .map((lib: any) => `  <link rel="stylesheet" href="${lib.cdnCssUrl}">`)
      .join('\n');
    
    // Include the ComponentCompiler class definition
    const componentCompilerCode = this.getComponentCompilerCode();
    
    return `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <title>React Component Test</title>
${runtimeScripts}
${componentScripts}
${cssLinks}
  <style>
    body { margin: 0; padding: 20px; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; }
    #root { min-height: 100vh; }
  </style>
  <script>
    // Render tracking injection
    (function() {
      let renderCounter = 0;
      window.__testHarnessRenderCount = 0;
      
      // Wait for React to be available
      const setupRenderTracking = () => {
        if (window.React && window.React.createElement) {
          const originalCreateElement = window.React.createElement.bind(window.React);
          
          window.React.createElement = function(type, props, ...children) {
            renderCounter++;
            window.__testHarnessRenderCount = renderCounter;
            
            if (renderCounter > 1000) {
              console.error('Excessive renders detected: ' + renderCounter + ' renders. Possible infinite loop.');
            }
            
            return originalCreateElement(type, props, ...children);
          };
        }
      };
      
      // Try to set up immediately
      setupRenderTracking();
      
      // Also try after a delay in case React loads later
      setTimeout(setupRenderTracking, 100);
    })();
  </script>
</head>
<body>
  <div id="root"></div>
  <script type="text/babel">
    ${options.setupCode || ''}
    
    // Create runtime context with dynamic libraries
    const componentLibraries = ${JSON.stringify(
      componentLibraries.map((lib: any) => ({ 
        globalVariable: lib.globalVariable,
        displayName: lib.displayName 
      }))
    )};
    
    const libraries = {};
    componentLibraries.forEach(lib => {
      if (window[lib.globalVariable]) {
        libraries[lib.globalVariable] = window[lib.globalVariable];
      }
    });
    
    const runtimeContext = {
      React: React,
      ReactDOM: ReactDOM,
      libraries: libraries
    };
    
    // Import the ComponentCompiler implementation
    ${componentCompilerCode}
    
    // Create component compiler instance
    const compiler = new ComponentCompiler();
    compiler.setBabelInstance(Babel);
    
    // Create component registry
    class SimpleRegistry {
      constructor() {
        this.components = new Map();
      }
      
      register(name, component, namespace = 'Global', version = 'v1') {
        const key = \`\${namespace}/\${version}/\${name}\`;
        this.components.set(key, component);
      }
      
      get(name, namespace = 'Global', version = 'v1') {
        const key = \`\${namespace}/\${version}/\${name}\`;
        return this.components.get(key);
      }
      
      getAll(namespace = 'Global', version = 'v1') {
        const components = {};
        const prefix = \`\${namespace}/\${version}/\`;
        this.components.forEach((component, key) => {
          if (key.startsWith(prefix)) {
            const name = key.substring(prefix.length);
            components[name] = component;
          }
        });
        return components;
      }
    }
    
    // Create registry instance
    const registry = new SimpleRegistry();
    
    // Create hierarchy registrar
    class SimpleHierarchyRegistrar {
      constructor(compiler, registry, runtimeContext) {
        this.compiler = compiler;
        this.registry = registry;
        this.runtimeContext = runtimeContext;
      }
      
      async registerHierarchy(rootSpec, options = {}) {
        const registeredComponents = [];
        const errors = [];
        const warnings = [];
        
        // Register components recursively
        const registerSpec = async (spec) => {
          // Register children first
          const children = spec.dependencies || [];
          for (const child of children) {
            await registerSpec(child);
          }
          
          // Register this component
          if (spec.code) {
            const result = await this.compiler.compile({
              componentName: spec.name,
              componentCode: spec.code
            });
            
            if (result.success) {
              const factory = result.component.component(this.runtimeContext, {});
              this.registry.register(spec.name, factory.component);
              registeredComponents.push(spec.name);
            } else {
              errors.push({
                componentName: spec.name,
                error: result.error.message,
                phase: 'compilation'
              });
            }
          }
        };
        
        await registerSpec(rootSpec);
        
        return {
          success: errors.length === 0,
          registeredComponents,
          errors,
          warnings
        };
      }
    }
    
    const hierarchyRegistrar = new SimpleHierarchyRegistrar(compiler, registry, runtimeContext);
    
    // BuildUtilities function - uses real MJ utilities exposed via Playwright
    const BuildUtilities = () => {
      const utilities = {
        md: {
          entities: () => {
            return window.__mjGetEntities();
          },
          GetEntityObject: async (entityName) => {
            return await window.__mjGetEntityObject(entityName);
          }
        },
        rv: {
          RunView: async (params) => {
            return await window.__mjRunView(params);
          },
          RunViews: async (params) => {
            return await window.__mjRunViews(params);
          }
        },
        rq: {
          RunQuery: async (params) => {
            return await window.__mjRunQuery(params);
          }
        }
      };
      return utilities;
    };
    
    // SetupStyles function - copied from skip-chat implementation
    const SetupStyles = () => ({
      colors: {
        primary: '#5B4FE9',
        primaryHover: '#4940D4',
        primaryLight: '#E8E6FF',
        secondary: '#64748B',
        secondaryHover: '#475569',
        success: '#10B981',
        successLight: '#D1FAE5',
        warning: '#F59E0B',
        warningLight: '#FEF3C7',
        error: '#EF4444',
        errorLight: '#FEE2E2',
        info: '#3B82F6',
        infoLight: '#DBEAFE',
        background: '#FFFFFF',
        surface: '#F8FAFC',
        surfaceHover: '#F1F5F9',
        text: '#1E293B',
        textSecondary: '#64748B',
        textTertiary: '#94A3B8',
        textInverse: '#FFFFFF',
        border: '#E2E8F0',
        borderLight: '#F1F5F9',
        borderFocus: '#5B4FE9',
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
    });
    
    // Load component spec and register hierarchy
    const componentSpec = ${specJson};
    const props = ${propsJson};
    
    (async () => {
      // Register the component hierarchy
      const result = await hierarchyRegistrar.registerHierarchy(componentSpec);
      
      if (!result.success) {
        console.error('Failed to register components:', result.errors);
        return;
      }
      
      // Get all registered components
      const components = registry.getAll();
      
      // Get the root component
      const RootComponent = registry.get(componentSpec.name);
      
      if (!RootComponent) {
        console.error('Root component not found:', componentSpec.name);
        return;
      }
      
      // Simple in-memory storage for user settings
      let savedUserSettings = {};
      
      // Create root for rendering
      const root = ReactDOM.createRoot(document.getElementById('root'));
      
      // Function to render with current settings
      const renderWithSettings = () => {
        const enhancedProps = {
          ...props,
          components: components,
          utilities: BuildUtilities(),
          styles: SetupStyles(),
          savedUserSettings: savedUserSettings,
          onSaveUserSettings: (newSettings) => {
            console.log('User settings saved:', newSettings);
            // Update in-memory storage
            savedUserSettings = { ...newSettings };
            // Re-render with new settings
            renderWithSettings();
          }
        };
        
        root.render(React.createElement(RootComponent, enhancedProps));
      };
      
      // Initial render
      renderWithSettings();
    })();
  </script>
</body>
</html>`;
  }

  /**
   * Checks if a console message is a warning
   */
  private isWarning(type: string, text: string): boolean {
    return type === 'warning' || text.startsWith('Warning:');
  }

  /**
   * Checks if a warning is critical and should fail the test
   */
  private isCriticalWarning(text: string): boolean {
    return ComponentRunner.CRITICAL_WARNING_PATTERNS.some(pattern => pattern.test(text));
  }

  /**
   * Sets up console logging with warning detection
   */
  private setupConsoleLogging(
    page: any,
    consoleLogs: { type: string; text: string }[],
    warnings: string[],
    criticalWarnings: string[]
  ): void {
    page.on('console', (msg: any) => {
      const type = msg.type();
      const text = msg.text();
      
      consoleLogs.push({ type, text });
      
      if (this.isWarning(type, text)) {
        warnings.push(text);
        
        if (this.isCriticalWarning(text)) {
          criticalWarnings.push(text);
        }
      }
    });
  }

  /**
   * Sets up error handling for the page
   */
  private setupErrorHandling(page: any, errors: string[]): void {
    page.on('pageerror', (error: Error) => {
      errors.push(error.message);
    });
  }

  /**
   * Injects render tracking code into the page
   */
  private async injectRenderTracking(page: any): Promise<void> {
    // Instead of using evaluateOnNewDocument, we'll inject the script directly into the HTML
    // This avoids the Playwright-specific API issue
    // The actual injection will happen in createHTMLTemplate
  }

  /**
   * Waits for component to render and checks for timeouts
   */
  private async waitForRender(
    page: any,
    options: ComponentExecutionOptions,
    errors: string[]
  ): Promise<boolean> {
    const timeout = options.timeout || 10000; // 10 seconds default
    
    try {
      if (options.waitForSelector) {
        await this.browserManager.waitForSelector(options.waitForSelector, { timeout });
      }

      if (options.waitForLoadState) {
        await this.browserManager.waitForLoadState(options.waitForLoadState);
      } else {
        // Default wait for React to finish rendering
        await page.waitForTimeout(100);
      }
      
      return true;
    } catch (timeoutError) {
      errors.push(`Component rendering timeout after ${timeout}ms - possible infinite render loop`);
      return false;
    }
  }

  /**
   * Gets the render count from the page
   */
  private async getRenderCount(page: any): Promise<number> {
    return await page.evaluate(() => (window as any).__testHarnessRenderCount || 0);
  }

  /**
   * Determines if the component execution was successful
   */
  private determineSuccess(
    errors: string[],
    criticalWarnings: string[],
    renderCount: number,
    hasTimeout: boolean
  ): { success: boolean; additionalErrors: string[] } {
    const additionalErrors: string[] = [];
    
    if (renderCount > ComponentRunner.MAX_RENDER_COUNT) {
      additionalErrors.push(`Excessive render count: ${renderCount} renders detected`);
    }
    
    const success = errors.length === 0 && 
                   criticalWarnings.length === 0 && 
                   !hasTimeout && 
                   renderCount <= ComponentRunner.MAX_RENDER_COUNT;
    
    return { success, additionalErrors };
  }

  /**
   * Expose MemberJunction utilities to the browser context
   */
  private async exposeMJUtilities(page: any, contextUser: UserInfo): Promise<void> {
    // Check if utilities are already exposed
    const alreadyExposed = await page.evaluate(() => {
      return typeof (window as any).__mjGetEntityObject === 'function';
    });
    
    if (alreadyExposed) {
      return; // Already exposed, skip
    }
    // Create instances in Node.js context
    const metadata = new Metadata();
    const runView = new RunView();
    const runQuery = new RunQuery();
    
    // Expose individual functions since we can't pass complex objects
    await page.exposeFunction('__mjGetEntityObject', async (entityName: string) => {
      try {
        const entity = await metadata.GetEntityObject(entityName, contextUser);
        return entity;
      } catch (error) {
        console.error('Error in __mjGetEntityObject:', error);
        return null;
      }
    });
    await page.exposeFunction('__mjGetEntities',() => {
      try {
        return metadata.Entities;
      } catch (error) {
        console.error('Error in __mjGetEntities:', error);
        return null;
      }
    });
    
    await page.exposeFunction('__mjRunView', async (params: RunViewParams) => {
      try {
        return await runView.RunView(params, contextUser);
      } catch (error) {
        console.error('Error in __mjRunView:', error);
        const errorMessage = error instanceof Error ? error.message : String(error);
        return { Success: false, ErrorMessage: errorMessage, Results: [] };
      }
    });
    
    await page.exposeFunction('__mjRunViews', async (params: RunViewParams[]) => {
      try {
        return await runView.RunViews(params, contextUser);
      } catch (error) {
        console.error('Error in __mjRunViews:', error);
        const errorMessage = error instanceof Error ? error.message : String(error);
        return params.map(() => ({ Success: false, ErrorMessage: errorMessage, Results: [] }));
      }
    });
    
    await page.exposeFunction('__mjRunQuery', async (params: RunQueryParams) => {
      try {
        return await runQuery.RunQuery(params, contextUser);
      } catch (error) {
        console.error('Error in __mjRunQuery:', error);
        const errorMessage = error instanceof Error ? error.message : String(error);
        return { Success: false, ErrorMessage: errorMessage, Results: [] };
      }
    });
  }

  /**
   * Analyze component errors to identify failed components
   * @param errors Array of error messages
   * @returns Array of component names that failed
   */
  static analyzeComponentErrors(errors: string[]): string[] {
    return ComponentErrorAnalyzer.identifyFailedComponents(errors);
  }

  /**
   * Get detailed error analysis
   * @param errors Array of error messages
   * @returns Detailed failure information
   */
  static getDetailedErrorAnalysis(errors: string[]) {
    return ComponentErrorAnalyzer.analyzeComponentErrors(errors);
  }
  
  /**
   * Gets the ComponentCompiler code to inject into the browser
   * This is a simplified version that works in the browser context
   */
  private getComponentCompilerCode(): string {
    // Return a browser-compatible version of ComponentCompiler
    return `
    class ComponentCompiler {
      constructor() {
        this.cache = new Map();
      }
      
      setBabelInstance(babel) {
        this.babelInstance = babel;
      }
      
      async compile(options) {
        const { componentName, componentCode } = options;
        
        try {
          // Validate inputs
          if (!componentName || !componentCode) {
            throw new Error('componentName and componentCode are required');
          }
          
          // Wrap component code
          const wrappedCode = this.wrapComponentCode(componentCode, componentName);
          
          // Transform using Babel
          const result = this.babelInstance.transform(wrappedCode, {
            presets: ['react'],
            filename: componentName + '.jsx'
          });
          
          // Create factory
          const componentFactory = this.createComponentFactory(result.code, componentName);
          
          return {
            success: true,
            component: {
              component: componentFactory,
              id: componentName + '_' + Date.now(),
              name: componentName,
              compiledAt: new Date(),
              warnings: []
            },
            duration: 0
          };
        } catch (error) {
          return {
            success: false,
            error: {
              message: error.message,
              componentName: componentName,
              phase: 'compilation'
            },
            duration: 0
          };
        }
      }
      
      wrapComponentCode(componentCode, componentName) {
        // Make component libraries available in scope
        const libraryDeclarations = componentLibraries
          .map(lib => \`const \${lib.globalVariable} = libraries['\${lib.globalVariable}'];\`)
          .join('\\n        ');
          
        return \`
          function createComponent(
            React, ReactDOM,
            useState, useEffect, useCallback, useMemo, useRef, useContext, useReducer, useLayoutEffect,
            libraries, styles, console
          ) {
            \${libraryDeclarations}
            
            \${componentCode}
            
            if (typeof \${componentName} === 'undefined') {
              throw new Error('Component "\${componentName}" is not defined in the provided code');
            }
            
            return {
              component: \${componentName},
              print: function() { window.print(); },
              refresh: function(data) { }
            };
          }
        \`;
      }
      
      createComponentFactory(transpiledCode, componentName) {
        const factoryCreator = new Function(
          'React', 'ReactDOM',
          'useState', 'useEffect', 'useCallback', 'useMemo', 'useRef', 'useContext', 'useReducer', 'useLayoutEffect',
          'libraries', 'styles', 'console',
          transpiledCode + '; return createComponent;'
        );
        
        return (context, styles = {}) => {
          const { React, ReactDOM, libraries = {} } = context;
          
          const createComponentFn = factoryCreator(
            React, ReactDOM,
            React.useState, React.useEffect, React.useCallback, React.useMemo,
            React.useRef, React.useContext, React.useReducer, React.useLayoutEffect,
            libraries, styles, console
          );
          
          return createComponentFn(
            React, ReactDOM,
            React.useState, React.useEffect, React.useCallback, React.useMemo,
            React.useRef, React.useContext, React.useReducer, React.useLayoutEffect,
            libraries, styles, console
          );
        };
      }
    }
    `;
  }
}