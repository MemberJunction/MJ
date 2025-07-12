# Skip Report Component Composition Architecture

## Overview

This document outlines our approach to component composition in Skip Reports, enabling reusable, testable child components without physical code injection.

## Problem Statement

Previously, we physically injected child component code into parent components, which created several issues:
- Child components couldn't be reused across multiple parents
- Testing individual child components was difficult
- Code bloat from duplicated child components
- Tight coupling between parent and child components

## Solution: Component Registry with Plain Object Access

We've implemented a clean architecture that separates component definition from component usage, using a global registry with filtered access per generated component.

## Architecture Components

### 1. Global Component Registry (Angular Injectable Service)

```typescript
@Injectable({ providedIn: 'root' })
export class GlobalComponentRegistry {
  private components = new Map<string, any>();
  
  register(key: string, component: any) {
    this.components.set(key, component);
  }
  
  get(key: string) {
    return this.components.get(key);
  }
  
  // Register with metadata keys for versioning/context
  registerWithMetadata(name: string, context: string, version: string, component: any) {
    const key = `${name}_${context}_${version}`;
    this.register(key, component);
  }
}
```

### 2. Component Metadata

Each generated component includes metadata specifying its child component requirements:

```typescript
interface ComponentMetadata {
  requiredChildComponents: string[];
  componentContext: string;
  version: string;
}

// Example metadata
{
  requiredChildComponents: ['SearchBox', 'OrderList', 'DatePicker'],
  componentContext: 'CRM',
  version: 'v1'
}
```

### 3. Angular Host Component

The Angular host creates a plain JavaScript object containing only the components needed by the generated component:

```typescript
export class ReactComponentHostComponent {
  constructor(private globalRegistry: GlobalComponentRegistry) {}
  
  private createComponentsObject(metadata: ComponentMetadata): any {
    const components: any = {};
    
    for (const componentName of metadata.requiredChildComponents) {
      // Resolve to specific component version/context
      const componentKey = this.resolveComponentKey(componentName, metadata);
      components[componentName] = this.globalRegistry.get(componentKey);
    }
    
    return components;
  }
  
  private resolveComponentKey(componentName: string, metadata: ComponentMetadata): string {
    // Logic to determine the correct component variant
    // Could be: SearchBox_CRM_v1, SearchBox_Finance_v1, etc.
    return `${componentName}_${metadata.componentContext}_${metadata.version}`;
  }
  
  private renderReactComponent() {
    const components = this.createComponentsObject(this.config.metadata);
    
    this.reactRoot.render(React.createElement(this.reportObject.component, {
      data: this.data,
      utilities: this.utilities,
      userState: this.userState,
      callbacks: this.createCallbacks(),
      styles: this.styles,
      components: components  // Plain JS object with required components
    }));
  }
}
```

## Generated Component Usage

Generated components receive child components as a plain JavaScript object and access them via simple destructuring:

```javascript
function OrderAnalysisReport({ data, utilities, userState, callbacks, styles, components }) {
  const [fullUserState, setFullUserState] = useState(userState || {});
  
  // Simple destructuring - no registry complexity
  const { SearchBox, OrderList, CategoryChart } = components;
  
  const updateUserState = (stateUpdate) => {
    const newState = { ...fullUserState, ...stateUpdate };
    setFullUserState(newState);
    if (callbacks?.UpdateUserState) {
      callbacks.UpdateUserState(newState);
    }
  };
  
  const handleComponentEvent = createStandardEventHandler(updateUserState, callbacks);
  
  return (
    <div style={{ padding: styles.spacing.lg }}>
      <h1>Order Analysis</h1>
      
      <SearchBox
        data={data?.searchData || []}
        config={{ placeholder: "Search orders..." }}
        state={fullUserState.search || {}}
        onEvent={handleComponentEvent}
        styles={styles}
        statePath="search"
      />
      
      <OrderList
        data={data?.orders || []}
        config={{ pageSize: 10, sortable: true }}
        state={fullUserState.orderList || {}}
        onEvent={handleComponentEvent}
        styles={styles}
        statePath="orderList"
      />
      
      <CategoryChart
        data={data?.categories || []}
        config={{ showLegend: true }}
        state={fullUserState.chart || {}}
        onEvent={handleComponentEvent}
        styles={styles}
        statePath="chart"
      />
    </div>
  );
}
```

## Component Registration

Components are registered during application startup with metadata keys:

```typescript
// Application startup
ngOnInit() {
  // Context-specific components
  this.globalRegistry.registerWithMetadata('SearchBox', 'CRM', 'v1', CRMSearchBoxComponent);
  this.globalRegistry.registerWithMetadata('SearchBox', 'Finance', 'v1', FinanceSearchBoxComponent);
  this.globalRegistry.registerWithMetadata('OrderList', 'Standard', 'v2', StandardOrderListComponent);
  this.globalRegistry.registerWithMetadata('OrderList', 'Advanced', 'v1', AdvancedOrderListComponent);
  
  // Global shared components (no context filtering)
  this.globalRegistry.register('DatePicker_Global', GlobalDatePickerComponent);
  this.globalRegistry.register('Modal_Global', GlobalModalComponent);
}
```

## Testing Strategy

### Testing Generated Components

```typescript
describe('OrderAnalysisReport', () => {
  it('should render with mock child components', () => {
    const mockComponents = {
      SearchBox: MockSearchBoxComponent,
      OrderList: MockOrderListComponent,
      CategoryChart: MockCategoryChartComponent
    };
    
    const props = {
      data: mockData,
      utilities: mockUtilities,
      userState: {},
      callbacks: mockCallbacks,
      styles: mockStyles,
      components: mockComponents
    };
    
    render(<OrderAnalysisReport {...props} />);
    // ... assertions
  });
});
```

### Testing Child Components in Isolation

```typescript
describe('SearchBox Component', () => {
  it('should handle search input', () => {
    const mockProps = {
      data: [],
      config: { placeholder: 'Test search' },
      state: {},
      onEvent: jest.fn(),
      styles: mockStyles,
      statePath: 'search'
    };
    
    render(<SearchBox {...mockProps} />);
    // ... test SearchBox behavior in isolation
  });
});
```

## Benefits

1. **Reusability**: Child components can be used across multiple parent components
2. **Testability**: Each component can be tested in isolation with mock dependencies
3. **Maintainability**: Components are defined once and shared
4. **Flexibility**: Different contexts can use different versions of the same component
5. **Performance**: Components are created once and shared across instances
6. **Simplicity**: Generated components use standard JavaScript object access
7. **Type Safety**: Components object can be typed for better development experience

## System Prompt Updates

The LLM generation prompt now includes:

```
## Component Requirements
- Create a main React component that receives these props: `{ data, utilities, userState, callbacks, styles, components }`
- Access child components via destructuring: `const { SearchBox, OrderList } = components;`
- All required child components are provided in the `components` object
```

## Migration Path

1. **Phase 1**: Implement global registry and Angular host updates
2. **Phase 2**: Update system prompts to use component destructuring
3. **Phase 3**: Migrate existing components to use registry pattern
4. **Phase 4**: Create shared component library with versioning

This architecture provides a clean separation between component composition (handled by Angular) and component usage (simple object access in generated React components), enabling better reusability, testability, and maintainability of our Skip Report system.