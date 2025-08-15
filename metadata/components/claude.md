# MemberJunction Interactive Components System

## Overview
The MemberJunction Interactive Components system is a sophisticated metadata-driven UI component architecture that supports both React and Angular components. Components are self-describing with complete specifications including functional requirements, data requirements, and technical implementations.

## Core Architecture

### Package Structure
- **@memberjunction/interactive-component-types**: Core type definitions and specifications
- **@memberjunction/ng-skip-chat**: Angular hosting infrastructure for React components  
- **@memberjunction/react-runtime**: React component runtime and utilities
- **React Test Harness**: Component validation and linting system

### Component Specification (ComponentSpec)
Each component is defined by a comprehensive specification:
```typescript
{
  name: string;                    // Component identifier
  location: "embedded" | "registry"; // Where component code lives
  namespace?: string;              // Registry namespace (e.g., "@memberjunction/examples")
  type: string;                    // Component type: report, dashboard, form, etc.
  code: string;                    // JavaScript/React code
  functionalRequirements: string;  // Markdown description of functionality
  dataRequirements?: ComponentDataRequirements; // Data access needs
  technicalDesign: string;         // Technical implementation details
  properties?: ComponentProperty[]; // Accepted props
  events?: ComponentEvent[];       // Emitted events
  dependencies?: ComponentSpec[];  // Child components
  libraries?: ComponentLibraryDependency[]; // 3rd party deps
}
```

### Data Requirements Pattern
Components declare their data needs explicitly:
```typescript
ComponentDataRequirements {
  mode: 'views' | 'queries' | 'hybrid';
  entities: ComponentEntityDataRequirement[];  // MJ entities to access
  queries: ComponentQueryDataRequirement[];    // Pre-defined queries
}
```

Each entity requirement specifies:
- Display fields, filter fields, sort fields
- Required permissions (read, create, update, delete)
- Field metadata with types and descriptions

## Component Patterns

### State Management
- **Full State Ownership**: Components own ALL their state
- **SavedUserSettings Pattern**: Persistent user preferences
- **No Controlled Components**: Parent never controls child state
- **Event Callbacks**: Children notify parents of changes

### Standard Props (Root Components)
Root components receive only these standard props:
- `utilities`: Data access and utility functions
- `styles`: Component styling utilities
- `components`: Registry of available child components
- `callbacks`: Event handler registry
- `savedUserSettings`: Persisted user preferences
- `onSaveUserSettings`: Callback to persist settings

### Data Access Pattern
```javascript
// Components load data internally using utilities
const result = await utilities.rv.RunView({
  EntityName: 'MJ: AI Prompt Runs',
  ExtraFilter: `RunAt >= '${startDate}'`,
  OrderBy: 'RunAt DESC',
  Fields: ['RunAt', 'Status', 'TotalTokens']
});

// Or use pre-defined queries
const queryResult = await utilities.rq.RunQuery({
  QueryName: 'AI Usage Summary',
  Parameters: { startDate, endDate }
});
```

## Angular-React Bridge

### SkipDynamicUIComponentComponent
The main Angular component that hosts React components:
- Handles multiple component options with AI ranking
- Manages component lifecycle and state
- Provides drill-down event handling
- Supports component specification viewing (functional requirements, data requirements, technical design, code)

### Integration Flow
1. Angular receives ComponentSpec with React code
2. ComponentSpec is built with dependencies using `BuildComponentCompleteCode()`
3. React component rendered via `MJReactComponent` wrapper
4. Events flow back to Angular via callbacks
5. State persisted through savedUserSettings pattern

## Component Validation (Linter)

The component linter enforces 20+ rules including:

### Critical Rules
- `no-use-reducer`: Must use useState, not useReducer
- `no-data-prop`: No generic 'data' props
- `pass-standard-props`: Child components must receive standard props
- `root-component-props-restriction`: Root components limited to standard props
- `unsafe-array-access`: Check array bounds before access
- `runview-runquery-valid-properties`: Only valid RunView/RunQuery properties

### Data Validation
- Entity names must match dataRequirements exactly
- Query names must match dataRequirements
- Fields used must be declared in dataRequirements
- No SQL functions in RunView (use RunQuery for aggregations)

## Component Registry

Components can be stored in two locations:

### Embedded Components
- Code included directly in ComponentSpec
- Self-contained with all dependencies
- Suitable for custom, one-off components

### Registry Components  
- Referenced by namespace + name
- Code loaded from external registry
- Supports versioning and sharing
- Examples: `@memberjunction/components/charts/LineChart`

## Best Practices

### Component Design
1. Single responsibility - one clear purpose
2. Declare all data requirements upfront
3. Use specific prop names (not generic 'data')
4. Implement proper error boundaries
5. Provide meaningful functional requirements

### State Management
1. Components own their state completely
2. Initialize from savedUserSettings or defaults
3. Save only important preferences, not ephemeral UI state
4. Use callbacks to notify parents of changes
5. Never sync props to state with useEffect

### Performance
1. Use useMemo for expensive operations
2. Batch data loads with RunViews (plural)
3. Client-side sorting/filtering when possible
4. Avoid reloading data for client operations
5. Implement proper React.memo where appropriate

### Data Access
1. Always use entity names from dataRequirements
2. Check result.Success before using data
3. Use ExtraFilter for WHERE clauses in RunView
4. Use RunQuery for aggregations, not RunView
5. Load all required data in useEffect on mount

## Component Files Structure

### Metadata Storage
- `/metadata/components/.components.json`: Component registry
- Individual component specs stored as properties
- Hierarchical organization by type and purpose

### Generated Components
- Angular forms: `/packages/Angular/Explorer/core-entity-forms/src/lib/generated/`
- Entity classes: `/packages/MJCoreEntities/src/generated/`
- Server APIs: `/packages/MJServer/src/generated/`

## Common Component Types

### Reports
- Display data in structured format
- Support filtering, sorting, pagination
- Export capabilities
- Drill-down navigation

### Dashboards
- Multiple visualization widgets
- Real-time data updates
- Interactive charts and graphs
- Summary statistics

### Forms
- CRUD operations on entities
- Validation based on metadata
- Foreign key dropdowns
- File upload support

### Charts
- Time series visualizations
- Aggregated data displays
- Interactive tooltips
- Multiple axis support

## Debugging Components

### Console Instrumentation
```javascript
console.log('[ComponentName] Loading data:', { 
  entityName, 
  filter: extraFilter,
  fields 
});

console.log('[ComponentName] Data loaded:', { 
  success: result.Success,
  count: result.Results?.length,
  error: result.ErrorMessage 
});
```

### Common Issues
1. **No data displayed**: Check entity names match exactly
2. **Sizing issues**: Verify container has explicit dimensions
3. **State not persisting**: Ensure onSaveUserSettings called
4. **Props undefined**: Confirm standard props passed down
5. **Events not firing**: Check callback invocation with optional chaining

## Future Enhancements

### Potential Improvements
1. Component versioning system
2. Hot module replacement for development
3. Visual component builder
4. Automated testing framework
5. Component performance profiling
6. Enhanced registry with search/discovery
7. Component marketplace/sharing
8. Version compatibility checking
9. Dependency resolution optimization
10. Runtime validation beyond linting