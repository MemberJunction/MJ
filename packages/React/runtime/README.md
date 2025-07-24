# @memberjunction/react-runtime

Platform-agnostic React component runtime for MemberJunction. This package provides core compilation, registry, execution capabilities, and dynamic library management for React components in any JavaScript environment.

## Overview

The React Runtime package enables dynamic compilation and execution of React components from source code, with flexible external library management. It works in both browser and Node.js environments, making it suitable for client-side rendering, server-side testing, and multi-tenant applications with different library requirements.

## Features

- **Dynamic Compilation**: Transform JSX and React code at runtime using Babel
- **Component Registry**: Manage compiled components with namespace support
- **Dependency Resolution**: Handle component hierarchies and dependencies
- **Dynamic Library Management**: Configure and load external libraries at runtime
- **Error Boundaries**: Comprehensive error handling for React components
- **Platform Agnostic**: Works in any JavaScript environment
- **Type Safe**: Full TypeScript support with strict typing
- **Organization-Specific Libraries**: Support for different library sets per organization

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

## Dynamic Library Management (New)

### Loading Libraries with Configuration

```typescript
import { LibraryLoader, StandardLibraryManager } from '@memberjunction/react-runtime';

// Define custom library configuration
const libraryConfig = {
  libraries: [
    {
      id: 'lodash',
      name: 'lodash',
      displayName: 'Lodash',
      category: 'utility',
      globalVariable: '_',
      version: '4.17.21',
      cdnUrl: 'https://cdnjs.cloudflare.com/ajax/libs/lodash.js/4.17.21/lodash.min.js',
      description: 'Utility library',
      isEnabled: true,
      isCore: false
    },
    {
      id: 'chart-js',
      name: 'Chart',
      displayName: 'Chart.js',
      category: 'charting',
      globalVariable: 'Chart',
      version: '4.4.0',
      cdnUrl: 'https://cdnjs.cloudflare.com/ajax/libs/Chart.js/4.4.0/chart.umd.js',
      isEnabled: true,
      isCore: false
    }
    // ... more libraries
  ],
  metadata: {
    version: '1.0.0',
    lastUpdated: '2024-01-01'
  }
};

// Load libraries with custom configuration
const result = await LibraryLoader.loadAllLibraries(libraryConfig);
```

### Managing Library Configurations

```typescript
import { StandardLibraryManager } from '@memberjunction/react-runtime';

// Set a custom configuration
StandardLibraryManager.setConfiguration(libraryConfig);

// Get enabled libraries
const enabledLibs = StandardLibraryManager.getEnabledLibraries();

// Get libraries by category
const chartingLibs = StandardLibraryManager.getLibrariesByCategory('charting');
const uiLibs = StandardLibraryManager.getLibrariesByCategory('ui');

// Get component libraries (excludes runtime-only libraries)
const componentLibs = StandardLibraryManager.getComponentLibraries();

// Reset to default configuration
StandardLibraryManager.resetToDefault();
```

### Library Categories

Libraries are organized into categories:
- **`runtime`**: Core runtime libraries (React, ReactDOM, Babel) - not exposed to components
- **`ui`**: UI component libraries (Ant Design, React Bootstrap)
- **`charting`**: Data visualization libraries (Chart.js, D3.js)
- **`utility`**: Utility libraries (Lodash, Day.js)

### Runtime-Only Libraries

Libraries marked with `isRuntimeOnly: true` are used by the runtime infrastructure but not exposed to generated components. This includes React, ReactDOM, and Babel.

### Using the Component

```typescript
// Get React context (provided by your environment)
const React = window.React; // or require('react')
const ReactDOM = window.ReactDOM; // or require('react-dom')

// Create runtime context with loaded libraries
const context = { 
  React, 
  ReactDOM,
  libraries: result.libraries // From LibraryLoader
};

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
- `LibraryConfiguration` - Configuration for external libraries
- `ExternalLibraryConfig` - Individual library configuration

### Classes

- `ComponentCompiler` - Compiles React components from source
- `ComponentRegistry` - Manages compiled components
- `ComponentResolver` - Resolves component dependencies
- `StandardLibraryManager` - Manages library configurations
- `LibraryLoader` - Loads external libraries dynamically

### Utilities

- `createErrorBoundary()` - Creates error boundary components
- `buildComponentProps()` - Builds standardized component props
- `wrapComponent()` - Wraps components with additional functionality
- `createStandardLibraries()` - Creates standard library object from globals

## Best Practices

1. **Always Set Babel Instance**: Call `setBabelInstance()` before compiling
2. **Use Namespaces**: Organize components with namespaces
3. **Handle Errors**: Always check compilation results for errors
4. **Clean Up**: Use registry cleanup for long-running applications
5. **Type Safety**: Leverage TypeScript types for better development experience
6. **Library Management**: Configure only necessary libraries for security and performance
7. **Runtime Separation**: Keep runtime libraries separate from component libraries

## License

See the main MemberJunction LICENSE file in the repository root.