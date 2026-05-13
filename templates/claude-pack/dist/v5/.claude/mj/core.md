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
