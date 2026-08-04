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
