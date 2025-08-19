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
import { Subject, takeUntil } from 'rxjs';
import { ComponentSpec, ComponentCallbacks, ComponentStyles } from '@memberjunction/interactive-component-types';
import { ReactBridgeService } from '../services/react-bridge.service';
import { AngularAdapterService } from '../services/angular-adapter.service';
import { 
  buildComponentProps,
  createErrorBoundary,
  ComponentHierarchyRegistrar,
  HierarchyRegistrationResult,
  resourceManager,
  reactRootManager,
  ResolvedComponents,
  SetupStyles
} from '@memberjunction/react-runtime';
import { createRuntimeUtilities } from '../utilities/runtime-utilities';
import { LogError, CompositeKey, KeyValuePair, Metadata, RunView } from '@memberjunction/core';
import { ComponentMetadataEngine } from '@memberjunction/core-entities';

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
export class MJReactComponent implements AfterViewInit, OnDestroy {
  @Input() component!: ComponentSpec;
  
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
      this._utilities = runtimeUtils.buildUtilities();
      console.log('MJReactComponent: Auto-initialized utilities using createRuntimeUtilities()');
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
      console.log('MJReactComponent: Auto-initialized styles using SetupStyles()');
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
  
  @ViewChild('container', { read: ElementRef, static: true }) container!: ElementRef<HTMLDivElement>;
  
  private reactRootId: string | null = null;
  private compiledComponent: any = null;
  private destroyed$ = new Subject<void>();
  private currentCallbacks: ComponentCallbacks | null = null;
  isInitialized = false;
  private isRendering = false;
  private pendingRender = false;
  private isDestroying = false;
  private componentId: string;
  private componentVersion: string = '';  // Store the version for resolver
  hasError = false;

  constructor(
    private reactBridge: ReactBridgeService,
    private adapter: AngularAdapterService,
    private cdr: ChangeDetectorRef
  ) {
    // Generate unique component ID for resource tracking
    this.componentId = `mj-react-component-${Date.now()}-${Math.random()}`;
  }

  async ngAfterViewInit() {
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
   * Initialize the React component
   */
  private async initializeComponent() {
    try {
      // Ensure React is loaded
      await this.reactBridge.getReactContext();
      
      // Wait for React to be fully ready (handles first-load delay)
      await this.reactBridge.waitForReactReady();
      
      // Register component hierarchy
      await this.registerComponentHierarchy();
      
      // Compile main component with its library dependencies
      await ComponentMetadataEngine.Instance.Config(false, Metadata.Provider.CurrentUser);
      const result = await this.adapter.compileComponent({
        componentName: this.component.name,
        componentCode: this.component.code,
        styles: this.styles as ComponentStyles,
        libraries: this.component.libraries, // Pass library dependencies from ComponentSpec
        allLibraries: ComponentMetadataEngine.Instance.ComponentLibraries
      });

      if (!result.success) {
        throw new Error(result.error?.message || 'Component compilation failed');
      }

      // Get runtime context and execute component factory
      const context = this.adapter.getRuntimeContext();
      
      // Call the factory function to get the component wrapper
      // result.component is a CompiledComponent object with a 'component' property that's the factory
      const componentWrapper = result.component!.component(context, this.styles);
      
      // Validate the component wrapper structure
      if (!componentWrapper || typeof componentWrapper !== 'object') {
        throw new Error(`Invalid component wrapper returned for ${this.component.name}: ${typeof componentWrapper}`);
      }
      
      if (!componentWrapper.component) {
        throw new Error(`Component wrapper missing 'component' property for ${this.component.name}`);
      }
      
      if (typeof componentWrapper.component !== 'function') {
        throw new Error(`Component is not a function for ${this.component.name}: ${typeof componentWrapper.component}`);
      }
      
      this.compiledComponent = componentWrapper;
      
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
   * Resolve components with specific version
   */
  private resolveComponentsWithVersion(spec: ComponentSpec, version: string, namespace: string = 'Global'): ResolvedComponents {
    const resolved: ResolvedComponents = {};
    const registry = this.adapter.getRegistry();
    
    const resolveHierarchy = (s: ComponentSpec, visited: Set<string> = new Set()) => {
      // Prevent circular dependencies
      if (visited.has(s.name)) {
        console.warn(`Circular dependency detected for component: ${s.name}`);
        return;
      }
      visited.add(s.name);
      
      // Get component with specific version
      const component = registry.get(s.name, namespace, version);
      if (component) {
        resolved[s.name] = component;
        console.log(`  Resolved ${s.name}@${version}`);
      } else {
        console.warn(`  ⚠️ Component not found: ${s.name}@${version}`);
      }
      
      // Process dependencies
      if (s.dependencies) {
        for (const dep of s.dependencies) {
          resolveHierarchy(dep, visited);
        }
      }
    };
    
    console.log(`Resolving components with version ${version}:`);
    resolveHierarchy(spec);
    
    return resolved;
  }

  /**
   * Log existing versions of components in registry (for debugging)
   */
  private logExistingVersions(spec: ComponentSpec, namespace: string = 'Global'): void {
    const registry = this.adapter.getRegistry();
    
    // Check for existing versions of this component
    const namespaceComponents = registry.getNamespace(namespace);
    const componentVersions = namespaceComponents.filter(c => c.name === spec.name);
    
    // Log existing versions for awareness
    if (componentVersions.length > 0) {
      console.log(`  Found ${componentVersions.length} existing version(s) of ${spec.name}:`);
      componentVersions.forEach(comp => {
        console.log(`    - ${comp.name}@${comp.version}`);
      });
    }
    
    // Recursively check dependencies
    if (spec.dependencies) {
      for (const dep of spec.dependencies) {
        const depVersions = namespaceComponents.filter(c => c.name === dep.name);
        if (depVersions.length > 0) {
          console.log(`  Found ${depVersions.length} existing version(s) of ${dep.name}:`);
          depVersions.forEach(comp => {
            console.log(`    - ${comp.name}@${comp.version}`);
          });
        }
      }
    }
  }

  /**
   * Register all components in the hierarchy
   */
  private async registerComponentHierarchy() {
    // Generate unique version based on component code hash
    const version = this.generateComponentHash(this.component);
    this.componentVersion = version;  // Store for use in resolver
    
    console.log(`\n🔄 Registering component hierarchy for ${this.component.name}`);
    console.log(`  Version: ${version}`);
    
    // Log existing versions (don't clear - allow multiple versions to coexist)
    this.logExistingVersions(this.component);
    
    // Check if this exact version already exists to avoid re-registration
    const registry = this.adapter.getRegistry();
    const existingComponent = registry.get(this.component.name, 'Global', version);
    if (existingComponent) {
      console.log(`  ℹ️ Version ${version} already registered - skipping registration`);
      return;
    }
    
    // Create the hierarchy registrar with adapter's compiler and registry
    const registrar = new ComponentHierarchyRegistrar(
      this.adapter.getCompiler(),
      this.adapter.getRegistry(),
      this.adapter.getRuntimeContext()
    );
    
    await ComponentMetadataEngine.Instance.Config(false, Metadata.Provider.CurrentUser);
    // Register the entire hierarchy with hash-based version
    const result: HierarchyRegistrationResult = await registrar.registerHierarchy(
      this.component,
      {
        styles: this.styles as any, // Skip components use SkipComponentStyles which is a superset
        namespace: 'Global',
        version: version,  // Use hash-based version instead of hardcoded 'v1'
        allowOverride: false,  // Don't override - each version is unique
        allLibraries: ComponentMetadataEngine.Instance.ComponentLibraries
      }
    );
    
    // Check for errors
    if (!result.success) {
      const errorMessages = result.errors.map(e => 
        `${e.componentName}: ${e.error}`
      );
      throw new Error(`Component registration failed: ${errorMessages.join(', ')}`);
    }
    
    // Log registered components for debugging
    console.log(`✅ Successfully registered ${result.registeredComponents.length} components with version ${version}:`);
    result.registeredComponents.forEach(name => {
      console.log(`    - ${name}@${version}`);
    });
    
    // Also log current registry stats
    const stats = this.adapter.getRegistry().getStats();
    console.log(`📊 Registry stats: ${stats.totalComponents} total components in ${stats.namespaces} namespace(s)\n`);
  }

  /**
   * Render the React component
   */
  private renderComponent() {
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
    
    // Manually resolve components with the correct version
    const components = this.resolveComponentsWithVersion(this.component, this.componentVersion);
    
    // Create callbacks once per component instance
    if (!this.currentCallbacks) {
      this.currentCallbacks = this.createCallbacks();
    }
    
    // Build props with savedUserSettings pattern
    const props = {
      utilities: this.utilities, // Now uses getter which auto-initializes if needed
      callbacks: this.currentCallbacks,
      components,
      styles: this.styles as any,
      savedUserSettings: this._savedUserSettings,
      onSaveUserSettings: this.handleSaveUserSettings.bind(this)
    };

    // Validate component before creating element
    if (!this.compiledComponent.component) {
      LogError(`Component is undefined for ${this.component.name} during render`);
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
          const md = new Metadata();
          const e = md.EntityByName(entityName);
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
            const rv = new RunView();
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

    // Trigger registry cleanup
    this.adapter.getRegistry().cleanup();
  }

  /**
   * Public method to refresh the component
   * @deprecated Components manage their own state and data now
   */
  refresh() {
    // Just trigger a re-render if needed
    this.renderComponent();
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

}