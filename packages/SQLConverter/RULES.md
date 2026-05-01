# SQLConverter Rule Audit

This document classifies every conversion rule in the T-SQL → PostgreSQL pipeline. It is the source-of-truth reference for what the converter does, why each rule exists, and where each rule sits in the conversion flow.

For the architectural goals these rules support, see [`/plans/pg-migration-architecture/ARCHITECTURE_PLAN.md`](../../plans/pg-migration-architecture/ARCHITECTURE_PLAN.md). For implementation patterns, read the rule files themselves under `src/rules/`.

## Rule classification

Every rule is one of:
- **Bypass** — handles the entire conversion in TypeScript without invoking SQLGlot. Used when SQLGlot's output is incomplete, incorrect, or doesn't apply MJ-specific conventions. Each Bypass rule must populate `BypassJustification` on its class so the bypass is auditable.
- **Pre-process** — runs before SQLGlot to massage input into something SQLGlot can transpile. *(none currently — historical category for future rule additions)*
- **Post-process** — runs after SQLGlot to fix specific output patterns. *(handled today by the global `PostProcessor.ts` pass, not as discrete rules)*

All 14 production rules are currently **Bypass** rules. This is intentional: T-SQL → PG conversion involves enough structural transformation, MJ-specific conventions, and DDL idempotency requirements that hand-written rules produce cleaner output than post-fixing SQLGlot's translation.

## Rule registry

Rules are loaded by `getRulesForDialects('tsql', 'postgres')` and applied in `Priority` order (lower runs first). Each batch is classified by `StatementClassifier.classifyBatch()`, then matched to rules whose `AppliesTo` contains the classification.

| Priority | Rule | Applies To | What it does |
|---:|---|---|---|
| 10 | **CreateTableRule** | `CREATE_TABLE` | Translates T-SQL CREATE TABLE to PG, including MJ's `__mj_CreatedAt`/`__mj_UpdatedAt` triggers, NEWSEQUENTIALID/NEWID defaults, IDENTITY columns, computed columns, and the standard PG header (extensions, schema, implicit cast). |
| 15 | **CatalogViewRule** | `CREATE_VIEW` (catalog only) | Hand-translates T-SQL system catalog views (`sys.tables`, `sys.columns`, `INFORMATION_SCHEMA.*`) to PG `pg_catalog` / `information_schema` equivalents. Detects catalog-view patterns and rewrites column projections + WHERE clauses. |
| 20 | **ViewRule** | `CREATE_VIEW` | CREATE VIEW handling with DDL-aware DROP+CREATE: when the batch contains ALTER TABLE or CREATE TABLE, emits `DROP VIEW IF EXISTS … CASCADE` before `CREATE OR REPLACE VIEW` (column list may have changed). Also handles topological view ordering at the batch level. |
| 30 | **ProcedureToFunctionRule** | `CREATE_PROCEDURE` | Converts T-SQL stored procedures to PG functions (`@param` → `p_param`, RAISERROR → RAISE EXCEPTION, BEGIN/END semantics, RETURN value handling, SETOF return types). |
| 35 | **FunctionRule** | `CREATE_FUNCTION` | Handles T-SQL CREATE FUNCTION (scalar UDFs, table-valued functions, inline TVFs) → PG. Manages RETURNS TABLE syntax differences and LANGUAGE plpgsql wrapping. |
| 40 | **TriggerRule** | `CREATE_TRIGGER` | Converts T-SQL AFTER/INSTEAD OF triggers (with INSERTED/DELETED virtual tables) to the PG two-statement model: trigger function + CREATE TRIGGER. |
| 50 | **InsertRule** | `INSERT`, `UPDATE`, `DELETE` | Strips T-SQL `N'...'` string prefixes, converts GETUTCDATE/GETDATE → NOW(), handles IDENTITY_INSERT, quotes PascalCase identifiers, and accepts SQL Server BIT (0/1) for PG BOOLEAN columns via `castcontext='i'`. |
| 52 | **ExecBlockRule** | `EXEC_BLOCK` | T-SQL `DECLARE @var; SET @var = ...; EXEC schema.proc(...)` blocks (the metadata-sync EXEC pattern) → PG `DO $$ BEGIN PERFORM schema.proc(...) END $$` with variable mapping and parameter passing. |
| 53 | **DeclareDmlBlockRule** | `DECLARE_DML_BLOCK` | T-SQL DECLARE @var blocks containing DML (UPDATE/INSERT/DELETE) or dynamic EXEC → PG `DO $$ DECLARE … BEGIN … END $$`. Handles `@var` → `v_var` rename, `IF/BEGIN/END` → `IF/THEN/END IF`, `EXEC('str' + @var)` → `EXECUTE format('str %I', v_var)`. |
| 55 | **ConditionalDDLRule** | `CONDITIONAL_DDL` | T-SQL `IF NOT EXISTS` / `IF OBJECT_ID(...)` guards around DDL → PG `IF NOT EXISTS` clauses or `DO $$ BEGIN … EXCEPTION` blocks for idempotency. |
| 60 | **AlterTableRule** | `FK_CONSTRAINT`, `PK_CONSTRAINT`, `CHECK_CONSTRAINT`, `UNIQUE_CONSTRAINT`, `ENABLE_CONSTRAINT`, `ALTER_TABLE` | The widest-coverage rule. Handles multi-column ADD with inline `CONSTRAINT`, strips inline `FOREIGN KEY` keyword (PG only allows it at table level), converts `ALTER COLUMN type NOT NULL` → `SET NOT NULL`, `ADD CONSTRAINT name DEFAULT val FOR col` → `ALTER COLUMN col SET DEFAULT val`, adds `DEFERRABLE INITIALLY DEFERRED` to FKs, and quotes PascalCase column names in CHECK bodies (paren-balanced extraction so CHECK doesn't leak). |
| 70 | **CreateIndexRule** | `CREATE_INDEX` | Adds `CREATE INDEX IF NOT EXISTS` for idempotency, strips T-SQL filegroup syntax (`ON [PRIMARY]`), removes `WITH NOCHECK`, truncates index names exceeding PG's 63-char limit (with hash suffix to stay unique). |
| 80 | **GrantRule** | `GRANT`, `REVOKE` | Renames `GRANT EXEC` → `GRANT EXECUTE`, wraps each grant in `DO $$ BEGIN GRANT …; EXCEPTION WHEN others THEN NULL; END $$;` so grants tolerate missing roles or functions during fresh installs. |
| 90 | **ExtendedPropertyRule** | `EXTENDED_PROPERTY` | Converts `EXEC sp_addextendedproperty @name=N'MS_Description', …` calls to PG `COMMENT ON TABLE/COLUMN/FUNCTION` statements, parsing the `@level0type/@level1type/@level2type` arguments. |

## Bypass justifications

Each rule's `BypassJustification` field documents *why* SQLGlot is bypassed. When SQLGlot improves coverage upstream (e.g., a new release handles a pattern we previously had to bypass), use these justifications to identify rules that may now be reducible to post-process tweaks. The architectural goal is "**SQLGlot handles >90% of statements**" — every Bypass rule is a deviation from that goal that should be revisited periodically.

## Global post-processing

Beyond the per-rule pipeline, `src/rules/PostProcessor.ts` runs a single sweep over the assembled output to handle cross-statement and cross-batch fixups: information_schema lowercasing, NOW()/comment separation, missing semicolons on multi-line ALTER TABLE, orphaned DECLARE-less blocks, and `;` cleanup. See the comments in that file for the rationale on each pass.

## Adding a new rule

1. Create `src/rules/MyRule.ts` extending `IConversionRule`.
2. Set `Name`, `SourceDialect`, `TargetDialect`, `AppliesTo`, `Priority`.
3. Implement `PostProcess(sql, originalSQL, context)`.
4. If you set `BypassSqlglot = true`, you **must** populate `BypassJustification` with a clear explanation of why SQLGlot can't handle the pattern.
5. Register the rule in `src/rules/TSQLToPostgresRules.ts` (or the equivalent dialect file).
6. Add unit tests in `src/__tests__/MyRule.test.ts`.
7. Add an entry to the table above.
