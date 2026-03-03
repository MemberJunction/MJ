# Multi-Database Development Workflow

MemberJunction supports multiple database backends (SQL Server, PostgreSQL, and extensible to others). This guide explains how migrations and CodeGen work together to support multi-database deployments.

## Architecture Overview

MemberJunction uses a **convert-and-generate** approach rather than a write-once abstraction:

- **Hand-written migrations** are authored in T-SQL (SQL Server) and converted to other dialects using the `@memberjunction/sql-converter` toolchain
- **CodeGen output** is generated natively by running CodeGen against each target database — it is NOT converted between dialects

This separation exists because:

1. **Migrations** are relatively simple DDL (CREATE TABLE, ALTER TABLE, constraints) that convert cleanly between dialects
2. **CodeGen output** (views, stored procedures/functions, triggers) is deeply platform-specific and benefits from native generation using each database's full feature set

```
                    ┌─────────────────────────────────────────┐
                    │         Hand-Written Migration           │
                    │    migrations/v5/V20260213...sql         │
                    │           (T-SQL source)                 │
                    └─────────────┬───────────────────────────┘
                                  │
                    ┌─────────────▼───────────────────────────┐
                    │       SQL Converter Toolchain            │
                    │   @memberjunction/sql-converter          │
                    │  (rule-based T-SQL → PG conversion)      │
                    └─────────────┬───────────────────────────┘
                                  │
                    ┌─────────────▼───────────────────────────┐
                    │       Converted PG Migration             │
                    │   migrations/pg/v5/V20260213...pg.sql    │
                    │        (PostgreSQL dialect)              │
                    └─────────────────────────────────────────┘


    ┌──────────────────────┐              ┌──────────────────────┐
    │   SQL Server DB      │              │   PostgreSQL DB      │
    │   (run migration)    │              │   (run migration)    │
    └──────────┬───────────┘              └──────────┬───────────┘
               │                                     │
    ┌──────────▼───────────┐              ┌──────────▼───────────┐
    │  CodeGen (SQL Server │              │  CodeGen (PostgreSQL │
    │  provider subclass)  │              │  provider subclass)  │
    └──────────┬───────────┘              └──────────┬───────────┘
               │                                     │
    ┌──────────▼───────────┐              ┌──────────▼───────────┐
    │  CodeGen_Run_*.sql   │              │  CodeGen_Run_*.pg.sql│
    │  (T-SQL views, SPs)  │              │  (PG views, funcs)   │
    └──────────────────────┘              └──────────────────────┘
```

## Personas and Workflows

### 1. MJ Core Developer (Dual-Database)

MJ core developers maintain the framework and need both SQL Server and PostgreSQL outputs.

**Step-by-step workflow:**

1. **Develop on SQL Server** — author hand-written migration in T-SQL:
   ```
   migrations/v5/V202603011200__v5.4.x__Add_New_Feature.sql
   ```

2. **Run migration on SQL Server** — apply the migration to the SQL Server development database

3. **Run CodeGen on SQL Server** — generates the SQL Server CodeGen output:
   ```
   migrations/v5/CodeGen_Run_2026-03-01_12-05-00.sql
   ```

4. **Convert migration to PG** — use the SQL Converter to produce the PG migration:
   ```bash
   # Via MJCLI
   mj sql-convert --source migrations/v5/V202603011200__v5.4.x__Add_New_Feature.sql \
                   --output migrations/pg/v5/V202603011200__v5.4.x__Add_New_Feature.pg.sql \
                   --source-dialect tsql --target-dialect postgres --schema __mj
   ```
   Output:
   ```
   migrations/pg/v5/V202603011200__v5.4.x__Add_New_Feature.pg.sql
   ```

5. **Run converted migration on PostgreSQL** — apply the `.pg.sql` migration to the PostgreSQL development database

6. **Run CodeGen on PostgreSQL** — generates the PG CodeGen output natively:
   ```
   migrations/pg/v5/CodeGen_Run_2026-03-01_12-05-00.pg.sql
   ```
   This file gets the same base name as the SQL Server CodeGen output, with `.pg.sql` extension.

7. **Commit both migration paths** — the repository contains complete, tested migration paths for both databases

**Key principle:** CodeGen_Run files are NEVER converted between dialects. They are generated natively by running CodeGen against each database.

### 2. MJ End User (Single Database)

Most MemberJunction users run a single database and consume published migration paths.

**Workflow:**

1. **Choose a database** — SQL Server or PostgreSQL
2. **Install MJ** — run the published, tested migration path for the chosen database:
   - SQL Server: `migrations/v5/*.sql` (excluding `.pg.sql` files)
   - PostgreSQL: `migrations/pg/v5/*.pg.sql`
3. **Run CodeGen locally** — generates views, functions, and procedures for the local database
4. **Develop application** — write application-specific entities, which CodeGen handles for the single target database

End users never need the SQL Converter toolchain. They use one database, one set of migrations, and CodeGen generates everything natively for that platform.

### 3. Third-Party App Developer (Optional Dual-Database)

Third-party developers building on MemberJunction can choose to support one or both databases.

**Single database (simpler):**
- Write migrations in the target database's dialect
- Run CodeGen against that one database
- Publish migrations for that platform only

**Dual database (broader reach):**
- Follow the same workflow as MJ Core Developers
- Write migrations in T-SQL, convert to PG
- Run CodeGen against both databases
- Publish both migration paths

The choice depends on the app's target audience and deployment requirements.

## File Organization

```
migrations/
├── v5/                                    # SQL Server migration path
│   ├── B202602151200__v5.0__Baseline.sql  # Baseline (full schema)
│   ├── V202602131500__v5.0.x__*.sql       # Hand-written migrations (T-SQL)
│   ├── CodeGen_Run_2026-02-24_*.sql       # CodeGen output (T-SQL)
│   └── ...
│
├── pg/
│   └── v5/                                # PostgreSQL migration path
│       ├── B202602151200__v5.0__Baseline.pg.sql   # Converted baseline
│       ├── V202602131500__v5.0.x__*.pg.sql        # Converted hand-written migrations
│       ├── CodeGen_Run_2026-02-24_*.pg.sql        # Native PG CodeGen output
│       └── ...
│
└── R__RefreshMetadata.sql                 # Repeatable migration (all platforms)
```

**Naming convention:**
- SQL Server files: `*.sql`
- PostgreSQL files: `*.pg.sql`
- Both CodeGen outputs share the same base name (e.g., `CodeGen_Run_2026-02-24_04-10-53`)

## SQL Converter Toolchain

The `@memberjunction/sql-converter` package handles T-SQL to PostgreSQL conversion for hand-written migrations. It uses a rule-based pipeline:

1. **Split** — separate GO-delimited batches
2. **Sub-split** — break compound batches into individual statements
3. **Classify** — determine statement type (CREATE TABLE, ALTER TABLE, INSERT, etc.)
4. **Convert** — apply dialect-specific conversion rules per statement type
5. **Group** — organize output into logical sections (DDL, DML, etc.)
6. **Post-process** — final cleanup pass

The converter handles:
- Data type mapping (UNIQUEIDENTIFIER → UUID, NVARCHAR → VARCHAR, BIT → BOOLEAN, etc.)
- Identifier quoting (`[schema].[table]` → `"schema"."table"`)
- Function conversion (GETUTCDATE() → NOW(), NEWSEQUENTIALID() → gen_random_uuid(), etc.)
- Constraint syntax differences
- Extended properties → COMMENT ON statements
- Conditional DDL patterns (IF NOT EXISTS)
- And many more T-SQL to PG transformations

**Important: The SQL Converter should only be used on hand-written migration files (V-prefix), NOT on CodeGen_Run files.** CodeGen output contains complex platform-specific SQL (recursive CTEs, PL/pgSQL functions, cursor-based cascade deletes, triggers) that should be generated natively by running CodeGen against each target database. If you accidentally run the converter on CodeGen files, the output will contain `-- TODO: Review this batch` comments on statements the converter doesn't recognize as T-SQL — these are harmless but indicate the wrong tool is being used.

When batch-converting a directory, be selective about which files to convert:

```bash
# Convert only V-prefix (hand-written) migrations
mj sql-convert --source migrations/v5/V*.sql \
               --output-dir migrations/pg/v5/ \
               --source-dialect tsql --target-dialect postgres --schema __mj
```

> **Future enhancement:** A `--skip-codegen` flag is planned for the SQL Converter to explicitly skip CodeGen_Run files when converting an entire directory. Since CodeGen files can't be reliably detected by filename alone (users may use different naming conventions), this will be an opt-in flag rather than automatic detection.

See the [SQL Converter package](../SQLConverter/README.md) for detailed documentation.

## CodeGen Database Providers

CodeGen uses the `CodeGenDatabaseProvider` abstraction to generate platform-native SQL:

| Provider | Package | Generates |
|----------|---------|-----------|
| `SQLServerCodeGenProvider` | `@memberjunction/codegen-lib` | T-SQL stored procedures, views with `[bracket]` quoting, OBJECT_ID checks |
| `PostgreSQLCodeGenProvider` | `@memberjunction/postgresql-dataprovider` | PL/pgSQL functions, views with `"double-quote"` identifiers, DROP IF EXISTS |

Each provider implements 55+ abstract methods covering views, CRUD operations, triggers, indexes, permissions, cascade deletes, and more. The provider is selected at runtime based on the database connection configuration.

## Adding Support for a New Database

To add a new database backend (e.g., MySQL, Oracle):

1. **Create a `CodeGenDatabaseProvider` subclass** — implement all abstract methods with platform-native SQL generation
2. **Create a `SQLDialect` subclass** — define identifier quoting, type mappings, and expression conversions
3. **Create SQL Converter rules** (optional) — if you want to convert hand-written T-SQL migrations to the new dialect
4. **Create a runtime data provider** — implement `DatabaseProviderBase` from `@memberjunction/core` for the application runtime
5. **Register all classes** via `@RegisterClass`

The PostgreSQL implementation serves as the reference for adding new backends.

## FAQ

**Q: Why not use a database-agnostic migration format?**
A: Hand-written migrations are relatively simple DDL that converts cleanly. But CodeGen output includes complex views with recursive CTEs, stored procedures with cursor-based cascade deletes, and triggers — these benefit enormously from native generation. A lowest-common-denominator abstraction would sacrifice the power of each platform.

**Q: Why is T-SQL the source dialect for migrations?**
A: MJ's core development historically uses SQL Server. As the ecosystem matures and more databases are supported, the conversion toolchain ensures all platforms stay synchronized without requiring developers to maintain parallel migration files manually.

**Q: Do I need both databases running to develop?**
A: Only MJ core developers maintaining dual-database support need both. End users and most app developers work with a single database.

**Q: Why not just convert CodeGen output with the SQL Converter instead of running CodeGen twice?**
A: CodeGen output includes complex platform-specific SQL — recursive CTEs for hierarchy views, cursor-based cascade delete procedures, timestamp triggers, full-text search infrastructure, and more. The `PostgreSQLCodeGenProvider` already has 55+ methods that generate all of this natively for PG. Converting it would mean reimplementing that same logic in the converter, duplicating work and introducing conversion risk. By contrast, hand-written migrations are straightforward DDL that converts cleanly with near-zero risk.

**Q: What if the SQL Converter can't handle a specific T-SQL pattern?**
A: The converter is extensible — new conversion rules can be added for patterns it doesn't yet support. File an issue or contribute a rule. The converter also flags unconverted batches with TODO comments so nothing is silently lost.
