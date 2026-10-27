-- ════════════════════════════════════════════════════════════════════════════════════════
-- Unique keys as column sets; EntityField.IsUnique narrowed to single-column keys (#4536)
--
--  1. EntityUniqueKey: one row per unique index or unique constraint (primary keys excluded) on
--     an entity's base table, with its key columns in key order. CodeGen fills and prunes it
--     from the catalog on every run. Composite uniqueness lives here, not on EntityField.
--
--  2. vwTableUniqueKeys: one row per KEY column of every enabled unique index/constraint.
--     INCLUDE columns are no longer listed. New columns say which index the row belongs to, the
--     column's position in the key, how many key columns the index has, and its filter.
--
--  3. spUpdateExistingEntityFieldsFromSchema: IsUnique = 1 only when the column alone is the key
--     of an unfiltered unique index/constraint, or alone is the primary key. Every column of a
--     composite unique index or composite primary key was marked unique before. The next run
--     clears IsUnique on those columns; soft-PK rows keep their frozen flags as before.
--
--  4. spDeleteEntityWithCoreDependencies: deletes the entity's EntityUniqueKey rows
--     (entity-delete-fk-policy.json carries the matching entry).
--
-- The PostgreSQL counterpart is produced at release; SQLConverter's CatalogViewRule carries the
-- PostgreSQL text of vwTableUniqueKeys.
-- ════════════════════════════════════════════════════════════════════════════════════════


-- ── 1. EntityUniqueKey ──────────────────────────────────────────────────────────────────────
CREATE TABLE [${flyway:defaultSchema}].[EntityUniqueKey] (
    [ID]               UNIQUEIDENTIFIER NOT NULL CONSTRAINT [DF_EntityUniqueKey_ID] DEFAULT (newsequentialid()),
    [EntityID]         UNIQUEIDENTIFIER NOT NULL,
    [Name]             NVARCHAR(255)    NOT NULL,
    [FieldNames]       NVARCHAR(MAX)    NOT NULL,
    [FilterDefinition] NVARCHAR(MAX)    NULL,
    CONSTRAINT [PK_EntityUniqueKey] PRIMARY KEY CLUSTERED ([ID]),
    CONSTRAINT [FK_EntityUniqueKey_Entity] FOREIGN KEY ([EntityID])
        REFERENCES [${flyway:defaultSchema}].[Entity]([ID]),
    CONSTRAINT [UQ_EntityUniqueKey_EntityID_Name] UNIQUE ([EntityID], [Name])
);
GO


-- ── 2. vwTableUniqueKeys ────────────────────────────────────────────────────────────────────
-- Disabled and hypothetical indexes enforce nothing, so they are left out.
CREATE OR ALTER VIEW [${flyway:defaultSchema}].[vwTableUniqueKeys] AS
SELECT
    s.name AS SchemaName,
    t.name AS TableName,
    c.name AS ColumnName,
    i.name AS IndexName,
    CAST(ic.key_ordinal AS INT) AS KeyOrdinal,
    kc.KeyColumnCount,
    i.has_filter AS IsFiltered,
    i.filter_definition AS FilterDefinition
FROM
    sys.tables t
INNER JOIN
    sys.schemas s ON t.schema_id = s.schema_id
INNER JOIN
    sys.indexes i ON t.object_id = i.object_id
INNER JOIN
    sys.index_columns ic ON i.object_id = ic.object_id AND i.index_id = ic.index_id
INNER JOIN
    sys.columns c ON ic.object_id = c.object_id AND c.column_id = ic.column_id
CROSS APPLY (
    SELECT COUNT(*) AS KeyColumnCount
    FROM sys.index_columns k
    WHERE k.object_id = i.object_id
      AND k.index_id = i.index_id
      AND k.is_included_column = 0
) kc
WHERE
    i.is_unique = 1
    AND i.is_primary_key = 0
    AND i.is_disabled = 0
    AND i.is_hypothetical = 0
    AND ic.is_included_column = 0;
GO


-- ── 3. spUpdateExistingEntityFieldsFromSchema ───────────────────────────────────────────────
-- Starts from V202610261530. Changed: #uef_pk carries KeyColumnCount, #uef_uk holds only
-- single-key-column unfiltered unique indexes, and both IsUnique expressions require a
-- single-column primary key.
CREATE OR ALTER PROC [${flyway:defaultSchema}].[spUpdateExistingEntityFieldsFromSchema]
    @ExcludedSchemaNames NVARCHAR(MAX),
    @EntityIDs NVARCHAR(MAX) = NULL,
    @IncludedSchemaNames NVARCHAR(MAX) = NULL
AS
BEGIN
    SET NOCOUNT ON;

    DECLARE @ExcludedSchemas TABLE (SchemaName NVARCHAR(255));
    INSERT INTO @ExcludedSchemas(SchemaName)
    SELECT TRIM(value) FROM STRING_SPLIT(@ExcludedSchemaNames, ',');

    -- Materialize the optional entity scope list once
    DECLARE @ScopedEntityIDs TABLE (EntityID UNIQUEIDENTIFIER PRIMARY KEY);
    DECLARE @IsScoped BIT = 0;
    IF @EntityIDs IS NOT NULL AND LEN(@EntityIDs) > 0
    BEGIN
        INSERT INTO @ScopedEntityIDs (EntityID)
        SELECT DISTINCT TRY_CONVERT(UNIQUEIDENTIFIER, LTRIM(RTRIM(value)))
        FROM STRING_SPLIT(@EntityIDs, ',')
        WHERE LTRIM(RTRIM(value)) <> ''
          AND TRY_CONVERT(UNIQUEIDENTIFIER, LTRIM(RTRIM(value))) IS NOT NULL;
        IF EXISTS (SELECT 1 FROM @ScopedEntityIDs) SET @IsScoped = 1;
    END

    DECLARE @IncludedSchemas TABLE (SchemaName NVARCHAR(255) PRIMARY KEY);
    DECLARE @HasInclude BIT = 0;
    IF @IncludedSchemaNames IS NOT NULL AND LEN(LTRIM(RTRIM(@IncludedSchemaNames))) > 0
    BEGIN
        INSERT INTO @IncludedSchemas (SchemaName)
        SELECT DISTINCT TRIM(value)
        FROM STRING_SPLIT(@IncludedSchemaNames, ',')
        WHERE TRIM(value) <> '';
        IF EXISTS (SELECT 1 FROM @IncludedSchemas) SET @HasInclude = 1;
    END

    -- Materialize catalog-introspection views into #temp tables
    IF OBJECT_ID('tempdb..#uef_cols') IS NOT NULL DROP TABLE #uef_cols;
    SELECT * INTO #uef_cols FROM [${flyway:defaultSchema}].vwSQLColumnsAndEntityFields
        WHERE @IsScoped = 0 OR EntityID IN (SELECT EntityID FROM @ScopedEntityIDs);
    IF OBJECT_ID('tempdb..#uef_fk') IS NOT NULL DROP TABLE #uef_fk;
    SELECT * INTO #uef_fk FROM [${flyway:defaultSchema}].vwForeignKeys;
    IF OBJECT_ID('tempdb..#uef_pk') IS NOT NULL DROP TABLE #uef_pk;
    -- KeyColumnCount: a column of a composite primary key is not unique on its own (#4536).
    SELECT pk.SchemaName, pk.TableName, pk.ColumnName,
           COUNT(*) OVER (PARTITION BY pk.SchemaName, pk.TableName) AS KeyColumnCount
    INTO #uef_pk
    FROM [${flyway:defaultSchema}].vwTablePrimaryKeys pk;
    IF OBJECT_ID('tempdb..#uef_uk') IS NOT NULL DROP TABLE #uef_uk;
    -- Only columns that are, alone, the key of an unfiltered unique index or constraint (#4536).
    -- vwTableUniqueKeys lists every key column of every unique index; composite members, INCLUDE
    -- columns and filtered indexes are not a per-column uniqueness guarantee. Composite keys are
    -- recorded as key sets in EntityUniqueKey instead. DISTINCT: a column can be the sole key of
    -- more than one index.
    SELECT DISTINCT uk.SchemaName, uk.TableName, uk.ColumnName
    INTO #uef_uk
    FROM [${flyway:defaultSchema}].vwTableUniqueKeys uk
    WHERE uk.KeyColumnCount = 1
      AND uk.IsFiltered = 0;

    -- Orphan-tolerant renumber (#4050). A row whose column is no longer in the base view never
    -- joins #uef_cols below, so the renumber cannot move it. If its Sequence sits inside the live
    -- column range, the live field assigned that slot collides on UQ_EntityField_EntityID_Sequence
    -- and the pass fails. Park such orphans above the entity's current maximum first (above every
    -- existing value, so the park itself cannot collide). Orphans already above the live range are
    -- left where they are, so repeated runs do not keep moving them.
    UPDATE ef
    SET ef.Sequence = mx.MaxSequence + o.rn
    FROM [${flyway:defaultSchema}].EntityField ef
    INNER JOIN (
        SELECT
            f.ID,
            f.EntityID,
            ROW_NUMBER() OVER (PARTITION BY f.EntityID ORDER BY f.Sequence, f.Name) AS rn
        FROM [${flyway:defaultSchema}].EntityField f
        INNER JOIN [${flyway:defaultSchema}].Entity e ON e.ID = f.EntityID
        INNER JOIN (
            SELECT EntityID, MAX(Sequence) AS LiveMax FROM #uef_cols GROUP BY EntityID
        ) lm ON lm.EntityID = f.EntityID
        LEFT OUTER JOIN @ExcludedSchemas x ON e.SchemaName = x.SchemaName
        WHERE e.VirtualEntity = 0
          AND x.SchemaName IS NULL
          AND (@HasInclude = 0 OR e.SchemaName IN (SELECT SchemaName FROM @IncludedSchemas))
          AND (@IsScoped = 0 OR e.ID IN (SELECT EntityID FROM @ScopedEntityIDs))
          AND f.Sequence <= lm.LiveMax
          AND NOT EXISTS (
              SELECT 1 FROM #uef_cols c WHERE c.EntityID = f.EntityID AND c.FieldName = f.Name
          )
    ) o ON o.ID = ef.ID
    INNER JOIN (
        SELECT EntityID, MAX(Sequence) AS MaxSequence
        FROM [${flyway:defaultSchema}].EntityField
        GROUP BY EntityID
    ) mx ON mx.EntityID = o.EntityID;

    DECLARE @FilteredRows TABLE (
        EntityID UNIQUEIDENTIFIER,
        EntityName NVARCHAR(500),
        EntityFieldID UNIQUEIDENTIFIER,
        EntityFieldName NVARCHAR(500),
        AutoUpdateDescription BIT,
        ExistingDescription NVARCHAR(MAX),
        SQLDescription NVARCHAR(MAX),
        Type NVARCHAR(255),
        Length INT,
        Precision INT,
        Scale INT,
        AllowsNull BIT,
        DefaultValue NVARCHAR(MAX),
        AutoIncrement BIT,
        IsVirtual BIT,
        IsComputed BIT,
        Sequence INT,
        RelatedEntityID UNIQUEIDENTIFIER,
        RelatedEntityFieldName NVARCHAR(255),
        IsPrimaryKey BIT,
        IsUnique BIT
    );

    INSERT INTO @FilteredRows
    SELECT
        e.ID as EntityID,
        e.Name as EntityName,
        ef.ID AS EntityFieldID,
        ef.Name as EntityFieldName,
        ef.AutoUpdateDescription,
        ef.Description AS ExistingDescription,
        CONVERT(nvarchar(max),fromSQL.Description) AS SQLDescription,
        fromSQL.Type,
        fromSQL.Length,
        fromSQL.Precision,
        fromSQL.Scale,
        fromSQL.AllowsNull,
        CONVERT(nvarchar(max),fromSQL.DefaultValue),
        fromSQL.AutoIncrement,
        fromSQL.IsVirtual,
        fromSQL.IsComputed,
        fromSQL.Sequence,
        re.ID AS RelatedEntityID,
        fk.referenced_column AS RelatedEntityFieldName,
        -- Soft-PK guard: carry the FROZEN flags for soft-PK rows
        CASE WHEN ef.IsSoftPrimaryKey = 1 THEN ef.IsPrimaryKey
             WHEN pk.ColumnName IS NOT NULL THEN 1 ELSE 0 END AS IsPrimaryKey,
        CASE WHEN ef.IsSoftPrimaryKey = 1 THEN ef.IsUnique
             WHEN pk.ColumnName IS NOT NULL AND pk.KeyColumnCount = 1 THEN 1
             ELSE CASE WHEN uk.ColumnName IS NOT NULL THEN 1 ELSE 0 END
        END AS IsUnique
    FROM
        [${flyway:defaultSchema}].EntityField ef
    INNER JOIN
        #uef_cols fromSQL
        ON ef.EntityID = fromSQL.EntityID AND ef.Name = fromSQL.FieldName
    INNER JOIN
        [${flyway:defaultSchema}].Entity e ON ef.EntityID = e.ID
    LEFT OUTER JOIN
        #uef_fk fk
        ON ef.Name = fk.[column]
           AND e.BaseTable = fk.[table]
           AND e.SchemaName = fk.[schema_name]
    LEFT OUTER JOIN
        [${flyway:defaultSchema}].Entity re
        ON re.BaseTable = fk.referenced_table AND re.SchemaName = fk.[referenced_schema]
    LEFT OUTER JOIN
        #uef_pk pk
        ON e.BaseTable = pk.TableName AND ef.Name = pk.ColumnName AND e.SchemaName = pk.SchemaName
    LEFT OUTER JOIN
        #uef_uk uk
        ON e.BaseTable = uk.TableName AND ef.Name = uk.ColumnName AND e.SchemaName = uk.SchemaName
    LEFT OUTER JOIN
        @ExcludedSchemas excludedSchemas ON e.SchemaName = excludedSchemas.SchemaName
    WHERE
        e.VirtualEntity = 0
        AND excludedSchemas.SchemaName IS NULL
        AND (@HasInclude = 0 OR e.SchemaName IN (SELECT SchemaName FROM @IncludedSchemas))
        AND ef.ID IS NOT NULL
        AND (@IsScoped = 0 OR e.ID IN (SELECT EntityID FROM @ScopedEntityIDs))
        AND (
          ISNULL(LTRIM(RTRIM(ef.Description)), '') <> ISNULL(LTRIM(RTRIM(IIF(ef.AutoUpdateDescription=1, CONVERT(NVARCHAR(MAX), fromSQL.Description), ef.Description))), '') OR
          ef.Type <> fromSQL.Type OR
          ef.Length <> fromSQL.Length OR
          ef.Precision <> fromSQL.Precision OR
          ef.Scale <> fromSQL.Scale OR
          ef.AllowsNull <> fromSQL.AllowsNull OR
          ISNULL(LTRIM(RTRIM(ef.DefaultValue)), '') <> ISNULL(LTRIM(RTRIM(CONVERT(NVARCHAR(MAX), fromSQL.DefaultValue))), '') OR
          ef.AutoIncrement <> fromSQL.AutoIncrement OR
          ef.IsVirtual <> fromSQL.IsVirtual OR
          ef.IsComputed <> fromSQL.IsComputed OR
          ef.Sequence <> fromSQL.Sequence OR
          -- Soft-FK guard: wrap RelatedEntity* predicates to respect AutoUpdateRelatedEntityInfo and IsSoftForeignKey.
          -- IS-A inherited rows (#4569) are excluded: their column lives in the parent's table, so the FK
          -- lookup above finds nothing and would null the relationship CodeGen copied from the parent field.
          (ef.AutoUpdateRelatedEntityInfo = 1 AND ef.IsSoftForeignKey = 0
           AND NOT (e.ParentID IS NOT NULL AND ef.IsVirtual = 1 AND ef.AllowUpdateAPI = 1) AND (
              ISNULL(TRY_CONVERT(UNIQUEIDENTIFIER, ef.RelatedEntityID), '00000000-0000-0000-0000-000000000000') <> ISNULL(TRY_CONVERT(UNIQUEIDENTIFIER, re.ID), '00000000-0000-0000-0000-000000000000') OR
              ISNULL(LTRIM(RTRIM(ef.RelatedEntityFieldName)), '') <> ISNULL(LTRIM(RTRIM(fk.referenced_column)), '')
          )) OR
          -- Soft-PK guard: soft-PK rows are never a PK/unique material change
          (ef.IsSoftPrimaryKey = 0 AND ef.IsPrimaryKey <> CASE WHEN pk.ColumnName IS NOT NULL THEN 1 ELSE 0 END) OR
          (ef.IsSoftPrimaryKey = 0 AND ef.IsUnique <> CASE
              WHEN pk.ColumnName IS NOT NULL AND pk.KeyColumnCount = 1 THEN 1
              ELSE CASE WHEN uk.ColumnName IS NOT NULL THEN 1 ELSE 0 END
          END) OR
          -- Detect AllowUpdateAPI that needs clearing on virtual transition
          (ef.AllowUpdateAPI = 1 AND fromSQL.IsVirtual = 1 AND ef.IsVirtual = 0)
        );

    UPDATE ef
    SET
        ef.Description = IIF(fr.AutoUpdateDescription=1, fr.SQLDescription, ef.Description),
        ef.Type = fr.Type,
        ef.Length = fr.Length,
        ef.Precision = fr.Precision,
        ef.Scale = fr.Scale,
        ef.AllowsNull = fr.AllowsNull,
        ef.DefaultValue = fr.DefaultValue,
        ef.AutoIncrement = fr.AutoIncrement,
        ef.IsVirtual = fr.IsVirtual,
        ef.IsComputed = fr.IsComputed,
        ef.Sequence = fr.Sequence,
        -- Soft-FK guard: preserve soft FKs; IS-A inherited rows keep the parent field's relationship
        ef.RelatedEntityID = IIF(ef.AutoUpdateRelatedEntityInfo = 1 AND ef.IsSoftForeignKey = 0
                                 AND NOT (e.ParentID IS NOT NULL AND ef.IsVirtual = 1 AND ef.AllowUpdateAPI = 1),
                                 fr.RelatedEntityID, ef.RelatedEntityID),
        ef.RelatedEntityFieldName = IIF(ef.AutoUpdateRelatedEntityInfo = 1 AND ef.IsSoftForeignKey = 0
                                        AND NOT (e.ParentID IS NOT NULL AND ef.IsVirtual = 1 AND ef.AllowUpdateAPI = 1),
                                        fr.RelatedEntityFieldName, ef.RelatedEntityFieldName),
        -- Soft-PK guard: preserve soft PKs
        ef.IsPrimaryKey = fr.IsPrimaryKey,
        ef.IsUnique = fr.IsUnique,
        ef.AllowUpdateAPI = IIF(fr.IsVirtual = 1 AND ef.IsVirtual = 0, 0, ef.AllowUpdateAPI),
        ef.__mj_UpdatedAt = GETUTCDATE()
    FROM
        [${flyway:defaultSchema}].EntityField ef
    INNER JOIN
        @FilteredRows fr ON ef.ID = fr.EntityFieldID
    INNER JOIN
        [${flyway:defaultSchema}].Entity e ON e.ID = ef.EntityID;

    SELECT * FROM @FilteredRows;
END;
GO
GRANT EXECUTE ON [${flyway:defaultSchema}].[spUpdateExistingEntityFieldsFromSchema] TO [cdp_Developer], [cdp_Integration];
GO


-- ── 4. spDeleteEntityWithCoreDependencies ───────────────────────────────────────────────────
-- Starts from V202610261530. Changed: EntityUniqueKey.EntityID is handled (deleted).
-- Every statement below maps to one entry of entity-delete-fk-policy.json; the coverage test
-- matches them by table and column, so keep the "DELETE FROM [schema].[Table] WHERE [Column]"
-- and "UPDATE [schema].[Table] SET [Column] = NULL" shapes when editing.
CREATE OR ALTER PROC [${flyway:defaultSchema}].[spDeleteEntityWithCoreDependencies]
  @EntityID uniqueidentifier
AS
BEGIN
SET NOCOUNT ON;
SET XACT_ABORT ON;

-- Own the transaction only when the caller has none (CodeGen calls in autocommit; a migration
-- runner may already hold one, and its rollback then covers this proc too).
DECLARE @OwnsTransaction bit = 0;
IF @@TRANCOUNT = 0
BEGIN
    BEGIN TRANSACTION;
    SET @OwnsTransaction = 1;
END

BEGIN TRY

    -- ── Precondition: refuse to start if something not covered by the policy points at this entity ──
    -- @Handled is the policy's delete and null references. A reference marked block
    -- (Entity.ParentID), a core table added after this migration, or an FK from an app schema is
    -- reported here, before anything is deleted.
    DECLARE @blockers nvarchar(max) = N'', @probe nvarchar(max) = N'';

    DECLARE @Handled TABLE (Pair nvarchar(400) PRIMARY KEY);
    INSERT INTO @Handled (Pair) VALUES
      (N'AccessControlRule.EntityID'), (N'ActionExecutionLog.TargetEntityID'),
      (N'AIAgentExample.PrimaryScopeEntityID'), (N'AIAgentNote.PrimaryScopeEntityID'),
      (N'AIAgentRun.PrimaryScopeEntityID'), (N'AIAgentSession.LinkedEntityID'),
      (N'ApplicationEntity.EntityID'), (N'ArchiveConfigurationEntity.EntityID'),
      (N'ArchiveRunDetail.EntityID'), (N'AuditLog.EntityID'), (N'CalendarEventLink.EntityID'),
      (N'ClusterAnalysis.EntityID'), (N'CompanyIntegrationEntityMap.EntityID'),
      (N'CompanyIntegrationRecordMap.EntityID'), (N'CompanyIntegrationRunDetail.EntityID'),
      (N'ContentSource.EntityID'), (N'Conversation.LinkedEntityID'), (N'DataContextItem.EntityID'),
      (N'DatasetItem.EntityID'), (N'DuplicateRun.EntityID'), (N'EntityAction.EntityID'),
      (N'EntityAction.ScopeEntityID'), (N'EntityAIAction.EntityID'), (N'EntityAIAction.OutputEntityID'),
      (N'EntityAlternateBaseView.EntityID'), (N'EntityCommunicationMessageType.EntityID'),
      (N'EntityDocument.EntityID'), (N'EntityField.EntityID'), (N'EntityField.RelatedEntityID'),
      (N'EntityFormContribution.EntityID'), (N'EntityFormContribution.RelatedEntityID'),
      (N'EntityFormOverride.EntityID'), (N'EntityOrganicKey.EntityID'),
      (N'EntityOrganicKeyRelatedEntity.RelatedEntityID'), (N'EntityPermission.EntityID'),
      (N'EntityRecordDocument.EntityID'), (N'EntityRelationship.EntityID'),
      (N'EntityRelationship.RelatedEntityID'), (N'EntitySetting.EntityID'),
      (N'EntityUniqueKey.EntityID'), (N'FeatureValue.EntityID'),
      (N'FileEntityRecordLink.EntityID'), (N'FormChromeRule.EntityID'),
      (N'FormChromeRule.RelatedEntityID'), (N'GeneratedCode.LinkedEntityID'),
      (N'IdentityClaim.EntityID'), (N'IntegrationURLFormat.EntityID'), (N'InteractionLink.EntityID'),
      (N'List.EntityID'), (N'MaterializedResult.GeneratedEntityID'),
      (N'MaterializedResult.SourceEntityID'), (N'MLModelScoringBinding.TargetEntityID'),
      (N'MLTrainingPipeline.TargetEntityID'), (N'ProcessRunDetail.EntityID'), (N'ProcessRun.EntityID'),
      (N'QueryEntity.EntityID'), (N'QueryField.SourceEntityID'),
      (N'RecommendationItem.DestinationEntityID'), (N'Recommendation.SourceEntityID'),
      (N'RecordChange.EntityID'), (N'RecordCloneLogItem.EntityID'), (N'RecordCloneLog.RootEntityID'),
      (N'RecordGeoCode.EntityID'), (N'RecordLink.SourceEntityID'), (N'RecordLink.TargetEntityID'),
      (N'RecordMergeLog.EntityID'), (N'RecordProcess.EntityID'), (N'RecordProcessWatermark.EntityID'),
      (N'ResourceType.CategoryEntityID'), (N'ResourceType.EntityID'),
      (N'RubricEvaluation.ContextEntityID'), (N'RubricEvaluation.SubjectEntityID'),
      (N'ScopedNotificationConfig.PrimaryScopeEntityID'), (N'ScopedPromptConfig.PrimaryScopeEntityID'),
      (N'ScopedPromptPart.PrimaryScopeEntityID'), (N'SearchScopeEntity.EntityID'),
      (N'SignatureRequest.EntityID'), (N'SystemEvent.EntityID'), (N'TaggedItem.EntityID'),
      (N'TagScope.ScopeEntityID'), (N'TemplateParam.EntityID'), (N'TestRun.TargetLogEntityID'),
      (N'UserApplicationEntity.EntityID'), (N'UserFavorite.EntityID'), (N'User.LinkedEntityID'),
      (N'UserRecordLog.EntityID'), (N'UserViewCategory.EntityID'), (N'UserView.EntityID'),
      (N'VersionLabel.EntityID'), (N'VersionLabelItem.EntityID');

    -- FOR XML PATH concatenation is deterministic (the += accumulator idiom is not). Only enabled
    -- NO_ACTION FKs can block the final DELETE; CASCADE / SET NULL / SET DEFAULT and disabled FKs
    -- are cleared or ignored by SQL Server itself.
    SELECT @probe = (
        SELECT DISTINCT
             N' UNION ALL SELECT ''' + REPLACE(SCHEMA_NAME(pt.schema_id) + '.' + pt.name + '.' + pc.name, '''', '''''')
           + N''' WHERE EXISTS (SELECT 1 FROM ' + QUOTENAME(SCHEMA_NAME(pt.schema_id)) + N'.' + QUOTENAME(pt.name)
           + N' WHERE ' + QUOTENAME(pc.name) + N' = @EntityID)'
        FROM sys.foreign_keys fk
        JOIN sys.tables rt ON rt.object_id = fk.referenced_object_id
             AND rt.name = 'Entity' AND SCHEMA_NAME(rt.schema_id) = '${flyway:defaultSchema}'
        JOIN sys.tables pt ON pt.object_id = fk.parent_object_id
        JOIN sys.foreign_key_columns fkc ON fkc.constraint_object_id = fk.object_id
        JOIN sys.columns pc ON pc.object_id = pt.object_id AND pc.column_id = fkc.parent_column_id
        WHERE fk.delete_referential_action = 0
          AND fk.is_disabled = 0
          AND NOT (SCHEMA_NAME(pt.schema_id) = '${flyway:defaultSchema}'
                   AND pt.name + '.' + pc.name IN (SELECT Pair FROM @Handled))
        FOR XML PATH(''), TYPE
    ).value('.', 'nvarchar(max)');

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

    -- ── Rows this proc deletes that other rows can reference: capture their IDs up front ──
    -- (Taken before any delete, so every child statement below sees the full parent set.)
    DECLARE @EntityFieldIDs TABLE (ID uniqueidentifier PRIMARY KEY);
    INSERT INTO @EntityFieldIDs (ID) SELECT ID FROM [${flyway:defaultSchema}].[EntityField] WHERE [EntityID] = @EntityID;

    DECLARE @UserViewIDs TABLE (ID uniqueidentifier PRIMARY KEY);
    INSERT INTO @UserViewIDs (ID) SELECT ID FROM [${flyway:defaultSchema}].[UserView] WHERE [EntityID] = @EntityID;

    DECLARE @UserViewCategoryIDs TABLE (ID uniqueidentifier PRIMARY KEY);
    INSERT INTO @UserViewCategoryIDs (ID) SELECT ID FROM [${flyway:defaultSchema}].[UserViewCategory] WHERE [EntityID] = @EntityID;

    DECLARE @UserViewRunIDs TABLE (ID uniqueidentifier PRIMARY KEY);
    INSERT INTO @UserViewRunIDs (ID) SELECT ID FROM [${flyway:defaultSchema}].[UserViewRun] WHERE [UserViewID] IN (SELECT ID FROM @UserViewIDs);

    DECLARE @ListIDs TABLE (ID uniqueidentifier PRIMARY KEY);
    INSERT INTO @ListIDs (ID) SELECT ID FROM [${flyway:defaultSchema}].[List] WHERE [EntityID] = @EntityID;

    DECLARE @EntityDocumentIDs TABLE (ID uniqueidentifier PRIMARY KEY);
    INSERT INTO @EntityDocumentIDs (ID) SELECT ID FROM [${flyway:defaultSchema}].[EntityDocument] WHERE [EntityID] = @EntityID;

    DECLARE @EntityRecordDocumentIDs TABLE (ID uniqueidentifier PRIMARY KEY);
    INSERT INTO @EntityRecordDocumentIDs (ID) SELECT ID FROM [${flyway:defaultSchema}].[EntityRecordDocument]
        WHERE [EntityID] = @EntityID OR [EntityDocumentID] IN (SELECT ID FROM @EntityDocumentIDs);

    DECLARE @DuplicateRunIDs TABLE (ID uniqueidentifier PRIMARY KEY);
    INSERT INTO @DuplicateRunIDs (ID) SELECT ID FROM [${flyway:defaultSchema}].[DuplicateRun]
        WHERE [EntityID] = @EntityID OR [EntityDocumentID] IN (SELECT ID FROM @EntityDocumentIDs);

    DECLARE @DuplicateRunDetailIDs TABLE (ID uniqueidentifier PRIMARY KEY);
    INSERT INTO @DuplicateRunDetailIDs (ID) SELECT ID FROM [${flyway:defaultSchema}].[DuplicateRunDetail]
        WHERE [DuplicateRunID] IN (SELECT ID FROM @DuplicateRunIDs);

    DECLARE @EntityActionIDs TABLE (ID uniqueidentifier PRIMARY KEY);
    INSERT INTO @EntityActionIDs (ID) SELECT ID FROM [${flyway:defaultSchema}].[EntityAction]
        WHERE [EntityID] = @EntityID OR [ScopeEntityID] = @EntityID;

    DECLARE @AlternateBaseViewIDs TABLE (ID uniqueidentifier PRIMARY KEY);
    INSERT INTO @AlternateBaseViewIDs (ID) SELECT ID FROM [${flyway:defaultSchema}].[EntityAlternateBaseView] WHERE [EntityID] = @EntityID;

    DECLARE @MessageTypeIDs TABLE (ID uniqueidentifier PRIMARY KEY);
    INSERT INTO @MessageTypeIDs (ID) SELECT ID FROM [${flyway:defaultSchema}].[EntityCommunicationMessageType] WHERE [EntityID] = @EntityID;

    DECLARE @OrganicKeyIDs TABLE (ID uniqueidentifier PRIMARY KEY);
    INSERT INTO @OrganicKeyIDs (ID) SELECT ID FROM [${flyway:defaultSchema}].[EntityOrganicKey] WHERE [EntityID] = @EntityID;

    DECLARE @IntegrationEntityMapIDs TABLE (ID uniqueidentifier PRIMARY KEY);
    INSERT INTO @IntegrationEntityMapIDs (ID) SELECT ID FROM [${flyway:defaultSchema}].[CompanyIntegrationEntityMap] WHERE [EntityID] = @EntityID;

    DECLARE @IntegrationRunDetailIDs TABLE (ID uniqueidentifier PRIMARY KEY);
    INSERT INTO @IntegrationRunDetailIDs (ID) SELECT ID FROM [${flyway:defaultSchema}].[CompanyIntegrationRunDetail] WHERE [EntityID] = @EntityID;

    DECLARE @PipelineIDs TABLE (ID uniqueidentifier PRIMARY KEY);
    INSERT INTO @PipelineIDs (ID) SELECT ID FROM [${flyway:defaultSchema}].[MLTrainingPipeline] WHERE [TargetEntityID] = @EntityID;

    DECLARE @MLModelIDs TABLE (ID uniqueidentifier PRIMARY KEY);
    INSERT INTO @MLModelIDs (ID) SELECT ID FROM [${flyway:defaultSchema}].[MLModel] WHERE [PipelineID] IN (SELECT ID FROM @PipelineIDs);

    DECLARE @ProcessRunDetailIDs TABLE (ID uniqueidentifier PRIMARY KEY);
    INSERT INTO @ProcessRunDetailIDs (ID) SELECT ID FROM [${flyway:defaultSchema}].[ProcessRunDetail] WHERE [EntityID] = @EntityID;

    DECLARE @RecommendationIDs TABLE (ID uniqueidentifier PRIMARY KEY);
    INSERT INTO @RecommendationIDs (ID) SELECT ID FROM [${flyway:defaultSchema}].[Recommendation] WHERE [SourceEntityID] = @EntityID;

    DECLARE @RecordCloneLogIDs TABLE (ID uniqueidentifier PRIMARY KEY);
    INSERT INTO @RecordCloneLogIDs (ID) SELECT ID FROM [${flyway:defaultSchema}].[RecordCloneLog] WHERE [RootEntityID] = @EntityID;

    DECLARE @RecordMergeLogIDs TABLE (ID uniqueidentifier PRIMARY KEY);
    INSERT INTO @RecordMergeLogIDs (ID) SELECT ID FROM [${flyway:defaultSchema}].[RecordMergeLog] WHERE [EntityID] = @EntityID;

    DECLARE @RecordProcessIDs TABLE (ID uniqueidentifier PRIMARY KEY);
    INSERT INTO @RecordProcessIDs (ID) SELECT ID FROM [${flyway:defaultSchema}].[RecordProcess] WHERE [EntityID] = @EntityID;

    DECLARE @RubricEvaluationIDs TABLE (ID uniqueidentifier PRIMARY KEY);
    INSERT INTO @RubricEvaluationIDs (ID) SELECT ID FROM [${flyway:defaultSchema}].[RubricEvaluation] WHERE [SubjectEntityID] = @EntityID;

    DECLARE @ResourceTypeIDs TABLE (ID uniqueidentifier PRIMARY KEY);
    INSERT INTO @ResourceTypeIDs (ID) SELECT ID FROM [${flyway:defaultSchema}].[ResourceType] WHERE [EntityID] = @EntityID;

    DECLARE @AgentNoteIDs TABLE (ID uniqueidentifier PRIMARY KEY);
    INSERT INTO @AgentNoteIDs (ID) SELECT ID FROM [${flyway:defaultSchema}].[AIAgentNote] WHERE [PrimaryScopeEntityID] = @EntityID;

    -- RecordChange can be large, so its doomed set stays a subquery instead of a table variable.

    -- ── Nullable references to this entity: cleared, the rows survive ──
    UPDATE [${flyway:defaultSchema}].[ActionExecutionLog] SET [TargetEntityID] = NULL WHERE [TargetEntityID] = @EntityID;
    UPDATE [${flyway:defaultSchema}].[AIAgentRun] SET [PrimaryScopeEntityID] = NULL WHERE [PrimaryScopeEntityID] = @EntityID;
    -- CK_AIAgentSession_LinkBinding / CK_Conversation_LinkBinding: both columns or neither
    UPDATE [${flyway:defaultSchema}].[AIAgentSession] SET [LinkedEntityID] = NULL, [LinkedRecordID] = NULL WHERE [LinkedEntityID] = @EntityID;
    UPDATE [${flyway:defaultSchema}].[AuditLog] SET [EntityID] = NULL WHERE [EntityID] = @EntityID;
    UPDATE [${flyway:defaultSchema}].[ClusterAnalysis] SET [EntityID] = NULL WHERE [EntityID] = @EntityID;
    UPDATE [${flyway:defaultSchema}].[ContentSource] SET [EntityID] = NULL WHERE [EntityID] = @EntityID;
    UPDATE [${flyway:defaultSchema}].[Conversation] SET [LinkedEntityID] = NULL, [LinkedRecordID] = NULL WHERE [LinkedEntityID] = @EntityID;
    UPDATE [${flyway:defaultSchema}].[DataContextItem] SET [EntityID] = NULL WHERE [EntityID] = @EntityID;
    -- Other entities' fields that point AT this entity (#3561)
    UPDATE [${flyway:defaultSchema}].[EntityField] SET [RelatedEntityID] = NULL WHERE [RelatedEntityID] = @EntityID;
    UPDATE [${flyway:defaultSchema}].[GeneratedCode] SET [LinkedEntityID] = NULL WHERE [LinkedEntityID] = @EntityID;
    UPDATE [${flyway:defaultSchema}].[IdentityClaim] SET [EntityID] = NULL WHERE [EntityID] = @EntityID;
    UPDATE [${flyway:defaultSchema}].[MaterializedResult] SET [GeneratedEntityID] = NULL WHERE [GeneratedEntityID] = @EntityID;
    UPDATE [${flyway:defaultSchema}].[MaterializedResult] SET [SourceEntityID] = NULL WHERE [SourceEntityID] = @EntityID;
    UPDATE [${flyway:defaultSchema}].[MLModelScoringBinding] SET [TargetEntityID] = NULL WHERE [TargetEntityID] = @EntityID;
    UPDATE [${flyway:defaultSchema}].[ProcessRun] SET [EntityID] = NULL WHERE [EntityID] = @EntityID;
    UPDATE [${flyway:defaultSchema}].[QueryField] SET [SourceEntityID] = NULL WHERE [SourceEntityID] = @EntityID;
    -- ResourceType references Entity twice; EntityID is a delete (below), CategoryEntityID is cleared (#4483)
    UPDATE [${flyway:defaultSchema}].[ResourceType] SET [CategoryEntityID] = NULL WHERE [CategoryEntityID] = @EntityID;
    -- CK_RubricEvaluation_ContextPair: both columns or neither
    UPDATE [${flyway:defaultSchema}].[RubricEvaluation] SET [ContextEntityID] = NULL, [ContextRecordID] = NULL WHERE [ContextEntityID] = @EntityID;
    UPDATE [${flyway:defaultSchema}].[SignatureRequest] SET [EntityID] = NULL WHERE [EntityID] = @EntityID;
    -- SystemEvent has a physical FK but no entity, so generated metadata does not list it
    UPDATE [${flyway:defaultSchema}].[SystemEvent] SET [EntityID] = NULL WHERE [EntityID] = @EntityID;
    UPDATE [${flyway:defaultSchema}].[TemplateParam] SET [EntityID] = NULL WHERE [EntityID] = @EntityID;
    UPDATE [${flyway:defaultSchema}].[TestRun] SET [TargetLogEntityID] = NULL WHERE [TargetLogEntityID] = @EntityID;
    UPDATE [${flyway:defaultSchema}].[User] SET [LinkedEntityID] = NULL WHERE [LinkedEntityID] = @EntityID;
    UPDATE [${flyway:defaultSchema}].[VersionLabel] SET [EntityID] = NULL WHERE [EntityID] = @EntityID;

    -- ── Nullable references to rows deleted below: cleared first ──
    UPDATE [${flyway:defaultSchema}].[AIAgentNote] SET [ConsolidatedIntoNoteID] = NULL WHERE [ConsolidatedIntoNoteID] IN (SELECT ID FROM @AgentNoteIDs);
    UPDATE [${flyway:defaultSchema}].[ErrorLog] SET [CompanyIntegrationRunDetailID] = NULL WHERE [CompanyIntegrationRunDetailID] IN (SELECT ID FROM @IntegrationRunDetailIDs);
    UPDATE [${flyway:defaultSchema}].[ActionExecutionLog] SET [EntityActionID] = NULL WHERE [EntityActionID] IN (SELECT ID FROM @EntityActionIDs);
    UPDATE [${flyway:defaultSchema}].[EntityAlternateBaseView] SET [ParentID] = NULL WHERE [ParentID] IN (SELECT ID FROM @AlternateBaseViewIDs);
    UPDATE [${flyway:defaultSchema}].[QueryEntity] SET [AlternateBaseViewID] = NULL WHERE [AlternateBaseViewID] IN (SELECT ID FROM @AlternateBaseViewIDs);
    UPDATE [${flyway:defaultSchema}].[ContentSource] SET [EntityDocumentID] = NULL WHERE [EntityDocumentID] IN (SELECT ID FROM @EntityDocumentIDs);
    UPDATE [${flyway:defaultSchema}].[ContentItem] SET [EntityRecordDocumentID] = NULL WHERE [EntityRecordDocumentID] IN (SELECT ID FROM @EntityRecordDocumentIDs);
    UPDATE [${flyway:defaultSchema}].[DuplicateRun] SET [SourceListID] = NULL WHERE [SourceListID] IN (SELECT ID FROM @ListIDs);
    UPDATE [${flyway:defaultSchema}].[RecordProcess] SET [ScopeListID] = NULL WHERE [ScopeListID] IN (SELECT ID FROM @ListIDs);
    UPDATE [${flyway:defaultSchema}].[MLTrainingRun] SET [ResultingModelID] = NULL WHERE [ResultingModelID] IN (SELECT ID FROM @MLModelIDs);
    UPDATE [${flyway:defaultSchema}].[FeatureValue] SET [ProcessRunDetailID] = NULL WHERE [ProcessRunDetailID] IN (SELECT ID FROM @ProcessRunDetailIDs);
    UPDATE [${flyway:defaultSchema}].[RecordChange] SET [RestoredFromID] = NULL
        WHERE [RestoredFromID] IN (SELECT ID FROM [${flyway:defaultSchema}].[RecordChange] WHERE [EntityID] = @EntityID);
    UPDATE [${flyway:defaultSchema}].[DuplicateRunDetailMatch] SET [RecordMergeLogID] = NULL WHERE [RecordMergeLogID] IN (SELECT ID FROM @RecordMergeLogIDs);
    UPDATE [${flyway:defaultSchema}].[FeatureValueCache] SET [RecordProcessID] = NULL WHERE [RecordProcessID] IN (SELECT ID FROM @RecordProcessIDs);
    UPDATE [${flyway:defaultSchema}].[MLModelScoringBinding] SET [RecordProcessID] = NULL WHERE [RecordProcessID] IN (SELECT ID FROM @RecordProcessIDs);
    UPDATE [${flyway:defaultSchema}].[ProcessRun] SET [RecordProcessID] = NULL WHERE [RecordProcessID] IN (SELECT ID FROM @RecordProcessIDs);
    UPDATE [${flyway:defaultSchema}].[MagicLinkInvite] SET [ResourceTypeID] = NULL WHERE [ResourceTypeID] IN (SELECT ID FROM @ResourceTypeIDs);
    UPDATE [${flyway:defaultSchema}].[UserNotification] SET [ResourceTypeID] = NULL WHERE [ResourceTypeID] IN (SELECT ID FROM @ResourceTypeIDs);
    UPDATE [${flyway:defaultSchema}].[RubricEvaluation] SET [SupersedesEvaluationID] = NULL WHERE [SupersedesEvaluationID] IN (SELECT ID FROM @RubricEvaluationIDs);
    UPDATE [${flyway:defaultSchema}].[UserView] SET [CategoryID] = NULL WHERE [CategoryID] IN (SELECT ID FROM @UserViewCategoryIDs);
    UPDATE [${flyway:defaultSchema}].[UserViewCategory] SET [ParentID] = NULL WHERE [ParentID] IN (SELECT ID FROM @UserViewCategoryIDs);
    UPDATE [${flyway:defaultSchema}].[DataContextItem] SET [ViewID] = NULL WHERE [ViewID] IN (SELECT ID FROM @UserViewIDs);
    UPDATE [${flyway:defaultSchema}].[EntityRelationship] SET [DisplayUserViewID] = NULL WHERE [DisplayUserViewID] IN (SELECT ID FROM @UserViewIDs);
    UPDATE [${flyway:defaultSchema}].[List] SET [SourceViewID] = NULL WHERE [SourceViewID] IN (SELECT ID FROM @UserViewIDs);
    UPDATE [${flyway:defaultSchema}].[RecordProcess] SET [ScopeViewID] = NULL WHERE [ScopeViewID] IN (SELECT ID FROM @UserViewIDs);

    -- ── Deletes, children before parents ──

    -- Entity fields: values and permissions first; the EntityField rows go last, just before Entity
    DELETE FROM [${flyway:defaultSchema}].[EntityFieldValue] WHERE [EntityFieldID] IN (SELECT ID FROM @EntityFieldIDs);
    DELETE FROM [${flyway:defaultSchema}].[EntityFieldPermission] WHERE [EntityFieldID] IN (SELECT ID FROM @EntityFieldIDs);

    -- Saved-view run history
    DELETE FROM [${flyway:defaultSchema}].[UserViewRunDetail] WHERE [UserViewRunID] IN (SELECT ID FROM @UserViewRunIDs);
    DELETE FROM [${flyway:defaultSchema}].[UserViewRun] WHERE [UserViewID] IN (SELECT ID FROM @UserViewIDs);

    -- Lists
    DELETE FROM [${flyway:defaultSchema}].[ListDetail] WHERE [ListID] IN (SELECT ID FROM @ListIDs);
    DELETE FROM [${flyway:defaultSchema}].[ListInvitation] WHERE [ListID] IN (SELECT ID FROM @ListIDs);
    DELETE FROM [${flyway:defaultSchema}].[ListShare] WHERE [ListID] IN (SELECT ID FROM @ListIDs);
    DELETE FROM [${flyway:defaultSchema}].[List] WHERE [EntityID] = @EntityID;

    -- Duplicate detection (a run is tied to the entity directly or through its entity document)
    DELETE FROM [${flyway:defaultSchema}].[DuplicateRunDetailMatch] WHERE [DuplicateRunDetailID] IN (SELECT ID FROM @DuplicateRunDetailIDs);
    DELETE FROM [${flyway:defaultSchema}].[DuplicateRunDetail] WHERE [DuplicateRunID] IN (SELECT ID FROM @DuplicateRunIDs);
    DELETE FROM [${flyway:defaultSchema}].[DuplicateRun] WHERE [EntityID] = @EntityID OR [EntityDocumentID] IN (SELECT ID FROM @EntityDocumentIDs);

    -- Entity documents
    DELETE FROM [${flyway:defaultSchema}].[EntityDocumentRun] WHERE [EntityDocumentID] IN (SELECT ID FROM @EntityDocumentIDs);
    DELETE FROM [${flyway:defaultSchema}].[EntityDocumentSetting] WHERE [EntityDocumentID] IN (SELECT ID FROM @EntityDocumentIDs);
    DELETE FROM [${flyway:defaultSchema}].[EntityRecordDocument] WHERE [EntityID] = @EntityID OR [EntityDocumentID] IN (SELECT ID FROM @EntityDocumentIDs);
    DELETE FROM [${flyway:defaultSchema}].[EntityDocument] WHERE [EntityID] = @EntityID;

    -- Entity actions (on this entity, or scoped to one of its records)
    DELETE FROM [${flyway:defaultSchema}].[EntityActionFilter] WHERE [EntityActionID] IN (SELECT ID FROM @EntityActionIDs);
    DELETE FROM [${flyway:defaultSchema}].[EntityActionInvocation] WHERE [EntityActionID] IN (SELECT ID FROM @EntityActionIDs);
    DELETE FROM [${flyway:defaultSchema}].[EntityActionParam] WHERE [EntityActionID] IN (SELECT ID FROM @EntityActionIDs);
    DELETE FROM [${flyway:defaultSchema}].[EntityAction] WHERE [EntityID] = @EntityID OR [ScopeEntityID] = @EntityID;

    -- Communication message types
    DELETE FROM [${flyway:defaultSchema}].[EntityCommunicationField] WHERE [EntityCommunicationMessageTypeID] IN (SELECT ID FROM @MessageTypeIDs);
    DELETE FROM [${flyway:defaultSchema}].[EntityCommunicationMessageType] WHERE [EntityID] = @EntityID;

    -- Organic keys
    DELETE FROM [${flyway:defaultSchema}].[EntityOrganicKeyRelatedEntity] WHERE [RelatedEntityID] = @EntityID OR [EntityOrganicKeyID] IN (SELECT ID FROM @OrganicKeyIDs);
    DELETE FROM [${flyway:defaultSchema}].[EntityOrganicKey] WHERE [EntityID] = @EntityID;

    -- Company integrations
    DELETE FROM [${flyway:defaultSchema}].[CompanyIntegrationFieldMap] WHERE [EntityMapID] IN (SELECT ID FROM @IntegrationEntityMapIDs);
    DELETE FROM [${flyway:defaultSchema}].[CompanyIntegrationSyncWatermark] WHERE [EntityMapID] IN (SELECT ID FROM @IntegrationEntityMapIDs);
    DELETE FROM [${flyway:defaultSchema}].[CompanyIntegrationEntityMap] WHERE [EntityID] = @EntityID;
    DELETE FROM [${flyway:defaultSchema}].[CompanyIntegrationRecordMap] WHERE [EntityID] = @EntityID;
    DELETE FROM [${flyway:defaultSchema}].[CompanyIntegrationRunDetail] WHERE [EntityID] = @EntityID;

    -- ML pipelines targeting this entity, their models, runs and scoring bindings
    DELETE FROM [${flyway:defaultSchema}].[MLModelScoringBinding] WHERE [MLModelID] IN (SELECT ID FROM @MLModelIDs);
    DELETE FROM [${flyway:defaultSchema}].[MLTrainingRun] WHERE [PipelineID] IN (SELECT ID FROM @PipelineIDs);
    DELETE FROM [${flyway:defaultSchema}].[MLModel] WHERE [PipelineID] IN (SELECT ID FROM @PipelineIDs);
    DELETE FROM [${flyway:defaultSchema}].[MLTrainingPipeline] WHERE [TargetEntityID] = @EntityID;

    -- Record processes and feature values
    DELETE FROM [${flyway:defaultSchema}].[FeatureValue] WHERE [EntityID] = @EntityID OR [RecordProcessID] IN (SELECT ID FROM @RecordProcessIDs);
    DELETE FROM [${flyway:defaultSchema}].[FeaturePipelineVersion] WHERE [RecordProcessID] IN (SELECT ID FROM @RecordProcessIDs);
    DELETE FROM [${flyway:defaultSchema}].[RecordProcessWatermark] WHERE [EntityID] = @EntityID OR [RecordProcessID] IN (SELECT ID FROM @RecordProcessIDs);
    DELETE FROM [${flyway:defaultSchema}].[RecordProcess] WHERE [EntityID] = @EntityID;
    DELETE FROM [${flyway:defaultSchema}].[ProcessRunDetail] WHERE [EntityID] = @EntityID;

    -- Recommendations
    DELETE FROM [${flyway:defaultSchema}].[RecommendationItem] WHERE [DestinationEntityID] = @EntityID OR [RecommendationID] IN (SELECT ID FROM @RecommendationIDs);
    DELETE FROM [${flyway:defaultSchema}].[Recommendation] WHERE [SourceEntityID] = @EntityID;

    -- Record history: version labels, changes, clone and merge logs
    DELETE FROM [${flyway:defaultSchema}].[VersionLabelItem] WHERE [EntityID] = @EntityID
        OR [RecordChangeID] IN (SELECT ID FROM [${flyway:defaultSchema}].[RecordChange] WHERE [EntityID] = @EntityID);
    DELETE FROM [${flyway:defaultSchema}].[RecordChange] WHERE [EntityID] = @EntityID;
    DELETE FROM [${flyway:defaultSchema}].[RecordCloneLogItem] WHERE [EntityID] = @EntityID OR [RecordCloneLogID] IN (SELECT ID FROM @RecordCloneLogIDs);
    DELETE FROM [${flyway:defaultSchema}].[RecordCloneLog] WHERE [RootEntityID] = @EntityID;
    DELETE FROM [${flyway:defaultSchema}].[RecordMergeDeletionLog] WHERE [RecordMergeLogID] IN (SELECT ID FROM @RecordMergeLogIDs);
    DELETE FROM [${flyway:defaultSchema}].[RecordMergeLog] WHERE [EntityID] = @EntityID;

    -- Rubric evaluations of this entity's records
    DELETE FROM [${flyway:defaultSchema}].[RubricEvaluationScore] WHERE [EvaluationID] IN (SELECT ID FROM @RubricEvaluationIDs);
    DELETE FROM [${flyway:defaultSchema}].[RubricEvaluation] WHERE [SubjectEntityID] = @EntityID;

    -- Resource types for this entity, with their links, permissions and workspace items
    DELETE FROM [${flyway:defaultSchema}].[ResourceLink] WHERE [ResourceTypeID] IN (SELECT ID FROM @ResourceTypeIDs);
    DELETE FROM [${flyway:defaultSchema}].[ResourcePermission] WHERE [ResourceTypeID] IN (SELECT ID FROM @ResourceTypeIDs);
    DELETE FROM [${flyway:defaultSchema}].[WorkspaceItem] WHERE [ResourceTypeID] IN (SELECT ID FROM @ResourceTypeIDs);
    DELETE FROM [${flyway:defaultSchema}].[ResourceType] WHERE [EntityID] = @EntityID;

    -- Scope columns whose NULL means "global": delete rather than widen the scope
    DELETE FROM [${flyway:defaultSchema}].[AIAgentNote] WHERE [PrimaryScopeEntityID] = @EntityID;
    DELETE FROM [${flyway:defaultSchema}].[AIAgentExample] WHERE [PrimaryScopeEntityID] = @EntityID;
    DELETE FROM [${flyway:defaultSchema}].[ScopedNotificationConfig] WHERE [PrimaryScopeEntityID] = @EntityID;
    DELETE FROM [${flyway:defaultSchema}].[ScopedPromptConfig] WHERE [PrimaryScopeEntityID] = @EntityID;
    DELETE FROM [${flyway:defaultSchema}].[ScopedPromptPart] WHERE [PrimaryScopeEntityID] = @EntityID;

    -- Datasets: bump the parent so cached datasets refresh, then drop the item
    UPDATE [${flyway:defaultSchema}].[Dataset] SET [__mj_UpdatedAt] = GETUTCDATE()
        WHERE [ID] IN (SELECT [DatasetID] FROM [${flyway:defaultSchema}].[DatasetItem] WHERE [EntityID] = @EntityID);
    DELETE FROM [${flyway:defaultSchema}].[DatasetItem] WHERE [EntityID] = @EntityID;

    -- Saved views, then their categories (UserView.CategoryID was cleared above)
    DELETE FROM [${flyway:defaultSchema}].[UserView] WHERE [EntityID] = @EntityID;
    DELETE FROM [${flyway:defaultSchema}].[UserViewCategory] WHERE [EntityID] = @EntityID;

    -- Rows with no dependents of their own
    DELETE FROM [${flyway:defaultSchema}].[AccessControlRule] WHERE [EntityID] = @EntityID;
    DELETE FROM [${flyway:defaultSchema}].[ApplicationEntity] WHERE [EntityID] = @EntityID;
    DELETE FROM [${flyway:defaultSchema}].[ArchiveConfigurationEntity] WHERE [EntityID] = @EntityID;
    DELETE FROM [${flyway:defaultSchema}].[ArchiveRunDetail] WHERE [EntityID] = @EntityID;
    DELETE FROM [${flyway:defaultSchema}].[CalendarEventLink] WHERE [EntityID] = @EntityID;
    DELETE FROM [${flyway:defaultSchema}].[EntityAIAction] WHERE [EntityID] = @EntityID OR [OutputEntityID] = @EntityID;
    DELETE FROM [${flyway:defaultSchema}].[EntityAlternateBaseView] WHERE [EntityID] = @EntityID;
    DELETE FROM [${flyway:defaultSchema}].[EntityFormContribution] WHERE [EntityID] = @EntityID OR [RelatedEntityID] = @EntityID;
    DELETE FROM [${flyway:defaultSchema}].[EntityFormOverride] WHERE [EntityID] = @EntityID;
    DELETE FROM [${flyway:defaultSchema}].[EntityPermission] WHERE [EntityID] = @EntityID;
    DELETE FROM [${flyway:defaultSchema}].[EntityRelationship] WHERE [EntityID] = @EntityID OR [RelatedEntityID] = @EntityID;
    DELETE FROM [${flyway:defaultSchema}].[EntitySetting] WHERE [EntityID] = @EntityID;
    DELETE FROM [${flyway:defaultSchema}].[EntityUniqueKey] WHERE [EntityID] = @EntityID;
    DELETE FROM [${flyway:defaultSchema}].[FileEntityRecordLink] WHERE [EntityID] = @EntityID;
    DELETE FROM [${flyway:defaultSchema}].[FormChromeRule] WHERE [EntityID] = @EntityID OR [RelatedEntityID] = @EntityID;
    DELETE FROM [${flyway:defaultSchema}].[IntegrationURLFormat] WHERE [EntityID] = @EntityID;
    DELETE FROM [${flyway:defaultSchema}].[InteractionLink] WHERE [EntityID] = @EntityID;
    DELETE FROM [${flyway:defaultSchema}].[QueryEntity] WHERE [EntityID] = @EntityID;
    DELETE FROM [${flyway:defaultSchema}].[RecordGeoCode] WHERE [EntityID] = @EntityID;
    DELETE FROM [${flyway:defaultSchema}].[RecordLink] WHERE [SourceEntityID] = @EntityID OR [TargetEntityID] = @EntityID;
    DELETE FROM [${flyway:defaultSchema}].[SearchScopeEntity] WHERE [EntityID] = @EntityID;
    DELETE FROM [${flyway:defaultSchema}].[TaggedItem] WHERE [EntityID] = @EntityID;
    DELETE FROM [${flyway:defaultSchema}].[TagScope] WHERE [ScopeEntityID] = @EntityID;
    DELETE FROM [${flyway:defaultSchema}].[UserApplicationEntity] WHERE [EntityID] = @EntityID;
    DELETE FROM [${flyway:defaultSchema}].[UserFavorite] WHERE [EntityID] = @EntityID;
    DELETE FROM [${flyway:defaultSchema}].[UserRecordLog] WHERE [EntityID] = @EntityID;

    -- The entity's own fields, then the entity
    DELETE FROM [${flyway:defaultSchema}].[EntityField] WHERE [EntityID] = @EntityID;
    DELETE FROM [${flyway:defaultSchema}].[Entity] WHERE [ID] = @EntityID;

    IF @OwnsTransaction = 1 COMMIT TRANSACTION;
END TRY
BEGIN CATCH
    IF @OwnsTransaction = 1 AND @@TRANCOUNT > 0 ROLLBACK TRANSACTION;
    THROW;
END CATCH
END
GO


-- ── 5. Extended properties ──────────────────────────────────────────────────────────────────
EXEC sp_addextendedproperty @name = N'MS_Description',
    @value = N'Unique keys of an entity''s base table as column sets: one row per unique index or unique constraint, primary keys excluded. Maintained by CodeGen from the database catalog on every run; edits are overwritten. EntityField.IsUnique is set only when a column alone is such a key, so a composite key appears here and not on its columns.',
    @level0type = N'SCHEMA', @level0name = N'${flyway:defaultSchema}',
    @level1type = N'TABLE',  @level1name = N'EntityUniqueKey';

EXEC sp_addextendedproperty @name = N'MS_Description',
    @value = N'Entity whose base table has this unique key.',
    @level0type = N'SCHEMA', @level0name = N'${flyway:defaultSchema}',
    @level1type = N'TABLE',  @level1name = N'EntityUniqueKey',
    @level2type = N'COLUMN', @level2name = N'EntityID';

EXEC sp_addextendedproperty @name = N'MS_Description',
    @value = N'Name of the unique index or unique constraint in the database.',
    @level0type = N'SCHEMA', @level0name = N'${flyway:defaultSchema}',
    @level1type = N'TABLE',  @level1name = N'EntityUniqueKey',
    @level2type = N'COLUMN', @level2name = N'Name';

EXEC sp_addextendedproperty @name = N'MS_Description',
    @value = N'Comma-separated names of the key columns, in key order. INCLUDE columns are not part of the key and are not listed.',
    @level0type = N'SCHEMA', @level0name = N'${flyway:defaultSchema}',
    @level1type = N'TABLE',  @level1name = N'EntityUniqueKey',
    @level2type = N'COLUMN', @level2name = N'FieldNames';

EXEC sp_addextendedproperty @name = N'MS_Description',
    @value = N'Predicate of a filtered (SQL Server) or partial (PostgreSQL) unique index, as the database reports it. NULL when the key applies to every row. A filtered key only guarantees uniqueness among the rows that match it.',
    @level0type = N'SCHEMA', @level0name = N'${flyway:defaultSchema}',
    @level1type = N'TABLE',  @level1name = N'EntityUniqueKey',
    @level2type = N'COLUMN', @level2name = N'FilterDefinition';























































-- =============================================================================
-- =============================================================================
-- =============================================================================
--
--                    CODEGEN OUTPUT BELOW THIS LINE
--
-- Everything below this block was generated by the MemberJunction CodeGen tool
-- after the hand-written DDL above was applied to a clean database built from
-- the committed migrations and metadata. It contains the new MJ: Entity Unique
-- Keys entity: its Entity and EntityField metadata, the vwEntityUniqueKeys base
-- view, the spCreate / spUpdate / spDelete procedures and their permission
-- grants, and the unique-key rows CodeGen read from the core schema's catalog.
--
-- DO NOT EDIT BY HAND. If the hand-written DDL above changes, re-run CodeGen
-- and replace this entire section with the fresh output.
--
-- =============================================================================
-- =============================================================================
-- =============================================================================

/* SQL generated to create new entity MJ: Entity Unique Keys */

      INSERT INTO [${flyway:defaultSchema}].[Entity] (
         [ID],
         [Name],
         [DisplayName],
         [Description],
         [NameSuffix],
         [BaseTable],
         [BaseView],
         [SchemaName],
         [IncludeInAPI],
         [AllowUserSearchAPI],
         [AllowCaching],
         [TrackRecordChanges],
         [AuditRecordAccess],
         [AuditViewRuns],
         [AllowAllRowsAPI],
         [AllowCreateAPI],
         [AllowUpdateAPI],
         [AllowDeleteAPI],
         [UserViewMaxRows]
         , [__mj_CreatedAt]
         , [__mj_UpdatedAt]
      )
      VALUES (
         'd7b47afc-c1f3-48d0-9c92-839f52fa5a4f',
         'MJ: Entity Unique Keys',
         'Entity Unique Keys',
         'Unique keys of an entity''s base table as column sets: one row per unique index or unique constraint, primary keys excluded. Maintained by CodeGen from the database catalog on every run; edits are overwritten. EntityField.IsUnique is set only when a column alone is such a key, so a composite key appears here and not on its columns.',
         NULL,
         'EntityUniqueKey',
         'vwEntityUniqueKeys',
         '${flyway:defaultSchema}',
         1,
         1,
         1,
         1,
         0,
         0,
         0,
         1,
         1,
         1,
         1000
         , GETUTCDATE()
         , GETUTCDATE()
      );

/* SQL generated to add new entity MJ: Entity Unique Keys to application ID: 'EBA5CCEC-6A37-EF11-86D4-000D3A4E707E' */
INSERT INTO [${flyway:defaultSchema}].[ApplicationEntity]
                                       ([ApplicationID], [EntityID], [Sequence], [__mj_CreatedAt], [__mj_UpdatedAt]) VALUES
                                       ('EBA5CCEC-6A37-EF11-86D4-000D3A4E707E', 'd7b47afc-c1f3-48d0-9c92-839f52fa5a4f', (SELECT COALESCE(MAX([Sequence]),0)+1 FROM [${flyway:defaultSchema}].[ApplicationEntity] WHERE [ApplicationID] = 'EBA5CCEC-6A37-EF11-86D4-000D3A4E707E'), GETUTCDATE(), GETUTCDATE());

/* SQL generated to add new permission for entity MJ: Entity Unique Keys for role UI */
INSERT INTO [${flyway:defaultSchema}].[EntityPermission]
                ([EntityID], [RoleID], [Type], [CanRead], [CanCreate], [CanUpdate], [CanDelete], [__mj_CreatedAt], [__mj_UpdatedAt])
              SELECT CAST('d7b47afc-c1f3-48d0-9c92-839f52fa5a4f' AS uniqueidentifier), CAST('E0AFCCEC-6A37-EF11-86D4-000D3A4E707E' AS uniqueidentifier), 'Allow', 1, 0, 0, 0, GETUTCDATE(), GETUTCDATE()
              WHERE NOT EXISTS (
                SELECT 1 FROM [${flyway:defaultSchema}].[EntityPermission]
                WHERE [EntityID] = CAST('d7b47afc-c1f3-48d0-9c92-839f52fa5a4f' AS uniqueidentifier) AND [RoleID] = CAST('E0AFCCEC-6A37-EF11-86D4-000D3A4E707E' AS uniqueidentifier) AND [Type] = 'Allow'
              );

/* SQL generated to add new permission for entity MJ: Entity Unique Keys for role Developer */
INSERT INTO [${flyway:defaultSchema}].[EntityPermission]
                ([EntityID], [RoleID], [Type], [CanRead], [CanCreate], [CanUpdate], [CanDelete], [__mj_CreatedAt], [__mj_UpdatedAt])
              SELECT CAST('d7b47afc-c1f3-48d0-9c92-839f52fa5a4f' AS uniqueidentifier), CAST('DEAFCCEC-6A37-EF11-86D4-000D3A4E707E' AS uniqueidentifier), 'Allow', 1, 1, 1, 1, GETUTCDATE(), GETUTCDATE()
              WHERE NOT EXISTS (
                SELECT 1 FROM [${flyway:defaultSchema}].[EntityPermission]
                WHERE [EntityID] = CAST('d7b47afc-c1f3-48d0-9c92-839f52fa5a4f' AS uniqueidentifier) AND [RoleID] = CAST('DEAFCCEC-6A37-EF11-86D4-000D3A4E707E' AS uniqueidentifier) AND [Type] = 'Allow'
              );

/* SQL generated to add new permission for entity MJ: Entity Unique Keys for role Integration */
INSERT INTO [${flyway:defaultSchema}].[EntityPermission]
                ([EntityID], [RoleID], [Type], [CanRead], [CanCreate], [CanUpdate], [CanDelete], [__mj_CreatedAt], [__mj_UpdatedAt])
              SELECT CAST('d7b47afc-c1f3-48d0-9c92-839f52fa5a4f' AS uniqueidentifier), CAST('DFAFCCEC-6A37-EF11-86D4-000D3A4E707E' AS uniqueidentifier), 'Allow', 1, 1, 1, 1, GETUTCDATE(), GETUTCDATE()
              WHERE NOT EXISTS (
                SELECT 1 FROM [${flyway:defaultSchema}].[EntityPermission]
                WHERE [EntityID] = CAST('d7b47afc-c1f3-48d0-9c92-839f52fa5a4f' AS uniqueidentifier) AND [RoleID] = CAST('DFAFCCEC-6A37-EF11-86D4-000D3A4E707E' AS uniqueidentifier) AND [Type] = 'Allow'
              );

/* SQL text to add special date field __mj_CreatedAt to entity ${flyway:defaultSchema}.EntityUniqueKey */
ALTER TABLE [${flyway:defaultSchema}].[EntityUniqueKey] ADD [__mj_CreatedAt] DATETIMEOFFSET NULL;
GO

/* SQL text to add special date field __mj_CreatedAt to entity ${flyway:defaultSchema}.EntityUniqueKey */
UPDATE [${flyway:defaultSchema}].[EntityUniqueKey] SET [__mj_CreatedAt] = GETUTCDATE() WHERE [__mj_CreatedAt] IS NULL;
GO

/* SQL text to add special date field __mj_CreatedAt to entity ${flyway:defaultSchema}.EntityUniqueKey */
ALTER TABLE [${flyway:defaultSchema}].[EntityUniqueKey] ALTER COLUMN [__mj_CreatedAt] DATETIMEOFFSET NOT NULL;
GO

/* SQL text to add special date field __mj_CreatedAt to entity ${flyway:defaultSchema}.EntityUniqueKey */
ALTER TABLE [${flyway:defaultSchema}].[EntityUniqueKey] ADD CONSTRAINT [DF___mj_EntityUniqueKey___mj_CreatedAt] DEFAULT GETUTCDATE() FOR [__mj_CreatedAt];
GO

/* SQL text to add special date field __mj_UpdatedAt to entity ${flyway:defaultSchema}.EntityUniqueKey */
ALTER TABLE [${flyway:defaultSchema}].[EntityUniqueKey] ADD [__mj_UpdatedAt] DATETIMEOFFSET NULL;
GO

/* SQL text to add special date field __mj_UpdatedAt to entity ${flyway:defaultSchema}.EntityUniqueKey */
UPDATE [${flyway:defaultSchema}].[EntityUniqueKey] SET [__mj_UpdatedAt] = GETUTCDATE() WHERE [__mj_UpdatedAt] IS NULL;
GO

/* SQL text to add special date field __mj_UpdatedAt to entity ${flyway:defaultSchema}.EntityUniqueKey */
ALTER TABLE [${flyway:defaultSchema}].[EntityUniqueKey] ALTER COLUMN [__mj_UpdatedAt] DATETIMEOFFSET NOT NULL;
GO

/* SQL text to add special date field __mj_UpdatedAt to entity ${flyway:defaultSchema}.EntityUniqueKey */
ALTER TABLE [${flyway:defaultSchema}].[EntityUniqueKey] ADD CONSTRAINT [DF___mj_EntityUniqueKey___mj_UpdatedAt] DEFAULT GETUTCDATE() FOR [__mj_UpdatedAt];
GO

/* SQL text to insert 7 new entity field(s) */

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = 'a4791a89-4b20-4392-a07a-eb8dd50a2806' OR (EntityID = 'D7B47AFC-C1F3-48D0-9C92-839F52FA5A4F' AND Name = 'ID')) BEGIN
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
            'a4791a89-4b20-4392-a07a-eb8dd50a2806',
            'D7B47AFC-C1F3-48D0-9C92-839F52FA5A4F', -- Entity: MJ: Entity Unique Keys
            (SELECT COALESCE(MAX([Sequence]), 0) + 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE [EntityID] = 'D7B47AFC-C1F3-48D0-9C92-839F52FA5A4F'),
            'ID',
            'ID',
            NULL,
            'uniqueidentifier',
            16,
            0,
            0,
            0,
            'newsequentialid()',
            0,
            0,
            0,
            0,
            NULL,
            NULL,
            0,
            0,
            0,
            0,
            1,
            1,
            'Search',
            GETUTCDATE(),
            GETUTCDATE()
         )
      END;

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = 'f626efc0-570f-40b3-b12d-9b869a02298b' OR (EntityID = 'D7B47AFC-C1F3-48D0-9C92-839F52FA5A4F' AND Name = 'EntityID')) BEGIN
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
            'f626efc0-570f-40b3-b12d-9b869a02298b',
            'D7B47AFC-C1F3-48D0-9C92-839F52FA5A4F', -- Entity: MJ: Entity Unique Keys
            (SELECT COALESCE(MAX([Sequence]), 0) + 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE [EntityID] = 'D7B47AFC-C1F3-48D0-9C92-839F52FA5A4F'),
            'EntityID',
            'Entity ID',
            'Entity whose base table has this unique key.',
            'uniqueidentifier',
            16,
            0,
            0,
            0,
            NULL,
            0,
            1,
            0,
            0,
            'E0238F34-2837-EF11-86D4-6045BDEE16E6',
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = 'add49c45-cf08-442a-bb29-13747cd58e93' OR (EntityID = 'D7B47AFC-C1F3-48D0-9C92-839F52FA5A4F' AND Name = 'Name')) BEGIN
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
            'add49c45-cf08-442a-bb29-13747cd58e93',
            'D7B47AFC-C1F3-48D0-9C92-839F52FA5A4F', -- Entity: MJ: Entity Unique Keys
            (SELECT COALESCE(MAX([Sequence]), 0) + 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE [EntityID] = 'D7B47AFC-C1F3-48D0-9C92-839F52FA5A4F'),
            'Name',
            'Name',
            'Name of the unique index or unique constraint in the database.',
            'nvarchar',
            510,
            0,
            0,
            0,
            NULL,
            0,
            1,
            0,
            0,
            NULL,
            NULL,
            1,
            1,
            0,
            1,
            0,
            0,
            'Search',
            GETUTCDATE(),
            GETUTCDATE()
         )
      END;

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '1060bd88-a92f-4b8a-81d3-b1a61dee5baf' OR (EntityID = 'D7B47AFC-C1F3-48D0-9C92-839F52FA5A4F' AND Name = 'FieldNames')) BEGIN
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
            '1060bd88-a92f-4b8a-81d3-b1a61dee5baf',
            'D7B47AFC-C1F3-48D0-9C92-839F52FA5A4F', -- Entity: MJ: Entity Unique Keys
            (SELECT COALESCE(MAX([Sequence]), 0) + 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE [EntityID] = 'D7B47AFC-C1F3-48D0-9C92-839F52FA5A4F'),
            'FieldNames',
            'Field Names',
            'Comma-separated names of the key columns, in key order. INCLUDE columns are not part of the key and are not listed.',
            'nvarchar',
            -1,
            0,
            0,
            0,
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
            1,
            0,
            0,
            'Search',
            GETUTCDATE(),
            GETUTCDATE()
         )
      END;

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = 'c1149a3a-deca-42f6-a2ac-acac8ef0633d' OR (EntityID = 'D7B47AFC-C1F3-48D0-9C92-839F52FA5A4F' AND Name = 'FilterDefinition')) BEGIN
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
            'c1149a3a-deca-42f6-a2ac-acac8ef0633d',
            'D7B47AFC-C1F3-48D0-9C92-839F52FA5A4F', -- Entity: MJ: Entity Unique Keys
            (SELECT COALESCE(MAX([Sequence]), 0) + 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE [EntityID] = 'D7B47AFC-C1F3-48D0-9C92-839F52FA5A4F'),
            'FilterDefinition',
            'Filter Definition',
            'Predicate of a filtered (SQL Server) or partial (PostgreSQL) unique index, as the database reports it. NULL when the key applies to every row. A filtered key only guarantees uniqueness among the rows that match it.',
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
            1,
            0,
            0,
            'Search',
            GETUTCDATE(),
            GETUTCDATE()
         )
      END;

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '5131ebe3-d1cb-420a-83cb-55d200b2685b' OR (EntityID = 'D7B47AFC-C1F3-48D0-9C92-839F52FA5A4F' AND Name = '__mj_CreatedAt')) BEGIN
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
            '5131ebe3-d1cb-420a-83cb-55d200b2685b',
            'D7B47AFC-C1F3-48D0-9C92-839F52FA5A4F', -- Entity: MJ: Entity Unique Keys
            (SELECT COALESCE(MAX([Sequence]), 0) + 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE [EntityID] = 'D7B47AFC-C1F3-48D0-9C92-839F52FA5A4F'),
            '__mj_CreatedAt',
            'Created At',
            NULL,
            'datetimeoffset',
            10,
            34,
            7,
            0,
            'getutcdate()',
            0,
            0,
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '9fba60a4-21fc-40b7-8b5f-246b95ccf4e9' OR (EntityID = 'D7B47AFC-C1F3-48D0-9C92-839F52FA5A4F' AND Name = '__mj_UpdatedAt')) BEGIN
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
            '9fba60a4-21fc-40b7-8b5f-246b95ccf4e9',
            'D7B47AFC-C1F3-48D0-9C92-839F52FA5A4F', -- Entity: MJ: Entity Unique Keys
            (SELECT COALESCE(MAX([Sequence]), 0) + 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE [EntityID] = 'D7B47AFC-C1F3-48D0-9C92-839F52FA5A4F'),
            '__mj_UpdatedAt',
            'Updated At',
            NULL,
            'datetimeoffset',
            10,
            34,
            7,
            0,
            'getutcdate()',
            0,
            0,
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

/* SQL text to sync entity unique keys (249 added, 0 updated, 0 removed) */
INSERT INTO [${flyway:defaultSchema}].[EntityUniqueKey] ([ID], [EntityID], [Name], [FieldNames], [FilterDefinition]) VALUES ('45137c63-177d-4f89-8493-69efbc55a2c1', '00766B45-E83F-EF11-86D4-0022481D1B23', 'UQ_ExplorerNavigationItem_Name', 'Name', NULL);
INSERT INTO [${flyway:defaultSchema}].[EntityUniqueKey] ([ID], [EntityID], [Name], [FieldNames], [FilterDefinition]) VALUES ('7883c891-960b-40a4-ae68-07d7a3ec00cf', '00766B45-E83F-EF11-86D4-0022481D1B23', 'UQ_ExplorerNavigationItem_Route', 'Route', NULL);
INSERT INTO [${flyway:defaultSchema}].[EntityUniqueKey] ([ID], [EntityID], [Name], [FieldNames], [FilterDefinition]) VALUES ('1b65ae6c-3f1d-4982-8a82-4a653f1b994c', '02B2ECDF-FC92-4D19-B332-F840EA708565', 'UQ_AIConfigurationParam_Config_Name', 'ConfigurationID,Name', NULL);
INSERT INTO [${flyway:defaultSchema}].[EntityUniqueKey] ([ID], [EntityID], [Name], [FieldNames], [FilterDefinition]) VALUES ('c110d8ad-7f20-4294-aecd-f6a70d988a0c', '0325A316-D1DC-4DC7-947B-358C96860725', 'UQ_TestSuiteTest_Suite_Test', 'SuiteID,TestID', NULL);
INSERT INTO [${flyway:defaultSchema}].[EntityUniqueKey] ([ID], [EntityID], [Name], [FieldNames], [FilterDefinition]) VALUES ('8cb15089-6949-46d7-9ebc-42170278d36d', '03716AC0-1509-471C-9159-C67D1BE6971E', 'UQ_EntityOrganicKey_EntityName', 'EntityID,Name', NULL);
INSERT INTO [${flyway:defaultSchema}].[EntityUniqueKey] ([ID], [EntityID], [Name], [FieldNames], [FilterDefinition]) VALUES ('f142b5c5-ab5b-42fc-b4d7-b93f0a029ca7', '05136FE9-994B-4C0F-926E-DEE4D8D928C1', 'UQ_MLAlgorithmUseCaseRanking_Algo_UseCase', 'MLAlgorithmID,MLAlgorithmUseCaseID', NULL);
INSERT INTO [${flyway:defaultSchema}].[EntityUniqueKey] ([ID], [EntityID], [Name], [FieldNames], [FilterDefinition]) VALUES ('c7e15213-6098-4a33-9a19-358f92b39ddb', '078E485B-0CC4-4E2A-ADB8-52FE8E571E88', 'UQ_ExternalDataSource_Name', 'Name', NULL);
INSERT INTO [${flyway:defaultSchema}].[EntityUniqueKey] ([ID], [EntityID], [Name], [FieldNames], [FilterDefinition]) VALUES ('d53922fb-b1b6-4ef1-983f-e194a6d77cd3', '08794D87-CFBF-480E-AA91-B2E76A4FC8A2', 'UQ_ConversationCompactionRun_ConversationDetail', 'ConversationDetailID', NULL);
INSERT INTO [${flyway:defaultSchema}].[EntityUniqueKey] ([ID], [EntityID], [Name], [FieldNames], [FilterDefinition]) VALUES ('d013e365-967c-49f1-9070-705e2db72225', '094CD426-12FF-4B26-A94B-9AC23C5829A0', 'UQ_AIAgentPrompt_Agent_Prompt_Config', 'AgentID,PromptID,ConfigurationID', NULL);
INSERT INTO [${flyway:defaultSchema}].[EntityUniqueKey] ([ID], [EntityID], [Name], [FieldNames], [FilterDefinition]) VALUES ('88438e04-daa9-4c48-847e-1d8971f1b28e', '0B248F34-2837-EF11-86D4-6045BDEE16E6', 'UQ_ResourceType_Name', 'Name', NULL);
INSERT INTO [${flyway:defaultSchema}].[EntityUniqueKey] ([ID], [EntityID], [Name], [FieldNames], [FilterDefinition]) VALUES ('c61adaad-fc44-4b5e-9c52-ac85225cba36', '0DCA1987-4D89-4C8F-81B3-B47A8019AF97', 'UQ_AIUsageType_Name', 'Name', NULL);
INSERT INTO [${flyway:defaultSchema}].[EntityUniqueKey] ([ID], [EntityID], [Name], [FieldNames], [FilterDefinition]) VALUES ('df35312c-1a86-4582-9a35-92e9db9afcf9', '10248F34-2837-EF11-86D4-6045BDEE16E6', 'UQ_Dataset_Name', 'Name', NULL);
INSERT INTO [${flyway:defaultSchema}].[EntityUniqueKey] ([ID], [EntityID], [Name], [FieldNames], [FilterDefinition]) VALUES ('7c40230b-4801-45af-81c5-ebe8eb30270e', '12193852-F824-416B-9269-EC5D71122959', 'UQ_AIAgentCredential', 'AgentID,CredentialID,Purpose', NULL);
INSERT INTO [${flyway:defaultSchema}].[EntityUniqueKey] ([ID], [EntityID], [Name], [FieldNames], [FilterDefinition]) VALUES ('93ee58e1-a67f-46ad-b852-229f2ff5553f', '122ED707-2BC0-42E8-B25F-6BDDE7164962', 'UQ_RubricEvaluationScore_Criterion', 'EvaluationID,CriterionID', NULL);
INSERT INTO [${flyway:defaultSchema}].[EntityUniqueKey] ([ID], [EntityID], [Name], [FieldNames], [FilterDefinition]) VALUES ('9e00b4c8-1736-48d1-880c-07cef33f3be9', '12A68DBD-84A6-4C13-9CC1-BACFCC850D9B', 'UQ_APIScope_FullPath', 'FullPath', NULL);
INSERT INTO [${flyway:defaultSchema}].[EntityUniqueKey] ([ID], [EntityID], [Name], [FieldNames], [FilterDefinition]) VALUES ('935d813d-2a1e-4d50-a8f6-397730aaee00', '12A68DBD-84A6-4C13-9CC1-BACFCC850D9B', 'UQ_APIScope_ParentName', 'ParentID,Name', NULL);
INSERT INTO [${flyway:defaultSchema}].[EntityUniqueKey] ([ID], [EntityID], [Name], [FieldNames], [FilterDefinition]) VALUES ('4bd6b204-71b2-4d48-a1c2-182d47d96726', '12C21789-12CC-4A8C-81ED-FFCBC1D69336', 'UQ_StateProvince_CountryCode', 'CountryID,Code', NULL);
INSERT INTO [${flyway:defaultSchema}].[EntityUniqueKey] ([ID], [EntityID], [Name], [FieldNames], [FilterDefinition]) VALUES ('d05d26e1-3b13-4869-a887-7171ab950157', '12C21789-12CC-4A8C-81ED-FFCBC1D69336', 'UQ_StateProvince_ISO3166_2', 'ISO3166_2', NULL);
INSERT INTO [${flyway:defaultSchema}].[EntityUniqueKey] ([ID], [EntityID], [Name], [FieldNames], [FilterDefinition]) VALUES ('9f1c9f5a-b9ba-48f3-bcab-cb3a35e909ee', '139AB3B7-C1AB-49BD-A473-47D45A962578', 'UQ_EntityFormContribution_Key', 'EntityID,ContributionKey,Scope,UserID,RoleID', '([ContributionKey] IS NOT NULL AND [Status]=''Active'')');
INSERT INTO [${flyway:defaultSchema}].[EntityUniqueKey] ([ID], [EntityID], [Name], [FieldNames], [FilterDefinition]) VALUES ('3a77ee84-7d24-4064-8bf9-9e6e025ee124', '139AB3B7-C1AB-49BD-A473-47D45A962578', 'UQ_EntityFormContribution_RelatedClaim', 'EntityID,RelatedEntityID,RelatedJoinField,Scope,UserID,RoleID', '([ContributionKey] IS NULL AND [RelatedEntityID] IS NOT NULL AND [Status]=''Active'')');
INSERT INTO [${flyway:defaultSchema}].[EntityUniqueKey] ([ID], [EntityID], [Name], [FieldNames], [FilterDefinition]) VALUES ('974eefed-bbf5-48d5-bafe-cf7a400beaff', '15248F34-2837-EF11-86D4-6045BDEE16E6', 'IX_SchemaInfo', 'SchemaName', NULL);
INSERT INTO [${flyway:defaultSchema}].[EntityUniqueKey] ([ID], [EntityID], [Name], [FieldNames], [FilterDefinition]) VALUES ('a46cb61d-0598-4c77-9fb6-53302a9b8057', '15248F34-2837-EF11-86D4-6045BDEE16E6', 'UQ_SchemaInfo_EntityNamePrefixSuffix', 'EntityNamePrefix,EntityNameSuffix', '([EntityNamePrefix] IS NOT NULL)');
INSERT INTO [${flyway:defaultSchema}].[EntityUniqueKey] ([ID], [EntityID], [Name], [FieldNames], [FilterDefinition]) VALUES ('d877712b-cf20-42cd-88e1-c32534102f15', '18033543-B80D-4BF7-ADAF-DE1AA2CF70D0', 'UQ_FileStorageAccount_Provider_Name', 'ProviderID,Name', NULL);
INSERT INTO [${flyway:defaultSchema}].[EntityUniqueKey] ([ID], [EntityID], [Name], [FieldNames], [FilterDefinition]) VALUES ('c277e43e-3950-4130-bd14-0ba6ab7a57eb', '1816303E-6461-4E44-B929-EA467E2703DB', 'UQ_APIKeyApplication', 'APIKeyID,ApplicationID', NULL);
INSERT INTO [${flyway:defaultSchema}].[EntityUniqueKey] ([ID], [EntityID], [Name], [FieldNames], [FilterDefinition]) VALUES ('d44c373b-4996-40b8-ab5b-4f0bba8a8161', '1816303E-6461-4E44-B929-EA467E2703DB', 'UQ_APIKeyApplication_APIKeyID_ApplicationID', 'APIKeyID,ApplicationID', NULL);
INSERT INTO [${flyway:defaultSchema}].[EntityUniqueKey] ([ID], [EntityID], [Name], [FieldNames], [FilterDefinition]) VALUES ('3f07d29b-eaba-490e-9d94-78615688c3a6', '19846E1A-FD8E-405F-A0FA-42A7AA44758D', 'UQ_ArtifactPermission_Artifact_User', 'ArtifactID,UserID', NULL);
INSERT INTO [${flyway:defaultSchema}].[EntityUniqueKey] ([ID], [EntityID], [Name], [FieldNames], [FilterDefinition]) VALUES ('0cb75c6c-a602-4291-9d23-1083be69ddbf', '1A248F34-2837-EF11-86D4-6045BDEE16E6', 'UX_QueryCategory_Name_NullParent', 'Name', '([ParentID] IS NULL)');
INSERT INTO [${flyway:defaultSchema}].[EntityUniqueKey] ([ID], [EntityID], [Name], [FieldNames], [FilterDefinition]) VALUES ('3f44bbce-1d33-406f-9d27-36990d133900', '1A248F34-2837-EF11-86D4-6045BDEE16E6', 'UX_QueryCategory_Name_ParentID', 'Name,ParentID', '([ParentID] IS NOT NULL)');
INSERT INTO [${flyway:defaultSchema}].[EntityUniqueKey] ([ID], [EntityID], [Name], [FieldNames], [FilterDefinition]) VALUES ('c13cf113-a84b-464d-8768-cab1d8f22901', '1B248F34-2837-EF11-86D4-6045BDEE16E6', 'UX_Query_Name_CategoryID', 'Name,CategoryID', '([CategoryID] IS NOT NULL)');
INSERT INTO [${flyway:defaultSchema}].[EntityUniqueKey] ([ID], [EntityID], [Name], [FieldNames], [FilterDefinition]) VALUES ('d638268c-28be-4592-bfab-f4a0651b1b87', '1B248F34-2837-EF11-86D4-6045BDEE16E6', 'UX_Query_Name_NullCategory', 'Name', '([CategoryID] IS NULL)');
INSERT INTO [${flyway:defaultSchema}].[EntityUniqueKey] ([ID], [EntityID], [Name], [FieldNames], [FilterDefinition]) VALUES ('50040c78-86af-41bc-9533-352645f5fecf', '1B266740-F4DB-43A2-B75B-7A45ADB59709', 'UQ_DashboardUserState_Dashboard_User', 'DashboardID,UserID', NULL);
INSERT INTO [${flyway:defaultSchema}].[EntityUniqueKey] ([ID], [EntityID], [Name], [FieldNames], [FilterDefinition]) VALUES ('37028132-7e62-4580-b6d0-e714812f7818', '1C248F34-2837-EF11-86D4-6045BDEE16E6', 'UQ_QueryPermission_QueryID_RoleID', 'QueryID,RoleID', NULL);
INSERT INTO [${flyway:defaultSchema}].[EntityUniqueKey] ([ID], [EntityID], [Name], [FieldNames], [FilterDefinition]) VALUES ('9003708c-03a0-462f-a7ec-aa95721177f8', '1F1EBDD5-84DA-4554-A029-87AFF327971D', 'UQ_AIAgentSkill_Agent_Skill', 'AgentID,SkillID', NULL);
INSERT INTO [${flyway:defaultSchema}].[EntityUniqueKey] ([ID], [EntityID], [Name], [FieldNames], [FilterDefinition]) VALUES ('df0536ed-9150-4856-9cee-16b295728696', '20BCABEC-413F-4985-8F5A-6BC262E75F81', 'UQ_SearchScopeEntity', 'SearchScopeID,EntityID', NULL);
INSERT INTO [${flyway:defaultSchema}].[EntityUniqueKey] ([ID], [EntityID], [Name], [FieldNames], [FilterDefinition]) VALUES ('f9845202-89ee-4516-a6f6-d3667eda26c1', '211DD116-32C7-43B4-B147-418F76B0E0E3', 'UQ_SearchScopeProvider', 'SearchScopeID,SearchProviderID', NULL);
INSERT INTO [${flyway:defaultSchema}].[EntityUniqueKey] ([ID], [EntityID], [Name], [FieldNames], [FilterDefinition]) VALUES ('9e081c9b-a373-4306-afc7-fdbed90f9ed3', '22248F34-2837-EF11-86D4-6045BDEE16E6', 'UQ_EntityDocument_Name', 'Name', NULL);
INSERT INTO [${flyway:defaultSchema}].[EntityUniqueKey] ([ID], [EntityID], [Name], [FieldNames], [FilterDefinition]) VALUES ('54f99765-bf37-4a6f-9d53-9580b06647ed', '2264AA9A-2197-48E2-BB3D-A498006B37A5', 'UX_ComponentLibrary_Name_Version', 'Name,Version', NULL);
INSERT INTO [${flyway:defaultSchema}].[EntityUniqueKey] ([ID], [EntityID], [Name], [FieldNames], [FilterDefinition]) VALUES ('a428f286-0da5-4c7a-b248-229f9953b5ed', '23248F34-2837-EF11-86D4-6045BDEE16E6', 'IX_DataContextItem_DataContextID_CodeName', 'DataContextID,CodeName', '([CodeName] IS NOT NULL)');
INSERT INTO [${flyway:defaultSchema}].[EntityUniqueKey] ([ID], [EntityID], [Name], [FieldNames], [FilterDefinition]) VALUES ('de3983b4-59cb-4c6e-bf13-a3e3c9e395ca', '24F8E069-1ACD-4DC4-B013-B6D5CE47EEA7', 'UX_AIAgentRelationship_Agent_SubAgent', 'AgentID,SubAgentID', NULL);
INSERT INTO [${flyway:defaultSchema}].[EntityUniqueKey] ([ID], [EntityID], [Name], [FieldNames], [FilterDefinition]) VALUES ('aa9c0507-b614-43d2-9351-d40490425a35', '2758D216-C4D2-4FC4-8348-781372736159', 'UQ_RemoteOperation_OperationKey', 'OperationKey', NULL);
INSERT INTO [${flyway:defaultSchema}].[EntityUniqueKey] ([ID], [EntityID], [Name], [FieldNames], [FilterDefinition]) VALUES ('fa5ebd12-3690-40f4-8662-3797e47f0c13', '2917B8D0-E525-41C0-A8C8-C4F58CD9A09A', 'UQ_WorkQueueMessage_PublishOrdinal', 'PublishOrdinal', NULL);
INSERT INTO [${flyway:defaultSchema}].[EntityUniqueKey] ([ID], [EntityID], [Name], [FieldNames], [FilterDefinition]) VALUES ('80386df2-a892-42bd-82f6-562007515a47', '2B248F34-2837-EF11-86D4-6045BDEE16E6', 'UQ_FileEntityRecordLink_EntityID_RecordID_FileID', 'EntityID,RecordID,FileID', NULL);
INSERT INTO [${flyway:defaultSchema}].[EntityUniqueKey] ([ID], [EntityID], [Name], [FieldNames], [FilterDefinition]) VALUES ('3fb11f86-94dd-48c8-92a4-255668b37e94', '2B559B5C-0E81-4EB8-80D8-26943E0A49BE', 'UQ_WorkQueueDeduplication_Topic_Key', 'TopicID,DeduplicationKey', NULL);
INSERT INTO [${flyway:defaultSchema}].[EntityUniqueKey] ([ID], [EntityID], [Name], [FieldNames], [FilterDefinition]) VALUES ('edeeda80-098a-47b0-829b-3b4b3791ffbd', '2D4F0C97-B8F8-46BE-B75A-BFA90F93D368', 'UQ_CompanyIntegrationObjectField_Name', 'CompanyIntegrationObjectID,Name', NULL);
INSERT INTO [${flyway:defaultSchema}].[EntityUniqueKey] ([ID], [EntityID], [Name], [FieldNames], [FilterDefinition]) VALUES ('a9664e35-3680-4d53-83e3-5e5dee19aa7e', '2D558EBA-9B96-40D9-9D8C-34DF1A9E78F5', 'UQ_AuthenticationProvider_Name', 'Name', NULL);
INSERT INTO [${flyway:defaultSchema}].[EntityUniqueKey] ([ID], [EntityID], [Name], [FieldNames], [FilterDefinition]) VALUES ('c13a2e80-e0f8-4a26-9b24-a8502d08f3aa', '2E9627B0-8DC7-4CAD-B5A9-A0E0180A660E', 'UQ_RubricScaleLevel_Label', 'ScaleID,Label', NULL);
INSERT INTO [${flyway:defaultSchema}].[EntityUniqueKey] ([ID], [EntityID], [Name], [FieldNames], [FilterDefinition]) VALUES ('fe434b70-59dd-4c1b-80dc-2da29559040b', '2E9627B0-8DC7-4CAD-B5A9-A0E0180A660E', 'UQ_RubricScaleLevel_Sequence', 'ScaleID,Sequence', NULL);
INSERT INTO [${flyway:defaultSchema}].[EntityUniqueKey] ([ID], [EntityID], [Name], [FieldNames], [FilterDefinition]) VALUES ('ea7a7e28-6144-492a-a3cd-876febb6ee7a', '31A90934-E8E7-4EF9-8430-D63E8F224ABD', 'UQ_AIAgentChannel_Name', 'Name', NULL);
INSERT INTO [${flyway:defaultSchema}].[EntityUniqueKey] ([ID], [EntityID], [Name], [FieldNames], [FilterDefinition]) VALUES ('b1214e4c-5acc-4226-b900-ac5bbe9784f7', '31C4E71D-0554-47BD-BCAE-CD7A8199C8C3', 'UQ_AIAgentRubric_AgentRubricPurpose', 'AgentID,RubricID,Purpose', NULL);
INSERT INTO [${flyway:defaultSchema}].[EntityUniqueKey] ([ID], [EntityID], [Name], [FieldNames], [FilterDefinition]) VALUES ('3164c1dd-d19f-4ae8-9d36-d5c78020af5c', '32248F34-2837-EF11-86D4-6045BDEE16E6', 'UQ_ApplicationSetting_ApplicationID_Name', 'ApplicationID,Name', NULL);
INSERT INTO [${flyway:defaultSchema}].[EntityUniqueKey] ([ID], [EntityID], [Name], [FieldNames], [FilterDefinition]) VALUES ('212e0df7-9168-4ba4-ac46-bf649b949737', '33C4F895-3313-4DA7-91E3-9D30AD19F4CD', 'UQ_InstanceConfiguration_Key', 'FeatureKey', NULL);
INSERT INTO [${flyway:defaultSchema}].[EntityUniqueKey] ([ID], [EntityID], [Name], [FieldNames], [FilterDefinition]) VALUES ('5c583b9f-40ed-4621-8cd8-9d42003d361e', '33E01250-C0FE-4B35-AF8F-A4F444490065', 'UQ_ScheduledJobType_DriverClass', 'DriverClass', NULL);
INSERT INTO [${flyway:defaultSchema}].[EntityUniqueKey] ([ID], [EntityID], [Name], [FieldNames], [FilterDefinition]) VALUES ('2afeee74-b2c7-46be-b6dc-559587ac20e4', '33E01250-C0FE-4B35-AF8F-A4F444490065', 'UQ_ScheduledJobType_Name', 'Name', NULL);
INSERT INTO [${flyway:defaultSchema}].[EntityUniqueKey] ([ID], [EntityID], [Name], [FieldNames], [FilterDefinition]) VALUES ('028b2214-3e89-437e-939c-dd3f8eb8f86b', '347BAA45-90B3-4BFC-85F3-0435F10C113C', 'UQ_ClusterAnalysisCluster_Analysis_Index', 'ClusterAnalysisID,ClusterIndex', NULL);
INSERT INTO [${flyway:defaultSchema}].[EntityUniqueKey] ([ID], [EntityID], [Name], [FieldNames], [FilterDefinition]) VALUES ('1ace2266-c9f2-4630-bef5-edc561c4a6d2', '34987C4C-CC16-4AA3-B5BD-687C47ED78B2', 'UQ_PermissionDomain_Name', 'Name', NULL);
INSERT INTO [${flyway:defaultSchema}].[EntityUniqueKey] ([ID], [EntityID], [Name], [FieldNames], [FilterDefinition]) VALUES ('e21c7bb7-30dd-47e4-bdb5-af22ad63d2b5', '359389B4-54D1-46B2-AD9A-5B84750BAB0B', 'UQ_AIAgentRequestType_Name', 'Name', NULL);
INSERT INTO [${flyway:defaultSchema}].[EntityUniqueKey] ([ID], [EntityID], [Name], [FieldNames], [FilterDefinition]) VALUES ('23e5bc69-4be1-496a-8a75-56b24973937a', '36248F34-2837-EF11-86D4-6045BDEE16E6', 'UQ_ActionAuthorization_ActionID_AuthorizationID', 'ActionID,AuthorizationID', NULL);
INSERT INTO [${flyway:defaultSchema}].[EntityUniqueKey] ([ID], [EntityID], [Name], [FieldNames], [FilterDefinition]) VALUES ('e5298251-54a2-4ebc-bacb-cb76c03dc183', '3630CBFD-4C85-4B24-8A51-88D67389373E', 'UQ_IntegrationObjectField_Name', 'IntegrationObjectID,Name', NULL);
INSERT INTO [${flyway:defaultSchema}].[EntityUniqueKey] ([ID], [EntityID], [Name], [FieldNames], [FilterDefinition]) VALUES ('bf4c54ac-1e3f-43e8-924c-74f00612c830', '36ECEE63-1EDD-4BF0-8EF1-DCFDF2794F4D', 'UQ_MCPServerTool_ServerTool', 'MCPServerID,ToolName', NULL);
INSERT INTO [${flyway:defaultSchema}].[EntityUniqueKey] ([ID], [EntityID], [Name], [FieldNames], [FilterDefinition]) VALUES ('ae3d0d2e-7816-4ac9-9c69-8ab8497fb885', '37F31DED-1186-46E6-B3A5-052CB31A8651', 'UQ_VersionLabelItem_LabelEntityRecord', 'VersionLabelID,EntityID,RecordID', NULL);
INSERT INTO [${flyway:defaultSchema}].[EntityUniqueKey] ([ID], [EntityID], [Name], [FieldNames], [FilterDefinition]) VALUES ('b97e79b5-bf4a-4ed8-bd06-2f4d0a7713bd', '38248F34-2837-EF11-86D4-6045BDEE16E6', 'UQ_Action_Name_CategoryID_ParentID', 'Name,CategoryID,ParentID', NULL);
INSERT INTO [${flyway:defaultSchema}].[EntityUniqueKey] ([ID], [EntityID], [Name], [FieldNames], [FilterDefinition]) VALUES ('c42cfb8b-c40a-453d-9fbb-3761776a9b1c', '3838E9B7-875A-4E0D-B861-1C61C6ED5C1D', 'UQ_AIAgentClientTool', 'AgentID,ClientToolDefinitionID', NULL);
INSERT INTO [${flyway:defaultSchema}].[EntityUniqueKey] ([ID], [EntityID], [Name], [FieldNames], [FilterDefinition]) VALUES ('fa58125a-5a5f-400f-b8f4-85893e1ba865', '38B82609-4B90-477B-801B-BC4154A8DE39', 'UQ_EntityAlternateBaseView_EntityID_Name', 'EntityID,Name', NULL);
INSERT INTO [${flyway:defaultSchema}].[EntityUniqueKey] ([ID], [EntityID], [Name], [FieldNames], [FilterDefinition]) VALUES ('7a341735-3fe0-4c53-ad37-85fd1547021f', '38D9DE43-C0C2-45DA-81BB-A815B30F86FB', 'UQ_IdentityClaimType_Name', 'Name', NULL);
INSERT INTO [${flyway:defaultSchema}].[EntityUniqueKey] ([ID], [EntityID], [Name], [FieldNames], [FilterDefinition]) VALUES ('72b895da-ff9b-4766-91fb-4cc5f4b958bc', '3BED585D-B150-4899-AB06-8A19624EA9BE', 'UQ_FeatureValue_ValueKey', 'RecordProcessID,ValueKeyHash', '([ValueKeyHash] IS NOT NULL)');
INSERT INTO [${flyway:defaultSchema}].[EntityUniqueKey] ([ID], [EntityID], [Name], [FieldNames], [FilterDefinition]) VALUES ('ad7454a4-edcf-452d-a5ab-436beae59e10', '3BFE55C1-8FD5-44A4-ACCB-DABB4E8428E2', 'UQ_Country_ISO2', 'ISO2', NULL);
INSERT INTO [${flyway:defaultSchema}].[EntityUniqueKey] ([ID], [EntityID], [Name], [FieldNames], [FilterDefinition]) VALUES ('a2c5465a-17ae-4667-a252-6fcd226806c4', '3BFE55C1-8FD5-44A4-ACCB-DABB4E8428E2', 'UQ_Country_ISO3', 'ISO3', NULL);
INSERT INTO [${flyway:defaultSchema}].[EntityUniqueKey] ([ID], [EntityID], [Name], [FieldNames], [FilterDefinition]) VALUES ('b99a64f7-9faf-4c19-9cdf-4fec02a56fca', '3BFE55C1-8FD5-44A4-ACCB-DABB4E8428E2', 'UQ_Country_Name', 'Name', NULL);
INSERT INTO [${flyway:defaultSchema}].[EntityUniqueKey] ([ID], [EntityID], [Name], [FieldNames], [FilterDefinition]) VALUES ('a9f9e11b-4635-433c-8c86-09e6c6a5234b', '3C30FA05-9490-49F0-8943-6052573C66B2', 'UQ_CompanyIntegrationObject_Name', 'CompanyIntegrationID,Name', NULL);
INSERT INTO [${flyway:defaultSchema}].[EntityUniqueKey] ([ID], [EntityID], [Name], [FieldNames], [FilterDefinition]) VALUES ('376c8a40-eaeb-470b-9f1e-aa149325e867', '3C4E0E5F-5FF1-4918-9A28-CF21E48E532E', 'UQ_MCPServerConnection_CompanyName', 'CompanyID,Name', NULL);
INSERT INTO [${flyway:defaultSchema}].[EntityUniqueKey] ([ID], [EntityID], [Name], [FieldNames], [FilterDefinition]) VALUES ('3a10a5a1-2435-4a75-b2e6-dbae48815773', '3C7E3EE9-BEBA-49B2-AB61-9BAFA1B40EE5', 'UQ_ContentItemDuplicate_Pair', 'ContentItemAID,ContentItemBID', NULL);
INSERT INTO [${flyway:defaultSchema}].[EntityUniqueKey] ([ID], [EntityID], [Name], [FieldNames], [FilterDefinition]) VALUES ('377097db-17cb-4470-9bb0-a46714211d9b', '3D08228D-8D64-46D3-AED9-AABD54BBBDBE', 'UQ_QueryParameter_QueryID_Name', 'QueryID,Name', NULL);
INSERT INTO [${flyway:defaultSchema}].[EntityUniqueKey] ([ID], [EntityID], [Name], [FieldNames], [FilterDefinition]) VALUES ('c7de8df1-0833-46c8-94c6-cf8c7e10ee74', '3D248F34-2837-EF11-86D4-6045BDEE16E6', 'UQ_ActionContext_ActionID_ContextTypeID', 'ActionID,ContextTypeID', NULL);
INSERT INTO [${flyway:defaultSchema}].[EntityUniqueKey] ([ID], [EntityID], [Name], [FieldNames], [FilterDefinition]) VALUES ('e3d78d6b-51d0-4131-b34f-5a61c5ed6551', '3F248F34-2837-EF11-86D4-6045BDEE16E6', 'UQ__ActionPa__FC8BBBBD6F2DCAC4', 'Name,ActionID', NULL);
INSERT INTO [${flyway:defaultSchema}].[EntityUniqueKey] ([ID], [EntityID], [Name], [FieldNames], [FilterDefinition]) VALUES ('0c826ed6-2cf0-43d2-a35e-7a9ceed2d1d7', '3F83C084-859F-49C3-A8A0-4693E0777BE8', 'UQ_SearchScope_Name', 'Name', NULL);
INSERT INTO [${flyway:defaultSchema}].[EntityUniqueKey] ([ID], [EntityID], [Name], [FieldNames], [FilterDefinition]) VALUES ('be9fc65f-3071-47cb-aa64-82c7c2015d81', '3FE3016C-1E34-4510-9A68-7B1664F58217', 'UQ_MCPToolFavorite_User_Tool', 'UserID,MCPServerToolID', NULL);
INSERT INTO [${flyway:defaultSchema}].[EntityUniqueKey] ([ID], [EntityID], [Name], [FieldNames], [FilterDefinition]) VALUES ('53ba2943-0172-441e-8583-a51c414d79c2', '40248F34-2837-EF11-86D4-6045BDEE16E6', 'UQ_ActionLibrary_ActionID_LibraryID', 'ActionID,LibraryID', NULL);
INSERT INTO [${flyway:defaultSchema}].[EntityUniqueKey] ([ID], [EntityID], [Name], [FieldNames], [FilterDefinition]) VALUES ('bb0ec346-9e67-4f8a-8683-efb35383fe63', '406BA963-D9A0-4093-AF02-59835BFE1FFF', 'UK_ListShares_List_User', 'ListID,UserID', NULL);
INSERT INTO [${flyway:defaultSchema}].[EntityUniqueKey] ([ID], [EntityID], [Name], [FieldNames], [FilterDefinition]) VALUES ('0563f2bc-5cac-44ae-82fe-47adeb4a830e', '41248F34-2837-EF11-86D4-6045BDEE16E6', 'UQ_Library_Name', 'Name', NULL);
INSERT INTO [${flyway:defaultSchema}].[EntityUniqueKey] ([ID], [EntityID], [Name], [FieldNames], [FilterDefinition]) VALUES ('f8ecc35c-64b9-4900-b62e-310166795780', '43248F34-2837-EF11-86D4-6045BDEE16E6', 'UQ_CommunicationProvider_Name', 'Name', NULL);
INSERT INTO [${flyway:defaultSchema}].[EntityUniqueKey] ([ID], [EntityID], [Name], [FieldNames], [FilterDefinition]) VALUES ('fec3e646-49a6-4df3-bdb8-f30a459148b5', '435976AD-F4BA-4FFA-A5F5-C2D901B6C15A', 'UQ_AIModelArchitecture', 'ModelID,ArchitectureID', NULL);
INSERT INTO [${flyway:defaultSchema}].[EntityUniqueKey] ([ID], [EntityID], [Name], [FieldNames], [FilterDefinition]) VALUES ('b9361108-2255-4844-b122-98fd22ec30f4', '47248F34-2837-EF11-86D4-6045BDEE16E6', 'UQ_CommunicationBaseMessageType_Type', 'Type', NULL);
INSERT INTO [${flyway:defaultSchema}].[EntityUniqueKey] ([ID], [EntityID], [Name], [FieldNames], [FilterDefinition]) VALUES ('76d7ae15-186d-4aec-abbb-66f24c7e844e', '49770E19-D6D0-485D-A03F-01C39FDFB6D1', 'UQ__Generate__737584F6DF502163', 'Name', NULL);
INSERT INTO [${flyway:defaultSchema}].[EntityUniqueKey] ([ID], [EntityID], [Name], [FieldNames], [FilterDefinition]) VALUES ('d165271d-0858-4a43-a923-df2513a67b8d', '49D89CDD-B89F-45D7-A5BB-04FC1C10E71D', 'UQ_RubricCriterion_Key', 'RubricVersionID,Key', NULL);
INSERT INTO [${flyway:defaultSchema}].[EntityUniqueKey] ([ID], [EntityID], [Name], [FieldNames], [FilterDefinition]) VALUES ('c8240f08-9b5a-4bfc-b0a1-7ed6a7cd2863', '4A6907AB-B05C-4140-A612-2A580FEB94D0', 'UQ_DashboardPartType_Name', 'Name', NULL);
INSERT INTO [${flyway:defaultSchema}].[EntityUniqueKey] ([ID], [EntityID], [Name], [FieldNames], [FilterDefinition]) VALUES ('3332745f-0d28-451b-8778-983a9df41c5b', '4B35F25F-D5E7-4489-B722-29B75AF384A8', 'UQ_UserNotificationPreference_UserType', 'UserID,NotificationTypeID', NULL);
INSERT INTO [${flyway:defaultSchema}].[EntityUniqueKey] ([ID], [EntityID], [Name], [FieldNames], [FilterDefinition]) VALUES ('835a5e48-f4c7-4da6-8273-a02572f1d735', '4B414728-C375-4CB4-987D-1B6A440FD239', 'UQ_CalendarSyncState_Calendar', 'CommunicationProviderID,AccountIdentifier,CalendarID', NULL);
INSERT INTO [${flyway:defaultSchema}].[EntityUniqueKey] ([ID], [EntityID], [Name], [FieldNames], [FilterDefinition]) VALUES ('05396d24-e6e0-49bb-b005-a0f103d7f638', '4D68E78E-64F7-4959-B18B-72159DF95A98', 'UQ_RecordProcessWatermark_Record', 'RecordProcessID,EntityID,RecordID', NULL);
INSERT INTO [${flyway:defaultSchema}].[EntityUniqueKey] ([ID], [EntityID], [Name], [FieldNames], [FilterDefinition]) VALUES ('02186465-5a86-4814-ae46-295f7b304841', '4F35743A-2413-47FB-9A36-B5BECB038BBF', 'UQ_AIArchitecture_Name', 'Name', NULL);
INSERT INTO [${flyway:defaultSchema}].[EntityUniqueKey] ([ID], [EntityID], [Name], [FieldNames], [FilterDefinition]) VALUES ('3ed3bf47-665c-4b4c-8ce8-5eeb5e9fad1b', '4F51DAE4-4F4D-444A-B931-4F29AB2A871A', 'uq_AIModelPriceType_Name', 'Name', NULL);
INSERT INTO [${flyway:defaultSchema}].[EntityUniqueKey] ([ID], [EntityID], [Name], [FieldNames], [FilterDefinition]) VALUES ('e4f0acb1-bc7b-4730-a056-1b7c85649fbf', '51248F34-2837-EF11-86D4-6045BDEE16E6', 'UQ_EntityCommunicationMessageType_BaseMessageTypeID_EntityID', 'BaseMessageTypeID,EntityID', NULL);
INSERT INTO [${flyway:defaultSchema}].[EntityUniqueKey] ([ID], [EntityID], [Name], [FieldNames], [FilterDefinition]) VALUES ('34993766-9167-42cd-a108-2eb439fc9336', '517DC830-DD35-4756-B1AE-EFF5046B2837', 'UQ_RubricScale_Name', 'Name', NULL);
INSERT INTO [${flyway:defaultSchema}].[EntityUniqueKey] ([ID], [EntityID], [Name], [FieldNames], [FilterDefinition]) VALUES ('a2ff5425-e323-487c-9ed7-d7e71197032d', '53695C5D-E659-4025-825A-23C5FA873B6A', 'UQ_FormChromeRule_Contribution', 'EntityID,ContributionKey', '([TargetKind]=''Contribution'')');
INSERT INTO [${flyway:defaultSchema}].[EntityUniqueKey] ([ID], [EntityID], [Name], [FieldNames], [FilterDefinition]) VALUES ('8cb4017f-f980-43c3-abd7-ef0147697283', '53695C5D-E659-4025-825A-23C5FA873B6A', 'UQ_FormChromeRule_Relationship', 'EntityID,RelatedEntityID', '([TargetKind]=''Relationship'')');
INSERT INTO [${flyway:defaultSchema}].[EntityUniqueKey] ([ID], [EntityID], [Name], [FieldNames], [FilterDefinition]) VALUES ('9e0bd25d-3e4b-43b5-9269-726c2d52c044', '54EF915A-9902-4958-8E09-AE6E7B525E97', 'UQ_RecordGeoCode_EntityRecordLocation', 'EntityID,RecordID,LocationType', NULL);
INSERT INTO [${flyway:defaultSchema}].[EntityUniqueKey] ([ID], [EntityID], [Name], [FieldNames], [FilterDefinition]) VALUES ('e6a184d4-1285-4aaa-ac3a-da33ae8eb8ff', '55248F34-2837-EF11-86D4-6045BDEE16E6', 'UQ__EntityRe__737584F667950678', 'Name', NULL);
INSERT INTO [${flyway:defaultSchema}].[EntityUniqueKey] ([ID], [EntityID], [Name], [FieldNames], [FilterDefinition]) VALUES ('497fe3e0-c419-4740-9ccd-fd7db66b7bdc', '55E5A944-6ECD-491D-A4E9-99E1453FEBDB', 'UQ_CollectionPermission_Collection_User', 'CollectionID,UserID', NULL);
INSERT INTO [${flyway:defaultSchema}].[EntityUniqueKey] ([ID], [EntityID], [Name], [FieldNames], [FilterDefinition]) VALUES ('3f413bc3-4c13-4214-bf07-86ca87cd0723', '56AB1EF8-2E92-4E04-BBF5-CFEB62F1897D', 'UQ_AIModality_Name', 'Name', NULL);
INSERT INTO [${flyway:defaultSchema}].[EntityUniqueKey] ([ID], [EntityID], [Name], [FieldNames], [FilterDefinition]) VALUES ('4aad5bf4-5498-4c87-85de-ed709316637c', '57801845-6620-4CBD-993F-E4AA2D464A04', 'UQ_IntegrationSourceType_DriverClass', 'DriverClass', NULL);
INSERT INTO [${flyway:defaultSchema}].[EntityUniqueKey] ([ID], [EntityID], [Name], [FieldNames], [FilterDefinition]) VALUES ('b3a4e7f1-74b2-450c-9a62-334fc31d41db', '57801845-6620-4CBD-993F-E4AA2D464A04', 'UQ_IntegrationSourceType_Name', 'Name', NULL);
INSERT INTO [${flyway:defaultSchema}].[EntityUniqueKey] ([ID], [EntityID], [Name], [FieldNames], [FilterDefinition]) VALUES ('48f15798-dbfe-4e67-ba71-7055b0719284', '57A740FA-CE0F-440B-8B90-6BF2BB9440DE', 'UQ_OpenAppDep', 'OpenAppID,DependsOnAppName', NULL);
INSERT INTO [${flyway:defaultSchema}].[EntityUniqueKey] ([ID], [EntityID], [Name], [FieldNames], [FilterDefinition]) VALUES ('c5c5d123-60a8-4f62-af33-1f07b7e7479e', '59BE3EBA-3C9A-41D1-B725-A1CA92E0411C', 'UQ_NumberPool_Name', 'Name', NULL);
INSERT INTO [${flyway:defaultSchema}].[EntityUniqueKey] ([ID], [EntityID], [Name], [FieldNames], [FilterDefinition]) VALUES ('51f43ea7-55a3-44b7-b5ea-f97fd03422c0', '5AF7B1AB-B2D7-4BCA-9EDC-980980EF4AF2', 'UQ_AIRemoteBrowserProvider_Name', 'Name', NULL);
INSERT INTO [${flyway:defaultSchema}].[EntityUniqueKey] ([ID], [EntityID], [Name], [FieldNames], [FilterDefinition]) VALUES ('9b583b86-7709-43fc-a0de-572ea8760ea3', '5C937C69-CD63-456F-9CC8-D860BB8F6B16', 'UQ_FeaturePipelineType_Name', 'Name', NULL);
INSERT INTO [${flyway:defaultSchema}].[EntityUniqueKey] ([ID], [EntityID], [Name], [FieldNames], [FilterDefinition]) VALUES ('8652a532-35dc-40ec-9f39-c354bc4dcb58', '5CC79CE4-BB4C-4ED0-8A02-4DCDC3140E4A', 'UQ_InteractionLink', 'InteractionID,EntityID,RecordID,Role', NULL);
INSERT INTO [${flyway:defaultSchema}].[EntityUniqueKey] ([ID], [EntityID], [Name], [FieldNames], [FilterDefinition]) VALUES ('6cc37f9a-4ee1-40ba-9e25-c2d87dc81608', '5D4BC8D7-AB3F-444E-B85A-FC89297887B2', 'UQ_ArtifactVersionAttribute_Version_Name', 'ArtifactVersionID,Name', NULL);
INSERT INTO [${flyway:defaultSchema}].[EntityUniqueKey] ([ID], [EntityID], [Name], [FieldNames], [FilterDefinition]) VALUES ('8ceb54f2-9c4a-4c6f-bb43-98ec7da4115a', '5E3EA927-BEFA-417E-8FD9-6C114C1C0A2A', 'UQ_AISkillAction_Skill_Action', 'SkillID,ActionID', NULL);
INSERT INTO [${flyway:defaultSchema}].[EntityUniqueKey] ([ID], [EntityID], [Name], [FieldNames], [FilterDefinition]) VALUES ('777f87da-0739-4a3b-a2c4-02d5327d2ed9', '619F0CE1-795C-4B20-9E08-3C45F179AEB5', 'UQ_WorkQueueTransport_Name', 'Name', NULL);
INSERT INTO [${flyway:defaultSchema}].[EntityUniqueKey] ([ID], [EntityID], [Name], [FieldNames], [FilterDefinition]) VALUES ('81372378-4334-45f1-b850-c6bd6c083d1b', '62925804-D598-45A7-A338-B2604AE96F11', 'UQ_AIAgentUserPolicy_Agent_User', 'AgentID,UserID', NULL);
INSERT INTO [${flyway:defaultSchema}].[EntityUniqueKey] ([ID], [EntityID], [Name], [FieldNames], [FilterDefinition]) VALUES ('f5942831-ca30-48c2-ae7c-9c764590646b', '635C7C9A-7BBB-4836-AA19-3E54963E2821', 'UQ_AIPersonaVendor_Persona_Vendor_Modality', 'PersonaID,VendorID,ModalityID', NULL);
INSERT INTO [${flyway:defaultSchema}].[EntityUniqueKey] ([ID], [EntityID], [Name], [FieldNames], [FilterDefinition]) VALUES ('1d2d469b-198e-4082-865e-9e7eaa435a5d', '65CDC348-C4A6-4D00-A57B-2D489C56F128', 'UK_AIAgentType_Name', 'Name', NULL);
INSERT INTO [${flyway:defaultSchema}].[EntityUniqueKey] ([ID], [EntityID], [Name], [FieldNames], [FilterDefinition]) VALUES ('85a2072e-1657-4d0a-892d-d0b5205b12fd', '6AE1BBF0-2085-4D2F-B724-219DC4212026', 'UQ_AIConfiguration_Name', 'Name', NULL);
INSERT INTO [${flyway:defaultSchema}].[EntityUniqueKey] ([ID], [EntityID], [Name], [FieldNames], [FilterDefinition]) VALUES ('baed78fe-55ee-4cd5-a757-068ddc20621d', '6B8A7C62-C13B-4283-9C81-17D9233A4A69', 'UQ_AIAgentCategory_Name', 'Name', NULL);
INSERT INTO [${flyway:defaultSchema}].[EntityUniqueKey] ([ID], [EntityID], [Name], [FieldNames], [FilterDefinition]) VALUES ('d7d83ed9-4457-445f-8840-518ecd3ea150', '6BAB48BD-F197-4737-93A6-8081BBBAEB30', 'UQ_PublicLink_Token', 'Token', NULL);
INSERT INTO [${flyway:defaultSchema}].[EntityUniqueKey] ([ID], [EntityID], [Name], [FieldNames], [FilterDefinition]) VALUES ('af5d9ac1-d725-420c-8def-ed28b97c3212', '6D3D08A7-12F2-42EA-BD15-128FBE4A4259', 'UQ_ApplicationRole_App_Role', 'ApplicationID,RoleID', NULL);
INSERT INTO [${flyway:defaultSchema}].[EntityUniqueKey] ([ID], [EntityID], [Name], [FieldNames], [FilterDefinition]) VALUES ('afdc06c5-bb0c-41a8-a3ed-951ff87f7c57', '6DC12139-38A1-43C6-85EE-8066450E762B', 'UX_InteractionOffer_OneAccepted', 'InteractionID', '([Status]=''Accepted'')');
INSERT INTO [${flyway:defaultSchema}].[EntityUniqueKey] ([ID], [EntityID], [Name], [FieldNames], [FilterDefinition]) VALUES ('744ed55d-ad02-4b14-99ce-38e6e1fa1eca', '703330A7-2C34-4BD4-9224-4DE10BB179F3', 'UQ_EncryptionAlgorithm_Name', 'Name', NULL);
INSERT INTO [${flyway:defaultSchema}].[EntityUniqueKey] ([ID], [EntityID], [Name], [FieldNames], [FilterDefinition]) VALUES ('1ac7e6ad-d649-4ab8-a21e-d05b9448e72e', '72AC67C3-5FD0-4320-AB49-813697181A54', 'UQ_AIAgentModality', 'AgentID,ModalityID,Direction', NULL);
INSERT INTO [${flyway:defaultSchema}].[EntityUniqueKey] ([ID], [EntityID], [Name], [FieldNames], [FilterDefinition]) VALUES ('902d6302-7594-4585-92cd-e578d33afb6a', '771ED81A-B504-4027-B223-CA3ABBAA3C75', 'UQ_DashboardPermission_Dashboard_User', 'DashboardID,UserID', NULL);
INSERT INTO [${flyway:defaultSchema}].[EntityUniqueKey] ([ID], [EntityID], [Name], [FieldNames], [FilterDefinition]) VALUES ('13ace57e-125b-48ed-adae-91a79a998ed2', '7815F891-EF05-4B4B-BB1C-DB60C1DF9C21', 'uq_AIModelPriceUnitType_Name', 'Name', NULL);
INSERT INTO [${flyway:defaultSchema}].[EntityUniqueKey] ([ID], [EntityID], [Name], [FieldNames], [FilterDefinition]) VALUES ('1ccf7fe2-6557-4fdb-ab1f-44d6ede933e5', '7AA13345-ACE3-403F-8F5A-CB742AB1C631', 'UQ__UserNoti__737584F6568AC292', 'Name', NULL);
INSERT INTO [${flyway:defaultSchema}].[EntityUniqueKey] ([ID], [EntityID], [Name], [FieldNames], [FilterDefinition]) VALUES ('c00fe080-f01b-4ebe-b98f-bcabb0ae086a', '7AF734B5-579B-4E61-BC1D-38827BB5C465', 'UQ_APIApplication_Name', 'Name', NULL);
INSERT INTO [${flyway:defaultSchema}].[EntityUniqueKey] ([ID], [EntityID], [Name], [FieldNames], [FilterDefinition]) VALUES ('82f2bdfa-dae5-409a-b656-bc2d72eba5ad', '7B7D65A1-BF9F-4174-B4C7-0A98B0CD1F56', 'UQ_WebSearchProvider_Name', 'Name', NULL);
INSERT INTO [${flyway:defaultSchema}].[EntityUniqueKey] ([ID], [EntityID], [Name], [FieldNames], [FilterDefinition]) VALUES ('6dc46669-140d-458f-9bab-14b33b0e9d56', '7BD06B14-122D-426E-A796-1DBE64FA4F60', 'UQ_TaskType_Name', 'Name', NULL);
INSERT INTO [${flyway:defaultSchema}].[EntityUniqueKey] ([ID], [EntityID], [Name], [FieldNames], [FilterDefinition]) VALUES ('14c9e610-e3a3-495c-b3c0-e59477577353', '7E023DDF-82C6-4B0C-9650-8D35699B9FD0', 'UQ_Credential_TypeName', 'CredentialTypeID,Name', NULL);
INSERT INTO [${flyway:defaultSchema}].[EntityUniqueKey] ([ID], [EntityID], [Name], [FieldNames], [FilterDefinition]) VALUES ('082d8ac2-7a2d-4dd5-9daa-badd0d668207', '7EE4D69F-16F5-4DC1-9B02-B4AF7F8CA8D2', 'UQ_SignatureProvider_Name', 'Name', NULL);
INSERT INTO [${flyway:defaultSchema}].[EntityUniqueKey] ([ID], [EntityID], [Name], [FieldNames], [FilterDefinition]) VALUES ('fea8f0eb-cb21-4fc0-9cab-eddbc152f8b4', '7EFB8744-CF96-4C61-8A78-92FAC4FE1B77', 'UQ_AIBridgeAgentIdentity', 'ProviderID,IdentityValue', NULL);
INSERT INTO [${flyway:defaultSchema}].[EntityUniqueKey] ([ID], [EntityID], [Name], [FieldNames], [FilterDefinition]) VALUES ('624c99f3-2132-40a3-80d7-f949fa3ab7a2', '82D34EEC-685A-490E-B26B-897836709026', 'UQ_AIAgentHarness_Name', 'Name', NULL);
INSERT INTO [${flyway:defaultSchema}].[EntityUniqueKey] ([ID], [EntityID], [Name], [FieldNames], [FilterDefinition]) VALUES ('c39dd654-f811-4ab1-bb4a-c8eb10dc7e68', '83DBF4CB-56FE-496F-A5DF-1FC7BF616653', 'UQ_ArchiveConfigEntity_ConfigEntity', 'ArchiveConfigurationID,EntityID', NULL);
INSERT INTO [${flyway:defaultSchema}].[EntityUniqueKey] ([ID], [EntityID], [Name], [FieldNames], [FilterDefinition]) VALUES ('6f644b92-515b-415b-bede-c184b0707461', '840A51D1-7436-45F9-9176-31E1FE785635', 'UQ_AIBridgeProvider_Name', 'Name', NULL);
INSERT INTO [${flyway:defaultSchema}].[EntityUniqueKey] ([ID], [EntityID], [Name], [FieldNames], [FilterDefinition]) VALUES ('93c18514-9fd0-4c2b-a2ad-46677d68f476', '854DB803-34D4-46CD-8B8D-712974AE592F', 'UQ_EncryptionKey_Name', 'Name', NULL);
INSERT INTO [${flyway:defaultSchema}].[EntityUniqueKey] ([ID], [EntityID], [Name], [FieldNames], [FilterDefinition]) VALUES ('4fe4fa95-6d79-4af2-850f-ff6cf39198eb', '86D3ED6F-2D1D-43F6-9777-FD9672FA9021', 'UQ_IntegrationObject_Name', 'IntegrationID,Name', NULL);
INSERT INTO [${flyway:defaultSchema}].[EntityUniqueKey] ([ID], [EntityID], [Name], [FieldNames], [FilterDefinition]) VALUES ('bd8f8277-2a90-426f-80d8-c038741f4ba6', '88026538-D440-48F5-9FE8-A8A7198DBF83', 'UQ_ConversationWidgetInstance_PublicKey', 'PublicKey', NULL);
INSERT INTO [${flyway:defaultSchema}].[EntityUniqueKey] ([ID], [EntityID], [Name], [FieldNames], [FilterDefinition]) VALUES ('2dd27220-d56a-4d04-b871-ec92a552a636', '885C7B1F-57BA-4BD1-B2FD-0D47AAC56FDA', 'UQ_TestType_Name', 'Name', NULL);
INSERT INTO [${flyway:defaultSchema}].[EntityUniqueKey] ([ID], [EntityID], [Name], [FieldNames], [FilterDefinition]) VALUES ('0e4c9332-c1e8-4c87-8548-a12882971f26', '890BDDC2-36D4-4330-9D37-655655E3491E', 'UQ_AIAgentSessionChannel', 'AgentSessionID,ChannelID', NULL);
INSERT INTO [${flyway:defaultSchema}].[EntityUniqueKey] ([ID], [EntityID], [Name], [FieldNames], [FilterDefinition]) VALUES ('c0d02262-aeea-4401-a2d0-b84750b31cd9', '8D7A7BD5-95E8-428C-874A-3829BAD6685E', 'UQ_PhoneNumber_Number', 'Number', NULL);
INSERT INTO [${flyway:defaultSchema}].[EntityUniqueKey] ([ID], [EntityID], [Name], [FieldNames], [FilterDefinition]) VALUES ('cc0fb182-3340-4613-b7d3-a8d5b7799041', '90C6B2D1-9AD8-40A8-9C2C-4DF9433D58C2', 'UQ_AIAgentPersona_Agent_Persona', 'AgentID,PersonaID', NULL);
INSERT INTO [${flyway:defaultSchema}].[EntityUniqueKey] ([ID], [EntityID], [Name], [FieldNames], [FilterDefinition]) VALUES ('f28bd900-be3e-4327-b613-0d2a2f776757', '90C6B2D1-9AD8-40A8-9C2C-4DF9433D58C2', 'UQ_AIAgentPersona_OneDefaultPerAgent', 'AgentID', '([IsDefault]=(1))');
INSERT INTO [${flyway:defaultSchema}].[EntityUniqueKey] ([ID], [EntityID], [Name], [FieldNames], [FilterDefinition]) VALUES ('277ca687-85b2-46b5-9cea-2e3b7c2badaa', '91797885-7128-4B71-8C4B-81C5FEE24F38', 'UQ_ArtifactType_Name', 'Name', NULL);
INSERT INTO [${flyway:defaultSchema}].[EntityUniqueKey] ([ID], [EntityID], [Name], [FieldNames], [FilterDefinition]) VALUES ('dc8caa71-876f-4d7a-b9b5-71e5d606d835', '928EB491-CFE1-46F3-B8C6-BD4034EF3E6B', 'UQ_ComponentLibraryLink_ComponentID_LibraryID', 'ComponentID,LibraryID', NULL);
INSERT INTO [${flyway:defaultSchema}].[EntityUniqueKey] ([ID], [EntityID], [Name], [FieldNames], [FilterDefinition]) VALUES ('3fc90e8d-5dc6-48c7-a496-fae1ce8758c4', '928EB491-CFE1-46F3-B8C6-BD4034EF3E6B', 'UX_ComponentLibraryLink_Component_Library', 'ComponentID,LibraryID', NULL);
INSERT INTO [${flyway:defaultSchema}].[EntityUniqueKey] ([ID], [EntityID], [Name], [FieldNames], [FilterDefinition]) VALUES ('d2d0f1cb-ff75-4035-8207-ca9483dc1f47', '99F3E501-8443-4C39-9D4C-77F712B1ACA1', 'UQ_AIPersona_Name', 'Name', NULL);
INSERT INTO [${flyway:defaultSchema}].[EntityUniqueKey] ([ID], [EntityID], [Name], [FieldNames], [FilterDefinition]) VALUES ('16993917-654e-403a-8798-102f5d3cf44b', '9D04DA94-4C76-4F71-BB83-34E5B6FED1A3', 'UQ_AIAgentConfiguration_Agent_Name', 'AgentID,Name', NULL);
INSERT INTO [${flyway:defaultSchema}].[EntityUniqueKey] ([ID], [EntityID], [Name], [FieldNames], [FilterDefinition]) VALUES ('0da51d80-d978-428f-88fc-45f811d25a9c', '9E05B993-96A3-4E96-BE9B-60C644D575CF', 'UQ_AIAgentArtifactType_Agent_ArtifactType', 'AgentID,ArtifactTypeID', NULL);
INSERT INTO [${flyway:defaultSchema}].[EntityUniqueKey] ([ID], [EntityID], [Name], [FieldNames], [FilterDefinition]) VALUES ('b0f20c47-2e70-461e-b264-47a990293744', '9E05B993-96A3-4E96-BE9B-60C644D575CF', 'UQ_AIAgentArtifactType_AgentID_ArtifactTypeID', 'AgentID,ArtifactTypeID', NULL);
INSERT INTO [${flyway:defaultSchema}].[EntityUniqueKey] ([ID], [EntityID], [Name], [FieldNames], [FilterDefinition]) VALUES ('760f1ef9-2c69-4483-b0f3-ecd4fc421f4f', 'A159B8C9-4941-4AD3-9FC3-A9BC07299206', 'UQ_MCPServer_Name', 'Name', NULL);
INSERT INTO [${flyway:defaultSchema}].[EntityUniqueKey] ([ID], [EntityID], [Name], [FieldNames], [FilterDefinition]) VALUES ('a450fd63-887b-47a0-8a28-9c1e8f443071', 'A60434B6-1893-45ED-9ECB-169EE8FE6241', 'UQ_RubricVersion_Number', 'RubricID,MajorVersion,MinorVersion,PatchVersion', '([MajorVersion] IS NOT NULL)');
INSERT INTO [${flyway:defaultSchema}].[EntityUniqueKey] ([ID], [EntityID], [Name], [FieldNames], [FilterDefinition]) VALUES ('81136faf-c696-40e4-964d-82e48a6f284d', 'A60434B6-1893-45ED-9ECB-169EE8FE6241', 'UQ_RubricVersion_OneDraft', 'RubricID', '([Status]=''Draft'')');
INSERT INTO [${flyway:defaultSchema}].[EntityUniqueKey] ([ID], [EntityID], [Name], [FieldNames], [FilterDefinition]) VALUES ('91a6922f-5d69-4621-b70a-95e6ba164df1', 'A712FD9C-DCA3-4409-9F4E-0ABE70D25439', 'UQ_ComponentDependency_ComponentID_DependencyComponentID', 'ComponentID,DependencyComponentID', NULL);
INSERT INTO [${flyway:defaultSchema}].[EntityUniqueKey] ([ID], [EntityID], [Name], [FieldNames], [FilterDefinition]) VALUES ('8e5b2d18-63d1-494e-ae33-d0ce6977b610', 'A712FD9C-DCA3-4409-9F4E-0ABE70D25439', 'UX_ComponentDependency_Component_Dependency', 'ComponentID,DependencyComponentID', NULL);
INSERT INTO [${flyway:defaultSchema}].[EntityUniqueKey] ([ID], [EntityID], [Name], [FieldNames], [FilterDefinition]) VALUES ('a9c9d57a-7ce9-4f2f-9cba-28fe44ebea3a', 'A75F1DD8-2146-4D03-AA7F-50D048E44D11', 'UQ_MCPServerConnectionTool_ConnectionTool', 'MCPServerConnectionID,MCPServerToolID', NULL);
INSERT INTO [${flyway:defaultSchema}].[EntityUniqueKey] ([ID], [EntityID], [Name], [FieldNames], [FilterDefinition]) VALUES ('6d43dfb3-2556-4bba-9fc1-a42b8f865110', 'AA4ADD02-7763-44CE-B07D-0CF74708749C', 'UQ_AISkillSubAgent_Skill_SubAgent', 'SkillID,SubAgentID', NULL);
INSERT INTO [${flyway:defaultSchema}].[EntityUniqueKey] ([ID], [EntityID], [Name], [FieldNames], [FilterDefinition]) VALUES ('7b901158-31de-434a-b006-f4c5f3bd247a', 'AB9ECA24-70B0-49B8-80CB-0D57C6E63339', 'UQ_MaterializedResultQuery_MaterializedResult', 'MaterializedResultID', NULL);
INSERT INTO [${flyway:defaultSchema}].[EntityUniqueKey] ([ID], [EntityID], [Name], [FieldNames], [FilterDefinition]) VALUES ('8adb1a73-6249-43a7-97dd-39ba2ca97147', 'AB9ECA24-70B0-49B8-80CB-0D57C6E63339', 'UQ_MaterializedResultQuery_Query', 'QueryID', NULL);
INSERT INTO [${flyway:defaultSchema}].[EntityUniqueKey] ([ID], [EntityID], [Name], [FieldNames], [FilterDefinition]) VALUES ('e5b21fed-054b-479c-a736-b005384d78fa', 'AC4A2799-454B-4395-AA56-A42241F32C12', 'UQ_OpenApp_Name', 'Name', NULL);
INSERT INTO [${flyway:defaultSchema}].[EntityUniqueKey] ([ID], [EntityID], [Name], [FieldNames], [FilterDefinition]) VALUES ('f1206442-3c64-4f50-ae11-4f4649192815', 'AC4A2799-454B-4395-AA56-A42241F32C12', 'UQ_OpenApp_Schema', 'SchemaName', NULL);
INSERT INTO [${flyway:defaultSchema}].[EntityUniqueKey] ([ID], [EntityID], [Name], [FieldNames], [FilterDefinition]) VALUES ('515f1cd1-5cf0-4a2a-9375-d9bc4e3534f7', 'AD4D32AE-6848-41A0-A966-2A1F8B751251', 'UQ_AIPromptModel_Prompt_Model_Vendor_ConfigID', 'PromptID,ModelID,VendorID,ConfigurationID', NULL);
INSERT INTO [${flyway:defaultSchema}].[EntityUniqueKey] ([ID], [EntityID], [Name], [FieldNames], [FilterDefinition]) VALUES ('83a8d0ac-3e52-4348-88be-834a856ffb20', 'AEB408D2-162A-49AE-9DC2-DBE9A21A3C01', 'UQ_ArtifactVersion_ArtifactID_VersionNumber', 'ArtifactID,VersionNumber', NULL);
INSERT INTO [${flyway:defaultSchema}].[EntityUniqueKey] ([ID], [EntityID], [Name], [FieldNames], [FilterDefinition]) VALUES ('560cac5c-9ad7-437b-97fc-32d0da7f6d8f', 'B0DBCCF6-9C62-4205-9025-F421A6CBE6E2', 'UQ_Rubric_Name', 'Name', NULL);
INSERT INTO [${flyway:defaultSchema}].[EntityUniqueKey] ([ID], [EntityID], [Name], [FieldNames], [FilterDefinition]) VALUES ('0d111a64-d42f-44e3-8b17-078fd94d7e6e', 'B51CF0E1-2A79-407E-B716-610A608BADAE', 'UQ_ConversationArtifactVersion_ArtifactVersion', 'ConversationArtifactID,Version', NULL);
INSERT INTO [${flyway:defaultSchema}].[EntityUniqueKey] ([ID], [EntityID], [Name], [FieldNames], [FilterDefinition]) VALUES ('e5933648-62e1-4d6e-9369-43b632af0b85', 'B56DB373-2982-4E91-AACB-075CB8BECBBB', 'IX_APIKey_Hash', 'Hash', NULL);
INSERT INTO [${flyway:defaultSchema}].[EntityUniqueKey] ([ID], [EntityID], [Name], [FieldNames], [FilterDefinition]) VALUES ('0df9c859-a4b6-45ad-815f-d0cee5999784', 'B56DB373-2982-4E91-AACB-075CB8BECBBB', 'UQ__APIKey__607056C13AF1E3CE', 'Hash', NULL);
INSERT INTO [${flyway:defaultSchema}].[EntityUniqueKey] ([ID], [EntityID], [Name], [FieldNames], [FilterDefinition]) VALUES ('4c3b3cbe-6dd9-4c5e-96b7-6e4967f492de', 'B6F89BF5-3D26-4D0B-B466-ADD280F8E5F5', 'UQ_MagicLinkInviteAllowedPath', 'InviteID,Path', NULL);
INSERT INTO [${flyway:defaultSchema}].[EntityUniqueKey] ([ID], [EntityID], [Name], [FieldNames], [FilterDefinition]) VALUES ('3de75531-f1ff-4fee-a6c1-1de11cda8048', 'B90FAB4E-0336-407A-B6AE-A49DEA84D083', 'UQ_SearchScopePermission_Role', 'SearchScopeID,RoleID', '([RoleID] IS NOT NULL)');
INSERT INTO [${flyway:defaultSchema}].[EntityUniqueKey] ([ID], [EntityID], [Name], [FieldNames], [FilterDefinition]) VALUES ('f75550bf-b34c-49ed-975e-8d09feff1f5c', 'B90FAB4E-0336-407A-B6AE-A49DEA84D083', 'UQ_SearchScopePermission_User', 'SearchScopeID,UserID', '([UserID] IS NOT NULL)');
INSERT INTO [${flyway:defaultSchema}].[EntityUniqueKey] ([ID], [EntityID], [Name], [FieldNames], [FilterDefinition]) VALUES ('1740c080-9742-486b-8e6d-9ca7d05ee49b', 'B931BF66-BB79-4E82-8324-5BE7C1D65E12', 'IX_MCPServerConnectionPermission_Role', 'MCPServerConnectionID,RoleID', '([RoleID] IS NOT NULL)');
INSERT INTO [${flyway:defaultSchema}].[EntityUniqueKey] ([ID], [EntityID], [Name], [FieldNames], [FilterDefinition]) VALUES ('8a1fdfa4-53f0-4924-b420-5a43de76dda5', 'B931BF66-BB79-4E82-8324-5BE7C1D65E12', 'IX_MCPServerConnectionPermission_User', 'MCPServerConnectionID,UserID', '([UserID] IS NOT NULL)');
INSERT INTO [${flyway:defaultSchema}].[EntityUniqueKey] ([ID], [EntityID], [Name], [FieldNames], [FilterDefinition]) VALUES ('e0aae189-8942-4d2f-a1bf-25e7bcb777d4', 'BA778F47-5A73-4EA6-B8C6-876F5D68FE3F', 'UQ_AIVendorType_VendorID_TypeID', 'VendorID,TypeID', NULL);
INSERT INTO [${flyway:defaultSchema}].[EntityUniqueKey] ([ID], [EntityID], [Name], [FieldNames], [FilterDefinition]) VALUES ('6863d6f8-8b42-498b-a923-e0ded2f480ad', 'C084B950-88AD-4922-9F59-B8D5C2F36988', 'UQ_AISkillSearchScope', 'SkillID,SearchScopeID', NULL);
INSERT INTO [${flyway:defaultSchema}].[EntityUniqueKey] ([ID], [EntityID], [Name], [FieldNames], [FilterDefinition]) VALUES ('58df4f9f-d08b-4477-944d-c02c2ca13416', 'C1D5E9A9-133C-4E73-9DFA-6CC00A4611C1', 'UQ_AIVendorTypeDefinition_Name', 'Name', NULL);
INSERT INTO [${flyway:defaultSchema}].[EntityUniqueKey] ([ID], [EntityID], [Name], [FieldNames], [FilterDefinition]) VALUES ('78cd4c4f-d453-4d4d-b3fe-6a73a2370e61', 'C218C9B9-D7A6-4901-B073-FF25DD613F35', 'IX_AIAgentDataSource_AgentID_Name_Destination', 'AgentID,Name,DestinationType,DestinationPath', NULL);
INSERT INTO [${flyway:defaultSchema}].[EntityUniqueKey] ([ID], [EntityID], [Name], [FieldNames], [FilterDefinition]) VALUES ('79d7bfb0-dd85-43f0-9e24-5e4ebb1b9496', 'C353DB72-DE7C-4674-98D0-D4DDB9D41571', 'UQ_TagCoOccurrence_Pair', 'TagAID,TagBID', NULL);
INSERT INTO [${flyway:defaultSchema}].[EntityUniqueKey] ([ID], [EntityID], [Name], [FieldNames], [FilterDefinition]) VALUES ('5d423547-7bca-409c-84be-5ce02df71896', 'C66B6327-ECF6-47F8-A11B-B4D5E154AE51', 'UQ_MagicLinkInviteAllowedDomain', 'InviteID,Domain', NULL);
INSERT INTO [${flyway:defaultSchema}].[EntityUniqueKey] ([ID], [EntityID], [Name], [FieldNames], [FilterDefinition]) VALUES ('3c2d7c98-8b97-4dff-b2c2-2a6ac1c24389', 'C6988FA5-1EE9-40EE-9BA6-3096CB832208', 'UQ_MagicLinkInviteApplication', 'InviteID,ApplicationID', NULL);
INSERT INTO [${flyway:defaultSchema}].[EntityUniqueKey] ([ID], [EntityID], [Name], [FieldNames], [FilterDefinition]) VALUES ('489b6ae0-74e1-43e9-aef2-fc4a49896b58', 'C6CD026F-239F-4CA8-9ADC-50E5B81EF230', 'UQ_SQLDialect_Name', 'Name', NULL);
INSERT INTO [${flyway:defaultSchema}].[EntityUniqueKey] ([ID], [EntityID], [Name], [FieldNames], [FilterDefinition]) VALUES ('79f5400d-fe07-4f85-a20f-60bda9b7c3e3', 'C6CD026F-239F-4CA8-9ADC-50E5B81EF230', 'UQ_SQLDialect_PlatformKey', 'PlatformKey', NULL);
INSERT INTO [${flyway:defaultSchema}].[EntityUniqueKey] ([ID], [EntityID], [Name], [FieldNames], [FilterDefinition]) VALUES ('61e712ce-25ea-49db-b52c-f97ebe850d28', 'C754B94F-E7BC-4B8E-AD0B-4EC36C9DA111', 'UQ_CollectionArtifact_Collection_Version', 'CollectionID,ArtifactVersionID', NULL);
INSERT INTO [${flyway:defaultSchema}].[EntityUniqueKey] ([ID], [EntityID], [Name], [FieldNames], [FilterDefinition]) VALUES ('14a87b85-6076-4172-be28-5d038b7e9ba1', 'C7A44D04-4B50-4106-BF58-9E0C430906F4', 'UQ_DashboardCategoryPermission_Category_User', 'DashboardCategoryID,UserID', NULL);
INSERT INTO [${flyway:defaultSchema}].[EntityUniqueKey] ([ID], [EntityID], [Name], [FieldNames], [FilterDefinition]) VALUES ('603f07da-e143-4460-85c5-b627dab9edaa', 'CA9E4797-3E8A-4942-AFE9-274CD49872A7', 'UQ_FeaturePipelineVersion_Pin', 'RecordProcessID,PinHash', NULL);
INSERT INTO [${flyway:defaultSchema}].[EntityUniqueKey] ([ID], [EntityID], [Name], [FieldNames], [FilterDefinition]) VALUES ('c7a6f28e-107e-40c4-bf40-994b8ccd5abf', 'CA9E4797-3E8A-4942-AFE9-274CD49872A7', 'UQ_FeaturePipelineVersion_Version', 'RecordProcessID,Version', NULL);
INSERT INTO [${flyway:defaultSchema}].[EntityUniqueKey] ([ID], [EntityID], [Name], [FieldNames], [FilterDefinition]) VALUES ('1750a1a5-c453-4859-a948-119d5b9dfd2a', 'CD4935C5-0C93-46BD-8BD2-0E9368B0BB5A', 'UQ_QueryDependency', 'QueryID,DependsOnQueryID,ReferencePath', NULL);
INSERT INTO [${flyway:defaultSchema}].[EntityUniqueKey] ([ID], [EntityID], [Name], [FieldNames], [FilterDefinition]) VALUES ('61ebb748-aa16-481c-bf64-19bb9edd73f6', 'CDADE3E4-D00A-42E7-B385-CE24D533101E', 'UQ_ExternalDataSourceType_Name', 'Name', NULL);
INSERT INTO [${flyway:defaultSchema}].[EntityUniqueKey] ([ID], [EntityID], [Name], [FieldNames], [FilterDefinition]) VALUES ('0f10c0c0-ffdb-4a81-b6fb-18a0d4c0ebf3', 'CE3761BC-5CA6-44E1-9521-97C48F4D8BB6', 'UQ_TestRunOutputType_Name', 'Name', NULL);
INSERT INTO [${flyway:defaultSchema}].[EntityUniqueKey] ([ID], [EntityID], [Name], [FieldNames], [FilterDefinition]) VALUES ('10d9ea8d-85c4-4547-81b8-c90625f72ba7', 'D0A12FDF-8956-419C-81DF-37A0127A60D2', 'UQ_WorkQueueDelivery_InFlightPartition', 'SubscriptionID,PartitionKey', '([Status]=''InFlight'' AND [PartitionKey] IS NOT NULL)');
INSERT INTO [${flyway:defaultSchema}].[EntityUniqueKey] ([ID], [EntityID], [Name], [FieldNames], [FilterDefinition]) VALUES ('c39c8dcc-f947-485c-93bc-43b9dad99a1d', 'D0A12FDF-8956-419C-81DF-37A0127A60D2', 'UQ_WorkQueueDelivery_Subscription_Message', 'SubscriptionID,MessageID', NULL);
INSERT INTO [${flyway:defaultSchema}].[EntityUniqueKey] ([ID], [EntityID], [Name], [FieldNames], [FilterDefinition]) VALUES ('d7b2ab53-ab46-4397-9005-0141d9859ef2', 'D2021771-50D7-4E0F-A2A8-27AC37E01B34', 'UQ_ConversationSkill_Conversation_Skill', 'ConversationID,SkillID', NULL);
INSERT INTO [${flyway:defaultSchema}].[EntityUniqueKey] ([ID], [EntityID], [Name], [FieldNames], [FilterDefinition]) VALUES ('7ffb776d-ccfe-48cb-895a-5bc658b51da8', 'D2A67D87-F495-43E3-A91B-5A46E5553C31', 'UQ_Meeting_RoomName', 'RoomName', NULL);
INSERT INTO [${flyway:defaultSchema}].[EntityUniqueKey] ([ID], [EntityID], [Name], [FieldNames], [FilterDefinition]) VALUES ('1c4acbb1-7ced-400c-98f1-d0a2cead3748', 'D4238F34-2837-EF11-86D4-6045BDEE16E6', 'UQ_Company_Name', 'Name', NULL);
INSERT INTO [${flyway:defaultSchema}].[EntityUniqueKey] ([ID], [EntityID], [Name], [FieldNames], [FilterDefinition]) VALUES ('b6b9c64a-2ac5-426b-9974-73404a724a3c', 'D512FF2E-A140-45A2-979A-20657AB77137', 'UQ_CredentialType_Name', 'Name', NULL);
INSERT INTO [${flyway:defaultSchema}].[EntityUniqueKey] ([ID], [EntityID], [Name], [FieldNames], [FilterDefinition]) VALUES ('94402706-695d-47fb-860f-1cd37b4c9eaf', 'D5238F34-2837-EF11-86D4-6045BDEE16E6', 'UQ__Employee__Email', 'Email', NULL);
INSERT INTO [${flyway:defaultSchema}].[EntityUniqueKey] ([ID], [EntityID], [Name], [FieldNames], [FilterDefinition]) VALUES ('1ed73a3b-1b8a-43e6-8d2a-0a7b6f8b7c0e', 'D5493024-2F38-47A5-A6F2-B468A64640AD', 'UQ_AIModelPersona_Model_Persona', 'ModelID,PersonaID', NULL);
INSERT INTO [${flyway:defaultSchema}].[EntityUniqueKey] ([ID], [EntityID], [Name], [FieldNames], [FilterDefinition]) VALUES ('caa8e4a4-de71-493b-b48c-7e7ae0776f5a', 'D5C4FEF3-21D0-4A41-893B-34F9527195F0', 'UQ_CompanyIntegrationSyncWatermark_EntityMap_Direction', 'EntityMapID,Direction', NULL);
INSERT INTO [${flyway:defaultSchema}].[EntityUniqueKey] ([ID], [EntityID], [Name], [FieldNames], [FilterDefinition]) VALUES ('2bf3a4c7-2009-4adb-ad47-9ff27523b37e', 'D7B47AFC-C1F3-48D0-9C92-839F52FA5A4F', 'UQ_EntityUniqueKey_EntityID_Name', 'EntityID,Name', NULL);
INSERT INTO [${flyway:defaultSchema}].[EntityUniqueKey] ([ID], [EntityID], [Name], [FieldNames], [FilterDefinition]) VALUES ('7ec9c135-fea9-409a-92a7-cba558abd67f', 'D8238F34-2837-EF11-86D4-6045BDEE16E6', 'UQ_EmployeeRole_EmployeeID_RoleID', 'EmployeeID,RoleID', NULL);
INSERT INTO [${flyway:defaultSchema}].[EntityUniqueKey] ([ID], [EntityID], [Name], [FieldNames], [FilterDefinition]) VALUES ('46af4659-1ea6-4c2c-9b19-a49d88859725', 'D9238F34-2837-EF11-86D4-6045BDEE16E6', 'UQ_EmployeeSkill_EmployeeID_SkillID', 'EmployeeID,SkillID', NULL);
INSERT INTO [${flyway:defaultSchema}].[EntityUniqueKey] ([ID], [EntityID], [Name], [FieldNames], [FilterDefinition]) VALUES ('bf7af18c-5d35-44ee-a318-2a8060d8e1f4', 'D95A17EE-5750-4218-86AD-10F06E4DFBCA', 'UQ_AIVendor_Name', 'Name', NULL);
INSERT INTO [${flyway:defaultSchema}].[EntityUniqueKey] ([ID], [EntityID], [Name], [FieldNames], [FilterDefinition]) VALUES ('0ad6e254-ed70-4a38-9952-41f31bf3fc0a', 'DA238F34-2837-EF11-86D4-6045BDEE16E6', 'UQ__Role__737584F6A210197E', 'Name', NULL);
INSERT INTO [${flyway:defaultSchema}].[EntityUniqueKey] ([ID], [EntityID], [Name], [FieldNames], [FilterDefinition]) VALUES ('898e8e67-1c86-4106-86fd-f11fe781049e', 'DC90010A-21CF-4F61-AF37-F528E4B31AA2', 'UQ_DashboardCategoryLink_Dashboard_User_Category', 'DashboardID,UserID,DashboardCategoryID', NULL);
INSERT INTO [${flyway:defaultSchema}].[EntityUniqueKey] ([ID], [EntityID], [Name], [FieldNames], [FilterDefinition]) VALUES ('1457d17e-ad84-4001-afde-0c256a832aaa', 'DD238F34-2837-EF11-86D4-6045BDEE16E6', 'UQ_Integration_Name', 'Name', NULL);
INSERT INTO [${flyway:defaultSchema}].[EntityUniqueKey] ([ID], [EntityID], [Name], [FieldNames], [FilterDefinition]) VALUES ('956beeff-50b3-414c-9bb9-94e58f87827b', 'DD6EE217-00EC-4DE8-A2E6-489A08D4E524', 'UQ_TaskDependency_Pair', 'TaskID,DependsOnTaskID', NULL);
INSERT INTO [${flyway:defaultSchema}].[EntityUniqueKey] ([ID], [EntityID], [Name], [FieldNames], [FilterDefinition]) VALUES ('9b90a3ab-6f3a-4cf8-93e8-705d48cedbb1', 'DDFC6120-AFAF-4002-A79A-A6AA00B0DF7B', 'IX_DashboardUserPreference_App_Default', 'DashboardID,ApplicationID', '([UserID] IS NULL AND [Scope]=''App'')');
INSERT INTO [${flyway:defaultSchema}].[EntityUniqueKey] ([ID], [EntityID], [Name], [FieldNames], [FilterDefinition]) VALUES ('ae267af4-3333-4610-b3cb-1270d661c8e1', 'DDFC6120-AFAF-4002-A79A-A6AA00B0DF7B', 'IX_DashboardUserPreference_App_User', 'UserID,DashboardID,ApplicationID', '([UserID] IS NOT NULL AND [Scope]=''App'')');
INSERT INTO [${flyway:defaultSchema}].[EntityUniqueKey] ([ID], [EntityID], [Name], [FieldNames], [FilterDefinition]) VALUES ('b8c48f2b-bf6c-4806-bf8c-e7865aa0fe12', 'DDFC6120-AFAF-4002-A79A-A6AA00B0DF7B', 'IX_DashboardUserPreference_Global_Default', 'DashboardID,Scope', '([UserID] IS NULL AND [Scope]=''Global'')');
INSERT INTO [${flyway:defaultSchema}].[EntityUniqueKey] ([ID], [EntityID], [Name], [FieldNames], [FilterDefinition]) VALUES ('2eb4e020-dea6-4c66-b32a-db200749335a', 'DDFC6120-AFAF-4002-A79A-A6AA00B0DF7B', 'IX_DashboardUserPreference_Global_User', 'UserID,DashboardID,Scope', '([UserID] IS NOT NULL AND [Scope]=''Global'')');
INSERT INTO [${flyway:defaultSchema}].[EntityUniqueKey] ([ID], [EntityID], [Name], [FieldNames], [FilterDefinition]) VALUES ('604be927-3509-4a9b-a8e3-bb3eb77308a4', 'DE8EE300-B423-4B86-9E92-B06CAF7F0C3E', 'UQ_ConversationDetailRating_User', 'ConversationDetailID,UserID', NULL);
INSERT INTO [${flyway:defaultSchema}].[EntityUniqueKey] ([ID], [EntityID], [Name], [FieldNames], [FilterDefinition]) VALUES ('ab941615-11c6-44e9-b4ab-36475dcd9a42', 'DF238F34-2837-EF11-86D4-6045BDEE16E6', 'UQ_EntityField_EntityID_Name', 'EntityID,Name', NULL);
INSERT INTO [${flyway:defaultSchema}].[EntityUniqueKey] ([ID], [EntityID], [Name], [FieldNames], [FilterDefinition]) VALUES ('b94f69e4-ca64-4df1-aa20-7868c92bf1c0', 'DF238F34-2837-EF11-86D4-6045BDEE16E6', 'UQ_EntityField_EntityID_Sequence', 'EntityID,Sequence', NULL);
INSERT INTO [${flyway:defaultSchema}].[EntityUniqueKey] ([ID], [EntityID], [Name], [FieldNames], [FilterDefinition]) VALUES ('f6050a52-3042-45b8-b4ca-6f573177a4e9', 'E0238F34-2837-EF11-86D4-6045BDEE16E6', 'UQ_Entity_Name', 'Name', NULL);
INSERT INTO [${flyway:defaultSchema}].[EntityUniqueKey] ([ID], [EntityID], [Name], [FieldNames], [FilterDefinition]) VALUES ('e038d5be-50e3-44ed-870b-3e0da5da0efd', 'E1238F34-2837-EF11-86D4-6045BDEE16E6', 'UQ_User_Email', 'Email', NULL);
INSERT INTO [${flyway:defaultSchema}].[EntityUniqueKey] ([ID], [EntityID], [Name], [FieldNames], [FilterDefinition]) VALUES ('580ec0b5-be0c-46a6-b1fc-c8ad044d5c78', 'E1A36CEA-8AD9-442A-84D6-23A1B38BC278', 'UQ_EncryptionKeySource_Name', 'Name', NULL);
INSERT INTO [${flyway:defaultSchema}].[EntityUniqueKey] ([ID], [EntityID], [Name], [FieldNames], [FilterDefinition]) VALUES ('df0f81bc-c1eb-47d6-8b59-8388bf4b9e00', 'E1BAC2AB-DAD6-40D7-9ADE-C5FE2B405A79', 'UQ_FeatureValueCache_PromptScoped', 'PromptID,PromptVersionHash,ConstraintHash,AIModelID,ParametersHash,KeyHash', '([RecordProcessID] IS NULL)');
INSERT INTO [${flyway:defaultSchema}].[EntityUniqueKey] ([ID], [EntityID], [Name], [FieldNames], [FilterDefinition]) VALUES ('299ec432-3692-4301-a17e-fb080b16eeed', 'E1BAC2AB-DAD6-40D7-9ADE-C5FE2B405A79', 'UQ_FeatureValueCache_Scoped', 'RecordProcessID,PromptID,PromptVersionHash,ConstraintHash,AIModelID,ParametersHash,KeyHash', '([RecordProcessID] IS NOT NULL)');
INSERT INTO [${flyway:defaultSchema}].[EntityUniqueKey] ([ID], [EntityID], [Name], [FieldNames], [FilterDefinition]) VALUES ('1c050f42-55ec-44db-b35d-8fbb1165373f', 'E29013E4-93D3-4001-921C-DC1F745F8DD5', 'UQ_ViewType_Name', 'Name', NULL);
INSERT INTO [${flyway:defaultSchema}].[EntityUniqueKey] ([ID], [EntityID], [Name], [FieldNames], [FilterDefinition]) VALUES ('6cf576aa-3833-419d-9ae2-2bfd64d8a894', 'E3FE5C3C-EF45-4CB5-B806-03E4DDBFB107', 'UQ_RubricBand_Label', 'RubricVersionID,Label', NULL);
INSERT INTO [${flyway:defaultSchema}].[EntityUniqueKey] ([ID], [EntityID], [Name], [FieldNames], [FilterDefinition]) VALUES ('6f21a297-b5d9-4a12-9d4d-84e3e6a37c73', 'E41A5DEE-C259-4B6E-A3C5-BB022BD5F10A', 'UQ_MagicLinkInvite_TokenHash', 'TokenHash', NULL);
INSERT INTO [${flyway:defaultSchema}].[EntityUniqueKey] ([ID], [EntityID], [Name], [FieldNames], [FilterDefinition]) VALUES ('f1661131-f57f-46c4-9e3b-29b35353a3f7', 'E6C72108-A52B-4162-B0C3-CC6CFECD642D', 'UQ_AIBridgeProviderChannel', 'ProviderID,ChannelID', NULL);
INSERT INTO [${flyway:defaultSchema}].[EntityUniqueKey] ([ID], [EntityID], [Name], [FieldNames], [FilterDefinition]) VALUES ('63683312-2326-4245-9ea4-3240d35150ad', 'E6FF1529-89B9-452B-9703-FF26F9E8AA18', 'UQ_OAuthToken_Connection', 'MCPServerConnectionID', NULL);
INSERT INTO [${flyway:defaultSchema}].[EntityUniqueKey] ([ID], [EntityID], [Name], [FieldNames], [FilterDefinition]) VALUES ('31fd92e3-8f1c-4268-866a-deccaf988099', 'E8238F34-2837-EF11-86D4-6045BDEE16E6', 'UQ_Application_Name', 'Name', NULL);
INSERT INTO [${flyway:defaultSchema}].[EntityUniqueKey] ([ID], [EntityID], [Name], [FieldNames], [FilterDefinition]) VALUES ('1a97ac9e-85bd-4de7-bbdc-2c2d5257b6ae', 'E8238F34-2837-EF11-86D4-6045BDEE16E6', 'UQ_Application_Path', 'Path', NULL);
INSERT INTO [${flyway:defaultSchema}].[EntityUniqueKey] ([ID], [EntityID], [Name], [FieldNames], [FilterDefinition]) VALUES ('74d9d051-c103-4cf5-887a-ef9aed329eae', 'E857C741-5B84-4012-8C19-821FC0246EE7', 'UQ_AIModelModality', 'ModelID,ModalityID,Direction', NULL);
INSERT INTO [${flyway:defaultSchema}].[EntityUniqueKey] ([ID], [EntityID], [Name], [FieldNames], [FilterDefinition]) VALUES ('80a45e13-1175-4418-9790-98f1547c5d0c', 'E9238F34-2837-EF11-86D4-6045BDEE16E6', 'UQ_ApplicationEntity_ApplicationID_EntityID', 'ApplicationID,EntityID', NULL);
INSERT INTO [${flyway:defaultSchema}].[EntityUniqueKey] ([ID], [EntityID], [Name], [FieldNames], [FilterDefinition]) VALUES ('61587b89-c7ca-4a15-b03d-7b2af8e61f05', 'E9D66E45-4771-4D80-97D4-42007B9951FB', 'UQ_MagicLinkInviteRole', 'InviteID,RoleID', NULL);
INSERT INTO [${flyway:defaultSchema}].[EntityUniqueKey] ([ID], [EntityID], [Name], [FieldNames], [FilterDefinition]) VALUES ('7cf4647c-1255-4175-92bd-3bb9f1732116', 'E9FA7E1C-1CA1-4315-8A60-D5A92B8E23AA', 'UQ_ConversationArtifactPermission_ArtifactUser', 'ConversationArtifactID,UserID', NULL);
INSERT INTO [${flyway:defaultSchema}].[EntityUniqueKey] ([ID], [EntityID], [Name], [FieldNames], [FilterDefinition]) VALUES ('68a9a4c2-416f-40fa-81bd-fec1503d5ee0', 'EA238F34-2837-EF11-86D4-6045BDEE16E6', 'UQ_EntityPermission_EntityID_RoleID_Type', 'EntityID,RoleID,Type', NULL);
INSERT INTO [${flyway:defaultSchema}].[EntityUniqueKey] ([ID], [EntityID], [Name], [FieldNames], [FilterDefinition]) VALUES ('49fc1cf4-afd6-40bc-846b-99591efc08cc', 'EA41DE76-F03F-4335-A98D-FACFA37AFB1C', 'UQ_TagScope_Tag_Entity_Record', 'TagID,ScopeEntityID,ScopeRecordID', NULL);
INSERT INTO [${flyway:defaultSchema}].[EntityUniqueKey] ([ID], [EntityID], [Name], [FieldNames], [FilterDefinition]) VALUES ('35301809-85ea-4b40-b5a0-2867620cce21', 'EA592498-EC43-4853-878D-4B44D19581E5', 'UQ_OAuthAuthServerMetadataCache_IssuerURL', 'IssuerURL', NULL);
INSERT INTO [${flyway:defaultSchema}].[EntityUniqueKey] ([ID], [EntityID], [Name], [FieldNames], [FilterDefinition]) VALUES ('fb4dcdc5-2259-439b-9687-d8a5515b7df6', 'EB238F34-2837-EF11-86D4-6045BDEE16E6', 'UQ_UserApplicationEntity_UserApplicationID_EntityID', 'UserApplicationID,EntityID', NULL);
INSERT INTO [${flyway:defaultSchema}].[EntityUniqueKey] ([ID], [EntityID], [Name], [FieldNames], [FilterDefinition]) VALUES ('edf2cdee-ad6d-46f3-bae1-76990a379985', 'EBAED427-2514-46B1-A20C-777A2055C937', 'UQ_AIAgentSessionRecordingShard_Session_Index', 'AgentSessionID,Index', NULL);
INSERT INTO [${flyway:defaultSchema}].[EntityUniqueKey] ([ID], [EntityID], [Name], [FieldNames], [FilterDefinition]) VALUES ('3b4c2c9e-1907-4b44-9c3c-c3681dfbcf69', 'EC238F34-2837-EF11-86D4-6045BDEE16E6', 'UQ_UserApplication_UserID_ApplicationID', 'UserID,ApplicationID', NULL);
INSERT INTO [${flyway:defaultSchema}].[EntityUniqueKey] ([ID], [EntityID], [Name], [FieldNames], [FilterDefinition]) VALUES ('47fe5900-34e5-4d4a-8806-c1d093b94129', 'ECBAD01D-21ED-4759-AB7F-4D7F118A49D7', 'UQ_RubricCriterionLevel_AnchorValue', 'CriterionID,AnchorValue', '([AnchorValue] IS NOT NULL)');
INSERT INTO [${flyway:defaultSchema}].[EntityUniqueKey] ([ID], [EntityID], [Name], [FieldNames], [FilterDefinition]) VALUES ('3def8996-ac92-4f26-a45f-bef6196705e6', 'ECBAD01D-21ED-4759-AB7F-4D7F118A49D7', 'UQ_RubricCriterionLevel_ScaleLevel', 'CriterionID,ScaleLevelID', '([ScaleLevelID] IS NOT NULL)');
INSERT INTO [${flyway:defaultSchema}].[EntityUniqueKey] ([ID], [EntityID], [Name], [FieldNames], [FilterDefinition]) VALUES ('f4ae7d96-1127-4cdd-b92e-f29ba9ac66ae', 'ED243F59-106C-4020-A334-5BAD0CCF7987', 'UQ_EOKRE_KeyEntity', 'EntityOrganicKeyID,RelatedEntityID', NULL);
INSERT INTO [${flyway:defaultSchema}].[EntityUniqueKey] ([ID], [EntityID], [Name], [FieldNames], [FilterDefinition]) VALUES ('b1eaa91e-d73e-4a57-8caf-7a2023fb79c8', 'EF238F34-2837-EF11-86D4-6045BDEE16E6', 'UQ_ListDetail_ListID_RecordID', 'ListID,RecordID', NULL);
INSERT INTO [${flyway:defaultSchema}].[EntityUniqueKey] ([ID], [EntityID], [Name], [FieldNames], [FilterDefinition]) VALUES ('18253d78-4a55-4426-84ea-a26c5b2668c9', 'EF86F759-B7F0-4D5D-A594-8BC395129ACF', 'UQ_OAuthAuthorizationState_StateParameter', 'StateParameter', NULL);
INSERT INTO [${flyway:defaultSchema}].[EntityUniqueKey] ([ID], [EntityID], [Name], [FieldNames], [FilterDefinition]) VALUES ('e2a0ada0-7d73-4d00-a663-27e1b4ba9ba3', 'F1741CE5-EACA-492D-9869-9B55D33D9C29', 'UQ_APIKeyScope', 'APIKeyID,ScopeID,ResourcePattern', NULL);
INSERT INTO [${flyway:defaultSchema}].[EntityUniqueKey] ([ID], [EntityID], [Name], [FieldNames], [FilterDefinition]) VALUES ('8fe3514a-c03d-473b-9816-69fc7e68e43a', 'F2A7C2ED-008C-41F8-9404-B303E2EDBBCF', 'UQ_APIApplicationScope', 'ApplicationID,ScopeID,ResourcePattern', NULL);
INSERT INTO [${flyway:defaultSchema}].[EntityUniqueKey] ([ID], [EntityID], [Name], [FieldNames], [FilterDefinition]) VALUES ('00109708-b340-474d-8d90-23e0a826d717', 'F38184CD-4CCD-4B52-B3BF-2A1F1A92A8EB', 'UQ_Theme_Name', 'Name', NULL);
INSERT INTO [${flyway:defaultSchema}].[EntityUniqueKey] ([ID], [EntityID], [Name], [FieldNames], [FilterDefinition]) VALUES ('b8342cb0-288f-4d9c-a498-99fd8b48860c', 'F386546E-EC07-46E6-B780-6B1FEA5892E6', 'UQ_AIModelVendor_ModelID_VendorID_TypeID', 'ModelID,VendorID,TypeID', NULL);
INSERT INTO [${flyway:defaultSchema}].[EntityUniqueKey] ([ID], [EntityID], [Name], [FieldNames], [FilterDefinition]) VALUES ('251f4ffe-af71-43ad-b83f-0d0733eadc2c', 'F4D03836-2513-4E94-9BA4-0CD3D968B849', 'UQ_WorkQueueTopic_Name', 'Name', NULL);
INSERT INTO [${flyway:defaultSchema}].[EntityUniqueKey] ([ID], [EntityID], [Name], [FieldNames], [FilterDefinition]) VALUES ('8f9753c1-64a1-4898-829f-63e77d36a2a2', 'F60EA8EF-C552-4DD6-A8E3-65FFAC57A88D', 'UQ_EntityFieldPermission_Field_Role', 'EntityFieldID,RoleID', NULL);
INSERT INTO [${flyway:defaultSchema}].[EntityUniqueKey] ([ID], [EntityID], [Name], [FieldNames], [FilterDefinition]) VALUES ('99cfb6d7-01b0-47d2-ac62-7b1f8c347caa', 'F75584C0-1BB2-4645-AA4C-24D35B43D45A', 'UQ_WorkQueueSubscription_Name', 'Name', NULL);
INSERT INTO [${flyway:defaultSchema}].[EntityUniqueKey] ([ID], [EntityID], [Name], [FieldNames], [FilterDefinition]) VALUES ('0310634e-f30e-4797-b229-44b068ee0d09', 'F9238F34-2837-EF11-86D4-6045BDEE16E6', 'UQ_Authorization', 'Name', NULL);
INSERT INTO [${flyway:defaultSchema}].[EntityUniqueKey] ([ID], [EntityID], [Name], [FieldNames], [FilterDefinition]) VALUES ('f21b29d8-f8b2-4415-ae4d-d6c20872bdb7', 'FA238F34-2837-EF11-86D4-6045BDEE16E6', 'UQ_AuthorizationRole_AuthorizationID_RoleID', 'AuthorizationID,RoleID', NULL);
INSERT INTO [${flyway:defaultSchema}].[EntityUniqueKey] ([ID], [EntityID], [Name], [FieldNames], [FilterDefinition]) VALUES ('0af8ead6-60f7-441d-8a42-4d7e8679fceb', 'FB238F34-2837-EF11-86D4-6045BDEE16E6', 'UQ_AuditLogType', 'Name', NULL);
INSERT INTO [${flyway:defaultSchema}].[EntityUniqueKey] ([ID], [EntityID], [Name], [FieldNames], [FilterDefinition]) VALUES ('b4743192-6912-4917-88f9-6da5b2ccff80', 'FC9FC6E4-D9D3-4D3F-A0AE-46A10B11034B', 'UQ_TestRubric_Name', 'Name', NULL);
INSERT INTO [${flyway:defaultSchema}].[EntityUniqueKey] ([ID], [EntityID], [Name], [FieldNames], [FilterDefinition]) VALUES ('7aac9d97-39da-4bdb-a7c4-b81ab3bfc8c6', 'FE0D485E-8C3F-4FE0-BD07-EF81E8F14CE0', 'UQ_TagSynonym_Tag_Synonym', 'TagID,Synonym', NULL);
INSERT INTO [${flyway:defaultSchema}].[EntityUniqueKey] ([ID], [EntityID], [Name], [FieldNames], [FilterDefinition]) VALUES ('33a056e1-de1f-4b4a-a282-1471dd5c8dc1', 'FE37218E-259F-47F2-909D-9AECBE5385DB', 'UQ_QuerySQL_Query_Dialect', 'QueryID,SQLDialectID', NULL);
INSERT INTO [${flyway:defaultSchema}].[EntityUniqueKey] ([ID], [EntityID], [Name], [FieldNames], [FilterDefinition]) VALUES ('b8b096c5-50fb-4387-9fd8-9ad9d09177ae', 'FF238F34-2837-EF11-86D4-6045BDEE16E6', 'UQ_AIModelAction_AIActionID_AIModelID', 'AIActionID,AIModelID', NULL);
INSERT INTO [${flyway:defaultSchema}].[EntityUniqueKey] ([ID], [EntityID], [Name], [FieldNames], [FilterDefinition]) VALUES ('8c9dc15f-d84f-4c83-9b03-f9971e40f7aa', 'FF24FF6C-8047-4FCB-A9E4-A737DE7CB66B', 'UQ_AIClientToolDefinition_Name', 'Name', NULL);


/* Create Entity Relationship: MJ: Entities -> MJ: Entity Unique Keys (One To Many via EntityID) */
   IF NOT EXISTS (
      SELECT 1 FROM [${flyway:defaultSchema}].[EntityRelationship] WHERE [ID] = '8df13fb5-a4ed-4248-9c35-42818dc05cd0'
   )
   BEGIN
      INSERT INTO [${flyway:defaultSchema}].[EntityRelationship] ([ID], [EntityID], [RelatedEntityID], [RelatedEntityJoinField], [Type], [BundleInAPI], [DisplayInForm], [Sequence], [__mj_CreatedAt], [__mj_UpdatedAt])
                    VALUES ('8df13fb5-a4ed-4248-9c35-42818dc05cd0', 'E0238F34-2837-EF11-86D4-6045BDEE16E6', 'D7B47AFC-C1F3-48D0-9C92-839F52FA5A4F', 'EntityID', 'One To Many', 1, 1, 90, GETUTCDATE(), GETUTCDATE())
   END;

/* Index for Foreign Keys for EntityUniqueKey */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Entity Unique Keys
-- Item: Index for Foreign Keys
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------
-- Index for foreign key EntityID in table EntityUniqueKey
IF NOT EXISTS (
    SELECT 1
    FROM sys.indexes
    WHERE name = 'IDX_AUTO_MJ_FKEY_EntityUniqueKey_EntityID' 
    AND object_id = OBJECT_ID('[${flyway:defaultSchema}].[EntityUniqueKey]')
)
CREATE INDEX IDX_AUTO_MJ_FKEY_EntityUniqueKey_EntityID ON [${flyway:defaultSchema}].[EntityUniqueKey] ([EntityID]);

/* SQL text to update entity field related entity name field map for entity field ID F626EFC0-570F-40B3-B12D-9B869A02298B */
EXEC [${flyway:defaultSchema}].[spUpdateEntityFieldRelatedEntityNameFieldMap] @EntityFieldID='F626EFC0-570F-40B3-B12D-9B869A02298B', @RelatedEntityNameFieldMap='Entity';

/* Base View SQL for MJ: Entity Unique Keys */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Entity Unique Keys
-- Item: vwEntityUniqueKeys
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- BASE VIEW FOR ENTITY:      MJ: Entity Unique Keys
-----               SCHEMA:      ${flyway:defaultSchema}
-----               BASE TABLE:  EntityUniqueKey
-----               PRIMARY KEY: ID
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[vwEntityUniqueKeys]', 'V') IS NOT NULL
    DROP VIEW [${flyway:defaultSchema}].[vwEntityUniqueKeys];
GO

CREATE VIEW [${flyway:defaultSchema}].[vwEntityUniqueKeys]
AS
SELECT
    e.*,
    MJEntity_EntityID.[Name] AS [Entity]
FROM
    [${flyway:defaultSchema}].[EntityUniqueKey] AS e
INNER JOIN
    [${flyway:defaultSchema}].[Entity] AS MJEntity_EntityID
  ON
    [e].[EntityID] = MJEntity_EntityID.[ID]
GO
GRANT SELECT ON [${flyway:defaultSchema}].[vwEntityUniqueKeys] TO [cdp_UI], [cdp_Developer], [cdp_Integration];

/* Base View Permissions SQL for MJ: Entity Unique Keys */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Entity Unique Keys
-- Item: Permissions for vwEntityUniqueKeys
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

GRANT SELECT ON [${flyway:defaultSchema}].[vwEntityUniqueKeys] TO [cdp_UI], [cdp_Developer], [cdp_Integration];

/* spCreate SQL for MJ: Entity Unique Keys */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Entity Unique Keys
-- Item: spCreateEntityUniqueKey
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- CREATE PROCEDURE FOR EntityUniqueKey
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[spCreateEntityUniqueKey]', 'P') IS NOT NULL
    DROP PROCEDURE [${flyway:defaultSchema}].[spCreateEntityUniqueKey];
GO

CREATE PROCEDURE [${flyway:defaultSchema}].[spCreateEntityUniqueKey]
    @ID uniqueidentifier = NULL,
    @EntityID uniqueidentifier,
    @Name nvarchar(255),
    @FieldNames nvarchar(MAX),
    @FilterDefinition_Clear bit = 0,
    @FilterDefinition nvarchar(MAX) = NULL
AS
BEGIN
    SET NOCOUNT ON;
    DECLARE @InsertedRow TABLE ([ID] UNIQUEIDENTIFIER)

    IF @ID IS NOT NULL
    BEGIN
        -- User provided a value, use it
        INSERT INTO [${flyway:defaultSchema}].[EntityUniqueKey]
            (
                [ID],
                [EntityID],
                [Name],
                [FieldNames],
                [FilterDefinition]
            )
        OUTPUT INSERTED.[ID] INTO @InsertedRow
        VALUES
            (
                @ID,
                @EntityID,
                @Name,
                @FieldNames,
                CASE WHEN @FilterDefinition_Clear = 1 THEN NULL ELSE ISNULL(@FilterDefinition, NULL) END
            )
    END
    ELSE
    BEGIN
        -- No value provided, let database use its default (e.g., NEWSEQUENTIALID())
        INSERT INTO [${flyway:defaultSchema}].[EntityUniqueKey]
            (
                [EntityID],
                [Name],
                [FieldNames],
                [FilterDefinition]
            )
        OUTPUT INSERTED.[ID] INTO @InsertedRow
        VALUES
            (
                @EntityID,
                @Name,
                @FieldNames,
                CASE WHEN @FilterDefinition_Clear = 1 THEN NULL ELSE ISNULL(@FilterDefinition, NULL) END
            )
    END
    -- return the new record from the base view, which might have some calculated fields
    SELECT * FROM [${flyway:defaultSchema}].[vwEntityUniqueKeys] WHERE [ID] = (SELECT [ID] FROM @InsertedRow)
END
GO
GRANT EXECUTE ON [${flyway:defaultSchema}].[spCreateEntityUniqueKey] TO [cdp_Developer], [cdp_Integration];

/* spCreate Permissions for MJ: Entity Unique Keys */

GRANT EXECUTE ON [${flyway:defaultSchema}].[spCreateEntityUniqueKey] TO [cdp_Developer], [cdp_Integration];

/* spUpdate SQL for MJ: Entity Unique Keys */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Entity Unique Keys
-- Item: spUpdateEntityUniqueKey
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- UPDATE PROCEDURE FOR EntityUniqueKey
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[spUpdateEntityUniqueKey]', 'P') IS NOT NULL
    DROP PROCEDURE [${flyway:defaultSchema}].[spUpdateEntityUniqueKey];
GO

CREATE PROCEDURE [${flyway:defaultSchema}].[spUpdateEntityUniqueKey]
    @ID uniqueidentifier,
    @EntityID uniqueidentifier = NULL,
    @Name nvarchar(255) = NULL,
    @FieldNames nvarchar(MAX) = NULL,
    @FilterDefinition_Clear bit = 0,
    @FilterDefinition nvarchar(MAX) = NULL
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE
        [${flyway:defaultSchema}].[EntityUniqueKey]
    SET
        [EntityID] = ISNULL(@EntityID, [EntityID]),
        [Name] = ISNULL(@Name, [Name]),
        [FieldNames] = ISNULL(@FieldNames, [FieldNames]),
        [FilterDefinition] = CASE WHEN @FilterDefinition_Clear = 1 THEN NULL ELSE ISNULL(@FilterDefinition, [FilterDefinition]) END
    WHERE
        [ID] = @ID

    -- Check if the update was successful
    IF @@ROWCOUNT = 0
        -- Nothing was updated, return no rows, but column structure from base view intact, semantically correct this way.
        SELECT TOP 0 * FROM [${flyway:defaultSchema}].[vwEntityUniqueKeys] WHERE 1=0
    ELSE
        -- Return the updated record so the caller can see the updated values and any calculated fields
        SELECT
                                        *
                                    FROM
                                        [${flyway:defaultSchema}].[vwEntityUniqueKeys]
                                    WHERE
                                        [ID] = @ID
                                    
END
GO

GRANT EXECUTE ON [${flyway:defaultSchema}].[spUpdateEntityUniqueKey] TO [cdp_Developer], [cdp_Integration]
GO

------------------------------------------------------------
----- TRIGGER FOR __mj_UpdatedAt field for the EntityUniqueKey table
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[trgUpdateEntityUniqueKey]', 'TR') IS NOT NULL
    DROP TRIGGER [${flyway:defaultSchema}].[trgUpdateEntityUniqueKey];
GO
CREATE TRIGGER [${flyway:defaultSchema}].trgUpdateEntityUniqueKey
ON [${flyway:defaultSchema}].[EntityUniqueKey]
AFTER UPDATE
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE
        [${flyway:defaultSchema}].[EntityUniqueKey]
    SET
        __mj_UpdatedAt = GETUTCDATE()
    FROM
        [${flyway:defaultSchema}].[EntityUniqueKey] AS _organicTable
    INNER JOIN
        INSERTED AS I ON
        _organicTable.[ID] = I.[ID];
END;
GO

/* spUpdate Permissions for MJ: Entity Unique Keys */

GRANT EXECUTE ON [${flyway:defaultSchema}].[spUpdateEntityUniqueKey] TO [cdp_Developer], [cdp_Integration];

/* spDelete SQL for MJ: Entity Unique Keys */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Entity Unique Keys
-- Item: spDeleteEntityUniqueKey
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- DELETE PROCEDURE FOR EntityUniqueKey
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[spDeleteEntityUniqueKey]', 'P') IS NOT NULL
    DROP PROCEDURE [${flyway:defaultSchema}].[spDeleteEntityUniqueKey];
GO

CREATE PROCEDURE [${flyway:defaultSchema}].[spDeleteEntityUniqueKey]
    @ID uniqueidentifier
AS
BEGIN
    SET NOCOUNT ON;

    DELETE FROM
        [${flyway:defaultSchema}].[EntityUniqueKey]
    WHERE
        [ID] = @ID


    -- Check if the delete was successful
    IF @@ROWCOUNT = 0
        SELECT NULL AS [ID] -- Return NULL for all primary key fields to indicate no record was deleted
    ELSE
        SELECT @ID AS [ID] -- Return the primary key values to indicate we successfully deleted the record
END
GO
GRANT EXECUTE ON [${flyway:defaultSchema}].[spDeleteEntityUniqueKey] TO [cdp_Developer], [cdp_Integration];

/* spDelete Permissions for MJ: Entity Unique Keys */

GRANT EXECUTE ON [${flyway:defaultSchema}].[spDeleteEntityUniqueKey] TO [cdp_Developer], [cdp_Integration];

/* SQL text to insert 1 new entity field(s) */

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '094bd0a9-c9b6-4e59-90f7-b1e808075c68' OR (EntityID = 'D7B47AFC-C1F3-48D0-9C92-839F52FA5A4F' AND Name = 'Entity')) BEGIN
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
            '094bd0a9-c9b6-4e59-90f7-b1e808075c68',
            'D7B47AFC-C1F3-48D0-9C92-839F52FA5A4F', -- Entity: MJ: Entity Unique Keys
            (SELECT COALESCE(MAX([Sequence]), 0) + 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE [EntityID] = 'D7B47AFC-C1F3-48D0-9C92-839F52FA5A4F'),
            'Entity',
            'Entity',
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

