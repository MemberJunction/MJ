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


/* ----------------------------------------------------------------------------------------------
   Give a Task row enough information to BE a workflow step.

   A workflow now compiles to a task graph and executes on the dispatcher, so a Task row has to
   carry what a workflow step carries: what kind of step it is, its kind-specific settings, how its
   input and output map onto the shared payload, and its execution policy. Today it can express only
   the first of those, and only for two of the seven kinds, through the AgentID and ActionID keys.

   Two consequences, both silent:

     1. A step that was neither agent nor action had nowhere to say what it was, so persistence fell
        through to "a person's task, assigned to whoever submitted it". A loop step became an
        approval request nobody wrote and no screen offers, and the workflow sat in Pending looking
        like it was politely waiting on someone.

     2. The input and output mappings were dropped on the way in. Those mappings are the only way a
        step's result reaches the payload, and branch conditions read the payload -- so the first
        branch in any real workflow could never evaluate. The Demo workflow branches on
        `payload.stockPrice > 500`, and stockPrice exists only because its first step maps
        CurrentPrice -> stockPrice. Without the mapping the condition has nothing to read.

   So this is not "add loop support". It is the set of columns without which a dispatched workflow
   cannot pass data between its own steps.

   Why two columns and one JSON bag, rather than eight columns:

     * StepType is the discriminator, so it must be a real column. The dispatcher's claiming query
       is SQL; routing on JSON_VALUE there is unindexable, and "find every loop step" should be a
       WHERE clause rather than a scan that parses JSON per row. Its value list is derived by
       CodeGen from the CHECK constraint below, which is what makes the generated union trustworthy.

       NOTE for readers who know AIAgentStep: this column is deliberately NOT the same value set as
       AIAgentStep.StepType, which is ('Action','ForEach','Prompt','Sub-Agent','While'). This one is
       the executable vocabulary -- 'Agent' rather than 'Sub-Agent', plus 'Human' and 'External',
       which a design-time step cannot express. Compilation maps between them. Same name, different
       lists, on purpose: they describe a step at two different stages of its life.

     * PromptID is a real foreign key for the same reason AgentID and ActionID are. A prompt name
       inside a JSON blob cannot be joined, cannot be constrained, and does not survive a rename.

     * Everything else -- kind-specific settings, the payload mappings, the execution policy -- goes
       into Configuration as a JSONType. None of it is ever a SQL predicate: the dispatcher loads
       the row and reads it in TypeScript. Keeping it in one typed bag means a new step kind, or a
       new policy knob, is a JSONType edit plus CodeGen rather than another migration. The typed
       shape lives in metadata/entities/JSONType-interfaces/ITaskStepConfiguration.ts and reaches
       the database through mj sync push, which is why CodeGen must run AFTER that push.

   NULL StepType is legal and meaningful: it is a Task that is not part of a workflow at all -- a
   hand-authored to-do. Defaulting the column would assert a kind for every such row.
   ---------------------------------------------------------------------------------------------- */

ALTER TABLE ${flyway:defaultSchema}.Task
ADD StepType NVARCHAR(20) NULL,
    PromptID UNIQUEIDENTIFIER NULL,
    Configuration NVARCHAR(MAX) NULL;
GO

ALTER TABLE ${flyway:defaultSchema}.Task
ADD CONSTRAINT CK_Task_StepType
    CHECK (StepType IN ('Agent', 'Action', 'Human', 'Prompt', 'ForEach', 'While', 'External'));
GO

ALTER TABLE ${flyway:defaultSchema}.Task
ADD CONSTRAINT FK_Task_Prompt
    FOREIGN KEY (PromptID) REFERENCES ${flyway:defaultSchema}.AIPrompt(ID);
GO

/* CK_Task_Assignment has to be rewritten, not left alone.

   V202608081200 defined it as UserID + AgentID + ActionID <= 1 -- at most one assignment, all-NULL
   legal because a parent row is assigned to nothing. PromptID is a fourth assignment and must join
   that sum. Leaving the constraint as it was would let a row carry BOTH a PromptID and an AgentID,
   which is precisely the ambiguity the constraint exists to make unrepresentable. */
IF EXISTS (
    SELECT 1
    FROM sys.check_constraints cc
    INNER JOIN sys.schemas s ON s.schema_id = cc.schema_id
    INNER JOIN sys.tables t ON t.object_id = cc.parent_object_id
    WHERE cc.name = N'CK_Task_Assignment'
      AND s.name = N'${flyway:defaultSchema}'
      AND t.name = N'Task'
)
BEGIN
    ALTER TABLE [${flyway:defaultSchema}].[Task] DROP CONSTRAINT [CK_Task_Assignment];
END
GO

ALTER TABLE [${flyway:defaultSchema}].[Task]
    ADD CONSTRAINT [CK_Task_Assignment] CHECK (
        -- At most one assignment. All-NULL stays legal: a parent graph row is assigned to nothing.
        (CASE WHEN [UserID]   IS NOT NULL THEN 1 ELSE 0 END) +
        (CASE WHEN [AgentID]  IS NOT NULL THEN 1 ELSE 0 END) +
        (CASE WHEN [ActionID] IS NOT NULL THEN 1 ELSE 0 END) +
        (CASE WHEN [PromptID] IS NOT NULL THEN 1 ELSE 0 END) <= 1
    );
GO

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'Which kind of workflow step this task represents. NULL for a task that is not part of a workflow, such as a hand-authored to-do. Determines which of AgentID/ActionID/PromptID/UserID is meaningful and how Configuration is read. This is the executable vocabulary and is deliberately not the same value list as AIAgentStep.StepType, which describes a step at design time.',
    @level0type = N'SCHEMA', @level0name = '${flyway:defaultSchema}',
    @level1type = N'TABLE', @level1name = 'Task',
    @level2type = N'COLUMN', @level2name = 'StepType';
GO

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'Everything about this step that has no column of its own, as JSON: the loop definition for a ForEach or While step, an agent step''s message and template parameters, the mappings that move data between this step and the workflow payload, and the execution policy (timeout, retries, what to do on failure). Typed by ITaskStepConfiguration.',
    @level0type = N'SCHEMA', @level0name = '${flyway:defaultSchema}',
    @level1type = N'TABLE', @level1name = 'Task',
    @level2type = N'COLUMN', @level2name = 'Configuration';
GO




















































/* ==============================================================================================
   ==============================================================================================
   ==
   ==   METADATA REFRESH -- INLINED COPY OF R__RefreshMetadata.sql
   ==
   ==   Why this is here rather than left to the repeatable script. Flyway runs EVERY versioned
   ==   migration before ANY repeatable one. On a live database that ordering is invisible: R
   ==   already ran after the previous release, so by the time this migration executes, the entity
   ==   and field metadata its generated block below was produced against is reconciled.
   ==
   ==   On a REPLAY from the baseline it is not. The DDL above lands, but the metadata the generated
   ==   block assumes -- reconciled EntityField rows, recompiled views, renumbered sequences -- does
   ==   not exist yet, because R will not run until every versioned migration has finished. The
   ==   generated block then executes against a database in a state it was never generated for.
   ==
   ==   Running the refresh here puts the database into that state, so a from-scratch build arrives
   ==   where a live upgrade arrives. R still runs at the end as normal; doing it twice costs a few
   ==   seconds and changes nothing, because every statement below is idempotent.
   ==
   ==   This is a verbatim copy of migrations/R__RefreshMetadata.sql MINUS its ${flyway:timestamp}
   ==   line -- that line exists solely to churn the repeatable script's checksum on every run, and
   ==   including it here would make THIS migration's checksum unstable, which is the one thing a
   ==   versioned migration may never be.
   ==
   ==   A future consolidated baseline (B script) removes the need for this.
   ==
   ==============================================================================================
   ============================================================================================== */

/* SQL text to recompile all views */
EXEC [${flyway:defaultSchema}].spRecompileAllViews
GO

/* SQL text to update existing entities from schema */
EXEC [${flyway:defaultSchema}].spUpdateExistingEntitiesFromSchema @ExcludedSchemaNames='sys,staging'
GO

/* SQL text to sync schema info from database schemas */
EXEC [${flyway:defaultSchema}].spUpdateSchemaInfoFromDatabase @ExcludedSchemaNames='sys,staging'
GO

/* SQL text to delete unneeded entity fields */
EXEC [${flyway:defaultSchema}].spDeleteUnneededEntityFields @ExcludedSchemaNames='sys,staging'
GO

/* SQL text to update existing entity fields from schema */
EXEC [${flyway:defaultSchema}].spUpdateExistingEntityFieldsFromSchema @ExcludedSchemaNames='sys,staging'
GO

/* SQL text to set default column width where needed */
EXEC [${flyway:defaultSchema}].spSetDefaultColumnWidthWhereNeeded @ExcludedSchemaNames='sys,staging'
GO

/* SQL text to recompile all stored procedures in dependency order */
EXEC [${flyway:defaultSchema}].spRecompileAllProceduresInDependencyOrder @ExcludedSchemaNames='sys,staging', @LogOutput=0, @ContinueOnError=1
GO



















































/* ==============================================================================================
   ==============================================================================================
   ==
   ==   EVERYTHING BELOW THIS LINE WAS GENERATED BY THE MEMBERJUNCTION CODEGEN TOOL.
   ==   DO NOT EDIT IT BY HAND.
   ==
   ==   It is the database-side consequence of the hand-written DDL above: the EntityField rows for
   ==   Task.StepType / Task.PromptID / Task.Configuration and TaskDependency.Priority / .Sequence /
   ==   .ExclusiveGroup, the EntityFieldValue rows CodeGen derives from CK_Task_StepType and the
   ==   widened CK_Task_Status (including 'Skipped'), the Task -> AI Prompts relationship, the
   ==   regenerated vwTasks / vwTaskDependencies views, the regenerated spCreate / spUpdate /
   ==   spDelete procedures for both entities, the permission grants on those procedures, and the
   ==   extended properties.
   ==
   ==   WHY THIS SECTION IS REQUIRED, and why it sits BELOW the metadata refresh rather than above
   ==   it. The refresh reconciles entity fields that already EXIST; it does not create rows for new
   ==   columns and it does not derive value lists from CHECK constraints -- both of those are
   ==   CodeGen's job. Verified rather than assumed: a migrate-only build of this database produced
   ==   zero EntityField rows for the six columns above and zero EntityFieldValue rows for StepType,
   ==   while vwTasks did pick the columns up (spRecompileAllViews regenerates views from schema).
   ==   So without this block a from-scratch database would carry the columns but no metadata for
   ==   them, and the generated ORM would silently lack the fields.
   ==
   ==   That ordering also makes the hardcoded IDs below safe. Because the refresh never creates
   ==   these rows, the EntityField INSERTs here are what bring them into existence -- so the
   ==   EntityFieldValue rows that reference those IDs always find them. Running this section BEFORE
   ==   the refresh would be equally correct; running the refresh in a way that created the rows
   ==   first would NOT be, because the IDs would diverge and the value-list inserts would fail a
   ==   foreign key -- reported, as they always are, as an error that looks unrelated.
   ==
   ==   IF THE HAND-WRITTEN DDL ABOVE CHANGES, DO NOT PATCH THIS SECTION. Re-run `mj codegen` and
   ==   replace this entire generated block with the new CodeGen_Run_*.sql output.
   ==
   ==============================================================================================
   ============================================================================================== */

/* SQL text to insert 10 new entity field(s) */

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '4cda9696-9323-4f39-8f1c-5420fc4a3d30' OR (EntityID = 'DD6EE217-00EC-4DE8-A2E6-489A08D4E524' AND Name = 'Priority')) BEGIN
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
            '4cda9696-9323-4f39-8f1c-5420fc4a3d30',
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = 'a7c3836b-046c-46cd-9153-4e39c616f88c' OR (EntityID = 'DD6EE217-00EC-4DE8-A2E6-489A08D4E524' AND Name = 'Sequence')) BEGIN
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
            'a7c3836b-046c-46cd-9153-4e39c616f88c',
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '1acd1af2-0477-47ec-a3cf-9e63c563cc72' OR (EntityID = 'DD6EE217-00EC-4DE8-A2E6-489A08D4E524' AND Name = 'ExclusiveGroup')) BEGIN
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
            '1acd1af2-0477-47ec-a3cf-9e63c563cc72',
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '3c0ce0ef-3780-4f25-9cad-e466668d4a36' OR (EntityID = '35248F34-2837-EF11-86D4-6045BDEE16E6' AND Name = 'EntityAction')) BEGIN
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
            '3c0ce0ef-3780-4f25-9cad-e466668d4a36',
            '35248F34-2837-EF11-86D4-6045BDEE16E6', -- Entity: MJ: Entity Action Invocations
            (SELECT COALESCE(MAX([Sequence]), 0) FROM [${flyway:defaultSchema}].[EntityField] WHERE [EntityID] = '35248F34-2837-EF11-86D4-6045BDEE16E6') + 8,
            'EntityAction',
            'Entity Action',
            NULL,
            'nvarchar',
            850,
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = 'ebfe65ba-61e6-4c46-aaa1-02bfd1555fa6' OR (EntityID = '39248F34-2837-EF11-86D4-6045BDEE16E6' AND Name = 'EntityAction')) BEGIN
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
            'ebfe65ba-61e6-4c46-aaa1-02bfd1555fa6',
            '39248F34-2837-EF11-86D4-6045BDEE16E6', -- Entity: MJ: Entity Action Filters
            (SELECT COALESCE(MAX([Sequence]), 0) FROM [${flyway:defaultSchema}].[EntityField] WHERE [EntityID] = '39248F34-2837-EF11-86D4-6045BDEE16E6') + 8,
            'EntityAction',
            'Entity Action',
            NULL,
            'nvarchar',
            850,
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '89d8f12c-147b-4e4a-9039-ca7135753a66' OR (EntityID = '3E248F34-2837-EF11-86D4-6045BDEE16E6' AND Name = 'EntityAction')) BEGIN
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
            '89d8f12c-147b-4e4a-9039-ca7135753a66',
            '3E248F34-2837-EF11-86D4-6045BDEE16E6', -- Entity: MJ: Action Execution Logs
            (SELECT COALESCE(MAX([Sequence]), 0) FROM [${flyway:defaultSchema}].[EntityField] WHERE [EntityID] = '3E248F34-2837-EF11-86D4-6045BDEE16E6') + 19,
            'EntityAction',
            'Entity Action',
            NULL,
            'nvarchar',
            850,
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '1106b6f6-6631-41ba-b73a-6489b6738655' OR (EntityID = '56248F34-2837-EF11-86D4-6045BDEE16E6' AND Name = 'EntityAction')) BEGIN
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
            '1106b6f6-6631-41ba-b73a-6489b6738655',
            '56248F34-2837-EF11-86D4-6045BDEE16E6', -- Entity: MJ: Entity Action Params
            (SELECT COALESCE(MAX([Sequence]), 0) FROM [${flyway:defaultSchema}].[EntityField] WHERE [EntityID] = '56248F34-2837-EF11-86D4-6045BDEE16E6') + 10,
            'EntityAction',
            'Entity Action',
            NULL,
            'nvarchar',
            850,
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '0efec745-eb79-4b5f-974e-3ef93a02b3f3' OR (EntityID = '64AD3C8D-0570-48AF-AF4C-D0A2B173FDE1' AND Name = 'StepType')) BEGIN
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
            '0efec745-eb79-4b5f-974e-3ef93a02b3f3',
            '64AD3C8D-0570-48AF-AF4C-D0A2B173FDE1', -- Entity: MJ: Tasks
            (SELECT COALESCE(MAX([Sequence]), 0) FROM [${flyway:defaultSchema}].[EntityField] WHERE [EntityID] = '64AD3C8D-0570-48AF-AF4C-D0A2B173FDE1') + 25,
            'StepType',
            'Step Type',
            'Which kind of workflow step this task represents. NULL for a task that is not part of a workflow, such as a hand-authored to-do. Determines which of AgentID/ActionID/PromptID/UserID is meaningful and how Configuration is read. This is the executable vocabulary and is deliberately not the same value list as AIAgentStep.StepType, which describes a step at design time.',
            'nvarchar',
            40,
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '42cf0a0b-1729-468d-ad07-9697999fa8b8' OR (EntityID = '64AD3C8D-0570-48AF-AF4C-D0A2B173FDE1' AND Name = 'PromptID')) BEGIN
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
            '42cf0a0b-1729-468d-ad07-9697999fa8b8',
            '64AD3C8D-0570-48AF-AF4C-D0A2B173FDE1', -- Entity: MJ: Tasks
            (SELECT COALESCE(MAX([Sequence]), 0) FROM [${flyway:defaultSchema}].[EntityField] WHERE [EntityID] = '64AD3C8D-0570-48AF-AF4C-D0A2B173FDE1') + 26,
            'PromptID',
            'Prompt ID',
            NULL,
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
            '73AD0238-8B56-EF11-991A-6045BDEBA539',
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '9f4fcd1b-cb01-43e6-8bf5-af01af34ce4a' OR (EntityID = '64AD3C8D-0570-48AF-AF4C-D0A2B173FDE1' AND Name = 'Configuration')) BEGIN
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
            '9f4fcd1b-cb01-43e6-8bf5-af01af34ce4a',
            '64AD3C8D-0570-48AF-AF4C-D0A2B173FDE1', -- Entity: MJ: Tasks
            (SELECT COALESCE(MAX([Sequence]), 0) FROM [${flyway:defaultSchema}].[EntityField] WHERE [EntityID] = '64AD3C8D-0570-48AF-AF4C-D0A2B173FDE1') + 27,
            'Configuration',
            'Configuration',
            'Everything about this step that has no column of its own, as JSON: the loop definition for a ForEach or While step, an agent step''s message and template parameters, the mappings that move data between this step and the workflow payload, and the execution policy (timeout, retries, what to do on failure). Typed by ITaskStepConfiguration.',
            'nvarchar',
            -1,
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

/* SQL text to insert entity field value with ID 3a2cda93-8280-4399-8edf-058d596d7dd2 */
INSERT INTO [${flyway:defaultSchema}].[EntityFieldValue]
                                       ([ID], [EntityFieldID], [Sequence], [Value], [Code], [__mj_CreatedAt], [__mj_UpdatedAt])
                                    VALUES
                                       ('3a2cda93-8280-4399-8edf-058d596d7dd2', '9320E9C7-764E-401B-BF2D-A07358E4DD00', 8, 'Skipped', 'Skipped', GETUTCDATE(), GETUTCDATE());

/* SQL text to insert entity field value with ID 1ce90fe7-1612-4f99-8b0d-572f850f03ee */
INSERT INTO [${flyway:defaultSchema}].[EntityFieldValue]
                                       ([ID], [EntityFieldID], [Sequence], [Value], [Code], [__mj_CreatedAt], [__mj_UpdatedAt])
                                    VALUES
                                       ('1ce90fe7-1612-4f99-8b0d-572f850f03ee', '0EFEC745-EB79-4B5F-974E-3EF93A02B3F3', 1, 'Action', 'Action', GETUTCDATE(), GETUTCDATE());

/* SQL text to insert entity field value with ID 4a82ebee-f8b7-4776-affd-2e86a185c202 */
INSERT INTO [${flyway:defaultSchema}].[EntityFieldValue]
                                       ([ID], [EntityFieldID], [Sequence], [Value], [Code], [__mj_CreatedAt], [__mj_UpdatedAt])
                                    VALUES
                                       ('4a82ebee-f8b7-4776-affd-2e86a185c202', '0EFEC745-EB79-4B5F-974E-3EF93A02B3F3', 2, 'Agent', 'Agent', GETUTCDATE(), GETUTCDATE());

/* SQL text to insert entity field value with ID 6198725b-8dd0-4161-8d8e-de752edb140f */
INSERT INTO [${flyway:defaultSchema}].[EntityFieldValue]
                                       ([ID], [EntityFieldID], [Sequence], [Value], [Code], [__mj_CreatedAt], [__mj_UpdatedAt])
                                    VALUES
                                       ('6198725b-8dd0-4161-8d8e-de752edb140f', '0EFEC745-EB79-4B5F-974E-3EF93A02B3F3', 3, 'External', 'External', GETUTCDATE(), GETUTCDATE());

/* SQL text to insert entity field value with ID fa0a7bea-da45-4581-bf9d-b0fb41be706e */
INSERT INTO [${flyway:defaultSchema}].[EntityFieldValue]
                                       ([ID], [EntityFieldID], [Sequence], [Value], [Code], [__mj_CreatedAt], [__mj_UpdatedAt])
                                    VALUES
                                       ('fa0a7bea-da45-4581-bf9d-b0fb41be706e', '0EFEC745-EB79-4B5F-974E-3EF93A02B3F3', 4, 'ForEach', 'ForEach', GETUTCDATE(), GETUTCDATE());

/* SQL text to insert entity field value with ID a32ad617-18ad-4b60-8921-20fafd43075b */
INSERT INTO [${flyway:defaultSchema}].[EntityFieldValue]
                                       ([ID], [EntityFieldID], [Sequence], [Value], [Code], [__mj_CreatedAt], [__mj_UpdatedAt])
                                    VALUES
                                       ('a32ad617-18ad-4b60-8921-20fafd43075b', '0EFEC745-EB79-4B5F-974E-3EF93A02B3F3', 5, 'Human', 'Human', GETUTCDATE(), GETUTCDATE());

/* SQL text to insert entity field value with ID 72eddbc2-2419-4b1e-add7-2975b69099ac */
INSERT INTO [${flyway:defaultSchema}].[EntityFieldValue]
                                       ([ID], [EntityFieldID], [Sequence], [Value], [Code], [__mj_CreatedAt], [__mj_UpdatedAt])
                                    VALUES
                                       ('72eddbc2-2419-4b1e-add7-2975b69099ac', '0EFEC745-EB79-4B5F-974E-3EF93A02B3F3', 6, 'Prompt', 'Prompt', GETUTCDATE(), GETUTCDATE());

/* SQL text to insert entity field value with ID 3ad5aa6d-3d27-4550-8919-5f720df9ec8f */
INSERT INTO [${flyway:defaultSchema}].[EntityFieldValue]
                                       ([ID], [EntityFieldID], [Sequence], [Value], [Code], [__mj_CreatedAt], [__mj_UpdatedAt])
                                    VALUES
                                       ('3ad5aa6d-3d27-4550-8919-5f720df9ec8f', '0EFEC745-EB79-4B5F-974E-3EF93A02B3F3', 7, 'While', 'While', GETUTCDATE(), GETUTCDATE());

/* SQL text to update ValueListType for entity field ID 0EFEC745-EB79-4B5F-974E-3EF93A02B3F3 */
UPDATE [${flyway:defaultSchema}].[EntityField] SET ValueListType='List' WHERE ID='0EFEC745-EB79-4B5F-974E-3EF93A02B3F3';


/* Create Entity Relationship: MJ: AI Prompts -> MJ: Tasks (One To Many via PromptID) */
   IF NOT EXISTS (
      SELECT 1 FROM [${flyway:defaultSchema}].[EntityRelationship] WHERE [ID] = 'f285a24a-6d4a-4df3-a899-87180035a392'
   )
   BEGIN
      INSERT INTO [${flyway:defaultSchema}].[EntityRelationship] ([ID], [EntityID], [RelatedEntityID], [RelatedEntityJoinField], [Type], [BundleInAPI], [DisplayInForm], [Sequence], [__mj_CreatedAt], [__mj_UpdatedAt])
                    VALUES ('f285a24a-6d4a-4df3-a899-87180035a392', '73AD0238-8B56-EF11-991A-6045BDEBA539', '64AD3C8D-0570-48AF-AF4C-D0A2B173FDE1', 'PromptID', 'One To Many', 1, 1, 22, GETUTCDATE(), GETUTCDATE())
   END;

/* Index for Foreign Keys for ActionExecutionLog */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Action Execution Logs
-- Item: Index for Foreign Keys
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------
-- Index for foreign key ActionID in table ActionExecutionLog
IF NOT EXISTS (
    SELECT 1
    FROM sys.indexes
    WHERE name = 'IDX_AUTO_MJ_FKEY_ActionExecutionLog_ActionID' 
    AND object_id = OBJECT_ID('[${flyway:defaultSchema}].[ActionExecutionLog]')
)
CREATE INDEX IDX_AUTO_MJ_FKEY_ActionExecutionLog_ActionID ON [${flyway:defaultSchema}].[ActionExecutionLog] ([ActionID]);

-- Index for foreign key UserID in table ActionExecutionLog
IF NOT EXISTS (
    SELECT 1
    FROM sys.indexes
    WHERE name = 'IDX_AUTO_MJ_FKEY_ActionExecutionLog_UserID' 
    AND object_id = OBJECT_ID('[${flyway:defaultSchema}].[ActionExecutionLog]')
)
CREATE INDEX IDX_AUTO_MJ_FKEY_ActionExecutionLog_UserID ON [${flyway:defaultSchema}].[ActionExecutionLog] ([UserID]);

-- Index for foreign key EntityActionID in table ActionExecutionLog
IF NOT EXISTS (
    SELECT 1
    FROM sys.indexes
    WHERE name = 'IDX_AUTO_MJ_FKEY_ActionExecutionLog_EntityActionID' 
    AND object_id = OBJECT_ID('[${flyway:defaultSchema}].[ActionExecutionLog]')
)
CREATE INDEX IDX_AUTO_MJ_FKEY_ActionExecutionLog_EntityActionID ON [${flyway:defaultSchema}].[ActionExecutionLog] ([EntityActionID]);

-- Index for foreign key EntityActionInvocationTypeID in table ActionExecutionLog
IF NOT EXISTS (
    SELECT 1
    FROM sys.indexes
    WHERE name = 'IDX_AUTO_MJ_FKEY_ActionExecutionLog_EntityActionInvocationTypeID' 
    AND object_id = OBJECT_ID('[${flyway:defaultSchema}].[ActionExecutionLog]')
)
CREATE INDEX IDX_AUTO_MJ_FKEY_ActionExecutionLog_EntityActionInvocationTypeID ON [${flyway:defaultSchema}].[ActionExecutionLog] ([EntityActionInvocationTypeID]);

-- Index for foreign key TargetEntityID in table ActionExecutionLog
IF NOT EXISTS (
    SELECT 1
    FROM sys.indexes
    WHERE name = 'IDX_AUTO_MJ_FKEY_ActionExecutionLog_TargetEntityID' 
    AND object_id = OBJECT_ID('[${flyway:defaultSchema}].[ActionExecutionLog]')
)
CREATE INDEX IDX_AUTO_MJ_FKEY_ActionExecutionLog_TargetEntityID ON [${flyway:defaultSchema}].[ActionExecutionLog] ([TargetEntityID]);

/* Base View SQL for MJ: Action Execution Logs */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Action Execution Logs
-- Item: vwActionExecutionLogs
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- BASE VIEW FOR ENTITY:      MJ: Action Execution Logs
-----               SCHEMA:      ${flyway:defaultSchema}
-----               BASE TABLE:  ActionExecutionLog
-----               PRIMARY KEY: ID
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[vwActionExecutionLogs]', 'V') IS NOT NULL
    DROP VIEW [${flyway:defaultSchema}].[vwActionExecutionLogs];
GO

CREATE VIEW [${flyway:defaultSchema}].[vwActionExecutionLogs]
AS
SELECT
    a.*,
    MJAction_ActionID.[Name] AS [Action],
    MJUser_UserID.[Name] AS [User],
    MJEntityActionInvocationType_EntityActionInvocationTypeID.[Name] AS [EntityActionInvocationType],
    MJEntity_TargetEntityID.[Name] AS [TargetEntity]
FROM
    [${flyway:defaultSchema}].[ActionExecutionLog] AS a
INNER JOIN
    [${flyway:defaultSchema}].[Action] AS MJAction_ActionID
  ON
    [a].[ActionID] = MJAction_ActionID.[ID]
INNER JOIN
    [${flyway:defaultSchema}].[User] AS MJUser_UserID
  ON
    [a].[UserID] = MJUser_UserID.[ID]
LEFT OUTER JOIN
    [${flyway:defaultSchema}].[EntityActionInvocationType] AS MJEntityActionInvocationType_EntityActionInvocationTypeID
  ON
    [a].[EntityActionInvocationTypeID] = MJEntityActionInvocationType_EntityActionInvocationTypeID.[ID]
LEFT OUTER JOIN
    [${flyway:defaultSchema}].[Entity] AS MJEntity_TargetEntityID
  ON
    [a].[TargetEntityID] = MJEntity_TargetEntityID.[ID]
GO
GRANT SELECT ON [${flyway:defaultSchema}].[vwActionExecutionLogs] TO [cdp_UI], [cdp_Integration], [cdp_Developer];

/* Base View Permissions SQL for MJ: Action Execution Logs */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Action Execution Logs
-- Item: Permissions for vwActionExecutionLogs
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

GRANT SELECT ON [${flyway:defaultSchema}].[vwActionExecutionLogs] TO [cdp_UI], [cdp_Integration], [cdp_Developer];

/* spCreate SQL for MJ: Action Execution Logs */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Action Execution Logs
-- Item: spCreateActionExecutionLog
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- CREATE PROCEDURE FOR ActionExecutionLog
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[spCreateActionExecutionLog]', 'P') IS NOT NULL
    DROP PROCEDURE [${flyway:defaultSchema}].[spCreateActionExecutionLog];
GO

CREATE PROCEDURE [${flyway:defaultSchema}].[spCreateActionExecutionLog]
    @ID uniqueidentifier = NULL,
    @ActionID uniqueidentifier,
    @StartedAt datetimeoffset = NULL,
    @EndedAt_Clear bit = 0,
    @EndedAt datetimeoffset = NULL,
    @Params_Clear bit = 0,
    @Params nvarchar(MAX) = NULL,
    @ResultCode_Clear bit = 0,
    @ResultCode nvarchar(255) = NULL,
    @UserID uniqueidentifier,
    @RetentionPeriod_Clear bit = 0,
    @RetentionPeriod int = NULL,
    @Message_Clear bit = 0,
    @Message nvarchar(MAX) = NULL,
    @EntityActionID_Clear bit = 0,
    @EntityActionID uniqueidentifier = NULL,
    @EntityActionInvocationTypeID_Clear bit = 0,
    @EntityActionInvocationTypeID uniqueidentifier = NULL,
    @TargetEntityID_Clear bit = 0,
    @TargetEntityID uniqueidentifier = NULL,
    @TargetRecordID_Clear bit = 0,
    @TargetRecordID nvarchar(450) = NULL,
    @ResultParams_Clear bit = 0,
    @ResultParams nvarchar(MAX) = NULL
AS
BEGIN
    SET NOCOUNT ON;
    DECLARE @InsertedRow TABLE ([ID] UNIQUEIDENTIFIER)

    IF @ID IS NOT NULL
    BEGIN
        -- User provided a value, use it
        INSERT INTO [${flyway:defaultSchema}].[ActionExecutionLog]
            (
                [ID],
                [ActionID],
                [StartedAt],
                [EndedAt],
                [Params],
                [ResultCode],
                [UserID],
                [RetentionPeriod],
                [Message],
                [EntityActionID],
                [EntityActionInvocationTypeID],
                [TargetEntityID],
                [TargetRecordID],
                [ResultParams]
            )
        OUTPUT INSERTED.[ID] INTO @InsertedRow
        VALUES
            (
                @ID,
                @ActionID,
                ISNULL(@StartedAt, sysdatetimeoffset()),
                CASE WHEN @EndedAt_Clear = 1 THEN NULL ELSE ISNULL(@EndedAt, NULL) END,
                CASE WHEN @Params_Clear = 1 THEN NULL ELSE ISNULL(@Params, NULL) END,
                CASE WHEN @ResultCode_Clear = 1 THEN NULL ELSE ISNULL(@ResultCode, NULL) END,
                @UserID,
                CASE WHEN @RetentionPeriod_Clear = 1 THEN NULL ELSE ISNULL(@RetentionPeriod, NULL) END,
                CASE WHEN @Message_Clear = 1 THEN NULL ELSE ISNULL(@Message, NULL) END,
                CASE WHEN @EntityActionID_Clear = 1 THEN NULL ELSE ISNULL(@EntityActionID, NULL) END,
                CASE WHEN @EntityActionInvocationTypeID_Clear = 1 THEN NULL ELSE ISNULL(@EntityActionInvocationTypeID, NULL) END,
                CASE WHEN @TargetEntityID_Clear = 1 THEN NULL ELSE ISNULL(@TargetEntityID, NULL) END,
                CASE WHEN @TargetRecordID_Clear = 1 THEN NULL ELSE ISNULL(@TargetRecordID, NULL) END,
                CASE WHEN @ResultParams_Clear = 1 THEN NULL ELSE ISNULL(@ResultParams, NULL) END
            )
    END
    ELSE
    BEGIN
        -- No value provided, let database use its default (e.g., NEWSEQUENTIALID())
        INSERT INTO [${flyway:defaultSchema}].[ActionExecutionLog]
            (
                [ActionID],
                [StartedAt],
                [EndedAt],
                [Params],
                [ResultCode],
                [UserID],
                [RetentionPeriod],
                [Message],
                [EntityActionID],
                [EntityActionInvocationTypeID],
                [TargetEntityID],
                [TargetRecordID],
                [ResultParams]
            )
        OUTPUT INSERTED.[ID] INTO @InsertedRow
        VALUES
            (
                @ActionID,
                ISNULL(@StartedAt, sysdatetimeoffset()),
                CASE WHEN @EndedAt_Clear = 1 THEN NULL ELSE ISNULL(@EndedAt, NULL) END,
                CASE WHEN @Params_Clear = 1 THEN NULL ELSE ISNULL(@Params, NULL) END,
                CASE WHEN @ResultCode_Clear = 1 THEN NULL ELSE ISNULL(@ResultCode, NULL) END,
                @UserID,
                CASE WHEN @RetentionPeriod_Clear = 1 THEN NULL ELSE ISNULL(@RetentionPeriod, NULL) END,
                CASE WHEN @Message_Clear = 1 THEN NULL ELSE ISNULL(@Message, NULL) END,
                CASE WHEN @EntityActionID_Clear = 1 THEN NULL ELSE ISNULL(@EntityActionID, NULL) END,
                CASE WHEN @EntityActionInvocationTypeID_Clear = 1 THEN NULL ELSE ISNULL(@EntityActionInvocationTypeID, NULL) END,
                CASE WHEN @TargetEntityID_Clear = 1 THEN NULL ELSE ISNULL(@TargetEntityID, NULL) END,
                CASE WHEN @TargetRecordID_Clear = 1 THEN NULL ELSE ISNULL(@TargetRecordID, NULL) END,
                CASE WHEN @ResultParams_Clear = 1 THEN NULL ELSE ISNULL(@ResultParams, NULL) END
            )
    END
    -- return the new record from the base view, which might have some calculated fields
    SELECT * FROM [${flyway:defaultSchema}].[vwActionExecutionLogs] WHERE [ID] = (SELECT [ID] FROM @InsertedRow)
END
GO
GRANT EXECUTE ON [${flyway:defaultSchema}].[spCreateActionExecutionLog] TO [cdp_Integration], [cdp_Developer];

/* spCreate Permissions for MJ: Action Execution Logs */

GRANT EXECUTE ON [${flyway:defaultSchema}].[spCreateActionExecutionLog] TO [cdp_Integration], [cdp_Developer];

/* spUpdate SQL for MJ: Action Execution Logs */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Action Execution Logs
-- Item: spUpdateActionExecutionLog
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- UPDATE PROCEDURE FOR ActionExecutionLog
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[spUpdateActionExecutionLog]', 'P') IS NOT NULL
    DROP PROCEDURE [${flyway:defaultSchema}].[spUpdateActionExecutionLog];
GO

CREATE PROCEDURE [${flyway:defaultSchema}].[spUpdateActionExecutionLog]
    @ID uniqueidentifier,
    @ActionID uniqueidentifier = NULL,
    @StartedAt datetimeoffset = NULL,
    @EndedAt_Clear bit = 0,
    @EndedAt datetimeoffset = NULL,
    @Params_Clear bit = 0,
    @Params nvarchar(MAX) = NULL,
    @ResultCode_Clear bit = 0,
    @ResultCode nvarchar(255) = NULL,
    @UserID uniqueidentifier = NULL,
    @RetentionPeriod_Clear bit = 0,
    @RetentionPeriod int = NULL,
    @Message_Clear bit = 0,
    @Message nvarchar(MAX) = NULL,
    @EntityActionID_Clear bit = 0,
    @EntityActionID uniqueidentifier = NULL,
    @EntityActionInvocationTypeID_Clear bit = 0,
    @EntityActionInvocationTypeID uniqueidentifier = NULL,
    @TargetEntityID_Clear bit = 0,
    @TargetEntityID uniqueidentifier = NULL,
    @TargetRecordID_Clear bit = 0,
    @TargetRecordID nvarchar(450) = NULL,
    @ResultParams_Clear bit = 0,
    @ResultParams nvarchar(MAX) = NULL
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE
        [${flyway:defaultSchema}].[ActionExecutionLog]
    SET
        [ActionID] = ISNULL(@ActionID, [ActionID]),
        [StartedAt] = ISNULL(@StartedAt, [StartedAt]),
        [EndedAt] = CASE WHEN @EndedAt_Clear = 1 THEN NULL ELSE ISNULL(@EndedAt, [EndedAt]) END,
        [Params] = CASE WHEN @Params_Clear = 1 THEN NULL ELSE ISNULL(@Params, [Params]) END,
        [ResultCode] = CASE WHEN @ResultCode_Clear = 1 THEN NULL ELSE ISNULL(@ResultCode, [ResultCode]) END,
        [UserID] = ISNULL(@UserID, [UserID]),
        [RetentionPeriod] = CASE WHEN @RetentionPeriod_Clear = 1 THEN NULL ELSE ISNULL(@RetentionPeriod, [RetentionPeriod]) END,
        [Message] = CASE WHEN @Message_Clear = 1 THEN NULL ELSE ISNULL(@Message, [Message]) END,
        [EntityActionID] = CASE WHEN @EntityActionID_Clear = 1 THEN NULL ELSE ISNULL(@EntityActionID, [EntityActionID]) END,
        [EntityActionInvocationTypeID] = CASE WHEN @EntityActionInvocationTypeID_Clear = 1 THEN NULL ELSE ISNULL(@EntityActionInvocationTypeID, [EntityActionInvocationTypeID]) END,
        [TargetEntityID] = CASE WHEN @TargetEntityID_Clear = 1 THEN NULL ELSE ISNULL(@TargetEntityID, [TargetEntityID]) END,
        [TargetRecordID] = CASE WHEN @TargetRecordID_Clear = 1 THEN NULL ELSE ISNULL(@TargetRecordID, [TargetRecordID]) END,
        [ResultParams] = CASE WHEN @ResultParams_Clear = 1 THEN NULL ELSE ISNULL(@ResultParams, [ResultParams]) END
    WHERE
        [ID] = @ID

    -- Check if the update was successful
    IF @@ROWCOUNT = 0
        -- Nothing was updated, return no rows, but column structure from base view intact, semantically correct this way.
        SELECT TOP 0 * FROM [${flyway:defaultSchema}].[vwActionExecutionLogs] WHERE 1=0
    ELSE
        -- Return the updated record so the caller can see the updated values and any calculated fields
        SELECT
                                        *
                                    FROM
                                        [${flyway:defaultSchema}].[vwActionExecutionLogs]
                                    WHERE
                                        [ID] = @ID
                                    
END
GO

GRANT EXECUTE ON [${flyway:defaultSchema}].[spUpdateActionExecutionLog] TO [cdp_Integration], [cdp_Developer]
GO

------------------------------------------------------------
----- TRIGGER FOR __mj_UpdatedAt field for the ActionExecutionLog table
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[trgUpdateActionExecutionLog]', 'TR') IS NOT NULL
    DROP TRIGGER [${flyway:defaultSchema}].[trgUpdateActionExecutionLog];
GO
CREATE TRIGGER [${flyway:defaultSchema}].trgUpdateActionExecutionLog
ON [${flyway:defaultSchema}].[ActionExecutionLog]
AFTER UPDATE
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE
        [${flyway:defaultSchema}].[ActionExecutionLog]
    SET
        __mj_UpdatedAt = GETUTCDATE()
    FROM
        [${flyway:defaultSchema}].[ActionExecutionLog] AS _organicTable
    INNER JOIN
        INSERTED AS I ON
        _organicTable.[ID] = I.[ID];
END;
GO

/* spUpdate Permissions for MJ: Action Execution Logs */

GRANT EXECUTE ON [${flyway:defaultSchema}].[spUpdateActionExecutionLog] TO [cdp_Integration], [cdp_Developer];

/* spDelete SQL for MJ: Action Execution Logs */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Action Execution Logs
-- Item: spDeleteActionExecutionLog
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- DELETE PROCEDURE FOR ActionExecutionLog
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[spDeleteActionExecutionLog]', 'P') IS NOT NULL
    DROP PROCEDURE [${flyway:defaultSchema}].[spDeleteActionExecutionLog];
GO

CREATE PROCEDURE [${flyway:defaultSchema}].[spDeleteActionExecutionLog]
    @ID uniqueidentifier
AS
BEGIN
    SET NOCOUNT ON;

    DELETE FROM
        [${flyway:defaultSchema}].[ActionExecutionLog]
    WHERE
        [ID] = @ID


    -- Check if the delete was successful
    IF @@ROWCOUNT = 0
        SELECT NULL AS [ID] -- Return NULL for all primary key fields to indicate no record was deleted
    ELSE
        SELECT @ID AS [ID] -- Return the primary key values to indicate we successfully deleted the record
END
GO
GRANT EXECUTE ON [${flyway:defaultSchema}].[spDeleteActionExecutionLog] TO [cdp_Integration];

/* spDelete Permissions for MJ: Action Execution Logs */

GRANT EXECUTE ON [${flyway:defaultSchema}].[spDeleteActionExecutionLog] TO [cdp_Integration];

/* Index for Foreign Keys for EntityActionFilter */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Entity Action Filters
-- Item: Index for Foreign Keys
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------
-- Index for foreign key EntityActionID in table EntityActionFilter
IF NOT EXISTS (
    SELECT 1
    FROM sys.indexes
    WHERE name = 'IDX_AUTO_MJ_FKEY_EntityActionFilter_EntityActionID' 
    AND object_id = OBJECT_ID('[${flyway:defaultSchema}].[EntityActionFilter]')
)
CREATE INDEX IDX_AUTO_MJ_FKEY_EntityActionFilter_EntityActionID ON [${flyway:defaultSchema}].[EntityActionFilter] ([EntityActionID]);

-- Index for foreign key ActionFilterID in table EntityActionFilter
IF NOT EXISTS (
    SELECT 1
    FROM sys.indexes
    WHERE name = 'IDX_AUTO_MJ_FKEY_EntityActionFilter_ActionFilterID' 
    AND object_id = OBJECT_ID('[${flyway:defaultSchema}].[EntityActionFilter]')
)
CREATE INDEX IDX_AUTO_MJ_FKEY_EntityActionFilter_ActionFilterID ON [${flyway:defaultSchema}].[EntityActionFilter] ([ActionFilterID]);

/* Index for Foreign Keys for EntityActionInvocation */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Entity Action Invocations
-- Item: Index for Foreign Keys
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------
-- Index for foreign key EntityActionID in table EntityActionInvocation
IF NOT EXISTS (
    SELECT 1
    FROM sys.indexes
    WHERE name = 'IDX_AUTO_MJ_FKEY_EntityActionInvocation_EntityActionID' 
    AND object_id = OBJECT_ID('[${flyway:defaultSchema}].[EntityActionInvocation]')
)
CREATE INDEX IDX_AUTO_MJ_FKEY_EntityActionInvocation_EntityActionID ON [${flyway:defaultSchema}].[EntityActionInvocation] ([EntityActionID]);

-- Index for foreign key InvocationTypeID in table EntityActionInvocation
IF NOT EXISTS (
    SELECT 1
    FROM sys.indexes
    WHERE name = 'IDX_AUTO_MJ_FKEY_EntityActionInvocation_InvocationTypeID' 
    AND object_id = OBJECT_ID('[${flyway:defaultSchema}].[EntityActionInvocation]')
)
CREATE INDEX IDX_AUTO_MJ_FKEY_EntityActionInvocation_InvocationTypeID ON [${flyway:defaultSchema}].[EntityActionInvocation] ([InvocationTypeID]);

/* Index for Foreign Keys for EntityActionParam */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Entity Action Params
-- Item: Index for Foreign Keys
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------
-- Index for foreign key EntityActionID in table EntityActionParam
IF NOT EXISTS (
    SELECT 1
    FROM sys.indexes
    WHERE name = 'IDX_AUTO_MJ_FKEY_EntityActionParam_EntityActionID' 
    AND object_id = OBJECT_ID('[${flyway:defaultSchema}].[EntityActionParam]')
)
CREATE INDEX IDX_AUTO_MJ_FKEY_EntityActionParam_EntityActionID ON [${flyway:defaultSchema}].[EntityActionParam] ([EntityActionID]);

-- Index for foreign key ActionParamID in table EntityActionParam
IF NOT EXISTS (
    SELECT 1
    FROM sys.indexes
    WHERE name = 'IDX_AUTO_MJ_FKEY_EntityActionParam_ActionParamID' 
    AND object_id = OBJECT_ID('[${flyway:defaultSchema}].[EntityActionParam]')
)
CREATE INDEX IDX_AUTO_MJ_FKEY_EntityActionParam_ActionParamID ON [${flyway:defaultSchema}].[EntityActionParam] ([ActionParamID]);

/* Base View SQL for MJ: Entity Action Filters */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Entity Action Filters
-- Item: vwEntityActionFilters
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- BASE VIEW FOR ENTITY:      MJ: Entity Action Filters
-----               SCHEMA:      ${flyway:defaultSchema}
-----               BASE TABLE:  EntityActionFilter
-----               PRIMARY KEY: ID
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[vwEntityActionFilters]', 'V') IS NOT NULL
    DROP VIEW [${flyway:defaultSchema}].[vwEntityActionFilters];
GO

CREATE VIEW [${flyway:defaultSchema}].[vwEntityActionFilters]
AS
SELECT
    e.*,
    MJActionFilter_ActionFilterID.[UserDescription] AS [ActionFilter]
FROM
    [${flyway:defaultSchema}].[EntityActionFilter] AS e
INNER JOIN
    [${flyway:defaultSchema}].[ActionFilter] AS MJActionFilter_ActionFilterID
  ON
    [e].[ActionFilterID] = MJActionFilter_ActionFilterID.[ID]
GO
GRANT SELECT ON [${flyway:defaultSchema}].[vwEntityActionFilters] TO [cdp_Integration], [cdp_UI], [cdp_Developer];

/* Base View Permissions SQL for MJ: Entity Action Filters */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Entity Action Filters
-- Item: Permissions for vwEntityActionFilters
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

GRANT SELECT ON [${flyway:defaultSchema}].[vwEntityActionFilters] TO [cdp_Integration], [cdp_UI], [cdp_Developer];

/* spCreate SQL for MJ: Entity Action Filters */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Entity Action Filters
-- Item: spCreateEntityActionFilter
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- CREATE PROCEDURE FOR EntityActionFilter
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[spCreateEntityActionFilter]', 'P') IS NOT NULL
    DROP PROCEDURE [${flyway:defaultSchema}].[spCreateEntityActionFilter];
GO

CREATE PROCEDURE [${flyway:defaultSchema}].[spCreateEntityActionFilter]
    @ID uniqueidentifier = NULL,
    @EntityActionID uniqueidentifier,
    @ActionFilterID uniqueidentifier,
    @Sequence int,
    @Status nvarchar(20) = NULL
AS
BEGIN
    SET NOCOUNT ON;
    DECLARE @InsertedRow TABLE ([ID] UNIQUEIDENTIFIER)

    IF @ID IS NOT NULL
    BEGIN
        -- User provided a value, use it
        INSERT INTO [${flyway:defaultSchema}].[EntityActionFilter]
            (
                [ID],
                [EntityActionID],
                [ActionFilterID],
                [Sequence],
                [Status]
            )
        OUTPUT INSERTED.[ID] INTO @InsertedRow
        VALUES
            (
                @ID,
                @EntityActionID,
                @ActionFilterID,
                @Sequence,
                ISNULL(@Status, 'Pending')
            )
    END
    ELSE
    BEGIN
        -- No value provided, let database use its default (e.g., NEWSEQUENTIALID())
        INSERT INTO [${flyway:defaultSchema}].[EntityActionFilter]
            (
                [EntityActionID],
                [ActionFilterID],
                [Sequence],
                [Status]
            )
        OUTPUT INSERTED.[ID] INTO @InsertedRow
        VALUES
            (
                @EntityActionID,
                @ActionFilterID,
                @Sequence,
                ISNULL(@Status, 'Pending')
            )
    END
    -- return the new record from the base view, which might have some calculated fields
    SELECT * FROM [${flyway:defaultSchema}].[vwEntityActionFilters] WHERE [ID] = (SELECT [ID] FROM @InsertedRow)
END
GO
GRANT EXECUTE ON [${flyway:defaultSchema}].[spCreateEntityActionFilter] TO [cdp_Integration], [cdp_Developer];

/* spCreate Permissions for MJ: Entity Action Filters */

GRANT EXECUTE ON [${flyway:defaultSchema}].[spCreateEntityActionFilter] TO [cdp_Integration], [cdp_Developer];

/* spUpdate SQL for MJ: Entity Action Filters */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Entity Action Filters
-- Item: spUpdateEntityActionFilter
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- UPDATE PROCEDURE FOR EntityActionFilter
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[spUpdateEntityActionFilter]', 'P') IS NOT NULL
    DROP PROCEDURE [${flyway:defaultSchema}].[spUpdateEntityActionFilter];
GO

CREATE PROCEDURE [${flyway:defaultSchema}].[spUpdateEntityActionFilter]
    @ID uniqueidentifier,
    @EntityActionID uniqueidentifier = NULL,
    @ActionFilterID uniqueidentifier = NULL,
    @Sequence int = NULL,
    @Status nvarchar(20) = NULL
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE
        [${flyway:defaultSchema}].[EntityActionFilter]
    SET
        [EntityActionID] = ISNULL(@EntityActionID, [EntityActionID]),
        [ActionFilterID] = ISNULL(@ActionFilterID, [ActionFilterID]),
        [Sequence] = ISNULL(@Sequence, [Sequence]),
        [Status] = ISNULL(@Status, [Status])
    WHERE
        [ID] = @ID

    -- Check if the update was successful
    IF @@ROWCOUNT = 0
        -- Nothing was updated, return no rows, but column structure from base view intact, semantically correct this way.
        SELECT TOP 0 * FROM [${flyway:defaultSchema}].[vwEntityActionFilters] WHERE 1=0
    ELSE
        -- Return the updated record so the caller can see the updated values and any calculated fields
        SELECT
                                        *
                                    FROM
                                        [${flyway:defaultSchema}].[vwEntityActionFilters]
                                    WHERE
                                        [ID] = @ID
                                    
END
GO

GRANT EXECUTE ON [${flyway:defaultSchema}].[spUpdateEntityActionFilter] TO [cdp_Integration], [cdp_Developer]
GO

------------------------------------------------------------
----- TRIGGER FOR __mj_UpdatedAt field for the EntityActionFilter table
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[trgUpdateEntityActionFilter]', 'TR') IS NOT NULL
    DROP TRIGGER [${flyway:defaultSchema}].[trgUpdateEntityActionFilter];
GO
CREATE TRIGGER [${flyway:defaultSchema}].trgUpdateEntityActionFilter
ON [${flyway:defaultSchema}].[EntityActionFilter]
AFTER UPDATE
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE
        [${flyway:defaultSchema}].[EntityActionFilter]
    SET
        __mj_UpdatedAt = GETUTCDATE()
    FROM
        [${flyway:defaultSchema}].[EntityActionFilter] AS _organicTable
    INNER JOIN
        INSERTED AS I ON
        _organicTable.[ID] = I.[ID];
END;
GO

/* spUpdate Permissions for MJ: Entity Action Filters */

GRANT EXECUTE ON [${flyway:defaultSchema}].[spUpdateEntityActionFilter] TO [cdp_Integration], [cdp_Developer];

/* Base View SQL for MJ: Entity Action Invocations */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Entity Action Invocations
-- Item: vwEntityActionInvocations
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- BASE VIEW FOR ENTITY:      MJ: Entity Action Invocations
-----               SCHEMA:      ${flyway:defaultSchema}
-----               BASE TABLE:  EntityActionInvocation
-----               PRIMARY KEY: ID
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[vwEntityActionInvocations]', 'V') IS NOT NULL
    DROP VIEW [${flyway:defaultSchema}].[vwEntityActionInvocations];
GO

CREATE VIEW [${flyway:defaultSchema}].[vwEntityActionInvocations]
AS
SELECT
    e.*,
    MJEntityActionInvocationType_InvocationTypeID.[Name] AS [InvocationType]
FROM
    [${flyway:defaultSchema}].[EntityActionInvocation] AS e
INNER JOIN
    [${flyway:defaultSchema}].[EntityActionInvocationType] AS MJEntityActionInvocationType_InvocationTypeID
  ON
    [e].[InvocationTypeID] = MJEntityActionInvocationType_InvocationTypeID.[ID]
GO
GRANT SELECT ON [${flyway:defaultSchema}].[vwEntityActionInvocations] TO [cdp_Integration], [cdp_UI], [cdp_Developer];

/* Base View Permissions SQL for MJ: Entity Action Invocations */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Entity Action Invocations
-- Item: Permissions for vwEntityActionInvocations
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

GRANT SELECT ON [${flyway:defaultSchema}].[vwEntityActionInvocations] TO [cdp_Integration], [cdp_UI], [cdp_Developer];

/* spCreate SQL for MJ: Entity Action Invocations */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Entity Action Invocations
-- Item: spCreateEntityActionInvocation
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- CREATE PROCEDURE FOR EntityActionInvocation
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[spCreateEntityActionInvocation]', 'P') IS NOT NULL
    DROP PROCEDURE [${flyway:defaultSchema}].[spCreateEntityActionInvocation];
GO

CREATE PROCEDURE [${flyway:defaultSchema}].[spCreateEntityActionInvocation]
    @ID uniqueidentifier = NULL,
    @EntityActionID uniqueidentifier,
    @InvocationTypeID uniqueidentifier,
    @Status nvarchar(20) = NULL,
    @RuntimeUXDriverClass_Clear bit = 0,
    @RuntimeUXDriverClass nvarchar(255) = NULL
AS
BEGIN
    SET NOCOUNT ON;
    DECLARE @InsertedRow TABLE ([ID] UNIQUEIDENTIFIER)

    IF @ID IS NOT NULL
    BEGIN
        -- User provided a value, use it
        INSERT INTO [${flyway:defaultSchema}].[EntityActionInvocation]
            (
                [ID],
                [EntityActionID],
                [InvocationTypeID],
                [Status],
                [RuntimeUXDriverClass]
            )
        OUTPUT INSERTED.[ID] INTO @InsertedRow
        VALUES
            (
                @ID,
                @EntityActionID,
                @InvocationTypeID,
                ISNULL(@Status, 'Pending'),
                CASE WHEN @RuntimeUXDriverClass_Clear = 1 THEN NULL ELSE ISNULL(@RuntimeUXDriverClass, NULL) END
            )
    END
    ELSE
    BEGIN
        -- No value provided, let database use its default (e.g., NEWSEQUENTIALID())
        INSERT INTO [${flyway:defaultSchema}].[EntityActionInvocation]
            (
                [EntityActionID],
                [InvocationTypeID],
                [Status],
                [RuntimeUXDriverClass]
            )
        OUTPUT INSERTED.[ID] INTO @InsertedRow
        VALUES
            (
                @EntityActionID,
                @InvocationTypeID,
                ISNULL(@Status, 'Pending'),
                CASE WHEN @RuntimeUXDriverClass_Clear = 1 THEN NULL ELSE ISNULL(@RuntimeUXDriverClass, NULL) END
            )
    END
    -- return the new record from the base view, which might have some calculated fields
    SELECT * FROM [${flyway:defaultSchema}].[vwEntityActionInvocations] WHERE [ID] = (SELECT [ID] FROM @InsertedRow)
END
GO
GRANT EXECUTE ON [${flyway:defaultSchema}].[spCreateEntityActionInvocation] TO [cdp_Integration], [cdp_Developer];

/* spCreate Permissions for MJ: Entity Action Invocations */

GRANT EXECUTE ON [${flyway:defaultSchema}].[spCreateEntityActionInvocation] TO [cdp_Integration], [cdp_Developer];

/* spUpdate SQL for MJ: Entity Action Invocations */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Entity Action Invocations
-- Item: spUpdateEntityActionInvocation
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- UPDATE PROCEDURE FOR EntityActionInvocation
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[spUpdateEntityActionInvocation]', 'P') IS NOT NULL
    DROP PROCEDURE [${flyway:defaultSchema}].[spUpdateEntityActionInvocation];
GO

CREATE PROCEDURE [${flyway:defaultSchema}].[spUpdateEntityActionInvocation]
    @ID uniqueidentifier,
    @EntityActionID uniqueidentifier = NULL,
    @InvocationTypeID uniqueidentifier = NULL,
    @Status nvarchar(20) = NULL,
    @RuntimeUXDriverClass_Clear bit = 0,
    @RuntimeUXDriverClass nvarchar(255) = NULL
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE
        [${flyway:defaultSchema}].[EntityActionInvocation]
    SET
        [EntityActionID] = ISNULL(@EntityActionID, [EntityActionID]),
        [InvocationTypeID] = ISNULL(@InvocationTypeID, [InvocationTypeID]),
        [Status] = ISNULL(@Status, [Status]),
        [RuntimeUXDriverClass] = CASE WHEN @RuntimeUXDriverClass_Clear = 1 THEN NULL ELSE ISNULL(@RuntimeUXDriverClass, [RuntimeUXDriverClass]) END
    WHERE
        [ID] = @ID

    -- Check if the update was successful
    IF @@ROWCOUNT = 0
        -- Nothing was updated, return no rows, but column structure from base view intact, semantically correct this way.
        SELECT TOP 0 * FROM [${flyway:defaultSchema}].[vwEntityActionInvocations] WHERE 1=0
    ELSE
        -- Return the updated record so the caller can see the updated values and any calculated fields
        SELECT
                                        *
                                    FROM
                                        [${flyway:defaultSchema}].[vwEntityActionInvocations]
                                    WHERE
                                        [ID] = @ID
                                    
END
GO

GRANT EXECUTE ON [${flyway:defaultSchema}].[spUpdateEntityActionInvocation] TO [cdp_Integration], [cdp_Developer]
GO

------------------------------------------------------------
----- TRIGGER FOR __mj_UpdatedAt field for the EntityActionInvocation table
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[trgUpdateEntityActionInvocation]', 'TR') IS NOT NULL
    DROP TRIGGER [${flyway:defaultSchema}].[trgUpdateEntityActionInvocation];
GO
CREATE TRIGGER [${flyway:defaultSchema}].trgUpdateEntityActionInvocation
ON [${flyway:defaultSchema}].[EntityActionInvocation]
AFTER UPDATE
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE
        [${flyway:defaultSchema}].[EntityActionInvocation]
    SET
        __mj_UpdatedAt = GETUTCDATE()
    FROM
        [${flyway:defaultSchema}].[EntityActionInvocation] AS _organicTable
    INNER JOIN
        INSERTED AS I ON
        _organicTable.[ID] = I.[ID];
END;
GO

/* spUpdate Permissions for MJ: Entity Action Invocations */

GRANT EXECUTE ON [${flyway:defaultSchema}].[spUpdateEntityActionInvocation] TO [cdp_Integration], [cdp_Developer];

/* Base View SQL for MJ: Entity Action Params */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Entity Action Params
-- Item: vwEntityActionParams
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- BASE VIEW FOR ENTITY:      MJ: Entity Action Params
-----               SCHEMA:      ${flyway:defaultSchema}
-----               BASE TABLE:  EntityActionParam
-----               PRIMARY KEY: ID
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[vwEntityActionParams]', 'V') IS NOT NULL
    DROP VIEW [${flyway:defaultSchema}].[vwEntityActionParams];
GO

CREATE VIEW [${flyway:defaultSchema}].[vwEntityActionParams]
AS
SELECT
    e.*,
    MJActionParam_ActionParamID.[Name] AS [ActionParam]
FROM
    [${flyway:defaultSchema}].[EntityActionParam] AS e
INNER JOIN
    [${flyway:defaultSchema}].[ActionParam] AS MJActionParam_ActionParamID
  ON
    [e].[ActionParamID] = MJActionParam_ActionParamID.[ID]
GO
GRANT SELECT ON [${flyway:defaultSchema}].[vwEntityActionParams] TO [cdp_Developer], [cdp_Integration], [cdp_UI];

/* Base View Permissions SQL for MJ: Entity Action Params */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Entity Action Params
-- Item: Permissions for vwEntityActionParams
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

GRANT SELECT ON [${flyway:defaultSchema}].[vwEntityActionParams] TO [cdp_Developer], [cdp_Integration], [cdp_UI];

/* spCreate SQL for MJ: Entity Action Params */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Entity Action Params
-- Item: spCreateEntityActionParam
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- CREATE PROCEDURE FOR EntityActionParam
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[spCreateEntityActionParam]', 'P') IS NOT NULL
    DROP PROCEDURE [${flyway:defaultSchema}].[spCreateEntityActionParam];
GO

CREATE PROCEDURE [${flyway:defaultSchema}].[spCreateEntityActionParam]
    @ID uniqueidentifier = NULL,
    @EntityActionID uniqueidentifier,
    @ActionParamID uniqueidentifier,
    @ValueType nvarchar(20),
    @Value_Clear bit = 0,
    @Value nvarchar(MAX) = NULL,
    @Comments_Clear bit = 0,
    @Comments nvarchar(MAX) = NULL,
    @LogValue_Clear bit = 0,
    @LogValue bit = NULL
AS
BEGIN
    SET NOCOUNT ON;
    DECLARE @InsertedRow TABLE ([ID] UNIQUEIDENTIFIER)

    IF @ID IS NOT NULL
    BEGIN
        -- User provided a value, use it
        INSERT INTO [${flyway:defaultSchema}].[EntityActionParam]
            (
                [ID],
                [EntityActionID],
                [ActionParamID],
                [ValueType],
                [Value],
                [Comments],
                [LogValue]
            )
        OUTPUT INSERTED.[ID] INTO @InsertedRow
        VALUES
            (
                @ID,
                @EntityActionID,
                @ActionParamID,
                @ValueType,
                CASE WHEN @Value_Clear = 1 THEN NULL ELSE ISNULL(@Value, NULL) END,
                CASE WHEN @Comments_Clear = 1 THEN NULL ELSE ISNULL(@Comments, NULL) END,
                CASE WHEN @LogValue_Clear = 1 THEN NULL ELSE ISNULL(@LogValue, NULL) END
            )
    END
    ELSE
    BEGIN
        -- No value provided, let database use its default (e.g., NEWSEQUENTIALID())
        INSERT INTO [${flyway:defaultSchema}].[EntityActionParam]
            (
                [EntityActionID],
                [ActionParamID],
                [ValueType],
                [Value],
                [Comments],
                [LogValue]
            )
        OUTPUT INSERTED.[ID] INTO @InsertedRow
        VALUES
            (
                @EntityActionID,
                @ActionParamID,
                @ValueType,
                CASE WHEN @Value_Clear = 1 THEN NULL ELSE ISNULL(@Value, NULL) END,
                CASE WHEN @Comments_Clear = 1 THEN NULL ELSE ISNULL(@Comments, NULL) END,
                CASE WHEN @LogValue_Clear = 1 THEN NULL ELSE ISNULL(@LogValue, NULL) END
            )
    END
    -- return the new record from the base view, which might have some calculated fields
    SELECT * FROM [${flyway:defaultSchema}].[vwEntityActionParams] WHERE [ID] = (SELECT [ID] FROM @InsertedRow)
END
GO
GRANT EXECUTE ON [${flyway:defaultSchema}].[spCreateEntityActionParam] TO [cdp_Developer], [cdp_Integration];

/* spCreate Permissions for MJ: Entity Action Params */

GRANT EXECUTE ON [${flyway:defaultSchema}].[spCreateEntityActionParam] TO [cdp_Developer], [cdp_Integration];

/* spUpdate SQL for MJ: Entity Action Params */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Entity Action Params
-- Item: spUpdateEntityActionParam
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- UPDATE PROCEDURE FOR EntityActionParam
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[spUpdateEntityActionParam]', 'P') IS NOT NULL
    DROP PROCEDURE [${flyway:defaultSchema}].[spUpdateEntityActionParam];
GO

CREATE PROCEDURE [${flyway:defaultSchema}].[spUpdateEntityActionParam]
    @ID uniqueidentifier,
    @EntityActionID uniqueidentifier = NULL,
    @ActionParamID uniqueidentifier = NULL,
    @ValueType nvarchar(20) = NULL,
    @Value_Clear bit = 0,
    @Value nvarchar(MAX) = NULL,
    @Comments_Clear bit = 0,
    @Comments nvarchar(MAX) = NULL,
    @LogValue_Clear bit = 0,
    @LogValue bit = NULL
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE
        [${flyway:defaultSchema}].[EntityActionParam]
    SET
        [EntityActionID] = ISNULL(@EntityActionID, [EntityActionID]),
        [ActionParamID] = ISNULL(@ActionParamID, [ActionParamID]),
        [ValueType] = ISNULL(@ValueType, [ValueType]),
        [Value] = CASE WHEN @Value_Clear = 1 THEN NULL ELSE ISNULL(@Value, [Value]) END,
        [Comments] = CASE WHEN @Comments_Clear = 1 THEN NULL ELSE ISNULL(@Comments, [Comments]) END,
        [LogValue] = CASE WHEN @LogValue_Clear = 1 THEN NULL ELSE ISNULL(@LogValue, [LogValue]) END
    WHERE
        [ID] = @ID

    -- Check if the update was successful
    IF @@ROWCOUNT = 0
        -- Nothing was updated, return no rows, but column structure from base view intact, semantically correct this way.
        SELECT TOP 0 * FROM [${flyway:defaultSchema}].[vwEntityActionParams] WHERE 1=0
    ELSE
        -- Return the updated record so the caller can see the updated values and any calculated fields
        SELECT
                                        *
                                    FROM
                                        [${flyway:defaultSchema}].[vwEntityActionParams]
                                    WHERE
                                        [ID] = @ID
                                    
END
GO

GRANT EXECUTE ON [${flyway:defaultSchema}].[spUpdateEntityActionParam] TO [cdp_Developer], [cdp_Integration]
GO

------------------------------------------------------------
----- TRIGGER FOR __mj_UpdatedAt field for the EntityActionParam table
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[trgUpdateEntityActionParam]', 'TR') IS NOT NULL
    DROP TRIGGER [${flyway:defaultSchema}].[trgUpdateEntityActionParam];
GO
CREATE TRIGGER [${flyway:defaultSchema}].trgUpdateEntityActionParam
ON [${flyway:defaultSchema}].[EntityActionParam]
AFTER UPDATE
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE
        [${flyway:defaultSchema}].[EntityActionParam]
    SET
        __mj_UpdatedAt = GETUTCDATE()
    FROM
        [${flyway:defaultSchema}].[EntityActionParam] AS _organicTable
    INNER JOIN
        INSERTED AS I ON
        _organicTable.[ID] = I.[ID];
END;
GO

/* spUpdate Permissions for MJ: Entity Action Params */

GRANT EXECUTE ON [${flyway:defaultSchema}].[spUpdateEntityActionParam] TO [cdp_Developer], [cdp_Integration];

/* spDelete SQL for MJ: Entity Action Filters */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Entity Action Filters
-- Item: spDeleteEntityActionFilter
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- DELETE PROCEDURE FOR EntityActionFilter
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[spDeleteEntityActionFilter]', 'P') IS NOT NULL
    DROP PROCEDURE [${flyway:defaultSchema}].[spDeleteEntityActionFilter];
GO

CREATE PROCEDURE [${flyway:defaultSchema}].[spDeleteEntityActionFilter]
    @ID uniqueidentifier
AS
BEGIN
    SET NOCOUNT ON;

    DELETE FROM
        [${flyway:defaultSchema}].[EntityActionFilter]
    WHERE
        [ID] = @ID


    -- Check if the delete was successful
    IF @@ROWCOUNT = 0
        SELECT NULL AS [ID] -- Return NULL for all primary key fields to indicate no record was deleted
    ELSE
        SELECT @ID AS [ID] -- Return the primary key values to indicate we successfully deleted the record
END
GO
GRANT EXECUTE ON [${flyway:defaultSchema}].[spDeleteEntityActionFilter] TO [cdp_Integration], [cdp_Developer];

/* spDelete Permissions for MJ: Entity Action Filters */

GRANT EXECUTE ON [${flyway:defaultSchema}].[spDeleteEntityActionFilter] TO [cdp_Integration], [cdp_Developer];

/* spDelete SQL for MJ: Entity Action Invocations */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Entity Action Invocations
-- Item: spDeleteEntityActionInvocation
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- DELETE PROCEDURE FOR EntityActionInvocation
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[spDeleteEntityActionInvocation]', 'P') IS NOT NULL
    DROP PROCEDURE [${flyway:defaultSchema}].[spDeleteEntityActionInvocation];
GO

CREATE PROCEDURE [${flyway:defaultSchema}].[spDeleteEntityActionInvocation]
    @ID uniqueidentifier
AS
BEGIN
    SET NOCOUNT ON;

    DELETE FROM
        [${flyway:defaultSchema}].[EntityActionInvocation]
    WHERE
        [ID] = @ID


    -- Check if the delete was successful
    IF @@ROWCOUNT = 0
        SELECT NULL AS [ID] -- Return NULL for all primary key fields to indicate no record was deleted
    ELSE
        SELECT @ID AS [ID] -- Return the primary key values to indicate we successfully deleted the record
END
GO
GRANT EXECUTE ON [${flyway:defaultSchema}].[spDeleteEntityActionInvocation] TO [cdp_Integration], [cdp_Developer];

/* spDelete Permissions for MJ: Entity Action Invocations */

GRANT EXECUTE ON [${flyway:defaultSchema}].[spDeleteEntityActionInvocation] TO [cdp_Integration], [cdp_Developer];

/* spDelete SQL for MJ: Entity Action Params */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Entity Action Params
-- Item: spDeleteEntityActionParam
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- DELETE PROCEDURE FOR EntityActionParam
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[spDeleteEntityActionParam]', 'P') IS NOT NULL
    DROP PROCEDURE [${flyway:defaultSchema}].[spDeleteEntityActionParam];
GO

CREATE PROCEDURE [${flyway:defaultSchema}].[spDeleteEntityActionParam]
    @ID uniqueidentifier
AS
BEGIN
    SET NOCOUNT ON;

    DELETE FROM
        [${flyway:defaultSchema}].[EntityActionParam]
    WHERE
        [ID] = @ID


    -- Check if the delete was successful
    IF @@ROWCOUNT = 0
        SELECT NULL AS [ID] -- Return NULL for all primary key fields to indicate no record was deleted
    ELSE
        SELECT @ID AS [ID] -- Return the primary key values to indicate we successfully deleted the record
END
GO
GRANT EXECUTE ON [${flyway:defaultSchema}].[spDeleteEntityActionParam] TO [cdp_Developer], [cdp_Integration];

/* spDelete Permissions for MJ: Entity Action Params */

GRANT EXECUTE ON [${flyway:defaultSchema}].[spDeleteEntityActionParam] TO [cdp_Developer], [cdp_Integration];

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

/* Index for Foreign Keys for Task */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Tasks
-- Item: Index for Foreign Keys
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------
-- Index for foreign key ParentID in table Task
IF NOT EXISTS (
    SELECT 1
    FROM sys.indexes
    WHERE name = 'IDX_AUTO_MJ_FKEY_Task_ParentID' 
    AND object_id = OBJECT_ID('[${flyway:defaultSchema}].[Task]')
)
CREATE INDEX IDX_AUTO_MJ_FKEY_Task_ParentID ON [${flyway:defaultSchema}].[Task] ([ParentID]);

-- Index for foreign key TypeID in table Task
IF NOT EXISTS (
    SELECT 1
    FROM sys.indexes
    WHERE name = 'IDX_AUTO_MJ_FKEY_Task_TypeID' 
    AND object_id = OBJECT_ID('[${flyway:defaultSchema}].[Task]')
)
CREATE INDEX IDX_AUTO_MJ_FKEY_Task_TypeID ON [${flyway:defaultSchema}].[Task] ([TypeID]);

-- Index for foreign key EnvironmentID in table Task
IF NOT EXISTS (
    SELECT 1
    FROM sys.indexes
    WHERE name = 'IDX_AUTO_MJ_FKEY_Task_EnvironmentID' 
    AND object_id = OBJECT_ID('[${flyway:defaultSchema}].[Task]')
)
CREATE INDEX IDX_AUTO_MJ_FKEY_Task_EnvironmentID ON [${flyway:defaultSchema}].[Task] ([EnvironmentID]);

-- Index for foreign key ProjectID in table Task
IF NOT EXISTS (
    SELECT 1
    FROM sys.indexes
    WHERE name = 'IDX_AUTO_MJ_FKEY_Task_ProjectID' 
    AND object_id = OBJECT_ID('[${flyway:defaultSchema}].[Task]')
)
CREATE INDEX IDX_AUTO_MJ_FKEY_Task_ProjectID ON [${flyway:defaultSchema}].[Task] ([ProjectID]);

-- Index for foreign key ConversationDetailID in table Task
IF NOT EXISTS (
    SELECT 1
    FROM sys.indexes
    WHERE name = 'IDX_AUTO_MJ_FKEY_Task_ConversationDetailID' 
    AND object_id = OBJECT_ID('[${flyway:defaultSchema}].[Task]')
)
CREATE INDEX IDX_AUTO_MJ_FKEY_Task_ConversationDetailID ON [${flyway:defaultSchema}].[Task] ([ConversationDetailID]);

-- Index for foreign key UserID in table Task
IF NOT EXISTS (
    SELECT 1
    FROM sys.indexes
    WHERE name = 'IDX_AUTO_MJ_FKEY_Task_UserID' 
    AND object_id = OBJECT_ID('[${flyway:defaultSchema}].[Task]')
)
CREATE INDEX IDX_AUTO_MJ_FKEY_Task_UserID ON [${flyway:defaultSchema}].[Task] ([UserID]);

-- Index for foreign key AgentID in table Task
IF NOT EXISTS (
    SELECT 1
    FROM sys.indexes
    WHERE name = 'IDX_AUTO_MJ_FKEY_Task_AgentID' 
    AND object_id = OBJECT_ID('[${flyway:defaultSchema}].[Task]')
)
CREATE INDEX IDX_AUTO_MJ_FKEY_Task_AgentID ON [${flyway:defaultSchema}].[Task] ([AgentID]);

-- Index for foreign key AgentRunID in table Task
IF NOT EXISTS (
    SELECT 1
    FROM sys.indexes
    WHERE name = 'IDX_AUTO_MJ_FKEY_Task_AgentRunID' 
    AND object_id = OBJECT_ID('[${flyway:defaultSchema}].[Task]')
)
CREATE INDEX IDX_AUTO_MJ_FKEY_Task_AgentRunID ON [${flyway:defaultSchema}].[Task] ([AgentRunID]);

-- Index for foreign key ActionID in table Task
IF NOT EXISTS (
    SELECT 1
    FROM sys.indexes
    WHERE name = 'IDX_AUTO_MJ_FKEY_Task_ActionID' 
    AND object_id = OBJECT_ID('[${flyway:defaultSchema}].[Task]')
)
CREATE INDEX IDX_AUTO_MJ_FKEY_Task_ActionID ON [${flyway:defaultSchema}].[Task] ([ActionID]);

-- Index for foreign key PromptID in table Task
IF NOT EXISTS (
    SELECT 1
    FROM sys.indexes
    WHERE name = 'IDX_AUTO_MJ_FKEY_Task_PromptID' 
    AND object_id = OBJECT_ID('[${flyway:defaultSchema}].[Task]')
)
CREATE INDEX IDX_AUTO_MJ_FKEY_Task_PromptID ON [${flyway:defaultSchema}].[Task] ([PromptID]);

/* SQL text to update entity field related entity name field map for entity field ID 42CF0A0B-1729-468D-AD07-9697999FA8B8 */
EXEC [${flyway:defaultSchema}].[spUpdateEntityFieldRelatedEntityNameFieldMap] @EntityFieldID='42CF0A0B-1729-468D-AD07-9697999FA8B8', @RelatedEntityNameFieldMap='Prompt';

/* Root ID Function SQL for MJ: Tasks.ParentID */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Tasks
-- Item: fnTaskParentID_GetRootID
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------
------------------------------------------------------------
----- ROOT ID FUNCTION FOR: [Task].[ParentID]
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[fnTaskParentID_GetRootID]', 'IF') IS NOT NULL
    DROP FUNCTION [${flyway:defaultSchema}].[fnTaskParentID_GetRootID];
GO

CREATE FUNCTION [${flyway:defaultSchema}].[fnTaskParentID_GetRootID]
(
    @RecordID uniqueidentifier,
    @ParentID uniqueidentifier
)
RETURNS TABLE
AS
RETURN
(
    WITH CTE_RootParent AS (
        SELECT
            [ID],
            [ParentID],
            [ID] AS [RootParentID],
            0 AS [Depth]
        FROM
            [${flyway:defaultSchema}].[Task]
        WHERE
            [ID] = COALESCE(@ParentID, @RecordID)

        UNION ALL

        SELECT
            c.[ID],
            c.[ParentID],
            c.[ID] AS [RootParentID],
            p.[Depth] + 1 AS [Depth]
        FROM
            [${flyway:defaultSchema}].[Task] c
        INNER JOIN
            CTE_RootParent p ON c.[ID] = p.[ParentID]
        WHERE
            p.[Depth] < 100
    )
    SELECT TOP 1
        [RootParentID] AS RootID
    FROM
        CTE_RootParent
    WHERE
        [ParentID] IS NULL
    ORDER BY
        [RootParentID]
);
GO

/* Base View SQL for MJ: Tasks */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Tasks
-- Item: vwTasks
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- BASE VIEW FOR ENTITY:      MJ: Tasks
-----               SCHEMA:      ${flyway:defaultSchema}
-----               BASE TABLE:  Task
-----               PRIMARY KEY: ID
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[vwTasks]', 'V') IS NOT NULL
    DROP VIEW [${flyway:defaultSchema}].[vwTasks];
GO

CREATE VIEW [${flyway:defaultSchema}].[vwTasks]
AS
SELECT
    t.*,
    MJTask_ParentID.[Name] AS [Parent],
    MJTaskType_TypeID.[Name] AS [Type],
    MJEnvironment_EnvironmentID.[Name] AS [Environment],
    MJProject_ProjectID.[Name] AS [Project],
    MJConversationDetail_ConversationDetailID.[ExternalID] AS [ConversationDetail],
    MJUser_UserID.[Name] AS [User],
    MJAIAgent_AgentID.[Name] AS [Agent],
    MJAIAgentRun_AgentRunID.[RunName] AS [AgentRun],
    MJAction_ActionID.[Name] AS [Action],
    MJAIPrompt_PromptID.[Name] AS [Prompt],
    root_ParentID.RootID AS [RootParentID]
FROM
    [${flyway:defaultSchema}].[Task] AS t
LEFT OUTER JOIN
    [${flyway:defaultSchema}].[Task] AS MJTask_ParentID
  ON
    [t].[ParentID] = MJTask_ParentID.[ID]
INNER JOIN
    [${flyway:defaultSchema}].[TaskType] AS MJTaskType_TypeID
  ON
    [t].[TypeID] = MJTaskType_TypeID.[ID]
INNER JOIN
    [${flyway:defaultSchema}].[Environment] AS MJEnvironment_EnvironmentID
  ON
    [t].[EnvironmentID] = MJEnvironment_EnvironmentID.[ID]
LEFT OUTER JOIN
    [${flyway:defaultSchema}].[Project] AS MJProject_ProjectID
  ON
    [t].[ProjectID] = MJProject_ProjectID.[ID]
LEFT OUTER JOIN
    [${flyway:defaultSchema}].[ConversationDetail] AS MJConversationDetail_ConversationDetailID
  ON
    [t].[ConversationDetailID] = MJConversationDetail_ConversationDetailID.[ID]
LEFT OUTER JOIN
    [${flyway:defaultSchema}].[User] AS MJUser_UserID
  ON
    [t].[UserID] = MJUser_UserID.[ID]
LEFT OUTER JOIN
    [${flyway:defaultSchema}].[AIAgent] AS MJAIAgent_AgentID
  ON
    [t].[AgentID] = MJAIAgent_AgentID.[ID]
LEFT OUTER JOIN
    [${flyway:defaultSchema}].[AIAgentRun] AS MJAIAgentRun_AgentRunID
  ON
    [t].[AgentRunID] = MJAIAgentRun_AgentRunID.[ID]
LEFT OUTER JOIN
    [${flyway:defaultSchema}].[Action] AS MJAction_ActionID
  ON
    [t].[ActionID] = MJAction_ActionID.[ID]
LEFT OUTER JOIN
    [${flyway:defaultSchema}].[AIPrompt] AS MJAIPrompt_PromptID
  ON
    [t].[PromptID] = MJAIPrompt_PromptID.[ID]
OUTER APPLY
    [${flyway:defaultSchema}].[fnTaskParentID_GetRootID]([t].[ID], [t].[ParentID]) AS root_ParentID
GO
GRANT SELECT ON [${flyway:defaultSchema}].[vwTasks] TO [cdp_UI], [cdp_Developer], [cdp_Integration];

/* Base View Permissions SQL for MJ: Tasks */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Tasks
-- Item: Permissions for vwTasks
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

GRANT SELECT ON [${flyway:defaultSchema}].[vwTasks] TO [cdp_UI], [cdp_Developer], [cdp_Integration];

/* spCreate SQL for MJ: Tasks */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Tasks
-- Item: spCreateTask
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- CREATE PROCEDURE FOR Task
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[spCreateTask]', 'P') IS NOT NULL
    DROP PROCEDURE [${flyway:defaultSchema}].[spCreateTask];
GO

CREATE PROCEDURE [${flyway:defaultSchema}].[spCreateTask]
    @ID uniqueidentifier = NULL,
    @ParentID_Clear bit = 0,
    @ParentID uniqueidentifier = NULL,
    @Name nvarchar(255),
    @Description_Clear bit = 0,
    @Description nvarchar(MAX) = NULL,
    @TypeID uniqueidentifier,
    @EnvironmentID uniqueidentifier = NULL,
    @ProjectID_Clear bit = 0,
    @ProjectID uniqueidentifier = NULL,
    @ConversationDetailID_Clear bit = 0,
    @ConversationDetailID uniqueidentifier = NULL,
    @UserID_Clear bit = 0,
    @UserID uniqueidentifier = NULL,
    @AgentID_Clear bit = 0,
    @AgentID uniqueidentifier = NULL,
    @Status nvarchar(50) = NULL,
    @PercentComplete_Clear bit = 0,
    @PercentComplete int = NULL,
    @DueAt_Clear bit = 0,
    @DueAt datetimeoffset = NULL,
    @StartedAt_Clear bit = 0,
    @StartedAt datetimeoffset = NULL,
    @CompletedAt_Clear bit = 0,
    @CompletedAt datetimeoffset = NULL,
    @InputPayload_Clear bit = 0,
    @InputPayload nvarchar(MAX) = NULL,
    @OutputPayload_Clear bit = 0,
    @OutputPayload nvarchar(MAX) = NULL,
    @ErrorMessage_Clear bit = 0,
    @ErrorMessage nvarchar(MAX) = NULL,
    @AgentRunID_Clear bit = 0,
    @AgentRunID uniqueidentifier = NULL,
    @ClaimedBy_Clear bit = 0,
    @ClaimedBy nvarchar(100) = NULL,
    @ClaimExpiresAt_Clear bit = 0,
    @ClaimExpiresAt datetimeoffset = NULL,
    @ActionID_Clear bit = 0,
    @ActionID uniqueidentifier = NULL,
    @StepType_Clear bit = 0,
    @StepType nvarchar(20) = NULL,
    @PromptID_Clear bit = 0,
    @PromptID uniqueidentifier = NULL,
    @Configuration_Clear bit = 0,
    @Configuration nvarchar(MAX) = NULL
AS
BEGIN
    SET NOCOUNT ON;
    DECLARE @InsertedRow TABLE ([ID] UNIQUEIDENTIFIER)

    IF @ID IS NOT NULL
    BEGIN
        -- User provided a value, use it
        INSERT INTO [${flyway:defaultSchema}].[Task]
            (
                [ID],
                [ParentID],
                [Name],
                [Description],
                [TypeID],
                [EnvironmentID],
                [ProjectID],
                [ConversationDetailID],
                [UserID],
                [AgentID],
                [Status],
                [PercentComplete],
                [DueAt],
                [StartedAt],
                [CompletedAt],
                [InputPayload],
                [OutputPayload],
                [ErrorMessage],
                [AgentRunID],
                [ClaimedBy],
                [ClaimExpiresAt],
                [ActionID],
                [StepType],
                [PromptID],
                [Configuration]
            )
        OUTPUT INSERTED.[ID] INTO @InsertedRow
        VALUES
            (
                @ID,
                CASE WHEN @ParentID_Clear = 1 THEN NULL ELSE ISNULL(@ParentID, NULL) END,
                @Name,
                CASE WHEN @Description_Clear = 1 THEN NULL ELSE ISNULL(@Description, NULL) END,
                @TypeID,
                CASE WHEN @EnvironmentID = '00000000-0000-0000-0000-000000000000' THEN 'F51358F3-9447-4176-B313-BF8025FD8D09' ELSE ISNULL(@EnvironmentID, 'F51358F3-9447-4176-B313-BF8025FD8D09') END,
                CASE WHEN @ProjectID_Clear = 1 THEN NULL ELSE ISNULL(@ProjectID, NULL) END,
                CASE WHEN @ConversationDetailID_Clear = 1 THEN NULL ELSE ISNULL(@ConversationDetailID, NULL) END,
                CASE WHEN @UserID_Clear = 1 THEN NULL ELSE ISNULL(@UserID, NULL) END,
                CASE WHEN @AgentID_Clear = 1 THEN NULL ELSE ISNULL(@AgentID, NULL) END,
                ISNULL(@Status, 'Pending'),
                CASE WHEN @PercentComplete_Clear = 1 THEN NULL ELSE ISNULL(@PercentComplete, 0) END,
                CASE WHEN @DueAt_Clear = 1 THEN NULL ELSE ISNULL(@DueAt, NULL) END,
                CASE WHEN @StartedAt_Clear = 1 THEN NULL ELSE ISNULL(@StartedAt, NULL) END,
                CASE WHEN @CompletedAt_Clear = 1 THEN NULL ELSE ISNULL(@CompletedAt, NULL) END,
                CASE WHEN @InputPayload_Clear = 1 THEN NULL ELSE ISNULL(@InputPayload, NULL) END,
                CASE WHEN @OutputPayload_Clear = 1 THEN NULL ELSE ISNULL(@OutputPayload, NULL) END,
                CASE WHEN @ErrorMessage_Clear = 1 THEN NULL ELSE ISNULL(@ErrorMessage, NULL) END,
                CASE WHEN @AgentRunID_Clear = 1 THEN NULL ELSE ISNULL(@AgentRunID, NULL) END,
                CASE WHEN @ClaimedBy_Clear = 1 THEN NULL ELSE ISNULL(@ClaimedBy, NULL) END,
                CASE WHEN @ClaimExpiresAt_Clear = 1 THEN NULL ELSE ISNULL(@ClaimExpiresAt, NULL) END,
                CASE WHEN @ActionID_Clear = 1 THEN NULL ELSE ISNULL(@ActionID, NULL) END,
                CASE WHEN @StepType_Clear = 1 THEN NULL ELSE ISNULL(@StepType, NULL) END,
                CASE WHEN @PromptID_Clear = 1 THEN NULL ELSE ISNULL(@PromptID, NULL) END,
                CASE WHEN @Configuration_Clear = 1 THEN NULL ELSE ISNULL(@Configuration, NULL) END
            )
    END
    ELSE
    BEGIN
        -- No value provided, let database use its default (e.g., NEWSEQUENTIALID())
        INSERT INTO [${flyway:defaultSchema}].[Task]
            (
                [ParentID],
                [Name],
                [Description],
                [TypeID],
                [EnvironmentID],
                [ProjectID],
                [ConversationDetailID],
                [UserID],
                [AgentID],
                [Status],
                [PercentComplete],
                [DueAt],
                [StartedAt],
                [CompletedAt],
                [InputPayload],
                [OutputPayload],
                [ErrorMessage],
                [AgentRunID],
                [ClaimedBy],
                [ClaimExpiresAt],
                [ActionID],
                [StepType],
                [PromptID],
                [Configuration]
            )
        OUTPUT INSERTED.[ID] INTO @InsertedRow
        VALUES
            (
                CASE WHEN @ParentID_Clear = 1 THEN NULL ELSE ISNULL(@ParentID, NULL) END,
                @Name,
                CASE WHEN @Description_Clear = 1 THEN NULL ELSE ISNULL(@Description, NULL) END,
                @TypeID,
                CASE WHEN @EnvironmentID = '00000000-0000-0000-0000-000000000000' THEN 'F51358F3-9447-4176-B313-BF8025FD8D09' ELSE ISNULL(@EnvironmentID, 'F51358F3-9447-4176-B313-BF8025FD8D09') END,
                CASE WHEN @ProjectID_Clear = 1 THEN NULL ELSE ISNULL(@ProjectID, NULL) END,
                CASE WHEN @ConversationDetailID_Clear = 1 THEN NULL ELSE ISNULL(@ConversationDetailID, NULL) END,
                CASE WHEN @UserID_Clear = 1 THEN NULL ELSE ISNULL(@UserID, NULL) END,
                CASE WHEN @AgentID_Clear = 1 THEN NULL ELSE ISNULL(@AgentID, NULL) END,
                ISNULL(@Status, 'Pending'),
                CASE WHEN @PercentComplete_Clear = 1 THEN NULL ELSE ISNULL(@PercentComplete, 0) END,
                CASE WHEN @DueAt_Clear = 1 THEN NULL ELSE ISNULL(@DueAt, NULL) END,
                CASE WHEN @StartedAt_Clear = 1 THEN NULL ELSE ISNULL(@StartedAt, NULL) END,
                CASE WHEN @CompletedAt_Clear = 1 THEN NULL ELSE ISNULL(@CompletedAt, NULL) END,
                CASE WHEN @InputPayload_Clear = 1 THEN NULL ELSE ISNULL(@InputPayload, NULL) END,
                CASE WHEN @OutputPayload_Clear = 1 THEN NULL ELSE ISNULL(@OutputPayload, NULL) END,
                CASE WHEN @ErrorMessage_Clear = 1 THEN NULL ELSE ISNULL(@ErrorMessage, NULL) END,
                CASE WHEN @AgentRunID_Clear = 1 THEN NULL ELSE ISNULL(@AgentRunID, NULL) END,
                CASE WHEN @ClaimedBy_Clear = 1 THEN NULL ELSE ISNULL(@ClaimedBy, NULL) END,
                CASE WHEN @ClaimExpiresAt_Clear = 1 THEN NULL ELSE ISNULL(@ClaimExpiresAt, NULL) END,
                CASE WHEN @ActionID_Clear = 1 THEN NULL ELSE ISNULL(@ActionID, NULL) END,
                CASE WHEN @StepType_Clear = 1 THEN NULL ELSE ISNULL(@StepType, NULL) END,
                CASE WHEN @PromptID_Clear = 1 THEN NULL ELSE ISNULL(@PromptID, NULL) END,
                CASE WHEN @Configuration_Clear = 1 THEN NULL ELSE ISNULL(@Configuration, NULL) END
            )
    END
    -- return the new record from the base view, which might have some calculated fields
    SELECT * FROM [${flyway:defaultSchema}].[vwTasks] WHERE [ID] = (SELECT [ID] FROM @InsertedRow)
END
GO
GRANT EXECUTE ON [${flyway:defaultSchema}].[spCreateTask] TO [cdp_Developer], [cdp_Integration];

/* spCreate Permissions for MJ: Tasks */

GRANT EXECUTE ON [${flyway:defaultSchema}].[spCreateTask] TO [cdp_Developer], [cdp_Integration];

/* spUpdate SQL for MJ: Tasks */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Tasks
-- Item: spUpdateTask
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- UPDATE PROCEDURE FOR Task
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[spUpdateTask]', 'P') IS NOT NULL
    DROP PROCEDURE [${flyway:defaultSchema}].[spUpdateTask];
GO

CREATE PROCEDURE [${flyway:defaultSchema}].[spUpdateTask]
    @ID uniqueidentifier,
    @ParentID_Clear bit = 0,
    @ParentID uniqueidentifier = NULL,
    @Name nvarchar(255) = NULL,
    @Description_Clear bit = 0,
    @Description nvarchar(MAX) = NULL,
    @TypeID uniqueidentifier = NULL,
    @EnvironmentID uniqueidentifier = NULL,
    @ProjectID_Clear bit = 0,
    @ProjectID uniqueidentifier = NULL,
    @ConversationDetailID_Clear bit = 0,
    @ConversationDetailID uniqueidentifier = NULL,
    @UserID_Clear bit = 0,
    @UserID uniqueidentifier = NULL,
    @AgentID_Clear bit = 0,
    @AgentID uniqueidentifier = NULL,
    @Status nvarchar(50) = NULL,
    @PercentComplete_Clear bit = 0,
    @PercentComplete int = NULL,
    @DueAt_Clear bit = 0,
    @DueAt datetimeoffset = NULL,
    @StartedAt_Clear bit = 0,
    @StartedAt datetimeoffset = NULL,
    @CompletedAt_Clear bit = 0,
    @CompletedAt datetimeoffset = NULL,
    @InputPayload_Clear bit = 0,
    @InputPayload nvarchar(MAX) = NULL,
    @OutputPayload_Clear bit = 0,
    @OutputPayload nvarchar(MAX) = NULL,
    @ErrorMessage_Clear bit = 0,
    @ErrorMessage nvarchar(MAX) = NULL,
    @AgentRunID_Clear bit = 0,
    @AgentRunID uniqueidentifier = NULL,
    @ClaimedBy_Clear bit = 0,
    @ClaimedBy nvarchar(100) = NULL,
    @ClaimExpiresAt_Clear bit = 0,
    @ClaimExpiresAt datetimeoffset = NULL,
    @ActionID_Clear bit = 0,
    @ActionID uniqueidentifier = NULL,
    @StepType_Clear bit = 0,
    @StepType nvarchar(20) = NULL,
    @PromptID_Clear bit = 0,
    @PromptID uniqueidentifier = NULL,
    @Configuration_Clear bit = 0,
    @Configuration nvarchar(MAX) = NULL
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE
        [${flyway:defaultSchema}].[Task]
    SET
        [ParentID] = CASE WHEN @ParentID_Clear = 1 THEN NULL ELSE ISNULL(@ParentID, [ParentID]) END,
        [Name] = ISNULL(@Name, [Name]),
        [Description] = CASE WHEN @Description_Clear = 1 THEN NULL ELSE ISNULL(@Description, [Description]) END,
        [TypeID] = ISNULL(@TypeID, [TypeID]),
        [EnvironmentID] = ISNULL(@EnvironmentID, [EnvironmentID]),
        [ProjectID] = CASE WHEN @ProjectID_Clear = 1 THEN NULL ELSE ISNULL(@ProjectID, [ProjectID]) END,
        [ConversationDetailID] = CASE WHEN @ConversationDetailID_Clear = 1 THEN NULL ELSE ISNULL(@ConversationDetailID, [ConversationDetailID]) END,
        [UserID] = CASE WHEN @UserID_Clear = 1 THEN NULL ELSE ISNULL(@UserID, [UserID]) END,
        [AgentID] = CASE WHEN @AgentID_Clear = 1 THEN NULL ELSE ISNULL(@AgentID, [AgentID]) END,
        [Status] = ISNULL(@Status, [Status]),
        [PercentComplete] = CASE WHEN @PercentComplete_Clear = 1 THEN NULL ELSE ISNULL(@PercentComplete, [PercentComplete]) END,
        [DueAt] = CASE WHEN @DueAt_Clear = 1 THEN NULL ELSE ISNULL(@DueAt, [DueAt]) END,
        [StartedAt] = CASE WHEN @StartedAt_Clear = 1 THEN NULL ELSE ISNULL(@StartedAt, [StartedAt]) END,
        [CompletedAt] = CASE WHEN @CompletedAt_Clear = 1 THEN NULL ELSE ISNULL(@CompletedAt, [CompletedAt]) END,
        [InputPayload] = CASE WHEN @InputPayload_Clear = 1 THEN NULL ELSE ISNULL(@InputPayload, [InputPayload]) END,
        [OutputPayload] = CASE WHEN @OutputPayload_Clear = 1 THEN NULL ELSE ISNULL(@OutputPayload, [OutputPayload]) END,
        [ErrorMessage] = CASE WHEN @ErrorMessage_Clear = 1 THEN NULL ELSE ISNULL(@ErrorMessage, [ErrorMessage]) END,
        [AgentRunID] = CASE WHEN @AgentRunID_Clear = 1 THEN NULL ELSE ISNULL(@AgentRunID, [AgentRunID]) END,
        [ClaimedBy] = CASE WHEN @ClaimedBy_Clear = 1 THEN NULL ELSE ISNULL(@ClaimedBy, [ClaimedBy]) END,
        [ClaimExpiresAt] = CASE WHEN @ClaimExpiresAt_Clear = 1 THEN NULL ELSE ISNULL(@ClaimExpiresAt, [ClaimExpiresAt]) END,
        [ActionID] = CASE WHEN @ActionID_Clear = 1 THEN NULL ELSE ISNULL(@ActionID, [ActionID]) END,
        [StepType] = CASE WHEN @StepType_Clear = 1 THEN NULL ELSE ISNULL(@StepType, [StepType]) END,
        [PromptID] = CASE WHEN @PromptID_Clear = 1 THEN NULL ELSE ISNULL(@PromptID, [PromptID]) END,
        [Configuration] = CASE WHEN @Configuration_Clear = 1 THEN NULL ELSE ISNULL(@Configuration, [Configuration]) END
    WHERE
        [ID] = @ID

    -- Check if the update was successful
    IF @@ROWCOUNT = 0
        -- Nothing was updated, return no rows, but column structure from base view intact, semantically correct this way.
        SELECT TOP 0 * FROM [${flyway:defaultSchema}].[vwTasks] WHERE 1=0
    ELSE
        -- Return the updated record so the caller can see the updated values and any calculated fields
        SELECT
                                        *
                                    FROM
                                        [${flyway:defaultSchema}].[vwTasks]
                                    WHERE
                                        [ID] = @ID
                                    
END
GO

GRANT EXECUTE ON [${flyway:defaultSchema}].[spUpdateTask] TO [cdp_Developer], [cdp_Integration]
GO

------------------------------------------------------------
----- TRIGGER FOR __mj_UpdatedAt field for the Task table
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[trgUpdateTask]', 'TR') IS NOT NULL
    DROP TRIGGER [${flyway:defaultSchema}].[trgUpdateTask];
GO
CREATE TRIGGER [${flyway:defaultSchema}].trgUpdateTask
ON [${flyway:defaultSchema}].[Task]
AFTER UPDATE
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE
        [${flyway:defaultSchema}].[Task]
    SET
        __mj_UpdatedAt = GETUTCDATE()
    FROM
        [${flyway:defaultSchema}].[Task] AS _organicTable
    INNER JOIN
        INSERTED AS I ON
        _organicTable.[ID] = I.[ID];
END;
GO

/* spUpdate Permissions for MJ: Tasks */

GRANT EXECUTE ON [${flyway:defaultSchema}].[spUpdateTask] TO [cdp_Developer], [cdp_Integration];

/* spDelete SQL for MJ: Tasks */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Tasks
-- Item: spDeleteTask
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- DELETE PROCEDURE FOR Task
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[spDeleteTask]', 'P') IS NOT NULL
    DROP PROCEDURE [${flyway:defaultSchema}].[spDeleteTask];
GO

CREATE PROCEDURE [${flyway:defaultSchema}].[spDeleteTask]
    @ID uniqueidentifier
AS
BEGIN
    SET NOCOUNT ON;

    DELETE FROM
        [${flyway:defaultSchema}].[Task]
    WHERE
        [ID] = @ID


    -- Check if the delete was successful
    IF @@ROWCOUNT = 0
        SELECT NULL AS [ID] -- Return NULL for all primary key fields to indicate no record was deleted
    ELSE
        SELECT @ID AS [ID] -- Return the primary key values to indicate we successfully deleted the record
END
GO
GRANT EXECUTE ON [${flyway:defaultSchema}].[spDeleteTask] TO [cdp_Developer], [cdp_Integration];

/* spDelete Permissions for MJ: Tasks */

GRANT EXECUTE ON [${flyway:defaultSchema}].[spDeleteTask] TO [cdp_Developer], [cdp_Integration];

/* spDelete SQL for MJ: Actions */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Actions
-- Item: spDeleteAction
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- DELETE PROCEDURE FOR Action
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[spDeleteAction]', 'P') IS NOT NULL
    DROP PROCEDURE [${flyway:defaultSchema}].[spDeleteAction];
GO

CREATE PROCEDURE [${flyway:defaultSchema}].[spDeleteAction]
    @ID uniqueidentifier
AS
BEGIN
    SET NOCOUNT ON;
    -- Cascade delete from ActionAuthorization using cursor to call spDeleteActionAuthorization
    DECLARE @MJActionAuthorizations_ActionIDID uniqueidentifier
    DECLARE cascade_delete_MJActionAuthorizations_ActionID_cursor CURSOR FOR 
        SELECT [ID]
        FROM [${flyway:defaultSchema}].[ActionAuthorization]
        WHERE [ActionID] = @ID
    
    OPEN cascade_delete_MJActionAuthorizations_ActionID_cursor
    FETCH NEXT FROM cascade_delete_MJActionAuthorizations_ActionID_cursor INTO @MJActionAuthorizations_ActionIDID
    
    WHILE @@FETCH_STATUS = 0
    BEGIN
        EXEC [${flyway:defaultSchema}].[spDeleteActionAuthorization] @ID = @MJActionAuthorizations_ActionIDID
        
        FETCH NEXT FROM cascade_delete_MJActionAuthorizations_ActionID_cursor INTO @MJActionAuthorizations_ActionIDID
    END
    
    CLOSE cascade_delete_MJActionAuthorizations_ActionID_cursor
    DEALLOCATE cascade_delete_MJActionAuthorizations_ActionID_cursor
    
    -- Cascade delete from ActionContext using cursor to call spDeleteActionContext
    DECLARE @MJActionContexts_ActionIDID uniqueidentifier
    DECLARE cascade_delete_MJActionContexts_ActionID_cursor CURSOR FOR 
        SELECT [ID]
        FROM [${flyway:defaultSchema}].[ActionContext]
        WHERE [ActionID] = @ID
    
    OPEN cascade_delete_MJActionContexts_ActionID_cursor
    FETCH NEXT FROM cascade_delete_MJActionContexts_ActionID_cursor INTO @MJActionContexts_ActionIDID
    
    WHILE @@FETCH_STATUS = 0
    BEGIN
        EXEC [${flyway:defaultSchema}].[spDeleteActionContext] @ID = @MJActionContexts_ActionIDID
        
        FETCH NEXT FROM cascade_delete_MJActionContexts_ActionID_cursor INTO @MJActionContexts_ActionIDID
    END
    
    CLOSE cascade_delete_MJActionContexts_ActionID_cursor
    DEALLOCATE cascade_delete_MJActionContexts_ActionID_cursor
    
    -- Cascade delete from ActionExecutionLog using cursor to call spDeleteActionExecutionLog
    DECLARE @MJActionExecutionLogs_ActionIDID uniqueidentifier
    DECLARE cascade_delete_MJActionExecutionLogs_ActionID_cursor CURSOR FOR 
        SELECT [ID]
        FROM [${flyway:defaultSchema}].[ActionExecutionLog]
        WHERE [ActionID] = @ID
    
    OPEN cascade_delete_MJActionExecutionLogs_ActionID_cursor
    FETCH NEXT FROM cascade_delete_MJActionExecutionLogs_ActionID_cursor INTO @MJActionExecutionLogs_ActionIDID
    
    WHILE @@FETCH_STATUS = 0
    BEGIN
        EXEC [${flyway:defaultSchema}].[spDeleteActionExecutionLog] @ID = @MJActionExecutionLogs_ActionIDID
        
        FETCH NEXT FROM cascade_delete_MJActionExecutionLogs_ActionID_cursor INTO @MJActionExecutionLogs_ActionIDID
    END
    
    CLOSE cascade_delete_MJActionExecutionLogs_ActionID_cursor
    DEALLOCATE cascade_delete_MJActionExecutionLogs_ActionID_cursor
    
    -- Cascade delete from ActionLibrary using cursor to call spDeleteActionLibrary
    DECLARE @MJActionLibraries_ActionIDID uniqueidentifier
    DECLARE cascade_delete_MJActionLibraries_ActionID_cursor CURSOR FOR 
        SELECT [ID]
        FROM [${flyway:defaultSchema}].[ActionLibrary]
        WHERE [ActionID] = @ID
    
    OPEN cascade_delete_MJActionLibraries_ActionID_cursor
    FETCH NEXT FROM cascade_delete_MJActionLibraries_ActionID_cursor INTO @MJActionLibraries_ActionIDID
    
    WHILE @@FETCH_STATUS = 0
    BEGIN
        EXEC [${flyway:defaultSchema}].[spDeleteActionLibrary] @ID = @MJActionLibraries_ActionIDID
        
        FETCH NEXT FROM cascade_delete_MJActionLibraries_ActionID_cursor INTO @MJActionLibraries_ActionIDID
    END
    
    CLOSE cascade_delete_MJActionLibraries_ActionID_cursor
    DEALLOCATE cascade_delete_MJActionLibraries_ActionID_cursor
    
    -- Cascade delete from ActionParam using cursor to call spDeleteActionParam
    DECLARE @MJActionParams_ActionIDID uniqueidentifier
    DECLARE cascade_delete_MJActionParams_ActionID_cursor CURSOR FOR 
        SELECT [ID]
        FROM [${flyway:defaultSchema}].[ActionParam]
        WHERE [ActionID] = @ID
    
    OPEN cascade_delete_MJActionParams_ActionID_cursor
    FETCH NEXT FROM cascade_delete_MJActionParams_ActionID_cursor INTO @MJActionParams_ActionIDID
    
    WHILE @@FETCH_STATUS = 0
    BEGIN
        EXEC [${flyway:defaultSchema}].[spDeleteActionParam] @ID = @MJActionParams_ActionIDID
        
        FETCH NEXT FROM cascade_delete_MJActionParams_ActionID_cursor INTO @MJActionParams_ActionIDID
    END
    
    CLOSE cascade_delete_MJActionParams_ActionID_cursor
    DEALLOCATE cascade_delete_MJActionParams_ActionID_cursor
    
    -- Cascade delete from ActionResultCode using cursor to call spDeleteActionResultCode
    DECLARE @MJActionResultCodes_ActionIDID uniqueidentifier
    DECLARE cascade_delete_MJActionResultCodes_ActionID_cursor CURSOR FOR 
        SELECT [ID]
        FROM [${flyway:defaultSchema}].[ActionResultCode]
        WHERE [ActionID] = @ID
    
    OPEN cascade_delete_MJActionResultCodes_ActionID_cursor
    FETCH NEXT FROM cascade_delete_MJActionResultCodes_ActionID_cursor INTO @MJActionResultCodes_ActionIDID
    
    WHILE @@FETCH_STATUS = 0
    BEGIN
        EXEC [${flyway:defaultSchema}].[spDeleteActionResultCode] @ID = @MJActionResultCodes_ActionIDID
        
        FETCH NEXT FROM cascade_delete_MJActionResultCodes_ActionID_cursor INTO @MJActionResultCodes_ActionIDID
    END
    
    CLOSE cascade_delete_MJActionResultCodes_ActionID_cursor
    DEALLOCATE cascade_delete_MJActionResultCodes_ActionID_cursor
    
    -- Cascade delete from Action using cursor to call spDeleteAction
    DECLARE @MJActions_ParentIDID uniqueidentifier
    DECLARE cascade_delete_MJActions_ParentID_cursor CURSOR FOR 
        SELECT [ID]
        FROM [${flyway:defaultSchema}].[Action]
        WHERE [ParentID] = @ID
    
    OPEN cascade_delete_MJActions_ParentID_cursor
    FETCH NEXT FROM cascade_delete_MJActions_ParentID_cursor INTO @MJActions_ParentIDID
    
    WHILE @@FETCH_STATUS = 0
    BEGIN
        EXEC [${flyway:defaultSchema}].[spDeleteAction] @ID = @MJActions_ParentIDID
        
        FETCH NEXT FROM cascade_delete_MJActions_ParentID_cursor INTO @MJActions_ParentIDID
    END
    
    CLOSE cascade_delete_MJActions_ParentID_cursor
    DEALLOCATE cascade_delete_MJActions_ParentID_cursor
    
    -- Cascade update on AIAgentAction using cursor to call spUpdateAIAgentAction
    DECLARE @MJAIAgentActions_ActionIDID uniqueidentifier
    DECLARE @MJAIAgentActions_ActionID_AgentID uniqueidentifier
    DECLARE @MJAIAgentActions_ActionID_ActionID uniqueidentifier
    DECLARE @MJAIAgentActions_ActionID_Status nvarchar(15)
    DECLARE @MJAIAgentActions_ActionID_MinExecutionsPerRun int
    DECLARE @MJAIAgentActions_ActionID_MaxExecutionsPerRun int
    DECLARE @MJAIAgentActions_ActionID_ResultExpirationTurns int
    DECLARE @MJAIAgentActions_ActionID_ResultExpirationMode nvarchar(20)
    DECLARE @MJAIAgentActions_ActionID_CompactMode nvarchar(20)
    DECLARE @MJAIAgentActions_ActionID_CompactLength int
    DECLARE @MJAIAgentActions_ActionID_CompactPromptID uniqueidentifier
    DECLARE cascade_update_MJAIAgentActions_ActionID_cursor CURSOR FOR
        SELECT [ID], [AgentID], [ActionID], [Status], [MinExecutionsPerRun], [MaxExecutionsPerRun], [ResultExpirationTurns], [ResultExpirationMode], [CompactMode], [CompactLength], [CompactPromptID]
        FROM [${flyway:defaultSchema}].[AIAgentAction]
        WHERE [ActionID] = @ID

    OPEN cascade_update_MJAIAgentActions_ActionID_cursor
    FETCH NEXT FROM cascade_update_MJAIAgentActions_ActionID_cursor INTO @MJAIAgentActions_ActionIDID, @MJAIAgentActions_ActionID_AgentID, @MJAIAgentActions_ActionID_ActionID, @MJAIAgentActions_ActionID_Status, @MJAIAgentActions_ActionID_MinExecutionsPerRun, @MJAIAgentActions_ActionID_MaxExecutionsPerRun, @MJAIAgentActions_ActionID_ResultExpirationTurns, @MJAIAgentActions_ActionID_ResultExpirationMode, @MJAIAgentActions_ActionID_CompactMode, @MJAIAgentActions_ActionID_CompactLength, @MJAIAgentActions_ActionID_CompactPromptID

    WHILE @@FETCH_STATUS = 0
    BEGIN
        -- Set the FK field to NULL
        SET @MJAIAgentActions_ActionID_ActionID = NULL

        -- Call the update SP for the related entity
        EXEC [${flyway:defaultSchema}].[spUpdateAIAgentAction] @ID = @MJAIAgentActions_ActionIDID, @AgentID = @MJAIAgentActions_ActionID_AgentID, @ActionID_Clear = 1, @ActionID = @MJAIAgentActions_ActionID_ActionID, @Status = @MJAIAgentActions_ActionID_Status, @MinExecutionsPerRun = @MJAIAgentActions_ActionID_MinExecutionsPerRun, @MaxExecutionsPerRun = @MJAIAgentActions_ActionID_MaxExecutionsPerRun, @ResultExpirationTurns = @MJAIAgentActions_ActionID_ResultExpirationTurns, @ResultExpirationMode = @MJAIAgentActions_ActionID_ResultExpirationMode, @CompactMode = @MJAIAgentActions_ActionID_CompactMode, @CompactLength = @MJAIAgentActions_ActionID_CompactLength, @CompactPromptID = @MJAIAgentActions_ActionID_CompactPromptID

        FETCH NEXT FROM cascade_update_MJAIAgentActions_ActionID_cursor INTO @MJAIAgentActions_ActionIDID, @MJAIAgentActions_ActionID_AgentID, @MJAIAgentActions_ActionID_ActionID, @MJAIAgentActions_ActionID_Status, @MJAIAgentActions_ActionID_MinExecutionsPerRun, @MJAIAgentActions_ActionID_MaxExecutionsPerRun, @MJAIAgentActions_ActionID_ResultExpirationTurns, @MJAIAgentActions_ActionID_ResultExpirationMode, @MJAIAgentActions_ActionID_CompactMode, @MJAIAgentActions_ActionID_CompactLength, @MJAIAgentActions_ActionID_CompactPromptID
    END

    CLOSE cascade_update_MJAIAgentActions_ActionID_cursor
    DEALLOCATE cascade_update_MJAIAgentActions_ActionID_cursor
    
    -- Cascade update on AIAgentStep using cursor to call spUpdateAIAgentStep
    DECLARE @MJAIAgentSteps_ActionIDID uniqueidentifier
    DECLARE @MJAIAgentSteps_ActionID_AgentID uniqueidentifier
    DECLARE @MJAIAgentSteps_ActionID_Name nvarchar(255)
    DECLARE @MJAIAgentSteps_ActionID_Description nvarchar(MAX)
    DECLARE @MJAIAgentSteps_ActionID_StepType nvarchar(20)
    DECLARE @MJAIAgentSteps_ActionID_StartingStep bit
    DECLARE @MJAIAgentSteps_ActionID_TimeoutSeconds int
    DECLARE @MJAIAgentSteps_ActionID_RetryCount int
    DECLARE @MJAIAgentSteps_ActionID_OnErrorBehavior nvarchar(20)
    DECLARE @MJAIAgentSteps_ActionID_ActionID uniqueidentifier
    DECLARE @MJAIAgentSteps_ActionID_SubAgentID uniqueidentifier
    DECLARE @MJAIAgentSteps_ActionID_PromptID uniqueidentifier
    DECLARE @MJAIAgentSteps_ActionID_ActionOutputMapping nvarchar(MAX)
    DECLARE @MJAIAgentSteps_ActionID_PositionX int
    DECLARE @MJAIAgentSteps_ActionID_PositionY int
    DECLARE @MJAIAgentSteps_ActionID_Width int
    DECLARE @MJAIAgentSteps_ActionID_Height int
    DECLARE @MJAIAgentSteps_ActionID_Status nvarchar(20)
    DECLARE @MJAIAgentSteps_ActionID_ActionInputMapping nvarchar(MAX)
    DECLARE @MJAIAgentSteps_ActionID_LoopBodyType nvarchar(50)
    DECLARE @MJAIAgentSteps_ActionID_Configuration nvarchar(MAX)
    DECLARE cascade_update_MJAIAgentSteps_ActionID_cursor CURSOR FOR
        SELECT [ID], [AgentID], [Name], [Description], [StepType], [StartingStep], [TimeoutSeconds], [RetryCount], [OnErrorBehavior], [ActionID], [SubAgentID], [PromptID], [ActionOutputMapping], [PositionX], [PositionY], [Width], [Height], [Status], [ActionInputMapping], [LoopBodyType], [Configuration]
        FROM [${flyway:defaultSchema}].[AIAgentStep]
        WHERE [ActionID] = @ID

    OPEN cascade_update_MJAIAgentSteps_ActionID_cursor
    FETCH NEXT FROM cascade_update_MJAIAgentSteps_ActionID_cursor INTO @MJAIAgentSteps_ActionIDID, @MJAIAgentSteps_ActionID_AgentID, @MJAIAgentSteps_ActionID_Name, @MJAIAgentSteps_ActionID_Description, @MJAIAgentSteps_ActionID_StepType, @MJAIAgentSteps_ActionID_StartingStep, @MJAIAgentSteps_ActionID_TimeoutSeconds, @MJAIAgentSteps_ActionID_RetryCount, @MJAIAgentSteps_ActionID_OnErrorBehavior, @MJAIAgentSteps_ActionID_ActionID, @MJAIAgentSteps_ActionID_SubAgentID, @MJAIAgentSteps_ActionID_PromptID, @MJAIAgentSteps_ActionID_ActionOutputMapping, @MJAIAgentSteps_ActionID_PositionX, @MJAIAgentSteps_ActionID_PositionY, @MJAIAgentSteps_ActionID_Width, @MJAIAgentSteps_ActionID_Height, @MJAIAgentSteps_ActionID_Status, @MJAIAgentSteps_ActionID_ActionInputMapping, @MJAIAgentSteps_ActionID_LoopBodyType, @MJAIAgentSteps_ActionID_Configuration

    WHILE @@FETCH_STATUS = 0
    BEGIN
        -- Set the FK field to NULL
        SET @MJAIAgentSteps_ActionID_ActionID = NULL

        -- Call the update SP for the related entity
        EXEC [${flyway:defaultSchema}].[spUpdateAIAgentStep] @ID = @MJAIAgentSteps_ActionIDID, @AgentID = @MJAIAgentSteps_ActionID_AgentID, @Name = @MJAIAgentSteps_ActionID_Name, @Description = @MJAIAgentSteps_ActionID_Description, @StepType = @MJAIAgentSteps_ActionID_StepType, @StartingStep = @MJAIAgentSteps_ActionID_StartingStep, @TimeoutSeconds = @MJAIAgentSteps_ActionID_TimeoutSeconds, @RetryCount = @MJAIAgentSteps_ActionID_RetryCount, @OnErrorBehavior = @MJAIAgentSteps_ActionID_OnErrorBehavior, @ActionID_Clear = 1, @ActionID = @MJAIAgentSteps_ActionID_ActionID, @SubAgentID = @MJAIAgentSteps_ActionID_SubAgentID, @PromptID = @MJAIAgentSteps_ActionID_PromptID, @ActionOutputMapping = @MJAIAgentSteps_ActionID_ActionOutputMapping, @PositionX = @MJAIAgentSteps_ActionID_PositionX, @PositionY = @MJAIAgentSteps_ActionID_PositionY, @Width = @MJAIAgentSteps_ActionID_Width, @Height = @MJAIAgentSteps_ActionID_Height, @Status = @MJAIAgentSteps_ActionID_Status, @ActionInputMapping = @MJAIAgentSteps_ActionID_ActionInputMapping, @LoopBodyType = @MJAIAgentSteps_ActionID_LoopBodyType, @Configuration = @MJAIAgentSteps_ActionID_Configuration

        FETCH NEXT FROM cascade_update_MJAIAgentSteps_ActionID_cursor INTO @MJAIAgentSteps_ActionIDID, @MJAIAgentSteps_ActionID_AgentID, @MJAIAgentSteps_ActionID_Name, @MJAIAgentSteps_ActionID_Description, @MJAIAgentSteps_ActionID_StepType, @MJAIAgentSteps_ActionID_StartingStep, @MJAIAgentSteps_ActionID_TimeoutSeconds, @MJAIAgentSteps_ActionID_RetryCount, @MJAIAgentSteps_ActionID_OnErrorBehavior, @MJAIAgentSteps_ActionID_ActionID, @MJAIAgentSteps_ActionID_SubAgentID, @MJAIAgentSteps_ActionID_PromptID, @MJAIAgentSteps_ActionID_ActionOutputMapping, @MJAIAgentSteps_ActionID_PositionX, @MJAIAgentSteps_ActionID_PositionY, @MJAIAgentSteps_ActionID_Width, @MJAIAgentSteps_ActionID_Height, @MJAIAgentSteps_ActionID_Status, @MJAIAgentSteps_ActionID_ActionInputMapping, @MJAIAgentSteps_ActionID_LoopBodyType, @MJAIAgentSteps_ActionID_Configuration
    END

    CLOSE cascade_update_MJAIAgentSteps_ActionID_cursor
    DEALLOCATE cascade_update_MJAIAgentSteps_ActionID_cursor
    
    -- Cascade delete from AISkillAction using cursor to call spDeleteAISkillAction
    DECLARE @MJAISkillActions_ActionIDID uniqueidentifier
    DECLARE cascade_delete_MJAISkillActions_ActionID_cursor CURSOR FOR 
        SELECT [ID]
        FROM [${flyway:defaultSchema}].[AISkillAction]
        WHERE [ActionID] = @ID
    
    OPEN cascade_delete_MJAISkillActions_ActionID_cursor
    FETCH NEXT FROM cascade_delete_MJAISkillActions_ActionID_cursor INTO @MJAISkillActions_ActionIDID
    
    WHILE @@FETCH_STATUS = 0
    BEGIN
        EXEC [${flyway:defaultSchema}].[spDeleteAISkillAction] @ID = @MJAISkillActions_ActionIDID
        
        FETCH NEXT FROM cascade_delete_MJAISkillActions_ActionID_cursor INTO @MJAISkillActions_ActionIDID
    END
    
    CLOSE cascade_delete_MJAISkillActions_ActionID_cursor
    DEALLOCATE cascade_delete_MJAISkillActions_ActionID_cursor
    
    -- Cascade delete from EntityAction using cursor to call spDeleteEntityAction
    DECLARE @MJEntityActions_ActionIDID uniqueidentifier
    DECLARE cascade_delete_MJEntityActions_ActionID_cursor CURSOR FOR 
        SELECT [ID]
        FROM [${flyway:defaultSchema}].[EntityAction]
        WHERE [ActionID] = @ID
    
    OPEN cascade_delete_MJEntityActions_ActionID_cursor
    FETCH NEXT FROM cascade_delete_MJEntityActions_ActionID_cursor INTO @MJEntityActions_ActionIDID
    
    WHILE @@FETCH_STATUS = 0
    BEGIN
        EXEC [${flyway:defaultSchema}].[spDeleteEntityAction] @ID = @MJEntityActions_ActionIDID
        
        FETCH NEXT FROM cascade_delete_MJEntityActions_ActionID_cursor INTO @MJEntityActions_ActionIDID
    END
    
    CLOSE cascade_delete_MJEntityActions_ActionID_cursor
    DEALLOCATE cascade_delete_MJEntityActions_ActionID_cursor
    
    -- Cascade update on MCPServerTool using cursor to call spUpdateMCPServerTool
    DECLARE @MJMCPServerTools_GeneratedActionIDID uniqueidentifier
    DECLARE @MJMCPServerTools_GeneratedActionID_MCPServerID uniqueidentifier
    DECLARE @MJMCPServerTools_GeneratedActionID_ToolName nvarchar(255)
    DECLARE @MJMCPServerTools_GeneratedActionID_ToolTitle nvarchar(255)
    DECLARE @MJMCPServerTools_GeneratedActionID_ToolDescription nvarchar(MAX)
    DECLARE @MJMCPServerTools_GeneratedActionID_InputSchema nvarchar(MAX)
    DECLARE @MJMCPServerTools_GeneratedActionID_OutputSchema nvarchar(MAX)
    DECLARE @MJMCPServerTools_GeneratedActionID_Annotations nvarchar(MAX)
    DECLARE @MJMCPServerTools_GeneratedActionID_Status nvarchar(50)
    DECLARE @MJMCPServerTools_GeneratedActionID_DiscoveredAt datetimeoffset
    DECLARE @MJMCPServerTools_GeneratedActionID_LastSeenAt datetimeoffset
    DECLARE @MJMCPServerTools_GeneratedActionID_GeneratedActionID uniqueidentifier
    DECLARE @MJMCPServerTools_GeneratedActionID_GeneratedActionCategoryID uniqueidentifier
    DECLARE cascade_update_MJMCPServerTools_GeneratedActionID_cursor CURSOR FOR
        SELECT [ID], [MCPServerID], [ToolName], [ToolTitle], [ToolDescription], [InputSchema], [OutputSchema], [Annotations], [Status], [DiscoveredAt], [LastSeenAt], [GeneratedActionID], [GeneratedActionCategoryID]
        FROM [${flyway:defaultSchema}].[MCPServerTool]
        WHERE [GeneratedActionID] = @ID

    OPEN cascade_update_MJMCPServerTools_GeneratedActionID_cursor
    FETCH NEXT FROM cascade_update_MJMCPServerTools_GeneratedActionID_cursor INTO @MJMCPServerTools_GeneratedActionIDID, @MJMCPServerTools_GeneratedActionID_MCPServerID, @MJMCPServerTools_GeneratedActionID_ToolName, @MJMCPServerTools_GeneratedActionID_ToolTitle, @MJMCPServerTools_GeneratedActionID_ToolDescription, @MJMCPServerTools_GeneratedActionID_InputSchema, @MJMCPServerTools_GeneratedActionID_OutputSchema, @MJMCPServerTools_GeneratedActionID_Annotations, @MJMCPServerTools_GeneratedActionID_Status, @MJMCPServerTools_GeneratedActionID_DiscoveredAt, @MJMCPServerTools_GeneratedActionID_LastSeenAt, @MJMCPServerTools_GeneratedActionID_GeneratedActionID, @MJMCPServerTools_GeneratedActionID_GeneratedActionCategoryID

    WHILE @@FETCH_STATUS = 0
    BEGIN
        -- Set the FK field to NULL
        SET @MJMCPServerTools_GeneratedActionID_GeneratedActionID = NULL

        -- Call the update SP for the related entity
        EXEC [${flyway:defaultSchema}].[spUpdateMCPServerTool] @ID = @MJMCPServerTools_GeneratedActionIDID, @MCPServerID = @MJMCPServerTools_GeneratedActionID_MCPServerID, @ToolName = @MJMCPServerTools_GeneratedActionID_ToolName, @ToolTitle = @MJMCPServerTools_GeneratedActionID_ToolTitle, @ToolDescription = @MJMCPServerTools_GeneratedActionID_ToolDescription, @InputSchema = @MJMCPServerTools_GeneratedActionID_InputSchema, @OutputSchema = @MJMCPServerTools_GeneratedActionID_OutputSchema, @Annotations = @MJMCPServerTools_GeneratedActionID_Annotations, @Status = @MJMCPServerTools_GeneratedActionID_Status, @DiscoveredAt = @MJMCPServerTools_GeneratedActionID_DiscoveredAt, @LastSeenAt = @MJMCPServerTools_GeneratedActionID_LastSeenAt, @GeneratedActionID_Clear = 1, @GeneratedActionID = @MJMCPServerTools_GeneratedActionID_GeneratedActionID, @GeneratedActionCategoryID = @MJMCPServerTools_GeneratedActionID_GeneratedActionCategoryID

        FETCH NEXT FROM cascade_update_MJMCPServerTools_GeneratedActionID_cursor INTO @MJMCPServerTools_GeneratedActionIDID, @MJMCPServerTools_GeneratedActionID_MCPServerID, @MJMCPServerTools_GeneratedActionID_ToolName, @MJMCPServerTools_GeneratedActionID_ToolTitle, @MJMCPServerTools_GeneratedActionID_ToolDescription, @MJMCPServerTools_GeneratedActionID_InputSchema, @MJMCPServerTools_GeneratedActionID_OutputSchema, @MJMCPServerTools_GeneratedActionID_Annotations, @MJMCPServerTools_GeneratedActionID_Status, @MJMCPServerTools_GeneratedActionID_DiscoveredAt, @MJMCPServerTools_GeneratedActionID_LastSeenAt, @MJMCPServerTools_GeneratedActionID_GeneratedActionID, @MJMCPServerTools_GeneratedActionID_GeneratedActionCategoryID
    END

    CLOSE cascade_update_MJMCPServerTools_GeneratedActionID_cursor
    DEALLOCATE cascade_update_MJMCPServerTools_GeneratedActionID_cursor
    
    -- Cascade update on RecordProcess using cursor to call spUpdateRecordProcess
    DECLARE @MJRecordProcesses_ActionIDID uniqueidentifier
    DECLARE @MJRecordProcesses_ActionID_Name nvarchar(255)
    DECLARE @MJRecordProcesses_ActionID_Description nvarchar(MAX)
    DECLARE @MJRecordProcesses_ActionID_CategoryID uniqueidentifier
    DECLARE @MJRecordProcesses_ActionID_EntityID uniqueidentifier
    DECLARE @MJRecordProcesses_ActionID_Status nvarchar(20)
    DECLARE @MJRecordProcesses_ActionID_WorkType nvarchar(20)
    DECLARE @MJRecordProcesses_ActionID_ActionID uniqueidentifier
    DECLARE @MJRecordProcesses_ActionID_AgentID uniqueidentifier
    DECLARE @MJRecordProcesses_ActionID_PromptID uniqueidentifier
    DECLARE @MJRecordProcesses_ActionID_ScopeType nvarchar(20)
    DECLARE @MJRecordProcesses_ActionID_ScopeViewID uniqueidentifier
    DECLARE @MJRecordProcesses_ActionID_ScopeListID uniqueidentifier
    DECLARE @MJRecordProcesses_ActionID_ScopeFilter nvarchar(MAX)
    DECLARE @MJRecordProcesses_ActionID_OnChangeEnabled bit
    DECLARE @MJRecordProcesses_ActionID_OnChangeInvocationType nvarchar(30)
    DECLARE @MJRecordProcesses_ActionID_OnChangeFilter nvarchar(MAX)
    DECLARE @MJRecordProcesses_ActionID_ScheduleEnabled bit
    DECLARE @MJRecordProcesses_ActionID_CronExpression nvarchar(120)
    DECLARE @MJRecordProcesses_ActionID_Timezone nvarchar(100)
    DECLARE @MJRecordProcesses_ActionID_OnDemandEnabled bit
    DECLARE @MJRecordProcesses_ActionID_InputMapping nvarchar(MAX)
    DECLARE @MJRecordProcesses_ActionID_OutputMapping nvarchar(MAX)
    DECLARE @MJRecordProcesses_ActionID_SkipUnchanged bit
    DECLARE @MJRecordProcesses_ActionID_WatermarkStrategy nvarchar(20)
    DECLARE @MJRecordProcesses_ActionID_BatchSize int
    DECLARE @MJRecordProcesses_ActionID_MaxConcurrency int
    DECLARE @MJRecordProcesses_ActionID_Configuration nvarchar(MAX)
    DECLARE cascade_update_MJRecordProcesses_ActionID_cursor CURSOR FOR
        SELECT [ID], [Name], [Description], [CategoryID], [EntityID], [Status], [WorkType], [ActionID], [AgentID], [PromptID], [ScopeType], [ScopeViewID], [ScopeListID], [ScopeFilter], [OnChangeEnabled], [OnChangeInvocationType], [OnChangeFilter], [ScheduleEnabled], [CronExpression], [Timezone], [OnDemandEnabled], [InputMapping], [OutputMapping], [SkipUnchanged], [WatermarkStrategy], [BatchSize], [MaxConcurrency], [Configuration]
        FROM [${flyway:defaultSchema}].[RecordProcess]
        WHERE [ActionID] = @ID

    OPEN cascade_update_MJRecordProcesses_ActionID_cursor
    FETCH NEXT FROM cascade_update_MJRecordProcesses_ActionID_cursor INTO @MJRecordProcesses_ActionIDID, @MJRecordProcesses_ActionID_Name, @MJRecordProcesses_ActionID_Description, @MJRecordProcesses_ActionID_CategoryID, @MJRecordProcesses_ActionID_EntityID, @MJRecordProcesses_ActionID_Status, @MJRecordProcesses_ActionID_WorkType, @MJRecordProcesses_ActionID_ActionID, @MJRecordProcesses_ActionID_AgentID, @MJRecordProcesses_ActionID_PromptID, @MJRecordProcesses_ActionID_ScopeType, @MJRecordProcesses_ActionID_ScopeViewID, @MJRecordProcesses_ActionID_ScopeListID, @MJRecordProcesses_ActionID_ScopeFilter, @MJRecordProcesses_ActionID_OnChangeEnabled, @MJRecordProcesses_ActionID_OnChangeInvocationType, @MJRecordProcesses_ActionID_OnChangeFilter, @MJRecordProcesses_ActionID_ScheduleEnabled, @MJRecordProcesses_ActionID_CronExpression, @MJRecordProcesses_ActionID_Timezone, @MJRecordProcesses_ActionID_OnDemandEnabled, @MJRecordProcesses_ActionID_InputMapping, @MJRecordProcesses_ActionID_OutputMapping, @MJRecordProcesses_ActionID_SkipUnchanged, @MJRecordProcesses_ActionID_WatermarkStrategy, @MJRecordProcesses_ActionID_BatchSize, @MJRecordProcesses_ActionID_MaxConcurrency, @MJRecordProcesses_ActionID_Configuration

    WHILE @@FETCH_STATUS = 0
    BEGIN
        -- Set the FK field to NULL
        SET @MJRecordProcesses_ActionID_ActionID = NULL

        -- Call the update SP for the related entity
        EXEC [${flyway:defaultSchema}].[spUpdateRecordProcess] @ID = @MJRecordProcesses_ActionIDID, @Name = @MJRecordProcesses_ActionID_Name, @Description = @MJRecordProcesses_ActionID_Description, @CategoryID = @MJRecordProcesses_ActionID_CategoryID, @EntityID = @MJRecordProcesses_ActionID_EntityID, @Status = @MJRecordProcesses_ActionID_Status, @WorkType = @MJRecordProcesses_ActionID_WorkType, @ActionID_Clear = 1, @ActionID = @MJRecordProcesses_ActionID_ActionID, @AgentID = @MJRecordProcesses_ActionID_AgentID, @PromptID = @MJRecordProcesses_ActionID_PromptID, @ScopeType = @MJRecordProcesses_ActionID_ScopeType, @ScopeViewID = @MJRecordProcesses_ActionID_ScopeViewID, @ScopeListID = @MJRecordProcesses_ActionID_ScopeListID, @ScopeFilter = @MJRecordProcesses_ActionID_ScopeFilter, @OnChangeEnabled = @MJRecordProcesses_ActionID_OnChangeEnabled, @OnChangeInvocationType = @MJRecordProcesses_ActionID_OnChangeInvocationType, @OnChangeFilter = @MJRecordProcesses_ActionID_OnChangeFilter, @ScheduleEnabled = @MJRecordProcesses_ActionID_ScheduleEnabled, @CronExpression = @MJRecordProcesses_ActionID_CronExpression, @Timezone = @MJRecordProcesses_ActionID_Timezone, @OnDemandEnabled = @MJRecordProcesses_ActionID_OnDemandEnabled, @InputMapping = @MJRecordProcesses_ActionID_InputMapping, @OutputMapping = @MJRecordProcesses_ActionID_OutputMapping, @SkipUnchanged = @MJRecordProcesses_ActionID_SkipUnchanged, @WatermarkStrategy = @MJRecordProcesses_ActionID_WatermarkStrategy, @BatchSize = @MJRecordProcesses_ActionID_BatchSize, @MaxConcurrency = @MJRecordProcesses_ActionID_MaxConcurrency, @Configuration = @MJRecordProcesses_ActionID_Configuration

        FETCH NEXT FROM cascade_update_MJRecordProcesses_ActionID_cursor INTO @MJRecordProcesses_ActionIDID, @MJRecordProcesses_ActionID_Name, @MJRecordProcesses_ActionID_Description, @MJRecordProcesses_ActionID_CategoryID, @MJRecordProcesses_ActionID_EntityID, @MJRecordProcesses_ActionID_Status, @MJRecordProcesses_ActionID_WorkType, @MJRecordProcesses_ActionID_ActionID, @MJRecordProcesses_ActionID_AgentID, @MJRecordProcesses_ActionID_PromptID, @MJRecordProcesses_ActionID_ScopeType, @MJRecordProcesses_ActionID_ScopeViewID, @MJRecordProcesses_ActionID_ScopeListID, @MJRecordProcesses_ActionID_ScopeFilter, @MJRecordProcesses_ActionID_OnChangeEnabled, @MJRecordProcesses_ActionID_OnChangeInvocationType, @MJRecordProcesses_ActionID_OnChangeFilter, @MJRecordProcesses_ActionID_ScheduleEnabled, @MJRecordProcesses_ActionID_CronExpression, @MJRecordProcesses_ActionID_Timezone, @MJRecordProcesses_ActionID_OnDemandEnabled, @MJRecordProcesses_ActionID_InputMapping, @MJRecordProcesses_ActionID_OutputMapping, @MJRecordProcesses_ActionID_SkipUnchanged, @MJRecordProcesses_ActionID_WatermarkStrategy, @MJRecordProcesses_ActionID_BatchSize, @MJRecordProcesses_ActionID_MaxConcurrency, @MJRecordProcesses_ActionID_Configuration
    END

    CLOSE cascade_update_MJRecordProcesses_ActionID_cursor
    DEALLOCATE cascade_update_MJRecordProcesses_ActionID_cursor
    
    -- Cascade update on Task using cursor to call spUpdateTask
    DECLARE @MJTasks_ActionIDID uniqueidentifier
    DECLARE @MJTasks_ActionID_ParentID uniqueidentifier
    DECLARE @MJTasks_ActionID_Name nvarchar(255)
    DECLARE @MJTasks_ActionID_Description nvarchar(MAX)
    DECLARE @MJTasks_ActionID_TypeID uniqueidentifier
    DECLARE @MJTasks_ActionID_EnvironmentID uniqueidentifier
    DECLARE @MJTasks_ActionID_ProjectID uniqueidentifier
    DECLARE @MJTasks_ActionID_ConversationDetailID uniqueidentifier
    DECLARE @MJTasks_ActionID_UserID uniqueidentifier
    DECLARE @MJTasks_ActionID_AgentID uniqueidentifier
    DECLARE @MJTasks_ActionID_Status nvarchar(50)
    DECLARE @MJTasks_ActionID_PercentComplete int
    DECLARE @MJTasks_ActionID_DueAt datetimeoffset
    DECLARE @MJTasks_ActionID_StartedAt datetimeoffset
    DECLARE @MJTasks_ActionID_CompletedAt datetimeoffset
    DECLARE @MJTasks_ActionID_InputPayload nvarchar(MAX)
    DECLARE @MJTasks_ActionID_OutputPayload nvarchar(MAX)
    DECLARE @MJTasks_ActionID_ErrorMessage nvarchar(MAX)
    DECLARE @MJTasks_ActionID_AgentRunID uniqueidentifier
    DECLARE @MJTasks_ActionID_ClaimedBy nvarchar(100)
    DECLARE @MJTasks_ActionID_ClaimExpiresAt datetimeoffset
    DECLARE @MJTasks_ActionID_ActionID uniqueidentifier
    DECLARE @MJTasks_ActionID_StepType nvarchar(20)
    DECLARE @MJTasks_ActionID_PromptID uniqueidentifier
    DECLARE @MJTasks_ActionID_Configuration nvarchar(MAX)
    DECLARE cascade_update_MJTasks_ActionID_cursor CURSOR FOR
        SELECT [ID], [ParentID], [Name], [Description], [TypeID], [EnvironmentID], [ProjectID], [ConversationDetailID], [UserID], [AgentID], [Status], [PercentComplete], [DueAt], [StartedAt], [CompletedAt], [InputPayload], [OutputPayload], [ErrorMessage], [AgentRunID], [ClaimedBy], [ClaimExpiresAt], [ActionID], [StepType], [PromptID], [Configuration]
        FROM [${flyway:defaultSchema}].[Task]
        WHERE [ActionID] = @ID

    OPEN cascade_update_MJTasks_ActionID_cursor
    FETCH NEXT FROM cascade_update_MJTasks_ActionID_cursor INTO @MJTasks_ActionIDID, @MJTasks_ActionID_ParentID, @MJTasks_ActionID_Name, @MJTasks_ActionID_Description, @MJTasks_ActionID_TypeID, @MJTasks_ActionID_EnvironmentID, @MJTasks_ActionID_ProjectID, @MJTasks_ActionID_ConversationDetailID, @MJTasks_ActionID_UserID, @MJTasks_ActionID_AgentID, @MJTasks_ActionID_Status, @MJTasks_ActionID_PercentComplete, @MJTasks_ActionID_DueAt, @MJTasks_ActionID_StartedAt, @MJTasks_ActionID_CompletedAt, @MJTasks_ActionID_InputPayload, @MJTasks_ActionID_OutputPayload, @MJTasks_ActionID_ErrorMessage, @MJTasks_ActionID_AgentRunID, @MJTasks_ActionID_ClaimedBy, @MJTasks_ActionID_ClaimExpiresAt, @MJTasks_ActionID_ActionID, @MJTasks_ActionID_StepType, @MJTasks_ActionID_PromptID, @MJTasks_ActionID_Configuration

    WHILE @@FETCH_STATUS = 0
    BEGIN
        -- Set the FK field to NULL
        SET @MJTasks_ActionID_ActionID = NULL

        -- Call the update SP for the related entity
        EXEC [${flyway:defaultSchema}].[spUpdateTask] @ID = @MJTasks_ActionIDID, @ParentID = @MJTasks_ActionID_ParentID, @Name = @MJTasks_ActionID_Name, @Description = @MJTasks_ActionID_Description, @TypeID = @MJTasks_ActionID_TypeID, @EnvironmentID = @MJTasks_ActionID_EnvironmentID, @ProjectID = @MJTasks_ActionID_ProjectID, @ConversationDetailID = @MJTasks_ActionID_ConversationDetailID, @UserID = @MJTasks_ActionID_UserID, @AgentID = @MJTasks_ActionID_AgentID, @Status = @MJTasks_ActionID_Status, @PercentComplete = @MJTasks_ActionID_PercentComplete, @DueAt = @MJTasks_ActionID_DueAt, @StartedAt = @MJTasks_ActionID_StartedAt, @CompletedAt = @MJTasks_ActionID_CompletedAt, @InputPayload = @MJTasks_ActionID_InputPayload, @OutputPayload = @MJTasks_ActionID_OutputPayload, @ErrorMessage = @MJTasks_ActionID_ErrorMessage, @AgentRunID = @MJTasks_ActionID_AgentRunID, @ClaimedBy = @MJTasks_ActionID_ClaimedBy, @ClaimExpiresAt = @MJTasks_ActionID_ClaimExpiresAt, @ActionID_Clear = 1, @ActionID = @MJTasks_ActionID_ActionID, @StepType = @MJTasks_ActionID_StepType, @PromptID = @MJTasks_ActionID_PromptID, @Configuration = @MJTasks_ActionID_Configuration

        FETCH NEXT FROM cascade_update_MJTasks_ActionID_cursor INTO @MJTasks_ActionIDID, @MJTasks_ActionID_ParentID, @MJTasks_ActionID_Name, @MJTasks_ActionID_Description, @MJTasks_ActionID_TypeID, @MJTasks_ActionID_EnvironmentID, @MJTasks_ActionID_ProjectID, @MJTasks_ActionID_ConversationDetailID, @MJTasks_ActionID_UserID, @MJTasks_ActionID_AgentID, @MJTasks_ActionID_Status, @MJTasks_ActionID_PercentComplete, @MJTasks_ActionID_DueAt, @MJTasks_ActionID_StartedAt, @MJTasks_ActionID_CompletedAt, @MJTasks_ActionID_InputPayload, @MJTasks_ActionID_OutputPayload, @MJTasks_ActionID_ErrorMessage, @MJTasks_ActionID_AgentRunID, @MJTasks_ActionID_ClaimedBy, @MJTasks_ActionID_ClaimExpiresAt, @MJTasks_ActionID_ActionID, @MJTasks_ActionID_StepType, @MJTasks_ActionID_PromptID, @MJTasks_ActionID_Configuration
    END

    CLOSE cascade_update_MJTasks_ActionID_cursor
    DEALLOCATE cascade_update_MJTasks_ActionID_cursor
    

    DELETE FROM
        [${flyway:defaultSchema}].[Action]
    WHERE
        [ID] = @ID


    -- Check if the delete was successful
    IF @@ROWCOUNT = 0
        SELECT NULL AS [ID] -- Return NULL for all primary key fields to indicate no record was deleted
    ELSE
        SELECT @ID AS [ID] -- Return the primary key values to indicate we successfully deleted the record
END
GO
GRANT EXECUTE ON [${flyway:defaultSchema}].[spDeleteAction] TO [cdp_Integration], [cdp_Developer];

/* spDelete Permissions for MJ: Actions */

GRANT EXECUTE ON [${flyway:defaultSchema}].[spDeleteAction] TO [cdp_Integration], [cdp_Developer];

/* spDelete SQL for MJ: AI Agent Runs */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: AI Agent Runs
-- Item: spDeleteAIAgentRun
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- DELETE PROCEDURE FOR AIAgentRun
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[spDeleteAIAgentRun]', 'P') IS NOT NULL
    DROP PROCEDURE [${flyway:defaultSchema}].[spDeleteAIAgentRun];
GO

CREATE PROCEDURE [${flyway:defaultSchema}].[spDeleteAIAgentRun]
    @ID uniqueidentifier
AS
BEGIN
    SET NOCOUNT ON;
    -- Cascade update on AIAgentExample using cursor to call spUpdateAIAgentExample
    DECLARE @MJAIAgentExamples_SourceAIAgentRunIDID uniqueidentifier
    DECLARE @MJAIAgentExamples_SourceAIAgentRunID_AgentID uniqueidentifier
    DECLARE @MJAIAgentExamples_SourceAIAgentRunID_UserID uniqueidentifier
    DECLARE @MJAIAgentExamples_SourceAIAgentRunID_CompanyID uniqueidentifier
    DECLARE @MJAIAgentExamples_SourceAIAgentRunID_Type nvarchar(20)
    DECLARE @MJAIAgentExamples_SourceAIAgentRunID_ExampleInput nvarchar(MAX)
    DECLARE @MJAIAgentExamples_SourceAIAgentRunID_ExampleOutput nvarchar(MAX)
    DECLARE @MJAIAgentExamples_SourceAIAgentRunID_IsAutoGenerated bit
    DECLARE @MJAIAgentExamples_SourceAIAgentRunID_SourceConversationID uniqueidentifier
    DECLARE @MJAIAgentExamples_SourceAIAgentRunID_SourceConversationDetailID uniqueidentifier
    DECLARE @MJAIAgentExamples_SourceAIAgentRunID_SourceAIAgentRunID uniqueidentifier
    DECLARE @MJAIAgentExamples_SourceAIAgentRunID_SuccessScore decimal(5, 2)
    DECLARE @MJAIAgentExamples_SourceAIAgentRunID_Comments nvarchar(MAX)
    DECLARE @MJAIAgentExamples_SourceAIAgentRunID_Status nvarchar(20)
    DECLARE @MJAIAgentExamples_SourceAIAgentRunID_EmbeddingVector nvarchar(MAX)
    DECLARE @MJAIAgentExamples_SourceAIAgentRunID_EmbeddingModelID uniqueidentifier
    DECLARE @MJAIAgentExamples_SourceAIAgentRunID_PrimaryScopeEntityID uniqueidentifier
    DECLARE @MJAIAgentExamples_SourceAIAgentRunID_PrimaryScopeRecordID nvarchar(100)
    DECLARE @MJAIAgentExamples_SourceAIAgentRunID_SecondaryScopes nvarchar(MAX)
    DECLARE @MJAIAgentExamples_SourceAIAgentRunID_LastAccessedAt datetimeoffset
    DECLARE @MJAIAgentExamples_SourceAIAgentRunID_AccessCount int
    DECLARE @MJAIAgentExamples_SourceAIAgentRunID_ExpiresAt datetimeoffset
    DECLARE cascade_update_MJAIAgentExamples_SourceAIAgentRunID_cursor CURSOR FOR
        SELECT [ID], [AgentID], [UserID], [CompanyID], [Type], [ExampleInput], [ExampleOutput], [IsAutoGenerated], [SourceConversationID], [SourceConversationDetailID], [SourceAIAgentRunID], [SuccessScore], [Comments], [Status], [EmbeddingVector], [EmbeddingModelID], [PrimaryScopeEntityID], [PrimaryScopeRecordID], [SecondaryScopes], [LastAccessedAt], [AccessCount], [ExpiresAt]
        FROM [${flyway:defaultSchema}].[AIAgentExample]
        WHERE [SourceAIAgentRunID] = @ID

    OPEN cascade_update_MJAIAgentExamples_SourceAIAgentRunID_cursor
    FETCH NEXT FROM cascade_update_MJAIAgentExamples_SourceAIAgentRunID_cursor INTO @MJAIAgentExamples_SourceAIAgentRunIDID, @MJAIAgentExamples_SourceAIAgentRunID_AgentID, @MJAIAgentExamples_SourceAIAgentRunID_UserID, @MJAIAgentExamples_SourceAIAgentRunID_CompanyID, @MJAIAgentExamples_SourceAIAgentRunID_Type, @MJAIAgentExamples_SourceAIAgentRunID_ExampleInput, @MJAIAgentExamples_SourceAIAgentRunID_ExampleOutput, @MJAIAgentExamples_SourceAIAgentRunID_IsAutoGenerated, @MJAIAgentExamples_SourceAIAgentRunID_SourceConversationID, @MJAIAgentExamples_SourceAIAgentRunID_SourceConversationDetailID, @MJAIAgentExamples_SourceAIAgentRunID_SourceAIAgentRunID, @MJAIAgentExamples_SourceAIAgentRunID_SuccessScore, @MJAIAgentExamples_SourceAIAgentRunID_Comments, @MJAIAgentExamples_SourceAIAgentRunID_Status, @MJAIAgentExamples_SourceAIAgentRunID_EmbeddingVector, @MJAIAgentExamples_SourceAIAgentRunID_EmbeddingModelID, @MJAIAgentExamples_SourceAIAgentRunID_PrimaryScopeEntityID, @MJAIAgentExamples_SourceAIAgentRunID_PrimaryScopeRecordID, @MJAIAgentExamples_SourceAIAgentRunID_SecondaryScopes, @MJAIAgentExamples_SourceAIAgentRunID_LastAccessedAt, @MJAIAgentExamples_SourceAIAgentRunID_AccessCount, @MJAIAgentExamples_SourceAIAgentRunID_ExpiresAt

    WHILE @@FETCH_STATUS = 0
    BEGIN
        -- Set the FK field to NULL
        SET @MJAIAgentExamples_SourceAIAgentRunID_SourceAIAgentRunID = NULL

        -- Call the update SP for the related entity
        EXEC [${flyway:defaultSchema}].[spUpdateAIAgentExample] @ID = @MJAIAgentExamples_SourceAIAgentRunIDID, @AgentID = @MJAIAgentExamples_SourceAIAgentRunID_AgentID, @UserID = @MJAIAgentExamples_SourceAIAgentRunID_UserID, @CompanyID = @MJAIAgentExamples_SourceAIAgentRunID_CompanyID, @Type = @MJAIAgentExamples_SourceAIAgentRunID_Type, @ExampleInput = @MJAIAgentExamples_SourceAIAgentRunID_ExampleInput, @ExampleOutput = @MJAIAgentExamples_SourceAIAgentRunID_ExampleOutput, @IsAutoGenerated = @MJAIAgentExamples_SourceAIAgentRunID_IsAutoGenerated, @SourceConversationID = @MJAIAgentExamples_SourceAIAgentRunID_SourceConversationID, @SourceConversationDetailID = @MJAIAgentExamples_SourceAIAgentRunID_SourceConversationDetailID, @SourceAIAgentRunID_Clear = 1, @SourceAIAgentRunID = @MJAIAgentExamples_SourceAIAgentRunID_SourceAIAgentRunID, @SuccessScore = @MJAIAgentExamples_SourceAIAgentRunID_SuccessScore, @Comments = @MJAIAgentExamples_SourceAIAgentRunID_Comments, @Status = @MJAIAgentExamples_SourceAIAgentRunID_Status, @EmbeddingVector = @MJAIAgentExamples_SourceAIAgentRunID_EmbeddingVector, @EmbeddingModelID = @MJAIAgentExamples_SourceAIAgentRunID_EmbeddingModelID, @PrimaryScopeEntityID = @MJAIAgentExamples_SourceAIAgentRunID_PrimaryScopeEntityID, @PrimaryScopeRecordID = @MJAIAgentExamples_SourceAIAgentRunID_PrimaryScopeRecordID, @SecondaryScopes = @MJAIAgentExamples_SourceAIAgentRunID_SecondaryScopes, @LastAccessedAt = @MJAIAgentExamples_SourceAIAgentRunID_LastAccessedAt, @AccessCount = @MJAIAgentExamples_SourceAIAgentRunID_AccessCount, @ExpiresAt = @MJAIAgentExamples_SourceAIAgentRunID_ExpiresAt

        FETCH NEXT FROM cascade_update_MJAIAgentExamples_SourceAIAgentRunID_cursor INTO @MJAIAgentExamples_SourceAIAgentRunIDID, @MJAIAgentExamples_SourceAIAgentRunID_AgentID, @MJAIAgentExamples_SourceAIAgentRunID_UserID, @MJAIAgentExamples_SourceAIAgentRunID_CompanyID, @MJAIAgentExamples_SourceAIAgentRunID_Type, @MJAIAgentExamples_SourceAIAgentRunID_ExampleInput, @MJAIAgentExamples_SourceAIAgentRunID_ExampleOutput, @MJAIAgentExamples_SourceAIAgentRunID_IsAutoGenerated, @MJAIAgentExamples_SourceAIAgentRunID_SourceConversationID, @MJAIAgentExamples_SourceAIAgentRunID_SourceConversationDetailID, @MJAIAgentExamples_SourceAIAgentRunID_SourceAIAgentRunID, @MJAIAgentExamples_SourceAIAgentRunID_SuccessScore, @MJAIAgentExamples_SourceAIAgentRunID_Comments, @MJAIAgentExamples_SourceAIAgentRunID_Status, @MJAIAgentExamples_SourceAIAgentRunID_EmbeddingVector, @MJAIAgentExamples_SourceAIAgentRunID_EmbeddingModelID, @MJAIAgentExamples_SourceAIAgentRunID_PrimaryScopeEntityID, @MJAIAgentExamples_SourceAIAgentRunID_PrimaryScopeRecordID, @MJAIAgentExamples_SourceAIAgentRunID_SecondaryScopes, @MJAIAgentExamples_SourceAIAgentRunID_LastAccessedAt, @MJAIAgentExamples_SourceAIAgentRunID_AccessCount, @MJAIAgentExamples_SourceAIAgentRunID_ExpiresAt
    END

    CLOSE cascade_update_MJAIAgentExamples_SourceAIAgentRunID_cursor
    DEALLOCATE cascade_update_MJAIAgentExamples_SourceAIAgentRunID_cursor
    
    -- Cascade update on AIAgentNote using cursor to call spUpdateAIAgentNote
    DECLARE @MJAIAgentNotes_SourceAIAgentRunIDID uniqueidentifier
    DECLARE @MJAIAgentNotes_SourceAIAgentRunID_AgentID uniqueidentifier
    DECLARE @MJAIAgentNotes_SourceAIAgentRunID_AgentNoteTypeID uniqueidentifier
    DECLARE @MJAIAgentNotes_SourceAIAgentRunID_Note nvarchar(MAX)
    DECLARE @MJAIAgentNotes_SourceAIAgentRunID_UserID uniqueidentifier
    DECLARE @MJAIAgentNotes_SourceAIAgentRunID_Type nvarchar(20)
    DECLARE @MJAIAgentNotes_SourceAIAgentRunID_IsAutoGenerated bit
    DECLARE @MJAIAgentNotes_SourceAIAgentRunID_Comments nvarchar(MAX)
    DECLARE @MJAIAgentNotes_SourceAIAgentRunID_Status nvarchar(20)
    DECLARE @MJAIAgentNotes_SourceAIAgentRunID_SourceConversationID uniqueidentifier
    DECLARE @MJAIAgentNotes_SourceAIAgentRunID_SourceConversationDetailID uniqueidentifier
    DECLARE @MJAIAgentNotes_SourceAIAgentRunID_SourceAIAgentRunID uniqueidentifier
    DECLARE @MJAIAgentNotes_SourceAIAgentRunID_CompanyID uniqueidentifier
    DECLARE @MJAIAgentNotes_SourceAIAgentRunID_EmbeddingVector nvarchar(MAX)
    DECLARE @MJAIAgentNotes_SourceAIAgentRunID_EmbeddingModelID uniqueidentifier
    DECLARE @MJAIAgentNotes_SourceAIAgentRunID_PrimaryScopeEntityID uniqueidentifier
    DECLARE @MJAIAgentNotes_SourceAIAgentRunID_PrimaryScopeRecordID nvarchar(100)
    DECLARE @MJAIAgentNotes_SourceAIAgentRunID_SecondaryScopes nvarchar(MAX)
    DECLARE @MJAIAgentNotes_SourceAIAgentRunID_LastAccessedAt datetimeoffset
    DECLARE @MJAIAgentNotes_SourceAIAgentRunID_AccessCount int
    DECLARE @MJAIAgentNotes_SourceAIAgentRunID_ExpiresAt datetimeoffset
    DECLARE @MJAIAgentNotes_SourceAIAgentRunID_ConsolidatedIntoNoteID uniqueidentifier
    DECLARE @MJAIAgentNotes_SourceAIAgentRunID_ConsolidationCount int
    DECLARE @MJAIAgentNotes_SourceAIAgentRunID_DerivedFromNoteIDs nvarchar(MAX)
    DECLARE @MJAIAgentNotes_SourceAIAgentRunID_ProtectionTier nvarchar(20)
    DECLARE @MJAIAgentNotes_SourceAIAgentRunID_ImportanceScore decimal(5, 2)
    DECLARE @MJAIAgentNotes_SourceAIAgentRunID_AuthorType nvarchar(20)
    DECLARE cascade_update_MJAIAgentNotes_SourceAIAgentRunID_cursor CURSOR FOR
        SELECT [ID], [AgentID], [AgentNoteTypeID], [Note], [UserID], [Type], [IsAutoGenerated], [Comments], [Status], [SourceConversationID], [SourceConversationDetailID], [SourceAIAgentRunID], [CompanyID], [EmbeddingVector], [EmbeddingModelID], [PrimaryScopeEntityID], [PrimaryScopeRecordID], [SecondaryScopes], [LastAccessedAt], [AccessCount], [ExpiresAt], [ConsolidatedIntoNoteID], [ConsolidationCount], [DerivedFromNoteIDs], [ProtectionTier], [ImportanceScore], [AuthorType]
        FROM [${flyway:defaultSchema}].[AIAgentNote]
        WHERE [SourceAIAgentRunID] = @ID

    OPEN cascade_update_MJAIAgentNotes_SourceAIAgentRunID_cursor
    FETCH NEXT FROM cascade_update_MJAIAgentNotes_SourceAIAgentRunID_cursor INTO @MJAIAgentNotes_SourceAIAgentRunIDID, @MJAIAgentNotes_SourceAIAgentRunID_AgentID, @MJAIAgentNotes_SourceAIAgentRunID_AgentNoteTypeID, @MJAIAgentNotes_SourceAIAgentRunID_Note, @MJAIAgentNotes_SourceAIAgentRunID_UserID, @MJAIAgentNotes_SourceAIAgentRunID_Type, @MJAIAgentNotes_SourceAIAgentRunID_IsAutoGenerated, @MJAIAgentNotes_SourceAIAgentRunID_Comments, @MJAIAgentNotes_SourceAIAgentRunID_Status, @MJAIAgentNotes_SourceAIAgentRunID_SourceConversationID, @MJAIAgentNotes_SourceAIAgentRunID_SourceConversationDetailID, @MJAIAgentNotes_SourceAIAgentRunID_SourceAIAgentRunID, @MJAIAgentNotes_SourceAIAgentRunID_CompanyID, @MJAIAgentNotes_SourceAIAgentRunID_EmbeddingVector, @MJAIAgentNotes_SourceAIAgentRunID_EmbeddingModelID, @MJAIAgentNotes_SourceAIAgentRunID_PrimaryScopeEntityID, @MJAIAgentNotes_SourceAIAgentRunID_PrimaryScopeRecordID, @MJAIAgentNotes_SourceAIAgentRunID_SecondaryScopes, @MJAIAgentNotes_SourceAIAgentRunID_LastAccessedAt, @MJAIAgentNotes_SourceAIAgentRunID_AccessCount, @MJAIAgentNotes_SourceAIAgentRunID_ExpiresAt, @MJAIAgentNotes_SourceAIAgentRunID_ConsolidatedIntoNoteID, @MJAIAgentNotes_SourceAIAgentRunID_ConsolidationCount, @MJAIAgentNotes_SourceAIAgentRunID_DerivedFromNoteIDs, @MJAIAgentNotes_SourceAIAgentRunID_ProtectionTier, @MJAIAgentNotes_SourceAIAgentRunID_ImportanceScore, @MJAIAgentNotes_SourceAIAgentRunID_AuthorType

    WHILE @@FETCH_STATUS = 0
    BEGIN
        -- Set the FK field to NULL
        SET @MJAIAgentNotes_SourceAIAgentRunID_SourceAIAgentRunID = NULL

        -- Call the update SP for the related entity
        EXEC [${flyway:defaultSchema}].[spUpdateAIAgentNote] @ID = @MJAIAgentNotes_SourceAIAgentRunIDID, @AgentID = @MJAIAgentNotes_SourceAIAgentRunID_AgentID, @AgentNoteTypeID = @MJAIAgentNotes_SourceAIAgentRunID_AgentNoteTypeID, @Note = @MJAIAgentNotes_SourceAIAgentRunID_Note, @UserID = @MJAIAgentNotes_SourceAIAgentRunID_UserID, @Type = @MJAIAgentNotes_SourceAIAgentRunID_Type, @IsAutoGenerated = @MJAIAgentNotes_SourceAIAgentRunID_IsAutoGenerated, @Comments = @MJAIAgentNotes_SourceAIAgentRunID_Comments, @Status = @MJAIAgentNotes_SourceAIAgentRunID_Status, @SourceConversationID = @MJAIAgentNotes_SourceAIAgentRunID_SourceConversationID, @SourceConversationDetailID = @MJAIAgentNotes_SourceAIAgentRunID_SourceConversationDetailID, @SourceAIAgentRunID_Clear = 1, @SourceAIAgentRunID = @MJAIAgentNotes_SourceAIAgentRunID_SourceAIAgentRunID, @CompanyID = @MJAIAgentNotes_SourceAIAgentRunID_CompanyID, @EmbeddingVector = @MJAIAgentNotes_SourceAIAgentRunID_EmbeddingVector, @EmbeddingModelID = @MJAIAgentNotes_SourceAIAgentRunID_EmbeddingModelID, @PrimaryScopeEntityID = @MJAIAgentNotes_SourceAIAgentRunID_PrimaryScopeEntityID, @PrimaryScopeRecordID = @MJAIAgentNotes_SourceAIAgentRunID_PrimaryScopeRecordID, @SecondaryScopes = @MJAIAgentNotes_SourceAIAgentRunID_SecondaryScopes, @LastAccessedAt = @MJAIAgentNotes_SourceAIAgentRunID_LastAccessedAt, @AccessCount = @MJAIAgentNotes_SourceAIAgentRunID_AccessCount, @ExpiresAt = @MJAIAgentNotes_SourceAIAgentRunID_ExpiresAt, @ConsolidatedIntoNoteID = @MJAIAgentNotes_SourceAIAgentRunID_ConsolidatedIntoNoteID, @ConsolidationCount = @MJAIAgentNotes_SourceAIAgentRunID_ConsolidationCount, @DerivedFromNoteIDs = @MJAIAgentNotes_SourceAIAgentRunID_DerivedFromNoteIDs, @ProtectionTier = @MJAIAgentNotes_SourceAIAgentRunID_ProtectionTier, @ImportanceScore = @MJAIAgentNotes_SourceAIAgentRunID_ImportanceScore, @AuthorType = @MJAIAgentNotes_SourceAIAgentRunID_AuthorType

        FETCH NEXT FROM cascade_update_MJAIAgentNotes_SourceAIAgentRunID_cursor INTO @MJAIAgentNotes_SourceAIAgentRunIDID, @MJAIAgentNotes_SourceAIAgentRunID_AgentID, @MJAIAgentNotes_SourceAIAgentRunID_AgentNoteTypeID, @MJAIAgentNotes_SourceAIAgentRunID_Note, @MJAIAgentNotes_SourceAIAgentRunID_UserID, @MJAIAgentNotes_SourceAIAgentRunID_Type, @MJAIAgentNotes_SourceAIAgentRunID_IsAutoGenerated, @MJAIAgentNotes_SourceAIAgentRunID_Comments, @MJAIAgentNotes_SourceAIAgentRunID_Status, @MJAIAgentNotes_SourceAIAgentRunID_SourceConversationID, @MJAIAgentNotes_SourceAIAgentRunID_SourceConversationDetailID, @MJAIAgentNotes_SourceAIAgentRunID_SourceAIAgentRunID, @MJAIAgentNotes_SourceAIAgentRunID_CompanyID, @MJAIAgentNotes_SourceAIAgentRunID_EmbeddingVector, @MJAIAgentNotes_SourceAIAgentRunID_EmbeddingModelID, @MJAIAgentNotes_SourceAIAgentRunID_PrimaryScopeEntityID, @MJAIAgentNotes_SourceAIAgentRunID_PrimaryScopeRecordID, @MJAIAgentNotes_SourceAIAgentRunID_SecondaryScopes, @MJAIAgentNotes_SourceAIAgentRunID_LastAccessedAt, @MJAIAgentNotes_SourceAIAgentRunID_AccessCount, @MJAIAgentNotes_SourceAIAgentRunID_ExpiresAt, @MJAIAgentNotes_SourceAIAgentRunID_ConsolidatedIntoNoteID, @MJAIAgentNotes_SourceAIAgentRunID_ConsolidationCount, @MJAIAgentNotes_SourceAIAgentRunID_DerivedFromNoteIDs, @MJAIAgentNotes_SourceAIAgentRunID_ProtectionTier, @MJAIAgentNotes_SourceAIAgentRunID_ImportanceScore, @MJAIAgentNotes_SourceAIAgentRunID_AuthorType
    END

    CLOSE cascade_update_MJAIAgentNotes_SourceAIAgentRunID_cursor
    DEALLOCATE cascade_update_MJAIAgentNotes_SourceAIAgentRunID_cursor
    
    -- Cascade update on AIAgentRequest using cursor to call spUpdateAIAgentRequest
    DECLARE @MJAIAgentRequests_OriginatingAgentRunIDID uniqueidentifier
    DECLARE @MJAIAgentRequests_OriginatingAgentRunID_AgentID uniqueidentifier
    DECLARE @MJAIAgentRequests_OriginatingAgentRunID_RequestedAt datetimeoffset
    DECLARE @MJAIAgentRequests_OriginatingAgentRunID_RequestForUserID uniqueidentifier
    DECLARE @MJAIAgentRequests_OriginatingAgentRunID_Status nvarchar(20)
    DECLARE @MJAIAgentRequests_OriginatingAgentRunID_Request nvarchar(MAX)
    DECLARE @MJAIAgentRequests_OriginatingAgentRunID_Response nvarchar(MAX)
    DECLARE @MJAIAgentRequests_OriginatingAgentRunID_ResponseByUserID uniqueidentifier
    DECLARE @MJAIAgentRequests_OriginatingAgentRunID_RespondedAt datetimeoffset
    DECLARE @MJAIAgentRequests_OriginatingAgentRunID_Comments nvarchar(MAX)
    DECLARE @MJAIAgentRequests_OriginatingAgentRunID_RequestTypeID uniqueidentifier
    DECLARE @MJAIAgentRequests_OriginatingAgentRunID_ResponseSchema nvarchar(MAX)
    DECLARE @MJAIAgentRequests_OriginatingAgentRunID_ResponseData nvarchar(MAX)
    DECLARE @MJAIAgentRequests_OriginatingAgentRunID_Priority int
    DECLARE @MJAIAgentRequests_OriginatingAgentRunID_ExpiresAt datetimeoffset
    DECLARE @MJAIAgentRequests_OriginatingAgentRunID_OriginatingAgentRunID uniqueidentifier
    DECLARE @MJAIAgentRequests_OriginatingAgentRunID_OriginatingAgentRunStepID uniqueidentifier
    DECLARE @MJAIAgentRequests_OriginatingAgentRunID_ResumingAgentRunID uniqueidentifier
    DECLARE @MJAIAgentRequests_OriginatingAgentRunID_ResponseSource nvarchar(20)
    DECLARE cascade_update_MJAIAgentRequests_OriginatingAgentRunID_cursor CURSOR FOR
        SELECT [ID], [AgentID], [RequestedAt], [RequestForUserID], [Status], [Request], [Response], [ResponseByUserID], [RespondedAt], [Comments], [RequestTypeID], [ResponseSchema], [ResponseData], [Priority], [ExpiresAt], [OriginatingAgentRunID], [OriginatingAgentRunStepID], [ResumingAgentRunID], [ResponseSource]
        FROM [${flyway:defaultSchema}].[AIAgentRequest]
        WHERE [OriginatingAgentRunID] = @ID

    OPEN cascade_update_MJAIAgentRequests_OriginatingAgentRunID_cursor
    FETCH NEXT FROM cascade_update_MJAIAgentRequests_OriginatingAgentRunID_cursor INTO @MJAIAgentRequests_OriginatingAgentRunIDID, @MJAIAgentRequests_OriginatingAgentRunID_AgentID, @MJAIAgentRequests_OriginatingAgentRunID_RequestedAt, @MJAIAgentRequests_OriginatingAgentRunID_RequestForUserID, @MJAIAgentRequests_OriginatingAgentRunID_Status, @MJAIAgentRequests_OriginatingAgentRunID_Request, @MJAIAgentRequests_OriginatingAgentRunID_Response, @MJAIAgentRequests_OriginatingAgentRunID_ResponseByUserID, @MJAIAgentRequests_OriginatingAgentRunID_RespondedAt, @MJAIAgentRequests_OriginatingAgentRunID_Comments, @MJAIAgentRequests_OriginatingAgentRunID_RequestTypeID, @MJAIAgentRequests_OriginatingAgentRunID_ResponseSchema, @MJAIAgentRequests_OriginatingAgentRunID_ResponseData, @MJAIAgentRequests_OriginatingAgentRunID_Priority, @MJAIAgentRequests_OriginatingAgentRunID_ExpiresAt, @MJAIAgentRequests_OriginatingAgentRunID_OriginatingAgentRunID, @MJAIAgentRequests_OriginatingAgentRunID_OriginatingAgentRunStepID, @MJAIAgentRequests_OriginatingAgentRunID_ResumingAgentRunID, @MJAIAgentRequests_OriginatingAgentRunID_ResponseSource

    WHILE @@FETCH_STATUS = 0
    BEGIN
        -- Set the FK field to NULL
        SET @MJAIAgentRequests_OriginatingAgentRunID_OriginatingAgentRunID = NULL

        -- Call the update SP for the related entity
        EXEC [${flyway:defaultSchema}].[spUpdateAIAgentRequest] @ID = @MJAIAgentRequests_OriginatingAgentRunIDID, @AgentID = @MJAIAgentRequests_OriginatingAgentRunID_AgentID, @RequestedAt = @MJAIAgentRequests_OriginatingAgentRunID_RequestedAt, @RequestForUserID = @MJAIAgentRequests_OriginatingAgentRunID_RequestForUserID, @Status = @MJAIAgentRequests_OriginatingAgentRunID_Status, @Request = @MJAIAgentRequests_OriginatingAgentRunID_Request, @Response = @MJAIAgentRequests_OriginatingAgentRunID_Response, @ResponseByUserID = @MJAIAgentRequests_OriginatingAgentRunID_ResponseByUserID, @RespondedAt = @MJAIAgentRequests_OriginatingAgentRunID_RespondedAt, @Comments = @MJAIAgentRequests_OriginatingAgentRunID_Comments, @RequestTypeID = @MJAIAgentRequests_OriginatingAgentRunID_RequestTypeID, @ResponseSchema = @MJAIAgentRequests_OriginatingAgentRunID_ResponseSchema, @ResponseData = @MJAIAgentRequests_OriginatingAgentRunID_ResponseData, @Priority = @MJAIAgentRequests_OriginatingAgentRunID_Priority, @ExpiresAt = @MJAIAgentRequests_OriginatingAgentRunID_ExpiresAt, @OriginatingAgentRunID_Clear = 1, @OriginatingAgentRunID = @MJAIAgentRequests_OriginatingAgentRunID_OriginatingAgentRunID, @OriginatingAgentRunStepID = @MJAIAgentRequests_OriginatingAgentRunID_OriginatingAgentRunStepID, @ResumingAgentRunID = @MJAIAgentRequests_OriginatingAgentRunID_ResumingAgentRunID, @ResponseSource = @MJAIAgentRequests_OriginatingAgentRunID_ResponseSource

        FETCH NEXT FROM cascade_update_MJAIAgentRequests_OriginatingAgentRunID_cursor INTO @MJAIAgentRequests_OriginatingAgentRunIDID, @MJAIAgentRequests_OriginatingAgentRunID_AgentID, @MJAIAgentRequests_OriginatingAgentRunID_RequestedAt, @MJAIAgentRequests_OriginatingAgentRunID_RequestForUserID, @MJAIAgentRequests_OriginatingAgentRunID_Status, @MJAIAgentRequests_OriginatingAgentRunID_Request, @MJAIAgentRequests_OriginatingAgentRunID_Response, @MJAIAgentRequests_OriginatingAgentRunID_ResponseByUserID, @MJAIAgentRequests_OriginatingAgentRunID_RespondedAt, @MJAIAgentRequests_OriginatingAgentRunID_Comments, @MJAIAgentRequests_OriginatingAgentRunID_RequestTypeID, @MJAIAgentRequests_OriginatingAgentRunID_ResponseSchema, @MJAIAgentRequests_OriginatingAgentRunID_ResponseData, @MJAIAgentRequests_OriginatingAgentRunID_Priority, @MJAIAgentRequests_OriginatingAgentRunID_ExpiresAt, @MJAIAgentRequests_OriginatingAgentRunID_OriginatingAgentRunID, @MJAIAgentRequests_OriginatingAgentRunID_OriginatingAgentRunStepID, @MJAIAgentRequests_OriginatingAgentRunID_ResumingAgentRunID, @MJAIAgentRequests_OriginatingAgentRunID_ResponseSource
    END

    CLOSE cascade_update_MJAIAgentRequests_OriginatingAgentRunID_cursor
    DEALLOCATE cascade_update_MJAIAgentRequests_OriginatingAgentRunID_cursor
    
    -- Cascade update on AIAgentRequest using cursor to call spUpdateAIAgentRequest
    DECLARE @MJAIAgentRequests_ResumingAgentRunIDID uniqueidentifier
    DECLARE @MJAIAgentRequests_ResumingAgentRunID_AgentID uniqueidentifier
    DECLARE @MJAIAgentRequests_ResumingAgentRunID_RequestedAt datetimeoffset
    DECLARE @MJAIAgentRequests_ResumingAgentRunID_RequestForUserID uniqueidentifier
    DECLARE @MJAIAgentRequests_ResumingAgentRunID_Status nvarchar(20)
    DECLARE @MJAIAgentRequests_ResumingAgentRunID_Request nvarchar(MAX)
    DECLARE @MJAIAgentRequests_ResumingAgentRunID_Response nvarchar(MAX)
    DECLARE @MJAIAgentRequests_ResumingAgentRunID_ResponseByUserID uniqueidentifier
    DECLARE @MJAIAgentRequests_ResumingAgentRunID_RespondedAt datetimeoffset
    DECLARE @MJAIAgentRequests_ResumingAgentRunID_Comments nvarchar(MAX)
    DECLARE @MJAIAgentRequests_ResumingAgentRunID_RequestTypeID uniqueidentifier
    DECLARE @MJAIAgentRequests_ResumingAgentRunID_ResponseSchema nvarchar(MAX)
    DECLARE @MJAIAgentRequests_ResumingAgentRunID_ResponseData nvarchar(MAX)
    DECLARE @MJAIAgentRequests_ResumingAgentRunID_Priority int
    DECLARE @MJAIAgentRequests_ResumingAgentRunID_ExpiresAt datetimeoffset
    DECLARE @MJAIAgentRequests_ResumingAgentRunID_OriginatingAgentRunID uniqueidentifier
    DECLARE @MJAIAgentRequests_ResumingAgentRunID_OriginatingAgentRunStepID uniqueidentifier
    DECLARE @MJAIAgentRequests_ResumingAgentRunID_ResumingAgentRunID uniqueidentifier
    DECLARE @MJAIAgentRequests_ResumingAgentRunID_ResponseSource nvarchar(20)
    DECLARE cascade_update_MJAIAgentRequests_ResumingAgentRunID_cursor CURSOR FOR
        SELECT [ID], [AgentID], [RequestedAt], [RequestForUserID], [Status], [Request], [Response], [ResponseByUserID], [RespondedAt], [Comments], [RequestTypeID], [ResponseSchema], [ResponseData], [Priority], [ExpiresAt], [OriginatingAgentRunID], [OriginatingAgentRunStepID], [ResumingAgentRunID], [ResponseSource]
        FROM [${flyway:defaultSchema}].[AIAgentRequest]
        WHERE [ResumingAgentRunID] = @ID

    OPEN cascade_update_MJAIAgentRequests_ResumingAgentRunID_cursor
    FETCH NEXT FROM cascade_update_MJAIAgentRequests_ResumingAgentRunID_cursor INTO @MJAIAgentRequests_ResumingAgentRunIDID, @MJAIAgentRequests_ResumingAgentRunID_AgentID, @MJAIAgentRequests_ResumingAgentRunID_RequestedAt, @MJAIAgentRequests_ResumingAgentRunID_RequestForUserID, @MJAIAgentRequests_ResumingAgentRunID_Status, @MJAIAgentRequests_ResumingAgentRunID_Request, @MJAIAgentRequests_ResumingAgentRunID_Response, @MJAIAgentRequests_ResumingAgentRunID_ResponseByUserID, @MJAIAgentRequests_ResumingAgentRunID_RespondedAt, @MJAIAgentRequests_ResumingAgentRunID_Comments, @MJAIAgentRequests_ResumingAgentRunID_RequestTypeID, @MJAIAgentRequests_ResumingAgentRunID_ResponseSchema, @MJAIAgentRequests_ResumingAgentRunID_ResponseData, @MJAIAgentRequests_ResumingAgentRunID_Priority, @MJAIAgentRequests_ResumingAgentRunID_ExpiresAt, @MJAIAgentRequests_ResumingAgentRunID_OriginatingAgentRunID, @MJAIAgentRequests_ResumingAgentRunID_OriginatingAgentRunStepID, @MJAIAgentRequests_ResumingAgentRunID_ResumingAgentRunID, @MJAIAgentRequests_ResumingAgentRunID_ResponseSource

    WHILE @@FETCH_STATUS = 0
    BEGIN
        -- Set the FK field to NULL
        SET @MJAIAgentRequests_ResumingAgentRunID_ResumingAgentRunID = NULL

        -- Call the update SP for the related entity
        EXEC [${flyway:defaultSchema}].[spUpdateAIAgentRequest] @ID = @MJAIAgentRequests_ResumingAgentRunIDID, @AgentID = @MJAIAgentRequests_ResumingAgentRunID_AgentID, @RequestedAt = @MJAIAgentRequests_ResumingAgentRunID_RequestedAt, @RequestForUserID = @MJAIAgentRequests_ResumingAgentRunID_RequestForUserID, @Status = @MJAIAgentRequests_ResumingAgentRunID_Status, @Request = @MJAIAgentRequests_ResumingAgentRunID_Request, @Response = @MJAIAgentRequests_ResumingAgentRunID_Response, @ResponseByUserID = @MJAIAgentRequests_ResumingAgentRunID_ResponseByUserID, @RespondedAt = @MJAIAgentRequests_ResumingAgentRunID_RespondedAt, @Comments = @MJAIAgentRequests_ResumingAgentRunID_Comments, @RequestTypeID = @MJAIAgentRequests_ResumingAgentRunID_RequestTypeID, @ResponseSchema = @MJAIAgentRequests_ResumingAgentRunID_ResponseSchema, @ResponseData = @MJAIAgentRequests_ResumingAgentRunID_ResponseData, @Priority = @MJAIAgentRequests_ResumingAgentRunID_Priority, @ExpiresAt = @MJAIAgentRequests_ResumingAgentRunID_ExpiresAt, @OriginatingAgentRunID = @MJAIAgentRequests_ResumingAgentRunID_OriginatingAgentRunID, @OriginatingAgentRunStepID = @MJAIAgentRequests_ResumingAgentRunID_OriginatingAgentRunStepID, @ResumingAgentRunID_Clear = 1, @ResumingAgentRunID = @MJAIAgentRequests_ResumingAgentRunID_ResumingAgentRunID, @ResponseSource = @MJAIAgentRequests_ResumingAgentRunID_ResponseSource

        FETCH NEXT FROM cascade_update_MJAIAgentRequests_ResumingAgentRunID_cursor INTO @MJAIAgentRequests_ResumingAgentRunIDID, @MJAIAgentRequests_ResumingAgentRunID_AgentID, @MJAIAgentRequests_ResumingAgentRunID_RequestedAt, @MJAIAgentRequests_ResumingAgentRunID_RequestForUserID, @MJAIAgentRequests_ResumingAgentRunID_Status, @MJAIAgentRequests_ResumingAgentRunID_Request, @MJAIAgentRequests_ResumingAgentRunID_Response, @MJAIAgentRequests_ResumingAgentRunID_ResponseByUserID, @MJAIAgentRequests_ResumingAgentRunID_RespondedAt, @MJAIAgentRequests_ResumingAgentRunID_Comments, @MJAIAgentRequests_ResumingAgentRunID_RequestTypeID, @MJAIAgentRequests_ResumingAgentRunID_ResponseSchema, @MJAIAgentRequests_ResumingAgentRunID_ResponseData, @MJAIAgentRequests_ResumingAgentRunID_Priority, @MJAIAgentRequests_ResumingAgentRunID_ExpiresAt, @MJAIAgentRequests_ResumingAgentRunID_OriginatingAgentRunID, @MJAIAgentRequests_ResumingAgentRunID_OriginatingAgentRunStepID, @MJAIAgentRequests_ResumingAgentRunID_ResumingAgentRunID, @MJAIAgentRequests_ResumingAgentRunID_ResponseSource
    END

    CLOSE cascade_update_MJAIAgentRequests_ResumingAgentRunID_cursor
    DEALLOCATE cascade_update_MJAIAgentRequests_ResumingAgentRunID_cursor
    
    -- Cascade delete from AIAgentRunMedia using cursor to call spDeleteAIAgentRunMedia
    DECLARE @MJAIAgentRunMedias_AgentRunIDID uniqueidentifier
    DECLARE cascade_delete_MJAIAgentRunMedias_AgentRunID_cursor CURSOR FOR 
        SELECT [ID]
        FROM [${flyway:defaultSchema}].[AIAgentRunMedia]
        WHERE [AgentRunID] = @ID
    
    OPEN cascade_delete_MJAIAgentRunMedias_AgentRunID_cursor
    FETCH NEXT FROM cascade_delete_MJAIAgentRunMedias_AgentRunID_cursor INTO @MJAIAgentRunMedias_AgentRunIDID
    
    WHILE @@FETCH_STATUS = 0
    BEGIN
        EXEC [${flyway:defaultSchema}].[spDeleteAIAgentRunMedia] @ID = @MJAIAgentRunMedias_AgentRunIDID
        
        FETCH NEXT FROM cascade_delete_MJAIAgentRunMedias_AgentRunID_cursor INTO @MJAIAgentRunMedias_AgentRunIDID
    END
    
    CLOSE cascade_delete_MJAIAgentRunMedias_AgentRunID_cursor
    DEALLOCATE cascade_delete_MJAIAgentRunMedias_AgentRunID_cursor
    
    -- Cascade delete from AIAgentRunStep using cursor to call spDeleteAIAgentRunStep
    DECLARE @MJAIAgentRunSteps_AgentRunIDID uniqueidentifier
    DECLARE cascade_delete_MJAIAgentRunSteps_AgentRunID_cursor CURSOR FOR 
        SELECT [ID]
        FROM [${flyway:defaultSchema}].[AIAgentRunStep]
        WHERE [AgentRunID] = @ID
    
    OPEN cascade_delete_MJAIAgentRunSteps_AgentRunID_cursor
    FETCH NEXT FROM cascade_delete_MJAIAgentRunSteps_AgentRunID_cursor INTO @MJAIAgentRunSteps_AgentRunIDID
    
    WHILE @@FETCH_STATUS = 0
    BEGIN
        EXEC [${flyway:defaultSchema}].[spDeleteAIAgentRunStep] @ID = @MJAIAgentRunSteps_AgentRunIDID
        
        FETCH NEXT FROM cascade_delete_MJAIAgentRunSteps_AgentRunID_cursor INTO @MJAIAgentRunSteps_AgentRunIDID
    END
    
    CLOSE cascade_delete_MJAIAgentRunSteps_AgentRunID_cursor
    DEALLOCATE cascade_delete_MJAIAgentRunSteps_AgentRunID_cursor
    
    -- Cascade update on AIAgentRun using cursor to call spUpdateAIAgentRun
    DECLARE @MJAIAgentRuns_ParentRunIDID uniqueidentifier
    DECLARE @MJAIAgentRuns_ParentRunID_AgentID uniqueidentifier
    DECLARE @MJAIAgentRuns_ParentRunID_ParentRunID uniqueidentifier
    DECLARE @MJAIAgentRuns_ParentRunID_Status nvarchar(50)
    DECLARE @MJAIAgentRuns_ParentRunID_StartedAt datetimeoffset
    DECLARE @MJAIAgentRuns_ParentRunID_CompletedAt datetimeoffset
    DECLARE @MJAIAgentRuns_ParentRunID_Success bit
    DECLARE @MJAIAgentRuns_ParentRunID_ErrorMessage nvarchar(MAX)
    DECLARE @MJAIAgentRuns_ParentRunID_ConversationID uniqueidentifier
    DECLARE @MJAIAgentRuns_ParentRunID_UserID uniqueidentifier
    DECLARE @MJAIAgentRuns_ParentRunID_Result nvarchar(MAX)
    DECLARE @MJAIAgentRuns_ParentRunID_AgentState nvarchar(MAX)
    DECLARE @MJAIAgentRuns_ParentRunID_TotalTokensUsed int
    DECLARE @MJAIAgentRuns_ParentRunID_TotalCost decimal(18, 6)
    DECLARE @MJAIAgentRuns_ParentRunID_TotalPromptTokensUsed int
    DECLARE @MJAIAgentRuns_ParentRunID_TotalCompletionTokensUsed int
    DECLARE @MJAIAgentRuns_ParentRunID_TotalTokensUsedRollup int
    DECLARE @MJAIAgentRuns_ParentRunID_TotalPromptTokensUsedRollup int
    DECLARE @MJAIAgentRuns_ParentRunID_TotalCompletionTokensUsedRollup int
    DECLARE @MJAIAgentRuns_ParentRunID_TotalCostRollup decimal(19, 8)
    DECLARE @MJAIAgentRuns_ParentRunID_ConversationDetailID uniqueidentifier
    DECLARE @MJAIAgentRuns_ParentRunID_ConversationDetailSequence int
    DECLARE @MJAIAgentRuns_ParentRunID_CancellationReason nvarchar(30)
    DECLARE @MJAIAgentRuns_ParentRunID_FinalStep nvarchar(30)
    DECLARE @MJAIAgentRuns_ParentRunID_FinalPayload nvarchar(MAX)
    DECLARE @MJAIAgentRuns_ParentRunID_Message nvarchar(MAX)
    DECLARE @MJAIAgentRuns_ParentRunID_LastRunID uniqueidentifier
    DECLARE @MJAIAgentRuns_ParentRunID_StartingPayload nvarchar(MAX)
    DECLARE @MJAIAgentRuns_ParentRunID_TotalPromptIterations int
    DECLARE @MJAIAgentRuns_ParentRunID_ConfigurationID uniqueidentifier
    DECLARE @MJAIAgentRuns_ParentRunID_OverrideModelID uniqueidentifier
    DECLARE @MJAIAgentRuns_ParentRunID_OverrideVendorID uniqueidentifier
    DECLARE @MJAIAgentRuns_ParentRunID_Data nvarchar(MAX)
    DECLARE @MJAIAgentRuns_ParentRunID_Verbose bit
    DECLARE @MJAIAgentRuns_ParentRunID_EffortLevel int
    DECLARE @MJAIAgentRuns_ParentRunID_RunName nvarchar(255)
    DECLARE @MJAIAgentRuns_ParentRunID_Comments nvarchar(MAX)
    DECLARE @MJAIAgentRuns_ParentRunID_ScheduledJobRunID uniqueidentifier
    DECLARE @MJAIAgentRuns_ParentRunID_TestRunID uniqueidentifier
    DECLARE @MJAIAgentRuns_ParentRunID_PrimaryScopeEntityID uniqueidentifier
    DECLARE @MJAIAgentRuns_ParentRunID_PrimaryScopeRecordID nvarchar(100)
    DECLARE @MJAIAgentRuns_ParentRunID_SecondaryScopes nvarchar(MAX)
    DECLARE @MJAIAgentRuns_ParentRunID_ExternalReferenceID nvarchar(200)
    DECLARE @MJAIAgentRuns_ParentRunID_CompanyID uniqueidentifier
    DECLARE @MJAIAgentRuns_ParentRunID_TotalCacheReadTokensUsed int
    DECLARE @MJAIAgentRuns_ParentRunID_TotalCacheWriteTokensUsed int
    DECLARE @MJAIAgentRuns_ParentRunID_LastHeartbeatAt datetimeoffset
    DECLARE @MJAIAgentRuns_ParentRunID_AgentSessionID uniqueidentifier
    DECLARE @MJAIAgentRuns_ParentRunID_PlanMode bit
    DECLARE @MJAIAgentRuns_ParentRunID_ExternalSessionID nvarchar(255)
    DECLARE @MJAIAgentRuns_ParentRunID_ContinuationDepth int
    DECLARE cascade_update_MJAIAgentRuns_ParentRunID_cursor CURSOR FOR
        SELECT [ID], [AgentID], [ParentRunID], [Status], [StartedAt], [CompletedAt], [Success], [ErrorMessage], [ConversationID], [UserID], [Result], [AgentState], [TotalTokensUsed], [TotalCost], [TotalPromptTokensUsed], [TotalCompletionTokensUsed], [TotalTokensUsedRollup], [TotalPromptTokensUsedRollup], [TotalCompletionTokensUsedRollup], [TotalCostRollup], [ConversationDetailID], [ConversationDetailSequence], [CancellationReason], [FinalStep], [FinalPayload], [Message], [LastRunID], [StartingPayload], [TotalPromptIterations], [ConfigurationID], [OverrideModelID], [OverrideVendorID], [Data], [Verbose], [EffortLevel], [RunName], [Comments], [ScheduledJobRunID], [TestRunID], [PrimaryScopeEntityID], [PrimaryScopeRecordID], [SecondaryScopes], [ExternalReferenceID], [CompanyID], [TotalCacheReadTokensUsed], [TotalCacheWriteTokensUsed], [LastHeartbeatAt], [AgentSessionID], [PlanMode], [ExternalSessionID], [ContinuationDepth]
        FROM [${flyway:defaultSchema}].[AIAgentRun]
        WHERE [ParentRunID] = @ID

    OPEN cascade_update_MJAIAgentRuns_ParentRunID_cursor
    FETCH NEXT FROM cascade_update_MJAIAgentRuns_ParentRunID_cursor INTO @MJAIAgentRuns_ParentRunIDID, @MJAIAgentRuns_ParentRunID_AgentID, @MJAIAgentRuns_ParentRunID_ParentRunID, @MJAIAgentRuns_ParentRunID_Status, @MJAIAgentRuns_ParentRunID_StartedAt, @MJAIAgentRuns_ParentRunID_CompletedAt, @MJAIAgentRuns_ParentRunID_Success, @MJAIAgentRuns_ParentRunID_ErrorMessage, @MJAIAgentRuns_ParentRunID_ConversationID, @MJAIAgentRuns_ParentRunID_UserID, @MJAIAgentRuns_ParentRunID_Result, @MJAIAgentRuns_ParentRunID_AgentState, @MJAIAgentRuns_ParentRunID_TotalTokensUsed, @MJAIAgentRuns_ParentRunID_TotalCost, @MJAIAgentRuns_ParentRunID_TotalPromptTokensUsed, @MJAIAgentRuns_ParentRunID_TotalCompletionTokensUsed, @MJAIAgentRuns_ParentRunID_TotalTokensUsedRollup, @MJAIAgentRuns_ParentRunID_TotalPromptTokensUsedRollup, @MJAIAgentRuns_ParentRunID_TotalCompletionTokensUsedRollup, @MJAIAgentRuns_ParentRunID_TotalCostRollup, @MJAIAgentRuns_ParentRunID_ConversationDetailID, @MJAIAgentRuns_ParentRunID_ConversationDetailSequence, @MJAIAgentRuns_ParentRunID_CancellationReason, @MJAIAgentRuns_ParentRunID_FinalStep, @MJAIAgentRuns_ParentRunID_FinalPayload, @MJAIAgentRuns_ParentRunID_Message, @MJAIAgentRuns_ParentRunID_LastRunID, @MJAIAgentRuns_ParentRunID_StartingPayload, @MJAIAgentRuns_ParentRunID_TotalPromptIterations, @MJAIAgentRuns_ParentRunID_ConfigurationID, @MJAIAgentRuns_ParentRunID_OverrideModelID, @MJAIAgentRuns_ParentRunID_OverrideVendorID, @MJAIAgentRuns_ParentRunID_Data, @MJAIAgentRuns_ParentRunID_Verbose, @MJAIAgentRuns_ParentRunID_EffortLevel, @MJAIAgentRuns_ParentRunID_RunName, @MJAIAgentRuns_ParentRunID_Comments, @MJAIAgentRuns_ParentRunID_ScheduledJobRunID, @MJAIAgentRuns_ParentRunID_TestRunID, @MJAIAgentRuns_ParentRunID_PrimaryScopeEntityID, @MJAIAgentRuns_ParentRunID_PrimaryScopeRecordID, @MJAIAgentRuns_ParentRunID_SecondaryScopes, @MJAIAgentRuns_ParentRunID_ExternalReferenceID, @MJAIAgentRuns_ParentRunID_CompanyID, @MJAIAgentRuns_ParentRunID_TotalCacheReadTokensUsed, @MJAIAgentRuns_ParentRunID_TotalCacheWriteTokensUsed, @MJAIAgentRuns_ParentRunID_LastHeartbeatAt, @MJAIAgentRuns_ParentRunID_AgentSessionID, @MJAIAgentRuns_ParentRunID_PlanMode, @MJAIAgentRuns_ParentRunID_ExternalSessionID, @MJAIAgentRuns_ParentRunID_ContinuationDepth

    WHILE @@FETCH_STATUS = 0
    BEGIN
        -- Set the FK field to NULL
        SET @MJAIAgentRuns_ParentRunID_ParentRunID = NULL

        -- Call the update SP for the related entity
        EXEC [${flyway:defaultSchema}].[spUpdateAIAgentRun] @ID = @MJAIAgentRuns_ParentRunIDID, @AgentID = @MJAIAgentRuns_ParentRunID_AgentID, @ParentRunID_Clear = 1, @ParentRunID = @MJAIAgentRuns_ParentRunID_ParentRunID, @Status = @MJAIAgentRuns_ParentRunID_Status, @StartedAt = @MJAIAgentRuns_ParentRunID_StartedAt, @CompletedAt = @MJAIAgentRuns_ParentRunID_CompletedAt, @Success = @MJAIAgentRuns_ParentRunID_Success, @ErrorMessage = @MJAIAgentRuns_ParentRunID_ErrorMessage, @ConversationID = @MJAIAgentRuns_ParentRunID_ConversationID, @UserID = @MJAIAgentRuns_ParentRunID_UserID, @Result = @MJAIAgentRuns_ParentRunID_Result, @AgentState = @MJAIAgentRuns_ParentRunID_AgentState, @TotalTokensUsed = @MJAIAgentRuns_ParentRunID_TotalTokensUsed, @TotalCost = @MJAIAgentRuns_ParentRunID_TotalCost, @TotalPromptTokensUsed = @MJAIAgentRuns_ParentRunID_TotalPromptTokensUsed, @TotalCompletionTokensUsed = @MJAIAgentRuns_ParentRunID_TotalCompletionTokensUsed, @TotalTokensUsedRollup = @MJAIAgentRuns_ParentRunID_TotalTokensUsedRollup, @TotalPromptTokensUsedRollup = @MJAIAgentRuns_ParentRunID_TotalPromptTokensUsedRollup, @TotalCompletionTokensUsedRollup = @MJAIAgentRuns_ParentRunID_TotalCompletionTokensUsedRollup, @TotalCostRollup = @MJAIAgentRuns_ParentRunID_TotalCostRollup, @ConversationDetailID = @MJAIAgentRuns_ParentRunID_ConversationDetailID, @ConversationDetailSequence = @MJAIAgentRuns_ParentRunID_ConversationDetailSequence, @CancellationReason = @MJAIAgentRuns_ParentRunID_CancellationReason, @FinalStep = @MJAIAgentRuns_ParentRunID_FinalStep, @FinalPayload = @MJAIAgentRuns_ParentRunID_FinalPayload, @Message = @MJAIAgentRuns_ParentRunID_Message, @LastRunID = @MJAIAgentRuns_ParentRunID_LastRunID, @StartingPayload = @MJAIAgentRuns_ParentRunID_StartingPayload, @TotalPromptIterations = @MJAIAgentRuns_ParentRunID_TotalPromptIterations, @ConfigurationID = @MJAIAgentRuns_ParentRunID_ConfigurationID, @OverrideModelID = @MJAIAgentRuns_ParentRunID_OverrideModelID, @OverrideVendorID = @MJAIAgentRuns_ParentRunID_OverrideVendorID, @Data = @MJAIAgentRuns_ParentRunID_Data, @Verbose = @MJAIAgentRuns_ParentRunID_Verbose, @EffortLevel = @MJAIAgentRuns_ParentRunID_EffortLevel, @RunName = @MJAIAgentRuns_ParentRunID_RunName, @Comments = @MJAIAgentRuns_ParentRunID_Comments, @ScheduledJobRunID = @MJAIAgentRuns_ParentRunID_ScheduledJobRunID, @TestRunID = @MJAIAgentRuns_ParentRunID_TestRunID, @PrimaryScopeEntityID = @MJAIAgentRuns_ParentRunID_PrimaryScopeEntityID, @PrimaryScopeRecordID = @MJAIAgentRuns_ParentRunID_PrimaryScopeRecordID, @SecondaryScopes = @MJAIAgentRuns_ParentRunID_SecondaryScopes, @ExternalReferenceID = @MJAIAgentRuns_ParentRunID_ExternalReferenceID, @CompanyID = @MJAIAgentRuns_ParentRunID_CompanyID, @TotalCacheReadTokensUsed = @MJAIAgentRuns_ParentRunID_TotalCacheReadTokensUsed, @TotalCacheWriteTokensUsed = @MJAIAgentRuns_ParentRunID_TotalCacheWriteTokensUsed, @LastHeartbeatAt = @MJAIAgentRuns_ParentRunID_LastHeartbeatAt, @AgentSessionID = @MJAIAgentRuns_ParentRunID_AgentSessionID, @PlanMode = @MJAIAgentRuns_ParentRunID_PlanMode, @ExternalSessionID = @MJAIAgentRuns_ParentRunID_ExternalSessionID, @ContinuationDepth = @MJAIAgentRuns_ParentRunID_ContinuationDepth

        FETCH NEXT FROM cascade_update_MJAIAgentRuns_ParentRunID_cursor INTO @MJAIAgentRuns_ParentRunIDID, @MJAIAgentRuns_ParentRunID_AgentID, @MJAIAgentRuns_ParentRunID_ParentRunID, @MJAIAgentRuns_ParentRunID_Status, @MJAIAgentRuns_ParentRunID_StartedAt, @MJAIAgentRuns_ParentRunID_CompletedAt, @MJAIAgentRuns_ParentRunID_Success, @MJAIAgentRuns_ParentRunID_ErrorMessage, @MJAIAgentRuns_ParentRunID_ConversationID, @MJAIAgentRuns_ParentRunID_UserID, @MJAIAgentRuns_ParentRunID_Result, @MJAIAgentRuns_ParentRunID_AgentState, @MJAIAgentRuns_ParentRunID_TotalTokensUsed, @MJAIAgentRuns_ParentRunID_TotalCost, @MJAIAgentRuns_ParentRunID_TotalPromptTokensUsed, @MJAIAgentRuns_ParentRunID_TotalCompletionTokensUsed, @MJAIAgentRuns_ParentRunID_TotalTokensUsedRollup, @MJAIAgentRuns_ParentRunID_TotalPromptTokensUsedRollup, @MJAIAgentRuns_ParentRunID_TotalCompletionTokensUsedRollup, @MJAIAgentRuns_ParentRunID_TotalCostRollup, @MJAIAgentRuns_ParentRunID_ConversationDetailID, @MJAIAgentRuns_ParentRunID_ConversationDetailSequence, @MJAIAgentRuns_ParentRunID_CancellationReason, @MJAIAgentRuns_ParentRunID_FinalStep, @MJAIAgentRuns_ParentRunID_FinalPayload, @MJAIAgentRuns_ParentRunID_Message, @MJAIAgentRuns_ParentRunID_LastRunID, @MJAIAgentRuns_ParentRunID_StartingPayload, @MJAIAgentRuns_ParentRunID_TotalPromptIterations, @MJAIAgentRuns_ParentRunID_ConfigurationID, @MJAIAgentRuns_ParentRunID_OverrideModelID, @MJAIAgentRuns_ParentRunID_OverrideVendorID, @MJAIAgentRuns_ParentRunID_Data, @MJAIAgentRuns_ParentRunID_Verbose, @MJAIAgentRuns_ParentRunID_EffortLevel, @MJAIAgentRuns_ParentRunID_RunName, @MJAIAgentRuns_ParentRunID_Comments, @MJAIAgentRuns_ParentRunID_ScheduledJobRunID, @MJAIAgentRuns_ParentRunID_TestRunID, @MJAIAgentRuns_ParentRunID_PrimaryScopeEntityID, @MJAIAgentRuns_ParentRunID_PrimaryScopeRecordID, @MJAIAgentRuns_ParentRunID_SecondaryScopes, @MJAIAgentRuns_ParentRunID_ExternalReferenceID, @MJAIAgentRuns_ParentRunID_CompanyID, @MJAIAgentRuns_ParentRunID_TotalCacheReadTokensUsed, @MJAIAgentRuns_ParentRunID_TotalCacheWriteTokensUsed, @MJAIAgentRuns_ParentRunID_LastHeartbeatAt, @MJAIAgentRuns_ParentRunID_AgentSessionID, @MJAIAgentRuns_ParentRunID_PlanMode, @MJAIAgentRuns_ParentRunID_ExternalSessionID, @MJAIAgentRuns_ParentRunID_ContinuationDepth
    END

    CLOSE cascade_update_MJAIAgentRuns_ParentRunID_cursor
    DEALLOCATE cascade_update_MJAIAgentRuns_ParentRunID_cursor
    
    -- Cascade update on AIAgentRun using cursor to call spUpdateAIAgentRun
    DECLARE @MJAIAgentRuns_LastRunIDID uniqueidentifier
    DECLARE @MJAIAgentRuns_LastRunID_AgentID uniqueidentifier
    DECLARE @MJAIAgentRuns_LastRunID_ParentRunID uniqueidentifier
    DECLARE @MJAIAgentRuns_LastRunID_Status nvarchar(50)
    DECLARE @MJAIAgentRuns_LastRunID_StartedAt datetimeoffset
    DECLARE @MJAIAgentRuns_LastRunID_CompletedAt datetimeoffset
    DECLARE @MJAIAgentRuns_LastRunID_Success bit
    DECLARE @MJAIAgentRuns_LastRunID_ErrorMessage nvarchar(MAX)
    DECLARE @MJAIAgentRuns_LastRunID_ConversationID uniqueidentifier
    DECLARE @MJAIAgentRuns_LastRunID_UserID uniqueidentifier
    DECLARE @MJAIAgentRuns_LastRunID_Result nvarchar(MAX)
    DECLARE @MJAIAgentRuns_LastRunID_AgentState nvarchar(MAX)
    DECLARE @MJAIAgentRuns_LastRunID_TotalTokensUsed int
    DECLARE @MJAIAgentRuns_LastRunID_TotalCost decimal(18, 6)
    DECLARE @MJAIAgentRuns_LastRunID_TotalPromptTokensUsed int
    DECLARE @MJAIAgentRuns_LastRunID_TotalCompletionTokensUsed int
    DECLARE @MJAIAgentRuns_LastRunID_TotalTokensUsedRollup int
    DECLARE @MJAIAgentRuns_LastRunID_TotalPromptTokensUsedRollup int
    DECLARE @MJAIAgentRuns_LastRunID_TotalCompletionTokensUsedRollup int
    DECLARE @MJAIAgentRuns_LastRunID_TotalCostRollup decimal(19, 8)
    DECLARE @MJAIAgentRuns_LastRunID_ConversationDetailID uniqueidentifier
    DECLARE @MJAIAgentRuns_LastRunID_ConversationDetailSequence int
    DECLARE @MJAIAgentRuns_LastRunID_CancellationReason nvarchar(30)
    DECLARE @MJAIAgentRuns_LastRunID_FinalStep nvarchar(30)
    DECLARE @MJAIAgentRuns_LastRunID_FinalPayload nvarchar(MAX)
    DECLARE @MJAIAgentRuns_LastRunID_Message nvarchar(MAX)
    DECLARE @MJAIAgentRuns_LastRunID_LastRunID uniqueidentifier
    DECLARE @MJAIAgentRuns_LastRunID_StartingPayload nvarchar(MAX)
    DECLARE @MJAIAgentRuns_LastRunID_TotalPromptIterations int
    DECLARE @MJAIAgentRuns_LastRunID_ConfigurationID uniqueidentifier
    DECLARE @MJAIAgentRuns_LastRunID_OverrideModelID uniqueidentifier
    DECLARE @MJAIAgentRuns_LastRunID_OverrideVendorID uniqueidentifier
    DECLARE @MJAIAgentRuns_LastRunID_Data nvarchar(MAX)
    DECLARE @MJAIAgentRuns_LastRunID_Verbose bit
    DECLARE @MJAIAgentRuns_LastRunID_EffortLevel int
    DECLARE @MJAIAgentRuns_LastRunID_RunName nvarchar(255)
    DECLARE @MJAIAgentRuns_LastRunID_Comments nvarchar(MAX)
    DECLARE @MJAIAgentRuns_LastRunID_ScheduledJobRunID uniqueidentifier
    DECLARE @MJAIAgentRuns_LastRunID_TestRunID uniqueidentifier
    DECLARE @MJAIAgentRuns_LastRunID_PrimaryScopeEntityID uniqueidentifier
    DECLARE @MJAIAgentRuns_LastRunID_PrimaryScopeRecordID nvarchar(100)
    DECLARE @MJAIAgentRuns_LastRunID_SecondaryScopes nvarchar(MAX)
    DECLARE @MJAIAgentRuns_LastRunID_ExternalReferenceID nvarchar(200)
    DECLARE @MJAIAgentRuns_LastRunID_CompanyID uniqueidentifier
    DECLARE @MJAIAgentRuns_LastRunID_TotalCacheReadTokensUsed int
    DECLARE @MJAIAgentRuns_LastRunID_TotalCacheWriteTokensUsed int
    DECLARE @MJAIAgentRuns_LastRunID_LastHeartbeatAt datetimeoffset
    DECLARE @MJAIAgentRuns_LastRunID_AgentSessionID uniqueidentifier
    DECLARE @MJAIAgentRuns_LastRunID_PlanMode bit
    DECLARE @MJAIAgentRuns_LastRunID_ExternalSessionID nvarchar(255)
    DECLARE @MJAIAgentRuns_LastRunID_ContinuationDepth int
    DECLARE cascade_update_MJAIAgentRuns_LastRunID_cursor CURSOR FOR
        SELECT [ID], [AgentID], [ParentRunID], [Status], [StartedAt], [CompletedAt], [Success], [ErrorMessage], [ConversationID], [UserID], [Result], [AgentState], [TotalTokensUsed], [TotalCost], [TotalPromptTokensUsed], [TotalCompletionTokensUsed], [TotalTokensUsedRollup], [TotalPromptTokensUsedRollup], [TotalCompletionTokensUsedRollup], [TotalCostRollup], [ConversationDetailID], [ConversationDetailSequence], [CancellationReason], [FinalStep], [FinalPayload], [Message], [LastRunID], [StartingPayload], [TotalPromptIterations], [ConfigurationID], [OverrideModelID], [OverrideVendorID], [Data], [Verbose], [EffortLevel], [RunName], [Comments], [ScheduledJobRunID], [TestRunID], [PrimaryScopeEntityID], [PrimaryScopeRecordID], [SecondaryScopes], [ExternalReferenceID], [CompanyID], [TotalCacheReadTokensUsed], [TotalCacheWriteTokensUsed], [LastHeartbeatAt], [AgentSessionID], [PlanMode], [ExternalSessionID], [ContinuationDepth]
        FROM [${flyway:defaultSchema}].[AIAgentRun]
        WHERE [LastRunID] = @ID

    OPEN cascade_update_MJAIAgentRuns_LastRunID_cursor
    FETCH NEXT FROM cascade_update_MJAIAgentRuns_LastRunID_cursor INTO @MJAIAgentRuns_LastRunIDID, @MJAIAgentRuns_LastRunID_AgentID, @MJAIAgentRuns_LastRunID_ParentRunID, @MJAIAgentRuns_LastRunID_Status, @MJAIAgentRuns_LastRunID_StartedAt, @MJAIAgentRuns_LastRunID_CompletedAt, @MJAIAgentRuns_LastRunID_Success, @MJAIAgentRuns_LastRunID_ErrorMessage, @MJAIAgentRuns_LastRunID_ConversationID, @MJAIAgentRuns_LastRunID_UserID, @MJAIAgentRuns_LastRunID_Result, @MJAIAgentRuns_LastRunID_AgentState, @MJAIAgentRuns_LastRunID_TotalTokensUsed, @MJAIAgentRuns_LastRunID_TotalCost, @MJAIAgentRuns_LastRunID_TotalPromptTokensUsed, @MJAIAgentRuns_LastRunID_TotalCompletionTokensUsed, @MJAIAgentRuns_LastRunID_TotalTokensUsedRollup, @MJAIAgentRuns_LastRunID_TotalPromptTokensUsedRollup, @MJAIAgentRuns_LastRunID_TotalCompletionTokensUsedRollup, @MJAIAgentRuns_LastRunID_TotalCostRollup, @MJAIAgentRuns_LastRunID_ConversationDetailID, @MJAIAgentRuns_LastRunID_ConversationDetailSequence, @MJAIAgentRuns_LastRunID_CancellationReason, @MJAIAgentRuns_LastRunID_FinalStep, @MJAIAgentRuns_LastRunID_FinalPayload, @MJAIAgentRuns_LastRunID_Message, @MJAIAgentRuns_LastRunID_LastRunID, @MJAIAgentRuns_LastRunID_StartingPayload, @MJAIAgentRuns_LastRunID_TotalPromptIterations, @MJAIAgentRuns_LastRunID_ConfigurationID, @MJAIAgentRuns_LastRunID_OverrideModelID, @MJAIAgentRuns_LastRunID_OverrideVendorID, @MJAIAgentRuns_LastRunID_Data, @MJAIAgentRuns_LastRunID_Verbose, @MJAIAgentRuns_LastRunID_EffortLevel, @MJAIAgentRuns_LastRunID_RunName, @MJAIAgentRuns_LastRunID_Comments, @MJAIAgentRuns_LastRunID_ScheduledJobRunID, @MJAIAgentRuns_LastRunID_TestRunID, @MJAIAgentRuns_LastRunID_PrimaryScopeEntityID, @MJAIAgentRuns_LastRunID_PrimaryScopeRecordID, @MJAIAgentRuns_LastRunID_SecondaryScopes, @MJAIAgentRuns_LastRunID_ExternalReferenceID, @MJAIAgentRuns_LastRunID_CompanyID, @MJAIAgentRuns_LastRunID_TotalCacheReadTokensUsed, @MJAIAgentRuns_LastRunID_TotalCacheWriteTokensUsed, @MJAIAgentRuns_LastRunID_LastHeartbeatAt, @MJAIAgentRuns_LastRunID_AgentSessionID, @MJAIAgentRuns_LastRunID_PlanMode, @MJAIAgentRuns_LastRunID_ExternalSessionID, @MJAIAgentRuns_LastRunID_ContinuationDepth

    WHILE @@FETCH_STATUS = 0
    BEGIN
        -- Set the FK field to NULL
        SET @MJAIAgentRuns_LastRunID_LastRunID = NULL

        -- Call the update SP for the related entity
        EXEC [${flyway:defaultSchema}].[spUpdateAIAgentRun] @ID = @MJAIAgentRuns_LastRunIDID, @AgentID = @MJAIAgentRuns_LastRunID_AgentID, @ParentRunID = @MJAIAgentRuns_LastRunID_ParentRunID, @Status = @MJAIAgentRuns_LastRunID_Status, @StartedAt = @MJAIAgentRuns_LastRunID_StartedAt, @CompletedAt = @MJAIAgentRuns_LastRunID_CompletedAt, @Success = @MJAIAgentRuns_LastRunID_Success, @ErrorMessage = @MJAIAgentRuns_LastRunID_ErrorMessage, @ConversationID = @MJAIAgentRuns_LastRunID_ConversationID, @UserID = @MJAIAgentRuns_LastRunID_UserID, @Result = @MJAIAgentRuns_LastRunID_Result, @AgentState = @MJAIAgentRuns_LastRunID_AgentState, @TotalTokensUsed = @MJAIAgentRuns_LastRunID_TotalTokensUsed, @TotalCost = @MJAIAgentRuns_LastRunID_TotalCost, @TotalPromptTokensUsed = @MJAIAgentRuns_LastRunID_TotalPromptTokensUsed, @TotalCompletionTokensUsed = @MJAIAgentRuns_LastRunID_TotalCompletionTokensUsed, @TotalTokensUsedRollup = @MJAIAgentRuns_LastRunID_TotalTokensUsedRollup, @TotalPromptTokensUsedRollup = @MJAIAgentRuns_LastRunID_TotalPromptTokensUsedRollup, @TotalCompletionTokensUsedRollup = @MJAIAgentRuns_LastRunID_TotalCompletionTokensUsedRollup, @TotalCostRollup = @MJAIAgentRuns_LastRunID_TotalCostRollup, @ConversationDetailID = @MJAIAgentRuns_LastRunID_ConversationDetailID, @ConversationDetailSequence = @MJAIAgentRuns_LastRunID_ConversationDetailSequence, @CancellationReason = @MJAIAgentRuns_LastRunID_CancellationReason, @FinalStep = @MJAIAgentRuns_LastRunID_FinalStep, @FinalPayload = @MJAIAgentRuns_LastRunID_FinalPayload, @Message = @MJAIAgentRuns_LastRunID_Message, @LastRunID_Clear = 1, @LastRunID = @MJAIAgentRuns_LastRunID_LastRunID, @StartingPayload = @MJAIAgentRuns_LastRunID_StartingPayload, @TotalPromptIterations = @MJAIAgentRuns_LastRunID_TotalPromptIterations, @ConfigurationID = @MJAIAgentRuns_LastRunID_ConfigurationID, @OverrideModelID = @MJAIAgentRuns_LastRunID_OverrideModelID, @OverrideVendorID = @MJAIAgentRuns_LastRunID_OverrideVendorID, @Data = @MJAIAgentRuns_LastRunID_Data, @Verbose = @MJAIAgentRuns_LastRunID_Verbose, @EffortLevel = @MJAIAgentRuns_LastRunID_EffortLevel, @RunName = @MJAIAgentRuns_LastRunID_RunName, @Comments = @MJAIAgentRuns_LastRunID_Comments, @ScheduledJobRunID = @MJAIAgentRuns_LastRunID_ScheduledJobRunID, @TestRunID = @MJAIAgentRuns_LastRunID_TestRunID, @PrimaryScopeEntityID = @MJAIAgentRuns_LastRunID_PrimaryScopeEntityID, @PrimaryScopeRecordID = @MJAIAgentRuns_LastRunID_PrimaryScopeRecordID, @SecondaryScopes = @MJAIAgentRuns_LastRunID_SecondaryScopes, @ExternalReferenceID = @MJAIAgentRuns_LastRunID_ExternalReferenceID, @CompanyID = @MJAIAgentRuns_LastRunID_CompanyID, @TotalCacheReadTokensUsed = @MJAIAgentRuns_LastRunID_TotalCacheReadTokensUsed, @TotalCacheWriteTokensUsed = @MJAIAgentRuns_LastRunID_TotalCacheWriteTokensUsed, @LastHeartbeatAt = @MJAIAgentRuns_LastRunID_LastHeartbeatAt, @AgentSessionID = @MJAIAgentRuns_LastRunID_AgentSessionID, @PlanMode = @MJAIAgentRuns_LastRunID_PlanMode, @ExternalSessionID = @MJAIAgentRuns_LastRunID_ExternalSessionID, @ContinuationDepth = @MJAIAgentRuns_LastRunID_ContinuationDepth

        FETCH NEXT FROM cascade_update_MJAIAgentRuns_LastRunID_cursor INTO @MJAIAgentRuns_LastRunIDID, @MJAIAgentRuns_LastRunID_AgentID, @MJAIAgentRuns_LastRunID_ParentRunID, @MJAIAgentRuns_LastRunID_Status, @MJAIAgentRuns_LastRunID_StartedAt, @MJAIAgentRuns_LastRunID_CompletedAt, @MJAIAgentRuns_LastRunID_Success, @MJAIAgentRuns_LastRunID_ErrorMessage, @MJAIAgentRuns_LastRunID_ConversationID, @MJAIAgentRuns_LastRunID_UserID, @MJAIAgentRuns_LastRunID_Result, @MJAIAgentRuns_LastRunID_AgentState, @MJAIAgentRuns_LastRunID_TotalTokensUsed, @MJAIAgentRuns_LastRunID_TotalCost, @MJAIAgentRuns_LastRunID_TotalPromptTokensUsed, @MJAIAgentRuns_LastRunID_TotalCompletionTokensUsed, @MJAIAgentRuns_LastRunID_TotalTokensUsedRollup, @MJAIAgentRuns_LastRunID_TotalPromptTokensUsedRollup, @MJAIAgentRuns_LastRunID_TotalCompletionTokensUsedRollup, @MJAIAgentRuns_LastRunID_TotalCostRollup, @MJAIAgentRuns_LastRunID_ConversationDetailID, @MJAIAgentRuns_LastRunID_ConversationDetailSequence, @MJAIAgentRuns_LastRunID_CancellationReason, @MJAIAgentRuns_LastRunID_FinalStep, @MJAIAgentRuns_LastRunID_FinalPayload, @MJAIAgentRuns_LastRunID_Message, @MJAIAgentRuns_LastRunID_LastRunID, @MJAIAgentRuns_LastRunID_StartingPayload, @MJAIAgentRuns_LastRunID_TotalPromptIterations, @MJAIAgentRuns_LastRunID_ConfigurationID, @MJAIAgentRuns_LastRunID_OverrideModelID, @MJAIAgentRuns_LastRunID_OverrideVendorID, @MJAIAgentRuns_LastRunID_Data, @MJAIAgentRuns_LastRunID_Verbose, @MJAIAgentRuns_LastRunID_EffortLevel, @MJAIAgentRuns_LastRunID_RunName, @MJAIAgentRuns_LastRunID_Comments, @MJAIAgentRuns_LastRunID_ScheduledJobRunID, @MJAIAgentRuns_LastRunID_TestRunID, @MJAIAgentRuns_LastRunID_PrimaryScopeEntityID, @MJAIAgentRuns_LastRunID_PrimaryScopeRecordID, @MJAIAgentRuns_LastRunID_SecondaryScopes, @MJAIAgentRuns_LastRunID_ExternalReferenceID, @MJAIAgentRuns_LastRunID_CompanyID, @MJAIAgentRuns_LastRunID_TotalCacheReadTokensUsed, @MJAIAgentRuns_LastRunID_TotalCacheWriteTokensUsed, @MJAIAgentRuns_LastRunID_LastHeartbeatAt, @MJAIAgentRuns_LastRunID_AgentSessionID, @MJAIAgentRuns_LastRunID_PlanMode, @MJAIAgentRuns_LastRunID_ExternalSessionID, @MJAIAgentRuns_LastRunID_ContinuationDepth
    END

    CLOSE cascade_update_MJAIAgentRuns_LastRunID_cursor
    DEALLOCATE cascade_update_MJAIAgentRuns_LastRunID_cursor
    
    -- Cascade update on DuplicateRunDetailMatch using cursor to call spUpdateDuplicateRunDetailMatch
    DECLARE @MJDuplicateRunDetailMatches_AIAgentRunIDID uniqueidentifier
    DECLARE @MJDuplicateRunDetailMatches_AIAgentRunID_DuplicateRunDetailID uniqueidentifier
    DECLARE @MJDuplicateRunDetailMatches_AIAgentRunID_MatchSource nvarchar(20)
    DECLARE @MJDuplicateRunDetailMatches_AIAgentRunID_MatchRecordID nvarchar(500)
    DECLARE @MJDuplicateRunDetailMatches_AIAgentRunID_MatchProbability numeric(12, 11)
    DECLARE @MJDuplicateRunDetailMatches_AIAgentRunID_MatchedAt datetimeoffset
    DECLARE @MJDuplicateRunDetailMatches_AIAgentRunID_Action nvarchar(20)
    DECLARE @MJDuplicateRunDetailMatches_AIAgentRunID_ApprovalStatus nvarchar(20)
    DECLARE @MJDuplicateRunDetailMatches_AIAgentRunID_RecordMergeLogID uniqueidentifier
    DECLARE @MJDuplicateRunDetailMatches_AIAgentRunID_MergeStatus nvarchar(20)
    DECLARE @MJDuplicateRunDetailMatches_AIAgentRunID_MergedAt datetimeoffset
    DECLARE @MJDuplicateRunDetailMatches_AIAgentRunID_RecordMetadata nvarchar(MAX)
    DECLARE @MJDuplicateRunDetailMatches_AIAgentRunID_AIAgentRunID uniqueidentifier
    DECLARE @MJDuplicateRunDetailMatches_AIAgentRunID_AIPromptRunID uniqueidentifier
    DECLARE @MJDuplicateRunDetailMatches_AIAgentRunID_LLMRecommendation nvarchar(20)
    DECLARE @MJDuplicateRunDetailMatches_AIAgentRunID_LLMConfidence numeric(12, 11)
    DECLARE @MJDuplicateRunDetailMatches_AIAgentRunID_LLMReasoning nvarchar(MAX)
    DECLARE @MJDuplicateRunDetailMatches_AIAgentRunID_LLMProposedSurvivorRecordID nvarchar(500)
    DECLARE @MJDuplicateRunDetailMatches_AIAgentRunID_LLMProposedFieldMap nvarchar(MAX)
    DECLARE cascade_update_MJDuplicateRunDetailMatches_AIAgentRunID_cursor CURSOR FOR
        SELECT [ID], [DuplicateRunDetailID], [MatchSource], [MatchRecordID], [MatchProbability], [MatchedAt], [Action], [ApprovalStatus], [RecordMergeLogID], [MergeStatus], [MergedAt], [RecordMetadata], [AIAgentRunID], [AIPromptRunID], [LLMRecommendation], [LLMConfidence], [LLMReasoning], [LLMProposedSurvivorRecordID], [LLMProposedFieldMap]
        FROM [${flyway:defaultSchema}].[DuplicateRunDetailMatch]
        WHERE [AIAgentRunID] = @ID

    OPEN cascade_update_MJDuplicateRunDetailMatches_AIAgentRunID_cursor
    FETCH NEXT FROM cascade_update_MJDuplicateRunDetailMatches_AIAgentRunID_cursor INTO @MJDuplicateRunDetailMatches_AIAgentRunIDID, @MJDuplicateRunDetailMatches_AIAgentRunID_DuplicateRunDetailID, @MJDuplicateRunDetailMatches_AIAgentRunID_MatchSource, @MJDuplicateRunDetailMatches_AIAgentRunID_MatchRecordID, @MJDuplicateRunDetailMatches_AIAgentRunID_MatchProbability, @MJDuplicateRunDetailMatches_AIAgentRunID_MatchedAt, @MJDuplicateRunDetailMatches_AIAgentRunID_Action, @MJDuplicateRunDetailMatches_AIAgentRunID_ApprovalStatus, @MJDuplicateRunDetailMatches_AIAgentRunID_RecordMergeLogID, @MJDuplicateRunDetailMatches_AIAgentRunID_MergeStatus, @MJDuplicateRunDetailMatches_AIAgentRunID_MergedAt, @MJDuplicateRunDetailMatches_AIAgentRunID_RecordMetadata, @MJDuplicateRunDetailMatches_AIAgentRunID_AIAgentRunID, @MJDuplicateRunDetailMatches_AIAgentRunID_AIPromptRunID, @MJDuplicateRunDetailMatches_AIAgentRunID_LLMRecommendation, @MJDuplicateRunDetailMatches_AIAgentRunID_LLMConfidence, @MJDuplicateRunDetailMatches_AIAgentRunID_LLMReasoning, @MJDuplicateRunDetailMatches_AIAgentRunID_LLMProposedSurvivorRecordID, @MJDuplicateRunDetailMatches_AIAgentRunID_LLMProposedFieldMap

    WHILE @@FETCH_STATUS = 0
    BEGIN
        -- Set the FK field to NULL
        SET @MJDuplicateRunDetailMatches_AIAgentRunID_AIAgentRunID = NULL

        -- Call the update SP for the related entity
        EXEC [${flyway:defaultSchema}].[spUpdateDuplicateRunDetailMatch] @ID = @MJDuplicateRunDetailMatches_AIAgentRunIDID, @DuplicateRunDetailID = @MJDuplicateRunDetailMatches_AIAgentRunID_DuplicateRunDetailID, @MatchSource = @MJDuplicateRunDetailMatches_AIAgentRunID_MatchSource, @MatchRecordID = @MJDuplicateRunDetailMatches_AIAgentRunID_MatchRecordID, @MatchProbability = @MJDuplicateRunDetailMatches_AIAgentRunID_MatchProbability, @MatchedAt = @MJDuplicateRunDetailMatches_AIAgentRunID_MatchedAt, @Action = @MJDuplicateRunDetailMatches_AIAgentRunID_Action, @ApprovalStatus = @MJDuplicateRunDetailMatches_AIAgentRunID_ApprovalStatus, @RecordMergeLogID = @MJDuplicateRunDetailMatches_AIAgentRunID_RecordMergeLogID, @MergeStatus = @MJDuplicateRunDetailMatches_AIAgentRunID_MergeStatus, @MergedAt = @MJDuplicateRunDetailMatches_AIAgentRunID_MergedAt, @RecordMetadata = @MJDuplicateRunDetailMatches_AIAgentRunID_RecordMetadata, @AIAgentRunID_Clear = 1, @AIAgentRunID = @MJDuplicateRunDetailMatches_AIAgentRunID_AIAgentRunID, @AIPromptRunID = @MJDuplicateRunDetailMatches_AIAgentRunID_AIPromptRunID, @LLMRecommendation = @MJDuplicateRunDetailMatches_AIAgentRunID_LLMRecommendation, @LLMConfidence = @MJDuplicateRunDetailMatches_AIAgentRunID_LLMConfidence, @LLMReasoning = @MJDuplicateRunDetailMatches_AIAgentRunID_LLMReasoning, @LLMProposedSurvivorRecordID = @MJDuplicateRunDetailMatches_AIAgentRunID_LLMProposedSurvivorRecordID, @LLMProposedFieldMap = @MJDuplicateRunDetailMatches_AIAgentRunID_LLMProposedFieldMap

        FETCH NEXT FROM cascade_update_MJDuplicateRunDetailMatches_AIAgentRunID_cursor INTO @MJDuplicateRunDetailMatches_AIAgentRunIDID, @MJDuplicateRunDetailMatches_AIAgentRunID_DuplicateRunDetailID, @MJDuplicateRunDetailMatches_AIAgentRunID_MatchSource, @MJDuplicateRunDetailMatches_AIAgentRunID_MatchRecordID, @MJDuplicateRunDetailMatches_AIAgentRunID_MatchProbability, @MJDuplicateRunDetailMatches_AIAgentRunID_MatchedAt, @MJDuplicateRunDetailMatches_AIAgentRunID_Action, @MJDuplicateRunDetailMatches_AIAgentRunID_ApprovalStatus, @MJDuplicateRunDetailMatches_AIAgentRunID_RecordMergeLogID, @MJDuplicateRunDetailMatches_AIAgentRunID_MergeStatus, @MJDuplicateRunDetailMatches_AIAgentRunID_MergedAt, @MJDuplicateRunDetailMatches_AIAgentRunID_RecordMetadata, @MJDuplicateRunDetailMatches_AIAgentRunID_AIAgentRunID, @MJDuplicateRunDetailMatches_AIAgentRunID_AIPromptRunID, @MJDuplicateRunDetailMatches_AIAgentRunID_LLMRecommendation, @MJDuplicateRunDetailMatches_AIAgentRunID_LLMConfidence, @MJDuplicateRunDetailMatches_AIAgentRunID_LLMReasoning, @MJDuplicateRunDetailMatches_AIAgentRunID_LLMProposedSurvivorRecordID, @MJDuplicateRunDetailMatches_AIAgentRunID_LLMProposedFieldMap
    END

    CLOSE cascade_update_MJDuplicateRunDetailMatches_AIAgentRunID_cursor
    DEALLOCATE cascade_update_MJDuplicateRunDetailMatches_AIAgentRunID_cursor
    
    -- Cascade update on ExperimentSessionIteration using cursor to call spUpdateExperimentSessionIteration
    DECLARE @MJExperimentSessionIterations_AIAgentRunIDID uniqueidentifier
    DECLARE @MJExperimentSessionIterations_AIAgentRunID_ExperimentSessionID uniqueidentifier
    DECLARE @MJExperimentSessionIterations_AIAgentRunID_Sequence int
    DECLARE @MJExperimentSessionIterations_AIAgentRunID_Label nvarchar(255)
    DECLARE @MJExperimentSessionIterations_AIAgentRunID_Status nvarchar(20)
    DECLARE @MJExperimentSessionIterations_AIAgentRunID_Score decimal(18, 6)
    DECLARE @MJExperimentSessionIterations_AIAgentRunID_ComputeCost decimal(18, 6)
    DECLARE @MJExperimentSessionIterations_AIAgentRunID_TokensUsed int
    DECLARE @MJExperimentSessionIterations_AIAgentRunID_Rationale nvarchar(MAX)
    DECLARE @MJExperimentSessionIterations_AIAgentRunID_AIAgentRunID uniqueidentifier
    DECLARE cascade_update_MJExperimentSessionIterations_AIAgentRunID_cursor CURSOR FOR
        SELECT [ID], [ExperimentSessionID], [Sequence], [Label], [Status], [Score], [ComputeCost], [TokensUsed], [Rationale], [AIAgentRunID]
        FROM [${flyway:defaultSchema}].[ExperimentSessionIteration]
        WHERE [AIAgentRunID] = @ID

    OPEN cascade_update_MJExperimentSessionIterations_AIAgentRunID_cursor
    FETCH NEXT FROM cascade_update_MJExperimentSessionIterations_AIAgentRunID_cursor INTO @MJExperimentSessionIterations_AIAgentRunIDID, @MJExperimentSessionIterations_AIAgentRunID_ExperimentSessionID, @MJExperimentSessionIterations_AIAgentRunID_Sequence, @MJExperimentSessionIterations_AIAgentRunID_Label, @MJExperimentSessionIterations_AIAgentRunID_Status, @MJExperimentSessionIterations_AIAgentRunID_Score, @MJExperimentSessionIterations_AIAgentRunID_ComputeCost, @MJExperimentSessionIterations_AIAgentRunID_TokensUsed, @MJExperimentSessionIterations_AIAgentRunID_Rationale, @MJExperimentSessionIterations_AIAgentRunID_AIAgentRunID

    WHILE @@FETCH_STATUS = 0
    BEGIN
        -- Set the FK field to NULL
        SET @MJExperimentSessionIterations_AIAgentRunID_AIAgentRunID = NULL

        -- Call the update SP for the related entity
        EXEC [${flyway:defaultSchema}].[spUpdateExperimentSessionIteration] @ID = @MJExperimentSessionIterations_AIAgentRunIDID, @ExperimentSessionID = @MJExperimentSessionIterations_AIAgentRunID_ExperimentSessionID, @Sequence = @MJExperimentSessionIterations_AIAgentRunID_Sequence, @Label = @MJExperimentSessionIterations_AIAgentRunID_Label, @Status = @MJExperimentSessionIterations_AIAgentRunID_Status, @Score = @MJExperimentSessionIterations_AIAgentRunID_Score, @ComputeCost = @MJExperimentSessionIterations_AIAgentRunID_ComputeCost, @TokensUsed = @MJExperimentSessionIterations_AIAgentRunID_TokensUsed, @Rationale = @MJExperimentSessionIterations_AIAgentRunID_Rationale, @AIAgentRunID_Clear = 1, @AIAgentRunID = @MJExperimentSessionIterations_AIAgentRunID_AIAgentRunID

        FETCH NEXT FROM cascade_update_MJExperimentSessionIterations_AIAgentRunID_cursor INTO @MJExperimentSessionIterations_AIAgentRunIDID, @MJExperimentSessionIterations_AIAgentRunID_ExperimentSessionID, @MJExperimentSessionIterations_AIAgentRunID_Sequence, @MJExperimentSessionIterations_AIAgentRunID_Label, @MJExperimentSessionIterations_AIAgentRunID_Status, @MJExperimentSessionIterations_AIAgentRunID_Score, @MJExperimentSessionIterations_AIAgentRunID_ComputeCost, @MJExperimentSessionIterations_AIAgentRunID_TokensUsed, @MJExperimentSessionIterations_AIAgentRunID_Rationale, @MJExperimentSessionIterations_AIAgentRunID_AIAgentRunID
    END

    CLOSE cascade_update_MJExperimentSessionIterations_AIAgentRunID_cursor
    DEALLOCATE cascade_update_MJExperimentSessionIterations_AIAgentRunID_cursor
    
    -- Cascade update on ExperimentSession using cursor to call spUpdateExperimentSession
    DECLARE @MJExperimentSessions_AgentRunIDID uniqueidentifier
    DECLARE @MJExperimentSessions_AgentRunID_ExperimentID uniqueidentifier
    DECLARE @MJExperimentSessions_AgentRunID_Name nvarchar(255)
    DECLARE @MJExperimentSessions_AgentRunID_Goal nvarchar(MAX)
    DECLARE @MJExperimentSessions_AgentRunID_Budget nvarchar(MAX)
    DECLARE @MJExperimentSessions_AgentRunID_Status nvarchar(20)
    DECLARE @MJExperimentSessions_AgentRunID_PlanSpec nvarchar(MAX)
    DECLARE @MJExperimentSessions_AgentRunID_Leaderboard nvarchar(MAX)
    DECLARE @MJExperimentSessions_AgentRunID_AgentRunID uniqueidentifier
    DECLARE cascade_update_MJExperimentSessions_AgentRunID_cursor CURSOR FOR
        SELECT [ID], [ExperimentID], [Name], [Goal], [Budget], [Status], [PlanSpec], [Leaderboard], [AgentRunID]
        FROM [${flyway:defaultSchema}].[ExperimentSession]
        WHERE [AgentRunID] = @ID

    OPEN cascade_update_MJExperimentSessions_AgentRunID_cursor
    FETCH NEXT FROM cascade_update_MJExperimentSessions_AgentRunID_cursor INTO @MJExperimentSessions_AgentRunIDID, @MJExperimentSessions_AgentRunID_ExperimentID, @MJExperimentSessions_AgentRunID_Name, @MJExperimentSessions_AgentRunID_Goal, @MJExperimentSessions_AgentRunID_Budget, @MJExperimentSessions_AgentRunID_Status, @MJExperimentSessions_AgentRunID_PlanSpec, @MJExperimentSessions_AgentRunID_Leaderboard, @MJExperimentSessions_AgentRunID_AgentRunID

    WHILE @@FETCH_STATUS = 0
    BEGIN
        -- Set the FK field to NULL
        SET @MJExperimentSessions_AgentRunID_AgentRunID = NULL

        -- Call the update SP for the related entity
        EXEC [${flyway:defaultSchema}].[spUpdateExperimentSession] @ID = @MJExperimentSessions_AgentRunIDID, @ExperimentID = @MJExperimentSessions_AgentRunID_ExperimentID, @Name = @MJExperimentSessions_AgentRunID_Name, @Goal = @MJExperimentSessions_AgentRunID_Goal, @Budget = @MJExperimentSessions_AgentRunID_Budget, @Status = @MJExperimentSessions_AgentRunID_Status, @PlanSpec = @MJExperimentSessions_AgentRunID_PlanSpec, @Leaderboard = @MJExperimentSessions_AgentRunID_Leaderboard, @AgentRunID_Clear = 1, @AgentRunID = @MJExperimentSessions_AgentRunID_AgentRunID

        FETCH NEXT FROM cascade_update_MJExperimentSessions_AgentRunID_cursor INTO @MJExperimentSessions_AgentRunIDID, @MJExperimentSessions_AgentRunID_ExperimentID, @MJExperimentSessions_AgentRunID_Name, @MJExperimentSessions_AgentRunID_Goal, @MJExperimentSessions_AgentRunID_Budget, @MJExperimentSessions_AgentRunID_Status, @MJExperimentSessions_AgentRunID_PlanSpec, @MJExperimentSessions_AgentRunID_Leaderboard, @MJExperimentSessions_AgentRunID_AgentRunID
    END

    CLOSE cascade_update_MJExperimentSessions_AgentRunID_cursor
    DEALLOCATE cascade_update_MJExperimentSessions_AgentRunID_cursor
    
    -- Cascade update on ProcessRunDetail using cursor to call spUpdateProcessRunDetail
    DECLARE @MJProcessRunDetails_AIAgentRunIDID uniqueidentifier
    DECLARE @MJProcessRunDetails_AIAgentRunID_ProcessRunID uniqueidentifier
    DECLARE @MJProcessRunDetails_AIAgentRunID_EntityID uniqueidentifier
    DECLARE @MJProcessRunDetails_AIAgentRunID_RecordID nvarchar(450)
    DECLARE @MJProcessRunDetails_AIAgentRunID_Status nvarchar(20)
    DECLARE @MJProcessRunDetails_AIAgentRunID_StartedAt datetimeoffset
    DECLARE @MJProcessRunDetails_AIAgentRunID_CompletedAt datetimeoffset
    DECLARE @MJProcessRunDetails_AIAgentRunID_DurationMs int
    DECLARE @MJProcessRunDetails_AIAgentRunID_AttemptCount int
    DECLARE @MJProcessRunDetails_AIAgentRunID_ResultPayload nvarchar(MAX)
    DECLARE @MJProcessRunDetails_AIAgentRunID_ErrorMessage nvarchar(MAX)
    DECLARE @MJProcessRunDetails_AIAgentRunID_ActionExecutionLogID uniqueidentifier
    DECLARE @MJProcessRunDetails_AIAgentRunID_AIAgentRunID uniqueidentifier
    DECLARE cascade_update_MJProcessRunDetails_AIAgentRunID_cursor CURSOR FOR
        SELECT [ID], [ProcessRunID], [EntityID], [RecordID], [Status], [StartedAt], [CompletedAt], [DurationMs], [AttemptCount], [ResultPayload], [ErrorMessage], [ActionExecutionLogID], [AIAgentRunID]
        FROM [${flyway:defaultSchema}].[ProcessRunDetail]
        WHERE [AIAgentRunID] = @ID

    OPEN cascade_update_MJProcessRunDetails_AIAgentRunID_cursor
    FETCH NEXT FROM cascade_update_MJProcessRunDetails_AIAgentRunID_cursor INTO @MJProcessRunDetails_AIAgentRunIDID, @MJProcessRunDetails_AIAgentRunID_ProcessRunID, @MJProcessRunDetails_AIAgentRunID_EntityID, @MJProcessRunDetails_AIAgentRunID_RecordID, @MJProcessRunDetails_AIAgentRunID_Status, @MJProcessRunDetails_AIAgentRunID_StartedAt, @MJProcessRunDetails_AIAgentRunID_CompletedAt, @MJProcessRunDetails_AIAgentRunID_DurationMs, @MJProcessRunDetails_AIAgentRunID_AttemptCount, @MJProcessRunDetails_AIAgentRunID_ResultPayload, @MJProcessRunDetails_AIAgentRunID_ErrorMessage, @MJProcessRunDetails_AIAgentRunID_ActionExecutionLogID, @MJProcessRunDetails_AIAgentRunID_AIAgentRunID

    WHILE @@FETCH_STATUS = 0
    BEGIN
        -- Set the FK field to NULL
        SET @MJProcessRunDetails_AIAgentRunID_AIAgentRunID = NULL

        -- Call the update SP for the related entity
        EXEC [${flyway:defaultSchema}].[spUpdateProcessRunDetail] @ID = @MJProcessRunDetails_AIAgentRunIDID, @ProcessRunID = @MJProcessRunDetails_AIAgentRunID_ProcessRunID, @EntityID = @MJProcessRunDetails_AIAgentRunID_EntityID, @RecordID = @MJProcessRunDetails_AIAgentRunID_RecordID, @Status = @MJProcessRunDetails_AIAgentRunID_Status, @StartedAt = @MJProcessRunDetails_AIAgentRunID_StartedAt, @CompletedAt = @MJProcessRunDetails_AIAgentRunID_CompletedAt, @DurationMs = @MJProcessRunDetails_AIAgentRunID_DurationMs, @AttemptCount = @MJProcessRunDetails_AIAgentRunID_AttemptCount, @ResultPayload = @MJProcessRunDetails_AIAgentRunID_ResultPayload, @ErrorMessage = @MJProcessRunDetails_AIAgentRunID_ErrorMessage, @ActionExecutionLogID = @MJProcessRunDetails_AIAgentRunID_ActionExecutionLogID, @AIAgentRunID_Clear = 1, @AIAgentRunID = @MJProcessRunDetails_AIAgentRunID_AIAgentRunID

        FETCH NEXT FROM cascade_update_MJProcessRunDetails_AIAgentRunID_cursor INTO @MJProcessRunDetails_AIAgentRunIDID, @MJProcessRunDetails_AIAgentRunID_ProcessRunID, @MJProcessRunDetails_AIAgentRunID_EntityID, @MJProcessRunDetails_AIAgentRunID_RecordID, @MJProcessRunDetails_AIAgentRunID_Status, @MJProcessRunDetails_AIAgentRunID_StartedAt, @MJProcessRunDetails_AIAgentRunID_CompletedAt, @MJProcessRunDetails_AIAgentRunID_DurationMs, @MJProcessRunDetails_AIAgentRunID_AttemptCount, @MJProcessRunDetails_AIAgentRunID_ResultPayload, @MJProcessRunDetails_AIAgentRunID_ErrorMessage, @MJProcessRunDetails_AIAgentRunID_ActionExecutionLogID, @MJProcessRunDetails_AIAgentRunID_AIAgentRunID
    END

    CLOSE cascade_update_MJProcessRunDetails_AIAgentRunID_cursor
    DEALLOCATE cascade_update_MJProcessRunDetails_AIAgentRunID_cursor
    
    -- Cascade update on Task using cursor to call spUpdateTask
    DECLARE @MJTasks_AgentRunIDID uniqueidentifier
    DECLARE @MJTasks_AgentRunID_ParentID uniqueidentifier
    DECLARE @MJTasks_AgentRunID_Name nvarchar(255)
    DECLARE @MJTasks_AgentRunID_Description nvarchar(MAX)
    DECLARE @MJTasks_AgentRunID_TypeID uniqueidentifier
    DECLARE @MJTasks_AgentRunID_EnvironmentID uniqueidentifier
    DECLARE @MJTasks_AgentRunID_ProjectID uniqueidentifier
    DECLARE @MJTasks_AgentRunID_ConversationDetailID uniqueidentifier
    DECLARE @MJTasks_AgentRunID_UserID uniqueidentifier
    DECLARE @MJTasks_AgentRunID_AgentID uniqueidentifier
    DECLARE @MJTasks_AgentRunID_Status nvarchar(50)
    DECLARE @MJTasks_AgentRunID_PercentComplete int
    DECLARE @MJTasks_AgentRunID_DueAt datetimeoffset
    DECLARE @MJTasks_AgentRunID_StartedAt datetimeoffset
    DECLARE @MJTasks_AgentRunID_CompletedAt datetimeoffset
    DECLARE @MJTasks_AgentRunID_InputPayload nvarchar(MAX)
    DECLARE @MJTasks_AgentRunID_OutputPayload nvarchar(MAX)
    DECLARE @MJTasks_AgentRunID_ErrorMessage nvarchar(MAX)
    DECLARE @MJTasks_AgentRunID_AgentRunID uniqueidentifier
    DECLARE @MJTasks_AgentRunID_ClaimedBy nvarchar(100)
    DECLARE @MJTasks_AgentRunID_ClaimExpiresAt datetimeoffset
    DECLARE @MJTasks_AgentRunID_ActionID uniqueidentifier
    DECLARE @MJTasks_AgentRunID_StepType nvarchar(20)
    DECLARE @MJTasks_AgentRunID_PromptID uniqueidentifier
    DECLARE @MJTasks_AgentRunID_Configuration nvarchar(MAX)
    DECLARE cascade_update_MJTasks_AgentRunID_cursor CURSOR FOR
        SELECT [ID], [ParentID], [Name], [Description], [TypeID], [EnvironmentID], [ProjectID], [ConversationDetailID], [UserID], [AgentID], [Status], [PercentComplete], [DueAt], [StartedAt], [CompletedAt], [InputPayload], [OutputPayload], [ErrorMessage], [AgentRunID], [ClaimedBy], [ClaimExpiresAt], [ActionID], [StepType], [PromptID], [Configuration]
        FROM [${flyway:defaultSchema}].[Task]
        WHERE [AgentRunID] = @ID

    OPEN cascade_update_MJTasks_AgentRunID_cursor
    FETCH NEXT FROM cascade_update_MJTasks_AgentRunID_cursor INTO @MJTasks_AgentRunIDID, @MJTasks_AgentRunID_ParentID, @MJTasks_AgentRunID_Name, @MJTasks_AgentRunID_Description, @MJTasks_AgentRunID_TypeID, @MJTasks_AgentRunID_EnvironmentID, @MJTasks_AgentRunID_ProjectID, @MJTasks_AgentRunID_ConversationDetailID, @MJTasks_AgentRunID_UserID, @MJTasks_AgentRunID_AgentID, @MJTasks_AgentRunID_Status, @MJTasks_AgentRunID_PercentComplete, @MJTasks_AgentRunID_DueAt, @MJTasks_AgentRunID_StartedAt, @MJTasks_AgentRunID_CompletedAt, @MJTasks_AgentRunID_InputPayload, @MJTasks_AgentRunID_OutputPayload, @MJTasks_AgentRunID_ErrorMessage, @MJTasks_AgentRunID_AgentRunID, @MJTasks_AgentRunID_ClaimedBy, @MJTasks_AgentRunID_ClaimExpiresAt, @MJTasks_AgentRunID_ActionID, @MJTasks_AgentRunID_StepType, @MJTasks_AgentRunID_PromptID, @MJTasks_AgentRunID_Configuration

    WHILE @@FETCH_STATUS = 0
    BEGIN
        -- Set the FK field to NULL
        SET @MJTasks_AgentRunID_AgentRunID = NULL

        -- Call the update SP for the related entity
        EXEC [${flyway:defaultSchema}].[spUpdateTask] @ID = @MJTasks_AgentRunIDID, @ParentID = @MJTasks_AgentRunID_ParentID, @Name = @MJTasks_AgentRunID_Name, @Description = @MJTasks_AgentRunID_Description, @TypeID = @MJTasks_AgentRunID_TypeID, @EnvironmentID = @MJTasks_AgentRunID_EnvironmentID, @ProjectID = @MJTasks_AgentRunID_ProjectID, @ConversationDetailID = @MJTasks_AgentRunID_ConversationDetailID, @UserID = @MJTasks_AgentRunID_UserID, @AgentID = @MJTasks_AgentRunID_AgentID, @Status = @MJTasks_AgentRunID_Status, @PercentComplete = @MJTasks_AgentRunID_PercentComplete, @DueAt = @MJTasks_AgentRunID_DueAt, @StartedAt = @MJTasks_AgentRunID_StartedAt, @CompletedAt = @MJTasks_AgentRunID_CompletedAt, @InputPayload = @MJTasks_AgentRunID_InputPayload, @OutputPayload = @MJTasks_AgentRunID_OutputPayload, @ErrorMessage = @MJTasks_AgentRunID_ErrorMessage, @AgentRunID_Clear = 1, @AgentRunID = @MJTasks_AgentRunID_AgentRunID, @ClaimedBy = @MJTasks_AgentRunID_ClaimedBy, @ClaimExpiresAt = @MJTasks_AgentRunID_ClaimExpiresAt, @ActionID = @MJTasks_AgentRunID_ActionID, @StepType = @MJTasks_AgentRunID_StepType, @PromptID = @MJTasks_AgentRunID_PromptID, @Configuration = @MJTasks_AgentRunID_Configuration

        FETCH NEXT FROM cascade_update_MJTasks_AgentRunID_cursor INTO @MJTasks_AgentRunIDID, @MJTasks_AgentRunID_ParentID, @MJTasks_AgentRunID_Name, @MJTasks_AgentRunID_Description, @MJTasks_AgentRunID_TypeID, @MJTasks_AgentRunID_EnvironmentID, @MJTasks_AgentRunID_ProjectID, @MJTasks_AgentRunID_ConversationDetailID, @MJTasks_AgentRunID_UserID, @MJTasks_AgentRunID_AgentID, @MJTasks_AgentRunID_Status, @MJTasks_AgentRunID_PercentComplete, @MJTasks_AgentRunID_DueAt, @MJTasks_AgentRunID_StartedAt, @MJTasks_AgentRunID_CompletedAt, @MJTasks_AgentRunID_InputPayload, @MJTasks_AgentRunID_OutputPayload, @MJTasks_AgentRunID_ErrorMessage, @MJTasks_AgentRunID_AgentRunID, @MJTasks_AgentRunID_ClaimedBy, @MJTasks_AgentRunID_ClaimExpiresAt, @MJTasks_AgentRunID_ActionID, @MJTasks_AgentRunID_StepType, @MJTasks_AgentRunID_PromptID, @MJTasks_AgentRunID_Configuration
    END

    CLOSE cascade_update_MJTasks_AgentRunID_cursor
    DEALLOCATE cascade_update_MJTasks_AgentRunID_cursor
    
    -- Cascade update on UserRoutineRun using cursor to call spUpdateUserRoutineRun
    DECLARE @MJUserRoutineRuns_AgentRunIDID uniqueidentifier
    DECLARE @MJUserRoutineRuns_AgentRunID_RoutineID uniqueidentifier
    DECLARE @MJUserRoutineRuns_AgentRunID_StartedAt datetimeoffset
    DECLARE @MJUserRoutineRuns_AgentRunID_CompletedAt datetimeoffset
    DECLARE @MJUserRoutineRuns_AgentRunID_Status nvarchar(20)
    DECLARE @MJUserRoutineRuns_AgentRunID_AgentRunID uniqueidentifier
    DECLARE @MJUserRoutineRuns_AgentRunID_PromptRunID uniqueidentifier
    DECLARE @MJUserRoutineRuns_AgentRunID_ActionExecutionLogID uniqueidentifier
    DECLARE @MJUserRoutineRuns_AgentRunID_ResultSummary nvarchar(MAX)
    DECLARE @MJUserRoutineRuns_AgentRunID_ResultHash nvarchar(100)
    DECLARE @MJUserRoutineRuns_AgentRunID_NotificationSent bit
    DECLARE @MJUserRoutineRuns_AgentRunID_ErrorMessage nvarchar(MAX)
    DECLARE cascade_update_MJUserRoutineRuns_AgentRunID_cursor CURSOR FOR
        SELECT [ID], [RoutineID], [StartedAt], [CompletedAt], [Status], [AgentRunID], [PromptRunID], [ActionExecutionLogID], [ResultSummary], [ResultHash], [NotificationSent], [ErrorMessage]
        FROM [${flyway:defaultSchema}].[UserRoutineRun]
        WHERE [AgentRunID] = @ID

    OPEN cascade_update_MJUserRoutineRuns_AgentRunID_cursor
    FETCH NEXT FROM cascade_update_MJUserRoutineRuns_AgentRunID_cursor INTO @MJUserRoutineRuns_AgentRunIDID, @MJUserRoutineRuns_AgentRunID_RoutineID, @MJUserRoutineRuns_AgentRunID_StartedAt, @MJUserRoutineRuns_AgentRunID_CompletedAt, @MJUserRoutineRuns_AgentRunID_Status, @MJUserRoutineRuns_AgentRunID_AgentRunID, @MJUserRoutineRuns_AgentRunID_PromptRunID, @MJUserRoutineRuns_AgentRunID_ActionExecutionLogID, @MJUserRoutineRuns_AgentRunID_ResultSummary, @MJUserRoutineRuns_AgentRunID_ResultHash, @MJUserRoutineRuns_AgentRunID_NotificationSent, @MJUserRoutineRuns_AgentRunID_ErrorMessage

    WHILE @@FETCH_STATUS = 0
    BEGIN
        -- Set the FK field to NULL
        SET @MJUserRoutineRuns_AgentRunID_AgentRunID = NULL

        -- Call the update SP for the related entity
        EXEC [${flyway:defaultSchema}].[spUpdateUserRoutineRun] @ID = @MJUserRoutineRuns_AgentRunIDID, @RoutineID = @MJUserRoutineRuns_AgentRunID_RoutineID, @StartedAt = @MJUserRoutineRuns_AgentRunID_StartedAt, @CompletedAt = @MJUserRoutineRuns_AgentRunID_CompletedAt, @Status = @MJUserRoutineRuns_AgentRunID_Status, @AgentRunID_Clear = 1, @AgentRunID = @MJUserRoutineRuns_AgentRunID_AgentRunID, @PromptRunID = @MJUserRoutineRuns_AgentRunID_PromptRunID, @ActionExecutionLogID = @MJUserRoutineRuns_AgentRunID_ActionExecutionLogID, @ResultSummary = @MJUserRoutineRuns_AgentRunID_ResultSummary, @ResultHash = @MJUserRoutineRuns_AgentRunID_ResultHash, @NotificationSent = @MJUserRoutineRuns_AgentRunID_NotificationSent, @ErrorMessage = @MJUserRoutineRuns_AgentRunID_ErrorMessage

        FETCH NEXT FROM cascade_update_MJUserRoutineRuns_AgentRunID_cursor INTO @MJUserRoutineRuns_AgentRunIDID, @MJUserRoutineRuns_AgentRunID_RoutineID, @MJUserRoutineRuns_AgentRunID_StartedAt, @MJUserRoutineRuns_AgentRunID_CompletedAt, @MJUserRoutineRuns_AgentRunID_Status, @MJUserRoutineRuns_AgentRunID_AgentRunID, @MJUserRoutineRuns_AgentRunID_PromptRunID, @MJUserRoutineRuns_AgentRunID_ActionExecutionLogID, @MJUserRoutineRuns_AgentRunID_ResultSummary, @MJUserRoutineRuns_AgentRunID_ResultHash, @MJUserRoutineRuns_AgentRunID_NotificationSent, @MJUserRoutineRuns_AgentRunID_ErrorMessage
    END

    CLOSE cascade_update_MJUserRoutineRuns_AgentRunID_cursor
    DEALLOCATE cascade_update_MJUserRoutineRuns_AgentRunID_cursor
    

    DELETE FROM
        [${flyway:defaultSchema}].[AIAgentRun]
    WHERE
        [ID] = @ID


    -- Check if the delete was successful
    IF @@ROWCOUNT = 0
        SELECT NULL AS [ID] -- Return NULL for all primary key fields to indicate no record was deleted
    ELSE
        SELECT @ID AS [ID] -- Return the primary key values to indicate we successfully deleted the record
END
GO
GRANT EXECUTE ON [${flyway:defaultSchema}].[spDeleteAIAgentRun] TO [cdp_Developer], [cdp_Integration];

/* spDelete Permissions for MJ: AI Agent Runs */

GRANT EXECUTE ON [${flyway:defaultSchema}].[spDeleteAIAgentRun] TO [cdp_Developer], [cdp_Integration];

/* spDelete SQL for MJ: Conversation Details */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Conversation Details
-- Item: spDeleteConversationDetail
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- DELETE PROCEDURE FOR ConversationDetail
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[spDeleteConversationDetail]', 'P') IS NOT NULL
    DROP PROCEDURE [${flyway:defaultSchema}].[spDeleteConversationDetail];
GO

CREATE PROCEDURE [${flyway:defaultSchema}].[spDeleteConversationDetail]
    @ID uniqueidentifier
AS
BEGIN
    SET NOCOUNT ON;
    -- Cascade update on AIAgentExample using cursor to call spUpdateAIAgentExample
    DECLARE @MJAIAgentExamples_SourceConversationDetailIDID uniqueidentifier
    DECLARE @MJAIAgentExamples_SourceConversationDetailID_AgentID uniqueidentifier
    DECLARE @MJAIAgentExamples_SourceConversationDetailID_UserID uniqueidentifier
    DECLARE @MJAIAgentExamples_SourceConversationDetailID_CompanyID uniqueidentifier
    DECLARE @MJAIAgentExamples_SourceConversationDetailID_Type nvarchar(20)
    DECLARE @MJAIAgentExamples_SourceConversationDetailID_ExampleInput nvarchar(MAX)
    DECLARE @MJAIAgentExamples_SourceConversationDetailID_ExampleOutput nvarchar(MAX)
    DECLARE @MJAIAgentExamples_SourceConversationDetailID_IsAutoGenerated bit
    DECLARE @MJAIAgentExamples_SourceConversationDetailID_SourceConversationID uniqueidentifier
    DECLARE @MJAIAgentExamples_SourceConversationDetailID_SourceConversationDetailID uniqueidentifier
    DECLARE @MJAIAgentExamples_SourceConversationDetailID_SourceAIAgentRunID uniqueidentifier
    DECLARE @MJAIAgentExamples_SourceConversationDetailID_SuccessScore decimal(5, 2)
    DECLARE @MJAIAgentExamples_SourceConversationDetailID_Comments nvarchar(MAX)
    DECLARE @MJAIAgentExamples_SourceConversationDetailID_Status nvarchar(20)
    DECLARE @MJAIAgentExamples_SourceConversationDetailID_EmbeddingVector nvarchar(MAX)
    DECLARE @MJAIAgentExamples_SourceConversationDetailID_EmbeddingModelID uniqueidentifier
    DECLARE @MJAIAgentExamples_SourceConversationDetailID_PrimaryScopeEntityID uniqueidentifier
    DECLARE @MJAIAgentExamples_SourceConversationDetailID_PrimaryScopeRecordID nvarchar(100)
    DECLARE @MJAIAgentExamples_SourceConversationDetailID_SecondaryScopes nvarchar(MAX)
    DECLARE @MJAIAgentExamples_SourceConversationDetailID_LastAccessedAt datetimeoffset
    DECLARE @MJAIAgentExamples_SourceConversationDetailID_AccessCount int
    DECLARE @MJAIAgentExamples_SourceConversationDetailID_ExpiresAt datetimeoffset
    DECLARE cascade_update_MJAIAgentExamples_SourceConversationDetailID_cursor CURSOR FOR
        SELECT [ID], [AgentID], [UserID], [CompanyID], [Type], [ExampleInput], [ExampleOutput], [IsAutoGenerated], [SourceConversationID], [SourceConversationDetailID], [SourceAIAgentRunID], [SuccessScore], [Comments], [Status], [EmbeddingVector], [EmbeddingModelID], [PrimaryScopeEntityID], [PrimaryScopeRecordID], [SecondaryScopes], [LastAccessedAt], [AccessCount], [ExpiresAt]
        FROM [${flyway:defaultSchema}].[AIAgentExample]
        WHERE [SourceConversationDetailID] = @ID

    OPEN cascade_update_MJAIAgentExamples_SourceConversationDetailID_cursor
    FETCH NEXT FROM cascade_update_MJAIAgentExamples_SourceConversationDetailID_cursor INTO @MJAIAgentExamples_SourceConversationDetailIDID, @MJAIAgentExamples_SourceConversationDetailID_AgentID, @MJAIAgentExamples_SourceConversationDetailID_UserID, @MJAIAgentExamples_SourceConversationDetailID_CompanyID, @MJAIAgentExamples_SourceConversationDetailID_Type, @MJAIAgentExamples_SourceConversationDetailID_ExampleInput, @MJAIAgentExamples_SourceConversationDetailID_ExampleOutput, @MJAIAgentExamples_SourceConversationDetailID_IsAutoGenerated, @MJAIAgentExamples_SourceConversationDetailID_SourceConversationID, @MJAIAgentExamples_SourceConversationDetailID_SourceConversationDetailID, @MJAIAgentExamples_SourceConversationDetailID_SourceAIAgentRunID, @MJAIAgentExamples_SourceConversationDetailID_SuccessScore, @MJAIAgentExamples_SourceConversationDetailID_Comments, @MJAIAgentExamples_SourceConversationDetailID_Status, @MJAIAgentExamples_SourceConversationDetailID_EmbeddingVector, @MJAIAgentExamples_SourceConversationDetailID_EmbeddingModelID, @MJAIAgentExamples_SourceConversationDetailID_PrimaryScopeEntityID, @MJAIAgentExamples_SourceConversationDetailID_PrimaryScopeRecordID, @MJAIAgentExamples_SourceConversationDetailID_SecondaryScopes, @MJAIAgentExamples_SourceConversationDetailID_LastAccessedAt, @MJAIAgentExamples_SourceConversationDetailID_AccessCount, @MJAIAgentExamples_SourceConversationDetailID_ExpiresAt

    WHILE @@FETCH_STATUS = 0
    BEGIN
        -- Set the FK field to NULL
        SET @MJAIAgentExamples_SourceConversationDetailID_SourceConversationDetailID = NULL

        -- Call the update SP for the related entity
        EXEC [${flyway:defaultSchema}].[spUpdateAIAgentExample] @ID = @MJAIAgentExamples_SourceConversationDetailIDID, @AgentID = @MJAIAgentExamples_SourceConversationDetailID_AgentID, @UserID = @MJAIAgentExamples_SourceConversationDetailID_UserID, @CompanyID = @MJAIAgentExamples_SourceConversationDetailID_CompanyID, @Type = @MJAIAgentExamples_SourceConversationDetailID_Type, @ExampleInput = @MJAIAgentExamples_SourceConversationDetailID_ExampleInput, @ExampleOutput = @MJAIAgentExamples_SourceConversationDetailID_ExampleOutput, @IsAutoGenerated = @MJAIAgentExamples_SourceConversationDetailID_IsAutoGenerated, @SourceConversationID = @MJAIAgentExamples_SourceConversationDetailID_SourceConversationID, @SourceConversationDetailID_Clear = 1, @SourceConversationDetailID = @MJAIAgentExamples_SourceConversationDetailID_SourceConversationDetailID, @SourceAIAgentRunID = @MJAIAgentExamples_SourceConversationDetailID_SourceAIAgentRunID, @SuccessScore = @MJAIAgentExamples_SourceConversationDetailID_SuccessScore, @Comments = @MJAIAgentExamples_SourceConversationDetailID_Comments, @Status = @MJAIAgentExamples_SourceConversationDetailID_Status, @EmbeddingVector = @MJAIAgentExamples_SourceConversationDetailID_EmbeddingVector, @EmbeddingModelID = @MJAIAgentExamples_SourceConversationDetailID_EmbeddingModelID, @PrimaryScopeEntityID = @MJAIAgentExamples_SourceConversationDetailID_PrimaryScopeEntityID, @PrimaryScopeRecordID = @MJAIAgentExamples_SourceConversationDetailID_PrimaryScopeRecordID, @SecondaryScopes = @MJAIAgentExamples_SourceConversationDetailID_SecondaryScopes, @LastAccessedAt = @MJAIAgentExamples_SourceConversationDetailID_LastAccessedAt, @AccessCount = @MJAIAgentExamples_SourceConversationDetailID_AccessCount, @ExpiresAt = @MJAIAgentExamples_SourceConversationDetailID_ExpiresAt

        FETCH NEXT FROM cascade_update_MJAIAgentExamples_SourceConversationDetailID_cursor INTO @MJAIAgentExamples_SourceConversationDetailIDID, @MJAIAgentExamples_SourceConversationDetailID_AgentID, @MJAIAgentExamples_SourceConversationDetailID_UserID, @MJAIAgentExamples_SourceConversationDetailID_CompanyID, @MJAIAgentExamples_SourceConversationDetailID_Type, @MJAIAgentExamples_SourceConversationDetailID_ExampleInput, @MJAIAgentExamples_SourceConversationDetailID_ExampleOutput, @MJAIAgentExamples_SourceConversationDetailID_IsAutoGenerated, @MJAIAgentExamples_SourceConversationDetailID_SourceConversationID, @MJAIAgentExamples_SourceConversationDetailID_SourceConversationDetailID, @MJAIAgentExamples_SourceConversationDetailID_SourceAIAgentRunID, @MJAIAgentExamples_SourceConversationDetailID_SuccessScore, @MJAIAgentExamples_SourceConversationDetailID_Comments, @MJAIAgentExamples_SourceConversationDetailID_Status, @MJAIAgentExamples_SourceConversationDetailID_EmbeddingVector, @MJAIAgentExamples_SourceConversationDetailID_EmbeddingModelID, @MJAIAgentExamples_SourceConversationDetailID_PrimaryScopeEntityID, @MJAIAgentExamples_SourceConversationDetailID_PrimaryScopeRecordID, @MJAIAgentExamples_SourceConversationDetailID_SecondaryScopes, @MJAIAgentExamples_SourceConversationDetailID_LastAccessedAt, @MJAIAgentExamples_SourceConversationDetailID_AccessCount, @MJAIAgentExamples_SourceConversationDetailID_ExpiresAt
    END

    CLOSE cascade_update_MJAIAgentExamples_SourceConversationDetailID_cursor
    DEALLOCATE cascade_update_MJAIAgentExamples_SourceConversationDetailID_cursor
    
    -- Cascade update on AIAgentNote using cursor to call spUpdateAIAgentNote
    DECLARE @MJAIAgentNotes_SourceConversationDetailIDID uniqueidentifier
    DECLARE @MJAIAgentNotes_SourceConversationDetailID_AgentID uniqueidentifier
    DECLARE @MJAIAgentNotes_SourceConversationDetailID_AgentNoteTypeID uniqueidentifier
    DECLARE @MJAIAgentNotes_SourceConversationDetailID_Note nvarchar(MAX)
    DECLARE @MJAIAgentNotes_SourceConversationDetailID_UserID uniqueidentifier
    DECLARE @MJAIAgentNotes_SourceConversationDetailID_Type nvarchar(20)
    DECLARE @MJAIAgentNotes_SourceConversationDetailID_IsAutoGenerated bit
    DECLARE @MJAIAgentNotes_SourceConversationDetailID_Comments nvarchar(MAX)
    DECLARE @MJAIAgentNotes_SourceConversationDetailID_Status nvarchar(20)
    DECLARE @MJAIAgentNotes_SourceConversationDetailID_SourceConversationID uniqueidentifier
    DECLARE @MJAIAgentNotes_SourceConversationDetailID_SourceConversationDetailID uniqueidentifier
    DECLARE @MJAIAgentNotes_SourceConversationDetailID_SourceAIAgentRunID uniqueidentifier
    DECLARE @MJAIAgentNotes_SourceConversationDetailID_CompanyID uniqueidentifier
    DECLARE @MJAIAgentNotes_SourceConversationDetailID_EmbeddingVector nvarchar(MAX)
    DECLARE @MJAIAgentNotes_SourceConversationDetailID_EmbeddingModelID uniqueidentifier
    DECLARE @MJAIAgentNotes_SourceConversationDetailID_PrimaryScopeEntityID uniqueidentifier
    DECLARE @MJAIAgentNotes_SourceConversationDetailID_PrimaryScopeRecordID nvarchar(100)
    DECLARE @MJAIAgentNotes_SourceConversationDetailID_SecondaryScopes nvarchar(MAX)
    DECLARE @MJAIAgentNotes_SourceConversationDetailID_LastAccessedAt datetimeoffset
    DECLARE @MJAIAgentNotes_SourceConversationDetailID_AccessCount int
    DECLARE @MJAIAgentNotes_SourceConversationDetailID_ExpiresAt datetimeoffset
    DECLARE @MJAIAgentNotes_SourceConversationDetailID_ConsolidatedIntoNoteID uniqueidentifier
    DECLARE @MJAIAgentNotes_SourceConversationDetailID_ConsolidationCount int
    DECLARE @MJAIAgentNotes_SourceConversationDetailID_DerivedFromNoteIDs nvarchar(MAX)
    DECLARE @MJAIAgentNotes_SourceConversationDetailID_ProtectionTier nvarchar(20)
    DECLARE @MJAIAgentNotes_SourceConversationDetailID_ImportanceScore decimal(5, 2)
    DECLARE @MJAIAgentNotes_SourceConversationDetailID_AuthorType nvarchar(20)
    DECLARE cascade_update_MJAIAgentNotes_SourceConversationDetailID_cursor CURSOR FOR
        SELECT [ID], [AgentID], [AgentNoteTypeID], [Note], [UserID], [Type], [IsAutoGenerated], [Comments], [Status], [SourceConversationID], [SourceConversationDetailID], [SourceAIAgentRunID], [CompanyID], [EmbeddingVector], [EmbeddingModelID], [PrimaryScopeEntityID], [PrimaryScopeRecordID], [SecondaryScopes], [LastAccessedAt], [AccessCount], [ExpiresAt], [ConsolidatedIntoNoteID], [ConsolidationCount], [DerivedFromNoteIDs], [ProtectionTier], [ImportanceScore], [AuthorType]
        FROM [${flyway:defaultSchema}].[AIAgentNote]
        WHERE [SourceConversationDetailID] = @ID

    OPEN cascade_update_MJAIAgentNotes_SourceConversationDetailID_cursor
    FETCH NEXT FROM cascade_update_MJAIAgentNotes_SourceConversationDetailID_cursor INTO @MJAIAgentNotes_SourceConversationDetailIDID, @MJAIAgentNotes_SourceConversationDetailID_AgentID, @MJAIAgentNotes_SourceConversationDetailID_AgentNoteTypeID, @MJAIAgentNotes_SourceConversationDetailID_Note, @MJAIAgentNotes_SourceConversationDetailID_UserID, @MJAIAgentNotes_SourceConversationDetailID_Type, @MJAIAgentNotes_SourceConversationDetailID_IsAutoGenerated, @MJAIAgentNotes_SourceConversationDetailID_Comments, @MJAIAgentNotes_SourceConversationDetailID_Status, @MJAIAgentNotes_SourceConversationDetailID_SourceConversationID, @MJAIAgentNotes_SourceConversationDetailID_SourceConversationDetailID, @MJAIAgentNotes_SourceConversationDetailID_SourceAIAgentRunID, @MJAIAgentNotes_SourceConversationDetailID_CompanyID, @MJAIAgentNotes_SourceConversationDetailID_EmbeddingVector, @MJAIAgentNotes_SourceConversationDetailID_EmbeddingModelID, @MJAIAgentNotes_SourceConversationDetailID_PrimaryScopeEntityID, @MJAIAgentNotes_SourceConversationDetailID_PrimaryScopeRecordID, @MJAIAgentNotes_SourceConversationDetailID_SecondaryScopes, @MJAIAgentNotes_SourceConversationDetailID_LastAccessedAt, @MJAIAgentNotes_SourceConversationDetailID_AccessCount, @MJAIAgentNotes_SourceConversationDetailID_ExpiresAt, @MJAIAgentNotes_SourceConversationDetailID_ConsolidatedIntoNoteID, @MJAIAgentNotes_SourceConversationDetailID_ConsolidationCount, @MJAIAgentNotes_SourceConversationDetailID_DerivedFromNoteIDs, @MJAIAgentNotes_SourceConversationDetailID_ProtectionTier, @MJAIAgentNotes_SourceConversationDetailID_ImportanceScore, @MJAIAgentNotes_SourceConversationDetailID_AuthorType

    WHILE @@FETCH_STATUS = 0
    BEGIN
        -- Set the FK field to NULL
        SET @MJAIAgentNotes_SourceConversationDetailID_SourceConversationDetailID = NULL

        -- Call the update SP for the related entity
        EXEC [${flyway:defaultSchema}].[spUpdateAIAgentNote] @ID = @MJAIAgentNotes_SourceConversationDetailIDID, @AgentID = @MJAIAgentNotes_SourceConversationDetailID_AgentID, @AgentNoteTypeID = @MJAIAgentNotes_SourceConversationDetailID_AgentNoteTypeID, @Note = @MJAIAgentNotes_SourceConversationDetailID_Note, @UserID = @MJAIAgentNotes_SourceConversationDetailID_UserID, @Type = @MJAIAgentNotes_SourceConversationDetailID_Type, @IsAutoGenerated = @MJAIAgentNotes_SourceConversationDetailID_IsAutoGenerated, @Comments = @MJAIAgentNotes_SourceConversationDetailID_Comments, @Status = @MJAIAgentNotes_SourceConversationDetailID_Status, @SourceConversationID = @MJAIAgentNotes_SourceConversationDetailID_SourceConversationID, @SourceConversationDetailID_Clear = 1, @SourceConversationDetailID = @MJAIAgentNotes_SourceConversationDetailID_SourceConversationDetailID, @SourceAIAgentRunID = @MJAIAgentNotes_SourceConversationDetailID_SourceAIAgentRunID, @CompanyID = @MJAIAgentNotes_SourceConversationDetailID_CompanyID, @EmbeddingVector = @MJAIAgentNotes_SourceConversationDetailID_EmbeddingVector, @EmbeddingModelID = @MJAIAgentNotes_SourceConversationDetailID_EmbeddingModelID, @PrimaryScopeEntityID = @MJAIAgentNotes_SourceConversationDetailID_PrimaryScopeEntityID, @PrimaryScopeRecordID = @MJAIAgentNotes_SourceConversationDetailID_PrimaryScopeRecordID, @SecondaryScopes = @MJAIAgentNotes_SourceConversationDetailID_SecondaryScopes, @LastAccessedAt = @MJAIAgentNotes_SourceConversationDetailID_LastAccessedAt, @AccessCount = @MJAIAgentNotes_SourceConversationDetailID_AccessCount, @ExpiresAt = @MJAIAgentNotes_SourceConversationDetailID_ExpiresAt, @ConsolidatedIntoNoteID = @MJAIAgentNotes_SourceConversationDetailID_ConsolidatedIntoNoteID, @ConsolidationCount = @MJAIAgentNotes_SourceConversationDetailID_ConsolidationCount, @DerivedFromNoteIDs = @MJAIAgentNotes_SourceConversationDetailID_DerivedFromNoteIDs, @ProtectionTier = @MJAIAgentNotes_SourceConversationDetailID_ProtectionTier, @ImportanceScore = @MJAIAgentNotes_SourceConversationDetailID_ImportanceScore, @AuthorType = @MJAIAgentNotes_SourceConversationDetailID_AuthorType

        FETCH NEXT FROM cascade_update_MJAIAgentNotes_SourceConversationDetailID_cursor INTO @MJAIAgentNotes_SourceConversationDetailIDID, @MJAIAgentNotes_SourceConversationDetailID_AgentID, @MJAIAgentNotes_SourceConversationDetailID_AgentNoteTypeID, @MJAIAgentNotes_SourceConversationDetailID_Note, @MJAIAgentNotes_SourceConversationDetailID_UserID, @MJAIAgentNotes_SourceConversationDetailID_Type, @MJAIAgentNotes_SourceConversationDetailID_IsAutoGenerated, @MJAIAgentNotes_SourceConversationDetailID_Comments, @MJAIAgentNotes_SourceConversationDetailID_Status, @MJAIAgentNotes_SourceConversationDetailID_SourceConversationID, @MJAIAgentNotes_SourceConversationDetailID_SourceConversationDetailID, @MJAIAgentNotes_SourceConversationDetailID_SourceAIAgentRunID, @MJAIAgentNotes_SourceConversationDetailID_CompanyID, @MJAIAgentNotes_SourceConversationDetailID_EmbeddingVector, @MJAIAgentNotes_SourceConversationDetailID_EmbeddingModelID, @MJAIAgentNotes_SourceConversationDetailID_PrimaryScopeEntityID, @MJAIAgentNotes_SourceConversationDetailID_PrimaryScopeRecordID, @MJAIAgentNotes_SourceConversationDetailID_SecondaryScopes, @MJAIAgentNotes_SourceConversationDetailID_LastAccessedAt, @MJAIAgentNotes_SourceConversationDetailID_AccessCount, @MJAIAgentNotes_SourceConversationDetailID_ExpiresAt, @MJAIAgentNotes_SourceConversationDetailID_ConsolidatedIntoNoteID, @MJAIAgentNotes_SourceConversationDetailID_ConsolidationCount, @MJAIAgentNotes_SourceConversationDetailID_DerivedFromNoteIDs, @MJAIAgentNotes_SourceConversationDetailID_ProtectionTier, @MJAIAgentNotes_SourceConversationDetailID_ImportanceScore, @MJAIAgentNotes_SourceConversationDetailID_AuthorType
    END

    CLOSE cascade_update_MJAIAgentNotes_SourceConversationDetailID_cursor
    DEALLOCATE cascade_update_MJAIAgentNotes_SourceConversationDetailID_cursor
    
    -- Cascade update on AIAgentRun using cursor to call spUpdateAIAgentRun
    DECLARE @MJAIAgentRuns_ConversationDetailIDID uniqueidentifier
    DECLARE @MJAIAgentRuns_ConversationDetailID_AgentID uniqueidentifier
    DECLARE @MJAIAgentRuns_ConversationDetailID_ParentRunID uniqueidentifier
    DECLARE @MJAIAgentRuns_ConversationDetailID_Status nvarchar(50)
    DECLARE @MJAIAgentRuns_ConversationDetailID_StartedAt datetimeoffset
    DECLARE @MJAIAgentRuns_ConversationDetailID_CompletedAt datetimeoffset
    DECLARE @MJAIAgentRuns_ConversationDetailID_Success bit
    DECLARE @MJAIAgentRuns_ConversationDetailID_ErrorMessage nvarchar(MAX)
    DECLARE @MJAIAgentRuns_ConversationDetailID_ConversationID uniqueidentifier
    DECLARE @MJAIAgentRuns_ConversationDetailID_UserID uniqueidentifier
    DECLARE @MJAIAgentRuns_ConversationDetailID_Result nvarchar(MAX)
    DECLARE @MJAIAgentRuns_ConversationDetailID_AgentState nvarchar(MAX)
    DECLARE @MJAIAgentRuns_ConversationDetailID_TotalTokensUsed int
    DECLARE @MJAIAgentRuns_ConversationDetailID_TotalCost decimal(18, 6)
    DECLARE @MJAIAgentRuns_ConversationDetailID_TotalPromptTokensUsed int
    DECLARE @MJAIAgentRuns_ConversationDetailID_TotalCompletionTokensUsed int
    DECLARE @MJAIAgentRuns_ConversationDetailID_TotalTokensUsedRollup int
    DECLARE @MJAIAgentRuns_ConversationDetailID_TotalPromptTokensUsedRollup int
    DECLARE @MJAIAgentRuns_ConversationDetailID_TotalCompletionTokensUsedRollup int
    DECLARE @MJAIAgentRuns_ConversationDetailID_TotalCostRollup decimal(19, 8)
    DECLARE @MJAIAgentRuns_ConversationDetailID_ConversationDetailID uniqueidentifier
    DECLARE @MJAIAgentRuns_ConversationDetailID_ConversationDetailSequence int
    DECLARE @MJAIAgentRuns_ConversationDetailID_CancellationReason nvarchar(30)
    DECLARE @MJAIAgentRuns_ConversationDetailID_FinalStep nvarchar(30)
    DECLARE @MJAIAgentRuns_ConversationDetailID_FinalPayload nvarchar(MAX)
    DECLARE @MJAIAgentRuns_ConversationDetailID_Message nvarchar(MAX)
    DECLARE @MJAIAgentRuns_ConversationDetailID_LastRunID uniqueidentifier
    DECLARE @MJAIAgentRuns_ConversationDetailID_StartingPayload nvarchar(MAX)
    DECLARE @MJAIAgentRuns_ConversationDetailID_TotalPromptIterations int
    DECLARE @MJAIAgentRuns_ConversationDetailID_ConfigurationID uniqueidentifier
    DECLARE @MJAIAgentRuns_ConversationDetailID_OverrideModelID uniqueidentifier
    DECLARE @MJAIAgentRuns_ConversationDetailID_OverrideVendorID uniqueidentifier
    DECLARE @MJAIAgentRuns_ConversationDetailID_Data nvarchar(MAX)
    DECLARE @MJAIAgentRuns_ConversationDetailID_Verbose bit
    DECLARE @MJAIAgentRuns_ConversationDetailID_EffortLevel int
    DECLARE @MJAIAgentRuns_ConversationDetailID_RunName nvarchar(255)
    DECLARE @MJAIAgentRuns_ConversationDetailID_Comments nvarchar(MAX)
    DECLARE @MJAIAgentRuns_ConversationDetailID_ScheduledJobRunID uniqueidentifier
    DECLARE @MJAIAgentRuns_ConversationDetailID_TestRunID uniqueidentifier
    DECLARE @MJAIAgentRuns_ConversationDetailID_PrimaryScopeEntityID uniqueidentifier
    DECLARE @MJAIAgentRuns_ConversationDetailID_PrimaryScopeRecordID nvarchar(100)
    DECLARE @MJAIAgentRuns_ConversationDetailID_SecondaryScopes nvarchar(MAX)
    DECLARE @MJAIAgentRuns_ConversationDetailID_ExternalReferenceID nvarchar(200)
    DECLARE @MJAIAgentRuns_ConversationDetailID_CompanyID uniqueidentifier
    DECLARE @MJAIAgentRuns_ConversationDetailID_TotalCacheReadTokensUsed int
    DECLARE @MJAIAgentRuns_ConversationDetailID_TotalCacheWriteTokensUsed int
    DECLARE @MJAIAgentRuns_ConversationDetailID_LastHeartbeatAt datetimeoffset
    DECLARE @MJAIAgentRuns_ConversationDetailID_AgentSessionID uniqueidentifier
    DECLARE @MJAIAgentRuns_ConversationDetailID_PlanMode bit
    DECLARE @MJAIAgentRuns_ConversationDetailID_ExternalSessionID nvarchar(255)
    DECLARE @MJAIAgentRuns_ConversationDetailID_ContinuationDepth int
    DECLARE cascade_update_MJAIAgentRuns_ConversationDetailID_cursor CURSOR FOR
        SELECT [ID], [AgentID], [ParentRunID], [Status], [StartedAt], [CompletedAt], [Success], [ErrorMessage], [ConversationID], [UserID], [Result], [AgentState], [TotalTokensUsed], [TotalCost], [TotalPromptTokensUsed], [TotalCompletionTokensUsed], [TotalTokensUsedRollup], [TotalPromptTokensUsedRollup], [TotalCompletionTokensUsedRollup], [TotalCostRollup], [ConversationDetailID], [ConversationDetailSequence], [CancellationReason], [FinalStep], [FinalPayload], [Message], [LastRunID], [StartingPayload], [TotalPromptIterations], [ConfigurationID], [OverrideModelID], [OverrideVendorID], [Data], [Verbose], [EffortLevel], [RunName], [Comments], [ScheduledJobRunID], [TestRunID], [PrimaryScopeEntityID], [PrimaryScopeRecordID], [SecondaryScopes], [ExternalReferenceID], [CompanyID], [TotalCacheReadTokensUsed], [TotalCacheWriteTokensUsed], [LastHeartbeatAt], [AgentSessionID], [PlanMode], [ExternalSessionID], [ContinuationDepth]
        FROM [${flyway:defaultSchema}].[AIAgentRun]
        WHERE [ConversationDetailID] = @ID

    OPEN cascade_update_MJAIAgentRuns_ConversationDetailID_cursor
    FETCH NEXT FROM cascade_update_MJAIAgentRuns_ConversationDetailID_cursor INTO @MJAIAgentRuns_ConversationDetailIDID, @MJAIAgentRuns_ConversationDetailID_AgentID, @MJAIAgentRuns_ConversationDetailID_ParentRunID, @MJAIAgentRuns_ConversationDetailID_Status, @MJAIAgentRuns_ConversationDetailID_StartedAt, @MJAIAgentRuns_ConversationDetailID_CompletedAt, @MJAIAgentRuns_ConversationDetailID_Success, @MJAIAgentRuns_ConversationDetailID_ErrorMessage, @MJAIAgentRuns_ConversationDetailID_ConversationID, @MJAIAgentRuns_ConversationDetailID_UserID, @MJAIAgentRuns_ConversationDetailID_Result, @MJAIAgentRuns_ConversationDetailID_AgentState, @MJAIAgentRuns_ConversationDetailID_TotalTokensUsed, @MJAIAgentRuns_ConversationDetailID_TotalCost, @MJAIAgentRuns_ConversationDetailID_TotalPromptTokensUsed, @MJAIAgentRuns_ConversationDetailID_TotalCompletionTokensUsed, @MJAIAgentRuns_ConversationDetailID_TotalTokensUsedRollup, @MJAIAgentRuns_ConversationDetailID_TotalPromptTokensUsedRollup, @MJAIAgentRuns_ConversationDetailID_TotalCompletionTokensUsedRollup, @MJAIAgentRuns_ConversationDetailID_TotalCostRollup, @MJAIAgentRuns_ConversationDetailID_ConversationDetailID, @MJAIAgentRuns_ConversationDetailID_ConversationDetailSequence, @MJAIAgentRuns_ConversationDetailID_CancellationReason, @MJAIAgentRuns_ConversationDetailID_FinalStep, @MJAIAgentRuns_ConversationDetailID_FinalPayload, @MJAIAgentRuns_ConversationDetailID_Message, @MJAIAgentRuns_ConversationDetailID_LastRunID, @MJAIAgentRuns_ConversationDetailID_StartingPayload, @MJAIAgentRuns_ConversationDetailID_TotalPromptIterations, @MJAIAgentRuns_ConversationDetailID_ConfigurationID, @MJAIAgentRuns_ConversationDetailID_OverrideModelID, @MJAIAgentRuns_ConversationDetailID_OverrideVendorID, @MJAIAgentRuns_ConversationDetailID_Data, @MJAIAgentRuns_ConversationDetailID_Verbose, @MJAIAgentRuns_ConversationDetailID_EffortLevel, @MJAIAgentRuns_ConversationDetailID_RunName, @MJAIAgentRuns_ConversationDetailID_Comments, @MJAIAgentRuns_ConversationDetailID_ScheduledJobRunID, @MJAIAgentRuns_ConversationDetailID_TestRunID, @MJAIAgentRuns_ConversationDetailID_PrimaryScopeEntityID, @MJAIAgentRuns_ConversationDetailID_PrimaryScopeRecordID, @MJAIAgentRuns_ConversationDetailID_SecondaryScopes, @MJAIAgentRuns_ConversationDetailID_ExternalReferenceID, @MJAIAgentRuns_ConversationDetailID_CompanyID, @MJAIAgentRuns_ConversationDetailID_TotalCacheReadTokensUsed, @MJAIAgentRuns_ConversationDetailID_TotalCacheWriteTokensUsed, @MJAIAgentRuns_ConversationDetailID_LastHeartbeatAt, @MJAIAgentRuns_ConversationDetailID_AgentSessionID, @MJAIAgentRuns_ConversationDetailID_PlanMode, @MJAIAgentRuns_ConversationDetailID_ExternalSessionID, @MJAIAgentRuns_ConversationDetailID_ContinuationDepth

    WHILE @@FETCH_STATUS = 0
    BEGIN
        -- Set the FK field to NULL
        SET @MJAIAgentRuns_ConversationDetailID_ConversationDetailID = NULL

        -- Call the update SP for the related entity
        EXEC [${flyway:defaultSchema}].[spUpdateAIAgentRun] @ID = @MJAIAgentRuns_ConversationDetailIDID, @AgentID = @MJAIAgentRuns_ConversationDetailID_AgentID, @ParentRunID = @MJAIAgentRuns_ConversationDetailID_ParentRunID, @Status = @MJAIAgentRuns_ConversationDetailID_Status, @StartedAt = @MJAIAgentRuns_ConversationDetailID_StartedAt, @CompletedAt = @MJAIAgentRuns_ConversationDetailID_CompletedAt, @Success = @MJAIAgentRuns_ConversationDetailID_Success, @ErrorMessage = @MJAIAgentRuns_ConversationDetailID_ErrorMessage, @ConversationID = @MJAIAgentRuns_ConversationDetailID_ConversationID, @UserID = @MJAIAgentRuns_ConversationDetailID_UserID, @Result = @MJAIAgentRuns_ConversationDetailID_Result, @AgentState = @MJAIAgentRuns_ConversationDetailID_AgentState, @TotalTokensUsed = @MJAIAgentRuns_ConversationDetailID_TotalTokensUsed, @TotalCost = @MJAIAgentRuns_ConversationDetailID_TotalCost, @TotalPromptTokensUsed = @MJAIAgentRuns_ConversationDetailID_TotalPromptTokensUsed, @TotalCompletionTokensUsed = @MJAIAgentRuns_ConversationDetailID_TotalCompletionTokensUsed, @TotalTokensUsedRollup = @MJAIAgentRuns_ConversationDetailID_TotalTokensUsedRollup, @TotalPromptTokensUsedRollup = @MJAIAgentRuns_ConversationDetailID_TotalPromptTokensUsedRollup, @TotalCompletionTokensUsedRollup = @MJAIAgentRuns_ConversationDetailID_TotalCompletionTokensUsedRollup, @TotalCostRollup = @MJAIAgentRuns_ConversationDetailID_TotalCostRollup, @ConversationDetailID_Clear = 1, @ConversationDetailID = @MJAIAgentRuns_ConversationDetailID_ConversationDetailID, @ConversationDetailSequence = @MJAIAgentRuns_ConversationDetailID_ConversationDetailSequence, @CancellationReason = @MJAIAgentRuns_ConversationDetailID_CancellationReason, @FinalStep = @MJAIAgentRuns_ConversationDetailID_FinalStep, @FinalPayload = @MJAIAgentRuns_ConversationDetailID_FinalPayload, @Message = @MJAIAgentRuns_ConversationDetailID_Message, @LastRunID = @MJAIAgentRuns_ConversationDetailID_LastRunID, @StartingPayload = @MJAIAgentRuns_ConversationDetailID_StartingPayload, @TotalPromptIterations = @MJAIAgentRuns_ConversationDetailID_TotalPromptIterations, @ConfigurationID = @MJAIAgentRuns_ConversationDetailID_ConfigurationID, @OverrideModelID = @MJAIAgentRuns_ConversationDetailID_OverrideModelID, @OverrideVendorID = @MJAIAgentRuns_ConversationDetailID_OverrideVendorID, @Data = @MJAIAgentRuns_ConversationDetailID_Data, @Verbose = @MJAIAgentRuns_ConversationDetailID_Verbose, @EffortLevel = @MJAIAgentRuns_ConversationDetailID_EffortLevel, @RunName = @MJAIAgentRuns_ConversationDetailID_RunName, @Comments = @MJAIAgentRuns_ConversationDetailID_Comments, @ScheduledJobRunID = @MJAIAgentRuns_ConversationDetailID_ScheduledJobRunID, @TestRunID = @MJAIAgentRuns_ConversationDetailID_TestRunID, @PrimaryScopeEntityID = @MJAIAgentRuns_ConversationDetailID_PrimaryScopeEntityID, @PrimaryScopeRecordID = @MJAIAgentRuns_ConversationDetailID_PrimaryScopeRecordID, @SecondaryScopes = @MJAIAgentRuns_ConversationDetailID_SecondaryScopes, @ExternalReferenceID = @MJAIAgentRuns_ConversationDetailID_ExternalReferenceID, @CompanyID = @MJAIAgentRuns_ConversationDetailID_CompanyID, @TotalCacheReadTokensUsed = @MJAIAgentRuns_ConversationDetailID_TotalCacheReadTokensUsed, @TotalCacheWriteTokensUsed = @MJAIAgentRuns_ConversationDetailID_TotalCacheWriteTokensUsed, @LastHeartbeatAt = @MJAIAgentRuns_ConversationDetailID_LastHeartbeatAt, @AgentSessionID = @MJAIAgentRuns_ConversationDetailID_AgentSessionID, @PlanMode = @MJAIAgentRuns_ConversationDetailID_PlanMode, @ExternalSessionID = @MJAIAgentRuns_ConversationDetailID_ExternalSessionID, @ContinuationDepth = @MJAIAgentRuns_ConversationDetailID_ContinuationDepth

        FETCH NEXT FROM cascade_update_MJAIAgentRuns_ConversationDetailID_cursor INTO @MJAIAgentRuns_ConversationDetailIDID, @MJAIAgentRuns_ConversationDetailID_AgentID, @MJAIAgentRuns_ConversationDetailID_ParentRunID, @MJAIAgentRuns_ConversationDetailID_Status, @MJAIAgentRuns_ConversationDetailID_StartedAt, @MJAIAgentRuns_ConversationDetailID_CompletedAt, @MJAIAgentRuns_ConversationDetailID_Success, @MJAIAgentRuns_ConversationDetailID_ErrorMessage, @MJAIAgentRuns_ConversationDetailID_ConversationID, @MJAIAgentRuns_ConversationDetailID_UserID, @MJAIAgentRuns_ConversationDetailID_Result, @MJAIAgentRuns_ConversationDetailID_AgentState, @MJAIAgentRuns_ConversationDetailID_TotalTokensUsed, @MJAIAgentRuns_ConversationDetailID_TotalCost, @MJAIAgentRuns_ConversationDetailID_TotalPromptTokensUsed, @MJAIAgentRuns_ConversationDetailID_TotalCompletionTokensUsed, @MJAIAgentRuns_ConversationDetailID_TotalTokensUsedRollup, @MJAIAgentRuns_ConversationDetailID_TotalPromptTokensUsedRollup, @MJAIAgentRuns_ConversationDetailID_TotalCompletionTokensUsedRollup, @MJAIAgentRuns_ConversationDetailID_TotalCostRollup, @MJAIAgentRuns_ConversationDetailID_ConversationDetailID, @MJAIAgentRuns_ConversationDetailID_ConversationDetailSequence, @MJAIAgentRuns_ConversationDetailID_CancellationReason, @MJAIAgentRuns_ConversationDetailID_FinalStep, @MJAIAgentRuns_ConversationDetailID_FinalPayload, @MJAIAgentRuns_ConversationDetailID_Message, @MJAIAgentRuns_ConversationDetailID_LastRunID, @MJAIAgentRuns_ConversationDetailID_StartingPayload, @MJAIAgentRuns_ConversationDetailID_TotalPromptIterations, @MJAIAgentRuns_ConversationDetailID_ConfigurationID, @MJAIAgentRuns_ConversationDetailID_OverrideModelID, @MJAIAgentRuns_ConversationDetailID_OverrideVendorID, @MJAIAgentRuns_ConversationDetailID_Data, @MJAIAgentRuns_ConversationDetailID_Verbose, @MJAIAgentRuns_ConversationDetailID_EffortLevel, @MJAIAgentRuns_ConversationDetailID_RunName, @MJAIAgentRuns_ConversationDetailID_Comments, @MJAIAgentRuns_ConversationDetailID_ScheduledJobRunID, @MJAIAgentRuns_ConversationDetailID_TestRunID, @MJAIAgentRuns_ConversationDetailID_PrimaryScopeEntityID, @MJAIAgentRuns_ConversationDetailID_PrimaryScopeRecordID, @MJAIAgentRuns_ConversationDetailID_SecondaryScopes, @MJAIAgentRuns_ConversationDetailID_ExternalReferenceID, @MJAIAgentRuns_ConversationDetailID_CompanyID, @MJAIAgentRuns_ConversationDetailID_TotalCacheReadTokensUsed, @MJAIAgentRuns_ConversationDetailID_TotalCacheWriteTokensUsed, @MJAIAgentRuns_ConversationDetailID_LastHeartbeatAt, @MJAIAgentRuns_ConversationDetailID_AgentSessionID, @MJAIAgentRuns_ConversationDetailID_PlanMode, @MJAIAgentRuns_ConversationDetailID_ExternalSessionID, @MJAIAgentRuns_ConversationDetailID_ContinuationDepth
    END

    CLOSE cascade_update_MJAIAgentRuns_ConversationDetailID_cursor
    DEALLOCATE cascade_update_MJAIAgentRuns_ConversationDetailID_cursor
    
    -- Cascade delete from ConversationCompactionRun using cursor to call spDeleteConversationCompactionRun
    DECLARE @MJConversationCompactionRuns_ConversationDetailIDID uniqueidentifier
    DECLARE cascade_delete_MJConversationCompactionRuns_ConversationDetailID_cursor CURSOR FOR 
        SELECT [ID]
        FROM [${flyway:defaultSchema}].[ConversationCompactionRun]
        WHERE [ConversationDetailID] = @ID
    
    OPEN cascade_delete_MJConversationCompactionRuns_ConversationDetailID_cursor
    FETCH NEXT FROM cascade_delete_MJConversationCompactionRuns_ConversationDetailID_cursor INTO @MJConversationCompactionRuns_ConversationDetailIDID
    
    WHILE @@FETCH_STATUS = 0
    BEGIN
        EXEC [${flyway:defaultSchema}].[spDeleteConversationCompactionRun] @ID = @MJConversationCompactionRuns_ConversationDetailIDID
        
        FETCH NEXT FROM cascade_delete_MJConversationCompactionRuns_ConversationDetailID_cursor INTO @MJConversationCompactionRuns_ConversationDetailIDID
    END
    
    CLOSE cascade_delete_MJConversationCompactionRuns_ConversationDetailID_cursor
    DEALLOCATE cascade_delete_MJConversationCompactionRuns_ConversationDetailID_cursor
    
    -- Cascade delete from ConversationDetailArtifact using cursor to call spDeleteConversationDetailArtifact
    DECLARE @MJConversationDetailArtifacts_ConversationDetailIDID uniqueidentifier
    DECLARE cascade_delete_MJConversationDetailArtifacts_ConversationDetailID_cursor CURSOR FOR 
        SELECT [ID]
        FROM [${flyway:defaultSchema}].[ConversationDetailArtifact]
        WHERE [ConversationDetailID] = @ID
    
    OPEN cascade_delete_MJConversationDetailArtifacts_ConversationDetailID_cursor
    FETCH NEXT FROM cascade_delete_MJConversationDetailArtifacts_ConversationDetailID_cursor INTO @MJConversationDetailArtifacts_ConversationDetailIDID
    
    WHILE @@FETCH_STATUS = 0
    BEGIN
        EXEC [${flyway:defaultSchema}].[spDeleteConversationDetailArtifact] @ID = @MJConversationDetailArtifacts_ConversationDetailIDID
        
        FETCH NEXT FROM cascade_delete_MJConversationDetailArtifacts_ConversationDetailID_cursor INTO @MJConversationDetailArtifacts_ConversationDetailIDID
    END
    
    CLOSE cascade_delete_MJConversationDetailArtifacts_ConversationDetailID_cursor
    DEALLOCATE cascade_delete_MJConversationDetailArtifacts_ConversationDetailID_cursor
    
    -- Cascade delete from ConversationDetailAttachment using cursor to call spDeleteConversationDetailAttachment
    DECLARE @MJConversationDetailAttachments_ConversationDetailIDID uniqueidentifier
    DECLARE cascade_delete_MJConversationDetailAttachments_ConversationDetailID_cursor CURSOR FOR 
        SELECT [ID]
        FROM [${flyway:defaultSchema}].[ConversationDetailAttachment]
        WHERE [ConversationDetailID] = @ID
    
    OPEN cascade_delete_MJConversationDetailAttachments_ConversationDetailID_cursor
    FETCH NEXT FROM cascade_delete_MJConversationDetailAttachments_ConversationDetailID_cursor INTO @MJConversationDetailAttachments_ConversationDetailIDID
    
    WHILE @@FETCH_STATUS = 0
    BEGIN
        EXEC [${flyway:defaultSchema}].[spDeleteConversationDetailAttachment] @ID = @MJConversationDetailAttachments_ConversationDetailIDID
        
        FETCH NEXT FROM cascade_delete_MJConversationDetailAttachments_ConversationDetailID_cursor INTO @MJConversationDetailAttachments_ConversationDetailIDID
    END
    
    CLOSE cascade_delete_MJConversationDetailAttachments_ConversationDetailID_cursor
    DEALLOCATE cascade_delete_MJConversationDetailAttachments_ConversationDetailID_cursor
    
    -- Cascade delete from ConversationDetailRating using cursor to call spDeleteConversationDetailRating
    DECLARE @MJConversationDetailRatings_ConversationDetailIDID uniqueidentifier
    DECLARE cascade_delete_MJConversationDetailRatings_ConversationDetailID_cursor CURSOR FOR 
        SELECT [ID]
        FROM [${flyway:defaultSchema}].[ConversationDetailRating]
        WHERE [ConversationDetailID] = @ID
    
    OPEN cascade_delete_MJConversationDetailRatings_ConversationDetailID_cursor
    FETCH NEXT FROM cascade_delete_MJConversationDetailRatings_ConversationDetailID_cursor INTO @MJConversationDetailRatings_ConversationDetailIDID
    
    WHILE @@FETCH_STATUS = 0
    BEGIN
        EXEC [${flyway:defaultSchema}].[spDeleteConversationDetailRating] @ID = @MJConversationDetailRatings_ConversationDetailIDID
        
        FETCH NEXT FROM cascade_delete_MJConversationDetailRatings_ConversationDetailID_cursor INTO @MJConversationDetailRatings_ConversationDetailIDID
    END
    
    CLOSE cascade_delete_MJConversationDetailRatings_ConversationDetailID_cursor
    DEALLOCATE cascade_delete_MJConversationDetailRatings_ConversationDetailID_cursor
    
    -- Cascade update on ConversationDetail using cursor to call spUpdateConversationDetail
    DECLARE @MJConversationDetails_ParentIDID uniqueidentifier
    DECLARE @MJConversationDetails_ParentID_ConversationID uniqueidentifier
    DECLARE @MJConversationDetails_ParentID_ExternalID nvarchar(100)
    DECLARE @MJConversationDetails_ParentID_Role nvarchar(20)
    DECLARE @MJConversationDetails_ParentID_Message nvarchar(MAX)
    DECLARE @MJConversationDetails_ParentID_Error nvarchar(MAX)
    DECLARE @MJConversationDetails_ParentID_HiddenToUser bit
    DECLARE @MJConversationDetails_ParentID_UserRating int
    DECLARE @MJConversationDetails_ParentID_UserFeedback nvarchar(MAX)
    DECLARE @MJConversationDetails_ParentID_ReflectionInsights nvarchar(MAX)
    DECLARE @MJConversationDetails_ParentID_SummaryOfEarlierConversation nvarchar(MAX)
    DECLARE @MJConversationDetails_ParentID_UserID uniqueidentifier
    DECLARE @MJConversationDetails_ParentID_ArtifactID uniqueidentifier
    DECLARE @MJConversationDetails_ParentID_ArtifactVersionID uniqueidentifier
    DECLARE @MJConversationDetails_ParentID_CompletionTime bigint
    DECLARE @MJConversationDetails_ParentID_IsPinned bit
    DECLARE @MJConversationDetails_ParentID_ParentID uniqueidentifier
    DECLARE @MJConversationDetails_ParentID_AgentID uniqueidentifier
    DECLARE @MJConversationDetails_ParentID_Status nvarchar(20)
    DECLARE @MJConversationDetails_ParentID_SuggestedResponses nvarchar(MAX)
    DECLARE @MJConversationDetails_ParentID_TestRunID uniqueidentifier
    DECLARE @MJConversationDetails_ParentID_ResponseForm nvarchar(MAX)
    DECLARE @MJConversationDetails_ParentID_ActionableCommands nvarchar(MAX)
    DECLARE @MJConversationDetails_ParentID_AutomaticCommands nvarchar(MAX)
    DECLARE @MJConversationDetails_ParentID_OriginalMessageChanged bit
    DECLARE @MJConversationDetails_ParentID_AgentSessionID uniqueidentifier
    DECLARE @MJConversationDetails_ParentID_TurnEndedAt datetimeoffset
    DECLARE @MJConversationDetails_ParentID_UtteranceStartMs int
    DECLARE @MJConversationDetails_ParentID_UtteranceEndMs int
    DECLARE @MJConversationDetails_ParentID_MediaType nvarchar(20)
    DECLARE cascade_update_MJConversationDetails_ParentID_cursor CURSOR FOR
        SELECT [ID], [ConversationID], [ExternalID], [Role], [Message], [Error], [HiddenToUser], [UserRating], [UserFeedback], [ReflectionInsights], [SummaryOfEarlierConversation], [UserID], [ArtifactID], [ArtifactVersionID], [CompletionTime], [IsPinned], [ParentID], [AgentID], [Status], [SuggestedResponses], [TestRunID], [ResponseForm], [ActionableCommands], [AutomaticCommands], [OriginalMessageChanged], [AgentSessionID], [TurnEndedAt], [UtteranceStartMs], [UtteranceEndMs], [MediaType]
        FROM [${flyway:defaultSchema}].[ConversationDetail]
        WHERE [ParentID] = @ID

    OPEN cascade_update_MJConversationDetails_ParentID_cursor
    FETCH NEXT FROM cascade_update_MJConversationDetails_ParentID_cursor INTO @MJConversationDetails_ParentIDID, @MJConversationDetails_ParentID_ConversationID, @MJConversationDetails_ParentID_ExternalID, @MJConversationDetails_ParentID_Role, @MJConversationDetails_ParentID_Message, @MJConversationDetails_ParentID_Error, @MJConversationDetails_ParentID_HiddenToUser, @MJConversationDetails_ParentID_UserRating, @MJConversationDetails_ParentID_UserFeedback, @MJConversationDetails_ParentID_ReflectionInsights, @MJConversationDetails_ParentID_SummaryOfEarlierConversation, @MJConversationDetails_ParentID_UserID, @MJConversationDetails_ParentID_ArtifactID, @MJConversationDetails_ParentID_ArtifactVersionID, @MJConversationDetails_ParentID_CompletionTime, @MJConversationDetails_ParentID_IsPinned, @MJConversationDetails_ParentID_ParentID, @MJConversationDetails_ParentID_AgentID, @MJConversationDetails_ParentID_Status, @MJConversationDetails_ParentID_SuggestedResponses, @MJConversationDetails_ParentID_TestRunID, @MJConversationDetails_ParentID_ResponseForm, @MJConversationDetails_ParentID_ActionableCommands, @MJConversationDetails_ParentID_AutomaticCommands, @MJConversationDetails_ParentID_OriginalMessageChanged, @MJConversationDetails_ParentID_AgentSessionID, @MJConversationDetails_ParentID_TurnEndedAt, @MJConversationDetails_ParentID_UtteranceStartMs, @MJConversationDetails_ParentID_UtteranceEndMs, @MJConversationDetails_ParentID_MediaType

    WHILE @@FETCH_STATUS = 0
    BEGIN
        -- Set the FK field to NULL
        SET @MJConversationDetails_ParentID_ParentID = NULL

        -- Call the update SP for the related entity
        EXEC [${flyway:defaultSchema}].[spUpdateConversationDetail] @ID = @MJConversationDetails_ParentIDID, @ConversationID = @MJConversationDetails_ParentID_ConversationID, @ExternalID = @MJConversationDetails_ParentID_ExternalID, @Role = @MJConversationDetails_ParentID_Role, @Message = @MJConversationDetails_ParentID_Message, @Error = @MJConversationDetails_ParentID_Error, @HiddenToUser = @MJConversationDetails_ParentID_HiddenToUser, @UserRating = @MJConversationDetails_ParentID_UserRating, @UserFeedback = @MJConversationDetails_ParentID_UserFeedback, @ReflectionInsights = @MJConversationDetails_ParentID_ReflectionInsights, @SummaryOfEarlierConversation = @MJConversationDetails_ParentID_SummaryOfEarlierConversation, @UserID = @MJConversationDetails_ParentID_UserID, @ArtifactID = @MJConversationDetails_ParentID_ArtifactID, @ArtifactVersionID = @MJConversationDetails_ParentID_ArtifactVersionID, @CompletionTime = @MJConversationDetails_ParentID_CompletionTime, @IsPinned = @MJConversationDetails_ParentID_IsPinned, @ParentID_Clear = 1, @ParentID = @MJConversationDetails_ParentID_ParentID, @AgentID = @MJConversationDetails_ParentID_AgentID, @Status = @MJConversationDetails_ParentID_Status, @SuggestedResponses = @MJConversationDetails_ParentID_SuggestedResponses, @TestRunID = @MJConversationDetails_ParentID_TestRunID, @ResponseForm = @MJConversationDetails_ParentID_ResponseForm, @ActionableCommands = @MJConversationDetails_ParentID_ActionableCommands, @AutomaticCommands = @MJConversationDetails_ParentID_AutomaticCommands, @OriginalMessageChanged = @MJConversationDetails_ParentID_OriginalMessageChanged, @AgentSessionID = @MJConversationDetails_ParentID_AgentSessionID, @TurnEndedAt = @MJConversationDetails_ParentID_TurnEndedAt, @UtteranceStartMs = @MJConversationDetails_ParentID_UtteranceStartMs, @UtteranceEndMs = @MJConversationDetails_ParentID_UtteranceEndMs, @MediaType = @MJConversationDetails_ParentID_MediaType

        FETCH NEXT FROM cascade_update_MJConversationDetails_ParentID_cursor INTO @MJConversationDetails_ParentIDID, @MJConversationDetails_ParentID_ConversationID, @MJConversationDetails_ParentID_ExternalID, @MJConversationDetails_ParentID_Role, @MJConversationDetails_ParentID_Message, @MJConversationDetails_ParentID_Error, @MJConversationDetails_ParentID_HiddenToUser, @MJConversationDetails_ParentID_UserRating, @MJConversationDetails_ParentID_UserFeedback, @MJConversationDetails_ParentID_ReflectionInsights, @MJConversationDetails_ParentID_SummaryOfEarlierConversation, @MJConversationDetails_ParentID_UserID, @MJConversationDetails_ParentID_ArtifactID, @MJConversationDetails_ParentID_ArtifactVersionID, @MJConversationDetails_ParentID_CompletionTime, @MJConversationDetails_ParentID_IsPinned, @MJConversationDetails_ParentID_ParentID, @MJConversationDetails_ParentID_AgentID, @MJConversationDetails_ParentID_Status, @MJConversationDetails_ParentID_SuggestedResponses, @MJConversationDetails_ParentID_TestRunID, @MJConversationDetails_ParentID_ResponseForm, @MJConversationDetails_ParentID_ActionableCommands, @MJConversationDetails_ParentID_AutomaticCommands, @MJConversationDetails_ParentID_OriginalMessageChanged, @MJConversationDetails_ParentID_AgentSessionID, @MJConversationDetails_ParentID_TurnEndedAt, @MJConversationDetails_ParentID_UtteranceStartMs, @MJConversationDetails_ParentID_UtteranceEndMs, @MJConversationDetails_ParentID_MediaType
    END

    CLOSE cascade_update_MJConversationDetails_ParentID_cursor
    DEALLOCATE cascade_update_MJConversationDetails_ParentID_cursor
    
    -- Cascade update on Task using cursor to call spUpdateTask
    DECLARE @MJTasks_ConversationDetailIDID uniqueidentifier
    DECLARE @MJTasks_ConversationDetailID_ParentID uniqueidentifier
    DECLARE @MJTasks_ConversationDetailID_Name nvarchar(255)
    DECLARE @MJTasks_ConversationDetailID_Description nvarchar(MAX)
    DECLARE @MJTasks_ConversationDetailID_TypeID uniqueidentifier
    DECLARE @MJTasks_ConversationDetailID_EnvironmentID uniqueidentifier
    DECLARE @MJTasks_ConversationDetailID_ProjectID uniqueidentifier
    DECLARE @MJTasks_ConversationDetailID_ConversationDetailID uniqueidentifier
    DECLARE @MJTasks_ConversationDetailID_UserID uniqueidentifier
    DECLARE @MJTasks_ConversationDetailID_AgentID uniqueidentifier
    DECLARE @MJTasks_ConversationDetailID_Status nvarchar(50)
    DECLARE @MJTasks_ConversationDetailID_PercentComplete int
    DECLARE @MJTasks_ConversationDetailID_DueAt datetimeoffset
    DECLARE @MJTasks_ConversationDetailID_StartedAt datetimeoffset
    DECLARE @MJTasks_ConversationDetailID_CompletedAt datetimeoffset
    DECLARE @MJTasks_ConversationDetailID_InputPayload nvarchar(MAX)
    DECLARE @MJTasks_ConversationDetailID_OutputPayload nvarchar(MAX)
    DECLARE @MJTasks_ConversationDetailID_ErrorMessage nvarchar(MAX)
    DECLARE @MJTasks_ConversationDetailID_AgentRunID uniqueidentifier
    DECLARE @MJTasks_ConversationDetailID_ClaimedBy nvarchar(100)
    DECLARE @MJTasks_ConversationDetailID_ClaimExpiresAt datetimeoffset
    DECLARE @MJTasks_ConversationDetailID_ActionID uniqueidentifier
    DECLARE @MJTasks_ConversationDetailID_StepType nvarchar(20)
    DECLARE @MJTasks_ConversationDetailID_PromptID uniqueidentifier
    DECLARE @MJTasks_ConversationDetailID_Configuration nvarchar(MAX)
    DECLARE cascade_update_MJTasks_ConversationDetailID_cursor CURSOR FOR
        SELECT [ID], [ParentID], [Name], [Description], [TypeID], [EnvironmentID], [ProjectID], [ConversationDetailID], [UserID], [AgentID], [Status], [PercentComplete], [DueAt], [StartedAt], [CompletedAt], [InputPayload], [OutputPayload], [ErrorMessage], [AgentRunID], [ClaimedBy], [ClaimExpiresAt], [ActionID], [StepType], [PromptID], [Configuration]
        FROM [${flyway:defaultSchema}].[Task]
        WHERE [ConversationDetailID] = @ID

    OPEN cascade_update_MJTasks_ConversationDetailID_cursor
    FETCH NEXT FROM cascade_update_MJTasks_ConversationDetailID_cursor INTO @MJTasks_ConversationDetailIDID, @MJTasks_ConversationDetailID_ParentID, @MJTasks_ConversationDetailID_Name, @MJTasks_ConversationDetailID_Description, @MJTasks_ConversationDetailID_TypeID, @MJTasks_ConversationDetailID_EnvironmentID, @MJTasks_ConversationDetailID_ProjectID, @MJTasks_ConversationDetailID_ConversationDetailID, @MJTasks_ConversationDetailID_UserID, @MJTasks_ConversationDetailID_AgentID, @MJTasks_ConversationDetailID_Status, @MJTasks_ConversationDetailID_PercentComplete, @MJTasks_ConversationDetailID_DueAt, @MJTasks_ConversationDetailID_StartedAt, @MJTasks_ConversationDetailID_CompletedAt, @MJTasks_ConversationDetailID_InputPayload, @MJTasks_ConversationDetailID_OutputPayload, @MJTasks_ConversationDetailID_ErrorMessage, @MJTasks_ConversationDetailID_AgentRunID, @MJTasks_ConversationDetailID_ClaimedBy, @MJTasks_ConversationDetailID_ClaimExpiresAt, @MJTasks_ConversationDetailID_ActionID, @MJTasks_ConversationDetailID_StepType, @MJTasks_ConversationDetailID_PromptID, @MJTasks_ConversationDetailID_Configuration

    WHILE @@FETCH_STATUS = 0
    BEGIN
        -- Set the FK field to NULL
        SET @MJTasks_ConversationDetailID_ConversationDetailID = NULL

        -- Call the update SP for the related entity
        EXEC [${flyway:defaultSchema}].[spUpdateTask] @ID = @MJTasks_ConversationDetailIDID, @ParentID = @MJTasks_ConversationDetailID_ParentID, @Name = @MJTasks_ConversationDetailID_Name, @Description = @MJTasks_ConversationDetailID_Description, @TypeID = @MJTasks_ConversationDetailID_TypeID, @EnvironmentID = @MJTasks_ConversationDetailID_EnvironmentID, @ProjectID = @MJTasks_ConversationDetailID_ProjectID, @ConversationDetailID_Clear = 1, @ConversationDetailID = @MJTasks_ConversationDetailID_ConversationDetailID, @UserID = @MJTasks_ConversationDetailID_UserID, @AgentID = @MJTasks_ConversationDetailID_AgentID, @Status = @MJTasks_ConversationDetailID_Status, @PercentComplete = @MJTasks_ConversationDetailID_PercentComplete, @DueAt = @MJTasks_ConversationDetailID_DueAt, @StartedAt = @MJTasks_ConversationDetailID_StartedAt, @CompletedAt = @MJTasks_ConversationDetailID_CompletedAt, @InputPayload = @MJTasks_ConversationDetailID_InputPayload, @OutputPayload = @MJTasks_ConversationDetailID_OutputPayload, @ErrorMessage = @MJTasks_ConversationDetailID_ErrorMessage, @AgentRunID = @MJTasks_ConversationDetailID_AgentRunID, @ClaimedBy = @MJTasks_ConversationDetailID_ClaimedBy, @ClaimExpiresAt = @MJTasks_ConversationDetailID_ClaimExpiresAt, @ActionID = @MJTasks_ConversationDetailID_ActionID, @StepType = @MJTasks_ConversationDetailID_StepType, @PromptID = @MJTasks_ConversationDetailID_PromptID, @Configuration = @MJTasks_ConversationDetailID_Configuration

        FETCH NEXT FROM cascade_update_MJTasks_ConversationDetailID_cursor INTO @MJTasks_ConversationDetailIDID, @MJTasks_ConversationDetailID_ParentID, @MJTasks_ConversationDetailID_Name, @MJTasks_ConversationDetailID_Description, @MJTasks_ConversationDetailID_TypeID, @MJTasks_ConversationDetailID_EnvironmentID, @MJTasks_ConversationDetailID_ProjectID, @MJTasks_ConversationDetailID_ConversationDetailID, @MJTasks_ConversationDetailID_UserID, @MJTasks_ConversationDetailID_AgentID, @MJTasks_ConversationDetailID_Status, @MJTasks_ConversationDetailID_PercentComplete, @MJTasks_ConversationDetailID_DueAt, @MJTasks_ConversationDetailID_StartedAt, @MJTasks_ConversationDetailID_CompletedAt, @MJTasks_ConversationDetailID_InputPayload, @MJTasks_ConversationDetailID_OutputPayload, @MJTasks_ConversationDetailID_ErrorMessage, @MJTasks_ConversationDetailID_AgentRunID, @MJTasks_ConversationDetailID_ClaimedBy, @MJTasks_ConversationDetailID_ClaimExpiresAt, @MJTasks_ConversationDetailID_ActionID, @MJTasks_ConversationDetailID_StepType, @MJTasks_ConversationDetailID_PromptID, @MJTasks_ConversationDetailID_Configuration
    END

    CLOSE cascade_update_MJTasks_ConversationDetailID_cursor
    DEALLOCATE cascade_update_MJTasks_ConversationDetailID_cursor
    

    DELETE FROM
        [${flyway:defaultSchema}].[ConversationDetail]
    WHERE
        [ID] = @ID


    -- Check if the delete was successful
    IF @@ROWCOUNT = 0
        SELECT NULL AS [ID] -- Return NULL for all primary key fields to indicate no record was deleted
    ELSE
        SELECT @ID AS [ID] -- Return the primary key values to indicate we successfully deleted the record
END
GO
GRANT EXECUTE ON [${flyway:defaultSchema}].[spDeleteConversationDetail] TO [cdp_Developer], [cdp_UI], [cdp_Integration];

/* spDelete Permissions for MJ: Conversation Details */

GRANT EXECUTE ON [${flyway:defaultSchema}].[spDeleteConversationDetail] TO [cdp_Developer], [cdp_UI], [cdp_Integration];

/* spDelete SQL for MJ: AI Agents */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: AI Agents
-- Item: spDeleteAIAgent
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- DELETE PROCEDURE FOR AIAgent
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[spDeleteAIAgent]', 'P') IS NOT NULL
    DROP PROCEDURE [${flyway:defaultSchema}].[spDeleteAIAgent];
GO

CREATE PROCEDURE [${flyway:defaultSchema}].[spDeleteAIAgent]
    @ID uniqueidentifier
AS
BEGIN
    SET NOCOUNT ON;
    -- Cascade update on Action using cursor to call spUpdateAction
    DECLARE @MJActions_CreatedByAgentIDID uniqueidentifier
    DECLARE @MJActions_CreatedByAgentID_CategoryID uniqueidentifier
    DECLARE @MJActions_CreatedByAgentID_Name nvarchar(425)
    DECLARE @MJActions_CreatedByAgentID_Description nvarchar(MAX)
    DECLARE @MJActions_CreatedByAgentID_Type nvarchar(20)
    DECLARE @MJActions_CreatedByAgentID_UserPrompt nvarchar(MAX)
    DECLARE @MJActions_CreatedByAgentID_UserComments nvarchar(MAX)
    DECLARE @MJActions_CreatedByAgentID_Code nvarchar(MAX)
    DECLARE @MJActions_CreatedByAgentID_CodeComments nvarchar(MAX)
    DECLARE @MJActions_CreatedByAgentID_CodeApprovalStatus nvarchar(20)
    DECLARE @MJActions_CreatedByAgentID_CodeApprovalComments nvarchar(MAX)
    DECLARE @MJActions_CreatedByAgentID_CodeApprovedByUserID uniqueidentifier
    DECLARE @MJActions_CreatedByAgentID_CodeApprovedAt datetimeoffset
    DECLARE @MJActions_CreatedByAgentID_CodeLocked bit
    DECLARE @MJActions_CreatedByAgentID_ForceCodeGeneration bit
    DECLARE @MJActions_CreatedByAgentID_RetentionPeriod int
    DECLARE @MJActions_CreatedByAgentID_Status nvarchar(20)
    DECLARE @MJActions_CreatedByAgentID_DriverClass nvarchar(255)
    DECLARE @MJActions_CreatedByAgentID_ParentID uniqueidentifier
    DECLARE @MJActions_CreatedByAgentID_IconClass nvarchar(100)
    DECLARE @MJActions_CreatedByAgentID_DefaultCompactPromptID uniqueidentifier
    DECLARE @MJActions_CreatedByAgentID_Config nvarchar(MAX)
    DECLARE @MJActions_CreatedByAgentID_RuntimeActionConfiguration nvarchar(MAX)
    DECLARE @MJActions_CreatedByAgentID_MaxExecutionTimeMS int
    DECLARE @MJActions_CreatedByAgentID_CreatedByAgentID uniqueidentifier
    DECLARE cascade_update_MJActions_CreatedByAgentID_cursor CURSOR FOR
        SELECT [ID], [CategoryID], [Name], [Description], [Type], [UserPrompt], [UserComments], [Code], [CodeComments], [CodeApprovalStatus], [CodeApprovalComments], [CodeApprovedByUserID], [CodeApprovedAt], [CodeLocked], [ForceCodeGeneration], [RetentionPeriod], [Status], [DriverClass], [ParentID], [IconClass], [DefaultCompactPromptID], [Config], [RuntimeActionConfiguration], [MaxExecutionTimeMS], [CreatedByAgentID]
        FROM [${flyway:defaultSchema}].[Action]
        WHERE [CreatedByAgentID] = @ID

    OPEN cascade_update_MJActions_CreatedByAgentID_cursor
    FETCH NEXT FROM cascade_update_MJActions_CreatedByAgentID_cursor INTO @MJActions_CreatedByAgentIDID, @MJActions_CreatedByAgentID_CategoryID, @MJActions_CreatedByAgentID_Name, @MJActions_CreatedByAgentID_Description, @MJActions_CreatedByAgentID_Type, @MJActions_CreatedByAgentID_UserPrompt, @MJActions_CreatedByAgentID_UserComments, @MJActions_CreatedByAgentID_Code, @MJActions_CreatedByAgentID_CodeComments, @MJActions_CreatedByAgentID_CodeApprovalStatus, @MJActions_CreatedByAgentID_CodeApprovalComments, @MJActions_CreatedByAgentID_CodeApprovedByUserID, @MJActions_CreatedByAgentID_CodeApprovedAt, @MJActions_CreatedByAgentID_CodeLocked, @MJActions_CreatedByAgentID_ForceCodeGeneration, @MJActions_CreatedByAgentID_RetentionPeriod, @MJActions_CreatedByAgentID_Status, @MJActions_CreatedByAgentID_DriverClass, @MJActions_CreatedByAgentID_ParentID, @MJActions_CreatedByAgentID_IconClass, @MJActions_CreatedByAgentID_DefaultCompactPromptID, @MJActions_CreatedByAgentID_Config, @MJActions_CreatedByAgentID_RuntimeActionConfiguration, @MJActions_CreatedByAgentID_MaxExecutionTimeMS, @MJActions_CreatedByAgentID_CreatedByAgentID

    WHILE @@FETCH_STATUS = 0
    BEGIN
        -- Set the FK field to NULL
        SET @MJActions_CreatedByAgentID_CreatedByAgentID = NULL

        -- Call the update SP for the related entity
        EXEC [${flyway:defaultSchema}].[spUpdateAction] @ID = @MJActions_CreatedByAgentIDID, @CategoryID = @MJActions_CreatedByAgentID_CategoryID, @Name = @MJActions_CreatedByAgentID_Name, @Description = @MJActions_CreatedByAgentID_Description, @Type = @MJActions_CreatedByAgentID_Type, @UserPrompt = @MJActions_CreatedByAgentID_UserPrompt, @UserComments = @MJActions_CreatedByAgentID_UserComments, @Code = @MJActions_CreatedByAgentID_Code, @CodeComments = @MJActions_CreatedByAgentID_CodeComments, @CodeApprovalStatus = @MJActions_CreatedByAgentID_CodeApprovalStatus, @CodeApprovalComments = @MJActions_CreatedByAgentID_CodeApprovalComments, @CodeApprovedByUserID = @MJActions_CreatedByAgentID_CodeApprovedByUserID, @CodeApprovedAt = @MJActions_CreatedByAgentID_CodeApprovedAt, @CodeLocked = @MJActions_CreatedByAgentID_CodeLocked, @ForceCodeGeneration = @MJActions_CreatedByAgentID_ForceCodeGeneration, @RetentionPeriod = @MJActions_CreatedByAgentID_RetentionPeriod, @Status = @MJActions_CreatedByAgentID_Status, @DriverClass = @MJActions_CreatedByAgentID_DriverClass, @ParentID = @MJActions_CreatedByAgentID_ParentID, @IconClass = @MJActions_CreatedByAgentID_IconClass, @DefaultCompactPromptID = @MJActions_CreatedByAgentID_DefaultCompactPromptID, @Config = @MJActions_CreatedByAgentID_Config, @RuntimeActionConfiguration = @MJActions_CreatedByAgentID_RuntimeActionConfiguration, @MaxExecutionTimeMS = @MJActions_CreatedByAgentID_MaxExecutionTimeMS, @CreatedByAgentID_Clear = 1, @CreatedByAgentID = @MJActions_CreatedByAgentID_CreatedByAgentID

        FETCH NEXT FROM cascade_update_MJActions_CreatedByAgentID_cursor INTO @MJActions_CreatedByAgentIDID, @MJActions_CreatedByAgentID_CategoryID, @MJActions_CreatedByAgentID_Name, @MJActions_CreatedByAgentID_Description, @MJActions_CreatedByAgentID_Type, @MJActions_CreatedByAgentID_UserPrompt, @MJActions_CreatedByAgentID_UserComments, @MJActions_CreatedByAgentID_Code, @MJActions_CreatedByAgentID_CodeComments, @MJActions_CreatedByAgentID_CodeApprovalStatus, @MJActions_CreatedByAgentID_CodeApprovalComments, @MJActions_CreatedByAgentID_CodeApprovedByUserID, @MJActions_CreatedByAgentID_CodeApprovedAt, @MJActions_CreatedByAgentID_CodeLocked, @MJActions_CreatedByAgentID_ForceCodeGeneration, @MJActions_CreatedByAgentID_RetentionPeriod, @MJActions_CreatedByAgentID_Status, @MJActions_CreatedByAgentID_DriverClass, @MJActions_CreatedByAgentID_ParentID, @MJActions_CreatedByAgentID_IconClass, @MJActions_CreatedByAgentID_DefaultCompactPromptID, @MJActions_CreatedByAgentID_Config, @MJActions_CreatedByAgentID_RuntimeActionConfiguration, @MJActions_CreatedByAgentID_MaxExecutionTimeMS, @MJActions_CreatedByAgentID_CreatedByAgentID
    END

    CLOSE cascade_update_MJActions_CreatedByAgentID_cursor
    DEALLOCATE cascade_update_MJActions_CreatedByAgentID_cursor
    
    -- Cascade update on AIAgentAction using cursor to call spUpdateAIAgentAction
    DECLARE @MJAIAgentActions_AgentIDID uniqueidentifier
    DECLARE @MJAIAgentActions_AgentID_AgentID uniqueidentifier
    DECLARE @MJAIAgentActions_AgentID_ActionID uniqueidentifier
    DECLARE @MJAIAgentActions_AgentID_Status nvarchar(15)
    DECLARE @MJAIAgentActions_AgentID_MinExecutionsPerRun int
    DECLARE @MJAIAgentActions_AgentID_MaxExecutionsPerRun int
    DECLARE @MJAIAgentActions_AgentID_ResultExpirationTurns int
    DECLARE @MJAIAgentActions_AgentID_ResultExpirationMode nvarchar(20)
    DECLARE @MJAIAgentActions_AgentID_CompactMode nvarchar(20)
    DECLARE @MJAIAgentActions_AgentID_CompactLength int
    DECLARE @MJAIAgentActions_AgentID_CompactPromptID uniqueidentifier
    DECLARE cascade_update_MJAIAgentActions_AgentID_cursor CURSOR FOR
        SELECT [ID], [AgentID], [ActionID], [Status], [MinExecutionsPerRun], [MaxExecutionsPerRun], [ResultExpirationTurns], [ResultExpirationMode], [CompactMode], [CompactLength], [CompactPromptID]
        FROM [${flyway:defaultSchema}].[AIAgentAction]
        WHERE [AgentID] = @ID

    OPEN cascade_update_MJAIAgentActions_AgentID_cursor
    FETCH NEXT FROM cascade_update_MJAIAgentActions_AgentID_cursor INTO @MJAIAgentActions_AgentIDID, @MJAIAgentActions_AgentID_AgentID, @MJAIAgentActions_AgentID_ActionID, @MJAIAgentActions_AgentID_Status, @MJAIAgentActions_AgentID_MinExecutionsPerRun, @MJAIAgentActions_AgentID_MaxExecutionsPerRun, @MJAIAgentActions_AgentID_ResultExpirationTurns, @MJAIAgentActions_AgentID_ResultExpirationMode, @MJAIAgentActions_AgentID_CompactMode, @MJAIAgentActions_AgentID_CompactLength, @MJAIAgentActions_AgentID_CompactPromptID

    WHILE @@FETCH_STATUS = 0
    BEGIN
        -- Set the FK field to NULL
        SET @MJAIAgentActions_AgentID_AgentID = NULL

        -- Call the update SP for the related entity
        EXEC [${flyway:defaultSchema}].[spUpdateAIAgentAction] @ID = @MJAIAgentActions_AgentIDID, @AgentID_Clear = 1, @AgentID = @MJAIAgentActions_AgentID_AgentID, @ActionID = @MJAIAgentActions_AgentID_ActionID, @Status = @MJAIAgentActions_AgentID_Status, @MinExecutionsPerRun = @MJAIAgentActions_AgentID_MinExecutionsPerRun, @MaxExecutionsPerRun = @MJAIAgentActions_AgentID_MaxExecutionsPerRun, @ResultExpirationTurns = @MJAIAgentActions_AgentID_ResultExpirationTurns, @ResultExpirationMode = @MJAIAgentActions_AgentID_ResultExpirationMode, @CompactMode = @MJAIAgentActions_AgentID_CompactMode, @CompactLength = @MJAIAgentActions_AgentID_CompactLength, @CompactPromptID = @MJAIAgentActions_AgentID_CompactPromptID

        FETCH NEXT FROM cascade_update_MJAIAgentActions_AgentID_cursor INTO @MJAIAgentActions_AgentIDID, @MJAIAgentActions_AgentID_AgentID, @MJAIAgentActions_AgentID_ActionID, @MJAIAgentActions_AgentID_Status, @MJAIAgentActions_AgentID_MinExecutionsPerRun, @MJAIAgentActions_AgentID_MaxExecutionsPerRun, @MJAIAgentActions_AgentID_ResultExpirationTurns, @MJAIAgentActions_AgentID_ResultExpirationMode, @MJAIAgentActions_AgentID_CompactMode, @MJAIAgentActions_AgentID_CompactLength, @MJAIAgentActions_AgentID_CompactPromptID
    END

    CLOSE cascade_update_MJAIAgentActions_AgentID_cursor
    DEALLOCATE cascade_update_MJAIAgentActions_AgentID_cursor
    
    -- Cascade delete from AIAgentArtifactType using cursor to call spDeleteAIAgentArtifactType
    DECLARE @MJAIAgentArtifactTypes_AgentIDID uniqueidentifier
    DECLARE cascade_delete_MJAIAgentArtifactTypes_AgentID_cursor CURSOR FOR 
        SELECT [ID]
        FROM [${flyway:defaultSchema}].[AIAgentArtifactType]
        WHERE [AgentID] = @ID
    
    OPEN cascade_delete_MJAIAgentArtifactTypes_AgentID_cursor
    FETCH NEXT FROM cascade_delete_MJAIAgentArtifactTypes_AgentID_cursor INTO @MJAIAgentArtifactTypes_AgentIDID
    
    WHILE @@FETCH_STATUS = 0
    BEGIN
        EXEC [${flyway:defaultSchema}].[spDeleteAIAgentArtifactType] @ID = @MJAIAgentArtifactTypes_AgentIDID
        
        FETCH NEXT FROM cascade_delete_MJAIAgentArtifactTypes_AgentID_cursor INTO @MJAIAgentArtifactTypes_AgentIDID
    END
    
    CLOSE cascade_delete_MJAIAgentArtifactTypes_AgentID_cursor
    DEALLOCATE cascade_delete_MJAIAgentArtifactTypes_AgentID_cursor
    
    -- Cascade delete from AIAgentClientTool using cursor to call spDeleteAIAgentClientTool
    DECLARE @MJAIAgentClientTools_AgentIDID uniqueidentifier
    DECLARE cascade_delete_MJAIAgentClientTools_AgentID_cursor CURSOR FOR 
        SELECT [ID]
        FROM [${flyway:defaultSchema}].[AIAgentClientTool]
        WHERE [AgentID] = @ID
    
    OPEN cascade_delete_MJAIAgentClientTools_AgentID_cursor
    FETCH NEXT FROM cascade_delete_MJAIAgentClientTools_AgentID_cursor INTO @MJAIAgentClientTools_AgentIDID
    
    WHILE @@FETCH_STATUS = 0
    BEGIN
        EXEC [${flyway:defaultSchema}].[spDeleteAIAgentClientTool] @ID = @MJAIAgentClientTools_AgentIDID
        
        FETCH NEXT FROM cascade_delete_MJAIAgentClientTools_AgentID_cursor INTO @MJAIAgentClientTools_AgentIDID
    END
    
    CLOSE cascade_delete_MJAIAgentClientTools_AgentID_cursor
    DEALLOCATE cascade_delete_MJAIAgentClientTools_AgentID_cursor
    
    -- Cascade delete from AIAgentCoAgent using cursor to call spDeleteAIAgentCoAgent
    DECLARE @MJAIAgentCoAgents_CoAgentIDID uniqueidentifier
    DECLARE cascade_delete_MJAIAgentCoAgents_CoAgentID_cursor CURSOR FOR 
        SELECT [ID]
        FROM [${flyway:defaultSchema}].[AIAgentCoAgent]
        WHERE [CoAgentID] = @ID
    
    OPEN cascade_delete_MJAIAgentCoAgents_CoAgentID_cursor
    FETCH NEXT FROM cascade_delete_MJAIAgentCoAgents_CoAgentID_cursor INTO @MJAIAgentCoAgents_CoAgentIDID
    
    WHILE @@FETCH_STATUS = 0
    BEGIN
        EXEC [${flyway:defaultSchema}].[spDeleteAIAgentCoAgent] @ID = @MJAIAgentCoAgents_CoAgentIDID
        
        FETCH NEXT FROM cascade_delete_MJAIAgentCoAgents_CoAgentID_cursor INTO @MJAIAgentCoAgents_CoAgentIDID
    END
    
    CLOSE cascade_delete_MJAIAgentCoAgents_CoAgentID_cursor
    DEALLOCATE cascade_delete_MJAIAgentCoAgents_CoAgentID_cursor
    
    -- Cascade update on AIAgentCoAgent using cursor to call spUpdateAIAgentCoAgent
    DECLARE @MJAIAgentCoAgents_TargetAgentIDID uniqueidentifier
    DECLARE @MJAIAgentCoAgents_TargetAgentID_CoAgentID uniqueidentifier
    DECLARE @MJAIAgentCoAgents_TargetAgentID_TargetAgentID uniqueidentifier
    DECLARE @MJAIAgentCoAgents_TargetAgentID_TargetAgentTypeID uniqueidentifier
    DECLARE @MJAIAgentCoAgents_TargetAgentID_Type nvarchar(30)
    DECLARE @MJAIAgentCoAgents_TargetAgentID_IsDefault bit
    DECLARE @MJAIAgentCoAgents_TargetAgentID_Sequence int
    DECLARE @MJAIAgentCoAgents_TargetAgentID_Status nvarchar(20)
    DECLARE @MJAIAgentCoAgents_TargetAgentID_Configuration nvarchar(MAX)
    DECLARE cascade_update_MJAIAgentCoAgents_TargetAgentID_cursor CURSOR FOR
        SELECT [ID], [CoAgentID], [TargetAgentID], [TargetAgentTypeID], [Type], [IsDefault], [Sequence], [Status], [Configuration]
        FROM [${flyway:defaultSchema}].[AIAgentCoAgent]
        WHERE [TargetAgentID] = @ID

    OPEN cascade_update_MJAIAgentCoAgents_TargetAgentID_cursor
    FETCH NEXT FROM cascade_update_MJAIAgentCoAgents_TargetAgentID_cursor INTO @MJAIAgentCoAgents_TargetAgentIDID, @MJAIAgentCoAgents_TargetAgentID_CoAgentID, @MJAIAgentCoAgents_TargetAgentID_TargetAgentID, @MJAIAgentCoAgents_TargetAgentID_TargetAgentTypeID, @MJAIAgentCoAgents_TargetAgentID_Type, @MJAIAgentCoAgents_TargetAgentID_IsDefault, @MJAIAgentCoAgents_TargetAgentID_Sequence, @MJAIAgentCoAgents_TargetAgentID_Status, @MJAIAgentCoAgents_TargetAgentID_Configuration

    WHILE @@FETCH_STATUS = 0
    BEGIN
        -- Set the FK field to NULL
        SET @MJAIAgentCoAgents_TargetAgentID_TargetAgentID = NULL

        -- Call the update SP for the related entity
        EXEC [${flyway:defaultSchema}].[spUpdateAIAgentCoAgent] @ID = @MJAIAgentCoAgents_TargetAgentIDID, @CoAgentID = @MJAIAgentCoAgents_TargetAgentID_CoAgentID, @TargetAgentID_Clear = 1, @TargetAgentID = @MJAIAgentCoAgents_TargetAgentID_TargetAgentID, @TargetAgentTypeID = @MJAIAgentCoAgents_TargetAgentID_TargetAgentTypeID, @Type = @MJAIAgentCoAgents_TargetAgentID_Type, @IsDefault = @MJAIAgentCoAgents_TargetAgentID_IsDefault, @Sequence = @MJAIAgentCoAgents_TargetAgentID_Sequence, @Status = @MJAIAgentCoAgents_TargetAgentID_Status, @Configuration = @MJAIAgentCoAgents_TargetAgentID_Configuration

        FETCH NEXT FROM cascade_update_MJAIAgentCoAgents_TargetAgentID_cursor INTO @MJAIAgentCoAgents_TargetAgentIDID, @MJAIAgentCoAgents_TargetAgentID_CoAgentID, @MJAIAgentCoAgents_TargetAgentID_TargetAgentID, @MJAIAgentCoAgents_TargetAgentID_TargetAgentTypeID, @MJAIAgentCoAgents_TargetAgentID_Type, @MJAIAgentCoAgents_TargetAgentID_IsDefault, @MJAIAgentCoAgents_TargetAgentID_Sequence, @MJAIAgentCoAgents_TargetAgentID_Status, @MJAIAgentCoAgents_TargetAgentID_Configuration
    END

    CLOSE cascade_update_MJAIAgentCoAgents_TargetAgentID_cursor
    DEALLOCATE cascade_update_MJAIAgentCoAgents_TargetAgentID_cursor
    
    -- Cascade delete from AIAgentConfiguration using cursor to call spDeleteAIAgentConfiguration
    DECLARE @MJAIAgentConfigurations_AgentIDID uniqueidentifier
    DECLARE cascade_delete_MJAIAgentConfigurations_AgentID_cursor CURSOR FOR 
        SELECT [ID]
        FROM [${flyway:defaultSchema}].[AIAgentConfiguration]
        WHERE [AgentID] = @ID
    
    OPEN cascade_delete_MJAIAgentConfigurations_AgentID_cursor
    FETCH NEXT FROM cascade_delete_MJAIAgentConfigurations_AgentID_cursor INTO @MJAIAgentConfigurations_AgentIDID
    
    WHILE @@FETCH_STATUS = 0
    BEGIN
        EXEC [${flyway:defaultSchema}].[spDeleteAIAgentConfiguration] @ID = @MJAIAgentConfigurations_AgentIDID
        
        FETCH NEXT FROM cascade_delete_MJAIAgentConfigurations_AgentID_cursor INTO @MJAIAgentConfigurations_AgentIDID
    END
    
    CLOSE cascade_delete_MJAIAgentConfigurations_AgentID_cursor
    DEALLOCATE cascade_delete_MJAIAgentConfigurations_AgentID_cursor
    
    -- Cascade delete from AIAgentCredential using cursor to call spDeleteAIAgentCredential
    DECLARE @MJAIAgentCredentials_AgentIDID uniqueidentifier
    DECLARE cascade_delete_MJAIAgentCredentials_AgentID_cursor CURSOR FOR 
        SELECT [ID]
        FROM [${flyway:defaultSchema}].[AIAgentCredential]
        WHERE [AgentID] = @ID
    
    OPEN cascade_delete_MJAIAgentCredentials_AgentID_cursor
    FETCH NEXT FROM cascade_delete_MJAIAgentCredentials_AgentID_cursor INTO @MJAIAgentCredentials_AgentIDID
    
    WHILE @@FETCH_STATUS = 0
    BEGIN
        EXEC [${flyway:defaultSchema}].[spDeleteAIAgentCredential] @ID = @MJAIAgentCredentials_AgentIDID
        
        FETCH NEXT FROM cascade_delete_MJAIAgentCredentials_AgentID_cursor INTO @MJAIAgentCredentials_AgentIDID
    END
    
    CLOSE cascade_delete_MJAIAgentCredentials_AgentID_cursor
    DEALLOCATE cascade_delete_MJAIAgentCredentials_AgentID_cursor
    
    -- Cascade delete from AIAgentDataSource using cursor to call spDeleteAIAgentDataSource
    DECLARE @MJAIAgentDataSources_AgentIDID uniqueidentifier
    DECLARE cascade_delete_MJAIAgentDataSources_AgentID_cursor CURSOR FOR 
        SELECT [ID]
        FROM [${flyway:defaultSchema}].[AIAgentDataSource]
        WHERE [AgentID] = @ID
    
    OPEN cascade_delete_MJAIAgentDataSources_AgentID_cursor
    FETCH NEXT FROM cascade_delete_MJAIAgentDataSources_AgentID_cursor INTO @MJAIAgentDataSources_AgentIDID
    
    WHILE @@FETCH_STATUS = 0
    BEGIN
        EXEC [${flyway:defaultSchema}].[spDeleteAIAgentDataSource] @ID = @MJAIAgentDataSources_AgentIDID
        
        FETCH NEXT FROM cascade_delete_MJAIAgentDataSources_AgentID_cursor INTO @MJAIAgentDataSources_AgentIDID
    END
    
    CLOSE cascade_delete_MJAIAgentDataSources_AgentID_cursor
    DEALLOCATE cascade_delete_MJAIAgentDataSources_AgentID_cursor
    
    -- Cascade delete from AIAgentExample using cursor to call spDeleteAIAgentExample
    DECLARE @MJAIAgentExamples_AgentIDID uniqueidentifier
    DECLARE cascade_delete_MJAIAgentExamples_AgentID_cursor CURSOR FOR 
        SELECT [ID]
        FROM [${flyway:defaultSchema}].[AIAgentExample]
        WHERE [AgentID] = @ID
    
    OPEN cascade_delete_MJAIAgentExamples_AgentID_cursor
    FETCH NEXT FROM cascade_delete_MJAIAgentExamples_AgentID_cursor INTO @MJAIAgentExamples_AgentIDID
    
    WHILE @@FETCH_STATUS = 0
    BEGIN
        EXEC [${flyway:defaultSchema}].[spDeleteAIAgentExample] @ID = @MJAIAgentExamples_AgentIDID
        
        FETCH NEXT FROM cascade_delete_MJAIAgentExamples_AgentID_cursor INTO @MJAIAgentExamples_AgentIDID
    END
    
    CLOSE cascade_delete_MJAIAgentExamples_AgentID_cursor
    DEALLOCATE cascade_delete_MJAIAgentExamples_AgentID_cursor
    
    -- Cascade delete from AIAgentLearningCycle using cursor to call spDeleteAIAgentLearningCycle
    DECLARE @MJAIAgentLearningCycles_AgentIDID uniqueidentifier
    DECLARE cascade_delete_MJAIAgentLearningCycles_AgentID_cursor CURSOR FOR 
        SELECT [ID]
        FROM [${flyway:defaultSchema}].[AIAgentLearningCycle]
        WHERE [AgentID] = @ID
    
    OPEN cascade_delete_MJAIAgentLearningCycles_AgentID_cursor
    FETCH NEXT FROM cascade_delete_MJAIAgentLearningCycles_AgentID_cursor INTO @MJAIAgentLearningCycles_AgentIDID
    
    WHILE @@FETCH_STATUS = 0
    BEGIN
        EXEC [${flyway:defaultSchema}].[spDeleteAIAgentLearningCycle] @ID = @MJAIAgentLearningCycles_AgentIDID
        
        FETCH NEXT FROM cascade_delete_MJAIAgentLearningCycles_AgentID_cursor INTO @MJAIAgentLearningCycles_AgentIDID
    END
    
    CLOSE cascade_delete_MJAIAgentLearningCycles_AgentID_cursor
    DEALLOCATE cascade_delete_MJAIAgentLearningCycles_AgentID_cursor
    
    -- Cascade delete from AIAgentModality using cursor to call spDeleteAIAgentModality
    DECLARE @MJAIAgentModalities_AgentIDID uniqueidentifier
    DECLARE cascade_delete_MJAIAgentModalities_AgentID_cursor CURSOR FOR 
        SELECT [ID]
        FROM [${flyway:defaultSchema}].[AIAgentModality]
        WHERE [AgentID] = @ID
    
    OPEN cascade_delete_MJAIAgentModalities_AgentID_cursor
    FETCH NEXT FROM cascade_delete_MJAIAgentModalities_AgentID_cursor INTO @MJAIAgentModalities_AgentIDID
    
    WHILE @@FETCH_STATUS = 0
    BEGIN
        EXEC [${flyway:defaultSchema}].[spDeleteAIAgentModality] @ID = @MJAIAgentModalities_AgentIDID
        
        FETCH NEXT FROM cascade_delete_MJAIAgentModalities_AgentID_cursor INTO @MJAIAgentModalities_AgentIDID
    END
    
    CLOSE cascade_delete_MJAIAgentModalities_AgentID_cursor
    DEALLOCATE cascade_delete_MJAIAgentModalities_AgentID_cursor
    
    -- Cascade update on AIAgentModel using cursor to call spUpdateAIAgentModel
    DECLARE @MJAIAgentModels_AgentIDID uniqueidentifier
    DECLARE @MJAIAgentModels_AgentID_AgentID uniqueidentifier
    DECLARE @MJAIAgentModels_AgentID_ModelID uniqueidentifier
    DECLARE @MJAIAgentModels_AgentID_Active bit
    DECLARE @MJAIAgentModels_AgentID_Priority int
    DECLARE cascade_update_MJAIAgentModels_AgentID_cursor CURSOR FOR
        SELECT [ID], [AgentID], [ModelID], [Active], [Priority]
        FROM [${flyway:defaultSchema}].[AIAgentModel]
        WHERE [AgentID] = @ID

    OPEN cascade_update_MJAIAgentModels_AgentID_cursor
    FETCH NEXT FROM cascade_update_MJAIAgentModels_AgentID_cursor INTO @MJAIAgentModels_AgentIDID, @MJAIAgentModels_AgentID_AgentID, @MJAIAgentModels_AgentID_ModelID, @MJAIAgentModels_AgentID_Active, @MJAIAgentModels_AgentID_Priority

    WHILE @@FETCH_STATUS = 0
    BEGIN
        -- Set the FK field to NULL
        SET @MJAIAgentModels_AgentID_AgentID = NULL

        -- Call the update SP for the related entity
        EXEC [${flyway:defaultSchema}].[spUpdateAIAgentModel] @ID = @MJAIAgentModels_AgentIDID, @AgentID_Clear = 1, @AgentID = @MJAIAgentModels_AgentID_AgentID, @ModelID = @MJAIAgentModels_AgentID_ModelID, @Active = @MJAIAgentModels_AgentID_Active, @Priority = @MJAIAgentModels_AgentID_Priority

        FETCH NEXT FROM cascade_update_MJAIAgentModels_AgentID_cursor INTO @MJAIAgentModels_AgentIDID, @MJAIAgentModels_AgentID_AgentID, @MJAIAgentModels_AgentID_ModelID, @MJAIAgentModels_AgentID_Active, @MJAIAgentModels_AgentID_Priority
    END

    CLOSE cascade_update_MJAIAgentModels_AgentID_cursor
    DEALLOCATE cascade_update_MJAIAgentModels_AgentID_cursor
    
    -- Cascade update on AIAgentNote using cursor to call spUpdateAIAgentNote
    DECLARE @MJAIAgentNotes_AgentIDID uniqueidentifier
    DECLARE @MJAIAgentNotes_AgentID_AgentID uniqueidentifier
    DECLARE @MJAIAgentNotes_AgentID_AgentNoteTypeID uniqueidentifier
    DECLARE @MJAIAgentNotes_AgentID_Note nvarchar(MAX)
    DECLARE @MJAIAgentNotes_AgentID_UserID uniqueidentifier
    DECLARE @MJAIAgentNotes_AgentID_Type nvarchar(20)
    DECLARE @MJAIAgentNotes_AgentID_IsAutoGenerated bit
    DECLARE @MJAIAgentNotes_AgentID_Comments nvarchar(MAX)
    DECLARE @MJAIAgentNotes_AgentID_Status nvarchar(20)
    DECLARE @MJAIAgentNotes_AgentID_SourceConversationID uniqueidentifier
    DECLARE @MJAIAgentNotes_AgentID_SourceConversationDetailID uniqueidentifier
    DECLARE @MJAIAgentNotes_AgentID_SourceAIAgentRunID uniqueidentifier
    DECLARE @MJAIAgentNotes_AgentID_CompanyID uniqueidentifier
    DECLARE @MJAIAgentNotes_AgentID_EmbeddingVector nvarchar(MAX)
    DECLARE @MJAIAgentNotes_AgentID_EmbeddingModelID uniqueidentifier
    DECLARE @MJAIAgentNotes_AgentID_PrimaryScopeEntityID uniqueidentifier
    DECLARE @MJAIAgentNotes_AgentID_PrimaryScopeRecordID nvarchar(100)
    DECLARE @MJAIAgentNotes_AgentID_SecondaryScopes nvarchar(MAX)
    DECLARE @MJAIAgentNotes_AgentID_LastAccessedAt datetimeoffset
    DECLARE @MJAIAgentNotes_AgentID_AccessCount int
    DECLARE @MJAIAgentNotes_AgentID_ExpiresAt datetimeoffset
    DECLARE @MJAIAgentNotes_AgentID_ConsolidatedIntoNoteID uniqueidentifier
    DECLARE @MJAIAgentNotes_AgentID_ConsolidationCount int
    DECLARE @MJAIAgentNotes_AgentID_DerivedFromNoteIDs nvarchar(MAX)
    DECLARE @MJAIAgentNotes_AgentID_ProtectionTier nvarchar(20)
    DECLARE @MJAIAgentNotes_AgentID_ImportanceScore decimal(5, 2)
    DECLARE @MJAIAgentNotes_AgentID_AuthorType nvarchar(20)
    DECLARE cascade_update_MJAIAgentNotes_AgentID_cursor CURSOR FOR
        SELECT [ID], [AgentID], [AgentNoteTypeID], [Note], [UserID], [Type], [IsAutoGenerated], [Comments], [Status], [SourceConversationID], [SourceConversationDetailID], [SourceAIAgentRunID], [CompanyID], [EmbeddingVector], [EmbeddingModelID], [PrimaryScopeEntityID], [PrimaryScopeRecordID], [SecondaryScopes], [LastAccessedAt], [AccessCount], [ExpiresAt], [ConsolidatedIntoNoteID], [ConsolidationCount], [DerivedFromNoteIDs], [ProtectionTier], [ImportanceScore], [AuthorType]
        FROM [${flyway:defaultSchema}].[AIAgentNote]
        WHERE [AgentID] = @ID

    OPEN cascade_update_MJAIAgentNotes_AgentID_cursor
    FETCH NEXT FROM cascade_update_MJAIAgentNotes_AgentID_cursor INTO @MJAIAgentNotes_AgentIDID, @MJAIAgentNotes_AgentID_AgentID, @MJAIAgentNotes_AgentID_AgentNoteTypeID, @MJAIAgentNotes_AgentID_Note, @MJAIAgentNotes_AgentID_UserID, @MJAIAgentNotes_AgentID_Type, @MJAIAgentNotes_AgentID_IsAutoGenerated, @MJAIAgentNotes_AgentID_Comments, @MJAIAgentNotes_AgentID_Status, @MJAIAgentNotes_AgentID_SourceConversationID, @MJAIAgentNotes_AgentID_SourceConversationDetailID, @MJAIAgentNotes_AgentID_SourceAIAgentRunID, @MJAIAgentNotes_AgentID_CompanyID, @MJAIAgentNotes_AgentID_EmbeddingVector, @MJAIAgentNotes_AgentID_EmbeddingModelID, @MJAIAgentNotes_AgentID_PrimaryScopeEntityID, @MJAIAgentNotes_AgentID_PrimaryScopeRecordID, @MJAIAgentNotes_AgentID_SecondaryScopes, @MJAIAgentNotes_AgentID_LastAccessedAt, @MJAIAgentNotes_AgentID_AccessCount, @MJAIAgentNotes_AgentID_ExpiresAt, @MJAIAgentNotes_AgentID_ConsolidatedIntoNoteID, @MJAIAgentNotes_AgentID_ConsolidationCount, @MJAIAgentNotes_AgentID_DerivedFromNoteIDs, @MJAIAgentNotes_AgentID_ProtectionTier, @MJAIAgentNotes_AgentID_ImportanceScore, @MJAIAgentNotes_AgentID_AuthorType

    WHILE @@FETCH_STATUS = 0
    BEGIN
        -- Set the FK field to NULL
        SET @MJAIAgentNotes_AgentID_AgentID = NULL

        -- Call the update SP for the related entity
        EXEC [${flyway:defaultSchema}].[spUpdateAIAgentNote] @ID = @MJAIAgentNotes_AgentIDID, @AgentID_Clear = 1, @AgentID = @MJAIAgentNotes_AgentID_AgentID, @AgentNoteTypeID = @MJAIAgentNotes_AgentID_AgentNoteTypeID, @Note = @MJAIAgentNotes_AgentID_Note, @UserID = @MJAIAgentNotes_AgentID_UserID, @Type = @MJAIAgentNotes_AgentID_Type, @IsAutoGenerated = @MJAIAgentNotes_AgentID_IsAutoGenerated, @Comments = @MJAIAgentNotes_AgentID_Comments, @Status = @MJAIAgentNotes_AgentID_Status, @SourceConversationID = @MJAIAgentNotes_AgentID_SourceConversationID, @SourceConversationDetailID = @MJAIAgentNotes_AgentID_SourceConversationDetailID, @SourceAIAgentRunID = @MJAIAgentNotes_AgentID_SourceAIAgentRunID, @CompanyID = @MJAIAgentNotes_AgentID_CompanyID, @EmbeddingVector = @MJAIAgentNotes_AgentID_EmbeddingVector, @EmbeddingModelID = @MJAIAgentNotes_AgentID_EmbeddingModelID, @PrimaryScopeEntityID = @MJAIAgentNotes_AgentID_PrimaryScopeEntityID, @PrimaryScopeRecordID = @MJAIAgentNotes_AgentID_PrimaryScopeRecordID, @SecondaryScopes = @MJAIAgentNotes_AgentID_SecondaryScopes, @LastAccessedAt = @MJAIAgentNotes_AgentID_LastAccessedAt, @AccessCount = @MJAIAgentNotes_AgentID_AccessCount, @ExpiresAt = @MJAIAgentNotes_AgentID_ExpiresAt, @ConsolidatedIntoNoteID = @MJAIAgentNotes_AgentID_ConsolidatedIntoNoteID, @ConsolidationCount = @MJAIAgentNotes_AgentID_ConsolidationCount, @DerivedFromNoteIDs = @MJAIAgentNotes_AgentID_DerivedFromNoteIDs, @ProtectionTier = @MJAIAgentNotes_AgentID_ProtectionTier, @ImportanceScore = @MJAIAgentNotes_AgentID_ImportanceScore, @AuthorType = @MJAIAgentNotes_AgentID_AuthorType

        FETCH NEXT FROM cascade_update_MJAIAgentNotes_AgentID_cursor INTO @MJAIAgentNotes_AgentIDID, @MJAIAgentNotes_AgentID_AgentID, @MJAIAgentNotes_AgentID_AgentNoteTypeID, @MJAIAgentNotes_AgentID_Note, @MJAIAgentNotes_AgentID_UserID, @MJAIAgentNotes_AgentID_Type, @MJAIAgentNotes_AgentID_IsAutoGenerated, @MJAIAgentNotes_AgentID_Comments, @MJAIAgentNotes_AgentID_Status, @MJAIAgentNotes_AgentID_SourceConversationID, @MJAIAgentNotes_AgentID_SourceConversationDetailID, @MJAIAgentNotes_AgentID_SourceAIAgentRunID, @MJAIAgentNotes_AgentID_CompanyID, @MJAIAgentNotes_AgentID_EmbeddingVector, @MJAIAgentNotes_AgentID_EmbeddingModelID, @MJAIAgentNotes_AgentID_PrimaryScopeEntityID, @MJAIAgentNotes_AgentID_PrimaryScopeRecordID, @MJAIAgentNotes_AgentID_SecondaryScopes, @MJAIAgentNotes_AgentID_LastAccessedAt, @MJAIAgentNotes_AgentID_AccessCount, @MJAIAgentNotes_AgentID_ExpiresAt, @MJAIAgentNotes_AgentID_ConsolidatedIntoNoteID, @MJAIAgentNotes_AgentID_ConsolidationCount, @MJAIAgentNotes_AgentID_DerivedFromNoteIDs, @MJAIAgentNotes_AgentID_ProtectionTier, @MJAIAgentNotes_AgentID_ImportanceScore, @MJAIAgentNotes_AgentID_AuthorType
    END

    CLOSE cascade_update_MJAIAgentNotes_AgentID_cursor
    DEALLOCATE cascade_update_MJAIAgentNotes_AgentID_cursor
    
    -- Cascade delete from AIAgentPermission using cursor to call spDeleteAIAgentPermission
    DECLARE @MJAIAgentPermissions_AgentIDID uniqueidentifier
    DECLARE cascade_delete_MJAIAgentPermissions_AgentID_cursor CURSOR FOR 
        SELECT [ID]
        FROM [${flyway:defaultSchema}].[AIAgentPermission]
        WHERE [AgentID] = @ID
    
    OPEN cascade_delete_MJAIAgentPermissions_AgentID_cursor
    FETCH NEXT FROM cascade_delete_MJAIAgentPermissions_AgentID_cursor INTO @MJAIAgentPermissions_AgentIDID
    
    WHILE @@FETCH_STATUS = 0
    BEGIN
        EXEC [${flyway:defaultSchema}].[spDeleteAIAgentPermission] @ID = @MJAIAgentPermissions_AgentIDID
        
        FETCH NEXT FROM cascade_delete_MJAIAgentPermissions_AgentID_cursor INTO @MJAIAgentPermissions_AgentIDID
    END
    
    CLOSE cascade_delete_MJAIAgentPermissions_AgentID_cursor
    DEALLOCATE cascade_delete_MJAIAgentPermissions_AgentID_cursor
    
    -- Cascade delete from AIAgentPrompt using cursor to call spDeleteAIAgentPrompt
    DECLARE @MJAIAgentPrompts_AgentIDID uniqueidentifier
    DECLARE cascade_delete_MJAIAgentPrompts_AgentID_cursor CURSOR FOR 
        SELECT [ID]
        FROM [${flyway:defaultSchema}].[AIAgentPrompt]
        WHERE [AgentID] = @ID
    
    OPEN cascade_delete_MJAIAgentPrompts_AgentID_cursor
    FETCH NEXT FROM cascade_delete_MJAIAgentPrompts_AgentID_cursor INTO @MJAIAgentPrompts_AgentIDID
    
    WHILE @@FETCH_STATUS = 0
    BEGIN
        EXEC [${flyway:defaultSchema}].[spDeleteAIAgentPrompt] @ID = @MJAIAgentPrompts_AgentIDID
        
        FETCH NEXT FROM cascade_delete_MJAIAgentPrompts_AgentID_cursor INTO @MJAIAgentPrompts_AgentIDID
    END
    
    CLOSE cascade_delete_MJAIAgentPrompts_AgentID_cursor
    DEALLOCATE cascade_delete_MJAIAgentPrompts_AgentID_cursor
    
    -- Cascade delete from AIAgentRelationship using cursor to call spDeleteAIAgentRelationship
    DECLARE @MJAIAgentRelationships_AgentIDID uniqueidentifier
    DECLARE cascade_delete_MJAIAgentRelationships_AgentID_cursor CURSOR FOR 
        SELECT [ID]
        FROM [${flyway:defaultSchema}].[AIAgentRelationship]
        WHERE [AgentID] = @ID
    
    OPEN cascade_delete_MJAIAgentRelationships_AgentID_cursor
    FETCH NEXT FROM cascade_delete_MJAIAgentRelationships_AgentID_cursor INTO @MJAIAgentRelationships_AgentIDID
    
    WHILE @@FETCH_STATUS = 0
    BEGIN
        EXEC [${flyway:defaultSchema}].[spDeleteAIAgentRelationship] @ID = @MJAIAgentRelationships_AgentIDID
        
        FETCH NEXT FROM cascade_delete_MJAIAgentRelationships_AgentID_cursor INTO @MJAIAgentRelationships_AgentIDID
    END
    
    CLOSE cascade_delete_MJAIAgentRelationships_AgentID_cursor
    DEALLOCATE cascade_delete_MJAIAgentRelationships_AgentID_cursor
    
    -- Cascade delete from AIAgentRelationship using cursor to call spDeleteAIAgentRelationship
    DECLARE @MJAIAgentRelationships_SubAgentIDID uniqueidentifier
    DECLARE cascade_delete_MJAIAgentRelationships_SubAgentID_cursor CURSOR FOR 
        SELECT [ID]
        FROM [${flyway:defaultSchema}].[AIAgentRelationship]
        WHERE [SubAgentID] = @ID
    
    OPEN cascade_delete_MJAIAgentRelationships_SubAgentID_cursor
    FETCH NEXT FROM cascade_delete_MJAIAgentRelationships_SubAgentID_cursor INTO @MJAIAgentRelationships_SubAgentIDID
    
    WHILE @@FETCH_STATUS = 0
    BEGIN
        EXEC [${flyway:defaultSchema}].[spDeleteAIAgentRelationship] @ID = @MJAIAgentRelationships_SubAgentIDID
        
        FETCH NEXT FROM cascade_delete_MJAIAgentRelationships_SubAgentID_cursor INTO @MJAIAgentRelationships_SubAgentIDID
    END
    
    CLOSE cascade_delete_MJAIAgentRelationships_SubAgentID_cursor
    DEALLOCATE cascade_delete_MJAIAgentRelationships_SubAgentID_cursor
    
    -- Cascade delete from AIAgentRequest using cursor to call spDeleteAIAgentRequest
    DECLARE @MJAIAgentRequests_AgentIDID uniqueidentifier
    DECLARE cascade_delete_MJAIAgentRequests_AgentID_cursor CURSOR FOR 
        SELECT [ID]
        FROM [${flyway:defaultSchema}].[AIAgentRequest]
        WHERE [AgentID] = @ID
    
    OPEN cascade_delete_MJAIAgentRequests_AgentID_cursor
    FETCH NEXT FROM cascade_delete_MJAIAgentRequests_AgentID_cursor INTO @MJAIAgentRequests_AgentIDID
    
    WHILE @@FETCH_STATUS = 0
    BEGIN
        EXEC [${flyway:defaultSchema}].[spDeleteAIAgentRequest] @ID = @MJAIAgentRequests_AgentIDID
        
        FETCH NEXT FROM cascade_delete_MJAIAgentRequests_AgentID_cursor INTO @MJAIAgentRequests_AgentIDID
    END
    
    CLOSE cascade_delete_MJAIAgentRequests_AgentID_cursor
    DEALLOCATE cascade_delete_MJAIAgentRequests_AgentID_cursor
    
    -- Cascade delete from AIAgentRun using cursor to call spDeleteAIAgentRun
    DECLARE @MJAIAgentRuns_AgentIDID uniqueidentifier
    DECLARE cascade_delete_MJAIAgentRuns_AgentID_cursor CURSOR FOR 
        SELECT [ID]
        FROM [${flyway:defaultSchema}].[AIAgentRun]
        WHERE [AgentID] = @ID
    
    OPEN cascade_delete_MJAIAgentRuns_AgentID_cursor
    FETCH NEXT FROM cascade_delete_MJAIAgentRuns_AgentID_cursor INTO @MJAIAgentRuns_AgentIDID
    
    WHILE @@FETCH_STATUS = 0
    BEGIN
        EXEC [${flyway:defaultSchema}].[spDeleteAIAgentRun] @ID = @MJAIAgentRuns_AgentIDID
        
        FETCH NEXT FROM cascade_delete_MJAIAgentRuns_AgentID_cursor INTO @MJAIAgentRuns_AgentIDID
    END
    
    CLOSE cascade_delete_MJAIAgentRuns_AgentID_cursor
    DEALLOCATE cascade_delete_MJAIAgentRuns_AgentID_cursor
    
    -- Cascade delete from AIAgentSearchScope using cursor to call spDeleteAIAgentSearchScope
    DECLARE @MJAIAgentSearchScopes_AgentIDID uniqueidentifier
    DECLARE cascade_delete_MJAIAgentSearchScopes_AgentID_cursor CURSOR FOR 
        SELECT [ID]
        FROM [${flyway:defaultSchema}].[AIAgentSearchScope]
        WHERE [AgentID] = @ID
    
    OPEN cascade_delete_MJAIAgentSearchScopes_AgentID_cursor
    FETCH NEXT FROM cascade_delete_MJAIAgentSearchScopes_AgentID_cursor INTO @MJAIAgentSearchScopes_AgentIDID
    
    WHILE @@FETCH_STATUS = 0
    BEGIN
        EXEC [${flyway:defaultSchema}].[spDeleteAIAgentSearchScope] @ID = @MJAIAgentSearchScopes_AgentIDID
        
        FETCH NEXT FROM cascade_delete_MJAIAgentSearchScopes_AgentID_cursor INTO @MJAIAgentSearchScopes_AgentIDID
    END
    
    CLOSE cascade_delete_MJAIAgentSearchScopes_AgentID_cursor
    DEALLOCATE cascade_delete_MJAIAgentSearchScopes_AgentID_cursor
    
    -- Cascade delete from AIAgentSession using cursor to call spDeleteAIAgentSession
    DECLARE @MJAIAgentSessions_AgentIDID uniqueidentifier
    DECLARE cascade_delete_MJAIAgentSessions_AgentID_cursor CURSOR FOR 
        SELECT [ID]
        FROM [${flyway:defaultSchema}].[AIAgentSession]
        WHERE [AgentID] = @ID
    
    OPEN cascade_delete_MJAIAgentSessions_AgentID_cursor
    FETCH NEXT FROM cascade_delete_MJAIAgentSessions_AgentID_cursor INTO @MJAIAgentSessions_AgentIDID
    
    WHILE @@FETCH_STATUS = 0
    BEGIN
        EXEC [${flyway:defaultSchema}].[spDeleteAIAgentSession] @ID = @MJAIAgentSessions_AgentIDID
        
        FETCH NEXT FROM cascade_delete_MJAIAgentSessions_AgentID_cursor INTO @MJAIAgentSessions_AgentIDID
    END
    
    CLOSE cascade_delete_MJAIAgentSessions_AgentID_cursor
    DEALLOCATE cascade_delete_MJAIAgentSessions_AgentID_cursor
    
    -- Cascade delete from AIAgentSkill using cursor to call spDeleteAIAgentSkill
    DECLARE @MJAIAgentSkills_AgentIDID uniqueidentifier
    DECLARE cascade_delete_MJAIAgentSkills_AgentID_cursor CURSOR FOR 
        SELECT [ID]
        FROM [${flyway:defaultSchema}].[AIAgentSkill]
        WHERE [AgentID] = @ID
    
    OPEN cascade_delete_MJAIAgentSkills_AgentID_cursor
    FETCH NEXT FROM cascade_delete_MJAIAgentSkills_AgentID_cursor INTO @MJAIAgentSkills_AgentIDID
    
    WHILE @@FETCH_STATUS = 0
    BEGIN
        EXEC [${flyway:defaultSchema}].[spDeleteAIAgentSkill] @ID = @MJAIAgentSkills_AgentIDID
        
        FETCH NEXT FROM cascade_delete_MJAIAgentSkills_AgentID_cursor INTO @MJAIAgentSkills_AgentIDID
    END
    
    CLOSE cascade_delete_MJAIAgentSkills_AgentID_cursor
    DEALLOCATE cascade_delete_MJAIAgentSkills_AgentID_cursor
    
    -- Cascade delete from AIAgentStep using cursor to call spDeleteAIAgentStep
    DECLARE @MJAIAgentSteps_AgentIDID uniqueidentifier
    DECLARE cascade_delete_MJAIAgentSteps_AgentID_cursor CURSOR FOR 
        SELECT [ID]
        FROM [${flyway:defaultSchema}].[AIAgentStep]
        WHERE [AgentID] = @ID
    
    OPEN cascade_delete_MJAIAgentSteps_AgentID_cursor
    FETCH NEXT FROM cascade_delete_MJAIAgentSteps_AgentID_cursor INTO @MJAIAgentSteps_AgentIDID
    
    WHILE @@FETCH_STATUS = 0
    BEGIN
        EXEC [${flyway:defaultSchema}].[spDeleteAIAgentStep] @ID = @MJAIAgentSteps_AgentIDID
        
        FETCH NEXT FROM cascade_delete_MJAIAgentSteps_AgentID_cursor INTO @MJAIAgentSteps_AgentIDID
    END
    
    CLOSE cascade_delete_MJAIAgentSteps_AgentID_cursor
    DEALLOCATE cascade_delete_MJAIAgentSteps_AgentID_cursor
    
    -- Cascade update on AIAgentStep using cursor to call spUpdateAIAgentStep
    DECLARE @MJAIAgentSteps_SubAgentIDID uniqueidentifier
    DECLARE @MJAIAgentSteps_SubAgentID_AgentID uniqueidentifier
    DECLARE @MJAIAgentSteps_SubAgentID_Name nvarchar(255)
    DECLARE @MJAIAgentSteps_SubAgentID_Description nvarchar(MAX)
    DECLARE @MJAIAgentSteps_SubAgentID_StepType nvarchar(20)
    DECLARE @MJAIAgentSteps_SubAgentID_StartingStep bit
    DECLARE @MJAIAgentSteps_SubAgentID_TimeoutSeconds int
    DECLARE @MJAIAgentSteps_SubAgentID_RetryCount int
    DECLARE @MJAIAgentSteps_SubAgentID_OnErrorBehavior nvarchar(20)
    DECLARE @MJAIAgentSteps_SubAgentID_ActionID uniqueidentifier
    DECLARE @MJAIAgentSteps_SubAgentID_SubAgentID uniqueidentifier
    DECLARE @MJAIAgentSteps_SubAgentID_PromptID uniqueidentifier
    DECLARE @MJAIAgentSteps_SubAgentID_ActionOutputMapping nvarchar(MAX)
    DECLARE @MJAIAgentSteps_SubAgentID_PositionX int
    DECLARE @MJAIAgentSteps_SubAgentID_PositionY int
    DECLARE @MJAIAgentSteps_SubAgentID_Width int
    DECLARE @MJAIAgentSteps_SubAgentID_Height int
    DECLARE @MJAIAgentSteps_SubAgentID_Status nvarchar(20)
    DECLARE @MJAIAgentSteps_SubAgentID_ActionInputMapping nvarchar(MAX)
    DECLARE @MJAIAgentSteps_SubAgentID_LoopBodyType nvarchar(50)
    DECLARE @MJAIAgentSteps_SubAgentID_Configuration nvarchar(MAX)
    DECLARE cascade_update_MJAIAgentSteps_SubAgentID_cursor CURSOR FOR
        SELECT [ID], [AgentID], [Name], [Description], [StepType], [StartingStep], [TimeoutSeconds], [RetryCount], [OnErrorBehavior], [ActionID], [SubAgentID], [PromptID], [ActionOutputMapping], [PositionX], [PositionY], [Width], [Height], [Status], [ActionInputMapping], [LoopBodyType], [Configuration]
        FROM [${flyway:defaultSchema}].[AIAgentStep]
        WHERE [SubAgentID] = @ID

    OPEN cascade_update_MJAIAgentSteps_SubAgentID_cursor
    FETCH NEXT FROM cascade_update_MJAIAgentSteps_SubAgentID_cursor INTO @MJAIAgentSteps_SubAgentIDID, @MJAIAgentSteps_SubAgentID_AgentID, @MJAIAgentSteps_SubAgentID_Name, @MJAIAgentSteps_SubAgentID_Description, @MJAIAgentSteps_SubAgentID_StepType, @MJAIAgentSteps_SubAgentID_StartingStep, @MJAIAgentSteps_SubAgentID_TimeoutSeconds, @MJAIAgentSteps_SubAgentID_RetryCount, @MJAIAgentSteps_SubAgentID_OnErrorBehavior, @MJAIAgentSteps_SubAgentID_ActionID, @MJAIAgentSteps_SubAgentID_SubAgentID, @MJAIAgentSteps_SubAgentID_PromptID, @MJAIAgentSteps_SubAgentID_ActionOutputMapping, @MJAIAgentSteps_SubAgentID_PositionX, @MJAIAgentSteps_SubAgentID_PositionY, @MJAIAgentSteps_SubAgentID_Width, @MJAIAgentSteps_SubAgentID_Height, @MJAIAgentSteps_SubAgentID_Status, @MJAIAgentSteps_SubAgentID_ActionInputMapping, @MJAIAgentSteps_SubAgentID_LoopBodyType, @MJAIAgentSteps_SubAgentID_Configuration

    WHILE @@FETCH_STATUS = 0
    BEGIN
        -- Set the FK field to NULL
        SET @MJAIAgentSteps_SubAgentID_SubAgentID = NULL

        -- Call the update SP for the related entity
        EXEC [${flyway:defaultSchema}].[spUpdateAIAgentStep] @ID = @MJAIAgentSteps_SubAgentIDID, @AgentID = @MJAIAgentSteps_SubAgentID_AgentID, @Name = @MJAIAgentSteps_SubAgentID_Name, @Description = @MJAIAgentSteps_SubAgentID_Description, @StepType = @MJAIAgentSteps_SubAgentID_StepType, @StartingStep = @MJAIAgentSteps_SubAgentID_StartingStep, @TimeoutSeconds = @MJAIAgentSteps_SubAgentID_TimeoutSeconds, @RetryCount = @MJAIAgentSteps_SubAgentID_RetryCount, @OnErrorBehavior = @MJAIAgentSteps_SubAgentID_OnErrorBehavior, @ActionID = @MJAIAgentSteps_SubAgentID_ActionID, @SubAgentID_Clear = 1, @SubAgentID = @MJAIAgentSteps_SubAgentID_SubAgentID, @PromptID = @MJAIAgentSteps_SubAgentID_PromptID, @ActionOutputMapping = @MJAIAgentSteps_SubAgentID_ActionOutputMapping, @PositionX = @MJAIAgentSteps_SubAgentID_PositionX, @PositionY = @MJAIAgentSteps_SubAgentID_PositionY, @Width = @MJAIAgentSteps_SubAgentID_Width, @Height = @MJAIAgentSteps_SubAgentID_Height, @Status = @MJAIAgentSteps_SubAgentID_Status, @ActionInputMapping = @MJAIAgentSteps_SubAgentID_ActionInputMapping, @LoopBodyType = @MJAIAgentSteps_SubAgentID_LoopBodyType, @Configuration = @MJAIAgentSteps_SubAgentID_Configuration

        FETCH NEXT FROM cascade_update_MJAIAgentSteps_SubAgentID_cursor INTO @MJAIAgentSteps_SubAgentIDID, @MJAIAgentSteps_SubAgentID_AgentID, @MJAIAgentSteps_SubAgentID_Name, @MJAIAgentSteps_SubAgentID_Description, @MJAIAgentSteps_SubAgentID_StepType, @MJAIAgentSteps_SubAgentID_StartingStep, @MJAIAgentSteps_SubAgentID_TimeoutSeconds, @MJAIAgentSteps_SubAgentID_RetryCount, @MJAIAgentSteps_SubAgentID_OnErrorBehavior, @MJAIAgentSteps_SubAgentID_ActionID, @MJAIAgentSteps_SubAgentID_SubAgentID, @MJAIAgentSteps_SubAgentID_PromptID, @MJAIAgentSteps_SubAgentID_ActionOutputMapping, @MJAIAgentSteps_SubAgentID_PositionX, @MJAIAgentSteps_SubAgentID_PositionY, @MJAIAgentSteps_SubAgentID_Width, @MJAIAgentSteps_SubAgentID_Height, @MJAIAgentSteps_SubAgentID_Status, @MJAIAgentSteps_SubAgentID_ActionInputMapping, @MJAIAgentSteps_SubAgentID_LoopBodyType, @MJAIAgentSteps_SubAgentID_Configuration
    END

    CLOSE cascade_update_MJAIAgentSteps_SubAgentID_cursor
    DEALLOCATE cascade_update_MJAIAgentSteps_SubAgentID_cursor
    
    -- Cascade update on AIAgent using cursor to call spUpdateAIAgent
    DECLARE @MJAIAgents_ParentIDID uniqueidentifier
    DECLARE @MJAIAgents_ParentID_Name nvarchar(255)
    DECLARE @MJAIAgents_ParentID_Description nvarchar(MAX)
    DECLARE @MJAIAgents_ParentID_LogoURL nvarchar(255)
    DECLARE @MJAIAgents_ParentID_ParentID uniqueidentifier
    DECLARE @MJAIAgents_ParentID_ExposeAsAction bit
    DECLARE @MJAIAgents_ParentID_ExecutionOrder int
    DECLARE @MJAIAgents_ParentID_ExecutionMode nvarchar(20)
    DECLARE @MJAIAgents_ParentID_EnableContextCompression bit
    DECLARE @MJAIAgents_ParentID_ContextCompressionMessageThreshold int
    DECLARE @MJAIAgents_ParentID_ContextCompressionPromptID uniqueidentifier
    DECLARE @MJAIAgents_ParentID_ContextCompressionMessageRetentionCount int
    DECLARE @MJAIAgents_ParentID_TypeID uniqueidentifier
    DECLARE @MJAIAgents_ParentID_Status nvarchar(20)
    DECLARE @MJAIAgents_ParentID_DriverClass nvarchar(255)
    DECLARE @MJAIAgents_ParentID_IconClass nvarchar(100)
    DECLARE @MJAIAgents_ParentID_ModelSelectionMode nvarchar(50)
    DECLARE @MJAIAgents_ParentID_PayloadDownstreamPaths nvarchar(MAX)
    DECLARE @MJAIAgents_ParentID_PayloadUpstreamPaths nvarchar(MAX)
    DECLARE @MJAIAgents_ParentID_PayloadSelfReadPaths nvarchar(MAX)
    DECLARE @MJAIAgents_ParentID_PayloadSelfWritePaths nvarchar(MAX)
    DECLARE @MJAIAgents_ParentID_PayloadScope nvarchar(MAX)
    DECLARE @MJAIAgents_ParentID_FinalPayloadValidation nvarchar(MAX)
    DECLARE @MJAIAgents_ParentID_FinalPayloadValidationMode nvarchar(25)
    DECLARE @MJAIAgents_ParentID_FinalPayloadValidationMaxRetries int
    DECLARE @MJAIAgents_ParentID_MaxCostPerRun decimal(10, 4)
    DECLARE @MJAIAgents_ParentID_MaxTokensPerRun int
    DECLARE @MJAIAgents_ParentID_MaxIterationsPerRun int
    DECLARE @MJAIAgents_ParentID_MaxTimePerRun int
    DECLARE @MJAIAgents_ParentID_MinExecutionsPerRun int
    DECLARE @MJAIAgents_ParentID_MaxExecutionsPerRun int
    DECLARE @MJAIAgents_ParentID_StartingPayloadValidation nvarchar(MAX)
    DECLARE @MJAIAgents_ParentID_StartingPayloadValidationMode nvarchar(25)
    DECLARE @MJAIAgents_ParentID_DefaultPromptEffortLevel int
    DECLARE @MJAIAgents_ParentID_ChatHandlingOption nvarchar(30)
    DECLARE @MJAIAgents_ParentID_DefaultArtifactTypeID uniqueidentifier
    DECLARE @MJAIAgents_ParentID_OwnerUserID uniqueidentifier
    DECLARE @MJAIAgents_ParentID_InvocationMode nvarchar(20)
    DECLARE @MJAIAgents_ParentID_ArtifactCreationMode nvarchar(20)
    DECLARE @MJAIAgents_ParentID_FunctionalRequirements nvarchar(MAX)
    DECLARE @MJAIAgents_ParentID_TechnicalDesign nvarchar(MAX)
    DECLARE @MJAIAgents_ParentID_InjectNotes bit
    DECLARE @MJAIAgents_ParentID_MaxNotesToInject int
    DECLARE @MJAIAgents_ParentID_NoteInjectionStrategy nvarchar(20)
    DECLARE @MJAIAgents_ParentID_InjectExamples bit
    DECLARE @MJAIAgents_ParentID_MaxExamplesToInject int
    DECLARE @MJAIAgents_ParentID_ExampleInjectionStrategy nvarchar(20)
    DECLARE @MJAIAgents_ParentID_IsRestricted bit
    DECLARE @MJAIAgents_ParentID_MessageMode nvarchar(50)
    DECLARE @MJAIAgents_ParentID_MaxMessages int
    DECLARE @MJAIAgents_ParentID_AttachmentStorageProviderID uniqueidentifier
    DECLARE @MJAIAgents_ParentID_AttachmentRootPath nvarchar(500)
    DECLARE @MJAIAgents_ParentID_InlineStorageThresholdBytes int
    DECLARE @MJAIAgents_ParentID_AgentTypePromptParams nvarchar(MAX)
    DECLARE @MJAIAgents_ParentID_ScopeConfig nvarchar(MAX)
    DECLARE @MJAIAgents_ParentID_NoteRetentionDays int
    DECLARE @MJAIAgents_ParentID_ExampleRetentionDays int
    DECLARE @MJAIAgents_ParentID_AutoArchiveEnabled bit
    DECLARE @MJAIAgents_ParentID_RerankerConfiguration nvarchar(MAX)
    DECLARE @MJAIAgents_ParentID_CategoryID uniqueidentifier
    DECLARE @MJAIAgents_ParentID_AllowEphemeralClientTools bit
    DECLARE @MJAIAgents_ParentID_DefaultStorageAccountID uniqueidentifier
    DECLARE @MJAIAgents_ParentID_SearchScopeAccess nvarchar(20)
    DECLARE @MJAIAgents_ParentID_AcceptUnregisteredFiles bit
    DECLARE @MJAIAgents_ParentID_DefaultCoAgentID uniqueidentifier
    DECLARE @MJAIAgents_ParentID_TypeConfiguration nvarchar(MAX)
    DECLARE @MJAIAgents_ParentID_AllowMemoryWrite bit
    DECLARE @MJAIAgents_ParentID_RecordingDefault nvarchar(20)
    DECLARE @MJAIAgents_ParentID_RecordingStorageProviderID uniqueidentifier
    DECLARE @MJAIAgents_ParentID_DefaultMediaCollectionID uniqueidentifier
    DECLARE @MJAIAgents_ParentID_SupportsPlanMode bit
    DECLARE @MJAIAgents_ParentID_AcceptsSkills nvarchar(20)
    DECLARE @MJAIAgents_ParentID_SkillActivationMode nvarchar(20)
    DECLARE @MJAIAgents_ParentID_RequirePlanMode bit
    DECLARE @MJAIAgents_ParentID_ContextWindowMaxTokens int
    DECLARE @MJAIAgents_ParentID_CompactionTriggerPercent int
    DECLARE @MJAIAgents_ParentID_CompactionTargetPercent int
    DECLARE @MJAIAgents_ParentID_ConversationSummaryPromptID uniqueidentifier
    DECLARE cascade_update_MJAIAgents_ParentID_cursor CURSOR FOR
        SELECT [ID], [Name], [Description], [LogoURL], [ParentID], [ExposeAsAction], [ExecutionOrder], [ExecutionMode], [EnableContextCompression], [ContextCompressionMessageThreshold], [ContextCompressionPromptID], [ContextCompressionMessageRetentionCount], [TypeID], [Status], [DriverClass], [IconClass], [ModelSelectionMode], [PayloadDownstreamPaths], [PayloadUpstreamPaths], [PayloadSelfReadPaths], [PayloadSelfWritePaths], [PayloadScope], [FinalPayloadValidation], [FinalPayloadValidationMode], [FinalPayloadValidationMaxRetries], [MaxCostPerRun], [MaxTokensPerRun], [MaxIterationsPerRun], [MaxTimePerRun], [MinExecutionsPerRun], [MaxExecutionsPerRun], [StartingPayloadValidation], [StartingPayloadValidationMode], [DefaultPromptEffortLevel], [ChatHandlingOption], [DefaultArtifactTypeID], [OwnerUserID], [InvocationMode], [ArtifactCreationMode], [FunctionalRequirements], [TechnicalDesign], [InjectNotes], [MaxNotesToInject], [NoteInjectionStrategy], [InjectExamples], [MaxExamplesToInject], [ExampleInjectionStrategy], [IsRestricted], [MessageMode], [MaxMessages], [AttachmentStorageProviderID], [AttachmentRootPath], [InlineStorageThresholdBytes], [AgentTypePromptParams], [ScopeConfig], [NoteRetentionDays], [ExampleRetentionDays], [AutoArchiveEnabled], [RerankerConfiguration], [CategoryID], [AllowEphemeralClientTools], [DefaultStorageAccountID], [SearchScopeAccess], [AcceptUnregisteredFiles], [DefaultCoAgentID], [TypeConfiguration], [AllowMemoryWrite], [RecordingDefault], [RecordingStorageProviderID], [DefaultMediaCollectionID], [SupportsPlanMode], [AcceptsSkills], [SkillActivationMode], [RequirePlanMode], [ContextWindowMaxTokens], [CompactionTriggerPercent], [CompactionTargetPercent], [ConversationSummaryPromptID]
        FROM [${flyway:defaultSchema}].[AIAgent]
        WHERE [ParentID] = @ID

    OPEN cascade_update_MJAIAgents_ParentID_cursor
    FETCH NEXT FROM cascade_update_MJAIAgents_ParentID_cursor INTO @MJAIAgents_ParentIDID, @MJAIAgents_ParentID_Name, @MJAIAgents_ParentID_Description, @MJAIAgents_ParentID_LogoURL, @MJAIAgents_ParentID_ParentID, @MJAIAgents_ParentID_ExposeAsAction, @MJAIAgents_ParentID_ExecutionOrder, @MJAIAgents_ParentID_ExecutionMode, @MJAIAgents_ParentID_EnableContextCompression, @MJAIAgents_ParentID_ContextCompressionMessageThreshold, @MJAIAgents_ParentID_ContextCompressionPromptID, @MJAIAgents_ParentID_ContextCompressionMessageRetentionCount, @MJAIAgents_ParentID_TypeID, @MJAIAgents_ParentID_Status, @MJAIAgents_ParentID_DriverClass, @MJAIAgents_ParentID_IconClass, @MJAIAgents_ParentID_ModelSelectionMode, @MJAIAgents_ParentID_PayloadDownstreamPaths, @MJAIAgents_ParentID_PayloadUpstreamPaths, @MJAIAgents_ParentID_PayloadSelfReadPaths, @MJAIAgents_ParentID_PayloadSelfWritePaths, @MJAIAgents_ParentID_PayloadScope, @MJAIAgents_ParentID_FinalPayloadValidation, @MJAIAgents_ParentID_FinalPayloadValidationMode, @MJAIAgents_ParentID_FinalPayloadValidationMaxRetries, @MJAIAgents_ParentID_MaxCostPerRun, @MJAIAgents_ParentID_MaxTokensPerRun, @MJAIAgents_ParentID_MaxIterationsPerRun, @MJAIAgents_ParentID_MaxTimePerRun, @MJAIAgents_ParentID_MinExecutionsPerRun, @MJAIAgents_ParentID_MaxExecutionsPerRun, @MJAIAgents_ParentID_StartingPayloadValidation, @MJAIAgents_ParentID_StartingPayloadValidationMode, @MJAIAgents_ParentID_DefaultPromptEffortLevel, @MJAIAgents_ParentID_ChatHandlingOption, @MJAIAgents_ParentID_DefaultArtifactTypeID, @MJAIAgents_ParentID_OwnerUserID, @MJAIAgents_ParentID_InvocationMode, @MJAIAgents_ParentID_ArtifactCreationMode, @MJAIAgents_ParentID_FunctionalRequirements, @MJAIAgents_ParentID_TechnicalDesign, @MJAIAgents_ParentID_InjectNotes, @MJAIAgents_ParentID_MaxNotesToInject, @MJAIAgents_ParentID_NoteInjectionStrategy, @MJAIAgents_ParentID_InjectExamples, @MJAIAgents_ParentID_MaxExamplesToInject, @MJAIAgents_ParentID_ExampleInjectionStrategy, @MJAIAgents_ParentID_IsRestricted, @MJAIAgents_ParentID_MessageMode, @MJAIAgents_ParentID_MaxMessages, @MJAIAgents_ParentID_AttachmentStorageProviderID, @MJAIAgents_ParentID_AttachmentRootPath, @MJAIAgents_ParentID_InlineStorageThresholdBytes, @MJAIAgents_ParentID_AgentTypePromptParams, @MJAIAgents_ParentID_ScopeConfig, @MJAIAgents_ParentID_NoteRetentionDays, @MJAIAgents_ParentID_ExampleRetentionDays, @MJAIAgents_ParentID_AutoArchiveEnabled, @MJAIAgents_ParentID_RerankerConfiguration, @MJAIAgents_ParentID_CategoryID, @MJAIAgents_ParentID_AllowEphemeralClientTools, @MJAIAgents_ParentID_DefaultStorageAccountID, @MJAIAgents_ParentID_SearchScopeAccess, @MJAIAgents_ParentID_AcceptUnregisteredFiles, @MJAIAgents_ParentID_DefaultCoAgentID, @MJAIAgents_ParentID_TypeConfiguration, @MJAIAgents_ParentID_AllowMemoryWrite, @MJAIAgents_ParentID_RecordingDefault, @MJAIAgents_ParentID_RecordingStorageProviderID, @MJAIAgents_ParentID_DefaultMediaCollectionID, @MJAIAgents_ParentID_SupportsPlanMode, @MJAIAgents_ParentID_AcceptsSkills, @MJAIAgents_ParentID_SkillActivationMode, @MJAIAgents_ParentID_RequirePlanMode, @MJAIAgents_ParentID_ContextWindowMaxTokens, @MJAIAgents_ParentID_CompactionTriggerPercent, @MJAIAgents_ParentID_CompactionTargetPercent, @MJAIAgents_ParentID_ConversationSummaryPromptID

    WHILE @@FETCH_STATUS = 0
    BEGIN
        -- Set the FK field to NULL
        SET @MJAIAgents_ParentID_ParentID = NULL

        -- Call the update SP for the related entity
        EXEC [${flyway:defaultSchema}].[spUpdateAIAgent] @ID = @MJAIAgents_ParentIDID, @Name = @MJAIAgents_ParentID_Name, @Description = @MJAIAgents_ParentID_Description, @LogoURL = @MJAIAgents_ParentID_LogoURL, @ParentID_Clear = 1, @ParentID = @MJAIAgents_ParentID_ParentID, @ExposeAsAction = @MJAIAgents_ParentID_ExposeAsAction, @ExecutionOrder = @MJAIAgents_ParentID_ExecutionOrder, @ExecutionMode = @MJAIAgents_ParentID_ExecutionMode, @EnableContextCompression = @MJAIAgents_ParentID_EnableContextCompression, @ContextCompressionMessageThreshold = @MJAIAgents_ParentID_ContextCompressionMessageThreshold, @ContextCompressionPromptID = @MJAIAgents_ParentID_ContextCompressionPromptID, @ContextCompressionMessageRetentionCount = @MJAIAgents_ParentID_ContextCompressionMessageRetentionCount, @TypeID = @MJAIAgents_ParentID_TypeID, @Status = @MJAIAgents_ParentID_Status, @DriverClass = @MJAIAgents_ParentID_DriverClass, @IconClass = @MJAIAgents_ParentID_IconClass, @ModelSelectionMode = @MJAIAgents_ParentID_ModelSelectionMode, @PayloadDownstreamPaths = @MJAIAgents_ParentID_PayloadDownstreamPaths, @PayloadUpstreamPaths = @MJAIAgents_ParentID_PayloadUpstreamPaths, @PayloadSelfReadPaths = @MJAIAgents_ParentID_PayloadSelfReadPaths, @PayloadSelfWritePaths = @MJAIAgents_ParentID_PayloadSelfWritePaths, @PayloadScope = @MJAIAgents_ParentID_PayloadScope, @FinalPayloadValidation = @MJAIAgents_ParentID_FinalPayloadValidation, @FinalPayloadValidationMode = @MJAIAgents_ParentID_FinalPayloadValidationMode, @FinalPayloadValidationMaxRetries = @MJAIAgents_ParentID_FinalPayloadValidationMaxRetries, @MaxCostPerRun = @MJAIAgents_ParentID_MaxCostPerRun, @MaxTokensPerRun = @MJAIAgents_ParentID_MaxTokensPerRun, @MaxIterationsPerRun = @MJAIAgents_ParentID_MaxIterationsPerRun, @MaxTimePerRun = @MJAIAgents_ParentID_MaxTimePerRun, @MinExecutionsPerRun = @MJAIAgents_ParentID_MinExecutionsPerRun, @MaxExecutionsPerRun = @MJAIAgents_ParentID_MaxExecutionsPerRun, @StartingPayloadValidation = @MJAIAgents_ParentID_StartingPayloadValidation, @StartingPayloadValidationMode = @MJAIAgents_ParentID_StartingPayloadValidationMode, @DefaultPromptEffortLevel = @MJAIAgents_ParentID_DefaultPromptEffortLevel, @ChatHandlingOption = @MJAIAgents_ParentID_ChatHandlingOption, @DefaultArtifactTypeID = @MJAIAgents_ParentID_DefaultArtifactTypeID, @OwnerUserID = @MJAIAgents_ParentID_OwnerUserID, @InvocationMode = @MJAIAgents_ParentID_InvocationMode, @ArtifactCreationMode = @MJAIAgents_ParentID_ArtifactCreationMode, @FunctionalRequirements = @MJAIAgents_ParentID_FunctionalRequirements, @TechnicalDesign = @MJAIAgents_ParentID_TechnicalDesign, @InjectNotes = @MJAIAgents_ParentID_InjectNotes, @MaxNotesToInject = @MJAIAgents_ParentID_MaxNotesToInject, @NoteInjectionStrategy = @MJAIAgents_ParentID_NoteInjectionStrategy, @InjectExamples = @MJAIAgents_ParentID_InjectExamples, @MaxExamplesToInject = @MJAIAgents_ParentID_MaxExamplesToInject, @ExampleInjectionStrategy = @MJAIAgents_ParentID_ExampleInjectionStrategy, @IsRestricted = @MJAIAgents_ParentID_IsRestricted, @MessageMode = @MJAIAgents_ParentID_MessageMode, @MaxMessages = @MJAIAgents_ParentID_MaxMessages, @AttachmentStorageProviderID = @MJAIAgents_ParentID_AttachmentStorageProviderID, @AttachmentRootPath = @MJAIAgents_ParentID_AttachmentRootPath, @InlineStorageThresholdBytes = @MJAIAgents_ParentID_InlineStorageThresholdBytes, @AgentTypePromptParams = @MJAIAgents_ParentID_AgentTypePromptParams, @ScopeConfig = @MJAIAgents_ParentID_ScopeConfig, @NoteRetentionDays = @MJAIAgents_ParentID_NoteRetentionDays, @ExampleRetentionDays = @MJAIAgents_ParentID_ExampleRetentionDays, @AutoArchiveEnabled = @MJAIAgents_ParentID_AutoArchiveEnabled, @RerankerConfiguration = @MJAIAgents_ParentID_RerankerConfiguration, @CategoryID = @MJAIAgents_ParentID_CategoryID, @AllowEphemeralClientTools = @MJAIAgents_ParentID_AllowEphemeralClientTools, @DefaultStorageAccountID = @MJAIAgents_ParentID_DefaultStorageAccountID, @SearchScopeAccess = @MJAIAgents_ParentID_SearchScopeAccess, @AcceptUnregisteredFiles = @MJAIAgents_ParentID_AcceptUnregisteredFiles, @DefaultCoAgentID = @MJAIAgents_ParentID_DefaultCoAgentID, @TypeConfiguration = @MJAIAgents_ParentID_TypeConfiguration, @AllowMemoryWrite = @MJAIAgents_ParentID_AllowMemoryWrite, @RecordingDefault = @MJAIAgents_ParentID_RecordingDefault, @RecordingStorageProviderID = @MJAIAgents_ParentID_RecordingStorageProviderID, @DefaultMediaCollectionID = @MJAIAgents_ParentID_DefaultMediaCollectionID, @SupportsPlanMode = @MJAIAgents_ParentID_SupportsPlanMode, @AcceptsSkills = @MJAIAgents_ParentID_AcceptsSkills, @SkillActivationMode = @MJAIAgents_ParentID_SkillActivationMode, @RequirePlanMode = @MJAIAgents_ParentID_RequirePlanMode, @ContextWindowMaxTokens = @MJAIAgents_ParentID_ContextWindowMaxTokens, @CompactionTriggerPercent = @MJAIAgents_ParentID_CompactionTriggerPercent, @CompactionTargetPercent = @MJAIAgents_ParentID_CompactionTargetPercent, @ConversationSummaryPromptID = @MJAIAgents_ParentID_ConversationSummaryPromptID

        FETCH NEXT FROM cascade_update_MJAIAgents_ParentID_cursor INTO @MJAIAgents_ParentIDID, @MJAIAgents_ParentID_Name, @MJAIAgents_ParentID_Description, @MJAIAgents_ParentID_LogoURL, @MJAIAgents_ParentID_ParentID, @MJAIAgents_ParentID_ExposeAsAction, @MJAIAgents_ParentID_ExecutionOrder, @MJAIAgents_ParentID_ExecutionMode, @MJAIAgents_ParentID_EnableContextCompression, @MJAIAgents_ParentID_ContextCompressionMessageThreshold, @MJAIAgents_ParentID_ContextCompressionPromptID, @MJAIAgents_ParentID_ContextCompressionMessageRetentionCount, @MJAIAgents_ParentID_TypeID, @MJAIAgents_ParentID_Status, @MJAIAgents_ParentID_DriverClass, @MJAIAgents_ParentID_IconClass, @MJAIAgents_ParentID_ModelSelectionMode, @MJAIAgents_ParentID_PayloadDownstreamPaths, @MJAIAgents_ParentID_PayloadUpstreamPaths, @MJAIAgents_ParentID_PayloadSelfReadPaths, @MJAIAgents_ParentID_PayloadSelfWritePaths, @MJAIAgents_ParentID_PayloadScope, @MJAIAgents_ParentID_FinalPayloadValidation, @MJAIAgents_ParentID_FinalPayloadValidationMode, @MJAIAgents_ParentID_FinalPayloadValidationMaxRetries, @MJAIAgents_ParentID_MaxCostPerRun, @MJAIAgents_ParentID_MaxTokensPerRun, @MJAIAgents_ParentID_MaxIterationsPerRun, @MJAIAgents_ParentID_MaxTimePerRun, @MJAIAgents_ParentID_MinExecutionsPerRun, @MJAIAgents_ParentID_MaxExecutionsPerRun, @MJAIAgents_ParentID_StartingPayloadValidation, @MJAIAgents_ParentID_StartingPayloadValidationMode, @MJAIAgents_ParentID_DefaultPromptEffortLevel, @MJAIAgents_ParentID_ChatHandlingOption, @MJAIAgents_ParentID_DefaultArtifactTypeID, @MJAIAgents_ParentID_OwnerUserID, @MJAIAgents_ParentID_InvocationMode, @MJAIAgents_ParentID_ArtifactCreationMode, @MJAIAgents_ParentID_FunctionalRequirements, @MJAIAgents_ParentID_TechnicalDesign, @MJAIAgents_ParentID_InjectNotes, @MJAIAgents_ParentID_MaxNotesToInject, @MJAIAgents_ParentID_NoteInjectionStrategy, @MJAIAgents_ParentID_InjectExamples, @MJAIAgents_ParentID_MaxExamplesToInject, @MJAIAgents_ParentID_ExampleInjectionStrategy, @MJAIAgents_ParentID_IsRestricted, @MJAIAgents_ParentID_MessageMode, @MJAIAgents_ParentID_MaxMessages, @MJAIAgents_ParentID_AttachmentStorageProviderID, @MJAIAgents_ParentID_AttachmentRootPath, @MJAIAgents_ParentID_InlineStorageThresholdBytes, @MJAIAgents_ParentID_AgentTypePromptParams, @MJAIAgents_ParentID_ScopeConfig, @MJAIAgents_ParentID_NoteRetentionDays, @MJAIAgents_ParentID_ExampleRetentionDays, @MJAIAgents_ParentID_AutoArchiveEnabled, @MJAIAgents_ParentID_RerankerConfiguration, @MJAIAgents_ParentID_CategoryID, @MJAIAgents_ParentID_AllowEphemeralClientTools, @MJAIAgents_ParentID_DefaultStorageAccountID, @MJAIAgents_ParentID_SearchScopeAccess, @MJAIAgents_ParentID_AcceptUnregisteredFiles, @MJAIAgents_ParentID_DefaultCoAgentID, @MJAIAgents_ParentID_TypeConfiguration, @MJAIAgents_ParentID_AllowMemoryWrite, @MJAIAgents_ParentID_RecordingDefault, @MJAIAgents_ParentID_RecordingStorageProviderID, @MJAIAgents_ParentID_DefaultMediaCollectionID, @MJAIAgents_ParentID_SupportsPlanMode, @MJAIAgents_ParentID_AcceptsSkills, @MJAIAgents_ParentID_SkillActivationMode, @MJAIAgents_ParentID_RequirePlanMode, @MJAIAgents_ParentID_ContextWindowMaxTokens, @MJAIAgents_ParentID_CompactionTriggerPercent, @MJAIAgents_ParentID_CompactionTargetPercent, @MJAIAgents_ParentID_ConversationSummaryPromptID
    END

    CLOSE cascade_update_MJAIAgents_ParentID_cursor
    DEALLOCATE cascade_update_MJAIAgents_ParentID_cursor
    
    -- Cascade update on AIAgent using cursor to call spUpdateAIAgent
    DECLARE @MJAIAgents_DefaultCoAgentIDID uniqueidentifier
    DECLARE @MJAIAgents_DefaultCoAgentID_Name nvarchar(255)
    DECLARE @MJAIAgents_DefaultCoAgentID_Description nvarchar(MAX)
    DECLARE @MJAIAgents_DefaultCoAgentID_LogoURL nvarchar(255)
    DECLARE @MJAIAgents_DefaultCoAgentID_ParentID uniqueidentifier
    DECLARE @MJAIAgents_DefaultCoAgentID_ExposeAsAction bit
    DECLARE @MJAIAgents_DefaultCoAgentID_ExecutionOrder int
    DECLARE @MJAIAgents_DefaultCoAgentID_ExecutionMode nvarchar(20)
    DECLARE @MJAIAgents_DefaultCoAgentID_EnableContextCompression bit
    DECLARE @MJAIAgents_DefaultCoAgentID_ContextCompressionMessageThreshold int
    DECLARE @MJAIAgents_DefaultCoAgentID_ContextCompressionPromptID uniqueidentifier
    DECLARE @MJAIAgents_DefaultCoAgentID_ContextCompressionMessageRetentionCount int
    DECLARE @MJAIAgents_DefaultCoAgentID_TypeID uniqueidentifier
    DECLARE @MJAIAgents_DefaultCoAgentID_Status nvarchar(20)
    DECLARE @MJAIAgents_DefaultCoAgentID_DriverClass nvarchar(255)
    DECLARE @MJAIAgents_DefaultCoAgentID_IconClass nvarchar(100)
    DECLARE @MJAIAgents_DefaultCoAgentID_ModelSelectionMode nvarchar(50)
    DECLARE @MJAIAgents_DefaultCoAgentID_PayloadDownstreamPaths nvarchar(MAX)
    DECLARE @MJAIAgents_DefaultCoAgentID_PayloadUpstreamPaths nvarchar(MAX)
    DECLARE @MJAIAgents_DefaultCoAgentID_PayloadSelfReadPaths nvarchar(MAX)
    DECLARE @MJAIAgents_DefaultCoAgentID_PayloadSelfWritePaths nvarchar(MAX)
    DECLARE @MJAIAgents_DefaultCoAgentID_PayloadScope nvarchar(MAX)
    DECLARE @MJAIAgents_DefaultCoAgentID_FinalPayloadValidation nvarchar(MAX)
    DECLARE @MJAIAgents_DefaultCoAgentID_FinalPayloadValidationMode nvarchar(25)
    DECLARE @MJAIAgents_DefaultCoAgentID_FinalPayloadValidationMaxRetries int
    DECLARE @MJAIAgents_DefaultCoAgentID_MaxCostPerRun decimal(10, 4)
    DECLARE @MJAIAgents_DefaultCoAgentID_MaxTokensPerRun int
    DECLARE @MJAIAgents_DefaultCoAgentID_MaxIterationsPerRun int
    DECLARE @MJAIAgents_DefaultCoAgentID_MaxTimePerRun int
    DECLARE @MJAIAgents_DefaultCoAgentID_MinExecutionsPerRun int
    DECLARE @MJAIAgents_DefaultCoAgentID_MaxExecutionsPerRun int
    DECLARE @MJAIAgents_DefaultCoAgentID_StartingPayloadValidation nvarchar(MAX)
    DECLARE @MJAIAgents_DefaultCoAgentID_StartingPayloadValidationMode nvarchar(25)
    DECLARE @MJAIAgents_DefaultCoAgentID_DefaultPromptEffortLevel int
    DECLARE @MJAIAgents_DefaultCoAgentID_ChatHandlingOption nvarchar(30)
    DECLARE @MJAIAgents_DefaultCoAgentID_DefaultArtifactTypeID uniqueidentifier
    DECLARE @MJAIAgents_DefaultCoAgentID_OwnerUserID uniqueidentifier
    DECLARE @MJAIAgents_DefaultCoAgentID_InvocationMode nvarchar(20)
    DECLARE @MJAIAgents_DefaultCoAgentID_ArtifactCreationMode nvarchar(20)
    DECLARE @MJAIAgents_DefaultCoAgentID_FunctionalRequirements nvarchar(MAX)
    DECLARE @MJAIAgents_DefaultCoAgentID_TechnicalDesign nvarchar(MAX)
    DECLARE @MJAIAgents_DefaultCoAgentID_InjectNotes bit
    DECLARE @MJAIAgents_DefaultCoAgentID_MaxNotesToInject int
    DECLARE @MJAIAgents_DefaultCoAgentID_NoteInjectionStrategy nvarchar(20)
    DECLARE @MJAIAgents_DefaultCoAgentID_InjectExamples bit
    DECLARE @MJAIAgents_DefaultCoAgentID_MaxExamplesToInject int
    DECLARE @MJAIAgents_DefaultCoAgentID_ExampleInjectionStrategy nvarchar(20)
    DECLARE @MJAIAgents_DefaultCoAgentID_IsRestricted bit
    DECLARE @MJAIAgents_DefaultCoAgentID_MessageMode nvarchar(50)
    DECLARE @MJAIAgents_DefaultCoAgentID_MaxMessages int
    DECLARE @MJAIAgents_DefaultCoAgentID_AttachmentStorageProviderID uniqueidentifier
    DECLARE @MJAIAgents_DefaultCoAgentID_AttachmentRootPath nvarchar(500)
    DECLARE @MJAIAgents_DefaultCoAgentID_InlineStorageThresholdBytes int
    DECLARE @MJAIAgents_DefaultCoAgentID_AgentTypePromptParams nvarchar(MAX)
    DECLARE @MJAIAgents_DefaultCoAgentID_ScopeConfig nvarchar(MAX)
    DECLARE @MJAIAgents_DefaultCoAgentID_NoteRetentionDays int
    DECLARE @MJAIAgents_DefaultCoAgentID_ExampleRetentionDays int
    DECLARE @MJAIAgents_DefaultCoAgentID_AutoArchiveEnabled bit
    DECLARE @MJAIAgents_DefaultCoAgentID_RerankerConfiguration nvarchar(MAX)
    DECLARE @MJAIAgents_DefaultCoAgentID_CategoryID uniqueidentifier
    DECLARE @MJAIAgents_DefaultCoAgentID_AllowEphemeralClientTools bit
    DECLARE @MJAIAgents_DefaultCoAgentID_DefaultStorageAccountID uniqueidentifier
    DECLARE @MJAIAgents_DefaultCoAgentID_SearchScopeAccess nvarchar(20)
    DECLARE @MJAIAgents_DefaultCoAgentID_AcceptUnregisteredFiles bit
    DECLARE @MJAIAgents_DefaultCoAgentID_DefaultCoAgentID uniqueidentifier
    DECLARE @MJAIAgents_DefaultCoAgentID_TypeConfiguration nvarchar(MAX)
    DECLARE @MJAIAgents_DefaultCoAgentID_AllowMemoryWrite bit
    DECLARE @MJAIAgents_DefaultCoAgentID_RecordingDefault nvarchar(20)
    DECLARE @MJAIAgents_DefaultCoAgentID_RecordingStorageProviderID uniqueidentifier
    DECLARE @MJAIAgents_DefaultCoAgentID_DefaultMediaCollectionID uniqueidentifier
    DECLARE @MJAIAgents_DefaultCoAgentID_SupportsPlanMode bit
    DECLARE @MJAIAgents_DefaultCoAgentID_AcceptsSkills nvarchar(20)
    DECLARE @MJAIAgents_DefaultCoAgentID_SkillActivationMode nvarchar(20)
    DECLARE @MJAIAgents_DefaultCoAgentID_RequirePlanMode bit
    DECLARE @MJAIAgents_DefaultCoAgentID_ContextWindowMaxTokens int
    DECLARE @MJAIAgents_DefaultCoAgentID_CompactionTriggerPercent int
    DECLARE @MJAIAgents_DefaultCoAgentID_CompactionTargetPercent int
    DECLARE @MJAIAgents_DefaultCoAgentID_ConversationSummaryPromptID uniqueidentifier
    DECLARE cascade_update_MJAIAgents_DefaultCoAgentID_cursor CURSOR FOR
        SELECT [ID], [Name], [Description], [LogoURL], [ParentID], [ExposeAsAction], [ExecutionOrder], [ExecutionMode], [EnableContextCompression], [ContextCompressionMessageThreshold], [ContextCompressionPromptID], [ContextCompressionMessageRetentionCount], [TypeID], [Status], [DriverClass], [IconClass], [ModelSelectionMode], [PayloadDownstreamPaths], [PayloadUpstreamPaths], [PayloadSelfReadPaths], [PayloadSelfWritePaths], [PayloadScope], [FinalPayloadValidation], [FinalPayloadValidationMode], [FinalPayloadValidationMaxRetries], [MaxCostPerRun], [MaxTokensPerRun], [MaxIterationsPerRun], [MaxTimePerRun], [MinExecutionsPerRun], [MaxExecutionsPerRun], [StartingPayloadValidation], [StartingPayloadValidationMode], [DefaultPromptEffortLevel], [ChatHandlingOption], [DefaultArtifactTypeID], [OwnerUserID], [InvocationMode], [ArtifactCreationMode], [FunctionalRequirements], [TechnicalDesign], [InjectNotes], [MaxNotesToInject], [NoteInjectionStrategy], [InjectExamples], [MaxExamplesToInject], [ExampleInjectionStrategy], [IsRestricted], [MessageMode], [MaxMessages], [AttachmentStorageProviderID], [AttachmentRootPath], [InlineStorageThresholdBytes], [AgentTypePromptParams], [ScopeConfig], [NoteRetentionDays], [ExampleRetentionDays], [AutoArchiveEnabled], [RerankerConfiguration], [CategoryID], [AllowEphemeralClientTools], [DefaultStorageAccountID], [SearchScopeAccess], [AcceptUnregisteredFiles], [DefaultCoAgentID], [TypeConfiguration], [AllowMemoryWrite], [RecordingDefault], [RecordingStorageProviderID], [DefaultMediaCollectionID], [SupportsPlanMode], [AcceptsSkills], [SkillActivationMode], [RequirePlanMode], [ContextWindowMaxTokens], [CompactionTriggerPercent], [CompactionTargetPercent], [ConversationSummaryPromptID]
        FROM [${flyway:defaultSchema}].[AIAgent]
        WHERE [DefaultCoAgentID] = @ID

    OPEN cascade_update_MJAIAgents_DefaultCoAgentID_cursor
    FETCH NEXT FROM cascade_update_MJAIAgents_DefaultCoAgentID_cursor INTO @MJAIAgents_DefaultCoAgentIDID, @MJAIAgents_DefaultCoAgentID_Name, @MJAIAgents_DefaultCoAgentID_Description, @MJAIAgents_DefaultCoAgentID_LogoURL, @MJAIAgents_DefaultCoAgentID_ParentID, @MJAIAgents_DefaultCoAgentID_ExposeAsAction, @MJAIAgents_DefaultCoAgentID_ExecutionOrder, @MJAIAgents_DefaultCoAgentID_ExecutionMode, @MJAIAgents_DefaultCoAgentID_EnableContextCompression, @MJAIAgents_DefaultCoAgentID_ContextCompressionMessageThreshold, @MJAIAgents_DefaultCoAgentID_ContextCompressionPromptID, @MJAIAgents_DefaultCoAgentID_ContextCompressionMessageRetentionCount, @MJAIAgents_DefaultCoAgentID_TypeID, @MJAIAgents_DefaultCoAgentID_Status, @MJAIAgents_DefaultCoAgentID_DriverClass, @MJAIAgents_DefaultCoAgentID_IconClass, @MJAIAgents_DefaultCoAgentID_ModelSelectionMode, @MJAIAgents_DefaultCoAgentID_PayloadDownstreamPaths, @MJAIAgents_DefaultCoAgentID_PayloadUpstreamPaths, @MJAIAgents_DefaultCoAgentID_PayloadSelfReadPaths, @MJAIAgents_DefaultCoAgentID_PayloadSelfWritePaths, @MJAIAgents_DefaultCoAgentID_PayloadScope, @MJAIAgents_DefaultCoAgentID_FinalPayloadValidation, @MJAIAgents_DefaultCoAgentID_FinalPayloadValidationMode, @MJAIAgents_DefaultCoAgentID_FinalPayloadValidationMaxRetries, @MJAIAgents_DefaultCoAgentID_MaxCostPerRun, @MJAIAgents_DefaultCoAgentID_MaxTokensPerRun, @MJAIAgents_DefaultCoAgentID_MaxIterationsPerRun, @MJAIAgents_DefaultCoAgentID_MaxTimePerRun, @MJAIAgents_DefaultCoAgentID_MinExecutionsPerRun, @MJAIAgents_DefaultCoAgentID_MaxExecutionsPerRun, @MJAIAgents_DefaultCoAgentID_StartingPayloadValidation, @MJAIAgents_DefaultCoAgentID_StartingPayloadValidationMode, @MJAIAgents_DefaultCoAgentID_DefaultPromptEffortLevel, @MJAIAgents_DefaultCoAgentID_ChatHandlingOption, @MJAIAgents_DefaultCoAgentID_DefaultArtifactTypeID, @MJAIAgents_DefaultCoAgentID_OwnerUserID, @MJAIAgents_DefaultCoAgentID_InvocationMode, @MJAIAgents_DefaultCoAgentID_ArtifactCreationMode, @MJAIAgents_DefaultCoAgentID_FunctionalRequirements, @MJAIAgents_DefaultCoAgentID_TechnicalDesign, @MJAIAgents_DefaultCoAgentID_InjectNotes, @MJAIAgents_DefaultCoAgentID_MaxNotesToInject, @MJAIAgents_DefaultCoAgentID_NoteInjectionStrategy, @MJAIAgents_DefaultCoAgentID_InjectExamples, @MJAIAgents_DefaultCoAgentID_MaxExamplesToInject, @MJAIAgents_DefaultCoAgentID_ExampleInjectionStrategy, @MJAIAgents_DefaultCoAgentID_IsRestricted, @MJAIAgents_DefaultCoAgentID_MessageMode, @MJAIAgents_DefaultCoAgentID_MaxMessages, @MJAIAgents_DefaultCoAgentID_AttachmentStorageProviderID, @MJAIAgents_DefaultCoAgentID_AttachmentRootPath, @MJAIAgents_DefaultCoAgentID_InlineStorageThresholdBytes, @MJAIAgents_DefaultCoAgentID_AgentTypePromptParams, @MJAIAgents_DefaultCoAgentID_ScopeConfig, @MJAIAgents_DefaultCoAgentID_NoteRetentionDays, @MJAIAgents_DefaultCoAgentID_ExampleRetentionDays, @MJAIAgents_DefaultCoAgentID_AutoArchiveEnabled, @MJAIAgents_DefaultCoAgentID_RerankerConfiguration, @MJAIAgents_DefaultCoAgentID_CategoryID, @MJAIAgents_DefaultCoAgentID_AllowEphemeralClientTools, @MJAIAgents_DefaultCoAgentID_DefaultStorageAccountID, @MJAIAgents_DefaultCoAgentID_SearchScopeAccess, @MJAIAgents_DefaultCoAgentID_AcceptUnregisteredFiles, @MJAIAgents_DefaultCoAgentID_DefaultCoAgentID, @MJAIAgents_DefaultCoAgentID_TypeConfiguration, @MJAIAgents_DefaultCoAgentID_AllowMemoryWrite, @MJAIAgents_DefaultCoAgentID_RecordingDefault, @MJAIAgents_DefaultCoAgentID_RecordingStorageProviderID, @MJAIAgents_DefaultCoAgentID_DefaultMediaCollectionID, @MJAIAgents_DefaultCoAgentID_SupportsPlanMode, @MJAIAgents_DefaultCoAgentID_AcceptsSkills, @MJAIAgents_DefaultCoAgentID_SkillActivationMode, @MJAIAgents_DefaultCoAgentID_RequirePlanMode, @MJAIAgents_DefaultCoAgentID_ContextWindowMaxTokens, @MJAIAgents_DefaultCoAgentID_CompactionTriggerPercent, @MJAIAgents_DefaultCoAgentID_CompactionTargetPercent, @MJAIAgents_DefaultCoAgentID_ConversationSummaryPromptID

    WHILE @@FETCH_STATUS = 0
    BEGIN
        -- Set the FK field to NULL
        SET @MJAIAgents_DefaultCoAgentID_DefaultCoAgentID = NULL

        -- Call the update SP for the related entity
        EXEC [${flyway:defaultSchema}].[spUpdateAIAgent] @ID = @MJAIAgents_DefaultCoAgentIDID, @Name = @MJAIAgents_DefaultCoAgentID_Name, @Description = @MJAIAgents_DefaultCoAgentID_Description, @LogoURL = @MJAIAgents_DefaultCoAgentID_LogoURL, @ParentID = @MJAIAgents_DefaultCoAgentID_ParentID, @ExposeAsAction = @MJAIAgents_DefaultCoAgentID_ExposeAsAction, @ExecutionOrder = @MJAIAgents_DefaultCoAgentID_ExecutionOrder, @ExecutionMode = @MJAIAgents_DefaultCoAgentID_ExecutionMode, @EnableContextCompression = @MJAIAgents_DefaultCoAgentID_EnableContextCompression, @ContextCompressionMessageThreshold = @MJAIAgents_DefaultCoAgentID_ContextCompressionMessageThreshold, @ContextCompressionPromptID = @MJAIAgents_DefaultCoAgentID_ContextCompressionPromptID, @ContextCompressionMessageRetentionCount = @MJAIAgents_DefaultCoAgentID_ContextCompressionMessageRetentionCount, @TypeID = @MJAIAgents_DefaultCoAgentID_TypeID, @Status = @MJAIAgents_DefaultCoAgentID_Status, @DriverClass = @MJAIAgents_DefaultCoAgentID_DriverClass, @IconClass = @MJAIAgents_DefaultCoAgentID_IconClass, @ModelSelectionMode = @MJAIAgents_DefaultCoAgentID_ModelSelectionMode, @PayloadDownstreamPaths = @MJAIAgents_DefaultCoAgentID_PayloadDownstreamPaths, @PayloadUpstreamPaths = @MJAIAgents_DefaultCoAgentID_PayloadUpstreamPaths, @PayloadSelfReadPaths = @MJAIAgents_DefaultCoAgentID_PayloadSelfReadPaths, @PayloadSelfWritePaths = @MJAIAgents_DefaultCoAgentID_PayloadSelfWritePaths, @PayloadScope = @MJAIAgents_DefaultCoAgentID_PayloadScope, @FinalPayloadValidation = @MJAIAgents_DefaultCoAgentID_FinalPayloadValidation, @FinalPayloadValidationMode = @MJAIAgents_DefaultCoAgentID_FinalPayloadValidationMode, @FinalPayloadValidationMaxRetries = @MJAIAgents_DefaultCoAgentID_FinalPayloadValidationMaxRetries, @MaxCostPerRun = @MJAIAgents_DefaultCoAgentID_MaxCostPerRun, @MaxTokensPerRun = @MJAIAgents_DefaultCoAgentID_MaxTokensPerRun, @MaxIterationsPerRun = @MJAIAgents_DefaultCoAgentID_MaxIterationsPerRun, @MaxTimePerRun = @MJAIAgents_DefaultCoAgentID_MaxTimePerRun, @MinExecutionsPerRun = @MJAIAgents_DefaultCoAgentID_MinExecutionsPerRun, @MaxExecutionsPerRun = @MJAIAgents_DefaultCoAgentID_MaxExecutionsPerRun, @StartingPayloadValidation = @MJAIAgents_DefaultCoAgentID_StartingPayloadValidation, @StartingPayloadValidationMode = @MJAIAgents_DefaultCoAgentID_StartingPayloadValidationMode, @DefaultPromptEffortLevel = @MJAIAgents_DefaultCoAgentID_DefaultPromptEffortLevel, @ChatHandlingOption = @MJAIAgents_DefaultCoAgentID_ChatHandlingOption, @DefaultArtifactTypeID = @MJAIAgents_DefaultCoAgentID_DefaultArtifactTypeID, @OwnerUserID = @MJAIAgents_DefaultCoAgentID_OwnerUserID, @InvocationMode = @MJAIAgents_DefaultCoAgentID_InvocationMode, @ArtifactCreationMode = @MJAIAgents_DefaultCoAgentID_ArtifactCreationMode, @FunctionalRequirements = @MJAIAgents_DefaultCoAgentID_FunctionalRequirements, @TechnicalDesign = @MJAIAgents_DefaultCoAgentID_TechnicalDesign, @InjectNotes = @MJAIAgents_DefaultCoAgentID_InjectNotes, @MaxNotesToInject = @MJAIAgents_DefaultCoAgentID_MaxNotesToInject, @NoteInjectionStrategy = @MJAIAgents_DefaultCoAgentID_NoteInjectionStrategy, @InjectExamples = @MJAIAgents_DefaultCoAgentID_InjectExamples, @MaxExamplesToInject = @MJAIAgents_DefaultCoAgentID_MaxExamplesToInject, @ExampleInjectionStrategy = @MJAIAgents_DefaultCoAgentID_ExampleInjectionStrategy, @IsRestricted = @MJAIAgents_DefaultCoAgentID_IsRestricted, @MessageMode = @MJAIAgents_DefaultCoAgentID_MessageMode, @MaxMessages = @MJAIAgents_DefaultCoAgentID_MaxMessages, @AttachmentStorageProviderID = @MJAIAgents_DefaultCoAgentID_AttachmentStorageProviderID, @AttachmentRootPath = @MJAIAgents_DefaultCoAgentID_AttachmentRootPath, @InlineStorageThresholdBytes = @MJAIAgents_DefaultCoAgentID_InlineStorageThresholdBytes, @AgentTypePromptParams = @MJAIAgents_DefaultCoAgentID_AgentTypePromptParams, @ScopeConfig = @MJAIAgents_DefaultCoAgentID_ScopeConfig, @NoteRetentionDays = @MJAIAgents_DefaultCoAgentID_NoteRetentionDays, @ExampleRetentionDays = @MJAIAgents_DefaultCoAgentID_ExampleRetentionDays, @AutoArchiveEnabled = @MJAIAgents_DefaultCoAgentID_AutoArchiveEnabled, @RerankerConfiguration = @MJAIAgents_DefaultCoAgentID_RerankerConfiguration, @CategoryID = @MJAIAgents_DefaultCoAgentID_CategoryID, @AllowEphemeralClientTools = @MJAIAgents_DefaultCoAgentID_AllowEphemeralClientTools, @DefaultStorageAccountID = @MJAIAgents_DefaultCoAgentID_DefaultStorageAccountID, @SearchScopeAccess = @MJAIAgents_DefaultCoAgentID_SearchScopeAccess, @AcceptUnregisteredFiles = @MJAIAgents_DefaultCoAgentID_AcceptUnregisteredFiles, @DefaultCoAgentID_Clear = 1, @DefaultCoAgentID = @MJAIAgents_DefaultCoAgentID_DefaultCoAgentID, @TypeConfiguration = @MJAIAgents_DefaultCoAgentID_TypeConfiguration, @AllowMemoryWrite = @MJAIAgents_DefaultCoAgentID_AllowMemoryWrite, @RecordingDefault = @MJAIAgents_DefaultCoAgentID_RecordingDefault, @RecordingStorageProviderID = @MJAIAgents_DefaultCoAgentID_RecordingStorageProviderID, @DefaultMediaCollectionID = @MJAIAgents_DefaultCoAgentID_DefaultMediaCollectionID, @SupportsPlanMode = @MJAIAgents_DefaultCoAgentID_SupportsPlanMode, @AcceptsSkills = @MJAIAgents_DefaultCoAgentID_AcceptsSkills, @SkillActivationMode = @MJAIAgents_DefaultCoAgentID_SkillActivationMode, @RequirePlanMode = @MJAIAgents_DefaultCoAgentID_RequirePlanMode, @ContextWindowMaxTokens = @MJAIAgents_DefaultCoAgentID_ContextWindowMaxTokens, @CompactionTriggerPercent = @MJAIAgents_DefaultCoAgentID_CompactionTriggerPercent, @CompactionTargetPercent = @MJAIAgents_DefaultCoAgentID_CompactionTargetPercent, @ConversationSummaryPromptID = @MJAIAgents_DefaultCoAgentID_ConversationSummaryPromptID

        FETCH NEXT FROM cascade_update_MJAIAgents_DefaultCoAgentID_cursor INTO @MJAIAgents_DefaultCoAgentIDID, @MJAIAgents_DefaultCoAgentID_Name, @MJAIAgents_DefaultCoAgentID_Description, @MJAIAgents_DefaultCoAgentID_LogoURL, @MJAIAgents_DefaultCoAgentID_ParentID, @MJAIAgents_DefaultCoAgentID_ExposeAsAction, @MJAIAgents_DefaultCoAgentID_ExecutionOrder, @MJAIAgents_DefaultCoAgentID_ExecutionMode, @MJAIAgents_DefaultCoAgentID_EnableContextCompression, @MJAIAgents_DefaultCoAgentID_ContextCompressionMessageThreshold, @MJAIAgents_DefaultCoAgentID_ContextCompressionPromptID, @MJAIAgents_DefaultCoAgentID_ContextCompressionMessageRetentionCount, @MJAIAgents_DefaultCoAgentID_TypeID, @MJAIAgents_DefaultCoAgentID_Status, @MJAIAgents_DefaultCoAgentID_DriverClass, @MJAIAgents_DefaultCoAgentID_IconClass, @MJAIAgents_DefaultCoAgentID_ModelSelectionMode, @MJAIAgents_DefaultCoAgentID_PayloadDownstreamPaths, @MJAIAgents_DefaultCoAgentID_PayloadUpstreamPaths, @MJAIAgents_DefaultCoAgentID_PayloadSelfReadPaths, @MJAIAgents_DefaultCoAgentID_PayloadSelfWritePaths, @MJAIAgents_DefaultCoAgentID_PayloadScope, @MJAIAgents_DefaultCoAgentID_FinalPayloadValidation, @MJAIAgents_DefaultCoAgentID_FinalPayloadValidationMode, @MJAIAgents_DefaultCoAgentID_FinalPayloadValidationMaxRetries, @MJAIAgents_DefaultCoAgentID_MaxCostPerRun, @MJAIAgents_DefaultCoAgentID_MaxTokensPerRun, @MJAIAgents_DefaultCoAgentID_MaxIterationsPerRun, @MJAIAgents_DefaultCoAgentID_MaxTimePerRun, @MJAIAgents_DefaultCoAgentID_MinExecutionsPerRun, @MJAIAgents_DefaultCoAgentID_MaxExecutionsPerRun, @MJAIAgents_DefaultCoAgentID_StartingPayloadValidation, @MJAIAgents_DefaultCoAgentID_StartingPayloadValidationMode, @MJAIAgents_DefaultCoAgentID_DefaultPromptEffortLevel, @MJAIAgents_DefaultCoAgentID_ChatHandlingOption, @MJAIAgents_DefaultCoAgentID_DefaultArtifactTypeID, @MJAIAgents_DefaultCoAgentID_OwnerUserID, @MJAIAgents_DefaultCoAgentID_InvocationMode, @MJAIAgents_DefaultCoAgentID_ArtifactCreationMode, @MJAIAgents_DefaultCoAgentID_FunctionalRequirements, @MJAIAgents_DefaultCoAgentID_TechnicalDesign, @MJAIAgents_DefaultCoAgentID_InjectNotes, @MJAIAgents_DefaultCoAgentID_MaxNotesToInject, @MJAIAgents_DefaultCoAgentID_NoteInjectionStrategy, @MJAIAgents_DefaultCoAgentID_InjectExamples, @MJAIAgents_DefaultCoAgentID_MaxExamplesToInject, @MJAIAgents_DefaultCoAgentID_ExampleInjectionStrategy, @MJAIAgents_DefaultCoAgentID_IsRestricted, @MJAIAgents_DefaultCoAgentID_MessageMode, @MJAIAgents_DefaultCoAgentID_MaxMessages, @MJAIAgents_DefaultCoAgentID_AttachmentStorageProviderID, @MJAIAgents_DefaultCoAgentID_AttachmentRootPath, @MJAIAgents_DefaultCoAgentID_InlineStorageThresholdBytes, @MJAIAgents_DefaultCoAgentID_AgentTypePromptParams, @MJAIAgents_DefaultCoAgentID_ScopeConfig, @MJAIAgents_DefaultCoAgentID_NoteRetentionDays, @MJAIAgents_DefaultCoAgentID_ExampleRetentionDays, @MJAIAgents_DefaultCoAgentID_AutoArchiveEnabled, @MJAIAgents_DefaultCoAgentID_RerankerConfiguration, @MJAIAgents_DefaultCoAgentID_CategoryID, @MJAIAgents_DefaultCoAgentID_AllowEphemeralClientTools, @MJAIAgents_DefaultCoAgentID_DefaultStorageAccountID, @MJAIAgents_DefaultCoAgentID_SearchScopeAccess, @MJAIAgents_DefaultCoAgentID_AcceptUnregisteredFiles, @MJAIAgents_DefaultCoAgentID_DefaultCoAgentID, @MJAIAgents_DefaultCoAgentID_TypeConfiguration, @MJAIAgents_DefaultCoAgentID_AllowMemoryWrite, @MJAIAgents_DefaultCoAgentID_RecordingDefault, @MJAIAgents_DefaultCoAgentID_RecordingStorageProviderID, @MJAIAgents_DefaultCoAgentID_DefaultMediaCollectionID, @MJAIAgents_DefaultCoAgentID_SupportsPlanMode, @MJAIAgents_DefaultCoAgentID_AcceptsSkills, @MJAIAgents_DefaultCoAgentID_SkillActivationMode, @MJAIAgents_DefaultCoAgentID_RequirePlanMode, @MJAIAgents_DefaultCoAgentID_ContextWindowMaxTokens, @MJAIAgents_DefaultCoAgentID_CompactionTriggerPercent, @MJAIAgents_DefaultCoAgentID_CompactionTargetPercent, @MJAIAgents_DefaultCoAgentID_ConversationSummaryPromptID
    END

    CLOSE cascade_update_MJAIAgents_DefaultCoAgentID_cursor
    DEALLOCATE cascade_update_MJAIAgents_DefaultCoAgentID_cursor
    
    -- Cascade delete from AIBridgeAgentIdentity using cursor to call spDeleteAIBridgeAgentIdentity
    DECLARE @MJAIBridgeAgentIdentities_AgentIDID uniqueidentifier
    DECLARE cascade_delete_MJAIBridgeAgentIdentities_AgentID_cursor CURSOR FOR 
        SELECT [ID]
        FROM [${flyway:defaultSchema}].[AIBridgeAgentIdentity]
        WHERE [AgentID] = @ID
    
    OPEN cascade_delete_MJAIBridgeAgentIdentities_AgentID_cursor
    FETCH NEXT FROM cascade_delete_MJAIBridgeAgentIdentities_AgentID_cursor INTO @MJAIBridgeAgentIdentities_AgentIDID
    
    WHILE @@FETCH_STATUS = 0
    BEGIN
        EXEC [${flyway:defaultSchema}].[spDeleteAIBridgeAgentIdentity] @ID = @MJAIBridgeAgentIdentities_AgentIDID
        
        FETCH NEXT FROM cascade_delete_MJAIBridgeAgentIdentities_AgentID_cursor INTO @MJAIBridgeAgentIdentities_AgentIDID
    END
    
    CLOSE cascade_delete_MJAIBridgeAgentIdentities_AgentID_cursor
    DEALLOCATE cascade_delete_MJAIBridgeAgentIdentities_AgentID_cursor
    
    -- Cascade update on AIPromptRun using cursor to call spUpdateAIPromptRun
    DECLARE @MJAIPromptRuns_AgentIDID uniqueidentifier
    DECLARE @MJAIPromptRuns_AgentID_PromptID uniqueidentifier
    DECLARE @MJAIPromptRuns_AgentID_ModelID uniqueidentifier
    DECLARE @MJAIPromptRuns_AgentID_VendorID uniqueidentifier
    DECLARE @MJAIPromptRuns_AgentID_AgentID uniqueidentifier
    DECLARE @MJAIPromptRuns_AgentID_ConfigurationID uniqueidentifier
    DECLARE @MJAIPromptRuns_AgentID_RunAt datetimeoffset
    DECLARE @MJAIPromptRuns_AgentID_CompletedAt datetimeoffset
    DECLARE @MJAIPromptRuns_AgentID_ExecutionTimeMS int
    DECLARE @MJAIPromptRuns_AgentID_Messages nvarchar(MAX)
    DECLARE @MJAIPromptRuns_AgentID_Result nvarchar(MAX)
    DECLARE @MJAIPromptRuns_AgentID_TokensUsed int
    DECLARE @MJAIPromptRuns_AgentID_TokensPrompt int
    DECLARE @MJAIPromptRuns_AgentID_TokensCompletion int
    DECLARE @MJAIPromptRuns_AgentID_TotalCost decimal(18, 6)
    DECLARE @MJAIPromptRuns_AgentID_Success bit
    DECLARE @MJAIPromptRuns_AgentID_ErrorMessage nvarchar(MAX)
    DECLARE @MJAIPromptRuns_AgentID_ParentID uniqueidentifier
    DECLARE @MJAIPromptRuns_AgentID_RunType nvarchar(20)
    DECLARE @MJAIPromptRuns_AgentID_ExecutionOrder int
    DECLARE @MJAIPromptRuns_AgentID_Cost decimal(19, 8)
    DECLARE @MJAIPromptRuns_AgentID_CostCurrency nvarchar(10)
    DECLARE @MJAIPromptRuns_AgentID_TokensUsedRollup int
    DECLARE @MJAIPromptRuns_AgentID_TokensPromptRollup int
    DECLARE @MJAIPromptRuns_AgentID_TokensCompletionRollup int
    DECLARE @MJAIPromptRuns_AgentID_Temperature decimal(3, 2)
    DECLARE @MJAIPromptRuns_AgentID_TopP decimal(3, 2)
    DECLARE @MJAIPromptRuns_AgentID_TopK int
    DECLARE @MJAIPromptRuns_AgentID_MinP decimal(3, 2)
    DECLARE @MJAIPromptRuns_AgentID_FrequencyPenalty decimal(3, 2)
    DECLARE @MJAIPromptRuns_AgentID_PresencePenalty decimal(3, 2)
    DECLARE @MJAIPromptRuns_AgentID_Seed int
    DECLARE @MJAIPromptRuns_AgentID_StopSequences nvarchar(MAX)
    DECLARE @MJAIPromptRuns_AgentID_ResponseFormat nvarchar(50)
    DECLARE @MJAIPromptRuns_AgentID_LogProbs bit
    DECLARE @MJAIPromptRuns_AgentID_TopLogProbs int
    DECLARE @MJAIPromptRuns_AgentID_DescendantCost decimal(18, 6)
    DECLARE @MJAIPromptRuns_AgentID_ValidationAttemptCount int
    DECLARE @MJAIPromptRuns_AgentID_SuccessfulValidationCount int
    DECLARE @MJAIPromptRuns_AgentID_FinalValidationPassed bit
    DECLARE @MJAIPromptRuns_AgentID_ValidationBehavior nvarchar(50)
    DECLARE @MJAIPromptRuns_AgentID_RetryStrategy nvarchar(50)
    DECLARE @MJAIPromptRuns_AgentID_MaxRetriesConfigured int
    DECLARE @MJAIPromptRuns_AgentID_FinalValidationError nvarchar(500)
    DECLARE @MJAIPromptRuns_AgentID_ValidationErrorCount int
    DECLARE @MJAIPromptRuns_AgentID_CommonValidationError nvarchar(255)
    DECLARE @MJAIPromptRuns_AgentID_FirstAttemptAt datetimeoffset
    DECLARE @MJAIPromptRuns_AgentID_LastAttemptAt datetimeoffset
    DECLARE @MJAIPromptRuns_AgentID_TotalRetryDurationMS int
    DECLARE @MJAIPromptRuns_AgentID_ValidationAttempts nvarchar(MAX)
    DECLARE @MJAIPromptRuns_AgentID_ValidationSummary nvarchar(MAX)
    DECLARE @MJAIPromptRuns_AgentID_FailoverAttempts int
    DECLARE @MJAIPromptRuns_AgentID_FailoverErrors nvarchar(MAX)
    DECLARE @MJAIPromptRuns_AgentID_FailoverDurations nvarchar(MAX)
    DECLARE @MJAIPromptRuns_AgentID_OriginalModelID uniqueidentifier
    DECLARE @MJAIPromptRuns_AgentID_OriginalRequestStartTime datetimeoffset
    DECLARE @MJAIPromptRuns_AgentID_TotalFailoverDuration int
    DECLARE @MJAIPromptRuns_AgentID_RerunFromPromptRunID uniqueidentifier
    DECLARE @MJAIPromptRuns_AgentID_ModelSelection nvarchar(MAX)
    DECLARE @MJAIPromptRuns_AgentID_Status nvarchar(50)
    DECLARE @MJAIPromptRuns_AgentID_Cancelled bit
    DECLARE @MJAIPromptRuns_AgentID_CancellationReason nvarchar(MAX)
    DECLARE @MJAIPromptRuns_AgentID_ModelPowerRank int
    DECLARE @MJAIPromptRuns_AgentID_SelectionStrategy nvarchar(50)
    DECLARE @MJAIPromptRuns_AgentID_CacheHit bit
    DECLARE @MJAIPromptRuns_AgentID_CacheKey nvarchar(500)
    DECLARE @MJAIPromptRuns_AgentID_JudgeID uniqueidentifier
    DECLARE @MJAIPromptRuns_AgentID_JudgeScore float(53)
    DECLARE @MJAIPromptRuns_AgentID_WasSelectedResult bit
    DECLARE @MJAIPromptRuns_AgentID_StreamingEnabled bit
    DECLARE @MJAIPromptRuns_AgentID_FirstTokenTime int
    DECLARE @MJAIPromptRuns_AgentID_ErrorDetails nvarchar(MAX)
    DECLARE @MJAIPromptRuns_AgentID_ChildPromptID uniqueidentifier
    DECLARE @MJAIPromptRuns_AgentID_QueueTime int
    DECLARE @MJAIPromptRuns_AgentID_PromptTime int
    DECLARE @MJAIPromptRuns_AgentID_CompletionTime int
    DECLARE @MJAIPromptRuns_AgentID_ModelSpecificResponseDetails nvarchar(MAX)
    DECLARE @MJAIPromptRuns_AgentID_EffortLevel int
    DECLARE @MJAIPromptRuns_AgentID_RunName nvarchar(255)
    DECLARE @MJAIPromptRuns_AgentID_Comments nvarchar(MAX)
    DECLARE @MJAIPromptRuns_AgentID_TestRunID uniqueidentifier
    DECLARE @MJAIPromptRuns_AgentID_AssistantPrefill nvarchar(MAX)
    DECLARE @MJAIPromptRuns_AgentID_TokensCacheRead int
    DECLARE @MJAIPromptRuns_AgentID_TokensCacheWrite int
    DECLARE @MJAIPromptRuns_AgentID_TokensCacheReadRollup int
    DECLARE @MJAIPromptRuns_AgentID_TokensCacheWriteRollup int
    DECLARE cascade_update_MJAIPromptRuns_AgentID_cursor CURSOR FOR
        SELECT [ID], [PromptID], [ModelID], [VendorID], [AgentID], [ConfigurationID], [RunAt], [CompletedAt], [ExecutionTimeMS], [Messages], [Result], [TokensUsed], [TokensPrompt], [TokensCompletion], [TotalCost], [Success], [ErrorMessage], [ParentID], [RunType], [ExecutionOrder], [Cost], [CostCurrency], [TokensUsedRollup], [TokensPromptRollup], [TokensCompletionRollup], [Temperature], [TopP], [TopK], [MinP], [FrequencyPenalty], [PresencePenalty], [Seed], [StopSequences], [ResponseFormat], [LogProbs], [TopLogProbs], [DescendantCost], [ValidationAttemptCount], [SuccessfulValidationCount], [FinalValidationPassed], [ValidationBehavior], [RetryStrategy], [MaxRetriesConfigured], [FinalValidationError], [ValidationErrorCount], [CommonValidationError], [FirstAttemptAt], [LastAttemptAt], [TotalRetryDurationMS], [ValidationAttempts], [ValidationSummary], [FailoverAttempts], [FailoverErrors], [FailoverDurations], [OriginalModelID], [OriginalRequestStartTime], [TotalFailoverDuration], [RerunFromPromptRunID], [ModelSelection], [Status], [Cancelled], [CancellationReason], [ModelPowerRank], [SelectionStrategy], [CacheHit], [CacheKey], [JudgeID], [JudgeScore], [WasSelectedResult], [StreamingEnabled], [FirstTokenTime], [ErrorDetails], [ChildPromptID], [QueueTime], [PromptTime], [CompletionTime], [ModelSpecificResponseDetails], [EffortLevel], [RunName], [Comments], [TestRunID], [AssistantPrefill], [TokensCacheRead], [TokensCacheWrite], [TokensCacheReadRollup], [TokensCacheWriteRollup]
        FROM [${flyway:defaultSchema}].[AIPromptRun]
        WHERE [AgentID] = @ID

    OPEN cascade_update_MJAIPromptRuns_AgentID_cursor
    FETCH NEXT FROM cascade_update_MJAIPromptRuns_AgentID_cursor INTO @MJAIPromptRuns_AgentIDID, @MJAIPromptRuns_AgentID_PromptID, @MJAIPromptRuns_AgentID_ModelID, @MJAIPromptRuns_AgentID_VendorID, @MJAIPromptRuns_AgentID_AgentID, @MJAIPromptRuns_AgentID_ConfigurationID, @MJAIPromptRuns_AgentID_RunAt, @MJAIPromptRuns_AgentID_CompletedAt, @MJAIPromptRuns_AgentID_ExecutionTimeMS, @MJAIPromptRuns_AgentID_Messages, @MJAIPromptRuns_AgentID_Result, @MJAIPromptRuns_AgentID_TokensUsed, @MJAIPromptRuns_AgentID_TokensPrompt, @MJAIPromptRuns_AgentID_TokensCompletion, @MJAIPromptRuns_AgentID_TotalCost, @MJAIPromptRuns_AgentID_Success, @MJAIPromptRuns_AgentID_ErrorMessage, @MJAIPromptRuns_AgentID_ParentID, @MJAIPromptRuns_AgentID_RunType, @MJAIPromptRuns_AgentID_ExecutionOrder, @MJAIPromptRuns_AgentID_Cost, @MJAIPromptRuns_AgentID_CostCurrency, @MJAIPromptRuns_AgentID_TokensUsedRollup, @MJAIPromptRuns_AgentID_TokensPromptRollup, @MJAIPromptRuns_AgentID_TokensCompletionRollup, @MJAIPromptRuns_AgentID_Temperature, @MJAIPromptRuns_AgentID_TopP, @MJAIPromptRuns_AgentID_TopK, @MJAIPromptRuns_AgentID_MinP, @MJAIPromptRuns_AgentID_FrequencyPenalty, @MJAIPromptRuns_AgentID_PresencePenalty, @MJAIPromptRuns_AgentID_Seed, @MJAIPromptRuns_AgentID_StopSequences, @MJAIPromptRuns_AgentID_ResponseFormat, @MJAIPromptRuns_AgentID_LogProbs, @MJAIPromptRuns_AgentID_TopLogProbs, @MJAIPromptRuns_AgentID_DescendantCost, @MJAIPromptRuns_AgentID_ValidationAttemptCount, @MJAIPromptRuns_AgentID_SuccessfulValidationCount, @MJAIPromptRuns_AgentID_FinalValidationPassed, @MJAIPromptRuns_AgentID_ValidationBehavior, @MJAIPromptRuns_AgentID_RetryStrategy, @MJAIPromptRuns_AgentID_MaxRetriesConfigured, @MJAIPromptRuns_AgentID_FinalValidationError, @MJAIPromptRuns_AgentID_ValidationErrorCount, @MJAIPromptRuns_AgentID_CommonValidationError, @MJAIPromptRuns_AgentID_FirstAttemptAt, @MJAIPromptRuns_AgentID_LastAttemptAt, @MJAIPromptRuns_AgentID_TotalRetryDurationMS, @MJAIPromptRuns_AgentID_ValidationAttempts, @MJAIPromptRuns_AgentID_ValidationSummary, @MJAIPromptRuns_AgentID_FailoverAttempts, @MJAIPromptRuns_AgentID_FailoverErrors, @MJAIPromptRuns_AgentID_FailoverDurations, @MJAIPromptRuns_AgentID_OriginalModelID, @MJAIPromptRuns_AgentID_OriginalRequestStartTime, @MJAIPromptRuns_AgentID_TotalFailoverDuration, @MJAIPromptRuns_AgentID_RerunFromPromptRunID, @MJAIPromptRuns_AgentID_ModelSelection, @MJAIPromptRuns_AgentID_Status, @MJAIPromptRuns_AgentID_Cancelled, @MJAIPromptRuns_AgentID_CancellationReason, @MJAIPromptRuns_AgentID_ModelPowerRank, @MJAIPromptRuns_AgentID_SelectionStrategy, @MJAIPromptRuns_AgentID_CacheHit, @MJAIPromptRuns_AgentID_CacheKey, @MJAIPromptRuns_AgentID_JudgeID, @MJAIPromptRuns_AgentID_JudgeScore, @MJAIPromptRuns_AgentID_WasSelectedResult, @MJAIPromptRuns_AgentID_StreamingEnabled, @MJAIPromptRuns_AgentID_FirstTokenTime, @MJAIPromptRuns_AgentID_ErrorDetails, @MJAIPromptRuns_AgentID_ChildPromptID, @MJAIPromptRuns_AgentID_QueueTime, @MJAIPromptRuns_AgentID_PromptTime, @MJAIPromptRuns_AgentID_CompletionTime, @MJAIPromptRuns_AgentID_ModelSpecificResponseDetails, @MJAIPromptRuns_AgentID_EffortLevel, @MJAIPromptRuns_AgentID_RunName, @MJAIPromptRuns_AgentID_Comments, @MJAIPromptRuns_AgentID_TestRunID, @MJAIPromptRuns_AgentID_AssistantPrefill, @MJAIPromptRuns_AgentID_TokensCacheRead, @MJAIPromptRuns_AgentID_TokensCacheWrite, @MJAIPromptRuns_AgentID_TokensCacheReadRollup, @MJAIPromptRuns_AgentID_TokensCacheWriteRollup

    WHILE @@FETCH_STATUS = 0
    BEGIN
        -- Set the FK field to NULL
        SET @MJAIPromptRuns_AgentID_AgentID = NULL

        -- Call the update SP for the related entity
        EXEC [${flyway:defaultSchema}].[spUpdateAIPromptRun] @ID = @MJAIPromptRuns_AgentIDID, @PromptID = @MJAIPromptRuns_AgentID_PromptID, @ModelID = @MJAIPromptRuns_AgentID_ModelID, @VendorID = @MJAIPromptRuns_AgentID_VendorID, @AgentID_Clear = 1, @AgentID = @MJAIPromptRuns_AgentID_AgentID, @ConfigurationID = @MJAIPromptRuns_AgentID_ConfigurationID, @RunAt = @MJAIPromptRuns_AgentID_RunAt, @CompletedAt = @MJAIPromptRuns_AgentID_CompletedAt, @ExecutionTimeMS = @MJAIPromptRuns_AgentID_ExecutionTimeMS, @Messages = @MJAIPromptRuns_AgentID_Messages, @Result = @MJAIPromptRuns_AgentID_Result, @TokensUsed = @MJAIPromptRuns_AgentID_TokensUsed, @TokensPrompt = @MJAIPromptRuns_AgentID_TokensPrompt, @TokensCompletion = @MJAIPromptRuns_AgentID_TokensCompletion, @TotalCost = @MJAIPromptRuns_AgentID_TotalCost, @Success = @MJAIPromptRuns_AgentID_Success, @ErrorMessage = @MJAIPromptRuns_AgentID_ErrorMessage, @ParentID = @MJAIPromptRuns_AgentID_ParentID, @RunType = @MJAIPromptRuns_AgentID_RunType, @ExecutionOrder = @MJAIPromptRuns_AgentID_ExecutionOrder, @Cost = @MJAIPromptRuns_AgentID_Cost, @CostCurrency = @MJAIPromptRuns_AgentID_CostCurrency, @TokensUsedRollup = @MJAIPromptRuns_AgentID_TokensUsedRollup, @TokensPromptRollup = @MJAIPromptRuns_AgentID_TokensPromptRollup, @TokensCompletionRollup = @MJAIPromptRuns_AgentID_TokensCompletionRollup, @Temperature = @MJAIPromptRuns_AgentID_Temperature, @TopP = @MJAIPromptRuns_AgentID_TopP, @TopK = @MJAIPromptRuns_AgentID_TopK, @MinP = @MJAIPromptRuns_AgentID_MinP, @FrequencyPenalty = @MJAIPromptRuns_AgentID_FrequencyPenalty, @PresencePenalty = @MJAIPromptRuns_AgentID_PresencePenalty, @Seed = @MJAIPromptRuns_AgentID_Seed, @StopSequences = @MJAIPromptRuns_AgentID_StopSequences, @ResponseFormat = @MJAIPromptRuns_AgentID_ResponseFormat, @LogProbs = @MJAIPromptRuns_AgentID_LogProbs, @TopLogProbs = @MJAIPromptRuns_AgentID_TopLogProbs, @DescendantCost = @MJAIPromptRuns_AgentID_DescendantCost, @ValidationAttemptCount = @MJAIPromptRuns_AgentID_ValidationAttemptCount, @SuccessfulValidationCount = @MJAIPromptRuns_AgentID_SuccessfulValidationCount, @FinalValidationPassed = @MJAIPromptRuns_AgentID_FinalValidationPassed, @ValidationBehavior = @MJAIPromptRuns_AgentID_ValidationBehavior, @RetryStrategy = @MJAIPromptRuns_AgentID_RetryStrategy, @MaxRetriesConfigured = @MJAIPromptRuns_AgentID_MaxRetriesConfigured, @FinalValidationError = @MJAIPromptRuns_AgentID_FinalValidationError, @ValidationErrorCount = @MJAIPromptRuns_AgentID_ValidationErrorCount, @CommonValidationError = @MJAIPromptRuns_AgentID_CommonValidationError, @FirstAttemptAt = @MJAIPromptRuns_AgentID_FirstAttemptAt, @LastAttemptAt = @MJAIPromptRuns_AgentID_LastAttemptAt, @TotalRetryDurationMS = @MJAIPromptRuns_AgentID_TotalRetryDurationMS, @ValidationAttempts = @MJAIPromptRuns_AgentID_ValidationAttempts, @ValidationSummary = @MJAIPromptRuns_AgentID_ValidationSummary, @FailoverAttempts = @MJAIPromptRuns_AgentID_FailoverAttempts, @FailoverErrors = @MJAIPromptRuns_AgentID_FailoverErrors, @FailoverDurations = @MJAIPromptRuns_AgentID_FailoverDurations, @OriginalModelID = @MJAIPromptRuns_AgentID_OriginalModelID, @OriginalRequestStartTime = @MJAIPromptRuns_AgentID_OriginalRequestStartTime, @TotalFailoverDuration = @MJAIPromptRuns_AgentID_TotalFailoverDuration, @RerunFromPromptRunID = @MJAIPromptRuns_AgentID_RerunFromPromptRunID, @ModelSelection = @MJAIPromptRuns_AgentID_ModelSelection, @Status = @MJAIPromptRuns_AgentID_Status, @Cancelled = @MJAIPromptRuns_AgentID_Cancelled, @CancellationReason = @MJAIPromptRuns_AgentID_CancellationReason, @ModelPowerRank = @MJAIPromptRuns_AgentID_ModelPowerRank, @SelectionStrategy = @MJAIPromptRuns_AgentID_SelectionStrategy, @CacheHit = @MJAIPromptRuns_AgentID_CacheHit, @CacheKey = @MJAIPromptRuns_AgentID_CacheKey, @JudgeID = @MJAIPromptRuns_AgentID_JudgeID, @JudgeScore = @MJAIPromptRuns_AgentID_JudgeScore, @WasSelectedResult = @MJAIPromptRuns_AgentID_WasSelectedResult, @StreamingEnabled = @MJAIPromptRuns_AgentID_StreamingEnabled, @FirstTokenTime = @MJAIPromptRuns_AgentID_FirstTokenTime, @ErrorDetails = @MJAIPromptRuns_AgentID_ErrorDetails, @ChildPromptID = @MJAIPromptRuns_AgentID_ChildPromptID, @QueueTime = @MJAIPromptRuns_AgentID_QueueTime, @PromptTime = @MJAIPromptRuns_AgentID_PromptTime, @CompletionTime = @MJAIPromptRuns_AgentID_CompletionTime, @ModelSpecificResponseDetails = @MJAIPromptRuns_AgentID_ModelSpecificResponseDetails, @EffortLevel = @MJAIPromptRuns_AgentID_EffortLevel, @RunName = @MJAIPromptRuns_AgentID_RunName, @Comments = @MJAIPromptRuns_AgentID_Comments, @TestRunID = @MJAIPromptRuns_AgentID_TestRunID, @AssistantPrefill = @MJAIPromptRuns_AgentID_AssistantPrefill, @TokensCacheRead = @MJAIPromptRuns_AgentID_TokensCacheRead, @TokensCacheWrite = @MJAIPromptRuns_AgentID_TokensCacheWrite, @TokensCacheReadRollup = @MJAIPromptRuns_AgentID_TokensCacheReadRollup, @TokensCacheWriteRollup = @MJAIPromptRuns_AgentID_TokensCacheWriteRollup

        FETCH NEXT FROM cascade_update_MJAIPromptRuns_AgentID_cursor INTO @MJAIPromptRuns_AgentIDID, @MJAIPromptRuns_AgentID_PromptID, @MJAIPromptRuns_AgentID_ModelID, @MJAIPromptRuns_AgentID_VendorID, @MJAIPromptRuns_AgentID_AgentID, @MJAIPromptRuns_AgentID_ConfigurationID, @MJAIPromptRuns_AgentID_RunAt, @MJAIPromptRuns_AgentID_CompletedAt, @MJAIPromptRuns_AgentID_ExecutionTimeMS, @MJAIPromptRuns_AgentID_Messages, @MJAIPromptRuns_AgentID_Result, @MJAIPromptRuns_AgentID_TokensUsed, @MJAIPromptRuns_AgentID_TokensPrompt, @MJAIPromptRuns_AgentID_TokensCompletion, @MJAIPromptRuns_AgentID_TotalCost, @MJAIPromptRuns_AgentID_Success, @MJAIPromptRuns_AgentID_ErrorMessage, @MJAIPromptRuns_AgentID_ParentID, @MJAIPromptRuns_AgentID_RunType, @MJAIPromptRuns_AgentID_ExecutionOrder, @MJAIPromptRuns_AgentID_Cost, @MJAIPromptRuns_AgentID_CostCurrency, @MJAIPromptRuns_AgentID_TokensUsedRollup, @MJAIPromptRuns_AgentID_TokensPromptRollup, @MJAIPromptRuns_AgentID_TokensCompletionRollup, @MJAIPromptRuns_AgentID_Temperature, @MJAIPromptRuns_AgentID_TopP, @MJAIPromptRuns_AgentID_TopK, @MJAIPromptRuns_AgentID_MinP, @MJAIPromptRuns_AgentID_FrequencyPenalty, @MJAIPromptRuns_AgentID_PresencePenalty, @MJAIPromptRuns_AgentID_Seed, @MJAIPromptRuns_AgentID_StopSequences, @MJAIPromptRuns_AgentID_ResponseFormat, @MJAIPromptRuns_AgentID_LogProbs, @MJAIPromptRuns_AgentID_TopLogProbs, @MJAIPromptRuns_AgentID_DescendantCost, @MJAIPromptRuns_AgentID_ValidationAttemptCount, @MJAIPromptRuns_AgentID_SuccessfulValidationCount, @MJAIPromptRuns_AgentID_FinalValidationPassed, @MJAIPromptRuns_AgentID_ValidationBehavior, @MJAIPromptRuns_AgentID_RetryStrategy, @MJAIPromptRuns_AgentID_MaxRetriesConfigured, @MJAIPromptRuns_AgentID_FinalValidationError, @MJAIPromptRuns_AgentID_ValidationErrorCount, @MJAIPromptRuns_AgentID_CommonValidationError, @MJAIPromptRuns_AgentID_FirstAttemptAt, @MJAIPromptRuns_AgentID_LastAttemptAt, @MJAIPromptRuns_AgentID_TotalRetryDurationMS, @MJAIPromptRuns_AgentID_ValidationAttempts, @MJAIPromptRuns_AgentID_ValidationSummary, @MJAIPromptRuns_AgentID_FailoverAttempts, @MJAIPromptRuns_AgentID_FailoverErrors, @MJAIPromptRuns_AgentID_FailoverDurations, @MJAIPromptRuns_AgentID_OriginalModelID, @MJAIPromptRuns_AgentID_OriginalRequestStartTime, @MJAIPromptRuns_AgentID_TotalFailoverDuration, @MJAIPromptRuns_AgentID_RerunFromPromptRunID, @MJAIPromptRuns_AgentID_ModelSelection, @MJAIPromptRuns_AgentID_Status, @MJAIPromptRuns_AgentID_Cancelled, @MJAIPromptRuns_AgentID_CancellationReason, @MJAIPromptRuns_AgentID_ModelPowerRank, @MJAIPromptRuns_AgentID_SelectionStrategy, @MJAIPromptRuns_AgentID_CacheHit, @MJAIPromptRuns_AgentID_CacheKey, @MJAIPromptRuns_AgentID_JudgeID, @MJAIPromptRuns_AgentID_JudgeScore, @MJAIPromptRuns_AgentID_WasSelectedResult, @MJAIPromptRuns_AgentID_StreamingEnabled, @MJAIPromptRuns_AgentID_FirstTokenTime, @MJAIPromptRuns_AgentID_ErrorDetails, @MJAIPromptRuns_AgentID_ChildPromptID, @MJAIPromptRuns_AgentID_QueueTime, @MJAIPromptRuns_AgentID_PromptTime, @MJAIPromptRuns_AgentID_CompletionTime, @MJAIPromptRuns_AgentID_ModelSpecificResponseDetails, @MJAIPromptRuns_AgentID_EffortLevel, @MJAIPromptRuns_AgentID_RunName, @MJAIPromptRuns_AgentID_Comments, @MJAIPromptRuns_AgentID_TestRunID, @MJAIPromptRuns_AgentID_AssistantPrefill, @MJAIPromptRuns_AgentID_TokensCacheRead, @MJAIPromptRuns_AgentID_TokensCacheWrite, @MJAIPromptRuns_AgentID_TokensCacheReadRollup, @MJAIPromptRuns_AgentID_TokensCacheWriteRollup
    END

    CLOSE cascade_update_MJAIPromptRuns_AgentID_cursor
    DEALLOCATE cascade_update_MJAIPromptRuns_AgentID_cursor
    
    -- Cascade update on AIResultCache using cursor to call spUpdateAIResultCache
    DECLARE @MJAIResultCache_AgentIDID uniqueidentifier
    DECLARE @MJAIResultCache_AgentID_AIPromptID uniqueidentifier
    DECLARE @MJAIResultCache_AgentID_AIModelID uniqueidentifier
    DECLARE @MJAIResultCache_AgentID_RunAt datetimeoffset
    DECLARE @MJAIResultCache_AgentID_PromptText nvarchar(MAX)
    DECLARE @MJAIResultCache_AgentID_ResultText nvarchar(MAX)
    DECLARE @MJAIResultCache_AgentID_Status nvarchar(50)
    DECLARE @MJAIResultCache_AgentID_ExpiredOn datetimeoffset
    DECLARE @MJAIResultCache_AgentID_VendorID uniqueidentifier
    DECLARE @MJAIResultCache_AgentID_AgentID uniqueidentifier
    DECLARE @MJAIResultCache_AgentID_ConfigurationID uniqueidentifier
    DECLARE @MJAIResultCache_AgentID_PromptEmbedding varbinary
    DECLARE @MJAIResultCache_AgentID_PromptRunID uniqueidentifier
    DECLARE cascade_update_MJAIResultCache_AgentID_cursor CURSOR FOR
        SELECT [ID], [AIPromptID], [AIModelID], [RunAt], [PromptText], [ResultText], [Status], [ExpiredOn], [VendorID], [AgentID], [ConfigurationID], [PromptEmbedding], [PromptRunID]
        FROM [${flyway:defaultSchema}].[AIResultCache]
        WHERE [AgentID] = @ID

    OPEN cascade_update_MJAIResultCache_AgentID_cursor
    FETCH NEXT FROM cascade_update_MJAIResultCache_AgentID_cursor INTO @MJAIResultCache_AgentIDID, @MJAIResultCache_AgentID_AIPromptID, @MJAIResultCache_AgentID_AIModelID, @MJAIResultCache_AgentID_RunAt, @MJAIResultCache_AgentID_PromptText, @MJAIResultCache_AgentID_ResultText, @MJAIResultCache_AgentID_Status, @MJAIResultCache_AgentID_ExpiredOn, @MJAIResultCache_AgentID_VendorID, @MJAIResultCache_AgentID_AgentID, @MJAIResultCache_AgentID_ConfigurationID, @MJAIResultCache_AgentID_PromptEmbedding, @MJAIResultCache_AgentID_PromptRunID

    WHILE @@FETCH_STATUS = 0
    BEGIN
        -- Set the FK field to NULL
        SET @MJAIResultCache_AgentID_AgentID = NULL

        -- Call the update SP for the related entity
        EXEC [${flyway:defaultSchema}].[spUpdateAIResultCache] @ID = @MJAIResultCache_AgentIDID, @AIPromptID = @MJAIResultCache_AgentID_AIPromptID, @AIModelID = @MJAIResultCache_AgentID_AIModelID, @RunAt = @MJAIResultCache_AgentID_RunAt, @PromptText = @MJAIResultCache_AgentID_PromptText, @ResultText = @MJAIResultCache_AgentID_ResultText, @Status = @MJAIResultCache_AgentID_Status, @ExpiredOn = @MJAIResultCache_AgentID_ExpiredOn, @VendorID = @MJAIResultCache_AgentID_VendorID, @AgentID_Clear = 1, @AgentID = @MJAIResultCache_AgentID_AgentID, @ConfigurationID = @MJAIResultCache_AgentID_ConfigurationID, @PromptEmbedding = @MJAIResultCache_AgentID_PromptEmbedding, @PromptRunID = @MJAIResultCache_AgentID_PromptRunID

        FETCH NEXT FROM cascade_update_MJAIResultCache_AgentID_cursor INTO @MJAIResultCache_AgentIDID, @MJAIResultCache_AgentID_AIPromptID, @MJAIResultCache_AgentID_AIModelID, @MJAIResultCache_AgentID_RunAt, @MJAIResultCache_AgentID_PromptText, @MJAIResultCache_AgentID_ResultText, @MJAIResultCache_AgentID_Status, @MJAIResultCache_AgentID_ExpiredOn, @MJAIResultCache_AgentID_VendorID, @MJAIResultCache_AgentID_AgentID, @MJAIResultCache_AgentID_ConfigurationID, @MJAIResultCache_AgentID_PromptEmbedding, @MJAIResultCache_AgentID_PromptRunID
    END

    CLOSE cascade_update_MJAIResultCache_AgentID_cursor
    DEALLOCATE cascade_update_MJAIResultCache_AgentID_cursor
    
    -- Cascade delete from AISkillSubAgent using cursor to call spDeleteAISkillSubAgent
    DECLARE @MJAISkillSubAgents_SubAgentIDID uniqueidentifier
    DECLARE cascade_delete_MJAISkillSubAgents_SubAgentID_cursor CURSOR FOR 
        SELECT [ID]
        FROM [${flyway:defaultSchema}].[AISkillSubAgent]
        WHERE [SubAgentID] = @ID
    
    OPEN cascade_delete_MJAISkillSubAgents_SubAgentID_cursor
    FETCH NEXT FROM cascade_delete_MJAISkillSubAgents_SubAgentID_cursor INTO @MJAISkillSubAgents_SubAgentIDID
    
    WHILE @@FETCH_STATUS = 0
    BEGIN
        EXEC [${flyway:defaultSchema}].[spDeleteAISkillSubAgent] @ID = @MJAISkillSubAgents_SubAgentIDID
        
        FETCH NEXT FROM cascade_delete_MJAISkillSubAgents_SubAgentID_cursor INTO @MJAISkillSubAgents_SubAgentIDID
    END
    
    CLOSE cascade_delete_MJAISkillSubAgents_SubAgentID_cursor
    DEALLOCATE cascade_delete_MJAISkillSubAgents_SubAgentID_cursor
    
    -- Cascade update on ConversationDetail using cursor to call spUpdateConversationDetail
    DECLARE @MJConversationDetails_AgentIDID uniqueidentifier
    DECLARE @MJConversationDetails_AgentID_ConversationID uniqueidentifier
    DECLARE @MJConversationDetails_AgentID_ExternalID nvarchar(100)
    DECLARE @MJConversationDetails_AgentID_Role nvarchar(20)
    DECLARE @MJConversationDetails_AgentID_Message nvarchar(MAX)
    DECLARE @MJConversationDetails_AgentID_Error nvarchar(MAX)
    DECLARE @MJConversationDetails_AgentID_HiddenToUser bit
    DECLARE @MJConversationDetails_AgentID_UserRating int
    DECLARE @MJConversationDetails_AgentID_UserFeedback nvarchar(MAX)
    DECLARE @MJConversationDetails_AgentID_ReflectionInsights nvarchar(MAX)
    DECLARE @MJConversationDetails_AgentID_SummaryOfEarlierConversation nvarchar(MAX)
    DECLARE @MJConversationDetails_AgentID_UserID uniqueidentifier
    DECLARE @MJConversationDetails_AgentID_ArtifactID uniqueidentifier
    DECLARE @MJConversationDetails_AgentID_ArtifactVersionID uniqueidentifier
    DECLARE @MJConversationDetails_AgentID_CompletionTime bigint
    DECLARE @MJConversationDetails_AgentID_IsPinned bit
    DECLARE @MJConversationDetails_AgentID_ParentID uniqueidentifier
    DECLARE @MJConversationDetails_AgentID_AgentID uniqueidentifier
    DECLARE @MJConversationDetails_AgentID_Status nvarchar(20)
    DECLARE @MJConversationDetails_AgentID_SuggestedResponses nvarchar(MAX)
    DECLARE @MJConversationDetails_AgentID_TestRunID uniqueidentifier
    DECLARE @MJConversationDetails_AgentID_ResponseForm nvarchar(MAX)
    DECLARE @MJConversationDetails_AgentID_ActionableCommands nvarchar(MAX)
    DECLARE @MJConversationDetails_AgentID_AutomaticCommands nvarchar(MAX)
    DECLARE @MJConversationDetails_AgentID_OriginalMessageChanged bit
    DECLARE @MJConversationDetails_AgentID_AgentSessionID uniqueidentifier
    DECLARE @MJConversationDetails_AgentID_TurnEndedAt datetimeoffset
    DECLARE @MJConversationDetails_AgentID_UtteranceStartMs int
    DECLARE @MJConversationDetails_AgentID_UtteranceEndMs int
    DECLARE @MJConversationDetails_AgentID_MediaType nvarchar(20)
    DECLARE cascade_update_MJConversationDetails_AgentID_cursor CURSOR FOR
        SELECT [ID], [ConversationID], [ExternalID], [Role], [Message], [Error], [HiddenToUser], [UserRating], [UserFeedback], [ReflectionInsights], [SummaryOfEarlierConversation], [UserID], [ArtifactID], [ArtifactVersionID], [CompletionTime], [IsPinned], [ParentID], [AgentID], [Status], [SuggestedResponses], [TestRunID], [ResponseForm], [ActionableCommands], [AutomaticCommands], [OriginalMessageChanged], [AgentSessionID], [TurnEndedAt], [UtteranceStartMs], [UtteranceEndMs], [MediaType]
        FROM [${flyway:defaultSchema}].[ConversationDetail]
        WHERE [AgentID] = @ID

    OPEN cascade_update_MJConversationDetails_AgentID_cursor
    FETCH NEXT FROM cascade_update_MJConversationDetails_AgentID_cursor INTO @MJConversationDetails_AgentIDID, @MJConversationDetails_AgentID_ConversationID, @MJConversationDetails_AgentID_ExternalID, @MJConversationDetails_AgentID_Role, @MJConversationDetails_AgentID_Message, @MJConversationDetails_AgentID_Error, @MJConversationDetails_AgentID_HiddenToUser, @MJConversationDetails_AgentID_UserRating, @MJConversationDetails_AgentID_UserFeedback, @MJConversationDetails_AgentID_ReflectionInsights, @MJConversationDetails_AgentID_SummaryOfEarlierConversation, @MJConversationDetails_AgentID_UserID, @MJConversationDetails_AgentID_ArtifactID, @MJConversationDetails_AgentID_ArtifactVersionID, @MJConversationDetails_AgentID_CompletionTime, @MJConversationDetails_AgentID_IsPinned, @MJConversationDetails_AgentID_ParentID, @MJConversationDetails_AgentID_AgentID, @MJConversationDetails_AgentID_Status, @MJConversationDetails_AgentID_SuggestedResponses, @MJConversationDetails_AgentID_TestRunID, @MJConversationDetails_AgentID_ResponseForm, @MJConversationDetails_AgentID_ActionableCommands, @MJConversationDetails_AgentID_AutomaticCommands, @MJConversationDetails_AgentID_OriginalMessageChanged, @MJConversationDetails_AgentID_AgentSessionID, @MJConversationDetails_AgentID_TurnEndedAt, @MJConversationDetails_AgentID_UtteranceStartMs, @MJConversationDetails_AgentID_UtteranceEndMs, @MJConversationDetails_AgentID_MediaType

    WHILE @@FETCH_STATUS = 0
    BEGIN
        -- Set the FK field to NULL
        SET @MJConversationDetails_AgentID_AgentID = NULL

        -- Call the update SP for the related entity
        EXEC [${flyway:defaultSchema}].[spUpdateConversationDetail] @ID = @MJConversationDetails_AgentIDID, @ConversationID = @MJConversationDetails_AgentID_ConversationID, @ExternalID = @MJConversationDetails_AgentID_ExternalID, @Role = @MJConversationDetails_AgentID_Role, @Message = @MJConversationDetails_AgentID_Message, @Error = @MJConversationDetails_AgentID_Error, @HiddenToUser = @MJConversationDetails_AgentID_HiddenToUser, @UserRating = @MJConversationDetails_AgentID_UserRating, @UserFeedback = @MJConversationDetails_AgentID_UserFeedback, @ReflectionInsights = @MJConversationDetails_AgentID_ReflectionInsights, @SummaryOfEarlierConversation = @MJConversationDetails_AgentID_SummaryOfEarlierConversation, @UserID = @MJConversationDetails_AgentID_UserID, @ArtifactID = @MJConversationDetails_AgentID_ArtifactID, @ArtifactVersionID = @MJConversationDetails_AgentID_ArtifactVersionID, @CompletionTime = @MJConversationDetails_AgentID_CompletionTime, @IsPinned = @MJConversationDetails_AgentID_IsPinned, @ParentID = @MJConversationDetails_AgentID_ParentID, @AgentID_Clear = 1, @AgentID = @MJConversationDetails_AgentID_AgentID, @Status = @MJConversationDetails_AgentID_Status, @SuggestedResponses = @MJConversationDetails_AgentID_SuggestedResponses, @TestRunID = @MJConversationDetails_AgentID_TestRunID, @ResponseForm = @MJConversationDetails_AgentID_ResponseForm, @ActionableCommands = @MJConversationDetails_AgentID_ActionableCommands, @AutomaticCommands = @MJConversationDetails_AgentID_AutomaticCommands, @OriginalMessageChanged = @MJConversationDetails_AgentID_OriginalMessageChanged, @AgentSessionID = @MJConversationDetails_AgentID_AgentSessionID, @TurnEndedAt = @MJConversationDetails_AgentID_TurnEndedAt, @UtteranceStartMs = @MJConversationDetails_AgentID_UtteranceStartMs, @UtteranceEndMs = @MJConversationDetails_AgentID_UtteranceEndMs, @MediaType = @MJConversationDetails_AgentID_MediaType

        FETCH NEXT FROM cascade_update_MJConversationDetails_AgentID_cursor INTO @MJConversationDetails_AgentIDID, @MJConversationDetails_AgentID_ConversationID, @MJConversationDetails_AgentID_ExternalID, @MJConversationDetails_AgentID_Role, @MJConversationDetails_AgentID_Message, @MJConversationDetails_AgentID_Error, @MJConversationDetails_AgentID_HiddenToUser, @MJConversationDetails_AgentID_UserRating, @MJConversationDetails_AgentID_UserFeedback, @MJConversationDetails_AgentID_ReflectionInsights, @MJConversationDetails_AgentID_SummaryOfEarlierConversation, @MJConversationDetails_AgentID_UserID, @MJConversationDetails_AgentID_ArtifactID, @MJConversationDetails_AgentID_ArtifactVersionID, @MJConversationDetails_AgentID_CompletionTime, @MJConversationDetails_AgentID_IsPinned, @MJConversationDetails_AgentID_ParentID, @MJConversationDetails_AgentID_AgentID, @MJConversationDetails_AgentID_Status, @MJConversationDetails_AgentID_SuggestedResponses, @MJConversationDetails_AgentID_TestRunID, @MJConversationDetails_AgentID_ResponseForm, @MJConversationDetails_AgentID_ActionableCommands, @MJConversationDetails_AgentID_AutomaticCommands, @MJConversationDetails_AgentID_OriginalMessageChanged, @MJConversationDetails_AgentID_AgentSessionID, @MJConversationDetails_AgentID_TurnEndedAt, @MJConversationDetails_AgentID_UtteranceStartMs, @MJConversationDetails_AgentID_UtteranceEndMs, @MJConversationDetails_AgentID_MediaType
    END

    CLOSE cascade_update_MJConversationDetails_AgentID_cursor
    DEALLOCATE cascade_update_MJConversationDetails_AgentID_cursor
    
    -- Cascade delete from ConversationWidgetInstance using cursor to call spDeleteConversationWidgetInstance
    DECLARE @MJConversationWidgetInstances_PinnedAgentIDID uniqueidentifier
    DECLARE cascade_delete_MJConversationWidgetInstances_PinnedAgentID_cursor CURSOR FOR 
        SELECT [ID]
        FROM [${flyway:defaultSchema}].[ConversationWidgetInstance]
        WHERE [PinnedAgentID] = @ID
    
    OPEN cascade_delete_MJConversationWidgetInstances_PinnedAgentID_cursor
    FETCH NEXT FROM cascade_delete_MJConversationWidgetInstances_PinnedAgentID_cursor INTO @MJConversationWidgetInstances_PinnedAgentIDID
    
    WHILE @@FETCH_STATUS = 0
    BEGIN
        EXEC [${flyway:defaultSchema}].[spDeleteConversationWidgetInstance] @ID = @MJConversationWidgetInstances_PinnedAgentIDID
        
        FETCH NEXT FROM cascade_delete_MJConversationWidgetInstances_PinnedAgentID_cursor INTO @MJConversationWidgetInstances_PinnedAgentIDID
    END
    
    CLOSE cascade_delete_MJConversationWidgetInstances_PinnedAgentID_cursor
    DEALLOCATE cascade_delete_MJConversationWidgetInstances_PinnedAgentID_cursor
    
    -- Cascade update on Conversation using cursor to call spUpdateConversation
    DECLARE @MJConversations_DefaultAgentIDID uniqueidentifier
    DECLARE @MJConversations_DefaultAgentID_UserID uniqueidentifier
    DECLARE @MJConversations_DefaultAgentID_ExternalID nvarchar(500)
    DECLARE @MJConversations_DefaultAgentID_Name nvarchar(255)
    DECLARE @MJConversations_DefaultAgentID_Description nvarchar(MAX)
    DECLARE @MJConversations_DefaultAgentID_Type nvarchar(50)
    DECLARE @MJConversations_DefaultAgentID_IsArchived bit
    DECLARE @MJConversations_DefaultAgentID_LinkedEntityID uniqueidentifier
    DECLARE @MJConversations_DefaultAgentID_LinkedRecordID nvarchar(500)
    DECLARE @MJConversations_DefaultAgentID_DataContextID uniqueidentifier
    DECLARE @MJConversations_DefaultAgentID_Status nvarchar(20)
    DECLARE @MJConversations_DefaultAgentID_EnvironmentID uniqueidentifier
    DECLARE @MJConversations_DefaultAgentID_ProjectID uniqueidentifier
    DECLARE @MJConversations_DefaultAgentID_IsPinned bit
    DECLARE @MJConversations_DefaultAgentID_TestRunID uniqueidentifier
    DECLARE @MJConversations_DefaultAgentID_ApplicationScope nvarchar(20)
    DECLARE @MJConversations_DefaultAgentID_ApplicationID uniqueidentifier
    DECLARE @MJConversations_DefaultAgentID_DefaultAgentID uniqueidentifier
    DECLARE @MJConversations_DefaultAgentID_AdditionalData nvarchar(MAX)
    DECLARE @MJConversations_DefaultAgentID_RecordingFileID uniqueidentifier
    DECLARE @MJConversations_DefaultAgentID_EgressID nvarchar(255)
    DECLARE @MJConversations_DefaultAgentID_VisitorKey nvarchar(255)
    DECLARE @MJConversations_DefaultAgentID_LastConversationID uniqueidentifier
    DECLARE cascade_update_MJConversations_DefaultAgentID_cursor CURSOR FOR
        SELECT [ID], [UserID], [ExternalID], [Name], [Description], [Type], [IsArchived], [LinkedEntityID], [LinkedRecordID], [DataContextID], [Status], [EnvironmentID], [ProjectID], [IsPinned], [TestRunID], [ApplicationScope], [ApplicationID], [DefaultAgentID], [AdditionalData], [RecordingFileID], [EgressID], [VisitorKey], [LastConversationID]
        FROM [${flyway:defaultSchema}].[Conversation]
        WHERE [DefaultAgentID] = @ID

    OPEN cascade_update_MJConversations_DefaultAgentID_cursor
    FETCH NEXT FROM cascade_update_MJConversations_DefaultAgentID_cursor INTO @MJConversations_DefaultAgentIDID, @MJConversations_DefaultAgentID_UserID, @MJConversations_DefaultAgentID_ExternalID, @MJConversations_DefaultAgentID_Name, @MJConversations_DefaultAgentID_Description, @MJConversations_DefaultAgentID_Type, @MJConversations_DefaultAgentID_IsArchived, @MJConversations_DefaultAgentID_LinkedEntityID, @MJConversations_DefaultAgentID_LinkedRecordID, @MJConversations_DefaultAgentID_DataContextID, @MJConversations_DefaultAgentID_Status, @MJConversations_DefaultAgentID_EnvironmentID, @MJConversations_DefaultAgentID_ProjectID, @MJConversations_DefaultAgentID_IsPinned, @MJConversations_DefaultAgentID_TestRunID, @MJConversations_DefaultAgentID_ApplicationScope, @MJConversations_DefaultAgentID_ApplicationID, @MJConversations_DefaultAgentID_DefaultAgentID, @MJConversations_DefaultAgentID_AdditionalData, @MJConversations_DefaultAgentID_RecordingFileID, @MJConversations_DefaultAgentID_EgressID, @MJConversations_DefaultAgentID_VisitorKey, @MJConversations_DefaultAgentID_LastConversationID

    WHILE @@FETCH_STATUS = 0
    BEGIN
        -- Set the FK field to NULL
        SET @MJConversations_DefaultAgentID_DefaultAgentID = NULL

        -- Call the update SP for the related entity
        EXEC [${flyway:defaultSchema}].[spUpdateConversation] @ID = @MJConversations_DefaultAgentIDID, @UserID = @MJConversations_DefaultAgentID_UserID, @ExternalID = @MJConversations_DefaultAgentID_ExternalID, @Name = @MJConversations_DefaultAgentID_Name, @Description = @MJConversations_DefaultAgentID_Description, @Type = @MJConversations_DefaultAgentID_Type, @IsArchived = @MJConversations_DefaultAgentID_IsArchived, @LinkedEntityID = @MJConversations_DefaultAgentID_LinkedEntityID, @LinkedRecordID = @MJConversations_DefaultAgentID_LinkedRecordID, @DataContextID = @MJConversations_DefaultAgentID_DataContextID, @Status = @MJConversations_DefaultAgentID_Status, @EnvironmentID = @MJConversations_DefaultAgentID_EnvironmentID, @ProjectID = @MJConversations_DefaultAgentID_ProjectID, @IsPinned = @MJConversations_DefaultAgentID_IsPinned, @TestRunID = @MJConversations_DefaultAgentID_TestRunID, @ApplicationScope = @MJConversations_DefaultAgentID_ApplicationScope, @ApplicationID = @MJConversations_DefaultAgentID_ApplicationID, @DefaultAgentID_Clear = 1, @DefaultAgentID = @MJConversations_DefaultAgentID_DefaultAgentID, @AdditionalData = @MJConversations_DefaultAgentID_AdditionalData, @RecordingFileID = @MJConversations_DefaultAgentID_RecordingFileID, @EgressID = @MJConversations_DefaultAgentID_EgressID, @VisitorKey = @MJConversations_DefaultAgentID_VisitorKey, @LastConversationID = @MJConversations_DefaultAgentID_LastConversationID

        FETCH NEXT FROM cascade_update_MJConversations_DefaultAgentID_cursor INTO @MJConversations_DefaultAgentIDID, @MJConversations_DefaultAgentID_UserID, @MJConversations_DefaultAgentID_ExternalID, @MJConversations_DefaultAgentID_Name, @MJConversations_DefaultAgentID_Description, @MJConversations_DefaultAgentID_Type, @MJConversations_DefaultAgentID_IsArchived, @MJConversations_DefaultAgentID_LinkedEntityID, @MJConversations_DefaultAgentID_LinkedRecordID, @MJConversations_DefaultAgentID_DataContextID, @MJConversations_DefaultAgentID_Status, @MJConversations_DefaultAgentID_EnvironmentID, @MJConversations_DefaultAgentID_ProjectID, @MJConversations_DefaultAgentID_IsPinned, @MJConversations_DefaultAgentID_TestRunID, @MJConversations_DefaultAgentID_ApplicationScope, @MJConversations_DefaultAgentID_ApplicationID, @MJConversations_DefaultAgentID_DefaultAgentID, @MJConversations_DefaultAgentID_AdditionalData, @MJConversations_DefaultAgentID_RecordingFileID, @MJConversations_DefaultAgentID_EgressID, @MJConversations_DefaultAgentID_VisitorKey, @MJConversations_DefaultAgentID_LastConversationID
    END

    CLOSE cascade_update_MJConversations_DefaultAgentID_cursor
    DEALLOCATE cascade_update_MJConversations_DefaultAgentID_cursor
    
    -- Cascade update on EntityDocument using cursor to call spUpdateEntityDocument
    DECLARE @MJEntityDocuments_ReasoningAgentIDID uniqueidentifier
    DECLARE @MJEntityDocuments_ReasoningAgentID_Name nvarchar(250)
    DECLARE @MJEntityDocuments_ReasoningAgentID_TypeID uniqueidentifier
    DECLARE @MJEntityDocuments_ReasoningAgentID_EntityID uniqueidentifier
    DECLARE @MJEntityDocuments_ReasoningAgentID_VectorDatabaseID uniqueidentifier
    DECLARE @MJEntityDocuments_ReasoningAgentID_Status nvarchar(15)
    DECLARE @MJEntityDocuments_ReasoningAgentID_TemplateID uniqueidentifier
    DECLARE @MJEntityDocuments_ReasoningAgentID_AIModelID uniqueidentifier
    DECLARE @MJEntityDocuments_ReasoningAgentID_PotentialMatchThreshold numeric(12, 11)
    DECLARE @MJEntityDocuments_ReasoningAgentID_AbsoluteMatchThreshold numeric(12, 11)
    DECLARE @MJEntityDocuments_ReasoningAgentID_VectorIndexID uniqueidentifier
    DECLARE @MJEntityDocuments_ReasoningAgentID_Configuration nvarchar(MAX)
    DECLARE @MJEntityDocuments_ReasoningAgentID_EnableLLMReasoning bit
    DECLARE @MJEntityDocuments_ReasoningAgentID_ReasoningMode nvarchar(20)
    DECLARE @MJEntityDocuments_ReasoningAgentID_ReasoningThreshold numeric(12, 11)
    DECLARE @MJEntityDocuments_ReasoningAgentID_ReasoningPromptID uniqueidentifier
    DECLARE @MJEntityDocuments_ReasoningAgentID_ReasoningAgentID uniqueidentifier
    DECLARE @MJEntityDocuments_ReasoningAgentID_AutomationLevel nvarchar(30)
    DECLARE cascade_update_MJEntityDocuments_ReasoningAgentID_cursor CURSOR FOR
        SELECT [ID], [Name], [TypeID], [EntityID], [VectorDatabaseID], [Status], [TemplateID], [AIModelID], [PotentialMatchThreshold], [AbsoluteMatchThreshold], [VectorIndexID], [Configuration], [EnableLLMReasoning], [ReasoningMode], [ReasoningThreshold], [ReasoningPromptID], [ReasoningAgentID], [AutomationLevel]
        FROM [${flyway:defaultSchema}].[EntityDocument]
        WHERE [ReasoningAgentID] = @ID

    OPEN cascade_update_MJEntityDocuments_ReasoningAgentID_cursor
    FETCH NEXT FROM cascade_update_MJEntityDocuments_ReasoningAgentID_cursor INTO @MJEntityDocuments_ReasoningAgentIDID, @MJEntityDocuments_ReasoningAgentID_Name, @MJEntityDocuments_ReasoningAgentID_TypeID, @MJEntityDocuments_ReasoningAgentID_EntityID, @MJEntityDocuments_ReasoningAgentID_VectorDatabaseID, @MJEntityDocuments_ReasoningAgentID_Status, @MJEntityDocuments_ReasoningAgentID_TemplateID, @MJEntityDocuments_ReasoningAgentID_AIModelID, @MJEntityDocuments_ReasoningAgentID_PotentialMatchThreshold, @MJEntityDocuments_ReasoningAgentID_AbsoluteMatchThreshold, @MJEntityDocuments_ReasoningAgentID_VectorIndexID, @MJEntityDocuments_ReasoningAgentID_Configuration, @MJEntityDocuments_ReasoningAgentID_EnableLLMReasoning, @MJEntityDocuments_ReasoningAgentID_ReasoningMode, @MJEntityDocuments_ReasoningAgentID_ReasoningThreshold, @MJEntityDocuments_ReasoningAgentID_ReasoningPromptID, @MJEntityDocuments_ReasoningAgentID_ReasoningAgentID, @MJEntityDocuments_ReasoningAgentID_AutomationLevel

    WHILE @@FETCH_STATUS = 0
    BEGIN
        -- Set the FK field to NULL
        SET @MJEntityDocuments_ReasoningAgentID_ReasoningAgentID = NULL

        -- Call the update SP for the related entity
        EXEC [${flyway:defaultSchema}].[spUpdateEntityDocument] @ID = @MJEntityDocuments_ReasoningAgentIDID, @Name = @MJEntityDocuments_ReasoningAgentID_Name, @TypeID = @MJEntityDocuments_ReasoningAgentID_TypeID, @EntityID = @MJEntityDocuments_ReasoningAgentID_EntityID, @VectorDatabaseID = @MJEntityDocuments_ReasoningAgentID_VectorDatabaseID, @Status = @MJEntityDocuments_ReasoningAgentID_Status, @TemplateID = @MJEntityDocuments_ReasoningAgentID_TemplateID, @AIModelID = @MJEntityDocuments_ReasoningAgentID_AIModelID, @PotentialMatchThreshold = @MJEntityDocuments_ReasoningAgentID_PotentialMatchThreshold, @AbsoluteMatchThreshold = @MJEntityDocuments_ReasoningAgentID_AbsoluteMatchThreshold, @VectorIndexID = @MJEntityDocuments_ReasoningAgentID_VectorIndexID, @Configuration = @MJEntityDocuments_ReasoningAgentID_Configuration, @EnableLLMReasoning = @MJEntityDocuments_ReasoningAgentID_EnableLLMReasoning, @ReasoningMode = @MJEntityDocuments_ReasoningAgentID_ReasoningMode, @ReasoningThreshold = @MJEntityDocuments_ReasoningAgentID_ReasoningThreshold, @ReasoningPromptID = @MJEntityDocuments_ReasoningAgentID_ReasoningPromptID, @ReasoningAgentID_Clear = 1, @ReasoningAgentID = @MJEntityDocuments_ReasoningAgentID_ReasoningAgentID, @AutomationLevel = @MJEntityDocuments_ReasoningAgentID_AutomationLevel

        FETCH NEXT FROM cascade_update_MJEntityDocuments_ReasoningAgentID_cursor INTO @MJEntityDocuments_ReasoningAgentIDID, @MJEntityDocuments_ReasoningAgentID_Name, @MJEntityDocuments_ReasoningAgentID_TypeID, @MJEntityDocuments_ReasoningAgentID_EntityID, @MJEntityDocuments_ReasoningAgentID_VectorDatabaseID, @MJEntityDocuments_ReasoningAgentID_Status, @MJEntityDocuments_ReasoningAgentID_TemplateID, @MJEntityDocuments_ReasoningAgentID_AIModelID, @MJEntityDocuments_ReasoningAgentID_PotentialMatchThreshold, @MJEntityDocuments_ReasoningAgentID_AbsoluteMatchThreshold, @MJEntityDocuments_ReasoningAgentID_VectorIndexID, @MJEntityDocuments_ReasoningAgentID_Configuration, @MJEntityDocuments_ReasoningAgentID_EnableLLMReasoning, @MJEntityDocuments_ReasoningAgentID_ReasoningMode, @MJEntityDocuments_ReasoningAgentID_ReasoningThreshold, @MJEntityDocuments_ReasoningAgentID_ReasoningPromptID, @MJEntityDocuments_ReasoningAgentID_ReasoningAgentID, @MJEntityDocuments_ReasoningAgentID_AutomationLevel
    END

    CLOSE cascade_update_MJEntityDocuments_ReasoningAgentID_cursor
    DEALLOCATE cascade_update_MJEntityDocuments_ReasoningAgentID_cursor
    
    -- Cascade update on RecordProcess using cursor to call spUpdateRecordProcess
    DECLARE @MJRecordProcesses_AgentIDID uniqueidentifier
    DECLARE @MJRecordProcesses_AgentID_Name nvarchar(255)
    DECLARE @MJRecordProcesses_AgentID_Description nvarchar(MAX)
    DECLARE @MJRecordProcesses_AgentID_CategoryID uniqueidentifier
    DECLARE @MJRecordProcesses_AgentID_EntityID uniqueidentifier
    DECLARE @MJRecordProcesses_AgentID_Status nvarchar(20)
    DECLARE @MJRecordProcesses_AgentID_WorkType nvarchar(20)
    DECLARE @MJRecordProcesses_AgentID_ActionID uniqueidentifier
    DECLARE @MJRecordProcesses_AgentID_AgentID uniqueidentifier
    DECLARE @MJRecordProcesses_AgentID_PromptID uniqueidentifier
    DECLARE @MJRecordProcesses_AgentID_ScopeType nvarchar(20)
    DECLARE @MJRecordProcesses_AgentID_ScopeViewID uniqueidentifier
    DECLARE @MJRecordProcesses_AgentID_ScopeListID uniqueidentifier
    DECLARE @MJRecordProcesses_AgentID_ScopeFilter nvarchar(MAX)
    DECLARE @MJRecordProcesses_AgentID_OnChangeEnabled bit
    DECLARE @MJRecordProcesses_AgentID_OnChangeInvocationType nvarchar(30)
    DECLARE @MJRecordProcesses_AgentID_OnChangeFilter nvarchar(MAX)
    DECLARE @MJRecordProcesses_AgentID_ScheduleEnabled bit
    DECLARE @MJRecordProcesses_AgentID_CronExpression nvarchar(120)
    DECLARE @MJRecordProcesses_AgentID_Timezone nvarchar(100)
    DECLARE @MJRecordProcesses_AgentID_OnDemandEnabled bit
    DECLARE @MJRecordProcesses_AgentID_InputMapping nvarchar(MAX)
    DECLARE @MJRecordProcesses_AgentID_OutputMapping nvarchar(MAX)
    DECLARE @MJRecordProcesses_AgentID_SkipUnchanged bit
    DECLARE @MJRecordProcesses_AgentID_WatermarkStrategy nvarchar(20)
    DECLARE @MJRecordProcesses_AgentID_BatchSize int
    DECLARE @MJRecordProcesses_AgentID_MaxConcurrency int
    DECLARE @MJRecordProcesses_AgentID_Configuration nvarchar(MAX)
    DECLARE cascade_update_MJRecordProcesses_AgentID_cursor CURSOR FOR
        SELECT [ID], [Name], [Description], [CategoryID], [EntityID], [Status], [WorkType], [ActionID], [AgentID], [PromptID], [ScopeType], [ScopeViewID], [ScopeListID], [ScopeFilter], [OnChangeEnabled], [OnChangeInvocationType], [OnChangeFilter], [ScheduleEnabled], [CronExpression], [Timezone], [OnDemandEnabled], [InputMapping], [OutputMapping], [SkipUnchanged], [WatermarkStrategy], [BatchSize], [MaxConcurrency], [Configuration]
        FROM [${flyway:defaultSchema}].[RecordProcess]
        WHERE [AgentID] = @ID

    OPEN cascade_update_MJRecordProcesses_AgentID_cursor
    FETCH NEXT FROM cascade_update_MJRecordProcesses_AgentID_cursor INTO @MJRecordProcesses_AgentIDID, @MJRecordProcesses_AgentID_Name, @MJRecordProcesses_AgentID_Description, @MJRecordProcesses_AgentID_CategoryID, @MJRecordProcesses_AgentID_EntityID, @MJRecordProcesses_AgentID_Status, @MJRecordProcesses_AgentID_WorkType, @MJRecordProcesses_AgentID_ActionID, @MJRecordProcesses_AgentID_AgentID, @MJRecordProcesses_AgentID_PromptID, @MJRecordProcesses_AgentID_ScopeType, @MJRecordProcesses_AgentID_ScopeViewID, @MJRecordProcesses_AgentID_ScopeListID, @MJRecordProcesses_AgentID_ScopeFilter, @MJRecordProcesses_AgentID_OnChangeEnabled, @MJRecordProcesses_AgentID_OnChangeInvocationType, @MJRecordProcesses_AgentID_OnChangeFilter, @MJRecordProcesses_AgentID_ScheduleEnabled, @MJRecordProcesses_AgentID_CronExpression, @MJRecordProcesses_AgentID_Timezone, @MJRecordProcesses_AgentID_OnDemandEnabled, @MJRecordProcesses_AgentID_InputMapping, @MJRecordProcesses_AgentID_OutputMapping, @MJRecordProcesses_AgentID_SkipUnchanged, @MJRecordProcesses_AgentID_WatermarkStrategy, @MJRecordProcesses_AgentID_BatchSize, @MJRecordProcesses_AgentID_MaxConcurrency, @MJRecordProcesses_AgentID_Configuration

    WHILE @@FETCH_STATUS = 0
    BEGIN
        -- Set the FK field to NULL
        SET @MJRecordProcesses_AgentID_AgentID = NULL

        -- Call the update SP for the related entity
        EXEC [${flyway:defaultSchema}].[spUpdateRecordProcess] @ID = @MJRecordProcesses_AgentIDID, @Name = @MJRecordProcesses_AgentID_Name, @Description = @MJRecordProcesses_AgentID_Description, @CategoryID = @MJRecordProcesses_AgentID_CategoryID, @EntityID = @MJRecordProcesses_AgentID_EntityID, @Status = @MJRecordProcesses_AgentID_Status, @WorkType = @MJRecordProcesses_AgentID_WorkType, @ActionID = @MJRecordProcesses_AgentID_ActionID, @AgentID_Clear = 1, @AgentID = @MJRecordProcesses_AgentID_AgentID, @PromptID = @MJRecordProcesses_AgentID_PromptID, @ScopeType = @MJRecordProcesses_AgentID_ScopeType, @ScopeViewID = @MJRecordProcesses_AgentID_ScopeViewID, @ScopeListID = @MJRecordProcesses_AgentID_ScopeListID, @ScopeFilter = @MJRecordProcesses_AgentID_ScopeFilter, @OnChangeEnabled = @MJRecordProcesses_AgentID_OnChangeEnabled, @OnChangeInvocationType = @MJRecordProcesses_AgentID_OnChangeInvocationType, @OnChangeFilter = @MJRecordProcesses_AgentID_OnChangeFilter, @ScheduleEnabled = @MJRecordProcesses_AgentID_ScheduleEnabled, @CronExpression = @MJRecordProcesses_AgentID_CronExpression, @Timezone = @MJRecordProcesses_AgentID_Timezone, @OnDemandEnabled = @MJRecordProcesses_AgentID_OnDemandEnabled, @InputMapping = @MJRecordProcesses_AgentID_InputMapping, @OutputMapping = @MJRecordProcesses_AgentID_OutputMapping, @SkipUnchanged = @MJRecordProcesses_AgentID_SkipUnchanged, @WatermarkStrategy = @MJRecordProcesses_AgentID_WatermarkStrategy, @BatchSize = @MJRecordProcesses_AgentID_BatchSize, @MaxConcurrency = @MJRecordProcesses_AgentID_MaxConcurrency, @Configuration = @MJRecordProcesses_AgentID_Configuration

        FETCH NEXT FROM cascade_update_MJRecordProcesses_AgentID_cursor INTO @MJRecordProcesses_AgentIDID, @MJRecordProcesses_AgentID_Name, @MJRecordProcesses_AgentID_Description, @MJRecordProcesses_AgentID_CategoryID, @MJRecordProcesses_AgentID_EntityID, @MJRecordProcesses_AgentID_Status, @MJRecordProcesses_AgentID_WorkType, @MJRecordProcesses_AgentID_ActionID, @MJRecordProcesses_AgentID_AgentID, @MJRecordProcesses_AgentID_PromptID, @MJRecordProcesses_AgentID_ScopeType, @MJRecordProcesses_AgentID_ScopeViewID, @MJRecordProcesses_AgentID_ScopeListID, @MJRecordProcesses_AgentID_ScopeFilter, @MJRecordProcesses_AgentID_OnChangeEnabled, @MJRecordProcesses_AgentID_OnChangeInvocationType, @MJRecordProcesses_AgentID_OnChangeFilter, @MJRecordProcesses_AgentID_ScheduleEnabled, @MJRecordProcesses_AgentID_CronExpression, @MJRecordProcesses_AgentID_Timezone, @MJRecordProcesses_AgentID_OnDemandEnabled, @MJRecordProcesses_AgentID_InputMapping, @MJRecordProcesses_AgentID_OutputMapping, @MJRecordProcesses_AgentID_SkipUnchanged, @MJRecordProcesses_AgentID_WatermarkStrategy, @MJRecordProcesses_AgentID_BatchSize, @MJRecordProcesses_AgentID_MaxConcurrency, @MJRecordProcesses_AgentID_Configuration
    END

    CLOSE cascade_update_MJRecordProcesses_AgentID_cursor
    DEALLOCATE cascade_update_MJRecordProcesses_AgentID_cursor
    
    -- Cascade update on SearchExecutionLog using cursor to call spUpdateSearchExecutionLog
    DECLARE @MJSearchExecutionLogs_AIAgentIDID uniqueidentifier
    DECLARE @MJSearchExecutionLogs_AIAgentID_SearchScopeID uniqueidentifier
    DECLARE @MJSearchExecutionLogs_AIAgentID_UserID uniqueidentifier
    DECLARE @MJSearchExecutionLogs_AIAgentID_AIAgentID uniqueidentifier
    DECLARE @MJSearchExecutionLogs_AIAgentID_Query nvarchar(MAX)
    DECLARE @MJSearchExecutionLogs_AIAgentID_TotalDurationMs int
    DECLARE @MJSearchExecutionLogs_AIAgentID_ResultCount int
    DECLARE @MJSearchExecutionLogs_AIAgentID_RerankerName nvarchar(100)
    DECLARE @MJSearchExecutionLogs_AIAgentID_RerankerCostCents decimal(10, 4)
    DECLARE @MJSearchExecutionLogs_AIAgentID_Status nvarchar(20)
    DECLARE @MJSearchExecutionLogs_AIAgentID_FailureReason nvarchar(500)
    DECLARE @MJSearchExecutionLogs_AIAgentID_ProvidersJSON nvarchar(MAX)
    DECLARE @MJSearchExecutionLogs_AIAgentID_AISkillID uniqueidentifier
    DECLARE @MJSearchExecutionLogs_AIAgentID_PrimaryScopeRecordID uniqueidentifier
    DECLARE @MJSearchExecutionLogs_AIAgentID_ScopeDecisionJSON nvarchar(MAX)
    DECLARE cascade_update_MJSearchExecutionLogs_AIAgentID_cursor CURSOR FOR
        SELECT [ID], [SearchScopeID], [UserID], [AIAgentID], [Query], [TotalDurationMs], [ResultCount], [RerankerName], [RerankerCostCents], [Status], [FailureReason], [ProvidersJSON], [AISkillID], [PrimaryScopeRecordID], [ScopeDecisionJSON]
        FROM [${flyway:defaultSchema}].[SearchExecutionLog]
        WHERE [AIAgentID] = @ID

    OPEN cascade_update_MJSearchExecutionLogs_AIAgentID_cursor
    FETCH NEXT FROM cascade_update_MJSearchExecutionLogs_AIAgentID_cursor INTO @MJSearchExecutionLogs_AIAgentIDID, @MJSearchExecutionLogs_AIAgentID_SearchScopeID, @MJSearchExecutionLogs_AIAgentID_UserID, @MJSearchExecutionLogs_AIAgentID_AIAgentID, @MJSearchExecutionLogs_AIAgentID_Query, @MJSearchExecutionLogs_AIAgentID_TotalDurationMs, @MJSearchExecutionLogs_AIAgentID_ResultCount, @MJSearchExecutionLogs_AIAgentID_RerankerName, @MJSearchExecutionLogs_AIAgentID_RerankerCostCents, @MJSearchExecutionLogs_AIAgentID_Status, @MJSearchExecutionLogs_AIAgentID_FailureReason, @MJSearchExecutionLogs_AIAgentID_ProvidersJSON, @MJSearchExecutionLogs_AIAgentID_AISkillID, @MJSearchExecutionLogs_AIAgentID_PrimaryScopeRecordID, @MJSearchExecutionLogs_AIAgentID_ScopeDecisionJSON

    WHILE @@FETCH_STATUS = 0
    BEGIN
        -- Set the FK field to NULL
        SET @MJSearchExecutionLogs_AIAgentID_AIAgentID = NULL

        -- Call the update SP for the related entity
        EXEC [${flyway:defaultSchema}].[spUpdateSearchExecutionLog] @ID = @MJSearchExecutionLogs_AIAgentIDID, @SearchScopeID = @MJSearchExecutionLogs_AIAgentID_SearchScopeID, @UserID = @MJSearchExecutionLogs_AIAgentID_UserID, @AIAgentID_Clear = 1, @AIAgentID = @MJSearchExecutionLogs_AIAgentID_AIAgentID, @Query = @MJSearchExecutionLogs_AIAgentID_Query, @TotalDurationMs = @MJSearchExecutionLogs_AIAgentID_TotalDurationMs, @ResultCount = @MJSearchExecutionLogs_AIAgentID_ResultCount, @RerankerName = @MJSearchExecutionLogs_AIAgentID_RerankerName, @RerankerCostCents = @MJSearchExecutionLogs_AIAgentID_RerankerCostCents, @Status = @MJSearchExecutionLogs_AIAgentID_Status, @FailureReason = @MJSearchExecutionLogs_AIAgentID_FailureReason, @ProvidersJSON = @MJSearchExecutionLogs_AIAgentID_ProvidersJSON, @AISkillID = @MJSearchExecutionLogs_AIAgentID_AISkillID, @PrimaryScopeRecordID = @MJSearchExecutionLogs_AIAgentID_PrimaryScopeRecordID, @ScopeDecisionJSON = @MJSearchExecutionLogs_AIAgentID_ScopeDecisionJSON

        FETCH NEXT FROM cascade_update_MJSearchExecutionLogs_AIAgentID_cursor INTO @MJSearchExecutionLogs_AIAgentIDID, @MJSearchExecutionLogs_AIAgentID_SearchScopeID, @MJSearchExecutionLogs_AIAgentID_UserID, @MJSearchExecutionLogs_AIAgentID_AIAgentID, @MJSearchExecutionLogs_AIAgentID_Query, @MJSearchExecutionLogs_AIAgentID_TotalDurationMs, @MJSearchExecutionLogs_AIAgentID_ResultCount, @MJSearchExecutionLogs_AIAgentID_RerankerName, @MJSearchExecutionLogs_AIAgentID_RerankerCostCents, @MJSearchExecutionLogs_AIAgentID_Status, @MJSearchExecutionLogs_AIAgentID_FailureReason, @MJSearchExecutionLogs_AIAgentID_ProvidersJSON, @MJSearchExecutionLogs_AIAgentID_AISkillID, @MJSearchExecutionLogs_AIAgentID_PrimaryScopeRecordID, @MJSearchExecutionLogs_AIAgentID_ScopeDecisionJSON
    END

    CLOSE cascade_update_MJSearchExecutionLogs_AIAgentID_cursor
    DEALLOCATE cascade_update_MJSearchExecutionLogs_AIAgentID_cursor
    
    -- Cascade update on Task using cursor to call spUpdateTask
    DECLARE @MJTasks_AgentIDID uniqueidentifier
    DECLARE @MJTasks_AgentID_ParentID uniqueidentifier
    DECLARE @MJTasks_AgentID_Name nvarchar(255)
    DECLARE @MJTasks_AgentID_Description nvarchar(MAX)
    DECLARE @MJTasks_AgentID_TypeID uniqueidentifier
    DECLARE @MJTasks_AgentID_EnvironmentID uniqueidentifier
    DECLARE @MJTasks_AgentID_ProjectID uniqueidentifier
    DECLARE @MJTasks_AgentID_ConversationDetailID uniqueidentifier
    DECLARE @MJTasks_AgentID_UserID uniqueidentifier
    DECLARE @MJTasks_AgentID_AgentID uniqueidentifier
    DECLARE @MJTasks_AgentID_Status nvarchar(50)
    DECLARE @MJTasks_AgentID_PercentComplete int
    DECLARE @MJTasks_AgentID_DueAt datetimeoffset
    DECLARE @MJTasks_AgentID_StartedAt datetimeoffset
    DECLARE @MJTasks_AgentID_CompletedAt datetimeoffset
    DECLARE @MJTasks_AgentID_InputPayload nvarchar(MAX)
    DECLARE @MJTasks_AgentID_OutputPayload nvarchar(MAX)
    DECLARE @MJTasks_AgentID_ErrorMessage nvarchar(MAX)
    DECLARE @MJTasks_AgentID_AgentRunID uniqueidentifier
    DECLARE @MJTasks_AgentID_ClaimedBy nvarchar(100)
    DECLARE @MJTasks_AgentID_ClaimExpiresAt datetimeoffset
    DECLARE @MJTasks_AgentID_ActionID uniqueidentifier
    DECLARE @MJTasks_AgentID_StepType nvarchar(20)
    DECLARE @MJTasks_AgentID_PromptID uniqueidentifier
    DECLARE @MJTasks_AgentID_Configuration nvarchar(MAX)
    DECLARE cascade_update_MJTasks_AgentID_cursor CURSOR FOR
        SELECT [ID], [ParentID], [Name], [Description], [TypeID], [EnvironmentID], [ProjectID], [ConversationDetailID], [UserID], [AgentID], [Status], [PercentComplete], [DueAt], [StartedAt], [CompletedAt], [InputPayload], [OutputPayload], [ErrorMessage], [AgentRunID], [ClaimedBy], [ClaimExpiresAt], [ActionID], [StepType], [PromptID], [Configuration]
        FROM [${flyway:defaultSchema}].[Task]
        WHERE [AgentID] = @ID

    OPEN cascade_update_MJTasks_AgentID_cursor
    FETCH NEXT FROM cascade_update_MJTasks_AgentID_cursor INTO @MJTasks_AgentIDID, @MJTasks_AgentID_ParentID, @MJTasks_AgentID_Name, @MJTasks_AgentID_Description, @MJTasks_AgentID_TypeID, @MJTasks_AgentID_EnvironmentID, @MJTasks_AgentID_ProjectID, @MJTasks_AgentID_ConversationDetailID, @MJTasks_AgentID_UserID, @MJTasks_AgentID_AgentID, @MJTasks_AgentID_Status, @MJTasks_AgentID_PercentComplete, @MJTasks_AgentID_DueAt, @MJTasks_AgentID_StartedAt, @MJTasks_AgentID_CompletedAt, @MJTasks_AgentID_InputPayload, @MJTasks_AgentID_OutputPayload, @MJTasks_AgentID_ErrorMessage, @MJTasks_AgentID_AgentRunID, @MJTasks_AgentID_ClaimedBy, @MJTasks_AgentID_ClaimExpiresAt, @MJTasks_AgentID_ActionID, @MJTasks_AgentID_StepType, @MJTasks_AgentID_PromptID, @MJTasks_AgentID_Configuration

    WHILE @@FETCH_STATUS = 0
    BEGIN
        -- Set the FK field to NULL
        SET @MJTasks_AgentID_AgentID = NULL

        -- Call the update SP for the related entity
        EXEC [${flyway:defaultSchema}].[spUpdateTask] @ID = @MJTasks_AgentIDID, @ParentID = @MJTasks_AgentID_ParentID, @Name = @MJTasks_AgentID_Name, @Description = @MJTasks_AgentID_Description, @TypeID = @MJTasks_AgentID_TypeID, @EnvironmentID = @MJTasks_AgentID_EnvironmentID, @ProjectID = @MJTasks_AgentID_ProjectID, @ConversationDetailID = @MJTasks_AgentID_ConversationDetailID, @UserID = @MJTasks_AgentID_UserID, @AgentID_Clear = 1, @AgentID = @MJTasks_AgentID_AgentID, @Status = @MJTasks_AgentID_Status, @PercentComplete = @MJTasks_AgentID_PercentComplete, @DueAt = @MJTasks_AgentID_DueAt, @StartedAt = @MJTasks_AgentID_StartedAt, @CompletedAt = @MJTasks_AgentID_CompletedAt, @InputPayload = @MJTasks_AgentID_InputPayload, @OutputPayload = @MJTasks_AgentID_OutputPayload, @ErrorMessage = @MJTasks_AgentID_ErrorMessage, @AgentRunID = @MJTasks_AgentID_AgentRunID, @ClaimedBy = @MJTasks_AgentID_ClaimedBy, @ClaimExpiresAt = @MJTasks_AgentID_ClaimExpiresAt, @ActionID = @MJTasks_AgentID_ActionID, @StepType = @MJTasks_AgentID_StepType, @PromptID = @MJTasks_AgentID_PromptID, @Configuration = @MJTasks_AgentID_Configuration

        FETCH NEXT FROM cascade_update_MJTasks_AgentID_cursor INTO @MJTasks_AgentIDID, @MJTasks_AgentID_ParentID, @MJTasks_AgentID_Name, @MJTasks_AgentID_Description, @MJTasks_AgentID_TypeID, @MJTasks_AgentID_EnvironmentID, @MJTasks_AgentID_ProjectID, @MJTasks_AgentID_ConversationDetailID, @MJTasks_AgentID_UserID, @MJTasks_AgentID_AgentID, @MJTasks_AgentID_Status, @MJTasks_AgentID_PercentComplete, @MJTasks_AgentID_DueAt, @MJTasks_AgentID_StartedAt, @MJTasks_AgentID_CompletedAt, @MJTasks_AgentID_InputPayload, @MJTasks_AgentID_OutputPayload, @MJTasks_AgentID_ErrorMessage, @MJTasks_AgentID_AgentRunID, @MJTasks_AgentID_ClaimedBy, @MJTasks_AgentID_ClaimExpiresAt, @MJTasks_AgentID_ActionID, @MJTasks_AgentID_StepType, @MJTasks_AgentID_PromptID, @MJTasks_AgentID_Configuration
    END

    CLOSE cascade_update_MJTasks_AgentID_cursor
    DEALLOCATE cascade_update_MJTasks_AgentID_cursor
    

    DELETE FROM
        [${flyway:defaultSchema}].[AIAgent]
    WHERE
        [ID] = @ID


    -- Check if the delete was successful
    IF @@ROWCOUNT = 0
        SELECT NULL AS [ID] -- Return NULL for all primary key fields to indicate no record was deleted
    ELSE
        SELECT @ID AS [ID] -- Return the primary key values to indicate we successfully deleted the record
END
GO
GRANT EXECUTE ON [${flyway:defaultSchema}].[spDeleteAIAgent] TO [cdp_Developer], [cdp_Integration];

/* spDelete Permissions for MJ: AI Agents */

GRANT EXECUTE ON [${flyway:defaultSchema}].[spDeleteAIAgent] TO [cdp_Developer], [cdp_Integration];

/* spDelete SQL for MJ: AI Prompts */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: AI Prompts
-- Item: spDeleteAIPrompt
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- DELETE PROCEDURE FOR AIPrompt
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[spDeleteAIPrompt]', 'P') IS NOT NULL
    DROP PROCEDURE [${flyway:defaultSchema}].[spDeleteAIPrompt];
GO

CREATE PROCEDURE [${flyway:defaultSchema}].[spDeleteAIPrompt]
    @ID uniqueidentifier
AS
BEGIN
    SET NOCOUNT ON;
    -- Cascade update on Action using cursor to call spUpdateAction
    DECLARE @MJActions_DefaultCompactPromptIDID uniqueidentifier
    DECLARE @MJActions_DefaultCompactPromptID_CategoryID uniqueidentifier
    DECLARE @MJActions_DefaultCompactPromptID_Name nvarchar(425)
    DECLARE @MJActions_DefaultCompactPromptID_Description nvarchar(MAX)
    DECLARE @MJActions_DefaultCompactPromptID_Type nvarchar(20)
    DECLARE @MJActions_DefaultCompactPromptID_UserPrompt nvarchar(MAX)
    DECLARE @MJActions_DefaultCompactPromptID_UserComments nvarchar(MAX)
    DECLARE @MJActions_DefaultCompactPromptID_Code nvarchar(MAX)
    DECLARE @MJActions_DefaultCompactPromptID_CodeComments nvarchar(MAX)
    DECLARE @MJActions_DefaultCompactPromptID_CodeApprovalStatus nvarchar(20)
    DECLARE @MJActions_DefaultCompactPromptID_CodeApprovalComments nvarchar(MAX)
    DECLARE @MJActions_DefaultCompactPromptID_CodeApprovedByUserID uniqueidentifier
    DECLARE @MJActions_DefaultCompactPromptID_CodeApprovedAt datetimeoffset
    DECLARE @MJActions_DefaultCompactPromptID_CodeLocked bit
    DECLARE @MJActions_DefaultCompactPromptID_ForceCodeGeneration bit
    DECLARE @MJActions_DefaultCompactPromptID_RetentionPeriod int
    DECLARE @MJActions_DefaultCompactPromptID_Status nvarchar(20)
    DECLARE @MJActions_DefaultCompactPromptID_DriverClass nvarchar(255)
    DECLARE @MJActions_DefaultCompactPromptID_ParentID uniqueidentifier
    DECLARE @MJActions_DefaultCompactPromptID_IconClass nvarchar(100)
    DECLARE @MJActions_DefaultCompactPromptID_DefaultCompactPromptID uniqueidentifier
    DECLARE @MJActions_DefaultCompactPromptID_Config nvarchar(MAX)
    DECLARE @MJActions_DefaultCompactPromptID_RuntimeActionConfiguration nvarchar(MAX)
    DECLARE @MJActions_DefaultCompactPromptID_MaxExecutionTimeMS int
    DECLARE @MJActions_DefaultCompactPromptID_CreatedByAgentID uniqueidentifier
    DECLARE cascade_update_MJActions_DefaultCompactPromptID_cursor CURSOR FOR
        SELECT [ID], [CategoryID], [Name], [Description], [Type], [UserPrompt], [UserComments], [Code], [CodeComments], [CodeApprovalStatus], [CodeApprovalComments], [CodeApprovedByUserID], [CodeApprovedAt], [CodeLocked], [ForceCodeGeneration], [RetentionPeriod], [Status], [DriverClass], [ParentID], [IconClass], [DefaultCompactPromptID], [Config], [RuntimeActionConfiguration], [MaxExecutionTimeMS], [CreatedByAgentID]
        FROM [${flyway:defaultSchema}].[Action]
        WHERE [DefaultCompactPromptID] = @ID

    OPEN cascade_update_MJActions_DefaultCompactPromptID_cursor
    FETCH NEXT FROM cascade_update_MJActions_DefaultCompactPromptID_cursor INTO @MJActions_DefaultCompactPromptIDID, @MJActions_DefaultCompactPromptID_CategoryID, @MJActions_DefaultCompactPromptID_Name, @MJActions_DefaultCompactPromptID_Description, @MJActions_DefaultCompactPromptID_Type, @MJActions_DefaultCompactPromptID_UserPrompt, @MJActions_DefaultCompactPromptID_UserComments, @MJActions_DefaultCompactPromptID_Code, @MJActions_DefaultCompactPromptID_CodeComments, @MJActions_DefaultCompactPromptID_CodeApprovalStatus, @MJActions_DefaultCompactPromptID_CodeApprovalComments, @MJActions_DefaultCompactPromptID_CodeApprovedByUserID, @MJActions_DefaultCompactPromptID_CodeApprovedAt, @MJActions_DefaultCompactPromptID_CodeLocked, @MJActions_DefaultCompactPromptID_ForceCodeGeneration, @MJActions_DefaultCompactPromptID_RetentionPeriod, @MJActions_DefaultCompactPromptID_Status, @MJActions_DefaultCompactPromptID_DriverClass, @MJActions_DefaultCompactPromptID_ParentID, @MJActions_DefaultCompactPromptID_IconClass, @MJActions_DefaultCompactPromptID_DefaultCompactPromptID, @MJActions_DefaultCompactPromptID_Config, @MJActions_DefaultCompactPromptID_RuntimeActionConfiguration, @MJActions_DefaultCompactPromptID_MaxExecutionTimeMS, @MJActions_DefaultCompactPromptID_CreatedByAgentID

    WHILE @@FETCH_STATUS = 0
    BEGIN
        -- Set the FK field to NULL
        SET @MJActions_DefaultCompactPromptID_DefaultCompactPromptID = NULL

        -- Call the update SP for the related entity
        EXEC [${flyway:defaultSchema}].[spUpdateAction] @ID = @MJActions_DefaultCompactPromptIDID, @CategoryID = @MJActions_DefaultCompactPromptID_CategoryID, @Name = @MJActions_DefaultCompactPromptID_Name, @Description = @MJActions_DefaultCompactPromptID_Description, @Type = @MJActions_DefaultCompactPromptID_Type, @UserPrompt = @MJActions_DefaultCompactPromptID_UserPrompt, @UserComments = @MJActions_DefaultCompactPromptID_UserComments, @Code = @MJActions_DefaultCompactPromptID_Code, @CodeComments = @MJActions_DefaultCompactPromptID_CodeComments, @CodeApprovalStatus = @MJActions_DefaultCompactPromptID_CodeApprovalStatus, @CodeApprovalComments = @MJActions_DefaultCompactPromptID_CodeApprovalComments, @CodeApprovedByUserID = @MJActions_DefaultCompactPromptID_CodeApprovedByUserID, @CodeApprovedAt = @MJActions_DefaultCompactPromptID_CodeApprovedAt, @CodeLocked = @MJActions_DefaultCompactPromptID_CodeLocked, @ForceCodeGeneration = @MJActions_DefaultCompactPromptID_ForceCodeGeneration, @RetentionPeriod = @MJActions_DefaultCompactPromptID_RetentionPeriod, @Status = @MJActions_DefaultCompactPromptID_Status, @DriverClass = @MJActions_DefaultCompactPromptID_DriverClass, @ParentID = @MJActions_DefaultCompactPromptID_ParentID, @IconClass = @MJActions_DefaultCompactPromptID_IconClass, @DefaultCompactPromptID_Clear = 1, @DefaultCompactPromptID = @MJActions_DefaultCompactPromptID_DefaultCompactPromptID, @Config = @MJActions_DefaultCompactPromptID_Config, @RuntimeActionConfiguration = @MJActions_DefaultCompactPromptID_RuntimeActionConfiguration, @MaxExecutionTimeMS = @MJActions_DefaultCompactPromptID_MaxExecutionTimeMS, @CreatedByAgentID = @MJActions_DefaultCompactPromptID_CreatedByAgentID

        FETCH NEXT FROM cascade_update_MJActions_DefaultCompactPromptID_cursor INTO @MJActions_DefaultCompactPromptIDID, @MJActions_DefaultCompactPromptID_CategoryID, @MJActions_DefaultCompactPromptID_Name, @MJActions_DefaultCompactPromptID_Description, @MJActions_DefaultCompactPromptID_Type, @MJActions_DefaultCompactPromptID_UserPrompt, @MJActions_DefaultCompactPromptID_UserComments, @MJActions_DefaultCompactPromptID_Code, @MJActions_DefaultCompactPromptID_CodeComments, @MJActions_DefaultCompactPromptID_CodeApprovalStatus, @MJActions_DefaultCompactPromptID_CodeApprovalComments, @MJActions_DefaultCompactPromptID_CodeApprovedByUserID, @MJActions_DefaultCompactPromptID_CodeApprovedAt, @MJActions_DefaultCompactPromptID_CodeLocked, @MJActions_DefaultCompactPromptID_ForceCodeGeneration, @MJActions_DefaultCompactPromptID_RetentionPeriod, @MJActions_DefaultCompactPromptID_Status, @MJActions_DefaultCompactPromptID_DriverClass, @MJActions_DefaultCompactPromptID_ParentID, @MJActions_DefaultCompactPromptID_IconClass, @MJActions_DefaultCompactPromptID_DefaultCompactPromptID, @MJActions_DefaultCompactPromptID_Config, @MJActions_DefaultCompactPromptID_RuntimeActionConfiguration, @MJActions_DefaultCompactPromptID_MaxExecutionTimeMS, @MJActions_DefaultCompactPromptID_CreatedByAgentID
    END

    CLOSE cascade_update_MJActions_DefaultCompactPromptID_cursor
    DEALLOCATE cascade_update_MJActions_DefaultCompactPromptID_cursor
    
    -- Cascade update on AIAgentAction using cursor to call spUpdateAIAgentAction
    DECLARE @MJAIAgentActions_CompactPromptIDID uniqueidentifier
    DECLARE @MJAIAgentActions_CompactPromptID_AgentID uniqueidentifier
    DECLARE @MJAIAgentActions_CompactPromptID_ActionID uniqueidentifier
    DECLARE @MJAIAgentActions_CompactPromptID_Status nvarchar(15)
    DECLARE @MJAIAgentActions_CompactPromptID_MinExecutionsPerRun int
    DECLARE @MJAIAgentActions_CompactPromptID_MaxExecutionsPerRun int
    DECLARE @MJAIAgentActions_CompactPromptID_ResultExpirationTurns int
    DECLARE @MJAIAgentActions_CompactPromptID_ResultExpirationMode nvarchar(20)
    DECLARE @MJAIAgentActions_CompactPromptID_CompactMode nvarchar(20)
    DECLARE @MJAIAgentActions_CompactPromptID_CompactLength int
    DECLARE @MJAIAgentActions_CompactPromptID_CompactPromptID uniqueidentifier
    DECLARE cascade_update_MJAIAgentActions_CompactPromptID_cursor CURSOR FOR
        SELECT [ID], [AgentID], [ActionID], [Status], [MinExecutionsPerRun], [MaxExecutionsPerRun], [ResultExpirationTurns], [ResultExpirationMode], [CompactMode], [CompactLength], [CompactPromptID]
        FROM [${flyway:defaultSchema}].[AIAgentAction]
        WHERE [CompactPromptID] = @ID

    OPEN cascade_update_MJAIAgentActions_CompactPromptID_cursor
    FETCH NEXT FROM cascade_update_MJAIAgentActions_CompactPromptID_cursor INTO @MJAIAgentActions_CompactPromptIDID, @MJAIAgentActions_CompactPromptID_AgentID, @MJAIAgentActions_CompactPromptID_ActionID, @MJAIAgentActions_CompactPromptID_Status, @MJAIAgentActions_CompactPromptID_MinExecutionsPerRun, @MJAIAgentActions_CompactPromptID_MaxExecutionsPerRun, @MJAIAgentActions_CompactPromptID_ResultExpirationTurns, @MJAIAgentActions_CompactPromptID_ResultExpirationMode, @MJAIAgentActions_CompactPromptID_CompactMode, @MJAIAgentActions_CompactPromptID_CompactLength, @MJAIAgentActions_CompactPromptID_CompactPromptID

    WHILE @@FETCH_STATUS = 0
    BEGIN
        -- Set the FK field to NULL
        SET @MJAIAgentActions_CompactPromptID_CompactPromptID = NULL

        -- Call the update SP for the related entity
        EXEC [${flyway:defaultSchema}].[spUpdateAIAgentAction] @ID = @MJAIAgentActions_CompactPromptIDID, @AgentID = @MJAIAgentActions_CompactPromptID_AgentID, @ActionID = @MJAIAgentActions_CompactPromptID_ActionID, @Status = @MJAIAgentActions_CompactPromptID_Status, @MinExecutionsPerRun = @MJAIAgentActions_CompactPromptID_MinExecutionsPerRun, @MaxExecutionsPerRun = @MJAIAgentActions_CompactPromptID_MaxExecutionsPerRun, @ResultExpirationTurns = @MJAIAgentActions_CompactPromptID_ResultExpirationTurns, @ResultExpirationMode = @MJAIAgentActions_CompactPromptID_ResultExpirationMode, @CompactMode = @MJAIAgentActions_CompactPromptID_CompactMode, @CompactLength = @MJAIAgentActions_CompactPromptID_CompactLength, @CompactPromptID_Clear = 1, @CompactPromptID = @MJAIAgentActions_CompactPromptID_CompactPromptID

        FETCH NEXT FROM cascade_update_MJAIAgentActions_CompactPromptID_cursor INTO @MJAIAgentActions_CompactPromptIDID, @MJAIAgentActions_CompactPromptID_AgentID, @MJAIAgentActions_CompactPromptID_ActionID, @MJAIAgentActions_CompactPromptID_Status, @MJAIAgentActions_CompactPromptID_MinExecutionsPerRun, @MJAIAgentActions_CompactPromptID_MaxExecutionsPerRun, @MJAIAgentActions_CompactPromptID_ResultExpirationTurns, @MJAIAgentActions_CompactPromptID_ResultExpirationMode, @MJAIAgentActions_CompactPromptID_CompactMode, @MJAIAgentActions_CompactPromptID_CompactLength, @MJAIAgentActions_CompactPromptID_CompactPromptID
    END

    CLOSE cascade_update_MJAIAgentActions_CompactPromptID_cursor
    DEALLOCATE cascade_update_MJAIAgentActions_CompactPromptID_cursor
    
    -- Cascade delete from AIAgentPrompt using cursor to call spDeleteAIAgentPrompt
    DECLARE @MJAIAgentPrompts_PromptIDID uniqueidentifier
    DECLARE cascade_delete_MJAIAgentPrompts_PromptID_cursor CURSOR FOR 
        SELECT [ID]
        FROM [${flyway:defaultSchema}].[AIAgentPrompt]
        WHERE [PromptID] = @ID
    
    OPEN cascade_delete_MJAIAgentPrompts_PromptID_cursor
    FETCH NEXT FROM cascade_delete_MJAIAgentPrompts_PromptID_cursor INTO @MJAIAgentPrompts_PromptIDID
    
    WHILE @@FETCH_STATUS = 0
    BEGIN
        EXEC [${flyway:defaultSchema}].[spDeleteAIAgentPrompt] @ID = @MJAIAgentPrompts_PromptIDID
        
        FETCH NEXT FROM cascade_delete_MJAIAgentPrompts_PromptID_cursor INTO @MJAIAgentPrompts_PromptIDID
    END
    
    CLOSE cascade_delete_MJAIAgentPrompts_PromptID_cursor
    DEALLOCATE cascade_delete_MJAIAgentPrompts_PromptID_cursor
    
    -- Cascade update on AIAgentStep using cursor to call spUpdateAIAgentStep
    DECLARE @MJAIAgentSteps_PromptIDID uniqueidentifier
    DECLARE @MJAIAgentSteps_PromptID_AgentID uniqueidentifier
    DECLARE @MJAIAgentSteps_PromptID_Name nvarchar(255)
    DECLARE @MJAIAgentSteps_PromptID_Description nvarchar(MAX)
    DECLARE @MJAIAgentSteps_PromptID_StepType nvarchar(20)
    DECLARE @MJAIAgentSteps_PromptID_StartingStep bit
    DECLARE @MJAIAgentSteps_PromptID_TimeoutSeconds int
    DECLARE @MJAIAgentSteps_PromptID_RetryCount int
    DECLARE @MJAIAgentSteps_PromptID_OnErrorBehavior nvarchar(20)
    DECLARE @MJAIAgentSteps_PromptID_ActionID uniqueidentifier
    DECLARE @MJAIAgentSteps_PromptID_SubAgentID uniqueidentifier
    DECLARE @MJAIAgentSteps_PromptID_PromptID uniqueidentifier
    DECLARE @MJAIAgentSteps_PromptID_ActionOutputMapping nvarchar(MAX)
    DECLARE @MJAIAgentSteps_PromptID_PositionX int
    DECLARE @MJAIAgentSteps_PromptID_PositionY int
    DECLARE @MJAIAgentSteps_PromptID_Width int
    DECLARE @MJAIAgentSteps_PromptID_Height int
    DECLARE @MJAIAgentSteps_PromptID_Status nvarchar(20)
    DECLARE @MJAIAgentSteps_PromptID_ActionInputMapping nvarchar(MAX)
    DECLARE @MJAIAgentSteps_PromptID_LoopBodyType nvarchar(50)
    DECLARE @MJAIAgentSteps_PromptID_Configuration nvarchar(MAX)
    DECLARE cascade_update_MJAIAgentSteps_PromptID_cursor CURSOR FOR
        SELECT [ID], [AgentID], [Name], [Description], [StepType], [StartingStep], [TimeoutSeconds], [RetryCount], [OnErrorBehavior], [ActionID], [SubAgentID], [PromptID], [ActionOutputMapping], [PositionX], [PositionY], [Width], [Height], [Status], [ActionInputMapping], [LoopBodyType], [Configuration]
        FROM [${flyway:defaultSchema}].[AIAgentStep]
        WHERE [PromptID] = @ID

    OPEN cascade_update_MJAIAgentSteps_PromptID_cursor
    FETCH NEXT FROM cascade_update_MJAIAgentSteps_PromptID_cursor INTO @MJAIAgentSteps_PromptIDID, @MJAIAgentSteps_PromptID_AgentID, @MJAIAgentSteps_PromptID_Name, @MJAIAgentSteps_PromptID_Description, @MJAIAgentSteps_PromptID_StepType, @MJAIAgentSteps_PromptID_StartingStep, @MJAIAgentSteps_PromptID_TimeoutSeconds, @MJAIAgentSteps_PromptID_RetryCount, @MJAIAgentSteps_PromptID_OnErrorBehavior, @MJAIAgentSteps_PromptID_ActionID, @MJAIAgentSteps_PromptID_SubAgentID, @MJAIAgentSteps_PromptID_PromptID, @MJAIAgentSteps_PromptID_ActionOutputMapping, @MJAIAgentSteps_PromptID_PositionX, @MJAIAgentSteps_PromptID_PositionY, @MJAIAgentSteps_PromptID_Width, @MJAIAgentSteps_PromptID_Height, @MJAIAgentSteps_PromptID_Status, @MJAIAgentSteps_PromptID_ActionInputMapping, @MJAIAgentSteps_PromptID_LoopBodyType, @MJAIAgentSteps_PromptID_Configuration

    WHILE @@FETCH_STATUS = 0
    BEGIN
        -- Set the FK field to NULL
        SET @MJAIAgentSteps_PromptID_PromptID = NULL

        -- Call the update SP for the related entity
        EXEC [${flyway:defaultSchema}].[spUpdateAIAgentStep] @ID = @MJAIAgentSteps_PromptIDID, @AgentID = @MJAIAgentSteps_PromptID_AgentID, @Name = @MJAIAgentSteps_PromptID_Name, @Description = @MJAIAgentSteps_PromptID_Description, @StepType = @MJAIAgentSteps_PromptID_StepType, @StartingStep = @MJAIAgentSteps_PromptID_StartingStep, @TimeoutSeconds = @MJAIAgentSteps_PromptID_TimeoutSeconds, @RetryCount = @MJAIAgentSteps_PromptID_RetryCount, @OnErrorBehavior = @MJAIAgentSteps_PromptID_OnErrorBehavior, @ActionID = @MJAIAgentSteps_PromptID_ActionID, @SubAgentID = @MJAIAgentSteps_PromptID_SubAgentID, @PromptID_Clear = 1, @PromptID = @MJAIAgentSteps_PromptID_PromptID, @ActionOutputMapping = @MJAIAgentSteps_PromptID_ActionOutputMapping, @PositionX = @MJAIAgentSteps_PromptID_PositionX, @PositionY = @MJAIAgentSteps_PromptID_PositionY, @Width = @MJAIAgentSteps_PromptID_Width, @Height = @MJAIAgentSteps_PromptID_Height, @Status = @MJAIAgentSteps_PromptID_Status, @ActionInputMapping = @MJAIAgentSteps_PromptID_ActionInputMapping, @LoopBodyType = @MJAIAgentSteps_PromptID_LoopBodyType, @Configuration = @MJAIAgentSteps_PromptID_Configuration

        FETCH NEXT FROM cascade_update_MJAIAgentSteps_PromptID_cursor INTO @MJAIAgentSteps_PromptIDID, @MJAIAgentSteps_PromptID_AgentID, @MJAIAgentSteps_PromptID_Name, @MJAIAgentSteps_PromptID_Description, @MJAIAgentSteps_PromptID_StepType, @MJAIAgentSteps_PromptID_StartingStep, @MJAIAgentSteps_PromptID_TimeoutSeconds, @MJAIAgentSteps_PromptID_RetryCount, @MJAIAgentSteps_PromptID_OnErrorBehavior, @MJAIAgentSteps_PromptID_ActionID, @MJAIAgentSteps_PromptID_SubAgentID, @MJAIAgentSteps_PromptID_PromptID, @MJAIAgentSteps_PromptID_ActionOutputMapping, @MJAIAgentSteps_PromptID_PositionX, @MJAIAgentSteps_PromptID_PositionY, @MJAIAgentSteps_PromptID_Width, @MJAIAgentSteps_PromptID_Height, @MJAIAgentSteps_PromptID_Status, @MJAIAgentSteps_PromptID_ActionInputMapping, @MJAIAgentSteps_PromptID_LoopBodyType, @MJAIAgentSteps_PromptID_Configuration
    END

    CLOSE cascade_update_MJAIAgentSteps_PromptID_cursor
    DEALLOCATE cascade_update_MJAIAgentSteps_PromptID_cursor
    
    -- Cascade update on AIAgentType using cursor to call spUpdateAIAgentType
    DECLARE @MJAIAgentTypes_SystemPromptIDID uniqueidentifier
    DECLARE @MJAIAgentTypes_SystemPromptID_Name nvarchar(100)
    DECLARE @MJAIAgentTypes_SystemPromptID_Description nvarchar(MAX)
    DECLARE @MJAIAgentTypes_SystemPromptID_SystemPromptID uniqueidentifier
    DECLARE @MJAIAgentTypes_SystemPromptID_IsActive bit
    DECLARE @MJAIAgentTypes_SystemPromptID_AgentPromptPlaceholder nvarchar(255)
    DECLARE @MJAIAgentTypes_SystemPromptID_DriverClass nvarchar(255)
    DECLARE @MJAIAgentTypes_SystemPromptID_UIFormSectionKey nvarchar(500)
    DECLARE @MJAIAgentTypes_SystemPromptID_UIFormKey nvarchar(500)
    DECLARE @MJAIAgentTypes_SystemPromptID_UIFormSectionExpandedByDefault bit
    DECLARE @MJAIAgentTypes_SystemPromptID_PromptParamsSchema nvarchar(MAX)
    DECLARE @MJAIAgentTypes_SystemPromptID_AssignmentStrategy nvarchar(MAX)
    DECLARE @MJAIAgentTypes_SystemPromptID_DefaultStorageAccountID uniqueidentifier
    DECLARE @MJAIAgentTypes_SystemPromptID_ConfigSchema nvarchar(MAX)
    DECLARE @MJAIAgentTypes_SystemPromptID_DefaultConfiguration nvarchar(MAX)
    DECLARE @MJAIAgentTypes_SystemPromptID_ContextCompressionMessageThreshold int
    DECLARE @MJAIAgentTypes_SystemPromptID_ContextCompressionPromptID uniqueidentifier
    DECLARE @MJAIAgentTypes_SystemPromptID_ContextCompressionMessageRetentionCount int
    DECLARE @MJAIAgentTypes_SystemPromptID_ContextWindowMaxTokens int
    DECLARE @MJAIAgentTypes_SystemPromptID_CompactionTriggerPercent int
    DECLARE @MJAIAgentTypes_SystemPromptID_CompactionTargetPercent int
    DECLARE @MJAIAgentTypes_SystemPromptID_ConversationSummaryPromptID uniqueidentifier
    DECLARE cascade_update_MJAIAgentTypes_SystemPromptID_cursor CURSOR FOR
        SELECT [ID], [Name], [Description], [SystemPromptID], [IsActive], [AgentPromptPlaceholder], [DriverClass], [UIFormSectionKey], [UIFormKey], [UIFormSectionExpandedByDefault], [PromptParamsSchema], [AssignmentStrategy], [DefaultStorageAccountID], [ConfigSchema], [DefaultConfiguration], [ContextCompressionMessageThreshold], [ContextCompressionPromptID], [ContextCompressionMessageRetentionCount], [ContextWindowMaxTokens], [CompactionTriggerPercent], [CompactionTargetPercent], [ConversationSummaryPromptID]
        FROM [${flyway:defaultSchema}].[AIAgentType]
        WHERE [SystemPromptID] = @ID

    OPEN cascade_update_MJAIAgentTypes_SystemPromptID_cursor
    FETCH NEXT FROM cascade_update_MJAIAgentTypes_SystemPromptID_cursor INTO @MJAIAgentTypes_SystemPromptIDID, @MJAIAgentTypes_SystemPromptID_Name, @MJAIAgentTypes_SystemPromptID_Description, @MJAIAgentTypes_SystemPromptID_SystemPromptID, @MJAIAgentTypes_SystemPromptID_IsActive, @MJAIAgentTypes_SystemPromptID_AgentPromptPlaceholder, @MJAIAgentTypes_SystemPromptID_DriverClass, @MJAIAgentTypes_SystemPromptID_UIFormSectionKey, @MJAIAgentTypes_SystemPromptID_UIFormKey, @MJAIAgentTypes_SystemPromptID_UIFormSectionExpandedByDefault, @MJAIAgentTypes_SystemPromptID_PromptParamsSchema, @MJAIAgentTypes_SystemPromptID_AssignmentStrategy, @MJAIAgentTypes_SystemPromptID_DefaultStorageAccountID, @MJAIAgentTypes_SystemPromptID_ConfigSchema, @MJAIAgentTypes_SystemPromptID_DefaultConfiguration, @MJAIAgentTypes_SystemPromptID_ContextCompressionMessageThreshold, @MJAIAgentTypes_SystemPromptID_ContextCompressionPromptID, @MJAIAgentTypes_SystemPromptID_ContextCompressionMessageRetentionCount, @MJAIAgentTypes_SystemPromptID_ContextWindowMaxTokens, @MJAIAgentTypes_SystemPromptID_CompactionTriggerPercent, @MJAIAgentTypes_SystemPromptID_CompactionTargetPercent, @MJAIAgentTypes_SystemPromptID_ConversationSummaryPromptID

    WHILE @@FETCH_STATUS = 0
    BEGIN
        -- Set the FK field to NULL
        SET @MJAIAgentTypes_SystemPromptID_SystemPromptID = NULL

        -- Call the update SP for the related entity
        EXEC [${flyway:defaultSchema}].[spUpdateAIAgentType] @ID = @MJAIAgentTypes_SystemPromptIDID, @Name = @MJAIAgentTypes_SystemPromptID_Name, @Description = @MJAIAgentTypes_SystemPromptID_Description, @SystemPromptID_Clear = 1, @SystemPromptID = @MJAIAgentTypes_SystemPromptID_SystemPromptID, @IsActive = @MJAIAgentTypes_SystemPromptID_IsActive, @AgentPromptPlaceholder = @MJAIAgentTypes_SystemPromptID_AgentPromptPlaceholder, @DriverClass = @MJAIAgentTypes_SystemPromptID_DriverClass, @UIFormSectionKey = @MJAIAgentTypes_SystemPromptID_UIFormSectionKey, @UIFormKey = @MJAIAgentTypes_SystemPromptID_UIFormKey, @UIFormSectionExpandedByDefault = @MJAIAgentTypes_SystemPromptID_UIFormSectionExpandedByDefault, @PromptParamsSchema = @MJAIAgentTypes_SystemPromptID_PromptParamsSchema, @AssignmentStrategy = @MJAIAgentTypes_SystemPromptID_AssignmentStrategy, @DefaultStorageAccountID = @MJAIAgentTypes_SystemPromptID_DefaultStorageAccountID, @ConfigSchema = @MJAIAgentTypes_SystemPromptID_ConfigSchema, @DefaultConfiguration = @MJAIAgentTypes_SystemPromptID_DefaultConfiguration, @ContextCompressionMessageThreshold = @MJAIAgentTypes_SystemPromptID_ContextCompressionMessageThreshold, @ContextCompressionPromptID = @MJAIAgentTypes_SystemPromptID_ContextCompressionPromptID, @ContextCompressionMessageRetentionCount = @MJAIAgentTypes_SystemPromptID_ContextCompressionMessageRetentionCount, @ContextWindowMaxTokens = @MJAIAgentTypes_SystemPromptID_ContextWindowMaxTokens, @CompactionTriggerPercent = @MJAIAgentTypes_SystemPromptID_CompactionTriggerPercent, @CompactionTargetPercent = @MJAIAgentTypes_SystemPromptID_CompactionTargetPercent, @ConversationSummaryPromptID = @MJAIAgentTypes_SystemPromptID_ConversationSummaryPromptID

        FETCH NEXT FROM cascade_update_MJAIAgentTypes_SystemPromptID_cursor INTO @MJAIAgentTypes_SystemPromptIDID, @MJAIAgentTypes_SystemPromptID_Name, @MJAIAgentTypes_SystemPromptID_Description, @MJAIAgentTypes_SystemPromptID_SystemPromptID, @MJAIAgentTypes_SystemPromptID_IsActive, @MJAIAgentTypes_SystemPromptID_AgentPromptPlaceholder, @MJAIAgentTypes_SystemPromptID_DriverClass, @MJAIAgentTypes_SystemPromptID_UIFormSectionKey, @MJAIAgentTypes_SystemPromptID_UIFormKey, @MJAIAgentTypes_SystemPromptID_UIFormSectionExpandedByDefault, @MJAIAgentTypes_SystemPromptID_PromptParamsSchema, @MJAIAgentTypes_SystemPromptID_AssignmentStrategy, @MJAIAgentTypes_SystemPromptID_DefaultStorageAccountID, @MJAIAgentTypes_SystemPromptID_ConfigSchema, @MJAIAgentTypes_SystemPromptID_DefaultConfiguration, @MJAIAgentTypes_SystemPromptID_ContextCompressionMessageThreshold, @MJAIAgentTypes_SystemPromptID_ContextCompressionPromptID, @MJAIAgentTypes_SystemPromptID_ContextCompressionMessageRetentionCount, @MJAIAgentTypes_SystemPromptID_ContextWindowMaxTokens, @MJAIAgentTypes_SystemPromptID_CompactionTriggerPercent, @MJAIAgentTypes_SystemPromptID_CompactionTargetPercent, @MJAIAgentTypes_SystemPromptID_ConversationSummaryPromptID
    END

    CLOSE cascade_update_MJAIAgentTypes_SystemPromptID_cursor
    DEALLOCATE cascade_update_MJAIAgentTypes_SystemPromptID_cursor
    
    -- Cascade update on AIAgentType using cursor to call spUpdateAIAgentType
    DECLARE @MJAIAgentTypes_ContextCompressionPromptIDID uniqueidentifier
    DECLARE @MJAIAgentTypes_ContextCompressionPromptID_Name nvarchar(100)
    DECLARE @MJAIAgentTypes_ContextCompressionPromptID_Description nvarchar(MAX)
    DECLARE @MJAIAgentTypes_ContextCompressionPromptID_SystemPromptID uniqueidentifier
    DECLARE @MJAIAgentTypes_ContextCompressionPromptID_IsActive bit
    DECLARE @MJAIAgentTypes_ContextCompressionPromptID_AgentPromptPlaceholder nvarchar(255)
    DECLARE @MJAIAgentTypes_ContextCompressionPromptID_DriverClass nvarchar(255)
    DECLARE @MJAIAgentTypes_ContextCompressionPromptID_UIFormSectionKey nvarchar(500)
    DECLARE @MJAIAgentTypes_ContextCompressionPromptID_UIFormKey nvarchar(500)
    DECLARE @MJAIAgentTypes_ContextCompressionPromptID_UIFormSectionExpandedByDefault bit
    DECLARE @MJAIAgentTypes_ContextCompressionPromptID_PromptParamsSchema nvarchar(MAX)
    DECLARE @MJAIAgentTypes_ContextCompressionPromptID_AssignmentStrategy nvarchar(MAX)
    DECLARE @MJAIAgentTypes_ContextCompressionPromptID_DefaultStorageAccountID uniqueidentifier
    DECLARE @MJAIAgentTypes_ContextCompressionPromptID_ConfigSchema nvarchar(MAX)
    DECLARE @MJAIAgentTypes_ContextCompressionPromptID_DefaultConfiguration nvarchar(MAX)
    DECLARE @MJAIAgentTypes_ContextCompressionPromptID_ContextCompressionMessageThreshold int
    DECLARE @MJAIAgentTypes_ContextCompressionPromptID_ContextCompressionPromptID uniqueidentifier
    DECLARE @MJAIAgentTypes_ContextCompressionPromptID_ContextCompressionMessageRetentionCount int
    DECLARE @MJAIAgentTypes_ContextCompressionPromptID_ContextWindowMaxTokens int
    DECLARE @MJAIAgentTypes_ContextCompressionPromptID_CompactionTriggerPercent int
    DECLARE @MJAIAgentTypes_ContextCompressionPromptID_CompactionTargetPercent int
    DECLARE @MJAIAgentTypes_ContextCompressionPromptID_ConversationSummaryPromptID uniqueidentifier
    DECLARE cascade_update_MJAIAgentTypes_ContextCompressionPromptID_cursor CURSOR FOR
        SELECT [ID], [Name], [Description], [SystemPromptID], [IsActive], [AgentPromptPlaceholder], [DriverClass], [UIFormSectionKey], [UIFormKey], [UIFormSectionExpandedByDefault], [PromptParamsSchema], [AssignmentStrategy], [DefaultStorageAccountID], [ConfigSchema], [DefaultConfiguration], [ContextCompressionMessageThreshold], [ContextCompressionPromptID], [ContextCompressionMessageRetentionCount], [ContextWindowMaxTokens], [CompactionTriggerPercent], [CompactionTargetPercent], [ConversationSummaryPromptID]
        FROM [${flyway:defaultSchema}].[AIAgentType]
        WHERE [ContextCompressionPromptID] = @ID

    OPEN cascade_update_MJAIAgentTypes_ContextCompressionPromptID_cursor
    FETCH NEXT FROM cascade_update_MJAIAgentTypes_ContextCompressionPromptID_cursor INTO @MJAIAgentTypes_ContextCompressionPromptIDID, @MJAIAgentTypes_ContextCompressionPromptID_Name, @MJAIAgentTypes_ContextCompressionPromptID_Description, @MJAIAgentTypes_ContextCompressionPromptID_SystemPromptID, @MJAIAgentTypes_ContextCompressionPromptID_IsActive, @MJAIAgentTypes_ContextCompressionPromptID_AgentPromptPlaceholder, @MJAIAgentTypes_ContextCompressionPromptID_DriverClass, @MJAIAgentTypes_ContextCompressionPromptID_UIFormSectionKey, @MJAIAgentTypes_ContextCompressionPromptID_UIFormKey, @MJAIAgentTypes_ContextCompressionPromptID_UIFormSectionExpandedByDefault, @MJAIAgentTypes_ContextCompressionPromptID_PromptParamsSchema, @MJAIAgentTypes_ContextCompressionPromptID_AssignmentStrategy, @MJAIAgentTypes_ContextCompressionPromptID_DefaultStorageAccountID, @MJAIAgentTypes_ContextCompressionPromptID_ConfigSchema, @MJAIAgentTypes_ContextCompressionPromptID_DefaultConfiguration, @MJAIAgentTypes_ContextCompressionPromptID_ContextCompressionMessageThreshold, @MJAIAgentTypes_ContextCompressionPromptID_ContextCompressionPromptID, @MJAIAgentTypes_ContextCompressionPromptID_ContextCompressionMessageRetentionCount, @MJAIAgentTypes_ContextCompressionPromptID_ContextWindowMaxTokens, @MJAIAgentTypes_ContextCompressionPromptID_CompactionTriggerPercent, @MJAIAgentTypes_ContextCompressionPromptID_CompactionTargetPercent, @MJAIAgentTypes_ContextCompressionPromptID_ConversationSummaryPromptID

    WHILE @@FETCH_STATUS = 0
    BEGIN
        -- Set the FK field to NULL
        SET @MJAIAgentTypes_ContextCompressionPromptID_ContextCompressionPromptID = NULL

        -- Call the update SP for the related entity
        EXEC [${flyway:defaultSchema}].[spUpdateAIAgentType] @ID = @MJAIAgentTypes_ContextCompressionPromptIDID, @Name = @MJAIAgentTypes_ContextCompressionPromptID_Name, @Description = @MJAIAgentTypes_ContextCompressionPromptID_Description, @SystemPromptID = @MJAIAgentTypes_ContextCompressionPromptID_SystemPromptID, @IsActive = @MJAIAgentTypes_ContextCompressionPromptID_IsActive, @AgentPromptPlaceholder = @MJAIAgentTypes_ContextCompressionPromptID_AgentPromptPlaceholder, @DriverClass = @MJAIAgentTypes_ContextCompressionPromptID_DriverClass, @UIFormSectionKey = @MJAIAgentTypes_ContextCompressionPromptID_UIFormSectionKey, @UIFormKey = @MJAIAgentTypes_ContextCompressionPromptID_UIFormKey, @UIFormSectionExpandedByDefault = @MJAIAgentTypes_ContextCompressionPromptID_UIFormSectionExpandedByDefault, @PromptParamsSchema = @MJAIAgentTypes_ContextCompressionPromptID_PromptParamsSchema, @AssignmentStrategy = @MJAIAgentTypes_ContextCompressionPromptID_AssignmentStrategy, @DefaultStorageAccountID = @MJAIAgentTypes_ContextCompressionPromptID_DefaultStorageAccountID, @ConfigSchema = @MJAIAgentTypes_ContextCompressionPromptID_ConfigSchema, @DefaultConfiguration = @MJAIAgentTypes_ContextCompressionPromptID_DefaultConfiguration, @ContextCompressionMessageThreshold = @MJAIAgentTypes_ContextCompressionPromptID_ContextCompressionMessageThreshold, @ContextCompressionPromptID_Clear = 1, @ContextCompressionPromptID = @MJAIAgentTypes_ContextCompressionPromptID_ContextCompressionPromptID, @ContextCompressionMessageRetentionCount = @MJAIAgentTypes_ContextCompressionPromptID_ContextCompressionMessageRetentionCount, @ContextWindowMaxTokens = @MJAIAgentTypes_ContextCompressionPromptID_ContextWindowMaxTokens, @CompactionTriggerPercent = @MJAIAgentTypes_ContextCompressionPromptID_CompactionTriggerPercent, @CompactionTargetPercent = @MJAIAgentTypes_ContextCompressionPromptID_CompactionTargetPercent, @ConversationSummaryPromptID = @MJAIAgentTypes_ContextCompressionPromptID_ConversationSummaryPromptID

        FETCH NEXT FROM cascade_update_MJAIAgentTypes_ContextCompressionPromptID_cursor INTO @MJAIAgentTypes_ContextCompressionPromptIDID, @MJAIAgentTypes_ContextCompressionPromptID_Name, @MJAIAgentTypes_ContextCompressionPromptID_Description, @MJAIAgentTypes_ContextCompressionPromptID_SystemPromptID, @MJAIAgentTypes_ContextCompressionPromptID_IsActive, @MJAIAgentTypes_ContextCompressionPromptID_AgentPromptPlaceholder, @MJAIAgentTypes_ContextCompressionPromptID_DriverClass, @MJAIAgentTypes_ContextCompressionPromptID_UIFormSectionKey, @MJAIAgentTypes_ContextCompressionPromptID_UIFormKey, @MJAIAgentTypes_ContextCompressionPromptID_UIFormSectionExpandedByDefault, @MJAIAgentTypes_ContextCompressionPromptID_PromptParamsSchema, @MJAIAgentTypes_ContextCompressionPromptID_AssignmentStrategy, @MJAIAgentTypes_ContextCompressionPromptID_DefaultStorageAccountID, @MJAIAgentTypes_ContextCompressionPromptID_ConfigSchema, @MJAIAgentTypes_ContextCompressionPromptID_DefaultConfiguration, @MJAIAgentTypes_ContextCompressionPromptID_ContextCompressionMessageThreshold, @MJAIAgentTypes_ContextCompressionPromptID_ContextCompressionPromptID, @MJAIAgentTypes_ContextCompressionPromptID_ContextCompressionMessageRetentionCount, @MJAIAgentTypes_ContextCompressionPromptID_ContextWindowMaxTokens, @MJAIAgentTypes_ContextCompressionPromptID_CompactionTriggerPercent, @MJAIAgentTypes_ContextCompressionPromptID_CompactionTargetPercent, @MJAIAgentTypes_ContextCompressionPromptID_ConversationSummaryPromptID
    END

    CLOSE cascade_update_MJAIAgentTypes_ContextCompressionPromptID_cursor
    DEALLOCATE cascade_update_MJAIAgentTypes_ContextCompressionPromptID_cursor
    
    -- Cascade update on AIAgentType using cursor to call spUpdateAIAgentType
    DECLARE @MJAIAgentTypes_ConversationSummaryPromptIDID uniqueidentifier
    DECLARE @MJAIAgentTypes_ConversationSummaryPromptID_Name nvarchar(100)
    DECLARE @MJAIAgentTypes_ConversationSummaryPromptID_Description nvarchar(MAX)
    DECLARE @MJAIAgentTypes_ConversationSummaryPromptID_SystemPromptID uniqueidentifier
    DECLARE @MJAIAgentTypes_ConversationSummaryPromptID_IsActive bit
    DECLARE @MJAIAgentTypes_ConversationSummaryPromptID_AgentPromptPlaceholder nvarchar(255)
    DECLARE @MJAIAgentTypes_ConversationSummaryPromptID_DriverClass nvarchar(255)
    DECLARE @MJAIAgentTypes_ConversationSummaryPromptID_UIFormSectionKey nvarchar(500)
    DECLARE @MJAIAgentTypes_ConversationSummaryPromptID_UIFormKey nvarchar(500)
    DECLARE @MJAIAgentTypes_ConversationSummaryPromptID_UIFormSectionExpandedByDefault bit
    DECLARE @MJAIAgentTypes_ConversationSummaryPromptID_PromptParamsSchema nvarchar(MAX)
    DECLARE @MJAIAgentTypes_ConversationSummaryPromptID_AssignmentStrategy nvarchar(MAX)
    DECLARE @MJAIAgentTypes_ConversationSummaryPromptID_DefaultStorageAccountID uniqueidentifier
    DECLARE @MJAIAgentTypes_ConversationSummaryPromptID_ConfigSchema nvarchar(MAX)
    DECLARE @MJAIAgentTypes_ConversationSummaryPromptID_DefaultConfiguration nvarchar(MAX)
    DECLARE @MJAIAgentTypes_ConversationSummaryPromptID_ContextCompressionMessageThreshold int
    DECLARE @MJAIAgentTypes_ConversationSummaryPromptID_ContextCompressionPromptID uniqueidentifier
    DECLARE @MJAIAgentTypes_ConversationSummaryPromptID_ContextCompressionMessageRetentionCount int
    DECLARE @MJAIAgentTypes_ConversationSummaryPromptID_ContextWindowMaxTokens int
    DECLARE @MJAIAgentTypes_ConversationSummaryPromptID_CompactionTriggerPercent int
    DECLARE @MJAIAgentTypes_ConversationSummaryPromptID_CompactionTargetPercent int
    DECLARE @MJAIAgentTypes_ConversationSummaryPromptID_ConversationSummaryPromptID uniqueidentifier
    DECLARE cascade_update_MJAIAgentTypes_ConversationSummaryPromptID_cursor CURSOR FOR
        SELECT [ID], [Name], [Description], [SystemPromptID], [IsActive], [AgentPromptPlaceholder], [DriverClass], [UIFormSectionKey], [UIFormKey], [UIFormSectionExpandedByDefault], [PromptParamsSchema], [AssignmentStrategy], [DefaultStorageAccountID], [ConfigSchema], [DefaultConfiguration], [ContextCompressionMessageThreshold], [ContextCompressionPromptID], [ContextCompressionMessageRetentionCount], [ContextWindowMaxTokens], [CompactionTriggerPercent], [CompactionTargetPercent], [ConversationSummaryPromptID]
        FROM [${flyway:defaultSchema}].[AIAgentType]
        WHERE [ConversationSummaryPromptID] = @ID

    OPEN cascade_update_MJAIAgentTypes_ConversationSummaryPromptID_cursor
    FETCH NEXT FROM cascade_update_MJAIAgentTypes_ConversationSummaryPromptID_cursor INTO @MJAIAgentTypes_ConversationSummaryPromptIDID, @MJAIAgentTypes_ConversationSummaryPromptID_Name, @MJAIAgentTypes_ConversationSummaryPromptID_Description, @MJAIAgentTypes_ConversationSummaryPromptID_SystemPromptID, @MJAIAgentTypes_ConversationSummaryPromptID_IsActive, @MJAIAgentTypes_ConversationSummaryPromptID_AgentPromptPlaceholder, @MJAIAgentTypes_ConversationSummaryPromptID_DriverClass, @MJAIAgentTypes_ConversationSummaryPromptID_UIFormSectionKey, @MJAIAgentTypes_ConversationSummaryPromptID_UIFormKey, @MJAIAgentTypes_ConversationSummaryPromptID_UIFormSectionExpandedByDefault, @MJAIAgentTypes_ConversationSummaryPromptID_PromptParamsSchema, @MJAIAgentTypes_ConversationSummaryPromptID_AssignmentStrategy, @MJAIAgentTypes_ConversationSummaryPromptID_DefaultStorageAccountID, @MJAIAgentTypes_ConversationSummaryPromptID_ConfigSchema, @MJAIAgentTypes_ConversationSummaryPromptID_DefaultConfiguration, @MJAIAgentTypes_ConversationSummaryPromptID_ContextCompressionMessageThreshold, @MJAIAgentTypes_ConversationSummaryPromptID_ContextCompressionPromptID, @MJAIAgentTypes_ConversationSummaryPromptID_ContextCompressionMessageRetentionCount, @MJAIAgentTypes_ConversationSummaryPromptID_ContextWindowMaxTokens, @MJAIAgentTypes_ConversationSummaryPromptID_CompactionTriggerPercent, @MJAIAgentTypes_ConversationSummaryPromptID_CompactionTargetPercent, @MJAIAgentTypes_ConversationSummaryPromptID_ConversationSummaryPromptID

    WHILE @@FETCH_STATUS = 0
    BEGIN
        -- Set the FK field to NULL
        SET @MJAIAgentTypes_ConversationSummaryPromptID_ConversationSummaryPromptID = NULL

        -- Call the update SP for the related entity
        EXEC [${flyway:defaultSchema}].[spUpdateAIAgentType] @ID = @MJAIAgentTypes_ConversationSummaryPromptIDID, @Name = @MJAIAgentTypes_ConversationSummaryPromptID_Name, @Description = @MJAIAgentTypes_ConversationSummaryPromptID_Description, @SystemPromptID = @MJAIAgentTypes_ConversationSummaryPromptID_SystemPromptID, @IsActive = @MJAIAgentTypes_ConversationSummaryPromptID_IsActive, @AgentPromptPlaceholder = @MJAIAgentTypes_ConversationSummaryPromptID_AgentPromptPlaceholder, @DriverClass = @MJAIAgentTypes_ConversationSummaryPromptID_DriverClass, @UIFormSectionKey = @MJAIAgentTypes_ConversationSummaryPromptID_UIFormSectionKey, @UIFormKey = @MJAIAgentTypes_ConversationSummaryPromptID_UIFormKey, @UIFormSectionExpandedByDefault = @MJAIAgentTypes_ConversationSummaryPromptID_UIFormSectionExpandedByDefault, @PromptParamsSchema = @MJAIAgentTypes_ConversationSummaryPromptID_PromptParamsSchema, @AssignmentStrategy = @MJAIAgentTypes_ConversationSummaryPromptID_AssignmentStrategy, @DefaultStorageAccountID = @MJAIAgentTypes_ConversationSummaryPromptID_DefaultStorageAccountID, @ConfigSchema = @MJAIAgentTypes_ConversationSummaryPromptID_ConfigSchema, @DefaultConfiguration = @MJAIAgentTypes_ConversationSummaryPromptID_DefaultConfiguration, @ContextCompressionMessageThreshold = @MJAIAgentTypes_ConversationSummaryPromptID_ContextCompressionMessageThreshold, @ContextCompressionPromptID = @MJAIAgentTypes_ConversationSummaryPromptID_ContextCompressionPromptID, @ContextCompressionMessageRetentionCount = @MJAIAgentTypes_ConversationSummaryPromptID_ContextCompressionMessageRetentionCount, @ContextWindowMaxTokens = @MJAIAgentTypes_ConversationSummaryPromptID_ContextWindowMaxTokens, @CompactionTriggerPercent = @MJAIAgentTypes_ConversationSummaryPromptID_CompactionTriggerPercent, @CompactionTargetPercent = @MJAIAgentTypes_ConversationSummaryPromptID_CompactionTargetPercent, @ConversationSummaryPromptID_Clear = 1, @ConversationSummaryPromptID = @MJAIAgentTypes_ConversationSummaryPromptID_ConversationSummaryPromptID

        FETCH NEXT FROM cascade_update_MJAIAgentTypes_ConversationSummaryPromptID_cursor INTO @MJAIAgentTypes_ConversationSummaryPromptIDID, @MJAIAgentTypes_ConversationSummaryPromptID_Name, @MJAIAgentTypes_ConversationSummaryPromptID_Description, @MJAIAgentTypes_ConversationSummaryPromptID_SystemPromptID, @MJAIAgentTypes_ConversationSummaryPromptID_IsActive, @MJAIAgentTypes_ConversationSummaryPromptID_AgentPromptPlaceholder, @MJAIAgentTypes_ConversationSummaryPromptID_DriverClass, @MJAIAgentTypes_ConversationSummaryPromptID_UIFormSectionKey, @MJAIAgentTypes_ConversationSummaryPromptID_UIFormKey, @MJAIAgentTypes_ConversationSummaryPromptID_UIFormSectionExpandedByDefault, @MJAIAgentTypes_ConversationSummaryPromptID_PromptParamsSchema, @MJAIAgentTypes_ConversationSummaryPromptID_AssignmentStrategy, @MJAIAgentTypes_ConversationSummaryPromptID_DefaultStorageAccountID, @MJAIAgentTypes_ConversationSummaryPromptID_ConfigSchema, @MJAIAgentTypes_ConversationSummaryPromptID_DefaultConfiguration, @MJAIAgentTypes_ConversationSummaryPromptID_ContextCompressionMessageThreshold, @MJAIAgentTypes_ConversationSummaryPromptID_ContextCompressionPromptID, @MJAIAgentTypes_ConversationSummaryPromptID_ContextCompressionMessageRetentionCount, @MJAIAgentTypes_ConversationSummaryPromptID_ContextWindowMaxTokens, @MJAIAgentTypes_ConversationSummaryPromptID_CompactionTriggerPercent, @MJAIAgentTypes_ConversationSummaryPromptID_CompactionTargetPercent, @MJAIAgentTypes_ConversationSummaryPromptID_ConversationSummaryPromptID
    END

    CLOSE cascade_update_MJAIAgentTypes_ConversationSummaryPromptID_cursor
    DEALLOCATE cascade_update_MJAIAgentTypes_ConversationSummaryPromptID_cursor
    
    -- Cascade update on AIAgent using cursor to call spUpdateAIAgent
    DECLARE @MJAIAgents_ContextCompressionPromptIDID uniqueidentifier
    DECLARE @MJAIAgents_ContextCompressionPromptID_Name nvarchar(255)
    DECLARE @MJAIAgents_ContextCompressionPromptID_Description nvarchar(MAX)
    DECLARE @MJAIAgents_ContextCompressionPromptID_LogoURL nvarchar(255)
    DECLARE @MJAIAgents_ContextCompressionPromptID_ParentID uniqueidentifier
    DECLARE @MJAIAgents_ContextCompressionPromptID_ExposeAsAction bit
    DECLARE @MJAIAgents_ContextCompressionPromptID_ExecutionOrder int
    DECLARE @MJAIAgents_ContextCompressionPromptID_ExecutionMode nvarchar(20)
    DECLARE @MJAIAgents_ContextCompressionPromptID_EnableContextCompression bit
    DECLARE @MJAIAgents_ContextCompressionPromptID_ContextCompressionMessageThreshold int
    DECLARE @MJAIAgents_ContextCompressionPromptID_ContextCompressionPromptID uniqueidentifier
    DECLARE @MJAIAgents_ContextCompressionPromptID_ContextCompressionMessageRetentionCount int
    DECLARE @MJAIAgents_ContextCompressionPromptID_TypeID uniqueidentifier
    DECLARE @MJAIAgents_ContextCompressionPromptID_Status nvarchar(20)
    DECLARE @MJAIAgents_ContextCompressionPromptID_DriverClass nvarchar(255)
    DECLARE @MJAIAgents_ContextCompressionPromptID_IconClass nvarchar(100)
    DECLARE @MJAIAgents_ContextCompressionPromptID_ModelSelectionMode nvarchar(50)
    DECLARE @MJAIAgents_ContextCompressionPromptID_PayloadDownstreamPaths nvarchar(MAX)
    DECLARE @MJAIAgents_ContextCompressionPromptID_PayloadUpstreamPaths nvarchar(MAX)
    DECLARE @MJAIAgents_ContextCompressionPromptID_PayloadSelfReadPaths nvarchar(MAX)
    DECLARE @MJAIAgents_ContextCompressionPromptID_PayloadSelfWritePaths nvarchar(MAX)
    DECLARE @MJAIAgents_ContextCompressionPromptID_PayloadScope nvarchar(MAX)
    DECLARE @MJAIAgents_ContextCompressionPromptID_FinalPayloadValidation nvarchar(MAX)
    DECLARE @MJAIAgents_ContextCompressionPromptID_FinalPayloadValidationMode nvarchar(25)
    DECLARE @MJAIAgents_ContextCompressionPromptID_FinalPayloadValidationMaxRetries int
    DECLARE @MJAIAgents_ContextCompressionPromptID_MaxCostPerRun decimal(10, 4)
    DECLARE @MJAIAgents_ContextCompressionPromptID_MaxTokensPerRun int
    DECLARE @MJAIAgents_ContextCompressionPromptID_MaxIterationsPerRun int
    DECLARE @MJAIAgents_ContextCompressionPromptID_MaxTimePerRun int
    DECLARE @MJAIAgents_ContextCompressionPromptID_MinExecutionsPerRun int
    DECLARE @MJAIAgents_ContextCompressionPromptID_MaxExecutionsPerRun int
    DECLARE @MJAIAgents_ContextCompressionPromptID_StartingPayloadValidation nvarchar(MAX)
    DECLARE @MJAIAgents_ContextCompressionPromptID_StartingPayloadValidationMode nvarchar(25)
    DECLARE @MJAIAgents_ContextCompressionPromptID_DefaultPromptEffortLevel int
    DECLARE @MJAIAgents_ContextCompressionPromptID_ChatHandlingOption nvarchar(30)
    DECLARE @MJAIAgents_ContextCompressionPromptID_DefaultArtifactTypeID uniqueidentifier
    DECLARE @MJAIAgents_ContextCompressionPromptID_OwnerUserID uniqueidentifier
    DECLARE @MJAIAgents_ContextCompressionPromptID_InvocationMode nvarchar(20)
    DECLARE @MJAIAgents_ContextCompressionPromptID_ArtifactCreationMode nvarchar(20)
    DECLARE @MJAIAgents_ContextCompressionPromptID_FunctionalRequirements nvarchar(MAX)
    DECLARE @MJAIAgents_ContextCompressionPromptID_TechnicalDesign nvarchar(MAX)
    DECLARE @MJAIAgents_ContextCompressionPromptID_InjectNotes bit
    DECLARE @MJAIAgents_ContextCompressionPromptID_MaxNotesToInject int
    DECLARE @MJAIAgents_ContextCompressionPromptID_NoteInjectionStrategy nvarchar(20)
    DECLARE @MJAIAgents_ContextCompressionPromptID_InjectExamples bit
    DECLARE @MJAIAgents_ContextCompressionPromptID_MaxExamplesToInject int
    DECLARE @MJAIAgents_ContextCompressionPromptID_ExampleInjectionStrategy nvarchar(20)
    DECLARE @MJAIAgents_ContextCompressionPromptID_IsRestricted bit
    DECLARE @MJAIAgents_ContextCompressionPromptID_MessageMode nvarchar(50)
    DECLARE @MJAIAgents_ContextCompressionPromptID_MaxMessages int
    DECLARE @MJAIAgents_ContextCompressionPromptID_AttachmentStorageProviderID uniqueidentifier
    DECLARE @MJAIAgents_ContextCompressionPromptID_AttachmentRootPath nvarchar(500)
    DECLARE @MJAIAgents_ContextCompressionPromptID_InlineStorageThresholdBytes int
    DECLARE @MJAIAgents_ContextCompressionPromptID_AgentTypePromptParams nvarchar(MAX)
    DECLARE @MJAIAgents_ContextCompressionPromptID_ScopeConfig nvarchar(MAX)
    DECLARE @MJAIAgents_ContextCompressionPromptID_NoteRetentionDays int
    DECLARE @MJAIAgents_ContextCompressionPromptID_ExampleRetentionDays int
    DECLARE @MJAIAgents_ContextCompressionPromptID_AutoArchiveEnabled bit
    DECLARE @MJAIAgents_ContextCompressionPromptID_RerankerConfiguration nvarchar(MAX)
    DECLARE @MJAIAgents_ContextCompressionPromptID_CategoryID uniqueidentifier
    DECLARE @MJAIAgents_ContextCompressionPromptID_AllowEphemeralClientTools bit
    DECLARE @MJAIAgents_ContextCompressionPromptID_DefaultStorageAccountID uniqueidentifier
    DECLARE @MJAIAgents_ContextCompressionPromptID_SearchScopeAccess nvarchar(20)
    DECLARE @MJAIAgents_ContextCompressionPromptID_AcceptUnregisteredFiles bit
    DECLARE @MJAIAgents_ContextCompressionPromptID_DefaultCoAgentID uniqueidentifier
    DECLARE @MJAIAgents_ContextCompressionPromptID_TypeConfiguration nvarchar(MAX)
    DECLARE @MJAIAgents_ContextCompressionPromptID_AllowMemoryWrite bit
    DECLARE @MJAIAgents_ContextCompressionPromptID_RecordingDefault nvarchar(20)
    DECLARE @MJAIAgents_ContextCompressionPromptID_RecordingStorageProviderID uniqueidentifier
    DECLARE @MJAIAgents_ContextCompressionPromptID_DefaultMediaCollectionID uniqueidentifier
    DECLARE @MJAIAgents_ContextCompressionPromptID_SupportsPlanMode bit
    DECLARE @MJAIAgents_ContextCompressionPromptID_AcceptsSkills nvarchar(20)
    DECLARE @MJAIAgents_ContextCompressionPromptID_SkillActivationMode nvarchar(20)
    DECLARE @MJAIAgents_ContextCompressionPromptID_RequirePlanMode bit
    DECLARE @MJAIAgents_ContextCompressionPromptID_ContextWindowMaxTokens int
    DECLARE @MJAIAgents_ContextCompressionPromptID_CompactionTriggerPercent int
    DECLARE @MJAIAgents_ContextCompressionPromptID_CompactionTargetPercent int
    DECLARE @MJAIAgents_ContextCompressionPromptID_ConversationSummaryPromptID uniqueidentifier
    DECLARE cascade_update_MJAIAgents_ContextCompressionPromptID_cursor CURSOR FOR
        SELECT [ID], [Name], [Description], [LogoURL], [ParentID], [ExposeAsAction], [ExecutionOrder], [ExecutionMode], [EnableContextCompression], [ContextCompressionMessageThreshold], [ContextCompressionPromptID], [ContextCompressionMessageRetentionCount], [TypeID], [Status], [DriverClass], [IconClass], [ModelSelectionMode], [PayloadDownstreamPaths], [PayloadUpstreamPaths], [PayloadSelfReadPaths], [PayloadSelfWritePaths], [PayloadScope], [FinalPayloadValidation], [FinalPayloadValidationMode], [FinalPayloadValidationMaxRetries], [MaxCostPerRun], [MaxTokensPerRun], [MaxIterationsPerRun], [MaxTimePerRun], [MinExecutionsPerRun], [MaxExecutionsPerRun], [StartingPayloadValidation], [StartingPayloadValidationMode], [DefaultPromptEffortLevel], [ChatHandlingOption], [DefaultArtifactTypeID], [OwnerUserID], [InvocationMode], [ArtifactCreationMode], [FunctionalRequirements], [TechnicalDesign], [InjectNotes], [MaxNotesToInject], [NoteInjectionStrategy], [InjectExamples], [MaxExamplesToInject], [ExampleInjectionStrategy], [IsRestricted], [MessageMode], [MaxMessages], [AttachmentStorageProviderID], [AttachmentRootPath], [InlineStorageThresholdBytes], [AgentTypePromptParams], [ScopeConfig], [NoteRetentionDays], [ExampleRetentionDays], [AutoArchiveEnabled], [RerankerConfiguration], [CategoryID], [AllowEphemeralClientTools], [DefaultStorageAccountID], [SearchScopeAccess], [AcceptUnregisteredFiles], [DefaultCoAgentID], [TypeConfiguration], [AllowMemoryWrite], [RecordingDefault], [RecordingStorageProviderID], [DefaultMediaCollectionID], [SupportsPlanMode], [AcceptsSkills], [SkillActivationMode], [RequirePlanMode], [ContextWindowMaxTokens], [CompactionTriggerPercent], [CompactionTargetPercent], [ConversationSummaryPromptID]
        FROM [${flyway:defaultSchema}].[AIAgent]
        WHERE [ContextCompressionPromptID] = @ID

    OPEN cascade_update_MJAIAgents_ContextCompressionPromptID_cursor
    FETCH NEXT FROM cascade_update_MJAIAgents_ContextCompressionPromptID_cursor INTO @MJAIAgents_ContextCompressionPromptIDID, @MJAIAgents_ContextCompressionPromptID_Name, @MJAIAgents_ContextCompressionPromptID_Description, @MJAIAgents_ContextCompressionPromptID_LogoURL, @MJAIAgents_ContextCompressionPromptID_ParentID, @MJAIAgents_ContextCompressionPromptID_ExposeAsAction, @MJAIAgents_ContextCompressionPromptID_ExecutionOrder, @MJAIAgents_ContextCompressionPromptID_ExecutionMode, @MJAIAgents_ContextCompressionPromptID_EnableContextCompression, @MJAIAgents_ContextCompressionPromptID_ContextCompressionMessageThreshold, @MJAIAgents_ContextCompressionPromptID_ContextCompressionPromptID, @MJAIAgents_ContextCompressionPromptID_ContextCompressionMessageRetentionCount, @MJAIAgents_ContextCompressionPromptID_TypeID, @MJAIAgents_ContextCompressionPromptID_Status, @MJAIAgents_ContextCompressionPromptID_DriverClass, @MJAIAgents_ContextCompressionPromptID_IconClass, @MJAIAgents_ContextCompressionPromptID_ModelSelectionMode, @MJAIAgents_ContextCompressionPromptID_PayloadDownstreamPaths, @MJAIAgents_ContextCompressionPromptID_PayloadUpstreamPaths, @MJAIAgents_ContextCompressionPromptID_PayloadSelfReadPaths, @MJAIAgents_ContextCompressionPromptID_PayloadSelfWritePaths, @MJAIAgents_ContextCompressionPromptID_PayloadScope, @MJAIAgents_ContextCompressionPromptID_FinalPayloadValidation, @MJAIAgents_ContextCompressionPromptID_FinalPayloadValidationMode, @MJAIAgents_ContextCompressionPromptID_FinalPayloadValidationMaxRetries, @MJAIAgents_ContextCompressionPromptID_MaxCostPerRun, @MJAIAgents_ContextCompressionPromptID_MaxTokensPerRun, @MJAIAgents_ContextCompressionPromptID_MaxIterationsPerRun, @MJAIAgents_ContextCompressionPromptID_MaxTimePerRun, @MJAIAgents_ContextCompressionPromptID_MinExecutionsPerRun, @MJAIAgents_ContextCompressionPromptID_MaxExecutionsPerRun, @MJAIAgents_ContextCompressionPromptID_StartingPayloadValidation, @MJAIAgents_ContextCompressionPromptID_StartingPayloadValidationMode, @MJAIAgents_ContextCompressionPromptID_DefaultPromptEffortLevel, @MJAIAgents_ContextCompressionPromptID_ChatHandlingOption, @MJAIAgents_ContextCompressionPromptID_DefaultArtifactTypeID, @MJAIAgents_ContextCompressionPromptID_OwnerUserID, @MJAIAgents_ContextCompressionPromptID_InvocationMode, @MJAIAgents_ContextCompressionPromptID_ArtifactCreationMode, @MJAIAgents_ContextCompressionPromptID_FunctionalRequirements, @MJAIAgents_ContextCompressionPromptID_TechnicalDesign, @MJAIAgents_ContextCompressionPromptID_InjectNotes, @MJAIAgents_ContextCompressionPromptID_MaxNotesToInject, @MJAIAgents_ContextCompressionPromptID_NoteInjectionStrategy, @MJAIAgents_ContextCompressionPromptID_InjectExamples, @MJAIAgents_ContextCompressionPromptID_MaxExamplesToInject, @MJAIAgents_ContextCompressionPromptID_ExampleInjectionStrategy, @MJAIAgents_ContextCompressionPromptID_IsRestricted, @MJAIAgents_ContextCompressionPromptID_MessageMode, @MJAIAgents_ContextCompressionPromptID_MaxMessages, @MJAIAgents_ContextCompressionPromptID_AttachmentStorageProviderID, @MJAIAgents_ContextCompressionPromptID_AttachmentRootPath, @MJAIAgents_ContextCompressionPromptID_InlineStorageThresholdBytes, @MJAIAgents_ContextCompressionPromptID_AgentTypePromptParams, @MJAIAgents_ContextCompressionPromptID_ScopeConfig, @MJAIAgents_ContextCompressionPromptID_NoteRetentionDays, @MJAIAgents_ContextCompressionPromptID_ExampleRetentionDays, @MJAIAgents_ContextCompressionPromptID_AutoArchiveEnabled, @MJAIAgents_ContextCompressionPromptID_RerankerConfiguration, @MJAIAgents_ContextCompressionPromptID_CategoryID, @MJAIAgents_ContextCompressionPromptID_AllowEphemeralClientTools, @MJAIAgents_ContextCompressionPromptID_DefaultStorageAccountID, @MJAIAgents_ContextCompressionPromptID_SearchScopeAccess, @MJAIAgents_ContextCompressionPromptID_AcceptUnregisteredFiles, @MJAIAgents_ContextCompressionPromptID_DefaultCoAgentID, @MJAIAgents_ContextCompressionPromptID_TypeConfiguration, @MJAIAgents_ContextCompressionPromptID_AllowMemoryWrite, @MJAIAgents_ContextCompressionPromptID_RecordingDefault, @MJAIAgents_ContextCompressionPromptID_RecordingStorageProviderID, @MJAIAgents_ContextCompressionPromptID_DefaultMediaCollectionID, @MJAIAgents_ContextCompressionPromptID_SupportsPlanMode, @MJAIAgents_ContextCompressionPromptID_AcceptsSkills, @MJAIAgents_ContextCompressionPromptID_SkillActivationMode, @MJAIAgents_ContextCompressionPromptID_RequirePlanMode, @MJAIAgents_ContextCompressionPromptID_ContextWindowMaxTokens, @MJAIAgents_ContextCompressionPromptID_CompactionTriggerPercent, @MJAIAgents_ContextCompressionPromptID_CompactionTargetPercent, @MJAIAgents_ContextCompressionPromptID_ConversationSummaryPromptID

    WHILE @@FETCH_STATUS = 0
    BEGIN
        -- Set the FK field to NULL
        SET @MJAIAgents_ContextCompressionPromptID_ContextCompressionPromptID = NULL

        -- Call the update SP for the related entity
        EXEC [${flyway:defaultSchema}].[spUpdateAIAgent] @ID = @MJAIAgents_ContextCompressionPromptIDID, @Name = @MJAIAgents_ContextCompressionPromptID_Name, @Description = @MJAIAgents_ContextCompressionPromptID_Description, @LogoURL = @MJAIAgents_ContextCompressionPromptID_LogoURL, @ParentID = @MJAIAgents_ContextCompressionPromptID_ParentID, @ExposeAsAction = @MJAIAgents_ContextCompressionPromptID_ExposeAsAction, @ExecutionOrder = @MJAIAgents_ContextCompressionPromptID_ExecutionOrder, @ExecutionMode = @MJAIAgents_ContextCompressionPromptID_ExecutionMode, @EnableContextCompression = @MJAIAgents_ContextCompressionPromptID_EnableContextCompression, @ContextCompressionMessageThreshold = @MJAIAgents_ContextCompressionPromptID_ContextCompressionMessageThreshold, @ContextCompressionPromptID_Clear = 1, @ContextCompressionPromptID = @MJAIAgents_ContextCompressionPromptID_ContextCompressionPromptID, @ContextCompressionMessageRetentionCount = @MJAIAgents_ContextCompressionPromptID_ContextCompressionMessageRetentionCount, @TypeID = @MJAIAgents_ContextCompressionPromptID_TypeID, @Status = @MJAIAgents_ContextCompressionPromptID_Status, @DriverClass = @MJAIAgents_ContextCompressionPromptID_DriverClass, @IconClass = @MJAIAgents_ContextCompressionPromptID_IconClass, @ModelSelectionMode = @MJAIAgents_ContextCompressionPromptID_ModelSelectionMode, @PayloadDownstreamPaths = @MJAIAgents_ContextCompressionPromptID_PayloadDownstreamPaths, @PayloadUpstreamPaths = @MJAIAgents_ContextCompressionPromptID_PayloadUpstreamPaths, @PayloadSelfReadPaths = @MJAIAgents_ContextCompressionPromptID_PayloadSelfReadPaths, @PayloadSelfWritePaths = @MJAIAgents_ContextCompressionPromptID_PayloadSelfWritePaths, @PayloadScope = @MJAIAgents_ContextCompressionPromptID_PayloadScope, @FinalPayloadValidation = @MJAIAgents_ContextCompressionPromptID_FinalPayloadValidation, @FinalPayloadValidationMode = @MJAIAgents_ContextCompressionPromptID_FinalPayloadValidationMode, @FinalPayloadValidationMaxRetries = @MJAIAgents_ContextCompressionPromptID_FinalPayloadValidationMaxRetries, @MaxCostPerRun = @MJAIAgents_ContextCompressionPromptID_MaxCostPerRun, @MaxTokensPerRun = @MJAIAgents_ContextCompressionPromptID_MaxTokensPerRun, @MaxIterationsPerRun = @MJAIAgents_ContextCompressionPromptID_MaxIterationsPerRun, @MaxTimePerRun = @MJAIAgents_ContextCompressionPromptID_MaxTimePerRun, @MinExecutionsPerRun = @MJAIAgents_ContextCompressionPromptID_MinExecutionsPerRun, @MaxExecutionsPerRun = @MJAIAgents_ContextCompressionPromptID_MaxExecutionsPerRun, @StartingPayloadValidation = @MJAIAgents_ContextCompressionPromptID_StartingPayloadValidation, @StartingPayloadValidationMode = @MJAIAgents_ContextCompressionPromptID_StartingPayloadValidationMode, @DefaultPromptEffortLevel = @MJAIAgents_ContextCompressionPromptID_DefaultPromptEffortLevel, @ChatHandlingOption = @MJAIAgents_ContextCompressionPromptID_ChatHandlingOption, @DefaultArtifactTypeID = @MJAIAgents_ContextCompressionPromptID_DefaultArtifactTypeID, @OwnerUserID = @MJAIAgents_ContextCompressionPromptID_OwnerUserID, @InvocationMode = @MJAIAgents_ContextCompressionPromptID_InvocationMode, @ArtifactCreationMode = @MJAIAgents_ContextCompressionPromptID_ArtifactCreationMode, @FunctionalRequirements = @MJAIAgents_ContextCompressionPromptID_FunctionalRequirements, @TechnicalDesign = @MJAIAgents_ContextCompressionPromptID_TechnicalDesign, @InjectNotes = @MJAIAgents_ContextCompressionPromptID_InjectNotes, @MaxNotesToInject = @MJAIAgents_ContextCompressionPromptID_MaxNotesToInject, @NoteInjectionStrategy = @MJAIAgents_ContextCompressionPromptID_NoteInjectionStrategy, @InjectExamples = @MJAIAgents_ContextCompressionPromptID_InjectExamples, @MaxExamplesToInject = @MJAIAgents_ContextCompressionPromptID_MaxExamplesToInject, @ExampleInjectionStrategy = @MJAIAgents_ContextCompressionPromptID_ExampleInjectionStrategy, @IsRestricted = @MJAIAgents_ContextCompressionPromptID_IsRestricted, @MessageMode = @MJAIAgents_ContextCompressionPromptID_MessageMode, @MaxMessages = @MJAIAgents_ContextCompressionPromptID_MaxMessages, @AttachmentStorageProviderID = @MJAIAgents_ContextCompressionPromptID_AttachmentStorageProviderID, @AttachmentRootPath = @MJAIAgents_ContextCompressionPromptID_AttachmentRootPath, @InlineStorageThresholdBytes = @MJAIAgents_ContextCompressionPromptID_InlineStorageThresholdBytes, @AgentTypePromptParams = @MJAIAgents_ContextCompressionPromptID_AgentTypePromptParams, @ScopeConfig = @MJAIAgents_ContextCompressionPromptID_ScopeConfig, @NoteRetentionDays = @MJAIAgents_ContextCompressionPromptID_NoteRetentionDays, @ExampleRetentionDays = @MJAIAgents_ContextCompressionPromptID_ExampleRetentionDays, @AutoArchiveEnabled = @MJAIAgents_ContextCompressionPromptID_AutoArchiveEnabled, @RerankerConfiguration = @MJAIAgents_ContextCompressionPromptID_RerankerConfiguration, @CategoryID = @MJAIAgents_ContextCompressionPromptID_CategoryID, @AllowEphemeralClientTools = @MJAIAgents_ContextCompressionPromptID_AllowEphemeralClientTools, @DefaultStorageAccountID = @MJAIAgents_ContextCompressionPromptID_DefaultStorageAccountID, @SearchScopeAccess = @MJAIAgents_ContextCompressionPromptID_SearchScopeAccess, @AcceptUnregisteredFiles = @MJAIAgents_ContextCompressionPromptID_AcceptUnregisteredFiles, @DefaultCoAgentID = @MJAIAgents_ContextCompressionPromptID_DefaultCoAgentID, @TypeConfiguration = @MJAIAgents_ContextCompressionPromptID_TypeConfiguration, @AllowMemoryWrite = @MJAIAgents_ContextCompressionPromptID_AllowMemoryWrite, @RecordingDefault = @MJAIAgents_ContextCompressionPromptID_RecordingDefault, @RecordingStorageProviderID = @MJAIAgents_ContextCompressionPromptID_RecordingStorageProviderID, @DefaultMediaCollectionID = @MJAIAgents_ContextCompressionPromptID_DefaultMediaCollectionID, @SupportsPlanMode = @MJAIAgents_ContextCompressionPromptID_SupportsPlanMode, @AcceptsSkills = @MJAIAgents_ContextCompressionPromptID_AcceptsSkills, @SkillActivationMode = @MJAIAgents_ContextCompressionPromptID_SkillActivationMode, @RequirePlanMode = @MJAIAgents_ContextCompressionPromptID_RequirePlanMode, @ContextWindowMaxTokens = @MJAIAgents_ContextCompressionPromptID_ContextWindowMaxTokens, @CompactionTriggerPercent = @MJAIAgents_ContextCompressionPromptID_CompactionTriggerPercent, @CompactionTargetPercent = @MJAIAgents_ContextCompressionPromptID_CompactionTargetPercent, @ConversationSummaryPromptID = @MJAIAgents_ContextCompressionPromptID_ConversationSummaryPromptID

        FETCH NEXT FROM cascade_update_MJAIAgents_ContextCompressionPromptID_cursor INTO @MJAIAgents_ContextCompressionPromptIDID, @MJAIAgents_ContextCompressionPromptID_Name, @MJAIAgents_ContextCompressionPromptID_Description, @MJAIAgents_ContextCompressionPromptID_LogoURL, @MJAIAgents_ContextCompressionPromptID_ParentID, @MJAIAgents_ContextCompressionPromptID_ExposeAsAction, @MJAIAgents_ContextCompressionPromptID_ExecutionOrder, @MJAIAgents_ContextCompressionPromptID_ExecutionMode, @MJAIAgents_ContextCompressionPromptID_EnableContextCompression, @MJAIAgents_ContextCompressionPromptID_ContextCompressionMessageThreshold, @MJAIAgents_ContextCompressionPromptID_ContextCompressionPromptID, @MJAIAgents_ContextCompressionPromptID_ContextCompressionMessageRetentionCount, @MJAIAgents_ContextCompressionPromptID_TypeID, @MJAIAgents_ContextCompressionPromptID_Status, @MJAIAgents_ContextCompressionPromptID_DriverClass, @MJAIAgents_ContextCompressionPromptID_IconClass, @MJAIAgents_ContextCompressionPromptID_ModelSelectionMode, @MJAIAgents_ContextCompressionPromptID_PayloadDownstreamPaths, @MJAIAgents_ContextCompressionPromptID_PayloadUpstreamPaths, @MJAIAgents_ContextCompressionPromptID_PayloadSelfReadPaths, @MJAIAgents_ContextCompressionPromptID_PayloadSelfWritePaths, @MJAIAgents_ContextCompressionPromptID_PayloadScope, @MJAIAgents_ContextCompressionPromptID_FinalPayloadValidation, @MJAIAgents_ContextCompressionPromptID_FinalPayloadValidationMode, @MJAIAgents_ContextCompressionPromptID_FinalPayloadValidationMaxRetries, @MJAIAgents_ContextCompressionPromptID_MaxCostPerRun, @MJAIAgents_ContextCompressionPromptID_MaxTokensPerRun, @MJAIAgents_ContextCompressionPromptID_MaxIterationsPerRun, @MJAIAgents_ContextCompressionPromptID_MaxTimePerRun, @MJAIAgents_ContextCompressionPromptID_MinExecutionsPerRun, @MJAIAgents_ContextCompressionPromptID_MaxExecutionsPerRun, @MJAIAgents_ContextCompressionPromptID_StartingPayloadValidation, @MJAIAgents_ContextCompressionPromptID_StartingPayloadValidationMode, @MJAIAgents_ContextCompressionPromptID_DefaultPromptEffortLevel, @MJAIAgents_ContextCompressionPromptID_ChatHandlingOption, @MJAIAgents_ContextCompressionPromptID_DefaultArtifactTypeID, @MJAIAgents_ContextCompressionPromptID_OwnerUserID, @MJAIAgents_ContextCompressionPromptID_InvocationMode, @MJAIAgents_ContextCompressionPromptID_ArtifactCreationMode, @MJAIAgents_ContextCompressionPromptID_FunctionalRequirements, @MJAIAgents_ContextCompressionPromptID_TechnicalDesign, @MJAIAgents_ContextCompressionPromptID_InjectNotes, @MJAIAgents_ContextCompressionPromptID_MaxNotesToInject, @MJAIAgents_ContextCompressionPromptID_NoteInjectionStrategy, @MJAIAgents_ContextCompressionPromptID_InjectExamples, @MJAIAgents_ContextCompressionPromptID_MaxExamplesToInject, @MJAIAgents_ContextCompressionPromptID_ExampleInjectionStrategy, @MJAIAgents_ContextCompressionPromptID_IsRestricted, @MJAIAgents_ContextCompressionPromptID_MessageMode, @MJAIAgents_ContextCompressionPromptID_MaxMessages, @MJAIAgents_ContextCompressionPromptID_AttachmentStorageProviderID, @MJAIAgents_ContextCompressionPromptID_AttachmentRootPath, @MJAIAgents_ContextCompressionPromptID_InlineStorageThresholdBytes, @MJAIAgents_ContextCompressionPromptID_AgentTypePromptParams, @MJAIAgents_ContextCompressionPromptID_ScopeConfig, @MJAIAgents_ContextCompressionPromptID_NoteRetentionDays, @MJAIAgents_ContextCompressionPromptID_ExampleRetentionDays, @MJAIAgents_ContextCompressionPromptID_AutoArchiveEnabled, @MJAIAgents_ContextCompressionPromptID_RerankerConfiguration, @MJAIAgents_ContextCompressionPromptID_CategoryID, @MJAIAgents_ContextCompressionPromptID_AllowEphemeralClientTools, @MJAIAgents_ContextCompressionPromptID_DefaultStorageAccountID, @MJAIAgents_ContextCompressionPromptID_SearchScopeAccess, @MJAIAgents_ContextCompressionPromptID_AcceptUnregisteredFiles, @MJAIAgents_ContextCompressionPromptID_DefaultCoAgentID, @MJAIAgents_ContextCompressionPromptID_TypeConfiguration, @MJAIAgents_ContextCompressionPromptID_AllowMemoryWrite, @MJAIAgents_ContextCompressionPromptID_RecordingDefault, @MJAIAgents_ContextCompressionPromptID_RecordingStorageProviderID, @MJAIAgents_ContextCompressionPromptID_DefaultMediaCollectionID, @MJAIAgents_ContextCompressionPromptID_SupportsPlanMode, @MJAIAgents_ContextCompressionPromptID_AcceptsSkills, @MJAIAgents_ContextCompressionPromptID_SkillActivationMode, @MJAIAgents_ContextCompressionPromptID_RequirePlanMode, @MJAIAgents_ContextCompressionPromptID_ContextWindowMaxTokens, @MJAIAgents_ContextCompressionPromptID_CompactionTriggerPercent, @MJAIAgents_ContextCompressionPromptID_CompactionTargetPercent, @MJAIAgents_ContextCompressionPromptID_ConversationSummaryPromptID
    END

    CLOSE cascade_update_MJAIAgents_ContextCompressionPromptID_cursor
    DEALLOCATE cascade_update_MJAIAgents_ContextCompressionPromptID_cursor
    
    -- Cascade update on AIAgent using cursor to call spUpdateAIAgent
    DECLARE @MJAIAgents_ConversationSummaryPromptIDID uniqueidentifier
    DECLARE @MJAIAgents_ConversationSummaryPromptID_Name nvarchar(255)
    DECLARE @MJAIAgents_ConversationSummaryPromptID_Description nvarchar(MAX)
    DECLARE @MJAIAgents_ConversationSummaryPromptID_LogoURL nvarchar(255)
    DECLARE @MJAIAgents_ConversationSummaryPromptID_ParentID uniqueidentifier
    DECLARE @MJAIAgents_ConversationSummaryPromptID_ExposeAsAction bit
    DECLARE @MJAIAgents_ConversationSummaryPromptID_ExecutionOrder int
    DECLARE @MJAIAgents_ConversationSummaryPromptID_ExecutionMode nvarchar(20)
    DECLARE @MJAIAgents_ConversationSummaryPromptID_EnableContextCompression bit
    DECLARE @MJAIAgents_ConversationSummaryPromptID_ContextCompressionMessageThreshold int
    DECLARE @MJAIAgents_ConversationSummaryPromptID_ContextCompressionPromptID uniqueidentifier
    DECLARE @MJAIAgents_ConversationSummaryPromptID_ContextCompressionMessageRetentionCount int
    DECLARE @MJAIAgents_ConversationSummaryPromptID_TypeID uniqueidentifier
    DECLARE @MJAIAgents_ConversationSummaryPromptID_Status nvarchar(20)
    DECLARE @MJAIAgents_ConversationSummaryPromptID_DriverClass nvarchar(255)
    DECLARE @MJAIAgents_ConversationSummaryPromptID_IconClass nvarchar(100)
    DECLARE @MJAIAgents_ConversationSummaryPromptID_ModelSelectionMode nvarchar(50)
    DECLARE @MJAIAgents_ConversationSummaryPromptID_PayloadDownstreamPaths nvarchar(MAX)
    DECLARE @MJAIAgents_ConversationSummaryPromptID_PayloadUpstreamPaths nvarchar(MAX)
    DECLARE @MJAIAgents_ConversationSummaryPromptID_PayloadSelfReadPaths nvarchar(MAX)
    DECLARE @MJAIAgents_ConversationSummaryPromptID_PayloadSelfWritePaths nvarchar(MAX)
    DECLARE @MJAIAgents_ConversationSummaryPromptID_PayloadScope nvarchar(MAX)
    DECLARE @MJAIAgents_ConversationSummaryPromptID_FinalPayloadValidation nvarchar(MAX)
    DECLARE @MJAIAgents_ConversationSummaryPromptID_FinalPayloadValidationMode nvarchar(25)
    DECLARE @MJAIAgents_ConversationSummaryPromptID_FinalPayloadValidationMaxRetries int
    DECLARE @MJAIAgents_ConversationSummaryPromptID_MaxCostPerRun decimal(10, 4)
    DECLARE @MJAIAgents_ConversationSummaryPromptID_MaxTokensPerRun int
    DECLARE @MJAIAgents_ConversationSummaryPromptID_MaxIterationsPerRun int
    DECLARE @MJAIAgents_ConversationSummaryPromptID_MaxTimePerRun int
    DECLARE @MJAIAgents_ConversationSummaryPromptID_MinExecutionsPerRun int
    DECLARE @MJAIAgents_ConversationSummaryPromptID_MaxExecutionsPerRun int
    DECLARE @MJAIAgents_ConversationSummaryPromptID_StartingPayloadValidation nvarchar(MAX)
    DECLARE @MJAIAgents_ConversationSummaryPromptID_StartingPayloadValidationMode nvarchar(25)
    DECLARE @MJAIAgents_ConversationSummaryPromptID_DefaultPromptEffortLevel int
    DECLARE @MJAIAgents_ConversationSummaryPromptID_ChatHandlingOption nvarchar(30)
    DECLARE @MJAIAgents_ConversationSummaryPromptID_DefaultArtifactTypeID uniqueidentifier
    DECLARE @MJAIAgents_ConversationSummaryPromptID_OwnerUserID uniqueidentifier
    DECLARE @MJAIAgents_ConversationSummaryPromptID_InvocationMode nvarchar(20)
    DECLARE @MJAIAgents_ConversationSummaryPromptID_ArtifactCreationMode nvarchar(20)
    DECLARE @MJAIAgents_ConversationSummaryPromptID_FunctionalRequirements nvarchar(MAX)
    DECLARE @MJAIAgents_ConversationSummaryPromptID_TechnicalDesign nvarchar(MAX)
    DECLARE @MJAIAgents_ConversationSummaryPromptID_InjectNotes bit
    DECLARE @MJAIAgents_ConversationSummaryPromptID_MaxNotesToInject int
    DECLARE @MJAIAgents_ConversationSummaryPromptID_NoteInjectionStrategy nvarchar(20)
    DECLARE @MJAIAgents_ConversationSummaryPromptID_InjectExamples bit
    DECLARE @MJAIAgents_ConversationSummaryPromptID_MaxExamplesToInject int
    DECLARE @MJAIAgents_ConversationSummaryPromptID_ExampleInjectionStrategy nvarchar(20)
    DECLARE @MJAIAgents_ConversationSummaryPromptID_IsRestricted bit
    DECLARE @MJAIAgents_ConversationSummaryPromptID_MessageMode nvarchar(50)
    DECLARE @MJAIAgents_ConversationSummaryPromptID_MaxMessages int
    DECLARE @MJAIAgents_ConversationSummaryPromptID_AttachmentStorageProviderID uniqueidentifier
    DECLARE @MJAIAgents_ConversationSummaryPromptID_AttachmentRootPath nvarchar(500)
    DECLARE @MJAIAgents_ConversationSummaryPromptID_InlineStorageThresholdBytes int
    DECLARE @MJAIAgents_ConversationSummaryPromptID_AgentTypePromptParams nvarchar(MAX)
    DECLARE @MJAIAgents_ConversationSummaryPromptID_ScopeConfig nvarchar(MAX)
    DECLARE @MJAIAgents_ConversationSummaryPromptID_NoteRetentionDays int
    DECLARE @MJAIAgents_ConversationSummaryPromptID_ExampleRetentionDays int
    DECLARE @MJAIAgents_ConversationSummaryPromptID_AutoArchiveEnabled bit
    DECLARE @MJAIAgents_ConversationSummaryPromptID_RerankerConfiguration nvarchar(MAX)
    DECLARE @MJAIAgents_ConversationSummaryPromptID_CategoryID uniqueidentifier
    DECLARE @MJAIAgents_ConversationSummaryPromptID_AllowEphemeralClientTools bit
    DECLARE @MJAIAgents_ConversationSummaryPromptID_DefaultStorageAccountID uniqueidentifier
    DECLARE @MJAIAgents_ConversationSummaryPromptID_SearchScopeAccess nvarchar(20)
    DECLARE @MJAIAgents_ConversationSummaryPromptID_AcceptUnregisteredFiles bit
    DECLARE @MJAIAgents_ConversationSummaryPromptID_DefaultCoAgentID uniqueidentifier
    DECLARE @MJAIAgents_ConversationSummaryPromptID_TypeConfiguration nvarchar(MAX)
    DECLARE @MJAIAgents_ConversationSummaryPromptID_AllowMemoryWrite bit
    DECLARE @MJAIAgents_ConversationSummaryPromptID_RecordingDefault nvarchar(20)
    DECLARE @MJAIAgents_ConversationSummaryPromptID_RecordingStorageProviderID uniqueidentifier
    DECLARE @MJAIAgents_ConversationSummaryPromptID_DefaultMediaCollectionID uniqueidentifier
    DECLARE @MJAIAgents_ConversationSummaryPromptID_SupportsPlanMode bit
    DECLARE @MJAIAgents_ConversationSummaryPromptID_AcceptsSkills nvarchar(20)
    DECLARE @MJAIAgents_ConversationSummaryPromptID_SkillActivationMode nvarchar(20)
    DECLARE @MJAIAgents_ConversationSummaryPromptID_RequirePlanMode bit
    DECLARE @MJAIAgents_ConversationSummaryPromptID_ContextWindowMaxTokens int
    DECLARE @MJAIAgents_ConversationSummaryPromptID_CompactionTriggerPercent int
    DECLARE @MJAIAgents_ConversationSummaryPromptID_CompactionTargetPercent int
    DECLARE @MJAIAgents_ConversationSummaryPromptID_ConversationSummaryPromptID uniqueidentifier
    DECLARE cascade_update_MJAIAgents_ConversationSummaryPromptID_cursor CURSOR FOR
        SELECT [ID], [Name], [Description], [LogoURL], [ParentID], [ExposeAsAction], [ExecutionOrder], [ExecutionMode], [EnableContextCompression], [ContextCompressionMessageThreshold], [ContextCompressionPromptID], [ContextCompressionMessageRetentionCount], [TypeID], [Status], [DriverClass], [IconClass], [ModelSelectionMode], [PayloadDownstreamPaths], [PayloadUpstreamPaths], [PayloadSelfReadPaths], [PayloadSelfWritePaths], [PayloadScope], [FinalPayloadValidation], [FinalPayloadValidationMode], [FinalPayloadValidationMaxRetries], [MaxCostPerRun], [MaxTokensPerRun], [MaxIterationsPerRun], [MaxTimePerRun], [MinExecutionsPerRun], [MaxExecutionsPerRun], [StartingPayloadValidation], [StartingPayloadValidationMode], [DefaultPromptEffortLevel], [ChatHandlingOption], [DefaultArtifactTypeID], [OwnerUserID], [InvocationMode], [ArtifactCreationMode], [FunctionalRequirements], [TechnicalDesign], [InjectNotes], [MaxNotesToInject], [NoteInjectionStrategy], [InjectExamples], [MaxExamplesToInject], [ExampleInjectionStrategy], [IsRestricted], [MessageMode], [MaxMessages], [AttachmentStorageProviderID], [AttachmentRootPath], [InlineStorageThresholdBytes], [AgentTypePromptParams], [ScopeConfig], [NoteRetentionDays], [ExampleRetentionDays], [AutoArchiveEnabled], [RerankerConfiguration], [CategoryID], [AllowEphemeralClientTools], [DefaultStorageAccountID], [SearchScopeAccess], [AcceptUnregisteredFiles], [DefaultCoAgentID], [TypeConfiguration], [AllowMemoryWrite], [RecordingDefault], [RecordingStorageProviderID], [DefaultMediaCollectionID], [SupportsPlanMode], [AcceptsSkills], [SkillActivationMode], [RequirePlanMode], [ContextWindowMaxTokens], [CompactionTriggerPercent], [CompactionTargetPercent], [ConversationSummaryPromptID]
        FROM [${flyway:defaultSchema}].[AIAgent]
        WHERE [ConversationSummaryPromptID] = @ID

    OPEN cascade_update_MJAIAgents_ConversationSummaryPromptID_cursor
    FETCH NEXT FROM cascade_update_MJAIAgents_ConversationSummaryPromptID_cursor INTO @MJAIAgents_ConversationSummaryPromptIDID, @MJAIAgents_ConversationSummaryPromptID_Name, @MJAIAgents_ConversationSummaryPromptID_Description, @MJAIAgents_ConversationSummaryPromptID_LogoURL, @MJAIAgents_ConversationSummaryPromptID_ParentID, @MJAIAgents_ConversationSummaryPromptID_ExposeAsAction, @MJAIAgents_ConversationSummaryPromptID_ExecutionOrder, @MJAIAgents_ConversationSummaryPromptID_ExecutionMode, @MJAIAgents_ConversationSummaryPromptID_EnableContextCompression, @MJAIAgents_ConversationSummaryPromptID_ContextCompressionMessageThreshold, @MJAIAgents_ConversationSummaryPromptID_ContextCompressionPromptID, @MJAIAgents_ConversationSummaryPromptID_ContextCompressionMessageRetentionCount, @MJAIAgents_ConversationSummaryPromptID_TypeID, @MJAIAgents_ConversationSummaryPromptID_Status, @MJAIAgents_ConversationSummaryPromptID_DriverClass, @MJAIAgents_ConversationSummaryPromptID_IconClass, @MJAIAgents_ConversationSummaryPromptID_ModelSelectionMode, @MJAIAgents_ConversationSummaryPromptID_PayloadDownstreamPaths, @MJAIAgents_ConversationSummaryPromptID_PayloadUpstreamPaths, @MJAIAgents_ConversationSummaryPromptID_PayloadSelfReadPaths, @MJAIAgents_ConversationSummaryPromptID_PayloadSelfWritePaths, @MJAIAgents_ConversationSummaryPromptID_PayloadScope, @MJAIAgents_ConversationSummaryPromptID_FinalPayloadValidation, @MJAIAgents_ConversationSummaryPromptID_FinalPayloadValidationMode, @MJAIAgents_ConversationSummaryPromptID_FinalPayloadValidationMaxRetries, @MJAIAgents_ConversationSummaryPromptID_MaxCostPerRun, @MJAIAgents_ConversationSummaryPromptID_MaxTokensPerRun, @MJAIAgents_ConversationSummaryPromptID_MaxIterationsPerRun, @MJAIAgents_ConversationSummaryPromptID_MaxTimePerRun, @MJAIAgents_ConversationSummaryPromptID_MinExecutionsPerRun, @MJAIAgents_ConversationSummaryPromptID_MaxExecutionsPerRun, @MJAIAgents_ConversationSummaryPromptID_StartingPayloadValidation, @MJAIAgents_ConversationSummaryPromptID_StartingPayloadValidationMode, @MJAIAgents_ConversationSummaryPromptID_DefaultPromptEffortLevel, @MJAIAgents_ConversationSummaryPromptID_ChatHandlingOption, @MJAIAgents_ConversationSummaryPromptID_DefaultArtifactTypeID, @MJAIAgents_ConversationSummaryPromptID_OwnerUserID, @MJAIAgents_ConversationSummaryPromptID_InvocationMode, @MJAIAgents_ConversationSummaryPromptID_ArtifactCreationMode, @MJAIAgents_ConversationSummaryPromptID_FunctionalRequirements, @MJAIAgents_ConversationSummaryPromptID_TechnicalDesign, @MJAIAgents_ConversationSummaryPromptID_InjectNotes, @MJAIAgents_ConversationSummaryPromptID_MaxNotesToInject, @MJAIAgents_ConversationSummaryPromptID_NoteInjectionStrategy, @MJAIAgents_ConversationSummaryPromptID_InjectExamples, @MJAIAgents_ConversationSummaryPromptID_MaxExamplesToInject, @MJAIAgents_ConversationSummaryPromptID_ExampleInjectionStrategy, @MJAIAgents_ConversationSummaryPromptID_IsRestricted, @MJAIAgents_ConversationSummaryPromptID_MessageMode, @MJAIAgents_ConversationSummaryPromptID_MaxMessages, @MJAIAgents_ConversationSummaryPromptID_AttachmentStorageProviderID, @MJAIAgents_ConversationSummaryPromptID_AttachmentRootPath, @MJAIAgents_ConversationSummaryPromptID_InlineStorageThresholdBytes, @MJAIAgents_ConversationSummaryPromptID_AgentTypePromptParams, @MJAIAgents_ConversationSummaryPromptID_ScopeConfig, @MJAIAgents_ConversationSummaryPromptID_NoteRetentionDays, @MJAIAgents_ConversationSummaryPromptID_ExampleRetentionDays, @MJAIAgents_ConversationSummaryPromptID_AutoArchiveEnabled, @MJAIAgents_ConversationSummaryPromptID_RerankerConfiguration, @MJAIAgents_ConversationSummaryPromptID_CategoryID, @MJAIAgents_ConversationSummaryPromptID_AllowEphemeralClientTools, @MJAIAgents_ConversationSummaryPromptID_DefaultStorageAccountID, @MJAIAgents_ConversationSummaryPromptID_SearchScopeAccess, @MJAIAgents_ConversationSummaryPromptID_AcceptUnregisteredFiles, @MJAIAgents_ConversationSummaryPromptID_DefaultCoAgentID, @MJAIAgents_ConversationSummaryPromptID_TypeConfiguration, @MJAIAgents_ConversationSummaryPromptID_AllowMemoryWrite, @MJAIAgents_ConversationSummaryPromptID_RecordingDefault, @MJAIAgents_ConversationSummaryPromptID_RecordingStorageProviderID, @MJAIAgents_ConversationSummaryPromptID_DefaultMediaCollectionID, @MJAIAgents_ConversationSummaryPromptID_SupportsPlanMode, @MJAIAgents_ConversationSummaryPromptID_AcceptsSkills, @MJAIAgents_ConversationSummaryPromptID_SkillActivationMode, @MJAIAgents_ConversationSummaryPromptID_RequirePlanMode, @MJAIAgents_ConversationSummaryPromptID_ContextWindowMaxTokens, @MJAIAgents_ConversationSummaryPromptID_CompactionTriggerPercent, @MJAIAgents_ConversationSummaryPromptID_CompactionTargetPercent, @MJAIAgents_ConversationSummaryPromptID_ConversationSummaryPromptID

    WHILE @@FETCH_STATUS = 0
    BEGIN
        -- Set the FK field to NULL
        SET @MJAIAgents_ConversationSummaryPromptID_ConversationSummaryPromptID = NULL

        -- Call the update SP for the related entity
        EXEC [${flyway:defaultSchema}].[spUpdateAIAgent] @ID = @MJAIAgents_ConversationSummaryPromptIDID, @Name = @MJAIAgents_ConversationSummaryPromptID_Name, @Description = @MJAIAgents_ConversationSummaryPromptID_Description, @LogoURL = @MJAIAgents_ConversationSummaryPromptID_LogoURL, @ParentID = @MJAIAgents_ConversationSummaryPromptID_ParentID, @ExposeAsAction = @MJAIAgents_ConversationSummaryPromptID_ExposeAsAction, @ExecutionOrder = @MJAIAgents_ConversationSummaryPromptID_ExecutionOrder, @ExecutionMode = @MJAIAgents_ConversationSummaryPromptID_ExecutionMode, @EnableContextCompression = @MJAIAgents_ConversationSummaryPromptID_EnableContextCompression, @ContextCompressionMessageThreshold = @MJAIAgents_ConversationSummaryPromptID_ContextCompressionMessageThreshold, @ContextCompressionPromptID = @MJAIAgents_ConversationSummaryPromptID_ContextCompressionPromptID, @ContextCompressionMessageRetentionCount = @MJAIAgents_ConversationSummaryPromptID_ContextCompressionMessageRetentionCount, @TypeID = @MJAIAgents_ConversationSummaryPromptID_TypeID, @Status = @MJAIAgents_ConversationSummaryPromptID_Status, @DriverClass = @MJAIAgents_ConversationSummaryPromptID_DriverClass, @IconClass = @MJAIAgents_ConversationSummaryPromptID_IconClass, @ModelSelectionMode = @MJAIAgents_ConversationSummaryPromptID_ModelSelectionMode, @PayloadDownstreamPaths = @MJAIAgents_ConversationSummaryPromptID_PayloadDownstreamPaths, @PayloadUpstreamPaths = @MJAIAgents_ConversationSummaryPromptID_PayloadUpstreamPaths, @PayloadSelfReadPaths = @MJAIAgents_ConversationSummaryPromptID_PayloadSelfReadPaths, @PayloadSelfWritePaths = @MJAIAgents_ConversationSummaryPromptID_PayloadSelfWritePaths, @PayloadScope = @MJAIAgents_ConversationSummaryPromptID_PayloadScope, @FinalPayloadValidation = @MJAIAgents_ConversationSummaryPromptID_FinalPayloadValidation, @FinalPayloadValidationMode = @MJAIAgents_ConversationSummaryPromptID_FinalPayloadValidationMode, @FinalPayloadValidationMaxRetries = @MJAIAgents_ConversationSummaryPromptID_FinalPayloadValidationMaxRetries, @MaxCostPerRun = @MJAIAgents_ConversationSummaryPromptID_MaxCostPerRun, @MaxTokensPerRun = @MJAIAgents_ConversationSummaryPromptID_MaxTokensPerRun, @MaxIterationsPerRun = @MJAIAgents_ConversationSummaryPromptID_MaxIterationsPerRun, @MaxTimePerRun = @MJAIAgents_ConversationSummaryPromptID_MaxTimePerRun, @MinExecutionsPerRun = @MJAIAgents_ConversationSummaryPromptID_MinExecutionsPerRun, @MaxExecutionsPerRun = @MJAIAgents_ConversationSummaryPromptID_MaxExecutionsPerRun, @StartingPayloadValidation = @MJAIAgents_ConversationSummaryPromptID_StartingPayloadValidation, @StartingPayloadValidationMode = @MJAIAgents_ConversationSummaryPromptID_StartingPayloadValidationMode, @DefaultPromptEffortLevel = @MJAIAgents_ConversationSummaryPromptID_DefaultPromptEffortLevel, @ChatHandlingOption = @MJAIAgents_ConversationSummaryPromptID_ChatHandlingOption, @DefaultArtifactTypeID = @MJAIAgents_ConversationSummaryPromptID_DefaultArtifactTypeID, @OwnerUserID = @MJAIAgents_ConversationSummaryPromptID_OwnerUserID, @InvocationMode = @MJAIAgents_ConversationSummaryPromptID_InvocationMode, @ArtifactCreationMode = @MJAIAgents_ConversationSummaryPromptID_ArtifactCreationMode, @FunctionalRequirements = @MJAIAgents_ConversationSummaryPromptID_FunctionalRequirements, @TechnicalDesign = @MJAIAgents_ConversationSummaryPromptID_TechnicalDesign, @InjectNotes = @MJAIAgents_ConversationSummaryPromptID_InjectNotes, @MaxNotesToInject = @MJAIAgents_ConversationSummaryPromptID_MaxNotesToInject, @NoteInjectionStrategy = @MJAIAgents_ConversationSummaryPromptID_NoteInjectionStrategy, @InjectExamples = @MJAIAgents_ConversationSummaryPromptID_InjectExamples, @MaxExamplesToInject = @MJAIAgents_ConversationSummaryPromptID_MaxExamplesToInject, @ExampleInjectionStrategy = @MJAIAgents_ConversationSummaryPromptID_ExampleInjectionStrategy, @IsRestricted = @MJAIAgents_ConversationSummaryPromptID_IsRestricted, @MessageMode = @MJAIAgents_ConversationSummaryPromptID_MessageMode, @MaxMessages = @MJAIAgents_ConversationSummaryPromptID_MaxMessages, @AttachmentStorageProviderID = @MJAIAgents_ConversationSummaryPromptID_AttachmentStorageProviderID, @AttachmentRootPath = @MJAIAgents_ConversationSummaryPromptID_AttachmentRootPath, @InlineStorageThresholdBytes = @MJAIAgents_ConversationSummaryPromptID_InlineStorageThresholdBytes, @AgentTypePromptParams = @MJAIAgents_ConversationSummaryPromptID_AgentTypePromptParams, @ScopeConfig = @MJAIAgents_ConversationSummaryPromptID_ScopeConfig, @NoteRetentionDays = @MJAIAgents_ConversationSummaryPromptID_NoteRetentionDays, @ExampleRetentionDays = @MJAIAgents_ConversationSummaryPromptID_ExampleRetentionDays, @AutoArchiveEnabled = @MJAIAgents_ConversationSummaryPromptID_AutoArchiveEnabled, @RerankerConfiguration = @MJAIAgents_ConversationSummaryPromptID_RerankerConfiguration, @CategoryID = @MJAIAgents_ConversationSummaryPromptID_CategoryID, @AllowEphemeralClientTools = @MJAIAgents_ConversationSummaryPromptID_AllowEphemeralClientTools, @DefaultStorageAccountID = @MJAIAgents_ConversationSummaryPromptID_DefaultStorageAccountID, @SearchScopeAccess = @MJAIAgents_ConversationSummaryPromptID_SearchScopeAccess, @AcceptUnregisteredFiles = @MJAIAgents_ConversationSummaryPromptID_AcceptUnregisteredFiles, @DefaultCoAgentID = @MJAIAgents_ConversationSummaryPromptID_DefaultCoAgentID, @TypeConfiguration = @MJAIAgents_ConversationSummaryPromptID_TypeConfiguration, @AllowMemoryWrite = @MJAIAgents_ConversationSummaryPromptID_AllowMemoryWrite, @RecordingDefault = @MJAIAgents_ConversationSummaryPromptID_RecordingDefault, @RecordingStorageProviderID = @MJAIAgents_ConversationSummaryPromptID_RecordingStorageProviderID, @DefaultMediaCollectionID = @MJAIAgents_ConversationSummaryPromptID_DefaultMediaCollectionID, @SupportsPlanMode = @MJAIAgents_ConversationSummaryPromptID_SupportsPlanMode, @AcceptsSkills = @MJAIAgents_ConversationSummaryPromptID_AcceptsSkills, @SkillActivationMode = @MJAIAgents_ConversationSummaryPromptID_SkillActivationMode, @RequirePlanMode = @MJAIAgents_ConversationSummaryPromptID_RequirePlanMode, @ContextWindowMaxTokens = @MJAIAgents_ConversationSummaryPromptID_ContextWindowMaxTokens, @CompactionTriggerPercent = @MJAIAgents_ConversationSummaryPromptID_CompactionTriggerPercent, @CompactionTargetPercent = @MJAIAgents_ConversationSummaryPromptID_CompactionTargetPercent, @ConversationSummaryPromptID_Clear = 1, @ConversationSummaryPromptID = @MJAIAgents_ConversationSummaryPromptID_ConversationSummaryPromptID

        FETCH NEXT FROM cascade_update_MJAIAgents_ConversationSummaryPromptID_cursor INTO @MJAIAgents_ConversationSummaryPromptIDID, @MJAIAgents_ConversationSummaryPromptID_Name, @MJAIAgents_ConversationSummaryPromptID_Description, @MJAIAgents_ConversationSummaryPromptID_LogoURL, @MJAIAgents_ConversationSummaryPromptID_ParentID, @MJAIAgents_ConversationSummaryPromptID_ExposeAsAction, @MJAIAgents_ConversationSummaryPromptID_ExecutionOrder, @MJAIAgents_ConversationSummaryPromptID_ExecutionMode, @MJAIAgents_ConversationSummaryPromptID_EnableContextCompression, @MJAIAgents_ConversationSummaryPromptID_ContextCompressionMessageThreshold, @MJAIAgents_ConversationSummaryPromptID_ContextCompressionPromptID, @MJAIAgents_ConversationSummaryPromptID_ContextCompressionMessageRetentionCount, @MJAIAgents_ConversationSummaryPromptID_TypeID, @MJAIAgents_ConversationSummaryPromptID_Status, @MJAIAgents_ConversationSummaryPromptID_DriverClass, @MJAIAgents_ConversationSummaryPromptID_IconClass, @MJAIAgents_ConversationSummaryPromptID_ModelSelectionMode, @MJAIAgents_ConversationSummaryPromptID_PayloadDownstreamPaths, @MJAIAgents_ConversationSummaryPromptID_PayloadUpstreamPaths, @MJAIAgents_ConversationSummaryPromptID_PayloadSelfReadPaths, @MJAIAgents_ConversationSummaryPromptID_PayloadSelfWritePaths, @MJAIAgents_ConversationSummaryPromptID_PayloadScope, @MJAIAgents_ConversationSummaryPromptID_FinalPayloadValidation, @MJAIAgents_ConversationSummaryPromptID_FinalPayloadValidationMode, @MJAIAgents_ConversationSummaryPromptID_FinalPayloadValidationMaxRetries, @MJAIAgents_ConversationSummaryPromptID_MaxCostPerRun, @MJAIAgents_ConversationSummaryPromptID_MaxTokensPerRun, @MJAIAgents_ConversationSummaryPromptID_MaxIterationsPerRun, @MJAIAgents_ConversationSummaryPromptID_MaxTimePerRun, @MJAIAgents_ConversationSummaryPromptID_MinExecutionsPerRun, @MJAIAgents_ConversationSummaryPromptID_MaxExecutionsPerRun, @MJAIAgents_ConversationSummaryPromptID_StartingPayloadValidation, @MJAIAgents_ConversationSummaryPromptID_StartingPayloadValidationMode, @MJAIAgents_ConversationSummaryPromptID_DefaultPromptEffortLevel, @MJAIAgents_ConversationSummaryPromptID_ChatHandlingOption, @MJAIAgents_ConversationSummaryPromptID_DefaultArtifactTypeID, @MJAIAgents_ConversationSummaryPromptID_OwnerUserID, @MJAIAgents_ConversationSummaryPromptID_InvocationMode, @MJAIAgents_ConversationSummaryPromptID_ArtifactCreationMode, @MJAIAgents_ConversationSummaryPromptID_FunctionalRequirements, @MJAIAgents_ConversationSummaryPromptID_TechnicalDesign, @MJAIAgents_ConversationSummaryPromptID_InjectNotes, @MJAIAgents_ConversationSummaryPromptID_MaxNotesToInject, @MJAIAgents_ConversationSummaryPromptID_NoteInjectionStrategy, @MJAIAgents_ConversationSummaryPromptID_InjectExamples, @MJAIAgents_ConversationSummaryPromptID_MaxExamplesToInject, @MJAIAgents_ConversationSummaryPromptID_ExampleInjectionStrategy, @MJAIAgents_ConversationSummaryPromptID_IsRestricted, @MJAIAgents_ConversationSummaryPromptID_MessageMode, @MJAIAgents_ConversationSummaryPromptID_MaxMessages, @MJAIAgents_ConversationSummaryPromptID_AttachmentStorageProviderID, @MJAIAgents_ConversationSummaryPromptID_AttachmentRootPath, @MJAIAgents_ConversationSummaryPromptID_InlineStorageThresholdBytes, @MJAIAgents_ConversationSummaryPromptID_AgentTypePromptParams, @MJAIAgents_ConversationSummaryPromptID_ScopeConfig, @MJAIAgents_ConversationSummaryPromptID_NoteRetentionDays, @MJAIAgents_ConversationSummaryPromptID_ExampleRetentionDays, @MJAIAgents_ConversationSummaryPromptID_AutoArchiveEnabled, @MJAIAgents_ConversationSummaryPromptID_RerankerConfiguration, @MJAIAgents_ConversationSummaryPromptID_CategoryID, @MJAIAgents_ConversationSummaryPromptID_AllowEphemeralClientTools, @MJAIAgents_ConversationSummaryPromptID_DefaultStorageAccountID, @MJAIAgents_ConversationSummaryPromptID_SearchScopeAccess, @MJAIAgents_ConversationSummaryPromptID_AcceptUnregisteredFiles, @MJAIAgents_ConversationSummaryPromptID_DefaultCoAgentID, @MJAIAgents_ConversationSummaryPromptID_TypeConfiguration, @MJAIAgents_ConversationSummaryPromptID_AllowMemoryWrite, @MJAIAgents_ConversationSummaryPromptID_RecordingDefault, @MJAIAgents_ConversationSummaryPromptID_RecordingStorageProviderID, @MJAIAgents_ConversationSummaryPromptID_DefaultMediaCollectionID, @MJAIAgents_ConversationSummaryPromptID_SupportsPlanMode, @MJAIAgents_ConversationSummaryPromptID_AcceptsSkills, @MJAIAgents_ConversationSummaryPromptID_SkillActivationMode, @MJAIAgents_ConversationSummaryPromptID_RequirePlanMode, @MJAIAgents_ConversationSummaryPromptID_ContextWindowMaxTokens, @MJAIAgents_ConversationSummaryPromptID_CompactionTriggerPercent, @MJAIAgents_ConversationSummaryPromptID_CompactionTargetPercent, @MJAIAgents_ConversationSummaryPromptID_ConversationSummaryPromptID
    END

    CLOSE cascade_update_MJAIAgents_ConversationSummaryPromptID_cursor
    DEALLOCATE cascade_update_MJAIAgents_ConversationSummaryPromptID_cursor
    
    -- Cascade update on AIConfiguration using cursor to call spUpdateAIConfiguration
    DECLARE @MJAIConfigurations_DefaultPromptForContextCompressionIDID uniqueidentifier
    DECLARE @MJAIConfigurations_DefaultPromptForContextCompressionID_Name nvarchar(100)
    DECLARE @MJAIConfigurations_DefaultPromptForContextCompressionID_Description nvarchar(MAX)
    DECLARE @MJAIConfigurations_DefaultPromptForContextCompressionID_IsDefault bit
    DECLARE @MJAIConfigurations_DefaultPromptForContextCompressionID_Status nvarchar(20)
    DECLARE @MJAIConfigurations_DefaultPromptForContextCompressionID_DefaultPromptForContextCompressionID uniqueidentifier
    DECLARE @MJAIConfigurations_DefaultPromptForContextCompressionID_DefaultPromptForContextSummarizationID uniqueidentifier
    DECLARE @MJAIConfigurations_DefaultPromptForContextCompressionID_DefaultStorageProviderID uniqueidentifier
    DECLARE @MJAIConfigurations_DefaultPromptForContextCompressionID_DefaultStorageRootPath nvarchar(500)
    DECLARE @MJAIConfigurations_DefaultPromptForContextCompressionID_ParentID uniqueidentifier
    DECLARE cascade_update_MJAIConfigurations_DefaultPromptForContextCompressionID_cursor CURSOR FOR
        SELECT [ID], [Name], [Description], [IsDefault], [Status], [DefaultPromptForContextCompressionID], [DefaultPromptForContextSummarizationID], [DefaultStorageProviderID], [DefaultStorageRootPath], [ParentID]
        FROM [${flyway:defaultSchema}].[AIConfiguration]
        WHERE [DefaultPromptForContextCompressionID] = @ID

    OPEN cascade_update_MJAIConfigurations_DefaultPromptForContextCompressionID_cursor
    FETCH NEXT FROM cascade_update_MJAIConfigurations_DefaultPromptForContextCompressionID_cursor INTO @MJAIConfigurations_DefaultPromptForContextCompressionIDID, @MJAIConfigurations_DefaultPromptForContextCompressionID_Name, @MJAIConfigurations_DefaultPromptForContextCompressionID_Description, @MJAIConfigurations_DefaultPromptForContextCompressionID_IsDefault, @MJAIConfigurations_DefaultPromptForContextCompressionID_Status, @MJAIConfigurations_DefaultPromptForContextCompressionID_DefaultPromptForContextCompressionID, @MJAIConfigurations_DefaultPromptForContextCompressionID_DefaultPromptForContextSummarizationID, @MJAIConfigurations_DefaultPromptForContextCompressionID_DefaultStorageProviderID, @MJAIConfigurations_DefaultPromptForContextCompressionID_DefaultStorageRootPath, @MJAIConfigurations_DefaultPromptForContextCompressionID_ParentID

    WHILE @@FETCH_STATUS = 0
    BEGIN
        -- Set the FK field to NULL
        SET @MJAIConfigurations_DefaultPromptForContextCompressionID_DefaultPromptForContextCompressionID = NULL

        -- Call the update SP for the related entity
        EXEC [${flyway:defaultSchema}].[spUpdateAIConfiguration] @ID = @MJAIConfigurations_DefaultPromptForContextCompressionIDID, @Name = @MJAIConfigurations_DefaultPromptForContextCompressionID_Name, @Description = @MJAIConfigurations_DefaultPromptForContextCompressionID_Description, @IsDefault = @MJAIConfigurations_DefaultPromptForContextCompressionID_IsDefault, @Status = @MJAIConfigurations_DefaultPromptForContextCompressionID_Status, @DefaultPromptForContextCompressionID_Clear = 1, @DefaultPromptForContextCompressionID = @MJAIConfigurations_DefaultPromptForContextCompressionID_DefaultPromptForContextCompressionID, @DefaultPromptForContextSummarizationID = @MJAIConfigurations_DefaultPromptForContextCompressionID_DefaultPromptForContextSummarizationID, @DefaultStorageProviderID = @MJAIConfigurations_DefaultPromptForContextCompressionID_DefaultStorageProviderID, @DefaultStorageRootPath = @MJAIConfigurations_DefaultPromptForContextCompressionID_DefaultStorageRootPath, @ParentID = @MJAIConfigurations_DefaultPromptForContextCompressionID_ParentID

        FETCH NEXT FROM cascade_update_MJAIConfigurations_DefaultPromptForContextCompressionID_cursor INTO @MJAIConfigurations_DefaultPromptForContextCompressionIDID, @MJAIConfigurations_DefaultPromptForContextCompressionID_Name, @MJAIConfigurations_DefaultPromptForContextCompressionID_Description, @MJAIConfigurations_DefaultPromptForContextCompressionID_IsDefault, @MJAIConfigurations_DefaultPromptForContextCompressionID_Status, @MJAIConfigurations_DefaultPromptForContextCompressionID_DefaultPromptForContextCompressionID, @MJAIConfigurations_DefaultPromptForContextCompressionID_DefaultPromptForContextSummarizationID, @MJAIConfigurations_DefaultPromptForContextCompressionID_DefaultStorageProviderID, @MJAIConfigurations_DefaultPromptForContextCompressionID_DefaultStorageRootPath, @MJAIConfigurations_DefaultPromptForContextCompressionID_ParentID
    END

    CLOSE cascade_update_MJAIConfigurations_DefaultPromptForContextCompressionID_cursor
    DEALLOCATE cascade_update_MJAIConfigurations_DefaultPromptForContextCompressionID_cursor
    
    -- Cascade update on AIConfiguration using cursor to call spUpdateAIConfiguration
    DECLARE @MJAIConfigurations_DefaultPromptForContextSummarizationIDID uniqueidentifier
    DECLARE @MJAIConfigurations_DefaultPromptForContextSummarizationID_Name nvarchar(100)
    DECLARE @MJAIConfigurations_DefaultPromptForContextSummarizationID_Description nvarchar(MAX)
    DECLARE @MJAIConfigurations_DefaultPromptForContextSummarizationID_IsDefault bit
    DECLARE @MJAIConfigurations_DefaultPromptForContextSummarizationID_Status nvarchar(20)
    DECLARE @MJAIConfigurations_DefaultPromptForContextSummarizationID_DefaultPromptForContextCompressionID uniqueidentifier
    DECLARE @MJAIConfigurations_DefaultPromptForContextSummarizationID_DefaultPromptForContextSummarizationID uniqueidentifier
    DECLARE @MJAIConfigurations_DefaultPromptForContextSummarizationID_DefaultStorageProviderID uniqueidentifier
    DECLARE @MJAIConfigurations_DefaultPromptForContextSummarizationID_DefaultStorageRootPath nvarchar(500)
    DECLARE @MJAIConfigurations_DefaultPromptForContextSummarizationID_ParentID uniqueidentifier
    DECLARE cascade_update_MJAIConfigurations_DefaultPromptForContextSummarizationID_cursor CURSOR FOR
        SELECT [ID], [Name], [Description], [IsDefault], [Status], [DefaultPromptForContextCompressionID], [DefaultPromptForContextSummarizationID], [DefaultStorageProviderID], [DefaultStorageRootPath], [ParentID]
        FROM [${flyway:defaultSchema}].[AIConfiguration]
        WHERE [DefaultPromptForContextSummarizationID] = @ID

    OPEN cascade_update_MJAIConfigurations_DefaultPromptForContextSummarizationID_cursor
    FETCH NEXT FROM cascade_update_MJAIConfigurations_DefaultPromptForContextSummarizationID_cursor INTO @MJAIConfigurations_DefaultPromptForContextSummarizationIDID, @MJAIConfigurations_DefaultPromptForContextSummarizationID_Name, @MJAIConfigurations_DefaultPromptForContextSummarizationID_Description, @MJAIConfigurations_DefaultPromptForContextSummarizationID_IsDefault, @MJAIConfigurations_DefaultPromptForContextSummarizationID_Status, @MJAIConfigurations_DefaultPromptForContextSummarizationID_DefaultPromptForContextCompressionID, @MJAIConfigurations_DefaultPromptForContextSummarizationID_DefaultPromptForContextSummarizationID, @MJAIConfigurations_DefaultPromptForContextSummarizationID_DefaultStorageProviderID, @MJAIConfigurations_DefaultPromptForContextSummarizationID_DefaultStorageRootPath, @MJAIConfigurations_DefaultPromptForContextSummarizationID_ParentID

    WHILE @@FETCH_STATUS = 0
    BEGIN
        -- Set the FK field to NULL
        SET @MJAIConfigurations_DefaultPromptForContextSummarizationID_DefaultPromptForContextSummarizationID = NULL

        -- Call the update SP for the related entity
        EXEC [${flyway:defaultSchema}].[spUpdateAIConfiguration] @ID = @MJAIConfigurations_DefaultPromptForContextSummarizationIDID, @Name = @MJAIConfigurations_DefaultPromptForContextSummarizationID_Name, @Description = @MJAIConfigurations_DefaultPromptForContextSummarizationID_Description, @IsDefault = @MJAIConfigurations_DefaultPromptForContextSummarizationID_IsDefault, @Status = @MJAIConfigurations_DefaultPromptForContextSummarizationID_Status, @DefaultPromptForContextCompressionID = @MJAIConfigurations_DefaultPromptForContextSummarizationID_DefaultPromptForContextCompressionID, @DefaultPromptForContextSummarizationID_Clear = 1, @DefaultPromptForContextSummarizationID = @MJAIConfigurations_DefaultPromptForContextSummarizationID_DefaultPromptForContextSummarizationID, @DefaultStorageProviderID = @MJAIConfigurations_DefaultPromptForContextSummarizationID_DefaultStorageProviderID, @DefaultStorageRootPath = @MJAIConfigurations_DefaultPromptForContextSummarizationID_DefaultStorageRootPath, @ParentID = @MJAIConfigurations_DefaultPromptForContextSummarizationID_ParentID

        FETCH NEXT FROM cascade_update_MJAIConfigurations_DefaultPromptForContextSummarizationID_cursor INTO @MJAIConfigurations_DefaultPromptForContextSummarizationIDID, @MJAIConfigurations_DefaultPromptForContextSummarizationID_Name, @MJAIConfigurations_DefaultPromptForContextSummarizationID_Description, @MJAIConfigurations_DefaultPromptForContextSummarizationID_IsDefault, @MJAIConfigurations_DefaultPromptForContextSummarizationID_Status, @MJAIConfigurations_DefaultPromptForContextSummarizationID_DefaultPromptForContextCompressionID, @MJAIConfigurations_DefaultPromptForContextSummarizationID_DefaultPromptForContextSummarizationID, @MJAIConfigurations_DefaultPromptForContextSummarizationID_DefaultStorageProviderID, @MJAIConfigurations_DefaultPromptForContextSummarizationID_DefaultStorageRootPath, @MJAIConfigurations_DefaultPromptForContextSummarizationID_ParentID
    END

    CLOSE cascade_update_MJAIConfigurations_DefaultPromptForContextSummarizationID_cursor
    DEALLOCATE cascade_update_MJAIConfigurations_DefaultPromptForContextSummarizationID_cursor
    
    -- Cascade delete from AIPromptModel using cursor to call spDeleteAIPromptModel
    DECLARE @MJAIPromptModels_PromptIDID uniqueidentifier
    DECLARE cascade_delete_MJAIPromptModels_PromptID_cursor CURSOR FOR 
        SELECT [ID]
        FROM [${flyway:defaultSchema}].[AIPromptModel]
        WHERE [PromptID] = @ID
    
    OPEN cascade_delete_MJAIPromptModels_PromptID_cursor
    FETCH NEXT FROM cascade_delete_MJAIPromptModels_PromptID_cursor INTO @MJAIPromptModels_PromptIDID
    
    WHILE @@FETCH_STATUS = 0
    BEGIN
        EXEC [${flyway:defaultSchema}].[spDeleteAIPromptModel] @ID = @MJAIPromptModels_PromptIDID
        
        FETCH NEXT FROM cascade_delete_MJAIPromptModels_PromptID_cursor INTO @MJAIPromptModels_PromptIDID
    END
    
    CLOSE cascade_delete_MJAIPromptModels_PromptID_cursor
    DEALLOCATE cascade_delete_MJAIPromptModels_PromptID_cursor
    
    -- Cascade delete from AIPromptRun using cursor to call spDeleteAIPromptRun
    DECLARE @MJAIPromptRuns_PromptIDID uniqueidentifier
    DECLARE cascade_delete_MJAIPromptRuns_PromptID_cursor CURSOR FOR 
        SELECT [ID]
        FROM [${flyway:defaultSchema}].[AIPromptRun]
        WHERE [PromptID] = @ID
    
    OPEN cascade_delete_MJAIPromptRuns_PromptID_cursor
    FETCH NEXT FROM cascade_delete_MJAIPromptRuns_PromptID_cursor INTO @MJAIPromptRuns_PromptIDID
    
    WHILE @@FETCH_STATUS = 0
    BEGIN
        EXEC [${flyway:defaultSchema}].[spDeleteAIPromptRun] @ID = @MJAIPromptRuns_PromptIDID
        
        FETCH NEXT FROM cascade_delete_MJAIPromptRuns_PromptID_cursor INTO @MJAIPromptRuns_PromptIDID
    END
    
    CLOSE cascade_delete_MJAIPromptRuns_PromptID_cursor
    DEALLOCATE cascade_delete_MJAIPromptRuns_PromptID_cursor
    
    -- Cascade update on AIPromptRun using cursor to call spUpdateAIPromptRun
    DECLARE @MJAIPromptRuns_JudgeIDID uniqueidentifier
    DECLARE @MJAIPromptRuns_JudgeID_PromptID uniqueidentifier
    DECLARE @MJAIPromptRuns_JudgeID_ModelID uniqueidentifier
    DECLARE @MJAIPromptRuns_JudgeID_VendorID uniqueidentifier
    DECLARE @MJAIPromptRuns_JudgeID_AgentID uniqueidentifier
    DECLARE @MJAIPromptRuns_JudgeID_ConfigurationID uniqueidentifier
    DECLARE @MJAIPromptRuns_JudgeID_RunAt datetimeoffset
    DECLARE @MJAIPromptRuns_JudgeID_CompletedAt datetimeoffset
    DECLARE @MJAIPromptRuns_JudgeID_ExecutionTimeMS int
    DECLARE @MJAIPromptRuns_JudgeID_Messages nvarchar(MAX)
    DECLARE @MJAIPromptRuns_JudgeID_Result nvarchar(MAX)
    DECLARE @MJAIPromptRuns_JudgeID_TokensUsed int
    DECLARE @MJAIPromptRuns_JudgeID_TokensPrompt int
    DECLARE @MJAIPromptRuns_JudgeID_TokensCompletion int
    DECLARE @MJAIPromptRuns_JudgeID_TotalCost decimal(18, 6)
    DECLARE @MJAIPromptRuns_JudgeID_Success bit
    DECLARE @MJAIPromptRuns_JudgeID_ErrorMessage nvarchar(MAX)
    DECLARE @MJAIPromptRuns_JudgeID_ParentID uniqueidentifier
    DECLARE @MJAIPromptRuns_JudgeID_RunType nvarchar(20)
    DECLARE @MJAIPromptRuns_JudgeID_ExecutionOrder int
    DECLARE @MJAIPromptRuns_JudgeID_Cost decimal(19, 8)
    DECLARE @MJAIPromptRuns_JudgeID_CostCurrency nvarchar(10)
    DECLARE @MJAIPromptRuns_JudgeID_TokensUsedRollup int
    DECLARE @MJAIPromptRuns_JudgeID_TokensPromptRollup int
    DECLARE @MJAIPromptRuns_JudgeID_TokensCompletionRollup int
    DECLARE @MJAIPromptRuns_JudgeID_Temperature decimal(3, 2)
    DECLARE @MJAIPromptRuns_JudgeID_TopP decimal(3, 2)
    DECLARE @MJAIPromptRuns_JudgeID_TopK int
    DECLARE @MJAIPromptRuns_JudgeID_MinP decimal(3, 2)
    DECLARE @MJAIPromptRuns_JudgeID_FrequencyPenalty decimal(3, 2)
    DECLARE @MJAIPromptRuns_JudgeID_PresencePenalty decimal(3, 2)
    DECLARE @MJAIPromptRuns_JudgeID_Seed int
    DECLARE @MJAIPromptRuns_JudgeID_StopSequences nvarchar(MAX)
    DECLARE @MJAIPromptRuns_JudgeID_ResponseFormat nvarchar(50)
    DECLARE @MJAIPromptRuns_JudgeID_LogProbs bit
    DECLARE @MJAIPromptRuns_JudgeID_TopLogProbs int
    DECLARE @MJAIPromptRuns_JudgeID_DescendantCost decimal(18, 6)
    DECLARE @MJAIPromptRuns_JudgeID_ValidationAttemptCount int
    DECLARE @MJAIPromptRuns_JudgeID_SuccessfulValidationCount int
    DECLARE @MJAIPromptRuns_JudgeID_FinalValidationPassed bit
    DECLARE @MJAIPromptRuns_JudgeID_ValidationBehavior nvarchar(50)
    DECLARE @MJAIPromptRuns_JudgeID_RetryStrategy nvarchar(50)
    DECLARE @MJAIPromptRuns_JudgeID_MaxRetriesConfigured int
    DECLARE @MJAIPromptRuns_JudgeID_FinalValidationError nvarchar(500)
    DECLARE @MJAIPromptRuns_JudgeID_ValidationErrorCount int
    DECLARE @MJAIPromptRuns_JudgeID_CommonValidationError nvarchar(255)
    DECLARE @MJAIPromptRuns_JudgeID_FirstAttemptAt datetimeoffset
    DECLARE @MJAIPromptRuns_JudgeID_LastAttemptAt datetimeoffset
    DECLARE @MJAIPromptRuns_JudgeID_TotalRetryDurationMS int
    DECLARE @MJAIPromptRuns_JudgeID_ValidationAttempts nvarchar(MAX)
    DECLARE @MJAIPromptRuns_JudgeID_ValidationSummary nvarchar(MAX)
    DECLARE @MJAIPromptRuns_JudgeID_FailoverAttempts int
    DECLARE @MJAIPromptRuns_JudgeID_FailoverErrors nvarchar(MAX)
    DECLARE @MJAIPromptRuns_JudgeID_FailoverDurations nvarchar(MAX)
    DECLARE @MJAIPromptRuns_JudgeID_OriginalModelID uniqueidentifier
    DECLARE @MJAIPromptRuns_JudgeID_OriginalRequestStartTime datetimeoffset
    DECLARE @MJAIPromptRuns_JudgeID_TotalFailoverDuration int
    DECLARE @MJAIPromptRuns_JudgeID_RerunFromPromptRunID uniqueidentifier
    DECLARE @MJAIPromptRuns_JudgeID_ModelSelection nvarchar(MAX)
    DECLARE @MJAIPromptRuns_JudgeID_Status nvarchar(50)
    DECLARE @MJAIPromptRuns_JudgeID_Cancelled bit
    DECLARE @MJAIPromptRuns_JudgeID_CancellationReason nvarchar(MAX)
    DECLARE @MJAIPromptRuns_JudgeID_ModelPowerRank int
    DECLARE @MJAIPromptRuns_JudgeID_SelectionStrategy nvarchar(50)
    DECLARE @MJAIPromptRuns_JudgeID_CacheHit bit
    DECLARE @MJAIPromptRuns_JudgeID_CacheKey nvarchar(500)
    DECLARE @MJAIPromptRuns_JudgeID_JudgeID uniqueidentifier
    DECLARE @MJAIPromptRuns_JudgeID_JudgeScore float(53)
    DECLARE @MJAIPromptRuns_JudgeID_WasSelectedResult bit
    DECLARE @MJAIPromptRuns_JudgeID_StreamingEnabled bit
    DECLARE @MJAIPromptRuns_JudgeID_FirstTokenTime int
    DECLARE @MJAIPromptRuns_JudgeID_ErrorDetails nvarchar(MAX)
    DECLARE @MJAIPromptRuns_JudgeID_ChildPromptID uniqueidentifier
    DECLARE @MJAIPromptRuns_JudgeID_QueueTime int
    DECLARE @MJAIPromptRuns_JudgeID_PromptTime int
    DECLARE @MJAIPromptRuns_JudgeID_CompletionTime int
    DECLARE @MJAIPromptRuns_JudgeID_ModelSpecificResponseDetails nvarchar(MAX)
    DECLARE @MJAIPromptRuns_JudgeID_EffortLevel int
    DECLARE @MJAIPromptRuns_JudgeID_RunName nvarchar(255)
    DECLARE @MJAIPromptRuns_JudgeID_Comments nvarchar(MAX)
    DECLARE @MJAIPromptRuns_JudgeID_TestRunID uniqueidentifier
    DECLARE @MJAIPromptRuns_JudgeID_AssistantPrefill nvarchar(MAX)
    DECLARE @MJAIPromptRuns_JudgeID_TokensCacheRead int
    DECLARE @MJAIPromptRuns_JudgeID_TokensCacheWrite int
    DECLARE @MJAIPromptRuns_JudgeID_TokensCacheReadRollup int
    DECLARE @MJAIPromptRuns_JudgeID_TokensCacheWriteRollup int
    DECLARE cascade_update_MJAIPromptRuns_JudgeID_cursor CURSOR FOR
        SELECT [ID], [PromptID], [ModelID], [VendorID], [AgentID], [ConfigurationID], [RunAt], [CompletedAt], [ExecutionTimeMS], [Messages], [Result], [TokensUsed], [TokensPrompt], [TokensCompletion], [TotalCost], [Success], [ErrorMessage], [ParentID], [RunType], [ExecutionOrder], [Cost], [CostCurrency], [TokensUsedRollup], [TokensPromptRollup], [TokensCompletionRollup], [Temperature], [TopP], [TopK], [MinP], [FrequencyPenalty], [PresencePenalty], [Seed], [StopSequences], [ResponseFormat], [LogProbs], [TopLogProbs], [DescendantCost], [ValidationAttemptCount], [SuccessfulValidationCount], [FinalValidationPassed], [ValidationBehavior], [RetryStrategy], [MaxRetriesConfigured], [FinalValidationError], [ValidationErrorCount], [CommonValidationError], [FirstAttemptAt], [LastAttemptAt], [TotalRetryDurationMS], [ValidationAttempts], [ValidationSummary], [FailoverAttempts], [FailoverErrors], [FailoverDurations], [OriginalModelID], [OriginalRequestStartTime], [TotalFailoverDuration], [RerunFromPromptRunID], [ModelSelection], [Status], [Cancelled], [CancellationReason], [ModelPowerRank], [SelectionStrategy], [CacheHit], [CacheKey], [JudgeID], [JudgeScore], [WasSelectedResult], [StreamingEnabled], [FirstTokenTime], [ErrorDetails], [ChildPromptID], [QueueTime], [PromptTime], [CompletionTime], [ModelSpecificResponseDetails], [EffortLevel], [RunName], [Comments], [TestRunID], [AssistantPrefill], [TokensCacheRead], [TokensCacheWrite], [TokensCacheReadRollup], [TokensCacheWriteRollup]
        FROM [${flyway:defaultSchema}].[AIPromptRun]
        WHERE [JudgeID] = @ID

    OPEN cascade_update_MJAIPromptRuns_JudgeID_cursor
    FETCH NEXT FROM cascade_update_MJAIPromptRuns_JudgeID_cursor INTO @MJAIPromptRuns_JudgeIDID, @MJAIPromptRuns_JudgeID_PromptID, @MJAIPromptRuns_JudgeID_ModelID, @MJAIPromptRuns_JudgeID_VendorID, @MJAIPromptRuns_JudgeID_AgentID, @MJAIPromptRuns_JudgeID_ConfigurationID, @MJAIPromptRuns_JudgeID_RunAt, @MJAIPromptRuns_JudgeID_CompletedAt, @MJAIPromptRuns_JudgeID_ExecutionTimeMS, @MJAIPromptRuns_JudgeID_Messages, @MJAIPromptRuns_JudgeID_Result, @MJAIPromptRuns_JudgeID_TokensUsed, @MJAIPromptRuns_JudgeID_TokensPrompt, @MJAIPromptRuns_JudgeID_TokensCompletion, @MJAIPromptRuns_JudgeID_TotalCost, @MJAIPromptRuns_JudgeID_Success, @MJAIPromptRuns_JudgeID_ErrorMessage, @MJAIPromptRuns_JudgeID_ParentID, @MJAIPromptRuns_JudgeID_RunType, @MJAIPromptRuns_JudgeID_ExecutionOrder, @MJAIPromptRuns_JudgeID_Cost, @MJAIPromptRuns_JudgeID_CostCurrency, @MJAIPromptRuns_JudgeID_TokensUsedRollup, @MJAIPromptRuns_JudgeID_TokensPromptRollup, @MJAIPromptRuns_JudgeID_TokensCompletionRollup, @MJAIPromptRuns_JudgeID_Temperature, @MJAIPromptRuns_JudgeID_TopP, @MJAIPromptRuns_JudgeID_TopK, @MJAIPromptRuns_JudgeID_MinP, @MJAIPromptRuns_JudgeID_FrequencyPenalty, @MJAIPromptRuns_JudgeID_PresencePenalty, @MJAIPromptRuns_JudgeID_Seed, @MJAIPromptRuns_JudgeID_StopSequences, @MJAIPromptRuns_JudgeID_ResponseFormat, @MJAIPromptRuns_JudgeID_LogProbs, @MJAIPromptRuns_JudgeID_TopLogProbs, @MJAIPromptRuns_JudgeID_DescendantCost, @MJAIPromptRuns_JudgeID_ValidationAttemptCount, @MJAIPromptRuns_JudgeID_SuccessfulValidationCount, @MJAIPromptRuns_JudgeID_FinalValidationPassed, @MJAIPromptRuns_JudgeID_ValidationBehavior, @MJAIPromptRuns_JudgeID_RetryStrategy, @MJAIPromptRuns_JudgeID_MaxRetriesConfigured, @MJAIPromptRuns_JudgeID_FinalValidationError, @MJAIPromptRuns_JudgeID_ValidationErrorCount, @MJAIPromptRuns_JudgeID_CommonValidationError, @MJAIPromptRuns_JudgeID_FirstAttemptAt, @MJAIPromptRuns_JudgeID_LastAttemptAt, @MJAIPromptRuns_JudgeID_TotalRetryDurationMS, @MJAIPromptRuns_JudgeID_ValidationAttempts, @MJAIPromptRuns_JudgeID_ValidationSummary, @MJAIPromptRuns_JudgeID_FailoverAttempts, @MJAIPromptRuns_JudgeID_FailoverErrors, @MJAIPromptRuns_JudgeID_FailoverDurations, @MJAIPromptRuns_JudgeID_OriginalModelID, @MJAIPromptRuns_JudgeID_OriginalRequestStartTime, @MJAIPromptRuns_JudgeID_TotalFailoverDuration, @MJAIPromptRuns_JudgeID_RerunFromPromptRunID, @MJAIPromptRuns_JudgeID_ModelSelection, @MJAIPromptRuns_JudgeID_Status, @MJAIPromptRuns_JudgeID_Cancelled, @MJAIPromptRuns_JudgeID_CancellationReason, @MJAIPromptRuns_JudgeID_ModelPowerRank, @MJAIPromptRuns_JudgeID_SelectionStrategy, @MJAIPromptRuns_JudgeID_CacheHit, @MJAIPromptRuns_JudgeID_CacheKey, @MJAIPromptRuns_JudgeID_JudgeID, @MJAIPromptRuns_JudgeID_JudgeScore, @MJAIPromptRuns_JudgeID_WasSelectedResult, @MJAIPromptRuns_JudgeID_StreamingEnabled, @MJAIPromptRuns_JudgeID_FirstTokenTime, @MJAIPromptRuns_JudgeID_ErrorDetails, @MJAIPromptRuns_JudgeID_ChildPromptID, @MJAIPromptRuns_JudgeID_QueueTime, @MJAIPromptRuns_JudgeID_PromptTime, @MJAIPromptRuns_JudgeID_CompletionTime, @MJAIPromptRuns_JudgeID_ModelSpecificResponseDetails, @MJAIPromptRuns_JudgeID_EffortLevel, @MJAIPromptRuns_JudgeID_RunName, @MJAIPromptRuns_JudgeID_Comments, @MJAIPromptRuns_JudgeID_TestRunID, @MJAIPromptRuns_JudgeID_AssistantPrefill, @MJAIPromptRuns_JudgeID_TokensCacheRead, @MJAIPromptRuns_JudgeID_TokensCacheWrite, @MJAIPromptRuns_JudgeID_TokensCacheReadRollup, @MJAIPromptRuns_JudgeID_TokensCacheWriteRollup

    WHILE @@FETCH_STATUS = 0
    BEGIN
        -- Set the FK field to NULL
        SET @MJAIPromptRuns_JudgeID_JudgeID = NULL

        -- Call the update SP for the related entity
        EXEC [${flyway:defaultSchema}].[spUpdateAIPromptRun] @ID = @MJAIPromptRuns_JudgeIDID, @PromptID = @MJAIPromptRuns_JudgeID_PromptID, @ModelID = @MJAIPromptRuns_JudgeID_ModelID, @VendorID = @MJAIPromptRuns_JudgeID_VendorID, @AgentID = @MJAIPromptRuns_JudgeID_AgentID, @ConfigurationID = @MJAIPromptRuns_JudgeID_ConfigurationID, @RunAt = @MJAIPromptRuns_JudgeID_RunAt, @CompletedAt = @MJAIPromptRuns_JudgeID_CompletedAt, @ExecutionTimeMS = @MJAIPromptRuns_JudgeID_ExecutionTimeMS, @Messages = @MJAIPromptRuns_JudgeID_Messages, @Result = @MJAIPromptRuns_JudgeID_Result, @TokensUsed = @MJAIPromptRuns_JudgeID_TokensUsed, @TokensPrompt = @MJAIPromptRuns_JudgeID_TokensPrompt, @TokensCompletion = @MJAIPromptRuns_JudgeID_TokensCompletion, @TotalCost = @MJAIPromptRuns_JudgeID_TotalCost, @Success = @MJAIPromptRuns_JudgeID_Success, @ErrorMessage = @MJAIPromptRuns_JudgeID_ErrorMessage, @ParentID = @MJAIPromptRuns_JudgeID_ParentID, @RunType = @MJAIPromptRuns_JudgeID_RunType, @ExecutionOrder = @MJAIPromptRuns_JudgeID_ExecutionOrder, @Cost = @MJAIPromptRuns_JudgeID_Cost, @CostCurrency = @MJAIPromptRuns_JudgeID_CostCurrency, @TokensUsedRollup = @MJAIPromptRuns_JudgeID_TokensUsedRollup, @TokensPromptRollup = @MJAIPromptRuns_JudgeID_TokensPromptRollup, @TokensCompletionRollup = @MJAIPromptRuns_JudgeID_TokensCompletionRollup, @Temperature = @MJAIPromptRuns_JudgeID_Temperature, @TopP = @MJAIPromptRuns_JudgeID_TopP, @TopK = @MJAIPromptRuns_JudgeID_TopK, @MinP = @MJAIPromptRuns_JudgeID_MinP, @FrequencyPenalty = @MJAIPromptRuns_JudgeID_FrequencyPenalty, @PresencePenalty = @MJAIPromptRuns_JudgeID_PresencePenalty, @Seed = @MJAIPromptRuns_JudgeID_Seed, @StopSequences = @MJAIPromptRuns_JudgeID_StopSequences, @ResponseFormat = @MJAIPromptRuns_JudgeID_ResponseFormat, @LogProbs = @MJAIPromptRuns_JudgeID_LogProbs, @TopLogProbs = @MJAIPromptRuns_JudgeID_TopLogProbs, @DescendantCost = @MJAIPromptRuns_JudgeID_DescendantCost, @ValidationAttemptCount = @MJAIPromptRuns_JudgeID_ValidationAttemptCount, @SuccessfulValidationCount = @MJAIPromptRuns_JudgeID_SuccessfulValidationCount, @FinalValidationPassed = @MJAIPromptRuns_JudgeID_FinalValidationPassed, @ValidationBehavior = @MJAIPromptRuns_JudgeID_ValidationBehavior, @RetryStrategy = @MJAIPromptRuns_JudgeID_RetryStrategy, @MaxRetriesConfigured = @MJAIPromptRuns_JudgeID_MaxRetriesConfigured, @FinalValidationError = @MJAIPromptRuns_JudgeID_FinalValidationError, @ValidationErrorCount = @MJAIPromptRuns_JudgeID_ValidationErrorCount, @CommonValidationError = @MJAIPromptRuns_JudgeID_CommonValidationError, @FirstAttemptAt = @MJAIPromptRuns_JudgeID_FirstAttemptAt, @LastAttemptAt = @MJAIPromptRuns_JudgeID_LastAttemptAt, @TotalRetryDurationMS = @MJAIPromptRuns_JudgeID_TotalRetryDurationMS, @ValidationAttempts = @MJAIPromptRuns_JudgeID_ValidationAttempts, @ValidationSummary = @MJAIPromptRuns_JudgeID_ValidationSummary, @FailoverAttempts = @MJAIPromptRuns_JudgeID_FailoverAttempts, @FailoverErrors = @MJAIPromptRuns_JudgeID_FailoverErrors, @FailoverDurations = @MJAIPromptRuns_JudgeID_FailoverDurations, @OriginalModelID = @MJAIPromptRuns_JudgeID_OriginalModelID, @OriginalRequestStartTime = @MJAIPromptRuns_JudgeID_OriginalRequestStartTime, @TotalFailoverDuration = @MJAIPromptRuns_JudgeID_TotalFailoverDuration, @RerunFromPromptRunID = @MJAIPromptRuns_JudgeID_RerunFromPromptRunID, @ModelSelection = @MJAIPromptRuns_JudgeID_ModelSelection, @Status = @MJAIPromptRuns_JudgeID_Status, @Cancelled = @MJAIPromptRuns_JudgeID_Cancelled, @CancellationReason = @MJAIPromptRuns_JudgeID_CancellationReason, @ModelPowerRank = @MJAIPromptRuns_JudgeID_ModelPowerRank, @SelectionStrategy = @MJAIPromptRuns_JudgeID_SelectionStrategy, @CacheHit = @MJAIPromptRuns_JudgeID_CacheHit, @CacheKey = @MJAIPromptRuns_JudgeID_CacheKey, @JudgeID_Clear = 1, @JudgeID = @MJAIPromptRuns_JudgeID_JudgeID, @JudgeScore = @MJAIPromptRuns_JudgeID_JudgeScore, @WasSelectedResult = @MJAIPromptRuns_JudgeID_WasSelectedResult, @StreamingEnabled = @MJAIPromptRuns_JudgeID_StreamingEnabled, @FirstTokenTime = @MJAIPromptRuns_JudgeID_FirstTokenTime, @ErrorDetails = @MJAIPromptRuns_JudgeID_ErrorDetails, @ChildPromptID = @MJAIPromptRuns_JudgeID_ChildPromptID, @QueueTime = @MJAIPromptRuns_JudgeID_QueueTime, @PromptTime = @MJAIPromptRuns_JudgeID_PromptTime, @CompletionTime = @MJAIPromptRuns_JudgeID_CompletionTime, @ModelSpecificResponseDetails = @MJAIPromptRuns_JudgeID_ModelSpecificResponseDetails, @EffortLevel = @MJAIPromptRuns_JudgeID_EffortLevel, @RunName = @MJAIPromptRuns_JudgeID_RunName, @Comments = @MJAIPromptRuns_JudgeID_Comments, @TestRunID = @MJAIPromptRuns_JudgeID_TestRunID, @AssistantPrefill = @MJAIPromptRuns_JudgeID_AssistantPrefill, @TokensCacheRead = @MJAIPromptRuns_JudgeID_TokensCacheRead, @TokensCacheWrite = @MJAIPromptRuns_JudgeID_TokensCacheWrite, @TokensCacheReadRollup = @MJAIPromptRuns_JudgeID_TokensCacheReadRollup, @TokensCacheWriteRollup = @MJAIPromptRuns_JudgeID_TokensCacheWriteRollup

        FETCH NEXT FROM cascade_update_MJAIPromptRuns_JudgeID_cursor INTO @MJAIPromptRuns_JudgeIDID, @MJAIPromptRuns_JudgeID_PromptID, @MJAIPromptRuns_JudgeID_ModelID, @MJAIPromptRuns_JudgeID_VendorID, @MJAIPromptRuns_JudgeID_AgentID, @MJAIPromptRuns_JudgeID_ConfigurationID, @MJAIPromptRuns_JudgeID_RunAt, @MJAIPromptRuns_JudgeID_CompletedAt, @MJAIPromptRuns_JudgeID_ExecutionTimeMS, @MJAIPromptRuns_JudgeID_Messages, @MJAIPromptRuns_JudgeID_Result, @MJAIPromptRuns_JudgeID_TokensUsed, @MJAIPromptRuns_JudgeID_TokensPrompt, @MJAIPromptRuns_JudgeID_TokensCompletion, @MJAIPromptRuns_JudgeID_TotalCost, @MJAIPromptRuns_JudgeID_Success, @MJAIPromptRuns_JudgeID_ErrorMessage, @MJAIPromptRuns_JudgeID_ParentID, @MJAIPromptRuns_JudgeID_RunType, @MJAIPromptRuns_JudgeID_ExecutionOrder, @MJAIPromptRuns_JudgeID_Cost, @MJAIPromptRuns_JudgeID_CostCurrency, @MJAIPromptRuns_JudgeID_TokensUsedRollup, @MJAIPromptRuns_JudgeID_TokensPromptRollup, @MJAIPromptRuns_JudgeID_TokensCompletionRollup, @MJAIPromptRuns_JudgeID_Temperature, @MJAIPromptRuns_JudgeID_TopP, @MJAIPromptRuns_JudgeID_TopK, @MJAIPromptRuns_JudgeID_MinP, @MJAIPromptRuns_JudgeID_FrequencyPenalty, @MJAIPromptRuns_JudgeID_PresencePenalty, @MJAIPromptRuns_JudgeID_Seed, @MJAIPromptRuns_JudgeID_StopSequences, @MJAIPromptRuns_JudgeID_ResponseFormat, @MJAIPromptRuns_JudgeID_LogProbs, @MJAIPromptRuns_JudgeID_TopLogProbs, @MJAIPromptRuns_JudgeID_DescendantCost, @MJAIPromptRuns_JudgeID_ValidationAttemptCount, @MJAIPromptRuns_JudgeID_SuccessfulValidationCount, @MJAIPromptRuns_JudgeID_FinalValidationPassed, @MJAIPromptRuns_JudgeID_ValidationBehavior, @MJAIPromptRuns_JudgeID_RetryStrategy, @MJAIPromptRuns_JudgeID_MaxRetriesConfigured, @MJAIPromptRuns_JudgeID_FinalValidationError, @MJAIPromptRuns_JudgeID_ValidationErrorCount, @MJAIPromptRuns_JudgeID_CommonValidationError, @MJAIPromptRuns_JudgeID_FirstAttemptAt, @MJAIPromptRuns_JudgeID_LastAttemptAt, @MJAIPromptRuns_JudgeID_TotalRetryDurationMS, @MJAIPromptRuns_JudgeID_ValidationAttempts, @MJAIPromptRuns_JudgeID_ValidationSummary, @MJAIPromptRuns_JudgeID_FailoverAttempts, @MJAIPromptRuns_JudgeID_FailoverErrors, @MJAIPromptRuns_JudgeID_FailoverDurations, @MJAIPromptRuns_JudgeID_OriginalModelID, @MJAIPromptRuns_JudgeID_OriginalRequestStartTime, @MJAIPromptRuns_JudgeID_TotalFailoverDuration, @MJAIPromptRuns_JudgeID_RerunFromPromptRunID, @MJAIPromptRuns_JudgeID_ModelSelection, @MJAIPromptRuns_JudgeID_Status, @MJAIPromptRuns_JudgeID_Cancelled, @MJAIPromptRuns_JudgeID_CancellationReason, @MJAIPromptRuns_JudgeID_ModelPowerRank, @MJAIPromptRuns_JudgeID_SelectionStrategy, @MJAIPromptRuns_JudgeID_CacheHit, @MJAIPromptRuns_JudgeID_CacheKey, @MJAIPromptRuns_JudgeID_JudgeID, @MJAIPromptRuns_JudgeID_JudgeScore, @MJAIPromptRuns_JudgeID_WasSelectedResult, @MJAIPromptRuns_JudgeID_StreamingEnabled, @MJAIPromptRuns_JudgeID_FirstTokenTime, @MJAIPromptRuns_JudgeID_ErrorDetails, @MJAIPromptRuns_JudgeID_ChildPromptID, @MJAIPromptRuns_JudgeID_QueueTime, @MJAIPromptRuns_JudgeID_PromptTime, @MJAIPromptRuns_JudgeID_CompletionTime, @MJAIPromptRuns_JudgeID_ModelSpecificResponseDetails, @MJAIPromptRuns_JudgeID_EffortLevel, @MJAIPromptRuns_JudgeID_RunName, @MJAIPromptRuns_JudgeID_Comments, @MJAIPromptRuns_JudgeID_TestRunID, @MJAIPromptRuns_JudgeID_AssistantPrefill, @MJAIPromptRuns_JudgeID_TokensCacheRead, @MJAIPromptRuns_JudgeID_TokensCacheWrite, @MJAIPromptRuns_JudgeID_TokensCacheReadRollup, @MJAIPromptRuns_JudgeID_TokensCacheWriteRollup
    END

    CLOSE cascade_update_MJAIPromptRuns_JudgeID_cursor
    DEALLOCATE cascade_update_MJAIPromptRuns_JudgeID_cursor
    
    -- Cascade update on AIPromptRun using cursor to call spUpdateAIPromptRun
    DECLARE @MJAIPromptRuns_ChildPromptIDID uniqueidentifier
    DECLARE @MJAIPromptRuns_ChildPromptID_PromptID uniqueidentifier
    DECLARE @MJAIPromptRuns_ChildPromptID_ModelID uniqueidentifier
    DECLARE @MJAIPromptRuns_ChildPromptID_VendorID uniqueidentifier
    DECLARE @MJAIPromptRuns_ChildPromptID_AgentID uniqueidentifier
    DECLARE @MJAIPromptRuns_ChildPromptID_ConfigurationID uniqueidentifier
    DECLARE @MJAIPromptRuns_ChildPromptID_RunAt datetimeoffset
    DECLARE @MJAIPromptRuns_ChildPromptID_CompletedAt datetimeoffset
    DECLARE @MJAIPromptRuns_ChildPromptID_ExecutionTimeMS int
    DECLARE @MJAIPromptRuns_ChildPromptID_Messages nvarchar(MAX)
    DECLARE @MJAIPromptRuns_ChildPromptID_Result nvarchar(MAX)
    DECLARE @MJAIPromptRuns_ChildPromptID_TokensUsed int
    DECLARE @MJAIPromptRuns_ChildPromptID_TokensPrompt int
    DECLARE @MJAIPromptRuns_ChildPromptID_TokensCompletion int
    DECLARE @MJAIPromptRuns_ChildPromptID_TotalCost decimal(18, 6)
    DECLARE @MJAIPromptRuns_ChildPromptID_Success bit
    DECLARE @MJAIPromptRuns_ChildPromptID_ErrorMessage nvarchar(MAX)
    DECLARE @MJAIPromptRuns_ChildPromptID_ParentID uniqueidentifier
    DECLARE @MJAIPromptRuns_ChildPromptID_RunType nvarchar(20)
    DECLARE @MJAIPromptRuns_ChildPromptID_ExecutionOrder int
    DECLARE @MJAIPromptRuns_ChildPromptID_Cost decimal(19, 8)
    DECLARE @MJAIPromptRuns_ChildPromptID_CostCurrency nvarchar(10)
    DECLARE @MJAIPromptRuns_ChildPromptID_TokensUsedRollup int
    DECLARE @MJAIPromptRuns_ChildPromptID_TokensPromptRollup int
    DECLARE @MJAIPromptRuns_ChildPromptID_TokensCompletionRollup int
    DECLARE @MJAIPromptRuns_ChildPromptID_Temperature decimal(3, 2)
    DECLARE @MJAIPromptRuns_ChildPromptID_TopP decimal(3, 2)
    DECLARE @MJAIPromptRuns_ChildPromptID_TopK int
    DECLARE @MJAIPromptRuns_ChildPromptID_MinP decimal(3, 2)
    DECLARE @MJAIPromptRuns_ChildPromptID_FrequencyPenalty decimal(3, 2)
    DECLARE @MJAIPromptRuns_ChildPromptID_PresencePenalty decimal(3, 2)
    DECLARE @MJAIPromptRuns_ChildPromptID_Seed int
    DECLARE @MJAIPromptRuns_ChildPromptID_StopSequences nvarchar(MAX)
    DECLARE @MJAIPromptRuns_ChildPromptID_ResponseFormat nvarchar(50)
    DECLARE @MJAIPromptRuns_ChildPromptID_LogProbs bit
    DECLARE @MJAIPromptRuns_ChildPromptID_TopLogProbs int
    DECLARE @MJAIPromptRuns_ChildPromptID_DescendantCost decimal(18, 6)
    DECLARE @MJAIPromptRuns_ChildPromptID_ValidationAttemptCount int
    DECLARE @MJAIPromptRuns_ChildPromptID_SuccessfulValidationCount int
    DECLARE @MJAIPromptRuns_ChildPromptID_FinalValidationPassed bit
    DECLARE @MJAIPromptRuns_ChildPromptID_ValidationBehavior nvarchar(50)
    DECLARE @MJAIPromptRuns_ChildPromptID_RetryStrategy nvarchar(50)
    DECLARE @MJAIPromptRuns_ChildPromptID_MaxRetriesConfigured int
    DECLARE @MJAIPromptRuns_ChildPromptID_FinalValidationError nvarchar(500)
    DECLARE @MJAIPromptRuns_ChildPromptID_ValidationErrorCount int
    DECLARE @MJAIPromptRuns_ChildPromptID_CommonValidationError nvarchar(255)
    DECLARE @MJAIPromptRuns_ChildPromptID_FirstAttemptAt datetimeoffset
    DECLARE @MJAIPromptRuns_ChildPromptID_LastAttemptAt datetimeoffset
    DECLARE @MJAIPromptRuns_ChildPromptID_TotalRetryDurationMS int
    DECLARE @MJAIPromptRuns_ChildPromptID_ValidationAttempts nvarchar(MAX)
    DECLARE @MJAIPromptRuns_ChildPromptID_ValidationSummary nvarchar(MAX)
    DECLARE @MJAIPromptRuns_ChildPromptID_FailoverAttempts int
    DECLARE @MJAIPromptRuns_ChildPromptID_FailoverErrors nvarchar(MAX)
    DECLARE @MJAIPromptRuns_ChildPromptID_FailoverDurations nvarchar(MAX)
    DECLARE @MJAIPromptRuns_ChildPromptID_OriginalModelID uniqueidentifier
    DECLARE @MJAIPromptRuns_ChildPromptID_OriginalRequestStartTime datetimeoffset
    DECLARE @MJAIPromptRuns_ChildPromptID_TotalFailoverDuration int
    DECLARE @MJAIPromptRuns_ChildPromptID_RerunFromPromptRunID uniqueidentifier
    DECLARE @MJAIPromptRuns_ChildPromptID_ModelSelection nvarchar(MAX)
    DECLARE @MJAIPromptRuns_ChildPromptID_Status nvarchar(50)
    DECLARE @MJAIPromptRuns_ChildPromptID_Cancelled bit
    DECLARE @MJAIPromptRuns_ChildPromptID_CancellationReason nvarchar(MAX)
    DECLARE @MJAIPromptRuns_ChildPromptID_ModelPowerRank int
    DECLARE @MJAIPromptRuns_ChildPromptID_SelectionStrategy nvarchar(50)
    DECLARE @MJAIPromptRuns_ChildPromptID_CacheHit bit
    DECLARE @MJAIPromptRuns_ChildPromptID_CacheKey nvarchar(500)
    DECLARE @MJAIPromptRuns_ChildPromptID_JudgeID uniqueidentifier
    DECLARE @MJAIPromptRuns_ChildPromptID_JudgeScore float(53)
    DECLARE @MJAIPromptRuns_ChildPromptID_WasSelectedResult bit
    DECLARE @MJAIPromptRuns_ChildPromptID_StreamingEnabled bit
    DECLARE @MJAIPromptRuns_ChildPromptID_FirstTokenTime int
    DECLARE @MJAIPromptRuns_ChildPromptID_ErrorDetails nvarchar(MAX)
    DECLARE @MJAIPromptRuns_ChildPromptID_ChildPromptID uniqueidentifier
    DECLARE @MJAIPromptRuns_ChildPromptID_QueueTime int
    DECLARE @MJAIPromptRuns_ChildPromptID_PromptTime int
    DECLARE @MJAIPromptRuns_ChildPromptID_CompletionTime int
    DECLARE @MJAIPromptRuns_ChildPromptID_ModelSpecificResponseDetails nvarchar(MAX)
    DECLARE @MJAIPromptRuns_ChildPromptID_EffortLevel int
    DECLARE @MJAIPromptRuns_ChildPromptID_RunName nvarchar(255)
    DECLARE @MJAIPromptRuns_ChildPromptID_Comments nvarchar(MAX)
    DECLARE @MJAIPromptRuns_ChildPromptID_TestRunID uniqueidentifier
    DECLARE @MJAIPromptRuns_ChildPromptID_AssistantPrefill nvarchar(MAX)
    DECLARE @MJAIPromptRuns_ChildPromptID_TokensCacheRead int
    DECLARE @MJAIPromptRuns_ChildPromptID_TokensCacheWrite int
    DECLARE @MJAIPromptRuns_ChildPromptID_TokensCacheReadRollup int
    DECLARE @MJAIPromptRuns_ChildPromptID_TokensCacheWriteRollup int
    DECLARE cascade_update_MJAIPromptRuns_ChildPromptID_cursor CURSOR FOR
        SELECT [ID], [PromptID], [ModelID], [VendorID], [AgentID], [ConfigurationID], [RunAt], [CompletedAt], [ExecutionTimeMS], [Messages], [Result], [TokensUsed], [TokensPrompt], [TokensCompletion], [TotalCost], [Success], [ErrorMessage], [ParentID], [RunType], [ExecutionOrder], [Cost], [CostCurrency], [TokensUsedRollup], [TokensPromptRollup], [TokensCompletionRollup], [Temperature], [TopP], [TopK], [MinP], [FrequencyPenalty], [PresencePenalty], [Seed], [StopSequences], [ResponseFormat], [LogProbs], [TopLogProbs], [DescendantCost], [ValidationAttemptCount], [SuccessfulValidationCount], [FinalValidationPassed], [ValidationBehavior], [RetryStrategy], [MaxRetriesConfigured], [FinalValidationError], [ValidationErrorCount], [CommonValidationError], [FirstAttemptAt], [LastAttemptAt], [TotalRetryDurationMS], [ValidationAttempts], [ValidationSummary], [FailoverAttempts], [FailoverErrors], [FailoverDurations], [OriginalModelID], [OriginalRequestStartTime], [TotalFailoverDuration], [RerunFromPromptRunID], [ModelSelection], [Status], [Cancelled], [CancellationReason], [ModelPowerRank], [SelectionStrategy], [CacheHit], [CacheKey], [JudgeID], [JudgeScore], [WasSelectedResult], [StreamingEnabled], [FirstTokenTime], [ErrorDetails], [ChildPromptID], [QueueTime], [PromptTime], [CompletionTime], [ModelSpecificResponseDetails], [EffortLevel], [RunName], [Comments], [TestRunID], [AssistantPrefill], [TokensCacheRead], [TokensCacheWrite], [TokensCacheReadRollup], [TokensCacheWriteRollup]
        FROM [${flyway:defaultSchema}].[AIPromptRun]
        WHERE [ChildPromptID] = @ID

    OPEN cascade_update_MJAIPromptRuns_ChildPromptID_cursor
    FETCH NEXT FROM cascade_update_MJAIPromptRuns_ChildPromptID_cursor INTO @MJAIPromptRuns_ChildPromptIDID, @MJAIPromptRuns_ChildPromptID_PromptID, @MJAIPromptRuns_ChildPromptID_ModelID, @MJAIPromptRuns_ChildPromptID_VendorID, @MJAIPromptRuns_ChildPromptID_AgentID, @MJAIPromptRuns_ChildPromptID_ConfigurationID, @MJAIPromptRuns_ChildPromptID_RunAt, @MJAIPromptRuns_ChildPromptID_CompletedAt, @MJAIPromptRuns_ChildPromptID_ExecutionTimeMS, @MJAIPromptRuns_ChildPromptID_Messages, @MJAIPromptRuns_ChildPromptID_Result, @MJAIPromptRuns_ChildPromptID_TokensUsed, @MJAIPromptRuns_ChildPromptID_TokensPrompt, @MJAIPromptRuns_ChildPromptID_TokensCompletion, @MJAIPromptRuns_ChildPromptID_TotalCost, @MJAIPromptRuns_ChildPromptID_Success, @MJAIPromptRuns_ChildPromptID_ErrorMessage, @MJAIPromptRuns_ChildPromptID_ParentID, @MJAIPromptRuns_ChildPromptID_RunType, @MJAIPromptRuns_ChildPromptID_ExecutionOrder, @MJAIPromptRuns_ChildPromptID_Cost, @MJAIPromptRuns_ChildPromptID_CostCurrency, @MJAIPromptRuns_ChildPromptID_TokensUsedRollup, @MJAIPromptRuns_ChildPromptID_TokensPromptRollup, @MJAIPromptRuns_ChildPromptID_TokensCompletionRollup, @MJAIPromptRuns_ChildPromptID_Temperature, @MJAIPromptRuns_ChildPromptID_TopP, @MJAIPromptRuns_ChildPromptID_TopK, @MJAIPromptRuns_ChildPromptID_MinP, @MJAIPromptRuns_ChildPromptID_FrequencyPenalty, @MJAIPromptRuns_ChildPromptID_PresencePenalty, @MJAIPromptRuns_ChildPromptID_Seed, @MJAIPromptRuns_ChildPromptID_StopSequences, @MJAIPromptRuns_ChildPromptID_ResponseFormat, @MJAIPromptRuns_ChildPromptID_LogProbs, @MJAIPromptRuns_ChildPromptID_TopLogProbs, @MJAIPromptRuns_ChildPromptID_DescendantCost, @MJAIPromptRuns_ChildPromptID_ValidationAttemptCount, @MJAIPromptRuns_ChildPromptID_SuccessfulValidationCount, @MJAIPromptRuns_ChildPromptID_FinalValidationPassed, @MJAIPromptRuns_ChildPromptID_ValidationBehavior, @MJAIPromptRuns_ChildPromptID_RetryStrategy, @MJAIPromptRuns_ChildPromptID_MaxRetriesConfigured, @MJAIPromptRuns_ChildPromptID_FinalValidationError, @MJAIPromptRuns_ChildPromptID_ValidationErrorCount, @MJAIPromptRuns_ChildPromptID_CommonValidationError, @MJAIPromptRuns_ChildPromptID_FirstAttemptAt, @MJAIPromptRuns_ChildPromptID_LastAttemptAt, @MJAIPromptRuns_ChildPromptID_TotalRetryDurationMS, @MJAIPromptRuns_ChildPromptID_ValidationAttempts, @MJAIPromptRuns_ChildPromptID_ValidationSummary, @MJAIPromptRuns_ChildPromptID_FailoverAttempts, @MJAIPromptRuns_ChildPromptID_FailoverErrors, @MJAIPromptRuns_ChildPromptID_FailoverDurations, @MJAIPromptRuns_ChildPromptID_OriginalModelID, @MJAIPromptRuns_ChildPromptID_OriginalRequestStartTime, @MJAIPromptRuns_ChildPromptID_TotalFailoverDuration, @MJAIPromptRuns_ChildPromptID_RerunFromPromptRunID, @MJAIPromptRuns_ChildPromptID_ModelSelection, @MJAIPromptRuns_ChildPromptID_Status, @MJAIPromptRuns_ChildPromptID_Cancelled, @MJAIPromptRuns_ChildPromptID_CancellationReason, @MJAIPromptRuns_ChildPromptID_ModelPowerRank, @MJAIPromptRuns_ChildPromptID_SelectionStrategy, @MJAIPromptRuns_ChildPromptID_CacheHit, @MJAIPromptRuns_ChildPromptID_CacheKey, @MJAIPromptRuns_ChildPromptID_JudgeID, @MJAIPromptRuns_ChildPromptID_JudgeScore, @MJAIPromptRuns_ChildPromptID_WasSelectedResult, @MJAIPromptRuns_ChildPromptID_StreamingEnabled, @MJAIPromptRuns_ChildPromptID_FirstTokenTime, @MJAIPromptRuns_ChildPromptID_ErrorDetails, @MJAIPromptRuns_ChildPromptID_ChildPromptID, @MJAIPromptRuns_ChildPromptID_QueueTime, @MJAIPromptRuns_ChildPromptID_PromptTime, @MJAIPromptRuns_ChildPromptID_CompletionTime, @MJAIPromptRuns_ChildPromptID_ModelSpecificResponseDetails, @MJAIPromptRuns_ChildPromptID_EffortLevel, @MJAIPromptRuns_ChildPromptID_RunName, @MJAIPromptRuns_ChildPromptID_Comments, @MJAIPromptRuns_ChildPromptID_TestRunID, @MJAIPromptRuns_ChildPromptID_AssistantPrefill, @MJAIPromptRuns_ChildPromptID_TokensCacheRead, @MJAIPromptRuns_ChildPromptID_TokensCacheWrite, @MJAIPromptRuns_ChildPromptID_TokensCacheReadRollup, @MJAIPromptRuns_ChildPromptID_TokensCacheWriteRollup

    WHILE @@FETCH_STATUS = 0
    BEGIN
        -- Set the FK field to NULL
        SET @MJAIPromptRuns_ChildPromptID_ChildPromptID = NULL

        -- Call the update SP for the related entity
        EXEC [${flyway:defaultSchema}].[spUpdateAIPromptRun] @ID = @MJAIPromptRuns_ChildPromptIDID, @PromptID = @MJAIPromptRuns_ChildPromptID_PromptID, @ModelID = @MJAIPromptRuns_ChildPromptID_ModelID, @VendorID = @MJAIPromptRuns_ChildPromptID_VendorID, @AgentID = @MJAIPromptRuns_ChildPromptID_AgentID, @ConfigurationID = @MJAIPromptRuns_ChildPromptID_ConfigurationID, @RunAt = @MJAIPromptRuns_ChildPromptID_RunAt, @CompletedAt = @MJAIPromptRuns_ChildPromptID_CompletedAt, @ExecutionTimeMS = @MJAIPromptRuns_ChildPromptID_ExecutionTimeMS, @Messages = @MJAIPromptRuns_ChildPromptID_Messages, @Result = @MJAIPromptRuns_ChildPromptID_Result, @TokensUsed = @MJAIPromptRuns_ChildPromptID_TokensUsed, @TokensPrompt = @MJAIPromptRuns_ChildPromptID_TokensPrompt, @TokensCompletion = @MJAIPromptRuns_ChildPromptID_TokensCompletion, @TotalCost = @MJAIPromptRuns_ChildPromptID_TotalCost, @Success = @MJAIPromptRuns_ChildPromptID_Success, @ErrorMessage = @MJAIPromptRuns_ChildPromptID_ErrorMessage, @ParentID = @MJAIPromptRuns_ChildPromptID_ParentID, @RunType = @MJAIPromptRuns_ChildPromptID_RunType, @ExecutionOrder = @MJAIPromptRuns_ChildPromptID_ExecutionOrder, @Cost = @MJAIPromptRuns_ChildPromptID_Cost, @CostCurrency = @MJAIPromptRuns_ChildPromptID_CostCurrency, @TokensUsedRollup = @MJAIPromptRuns_ChildPromptID_TokensUsedRollup, @TokensPromptRollup = @MJAIPromptRuns_ChildPromptID_TokensPromptRollup, @TokensCompletionRollup = @MJAIPromptRuns_ChildPromptID_TokensCompletionRollup, @Temperature = @MJAIPromptRuns_ChildPromptID_Temperature, @TopP = @MJAIPromptRuns_ChildPromptID_TopP, @TopK = @MJAIPromptRuns_ChildPromptID_TopK, @MinP = @MJAIPromptRuns_ChildPromptID_MinP, @FrequencyPenalty = @MJAIPromptRuns_ChildPromptID_FrequencyPenalty, @PresencePenalty = @MJAIPromptRuns_ChildPromptID_PresencePenalty, @Seed = @MJAIPromptRuns_ChildPromptID_Seed, @StopSequences = @MJAIPromptRuns_ChildPromptID_StopSequences, @ResponseFormat = @MJAIPromptRuns_ChildPromptID_ResponseFormat, @LogProbs = @MJAIPromptRuns_ChildPromptID_LogProbs, @TopLogProbs = @MJAIPromptRuns_ChildPromptID_TopLogProbs, @DescendantCost = @MJAIPromptRuns_ChildPromptID_DescendantCost, @ValidationAttemptCount = @MJAIPromptRuns_ChildPromptID_ValidationAttemptCount, @SuccessfulValidationCount = @MJAIPromptRuns_ChildPromptID_SuccessfulValidationCount, @FinalValidationPassed = @MJAIPromptRuns_ChildPromptID_FinalValidationPassed, @ValidationBehavior = @MJAIPromptRuns_ChildPromptID_ValidationBehavior, @RetryStrategy = @MJAIPromptRuns_ChildPromptID_RetryStrategy, @MaxRetriesConfigured = @MJAIPromptRuns_ChildPromptID_MaxRetriesConfigured, @FinalValidationError = @MJAIPromptRuns_ChildPromptID_FinalValidationError, @ValidationErrorCount = @MJAIPromptRuns_ChildPromptID_ValidationErrorCount, @CommonValidationError = @MJAIPromptRuns_ChildPromptID_CommonValidationError, @FirstAttemptAt = @MJAIPromptRuns_ChildPromptID_FirstAttemptAt, @LastAttemptAt = @MJAIPromptRuns_ChildPromptID_LastAttemptAt, @TotalRetryDurationMS = @MJAIPromptRuns_ChildPromptID_TotalRetryDurationMS, @ValidationAttempts = @MJAIPromptRuns_ChildPromptID_ValidationAttempts, @ValidationSummary = @MJAIPromptRuns_ChildPromptID_ValidationSummary, @FailoverAttempts = @MJAIPromptRuns_ChildPromptID_FailoverAttempts, @FailoverErrors = @MJAIPromptRuns_ChildPromptID_FailoverErrors, @FailoverDurations = @MJAIPromptRuns_ChildPromptID_FailoverDurations, @OriginalModelID = @MJAIPromptRuns_ChildPromptID_OriginalModelID, @OriginalRequestStartTime = @MJAIPromptRuns_ChildPromptID_OriginalRequestStartTime, @TotalFailoverDuration = @MJAIPromptRuns_ChildPromptID_TotalFailoverDuration, @RerunFromPromptRunID = @MJAIPromptRuns_ChildPromptID_RerunFromPromptRunID, @ModelSelection = @MJAIPromptRuns_ChildPromptID_ModelSelection, @Status = @MJAIPromptRuns_ChildPromptID_Status, @Cancelled = @MJAIPromptRuns_ChildPromptID_Cancelled, @CancellationReason = @MJAIPromptRuns_ChildPromptID_CancellationReason, @ModelPowerRank = @MJAIPromptRuns_ChildPromptID_ModelPowerRank, @SelectionStrategy = @MJAIPromptRuns_ChildPromptID_SelectionStrategy, @CacheHit = @MJAIPromptRuns_ChildPromptID_CacheHit, @CacheKey = @MJAIPromptRuns_ChildPromptID_CacheKey, @JudgeID = @MJAIPromptRuns_ChildPromptID_JudgeID, @JudgeScore = @MJAIPromptRuns_ChildPromptID_JudgeScore, @WasSelectedResult = @MJAIPromptRuns_ChildPromptID_WasSelectedResult, @StreamingEnabled = @MJAIPromptRuns_ChildPromptID_StreamingEnabled, @FirstTokenTime = @MJAIPromptRuns_ChildPromptID_FirstTokenTime, @ErrorDetails = @MJAIPromptRuns_ChildPromptID_ErrorDetails, @ChildPromptID_Clear = 1, @ChildPromptID = @MJAIPromptRuns_ChildPromptID_ChildPromptID, @QueueTime = @MJAIPromptRuns_ChildPromptID_QueueTime, @PromptTime = @MJAIPromptRuns_ChildPromptID_PromptTime, @CompletionTime = @MJAIPromptRuns_ChildPromptID_CompletionTime, @ModelSpecificResponseDetails = @MJAIPromptRuns_ChildPromptID_ModelSpecificResponseDetails, @EffortLevel = @MJAIPromptRuns_ChildPromptID_EffortLevel, @RunName = @MJAIPromptRuns_ChildPromptID_RunName, @Comments = @MJAIPromptRuns_ChildPromptID_Comments, @TestRunID = @MJAIPromptRuns_ChildPromptID_TestRunID, @AssistantPrefill = @MJAIPromptRuns_ChildPromptID_AssistantPrefill, @TokensCacheRead = @MJAIPromptRuns_ChildPromptID_TokensCacheRead, @TokensCacheWrite = @MJAIPromptRuns_ChildPromptID_TokensCacheWrite, @TokensCacheReadRollup = @MJAIPromptRuns_ChildPromptID_TokensCacheReadRollup, @TokensCacheWriteRollup = @MJAIPromptRuns_ChildPromptID_TokensCacheWriteRollup

        FETCH NEXT FROM cascade_update_MJAIPromptRuns_ChildPromptID_cursor INTO @MJAIPromptRuns_ChildPromptIDID, @MJAIPromptRuns_ChildPromptID_PromptID, @MJAIPromptRuns_ChildPromptID_ModelID, @MJAIPromptRuns_ChildPromptID_VendorID, @MJAIPromptRuns_ChildPromptID_AgentID, @MJAIPromptRuns_ChildPromptID_ConfigurationID, @MJAIPromptRuns_ChildPromptID_RunAt, @MJAIPromptRuns_ChildPromptID_CompletedAt, @MJAIPromptRuns_ChildPromptID_ExecutionTimeMS, @MJAIPromptRuns_ChildPromptID_Messages, @MJAIPromptRuns_ChildPromptID_Result, @MJAIPromptRuns_ChildPromptID_TokensUsed, @MJAIPromptRuns_ChildPromptID_TokensPrompt, @MJAIPromptRuns_ChildPromptID_TokensCompletion, @MJAIPromptRuns_ChildPromptID_TotalCost, @MJAIPromptRuns_ChildPromptID_Success, @MJAIPromptRuns_ChildPromptID_ErrorMessage, @MJAIPromptRuns_ChildPromptID_ParentID, @MJAIPromptRuns_ChildPromptID_RunType, @MJAIPromptRuns_ChildPromptID_ExecutionOrder, @MJAIPromptRuns_ChildPromptID_Cost, @MJAIPromptRuns_ChildPromptID_CostCurrency, @MJAIPromptRuns_ChildPromptID_TokensUsedRollup, @MJAIPromptRuns_ChildPromptID_TokensPromptRollup, @MJAIPromptRuns_ChildPromptID_TokensCompletionRollup, @MJAIPromptRuns_ChildPromptID_Temperature, @MJAIPromptRuns_ChildPromptID_TopP, @MJAIPromptRuns_ChildPromptID_TopK, @MJAIPromptRuns_ChildPromptID_MinP, @MJAIPromptRuns_ChildPromptID_FrequencyPenalty, @MJAIPromptRuns_ChildPromptID_PresencePenalty, @MJAIPromptRuns_ChildPromptID_Seed, @MJAIPromptRuns_ChildPromptID_StopSequences, @MJAIPromptRuns_ChildPromptID_ResponseFormat, @MJAIPromptRuns_ChildPromptID_LogProbs, @MJAIPromptRuns_ChildPromptID_TopLogProbs, @MJAIPromptRuns_ChildPromptID_DescendantCost, @MJAIPromptRuns_ChildPromptID_ValidationAttemptCount, @MJAIPromptRuns_ChildPromptID_SuccessfulValidationCount, @MJAIPromptRuns_ChildPromptID_FinalValidationPassed, @MJAIPromptRuns_ChildPromptID_ValidationBehavior, @MJAIPromptRuns_ChildPromptID_RetryStrategy, @MJAIPromptRuns_ChildPromptID_MaxRetriesConfigured, @MJAIPromptRuns_ChildPromptID_FinalValidationError, @MJAIPromptRuns_ChildPromptID_ValidationErrorCount, @MJAIPromptRuns_ChildPromptID_CommonValidationError, @MJAIPromptRuns_ChildPromptID_FirstAttemptAt, @MJAIPromptRuns_ChildPromptID_LastAttemptAt, @MJAIPromptRuns_ChildPromptID_TotalRetryDurationMS, @MJAIPromptRuns_ChildPromptID_ValidationAttempts, @MJAIPromptRuns_ChildPromptID_ValidationSummary, @MJAIPromptRuns_ChildPromptID_FailoverAttempts, @MJAIPromptRuns_ChildPromptID_FailoverErrors, @MJAIPromptRuns_ChildPromptID_FailoverDurations, @MJAIPromptRuns_ChildPromptID_OriginalModelID, @MJAIPromptRuns_ChildPromptID_OriginalRequestStartTime, @MJAIPromptRuns_ChildPromptID_TotalFailoverDuration, @MJAIPromptRuns_ChildPromptID_RerunFromPromptRunID, @MJAIPromptRuns_ChildPromptID_ModelSelection, @MJAIPromptRuns_ChildPromptID_Status, @MJAIPromptRuns_ChildPromptID_Cancelled, @MJAIPromptRuns_ChildPromptID_CancellationReason, @MJAIPromptRuns_ChildPromptID_ModelPowerRank, @MJAIPromptRuns_ChildPromptID_SelectionStrategy, @MJAIPromptRuns_ChildPromptID_CacheHit, @MJAIPromptRuns_ChildPromptID_CacheKey, @MJAIPromptRuns_ChildPromptID_JudgeID, @MJAIPromptRuns_ChildPromptID_JudgeScore, @MJAIPromptRuns_ChildPromptID_WasSelectedResult, @MJAIPromptRuns_ChildPromptID_StreamingEnabled, @MJAIPromptRuns_ChildPromptID_FirstTokenTime, @MJAIPromptRuns_ChildPromptID_ErrorDetails, @MJAIPromptRuns_ChildPromptID_ChildPromptID, @MJAIPromptRuns_ChildPromptID_QueueTime, @MJAIPromptRuns_ChildPromptID_PromptTime, @MJAIPromptRuns_ChildPromptID_CompletionTime, @MJAIPromptRuns_ChildPromptID_ModelSpecificResponseDetails, @MJAIPromptRuns_ChildPromptID_EffortLevel, @MJAIPromptRuns_ChildPromptID_RunName, @MJAIPromptRuns_ChildPromptID_Comments, @MJAIPromptRuns_ChildPromptID_TestRunID, @MJAIPromptRuns_ChildPromptID_AssistantPrefill, @MJAIPromptRuns_ChildPromptID_TokensCacheRead, @MJAIPromptRuns_ChildPromptID_TokensCacheWrite, @MJAIPromptRuns_ChildPromptID_TokensCacheReadRollup, @MJAIPromptRuns_ChildPromptID_TokensCacheWriteRollup
    END

    CLOSE cascade_update_MJAIPromptRuns_ChildPromptID_cursor
    DEALLOCATE cascade_update_MJAIPromptRuns_ChildPromptID_cursor
    
    -- Cascade update on AIPrompt using cursor to call spUpdateAIPrompt
    DECLARE @MJAIPrompts_ResultSelectorPromptIDID uniqueidentifier
    DECLARE @MJAIPrompts_ResultSelectorPromptID_Name nvarchar(255)
    DECLARE @MJAIPrompts_ResultSelectorPromptID_Description nvarchar(MAX)
    DECLARE @MJAIPrompts_ResultSelectorPromptID_TemplateID uniqueidentifier
    DECLARE @MJAIPrompts_ResultSelectorPromptID_CategoryID uniqueidentifier
    DECLARE @MJAIPrompts_ResultSelectorPromptID_TypeID uniqueidentifier
    DECLARE @MJAIPrompts_ResultSelectorPromptID_Status nvarchar(50)
    DECLARE @MJAIPrompts_ResultSelectorPromptID_ResponseFormat nvarchar(20)
    DECLARE @MJAIPrompts_ResultSelectorPromptID_ModelSpecificResponseFormat nvarchar(MAX)
    DECLARE @MJAIPrompts_ResultSelectorPromptID_AIModelTypeID uniqueidentifier
    DECLARE @MJAIPrompts_ResultSelectorPromptID_MinPowerRank int
    DECLARE @MJAIPrompts_ResultSelectorPromptID_SelectionStrategy nvarchar(20)
    DECLARE @MJAIPrompts_ResultSelectorPromptID_PowerPreference nvarchar(20)
    DECLARE @MJAIPrompts_ResultSelectorPromptID_ParallelizationMode nvarchar(20)
    DECLARE @MJAIPrompts_ResultSelectorPromptID_ParallelCount int
    DECLARE @MJAIPrompts_ResultSelectorPromptID_ParallelConfigParam nvarchar(100)
    DECLARE @MJAIPrompts_ResultSelectorPromptID_OutputType nvarchar(50)
    DECLARE @MJAIPrompts_ResultSelectorPromptID_OutputExample nvarchar(MAX)
    DECLARE @MJAIPrompts_ResultSelectorPromptID_ValidationBehavior nvarchar(50)
    DECLARE @MJAIPrompts_ResultSelectorPromptID_MaxRetries int
    DECLARE @MJAIPrompts_ResultSelectorPromptID_RetryDelayMS int
    DECLARE @MJAIPrompts_ResultSelectorPromptID_RetryStrategy nvarchar(20)
    DECLARE @MJAIPrompts_ResultSelectorPromptID_ResultSelectorPromptID uniqueidentifier
    DECLARE @MJAIPrompts_ResultSelectorPromptID_EnableCaching bit
    DECLARE @MJAIPrompts_ResultSelectorPromptID_CacheTTLSeconds int
    DECLARE @MJAIPrompts_ResultSelectorPromptID_CacheMatchType nvarchar(20)
    DECLARE @MJAIPrompts_ResultSelectorPromptID_CacheSimilarityThreshold float(53)
    DECLARE @MJAIPrompts_ResultSelectorPromptID_CacheMustMatchModel bit
    DECLARE @MJAIPrompts_ResultSelectorPromptID_CacheMustMatchVendor bit
    DECLARE @MJAIPrompts_ResultSelectorPromptID_CacheMustMatchAgent bit
    DECLARE @MJAIPrompts_ResultSelectorPromptID_CacheMustMatchConfig bit
    DECLARE @MJAIPrompts_ResultSelectorPromptID_PromptRole nvarchar(20)
    DECLARE @MJAIPrompts_ResultSelectorPromptID_PromptPosition nvarchar(20)
    DECLARE @MJAIPrompts_ResultSelectorPromptID_Temperature decimal(3, 2)
    DECLARE @MJAIPrompts_ResultSelectorPromptID_TopP decimal(3, 2)
    DECLARE @MJAIPrompts_ResultSelectorPromptID_TopK int
    DECLARE @MJAIPrompts_ResultSelectorPromptID_MinP decimal(3, 2)
    DECLARE @MJAIPrompts_ResultSelectorPromptID_FrequencyPenalty decimal(3, 2)
    DECLARE @MJAIPrompts_ResultSelectorPromptID_PresencePenalty decimal(3, 2)
    DECLARE @MJAIPrompts_ResultSelectorPromptID_Seed int
    DECLARE @MJAIPrompts_ResultSelectorPromptID_StopSequences nvarchar(1000)
    DECLARE @MJAIPrompts_ResultSelectorPromptID_IncludeLogProbs bit
    DECLARE @MJAIPrompts_ResultSelectorPromptID_TopLogProbs int
    DECLARE @MJAIPrompts_ResultSelectorPromptID_FailoverStrategy nvarchar(50)
    DECLARE @MJAIPrompts_ResultSelectorPromptID_FailoverMaxAttempts int
    DECLARE @MJAIPrompts_ResultSelectorPromptID_FailoverDelaySeconds int
    DECLARE @MJAIPrompts_ResultSelectorPromptID_FailoverModelStrategy nvarchar(50)
    DECLARE @MJAIPrompts_ResultSelectorPromptID_FailoverErrorScope nvarchar(50)
    DECLARE @MJAIPrompts_ResultSelectorPromptID_EffortLevel int
    DECLARE @MJAIPrompts_ResultSelectorPromptID_AssistantPrefill nvarchar(MAX)
    DECLARE @MJAIPrompts_ResultSelectorPromptID_PrefillFallbackMode nvarchar(20)
    DECLARE @MJAIPrompts_ResultSelectorPromptID_RequireSpecificModels bit
    DECLARE cascade_update_MJAIPrompts_ResultSelectorPromptID_cursor CURSOR FOR
        SELECT [ID], [Name], [Description], [TemplateID], [CategoryID], [TypeID], [Status], [ResponseFormat], [ModelSpecificResponseFormat], [AIModelTypeID], [MinPowerRank], [SelectionStrategy], [PowerPreference], [ParallelizationMode], [ParallelCount], [ParallelConfigParam], [OutputType], [OutputExample], [ValidationBehavior], [MaxRetries], [RetryDelayMS], [RetryStrategy], [ResultSelectorPromptID], [EnableCaching], [CacheTTLSeconds], [CacheMatchType], [CacheSimilarityThreshold], [CacheMustMatchModel], [CacheMustMatchVendor], [CacheMustMatchAgent], [CacheMustMatchConfig], [PromptRole], [PromptPosition], [Temperature], [TopP], [TopK], [MinP], [FrequencyPenalty], [PresencePenalty], [Seed], [StopSequences], [IncludeLogProbs], [TopLogProbs], [FailoverStrategy], [FailoverMaxAttempts], [FailoverDelaySeconds], [FailoverModelStrategy], [FailoverErrorScope], [EffortLevel], [AssistantPrefill], [PrefillFallbackMode], [RequireSpecificModels]
        FROM [${flyway:defaultSchema}].[AIPrompt]
        WHERE [ResultSelectorPromptID] = @ID

    OPEN cascade_update_MJAIPrompts_ResultSelectorPromptID_cursor
    FETCH NEXT FROM cascade_update_MJAIPrompts_ResultSelectorPromptID_cursor INTO @MJAIPrompts_ResultSelectorPromptIDID, @MJAIPrompts_ResultSelectorPromptID_Name, @MJAIPrompts_ResultSelectorPromptID_Description, @MJAIPrompts_ResultSelectorPromptID_TemplateID, @MJAIPrompts_ResultSelectorPromptID_CategoryID, @MJAIPrompts_ResultSelectorPromptID_TypeID, @MJAIPrompts_ResultSelectorPromptID_Status, @MJAIPrompts_ResultSelectorPromptID_ResponseFormat, @MJAIPrompts_ResultSelectorPromptID_ModelSpecificResponseFormat, @MJAIPrompts_ResultSelectorPromptID_AIModelTypeID, @MJAIPrompts_ResultSelectorPromptID_MinPowerRank, @MJAIPrompts_ResultSelectorPromptID_SelectionStrategy, @MJAIPrompts_ResultSelectorPromptID_PowerPreference, @MJAIPrompts_ResultSelectorPromptID_ParallelizationMode, @MJAIPrompts_ResultSelectorPromptID_ParallelCount, @MJAIPrompts_ResultSelectorPromptID_ParallelConfigParam, @MJAIPrompts_ResultSelectorPromptID_OutputType, @MJAIPrompts_ResultSelectorPromptID_OutputExample, @MJAIPrompts_ResultSelectorPromptID_ValidationBehavior, @MJAIPrompts_ResultSelectorPromptID_MaxRetries, @MJAIPrompts_ResultSelectorPromptID_RetryDelayMS, @MJAIPrompts_ResultSelectorPromptID_RetryStrategy, @MJAIPrompts_ResultSelectorPromptID_ResultSelectorPromptID, @MJAIPrompts_ResultSelectorPromptID_EnableCaching, @MJAIPrompts_ResultSelectorPromptID_CacheTTLSeconds, @MJAIPrompts_ResultSelectorPromptID_CacheMatchType, @MJAIPrompts_ResultSelectorPromptID_CacheSimilarityThreshold, @MJAIPrompts_ResultSelectorPromptID_CacheMustMatchModel, @MJAIPrompts_ResultSelectorPromptID_CacheMustMatchVendor, @MJAIPrompts_ResultSelectorPromptID_CacheMustMatchAgent, @MJAIPrompts_ResultSelectorPromptID_CacheMustMatchConfig, @MJAIPrompts_ResultSelectorPromptID_PromptRole, @MJAIPrompts_ResultSelectorPromptID_PromptPosition, @MJAIPrompts_ResultSelectorPromptID_Temperature, @MJAIPrompts_ResultSelectorPromptID_TopP, @MJAIPrompts_ResultSelectorPromptID_TopK, @MJAIPrompts_ResultSelectorPromptID_MinP, @MJAIPrompts_ResultSelectorPromptID_FrequencyPenalty, @MJAIPrompts_ResultSelectorPromptID_PresencePenalty, @MJAIPrompts_ResultSelectorPromptID_Seed, @MJAIPrompts_ResultSelectorPromptID_StopSequences, @MJAIPrompts_ResultSelectorPromptID_IncludeLogProbs, @MJAIPrompts_ResultSelectorPromptID_TopLogProbs, @MJAIPrompts_ResultSelectorPromptID_FailoverStrategy, @MJAIPrompts_ResultSelectorPromptID_FailoverMaxAttempts, @MJAIPrompts_ResultSelectorPromptID_FailoverDelaySeconds, @MJAIPrompts_ResultSelectorPromptID_FailoverModelStrategy, @MJAIPrompts_ResultSelectorPromptID_FailoverErrorScope, @MJAIPrompts_ResultSelectorPromptID_EffortLevel, @MJAIPrompts_ResultSelectorPromptID_AssistantPrefill, @MJAIPrompts_ResultSelectorPromptID_PrefillFallbackMode, @MJAIPrompts_ResultSelectorPromptID_RequireSpecificModels

    WHILE @@FETCH_STATUS = 0
    BEGIN
        -- Set the FK field to NULL
        SET @MJAIPrompts_ResultSelectorPromptID_ResultSelectorPromptID = NULL

        -- Call the update SP for the related entity
        EXEC [${flyway:defaultSchema}].[spUpdateAIPrompt] @ID = @MJAIPrompts_ResultSelectorPromptIDID, @Name = @MJAIPrompts_ResultSelectorPromptID_Name, @Description = @MJAIPrompts_ResultSelectorPromptID_Description, @TemplateID = @MJAIPrompts_ResultSelectorPromptID_TemplateID, @CategoryID = @MJAIPrompts_ResultSelectorPromptID_CategoryID, @TypeID = @MJAIPrompts_ResultSelectorPromptID_TypeID, @Status = @MJAIPrompts_ResultSelectorPromptID_Status, @ResponseFormat = @MJAIPrompts_ResultSelectorPromptID_ResponseFormat, @ModelSpecificResponseFormat = @MJAIPrompts_ResultSelectorPromptID_ModelSpecificResponseFormat, @AIModelTypeID = @MJAIPrompts_ResultSelectorPromptID_AIModelTypeID, @MinPowerRank = @MJAIPrompts_ResultSelectorPromptID_MinPowerRank, @SelectionStrategy = @MJAIPrompts_ResultSelectorPromptID_SelectionStrategy, @PowerPreference = @MJAIPrompts_ResultSelectorPromptID_PowerPreference, @ParallelizationMode = @MJAIPrompts_ResultSelectorPromptID_ParallelizationMode, @ParallelCount = @MJAIPrompts_ResultSelectorPromptID_ParallelCount, @ParallelConfigParam = @MJAIPrompts_ResultSelectorPromptID_ParallelConfigParam, @OutputType = @MJAIPrompts_ResultSelectorPromptID_OutputType, @OutputExample = @MJAIPrompts_ResultSelectorPromptID_OutputExample, @ValidationBehavior = @MJAIPrompts_ResultSelectorPromptID_ValidationBehavior, @MaxRetries = @MJAIPrompts_ResultSelectorPromptID_MaxRetries, @RetryDelayMS = @MJAIPrompts_ResultSelectorPromptID_RetryDelayMS, @RetryStrategy = @MJAIPrompts_ResultSelectorPromptID_RetryStrategy, @ResultSelectorPromptID_Clear = 1, @ResultSelectorPromptID = @MJAIPrompts_ResultSelectorPromptID_ResultSelectorPromptID, @EnableCaching = @MJAIPrompts_ResultSelectorPromptID_EnableCaching, @CacheTTLSeconds = @MJAIPrompts_ResultSelectorPromptID_CacheTTLSeconds, @CacheMatchType = @MJAIPrompts_ResultSelectorPromptID_CacheMatchType, @CacheSimilarityThreshold = @MJAIPrompts_ResultSelectorPromptID_CacheSimilarityThreshold, @CacheMustMatchModel = @MJAIPrompts_ResultSelectorPromptID_CacheMustMatchModel, @CacheMustMatchVendor = @MJAIPrompts_ResultSelectorPromptID_CacheMustMatchVendor, @CacheMustMatchAgent = @MJAIPrompts_ResultSelectorPromptID_CacheMustMatchAgent, @CacheMustMatchConfig = @MJAIPrompts_ResultSelectorPromptID_CacheMustMatchConfig, @PromptRole = @MJAIPrompts_ResultSelectorPromptID_PromptRole, @PromptPosition = @MJAIPrompts_ResultSelectorPromptID_PromptPosition, @Temperature = @MJAIPrompts_ResultSelectorPromptID_Temperature, @TopP = @MJAIPrompts_ResultSelectorPromptID_TopP, @TopK = @MJAIPrompts_ResultSelectorPromptID_TopK, @MinP = @MJAIPrompts_ResultSelectorPromptID_MinP, @FrequencyPenalty = @MJAIPrompts_ResultSelectorPromptID_FrequencyPenalty, @PresencePenalty = @MJAIPrompts_ResultSelectorPromptID_PresencePenalty, @Seed = @MJAIPrompts_ResultSelectorPromptID_Seed, @StopSequences = @MJAIPrompts_ResultSelectorPromptID_StopSequences, @IncludeLogProbs = @MJAIPrompts_ResultSelectorPromptID_IncludeLogProbs, @TopLogProbs = @MJAIPrompts_ResultSelectorPromptID_TopLogProbs, @FailoverStrategy = @MJAIPrompts_ResultSelectorPromptID_FailoverStrategy, @FailoverMaxAttempts = @MJAIPrompts_ResultSelectorPromptID_FailoverMaxAttempts, @FailoverDelaySeconds = @MJAIPrompts_ResultSelectorPromptID_FailoverDelaySeconds, @FailoverModelStrategy = @MJAIPrompts_ResultSelectorPromptID_FailoverModelStrategy, @FailoverErrorScope = @MJAIPrompts_ResultSelectorPromptID_FailoverErrorScope, @EffortLevel = @MJAIPrompts_ResultSelectorPromptID_EffortLevel, @AssistantPrefill = @MJAIPrompts_ResultSelectorPromptID_AssistantPrefill, @PrefillFallbackMode = @MJAIPrompts_ResultSelectorPromptID_PrefillFallbackMode, @RequireSpecificModels = @MJAIPrompts_ResultSelectorPromptID_RequireSpecificModels

        FETCH NEXT FROM cascade_update_MJAIPrompts_ResultSelectorPromptID_cursor INTO @MJAIPrompts_ResultSelectorPromptIDID, @MJAIPrompts_ResultSelectorPromptID_Name, @MJAIPrompts_ResultSelectorPromptID_Description, @MJAIPrompts_ResultSelectorPromptID_TemplateID, @MJAIPrompts_ResultSelectorPromptID_CategoryID, @MJAIPrompts_ResultSelectorPromptID_TypeID, @MJAIPrompts_ResultSelectorPromptID_Status, @MJAIPrompts_ResultSelectorPromptID_ResponseFormat, @MJAIPrompts_ResultSelectorPromptID_ModelSpecificResponseFormat, @MJAIPrompts_ResultSelectorPromptID_AIModelTypeID, @MJAIPrompts_ResultSelectorPromptID_MinPowerRank, @MJAIPrompts_ResultSelectorPromptID_SelectionStrategy, @MJAIPrompts_ResultSelectorPromptID_PowerPreference, @MJAIPrompts_ResultSelectorPromptID_ParallelizationMode, @MJAIPrompts_ResultSelectorPromptID_ParallelCount, @MJAIPrompts_ResultSelectorPromptID_ParallelConfigParam, @MJAIPrompts_ResultSelectorPromptID_OutputType, @MJAIPrompts_ResultSelectorPromptID_OutputExample, @MJAIPrompts_ResultSelectorPromptID_ValidationBehavior, @MJAIPrompts_ResultSelectorPromptID_MaxRetries, @MJAIPrompts_ResultSelectorPromptID_RetryDelayMS, @MJAIPrompts_ResultSelectorPromptID_RetryStrategy, @MJAIPrompts_ResultSelectorPromptID_ResultSelectorPromptID, @MJAIPrompts_ResultSelectorPromptID_EnableCaching, @MJAIPrompts_ResultSelectorPromptID_CacheTTLSeconds, @MJAIPrompts_ResultSelectorPromptID_CacheMatchType, @MJAIPrompts_ResultSelectorPromptID_CacheSimilarityThreshold, @MJAIPrompts_ResultSelectorPromptID_CacheMustMatchModel, @MJAIPrompts_ResultSelectorPromptID_CacheMustMatchVendor, @MJAIPrompts_ResultSelectorPromptID_CacheMustMatchAgent, @MJAIPrompts_ResultSelectorPromptID_CacheMustMatchConfig, @MJAIPrompts_ResultSelectorPromptID_PromptRole, @MJAIPrompts_ResultSelectorPromptID_PromptPosition, @MJAIPrompts_ResultSelectorPromptID_Temperature, @MJAIPrompts_ResultSelectorPromptID_TopP, @MJAIPrompts_ResultSelectorPromptID_TopK, @MJAIPrompts_ResultSelectorPromptID_MinP, @MJAIPrompts_ResultSelectorPromptID_FrequencyPenalty, @MJAIPrompts_ResultSelectorPromptID_PresencePenalty, @MJAIPrompts_ResultSelectorPromptID_Seed, @MJAIPrompts_ResultSelectorPromptID_StopSequences, @MJAIPrompts_ResultSelectorPromptID_IncludeLogProbs, @MJAIPrompts_ResultSelectorPromptID_TopLogProbs, @MJAIPrompts_ResultSelectorPromptID_FailoverStrategy, @MJAIPrompts_ResultSelectorPromptID_FailoverMaxAttempts, @MJAIPrompts_ResultSelectorPromptID_FailoverDelaySeconds, @MJAIPrompts_ResultSelectorPromptID_FailoverModelStrategy, @MJAIPrompts_ResultSelectorPromptID_FailoverErrorScope, @MJAIPrompts_ResultSelectorPromptID_EffortLevel, @MJAIPrompts_ResultSelectorPromptID_AssistantPrefill, @MJAIPrompts_ResultSelectorPromptID_PrefillFallbackMode, @MJAIPrompts_ResultSelectorPromptID_RequireSpecificModels
    END

    CLOSE cascade_update_MJAIPrompts_ResultSelectorPromptID_cursor
    DEALLOCATE cascade_update_MJAIPrompts_ResultSelectorPromptID_cursor
    
    -- Cascade delete from AIResultCache using cursor to call spDeleteAIResultCache
    DECLARE @MJAIResultCache_AIPromptIDID uniqueidentifier
    DECLARE cascade_delete_MJAIResultCache_AIPromptID_cursor CURSOR FOR 
        SELECT [ID]
        FROM [${flyway:defaultSchema}].[AIResultCache]
        WHERE [AIPromptID] = @ID
    
    OPEN cascade_delete_MJAIResultCache_AIPromptID_cursor
    FETCH NEXT FROM cascade_delete_MJAIResultCache_AIPromptID_cursor INTO @MJAIResultCache_AIPromptIDID
    
    WHILE @@FETCH_STATUS = 0
    BEGIN
        EXEC [${flyway:defaultSchema}].[spDeleteAIResultCache] @ID = @MJAIResultCache_AIPromptIDID
        
        FETCH NEXT FROM cascade_delete_MJAIResultCache_AIPromptID_cursor INTO @MJAIResultCache_AIPromptIDID
    END
    
    CLOSE cascade_delete_MJAIResultCache_AIPromptID_cursor
    DEALLOCATE cascade_delete_MJAIResultCache_AIPromptID_cursor
    
    -- Cascade update on EntityDocument using cursor to call spUpdateEntityDocument
    DECLARE @MJEntityDocuments_ReasoningPromptIDID uniqueidentifier
    DECLARE @MJEntityDocuments_ReasoningPromptID_Name nvarchar(250)
    DECLARE @MJEntityDocuments_ReasoningPromptID_TypeID uniqueidentifier
    DECLARE @MJEntityDocuments_ReasoningPromptID_EntityID uniqueidentifier
    DECLARE @MJEntityDocuments_ReasoningPromptID_VectorDatabaseID uniqueidentifier
    DECLARE @MJEntityDocuments_ReasoningPromptID_Status nvarchar(15)
    DECLARE @MJEntityDocuments_ReasoningPromptID_TemplateID uniqueidentifier
    DECLARE @MJEntityDocuments_ReasoningPromptID_AIModelID uniqueidentifier
    DECLARE @MJEntityDocuments_ReasoningPromptID_PotentialMatchThreshold numeric(12, 11)
    DECLARE @MJEntityDocuments_ReasoningPromptID_AbsoluteMatchThreshold numeric(12, 11)
    DECLARE @MJEntityDocuments_ReasoningPromptID_VectorIndexID uniqueidentifier
    DECLARE @MJEntityDocuments_ReasoningPromptID_Configuration nvarchar(MAX)
    DECLARE @MJEntityDocuments_ReasoningPromptID_EnableLLMReasoning bit
    DECLARE @MJEntityDocuments_ReasoningPromptID_ReasoningMode nvarchar(20)
    DECLARE @MJEntityDocuments_ReasoningPromptID_ReasoningThreshold numeric(12, 11)
    DECLARE @MJEntityDocuments_ReasoningPromptID_ReasoningPromptID uniqueidentifier
    DECLARE @MJEntityDocuments_ReasoningPromptID_ReasoningAgentID uniqueidentifier
    DECLARE @MJEntityDocuments_ReasoningPromptID_AutomationLevel nvarchar(30)
    DECLARE cascade_update_MJEntityDocuments_ReasoningPromptID_cursor CURSOR FOR
        SELECT [ID], [Name], [TypeID], [EntityID], [VectorDatabaseID], [Status], [TemplateID], [AIModelID], [PotentialMatchThreshold], [AbsoluteMatchThreshold], [VectorIndexID], [Configuration], [EnableLLMReasoning], [ReasoningMode], [ReasoningThreshold], [ReasoningPromptID], [ReasoningAgentID], [AutomationLevel]
        FROM [${flyway:defaultSchema}].[EntityDocument]
        WHERE [ReasoningPromptID] = @ID

    OPEN cascade_update_MJEntityDocuments_ReasoningPromptID_cursor
    FETCH NEXT FROM cascade_update_MJEntityDocuments_ReasoningPromptID_cursor INTO @MJEntityDocuments_ReasoningPromptIDID, @MJEntityDocuments_ReasoningPromptID_Name, @MJEntityDocuments_ReasoningPromptID_TypeID, @MJEntityDocuments_ReasoningPromptID_EntityID, @MJEntityDocuments_ReasoningPromptID_VectorDatabaseID, @MJEntityDocuments_ReasoningPromptID_Status, @MJEntityDocuments_ReasoningPromptID_TemplateID, @MJEntityDocuments_ReasoningPromptID_AIModelID, @MJEntityDocuments_ReasoningPromptID_PotentialMatchThreshold, @MJEntityDocuments_ReasoningPromptID_AbsoluteMatchThreshold, @MJEntityDocuments_ReasoningPromptID_VectorIndexID, @MJEntityDocuments_ReasoningPromptID_Configuration, @MJEntityDocuments_ReasoningPromptID_EnableLLMReasoning, @MJEntityDocuments_ReasoningPromptID_ReasoningMode, @MJEntityDocuments_ReasoningPromptID_ReasoningThreshold, @MJEntityDocuments_ReasoningPromptID_ReasoningPromptID, @MJEntityDocuments_ReasoningPromptID_ReasoningAgentID, @MJEntityDocuments_ReasoningPromptID_AutomationLevel

    WHILE @@FETCH_STATUS = 0
    BEGIN
        -- Set the FK field to NULL
        SET @MJEntityDocuments_ReasoningPromptID_ReasoningPromptID = NULL

        -- Call the update SP for the related entity
        EXEC [${flyway:defaultSchema}].[spUpdateEntityDocument] @ID = @MJEntityDocuments_ReasoningPromptIDID, @Name = @MJEntityDocuments_ReasoningPromptID_Name, @TypeID = @MJEntityDocuments_ReasoningPromptID_TypeID, @EntityID = @MJEntityDocuments_ReasoningPromptID_EntityID, @VectorDatabaseID = @MJEntityDocuments_ReasoningPromptID_VectorDatabaseID, @Status = @MJEntityDocuments_ReasoningPromptID_Status, @TemplateID = @MJEntityDocuments_ReasoningPromptID_TemplateID, @AIModelID = @MJEntityDocuments_ReasoningPromptID_AIModelID, @PotentialMatchThreshold = @MJEntityDocuments_ReasoningPromptID_PotentialMatchThreshold, @AbsoluteMatchThreshold = @MJEntityDocuments_ReasoningPromptID_AbsoluteMatchThreshold, @VectorIndexID = @MJEntityDocuments_ReasoningPromptID_VectorIndexID, @Configuration = @MJEntityDocuments_ReasoningPromptID_Configuration, @EnableLLMReasoning = @MJEntityDocuments_ReasoningPromptID_EnableLLMReasoning, @ReasoningMode = @MJEntityDocuments_ReasoningPromptID_ReasoningMode, @ReasoningThreshold = @MJEntityDocuments_ReasoningPromptID_ReasoningThreshold, @ReasoningPromptID_Clear = 1, @ReasoningPromptID = @MJEntityDocuments_ReasoningPromptID_ReasoningPromptID, @ReasoningAgentID = @MJEntityDocuments_ReasoningPromptID_ReasoningAgentID, @AutomationLevel = @MJEntityDocuments_ReasoningPromptID_AutomationLevel

        FETCH NEXT FROM cascade_update_MJEntityDocuments_ReasoningPromptID_cursor INTO @MJEntityDocuments_ReasoningPromptIDID, @MJEntityDocuments_ReasoningPromptID_Name, @MJEntityDocuments_ReasoningPromptID_TypeID, @MJEntityDocuments_ReasoningPromptID_EntityID, @MJEntityDocuments_ReasoningPromptID_VectorDatabaseID, @MJEntityDocuments_ReasoningPromptID_Status, @MJEntityDocuments_ReasoningPromptID_TemplateID, @MJEntityDocuments_ReasoningPromptID_AIModelID, @MJEntityDocuments_ReasoningPromptID_PotentialMatchThreshold, @MJEntityDocuments_ReasoningPromptID_AbsoluteMatchThreshold, @MJEntityDocuments_ReasoningPromptID_VectorIndexID, @MJEntityDocuments_ReasoningPromptID_Configuration, @MJEntityDocuments_ReasoningPromptID_EnableLLMReasoning, @MJEntityDocuments_ReasoningPromptID_ReasoningMode, @MJEntityDocuments_ReasoningPromptID_ReasoningThreshold, @MJEntityDocuments_ReasoningPromptID_ReasoningPromptID, @MJEntityDocuments_ReasoningPromptID_ReasoningAgentID, @MJEntityDocuments_ReasoningPromptID_AutomationLevel
    END

    CLOSE cascade_update_MJEntityDocuments_ReasoningPromptID_cursor
    DEALLOCATE cascade_update_MJEntityDocuments_ReasoningPromptID_cursor
    
    -- Cascade update on RecordProcess using cursor to call spUpdateRecordProcess
    DECLARE @MJRecordProcesses_PromptIDID uniqueidentifier
    DECLARE @MJRecordProcesses_PromptID_Name nvarchar(255)
    DECLARE @MJRecordProcesses_PromptID_Description nvarchar(MAX)
    DECLARE @MJRecordProcesses_PromptID_CategoryID uniqueidentifier
    DECLARE @MJRecordProcesses_PromptID_EntityID uniqueidentifier
    DECLARE @MJRecordProcesses_PromptID_Status nvarchar(20)
    DECLARE @MJRecordProcesses_PromptID_WorkType nvarchar(20)
    DECLARE @MJRecordProcesses_PromptID_ActionID uniqueidentifier
    DECLARE @MJRecordProcesses_PromptID_AgentID uniqueidentifier
    DECLARE @MJRecordProcesses_PromptID_PromptID uniqueidentifier
    DECLARE @MJRecordProcesses_PromptID_ScopeType nvarchar(20)
    DECLARE @MJRecordProcesses_PromptID_ScopeViewID uniqueidentifier
    DECLARE @MJRecordProcesses_PromptID_ScopeListID uniqueidentifier
    DECLARE @MJRecordProcesses_PromptID_ScopeFilter nvarchar(MAX)
    DECLARE @MJRecordProcesses_PromptID_OnChangeEnabled bit
    DECLARE @MJRecordProcesses_PromptID_OnChangeInvocationType nvarchar(30)
    DECLARE @MJRecordProcesses_PromptID_OnChangeFilter nvarchar(MAX)
    DECLARE @MJRecordProcesses_PromptID_ScheduleEnabled bit
    DECLARE @MJRecordProcesses_PromptID_CronExpression nvarchar(120)
    DECLARE @MJRecordProcesses_PromptID_Timezone nvarchar(100)
    DECLARE @MJRecordProcesses_PromptID_OnDemandEnabled bit
    DECLARE @MJRecordProcesses_PromptID_InputMapping nvarchar(MAX)
    DECLARE @MJRecordProcesses_PromptID_OutputMapping nvarchar(MAX)
    DECLARE @MJRecordProcesses_PromptID_SkipUnchanged bit
    DECLARE @MJRecordProcesses_PromptID_WatermarkStrategy nvarchar(20)
    DECLARE @MJRecordProcesses_PromptID_BatchSize int
    DECLARE @MJRecordProcesses_PromptID_MaxConcurrency int
    DECLARE @MJRecordProcesses_PromptID_Configuration nvarchar(MAX)
    DECLARE cascade_update_MJRecordProcesses_PromptID_cursor CURSOR FOR
        SELECT [ID], [Name], [Description], [CategoryID], [EntityID], [Status], [WorkType], [ActionID], [AgentID], [PromptID], [ScopeType], [ScopeViewID], [ScopeListID], [ScopeFilter], [OnChangeEnabled], [OnChangeInvocationType], [OnChangeFilter], [ScheduleEnabled], [CronExpression], [Timezone], [OnDemandEnabled], [InputMapping], [OutputMapping], [SkipUnchanged], [WatermarkStrategy], [BatchSize], [MaxConcurrency], [Configuration]
        FROM [${flyway:defaultSchema}].[RecordProcess]
        WHERE [PromptID] = @ID

    OPEN cascade_update_MJRecordProcesses_PromptID_cursor
    FETCH NEXT FROM cascade_update_MJRecordProcesses_PromptID_cursor INTO @MJRecordProcesses_PromptIDID, @MJRecordProcesses_PromptID_Name, @MJRecordProcesses_PromptID_Description, @MJRecordProcesses_PromptID_CategoryID, @MJRecordProcesses_PromptID_EntityID, @MJRecordProcesses_PromptID_Status, @MJRecordProcesses_PromptID_WorkType, @MJRecordProcesses_PromptID_ActionID, @MJRecordProcesses_PromptID_AgentID, @MJRecordProcesses_PromptID_PromptID, @MJRecordProcesses_PromptID_ScopeType, @MJRecordProcesses_PromptID_ScopeViewID, @MJRecordProcesses_PromptID_ScopeListID, @MJRecordProcesses_PromptID_ScopeFilter, @MJRecordProcesses_PromptID_OnChangeEnabled, @MJRecordProcesses_PromptID_OnChangeInvocationType, @MJRecordProcesses_PromptID_OnChangeFilter, @MJRecordProcesses_PromptID_ScheduleEnabled, @MJRecordProcesses_PromptID_CronExpression, @MJRecordProcesses_PromptID_Timezone, @MJRecordProcesses_PromptID_OnDemandEnabled, @MJRecordProcesses_PromptID_InputMapping, @MJRecordProcesses_PromptID_OutputMapping, @MJRecordProcesses_PromptID_SkipUnchanged, @MJRecordProcesses_PromptID_WatermarkStrategy, @MJRecordProcesses_PromptID_BatchSize, @MJRecordProcesses_PromptID_MaxConcurrency, @MJRecordProcesses_PromptID_Configuration

    WHILE @@FETCH_STATUS = 0
    BEGIN
        -- Set the FK field to NULL
        SET @MJRecordProcesses_PromptID_PromptID = NULL

        -- Call the update SP for the related entity
        EXEC [${flyway:defaultSchema}].[spUpdateRecordProcess] @ID = @MJRecordProcesses_PromptIDID, @Name = @MJRecordProcesses_PromptID_Name, @Description = @MJRecordProcesses_PromptID_Description, @CategoryID = @MJRecordProcesses_PromptID_CategoryID, @EntityID = @MJRecordProcesses_PromptID_EntityID, @Status = @MJRecordProcesses_PromptID_Status, @WorkType = @MJRecordProcesses_PromptID_WorkType, @ActionID = @MJRecordProcesses_PromptID_ActionID, @AgentID = @MJRecordProcesses_PromptID_AgentID, @PromptID_Clear = 1, @PromptID = @MJRecordProcesses_PromptID_PromptID, @ScopeType = @MJRecordProcesses_PromptID_ScopeType, @ScopeViewID = @MJRecordProcesses_PromptID_ScopeViewID, @ScopeListID = @MJRecordProcesses_PromptID_ScopeListID, @ScopeFilter = @MJRecordProcesses_PromptID_ScopeFilter, @OnChangeEnabled = @MJRecordProcesses_PromptID_OnChangeEnabled, @OnChangeInvocationType = @MJRecordProcesses_PromptID_OnChangeInvocationType, @OnChangeFilter = @MJRecordProcesses_PromptID_OnChangeFilter, @ScheduleEnabled = @MJRecordProcesses_PromptID_ScheduleEnabled, @CronExpression = @MJRecordProcesses_PromptID_CronExpression, @Timezone = @MJRecordProcesses_PromptID_Timezone, @OnDemandEnabled = @MJRecordProcesses_PromptID_OnDemandEnabled, @InputMapping = @MJRecordProcesses_PromptID_InputMapping, @OutputMapping = @MJRecordProcesses_PromptID_OutputMapping, @SkipUnchanged = @MJRecordProcesses_PromptID_SkipUnchanged, @WatermarkStrategy = @MJRecordProcesses_PromptID_WatermarkStrategy, @BatchSize = @MJRecordProcesses_PromptID_BatchSize, @MaxConcurrency = @MJRecordProcesses_PromptID_MaxConcurrency, @Configuration = @MJRecordProcesses_PromptID_Configuration

        FETCH NEXT FROM cascade_update_MJRecordProcesses_PromptID_cursor INTO @MJRecordProcesses_PromptIDID, @MJRecordProcesses_PromptID_Name, @MJRecordProcesses_PromptID_Description, @MJRecordProcesses_PromptID_CategoryID, @MJRecordProcesses_PromptID_EntityID, @MJRecordProcesses_PromptID_Status, @MJRecordProcesses_PromptID_WorkType, @MJRecordProcesses_PromptID_ActionID, @MJRecordProcesses_PromptID_AgentID, @MJRecordProcesses_PromptID_PromptID, @MJRecordProcesses_PromptID_ScopeType, @MJRecordProcesses_PromptID_ScopeViewID, @MJRecordProcesses_PromptID_ScopeListID, @MJRecordProcesses_PromptID_ScopeFilter, @MJRecordProcesses_PromptID_OnChangeEnabled, @MJRecordProcesses_PromptID_OnChangeInvocationType, @MJRecordProcesses_PromptID_OnChangeFilter, @MJRecordProcesses_PromptID_ScheduleEnabled, @MJRecordProcesses_PromptID_CronExpression, @MJRecordProcesses_PromptID_Timezone, @MJRecordProcesses_PromptID_OnDemandEnabled, @MJRecordProcesses_PromptID_InputMapping, @MJRecordProcesses_PromptID_OutputMapping, @MJRecordProcesses_PromptID_SkipUnchanged, @MJRecordProcesses_PromptID_WatermarkStrategy, @MJRecordProcesses_PromptID_BatchSize, @MJRecordProcesses_PromptID_MaxConcurrency, @MJRecordProcesses_PromptID_Configuration
    END

    CLOSE cascade_update_MJRecordProcesses_PromptID_cursor
    DEALLOCATE cascade_update_MJRecordProcesses_PromptID_cursor
    
    -- Cascade delete from ScopedPromptConfig using cursor to call spDeleteScopedPromptConfig
    DECLARE @MJScopedPromptConfigs_PromptIDID uniqueidentifier
    DECLARE cascade_delete_MJScopedPromptConfigs_PromptID_cursor CURSOR FOR 
        SELECT [ID]
        FROM [${flyway:defaultSchema}].[ScopedPromptConfig]
        WHERE [PromptID] = @ID
    
    OPEN cascade_delete_MJScopedPromptConfigs_PromptID_cursor
    FETCH NEXT FROM cascade_delete_MJScopedPromptConfigs_PromptID_cursor INTO @MJScopedPromptConfigs_PromptIDID
    
    WHILE @@FETCH_STATUS = 0
    BEGIN
        EXEC [${flyway:defaultSchema}].[spDeleteScopedPromptConfig] @ID = @MJScopedPromptConfigs_PromptIDID
        
        FETCH NEXT FROM cascade_delete_MJScopedPromptConfigs_PromptID_cursor INTO @MJScopedPromptConfigs_PromptIDID
    END
    
    CLOSE cascade_delete_MJScopedPromptConfigs_PromptID_cursor
    DEALLOCATE cascade_delete_MJScopedPromptConfigs_PromptID_cursor
    
    -- Cascade delete from ScopedPromptPart using cursor to call spDeleteScopedPromptPart
    DECLARE @MJScopedPromptParts_PromptIDID uniqueidentifier
    DECLARE cascade_delete_MJScopedPromptParts_PromptID_cursor CURSOR FOR 
        SELECT [ID]
        FROM [${flyway:defaultSchema}].[ScopedPromptPart]
        WHERE [PromptID] = @ID
    
    OPEN cascade_delete_MJScopedPromptParts_PromptID_cursor
    FETCH NEXT FROM cascade_delete_MJScopedPromptParts_PromptID_cursor INTO @MJScopedPromptParts_PromptIDID
    
    WHILE @@FETCH_STATUS = 0
    BEGIN
        EXEC [${flyway:defaultSchema}].[spDeleteScopedPromptPart] @ID = @MJScopedPromptParts_PromptIDID
        
        FETCH NEXT FROM cascade_delete_MJScopedPromptParts_PromptID_cursor INTO @MJScopedPromptParts_PromptIDID
    END
    
    CLOSE cascade_delete_MJScopedPromptParts_PromptID_cursor
    DEALLOCATE cascade_delete_MJScopedPromptParts_PromptID_cursor
    
    -- Cascade update on Task using cursor to call spUpdateTask
    DECLARE @MJTasks_PromptIDID uniqueidentifier
    DECLARE @MJTasks_PromptID_ParentID uniqueidentifier
    DECLARE @MJTasks_PromptID_Name nvarchar(255)
    DECLARE @MJTasks_PromptID_Description nvarchar(MAX)
    DECLARE @MJTasks_PromptID_TypeID uniqueidentifier
    DECLARE @MJTasks_PromptID_EnvironmentID uniqueidentifier
    DECLARE @MJTasks_PromptID_ProjectID uniqueidentifier
    DECLARE @MJTasks_PromptID_ConversationDetailID uniqueidentifier
    DECLARE @MJTasks_PromptID_UserID uniqueidentifier
    DECLARE @MJTasks_PromptID_AgentID uniqueidentifier
    DECLARE @MJTasks_PromptID_Status nvarchar(50)
    DECLARE @MJTasks_PromptID_PercentComplete int
    DECLARE @MJTasks_PromptID_DueAt datetimeoffset
    DECLARE @MJTasks_PromptID_StartedAt datetimeoffset
    DECLARE @MJTasks_PromptID_CompletedAt datetimeoffset
    DECLARE @MJTasks_PromptID_InputPayload nvarchar(MAX)
    DECLARE @MJTasks_PromptID_OutputPayload nvarchar(MAX)
    DECLARE @MJTasks_PromptID_ErrorMessage nvarchar(MAX)
    DECLARE @MJTasks_PromptID_AgentRunID uniqueidentifier
    DECLARE @MJTasks_PromptID_ClaimedBy nvarchar(100)
    DECLARE @MJTasks_PromptID_ClaimExpiresAt datetimeoffset
    DECLARE @MJTasks_PromptID_ActionID uniqueidentifier
    DECLARE @MJTasks_PromptID_StepType nvarchar(20)
    DECLARE @MJTasks_PromptID_PromptID uniqueidentifier
    DECLARE @MJTasks_PromptID_Configuration nvarchar(MAX)
    DECLARE cascade_update_MJTasks_PromptID_cursor CURSOR FOR
        SELECT [ID], [ParentID], [Name], [Description], [TypeID], [EnvironmentID], [ProjectID], [ConversationDetailID], [UserID], [AgentID], [Status], [PercentComplete], [DueAt], [StartedAt], [CompletedAt], [InputPayload], [OutputPayload], [ErrorMessage], [AgentRunID], [ClaimedBy], [ClaimExpiresAt], [ActionID], [StepType], [PromptID], [Configuration]
        FROM [${flyway:defaultSchema}].[Task]
        WHERE [PromptID] = @ID

    OPEN cascade_update_MJTasks_PromptID_cursor
    FETCH NEXT FROM cascade_update_MJTasks_PromptID_cursor INTO @MJTasks_PromptIDID, @MJTasks_PromptID_ParentID, @MJTasks_PromptID_Name, @MJTasks_PromptID_Description, @MJTasks_PromptID_TypeID, @MJTasks_PromptID_EnvironmentID, @MJTasks_PromptID_ProjectID, @MJTasks_PromptID_ConversationDetailID, @MJTasks_PromptID_UserID, @MJTasks_PromptID_AgentID, @MJTasks_PromptID_Status, @MJTasks_PromptID_PercentComplete, @MJTasks_PromptID_DueAt, @MJTasks_PromptID_StartedAt, @MJTasks_PromptID_CompletedAt, @MJTasks_PromptID_InputPayload, @MJTasks_PromptID_OutputPayload, @MJTasks_PromptID_ErrorMessage, @MJTasks_PromptID_AgentRunID, @MJTasks_PromptID_ClaimedBy, @MJTasks_PromptID_ClaimExpiresAt, @MJTasks_PromptID_ActionID, @MJTasks_PromptID_StepType, @MJTasks_PromptID_PromptID, @MJTasks_PromptID_Configuration

    WHILE @@FETCH_STATUS = 0
    BEGIN
        -- Set the FK field to NULL
        SET @MJTasks_PromptID_PromptID = NULL

        -- Call the update SP for the related entity
        EXEC [${flyway:defaultSchema}].[spUpdateTask] @ID = @MJTasks_PromptIDID, @ParentID = @MJTasks_PromptID_ParentID, @Name = @MJTasks_PromptID_Name, @Description = @MJTasks_PromptID_Description, @TypeID = @MJTasks_PromptID_TypeID, @EnvironmentID = @MJTasks_PromptID_EnvironmentID, @ProjectID = @MJTasks_PromptID_ProjectID, @ConversationDetailID = @MJTasks_PromptID_ConversationDetailID, @UserID = @MJTasks_PromptID_UserID, @AgentID = @MJTasks_PromptID_AgentID, @Status = @MJTasks_PromptID_Status, @PercentComplete = @MJTasks_PromptID_PercentComplete, @DueAt = @MJTasks_PromptID_DueAt, @StartedAt = @MJTasks_PromptID_StartedAt, @CompletedAt = @MJTasks_PromptID_CompletedAt, @InputPayload = @MJTasks_PromptID_InputPayload, @OutputPayload = @MJTasks_PromptID_OutputPayload, @ErrorMessage = @MJTasks_PromptID_ErrorMessage, @AgentRunID = @MJTasks_PromptID_AgentRunID, @ClaimedBy = @MJTasks_PromptID_ClaimedBy, @ClaimExpiresAt = @MJTasks_PromptID_ClaimExpiresAt, @ActionID = @MJTasks_PromptID_ActionID, @StepType = @MJTasks_PromptID_StepType, @PromptID_Clear = 1, @PromptID = @MJTasks_PromptID_PromptID, @Configuration = @MJTasks_PromptID_Configuration

        FETCH NEXT FROM cascade_update_MJTasks_PromptID_cursor INTO @MJTasks_PromptIDID, @MJTasks_PromptID_ParentID, @MJTasks_PromptID_Name, @MJTasks_PromptID_Description, @MJTasks_PromptID_TypeID, @MJTasks_PromptID_EnvironmentID, @MJTasks_PromptID_ProjectID, @MJTasks_PromptID_ConversationDetailID, @MJTasks_PromptID_UserID, @MJTasks_PromptID_AgentID, @MJTasks_PromptID_Status, @MJTasks_PromptID_PercentComplete, @MJTasks_PromptID_DueAt, @MJTasks_PromptID_StartedAt, @MJTasks_PromptID_CompletedAt, @MJTasks_PromptID_InputPayload, @MJTasks_PromptID_OutputPayload, @MJTasks_PromptID_ErrorMessage, @MJTasks_PromptID_AgentRunID, @MJTasks_PromptID_ClaimedBy, @MJTasks_PromptID_ClaimExpiresAt, @MJTasks_PromptID_ActionID, @MJTasks_PromptID_StepType, @MJTasks_PromptID_PromptID, @MJTasks_PromptID_Configuration
    END

    CLOSE cascade_update_MJTasks_PromptID_cursor
    DEALLOCATE cascade_update_MJTasks_PromptID_cursor
    

    DELETE FROM
        [${flyway:defaultSchema}].[AIPrompt]
    WHERE
        [ID] = @ID


    -- Check if the delete was successful
    IF @@ROWCOUNT = 0
        SELECT NULL AS [ID] -- Return NULL for all primary key fields to indicate no record was deleted
    ELSE
        SELECT @ID AS [ID] -- Return the primary key values to indicate we successfully deleted the record
END
GO
GRANT EXECUTE ON [${flyway:defaultSchema}].[spDeleteAIPrompt] TO [cdp_Developer];

/* spDelete Permissions for MJ: AI Prompts */

GRANT EXECUTE ON [${flyway:defaultSchema}].[spDeleteAIPrompt] TO [cdp_Developer];

/* SQL text to insert 1 new entity field(s) */

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '35ca8550-1bc0-43c3-997a-d0f237eece24' OR (EntityID = '64AD3C8D-0570-48AF-AF4C-D0A2B173FDE1' AND Name = 'Prompt')) BEGIN
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
            '35ca8550-1bc0-43c3-997a-d0f237eece24',
            '64AD3C8D-0570-48AF-AF4C-D0A2B173FDE1', -- Entity: MJ: Tasks
            (SELECT COALESCE(MAX([Sequence]), 0) FROM [${flyway:defaultSchema}].[EntityField] WHERE [EntityID] = '64AD3C8D-0570-48AF-AF4C-D0A2B173FDE1') + 37,
            'Prompt',
            'Prompt',
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

/* Set field properties for entity */

               UPDATE [${flyway:defaultSchema}].[EntityField]
               SET IsNameField = 0
               WHERE ID = 'B3786698-56A7-4C58-BEB4-7127D992CE08'
               AND AutoUpdateIsNameField = 1;

/* Set field properties for entity */

               UPDATE [${flyway:defaultSchema}].[EntityField]
               SET DefaultInView = 1
               WHERE ID = '596F0FFE-6E36-4E9B-90D2-EB5BD65933D6'
               AND AutoUpdateDefaultInView = 1;

            UPDATE [${flyway:defaultSchema}].[Entity]
            SET AllowUserSearchAPI = 0
            WHERE ID = '35248F34-2837-EF11-86D4-6045BDEE16E6'
            AND AutoUpdateAllowUserSearchAPI = 1;

/* Set field properties for entity */

               UPDATE [${flyway:defaultSchema}].[EntityField]
               SET DefaultInView = 1
               WHERE ID = '4CDA9696-9323-4F39-8F1C-5420FC4A3D30'
               AND AutoUpdateDefaultInView = 1;

               UPDATE [${flyway:defaultSchema}].[EntityField]
               SET DefaultInView = 1
               WHERE ID = '1ACD1AF2-0477-47EC-A3CF-9E63C563CC72'
               AND AutoUpdateDefaultInView = 1;

/* Set field properties for entity */

               UPDATE [${flyway:defaultSchema}].[EntityField]
               SET DefaultInView = 1
               WHERE ID = '898D7496-DF26-4AAF-BA4B-6BE563D78184'
               AND AutoUpdateDefaultInView = 1;

/* Set categories for 10 fields */

-- UPDATE Entity Field Category Info MJ: Entity Action Params.ID 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = 'F95717F0-6F36-EF11-86D4-6045BDEE16E6' AND AutoUpdateCategory = 1;

-- UPDATE Entity Field Category Info MJ: Entity Action Params.EntityActionID 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   GeneratedFormSection = 'Category',
   DisplayName = 'Entity Action',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = '9F5817F0-6F36-EF11-86D4-6045BDEE16E6' AND AutoUpdateCategory = 1;

-- UPDATE Entity Field Category Info MJ: Entity Action Params.ActionParamID 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   GeneratedFormSection = 'Category',
   DisplayName = 'Action Parameter',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = '985817F0-6F36-EF11-86D4-6045BDEE16E6' AND AutoUpdateCategory = 1;

-- UPDATE Entity Field Category Info MJ: Entity Action Params.ValueType 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = '995817F0-6F36-EF11-86D4-6045BDEE16E6' AND AutoUpdateCategory = 1;

-- UPDATE Entity Field Category Info MJ: Entity Action Params.Value 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   GeneratedFormSection = 'Category',
   ExtendedType = 'Code',
   CodeType = 'JavaScript'
WHERE 
   ID = '9A5817F0-6F36-EF11-86D4-6045BDEE16E6' AND AutoUpdateCategory = 1;

-- UPDATE Entity Field Category Info MJ: Entity Action Params.Comments 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = '9B5817F0-6F36-EF11-86D4-6045BDEE16E6' AND AutoUpdateCategory = 1;

-- UPDATE Entity Field Category Info MJ: Entity Action Params.ActionParam 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   GeneratedFormSection = 'Category',
   DisplayName = 'Action Parameter Name',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = '9E5817F0-6F36-EF11-86D4-6045BDEE16E6' AND AutoUpdateCategory = 1;

-- UPDATE Entity Field Category Info MJ: Entity Action Params.LogValue 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Parameter Definition',
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = 'CA3B5587-44A5-4266-9CE5-EDAA583DACA2' AND AutoUpdateCategory = 1;

-- UPDATE Entity Field Category Info MJ: Entity Action Params.__mj_CreatedAt 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = '9C5817F0-6F36-EF11-86D4-6045BDEE16E6' AND AutoUpdateCategory = 1;

-- UPDATE Entity Field Category Info MJ: Entity Action Params.__mj_UpdatedAt 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = '9D5817F0-6F36-EF11-86D4-6045BDEE16E6' AND AutoUpdateCategory = 1;

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
   DisplayName = 'Depends On Task ID',
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
   CodeType = 'Other'
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
   Category = 'Dependency Logic',
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = '4CDA9696-9323-4F39-8F1C-5420FC4A3D30' AND AutoUpdateCategory = 1;

-- UPDATE Entity Field Category Info MJ: Task Dependencies.Sequence 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Dependency Logic',
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = 'A7C3836B-046C-46CD-9153-4E39C616F88C' AND AutoUpdateCategory = 1;

-- UPDATE Entity Field Category Info MJ: Task Dependencies.ExclusiveGroup 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Dependency Logic',
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = '1ACD1AF2-0477-47EC-A3CF-9E63C563CC72' AND AutoUpdateCategory = 1;

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
               VALUES ('b77a809f-aee6-431b-852c-d9b5ce5e1bd5', 'DD6EE217-00EC-4DE8-A2E6-489A08D4E524', 'FieldCategoryInfo', '{"Dependency Logic":{"icon":"fa fa-sort-numeric-down","description":"Configuration for workflow branching, priority, and execution order"}}', GETUTCDATE(), GETUTCDATE());

/* Update FieldCategoryIcons setting (legacy) */

               UPDATE [${flyway:defaultSchema}].[EntitySetting]
               SET [Value] = '{"Dependency Logic":"fa fa-sort-numeric-down"}', [__mj_UpdatedAt] = GETUTCDATE()
               WHERE [EntityID] = 'DD6EE217-00EC-4DE8-A2E6-489A08D4E524' AND [Name] = 'FieldCategoryIcons';

/* Set categories for 20 fields */

-- UPDATE Entity Field Category Info MJ: Action Execution Logs.ID 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = '974C17F0-6F36-EF11-86D4-6045BDEE16E6' AND AutoUpdateCategory = 1;

-- UPDATE Entity Field Category Info MJ: Action Execution Logs.RetentionPeriod 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   GeneratedFormSection = 'Category',
   DisplayName = 'Retention Period (Days)',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = '675717F0-6F36-EF11-86D4-6045BDEE16E6' AND AutoUpdateCategory = 1;

-- UPDATE Entity Field Category Info MJ: Action Execution Logs.ActionID 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = '984C17F0-6F36-EF11-86D4-6045BDEE16E6' AND AutoUpdateCategory = 1;

-- UPDATE Entity Field Category Info MJ: Action Execution Logs.UserID 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = '665717F0-6F36-EF11-86D4-6045BDEE16E6' AND AutoUpdateCategory = 1;

-- UPDATE Entity Field Category Info MJ: Action Execution Logs.Action 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   GeneratedFormSection = 'Category',
   DisplayName = 'Action Name',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = '9D4C17F0-6F36-EF11-86D4-6045BDEE16E6' AND AutoUpdateCategory = 1;

-- UPDATE Entity Field Category Info MJ: Action Execution Logs.User 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   GeneratedFormSection = 'Category',
   DisplayName = 'User Name',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = '6E5717F0-6F36-EF11-86D4-6045BDEE16E6' AND AutoUpdateCategory = 1;

-- UPDATE Entity Field Category Info MJ: Action Execution Logs.EntityActionID 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Associated Entities',
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = 'A06BAC2D-D59E-4D0E-BA24-DB99A3D7F4C5' AND AutoUpdateCategory = 1;

-- UPDATE Entity Field Category Info MJ: Action Execution Logs.StartedAt 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = '635717F0-6F36-EF11-86D4-6045BDEE16E6' AND AutoUpdateCategory = 1;

-- UPDATE Entity Field Category Info MJ: Action Execution Logs.EndedAt 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = '645717F0-6F36-EF11-86D4-6045BDEE16E6' AND AutoUpdateCategory = 1;

-- UPDATE Entity Field Category Info MJ: Action Execution Logs.Params 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   GeneratedFormSection = 'Category',
   DisplayName = 'Input Parameters',
   ExtendedType = 'Code',
   CodeType = 'Other'
WHERE 
   ID = 'A94C17F0-6F36-EF11-86D4-6045BDEE16E6' AND AutoUpdateCategory = 1;

-- UPDATE Entity Field Category Info MJ: Action Execution Logs.ResultParams 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Execution Details',
   GeneratedFormSection = 'Category',
   DisplayName = 'Result Parameters',
   ExtendedType = 'Code',
   CodeType = 'Other'
WHERE 
   ID = '1C62E051-5ABE-44B2-919D-44B19AB41BC8' AND AutoUpdateCategory = 1;

-- UPDATE Entity Field Category Info MJ: Action Execution Logs.ResultCode 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = '655717F0-6F36-EF11-86D4-6045BDEE16E6' AND AutoUpdateCategory = 1;

-- UPDATE Entity Field Category Info MJ: Action Execution Logs.Message 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = 'ACF9E782-BB68-4F6E-B6A9-EB120312C97C' AND AutoUpdateCategory = 1;

-- UPDATE Entity Field Category Info MJ: Action Execution Logs.EntityActionInvocationTypeID 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Execution Details',
   GeneratedFormSection = 'Category',
   DisplayName = 'Invocation Type ID',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = '82F166B9-98C5-419B-8CA3-94C75F6923D0' AND AutoUpdateCategory = 1;

-- UPDATE Entity Field Category Info MJ: Action Execution Logs.EntityActionInvocationType 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Execution Details',
   GeneratedFormSection = 'Category',
   DisplayName = 'Invocation Type',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = '9D336063-C666-47EA-B0D5-ED692E81E6E7' AND AutoUpdateCategory = 1;

-- UPDATE Entity Field Category Info MJ: Action Execution Logs.TargetEntityID 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Target Record',
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = '927CFE61-12A6-42FE-9CEF-DD20F4475BA5' AND AutoUpdateCategory = 1;

-- UPDATE Entity Field Category Info MJ: Action Execution Logs.TargetEntity 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Target Record',
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = '898D7496-DF26-4AAF-BA4B-6BE563D78184' AND AutoUpdateCategory = 1;

-- UPDATE Entity Field Category Info MJ: Action Execution Logs.TargetRecordID 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Target Record',
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = 'AA659C40-FE09-430C-B9A6-750263BFDC77' AND AutoUpdateCategory = 1;

-- UPDATE Entity Field Category Info MJ: Action Execution Logs.__mj_CreatedAt 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = 'DE5817F0-6F36-EF11-86D4-6045BDEE16E6' AND AutoUpdateCategory = 1;

-- UPDATE Entity Field Category Info MJ: Action Execution Logs.__mj_UpdatedAt 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = 'DF5817F0-6F36-EF11-86D4-6045BDEE16E6' AND AutoUpdateCategory = 1;

/* Insert FieldCategoryInfo setting for entity */

               INSERT INTO [${flyway:defaultSchema}].[EntitySetting] ([ID], [EntityID], [Name], [Value], [__mj_CreatedAt], [__mj_UpdatedAt])
               VALUES ('63fe2924-70e9-4bae-a409-5e33e84bb7e9', '3E248F34-2837-EF11-86D4-6045BDEE16E6', 'FieldCategoryInfo', '{"Target Record":{"icon":"fa fa-crosshairs","description":"Details regarding the specific entity and record targeted by the action execution"}}', GETUTCDATE(), GETUTCDATE());

/* Update FieldCategoryIcons setting (legacy) */

               UPDATE [${flyway:defaultSchema}].[EntitySetting]
               SET [Value] = '{"Target Record":"fa fa-crosshairs"}', [__mj_UpdatedAt] = GETUTCDATE()
               WHERE [EntityID] = '3E248F34-2837-EF11-86D4-6045BDEE16E6' AND [Name] = 'FieldCategoryIcons';

/* Set categories for 38 fields */

-- UPDATE Entity Field Category Info MJ: Tasks.ID 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = 'FD227316-95F3-468B-8DB8-AEA5E3A4C431' AND AutoUpdateCategory = 1;

-- UPDATE Entity Field Category Info MJ: Tasks.ParentID 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = 'C866D300-E97C-44E7-8848-F3DA97CE3F77' AND AutoUpdateCategory = 1;

-- UPDATE Entity Field Category Info MJ: Tasks.Name 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = '55602C1C-FB4A-4678-A847-7889860791D5' AND AutoUpdateCategory = 1;

-- UPDATE Entity Field Category Info MJ: Tasks.Description 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = '24940E6C-FC69-40F1-9EA6-D860F38FC93F' AND AutoUpdateCategory = 1;

-- UPDATE Entity Field Category Info MJ: Tasks.TypeID 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = 'F8719181-09B2-4C98-86F1-9A7828F46D2B' AND AutoUpdateCategory = 1;

-- UPDATE Entity Field Category Info MJ: Tasks.EnvironmentID 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = '1B80F5CC-B3AD-4C4E-9F64-4C061AC14EC2' AND AutoUpdateCategory = 1;

-- UPDATE Entity Field Category Info MJ: Tasks.ProjectID 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = 'E94662C2-69B9-4603-9BFC-279CFD42A222' AND AutoUpdateCategory = 1;

-- UPDATE Entity Field Category Info MJ: Tasks.ConversationDetailID 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = 'CCE153EB-99AC-42DD-9BF7-628C0E121C62' AND AutoUpdateCategory = 1;

-- UPDATE Entity Field Category Info MJ: Tasks.UserID 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   GeneratedFormSection = 'Category',
   DisplayName = 'Assigned User',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = '9F585440-DA55-4A2A-A48B-2937A3B24483' AND AutoUpdateCategory = 1;

-- UPDATE Entity Field Category Info MJ: Tasks.AgentID 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   GeneratedFormSection = 'Category',
   DisplayName = 'Assigned Agent',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = 'A1E1C7BA-66FA-4BDC-A21A-A27AB8C577C4' AND AutoUpdateCategory = 1;

-- UPDATE Entity Field Category Info MJ: Tasks.Status 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = '9320E9C7-764E-401B-BF2D-A07358E4DD00' AND AutoUpdateCategory = 1;

-- UPDATE Entity Field Category Info MJ: Tasks.PercentComplete 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = '8071305E-E1C1-48BF-AE70-E345D6B892EE' AND AutoUpdateCategory = 1;

-- UPDATE Entity Field Category Info MJ: Tasks.DueAt 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = '97A0A3EA-5563-4C55-9935-397C26BFD00A' AND AutoUpdateCategory = 1;

-- UPDATE Entity Field Category Info MJ: Tasks.StartedAt 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = 'B267C59C-3370-4EDF-A9D4-106D46A6BBF4' AND AutoUpdateCategory = 1;

-- UPDATE Entity Field Category Info MJ: Tasks.CompletedAt 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = 'F09901B1-A4C3-4845-A639-B9730146021A' AND AutoUpdateCategory = 1;

-- UPDATE Entity Field Category Info MJ: Tasks.__mj_CreatedAt 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = '7B6A3F29-48A9-41B8-8374-214F12A5659C' AND AutoUpdateCategory = 1;

-- UPDATE Entity Field Category Info MJ: Tasks.__mj_UpdatedAt 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = '0B5358D5-C6C2-4579-879E-D2BA19D95541' AND AutoUpdateCategory = 1;

-- UPDATE Entity Field Category Info MJ: Tasks.InputPayload 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = '90A53434-F817-472C-AB60-28DB645385E2' AND AutoUpdateCategory = 1;

-- UPDATE Entity Field Category Info MJ: Tasks.OutputPayload 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = '0DBE401E-846B-4BA5-90F5-880F6002BE3A' AND AutoUpdateCategory = 1;

-- UPDATE Entity Field Category Info MJ: Tasks.ErrorMessage 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = '459FABC9-0114-4C9A-BDED-EA8BFE3A01A1' AND AutoUpdateCategory = 1;

-- UPDATE Entity Field Category Info MJ: Tasks.AgentRunID 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = '4BBBBCC7-939D-4263-8E9E-739734722F01' AND AutoUpdateCategory = 1;

-- UPDATE Entity Field Category Info MJ: Tasks.ClaimedBy 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = '7248FCE9-F49E-4E2A-92D8-A9415FC3E032' AND AutoUpdateCategory = 1;

-- UPDATE Entity Field Category Info MJ: Tasks.ClaimExpiresAt 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = 'D1672AB4-9C50-4948-8098-3C19847559B9' AND AutoUpdateCategory = 1;

-- UPDATE Entity Field Category Info MJ: Tasks.ActionID 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = '24EE08A4-B3A0-45D6-8B08-1CF6750B17EB' AND AutoUpdateCategory = 1;

-- UPDATE Entity Field Category Info MJ: Tasks.StepType 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Task Execution Data',
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = '0EFEC745-EB79-4B5F-974E-3EF93A02B3F3' AND AutoUpdateCategory = 1;

-- UPDATE Entity Field Category Info MJ: Tasks.PromptID 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Task Execution Data',
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = '42CF0A0B-1729-468D-AD07-9697999FA8B8' AND AutoUpdateCategory = 1;

-- UPDATE Entity Field Category Info MJ: Tasks.Configuration 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Task Execution Data',
   GeneratedFormSection = 'Category',
   ExtendedType = 'Code',
   CodeType = 'Other'
WHERE 
   ID = '9F4FCD1B-CB01-43E6-8BF5-AF01AF34CE4A' AND AutoUpdateCategory = 1;

-- UPDATE Entity Field Category Info MJ: Tasks.Parent 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   GeneratedFormSection = 'Category',
   DisplayName = 'Parent',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = '2344E41B-6F21-419A-B80F-43636478A814' AND AutoUpdateCategory = 1;

-- UPDATE Entity Field Category Info MJ: Tasks.Type 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   GeneratedFormSection = 'Category',
   DisplayName = 'Type',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = 'E1E5F477-3ABE-4793-BC11-A719CB078463' AND AutoUpdateCategory = 1;

-- UPDATE Entity Field Category Info MJ: Tasks.Environment 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   GeneratedFormSection = 'Category',
   DisplayName = 'Environment',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = '9A8AEAF5-9065-4B87-8A63-B04F84E83886' AND AutoUpdateCategory = 1;

-- UPDATE Entity Field Category Info MJ: Tasks.Project 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   GeneratedFormSection = 'Category',
   DisplayName = 'Project',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = '65ABF2B8-3355-4427-828B-E3082806C557' AND AutoUpdateCategory = 1;

-- UPDATE Entity Field Category Info MJ: Tasks.ConversationDetail 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   GeneratedFormSection = 'Category',
   DisplayName = 'Conversation Detail',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = '2E0A3E85-A949-41A8-9B8B-5303EF016D72' AND AutoUpdateCategory = 1;

-- UPDATE Entity Field Category Info MJ: Tasks.User 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   GeneratedFormSection = 'Category',
   DisplayName = 'User',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = '1EFAD61D-3A38-4CEA-86FE-67463E887920' AND AutoUpdateCategory = 1;

-- UPDATE Entity Field Category Info MJ: Tasks.Agent 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   GeneratedFormSection = 'Category',
   DisplayName = 'Agent',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = 'E7951B0E-3F0A-45DA-BFC3-A4ABB3AC5E0C' AND AutoUpdateCategory = 1;

-- UPDATE Entity Field Category Info MJ: Tasks.AgentRun 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = '24928914-3408-43F5-B68A-83FBE325D603' AND AutoUpdateCategory = 1;

-- UPDATE Entity Field Category Info MJ: Tasks.Action 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   GeneratedFormSection = 'Category',
   DisplayName = 'Action',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = '65D3238C-157A-47EF-AF55-84BF199B7522' AND AutoUpdateCategory = 1;

-- UPDATE Entity Field Category Info MJ: Tasks.Prompt 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Task Execution Data',
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = '35CA8550-1BC0-43C3-997A-D0F237EECE24' AND AutoUpdateCategory = 1;

-- UPDATE Entity Field Category Info MJ: Tasks.RootParentID 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   GeneratedFormSection = 'Category',
   DisplayName = 'Root Parent ID',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = '18585DF4-33D0-4CFC-95E4-6674186DCD9C' AND AutoUpdateCategory = 1;

