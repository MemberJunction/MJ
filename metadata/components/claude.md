# MemberJunction Interactive Components Development Guide

## Component Architecture Rules

### 1. Favor Sub-Components Over Monolithic Components
- **Break components into sub-components** when they have distinct functional areas
- Each sub-component should have a single, clear responsibility
- Sub-components enable better reusability and AI training
- Keep components monolithic only when they are genuinely simple (< 200 lines, single purpose)

### 2. File Structure Requirements

#### Component Files
Each component requires:
- **Spec file**: `component-name.spec.json` (note the `.spec.json` suffix)
- **Code file**: `component-name.js` in the `code/` directory
- Sub-components follow pattern: `parent-name-sub-component-name.spec.json`

#### Directory Structure
```
metadata/components/
├── .components.json          # Component registry
├── spec/                     # Component specifications
│   ├── component-name.spec.json
│   └── component-name-sub.spec.json
└── code/                     # Component implementations
    ├── component-name.js
    └── component-name-sub.js
```

### 3. Component Specification Schema

#### Required Properties (all camelCase)
```json
{
  "name": "ComponentName",           // Component identifier (PascalCase)
  "location": "embedded",            // Always "embedded" for local components
  "code": "@file:../code/component-name.js",  // Path to implementation
  "description": "Clear description", // What the component does
  "category": "Category",            // Component category
  "type": "dashboard|report|chart|panel|etc",  // Component type
  "properties": [...],               // Input properties
  "events": [...],                   // Emitted events
  "usageExample": "...",            // How to use the component
  "functionalRequirements": "...",  // REQUIRED: What it should do
  "technicalDesign": "..."          // REQUIRED: How it's implemented
}
```

#### CRITICAL: functionalRequirements and technicalDesign
**These two properties are MANDATORY for ALL components and sub-components:**
- Must be defined in the spec file (camelCase: `functionalRequirements`, `technicalDesign`)
- Must be copied to .components.json (PascalCase: `FunctionalRequirements`, `TechnicalDesign`)
- Apply to both top-level components and sub-components
- Should be meaningful and specific to the component

#### Property Casing Rules
ALL property names must be **camelCase**:
- ✅ `name`, `type`, `description`, `properties`, `events`
- ✅ `usageExample`, `functionalRequirements`, `technicalDesign`
- ✅ `dataRequirements`, `dependencies`, `libraries`
- ❌ `Name`, `Type`, `Description` (incorrect - PascalCase)
- ❌ `UsageExample`, `FunctionalRequirements` (incorrect)

### 4. Sub-Component Pattern

#### Main Component Spec
```json
{
  "name": "MainComponent",
  "dependencies": [
    "@include:main-component-sub1.spec.json",
    "@include:main-component-sub2.spec.json"
  ],
  "libraries": [
    {
      "name": "libraryName",
      "version": "1.0.0",
      "globalVariable": "LibraryGlobal"
    }
  ]
}
```

#### Main Component Code
```javascript
function MainComponent({ utilities, styles, components, callbacks, savedUserSettings, onSaveUserSettings }) {
  // Load sub-components from registry
  const SubComponent1 = components['SubComponent1'];
  const SubComponent2 = components['SubComponent2'];
  
  // Use sub-components
  return (
    <div>
      <SubComponent1 {...standardProps} />
      <SubComponent2 {...standardProps} />
    </div>
  );
}
```

### 5. Library Dependencies

#### Declaring Libraries
Each component that uses external libraries must declare them in its own spec:
```json
{
  "libraries": [
    {
      "name": "dayjs",
      "version": "1.11.10",
      "globalVariable": "dayjs"  // Available as `dayjs` in component
    }
  ]
}
```

#### Important Library Rules
- Libraries are **scoped to each component's closure**
- Sub-components must declare their own library dependencies
- The `globalVariable` name becomes available directly in the component
- No need to access via `window` object
- Common libraries: dayjs, ApexCharts, Chart.js, lodash, semanticUI

### 6. Component Registration

#### Update .components.json
```json
{
  "fields": {
    "Name": "MainComponent",
    "Namespace": "Category/Type",
    "Description": "Component description",
    "Title": "Display Title",
    "Type": "Dashboard",
    "Version": "1.0.0",
    "VersionSequence": 1,
    "Status": "Published",
    "Specification": "@file:spec/main-component.spec.json",
    "FunctionalRequirements": "Copy from spec file's functionalRequirements",
    "TechnicalDesign": "Copy from spec file's technicalDesign"
  }
}
```
**Note:** FunctionalRequirements and TechnicalDesign in .components.json use PascalCase and must match the content from the spec file.

### 7. Standard Component Props
Root components receive these standard props:
- `utilities`: Data access and utility functions
- `styles`: Component styling utilities
- `components`: Registry of available child components
- `callbacks`: Event handler registry (includes `OpenEntityRecord`)
- `savedUserSettings`: Persisted user preferences
- `onSaveUserSettings`: Callback to persist settings

### 8. Data Requirements
Specify exactly what data the component needs:
```json
{
  "dataRequirements": {
    "mode": "views",
    "entities": [
      {
        "name": "EntityName",
        "displayFields": ["field1", "field2"],
        "filterFields": ["field3"],
        "sortFields": ["field4"],
        "permissions": ["read"]
      }
    ]
  }
}
```

### 9. Component Documentation Requirements

#### Required Documentation Fields
- `description`: One-line summary of what the component does
- `usageExample`: Code example showing how to use the component
- `functionalRequirements`: Bullet list of functional capabilities
- `technicalDesign`: Brief technical implementation notes

#### Property Documentation
Each property must include:
```json
{
  "name": "propertyName",
  "type": "string|number|array|object|function",
  "description": "Clear description of the property's purpose"
}
```

#### Event Documentation
Each event must include:
```json
{
  "name": "eventName",
  "description": "When this event fires",
  "parameters": [
    {
      "name": "paramName",
      "type": "paramType",
      "description": "What this parameter contains"
    }
  ]
}
```

### 10. Common Patterns

#### OpenEntityRecord Callback
```javascript
// Correct usage for opening entity records
callbacks.OpenEntityRecord('EntityName', [
  { FieldName: 'ID', Value: recordId }
]);
```

#### Date Filtering
```javascript
// Use dayjs for date operations (declare in libraries)
const startDate = dayjs().subtract(30, 'day').format('YYYY-MM-DD');
```

#### Currency Formatting
```javascript
const formatCurrency = (value) => {
  if (value >= 1000000) return `$${(value / 1000000).toFixed(1)}M`;
  if (value >= 1000) return `$${(value / 1000).toFixed(0)}K`;
  return `$${value.toFixed(0)}`;
};
```

### 11. Testing Components
Before committing:
1. Ensure all spec files use camelCase properties
2. Verify sub-components are registered in .components.json
3. Check that libraries are declared where used
4. Confirm @include references are correct
5. Test that the component loads without errors

### 12. Common Errors and Solutions

#### "Component name is missing or empty"
- Add lowercase `name` property to spec
- Add `location: "embedded"` to spec
- Add `code: "@file:../code/component.js"` to spec

#### "Library not defined"
- Add library to component's `libraries` array in spec
- Use the `globalVariable` name directly (not window.library)

#### "Component not found in registry"
- Register component in .components.json
- Ensure path in registry matches actual file location

### 13. Example: Converting Monolithic to Sub-Components

1. Identify functional areas (metrics, charts, lists, etc.)
2. Create sub-component specs with proper naming
3. Extract code into sub-component files
4. Update main component to load from registry
5. Add @include references in main spec dependencies
6. Register all components in .components.json
7. Test that everything loads correctly

### Remember
- Sub-components promote reusability
- Proper documentation helps AI understand components
- Consistent casing prevents runtime errors
- Each component is self-contained with its own dependencies
- Follow the established patterns for maintainability