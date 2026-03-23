# Angular Explorer Packages

These packages comprise the **MJExplorer** application, MemberJunction's primary Angular-based UI for browsing, editing, and managing data. They are published individually under the `@memberjunction` npm scope and consumed together by the MJExplorer host application.

## Packages

### Core / Shell

Foundational packages that provide the application shell, routing, authentication, shared utilities, and module bundling.

| Package | npm | Description |
|---------|-----|-------------|
| [explorer-app](./explorer-app/) | `@memberjunction/ng-explorer-app` | Complete branded entry point for Explorer-style applications |
| [explorer-core](./explorer-core/) | `@memberjunction/ng-explorer-core` | Core Explorer framework: application shell, routing, resource containers, and navigation |
| [explorer-modules](./explorer-modules/) | `@memberjunction/ng-explorer-modules` | Consolidated Explorer NgModule bundle that re-exports all Explorer feature modules |
| [kendo-modules](./kendo-modules/) | `@memberjunction/ng-kendo-modules` | Consolidated Kendo UI NgModule bundle for shared Kendo component imports |
| [base-application](./base-application/) | `@memberjunction/ng-base-application` | BaseApplication class system for app-centric navigation |
| [auth-services](./auth-services/) | `@memberjunction/ng-auth-services` | Authentication services with Auth0, MSAL, and Okta provider support |
| [shared](./shared/) | `@memberjunction/ng-shared` | Shared Explorer utilities, base components, services, and events used across Explorer packages |
| [workspace-initializer](./workspace-initializer/) | `@memberjunction/ng-workspace-initializer` | Workspace initialization service and components for bootstrapping the Explorer environment |

### Forms & Entity Editing

Components for rendering, editing, and managing entity records through metadata-driven forms.

| Package | npm | Description |
|---------|-----|-------------|
| [base-forms](./base-forms/) | `@memberjunction/ng-base-forms` | Base form components, field rendering, and validation framework |
| [core-entity-forms](./core-entity-forms/) | `@memberjunction/ng-core-entity-forms` | Auto-generated and custom entity forms with dynamic form loading and registration |
| [entity-form-dialog](./entity-form-dialog/) | `@memberjunction/ng-entity-form-dialog` | Modal dialog for displaying and editing any entity record |
| [form-toolbar](./form-toolbar/) | `@memberjunction/ng-form-toolbar` | Form action toolbar providing save, cancel, delete, and navigation controls |

### Data Grids & Lists

Grid and list components for browsing and managing collections of entity records.

| Package | npm | Description |
|---------|-----|-------------|
| [list-detail-grid](./list-detail-grid/) | `@memberjunction/ng-list-detail-grid` | Master-detail grid for displaying dynamic and saved list details |
| [simple-record-list](./simple-record-list/) | `@memberjunction/ng-simple-record-list` | Lightweight component for displaying, editing, creating, and deleting records in any entity |

### Dashboards

Dashboard components for administrative and analytical views.

| Package | npm | Description |
|---------|-----|-------------|
| [dashboards](./dashboards/) | `@memberjunction/ng-dashboards` | Dashboard components including AI model management, Entity Admin ERD, and Actions configuration |

### Utility & Navigation

Supporting components for linking, permissions, settings, and change tracking.

| Package | npm | Description |
|---------|-----|-------------|
| [link-directives](./link-directives/) | `@memberjunction/ng-link-directives` | Directives for turning elements into email, web, or record links |
| [entity-permissions](./entity-permissions/) | `@memberjunction/ng-entity-permissions` | Components for displaying and editing entity-level permissions |
| [explorer-settings](./explorer-settings/) | `@memberjunction/ng-explorer-settings` | Reusable components for the Explorer settings section |
| [record-changes](./record-changes/) | `@memberjunction/ng-record-changes` | Change-tracking dialog with diff visualization for individual records |

---

## Dynamic Loading Architecture

MJExplorer uses a fully metadata-driven architecture where routes, navigation, and component loading are resolved at runtime rather than statically declared. This enables unlimited custom dashboards and resources without changing core code.

### How Routing Works

Routes are **not** statically mapped to components. Instead, a `ResourceResolver` intercepts URL patterns and converts them into tab requests:

1. URL like `/app/Admin/AI%20Models` is activated
2. `ResourceResolver` reads the Application entity's `DefaultNavItems` JSON from the database
3. Finds the matching nav item by label, which specifies a `DriverClass` string (e.g. `"AIModelsResource"`) and `ResourceType` (e.g. `"Custom"`)
4. Calls `TabService.OpenTab()` with that configuration
5. `ResourceContainerComponent` renders the tab content (see next section)

This means Angular has no compile-time knowledge of which components map to which routes. Everything is resolved through metadata and the ClassFactory.

### How Components Are Discovered at Runtime

Every dashboard and resource component registers itself with MJGlobal's `ClassFactory` via the `@RegisterClass` decorator:

```typescript
@RegisterClass(BaseResourceComponent, 'AIModelsResource')
export class ModelManagementComponent extends BaseResourceComponent { }
```

When a tab becomes visible, `ResourceContainerComponent` does:
1. `ClassFactory.GetRegistration(BaseResourceComponent, 'AIModelsResource')` — looks up the component by string key
2. `viewContainerRef.createComponent(registeredClass)` — Angular's dynamic component API instantiates it
3. Wires up `Data` input and event callbacks

### Lazy Loading with Fallback

With the bundle-optimization work, not all components are in the initial bundle. The lazy loading infrastructure handles this transparently:

1. `ClassFactory.GetRegistration()` returns `null` — the class hasn't been loaded yet
2. `LazyModuleRegistry.Load('AIModelsResource')` fires, looking up the resource type in `LAZY_FEATURE_CONFIG`
3. The config maps to a dynamic import: `import('@memberjunction/ng-dashboards/ai-dashboards.module')`
4. The chunk loads, the module initializes, and `@RegisterClass` decorators execute — registering the components
5. Retry `ClassFactory.GetRegistration()` — now succeeds
6. Component renders normally

A `<mj-loading>` spinner displays during steps 2–4.

This fallback is wired into all three ClassFactory lookup sites: `ResourceContainerComponent.loadComponent()`, `TabContainerComponent` (tab content + display name), and `DashboardResource.loadCodeBasedDashboard()`.

### Tree-Shaking Prevention via Manifests

Modern bundlers (ESBuild, Vite) cannot detect that `ClassFactory.CreateInstance('AIModelsResource')` needs a specific class — there's no static import path. Without intervention, the bundler tree-shakes these classes as dead code.

MemberJunction solves this with **class registration manifests** generated by `mj codegen manifest`. The generator walks the dependency tree, finds every `@RegisterClass`-decorated class via TypeScript AST parsing, and emits a file with explicit named imports:

```typescript
import { ModelManagementComponent } from '@memberjunction/ng-dashboards';
import { PromptManagementComponent } from '@memberjunction/ng-dashboards';
// ... hundreds more

export const CLASS_REGISTRATIONS = [
    ModelManagementComponent,
    PromptManagementComponent,
    // ...
];
```

The bundler sees named imports referenced in an exported array — it **cannot** tree-shake them.

**Dual-manifest architecture:**
- **Pre-built manifests** ship inside bootstrap packages (`@memberjunction/ng-bootstrap`, `@memberjunction/ng-bootstrap-lite`). Generated at MJ release time, they cover all `@memberjunction/*` classes.
- **Supplemental manifests** are generated locally at `prestart`/`prebuild` with `--exclude-packages @memberjunction` to capture only user-defined custom classes.

For lazy-loaded modules, `ng-bootstrap-lite` intentionally **excludes** dashboard and settings packages. Those classes aren't in the initial manifest (so they're not in the initial bundle). They get pulled in via dynamic `import()` when the user navigates to them.

See [/packages/CodeGenLib/CLASS_MANIFEST_GUIDE.md](/packages/CodeGenLib/CLASS_MANIFEST_GUIDE.md) for comprehensive manifest documentation.

### Key Files

| File | Role |
|------|------|
| `explorer-core/.../app-routing.module.ts` | Route definitions and `ResourceResolver` |
| `explorer-core/.../resource-container-component.ts` | Dynamic component loading with lazy fallback |
| `explorer-core/.../services/lazy-module-registry.ts` | Manages lazy chunk loading and deduplication |
| `explorer-core/.../services/lazy-feature-config.ts` | Maps 60+ resource types to dynamic import functions |
| `dashboards/package.json` (exports field) | Subpath exports enabling ESBuild code splitting |
| `@memberjunction/ng-bootstrap-lite` | Pre-built manifest excluding lazy-loaded packages |
