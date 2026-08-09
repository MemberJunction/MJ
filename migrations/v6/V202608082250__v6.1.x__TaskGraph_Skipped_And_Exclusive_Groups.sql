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
