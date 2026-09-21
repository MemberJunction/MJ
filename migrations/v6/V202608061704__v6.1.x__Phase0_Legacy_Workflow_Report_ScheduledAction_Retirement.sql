/*
    Phase 0 — Legacy retirement (unified workflow DAG engine program)

    Plan: plans/task-graph-primitive.md §4 "Phase 0 — Legacy retirement", PR #3456.

    Retires four dead-or-superseded subsystems so the "Workflow" name is freed for the
    D18 vocabulary work in Phase 5, and so the task-graph engine is not built alongside
    a parallel, non-functioning orchestration model.

    ── What goes, and why ──────────────────────────────────────────────────────────────

    1. Skip v1-era workflow schema: Workflow, WorkflowRun, WorkflowEngine.
       Zero non-generated readers/writers. The SubclassName-referenced `WorkflowBase`
       class does not exist anywhere in the repo. All three tables are empty.

    2. Skip v1-era report artifact: Report, ReportCategory, ReportSnapshot, ReportUserState,
       ReportVersion. Superseded by conversation artifacts. Every inbound ReportID FK is
       internal to the family (Snapshot/UserState/Version -> Report), so the cluster is
       self-contained. The renderer is already gone: the `Reports` resource type names a
       DriverClass (`ReportResource`) that exists nowhere in the repo. All five are empty.

    3. Legacy scheduled actions: ScheduledAction, ScheduledActionParam (+ the
       packages/Actions/ScheduledActions{,Server} packages, removed in this PR).
       The legacy cron due-check is mathematically always-false (scheduler.ts:159-171 —
       cronParser.next() is strictly after evalTime), and nothing in-repo hosts its
       Express app, so authored schedules could never fire. `MJ: Scheduled Jobs` +
       ActionScheduledJobDriver supersede it exactly: ScheduledAction -> ScheduledJob of
       type 'Action', and ScheduledActionParam rows -> Configuration.Params[] JSON.

       NOTE (scope correction vs. the plan): the plan recorded Scheduled Actions as having
       "zero non-generated consumers". The EXECUTOR is indeed dead, but the ENTITIES were
       live authoring surface — four Knowledge Hub / AI dashboards created and read them.
       Those surfaces are migrated to Scheduled Jobs in this same PR, which is why
       ContentSource swaps its FK below rather than simply losing it.

    4. Report-era output triggers: OutputTriggerType. Its sole referencer was Report,
       which is now gone entirely.

    Dropping Report outright subsumes the plan's separate Report.OutputWorkflowID and
    Report.OutputTriggerTypeID column drops, and avoids regenerating spCreateReport /
    spUpdateReport just to remove columns.

    ── Ordering ────────────────────────────────────────────────────────────────────────

    Generated SQL objects for the doomed entities are dropped explicitly before their
    tables so this migration is self-contained and leaves no invalid objects behind, even
    though CodeGen's checkAndRemoveMetadataForDeletedTables would also drop them. Tables
    then drop children-before-parents.

    Entity metadata rows (Entity, EntityField, EntityPermission, EntityRelationship,
    ResourceType, ApplicationEntity, ...) are NOT deleted here: CodeGen prunes them via
    spDeleteEntityWithCoreDependencies once it sees the base tables are missing. That is
    the sanctioned path — see packages/CodeGenLib/src/Database/manage-metadata.ts.
*/

-- ════════════════════════════════════════════════════════════════════════════════════
-- 1. ContentSource: swap the legacy ScheduledAction link for a Scheduled Job link
--    The four Knowledge Hub / AI dashboards that authored ScheduledActions now author
--    ScheduledJobs, so the content source points at the surviving substrate.
-- ════════════════════════════════════════════════════════════════════════════════════

IF EXISTS (SELECT 1 FROM sys.foreign_keys
           WHERE name = 'FK_ContentSource_ScheduledAction'
             AND parent_object_id = OBJECT_ID('${flyway:defaultSchema}.ContentSource'))
BEGIN
    ALTER TABLE [${flyway:defaultSchema}].[ContentSource] DROP CONSTRAINT [FK_ContentSource_ScheduledAction];
END
GO

DROP INDEX IF EXISTS [IDX_AUTO_MJ_FKEY_ContentSource_ScheduledActionID] ON [${flyway:defaultSchema}].[ContentSource];
GO

IF EXISTS (SELECT * FROM sys.extended_properties
           WHERE major_id = OBJECT_ID('${flyway:defaultSchema}.ContentSource')
             AND minor_id = (SELECT column_id FROM sys.columns
                             WHERE object_id = OBJECT_ID('${flyway:defaultSchema}.ContentSource')
                               AND name = 'ScheduledActionID')
             AND name = 'MS_Description')
BEGIN
    EXEC sp_dropextendedproperty
        @name = N'MS_Description',
        @level0type = N'SCHEMA', @level0name = '${flyway:defaultSchema}',
        @level1type = N'TABLE',  @level1name = 'ContentSource',
        @level2type = N'COLUMN', @level2name = 'ScheduledActionID';
END
GO

IF COL_LENGTH('${flyway:defaultSchema}.ContentSource', 'ScheduledActionID') IS NOT NULL
BEGIN
    ALTER TABLE [${flyway:defaultSchema}].[ContentSource] DROP COLUMN [ScheduledActionID];
END
GO

IF COL_LENGTH('${flyway:defaultSchema}.ContentSource', 'ScheduledJobID') IS NULL
BEGIN
    ALTER TABLE [${flyway:defaultSchema}].[ContentSource]
        ADD [ScheduledJobID] UNIQUEIDENTIFIER NULL
            CONSTRAINT [FK_ContentSource_ScheduledJob] FOREIGN KEY ([ScheduledJobID])
                REFERENCES [${flyway:defaultSchema}].[ScheduledJob]([ID]);
END
GO

-- vwContentSources joins ScheduledAction for the denormalized schedule name, so it becomes
-- invalid the moment that table drops. It MUST go in this migration rather than being left to
-- CodeGen: `mj migrate` runs R__RefreshMetadata at the end, whose spRecompileAllViews would
-- fail with "Invalid object name '__mj.ScheduledAction'" before CodeGen ever gets a chance.
-- CodeGen regenerates it (with ScheduledJobID) on the next run.
DROP VIEW IF EXISTS [${flyway:defaultSchema}].[vwContentSources];
GO

IF EXISTS (SELECT * FROM sys.extended_properties
           WHERE major_id = OBJECT_ID('${flyway:defaultSchema}.ContentSource')
             AND minor_id = (SELECT column_id FROM sys.columns
                             WHERE object_id = OBJECT_ID('${flyway:defaultSchema}.ContentSource')
                               AND name = 'ScheduledJobID')
             AND name = 'MS_Description')
BEGIN
    EXEC sp_dropextendedproperty
        @name = N'MS_Description',
        @level0type = N'SCHEMA', @level0name = '${flyway:defaultSchema}',
        @level1type = N'TABLE',  @level1name = 'ContentSource',
        @level2type = N'COLUMN', @level2name = 'ScheduledJobID';
END
GO

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'Optional link to the Scheduled Job that runs this content source on a recurring basis. Replaces the retired ScheduledActionID link; the job is of type Action and carries its action + parameters in ScheduledJob.Configuration.',
    @level0type = N'SCHEMA', @level0name = '${flyway:defaultSchema}',
    @level1type = N'TABLE',  @level1name = 'ContentSource',
    @level2type = N'COLUMN', @level2name = 'ScheduledJobID';
GO

-- ════════════════════════════════════════════════════════════════════════════════════
-- 2. Clear Record-Set-Processing run history pointing at the doomed entities
--
--    CodeGen prunes entity metadata via spDeleteEntityWithCoreDependencies, but that proc
--    predates Record Set Processing and does not cascade ProcessRun / ProcessRunDetail. A
--    left-behind run row makes the DELETE FROM Entity fail, and CodeGen then leaves a
--    half-pruned entity (metadata row present, fields gone, no PK) that breaks every
--    subsequent CodeGen run with "has no primary key field in metadata".
--
--    This runs BEFORE the tables drop, while the Entity rows are still resolvable by name.
--    NOTE: the proc covers only ~18 of the ~73 FK references to Entity repo-wide — the
--    general gap is tracked separately; this handles the references Phase 0 actually hits.
-- ════════════════════════════════════════════════════════════════════════════════════

DECLARE @DoomedEntityIDs TABLE (ID UNIQUEIDENTIFIER PRIMARY KEY);
INSERT INTO @DoomedEntityIDs (ID)
SELECT [ID] FROM [${flyway:defaultSchema}].[Entity]
WHERE [Name] IN (
    'MJ: Workflows', 'MJ: Workflow Runs', 'MJ: Workflow Engines',
    'MJ: Reports', 'MJ: Report Categories', 'MJ: Report Snapshots',
    'MJ: Report User States', 'MJ: Report Versions',
    'MJ: Scheduled Actions', 'MJ: Scheduled Action Params',
    'MJ: Output Trigger Types'
);

-- Details first (they reference ProcessRun), then the runs themselves.
DELETE FROM [${flyway:defaultSchema}].[ProcessRunDetail]
WHERE [EntityID] IN (SELECT ID FROM @DoomedEntityIDs)
   OR [ProcessRunID] IN (
        SELECT [ID] FROM [${flyway:defaultSchema}].[ProcessRun]
        WHERE [EntityID] IN (SELECT ID FROM @DoomedEntityIDs)
   );

DELETE FROM [${flyway:defaultSchema}].[ProcessRun]
WHERE [EntityID] IN (SELECT ID FROM @DoomedEntityIDs);
GO

-- ════════════════════════════════════════════════════════════════════════════════════
-- 3. Drop generated SQL objects belonging to the doomed entities
--    (views, CRUD procs). Their triggers and CHECK constraints drop with the tables.
-- ════════════════════════════════════════════════════════════════════════════════════

DROP VIEW IF EXISTS [${flyway:defaultSchema}].[vwWorkflows];
DROP VIEW IF EXISTS [${flyway:defaultSchema}].[vwWorkflowRuns];
DROP VIEW IF EXISTS [${flyway:defaultSchema}].[vwWorkflowEngines];
DROP VIEW IF EXISTS [${flyway:defaultSchema}].[vwReports];
DROP VIEW IF EXISTS [${flyway:defaultSchema}].[vwReportCategories];
DROP VIEW IF EXISTS [${flyway:defaultSchema}].[vwReportSnapshots];
DROP VIEW IF EXISTS [${flyway:defaultSchema}].[vwReportUserStates];
DROP VIEW IF EXISTS [${flyway:defaultSchema}].[vwReportVersions];
DROP VIEW IF EXISTS [${flyway:defaultSchema}].[vwScheduledActions];
DROP VIEW IF EXISTS [${flyway:defaultSchema}].[vwScheduledActionParams];
DROP VIEW IF EXISTS [${flyway:defaultSchema}].[vwOutputTriggerTypes];
GO

DROP PROCEDURE IF EXISTS [${flyway:defaultSchema}].[spCreateWorkflow];
DROP PROCEDURE IF EXISTS [${flyway:defaultSchema}].[spUpdateWorkflow];
DROP PROCEDURE IF EXISTS [${flyway:defaultSchema}].[spDeleteWorkflow];
DROP PROCEDURE IF EXISTS [${flyway:defaultSchema}].[spCreateWorkflowRun];
DROP PROCEDURE IF EXISTS [${flyway:defaultSchema}].[spUpdateWorkflowRun];
DROP PROCEDURE IF EXISTS [${flyway:defaultSchema}].[spDeleteWorkflowRun];
DROP PROCEDURE IF EXISTS [${flyway:defaultSchema}].[spCreateWorkflowEngine];
DROP PROCEDURE IF EXISTS [${flyway:defaultSchema}].[spUpdateWorkflowEngine];
DROP PROCEDURE IF EXISTS [${flyway:defaultSchema}].[spDeleteWorkflowEngine];
GO

DROP PROCEDURE IF EXISTS [${flyway:defaultSchema}].[spCreateReport];
DROP PROCEDURE IF EXISTS [${flyway:defaultSchema}].[spUpdateReport];
DROP PROCEDURE IF EXISTS [${flyway:defaultSchema}].[spDeleteReport];
DROP PROCEDURE IF EXISTS [${flyway:defaultSchema}].[spCreateReportCategory];
DROP PROCEDURE IF EXISTS [${flyway:defaultSchema}].[spUpdateReportCategory];
DROP PROCEDURE IF EXISTS [${flyway:defaultSchema}].[spDeleteReportCategory];
DROP PROCEDURE IF EXISTS [${flyway:defaultSchema}].[spCreateReportSnapshot];
DROP PROCEDURE IF EXISTS [${flyway:defaultSchema}].[spUpdateReportSnapshot];
DROP PROCEDURE IF EXISTS [${flyway:defaultSchema}].[spDeleteReportSnapshot];
DROP PROCEDURE IF EXISTS [${flyway:defaultSchema}].[spCreateReportUserState];
DROP PROCEDURE IF EXISTS [${flyway:defaultSchema}].[spUpdateReportUserState];
DROP PROCEDURE IF EXISTS [${flyway:defaultSchema}].[spDeleteReportUserState];
DROP PROCEDURE IF EXISTS [${flyway:defaultSchema}].[spCreateReportVersion];
DROP PROCEDURE IF EXISTS [${flyway:defaultSchema}].[spUpdateReportVersion];
DROP PROCEDURE IF EXISTS [${flyway:defaultSchema}].[spDeleteReportVersion];
GO

DROP PROCEDURE IF EXISTS [${flyway:defaultSchema}].[spCreateScheduledAction];
DROP PROCEDURE IF EXISTS [${flyway:defaultSchema}].[spUpdateScheduledAction];
DROP PROCEDURE IF EXISTS [${flyway:defaultSchema}].[spDeleteScheduledAction];
DROP PROCEDURE IF EXISTS [${flyway:defaultSchema}].[spCreateScheduledActionParam];
DROP PROCEDURE IF EXISTS [${flyway:defaultSchema}].[spUpdateScheduledActionParam];
DROP PROCEDURE IF EXISTS [${flyway:defaultSchema}].[spDeleteScheduledActionParam];
GO

DROP PROCEDURE IF EXISTS [${flyway:defaultSchema}].[spCreateOutputTriggerType];
DROP PROCEDURE IF EXISTS [${flyway:defaultSchema}].[spUpdateOutputTriggerType];
DROP PROCEDURE IF EXISTS [${flyway:defaultSchema}].[spDeleteOutputTriggerType];
GO

-- ════════════════════════════════════════════════════════════════════════════════════
-- 4. Drop the tables, children before parents
-- ════════════════════════════════════════════════════════════════════════════════════

-- Scheduled actions: ScheduledActionParam -> ScheduledAction
DROP TABLE IF EXISTS [${flyway:defaultSchema}].[ScheduledActionParam];
DROP TABLE IF EXISTS [${flyway:defaultSchema}].[ScheduledAction];
GO

-- Reports: Snapshot/UserState/Version -> Report -> ReportCategory.
-- Report also carries the FKs to Workflow and OutputTriggerType, so it must precede both.
DROP TABLE IF EXISTS [${flyway:defaultSchema}].[ReportSnapshot];
DROP TABLE IF EXISTS [${flyway:defaultSchema}].[ReportUserState];
DROP TABLE IF EXISTS [${flyway:defaultSchema}].[ReportVersion];
DROP TABLE IF EXISTS [${flyway:defaultSchema}].[Report];
DROP TABLE IF EXISTS [${flyway:defaultSchema}].[ReportCategory];
GO

-- Report-era output triggers (sole referencer was Report, dropped above)
DROP TABLE IF EXISTS [${flyway:defaultSchema}].[OutputTriggerType];
GO

-- Skip v1-era workflow schema: WorkflowRun -> Workflow -> WorkflowEngine
DROP TABLE IF EXISTS [${flyway:defaultSchema}].[WorkflowRun];
DROP TABLE IF EXISTS [${flyway:defaultSchema}].[Workflow];
DROP TABLE IF EXISTS [${flyway:defaultSchema}].[WorkflowEngine];
GO

-- ════════════════════════════════════════════════════════════════════════════════════
-- Harden spDeleteEntityWithCoreDependencies before the generated block runs.
--
-- The generated block below deletes 11 interrelated entities via
-- spDeleteEntityWithCoreDependencies, in parent-before-child order (Scheduled Actions
-- before Scheduled Action Params; Reports before Report Snapshots/User States/Versions).
-- The prior SP cleared only each target entity's OWN EntityField rows, never the INBOUND
-- EntityField.RelatedEntityID references pointing AT it from sibling entities. So the
-- parent's final `DELETE FROM Entity` tripped FK_EntityField_RelatedEntity because a
-- not-yet-deleted child still carried a field whose RelatedEntityID = the parent.
--
-- Nulling inbound references before deleting the Entity row is correct for every caller:
-- once an entity is gone, any field that pointed at it no longer has a valid relationship.
-- This is a permanent fix to the class of bug, not a one-off patch for this migration.
-- ════════════════════════════════════════════════════════════════════════════════════
ALTER PROC [${flyway:defaultSchema}].[spDeleteEntityWithCoreDependencies]
  @EntityID uniqueidentifier
AS
-- Without this, a constraint violation aborts only the offending statement and the proc runs
-- on: it strips EntityField / EntityPermission / EntityRelationship rows for an entity whose
-- Entity row then fails to delete, and reports only the LAST error of the resulting cascade.
-- That is what made #4483 read as FK_ResourceType_CategoryEntityID when the true first cause
-- was FK_ResourceLink_ResourceType, two errors earlier.
SET XACT_ABORT ON

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

-- ORDER MATTERS -- do not swap these two back. UserView.CategoryID references
-- UserViewCategory.ID with NO_ACTION, so deleting the categories first raises error 547
-- (FK_UserView_UserViewCategory) on any database where a saved view of this entity was filed
-- in one of this entity's own view categories -- i.e. on any database where the entity was
-- actually used. Children before parents.
DELETE FROM [${flyway:defaultSchema}].[UserView] WHERE [EntityID] = @EntityID;
DELETE FROM [${flyway:defaultSchema}].[UserViewCategory] WHERE [EntityID] = @EntityID;

DELETE FROM [${flyway:defaultSchema}].[EntityAIAction] WHERE [EntityID] = @EntityID;
DELETE FROM [${flyway:defaultSchema}].[EntityCommunicationMessageType] WHERE [EntityID] = @EntityID;
DELETE FROM [${flyway:defaultSchema}].[EntityAIAction] WHERE [OutputEntityID] = @EntityID;

-- Clear inbound metadata references from OTHER entities' fields that point AT this entity,
-- so the Entity row can be deleted without tripping FK_EntityField_RelatedEntity.
UPDATE [${flyway:defaultSchema}].EntityField SET RelatedEntityID = NULL WHERE RelatedEntityID = @EntityID

-- ResourceType points at Entity TWICE: EntityID (deleted above) and CategoryEntityID. Only the
-- first was ever cleared, so an entity used as a resource type's CATEGORY could never be
-- deleted. Null it for the same reason the line above nulls RelatedEntityID: once the entity is
-- gone the category link is meaningless. Symmetric partner to the #3561 hardening.
UPDATE [${flyway:defaultSchema}].ResourceType SET CategoryEntityID = NULL WHERE CategoryEntityID = @EntityID

DELETE FROM [${flyway:defaultSchema}].Entity WHERE ID = @EntityID
GO

-- ════════════════════════════════════════════════════════════════════════════════════════
-- Retirement pre-clean (#4483, #3546)
--
-- spDeleteEntityWithCoreDependencies cascades 21 of the ~72 foreign keys that reference
-- Entity. The rest block its final DELETE FROM Entity whenever they hold a row for one of the
-- 11 entities retired below. On a stock database exactly one of them does --
-- ResourceType.CategoryEntityID -- and this migration survives only because delete ORDER
-- happens to clear it as a side effect (MJ: Reports is retired before MJ: Report Categories).
-- Any database where Reports were actually used breaks that coincidence, and the upgrade
-- hard-fails here. That is #4483.
--
-- This block clears those references up front so the generated block below cannot fail, and
-- THROWs rather than leaving an entity half-pruned if it cannot.
--
-- It also DETECTS -- without clearing -- the second-order case: rows referencing rows the proc's
-- own cascade is about to delete. Those are user data (conversation history, agent sessions,
-- entity documents), so this migration names them and stops rather than destroying them. See the
-- "Second-order blockers" section further down.
--
-- Everything runs in ONE batch deliberately: the temp tables it builds (#Retired, #Refs, and the
-- second-order set further down) must outlive each statement, and relying on temp tables
-- surviving a GO would be an assumption about the migration runner's connection handling that
-- nothing here needs to make.
-- ════════════════════════════════════════════════════════════════════════════════════════

-- The retry loop below catches FK-ordering errors and retries. XACT_ABORT must be OFF for that
-- to work: with it ON a caught error still dooms the enclosing transaction (the runner wraps
-- each migration in one) and every later statement fails with "the current transaction cannot
-- be committed". The proc above sets it ON for its own body, which is scoped to the proc; this
-- SET is session-scoped, not batch-scoped, so it persists past this batch's GO into every later
-- batch/migration in the run (Skyway migrates over a single connection). Left unrestored
-- deliberately: OFF is the T-SQL session default, so this leaves the session exactly where it
-- started rather than drifting it into a non-default setting a later batch would have to
-- account for.
SET XACT_ABORT OFF;

CREATE TABLE #Retired (ID uniqueidentifier PRIMARY KEY);
INSERT INTO #Retired (ID) VALUES
 ('12CD5A5D-A83B-EF11-86D4-0022481D1B23'),  -- MJ: Scheduled Actions
 ('58E4EE77-0A3C-EF11-86D4-0022481D1B23'),  -- MJ: Scheduled Action Params
 ('F2238F34-2837-EF11-86D4-6045BDEE16E6'),  -- MJ: Workflow Runs
 ('F3238F34-2837-EF11-86D4-6045BDEE16E6'),  -- MJ: Workflows
 ('F4238F34-2837-EF11-86D4-6045BDEE16E6'),  -- MJ: Workflow Engines
 ('06248F34-2837-EF11-86D4-6045BDEE16E6'),  -- MJ: Output Trigger Types
 ('09248F34-2837-EF11-86D4-6045BDEE16E6'),  -- MJ: Reports
 ('0A248F34-2837-EF11-86D4-6045BDEE16E6'),  -- MJ: Report Snapshots
 ('27248F34-2837-EF11-86D4-6045BDEE16E6'),  -- MJ: Report Categories
 ('4A4C2EE1-BFDD-434E-9A03-6F6C2384D01F'),  -- MJ: Report User States
 ('9516058D-9729-48EC-B0B8-E91A8221FC8F');  -- MJ: Report Versions

-- ── The `Reports` resource type ─────────────────────────────────────────────────────────
-- Both ResourceType.EntityID and ResourceType.CategoryEntityID are NULLABLE, so the generic
-- sweep below would simply null them and leave a `Reports` resource type pointing at nothing
-- -- a dead entry users can still see. Retire it explicitly instead, dependents first, so the
-- migration OWNS the user-visible artefacts it destroys rather than inheriting them as a side
-- effect of a generic metadata proc.
--
-- Matched by the entity it points at, not by name, so a renamed resource type is still caught
-- (a mismatched EntityID is one of the two documented triggers for #4483).
--
-- The five dependent tables below are the complete set of inbound foreign keys into
-- ResourceType; the postcondition immediately after proves it on every database that runs
-- this, so the list cannot silently go stale.
DECLARE @RetiredResourceTypes TABLE (ID uniqueidentifier PRIMARY KEY);
INSERT INTO @RetiredResourceTypes (ID)
SELECT rt.[ID]
FROM [${flyway:defaultSchema}].[ResourceType] rt
WHERE rt.[EntityID] IN (SELECT ID FROM #Retired)
   OR rt.[CategoryEntityID] IN (SELECT ID FROM #Retired);

DELETE FROM [${flyway:defaultSchema}].[ResourceLink]       WHERE [ResourceTypeID] IN (SELECT ID FROM @RetiredResourceTypes);
DELETE FROM [${flyway:defaultSchema}].[ResourcePermission] WHERE [ResourceTypeID] IN (SELECT ID FROM @RetiredResourceTypes);
DELETE FROM [${flyway:defaultSchema}].[WorkspaceItem]      WHERE [ResourceTypeID] IN (SELECT ID FROM @RetiredResourceTypes);
DELETE FROM [${flyway:defaultSchema}].[MagicLinkInvite]    WHERE [ResourceTypeID] IN (SELECT ID FROM @RetiredResourceTypes);
UPDATE [${flyway:defaultSchema}].[UserNotification] SET [ResourceTypeID] = NULL
                                                   WHERE [ResourceTypeID] IN (SELECT ID FROM @RetiredResourceTypes);
DELETE FROM [${flyway:defaultSchema}].[ResourceType]       WHERE [ID] IN (SELECT ID FROM @RetiredResourceTypes);

IF EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[ResourceType]
           WHERE [EntityID] IN (SELECT ID FROM #Retired) OR [CategoryEntityID] IN (SELECT ID FROM #Retired))
    THROW 50000, 'Retirement pre-clean: a ResourceType row for a retired entity survived. A new inbound foreign key into ResourceType exists that this migration does not clear.', 1;

-- ── The saved-view run chain ────────────────────────────────────────────────────────────
-- spDeleteEntityWithCoreDependencies deletes the entity's UserView rows, but it has never
-- touched their run history. UserViewRun.UserViewID is NOT NULL and NO_ACTION, so on any
-- database where somebody actually RAN a saved view of one of these entities, the proc's
-- `DELETE FROM UserView` hard-fails -- the same shape of failure as #4483 itself.
--
-- The generic sweep below cannot cover it: UserView.EntityID is deliberately on the sweep's
-- exclusion list (the proc owns that delete, and sweeping it fights the proc's ordering), so
-- UserView's own dependents are never reached from the Entity side at all.
--
-- Cleared here rather than merely detected further down because run history is derived data:
-- a UserViewRun records that a view executed and which record IDs came back. Once the view and
-- its entity are gone the rows describe nothing. That is not the judgement call that deleting
-- conversations or entity documents would be -- those are DETECTED only, see the second-order
-- block below.
--
-- Named tables, dependents first: UserViewRunDetail -> UserViewRun -> UserView (the proc). The
-- postcondition immediately after proves the list is complete on every database that runs this,
-- so a newly added dependent of UserViewRun cannot silently go unhandled.
DECLARE @RetiredUserViews TABLE (ID uniqueidentifier PRIMARY KEY);
INSERT INTO @RetiredUserViews (ID)
SELECT uv.[ID]
FROM [${flyway:defaultSchema}].[UserView] uv
WHERE uv.[EntityID] IN (SELECT ID FROM #Retired);

DELETE FROM [${flyway:defaultSchema}].[UserViewRunDetail]
WHERE [UserViewRunID] IN (SELECT [ID] FROM [${flyway:defaultSchema}].[UserViewRun]
                          WHERE [UserViewID] IN (SELECT ID FROM @RetiredUserViews));
DELETE FROM [${flyway:defaultSchema}].[UserViewRun]
WHERE [UserViewID] IN (SELECT ID FROM @RetiredUserViews);

IF EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[UserViewRun]
           WHERE [UserViewID] IN (SELECT ID FROM @RetiredUserViews))
    THROW 50000, 'Retirement pre-clean: a UserViewRun row for a retired entity''s saved view survived. A new inbound foreign key into UserViewRun exists that this migration does not clear.', 1;

-- ── Generic sweep of every remaining inbound Entity reference ────────────────────────────
-- Discovered from sys.foreign_keys so the whole set is covered rather than the handful the
-- proc knows about. Nullable FK columns are NULLED; NOT NULL columns mean the row itself has
-- to go -- the schema's own statement about whether the child can exist without the parent.
-- DISTINCT because a composite foreign key, or two separate constraints declared on the same
-- column, produce one sys.foreign_key_columns row each and would otherwise put duplicate
-- (schema, table, column) entries into #Refs -- duplicated UPDATEs in pass 1, a table visited
-- twice per attempt in pass 2, and the same name printed twice in the diagnostic below.
-- Matches the same guard in V202609142100's precondition.
SELECT  DISTINCT
        sch       = SCHEMA_NAME(pt.schema_id),
        tblName   = pt.name,
        colName   = pc.name,
        tbl       = QUOTENAME(SCHEMA_NAME(pt.schema_id)) + '.' + QUOTENAME(pt.name),
        col       = QUOTENAME(pc.name),
        nullable  = pc.is_nullable,
        lastError = CAST(NULL AS nvarchar(400))
INTO    #Refs
FROM sys.foreign_keys fk
JOIN sys.tables rt ON rt.object_id = fk.referenced_object_id
     AND rt.name = 'Entity' AND SCHEMA_NAME(rt.schema_id) = '${flyway:defaultSchema}'
JOIN sys.tables pt ON pt.object_id = fk.parent_object_id
JOIN sys.foreign_key_columns fkc ON fkc.constraint_object_id = fk.object_id
JOIN sys.columns pc ON pc.object_id = pt.object_id AND pc.column_id = fkc.parent_column_id
-- Only a NO_ACTION foreign key can block DELETE FROM Entity. CASCADE / SET NULL / SET DEFAULT
-- (delete_referential_action 1/2/3) are cleared by SQL Server itself, and a disabled (NOCHECK'd)
-- constraint is not enforced at all -- so sweeping either kind would delete or null rows the
-- database was going to handle correctly on its own. Same filter, same reason, as
-- V202609142100's precondition, which this list must stay in step with.
WHERE fk.delete_referential_action = 0
  AND fk.is_disabled = 0
  AND NOT (pt.name = 'Entity' AND SCHEMA_NAME(pt.schema_id) = '${flyway:defaultSchema}');
    -- Entity.ParentID is a self-reference, handled after the children below. Schema-qualified
    -- so a same-named table in a DIFFERENT schema with its own FK into Entity is swept, not
    -- silently skipped by matching on the bare name alone.

-- The proc already cascades these 21 correctly, including their own dependents
-- (EntityFieldValue before EntityField, ListDetail before List). Sweeping them here fights
-- that ordering -- an earlier iteration of this block hit repeated FK-ordering failures (error
-- 547) retrying exactly those rows, not a deadlock (a single-connection migration can't
-- deadlock with itself) -- so the sweep covers only what the proc misses. Compared on bare
-- names because the schema is a placeholder; this list mirrors the proc body above and must be
-- kept in step with it.
--
-- ResourceType.CategoryEntityID is deliberately NOT excluded even though the proc now nulls
-- it: the explicit block above should already have removed every affected ResourceType row,
-- and sweeping it too costs nothing and covers the case where one survived.
DELETE r FROM #Refs r
WHERE r.sch = '${flyway:defaultSchema}'
  AND r.tblName + '.' + r.colName IN (
      'EntitySetting.EntityID', 'EntityField.EntityID', 'EntityField.RelatedEntityID',
      'EntityPermission.EntityID', 'EntityRelationship.EntityID', 'EntityRelationship.RelatedEntityID',
      'UserApplicationEntity.EntityID', 'ApplicationEntity.EntityID', 'RecordChange.EntityID',
      'AuditLog.EntityID', 'Conversation.LinkedEntityID', 'List.EntityID',
      'EntityDocument.EntityID', 'CompanyIntegrationRecordMap.EntityID', 'ResourceType.EntityID',
      'DatasetItem.EntityID', 'UserViewCategory.EntityID', 'UserView.EntityID',
      'EntityAIAction.EntityID', 'EntityAIAction.OutputEntityID',
      'EntityCommunicationMessageType.EntityID');

DECLARE @sql nvarchar(max);

-- Every string built from a rowset in this block uses FOR XML PATH(''), TYPE + .value(), never
-- the `SELECT @v = @v + ...` aggregate-concatenation idiom. That idiom has no defined semantics
-- in T-SQL: with a sort, a parallel plan, or a non-trivial expression in the SELECT list the
-- optimizer may visit rows more than once or not at all, and the variable silently ends up with
-- a subset of the rows. Here that would mean a sweep statement never generated, or a blocker
-- never named in the THROW -- a silent under-report by exactly the machinery that exists to stop
-- silence. V202609142100 replaced the same idiom for the same reason.
-- ISNULL(..., N'') reproduces the empty-set behaviour of the old `SET @sql = N''` seed: FOR XML
-- over zero rows returns NULL, and EXEC sp_executesql N'' is a no-op.

-- Pass 1 -- nullable references simply stop pointing at the retired entity.
SET @sql = ISNULL((
    SELECT N'UPDATE ' + tbl + N' SET ' + col + N' = NULL WHERE ' + col
         + N' IN (SELECT ID FROM #Retired);' + CHAR(10)
    FROM #Refs WHERE nullable = 1
    FOR XML PATH(''), TYPE).value('.', 'nvarchar(max)'), N'');
EXEC sp_executesql @sql;

-- Pass 2 -- NOT NULL references mean the row itself must go. Bounded retry loop, because
-- referencing tables have their own dependents and no single pass satisfies every order.
-- @MAX_ATTEMPTS bounds how many FK-ordering levels deep the loop will unwind: each pass clears
-- whichever rows currently have no un-cleared dependent left inside #Refs, so the deepest chain
-- among the ~20 candidate tables here resolves well within 6 passes. A table still blocked
-- after 6 isn't an ordering problem this loop can fix -- its blocker is a dependent OUTSIDE
-- #Refs entirely (nothing in sys.foreign_keys ties that blocker back to Entity, e.g.
-- EntityActionFilter blocking EntityAction), so more attempts would just spin. That is exactly
-- the case the postcondition below exists to catch and name -- NOT to grow into a recursive
-- cascade into dependents-of-dependents, which would delete data this migration was never
-- designed to touch.
DECLARE @attempt int = 0, @MAX_ATTEMPTS int = 6, @removed int = 1, @remaining int = 0;
DECLARE @tbl nvarchar(400), @col nvarchar(200);
WHILE @attempt < @MAX_ATTEMPTS AND @removed > 0
BEGIN
    SET @attempt += 1;
    SET @removed = 0;
    DECLARE c CURSOR LOCAL FAST_FORWARD FOR SELECT tbl, col FROM #Refs WHERE nullable = 0;
    OPEN c;
    FETCH NEXT FROM c INTO @tbl, @col;
    WHILE @@FETCH_STATUS = 0
    BEGIN
        BEGIN TRY
            SET @sql = N'DELETE FROM ' + @tbl + N' WHERE ' + @col + N' IN (SELECT ID FROM #Retired);';
            EXEC sp_executesql @sql;
            SET @removed += @@ROWCOUNT;
        END TRY
        BEGIN CATCH
            -- 547 is a foreign-key ordering problem: either another entry in #Refs clears the
            -- blocker on a later pass, or -- if this table is still blocked when the
            -- postcondition below runs -- the blocker is outside #Refs and unresolvable here.
            -- Record the message either way, so the postcondition can name the actual
            -- constraint instead of leaving the DBA to reverse-engineer it from a bare row
            -- count. Anything other than 547 is unexpected -- rethrow immediately.
            IF ERROR_NUMBER() <> 547 THROW;
            UPDATE #Refs SET lastError = ERROR_MESSAGE() WHERE tbl = @tbl AND col = @col;
        END CATCH
        FETCH NEXT FROM c INTO @tbl, @col;
    END
    CLOSE c;
    DEALLOCATE c;
END

-- Children of a retired entity would otherwise block its delete via Entity.ParentID.
UPDATE [${flyway:defaultSchema}].[Entity] SET ParentID = NULL WHERE ParentID IN (SELECT ID FROM #Retired);

-- ── Second-order blockers: rows pointing at rows the CASCADE itself is about to delete ───
-- Everything above this point is FIRST-ORDER -- references INTO Entity, which sys.foreign_keys
-- can enumerate from Entity. But spDeleteEntityWithCoreDependencies also deletes rows from
-- ~20 other tables (Conversation, EntityDocument, List, UserView, UserViewCategory,
-- RecordChange, ResourceType, ...), and a row referencing one of THOSE rows has no foreign key
-- back to Entity at all. The postcondition below cannot see it, and neither can the proc's own
-- precondition in V202609142100. It surfaces only when the generated block further down runs
-- the cascade and dies mid-way on a bare constraint name, with the entity's fields, permissions
-- and relationships already stripped -- the half-pruned state #3546 describes.
--
-- So: find them from the catalog and THROW, naming schema.table.column and what each one is
-- blocking, while the migration can still abort cleanly and roll back.
--
-- DETECTION ONLY -- deliberately does NOT delete these rows. They are conversation history,
-- agent sessions, entity documents: user data. Destroying them is an operator's decision, not
-- a side effect of an upgrade, and it is explicitly out of scope here. Turning an opaque
-- mid-cascade 547 into "clear exactly these rows first" is the entire value of this step.

-- The cascade's own Entity-scoped DELETE targets, as (table, column) pairs -- this mirrors the
-- proc body above. EntityFieldValue (scoped by EntityFieldID) and ListDetail (scoped by ListID)
-- are absent on purpose: they are dependents the proc clears BEFORE their parent, so they never
-- block it. They are the only two such cases, and they are excluded by name below.
SELECT tblName = CONVERT(nvarchar(128), v.t), colName = CONVERT(nvarchar(128), v.c)
INTO   #ProcScoped
FROM (VALUES
    ('Conversation','LinkedEntityID'),           ('EntityDocument','EntityID'),
    ('List','EntityID'),                         ('UserView','EntityID'),
    ('UserViewCategory','EntityID'),             ('RecordChange','EntityID'),
    ('ResourceType','EntityID'),                 ('AuditLog','EntityID'),
    ('DatasetItem','EntityID'),                  ('CompanyIntegrationRecordMap','EntityID'),
    ('ApplicationEntity','EntityID'),            ('UserApplicationEntity','EntityID'),
    ('EntitySetting','EntityID'),                ('EntityPermission','EntityID'),
    ('EntityField','EntityID'),                  ('EntityRelationship','EntityID'),
    ('EntityRelationship','RelatedEntityID'),    ('EntityAIAction','EntityID'),
    ('EntityAIAction','OutputEntityID'),         ('EntityCommunicationMessageType','EntityID')
) v(t, c);

-- Two predicate fragments per scoped table, differing only in the alias they are written for:
--   predT  (alias t) -- "this target row IS about to be deleted"
--   predPN (alias p) -- "this referencing row is NOT itself about to be deleted"
-- predPN is written in negated, NULL-safe form (`IS NULL OR NOT IN`) rather than as NOT(predT):
-- `NULL NOT IN (...)` is UNKNOWN, and NOT(UNKNOWN) is UNKNOWN, which would drop every row whose
-- scope column is NULL -- precisely the rows that are NOT being deleted and so DO block.
-- A table with two scope columns (EntityRelationship, EntityAIAction) gets both, OR'd / AND'd.
SELECT d.tblName,
       predT  = STUFF((SELECT N' OR t.' + QUOTENAME(x.colName) + N' IN (SELECT ID FROM #Retired)'
                       FROM #ProcScoped x WHERE x.tblName = d.tblName
                       ORDER BY x.colName
                       FOR XML PATH(''), TYPE).value('.', 'nvarchar(max)'), 1, 4, N''),
       predPN = STUFF((SELECT N' AND (p.' + QUOTENAME(x.colName) + N' IS NULL OR p.'
                            + QUOTENAME(x.colName) + N' NOT IN (SELECT ID FROM #Retired))'
                       FROM #ProcScoped x WHERE x.tblName = d.tblName
                       ORDER BY x.colName
                       FOR XML PATH(''), TYPE).value('.', 'nvarchar(max)'), 1, 5, N'')
INTO   #ScopePred
FROM   (SELECT DISTINCT tblName FROM #ProcScoped) d;

-- Every inbound foreign key pointing AT one of those tables. Same NO_ACTION / not-disabled
-- filter as #Refs above, and for the same reason: a CASCADE or SET NULL foreign key is cleared
-- by SQL Server during the cascade and never blocks it, so reporting one would be a false alarm
-- that an operator cannot act on.
-- COLLATE DATABASE_DEFAULT on the catalog side: sys.tables.name is sysname in the catalog's own
-- collation, while #ProcScoped holds string literals in the database's -- which differ on a
-- stock MJ database and raise "Cannot resolve collation conflict" without this.
SELECT DISTINCT
       pSch = SCHEMA_NAME(pt.schema_id),
       pTbl = pt.name,
       pCol = pc.name,
       tTbl = rt.name,
       pQ   = QUOTENAME(SCHEMA_NAME(pt.schema_id)) + '.' + QUOTENAME(pt.name),
       pC   = QUOTENAME(pc.name),
       tQ   = QUOTENAME('${flyway:defaultSchema}') + '.' + QUOTENAME(rt.name),
       tC   = QUOTENAME(rc.name)
INTO   #SecondOrder
FROM sys.foreign_keys fk
JOIN sys.tables rt ON rt.object_id = fk.referenced_object_id
     AND SCHEMA_NAME(rt.schema_id) = '${flyway:defaultSchema}'
JOIN sys.tables pt ON pt.object_id = fk.parent_object_id
JOIN sys.foreign_key_columns fkc ON fkc.constraint_object_id = fk.object_id
JOIN sys.columns pc ON pc.object_id = pt.object_id AND pc.column_id = fkc.parent_column_id
JOIN sys.columns rc ON rc.object_id = rt.object_id AND rc.column_id = fkc.referenced_column_id
JOIN #ProcScoped tgt ON tgt.tblName = rt.name COLLATE DATABASE_DEFAULT
WHERE fk.delete_referential_action = 0
  AND fk.is_disabled = 0
  AND NOT (SCHEMA_NAME(pt.schema_id) = '${flyway:defaultSchema}'
           AND pt.name + '.' + pc.name IN ('EntityFieldValue.EntityFieldID', 'ListDetail.ListID'));

CREATE TABLE #Blocked (pSch nvarchar(128) COLLATE DATABASE_DEFAULT,
                       pTbl nvarchar(128) COLLATE DATABASE_DEFAULT,
                       pCol nvarchar(128) COLLATE DATABASE_DEFAULT,
                       tTbl nvarchar(128) COLLATE DATABASE_DEFAULT,
                       cnt  int);
SET @sql = N'SELECT CAST(NULL AS nvarchar(128)) pSch, CAST(NULL AS nvarchar(128)) pTbl,'
         + N' CAST(NULL AS nvarchar(128)) pCol, CAST(NULL AS nvarchar(128)) tTbl, 0 AS cnt WHERE 1 = 0'
         + ISNULL((
             SELECT N' UNION ALL SELECT ''' + REPLACE(s.pSch, '''', '''''') + N''', '''
                  + REPLACE(s.pTbl, '''', '''''') + N''', ''' + REPLACE(s.pCol, '''', '''''')
                  + N''', ''' + REPLACE(s.tTbl, '''', '''''') + N''', COUNT(*) FROM '
                  + s.pQ + N' p WHERE p.' + s.pC + N' IN (SELECT t.' + s.tC + N' FROM '
                  + s.tQ + N' t WHERE ' + tp.predT + N')'
                  + ISNULL(N' AND ' + pp.predPN, N'')
             FROM #SecondOrder s
             JOIN      #ScopePred tp ON tp.tblName = s.tTbl COLLATE DATABASE_DEFAULT
             LEFT JOIN #ScopePred pp ON pp.tblName = s.pTbl COLLATE DATABASE_DEFAULT
             FOR XML PATH(''), TYPE).value('.', 'nvarchar(max)'), N'');
SET @sql = N'INSERT INTO #Blocked (pSch, pTbl, pCol, tTbl, cnt) SELECT pSch, pTbl, pCol, tTbl, cnt FROM ('
         + @sql + N') x WHERE cnt > 0;';
EXEC sp_executesql @sql;

IF EXISTS (SELECT 1 FROM #Blocked)
BEGIN
    -- Same shape as the first-order diagnostic below, plus the table each reference is blocking,
    -- because "ConversationDetail.ConversationID" alone does not say why a Reports retirement
    -- cares. Truncated well inside THROW's nvarchar(2048) limit: the fixed text either side of
    -- @diag2 is ~400 characters.
    DECLARE @diag2 nvarchar(2048) = ISNULL(STUFF((
        SELECT N'; ' + b.pSch + N'.' + b.pTbl + N'.' + b.pCol + N' -> ' + b.tTbl
             + N' (' + CAST(b.cnt AS nvarchar(20))
             + CASE WHEN b.cnt = 1 THEN N' row)' ELSE N' rows)' END
        FROM #Blocked b
        ORDER BY b.pSch, b.pTbl, b.pCol
        FOR XML PATH(''), TYPE).value('.', 'nvarchar(max)'), 1, 2, N''), N'');
    SET @diag2 = LEFT(@diag2, 1500);

    DECLARE @msg2 nvarchar(2048) = N'Retirement pre-clean: rows reference records that the '
        + N'entity-deletion cascade is about to delete for the retired entities. They would fail '
        + N'it mid-way and leave the metadata half-pruned, so the migration stops here instead. '
        + N'Blocking (referencing table.column -> table being cleared): ' + @diag2
        + N'. Clear these rows, then re-run the migration; this migration will not delete them '
        + N'for you -- they are user data.';
    THROW 50000, @msg2, 1;
END

DROP TABLE #Blocked;
DROP TABLE #SecondOrder;
DROP TABLE #ScopePred;
DROP TABLE #ProcScoped;

-- Postcondition -- nothing THIS BLOCK is responsible for (every entry in #Refs, i.e. every
-- inbound FK to Entity that the proc above does not already cascade) may still point at a
-- retired entity. It does not re-check Entity.ParentID (nulled unconditionally just above) or
-- the ResourceType/dependent tables (already asserted clean earlier in this batch). If the
-- bounded loop above ran out of attempts, this is what stops the migration from committing a
-- half-pruned database (the silent state #3546 describes) -- and names exactly what's still
-- blocking it (table, column, row count, and the last FK error observed against it), so the
-- failure is actionable instead of context-free.
CREATE TABLE #Remaining (sch nvarchar(128), tblName nvarchar(128), colName nvarchar(128), cnt int);
SET @sql = N'SELECT CAST(NULL AS nvarchar(128)) sch, CAST(NULL AS nvarchar(128)) tblName,'
         + N' CAST(NULL AS nvarchar(128)) colName, 0 AS cnt WHERE 1 = 0'
         + ISNULL((
             SELECT N' UNION ALL SELECT ''' + REPLACE(sch, '''', '''''') + N''', '''
                  + REPLACE(tblName, '''', '''''') + N''', ''' + REPLACE(colName, '''', '''''')
                  + N''', COUNT(*) FROM ' + tbl + N' WHERE ' + col + N' IN (SELECT ID FROM #Retired)'
             FROM #Refs
             FOR XML PATH(''), TYPE).value('.', 'nvarchar(max)'), N'');
SET @sql = N'INSERT INTO #Remaining (sch, tblName, colName, cnt) SELECT sch, tblName, colName, cnt FROM ('
         + @sql + N') x WHERE cnt > 0;';
EXEC sp_executesql @sql;

SET @remaining = ISNULL((SELECT SUM(cnt) FROM #Remaining), 0);
IF @remaining > 0
BEGIN
    -- Name what's still blocking, the same way the ResourceType guard earlier in this batch
    -- does, instead of the context-free message this used to throw. Truncated to stay inside
    -- THROW's nvarchar(2048) limit if an unusually large number of tables are ever involved.
    -- STUFF(..., 1, 2, N'') drops the leading '; ' of the first entry, which is what the old
    -- CASE WHEN @diag = N'' guard did positionally. This accumulator carried an ORDER BY, the
    -- form of `SELECT @v = @v + ...` Microsoft documents as specifically unreliable.
    DECLARE @diag nvarchar(2048) = ISNULL(STUFF((
        SELECT N'; ' + r.sch + N'.' + r.tblName + N'.' + r.colName + N' (' + CAST(r.cnt AS nvarchar(20))
             + CASE WHEN r.cnt = 1 THEN N' row)' ELSE N' rows)' END
             + ISNULL(N' [' + LEFT(f.lastError, 100) + N']', N'')
        FROM #Remaining r
        LEFT JOIN #Refs f ON f.sch = r.sch AND f.tblName = r.tblName AND f.colName = r.colName
        ORDER BY r.sch, r.tblName, r.colName
        FOR XML PATH(''), TYPE).value('.', 'nvarchar(max)'), 1, 2, N''), N'');
    SET @diag = LEFT(@diag, 1800);

    DECLARE @msg nvarchar(2048) = N'Retirement pre-clean could not clear all inbound references '
        + N'to the retired entities; aborting rather than half-pruning the metadata. Still '
        + N'referencing: ' + @diag + N'. Clear these rows, then re-run the migration.';
    THROW 50000, @msg, 1;
END

DROP TABLE #Remaining;
DROP TABLE #Refs;
DROP TABLE #Retired;
GO


















































/*
================================================================================================
================================================================================================
====                                                                                        ====
====                  GENERATED BY THE MEMBERJUNCTION CODEGEN TOOL                          ====
====                          DO NOT EDIT BY HAND                                           ====
====                                                                                        ====
================================================================================================
================================================================================================

Everything below this block was produced by `mj codegen` against a CLEAN database built by
running every migration in ./migrations through and including the hand-written DDL above,
followed by `mj sync push --dir metadata`. It is the generated counterpart of that DDL.

WHAT IT CONTAINS
  * Removal of the 11 retired entities' metadata (spDeleteEntityWithCoreDependencies) and of
    their generated views and spCreate/spUpdate/spDelete procedures.
  * Two new EntityField rows for ContentSource — ScheduledJobID (the new FK) and ScheduledJob
    (its denormalized name) — plus the related-entity-name-field-map update for them.
  * The regenerated vwContentSources base view and ContentSource CRUD procedures, which the
    hand DDL above invalidated when it swapped ScheduledActionID for ScheduledJobID.

Verified on generation: every statement is attributable to the DDL above — there is no
unrelated fresh-install regeneration (no validator functions, no form-layout churn), and the
output references ${flyway:defaultSchema} throughout with no hardcoded schema name.

IF THE HAND-WRITTEN DDL ABOVE CHANGES, DO NOT PATCH THIS SECTION BY HAND.
Re-run CodeGen against a clean database and replace this entire generated section wholesale.
================================================================================================
*/

/* SQL text to remove entity MJ: Scheduled Actions */
EXEC [${flyway:defaultSchema}].[spDeleteEntityWithCoreDependencies] @EntityID='12CD5A5D-A83B-EF11-86D4-0022481D1B23';

/* SQL text to remove view ${flyway:defaultSchema}.vwScheduledActions */
IF OBJECT_ID('[${flyway:defaultSchema}].[vwScheduledActions]', 'V') IS NOT NULL
    DROP VIEW [${flyway:defaultSchema}].[vwScheduledActions];

/* SQL text to remove procedure ${flyway:defaultSchema}.spCreateScheduledAction */
IF OBJECT_ID('[${flyway:defaultSchema}].[spCreateScheduledAction]', 'P') IS NOT NULL
    DROP PROCEDURE [${flyway:defaultSchema}].[spCreateScheduledAction];

/* SQL text to remove procedure ${flyway:defaultSchema}.spDeleteScheduledAction */
IF OBJECT_ID('[${flyway:defaultSchema}].[spDeleteScheduledAction]', 'P') IS NOT NULL
    DROP PROCEDURE [${flyway:defaultSchema}].[spDeleteScheduledAction];

/* SQL text to remove procedure ${flyway:defaultSchema}.spUpdateScheduledAction */
IF OBJECT_ID('[${flyway:defaultSchema}].[spUpdateScheduledAction]', 'P') IS NOT NULL
    DROP PROCEDURE [${flyway:defaultSchema}].[spUpdateScheduledAction];

/* SQL text to remove entity MJ: Scheduled Action Params */
EXEC [${flyway:defaultSchema}].[spDeleteEntityWithCoreDependencies] @EntityID='58E4EE77-0A3C-EF11-86D4-0022481D1B23';

/* SQL text to remove view ${flyway:defaultSchema}.vwScheduledActionParams */
IF OBJECT_ID('[${flyway:defaultSchema}].[vwScheduledActionParams]', 'V') IS NOT NULL
    DROP VIEW [${flyway:defaultSchema}].[vwScheduledActionParams];

/* SQL text to remove procedure ${flyway:defaultSchema}.spCreateScheduledActionParam */
IF OBJECT_ID('[${flyway:defaultSchema}].[spCreateScheduledActionParam]', 'P') IS NOT NULL
    DROP PROCEDURE [${flyway:defaultSchema}].[spCreateScheduledActionParam];

/* SQL text to remove procedure ${flyway:defaultSchema}.spDeleteScheduledActionParam */
IF OBJECT_ID('[${flyway:defaultSchema}].[spDeleteScheduledActionParam]', 'P') IS NOT NULL
    DROP PROCEDURE [${flyway:defaultSchema}].[spDeleteScheduledActionParam];

/* SQL text to remove procedure ${flyway:defaultSchema}.spUpdateScheduledActionParam */
IF OBJECT_ID('[${flyway:defaultSchema}].[spUpdateScheduledActionParam]', 'P') IS NOT NULL
    DROP PROCEDURE [${flyway:defaultSchema}].[spUpdateScheduledActionParam];

/* SQL text to remove entity MJ: Workflow Runs */
EXEC [${flyway:defaultSchema}].[spDeleteEntityWithCoreDependencies] @EntityID='F2238F34-2837-EF11-86D4-6045BDEE16E6';

/* SQL text to remove procedure ${flyway:defaultSchema}.spCreateWorkflowRun */
IF OBJECT_ID('[${flyway:defaultSchema}].[spCreateWorkflowRun]', 'P') IS NOT NULL
    DROP PROCEDURE [${flyway:defaultSchema}].[spCreateWorkflowRun];

/* SQL text to remove procedure ${flyway:defaultSchema}.spDeleteWorkflowRun */
IF OBJECT_ID('[${flyway:defaultSchema}].[spDeleteWorkflowRun]', 'P') IS NOT NULL
    DROP PROCEDURE [${flyway:defaultSchema}].[spDeleteWorkflowRun];

/* SQL text to remove procedure ${flyway:defaultSchema}.spUpdateWorkflowRun */
IF OBJECT_ID('[${flyway:defaultSchema}].[spUpdateWorkflowRun]', 'P') IS NOT NULL
    DROP PROCEDURE [${flyway:defaultSchema}].[spUpdateWorkflowRun];

/* SQL text to remove entity MJ: Workflows */
EXEC [${flyway:defaultSchema}].[spDeleteEntityWithCoreDependencies] @EntityID='F3238F34-2837-EF11-86D4-6045BDEE16E6';

/* SQL text to remove procedure ${flyway:defaultSchema}.spCreateWorkflow */
IF OBJECT_ID('[${flyway:defaultSchema}].[spCreateWorkflow]', 'P') IS NOT NULL
    DROP PROCEDURE [${flyway:defaultSchema}].[spCreateWorkflow];

/* SQL text to remove procedure ${flyway:defaultSchema}.spDeleteWorkflow */
IF OBJECT_ID('[${flyway:defaultSchema}].[spDeleteWorkflow]', 'P') IS NOT NULL
    DROP PROCEDURE [${flyway:defaultSchema}].[spDeleteWorkflow];

/* SQL text to remove procedure ${flyway:defaultSchema}.spUpdateWorkflow */
IF OBJECT_ID('[${flyway:defaultSchema}].[spUpdateWorkflow]', 'P') IS NOT NULL
    DROP PROCEDURE [${flyway:defaultSchema}].[spUpdateWorkflow];

/* SQL text to remove entity MJ: Workflow Engines */
EXEC [${flyway:defaultSchema}].[spDeleteEntityWithCoreDependencies] @EntityID='F4238F34-2837-EF11-86D4-6045BDEE16E6';

/* SQL text to remove view ${flyway:defaultSchema}.vwWorkflowEngines */
IF OBJECT_ID('[${flyway:defaultSchema}].[vwWorkflowEngines]', 'V') IS NOT NULL
    DROP VIEW [${flyway:defaultSchema}].[vwWorkflowEngines];

/* SQL text to remove procedure ${flyway:defaultSchema}.spCreateWorkflowEngine */
IF OBJECT_ID('[${flyway:defaultSchema}].[spCreateWorkflowEngine]', 'P') IS NOT NULL
    DROP PROCEDURE [${flyway:defaultSchema}].[spCreateWorkflowEngine];

/* SQL text to remove procedure ${flyway:defaultSchema}.spDeleteWorkflowEngine */
IF OBJECT_ID('[${flyway:defaultSchema}].[spDeleteWorkflowEngine]', 'P') IS NOT NULL
    DROP PROCEDURE [${flyway:defaultSchema}].[spDeleteWorkflowEngine];

/* SQL text to remove procedure ${flyway:defaultSchema}.spUpdateWorkflowEngine */
IF OBJECT_ID('[${flyway:defaultSchema}].[spUpdateWorkflowEngine]', 'P') IS NOT NULL
    DROP PROCEDURE [${flyway:defaultSchema}].[spUpdateWorkflowEngine];

/* SQL text to remove entity MJ: Output Trigger Types */
EXEC [${flyway:defaultSchema}].[spDeleteEntityWithCoreDependencies] @EntityID='06248F34-2837-EF11-86D4-6045BDEE16E6';

/* SQL text to remove view ${flyway:defaultSchema}.vwOutputTriggerTypes */
IF OBJECT_ID('[${flyway:defaultSchema}].[vwOutputTriggerTypes]', 'V') IS NOT NULL
    DROP VIEW [${flyway:defaultSchema}].[vwOutputTriggerTypes];

/* SQL text to remove procedure ${flyway:defaultSchema}.spCreateOutputTriggerType */
IF OBJECT_ID('[${flyway:defaultSchema}].[spCreateOutputTriggerType]', 'P') IS NOT NULL
    DROP PROCEDURE [${flyway:defaultSchema}].[spCreateOutputTriggerType];

/* SQL text to remove procedure ${flyway:defaultSchema}.spDeleteOutputTriggerType */
IF OBJECT_ID('[${flyway:defaultSchema}].[spDeleteOutputTriggerType]', 'P') IS NOT NULL
    DROP PROCEDURE [${flyway:defaultSchema}].[spDeleteOutputTriggerType];

/* SQL text to remove procedure ${flyway:defaultSchema}.spUpdateOutputTriggerType */
IF OBJECT_ID('[${flyway:defaultSchema}].[spUpdateOutputTriggerType]', 'P') IS NOT NULL
    DROP PROCEDURE [${flyway:defaultSchema}].[spUpdateOutputTriggerType];

/* SQL text to remove entity MJ: Reports */
EXEC [${flyway:defaultSchema}].[spDeleteEntityWithCoreDependencies] @EntityID='09248F34-2837-EF11-86D4-6045BDEE16E6';

/* SQL text to remove view ${flyway:defaultSchema}.vwReports */
IF OBJECT_ID('[${flyway:defaultSchema}].[vwReports]', 'V') IS NOT NULL
    DROP VIEW [${flyway:defaultSchema}].[vwReports];

/* SQL text to remove procedure ${flyway:defaultSchema}.spCreateReport */
IF OBJECT_ID('[${flyway:defaultSchema}].[spCreateReport]', 'P') IS NOT NULL
    DROP PROCEDURE [${flyway:defaultSchema}].[spCreateReport];

/* SQL text to remove procedure ${flyway:defaultSchema}.spDeleteReport */
IF OBJECT_ID('[${flyway:defaultSchema}].[spDeleteReport]', 'P') IS NOT NULL
    DROP PROCEDURE [${flyway:defaultSchema}].[spDeleteReport];

/* SQL text to remove procedure ${flyway:defaultSchema}.spUpdateReport */
IF OBJECT_ID('[${flyway:defaultSchema}].[spUpdateReport]', 'P') IS NOT NULL
    DROP PROCEDURE [${flyway:defaultSchema}].[spUpdateReport];

/* SQL text to remove entity MJ: Report Snapshots */
EXEC [${flyway:defaultSchema}].[spDeleteEntityWithCoreDependencies] @EntityID='0A248F34-2837-EF11-86D4-6045BDEE16E6';

/* SQL text to remove view ${flyway:defaultSchema}.vwReportSnapshots */
IF OBJECT_ID('[${flyway:defaultSchema}].[vwReportSnapshots]', 'V') IS NOT NULL
    DROP VIEW [${flyway:defaultSchema}].[vwReportSnapshots];

/* SQL text to remove procedure ${flyway:defaultSchema}.spCreateReportSnapshot */
IF OBJECT_ID('[${flyway:defaultSchema}].[spCreateReportSnapshot]', 'P') IS NOT NULL
    DROP PROCEDURE [${flyway:defaultSchema}].[spCreateReportSnapshot];

/* SQL text to remove procedure ${flyway:defaultSchema}.spDeleteReportSnapshot */
IF OBJECT_ID('[${flyway:defaultSchema}].[spDeleteReportSnapshot]', 'P') IS NOT NULL
    DROP PROCEDURE [${flyway:defaultSchema}].[spDeleteReportSnapshot];

/* SQL text to remove procedure ${flyway:defaultSchema}.spUpdateReportSnapshot */
IF OBJECT_ID('[${flyway:defaultSchema}].[spUpdateReportSnapshot]', 'P') IS NOT NULL
    DROP PROCEDURE [${flyway:defaultSchema}].[spUpdateReportSnapshot];

/* SQL text to remove entity MJ: Report Categories */
EXEC [${flyway:defaultSchema}].[spDeleteEntityWithCoreDependencies] @EntityID='27248F34-2837-EF11-86D4-6045BDEE16E6';

/* SQL text to remove view ${flyway:defaultSchema}.vwReportCategories */
IF OBJECT_ID('[${flyway:defaultSchema}].[vwReportCategories]', 'V') IS NOT NULL
    DROP VIEW [${flyway:defaultSchema}].[vwReportCategories];

/* SQL text to remove procedure ${flyway:defaultSchema}.spCreateReportCategory */
IF OBJECT_ID('[${flyway:defaultSchema}].[spCreateReportCategory]', 'P') IS NOT NULL
    DROP PROCEDURE [${flyway:defaultSchema}].[spCreateReportCategory];

/* SQL text to remove procedure ${flyway:defaultSchema}.spDeleteReportCategory */
IF OBJECT_ID('[${flyway:defaultSchema}].[spDeleteReportCategory]', 'P') IS NOT NULL
    DROP PROCEDURE [${flyway:defaultSchema}].[spDeleteReportCategory];

/* SQL text to remove procedure ${flyway:defaultSchema}.spUpdateReportCategory */
IF OBJECT_ID('[${flyway:defaultSchema}].[spUpdateReportCategory]', 'P') IS NOT NULL
    DROP PROCEDURE [${flyway:defaultSchema}].[spUpdateReportCategory];

/* SQL text to remove entity MJ: Report User States */
EXEC [${flyway:defaultSchema}].[spDeleteEntityWithCoreDependencies] @EntityID='4A4C2EE1-BFDD-434E-9A03-6F6C2384D01F';

/* SQL text to remove view ${flyway:defaultSchema}.vwReportUserStates */
IF OBJECT_ID('[${flyway:defaultSchema}].[vwReportUserStates]', 'V') IS NOT NULL
    DROP VIEW [${flyway:defaultSchema}].[vwReportUserStates];

/* SQL text to remove procedure ${flyway:defaultSchema}.spCreateReportUserState */
IF OBJECT_ID('[${flyway:defaultSchema}].[spCreateReportUserState]', 'P') IS NOT NULL
    DROP PROCEDURE [${flyway:defaultSchema}].[spCreateReportUserState];

/* SQL text to remove procedure ${flyway:defaultSchema}.spDeleteReportUserState */
IF OBJECT_ID('[${flyway:defaultSchema}].[spDeleteReportUserState]', 'P') IS NOT NULL
    DROP PROCEDURE [${flyway:defaultSchema}].[spDeleteReportUserState];

/* SQL text to remove procedure ${flyway:defaultSchema}.spUpdateReportUserState */
IF OBJECT_ID('[${flyway:defaultSchema}].[spUpdateReportUserState]', 'P') IS NOT NULL
    DROP PROCEDURE [${flyway:defaultSchema}].[spUpdateReportUserState];

/* SQL text to remove entity MJ: Report Versions */
EXEC [${flyway:defaultSchema}].[spDeleteEntityWithCoreDependencies] @EntityID='9516058D-9729-48EC-B0B8-E91A8221FC8F';

/* SQL text to remove view ${flyway:defaultSchema}.vwReportVersions */
IF OBJECT_ID('[${flyway:defaultSchema}].[vwReportVersions]', 'V') IS NOT NULL
    DROP VIEW [${flyway:defaultSchema}].[vwReportVersions];

/* SQL text to remove procedure ${flyway:defaultSchema}.spCreateReportVersion */
IF OBJECT_ID('[${flyway:defaultSchema}].[spCreateReportVersion]', 'P') IS NOT NULL
    DROP PROCEDURE [${flyway:defaultSchema}].[spCreateReportVersion];

/* SQL text to remove procedure ${flyway:defaultSchema}.spDeleteReportVersion */
IF OBJECT_ID('[${flyway:defaultSchema}].[spDeleteReportVersion]', 'P') IS NOT NULL
    DROP PROCEDURE [${flyway:defaultSchema}].[spDeleteReportVersion];

/* SQL text to remove procedure ${flyway:defaultSchema}.spUpdateReportVersion */
IF OBJECT_ID('[${flyway:defaultSchema}].[spUpdateReportVersion]', 'P') IS NOT NULL
    DROP PROCEDURE [${flyway:defaultSchema}].[spUpdateReportVersion];

/* SQL text to insert 8 new entity field(s) */

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '80731e62-5565-4cff-9d75-faecee04174c' OR (EntityID = 'B420FF22-0E66-EF11-A752-C0A5E8ACCB22' AND Name = 'ScheduledJobID')) BEGIN
         INSERT INTO [${flyway:defaultSchema}].[EntityField]
         (
            [ID],
            [EntityID],
            [Sequence],
            [Name],
            [DisplayName],
            [Description],
            [Type],
            [Length],
            [Precision],
            [Scale],
            [AllowsNull],
            [DefaultValue],
            [AutoIncrement],
            [AllowUpdateAPI],
            [IsVirtual],
            [IsComputed],
            [RelatedEntityID],
            [RelatedEntityFieldName],
            [IsNameField],
            [IncludeInUserSearchAPI],
            [IncludeRelatedEntityNameFieldInBaseView],
            [DefaultInView],
            [IsPrimaryKey],
            [IsUnique],
            [RelatedEntityDisplayType],
            [__mj_CreatedAt],
            [__mj_UpdatedAt]
         )
         VALUES
         (
            '80731e62-5565-4cff-9d75-faecee04174c',
            'B420FF22-0E66-EF11-A752-C0A5E8ACCB22', -- Entity: MJ: Content Sources
            100032,
            'ScheduledJobID',
            'Scheduled Job ID',
            'Optional link to the Scheduled Job that runs this content source on a recurring basis. Replaces the retired ScheduledActionID link; the job is of type Action and carries its action + parameters in ScheduledJob.Configuration.',
            'uniqueidentifier',
            16,
            0,
            0,
            1,
            NULL,
            0,
            1,
            0,
            0,
            'F48D2E6C-61C8-46B8-A617-C8228601EB3C',
            'ID',
            0,
            0,
            1,
            0,
            0,
            0,
            'Search',
            GETUTCDATE(),
            GETUTCDATE()
         )
      END;

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '5d0d1c7b-ee57-4c57-882e-ee26eaa71d98' OR (EntityID = 'B420FF22-0E66-EF11-A752-C0A5E8ACCB22' AND Name = 'ContentType')) BEGIN
         INSERT INTO [${flyway:defaultSchema}].[EntityField]
         (
            [ID],
            [EntityID],
            [Sequence],
            [Name],
            [DisplayName],
            [Description],
            [Type],
            [Length],
            [Precision],
            [Scale],
            [AllowsNull],
            [DefaultValue],
            [AutoIncrement],
            [AllowUpdateAPI],
            [IsVirtual],
            [IsComputed],
            [RelatedEntityID],
            [RelatedEntityFieldName],
            [IsNameField],
            [IncludeInUserSearchAPI],
            [IncludeRelatedEntityNameFieldInBaseView],
            [DefaultInView],
            [IsPrimaryKey],
            [IsUnique],
            [RelatedEntityDisplayType],
            [__mj_CreatedAt],
            [__mj_UpdatedAt]
         )
         VALUES
         (
            '5d0d1c7b-ee57-4c57-882e-ee26eaa71d98',
            'B420FF22-0E66-EF11-A752-C0A5E8ACCB22', -- Entity: MJ: Content Sources
            100033,
            'ContentType',
            'Content Type',
            NULL,
            'nvarchar',
            510,
            0,
            0,
            0,
            NULL,
            0,
            0,
            1,
            0,
            NULL,
            NULL,
            0,
            0,
            0,
            0,
            0,
            0,
            'Search',
            GETUTCDATE(),
            GETUTCDATE()
         )
      END;

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '945c4930-b4b0-4f5e-8dfb-5e32cfbc041a' OR (EntityID = 'B420FF22-0E66-EF11-A752-C0A5E8ACCB22' AND Name = 'ContentSourceType')) BEGIN
         INSERT INTO [${flyway:defaultSchema}].[EntityField]
         (
            [ID],
            [EntityID],
            [Sequence],
            [Name],
            [DisplayName],
            [Description],
            [Type],
            [Length],
            [Precision],
            [Scale],
            [AllowsNull],
            [DefaultValue],
            [AutoIncrement],
            [AllowUpdateAPI],
            [IsVirtual],
            [IsComputed],
            [RelatedEntityID],
            [RelatedEntityFieldName],
            [IsNameField],
            [IncludeInUserSearchAPI],
            [IncludeRelatedEntityNameFieldInBaseView],
            [DefaultInView],
            [IsPrimaryKey],
            [IsUnique],
            [RelatedEntityDisplayType],
            [__mj_CreatedAt],
            [__mj_UpdatedAt]
         )
         VALUES
         (
            '945c4930-b4b0-4f5e-8dfb-5e32cfbc041a',
            'B420FF22-0E66-EF11-A752-C0A5E8ACCB22', -- Entity: MJ: Content Sources
            100034,
            'ContentSourceType',
            'Content Source Type',
            NULL,
            'nvarchar',
            510,
            0,
            0,
            0,
            NULL,
            0,
            0,
            1,
            0,
            NULL,
            NULL,
            0,
            0,
            0,
            0,
            0,
            0,
            'Search',
            GETUTCDATE(),
            GETUTCDATE()
         )
      END;

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '4d41567a-2390-45f1-8946-61dd1b0f0fc5' OR (EntityID = 'B420FF22-0E66-EF11-A752-C0A5E8ACCB22' AND Name = 'ContentFileType')) BEGIN
         INSERT INTO [${flyway:defaultSchema}].[EntityField]
         (
            [ID],
            [EntityID],
            [Sequence],
            [Name],
            [DisplayName],
            [Description],
            [Type],
            [Length],
            [Precision],
            [Scale],
            [AllowsNull],
            [DefaultValue],
            [AutoIncrement],
            [AllowUpdateAPI],
            [IsVirtual],
            [IsComputed],
            [RelatedEntityID],
            [RelatedEntityFieldName],
            [IsNameField],
            [IncludeInUserSearchAPI],
            [IncludeRelatedEntityNameFieldInBaseView],
            [DefaultInView],
            [IsPrimaryKey],
            [IsUnique],
            [RelatedEntityDisplayType],
            [__mj_CreatedAt],
            [__mj_UpdatedAt]
         )
         VALUES
         (
            '4d41567a-2390-45f1-8946-61dd1b0f0fc5',
            'B420FF22-0E66-EF11-A752-C0A5E8ACCB22', -- Entity: MJ: Content Sources
            100035,
            'ContentFileType',
            'Content File Type',
            NULL,
            'nvarchar',
            510,
            0,
            0,
            0,
            NULL,
            0,
            0,
            1,
            0,
            NULL,
            NULL,
            0,
            0,
            0,
            0,
            0,
            0,
            'Search',
            GETUTCDATE(),
            GETUTCDATE()
         )
      END;

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '81ac4181-080e-4240-b179-1e6c614d5a6f' OR (EntityID = 'B420FF22-0E66-EF11-A752-C0A5E8ACCB22' AND Name = 'EmbeddingModel')) BEGIN
         INSERT INTO [${flyway:defaultSchema}].[EntityField]
         (
            [ID],
            [EntityID],
            [Sequence],
            [Name],
            [DisplayName],
            [Description],
            [Type],
            [Length],
            [Precision],
            [Scale],
            [AllowsNull],
            [DefaultValue],
            [AutoIncrement],
            [AllowUpdateAPI],
            [IsVirtual],
            [IsComputed],
            [RelatedEntityID],
            [RelatedEntityFieldName],
            [IsNameField],
            [IncludeInUserSearchAPI],
            [IncludeRelatedEntityNameFieldInBaseView],
            [DefaultInView],
            [IsPrimaryKey],
            [IsUnique],
            [RelatedEntityDisplayType],
            [__mj_CreatedAt],
            [__mj_UpdatedAt]
         )
         VALUES
         (
            '81ac4181-080e-4240-b179-1e6c614d5a6f',
            'B420FF22-0E66-EF11-A752-C0A5E8ACCB22', -- Entity: MJ: Content Sources
            100036,
            'EmbeddingModel',
            'Embedding Model',
            NULL,
            'nvarchar',
            100,
            0,
            0,
            1,
            NULL,
            0,
            0,
            1,
            0,
            NULL,
            NULL,
            0,
            0,
            0,
            0,
            0,
            0,
            'Search',
            GETUTCDATE(),
            GETUTCDATE()
         )
      END;

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = 'cbb79f88-3b83-4064-be73-18b36f2a5108' OR (EntityID = 'B420FF22-0E66-EF11-A752-C0A5E8ACCB22' AND Name = 'VectorIndex')) BEGIN
         INSERT INTO [${flyway:defaultSchema}].[EntityField]
         (
            [ID],
            [EntityID],
            [Sequence],
            [Name],
            [DisplayName],
            [Description],
            [Type],
            [Length],
            [Precision],
            [Scale],
            [AllowsNull],
            [DefaultValue],
            [AutoIncrement],
            [AllowUpdateAPI],
            [IsVirtual],
            [IsComputed],
            [RelatedEntityID],
            [RelatedEntityFieldName],
            [IsNameField],
            [IncludeInUserSearchAPI],
            [IncludeRelatedEntityNameFieldInBaseView],
            [DefaultInView],
            [IsPrimaryKey],
            [IsUnique],
            [RelatedEntityDisplayType],
            [__mj_CreatedAt],
            [__mj_UpdatedAt]
         )
         VALUES
         (
            'cbb79f88-3b83-4064-be73-18b36f2a5108',
            'B420FF22-0E66-EF11-A752-C0A5E8ACCB22', -- Entity: MJ: Content Sources
            100037,
            'VectorIndex',
            'Vector Index',
            NULL,
            'nvarchar',
            510,
            0,
            0,
            1,
            NULL,
            0,
            0,
            1,
            0,
            NULL,
            NULL,
            0,
            0,
            0,
            0,
            0,
            0,
            'Search',
            GETUTCDATE(),
            GETUTCDATE()
         )
      END;

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = 'cd4b0a56-254f-4cfe-9676-2a8f187ad570' OR (EntityID = 'B420FF22-0E66-EF11-A752-C0A5E8ACCB22' AND Name = 'Entity')) BEGIN
         INSERT INTO [${flyway:defaultSchema}].[EntityField]
         (
            [ID],
            [EntityID],
            [Sequence],
            [Name],
            [DisplayName],
            [Description],
            [Type],
            [Length],
            [Precision],
            [Scale],
            [AllowsNull],
            [DefaultValue],
            [AutoIncrement],
            [AllowUpdateAPI],
            [IsVirtual],
            [IsComputed],
            [RelatedEntityID],
            [RelatedEntityFieldName],
            [IsNameField],
            [IncludeInUserSearchAPI],
            [IncludeRelatedEntityNameFieldInBaseView],
            [DefaultInView],
            [IsPrimaryKey],
            [IsUnique],
            [RelatedEntityDisplayType],
            [__mj_CreatedAt],
            [__mj_UpdatedAt]
         )
         VALUES
         (
            'cd4b0a56-254f-4cfe-9676-2a8f187ad570',
            'B420FF22-0E66-EF11-A752-C0A5E8ACCB22', -- Entity: MJ: Content Sources
            100038,
            'Entity',
            'Entity',
            NULL,
            'nvarchar',
            510,
            0,
            0,
            1,
            NULL,
            0,
            0,
            1,
            0,
            NULL,
            NULL,
            0,
            0,
            0,
            0,
            0,
            0,
            'Search',
            GETUTCDATE(),
            GETUTCDATE()
         )
      END;

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '148af964-91bc-4047-a272-503becab69a7' OR (EntityID = 'B420FF22-0E66-EF11-A752-C0A5E8ACCB22' AND Name = 'EntityDocument')) BEGIN
         INSERT INTO [${flyway:defaultSchema}].[EntityField]
         (
            [ID],
            [EntityID],
            [Sequence],
            [Name],
            [DisplayName],
            [Description],
            [Type],
            [Length],
            [Precision],
            [Scale],
            [AllowsNull],
            [DefaultValue],
            [AutoIncrement],
            [AllowUpdateAPI],
            [IsVirtual],
            [IsComputed],
            [RelatedEntityID],
            [RelatedEntityFieldName],
            [IsNameField],
            [IncludeInUserSearchAPI],
            [IncludeRelatedEntityNameFieldInBaseView],
            [DefaultInView],
            [IsPrimaryKey],
            [IsUnique],
            [RelatedEntityDisplayType],
            [__mj_CreatedAt],
            [__mj_UpdatedAt]
         )
         VALUES
         (
            '148af964-91bc-4047-a272-503becab69a7',
            'B420FF22-0E66-EF11-A752-C0A5E8ACCB22', -- Entity: MJ: Content Sources
            100039,
            'EntityDocument',
            'Entity Document',
            NULL,
            'nvarchar',
            500,
            0,
            0,
            1,
            NULL,
            0,
            0,
            1,
            0,
            NULL,
            NULL,
            0,
            0,
            0,
            0,
            0,
            0,
            'Search',
            GETUTCDATE(),
            GETUTCDATE()
         )
      END;


/* Create Entity Relationship: MJ: Scheduled Jobs -> MJ: Content Sources (One To Many via ScheduledJobID) */
   IF NOT EXISTS (
      SELECT 1 FROM [${flyway:defaultSchema}].[EntityRelationship] WHERE [ID] = '17d9b2bb-b393-4cde-a455-5aa2e18bc36e'
   )
   BEGIN
      INSERT INTO [${flyway:defaultSchema}].[EntityRelationship] ([ID], [EntityID], [RelatedEntityID], [RelatedEntityJoinField], [Type], [BundleInAPI], [DisplayInForm], [Sequence], [__mj_CreatedAt], [__mj_UpdatedAt])
                    VALUES ('17d9b2bb-b393-4cde-a455-5aa2e18bc36e', 'F48D2E6C-61C8-46B8-A617-C8228601EB3C', 'B420FF22-0E66-EF11-A752-C0A5E8ACCB22', 'ScheduledJobID', 'One To Many', 1, 1, 3, GETUTCDATE(), GETUTCDATE())
   END;

/* Index for Foreign Keys for ContentSource */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Content Sources
-- Item: Index for Foreign Keys
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------
-- Index for foreign key ContentTypeID in table ContentSource
IF NOT EXISTS (
    SELECT 1
    FROM sys.indexes
    WHERE name = 'IDX_AUTO_MJ_FKEY_ContentSource_ContentTypeID' 
    AND object_id = OBJECT_ID('[${flyway:defaultSchema}].[ContentSource]')
)
CREATE INDEX IDX_AUTO_MJ_FKEY_ContentSource_ContentTypeID ON [${flyway:defaultSchema}].[ContentSource] ([ContentTypeID]);

-- Index for foreign key ContentSourceTypeID in table ContentSource
IF NOT EXISTS (
    SELECT 1
    FROM sys.indexes
    WHERE name = 'IDX_AUTO_MJ_FKEY_ContentSource_ContentSourceTypeID' 
    AND object_id = OBJECT_ID('[${flyway:defaultSchema}].[ContentSource]')
)
CREATE INDEX IDX_AUTO_MJ_FKEY_ContentSource_ContentSourceTypeID ON [${flyway:defaultSchema}].[ContentSource] ([ContentSourceTypeID]);

-- Index for foreign key ContentFileTypeID in table ContentSource
IF NOT EXISTS (
    SELECT 1
    FROM sys.indexes
    WHERE name = 'IDX_AUTO_MJ_FKEY_ContentSource_ContentFileTypeID' 
    AND object_id = OBJECT_ID('[${flyway:defaultSchema}].[ContentSource]')
)
CREATE INDEX IDX_AUTO_MJ_FKEY_ContentSource_ContentFileTypeID ON [${flyway:defaultSchema}].[ContentSource] ([ContentFileTypeID]);

-- Index for foreign key EmbeddingModelID in table ContentSource
IF NOT EXISTS (
    SELECT 1
    FROM sys.indexes
    WHERE name = 'IDX_AUTO_MJ_FKEY_ContentSource_EmbeddingModelID' 
    AND object_id = OBJECT_ID('[${flyway:defaultSchema}].[ContentSource]')
)
CREATE INDEX IDX_AUTO_MJ_FKEY_ContentSource_EmbeddingModelID ON [${flyway:defaultSchema}].[ContentSource] ([EmbeddingModelID]);

-- Index for foreign key VectorIndexID in table ContentSource
IF NOT EXISTS (
    SELECT 1
    FROM sys.indexes
    WHERE name = 'IDX_AUTO_MJ_FKEY_ContentSource_VectorIndexID' 
    AND object_id = OBJECT_ID('[${flyway:defaultSchema}].[ContentSource]')
)
CREATE INDEX IDX_AUTO_MJ_FKEY_ContentSource_VectorIndexID ON [${flyway:defaultSchema}].[ContentSource] ([VectorIndexID]);

-- Index for foreign key EntityID in table ContentSource
IF NOT EXISTS (
    SELECT 1
    FROM sys.indexes
    WHERE name = 'IDX_AUTO_MJ_FKEY_ContentSource_EntityID' 
    AND object_id = OBJECT_ID('[${flyway:defaultSchema}].[ContentSource]')
)
CREATE INDEX IDX_AUTO_MJ_FKEY_ContentSource_EntityID ON [${flyway:defaultSchema}].[ContentSource] ([EntityID]);

-- Index for foreign key EntityDocumentID in table ContentSource
IF NOT EXISTS (
    SELECT 1
    FROM sys.indexes
    WHERE name = 'IDX_AUTO_MJ_FKEY_ContentSource_EntityDocumentID' 
    AND object_id = OBJECT_ID('[${flyway:defaultSchema}].[ContentSource]')
)
CREATE INDEX IDX_AUTO_MJ_FKEY_ContentSource_EntityDocumentID ON [${flyway:defaultSchema}].[ContentSource] ([EntityDocumentID]);

-- Index for foreign key ScheduledJobID in table ContentSource
IF NOT EXISTS (
    SELECT 1
    FROM sys.indexes
    WHERE name = 'IDX_AUTO_MJ_FKEY_ContentSource_ScheduledJobID' 
    AND object_id = OBJECT_ID('[${flyway:defaultSchema}].[ContentSource]')
)
CREATE INDEX IDX_AUTO_MJ_FKEY_ContentSource_ScheduledJobID ON [${flyway:defaultSchema}].[ContentSource] ([ScheduledJobID]);

/* SQL text to update entity field related entity name field map for entity field ID 80731E62-5565-4CFF-9D75-FAECEE04174C */
EXEC [${flyway:defaultSchema}].[spUpdateEntityFieldRelatedEntityNameFieldMap] @EntityFieldID='80731E62-5565-4CFF-9D75-FAECEE04174C', @RelatedEntityNameFieldMap='ScheduledJob';

/* Base View SQL for MJ: Content Sources */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Content Sources
-- Item: vwContentSources
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- BASE VIEW FOR ENTITY:      MJ: Content Sources
-----               SCHEMA:      ${flyway:defaultSchema}
-----               BASE TABLE:  ContentSource
-----               PRIMARY KEY: ID
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[vwContentSources]', 'V') IS NOT NULL
    DROP VIEW [${flyway:defaultSchema}].[vwContentSources];
GO

CREATE VIEW [${flyway:defaultSchema}].[vwContentSources]
AS
SELECT
    c.*,
    MJContentType_ContentTypeID.[Name] AS [ContentType],
    MJContentSourceType_ContentSourceTypeID.[Name] AS [ContentSourceType],
    MJContentFileType_ContentFileTypeID.[Name] AS [ContentFileType],
    MJAIModel_EmbeddingModelID.[Name] AS [EmbeddingModel],
    MJVectorIndex_VectorIndexID.[Name] AS [VectorIndex],
    MJEntity_EntityID.[Name] AS [Entity],
    MJEntityDocument_EntityDocumentID.[Name] AS [EntityDocument],
    MJScheduledJob_ScheduledJobID.[Name] AS [ScheduledJob]
FROM
    [${flyway:defaultSchema}].[ContentSource] AS c
INNER JOIN
    [${flyway:defaultSchema}].[ContentType] AS MJContentType_ContentTypeID
  ON
    [c].[ContentTypeID] = MJContentType_ContentTypeID.[ID]
INNER JOIN
    [${flyway:defaultSchema}].[ContentSourceType] AS MJContentSourceType_ContentSourceTypeID
  ON
    [c].[ContentSourceTypeID] = MJContentSourceType_ContentSourceTypeID.[ID]
INNER JOIN
    [${flyway:defaultSchema}].[ContentFileType] AS MJContentFileType_ContentFileTypeID
  ON
    [c].[ContentFileTypeID] = MJContentFileType_ContentFileTypeID.[ID]
LEFT OUTER JOIN
    [${flyway:defaultSchema}].[AIModel] AS MJAIModel_EmbeddingModelID
  ON
    [c].[EmbeddingModelID] = MJAIModel_EmbeddingModelID.[ID]
LEFT OUTER JOIN
    [${flyway:defaultSchema}].[VectorIndex] AS MJVectorIndex_VectorIndexID
  ON
    [c].[VectorIndexID] = MJVectorIndex_VectorIndexID.[ID]
LEFT OUTER JOIN
    [${flyway:defaultSchema}].[Entity] AS MJEntity_EntityID
  ON
    [c].[EntityID] = MJEntity_EntityID.[ID]
LEFT OUTER JOIN
    [${flyway:defaultSchema}].[EntityDocument] AS MJEntityDocument_EntityDocumentID
  ON
    [c].[EntityDocumentID] = MJEntityDocument_EntityDocumentID.[ID]
LEFT OUTER JOIN
    [${flyway:defaultSchema}].[ScheduledJob] AS MJScheduledJob_ScheduledJobID
  ON
    [c].[ScheduledJobID] = MJScheduledJob_ScheduledJobID.[ID]
GO
GRANT SELECT ON [${flyway:defaultSchema}].[vwContentSources] TO [cdp_UI], [cdp_Developer], [cdp_Integration];

/* Base View Permissions SQL for MJ: Content Sources */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Content Sources
-- Item: Permissions for vwContentSources
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

GRANT SELECT ON [${flyway:defaultSchema}].[vwContentSources] TO [cdp_UI], [cdp_Developer], [cdp_Integration];

/* spCreate SQL for MJ: Content Sources */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Content Sources
-- Item: spCreateContentSource
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- CREATE PROCEDURE FOR ContentSource
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[spCreateContentSource]', 'P') IS NOT NULL
    DROP PROCEDURE [${flyway:defaultSchema}].[spCreateContentSource];
GO

CREATE PROCEDURE [${flyway:defaultSchema}].[spCreateContentSource]
    @ID uniqueidentifier = NULL,
    @Name_Clear bit = 0,
    @Name nvarchar(255) = NULL,
    @ContentTypeID uniqueidentifier,
    @ContentSourceTypeID uniqueidentifier,
    @ContentFileTypeID uniqueidentifier,
    @URL nvarchar(2000),
    @EmbeddingModelID_Clear bit = 0,
    @EmbeddingModelID uniqueidentifier = NULL,
    @VectorIndexID_Clear bit = 0,
    @VectorIndexID uniqueidentifier = NULL,
    @Configuration_Clear bit = 0,
    @Configuration nvarchar(MAX) = NULL,
    @EntityID_Clear bit = 0,
    @EntityID uniqueidentifier = NULL,
    @EntityDocumentID_Clear bit = 0,
    @EntityDocumentID uniqueidentifier = NULL,
    @SegmenterKey_Clear bit = 0,
    @SegmenterKey nvarchar(100) = NULL,
    @CleanerKey_Clear bit = 0,
    @CleanerKey nvarchar(100) = NULL,
    @ScheduledJobID_Clear bit = 0,
    @ScheduledJobID uniqueidentifier = NULL
AS
BEGIN
    SET NOCOUNT ON;
    DECLARE @InsertedRow TABLE ([ID] UNIQUEIDENTIFIER)

    IF @ID IS NOT NULL
    BEGIN
        -- User provided a value, use it
        INSERT INTO [${flyway:defaultSchema}].[ContentSource]
            (
                [ID],
                [Name],
                [ContentTypeID],
                [ContentSourceTypeID],
                [ContentFileTypeID],
                [URL],
                [EmbeddingModelID],
                [VectorIndexID],
                [Configuration],
                [EntityID],
                [EntityDocumentID],
                [SegmenterKey],
                [CleanerKey],
                [ScheduledJobID]
            )
        OUTPUT INSERTED.[ID] INTO @InsertedRow
        VALUES
            (
                @ID,
                CASE WHEN @Name_Clear = 1 THEN NULL ELSE ISNULL(@Name, NULL) END,
                @ContentTypeID,
                @ContentSourceTypeID,
                @ContentFileTypeID,
                @URL,
                CASE WHEN @EmbeddingModelID_Clear = 1 THEN NULL ELSE ISNULL(@EmbeddingModelID, NULL) END,
                CASE WHEN @VectorIndexID_Clear = 1 THEN NULL ELSE ISNULL(@VectorIndexID, NULL) END,
                CASE WHEN @Configuration_Clear = 1 THEN NULL ELSE ISNULL(@Configuration, NULL) END,
                CASE WHEN @EntityID_Clear = 1 THEN NULL ELSE ISNULL(@EntityID, NULL) END,
                CASE WHEN @EntityDocumentID_Clear = 1 THEN NULL ELSE ISNULL(@EntityDocumentID, NULL) END,
                CASE WHEN @SegmenterKey_Clear = 1 THEN NULL ELSE ISNULL(@SegmenterKey, NULL) END,
                CASE WHEN @CleanerKey_Clear = 1 THEN NULL ELSE ISNULL(@CleanerKey, NULL) END,
                CASE WHEN @ScheduledJobID_Clear = 1 THEN NULL ELSE ISNULL(@ScheduledJobID, NULL) END
            )
    END
    ELSE
    BEGIN
        -- No value provided, let database use its default (e.g., NEWSEQUENTIALID())
        INSERT INTO [${flyway:defaultSchema}].[ContentSource]
            (
                [Name],
                [ContentTypeID],
                [ContentSourceTypeID],
                [ContentFileTypeID],
                [URL],
                [EmbeddingModelID],
                [VectorIndexID],
                [Configuration],
                [EntityID],
                [EntityDocumentID],
                [SegmenterKey],
                [CleanerKey],
                [ScheduledJobID]
            )
        OUTPUT INSERTED.[ID] INTO @InsertedRow
        VALUES
            (
                CASE WHEN @Name_Clear = 1 THEN NULL ELSE ISNULL(@Name, NULL) END,
                @ContentTypeID,
                @ContentSourceTypeID,
                @ContentFileTypeID,
                @URL,
                CASE WHEN @EmbeddingModelID_Clear = 1 THEN NULL ELSE ISNULL(@EmbeddingModelID, NULL) END,
                CASE WHEN @VectorIndexID_Clear = 1 THEN NULL ELSE ISNULL(@VectorIndexID, NULL) END,
                CASE WHEN @Configuration_Clear = 1 THEN NULL ELSE ISNULL(@Configuration, NULL) END,
                CASE WHEN @EntityID_Clear = 1 THEN NULL ELSE ISNULL(@EntityID, NULL) END,
                CASE WHEN @EntityDocumentID_Clear = 1 THEN NULL ELSE ISNULL(@EntityDocumentID, NULL) END,
                CASE WHEN @SegmenterKey_Clear = 1 THEN NULL ELSE ISNULL(@SegmenterKey, NULL) END,
                CASE WHEN @CleanerKey_Clear = 1 THEN NULL ELSE ISNULL(@CleanerKey, NULL) END,
                CASE WHEN @ScheduledJobID_Clear = 1 THEN NULL ELSE ISNULL(@ScheduledJobID, NULL) END
            )
    END
    -- return the new record from the base view, which might have some calculated fields
    SELECT * FROM [${flyway:defaultSchema}].[vwContentSources] WHERE [ID] = (SELECT [ID] FROM @InsertedRow)
END
GO
GRANT EXECUTE ON [${flyway:defaultSchema}].[spCreateContentSource] TO [cdp_Developer], [cdp_Integration];

/* spCreate Permissions for MJ: Content Sources */

GRANT EXECUTE ON [${flyway:defaultSchema}].[spCreateContentSource] TO [cdp_Developer], [cdp_Integration];

/* spUpdate SQL for MJ: Content Sources */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Content Sources
-- Item: spUpdateContentSource
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- UPDATE PROCEDURE FOR ContentSource
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[spUpdateContentSource]', 'P') IS NOT NULL
    DROP PROCEDURE [${flyway:defaultSchema}].[spUpdateContentSource];
GO

CREATE PROCEDURE [${flyway:defaultSchema}].[spUpdateContentSource]
    @ID uniqueidentifier,
    @Name_Clear bit = 0,
    @Name nvarchar(255) = NULL,
    @ContentTypeID uniqueidentifier = NULL,
    @ContentSourceTypeID uniqueidentifier = NULL,
    @ContentFileTypeID uniqueidentifier = NULL,
    @URL nvarchar(2000) = NULL,
    @EmbeddingModelID_Clear bit = 0,
    @EmbeddingModelID uniqueidentifier = NULL,
    @VectorIndexID_Clear bit = 0,
    @VectorIndexID uniqueidentifier = NULL,
    @Configuration_Clear bit = 0,
    @Configuration nvarchar(MAX) = NULL,
    @EntityID_Clear bit = 0,
    @EntityID uniqueidentifier = NULL,
    @EntityDocumentID_Clear bit = 0,
    @EntityDocumentID uniqueidentifier = NULL,
    @SegmenterKey_Clear bit = 0,
    @SegmenterKey nvarchar(100) = NULL,
    @CleanerKey_Clear bit = 0,
    @CleanerKey nvarchar(100) = NULL,
    @ScheduledJobID_Clear bit = 0,
    @ScheduledJobID uniqueidentifier = NULL
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE
        [${flyway:defaultSchema}].[ContentSource]
    SET
        [Name] = CASE WHEN @Name_Clear = 1 THEN NULL ELSE ISNULL(@Name, [Name]) END,
        [ContentTypeID] = ISNULL(@ContentTypeID, [ContentTypeID]),
        [ContentSourceTypeID] = ISNULL(@ContentSourceTypeID, [ContentSourceTypeID]),
        [ContentFileTypeID] = ISNULL(@ContentFileTypeID, [ContentFileTypeID]),
        [URL] = ISNULL(@URL, [URL]),
        [EmbeddingModelID] = CASE WHEN @EmbeddingModelID_Clear = 1 THEN NULL ELSE ISNULL(@EmbeddingModelID, [EmbeddingModelID]) END,
        [VectorIndexID] = CASE WHEN @VectorIndexID_Clear = 1 THEN NULL ELSE ISNULL(@VectorIndexID, [VectorIndexID]) END,
        [Configuration] = CASE WHEN @Configuration_Clear = 1 THEN NULL ELSE ISNULL(@Configuration, [Configuration]) END,
        [EntityID] = CASE WHEN @EntityID_Clear = 1 THEN NULL ELSE ISNULL(@EntityID, [EntityID]) END,
        [EntityDocumentID] = CASE WHEN @EntityDocumentID_Clear = 1 THEN NULL ELSE ISNULL(@EntityDocumentID, [EntityDocumentID]) END,
        [SegmenterKey] = CASE WHEN @SegmenterKey_Clear = 1 THEN NULL ELSE ISNULL(@SegmenterKey, [SegmenterKey]) END,
        [CleanerKey] = CASE WHEN @CleanerKey_Clear = 1 THEN NULL ELSE ISNULL(@CleanerKey, [CleanerKey]) END,
        [ScheduledJobID] = CASE WHEN @ScheduledJobID_Clear = 1 THEN NULL ELSE ISNULL(@ScheduledJobID, [ScheduledJobID]) END
    WHERE
        [ID] = @ID

    -- Check if the update was successful
    IF @@ROWCOUNT = 0
        -- Nothing was updated, return no rows, but column structure from base view intact, semantically correct this way.
        SELECT TOP 0 * FROM [${flyway:defaultSchema}].[vwContentSources] WHERE 1=0
    ELSE
        -- Return the updated record so the caller can see the updated values and any calculated fields
        SELECT
                                        *
                                    FROM
                                        [${flyway:defaultSchema}].[vwContentSources]
                                    WHERE
                                        [ID] = @ID
                                    
END
GO

GRANT EXECUTE ON [${flyway:defaultSchema}].[spUpdateContentSource] TO [cdp_Developer], [cdp_Integration]
GO

------------------------------------------------------------
----- TRIGGER FOR __mj_UpdatedAt field for the ContentSource table
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[trgUpdateContentSource]', 'TR') IS NOT NULL
    DROP TRIGGER [${flyway:defaultSchema}].[trgUpdateContentSource];
GO
CREATE TRIGGER [${flyway:defaultSchema}].trgUpdateContentSource
ON [${flyway:defaultSchema}].[ContentSource]
AFTER UPDATE
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE
        [${flyway:defaultSchema}].[ContentSource]
    SET
        __mj_UpdatedAt = GETUTCDATE()
    FROM
        [${flyway:defaultSchema}].[ContentSource] AS _organicTable
    INNER JOIN
        INSERTED AS I ON
        _organicTable.[ID] = I.[ID];
END;
GO

/* spUpdate Permissions for MJ: Content Sources */

GRANT EXECUTE ON [${flyway:defaultSchema}].[spUpdateContentSource] TO [cdp_Developer], [cdp_Integration];

/* spDelete SQL for MJ: Content Sources */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Content Sources
-- Item: spDeleteContentSource
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- DELETE PROCEDURE FOR ContentSource
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[spDeleteContentSource]', 'P') IS NOT NULL
    DROP PROCEDURE [${flyway:defaultSchema}].[spDeleteContentSource];
GO

CREATE PROCEDURE [${flyway:defaultSchema}].[spDeleteContentSource]
    @ID uniqueidentifier
AS
BEGIN
    SET NOCOUNT ON;

    DELETE FROM
        [${flyway:defaultSchema}].[ContentSource]
    WHERE
        [ID] = @ID


    -- Check if the delete was successful
    IF @@ROWCOUNT = 0
        SELECT NULL AS [ID] -- Return NULL for all primary key fields to indicate no record was deleted
    ELSE
        SELECT @ID AS [ID] -- Return the primary key values to indicate we successfully deleted the record
END
GO
GRANT EXECUTE ON [${flyway:defaultSchema}].[spDeleteContentSource] TO [cdp_Developer], [cdp_Integration];

/* spDelete Permissions for MJ: Content Sources */

GRANT EXECUTE ON [${flyway:defaultSchema}].[spDeleteContentSource] TO [cdp_Developer], [cdp_Integration];

/* spDelete SQL for MJ: Entity Documents */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Entity Documents
-- Item: spDeleteEntityDocument
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- DELETE PROCEDURE FOR EntityDocument
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[spDeleteEntityDocument]', 'P') IS NOT NULL
    DROP PROCEDURE [${flyway:defaultSchema}].[spDeleteEntityDocument];
GO

CREATE PROCEDURE [${flyway:defaultSchema}].[spDeleteEntityDocument]
    @ID uniqueidentifier
AS
BEGIN
    SET NOCOUNT ON;
    -- Cascade update on ContentSource using cursor to call spUpdateContentSource
    DECLARE @MJContentSources_EntityDocumentIDID uniqueidentifier
    DECLARE @MJContentSources_EntityDocumentID_Name nvarchar(255)
    DECLARE @MJContentSources_EntityDocumentID_ContentTypeID uniqueidentifier
    DECLARE @MJContentSources_EntityDocumentID_ContentSourceTypeID uniqueidentifier
    DECLARE @MJContentSources_EntityDocumentID_ContentFileTypeID uniqueidentifier
    DECLARE @MJContentSources_EntityDocumentID_URL nvarchar(2000)
    DECLARE @MJContentSources_EntityDocumentID_EmbeddingModelID uniqueidentifier
    DECLARE @MJContentSources_EntityDocumentID_VectorIndexID uniqueidentifier
    DECLARE @MJContentSources_EntityDocumentID_Configuration nvarchar(MAX)
    DECLARE @MJContentSources_EntityDocumentID_EntityID uniqueidentifier
    DECLARE @MJContentSources_EntityDocumentID_EntityDocumentID uniqueidentifier
    DECLARE @MJContentSources_EntityDocumentID_SegmenterKey nvarchar(100)
    DECLARE @MJContentSources_EntityDocumentID_CleanerKey nvarchar(100)
    DECLARE @MJContentSources_EntityDocumentID_ScheduledJobID uniqueidentifier
    DECLARE cascade_update_MJContentSources_EntityDocumentID_cursor CURSOR FOR
        SELECT [ID], [Name], [ContentTypeID], [ContentSourceTypeID], [ContentFileTypeID], [URL], [EmbeddingModelID], [VectorIndexID], [Configuration], [EntityID], [EntityDocumentID], [SegmenterKey], [CleanerKey], [ScheduledJobID]
        FROM [${flyway:defaultSchema}].[ContentSource]
        WHERE [EntityDocumentID] = @ID

    OPEN cascade_update_MJContentSources_EntityDocumentID_cursor
    FETCH NEXT FROM cascade_update_MJContentSources_EntityDocumentID_cursor INTO @MJContentSources_EntityDocumentIDID, @MJContentSources_EntityDocumentID_Name, @MJContentSources_EntityDocumentID_ContentTypeID, @MJContentSources_EntityDocumentID_ContentSourceTypeID, @MJContentSources_EntityDocumentID_ContentFileTypeID, @MJContentSources_EntityDocumentID_URL, @MJContentSources_EntityDocumentID_EmbeddingModelID, @MJContentSources_EntityDocumentID_VectorIndexID, @MJContentSources_EntityDocumentID_Configuration, @MJContentSources_EntityDocumentID_EntityID, @MJContentSources_EntityDocumentID_EntityDocumentID, @MJContentSources_EntityDocumentID_SegmenterKey, @MJContentSources_EntityDocumentID_CleanerKey, @MJContentSources_EntityDocumentID_ScheduledJobID

    WHILE @@FETCH_STATUS = 0
    BEGIN
        -- Set the FK field to NULL
        SET @MJContentSources_EntityDocumentID_EntityDocumentID = NULL

        -- Call the update SP for the related entity
        EXEC [${flyway:defaultSchema}].[spUpdateContentSource] @ID = @MJContentSources_EntityDocumentIDID, @Name = @MJContentSources_EntityDocumentID_Name, @ContentTypeID = @MJContentSources_EntityDocumentID_ContentTypeID, @ContentSourceTypeID = @MJContentSources_EntityDocumentID_ContentSourceTypeID, @ContentFileTypeID = @MJContentSources_EntityDocumentID_ContentFileTypeID, @URL = @MJContentSources_EntityDocumentID_URL, @EmbeddingModelID = @MJContentSources_EntityDocumentID_EmbeddingModelID, @VectorIndexID = @MJContentSources_EntityDocumentID_VectorIndexID, @Configuration = @MJContentSources_EntityDocumentID_Configuration, @EntityID = @MJContentSources_EntityDocumentID_EntityID, @EntityDocumentID_Clear = 1, @EntityDocumentID = @MJContentSources_EntityDocumentID_EntityDocumentID, @SegmenterKey = @MJContentSources_EntityDocumentID_SegmenterKey, @CleanerKey = @MJContentSources_EntityDocumentID_CleanerKey, @ScheduledJobID = @MJContentSources_EntityDocumentID_ScheduledJobID

        FETCH NEXT FROM cascade_update_MJContentSources_EntityDocumentID_cursor INTO @MJContentSources_EntityDocumentIDID, @MJContentSources_EntityDocumentID_Name, @MJContentSources_EntityDocumentID_ContentTypeID, @MJContentSources_EntityDocumentID_ContentSourceTypeID, @MJContentSources_EntityDocumentID_ContentFileTypeID, @MJContentSources_EntityDocumentID_URL, @MJContentSources_EntityDocumentID_EmbeddingModelID, @MJContentSources_EntityDocumentID_VectorIndexID, @MJContentSources_EntityDocumentID_Configuration, @MJContentSources_EntityDocumentID_EntityID, @MJContentSources_EntityDocumentID_EntityDocumentID, @MJContentSources_EntityDocumentID_SegmenterKey, @MJContentSources_EntityDocumentID_CleanerKey, @MJContentSources_EntityDocumentID_ScheduledJobID
    END

    CLOSE cascade_update_MJContentSources_EntityDocumentID_cursor
    DEALLOCATE cascade_update_MJContentSources_EntityDocumentID_cursor
    
    -- Cascade delete from EntityDocumentRun using cursor to call spDeleteEntityDocumentRun
    DECLARE @MJEntityDocumentRuns_EntityDocumentIDID uniqueidentifier
    DECLARE cascade_delete_MJEntityDocumentRuns_EntityDocumentID_cursor CURSOR FOR 
        SELECT [ID]
        FROM [${flyway:defaultSchema}].[EntityDocumentRun]
        WHERE [EntityDocumentID] = @ID
    
    OPEN cascade_delete_MJEntityDocumentRuns_EntityDocumentID_cursor
    FETCH NEXT FROM cascade_delete_MJEntityDocumentRuns_EntityDocumentID_cursor INTO @MJEntityDocumentRuns_EntityDocumentIDID
    
    WHILE @@FETCH_STATUS = 0
    BEGIN
        EXEC [${flyway:defaultSchema}].[spDeleteEntityDocumentRun] @ID = @MJEntityDocumentRuns_EntityDocumentIDID
        
        FETCH NEXT FROM cascade_delete_MJEntityDocumentRuns_EntityDocumentID_cursor INTO @MJEntityDocumentRuns_EntityDocumentIDID
    END
    
    CLOSE cascade_delete_MJEntityDocumentRuns_EntityDocumentID_cursor
    DEALLOCATE cascade_delete_MJEntityDocumentRuns_EntityDocumentID_cursor
    
    -- Cascade delete from EntityDocumentSetting using cursor to call spDeleteEntityDocumentSetting
    DECLARE @MJEntityDocumentSettings_EntityDocumentIDID uniqueidentifier
    DECLARE cascade_delete_MJEntityDocumentSettings_EntityDocumentID_cursor CURSOR FOR 
        SELECT [ID]
        FROM [${flyway:defaultSchema}].[EntityDocumentSetting]
        WHERE [EntityDocumentID] = @ID
    
    OPEN cascade_delete_MJEntityDocumentSettings_EntityDocumentID_cursor
    FETCH NEXT FROM cascade_delete_MJEntityDocumentSettings_EntityDocumentID_cursor INTO @MJEntityDocumentSettings_EntityDocumentIDID
    
    WHILE @@FETCH_STATUS = 0
    BEGIN
        EXEC [${flyway:defaultSchema}].[spDeleteEntityDocumentSetting] @ID = @MJEntityDocumentSettings_EntityDocumentIDID
        
        FETCH NEXT FROM cascade_delete_MJEntityDocumentSettings_EntityDocumentID_cursor INTO @MJEntityDocumentSettings_EntityDocumentIDID
    END
    
    CLOSE cascade_delete_MJEntityDocumentSettings_EntityDocumentID_cursor
    DEALLOCATE cascade_delete_MJEntityDocumentSettings_EntityDocumentID_cursor
    
    -- Cascade delete from EntityRecordDocument using cursor to call spDeleteEntityRecordDocument
    DECLARE @MJEntityRecordDocuments_EntityDocumentIDID uniqueidentifier
    DECLARE cascade_delete_MJEntityRecordDocuments_EntityDocumentID_cursor CURSOR FOR 
        SELECT [ID]
        FROM [${flyway:defaultSchema}].[EntityRecordDocument]
        WHERE [EntityDocumentID] = @ID
    
    OPEN cascade_delete_MJEntityRecordDocuments_EntityDocumentID_cursor
    FETCH NEXT FROM cascade_delete_MJEntityRecordDocuments_EntityDocumentID_cursor INTO @MJEntityRecordDocuments_EntityDocumentIDID
    
    WHILE @@FETCH_STATUS = 0
    BEGIN
        EXEC [${flyway:defaultSchema}].[spDeleteEntityRecordDocument] @ID = @MJEntityRecordDocuments_EntityDocumentIDID
        
        FETCH NEXT FROM cascade_delete_MJEntityRecordDocuments_EntityDocumentID_cursor INTO @MJEntityRecordDocuments_EntityDocumentIDID
    END
    
    CLOSE cascade_delete_MJEntityRecordDocuments_EntityDocumentID_cursor
    DEALLOCATE cascade_delete_MJEntityRecordDocuments_EntityDocumentID_cursor
    

    DELETE FROM
        [${flyway:defaultSchema}].[EntityDocument]
    WHERE
        [ID] = @ID


    -- Check if the delete was successful
    IF @@ROWCOUNT = 0
        SELECT NULL AS [ID] -- Return NULL for all primary key fields to indicate no record was deleted
    ELSE
        SELECT @ID AS [ID] -- Return the primary key values to indicate we successfully deleted the record
END
GO
GRANT EXECUTE ON [${flyway:defaultSchema}].[spDeleteEntityDocument] TO [cdp_Integration], [cdp_Developer];

/* spDelete Permissions for MJ: Entity Documents */

GRANT EXECUTE ON [${flyway:defaultSchema}].[spDeleteEntityDocument] TO [cdp_Integration], [cdp_Developer];

/* SQL text to insert 1 new entity field(s) */

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = 'a0ffaad7-8c9d-41f8-b2f4-d99a3c6b459d' OR (EntityID = 'B420FF22-0E66-EF11-A752-C0A5E8ACCB22' AND Name = 'ScheduledJob')) BEGIN
         INSERT INTO [${flyway:defaultSchema}].[EntityField]
         (
            [ID],
            [EntityID],
            [Sequence],
            [Name],
            [DisplayName],
            [Description],
            [Type],
            [Length],
            [Precision],
            [Scale],
            [AllowsNull],
            [DefaultValue],
            [AutoIncrement],
            [AllowUpdateAPI],
            [IsVirtual],
            [IsComputed],
            [RelatedEntityID],
            [RelatedEntityFieldName],
            [IsNameField],
            [IncludeInUserSearchAPI],
            [IncludeRelatedEntityNameFieldInBaseView],
            [DefaultInView],
            [IsPrimaryKey],
            [IsUnique],
            [RelatedEntityDisplayType],
            [__mj_CreatedAt],
            [__mj_UpdatedAt]
         )
         VALUES
         (
            'a0ffaad7-8c9d-41f8-b2f4-d99a3c6b459d',
            'B420FF22-0E66-EF11-A752-C0A5E8ACCB22', -- Entity: MJ: Content Sources
            100047,
            'ScheduledJob',
            'Scheduled Job',
            NULL,
            'nvarchar',
            400,
            0,
            0,
            1,
            NULL,
            0,
            0,
            1,
            0,
            NULL,
            NULL,
            0,
            0,
            0,
            0,
            0,
            0,
            'Search',
            GETUTCDATE(),
            GETUTCDATE()
         )
      END;

/* Set field properties for entity */

               UPDATE [${flyway:defaultSchema}].[EntityField]
               SET DefaultInView = 1
               WHERE ID = '5D0D1C7B-EE57-4C57-882E-EE26EAA71D98'
               AND AutoUpdateDefaultInView = 1;

               UPDATE [${flyway:defaultSchema}].[EntityField]
               SET DefaultInView = 1
               WHERE ID = '945C4930-B4B0-4F5E-8DFB-5E32CFBC041A'
               AND AutoUpdateDefaultInView = 1;

               UPDATE [${flyway:defaultSchema}].[EntityField]
               SET UserSearchPredicateAPI = 'BeginsWith'
               WHERE ID = 'BFB7433E-F36B-1410-867F-007B559E242F'
               AND AutoUpdateUserSearchPredicate = 1;

/* Set categories for 24 fields */

-- UPDATE Entity Field Category Info MJ: Content Sources.ID 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = 'A1B7433E-F36B-1410-867F-007B559E242F' AND AutoUpdateCategory = 1;

-- UPDATE Entity Field Category Info MJ: Content Sources.__mj_CreatedAt 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = 'C5B7433E-F36B-1410-867F-007B559E242F' AND AutoUpdateCategory = 1;

-- UPDATE Entity Field Category Info MJ: Content Sources.__mj_UpdatedAt 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = 'CBB7433E-F36B-1410-867F-007B559E242F' AND AutoUpdateCategory = 1;

-- UPDATE Entity Field Category Info MJ: Content Sources.Name 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = 'A7B7433E-F36B-1410-867F-007B559E242F' AND AutoUpdateCategory = 1;

-- UPDATE Entity Field Category Info MJ: Content Sources.ContentSourceTypeID 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = 'B3B7433E-F36B-1410-867F-007B559E242F' AND AutoUpdateCategory = 1;

-- UPDATE Entity Field Category Info MJ: Content Sources.URL 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   GeneratedFormSection = 'Category',
   ExtendedType = 'URL',
   CodeType = NULL
WHERE 
   ID = 'BFB7433E-F36B-1410-867F-007B559E242F' AND AutoUpdateCategory = 1;

-- UPDATE Entity Field Category Info MJ: Content Sources.ContentSourceType 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Connection Details',
   GeneratedFormSection = 'Category',
   DisplayName = 'Content Source Type Name',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = '945C4930-B4B0-4F5E-8DFB-5E32CFBC041A' AND AutoUpdateCategory = 1;

-- UPDATE Entity Field Category Info MJ: Content Sources.ContentTypeID 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = 'ADB7433E-F36B-1410-867F-007B559E242F' AND AutoUpdateCategory = 1;

-- UPDATE Entity Field Category Info MJ: Content Sources.ContentFileTypeID 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = 'B9B7433E-F36B-1410-867F-007B559E242F' AND AutoUpdateCategory = 1;

-- UPDATE Entity Field Category Info MJ: Content Sources.ContentType 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Content Classification',
   GeneratedFormSection = 'Category',
   DisplayName = 'Content Type Name',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = '5D0D1C7B-EE57-4C57-882E-EE26EAA71D98' AND AutoUpdateCategory = 1;

-- UPDATE Entity Field Category Info MJ: Content Sources.ContentFileType 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Content Classification',
   GeneratedFormSection = 'Category',
   DisplayName = 'Content File Type Name',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = '4D41567A-2390-45F1-8946-61DD1B0F0FC5' AND AutoUpdateCategory = 1;

-- UPDATE Entity Field Category Info MJ: Content Sources.EmbeddingModelID 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = '045043FD-61A9-477F-82A7-72A7FC615A3C' AND AutoUpdateCategory = 1;

-- UPDATE Entity Field Category Info MJ: Content Sources.VectorIndexID 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = '11091434-73BD-4006-8C65-8639EA9AF1F3' AND AutoUpdateCategory = 1;

-- UPDATE Entity Field Category Info MJ: Content Sources.EmbeddingModel 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'AI & Indexing',
   GeneratedFormSection = 'Category',
   DisplayName = 'Embedding Model Name',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = '81AC4181-080E-4240-B179-1E6C614D5A6F' AND AutoUpdateCategory = 1;

-- UPDATE Entity Field Category Info MJ: Content Sources.VectorIndex 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'AI & Indexing',
   GeneratedFormSection = 'Category',
   DisplayName = 'Vector Index Name',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = 'CBB79F88-3B83-4064-BE73-18B36F2A5108' AND AutoUpdateCategory = 1;

-- UPDATE Entity Field Category Info MJ: Content Sources.Configuration 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   GeneratedFormSection = 'Category',
   ExtendedType = 'Code',
   CodeType = 'Other'
WHERE 
   ID = '3402501E-8128-40E0-BCF8-1BC2867C3931' AND AutoUpdateCategory = 1;

-- UPDATE Entity Field Category Info MJ: Content Sources.EntityID 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   GeneratedFormSection = 'Category',
   DisplayName = 'Source Entity',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = '3F8AEC67-CBBB-47BE-96C8-70795F10849C' AND AutoUpdateCategory = 1;

-- UPDATE Entity Field Category Info MJ: Content Sources.EntityDocumentID 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   GeneratedFormSection = 'Category',
   DisplayName = 'Entity Document Template',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = '7BFD47B8-2B7B-4D5E-AF0F-510B6DA68FAA' AND AutoUpdateCategory = 1;

-- UPDATE Entity Field Category Info MJ: Content Sources.SegmenterKey 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = '012C715A-4846-4910-9D64-35C7327FA213' AND AutoUpdateCategory = 1;

-- UPDATE Entity Field Category Info MJ: Content Sources.CleanerKey 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = '22F6A2EE-FE1A-4FE7-A946-9FE7743DE677' AND AutoUpdateCategory = 1;

-- UPDATE Entity Field Category Info MJ: Content Sources.ScheduledJobID 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Processing & Automation',
   GeneratedFormSection = 'Category',
   DisplayName = 'Scheduled Job',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = '80731E62-5565-4CFF-9D75-FAECEE04174C' AND AutoUpdateCategory = 1;

-- UPDATE Entity Field Category Info MJ: Content Sources.Entity 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Processing & Automation',
   GeneratedFormSection = 'Category',
   DisplayName = 'Source Entity Name',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = 'CD4B0A56-254F-4CFE-9676-2A8F187AD570' AND AutoUpdateCategory = 1;

-- UPDATE Entity Field Category Info MJ: Content Sources.EntityDocument 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Processing & Automation',
   GeneratedFormSection = 'Category',
   DisplayName = 'Entity Document Template Name',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = '148AF964-91BC-4047-A272-503BECAB69A7' AND AutoUpdateCategory = 1;

-- UPDATE Entity Field Category Info MJ: Content Sources.ScheduledJob 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Processing & Automation',
   GeneratedFormSection = 'Category',
   DisplayName = 'Scheduled Job Name',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = 'A0FFAAD7-8C9D-41F8-B2F4-D99A3C6B459D' AND AutoUpdateCategory = 1;
