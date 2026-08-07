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
-- so the Entity row can be deleted without tripping FK_EntityField_RelatedEntity.
UPDATE [${flyway:defaultSchema}].EntityField SET RelatedEntityID = NULL WHERE RelatedEntityID = @EntityID

DELETE FROM [${flyway:defaultSchema}].Entity WHERE ID = @EntityID
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
