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
import { ComponentSpec, ComponentCallbacks, ComponentStyles, ComponentObject } from '@memberjunction/interactive-component-types';
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
  /**
   * Controls verbose logging for component lifecycle and operations.
   * Note: This does NOT control which React build (dev/prod) is loaded.
   * To control React builds, use ReactDebugConfig.setDebugMode() at app startup.
   */
  @Input() enableLogging: boolean = false;
  
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
  
  @ViewChild('container', { read: ElementRef, static: true }) container!: ElementRef<HTMLDivElement>;
  
  private reactRootId: string | null = null;
  private compiledComponent: ComponentObject | null = null;
  private destroyed$ = new Subject<void>();
  private currentCallbacks: ComponentCallbacks | null = null;
  isInitialized = false;
  private isRendering = false;
  private pendingRender = false;
  private isDestroying = false;
  private componentId: string;
  private componentVersion: string = '';  // Store the version for resolver
  private resolvedComponents: ResolvedComponents = {};  // Store resolved components from initialization
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
      
      // Initialize metadata engine once
      await ComponentMetadataEngine.Instance.Config(false, Metadata.Provider.CurrentUser);
      
      // Set version for consistency
      this.componentVersion = this.component.version || this.generateComponentHash(this.component);
      
      // Use resolver for EVERYTHING - it handles local/external, compilation, caching
      const resolver = this.adapter.getResolver();
      const resolved = await resolver.resolveComponents(
        this.component,
        this.component.namespace || 'Global',
        Metadata.Provider.CurrentUser
      );
      
      // Store all resolved components for use in rendering
      this.resolvedComponents = resolved;
      
      // Get the root component from resolved components
      const componentWrapper = resolved[this.component.name];
      
      if (!componentWrapper) {
        const source = this.component.registry ? `external registry ${this.component.registry}` : 'local registry';
        throw new Error(`Component ${this.component.name} was not resolved from ${source}`);
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
      Metadata.Provider.CurrentUser // Pass current user context for database operations
    );
    
    if (this.enableLogging) {
      console.log(`Resolved ${Object.keys(resolved).length} components for version ${version}:`, Object.keys(resolved));
    }
    return resolved;
  }


  /**
   * Register all components in the hierarchy
   */
  private async registerComponentHierarchy() {
    // Use semantic version from spec or generate hash-based version for uniqueness
    const version = this.component.version || this.generateComponentHash(this.component);
    this.componentVersion = version;  // Store for use in resolver
    
    if (this.enableLogging) {
      console.log(`Registering ${this.component.name}@${version}`);
    }
    
    // Check if already registered to avoid duplication
    const registry = this.adapter.getRegistry();
    const existingComponent = registry.get(this.component.name, this.component.namespace || 'Global', version);
    if (existingComponent) {
      if (this.enableLogging) {
        console.log(`Component ${this.component.name}@${version} already registered`);
      }
      return;
    }
    
    // Initialize metadata engine
    await ComponentMetadataEngine.Instance.Config(false, Metadata.Provider.CurrentUser);
    
    // Use the runtime's hierarchy registrar
    const registrar = new ComponentHierarchyRegistrar(
      this.adapter.getCompiler(),
      this.adapter.getRegistry(),
      this.adapter.getRuntimeContext()
    );
    
    // Register with proper configuration
    const result = await registrar.registerHierarchy(
      this.component,
      {
        styles: this.styles as ComponentStyles,
        namespace: this.component.namespace || 'Global',
        version: version,
        allowOverride: false,  // Each version is unique
        allLibraries: ComponentMetadataEngine.Instance.ComponentLibraries,
        debug: true
      }
    );
    
    if (!result.success) {
      const errors = result.errors.map(e => e.error).join(', ');
      throw new Error(`Component registration failed: ${errors}`);
    }
    
    if (this.enableLogging) {
      console.log(`Registered ${result.registeredComponents.length} components`);
    }
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
    const components = await this.resolveComponentsWithVersion(this.component, this.componentVersion);
    
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
   * Gets the current data state of the component
   * Used by AI agents to understand what data is currently displayed
   * @returns The current data state, or undefined if not implemented
   */
  getCurrentDataState(): any {
    return this.compiledComponent?.getCurrentDataState?.();
  }
  
  /**
   * Gets the history of data state changes in the component
   * @returns Array of timestamped state snapshots, or empty array if not implemented
   */
  getDataStateHistory(): Array<{ timestamp: Date; state: any }> {
    return this.compiledComponent?.getDataStateHistory?.() || [];
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

}