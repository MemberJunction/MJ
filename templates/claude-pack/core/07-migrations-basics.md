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
