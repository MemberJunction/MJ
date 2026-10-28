-- ════════════════════════════════════════════════════════════════════════════════════════
-- CodeGen EntityField drift repairs (#6028, #4050, #4569, #3546)
--
-- Three changes, one migration:
--
--  1. #6028: remove the four virtual `EntityAction` EntityField rows that V202608082250
--     re-inserted right after V202608082130 deleted them. The four base views never had that
--     column, so every BaseEngine load of those entities failed with "Invalid column name
--     'EntityAction'" (SQL Server) / "column EntityAction does not exist" (PostgreSQL).
--
--  2. spUpdateExistingEntityFieldsFromSchema:
--     (a) #4569: IS-A inherited rows (child entity with ParentID set, field IsVirtual = 1 and
--         AllowUpdateAPI = 1 -- the signature manageParentEntityFields writes) keep the
--         RelatedEntity* values CodeGen copies from the parent field. The FK lookup here is keyed
--         on the CHILD's base table, which does not have the inherited column, so it found no FK
--         and nulled the relationship on every run.
--     (b) #4050: orphan-tolerant renumber. An EntityField row whose column is gone from the base
--         view never joins the catalog view, so it kept its old Sequence; when that slot was in
--         the live range, the live field moving onto it hit UQ_EntityField_EntityID_Sequence and
--         the whole metadata pass failed -- before the prune that would have removed the orphan
--         could run. Orphans inside the live range now move above the entity's current maximum
--         first. The prune still deletes them.
--
--  3. spDeleteEntityWithCoreDependencies (#3546): every foreign key in this schema that
--     references Entity.ID now has an explicit decision, taken from the checked-in policy
--     packages/CodeGenLib/src/__tests__/fixtures/entity-delete-fk-policy.json:
--        nullable reference  -> set to NULL (with its paired record-ID column where a CHECK
--                               binds the two)
--        NOT NULL reference  -> delete the referencing rows
--        block               -> left in place; the precondition refuses and names it
--     Exceptions to that default, each with its reason in the policy: scope columns whose NULL
--     means "global" (agent notes/examples, scoped prompt and notification configs, record-scoped
--     entity actions) delete instead of widening scope; form contributions and chrome rules that
--     target the deleted entity delete; resource types and EntityAIAction output rows keep the
--     previous delete behavior; Entity.ParentID stays a blocker.
--     Rows that reference a row this proc deletes (second-order and deeper) are cleared first,
--     children before parents, from the policy's "dependents" list.
--     The body now runs in its own transaction when the caller has none, so a failure part-way
--     no longer leaves the entity half-pruned (Entity row alive, EntityField rows gone).
--     It still does not walk the FK graph at runtime: a reference the policy does not know about
--     (a new core table, or an app schema) is reported by the precondition and nothing is
--     deleted. delete-entity-fk-coverage.test.ts fails when generated metadata gains an FK into
--     Entity, or into a table this proc deletes from, that the policy does not cover.
-- ════════════════════════════════════════════════════════════════════════════════════════


-- ── 1. #6028: drop the re-inserted virtual EntityAction fields ──────────────────────────────
-- Targeted by (EntityID, Name, IsVirtual) rather than by EntityField.ID, matching
-- V202608082130: on databases where CodeGen created these rows the IDs differ.
DECLARE @EntityActionConsumers TABLE (EntityID uniqueidentifier PRIMARY KEY);
INSERT INTO @EntityActionConsumers (EntityID)
VALUES
   ('3E248F34-2837-EF11-86D4-6045BDEE16E6'),  -- MJ: Action Execution Logs
   ('39248F34-2837-EF11-86D4-6045BDEE16E6'),  -- MJ: Entity Action Filters
   ('35248F34-2837-EF11-86D4-6045BDEE16E6'),  -- MJ: Entity Action Invocations
   ('56248F34-2837-EF11-86D4-6045BDEE16E6');  -- MJ: Entity Action Params

-- The flag that makes CodeGen request the column; V202608082130 cleared it, repeated here so a
-- database that re-enabled it does not recreate the row on its next CodeGen run.
UPDATE ef
   SET ef.[IncludeRelatedEntityNameFieldInBaseView] = 0
FROM [${flyway:defaultSchema}].[EntityField] ef
JOIN @EntityActionConsumers c ON c.EntityID = ef.[EntityID]
WHERE ef.[Name] = 'EntityActionID'
  AND ef.[IncludeRelatedEntityNameFieldInBaseView] = 1;

DELETE ef
FROM [${flyway:defaultSchema}].[EntityField] ef
JOIN @EntityActionConsumers c ON c.EntityID = ef.[EntityID]
WHERE ef.[Name] = 'EntityAction'
  AND ef.[IsVirtual] = 1;
GO


-- ── 2. spUpdateExistingEntityFieldsFromSchema ───────────────────────────────────────────────
-- Starts from V202609081500 (soft-PK guard, soft-FK gating, #uef_* materialization,
-- @IncludedSchemaNames). New: the orphan park before the renumber, and the IS-A inherited-row
-- exclusion on RelatedEntityID / RelatedEntityFieldName in both the WHERE and the SET.
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
    SELECT * INTO #uef_pk FROM [${flyway:defaultSchema}].vwTablePrimaryKeys;
    IF OBJECT_ID('tempdb..#uef_uk') IS NOT NULL DROP TABLE #uef_uk;
    SELECT * INTO #uef_uk FROM [${flyway:defaultSchema}].vwTableUniqueKeys;

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
             WHEN pk.ColumnName IS NOT NULL THEN 1
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
              WHEN pk.ColumnName IS NOT NULL THEN 1
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


-- ── 3. spDeleteEntityWithCoreDependencies ───────────────────────────────────────────────────
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
      (N'EntityRelationship.RelatedEntityID'), (N'EntitySetting.EntityID'), (N'FeatureValue.EntityID'),
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




















































-- =============================================================================
-- =============================================================================
-- =============================================================================
--
--                    CODEGEN OUTPUT BELOW THIS LINE
--
-- Everything below this block was generated by the MemberJunction CodeGen tool
-- after the hand-written DDL above was applied to a clean database built from
-- the committed migrations. It contains the create, update and delete procedures
-- whose live definitions no longer matched what CodeGen generates (stale cascade
-- blocks and expression column defaults), plus their permission grants. There are
-- no EntityField, view or extended-property changes.
--
-- DO NOT EDIT BY HAND. If the hand-written DDL above changes, re-run CodeGen
-- and replace this entire section with the fresh output.
--
-- =============================================================================
-- =============================================================================
-- =============================================================================

/* spCreate SQL for MJ: AI Agent User Policies */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: AI Agent User Policies
-- Item: spCreateAIAgentUserPolicy
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- CREATE PROCEDURE FOR AIAgentUserPolicy
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[spCreateAIAgentUserPolicy]', 'P') IS NOT NULL
    DROP PROCEDURE [${flyway:defaultSchema}].[spCreateAIAgentUserPolicy];
GO

CREATE PROCEDURE [${flyway:defaultSchema}].[spCreateAIAgentUserPolicy]
    @ID uniqueidentifier = NULL,
    @AgentID uniqueidentifier,
    @UserID uniqueidentifier,
    @DisplayNameOverride_Clear bit = 0,
    @DisplayNameOverride nvarchar(100) = NULL,
    @PreferredPersonaID_Clear bit = 0,
    @PreferredPersonaID uniqueidentifier = NULL,
    @Status nvarchar(20) = NULL,
    @OnboardingStatus nvarchar(20) = NULL,
    @OnboardedAt_Clear bit = 0,
    @OnboardedAt datetimeoffset = NULL,
    @CoordinationMode nvarchar(20) = NULL,
    @DefaultDataAccessMode nvarchar(20) = NULL,
    @EmailChannelMode nvarchar(20) = NULL,
    @PhoneChannelMode nvarchar(20) = NULL,
    @MessagingChannelMode nvarchar(20) = NULL,
    @CalendarChannelMode nvarchar(30) = NULL,
    @AllowInterAgentCoordination bit = NULL,
    @RequireApprovalForExternalComms bit = NULL,
    @RequireApprovalForFinancials bit = NULL,
    @RequireApprovalForDestructiveActions bit = NULL,
    @AutoApproveAmountThreshold_Clear bit = 0,
    @AutoApproveAmountThreshold decimal(18, 2) = NULL,
    @EntityAccessRules_Clear bit = 0,
    @EntityAccessRules nvarchar(MAX) = NULL,
    @ActionPolicyRules_Clear bit = 0,
    @ActionPolicyRules nvarchar(MAX) = NULL,
    @InstructionsOverride_Clear bit = 0,
    @InstructionsOverride nvarchar(MAX) = NULL
AS
BEGIN
    SET NOCOUNT ON;
    DECLARE @InsertedRow TABLE ([ID] UNIQUEIDENTIFIER)

    IF @ID IS NOT NULL
    BEGIN
        -- User provided a value, use it
        INSERT INTO [${flyway:defaultSchema}].[AIAgentUserPolicy]
            (
                [ID],
                [AgentID],
                [UserID],
                [DisplayNameOverride],
                [PreferredPersonaID],
                [Status],
                [OnboardingStatus],
                [OnboardedAt],
                [CoordinationMode],
                [DefaultDataAccessMode],
                [EmailChannelMode],
                [PhoneChannelMode],
                [MessagingChannelMode],
                [CalendarChannelMode],
                [AllowInterAgentCoordination],
                [RequireApprovalForExternalComms],
                [RequireApprovalForFinancials],
                [RequireApprovalForDestructiveActions],
                [AutoApproveAmountThreshold],
                [EntityAccessRules],
                [ActionPolicyRules],
                [InstructionsOverride]
            )
        OUTPUT INSERTED.[ID] INTO @InsertedRow
        VALUES
            (
                @ID,
                @AgentID,
                @UserID,
                CASE WHEN @DisplayNameOverride_Clear = 1 THEN NULL ELSE ISNULL(@DisplayNameOverride, NULL) END,
                CASE WHEN @PreferredPersonaID_Clear = 1 THEN NULL ELSE ISNULL(@PreferredPersonaID, NULL) END,
                ISNULL(@Status, 'Active'),
                ISNULL(@OnboardingStatus, 'NotStarted'),
                CASE WHEN @OnboardedAt_Clear = 1 THEN NULL ELSE ISNULL(@OnboardedAt, NULL) END,
                ISNULL(@CoordinationMode, 'Observer'),
                ISNULL(@DefaultDataAccessMode, 'UserCeiling'),
                ISNULL(@EmailChannelMode, 'DraftOnly'),
                ISNULL(@PhoneChannelMode, 'InboundOnly'),
                ISNULL(@MessagingChannelMode, 'Enabled'),
                ISNULL(@CalendarChannelMode, 'ReadOnly'),
                ISNULL(@AllowInterAgentCoordination, 1),
                ISNULL(@RequireApprovalForExternalComms, 1),
                ISNULL(@RequireApprovalForFinancials, 1),
                ISNULL(@RequireApprovalForDestructiveActions, 1),
                CASE WHEN @AutoApproveAmountThreshold_Clear = 1 THEN NULL ELSE ISNULL(@AutoApproveAmountThreshold, NULL) END,
                CASE WHEN @EntityAccessRules_Clear = 1 THEN NULL ELSE ISNULL(@EntityAccessRules, NULL) END,
                CASE WHEN @ActionPolicyRules_Clear = 1 THEN NULL ELSE ISNULL(@ActionPolicyRules, NULL) END,
                CASE WHEN @InstructionsOverride_Clear = 1 THEN NULL ELSE ISNULL(@InstructionsOverride, NULL) END
            )
    END
    ELSE
    BEGIN
        -- No value provided, let database use its default (e.g., NEWSEQUENTIALID())
        INSERT INTO [${flyway:defaultSchema}].[AIAgentUserPolicy]
            (
                [AgentID],
                [UserID],
                [DisplayNameOverride],
                [PreferredPersonaID],
                [Status],
                [OnboardingStatus],
                [OnboardedAt],
                [CoordinationMode],
                [DefaultDataAccessMode],
                [EmailChannelMode],
                [PhoneChannelMode],
                [MessagingChannelMode],
                [CalendarChannelMode],
                [AllowInterAgentCoordination],
                [RequireApprovalForExternalComms],
                [RequireApprovalForFinancials],
                [RequireApprovalForDestructiveActions],
                [AutoApproveAmountThreshold],
                [EntityAccessRules],
                [ActionPolicyRules],
                [InstructionsOverride]
            )
        OUTPUT INSERTED.[ID] INTO @InsertedRow
        VALUES
            (
                @AgentID,
                @UserID,
                CASE WHEN @DisplayNameOverride_Clear = 1 THEN NULL ELSE ISNULL(@DisplayNameOverride, NULL) END,
                CASE WHEN @PreferredPersonaID_Clear = 1 THEN NULL ELSE ISNULL(@PreferredPersonaID, NULL) END,
                ISNULL(@Status, 'Active'),
                ISNULL(@OnboardingStatus, 'NotStarted'),
                CASE WHEN @OnboardedAt_Clear = 1 THEN NULL ELSE ISNULL(@OnboardedAt, NULL) END,
                ISNULL(@CoordinationMode, 'Observer'),
                ISNULL(@DefaultDataAccessMode, 'UserCeiling'),
                ISNULL(@EmailChannelMode, 'DraftOnly'),
                ISNULL(@PhoneChannelMode, 'InboundOnly'),
                ISNULL(@MessagingChannelMode, 'Enabled'),
                ISNULL(@CalendarChannelMode, 'ReadOnly'),
                ISNULL(@AllowInterAgentCoordination, 1),
                ISNULL(@RequireApprovalForExternalComms, 1),
                ISNULL(@RequireApprovalForFinancials, 1),
                ISNULL(@RequireApprovalForDestructiveActions, 1),
                CASE WHEN @AutoApproveAmountThreshold_Clear = 1 THEN NULL ELSE ISNULL(@AutoApproveAmountThreshold, NULL) END,
                CASE WHEN @EntityAccessRules_Clear = 1 THEN NULL ELSE ISNULL(@EntityAccessRules, NULL) END,
                CASE WHEN @ActionPolicyRules_Clear = 1 THEN NULL ELSE ISNULL(@ActionPolicyRules, NULL) END,
                CASE WHEN @InstructionsOverride_Clear = 1 THEN NULL ELSE ISNULL(@InstructionsOverride, NULL) END
            )
    END
    -- return the new record from the base view, which might have some calculated fields
    SELECT * FROM [${flyway:defaultSchema}].[vwAIAgentUserPolicies] WHERE [ID] = (SELECT [ID] FROM @InsertedRow)
END
GO
REVOKE EXECUTE ON [${flyway:defaultSchema}].[spCreateAIAgentUserPolicy] FROM [cdp_Developer]
REVOKE EXECUTE ON [${flyway:defaultSchema}].[spCreateAIAgentUserPolicy] FROM [cdp_Integration]
GRANT EXECUTE ON [${flyway:defaultSchema}].[spCreateAIAgentUserPolicy] TO [cdp_Developer], [cdp_Integration];

/* spCreate Permissions for MJ: AI Agent User Policies */

REVOKE EXECUTE ON [${flyway:defaultSchema}].[spCreateAIAgentUserPolicy] FROM [cdp_Developer]
REVOKE EXECUTE ON [${flyway:defaultSchema}].[spCreateAIAgentUserPolicy] FROM [cdp_Integration]
GRANT EXECUTE ON [${flyway:defaultSchema}].[spCreateAIAgentUserPolicy] TO [cdp_Developer], [cdp_Integration];

/* spUpdate SQL for MJ: AI Agent User Policies */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: AI Agent User Policies
-- Item: spUpdateAIAgentUserPolicy
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- UPDATE PROCEDURE FOR AIAgentUserPolicy
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[spUpdateAIAgentUserPolicy]', 'P') IS NOT NULL
    DROP PROCEDURE [${flyway:defaultSchema}].[spUpdateAIAgentUserPolicy];
GO

CREATE PROCEDURE [${flyway:defaultSchema}].[spUpdateAIAgentUserPolicy]
    @ID uniqueidentifier,
    @AgentID uniqueidentifier = NULL,
    @UserID uniqueidentifier = NULL,
    @DisplayNameOverride_Clear bit = 0,
    @DisplayNameOverride nvarchar(100) = NULL,
    @PreferredPersonaID_Clear bit = 0,
    @PreferredPersonaID uniqueidentifier = NULL,
    @Status nvarchar(20) = NULL,
    @OnboardingStatus nvarchar(20) = NULL,
    @OnboardedAt_Clear bit = 0,
    @OnboardedAt datetimeoffset = NULL,
    @CoordinationMode nvarchar(20) = NULL,
    @DefaultDataAccessMode nvarchar(20) = NULL,
    @EmailChannelMode nvarchar(20) = NULL,
    @PhoneChannelMode nvarchar(20) = NULL,
    @MessagingChannelMode nvarchar(20) = NULL,
    @CalendarChannelMode nvarchar(30) = NULL,
    @AllowInterAgentCoordination bit = NULL,
    @RequireApprovalForExternalComms bit = NULL,
    @RequireApprovalForFinancials bit = NULL,
    @RequireApprovalForDestructiveActions bit = NULL,
    @AutoApproveAmountThreshold_Clear bit = 0,
    @AutoApproveAmountThreshold decimal(18, 2) = NULL,
    @EntityAccessRules_Clear bit = 0,
    @EntityAccessRules nvarchar(MAX) = NULL,
    @ActionPolicyRules_Clear bit = 0,
    @ActionPolicyRules nvarchar(MAX) = NULL,
    @InstructionsOverride_Clear bit = 0,
    @InstructionsOverride nvarchar(MAX) = NULL
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE
        [${flyway:defaultSchema}].[AIAgentUserPolicy]
    SET
        [AgentID] = ISNULL(@AgentID, [AgentID]),
        [UserID] = ISNULL(@UserID, [UserID]),
        [DisplayNameOverride] = CASE WHEN @DisplayNameOverride_Clear = 1 THEN NULL ELSE ISNULL(@DisplayNameOverride, [DisplayNameOverride]) END,
        [PreferredPersonaID] = CASE WHEN @PreferredPersonaID_Clear = 1 THEN NULL ELSE ISNULL(@PreferredPersonaID, [PreferredPersonaID]) END,
        [Status] = ISNULL(@Status, [Status]),
        [OnboardingStatus] = ISNULL(@OnboardingStatus, [OnboardingStatus]),
        [OnboardedAt] = CASE WHEN @OnboardedAt_Clear = 1 THEN NULL ELSE ISNULL(@OnboardedAt, [OnboardedAt]) END,
        [CoordinationMode] = ISNULL(@CoordinationMode, [CoordinationMode]),
        [DefaultDataAccessMode] = ISNULL(@DefaultDataAccessMode, [DefaultDataAccessMode]),
        [EmailChannelMode] = ISNULL(@EmailChannelMode, [EmailChannelMode]),
        [PhoneChannelMode] = ISNULL(@PhoneChannelMode, [PhoneChannelMode]),
        [MessagingChannelMode] = ISNULL(@MessagingChannelMode, [MessagingChannelMode]),
        [CalendarChannelMode] = ISNULL(@CalendarChannelMode, [CalendarChannelMode]),
        [AllowInterAgentCoordination] = ISNULL(@AllowInterAgentCoordination, [AllowInterAgentCoordination]),
        [RequireApprovalForExternalComms] = ISNULL(@RequireApprovalForExternalComms, [RequireApprovalForExternalComms]),
        [RequireApprovalForFinancials] = ISNULL(@RequireApprovalForFinancials, [RequireApprovalForFinancials]),
        [RequireApprovalForDestructiveActions] = ISNULL(@RequireApprovalForDestructiveActions, [RequireApprovalForDestructiveActions]),
        [AutoApproveAmountThreshold] = CASE WHEN @AutoApproveAmountThreshold_Clear = 1 THEN NULL ELSE ISNULL(@AutoApproveAmountThreshold, [AutoApproveAmountThreshold]) END,
        [EntityAccessRules] = CASE WHEN @EntityAccessRules_Clear = 1 THEN NULL ELSE ISNULL(@EntityAccessRules, [EntityAccessRules]) END,
        [ActionPolicyRules] = CASE WHEN @ActionPolicyRules_Clear = 1 THEN NULL ELSE ISNULL(@ActionPolicyRules, [ActionPolicyRules]) END,
        [InstructionsOverride] = CASE WHEN @InstructionsOverride_Clear = 1 THEN NULL ELSE ISNULL(@InstructionsOverride, [InstructionsOverride]) END
    WHERE
        [ID] = @ID

    -- Check if the update was successful
    IF @@ROWCOUNT = 0
        -- Nothing was updated, return no rows, but column structure from base view intact, semantically correct this way.
        SELECT TOP 0 * FROM [${flyway:defaultSchema}].[vwAIAgentUserPolicies] WHERE 1=0
    ELSE
        -- Return the updated record so the caller can see the updated values and any calculated fields
        SELECT
                                        *
                                    FROM
                                        [${flyway:defaultSchema}].[vwAIAgentUserPolicies]
                                    WHERE
                                        [ID] = @ID
                                    
END
GO

REVOKE EXECUTE ON [${flyway:defaultSchema}].[spUpdateAIAgentUserPolicy] FROM [cdp_Developer]
REVOKE EXECUTE ON [${flyway:defaultSchema}].[spUpdateAIAgentUserPolicy] FROM [cdp_Integration]
GRANT EXECUTE ON [${flyway:defaultSchema}].[spUpdateAIAgentUserPolicy] TO [cdp_Developer], [cdp_Integration]
GO

------------------------------------------------------------
----- TRIGGER FOR __mj_UpdatedAt field for the AIAgentUserPolicy table
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[trgUpdateAIAgentUserPolicy]', 'TR') IS NOT NULL
    DROP TRIGGER [${flyway:defaultSchema}].[trgUpdateAIAgentUserPolicy];
GO
CREATE TRIGGER [${flyway:defaultSchema}].trgUpdateAIAgentUserPolicy
ON [${flyway:defaultSchema}].[AIAgentUserPolicy]
AFTER UPDATE
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE
        [${flyway:defaultSchema}].[AIAgentUserPolicy]
    SET
        __mj_UpdatedAt = GETUTCDATE()
    FROM
        [${flyway:defaultSchema}].[AIAgentUserPolicy] AS _organicTable
    INNER JOIN
        INSERTED AS I ON
        _organicTable.[ID] = I.[ID];
END;
GO

/* spUpdate Permissions for MJ: AI Agent User Policies */

REVOKE EXECUTE ON [${flyway:defaultSchema}].[spUpdateAIAgentUserPolicy] FROM [cdp_Developer]
REVOKE EXECUTE ON [${flyway:defaultSchema}].[spUpdateAIAgentUserPolicy] FROM [cdp_Integration]
GRANT EXECUTE ON [${flyway:defaultSchema}].[spUpdateAIAgentUserPolicy] TO [cdp_Developer], [cdp_Integration];

/* spDelete SQL for MJ: AI Prompt Runs */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: AI Prompt Runs
-- Item: spDeleteAIPromptRun
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- DELETE PROCEDURE FOR AIPromptRun
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[spDeleteAIPromptRun]', 'P') IS NOT NULL
    DROP PROCEDURE [${flyway:defaultSchema}].[spDeleteAIPromptRun];
GO

CREATE PROCEDURE [${flyway:defaultSchema}].[spDeleteAIPromptRun]
    @ID uniqueidentifier
AS
BEGIN
    SET NOCOUNT ON;
    -- Cascade delete from AIPromptRunMedia using cursor to call spDeleteAIPromptRunMedia
    DECLARE @MJAIPromptRunMedias_PromptRunIDID uniqueidentifier
    DECLARE cascade_delete_MJAIPromptRunMedias_PromptRunID_cursor CURSOR FOR 
        SELECT [ID]
        FROM [${flyway:defaultSchema}].[AIPromptRunMedia]
        WHERE [PromptRunID] = @ID
    
    OPEN cascade_delete_MJAIPromptRunMedias_PromptRunID_cursor
    FETCH NEXT FROM cascade_delete_MJAIPromptRunMedias_PromptRunID_cursor INTO @MJAIPromptRunMedias_PromptRunIDID
    
    WHILE @@FETCH_STATUS = 0
    BEGIN
        EXEC [${flyway:defaultSchema}].[spDeleteAIPromptRunMedia] @ID = @MJAIPromptRunMedias_PromptRunIDID
        
        FETCH NEXT FROM cascade_delete_MJAIPromptRunMedias_PromptRunID_cursor INTO @MJAIPromptRunMedias_PromptRunIDID
    END
    
    CLOSE cascade_delete_MJAIPromptRunMedias_PromptRunID_cursor
    DEALLOCATE cascade_delete_MJAIPromptRunMedias_PromptRunID_cursor
    
    -- Cascade update on AIPromptRun using cursor to call spUpdateAIPromptRun
    DECLARE @MJAIPromptRuns_ParentIDID uniqueidentifier
    DECLARE @MJAIPromptRuns_ParentID_PromptID uniqueidentifier
    DECLARE @MJAIPromptRuns_ParentID_ModelID uniqueidentifier
    DECLARE @MJAIPromptRuns_ParentID_VendorID uniqueidentifier
    DECLARE @MJAIPromptRuns_ParentID_AgentID uniqueidentifier
    DECLARE @MJAIPromptRuns_ParentID_ConfigurationID uniqueidentifier
    DECLARE @MJAIPromptRuns_ParentID_RunAt datetimeoffset
    DECLARE @MJAIPromptRuns_ParentID_CompletedAt datetimeoffset
    DECLARE @MJAIPromptRuns_ParentID_ExecutionTimeMS int
    DECLARE @MJAIPromptRuns_ParentID_Messages nvarchar(MAX)
    DECLARE @MJAIPromptRuns_ParentID_Result nvarchar(MAX)
    DECLARE @MJAIPromptRuns_ParentID_TokensUsed int
    DECLARE @MJAIPromptRuns_ParentID_TokensPrompt int
    DECLARE @MJAIPromptRuns_ParentID_TokensCompletion int
    DECLARE @MJAIPromptRuns_ParentID_TotalCost decimal(19, 8)
    DECLARE @MJAIPromptRuns_ParentID_Success bit
    DECLARE @MJAIPromptRuns_ParentID_ErrorMessage nvarchar(MAX)
    DECLARE @MJAIPromptRuns_ParentID_ParentID uniqueidentifier
    DECLARE @MJAIPromptRuns_ParentID_RunType nvarchar(20)
    DECLARE @MJAIPromptRuns_ParentID_ExecutionOrder int
    DECLARE @MJAIPromptRuns_ParentID_Cost decimal(19, 8)
    DECLARE @MJAIPromptRuns_ParentID_CostCurrency nvarchar(10)
    DECLARE @MJAIPromptRuns_ParentID_TokensUsedRollup int
    DECLARE @MJAIPromptRuns_ParentID_TokensPromptRollup int
    DECLARE @MJAIPromptRuns_ParentID_TokensCompletionRollup int
    DECLARE @MJAIPromptRuns_ParentID_Temperature decimal(3, 2)
    DECLARE @MJAIPromptRuns_ParentID_TopP decimal(3, 2)
    DECLARE @MJAIPromptRuns_ParentID_TopK int
    DECLARE @MJAIPromptRuns_ParentID_MinP decimal(3, 2)
    DECLARE @MJAIPromptRuns_ParentID_FrequencyPenalty decimal(3, 2)
    DECLARE @MJAIPromptRuns_ParentID_PresencePenalty decimal(3, 2)
    DECLARE @MJAIPromptRuns_ParentID_Seed int
    DECLARE @MJAIPromptRuns_ParentID_StopSequences nvarchar(MAX)
    DECLARE @MJAIPromptRuns_ParentID_ResponseFormat nvarchar(50)
    DECLARE @MJAIPromptRuns_ParentID_LogProbs bit
    DECLARE @MJAIPromptRuns_ParentID_TopLogProbs int
    DECLARE @MJAIPromptRuns_ParentID_DescendantCost decimal(19, 8)
    DECLARE @MJAIPromptRuns_ParentID_ValidationAttemptCount int
    DECLARE @MJAIPromptRuns_ParentID_SuccessfulValidationCount int
    DECLARE @MJAIPromptRuns_ParentID_FinalValidationPassed bit
    DECLARE @MJAIPromptRuns_ParentID_ValidationBehavior nvarchar(50)
    DECLARE @MJAIPromptRuns_ParentID_RetryStrategy nvarchar(50)
    DECLARE @MJAIPromptRuns_ParentID_MaxRetriesConfigured int
    DECLARE @MJAIPromptRuns_ParentID_FinalValidationError nvarchar(500)
    DECLARE @MJAIPromptRuns_ParentID_ValidationErrorCount int
    DECLARE @MJAIPromptRuns_ParentID_CommonValidationError nvarchar(255)
    DECLARE @MJAIPromptRuns_ParentID_FirstAttemptAt datetimeoffset
    DECLARE @MJAIPromptRuns_ParentID_LastAttemptAt datetimeoffset
    DECLARE @MJAIPromptRuns_ParentID_TotalRetryDurationMS int
    DECLARE @MJAIPromptRuns_ParentID_ValidationAttempts nvarchar(MAX)
    DECLARE @MJAIPromptRuns_ParentID_ValidationSummary nvarchar(MAX)
    DECLARE @MJAIPromptRuns_ParentID_FailoverAttempts int
    DECLARE @MJAIPromptRuns_ParentID_FailoverErrors nvarchar(MAX)
    DECLARE @MJAIPromptRuns_ParentID_FailoverDurations nvarchar(MAX)
    DECLARE @MJAIPromptRuns_ParentID_OriginalModelID uniqueidentifier
    DECLARE @MJAIPromptRuns_ParentID_OriginalRequestStartTime datetimeoffset
    DECLARE @MJAIPromptRuns_ParentID_TotalFailoverDuration int
    DECLARE @MJAIPromptRuns_ParentID_RerunFromPromptRunID uniqueidentifier
    DECLARE @MJAIPromptRuns_ParentID_ModelSelection nvarchar(MAX)
    DECLARE @MJAIPromptRuns_ParentID_Status nvarchar(50)
    DECLARE @MJAIPromptRuns_ParentID_Cancelled bit
    DECLARE @MJAIPromptRuns_ParentID_CancellationReason nvarchar(MAX)
    DECLARE @MJAIPromptRuns_ParentID_ModelPowerRank int
    DECLARE @MJAIPromptRuns_ParentID_SelectionStrategy nvarchar(50)
    DECLARE @MJAIPromptRuns_ParentID_CacheHit bit
    DECLARE @MJAIPromptRuns_ParentID_CacheKey nvarchar(500)
    DECLARE @MJAIPromptRuns_ParentID_JudgeID uniqueidentifier
    DECLARE @MJAIPromptRuns_ParentID_JudgeScore float(53)
    DECLARE @MJAIPromptRuns_ParentID_WasSelectedResult bit
    DECLARE @MJAIPromptRuns_ParentID_StreamingEnabled bit
    DECLARE @MJAIPromptRuns_ParentID_FirstTokenTime int
    DECLARE @MJAIPromptRuns_ParentID_ErrorDetails nvarchar(MAX)
    DECLARE @MJAIPromptRuns_ParentID_ChildPromptID uniqueidentifier
    DECLARE @MJAIPromptRuns_ParentID_QueueTime int
    DECLARE @MJAIPromptRuns_ParentID_PromptTime int
    DECLARE @MJAIPromptRuns_ParentID_CompletionTime int
    DECLARE @MJAIPromptRuns_ParentID_ModelSpecificResponseDetails nvarchar(MAX)
    DECLARE @MJAIPromptRuns_ParentID_EffortLevel int
    DECLARE @MJAIPromptRuns_ParentID_RunName nvarchar(255)
    DECLARE @MJAIPromptRuns_ParentID_Comments nvarchar(MAX)
    DECLARE @MJAIPromptRuns_ParentID_TestRunID uniqueidentifier
    DECLARE @MJAIPromptRuns_ParentID_AssistantPrefill nvarchar(MAX)
    DECLARE @MJAIPromptRuns_ParentID_TokensCacheRead int
    DECLARE @MJAIPromptRuns_ParentID_TokensCacheWrite int
    DECLARE @MJAIPromptRuns_ParentID_TokensCacheReadRollup int
    DECLARE @MJAIPromptRuns_ParentID_TokensCacheWriteRollup int
    DECLARE @MJAIPromptRuns_ParentID_InputUnitsUsed decimal(19, 8)
    DECLARE @MJAIPromptRuns_ParentID_OutputUnitsUsed decimal(19, 8)
    DECLARE @MJAIPromptRuns_ParentID_UsageTypeID uniqueidentifier
    DECLARE @MJAIPromptRuns_ParentID_ToolCallingMode nvarchar(25)
    DECLARE @MJAIPromptRuns_ParentID_UserID uniqueidentifier
    DECLARE cascade_update_MJAIPromptRuns_ParentID_cursor CURSOR FOR
        SELECT [ID], [PromptID], [ModelID], [VendorID], [AgentID], [ConfigurationID], [RunAt], [CompletedAt], [ExecutionTimeMS], [Messages], [Result], [TokensUsed], [TokensPrompt], [TokensCompletion], [TotalCost], [Success], [ErrorMessage], [ParentID], [RunType], [ExecutionOrder], [Cost], [CostCurrency], [TokensUsedRollup], [TokensPromptRollup], [TokensCompletionRollup], [Temperature], [TopP], [TopK], [MinP], [FrequencyPenalty], [PresencePenalty], [Seed], [StopSequences], [ResponseFormat], [LogProbs], [TopLogProbs], [DescendantCost], [ValidationAttemptCount], [SuccessfulValidationCount], [FinalValidationPassed], [ValidationBehavior], [RetryStrategy], [MaxRetriesConfigured], [FinalValidationError], [ValidationErrorCount], [CommonValidationError], [FirstAttemptAt], [LastAttemptAt], [TotalRetryDurationMS], [ValidationAttempts], [ValidationSummary], [FailoverAttempts], [FailoverErrors], [FailoverDurations], [OriginalModelID], [OriginalRequestStartTime], [TotalFailoverDuration], [RerunFromPromptRunID], [ModelSelection], [Status], [Cancelled], [CancellationReason], [ModelPowerRank], [SelectionStrategy], [CacheHit], [CacheKey], [JudgeID], [JudgeScore], [WasSelectedResult], [StreamingEnabled], [FirstTokenTime], [ErrorDetails], [ChildPromptID], [QueueTime], [PromptTime], [CompletionTime], [ModelSpecificResponseDetails], [EffortLevel], [RunName], [Comments], [TestRunID], [AssistantPrefill], [TokensCacheRead], [TokensCacheWrite], [TokensCacheReadRollup], [TokensCacheWriteRollup], [InputUnitsUsed], [OutputUnitsUsed], [UsageTypeID], [ToolCallingMode], [UserID]
        FROM [${flyway:defaultSchema}].[AIPromptRun]
        WHERE [ParentID] = @ID

    OPEN cascade_update_MJAIPromptRuns_ParentID_cursor
    FETCH NEXT FROM cascade_update_MJAIPromptRuns_ParentID_cursor INTO @MJAIPromptRuns_ParentIDID, @MJAIPromptRuns_ParentID_PromptID, @MJAIPromptRuns_ParentID_ModelID, @MJAIPromptRuns_ParentID_VendorID, @MJAIPromptRuns_ParentID_AgentID, @MJAIPromptRuns_ParentID_ConfigurationID, @MJAIPromptRuns_ParentID_RunAt, @MJAIPromptRuns_ParentID_CompletedAt, @MJAIPromptRuns_ParentID_ExecutionTimeMS, @MJAIPromptRuns_ParentID_Messages, @MJAIPromptRuns_ParentID_Result, @MJAIPromptRuns_ParentID_TokensUsed, @MJAIPromptRuns_ParentID_TokensPrompt, @MJAIPromptRuns_ParentID_TokensCompletion, @MJAIPromptRuns_ParentID_TotalCost, @MJAIPromptRuns_ParentID_Success, @MJAIPromptRuns_ParentID_ErrorMessage, @MJAIPromptRuns_ParentID_ParentID, @MJAIPromptRuns_ParentID_RunType, @MJAIPromptRuns_ParentID_ExecutionOrder, @MJAIPromptRuns_ParentID_Cost, @MJAIPromptRuns_ParentID_CostCurrency, @MJAIPromptRuns_ParentID_TokensUsedRollup, @MJAIPromptRuns_ParentID_TokensPromptRollup, @MJAIPromptRuns_ParentID_TokensCompletionRollup, @MJAIPromptRuns_ParentID_Temperature, @MJAIPromptRuns_ParentID_TopP, @MJAIPromptRuns_ParentID_TopK, @MJAIPromptRuns_ParentID_MinP, @MJAIPromptRuns_ParentID_FrequencyPenalty, @MJAIPromptRuns_ParentID_PresencePenalty, @MJAIPromptRuns_ParentID_Seed, @MJAIPromptRuns_ParentID_StopSequences, @MJAIPromptRuns_ParentID_ResponseFormat, @MJAIPromptRuns_ParentID_LogProbs, @MJAIPromptRuns_ParentID_TopLogProbs, @MJAIPromptRuns_ParentID_DescendantCost, @MJAIPromptRuns_ParentID_ValidationAttemptCount, @MJAIPromptRuns_ParentID_SuccessfulValidationCount, @MJAIPromptRuns_ParentID_FinalValidationPassed, @MJAIPromptRuns_ParentID_ValidationBehavior, @MJAIPromptRuns_ParentID_RetryStrategy, @MJAIPromptRuns_ParentID_MaxRetriesConfigured, @MJAIPromptRuns_ParentID_FinalValidationError, @MJAIPromptRuns_ParentID_ValidationErrorCount, @MJAIPromptRuns_ParentID_CommonValidationError, @MJAIPromptRuns_ParentID_FirstAttemptAt, @MJAIPromptRuns_ParentID_LastAttemptAt, @MJAIPromptRuns_ParentID_TotalRetryDurationMS, @MJAIPromptRuns_ParentID_ValidationAttempts, @MJAIPromptRuns_ParentID_ValidationSummary, @MJAIPromptRuns_ParentID_FailoverAttempts, @MJAIPromptRuns_ParentID_FailoverErrors, @MJAIPromptRuns_ParentID_FailoverDurations, @MJAIPromptRuns_ParentID_OriginalModelID, @MJAIPromptRuns_ParentID_OriginalRequestStartTime, @MJAIPromptRuns_ParentID_TotalFailoverDuration, @MJAIPromptRuns_ParentID_RerunFromPromptRunID, @MJAIPromptRuns_ParentID_ModelSelection, @MJAIPromptRuns_ParentID_Status, @MJAIPromptRuns_ParentID_Cancelled, @MJAIPromptRuns_ParentID_CancellationReason, @MJAIPromptRuns_ParentID_ModelPowerRank, @MJAIPromptRuns_ParentID_SelectionStrategy, @MJAIPromptRuns_ParentID_CacheHit, @MJAIPromptRuns_ParentID_CacheKey, @MJAIPromptRuns_ParentID_JudgeID, @MJAIPromptRuns_ParentID_JudgeScore, @MJAIPromptRuns_ParentID_WasSelectedResult, @MJAIPromptRuns_ParentID_StreamingEnabled, @MJAIPromptRuns_ParentID_FirstTokenTime, @MJAIPromptRuns_ParentID_ErrorDetails, @MJAIPromptRuns_ParentID_ChildPromptID, @MJAIPromptRuns_ParentID_QueueTime, @MJAIPromptRuns_ParentID_PromptTime, @MJAIPromptRuns_ParentID_CompletionTime, @MJAIPromptRuns_ParentID_ModelSpecificResponseDetails, @MJAIPromptRuns_ParentID_EffortLevel, @MJAIPromptRuns_ParentID_RunName, @MJAIPromptRuns_ParentID_Comments, @MJAIPromptRuns_ParentID_TestRunID, @MJAIPromptRuns_ParentID_AssistantPrefill, @MJAIPromptRuns_ParentID_TokensCacheRead, @MJAIPromptRuns_ParentID_TokensCacheWrite, @MJAIPromptRuns_ParentID_TokensCacheReadRollup, @MJAIPromptRuns_ParentID_TokensCacheWriteRollup, @MJAIPromptRuns_ParentID_InputUnitsUsed, @MJAIPromptRuns_ParentID_OutputUnitsUsed, @MJAIPromptRuns_ParentID_UsageTypeID, @MJAIPromptRuns_ParentID_ToolCallingMode, @MJAIPromptRuns_ParentID_UserID

    WHILE @@FETCH_STATUS = 0
    BEGIN
        -- Set the FK field to NULL
        SET @MJAIPromptRuns_ParentID_ParentID = NULL

        -- Call the update SP for the related entity
        EXEC [${flyway:defaultSchema}].[spUpdateAIPromptRun] @ID = @MJAIPromptRuns_ParentIDID, @PromptID = @MJAIPromptRuns_ParentID_PromptID, @ModelID = @MJAIPromptRuns_ParentID_ModelID, @VendorID = @MJAIPromptRuns_ParentID_VendorID, @AgentID = @MJAIPromptRuns_ParentID_AgentID, @ConfigurationID = @MJAIPromptRuns_ParentID_ConfigurationID, @RunAt = @MJAIPromptRuns_ParentID_RunAt, @CompletedAt = @MJAIPromptRuns_ParentID_CompletedAt, @ExecutionTimeMS = @MJAIPromptRuns_ParentID_ExecutionTimeMS, @Messages = @MJAIPromptRuns_ParentID_Messages, @Result = @MJAIPromptRuns_ParentID_Result, @TokensUsed = @MJAIPromptRuns_ParentID_TokensUsed, @TokensPrompt = @MJAIPromptRuns_ParentID_TokensPrompt, @TokensCompletion = @MJAIPromptRuns_ParentID_TokensCompletion, @TotalCost = @MJAIPromptRuns_ParentID_TotalCost, @Success = @MJAIPromptRuns_ParentID_Success, @ErrorMessage = @MJAIPromptRuns_ParentID_ErrorMessage, @ParentID_Clear = 1, @ParentID = @MJAIPromptRuns_ParentID_ParentID, @RunType = @MJAIPromptRuns_ParentID_RunType, @ExecutionOrder = @MJAIPromptRuns_ParentID_ExecutionOrder, @Cost = @MJAIPromptRuns_ParentID_Cost, @CostCurrency = @MJAIPromptRuns_ParentID_CostCurrency, @TokensUsedRollup = @MJAIPromptRuns_ParentID_TokensUsedRollup, @TokensPromptRollup = @MJAIPromptRuns_ParentID_TokensPromptRollup, @TokensCompletionRollup = @MJAIPromptRuns_ParentID_TokensCompletionRollup, @Temperature = @MJAIPromptRuns_ParentID_Temperature, @TopP = @MJAIPromptRuns_ParentID_TopP, @TopK = @MJAIPromptRuns_ParentID_TopK, @MinP = @MJAIPromptRuns_ParentID_MinP, @FrequencyPenalty = @MJAIPromptRuns_ParentID_FrequencyPenalty, @PresencePenalty = @MJAIPromptRuns_ParentID_PresencePenalty, @Seed = @MJAIPromptRuns_ParentID_Seed, @StopSequences = @MJAIPromptRuns_ParentID_StopSequences, @ResponseFormat = @MJAIPromptRuns_ParentID_ResponseFormat, @LogProbs = @MJAIPromptRuns_ParentID_LogProbs, @TopLogProbs = @MJAIPromptRuns_ParentID_TopLogProbs, @DescendantCost = @MJAIPromptRuns_ParentID_DescendantCost, @ValidationAttemptCount = @MJAIPromptRuns_ParentID_ValidationAttemptCount, @SuccessfulValidationCount = @MJAIPromptRuns_ParentID_SuccessfulValidationCount, @FinalValidationPassed = @MJAIPromptRuns_ParentID_FinalValidationPassed, @ValidationBehavior = @MJAIPromptRuns_ParentID_ValidationBehavior, @RetryStrategy = @MJAIPromptRuns_ParentID_RetryStrategy, @MaxRetriesConfigured = @MJAIPromptRuns_ParentID_MaxRetriesConfigured, @FinalValidationError = @MJAIPromptRuns_ParentID_FinalValidationError, @ValidationErrorCount = @MJAIPromptRuns_ParentID_ValidationErrorCount, @CommonValidationError = @MJAIPromptRuns_ParentID_CommonValidationError, @FirstAttemptAt = @MJAIPromptRuns_ParentID_FirstAttemptAt, @LastAttemptAt = @MJAIPromptRuns_ParentID_LastAttemptAt, @TotalRetryDurationMS = @MJAIPromptRuns_ParentID_TotalRetryDurationMS, @ValidationAttempts = @MJAIPromptRuns_ParentID_ValidationAttempts, @ValidationSummary = @MJAIPromptRuns_ParentID_ValidationSummary, @FailoverAttempts = @MJAIPromptRuns_ParentID_FailoverAttempts, @FailoverErrors = @MJAIPromptRuns_ParentID_FailoverErrors, @FailoverDurations = @MJAIPromptRuns_ParentID_FailoverDurations, @OriginalModelID = @MJAIPromptRuns_ParentID_OriginalModelID, @OriginalRequestStartTime = @MJAIPromptRuns_ParentID_OriginalRequestStartTime, @TotalFailoverDuration = @MJAIPromptRuns_ParentID_TotalFailoverDuration, @RerunFromPromptRunID = @MJAIPromptRuns_ParentID_RerunFromPromptRunID, @ModelSelection = @MJAIPromptRuns_ParentID_ModelSelection, @Status = @MJAIPromptRuns_ParentID_Status, @Cancelled = @MJAIPromptRuns_ParentID_Cancelled, @CancellationReason = @MJAIPromptRuns_ParentID_CancellationReason, @ModelPowerRank = @MJAIPromptRuns_ParentID_ModelPowerRank, @SelectionStrategy = @MJAIPromptRuns_ParentID_SelectionStrategy, @CacheHit = @MJAIPromptRuns_ParentID_CacheHit, @CacheKey = @MJAIPromptRuns_ParentID_CacheKey, @JudgeID = @MJAIPromptRuns_ParentID_JudgeID, @JudgeScore = @MJAIPromptRuns_ParentID_JudgeScore, @WasSelectedResult = @MJAIPromptRuns_ParentID_WasSelectedResult, @StreamingEnabled = @MJAIPromptRuns_ParentID_StreamingEnabled, @FirstTokenTime = @MJAIPromptRuns_ParentID_FirstTokenTime, @ErrorDetails = @MJAIPromptRuns_ParentID_ErrorDetails, @ChildPromptID = @MJAIPromptRuns_ParentID_ChildPromptID, @QueueTime = @MJAIPromptRuns_ParentID_QueueTime, @PromptTime = @MJAIPromptRuns_ParentID_PromptTime, @CompletionTime = @MJAIPromptRuns_ParentID_CompletionTime, @ModelSpecificResponseDetails = @MJAIPromptRuns_ParentID_ModelSpecificResponseDetails, @EffortLevel = @MJAIPromptRuns_ParentID_EffortLevel, @RunName = @MJAIPromptRuns_ParentID_RunName, @Comments = @MJAIPromptRuns_ParentID_Comments, @TestRunID = @MJAIPromptRuns_ParentID_TestRunID, @AssistantPrefill = @MJAIPromptRuns_ParentID_AssistantPrefill, @TokensCacheRead = @MJAIPromptRuns_ParentID_TokensCacheRead, @TokensCacheWrite = @MJAIPromptRuns_ParentID_TokensCacheWrite, @TokensCacheReadRollup = @MJAIPromptRuns_ParentID_TokensCacheReadRollup, @TokensCacheWriteRollup = @MJAIPromptRuns_ParentID_TokensCacheWriteRollup, @InputUnitsUsed = @MJAIPromptRuns_ParentID_InputUnitsUsed, @OutputUnitsUsed = @MJAIPromptRuns_ParentID_OutputUnitsUsed, @UsageTypeID = @MJAIPromptRuns_ParentID_UsageTypeID, @ToolCallingMode = @MJAIPromptRuns_ParentID_ToolCallingMode, @UserID = @MJAIPromptRuns_ParentID_UserID

        FETCH NEXT FROM cascade_update_MJAIPromptRuns_ParentID_cursor INTO @MJAIPromptRuns_ParentIDID, @MJAIPromptRuns_ParentID_PromptID, @MJAIPromptRuns_ParentID_ModelID, @MJAIPromptRuns_ParentID_VendorID, @MJAIPromptRuns_ParentID_AgentID, @MJAIPromptRuns_ParentID_ConfigurationID, @MJAIPromptRuns_ParentID_RunAt, @MJAIPromptRuns_ParentID_CompletedAt, @MJAIPromptRuns_ParentID_ExecutionTimeMS, @MJAIPromptRuns_ParentID_Messages, @MJAIPromptRuns_ParentID_Result, @MJAIPromptRuns_ParentID_TokensUsed, @MJAIPromptRuns_ParentID_TokensPrompt, @MJAIPromptRuns_ParentID_TokensCompletion, @MJAIPromptRuns_ParentID_TotalCost, @MJAIPromptRuns_ParentID_Success, @MJAIPromptRuns_ParentID_ErrorMessage, @MJAIPromptRuns_ParentID_ParentID, @MJAIPromptRuns_ParentID_RunType, @MJAIPromptRuns_ParentID_ExecutionOrder, @MJAIPromptRuns_ParentID_Cost, @MJAIPromptRuns_ParentID_CostCurrency, @MJAIPromptRuns_ParentID_TokensUsedRollup, @MJAIPromptRuns_ParentID_TokensPromptRollup, @MJAIPromptRuns_ParentID_TokensCompletionRollup, @MJAIPromptRuns_ParentID_Temperature, @MJAIPromptRuns_ParentID_TopP, @MJAIPromptRuns_ParentID_TopK, @MJAIPromptRuns_ParentID_MinP, @MJAIPromptRuns_ParentID_FrequencyPenalty, @MJAIPromptRuns_ParentID_PresencePenalty, @MJAIPromptRuns_ParentID_Seed, @MJAIPromptRuns_ParentID_StopSequences, @MJAIPromptRuns_ParentID_ResponseFormat, @MJAIPromptRuns_ParentID_LogProbs, @MJAIPromptRuns_ParentID_TopLogProbs, @MJAIPromptRuns_ParentID_DescendantCost, @MJAIPromptRuns_ParentID_ValidationAttemptCount, @MJAIPromptRuns_ParentID_SuccessfulValidationCount, @MJAIPromptRuns_ParentID_FinalValidationPassed, @MJAIPromptRuns_ParentID_ValidationBehavior, @MJAIPromptRuns_ParentID_RetryStrategy, @MJAIPromptRuns_ParentID_MaxRetriesConfigured, @MJAIPromptRuns_ParentID_FinalValidationError, @MJAIPromptRuns_ParentID_ValidationErrorCount, @MJAIPromptRuns_ParentID_CommonValidationError, @MJAIPromptRuns_ParentID_FirstAttemptAt, @MJAIPromptRuns_ParentID_LastAttemptAt, @MJAIPromptRuns_ParentID_TotalRetryDurationMS, @MJAIPromptRuns_ParentID_ValidationAttempts, @MJAIPromptRuns_ParentID_ValidationSummary, @MJAIPromptRuns_ParentID_FailoverAttempts, @MJAIPromptRuns_ParentID_FailoverErrors, @MJAIPromptRuns_ParentID_FailoverDurations, @MJAIPromptRuns_ParentID_OriginalModelID, @MJAIPromptRuns_ParentID_OriginalRequestStartTime, @MJAIPromptRuns_ParentID_TotalFailoverDuration, @MJAIPromptRuns_ParentID_RerunFromPromptRunID, @MJAIPromptRuns_ParentID_ModelSelection, @MJAIPromptRuns_ParentID_Status, @MJAIPromptRuns_ParentID_Cancelled, @MJAIPromptRuns_ParentID_CancellationReason, @MJAIPromptRuns_ParentID_ModelPowerRank, @MJAIPromptRuns_ParentID_SelectionStrategy, @MJAIPromptRuns_ParentID_CacheHit, @MJAIPromptRuns_ParentID_CacheKey, @MJAIPromptRuns_ParentID_JudgeID, @MJAIPromptRuns_ParentID_JudgeScore, @MJAIPromptRuns_ParentID_WasSelectedResult, @MJAIPromptRuns_ParentID_StreamingEnabled, @MJAIPromptRuns_ParentID_FirstTokenTime, @MJAIPromptRuns_ParentID_ErrorDetails, @MJAIPromptRuns_ParentID_ChildPromptID, @MJAIPromptRuns_ParentID_QueueTime, @MJAIPromptRuns_ParentID_PromptTime, @MJAIPromptRuns_ParentID_CompletionTime, @MJAIPromptRuns_ParentID_ModelSpecificResponseDetails, @MJAIPromptRuns_ParentID_EffortLevel, @MJAIPromptRuns_ParentID_RunName, @MJAIPromptRuns_ParentID_Comments, @MJAIPromptRuns_ParentID_TestRunID, @MJAIPromptRuns_ParentID_AssistantPrefill, @MJAIPromptRuns_ParentID_TokensCacheRead, @MJAIPromptRuns_ParentID_TokensCacheWrite, @MJAIPromptRuns_ParentID_TokensCacheReadRollup, @MJAIPromptRuns_ParentID_TokensCacheWriteRollup, @MJAIPromptRuns_ParentID_InputUnitsUsed, @MJAIPromptRuns_ParentID_OutputUnitsUsed, @MJAIPromptRuns_ParentID_UsageTypeID, @MJAIPromptRuns_ParentID_ToolCallingMode, @MJAIPromptRuns_ParentID_UserID
    END

    CLOSE cascade_update_MJAIPromptRuns_ParentID_cursor
    DEALLOCATE cascade_update_MJAIPromptRuns_ParentID_cursor
    
    -- Cascade update on AIPromptRun using cursor to call spUpdateAIPromptRun
    DECLARE @MJAIPromptRuns_RerunFromPromptRunIDID uniqueidentifier
    DECLARE @MJAIPromptRuns_RerunFromPromptRunID_PromptID uniqueidentifier
    DECLARE @MJAIPromptRuns_RerunFromPromptRunID_ModelID uniqueidentifier
    DECLARE @MJAIPromptRuns_RerunFromPromptRunID_VendorID uniqueidentifier
    DECLARE @MJAIPromptRuns_RerunFromPromptRunID_AgentID uniqueidentifier
    DECLARE @MJAIPromptRuns_RerunFromPromptRunID_ConfigurationID uniqueidentifier
    DECLARE @MJAIPromptRuns_RerunFromPromptRunID_RunAt datetimeoffset
    DECLARE @MJAIPromptRuns_RerunFromPromptRunID_CompletedAt datetimeoffset
    DECLARE @MJAIPromptRuns_RerunFromPromptRunID_ExecutionTimeMS int
    DECLARE @MJAIPromptRuns_RerunFromPromptRunID_Messages nvarchar(MAX)
    DECLARE @MJAIPromptRuns_RerunFromPromptRunID_Result nvarchar(MAX)
    DECLARE @MJAIPromptRuns_RerunFromPromptRunID_TokensUsed int
    DECLARE @MJAIPromptRuns_RerunFromPromptRunID_TokensPrompt int
    DECLARE @MJAIPromptRuns_RerunFromPromptRunID_TokensCompletion int
    DECLARE @MJAIPromptRuns_RerunFromPromptRunID_TotalCost decimal(19, 8)
    DECLARE @MJAIPromptRuns_RerunFromPromptRunID_Success bit
    DECLARE @MJAIPromptRuns_RerunFromPromptRunID_ErrorMessage nvarchar(MAX)
    DECLARE @MJAIPromptRuns_RerunFromPromptRunID_ParentID uniqueidentifier
    DECLARE @MJAIPromptRuns_RerunFromPromptRunID_RunType nvarchar(20)
    DECLARE @MJAIPromptRuns_RerunFromPromptRunID_ExecutionOrder int
    DECLARE @MJAIPromptRuns_RerunFromPromptRunID_Cost decimal(19, 8)
    DECLARE @MJAIPromptRuns_RerunFromPromptRunID_CostCurrency nvarchar(10)
    DECLARE @MJAIPromptRuns_RerunFromPromptRunID_TokensUsedRollup int
    DECLARE @MJAIPromptRuns_RerunFromPromptRunID_TokensPromptRollup int
    DECLARE @MJAIPromptRuns_RerunFromPromptRunID_TokensCompletionRollup int
    DECLARE @MJAIPromptRuns_RerunFromPromptRunID_Temperature decimal(3, 2)
    DECLARE @MJAIPromptRuns_RerunFromPromptRunID_TopP decimal(3, 2)
    DECLARE @MJAIPromptRuns_RerunFromPromptRunID_TopK int
    DECLARE @MJAIPromptRuns_RerunFromPromptRunID_MinP decimal(3, 2)
    DECLARE @MJAIPromptRuns_RerunFromPromptRunID_FrequencyPenalty decimal(3, 2)
    DECLARE @MJAIPromptRuns_RerunFromPromptRunID_PresencePenalty decimal(3, 2)
    DECLARE @MJAIPromptRuns_RerunFromPromptRunID_Seed int
    DECLARE @MJAIPromptRuns_RerunFromPromptRunID_StopSequences nvarchar(MAX)
    DECLARE @MJAIPromptRuns_RerunFromPromptRunID_ResponseFormat nvarchar(50)
    DECLARE @MJAIPromptRuns_RerunFromPromptRunID_LogProbs bit
    DECLARE @MJAIPromptRuns_RerunFromPromptRunID_TopLogProbs int
    DECLARE @MJAIPromptRuns_RerunFromPromptRunID_DescendantCost decimal(19, 8)
    DECLARE @MJAIPromptRuns_RerunFromPromptRunID_ValidationAttemptCount int
    DECLARE @MJAIPromptRuns_RerunFromPromptRunID_SuccessfulValidationCount int
    DECLARE @MJAIPromptRuns_RerunFromPromptRunID_FinalValidationPassed bit
    DECLARE @MJAIPromptRuns_RerunFromPromptRunID_ValidationBehavior nvarchar(50)
    DECLARE @MJAIPromptRuns_RerunFromPromptRunID_RetryStrategy nvarchar(50)
    DECLARE @MJAIPromptRuns_RerunFromPromptRunID_MaxRetriesConfigured int
    DECLARE @MJAIPromptRuns_RerunFromPromptRunID_FinalValidationError nvarchar(500)
    DECLARE @MJAIPromptRuns_RerunFromPromptRunID_ValidationErrorCount int
    DECLARE @MJAIPromptRuns_RerunFromPromptRunID_CommonValidationError nvarchar(255)
    DECLARE @MJAIPromptRuns_RerunFromPromptRunID_FirstAttemptAt datetimeoffset
    DECLARE @MJAIPromptRuns_RerunFromPromptRunID_LastAttemptAt datetimeoffset
    DECLARE @MJAIPromptRuns_RerunFromPromptRunID_TotalRetryDurationMS int
    DECLARE @MJAIPromptRuns_RerunFromPromptRunID_ValidationAttempts nvarchar(MAX)
    DECLARE @MJAIPromptRuns_RerunFromPromptRunID_ValidationSummary nvarchar(MAX)
    DECLARE @MJAIPromptRuns_RerunFromPromptRunID_FailoverAttempts int
    DECLARE @MJAIPromptRuns_RerunFromPromptRunID_FailoverErrors nvarchar(MAX)
    DECLARE @MJAIPromptRuns_RerunFromPromptRunID_FailoverDurations nvarchar(MAX)
    DECLARE @MJAIPromptRuns_RerunFromPromptRunID_OriginalModelID uniqueidentifier
    DECLARE @MJAIPromptRuns_RerunFromPromptRunID_OriginalRequestStartTime datetimeoffset
    DECLARE @MJAIPromptRuns_RerunFromPromptRunID_TotalFailoverDuration int
    DECLARE @MJAIPromptRuns_RerunFromPromptRunID_RerunFromPromptRunID uniqueidentifier
    DECLARE @MJAIPromptRuns_RerunFromPromptRunID_ModelSelection nvarchar(MAX)
    DECLARE @MJAIPromptRuns_RerunFromPromptRunID_Status nvarchar(50)
    DECLARE @MJAIPromptRuns_RerunFromPromptRunID_Cancelled bit
    DECLARE @MJAIPromptRuns_RerunFromPromptRunID_CancellationReason nvarchar(MAX)
    DECLARE @MJAIPromptRuns_RerunFromPromptRunID_ModelPowerRank int
    DECLARE @MJAIPromptRuns_RerunFromPromptRunID_SelectionStrategy nvarchar(50)
    DECLARE @MJAIPromptRuns_RerunFromPromptRunID_CacheHit bit
    DECLARE @MJAIPromptRuns_RerunFromPromptRunID_CacheKey nvarchar(500)
    DECLARE @MJAIPromptRuns_RerunFromPromptRunID_JudgeID uniqueidentifier
    DECLARE @MJAIPromptRuns_RerunFromPromptRunID_JudgeScore float(53)
    DECLARE @MJAIPromptRuns_RerunFromPromptRunID_WasSelectedResult bit
    DECLARE @MJAIPromptRuns_RerunFromPromptRunID_StreamingEnabled bit
    DECLARE @MJAIPromptRuns_RerunFromPromptRunID_FirstTokenTime int
    DECLARE @MJAIPromptRuns_RerunFromPromptRunID_ErrorDetails nvarchar(MAX)
    DECLARE @MJAIPromptRuns_RerunFromPromptRunID_ChildPromptID uniqueidentifier
    DECLARE @MJAIPromptRuns_RerunFromPromptRunID_QueueTime int
    DECLARE @MJAIPromptRuns_RerunFromPromptRunID_PromptTime int
    DECLARE @MJAIPromptRuns_RerunFromPromptRunID_CompletionTime int
    DECLARE @MJAIPromptRuns_RerunFromPromptRunID_ModelSpecificResponseDetails nvarchar(MAX)
    DECLARE @MJAIPromptRuns_RerunFromPromptRunID_EffortLevel int
    DECLARE @MJAIPromptRuns_RerunFromPromptRunID_RunName nvarchar(255)
    DECLARE @MJAIPromptRuns_RerunFromPromptRunID_Comments nvarchar(MAX)
    DECLARE @MJAIPromptRuns_RerunFromPromptRunID_TestRunID uniqueidentifier
    DECLARE @MJAIPromptRuns_RerunFromPromptRunID_AssistantPrefill nvarchar(MAX)
    DECLARE @MJAIPromptRuns_RerunFromPromptRunID_TokensCacheRead int
    DECLARE @MJAIPromptRuns_RerunFromPromptRunID_TokensCacheWrite int
    DECLARE @MJAIPromptRuns_RerunFromPromptRunID_TokensCacheReadRollup int
    DECLARE @MJAIPromptRuns_RerunFromPromptRunID_TokensCacheWriteRollup int
    DECLARE @MJAIPromptRuns_RerunFromPromptRunID_InputUnitsUsed decimal(19, 8)
    DECLARE @MJAIPromptRuns_RerunFromPromptRunID_OutputUnitsUsed decimal(19, 8)
    DECLARE @MJAIPromptRuns_RerunFromPromptRunID_UsageTypeID uniqueidentifier
    DECLARE @MJAIPromptRuns_RerunFromPromptRunID_ToolCallingMode nvarchar(25)
    DECLARE @MJAIPromptRuns_RerunFromPromptRunID_UserID uniqueidentifier
    DECLARE cascade_update_MJAIPromptRuns_RerunFromPromptRunID_cursor CURSOR FOR
        SELECT [ID], [PromptID], [ModelID], [VendorID], [AgentID], [ConfigurationID], [RunAt], [CompletedAt], [ExecutionTimeMS], [Messages], [Result], [TokensUsed], [TokensPrompt], [TokensCompletion], [TotalCost], [Success], [ErrorMessage], [ParentID], [RunType], [ExecutionOrder], [Cost], [CostCurrency], [TokensUsedRollup], [TokensPromptRollup], [TokensCompletionRollup], [Temperature], [TopP], [TopK], [MinP], [FrequencyPenalty], [PresencePenalty], [Seed], [StopSequences], [ResponseFormat], [LogProbs], [TopLogProbs], [DescendantCost], [ValidationAttemptCount], [SuccessfulValidationCount], [FinalValidationPassed], [ValidationBehavior], [RetryStrategy], [MaxRetriesConfigured], [FinalValidationError], [ValidationErrorCount], [CommonValidationError], [FirstAttemptAt], [LastAttemptAt], [TotalRetryDurationMS], [ValidationAttempts], [ValidationSummary], [FailoverAttempts], [FailoverErrors], [FailoverDurations], [OriginalModelID], [OriginalRequestStartTime], [TotalFailoverDuration], [RerunFromPromptRunID], [ModelSelection], [Status], [Cancelled], [CancellationReason], [ModelPowerRank], [SelectionStrategy], [CacheHit], [CacheKey], [JudgeID], [JudgeScore], [WasSelectedResult], [StreamingEnabled], [FirstTokenTime], [ErrorDetails], [ChildPromptID], [QueueTime], [PromptTime], [CompletionTime], [ModelSpecificResponseDetails], [EffortLevel], [RunName], [Comments], [TestRunID], [AssistantPrefill], [TokensCacheRead], [TokensCacheWrite], [TokensCacheReadRollup], [TokensCacheWriteRollup], [InputUnitsUsed], [OutputUnitsUsed], [UsageTypeID], [ToolCallingMode], [UserID]
        FROM [${flyway:defaultSchema}].[AIPromptRun]
        WHERE [RerunFromPromptRunID] = @ID

    OPEN cascade_update_MJAIPromptRuns_RerunFromPromptRunID_cursor
    FETCH NEXT FROM cascade_update_MJAIPromptRuns_RerunFromPromptRunID_cursor INTO @MJAIPromptRuns_RerunFromPromptRunIDID, @MJAIPromptRuns_RerunFromPromptRunID_PromptID, @MJAIPromptRuns_RerunFromPromptRunID_ModelID, @MJAIPromptRuns_RerunFromPromptRunID_VendorID, @MJAIPromptRuns_RerunFromPromptRunID_AgentID, @MJAIPromptRuns_RerunFromPromptRunID_ConfigurationID, @MJAIPromptRuns_RerunFromPromptRunID_RunAt, @MJAIPromptRuns_RerunFromPromptRunID_CompletedAt, @MJAIPromptRuns_RerunFromPromptRunID_ExecutionTimeMS, @MJAIPromptRuns_RerunFromPromptRunID_Messages, @MJAIPromptRuns_RerunFromPromptRunID_Result, @MJAIPromptRuns_RerunFromPromptRunID_TokensUsed, @MJAIPromptRuns_RerunFromPromptRunID_TokensPrompt, @MJAIPromptRuns_RerunFromPromptRunID_TokensCompletion, @MJAIPromptRuns_RerunFromPromptRunID_TotalCost, @MJAIPromptRuns_RerunFromPromptRunID_Success, @MJAIPromptRuns_RerunFromPromptRunID_ErrorMessage, @MJAIPromptRuns_RerunFromPromptRunID_ParentID, @MJAIPromptRuns_RerunFromPromptRunID_RunType, @MJAIPromptRuns_RerunFromPromptRunID_ExecutionOrder, @MJAIPromptRuns_RerunFromPromptRunID_Cost, @MJAIPromptRuns_RerunFromPromptRunID_CostCurrency, @MJAIPromptRuns_RerunFromPromptRunID_TokensUsedRollup, @MJAIPromptRuns_RerunFromPromptRunID_TokensPromptRollup, @MJAIPromptRuns_RerunFromPromptRunID_TokensCompletionRollup, @MJAIPromptRuns_RerunFromPromptRunID_Temperature, @MJAIPromptRuns_RerunFromPromptRunID_TopP, @MJAIPromptRuns_RerunFromPromptRunID_TopK, @MJAIPromptRuns_RerunFromPromptRunID_MinP, @MJAIPromptRuns_RerunFromPromptRunID_FrequencyPenalty, @MJAIPromptRuns_RerunFromPromptRunID_PresencePenalty, @MJAIPromptRuns_RerunFromPromptRunID_Seed, @MJAIPromptRuns_RerunFromPromptRunID_StopSequences, @MJAIPromptRuns_RerunFromPromptRunID_ResponseFormat, @MJAIPromptRuns_RerunFromPromptRunID_LogProbs, @MJAIPromptRuns_RerunFromPromptRunID_TopLogProbs, @MJAIPromptRuns_RerunFromPromptRunID_DescendantCost, @MJAIPromptRuns_RerunFromPromptRunID_ValidationAttemptCount, @MJAIPromptRuns_RerunFromPromptRunID_SuccessfulValidationCount, @MJAIPromptRuns_RerunFromPromptRunID_FinalValidationPassed, @MJAIPromptRuns_RerunFromPromptRunID_ValidationBehavior, @MJAIPromptRuns_RerunFromPromptRunID_RetryStrategy, @MJAIPromptRuns_RerunFromPromptRunID_MaxRetriesConfigured, @MJAIPromptRuns_RerunFromPromptRunID_FinalValidationError, @MJAIPromptRuns_RerunFromPromptRunID_ValidationErrorCount, @MJAIPromptRuns_RerunFromPromptRunID_CommonValidationError, @MJAIPromptRuns_RerunFromPromptRunID_FirstAttemptAt, @MJAIPromptRuns_RerunFromPromptRunID_LastAttemptAt, @MJAIPromptRuns_RerunFromPromptRunID_TotalRetryDurationMS, @MJAIPromptRuns_RerunFromPromptRunID_ValidationAttempts, @MJAIPromptRuns_RerunFromPromptRunID_ValidationSummary, @MJAIPromptRuns_RerunFromPromptRunID_FailoverAttempts, @MJAIPromptRuns_RerunFromPromptRunID_FailoverErrors, @MJAIPromptRuns_RerunFromPromptRunID_FailoverDurations, @MJAIPromptRuns_RerunFromPromptRunID_OriginalModelID, @MJAIPromptRuns_RerunFromPromptRunID_OriginalRequestStartTime, @MJAIPromptRuns_RerunFromPromptRunID_TotalFailoverDuration, @MJAIPromptRuns_RerunFromPromptRunID_RerunFromPromptRunID, @MJAIPromptRuns_RerunFromPromptRunID_ModelSelection, @MJAIPromptRuns_RerunFromPromptRunID_Status, @MJAIPromptRuns_RerunFromPromptRunID_Cancelled, @MJAIPromptRuns_RerunFromPromptRunID_CancellationReason, @MJAIPromptRuns_RerunFromPromptRunID_ModelPowerRank, @MJAIPromptRuns_RerunFromPromptRunID_SelectionStrategy, @MJAIPromptRuns_RerunFromPromptRunID_CacheHit, @MJAIPromptRuns_RerunFromPromptRunID_CacheKey, @MJAIPromptRuns_RerunFromPromptRunID_JudgeID, @MJAIPromptRuns_RerunFromPromptRunID_JudgeScore, @MJAIPromptRuns_RerunFromPromptRunID_WasSelectedResult, @MJAIPromptRuns_RerunFromPromptRunID_StreamingEnabled, @MJAIPromptRuns_RerunFromPromptRunID_FirstTokenTime, @MJAIPromptRuns_RerunFromPromptRunID_ErrorDetails, @MJAIPromptRuns_RerunFromPromptRunID_ChildPromptID, @MJAIPromptRuns_RerunFromPromptRunID_QueueTime, @MJAIPromptRuns_RerunFromPromptRunID_PromptTime, @MJAIPromptRuns_RerunFromPromptRunID_CompletionTime, @MJAIPromptRuns_RerunFromPromptRunID_ModelSpecificResponseDetails, @MJAIPromptRuns_RerunFromPromptRunID_EffortLevel, @MJAIPromptRuns_RerunFromPromptRunID_RunName, @MJAIPromptRuns_RerunFromPromptRunID_Comments, @MJAIPromptRuns_RerunFromPromptRunID_TestRunID, @MJAIPromptRuns_RerunFromPromptRunID_AssistantPrefill, @MJAIPromptRuns_RerunFromPromptRunID_TokensCacheRead, @MJAIPromptRuns_RerunFromPromptRunID_TokensCacheWrite, @MJAIPromptRuns_RerunFromPromptRunID_TokensCacheReadRollup, @MJAIPromptRuns_RerunFromPromptRunID_TokensCacheWriteRollup, @MJAIPromptRuns_RerunFromPromptRunID_InputUnitsUsed, @MJAIPromptRuns_RerunFromPromptRunID_OutputUnitsUsed, @MJAIPromptRuns_RerunFromPromptRunID_UsageTypeID, @MJAIPromptRuns_RerunFromPromptRunID_ToolCallingMode, @MJAIPromptRuns_RerunFromPromptRunID_UserID

    WHILE @@FETCH_STATUS = 0
    BEGIN
        -- Set the FK field to NULL
        SET @MJAIPromptRuns_RerunFromPromptRunID_RerunFromPromptRunID = NULL

        -- Call the update SP for the related entity
        EXEC [${flyway:defaultSchema}].[spUpdateAIPromptRun] @ID = @MJAIPromptRuns_RerunFromPromptRunIDID, @PromptID = @MJAIPromptRuns_RerunFromPromptRunID_PromptID, @ModelID = @MJAIPromptRuns_RerunFromPromptRunID_ModelID, @VendorID = @MJAIPromptRuns_RerunFromPromptRunID_VendorID, @AgentID = @MJAIPromptRuns_RerunFromPromptRunID_AgentID, @ConfigurationID = @MJAIPromptRuns_RerunFromPromptRunID_ConfigurationID, @RunAt = @MJAIPromptRuns_RerunFromPromptRunID_RunAt, @CompletedAt = @MJAIPromptRuns_RerunFromPromptRunID_CompletedAt, @ExecutionTimeMS = @MJAIPromptRuns_RerunFromPromptRunID_ExecutionTimeMS, @Messages = @MJAIPromptRuns_RerunFromPromptRunID_Messages, @Result = @MJAIPromptRuns_RerunFromPromptRunID_Result, @TokensUsed = @MJAIPromptRuns_RerunFromPromptRunID_TokensUsed, @TokensPrompt = @MJAIPromptRuns_RerunFromPromptRunID_TokensPrompt, @TokensCompletion = @MJAIPromptRuns_RerunFromPromptRunID_TokensCompletion, @TotalCost = @MJAIPromptRuns_RerunFromPromptRunID_TotalCost, @Success = @MJAIPromptRuns_RerunFromPromptRunID_Success, @ErrorMessage = @MJAIPromptRuns_RerunFromPromptRunID_ErrorMessage, @ParentID = @MJAIPromptRuns_RerunFromPromptRunID_ParentID, @RunType = @MJAIPromptRuns_RerunFromPromptRunID_RunType, @ExecutionOrder = @MJAIPromptRuns_RerunFromPromptRunID_ExecutionOrder, @Cost = @MJAIPromptRuns_RerunFromPromptRunID_Cost, @CostCurrency = @MJAIPromptRuns_RerunFromPromptRunID_CostCurrency, @TokensUsedRollup = @MJAIPromptRuns_RerunFromPromptRunID_TokensUsedRollup, @TokensPromptRollup = @MJAIPromptRuns_RerunFromPromptRunID_TokensPromptRollup, @TokensCompletionRollup = @MJAIPromptRuns_RerunFromPromptRunID_TokensCompletionRollup, @Temperature = @MJAIPromptRuns_RerunFromPromptRunID_Temperature, @TopP = @MJAIPromptRuns_RerunFromPromptRunID_TopP, @TopK = @MJAIPromptRuns_RerunFromPromptRunID_TopK, @MinP = @MJAIPromptRuns_RerunFromPromptRunID_MinP, @FrequencyPenalty = @MJAIPromptRuns_RerunFromPromptRunID_FrequencyPenalty, @PresencePenalty = @MJAIPromptRuns_RerunFromPromptRunID_PresencePenalty, @Seed = @MJAIPromptRuns_RerunFromPromptRunID_Seed, @StopSequences = @MJAIPromptRuns_RerunFromPromptRunID_StopSequences, @ResponseFormat = @MJAIPromptRuns_RerunFromPromptRunID_ResponseFormat, @LogProbs = @MJAIPromptRuns_RerunFromPromptRunID_LogProbs, @TopLogProbs = @MJAIPromptRuns_RerunFromPromptRunID_TopLogProbs, @DescendantCost = @MJAIPromptRuns_RerunFromPromptRunID_DescendantCost, @ValidationAttemptCount = @MJAIPromptRuns_RerunFromPromptRunID_ValidationAttemptCount, @SuccessfulValidationCount = @MJAIPromptRuns_RerunFromPromptRunID_SuccessfulValidationCount, @FinalValidationPassed = @MJAIPromptRuns_RerunFromPromptRunID_FinalValidationPassed, @ValidationBehavior = @MJAIPromptRuns_RerunFromPromptRunID_ValidationBehavior, @RetryStrategy = @MJAIPromptRuns_RerunFromPromptRunID_RetryStrategy, @MaxRetriesConfigured = @MJAIPromptRuns_RerunFromPromptRunID_MaxRetriesConfigured, @FinalValidationError = @MJAIPromptRuns_RerunFromPromptRunID_FinalValidationError, @ValidationErrorCount = @MJAIPromptRuns_RerunFromPromptRunID_ValidationErrorCount, @CommonValidationError = @MJAIPromptRuns_RerunFromPromptRunID_CommonValidationError, @FirstAttemptAt = @MJAIPromptRuns_RerunFromPromptRunID_FirstAttemptAt, @LastAttemptAt = @MJAIPromptRuns_RerunFromPromptRunID_LastAttemptAt, @TotalRetryDurationMS = @MJAIPromptRuns_RerunFromPromptRunID_TotalRetryDurationMS, @ValidationAttempts = @MJAIPromptRuns_RerunFromPromptRunID_ValidationAttempts, @ValidationSummary = @MJAIPromptRuns_RerunFromPromptRunID_ValidationSummary, @FailoverAttempts = @MJAIPromptRuns_RerunFromPromptRunID_FailoverAttempts, @FailoverErrors = @MJAIPromptRuns_RerunFromPromptRunID_FailoverErrors, @FailoverDurations = @MJAIPromptRuns_RerunFromPromptRunID_FailoverDurations, @OriginalModelID = @MJAIPromptRuns_RerunFromPromptRunID_OriginalModelID, @OriginalRequestStartTime = @MJAIPromptRuns_RerunFromPromptRunID_OriginalRequestStartTime, @TotalFailoverDuration = @MJAIPromptRuns_RerunFromPromptRunID_TotalFailoverDuration, @RerunFromPromptRunID_Clear = 1, @RerunFromPromptRunID = @MJAIPromptRuns_RerunFromPromptRunID_RerunFromPromptRunID, @ModelSelection = @MJAIPromptRuns_RerunFromPromptRunID_ModelSelection, @Status = @MJAIPromptRuns_RerunFromPromptRunID_Status, @Cancelled = @MJAIPromptRuns_RerunFromPromptRunID_Cancelled, @CancellationReason = @MJAIPromptRuns_RerunFromPromptRunID_CancellationReason, @ModelPowerRank = @MJAIPromptRuns_RerunFromPromptRunID_ModelPowerRank, @SelectionStrategy = @MJAIPromptRuns_RerunFromPromptRunID_SelectionStrategy, @CacheHit = @MJAIPromptRuns_RerunFromPromptRunID_CacheHit, @CacheKey = @MJAIPromptRuns_RerunFromPromptRunID_CacheKey, @JudgeID = @MJAIPromptRuns_RerunFromPromptRunID_JudgeID, @JudgeScore = @MJAIPromptRuns_RerunFromPromptRunID_JudgeScore, @WasSelectedResult = @MJAIPromptRuns_RerunFromPromptRunID_WasSelectedResult, @StreamingEnabled = @MJAIPromptRuns_RerunFromPromptRunID_StreamingEnabled, @FirstTokenTime = @MJAIPromptRuns_RerunFromPromptRunID_FirstTokenTime, @ErrorDetails = @MJAIPromptRuns_RerunFromPromptRunID_ErrorDetails, @ChildPromptID = @MJAIPromptRuns_RerunFromPromptRunID_ChildPromptID, @QueueTime = @MJAIPromptRuns_RerunFromPromptRunID_QueueTime, @PromptTime = @MJAIPromptRuns_RerunFromPromptRunID_PromptTime, @CompletionTime = @MJAIPromptRuns_RerunFromPromptRunID_CompletionTime, @ModelSpecificResponseDetails = @MJAIPromptRuns_RerunFromPromptRunID_ModelSpecificResponseDetails, @EffortLevel = @MJAIPromptRuns_RerunFromPromptRunID_EffortLevel, @RunName = @MJAIPromptRuns_RerunFromPromptRunID_RunName, @Comments = @MJAIPromptRuns_RerunFromPromptRunID_Comments, @TestRunID = @MJAIPromptRuns_RerunFromPromptRunID_TestRunID, @AssistantPrefill = @MJAIPromptRuns_RerunFromPromptRunID_AssistantPrefill, @TokensCacheRead = @MJAIPromptRuns_RerunFromPromptRunID_TokensCacheRead, @TokensCacheWrite = @MJAIPromptRuns_RerunFromPromptRunID_TokensCacheWrite, @TokensCacheReadRollup = @MJAIPromptRuns_RerunFromPromptRunID_TokensCacheReadRollup, @TokensCacheWriteRollup = @MJAIPromptRuns_RerunFromPromptRunID_TokensCacheWriteRollup, @InputUnitsUsed = @MJAIPromptRuns_RerunFromPromptRunID_InputUnitsUsed, @OutputUnitsUsed = @MJAIPromptRuns_RerunFromPromptRunID_OutputUnitsUsed, @UsageTypeID = @MJAIPromptRuns_RerunFromPromptRunID_UsageTypeID, @ToolCallingMode = @MJAIPromptRuns_RerunFromPromptRunID_ToolCallingMode, @UserID = @MJAIPromptRuns_RerunFromPromptRunID_UserID

        FETCH NEXT FROM cascade_update_MJAIPromptRuns_RerunFromPromptRunID_cursor INTO @MJAIPromptRuns_RerunFromPromptRunIDID, @MJAIPromptRuns_RerunFromPromptRunID_PromptID, @MJAIPromptRuns_RerunFromPromptRunID_ModelID, @MJAIPromptRuns_RerunFromPromptRunID_VendorID, @MJAIPromptRuns_RerunFromPromptRunID_AgentID, @MJAIPromptRuns_RerunFromPromptRunID_ConfigurationID, @MJAIPromptRuns_RerunFromPromptRunID_RunAt, @MJAIPromptRuns_RerunFromPromptRunID_CompletedAt, @MJAIPromptRuns_RerunFromPromptRunID_ExecutionTimeMS, @MJAIPromptRuns_RerunFromPromptRunID_Messages, @MJAIPromptRuns_RerunFromPromptRunID_Result, @MJAIPromptRuns_RerunFromPromptRunID_TokensUsed, @MJAIPromptRuns_RerunFromPromptRunID_TokensPrompt, @MJAIPromptRuns_RerunFromPromptRunID_TokensCompletion, @MJAIPromptRuns_RerunFromPromptRunID_TotalCost, @MJAIPromptRuns_RerunFromPromptRunID_Success, @MJAIPromptRuns_RerunFromPromptRunID_ErrorMessage, @MJAIPromptRuns_RerunFromPromptRunID_ParentID, @MJAIPromptRuns_RerunFromPromptRunID_RunType, @MJAIPromptRuns_RerunFromPromptRunID_ExecutionOrder, @MJAIPromptRuns_RerunFromPromptRunID_Cost, @MJAIPromptRuns_RerunFromPromptRunID_CostCurrency, @MJAIPromptRuns_RerunFromPromptRunID_TokensUsedRollup, @MJAIPromptRuns_RerunFromPromptRunID_TokensPromptRollup, @MJAIPromptRuns_RerunFromPromptRunID_TokensCompletionRollup, @MJAIPromptRuns_RerunFromPromptRunID_Temperature, @MJAIPromptRuns_RerunFromPromptRunID_TopP, @MJAIPromptRuns_RerunFromPromptRunID_TopK, @MJAIPromptRuns_RerunFromPromptRunID_MinP, @MJAIPromptRuns_RerunFromPromptRunID_FrequencyPenalty, @MJAIPromptRuns_RerunFromPromptRunID_PresencePenalty, @MJAIPromptRuns_RerunFromPromptRunID_Seed, @MJAIPromptRuns_RerunFromPromptRunID_StopSequences, @MJAIPromptRuns_RerunFromPromptRunID_ResponseFormat, @MJAIPromptRuns_RerunFromPromptRunID_LogProbs, @MJAIPromptRuns_RerunFromPromptRunID_TopLogProbs, @MJAIPromptRuns_RerunFromPromptRunID_DescendantCost, @MJAIPromptRuns_RerunFromPromptRunID_ValidationAttemptCount, @MJAIPromptRuns_RerunFromPromptRunID_SuccessfulValidationCount, @MJAIPromptRuns_RerunFromPromptRunID_FinalValidationPassed, @MJAIPromptRuns_RerunFromPromptRunID_ValidationBehavior, @MJAIPromptRuns_RerunFromPromptRunID_RetryStrategy, @MJAIPromptRuns_RerunFromPromptRunID_MaxRetriesConfigured, @MJAIPromptRuns_RerunFromPromptRunID_FinalValidationError, @MJAIPromptRuns_RerunFromPromptRunID_ValidationErrorCount, @MJAIPromptRuns_RerunFromPromptRunID_CommonValidationError, @MJAIPromptRuns_RerunFromPromptRunID_FirstAttemptAt, @MJAIPromptRuns_RerunFromPromptRunID_LastAttemptAt, @MJAIPromptRuns_RerunFromPromptRunID_TotalRetryDurationMS, @MJAIPromptRuns_RerunFromPromptRunID_ValidationAttempts, @MJAIPromptRuns_RerunFromPromptRunID_ValidationSummary, @MJAIPromptRuns_RerunFromPromptRunID_FailoverAttempts, @MJAIPromptRuns_RerunFromPromptRunID_FailoverErrors, @MJAIPromptRuns_RerunFromPromptRunID_FailoverDurations, @MJAIPromptRuns_RerunFromPromptRunID_OriginalModelID, @MJAIPromptRuns_RerunFromPromptRunID_OriginalRequestStartTime, @MJAIPromptRuns_RerunFromPromptRunID_TotalFailoverDuration, @MJAIPromptRuns_RerunFromPromptRunID_RerunFromPromptRunID, @MJAIPromptRuns_RerunFromPromptRunID_ModelSelection, @MJAIPromptRuns_RerunFromPromptRunID_Status, @MJAIPromptRuns_RerunFromPromptRunID_Cancelled, @MJAIPromptRuns_RerunFromPromptRunID_CancellationReason, @MJAIPromptRuns_RerunFromPromptRunID_ModelPowerRank, @MJAIPromptRuns_RerunFromPromptRunID_SelectionStrategy, @MJAIPromptRuns_RerunFromPromptRunID_CacheHit, @MJAIPromptRuns_RerunFromPromptRunID_CacheKey, @MJAIPromptRuns_RerunFromPromptRunID_JudgeID, @MJAIPromptRuns_RerunFromPromptRunID_JudgeScore, @MJAIPromptRuns_RerunFromPromptRunID_WasSelectedResult, @MJAIPromptRuns_RerunFromPromptRunID_StreamingEnabled, @MJAIPromptRuns_RerunFromPromptRunID_FirstTokenTime, @MJAIPromptRuns_RerunFromPromptRunID_ErrorDetails, @MJAIPromptRuns_RerunFromPromptRunID_ChildPromptID, @MJAIPromptRuns_RerunFromPromptRunID_QueueTime, @MJAIPromptRuns_RerunFromPromptRunID_PromptTime, @MJAIPromptRuns_RerunFromPromptRunID_CompletionTime, @MJAIPromptRuns_RerunFromPromptRunID_ModelSpecificResponseDetails, @MJAIPromptRuns_RerunFromPromptRunID_EffortLevel, @MJAIPromptRuns_RerunFromPromptRunID_RunName, @MJAIPromptRuns_RerunFromPromptRunID_Comments, @MJAIPromptRuns_RerunFromPromptRunID_TestRunID, @MJAIPromptRuns_RerunFromPromptRunID_AssistantPrefill, @MJAIPromptRuns_RerunFromPromptRunID_TokensCacheRead, @MJAIPromptRuns_RerunFromPromptRunID_TokensCacheWrite, @MJAIPromptRuns_RerunFromPromptRunID_TokensCacheReadRollup, @MJAIPromptRuns_RerunFromPromptRunID_TokensCacheWriteRollup, @MJAIPromptRuns_RerunFromPromptRunID_InputUnitsUsed, @MJAIPromptRuns_RerunFromPromptRunID_OutputUnitsUsed, @MJAIPromptRuns_RerunFromPromptRunID_UsageTypeID, @MJAIPromptRuns_RerunFromPromptRunID_ToolCallingMode, @MJAIPromptRuns_RerunFromPromptRunID_UserID
    END

    CLOSE cascade_update_MJAIPromptRuns_RerunFromPromptRunID_cursor
    DEALLOCATE cascade_update_MJAIPromptRuns_RerunFromPromptRunID_cursor
    
    -- Cascade update on AIResultCache using cursor to call spUpdateAIResultCache
    DECLARE @MJAIResultCache_PromptRunIDID uniqueidentifier
    DECLARE @MJAIResultCache_PromptRunID_AIPromptID uniqueidentifier
    DECLARE @MJAIResultCache_PromptRunID_AIModelID uniqueidentifier
    DECLARE @MJAIResultCache_PromptRunID_RunAt datetimeoffset
    DECLARE @MJAIResultCache_PromptRunID_PromptText nvarchar(MAX)
    DECLARE @MJAIResultCache_PromptRunID_ResultText nvarchar(MAX)
    DECLARE @MJAIResultCache_PromptRunID_Status nvarchar(50)
    DECLARE @MJAIResultCache_PromptRunID_ExpiredOn datetimeoffset
    DECLARE @MJAIResultCache_PromptRunID_VendorID uniqueidentifier
    DECLARE @MJAIResultCache_PromptRunID_AgentID uniqueidentifier
    DECLARE @MJAIResultCache_PromptRunID_ConfigurationID uniqueidentifier
    DECLARE @MJAIResultCache_PromptRunID_PromptEmbedding varbinary(MAX)
    DECLARE @MJAIResultCache_PromptRunID_PromptRunID uniqueidentifier
    DECLARE cascade_update_MJAIResultCache_PromptRunID_cursor CURSOR FOR
        SELECT [ID], [AIPromptID], [AIModelID], [RunAt], [PromptText], [ResultText], [Status], [ExpiredOn], [VendorID], [AgentID], [ConfigurationID], [PromptEmbedding], [PromptRunID]
        FROM [${flyway:defaultSchema}].[AIResultCache]
        WHERE [PromptRunID] = @ID

    OPEN cascade_update_MJAIResultCache_PromptRunID_cursor
    FETCH NEXT FROM cascade_update_MJAIResultCache_PromptRunID_cursor INTO @MJAIResultCache_PromptRunIDID, @MJAIResultCache_PromptRunID_AIPromptID, @MJAIResultCache_PromptRunID_AIModelID, @MJAIResultCache_PromptRunID_RunAt, @MJAIResultCache_PromptRunID_PromptText, @MJAIResultCache_PromptRunID_ResultText, @MJAIResultCache_PromptRunID_Status, @MJAIResultCache_PromptRunID_ExpiredOn, @MJAIResultCache_PromptRunID_VendorID, @MJAIResultCache_PromptRunID_AgentID, @MJAIResultCache_PromptRunID_ConfigurationID, @MJAIResultCache_PromptRunID_PromptEmbedding, @MJAIResultCache_PromptRunID_PromptRunID

    WHILE @@FETCH_STATUS = 0
    BEGIN
        -- Set the FK field to NULL
        SET @MJAIResultCache_PromptRunID_PromptRunID = NULL

        -- Call the update SP for the related entity
        EXEC [${flyway:defaultSchema}].[spUpdateAIResultCache] @ID = @MJAIResultCache_PromptRunIDID, @AIPromptID = @MJAIResultCache_PromptRunID_AIPromptID, @AIModelID = @MJAIResultCache_PromptRunID_AIModelID, @RunAt = @MJAIResultCache_PromptRunID_RunAt, @PromptText = @MJAIResultCache_PromptRunID_PromptText, @ResultText = @MJAIResultCache_PromptRunID_ResultText, @Status = @MJAIResultCache_PromptRunID_Status, @ExpiredOn = @MJAIResultCache_PromptRunID_ExpiredOn, @VendorID = @MJAIResultCache_PromptRunID_VendorID, @AgentID = @MJAIResultCache_PromptRunID_AgentID, @ConfigurationID = @MJAIResultCache_PromptRunID_ConfigurationID, @PromptEmbedding = @MJAIResultCache_PromptRunID_PromptEmbedding, @PromptRunID_Clear = 1, @PromptRunID = @MJAIResultCache_PromptRunID_PromptRunID

        FETCH NEXT FROM cascade_update_MJAIResultCache_PromptRunID_cursor INTO @MJAIResultCache_PromptRunIDID, @MJAIResultCache_PromptRunID_AIPromptID, @MJAIResultCache_PromptRunID_AIModelID, @MJAIResultCache_PromptRunID_RunAt, @MJAIResultCache_PromptRunID_PromptText, @MJAIResultCache_PromptRunID_ResultText, @MJAIResultCache_PromptRunID_Status, @MJAIResultCache_PromptRunID_ExpiredOn, @MJAIResultCache_PromptRunID_VendorID, @MJAIResultCache_PromptRunID_AgentID, @MJAIResultCache_PromptRunID_ConfigurationID, @MJAIResultCache_PromptRunID_PromptEmbedding, @MJAIResultCache_PromptRunID_PromptRunID
    END

    CLOSE cascade_update_MJAIResultCache_PromptRunID_cursor
    DEALLOCATE cascade_update_MJAIResultCache_PromptRunID_cursor
    
    -- Cascade update on ContentItemTag using cursor to call spUpdateContentItemTag
    DECLARE @MJContentItemTags_AIPromptRunIDID uniqueidentifier
    DECLARE @MJContentItemTags_AIPromptRunID_ItemID uniqueidentifier
    DECLARE @MJContentItemTags_AIPromptRunID_Tag nvarchar(200)
    DECLARE @MJContentItemTags_AIPromptRunID_Weight numeric(5, 4)
    DECLARE @MJContentItemTags_AIPromptRunID_TagID uniqueidentifier
    DECLARE @MJContentItemTags_AIPromptRunID_AIPromptRunID uniqueidentifier
    DECLARE @MJContentItemTags_AIPromptRunID_Reasoning nvarchar(MAX)
    DECLARE cascade_update_MJContentItemTags_AIPromptRunID_cursor CURSOR FOR
        SELECT [ID], [ItemID], [Tag], [Weight], [TagID], [AIPromptRunID], [Reasoning]
        FROM [${flyway:defaultSchema}].[ContentItemTag]
        WHERE [AIPromptRunID] = @ID

    OPEN cascade_update_MJContentItemTags_AIPromptRunID_cursor
    FETCH NEXT FROM cascade_update_MJContentItemTags_AIPromptRunID_cursor INTO @MJContentItemTags_AIPromptRunIDID, @MJContentItemTags_AIPromptRunID_ItemID, @MJContentItemTags_AIPromptRunID_Tag, @MJContentItemTags_AIPromptRunID_Weight, @MJContentItemTags_AIPromptRunID_TagID, @MJContentItemTags_AIPromptRunID_AIPromptRunID, @MJContentItemTags_AIPromptRunID_Reasoning

    WHILE @@FETCH_STATUS = 0
    BEGIN
        -- Set the FK field to NULL
        SET @MJContentItemTags_AIPromptRunID_AIPromptRunID = NULL

        -- Call the update SP for the related entity
        EXEC [${flyway:defaultSchema}].[spUpdateContentItemTag] @ID = @MJContentItemTags_AIPromptRunIDID, @ItemID = @MJContentItemTags_AIPromptRunID_ItemID, @Tag = @MJContentItemTags_AIPromptRunID_Tag, @Weight = @MJContentItemTags_AIPromptRunID_Weight, @TagID = @MJContentItemTags_AIPromptRunID_TagID, @AIPromptRunID_Clear = 1, @AIPromptRunID = @MJContentItemTags_AIPromptRunID_AIPromptRunID, @Reasoning = @MJContentItemTags_AIPromptRunID_Reasoning

        FETCH NEXT FROM cascade_update_MJContentItemTags_AIPromptRunID_cursor INTO @MJContentItemTags_AIPromptRunIDID, @MJContentItemTags_AIPromptRunID_ItemID, @MJContentItemTags_AIPromptRunID_Tag, @MJContentItemTags_AIPromptRunID_Weight, @MJContentItemTags_AIPromptRunID_TagID, @MJContentItemTags_AIPromptRunID_AIPromptRunID, @MJContentItemTags_AIPromptRunID_Reasoning
    END

    CLOSE cascade_update_MJContentItemTags_AIPromptRunID_cursor
    DEALLOCATE cascade_update_MJContentItemTags_AIPromptRunID_cursor
    
    -- Cascade delete from ContentProcessRunPromptRun using cursor to call spDeleteContentProcessRunPromptRun
    DECLARE @MJContentProcessRunPromptRuns_AIPromptRunIDID uniqueidentifier
    DECLARE cascade_delete_MJContentProcessRunPromptRuns_AIPromptRunID_cursor CURSOR FOR 
        SELECT [ID]
        FROM [${flyway:defaultSchema}].[ContentProcessRunPromptRun]
        WHERE [AIPromptRunID] = @ID
    
    OPEN cascade_delete_MJContentProcessRunPromptRuns_AIPromptRunID_cursor
    FETCH NEXT FROM cascade_delete_MJContentProcessRunPromptRuns_AIPromptRunID_cursor INTO @MJContentProcessRunPromptRuns_AIPromptRunIDID
    
    WHILE @@FETCH_STATUS = 0
    BEGIN
        EXEC [${flyway:defaultSchema}].[spDeleteContentProcessRunPromptRun] @ID = @MJContentProcessRunPromptRuns_AIPromptRunIDID
        
        FETCH NEXT FROM cascade_delete_MJContentProcessRunPromptRuns_AIPromptRunID_cursor INTO @MJContentProcessRunPromptRuns_AIPromptRunIDID
    END
    
    CLOSE cascade_delete_MJContentProcessRunPromptRuns_AIPromptRunID_cursor
    DEALLOCATE cascade_delete_MJContentProcessRunPromptRuns_AIPromptRunID_cursor
    
    -- Cascade delete from ConversationCompactionRun using cursor to call spDeleteConversationCompactionRun
    DECLARE @MJConversationCompactionRuns_PromptRunIDID uniqueidentifier
    DECLARE cascade_delete_MJConversationCompactionRuns_PromptRunID_cursor CURSOR FOR 
        SELECT [ID]
        FROM [${flyway:defaultSchema}].[ConversationCompactionRun]
        WHERE [PromptRunID] = @ID
    
    OPEN cascade_delete_MJConversationCompactionRuns_PromptRunID_cursor
    FETCH NEXT FROM cascade_delete_MJConversationCompactionRuns_PromptRunID_cursor INTO @MJConversationCompactionRuns_PromptRunIDID
    
    WHILE @@FETCH_STATUS = 0
    BEGIN
        EXEC [${flyway:defaultSchema}].[spDeleteConversationCompactionRun] @ID = @MJConversationCompactionRuns_PromptRunIDID
        
        FETCH NEXT FROM cascade_delete_MJConversationCompactionRuns_PromptRunID_cursor INTO @MJConversationCompactionRuns_PromptRunIDID
    END
    
    CLOSE cascade_delete_MJConversationCompactionRuns_PromptRunID_cursor
    DEALLOCATE cascade_delete_MJConversationCompactionRuns_PromptRunID_cursor
    
    -- Cascade update on DuplicateRunDetailMatch using cursor to call spUpdateDuplicateRunDetailMatch
    DECLARE @MJDuplicateRunDetailMatches_AIPromptRunIDID uniqueidentifier
    DECLARE @MJDuplicateRunDetailMatches_AIPromptRunID_DuplicateRunDetailID uniqueidentifier
    DECLARE @MJDuplicateRunDetailMatches_AIPromptRunID_MatchSource nvarchar(20)
    DECLARE @MJDuplicateRunDetailMatches_AIPromptRunID_MatchRecordID nvarchar(500)
    DECLARE @MJDuplicateRunDetailMatches_AIPromptRunID_MatchProbability numeric(12, 11)
    DECLARE @MJDuplicateRunDetailMatches_AIPromptRunID_MatchedAt datetimeoffset
    DECLARE @MJDuplicateRunDetailMatches_AIPromptRunID_Action nvarchar(20)
    DECLARE @MJDuplicateRunDetailMatches_AIPromptRunID_ApprovalStatus nvarchar(20)
    DECLARE @MJDuplicateRunDetailMatches_AIPromptRunID_RecordMergeLogID uniqueidentifier
    DECLARE @MJDuplicateRunDetailMatches_AIPromptRunID_MergeStatus nvarchar(20)
    DECLARE @MJDuplicateRunDetailMatches_AIPromptRunID_MergedAt datetimeoffset
    DECLARE @MJDuplicateRunDetailMatches_AIPromptRunID_RecordMetadata nvarchar(MAX)
    DECLARE @MJDuplicateRunDetailMatches_AIPromptRunID_AIAgentRunID uniqueidentifier
    DECLARE @MJDuplicateRunDetailMatches_AIPromptRunID_AIPromptRunID uniqueidentifier
    DECLARE @MJDuplicateRunDetailMatches_AIPromptRunID_LLMRecommendation nvarchar(20)
    DECLARE @MJDuplicateRunDetailMatches_AIPromptRunID_LLMConfidence numeric(12, 11)
    DECLARE @MJDuplicateRunDetailMatches_AIPromptRunID_LLMReasoning nvarchar(MAX)
    DECLARE @MJDuplicateRunDetailMatches_AIPromptRunID_LLMProposedSurvivorRecordID nvarchar(500)
    DECLARE @MJDuplicateRunDetailMatches_AIPromptRunID_LLMProposedFieldMap nvarchar(MAX)
    DECLARE cascade_update_MJDuplicateRunDetailMatches_AIPromptRunID_cursor CURSOR FOR
        SELECT [ID], [DuplicateRunDetailID], [MatchSource], [MatchRecordID], [MatchProbability], [MatchedAt], [Action], [ApprovalStatus], [RecordMergeLogID], [MergeStatus], [MergedAt], [RecordMetadata], [AIAgentRunID], [AIPromptRunID], [LLMRecommendation], [LLMConfidence], [LLMReasoning], [LLMProposedSurvivorRecordID], [LLMProposedFieldMap]
        FROM [${flyway:defaultSchema}].[DuplicateRunDetailMatch]
        WHERE [AIPromptRunID] = @ID

    OPEN cascade_update_MJDuplicateRunDetailMatches_AIPromptRunID_cursor
    FETCH NEXT FROM cascade_update_MJDuplicateRunDetailMatches_AIPromptRunID_cursor INTO @MJDuplicateRunDetailMatches_AIPromptRunIDID, @MJDuplicateRunDetailMatches_AIPromptRunID_DuplicateRunDetailID, @MJDuplicateRunDetailMatches_AIPromptRunID_MatchSource, @MJDuplicateRunDetailMatches_AIPromptRunID_MatchRecordID, @MJDuplicateRunDetailMatches_AIPromptRunID_MatchProbability, @MJDuplicateRunDetailMatches_AIPromptRunID_MatchedAt, @MJDuplicateRunDetailMatches_AIPromptRunID_Action, @MJDuplicateRunDetailMatches_AIPromptRunID_ApprovalStatus, @MJDuplicateRunDetailMatches_AIPromptRunID_RecordMergeLogID, @MJDuplicateRunDetailMatches_AIPromptRunID_MergeStatus, @MJDuplicateRunDetailMatches_AIPromptRunID_MergedAt, @MJDuplicateRunDetailMatches_AIPromptRunID_RecordMetadata, @MJDuplicateRunDetailMatches_AIPromptRunID_AIAgentRunID, @MJDuplicateRunDetailMatches_AIPromptRunID_AIPromptRunID, @MJDuplicateRunDetailMatches_AIPromptRunID_LLMRecommendation, @MJDuplicateRunDetailMatches_AIPromptRunID_LLMConfidence, @MJDuplicateRunDetailMatches_AIPromptRunID_LLMReasoning, @MJDuplicateRunDetailMatches_AIPromptRunID_LLMProposedSurvivorRecordID, @MJDuplicateRunDetailMatches_AIPromptRunID_LLMProposedFieldMap

    WHILE @@FETCH_STATUS = 0
    BEGIN
        -- Set the FK field to NULL
        SET @MJDuplicateRunDetailMatches_AIPromptRunID_AIPromptRunID = NULL

        -- Call the update SP for the related entity
        EXEC [${flyway:defaultSchema}].[spUpdateDuplicateRunDetailMatch] @ID = @MJDuplicateRunDetailMatches_AIPromptRunIDID, @DuplicateRunDetailID = @MJDuplicateRunDetailMatches_AIPromptRunID_DuplicateRunDetailID, @MatchSource = @MJDuplicateRunDetailMatches_AIPromptRunID_MatchSource, @MatchRecordID = @MJDuplicateRunDetailMatches_AIPromptRunID_MatchRecordID, @MatchProbability = @MJDuplicateRunDetailMatches_AIPromptRunID_MatchProbability, @MatchedAt = @MJDuplicateRunDetailMatches_AIPromptRunID_MatchedAt, @Action = @MJDuplicateRunDetailMatches_AIPromptRunID_Action, @ApprovalStatus = @MJDuplicateRunDetailMatches_AIPromptRunID_ApprovalStatus, @RecordMergeLogID = @MJDuplicateRunDetailMatches_AIPromptRunID_RecordMergeLogID, @MergeStatus = @MJDuplicateRunDetailMatches_AIPromptRunID_MergeStatus, @MergedAt = @MJDuplicateRunDetailMatches_AIPromptRunID_MergedAt, @RecordMetadata = @MJDuplicateRunDetailMatches_AIPromptRunID_RecordMetadata, @AIAgentRunID = @MJDuplicateRunDetailMatches_AIPromptRunID_AIAgentRunID, @AIPromptRunID_Clear = 1, @AIPromptRunID = @MJDuplicateRunDetailMatches_AIPromptRunID_AIPromptRunID, @LLMRecommendation = @MJDuplicateRunDetailMatches_AIPromptRunID_LLMRecommendation, @LLMConfidence = @MJDuplicateRunDetailMatches_AIPromptRunID_LLMConfidence, @LLMReasoning = @MJDuplicateRunDetailMatches_AIPromptRunID_LLMReasoning, @LLMProposedSurvivorRecordID = @MJDuplicateRunDetailMatches_AIPromptRunID_LLMProposedSurvivorRecordID, @LLMProposedFieldMap = @MJDuplicateRunDetailMatches_AIPromptRunID_LLMProposedFieldMap

        FETCH NEXT FROM cascade_update_MJDuplicateRunDetailMatches_AIPromptRunID_cursor INTO @MJDuplicateRunDetailMatches_AIPromptRunIDID, @MJDuplicateRunDetailMatches_AIPromptRunID_DuplicateRunDetailID, @MJDuplicateRunDetailMatches_AIPromptRunID_MatchSource, @MJDuplicateRunDetailMatches_AIPromptRunID_MatchRecordID, @MJDuplicateRunDetailMatches_AIPromptRunID_MatchProbability, @MJDuplicateRunDetailMatches_AIPromptRunID_MatchedAt, @MJDuplicateRunDetailMatches_AIPromptRunID_Action, @MJDuplicateRunDetailMatches_AIPromptRunID_ApprovalStatus, @MJDuplicateRunDetailMatches_AIPromptRunID_RecordMergeLogID, @MJDuplicateRunDetailMatches_AIPromptRunID_MergeStatus, @MJDuplicateRunDetailMatches_AIPromptRunID_MergedAt, @MJDuplicateRunDetailMatches_AIPromptRunID_RecordMetadata, @MJDuplicateRunDetailMatches_AIPromptRunID_AIAgentRunID, @MJDuplicateRunDetailMatches_AIPromptRunID_AIPromptRunID, @MJDuplicateRunDetailMatches_AIPromptRunID_LLMRecommendation, @MJDuplicateRunDetailMatches_AIPromptRunID_LLMConfidence, @MJDuplicateRunDetailMatches_AIPromptRunID_LLMReasoning, @MJDuplicateRunDetailMatches_AIPromptRunID_LLMProposedSurvivorRecordID, @MJDuplicateRunDetailMatches_AIPromptRunID_LLMProposedFieldMap
    END

    CLOSE cascade_update_MJDuplicateRunDetailMatches_AIPromptRunID_cursor
    DEALLOCATE cascade_update_MJDuplicateRunDetailMatches_AIPromptRunID_cursor
    
    -- Cascade update on RubricEvaluation using cursor to call spUpdateRubricEvaluation
    DECLARE @MJRubricEvaluations_AIPromptRunIDID uniqueidentifier
    DECLARE @MJRubricEvaluations_AIPromptRunID_RubricVersionID uniqueidentifier
    DECLARE @MJRubricEvaluations_AIPromptRunID_SubjectEntityID uniqueidentifier
    DECLARE @MJRubricEvaluations_AIPromptRunID_SubjectRecordID nvarchar(450)
    DECLARE @MJRubricEvaluations_AIPromptRunID_ContextEntityID uniqueidentifier
    DECLARE @MJRubricEvaluations_AIPromptRunID_ContextRecordID nvarchar(450)
    DECLARE @MJRubricEvaluations_AIPromptRunID_EvaluatorType nvarchar(20)
    DECLARE @MJRubricEvaluations_AIPromptRunID_EvaluatorUserID uniqueidentifier
    DECLARE @MJRubricEvaluations_AIPromptRunID_AIPromptRunID uniqueidentifier
    DECLARE @MJRubricEvaluations_AIPromptRunID_AIAgentRunID uniqueidentifier
    DECLARE @MJRubricEvaluations_AIPromptRunID_EvaluatorName nvarchar(255)
    DECLARE @MJRubricEvaluations_AIPromptRunID_Status nvarchar(20)
    DECLARE @MJRubricEvaluations_AIPromptRunID_SupersedesEvaluationID uniqueidentifier
    DECLARE @MJRubricEvaluations_AIPromptRunID_SubmittedAt datetimeoffset
    DECLARE @MJRubricEvaluations_AIPromptRunID_PassThresholdApplied decimal(9, 6)
    DECLARE @MJRubricEvaluations_AIPromptRunID_NormalizedScore decimal(9, 6)
    DECLARE @MJRubricEvaluations_AIPromptRunID_Passed bit
    DECLARE @MJRubricEvaluations_AIPromptRunID_Outcome nvarchar(30)
    DECLARE @MJRubricEvaluations_AIPromptRunID_BandID uniqueidentifier
    DECLARE @MJRubricEvaluations_AIPromptRunID_GateFailed bit
    DECLARE @MJRubricEvaluations_AIPromptRunID_Completeness decimal(9, 6)
    DECLARE @MJRubricEvaluations_AIPromptRunID_ScoredCriteriaCount int
    DECLARE @MJRubricEvaluations_AIPromptRunID_ApplicableCriteriaCount int
    DECLARE @MJRubricEvaluations_AIPromptRunID_TotalCriteriaCount int
    DECLARE @MJRubricEvaluations_AIPromptRunID_Confidence decimal(9, 6)
    DECLARE @MJRubricEvaluations_AIPromptRunID_Narrative nvarchar(MAX)
    DECLARE @MJRubricEvaluations_AIPromptRunID_ErrorMessage nvarchar(MAX)
    DECLARE @MJRubricEvaluations_AIPromptRunID_ScoringEngineVersion nvarchar(20)
    DECLARE @MJRubricEvaluations_AIPromptRunID_Metadata nvarchar(MAX)
    DECLARE cascade_update_MJRubricEvaluations_AIPromptRunID_cursor CURSOR FOR
        SELECT [ID], [RubricVersionID], [SubjectEntityID], [SubjectRecordID], [ContextEntityID], [ContextRecordID], [EvaluatorType], [EvaluatorUserID], [AIPromptRunID], [AIAgentRunID], [EvaluatorName], [Status], [SupersedesEvaluationID], [SubmittedAt], [PassThresholdApplied], [NormalizedScore], [Passed], [Outcome], [BandID], [GateFailed], [Completeness], [ScoredCriteriaCount], [ApplicableCriteriaCount], [TotalCriteriaCount], [Confidence], [Narrative], [ErrorMessage], [ScoringEngineVersion], [Metadata]
        FROM [${flyway:defaultSchema}].[RubricEvaluation]
        WHERE [AIPromptRunID] = @ID

    OPEN cascade_update_MJRubricEvaluations_AIPromptRunID_cursor
    FETCH NEXT FROM cascade_update_MJRubricEvaluations_AIPromptRunID_cursor INTO @MJRubricEvaluations_AIPromptRunIDID, @MJRubricEvaluations_AIPromptRunID_RubricVersionID, @MJRubricEvaluations_AIPromptRunID_SubjectEntityID, @MJRubricEvaluations_AIPromptRunID_SubjectRecordID, @MJRubricEvaluations_AIPromptRunID_ContextEntityID, @MJRubricEvaluations_AIPromptRunID_ContextRecordID, @MJRubricEvaluations_AIPromptRunID_EvaluatorType, @MJRubricEvaluations_AIPromptRunID_EvaluatorUserID, @MJRubricEvaluations_AIPromptRunID_AIPromptRunID, @MJRubricEvaluations_AIPromptRunID_AIAgentRunID, @MJRubricEvaluations_AIPromptRunID_EvaluatorName, @MJRubricEvaluations_AIPromptRunID_Status, @MJRubricEvaluations_AIPromptRunID_SupersedesEvaluationID, @MJRubricEvaluations_AIPromptRunID_SubmittedAt, @MJRubricEvaluations_AIPromptRunID_PassThresholdApplied, @MJRubricEvaluations_AIPromptRunID_NormalizedScore, @MJRubricEvaluations_AIPromptRunID_Passed, @MJRubricEvaluations_AIPromptRunID_Outcome, @MJRubricEvaluations_AIPromptRunID_BandID, @MJRubricEvaluations_AIPromptRunID_GateFailed, @MJRubricEvaluations_AIPromptRunID_Completeness, @MJRubricEvaluations_AIPromptRunID_ScoredCriteriaCount, @MJRubricEvaluations_AIPromptRunID_ApplicableCriteriaCount, @MJRubricEvaluations_AIPromptRunID_TotalCriteriaCount, @MJRubricEvaluations_AIPromptRunID_Confidence, @MJRubricEvaluations_AIPromptRunID_Narrative, @MJRubricEvaluations_AIPromptRunID_ErrorMessage, @MJRubricEvaluations_AIPromptRunID_ScoringEngineVersion, @MJRubricEvaluations_AIPromptRunID_Metadata

    WHILE @@FETCH_STATUS = 0
    BEGIN
        -- Set the FK field to NULL
        SET @MJRubricEvaluations_AIPromptRunID_AIPromptRunID = NULL

        -- Call the update SP for the related entity
        EXEC [${flyway:defaultSchema}].[spUpdateRubricEvaluation] @ID = @MJRubricEvaluations_AIPromptRunIDID, @RubricVersionID = @MJRubricEvaluations_AIPromptRunID_RubricVersionID, @SubjectEntityID = @MJRubricEvaluations_AIPromptRunID_SubjectEntityID, @SubjectRecordID = @MJRubricEvaluations_AIPromptRunID_SubjectRecordID, @ContextEntityID = @MJRubricEvaluations_AIPromptRunID_ContextEntityID, @ContextRecordID = @MJRubricEvaluations_AIPromptRunID_ContextRecordID, @EvaluatorType = @MJRubricEvaluations_AIPromptRunID_EvaluatorType, @EvaluatorUserID = @MJRubricEvaluations_AIPromptRunID_EvaluatorUserID, @AIPromptRunID_Clear = 1, @AIPromptRunID = @MJRubricEvaluations_AIPromptRunID_AIPromptRunID, @AIAgentRunID = @MJRubricEvaluations_AIPromptRunID_AIAgentRunID, @EvaluatorName = @MJRubricEvaluations_AIPromptRunID_EvaluatorName, @Status = @MJRubricEvaluations_AIPromptRunID_Status, @SupersedesEvaluationID = @MJRubricEvaluations_AIPromptRunID_SupersedesEvaluationID, @SubmittedAt = @MJRubricEvaluations_AIPromptRunID_SubmittedAt, @PassThresholdApplied = @MJRubricEvaluations_AIPromptRunID_PassThresholdApplied, @NormalizedScore = @MJRubricEvaluations_AIPromptRunID_NormalizedScore, @Passed = @MJRubricEvaluations_AIPromptRunID_Passed, @Outcome = @MJRubricEvaluations_AIPromptRunID_Outcome, @BandID = @MJRubricEvaluations_AIPromptRunID_BandID, @GateFailed = @MJRubricEvaluations_AIPromptRunID_GateFailed, @Completeness = @MJRubricEvaluations_AIPromptRunID_Completeness, @ScoredCriteriaCount = @MJRubricEvaluations_AIPromptRunID_ScoredCriteriaCount, @ApplicableCriteriaCount = @MJRubricEvaluations_AIPromptRunID_ApplicableCriteriaCount, @TotalCriteriaCount = @MJRubricEvaluations_AIPromptRunID_TotalCriteriaCount, @Confidence = @MJRubricEvaluations_AIPromptRunID_Confidence, @Narrative = @MJRubricEvaluations_AIPromptRunID_Narrative, @ErrorMessage = @MJRubricEvaluations_AIPromptRunID_ErrorMessage, @ScoringEngineVersion = @MJRubricEvaluations_AIPromptRunID_ScoringEngineVersion, @Metadata = @MJRubricEvaluations_AIPromptRunID_Metadata

        FETCH NEXT FROM cascade_update_MJRubricEvaluations_AIPromptRunID_cursor INTO @MJRubricEvaluations_AIPromptRunIDID, @MJRubricEvaluations_AIPromptRunID_RubricVersionID, @MJRubricEvaluations_AIPromptRunID_SubjectEntityID, @MJRubricEvaluations_AIPromptRunID_SubjectRecordID, @MJRubricEvaluations_AIPromptRunID_ContextEntityID, @MJRubricEvaluations_AIPromptRunID_ContextRecordID, @MJRubricEvaluations_AIPromptRunID_EvaluatorType, @MJRubricEvaluations_AIPromptRunID_EvaluatorUserID, @MJRubricEvaluations_AIPromptRunID_AIPromptRunID, @MJRubricEvaluations_AIPromptRunID_AIAgentRunID, @MJRubricEvaluations_AIPromptRunID_EvaluatorName, @MJRubricEvaluations_AIPromptRunID_Status, @MJRubricEvaluations_AIPromptRunID_SupersedesEvaluationID, @MJRubricEvaluations_AIPromptRunID_SubmittedAt, @MJRubricEvaluations_AIPromptRunID_PassThresholdApplied, @MJRubricEvaluations_AIPromptRunID_NormalizedScore, @MJRubricEvaluations_AIPromptRunID_Passed, @MJRubricEvaluations_AIPromptRunID_Outcome, @MJRubricEvaluations_AIPromptRunID_BandID, @MJRubricEvaluations_AIPromptRunID_GateFailed, @MJRubricEvaluations_AIPromptRunID_Completeness, @MJRubricEvaluations_AIPromptRunID_ScoredCriteriaCount, @MJRubricEvaluations_AIPromptRunID_ApplicableCriteriaCount, @MJRubricEvaluations_AIPromptRunID_TotalCriteriaCount, @MJRubricEvaluations_AIPromptRunID_Confidence, @MJRubricEvaluations_AIPromptRunID_Narrative, @MJRubricEvaluations_AIPromptRunID_ErrorMessage, @MJRubricEvaluations_AIPromptRunID_ScoringEngineVersion, @MJRubricEvaluations_AIPromptRunID_Metadata
    END

    CLOSE cascade_update_MJRubricEvaluations_AIPromptRunID_cursor
    DEALLOCATE cascade_update_MJRubricEvaluations_AIPromptRunID_cursor
    
    -- Cascade update on UserRoutineRun using cursor to call spUpdateUserRoutineRun
    DECLARE @MJUserRoutineRuns_PromptRunIDID uniqueidentifier
    DECLARE @MJUserRoutineRuns_PromptRunID_RoutineID uniqueidentifier
    DECLARE @MJUserRoutineRuns_PromptRunID_StartedAt datetimeoffset
    DECLARE @MJUserRoutineRuns_PromptRunID_CompletedAt datetimeoffset
    DECLARE @MJUserRoutineRuns_PromptRunID_Status nvarchar(20)
    DECLARE @MJUserRoutineRuns_PromptRunID_AgentRunID uniqueidentifier
    DECLARE @MJUserRoutineRuns_PromptRunID_PromptRunID uniqueidentifier
    DECLARE @MJUserRoutineRuns_PromptRunID_ActionExecutionLogID uniqueidentifier
    DECLARE @MJUserRoutineRuns_PromptRunID_ResultSummary nvarchar(MAX)
    DECLARE @MJUserRoutineRuns_PromptRunID_ResultHash nvarchar(100)
    DECLARE @MJUserRoutineRuns_PromptRunID_NotificationSent bit
    DECLARE @MJUserRoutineRuns_PromptRunID_ErrorMessage nvarchar(MAX)
    DECLARE cascade_update_MJUserRoutineRuns_PromptRunID_cursor CURSOR FOR
        SELECT [ID], [RoutineID], [StartedAt], [CompletedAt], [Status], [AgentRunID], [PromptRunID], [ActionExecutionLogID], [ResultSummary], [ResultHash], [NotificationSent], [ErrorMessage]
        FROM [${flyway:defaultSchema}].[UserRoutineRun]
        WHERE [PromptRunID] = @ID

    OPEN cascade_update_MJUserRoutineRuns_PromptRunID_cursor
    FETCH NEXT FROM cascade_update_MJUserRoutineRuns_PromptRunID_cursor INTO @MJUserRoutineRuns_PromptRunIDID, @MJUserRoutineRuns_PromptRunID_RoutineID, @MJUserRoutineRuns_PromptRunID_StartedAt, @MJUserRoutineRuns_PromptRunID_CompletedAt, @MJUserRoutineRuns_PromptRunID_Status, @MJUserRoutineRuns_PromptRunID_AgentRunID, @MJUserRoutineRuns_PromptRunID_PromptRunID, @MJUserRoutineRuns_PromptRunID_ActionExecutionLogID, @MJUserRoutineRuns_PromptRunID_ResultSummary, @MJUserRoutineRuns_PromptRunID_ResultHash, @MJUserRoutineRuns_PromptRunID_NotificationSent, @MJUserRoutineRuns_PromptRunID_ErrorMessage

    WHILE @@FETCH_STATUS = 0
    BEGIN
        -- Set the FK field to NULL
        SET @MJUserRoutineRuns_PromptRunID_PromptRunID = NULL

        -- Call the update SP for the related entity
        EXEC [${flyway:defaultSchema}].[spUpdateUserRoutineRun] @ID = @MJUserRoutineRuns_PromptRunIDID, @RoutineID = @MJUserRoutineRuns_PromptRunID_RoutineID, @StartedAt = @MJUserRoutineRuns_PromptRunID_StartedAt, @CompletedAt = @MJUserRoutineRuns_PromptRunID_CompletedAt, @Status = @MJUserRoutineRuns_PromptRunID_Status, @AgentRunID = @MJUserRoutineRuns_PromptRunID_AgentRunID, @PromptRunID_Clear = 1, @PromptRunID = @MJUserRoutineRuns_PromptRunID_PromptRunID, @ActionExecutionLogID = @MJUserRoutineRuns_PromptRunID_ActionExecutionLogID, @ResultSummary = @MJUserRoutineRuns_PromptRunID_ResultSummary, @ResultHash = @MJUserRoutineRuns_PromptRunID_ResultHash, @NotificationSent = @MJUserRoutineRuns_PromptRunID_NotificationSent, @ErrorMessage = @MJUserRoutineRuns_PromptRunID_ErrorMessage

        FETCH NEXT FROM cascade_update_MJUserRoutineRuns_PromptRunID_cursor INTO @MJUserRoutineRuns_PromptRunIDID, @MJUserRoutineRuns_PromptRunID_RoutineID, @MJUserRoutineRuns_PromptRunID_StartedAt, @MJUserRoutineRuns_PromptRunID_CompletedAt, @MJUserRoutineRuns_PromptRunID_Status, @MJUserRoutineRuns_PromptRunID_AgentRunID, @MJUserRoutineRuns_PromptRunID_PromptRunID, @MJUserRoutineRuns_PromptRunID_ActionExecutionLogID, @MJUserRoutineRuns_PromptRunID_ResultSummary, @MJUserRoutineRuns_PromptRunID_ResultHash, @MJUserRoutineRuns_PromptRunID_NotificationSent, @MJUserRoutineRuns_PromptRunID_ErrorMessage
    END

    CLOSE cascade_update_MJUserRoutineRuns_PromptRunID_cursor
    DEALLOCATE cascade_update_MJUserRoutineRuns_PromptRunID_cursor
    

    DELETE FROM
        [${flyway:defaultSchema}].[AIPromptRun]
    WHERE
        [ID] = @ID


    -- Check if the delete was successful
    IF @@ROWCOUNT = 0
        SELECT NULL AS [ID] -- Return NULL for all primary key fields to indicate no record was deleted
    ELSE
        SELECT @ID AS [ID] -- Return the primary key values to indicate we successfully deleted the record
END
GO
REVOKE EXECUTE ON [${flyway:defaultSchema}].[spDeleteAIPromptRun] FROM [cdp_Developer]
REVOKE EXECUTE ON [${flyway:defaultSchema}].[spDeleteAIPromptRun] FROM [cdp_Integration]
GRANT EXECUTE ON [${flyway:defaultSchema}].[spDeleteAIPromptRun] TO [cdp_Developer], [cdp_Integration];

/* spDelete Permissions for MJ: AI Prompt Runs */

REVOKE EXECUTE ON [${flyway:defaultSchema}].[spDeleteAIPromptRun] FROM [cdp_Developer]
REVOKE EXECUTE ON [${flyway:defaultSchema}].[spDeleteAIPromptRun] FROM [cdp_Integration]
GRANT EXECUTE ON [${flyway:defaultSchema}].[spDeleteAIPromptRun] TO [cdp_Developer], [cdp_Integration];

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
REVOKE EXECUTE ON [${flyway:defaultSchema}].[spDeleteEntityDocument] FROM [cdp_Developer]
REVOKE EXECUTE ON [${flyway:defaultSchema}].[spDeleteEntityDocument] FROM [cdp_Integration]
GRANT EXECUTE ON [${flyway:defaultSchema}].[spDeleteEntityDocument] TO [cdp_Integration], [cdp_Developer];

/* spDelete Permissions for MJ: Entity Documents */

REVOKE EXECUTE ON [${flyway:defaultSchema}].[spDeleteEntityDocument] FROM [cdp_Developer]
REVOKE EXECUTE ON [${flyway:defaultSchema}].[spDeleteEntityDocument] FROM [cdp_Integration]
GRANT EXECUTE ON [${flyway:defaultSchema}].[spDeleteEntityDocument] TO [cdp_Integration], [cdp_Developer];

/* spCreate SQL for MJ: Entity Form Contributions */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Entity Form Contributions
-- Item: spCreateEntityFormContribution
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- CREATE PROCEDURE FOR EntityFormContribution
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[spCreateEntityFormContribution]', 'P') IS NOT NULL
    DROP PROCEDURE [${flyway:defaultSchema}].[spCreateEntityFormContribution];
GO

CREATE PROCEDURE [${flyway:defaultSchema}].[spCreateEntityFormContribution]
    @ID uniqueidentifier = NULL,
    @EntityID uniqueidentifier,
    @ComponentID uniqueidentifier,
    @Name nvarchar(255),
    @Description_Clear bit = 0,
    @Description nvarchar(MAX) = NULL,
    @Slot nvarchar(30) = NULL,
    @SortKey int = NULL,
    @ContributionKey_Clear bit = 0,
    @ContributionKey nvarchar(256) = NULL,
    @RelatedEntityID_Clear bit = 0,
    @RelatedEntityID uniqueidentifier = NULL,
    @RelatedJoinField_Clear bit = 0,
    @RelatedJoinField nvarchar(255) = NULL,
    @ReplacesSectionKey_Clear bit = 0,
    @ReplacesSectionKey nvarchar(255) = NULL,
    @ReplacesSectionKeys_Clear bit = 0,
    @ReplacesSectionKeys nvarchar(MAX) = NULL,
    @ReplacesFieldNames_Clear bit = 0,
    @ReplacesFieldNames nvarchar(MAX) = NULL,
    @InSectionKey_Clear bit = 0,
    @InSectionKey nvarchar(255) = NULL,
    @SectionPosition_Clear bit = 0,
    @SectionPosition nvarchar(10) = NULL,
    @Inclusion_Clear bit = 0,
    @Inclusion nvarchar(10) = NULL,
    @ChromeGroup_Clear bit = 0,
    @ChromeGroup nvarchar(10) = NULL,
    @Presentation nvarchar(10) = NULL,
    @Title_Clear bit = 0,
    @Title nvarchar(255) = NULL,
    @Icon_Clear bit = 0,
    @Icon nvarchar(100) = NULL,
    @Scope nvarchar(20) = NULL,
    @UserID_Clear bit = 0,
    @UserID uniqueidentifier = NULL,
    @RoleID_Clear bit = 0,
    @RoleID uniqueidentifier = NULL,
    @Precedence int = NULL,
    @Status nvarchar(20) = NULL,
    @Configuration_Clear bit = 0,
    @Configuration nvarchar(MAX) = NULL,
    @Notes_Clear bit = 0,
    @Notes nvarchar(MAX) = NULL
AS
BEGIN
    SET NOCOUNT ON;
    IF @Scope IS NULL SET @Scope = User;
    DECLARE @InsertedRow TABLE ([ID] UNIQUEIDENTIFIER)

    IF @ID IS NOT NULL
    BEGIN
        -- User provided a value, use it
        INSERT INTO [${flyway:defaultSchema}].[EntityFormContribution]
            (
                [ID],
                [EntityID],
                [ComponentID],
                [Name],
                [Description],
                [Slot],
                [SortKey],
                [ContributionKey],
                [RelatedEntityID],
                [RelatedJoinField],
                [ReplacesSectionKey],
                [ReplacesSectionKeys],
                [ReplacesFieldNames],
                [InSectionKey],
                [SectionPosition],
                [Inclusion],
                [ChromeGroup],
                [Presentation],
                [Title],
                [Icon],
                [Scope],
                [UserID],
                [RoleID],
                [Precedence],
                [Status],
                [Configuration],
                [Notes]
            )
        OUTPUT INSERTED.[ID] INTO @InsertedRow
        VALUES
            (
                @ID,
                @EntityID,
                @ComponentID,
                @Name,
                CASE WHEN @Description_Clear = 1 THEN NULL ELSE ISNULL(@Description, NULL) END,
                ISNULL(@Slot, 'after-fields'),
                ISNULL(@SortKey, 0),
                CASE WHEN @ContributionKey_Clear = 1 THEN NULL ELSE ISNULL(@ContributionKey, NULL) END,
                CASE WHEN @RelatedEntityID_Clear = 1 THEN NULL ELSE ISNULL(@RelatedEntityID, NULL) END,
                CASE WHEN @RelatedJoinField_Clear = 1 THEN NULL ELSE ISNULL(@RelatedJoinField, NULL) END,
                CASE WHEN @ReplacesSectionKey_Clear = 1 THEN NULL ELSE ISNULL(@ReplacesSectionKey, NULL) END,
                CASE WHEN @ReplacesSectionKeys_Clear = 1 THEN NULL ELSE ISNULL(@ReplacesSectionKeys, NULL) END,
                CASE WHEN @ReplacesFieldNames_Clear = 1 THEN NULL ELSE ISNULL(@ReplacesFieldNames, NULL) END,
                CASE WHEN @InSectionKey_Clear = 1 THEN NULL ELSE ISNULL(@InSectionKey, NULL) END,
                CASE WHEN @SectionPosition_Clear = 1 THEN NULL ELSE ISNULL(@SectionPosition, NULL) END,
                CASE WHEN @Inclusion_Clear = 1 THEN NULL ELSE ISNULL(@Inclusion, NULL) END,
                CASE WHEN @ChromeGroup_Clear = 1 THEN NULL ELSE ISNULL(@ChromeGroup, NULL) END,
                ISNULL(@Presentation, 'panel'),
                CASE WHEN @Title_Clear = 1 THEN NULL ELSE ISNULL(@Title, NULL) END,
                CASE WHEN @Icon_Clear = 1 THEN NULL ELSE ISNULL(@Icon, NULL) END,
                @Scope,
                CASE WHEN @UserID_Clear = 1 THEN NULL ELSE ISNULL(@UserID, NULL) END,
                CASE WHEN @RoleID_Clear = 1 THEN NULL ELSE ISNULL(@RoleID, NULL) END,
                ISNULL(@Precedence, 0),
                ISNULL(@Status, 'Pending'),
                CASE WHEN @Configuration_Clear = 1 THEN NULL ELSE ISNULL(@Configuration, NULL) END,
                CASE WHEN @Notes_Clear = 1 THEN NULL ELSE ISNULL(@Notes, NULL) END
            )
    END
    ELSE
    BEGIN
        -- No value provided, let database use its default (e.g., NEWSEQUENTIALID())
        INSERT INTO [${flyway:defaultSchema}].[EntityFormContribution]
            (
                [EntityID],
                [ComponentID],
                [Name],
                [Description],
                [Slot],
                [SortKey],
                [ContributionKey],
                [RelatedEntityID],
                [RelatedJoinField],
                [ReplacesSectionKey],
                [ReplacesSectionKeys],
                [ReplacesFieldNames],
                [InSectionKey],
                [SectionPosition],
                [Inclusion],
                [ChromeGroup],
                [Presentation],
                [Title],
                [Icon],
                [Scope],
                [UserID],
                [RoleID],
                [Precedence],
                [Status],
                [Configuration],
                [Notes]
            )
        OUTPUT INSERTED.[ID] INTO @InsertedRow
        VALUES
            (
                @EntityID,
                @ComponentID,
                @Name,
                CASE WHEN @Description_Clear = 1 THEN NULL ELSE ISNULL(@Description, NULL) END,
                ISNULL(@Slot, 'after-fields'),
                ISNULL(@SortKey, 0),
                CASE WHEN @ContributionKey_Clear = 1 THEN NULL ELSE ISNULL(@ContributionKey, NULL) END,
                CASE WHEN @RelatedEntityID_Clear = 1 THEN NULL ELSE ISNULL(@RelatedEntityID, NULL) END,
                CASE WHEN @RelatedJoinField_Clear = 1 THEN NULL ELSE ISNULL(@RelatedJoinField, NULL) END,
                CASE WHEN @ReplacesSectionKey_Clear = 1 THEN NULL ELSE ISNULL(@ReplacesSectionKey, NULL) END,
                CASE WHEN @ReplacesSectionKeys_Clear = 1 THEN NULL ELSE ISNULL(@ReplacesSectionKeys, NULL) END,
                CASE WHEN @ReplacesFieldNames_Clear = 1 THEN NULL ELSE ISNULL(@ReplacesFieldNames, NULL) END,
                CASE WHEN @InSectionKey_Clear = 1 THEN NULL ELSE ISNULL(@InSectionKey, NULL) END,
                CASE WHEN @SectionPosition_Clear = 1 THEN NULL ELSE ISNULL(@SectionPosition, NULL) END,
                CASE WHEN @Inclusion_Clear = 1 THEN NULL ELSE ISNULL(@Inclusion, NULL) END,
                CASE WHEN @ChromeGroup_Clear = 1 THEN NULL ELSE ISNULL(@ChromeGroup, NULL) END,
                ISNULL(@Presentation, 'panel'),
                CASE WHEN @Title_Clear = 1 THEN NULL ELSE ISNULL(@Title, NULL) END,
                CASE WHEN @Icon_Clear = 1 THEN NULL ELSE ISNULL(@Icon, NULL) END,
                @Scope,
                CASE WHEN @UserID_Clear = 1 THEN NULL ELSE ISNULL(@UserID, NULL) END,
                CASE WHEN @RoleID_Clear = 1 THEN NULL ELSE ISNULL(@RoleID, NULL) END,
                ISNULL(@Precedence, 0),
                ISNULL(@Status, 'Pending'),
                CASE WHEN @Configuration_Clear = 1 THEN NULL ELSE ISNULL(@Configuration, NULL) END,
                CASE WHEN @Notes_Clear = 1 THEN NULL ELSE ISNULL(@Notes, NULL) END
            )
    END
    -- return the new record from the base view, which might have some calculated fields
    SELECT * FROM [${flyway:defaultSchema}].[vwEntityFormContributions] WHERE [ID] = (SELECT [ID] FROM @InsertedRow)
END
GO
REVOKE EXECUTE ON [${flyway:defaultSchema}].[spCreateEntityFormContribution] FROM [cdp_Developer]
REVOKE EXECUTE ON [${flyway:defaultSchema}].[spCreateEntityFormContribution] FROM [cdp_Integration]
GRANT EXECUTE ON [${flyway:defaultSchema}].[spCreateEntityFormContribution] TO [cdp_UI], [cdp_Developer], [cdp_Integration];

/* spCreate Permissions for MJ: Entity Form Contributions */

REVOKE EXECUTE ON [${flyway:defaultSchema}].[spCreateEntityFormContribution] FROM [cdp_Developer]
REVOKE EXECUTE ON [${flyway:defaultSchema}].[spCreateEntityFormContribution] FROM [cdp_Integration]
GRANT EXECUTE ON [${flyway:defaultSchema}].[spCreateEntityFormContribution] TO [cdp_UI], [cdp_Developer], [cdp_Integration];

/* spCreate SQL for MJ: External Data Source Types */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: External Data Source Types
-- Item: spCreateExternalDataSourceType
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- CREATE PROCEDURE FOR ExternalDataSourceType
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[spCreateExternalDataSourceType]', 'P') IS NOT NULL
    DROP PROCEDURE [${flyway:defaultSchema}].[spCreateExternalDataSourceType];
GO

CREATE PROCEDURE [${flyway:defaultSchema}].[spCreateExternalDataSourceType]
    @ID uniqueidentifier = NULL,
    @Name nvarchar(100),
    @Description_Clear bit = 0,
    @Description nvarchar(MAX) = NULL,
    @DriverClass nvarchar(255),
    @RequiredCredentialTypeID_Clear bit = 0,
    @RequiredCredentialTypeID uniqueidentifier = NULL,
    @MetadataIntrospectionStrategy nvarchar(17) = NULL,
    @FilterDialect nvarchar(9) = NULL,
    @PagingStrategy nvarchar(11) = NULL,
    @SupportsSchemaIntrospection bit = NULL,
    @SupportsNativeQueries bit = NULL,
    @SupportsReadWrite bit = NULL,
    @Status nvarchar(10) = NULL
AS
BEGIN
    SET NOCOUNT ON;
    DECLARE @InsertedRow TABLE ([ID] UNIQUEIDENTIFIER)

    IF @ID IS NOT NULL
    BEGIN
        -- User provided a value, use it
        INSERT INTO [${flyway:defaultSchema}].[ExternalDataSourceType]
            (
                [ID],
                [Name],
                [Description],
                [DriverClass],
                [RequiredCredentialTypeID],
                [MetadataIntrospectionStrategy],
                [FilterDialect],
                [PagingStrategy],
                [SupportsSchemaIntrospection],
                [SupportsNativeQueries],
                [SupportsReadWrite],
                [Status]
            )
        OUTPUT INSERTED.[ID] INTO @InsertedRow
        VALUES
            (
                @ID,
                @Name,
                CASE WHEN @Description_Clear = 1 THEN NULL ELSE ISNULL(@Description, NULL) END,
                @DriverClass,
                CASE WHEN @RequiredCredentialTypeID_Clear = 1 THEN NULL ELSE ISNULL(@RequiredCredentialTypeID, NULL) END,
                ISNULL(@MetadataIntrospectionStrategy, 'Manual'),
                ISNULL(@FilterDialect, 'ansi'),
                ISNULL(@PagingStrategy, 'LimitOffset'),
                ISNULL(@SupportsSchemaIntrospection, 1),
                ISNULL(@SupportsNativeQueries, 1),
                ISNULL(@SupportsReadWrite, 0),
                ISNULL(@Status, 'Active')
            )
    END
    ELSE
    BEGIN
        -- No value provided, let database use its default (e.g., NEWSEQUENTIALID())
        INSERT INTO [${flyway:defaultSchema}].[ExternalDataSourceType]
            (
                [Name],
                [Description],
                [DriverClass],
                [RequiredCredentialTypeID],
                [MetadataIntrospectionStrategy],
                [FilterDialect],
                [PagingStrategy],
                [SupportsSchemaIntrospection],
                [SupportsNativeQueries],
                [SupportsReadWrite],
                [Status]
            )
        OUTPUT INSERTED.[ID] INTO @InsertedRow
        VALUES
            (
                @Name,
                CASE WHEN @Description_Clear = 1 THEN NULL ELSE ISNULL(@Description, NULL) END,
                @DriverClass,
                CASE WHEN @RequiredCredentialTypeID_Clear = 1 THEN NULL ELSE ISNULL(@RequiredCredentialTypeID, NULL) END,
                ISNULL(@MetadataIntrospectionStrategy, 'Manual'),
                ISNULL(@FilterDialect, 'ansi'),
                ISNULL(@PagingStrategy, 'LimitOffset'),
                ISNULL(@SupportsSchemaIntrospection, 1),
                ISNULL(@SupportsNativeQueries, 1),
                ISNULL(@SupportsReadWrite, 0),
                ISNULL(@Status, 'Active')
            )
    END
    -- return the new record from the base view, which might have some calculated fields
    SELECT * FROM [${flyway:defaultSchema}].[vwExternalDataSourceTypes] WHERE [ID] = (SELECT [ID] FROM @InsertedRow)
END
GO
REVOKE EXECUTE ON [${flyway:defaultSchema}].[spCreateExternalDataSourceType] FROM [cdp_Developer]
REVOKE EXECUTE ON [${flyway:defaultSchema}].[spCreateExternalDataSourceType] FROM [cdp_Integration]
GRANT EXECUTE ON [${flyway:defaultSchema}].[spCreateExternalDataSourceType] TO [cdp_Developer], [cdp_Integration];

/* spCreate Permissions for MJ: External Data Source Types */

REVOKE EXECUTE ON [${flyway:defaultSchema}].[spCreateExternalDataSourceType] FROM [cdp_Developer]
REVOKE EXECUTE ON [${flyway:defaultSchema}].[spCreateExternalDataSourceType] FROM [cdp_Integration]
GRANT EXECUTE ON [${flyway:defaultSchema}].[spCreateExternalDataSourceType] TO [cdp_Developer], [cdp_Integration];

/* spUpdate SQL for MJ: External Data Source Types */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: External Data Source Types
-- Item: spUpdateExternalDataSourceType
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- UPDATE PROCEDURE FOR ExternalDataSourceType
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[spUpdateExternalDataSourceType]', 'P') IS NOT NULL
    DROP PROCEDURE [${flyway:defaultSchema}].[spUpdateExternalDataSourceType];
GO

CREATE PROCEDURE [${flyway:defaultSchema}].[spUpdateExternalDataSourceType]
    @ID uniqueidentifier,
    @Name nvarchar(100) = NULL,
    @Description_Clear bit = 0,
    @Description nvarchar(MAX) = NULL,
    @DriverClass nvarchar(255) = NULL,
    @RequiredCredentialTypeID_Clear bit = 0,
    @RequiredCredentialTypeID uniqueidentifier = NULL,
    @MetadataIntrospectionStrategy nvarchar(17) = NULL,
    @FilterDialect nvarchar(9) = NULL,
    @PagingStrategy nvarchar(11) = NULL,
    @SupportsSchemaIntrospection bit = NULL,
    @SupportsNativeQueries bit = NULL,
    @SupportsReadWrite bit = NULL,
    @Status nvarchar(10) = NULL
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE
        [${flyway:defaultSchema}].[ExternalDataSourceType]
    SET
        [Name] = ISNULL(@Name, [Name]),
        [Description] = CASE WHEN @Description_Clear = 1 THEN NULL ELSE ISNULL(@Description, [Description]) END,
        [DriverClass] = ISNULL(@DriverClass, [DriverClass]),
        [RequiredCredentialTypeID] = CASE WHEN @RequiredCredentialTypeID_Clear = 1 THEN NULL ELSE ISNULL(@RequiredCredentialTypeID, [RequiredCredentialTypeID]) END,
        [MetadataIntrospectionStrategy] = ISNULL(@MetadataIntrospectionStrategy, [MetadataIntrospectionStrategy]),
        [FilterDialect] = ISNULL(@FilterDialect, [FilterDialect]),
        [PagingStrategy] = ISNULL(@PagingStrategy, [PagingStrategy]),
        [SupportsSchemaIntrospection] = ISNULL(@SupportsSchemaIntrospection, [SupportsSchemaIntrospection]),
        [SupportsNativeQueries] = ISNULL(@SupportsNativeQueries, [SupportsNativeQueries]),
        [SupportsReadWrite] = ISNULL(@SupportsReadWrite, [SupportsReadWrite]),
        [Status] = ISNULL(@Status, [Status])
    WHERE
        [ID] = @ID

    -- Check if the update was successful
    IF @@ROWCOUNT = 0
        -- Nothing was updated, return no rows, but column structure from base view intact, semantically correct this way.
        SELECT TOP 0 * FROM [${flyway:defaultSchema}].[vwExternalDataSourceTypes] WHERE 1=0
    ELSE
        -- Return the updated record so the caller can see the updated values and any calculated fields
        SELECT
                                        *
                                    FROM
                                        [${flyway:defaultSchema}].[vwExternalDataSourceTypes]
                                    WHERE
                                        [ID] = @ID
                                    
END
GO

REVOKE EXECUTE ON [${flyway:defaultSchema}].[spUpdateExternalDataSourceType] FROM [cdp_Developer]
REVOKE EXECUTE ON [${flyway:defaultSchema}].[spUpdateExternalDataSourceType] FROM [cdp_Integration]
GRANT EXECUTE ON [${flyway:defaultSchema}].[spUpdateExternalDataSourceType] TO [cdp_Developer], [cdp_Integration]
GO

------------------------------------------------------------
----- TRIGGER FOR __mj_UpdatedAt field for the ExternalDataSourceType table
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[trgUpdateExternalDataSourceType]', 'TR') IS NOT NULL
    DROP TRIGGER [${flyway:defaultSchema}].[trgUpdateExternalDataSourceType];
GO
CREATE TRIGGER [${flyway:defaultSchema}].trgUpdateExternalDataSourceType
ON [${flyway:defaultSchema}].[ExternalDataSourceType]
AFTER UPDATE
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE
        [${flyway:defaultSchema}].[ExternalDataSourceType]
    SET
        __mj_UpdatedAt = GETUTCDATE()
    FROM
        [${flyway:defaultSchema}].[ExternalDataSourceType] AS _organicTable
    INNER JOIN
        INSERTED AS I ON
        _organicTable.[ID] = I.[ID];
END;
GO

/* spUpdate Permissions for MJ: External Data Source Types */

REVOKE EXECUTE ON [${flyway:defaultSchema}].[spUpdateExternalDataSourceType] FROM [cdp_Developer]
REVOKE EXECUTE ON [${flyway:defaultSchema}].[spUpdateExternalDataSourceType] FROM [cdp_Integration]
GRANT EXECUTE ON [${flyway:defaultSchema}].[spUpdateExternalDataSourceType] TO [cdp_Developer], [cdp_Integration];

/* spCreate SQL for MJ: External Data Sources */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: External Data Sources
-- Item: spCreateExternalDataSource
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- CREATE PROCEDURE FOR ExternalDataSource
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[spCreateExternalDataSource]', 'P') IS NOT NULL
    DROP PROCEDURE [${flyway:defaultSchema}].[spCreateExternalDataSource];
GO

CREATE PROCEDURE [${flyway:defaultSchema}].[spCreateExternalDataSource]
    @ID uniqueidentifier = NULL,
    @Name nvarchar(100),
    @Description_Clear bit = 0,
    @Description nvarchar(MAX) = NULL,
    @TypeID uniqueidentifier,
    @CredentialID_Clear bit = 0,
    @CredentialID uniqueidentifier = NULL,
    @DefaultSchema_Clear bit = 0,
    @DefaultSchema nvarchar(255) = NULL,
    @DefaultDatabase_Clear bit = 0,
    @DefaultDatabase nvarchar(255) = NULL,
    @ConnectionConfig_Clear bit = 0,
    @ConnectionConfig nvarchar(MAX) = NULL,
    @DefaultCacheTTLSeconds int = NULL,
    @Status nvarchar(10) = NULL,
    @LastConnectionTestAt_Clear bit = 0,
    @LastConnectionTestAt datetimeoffset = NULL,
    @LastConnectionTestResult_Clear bit = 0,
    @LastConnectionTestResult nvarchar(MAX) = NULL
AS
BEGIN
    SET NOCOUNT ON;
    DECLARE @InsertedRow TABLE ([ID] UNIQUEIDENTIFIER)

    IF @ID IS NOT NULL
    BEGIN
        -- User provided a value, use it
        INSERT INTO [${flyway:defaultSchema}].[ExternalDataSource]
            (
                [ID],
                [Name],
                [Description],
                [TypeID],
                [CredentialID],
                [DefaultSchema],
                [DefaultDatabase],
                [ConnectionConfig],
                [DefaultCacheTTLSeconds],
                [Status],
                [LastConnectionTestAt],
                [LastConnectionTestResult]
            )
        OUTPUT INSERTED.[ID] INTO @InsertedRow
        VALUES
            (
                @ID,
                @Name,
                CASE WHEN @Description_Clear = 1 THEN NULL ELSE ISNULL(@Description, NULL) END,
                @TypeID,
                CASE WHEN @CredentialID_Clear = 1 THEN NULL ELSE ISNULL(@CredentialID, NULL) END,
                CASE WHEN @DefaultSchema_Clear = 1 THEN NULL ELSE ISNULL(@DefaultSchema, NULL) END,
                CASE WHEN @DefaultDatabase_Clear = 1 THEN NULL ELSE ISNULL(@DefaultDatabase, NULL) END,
                CASE WHEN @ConnectionConfig_Clear = 1 THEN NULL ELSE ISNULL(@ConnectionConfig, NULL) END,
                ISNULL(@DefaultCacheTTLSeconds, 300),
                ISNULL(@Status, 'Active'),
                CASE WHEN @LastConnectionTestAt_Clear = 1 THEN NULL ELSE ISNULL(@LastConnectionTestAt, NULL) END,
                CASE WHEN @LastConnectionTestResult_Clear = 1 THEN NULL ELSE ISNULL(@LastConnectionTestResult, NULL) END
            )
    END
    ELSE
    BEGIN
        -- No value provided, let database use its default (e.g., NEWSEQUENTIALID())
        INSERT INTO [${flyway:defaultSchema}].[ExternalDataSource]
            (
                [Name],
                [Description],
                [TypeID],
                [CredentialID],
                [DefaultSchema],
                [DefaultDatabase],
                [ConnectionConfig],
                [DefaultCacheTTLSeconds],
                [Status],
                [LastConnectionTestAt],
                [LastConnectionTestResult]
            )
        OUTPUT INSERTED.[ID] INTO @InsertedRow
        VALUES
            (
                @Name,
                CASE WHEN @Description_Clear = 1 THEN NULL ELSE ISNULL(@Description, NULL) END,
                @TypeID,
                CASE WHEN @CredentialID_Clear = 1 THEN NULL ELSE ISNULL(@CredentialID, NULL) END,
                CASE WHEN @DefaultSchema_Clear = 1 THEN NULL ELSE ISNULL(@DefaultSchema, NULL) END,
                CASE WHEN @DefaultDatabase_Clear = 1 THEN NULL ELSE ISNULL(@DefaultDatabase, NULL) END,
                CASE WHEN @ConnectionConfig_Clear = 1 THEN NULL ELSE ISNULL(@ConnectionConfig, NULL) END,
                ISNULL(@DefaultCacheTTLSeconds, 300),
                ISNULL(@Status, 'Active'),
                CASE WHEN @LastConnectionTestAt_Clear = 1 THEN NULL ELSE ISNULL(@LastConnectionTestAt, NULL) END,
                CASE WHEN @LastConnectionTestResult_Clear = 1 THEN NULL ELSE ISNULL(@LastConnectionTestResult, NULL) END
            )
    END
    -- return the new record from the base view, which might have some calculated fields
    SELECT * FROM [${flyway:defaultSchema}].[vwExternalDataSources] WHERE [ID] = (SELECT [ID] FROM @InsertedRow)
END
GO
REVOKE EXECUTE ON [${flyway:defaultSchema}].[spCreateExternalDataSource] FROM [cdp_Developer]
REVOKE EXECUTE ON [${flyway:defaultSchema}].[spCreateExternalDataSource] FROM [cdp_Integration]
GRANT EXECUTE ON [${flyway:defaultSchema}].[spCreateExternalDataSource] TO [cdp_Developer], [cdp_Integration];

/* spCreate Permissions for MJ: External Data Sources */

REVOKE EXECUTE ON [${flyway:defaultSchema}].[spCreateExternalDataSource] FROM [cdp_Developer]
REVOKE EXECUTE ON [${flyway:defaultSchema}].[spCreateExternalDataSource] FROM [cdp_Integration]
GRANT EXECUTE ON [${flyway:defaultSchema}].[spCreateExternalDataSource] TO [cdp_Developer], [cdp_Integration];

/* spUpdate SQL for MJ: External Data Sources */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: External Data Sources
-- Item: spUpdateExternalDataSource
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- UPDATE PROCEDURE FOR ExternalDataSource
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[spUpdateExternalDataSource]', 'P') IS NOT NULL
    DROP PROCEDURE [${flyway:defaultSchema}].[spUpdateExternalDataSource];
GO

CREATE PROCEDURE [${flyway:defaultSchema}].[spUpdateExternalDataSource]
    @ID uniqueidentifier,
    @Name nvarchar(100) = NULL,
    @Description_Clear bit = 0,
    @Description nvarchar(MAX) = NULL,
    @TypeID uniqueidentifier = NULL,
    @CredentialID_Clear bit = 0,
    @CredentialID uniqueidentifier = NULL,
    @DefaultSchema_Clear bit = 0,
    @DefaultSchema nvarchar(255) = NULL,
    @DefaultDatabase_Clear bit = 0,
    @DefaultDatabase nvarchar(255) = NULL,
    @ConnectionConfig_Clear bit = 0,
    @ConnectionConfig nvarchar(MAX) = NULL,
    @DefaultCacheTTLSeconds int = NULL,
    @Status nvarchar(10) = NULL,
    @LastConnectionTestAt_Clear bit = 0,
    @LastConnectionTestAt datetimeoffset = NULL,
    @LastConnectionTestResult_Clear bit = 0,
    @LastConnectionTestResult nvarchar(MAX) = NULL
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE
        [${flyway:defaultSchema}].[ExternalDataSource]
    SET
        [Name] = ISNULL(@Name, [Name]),
        [Description] = CASE WHEN @Description_Clear = 1 THEN NULL ELSE ISNULL(@Description, [Description]) END,
        [TypeID] = ISNULL(@TypeID, [TypeID]),
        [CredentialID] = CASE WHEN @CredentialID_Clear = 1 THEN NULL ELSE ISNULL(@CredentialID, [CredentialID]) END,
        [DefaultSchema] = CASE WHEN @DefaultSchema_Clear = 1 THEN NULL ELSE ISNULL(@DefaultSchema, [DefaultSchema]) END,
        [DefaultDatabase] = CASE WHEN @DefaultDatabase_Clear = 1 THEN NULL ELSE ISNULL(@DefaultDatabase, [DefaultDatabase]) END,
        [ConnectionConfig] = CASE WHEN @ConnectionConfig_Clear = 1 THEN NULL ELSE ISNULL(@ConnectionConfig, [ConnectionConfig]) END,
        [DefaultCacheTTLSeconds] = ISNULL(@DefaultCacheTTLSeconds, [DefaultCacheTTLSeconds]),
        [Status] = ISNULL(@Status, [Status]),
        [LastConnectionTestAt] = CASE WHEN @LastConnectionTestAt_Clear = 1 THEN NULL ELSE ISNULL(@LastConnectionTestAt, [LastConnectionTestAt]) END,
        [LastConnectionTestResult] = CASE WHEN @LastConnectionTestResult_Clear = 1 THEN NULL ELSE ISNULL(@LastConnectionTestResult, [LastConnectionTestResult]) END
    WHERE
        [ID] = @ID

    -- Check if the update was successful
    IF @@ROWCOUNT = 0
        -- Nothing was updated, return no rows, but column structure from base view intact, semantically correct this way.
        SELECT TOP 0 * FROM [${flyway:defaultSchema}].[vwExternalDataSources] WHERE 1=0
    ELSE
        -- Return the updated record so the caller can see the updated values and any calculated fields
        SELECT
                                        *
                                    FROM
                                        [${flyway:defaultSchema}].[vwExternalDataSources]
                                    WHERE
                                        [ID] = @ID
                                    
END
GO

REVOKE EXECUTE ON [${flyway:defaultSchema}].[spUpdateExternalDataSource] FROM [cdp_Developer]
REVOKE EXECUTE ON [${flyway:defaultSchema}].[spUpdateExternalDataSource] FROM [cdp_Integration]
GRANT EXECUTE ON [${flyway:defaultSchema}].[spUpdateExternalDataSource] TO [cdp_Developer], [cdp_Integration]
GO

------------------------------------------------------------
----- TRIGGER FOR __mj_UpdatedAt field for the ExternalDataSource table
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[trgUpdateExternalDataSource]', 'TR') IS NOT NULL
    DROP TRIGGER [${flyway:defaultSchema}].[trgUpdateExternalDataSource];
GO
CREATE TRIGGER [${flyway:defaultSchema}].trgUpdateExternalDataSource
ON [${flyway:defaultSchema}].[ExternalDataSource]
AFTER UPDATE
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE
        [${flyway:defaultSchema}].[ExternalDataSource]
    SET
        __mj_UpdatedAt = GETUTCDATE()
    FROM
        [${flyway:defaultSchema}].[ExternalDataSource] AS _organicTable
    INNER JOIN
        INSERTED AS I ON
        _organicTable.[ID] = I.[ID];
END;
GO

/* spUpdate Permissions for MJ: External Data Sources */

REVOKE EXECUTE ON [${flyway:defaultSchema}].[spUpdateExternalDataSource] FROM [cdp_Developer]
REVOKE EXECUTE ON [${flyway:defaultSchema}].[spUpdateExternalDataSource] FROM [cdp_Integration]
GRANT EXECUTE ON [${flyway:defaultSchema}].[spUpdateExternalDataSource] TO [cdp_Developer], [cdp_Integration];

/* spCreate SQL for MJ: Magic Link Redemptions */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Magic Link Redemptions
-- Item: spCreateMagicLinkRedemption
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- CREATE PROCEDURE FOR MagicLinkRedemption
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[spCreateMagicLinkRedemption]', 'P') IS NOT NULL
    DROP PROCEDURE [${flyway:defaultSchema}].[spCreateMagicLinkRedemption];
GO

CREATE PROCEDURE [${flyway:defaultSchema}].[spCreateMagicLinkRedemption]
    @ID uniqueidentifier = NULL,
    @InviteID_Clear bit = 0,
    @InviteID uniqueidentifier = NULL,
    @AttemptedAt datetimeoffset = NULL,
    @Outcome nvarchar(30),
    @IPAddress_Clear bit = 0,
    @IPAddress nvarchar(64) = NULL,
    @UserAgent_Clear bit = 0,
    @UserAgent nvarchar(512) = NULL,
    @Origin_Clear bit = 0,
    @Origin nvarchar(512) = NULL,
    @ProvisionedUserID_Clear bit = 0,
    @ProvisionedUserID uniqueidentifier = NULL
AS
BEGIN
    SET NOCOUNT ON;
    DECLARE @InsertedRow TABLE ([ID] UNIQUEIDENTIFIER)

    IF @ID IS NOT NULL
    BEGIN
        -- User provided a value, use it
        INSERT INTO [${flyway:defaultSchema}].[MagicLinkRedemption]
            (
                [ID],
                [InviteID],
                [AttemptedAt],
                [Outcome],
                [IPAddress],
                [UserAgent],
                [Origin],
                [ProvisionedUserID]
            )
        OUTPUT INSERTED.[ID] INTO @InsertedRow
        VALUES
            (
                @ID,
                CASE WHEN @InviteID_Clear = 1 THEN NULL ELSE ISNULL(@InviteID, NULL) END,
                ISNULL(@AttemptedAt, sysutcdatetime()),
                @Outcome,
                CASE WHEN @IPAddress_Clear = 1 THEN NULL ELSE ISNULL(@IPAddress, NULL) END,
                CASE WHEN @UserAgent_Clear = 1 THEN NULL ELSE ISNULL(@UserAgent, NULL) END,
                CASE WHEN @Origin_Clear = 1 THEN NULL ELSE ISNULL(@Origin, NULL) END,
                CASE WHEN @ProvisionedUserID_Clear = 1 THEN NULL ELSE ISNULL(@ProvisionedUserID, NULL) END
            )
    END
    ELSE
    BEGIN
        -- No value provided, let database use its default (e.g., NEWSEQUENTIALID())
        INSERT INTO [${flyway:defaultSchema}].[MagicLinkRedemption]
            (
                [InviteID],
                [AttemptedAt],
                [Outcome],
                [IPAddress],
                [UserAgent],
                [Origin],
                [ProvisionedUserID]
            )
        OUTPUT INSERTED.[ID] INTO @InsertedRow
        VALUES
            (
                CASE WHEN @InviteID_Clear = 1 THEN NULL ELSE ISNULL(@InviteID, NULL) END,
                ISNULL(@AttemptedAt, sysutcdatetime()),
                @Outcome,
                CASE WHEN @IPAddress_Clear = 1 THEN NULL ELSE ISNULL(@IPAddress, NULL) END,
                CASE WHEN @UserAgent_Clear = 1 THEN NULL ELSE ISNULL(@UserAgent, NULL) END,
                CASE WHEN @Origin_Clear = 1 THEN NULL ELSE ISNULL(@Origin, NULL) END,
                CASE WHEN @ProvisionedUserID_Clear = 1 THEN NULL ELSE ISNULL(@ProvisionedUserID, NULL) END
            )
    END
    -- return the new record from the base view, which might have some calculated fields
    SELECT * FROM [${flyway:defaultSchema}].[vwMagicLinkRedemptions] WHERE [ID] = (SELECT [ID] FROM @InsertedRow)
END
GO
REVOKE EXECUTE ON [${flyway:defaultSchema}].[spCreateMagicLinkRedemption] FROM [cdp_Developer]
REVOKE EXECUTE ON [${flyway:defaultSchema}].[spCreateMagicLinkRedemption] FROM [cdp_Integration]
GRANT EXECUTE ON [${flyway:defaultSchema}].[spCreateMagicLinkRedemption] TO [cdp_Developer], [cdp_Integration];

/* spCreate Permissions for MJ: Magic Link Redemptions */

REVOKE EXECUTE ON [${flyway:defaultSchema}].[spCreateMagicLinkRedemption] FROM [cdp_Developer]
REVOKE EXECUTE ON [${flyway:defaultSchema}].[spCreateMagicLinkRedemption] FROM [cdp_Integration]
GRANT EXECUTE ON [${flyway:defaultSchema}].[spCreateMagicLinkRedemption] TO [cdp_Developer], [cdp_Integration];

/* spDelete SQL for MJ: Rubric Evaluations */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Rubric Evaluations
-- Item: spDeleteRubricEvaluation
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- DELETE PROCEDURE FOR RubricEvaluation
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[spDeleteRubricEvaluation]', 'P') IS NOT NULL
    DROP PROCEDURE [${flyway:defaultSchema}].[spDeleteRubricEvaluation];
GO

CREATE PROCEDURE [${flyway:defaultSchema}].[spDeleteRubricEvaluation]
    @ID uniqueidentifier
AS
BEGIN
    SET NOCOUNT ON;
    -- Cascade delete from RubricEvaluationScore using cursor to call spDeleteRubricEvaluationScore
    DECLARE @MJRubricEvaluationScores_EvaluationIDID uniqueidentifier
    DECLARE cascade_delete_MJRubricEvaluationScores_EvaluationID_cursor CURSOR FOR 
        SELECT [ID]
        FROM [${flyway:defaultSchema}].[RubricEvaluationScore]
        WHERE [EvaluationID] = @ID
    
    OPEN cascade_delete_MJRubricEvaluationScores_EvaluationID_cursor
    FETCH NEXT FROM cascade_delete_MJRubricEvaluationScores_EvaluationID_cursor INTO @MJRubricEvaluationScores_EvaluationIDID
    
    WHILE @@FETCH_STATUS = 0
    BEGIN
        EXEC [${flyway:defaultSchema}].[spDeleteRubricEvaluationScore] @ID = @MJRubricEvaluationScores_EvaluationIDID
        
        FETCH NEXT FROM cascade_delete_MJRubricEvaluationScores_EvaluationID_cursor INTO @MJRubricEvaluationScores_EvaluationIDID
    END
    
    CLOSE cascade_delete_MJRubricEvaluationScores_EvaluationID_cursor
    DEALLOCATE cascade_delete_MJRubricEvaluationScores_EvaluationID_cursor
    
    -- Cascade update on RubricEvaluation using cursor to call spUpdateRubricEvaluation
    DECLARE @MJRubricEvaluations_SupersedesEvaluationIDID uniqueidentifier
    DECLARE @MJRubricEvaluations_SupersedesEvaluationID_RubricVersionID uniqueidentifier
    DECLARE @MJRubricEvaluations_SupersedesEvaluationID_SubjectEntityID uniqueidentifier
    DECLARE @MJRubricEvaluations_SupersedesEvaluationID_SubjectRecordID nvarchar(450)
    DECLARE @MJRubricEvaluations_SupersedesEvaluationID_ContextEntityID uniqueidentifier
    DECLARE @MJRubricEvaluations_SupersedesEvaluationID_ContextRecordID nvarchar(450)
    DECLARE @MJRubricEvaluations_SupersedesEvaluationID_EvaluatorType nvarchar(20)
    DECLARE @MJRubricEvaluations_SupersedesEvaluationID_EvaluatorUserID uniqueidentifier
    DECLARE @MJRubricEvaluations_SupersedesEvaluationID_AIPromptRunID uniqueidentifier
    DECLARE @MJRubricEvaluations_SupersedesEvaluationID_AIAgentRunID uniqueidentifier
    DECLARE @MJRubricEvaluations_SupersedesEvaluationID_EvaluatorName nvarchar(255)
    DECLARE @MJRubricEvaluations_SupersedesEvaluationID_Status nvarchar(20)
    DECLARE @MJRubricEvaluations_SupersedesEvaluationID_SupersedesEvaluationID uniqueidentifier
    DECLARE @MJRubricEvaluations_SupersedesEvaluationID_SubmittedAt datetimeoffset
    DECLARE @MJRubricEvaluations_SupersedesEvaluationID_PassThresholdApplied decimal(9, 6)
    DECLARE @MJRubricEvaluations_SupersedesEvaluationID_NormalizedScore decimal(9, 6)
    DECLARE @MJRubricEvaluations_SupersedesEvaluationID_Passed bit
    DECLARE @MJRubricEvaluations_SupersedesEvaluationID_Outcome nvarchar(30)
    DECLARE @MJRubricEvaluations_SupersedesEvaluationID_BandID uniqueidentifier
    DECLARE @MJRubricEvaluations_SupersedesEvaluationID_GateFailed bit
    DECLARE @MJRubricEvaluations_SupersedesEvaluationID_Completeness decimal(9, 6)
    DECLARE @MJRubricEvaluations_SupersedesEvaluationID_ScoredCriteriaCount int
    DECLARE @MJRubricEvaluations_SupersedesEvaluationID_ApplicableCriteriaCount int
    DECLARE @MJRubricEvaluations_SupersedesEvaluationID_TotalCriteriaCount int
    DECLARE @MJRubricEvaluations_SupersedesEvaluationID_Confidence decimal(9, 6)
    DECLARE @MJRubricEvaluations_SupersedesEvaluationID_Narrative nvarchar(MAX)
    DECLARE @MJRubricEvaluations_SupersedesEvaluationID_ErrorMessage nvarchar(MAX)
    DECLARE @MJRubricEvaluations_SupersedesEvaluationID_ScoringEngineVersion nvarchar(20)
    DECLARE @MJRubricEvaluations_SupersedesEvaluationID_Metadata nvarchar(MAX)
    DECLARE cascade_update_MJRubricEvaluations_SupersedesEvaluationID_cursor CURSOR FOR
        SELECT [ID], [RubricVersionID], [SubjectEntityID], [SubjectRecordID], [ContextEntityID], [ContextRecordID], [EvaluatorType], [EvaluatorUserID], [AIPromptRunID], [AIAgentRunID], [EvaluatorName], [Status], [SupersedesEvaluationID], [SubmittedAt], [PassThresholdApplied], [NormalizedScore], [Passed], [Outcome], [BandID], [GateFailed], [Completeness], [ScoredCriteriaCount], [ApplicableCriteriaCount], [TotalCriteriaCount], [Confidence], [Narrative], [ErrorMessage], [ScoringEngineVersion], [Metadata]
        FROM [${flyway:defaultSchema}].[RubricEvaluation]
        WHERE [SupersedesEvaluationID] = @ID

    OPEN cascade_update_MJRubricEvaluations_SupersedesEvaluationID_cursor
    FETCH NEXT FROM cascade_update_MJRubricEvaluations_SupersedesEvaluationID_cursor INTO @MJRubricEvaluations_SupersedesEvaluationIDID, @MJRubricEvaluations_SupersedesEvaluationID_RubricVersionID, @MJRubricEvaluations_SupersedesEvaluationID_SubjectEntityID, @MJRubricEvaluations_SupersedesEvaluationID_SubjectRecordID, @MJRubricEvaluations_SupersedesEvaluationID_ContextEntityID, @MJRubricEvaluations_SupersedesEvaluationID_ContextRecordID, @MJRubricEvaluations_SupersedesEvaluationID_EvaluatorType, @MJRubricEvaluations_SupersedesEvaluationID_EvaluatorUserID, @MJRubricEvaluations_SupersedesEvaluationID_AIPromptRunID, @MJRubricEvaluations_SupersedesEvaluationID_AIAgentRunID, @MJRubricEvaluations_SupersedesEvaluationID_EvaluatorName, @MJRubricEvaluations_SupersedesEvaluationID_Status, @MJRubricEvaluations_SupersedesEvaluationID_SupersedesEvaluationID, @MJRubricEvaluations_SupersedesEvaluationID_SubmittedAt, @MJRubricEvaluations_SupersedesEvaluationID_PassThresholdApplied, @MJRubricEvaluations_SupersedesEvaluationID_NormalizedScore, @MJRubricEvaluations_SupersedesEvaluationID_Passed, @MJRubricEvaluations_SupersedesEvaluationID_Outcome, @MJRubricEvaluations_SupersedesEvaluationID_BandID, @MJRubricEvaluations_SupersedesEvaluationID_GateFailed, @MJRubricEvaluations_SupersedesEvaluationID_Completeness, @MJRubricEvaluations_SupersedesEvaluationID_ScoredCriteriaCount, @MJRubricEvaluations_SupersedesEvaluationID_ApplicableCriteriaCount, @MJRubricEvaluations_SupersedesEvaluationID_TotalCriteriaCount, @MJRubricEvaluations_SupersedesEvaluationID_Confidence, @MJRubricEvaluations_SupersedesEvaluationID_Narrative, @MJRubricEvaluations_SupersedesEvaluationID_ErrorMessage, @MJRubricEvaluations_SupersedesEvaluationID_ScoringEngineVersion, @MJRubricEvaluations_SupersedesEvaluationID_Metadata

    WHILE @@FETCH_STATUS = 0
    BEGIN
        -- Set the FK field to NULL
        SET @MJRubricEvaluations_SupersedesEvaluationID_SupersedesEvaluationID = NULL

        -- Call the update SP for the related entity
        EXEC [${flyway:defaultSchema}].[spUpdateRubricEvaluation] @ID = @MJRubricEvaluations_SupersedesEvaluationIDID, @RubricVersionID = @MJRubricEvaluations_SupersedesEvaluationID_RubricVersionID, @SubjectEntityID = @MJRubricEvaluations_SupersedesEvaluationID_SubjectEntityID, @SubjectRecordID = @MJRubricEvaluations_SupersedesEvaluationID_SubjectRecordID, @ContextEntityID = @MJRubricEvaluations_SupersedesEvaluationID_ContextEntityID, @ContextRecordID = @MJRubricEvaluations_SupersedesEvaluationID_ContextRecordID, @EvaluatorType = @MJRubricEvaluations_SupersedesEvaluationID_EvaluatorType, @EvaluatorUserID = @MJRubricEvaluations_SupersedesEvaluationID_EvaluatorUserID, @AIPromptRunID = @MJRubricEvaluations_SupersedesEvaluationID_AIPromptRunID, @AIAgentRunID = @MJRubricEvaluations_SupersedesEvaluationID_AIAgentRunID, @EvaluatorName = @MJRubricEvaluations_SupersedesEvaluationID_EvaluatorName, @Status = @MJRubricEvaluations_SupersedesEvaluationID_Status, @SupersedesEvaluationID_Clear = 1, @SupersedesEvaluationID = @MJRubricEvaluations_SupersedesEvaluationID_SupersedesEvaluationID, @SubmittedAt = @MJRubricEvaluations_SupersedesEvaluationID_SubmittedAt, @PassThresholdApplied = @MJRubricEvaluations_SupersedesEvaluationID_PassThresholdApplied, @NormalizedScore = @MJRubricEvaluations_SupersedesEvaluationID_NormalizedScore, @Passed = @MJRubricEvaluations_SupersedesEvaluationID_Passed, @Outcome = @MJRubricEvaluations_SupersedesEvaluationID_Outcome, @BandID = @MJRubricEvaluations_SupersedesEvaluationID_BandID, @GateFailed = @MJRubricEvaluations_SupersedesEvaluationID_GateFailed, @Completeness = @MJRubricEvaluations_SupersedesEvaluationID_Completeness, @ScoredCriteriaCount = @MJRubricEvaluations_SupersedesEvaluationID_ScoredCriteriaCount, @ApplicableCriteriaCount = @MJRubricEvaluations_SupersedesEvaluationID_ApplicableCriteriaCount, @TotalCriteriaCount = @MJRubricEvaluations_SupersedesEvaluationID_TotalCriteriaCount, @Confidence = @MJRubricEvaluations_SupersedesEvaluationID_Confidence, @Narrative = @MJRubricEvaluations_SupersedesEvaluationID_Narrative, @ErrorMessage = @MJRubricEvaluations_SupersedesEvaluationID_ErrorMessage, @ScoringEngineVersion = @MJRubricEvaluations_SupersedesEvaluationID_ScoringEngineVersion, @Metadata = @MJRubricEvaluations_SupersedesEvaluationID_Metadata

        FETCH NEXT FROM cascade_update_MJRubricEvaluations_SupersedesEvaluationID_cursor INTO @MJRubricEvaluations_SupersedesEvaluationIDID, @MJRubricEvaluations_SupersedesEvaluationID_RubricVersionID, @MJRubricEvaluations_SupersedesEvaluationID_SubjectEntityID, @MJRubricEvaluations_SupersedesEvaluationID_SubjectRecordID, @MJRubricEvaluations_SupersedesEvaluationID_ContextEntityID, @MJRubricEvaluations_SupersedesEvaluationID_ContextRecordID, @MJRubricEvaluations_SupersedesEvaluationID_EvaluatorType, @MJRubricEvaluations_SupersedesEvaluationID_EvaluatorUserID, @MJRubricEvaluations_SupersedesEvaluationID_AIPromptRunID, @MJRubricEvaluations_SupersedesEvaluationID_AIAgentRunID, @MJRubricEvaluations_SupersedesEvaluationID_EvaluatorName, @MJRubricEvaluations_SupersedesEvaluationID_Status, @MJRubricEvaluations_SupersedesEvaluationID_SupersedesEvaluationID, @MJRubricEvaluations_SupersedesEvaluationID_SubmittedAt, @MJRubricEvaluations_SupersedesEvaluationID_PassThresholdApplied, @MJRubricEvaluations_SupersedesEvaluationID_NormalizedScore, @MJRubricEvaluations_SupersedesEvaluationID_Passed, @MJRubricEvaluations_SupersedesEvaluationID_Outcome, @MJRubricEvaluations_SupersedesEvaluationID_BandID, @MJRubricEvaluations_SupersedesEvaluationID_GateFailed, @MJRubricEvaluations_SupersedesEvaluationID_Completeness, @MJRubricEvaluations_SupersedesEvaluationID_ScoredCriteriaCount, @MJRubricEvaluations_SupersedesEvaluationID_ApplicableCriteriaCount, @MJRubricEvaluations_SupersedesEvaluationID_TotalCriteriaCount, @MJRubricEvaluations_SupersedesEvaluationID_Confidence, @MJRubricEvaluations_SupersedesEvaluationID_Narrative, @MJRubricEvaluations_SupersedesEvaluationID_ErrorMessage, @MJRubricEvaluations_SupersedesEvaluationID_ScoringEngineVersion, @MJRubricEvaluations_SupersedesEvaluationID_Metadata
    END

    CLOSE cascade_update_MJRubricEvaluations_SupersedesEvaluationID_cursor
    DEALLOCATE cascade_update_MJRubricEvaluations_SupersedesEvaluationID_cursor
    

    DELETE FROM
        [${flyway:defaultSchema}].[RubricEvaluation]
    WHERE
        [ID] = @ID


    -- Check if the delete was successful
    IF @@ROWCOUNT = 0
        SELECT NULL AS [ID] -- Return NULL for all primary key fields to indicate no record was deleted
    ELSE
        SELECT @ID AS [ID] -- Return the primary key values to indicate we successfully deleted the record
END
GO
REVOKE EXECUTE ON [${flyway:defaultSchema}].[spDeleteRubricEvaluation] FROM [cdp_Developer]
REVOKE EXECUTE ON [${flyway:defaultSchema}].[spDeleteRubricEvaluation] FROM [cdp_Integration]
GRANT EXECUTE ON [${flyway:defaultSchema}].[spDeleteRubricEvaluation] TO [cdp_Developer], [cdp_Integration];

/* spDelete Permissions for MJ: Rubric Evaluations */

REVOKE EXECUTE ON [${flyway:defaultSchema}].[spDeleteRubricEvaluation] FROM [cdp_Developer]
REVOKE EXECUTE ON [${flyway:defaultSchema}].[spDeleteRubricEvaluation] FROM [cdp_Integration]
GRANT EXECUTE ON [${flyway:defaultSchema}].[spDeleteRubricEvaluation] TO [cdp_Developer], [cdp_Integration];

