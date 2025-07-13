import {
  Component,
  Input,
  Output,
  EventEmitter,
  ViewChild,
  ElementRef,
  OnInit,
  OnDestroy,
  ChangeDetectionStrategy,
  ChangeDetectorRef
} from '@angular/core';
import { Subject, takeUntil } from 'rxjs';
import { SkipComponentRootSpec, SkipComponentCallbacks, SkipComponentStyles } from '@memberjunction/skip-types';
import { ReactBridgeService } from '../services/react-bridge.service';
import { ComponentCompilerService } from '../services/component-compiler.service';
import { ComponentRegistryService } from '../services/component-registry.service';
import { LogError, CompositeKey } from '@memberjunction/core';

export interface ReactComponentEvent {
  type: string;
  payload: any;
}

export interface StateChangeEvent {
  path: string;
  value: any;
}

/**
 * Angular component that hosts React components with proper memory management
 */
@Component({
  selector: 'mj-react-component',
  template: '<div #container class="react-component-container"></div>',
  styles: [`
    :host {
      display: block;
      width: 100%;
      height: 100%;
    }
    .react-component-container {
      width: 100%;
      height: 100%;
    }
  `],
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class ReactComponentComponent implements OnInit, OnDestroy {
  @Input() component!: SkipComponentRootSpec;
  
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
  @Input() styles?: Partial<SkipComponentStyles>;
  
  @Output() stateChange = new EventEmitter<StateChangeEvent>();
  @Output() componentEvent = new EventEmitter<ReactComponentEvent>();
  @Output() refreshData = new EventEmitter<void>();
  @Output() openEntityRecord = new EventEmitter<{ entityName: string; recordId: string }>();
  
  @ViewChild('container', { read: ElementRef, static: true }) container!: ElementRef<HTMLDivElement>;
  
  private reactRoot: any = null;
  private compiledComponent: any = null;
  private destroyed$ = new Subject<void>();
  private currentState: any = {};
  private isInitialized = false;
  private isRendering = false;
  private pendingRender = false;

  constructor(
    private reactBridge: ReactBridgeService,
    private compiler: ComponentCompilerService,
    private registry: ComponentRegistryService,
    private cdr: ChangeDetectorRef
  ) {}

  async ngOnInit() {
    await this.initializeComponent();
  }

  // Removed ngOnChanges - using setters instead

  ngOnDestroy() {
    this.destroyed$.next();
    this.destroyed$.complete();
    this.cleanup();
  }

  private async initializeComponent() {
    try {
      // Ensure React is loaded
      await this.reactBridge.getReactContext();
      
      // Register component hierarchy
      await this.registerComponentHierarchy();
      
      // Compile main component
      const compiled = await this.compiler.compileComponent(
        this.component.componentName,
        this.component.componentCode,
        this.styles
      );
      this.compiledComponent = compiled.component;
      this.currentState = { ...this._state };
      
      // Create React root
      this.reactRoot = this.reactBridge.createRoot(this.container.nativeElement);
      
      // Initial render
      this.renderComponent();
      this.isInitialized = true;
      
      // Trigger change detection since we're using OnPush
      this.cdr.detectChanges();
      
    } catch (error) {
      LogError(`Failed to initialize React component: ${error}`);
      this.componentEvent.emit({
        type: 'error',
        payload: {
          error: error instanceof Error ? error.message : String(error),
          source: 'initialization'
        }
      });
    }
  }

  private async registerComponentHierarchy() {
    const errors: string[] = [];
    
    // Register main component
    try {
      const compiled = await this.compiler.compileComponent(
        this.component.componentName,
        this.component.componentCode,
        this.styles
      );
      
      this.registry.register(
        this.component.componentName,
        compiled.component,
        'Global',
        'v1'
      );
    } catch (error) {
      errors.push(`Failed to register ${this.component.componentName}: ${error}`);
    }
    
    // Register child components
    if (this.component.childComponents?.length) {
      await this.registerChildComponents(this.component.childComponents, errors);
    }
    
    if (errors.length > 0) {
      throw new Error(`Component registration failed: ${errors.join(', ')}`);
    }
  }

  private async registerChildComponents(children: any[], errors: string[]) {
    for (const child of children) {
      try {
        if (child.componentCode) {
          const compiled = await this.compiler.compileComponent(
            child.componentName,
            child.componentCode,
            this.styles
          );
          
          this.registry.register(
            child.componentName,
            compiled.component,
            'Global',
            'v1'
          );
        }
        
        // Register nested children
        if (child.components?.length) {
          await this.registerChildComponents(child.components, errors);
        }
      } catch (error) {
        errors.push(`Failed to register ${child.componentName}: ${error}`);
      }
    }
  }

  private renderComponent() {
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
    
    // Create props
    const props = {
      data: this._data || {},
      userState: this.currentState,
      utilities: this.utilities || {},
      callbacks: this.createCallbacks(),
      components: this.registry.getComponentsForSpec(this.component),
      styles: this.styles || {}
    };

    // Wrap in error boundary
    const ErrorBoundary = this.createErrorBoundary(React);
    const element = React.createElement(
      ErrorBoundary,
      { onError: this.handleReactError.bind(this) },
      React.createElement(this.compiledComponent, props)
    );

    // Render with timeout protection
    const renderTimeout = setTimeout(() => {
      this.componentEvent.emit({
        type: 'error',
        payload: {
          error: 'Component render timeout - possible infinite loop detected',
          source: 'render'
        }
      });
    }, 5000);

    try {
      this.reactRoot.render(element);
      clearTimeout(renderTimeout);
      
      // Reset rendering flag after a microtask to allow React to complete
      Promise.resolve().then(() => {
        this.isRendering = false;
        
        // If there was a pending render request, execute it now
        if (this.pendingRender) {
          this.pendingRender = false;
          this.renderComponent();
        }
      });
    } catch (error) {
      clearTimeout(renderTimeout);
      this.isRendering = false;
      this.handleReactError(error);
    }
  }

  private createCallbacks(): SkipComponentCallbacks {
    return {
      RefreshData: () => {
        this.refreshData.emit();
      },
      OpenEntityRecord: (entityName: string, key: CompositeKey) => {
        // Convert CompositeKey to a simple recordId for the event
        // Try to get the ID field first, otherwise get the first value
        const recordId = key.GetValueByFieldName('ID')?.toString() || 
                        key.GetValueByIndex(0)?.toString() || 
                        '';
        this.openEntityRecord.emit({ entityName, recordId });
      },
      UpdateUserState: (userState: any) => {
        // Prevent updates during rendering
        if (this.isRendering) {
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

  private createErrorBoundary(React: any) {
    const component = this;
    
    class ErrorBoundary extends React.Component {
      constructor(props: any) {
        super(props);
        this.state = { hasError: false };
      }

      static getDerivedStateFromError() {
        return { hasError: true };
      }

      componentDidCatch(error: any, errorInfo: any) {
        component.handleReactError(error, errorInfo);
      }

      render() {
        if ((this.state as any).hasError) {
          return null; // Let Angular handle error display
        }
        return (this.props as any).children;
      }
    }

    return ErrorBoundary;
  }

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

  private cleanup() {
    // Unmount React root
    if (this.reactRoot) {
      this.reactBridge.unmountRoot(this.reactRoot);
      this.reactRoot = null;
    }

    // Clear references
    this.compiledComponent = null;
    this.currentState = {};
    this.isInitialized = false;

    // Trigger registry cleanup
    this.registry.cleanupUnused();
  }

  /**
   * Public method to refresh the component
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