# Lazy Loading Guide

MemberJunction uses code-split lazy loading for dashboard feature chunks in MJExplorer. Instead of loading every dashboard component at startup, chunks are loaded on demand when a user navigates to them. This keeps the initial bundle small and startup fast.

## Table of Contents

1. [How It Works](#how-it-works)
2. [The Lazy Feature Config](#the-lazy-feature-config)
3. [Making a Package Lazy-Loadable](#making-a-package-lazy-loadable)
4. [Adding a New Dashboard Component](#adding-a-new-dashboard-component)
5. [Adding a New Feature Module (Subpath)](#adding-a-new-feature-module-subpath)
6. [How the Generator Works](#how-the-generator-works)
7. [Regenerating the Config](#regenerating-the-config)
8. [Troubleshooting](#troubleshooting)

---

## How It Works

```
User clicks "AI Dashboard" tab
        │
        ▼
ResourceContainerComponent asks ClassFactory
for 'AIModelsResource'
        │
        ▼
ClassFactory returns null — class not registered yet
(it was excluded from the eager manifest)
        │
        ▼
LazyModuleRegistry.Load('AIModelsResource')
        │
        ▼
Looks up 'AIModelsResource' in LAZY_FEATURE_CONFIG
        │
        ▼
Calls: import('@memberjunction/ng-dashboards/ai-dashboards.module')
        │
        ▼
ESBuild loads the chunk → @RegisterClass decorators execute
→ ClassFactory now has the class → retry succeeds
```

Three pieces make this work:

1. **`LazyModuleRegistry`** — A singleton service that maps resource type strings to loader functions. When `ClassFactory` can't find a class, consumers call `LazyModuleRegistry.Load(resourceType)` to pull in the missing chunk.

2. **`LAZY_FEATURE_CONFIG`** — An auto-generated record mapping every `@RegisterClass` key to its `import()` loader. This is the bridge between "I need `AIModelsResource`" and "load `ai-dashboards.module` from `ng-dashboards`."

3. **Subpath exports in `package.json`** — The bundler uses these to create separate chunks. Each subpath (e.g., `./ai-dashboards.module`) becomes an independently loadable unit.

---

## The Lazy Feature Config

The file at `packages/Angular/Explorer/explorer-core/src/generated/lazy-feature-config.ts` is **auto-generated** by `mj codegen manifest --lazy-config`. Never edit it manually.

It maps `@RegisterClass` key strings to dynamic `import()` loaders:

```typescript
// AUTO-GENERATED — DO NOT EDIT

const loadAiDashboardsModule = featureLoader(
  () => import('@memberjunction/ng-dashboards/ai-dashboards.module')
);

export const LAZY_FEATURE_CONFIG: Record<string, () => Promise<void>> = {
  'AIModelsResource': loadAiDashboardsModule,
  'AIPromptsResource': loadAiDashboardsModule,
  'AIAgentsResource': loadAiDashboardsModule,
  // ...
};
```

---

## Making a Package Lazy-Loadable

A package is lazy-loadable when it has **subpath exports** in its `package.json`. The `exports` field is the package's declarative marker that it supports lazy chunk loading. Without it, the generator skips the package entirely.

### Adding subpath exports to a package

**For packages with multiple feature modules** (like `ng-dashboards`):

```json
{
  "name": "@memberjunction/ng-dashboards",
  "exports": {
    ".": {
      "types": "./dist/public-api.d.ts",
      "default": "./dist/public-api.js"
    },
    "./ai-dashboards.module": {
      "types": "./dist/ai-dashboards.module.d.ts",
      "default": "./dist/ai-dashboards.module.js"
    },
    "./actions-dashboards.module": {
      "types": "./dist/actions-dashboards.module.d.ts",
      "default": "./dist/actions-dashboards.module.js"
    }
  }
}
```

Each subpath becomes a separately loadable chunk. Classes reachable from that subpath's entry point are grouped together.

**For single-module packages** (like `ng-explorer-settings`):

```json
{
  "name": "@memberjunction/ng-explorer-settings",
  "exports": {
    ".": {
      "types": "./dist/public-api.d.ts",
      "default": "./dist/public-api.js"
    },
    "./settings.module": {
      "types": "./dist/lib/module.d.ts",
      "default": "./dist/lib/module.js"
    }
  }
}
```

Even though there's only one chunk, the subpath export tells the generator "this package participates in lazy loading."

### What qualifies a package for lazy loading?

The generator includes a package in the lazy config when ALL of these are true:

1. The package matches `--exclude-packages` (e.g., `@memberjunction`)
2. The package has at least one subpath export (key other than `"."` in `exports`)
3. The package is NOT the host package where the lazy config file lives
4. The package contains `@RegisterClass` decorators with key arguments

---

## Adding a New Dashboard Component

When you add a new component with `@RegisterClass(BaseResourceComponent, 'MyNewResource')` to an existing feature module:

1. Add the component to the feature module's declarations and exports
2. That's it — the generator discovers it automatically on next build

The component's `@RegisterClass` key (`'MyNewResource'`) is found during the AST scan, mapped to the subpath that contains it, and added to the lazy config. No manual configuration needed.

### Example

```typescript
// In packages/Angular/Explorer/dashboards/src/AI/components/my-new.component.ts
@RegisterClass(BaseResourceComponent, 'MyNewResource')
@Component({ ... })
export class MyNewComponent extends BaseResourceComponent { ... }
```

```typescript
// In packages/Angular/Explorer/dashboards/src/ai-dashboards.module.ts
@NgModule({
  declarations: [
    // ... existing components
    MyNewComponent,  // Add here
  ],
  exports: [
    MyNewComponent,  // And here
  ]
})
export class AIDashboardsModule { }
```

After rebuilding `explorer-core`, the lazy config automatically includes:
```
'MyNewResource': loadAiDashboardsModule,
```

---

## Adding a New Feature Module (Subpath)

When creating an entirely new feature area (e.g., a "Reporting" dashboard):

### 1. Create the feature module

```typescript
// packages/Angular/Explorer/dashboards/src/reporting-dashboards.module.ts
@NgModule({
  declarations: [ReportingOverviewComponent, ReportBuilderComponent],
  exports: [ReportingOverviewComponent, ReportBuilderComponent],
  imports: [CommonModule, /* ... */]
})
export class ReportingDashboardsModule { }
```

### 2. Add the subpath export to `package.json`

```json
{
  "exports": {
    // ... existing subpaths
    "./reporting-dashboards.module": {
      "types": "./dist/reporting-dashboards.module.d.ts",
      "default": "./dist/reporting-dashboards.module.js"
    }
  }
}
```

### 3. Register components with keys

```typescript
@RegisterClass(BaseResourceComponent, 'ReportingOverviewResource')
export class ReportingOverviewComponent extends BaseResourceComponent { ... }
```

### 4. Rebuild

```bash
cd packages/Angular/Explorer/dashboards && npm run build
cd packages/Angular/Explorer/explorer-core && npm run build
```

The generator automatically picks up the new subpath and its classes.

---

## How the Generator Works

The `mj codegen manifest --lazy-config` flag triggers lazy config generation as a post-processing step after the regular eager manifest:

1. **Walk the full dependency tree** (ignoring `--exclude-packages`) to find all packages
2. **Filter to lazy candidates**: packages matching `--exclude-packages` that have subpath exports in `package.json`
3. **Scan** each candidate for `@RegisterClass` decorators
4. **Resolve subpath membership**: for each class, determine which subpath export it belongs to by following `.d.ts` import/export chains (including Angular NgModule `import * as` patterns)
5. **Disambiguate**: when multiple subpaths contain classes with the same name, use the source file path to pick the correct subpath
6. **Detect collisions**: error if the same `@RegisterClass` key appears in different subpaths
7. **Generate** the TypeScript config file with write-on-change semantics (preserves mtime if unchanged)

### Key files

| File | Role |
|------|------|
| `packages/CodeGenLib/src/Manifest/GenerateClassRegistrationsManifest.ts` | Generator implementation |
| `packages/MJCLI/src/commands/codegen/manifest.ts` | CLI command |
| `packages/Angular/Explorer/explorer-core/src/generated/lazy-feature-config.ts` | Generated output |
| `packages/Angular/Explorer/explorer-core/src/lib/services/lazy-module-registry.ts` | Runtime registry |

---

## Regenerating the Config

The lazy config is regenerated automatically during `explorer-core`'s `prebuild` step. You can also run it manually:

```bash
# From repo root — regenerates both the MJExplorer supplemental manifest and the lazy config
npm run mj:manifest:explorer

# Or regenerate ALL manifests (eager + lazy)
npm run mj:manifest
```

---

## Troubleshooting

### Component doesn't load when navigating to its tab

1. Check that the component has `@RegisterClass(SomeBase, 'UniqueKey')` with a key argument
2. Check that the component's feature module is listed in the package's `exports` field in `package.json`
3. Rebuild `explorer-core` to regenerate the lazy config
4. Verify the key appears in `src/generated/lazy-feature-config.ts`

### New package's components aren't in the lazy config

The package needs subpath exports in its `package.json`. Add an `exports` field with at least one subpath entry pointing to the module's `.d.ts` and `.js` files. See [Making a Package Lazy-Loadable](#making-a-package-lazy-loadable).

### Same class name in multiple feature modules

The generator disambiguates using source file paths. If two feature modules contain classes with the same name but different `@RegisterClass` keys (e.g., `ExecutionMonitoringComponent` in both AI and Actions), each is correctly mapped to its own subpath. If they share the same key, the generator reports a collision error.

### Changes to lazy config not taking effect

The lazy config lives in `explorer-core`, not `MJExplorer`. After regenerating, you need to rebuild `explorer-core` (not just MJExplorer) for the changes to compile into the package.
