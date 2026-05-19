# Lazy Loading Guide

MemberJunction uses code-split lazy loading for feature chunks in MJExplorer. Instead of loading every component at startup, chunks are loaded on demand when needed. This keeps the initial bundle small and startup fast.

## Table of Contents

1. [How It Works](#how-it-works)
2. [The Lazy Feature Config](#the-lazy-feature-config)
3. [Making a Package Lazy-Loadable](#making-a-package-lazy-loadable)
4. [Adding a New Component](#adding-a-new-component)
5. [Adding Non-Angular Classes](#adding-non-angular-classes)
6. [Adding a New Feature Module (Subpath)](#adding-a-new-feature-module-subpath)
7. [How the Generator Works](#how-the-generator-works)
8. [Coverage Audit](#coverage-audit)
9. [Regenerating the Config](#regenerating-the-config)
10. [Troubleshooting](#troubleshooting)

---

## How It Works

Lazy loading is handled universally by `ClassFactory` via registered lazy loaders. Any `ClassFactory.GetRegistrationAsync()` or `CreateInstanceAsync()` call that can't find a registration synchronously will automatically trigger the lazy loader to pull in the correct chunk.

```
ApplicationManager needs HomeApplication
        |
        v
ClassFactory.CreateInstanceAsync(BaseApplication, 'HomeApplication')
        |
        v
GetRegistration() returns null -- class not loaded yet
        |
        v
ClassFactory calls registered lazy loaders with
('BaseApplication', 'HomeApplication')
        |
        v
LazyModuleRegistry.Load('BaseApplication::HomeApplication')
        |
        v
Looks up compound key in LAZY_FEATURE_CONFIG
        |
        v
Calls: import('@memberjunction/ng-dashboards/core-dashboards.module')
        |
        v
ESBuild loads the chunk -> @RegisterClass decorators execute
-> ClassFactory now has HomeApplication -> retry succeeds
```

Three pieces make this work:

1. **`ClassFactory.RegisterLazyLoader()`** -- Accepts N callback functions that are called in order when a registration is not found. Each loader receives `(baseClassName, key)` and returns `Promise<boolean>` indicating whether it loaded the missing class.

2. **`LAZY_FEATURE_CONFIG`** -- An auto-generated record mapping compound keys (`BaseClassName::Key`) to `import()` loaders. This is the bridge between "I need `BaseApplication::HomeApplication`" and "load `core-dashboards.module` from `ng-dashboards`."

3. **Subpath exports in `package.json`** -- The bundler uses these to create separate chunks. Each subpath (e.g., `./ai-dashboards.module`) becomes an independently loadable unit.

### ClassFactory Async API

```typescript
// Async version of GetRegistration -- tries sync first, then lazy loaders
const reg = await ClassFactory.GetRegistrationAsync(BaseResourceComponent, 'HomeDashboard');

// Async version of CreateInstance -- tries sync first, then lazy loaders, then base class fallback
const app = await ClassFactory.CreateInstanceAsync(BaseApplication, 'HomeApplication', args);

// Register a lazy loader (called by LazyModuleRegistry.WireToClassFactory())
ClassFactory.RegisterLazyLoader(async (baseClassName, key) => {
    // Load the chunk, return true if successful
});
```

The sync `GetRegistration()` and `CreateInstance()` methods still work and are used for classes that are always eagerly loaded (entity classes, auth providers, etc.).

### Wiring at Startup

In `app.module.ts`, the `APP_INITIALIZER` registers the lazy config and wires it to `ClassFactory`:

```typescript
{
    provide: APP_INITIALIZER,
    useFactory: (lazyRegistry: LazyModuleRegistry) => () => {
        lazyRegistry.RegisterBulk(LAZY_FEATURE_CONFIG);
        lazyRegistry.WireToClassFactory();
    },
    deps: [LazyModuleRegistry],
    multi: true
}
```

---

## The Lazy Feature Config

The file at `packages/Angular/Explorer/explorer-core/src/generated/lazy-feature-config.ts` is **auto-generated** by `mj codegen manifest --lazy-config`. Never edit it manually.

It maps compound `@RegisterClass` keys to dynamic `import()` loaders:

```typescript
// AUTO-GENERATED -- DO NOT EDIT

const loadCoreDashboardsModule = featureLoader(
  () => import('@memberjunction/ng-dashboards/core-dashboards.module')
);

export const LAZY_FEATURE_CONFIG: Record<string, () => Promise<void>> = {
  'BaseApplication::HomeApplication': loadCoreDashboardsModule,
  'BaseResourceComponent::HomeDashboard': loadCoreDashboardsModule,
  'BaseResourceComponent::APIKeysResource': loadCoreDashboardsModule,
  'BaseDashboard::EntityAdmin': loadCoreDashboardsModule,
  // ...
};
```

### Compound Key Format

Keys use the format `BaseClassName::Key`, matching the two arguments to `@RegisterClass(BaseClass, Key)`. This allows the lazy loader to handle any base class, not just `BaseResourceComponent`.

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
    "./core-dashboards.module": {
      "types": "./dist/core-dashboards.module.d.ts",
      "default": "./dist/core-dashboards.module.js"
    }
  }
}
```

Each subpath becomes a separately loadable chunk. Classes reachable from that subpath's entry point are grouped together.

### What qualifies a package for lazy loading?

The generator includes a package in the lazy config when ALL of these are true:

1. The package matches `--exclude-packages` (e.g., `@memberjunction`)
2. The package has at least one subpath export (key other than `"."` in `exports`)
3. The package is NOT the host package where the lazy config file lives
4. The package contains `@RegisterClass` decorators with key arguments

---

## Adding a New Component

When you add a new component with `@RegisterClass(BaseResourceComponent, 'MyNewResource')` to an existing feature module:

1. Add the component to the feature module's declarations and exports
2. That's it -- the generator discovers it automatically on next build

The component's `@RegisterClass` key is found during the AST scan, mapped to the subpath that contains it, and added to the lazy config with the compound key `BaseResourceComponent::MyNewResource`. No manual configuration needed.

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
  declarations: [MyNewComponent],
  exports: [MyNewComponent]
})
export class AIDashboardsModule { }
```

After rebuilding `explorer-core`, the lazy config automatically includes:
```
'BaseResourceComponent::MyNewResource': loadAiDashboardsModule,
```

---

## Adding Non-Angular Classes

The lazy loading system works with ANY `@RegisterClass` decorated class, not just Angular components. For example, `HomeApplication` is registered with `@RegisterClass(BaseApplication, 'HomeApplication')` and is lazy-loaded when `ApplicationManager` calls `CreateInstanceAsync`.

To make a non-Angular class lazy-loadable:

1. Ensure it's in a package with subpath exports
2. **Export it from the subpath module** -- this is critical. The class must be reachable from the subpath's entry point so ESBuild includes it in the chunk:

```typescript
// In core-dashboards.module.ts
export { HomeApplication } from './Home/home-application';
```

3. The generator picks up the `@RegisterClass` decorator and maps it with its base class: `'BaseApplication::HomeApplication': loadCoreDashboardsModule`
4. Any consumer using `CreateInstanceAsync` or `GetRegistrationAsync` will trigger the lazy load automatically

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
3. **Scan** each candidate for `@RegisterClass` decorators (captures both `baseClassName` and `key`)
4. **Resolve subpath membership**: for each class, determine which subpath export it belongs to by following `.d.ts` import/export chains
5. **Build compound keys**: combine `baseClassName` and `key` into `BaseClassName::Key` format
6. **Detect collisions**: error if the same compound key appears in different subpaths
7. **Generate** the TypeScript config file with write-on-change semantics (preserves mtime if unchanged)
8. **Coverage audit**: compare all `@RegisterClass` classes against the eager manifest + lazy config to detect gaps

### Key files

| File | Role |
|------|------|
| `packages/MJGlobal/src/ClassFactory.ts` | `RegisterLazyLoader`, `CreateInstanceAsync`, `GetRegistrationAsync` |
| `packages/CodeGenLib/src/Manifest/GenerateClassRegistrationsManifest.ts` | Generator implementation |
| `packages/MJCLI/src/commands/codegen/manifest.ts` | CLI command |
| `packages/Angular/Explorer/explorer-core/src/generated/lazy-feature-config.ts` | Generated output |
| `packages/Angular/Explorer/explorer-core/src/lib/services/lazy-module-registry.ts` | Runtime registry + ClassFactory wiring |

---

## Coverage Audit

After generating the lazy config, the codegen automatically runs a coverage audit. It compares all `@RegisterClass` classes in excluded packages against the lazy config to find gaps -- classes that won't be loaded at runtime because they're not in any subpath export.

```
--- Coverage Audit ---
Coverage audit passed: all 74 keyed @RegisterClass classes are covered
```

If gaps are found:

```
--- Coverage Audit ---
Coverage gap: 1 @RegisterClass class(es) will be tree-shaken:
  @memberjunction/ng-dashboards:
    - HomeApplication (BaseApplication, 'HomeApplication')
      Not in any subpath export. Add to a module or the eager manifest.
```

### Strict mode

Use `--strict` to make gaps a fatal error (useful for CI):

```bash
mj codegen manifest --exclude-packages @memberjunction --lazy-config ./lazy-config.ts --strict
```

---

## Regenerating the Config

The lazy config is regenerated automatically during `explorer-core`'s `prebuild` step. You can also run it manually:

```bash
# From repo root -- regenerates both the MJExplorer supplemental manifest and the lazy config
npm run mj:manifest:explorer

# Or regenerate ALL manifests (eager + lazy)
npm run mj:manifest
```

---

## Troubleshooting

### Component doesn't load when navigating to its tab

1. Check that the component has `@RegisterClass(SomeBase, 'UniqueKey')` with a key argument
2. Check that the component's feature module is listed in the package's `exports` field in `package.json`
3. Rebuild the package, then rebuild `explorer-core` to regenerate the lazy config
4. Verify the compound key (e.g., `BaseResourceComponent::UniqueKey`) appears in `src/generated/lazy-feature-config.ts`

### Non-Angular class not loading via CreateInstanceAsync

1. The class needs `@RegisterClass(BaseClass, 'Key')` with both arguments
2. The class must be **exported from a subpath module** (not just from the package's root `public-api.ts`)
3. Rebuild the package so the `.d.ts` files include the export, then regenerate the lazy config

### New package's components aren't in the lazy config

The package needs subpath exports in its `package.json`. Add an `exports` field with at least one subpath entry pointing to the module's `.d.ts` and `.js` files. See [Making a Package Lazy-Loadable](#making-a-package-lazy-loadable).

### Coverage audit reports gaps

A gap means a `@RegisterClass` class is in an excluded package but not reachable from any subpath export. Fix by:
1. Adding the class to an existing subpath module (import + re-export)
2. Creating a new subpath module for it
3. Or moving the class to a package that's in the eager manifest

### Changes to lazy config not taking effect

The lazy config lives in `explorer-core`, not `MJExplorer`. After regenerating, you need to rebuild `explorer-core` (not just MJExplorer) for the changes to compile into the package.
