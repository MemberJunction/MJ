# MemberJunction Data Loading Optimization Plan

## Overview

This document outlines the optimization strategy for MemberJunction's data loading architecture. The goal is to provide visibility into engine usage, detect redundant loading across engines, and streamline the developer experience when working with BaseEngine subclasses.

## Current State Analysis

### BaseEngine Architecture

The `BaseEngine<T>` class ([baseEngine.ts:86](packages/MJCore/src/generic/baseEngine.ts#L86)) provides:

- **Singleton pattern** via `BaseSingleton<T>`
- **Declarative configuration** via `BaseEnginePropertyConfig` specifying entities/datasets to load
- **Automatic batching** via `LoadMultipleEntityConfigs()` using `RunViews()` for parallel execution
- **Auto-refresh** via MJGlobal event listening with debouncing (default 5 seconds)
- **Expiration timers** for automatic cache invalidation
- **Provider-aware** multi-instance support

### Current Pain Points

1. **No cross-engine visibility** - No way to detect when multiple engines load the same entity data
2. **Repetitive boilerplate** - Every usage requires `await Engine.Instance.Config(false, contextUser)`
3. **No visibility** - No way to see what engines exist, their memory footprint, or loading status
4. **Tree-shaking prevention hacks** - Empty `Load_*` functions scattered throughout the codebase

### Metadata Architecture (Reference)

The `Metadata` class uses a highly optimized pattern we should learn from:

- Pre-defined `MJ_Metadata` dataset loaded in single round trip
- IndexedDB caching with timestamp-based staleness detection
- ~500ms bootstrap time for core data
- Uses `*Info` classes (EntityInfo, EntityFieldInfo, etc.) rather than BaseEntity subclasses
- This is intentional - MJCore cannot depend on MJCoreEntities

---

## Implemented Components

### 1. BaseEngineRegistry

A central singleton that tracks all BaseEngine instances in the application.

#### Purpose

- Provide visibility into all active engines
- Track memory usage and loading statistics
- Track which entities each engine loads
- **Detect and warn about redundant entity loading across engines**

#### Interface

```typescript
interface EngineRegistrationInfo {
  className: string;
  instance: unknown;
  registeredAt: Date;
  lastLoadedAt: Date | null;
  isLoaded: boolean;
  estimatedMemoryBytes: number;
  itemCount: number;
  entitiesLoaded: string[];  // Track which entities this engine loads
}

interface EngineMemoryStats {
  totalEngines: number;
  loadedEngines: number;
  totalEstimatedMemoryBytes: number;
  engineStats: EngineRegistrationInfo[];
}

class BaseEngineRegistry extends BaseSingleton<BaseEngineRegistry> {
  // Registration
  RegisterEngine(engine: unknown, className?: string): void;
  UnregisterEngine(engine: unknown): void;

  // Discovery
  GetEngine<T>(className: string): T | null;
  GetAllEngines(): unknown[];
  GetEngineInfo(className: string): EngineRegistrationInfo | null;

  // Statistics
  GetMemoryStats(): EngineMemoryStats;

  // Entity Load Tracking
  RecordEntityLoad(engineClassName: string, entityName: string): void;
  GetEnginesLoadingEntity(entityName: string): string[];

  // Bulk operations
  RefreshAllEngines(): Promise<number>;
}
```

### 2. Redundant Loading Warnings

Instead of trying to pool or share data across engines (which caused 36+ second delays), we now **detect and warn** when multiple engines load the same entity.

#### Implementation in WarningManager

The `WarningManager` class in `@memberjunction/global` now includes support for redundant loading warnings:

```typescript
class WarningManager {
  // New method for redundant loading warnings
  RecordRedundantLoadWarning(
    entityName: string,
    engines: string[],
    context?: string
  ): boolean;
}
```

#### Output Format

When multiple engines load the same entity, a consolidated warning is displayed:

```
⚠️  REDUNDANT DATA LOADING WARNINGS - Multiple engines loaded the same entity data:

📊 REDUNDANT LOADS:
  ├─ "AI Models" entity
  │  ├─ AIEngineBase
  │  └─ SomeOtherEngine
  │
  └─ "Communication Providers" entity
     ├─ CommunicationEngineBase
     └─ EntityCommunicationsEngineBase

💡 Consider consolidating data loading or using shared dependencies between these engines.
```

#### How It Works

1. When an engine loads data via `LoadMultipleEntityConfigs()`, it records each entity load with `BaseEngineRegistry.Instance.RecordEntityLoad()`
2. The registry tracks which engines have loaded each entity
3. When the same entity is loaded by a second (or third, etc.) engine, a warning is queued
4. Warnings are debounced and consolidated using the existing WarningManager infrastructure
5. After a quiet period (default 10 seconds), all warnings are flushed with a nice formatted output

#### Benefits Over Pooling Approach

- **Zero runtime overhead** - No request batching, no cross-engine cache management
- **No performance regression** - Engines load independently as before
- **Developer visibility** - Clear indication of optimization opportunities
- **Actionable information** - Shows exactly which engines are redundantly loading which entities

---

### 3. Universal Startup Loading Pattern (ILoadOnStartup)

A generalized pattern that works with **any singleton class** across MemberJunction, eliminating tree-shake prevention hacks.

#### The Problem: Tree-Shake Prevention Hacks

Currently, many packages contain code like this solely to prevent bundlers from removing unused classes:

```typescript
// In various public-api.ts files throughout the codebase
export function Load_EncryptionEngine() { }
export function Load_TemplateEngine() { }
// ... dozens more

// Then in module initialization somewhere
Load_EncryptionEngine();
Load_TemplateEngine();
```

#### The Solution: @LoadOnStartup Decorator

```typescript
// In @memberjunction/global

interface LoadOnStartupOptions {
  priority?: number;  // Lower numbers load first, default 100
  severity?: 'fatal' | 'error' | 'warn' | 'silent';
  description?: string;
}

function LoadOnStartup(options?: LoadOnStartupOptions) {
  return function<T extends {
    new(...args: any[]): ILoadOnStartup;
    Instance: ILoadOnStartup;
  }>(constructor: T) {
    MJGlobal.Instance.RegisterForStartup({
      constructor,
      getInstance: () => constructor.Instance,
      options: options || {}
    });
    return constructor;
  };
}
```

#### Usage Example

```typescript
@LoadOnStartup({ priority: 10, severity: 'fatal', description: 'Encryption services' })
@RegisterClass(BaseEngine, 'EncryptionEngine')
export class EncryptionEngine extends BaseEngine<EncryptionEngine> implements ILoadOnStartup {
  public async Load(contextUser?: UserInfo): Promise<void> {
    await this.Config(false, contextUser);
  }
}
```

#### Application Bootstrap Integration

```typescript
async function bootstrapApplication(contextUser: UserInfo): Promise<void> {
  await Metadata.Provider.Config(configData);

  const result = await MJGlobal.Instance.LoadAll(contextUser);

  if (!result.success) {
    console.error('Startup failed:', result.fatalError);
    process.exit(1);
  }
}
```

---

## Removed Components

### ~~DataPool~~ (REMOVED)

The DataPool was an experimental component that attempted to:
- Pool and batch requests across engines
- Share cached data between engines
- Manage a tiered cache (memory + IndexedDB)

**Why it was removed:**
- Caused 36+ second delays when batching many requests together
- Even with batching disabled, the overhead added 9+ seconds of latency
- The complexity didn't justify the theoretical benefits
- Cross-engine data sharing proved problematic with BaseEntity objects

**What replaced it:**
- Engines load independently using the original `RunViews()` pattern
- Redundant loading is detected and warned about (not prevented)
- Developers can then choose to optimize based on the warnings

---

## File Locations

| Component | Location |
|-----------|----------|
| BaseEngineRegistry | `packages/MJCore/src/generic/baseEngineRegistry.ts` |
| LoadOnStartup decorator | `packages/MJGlobal/src/LoadOnStartup.ts` |
| WarningManager | `packages/MJGlobal/src/warningManager.ts` |
| BaseEngine | `packages/MJCore/src/generic/baseEngine.ts` |

## New Exports from MJCore

```typescript
// packages/MJCore/src/index.ts
export { BaseEngineRegistry, EngineRegistrationInfo, EngineMemoryStats } from './generic/baseEngineRegistry';
```

## New Exports from MJGlobal

```typescript
// packages/MJGlobal/src/index.ts
export { LoadOnStartup, ILoadOnStartup, LoadOnStartupOptions } from './LoadOnStartup';
```

---

## Future Considerations (Not In Scope)

These items are documented for future reference but not part of this implementation:

### Persistent Caching for Engines

Automatically cache engine data in IndexedDB, treating each engine's entity configs as a "virtual dataset." This would provide:
- On-load staleness checking via `__mj_UpdatedAt`
- Only fetch entities that actually changed
- Faster warm starts

Deferred because it requires careful handling of BaseEntity serialization.

### Lazy Loading Support

Allow properties to load on first access rather than at Config time. Deferred due to extensive downstream code changes required (sync property access pattern is deeply embedded).

### Predictive Pre-fetching

Hint-based prefetch where loading one entity triggers prefetch of related entities. Interesting for performance but adds complexity.

---

## Success Metrics

| Metric | Current | Target |
|--------|---------|--------|
| Time to all engines loaded | ~1-2 seconds | ~1-2 seconds (no regression) |
| Redundant entity loads | Common (undetected) | Detected and warned |
| Developer boilerplate | `await Engine.Config()` everywhere | Minimal (startup engines) |
| Tree-shake prevention hacks | Many `Load_*` functions | Decorator-based |
| Developer visibility | None | Full via warnings + diagnostics dashboard |

---

## Appendix: System Diagnostics Dashboard

The System Diagnostics dashboard provides visibility into:

1. **Engine Registry** - All registered engines, their load status, memory usage, and item counts
2. **Entity Load Tracking** - Which entities are loaded by which engines

This is a client-side only dashboard - all data comes from in-memory registries.

Access it via the "Entity Admin" application navigation.
