-- Add AllowCaching and DetectExternalChanges columns to Entity table.
--
-- AllowCaching: When false (default), the entire cache code path is
-- short-circuited for that entity. The runtime also checks the
-- cacheSettings.enableForSchemas config array, so __mj schema entities
-- are cached automatically without per-entity flags.
--
-- DetectExternalChanges: When true AND TrackRecordChanges is also true,
-- the external change detection system scans this entity for changes
-- made outside the MJ framework. Default is 0 (opt-out) because most
-- entities are managed by migrations/CodeGen and should not be scanned.

ALTER TABLE ${flyway:defaultSchema}.Entity ADD
    AllowCaching BIT NOT NULL CONSTRAINT DF_Entity_AllowCaching DEFAULT 0,
    DetectExternalChanges BIT NOT NULL CONSTRAINT DF_Entity_DetectExternalChanges DEFAULT 0;
GO

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'Controls whether this entity participates in server-side and client-side caching. When false, all cache operations (PreRunView checks, auto-cache storage, BaseEntity event fingerprint scans, client-side IndexedDB cache) are skipped entirely. Can also be enabled at the schema level via the cacheSettings.enableForSchemas server config.',
    @level0type = N'SCHEMA', @level0name = N'${flyway:defaultSchema}',
    @level1type = N'TABLE',  @level1name = N'Entity',
    @level2type = N'COLUMN', @level2name = N'AllowCaching';
GO

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'When set to 1 AND TrackRecordChanges is also 1, the external change detection system will scan this entity for changes made outside the MJ framework (direct SQL, third-party tools, etc.) and replay them through Save() to create proper RecordChange audit entries. Default is 0 (opt-out) because most entities, especially __mj schema metadata tables, are managed by migrations/CodeGen and should not be scanned.',
    @level0type = N'SCHEMA', @level0name = N'${flyway:defaultSchema}',
    @level1type = N'TABLE',  @level1name = N'Entity',
    @level2type = N'COLUMN', @level2name = N'DetectExternalChanges';
GO

-- Refresh vwEntities so downstream views pick up the new columns
EXEC sp_refreshview '${flyway:defaultSchema}.vwEntities';
GO

-- Recreate the external change tracking view to require the new flag
DROP VIEW IF EXISTS ${flyway:defaultSchema}.vwEntitiesWithExternalChangeTracking;
GO
CREATE VIEW ${flyway:defaultSchema}.vwEntitiesWithExternalChangeTracking
AS
SELECT
  e.*
FROM
  ${flyway:defaultSchema}.vwEntities e
WHERE
  e.TrackRecordChanges = 1
  AND e.DetectExternalChanges = 1
  AND EXISTS (
    SELECT 1
    FROM ${flyway:defaultSchema}.vwEntityFields ef
    WHERE ef.Name = '__mj_UpdatedAt' AND ef.Type = 'datetimeoffset' AND ef.EntityID = e.ID
  )
  AND EXISTS (
    SELECT 1
    FROM ${flyway:defaultSchema}.vwEntityFields ef
    WHERE ef.Name = '__mj_CreatedAt' AND ef.Type = 'datetimeoffset' AND ef.EntityID = e.ID
  );
GO
