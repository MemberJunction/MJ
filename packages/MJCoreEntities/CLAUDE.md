# `@memberjunction/core-entities` — 🚨 GENERATED CODE. DO NOT HAND-EDIT. 🚨

This package holds MJ's generated ORM layer — the `BaseEntity` subclasses and Zod schemas that
CodeGen produces from the live database after every schema change.

## The rule

**Never manually edit anything under `src/generated/`.** CodeGen overwrites it on the next run,
and your change disappears silently. If a generated file is wrong, the fix belongs in the
database schema, the entity metadata, or the CodeGen templates — never in the output.

## This package is the schema's source of truth

When you need to know an entity's real shape — fields, types, nullability, value-lists,
relationships, primary keys — **read the generated classes here, not the migration SQL**.

Migrations are an *append-only history*. The current shape of a table is the baseline plus every
subsequent `ALTER`; reconstructing it by reading migrations is error-prone and frequently wrong,
because a field added in one migration may have been altered or dropped in a later one. CodeGen
regenerates this package from the live database, so these classes reflect the **net result**.

- **"What fields does entity X have?"** → open the `X` entity class in
  [`src/generated/entity_subclasses.ts`](src/generated/entity_subclasses.ts)
- **"What type is field Y?"** → use indexed access: `SomeEntity['FieldName']`. Never hand-copy a
  value-list union — it silently drifts when CodeGen widens it. See
  [`.claude/rules/typescript-style.md`](../../.claude/rules/typescript-style.md).
- **"What's the entity's registered name?"** → the `@RegisterClass` decorator's JSDoc comment.
  All core entities carry the `MJ: ` prefix as of v5.0 (`MJAIPromptEntity` → `"MJ: AI Prompts"`).
  An unprefixed name like `'AI Agents'` no longer resolves and throws
  `Entity AI Agents not found in metadata`.

Read migration SQL only when you specifically need the *history* of a change, a *view/stored-proc
body* (which isn't represented in the ORM), or to author a *new* migration.

## What CodeGen generates into this package

- TypeScript classes for all database entities
- Zod schema definitions with validation rules
- Strongly-typed getters/setters for all fields
- Foreign key relationships and computed fields
- Value list unions derived from database CHECK constraints

## Adding a field: the required order

Writing code against a column before CodeGen has generated its type is what pushes people toward
`.Get()`/`.Set()`, which is banned. Do it in this order instead:

1. Write the migration (see [`migrations/CLAUDE.md`](../../migrations/CLAUDE.md))
2. Run the migration **and** CodeGen so the types exist
3. *Then* write TypeScript against the strongly-typed property

If you find yourself reaching for `.Get()` or `.Set()`, stop — either the type already exists and
you should use it, or CodeGen hasn't run yet and you should wait.

## Related

- **Data access rules** (RunView, BaseEntity, metadata lookup, caching) — [`.claude/rules/data-access.md`](../../.claude/rules/data-access.md), loads automatically for any `.ts` file
- **CodeGen itself** (what triggers it, DB connection config, manifests) — [`packages/CodeGenLib/CLAUDE.md`](../CodeGenLib/CLAUDE.md)
- **Server-side entity subclasses** — [`guides/BASE_ENTITY_SERVER_PATTERNS.md`](../../guides/BASE_ENTITY_SERVER_PATTERNS.md)
- **Migration → CodeGen workflow** — [`guides/MIGRATION_CODEGEN_WORKFLOW_GUIDE.md`](../../guides/MIGRATION_CODEGEN_WORKFLOW_GUIDE.md)
