/**
 * DDL for CodeGen's PostgreSQL metadata-management support objects.
 *
 * These objects (the vwSQLColumnsAndEntityFields introspection view, the
 * default-value helpers, and the five metadata-management routines that
 * manage-metadata invokes via callRoutineSQL) are CodeGen's OWN machinery —
 * only CodeGen calls them. Shipping them through migrations created a
 * sync-by-convention dependency that failed in practice: four of the five
 * routines never existed on PG and CodeGen silently degraded (stale
 * EntityField metadata — e.g. the vwApplicationSettings INNER JOIN bug that
 * hid NULL-ApplicationID rows).
 *
 * Instead, CodeGen ensures these objects itself at the start of every
 * manageMetadata run (DROP IF EXISTS + CREATE OR REPLACE — idempotent,
 * cheap). They can never be missing or version-skewed: they always match
 * the CodeGenLib version that calls them. SQL Server is unaffected (its
 * counterparts ship in the baseline migrations); see
 * CodeGenDatabaseProvider.getMetadataSupportObjectsSQL.
 *
 * The DDL is authored as plain PostgreSQL against the literal __mj schema
 * and parameterized at runtime; String.raw keeps regex backslashes intact.
 */
export function buildMetadataSupportObjectsSQL(mjCoreSchema: string): string {
    return METADATA_SUPPORT_OBJECTS_DDL.split('__mj').join(mjCoreSchema);
}
const METADATA_SUPPORT_OBJECTS_DDL: string = String.raw`
-- ----------------------------------------------------------------------------
-- 0. Drop the view first — it depends on fnMapPGDefaultToMJ, so on re-apply
--    the helper DROPs below would otherwise fail with a dependency error.
-- ----------------------------------------------------------------------------
DROP VIEW IF EXISTS __mj."vwSQLColumnsAndEntityFields";

-- ----------------------------------------------------------------------------
-- 1. Default-value helpers
-- ----------------------------------------------------------------------------

-- Normalizer used ONLY for change detection. Collapses formatting variance
-- (paren wrapping, N-prefix, ::casts, current-timestamp function family, uuid
-- generator family, numeric trailing zeros) so cosmetic differences never
-- trigger metadata updates. Both sides of every comparison pass through this,
-- so lossy transforms are safe.
DROP FUNCTION IF EXISTS __mj."fnNormalizeDefaultValue"(TEXT);
CREATE OR REPLACE FUNCTION __mj."fnNormalizeDefaultValue"(v TEXT)
RETURNS TEXT
LANGUAGE sql IMMUTABLE AS $$
SELECT CASE WHEN v IS NULL THEN NULL ELSE
  regexp_replace(                                            -- 1.0 / 0.000000 -> 1 / 0
    translate(                                               -- strip parens and quotes
      regexp_replace(                                        -- user-name family -> user
        regexp_replace(                                      -- timestamp family -> now
          regexp_replace(                                    -- uuid family -> newid
            regexp_replace(                                  -- N'x' -> 'x'
              regexp_replace(lower(trim(v)),                 -- strip ::casts
                '\s*::[a-z_ ]+(\([0-9, ]*\))?', '', 'g'),
              'n''', '''', 'g'),
            '(gen_random_uuid|uuid_generate_v4|newsequentialid|newid)\(\)', 'newid', 'g'),
          '(now\(\)\s+at\s+time\s+zone\s+''utc''|getutcdate\(\)|getdate\(\)|sysdatetimeoffset\(\)|sysutcdatetime\(\)|current_timestamp|now\(\))', 'now', 'g'),
        '(user_name\(\)|suser_name\(\)|suser_sname\(\)|current_user|session_user)', 'user', 'g'),
      '()''', ''),
    '^\s*(-?[0-9]+)\.0+\s*$', '\1')
END
$$;

-- Maps a pg_get_expr() default expression to MJ-canonical (SS-flavored) text
-- for storage/emission. Unmappable expressions pass through unchanged — the
-- normalizer above keeps them from churning metadata.
DROP FUNCTION IF EXISTS __mj."fnMapPGDefaultToMJ"(TEXT);
CREATE OR REPLACE FUNCTION __mj."fnMapPGDefaultToMJ"(v TEXT)
RETURNS TEXT
LANGUAGE sql IMMUTABLE AS $$
SELECT CASE
  WHEN v IS NULL THEN NULL
  WHEN v ~* 'now\(\)\s+at\s+time\s+zone\s+''utc''' THEN '(getutcdate())'
  WHEN lower(trim(v)) IN ('now()', 'current_timestamp', 'transaction_timestamp()', 'statement_timestamp()') THEN '(sysdatetimeoffset())'
  WHEN lower(trim(v)) IN ('gen_random_uuid()', 'uuid_generate_v4()') THEN '(newsequentialid())'
  WHEN lower(trim(v)) = 'true'  THEN '((1))'
  WHEN lower(trim(v)) = 'false' THEN '((0))'
  WHEN trim(v) ~ '^-?[0-9]+(\.[0-9]+)?$' THEN '((' || trim(v) || '))'
  WHEN trim(v) ~* '^''[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}''::uuid$'
    THEN '(''' || upper(substring(trim(v) from '^''(.*)''::')) || ''')'
  WHEN trim(v) ~ '^''.*''::[a-z_ ]+(\([0-9, ]*\))?$'
    THEN '(N''' || substring(trim(v) from '^''(.*)''::') || ''')'
  ELSE v
END
$$;

-- ----------------------------------------------------------------------------
-- 2. Replace vwSQLColumnsAndEntityFields (column set changes: +IsComputed,
--    Type becomes text) — no dependent views exist on this view.
--    (dropped in section 0)
-- ----------------------------------------------------------------------------
CREATE VIEW __mj."vwSQLColumnsAndEntityFields" AS
SELECT
  e."EntityID",
  e."EntityName" AS "Entity",
  e."SchemaName",
  e."TableName",
  ef."ID" AS "EntityFieldID",
  ef."Sequence" AS "EntityFieldSequence",
  ef."Name" AS "EntityFieldName",
  a.attnum AS "Sequence",
  bt_a.attnum AS "BaseTableSequence",
  a.attname AS "FieldName",
  -- MJ-canonical type vocabulary (matches EntityField.Type, which is shared
  -- with SQL Server installs). Unknown PG types pass through.
  CASE COALESCE(base_t.typname, t.typname)
    WHEN 'varchar'     THEN 'nvarchar'
    WHEN 'text'        THEN 'nvarchar'
    WHEN 'bpchar'      THEN 'nchar'
    WHEN 'char'        THEN 'nchar'
    WHEN 'uuid'        THEN 'uniqueidentifier'
    WHEN 'bool'        THEN 'bit'
    WHEN 'timestamptz' THEN 'datetimeoffset'
    WHEN 'timestamp'   THEN 'datetime'
    WHEN 'int4'        THEN 'int'
    WHEN 'int2'        THEN 'smallint'
    WHEN 'int8'        THEN 'bigint'
    WHEN 'numeric'     THEN 'decimal'
    WHEN 'float8'      THEN 'float'
    WHEN 'float4'      THEN 'real'
    WHEN 'bytea'       THEN 'varbinary'
    WHEN 'jsonb'       THEN 'nvarchar'
    WHEN 'json'        THEN 'nvarchar'
    ELSE COALESCE(base_t.typname, t.typname)::text
  END AS "Type",
  CASE WHEN t.typtype = 'd' THEN t.typname::text ELSE NULL END AS "UserDefinedType",
  -- SS sys.columns max_length semantics: bytes (2x chars for n(var)char),
  -- -1 for MAX/unbounded, decimal storage bytes by precision band.
  CASE
    WHEN COALESCE(base_t.typname, t.typname) IN ('varchar', 'bpchar', 'char') THEN
      CASE WHEN a.atttypmod = -1 THEN -1 ELSE (a.atttypmod - 4) * 2 END
    WHEN COALESCE(base_t.typname, t.typname) IN ('text', 'bytea', 'jsonb', 'json') THEN -1
    WHEN COALESCE(base_t.typname, t.typname) = 'uuid'        THEN 16
    WHEN COALESCE(base_t.typname, t.typname) = 'bool'        THEN 1
    WHEN COALESCE(base_t.typname, t.typname) = 'timestamptz' THEN 10
    WHEN COALESCE(base_t.typname, t.typname) = 'timestamp'   THEN 8
    WHEN COALESCE(base_t.typname, t.typname) = 'numeric' THEN
      CASE
        WHEN a.atttypmod = -1 THEN 17
        WHEN (((a.atttypmod - 4) >> 16) & 65535) <= 9  THEN 5
        WHEN (((a.atttypmod - 4) >> 16) & 65535) <= 19 THEN 9
        WHEN (((a.atttypmod - 4) >> 16) & 65535) <= 28 THEN 13
        ELSE 17
      END
    ELSE a.attlen::integer
  END AS "Length",
  CASE
    WHEN COALESCE(base_t.typname, t.typname) = 'numeric' AND a.atttypmod <> -1 THEN ((a.atttypmod - 4) >> 16) & 65535
    WHEN COALESCE(base_t.typname, t.typname) = 'numeric'     THEN 38
    WHEN COALESCE(base_t.typname, t.typname) = 'int4'        THEN 10
    WHEN COALESCE(base_t.typname, t.typname) = 'int2'        THEN 5
    WHEN COALESCE(base_t.typname, t.typname) = 'int8'        THEN 19
    WHEN COALESCE(base_t.typname, t.typname) = 'timestamptz' THEN 34
    WHEN COALESCE(base_t.typname, t.typname) = 'timestamp'   THEN 23
    WHEN COALESCE(base_t.typname, t.typname) = 'bool'        THEN 1
    WHEN COALESCE(base_t.typname, t.typname) = 'float8'      THEN 53
    WHEN COALESCE(base_t.typname, t.typname) = 'float4'      THEN 24
    ELSE 0
  END AS "Precision",
  CASE
    WHEN COALESCE(base_t.typname, t.typname) = 'numeric' AND a.atttypmod <> -1 THEN (a.atttypmod - 4) & 65535
    WHEN COALESCE(base_t.typname, t.typname) = 'timestamptz' THEN 7
    WHEN COALESCE(base_t.typname, t.typname) = 'timestamp'   THEN 3
    ELSE 0
  END AS "Scale",
  -- Nullability must come from the BASE TABLE attribute when one exists: PG
  -- view columns never carry NOT NULL, which is exactly the bug the previous
  -- definition had. Virtual (view-only) fields fall back to the view attr.
  CASE WHEN bt_a.attnum IS NOT NULL THEN NOT bt_a.attnotnull ELSE NOT a.attnotnull END AS "AllowsNull",
  CASE WHEN COALESCE(bt_a.attidentity, '') IN ('a', 'd') THEN 1 ELSE 0 END AS "AutoIncrement",
  a.attnum AS column_id,
  CASE WHEN bt_a.attnum IS NULL THEN 1 ELSE 0 END AS "IsVirtual",
  CASE WHEN COALESCE(bt_a.attgenerated, '') <> '' THEN 1 ELSE 0 END AS "IsComputed",
  src_cls.oid AS object_id,
  NULL::text AS "DefaultConstraintName",
  __mj."fnMapPGDefaultToMJ"(pg_get_expr(ad.adbin, ad.adrelid)) AS "DefaultValue",
  CASE WHEN COALESCE(bt_a.attgenerated, '') <> '' THEN pg_get_expr(ad.adbin, ad.adrelid) ELSE NULL END AS "ComputedColumnDefinition",
  COALESCE(col_description(src_cls.oid, a.attnum::integer), col_description(bt_cls.oid, bt_a.attnum::integer)) AS "Description",
  col_description(src_cls.oid, a.attnum::integer) AS "ViewColumnDescription",
  CASE WHEN bt_a.attnum IS NOT NULL THEN col_description(bt_cls.oid, bt_a.attnum::integer) ELSE NULL END AS "TableColumnDescription"
FROM __mj."vwSQLTablesAndEntities" e
  JOIN pg_class src_cls ON src_cls.oid = COALESCE(e.view_object_id, e.object_id)
  JOIN pg_attribute a ON a.attrelid = src_cls.oid AND a.attnum > 0 AND NOT a.attisdropped
  JOIN pg_type t ON a.atttypid = t.oid
  LEFT JOIN pg_type base_t ON t.typbasetype = base_t.oid AND t.typtype = 'd'
  JOIN pg_class bt_cls ON bt_cls.oid = e.object_id
  LEFT JOIN pg_attribute bt_a ON bt_a.attrelid = bt_cls.oid AND bt_a.attname = a.attname AND bt_a.attnum > 0 AND NOT bt_a.attisdropped
  LEFT JOIN pg_attrdef ad ON ad.adrelid = bt_cls.oid AND ad.adnum = bt_a.attnum
  LEFT JOIN __mj."EntityField" ef ON e."EntityID" = ef."EntityID" AND a.attname = ef."Name"::text;

-- ----------------------------------------------------------------------------
-- 3. spUpdateExistingEntityFieldsFromSchema
--    (port of the SQL Server proc of the same name; consumed by CodeGen's
--    manage-metadata step 3 which reads "EntityName" from the result rows)
-- ----------------------------------------------------------------------------
DROP FUNCTION IF EXISTS __mj."spUpdateExistingEntityFieldsFromSchema"(TEXT);
DROP FUNCTION IF EXISTS __mj."spUpdateExistingEntityFieldsFromSchema"(TEXT, TEXT);
CREATE OR REPLACE FUNCTION __mj."spUpdateExistingEntityFieldsFromSchema"(
  p_ExcludedSchemaNames TEXT,
  p_EntityIDs TEXT DEFAULT NULL
)
RETURNS TABLE(
  "EntityID" UUID,
  "EntityName" TEXT,
  "EntityFieldID" UUID,
  "EntityFieldName" TEXT,
  "AutoUpdateDescription" BOOLEAN,
  "ExistingDescription" TEXT,
  "SQLDescription" TEXT,
  "Type" TEXT,
  "Length" INTEGER,
  "Precision" INTEGER,
  "Scale" INTEGER,
  "AllowsNull" BOOLEAN,
  "DefaultValue" TEXT,
  "AutoIncrement" BOOLEAN,
  "IsVirtual" BOOLEAN,
  "IsComputed" BOOLEAN,
  "Sequence" INTEGER,
  "RelatedEntityID" UUID,
  "RelatedEntityFieldName" TEXT,
  "IsPrimaryKey" BOOLEAN,
  "IsUnique" BOOLEAN
)
LANGUAGE plpgsql AS $func$
DECLARE
  v_is_scoped BOOLEAN := FALSE;
BEGIN
  DROP TABLE IF EXISTS _uef_excluded;
  CREATE TEMP TABLE _uef_excluded AS
    SELECT TRIM(s) AS schema_name
    FROM unnest(string_to_array(COALESCE(p_ExcludedSchemaNames, ''), ',')) AS s
    WHERE TRIM(s) <> '';

  DROP TABLE IF EXISTS _uef_scope;
  CREATE TEMP TABLE _uef_scope AS
    SELECT DISTINCT TRIM(v)::uuid AS entity_id
    FROM unnest(string_to_array(COALESCE(p_EntityIDs, ''), ',')) AS v
    WHERE TRIM(v) ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$';
  v_is_scoped := EXISTS (SELECT 1 FROM _uef_scope);

  DROP TABLE IF EXISTS _uef_filtered;
  CREATE TEMP TABLE _uef_filtered AS
  SELECT
    e."ID"   AS entity_id,
    e."Name" AS entity_name,
    ef."ID"  AS entity_field_id,
    ef."Name" AS entity_field_name,
    ef."AutoUpdateDescription" AS auto_update_description,
    ef."Description" AS existing_description,
    sq."Description" AS sql_description,
    -- numeric/decimal are SS synonyms — keep whichever the metadata already has
    CASE WHEN ef."Type" = 'numeric' AND sq."Type" = 'decimal' THEN ef."Type" ELSE sq."Type" END AS new_type,
    sq."Length"    AS new_length,
    sq."Precision" AS new_precision,
    sq."Scale"     AS new_scale,
    sq."AllowsNull" AS new_allows_null,
    -- only rewrite a stored default when it differs SEMANTICALLY
    CASE WHEN __mj."fnNormalizeDefaultValue"(ef."DefaultValue") IS NOT DISTINCT FROM __mj."fnNormalizeDefaultValue"(sq."DefaultValue")
         THEN ef."DefaultValue" ELSE sq."DefaultValue" END AS new_default_value,
    (sq."AutoIncrement" <> 0) AS new_auto_increment,
    (sq."IsVirtual" <> 0)     AS new_is_virtual,
    (sq."IsComputed" <> 0)    AS new_is_computed,
    sq."Sequence" AS new_sequence,
    re."ID" AS related_entity_id,
    fk."referenced_column"::text AS related_entity_field_name,
    (pk."ColumnName" IS NOT NULL) AS new_is_primary_key,
    (pk."ColumnName" IS NOT NULL OR uk."ColumnName" IS NOT NULL) AS new_is_unique
  FROM __mj."EntityField" ef
  INNER JOIN __mj."vwSQLColumnsAndEntityFields" sq
    ON ef."EntityID" = sq."EntityID" AND ef."Name"::text = sq."FieldName"::text
  INNER JOIN __mj."Entity" e ON ef."EntityID" = e."ID"
  LEFT JOIN __mj."vwForeignKeys" fk
    ON ef."Name"::text = fk."column"::text AND e."BaseTable"::text = fk."table"::text AND e."SchemaName"::text = fk."schema_name"::text
  LEFT JOIN __mj."Entity" re
    ON re."BaseTable"::text = fk."referenced_table"::text AND re."SchemaName"::text = fk."referenced_schema"::text
  LEFT JOIN __mj."vwTablePrimaryKeys" pk
    ON e."BaseTable"::text = pk."TableName"::text AND ef."Name"::text = pk."ColumnName"::text AND e."SchemaName"::text = pk."SchemaName"::text
  LEFT JOIN __mj."vwTableUniqueKeys" uk
    ON e."BaseTable"::text = uk."TableName"::text AND ef."Name"::text = uk."ColumnName"::text AND e."SchemaName"::text = uk."SchemaName"::text
  LEFT JOIN _uef_excluded ex ON e."SchemaName"::text = ex.schema_name
  WHERE e."VirtualEntity" = FALSE
    AND ex.schema_name IS NULL
    AND (NOT v_is_scoped OR e."ID" IN (SELECT s.entity_id FROM _uef_scope s))
    AND (
      COALESCE(TRIM(ef."Description"), '') <>
        COALESCE(TRIM(CASE WHEN ef."AutoUpdateDescription" THEN sq."Description" ELSE ef."Description" END), '')
      -- Physical attributes are only compared for REAL columns. PG cannot
      -- derive type facts for view-only (virtual) columns the way SQL Server
      -- can (view columns are unbounded/nullable in pg_attribute), so virtual
      -- fields keep their metadata values; the CodeGen TS pipeline's
      -- getFixVirtualFieldNullabilitySQL step owns virtual-field nullability.
      OR (sq."IsVirtual" = 0 AND (
           (ef."Type" <> sq."Type" AND NOT (ef."Type" = 'numeric' AND sq."Type" = 'decimal'))
        OR ef."Length" <> sq."Length"
        OR ef."Precision" <> sq."Precision"
        OR ef."Scale" <> sq."Scale"
        OR ef."AllowsNull" <> sq."AllowsNull"
      ))
      OR __mj."fnNormalizeDefaultValue"(ef."DefaultValue") IS DISTINCT FROM __mj."fnNormalizeDefaultValue"(sq."DefaultValue")
      OR ef."AutoIncrement" <> (sq."AutoIncrement" <> 0)
      OR ef."IsVirtual" <> (sq."IsVirtual" <> 0)
      OR ef."IsComputed" <> (sq."IsComputed" <> 0)
      OR ef."Sequence" <> sq."Sequence"
      OR COALESCE(ef."RelatedEntityID", '00000000-0000-0000-0000-000000000000'::uuid) <>
         COALESCE(re."ID", '00000000-0000-0000-0000-000000000000'::uuid)
      OR COALESCE(TRIM(ef."RelatedEntityFieldName"), '') <> COALESCE(TRIM(fk."referenced_column"::text), '')
      OR ef."IsPrimaryKey" <> (pk."ColumnName" IS NOT NULL)
      OR ef."IsUnique" <> (pk."ColumnName" IS NOT NULL OR uk."ColumnName" IS NOT NULL)
      -- AllowUpdateAPI needs clearing on a real->virtual transition
      OR (ef."AllowUpdateAPI" = TRUE AND sq."IsVirtual" <> 0 AND ef."IsVirtual" = FALSE)
    );

  -- PG checks UNIQUE row-by-row (SQL Server checks at statement end), so an
  -- in-place renumber can transiently collide on UQ_EntityField_EntityID_Sequence.
  -- Park changing sequences in a collision-free zone first; the real values are
  -- assigned by the main UPDATE below.
  UPDATE __mj."EntityField" tgt SET
    "Sequence" = tgt."Sequence" + 1000000
  FROM _uef_filtered fr
  WHERE tgt."ID" = fr.entity_field_id
    AND tgt."Sequence" IS DISTINCT FROM fr.new_sequence;

  UPDATE __mj."EntityField" tgt SET
    "Description"   = CASE WHEN fr.auto_update_description THEN fr.sql_description ELSE tgt."Description" END,
    -- physical attributes frozen for virtual fields (see WHERE clause comment)
    "Type"          = CASE WHEN fr.new_is_virtual THEN tgt."Type"       ELSE fr.new_type       END,
    "Length"        = CASE WHEN fr.new_is_virtual THEN tgt."Length"     ELSE fr.new_length     END,
    "Precision"     = CASE WHEN fr.new_is_virtual THEN tgt."Precision"  ELSE fr.new_precision  END,
    "Scale"         = CASE WHEN fr.new_is_virtual THEN tgt."Scale"      ELSE fr.new_scale      END,
    "AllowsNull"    = CASE WHEN fr.new_is_virtual THEN tgt."AllowsNull" ELSE fr.new_allows_null END,
    "DefaultValue"  = fr.new_default_value,
    "AutoIncrement" = fr.new_auto_increment,
    "IsVirtual"     = fr.new_is_virtual,
    "IsComputed"    = fr.new_is_computed,
    "Sequence"      = fr.new_sequence,
    "RelatedEntityID"        = CASE WHEN tgt."AutoUpdateRelatedEntityInfo" THEN fr.related_entity_id ELSE tgt."RelatedEntityID" END,
    "RelatedEntityFieldName" = CASE WHEN tgt."AutoUpdateRelatedEntityInfo" THEN fr.related_entity_field_name ELSE tgt."RelatedEntityFieldName" END,
    "IsPrimaryKey"  = fr.new_is_primary_key,
    "IsUnique"      = fr.new_is_unique,
    -- when a field transitions to virtual it can no longer be written to
    "AllowUpdateAPI" = CASE WHEN fr.new_is_virtual AND NOT tgt."IsVirtual" THEN FALSE ELSE tgt."AllowUpdateAPI" END,
    "__mj_UpdatedAt" = now()
  FROM _uef_filtered fr
  WHERE tgt."ID" = fr.entity_field_id;

  RETURN QUERY
  SELECT
    fr.entity_id, fr.entity_name::text, fr.entity_field_id, fr.entity_field_name::text,
    fr.auto_update_description, fr.existing_description::text, fr.sql_description::text,
    fr.new_type::text, fr.new_length::integer, fr.new_precision::integer, fr.new_scale::integer,
    fr.new_allows_null, fr.new_default_value::text, fr.new_auto_increment,
    fr.new_is_virtual, fr.new_is_computed, fr.new_sequence::integer,
    fr.related_entity_id, fr.related_entity_field_name::text,
    fr.new_is_primary_key, fr.new_is_unique
  FROM _uef_filtered fr;

  DROP TABLE IF EXISTS _uef_filtered;
  DROP TABLE IF EXISTS _uef_scope;
  DROP TABLE IF EXISTS _uef_excluded;
END;
$func$;

-- ----------------------------------------------------------------------------
-- 4. spUpdateExistingEntitiesFromSchema
--    (consumer reads "Name" from result rows)
-- ----------------------------------------------------------------------------
DROP FUNCTION IF EXISTS __mj."spUpdateExistingEntitiesFromSchema"(TEXT);
CREATE OR REPLACE FUNCTION __mj."spUpdateExistingEntitiesFromSchema"(p_ExcludedSchemaNames TEXT)
RETURNS TABLE(
  "ID" UUID,
  "Name" TEXT,
  "CurrentDescription" TEXT,
  "NewDescription" TEXT,
  "EntityDescription" TEXT,
  "SchemaName" TEXT
)
LANGUAGE plpgsql AS $func$
BEGIN
  DROP TABLE IF EXISTS _ues_filtered;
  CREATE TEMP TABLE _ues_filtered AS
  SELECT
    e."ID" AS entity_id,
    e."Name" AS entity_name,
    e."Description" AS current_description,
    CASE WHEN e."AutoUpdateDescription" THEN sq."EntityDescription" ELSE e."Description" END AS new_description,
    sq."EntityDescription" AS entity_description,
    sq."SchemaName"::text AS schema_name
  FROM __mj."Entity" e
  INNER JOIN __mj."vwSQLTablesAndEntities" sq ON e."ID" = sq."EntityID"
  LEFT JOIN unnest(string_to_array(COALESCE(p_ExcludedSchemaNames, ''), ',')) AS ex(v)
    ON sq."SchemaName"::text = TRIM(ex.v)
  WHERE e."VirtualEntity" = FALSE
    AND ex.v IS NULL
    AND COALESCE(CASE WHEN e."AutoUpdateDescription" THEN sq."EntityDescription" ELSE e."Description" END, '')
        <> COALESCE(e."Description", '');

  UPDATE __mj."Entity" tgt SET
    "Description" = fr.new_description,
    "__mj_UpdatedAt" = now()
  FROM _ues_filtered fr
  WHERE tgt."ID" = fr.entity_id;

  RETURN QUERY
  SELECT fr.entity_id, fr.entity_name::text, fr.current_description::text,
         fr.new_description::text, fr.entity_description::text, fr.schema_name
  FROM _ues_filtered fr;

  DROP TABLE IF EXISTS _ues_filtered;
END;
$func$;

-- ----------------------------------------------------------------------------
-- 5. spDeleteUnneededEntityFields
--    Removes EntityField rows whose underlying column no longer exists.
--    (consumer reads "Entity" — the entity name — from result rows; the SS
--    version returns the full vwEntityFields row, but only "Entity" is used)
-- ----------------------------------------------------------------------------
DROP FUNCTION IF EXISTS __mj."spDeleteUnneededEntityFields"(TEXT);
DROP FUNCTION IF EXISTS __mj."spDeleteUnneededEntityFields"(TEXT, TEXT);
CREATE OR REPLACE FUNCTION __mj."spDeleteUnneededEntityFields"(
  p_ExcludedSchemaNames TEXT,
  p_EntityIDs TEXT DEFAULT NULL
)
RETURNS TABLE(
  "ID" UUID,
  "EntityID" UUID,
  "Entity" TEXT,
  "Name" TEXT
)
LANGUAGE plpgsql AS $func$
DECLARE
  v_is_scoped BOOLEAN := FALSE;
BEGIN
  DROP TABLE IF EXISTS _del_scope;
  CREATE TEMP TABLE _del_scope AS
    SELECT DISTINCT TRIM(v)::uuid AS entity_id
    FROM unnest(string_to_array(COALESCE(p_EntityIDs, ''), ',')) AS v
    WHERE TRIM(v) ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$';
  v_is_scoped := EXISTS (SELECT 1 FROM _del_scope);

  -- metadata-side fields for in-scope, non-virtual entities
  DROP TABLE IF EXISTS _del_ef;
  CREATE TEMP TABLE _del_ef AS
  SELECT ef."ID" AS field_id, ef."EntityID" AS entity_id, ef."Entity"::text AS entity_name, ef."Name"::text AS field_name
  FROM __mj."vwEntityFields" ef
  INNER JOIN __mj."vwEntities" e ON ef."EntityID" = e."ID"
  LEFT JOIN unnest(string_to_array(COALESCE(p_ExcludedSchemaNames, ''), ',')) AS ex(v)
    ON e."SchemaName"::text = TRIM(ex.v)
  WHERE e."VirtualEntity" = FALSE
    -- Exclude external-data-source entities (remote; no physical table/view). NOTE: this is the FIELD-level
    -- prune. The ENTITY-level prune (vwEntitiesWithMissingBaseTables + the ExternalDataSourceID guard in
    -- manage-metadata) stays inert on PG until the PG EDS migration adds Entity."ExternalDataSourceID" AND
    -- recreates vwEntitiesWithMissingBaseTables as SELECT e.* (mirroring SQL Server migration 1726).
    AND e."ExternalDataSourceID" IS NULL
    AND ex.v IS NULL
    AND (NOT v_is_scoped OR ef."EntityID" IN (SELECT s.entity_id FROM _del_scope s));

  -- actual columns present in the database
  DROP TABLE IF EXISTS _del_actual;
  CREATE TEMP TABLE _del_actual AS
  SELECT sq."EntityID" AS entity_id, sq."FieldName"::text AS field_name
  FROM __mj."vwSQLColumnsAndEntityFields" sq
  WHERE (NOT v_is_scoped OR sq."EntityID" IN (SELECT s.entity_id FROM _del_scope s));

  -- orphans: metadata field with no matching DB column
  DROP TABLE IF EXISTS _del_deleted;
  CREATE TEMP TABLE _del_deleted AS
  SELECT ef.field_id, ef.entity_id, ef.entity_name, ef.field_name
  FROM _del_ef ef
  LEFT JOIN _del_actual actual
    ON ef.entity_id = actual.entity_id AND ef.field_name = actual.field_name
  WHERE actual.field_name IS NULL;

  UPDATE __mj."Entity" ent SET "__mj_UpdatedAt" = now()
  WHERE ent."ID" IN (SELECT DISTINCT d.entity_id FROM _del_deleted d);

  DELETE FROM __mj."EntityFieldValue" efv
  WHERE efv."EntityFieldID" IN (SELECT d.field_id FROM _del_deleted d);

  DELETE FROM __mj."EntityField" delf
  WHERE delf."ID" IN (SELECT d.field_id FROM _del_deleted d);

  RETURN QUERY
  SELECT d.field_id, d.entity_id, d.entity_name, d.field_name FROM _del_deleted d;

  DROP TABLE IF EXISTS _del_deleted;
  DROP TABLE IF EXISTS _del_actual;
  DROP TABLE IF EXISTS _del_ef;
  DROP TABLE IF EXISTS _del_scope;
END;
$func$;

-- ----------------------------------------------------------------------------
-- 6. spSetDefaultColumnWidthWhereNeeded
-- ----------------------------------------------------------------------------
DROP FUNCTION IF EXISTS __mj."spSetDefaultColumnWidthWhereNeeded"(TEXT);
CREATE OR REPLACE FUNCTION __mj."spSetDefaultColumnWidthWhereNeeded"(p_ExcludedSchemaNames TEXT)
RETURNS void
LANGUAGE plpgsql AS $func$
BEGIN
  UPDATE __mj."EntityField" ef SET
    "DefaultColumnWidth" =
      CASE ef."Type"
        WHEN 'int'            THEN 50
        WHEN 'datetimeoffset' THEN 100
        WHEN 'money'          THEN 100
        WHEN 'nchar'          THEN 75
        ELSE 150
      END,
    "__mj_UpdatedAt" = now()
  FROM __mj."Entity" e
  LEFT JOIN unnest(string_to_array(COALESCE(p_ExcludedSchemaNames, ''), ',')) AS ex(v)
    ON e."SchemaName"::text = TRIM(ex.v)
  WHERE ef."EntityID" = e."ID"
    AND ef."DefaultColumnWidth" IS NULL
    AND ex.v IS NULL;
END;
$func$;

-- ----------------------------------------------------------------------------
-- 7. spUpdateSchemaInfoFromDatabase
--    (consumer caches the returned SchemaInfo rows)
-- ----------------------------------------------------------------------------
DROP FUNCTION IF EXISTS __mj."spUpdateSchemaInfoFromDatabase"(TEXT);
CREATE OR REPLACE FUNCTION __mj."spUpdateSchemaInfoFromDatabase"(p_ExcludedSchemaNames TEXT DEFAULT NULL)
RETURNS SETOF __mj."SchemaInfo"
LANGUAGE plpgsql AS $func$
BEGIN
  DROP TABLE IF EXISTS _usi_excluded;
  CREATE TEMP TABLE _usi_excluded AS
    SELECT TRIM(s) AS schema_name
    FROM unnest(string_to_array(COALESCE(p_ExcludedSchemaNames, ''), ',')) AS s
    WHERE TRIM(s) <> '';

  UPDATE __mj."SchemaInfo" si SET
    "Description" = ss."SchemaDescription",
    "__mj_UpdatedAt" = now()
  FROM __mj."vwSQLSchemas" ss
  WHERE si."SchemaName" = ss."SchemaName"
    AND (si."Description" IS NULL OR si."Description" <> COALESCE(ss."SchemaDescription", ''))
    AND ss."SchemaName" NOT IN (SELECT x.schema_name FROM _usi_excluded x);

  INSERT INTO __mj."SchemaInfo" ("SchemaName", "EntityIDMin", "EntityIDMax", "Comments", "Description")
  SELECT
    ss."SchemaName",
    1,
    999999999,
    'Auto-created by CodeGen. Please update EntityIDMin and EntityIDMax to appropriate values for this schema.',
    ss."SchemaDescription"
  FROM __mj."vwSQLSchemas" ss
  LEFT JOIN __mj."SchemaInfo" si ON ss."SchemaName" = si."SchemaName"
  WHERE si."ID" IS NULL
    AND ss."SchemaName" NOT IN (SELECT x.schema_name FROM _usi_excluded x);

  RETURN QUERY
  SELECT si.*
  FROM __mj."SchemaInfo" si
  INNER JOIN __mj."vwSQLSchemas" ss ON si."SchemaName" = ss."SchemaName"
  WHERE ss."SchemaName" NOT IN (SELECT x.schema_name FROM _usi_excluded x);

  DROP TABLE IF EXISTS _usi_excluded;
END;
$func$;

-- ----------------------------------------------------------------------------
-- 8. Fix spUpdateEntityFieldRelatedEntityNameFieldMap
--    The previous PG port had a one-parameter signature and a body that
--    referenced an undefined p_EntityFieldID — it could never match CodeGen's
--    two-argument call nor run. Drop it and create the faithful port.
-- ----------------------------------------------------------------------------
DROP FUNCTION IF EXISTS __mj."spUpdateEntityFieldRelatedEntityNameFieldMap"(CHARACTER VARYING);
DROP FUNCTION IF EXISTS __mj."spUpdateEntityFieldRelatedEntityNameFieldMap"(UUID, CHARACTER VARYING);
CREATE OR REPLACE FUNCTION __mj."spUpdateEntityFieldRelatedEntityNameFieldMap"(
  p_EntityFieldID UUID,
  p_RelatedEntityNameFieldMap VARCHAR
)
RETURNS void
LANGUAGE plpgsql AS $func$
BEGIN
  UPDATE __mj."EntityField"
  SET "RelatedEntityNameFieldMap" = p_RelatedEntityNameFieldMap
  WHERE "ID" = p_EntityFieldID;
END;
$func$;

-- ----------------------------------------------------------------------------
-- spGetPrimaryKeyForTable — PG port of the SQL Server proc used by
-- ManageMetadataBase.shouldCreateNewEntity to confirm a new table has a PK
-- before creating an Entity for it. Self-ensured here (rather than relying on
-- a migration having run) so a fresh PG database always has it available;
-- without it, every new entity fails validation with
-- "function __mj.spGetPrimaryKeyForTable(unknown, unknown) does not exist".
-- ----------------------------------------------------------------------------
DROP FUNCTION IF EXISTS __mj."spGetPrimaryKeyForTable"(VARCHAR, VARCHAR);
CREATE OR REPLACE FUNCTION __mj."spGetPrimaryKeyForTable"(
    p_TableName  VARCHAR(255),
    p_SchemaName VARCHAR(255)
)
RETURNS TABLE(
    "SchemaName"  VARCHAR,
    "TableName"   VARCHAR,
    "ColumnName"  VARCHAR,
    "DataType"    VARCHAR,
    "max_length"  INTEGER,
    "precision"   INTEGER,
    "scale"       INTEGER,
    "is_nullable" BOOLEAN
) AS
$spgetpk$
BEGIN
    RETURN QUERY
    SELECT
        n.nspname::VARCHAR                         AS "SchemaName",
        c.relname::VARCHAR                         AS "TableName",
        a.attname::VARCHAR                         AS "ColumnName",
        COALESCE(base_t.typname, t.typname)::VARCHAR
                                                   AS "DataType",
        CASE
            WHEN t.typname IN ('varchar', 'bpchar', 'char')
                THEN CASE WHEN a.atttypmod = -1 THEN -1 ELSE a.atttypmod - 4 END
            WHEN t.typname = 'text' THEN -1
            ELSE a.attlen::integer
        END                                        AS "max_length",
        CASE
            WHEN t.typname = 'numeric' AND a.atttypmod <> -1
                THEN ((a.atttypmod - 4) >> 16) & 65535
            ELSE 0
        END                                        AS "precision",
        CASE
            WHEN t.typname = 'numeric' AND a.atttypmod <> -1
                THEN (a.atttypmod - 4) & 65535
            ELSE 0
        END                                        AS "scale",
        (NOT a.attnotnull)                         AS "is_nullable"
    FROM
        pg_catalog.pg_index     i
    INNER JOIN pg_catalog.pg_class     c  ON c.oid = i.indrelid
    INNER JOIN pg_catalog.pg_namespace n  ON n.oid = c.relnamespace
    CROSS JOIN LATERAL unnest(i.indkey) AS cols(col_num)
    INNER JOIN pg_catalog.pg_attribute a
        ON a.attrelid = c.oid AND a.attnum = cols.col_num
    INNER JOIN pg_catalog.pg_type      t  ON t.oid = a.atttypid
    LEFT  JOIN pg_catalog.pg_type      base_t
        ON base_t.oid = t.typbasetype AND t.typtype = 'd'
    WHERE
        i.indisprimary = true
        AND c.relname = p_TableName
        AND n.nspname = p_SchemaName
        AND a.attnum > 0
        AND NOT a.attisdropped;
END;
$spgetpk$ LANGUAGE plpgsql;
`;
