import { BrowserManager } from './browser-context';
import { 
  ComponentCompiler, 
  RuntimeContext,
  ComponentRegistry,
  STANDARD_LIBRARY_URLS,
  getCoreLibraryUrls
} from '@memberjunction/react-runtime';

export interface ComponentExecutionOptions {
  componentSpec: ComponentSpec;
  props?: Record<string, any>;
  setupCode?: string;
  timeout?: number;
  waitForSelector?: string;
  waitForLoadState?: 'load' | 'domcontentloaded' | 'networkidle';
}

export interface ComponentSpec {
  componentName: string;
  componentCode?: string;
  childComponents?: ComponentSpec[];
  components?: ComponentSpec[]; // Alternative property name for children
}

export interface ComponentExecutionResult {
  success: boolean;
  html: string;
  errors: string[];
  console: { type: string; text: string }[];
  screenshot?: Buffer;
  executionTime: number;
}

export class ComponentRunner {
  private compiler: ComponentCompiler;
  private registry: ComponentRegistry;
  private runtimeContext: RuntimeContext;

  constructor(private browserManager: BrowserManager) {
    this.compiler = new ComponentCompiler();
    this.registry = new ComponentRegistry();
    
    // Set up runtime context (will be populated in browser)
    this.runtimeContext = {} as RuntimeContext;
  }

  async executeComponent(options: ComponentExecutionOptions): Promise<ComponentExecutionResult> {
    const startTime = Date.now();
    const errors: string[] = [];
    const consoleLogs: { type: string; text: string }[] = [];

    try {
      const page = await this.browserManager.getPage();

      // Set up console logging
      page.on('console', (msg: any) => {
        consoleLogs.push({ type: msg.type(), text: msg.text() });
      });

      // Set up error handling
      page.on('pageerror', (error: Error) => {
        errors.push(error.message);
      });

      // Create HTML template that uses the runtime's ComponentHierarchyRegistrar
      const htmlContent = this.createHTMLTemplate(options);
      
      // Navigate to a data URL with the HTML content
      await page.goto(`data:text/html;charset=utf-8,${encodeURIComponent(htmlContent)}`);

      // Wait for React to render
      if (options.waitForSelector) {
        await this.browserManager.waitForSelector(options.waitForSelector, { 
          timeout: options.timeout || 30000 
        });
      }

      if (options.waitForLoadState) {
        await this.browserManager.waitForLoadState(options.waitForLoadState);
      } else {
        // Default wait for React to finish rendering
        await page.waitForTimeout(100);
      }

      // Get the rendered HTML
      const html = await this.browserManager.getContent();

      // Take screenshot if needed
      const screenshot = await this.browserManager.screenshot();

      return {
        success: errors.length === 0,
        html,
        errors,
        console: consoleLogs,
        screenshot,
        executionTime: Date.now() - startTime
      };
    } catch (error) {
      errors.push(error instanceof Error ? error.message : String(error));
      return {
        success: false,
        html: '',
        errors,
        console: consoleLogs,
        executionTime: Date.now() - startTime
      };
    }
  }

  private createHTMLTemplate(options: ComponentExecutionOptions): string {
    const propsJson = JSON.stringify(options.props || {});
    const specJson = JSON.stringify(options.componentSpec);
    
    // Generate script tags for core libraries
    const coreLibraryScripts = getCoreLibraryUrls()
      .map(url => `  <script src="${url}"></script>`)
      .join('\n');
    
    return `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <title>React Component Test</title>
  <script crossorigin src="${STANDARD_LIBRARY_URLS.REACT}"></script>
  <script crossorigin src="${STANDARD_LIBRARY_URLS.REACT_DOM}"></script>
  <script src="${STANDARD_LIBRARY_URLS.BABEL}"></script>
${coreLibraryScripts}
  <style>
    body { margin: 0; padding: 20px; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; }
    #root { min-height: 100vh; }
  </style>
</head>
<body>
  <div id="root"></div>
  <script type="text/babel">
    ${options.setupCode || ''}
    
    // Create runtime context
    const runtimeContext = {
      React: React,
      ReactDOM: ReactDOM,
      libraries: {
        _: window._,
        d3: window.d3,
        Chart: window.Chart,
        dayjs: window.dayjs
      }
    };
    
    // Create component compiler
    class SimpleCompiler {
      constructor() {
        this.cache = new Map();
      }
      
      async compile(options) {
        const componentName = options.componentName;
        const componentCode = options.componentCode;
        
        try {
          // Transform JSX to JS using Babel
          const transformed = Babel.transform(componentCode, {
            presets: ['react'],
            filename: componentName + '.jsx'
          });
          
          // Create component factory
          const createComponent = new Function(
            'React', 'ReactDOM', 'useState', 'useEffect', 'useCallback',
            'createStateUpdater', 'libraries', 'styles', 'console',
            \`
            // Make libraries available in the component scope
            const _ = libraries._;
            const d3 = libraries.d3;
            const Chart = libraries.Chart;
            const dayjs = libraries.dayjs;
            
            \${transformed.code}
            return {
              component: \${componentName},
              print: function() { window.print(); },
              refresh: function(data) { }
            };
            \`
          );
          
          const componentFactory = (context, styles = {}) => {
            const { React, ReactDOM, libraries = {} } = context;
            const createStateUpdater = (statePath, parentStateUpdater) => {
              return (componentStateUpdate) => {
                if (!statePath) {
                  parentStateUpdater(componentStateUpdate);
                } else {
                  const pathParts = statePath.split('.');
                  const componentKey = pathParts[pathParts.length - 1];
                  parentStateUpdater({ [componentKey]: componentStateUpdate });
                }
              };
            };
            
            return createComponent(
              React,
              ReactDOM,
              React.useState,
              React.useEffect,
              React.useCallback,
              createStateUpdater,
              libraries,
              styles,
              console
            );
          };
          
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
      
      setBabelInstance(babel) {
        // Already have access to Babel global
      }
    }
    
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
    
    // Create instances
    const compiler = new SimpleCompiler();
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
          const children = spec.childComponents || spec.components || [];
          for (const child of children) {
            await registerSpec(child);
          }
          
          // Register this component
          if (spec.componentCode) {
            const result = await this.compiler.compile({
              componentName: spec.componentName,
              componentCode: spec.componentCode
            });
            
            if (result.success) {
              const factory = result.component.component(this.runtimeContext, {});
              this.registry.register(spec.componentName, factory.component);
              registeredComponents.push(spec.componentName);
            } else {
              errors.push({
                componentName: spec.componentName,
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
    
    // BuildUtilities function - copied from skip-chat implementation
    const BuildUtilities = () => {
      // Create mock utilities for testing
      // In production, this would use the actual Metadata, RunView, and RunQuery
      const utilities = {
        md: {
          entities: []
        },
        rv: {
          runView: async (params) => {
            console.log('Mock runView called with:', params);
            return { Results: [], Success: true };
          },
          runViews: async (params) => {
            console.log('Mock runViews called with:', params);
            return params.map(() => ({ Results: [], Success: true }));
          }
        },
        rq: {
          runQuery: async (params) => {
            console.log('Mock runQuery called with:', params);
            return { Results: [], Success: true };
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
      const RootComponent = registry.get(componentSpec.componentName);
      
      if (!RootComponent) {
        console.error('Root component not found:', componentSpec.componentName);
        return;
      }
      
      // Add components, utilities, and styles to props
      const enhancedProps = {
        ...props,
        components: components,
        utilities: BuildUtilities(),
        styles: SetupStyles()
      };
      
      // Render the root component
      const root = ReactDOM.createRoot(document.getElementById('root'));
      root.render(React.createElement(RootComponent, enhancedProps));
    })();
  </script>
</body>
</html>`;
  }
}