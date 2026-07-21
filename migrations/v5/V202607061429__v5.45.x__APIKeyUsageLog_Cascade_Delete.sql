-- Migration: APIKeyUsageLog -> APIKey ON DELETE CASCADE
-- Description: The APIKeyUsageLog.APIKeyID foreign key was created with NO ACTION,
--              which blocks deleting an APIKey once any usage-log rows exist for it.
--              spDeleteAPIKey performs a plain DELETE FROM APIKey and relies on
--              DB-level cascade for its children; the sibling child FKs
--              (APIKeyScope.APIKeyID, APIKeyApplication.APIKeyID) are already
--              ON DELETE CASCADE. This aligns APIKeyUsageLog with them.
--
-- Tradeoff: deleting an APIKey now also deletes its APIKeyUsageLog audit rows.
--
-- FK-only change: no table columns change, so no CodeGen / entity regeneration
-- is required (spDeleteAPIKey already relies on DB cascade for its children).

-- Dynamically look up the FK constraint name since SQL Server auto-generates
-- the suffix based on object IDs, which differ per database instance.
DECLARE @fkName NVARCHAR(256);
SELECT @fkName = fk.name
FROM sys.foreign_keys fk
JOIN sys.foreign_key_columns fkc ON fkc.constraint_object_id = fk.object_id
JOIN sys.columns c ON c.object_id = fkc.parent_object_id AND c.column_id = fkc.parent_column_id
WHERE OBJECT_NAME(fk.parent_object_id) = 'APIKeyUsageLog'
  AND SCHEMA_NAME(fk.schema_id) = '${flyway:defaultSchema}'
  AND c.name = 'APIKeyID'
  AND OBJECT_NAME(fk.referenced_object_id) = 'APIKey';

IF @fkName IS NOT NULL
BEGIN
    EXEC('ALTER TABLE [${flyway:defaultSchema}].[APIKeyUsageLog] DROP CONSTRAINT [' + @fkName + ']');
END
GO

ALTER TABLE [${flyway:defaultSchema}].[APIKeyUsageLog]
    ADD CONSTRAINT [FK_APIKeyUsageLog_APIKeyID]
    FOREIGN KEY ([APIKeyID]) REFERENCES [${flyway:defaultSchema}].[APIKey] ([ID])
    ON DELETE CASCADE;
GO
