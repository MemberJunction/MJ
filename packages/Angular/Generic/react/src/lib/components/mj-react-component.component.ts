/**
 * @fileoverview Angular component that hosts React components with proper memory management.
 * Provides a bridge between Angular and React ecosystems in MemberJunction applications.
 * @module @memberjunction/ng-react
 */

import {
  Component,
  Input,
  Output,
  EventEmitter,
  ViewChild,
  ElementRef,
  AfterViewInit,
  OnDestroy,
  ChangeDetectionStrategy,
  ChangeDetectorRef
} from '@angular/core';
import { Subject } from 'rxjs';
import { BaseAngularComponent } from '@memberjunction/ng-base-types';
import { ComponentSpec, ComponentCallbacks, ComponentStyles, ComponentObject, BaseEventArgs } from '@memberjunction/interactive-component-types';
import { ReactBridgeService } from '../services/react-bridge.service';
import { AngularAdapterService } from '../services/angular-adapter.service';
import {
  createErrorBoundary,
  ComponentHierarchyRegistrar,
  resourceManager,
  reactRootManager,
  ResolvedComponents,
  SetupStyles,
  ComponentRegistryService
} from '@memberjunction/react-runtime';
import { createRuntimeUtilities } from '../utilities/runtime-utilities';
import { LogError, CompositeKey, KeyValuePair, Metadata, RunView, RunViewParams, RunViewResult, RunQueryParams, RunQueryResult, DataSnapshot, DataTable, MJColumnDescriptor } from '@memberjunction/core';
import { MJNotificationService } from '@memberjunction/ng-notifications';
import { ComponentMetadataEngine } from '@memberjunction/core-entities';
import { ComponentUtilities, SimpleRunView, SimpleRunQuery } from '@memberjunction/interactive-component-types';

/**
 * A captured RunView/RunQuery result with its original parameters.
 * Used by the automatic data capture system for components that don't
 * implement getCurrentDataState().
 */
interface CapturedDataResult {
  /** Entity name or query name */
  sourceName: string;
  /** 'view' or 'query' */
  sourceType: 'view' | 'query';
  /** Original RunView/RunQuery params */
  params: Record<string, unknown>;
  /** Returned rows */
  rows: Record<string, unknown>[];
  /** Total available rows (may differ from rows.length due to pagination) */
  totalRows: number;
  /** When the data was fetched */
  fetchedAt: Date;
}

/**
 * Event emitted by React components
 */
export interface ReactComponentEvent {
  type: string;
  payload: any;
}

/**
 * State change event emitted when component state updates
 */
export interface StateChangeEvent {
  path: string;
  value: any;
}

/**
 * User settings changed event emitted when component saves user preferences
 */
export interface UserSettingsChangedEvent {
  settings: Record<string, any>;
  componentName?: string;
  timestamp: Date;
}

/**
 * Angular component that hosts React components with proper memory management.
 * This component provides a bridge between Angular and React, allowing React components
 * to be used seamlessly within Angular applications.
 */
@Component({
  standalone: false,
  selector: 'mj-react-component',
  template: `
    <div class="react-component-wrapper">
      <div #container class="react-component-container" [class.loading]="!isInitialized"></div>
      @if (!isInitialized && !hasError) {
        <div class="loading-overlay">
          <div class="loading-spinner">
            <i class="fa-solid fa-spinner fa-spin"></i>
          </div>
          <div class="loading-text">Loading component...</div>
        </div>
      }
    </div>
  `,
  styles: [`
    :host {
      display: block;
      width: 100%;
      height: 100%;
    }
    .react-component-wrapper {
      position: relative;
      width: 100%;
      height: 100%;
    }
    .react-component-container {
      width: 100%;
      height: 100%;
      transition: opacity 0.3s ease;
    }
    .react-component-container.loading {
      opacity: 0;
    }
    .loading-overlay {
      position: absolute;
      top: 0;
      left: 0;
      right: 0;
      bottom: 0;
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      background-color: rgba(255, 255, 255, 0.9);
      z-index: 1;
    }
    .loading-spinner {
      font-size: 48px;
      color: #5B4FE9;
      margin-bottom: 16px;
    }
    .loading-text {
      font-family: -apple-system, BlinkMacSystemFont, "Inter", "Segoe UI", Roboto, sans-serif;
      font-size: 14px;
      color: #64748B;
      margin-top: 8px;
    }
  `],
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class MJReactComponent extends BaseAngularComponent implements AfterViewInit, OnDestroy  {
  private _component!: ComponentSpec;

  /**
   * The component specification to render.
   * When this changes after initialization, the component will be reinitialized
   * to load and render the new specification.
   */
  @Input()
  set component(value: ComponentSpec) {
    const previousComponent = this._component;
    this._component = value;

    // If already initialized and component spec changed, reinitialize
    if (this.isInitialized && value && previousComponent !== value) {
      // Check if it's actually a different component (not just same reference)
      const isDifferent = !previousComponent ||
        previousComponent.name !== value.name ||
        previousComponent.code !== value.code ||
        previousComponent.version !== value.version;

      if (isDifferent) {
        this.reinitializeComponent();
      }
    }
  }
  get component(): ComponentSpec {
    return this._component;
  }

  /**
   * Controls verbose logging for component lifecycle and operations.
   * Note: This does NOT control which React build (dev/prod) is loaded.
   * To control React builds, use ReactDebugConfig.setDebugMode() at app startup.
   */
  @Input() enableLogging: boolean = false;
  @Input() useComponentManager: boolean = true; // NEW: Use unified ComponentManager by default
  
  // Auto-initialize utilities if not provided
  private _utilities: any;
  @Input()
  set utilities(value: any) {
    this._utilities = value;
  }
  get utilities(): any {
    // Lazy initialization - only create default utilities when needed
    if (!this._utilities) {
      const runtimeUtils = createRuntimeUtilities();
      this._utilities = runtimeUtils.buildUtilities(this.enableLogging);
      if (this.enableLogging) {
        console.log('MJReactComponent: Auto-initialized utilities using createRuntimeUtilities()');
      }
    }
    return this._utilities;
  }
  
  // Auto-initialize styles if not provided
  private _styles?: Partial<ComponentStyles>;
  @Input()
  set styles(value: Partial<ComponentStyles> | undefined) {
    this._styles = value;
  }
  get styles(): Partial<ComponentStyles> {
    // Lazy initialization - only create default styles when needed
    if (!this._styles) {
      this._styles = SetupStyles();
      if (this.enableLogging) {
        console.log('MJReactComponent: Auto-initialized styles using SetupStyles()');
      }
    }
    return this._styles;
  }
  
  private _savedUserSettings: any = {};
  @Input()
  set savedUserSettings(value: any) {
    this._savedUserSettings = value || {};
    // Re-render if component is initialized
    if (this.isInitialized) {
      this.renderComponent();
    }
  }
  get savedUserSettings(): any {
    return this._savedUserSettings;
  }
  
  @Output() stateChange = new EventEmitter<StateChangeEvent>();
  @Output() componentEvent = new EventEmitter<ReactComponentEvent>();
  @Output() refreshData = new EventEmitter<void>();
  @Output() openEntityRecord = new EventEmitter<{ entityName: string; key: CompositeKey }>();
  @Output() userSettingsChanged = new EventEmitter<UserSettingsChangedEvent>();
  /** Emitted once after the component successfully loads and resolvedComponentSpec is populated. */
  @Output() initialized = new EventEmitter<void>();
  
  @ViewChild('container', { read: ElementRef, static: true }) container!: ElementRef<HTMLDivElement>;

  // ─── Automatic data capture ───
  // Stores RunView/RunQuery results for components that don't implement getCurrentDataState().
  // Cleared on component reinitialize. Used as fallback in GetCurrentDataState().
  private capturedData: CapturedDataResult[] = [];

  private reactRootId: string | null = null;
  private compiledComponent: ComponentObject | null = null;
  private loadedDependencies: Record<string, ComponentObject> = {};
  private destroyed$ = new Subject<void>();
  private currentCallbacks: ComponentCallbacks | null = null;
  isInitialized = false;
  private isRendering = false;
  private pendingRender = false;
  private isDestroying = false;
  private componentId: string;
  private componentVersion: string = '';  // Store the version for resolver
  hasError = false;
  
  /**
   * Public property containing the fully resolved component specification.
   * This includes all external code fetched from registries, allowing consumers
   * to inspect the complete resolved specification including dependencies.
   * Only populated after successful component initialization.
   */
  public resolvedComponentSpec: ComponentSpec | null = null;

  constructor(
    private reactBridge: ReactBridgeService,
    private adapter: AngularAdapterService,
    private cdr: ChangeDetectorRef,
    private notificationService: MJNotificationService
  ) {
    super();
    // Generate unique component ID for resource tracking
    this.componentId = `mj-react-component-${Date.now()}-${Math.random()}`;
  }

  async ngAfterViewInit() {
    // Try to get registry size safely
    let registrySize = 'N/A';
    try {
      if (this.adapter.isInitialized()) {
        registrySize = this.adapter.getRegistry().size().toString();
      } else {
        registrySize = 'Not initialized yet';
      }
    } catch (e) {
      registrySize = 'Not available';
    }
    
    console.log(`🎬 [ngAfterViewInit] Starting component initialization:`, {
      componentId: this.componentId,
      componentName: this.component?.name,
      timestamp: new Date().toISOString(),
      registrySize: registrySize
    });
    
    // Trigger change detection to show loading state
    this.cdr.detectChanges();
    await this.initializeComponent();
  }

  ngOnDestroy() {
    // Set destroying flag immediately
    this.isDestroying = true;

    // Cancel any pending renders
    this.pendingRender = false;

    this.destroyed$.next();
    this.destroyed$.complete();
    this.cleanup();
  }

  /**
   * Reinitialize the component when the input spec changes.
   * Cleans up the current component and initializes with the new spec.
   */
  private async reinitializeComponent() {
    // Don't reinitialize if we're being destroyed
    if (this.isDestroying) {
      return;
    }

    // Clear cached state from previous component
    this.compiledComponent = null;
    this.resolvedComponentSpec = null;
    this.loadedDependencies = {};
    this.componentVersion = '';
    this.hasError = false;
    this.isInitialized = false;
    this.capturedData = [];

    // Unmount existing React root if present
    if (this.reactRootId) {
      this.isRendering = false;
      this.pendingRender = false;
      reactRootManager.unmountRoot(this.reactRootId);
      this.reactRootId = null;
    }

    // Trigger change detection to show loading state
    this.cdr.detectChanges();

    // Initialize with the new component spec
    await this.initializeComponent();
  }

  /**
   * Initialize the React component
   */
  private async initializeComponent() {
    try {
      // Ensure React is loaded
      await this.reactBridge.getReactContext();

      // Wait for React to be fully ready (handles first-load delay)
      await this.reactBridge.waitForReactReady();

      // NEW: Use ComponentManager if enabled (default: true)
      if (this.useComponentManager) {
        console.log(`🎯 [initializeComponent] Using NEW ComponentManager approach`);
        await this.loadComponentWithManager();
        
        // Component is already compiled and stored in this.compiledComponent
        // No need to fetch from registry - it's already set
      } else {
        console.log(`📦 [initializeComponent] Using legacy approach (will be deprecated)`);
        // Register component hierarchy (this compiles and registers all components including from registries)
        await this.registerComponentHierarchy();
        
        // The resolved spec should now be available from the registration result
        // No need to fetch again
        
        // Get the already-registered component from the registry
        const registry = this.adapter.getRegistry();
        
        console.log(`🔍 [initializeComponent] Looking for component in registry:`, {
          name: this.component.name,
          namespace: this.component.namespace || 'Global',
          version: this.componentVersion
        });
        
        // Let's also check what's actually in the registry
        // Note: ComponentRegistry doesn't have a list() method, so we'll skip this for now
        
        const componentWrapper = registry.get(
          this.component.name, 
          this.component.namespace || 'Global', 
          this.componentVersion
        );
        
        console.log(`🔍 [initializeComponent] Registry.get result:`, {
          found: !!componentWrapper,
          type: componentWrapper ? typeof componentWrapper : 'undefined',
          hasComponent: componentWrapper ? !!componentWrapper.component : false
        });
        
        if (!componentWrapper) {
          const source = this.component.registry ? `external registry ${this.component.registry}` : 'local registry';
          console.error(`❌ [initializeComponent] Component not found! Details:`, {
            searchedName: this.component.name,
            searchedNamespace: this.component.namespace || 'Global',
            searchedVersion: this.componentVersion,
            source: source
          });
          throw new Error(`Component ${this.component.name} was not found in registry after registration from ${source}`);
        }
        
        // The registry now stores ComponentObjects directly
        // Validate it has the expected structure
        if (!componentWrapper || typeof componentWrapper !== 'object') {
          throw new Error(`Invalid component wrapper returned for ${this.component.name}: ${typeof componentWrapper}`);
        }
        
        if (!componentWrapper.component) {
          throw new Error(`Component wrapper missing 'component' property for ${this.component.name}`);
        }
        
        // Now that we use a regular HOC wrapper, components should always be functions
        if (typeof componentWrapper.component !== 'function') {
          throw new Error(`Component is not a function for ${this.component.name}: ${typeof componentWrapper.component}`);
        }
        
        this.compiledComponent = componentWrapper;
      } // End of else block for legacy approach
      
      // Create managed React root
      const reactContext = this.reactBridge.getCurrentContext();
      if (!reactContext) {
        throw new Error('React context not available');
      }
      
      this.reactRootId = reactRootManager.createRoot(
        this.container.nativeElement,
        (container: HTMLElement) => reactContext.ReactDOM.createRoot(container),
        this.componentId
      );
      
      // Initial render
      this.renderComponent();
      this.isInitialized = true;

      // Trigger change detection since we're using OnPush
      this.cdr.detectChanges();

      // Notify parent that the component has successfully initialized and
      // resolvedComponentSpec is now populated with the full spec from the registry
      this.initialized.emit();

    } catch (error) {
      this.hasError = true;
      LogError(`Failed to initialize React component: ${error}`);
      this.componentEvent.emit({
        type: 'error',
        payload: {
          error: error instanceof Error ? error.message : String(error),
          source: 'initialization'
        }
      });
      // Trigger change detection to show error state
      this.cdr.detectChanges();
    }
  }
 

  /**
   * Generate a hash from component code for versioning
   * Uses a simple hash function that's fast and sufficient for version differentiation
   */
  private generateComponentHash(spec: ComponentSpec): string {
    // Collect all code from the component hierarchy
    const codeStrings: string[] = [];
    
    const collectCode = (s: ComponentSpec) => {
      if (s.code) {
        codeStrings.push(s.code);
      }
      if (s.dependencies) {
        for (const dep of s.dependencies) {
          collectCode(dep);
        }
      }
    };
    
    collectCode(spec);
    
    // Generate hash from concatenated code
    const fullCode = codeStrings.join('|');
    let hash = 0;
    for (let i = 0; i < fullCode.length; i++) {
      const char = fullCode.charCodeAt(i);
      hash = ((hash << 5) - hash) + char;
      hash = hash & hash; // Convert to 32bit integer
    }
    
    // Convert to hex string and take first 8 characters for readability
    const hexHash = Math.abs(hash).toString(16).padStart(8, '0').substring(0, 8);
    return `v${hexHash}`;
  }

  /**
   * Resolve components using the runtime's resolver
   */
  private async resolveComponentsWithVersion(spec: ComponentSpec, version: string, namespace: string = 'Global'): Promise<ResolvedComponents> {
    const resolver = this.adapter.getResolver();
    
    // Debug: Log what dependencies we're trying to resolve
    if (this.enableLogging) {
      console.log(`Resolving components for ${spec.name}. Dependencies:`, spec.dependencies);
    }
    
    // Use the runtime's resolver which now handles registry-based components
    const resolved = await resolver.resolveComponents(
      spec, 
      namespace,
      this.ProviderToUse.CurrentUser // Pass current user context for database operations
    );
    
    if (this.enableLogging) {
      console.log(`Resolved ${Object.keys(resolved).length} components for version ${version}:`, Object.keys(resolved));
    }
    return resolved;
  }


  /**
   * NEW: Load component using unified ComponentManager - MUCH SIMPLER!
   */
  private async loadComponentWithManager() {
    try {
      const manager = this.adapter.getComponentManager();
      
      console.log(`🚀 [ComponentManager] Loading component hierarchy: ${this.component.name}`);
      
      // Load the entire hierarchy with one simple call
      const result = await manager.loadHierarchy(this.component, {
        contextUser: this.ProviderToUse.CurrentUser,
        defaultNamespace: 'Global',
        defaultVersion: this.component.version || this.generateComponentHash(this.component),
        returnType: 'both'
      });
      
      if (!result.success) {
        const errorMessages = result.errors.map(e => `${e.componentName}: ${e.message}`).join(', ');
        console.error(`❌ [ComponentManager] Failed to load hierarchy:`, errorMessages);
        throw new Error(`Component loading failed: ${errorMessages}`);
      }
      
      // Store the results (handle undefined values)
      this.resolvedComponentSpec = this.enrichSpecWithRegistryInfo(result.resolvedSpec || null);
      this.compiledComponent = result.rootComponent || null;
      this.componentVersion = result.resolvedSpec?.version || this.component.version || 'latest';
      
      // IMPORTANT: Store the loaded dependencies for use in renderComponent
      this.loadedDependencies = result.components || {};
      
      console.log(`✅ [ComponentManager] Successfully loaded hierarchy:`, {
        rootComponent: result.resolvedSpec?.name,
        loadedCount: result.loadedComponents.length,
        dependencies: Object.keys(this.loadedDependencies),
        stats: result.stats
      });
      
      // Component is ready to render
      return true;
      
    } catch (error) {
      console.error(`❌ [ComponentManager] Error loading component:`, error);
      throw error;
    }
  }

  /**
   * Register all components in the hierarchy
   * @deprecated Use loadComponentWithManager() instead
   */
  private async registerComponentHierarchy() {
    // Use semantic version from spec or generate hash-based version for uniqueness
    const version = this.component.version || this.generateComponentHash(this.component);
    this.componentVersion = version;  // Store for use in resolver
    
    console.log(`🔍 [registerComponentHierarchy] Starting registration for ${this.component.name}@${version}`, {
      location: this.component.location,
      registry: this.component.registry,
      namespace: this.component.namespace,
      hasCode: !!this.component.code,
      codeLength: this.component.code?.length || 0
    });
    
    // Check if already registered to avoid duplication
    const registry = this.adapter.getRegistry();
    const checkNamespace = this.component.namespace || 'Global';
    
    console.log(`🔍 [registerComponentHierarchy] Checking registry for existing component:`, {
      name: this.component.name,
      namespace: checkNamespace,
      version: version,
      registrySize: registry.size(),
      registryId: registry.registryId || 'unknown'
    });
    
    // Log registry state for debugging
    console.log(`📦 [registerComponentHierarchy] Registry state:`, {
      totalSize: registry.size(),
      registryInstance: registry.registryId || 'unknown'
    });
    
    const existingComponent = registry.get(this.component.name, checkNamespace, version);
    
    if (existingComponent) {
      console.log(`⚠️ [registerComponentHierarchy] Component ${this.component.name}@${version} already registered!`, {
        existingType: typeof existingComponent,
        hasComponent: !!(existingComponent as any).component,
        registrationTime: (existingComponent as any).registeredAt || 'unknown',
        runtimeContextLibraries: Object.keys(this.adapter.getRuntimeContext().libraries || {})
      });
      
      // For registry components, we need to check the resolved spec's libraries, not the input spec
      // The input spec from Angular doesn't have library information for registry components
      if (this.component.location === 'registry' && this.component.registry) {
        console.log(`📋 [registerComponentHierarchy] Component is from registry, need to fetch full spec to check libraries`);
        // Continue to fetch the full spec below - don't return early
      } else {
        // For local components, check using the input spec
        const requiredLibraries = this.component.libraries || [];
        const runtimeLibraries = this.adapter.getRuntimeContext().libraries || {};
        const missingLibraries = requiredLibraries.filter(lib => !runtimeLibraries[lib.globalVariable]);
        
        if (missingLibraries.length > 0) {
          console.warn(`⚠️ [registerComponentHierarchy] Component registered but libraries missing:`, {
            required: requiredLibraries.map(l => l.globalVariable),
            loaded: Object.keys(runtimeLibraries),
            missing: missingLibraries.map(l => l.globalVariable)
          });
          // Don't return early - continue to load libraries
        } else {
          console.log(`✅ [registerComponentHierarchy] Component ${this.component.name}@${version} already registered with all libraries, skipping`);
          return;
        }
      }
    } else {
      console.log(`🆕 [registerComponentHierarchy] Component not found in registry, proceeding with registration`);
    }
    
    // Initialize metadata engine
    await ComponentMetadataEngine.Instance.Config(false, this.ProviderToUse.CurrentUser);
    
    // Use the runtime's hierarchy registrar
    const registrar = new ComponentHierarchyRegistrar(
      this.adapter.getCompiler(),
      this.adapter.getRegistry(),
      this.adapter.getRuntimeContext()
    );
    
    console.log(`📦 [registerComponentHierarchy] Calling registrar.registerHierarchy for ${this.component.name}`, {
      hasStyles: !!this.styles,
      namespace: this.component.namespace || 'Global',
      version: version,
      libraryCount: ComponentMetadataEngine.Instance.ComponentLibraries?.length || 0,
      hasCode: !!this.component.code,
      codeLength: this.component.code?.length || 0
    });
    
    // Register with proper configuration
    // Pass the partial spec - the React runtime will handle fetching from registries
    const result = await registrar.registerHierarchy(
      this.component,  // Pass the original spec, not fetched
      {
        styles: this.styles as ComponentStyles,
        namespace: this.component.namespace || 'Global',
        version: version,
        allowOverride: false,  // Each version is unique
        allLibraries: ComponentMetadataEngine.Instance.ComponentLibraries,
        debug: true,
        contextUser: this.ProviderToUse.CurrentUser
      }
    );
    
    if (!result.success) {
      const errors = result.errors.map(e => e.error).join(', ');
      console.error(`❌ [registerComponentHierarchy] Registration failed:`, errors);
      throw new Error(`Component registration failed: ${errors}`);
    }
    
    // Store the resolved spec from the registration result
    if (result.resolvedSpec) {
      this.resolvedComponentSpec = this.enrichSpecWithRegistryInfo(result.resolvedSpec || null);
      console.log(`📋 [registerComponentHierarchy] Received resolved spec from runtime:`, {
        name: result.resolvedSpec.name,
        hasCode: !!result.resolvedSpec.code,
        libraryCount: result.resolvedSpec.libraries?.length || 0,
        dependencyCount: result.resolvedSpec.dependencies?.length || 0
      });
    }
    
    console.log(`✅ [registerComponentHierarchy] Successfully registered ${result.registeredComponents.length} components:`, result.registeredComponents);
    
    // Verify the component is actually in the registry
    const verifyComponent = registry.get(this.component.name, this.component.namespace || 'Global', version);
    console.log(`🔍 [registerComponentHierarchy] Verification - component in registry after registration:`, {
      found: !!verifyComponent,
      name: this.component.name,
      namespace: this.component.namespace || 'Global',
      version: version,
      componentType: verifyComponent ? typeof verifyComponent : 'not found'
    });
  }

  /**
   * Post-process resolved spec to ensure all components show their true registry source.
   * This enriches the spec for UI display purposes to show where components actually came from.
   * Applied to all resolved specs so any consumer of this wrapper benefits.
   */
  private enrichSpecWithRegistryInfo(spec: ComponentSpec | null): ComponentSpec | null {
    if (!spec || !this.component) return spec;
    
    // Create a deep copy to avoid mutating the original
    const enrichedSpec = JSON.parse(JSON.stringify(spec));
    
    // Recursive function to process spec and all dependencies
    // Takes the original spec at the same level to find registry info
    const processSpec = (currentSpec: ComponentSpec, originalSpec: ComponentSpec) => {
      // If this component has code but shows location as 'embedded', 
      // check the original spec to see where it came from
      if (currentSpec.code && currentSpec.location === 'embedded' && currentSpec.name) {
        // Try to find this component in the original spec at the same level
        // First check if the original spec itself matches by name
        if (originalSpec.name === currentSpec.name) {
          // Use the original's registry info if it had any
          if (originalSpec.location === 'registry' || originalSpec.registry) {
            currentSpec.location = 'registry';
            if (originalSpec.registry) {
              currentSpec.registry = originalSpec.registry;
            }
            if (originalSpec.namespace) {
              currentSpec.namespace = originalSpec.namespace;
            }
          }
        }
        
        // Also check in original's dependencies for a match
        if (originalSpec.dependencies) {
          const originalDep = originalSpec.dependencies.find(d => d.name === currentSpec.name);
          if (originalDep && (originalDep.location === 'registry' || originalDep.registry)) {
            currentSpec.location = 'registry';
            if (originalDep.registry) {
              currentSpec.registry = originalDep.registry;
            }
            if (originalDep.namespace) {
              currentSpec.namespace = originalDep.namespace;
            }
          }
        }
      }
      
      // Process all dependencies recursively
      if (currentSpec.dependencies && Array.isArray(currentSpec.dependencies)) {
        currentSpec.dependencies.forEach((dep, index) => {
          // Find the corresponding original dependency by name or use the one at same index
          let originalDep = originalSpec.dependencies?.find(d => d.name === dep.name);
          if (!originalDep && originalSpec.dependencies && index < originalSpec.dependencies.length) {
            originalDep = originalSpec.dependencies[index];
          }
          if (originalDep) {
            processSpec(dep, originalDep);
          }
        });
      }
    };
    
    processSpec(enrichedSpec, this.component);
    return enrichedSpec;
  }

  /**
   * Render the React component
   */
  private async renderComponent() {
    // Don't render if component is being destroyed
    if (this.isDestroying) {
      return;
    }
    
    if (!this.compiledComponent || !this.reactRootId) {
      return;
    }

    // Prevent concurrent renders
    if (this.isRendering) {
      this.pendingRender = true;
      return;
    }

    const context = this.reactBridge.getCurrentContext();
    if (!context) {
      return;
    }

    this.isRendering = true;
    const { React } = context;
    
    // Resolve components with the correct version using runtime's resolver
    // SKIP this if using ComponentManager - components are already loaded!
    let components = {};
    if (!this.useComponentManager) {
      components = await this.resolveComponentsWithVersion(this.component, this.componentVersion);
    } else {
      // Use the dependencies that were already loaded and unwrapped by ComponentManager
      components = this.loadedDependencies;
      console.log(`🎯 [renderComponent] Using dependencies from ComponentManager:`, Object.keys(components));
    }
    
    // Create callbacks once per component instance
    if (!this.currentCallbacks) {
      this.currentCallbacks = this.createCallbacks();
    }
    
    // Get libraries from runtime context
    const runtimeContext = this.adapter.getRuntimeContext();
    const libraries = runtimeContext.libraries || {};
    
    // Build props — wrap utilities with data capture for fallback snapshot support
    const wrappedUtilities = this.wrapUtilitiesWithCapture(this.utilities);
    const props = {
      utilities: wrappedUtilities,
      callbacks: this.currentCallbacks,
      components,
      styles: this.styles as any,
      libraries, // Pass the loaded libraries to components
      savedUserSettings: this._savedUserSettings,
      onSaveUserSettings: this.handleSaveUserSettings.bind(this)
    };

    // Validate component before creating element
    if (!this.compiledComponent.component) {
      LogError(`Component is undefined for ${this.component.name} during render`);
      return;
    }
    
    // Components should be functions after HOC wrapping
    if (typeof this.compiledComponent.component !== 'function') {
      LogError(`Component is not a function for ${this.component.name}: ${typeof this.compiledComponent.component}`);
      return;
    }

    // Create error boundary
    const ErrorBoundary = createErrorBoundary(React, {
      onError: this.handleReactError.bind(this),
      logErrors: true,
      recovery: 'retry'
    });

    // Create element with error boundary
    const element = React.createElement(
      ErrorBoundary,
      null,
      React.createElement(this.compiledComponent.component, props)
    );

    // Render with timeout protection using resource manager
    const timeoutId = resourceManager.setTimeout(
      this.componentId,
      () => {
        // Check if still rendering and not destroyed
        if (this.isRendering && !this.isDestroying) {
          this.componentEvent.emit({
            type: 'error',
            payload: {
              error: 'Component render timeout - possible infinite loop detected',
              source: 'render'
            }
          });
        }
      },
      5000,
      { purpose: 'render-timeout-protection' }
    );

    // Use managed React root for rendering
    reactRootManager.render(
      this.reactRootId,
      element,
      () => {
        // Clear the timeout as render completed
        resourceManager.clearTimeout(this.componentId, timeoutId);
        
        // Don't update state if component is destroyed
        if (this.isDestroying) {
          return;
        }
        
        this.isRendering = false;
        
        // If there was a pending render request, execute it now
        if (this.pendingRender) {
          this.pendingRender = false;
          this.renderComponent();
        }
      }
    );
  }

  /**
   * Create callbacks for the React component
   */
  private createCallbacks(): ComponentCallbacks {
    return {
      RegisterMethod: (_methodName: string, _handler: any) => {
        // The component compiler wrapper will handle this internally
        // This is just a placeholder to satisfy the interface
        // The actual registration happens in the wrapper component
      },
      CreateSimpleNotification: (message: string, style: "none" | "success" | "error" | "warning" | "info", hideAfter?: number) => {
        // Use the MJ notification service to display the notification
        const notificationStyle = style as "none" | "success" | "error" | "warning" | "info" | undefined;
        this.notificationService.CreateSimpleNotification(
          message, 
          style, 
          hideAfter
        );
      },
      OpenEntityRecord: async (entityName: string, key: CompositeKey) => {
        let keyToUse: CompositeKey | null = null;
        if (key instanceof Array) {
          keyToUse = CompositeKey.FromKeyValuePairs(key);
        }
        else if (typeof key === 'object' && !!key.GetValueByFieldName) {
          keyToUse = key as CompositeKey;
        }
        else if (typeof key === 'object') {
          //} && !!key.FieldName && !!key.Value) {
          // possible that have an object that is a simple key/value pair with
          // FieldName and value properties
          const keyAny = key as any;
          if (keyAny.FieldName && keyAny.Value) {
            keyToUse = CompositeKey.FromKeyValuePairs([keyAny as KeyValuePair]);
          }
        }
        if (keyToUse) {
          // now in some cases we have key/value pairs that the component we are hosting
          // use, but are not the pkey, so if that is the case, we'll run a quick view to try
          // and get the pkey so that we can emit the openEntityRecord call with the pkey
          const md = this.ProviderToUse;
          const e = md.EntityByName(entityName);
          if (!e) {
            console.warn(`Entity not found: ${entityName}`);
            return;
          }
          let shouldRunView = false;
          // now check each key in the keyToUse to see if it is a pkey
          for (const singleKey of keyToUse.KeyValuePairs) {
            const field = e.Fields.find(f => f.Name.trim().toLowerCase() === singleKey.FieldName.trim().toLowerCase());
            if (!field) {
              // if we get here this is a problem, the component has given us a non-matching field, this shouldn't ever happen
              // but if it doesn't log warning to console and exit
              console.warn(`Non-matching field found for key: ${JSON.stringify(keyToUse)}`);
              return;
            }
            else if (!field.IsPrimaryKey) {
              // if we get here that means we have a non-pkey so we'll want to do a lookup via a RunView
              // to get the actual pkey value
              shouldRunView = true;
              break;
            }
          }

          // if we get here and shouldRunView is true, we need to run a view using the info provided
          // by our contained component to get the pkey
          if (shouldRunView) {
            const rv = RunView.FromMetadataProvider(this.ProviderToUse);
            const result = await rv.RunView({
              EntityName: entityName,
              ExtraFilter: keyToUse.ToWhereClause()
            })
            if (result && result.Success && result.Results.length > 0) {
              // we have a match, use the first row and update our keyToUse
              const kvPairs: KeyValuePair[] = [];
              e.PrimaryKeys.forEach(pk => {
                kvPairs.push(
                  {
                    FieldName: pk.Name,
                    Value: result.Results[0][pk.Name]
                  }
                )
              })
              keyToUse = CompositeKey.FromKeyValuePairs(kvPairs);
            }
          }

          this.openEntityRecord.emit({ entityName, key: keyToUse });
        }
      },
      NotifyEvent: async (eventName: string, args: BaseEventArgs) => {
        this.componentEvent.emit({ type: eventName, payload: args });
      }
    };
  }

  /**
   * Handle React component errors
   */
  private handleReactError(error: any, errorInfo?: any) {
    LogError(`React component error: ${error?.toString() || 'Unknown error'}`, errorInfo);
    this.componentEvent.emit({
      type: 'error',
      payload: {
        error: error?.toString() || 'Unknown error',
        errorInfo,
        source: 'react'
      }
    });
  }

  /**
   * Handle onSaveUserSettings from components
   * This implements the SavedUserSettings pattern
   */
  private handleSaveUserSettings(newSettings: Record<string, any>) {
    // Just bubble the event up to parent containers for persistence
    // We don't need to store anything here
    this.userSettingsChanged.emit({
      settings: newSettings,
      componentName: this.component?.name,
      timestamp: new Date()
    });
    
    // DO NOT re-render the component!
    // The component already has the correct state - it's the one that told us about the change.
    // Re-rendering would cause unnecessary DOM updates and visual flashing.
  }

  // =================================================================
  // Automatic Data Capture — intercept RunView/RunQuery for fallback
  // =================================================================

  /**
   * Wraps a ComponentUtilities object so that every RunView / RunViews / RunQuery
   * call transparently stores the result in `this.capturedData`. The wrapped
   * object is referentially distinct from the original and is safe to pass to
   * multiple renders (results accumulate until the component resets).
   */
  private wrapUtilitiesWithCapture(original: ComponentUtilities): ComponentUtilities {
    const self = this;
    const wrappedRv: SimpleRunView = {
      RunView: async (params: RunViewParams, contextUser?: unknown) => {
        const result = await original.rv.RunView(params, contextUser as undefined);
        if (result?.Success) {
          self.capturedData.push({
            sourceName: String(params.EntityName ?? params.ExtraFilter ?? 'Unknown'),
            sourceType: 'view',
            params: params as unknown as Record<string, unknown>,
            rows: result.Results ?? [],
            totalRows: result.TotalRowCount ?? result.Results?.length ?? 0,
            fetchedAt: new Date()
          });
        }
        return result;
      },
      RunViews: async (params: RunViewParams[], contextUser?: unknown) => {
        const results = await original.rv.RunViews(params, contextUser as undefined);
        results.forEach((result: RunViewResult, i: number) => {
          if (result?.Success) {
            self.capturedData.push({
              sourceName: String(params[i]?.EntityName ?? `View ${i}`),
              sourceType: 'view',
              params: params[i] as unknown as Record<string, unknown>,
              rows: result.Results ?? [],
              totalRows: result.TotalRowCount ?? result.Results?.length ?? 0,
              fetchedAt: new Date()
            });
          }
        });
        return results;
      }
    };

    const wrappedRq: SimpleRunQuery = {
      RunQuery: async (params: RunQueryParams, contextUser?: unknown) => {
        const result = await original.rq.RunQuery(params, contextUser as undefined);
        if (result?.Success) {
          self.capturedData.push({
            sourceName: String(params.QueryID ?? params.QueryName ?? 'Query'),
            sourceType: 'query',
            params: params as unknown as Record<string, unknown>,
            rows: (result.Results ?? []) as Record<string, unknown>[],
            totalRows: result.TotalRowCount ?? result.Results?.length ?? 0,
            fetchedAt: new Date()
          });
        }
        return result;
      }
    };

    return {
      ...original,
      rv: wrappedRv,
      rq: wrappedRq
    };
  }

  /**
   * Builds a DataSnapshot from captured RunView/RunQuery results.
   * Returns null if no data was captured.
   */
  private BuildCapturedDataSnapshot(): DataSnapshot | null {
    if (this.capturedData.length === 0) return null;

    const tables: DataTable[] = this.capturedData.map((captured, idx) => {
      const table = new DataTable();
      table.name = captured.sourceName || `Table ${idx + 1}`;
      table.source = captured.sourceType;
      table.rows = captured.rows;
      // Infer columns from the first row's keys
      if (captured.rows.length > 0) {
        const firstRow = captured.rows[0];
        table.columns = Object.keys(firstRow).map(key => {
          const col = new MJColumnDescriptor(key);
          col.displayName = key;
          const val = firstRow[key];
          if (typeof val === 'number') col.sqlBaseType = 'float';
          else if (val instanceof Date) col.sqlBaseType = 'datetime';
          else col.sqlBaseType = 'nvarchar';
          return col;
        });
      }
      table.metadata = {
        entityName: captured.sourceType === 'view' ? captured.sourceName : undefined,
        rowCount: captured.rows.length,
        totalAvailableRows: captured.totalRows,
        fetchedAt: captured.fetchedAt
      };
      return table;
    });

    return DataSnapshot.FromTables(tables, this.component?.title ?? this.component?.name);
  }

  /**
   * Clean up resources
   */
  private cleanup() {
    // Clean up all resources managed by resource manager
    resourceManager.cleanupComponent(this.componentId);
    
    // Clean up prop builder subscriptions
    if (this.currentCallbacks) {
      this.currentCallbacks = null;
    }
    
    // Unmount React root using managed unmount
    if (this.reactRootId) {
      // Force stop rendering flags
      this.isRendering = false;
      this.pendingRender = false;
      
      // This will handle waiting for render completion if needed
      reactRootManager.unmountRoot(this.reactRootId);
      this.reactRootId = null;
    }

    // Clear references
    this.compiledComponent = null;
    this.isInitialized = false;
    this.capturedData = [];

    // Trigger registry cleanup
    this.adapter.getRegistry().cleanup();
  }

  /**
   * Public method to refresh the component
   * @deprecated Components manage their own state and data now
   */
  refresh() {
    // Check if the component has registered a refresh method
    if (this.compiledComponent?.refresh) {
      this.compiledComponent.refresh();
    } else {
      // Fallback: trigger a re-render if needed
      this.renderComponent();
    }
  }

  /**
   * Public method to update state programmatically
   * @param path - State path to update
   * @param value - New value
   * @deprecated Components manage their own state now
   */
  updateState(path: string, value: any) {
    // Just emit the event, don't manage state here
    this.stateChange.emit({ path, value });
  }

  // =================================================================
  // Standard Component Methods - Strongly Typed
  // =================================================================
  
  /**
   * Gets the current data state of the component.
   * Tries the component's explicit implementation first, then falls back
   * to a DataSnapshot built from intercepted RunView/RunQuery results.
   */
  getCurrentDataState(): DataSnapshot | undefined {
    const explicit = this.compiledComponent?.getCurrentDataState?.();
    if (explicit && typeof explicit === 'object') return explicit;
    return this.BuildCapturedDataSnapshot() ?? undefined;
  }
  
  /**
   * Validates the current state of the component
   * @returns true if valid, false or validation errors otherwise
   */
  validate(): boolean | { valid: boolean; errors?: string[] } {
    return this.compiledComponent?.validate?.() || true;
  }
  
  /**
   * Checks if the component has unsaved changes
   * @returns true if dirty, false otherwise
   */
  isDirty(): boolean {
    return this.compiledComponent?.isDirty?.() || false;
  }
  
  /**
   * Resets the component to its initial state
   */
  reset(): void {
    this.compiledComponent?.reset?.();
  }
  
  /**
   * Scrolls to a specific element or position within the component
   * @param target - Element selector, element reference, or scroll options
   */
  scrollTo(target: string | HTMLElement | { top?: number; left?: number }): void {
    this.compiledComponent?.scrollTo?.(target);
  }
  
  /**
   * Sets focus to a specific element within the component
   * @param target - Element selector or element reference
   */
  focus(target?: string | HTMLElement): void {
    this.compiledComponent?.focus?.(target);
  }
  
  /**
   * Invokes a custom method on the component
   * @param methodName - Name of the method to invoke
   * @param args - Arguments to pass to the method
   * @returns The result of the method call, or undefined if method doesn't exist
   */
  invokeMethod(methodName: string, ...args: any[]): any {
    return this.compiledComponent?.invokeMethod?.(methodName, ...args);
  }
  
  /**
   * Checks if a method is available on the component
   * @param methodName - Name of the method to check
   * @returns true if the method exists
   */
  hasMethod(methodName: string): boolean {
    return this.compiledComponent?.hasMethod?.(methodName) || false;
  }
  
  /**
   * Print the component content
   * Uses component's print method if available, otherwise uses window.print()
   */
  print(): void {
    if (this.compiledComponent?.print) {
      this.compiledComponent.print();
    } else if (typeof window !== 'undefined' && window.print) {
      window.print();
    }
  }

  /**
   * Force clear component registries
   * Used by Component Studio for fresh loads
   * This is a static method that can be called without a component instance
   */
  public static forceClearRegistries(): void {
    // Clear React runtime's component registry service
    ComponentRegistryService.reset();

    // Clear any cached hierarchy registrar
    if (typeof window !== 'undefined' && (window as any).__MJ_COMPONENT_HIERARCHY_REGISTRAR__) {
      (window as any).__MJ_COMPONENT_HIERARCHY_REGISTRAR__ = null;
    }

    console.log('🧹 All component registries cleared for fresh load');
  }

  /**
   * Gets the current data state from the hosted React component.
   * Falls back to a DataSnapshot built from intercepted RunView/RunQuery results
   * when the component does not explicitly implement getCurrentDataState.
   */
  public GetCurrentDataState(): DataSnapshot | undefined {
    return this.getCurrentDataState();
  }

  /**
   * Applies a data state snapshot to the hosted React component.
   * Returns true if the snapshot was successfully applied, false if the
   * component does not support setDataState or the operation failed.
   */
  public SetDataState(snapshot: DataSnapshot): boolean {
    return this.compiledComponent?.setDataState?.(snapshot) ?? false;
  }

}