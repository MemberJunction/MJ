# Eliminating Tree-Shaking Prevention Functions

## Overview

This document outlines the approach to eliminate manual `LoadXxx()` tree-shaking prevention functions throughout the MemberJunction codebase. The solution combines the `@RegisterForStartup` decorator with a `StartupManager` singleton for runtime initialization, and proposes build-time code generation to automatically discover and import decorated classes.

## Current State

### The Problem

MemberJunction engines (singletons extending `BaseEngine`) require two things:

1. **Runtime Initialization**: Each engine needs `Config()` called after authentication to load its data
2. **Compile-Time Inclusion**: Files must be imported somewhere to avoid tree-shaking by bundlers

Currently, runtime initialization is handled by `StartupManager`, but compile-time inclusion still uses manual stub functions:

```typescript
// Ugly stub functions to prevent tree-shaking (STILL NEEDED)
export function LoadAIEngine() {}
export function LoadTemplateEngine() {}
export function LoadActionEngine() {}
```

---

## ✅ IMPLEMENTED: Phase 1 & 2

### `@RegisterForStartup` Decorator

**Location:** `@memberjunction/core` (`packages/MJCore/src/generic/RegisterForStartup.ts`)

A decorator that marks singleton classes for automatic loading at application startup:

```typescript
@RegisterForStartup({
    priority: 10,
    severity: 'fatal',
    description: 'AI Engine - loads AI models, vendors, and configurations'
})
export class AIEngineBase extends BaseEngine<AIEngineBase> {
    // Config() is called automatically via HandleStartup()
}

// Also works without options (uses defaults)
@RegisterForStartup
export class SimpleEngine extends BaseEngine<SimpleEngine> { }

// Or with empty parentheses
@RegisterForStartup()
export class AnotherEngine extends BaseEngine<AnotherEngine> { }
```

**Decorator Options:**

```typescript
interface RegisterForStartupOptions {
    /**
     * Loading priority. Lower numbers load first.
     * Classes with same priority load in parallel.
     * Default: 100
     */
    priority?: number;

    /**
     * What happens if HandleStartup() fails:
     * - 'fatal': Stop startup, throw error, process should terminate
     * - 'error': Log error, continue loading other classes (default)
     * - 'warn': Log warning, continue (for optional functionality)
     * - 'silent': Swallow error completely
     */
    severity?: 'fatal' | 'error' | 'warn' | 'silent';

    /**
     * Human-readable description for logging/debugging
     */
    description?: string;
}
```

**Priority Guidelines:**
| Priority | Use Case | Examples |
|----------|----------|----------|
| 0-10 | Core infrastructure | Metadata, Templates |
| 10-20 | AI foundation | AIEngineBase |
| 20-30 | AI extensions | Prompts, Agents |
| 40-60 | Standard engines | Actions, Communication |
| 70-100 | Application-specific | Custom engines |
| 100+ | Low priority/optional | Analytics, Telemetry |

### `IStartupSink` Interface

Classes that need startup initialization must implement this interface:

```typescript
interface IStartupSink {
    /**
     * Called during application bootstrap to initialize the singleton.
     * @param contextUser - The authenticated user context (required for server-side)
     * @param provider - Optional metadata provider to use for initialization
     */
    HandleStartup(contextUser?: UserInfo, provider?: IMetadataProvider): Promise<void>;
}
```

**Note:** `BaseEngine` already implements `IStartupSink` - its `HandleStartup()` simply calls `Config()`:

```typescript
// From BaseEngine
public async HandleStartup(contextUser?: UserInfo, provider?: IMetadataProvider): Promise<void> {
    await this.Config(false, contextUser, provider);
}
```

### `StartupManager` Singleton

**Location:** `@memberjunction/core` (same file as decorator)

Central manager that orchestrates engine initialization:

```typescript
export class StartupManager {
    public static get Instance(): StartupManager;

    /**
     * Register a class for startup loading. Called automatically by @RegisterForStartup.
     */
    public Register(registration: StartupRegistration): void;

    /**
     * Get all registered startup classes, sorted by priority.
     */
    public GetRegistrations(): StartupRegistration[];

    /**
     * Check if startup loading has been completed.
     */
    public get LoadCompleted(): boolean;

    /**
     * Load all registered startup classes in priority order.
     * Classes with the same priority are loaded in parallel.
     *
     * This method is idempotent - multiple callers receive the same promise
     * and startup classes are only loaded once unless forceRefresh is true.
     */
    public async Startup(
        forceRefresh?: boolean,
        contextUser?: UserInfo,
        provider?: IMetadataProvider
    ): Promise<LoadAllResult>;

    /**
     * Reset for testing purposes.
     */
    public Reset(): void;
}
```

**Load Result Types:**

```typescript
interface LoadResult {
    className: string;
    success: boolean;
    error?: Error;
    severity?: 'fatal' | 'error' | 'warn' | 'silent';
    durationMs: number;
}

interface LoadAllResult {
    success: boolean;          // true if no fatal errors
    results: LoadResult[];     // individual results
    totalDurationMs: number;
    fatalError?: Error;        // if startup was aborted
}
```

### Currently Decorated Engines

The following engines are already using `@RegisterForStartup`:

| Engine | Package | Notes |
|--------|---------|-------|
| `AIEngineBase` | `@memberjunction/ai-core` | Core AI functionality |
| `UserInfoEngine` | `@memberjunction/core-entities` | User-specific data caching |
| `DashboardEngine` | `@memberjunction/core-entities` | Dashboard metadata & permissions |
| `ResourcePermissionEngine` | `@memberjunction/core-entities` | Resource permission management |
| `EncryptionEngineBase` | `@memberjunction/core-entities` | Encryption key management |
| `APIKeysEngineBase` | `@memberjunction/api-keys` | API key and scope management |

### App Integration (Currently Implemented)

Startup is triggered in multiple places after authentication:

```typescript
// GraphQL Provider (client-side)
await StartupManager.Instance.Startup();

// SQL Server Provider (server-side)
await StartupManager.Instance.Startup(false, sysUser, provider);

// Angular SharedService (after LoggedIn event)
await StartupManager.Instance.Startup();
```

---

## ✅ IMPLEMENTED: Phase 3 - Build-Time Manifest Generation

### The Problem Solved

While `@RegisterForStartup` + `StartupManager` handles **runtime initialization**, we still need to prevent **tree-shaking**. Decorators only run if the file is imported, and bundlers can tree-shake entire files that appear unused.

### Solution: `mj codegen manifest` CLI Command

**Location:**
- **Logic:** `@memberjunction/codegen-lib` (`packages/CodeGenLib/src/Manifest/GenerateClassRegistrationsManifest.ts`)
- **CLI Command:** `@memberjunction/cli` (`packages/MJCLI/src/commands/codegen/manifest.ts`)

A build-time tool that:
1. Reads the **app's** `package.json` (e.g., MJAPI or MJExplorer)
2. Walks the full **transitive dependency tree**
3. Scans each dependency's source for `@RegisterClass` decorators
4. Generates a manifest importing **only** the packages in that app's dependency tree that contain `@RegisterClass`

This means each app gets a **tailored manifest** - MJAPI doesn't import Angular packages, MJExplorer doesn't import server-only packages, and customer apps only get what they depend on.

**Why `@RegisterClass` as the driver:**
1. **Universal coverage** - All dynamically-loaded classes already use `@RegisterClass`
2. **Already in use** - No new decorator needed
3. **Single source of truth** - One decorator for both DI and tree-shaking prevention
4. **Flexible filtering** - Can filter by base class if needed (e.g., only `BaseEngine` subclasses)

### CLI Usage

```bash
# Run from your app directory (reads ./package.json, walks its deps)
mj codegen manifest --output ./src/generated/class-registrations-manifest.ts

# Specify app directory explicitly
mj codegen manifest --appDir ./packages/MJAPI --output ./packages/MJAPI/src/generated/class-registrations-manifest.ts

# Filter to only specific base classes
mj codegen manifest --filter BaseEngine --filter BaseAction

# Quiet mode (no progress output)
mj codegen manifest --quiet

# Help
mj codegen manifest --help
```

**Options:**
| Option | Short | Description | Default |
|--------|-------|-------------|---------|
| `--output` | `-o` | Output manifest path | `./src/generated/class-registrations-manifest.ts` |
| `--appDir` | `-a` | App directory containing package.json | current directory |
| `--filter` | `-f` | Only include classes with this base class (repeatable) | (all classes) |
| `--quiet` | `-q` | Suppress progress output | `false` |
| `--help` | `-h` | Show help | |

### Programmatic Usage

```typescript
import { generateClassRegistrationsManifest } from '@memberjunction/codegen-lib';

// Run from the app directory (reads ./package.json)
const result = await generateClassRegistrationsManifest({
    outputPath: './src/generated/class-manifest.ts',
    // appDir defaults to process.cwd()
});

if (result.success) {
    console.log(`Dependencies walked: ${result.totalDepsWalked}`);
    console.log(`Packages with @RegisterClass: ${result.packages.length}`);
    console.log(`Total classes: ${result.classes.length}`);
}
```

### How Dependency Walking Works

1. Read the app's `package.json` → collect `dependencies` + `devDependencies`
2. For each dependency, resolve its location on disk (follows workspace symlinks)
3. Read that dependency's `package.json` → collect its `dependencies` only (not devDeps for transitive)
4. Recurse until all transitive deps are visited (deduplicated by package name)
5. For each resolved package, scan `src/**/*.ts` for `@RegisterClass` decorators
6. Generate imports only for packages that have at least one `@RegisterClass`

### Per-App Results (Verified)

| App | Deps Walked | Packages with @RegisterClass | Total Classes |
|-----|-------------|------------------------------|---------------|
| **MJAPI** | 985 | 54 | 715 |
| **MJExplorer** | 1179 | 17 | 721 |

**MJAPI** includes server-only packages: AI providers, actions, scheduling, encryption, communication, etc.
**MJExplorer** includes Angular `ng-*` packages: artifacts, dashboards, forms, explorer-core, etc.
**Both share**: core-entities, ai-engine-base, actions-base, communication-types, etc.

### Generated Output Example (MJAPI)

The manifest uses **named imports** for every `@RegisterClass` decorated class and places them in an exported `CLASS_REGISTRATIONS` array, creating a static code path that prevents tree-shaking at the individual class level. Cross-package name collisions are handled with aliased imports.

```typescript
/**
 * AUTO-GENERATED FILE - DO NOT EDIT
 * Generated by mj codegen manifest
 * App: mj_api
 * Dependency tree: 985 packages walked, 54 contain @RegisterClass
 *
 * This file imports every @RegisterClass decorated class by name and places
 * them in an exported array, creating a static code path that prevents
 * tree-shaking from removing them.
 */

/* eslint-disable @typescript-eslint/no-unused-vars */

// @memberjunction/actions (3 classes)
import {
    EntityActionInvocationMultipleRecords,
    EntityActionInvocationSingleRecord,
    EntityActionInvocationValidate,
} from '@memberjunction/actions';

// @memberjunction/ai-anthropic (1 classes)
import {
    AnthropicLLM,
} from '@memberjunction/ai-anthropic';

// @memberjunction/actions-bizapps-lms (14 classes)
// Name collision: CreateUserAction aliased to avoid conflict with core-actions
import {
    BaseLMSAction,
    CreateUserAction as CreateUserAction_actions_bizapps_lms,
    // ... 12 more classes ...
} from '@memberjunction/actions-bizapps-lms';

// @memberjunction/core-actions (99 classes)
import {
    CreateUserAction as CreateUserAction_core_actions,
    // ... 98 more classes ...
} from '@memberjunction/core-actions';

// ... (54 packages total, 705 classes)

/**
 * Runtime references to every @RegisterClass decorated class.
 * This array creates a static code path the bundler cannot tree-shake.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export const CLASS_REGISTRATIONS: any[] = [
    EntityActionInvocationMultipleRecords,
    EntityActionInvocationSingleRecord,
    EntityActionInvocationValidate,
    AnthropicLLM,
    CreateUserAction_actions_bizapps_lms,
    CreateUserAction_core_actions,
    // ... all 705 classes ...
];

export const CLASS_REGISTRATIONS_MANIFEST_LOADED = true;
export const CLASS_REGISTRATIONS_COUNT = 705;
export const CLASS_REGISTRATIONS_PACKAGES = [
    '@memberjunction/actions',
    '@memberjunction/ai-anthropic',
    // ... 54 packages total ...
] as const;
```

See full examples: [MJAPI manifest](../packages/CodeGenLib/EXAMPLE_MANIFEST_MJAPI.md) | [MJExplorer manifest](../packages/CodeGenLib/EXAMPLE_MANIFEST_MJEXPLORER.md)

### Build Integration

Each app adds a `generate:manifest` script to its own `package.json`:

```json
// packages/MJAPI/package.json
{
  "scripts": {
    "generate:manifest": "mj codegen manifest --output ./src/generated/class-registrations-manifest.ts",
    "prebuild": "npm run generate:manifest",
    "build": "tsc"
  }
}
```

```json
// packages/MJExplorer/package.json
{
  "scripts": {
    "generate:manifest": "mj codegen manifest --output ./src/generated/class-registrations-manifest.ts",
    "prebuild": "npm run generate:manifest",
    "build": "ng build"
  }
}
```

### App Entry Point Integration

Each app imports its own manifest near the entry point:

```typescript
// MJAPI/src/index.ts
import './generated/class-registrations-manifest';

// MJExplorer main.ts or app.module.ts
import './generated/class-registrations-manifest';
```

---

## Supporting Non-Engine Classes

### The Need

Some classes might want to use `@RegisterForStartup` for tree-shaking prevention without implementing `IStartupSink`. For example:
- Provider implementations
- Action implementations
- UI components that need to be registered

### Proposed Approach

Modify `StartupManager.ExecuteLoad()` to check if `HandleStartup` exists before calling it:

```typescript
private async initializeClass(reg: StartupRegistration): Promise<LoadResult> {
    const loadStart = Date.now();
    try {
        const instance = reg.getInstance();

        // Only call HandleStartup if the method exists
        if (typeof instance.HandleStartup === 'function') {
            await instance.HandleStartup(contextUser, provider);
        }
        // If no HandleStartup, the class is included just for tree-shaking prevention

        reg.loadedAt = new Date();
        reg.loadDurationMs = Date.now() - loadStart;

        return {
            className: reg.constructor.name,
            success: true,
            durationMs: reg.loadDurationMs
        };
    } catch (error) {
        // ... error handling
    }
}
```

This allows:
```typescript
// Engine with startup logic
@RegisterForStartup({ priority: 10 })
export class MyEngine extends BaseEngine<MyEngine> { }  // Has HandleStartup via BaseEngine

// Non-engine class - just prevent tree-shaking
@RegisterForStartup()
export class MyActionProvider {
    // No HandleStartup needed - class is included but not "started"
}
```

---

## Migration Path

### Phase 1: ✅ COMPLETED - Implement Infrastructure
1. ~~Create `@RegisterForStartup` decorator in `@memberjunction/core`~~
2. ~~Create `StartupManager` singleton~~
3. ~~Create `IStartupSink` interface~~
4. ~~Implement `HandleStartup()` in `BaseEngine`~~

### Phase 2: ✅ COMPLETED - Migrate Initial Engines
1. ~~Add `@RegisterForStartup` decorator to key engines~~
2. ~~Integrate `StartupManager.Startup()` in providers and apps~~

### Phase 3: ✅ COMPLETED - Build Integration
1. ~~Create manifest generation logic in `@memberjunction/codegen-lib`~~
2. ~~Expose as `mj codegen manifest` command in `@memberjunction/cli` (MJCLI)~~
3. ~~Scan for `@RegisterClass` decorators (universal coverage)~~
4. ~~Export programmatic API for custom build scripts~~
5. ~~Generate named imports with runtime reference array (prevents individual class tree-shaking)~~

### Phase 4: 🚧 PENDING - App Integration
1. Add `generate:manifest` script to root package.json
2. Add manifest import to MJAPI entry point
3. Add manifest import to MJExplorer entry point
4. Remove manual `LoadXxx()` stub functions after validation
5. Update documentation

---

## Considerations

### CommonJS/ESM Compatibility

This approach works with both module systems because:
- Decorators execute at module load time in both
- `StartupManager` is a lazy singleton (created on first `.Instance` access)
- Same pattern as existing `@RegisterClass` which works in both

### Watch Mode During Development

For dev experience, the manifest generator could run in watch mode:

```bash
# In a separate terminal during development
npm run generate:manifest -- --watch
```

Or integrate with existing watch tooling.

### Git Strategy

**Recommended:** Gitignore the generated manifest file

```gitignore
# Generated startup manifest
packages/MJCore/src/generated/startup-manifest.ts
```

- Pro: No merge conflicts, always fresh
- Con: Must ensure CI runs generator
- CI enforcement: Build fails if manifest is stale/missing

### Error Handling

The manifest generator should fail the build if:
- Decorator syntax is malformed
- Package resolution fails
- Circular dependency detected

---

## Benefits Summary

| Current Approach | Implemented Approach |
|-----------------|---------------------|
| Manual `Config()` calls for each engine | Single `StartupManager.Startup()` call |
| No priority control | Declarative priority in decorator |
| No error handling strategy | Configurable severity levels |
| No parallel loading | Same-priority classes load in parallel |
| Easy to forget new engines | Auto-registration via decorator |

| Current (Tree-Shaking) | New (`mj codegen manifest`) |
|------------------------|------------------------|
| Manual `LoadXxx()` stub functions | Auto-generated manifest with named imports + runtime reference array |
| Bare `import 'pkg'` still allows class-level tree-shaking | Named imports + `CLASS_REGISTRATIONS[]` array creates static code paths |
| Changes require multiple files | Just add `@RegisterClass`, run build |
| Easy to forget | Build-time discovery - nothing to remember |
| No visibility into what's loaded | Manifest shows all classes/packages with counts |
| Per-file stub functions | One manifest file per app |
| No collision handling | Cross-package name collisions auto-aliased |

---

## Open Questions

1. ~~**Manifest Location**: Should it be in `@memberjunction/core` or a separate package?~~ → Logic in `@memberjunction/codegen-lib`, CLI command in `@memberjunction/cli` (follows established CodeGenLib + MJCLI pattern)
2. **Watch Mode**: How to handle watch mode during development efficiently?
3. ~~**Per-App Manifests**: Should different apps have different manifests?~~ → Yes, each app walks its own dependency tree and gets a tailored manifest
4. **Git Strategy**: Gitignore generated manifest or commit it?

---

## Next Steps

1. ✅ Review and approve overall approach
2. ✅ Implement decorator and StartupManager
3. ✅ Add decorator to initial engines
4. ✅ Create manifest generation in `@memberjunction/codegen-lib` + `mj codegen manifest` CLI command
5. 🚧 Add `generate:manifest` to app package.json prebuild scripts
6. 🚧 Add manifest imports to app entry points
7. 🚧 Remove `LoadXxx()` functions after validation
8. 🚧 Update developer documentation
