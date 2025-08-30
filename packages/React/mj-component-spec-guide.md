# MemberJunction Component Specification Guide

## Table of Contents
1. [Overview](#overview)
2. [ComponentSpec Structure](#componentspec-structure)
3. [Component Code Requirements](#component-code-requirements)
4. [Runtime Utilities](#runtime-utilities)
5. [Data Access Patterns](#data-access-patterns)
6. [Component Dependencies](#component-dependencies)
7. [Libraries and External Dependencies](#libraries-and-external-dependencies)
8. [Render Props Pattern](#render-props-pattern)
9. [Common Errors and Fixes](#common-errors-and-fixes)
10. [Testing and Validation](#testing-and-validation)

## Overview

MemberJunction components are React components that follow a specific specification format defined by the `ComponentSpec` interface. These components are designed to work seamlessly within the MJ ecosystem, providing access to data, utilities, and styling while maintaining a consistent interface.

### Key Concepts
- Components are either **embedded** (code included directly) or **registry** (loaded from MJ component registry)
- All components receive standard props: `utilities`, `styles`, `components`, `callbacks`, `savedUserSettings`, `onSaveUserSettings`
- Components can have nested dependencies that are resolved at runtime
- Data access is handled through RunView/RunQuery utilities
- Libraries are loaded dynamically from CDN URLs

## ComponentSpec Structure

### Basic Component Information

```typescript
{
  "name": "ProductInvoiceVolumeChart",        // Unique component name (PascalCase)
  "title": "Product Sales Volume Analysis",    // User-friendly display name
  "type": "chart",                            // Component type: report|dashboard|form|table|chart|navigation|search
  "description": "Interactive chart displaying product sales performance", // End-user description
  "location": "embedded",                     // "embedded" or "registry"
  "namespace": "CRM/Analytics",               // Optional hierarchical namespace
  "version": "1.0.0",                        // Semantic version (if registry component)
  "registry": "MJ",                          // Registry name (if registry component)
}
```

### Location Types
- **embedded**: Component code is included directly in the `code` field
- **registry**: Component is loaded from MJ registry using namespace/name/version

### Functional and Technical Design

```typescript
{
  "functionalRequirements": "# What the component does\n\nMarkdown describing business requirements, UX considerations, expected outcomes",
  "technicalDesign": "## Architecture\n\nMarkdown explaining technical implementation, data flow, performance optimizations",
  "exampleUsage": "<ProductChart initialDateRange={30} onExport={handleExport} />",
}
```

## Component Code Requirements

### Function Signature
Every component MUST be a function that accepts these standard props:

```javascript
function ComponentName({ 
  utilities,           // Data access utilities (md, rv, rq, ai)
  styles,             // Style configuration object
  components,         // Child component references
  callbacks,          // Event callbacks (OpenEntityRecord, RegisterMethod)
  savedUserSettings,  // Persisted user preferences
  onSaveUserSettings  // Function to save user preferences
}) {
  // Component implementation
}
```

### React Hooks Access
Components must destructure React hooks from the global React object:

```javascript
function MyComponent({ utilities, styles, components, callbacks, savedUserSettings, onSaveUserSettings }) {
  const { useState, useEffect, useMemo, useRef } = React;
  const [data, setData] = useState([]);
  // Component logic
}
```

### Return Value
Components should return valid JSX or React elements:

```javascript
return (
  <div style={{ padding: '20px' }}>
    <h1>Component Title</h1>
    {/* Component content */}
  </div>
);
```

## Runtime Utilities

### utilities.md (Metadata)
Access to entity metadata and object creation:

```javascript
// Get entity metadata
const entities = utilities.md.Entities;
const userEntity = entities.find(e => e.Name === 'Users');

// Create entity object for CRUD operations
const userObj = await utilities.md.GetEntityObject('Users');
userObj.FirstName = 'John';
await userObj.Save();
```

### utilities.rv (RunView)
Execute views to fetch entity data:

```javascript
// Single view
const result = await utilities.rv.RunView({
  EntityName: 'Products',
  ExtraFilter: 'Active = 1',
  OrderBy: 'Name',
  Fields: ['ID', 'Name', 'Price'],
  MaxRows: 100,
  ResultType: 'entity_object'  // Returns entity objects, not raw data
});

if (result.Success) {
  const products = result.Results;
  console.log(`Loaded ${result.TotalRowCount} products`);
} else {
  console.error('Failed:', result.ErrorMessage);
}

// Multiple views in parallel (more efficient)
const [products, categories, invoices] = await utilities.rv.RunViews([
  { EntityName: 'Products', MaxRows: 100 },
  { EntityName: 'Categories', MaxRows: 50 },
  { EntityName: 'Invoices', ExtraFilter: "Status = 'Active'" }
]);
```

### utilities.rq (RunQuery)
Execute predefined queries with parameters:

```javascript
const result = await utilities.rq.RunQuery({
  QueryName: 'ProductInvoiceVolumeTrend',
  Parameters: {
    startDate: '2023-01-01',
    endDate: '2024-01-01'
  }
});

if (result.Success) {
  const data = result.Results;
  console.log(`Query returned ${result.RowCount} rows`);
}
```

### utilities.ai (AI Tools)
Optional AI capabilities (may not always be available):

```javascript
// Check if AI is available
if (utilities.ai) {
  const aiResult = await utilities.ai.ExecutePrompt({
    systemPrompt: 'Analyze this sales data and provide insights',
    messages: [
      { role: 'user', message: 'What are the top trends?' }
    ],
    modelPower: 'medium'  // 'lowest' | 'medium' | 'highest'
  });
  
  if (aiResult.success) {
    console.log('AI Response:', aiResult.result);
    console.log('Model Used:', aiResult.modelName);
  }
}
```

## Data Access Patterns

### Data Requirements Structure

```json
{
  "dataRequirements": {
    "mode": "queries",  // "views" | "queries" | "hybrid"
    "description": "How this component accesses data",
    "entities": [
      {
        "name": "Products",
        "displayFields": ["ProductName", "Price"],
        "filterFields": ["CategoryID", "Active"],
        "sortFields": ["ProductName"],
        "permissionLevelNeeded": ["read"],
        "fieldMetadata": [
          {
            "name": "ProductName",
            "type": "nvarchar",
            "sequence": 1,
            "allowsNull": false,
            "isPrimaryKey": false,
            "defaultInView": true
          }
        ]
      }
    ],
    "queries": [
      {
        "name": "ProductSalesTrend",
        "categoryPath": "Analytics/Sales",
        "description": "Aggregates product sales over time",
        "fields": [
          {
            "name": "ProductName",
            "type": "nvarchar",
            "sequence": 1
          },
          {
            "name": "TotalSales",
            "type": "decimal",
            "sequence": 2
          }
        ],
        "parameters": [
          {
            "name": "startDate",
            "value": "@runtime",
            "testValue": "2023-01-01",
            "description": "Start of date range"
          }
        ]
      }
    ]
  }
}
```

### Permission Levels
- **read**: Can view data
- **create**: Can create new records
- **update**: Can modify existing records
- **delete**: Can remove records

## Component Dependencies

### Defining Child Components

```json
{
  "dependencies": [
    {
      "name": "ChartDisplay",
      "location": "embedded",
      "description": "Renders the chart visualization",
      "functionalRequirements": "Display bar chart with hover tooltips",
      "code": "function ChartDisplay({ data, utilities, styles }) { ... }",
      "properties": [
        {
          "name": "data",
          "type": "Array<{name: string, value: number}>",
          "required": true,
          "description": "Chart data array"
        }
      ],
      "events": [
        {
          "name": "onBarClick",
          "description": "Fired when user clicks a bar",
          "parameters": [
            {
              "name": "dataPoint",
              "type": "object"
            }
          ]
        }
      ]
    }
  ]
}
```

### Using Child Components in Parent

```javascript
function ParentComponent({ utilities, styles, components }) {
  const { ChartDisplay, FilterPanel } = components;
  
  return (
    <div>
      <FilterPanel onFilterChange={handleFilter} />
      <ChartDisplay data={chartData} />
    </div>
  );
}
```

## Libraries and External Dependencies

### Library Definition

```json
{
  "libraries": [
    {
      "name": "chart.js",           // NPM package name
      "globalVariable": "Chart",     // Global window variable name
      "version": "^4.4.1"          // Version constraint
    },
    {
      "name": "dayjs",
      "globalVariable": "dayjs",
      "version": "^1.11.10"
    }
  ]
}
```

### Using Libraries in Code

```javascript
function ChartComponent({ utilities, styles, components }) {
  const Chart = window.Chart;  // Access global library
  const dayjs = window.dayjs;
  
  useEffect(() => {
    if (!Chart) {
      console.error('Chart.js not loaded');
      return;
    }
    
    const ctx = canvasRef.current.getContext('2d');
    const chart = new Chart(ctx, chartConfig);
  }, []);
}
```

### Important Library Notes
- **React and ReactDOM** are always pre-loaded - never include them in libraries
- Libraries are loaded from CDN URLs defined in MJ metadata
- Check if library is loaded before using: `if (!window.Chart) return;`

## Render Props Pattern

### Common Pattern Error
The most common error is mismatched render prop patterns between parent and child components.

### Correct Pattern - Object Destructuring

```javascript
// Child component that uses render prop
function DataManager({ children, utilities }) {
  const [data, setData] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  
  // Return render prop with OBJECT
  return children({
    data,
    loading,
    error,
    refetch: () => fetchData()
  });
}

// Parent component using the child - CORRECT
function ParentComponent({ utilities, components }) {
  const { DataManager } = components;
  
  return (
    <DataManager utilities={utilities}>
      {(result) => {
        const { data, loading, error } = result;  // Destructure the object
        if (loading) return <div>Loading...</div>;
        if (error) return <div>Error: {error}</div>;
        return <div>{data.map(item => ...)}</div>;
      }}
    </DataManager>
  );
}
```

### INCORRECT Pattern - Positional Parameters

```javascript
// This will cause "TypeError: rawData.forEach is not a function"
<DataManager>
  {(data, loading, error) => {  // WRONG - expecting positional params
    // data is actually the whole object { data, loading, error }
    return data.forEach(...);  // ERROR!
  }}
</DataManager>
```

## Common Errors and Fixes

### 1. TypeError: rawData.forEach is not a function

**Cause**: Render prop pattern mismatch - receiving object but expecting array

**Fix**:
```javascript
// Change from:
{(data, loading, error) => {

// To:
{(result) => {
  const { data, loading, error } = result;
```

### 2. Cannot read properties of null (reading 'addEventListener')

**Cause**: Trying to access DOM element before it's rendered

**Fix**:
```javascript
useEffect(() => {
  if (!canvasRef.current) return;  // Add null check
  
  const ctx = canvasRef.current.getContext('2d');
  if (!ctx) return;  // Check context too
  
  // Now safe to use
}, [dependencies]);
```

### 3. Chart.js library is not loaded

**Cause**: Library not loaded from CDN or wrong global variable name

**Fix**:
```javascript
const Chart = window.Chart;

if (!Chart) {
  return <div>Chart.js library is not loaded</div>;
}

// Safe to use Chart
```

### 4. RunView returns no data

**Cause**: Usually incorrect entity name or filter syntax

**Fix**:
```javascript
// Check exact entity name from metadata
const result = await utilities.rv.RunView({
  EntityName: 'Products',  // Must match exactly (case-sensitive)
  ExtraFilter: "Status = 'Active'",  // SQL WHERE clause syntax
  ResultType: 'entity_object'  // Get typed objects, not raw data
});

// Always check Success
if (!result.Success) {
  console.error('RunView failed:', result.ErrorMessage);
}
```

### 5. React Hooks Rules Violation

**Cause**: Hooks called conditionally or after early returns

**Fix**:
```javascript
function Component({ utilities }) {
  // ALL hooks must be at the top, before any conditions
  const { useState, useEffect } = React;
  const [data, setData] = useState([]);
  
  // Now you can have conditions
  if (!utilities) {
    return <div>No utilities</div>;
  }
  
  // Rest of component
}
```

## Testing and Validation

### Component Properties

```json
{
  "properties": [
    {
      "name": "initialDateRange",
      "type": "number",
      "required": false,
      "defaultValue": 30,
      "description": "Initial date range in days"
    },
    {
      "name": "onDataUpdate", 
      "type": "function",
      "required": true,
      "description": "Callback when data updates"
    }
  ]
}
```

### Component Events

```json
{
  "events": [
    {
      "name": "onExport",
      "description": "Fired when user exports data",
      "parameters": [
        {
          "name": "format",
          "type": "string",
          "description": "Export format (PDF, PNG, CSV)"
        },
        {
          "name": "data",
          "type": "Array",
          "description": "Exported data"
        }
      ]
    }
  ]
}
```

### Method Support

```json
{
  "methods": {
    "standardMethodsSupported": {
      "print": true,
      "refresh": true,
      "getCurrentDataState": true,
      "validate": true,
      "isDirty": false,
      "reset": true
    },
    "customMethods": [
      {
        "name": "exportToExcel",
        "description": "Exports data to Excel format",
        "parameters": [
          {
            "name": "options",
            "type": "object",
            "description": "Export options"
          }
        ],
        "returnType": "Promise<Blob>"
      }
    ]
  }
}
```

## Best Practices

### 1. Always Check Data Access Results
```javascript
const result = await utilities.rv.RunView({...});
if (!result.Success) {
  console.error('Failed:', result.ErrorMessage);
  return <div>Error loading data</div>;
}
```

### 2. Use Proper React Hook Order
```javascript
// Destructure React first
const { useState, useEffect, useMemo } = React;
// Then use hooks
const [data, setData] = useState([]);
```

### 3. Handle Library Loading
```javascript
const Chart = window.Chart;
if (!Chart) {
  return <div>Required library not loaded</div>;
}
```

### 4. Implement Loading States
```javascript
const [loading, setLoading] = useState(true);
const [error, setError] = useState(null);

if (loading) return <div>Loading...</div>;
if (error) return <div>Error: {error}</div>;
```

### 5. Use Memoization for Performance
```javascript
const processedData = useMemo(() => {
  if (!data) return [];
  return data.sort((a, b) => b.value - a.value);
}, [data]);
```

### 6. Clean Up Resources
```javascript
useEffect(() => {
  const chart = new Chart(ctx, config);
  
  return () => {
    chart.destroy();  // Clean up on unmount
  };
}, []);
```

### 7. Handle Component Dependencies
```javascript
const { ChartDisplay, DataManager } = components;
if (!ChartDisplay || !DataManager) {
  return <div>Required components not available</div>;
}
```

### 8. Save User Settings
```javascript
const handleSettingChange = (setting, value) => {
  const newSettings = {
    ...savedUserSettings,
    [setting]: value
  };
  onSaveUserSettings(newSettings);
};
```

## Component Lifecycle

### 1. Initial Load
- Component function is called with props
- React hooks are initialized
- Initial state is set

### 2. Data Fetching
- UseEffect hooks trigger data fetching
- RunView/RunQuery calls are made
- Loading state is managed

### 3. Render
- Component returns JSX based on state
- Child components receive props
- Event handlers are attached

### 4. Updates
- State changes trigger re-renders
- UseMemo prevents unnecessary recalculations
- UseEffect with dependencies manages side effects

### 5. Cleanup
- Return functions in useEffect clean up resources
- Chart instances are destroyed
- Event listeners are removed

## Debugging Tips

### 1. Check Console for Errors
- Look for TypeErrors related to undefined/null
- Check for library loading errors
- Review RunView/RunQuery error messages

### 2. Verify Data Structure
```javascript
console.log('Data structure:', {
  type: typeof data,
  isArray: Array.isArray(data),
  length: data?.length,
  sample: data?.[0]
});
```

### 3. Test Render Props
```javascript
// Log what the render prop receives
{(result) => {
  console.log('Render prop received:', result);
  const { data, loading, error } = result;
  // ...
}}
```

### 4. Validate Entity Names
```javascript
// List all available entities
console.log('Available entities:', 
  utilities.md.Entities.map(e => e.Name)
);
```

### 5. Check Library Loading
```javascript
console.log('Libraries loaded:', {
  Chart: !!window.Chart,
  dayjs: !!window.dayjs,
  // ... other libraries
});
```

## Advanced Patterns

### Dynamic Component Loading
```javascript
function DynamicComponent({ componentName, utilities, components }) {
  const Component = components[componentName];
  
  if (!Component) {
    return <div>Component {componentName} not found</div>;
  }
  
  return <Component utilities={utilities} />;
}
```

### Error Boundaries
```javascript
function ComponentWithErrorBoundary({ utilities, styles, components }) {
  const [hasError, setHasError] = useState(false);
  
  if (hasError) {
    return <div>Something went wrong. Please refresh.</div>;
  }
  
  try {
    return <ActualComponent utilities={utilities} />;
  } catch (error) {
    setHasError(true);
    console.error('Component error:', error);
  }
}
```

### Optimistic Updates
```javascript
function OptimisticComponent({ utilities }) {
  const [items, setItems] = useState([]);
  
  const updateItem = async (id, updates) => {
    // Optimistic update
    setItems(prev => prev.map(item => 
      item.ID === id ? { ...item, ...updates } : item
    ));
    
    try {
      // Actual update
      const entity = await utilities.md.GetEntityObject('Items');
      await entity.Load(id);
      Object.assign(entity, updates);
      await entity.Save();
    } catch (error) {
      // Revert on error
      await loadItems();
    }
  };
}
```

## Conclusion

This guide provides comprehensive information for creating, editing, and debugging MemberJunction component specifications. Remember that components must:

1. Follow the standard prop signature
2. Handle data access through utilities
3. Properly manage React lifecycle
4. Clean up resources
5. Handle errors gracefully
6. Support user settings persistence

For additional help, refer to the MJ documentation at https://docs.memberjunction.org or examine existing components in the registry for examples.