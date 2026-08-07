/* ============================================================================
   Query Materialization — Phase 2: Read-Time Filter Spec
   v6.2.x

   Companion plan: /plans/query-entity-materialization-phase2.md (§4 metadata)

   Phase 2 finishes parameterized RowFilterBroad materialization: the runtime
   provider auto-injects the row-filter predicate at read time (bound params)
   instead of the caller supplying it. To reconstruct the predicate faithfully
   the provider needs the operator + value shape per parameter — not just the
   filter column names (RowFilterColumns). This migration adds:

     - ReadFilterSpec : JSON array of { column, operator, paramName, kind }, the
                        self-sufficient contract CodeGen persists and the provider
                        consumes to build `column <op> value` predicates (values
                        always BOUND, never interpolated). Populated only when
                        ParamMode = 'RowFilterBroad'; NULL otherwise.

   The ALTER is followed by the CodeGen-regenerated MaterializedResult objects
   (EntityField metadata, base view, spCreate/spUpdate procs) for the new column —
   MJ CI does no live codegen, so the generated objects must ship in the committed
   migration. Query-family drift from the same run is excluded (scoped to
   MaterializedResult). The __mj_CreatedAt / __mj_UpdatedAt timestamp columns/triggers
   and FK indexes are handled by CodeGen elsewhere and omitted here.
   ============================================================================ */

ALTER TABLE ${flyway:defaultSchema}.MaterializedResult ADD
    ReadFilterSpec NVARCHAR(MAX) NULL;
GO

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'For a RowFilterBroad materialization, a JSON array of read-time filter predicates — each { column, operator, paramName, kind } — that the runtime provider injects against the broad materialized table when a caller runs the query with DataSource=Materialized. operator is one of the read-time-safe set (=, !=, <>, <, >, <=, >=, IN, NOT IN); kind is scalar or list. Values are always bound as SQL parameters, never interpolated. NULL for non-row-filter materializations.',
    @level0type = N'SCHEMA', @level0name = N'${flyway:defaultSchema}',
    @level1type = N'TABLE',  @level1name = N'MaterializedResult',
    @level2type = N'COLUMN', @level2name = N'ReadFilterSpec';
GO

-- =====================================================================================
-- CodeGen output (MJ: Materialized Results regenerated for the new ReadFilterSpec column):
-- EntityField metadata, base view, and spCreate/spUpdate procs.
-- =====================================================================================

/* SQL text to insert 1 new entity field(s) */

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = 'a3e8c1d2-7b4f-4e6a-9c2d-1f5b8e0a4d76' OR (EntityID = 'E42067ED-8A1E-4ADC-A722-DBFEC2F7DEA0' AND Name = 'ReadFilterSpec')) BEGIN
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
            'a3e8c1d2-7b4f-4e6a-9c2d-1f5b8e0a4d76',
            'E42067ED-8A1E-4ADC-A722-DBFEC2F7DEA0', -- Entity: MJ: Materialized Results
            100053,
            'ReadFilterSpec',
            'Read Filter Spec',
            'For a RowFilterBroad materialization, a JSON array of read-time filter predicates — each { column, operator, paramName, kind } — that the runtime provider injects against the broad materialized table when a caller runs the query with DataSource=Materialized. Values are always bound as SQL parameters, never interpolated. NULL for non-row-filter materializations.',
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
GO

/* Base View SQL for MJ: Materialized Results (regenerated so m.* exposes ReadFilterSpec) */
IF OBJECT_ID('[${flyway:defaultSchema}].[vwMaterializedResults]', 'V') IS NOT NULL
    DROP VIEW [${flyway:defaultSchema}].[vwMaterializedResults];
GO

CREATE VIEW [${flyway:defaultSchema}].[vwMaterializedResults]
AS
SELECT
    m.*,
    MJQuery_SourceQueryID.[Name] AS [SourceQuery],
    MJEntity_SourceEntityID.[Name] AS [SourceEntity],
    MJEntity_GeneratedEntityID.[Name] AS [GeneratedEntity]
FROM
    [${flyway:defaultSchema}].[MaterializedResult] AS m
LEFT OUTER JOIN
    [${flyway:defaultSchema}].[Query] AS MJQuery_SourceQueryID
  ON
    [m].[SourceQueryID] = MJQuery_SourceQueryID.[ID]
LEFT OUTER JOIN
    [${flyway:defaultSchema}].[Entity] AS MJEntity_SourceEntityID
  ON
    [m].[SourceEntityID] = MJEntity_SourceEntityID.[ID]
LEFT OUTER JOIN
    [${flyway:defaultSchema}].[Entity] AS MJEntity_GeneratedEntityID
  ON
    [m].[GeneratedEntityID] = MJEntity_GeneratedEntityID.[ID]
GO
GRANT SELECT ON [${flyway:defaultSchema}].[vwMaterializedResults] TO [cdp_UI], [cdp_Developer], [cdp_Integration];
GO

/* spCreate SQL for MJ: Materialized Results (regenerated for ReadFilterSpec) */
IF OBJECT_ID('[${flyway:defaultSchema}].[spCreateMaterializedResult]', 'P') IS NOT NULL
    DROP PROCEDURE [${flyway:defaultSchema}].[spCreateMaterializedResult];
GO

CREATE PROCEDURE [${flyway:defaultSchema}].[spCreateMaterializedResult]
    @ID uniqueidentifier = NULL,
    @SourceType nvarchar(20),
    @SourceQueryID_Clear bit = 0,
    @SourceQueryID uniqueidentifier = NULL,
    @SourceEntityID_Clear bit = 0,
    @SourceEntityID uniqueidentifier = NULL,
    @GeneratedEntityID_Clear bit = 0,
    @GeneratedEntityID uniqueidentifier = NULL,
    @SchemaName nvarchar(255),
    @TableName nvarchar(255),
    @ViewName nvarchar(255),
    @ParamMode nvarchar(20) = NULL,
    @RefreshStrategy nvarchar(30) = NULL,
    @RefreshSchedule_Clear bit = 0,
    @RefreshSchedule nvarchar(255) = NULL,
    @LastRefreshedAt_Clear bit = 0,
    @LastRefreshedAt datetimeoffset = NULL,
    @NextRefreshAt_Clear bit = 0,
    @NextRefreshAt datetimeoffset = NULL,
    @Watermark_Clear bit = 0,
    @Watermark datetimeoffset = NULL,
    @Status nvarchar(20) = NULL,
    @RowCount_Clear bit = 0,
    @RowCount bigint = NULL,
    @ApproxBuildCostMs_Clear bit = 0,
    @ApproxBuildCostMs bigint = NULL,
    @IntendedWorkload_Clear bit = 0,
    @IntendedWorkload nvarchar(MAX) = NULL,
    @RowFilterColumns_Clear bit = 0,
    @RowFilterColumns nvarchar(MAX) = NULL,
    @BroadSQL_Clear bit = 0,
    @BroadSQL nvarchar(MAX) = NULL,
    @KeyColumns_Clear bit = 0,
    @KeyColumns nvarchar(MAX) = NULL,
    @SourceRowCount_Clear bit = 0,
    @SourceRowCount bigint = NULL,
    @RefreshesSinceFullRebuild int = NULL,
    @ReadFilterSpec_Clear bit = 0,
    @ReadFilterSpec nvarchar(MAX) = NULL
AS
BEGIN
    SET NOCOUNT ON;
    DECLARE @InsertedRow TABLE ([ID] UNIQUEIDENTIFIER)

    IF @ID IS NOT NULL
    BEGIN
        -- User provided a value, use it
        INSERT INTO [${flyway:defaultSchema}].[MaterializedResult]
            (
                [ID],
                [SourceType],
                [SourceQueryID],
                [SourceEntityID],
                [GeneratedEntityID],
                [SchemaName],
                [TableName],
                [ViewName],
                [ParamMode],
                [RefreshStrategy],
                [RefreshSchedule],
                [LastRefreshedAt],
                [NextRefreshAt],
                [Watermark],
                [Status],
                [RowCount],
                [ApproxBuildCostMs],
                [IntendedWorkload],
                [RowFilterColumns],
                [BroadSQL],
                [KeyColumns],
                [SourceRowCount],
                [RefreshesSinceFullRebuild],
                [ReadFilterSpec]
            )
        OUTPUT INSERTED.[ID] INTO @InsertedRow
        VALUES
            (
                @ID,
                @SourceType,
                CASE WHEN @SourceQueryID_Clear = 1 THEN NULL ELSE ISNULL(@SourceQueryID, NULL) END,
                CASE WHEN @SourceEntityID_Clear = 1 THEN NULL ELSE ISNULL(@SourceEntityID, NULL) END,
                CASE WHEN @GeneratedEntityID_Clear = 1 THEN NULL ELSE ISNULL(@GeneratedEntityID, NULL) END,
                @SchemaName,
                @TableName,
                @ViewName,
                ISNULL(@ParamMode, 'None'),
                ISNULL(@RefreshStrategy, 'FullRebuild'),
                CASE WHEN @RefreshSchedule_Clear = 1 THEN NULL ELSE ISNULL(@RefreshSchedule, NULL) END,
                CASE WHEN @LastRefreshedAt_Clear = 1 THEN NULL ELSE ISNULL(@LastRefreshedAt, NULL) END,
                CASE WHEN @NextRefreshAt_Clear = 1 THEN NULL ELSE ISNULL(@NextRefreshAt, NULL) END,
                CASE WHEN @Watermark_Clear = 1 THEN NULL ELSE ISNULL(@Watermark, NULL) END,
                ISNULL(@Status, 'Building'),
                CASE WHEN @RowCount_Clear = 1 THEN NULL ELSE ISNULL(@RowCount, NULL) END,
                CASE WHEN @ApproxBuildCostMs_Clear = 1 THEN NULL ELSE ISNULL(@ApproxBuildCostMs, NULL) END,
                CASE WHEN @IntendedWorkload_Clear = 1 THEN NULL ELSE ISNULL(@IntendedWorkload, NULL) END,
                CASE WHEN @RowFilterColumns_Clear = 1 THEN NULL ELSE ISNULL(@RowFilterColumns, NULL) END,
                CASE WHEN @BroadSQL_Clear = 1 THEN NULL ELSE ISNULL(@BroadSQL, NULL) END,
                CASE WHEN @KeyColumns_Clear = 1 THEN NULL ELSE ISNULL(@KeyColumns, NULL) END,
                CASE WHEN @SourceRowCount_Clear = 1 THEN NULL ELSE ISNULL(@SourceRowCount, NULL) END,
                ISNULL(@RefreshesSinceFullRebuild, 0),
                CASE WHEN @ReadFilterSpec_Clear = 1 THEN NULL ELSE ISNULL(@ReadFilterSpec, NULL) END
            )
    END
    ELSE
    BEGIN
        -- No value provided, let database use its default (e.g., NEWSEQUENTIALID())
        INSERT INTO [${flyway:defaultSchema}].[MaterializedResult]
            (
                [SourceType],
                [SourceQueryID],
                [SourceEntityID],
                [GeneratedEntityID],
                [SchemaName],
                [TableName],
                [ViewName],
                [ParamMode],
                [RefreshStrategy],
                [RefreshSchedule],
                [LastRefreshedAt],
                [NextRefreshAt],
                [Watermark],
                [Status],
                [RowCount],
                [ApproxBuildCostMs],
                [IntendedWorkload],
                [RowFilterColumns],
                [BroadSQL],
                [KeyColumns],
                [SourceRowCount],
                [RefreshesSinceFullRebuild],
                [ReadFilterSpec]
            )
        OUTPUT INSERTED.[ID] INTO @InsertedRow
        VALUES
            (
                @SourceType,
                CASE WHEN @SourceQueryID_Clear = 1 THEN NULL ELSE ISNULL(@SourceQueryID, NULL) END,
                CASE WHEN @SourceEntityID_Clear = 1 THEN NULL ELSE ISNULL(@SourceEntityID, NULL) END,
                CASE WHEN @GeneratedEntityID_Clear = 1 THEN NULL ELSE ISNULL(@GeneratedEntityID, NULL) END,
                @SchemaName,
                @TableName,
                @ViewName,
                ISNULL(@ParamMode, 'None'),
                ISNULL(@RefreshStrategy, 'FullRebuild'),
                CASE WHEN @RefreshSchedule_Clear = 1 THEN NULL ELSE ISNULL(@RefreshSchedule, NULL) END,
                CASE WHEN @LastRefreshedAt_Clear = 1 THEN NULL ELSE ISNULL(@LastRefreshedAt, NULL) END,
                CASE WHEN @NextRefreshAt_Clear = 1 THEN NULL ELSE ISNULL(@NextRefreshAt, NULL) END,
                CASE WHEN @Watermark_Clear = 1 THEN NULL ELSE ISNULL(@Watermark, NULL) END,
                ISNULL(@Status, 'Building'),
                CASE WHEN @RowCount_Clear = 1 THEN NULL ELSE ISNULL(@RowCount, NULL) END,
                CASE WHEN @ApproxBuildCostMs_Clear = 1 THEN NULL ELSE ISNULL(@ApproxBuildCostMs, NULL) END,
                CASE WHEN @IntendedWorkload_Clear = 1 THEN NULL ELSE ISNULL(@IntendedWorkload, NULL) END,
                CASE WHEN @RowFilterColumns_Clear = 1 THEN NULL ELSE ISNULL(@RowFilterColumns, NULL) END,
                CASE WHEN @BroadSQL_Clear = 1 THEN NULL ELSE ISNULL(@BroadSQL, NULL) END,
                CASE WHEN @KeyColumns_Clear = 1 THEN NULL ELSE ISNULL(@KeyColumns, NULL) END,
                CASE WHEN @SourceRowCount_Clear = 1 THEN NULL ELSE ISNULL(@SourceRowCount, NULL) END,
                ISNULL(@RefreshesSinceFullRebuild, 0),
                CASE WHEN @ReadFilterSpec_Clear = 1 THEN NULL ELSE ISNULL(@ReadFilterSpec, NULL) END
            )
    END
    -- return the new record from the base view, which might have some calculated fields
    SELECT * FROM [${flyway:defaultSchema}].[vwMaterializedResults] WHERE [ID] = (SELECT [ID] FROM @InsertedRow)
END
GO
GRANT EXECUTE ON [${flyway:defaultSchema}].[spCreateMaterializedResult] TO [cdp_Developer], [cdp_Integration];
GO

/* spUpdate SQL for MJ: Materialized Results (regenerated for ReadFilterSpec) */
IF OBJECT_ID('[${flyway:defaultSchema}].[spUpdateMaterializedResult]', 'P') IS NOT NULL
    DROP PROCEDURE [${flyway:defaultSchema}].[spUpdateMaterializedResult];
GO

CREATE PROCEDURE [${flyway:defaultSchema}].[spUpdateMaterializedResult]
    @ID uniqueidentifier,
    @SourceType nvarchar(20) = NULL,
    @SourceQueryID_Clear bit = 0,
    @SourceQueryID uniqueidentifier = NULL,
    @SourceEntityID_Clear bit = 0,
    @SourceEntityID uniqueidentifier = NULL,
    @GeneratedEntityID_Clear bit = 0,
    @GeneratedEntityID uniqueidentifier = NULL,
    @SchemaName nvarchar(255) = NULL,
    @TableName nvarchar(255) = NULL,
    @ViewName nvarchar(255) = NULL,
    @ParamMode nvarchar(20) = NULL,
    @RefreshStrategy nvarchar(30) = NULL,
    @RefreshSchedule_Clear bit = 0,
    @RefreshSchedule nvarchar(255) = NULL,
    @LastRefreshedAt_Clear bit = 0,
    @LastRefreshedAt datetimeoffset = NULL,
    @NextRefreshAt_Clear bit = 0,
    @NextRefreshAt datetimeoffset = NULL,
    @Watermark_Clear bit = 0,
    @Watermark datetimeoffset = NULL,
    @Status nvarchar(20) = NULL,
    @RowCount_Clear bit = 0,
    @RowCount bigint = NULL,
    @ApproxBuildCostMs_Clear bit = 0,
    @ApproxBuildCostMs bigint = NULL,
    @IntendedWorkload_Clear bit = 0,
    @IntendedWorkload nvarchar(MAX) = NULL,
    @RowFilterColumns_Clear bit = 0,
    @RowFilterColumns nvarchar(MAX) = NULL,
    @BroadSQL_Clear bit = 0,
    @BroadSQL nvarchar(MAX) = NULL,
    @KeyColumns_Clear bit = 0,
    @KeyColumns nvarchar(MAX) = NULL,
    @SourceRowCount_Clear bit = 0,
    @SourceRowCount bigint = NULL,
    @RefreshesSinceFullRebuild int = NULL,
    @ReadFilterSpec_Clear bit = 0,
    @ReadFilterSpec nvarchar(MAX) = NULL
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE
        [${flyway:defaultSchema}].[MaterializedResult]
    SET
        [SourceType] = ISNULL(@SourceType, [SourceType]),
        [SourceQueryID] = CASE WHEN @SourceQueryID_Clear = 1 THEN NULL ELSE ISNULL(@SourceQueryID, [SourceQueryID]) END,
        [SourceEntityID] = CASE WHEN @SourceEntityID_Clear = 1 THEN NULL ELSE ISNULL(@SourceEntityID, [SourceEntityID]) END,
        [GeneratedEntityID] = CASE WHEN @GeneratedEntityID_Clear = 1 THEN NULL ELSE ISNULL(@GeneratedEntityID, [GeneratedEntityID]) END,
        [SchemaName] = ISNULL(@SchemaName, [SchemaName]),
        [TableName] = ISNULL(@TableName, [TableName]),
        [ViewName] = ISNULL(@ViewName, [ViewName]),
        [ParamMode] = ISNULL(@ParamMode, [ParamMode]),
        [RefreshStrategy] = ISNULL(@RefreshStrategy, [RefreshStrategy]),
        [RefreshSchedule] = CASE WHEN @RefreshSchedule_Clear = 1 THEN NULL ELSE ISNULL(@RefreshSchedule, [RefreshSchedule]) END,
        [LastRefreshedAt] = CASE WHEN @LastRefreshedAt_Clear = 1 THEN NULL ELSE ISNULL(@LastRefreshedAt, [LastRefreshedAt]) END,
        [NextRefreshAt] = CASE WHEN @NextRefreshAt_Clear = 1 THEN NULL ELSE ISNULL(@NextRefreshAt, [NextRefreshAt]) END,
        [Watermark] = CASE WHEN @Watermark_Clear = 1 THEN NULL ELSE ISNULL(@Watermark, [Watermark]) END,
        [Status] = ISNULL(@Status, [Status]),
        [RowCount] = CASE WHEN @RowCount_Clear = 1 THEN NULL ELSE ISNULL(@RowCount, [RowCount]) END,
        [ApproxBuildCostMs] = CASE WHEN @ApproxBuildCostMs_Clear = 1 THEN NULL ELSE ISNULL(@ApproxBuildCostMs, [ApproxBuildCostMs]) END,
        [IntendedWorkload] = CASE WHEN @IntendedWorkload_Clear = 1 THEN NULL ELSE ISNULL(@IntendedWorkload, [IntendedWorkload]) END,
        [RowFilterColumns] = CASE WHEN @RowFilterColumns_Clear = 1 THEN NULL ELSE ISNULL(@RowFilterColumns, [RowFilterColumns]) END,
        [BroadSQL] = CASE WHEN @BroadSQL_Clear = 1 THEN NULL ELSE ISNULL(@BroadSQL, [BroadSQL]) END,
        [KeyColumns] = CASE WHEN @KeyColumns_Clear = 1 THEN NULL ELSE ISNULL(@KeyColumns, [KeyColumns]) END,
        [SourceRowCount] = CASE WHEN @SourceRowCount_Clear = 1 THEN NULL ELSE ISNULL(@SourceRowCount, [SourceRowCount]) END,
        [RefreshesSinceFullRebuild] = ISNULL(@RefreshesSinceFullRebuild, [RefreshesSinceFullRebuild]),
        [ReadFilterSpec] = CASE WHEN @ReadFilterSpec_Clear = 1 THEN NULL ELSE ISNULL(@ReadFilterSpec, [ReadFilterSpec]) END
    WHERE
        [ID] = @ID

    -- Check if the update was successful
    IF @@ROWCOUNT = 0
        -- Nothing was updated, return no rows, but column structure from base view intact, semantically correct this way.
        SELECT TOP 0 * FROM [${flyway:defaultSchema}].[vwMaterializedResults] WHERE 1=0
    ELSE
        -- Return the updated record so the caller can see the updated values and any calculated fields
        SELECT
                                        *
                                    FROM
                                        [${flyway:defaultSchema}].[vwMaterializedResults]
                                    WHERE
                                        [ID] = @ID

END
GO
GRANT EXECUTE ON [${flyway:defaultSchema}].[spUpdateMaterializedResult] TO [cdp_Developer], [cdp_Integration];
GO
