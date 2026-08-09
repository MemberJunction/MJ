/* ==============================================================================================
   Exclusive fan-outs for the unified workflow engine (Track C1.2, plan §5.1).

   Two changes, both in service of one idea: a flow's `sequential` traversal is an EXCLUSIVE CHOICE,
   not a chain. The walker takes the highest-priority satisfied path and discards the rest, so
   compiling a flow onto the durable engine needs (a) a way to say "this branch was not taken" and
   (b) somewhere to record which sibling edges are alternatives to each other.

   1. Task.Status gains 'Skipped'.

      Deliberately a NEW value rather than reusing 'Blocked' or 'Cancelled'. A losing branch is a
      NORMAL outcome — it must not count as a failure and must not block its dependents. Reusing
      Blocked would make every sequential flow containing a single fork roll its parent up to
      Blocked, which is the precise bug this value exists to prevent.

   2. TaskDependency gains Priority, Sequence and ExclusiveGroup.

      Priority mirrors AIAgentStepPath.Priority (higher wins). Sequence is the deterministic
      tiebreak: compiled dependencies get fresh UUIDs and Priority defaults to 0, so ties are the
      common case — without a stored ordinal the same workflow could pick a different branch on a
      different machine than the engine it replaces. ExclusiveGroup marks sibling edges leaving one
      origin as alternatives.

   All three columns are additive with defaults, so existing rows and existing graphs are unaffected:
   a dependency with no ExclusiveGroup behaves exactly as it does today.

   Run `mj codegen` after this: MJTaskEntity.Status gains 'Skipped' and MJTaskDependencyEntity gains
   the three columns. Never hand-edit the generated ORM.
   ============================================================================================== */

/* ---------------------------------------------------------------------------------------------
   1. Task.Status — drop and re-add the CHECK with the new value.

   The value list is derived by CodeGen from this constraint, so replacing it in ONE migration is
   what keeps EntityFieldValue rows and the generated TypeScript union in step. The existing seven
   values are restated exactly as they are stored — note 'Complete' (not 'Completed') and
   'Cancelled' with two Ls.
   --------------------------------------------------------------------------------------------- */
IF EXISTS (SELECT 1 FROM sys.check_constraints WHERE name = 'CK_Task_Status')
    ALTER TABLE [${flyway:defaultSchema}].[Task] DROP CONSTRAINT [CK_Task_Status];
GO

ALTER TABLE [${flyway:defaultSchema}].[Task] WITH CHECK ADD CONSTRAINT [CK_Task_Status] CHECK
(
    [Status] IN ('Pending', 'In Progress', 'Complete', 'Failed', 'Blocked', 'Cancelled', 'Deferred', 'Skipped')
);
GO

/* Task.Status already carries a description, so this UPDATES rather than adds — sp_addextendedproperty
   throws when the property exists, and the value has to change to mention the new state. */
IF EXISTS (
    SELECT 1 FROM sys.extended_properties ep
    WHERE ep.major_id = OBJECT_ID('${flyway:defaultSchema}.Task')
      AND ep.minor_id = COLUMNPROPERTY(OBJECT_ID('${flyway:defaultSchema}.Task'), 'Status', 'ColumnId')
      AND ep.name = 'MS_Description'
)
    EXEC sp_updateextendedproperty
        @name = N'MS_Description',
        @value = N'Lifecycle state. Pending awaits prerequisites; In Progress is claimed and running; Complete succeeded; Failed did not; Blocked can never run because a prerequisite is unsatisfiable; Cancelled was stopped deliberately; Deferred is waiting on a schedule. Skipped is a branch that was NOT TAKEN at an exclusive fan-out — a normal outcome, not a failure: it satisfies dependents (so a join downstream of a fork still runs) and is invisible to failure precedence when the parent rolls up.',
        @level0type = N'SCHEMA', @level0name = N'${flyway:defaultSchema}',
        @level1type = N'TABLE',  @level1name = N'Task',
        @level2type = N'COLUMN', @level2name = N'Status';
GO

/* ---------------------------------------------------------------------------------------------
   2. TaskDependency — ordering and exclusive-group membership.
   --------------------------------------------------------------------------------------------- */
ALTER TABLE [${flyway:defaultSchema}].[TaskDependency]
    ADD [Priority]       INT             NOT NULL CONSTRAINT [DF_TaskDependency_Priority] DEFAULT (0),
        [Sequence]       INT             NOT NULL CONSTRAINT [DF_TaskDependency_Sequence] DEFAULT (0),
        [ExclusiveGroup] NVARCHAR(255)   NULL;
GO

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'Ordering within an exclusive group — higher wins. Mirrors AIAgentStepPath.Priority so a compiled workflow chooses the same branch the flow editor shows. Ignored for edges that are not part of an ExclusiveGroup.',
    @level0type = N'SCHEMA', @level0name = N'${flyway:defaultSchema}',
    @level1type = N'TABLE',  @level1name = N'TaskDependency',
    @level2type = N'COLUMN', @level2name = N'Priority';
GO

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'Deterministic tiebreak when two edges in an ExclusiveGroup share a Priority, applied ascending. Load-bearing rather than cosmetic: compiled dependencies get fresh UUIDs and Priority defaults to 0, so without a stored ordinal a tie would resolve by row order and the same workflow could take a different branch on a different machine.',
    @level0type = N'SCHEMA', @level0name = N'${flyway:defaultSchema}',
    @level1type = N'TABLE',  @level1name = N'TaskDependency',
    @level2type = N'COLUMN', @level2name = N'Sequence';
GO

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'XOR group key: sibling edges leaving the same origin that share a non-null ExclusiveGroup are an exclusive fan-out. The highest-Priority satisfied edge wins, ties broken by ascending Sequence; the rest are Skipped. NULL (the default) means an ordinary dependency, so existing graphs are unaffected. An unevaluable condition anywhere in the group holds the whole group rather than firing every branch.',
    @level0type = N'SCHEMA', @level0name = N'${flyway:defaultSchema}',
    @level1type = N'TABLE',  @level1name = N'TaskDependency',
    @level2type = N'COLUMN', @level2name = N'ExclusiveGroup';
GO























































/* ==============================================================================================
   ==============================================================================================
   ==
   ==   EVERYTHING BELOW THIS LINE WAS GENERATED BY THE MEMBERJUNCTION CODEGEN TOOL.
   ==   DO NOT EDIT IT BY HAND.
   ==
   ==   It is the database-side consequence of the hand-written DDL above: the EntityField rows for
   ==   TaskDependency.Priority / Sequence / ExclusiveGroup, the EntityFieldValue row for the new
   ==   Task.Status value 'Skipped' (which CodeGen derives from CK_Task_Status), the regenerated
   ==   vwTasks / vwTaskDependencies views, the regenerated spCreate / spUpdate / spDelete procedures
   ==   for both entities, and their permission grants.
   ==
   ==   Note the Sequence values here are COMPUTED expressions, not literals. That is the C1.0
   ==   emitter fix working: a literal is only valid on the database CodeGen ran against, and on a
   ==   from-scratch install it collides on UQ_EntityField_EntityID_Sequence — reporting itself as an
   ==   unrelated foreign-key error. See MJ#3670.
   ==
   ==   IF THE HAND-WRITTEN DDL ABOVE CHANGES, DO NOT PATCH THIS SECTION. Re-run `mj codegen` and
   ==   replace this entire generated block with the new CodeGen_Run_*.sql output.
   ==
   ==============================================================================================
   ============================================================================================== */

/* SQL text to insert 3 new entity field(s) */

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '416745c6-c8bc-416a-a476-f67ebadd7197' OR (EntityID = 'DD6EE217-00EC-4DE8-A2E6-489A08D4E524' AND Name = 'Priority')) BEGIN
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
            '416745c6-c8bc-416a-a476-f67ebadd7197',
            'DD6EE217-00EC-4DE8-A2E6-489A08D4E524', -- Entity: MJ: Task Dependencies
            (SELECT COALESCE(MAX([Sequence]), 0) FROM [${flyway:defaultSchema}].[EntityField] WHERE [EntityID] = 'DD6EE217-00EC-4DE8-A2E6-489A08D4E524') + 8,
            'Priority',
            'Priority',
            'Ordering within an exclusive group — higher wins. Mirrors AIAgentStepPath.Priority so a compiled workflow chooses the same branch the flow editor shows. Ignored for edges that are not part of an ExclusiveGroup.',
            'int',
            4,
            10,
            0,
            0,
            '(0)',
            0,
            1,
            0,
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '8cf994f4-7444-4478-956b-62467e9de167' OR (EntityID = 'DD6EE217-00EC-4DE8-A2E6-489A08D4E524' AND Name = 'Sequence')) BEGIN
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
            '8cf994f4-7444-4478-956b-62467e9de167',
            'DD6EE217-00EC-4DE8-A2E6-489A08D4E524', -- Entity: MJ: Task Dependencies
            (SELECT COALESCE(MAX([Sequence]), 0) FROM [${flyway:defaultSchema}].[EntityField] WHERE [EntityID] = 'DD6EE217-00EC-4DE8-A2E6-489A08D4E524') + 9,
            'Sequence',
            'Sequence',
            'Deterministic tiebreak when two edges in an ExclusiveGroup share a Priority, applied ascending. Load-bearing rather than cosmetic: compiled dependencies get fresh UUIDs and Priority defaults to 0, so without a stored ordinal a tie would resolve by row order and the same workflow could take a different branch on a different machine.',
            'int',
            4,
            10,
            0,
            0,
            '(0)',
            0,
            1,
            0,
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = 'e3b30cae-adf8-4f1d-8826-5232dbb7419d' OR (EntityID = 'DD6EE217-00EC-4DE8-A2E6-489A08D4E524' AND Name = 'ExclusiveGroup')) BEGIN
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
            'e3b30cae-adf8-4f1d-8826-5232dbb7419d',
            'DD6EE217-00EC-4DE8-A2E6-489A08D4E524', -- Entity: MJ: Task Dependencies
            (SELECT COALESCE(MAX([Sequence]), 0) FROM [${flyway:defaultSchema}].[EntityField] WHERE [EntityID] = 'DD6EE217-00EC-4DE8-A2E6-489A08D4E524') + 10,
            'ExclusiveGroup',
            'Exclusive Group',
            'XOR group key: sibling edges leaving the same origin that share a non-null ExclusiveGroup are an exclusive fan-out. The highest-Priority satisfied edge wins, ties broken by ascending Sequence; the rest are Skipped. NULL (the default) means an ordinary dependency, so existing graphs are unaffected. An unevaluable condition anywhere in the group holds the whole group rather than firing every branch.',
            'nvarchar',
            510,
            0,
            0,
            1,
            NULL,
            0,
            1,
            0,
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

/* SQL text to insert entity field value with ID 3346099f-7e8b-49a9-97ef-ee9e111a5af4 */
INSERT INTO [${flyway:defaultSchema}].[EntityFieldValue]
                                       ([ID], [EntityFieldID], [Sequence], [Value], [Code], [__mj_CreatedAt], [__mj_UpdatedAt])
                                    VALUES
                                       ('3346099f-7e8b-49a9-97ef-ee9e111a5af4', '9320E9C7-764E-401B-BF2D-A07358E4DD00', 8, 'Skipped', 'Skipped', GETUTCDATE(), GETUTCDATE());

/* Index for Foreign Keys for TaskDependency */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Task Dependencies
-- Item: Index for Foreign Keys
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------
-- Index for foreign key TaskID in table TaskDependency
IF NOT EXISTS (
    SELECT 1
    FROM sys.indexes
    WHERE name = 'IDX_AUTO_MJ_FKEY_TaskDependency_TaskID' 
    AND object_id = OBJECT_ID('[${flyway:defaultSchema}].[TaskDependency]')
)
CREATE INDEX IDX_AUTO_MJ_FKEY_TaskDependency_TaskID ON [${flyway:defaultSchema}].[TaskDependency] ([TaskID]);

-- Index for foreign key DependsOnTaskID in table TaskDependency
IF NOT EXISTS (
    SELECT 1
    FROM sys.indexes
    WHERE name = 'IDX_AUTO_MJ_FKEY_TaskDependency_DependsOnTaskID' 
    AND object_id = OBJECT_ID('[${flyway:defaultSchema}].[TaskDependency]')
)
CREATE INDEX IDX_AUTO_MJ_FKEY_TaskDependency_DependsOnTaskID ON [${flyway:defaultSchema}].[TaskDependency] ([DependsOnTaskID]);

/* Base View SQL for MJ: Task Dependencies */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Task Dependencies
-- Item: vwTaskDependencies
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- BASE VIEW FOR ENTITY:      MJ: Task Dependencies
-----               SCHEMA:      ${flyway:defaultSchema}
-----               BASE TABLE:  TaskDependency
-----               PRIMARY KEY: ID
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[vwTaskDependencies]', 'V') IS NOT NULL
    DROP VIEW [${flyway:defaultSchema}].[vwTaskDependencies];
GO

CREATE VIEW [${flyway:defaultSchema}].[vwTaskDependencies]
AS
SELECT
    t.*,
    MJTask_TaskID.[Name] AS [Task],
    MJTask_DependsOnTaskID.[Name] AS [DependsOnTask]
FROM
    [${flyway:defaultSchema}].[TaskDependency] AS t
INNER JOIN
    [${flyway:defaultSchema}].[Task] AS MJTask_TaskID
  ON
    [t].[TaskID] = MJTask_TaskID.[ID]
INNER JOIN
    [${flyway:defaultSchema}].[Task] AS MJTask_DependsOnTaskID
  ON
    [t].[DependsOnTaskID] = MJTask_DependsOnTaskID.[ID]
GO
GRANT SELECT ON [${flyway:defaultSchema}].[vwTaskDependencies] TO [cdp_UI], [cdp_Developer], [cdp_Integration];

/* Base View Permissions SQL for MJ: Task Dependencies */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Task Dependencies
-- Item: Permissions for vwTaskDependencies
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

GRANT SELECT ON [${flyway:defaultSchema}].[vwTaskDependencies] TO [cdp_UI], [cdp_Developer], [cdp_Integration];

/* spCreate SQL for MJ: Task Dependencies */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Task Dependencies
-- Item: spCreateTaskDependency
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- CREATE PROCEDURE FOR TaskDependency
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[spCreateTaskDependency]', 'P') IS NOT NULL
    DROP PROCEDURE [${flyway:defaultSchema}].[spCreateTaskDependency];
GO

CREATE PROCEDURE [${flyway:defaultSchema}].[spCreateTaskDependency]
    @ID uniqueidentifier = NULL,
    @TaskID uniqueidentifier,
    @DependsOnTaskID uniqueidentifier,
    @DependencyType nvarchar(50) = NULL,
    @Condition_Clear bit = 0,
    @Condition nvarchar(MAX) = NULL,
    @Priority int = NULL,
    @Sequence int = NULL,
    @ExclusiveGroup_Clear bit = 0,
    @ExclusiveGroup nvarchar(255) = NULL
AS
BEGIN
    SET NOCOUNT ON;
    DECLARE @InsertedRow TABLE ([ID] UNIQUEIDENTIFIER)

    IF @ID IS NOT NULL
    BEGIN
        -- User provided a value, use it
        INSERT INTO [${flyway:defaultSchema}].[TaskDependency]
            (
                [ID],
                [TaskID],
                [DependsOnTaskID],
                [DependencyType],
                [Condition],
                [Priority],
                [Sequence],
                [ExclusiveGroup]
            )
        OUTPUT INSERTED.[ID] INTO @InsertedRow
        VALUES
            (
                @ID,
                @TaskID,
                @DependsOnTaskID,
                ISNULL(@DependencyType, 'Prerequisite'),
                CASE WHEN @Condition_Clear = 1 THEN NULL ELSE ISNULL(@Condition, NULL) END,
                ISNULL(@Priority, 0),
                ISNULL(@Sequence, 0),
                CASE WHEN @ExclusiveGroup_Clear = 1 THEN NULL ELSE ISNULL(@ExclusiveGroup, NULL) END
            )
    END
    ELSE
    BEGIN
        -- No value provided, let database use its default (e.g., NEWSEQUENTIALID())
        INSERT INTO [${flyway:defaultSchema}].[TaskDependency]
            (
                [TaskID],
                [DependsOnTaskID],
                [DependencyType],
                [Condition],
                [Priority],
                [Sequence],
                [ExclusiveGroup]
            )
        OUTPUT INSERTED.[ID] INTO @InsertedRow
        VALUES
            (
                @TaskID,
                @DependsOnTaskID,
                ISNULL(@DependencyType, 'Prerequisite'),
                CASE WHEN @Condition_Clear = 1 THEN NULL ELSE ISNULL(@Condition, NULL) END,
                ISNULL(@Priority, 0),
                ISNULL(@Sequence, 0),
                CASE WHEN @ExclusiveGroup_Clear = 1 THEN NULL ELSE ISNULL(@ExclusiveGroup, NULL) END
            )
    END
    -- return the new record from the base view, which might have some calculated fields
    SELECT * FROM [${flyway:defaultSchema}].[vwTaskDependencies] WHERE [ID] = (SELECT [ID] FROM @InsertedRow)
END
GO
GRANT EXECUTE ON [${flyway:defaultSchema}].[spCreateTaskDependency] TO [cdp_Developer], [cdp_Integration];

/* spCreate Permissions for MJ: Task Dependencies */

GRANT EXECUTE ON [${flyway:defaultSchema}].[spCreateTaskDependency] TO [cdp_Developer], [cdp_Integration];

/* spUpdate SQL for MJ: Task Dependencies */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Task Dependencies
-- Item: spUpdateTaskDependency
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- UPDATE PROCEDURE FOR TaskDependency
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[spUpdateTaskDependency]', 'P') IS NOT NULL
    DROP PROCEDURE [${flyway:defaultSchema}].[spUpdateTaskDependency];
GO

CREATE PROCEDURE [${flyway:defaultSchema}].[spUpdateTaskDependency]
    @ID uniqueidentifier,
    @TaskID uniqueidentifier = NULL,
    @DependsOnTaskID uniqueidentifier = NULL,
    @DependencyType nvarchar(50) = NULL,
    @Condition_Clear bit = 0,
    @Condition nvarchar(MAX) = NULL,
    @Priority int = NULL,
    @Sequence int = NULL,
    @ExclusiveGroup_Clear bit = 0,
    @ExclusiveGroup nvarchar(255) = NULL
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE
        [${flyway:defaultSchema}].[TaskDependency]
    SET
        [TaskID] = ISNULL(@TaskID, [TaskID]),
        [DependsOnTaskID] = ISNULL(@DependsOnTaskID, [DependsOnTaskID]),
        [DependencyType] = ISNULL(@DependencyType, [DependencyType]),
        [Condition] = CASE WHEN @Condition_Clear = 1 THEN NULL ELSE ISNULL(@Condition, [Condition]) END,
        [Priority] = ISNULL(@Priority, [Priority]),
        [Sequence] = ISNULL(@Sequence, [Sequence]),
        [ExclusiveGroup] = CASE WHEN @ExclusiveGroup_Clear = 1 THEN NULL ELSE ISNULL(@ExclusiveGroup, [ExclusiveGroup]) END
    WHERE
        [ID] = @ID

    -- Check if the update was successful
    IF @@ROWCOUNT = 0
        -- Nothing was updated, return no rows, but column structure from base view intact, semantically correct this way.
        SELECT TOP 0 * FROM [${flyway:defaultSchema}].[vwTaskDependencies] WHERE 1=0
    ELSE
        -- Return the updated record so the caller can see the updated values and any calculated fields
        SELECT
                                        *
                                    FROM
                                        [${flyway:defaultSchema}].[vwTaskDependencies]
                                    WHERE
                                        [ID] = @ID
                                    
END
GO

GRANT EXECUTE ON [${flyway:defaultSchema}].[spUpdateTaskDependency] TO [cdp_Developer], [cdp_Integration]
GO

------------------------------------------------------------
----- TRIGGER FOR __mj_UpdatedAt field for the TaskDependency table
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[trgUpdateTaskDependency]', 'TR') IS NOT NULL
    DROP TRIGGER [${flyway:defaultSchema}].[trgUpdateTaskDependency];
GO
CREATE TRIGGER [${flyway:defaultSchema}].trgUpdateTaskDependency
ON [${flyway:defaultSchema}].[TaskDependency]
AFTER UPDATE
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE
        [${flyway:defaultSchema}].[TaskDependency]
    SET
        __mj_UpdatedAt = GETUTCDATE()
    FROM
        [${flyway:defaultSchema}].[TaskDependency] AS _organicTable
    INNER JOIN
        INSERTED AS I ON
        _organicTable.[ID] = I.[ID];
END;
GO

/* spUpdate Permissions for MJ: Task Dependencies */

GRANT EXECUTE ON [${flyway:defaultSchema}].[spUpdateTaskDependency] TO [cdp_Developer], [cdp_Integration];

/* spDelete SQL for MJ: Task Dependencies */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Task Dependencies
-- Item: spDeleteTaskDependency
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- DELETE PROCEDURE FOR TaskDependency
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[spDeleteTaskDependency]', 'P') IS NOT NULL
    DROP PROCEDURE [${flyway:defaultSchema}].[spDeleteTaskDependency];
GO

CREATE PROCEDURE [${flyway:defaultSchema}].[spDeleteTaskDependency]
    @ID uniqueidentifier
AS
BEGIN
    SET NOCOUNT ON;

    DELETE FROM
        [${flyway:defaultSchema}].[TaskDependency]
    WHERE
        [ID] = @ID


    -- Check if the delete was successful
    IF @@ROWCOUNT = 0
        SELECT NULL AS [ID] -- Return NULL for all primary key fields to indicate no record was deleted
    ELSE
        SELECT @ID AS [ID] -- Return the primary key values to indicate we successfully deleted the record
END
GO
GRANT EXECUTE ON [${flyway:defaultSchema}].[spDeleteTaskDependency] TO [cdp_Developer], [cdp_Integration];

/* spDelete Permissions for MJ: Task Dependencies */

GRANT EXECUTE ON [${flyway:defaultSchema}].[spDeleteTaskDependency] TO [cdp_Developer], [cdp_Integration];

/* Set field properties for entity */

               UPDATE [${flyway:defaultSchema}].[EntityField]
               SET DefaultInView = 1
               WHERE ID = '416745C6-C8BC-416A-A476-F67EBADD7197'
               AND AutoUpdateDefaultInView = 1;

               UPDATE [${flyway:defaultSchema}].[EntityField]
               SET DefaultInView = 1
               WHERE ID = 'E3B30CAE-ADF8-4F1D-8826-5232DBB7419D'
               AND AutoUpdateDefaultInView = 1;

/* Set categories for 12 fields */

-- UPDATE Entity Field Category Info MJ: Task Dependencies.ID 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = '36FFBC49-1613-4DDF-BB5C-651AF6FF195F' AND AutoUpdateCategory = 1;

-- UPDATE Entity Field Category Info MJ: Task Dependencies.TaskID 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = 'BB9353EF-735C-4D86-9C5B-110CE8580BF9' AND AutoUpdateCategory = 1;

-- UPDATE Entity Field Category Info MJ: Task Dependencies.Task 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = '1EBFF46F-9F99-4E18-AEF0-C00D03FCD0B9' AND AutoUpdateCategory = 1;

-- UPDATE Entity Field Category Info MJ: Task Dependencies.DependsOnTaskID 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = '9233F1DA-6E87-4662-80B2-4227F37CE3DC' AND AutoUpdateCategory = 1;

-- UPDATE Entity Field Category Info MJ: Task Dependencies.DependencyType 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = '9AEC13B1-8C8B-4AF0-BA96-DD5E70BAA4E8' AND AutoUpdateCategory = 1;

-- UPDATE Entity Field Category Info MJ: Task Dependencies.Condition 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   GeneratedFormSection = 'Category',
   ExtendedType = 'Code',
   CodeType = 'SQL'
WHERE 
   ID = 'E48355ED-E858-4621-9E40-989891EC68F9' AND AutoUpdateCategory = 1;

-- UPDATE Entity Field Category Info MJ: Task Dependencies.DependsOnTask 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = '28044698-7E43-4AFA-9676-195B01FB5C54' AND AutoUpdateCategory = 1;

-- UPDATE Entity Field Category Info MJ: Task Dependencies.Priority 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Dependency Configuration',
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = '416745C6-C8BC-416A-A476-F67EBADD7197' AND AutoUpdateCategory = 1;

-- UPDATE Entity Field Category Info MJ: Task Dependencies.Sequence 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Dependency Configuration',
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = '8CF994F4-7444-4478-956B-62467E9DE167' AND AutoUpdateCategory = 1;

-- UPDATE Entity Field Category Info MJ: Task Dependencies.ExclusiveGroup 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Dependency Configuration',
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = 'E3B30CAE-ADF8-4F1D-8826-5232DBB7419D' AND AutoUpdateCategory = 1;

-- UPDATE Entity Field Category Info MJ: Task Dependencies.__mj_CreatedAt 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = 'D8793880-61E7-465E-86F7-5521BDCD4FD9' AND AutoUpdateCategory = 1;

-- UPDATE Entity Field Category Info MJ: Task Dependencies.__mj_UpdatedAt 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = 'E70F4C17-C4C4-4A89-AFDC-7C0C992360B4' AND AutoUpdateCategory = 1;

/* Insert FieldCategoryInfo setting for entity */

               INSERT INTO [${flyway:defaultSchema}].[EntitySetting] ([ID], [EntityID], [Name], [Value], [__mj_CreatedAt], [__mj_UpdatedAt])
               VALUES ('29c8500c-0e1c-49fd-9753-8d7923fca496', 'DD6EE217-00EC-4DE8-A2E6-489A08D4E524', 'FieldCategoryInfo', '{"Dependency Configuration":{"icon":"fa fa-sliders-h","description":"Advanced routing and ordering settings for task dependencies"}}', GETUTCDATE(), GETUTCDATE());

/* Update FieldCategoryIcons setting (legacy) */

               UPDATE [${flyway:defaultSchema}].[EntitySetting]
               SET [Value] = '{"Dependency Configuration":"fa fa-sliders-h"}', [__mj_UpdatedAt] = GETUTCDATE()
               WHERE [EntityID] = 'DD6EE217-00EC-4DE8-A2E6-489A08D4E524' AND [Name] = 'FieldCategoryIcons';

/* Generated Validation Functions for MJ: Tasks */
-- CHECK constraint for MJ: Tasks @ Table Level was newly set or modified since the last generation of the validation function, the code was regenerated and updating the GeneratedCode table with the new generated validation function
INSERT INTO [${flyway:defaultSchema}].[GeneratedCode] ([CategoryID], [GeneratedByModelID], [GeneratedAt], [Language], [Status], [Source], [Code], [Description], [Name], [LinkedEntityID], [LinkedRecordPrimaryKey])
                      VALUES ((SELECT [ID] FROM [${flyway:defaultSchema}].[vwGeneratedCodeCategories] WHERE [Name]='CodeGen: Validators'), 'C43229F6-4CC8-4838-9D04-03419A2DA191', GETUTCDATE(), 'TypeScript', 'Approved', '(((case when [UserID] IS NOT NULL then (1) else (0) end+case when [AgentID] IS NOT NULL then (1) else (0) end)+case when [ActionID] IS NOT NULL then (1) else (0) end)<=(1))', 'public ValidateExclusiveUserAgentOrAction(result: ValidationResult) {
    let count = 0;
    if (this.UserID != null) {
        count++;
    }
    if (this.AgentID != null) {
        count++;
    }
    if (this.ActionID != null) {
        count++;
    }

    if (count > 1) {
        result.Errors.push(new ValidationErrorInfo(
            "UserID",
            "Only one of User, Agent, or Action can be specified for a single record.",
            this.UserID,
            ValidationErrorType.Failure
        ));
    }
}', 'At most one of User, Agent, or Action can be associated with this record to ensure clear ownership and context.', 'ValidateExclusiveUserAgentOrAction', 'E0238F34-2837-EF11-86D4-6045BDEE16E6', '64AD3C8D-0570-48AF-AF4C-D0A2B173FDE1');

