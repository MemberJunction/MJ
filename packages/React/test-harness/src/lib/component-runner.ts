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
  ComponentObject,
  SimpleEntityInfo
} from '@memberjunction/interactive-component-types';
import { ComponentLibraryEntity, ComponentMetadataEngine } from '@memberjunction/core-entities';
import { SimpleVectorService } from '@memberjunction/ai-vectors-memory';
import { AIEngine } from '@memberjunction/aiengine';
import { AIModelEntityExtended } from '@memberjunction/ai-core-plus';
 

/**
 * Pre-resolve a component spec for browser execution
 * Converts registry components to embedded format with all code included
 */
async function preResolveComponentSpec(
  spec: ComponentSpec,
  contextUser?: UserInfo
): Promise<ComponentSpec> {
  // If already embedded with code, return as-is
  if (spec.location === 'embedded' && spec.code) {
    return spec;
  }

  // For registry components, we need to fetch and embed everything
  if (spec.location === 'registry' && spec.registry) {
    // In test harness context, we likely don't have GraphQL access
    // Registry components would need to be pre-resolved before being passed to test harness
    console.warn(`Registry component ${spec.name} cannot be resolved in test harness context - GraphQL not available`);
    console.warn('Registry components should be pre-resolved before passing to test harness');
    
    // Return the spec as-is, which will likely fail in browser but at least won't crash here
    return spec;
  }

  // For other types, return as-is
  return spec;
}

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

  /**
   * Optional array of entity metadata providing complete field lists per entity.
   * Used by the linter to validate field usage with two-tier severity:
   * - Medium: Field exists in entity but not declared in dataRequirements
   * - Critical: Field does not exist in entity at all
   *
   * If not provided, linter only checks against dataRequirements.fieldMetadata
   * which may cause false-positive critical errors for valid but undeclared fields.
   *
   * @example
   * // Caller provides metadata for entities used in component
   * const md = new Metadata();
   * const entityNames = spec.dataRequirements.entities.map(e => e.name);
   * const entityMetadata = md.Entities
   *   .filter(e => entityNames.includes(e.Name))
   *   .map(e => SimpleEntityInfo.FromEntityInfo(e));
   */
  entityMetadata?: SimpleEntityInfo[];
}

export interface ComponentExecutionResult {
  success: boolean;
  html: string;
  errors: Violation[];
  warnings: Violation[];
  console: { type: string; text: string }[];
  screenshot?: Buffer;
  executionTime: number;
  renderCount?: number;
  lintViolations?: Violation[];
  /**
   * If true, the browser/page crashed during execution or cleanup.
   * This is an infrastructure issue, not a code issue.
   */
  browserCrash?: boolean;
  /**
   * Whether the component code executed successfully, independent of browser crashes.
   *
   * **Calculation**: No critical or high severity errors exist, EXCLUDING errors
   * with rule='browser-crash' (which are infrastructure issues, not code issues).
   * Medium, low, and warning severity errors do not affect this metric.
   *
   * **Usage**: Use this field to determine if the generated code is valid:
   * - If `codeExecutionSuccess=true`: the code works (don't regenerate)
   * - If `codeExecutionSuccess=false`: there are real code errors (regenerate)
   *
   * Note: The `success` field may be false due to browser crashes even when code is fine.
   * This field gives you the "did the code work?" answer directly.
   */
  codeExecutionSuccess?: boolean;
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

  // Browser/page crash patterns - these are infrastructure issues, not code errors
  private static readonly BROWSER_CRASH_PATTERNS = [
    'target page, context or browser has been closed',
    'target closed',
    'browser has been closed',
    'context has been closed',
    'connection closed',
    'protocol error',
    'browser closed unexpectedly'
  ];

  constructor(private browserManager: BrowserManager) {}

  /**
   * Check if an error message indicates a browser/page crash (infrastructure issue)
   */
  private static isBrowserCrashError(message: string): boolean {
    const lowerMessage = message.toLowerCase();
    return ComponentRunner.BROWSER_CRASH_PATTERNS.some(pattern =>
      lowerMessage.includes(pattern)
    );
  }

  /**
   * Reclassify violations that are actually browser crashes.
   * Browser crashes should be marked as low severity with rule='browser-crash'
   * since they're infrastructure issues, not code errors.
   */
  private static reclassifyBrowserCrashErrors(violations: Violation[]): { violations: Violation[], hasBrowserCrash: boolean } {
    let hasBrowserCrash = false;

    const reclassified = violations.map(v => {
      // Only reclassify critical/high errors that match browser crash patterns
      if ((v.severity === 'critical' || v.severity === 'high') &&
          ComponentRunner.isBrowserCrashError(v.message)) {
        hasBrowserCrash = true;
        return {
          ...v,
          severity: 'low' as const,
          rule: 'browser-crash',
          source: 'test-harness' as const
        };
      }
      return v;
    });

    return { violations: reclassified, hasBrowserCrash };
  }

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

      // NOTE: Error tracking setup moved to after library loading to avoid false positives
      // during library initialization (e.g., antd's UMD bundle setup)
      
      // Set up console logging
      this.setupConsoleLogging(page, consoleLogs, warnings);
      
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

      // // Pre-resolve the spec for browser execution (convert registry components to embedded)
      // const resolvedSpec = await preResolveComponentSpec(options.componentSpec, options.contextUser);
      
      // if (debug) {
      //   console.log('📦 Pre-resolved spec for browser execution:', {
      //     original: { location: options.componentSpec.location, registry: options.componentSpec.registry },
      //     resolved: { location: resolvedSpec.location, registry: resolvedSpec.registry, hasCode: !!resolvedSpec.code }
      //   });
      // }

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
            ComponentManager,
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
          
          // Diagnostic: Check if React is available before creating context
          if (!(window as any).React) {
            console.error('🔴 CRITICAL: React is NULL when creating runtimeContext!');
            console.error('Window keys:', Object.keys(window).filter(k => k.toLowerCase().includes('react')));
            throw new Error('React is not available in window context');
          }
          
          if (debug) {
            console.log('✅ React is available:', typeof (window as any).React);
            console.log('✅ React hooks check:', {
              useState: typeof (window as any).React?.useState,
              useEffect: typeof (window as any).React?.useEffect,
              useRef: typeof (window as any).React?.useRef,
              useMemo: typeof (window as any).React?.useMemo
            });
          }
          
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
            const { LibraryRegistry, LibraryLoader } = (window as any).MJReactRuntime;
            
            // Enable progressive delay for library initialization in test harness
            if (LibraryLoader) {
              LibraryLoader.enableProgressiveDelay = true;
              if (debug) {
                console.log('⚙️ Enabled progressive delay for library initialization');
              }
            }
            
            // Configure the registry with the component libraries
            // Note: LibraryRegistry.Config expects ComponentLibraryEntity[]
            await LibraryRegistry.Config(false, componentLibraries || []);
            if (debug) {
              console.log('⚙️ Configured LibraryRegistry with', componentLibraries?.length || 0, 'libraries');
            }
          }

          const registry = new ComponentRegistry();
          
          // NEW: Use ComponentManager instead of ComponentHierarchyRegistrar
          const manager = new ComponentManager(
            compiler,
            registry,
            runtimeContext,
            { debug: true, enableUsageTracking: false } // Force debug on for better diagnostics
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
              // Skip if library entry is invalid
              if (!specLib || !specLib.name) {
                if (debug) {
                  console.warn('  ⚠️ Skipping invalid library entry (missing name):', specLib);
                }
                continue;
              }
              
              if (!specLib.globalVariable) {
                const libDef = componentLibraries.find(l => 
                  l && l.Name && l.Name.toLowerCase() === specLib.name.toLowerCase()
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
          let loadResult: any; // Declare loadResult in outer scope
          try {
            if (debug) {
              console.log('📋 [BROWSER] Spec before loadHierarchy:', {
                name: spec.name,
                location: spec.location,
                registry: spec.registry,
                hasCode: !!spec.code,
                codeLength: spec.code?.length,
                libraries: spec.libraries,
                dependencies: spec.dependencies?.map((d: any) => ({ 
                  name: d.name, 
                  location: d.location,
                  hasCode: !!d.code
                }))
              });
            }
            
            // NEW: Use ComponentManager.loadHierarchy instead of registrar.registerHierarchy
            // Note: In browser context, we don't have access to contextUser or database
            // This is fine for embedded components which are self-contained
            loadResult = await manager.loadHierarchy(spec, {
              contextUser: undefined, // No user context in browser
              defaultNamespace: 'Global',
              defaultVersion: 'v1',
              returnType: 'both',
              resolutionMode: 'embed',  // Convert to embedded format for browser execution
              allLibraries: componentLibraries || []  // Pass libraries for compiler
            });
            
            if (debug) {
              console.log('📋 [BROWSER] LoadHierarchy result:', {
                success: loadResult.success,
                rootComponent: !!loadResult.rootComponent,
                resolvedSpec: loadResult.resolvedSpec ? {
                  name: loadResult.resolvedSpec.name,
                  location: loadResult.resolvedSpec.location,
                  registry: loadResult.resolvedSpec.registry,
                  libraries: loadResult.resolvedSpec.libraries,
                  hasCode: !!loadResult.resolvedSpec.code
                } : null,
                loadedComponents: loadResult.loadedComponents,
                errors: loadResult.errors
              });
            }
            
            // Convert to old format for compatibility
            registrationResult = {
              success: loadResult.success,
              registeredComponents: loadResult.loadedComponents,
              errors: loadResult.errors.map((e: any) => ({ componentName: e.componentName || '', error: e.message, phase: e.phase })),
              warnings: [],
              resolvedSpec: loadResult.resolvedSpec
            };
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
            // Return a failure result so the Promise resolves properly
            return {
              success: false,
              error: `Component registration failed: ${registrationError.message || registrationError}`,
              componentCount: 0
            };
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

          // NEW: With ComponentManager, we already have the components from loadResult
          if (!loadResult) {
            throw new Error('Component loading failed - no result returned');
          }
          
          const RootComponentObject = loadResult.rootComponent;
          if (!RootComponentObject) {
            // Enhanced error message with debugging info
            console.error('Failed to load component:', spec.name);
            console.error('Load errors:', loadResult.errors);
            throw new Error('Root component not loaded: ' + spec.name);
          }
          
          // Extract the React component from the ComponentObject
          const RootComponent = RootComponentObject.component;
          if (!RootComponent || typeof RootComponent !== 'function') {
            throw new Error('Component object does not contain a valid React component');
          }

          // Get all loaded components from the result
          // ComponentManager now returns unwrapped components directly
          const components: Record<string, any> = loadResult.components || {};
          
          if (debug) {
            console.log('📚 Registered components for dependencies:', Object.keys(components));
            console.log('📋 Component spec dependencies:', spec.dependencies?.map((d: ComponentSpec) => d.name) || []);
            
            // Check what libraries are actually available in global scope
            console.log('🌍 [BROWSER] Global library check after loading:', {
              ApexCharts: typeof (window as any).ApexCharts,
              antd: typeof (window as any).antd,
              React: typeof (window as any).React,
              ReactDOM: typeof (window as any).ReactDOM,
              windowKeys: Object.keys(window).filter(k => 
                k.toLowerCase().includes('apex') || 
                k.toLowerCase().includes('antd') ||
                k === 'ApexCharts' ||
                k === 'antd'
              )
            });
            
            // If libraries were supposed to be loaded, check their actual presence
            if (spec.libraries && spec.libraries.length > 0) {
              console.log('🔍 [BROWSER] Checking required libraries:');
              for (const lib of spec.libraries) {
                const globalVar = lib.globalVariable;
                const exists = !!(window as any)[globalVar];
                const type = typeof (window as any)[globalVar];
                console.log(`  - ${lib.name} (${globalVar}): ${exists ? `✅ Present (${type})` : '❌ Missing'}`);
              }
            }
          }
          
          // Note: Library components are now handled by the runtime's compiler
          // which loads them into the appropriate context/closure

          // NOW set up enhanced error tracking - AFTER libraries are loaded
          // This avoids false positives from library initialization code (e.g., antd)
          if (!(window as any).__testHarnessErrorTrackingSetup) {
            (window as any).__testHarnessErrorTrackingSetup = true;
            
            // Initialize error tracking arrays if not already done
            (window as any).__testHarnessRuntimeErrors = (window as any).__testHarnessRuntimeErrors || [];
            (window as any).__testHarnessConsoleErrors = (window as any).__testHarnessConsoleErrors || [];
            (window as any).__testHarnessConsoleWarnings = (window as any).__testHarnessConsoleWarnings || [];
            (window as any).__testHarnessTestFailed = (window as any).__testHarnessTestFailed || false;
            (window as any).__testHarnessRenderCount = (window as any).__testHarnessRenderCount || 0;

            // Wrap React.createElement to detect invalid element types
            const originalCreateElement = (window as any).React?.createElement;
            if (originalCreateElement) {
              (window as any).React.createElement = function(type: any, props: any, ...children: any[]) {
                (window as any).__testHarnessRenderCount++;
                
                // Enhanced error detection for invalid element types
                if (type !== null && type !== undefined) {
                  const typeOf = typeof type;
                  
                  // Check for the common "object instead of component" error
                  if (typeOf === 'object' && !(window as any).React.isValidElement(type)) {
                    // Try to get a meaningful name for the object
                    let objectInfo = 'unknown object';
                    try {
                      if (type.constructor && type.constructor.name) {
                        objectInfo = type.constructor.name;
                      } else if (type.name) {
                        objectInfo = type.name;
                      } else {
                        // Try to show what properties it has
                        const keys = Object.keys(type).slice(0, 5);
                        if (keys.length > 0) {
                          objectInfo = `object with properties: ${keys.join(', ')}`;
                        }
                      }
                    } catch (e) {
                      // Ignore errors in trying to get object info
                    }
                    
                    // Generate helpful error message
                    const errorMsg = [
                      `Invalid JSX element type: React received an object (${objectInfo}) instead of a React component function.`,
                      '',
                      'This often occurs when JSX elements or React.createElement receive an object instead of a valid component function.',
                      '',
                      'Inspect all instances where you are using JSX elements that come from libraries or components to ensure they are properly referenced.',
                      '',
                      'The exact fix depends on the specific library or component structure.'
                    ].join('\\n');
                    
                    // Log to both console and error tracking
                    console.error('🔴 Invalid JSX Element Type Detected:', errorMsg);
                    
                    // Store the error for later collection
                    (window as any).__testHarnessRuntimeErrors.push({
                      message: errorMsg,
                      type: 'invalid-element-type',
                      phase: 'createElement',
                      source: 'enhanced-detection',
                      elementInfo: objectInfo
                    });
                    
                    // Still try to call the original to get React's error too
                    // This will provide the component stack trace
                  }
                } else if (type === undefined) {
                  // Undefined component - likely a failed destructure or missing import
                  const errorMsg = [
                    'Invalid JSX element type: component is undefined.',
                    '',
                    'This occurs when a JSX element references a component that is undefined at runtime.',
                    '',
                    'Inspect how this component is being accessed - it may not exist in the expected location or may have a different name.',
                    '',
                    'Check that the component exists in your dependencies or libraries and is properly referenced.'
                  ].join('\\n');
                  
                  console.error('🔴 Undefined JSX Component:', errorMsg);
                  
                  (window as any).__testHarnessRuntimeErrors.push({
                    message: errorMsg,
                    type: 'undefined-component',
                    phase: 'createElement',
                    source: 'enhanced-detection'
                  });
                }
                
                // Call original createElement
                return originalCreateElement.apply(this, [type, props, ...children]);
              };
            }
          }

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
            },
            callbacks: {
              OpenEntityRecord: (entityName: string, key: any) => {
                console.log('[Test Harness] OpenEntityRecord called:', { entityName, key });
              },
              RegisterMethod: (methodName: string, handler: any) => {
                console.log('[Test Harness] RegisterMethod called:', { methodName });
                // In test harness, we just log but don't actually register
              },
              CreateSimpleNotification: (message: string, style: "none" | "success" | "error" | "warning" | "info", hideAfter?: number) => {
                console.log('[Test Harness] CreateSimpleNotification called:', { message, style, hideAfter });
                // In test harness, we just log but don't display actual notifications
              }
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
      let hasTimeout = false;
      try {
        executionResult = await Promise.race([executionPromise, timeoutPromise]);
      } catch (timeoutError) {
        // Handle timeout gracefully
        hasTimeout = true;
        errors.push(`Component execution timed out after ${globalTimeout}ms`);
        executionResult = { 
          success: false, 
          error: timeoutError instanceof Error ? timeoutError.message : 'Execution timeout' 
        };
      }

      // Ensure executionResult has proper shape
      if (!executionResult) {
        executionResult = {
          success: false,
          error: 'Component execution returned no result'
        };
        errors.push('Component execution failed to return a result');
      } else if (!executionResult.success && executionResult.error) {
        // Add the execution error if it hasn't been captured elsewhere
        const errorMsg = `Component execution failed: ${executionResult.error}`;
        if (!errors.some(e => e.includes(executionResult.error!))) {
          errors.push(errorMsg);
        }
      }
      
      if (debug) {
        console.log('Execution result:', executionResult);
      }

      // If we hit a timeout, skip all remaining page operations - the browser may be unresponsive
      // Return early with the timeout error to avoid "Target page closed" crashes
      if (hasTimeout) {
        console.log('⚠️ Timeout detected - skipping remaining page operations');

        // Build timeout-specific violation
        const timeoutViolation: Violation = {
          message: `Component execution timed out after ${globalTimeout}ms. This usually indicates an infinite render loop.`,
          severity: 'critical' as const,
          rule: 'timeout',
          line: 0,
          column: 0,
          source: 'test-harness' as const
        };

        return {
          success: false,
          errors: [timeoutViolation],
          warnings: [],
          console: [],
          html: '<html><body><!-- Timeout - no content captured --></body></html>',
          screenshot: Buffer.from(''),
          renderCount: 0,
          executionTime: Date.now() - startTime
        };
      }

      // Wait for render completion
      const renderWaitTime = options.renderWaitTime || 500;
      await page.waitForTimeout(renderWaitTime);

      // Get render count
      renderCount = await page.evaluate(() => (window as any).__testHarnessRenderCount || 0);

      // Collect all errors with source information
      const runtimeErrorsWithSource = await this.collectRuntimeErrors(page);
      // Filter out JSX element type errors when adding to errors array
      errors.push(...runtimeErrorsWithSource
        .filter(e => {
          // Skip JSX element type errors from error count
          const isJSXError = e.type === 'invalid-element-type' || 
                            e.type === 'undefined-component';
          return !isJSXError;
        })
        .map(e => e.message)); // Extract messages for backward compat

      // Collect warnings (separate from errors)
      const collectedWarnings = await this.collectWarnings(page);
      warnings.push(...collectedWarnings);

      // Capture async errors
      const asyncWaitTime = options.asyncErrorWaitTime || 1000;
      await page.waitForTimeout(asyncWaitTime);
      
      const asyncErrors = await this.collectRuntimeErrors(page);
      // Only add new errors (excluding JSX element type errors)
      asyncErrors.forEach(err => {
        const isJSXError = err.type === 'invalid-element-type' || 
                          err.type === 'undefined-component';
        if (!isJSXError && !errors.includes(err.message)) {
          errors.push(err.message);
          runtimeErrorsWithSource.push(err); // Keep the structured version too
        } else if (isJSXError && !runtimeErrorsWithSource.some(e => e.message === err.message)) {
          // Still track JSX errors for logging but don't add to errors array
          runtimeErrorsWithSource.push(err);
        }
      });
      
      // Also check for new warnings
      const asyncWarnings = await this.collectWarnings(page);
      asyncWarnings.forEach(warn => {
        if (!warnings.includes(warn)) {
          warnings.push(warn);
        }
      });

      // Get the rendered HTML with size protection
      // Node.js has a maximum string length of ~536MB (0x1fffffe8 characters)
      // If content is too large, it will crash the process with ERR_STRING_TOO_LONG
      let html: string;
      let screenshot: Buffer;

      try {
        // Try to get HTML content with a reasonable size limit
        html = await page.content();

        // Check if HTML is excessively large (>100MB is suspicious)
        const htmlSizeEstimate = Buffer.byteLength(html, 'utf8');
        const maxSafeSize = 100 * 1024 * 1024; // 100MB

        if (htmlSizeEstimate > maxSafeSize) {
          console.warn(`⚠️ HTML content is very large (${Math.round(htmlSizeEstimate / 1024 / 1024)}MB). Truncating to prevent crashes.`);
          // Truncate to a safe size
          html = html.substring(0, maxSafeSize) + '\n<!-- TRUNCATED: Content exceeded safe size limit -->';
          errors.push(`HTML content too large (${Math.round(htmlSizeEstimate / 1024 / 1024)}MB). This may indicate excessive data or a render issue.`);
        }
      } catch (error: unknown) {
        const errorMsg = error instanceof Error ? error.message : String(error);
        if (errorMsg.includes('string longer than') || errorMsg.includes('ERR_STRING_TOO_LONG')) {
          console.error('❌ HTML content exceeds Node.js maximum string length. Cannot capture page content.');
          html = '<html><body><!-- ERROR: Content too large to capture (exceeds Node.js string limit) --></body></html>';
          errors.push('HTML content exceeds maximum size (>536MB). Component may be rendering too much data.');
        } else {
          console.error('❌ Failed to capture HTML content:', errorMsg);
          html = '<html><body><!-- ERROR: Failed to capture content --></body></html>';
          errors.push(`Failed to capture HTML: ${errorMsg}`);
        }
      }

      // Take screenshot with size protection
      try {
        screenshot = await page.screenshot();

        // Check screenshot size (should be reasonable)
        const screenshotSize = screenshot.length;
        const maxScreenshotSize = 50 * 1024 * 1024; // 50MB

        if (screenshotSize > maxScreenshotSize) {
          console.warn(`⚠️ Screenshot is very large (${Math.round(screenshotSize / 1024 / 1024)}MB). This is unusual.`);
          // Keep the screenshot but add a warning
          warnings.push(`Screenshot size is unusually large (${Math.round(screenshotSize / 1024 / 1024)}MB).`);
        }
      } catch (error: unknown) {
        const errorMsg = error instanceof Error ? error.message : String(error);
        console.error('❌ Failed to capture screenshot:', errorMsg);
        screenshot = Buffer.from('');
        // Don't add to errors - screenshot is not critical for functionality
      }

      // Check for excessive render count first
      const hasRenderLoop = renderCount > ComponentRunner.MAX_RENDER_COUNT;
      if (hasRenderLoop) {
        errors.push(`Possible render loop: ${renderCount} createElement calls detected (likely infinite loop)`);
      }

      // Determine success
      const success = errors.length === 0 && 
                     !hasRenderLoop &&
                     !hasTimeout &&
                     executionResult.success;

      // Combine runtime errors with data errors
      const allErrors = [...errors, ...dataErrors];
      
      // Map runtime errors with source info and specific rules
      // Filter out JSX element type errors - they're too noisy and often false positives
      const errorViolations = runtimeErrorsWithSource
        .filter(e => {
          // Skip JSX element type errors - still logged but not reported as violations
          const isJSXError = e.rule === 'invalid-jsx-element' || 
                            e.rule === 'undefined-jsx-component' ||
                            e.type === 'invalid-element-type' ||
                            e.type === 'undefined-component';
          if (isJSXError && debug) {
            console.log('📝 JSX element error detected but not reported as violation:', e.message);
          }
          return !isJSXError;
        })
        .map(e => ({
          message: e.message,
          severity: 'critical' as const,
          rule: e.rule || 'runtime-error',  // Use specific rule from collectRuntimeErrors
          line: 0,
          column: 0,
          source: e.source as ('user-component' | 'runtime-wrapper' | 'react-framework' | 'test-harness' | undefined)
        }));
      
      // Add timeout error if detected
      if (hasTimeout) {
        errorViolations.push({
          message: `Component execution timed out after ${globalTimeout}ms`,
          severity: 'critical' as const,
          rule: 'timeout',
          line: 0,
          column: 0,
          source: 'test-harness' as const // This is a test harness timeout
        });
      }
      
      // Add render loop error if detected
      if (hasRenderLoop) {
        errorViolations.push({
          message: `Possible render loop: ${renderCount} createElement calls detected (likely infinite loop)`,
          severity: 'critical' as const,
          rule: 'render-loop',
          line: 0,
          column: 0,
          source: 'test-harness' as const // This is a test harness detection
        });
      }
      
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
      
      // Check warnings for critical patterns and move them to errors
      const criticalWarningViolations: Violation[] = [];
      const regularWarnings: string[] = [];
      
      warnings.forEach(w => {
        if (ComponentRunner.CRITICAL_WARNING_PATTERNS.some(pattern => pattern.test(w))) {
          // This is a critical warning - add to errors
          criticalWarningViolations.push({
            message: w,
            severity: 'critical' as const,
            rule: 'critical-react-warning',
            line: 0,
            column: 0,
            source: 'react-framework' as const
          });
        } else {
          // Regular warning
          regularWarnings.push(w);
        }
      });
      
      // Combine all error violations
      const combinedErrors = [...errorViolations, ...criticalWarningViolations];

      // Reclassify any browser crash errors before calculating success metrics
      const { violations: allErrorViolations, hasBrowserCrash } =
        ComponentRunner.reclassifyBrowserCrashErrors(combinedErrors);

      // Calculate codeExecutionSuccess: no critical/high errors excluding browser-crash
      // Medium, low, and warning severity don't affect this metric
      const nonCrashCriticalHighErrors = allErrorViolations.filter(e =>
        (e.severity === 'critical' || e.severity === 'high') && e.rule !== 'browser-crash'
      );
      const codeExecutionSuccess = nonCrashCriticalHighErrors.length === 0;

      const result: ComponentExecutionResult = {
        success: success && dataErrors.length === 0 && criticalWarningViolations.length === 0, // Fail on critical warnings too
        html,
        errors: allErrorViolations,
        browserCrash: hasBrowserCrash,
        warnings: regularWarnings.map(w => ({
          message: w,
          severity: 'low' as const,
          rule: 'warning',
          line: 0,
          column: 0
        })),
        console: consoleLogs,
        screenshot,
        executionTime: Date.now() - startTime,
        renderCount,
        codeExecutionSuccess
      };

      if (debug) {
        this.dumpDebugInfo(result);
      }

      return result;

    } catch (error) {
      // For catch block errors, we need to handle them specially
      const errorMessage = error instanceof Error ? error.message : String(error);

      // Create initial error violations - the caught error plus any data errors
      const initialViolations: Violation[] = [{
        message: errorMessage,
        severity: 'critical' as const,
        rule: 'runtime-error',
        line: 0,
        column: 0,
        source: 'test-harness' as const
      }];

      // Add any data errors
      dataErrors.forEach(e => {
        initialViolations.push({
          message: e,
          severity: 'critical' as const,
          rule: 'runtime-error',
          line: 0,
          column: 0,
          source: 'user-component' as const
        });
      });

      // Reclassify any browser crash errors using the shared helper
      const { violations: errorViolations, hasBrowserCrash } =
        ComponentRunner.reclassifyBrowserCrashErrors(initialViolations);

      // Calculate codeExecutionSuccess: no critical/high errors excluding browser-crash
      // Medium, low, and warning severity don't affect this metric
      const nonCrashCriticalHighErrors = errorViolations.filter(e =>
        (e.severity === 'critical' || e.severity === 'high') && e.rule !== 'browser-crash'
      );
      const codeExecutionSuccess = nonCrashCriticalHighErrors.length === 0;

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
        console: consoleLogs,
        executionTime: Date.now() - startTime,
        renderCount,
        browserCrash: hasBrowserCrash,
        codeExecutionSuccess
      };

      if (debug) {
        if (hasBrowserCrash && codeExecutionSuccess) {
          console.log('\n⚠️ Browser crashed but code executed successfully - component worked fine');
          console.log('   codeExecutionSuccess=true, no need to regenerate');
        } else {
          console.log('\n❌ Component execution failed with error:', error);
        }
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
   * @deprecated Moved inline to page.evaluate after library loading to avoid false positives
   */
  private async setupErrorTracking_DEPRECATED(page: any, componentSpec: ComponentSpec, allLibraries?: ComponentLibraryEntity[]) {
    await page.evaluate(({ spec, availableLibraries }: { spec: any; availableLibraries: any[] }) => {
      // Initialize error tracking
      (window as any).__testHarnessRuntimeErrors = [];
      (window as any).__testHarnessConsoleErrors = [];
      (window as any).__testHarnessConsoleWarnings = [];
      (window as any).__testHarnessTestFailed = false;
      (window as any).__testHarnessRenderCount = 0;

      // Track renders and detect invalid element types
      const originalCreateElement = (window as any).React?.createElement;
      if (originalCreateElement) {
        (window as any).React.createElement = function(type: any, props: any, ...children: any[]) {
          (window as any).__testHarnessRenderCount++;
          
          // Enhanced error detection for invalid element types
          if (type !== null && type !== undefined) {
            const typeOf = typeof type;
            
            // Check for the common "object instead of component" error
            if (typeOf === 'object' && !(window as any).React.isValidElement(type)) {
              // Try to get a meaningful name for the object
              let objectInfo = 'unknown object';
              try {
                if (type.constructor && type.constructor.name) {
                  objectInfo = type.constructor.name;
                } else if (type.name) {
                  objectInfo = type.name;
                } else {
                  // Try to show what properties it has
                  const keys = Object.keys(type).slice(0, 5);
                  if (keys.length > 0) {
                    objectInfo = `object with properties: ${keys.join(', ')}`;
                  }
                }
              } catch (e) {
                // Ignore errors in trying to get object info
              }
              
              // Generate helpful error message
              const errorMsg = [
                `Invalid JSX element type: React received an object (${objectInfo}) instead of a React component function.`,
                '',
                'This often occurs when JSX elements or React.createElement receive an object instead of a valid component function.',
                '',
                'Inspect all instances where you are using JSX elements that come from libraries or components to ensure they are properly referenced.',
                '',
                'The exact fix depends on the specific library or component structure.'
              ].join('\\n');
              
              // Log to both console and error tracking
              console.error('🔴 Invalid JSX Element Type Detected:', errorMsg);
              
              // Store the error for later collection
              (window as any).__testHarnessRuntimeErrors = (window as any).__testHarnessRuntimeErrors || [];
              (window as any).__testHarnessRuntimeErrors.push({
                message: errorMsg,
                type: 'invalid-element-type',
                phase: 'createElement',
                source: 'enhanced-detection',
                elementInfo: objectInfo
              });
              
              // Still try to call the original to get React's error too
              // This will provide the component stack trace
            }
          } else if (type === undefined) {
            // Undefined component - likely a failed destructure or missing import
            const errorMsg = [
              'Invalid JSX element type: component is undefined.',
              '',
              'This occurs when a JSX element references a component that is undefined at runtime.',
              '',
              'Inspect how this component is being accessed - it may not exist in the expected location or may have a different name.',
              '',
              'Check that the component exists in your dependencies or libraries and is properly referenced.'
            ].join('\\n');
            
            console.error('🔴 Undefined JSX Component:', errorMsg);
            
            (window as any).__testHarnessRuntimeErrors = (window as any).__testHarnessRuntimeErrors || [];
            (window as any).__testHarnessRuntimeErrors.push({
              message: errorMsg,
              type: 'undefined-component',
              phase: 'createElement',
              source: 'enhanced-detection'
            });
          }
          
          // Call original createElement
          return originalCreateElement.call(this, type, props, ...children);
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

      // Helper function to analyze undefined identifiers
      const analyzeUndefinedIdentifier = (identifier: string, spec: any, availableLibraries: any[]) => {
        const result = {
          isInSpecLibraries: false,
          isInSpecDependencies: false,
          isAvailableLibrary: false,
          matchedLibrary: null as any,
          specLibraries: spec?.libraries || [],
          specDependencies: spec?.dependencies || []
        };
        
        // Check if it's in spec libraries
        result.isInSpecLibraries = result.specLibraries.some(
          (lib: any) => lib.globalVariable === identifier
        );
        
        // Check if it's in spec dependencies  
        result.isInSpecDependencies = result.specDependencies.some(
          (dep: any) => dep.name === identifier
        );
        
        // Check against ALL available libraries (case-insensitive)
        if (availableLibraries) {
          const availableLib = availableLibraries.find(
            (lib: any) => lib.GlobalVariable && 
                         lib.GlobalVariable.toLowerCase() === identifier.toLowerCase()
          );
          
          if (availableLib) {
            result.isAvailableLibrary = true;
            result.matchedLibrary = availableLib;
          }
        }
        
        return result;
      };

      // Helper function to generate guidance message
      const generateGuidance = (identifier: string, analysis: any) => {
        // Case 1: Trying to use a library not in their spec
        if (analysis.isAvailableLibrary && !analysis.isInSpecLibraries) {
          const libList = analysis.specLibraries.length > 0
            ? analysis.specLibraries.map((l: any) => l.globalVariable || l.name).filter(Boolean).join(', ')
            : 'no third-party libraries';
            
          return `${identifier} is not defined. It appears you're trying to use the ${analysis.matchedLibrary.Name} library. ` +
                 `You do NOT have access to this library. ` +
                 `Your architect gave you access to: ${libList}. ` +
                 `You must work within these constraints and cannot load additional libraries.`;
        }
        
        // Case 2: Should be a component but not properly accessed
        if (analysis.isInSpecDependencies) {
          return `${identifier} is not defined. This component exists in your dependencies. ` +
                 `Ensure you've destructured it: const { ${identifier} } = components; ` +
                 `or accessed it as: components.${identifier}`;
        }
        
        // Case 3: Not a valid library or component
        const libList = analysis.specLibraries.length > 0
          ? `Available libraries: ${analysis.specLibraries.map((l: any) => l.globalVariable || l.name).filter(Boolean).join(', ')}`
          : 'No third-party libraries are available';
          
        const depList = analysis.specDependencies.length > 0
          ? `Available components: ${analysis.specDependencies.map((d: any) => d.name).join(', ')}`
          : 'No component dependencies are available';
          
        return `${identifier} is not defined. This is not a valid library or component in your specification. ` +
               `${libList}. ${depList}. ` +
               `You must only use the libraries and components specified in your component specification.`;
      };

      // Global error handler
      window.addEventListener('error', (event) => {
        // Check for "X is not defined" errors
        const notDefinedMatch = event.message?.match(/^(\w+) is not defined$/);
        
        if (notDefinedMatch) {
          const identifier = notDefinedMatch[1];
          
          // Analyze what this identifier might be
          const analysis = analyzeUndefinedIdentifier(identifier, spec, availableLibraries);
          
          // Generate specific guidance
          const guidance = generateGuidance(identifier, analysis);
          
          // Store enhanced error with specific guidance
          (window as any).__testHarnessRuntimeErrors.push({
            message: guidance,
            stack: event.error?.stack,
            type: 'undefined-identifier',
            source: 'user-component',
            identifier: identifier
          });
          (window as any).__testHarnessTestFailed = true;
          return;
        }
        
        // Handle other errors as before
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
    }, { spec: componentSpec, availableLibraries: allLibraries || [] });
  }

  /**
   * Collect runtime errors from the page
   */
  private async collectRuntimeErrors(page: any): Promise<Array<{message: string; source?: string; type?: string; rule?: string}>> {
    const errorData = await page.evaluate(() => {
      return {
        runtimeErrors: (window as any).__testHarnessRuntimeErrors || [],
        consoleErrors: (window as any).__testHarnessConsoleErrors || [],
        testFailed: (window as any).__testHarnessTestFailed || false
      };
    });

    // Track unique errors and their counts
    const errorMap = new Map<string, {error: any; count: number}>();
    
    // Check if we have any specific React render errors
    const hasSpecificReactError = errorData.runtimeErrors.some((error: any) => 
      error.type === 'react-render-error' && 
      !error.message.includes('Script error')
    );

    // Process runtime errors with their source information
    errorData.runtimeErrors.forEach((error: any) => {
      // Skip generic "Script error" messages if we have more specific React errors
      if (hasSpecificReactError && 
          error.type === 'runtime' && 
          error.message === 'Script error.') {
        return; // Skip this generic error
      }
      
      // Map error types to specific rule names
      let rule = 'runtime-error';
      switch(error.type) {
        case 'invalid-element-type':
          rule = 'invalid-jsx-element';
          break;
        case 'undefined-component':
          rule = 'undefined-jsx-component';
          break;
        case 'undefined-identifier':
          rule = 'undefined-identifier';
          break;
        case 'react-render-error':
          rule = 'react-render-error';
          break;
        case 'render-loop':
          rule = 'infinite-render-loop';
          break;
        case 'registration-error':
          rule = 'component-registration-error';
          break;
        case 'execution-error':
          rule = 'execution-error';
          break;
        case 'runtime':
          rule = 'runtime-error';
          break;
        case 'promise-rejection':
          rule = 'unhandled-promise-rejection';
          break;
      }
      
      // Create a key for deduplication based on message and type
      const key = `${error.type}:${error.message}`;
      
      if (errorMap.has(key)) {
        // Increment count for duplicate
        errorMap.get(key)!.count++;
      } else {
        // Add new error
        errorMap.set(key, {
          error: {
            message: error.message,
            source: error.source,
            type: error.type,
            rule: rule
          },
          count: 1
        });
      }
    });

    // Process console errors
    errorData.consoleErrors.forEach((error: string) => {
      const key = `console-error:${error}`;
      
      if (errorMap.has(key)) {
        errorMap.get(key)!.count++;
      } else {
        errorMap.set(key, {
          error: {
            message: error,
            source: 'react-framework',
            type: 'console-error',
            rule: 'console-error'
          },
          count: 1
        });
      }
    });

    // Convert map to array with occurrence counts
    const errors: Array<{message: string; source?: string; type?: string; rule?: string}> = [];
    errorMap.forEach(({error, count}) => {
      // Append count if > 1
      const message = count > 1 
        ? `${error.message} (occurred ${count} times)`
        : error.message;
      
      errors.push({
        ...error,
        message
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
    warnings: string[]
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
    
    
    console.log('\n========================================\n');
  }
}