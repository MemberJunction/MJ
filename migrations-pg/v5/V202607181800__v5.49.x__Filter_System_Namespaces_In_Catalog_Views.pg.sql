-- ----------------------------------------------------------------------------
-- [Large Schema Series] Filter system namespaces in PG catalog introspection views
--
-- The four CodeGen introspection views below scanned the ENTIRE cluster catalog
-- with no namespace filter. On large schemas this is the dominant CodeGen cost:
--   * vwSQLTablesAndEntities LEFT JOINs Entity, so every non-entity relation in
--     the cluster (all of pg_catalog, information_schema, other apps' schemas)
--     flows through with EntityID NULL — and vwSQLColumnsAndEntityFields then
--     computes col_description()/pg_get_expr()/fnMapPGDefaultToMJ() for every
--     column of every such relation.
--   * vwForeignKeys / vwTablePrimaryKeys / vwTableUniqueKeys scan all
--     constraints/indexes cluster-wide (system catalogs carry hundreds of
--     unique indexes themselves).
--   * CodeGen itself GROWS the catalog while running (base views + CRUD
--     functions per entity), so each successive introspection re-scans a
--     bigger catalog — measured super-linear: 87 min at ~2,000 tables.
--
-- Fix: exclude system namespaces (pg_catalog, information_schema, pg_toast*,
-- pg_temp*). MJ entities can never live in these namespaces, so no legitimate
-- row is lost. Column lists are unchanged → CREATE OR REPLACE is safe for the
-- dependent view (vwSQLColumnsAndEntityFields anchors on vwSQLTablesAndEntities).
-- ----------------------------------------------------------------------------

CREATE OR REPLACE VIEW __mj."vwForeignKeys" AS
 SELECT con.conname AS "FK_NAME",
    n1.nspname AS schema_name,
    c1.relname AS "table",
    a1.attname AS "column",
    n2.nspname AS referenced_schema,
    c2.relname AS referenced_table,
    a2.attname AS referenced_column
   FROM (((((((pg_constraint con
     JOIN pg_class c1 ON ((con.conrelid = c1.oid)))
     JOIN pg_namespace n1 ON ((c1.relnamespace = n1.oid)))
     JOIN pg_class c2 ON ((con.confrelid = c2.oid)))
     JOIN pg_namespace n2 ON ((c2.relnamespace = n2.oid)))
     CROSS JOIN LATERAL UNNEST(con.conkey, con.confkey) cols(parent_col, ref_col))
     JOIN pg_attribute a1 ON (((a1.attrelid = c1.oid) AND (a1.attnum = cols.parent_col))))
     JOIN pg_attribute a2 ON (((a2.attrelid = c2.oid) AND (a2.attnum = cols.ref_col))))
  WHERE (con.contype = 'f'::"char")
    -- [Large Schema Series] FKs can only originate from user schemas; filtering
    -- the parent side is sufficient and never drops a legitimate FK.
    AND n1.nspname NOT IN ('pg_catalog', 'information_schema')
    AND n1.nspname NOT LIKE 'pg_toast%'
    AND n1.nspname NOT LIKE 'pg_temp%';

CREATE OR REPLACE VIEW __mj."vwSQLTablesAndEntities" AS
 SELECT e."ID" AS "EntityID",
    e."Name" AS "EntityName",
    e."VirtualEntity",
    c.relname AS "TableName",
    n.nspname AS "SchemaName",
    c.oid AS object_id,
    c.relname AS name,
    c.relnamespace AS schema_id,
        CASE c.relkind
            WHEN 'r'::"char" THEN 'U'::text
            WHEN 'v'::"char" THEN 'V'::text
            ELSE (c.relkind)::text
        END AS type,
    v.oid AS view_object_id,
    v.relname AS "ViewName",
    obj_description(c.oid, 'pg_class'::name) AS "TableDescription",
    obj_description(v.oid, 'pg_class'::name) AS "ViewDescription",
    COALESCE(obj_description(v.oid, 'pg_class'::name), obj_description(c.oid, 'pg_class'::name)) AS "EntityDescription"
   FROM ((((pg_class c
     JOIN pg_namespace n ON ((c.relnamespace = n.oid)))
     LEFT JOIN __mj."Entity" e ON (((c.relname = (e."BaseTable")::text) AND (n.nspname = (e."SchemaName")::text))))
     LEFT JOIN pg_class v ON ((((e."BaseView")::text = v.relname) AND (v.relkind = 'v'::"char") AND (v.relnamespace = n.oid))))
     LEFT JOIN pg_namespace n_v ON ((v.relnamespace = n_v.oid)))
  WHERE (((n_v.nspname = (e."SchemaName")::text) OR (n_v.nspname IS NULL))
    AND ((c.relkind = 'r'::"char") OR ((c.relkind = 'v'::"char") AND (e."VirtualEntity" = true)))
    -- [Large Schema Series] system namespaces can never host MJ entities; without
    -- this filter every pg_catalog table flowed through with EntityID NULL and
    -- vwSQLColumnsAndEntityFields paid per-column introspection for all of them.
    AND n.nspname NOT IN ('pg_catalog', 'information_schema')
    AND n.nspname NOT LIKE 'pg_toast%'
    AND n.nspname NOT LIKE 'pg_temp%');

CREATE OR REPLACE VIEW __mj."vwTablePrimaryKeys" AS
 SELECT n.nspname AS "SchemaName",
    c.relname AS "TableName",
    a.attname AS "ColumnName"
   FROM ((((pg_index i
     JOIN pg_class c ON ((i.indrelid = c.oid)))
     JOIN pg_namespace n ON ((c.relnamespace = n.oid)))
     CROSS JOIN LATERAL unnest(i.indkey) cols(col_num))
     JOIN pg_attribute a ON (((a.attrelid = c.oid) AND (a.attnum = cols.col_num))))
  WHERE (i.indisprimary = true)
    -- [Large Schema Series] exclude system-catalog indexes (pg_catalog alone
    -- carries hundreds); MJ entities never live in system namespaces.
    AND n.nspname NOT IN ('pg_catalog', 'information_schema')
    AND n.nspname NOT LIKE 'pg_toast%'
    AND n.nspname NOT LIKE 'pg_temp%';

CREATE OR REPLACE VIEW __mj."vwTableUniqueKeys" AS
 SELECT n.nspname AS "SchemaName",
    c.relname AS "TableName",
    a.attname AS "ColumnName"
   FROM ((((pg_index i
     JOIN pg_class c ON ((i.indrelid = c.oid)))
     JOIN pg_namespace n ON ((c.relnamespace = n.oid)))
     CROSS JOIN LATERAL unnest(i.indkey) cols(col_num))
     JOIN pg_attribute a ON (((a.attrelid = c.oid) AND (a.attnum = cols.col_num))))
  WHERE ((i.indisunique = true) AND (i.indisprimary = false))
    -- [Large Schema Series] same namespace exclusion as vwTablePrimaryKeys.
    AND n.nspname NOT IN ('pg_catalog', 'information_schema')
    AND n.nspname NOT LIKE 'pg_toast%'
    AND n.nspname NOT LIKE 'pg_temp%';
