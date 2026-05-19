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
