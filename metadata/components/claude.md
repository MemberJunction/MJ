# MemberJunction Interactive Components Development Guide

## Exemplary Component Example

### ProductRevenueMatrix - Best Practices Showcase
The `ProductRevenueMatrix` component exemplifies our best practices:
- **Modular Architecture**: Broken into 3 focused sub-components (Treemap, MatrixTable, DetailPanel)
- **Efficient Data Loading**: Uses `RunViews` for batch loading instead of multiple calls
- **Responsive Design**: Detail panel adapts from side-by-side to stacked on mobile
- **Accessibility**: Varied pastel colors in treemap for better visual distinction
- **User Settings**: Persists view preferences, date ranges, and sort options
- **Rich Interactivity**: Multiple view modes, custom date ranges, sort indicators
- **Clean Separation**: Each sub-component has single responsibility
- **Proper Schema Usage**: Correctly references MJ entities (Products, Invoice Line Items, Invoices)

See `/metadata/components/code/product-revenue-matrix.js` for implementation.

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
    "Specification": "@file:spec/main-component.spec.json"
  }
}
```

#### ⚠️ CRITICAL: Specification is the Source of Truth

**DO NOT manually update these fields in .components.json:**
- `Description`
- `FunctionalRequirements`
- `TechnicalDesign`

These fields are **automatically extracted and synced** from the component's Specification during database save operations. The `ComponentEntityExtended` class reads these values from the spec file and populates the corresponding database columns.

**To update these fields:**
1. Edit the spec file (e.g., `spec/main-component.spec.json`)
2. Update `description`, `functionalRequirements`, or `technicalDesign` in the spec
3. Run `mj-sync push` to sync changes to database
4. The fields will be automatically extracted and synced during the save operation

**Why this matters:**
- Specification is the authoritative source for component metadata
- Manual updates to these fields in .components.json will be overwritten
- Ensures consistency between spec files and database
- Makes component metadata easily queryable in database columns

### 7. Standard Component Props
Root components receive these standard props:
- `utilities`: Data access and utility functions
- `styles`: Component styling utilities
- `components`: Registry of available child components
- `callbacks`: Event handler registry (includes `OpenEntityRecord`)
- `savedUserSettings`: Persisted user preferences (read your saved prefs from here)
- `onSaveUserSettings`: Callback to persist settings (call with the full settings object)

#### 7a. Remembering user preferences (`savedUserSettings` / `onSaveUserSettings`)

These two props are a **durable, per-user, cross-device preference store** — the host
persists them automatically (via MemberJunction's `UserInfoEngine`), scoped to your
component for the signed-in user. The same user sees the same preferences on every
device and browser they sign in from. **Use them** so your component remembers how
each user left it.

What belongs here: view mode (grid/list/chart), sort column & direction, active tab,
collapsed/expanded panels, selected filters/date ranges, page size — any UI choice the
user would expect to "stick".

What does NOT belong here: transient interaction state (hover, in-flight form text
before commit), fetched data, or anything derived. Keep that in normal React state.

**The contract** — your component owns a single settings object across its lifetime:

1. **Initialize** state from `savedUserSettings` (with sensible fallbacks), never sync
   it back into state with `useEffect`.
2. When a preference changes, call `onSaveUserSettings` with the **complete** updated
   object (spread the previous settings, then override the changed key).

```javascript
function MainComponent({ savedUserSettings, onSaveUserSettings, /* ...standard props */ }) {
  const [sortBy, setSortBy] = React.useState(savedUserSettings?.sortBy ?? 'CloseDate');
  const [viewMode, setViewMode] = React.useState(savedUserSettings?.viewMode ?? 'grid');

  const handleSort = (col) => {
    setSortBy(col);
    // Persist the FULL settings object — the host saves & scopes it per user.
    onSaveUserSettings?.({ ...savedUserSettings, sortBy: col });
  };

  const handleViewMode = (mode) => {
    setViewMode(mode);
    onSaveUserSettings?.({ ...savedUserSettings, viewMode: mode });
  };
  // ...
}
```

Notes:
- You do **not** namespace keys — the host scopes the whole object to your component.
- `onSaveUserSettings` is debounced and fire-and-forget; don't await it.
- Always guard with `?.` / fallbacks: `savedUserSettings` may be `{}` on first run.
- **The host merges, never replaces.** Whatever you pass is overlaid onto the saved
  settings, so a partial object can't wipe other preferences. Still pass the full
  spread (it's the contract and keeps your intent explicit), but a forgotten spread
  degrades to a harmless no-op for the other keys instead of data loss.
- **To remove a saved key, set it explicitly to `null`** (e.g.
  `onSaveUserSettings?.({ ...savedUserSettings, sortBy: null })`). The host deletes
  it from the stored object and your `?? fallback` read picks up the default again.
  Omitting a key does NOT remove it.

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