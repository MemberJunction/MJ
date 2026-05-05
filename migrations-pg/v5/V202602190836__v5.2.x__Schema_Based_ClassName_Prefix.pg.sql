
-- ===================== DDL: Tables, PKs, Indexes =====================

CREATE UNIQUE INDEX IF NOT EXISTS "UQ_SchemaInfo_EntityNamePrefixSuffix" ON "__mj"."SchemaInfo" (
        "EntityNamePrefix",
        "EntityNameSuffix"
    ) WHERE "EntityNamePrefix" IS NOT NULL;


-- ===================== Helper Functions (fn*) =====================

CREATE OR REPLACE FUNCTION __mj."GetClassNameSchemaPrefix"(
    IN "p_SchemaName" VARCHAR(255)
)
RETURNS VARCHAR(255) AS $$
DECLARE
    p_trimmed VARCHAR(255);
    p_cleaned VARCHAR(255);
BEGIN
    p_trimmed := TRIM("p_SchemaName");

    -- Core MJ schema: __mj -> 'MJ'
    IF LOWER(p_trimmed) = '__mj' THEN
        RETURN 'MJ';
    END IF;

    -- Guard: a schema literally named 'MJ' would collide with __mj's prefix
    IF LOWER(p_trimmed) = 'mj' THEN
        RETURN 'MJCustom';
    END IF;

    -- Default: strip to alphanumeric, guard against leading digit
    p_cleaned := __mj."StripToAlphanumeric"(p_trimmed);

    IF LENGTH(p_cleaned) = 0 OR p_cleaned IS NULL THEN
        RETURN '';
    END IF;

    IF LEFT(p_cleaned, 1) ~ '[0-9]' THEN
        RETURN '_' || p_cleaned;
    END IF;

    RETURN p_cleaned;
END;
$$ LANGUAGE plpgsql;


-- ===================== Views =====================

DO $do$
DECLARE
  v_target_schema CONSTANT TEXT := '__mj';
  v_target_name CONSTANT TEXT := 'vwEntities';
  vsql CONSTANT TEXT := $vsql$CREATE OR REPLACE VIEW __mj."vwEntities"
AS SELECT
    e.*,
    /* CodeName: Schema-prefixed programmatic name derived from entity Name.
       Uses GetClassNameSchemaPrefix(SchemaName) for the prefix, then "strips" the
       EntityNamePrefix from the Name (if present) and removes spaces.
       Example: schema '__mj', name 'MJ: AI Models' -> 'MJAIModels'
       Example: schema 'sales', name 'Invoice' -> 'salesInvoice' */
    __mj."GetProgrammaticName"(
        __mj."GetClassNameSchemaPrefix"(e."SchemaName") || REPLACE(
            CASE WHEN si."EntityNamePrefix" IS NOT NULL THEN REPLACE(e."Name", si."EntityNamePrefix", '') ELSE e."Name" END,
            ' ',
            ''
        )
    ) AS "CodeName",
    /* ClassName: Schema-prefixed programmatic class name for TypeScript entity classes,
       Zod schemas, and Angular form components. Uses GetClassNameSchemaPrefix(SchemaName)
       which is guaranteed unique (SQL Server enforces schema name uniqueness).
       Example: schema '__mj', table 'AIModel' -> 'MJAIModel' -> class MJAIModelEntity
       Example: schema 'sales', table 'Invoice' -> 'salesInvoice' -> class salesInvoiceEntity
       This prevents cross-schema collisions and aligns with GraphQL type naming. */
    __mj."GetProgrammaticName"(
        __mj."GetClassNameSchemaPrefix"(e."SchemaName") || e."BaseTable" || COALESCE(e."NameSuffix", '')
    ) AS "ClassName",
    __mj."GetProgrammaticName"(e."BaseTable" || COALESCE(e."NameSuffix", '')) AS "BaseTableCodeName",
    par."Name" "ParentEntity",
    par."BaseTable" "ParentBaseTable",
    par."BaseView" "ParentBaseView"
FROM
    __mj."Entity" e
LEFT OUTER JOIN
    __mj."Entity" par
ON
    e."ParentID" = par."ID"
LEFT OUTER JOIN
    __mj."SchemaInfo" si
ON
    e."SchemaName" = si."SchemaName"$vsql$;
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


-- ===================== Comments =====================

COMMENT ON COLUMN __mj."vwEntities"."ClassName" IS 'Schema-based programmatic class name used for TypeScript entity classes, Zod schemas, and Angular form components. Computed as GetProgrammaticName(GetClassNameSchemaPrefix(SchemaName) + BaseTable + NameSuffix). The prefix is derived from SchemaName (guaranteed unique by SQL Server), not from EntityNamePrefix. For the core __mj schema, the prefix is "MJ"; for all other schemas it is the alphanumeric-sanitized schema name. This prevents cross-schema collisions and aligns with GraphQL type naming in getGraphQLTypeNameBase().';

COMMENT ON COLUMN __mj."vwEntities"."CodeName" IS 'Schema-based programmatic code name derived from the entity Name. Uses GetClassNameSchemaPrefix(SchemaName) as the prefix, then strips EntityNamePrefix from the Name and removes spaces. For "__mj" schema with entity "MJ: AI Models", this produces "MJAIModels". For entities in other schemas, the sanitized schema name is prepended. Used in GraphQL type generation and internal code references.';


-- ===================== Other =====================

/* SQL text to recompile all views */
