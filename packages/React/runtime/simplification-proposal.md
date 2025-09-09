# Component Management Simplification Proposal

## Current State

We currently have three overlapping components that handle similar responsibilities:

### 1. **ComponentResolver** (`/registry/component-resolver.ts`)
- Resolves and loads components from various sources (embedded, local registry, external registry)
- Fetches from registries via ComponentRegistryService
- Returns compiled React component functions
- Handles dependency resolution

### 2. **ComponentRegistryService** (`/registry/component-registry-service.ts`)
- Middle layer between resolver and registries
- Fetches from external registries
- Compiles components
- Manages caching
- Registers in ComponentRegistry

### 3. **ComponentHierarchyRegistrar** (`/runtime/component-hierarchy.ts`)
- Compiles component hierarchies
- Registers in ComponentRegistry
- Manages library loading
- Now also fetches from external registries (after recent changes)

## The Problem

All three components essentially do the same things:
1. Fetch from external registries
2. Compile component code
3. Register in ComponentRegistry
4. Handle component hierarchies/dependencies
5. Deal with libraries

The only real differences are:
- Return types (components vs registration results)
- Level of indirection
- API style

This creates confusion about which component to use and leads to duplicate code and functionality.

## Proposed Solutions

### Option 1: Single Component Manager (Recommended)

Merge everything into one component that handles all component operations:

```typescript
class ComponentManager {
  constructor(
    private compiler: ComponentCompiler,
    private registry: ComponentRegistry,
    private runtimeContext: RuntimeContext
  ) {}

  async process(spec: ComponentSpec, options: ProcessOptions): Promise<ProcessResult> {
    // One method that can:
    // - Fetch from registries if needed
    // - Compile if needed
    // - Cache compiled components
    // - Register if requested
    // - Return what you ask for
  }
}

interface ProcessOptions {
  fetch?: boolean;          // Fetch from registries
  compile?: boolean;        // Compile the code
  register?: boolean;       // Register in registry
  returnType?: 'components' | 'result' | 'spec' | 'all';
  contextUser?: UserInfo;
}

interface ProcessResult {
  success: boolean;
  spec?: ComponentSpec;        // Fully resolved spec
  components?: Record<string, any>;  // Compiled components
  registeredComponents?: string[];   // Names of registered components
  errors?: any[];
}
```

**Benefits:**
- Single, clear API
- No confusion about which component to use
- Eliminates duplicate code
- Flexible options for different use cases

### Option 2: Clear Separation of Concerns

Have three focused components with single responsibilities:

```typescript
// Only fetches specs from various sources
class ComponentFetcher {
  async fetch(spec: ComponentSpec): Promise<ComponentSpec> { }
}

// Only compiles specs into components
class ComponentCompiler {
  async compile(spec: ComponentSpec): Promise<CompiledComponent> { }
}

// Only stores/retrieves compiled components
class ComponentRegistry {
  register(component: CompiledComponent): void { }
  get(name: string): CompiledComponent | null { }
}

// Orchestrator that uses them
class ComponentOrchestrator {
  async processComponent(spec: ComponentSpec) {
    const fullSpec = await this.fetcher.fetch(spec);
    const compiled = await this.compiler.compile(fullSpec);
    await this.registry.register(compiled);
    return { spec: fullSpec, component: compiled };
  }
}
```

**Benefits:**
- Clear separation of concerns
- Each component has one job
- Easy to test and understand
- Composable

### Option 3: Clarify Current Roles

Keep the current structure but remove overlapping functionality:
- **ComponentResolver**: Only for finding/loading existing components
- **ComponentHierarchyRegistrar**: Only for registering new components
- **ComponentRegistryService**: Internal service for registry operations

**Benefits:**
- Minimal changes to existing code
- Preserves current API

**Drawbacks:**
- Still has overlap
- Unclear when to use which

## Migration Path

If we choose Option 1 (recommended):

1. Create new ComponentManager class
2. Move shared logic into it
3. Deprecate but keep existing classes as thin wrappers
4. Update consumers gradually
5. Remove deprecated classes in next major version

## Usage Example

With the new ComponentManager:

```typescript
// Angular wrapper usage
const manager = new ComponentManager(compiler, registry, runtimeContext);

const result = await manager.process(this.component, {
  fetch: true,      // Fetch from external registry if needed
  compile: true,    // Compile the code
  register: true,   // Register in runtime registry
  returnType: 'all' // Get everything back
});

this.resolvedComponentSpec = result.spec;
this.compiledComponent = result.components[this.component.name];
```

## Decision Criteria

We should choose based on:
1. **Simplicity**: Which approach is easiest to understand and use?
2. **Maintainability**: Which will be easiest to maintain long-term?
3. **Performance**: Which approach minimizes duplicate work?
4. **Flexibility**: Which approach handles all current and future use cases?

## Recommendation

**Option 1 (Single Component Manager)** is recommended because:
- It eliminates confusion about which component to use
- It prevents duplicate fetching/compilation
- It provides a single, flexible API
- It's easier to optimize (single cache, single fetch)
- It's easier to document and understand

The current separation isn't providing real value since all components do similar things. A unified approach would be cleaner and more maintainable.