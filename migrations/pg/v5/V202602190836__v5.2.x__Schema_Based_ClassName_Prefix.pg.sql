-- ============================================================================
-- MemberJunction PostgreSQL Migration
-- Converted from SQL Server using TypeScript conversion pipeline
-- ============================================================================

-- Extensions
CREATE EXTENSION IF NOT EXISTS "pgcrypto";
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- Schema
CREATE SCHEMA IF NOT EXISTS __mj;
SET search_path TO __mj, public;

-- Ensure backslashes in string literals are treated literally (not as escape sequences)
SET standard_conforming_strings = on;

-- Implicit INTEGER -> BOOLEAN cast (SQL Server BIT columns accept 0/1 in INSERTs)
-- PostgreSQL has a built-in explicit-only INTEGER->bool cast. We upgrade it to implicit
-- so INSERT VALUES with 0/1 for BOOLEAN columns work like SQL Server BIT.
UPDATE pg_cast SET castcontext = 'i'
WHERE castsource = 'integer'::regtype AND casttarget = 'boolean'::regtype;


-- ===================== DDL: Tables, PKs, Indexes =====================

CREATE UNIQUE INDEX IF NOT EXISTS "UQ_SchemaInfo_EntityNamePrefixSuffix" ON "__mj"."SchemaInfo" (
        EntityNamePrefix,
        EntityNameSuffix
    ) WHERE E;


-- ===================== Helper Functions (fn*) =====================

CREATE OR REPLACE FUNCTION __mj."StripToAlphanumeric"(
    IN "p_InputString" TEXT
)
RETURNS TEXT AS $$
DECLARE
    p_Result TEXT := '';
    p_i INTEGER;
    p_c CHAR(1);
BEGIN
    IF "p_InputString" IS NULL THEN
        RETURN NULL;
    END IF;
    FOR p_i IN 1..LENGTH("p_InputString") LOOP
        p_c := SUBSTRING("p_InputString" FROM p_i FOR 1);
        IF p_c ~ '[A-Za-z0-9]' THEN
            p_Result := p_Result || p_c;
        END IF;
    END LOOP;
    RETURN p_Result;
END;
$$ LANGUAGE plpgsql;


-- ===================== Views =====================

DROP VIEW IF EXISTS __mj."vwEntities" CASCADE;
CREATE VIEW __mj."vwEntities"
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
    e."SchemaName" = si."SchemaName";


-- ===================== Stored Procedures (sp*) =====================


-- ===================== Triggers =====================


-- ===================== Data (INSERT/UPDATE/DELETE) =====================


-- ===================== FK & CHECK Constraints =====================


-- ===================== Grants =====================


-- ===================== Comments =====================

-- Extended property (could not parse)
-- -- Drop old description if it exists, then re-add
-- IF EXISTS (
--     SELECT 1 FROM sys.extended_properties ep
--     INNER JOIN sys.views v ON ep.major_id = v.object_id
--     INNER JOIN sys.schemas s ON v.schema_id = s.schema_id
--     INNER JOIN sys.columns c ON c.object_id = v.object_id AND ep.minor_id = c.column_id
--     WHERE s.name = '__mj' AND v.name = 'vwEntities' AND c.name = 'ClassName'
--       AND ep.name = 'MS_Description'
-- )
-- BEGIN
--     EXEC sp_dropextendedproperty
--         @name = N'MS_Description',
--         @level0type = N'SCHEMA', @level0name = N'__mj',
--         @level1type = N'VIEW',   @level1name = N'vwEntities',
--         @level2type = N'COLUMN', @level2name = N'ClassName';
-- END

COMMENT ON COLUMN __mj."vwEntities"."ClassName" IS 'Schema-based programmatic class name used for TypeScript entity classes, Zod schemas, and Angular form components. Computed as GetProgrammaticName(GetClassNameSchemaPrefix(SchemaName) + BaseTable + NameSuffix). The prefix is derived from SchemaName (guaranteed unique by SQL Server), not from EntityNamePrefix. For the core __mj schema, the prefix is "MJ"; for all other schemas it is the alphanumeric-sanitized schema name. This prevents cross-schema collisions and aligns with GraphQL type naming in getGraphQLTypeNameBase().';

-- Extended property (could not parse)
-- -- Update CodeName description too
-- IF EXISTS (
--     SELECT 1 FROM sys.extended_properties ep
--     INNER JOIN sys.views v ON ep.major_id = v.object_id
--     INNER JOIN sys.schemas s ON v.schema_id = s.schema_id
--     INNER JOIN sys.columns c ON c.object_id = v.object_id AND ep.minor_id = c.column_id
--     WHERE s.name = '__mj' AND v.name = 'vwEntities' AND c.name = 'CodeName'
--       AND ep.name = 'MS_Description'
-- )
-- BEGIN
--     EXEC sp_dropextendedproperty
--         @name = N'MS_Description',
--         @level0type = N'SCHEMA', @level0name = N'__mj',
--         @level1type = N'VIEW',   @level1name = N'vwEntities',
--         @level2type = N'COLUMN', @level2name = N'CodeName';
-- END

COMMENT ON COLUMN __mj."vwEntities"."CodeName" IS 'Schema-based programmatic code name derived from the entity Name. Uses GetClassNameSchemaPrefix(SchemaName) as the prefix, then strips EntityNamePrefix from the Name and removes spaces. For "__mj" schema with entity "MJ: AI Models", this produces "MJAIModels". For entities in other schemas, the sanitized schema name is prepended. Used in GraphQL type generation and internal code references.';


-- ===================== Other =====================

-- TODO: Review this batch
DROP VIEW IF EXISTS "__mj".vwEntities;

/* SQL text to recompile all views */
