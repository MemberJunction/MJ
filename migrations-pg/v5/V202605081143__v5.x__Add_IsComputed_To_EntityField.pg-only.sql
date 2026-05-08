-- ╔══════════════════════════════════════════════════════════════════════════╗
-- ║ Add IsComputed flag to EntityField (PostgreSQL counterpart)              ║
-- ║                                                                          ║
-- ║ Companion to V202605081143__v5.x__Add_IsComputed_To_EntityField.sql.    ║
-- ║ Adds the IsComputed BOOLEAN column on EntityField, refreshes the         ║
-- ║ vwSQLColumnsAndEntityFields view to project the new column derived from  ║
-- ║ pg_attribute.attgenerated, and rewrites spUpdateExistingEntityFieldsFromSchema
-- ║ to sync IsComputed alongside IsVirtual.                                  ║
-- ║                                                                          ║
-- ║ See plans/computed-columns-support.md for the full design.               ║
-- ╚══════════════════════════════════════════════════════════════════════════╝


-- ===================== DDL: Add IsComputed column =====================

ALTER TABLE ${flyway:defaultSchema}."EntityField"
    ADD COLUMN IF NOT EXISTS "IsComputed" BOOLEAN NOT NULL
        CONSTRAINT "DF_EntityField_IsComputed" DEFAULT FALSE;

COMMENT ON COLUMN ${flyway:defaultSchema}."EntityField"."IsComputed" IS
    'When true, this field is a SQL Server computed column or PostgreSQL generated column — physically present in the base table but read-only at the SQL layer. Distinct from IsVirtual, which means the column is not in the base table at all (e.g., joined name lookups in the base view). A computed column has both IsVirtual=true (read-only at the API layer) and IsComputed=true (physically in the table).';


-- ===================== Refresh vwSQLColumnsAndEntityFields =====================
-- Projects IsComputed (and an updated IsVirtual that includes generated columns)
-- so spUpdateExistingEntityFieldsFromSchema and CodeGen's pending-fields query
-- can read both flags. Mirrors packages/SQLConverter/src/rules/CatalogViewRule.ts
-- so a fresh install (which goes through SQLConverter) and an upgraded install
-- (which goes through this migration) end up with the same view shape.

DO $do$
DECLARE
  v_target_schema CONSTANT TEXT := '${flyway:defaultSchema}';
  v_target_name CONSTANT TEXT := 'vwSQLColumnsAndEntityFields';
  vsql CONSTANT TEXT := $vsql$CREATE OR REPLACE VIEW ${flyway:defaultSchema}."vwSQLColumnsAndEntityFields" AS
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
    CASE WHEN bt_a.attnum IS NULL OR COALESCE(bt_a.attgenerated, '') <> '' THEN 1 ELSE 0 END
                                               AS "IsVirtual",
    CASE WHEN COALESCE(bt_a.attgenerated, '') <> '' THEN 1 ELSE 0 END
                                               AS "IsComputed",
    src_cls.oid                                AS object_id,
    NULL::text                                 AS "DefaultConstraintName",
    pg_get_expr(ad.adbin, ad.adrelid)          AS "DefaultValue",
    CASE WHEN COALESCE(bt_a.attgenerated, '') <> '' THEN pg_get_expr(ad.adbin, ad.adrelid) ELSE NULL END
                                               AS "ComputedColumnDefinition",
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
    ${flyway:defaultSchema}."vwSQLTablesAndEntities" e
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
INNER JOIN
    pg_catalog.pg_class bt_cls ON bt_cls.oid = e.object_id
LEFT JOIN
    pg_catalog.pg_attribute bt_a
        ON bt_a.attrelid = bt_cls.oid
        AND bt_a.attname = a.attname
        AND bt_a.attnum > 0
        AND NOT bt_a.attisdropped
LEFT JOIN
    pg_catalog.pg_attrdef ad
        ON ad.adrelid = bt_cls.oid
        AND ad.adnum = bt_a.attnum
LEFT JOIN
    ${flyway:defaultSchema}."EntityField" ef
        ON e."EntityID" = ef."EntityID"
        AND a.attname = ef."Name"$vsql$;
  v_target_oid OID;
  v_dep RECORD;
  v_captured JSONB[] := ARRAY[]::JSONB[];
  v_n INTEGER;
BEGIN
  EXECUTE vsql;
EXCEPTION WHEN invalid_table_definition THEN
  -- Column list changed; need CASCADE. Preserve dependent views first.
  SELECT c.oid INTO v_target_oid
  FROM pg_class c JOIN pg_namespace n ON c.relnamespace = n.oid
  WHERE n.nspname = v_target_schema AND c.relname = v_target_name AND c.relkind = 'v';
  IF v_target_oid IS NOT NULL THEN
    FOR v_dep IN
      WITH RECURSIVE deps AS (
        SELECT c.oid, c.relname AS name, n.nspname AS schema, 1 AS depth
        FROM pg_rewrite r
        JOIN pg_depend d ON d.objid = r.oid
        JOIN pg_class c ON c.oid = r.ev_class
        JOIN pg_namespace n ON c.relnamespace = n.oid
        WHERE d.refobjid = v_target_oid AND d.deptype = 'n'
          AND c.oid <> v_target_oid AND c.relkind = 'v'
        UNION
        SELECT c.oid, c.relname, n.nspname, p.depth + 1
        FROM deps p
        JOIN pg_rewrite r ON TRUE
        JOIN pg_depend d ON d.objid = r.oid AND d.refobjid = p.oid
        JOIN pg_class c ON c.oid = r.ev_class
        JOIN pg_namespace n ON c.relnamespace = n.oid
        WHERE c.relkind = 'v' AND c.oid <> p.oid
      )
      SELECT oid, name, schema, MAX(depth) AS max_depth,
             pg_catalog.pg_get_viewdef(oid, true) AS viewdef
      FROM deps GROUP BY oid, name, schema
      ORDER BY MAX(depth) ASC
    LOOP
      v_captured := v_captured || jsonb_build_object(
        'schema', v_dep.schema, 'name', v_dep.name, 'def', v_dep.viewdef);
    END LOOP;
  END IF;
  EXECUTE format('DROP VIEW IF EXISTS %I.%I CASCADE', v_target_schema, v_target_name);
  EXECUTE vsql;
  IF v_captured IS NOT NULL AND array_length(v_captured, 1) > 0 THEN
    FOR v_n IN 1..array_length(v_captured, 1) LOOP
      BEGIN
        EXECUTE format('CREATE VIEW %I.%I AS %s',
          v_captured[v_n]->>'schema', v_captured[v_n]->>'name', v_captured[v_n]->>'def');
      EXCEPTION WHEN others THEN
        RAISE WARNING 'Could not restore dependent view %.%: %',
          v_captured[v_n]->>'schema', v_captured[v_n]->>'name', SQLERRM;
      END;
    END LOOP;
  END IF;
END;
$do$;


-- ===================== Refresh spUpdateExistingEntityFieldsFromSchema =====================
-- Mirrors V202605032310's self-heal + 4-pass renumber. The only behavioral changes are:
--   1. RETURNS TABLE adds "IsComputed" boolean
--   2. _efs_filtered SELECT projects fromSQL."IsComputed"
--   3. WHERE filter adds (ef."IsComputed" <> fromSQL."IsComputed")
--   4. Pass B UPDATE sets "IsComputed" = fr."IsComputed"
--   5. RETURN QUERY projects f."IsComputed"
-- Everything else is byte-identical to keep the self-heal/renumber logic untouched.

DROP FUNCTION IF EXISTS ${flyway:defaultSchema}."spUpdateExistingEntityFieldsFromSchema"(text, text);

CREATE OR REPLACE FUNCTION ${flyway:defaultSchema}."spUpdateExistingEntityFieldsFromSchema"(
    p_excludedschemanames text,
    p_entityids text DEFAULT NULL
)
RETURNS TABLE(
    "EntityID" uuid,
    "EntityName" character varying,
    "EntityFieldID" uuid,
    "EntityFieldName" character varying,
    "AutoUpdateDescription" boolean,
    "ExistingDescription" text,
    "SQLDescription" text,
    "Type" character varying,
    "Length" integer,
    "Precision" integer,
    "Scale" integer,
    "AllowsNull" boolean,
    "DefaultValue" text,
    "AutoIncrement" boolean,
    "IsVirtual" boolean,
    "IsComputed" boolean,
    "Sequence" integer,
    "RelatedEntityID" uuid,
    "RelatedEntityFieldName" character varying,
    "IsPrimaryKey" boolean,
    "IsUnique" boolean
)
LANGUAGE plpgsql
AS $func$
DECLARE
    v_scoped_ids UUID[] := NULL;
BEGIN
    IF p_entityids IS NOT NULL AND length(BTRIM(p_entityids)) > 0 THEN
        SELECT array_agg(DISTINCT s::uuid) INTO v_scoped_ids
        FROM (
            SELECT BTRIM(unnest(string_to_array(p_entityids, ','))) AS s
        ) raw
        WHERE raw.s ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$';
        IF v_scoped_ids IS NULL OR array_length(v_scoped_ids, 1) IS NULL THEN
            v_scoped_ids := NULL;
        END IF;
    END IF;

    -- Self-heal: reseat any leftover negative-Sequence rows from a prior
    -- interrupted run at the tail of their entity's existing positive range.
    WITH stale AS (
        SELECT ef."ID",
               ef."EntityID",
               ROW_NUMBER() OVER (
                   PARTITION BY ef."EntityID"
                   ORDER BY abs(ef."Sequence") DESC, ef."ID"
               )
                 + COALESCE((
                     SELECT max(ef2."Sequence")
                     FROM ${flyway:defaultSchema}."EntityField" ef2
                     WHERE ef2."EntityID" = ef."EntityID"
                       AND ef2."Sequence" >= 0
                 ), 0) AS new_seq
        FROM ${flyway:defaultSchema}."EntityField" ef
        WHERE ef."Sequence" < 0
    )
    UPDATE ${flyway:defaultSchema}."EntityField" target
    SET "Sequence" = stale.new_seq
    FROM stale
    WHERE target."ID" = stale."ID";

    CREATE TEMP TABLE "_efs_filtered" ON COMMIT DROP AS
        SELECT
            e."ID"                                     AS "EntityID",
            e."Name"::VARCHAR                          AS "EntityName",
            ef."ID"                                    AS "EntityFieldID",
            ef."Name"::VARCHAR                         AS "EntityFieldName",
            ef."AutoUpdateDescription"                 AS "AutoUpdateDescription",
            ef."Description"::TEXT                     AS "ExistingDescription",
            fromSQL."Description"::TEXT                AS "SQLDescription",
            fromSQL."Type"::VARCHAR                    AS "Type",
            fromSQL."Length"::INTEGER                  AS "Length",
            fromSQL."Precision"::INTEGER               AS "Precision",
            fromSQL."Scale"::INTEGER                   AS "Scale",
            fromSQL."AllowsNull"                       AS "AllowsNull",
            fromSQL."DefaultValue"::TEXT               AS "DefaultValue",
            fromSQL."AutoIncrement"                    AS "AutoIncrement",
            fromSQL."IsVirtual"                        AS "IsVirtual",
            (fromSQL."IsComputed" = 1)                 AS "IsComputed",
            fromSQL."Sequence"::INTEGER                AS "Sequence",
            re."ID"                                    AS "RelatedEntityID",
            fk."referenced_column"::VARCHAR            AS "RelatedEntityFieldName",
            (pk."ColumnName" IS NOT NULL)              AS "IsPrimaryKey",
            CASE
                WHEN pk."ColumnName" IS NOT NULL THEN true
                WHEN uk."ColumnName" IS NOT NULL THEN true
                ELSE false
            END                                        AS "IsUnique",
            ROW_NUMBER() OVER ()                       AS "StageRow"
        FROM ${flyway:defaultSchema}."EntityField" ef
        INNER JOIN ${flyway:defaultSchema}."vwSQLColumnsAndEntityFields" fromSQL
              ON ef."EntityID" = fromSQL."EntityID"
             AND ef."Name"     = fromSQL."FieldName"
        INNER JOIN ${flyway:defaultSchema}."Entity" e
              ON ef."EntityID" = e."ID"
        LEFT OUTER JOIN ${flyway:defaultSchema}."vwForeignKeys" fk
              ON ef."Name"      = fk."column"
             AND e."BaseTable"  = fk."table"
             AND e."SchemaName" = fk."schema_name"
        LEFT OUTER JOIN ${flyway:defaultSchema}."Entity" re
              ON re."BaseTable"  = fk."referenced_table"
             AND re."SchemaName" = fk."referenced_schema"
        LEFT OUTER JOIN ${flyway:defaultSchema}."vwTablePrimaryKeys" pk
              ON e."BaseTable"  = pk."TableName"
             AND ef."Name"      = pk."ColumnName"
             AND e."SchemaName" = pk."SchemaName"
        LEFT OUTER JOIN ${flyway:defaultSchema}."vwTableUniqueKeys" uk
              ON e."BaseTable"  = uk."TableName"
             AND ef."Name"      = uk."ColumnName"
             AND e."SchemaName" = uk."SchemaName"
        LEFT OUTER JOIN (
            SELECT TRIM(s) AS "SchemaName"
            FROM unnest(string_to_array(COALESCE(p_ExcludedSchemaNames, ''), ',')) AS s
            WHERE TRIM(s) <> ''
        ) x ON e."SchemaName" = x."SchemaName"
        WHERE
            e."VirtualEntity" = false
            AND x."SchemaName" IS NULL
            AND ef."ID" IS NOT NULL
            AND (v_scoped_ids IS NULL OR e."ID" = ANY(v_scoped_ids))
            AND (
                   COALESCE(BTRIM(ef."Description"), '')
                        <> COALESCE(
                               BTRIM(
                                   CASE WHEN ef."AutoUpdateDescription" = true THEN fromSQL."Description" ELSE ef."Description" END
                               ), ''
                           )
                OR ef."Type"       <> fromSQL."Type"
                OR COALESCE(ef."Length",     -1) <> COALESCE(fromSQL."Length",     -1)
                OR COALESCE(ef."Precision",  -1) <> COALESCE(fromSQL."Precision",  -1)
                OR COALESCE(ef."Scale",      -1) <> COALESCE(fromSQL."Scale",      -1)
                OR ef."AllowsNull" <> fromSQL."AllowsNull"
                OR COALESCE(BTRIM(ef."DefaultValue"), '') <> COALESCE(BTRIM(fromSQL."DefaultValue"), '')
                OR ef."AutoIncrement" <> fromSQL."AutoIncrement"
                OR ef."IsVirtual"     <> fromSQL."IsVirtual"
                OR ef."IsComputed"    <> (fromSQL."IsComputed" = 1)
                OR ef."Sequence"      <> fromSQL."Sequence"
                OR COALESCE(ef."RelatedEntityID", '00000000-0000-0000-0000-000000000000'::uuid)
                        <> COALESCE(re."ID", '00000000-0000-0000-0000-000000000000'::uuid)
                OR COALESCE(BTRIM(ef."RelatedEntityFieldName"), '') <> COALESCE(BTRIM(fk."referenced_column"), '')
                OR ef."IsPrimaryKey" <> (pk."ColumnName" IS NOT NULL)
                OR ef."IsUnique" <> (
                       CASE
                           WHEN pk."ColumnName" IS NOT NULL THEN true
                           WHEN uk."ColumnName" IS NOT NULL THEN true
                           ELSE false
                       END
                   )
            );

    CREATE TEMP TABLE "_efs_stage_seq" ON COMMIT DROP AS
        SELECT
            ef."ID"                                                  AS "EntityFieldID",
            ef."EntityID"                                            AS "EntityID",
            -ROW_NUMBER() OVER (PARTITION BY ef."EntityID"
                                ORDER BY ef."ID")::INTEGER           AS "StagedNegativeSequence"
        FROM ${flyway:defaultSchema}."EntityField" ef
        WHERE ef."EntityID" IN (SELECT DISTINCT f2."EntityID" FROM "_efs_filtered" f2);

    -- Pass A: stage every row of every affected entity into a unique
    -- negative sequence.
    UPDATE ${flyway:defaultSchema}."EntityField" ef
    SET "Sequence" = s."StagedNegativeSequence"
    FROM "_efs_stage_seq" s
    WHERE ef."ID" = s."EntityFieldID";

    -- Pass B: write the full payload (including IsComputed) for changed rows.
    UPDATE ${flyway:defaultSchema}."EntityField" ef
    SET
        "Description" = CASE WHEN fr."AutoUpdateDescription" = true THEN fr."SQLDescription" ELSE ef."Description" END,
        "Type"          = fr."Type",
        "Length"        = fr."Length",
        "Precision"     = fr."Precision",
        "Scale"         = fr."Scale",
        "AllowsNull"    = fr."AllowsNull",
        "DefaultValue"  = fr."DefaultValue",
        "AutoIncrement" = fr."AutoIncrement",
        "IsVirtual"     = fr."IsVirtual",
        "IsComputed"    = fr."IsComputed",
        "RelatedEntityID" = CASE
            WHEN ef."AutoUpdateRelatedEntityInfo" = true AND ef."IsSoftForeignKey" = false
                THEN fr."RelatedEntityID"
            ELSE ef."RelatedEntityID"
        END,
        "RelatedEntityFieldName" = CASE
            WHEN ef."AutoUpdateRelatedEntityInfo" = true AND ef."IsSoftForeignKey" = false
                THEN fr."RelatedEntityFieldName"
            ELSE ef."RelatedEntityFieldName"
        END,
        "IsPrimaryKey"  = fr."IsPrimaryKey",
        "IsUnique"      = fr."IsUnique"
    FROM "_efs_filtered" fr
    WHERE ef."ID" = fr."EntityFieldID";

    -- Pass C: resequence every row of every affected entity.
    UPDATE ${flyway:defaultSchema}."EntityField" ef
    SET "Sequence" = fromSQL."Sequence"::INTEGER
    FROM ${flyway:defaultSchema}."vwSQLColumnsAndEntityFields" fromSQL
    WHERE ef."EntityID" = fromSQL."EntityID"
      AND ef."Name"     = fromSQL."FieldName"
      AND ef."EntityID" IN (SELECT DISTINCT f2."EntityID" FROM "_efs_filtered" f2);

    -- Pass D: handle rows in affected entities that are NOT in the SQL view.
    UPDATE ${flyway:defaultSchema}."EntityField" ef
    SET "Sequence" = leftover."NewSequence"::INTEGER
    FROM (
        SELECT
            stuck."ID" AS "EntityFieldID",
            COALESCE(maxseq."MaxSeq", 0)
                + ROW_NUMBER() OVER (PARTITION BY stuck."EntityID"
                                     ORDER BY stuck."Sequence" DESC, stuck."ID")
                AS "NewSequence"
        FROM ${flyway:defaultSchema}."EntityField" stuck
        LEFT JOIN (
            SELECT vw."EntityID", MAX(vw."Sequence") AS "MaxSeq"
            FROM ${flyway:defaultSchema}."vwSQLColumnsAndEntityFields" vw
            GROUP BY vw."EntityID"
        ) maxseq
            ON maxseq."EntityID" = stuck."EntityID"
        WHERE stuck."Sequence" < 0
          AND stuck."EntityID" IN (SELECT DISTINCT f3."EntityID" FROM "_efs_filtered" f3)
    ) leftover
    WHERE ef."ID" = leftover."EntityFieldID";

    RETURN QUERY
    SELECT
        f."EntityID", f."EntityName", f."EntityFieldID", f."EntityFieldName",
        f."AutoUpdateDescription", f."ExistingDescription", f."SQLDescription",
        f."Type", f."Length", f."Precision", f."Scale", f."AllowsNull",
        f."DefaultValue", f."AutoIncrement", f."IsVirtual", f."IsComputed",
        f."Sequence",
        f."RelatedEntityID", f."RelatedEntityFieldName",
        f."IsPrimaryKey", f."IsUnique"
    FROM "_efs_filtered" f;

    DROP TABLE "_efs_filtered";
    DROP TABLE "_efs_stage_seq";
END;
$func$;

DO $$ BEGIN GRANT EXECUTE ON FUNCTION ${flyway:defaultSchema}."spUpdateExistingEntityFieldsFromSchema"(text, text) TO "cdp_Developer"; EXCEPTION WHEN others THEN NULL; END $$;
DO $$ BEGIN GRANT EXECUTE ON FUNCTION ${flyway:defaultSchema}."spUpdateExistingEntityFieldsFromSchema"(text, text) TO "cdp_Integration"; EXCEPTION WHEN others THEN NULL; END $$;
