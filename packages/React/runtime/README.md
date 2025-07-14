# @memberjunction/react-runtime

Platform-agnostic React component runtime for MemberJunction. This package provides core compilation, registry, and execution capabilities for React components in any JavaScript environment.

## Overview

The React Runtime package enables dynamic compilation and execution of React components from source code. It works in both browser and Node.js environments, making it suitable for client-side rendering and server-side testing.

## Features

- **Dynamic Compilation**: Transform JSX and React code at runtime using Babel
- **Component Registry**: Manage compiled components with namespace support
- **Dependency Resolution**: Handle component hierarchies and dependencies
- **Error Boundaries**: Comprehensive error handling for React components
- **Platform Agnostic**: Works in any JavaScript environment
- **Type Safe**: Full TypeScript support with strict typing

## Installation

```bash
npm install @memberjunction/react-runtime
```

## Basic Usage

### Creating a Runtime Instance

```typescript
import { createReactRuntime } from '@memberjunction/react-runtime';
import * as Babel from '@babel/standalone';

// Create runtime with Babel instance
const runtime = createReactRuntime(Babel);
```

### Compiling a Component

```typescript
const componentCode = `
  function MyComponent({ data, userState, callbacks }) {
    return (
      <div>
        <h1>Hello, {data.name}!</h1>
        <button onClick={() => callbacks.RefreshData()}>
          Refresh
        </button>
      </div>
    );
  }
`;

// Compile the component
const result = await runtime.compiler.compile({
  componentName: 'MyComponent',
  componentCode: componentCode
});

if (result.success) {
  // Register the compiled component
  runtime.registry.register(
    'MyComponent',
    result.component.component,
    'MyNamespace',
    'v1'
  );
}
```

### Using the Component

```typescript
// Get React context (provided by your environment)
const React = window.React; // or require('react')
const ReactDOM = window.ReactDOM; // or require('react-dom')

// Create runtime context
const context = { React, ReactDOM };

// Get the compiled component
const MyComponent = runtime.registry.get('MyComponent', 'MyNamespace');

// Execute the component factory
const { component } = MyComponent(context);

// Render with props
const props = {
  data: { name: 'World' },
  userState: {},
  callbacks: {
    RefreshData: () => console.log('Refresh clicked!')
  }
};

React.createElement(component, props);
```

## Advanced Features

### Component Hierarchies

```typescript
const parentSpec = {
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

// Resolve all components in hierarchy
const components = runtime.resolver.resolveComponents(parentSpec);
```

### Error Boundaries

```typescript
import { createErrorBoundary } from '@memberjunction/react-runtime';

const ErrorBoundary = createErrorBoundary(React, {
  onError: (error, errorInfo) => {
    console.error('Component error:', error);
  },
  fallback: <div>Something went wrong</div>,
  recovery: 'retry'
});

// Wrap your component
<ErrorBoundary>
  <YourComponent />
</ErrorBoundary>
```

### Component Registry Management

```typescript
// Check if component exists
if (runtime.registry.has('MyComponent')) {
  // Get component with reference counting
  const component = runtime.registry.get('MyComponent');
  
  // Release when done
  runtime.registry.release('MyComponent');
}

// Get registry statistics
const stats = runtime.registry.getStats();
console.log(`Total components: ${stats.totalComponents}`);

// Clean up unused components
const removed = runtime.registry.cleanup();
console.log(`Removed ${removed} unused components`);
```

## Configuration

### Compiler Configuration

```typescript
const runtime = createReactRuntime(Babel, {
  compiler: {
    babel: {
      presets: ['react'],
      plugins: ['transform-optional-chaining']
    },
    minify: true,
    sourceMaps: true,
    cache: true,
    maxCacheSize: 200
  }
});
```

### Registry Configuration

```typescript
const runtime = createReactRuntime(Babel, {
  registry: {
    maxComponents: 500,
    cleanupInterval: 30000, // 30 seconds
    useLRU: true,
    enableNamespaces: true
  }
});
```

## API Reference

### Types

- `CompileOptions` - Options for compiling components
- `ComponentProps` - Standard props passed to components
- `ComponentCallbacks` - Callback functions available to components
- `RegistryEntry` - Registry entry with metadata

### Classes

- `ComponentCompiler` - Compiles React components from source
- `ComponentRegistry` - Manages compiled components
- `ComponentResolver` - Resolves component dependencies

### Utilities

- `createErrorBoundary()` - Creates error boundary components
- `buildComponentProps()` - Builds standardized component props
- `wrapComponent()` - Wraps components with additional functionality

## Best Practices

1. **Always Set Babel Instance**: Call `setBabelInstance()` before compiling
2. **Use Namespaces**: Organize components with namespaces
3. **Handle Errors**: Always check compilation results for errors
4. **Clean Up**: Use registry cleanup for long-running applications
5. **Type Safety**: Leverage TypeScript types for better development experience

## License

See the main MemberJunction LICENSE file in the repository root.