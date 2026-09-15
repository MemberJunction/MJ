-- ════════════════════════════════════════════════════════════════════════════════════════
-- Harden spDeleteEntityWithCoreDependencies (#3546, #4483)
--
-- V202608061704 fixed this proc as part of the Phase-0 retirement, but only for databases
-- that had not yet applied it. Databases already past that migration still run the old
-- definition, and so does every CodeGen call to it from here on. This migration carries the
-- same hardening forward for everyone, and adds the precondition #3546 asked for.
--
-- Three changes over the pre-6.1 definition:
--
--  1. SET XACT_ABORT ON. Without it a constraint violation aborts only the offending
--     statement and the proc keeps running -- stripping an entity's fields, permissions and
--     relationships, then failing to delete the Entity row and reporting whichever error
--     happened last. That is why #4483 read as FK_ResourceType_CategoryEntityID when the
--     first cause was FK_ResourceLink_ResourceType.
--
--  2. ResourceType.CategoryEntityID is nulled. ResourceType references Entity twice; only
--     EntityID was ever cleared, so an entity used as a resource type's CATEGORY could never
--     be deleted.
--
--  3. A precondition that enumerates every inbound foreign key into Entity this proc does
--     NOT handle and throws naming the blockers -- BEFORE any delete. CodeGen's caller
--     (checkAndRemoveMetadataForDeletedTables) catches and logs the failure, so today a
--     blocked delete leaves the entity half-pruned: the Entity row survives with its
--     EntityField rows already gone, and every later CodeGen run silently skips it with one
--     grey log line. Failing before the first delete makes the FIRST-ORDER case of that state
--     unreachable, and the message names the table and column to clear instead of one
--     constraint from a cascade. This is #3546's own suggested fix. It deliberately does NOT
--     delete rows from unknown tables: a generic metadata proc quietly destroying customer
--     data is not a trade this should make on its own. The one-time, scoped sweep for the 11
--     Phase-0 entities lives in V202608061704 where it is auditable.
--
--     What the guard does NOT cover: a row referencing a row THIS PROC ITSELF deletes further
--     down (a second-order dependency -- e.g. ResourceLink.ResourceTypeID -> ResourceType.ID,
--     where ResourceLink has no FK into Entity at all, so the guard never sees it). The proc
--     runs in autocommit with no transaction of its own, and SET XACT_ABORT ON only aborts the
--     *batch* on error -- every DML statement before the failing one has already committed. So
--     a second-order block can still fail mid-cascade and leave the entity half-pruned, same
--     shape as before this migration. Closing that gap needs the cascade wrapped in its own
--     transaction, which is a real behavior change to a core proc (and interacts with the
--     migration runner's own transaction -- see V202608061704's note on that hazard) and is
--     deliberately left as follow-up, not folded into this fix.
-- ════════════════════════════════════════════════════════════════════════════════════════

ALTER PROC [${flyway:defaultSchema}].[spDeleteEntityWithCoreDependencies]
  @EntityID uniqueidentifier
AS
SET XACT_ABORT ON

-- ── Precondition: refuse to start if something we do not handle still points at this entity ──
DECLARE @blockers nvarchar(max) = N'', @probe nvarchar(max) = N'';

DECLARE @Handled TABLE (Pair nvarchar(400) PRIMARY KEY);
INSERT INTO @Handled (Pair) VALUES
 ('EntitySetting.EntityID'), ('EntityField.EntityID'), ('EntityField.RelatedEntityID'),
 ('EntityPermission.EntityID'), ('EntityRelationship.EntityID'), ('EntityRelationship.RelatedEntityID'),
 ('UserApplicationEntity.EntityID'), ('ApplicationEntity.EntityID'), ('RecordChange.EntityID'),
 ('AuditLog.EntityID'), ('Conversation.LinkedEntityID'), ('List.EntityID'),
 ('EntityDocument.EntityID'), ('CompanyIntegrationRecordMap.EntityID'), ('ResourceType.EntityID'),
 ('ResourceType.CategoryEntityID'), ('DatasetItem.EntityID'), ('UserViewCategory.EntityID'),
 ('UserView.EntityID'), ('EntityAIAction.EntityID'), ('EntityAIAction.OutputEntityID'),
 ('EntityCommunicationMessageType.EntityID');

-- Deterministic concatenation (M-1): the += accumulator pattern this replaced
-- (SELECT @probe = @probe + ...) is the row-concatenation idiom Microsoft documents as having
-- no guaranteed semantics -- a sort or parallel plan can drop rows and silently under-report
-- blockers, which is exactly the failure this guard exists to prevent. FOR XML PATH(''), TYPE
-- + .value() is the deterministic replacement already used below for @blockers.
SELECT @probe = (
    SELECT DISTINCT -- M-4: a composite FK, or two constraints on the same column, would
                     -- otherwise emit duplicate UNION ALL branches and duplicate names later
         N' UNION ALL SELECT ''' + REPLACE(SCHEMA_NAME(pt.schema_id) + '.' + pt.name + '.' + pc.name, '''', '''''')
       + N''' WHERE EXISTS (SELECT 1 FROM ' + QUOTENAME(SCHEMA_NAME(pt.schema_id)) + N'.' + QUOTENAME(pt.name)
       + N' WHERE ' + QUOTENAME(pc.name) + N' = @EntityID)'
    FROM sys.foreign_keys fk
    JOIN sys.tables rt ON rt.object_id = fk.referenced_object_id
         AND rt.name = 'Entity' AND SCHEMA_NAME(rt.schema_id) = '${flyway:defaultSchema}'
    JOIN sys.tables pt ON pt.object_id = fk.parent_object_id
    JOIN sys.foreign_key_columns fkc ON fkc.constraint_object_id = fk.object_id
    JOIN sys.columns pc ON pc.object_id = pt.object_id AND pc.column_id = fkc.parent_column_id
    -- C-1: an FK declared ON DELETE CASCADE / SET NULL / SET DEFAULT does not block this
    -- DELETE -- SQL Server clears it itself. Only a NO_ACTION FK (the default, and the only
    -- kind that actually raises a conflict) can block. A disabled (NOCHECK'd) FK is not
    -- enforced either, so it cannot block anything. Without this filter the guard refused to
    -- ever delete an entity with a form override (FK_EntityFormOverride_Entity is CASCADE,
    -- live on every DB since v5.38), which is strictly worse than the pre-migration behavior:
    -- SQL Server would have cleared that row cleanly.
    WHERE fk.delete_referential_action = 0
      AND fk.is_disabled = 0
      AND NOT (SCHEMA_NAME(pt.schema_id) = '${flyway:defaultSchema}'
               AND pt.name + '.' + pc.name IN (SELECT Pair FROM @Handled))
    FOR XML PATH(''), TYPE
).value('.', 'nvarchar(max)');

-- M-2: @probe <> N'' is NULL-unsafe -- a NULL @probe (no unhandled FK found) makes that
-- comparison UNKNOWN and would silently skip the guard. LEN(ISNULL(...)) treats NULL the same
-- as empty: no blockers, proceed with the cascade.
IF LEN(ISNULL(@probe, N'')) > 0
BEGIN
    DECLARE @found TABLE (Ref nvarchar(400));
    SET @probe = N'SELECT Ref FROM (SELECT CAST(NULL AS nvarchar(400)) Ref WHERE 1=0' + @probe + N') q;';
    INSERT INTO @found (Ref) EXEC sp_executesql @probe, N'@EntityID uniqueidentifier', @EntityID = @EntityID;

    SELECT @blockers = STUFF((SELECT N', ' + Ref FROM @found ORDER BY Ref FOR XML PATH(''), TYPE).value('.', 'nvarchar(max)'), 1, 2, N'');

    IF @blockers IS NOT NULL AND @blockers <> N''
    BEGIN
        DECLARE @msg nvarchar(2048) = N'Cannot delete entity ' + CAST(@EntityID AS nvarchar(50))
            + N': rows still reference it through foreign keys this procedure does not clear ('
            + LEFT(@blockers, 1600) + N'). Clear them first. Nothing has been deleted.';
        THROW 50000, @msg, 1;
    END
END

-- ── Cascade (unchanged from the pre-6.1 definition except where noted) ──
DELETE FROM [${flyway:defaultSchema}].EntityFieldValue WHERE EntityFieldID IN (SELECT ID FROM [${flyway:defaultSchema}].EntityField WHERE EntityID = @EntityID)
DELETE FROM [${flyway:defaultSchema}].EntitySetting WHERE EntityID = @EntityID
DELETE FROM [${flyway:defaultSchema}].EntityField WHERE EntityID = @EntityID
DELETE FROM [${flyway:defaultSchema}].EntityPermission WHERE EntityID = @EntityID
DELETE FROM [${flyway:defaultSchema}].EntityRelationship WHERE EntityID = @EntityID OR RelatedEntityID = @EntityID
DELETE FROM [${flyway:defaultSchema}].UserApplicationEntity WHERE EntityID = @EntityID
DELETE FROM [${flyway:defaultSchema}].ApplicationEntity WHERE EntityID = @EntityID
DELETE FROM [${flyway:defaultSchema}].RecordChange WHERE EntityID = @EntityID
DELETE FROM [${flyway:defaultSchema}].AuditLog WHERE EntityID=@EntityID
DELETE FROM [${flyway:defaultSchema}].[Conversation] WHERE LinkedEntityID=@EntityID
DELETE FROM [${flyway:defaultSchema}].ListDetail WHERE ListID IN (SELECT ID FROM [${flyway:defaultSchema}].List WHERE EntityID=@EntityID)
DELETE FROM [${flyway:defaultSchema}].List WHERE EntityID=@EntityID

DELETE FROM [${flyway:defaultSchema}].[EntityDocument] WHERE [EntityID] = @EntityID;
DELETE FROM [${flyway:defaultSchema}].[CompanyIntegrationRecordMap] WHERE [EntityID] = @EntityID;
DELETE FROM [${flyway:defaultSchema}].[ResourceType] WHERE [EntityID] = @EntityID;
DELETE FROM [${flyway:defaultSchema}].[UserApplicationEntity] WHERE [EntityID] = @EntityID;

UPDATE [${flyway:defaultSchema}].Dataset SET __mj_UpdatedAt=GETUTCDATE() WHERE ID IN (SELECT DatasetID FROM [${flyway:defaultSchema}].DatasetItem WHERE EntityID=@EntityID)
DELETE FROM [${flyway:defaultSchema}].[DatasetItem] WHERE [EntityID] = @EntityID;

DELETE FROM [${flyway:defaultSchema}].[UserViewCategory] WHERE [EntityID] = @EntityID;
DELETE FROM [${flyway:defaultSchema}].[UserView] WHERE [EntityID] = @EntityID;

DELETE FROM [${flyway:defaultSchema}].[EntityAIAction] WHERE [EntityID] = @EntityID;
DELETE FROM [${flyway:defaultSchema}].[EntityCommunicationMessageType] WHERE [EntityID] = @EntityID;
DELETE FROM [${flyway:defaultSchema}].[EntityAIAction] WHERE [OutputEntityID] = @EntityID;

-- Clear inbound metadata references from OTHER entities' fields that point AT this entity,
-- so the Entity row can be deleted without tripping FK_EntityField_RelatedEntity (#3561).
UPDATE [${flyway:defaultSchema}].EntityField SET RelatedEntityID = NULL WHERE RelatedEntityID = @EntityID

-- ResourceType references Entity twice; the delete above clears EntityID, this clears the
-- other one. Without it an entity used as a resource type's CATEGORY cannot be deleted (#4483).
UPDATE [${flyway:defaultSchema}].ResourceType SET CategoryEntityID = NULL WHERE CategoryEntityID = @EntityID

DELETE FROM [${flyway:defaultSchema}].Entity WHERE ID = @EntityID
GO
