# Unified Component Manager Proposal - FINAL

## Executive Summary

Consolidate three overlapping components (ComponentResolver, ComponentRegistryService, ComponentHierarchyRegistrar) into a single, efficient ComponentManager that eliminates duplicate fetching/compilation while maintaining registry usage tracking for licensing compliance.

## Current Problems

### 1. **Architectural Confusion**
- Three components doing essentially the same work with slightly different APIs
- Unclear which to use when
- Maintenance burden of keeping three similar components in sync

### 2. **Critical Performance Issue: Double Fetching & Compilation**
Currently, EVERY component is fetched and compiled TWICE:

```
CURRENT FLOW:
1. Angular calls ComponentHierarchyRegistrar.registerHierarchy()
   → Fetches from registry
   → Compiles component
   → Stores in ComponentRegistry

2. Angular calls ComponentResolver.resolveComponents()  
   → Fetches from registry AGAIN (doesn't check ComponentRegistry first!)
   → Compiles component AGAIN
   → Returns to Angular

Result: 2X network calls, 2X compilation for every component!
```

### 3. **Registry Usage Tracking Requirement**
- Need to notify registry of component usage for licensing
- Currently happens twice (inefficient)
- Should happen exactly once per component load

## Proposed Solution: Unified ComponentManager

### Core Design

```typescript
/**
 * Unified component management system that handles all component operations
 * efficiently with proper caching and registry tracking.
 */
class ComponentManager {
  private registry: ComponentRegistry;
  private compiler: ComponentCompiler;
  private runtimeContext: RuntimeContext;
  private fetchCache: Map<string, ComponentSpec>; // In-memory cache for current session
  private registryNotifications: Set<string>; // Track what we've notified this session
  
  constructor(
    compiler: ComponentCompiler,
    registry: ComponentRegistry,
    runtimeContext: RuntimeContext
  ) {
    this.compiler = compiler;
    this.registry = registry;
    this.runtimeContext = runtimeContext;
    this.fetchCache = new Map();
    this.registryNotifications = new Set();
  }

  /**
   * Main entry point - intelligently handles all component operations
   */
  async loadComponent(
    spec: ComponentSpec,
    options: LoadOptions
  ): Promise<LoadResult> {
    const componentKey = this.getComponentKey(spec);
    
    // STEP 1: Check if already loaded in ComponentRegistry
    const existing = this.registry.get(spec.name, spec.namespace, spec.version);
    if (existing && !options.forceRefresh) {
      // Component already loaded and compiled
      await this.notifyRegistryUsageIfNeeded(spec, componentKey);
      return {
        success: true,
        component: existing,
        spec: this.fetchCache.get(componentKey) || spec,
        fromCache: true
      };
    }
    
    // STEP 2: Fetch full spec if needed
    let fullSpec = spec;
    if (this.needsFetch(spec)) {
      fullSpec = await this.fetchComponentSpec(spec, options.contextUser);
      this.fetchCache.set(componentKey, fullSpec);
    }
    
    // STEP 3: Notify registry of usage (exactly once per session)
    await this.notifyRegistryUsageIfNeeded(fullSpec, componentKey);
    
    // STEP 4: Compile if needed
    let compiledComponent = existing;
    if (!compiledComponent || options.forceRecompile) {
      compiledComponent = await this.compileComponent(fullSpec, options);
    }
    
    // STEP 5: Register in ComponentRegistry
    if (!existing || options.forceRefresh) {
      this.registry.register(
        fullSpec.name,
        compiledComponent,
        fullSpec.namespace || 'Global',
        fullSpec.version || 'latest'
      );
    }
    
    // STEP 6: Process dependencies recursively
    if (fullSpec.dependencies) {
      for (const dep of fullSpec.dependencies) {
        await this.loadComponent(dep, { ...options, isDependent: true });
      }
    }
    
    return {
      success: true,
      component: compiledComponent,
      spec: fullSpec,
      fromCache: false
    };
  }
  
  /**
   * Load a complete hierarchy efficiently
   */
  async loadHierarchy(
    rootSpec: ComponentSpec,
    options: LoadOptions
  ): Promise<HierarchyResult> {
    const loaded: string[] = [];
    const errors: any[] = [];
    
    // Use depth-first traversal to load dependencies first
    const result = await this.loadComponentRecursive(rootSpec, options, loaded, errors);
    
    return {
      success: errors.length === 0,
      rootComponent: result.component,
      resolvedSpec: result.spec,
      loadedComponents: loaded,
      errors
    };
  }
  
  /**
   * Notify registry of component usage (for licensing)
   * Only happens once per component per session
   */
  private async notifyRegistryUsageIfNeeded(
    spec: ComponentSpec,
    componentKey: string
  ): Promise<void> {
    if (!spec.registry) return; // Only for external registry components
    
    const notificationKey = `${spec.registry}:${componentKey}`;
    if (this.registryNotifications.has(notificationKey)) {
      return; // Already notified this session
    }
    
    try {
      // Make lightweight usage notification call to registry
      await this.notifyRegistryUsage(spec);
      this.registryNotifications.add(notificationKey);
    } catch (error) {
      // Log but don't fail - usage tracking shouldn't break component loading
      console.warn(`Failed to notify registry usage for ${componentKey}:`, error);
    }
  }
  
  private needsFetch(spec: ComponentSpec): boolean {
    // Need to fetch if:
    // 1. It's a registry component without code
    // 2. It's missing required fields (libraries, dependencies, etc.)
    return spec.location === 'registry' && !spec.code;
  }
  
  private getComponentKey(spec: ComponentSpec): string {
    return `${spec.registry || 'local'}:${spec.namespace || 'Global'}:${spec.name}:${spec.version || 'latest'}`;
  }
}
```

### Load Options

```typescript
interface LoadOptions {
  contextUser?: UserInfo;      // User context for fetching
  forceRefresh?: boolean;      // Force re-fetch from registry
  forceRecompile?: boolean;    // Force recompilation
  isDependent?: boolean;       // Is this a dependency (for tracking)
  returnType?: 'component' | 'spec' | 'both';
  trackUsage?: boolean;        // Enable usage tracking (default: true)
}

interface LoadResult {
  success: boolean;
  component?: ComponentObject;
  spec?: ComponentSpec;
  fromCache: boolean;
  errors?: any[];
}
```

## Implementation Plan

### Phase 1: Create ComponentManager (Week 1)
1. Implement core ComponentManager class
2. Add intelligent caching logic
3. Implement registry usage notification
4. Add comprehensive logging for debugging

### Phase 2: Update Angular Wrapper (Week 1)
```typescript
// Simplified Angular wrapper
async ngOnInit() {
  const manager = this.adapter.getComponentManager();
  
  // Single call to load everything
  const result = await manager.loadHierarchy(this.component, {
    contextUser: Metadata.Provider.CurrentUser,
    returnType: 'both'
  });
  
  if (result.success) {
    this.resolvedComponentSpec = result.resolvedSpec;
    this.compiledComponent = result.rootComponent;
    // Render...
  }
}
```

### Phase 3: Deprecate Old Components (Week 2)
1. Mark ComponentResolver, ComponentRegistryService, ComponentHierarchyRegistrar as @deprecated
2. Update them to be thin wrappers around ComponentManager
3. Maintain backward compatibility

### Phase 4: Migration & Testing (Week 2-3)
1. Update all consumers to use ComponentManager
2. Comprehensive testing with external registry components
3. Performance benchmarking to verify improvements

## Benefits

### 1. **Performance Improvements**
- **50% reduction** in registry fetches (from 2N to N)
- **50% reduction** in compilation operations
- Single registry notification per component (licensing compliance)
- Intelligent caching prevents redundant work

### 2. **Architectural Simplification**
- Single API to learn and use
- Clear, predictable behavior
- Easier to debug (single path through code)
- Reduced maintenance burden

### 3. **Better Registry Integration**
- Proper usage tracking for licensing
- Efficient caching with registry hash support
- Clean separation between local and external components

### 4. **Developer Experience**
- Simple API: just call `loadComponent()` or `loadHierarchy()`
- Clear options for control when needed
- Better error messages and debugging

## Migration Examples

### Before (Complex, Duplicate Work)
```typescript
// Angular wrapper had to:
1. Call ComponentHierarchyRegistrar.registerHierarchy() // First fetch & compile
2. Call ComponentResolver.resolveComponents()           // Second fetch & compile
3. Manage the resolved spec manually
4. Deal with potential inconsistencies
```

### After (Simple, Efficient)
```typescript
// Angular wrapper just:
const result = await manager.loadHierarchy(spec, options);
// Done! Component loaded, compiled, cached, and registry notified once
```

## Metrics for Success

1. **Performance**: 50% reduction in network calls and compilation time
2. **Code Reduction**: ~40% less code to maintain (estimate: 800+ lines removed)
3. **Developer Satisfaction**: Simpler API, fewer bugs
4. **Registry Compliance**: Exactly one usage notification per component load

## Risks & Mitigations

| Risk | Mitigation |
|------|------------|
| Breaking existing code | Deprecation period with backward compatibility wrappers |
| Cache invalidation issues | Use registry-provided hashes for cache validation |
| Complex migration | Phased approach, comprehensive testing |
| Registry notification failures | Graceful degradation - log but don't fail |

## Decision Required

**Approve implementation of unified ComponentManager?**

This will:
- Fix the critical double-fetch/compile performance issue
- Simplify the architecture significantly  
- Maintain registry usage tracking for licensing
- Provide a cleaner API for all consumers

**Recommended: YES** - The benefits far outweigh the migration effort.