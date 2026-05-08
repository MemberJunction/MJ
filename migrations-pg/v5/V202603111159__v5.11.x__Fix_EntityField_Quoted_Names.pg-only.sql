-- ============================================================================
-- POSTGRESQL-ONLY MIGRATION
-- This migration applies ONLY to PostgreSQL databases. It has no SQL Server
-- equivalent because the bug it fixes is specific to the T-SQL → PostgreSQL
-- conversion pipeline.
-- ============================================================================
--
-- PROBLEM:
--   The SQLConverter's InsertRule had a bug where its __mj_ column-quoting
--   regex ran against the ENTIRE SQL string, including inside string literal
--   VALUES. When the baseline migration was converted from T-SQL to PG:
--
--     T-SQL:  ... VALUES (..., N'__mj_CreatedAt', ...)
--     PG:     ... VALUES (..., '"__mj_CreatedAt"', ...)   <-- BUG!
--
--   The converter correctly turned [__mj_CreatedAt] (column identifiers) into
--   "__mj_CreatedAt", but it also incorrectly quoted '__mj_CreatedAt' (string
--   values) into '"__mj_CreatedAt"'. This baked literal double-quote characters
--   into the EntityField.Name column for every __mj_CreatedAt and
--   __mj_UpdatedAt field across all 271 entities (542 rows total).
--
-- IMPACT:
--   The GraphQL layer maps field names from __mj_* to _mj__* for transport
--   (GraphQL reserves the __ prefix). When EntityField.Name contains literal
--   quotes, the field-name mapper can't match data properties to metadata
--   fields, so the __mj_CreatedAt → _mj__CreatedAt rename never fires.
--   GraphQL then returns null for the non-nullable _mj__CreatedAt field,
--   which cascades into a total app initialization failure:
--     CurrentUser query fails → no metadata → no applications → blank screen
--
-- FIX:
--   The converter bug is fixed in InsertRule.ts (now uses transformCodeOnly
--   to skip string literal contents). This migration strips the spurious
--   double-quote characters from existing EntityField.Name values so deployed
--   PG databases work correctly without requiring a full re-conversion.
-- ============================================================================

UPDATE __mj."EntityField"
SET "Name" = TRIM(BOTH '"' FROM "Name")
WHERE "Name" LIKE '"%"';
