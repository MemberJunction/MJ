-- ============================================================================
-- Synchronize __mj.EntityField.AllowsNull with information_schema.is_nullable
--
-- Background:
--   Audit on 2026-05-04 against MJ_PG_RUNTIME @ v5.33.x baseline showed 1,390
--   EntityField rows where AllowsNull = TRUE while the underlying column is
--   declared `NOT NULL` in the schema. The drift was introduced when the SQL
--   Server → PostgreSQL converter populated the EntityField metadata rows for
--   the PG baseline; the converted INSERTs carried over (or defaulted) the
--   nullability flag incorrectly.
--
--   Effect: CodeGen reads `EntityField.AllowsNull` (NOT `information_schema`)
--   when emitting `entity_subclasses.ts`. A nullable=TRUE flag becomes
--   `field: type | null`, and downstream packages that consume those types
--   (e.g. `@memberjunction/testing-engine-base`) fail to compile when they
--   subtract two `Sequence` values that the schema actually guarantees are
--   never null.
--
-- Fix:
--   Update AllowsNull in EntityField from the live information_schema.
--   Idempotent: re-running on already-aligned data is a no-op.
--
-- Scope:
--   Forward fix only. The B-baseline file remains unchanged per project
--   policy. The corresponding fix on the converter side (so freshly-regenerated
--   PG baselines produce correct AllowsNull) is tracked as a separate issue.
-- ============================================================================

UPDATE ${flyway:defaultSchema}."EntityField" ef
SET "AllowsNull" = (c.is_nullable = 'YES')
FROM information_schema.columns c
JOIN ${flyway:defaultSchema}."Entity" e
  ON e."BaseTable"  = c.table_name
 AND e."SchemaName" = c.table_schema
WHERE ef."EntityID" = e."ID"
  AND ef."Name"     = c.column_name
  AND ef."AllowsNull" <> (c.is_nullable = 'YES');

DO $$
DECLARE
    drift_count INTEGER;
BEGIN
    SELECT COUNT(*) INTO drift_count
    FROM ${flyway:defaultSchema}."EntityField" ef
    JOIN information_schema.columns c
      ON c.column_name = ef."Name"
    JOIN ${flyway:defaultSchema}."Entity" e
      ON e."ID" = ef."EntityID"
     AND e."BaseTable"  = c.table_name
     AND e."SchemaName" = c.table_schema
    WHERE ef."AllowsNull" <> (c.is_nullable = 'YES');

    IF drift_count > 0 THEN
        RAISE WARNING 'EntityField.AllowsNull sync left % rows still misaligned with information_schema', drift_count;
    END IF;
END $$;
