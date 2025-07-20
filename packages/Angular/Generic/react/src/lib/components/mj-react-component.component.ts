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
import { ComponentRootSpec, ComponentCallbacks, ComponentStyles } from '@memberjunction/interactive-component-types';
import { ReactBridgeService } from '../services/react-bridge.service';
import { AngularAdapterService } from '../services/angular-adapter.service';
import { 
  buildComponentProps,
  cleanupPropBuilder,
  ComponentError,
  createErrorBoundary,
  ComponentHierarchyRegistrar,
  HierarchyRegistrationResult
} from '@memberjunction/react-runtime';
import { LogError, CompositeKey, KeyValuePair } from '@memberjunction/core';

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
  @Input() component!: ComponentRootSpec;
  
  private _data: any = {};
  @Input() 
  set data(value: any) {
    const oldData = this._data;
    this._data = value;
    
    // Only re-render if data actually changed and component is initialized
    if (this.isInitialized && !this.isEqual(oldData, value)) {
      this.renderComponent();
    }
  }
  get data(): any {
    return this._data;
  }
  
  private _state: any = {};
  @Input() 
  set state(value: any) {
    const oldState = this._state;
    this._state = value;
    
    // Only update state and re-render if it actually changed
    if (this.isInitialized && !this.isEqual(oldState, value)) {
      this.currentState = { ...value };
      this.renderComponent();
    }
  }
  get state(): any {
    return this._state;
  }
  
  @Input() utilities: any = {};
  @Input() styles?: Partial<ComponentStyles>;
  
  @Output() stateChange = new EventEmitter<StateChangeEvent>();
  @Output() componentEvent = new EventEmitter<ReactComponentEvent>();
  @Output() refreshData = new EventEmitter<void>();
  @Output() openEntityRecord = new EventEmitter<{ entityName: string; key: CompositeKey }>();
  
  @ViewChild('container', { read: ElementRef, static: true }) container!: ElementRef<HTMLDivElement>;
  
  private reactRoot: any = null;
  private compiledComponent: any = null;
  private destroyed$ = new Subject<void>();
  private currentCallbacks: ComponentCallbacks | null = null;
  private currentState: any = {};
  isInitialized = false;
  private isRendering = false;
  private pendingRender = false;
  private isDestroying = false;
  private renderTimeout: any = null;
  hasError = false;

  constructor(
    private reactBridge: ReactBridgeService,
    private adapter: AngularAdapterService,
    private cdr: ChangeDetectorRef
  ) {}

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
      
      // Compile main component
      const result = await this.adapter.compileComponent({
        componentName: this.component.componentName,
        componentCode: this.component.componentCode,
        styles: this.styles
      });

      if (!result.success) {
        throw new Error(result.error?.message || 'Component compilation failed');
      }

      // Get runtime context and execute component factory
      const context = this.adapter.getRuntimeContext();
      this.compiledComponent = result.component!.component(context, this.styles);
      this.currentState = { ...this._state };
      
      // Create React root
      this.reactRoot = this.reactBridge.createRoot(this.container.nativeElement);
      
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
   * Register all components in the hierarchy
   */
  private async registerComponentHierarchy() {
    // Create the hierarchy registrar with adapter's compiler and registry
    const registrar = new ComponentHierarchyRegistrar(
      this.adapter.getCompiler(),
      this.adapter.getRegistry(),
      this.adapter.getRuntimeContext()
    );
    
    // Register the entire hierarchy
    const result: HierarchyRegistrationResult = await registrar.registerHierarchy(
      this.component,
      {
        styles: this.styles as any, // Skip components use SkipComponentStyles which is a superset
        namespace: 'Global',
        version: 'v1'
      }
    );
    
    // Check for errors
    if (!result.success) {
      const errorMessages = result.errors.map(e => 
        `${e.componentName}: ${e.error}`
      );
      throw new Error(`Component registration failed: ${errorMessages.join(', ')}`);
    }
  }

  /**
   * Render the React component
   */
  private renderComponent() {
    // Don't render if component is being destroyed
    if (this.isDestroying) {
      return;
    }
    
    if (!this.compiledComponent || !this.reactRoot) {
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
    
    // Get components from resolver
    const components = this.adapter.getResolver().resolveComponents(this.component);
    
    // Create callbacks once per component instance
    if (!this.currentCallbacks) {
      this.currentCallbacks = this.createCallbacks();
    }
    
    // Build props - pass styles as-is for Skip components
    const props = buildComponentProps(
      this._data || {},
      this.currentState,
      this.utilities || {},
      this.currentCallbacks,
      components,
      this.styles as any, // Skip components expect the full SkipComponentStyles structure
      { debounceUpdateUserState: 3000 } // 3 second debounce by default
    );

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

    // Clear any existing render timeout
    if (this.renderTimeout) {
      clearTimeout(this.renderTimeout);
    }
    
    // Render with timeout protection
    this.renderTimeout = setTimeout(() => {
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
    }, 5000);

    try {
      this.reactRoot.render(element);
      clearTimeout(this.renderTimeout);
      this.renderTimeout = null;
      
      // Reset rendering flag after a microtask to allow React to complete
      Promise.resolve().then(() => {
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
      });
    } catch (error) {
      clearTimeout(this.renderTimeout);
      this.renderTimeout = null;
      this.isRendering = false;
      this.handleReactError(error);
    }
  }

  /**
   * Create callbacks for the React component
   */
  private createCallbacks(): ComponentCallbacks {
    return {
      RefreshData: () => {
        this.refreshData.emit();
      },
      OpenEntityRecord: (entityName: string, key: CompositeKey) => {
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
          this.openEntityRecord.emit({ entityName, key: keyToUse });
        }  
      },
      UpdateUserState: (userState: any) => {
        // Prevent updates during rendering or destruction
        if (this.isRendering || this.isDestroying) {
          return;
        }
        
        // Deep comparison to detect actual changes
        const hasChanges = Object.keys(userState).some(key => {
          const currentValue = this.currentState[key];
          const newValue = userState[key];
          return !this.isEqual(currentValue, newValue);
        });
        
        if (!hasChanges) {
          // No actual changes, skip update to prevent infinite loop
          return;
        }
        
        this.currentState = {
          ...this.currentState,
          ...userState
        };
        
        // Emit change for each key in the state update
        Object.keys(userState).forEach(path => {
          this.stateChange.emit({ path, value: userState[path] });
        });
        
        // Schedule re-render
        this.renderComponent();
      },
      NotifyEvent: (event: string, data: any) => {
        this.componentEvent.emit({ type: event, payload: data });
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
   * Clean up resources
   */
  private cleanup() {
    // Clear any pending render timeout
    if (this.renderTimeout) {
      clearTimeout(this.renderTimeout);
      this.renderTimeout = null;
    }
    
    // Clean up prop builder subscriptions
    if (this.currentCallbacks) {
      cleanupPropBuilder(this.currentCallbacks);
      this.currentCallbacks = null;
    }
    
    // Unmount React root only if not currently rendering
    if (this.reactRoot) {
      // If still rendering, wait for completion before unmounting
      if (this.isRendering) {
        // Force stop rendering
        this.isRendering = false;
        this.pendingRender = false;
      }
      
      this.reactBridge.unmountRoot(this.reactRoot);
      this.reactRoot = null;
    }

    // Clear references
    this.compiledComponent = null;
    this.currentState = {};
    this.isInitialized = false;

    // Trigger registry cleanup
    this.adapter.getRegistry().cleanup();
  }

  /**
   * Public method to refresh the component
   * @param newData - Optional new data to merge
   */
  refresh(newData?: any) {
    if (newData) {
      // Use the setter to trigger change detection
      this.data = { ...this._data, ...newData };
    } else {
      this.renderComponent();
    }
  }

  /**
   * Public method to update state programmatically
   * @param path - State path to update
   * @param value - New value
   */
  updateState(path: string, value: any) {
    this.currentState = {
      ...this.currentState,
      [path]: value
    };
    this.stateChange.emit({ path, value });
    this.renderComponent();
  }

  /**
   * Deep equality check that handles null/undefined properly
   */
  private isEqual(a: any, b: any): boolean {
    // Handle null/undefined cases
    if (a === b) return true;
    if (a == null || b == null) return false;
    
    // For objects/arrays, use JSON comparison
    if (typeof a === 'object' && typeof b === 'object') {
      return JSON.stringify(a) === JSON.stringify(b);
    }
    
    return a === b;
  }
}