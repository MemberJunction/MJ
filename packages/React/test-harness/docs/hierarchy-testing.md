# Component Hierarchy Testing

The React Test Harness now supports testing complex component hierarchies, particularly useful for testing Skip components that have nested child components.

## Overview

When testing components that depend on child components (like Skip dashboard components), you can now:
- Test entire component hierarchies with automatic child registration
- Load components from files while injecting child components
- Control whether children should be registered

## API Methods

### `testComponentHierarchy(rootSpec, props?, options?)`

Tests a root component along with its entire hierarchy of child components.

```typescript
const rootSpec: ComponentSpec = {
  componentName: 'Dashboard',
  componentCode: '...',
  childComponents: [
    {
      componentName: 'Widget',
      componentCode: '...',
      childComponents: [
        // Nested children supported
      ]
    }
  ]
};

const result = await harness.testComponentHierarchy(rootSpec, { title: 'My Dashboard' });
```

### `testComponentFromFileWithChildren(filePath, childComponents, props?, options?)`

Tests a component loaded from a file while injecting additional child components.

```typescript
const childComponents: ComponentSpec[] = [
  {
    componentName: 'CustomWidget',
    componentCode: '...'
  }
];

const result = await harness.testComponentFromFileWithChildren(
  './dashboard.js',
  childComponents,
  { title: 'Dashboard' }
);
```

## ComponentSpec Interface

```typescript
interface ComponentSpec {
  componentName: string;
  componentCode?: string;
  childComponents?: ComponentSpec[];
  components?: ComponentSpec[]; // Alternative property name
}
```

## How It Works

1. **Child Component Collection**: The harness recursively collects all child components from the hierarchy
2. **Registration**: Child components are registered in a local scope before the main component renders
3. **Component Access**: Registered components are passed to the main component via the `components` prop
4. **Isolation**: Each test run has its own isolated component registry

## Example: Testing a Skip Dashboard Component

```typescript
// Define a dashboard with child components
const dashboardSpec: ComponentSpec = {
  componentName: 'SalesDashboard',
  componentCode: `
    function Component({ title, components }) {
      return (
        <div className="dashboard">
          <h1>{title}</h1>
          {components.MetricCard && (
            <components.MetricCard value={1000} label="Revenue" />
          )}
          {components.ChartWidget && (
            <components.ChartWidget data={salesData} />
          )}
        </div>
      );
    }
  `,
  childComponents: [
    {
      componentName: 'MetricCard',
      componentCode: `
        function Component({ value, label }) {
          return (
            <div className="metric">
              <span>{label}: ${value}</span>
            </div>
          );
        }
      `
    },
    {
      componentName: 'ChartWidget',
      componentCode: `
        function Component({ data }) {
          return <div className="chart">Chart goes here</div>;
        }
      `
    }
  ]
};

// Test the entire hierarchy
const result = await harness.testComponentHierarchy(
  dashboardSpec,
  { title: 'Q4 Sales', salesData: [...] }
);
```

## Options

### `registerChildren` (default: true)

Controls whether child components should be registered:

```typescript
// Test component without registering children
await harness.testComponent(
  componentCode,
  props,
  { registerChildren: false }
);
```

## Best Practices

1. **Component Naming**: Use consistent, unique names for all components in the hierarchy
2. **Code Organization**: Keep component code focused and modular
3. **Props Interface**: Main components should accept a `components` prop to receive registered children
4. **Error Handling**: Check if child components exist before using them
5. **Testing Strategy**: Test both with and without children to ensure proper fallbacks

## Integration with Skip Components

Skip components often have complex hierarchies with rootSpec and childComponents. The test harness now handles these naturally:

```typescript
// Load Skip component spec from database or file
const skipComponentSpec = await loadSkipComponent();

// Test the entire hierarchy
const result = await harness.testComponentHierarchy(
  skipComponentSpec,
  { 
    // Props for the root component
    data: await fetchData()
  }
);

// Assertions
expect(result.success).toBe(true);
expect(result.html).toContain('dashboard');
```