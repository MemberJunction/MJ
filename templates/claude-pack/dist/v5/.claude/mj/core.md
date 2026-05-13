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

---

# RunView — querying collections efficiently

`RunView` is how you load more than one record at a time. `RunViews` (plural)
is its batch sibling. The default behavior is fine for small reads; the
performance work is choosing the right knobs.

## The basic shape

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
        // order is OrderEntity — typed
    }
} else {
    console.error(result.ErrorMessage);
}
```

The `<OrderEntity>` generic does two things: it types `result.Results` as
`OrderEntity[]` (so IntelliSense works), and signals which entity class the
factory should hydrate when `ResultType = 'entity_object'`.

## Rule 1 — `RunView` doesn't throw on failure

```typescript
// ❌ This try/catch is dead code.
try {
    const result = await rv.RunView({...});
    // ...
} catch (err) {
    // RunView won't throw on a bad filter, permission denial, or invalid
    // entity name. The error lives on `result.ErrorMessage`.
}

// ✅ Always check Success.
const result = await rv.RunView({...});
if (!result.Success) {
    console.error('Load failed:', result.ErrorMessage);
    return;
}
// safe to use result.Results
```

`try/catch` only catches infrastructure errors (network, connection drop).
Business-logic failures (bad filter syntax, permission denied, entity not
found) come back as `{ Success: false, ErrorMessage: '…' }`. If you don't
check `Success`, you'll silently work with `undefined` results.

## Rule 2 — Use `RunViews` (plural) for independent queries

If you need to load three unrelated entities for a screen, batch them:

```typescript
// ✅ One round trip
const rv = new RunView();
const [orders, customers, products] = await rv.RunViews([
    { EntityName: 'Orders',    ExtraFilter: `Status='Open'`, ResultType: 'entity_object' },
    { EntityName: 'Customers', ExtraFilter: `Active=1`,      ResultType: 'simple' },
    { EntityName: 'Products',  ExtraFilter: `Discontinued=0`,ResultType: 'simple' }
]);

// ❌ Three separate round trips — slower, more network chatter
const orders    = await new RunView().RunView({ EntityName: 'Orders' });
const customers = await new RunView().RunView({ EntityName: 'Customers' });
const products  = await new RunView().RunView({ EntityName: 'Products' });
```

`RunViews` packages the queries together and the server resolves them in one
shot. The return value is a tuple of results, one per query, in the same
order you passed them.

If the queries **depend** on each other (you need result A to build query B),
you can't batch — that's fine, just sequence them. The batching rule is for
**independent** queries.

## Rule 3 — `ResultType: 'entity_object'` vs `'simple'`

The default is `'simple'` — plain JavaScript objects with the requested
fields. Fast, lightweight, fine for read-only display.

`'entity_object'` returns real `BaseEntity` instances:

```typescript
const result = await rv.RunView<OrderEntity>({
    EntityName: 'Orders',
    ExtraFilter: `Status='Open'`,
    ResultType: 'entity_object'
});

// You can mutate and save these:
for (const order of result.Results) {
    order.LastTouchedAt = new Date();
    await order.Save();
}
```

Use `'entity_object'` when:
- You'll mutate and `.Save()` the records
- You need validation, dirty-tracking, or computed fields from the BaseEntity subclass
- You'll pass them to code that expects a real entity object

Use `'simple'` when:
- You're reading for display
- You're doing a lookup or count
- You want only a subset of fields (`Fields` parameter — see below)

The cost difference is real: building BaseEntity instances has overhead per
row. Don't pay it if you don't need it.

## Rule 4 — `Fields` is **ignored** with `entity_object`

```typescript
// ❌ The Fields filter does NOTHING here. The framework loads every field.
const result = await rv.RunView<OrderEntity>({
    EntityName: 'Orders',
    Fields: ['ID', 'Name'],          // silently ignored
    ResultType: 'entity_object'
});

// ✅ Fields works with simple — narrow projections are cheaper.
const result = await rv.RunView<{ ID: string; Name: string }>({
    EntityName: 'Orders',
    Fields: ['ID', 'Name'],
    ResultType: 'simple'
});
const ids = result.Results.map(r => r.ID);
```

Why is `Fields` ignored with `entity_object`? An entity object needs *every*
field to validate and save correctly. A partial entity would be a footgun —
it could `Save()` and silently null out fields it didn't load. The framework
overrides `Fields` with "all fields" when you ask for entity objects.

If you only need a couple columns (e.g., ID + Name for a dropdown), use
`'simple'` with `Fields` to keep the payload small.

## Rule 5 — Never query in loops

This is the #1 cause of slow pages. If you find yourself doing:

```typescript
// ❌ N+1 queries
for (const customer of customers) {
    const orders = await rv.RunView({
        EntityName: 'Orders',
        ExtraFilter: `CustomerID='${customer.ID}'`
    });
    // ...
}
```

Rewrite as **one query, then aggregate in memory**:

```typescript
// ✅ One query, group in memory
const customerIds = customers.map(c => `'${c.ID}'`).join(',');
const orders = await rv.RunView<OrderEntity>({
    EntityName: 'Orders',
    ExtraFilter: `CustomerID IN (${customerIds})`,
    ResultType: 'entity_object'
});

const ordersByCustomer = new Map<string, OrderEntity[]>();
for (const order of orders.Results) {
    if (!ordersByCustomer.has(order.CustomerID)) ordersByCustomer.set(order.CustomerID, []);
    ordersByCustomer.get(order.CustomerID)!.push(order);
}
```

For ranges (date buckets, etc.), the same rule applies: load the whole range
in one query, then bucket client-side.

## Rule 6 — Use denormalized fields from views, don't re-query

Most MJ views include denormalized fields from related entities. If you have
an `MJ: AI Prompt Runs` row, you already have:

- `ModelID` (FK) AND `Model` (the name of the model)
- `AgentID` AND `Agent`
- etc.

```typescript
// ❌ Don't do this — look up the model name with a second query
const run = await md.GetEntityObject<AIPromptRunEntity>('MJ: AI Prompt Runs');
await run.Load(runId);
const model = await md.GetEntityObject<AIModelEntity>('AI Models');
await model.Load(run.ModelID);
console.log(model.Name);

// ✅ It's already on the entity
const run = await md.GetEntityObject<AIPromptRunEntity>('MJ: AI Prompt Runs');
await run.Load(runId);
console.log(run.Model); // denormalized — already there
```

When you're designing a query, look at the entity fields first; chances are
the joined data you need is already exposed.

## Rule 7 — Server-side: pass `contextUser` to `RunView` / `RunViews`

```typescript
// ✅ Server-side (resolvers, scheduled jobs, MJAPI extensions)
const result = await rv.RunView({ EntityName: 'Orders' }, contextUser);
const results = await rv.RunViews([{ EntityName: 'Orders' }], contextUser);

// ✅ Client-side (Angular, browser SPA) — contextUser comes from the auth session
const result = await rv.RunView({ EntityName: 'Orders' });
```

Without `contextUser` on the server, row-level security, audit trails, and
per-row permissions can't be applied correctly. Always pass it.

## When you need a quick checklist

Before shipping any `RunView` call, run through:

- [ ] Checking `result.Success` (not just `try/catch`)?
- [ ] Using `'entity_object'` only when mutating; `'simple'` otherwise?
- [ ] Using `Fields` to narrow when `ResultType = 'simple'`?
- [ ] Batching independent queries with `RunViews`?
- [ ] Never calling `RunView` inside a loop over the previous query's results?
- [ ] Using denormalized fields from the view when they're already there?
- [ ] Passing `contextUser` on the server?

That covers ~95% of the wins. The other 5% (cache tuning, `BypassCache`, etc.)
is in `15-performance-and-caching.md`.

---

# Type Safety — no `any`, no `unknown` shortcuts

MJ generates typed entity classes for every database table. The whole point
is that you don't have to choose between "convenient" and "type-safe" — the
generic types give you both. Using `any` to skip past them defeats the
generator and re-introduces every class of bug it was built to prevent.

## The rule

**Never use `any`. Never use `unknown` as a lazy alternative.**

```typescript
// ❌ All of these throw away the type information MJ went to lengths to generate.
const results: any = await rv.RunView({...});
const entity: any = await md.GetEntityObject('Orders');
const data = result as unknown as Order[];

// ✅ Always use the proper generic.
const result = await rv.RunView<OrderEntity>({
    EntityName: 'Orders',
    ResultType: 'entity_object'
});
// result.Results is OrderEntity[] — IntelliSense, compile-time checks, refactor-safe.

const order = await md.GetEntityObject<OrderEntity>('Orders');
// order is OrderEntity — every field typed.
```

## Why it matters

Every generated entity class has:

- Typed getters/setters for every field
- Compile-time checks that you used the right field name
- Refactor-safe IDE renaming
- IntelliSense for what fields exist

Using `any` discards all of that. A typo in `entity.LasName = 'Smith'` (instead
of `LastName`) becomes a runtime null-write instead of a compile error.

## Generics, not `as`

Every MJ data-loading method accepts a type parameter. Use it.

```typescript
// ✅ Generic on the method
new RunView().RunView<OrderEntity>({...});
md.GetEntityObject<OrderEntity>('Orders');
order.Load<OrderEntity>(...);

// ❌ Casts that pretend the framework didn't already type it
const result = await new RunView().RunView({...}) as { Results: OrderEntity[] };
```

The generic version isn't just shorter — it tells the framework which class
factory to consult. Casts only tell TypeScript to shut up; they don't change
the runtime shape.

## Simple result type is its own type

When `ResultType: 'simple'` and you're projecting a subset of fields, the
type parameter describes the shape of the rows, not an entity class:

```typescript
const result = await rv.RunView<{ ID: string; Name: string }>({
    EntityName: 'Orders',
    Fields: ['ID', 'Name'],
    ResultType: 'simple'
});
// result.Results is { ID: string; Name: string }[]
```

Don't reach for `any` to describe a partial projection. The inline type
literal is fine.

## When you genuinely need `unknown`

`unknown` IS legitimate for values at trust boundaries — JSON from a network
response, deserialized config, anything where the source could be anything.

```typescript
// ✅ Reasonable use of unknown at a system boundary
const raw: unknown = JSON.parse(responseBody);
if (isPlainObject(raw) && typeof raw.userId === 'string') {
    // narrowed safely
}
```

What's NOT legitimate:

```typescript
// ❌ unknown as "type-safe any" — same anti-pattern with different name
const results = await rv.RunView({...}) as unknown as OrderEntity[];
```

If you find yourself writing `as unknown as X`, the right answer is almost
always to use the generic on the data-loading method instead.

## "But the type doesn't exist yet"

Sometimes you'll be working on a feature where the entity field doesn't
exist in the generated types yet — because the migration hasn't run, or
CodeGen hasn't been re-run. Reaching for `any` or `.Set('NewField', value)`
seems convenient.

**Don't.** The right workflow:

1. Write the migration
2. Apply it (`mj migrate`)
3. Run `mj codegen` to regenerate the entity types
4. Now write the code that uses the new field — with full type safety

Code written before CodeGen catches up is brittle: when the field name lands
in the generated types, it might differ slightly from what you typed (case,
suffix, etc.), and your stringly-typed `.Set('FieldName', …)` will silently
keep failing while the rest of the code starts working.

## When `.Get()` / `.Set()` is OK

`.Get('FieldName')` and `.Set('FieldName', value)` on a BaseEntity instance
exist for the rare cases where the field name is genuinely dynamic at
runtime — typically a metadata-driven UI that lets the user pick which
column to filter on.

Outside that narrow case, prefer the typed property. The framework went to
the trouble of generating `entity.Email` — use it.

## The day-1 checklist

Before submitting any data-access code:

- [ ] Every `RunView` / `GetEntityObject` / `Load` call has a `<T>` generic?
- [ ] No `as any` or `as unknown as …` casts?
- [ ] No `: any` annotations?
- [ ] If you needed `.Get('Field')`, the field name is genuinely runtime-dynamic?
- [ ] If you needed `.Set('Field', v)`, same?

If you can't answer "yes" to all of these, the generator already has the
type you want — find it before you reach for the escape hatches.

---

# Actions — when to write one, when not to

MJ Actions are a metadata-driven way to expose functionality to AI agents,
workflow engines, and low-code builders. They're a clean abstraction layer
when used at system *boundaries*. They're a footgun when used as a substitute
for direct function calls inside your own code.

## The rule

**Actions are boundaries. Direct imports are for internal calls.**

```typescript
// ✅ GOOD — an Action exposes "summarize content" to AI agents.
// The Action is the entry point; it uses the AI prompt runner directly.
import { AIPromptRunner, AIPromptParams } from '@memberjunction/ai-prompts';

class SummarizeContentAction extends BaseAction {
    async run(params: ActionParams) {
        const p = new AIPromptParams();
        p.prompt = this.getPrompt('Summarize Content');
        p.data = { content: params.content };
        const runner = new AIPromptRunner();
        return await runner.ExecutePrompt(p);
    }
}

// ❌ BAD — Action calling another Action just to invoke a prompt.
// Loses type safety, adds metadata-lookup overhead, hides the actual call path.
class SummarizeContentAction extends BaseAction {
    async run(params: ActionParams) {
        return await this.executeAction('Execute AI Prompt', params, user);
    }
}
```

## When to use an Action

Use an Action when you're at the *edge* of your system:

- **AI agents** discovering and running operations through metadata
- **Workflow engines** chaining steps without knowing the implementation
- **Low-code builders** wiring up business logic visually
- **External integrations** that need a stable, discoverable contract

Examples that justify being Actions:
- `Send Email` (Communication service exposed to agents)
- `Create Invoice` (business process exposed to workflow)
- `Get Web Page Content` (utility wrapped for agent use)
- `Validate Data` (re-usable step in a workflow)

## When NOT to use an Action

When the caller is *your own code*. Direct imports beat Actions in every
dimension that matters internally:

- **Type safety**: TypeScript checks the call site against the function signature
- **Performance**: No metadata lookup, no parameter serialization
- **Debuggability**: Stack traces show the actual function, not "executeAction"
- **Refactoring**: IDE rename works; "find references" works
- **Composability**: Functions take real types as inputs

```typescript
// ❌ Inside an Action, calling another Action for internal work
class GenerateReportAction extends BaseAction {
    async run() {
        const data = await this.executeAction('Fetch Source Data', ...);
        const summary = await this.executeAction('Summarize Content', ...);
        // metadata lookup × 2, type safety: 0, debuggability: 0
    }
}

// ✅ Same logic with direct imports
import { fetchSourceData } from '@memberjunction/data-context';
import { AIPromptRunner } from '@memberjunction/ai-prompts';

class GenerateReportAction extends BaseAction {
    async run() {
        const data = await fetchSourceData(...);
        const summary = await new AIPromptRunner().ExecutePrompt(...);
        // typed, traceable, fast
    }
}
```

## The mental test

When you're about to call something, ask: **who else needs to be able to
discover and call this?**

- If the answer is "an AI agent / workflow engine / external system" → it's
  an Action, AND the underlying logic lives in a service class the Action
  calls directly.
- If the answer is "just my own code, the package next door, MJAPI internals"
  → import the class or function. Call it directly.

You can have *both* in the same codebase: a service class (`AIPromptRunner`)
that all internal callers use, and an Action (`Execute AI Prompt`) that wraps
the same service class for external callers.

## Keep Actions thin

A well-written Action is mostly:

1. Validate input params
2. Look up referenced records / data
3. Call into a service class
4. Wrap the result for the Action return shape

If your Action has hundreds of lines of business logic inline, that logic
belongs in a service class. Make the Action a thin wrapper. Other places
(scheduled jobs, tests, internal callers) can then use the service class
without going through the Action machinery.

## Why this matters

The MJ Action system is metadata-driven by design — discoverability is the
whole feature. That discoverability has a cost (the metadata lookup, the
serialization, the indirection). When the caller doesn't need
discoverability — your own code, your own package — paying that cost is
pure tax.

Treat Actions like a public REST API: useful at the system edge, miserable
when used as the only way to call your own functions.

---

# CodeGen — what it owns, what you own

CodeGen is the engine that reads MJ's metadata tables and emits TypeScript
classes, stored procedures, GraphQL schemas, and Angular forms. The split
between what it owns and what you own is the single most important contract
in MJ — getting it wrong is most of the "why doesn't this compile after I
add a column" bugs.

## What CodeGen owns (NEVER edit by hand)

These live in `generated/` folders. Re-running CodeGen overwrites them.

- **Entity classes** — e.g. `packages/MJCoreEntities/src/generated/entity_subclasses.ts`.
  Typed getters/setters for every field, Zod validation, value-list enums
  from CHECK constraints.

- **Stored procedures** — `spCreate<Entity>`, `spUpdate<Entity>`, `spDelete<Entity>`,
  emitted as migrations under `migrations/v{N}/CodeGen_Run_*.sql`.

- **Database views** — joins, computed fields, denormalized columns that
  show up on the entity (`Order.CustomerName`, etc.).

- **Foreign-key indexes** — `IDX_AUTO_MJ_FKEY_<table>_<column>` for every FK.

- **Angular forms** — `*.form.component.ts` files under
  `packages/Angular/Explorer/core-entity-forms/src/lib/generated/`.

- **Server resolvers** — `packages/MJServer/src/generated/generated.ts`.

- **Permissions + grants** — `__mj` schema permission rows.

Editing any of these is a waste of your time. They'll be regenerated, your
edits will vanish.

## What you own

Everything outside the `generated/` folders:

- **Migrations** — you author the `ALTER TABLE` / `CREATE TABLE` statements.
  CodeGen reads the schema *after* your migration runs.

- **Extended forms** — when you need to customize a generated Angular form,
  you create a **subclass** that registers itself with `@RegisterClass`. The
  generated class stays untouched; your subclass wins. See
  `10-angular-essentials.md` for the pattern.

- **Custom server logic** — resolvers, business rules, custom procs — live
  in non-generated files. They sit alongside the generated ones.

- **Custom field descriptions** — added via `sp_addextendedproperty` in
  your migration. CodeGen reads them and uses them as JSDoc on the typed
  property.

## When CodeGen runs

You trigger it explicitly with `mj codegen`. The standard workflow when
adding a column or entity:

```bash
# 1. Author the migration
vi migrations/v5/V202611150930__v5.34.x__Add_OrderPriority.sql

# 2. Apply it
mj migrate

# 3. Regenerate the typed code
mj codegen

# 4. NOW you can write code that uses the new field
#    (typed properties are now in entity_subclasses.ts)
```

CodeGen also typically runs as part of `mj install`, after schema changes
in `mj sync`, and in CI before package builds.

## The "wait for CodeGen" rule

The single hardest-to-debug bug in MJ:

> "I added a column. Why does TypeScript say `entity.NewField` doesn't exist?"

Answer: because you wrote the code before CodeGen ran. The migration
created the column, but the entity class still has the old shape.

```typescript
// You added OrderPriority to the Orders table via migration.
// Then you wrote this BEFORE running mj codegen:
const order = await md.GetEntityObject<OrderEntity>('Orders');
order.OrderPriority = 5;   // ❌ TS: Property 'OrderPriority' does not exist
                            //    on type 'OrderEntity'.

// Two anti-patterns to avoid:
order.Set('OrderPriority', 5);  // ❌ stringly-typed, defeats the type system
(order as any).OrderPriority = 5; // ❌ even worse

// ✅ Correct: stop, run `mj codegen`, then keep going. The typed property
//    will appear in entity_subclasses.ts and your assignment becomes
//    a normal TS-checked write.
order.OrderPriority = 5;  // works after codegen
```

If you literally cannot run CodeGen right now (e.g. you're on the wrong
DB, no schema available), still don't reach for `.Set()`. Commit the
migration, stop working on the dependent code, and come back when you
can regenerate.

## Generated files in git

The generated files **are** checked into git. There's no "build step
that creates them" — they live in the repo so:

- Code Review can see the diff (e.g. that a migration added 50 lines to
  the entity class)
- Compilation works from a fresh clone without running CodeGen first
- Refactoring tools, IDE search, and `grep` see the generated symbols

When you run CodeGen and it changes generated files, you commit those
changes alongside your migration. Reviewers see both: "you added a column
+ here's the CodeGen output that follows from it."

## Migration files CodeGen emits

When you run `mj codegen` after a schema change, it generates a SQL file
in `migrations/v{N}/CodeGen_Run_YYYY-MM-DD_HH-MM-SS.sql`. That file
contains the metadata updates (Entity rows, EntityField rows, sp_addextendedproperty
descriptions, refreshed stored procs) that match your new schema.

You commit that file alongside your migration. Other developers will pick
it up next time they `mj migrate`.

## The mental model

Think of CodeGen as a function:

```
codegen(database schema + metadata tables) → generated code
```

It's deterministic. Same schema → same output. The only ways generated code
changes are:

1. You changed the database schema (via migration)
2. You changed entity metadata (via `sp_addextendedproperty`, mj-sync, etc.)
3. CodeGen itself was updated (rare, framework-level)

When something in `generated/` changes, look at one of those three causes
to understand why. Don't try to "fix" the generated file — fix the input.

## The day-1 checklist

- [ ] Never edit anything in a `generated/` folder
- [ ] When adding a column: migration → `mj migrate` → `mj codegen` → write code
- [ ] If a typed property is missing, run CodeGen instead of reaching for `.Set()`
- [ ] Commit the `CodeGen_Run_*.sql` migration that follows from your schema change
- [ ] When customizing forms, extend the generated class with `@RegisterClass` — don't fork the generated file

---

# Migrations — what to put in, what to leave out

MJ migrations are Flyway-style SQL files. The bulk of writing one is plain
SQL — but there are a handful of MJ-specific conventions that, if you skip,
will trip CodeGen, break replay, or cause silent runtime bugs.

## Where they live

```
migrations/v5/V<YYYYMMDDHHMM>__v[VERSION].x_<DESCRIPTION>.sql
```

- **`v5`** — the MJ major you're targeting. Always use the highest-numbered
  `migrations/v*/` folder (check `ls migrations/v*/` if unsure).
- **`V`** — Flyway requires a capital `V` prefix for versioned migrations.
- **`<YYYYMMDDHHMM>`** — UTC timestamp, must be greater than every existing
  migration's timestamp. CI enforces this; out-of-order timestamps break
  replay on a fresh install.
- **`__v[VERSION].x`** — the MJ minor version this migration ships in
  (e.g. `__v5.34.x`).
- **`<DESCRIPTION>`** — `Snake_Case_Words` describing what changes.

Example:
```
migrations/v5/V202611150930__v5.34.x__Add_OrderPriority_To_Orders.sql
```

## The schema placeholder

Never hardcode the `__mj` schema. Always use `${flyway:defaultSchema}`.

```sql
-- ❌ WRONG — breaks on customers who use a different default schema
ALTER TABLE __mj.Entity ADD CustomColumn NVARCHAR(100) NULL;

-- ✅ CORRECT
ALTER TABLE ${flyway:defaultSchema}.Entity ADD CustomColumn NVARCHAR(100) NULL;
```

Flyway substitutes the customer's actual schema name at apply time. The
default is `__mj` but many installs run on customized schema names.

## Hardcoded UUIDs, always

Any `INSERT` that creates a row with a UUID primary key must use a
**hardcoded UUID literal** — never `NEWID()` or `NEWSEQUENTIALID()`.

```sql
-- ❌ WRONG — every customer ends up with a different ID for the same row,
--    breaking cross-environment referential integrity.
INSERT INTO ${flyway:defaultSchema}.SomeEntity (ID, Name)
VALUES (NEWID(), 'My Reference Value');

-- ✅ CORRECT — same row, same ID, everywhere.
INSERT INTO ${flyway:defaultSchema}.SomeEntity (ID, Name)
VALUES ('a1b2c3d4-1234-5678-90ab-cdef12345678', 'My Reference Value');
```

Use a UUID generator (e.g. `uuidgen` or any online tool) once when authoring
the migration. The same UUID must apply on every install of that version.

## Columns CodeGen owns — DON'T add these manually

Every MJ table gets these automatically (or via existing CodeGen-emitted
DDL). Never include them in your CREATE TABLE or ALTER TABLE:

```sql
-- ❌ WRONG — DON'T add these by hand
CREATE TABLE ${flyway:defaultSchema}.NewEntity (
    ID UNIQUEIDENTIFIER NOT NULL DEFAULT NEWSEQUENTIALID(),
    Name NVARCHAR(100) NOT NULL,
    __mj_CreatedAt DATETIMEOFFSET NOT NULL DEFAULT GETUTCDATE(),  -- ❌
    __mj_UpdatedAt DATETIMEOFFSET NOT NULL DEFAULT GETUTCDATE(),  -- ❌
    CONSTRAINT PK_NewEntity PRIMARY KEY (ID)
);
CREATE INDEX IDX_NewEntity_Name ON ...   -- ❌ FK indexes are CodeGen's job
```

```sql
-- ✅ CORRECT — let CodeGen wire the timestamps and FK indexes
CREATE TABLE ${flyway:defaultSchema}.NewEntity (
    ID UNIQUEIDENTIFIER NOT NULL DEFAULT NEWSEQUENTIALID(),
    Name NVARCHAR(100) NOT NULL,
    SomeFK UNIQUEIDENTIFIER NOT NULL,
    CONSTRAINT PK_NewEntity PRIMARY KEY (ID),
    CONSTRAINT FK_NewEntity_SomeFK FOREIGN KEY (SomeFK)
        REFERENCES ${flyway:defaultSchema}.OtherEntity(ID)
);
```

CodeGen will:
- Add `__mj_CreatedAt` / `__mj_UpdatedAt` with defaults and update triggers
- Create the `IDX_AUTO_MJ_FKEY_NewEntity_SomeFK` index for the FK column
- Generate `spCreate*`, `spUpdate*`, `spDelete*` stored procs
- Add Entity / EntityField metadata rows

Including any of the above manually duplicates CodeGen's work and conflicts
when it re-runs.

## Consolidate `ALTER TABLE` for the same table

```sql
-- ✅ CORRECT — one ALTER TABLE, multiple ADD clauses
ALTER TABLE ${flyway:defaultSchema}.EntityField ADD
    UserSearchPredicateAPI NVARCHAR(20) NOT NULL DEFAULT 'Contains',
    AutoUpdateUserSearchPredicate BIT NOT NULL DEFAULT 1,
    AutoUpdateFullTextSearch BIT NOT NULL DEFAULT 1;

-- ❌ WRONG — three separate ALTER TABLEs for the same table
ALTER TABLE ${flyway:defaultSchema}.EntityField ADD UserSearchPredicateAPI NVARCHAR(20) NOT NULL DEFAULT 'Contains';
ALTER TABLE ${flyway:defaultSchema}.EntityField ADD AutoUpdateUserSearchPredicate BIT NOT NULL DEFAULT 1;
ALTER TABLE ${flyway:defaultSchema}.EntityField ADD AutoUpdateFullTextSearch BIT NOT NULL DEFAULT 1;
```

Same end state, but consolidated form is faster (one table lock + one schema
modification), reads better, and matches the convention CodeGen uses.

## Always add `sp_addextendedproperty` for new columns

For every new column you add (except primary keys and foreign keys — CodeGen
handles those), emit a description. CodeGen pulls these descriptions into
the typed entity property's JSDoc, into the Angular form's tooltip, and
into the GraphQL schema description.

```sql
EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'Priority level (1=highest, 5=lowest) for fulfillment ordering.',
    @level0type = N'SCHEMA', @level0name = N'${flyway:defaultSchema}',
    @level1type = N'TABLE',  @level1name = N'Orders',
    @level2type = N'COLUMN', @level2name = N'Priority';
```

Without descriptions, the typed property exists but with no JSDoc, the
Angular form labels read as raw column names, and the GraphQL schema is
opaque. It costs four lines per column; spend them.

## Don't seed lookup tables with SQL `INSERT`

If you're adding a new lookup / reference table (e.g.
`MJ: AI Agent Request Types`), don't seed it via SQL `INSERT` statements
in the migration. Use mj-sync metadata files instead — see
`16-metadata-files.md`.

mj-sync is declarative, version-controlled, idempotent, supports `@lookup:`
references that resolve entity-name → ID automatically, and is safe to
re-run. SQL `INSERT` seeds are duplication-prone, brittle across environments,
and have to be hand-coordinated with CodeGen-emitted ID changes.

## The day-1 checklist

Before committing any migration:

- [ ] Filename matches `V<TIMESTAMP>__v[VERSION].x__<Snake_Case>.sql`?
- [ ] Timestamp is newer than every existing migration?
- [ ] No `__mj.` literal — use `${flyway:defaultSchema}` everywhere?
- [ ] All `INSERT` UUIDs are hardcoded literals, no `NEWID()`?
- [ ] No `__mj_CreatedAt` / `__mj_UpdatedAt` in CREATE TABLE?
- [ ] No manual FK indexes — only the FK constraint itself?
- [ ] Multiple ADDs to the same table consolidated into one `ALTER TABLE`?
- [ ] Every non-PK / non-FK column has an `sp_addextendedproperty` description?
- [ ] Reference-data seeds use mj-sync, not SQL `INSERT`?
- [ ] Ran `mj migrate` + `mj codegen` locally and committed the resulting
      `CodeGen_Run_*.sql` file?

Get this right and migrations are boring — exactly what they should be.

---

# Singletons — always extend `BaseSingleton<T>`

If a class needs to be a singleton in MJ, it must extend `BaseSingleton<T>`
from `@memberjunction/global`. Rolling your own `static _instance` looks
fine in unit tests and breaks in production for non-obvious reasons.

## The rule

```typescript
// ✅ CORRECT
import { BaseSingleton } from '@memberjunction/global';

export class MyService extends BaseSingleton<MyService> {
    // BaseSingleton requires a protected (or private) constructor
    protected constructor() {
        super();
    }

    // Expose a static accessor that calls the inherited getInstance()
    public static get Instance(): MyService {
        return MyService.getInstance<MyService>();
    }

    public DoThing() { /* ... */ }
}

// Usage:
const s = MyService.Instance;
s.DoThing();
```

```typescript
// ❌ WRONG — looks identical, breaks under code splitting
export class MyService {
    private static _instance: MyService;
    public static get Instance(): MyService {
        if (!MyService._instance) {
            MyService._instance = new MyService();
        }
        return MyService._instance;
    }
}
```

## Why `static _instance` is wrong

Modern bundlers (ESBuild, Vite, Rollup, Webpack) do aggressive code
splitting and inlining. A class can end up *duplicated* in the bundle —
once in chunk A, once in chunk B — when:

- The class is imported from multiple entry points
- Re-exports cross package boundaries
- A monorepo workspace package gets bundled differently in two consumers

Each copy has its own `static _instance` field on its own class
constructor. When two callers go through different copies, you get
**two singletons** — silently, with diverging state. The bug shows up
much later as a desync ("why is the cache empty here when I just wrote
to it over there?").

`BaseSingleton<T>` solves this by storing the instance in a **global
object store** — a single `Map` keyed by class name, attached to
`globalThis`. There's exactly one map across all duplicated copies of
the code, so all callers get the same instance.

## The two-line summary

| Aspect | `BaseSingleton<T>` | Hand-rolled `static _instance` |
|---|---|---|
| One instance per process | Yes, guaranteed | Only when no code duplication |
| Survives bundler quirks | Yes | No |
| Constructor enforcement | Compile error if public | None |
| Boilerplate | ~10 lines | ~6 lines |

The savings on the hand-rolled version aren't worth the production foot­gun.

## Common gotcha: `protected constructor()`

`BaseSingleton<T>` requires a `protected` (or `private`) constructor.
Forgetting this means callers can still do `new MyService()` directly,
which bypasses the singleton and creates an unmanaged instance.

```typescript
export class MyService extends BaseSingleton<MyService> {
    constructor() {  // ❌ public — defeats the singleton
        super();
    }
}

export class MyService extends BaseSingleton<MyService> {
    protected constructor() {  // ✅ enforced singleton access
        super();
    }
}
```

The TypeScript compiler will error if you try to `new MyService()` from
outside the class hierarchy when the constructor is protected.

## When NOT to use a singleton

Singletons are a tool for "exactly one of this thing per process". Common
legitimate uses:

- A connection pool that wraps a shared resource
- A registry that catalogs other singletons (e.g. `ClassFactory`)
- A cache layer that needs cross-call coherence

When in doubt, **don't** make it a singleton. Instead, pass instances as
parameters or store them on whatever context object already exists.
Singletons hide dependencies and make tests painful.

## Provider classes — use `this`, not the global

There's a related pitfall: any class instance that *is* an `IMetadataProvider`
should use its own `this` rather than reaching for the global `Metadata`
singleton. See `02-entity-essentials.md` for the full version. The short
form:

```typescript
// ❌ Inside a class that owns a provider
const md = new Metadata();  // ← global default; wrong in multi-provider setups
md.EntityByName(name);

// ✅ Use the instance's own provider
this.EntityByName(name);   // 'this' IS an IMetadataProvider
```

`Metadata.Provider` / `new Metadata()` always returns the **default** provider.
That's only correct in single-provider apps. Multi-provider clients (a
front-end talking to two MJ servers in parallel) will silently use the wrong
provider if internal code reaches for the global.

---

# Imports & dependencies — static imports, no re-exports

Two MJ-specific rules about how your packages talk to each other:

1. Use static `import ... from '...'` at the top of every file. **Dynamic
   `import()` is forbidden** except in a narrow allowlist.
2. **Never re-export** types or classes from another package. Consumers
   import directly from the original source package.

Both rules exist because of real shipping bugs that the easier alternative
caused.

## Rule 1 — Static imports only

```typescript
// ✅ CORRECT — static import at the top of the file
import { AIPromptRunner } from '@memberjunction/ai-prompts';

class MyService {
    async run() {
        return await new AIPromptRunner().ExecutePrompt(...);
    }
}
```

```typescript
// ❌ WRONG — dynamic import as a "convenience"
class MyService {
    async run() {
        const { AIPromptRunner } = await import('@memberjunction/ai-prompts');
        return await new AIPromptRunner().ExecutePrompt(...);
    }
}
```

The dynamic version looks clever. It doesn't show the dependency in npm,
doesn't show up in bundle analysis, and survives a missing entry in
`package.json` until runtime. The day it ships and the dep IS missing,
your command crashes with `ERR_MODULE_NOT_FOUND` for users — TypeScript
never warned you.

Static imports are checked at compile time. If the dep isn't declared,
the build fails. Always.

### The 5 narrow exceptions

Dynamic `import()` is acceptable when:

1. **Angular lazy-loaded routes / `loadComponent()`** — framework-required
   for code splitting.

2. **Optional peer dependencies** — cloud SDKs (`@aws-sdk/client-kms`,
   `@azure/keyvault-keys`) loaded only when that provider is configured.
   Must be declared in `optionalDependencies` or `peerDependenciesMeta`.

3. **Genuine bundle-size deferral** — a single heavy module (e.g. `xlsx`
   loaded only on Excel export). Must be measured: "this is too slow to
   load up-front" is not a guess.

4. **Breaking a hard circular dependency** — last resort. Add a comment
   explaining the cycle.

5. **Runtime plugin discovery** — loading user-supplied resolver/middleware
   modules whose paths aren't known at build time.

**If your reason isn't on this list, use a static import.** "It's only
used in one method" is not a reason. "The package is big" is not a reason
unless you've measured the startup cost.

### When you must use dynamic import

Add a comment explaining *which* category above it falls under. **Still
declare the package in `dependencies`** (or `optionalDependencies` /
`peerDependencies`) — dynamic import doesn't exempt you from the dep graph.
Prefer a single top-of-module dynamic load behind a memoized promise over
repeated `await import()` inside every method.

## Rule 2 — No re-exports between packages

```typescript
// ❌ WRONG — re-exporting from another package
// In @memberjunction/ng-export-service/src/public-api.ts:
export { ExportFormat, ExportOptions } from '@memberjunction/export-engine';

// ✅ CORRECT — only export what this package defines
export * from './lib/module';
export * from './lib/export.service';
export * from './lib/export-dialog.component';
// NOTE: For ExportFormat / ExportOptions, import directly from @memberjunction/export-engine
```

Why no re-exports:

- **Obscures the source of types.** A reader sees `import { ExportFormat }
  from '@memberjunction/ng-export-service'` and has no idea the type lives
  in `export-engine`. Going to definition is now indirect.

- **Confuses the dependency graph.** If `ng-export-service` re-exports
  types from `export-engine`, any consumer that uses those types thinks
  `ng-export-service` is the dependency. Eventually someone removes the
  re-export, breaking every transitive consumer.

- **Breaks tree-shaking.** The bundler can't tell that you only used the
  re-exported symbol, not the rest of the re-exporting package.

Each package's `public-api.ts` should only export **code defined within
that package**. Consumers import types from their original source.

If you find yourself reaching for a re-export to "make the import shorter"
or "hide an implementation detail" — those benefits come at the cost of a
much harder-to-debug dependency tangle later. Don't.

## Why these rules exist (a real shipping bug)

The dynamic-import rule was written after a shipping bug: MJCLI's `mj app *`
commands used `await import('@memberjunction/open-app-engine')` inside the
command body, without declaring the dep in `package.json`. The TypeScript
build passed. `npm install -g @memberjunction/cli` succeeded. Every
production `mj app` invocation crashed with `ERR_MODULE_NOT_FOUND`. Static
imports would have failed the build immediately.

The re-export rule comes from years of refactoring pain — every removed
re-export broke a transitive consumer who didn't know they had a dependency
they had to update.

## The day-1 checklist

- [ ] Every `import` at the top of the file, not inside a method?
- [ ] If you used dynamic `import()`, can you point to one of the 5
      categories above and write the one-line "why"?
- [ ] Your `public-api.ts` / `index.ts` only exports things defined in
      this package (no `export { … } from 'other-package'`)?
- [ ] Every package you import from is declared in `package.json`
      (dependencies / peerDependencies / optionalDependencies)?

---

# Metadata Files & mj-sync — declarative reference data

For reference data — lookup tables, AI Models, AI Vendors, Application
config, etc. — MJ has a declarative metadata system. You write JSON files
under `metadata/`, run `mj sync push`, and the records land in the
database. It's the idiomatic alternative to `INSERT` statements in
migrations.

## When to use mj-sync vs SQL

| Use mj-sync for | Use SQL migrations for |
|---|---|
| Reference data (statuses, types, categories) | Schema changes (CREATE TABLE, ALTER) |
| AI Models / AI Vendors / AI Configurations | New columns, indexes, constraints |
| Application + nav config | Anything that changes table shape |
| Default Roles, default Users | Stored procs (CodeGen emits these) |
| Seed templates, sample data | Triggers, views, functions |

If it's a **row in a table**, prefer mj-sync. If it's **the shape of the
table itself**, that's a migration.

## Why prefer mj-sync over SQL INSERT

- **Version-controlled, human-readable** — diffs are JSON object changes,
  not opaque SQL strings
- **Idempotent** — `mj sync push` upserts; safe to re-run anywhere
- **`@lookup:` resolves IDs automatically** — you don't need to hardcode
  FK UUIDs that depend on what other rows exist
- **Cross-environment safe** — same file produces the same logical row
  on dev, staging, prod, customer installs
- **Free preview** — `mj sync push --dry-run` shows what would change
- **CodeGen-friendly** — runs alongside CodeGen, doesn't fight it for
  ownership of the same rows

The blanket SQL INSERT for reference data leads to:
- Different IDs on different environments (because timestamps / sequence
  values diverge)
- Conflicts when CodeGen later wants to update the same rows
- No safe re-run on a partially-applied state

## Directory layout

```
metadata/
├── .mj-sync.json                          (top-level config)
├── ai-models/
│   ├── .mj-sync.json                      (per-entity config)
│   └── .ai-models.json                    (the data — JSON array of records)
├── ai-vendors/
│   ├── .mj-sync.json
│   └── .ai-vendors.json
└── applications/
    └── .my-app-application.json
```

Each entity gets its own directory under `metadata/`. A `.mj-sync.json`
in that directory tells mj-sync which entity these files describe and how
to handle conflicts.

## Record file structure

Records are JSON arrays. Each entry has a `fields` object with the column
values:

```json
[
  {
    "fields": {
      "Name": "Production",
      "Description": "Production-grade models",
      "DisplayOrder": 1
    }
  },
  {
    "fields": {
      "Name": "Development",
      "Description": "Dev/test models",
      "DisplayOrder": 2
    }
  }
]
```

On first `push`, mj-sync assigns each record a UUID, writes a `primaryKey`
field back into the source file, and records sync metadata. Don't add
`primaryKey` or `sync` by hand — they appear automatically.

## The four reference syntaxes

mj-sync supports four `@`-prefixed reference forms inside `fields`:

### `@file:relative/path.ext` — embed file contents

```json
{
  "fields": {
    "Name": "User Profile Form",
    "TemplateText": "@file:templates/user-profile.hbs"
  }
}
```

The value is replaced with the file's contents at sync time. Useful for
long Handlebars templates, JSON schemas, or anything multi-line that
would be unreadable inline.

### `@lookup:Entity Name.FieldName=Value` — resolve to another entity's ID

```json
{
  "fields": {
    "Name": "GPT-4 OpenAI",
    "ModelID": "@lookup:AI Models.Name=GPT-4",
    "VendorID": "@lookup:MJ: AI Vendors.Name=OpenAI"
  }
}
```

The value is replaced with the ID of the matching record at sync time.
This means you can reference rows that *also* came from mj-sync without
hardcoding UUIDs. The lookup runs after all records of the target entity
are loaded, so order doesn't matter.

If the lookup doesn't find a match, push errors out clearly.

### `@template:relative/path.ext` — same as @file but treated as a template

For template-engine content (Handlebars, Liquid, etc.) where you want the
sync to validate or transform the content before insertion.

### `@parent:FieldName` / `@root:FieldName` — reference enclosing record

For nested / related-record sync structures, lets a child record reference
a field on its parent.

## Workflow

```bash
# 1. Edit JSON under metadata/
vi metadata/ai-models/.ai-models.json

# 2. Preview what would change
mj sync push --dir metadata/ --dry-run

# 3. Apply for real
mj sync push --dir metadata/

# 4. Commit BOTH the source file AND the auto-generated primaryKey/sync fields
git add metadata/ai-models/.ai-models.json
git commit
```

The `primaryKey` and `sync` fields that mj-sync writes back are part of
the record's identity — commit them so other developers (and CI) keep
upserting to the same row.

## Pulling existing data into mj-sync

If you have reference data already in the database that you want to
manage via mj-sync going forward:

```bash
mj sync pull --dir metadata/ --entity 'AI Models'
```

This reads the rows out of the database and writes them as JSON under
`metadata/ai-models/`. Commit the result; from then on, the JSON file is
the source of truth.

## Validation

Before push, mj-sync runs a validation pass:

- Required fields are present
- `@lookup:` references resolve to actual rows
- Field values match their type / value-list constraints
- Foreign keys reference real entities

You can run validation explicitly without pushing:

```bash
mj sync validate --dir metadata/
```

CI typically runs this on every PR that touches `metadata/`.

## The day-1 checklist

- [ ] Reference data goes in `metadata/<entity-dir>/`, not SQL `INSERT`
- [ ] One directory per entity, with `.mj-sync.json` config + data file
- [ ] FK references use `@lookup:` so IDs resolve automatically
- [ ] Long content (templates, schemas) uses `@file:` instead of inline
- [ ] You ran `mj sync push --dry-run` before applying
- [ ] You committed the source file *with* the auto-written `primaryKey` and `sync` blocks
