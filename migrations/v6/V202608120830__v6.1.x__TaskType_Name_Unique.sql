/* ==============================================================================================
   A task type's Name must identify exactly one row (Round 2, R2-7).

   WHY THIS IS A CORRECTNESS FIX AND NOT HOUSEKEEPING

   `TaskType.Name` has never carried a unique constraint, and until recently nothing depended on it
   being singular. Round 1 changed that: the dispatcher's sweep is now scoped to the `AI Workflow`
   task type, and the two guarded statements that write into a graph parent's payload REQUIRE that
   type ID. So the name is no longer a label — it is the discriminator every dispatcher-owned query
   resolves through.

   The failure it admits:

     1. `ensureTaskType` is SELECT-then-INSERT with no guard, and both it and the dispatcher's own
        resolver read `MaxRows: 1` with no ORDER BY, caching the answer per process.
     2. Two concurrent first-ever submissions can therefore mint two rows both named 'AI Workflow'.
     3. Thereafter different processes can bind different IDs — the order two equally-valid rows come
        back in is not defined.
     4. A graph stamped with the OTHER id is invisible to every sweep arm and refused by both
        TypeID-scoped payload guards. It is never claimed, never settled, and its submitting run
        stays `Paused` forever.

   No errors anywhere. The graph simply belongs to a type nobody is looking for.

   WHAT THIS DOES

   Additive only, per the publish-then-no-breaking-changes policy: one unique index, no column
   changes, no data model change. Nothing that reads TaskType is affected.

   The de-duplication is DEFENSIVE and deliberately conservative. If duplicates already exist, the
   index cannot be created, and silently deleting a row that tasks point at would orphan them. So
   duplicates are merged rather than deleted: the oldest row of each name wins, every task and every
   other reference is repointed at it, and only then are the emptied duplicates removed. On a
   database with no duplicates — which is every database we know of — this section does nothing at
   all.

   No CodeGen is required: this adds an index, not a column. Nothing in the generated ORM changes.
   ============================================================================================== */

-- ---------------------------------------------------------------------------------------------
-- 1. Merge any duplicate names onto their oldest row, so the index below can be created.
-- ---------------------------------------------------------------------------------------------
IF EXISTS (
    SELECT 1 FROM [${flyway:defaultSchema}].[TaskType] GROUP BY [Name] HAVING COUNT(*) > 1
)
BEGIN
    PRINT 'TaskType has duplicate Names; merging each onto its oldest row before adding the unique index.';

    -- The survivor of each name: the earliest-created row. Earliest rather than "any", because it is
    -- the one existing graphs are most likely already stamped with.
    ;WITH Survivors AS (
        SELECT
            [Name],
            [ID] = (
                SELECT TOP 1 inner_tt.[ID]
                FROM [${flyway:defaultSchema}].[TaskType] AS inner_tt
                WHERE inner_tt.[Name] = outer_tt.[Name]
                ORDER BY inner_tt.[__mj_CreatedAt] ASC, inner_tt.[ID] ASC
            )
        FROM [${flyway:defaultSchema}].[TaskType] AS outer_tt
        GROUP BY outer_tt.[Name]
    )
    SELECT s.[Name], s.[ID] AS SurvivorID, d.[ID] AS DuplicateID
    INTO #TaskTypeMerge
    FROM Survivors AS s
    INNER JOIN [${flyway:defaultSchema}].[TaskType] AS d ON d.[Name] = s.[Name] AND d.[ID] <> s.[ID];

    -- Repoint everything that references a duplicate. Tasks first: these are the rows whose
    -- invisibility to the sweep is the whole reason this migration exists.
    UPDATE t
    SET t.[TypeID] = m.[SurvivorID]
    FROM [${flyway:defaultSchema}].[Task] AS t
    INNER JOIN #TaskTypeMerge AS m ON m.[DuplicateID] = t.[TypeID];

    -- Self-reference: a duplicate may be some other type's parent.
    UPDATE tt
    SET tt.[ParentID] = m.[SurvivorID]
    FROM [${flyway:defaultSchema}].[TaskType] AS tt
    INNER JOIN #TaskTypeMerge AS m ON m.[DuplicateID] = tt.[ParentID];

    DELETE tt
    FROM [${flyway:defaultSchema}].[TaskType] AS tt
    INNER JOIN #TaskTypeMerge AS m ON m.[DuplicateID] = tt.[ID];

    DROP TABLE #TaskTypeMerge;
END
GO

-- ---------------------------------------------------------------------------------------------
-- 2. The constraint itself.
-- ---------------------------------------------------------------------------------------------
IF NOT EXISTS (
    SELECT 1 FROM sys.indexes
    WHERE [name] = 'UQ_TaskType_Name' AND [object_id] = OBJECT_ID('${flyway:defaultSchema}.TaskType')
)
BEGIN
    CREATE UNIQUE INDEX [UQ_TaskType_Name] ON [${flyway:defaultSchema}].[TaskType] ([Name]);
END
GO

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'A task type is identified by its Name: the dispatcher resolves ''AI Workflow'' by name to scope every sweep arm and both payload-writing guards, so two rows sharing a name let different processes bind different IDs — and a graph stamped with the other one is invisible to the sweep, never settles, and leaves its submitting run Paused forever, with no error anywhere.',
    @level0type = N'SCHEMA', @level0name = N'${flyway:defaultSchema}',
    @level1type = N'TABLE',  @level1name = N'TaskType',
    @level2type = N'INDEX',  @level2name = N'UQ_TaskType_Name';
GO
