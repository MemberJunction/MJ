# Angular Explorer Packages

These packages comprise the **MJExplorer** application, MemberJunction's primary Angular-based UI for browsing, editing, and managing data. They are published individually under the `@memberjunction` npm scope and consumed together by the MJExplorer host application.

## Guides

- **[Navigation & Routing Guide](../../../guides/NAVIGATION_AND_ROUTING_GUIDE.md)** — How navigation, URL sync, back/forward, and query param sub-navigation work in MJ Explorer
- **[Dashboard Best Practices](../../../guides/DASHBOARD_BEST_PRACTICES.md)** — Architecture patterns for building dashboards

## Packages

### Core / Shell

Foundational packages that provide the application shell, routing, authentication, shared utilities, and module bundling.

| Package | npm | Description |
|---------|-----|-------------|
| [explorer-app](./explorer-app/) | `@memberjunction/ng-explorer-app` | Complete branded entry point for Explorer-style applications |
| [explorer-core](./explorer-core/) | `@memberjunction/ng-explorer-core` | Core Explorer framework: application shell, routing, resource containers, and navigation |
| [explorer-modules](./explorer-modules/) | `@memberjunction/ng-explorer-modules` | Consolidated Explorer NgModule bundle that re-exports all Explorer feature modules |
| [base-application](./base-application/) | `@memberjunction/ng-base-application` | BaseApplication class system for app-centric navigation |
| [auth-services](./auth-services/) | `@memberjunction/ng-auth-services` | Authentication services with Auth0, MSAL, and Okta provider support |
| [shared](./shared/) | `@memberjunction/ng-shared` | Shared Explorer utilities, base components, services, and events used across Explorer packages |
| [workspace-initializer](./workspace-initializer/) | `@memberjunction/ng-workspace-initializer` | Workspace initialization service and components for bootstrapping the Explorer environment |

### Forms & Entity Editing

Components for rendering, editing, and managing entity records through metadata-driven forms.

| Package | npm | Description |
|---------|-----|-------------|
| [base-forms](../Generic/base-forms) | `@memberjunction/ng-base-forms` | Base form components, field rendering, and validation framework |
| [core-entity-forms](./core-entity-forms/) | `@memberjunction/ng-core-entity-forms` | Auto-generated and custom entity forms with dynamic form loading and registration |
| [entity-form-dialog](./entity-form-dialog/) | `@memberjunction/ng-entity-form-dialog` | Modal dialog for displaying and editing any entity record |

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
1. `ClassFactory.GetRegistrationAsync(BaseResourceComponent, 'AIModelsResource')` — async lookup that triggers lazy loading if needed
2. `viewContainerRef.createComponent(registeredClass)` — Angular's dynamic component API instantiates it
3. Wires up `Data` input and event callbacks

### Universal Lazy Loading via ClassFactory

Not all components are in the initial bundle. Lazy loading is handled universally by `ClassFactory` itself — no consumer-specific retry logic needed:

1. `ClassFactory.GetRegistrationAsync()` tries sync lookup first
2. If `null`, calls registered lazy loaders with `('BaseResourceComponent', 'AIModelsResource')`
3. `LazyModuleRegistry` builds the compound key `'BaseResourceComponent::AIModelsResource'` and looks it up in `LAZY_FEATURE_CONFIG`
4. The config maps to a dynamic import: `import('@memberjunction/ng-dashboards/ai-dashboards.module')`
5. The chunk loads, `@RegisterClass` decorators execute — ClassFactory now has the class
6. Retry succeeds, component renders normally

This works for ALL base classes (`BaseResourceComponent`, `BaseDashboard`, `BaseApplication`, etc.), not just resource components. Any consumer using `CreateInstanceAsync` or `GetRegistrationAsync` gets lazy loading automatically.

See `guides/LAZY_LOADING_GUIDE.md` for the complete guide.

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

See [/packages/CodeGenLib/CLASS_MANIFEST_GUIDE.md](../../../plans/complete/codegen/CLASS_MANIFEST_GUIDE.md) for comprehensive manifest documentation.

### Key Files

| File | Role |
|------|------|
| `explorer-core/.../app-routing.module.ts` | Route definitions and `ResourceResolver` |
| `explorer-core/.../resource-container-component.ts` | Dynamic component loading with lazy fallback |
| `explorer-core/.../services/lazy-module-registry.ts` | Manages lazy chunk loading and deduplication |
| `explorer-core/.../services/lazy-feature-config.ts` | Maps 60+ resource types to dynamic import functions |
| `dashboards/package.json` (exports field) | Subpath exports enabling ESBuild code splitting |
| `@memberjunction/ng-bootstrap-lite` | Pre-built manifest excluding lazy-loaded packages |
