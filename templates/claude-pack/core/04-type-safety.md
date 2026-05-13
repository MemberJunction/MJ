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
