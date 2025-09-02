import { BrowserManager } from './browser-context';
import { Metadata, RunView, RunQuery, LogError } from '@memberjunction/core';
import type { RunViewParams, RunQueryParams, UserInfo, RunViewResult, RunQueryResult, BaseEntity, EntityInfo } from '@memberjunction/core';
import { ComponentLinter, Violation } from './component-linter';
import { 
  ComponentSpec, 
  ComponentUtilities, 
  SimpleAITools,
  SimpleExecutePromptParams,
  SimpleExecutePromptResult,
  SimpleEmbedTextParams,
  SimpleEmbedTextResult,
  ComponentObject
} from '@memberjunction/interactive-component-types';
import { ComponentLibraryEntity, ComponentMetadataEngine, AIModelEntityExtended } from '@memberjunction/core-entities';
import { SimpleVectorService } from '@memberjunction/ai-vectors-memory';
import { AIEngine } from '@memberjunction/aiengine';
 

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
  utilities?: ComponentUtilities;
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

  // Note: This counts React.createElement calls, not component re-renders
  // A complex dashboard can easily have 5000+ createElement calls on initial mount
  // Only flag if it's likely an infinite loop (10000+ is suspicious)
  private static readonly MAX_RENDER_COUNT = 10000;

  constructor(private browserManager: BrowserManager) {}

  /**
   * Lint component code before execution
   */
  async lintComponent(
    componentCode: string, 
    componentName: string,
    componentSpec?: any,
    isRootComponent?: boolean,
    contextUser?: UserInfo,
    options?: any
  ): Promise<{ violations: Violation[]; hasErrors: boolean }> {
    const lintResult = await ComponentLinter.lintComponent(
      componentCode,
      componentName,
      componentSpec,
      isRootComponent,
      contextUser,
      false, // debugMode
      options
    );

    const hasErrors = lintResult.violations.some(v => v.severity === 'critical' || v.severity === 'high');

    return {
      violations: lintResult.violations,
      hasErrors
    };
  }

  async executeComponent(options: ComponentExecutionOptions): Promise<ComponentExecutionResult> {
    const startTime = Date.now();
    const errors: string[] = [];
    const warnings: string[] = [];
    const criticalWarnings: string[] = [];
    const consoleLogs: { type: string; text: string }[] = [];
    const dataErrors: string[] = []; // Track data access errors from RunView/RunQuery
    let renderCount = 0;
    
    const debug = options.debug !== false; // Default to true for debugging
    const globalTimeout = options.timeout || 30000; // Default 30 seconds total timeout
    
    if (debug) {
      console.log('\n🔍 === Component Execution Debug Mode ===');
      console.log('Component:', options.componentSpec.name);
      console.log('Props:', JSON.stringify(options.props || {}, null, 2));
    }

    // Get a fresh page for this test execution
    const page = await this.browserManager.getPage();
    
    // Set default timeout for all page operations (Recommendation #2)
    page.setDefaultTimeout(globalTimeout);

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
      // NOTE: We only load core React/Babel here. Component-specific libraries
      // are loaded by the runtime's ComponentCompiler with proper dependency resolution
      await this.loadRuntimeLibraries(page, debug);
      
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
      await this.exposeMJUtilities(page, options, dataErrors, debug)
      if (debug) {
        console.log('📤 NODE: About to call page.evaluate with:');
        console.log('  - spec.name:', options.componentSpec.name);
        console.log('  - spec.code length:', options.componentSpec.code?.length || 0);
        console.log('  - props:', JSON.stringify(options.props || {}, null, 2));
        
        // Show spec-specific libraries, not all available libraries
        if (options.componentSpec.libraries && options.componentSpec.libraries.length > 0) {
          console.log('  - spec requires libraries:', options.componentSpec.libraries.map(lib => ({
            name: lib.name,
            globalVariable: lib.globalVariable,
            version: lib.version
          })));
        } else {
          console.log('  - spec requires libraries: none');
        }
        
        // Total available libraries in metadata (for context only)
        console.log('  - total available libraries in metadata:', allLibraries?.length || 0);
      }

      // Execute the component using the real React runtime with timeout (Recommendation #1)
      const executionPromise = page.evaluate(async ({ spec, props, debug, componentLibraries }: { spec: any; props: any; debug: boolean; componentLibraries: any[] }) => {
        if (debug) {
          console.log('🎯 Starting component execution');
          console.log('📚 BROWSER: Component libraries available for loading:', componentLibraries?.length || 0);
        }
        
        // Declare renderCheckInterval at the top scope for cleanup
        let renderCheckInterval: any;
        
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
            
            // Check if LibraryLoader and LibraryRegistry are available
            if (MJRuntime.LibraryLoader) {
              console.log('✅ LibraryLoader is available in MJRuntime');
            } else {
              console.log('❌ LibraryLoader is NOT available in MJRuntime');
            }
            if (MJRuntime.LibraryRegistry) {
              console.log('✅ LibraryRegistry is available in MJRuntime');
            } else {
              console.log('❌ LibraryRegistry is NOT available in MJRuntime');
            }
          }

          // Initialize LibraryRegistry if needed
          // Note: In test environment, we may not have full database access
          // so libraries are handled by the runtime internally

          // Create runtime context
          // Note: Component libraries are loaded by the ComponentCompiler itself
          // via loadRequiredLibraries, so we don't need to pass them here
          const runtimeContext = {
            React: (window as any).React,
            ReactDOM: (window as any).ReactDOM,
            libraries: {} // Libraries are loaded internally by the compiler
          };

          // Create instances with debug mode to see library loading
          const compiler = new ComponentCompiler({ debug: debug });
          compiler.setBabelInstance((window as any).Babel);
          
          // IMPORTANT: Configure the LibraryRegistry in the browser context
          // This is needed for the compiler to know about approved libraries
          if ((window as any).MJReactRuntime && (window as any).MJReactRuntime.LibraryRegistry) {
            const { LibraryRegistry } = (window as any).MJReactRuntime;
            // Configure the registry with the component libraries
            // Note: LibraryRegistry.Config expects ComponentLibraryEntity[]
            await LibraryRegistry.Config(false, componentLibraries || []);
            if (debug) {
              console.log('⚙️ Configured LibraryRegistry with', componentLibraries?.length || 0, 'libraries');
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
          
          // Register the component hierarchy with error capture
          // IMPORTANT: Pass component libraries for library loading to work
          if (debug) {
            console.log('📚 Registering component with', componentLibraries?.length || 0, 'libraries');
            if (componentLibraries?.length > 0) {
              console.log('  Passing libraries to registrar:', componentLibraries.slice(0, 2).map((l: any) => l.Name));
            }
          }
          
          let registrationResult;
          try {
            registrationResult = await registrar.registerHierarchy(spec, {
              styles,
              namespace: 'Global',
              version: 'v1', // Use v1 to match the registry defaults
              allLibraries: componentLibraries || [] // Pass the component libraries for LibraryRegistry
            });
          } catch (registrationError: any) {
            // Capture the actual error before it gets obscured
            console.error('🔴 Component registration error:', registrationError);
            (window as any).__testHarnessRuntimeErrors = (window as any).__testHarnessRuntimeErrors || [];
            (window as any).__testHarnessRuntimeErrors.push({
              message: `Component registration failed: ${registrationError.message || registrationError}`,
              stack: registrationError.stack,
              type: 'registration-error',
              phase: 'component-compilation',
              source: 'runtime-wrapper'
            });
            (window as any).__testHarnessTestFailed = true;
            // Don't re-throw - let execution continue to collect this error properly
            return; // Exit early but let the error collection happen
          }
          
          if (debug && !registrationResult.success) {
            console.log('❌ Registration failed:', registrationResult.errors);
          }

          if (!registrationResult.success) {
            throw new Error('Component registration failed: ' + JSON.stringify(registrationResult.errors));
          }

          if (debug) {
            console.log('📝 Registered components:', registrationResult.registeredComponents);
            // Note: ComponentRegistry doesn't expose internal components Map directly
            // We can see what was registered through the registrationResult
          }

          // Get the root component object - explicitly pass namespace and version
          const RootComponentObject = registry.get(spec.name, 'Global', 'v1');
          if (!RootComponentObject) {
            // Enhanced error message with debugging info
            console.error('Failed to find component:', spec.name);
            console.error('Registry keys:', Array.from(registry.components.keys()));
            throw new Error('Root component not found: ' + spec.name);
          }
          
          // Extract the React component from the ComponentObject
          const RootComponent = RootComponentObject.component;
          if (!RootComponent || typeof RootComponent !== 'function') {
            throw new Error('Component object does not contain a valid React component');
          }

          // Get all registered component objects and extract React components
          const componentObjects = registry.getAll('Global', 'v1');
          const components: Record<string, any> = {};
          for (const [name, componentObj] of Object.entries(componentObjects)) {
            // ComponentObject has a component property that's the React component
            components[name] = (componentObj as any).component;
          }
          
          if (debug) {
            console.log('📚 Registered components for dependencies:', Object.keys(components));
            console.log('📋 Component spec dependencies:', spec.dependencies?.map((d: ComponentSpec) => d.name) || []);
          }
          
          // Note: Library components are now handled by the runtime's compiler
          // which loads them into the appropriate context/closure

          // Render the component
          const rootElement = document.getElementById('root');
          if (!rootElement) {
            throw new Error('Root element not found');
          }

          const root = (window as any).ReactDOM.createRoot(rootElement);
          
          // Set up render count protection
          // This is for detecting infinite loops during execution
          // Note: counts createElement calls, not re-renders
          const MAX_RENDERS_ALLOWED = 10000; // Complex dashboards can have many createElement calls
          
          if (typeof window !== 'undefined') {
            renderCheckInterval = setInterval(() => {
              const currentRenderCount = (window as any).__testHarnessRenderCount || 0;
              if (currentRenderCount > MAX_RENDERS_ALLOWED) {
                clearInterval(renderCheckInterval);
                // Mark test as failed due to excessive renders
                (window as any).__testHarnessTestFailed = true;
                (window as any).__testHarnessRuntimeErrors = (window as any).__testHarnessRuntimeErrors || [];
                (window as any).__testHarnessRuntimeErrors.push({
                  message: `Likely infinite render loop: ${currentRenderCount} createElement calls (max: ${MAX_RENDERS_ALLOWED})`,
                  type: 'render-loop',
                  source: 'test-harness'
                });
                // Try to unmount to stop the madness
                try {
                  root.unmount();
                } catch (e) {
                  console.error('Failed to unmount after render loop:', e);
                }
                throw new Error(`Likely infinite render loop: ${currentRenderCount} createElement calls detected`);
              }
            }, 100); // Check every 100ms
          }
          
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
              // Capture the actual error message IMMEDIATELY
              (window as any).__testHarnessRuntimeErrors = (window as any).__testHarnessRuntimeErrors || [];
              
              // Check if this is a minified React error
              const errorMessage = error.message || error.toString();
              let enhancedMessage = errorMessage;
              
              if (errorMessage.includes('Minified React error')) {
                // Extract error number if present
                const match = errorMessage.match(/#(\d+)/);
                if (match) {
                  enhancedMessage = `React Error #${match[1]} - Visit https://react.dev/errors/${match[1]} for details. ${errorMessage}`;
                }
              }
              
              (window as any).__testHarnessRuntimeErrors.push({
                message: enhancedMessage,
                stack: error.stack,
                type: 'react-render-error',
                phase: 'component-render',
                source: 'user-component'  // This is the actual error from user's component
              });
              (window as any).__testHarnessTestFailed = true;
              return { hasError: true, error };
            }
            
            componentDidCatch(error: any, errorInfo: any) {
              // Don't log here - it creates duplicate messages
              // Just update the last error with component stack info
              const errors = (window as any).__testHarnessRuntimeErrors || [];
              if (errors.length > 0) {
                const lastError = errors[errors.length - 1];
                if (lastError.type === 'react-render-error') {
                  lastError.componentStack = errorInfo.componentStack;
                }
              }
            }
            
            render() {
              if (this.state.hasError) {
                // DON'T re-throw - this causes "Script error"
                // Instead, render a simple error indicator
                return null; // Don't render anything - the error is already captured
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

          // Clear the render check interval since we succeeded
          if (renderCheckInterval) {
            clearInterval(renderCheckInterval);
          }
          
          if (debug) {
            console.log('✅ Component rendered successfully');
          }

          return {
            success: true,
            componentCount: registrationResult.registeredComponents.length
          };

        } catch (error: any) {
          // Clean up render check interval if it exists
          if (typeof renderCheckInterval !== 'undefined' && renderCheckInterval) {
            clearInterval(renderCheckInterval);
          }
          
          console.error('🔴 BROWSER: Component execution failed:', error);
          console.error('🔴 BROWSER: Error stack:', error.stack);
          console.error('🔴 BROWSER: Error type:', typeof error);
          console.error('🔴 BROWSER: Error stringified:', JSON.stringify(error, null, 2));
          
          (window as any).__testHarnessRuntimeErrors = (window as any).__testHarnessRuntimeErrors || [];
          (window as any).__testHarnessRuntimeErrors.push({
            message: error.message || String(error),
            stack: error.stack,
            type: 'execution-error',
            source: 'runtime-wrapper'
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
      }) as Promise<{ success: boolean; error?: string; componentCount?: number }>;
      
      // Create timeout promise (Recommendation #1)
      const timeoutPromise = new Promise<{ success: boolean; error?: string; componentCount?: number }>((_, reject) => 
        setTimeout(() => reject(new Error(`Component execution timeout after ${globalTimeout}ms`)), globalTimeout)
      );
      
      // Race between execution and timeout
      let executionResult: { success: boolean; error?: string; componentCount?: number };
      try {
        executionResult = await Promise.race([executionPromise, timeoutPromise]);
      } catch (timeoutError) {
        // Handle timeout gracefully
        errors.push(`Component execution timed out after ${globalTimeout}ms`);
        executionResult = { 
          success: false, 
          error: timeoutError instanceof Error ? timeoutError.message : 'Execution timeout' 
        };
      }

      if (debug) {
        console.log('Execution result:', executionResult);
      }

      // Wait for render completion
      const renderWaitTime = options.renderWaitTime || 500;
      await page.waitForTimeout(renderWaitTime);

      // Get render count
      renderCount = await page.evaluate(() => (window as any).__testHarnessRenderCount || 0);

      // Collect all errors with source information
      const runtimeErrorsWithSource = await this.collectRuntimeErrors(page);
      errors.push(...runtimeErrorsWithSource.map(e => e.message)); // Extract messages for backward compat

      // Collect warnings (separate from errors)
      const collectedWarnings = await this.collectWarnings(page);
      warnings.push(...collectedWarnings);

      // Capture async errors
      const asyncWaitTime = options.asyncErrorWaitTime || 1000;
      await page.waitForTimeout(asyncWaitTime);
      
      const asyncErrors = await this.collectRuntimeErrors(page);
      // Only add new errors
      asyncErrors.forEach(err => {
        if (!errors.includes(err.message)) {
          errors.push(err.message);
          runtimeErrorsWithSource.push(err); // Keep the structured version too
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
        errors.push(`Possible render loop: ${renderCount} createElement calls detected (likely infinite loop)`);
      }

      // Combine runtime errors with data errors
      const allErrors = [...errors, ...dataErrors];
      
      // Map runtime errors with source info, data errors don't have source
      const errorViolations = runtimeErrorsWithSource.map(e => ({
        message: e.message,
        severity: 'critical' as const,
        rule: 'runtime-error',
        line: 0,
        column: 0,
        source: e.source as ('user-component' | 'runtime-wrapper' | 'react-framework' | 'test-harness' | undefined)
      }));
      
      // Add data errors without source
      dataErrors.forEach(e => {
        errorViolations.push({
          message: e,
          severity: 'critical' as const,
          rule: 'runtime-error',
          line: 0,
          column: 0,
          source: 'user-component' as const // Data errors are from user's data access code
        });
      });
      
      const result: ComponentExecutionResult = {
        success: success && dataErrors.length === 0, // Fail if we have data errors
        html,
        errors: errorViolations,
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
      // For catch block errors, we need to handle them specially
      const catchError = {
        message: error instanceof Error ? error.message : String(error),
        source: 'test-harness' as const // Errors caught here are usually test harness issues
      };
      
      // Create error violations including the catch error
      const errorViolations: Violation[] = [{
        message: catchError.message,
        severity: 'critical' as const,
        rule: 'runtime-error',
        line: 0,
        column: 0,
        source: catchError.source
      }];
      
      // Add any data errors
      dataErrors.forEach(e => {
        errorViolations.push({
          message: e,
          severity: 'critical' as const,
          rule: 'runtime-error',
          line: 0,
          column: 0,
          source: 'user-component' as const
        });
      });
      
      const result: ComponentExecutionResult = {
        success: false,
        html: '',
        errors: errorViolations,
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
   * Load core runtime libraries into the page (React, ReactDOM, Babel, MJRuntime)
   * Component-specific libraries are loaded by the runtime's ComponentCompiler
   */
  private async loadRuntimeLibraries(page: any, debug: boolean = false) {
    // Import getCoreRuntimeLibraries to get the correct URLs for React libraries
    // We can't use LibraryLoader.loadAllLibraries() here because it expects to run in a browser
    // environment with window/document, but we're in Node.js with Playwright
    const { getCoreRuntimeLibraries } = await import('@memberjunction/react-runtime');
    const coreLibraries = getCoreRuntimeLibraries(debug);
    
    // Helper function to load scripts with timeout
    const loadScriptWithTimeout = async (url: string, timeout: number = 10000) => {
      try {
        await Promise.race([
          page.addScriptTag({ url }),
          new Promise((_, reject) => 
            setTimeout(() => reject(new Error(`Script load timeout: ${url}`)), timeout)
          )
        ]);
      } catch (error) {
        throw new Error(`Failed to load script ${url}: ${error instanceof Error ? error.message : String(error)}`);
      }
    };
    
    // Load the core libraries (React, ReactDOM, Babel) into the Playwright page context
    for (const lib of coreLibraries) {
      if (lib.cdnUrl) {
        await loadScriptWithTimeout(lib.cdnUrl);
        if (debug) {
          console.log(`  ✓ Loaded ${lib.displayName} (${lib.globalVariable})`);
        }
      }
    }
    
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

    // All core libraries loaded successfully
    if (!loaded.React || !loaded.ReactDOM || !loaded.Babel || !loaded.MJRuntime) {
      throw new Error('Failed to load required core libraries');
    }
    
    // Component-specific libraries are now loaded by the runtime's ComponentCompiler
    // which properly handles dependency resolution (e.g., dayjs for antd)
    if (debug) {
      console.log('✅ Core runtime libraries loaded. Component libraries will be loaded by the runtime.');
    }
  }

  /**
   * Load component-specific libraries from CDN
   */
  private async loadComponentLibraries(
    page: any, 
    specLibraries: any[], 
    allLibraries: ComponentLibraryEntity[],
    debug: boolean = false
  ): Promise<void> {
    
    if (debug) {
      console.log('📚 Loading component libraries:');
      console.log('  🔍 Component requires libraries:', specLibraries.map(l => l.name));
      console.log('  📦 Total available ComponentLibrary entries:', allLibraries.length);
      console.log('  📋 Sample of available libraries (first 10):');
      allLibraries.slice(0, 10).forEach(lib => {
        console.log(`    - ${lib.Name}@${lib.Version} (${lib.Status})`);
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
          globalVariable: libDef.GlobalVariable,
          dependencies: libDef.Dependencies ? JSON.parse(libDef.Dependencies) : null
        });
      }

      // Load CSS if available
      if (libDef.CDNCssUrl) {
        const cssUrls = libDef.CDNCssUrl.split(',').map(url => url.trim());
        for (const cssUrl of cssUrls) {
          if (cssUrl) {
            await page.addStyleTag({ url: cssUrl });
            if (debug) {
              console.log(`  🎨 Loaded CSS: ${cssUrl}`);
            }
          }
        }
      }

      // Load the library script with timeout protection
      if (libDef.CDNUrl) {
        try {
          // Add timeout for library loading (Recommendation #3)
          await Promise.race([
            page.addScriptTag({ url: libDef.CDNUrl }),
            new Promise((_, reject) => 
              setTimeout(() => reject(new Error(`Library load timeout: ${libDef.CDNUrl}`)), 10000)
            )
          ]);
          
          // Verify the library loaded
          const isLoaded = await page.evaluate((globalVar: string) => {
            return typeof (window as any)[globalVar] !== 'undefined';
          }, libDef.GlobalVariable);

          if (isLoaded) {
            if (debug) {
              console.log(`  📦 Loaded ${specLib.name} (available as ${libDef.GlobalVariable})`);
            }
          } else {
            // Some libraries (like @mui/material) may load successfully but not attach to window
            // Check if we can at least verify the script loaded
            if (debug) {
              console.log(`  📦 Loaded ${specLib.name} from CDN (global variable ${libDef.GlobalVariable} may not be exposed)`);
            }
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
        // Determine source based on error content
        let source = 'user-component';  // Default to user component
        if (event.message && event.message.includes('Script error')) {
          source = 'runtime-wrapper';
        }
        
        (window as any).__testHarnessRuntimeErrors.push({
          message: event.error?.message || event.message,
          stack: event.error?.stack,
          type: 'runtime',
          source: source
        });
        (window as any).__testHarnessTestFailed = true;
      });

      // Unhandled promise rejection handler
      window.addEventListener('unhandledrejection', (event) => {
        (window as any).__testHarnessRuntimeErrors.push({
          message: 'Unhandled Promise Rejection: ' + (event.reason?.message || event.reason),
          stack: event.reason?.stack,
          type: 'promise-rejection',
          source: 'user-component'  // Async errors are likely from user code
        });
        (window as any).__testHarnessTestFailed = true;
        event.preventDefault();
      });
    });
  }

  /**
   * Collect runtime errors from the page
   */
  private async collectRuntimeErrors(page: any): Promise<Array<{message: string; source?: string}>> {
    const errorData = await page.evaluate(() => {
      return {
        runtimeErrors: (window as any).__testHarnessRuntimeErrors || [],
        consoleErrors: (window as any).__testHarnessConsoleErrors || [],
        testFailed: (window as any).__testHarnessTestFailed || false
      };
    });

    const errors: Array<{message: string; source?: string}> = [];

    // Process runtime errors with their source information
    errorData.runtimeErrors.forEach((error: any) => {
      const phase = error.phase ? ` (during ${error.phase})` : '';
      const errorMsg = `${error.type} error: ${error.message}${phase}`;
      errors.push({
        message: errorMsg,
        source: error.source
      });
    });

    // Console errors don't have source info
    errorData.consoleErrors.forEach((error: string) => {
      const errorMsg = `Console error: ${error}`;
      errors.push({
        message: errorMsg,
        source: 'react-framework' // Console errors from React are framework level
      });
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

  private async buildLocalMJUtilities(contextUser: UserInfo): Promise<ComponentUtilities> {
    console.log("   Building local MJ utilities");
    const rv = new RunView();
    const rq = new RunQuery();
    const md = new Metadata();
    return {
      rv: {
        RunView: rv.RunView,
        RunViews: rv.RunViews
      },
      rq: {
        RunQuery: rq.RunQuery
      },
      md: {
        GetEntityObject: md.GetEntityObject, // return the function
        Entities: md.Entities // return the function
      },
      ai: await this.BuildLocalSimpleAITools(contextUser)
    }
  }

  protected async BuildLocalSimpleAITools(contextUser: UserInfo): Promise<SimpleAITools> {
    // Use AIEngine directly since we're in Node.js with full MJ backend
    const aiEngine = AIEngine.Instance;
    await aiEngine.Config(false, contextUser);

    return {
      ExecutePrompt: async (params: SimpleExecutePromptParams): Promise<SimpleExecutePromptResult> => {
        try {
          // Get the appropriate model based on power level or preferences
          let model: AIModelEntityExtended | undefined;
          
          if (params.preferredModels && params.preferredModels.length > 0) {
            // Try to find one of the preferred models
            await aiEngine.Config(false, params.contextUser);
            const models = aiEngine.Models;
            for (const preferredModel of params.preferredModels) {
              model = models.find((m: AIModelEntityExtended) => 
                m.Name === preferredModel && 
                m.IsActive === true
              );
              if (model) break;
            }
          }
          
          // If no preferred model found, use power level selection
          if (!model) {
            if (params.modelPower === 'lowest') {
              // Get lowest power model by sorting in reverse
              await aiEngine.Config(false, params.contextUser);
              const llmModels = aiEngine.Models.filter((m: AIModelEntityExtended) => 
                m.AIModelType === 'LLM' && 
                m.IsActive === true
              );
              model = llmModels.sort((a: AIModelEntityExtended, b: AIModelEntityExtended) => (a.PowerRank || 0) - (b.PowerRank || 0))[0];
            } else if (params.modelPower === 'highest') {
              model = await aiEngine.GetHighestPowerLLM(undefined, params.contextUser);
            } else {
              // Default to medium - get a model in the middle range
              await aiEngine.Config(false, params.contextUser);
              const llmModels = aiEngine.Models.filter((m: AIModelEntityExtended) => 
                m.AIModelType === 'LLM' && 
                m.IsActive === true
              );
              const sortedModels = llmModels.sort((a: AIModelEntityExtended, b: AIModelEntityExtended) => (b.PowerRank || 0) - (a.PowerRank || 0));
              const midIndex = Math.floor(sortedModels.length / 2);
              model = sortedModels[midIndex] || sortedModels[0];
            }
          }
          
          // Build full conversation from messages if provided
          let fullUserPrompt = '';
          if (params.messages && params.messages.length > 0) {
            fullUserPrompt = params.messages
              .map(m => `${m.role === 'user' ? 'User' : 'Assistant'}: ${m.message}`)
              .join('\n');
          }
          
          // Execute the prompt using AIEngine
          const result = await aiEngine.SimpleLLMCompletion(
            fullUserPrompt || '',
            params.contextUser || {} as any, // Provide empty object if no context user
            params.systemPrompt,
            model
          );
          
          // Try to parse JSON if present
          let resultObject: any;
          try {
            // Look for JSON in the response
            const jsonMatch = result.match(/\{[\s\S]*\}|\[[\s\S]*\]/);
            if (jsonMatch) {
              resultObject = JSON.parse(jsonMatch[0]);
            }
          } catch (e) {
            // Not JSON or failed to parse, that's ok
          }
          
          return {
            success: true,
            result: result,
            resultObject,
            modelName: model?.Name || 'Unknown'
          };
        } catch (error) {
          LogError(error);
          return {
            success: false,
            result: 'Failed to execute prompt: ' + (error instanceof Error ? error.message : String(error)),
            modelName: ''
          };
        }
      },
      
      EmbedText: async (params: SimpleEmbedTextParams): Promise<SimpleEmbedTextResult> => {
        try {
          // Handle both single string and array of strings
          const texts = Array.isArray(params.textToEmbed) 
            ? params.textToEmbed 
            : [params.textToEmbed];
          
          // Use appropriate embedding model based on size
          await aiEngine.Config(false, params.contextUser);
          
          // Get embedding models and filter by size preference
          const embeddingModels = aiEngine.Models.filter((m: AIModelEntityExtended) => 
            m.AIModelType === 'Embeddings' && 
            m.IsActive === true
          );
          
          // Select model based on size preference
          let model: AIModelEntityExtended;
          if (params.modelSize === 'small') {
            // Prefer local/smaller models for 'small'
            model = embeddingModels.find((m: AIModelEntityExtended) => m.Vendor === 'LocalEmbeddings') ||
                    embeddingModels.sort((a: AIModelEntityExtended, b: AIModelEntityExtended) => (a.PowerRank || 0) - (b.PowerRank || 0))[0];
          } else {
            // Use more powerful models for 'medium'
            model = embeddingModels.sort((a: AIModelEntityExtended, b: AIModelEntityExtended) => (b.PowerRank || 0) - (a.PowerRank || 0))[0];
          }
          
          if (!model) {
            throw new Error('No embedding model available');
          }
          
          // Generate embeddings for all texts
          const embeddings: number[][] = [];
          for (const text of texts) {
            const result = await aiEngine.EmbedText(model, text);
            if (result && result.vector) {
              embeddings.push(result.vector);
            } else {
              throw new Error('Failed to generate embedding for text');
            }
          }
          
          // Return single embedding or array based on input
          const returnEmbeddings = Array.isArray(params.textToEmbed)
            ? embeddings
            : embeddings[0];
          
          return {
            result: returnEmbeddings,
            modelName: model.Name,
            vectorDimensions: embeddings[0]?.length || 0
          };
        } catch (error) {
          LogError(error);
          throw error; // Re-throw for embeddings as they're critical
        }
      },
      
      VectorService: new SimpleVectorService()
    };
  }

  /**
   * Expose MJ utilities to the browser context
   */
  private async exposeMJUtilities(page: any, options: ComponentExecutionOptions, dataErrors: string[], debug: boolean = false): Promise<void> {
    // Don't check if already exposed - we always start fresh after goto('about:blank')
    // The page.exposeFunction calls need to be made for each new page instance

    // Serialize contextUser to pass to the browser context
    // UserInfo is a simple object that can be serialized
    const serializedContextUser = JSON.parse(JSON.stringify(options.contextUser));
    
    // utilities - favor the one passed in by the caller, or fall back to the local ones
    const util: ComponentUtilities = options.utilities || await this.buildLocalMJUtilities(options.contextUser);

    // Create a lightweight mock metadata object with serializable data
    // This avoids authentication/provider issues in the browser context
    let entitiesData: any[] = [];
    try {
      // Try to get entities if available, otherwise use empty array
      if (util.md?.Entities) {
        // Serialize the entities data (remove functions, keep data)
        entitiesData = JSON.parse(JSON.stringify(util.md.Entities));
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
        const entity = await util.md.GetEntityObject(entityName, options.contextUser);
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
        const result = await util.rv.RunView(params, options.contextUser);
        
        // Debug logging for successful calls
        if (debug) {
          const rowCount = result.Results?.length || 0;
          console.log(`💾 RunView SUCCESS: Entity="${params.EntityName}" Rows=${rowCount}`);
          if (params.ExtraFilter) {
            console.log(`   Filter: ${params.ExtraFilter}`);
          }
        }
        
        return result;
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : String(error);
        
        // Debug logging for errors
        if (debug) {
          console.log(`❌ RunView FAILED: Entity="${params.EntityName || 'unknown'}"`);
          console.log(`   Error: ${errorMessage}`);
        } else {
          console.error('Error in __mjRunView:', errorMessage);
        }
        
        // Collect this error for the test report
        dataErrors.push(`RunView error: ${errorMessage} (Entity: ${params.EntityName || 'unknown'})`);
        
        // Return error result that won't crash the component
        return { Success: false, ErrorMessage: errorMessage, Results: [] };
      }
    });

    await page.exposeFunction('__mjRunViews', async (params: RunViewParams[]) => {
      try {
        const results = await util.rv.RunViews(params, options.contextUser);
        
        // Debug logging for successful calls
        if (debug) {
          console.log(`💾 RunViews SUCCESS: ${params.length} queries executed`);
          params.forEach((p, i) => {
            const rowCount = results[i]?.Results?.length || 0;
            console.log(`   [${i+1}] Entity="${p.EntityName}" Rows=${rowCount}`);
          });
        }
        
        return results;
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : String(error);
        const entities = params.map(p => p.EntityName || 'unknown').join(', ');
        
        // Debug logging for errors
        if (debug) {
          console.log(`❌ RunViews FAILED: Entities=[${entities}]`);
          console.log(`   Error: ${errorMessage}`);
        } else {
          console.error('Error in __mjRunViews:', errorMessage);
        }
        
        // Collect this error for the test report
        dataErrors.push(`RunViews error: ${errorMessage} (Entities: ${entities})`);
        
        // Return error results that won't crash the component
        return params.map(() => ({ Success: false, ErrorMessage: errorMessage, Results: [] }));
      }
    });

    await page.exposeFunction('__mjRunQuery', async (params: RunQueryParams) => {
      try {
        const result = await util.rq.RunQuery(params, options.contextUser);
        
        // Debug logging for successful calls
        if (debug) {
          const queryIdentifier = params.QueryName || params.QueryID || 'unknown';
          const rowCount = result.Results?.length || 0;
          console.log(`💾 RunQuery SUCCESS: Query="${queryIdentifier}" Rows=${rowCount}`);
          if (params.Parameters && Object.keys(params.Parameters).length > 0) {
            console.log(`   Parameters:`, params.Parameters);
          }
        }
        
        return result;
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : String(error);
        const queryIdentifier = params.QueryName || params.QueryID || 'unknown';
        
        // Debug logging for errors
        if (debug) {
          console.log(`❌ RunQuery FAILED: Query="${queryIdentifier}"`);
          console.log(`   Error: ${errorMessage}`);
        } else {
          console.error('Error in __mjRunQuery:', errorMessage);
        }
        
        // Collect this error for the test report
        dataErrors.push(`RunQuery error: ${errorMessage} (Query: ${queryIdentifier})`);
        
        // Return error result that won't crash the component
        return { Success: false, ErrorMessage: errorMessage, Results: [] };
      }
    });

    // Expose AI tools
    await page.exposeFunction('__mjExecutePrompt', async (params: SimpleExecutePromptParams) => {
      try {
        if (!util.ai) {
          throw new Error('AI tools not available');
        }
        // Add contextUser to params if not provided
        const paramsWithUser = { ...params, contextUser: options.contextUser };
        const result = await util.ai.ExecutePrompt(paramsWithUser);
        
        if (debug && result.success) {
          console.log(`🤖 ExecutePrompt SUCCESS: Model="${result.modelName}"`);
        }
        
        return result;
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : String(error);
        
        if (debug) {
          console.log(`❌ ExecutePrompt FAILED: ${errorMessage}`);
        }
        
        dataErrors.push(`AI ExecutePrompt error: ${errorMessage}`);
        
        return {
          success: false,
          result: errorMessage,
          modelName: ''
        };
      }
    });

    await page.exposeFunction('__mjEmbedText', async (params: SimpleEmbedTextParams) => {
      try {
        if (!util.ai) {
          throw new Error('AI tools not available');
        }
        // Add contextUser to params if not provided
        const paramsWithUser = { ...params, contextUser: options.contextUser };
        const result = await util.ai.EmbedText(paramsWithUser);
        
        if (debug) {
          const count = Array.isArray(result.result) 
            ? (Array.isArray(result.result[0]) ? result.result.length : 1)
            : 1;
          console.log(`🤖 EmbedText SUCCESS: Model="${result.modelName}" Count=${count} Dims=${result.vectorDimensions}`);
        }
        
        return result;
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : String(error);
        
        if (debug) {
          console.log(`❌ EmbedText FAILED: ${errorMessage}`);
        }
        
        dataErrors.push(`AI EmbedText error: ${errorMessage}`);
        throw error; // Re-throw for embeddings as they're critical
      }
    });

    // Make them available in utilities with the mock metadata
    await page.evaluate(() => {
      // Use the mock metadata for synchronous access
      const mockMd = (window as any).__mjMockMetadata || { Entities: [], CurrentUser: null };
      
      // Import SimpleVectorService for use in browser
      // Note: This will be available as part of the runtime bundle
      const VectorService = (window as any).MJReactRuntime?.SimpleVectorService || 
                           class { 
                             // Stub implementation if not available
                             cosineSimilarity(_a: number[], _b: number[]): number { return 0; }
                           };
      
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
        },
        ai: {
          ExecutePrompt: async (params: any) => await (window as any).__mjExecutePrompt(params),
          EmbedText: async (params: any) => await (window as any).__mjEmbedText(params),
          VectorService: new VectorService()
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