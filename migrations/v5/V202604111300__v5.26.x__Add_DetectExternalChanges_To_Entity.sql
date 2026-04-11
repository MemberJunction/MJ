-- Add opt-in flag for external change detection.
-- Without this flag, no entity is scanned for external changes,
-- eliminating false positives from migration/CodeGen-managed tables.

ALTER TABLE ${flyway:defaultSchema}.Entity ADD
    DetectExternalChanges BIT NOT NULL DEFAULT 0;

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'When set to 1 AND TrackRecordChanges is also 1, the external change detection system will scan this entity for changes made outside the MJ framework (direct SQL, third-party tools, etc.) and replay them through Save() to create proper RecordChange audit entries. Default is 0 (opt-out) because most entities, especially __mj schema metadata tables, are managed by migrations/CodeGen and should not be scanned.',
    @level0type = N'SCHEMA', @level0name = N'${flyway:defaultSchema}',
    @level1type = N'TABLE',  @level1name = N'Entity',
    @level2type = N'COLUMN', @level2name = N'DetectExternalChanges';

GO

-- Refresh vwEntities so it picks up the new DetectExternalChanges column
EXEC sp_refreshview '${flyway:defaultSchema}.vwEntities';
GO

-- Update the view to require the new flag alongside the existing checks
ALTER VIEW ${flyway:defaultSchema}.vwEntitiesWithExternalChangeTracking
AS
SELECT
  e.*
FROM
  ${flyway:defaultSchema}.vwEntities e
WHERE
  e.TrackRecordChanges=1
  AND e.DetectExternalChanges=1
  AND
    EXISTS (
		  SELECT
			  1
		  FROM
			  ${flyway:defaultSchema}.vwEntityFields ef
		  WHERE
			  ef.Name='__mj_UpdatedAt' AND ef.Type='datetimeoffset' AND ef.EntityID = e.ID
		  )
  AND
    EXISTS (
		  SELECT
			  1
		  FROM
			  ${flyway:defaultSchema}.vwEntityFields ef
		  WHERE
			  ef.Name='__mj_CreatedAt' AND ef.Type='datetimeoffset' AND ef.EntityID = e.ID
		  );

-- Uncomment the following to enable external change detection for all
-- non-__mj entities that currently have TrackRecordChanges = 1:
--
-- UPDATE ${flyway:defaultSchema}.Entity
-- SET DetectExternalChanges = 1
-- WHERE TrackRecordChanges = 1
--   AND SchemaName <> '${flyway:defaultSchema}';
