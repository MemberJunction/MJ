# How to Create New MemberJunction Interactive Components

## Overview
This guide documents the complete process and rules for creating new interactive components in the MemberJunction metadata system. These guidelines are based on established patterns and best practices from the current session.

## Table of Contents
1. [Component Structure](#component-structure)
2. [Required Files](#required-files)
3. [Component Rules](#component-rules)
4. [Library Usage](#library-usage)
5. [UI/UX Patterns](#uiux-patterns)
6. [Data Access Patterns](#data-access-patterns)
7. [Sub-Component Architecture](#sub-component-architecture)
8. [Step-by-Step Process](#step-by-step-process)

## Component Structure

### File Organization
```
metadata/components/
├── .components.json       # Component registry (DO NOT edit primaryKey or sync)
├── spec/                  # Component specifications
│   └── component-name.spec.json
└── code/                  # Component implementations
    └── component-name.js
```

### Naming Conventions
- **Component Names**: PascalCase (e.g., `SalesFunnelVisualization`)
- **File Names**: kebab-case (e.g., `sales-funnel-visualization.js`)
- **Namespace**: Category/Subcategory format (e.g., `CRM/Analytics`)

## Required Files

### 1. Specification File (`spec/component-name.spec.json`)
```json
{
  "name": "ComponentName",
  "namespace": "Category/Subcategory",
  "type": "Dashboard|Chart|Report|Analysis|Profile|Matrix|Metrics",
  "location": "embedded",
  "code": "@file:../code/component-name.js",
  "functionalRequirements": "## Component Purpose\n\n### Core Features\n- Feature 1\n- Feature 2\n\n### Visual Design\n- Design notes",
  "dataRequirements": {
    "mode": "views",
    "entities": [
      {
        "name": "EntityName",
        "displayFields": ["Field1", "Field2"],
        "filterFields": ["Field1"],
        "sortFields": ["Field1"],
        "fields": [
          {
            "name": "FieldName",
            "type": "string|number|date",
            "description": "Field description"
          }
        ],
        "requiredPermissions": ["read"]
      }
    ]
  },
  "technicalDesign": "## Implementation Details\n\n### Component Architecture\n- Main component\n- Sub-components\n\n### State Management\n- State variables\n- Persistence strategy",
  "properties": [],
  "events": [
    {
      "name": "OpenEntityRecord",
      "description": "Navigate to entity details"
    }
  ],
  "dependencies": [],
  "libraries": [
    {
      "name": "library-name",
      "version": "^1.0.0",
      "globalVariable": "GlobalVar"
    }
  ]
}
```

### 2. Code File (`code/component-name.js`)
```javascript
function ComponentName({ utilities, styles, components, callbacks, savedUserSettings, onSaveUserSettings }) {
  // State management
  const [data, setData] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [viewMode, setViewMode] = useState(savedUserSettings?.viewMode || 'default');
  
  // Load data on mount
  useEffect(() => {
    loadData();
  }, []);
  
  const loadData = async () => {
    setLoading(true);
    setError(null);
    
    try {
      const result = await utilities.rv.RunView({
        EntityName: 'EntityName',
        OrderBy: 'Field DESC',
        ResultType: 'entity_object'
      });
      
      if (result.Success) {
        setData(result.Results || []);
      } else {
        setError(result.ErrorMessage || 'Failed to load data');
      }
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };
  
  // Component JSX
  if (loading) {
    return (
      <div style={{ padding: '40px', textAlign: 'center' }}>
        <div style={{ fontSize: '18px', color: '#6B7280' }}>Loading...</div>
      </div>
    );
  }
  
  if (error) {
    return (
      <div style={{ padding: '20px', backgroundColor: '#FEE2E2', borderRadius: '8px' }}>
        <div style={{ color: '#991B1B', fontWeight: 'bold' }}>Error</div>
        <div style={{ color: '#DC2626', marginTop: '8px' }}>{error}</div>
      </div>
    );
  }
  
  return (
    <div style={{ padding: '20px' }}>
      {/* Component content */}
    </div>
  );
}
```

### 3. Registry Entry (`.components.json`)
```json
{
  "fields": {
    "Name": "ComponentName",
    "Namespace": "Category/Subcategory",
    "Description": "Brief component description",
    "Title": "Display Title",
    "Type": "Component Type",
    "Version": "1.0.0",
    "VersionSequence": 1,
    "Status": "Published",
    "Specification": "@file:spec/component-name.spec.json"
  }
}
```

**IMPORTANT**: Never add `primaryKey` or `sync` sections - these are auto-generated.

## Component Rules

### Critical Rules

1. **NO Popups/Modals** - Use slide-in/slide-out panels instead
2. **NO `any` Types** - All code must be properly typed (though we use JS, follow typing principles)
3. **NO Direct Commits** - Never commit without explicit approval
4. **NO Dynamic Imports** - Always use static imports at the top of files

### Standard Props Pattern
Root components receive ONLY these props:
- `utilities`: Data access and utility functions
- `styles`: Component styling utilities  
- `components`: Registry of available child components
- `callbacks`: Event handler registry (includes `OpenEntityRecord`)
- `savedUserSettings`: Persisted user preferences
- `onSaveUserSettings`: Callback to persist settings

### State Management Rules
- Components own ALL their state
- Initialize from `savedUserSettings` or defaults
- Save important preferences via `onSaveUserSettings`
- Never sync props to state with useEffect
- Use `useState`, never `useReducer`

### Data Access Rules
- Always check `result.Success` before using data
- Use `RunView` for entity queries
- Use `RunViews` (plural) for batch operations
- Never make queries inside loops
- Load all data once, process client-side

## Library Usage

### Approved Libraries
Only use libraries from the React runtime approved list:

#### Charting
- `Chart.js` - Basic charts (globalVariable: "Chart")
- `ApexCharts` - Interactive charts (globalVariable: "ApexCharts")
- `ECharts` - Advanced visualizations (globalVariable: "echarts")
- `Highcharts` - Enterprise charts (globalVariable: "Highcharts")
- `Plotly` - Scientific plots (globalVariable: "Plotly")
- `d3` - Low-level graphics (globalVariable: "d3")
- `Victory` - React charts (globalVariable: "Victory")
- `Recharts` - React charts (globalVariable: "Recharts")

#### Animation
- `framer-motion` - React animations (globalVariable: "FramerMotion")
- `gsap` - General animations (globalVariable: "gsap")

#### Data/Math
- `simple-statistics` - Statistics (globalVariable: "ss")
- `mathjs` - Math operations (globalVariable: "math")
- `papaparse` - CSV parsing (globalVariable: "Papa")

#### UI Components
- `semantic-ui` - UI framework (globalVariable: "semanticUI")
- `ag-grid` - Data grids (globalVariable: "agGrid")

#### Utilities
- `dayjs` - Date manipulation (globalVariable: "dayjs")
- `lodash` - Utility functions (globalVariable: "_")
- `accounting` - Number formatting (globalVariable: "accounting")
- `chroma-js` - Color manipulation (globalVariable: "chroma")

#### Maps
- `topojson-client` - Topology (globalVariable: "topojson")

#### Documents
- `jspdf` - PDF generation (globalVariable: "jsPDF")
- `xlsx` - Excel files (globalVariable: "XLSX")

### Library Declaration
Always declare libraries in spec file with exact global variable name:
```json
"libraries": [
  {
    "name": "Chart.js",
    "version": "^4.4.0",
    "globalVariable": "Chart"  // CRITICAL: Must match exactly
  }
]
```

## UI/UX Patterns

### Layout Patterns
1. **Slide-out Panels** - For details and actions
   - Slide from right for details
   - Use smooth transitions (0.3s ease)
   - Include close button (×)
   - Support Escape key to close

2. **Card/List View Toggle** - For data display flexibility
   ```javascript
   <button onClick={() => setViewMode('cards')}>Cards</button>
   <button onClick={() => setViewMode('list')}>List</button>
   ```

3. **Filtering & Sorting** - Always provide when displaying lists
   - Text search input
   - Dropdown for sort options
   - Multi-select for filters

### Visual Design
- **Spacing**: Use consistent padding (8px, 12px, 16px, 20px, 24px)
- **Colors**: 
  - Success: `#10B981`
  - Warning: `#F59E0B`
  - Error: `#EF4444`
  - Primary: `#3B82F6`
  - Secondary: `#8B5CF6`
- **Borders**: `1px solid #E5E7EB`
- **Border Radius**: `6px` or `8px`
- **Shadows**: `boxShadow: '0 2px 8px rgba(0,0,0,0.1)'`

### Interactive Elements
- **Buttons**: Icon-only where appropriate (use ↗ for "Open")
- **Hover States**: Always provide visual feedback
- **Loading States**: Show clear loading indicators
- **Empty States**: Provide helpful messages

## Data Access Patterns

### Efficient Data Loading
```javascript
// GOOD: Batch multiple queries
const [deals, activities, accounts] = await utilities.rv.RunViews([
  {
    EntityName: 'Deals',
    OrderBy: 'CloseDate DESC',
    ResultType: 'entity_object'
  },
  {
    EntityName: 'Activities', 
    OrderBy: 'CreatedAt DESC',
    ResultType: 'entity_object'
  },
  {
    EntityName: 'Accounts',
    OrderBy: 'AccountName ASC',
    ResultType: 'entity_object'
  }
]);

// BAD: Sequential queries
const deals = await utilities.rv.RunView({...});
const activities = await utilities.rv.RunView({...});
const accounts = await utilities.rv.RunView({...});
```

### Client-Side Processing
```javascript
// GOOD: Load once, process locally
const allData = await utilities.rv.RunView({
  EntityName: 'Deals',
  ResultType: 'entity_object'
});

const filtered = allData.Results.filter(item => item.Stage === 'Won');
const sorted = filtered.sort((a, b) => b.Amount - a.Amount);

// BAD: Multiple filtered queries
const wonDeals = await utilities.rv.RunView({
  ExtraFilter: "Stage='Won'"
});
const lostDeals = await utilities.rv.RunView({
  ExtraFilter: "Stage='Lost'"
});
```

## Sub-Component Architecture

### When to Create Sub-Components
- Component exceeds 200 lines
- Repeated UI patterns
- Distinct functional areas
- Reusable visualization elements

### Sub-Component Pattern
```javascript
function MainComponent({ utilities, ...standardProps }) {
  // Main component state
  const [data, setData] = useState([]);
  
  // Sub-component definition (inside main component)
  const SubComponent = ({ item, onAction }) => (
    <div style={{ padding: '12px' }}>
      <h3>{item.name}</h3>
      <button onClick={() => onAction(item)}>Action</button>
    </div>
  );
  
  // Another sub-component
  const DetailPanel = () => {
    // Can access parent state directly
    return (
      <div>
        {data.map(item => (
          <SubComponent key={item.id} item={item} onAction={handleAction} />
        ))}
      </div>
    );
  };
  
  return (
    <div>
      <DetailPanel />
    </div>
  );
}
```

### Sub-Component Best Practices
1. Define inside parent component (access to closure)
2. Keep focused on single responsibility
3. Pass minimal props
4. Use callbacks for parent communication
5. Avoid deep nesting (max 2 levels)

## Step-by-Step Process

### 1. Plan the Component
- Define purpose and features
- Identify required entities
- Choose appropriate libraries
- Sketch UI layout

### 2. Create Specification
```bash
# Create spec file
touch metadata/components/spec/my-component.spec.json
```
- Add all required sections
- List data requirements precisely
- Document functional requirements
- Specify technical design

### 3. Implement Component
```bash
# Create code file
touch metadata/components/code/my-component.js
```
- Start with basic structure
- Add loading/error states
- Implement data loading
- Build UI incrementally
- Add interactivity

### 4. Register Component
Edit `.components.json`:
- Add new entry in fields section
- DO NOT add primaryKey or sync
- Reference spec file with @file

### 5. Test Component
- Verify data loads correctly
- Test all interactive features
- Check responsive behavior
- Validate error handling
- Test state persistence

### 6. Common Patterns to Follow

#### Currency Formatting
```javascript
const formatCurrency = (amount) => {
  if (amount >= 1000000) return `$${(amount / 1000000).toFixed(1)}M`;
  if (amount >= 1000) return `$${(amount / 1000).toFixed(0)}K`;
  return `$${amount?.toFixed(0) || 0}`;
};
```

#### Date Handling
```javascript
// Use dayjs for date operations
const formattedDate = dayjs(date).format('MMM D, YYYY');
const daysAgo = dayjs().diff(dayjs(date), 'day');
```

#### Percentage Calculations
```javascript
const percentage = total > 0 ? (value / total * 100).toFixed(1) : 0;
```

## Common Pitfalls to Avoid

1. **Don't hardcode entity names** - Use exact names from MJ metadata
2. **Don't skip error checking** - Always check result.Success
3. **Don't use inline styles excessively** - Break into sub-components
4. **Don't load data in render** - Use useEffect
5. **Don't mutate state directly** - Use setState functions
6. **Don't forget loading states** - Users need feedback
7. **Don't ignore performance** - Use memoization where appropriate
8. **Don't create unnecessary re-renders** - Batch state updates

## Debugging Tips

1. **Console Logging Pattern**:
```javascript
console.log('[ComponentName] Loading data:', { entityName, filter });
console.log('[ComponentName] Data loaded:', { 
  success: result.Success,
  count: result.Results?.length,
  error: result.ErrorMessage 
});
```

2. **Common Issues**:
- Entity name mismatch → Check exact spelling
- No data → Verify filters and permissions
- Styling issues → Check container dimensions
- State not persisting → Call onSaveUserSettings

## Summary

Creating MemberJunction components requires:
1. Proper file structure (spec + code)
2. Standard props pattern
3. Approved library usage
4. Efficient data access
5. Consistent UI/UX patterns
6. Sub-component decomposition
7. Proper error handling
8. State persistence

Follow these guidelines to create maintainable, performant, and user-friendly components that integrate seamlessly with the MemberJunction platform.