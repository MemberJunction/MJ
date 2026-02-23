/**
 * CatalogViewRule — converts SQL Server system catalog wrapper views to PostgreSQL equivalents.
 *
 * MemberJunction's CodeGen system uses 7 metadata views that wrap SQL Server `sys.*` catalog
 * tables. These cannot be mechanically converted by the general ViewRule because `sys.*` has
 * no direct PG equivalent. This rule intercepts those views by name and emits hand-written
 * PostgreSQL definitions that query `pg_catalog` / `information_schema` instead.
 *
 * Priority 15 — runs BEFORE the general ViewRule (priority 20) so it can intercept catalog
 * views before they hit ViewRule's `sys.*` skip logic. Non-catalog views are delegated to
 * the ViewRule instance for normal processing.
 */
import type { IConversionRule, ConversionContext, StatementType } from './types.js';
import { ViewRule } from './ViewRule.js';

/** Hand-written PostgreSQL equivalents for each catalog view */
const PG_CATALOG_VIEWS: ReadonlyMap<string, string> = new Map([

  // ─── 1. vwSQLTablesAndEntities ──────────────────────────────────────────────
  ['vwSQLTablesAndEntities', `CREATE OR REPLACE VIEW __mj."vwSQLTablesAndEntities" AS
SELECT
    e."ID"                                     AS "EntityID",
    e."Name"                                   AS "EntityName",
    e."VirtualEntity",
    c.relname                                  AS "TableName",
    n.nspname                                  AS "SchemaName",
    c.oid                                      AS object_id,
    c.relname                                  AS name,
    c.relnamespace                             AS schema_id,
    CASE c.relkind
        WHEN 'r' THEN 'U'
        WHEN 'v' THEN 'V'
        ELSE c.relkind::text
    END                                        AS type,
    v.oid                                      AS view_object_id,
    v.relname                                  AS "ViewName",
    obj_description(c.oid, 'pg_class')         AS "TableDescription",
    obj_description(v.oid, 'pg_class')         AS "ViewDescription",
    COALESCE(
        obj_description(v.oid, 'pg_class'),
        obj_description(c.oid, 'pg_class')
    )                                          AS "EntityDescription"
FROM
    pg_catalog.pg_class c
INNER JOIN
    pg_catalog.pg_namespace n ON c.relnamespace = n.oid
LEFT OUTER JOIN
    __mj."Entity" e ON c.relname = e."BaseTable" AND n.nspname = e."SchemaName"
LEFT OUTER JOIN
    pg_catalog.pg_class v
        ON e."BaseView" = v.relname
        AND v.relkind = 'v'
        AND v.relnamespace = n.oid
LEFT OUTER JOIN
    pg_catalog.pg_namespace n_v ON v.relnamespace = n_v.oid
WHERE
    (n_v.nspname = e."SchemaName" OR n_v.nspname IS NULL)
    AND (
        c.relkind = 'r'
        OR (c.relkind = 'v' AND e."VirtualEntity" = true)
    );
`],

  // ─── 2. vwForeignKeys ──────────────────────────────────────────────────────
  ['vwForeignKeys', `CREATE OR REPLACE VIEW __mj."vwForeignKeys" AS
SELECT
    con.conname                                AS "FK_NAME",
    n1.nspname                                 AS "schema_name",
    c1.relname                                 AS "table",
    a1.attname                                 AS "column",
    n2.nspname                                 AS "referenced_schema",
    c2.relname                                 AS "referenced_table",
    a2.attname                                 AS "referenced_column"
FROM
    pg_catalog.pg_constraint con
INNER JOIN pg_catalog.pg_class c1       ON con.conrelid  = c1.oid
INNER JOIN pg_catalog.pg_namespace n1   ON c1.relnamespace = n1.oid
INNER JOIN pg_catalog.pg_class c2       ON con.confrelid = c2.oid
INNER JOIN pg_catalog.pg_namespace n2   ON c2.relnamespace = n2.oid
CROSS JOIN LATERAL unnest(con.conkey, con.confkey)
    AS cols(parent_col, ref_col)
INNER JOIN pg_catalog.pg_attribute a1
    ON a1.attrelid = c1.oid AND a1.attnum = cols.parent_col
INNER JOIN pg_catalog.pg_attribute a2
    ON a2.attrelid = c2.oid AND a2.attnum = cols.ref_col
WHERE
    con.contype = 'f';
`],

  // ─── 3. vwTablePrimaryKeys ─────────────────────────────────────────────────
  ['vwTablePrimaryKeys', `CREATE OR REPLACE VIEW __mj."vwTablePrimaryKeys" AS
SELECT
    n.nspname                                  AS "SchemaName",
    c.relname                                  AS "TableName",
    a.attname                                  AS "ColumnName"
FROM
    pg_catalog.pg_index i
INNER JOIN pg_catalog.pg_class c       ON i.indrelid = c.oid
INNER JOIN pg_catalog.pg_namespace n   ON c.relnamespace = n.oid
CROSS JOIN LATERAL unnest(i.indkey) AS cols(col_num)
INNER JOIN pg_catalog.pg_attribute a
    ON a.attrelid = c.oid AND a.attnum = cols.col_num
WHERE
    i.indisprimary = true;
`],

  // ─── 4. vwTableUniqueKeys ─────────────────────────────────────────────────
  ['vwTableUniqueKeys', `CREATE OR REPLACE VIEW __mj."vwTableUniqueKeys" AS
SELECT
    n.nspname                                  AS "SchemaName",
    c.relname                                  AS "TableName",
    a.attname                                  AS "ColumnName"
FROM
    pg_catalog.pg_index i
INNER JOIN pg_catalog.pg_class c       ON i.indrelid = c.oid
INNER JOIN pg_catalog.pg_namespace n   ON c.relnamespace = n.oid
CROSS JOIN LATERAL unnest(i.indkey) AS cols(col_num)
INNER JOIN pg_catalog.pg_attribute a
    ON a.attrelid = c.oid AND a.attnum = cols.col_num
WHERE
    i.indisunique = true
    AND i.indisprimary = false;
`],

  // ─── 5. vwSQLSchemas ──────────────────────────────────────────────────────
  ['vwSQLSchemas', `CREATE OR REPLACE VIEW __mj."vwSQLSchemas" AS
SELECT
    n.oid::integer                             AS "SchemaID",
    n.nspname                                  AS "SchemaName",
    CAST(d.description AS TEXT)                AS "SchemaDescription"
FROM
    pg_catalog.pg_namespace n
LEFT OUTER JOIN
    pg_catalog.pg_description d
        ON d.objoid = n.oid
        AND d.objsubid = 0
        AND d.classoid = 'pg_catalog.pg_namespace'::regclass
WHERE
    n.nspname NOT LIKE 'pg\\_%'
    AND n.nspname NOT IN ('information_schema', 'pg_catalog', 'pg_toast');
`],

  // ─── 6. vwSQLColumnsAndEntityFields ────────────────────────────────────────
  ['vwSQLColumnsAndEntityFields', `CREATE OR REPLACE VIEW __mj."vwSQLColumnsAndEntityFields" AS
SELECT
    e."EntityID",
    e."EntityName"                             AS "Entity",
    e."SchemaName",
    e."TableName",
    ef."ID"                                    AS "EntityFieldID",
    ef."Sequence"                              AS "EntityFieldSequence",
    ef."Name"                                  AS "EntityFieldName",
    a.attnum                                   AS "Sequence",
    bt_a.attnum                                AS "BaseTableSequence",
    a.attname                                  AS "FieldName",
    COALESCE(base_t.typname, t.typname)        AS "Type",
    CASE WHEN t.typtype = 'd' THEN t.typname ELSE NULL END
                                               AS "UserDefinedType",
    CASE
        WHEN t.typname IN ('varchar', 'bpchar', 'char')
            THEN CASE WHEN a.atttypmod = -1 THEN -1 ELSE a.atttypmod - 4 END
        WHEN t.typname = 'text' THEN -1
        ELSE a.attlen::integer
    END                                        AS "Length",
    CASE
        WHEN t.typname = 'numeric' AND a.atttypmod != -1
            THEN ((a.atttypmod - 4) >> 16) & 65535
        ELSE 0
    END                                        AS "Precision",
    CASE
        WHEN t.typname = 'numeric' AND a.atttypmod != -1
            THEN (a.atttypmod - 4) & 65535
        ELSE 0
    END                                        AS "Scale",
    NOT a.attnotnull                           AS "AllowsNull",
    CASE WHEN COALESCE(bt_a.attidentity, '') IN ('a','d') THEN 1 ELSE 0 END
                                               AS "AutoIncrement",
    a.attnum                                   AS column_id,
    CASE WHEN bt_a.attnum IS NULL THEN 1 ELSE 0 END
                                               AS "IsVirtual",
    src_cls.oid                                AS object_id,
    NULL::text                                 AS "DefaultConstraintName",
    pg_get_expr(ad.adbin, ad.adrelid)          AS "DefaultValue",
    NULL::text                                 AS "ComputedColumnDefinition",
    COALESCE(
        col_description(src_cls.oid, a.attnum),
        col_description(bt_cls.oid, bt_a.attnum)
    )                                          AS "Description",
    col_description(src_cls.oid, a.attnum)     AS "ViewColumnDescription",
    CASE
        WHEN bt_a.attnum IS NOT NULL
            THEN col_description(bt_cls.oid, bt_a.attnum)
        ELSE NULL
    END                                        AS "TableColumnDescription"
FROM
    __mj."vwSQLTablesAndEntities" e
-- Source class: view if it exists, otherwise the base table
INNER JOIN
    pg_catalog.pg_class src_cls
        ON src_cls.oid = COALESCE(e.view_object_id, e.object_id)
INNER JOIN
    pg_catalog.pg_attribute a
        ON a.attrelid = src_cls.oid
        AND a.attnum > 0
        AND NOT a.attisdropped
INNER JOIN
    pg_catalog.pg_type t ON a.atttypid = t.oid
LEFT JOIN
    pg_catalog.pg_type base_t
        ON t.typbasetype = base_t.oid AND t.typtype = 'd'
-- Base table class (always the table, not the view)
INNER JOIN
    pg_catalog.pg_class bt_cls ON bt_cls.oid = e.object_id
-- Base table column (NULL when column exists only in the view → IsVirtual)
LEFT JOIN
    pg_catalog.pg_attribute bt_a
        ON bt_a.attrelid = bt_cls.oid
        AND bt_a.attname = a.attname
        AND bt_a.attnum > 0
        AND NOT bt_a.attisdropped
-- Default value from base table
LEFT JOIN
    pg_catalog.pg_attrdef ad
        ON ad.adrelid = bt_cls.oid
        AND ad.adnum = bt_a.attnum
-- MemberJunction EntityField metadata
LEFT JOIN
    __mj."EntityField" ef
        ON e."EntityID" = ef."EntityID"
        AND a.attname = ef."Name";
`],

  // ─── 7. vwEntityFieldsWithCheckConstraints ─────────────────────────────────
  ['vwEntityFieldsWithCheckConstraints', `CREATE OR REPLACE VIEW __mj."vwEntityFieldsWithCheckConstraints" AS
SELECT
    e."ID"                                     AS "EntityID",
    e."Name"                                   AS "EntityName",
    ef."ID"                                    AS "EntityFieldID",
    ef."Name"                                  AS "EntityFieldName",
    gc."ID"                                    AS "GeneratedCodeID",
    gc."Name"                                  AS "GeneratedValidationFunctionName",
    gc."Description"                           AS "GeneratedValidationFunctionDescription",
    gc."Code"                                  AS "GeneratedValidationFunctionCode",
    gc."Source"                                AS "GeneratedValidationFunctionCheckConstraint",
    n.nspname                                  AS "SchemaName",
    c.relname                                  AS "TableName",
    a.attname                                  AS "ColumnName",
    con.conname                                AS "ConstraintName",
    pg_get_constraintdef(con.oid)              AS "ConstraintDefinition"
FROM
    pg_catalog.pg_constraint con
INNER JOIN
    pg_catalog.pg_class c ON con.conrelid = c.oid
INNER JOIN
    pg_catalog.pg_namespace n ON c.relnamespace = n.oid
INNER JOIN
    __mj."Entity" e
        ON e."SchemaName" = n.nspname
        AND e."BaseTable" = c.relname
LEFT OUTER JOIN
    pg_catalog.pg_attribute a
        ON a.attrelid = c.oid
        AND array_length(con.conkey, 1) = 1
        AND a.attnum = con.conkey[1]
LEFT OUTER JOIN
    __mj."EntityField" ef
        ON e."ID" = ef."EntityID"
        AND ef."Name" = a.attname
LEFT OUTER JOIN
    __mj."vwGeneratedCodes" gc
        ON (
            (ef."ID" IS NOT NULL AND gc."LinkedEntity" = 'MJ: Entity Fields' AND gc."LinkedRecordPrimaryKey" = CAST(ef."ID" AS TEXT))
            OR
            (ef."ID" IS NULL AND gc."LinkedEntity" = 'MJ: Entities' AND gc."LinkedRecordPrimaryKey" = CAST(e."ID" AS TEXT))
        )
        AND pg_get_constraintdef(con.oid) = gc."Source"
WHERE
    con.contype = 'c';
`],

  // ─── vwFlywayVersionHistoryParsed — SKIP ──────────────────────────────────
  // This view queries flyway_schema_history + ExtractVersionComponents (SQL Server UDF).
  // PostgreSQL Flyway uses its own migration tracking, so this view is not needed.
  ['vwFlywayVersionHistoryParsed', `-- SKIPPED: vwFlywayVersionHistoryParsed — references flyway_schema_history and
-- SQL Server-specific ExtractVersionComponents function. PostgreSQL Flyway uses
-- its own migration tracking mechanism. This view is not needed for PG.
`],
]);

/** Set of catalog view names for quick lookup */
const CATALOG_VIEW_NAMES = new Set(PG_CATALOG_VIEWS.keys());

export class CatalogViewRule implements IConversionRule {
  Name = 'CatalogViewRule';
  SourceDialect = 'tsql';
  TargetDialect = 'postgres';
  AppliesTo: StatementType[] = ['CREATE_VIEW'];
  Priority = 15; // Run BEFORE ViewRule (priority 20)
  BypassSqlglot = true;

  /** ViewRule instance for delegating non-catalog views */
  private viewRule = new ViewRule();

  PostProcess(sql: string, originalSQL: string, context: ConversionContext): string {
    // Extract the view name from the CREATE VIEW statement.
    // Strip SQL comments first to avoid matching words inside comments.
    const noComments = sql.replace(/--[^\n]*/g, '');
    const viewNameMatch = noComments.match(
      /CREATE\s+(?:OR\s+ALTER\s+)?VIEW\s+(?:\[?\w+\]?\.)?\[?(\w+)\]?/i
    );
    const declaredViewName = viewNameMatch?.[1] ?? '';

    // Check if the declared view name matches one of our catalog views
    if (declaredViewName && CATALOG_VIEW_NAMES.has(declaredViewName)) {
      return PG_CATALOG_VIEWS.get(declaredViewName)!;
    }

    // Not a catalog view — delegate to the standard ViewRule
    return this.viewRule.PostProcess!(sql, originalSQL, context);
  }
}
