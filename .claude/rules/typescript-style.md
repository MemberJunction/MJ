---
paths:
  - "**/*.ts"
---

# MemberJunction TypeScript Rules

Typing, class design, naming, and decomposition rules for all TypeScript in this repo.
Data access (`RunView`, `BaseEntity`, metadata, caching) lives in
[`data-access.md`](data-access.md); Angular-specific conventions live in
[`packages/Angular/CLAUDE.md`](../../packages/Angular/CLAUDE.md).

---

## 🚨 NO `any` TYPES - EVER

- **NEVER use `any` types in TypeScript code**
- **ALWAYS ask the user** if you think you need to use `any`
- The user will provide a proper typing solution in most cases
- This includes:
  - No `as any` type assertions
  - No `: any` type annotations
  - No `<any>` generic type arguments
  - No `unknown` as a lazy alternative
- **Why**: MemberJunction has strong typing throughout - there's always a proper type available

### Always Use Generics with Data Loading Methods
- `RunView<T>()` - for loading collections
- `GetEntityObject<T>()` - for creating new entity instances
- `Load<T>()` - for loading single records

This ensures TypeScript provides proper IntelliSense, compile-time checking, and prevents runtime errors.

```typescript
// ❌ Wrong - loses all type safety
const results: any = await rv.RunView({...});
const entity: any = await md.GetEntityObject('EntityName');

// ✅ Correct - full type safety with generics
const results = await rv.RunView<AIModelEntity>({
    EntityName: 'AI Models',
    ResultType: 'entity_object'
});
const entity = await md.GetEntityObject<AIModelEntity>('AI Models');
```

## 🚨 NO WEAK TYPING — NEVER USE BaseEntity `.Get()` / `.Set()` AS A SUBSTITUTE FOR GENERATED TYPES

- **NEVER use `record.Get('FieldName')` or `record.Set('FieldName', value)`** to access entity fields that should have strongly-typed properties
- **NEVER write code that depends on fields not yet in generated types** — if a migration hasn't run and CodeGen hasn't generated the types, **wait for CodeGen** before writing code that references those fields
- `.Get()` and `.Set()` are dynamic, stringly-typed accessors with zero compile-time safety — they bypass the entire point of MJ's generated entity classes
- The correct workflow when adding new database columns:
  1. Write the migration
  2. Run the migration + CodeGen to generate types
  3. **Then** write TypeScript code using the strongly-typed properties
- If you find yourself reaching for `.Get()` or `.Set()`, STOP — it means either:
  - The types exist and you should use the typed property instead
  - The types don't exist yet because CodeGen hasn't run — wait for it before writing dependent code
- **Why**: `.Get()`/`.Set()` fail silently on typos, have no IntelliSense, no refactoring support, and no compile-time checking. They are the `any` of the entity world.

## 🚨 DERIVE FIELD TYPES FROM THE ENTITY — NEVER HAND-COPY A VALUE-LIST UNION

- **When you need the TYPE of an entity field, derive it from the generated entity class (`SomeEntity['FieldName']`) or its underlying Zod schema — NEVER re-type the union by hand.**
- This matters most for **value-list / dropdown fields**, whose TypeScript union (e.g. `'Action' | 'Agent' | 'Infer' | 'FieldRules'`) is **CodeGen-generated from the column's CHECK constraint**. The union is a moving target: the moment a migration adds a value to the CHECK and CodeGen re-runs, the generated union grows. A hand-copied union does **not** grow with it.
- A hand-copied union is the typed equivalent of a magic string — it looks safe but **silently drifts** from the source of truth. The two real failure modes (both caught in this codebase when `'ML Model'` was added to `RecordProcess.WorkType`):
  1. **Assignment break** — copying `entity.WorkType` (the now-5-value generated union) into a projection/DTO/interface field still typed with the old 4 values fails to compile (`Type '"ML Model"' is not assignable to ...`).
  2. **Non-exhaustive switch** — a `switch (workType)` that returned for each of the old 4 cases now falls through on the new value (`Function lacks ending return statement`). Deriving the parameter type from the entity is precisely what surfaces this at compile time so you handle the new case.
- **The pattern:**
  ```typescript
  import type { MJRecordProcessEntity } from '@memberjunction/core-entities';

  // ✅ CORRECT — tracks the CodeGen union forever; new CHECK values flow through automatically
  interface FeaturePipelineSummary {
      WorkType: MJRecordProcessEntity['WorkType'];   // entity field type
  }
  // ✅ ALSO CORRECT — derive from another type that already derives from the entity
  interface FeaturePipelineCandidate {
      WorkType: FeaturePipelineSummary['WorkType'];  // stays in lockstep with the summary
  }

  // ❌ WRONG — a frozen copy; breaks (or goes non-exhaustive) the next time CodeGen widens the union
  interface FeaturePipelineSummary {
      WorkType: 'Action' | 'Agent' | 'FieldRules' | 'Infer';
  }
  ```
- This applies to **projection types, DTOs, view-models, agent-context shapes, AND test mock interfaces** — anywhere you'd otherwise restate an entity field's literal union. Indexed access (`Entity['Field']`) is zero-cost and erased at runtime; `import type { ... }` adds no runtime dependency.
- For switches over such a field, derive the parameter type from the entity **and** add a `default` branch — so the function stays total when CodeGen adds a value, while still giving known values explicit handling.
- **Related**: the CHECK constraint is the source of truth for the value list — see the value-list rule in [`migrations/CLAUDE.md`](../../migrations/CLAUDE.md) (drop + re-add the CHECK in one migration, then `mj codegen`).

## 🚨 NO RE-EXPORTS BETWEEN PACKAGES

- **NEVER re-export types, classes, or interfaces from other packages**
- **ALWAYS** import directly from the source package that defines them
- **Why**: Re-exports create confusing dependency chains, obscure the true source of types, and can cause issues with tree-shaking and bundle sizes
- Each package's `public-api.ts` or `index.ts` should only export:
  - Code defined within that package
  - Angular module, services, and components it provides
- Example:
  ```typescript
  // ❌ BAD - Re-exporting from another package
  export { ExportFormat, ExportOptions } from '@memberjunction/export-engine';

  // ✅ GOOD - Only export what this package defines
  export * from './lib/module';
  export * from './lib/export.service';
  export * from './lib/export-dialog.component';
  // NOTE: For export types, import directly from @memberjunction/export-engine
  ```
- Consumers should import types from their original source package
- Add comments directing users to the correct import location when helpful

## 🚨 USE BaseSingleton FOR ALL SINGLETONS

- **NEVER use manual `static _instance` singleton patterns** — always extend `BaseSingleton<T>` from `@memberjunction/global`
- **Why**: `BaseSingleton` uses a Global Object Store (`GetGlobalObjectStore()`) that guarantees a single instance across the entire process — even when bundlers duplicate code across multiple execution paths. A plain `static _instance` field lives on the class constructor, so if a module gets loaded twice (common with ESBuild/Vite code splitting), you silently get two "singletons" with divergent state.
- **How to use it**:
  ```typescript
  import { BaseSingleton } from '@memberjunction/global';

  export class MySingleton extends BaseSingleton<MySingleton> {
      // Constructor MUST be protected (BaseSingleton enforces this)
      protected constructor() {
          super();
      }

      // Expose a static accessor that calls the inherited getInstance()
      public static get Instance(): MySingleton {
          return MySingleton.getInstance<MySingleton>();
      }

      // ... your singleton methods and properties
  }

  // Usage
  const instance = MySingleton.Instance;
  ```
- **Anti-pattern to avoid**:
  ```typescript
  // ❌ BAD — weak singleton, breaks under code duplication
  export class MySingleton {
      private static _instance: MySingleton;
      public static get Instance(): MySingleton {
          if (!MySingleton._instance)
              MySingleton._instance = new MySingleton();
          return MySingleton._instance;
      }
  }
  ```
- **Known weak singletons** that need migration: ~26 classes across the codebase including `GraphQLDataProvider`, `UserCache`, `StartupManager`, `RunQuerySQLFilterManager`, `QueueManager`, `SQLExpressionValidator`, `WarningManager`, `AuthProviderFactory`, `MCPClientManager`, `AgentDataPreloader`, and Angular/React services. See GitHub issue tracking this migration.

## 🚨 NO DYNAMIC `import()` UNLESS NARROWLY JUSTIFIED

- **Default to static `import ... from '...'` at the top of the file.** Never use `await import('pkg')` or `import('pkg')` inside a function body as a shortcut.
- **Why**: Dynamic imports hide the dependency from npm, bundlers, and readers. This caused a real shipping bug: MJCLI's `mj app *` commands dynamic-imported `@memberjunction/open-app-engine`, which was never declared in MJCLI's `package.json` — `npm install -g @memberjunction/cli` worked but every `mj app` invocation crashed with `ERR_MODULE_NOT_FOUND` in production. Static imports would have failed the TypeScript build immediately.
- **Additional problems with dynamic imports**:
  - Break tree-shaking and bundle analysis
  - Defeat IDE "Find References" / rename refactors
  - Obscure circular dependencies (make them silent instead of loud)
  - Turn compile-time errors into runtime errors
  - Create confusion about when a module actually loads

### The ONLY acceptable reasons for dynamic `import()`
1. **Angular lazy-loaded routes / `loadComponent()`** — framework-required for code splitting.
2. **Optional peer dependencies** — e.g. cloud SDKs (`@aws-sdk/client-kms`, `@azure/keyvault-keys`) loaded only when that provider is configured. Must be declared in `optionalDependencies` or `peerDependenciesMeta`.
3. **Genuine bundle-size deferral** — a single heavy module (e.g. `xlsx` in MJExportEngine) loaded only on the code path that needs it, where loading it eagerly measurably hurts startup. Rare.
4. **Breaking a hard circular dependency** — last resort after you've tried restructuring. Add a comment explaining the cycle and why it can't be untangled.
5. **Runtime plugin discovery from config/glob** — loading user-supplied resolver/middleware modules whose paths aren't known at build time.

**If your reason isn't on this list, use a static import.** "It's only used in one method" is not a reason. "The package is big" is not a reason unless you've measured the startup cost. "It avoids a dependency declaration" is the exact bug we're trying to prevent.

### When you do need a dynamic import
- Add a comment explaining *which* category above it falls under and why a static import won't work.
- **Still declare the package in `dependencies`** (or `optionalDependencies` / `peerDependencies`). Dynamic import does not exempt you from the dep graph.
- Prefer a single top-of-module dynamic load behind a memoized promise over repeated `await import()` inside every method.

### Local CI mirror — native-ESM import guard
The unit-test workflow imports every built `"type": "module"` package's entry point in a fresh native-ESM Node process and fails on the extensionless-relative-specifier signature in a package's own `dist/` (the `ERR_MODULE_NOT_FOUND` bug class that `tsc` + bundler builds tolerate but plain Node / Vitest-externalized deps / non-symlinked installs reject). Run it locally before pushing a `type: module` package change:

- `npm run check:esm` — sweep all built `type: module` packages under `packages/` (needs a prior `npm run build`; unbuilt packages classify `NOT_BUILT` and skip)
- `npm run check:esm:test` — the guard's own vitest suite (entry-point resolution, failure classification, CLI contract)

The guard lives at `.github/scripts/check-esm-imports.mjs`. Only `OWN_DIST_MISSING_EXT` fails the gate; dependency failures, side-effect crashes, and unbuilt packages are reported but non-gating.

---

## Code Style Guide

- Use TypeScript strict mode and explicit typing
- Always use MemberJunction generated `BaseEntity` sub-classes for all data work for strong typing
- Study the data model in `/packages/MJCoreEntities` to understand the schema and use properties/fields defined there
- No explicit `any` types - see above
- Prefer union types over enums for better package exports (e.g., `type Status = 'active' | 'inactive'` instead of `enum Status`)
- Prefer object shorthand syntax
- Follow existing naming conventions:
  - PascalCase for classes and interfaces
  - **PascalCase for public class members** (properties, methods, `@Input()`, `@Output()`) — and remember TypeScript's default visibility is *public*, so a member with **no** access modifier follows this rule too
  - **camelCase for `private` class members** (a leading `_` is fine — `_config` backing a `public get Config()` is idiomatic)
  - **PascalCase for `protected` extension points** — see the carve-out below; `protected` is NOT camelCase in MJ
  - **PascalCase for exported functions, classes, interfaces, types and enums**; exported value `const`s are PascalCase or `SCREAMING_SNAKE`
  - `SCREAMING_SNAKE_CASE` for constants, at any visibility
  - camelCase for local variables and function parameters
  - Use descriptive names and avoid abbreviations
- Imports: group imports by type (external, internal, relative)
- Error handling: use try/catch blocks and provide meaningful error messages
- Document public APIs with TSDoc comments
- Follow single responsibility principle
- Keep functions focused and concise - avoid overly long functions
  - Functions should have a clear, single purpose
  - Break complex operations into smaller, well-named helper functions
  - Aim for functions that fit on a single screen when possible

### Class Member Naming Convention (IMPORTANT)

MemberJunction uses **PascalCase for all public class members** and **camelCase for `private` members**. `protected` members are PascalCase when they are inherited extension points — see the carve-out below. This applies to:

```typescript
// ✅ CORRECT - MemberJunction naming convention
export class MyComponent {
    // Public properties - PascalCase
    @Input() QueryId: string | null = null;
    @Input() AutoRun: boolean = false;
    @Output() EntityLinkClick = new EventEmitter<EntityLinkEvent>();

    public IsLoading: boolean = false;
    public SelectedRows: Record<string, unknown>[] = [];

    // Private/protected properties - camelCase
    private destroy$ = new Subject<void>();
    private _internalState: string = '';
    protected cdr: ChangeDetectorRef;

    // Public methods - PascalCase
    public LoadData(): void { }
    public OnGridReady(event: GridReadyEvent): void { }
    public GetSelectedRows(): Record<string, unknown>[] { }

    // Private/protected methods - camelCase
    private buildColumnDefs(): void { }
    protected applyVisualConfig(): void { }
}

// ❌ WRONG - Standard TypeScript convention (not used in MJ)
export class MyComponent {
    @Input() queryId: string | null = null;  // Should be PascalCase
    public isLoading: boolean = false;        // Should be PascalCase
    public loadData(): void { }               // Should be PascalCase
}
```

**Why this matters:**
- Consistency across the entire MemberJunction codebase
- Clear visual distinction between public API and internal implementation
- Matches the naming style used in MJ's generated entity classes
- HTML template bindings must match the PascalCase property names

#### 🚨 `protected` is PascalCase, not camelCase

MJ's base classes declare **PascalCase protected extension points**, and an override must match the
parent's casing exactly. `BaseAction.InternalRunAction` is overridden ~300 times;
`BaseEngine.AdditionalLoading`, `BaseResourceComponent.OnQueryParamsChanged` and `ProviderToUse` are
the same shape. This is the template-method pattern and it is load-bearing, so **write new protected
extension points in PascalCase** and never "fix" an existing one — renaming it breaks every subclass.

The `private`/`protected` split is therefore not symmetric: `private` has no inheritance contract to
honour, so it stays camelCase and is the only half the gate enforces.

```typescript
export class MyAction extends BaseAction {
    protected async InternalRunAction(params: RunActionParams): Promise<ActionResultSimple> { }  // ✅ matches the base
    private buildPayload(): Payload { }                                                          // ✅ camelCase
    private BuildPayload(): Payload { }                                                          // ❌ flagged
}
```

#### Exported members are API surface too

An exported type's members are a published contract, so the rule reaches them: members of an
exported `interface`, of an exported `type` alias's object literals, and of an exported `enum` are
PascalCase. Members of a **non-exported** interface are an implementation detail and are not
checked. Public constructor parameter properties (`constructor(public QueryId: string)`) are class
members and follow the member rule. Names published via `export { Foo }` follow the export rule.

An interface that `extends` another, or a class that `implements` one, inherits its names — the
finding lands on the declaring interface, which is the one place a rename can start. For a payload
that mirrors a vendor's JSON (`access_token`), keep the remote casing and use the marker.

#### Exported functions are PascalCase

The repo was split almost evenly with nothing written down, so this is now settled: the public API
surface is PascalCase whether it is a class member or a module export. A `const` holding an arrow
function follows the function rule, not the const rule.

```typescript
export function EscapeSQLString(v: string): string { }   // ✅
export const ResolveRestore = () => { };                 // ✅
export function computeContentHash(): string { }         // ❌ flagged
export const TERMINAL_STATUSES = ['Complete'];           // ✅ value const — SCREAMING_SNAKE
```

#### The gate

Enforced on every PR by the `naming-conventions` standard — an AST pass over every `.ts` file.
Severity says whether a **compatible fix exists**: anything a deprecated stub can fix — class
members, exported functions and consts — is an `error` and fails the build. Members of an exported
data shape are a `warn`, because an interface is erased at compile time, so there is no carrier for
a stub and no rename that keeps consumers compiling.

**The fix is a rename plus a deprecated stub**, which is what the gate is built around:

```typescript
public LoadData(): void { /* the real implementation */ }

/** @deprecated Use {@link LoadData}. */
public loadData(): void { return this.LoadData(); }
```

Anything carrying `@deprecated` is exempt, so the stub is not itself a violation. Name the
replacement with `{@link}` and give no removal version.

```bash
pnpm run check:naming       # this check alone
pnpm run check:standards    # every adopted standard, as CI runs it
```

Framework contracts (Angular `ng*` hooks, oclif command members, base-class overrides, `__mj_*`
columns, `SCREAMING_SNAKE` constants, `@HostListener`/`@HostBinding`) are exempt automatically. For
anything else, `// case-violation-ok-legacy-back-compat: <reason>` on the offending line or the one directly above it.
Full detail, including why renaming an Angular `@Input()` also means editing its HTML template:
[`guides/NAMING_CONVENTIONS_GUIDE.md`](../../guides/NAMING_CONVENTIONS_GUIDE.md).

---

## 🚨 IMPORTANT: FUNCTIONAL DECOMPOSITION IS MANDATORY 🚨

### Small, Focused Functions Are Required
- **NEVER** write long, monolithic functions that do multiple things
- **ALWAYS** decompose complex operations into smaller, well-named helper functions
- **MAXIMUM** function length should be ~30-40 lines (excluding comments)
- If a function is getting long, STOP and refactor it immediately

### Benefits We Expect
- **Readability**: Each function has a clear, single purpose
- **Testability**: Small functions are easier to unit test
- **Maintainability**: Bugs are easier to locate and fix
- **Reusability**: Small functions can be composed and reused
- **Debugging**: Stack traces are more meaningful with well-named functions

### Example of Good Decomposition
```typescript
// BAD: One long function doing everything
protected generateCascadeDeletes(entity: EntityInfo): string {
    // 200+ lines of nested loops and complex logic...
}

// GOOD: Decomposed into focused functions
protected generateCascadeDeletes(entity: EntityInfo): string {
    const operations = this.findRelatedEntities(entity);
    return operations.map(op => this.generateSingleOperation(op)).join('\n');
}

protected findRelatedEntities(entity: EntityInfo): Operation[] {
    // Just finds the related entities
}

protected generateSingleOperation(operation: Operation): string {
    // Handles one operation type
}
```

### When to Decompose
- Function exceeds 30-40 lines
- You need to write a comment explaining what a section does
- You have nested loops or conditions beyond 2 levels
- You're repeating similar logic patterns
- The function name would need "And" to be accurate

---

## Object-Oriented Design Principles

### Code Reuse and DRY (Don't Repeat Yourself)
- **ALWAYS** look for repeated code patterns and refactor them into base classes or shared utilities
- When you notice similar code in multiple places (e.g., parameter validation, error handling, common operations):
  - Create abstract base classes for shared functionality
  - Extract common methods into utility functions
  - Use inheritance and composition to reduce duplication
- Example patterns to watch for:
  - Multiple actions with similar parameter extraction logic → Create base action class
  - Repeated error handling code → Create shared error analysis methods
  - Common entity operations → Create entity helper utilities
- Benefits of proper OOD:
  - Easier maintenance (fix bugs in one place)
  - Better consistency across the codebase
  - Improved testability
  - Clearer separation of concerns

### When to Create Base Classes
- 3+ classes with similar structure/behavior
- Shared validation or processing logic
- Common error handling patterns
- Repeated boilerplate code
- Clear "is-a" relationships between classes

---

## Lint & Format
- Check with ESLint: `npx eslint packages/path/to/file.ts`
- Format with Prettier: `npx prettier --write packages/path/to/file.ts`
