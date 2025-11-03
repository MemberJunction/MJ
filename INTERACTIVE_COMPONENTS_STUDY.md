# Interactive Components System - Comprehensive Study

## Executive Summary

MemberJunction has a sophisticated **Interactive Components** system that provides a declarative, specification-driven approach to building dynamic UI components. The system is designed to support reports, dashboards, forms, and other interactive elements that can be:

1. **Defined as specifications** (metadata + code) 
2. **Registered locally or in external registries**
3. **Compiled at runtime** using Babel/React transpilation
4. **Loaded and rendered** in both Angular and React contexts
5. **Managed with dependency resolution** and caching

This system enables AI agents to understand component requirements, generates component options, and allows components to be seamlessly integrated across the application.

---

## 1. COMPONENT SPECIFICATION SYSTEM

### 1.1 Core Concept: ComponentSpec

**Location**: `packages/InteractiveComponents/src/component-spec.ts`

The `ComponentSpec` is the **foundational abstraction** that describes a complete interactive component:

```typescript
class ComponentSpec {
  // Identity
  name: string;
  
  // Location (where the component is stored)
  location: "embedded" | "registry";  // "embedded" = code included, "registry" = external
  registry?: string;                   // External registry name (e.g., "MJ", "Skip")
  namespace?: string;                  // Hierarchical path (e.g., "crm/analytics/accounts")
  version?: string;                    // Semantic version (e.g., "1.0.0", "^1.0.0")
  
  // Documentation
  title: string;                       // User-friendly name
  description: string;                 // End-user friendly description
  type: "report" | "dashboard" | "form" | "table" | "chart" | "navigation" | string;
  functionalRequirements: string;      // Markdown: what it does, business rules, UX
  technicalDesign: string;             // Markdown: technical explanation
  exampleUsage: string;                // JSX example showing usage
  
  // Implementation
  code: string;                        // JavaScript/React code
  
  // Dependencies
  dependencies?: ComponentSpec[];      // Other components this depends on
  libraries?: ComponentLibraryDependency[];  // 3rd party libraries (recharts, lodash, etc.)
  
  // Data & Metadata
  dataRequirements?: ComponentDataRequirements;  // What entities/queries it needs
  methods?: ComponentMethodInfo;       // Methods it exposes (print, refresh, validate, etc.)
  events?: ComponentEvent[];           // Events it emits
  properties?: ComponentProperty[];    // Props it accepts
  
  // Advanced Features
  createNewVersion?: boolean;          // Flag to indicate version creation
  selectionReasoning?: string;         // Why this component was selected
  relevantExamples?: ComponentExample[];  // Inspiring examples for AI
}
```

### 1.2 Data Requirements Specification

**Location**: `packages/InteractiveComponents/src/data-requirements.ts`

Describes exactly what data a component needs:

```typescript
interface ComponentDataRequirements {
  mode: 'views' | 'queries' | 'hybrid';
  
  entities: ComponentEntityDataRequirement[];  // MJ entities (e.g., "Accounts", "Users")
  queries: ComponentQueryDataRequirement[];    // Stored queries
}

type ComponentEntityDataRequirement = {
  name: string;                      // Entity name from metadata
  displayFields: string[];           // Fields to show
  filterFields?: string[];           // Fields available for filtering
  sortFields?: string[];             // Fields available for sorting
  fieldMetadata: SimpleEntityFieldInfo[];  // Detailed field info
  permissionLevelNeeded: ('read' | 'create' | 'update' | 'delete')[];
}

type ComponentQueryDataRequirement = {
  name: string;
  categoryPath: string;              // Full category path (e.g., "Membership/Users/ActiveUsers")
  fields: SimpleEntityFieldInfo[];   // Fields the component uses
  parameters?: ComponentQueryParameterValue[];  // Query parameters
}
```

### 1.3 Library Dependencies

**Location**: `packages/InteractiveComponents/src/library-dependency.ts`

How components declare 3rd party library usage:

```typescript
interface ComponentLibraryDependency {
  name: string;              // Library name (e.g., "recharts", "@memberjunction/ui-lib")
  globalVariable: string;    // Global variable to access it (e.g., "Recharts")
  version?: string;          // Semantic version (e.g., "^2.5.0")
}
```

### 1.4 Component Interface Definition

**Location**: `packages/InteractiveComponents/src/runtime-types.ts`

Components define their API through properties, events, and methods:

```typescript
interface ComponentProperty {
  name: string;
  description: string;
  type: 'string' | 'number' | 'boolean' | 'object' | 'array' | 'function' | 'any';
  required: boolean;
  defaultValue?: any;
  possibleValues?: string[];
}

interface ComponentEvent {
  name: string;
  description: string;
  parameters?: ComponentEventParameter[];
}

interface ComponentMethodInfo {
  standardMethodsSupported: {
    print?: boolean;
    refresh?: boolean;
    getCurrentDataState?: boolean;
    validate?: boolean;
    isDirty?: boolean;
    reset?: boolean;
    scrollTo?: boolean;
    focus?: boolean;
  }
  customMethods: CustomComponentMethod[];
}
```

---

## 2. RUNTIME ENVIRONMENT & UTILITIES

### 2.1 Component Utilities Interface

**Location**: `packages/InteractiveComponents/src/shared.ts`

What every component gets when it runs:

```typescript
interface ComponentUtilities {
  md: SimpleMetadata;        // Access entity metadata and create entity objects
  rv: SimpleRunView;         // Run MJ views to fetch data
  rq: SimpleRunQuery;        // Run stored queries
  ai?: SimpleAITools;        // AI capabilities (prompt execution, embeddings, vector search)
}

interface SimpleRunView {
  RunView: (params: RunViewParams) => Promise<RunViewResult>;
  RunViews: (params: RunViewParams[]) => Promise<RunViewResult[]>;  // Batch operation
}

interface SimpleAITools {
  ExecutePrompt: (params: SimpleExecutePromptParams) => Promise<SimpleExecutePromptResult>;
  EmbedText: (params: SimpleEmbedTextParams) => Promise<SimpleEmbedTextResult>;
  VectorService: SimpleVectorService;  // Vector operations (KNN, similarity)
}
```

### 2.2 Component Callbacks

**Location**: `packages/InteractiveComponents/src/runtime-types.ts`

How components communicate back to the parent container:

```typescript
interface ComponentCallbacks {
  // When component wants to open an entity record
  OpenEntityRecord: (entityName: string, key: CompositeKey) => void;
  
  // Display notifications
  CreateSimpleNotification: (message: string, style: "success" | "error" | "warning" | "info") => void;
  
  // Register methods that parent can call
  RegisterMethod: (methodName: string, handler: Function) => void;
}
```

### 2.3 Component Styles

**Location**: `packages/InteractiveComponents/src/runtime-types.ts`

Standardized design system passed to components:

```typescript
interface ComponentStyles {
  colors: {
    primary, primaryHover, primaryLight,
    secondary, secondaryHover,
    success, successLight, warning, warningLight, error, errorLight, info,
    background, surface, surfaceHover,
    text, textSecondary, textTertiary, textInverse,
    border, borderLight, borderFocus,
    shadow, shadowMedium, shadowLarge
  };
  spacing: { xs, sm, md, lg, xl, xxl, xxxl };
  typography: { fontFamily, fontSize: {...}, fontWeight: {...}, lineHeight: {...} };
  borders: { radius: {...}, width: {...} };
  shadows: { sm, md, lg, xl, inner };
  transitions: { fast, normal, slow };
  overflow: string;
}
```

---

## 3. REACT RUNTIME - COMPILATION & EXECUTION

### 3.1 Architecture Overview

```
ComponentSpec (code + metadata)
    ↓
ComponentCompiler (transpile JSX → JavaScript)
    ↓
ComponentFactory (creates ComponentObject)
    ↓
ComponentRegistry (stores compiled components)
    ↓
ReactRootManager (renders to DOM)
```

### 3.2 Component Compiler

**Location**: `packages/React/runtime/src/compiler/component-compiler.ts`

Transforms React component code at runtime:

```typescript
class ComponentCompiler {
  async compile(options: CompileOptions): Promise<CompilationResult> {
    // 1. Load required libraries from library registry
    const loadedLibraries = await this.loadRequiredLibraries(options.libraries);
    
    // 2. Wrap component code in factory function
    const wrappedCode = this.wrapComponentCode(code, componentName, libraries);
    
    // 3. Transpile with Babel (JSX → JavaScript)
    const transpiledCode = this.babelInstance.transform(wrappedCode, {
      presets: ['react'],
      plugins: [...],
      filename: `${componentName}.jsx`
    });
    
    // 4. Create factory function that returns ComponentObject
    const factory = (runtimeContext, styles, components) => {
      // Execute transpiled code and return ComponentObject
    };
    
    // 5. Return compiled component
    return { success: true, component: { factory, id, name, ... } };
  }
}
```

### 3.3 Component Factory Pattern

Components are created from a factory function:

```typescript
// Inside compiled component's factory function:
export function createComponent(runtimeContext, styles, components) {
  // runtimeContext contains: React, ReactDOM, libraries
  // styles: ComponentStyles
  // components: { DependencyComponentName: DependencyComponent }
  
  return {
    component: function MyComponentFunction(props) {
      // props = {
      //   utilities: { md, rv, rq, ai },
      //   callbacks: { OpenEntityRecord, CreateSimpleNotification, RegisterMethod },
      //   components: { DependencyNames: DependencyComponents },
      //   styles: ComponentStyles,
      //   libraries: { libName: libInstance },
      //   savedUserSettings: {},
      //   onSaveUserSettings: function
      // }
      
      return <JSX>...</JSX>;
    },
    
    // Optional methods
    print?: () => void,
    refresh?: () => void,
    getCurrentDataState?: () => any,
    validate?: () => boolean | { valid: boolean; errors?: string[] },
    isDirty?: () => boolean,
    reset?: () => void,
    scrollTo?: (target) => void,
    focus?: (target?) => void,
    invokeMethod?: (methodName, ...args) => any,
    hasMethod?: (methodName) => boolean
  };
}
```

### 3.4 Component Registry

**Location**: `packages/React/runtime/src/registry/component-registry.ts`

Stores compiled components with namespace isolation:

```typescript
class ComponentRegistry {
  register(name: string, component: ComponentObject, 
           namespace: string = 'Global', version: string = 'v1') {
    // Stores with key: "namespace::name@version"
    // Tracks: lastAccessed, refCount, metadata
  }
  
  get(name: string, namespace: string, version?: string): ComponentObject;
  has(name: string, namespace: string, version?: string): boolean;
  getNamespace(namespace: string): ComponentMetadata[];
  cleanup(): number;  // Remove unused components
  getStats(): { totalComponents, namespaces, totalRefCount, ... };
}
```

---

## 4. UNIFIED COMPONENT MANAGER

### 4.1 Overview

**Location**: `packages/React/runtime/src/component-manager/component-manager.ts`

The `ComponentManager` is the **new unified system** that handles the complete component lifecycle:

```typescript
class ComponentManager {
  async loadComponent(spec: ComponentSpec, options: LoadOptions): Promise<LoadResult>;
  async loadHierarchy(rootSpec: ComponentSpec, options: LoadOptions): Promise<HierarchyResult>;
}
```

### 4.2 Loading Flow

The ComponentManager handles:

1. **Fetch Phase**: Get full spec from registry if needed
   - For local registry (registry=undefined): Looks in ComponentMetadataEngine
   - For external registry: Uses GraphQL to fetch from remote registry

2. **Compile Phase**: Convert code to executable component
   - Uses ComponentCompiler with Babel
   - Loads all required libraries

3. **Register Phase**: Store in ComponentRegistry
   - Enables reuse and caching

4. **Dependency Resolution**: Recursively load dependencies
   - Batches dependency loading for efficiency
   - Prevents circular dependencies

### 4.3 Smart Caching

```typescript
// Component caching
- fetchCache: Map<componentKey, { spec, fetchedAt, hash, usageNotified }>
- Cache TTL: 1 hour (configurable)
- Supports forceRefresh for cache busting

// Registry notifications
- Tracks which registry components have been notified (once per session)
- Only for usage/licensing purposes
```

### 4.4 Configuration

```typescript
interface ComponentManagerConfig {
  debug?: boolean;                      // Enable detailed logging
  maxCacheSize?: number;                // LRU cache size (default: 100)
  cacheTTL?: number;                    // Cache time-to-live in ms (default: 1 hour)
  enableUsageTracking?: boolean;        // Track registry usage (default: true)
  dependencyBatchSize?: number;         // Dependencies loaded in batches (default: 5)
  fetchTimeout?: number;                // Fetch timeout in ms (default: 30s)
}
```

---

## 5. ANGULAR WRAPPER - THE BRIDGE

### 5.1 MJReactComponent

**Location**: `packages/Angular/Generic/react/src/lib/components/mj-react-component.component.ts`

The main Angular component that hosts React components:

```typescript
@Component({
  selector: 'mj-react-component',
  template: '<div #container></div>'
})
export class MJReactComponent implements AfterViewInit, OnDestroy {
  @Input() component: ComponentSpec;
  @Input() utilities?: ComponentUtilities;
  @Input() styles?: ComponentStyles;
  @Input() savedUserSettings?: any;
  @Input() useComponentManager: boolean = true;  // Use new manager by default
  @Input() enableLogging: boolean = false;
  
  @Output() stateChange = new EventEmitter<StateChangeEvent>();
  @Output() componentEvent = new EventEmitter<ReactComponentEvent>();
  @Output() openEntityRecord = new EventEmitter<{ entityName, key }>();
  @Output() userSettingsChanged = new EventEmitter<UserSettingsChangedEvent>();
  
  // Public methods
  getCurrentDataState(): any;
  validate(): boolean | { valid, errors };
  isDirty(): boolean;
  reset(): void;
  refresh(): void;
  print(): void;
  invokeMethod(methodName: string, ...args: any[]): any;
  
  // Public properties
  resolvedComponentSpec: ComponentSpec | null;  // Full spec after loading
}
```

### 5.2 Initialization Flow

```
ngAfterViewInit()
    ↓
Ensure React is loaded (ReactBridgeService)
    ↓
Wait for React to be ready
    ↓
Load component (via ComponentManager)
    ↓
Create React root in container
    ↓
Render component (with utilities, callbacks, styles, libraries)
```

### 5.3 Component Loading

Two paths (legacy vs new):

```typescript
// NEW (recommended):
if (this.useComponentManager) {
  await this.loadComponentWithManager();
  // Uses ComponentManager for complete lifecycle
}

// LEGACY (deprecated):
else {
  await this.registerComponentHierarchy();
  // Uses ComponentHierarchyRegistrar
}
```

---

## 6. DATA FLOW PATTERNS

### 6.1 Props Flow to React Components

```
Angular (MJReactComponent)
    ↓
Props object:
{
  utilities: { md, rv, rq, ai },
  callbacks: { OpenEntityRecord, CreateSimpleNotification, RegisterMethod },
  components: { ...dependencyComponents },
  styles: ComponentStyles,
  libraries: { libName: libInstance },
  savedUserSettings: {...},
  onSaveUserSettings: function
}
    ↓
React Component Function
    ↓
Return JSX
    ↓
ReactDOM.render()
    ↓
DOM Updates
```

### 6.2 Event Flow from React to Angular

```
React Component
    ↓
Calls: callbacks.OpenEntityRecord(entityName, key)
    ↓
Angular MJReactComponent
    ↓
@Output() openEntityRecord.emit({ entityName, key })
    ↓
Parent Angular Component (handles navigation)
```

### 6.3 Data Loading Pattern

```
React Component
    ↓
useEffect(() => {
  utilities.rv.RunViews([...])  // Batch multiple views
  .then(results => setState(results))
})
    ↓
Display results in component UI
```

---

## 7. CURRENT USAGE EXAMPLES

### 7.1 Reports/Analytics

**SkipDynamicUIComponent** (`skip-dynamic-ui-component.ts`):
- Takes multiple `ComponentOption` objects
- User selects which report option to render
- Renders via `MJReactComponent`
- Handles state, callbacks, and event emission

**Key Pattern**:
```typescript
// Build complete code from spec
const code = BuildComponentCompleteCode(componentOption.option);

// Render in Angular
<mj-react-component 
  [component]="componentSpec"
  [utilities]="utilities"
  [styles]="componentStyles"
  (openEntityRecord)="onOpenEntity($event)"
  (componentEvent)="onComponentEvent($event)">
</mj-react-component>
```

### 7.2 Component Studio

**ComponentStudio** (`component-studio-dashboard.component.ts`):
- Interface for creating/editing components
- Uses text import and artifact loading
- Lets architects design new components
- Tests components before deployment

---

## 8. KEY ARCHITECTURAL PRINCIPLES

### 8.1 Specification-Driven Design

Everything flows from the `ComponentSpec`:
- Code generation knows what code to generate
- AI agents understand requirements
- Registries can validate completeness
- Dependencies are explicit

### 8.2 Location-Independent Loading

```
location === 'embedded'
  ↓ Code is in spec
  ↓ No fetch needed

location === 'registry' AND registry === undefined
  ↓ Local component
  ↓ Fetch from ComponentMetadataEngine

location === 'registry' AND registry === 'MJ'
  ↓ External component
  ↓ Fetch from GraphQL registry
```

### 8.3 Dependency Graph Management

- Components declare dependencies explicitly
- Manager loads them recursively
- Circular dependencies detected and prevented
- Dependencies batched for efficiency

### 8.4 Library Isolation

- Libraries loaded once, reused across components
- Global variables prevent namespace pollution
- Factory wrapper provides isolation
- Libraries can be swapped at runtime

---

## 9. EXTENSION POINTS FOR FORMS

### 9.1 Form Component Specification

Forms would use the same `ComponentSpec` but with form-specific properties:

```typescript
const formSpec: ComponentSpec = {
  name: 'UserForm',
  type: 'form',  // New type
  
  properties: [
    { name: 'record', type: 'object', required: true, description: 'Record to edit' },
    { name: 'mode', type: 'string', required: true, possibleValues: ['create', 'edit', 'view'] },
    { name: 'autoSave', type: 'boolean', required: false, defaultValue: false }
  ],
  
  events: [
    { name: 'save', description: 'Fired when user saves' },
    { name: 'cancel', description: 'Fired when user cancels' },
    { name: 'fieldChange', description: 'Fired when a field changes' }
  ],
  
  methods: {
    standardMethodsSupported: {
      validate: true,
      isDirty: true,
      reset: true,
      focus: true
    },
    customMethods: [
      { name: 'submitForm', parameters: [], returnType: 'Promise<any>' }
    ]
  }
};
```

### 9.2 Form Data Requirements

Forms declare what entities/fields they need:

```typescript
dataRequirements: {
  mode: 'views',
  entities: [
    {
      name: 'Users',
      displayFields: ['ID', 'FirstName', 'LastName', 'Email'],
      filterFields: ['ID'],
      fieldMetadata: [...]
    }
  ]
}
```

### 9.3 Form Component Object Interface

Forms implement additional methods:

```typescript
interface FormComponentObject extends ComponentObject {
  // Standard methods
  validate: () => boolean | { valid, errors };
  isDirty: () => boolean;
  reset: () => void;
  
  // Form-specific
  setRecord: (record: any) => void;
  getRecord: () => any;
  setMode: (mode: 'create' | 'edit' | 'view') => void;
  getErrors: () => Record<string, string[]>;
}
```

---

## 10. SUMMARY TABLE

| Component | Purpose | Location |
|-----------|---------|----------|
| **ComponentSpec** | Declarative component definition | interactive-component-types |
| **ComponentManager** | Unified component lifecycle (fetch, compile, register, load deps) | react-runtime |
| **ComponentCompiler** | Transpile React code with Babel | react-runtime |
| **ComponentRegistry** | Store compiled components with namespace isolation | react-runtime |
| **MJReactComponent** | Angular wrapper to host React components | ng-react |
| **ReactBridgeService** | Manage React lifecycle in Angular context | ng-react |
| **AngularAdapterService** | Create runtime context with React, Babel, libraries | ng-react |

---

## 11. BEST PRACTICES

1. **Always use ComponentSpec** - Don't create components without a spec
2. **Declare data requirements** - Be explicit about entities and queries needed
3. **Use utilities** - Access metadata via `md`, data via `rv`/`rq`, AI via `ai`
4. **Batch operations** - Use `RunViews` instead of multiple `RunView` calls
5. **Handle permissions** - Check `dataRequirements.permissionLevelNeeded`
6. **Test with test harness** - Validate components before deployment
7. **Use SavedUserSettings pattern** - Let users customize components
8. **Emit events** - Use callbacks to communicate with parent
9. **Expose methods** - Implement methods for parent to call
10. **Document everything** - Complete specs with functional + technical docs

