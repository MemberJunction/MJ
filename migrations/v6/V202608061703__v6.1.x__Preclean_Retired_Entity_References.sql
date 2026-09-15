/*
    Pre-clean inbound references to the 11 entities that V202608061704 retires.

    Why this file exists (MemberJunction/MJ#4483): V202608061704 deletes the Workflow,
    Report and Scheduled Action entity families through spDeleteEntityWithCoreDependencies.
    That proc clears a fixed list of referencing tables and then deletes the Entity row. On a
    database where those features were actually used, other tables still hold rows that
    reference the retired entities through foreign keys the proc does not know about
    (ResourceType.CategoryEntityID on CDP; around fifty inbound FKs into Entity in total), so
    the final DELETE FROM Entity fails and the upgrade stops. A fresh database has no such
    rows, which is why CI and the fresh-install gate pass.

    Why it is versioned one minute BEFORE V202608061704: a shipped migration is never edited
    (the runner checksums applied files, so an amended one breaks every database that already
    ran it). On any database that has not reached V202608061704 yet, this file runs first, in
    order, and the retirement then succeeds. On a database already past it, the runner marks
    this file IGNORED (out-of-order migrations are not applied), which is correct because that
    database already got through.

    What it does: for every foreign key whose referenced table is Entity(ID), except the
    columns the proc already clears, it nulls the referencing column when nullable and deletes
    the referencing rows otherwise, restricted to rows that point at one of the 11 retired
    entity IDs. Data only, no DDL. Idempotent: a second run finds no rows. Nothing runs at all
    unless at least one retired entity still exists.

    SET XACT_ABORT ON so that the first failing statement stops the batch and is the error
    reported, instead of the last one.
*/
SET XACT_ABORT ON;
SET NOCOUNT ON;

IF OBJECT_ID('tempdb..#RetiredEntity') IS NOT NULL DROP TABLE #RetiredEntity;
CREATE TABLE #RetiredEntity (ID uniqueidentifier NOT NULL PRIMARY KEY);
INSERT INTO #RetiredEntity (ID) VALUES
  ('12CD5A5D-A83B-EF11-86D4-0022481D1B23'), -- MJ: Scheduled Actions
  ('58E4EE77-0A3C-EF11-86D4-0022481D1B23'), -- MJ: Scheduled Action Params
  ('F2238F34-2837-EF11-86D4-6045BDEE16E6'), -- MJ: Workflow Runs
  ('F3238F34-2837-EF11-86D4-6045BDEE16E6'), -- MJ: Workflows
  ('F4238F34-2837-EF11-86D4-6045BDEE16E6'), -- MJ: Workflow Engines
  ('06248F34-2837-EF11-86D4-6045BDEE16E6'), -- MJ: Output Trigger Types
  ('09248F34-2837-EF11-86D4-6045BDEE16E6'), -- MJ: Reports
  ('0A248F34-2837-EF11-86D4-6045BDEE16E6'), -- MJ: Report Snapshots
  ('27248F34-2837-EF11-86D4-6045BDEE16E6'), -- MJ: Report Categories
  ('4A4C2EE1-BFDD-434E-9A03-6F6C2384D01F'), -- MJ: Report User States
  ('9516058D-9729-48EC-B0B8-E91A8221FC8F'); -- MJ: Report Versions

IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[Entity] e JOIN #RetiredEntity r ON r.ID = e.ID)
BEGIN
    PRINT 'Preclean_Retired_Entity_References: no retired entity present, nothing to do.';
    DROP TABLE #RetiredEntity;
    RETURN;
END

-- (table, column) pairs spDeleteEntityWithCoreDependencies already clears itself, in the
-- version V202608061704 installs. Left to the proc so this file and the proc never disagree.
DECLARE @HandledByProc TABLE (TableName sysname NOT NULL, ColumnName sysname NOT NULL);
INSERT INTO @HandledByProc (TableName, ColumnName) VALUES
  ('EntitySetting', 'EntityID'), ('EntityField', 'EntityID'), ('EntityField', 'RelatedEntityID'),
  ('EntityPermission', 'EntityID'), ('EntityRelationship', 'EntityID'), ('EntityRelationship', 'RelatedEntityID'),
  ('UserApplicationEntity', 'EntityID'), ('ApplicationEntity', 'EntityID'), ('RecordChange', 'EntityID'),
  ('AuditLog', 'EntityID'), ('Conversation', 'LinkedEntityID'), ('List', 'EntityID'),
  ('EntityDocument', 'EntityID'), ('CompanyIntegrationRecordMap', 'EntityID'), ('ResourceType', 'EntityID'),
  ('DatasetItem', 'EntityID'), ('UserViewCategory', 'EntityID'), ('UserView', 'EntityID'),
  ('EntityAIAction', 'EntityID'), ('EntityAIAction', 'OutputEntityID'), ('EntityCommunicationMessageType', 'EntityID');

DECLARE @Statements TABLE (Seq int IDENTITY(1,1) PRIMARY KEY, Sql nvarchar(max) NOT NULL, Label nvarchar(400) NOT NULL);

INSERT INTO @Statements (Sql, Label)
SELECT
    CASE WHEN c.is_nullable = 1
         THEN N'UPDATE t SET ' + QUOTENAME(c.name) + N' = NULL FROM ' + QUOTENAME(s.name) + N'.' + QUOTENAME(t.name)
              + N' t WHERE t.' + QUOTENAME(c.name) + N' IN (SELECT ID FROM #RetiredEntity);'
         ELSE N'DELETE t FROM ' + QUOTENAME(s.name) + N'.' + QUOTENAME(t.name)
              + N' t WHERE t.' + QUOTENAME(c.name) + N' IN (SELECT ID FROM #RetiredEntity);'
    END,
    (CASE WHEN c.is_nullable = 1 THEN N'null ' ELSE N'delete ' END) + s.name + N'.' + t.name + N'.' + c.name
FROM sys.foreign_keys fk
JOIN sys.foreign_key_columns fkc ON fkc.constraint_object_id = fk.object_id
JOIN sys.tables t  ON t.object_id = fk.parent_object_id
JOIN sys.schemas s ON s.schema_id = t.schema_id
JOIN sys.columns c ON c.object_id = fkc.parent_object_id AND c.column_id = fkc.parent_column_id
JOIN sys.columns rc ON rc.object_id = fkc.referenced_object_id AND rc.column_id = fkc.referenced_column_id
WHERE fk.referenced_object_id = OBJECT_ID(N'[${flyway:defaultSchema}].[Entity]')
  AND rc.name = N'ID'
  AND fk.is_disabled = 0
  AND NOT EXISTS (SELECT 1 FROM @HandledByProc h WHERE h.TableName = t.name AND h.ColumnName = c.name AND s.name = N'${flyway:defaultSchema}')
ORDER BY CASE WHEN c.is_nullable = 1 THEN 0 ELSE 1 END, s.name, t.name, c.name;

DECLARE @Seq int = 1, @Max int, @Sql nvarchar(max), @Label nvarchar(400), @Rows int;
SELECT @Max = MAX(Seq) FROM @Statements;

WHILE @Seq <= ISNULL(@Max, 0)
BEGIN
    SELECT @Sql = Sql, @Label = Label FROM @Statements WHERE Seq = @Seq;
    EXEC sp_executesql @Sql;
    SET @Rows = @@ROWCOUNT;
    IF @Rows > 0 PRINT 'Preclean_Retired_Entity_References: ' + @Label + ' (' + CAST(@Rows AS nvarchar(20)) + ' rows)';
    SET @Seq = @Seq + 1;
END

DROP TABLE #RetiredEntity;
