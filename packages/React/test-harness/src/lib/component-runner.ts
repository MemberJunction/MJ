import { BrowserManager } from './browser-context';
import { 
  ComponentCompiler, 
  RuntimeContext,
  ComponentRegistry,
  ComponentErrorAnalyzer,
  StandardLibraryManager,
  LibraryConfiguration,
  LibraryRegistry
} from '@memberjunction/react-runtime';
import { Metadata, RunView, RunQuery } from '@memberjunction/core';
import type { RunViewParams, RunQueryParams, UserInfo } from '@memberjunction/core';
import { ComponentLinter, FixSuggestion, Violation } from './component-linter';
import { ComponentSpec } from '@memberjunction/interactive-component-types';
import { ComponentMetadataEngine } from '@memberjunction/core-entities';

export interface ComponentExecutionOptions {
  componentSpec: ComponentSpec;
  props?: Record<string, any>;
  setupCode?: string;
  timeout?: number;
  renderWaitTime?: number; // Default 500ms for render completion
  asyncErrorWaitTime?: number; // Optional wait for async operations - no default
  waitForSelector?: string;
  waitForLoadState?: 'load' | 'domcontentloaded' | 'networkidle';
  contextUser: UserInfo;
  libraryConfiguration?: LibraryConfiguration;
  isRootComponent?: boolean; // Whether this is a root component (for prop validation)
  debug?: boolean; // Enable debug output - default true
}
 

export interface ComponentExecutionResult {
  success: boolean;
  html: string;
  errors: Violation[];
  warnings: Violation[];
  criticalWarnings: string[];
  console: { type: string; text: string }[];
  screenshot?: Buffer;
  executionTime: number;
  renderCount?: number;
  lintViolations?: Violation[];
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
    componentSpec?: any,
    isRootComponent?: boolean
  ): Promise<{ violations: Violation[]; suggestions: FixSuggestion[]; hasErrors: boolean }> {
    const lintResult = await ComponentLinter.lintComponent(
      componentCode,
      componentName,
      componentSpec,
      isRootComponent
    );

    const hasErrors = lintResult.violations.some(v => v.severity === 'critical' || v.severity === 'high');

    return {
      violations: lintResult.violations,
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
    
    // Default debug to true
    const debug = options.debug !== false;
    
    if (debug) {
      console.log('\n🔍 === Component Execution Debug Mode ===');
      console.log('Component:', options.componentSpec.name);
      console.log('Props:', JSON.stringify(options.props || {}, null, 2));
    }

    try {
      const page = await this.browserManager.getPage();
      
      // Clear the page before each test for isolation
      await page.goto('about:blank');
      
      // Expose MJ utilities to the page
      await this.exposeMJUtilities(page, options.contextUser);
      
      // Then set up monitoring
      this.setupConsoleLogging(page, consoleLogs, warnings, criticalWarnings);
      this.setupErrorHandling(page, errors);
      await this.injectRenderTracking(page);

      // Create and load the component (now async to support LibraryRegistry initialization)
      const htmlContent = await this.createHTMLTemplate(options);
      await page.goto(`data:text/html;charset=utf-8,${encodeURIComponent(htmlContent)}`);

      // Wait for render with timeout detection
      const renderSuccess = await this.waitForRender(page, options, errors);
      
      // Get render count
      renderCount = await this.getRenderCount(page);
      
      // Collect runtime errors
      const runtimeErrors = await this.collectRuntimeErrors(page);
      errors.push(...runtimeErrors);
      
      // ALWAYS capture async errors with a default timeout
      // This ensures we catch setTimeout, Promise rejections, and async effect errors
      const asyncWaitTime = options.asyncErrorWaitTime || 1000; // Default 1 second
      const asyncErrors = await this.captureAsyncErrors(page, asyncWaitTime);
      errors.push(...asyncErrors);
      
      // Perform deep render validation
      const deepRenderErrors = await this.validateDeepRender(page);
      errors.push(...deepRenderErrors);

      // Get the rendered HTML
      const html = await page.content();

      // Take screenshot if needed
      const screenshot = await page.screenshot();

      // Determine success and collect any additional errors
      const { success, additionalErrors } = this.determineSuccess(
        errors,
        criticalWarnings,
        renderCount,
        !renderSuccess
      );
      
      // Add any additional errors
      errors.push(...additionalErrors);
      
      const result = {
        success,
        html,
        errors: errors.map(e => {
          return {
            message: e,
            severity: 'critical'
          } as Violation; // Ensure Violation type
        }),
        warnings: warnings.map(w => {
          return {
            message: w,
            severity: 'low'
          } as Violation; // Ensure Violation type
        }),
        criticalWarnings,
        console: consoleLogs,
        screenshot,
        executionTime: Date.now() - startTime,
        renderCount
      };
      
      if (debug) {
        this.dumpDebugInfo(result);
      }

      return result;
    } catch (error) {
      errors.push(error instanceof Error ? error.message : String(error));
      const result = {
        success: false,
        html: '',
        errors: errors.map(e => {
          return {
            message: e,
            severity: 'critical'
          } as Violation; // Ensure Violation type
        }),
        warnings: warnings.map(w => {
          return {
            message: w,
            severity: 'low'
          } as Violation; // Ensure Violation type
        }),
        criticalWarnings,
        console: consoleLogs,
        executionTime: Date.now() - startTime,
        renderCount
      };
      
      if (debug) {
        console.log('\n❌ Component execution failed with error:', error);
        this.dumpDebugInfo(result);
      }
      
      return result;
    }
  }
  
  /**
   * Dumps debug information to console for easier troubleshooting
   */
  private dumpDebugInfo(result: ComponentExecutionResult): void {
    console.log('\n📊 === Component Execution Results ===');
    console.log('Success:', result.success ? '✅' : '❌');
    console.log('Execution time:', result.executionTime + 'ms');
    console.log('Render count:', result.renderCount);
    
    if (result.console && result.console.length > 0) {
      console.log('\n📝 Console Output:');
      result.console.forEach(log => {
        const icon = log.type === 'error' ? '❌' : 
                     log.type === 'warning' ? '⚠️' : 
                     log.type === 'log' ? '📝' : '💬';
        console.log(`  ${icon} [${log.type}] ${log.text}`);
      });
    }
    
    if (result.errors && result.errors.length > 0) {
      console.log('\n❌ Errors:', result.errors.length);
      result.errors.forEach((err, i) => {
        const message = typeof err === 'string' ? err : err.message;
        console.log(`  ${i + 1}. ${message}`);
      });
    }
    
    if (result.warnings && result.warnings.length > 0) {
      console.log('\n⚠️ Warnings:', result.warnings.length);
      result.warnings.forEach((warn, i) => {
        const message = typeof warn === 'string' ? warn : warn.message;
        console.log(`  ${i + 1}. ${message}`);
      });
    }
    
    if (result.criticalWarnings && result.criticalWarnings.length > 0) {
      console.log('\n🔴 Critical Warnings:', result.criticalWarnings.length);
      result.criticalWarnings.forEach((warn, i) => {
        console.log(`  ${i + 1}. ${warn}`);
      });
    }
    
    if (result.html) {
      const htmlPreview = result.html.substring(0, 200);
      console.log('\n📄 HTML Preview:', htmlPreview + (result.html.length > 200 ? '...' : ''));
    }
    
    console.log('\n========================================\n');
  }

  private async createHTMLTemplate(options: ComponentExecutionOptions): Promise<string> {
    const propsJson = JSON.stringify(options.props || {});
    const specJson = JSON.stringify(options.componentSpec);
    
    // Initialize LibraryRegistry with contextUser for proper database-driven library loading
    // This ensures we use the same approved libraries as the runtime
    await ComponentMetadataEngine.Instance.Config(false, options.contextUser);
    await LibraryRegistry.Config(false, ComponentMetadataEngine.Instance.ComponentLibraries);
    
    // Set configuration if provided (for backward compatibility)
    if (options.libraryConfiguration) {
      StandardLibraryManager.setConfiguration(options.libraryConfiguration);
    }
    
    // Get all enabled libraries from configuration (for React/ReactDOM/Babel)
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
    body { 
      margin: 0; 
      padding: 20px; 
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
      background-color: #f0f0f0; /* Light gray background to see contrast */
    }
    #root { 
      min-height: 100vh;
      background-color: white;
      border: 2px solid #007bff;
      padding: 20px;
      box-shadow: 0 0 10px rgba(0,0,0,0.1);
    }
    .test-harness-header {
      background-color: #28a745;
      color: white;
      padding: 10px;
      margin-bottom: 20px;
      border-radius: 5px;
      font-weight: bold;
      text-align: center;
    }
  </style>
  <script>
    // Track library load timeout
    const LIBRARY_LOAD_TIMEOUT = 5000; // 5 seconds
    let libraryLoadTimer = null;
    
    // Initialize comprehensive error tracking
    window.__testHarnessRuntimeErrors = [];
    window.__testHarnessConsoleLogs = [];
    window.__testHarnessConsoleErrors = [];
    window.__testHarnessTestFailed = false;
    window.__testHarnessLibraryLoadErrors = [];
    
    // Override console.error to capture ALL error logs
    const originalConsoleError = console.error;
    const originalConsoleWarn = console.warn;
    
    console.error = function(...args) {
      const errorText = args.map(arg => typeof arg === 'object' ? JSON.stringify(arg) : String(arg)).join(' ');
      window.__testHarnessConsoleLogs.push({
        type: 'error',
        text: errorText
      });
      window.__testHarnessConsoleErrors.push(errorText);
      // Mark test as failed immediately
      window.__testHarnessTestFailed = true;
      originalConsoleError.apply(console, args);
    };
    
    console.warn = function(...args) {
      const warnText = args.map(arg => typeof arg === 'object' ? JSON.stringify(arg) : String(arg)).join(' ');
      window.__testHarnessConsoleLogs.push({
        type: 'warning',
        text: warnText
      });
      originalConsoleWarn.apply(console, args);
    };
    
    // Global error handler - catches uncaught errors
    window.addEventListener('error', (event) => {
      const errorInfo = {
        message: event.error?.message || event.message || 'Unknown error',
        stack: event.error?.stack || 'No stack trace',
        filename: event.filename,
        lineno: event.lineno,
        colno: event.colno,
        type: 'runtime'
      };
      window.__testHarnessRuntimeErrors.push(errorInfo);
      window.__testHarnessTestFailed = true;
      console.error('Uncaught error:', errorInfo);
      // Don't prevent default - let it propagate
    });
    
    // Unhandled promise rejection handler
    window.addEventListener('unhandledrejection', (event) => {
      const errorInfo = {
        message: 'Unhandled Promise Rejection: ' + (event.reason?.message || event.reason || 'Unknown reason'),
        stack: event.reason?.stack || 'No stack trace available',
        type: 'promise-rejection'
      };
      window.__testHarnessRuntimeErrors.push(errorInfo);
      window.__testHarnessTestFailed = true;
      console.error('Unhandled promise rejection:', event.reason);
      // Prevent the default handling (which would only log to console)
      event.preventDefault();
    });
    
    // Monitor window.onerror directly as well
    window.onerror = function(message, source, lineno, colno, error) {
      const errorInfo = {
        message: message?.toString() || 'Unknown error',
        source: source,
        lineno: lineno,
        colno: colno,
        stack: error?.stack || 'No stack trace',
        type: 'window.onerror'
      };
      window.__testHarnessRuntimeErrors.push(errorInfo);
      window.__testHarnessTestFailed = true;
      return false; // Don't suppress the error
    };
    
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
  <div class="test-harness-header">
    🧪 React Test Harness - Component Loaded Successfully
  </div>
  <div id="root" data-testid="react-root">
    <!-- Component will render here -->
  </div>
  <script type="text/babel">
    // Immediate debug message
    console.log('🚀 Test harness script started executing');
    document.getElementById('root').innerHTML = '<div style="background: lime; padding: 20px; color: black; font-size: 18px;">📝 Script is running...</div>';
    
    ${options.setupCode || ''}
    
    // Create runtime context with dynamic libraries - WITH VALIDATION
    const componentLibraries = ${JSON.stringify(
      componentLibraries.map((lib: any) => ({ 
        globalVariable: lib.globalVariable,
        displayName: lib.displayName,
        cdnUrl: lib.cdnUrl
      }))
    )};
    
    const libraries = {};
    const libraryLoadErrors = [];
    
    // Validate that all required libraries loaded successfully
    componentLibraries.forEach(lib => {
      if (window[lib.globalVariable]) {
        libraries[lib.globalVariable] = window[lib.globalVariable];
        console.log('✅ Library loaded successfully:', lib.displayName, '(' + lib.globalVariable + ')');
      } else {
        const errorMsg = 'Library failed to load: ' + lib.displayName + ' (expected global: ' + lib.globalVariable + ', CDN: ' + lib.cdnUrl + ')';
        libraryLoadErrors.push(errorMsg);
        window.__testHarnessLibraryLoadErrors.push(errorMsg);
        window.__testHarnessTestFailed = true;
        console.error('❌ ' + errorMsg);
      }
    });
    
    // Fail fast if libraries didn't load
    if (libraryLoadErrors.length > 0) {
      const errorDiv = document.createElement('div');
      errorDiv.style.cssText = 'background: red; color: white; padding: 20px; font-weight: bold;';
      errorDiv.textContent = 'LIBRARY LOAD FAILURES: ' + libraryLoadErrors.join(', ');
      document.body.insertBefore(errorDiv, document.body.firstChild);
      // Still continue to see what other errors might occur
    }
    
    const runtimeContext = {
      React: React,
      ReactDOM: ReactDOM,
      libraries: libraries
    };
    
    // Import the ComponentCompiler implementation
    ${componentCompilerCode}
    
    // Create component compiler instance with library support
    const compiler = new ComponentCompiler();
    compiler.setBabelInstance(Babel);
    
    // Configure compiler to use libraries from the component spec
    // The compiler will handle loading through its own mechanism
    
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
          
          // Register this component with its library dependencies
          if (spec.code) {
            const result = await this.compiler.compile({
              componentName: spec.name,
              componentCode: spec.code,
              libraries: spec.libraries || [] // Pass library dependencies from spec
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
    
    // React Error Boundary component - FAIL HARD version
    const ErrorBoundary = class extends React.Component {
      constructor(props) {
        super(props);
        this.state = { hasError: false, error: null };
      }
      
      static getDerivedStateFromError(error) {
        // Mark test as failed immediately
        window.__testHarnessTestFailed = true;
        return { hasError: true, error };
      }
      
      componentDidCatch(error, errorInfo) {
        console.error('React Error Boundary caught:', error, errorInfo);
        window.__testHarnessRuntimeErrors = window.__testHarnessRuntimeErrors || [];
        window.__testHarnessRuntimeErrors.push({
          message: error.message,
          stack: error.stack,
          componentStack: errorInfo.componentStack,
          type: 'react-error-boundary'
        });
        
        // Mark test as failed
        window.__testHarnessTestFailed = true;
        
        // Add to console errors for visibility
        window.__testHarnessConsoleErrors = window.__testHarnessConsoleErrors || [];
        window.__testHarnessConsoleErrors.push('React Error Boundary: ' + error.message);
        
        // Add data attribute to DOM for Playwright detection
        document.body.setAttribute('data-test-failed', 'true');
        document.body.setAttribute('data-test-error', error.message);
      }
      
      render() {
        if (this.state.hasError) {
          // DO NOT render fallback UI - re-throw the error to fail hard
          // This ensures the test fails completely instead of silently continuing
          throw this.state.error;
        }
        return this.props.children;
      }
    };
    
    // Load component spec and register hierarchy
    const componentSpec = ${specJson};
    const props = ${propsJson};
    
    (async () => {
      console.log('📦 Starting component initialization...');
      console.log('React available:', typeof React !== 'undefined');
      console.log('ReactDOM available:', typeof ReactDOM !== 'undefined');
      console.log('Babel available:', typeof Babel !== 'undefined');
      
      // Set library load timeout
      libraryLoadTimer = setTimeout(() => {
        const missingLibs = [];
        if (typeof React === 'undefined') missingLibs.push('React');
        if (typeof ReactDOM === 'undefined') missingLibs.push('ReactDOM');
        if (typeof Babel === 'undefined') missingLibs.push('Babel');
        
        if (missingLibs.length > 0) {
          const errorMsg = 'Critical libraries failed to load within ' + LIBRARY_LOAD_TIMEOUT + 'ms: ' + missingLibs.join(', ');
          console.error(errorMsg);
          window.__testHarnessLibraryLoadErrors.push(errorMsg);
          window.__testHarnessTestFailed = true;
          document.body.setAttribute('data-test-failed', 'true');
          document.body.setAttribute('data-test-error', errorMsg);
        }
      }, LIBRARY_LOAD_TIMEOUT);
      
      // Update the root to show progress
      document.getElementById('root').innerHTML = '<div style="background: cyan; padding: 20px; color: black;">🔄 Initializing components...</div>';
      
      // Clear the library load timeout since libraries are available
      if (libraryLoadTimer) {
        clearTimeout(libraryLoadTimer);
        libraryLoadTimer = null;
      }
      
      // First, test that React is working with a simple component
      const TestComponent = () => React.createElement('div', {
        style: { 
          background: 'yellow', 
          padding: '10px', 
          margin: '10px 0',
          border: '2px solid orange',
          color: 'black',
          fontSize: '16px',
          fontWeight: 'bold'
        }
      }, '🔧 React is working! Now loading your component...');
      
      const testRoot = ReactDOM.createRoot(document.getElementById('root'));
      testRoot.render(React.createElement(TestComponent));
      
      // Wait a moment to show the test component
      await new Promise(resolve => setTimeout(resolve, 500));
      
      // Now proceed with the actual component
      // Register the component hierarchy
      const result = await hierarchyRegistrar.registerHierarchy(componentSpec);
      
      if (!result.success) {
        const errorMsg = 'Failed to register components: ' + JSON.stringify(result.errors);
        console.error(errorMsg);
        window.__testHarnessRuntimeErrors.push({
          message: errorMsg,
          type: 'component-registration',
          errors: result.errors
        });
        window.__testHarnessTestFailed = true;
        document.body.setAttribute('data-test-failed', 'true');
        document.body.setAttribute('data-test-error', errorMsg);
        document.getElementById('root').innerHTML = '<div style="color: white; background: red; padding: 20px; font-weight: bold;">COMPONENT REGISTRATION FAILED: ' + JSON.stringify(result.errors) + '</div>';
        throw new Error(errorMsg);
      }
      
      // Get all registered components
      const components = registry.getAll();
      
      // Get the root component
      const RootComponent = registry.get(componentSpec.name);
      
      if (!RootComponent) {
        const errorMsg = 'Root component not found: ' + componentSpec.name;
        console.error(errorMsg);
        window.__testHarnessRuntimeErrors.push({
          message: errorMsg,
          type: 'component-not-found'
        });
        window.__testHarnessTestFailed = true;
        document.body.setAttribute('data-test-failed', 'true');
        document.body.setAttribute('data-test-error', errorMsg);
        document.getElementById('root').innerHTML = '<div style="color: white; background: red; padding: 20px; font-weight: bold;">ROOT COMPONENT NOT FOUND: ' + componentSpec.name + '</div>';
        throw new Error(errorMsg);
      }
      
      // Simple in-memory storage for user settings
      let savedUserSettings = {};
      
      // Create root for rendering
      const root = ReactDOM.createRoot(document.getElementById('root'));
      
      // Function to render with current settings
      const renderWithSettings = () => {
        console.log('🎯 Starting component render...');
        console.log('Props:', props);
        console.log('Root component found:', !!RootComponent);
        
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
        
        console.log('Enhanced props created:', Object.keys(enhancedProps));
        
        try {
          root.render(
            React.createElement(ErrorBoundary, null,
              React.createElement(RootComponent, enhancedProps)
            )
          );
          console.log('✅ Component rendered successfully');
        } catch (error) {
          console.error('❌ Render error:', error);
          document.getElementById('root').innerHTML = '<div style="color: red; padding: 20px;">Render Error: ' + error.message + '</div>';
        }
      };
      
      // Initial render
      renderWithSettings();
      
      // Add a fallback message if nothing renders after a delay
      setTimeout(() => {
        const rootElement = document.getElementById('root');
        if (rootElement) {
          const hasContent = rootElement.innerHTML.trim().length > 0;
          const hasVisibleChildren = rootElement.querySelector('*');
          
          console.log('Root element check:', {
            hasContent,
            innerHTML: rootElement.innerHTML.substring(0, 100),
            hasVisibleChildren: !!hasVisibleChildren,
            childCount: rootElement.childNodes.length
          });
          
          if (!hasContent || !hasVisibleChildren) {
            rootElement.innerHTML = '<div style="color: red; font-size: 18px; padding: 20px; border: 2px dashed red; background: #ffe6e6;">⚠️ Component did not render any visible content</div>';
          } else {
            // Force visibility on all children as a test
            const allElements = rootElement.querySelectorAll('*');
            allElements.forEach(el => {
              if (el instanceof HTMLElement) {
                // Make sure elements are visible
                if (window.getComputedStyle(el).display === 'none') {
                  el.style.display = 'block !important';
                }
                if (window.getComputedStyle(el).visibility === 'hidden') {
                  el.style.visibility = 'visible !important';
                }
                // Add a test border to see if elements exist
                el.style.border = '1px dotted red';
              }
            });
            console.log('Applied debug borders to', allElements.length, 'elements');
          }
        }
      }, 2000);
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
    const renderWaitTime = options.renderWaitTime || 500; // Default 500ms for render completion
    
    try {
      if (options.waitForSelector) {
        await page.waitForSelector(options.waitForSelector, { timeout });
      }

      if (options.waitForLoadState) {
        await page.waitForLoadState(options.waitForLoadState);
      } else {
        // Wait for React to finish rendering with configurable time
        await page.waitForTimeout(renderWaitTime);
        
        // Force React to flush all updates
        await page.evaluate(() => {
          if ((window as any).React && (window as any).React.flushSync) {
            try {
              (window as any).React.flushSync(() => {});
            } catch (e) {
              console.error('flushSync error:', e);
            }
          }
        });
        
        // Additional small wait after flush to ensure DOM updates
        await page.waitForTimeout(50);
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
   * Collects ALL runtime errors from multiple sources
   */
  private async collectRuntimeErrors(page: any): Promise<string[]> {
    const errorData = await page.evaluate(() => {
      return {
        runtimeErrors: (window as any).__testHarnessRuntimeErrors || [],
        consoleErrors: (window as any).__testHarnessConsoleErrors || [],
        libraryLoadErrors: (window as any).__testHarnessLibraryLoadErrors || [],
        testFailed: (window as any).__testHarnessTestFailed || false,
        bodyAttributes: {
          testFailed: document.body.getAttribute('data-test-failed'),
          testError: document.body.getAttribute('data-test-error')
        }
      };
    });
    
    const errors: string[] = [];
    
    // Check test failed flag first
    if (errorData.testFailed) {
      errors.push('Test marked as failed by error handlers');
    }
    
    // Collect runtime errors
    errorData.runtimeErrors.forEach((error: any) => {
      const errorMsg = `${error.type} error: ${error.message}`;
      if (!errors.includes(errorMsg)) {
        errors.push(errorMsg);
      }
      if (error.componentStack && !errors.includes(`Component stack: ${error.componentStack}`)) {
        errors.push(`Component stack: ${error.componentStack}`);
      }
      if (error.filename) {
        errors.push(`  at ${error.filename}:${error.lineno}:${error.colno}`);
      }
    });
    
    // Collect console errors
    errorData.consoleErrors.forEach((error: string) => {
      const errorMsg = `Console error: ${error}`;
      if (!errors.includes(errorMsg) && !errors.some(e => e.includes(error))) {
        errors.push(errorMsg);
      }
    });
    
    // Collect library load errors
    errorData.libraryLoadErrors.forEach((error: string) => {
      if (!errors.includes(error)) {
        errors.push(error);
      }
    });
    
    // Check DOM attributes for test failure
    if (errorData.bodyAttributes.testFailed === 'true') {
      const domError = `DOM marked as failed: ${errorData.bodyAttributes.testError}`;
      if (!errors.includes(domError)) {
        errors.push(domError);
      }
    }
    
    return errors;
  }
  
  /**
   * Captures async errors by waiting for asynchronous operations to complete
   * This catches errors from setTimeout, setInterval, Promises, and async effects
   */
  private async captureAsyncErrors(page: any, waitTime: number): Promise<string[]> {
    const errors: string[] = [];
    
    try {
      // Clear any existing errors to track only new ones
      const initialErrorCount = await page.evaluate(() => {
        return (window as any).__testHarnessRuntimeErrors?.length || 0;
      });
      
      // Wait for async operations to potentially fail
      await page.waitForTimeout(waitTime);
      
      // Collect any new errors that occurred during the wait
      const allErrors = await page.evaluate(() => {
        return (window as any).__testHarnessRuntimeErrors || [];
      });
      
      // Process only new errors
      const newErrors = allErrors.slice(initialErrorCount);
      newErrors.forEach((error: any) => {
        if (error.type === 'promise-rejection') {
          errors.push(`Async operation failed: ${error.message}`);
        } else if (error.message && !errors.includes(`${error.type} error: ${error.message}`)) {
          errors.push(`Delayed ${error.type} error: ${error.message}`);
        }
      });
      
      // Also check if any console errors appeared
      const consoleErrors = await page.evaluate(() => {
        const logs = (window as any).__testHarnessConsoleLogs || [];
        return logs.filter((log: any) => log.type === 'error').map((log: any) => log.text);
      });
      
      // Add unique console errors
      consoleErrors.forEach((error: string) => {
        if (!errors.some(e => e.includes(error))) {
          errors.push(`Console error during async wait: ${error}`);
        }
      });
      
    } catch (e) {
      errors.push(`Failed to capture async errors: ${e}`);
    }
    
    return errors;
  }
  
  /**
   * Performs deep render validation to catch errors that might be in the DOM
   */
  private async validateDeepRender(page: any): Promise<string[]> {
    const errors: string[] = [];
    
    try {
      // Execute a full render cycle by forcing a state update
      await page.evaluate(() => {
        // Force React to complete all pending updates
        if ((window as any).React && (window as any).React.flushSync) {
          (window as any).React.flushSync(() => {});
        }
      });
      
      // Check for render errors in the component tree
      const renderErrors = await page.evaluate(() => {
        const errors: string[] = [];
        
        // Walk the DOM and check for error boundaries or error text
        const walker = document.createTreeWalker(
          document.body,
          NodeFilter.SHOW_TEXT
        );
        
        let node;
        while (node = walker.nextNode()) {
          const text = node.textContent || '';
          // Look for common error patterns
          if (text.includes('TypeError:') || 
              text.includes('ReferenceError:') ||
              text.includes('Cannot read properties of undefined') ||
              text.includes('Cannot access property') ||
              text.includes('is not a function') ||
              text.includes('Component Error:')) {
            // Only add if it's not already in our error list
            const errorMsg = text.trim();
            if (errorMsg.length < 500) { // Avoid huge text blocks
              errors.push(`Potential error in rendered content: ${errorMsg}`);
            }
          }
        }
        
        return errors;
      });
      
      errors.push(...renderErrors);
    } catch (e) {
      errors.push(`Deep render validation failed: ${e}`);
    }
    
    return errors;
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
    // Check if utilities are already exposed (they persist across navigations)
    const alreadyExposed = await page.evaluate(() => {
      return typeof (window as any).__mjGetEntityObject === 'function';
    });
    
    if (alreadyExposed) {
      return; // Already exposed, skip
    }
    
    try {
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
    } catch (error) {
      console.error('Failed to expose MJ utilities to page:', error);
      // Log more details about the error
      if (error instanceof Error && error.message.includes('addBinding')) {
        console.error('addBinding error - this usually means the page context is invalid');
      }
      throw error; // Re-throw to be caught by the main error handler
    }
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
        const { componentName, componentCode, libraries } = options;
        
        try {
          // Validate inputs
          if (!componentName || !componentCode) {
            throw new Error('componentName and componentCode are required');
          }
          
          // Note: In test harness, libraries are already loaded via script tags
          // and available in the global scope. The wrapping code will make them
          // available to components via the libraries object.
          // In production, the real ComponentCompiler would use LibraryRegistry
          // to dynamically load these libraries.
          
          // Wrap component code with library support
          const wrappedCode = this.wrapComponentCode(componentCode, componentName, libraries);
          
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
      
      wrapComponentCode(componentCode, componentName, libraries) {
        // Generate library declarations for requested libraries
        // These map from the libraries object to local variables
        const libraryDeclarations = libraries && libraries.length > 0
          ? libraries
              .filter(lib => lib.globalVariable)
              .map(lib => \`const \${lib.globalVariable} = libraries['\${lib.globalVariable}'] || window['\${lib.globalVariable}'];\`)
              .join('\\n        ')
          : '';
          
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