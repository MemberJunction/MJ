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
