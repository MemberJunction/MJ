# Don't do this — the consolidated anti-pattern cheat sheet

A quick-reference list of the most common ways to write code that *looks*
fine and *runs* fine but breaks something real in MJ. Each entry is short
and points at the file with the full rule.

## Data access

**❌ `new UserEntity()`** — bypasses the class factory; you miss subclass
overrides registered with `@RegisterClass`.
✅ `await md.GetEntityObject<UserEntity>('Users', contextUser)` — see `02-entity-essentials.md`.

**❌ `user.Set('Email', value)` / `user.Get('Email')`** — stringly-typed
accessors. No type safety, no IntelliSense, no refactor support. Silent
failures on typos.
✅ `user.Email = value` — typed property. Use these always. `.Get()`/`.Set()`
are only legit when the field name is genuinely runtime-dynamic. See `02-entity-essentials.md`.

**❌ `{ ...user, extraField: 'x' }`** — spread on a BaseEntity gives you an
*empty object*. BaseEntity uses getters, which aren't enumerable, so the
spread captures nothing.
✅ `{ ...user.GetAll(), extraField: 'x' }` — see `02-entity-essentials.md`.

**❌ Forgetting to check `result.Success` on `RunView`** — RunView doesn't
throw on bad filters or permission denials. `try/catch` won't catch them.
✅ `if (!result.Success) { console.error(result.ErrorMessage); return; }`
— see `03-runview-patterns.md`.

**❌ Forgetting to check the boolean return of `Save()` / `Delete()`** —
they return `false` on validation/permission failure, NOT throw. Silent
failures await.
✅ `const saved = await entity.Save(); if (!saved) { console.error(entity.LatestResult?.CompleteMessage); }` — see `02-entity-essentials.md`.

**❌ `md.Entities.find(e => e.Name === 'Channel Actions')`** — O(N),
case-sensitive, whitespace-sensitive. `'channel actions'` won't match.
✅ `md.EntityByName('Channel Actions')` — O(1), case-insensitive, trim-tolerant. See `02-entity-essentials.md`.

**❌ Querying inside a loop (`for (const x of xs) { await rv.RunView(...) }`)**
— N+1 round trips. Slow even with caches.
✅ One outer query covering all IDs, then aggregate in memory. See `03-runview-patterns.md`.

**❌ `ResultType: 'entity_object'` with `Fields: [...]`** — `Fields` is
silently ignored when you want entity objects; the framework loads everything.
✅ `ResultType: 'simple'` if you want a partial projection. See `03-runview-patterns.md`.

**❌ Forgetting `contextUser` server-side** — `RunView` / `GetEntityObject`
without `contextUser` on the server breaks row-level security, audit
trails, and per-row permissions.
✅ Always pass `contextUser` as the second argument on the server. See `02-entity-essentials.md`.

## Types

**❌ `any` anywhere** — discards everything CodeGen worked to give you.
✅ Use the generic on the data-loading method: `RunView<OrderEntity>({...})`. See `04-type-safety.md`.

**❌ `as unknown as X`** — same anti-pattern in a sneakier outfit.
✅ The framework already has a typed return; find the generic before casting.

**❌ Reaching for `.Set()` / `.Get()` because "the field doesn't exist in
the generated types yet"** — sign that you haven't run CodeGen since the
migration.
✅ Stop. Run `mj codegen`. Then write the code with the typed property. See `06-codegen-contract.md`.

## Architecture

**❌ Action calling another Action** — loses type safety, adds metadata-lookup
overhead, breaks debuggability.
✅ Both Actions call the same service class directly. See `05-actions-philosophy.md`.

**❌ `class Foo { private static _instance: Foo; }`** — looks like a
singleton; breaks under bundler code duplication (two instances with
divergent state).
✅ `class Foo extends BaseSingleton<Foo>` — global object store guarantees one instance. See `08-singletons.md`.

**❌ `await import('@some/dep')` inside a method body** — dependency
invisible to npm and bundlers. Real shipping bug pattern: the dep gets
omitted from `package.json` and production crashes at runtime.
✅ Static import at the top of the file. The 5 legitimate dynamic-import
exceptions are listed in `09-imports-and-deps.md`.

**❌ Re-exporting types from another package**:
```typescript
export { ExportFormat } from '@memberjunction/export-engine'; // ❌
```
Obscures the source, confuses the dependency graph, breaks tree-shaking.
✅ Consumers import directly from the original source package. See `09-imports-and-deps.md`.

## Database

**❌ Hand-adding `__mj_CreatedAt` / `__mj_UpdatedAt` to a CREATE TABLE**
— CodeGen owns these. Adding them manually causes conflicts on
re-generation.
✅ Leave them out — CodeGen adds them with proper defaults and triggers. See `07-migrations-basics.md`.

**❌ Hand-adding FK indexes** — CodeGen creates `IDX_AUTO_MJ_FKEY_*`
indexes for every FK. Manual ones duplicate the work.
✅ Just declare the FK constraint; the index follows. See `07-migrations-basics.md`.

**❌ `INSERT ... VALUES (NEWID(), ...)`** in migrations — every install
gets a different ID for the same logical row. Cross-environment
referential integrity breaks.
✅ Hardcoded UUID literal: `INSERT ... VALUES ('a1b2c3d4-...-...', ...)`. See `07-migrations-basics.md`.

**❌ Hardcoded `__mj.` schema name** — breaks customer installs that use
a custom default schema.
✅ `${flyway:defaultSchema}.SomeTable`. See `07-migrations-basics.md`.

**❌ `INSERT` statements in migrations to seed reference data** — brittle,
hard to maintain, fights CodeGen.
✅ Use mj-sync metadata files instead. See `16-metadata-files.md`.

**❌ Editing files in a `generated/` folder** — your changes vanish on
the next CodeGen run.
✅ Extend or subclass the generated class. See `06-codegen-contract.md` and `10-angular-essentials.md`.

## UI / Angular

**❌ Forking the generated Angular form to customize it** — fragile,
loses updates when CodeGen regenerates.
✅ Extend the generated class with `@RegisterClass(BaseFormComponent, 'EntityName')`.
The import order makes your subclass win the factory priority race. See
`10-angular-essentials.md`.

**❌ `<mj-form-toolbar>` directly in a form template** — the toolbar
fires events but the panels (History / Tags / Add-to-List) don't open
because nothing's listening. Silent feature breakage.
✅ Wrap in `<mj-record-form-container>` — see `10-angular-essentials.md`.

**❌ Custom spinners in templates** (`<div class="spinner">...</div>`) —
inconsistent visual design, dead code duplicated everywhere.
✅ `<mj-loading text="..."/>` — see `10-angular-essentials.md`.

**❌ Hardcoded hex colors in component CSS** (`color: #333; background: #f5f5f5;`)
— breaks dark mode, prevents white-labeling.
✅ Semantic design tokens (`color: var(--mj-text-primary);`). See `11-design-tokens.md`.

**❌ Primitive tokens in component CSS** (`var(--mj-color-neutral-300)`)
— primitives don't adapt to themes.
✅ Semantic tokens (`var(--mj-text-muted)`). See `11-design-tokens.md`.

**❌ `<mj-loading *ngIf="...">`, `<thing *ngFor="...">`** — legacy syntax,
slower, heading toward deprecation.
✅ `@if (...)` / `@for (item of items; track ...)` block syntax. See `10-angular-essentials.md`.

**❌ Forgetting `NotifyLoadComplete()` in a `BaseResourceComponent`** —
the shell loading screen hangs forever on direct-URL navigation.
✅ Call `this.NotifyLoadComplete()` at the end of `ngOnInit()`. See `10-angular-essentials.md`.

## Code quality

**❌ A 200-line function with "section" comments** — unmaintainable.
✅ Extract each section into a named helper. The 30-40 line ceiling is
the trigger. See `13-functional-decomposition.md`.

**❌ camelCase public class members** — inconsistent with CodeGen-emitted
entity classes and the rest of the MJ codebase.
✅ PascalCase public, camelCase private/protected. See `12-class-naming.md`.

**❌ Unit tests that hit a real database or network** — non-deterministic,
slow, brittle.
✅ Mock the provider, mock `RunView`, mock `https.get`. Use
`@memberjunction/test-utils`. See `14-testing.md`.

**❌ Skipping tests after changing source** — bugs ship.
✅ Run `npm run test` in the affected package. Update test assertions if
behavior changed; fix unrelated failures. See `14-testing.md`.

## Performance

**❌ Manually caching `RunView` results in a module-level Map** — fights
the server-side cache, doesn't get invalidated on entity changes.
✅ Trust the framework's cache. See `15-performance-and-caching.md`.

**❌ `BypassCache: true` to "make sure the read is fresh"** — the cache
already invalidates on `Save()` / `Delete()`. You don't need this for
normal flows.
✅ Only use `BypassCache` when you bypassed the framework itself (direct
SQL, maintenance Action). See `15-performance-and-caching.md`.

## Workflow

**❌ Editing a file under `generated/` to "fix" something** — overwritten
on next codegen.
✅ Fix the input — migration, metadata, entity description. See `06-codegen-contract.md`.

**❌ `git commit` before running tests** — broken tests slip into the
default branch.
✅ `npm run test` in every package you changed, then commit.

**❌ Skipping the `sp_addextendedproperty` description for a new column** —
no JSDoc on the generated property, no tooltip in the Angular form, no
description in the GraphQL schema.
✅ Four lines per column; spend them. See `07-migrations-basics.md`.

If you find yourself doing any of these and unsure why it's discouraged,
follow the link to the file with the full rule.
