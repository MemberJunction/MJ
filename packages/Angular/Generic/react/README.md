# @memberjunction/ng-react

Angular components for hosting React components in MemberJunction applications. This package provides a seamless bridge between Angular and React, allowing you to use React components within your Angular applications.

## Overview

The `@memberjunction/ng-react` package enables Angular applications to render React components dynamically. It handles all the complexity of loading React, compiling JSX, managing component lifecycles, and bridging Angular/React data flow.

## Features

- **Dynamic React Component Rendering**: Compile and render React components from source code
- **Automatic Dependency Loading**: Loads React, ReactDOM, and Babel from CDN
- **Component Registry**: Manages compiled components with namespace support
- **Error Boundaries**: Comprehensive error handling for React components
- **Two-Way Data Binding**: Seamless data flow between Angular and React
- **TypeScript Support**: Full type safety with TypeScript definitions

## Installation

```bash
npm install @memberjunction/ng-react
```

## Basic Usage

### 1. Import the Module

```typescript
import { MJReactModule } from '@memberjunction/ng-react';

@NgModule({
  imports: [
    CommonModule,
    MJReactModule
  ]
})
export class YourModule { }
```

### 2. Use in Templates

```html
<mj-react-component
  [component]="componentSpec"
  [data]="componentData"
  [state]="componentState"
  [utilities]="utilities"
  [styles]="styles"
  (stateChange)="onStateChange($event)"
  (componentEvent)="onComponentEvent($event)"
  (refreshData)="onRefreshData()"
  (openEntityRecord)="onOpenEntityRecord($event)">
</mj-react-component>
```

### 3. Component Controller

```typescript
import { Component } from '@angular/core';
import { SkipComponentRootSpec } from '@memberjunction/skip-types';

@Component({
  selector: 'app-example',
  template: `
    <mj-react-component
      [component]="reactComponent"
      [data]="data">
    </mj-react-component>
  `
})
export class ExampleComponent {
  reactComponent: SkipComponentRootSpec = {
    componentName: 'MyReactComponent',
    componentCode: `
      function MyReactComponent({ data, callbacks }) {
        return (
          <div>
            <h1>Hello, {data.name}!</h1>
            <button onClick={() => callbacks.RefreshData()}>
              Refresh
            </button>
          </div>
        );
      }
    `
  };

  data = {
    name: 'World'
  };
}
```

## Component Props

React components receive the following props:

```typescript
interface ComponentProps {
  data: any;              // Data passed from Angular
  userState: any;         // Component state managed by Angular
  utilities: any;         // Utility functions
  callbacks: {            // Callbacks to Angular
    RefreshData: () => void;
    OpenEntityRecord: (entityName: string, key: any) => void;
    UpdateUserState: (state: any) => void;
    NotifyEvent: (event: string, data: any) => void;
  };
  components?: Record<string, any>;  // Child components
  styles?: ComponentStyles;          // Style configuration
}
```

## Advanced Features

### Component Hierarchies

```typescript
const componentSpec: SkipComponentRootSpec = {
  componentName: 'ParentComponent',
  componentCode: '...',
  childComponents: [
    {
      componentName: 'ChildComponent1',
      componentCode: '...'
    },
    {
      componentName: 'ChildComponent2',
      componentCode: '...'
    }
  ]
};
```

### Custom Styles

```typescript
const styles: SkipComponentStyles = {
  colors: {
    primary: '#5B4FE9',
    secondary: '#64748B'
  },
  typography: {
    fontFamily: 'Inter, sans-serif'
  }
};
```

### State Management

```typescript
// In your Angular component
onStateChange(event: StateChangeEvent) {
  console.log(`State ${event.path} changed to:`, event.value);
  // Update your Angular component state
}

// In your React component
function MyComponent({ userState, callbacks }) {
  const updateState = () => {
    callbacks.UpdateUserState({
      counter: userState.counter + 1
    });
  };
  
  return <button onClick={updateState}>Count: {userState.counter}</button>;
}
```

## Services

### ScriptLoaderService

Manages loading of external scripts and CSS:

```typescript
constructor(private scriptLoader: ScriptLoaderService) {}

async loadCustomLibrary() {
  const lib = await this.scriptLoader.loadScript(
    'https://cdn.example.com/lib.js',
    'MyLibrary'
  );
}
```

### ReactBridgeService

Manages React instances and roots:

```typescript
constructor(private reactBridge: ReactBridgeService) {}

async checkReactStatus() {
  const isReady = this.reactBridge.isReady();
  const rootCount = this.reactBridge.getActiveRootsCount();
}
```

### AngularAdapterService

Provides access to the React runtime:

```typescript
constructor(private adapter: AngularAdapterService) {}

async compileCustomComponent() {
  const result = await this.adapter.compileComponent({
    componentName: 'CustomComponent',
    componentCode: '...'
  });
}
```

## Error Handling

The component automatically wraps React components in error boundaries:

```typescript
onComponentEvent(event: ReactComponentEvent) {
  if (event.type === 'error') {
    console.error('React component error:', event.payload);
    // Handle error in Angular
  }
}
```

## Performance Considerations

1. **Component Caching**: Compiled components are cached automatically
2. **Lazy Loading**: React libraries are loaded on-demand
3. **Change Detection**: Uses OnPush strategy for optimal performance
4. **Resource Cleanup**: Automatic cleanup of React roots on destroy

## Browser Support

- Chrome (latest)
- Firefox (latest)
- Safari (latest)
- Edge (latest)

## Dependencies

This package requires:
- Angular 18+
- React 18+
- @memberjunction/react-runtime
- @memberjunction/skip-types
- @memberjunction/core

## License

See the main MemberJunction LICENSE file in the repository root.