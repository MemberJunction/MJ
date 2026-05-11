# MemberJunction Project Guidance

This file is loaded by Claude Code at session start so Claude has the context
it needs to write idiomatic MemberJunction code in your project.

It's part of the **MJ Claude Pack** — a curated bundle of MJ-specific
guidance, slash commands, and skills shipped alongside every MJ install.

## What this pack gives you

- **`CLAUDE.md`** at your repo root — the file Claude reads first. Imports
  the MJ guidance below, leaves a free section for your own project notes.
- **`.claude/mj/`** — the managed bundle (this folder). Regenerated on update,
  not meant to be hand-edited.
- **`.claude/commands/`** — slash commands tuned for MJ work (`/commit`,
  `/new-branch`, `/create-pr`, the speckit suite, …).
- **`.claude/skills/`** — opt-in skills like `playwright-cli` for browser testing.
- **`.claude/settings.json`** — a small permissions allowlist so Claude doesn't
  have to ask permission to run `npm run build` every time.

## Keeping the pack fresh

The pack identifies its own version. To pull the latest:

```bash
mj update:claude --check    # see if an update is available
mj update:claude            # apply the update (managed block + .claude/mj/)
```

The MJ-managed block in your `CLAUDE.md` and the entire `.claude/mj/` folder
are regenerated on update. Your own notes under `## Project notes` and any
slash commands you've customized are preserved.

## How to add your own guidance

Below the `<!-- MJ-MANAGED:CLAUDE-PACK END -->` marker in `CLAUDE.md` is a
free section. Add project-specific instructions there:

- Team naming conventions specific to your codebase
- Pointers to your internal docs or runbooks
- Domain-specific guidance Claude can't infer from the code

Anything in that section is yours forever — `mj update:claude` won't touch it.

## Where to find help

- **MJ docs** — https://docs.memberjunction.org
- **GitHub** — https://github.com/MemberJunction/MJ
- **Issues / questions** — https://github.com/MemberJunction/MJ/issues
- **The pack source** — https://github.com/MemberJunction/MJ/tree/main/templates/claude-pack

---

# MemberJunction — The Mental Model

A one-page tour of the parts you'll touch when building on top of MemberJunction.
Read this before writing the first line of code in an MJ project — almost every
later rule in this pack assumes you understand these pieces.

## What MJ actually is

MemberJunction is a **metadata-driven application framework**. The database
itself describes the shape of every entity in your app — tables, fields, foreign
keys, constraints — and a code generator (**CodeGen**) reads that metadata and
emits typed TypeScript classes, stored procedures, GraphQL schemas, and Angular
forms.

You write **less** glue code than in a typical app. The metadata is the source
of truth; everything else — your entity classes, your CRUD operations, your
admin forms — is regenerated from it.

This has three consequences worth absorbing now:

1. **You rarely write database access by hand.** You ask for an entity object
   through the `Metadata` system; you save it; the framework takes care of the
   rest (SQL, validation, change tracking, optimistic concurrency).
2. **You don't write CRUD UI from scratch.** Forms are generated; you customize
   them by extending a generated base class.
3. **You don't keep types in sync manually.** Add a column to the database,
   re-run CodeGen, and your TypeScript types update automatically.

## The pieces of an MJ install

When you run `mj install`, you end up with a workspace that looks something like:

```
<your-project>/
├── apps/
│   ├── MJAPI/         GraphQL + REST API server (Node, Apollo)
│   └── MJExplorer/    Angular SPA — admin UI for browsing/editing all entities
├── migrations/        Flyway-style SQL migrations
├── metadata/          mj-sync declarative metadata files (reference data, configs)
├── packages/          Your custom packages — actions, agents, entity overrides
├── mj.config.cjs      Database connection, ports, pool settings
└── package.json       npm workspace root
```

The two apps — **MJAPI** and **MJExplorer** — are the runtime. You typically:

- Run `npm run start:api` to bring up MJAPI on the configured GraphQL port.
- Run `npm run start:explorer` to bring up MJExplorer (Angular dev server).
- Use Explorer to browse data and metadata; use MJAPI for your app's GraphQL
  endpoints.

## The metadata layer

The MJ database has a `__mj` schema containing the metadata that describes
your other tables: `Entity`, `EntityField`, `EntityRelationship`, etc. CodeGen
scans the database, reads that metadata, and writes:

- **Typed entity classes** for every entity (e.g. `UserEntity`, `OrderEntity`).
- **Stored procedures** for create/update/delete (`spCreate<Entity>`, …).
- **Database views** for queries with joins and computed fields.
- **Angular form components** for browsing and editing each entity.

You **never edit generated files** — they live in `generated/` folders and
get overwritten on the next CodeGen run. If you need to customize a generated
class or form, you **extend** it (see [Custom forms](#angular-forms-extension-pattern)
below).

## The entity model in two paragraphs

Every entity in MJ has a class extending `BaseEntity`. To work with a record,
you go through the `Metadata` provider:

```typescript
import { Metadata } from '@memberjunction/core';
import { UserEntity } from '@memberjunction/core-entities';

const md = new Metadata();
const user = await md.GetEntityObject<UserEntity>('Users', contextUser);
await user.Load('a1b2c3...');     // load by primary key
user.LastLoginAt = new Date();     // typed property — IntelliSense + compile-time check
const saved = await user.Save();   // returns boolean, NOT throws on validation failure
```

Two things to internalize:

- **Never `new UserEntity()` directly.** Always go through `Metadata.GetEntityObject<T>(entityName, contextUser)` so the class factory can return the right subclass (you or someone else may have registered a custom override).
- **`Save()` and `Delete()` return booleans.** Check the return value. The error details are on `entity.LatestResult?.CompleteMessage`. Treat them like `boolean` returns from filesystem operations — not like methods that throw.

The next file (`02-entity-essentials.md`) goes deep on the entity patterns.

## Providers — where the data actually comes from

MJ separates "what an entity is" (metadata) from "where the data lives"
(provider). The default provider talks to SQL Server or PostgreSQL via the
MJAPI server, but the abstraction means the same entity code works in:

- **Server-side code** (inside MJAPI, GraphQL resolvers, custom resolvers).
- **Browser code** (Angular components in MJExplorer or your own SPA, fetching
  over GraphQL).
- **CLI tools** (`mj` commands, migration scripts).

When working **server-side**, always pass `contextUser` as the second argument
to `GetEntityObject` and `RunView`. The same provider instance serves many
users concurrently, and `contextUser` is how MJ keeps data isolation, security,
and audit trails correct.

```typescript
// ✅ Server-side: always pass contextUser
const order = await md.GetEntityObject<OrderEntity>('Orders', contextUser);

// ✅ Client-side: contextUser is already established by the auth session
const order = await md.GetEntityObject<OrderEntity>('Orders');
```

## RunView — querying collections

For loading more than one record, use `RunView`:

```typescript
import { RunView } from '@memberjunction/core';

const rv = new RunView();
const result = await rv.RunView<OrderEntity>({
    EntityName: 'Orders',
    ExtraFilter: `Status='Open' AND CustomerID='${customerId}'`,
    OrderBy: '__mj_CreatedAt DESC',
    MaxRows: 50,
    ResultType: 'entity_object'
});

if (result.Success) {
    for (const order of result.Results) {
        // order is fully typed as OrderEntity
    }
} else {
    console.error(result.ErrorMessage);
}
```

Two non-obvious rules:

- **`RunView` does NOT throw on query failure.** Check `result.Success` and
  read `result.ErrorMessage`. Wrapping it in `try/catch` only catches
  infrastructure errors, not bad filters or permission denials.
- **Use `RunViews` (plural) when loading multiple independent queries.** It
  batches them into a single round-trip. See `03-runview-patterns.md` for
  full guidance.

## Actions — when to use them (and when not to)

MJ **Actions** are a metadata-driven abstraction for exposing functionality to
AI agents, workflow engines, and low-code builders. Each action is a typed
class that AI systems can discover and invoke through a uniform interface.

The single most important rule:

**Actions are boundaries, not internal calls.** Use them at the edge of your
system, where AI/workflow/low-code consumers reach in. Never call an Action
from inside another Action, or from regular code that already has access to
the underlying service class.

```typescript
// ❌ BAD — Action calling another Action loses type safety and adds overhead
class SummarizeAction extends BaseAction {
    async run() {
        const result = await this.executeAction('Execute AI Prompt', params, user);
    }
}

// ✅ GOOD — direct use of the underlying service
import { AIPromptRunner } from '@memberjunction/ai-prompts';

class SummarizeAction extends BaseAction {
    async run() {
        const runner = new AIPromptRunner();
        return await runner.ExecutePrompt(params);
    }
}
```

Internal code-to-code communication: import the class, call the method.
External-to-internal communication (AI agent, low-code, external API): Action.

## Angular forms — the extension pattern

CodeGen produces a full CRUD form for every entity. If you want to customize
one — add a tab, override validation, embed a custom panel — you **extend the
generated form** rather than rewriting it:

```typescript
import { RegisterClass } from '@memberjunction/global';
import { BaseFormComponent } from '@memberjunction/ng-base-forms';
import { OrderFormComponent } from '../../generated/Entities/Order/order.form.component';

@RegisterClass(BaseFormComponent, 'Orders')   // 'Orders' = entity name
@Component({...})
export class OrderFormComponentExtended extends OrderFormComponent {
    // your overrides here
}
```

Two reasons to extend (not rewrite):

1. **`@RegisterClass`** uses registration order for priority. By extending the
   generated class, your file compiles *after* it, automatically winning the
   priority race.
2. You inherit every CodeGen improvement for free when the generated form gets
   regenerated against a richer schema.

## A short cheat sheet of "what goes where"

- **Add a new column to an entity?** Migration → `mj migrate` → `mj codegen`
  → write code against the new typed property.
- **Add a new entity?** Same flow; CodeGen creates the class, stored procs,
  and form for you.
- **Customize a form?** Extend the generated form class with `@RegisterClass`.
- **Add reference data?** Use mj-sync metadata files (see `16-metadata-files.md`),
  not SQL INSERTs.
- **Expose functionality to AI agents or workflows?** Write an Action.
- **Call code from other code?** Just import it. Don't reach for Actions.

The rest of this pack drills into each of these patterns. The next file —
`02-entity-essentials.md` — covers BaseEntity at the level of detail you'll
hit on day one.

---

# BaseEntity & Metadata — Day-1 Essentials

This is the file Claude needs to know cold before writing entity code in MJ.
Everything here is a real footgun that has tripped real teams. Each rule has
a short "why" so you can extrapolate to edge cases.

## Rule 1 — Always go through `Metadata`, never `new EntityClass()`

```typescript
import { Metadata } from '@memberjunction/core';
import { UserEntity } from '@memberjunction/core-entities';

const md = new Metadata();

// ✅ CORRECT
const user = await md.GetEntityObject<UserEntity>('Users', contextUser);

// ❌ WRONG — bypasses the class factory; you'll miss subclass overrides
const user = new UserEntity();
```

**Why:** MJ uses `@RegisterClass` so any team can register a custom subclass
of any entity. `Metadata.GetEntityObject<T>()` consults the class factory and
returns the most-specific registered subclass. Direct `new`-ing bypasses that
entirely — you'll silently miss validation, custom save logic, or computed
fields that someone added in a subclass.

## Rule 2 — Pass `contextUser` server-side

```typescript
// ✅ Server-side (resolvers, MJAPI extensions, scheduled jobs)
const user = await md.GetEntityObject<UserEntity>('Users', contextUser);
const rv = new RunView();
const results = await rv.RunView({ EntityName: 'Users' }, contextUser);

// ✅ Client-side (Angular components in MJExplorer or your SPA)
const user = await md.GetEntityObject<UserEntity>('Users');
// contextUser comes from the established auth session
```

**Why:** A single provider instance serves many users concurrently on the
server. Without `contextUser`, MJ can't enforce per-row permissions, can't
write audit trails, and can't attribute changes correctly.

## Rule 3 — `Save()` and `Delete()` return `boolean`, not throw

```typescript
// ✅ CORRECT
const saved = await user.Save();
if (!saved) {
    console.error('Save failed:', user.LatestResult?.CompleteMessage);
    return;
}

// ❌ WRONG — try/catch won't catch validation/permission failures
try {
    await user.Save();
} catch (e) {
    // never hit for business-logic failures; only for infra errors
}
```

**Why:** MJ separates "logic failure" (validation, permission denial, FK
violation, missing required field) from "infrastructure failure" (network,
connection drop). The first returns `false`; the second throws. Always check
the boolean return. Read error details from `entity.LatestResult?.CompleteMessage`
— that's the combined error string. (`.Message` alone is incomplete.)

## Rule 4 — Use typed properties, never `.Get()` / `.Set()`

```typescript
// ✅ CORRECT — typed, IntelliSense, refactor-safe
user.Email = 'alice@example.com';
const email: string = user.Email;

// ❌ WRONG — stringly-typed, no compile-time checking
user.Set('Email', 'alice@example.com');
const email = user.Get('Email');   // returns `unknown` — silent bugs await
```

**Why:** Generated entity classes expose every field as a typed property
(getter/setter). `.Get()` / `.Set()` are dynamic accessors that exist for
edge cases (truly dynamic field names, runtime introspection) — they have no
type safety, no IntelliSense, and no refactor support.

If you reach for `.Get()` or `.Set()`, stop and ask:

- **The typed property doesn't exist?** Either the migration hasn't been run
  yet, or CodeGen hasn't been run since the migration. Wait for CodeGen to
  generate the type before writing dependent code.
- **The field name is genuinely dynamic?** Fine, but rare — and you should
  probably revisit whether the design needs to be dynamic.

## Rule 5 — Never spread a BaseEntity

```typescript
// ❌ WRONG — spread captures nothing useful
const payload = { ...user, extraField: 'value' };

// ✅ CORRECT — GetAll() returns a plain object with all field values
const payload = { ...user.GetAll(), extraField: 'value' };
```

**Why:** BaseEntity uses getter methods, not plain properties. The spread
operator (`...`) only copies enumerable own properties. Getters aren't
enumerable, so spreading a BaseEntity gives you an *empty object* — silently.
Use `entity.GetAll()` to materialize a plain object with all field values.

## Rule 6 — Look up entities by name with `EntityByName`, not `find`

```typescript
const md = new Metadata();

// ✅ CORRECT — O(1), case-insensitive, trim-tolerant
const entity = md.EntityByName('Channel Actions');
if (entity) { /* ... */ }

// ❌ WRONG — O(N), case-sensitive, whitespace-sensitive
const entity = md.Entities.find(e => e.Name === 'Channel Actions');
```

**Why:** `Entities.find(e => e.Name === ...)` is a strict-equality scan, so
`'channel actions'` won't match `'Channel Actions'`. Users (and other code)
pass names in mixed casing all the time, and these bugs slip through review.
`EntityByName` normalizes the lookup and uses an internal map, so it's both
correct and fast.

Use `Entities` (the array) only when you genuinely need to iterate, e.g.
filtering by `SchemaName`.

## Entity naming — the "MJ:" prefix list

MJ's older entities have plain names: `Users`, `Roles`, `User Views`.
Entities added in recent MJ versions use an `MJ: ` prefix to avoid clashes
with custom entities in user databases.

Common ones with the prefix (you'll hit these constantly):

| Old / inconsistent | Correct name             |
|---|---|
| `AI Agent Runs`     | **`MJ: AI Agent Runs`**     |
| `AI Agent Prompts`  | **`MJ: AI Agent Prompts`**  |
| `AI Prompt Runs`    | **`MJ: AI Prompt Runs`**    |
| `Conversation Artifacts` | **`MJ: Conversation Artifacts`** |
| `Artifact Types`    | **`MJ: Artifact Types`**    |
| `AI Models`         | `AI Models` (no prefix — older entity)            |
| `AI Configurations` | **`MJ: AI Configurations`** |
| `AI Vendors`        | **`MJ: AI Vendors`**        |

```typescript
// ❌ Common mistake — missing MJ: prefix
const run = await md.GetEntityObject<AIAgentRunEntity>('AI Agent Runs');

// ✅ Correct
const run = await md.GetEntityObject<AIAgentRunEntity>('MJ: AI Agent Runs');
```

**When in doubt:** open the generated entity class file
(`packages/MJCoreEntities/src/generated/entity_subclasses.ts` in the MJ source,
or your own equivalent) and look at the `@RegisterClass` decorator JSDoc on
the class — that string is the canonical entity name.

## ResultType — `entity_object` vs `simple`

When calling `RunView`, you choose between two shapes of result:

| Scenario | `ResultType` | Why |
|---|---|---|
| You'll modify and save records | `'entity_object'` | Get full BaseEntity instances with typed properties and `.Save()` |
| You're reading for display, validation, or lookup | `'simple'` | Plain JS objects — much faster, no BaseEntity overhead |
| You want to narrow columns with `Fields` | `'simple'` | `Fields` is **ignored** with `entity_object` |

```typescript
// ✅ Read-only — Fields narrows the query, simple keeps it light
const result = await rv.RunView<{ ID: string; Name: string }>({
    EntityName: 'Orders',
    Fields: ['ID', 'Name'],
    ExtraFilter: `Status='Open'`,
    ResultType: 'simple'
});

// ✅ Need to modify and save — entity_object loads everything
const result = await rv.RunView<OrderEntity>({
    EntityName: 'Orders',
    ExtraFilter: `Status='Open'`,
    ResultType: 'entity_object'
});
for (const order of result.Results) {
    order.LastTouchedAt = new Date();
    await order.Save();
}

// ❌ WRONG — Fields is ignored when ResultType is entity_object
const result = await rv.RunView<OrderEntity>({
    EntityName: 'Orders',
    Fields: ['ID'],                  // IGNORED — entity objects need all fields
    ResultType: 'entity_object'
});
```

**Why `Fields` is ignored with `entity_object`:** A real entity object needs
every field to validate, dirty-track, and save correctly. Asking for a partial
entity would yield a corrupted object that can't be reliably saved. So MJ
overrides the `Fields` request and loads everything. Use `'simple'` if you
genuinely want a narrowed projection.

## Don't query in loops — use `RunViews` (plural)

If you need three independent entity queries, batch them:

```typescript
// ✅ One round trip
const rv = new RunView();
const [orders, customers, products] = await rv.RunViews([
    { EntityName: 'Orders',    ExtraFilter: `Status='Open'`, ResultType: 'entity_object' },
    { EntityName: 'Customers', ExtraFilter: `Active=1`,      ResultType: 'simple' },
    { EntityName: 'Products',  ExtraFilter: `Discontinued=0`,ResultType: 'simple' }
]);

// ❌ Three round trips
const orders    = await new RunView().RunView({ EntityName: 'Orders' });
const customers = await new RunView().RunView({ EntityName: 'Customers' });
const products  = await new RunView().RunView({ EntityName: 'Products' });
```

For details on the full set of RunView optimizations (auto-cache, server-side
caching, when to use `BypassCache`), see `03-runview-patterns.md`.

## Built-in version control — "Record Changes"

MJ tracks all changes to every entity by default in the `MJ: Record Changes`
table. You don't need to roll your own audit log; just query that entity
when you need history.

```typescript
const rv = new RunView();
const changes = await rv.RunView({
    EntityName: 'MJ: Record Changes',
    ExtraFilter: `RecordID='${user.ID}' AND EntityID='${userEntityID}'`,
    OrderBy: 'ChangedAt DESC',
    ResultType: 'simple'
});
```

You can disable change tracking per entity in the metadata if you have a
high-write entity where the audit log would be a hotspot — but the default
is "track everything," and that's the right default for most apps.

## `__mj_*` columns — what they are and what CodeGen owns

Every MJ table gets two metadata columns automatically:

- `__mj_CreatedAt` — UTC timestamp at insert
- `__mj_UpdatedAt` — UTC timestamp updated on every save

**Don't add these in your migrations.** CodeGen and the framework manage them
via defaults and update triggers. Adding them manually causes conflicts when
CodeGen regenerates the schema metadata.

Same for **foreign-key indexes**: CodeGen creates `IDX_AUTO_MJ_FKEY_<table>_<column>`
indexes for every FK. Don't create FK indexes manually in your migration.

## The day-1 checklist

When you're about to write entity code, run through this list:

- [ ] Going through `Metadata.GetEntityObject<T>(entityName, contextUser?)` (never `new`)?
- [ ] Server-side? Passing `contextUser` to every `GetEntityObject` / `RunView` / `RunViews`?
- [ ] Using typed properties (`user.Email`), not `.Get('Email')` / `.Set('Email', ...)`?
- [ ] Checking the boolean return of `Save()` / `Delete()` and reading `LatestResult?.CompleteMessage` on failure?
- [ ] Using the right entity name including the `MJ: ` prefix where applicable?
- [ ] Picking `'entity_object'` only when you'll mutate, `'simple'` for reads?
- [ ] Batching multiple queries with `RunViews` (plural) instead of awaiting individual `RunView` calls?
- [ ] Avoiding `{ ...entity }` (use `entity.GetAll()` instead)?

If all of those are yes, you're writing idiomatic MJ.
