-- Preserve External Data Source Entities Through CodeGen
--
-- External-data-source entities (Entity.ExternalDataSourceID set) have no physical table or view
-- in the MJ database — their data is proxied live from a remote system. CodeGen's manage-metadata
-- pass would otherwise treat them as orphaned and prune them on every run:
--   1. checkAndRemoveMetadataForDeletedTables would delete the whole entity. That pass reads
--      vwEntitiesWithMissingBaseTables (entities whose BaseTable is absent from the SQL catalog —
--      always true for external entities, whose data is remote). A code-level guard skips rows
--      whose ExternalDataSourceID is set, BUT that view is a `SELECT e.*` over vwEntities and its
--      cached column list predated ExternalDataSourceID, so the column was invisible to the guard
--      and external entities were pruned anyway. This migration recreates the view (re-expanding *)
--      AND excludes external entities at the SQL level — the analogue of the VirtualEntity handling
--      — so they never appear in the missing-base-tables set regardless of the code guard.
--   2. spDeleteUnneededEntityFields would delete ALL of their EntityField rows, because those
--      columns never appear in the SQL catalog (vwSQLColumnsAndEntityFields). This migration
--      excludes external-data-source entities from that proc — the analogue of its existing
--      "e.VirtualEntity = 0" exclusion.
--
-- spUpdateExistingEntityFieldsFromSchema and the create-new-fields-from-schema path are
-- unaffected: they INNER JOIN to the SQL catalog, which yields zero rows for external entities,
-- so they never create or modify external fields. Only the orphan-deletion proc needed the guard.
--
-- This is a CodeGen-bootstrap proc (not a user-entity SP) and is re-created in full per the
-- convention established by V202604261352__v5.30.x__Scoped_EntityField_SPs.sql.

DROP PROC IF EXISTS [${flyway:defaultSchema}].[spDeleteUnneededEntityFields]
GO
CREATE PROC [${flyway:defaultSchema}].[spDeleteUnneededEntityFields]
    @ExcludedSchemaNames NVARCHAR(MAX),
    @EntityIDs NVARCHAR(MAX) = NULL
AS
-- Get rid of any EntityFields that are NOT virtual and are not part of the underlying VIEW or TABLE - these are orphaned meta-data elements
-- where a field once existed but no longer does either it was renamed or removed from the table or view
SET NOCOUNT ON;

IF OBJECT_ID('tempdb..#ef_spDeleteUnneededEntityFields') IS NOT NULL
    DROP TABLE #ef_spDeleteUnneededEntityFields
IF OBJECT_ID('tempdb..#actual_spDeleteUnneededEntityFields') IS NOT NULL
    DROP TABLE #actual_spDeleteUnneededEntityFields
IF OBJECT_ID('tempdb..#DeletedFields') IS NOT NULL
    DROP TABLE #DeletedFields

-- Materialize the optional entity scope list once. @IsScoped lets the WHERE clauses
-- short-circuit to the unscoped path with a single int compare instead of joining
-- against an empty table variable.
DECLARE @ScopedEntityIDs TABLE (EntityID UNIQUEIDENTIFIER PRIMARY KEY);
DECLARE @IsScoped BIT = 0;
IF @EntityIDs IS NOT NULL AND LEN(@EntityIDs) > 0
BEGIN
    INSERT INTO @ScopedEntityIDs (EntityID)
    SELECT DISTINCT TRY_CONVERT(UNIQUEIDENTIFIER, LTRIM(RTRIM(value)))
    FROM STRING_SPLIT(@EntityIDs, ',')
    WHERE LTRIM(RTRIM(value)) <> ''
      AND TRY_CONVERT(UNIQUEIDENTIFIER, LTRIM(RTRIM(value))) IS NOT NULL;
    IF EXISTS (SELECT 1 FROM @ScopedEntityIDs) SET @IsScoped = 1;
END

-- put these two views into temp tables, for some SQL systems, this makes the join below WAY faster
SELECT
    ef.*
INTO
    #ef_spDeleteUnneededEntityFields
FROM
    vwEntityFields ef
INNER JOIN
    vwEntities e
ON
    ef.EntityID = e.ID
-- Use LEFT JOIN with STRING_SPLIT to filter out excluded schemas
LEFT JOIN
    STRING_SPLIT(@ExcludedSchemaNames, ',') AS excludedSchemas
ON
    e.SchemaName = excludedSchemas.value
WHERE
    e.VirtualEntity = 0 AND -- exclude virtual entities from this always
    e.ExternalDataSourceID IS NULL AND -- exclude external-data-source entities (no physical table/view; data is remote)
    excludedSchemas.value IS NULL AND -- This ensures rows with matching SchemaName are excluded
    (@IsScoped = 0 OR ef.EntityID IN (SELECT EntityID FROM @ScopedEntityIDs)) -- scoped run: only listed entities

-- get actual fields from the database so we can compare MJ metadata to the SQL catalog.
-- When scoped, narrow vwSQLColumnsAndEntityFields the same way so the orphan join below stays correct.
SELECT *
INTO #actual_spDeleteUnneededEntityFields
FROM vwSQLColumnsAndEntityFields
WHERE @IsScoped = 0 OR EntityID IN (SELECT EntityID FROM @ScopedEntityIDs)

-- now figure out which fields are NO longer in the DB and should be removed from MJ metadata
SELECT ef.* INTO #DeletedFields
    FROM
      #ef_spDeleteUnneededEntityFields ef
    LEFT JOIN
      #actual_spDeleteUnneededEntityFields actual
      ON
      ef.EntityID=actual.EntityID AND
      ef.Name = actual.EntityFieldName
    WHERE
      actual.column_id IS NULL


-- first update the entity UpdatedAt so that our metadata timestamps are right
UPDATE ${flyway:defaultSchema}.Entity SET __mj_UpdatedAt=GETUTCDATE() WHERE ID IN
(
  SELECT DISTINCT EntityID FROM #DeletedFields
)

-- next delete the entity field values
DELETE FROM ${flyway:defaultSchema}.EntityFieldValue WHERE EntityFieldID IN (
  SELECT ID FROM #DeletedFields
)

-- now delete the entity fields themsevles
DELETE FROM ${flyway:defaultSchema}.EntityField WHERE ID IN
(
  SELECT ID FROM #DeletedFields
)

-- return the deleted fields to the caller
SELECT * FROM #DeletedFields

-- clean up and get rid of our temp tables now
DROP TABLE #ef_spDeleteUnneededEntityFields
DROP TABLE #actual_spDeleteUnneededEntityFields
DROP TABLE #DeletedFields
GO

-- ── Preserve external entities from ENTITY-level pruning ──────────────────────────────────────
-- Recreate vwEntitiesWithMissingBaseTables so its `SELECT e.*` re-expands to include the
-- ExternalDataSourceID column added in V202606200001 (a `*` view caches its column list at
-- creation, so the column was previously invisible to checkAndRemoveMetadataForDeletedTables'
-- code guard, and external entities were pruned on every codegen run). Also exclude external
-- entities directly in the WHERE — the SQL-level analogue of the VirtualEntity exclusion — so
-- they never appear in the missing-base-tables set at all.
DROP VIEW IF EXISTS [${flyway:defaultSchema}].[vwEntitiesWithMissingBaseTables]
GO
CREATE VIEW [${flyway:defaultSchema}].[vwEntitiesWithMissingBaseTables]
AS
SELECT
    e.*
FROM
    [${flyway:defaultSchema}].vwEntities e
LEFT JOIN
    INFORMATION_SCHEMA.TABLES t
ON
    e.SchemaName = t.TABLE_SCHEMA AND
    e.BaseTable = t.TABLE_NAME
WHERE
    t.TABLE_NAME IS NULL AND
    e.ExternalDataSourceID IS NULL
GO
