import { BrowserManager } from './browser-context';
import { Metadata, RunView, RunQuery } from '@memberjunction/core';
import type { RunViewParams, RunQueryParams, UserInfo } from '@memberjunction/core';
import { ComponentLinter, FixSuggestion, Violation } from './component-linter';
import { ComponentSpec } from '@memberjunction/interactive-component-types';
import { ComponentLibraryEntity, ComponentMetadataEngine } from '@memberjunction/core-entities';

export interface ComponentExecutionOptions {
  componentSpec: ComponentSpec;
  props?: Record<string, any>;
  setupCode?: string;
  timeout?: number;
  renderWaitTime?: number; // Default 500ms for render completion
  asyncErrorWaitTime?: number; // Default 1000ms for async errors
  waitForSelector?: string;
  waitForLoadState?: 'load' | 'domcontentloaded' | 'networkidle';
  contextUser: UserInfo;
  isRootComponent?: boolean;
  debug?: boolean;
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

/**
 * ComponentRunner that uses the actual React runtime via Playwright UMD bundle
 */
export class ComponentRunner {
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

  private static readonly MAX_RENDER_COUNT = 1000;

  constructor(private browserManager: BrowserManager) {}

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
    
    const debug = options.debug !== false;
    
    if (debug) {
      console.log('\n🔍 === Component Execution Debug Mode ===');
      console.log('Component:', options.componentSpec.name);
      console.log('Props:', JSON.stringify(options.props || {}, null, 2));
    }

    // Get a fresh page for this test execution
    const page = await this.browserManager.getPage();

    // Load component metadata and libraries first (needed for library loading)
    await ComponentMetadataEngine.Instance.Config(false, options.contextUser);
    const allLibraries = ComponentMetadataEngine.Instance.ComponentLibraries.map(c=>c.GetAll()) as ComponentLibraryEntity[];

    try {
      
      // Navigate to a blank page FIRST, then load runtime
      await page.goto('about:blank');
      
      // Set up the basic HTML structure
      await page.setContent(`
        <!DOCTYPE html>
        <html>
        <head>
          <meta charset="utf-8">
          <title>React Component Test (V2)</title>
          <style>
            body { 
              margin: 0; 
              padding: 20px; 
              font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
            }
            #root { 
              min-height: 100vh;
              background-color: white;
              padding: 20px;
            }
          </style>
        </head>
        <body>
          <div id="root" data-testid="react-root"></div>
        </body>
        </html>
      `);

      // Always load runtime libraries after setting content
      // This ensures they persist in the current page context
      // allLibraries is loaded above from ComponentMetadataEngine
      await this.loadRuntimeLibraries(page, options.componentSpec, allLibraries);
      
      // Verify the runtime is actually loaded
      const runtimeCheck = await page.evaluate(() => {
        return {
          hasMJRuntime: typeof (window as any).MJReactRuntime !== 'undefined',
          hasReact: typeof (window as any).React !== 'undefined',
          hasReactDOM: typeof (window as any).ReactDOM !== 'undefined',
          hasBabel: typeof (window as any).Babel !== 'undefined',
          mjRuntimeKeys: (window as any).MJReactRuntime ? Object.keys((window as any).MJReactRuntime) : []
        };
      });
      if (debug) {
        console.log('Runtime loaded successfully');
      }
      
      if (!runtimeCheck.hasMJRuntime) {
        throw new Error('Failed to inject MJReactRuntime into page context');
      }

      // Set up error tracking
      await this.setupErrorTracking(page);
      
      // Set up console logging
      this.setupConsoleLogging(page, consoleLogs, warnings, criticalWarnings);
      
      // Expose MJ utilities to the page
      await this.exposeMJUtilities(page, options.contextUser)
      if (debug) {
        console.log('📤 NODE: About to call page.evaluate with:');
        console.log('  - spec.name:', options.componentSpec.name);
        console.log('  - spec.code length:', options.componentSpec.code?.length || 0);
        console.log('  - props:', JSON.stringify(options.props || {}, null, 2));
        console.log('  - componentLibraries count:', allLibraries?.length || 0);
        if (allLibraries && allLibraries.length > 0) {
          console.log('  - First few libraries:', allLibraries.slice(0, 3).map(lib => ({
            Name: lib.Name,
            GlobalVariable: lib.GlobalVariable
          })));
        }
      }

      // Execute the component using the real React runtime
      const executionResult = await page.evaluate(async ({ spec, props, debug, componentLibraries }: { spec: any; props: any; debug: boolean; componentLibraries: any[] }) => {
        if (debug) {
          console.log('🎯 Starting component execution');
          console.log('📚 BROWSER: Received componentLibraries:', componentLibraries?.length || 0);
          if (componentLibraries?.length > 0) {
            console.log('  First library:', componentLibraries[0]);
          }
        }
        
        try {
          // Access the real runtime classes
          const MJRuntime = (window as any).MJReactRuntime;
          if (!MJRuntime) {
            throw new Error('React runtime not loaded');
          }

          const {
            ComponentCompiler,
            ComponentRegistry,
            ComponentHierarchyRegistrar,
            SetupStyles
          } = MJRuntime;

          if (debug) {
            console.log('🚀 Starting component execution with real runtime');
            console.log('Available runtime classes:', Object.keys(MJRuntime));
          }

          // Initialize LibraryRegistry if needed
          // Note: In test environment, we may not have full database access
          // so libraries are handled by the runtime internally

          // Build libraries object from loaded libraries
          const loadedLibraries: Record<string, any> = {};
          if (spec.libraries && componentLibraries) {
            for (const specLib of spec.libraries) {
              // Find the library definition
              const libDef = componentLibraries.find(l => 
                l.Name.toLowerCase() === specLib.name.toLowerCase()
              );
              
              if (libDef && libDef.GlobalVariable) {
                // Check if the library is available as a global
                const libraryValue = (window as any)[libDef.GlobalVariable];
                if (libraryValue) {
                  loadedLibraries[libDef.GlobalVariable] = libraryValue;
                  if (debug) {
                    console.log(`✅ Added ${libDef.Name} to runtime context as ${libDef.GlobalVariable}`);
                  }
                } else {
                  console.warn(`⚠️ Library ${libDef.Name} not found as window.${libDef.GlobalVariable}`);
                }
              }
            }
          }

          // Create runtime context with loaded libraries
          const runtimeContext = {
            React: (window as any).React,
            ReactDOM: (window as any).ReactDOM,
            libraries: loadedLibraries
          };

          // Create instances
          const compiler = new ComponentCompiler();
          compiler.setBabelInstance((window as any).Babel);
          
          // IMPORTANT: Configure the LibraryRegistry in the browser context
          // This is needed for the compiler to know about approved libraries
          if ((window as any).MJReactRuntime && (window as any).MJReactRuntime.LibraryRegistry) {
            const { LibraryRegistry } = (window as any).MJReactRuntime;
            // Configure the registry with the component libraries
            // Note: LibraryRegistry.Config expects ComponentLibraryEntity[]
            await LibraryRegistry.Config(false, componentLibraries || []);
            if (debug) {
              console.log('✅ Configured LibraryRegistry with', componentLibraries?.length || 0, 'libraries');
            }
          }

          const registry = new ComponentRegistry();
          
          const registrar = new ComponentHierarchyRegistrar(
            compiler,
            registry,
            runtimeContext
          );

          // Use the utilities we already created with mock metadata
          // Don't call createRuntimeUtilities() as it tries to create new Metadata() which fails
          const utilities = (window as any).__mjUtilities;
          if (!utilities) {
            throw new Error('Utilities not found - exposeMJUtilities may have failed');
          }
          
          const styles = SetupStyles();

          if (debug) {
            console.log('📦 Registering component hierarchy...');
          }

          // CRITICAL: Ensure spec.libraries have globalVariable set from componentLibraries
          // The spec might not have globalVariable, but we need it for the runtime to work
          if (spec.libraries && componentLibraries) {
            for (const specLib of spec.libraries) {
              if (!specLib.globalVariable) {
                const libDef = componentLibraries.find(l => 
                  l.Name.toLowerCase() === specLib.name.toLowerCase()
                );
                if (libDef && libDef.GlobalVariable) {
                  specLib.globalVariable = libDef.GlobalVariable;
                  if (debug) {
                    console.log(`  📝 Enhanced spec library ${specLib.name} with globalVariable: ${libDef.GlobalVariable}`);
                  }
                }
              }
            }
            
            if (debug) {
              console.log('🔍 Spec libraries after enhancement:', spec.libraries.map((l: any) => ({
                name: l.name,
                globalVariable: l.globalVariable
              })));
            }
          }
          
          // Register the component hierarchy
          // IMPORTANT: Pass component libraries for library loading to work
          if (debug) {
            console.log('📚 Registering component with', componentLibraries?.length || 0, 'libraries');
            if (componentLibraries?.length > 0) {
              console.log('  Passing libraries to registrar:', componentLibraries.slice(0, 2).map((l: any) => l.Name));
            }
          }
          const registrationResult = await registrar.registerHierarchy(spec, {
            styles,
            namespace: 'Global',
            version: 'v1', // Use v1 to match the registry defaults
            allLibraries: componentLibraries || [] // Pass the component libraries for LibraryRegistry
          });
          if (debug && !registrationResult.success) {
            console.log('❌ Registration failed:', registrationResult.errors);
          }

          if (!registrationResult.success) {
            throw new Error('Component registration failed: ' + JSON.stringify(registrationResult.errors));
          }

          if (debug) {
            console.log('✅ Registered components:', registrationResult.registeredComponents);
            // Note: ComponentRegistry doesn't expose internal components Map directly
            // We can see what was registered through the registrationResult
          }

          // Get the root component - explicitly pass namespace and version
          const RootComponent = registry.get(spec.name, 'Global', 'v1');
          if (!RootComponent) {
            // Enhanced error message with debugging info
            console.error('Failed to find component:', spec.name);
            console.error('Registry keys:', Array.from(registry.components.keys()));
            throw new Error('Root component not found: ' + spec.name);
          }

          // Get all registered components for prop passing
          const components = registry.getAll('Global', 'v1');
          
          // Add all loaded library exports to the components object
          // This allows generated code to use components.PieChart, components.ResponsiveContainer, etc.
          // for libraries that export components (like Recharts)
          for (const [globalVar, libraryValue] of Object.entries(loadedLibraries)) {
            if (typeof libraryValue === 'object' && libraryValue !== null) {
              // If the library exports an object with multiple components, spread them
              Object.assign(components, libraryValue);
              if (debug) {
                console.log(`✅ Added ${globalVar} exports to components object`);
              }
            }
          }

          // Render the component
          const rootElement = document.getElementById('root');
          if (!rootElement) {
            throw new Error('Root element not found');
          }

          const root = (window as any).ReactDOM.createRoot(rootElement);
          
          // Build complete props
          const componentProps = {
            ...props,
            utilities,
            styles,
            components,
            savedUserSettings: {},
            onSaveUserSettings: (settings: any) => {
              console.log('User settings saved:', settings);
            }
          };

          if (debug) {
            console.log('🎨 Rendering component with props:', Object.keys(componentProps));
          }

          // Create error boundary wrapper
          const ErrorBoundary = class extends (window as any).React.Component {
            constructor(props: any) {
              super(props);
              this.state = { hasError: false, error: null };
            }
            
            static getDerivedStateFromError(error: any) {
              (window as any).__testHarnessTestFailed = true;
              return { hasError: true, error };
            }
            
            componentDidCatch(error: any, errorInfo: any) {
              console.error('React Error Boundary caught:', error, errorInfo);
              (window as any).__testHarnessRuntimeErrors = (window as any).__testHarnessRuntimeErrors || [];
              (window as any).__testHarnessRuntimeErrors.push({
                message: error.message,
                stack: error.stack,
                componentStack: errorInfo.componentStack,
                type: 'react-error-boundary'
              });
              (window as any).__testHarnessTestFailed = true;
            }
            
            render() {
              if (this.state.hasError) {
                // Re-throw to fail hard
                throw this.state.error;
              }
              return this.props.children;
            }
          };

          // Render with error boundary
          root.render(
            (window as any).React.createElement(
              ErrorBoundary,
              null,
              (window as any).React.createElement(RootComponent, componentProps)
            )
          );

          if (debug) {
            console.log('✅ Component rendered successfully');
          }

          return {
            success: true,
            componentCount: registrationResult.registeredComponents.length
          };

        } catch (error: any) {
          console.error('🔴 BROWSER: Component execution failed:', error);
          console.error('🔴 BROWSER: Error stack:', error.stack);
          console.error('🔴 BROWSER: Error type:', typeof error);
          console.error('🔴 BROWSER: Error stringified:', JSON.stringify(error, null, 2));
          
          (window as any).__testHarnessRuntimeErrors = (window as any).__testHarnessRuntimeErrors || [];
          (window as any).__testHarnessRuntimeErrors.push({
            message: error.message || String(error),
            stack: error.stack,
            type: 'execution-error'
          });
          (window as any).__testHarnessTestFailed = true;
          
          return {
            success: false,
            error: error.message || String(error)
          };
        }
      }, { 
        spec: options.componentSpec, 
        props: options.props, 
        debug,
        componentLibraries: allLibraries || []
      }) as { success: boolean; error?: string; componentCount?: number };

      if (debug) {
        console.log('Execution result:', executionResult);
      }

      // Wait for render completion
      const renderWaitTime = options.renderWaitTime || 500;
      await page.waitForTimeout(renderWaitTime);

      // Get render count
      renderCount = await page.evaluate(() => (window as any).__testHarnessRenderCount || 0);

      // Collect all errors
      const runtimeErrors = await this.collectRuntimeErrors(page);
      errors.push(...runtimeErrors);

      // Collect warnings (separate from errors)
      const collectedWarnings = await this.collectWarnings(page);
      warnings.push(...collectedWarnings);

      // Capture async errors
      const asyncWaitTime = options.asyncErrorWaitTime || 1000;
      await page.waitForTimeout(asyncWaitTime);
      
      const asyncErrors = await this.collectRuntimeErrors(page);
      // Only add new errors
      asyncErrors.forEach(err => {
        if (!errors.includes(err)) {
          errors.push(err);
        }
      });
      
      // Also check for new warnings
      const asyncWarnings = await this.collectWarnings(page);
      asyncWarnings.forEach(warn => {
        if (!warnings.includes(warn)) {
          warnings.push(warn);
        }
      });

      // Get the rendered HTML
      const html = await page.content();

      // Take screenshot
      const screenshot = await page.screenshot();

      // Determine success
      const success = errors.length === 0 && 
                     criticalWarnings.length === 0 && 
                     renderCount <= ComponentRunner.MAX_RENDER_COUNT &&
                     executionResult.success;

      if (renderCount > ComponentRunner.MAX_RENDER_COUNT) {
        errors.push(`Excessive render count: ${renderCount} renders detected`);
      }

      const result: ComponentExecutionResult = {
        success,
        html,
        errors: errors.map(e => ({
          message: e,
          severity: 'critical' as const,
          rule: 'runtime-error',
          line: 0,
          column: 0
        })),
        warnings: warnings.map(w => ({
          message: w,
          severity: 'low' as const,
          rule: 'warning',
          line: 0,
          column: 0
        })),
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
      
      const result: ComponentExecutionResult = {
        success: false,
        html: '',
        errors: errors.map(e => ({
          message: e,
          severity: 'critical' as const,
          rule: 'runtime-error',
          line: 0,
          column: 0
        })),
        warnings: warnings.map(w => ({
          message: w,
          severity: 'low' as const,
          rule: 'warning',
          line: 0,
          column: 0
        })),
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
    } finally {
      // Clean up: close the page after each test execution
      // This is important because getPage() now creates a new page each time
      // Closing the page ensures clean isolation between test runs
      try {
        await page.close();
      } catch (closeError) {
        // Ignore errors when closing the page
        if (debug) {
          console.log('Note: Error closing page (this is usually harmless):', closeError);
        }
      }
    }
  }

  /**
   * Load runtime libraries into the page
   */
  private async loadRuntimeLibraries(page: any, componentSpec?: ComponentSpec, allLibraries?: ComponentLibraryEntity[]) {
    // Load React and ReactDOM
    await page.addScriptTag({ url: 'https://unpkg.com/react@18/umd/react.development.js' });
    await page.addScriptTag({ url: 'https://unpkg.com/react-dom@18/umd/react-dom.development.js' });
    
    // Load Babel for JSX transformation
    await page.addScriptTag({ url: 'https://unpkg.com/@babel/standalone/babel.min.js' });
    
    // Load the real MemberJunction React Runtime UMD bundle
    const fs = await import('fs');
    
    // Resolve the path to the UMD bundle
    const runtimePath = require.resolve('@memberjunction/react-runtime/dist/runtime.umd.js');
    const runtimeBundle = fs.readFileSync(runtimePath, 'utf-8');
    
    // Inject the UMD bundle into the page
    await page.addScriptTag({ content: runtimeBundle });

    // The UMD bundle should have created window.MJReactRuntime
    // Let's verify and potentially add any test-harness specific overrides
    await page.evaluate(() => {
      // Check if MJReactRuntime was loaded from the UMD bundle
      if (typeof (window as any).MJReactRuntime === 'undefined') {
        throw new Error('MJReactRuntime UMD bundle did not load correctly');
      }

      // The real runtime is now available!
    });

    // Verify everything loaded
    const loaded = await page.evaluate(() => {
      return {
        React: typeof (window as any).React !== 'undefined',
        ReactDOM: typeof (window as any).ReactDOM !== 'undefined',
        Babel: typeof (window as any).Babel !== 'undefined',
        MJRuntime: typeof (window as any).MJReactRuntime !== 'undefined'
      };
    });

    // All libraries loaded successfully

    if (!loaded.React || !loaded.ReactDOM || !loaded.Babel || !loaded.MJRuntime) {
      throw new Error('Failed to load required libraries');
    }

    // Load component-specific libraries from CDN
    if (componentSpec?.libraries && allLibraries) {
      await this.loadComponentLibraries(page, componentSpec.libraries, allLibraries);
    }
  }

  /**
   * Load component-specific libraries from CDN
   */
  private async loadComponentLibraries(
    page: any, 
    specLibraries: any[], 
    allLibraries: ComponentLibraryEntity[]
  ): Promise<void> {
    const debug = true;
    
    if (debug) {
      console.log('📚 Loading component libraries:', {
        count: specLibraries.length,
        libraries: specLibraries.map(l => l.name)
      });
    }

    // Create a map of library definitions from allLibraries
    const libraryMap = new Map<string, ComponentLibraryEntity>();
    for (const lib of allLibraries) {
      libraryMap.set(lib.Name.toLowerCase(), lib);
    }

    // Load each library the component needs
    for (const specLib of specLibraries) {
      const libDef = libraryMap.get(specLib.name.toLowerCase());
      
      if (!libDef) {
        console.warn(`⚠️ Library ${specLib.name} not found in metadata`);
        continue;
      }

      if (debug) {
        console.log(`📦 Loading ${specLib.name}:`, {
          cdnUrl: libDef.CDNUrl,
          globalVariable: libDef.GlobalVariable
        });
      }

      // Load CSS if available
      if (libDef.CDNCssUrl) {
        const cssUrls = libDef.CDNCssUrl.split(',').map(url => url.trim());
        for (const cssUrl of cssUrls) {
          if (cssUrl) {
            await page.addStyleTag({ url: cssUrl });
            if (debug) {
              console.log(`  ✅ Loaded CSS: ${cssUrl}`);
            }
          }
        }
      }

      // Load the library script
      if (libDef.CDNUrl) {
        try {
          await page.addScriptTag({ url: libDef.CDNUrl });
          
          // Verify the library loaded
          const isLoaded = await page.evaluate((globalVar: string) => {
            return typeof (window as any)[globalVar] !== 'undefined';
          }, libDef.GlobalVariable);

          if (isLoaded) {
            if (debug) {
              console.log(`  ✅ Loaded ${specLib.name} as window.${libDef.GlobalVariable}`);
            }
          } else {
            console.error(`  ❌ Failed to load ${specLib.name} - global variable ${libDef.GlobalVariable} not found`);
          }
        } catch (error) {
          console.error(`  ❌ Error loading ${specLib.name} from ${libDef.CDNUrl}:`, error);
        }
      }
    }

    if (debug) {
      // Log all available global variables that look like libraries
      // Get all the global variables we expect from the spec
      const expectedGlobals = specLibraries.map(lib => {
        const libDef = libraryMap.get(lib.name.toLowerCase());
        return libDef?.GlobalVariable;
      }).filter(Boolean);
      
      const globals = await page.evaluate((expected: string[]) => {
        const relevantGlobals: Record<string, string> = {};
        // Check the expected globals from the spec
        for (const key of expected) {
          if ((window as any)[key]) {
            relevantGlobals[key] = typeof (window as any)[key];
          } else {
            relevantGlobals[key] = 'NOT FOUND';
          }
        }
        // Also check some common library globals
        const commonKeys = ['Recharts', 'chroma', '_', 'moment', 'dayjs', 'Chart', 'GSAP', 'gsap', 'lottie'];
        for (const key of commonKeys) {
          if (!(key in relevantGlobals) && (window as any)[key]) {
            relevantGlobals[key] = typeof (window as any)[key];
          }
        }
        return relevantGlobals;
      }, expectedGlobals as string[]);
      console.log('🌍 Available library globals:', globals);
    }
  }

  /**
   * Set up error tracking in the page
   */
  private async setupErrorTracking(page: any) {
    await page.evaluate(() => {
      // Initialize error tracking
      (window as any).__testHarnessRuntimeErrors = [];
      (window as any).__testHarnessConsoleErrors = [];
      (window as any).__testHarnessConsoleWarnings = [];
      (window as any).__testHarnessTestFailed = false;
      (window as any).__testHarnessRenderCount = 0;

      // Track renders
      const originalCreateElement = (window as any).React?.createElement;
      if (originalCreateElement) {
        (window as any).React.createElement = function(...args: any[]) {
          (window as any).__testHarnessRenderCount++;
          return originalCreateElement.apply(this, args);
        };
      }

      // Override console.error
      const originalConsoleError = console.error;
      console.error = function(...args: any[]) {
        const errorText = args.map(arg => 
          typeof arg === 'object' ? JSON.stringify(arg) : String(arg)
        ).join(' ');
        
        // Check if this is a warning rather than an error
        // React warnings typically start with "Warning:" or contain warning-related text
        const isWarning = 
          errorText.includes('Warning:') ||
          errorText.includes('DevTools') ||
          errorText.includes('deprecated') ||
          errorText.includes('has been renamed') ||
          errorText.includes('will be removed') ||
          errorText.includes('Consider using') ||
          errorText.includes('Please update') ||
          (errorText.includes('React') && errorText.includes('recognize the')) || // Prop warnings
          (errorText.includes('React') && errorText.includes('Invalid'));
        
        if (isWarning) {
          // Track as warning, don't fail the test
          (window as any).__testHarnessConsoleWarnings.push(errorText);
        } else {
          // Real error - track and fail the test
          (window as any).__testHarnessConsoleErrors.push(errorText);
          (window as any).__testHarnessTestFailed = true;
        }
        
        originalConsoleError.apply(console, args);
      };

      // Global error handler
      window.addEventListener('error', (event) => {
        (window as any).__testHarnessRuntimeErrors.push({
          message: event.error?.message || event.message,
          stack: event.error?.stack,
          type: 'runtime'
        });
        (window as any).__testHarnessTestFailed = true;
      });

      // Unhandled promise rejection handler
      window.addEventListener('unhandledrejection', (event) => {
        (window as any).__testHarnessRuntimeErrors.push({
          message: 'Unhandled Promise Rejection: ' + (event.reason?.message || event.reason),
          stack: event.reason?.stack,
          type: 'promise-rejection'
        });
        (window as any).__testHarnessTestFailed = true;
        event.preventDefault();
      });
    });
  }

  /**
   * Collect runtime errors from the page
   */
  private async collectRuntimeErrors(page: any): Promise<string[]> {
    const errorData = await page.evaluate(() => {
      return {
        runtimeErrors: (window as any).__testHarnessRuntimeErrors || [],
        consoleErrors: (window as any).__testHarnessConsoleErrors || [],
        testFailed: (window as any).__testHarnessTestFailed || false
      };
    });

    const errors: string[] = [];

    // Only add "test failed" message if there are actual errors
    if (errorData.testFailed && (errorData.runtimeErrors.length > 0 || errorData.consoleErrors.length > 0)) {
      errors.push('Test marked as failed by error handlers');
    }

    errorData.runtimeErrors.forEach((error: any) => {
      const errorMsg = `${error.type} error: ${error.message}`;
      if (!errors.includes(errorMsg)) {
        errors.push(errorMsg);
      }
    });

    errorData.consoleErrors.forEach((error: string) => {
      const errorMsg = `Console error: ${error}`;
      if (!errors.includes(errorMsg)) {
        errors.push(errorMsg);
      }
    });

    return errors;
  }

  /**
   * Collect warnings from the page (non-fatal issues)
   */
  private async collectWarnings(page: any): Promise<string[]> {
    const warningData = await page.evaluate(() => {
      return {
        consoleWarnings: (window as any).__testHarnessConsoleWarnings || []
      };
    });

    const warnings: string[] = [];

    warningData.consoleWarnings.forEach((warning: string) => {
      if (!warnings.includes(warning)) {
        warnings.push(warning);
      }
    });

    return warnings;
  }

  /**
   * Set up console logging
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
      
      // Note: We're already handling warnings in our console.error override
      // This catches any direct console.warn() calls
      if (type === 'warning') {
        if (!warnings.includes(text)) {
          warnings.push(text);
        }
        
        // Check if it's a critical warning that should fail the test
        if (ComponentRunner.CRITICAL_WARNING_PATTERNS.some(pattern => pattern.test(text))) {
          criticalWarnings.push(text);
        }
      }
    });

    page.on('pageerror', (error: Error) => {
      consoleLogs.push({ type: 'error', text: error.message });
    });
  }

  /**
   * Expose MJ utilities to the browser context
   */
  private async exposeMJUtilities(page: any, contextUser: UserInfo): Promise<void> {
    // Don't check if already exposed - we always start fresh after goto('about:blank')
    // The page.exposeFunction calls need to be made for each new page instance

    // Serialize contextUser to pass to the browser context
    // UserInfo is a simple object that can be serialized
    const serializedContextUser = JSON.parse(JSON.stringify(contextUser));
    
    // Create instances in Node.js context
    const metadata = new Metadata();
    const runView = new RunView();
    const runQuery = new RunQuery();
    
    // Create a lightweight mock metadata object with serializable data
    // This avoids authentication/provider issues in the browser context
    let entitiesData: any[] = [];
    try {
      // Try to get entities if available, otherwise use empty array
      if (metadata.Entities) {
        // Serialize the entities data (remove functions, keep data)
        entitiesData = JSON.parse(JSON.stringify(metadata.Entities));
        // Serialized entities for browser context
      } else {
        // Metadata.Entities not available, using empty array
      }
    } catch (error) {
      // Could not serialize entities
      entitiesData = [];
    }
    
    // Create the mock metadata structure with entities and user
    // Note: Don't include functions here as they can't be serialized
    // Include common properties that Metadata.Provider might need
    const mockMetadata = {
      Entities: entitiesData,
      CurrentUser: serializedContextUser,
      Applications: [],
      Queries: [],
      QueryFields: [],
      QueryCategories: [],
      QueryPermissions: [],
      Roles: [],
      Libraries: [],
      AuditLogTypes: [],
      Authorizations: [],
      VisibleExplorerNavigationItems: [],
      AllExplorerNavigationItems: []
    };
    
    // Inject both the contextUser and mock metadata into the page
    // Playwright only accepts a single argument, so wrap in an object
    await page.evaluate((data: { ctxUser: any; mockMd: any }) => {
      const { ctxUser, mockMd } = data;
      (window as any).__mjContextUser = ctxUser;
      
      // Add the EntityByName function directly in the browser context
      mockMd.EntityByName = (name: string) => {
        return mockMd.Entities.find((e: any) => e.Name === name) || null;
      };
      
      (window as any).__mjMockMetadata = mockMd;
      
      // IMPORTANT: Create global Metadata mock immediately to prevent undefined errors
      // This must be available before any component code runs
      if (!(window as any).Metadata) {
        (window as any).Metadata = {
          Provider: mockMd
        };
        // Created global Metadata mock with Provider (early)
      }
      
      // Received contextUser and mock metadata in browser
    }, { ctxUser: serializedContextUser, mockMd: mockMetadata });

    // Expose functions
    await page.exposeFunction('__mjGetEntityObject', async (entityName: string) => {
      try {
        const entity = await metadata.GetEntityObject(entityName, contextUser);
        return entity;
      } catch (error) {
        console.error('Error in __mjGetEntityObject:', error);
        return null;
      }
    });

    await page.exposeFunction('__mjGetEntities', () => {
      try {
        // Return the entities array or empty array if not available
        return entitiesData;
      } catch (error) {
        console.error('Error in __mjGetEntities:', error);
        return [];
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

    // Make them available in utilities with the mock metadata
    await page.evaluate(() => {
      // Use the mock metadata for synchronous access
      const mockMd = (window as any).__mjMockMetadata || { Entities: [], CurrentUser: null };
      
      (window as any).__mjUtilities = {
        md: {
          // Use the mock metadata's Entities directly (synchronous)
          Entities: mockMd.Entities,
          entities: mockMd.Entities, // Support both cases
          CurrentUser: mockMd.CurrentUser,
          EntityByName: (name: string) => {
            return mockMd.Entities.find((e: any) => e.Name === name) || null;
          },
          // Keep async function for GetEntityObject for compatibility
          GetEntityObject: async (entityName: string) => 
            await (window as any).__mjGetEntityObject(entityName)
        },
        rv: {
          RunView: async (params: any) => await (window as any).__mjRunView(params),
          RunViews: async (params: any) => await (window as any).__mjRunViews(params)
        },
        rq: {
          RunQuery: async (params: any) => await (window as any).__mjRunQuery(params)
        }
      };
      
      // Update or create global Metadata mock (in case it wasn't created earlier)
      if (!(window as any).Metadata) {
        (window as any).Metadata = {
          Provider: mockMd
        };
        // Created global Metadata mock with Provider (late)
      } else {
        // Update the existing one to ensure it has the latest mock data
        (window as any).Metadata.Provider = mockMd;
        // Updated existing Metadata.Provider with mock data
      }
    });
  }

  /**
   * Dump debug information
   */
  private dumpDebugInfo(result: ComponentExecutionResult): void {
    console.log('\n📊 === Component Execution Results ===');
    console.log('Success:', result.success ? '✅' : '❌');
    console.log('Execution time:', result.executionTime + 'ms');
    console.log('Render count:', result.renderCount);
    
    if (result.errors && result.errors.length > 0) {
      console.log('\n❌ Errors:', result.errors.length);
      result.errors.forEach((err, i) => {
        console.log(`  ${i + 1}. ${err.message}`);
      });
    }
    
    if (result.warnings && result.warnings.length > 0) {
      console.log('\n⚠️ Warnings:', result.warnings.length);
      result.warnings.forEach((warn, i) => {
        console.log(`  ${i + 1}. ${warn.message}`);
      });
    }
    
    if (result.criticalWarnings && result.criticalWarnings.length > 0) {
      console.log('\n🔴 Critical Warnings:', result.criticalWarnings.length);
      result.criticalWarnings.forEach((warn, i) => {
        console.log(`  ${i + 1}. ${warn}`);
      });
    }
    
    console.log('\n========================================\n');
  }
}