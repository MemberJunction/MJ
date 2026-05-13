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
