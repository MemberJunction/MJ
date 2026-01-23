# Eliminating Tree-Shaking Prevention Functions

## Overview

This document outlines a proposed approach to eliminate the manual `LoadXxx()` tree-shaking prevention functions scattered throughout the MemberJunction codebase. The solution combines a new `@LoadOnStartup` decorator with build-time code generation to automatically discover and import decorated classes.

## Current State

### The Problem

MemberJunction engines (singletons extending `BaseEngine`) require two things:

1. **Runtime Initialization**: Each engine needs `Config()` called after authentication to load its data
2. **Compile-Time Inclusion**: Files must be imported somewhere to avoid tree-shaking by bundlers

Currently, both are handled manually:

```typescript
// Manual Config() calls scattered throughout app initialization
await AIEngineBase.Instance.Config(false, contextUser);
await TemplateEngineBase.Instance.Config(false, contextUser);
await ActionEngine.Instance.Config(false, contextUser);
// ... dozens more

// Ugly stub functions to prevent tree-shaking
export function LoadAIEngine() {}
export function LoadTemplateEngine() {}
export function LoadActionEngine() {}
```

This is:
- Error-prone (easy to forget a Config call)
- Hard to maintain (new engines require changes in multiple places)
- Ugly (stub functions serve no purpose except forcing imports)

## Proposed Solution

### Part 1: `@LoadOnStartup` Decorator

A new decorator that declares an engine should be auto-configured at startup:

```typescript
@RegisterClass(BaseEngine, 'AIEngineBase')
@LoadOnStartup({
    priority: 10,
    description: 'AI Engine - loads AI models, vendors, and configurations'
})
export class AIEngineBase extends BaseEngine<AIEngineBase> {
    public async Config(forceRefresh?: boolean, contextUser?: UserInfo): Promise<void> {
        // Existing implementation unchanged
    }
}
```

**Decorator Options:**
- `priority: number` - Lower numbers load first (0-100 scale suggested)
- `description?: string` - Human-readable description for documentation

**Priority Guidelines:**
| Priority | Use Case | Examples |
|----------|----------|----------|
| 0-10 | Core infrastructure | Metadata, Templates |
| 10-20 | AI foundation | AIEngineBase |
| 20-30 | AI extensions | Prompts, Agents |
| 40-60 | Standard engines | Actions, Communication |
| 70-90 | Application-specific | Custom engines |

### Part 2: `StartupManager` Singleton

A central manager that orchestrates engine initialization:

```typescript
// In @memberjunction/global
export class StartupManager extends BaseSingleton<StartupManager> {
    private _registrations: StartupRegistration[] = [];
    private _contextUser: UserInfo | null = null;

    public Register(reg: StartupRegistration): void {
        this._registrations.push(reg);
    }

    public async InitializeAll(contextUser: UserInfo): Promise<void> {
        this._contextUser = contextUser;

        // Sort by priority
        const sorted = this._registrations.sort((a, b) => a.priority - b.priority);

        // Group by priority for parallel execution
        const groups = this.groupByPriority(sorted);

        for (const group of groups) {
            // All engines at same priority level load in parallel
            await Promise.all(group.map(reg => this.initializeEngine(reg)));
        }
    }

    private async initializeEngine(reg: StartupRegistration): Promise<void> {
        const instance = (reg.classConstructor as any).Instance;
        await instance.Config(false, this._contextUser);
    }
}
```

**App initialization becomes:**
```typescript
// After authentication, one line replaces all Config() calls
await StartupManager.Instance.InitializeAll(contextUser);
```

### Part 3: Build-Time Manifest Generation

A Node script that scans for `@LoadOnStartup` decorators and generates an import manifest:

#### Scanner Script

```typescript
// scripts/generate-engine-manifest.ts
import * as ts from 'typescript';
import * as glob from 'glob';
import * as fs from 'fs';
import * as path from 'path';

interface EngineRegistration {
    className: string;
    filePath: string;
    packageName: string;
    priority: number;
    description?: string;
}

function scanForLoadOnStartupDecorators(): EngineRegistration[] {
    const registrations: EngineRegistration[] = [];
    const files = glob.sync('packages/**/src/**/*.ts', {
        ignore: ['**/node_modules/**', '**/generated/**', '**/*.spec.ts']
    });

    for (const file of files) {
        const source = fs.readFileSync(file, 'utf-8');

        // Quick check before full parse
        if (!source.includes('@LoadOnStartup')) continue;

        const sourceFile = ts.createSourceFile(
            file,
            source,
            ts.ScriptTarget.Latest,
            true
        );

        visitNode(sourceFile, file, registrations);
    }

    return registrations.sort((a, b) => a.priority - b.priority);
}

function visitNode(node: ts.Node, filePath: string, registrations: EngineRegistration[]): void {
    if (ts.isClassDeclaration(node) && node.name) {
        const decorator = findLoadOnStartupDecorator(node);
        if (decorator) {
            const options = parseDecoratorOptions(decorator);
            const packageName = resolvePackageName(filePath);

            registrations.push({
                className: node.name.text,
                filePath,
                packageName,
                priority: options.priority ?? 50,
                description: options.description
            });
        }
    }

    ts.forEachChild(node, child => visitNode(child, filePath, registrations));
}

function resolvePackageName(filePath: string): string {
    // Walk up to find package.json and extract name
    let dir = path.dirname(filePath);
    while (dir !== '/') {
        const pkgPath = path.join(dir, 'package.json');
        if (fs.existsSync(pkgPath)) {
            const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf-8'));
            return pkg.name;
        }
        dir = path.dirname(dir);
    }
    return filePath;
}

function generateManifest(registrations: EngineRegistration[]): string {
    const lines: string[] = [
        '// AUTO-GENERATED FILE - DO NOT EDIT',
        '// Generated by scripts/generate-engine-manifest.ts',
        `// Last generated: ${new Date().toISOString()}`,
        '',
        '// This file ensures all @LoadOnStartup decorated classes are imported',
        '// and thus included in the bundle (not tree-shaken away).',
        ''
    ];

    // Group by priority for readability
    const byPriority = new Map<number, EngineRegistration[]>();
    for (const reg of registrations) {
        if (!byPriority.has(reg.priority)) {
            byPriority.set(reg.priority, []);
        }
        byPriority.get(reg.priority)!.push(reg);
    }

    for (const [priority, regs] of [...byPriority.entries()].sort((a, b) => a[0] - b[0])) {
        lines.push(`// Priority ${priority}`);
        for (const reg of regs) {
            if (reg.description) {
                lines.push(`// ${reg.className}: ${reg.description}`);
            }
            lines.push(`import '${reg.packageName}';`);
        }
        lines.push('');
    }

    lines.push('export const ENGINE_MANIFEST_LOADED = true;');

    return lines.join('\n');
}

// Main execution
const registrations = scanForLoadOnStartupDecorators();
const manifest = generateManifest(registrations);
const outputPath = 'packages/MJGlobal/src/generated/engine-manifest.ts';

fs.mkdirSync(path.dirname(outputPath), { recursive: true });
fs.writeFileSync(outputPath, manifest);

console.log(`Generated engine manifest with ${registrations.length} engines`);
```

#### Generated Output Example

```typescript
// AUTO-GENERATED FILE - DO NOT EDIT
// Generated by scripts/generate-engine-manifest.ts
// Last generated: 2025-12-27T15:30:00.000Z

// This file ensures all @LoadOnStartup decorated classes are imported
// and thus included in the bundle (not tree-shaken away).

// Priority 5
// TemplateEngineBase: Core template processing engine
import '@memberjunction/templates';

// Priority 10
// AIEngineBase: AI Engine - loads AI models, vendors, and configurations
import '@memberjunction/ai-core';

// Priority 20
// AIPromptEngine: Manages AI prompt templates and execution
import '@memberjunction/ai-prompts';

// Priority 30
// AIAgentEngine: AI Agent orchestration and execution
import '@memberjunction/ai-agents';

// Priority 50
// ActionEngine: Business action definitions and execution
import '@memberjunction/actions-core';
// CommunicationEngine: Email, SMS, and notification services
import '@memberjunction/communication-engine';

export const ENGINE_MANIFEST_LOADED = true;
```

### Part 4: Build Integration

#### Option A: Turbo Pipeline

```json
// turbo.json
{
  "pipeline": {
    "generate-engine-manifest": {
      "inputs": ["packages/**/src/**/*.ts"],
      "outputs": ["packages/MJGlobal/src/generated/engine-manifest.ts"],
      "cache": true
    },
    "build": {
      "dependsOn": ["generate-engine-manifest", "^build"],
      "outputs": ["dist/**"]
    }
  }
}
```

#### Option B: npm Scripts

```json
// package.json (root)
{
  "scripts": {
    "generate:manifest": "ts-node scripts/generate-engine-manifest.ts",
    "prebuild": "npm run generate:manifest",
    "build": "turbo run build"
  }
}
```

### Part 5: App Integration

Each app entry point imports the manifest:

```typescript
// MJAPI/src/index.ts
import '@memberjunction/global/generated/engine-manifest';

// After authentication
await StartupManager.Instance.InitializeAll(contextUser);
```

```typescript
// MJExplorer app.module.ts or main.ts
import '@memberjunction/global/generated/engine-manifest';

// In APP_INITIALIZER or after auth
await StartupManager.Instance.InitializeAll(contextUser);
```

## Migration Path

### Phase 1: Implement Infrastructure
1. Create `@LoadOnStartup` decorator in `@memberjunction/global`
2. Create `StartupManager` singleton
3. Create manifest generation script

### Phase 2: Migrate Engines (One at a Time)
For each engine:
1. Add `@LoadOnStartup` decorator with appropriate priority
2. Remove the `LoadXxx()` stub function
3. Remove manual `Config()` call from app initialization
4. Run build to regenerate manifest
5. Test

### Phase 3: Cleanup
1. Remove all `LoadXxx()` function calls from app initialization
2. Replace scattered `Config()` calls with single `InitializeAll()`
3. Update documentation

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

Two options for the generated manifest file:

1. **Gitignore it**: CI regenerates on every build
   - Pro: No merge conflicts, always fresh
   - Con: Need to ensure CI runs generator

2. **Commit it**: Treat as generated source
   - Pro: Works without running generator locally
   - Con: Can get stale, merge conflicts

Recommendation: **Gitignore** with CI enforcement.

### Error Handling

The manifest generator should fail the build if:
- Decorator syntax is malformed
- Priority values are out of range
- Duplicate priorities with conflicting engines (optional strictness)

## Benefits Summary

| Current Approach | Proposed Approach |
|-----------------|-------------------|
| Manual `Config()` calls for each engine | Single `InitializeAll()` call |
| Manual `LoadXxx()` stub functions | Auto-generated manifest |
| Easy to forget new engines | Build-time discovery |
| Priority/order managed manually | Declarative priority in decorator |
| Changes require multiple files | Add decorator, run build |

## Open Questions

1. **Granularity**: Should manifest be per-app or monorepo-wide?
2. **Conditional Loading**: How to handle engines only needed in certain contexts (server vs client)?
3. **Circular Dependencies**: Any risk with the generated import order?
4. **Performance**: Is parallel loading within priority groups actually faster?

## Next Steps

1. Review and approve approach
2. Prototype decorator and StartupManager
3. Prototype manifest generator with a few test engines
4. Validate CommonJS/ESM compatibility
5. Full implementation and migration
