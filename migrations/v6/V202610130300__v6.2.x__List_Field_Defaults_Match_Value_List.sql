-- =============================================================================
-- Eight List fields whose default is not one of their own values (MJ #3985)
-- =============================================================================
--
-- A List field's values come from its CHECK constraint, and spCreate{Table} applies the column
-- default through ISNULL(@Param, <default>). So a default outside the CHECK is refused whenever a
-- create omits the field: by SQL Server, and since #3972 by EntityField.Validate() first.
--
--   Entity / field                      Default          CHECK / value list           Fix
--   QueueTask.Status                    Pending          In Progress|Completed|Failed  CHECK gains Pending;
--                                                                                      column nchar(10) -> nvarchar(20)
--   AuditLog.Status                     Allow            Success|Failed                default -> Success
--   AuthorizationRole.Type              grant            Allow|Deny                    default -> Allow
--   RecordMergeLog.ProcessingStatus     Pending          Started|Complete|Error        default -> Started
--   VersionInstallation.Type            System           New|Upgrade                   default -> New
--   ConversationDetail.Role             user_name()      User|AI|Error                 default -> User
--   EntityAIAction.TriggerEvent         After Save       before save|after save        default -> after save
--   EntityAIAction.OutputType           FIeld            entity|field                  default -> field
--
-- QueueTask is the one where the CHECK is wrong, not the default: QueueManager.AddTask writes
-- Status = 'Pending' explicitly, so every queued task (every after-save Entity AI Action) fails the
-- CHECK today. Its column is also widened: nchar(10) cannot hold the listed 'In Progress' (11 chars). Every other default is either a leftover from an older vocabulary or, for the two
-- EntityAIAction fields, a case variant SQL Server's collation accepts but the generated union and
-- a PostgreSQL CHECK do not.
--
-- Changing a default is not enough to get the new spCreate into this migration: R__RefreshMetadata
-- syncs EntityField.DefaultValue before CodeGen runs, so the entity is not seen as modified, and
-- CodeGen leaves the regenerated procedure out of its SQL capture (#5636). The six affected spCreate
-- procedures are dropped here so CodeGen's missing-procedure self-heal recreates and captures them
-- (the same approach as V202610122148). spUpdate needs no change for a default: it merges with
-- ISNULL(@Param, [Column]). The QueueTask widen is a type change, which CodeGen does not regenerate
-- at all once metadata is synced, so spCreateQueueTask and spUpdateQueueTask are dropped as well.
--
-- The two EntityAIAction fixes are case-only, and spUpdateExistingEntityFieldsFromSchema compared
-- DefaultValue under the database's case-insensitive collation, so it never synced a case-only
-- change into metadata. Section 1 makes that comparison case-sensitive.
-- =============================================================================

-- 1. spUpdateExistingEntityFieldsFromSchema: compare DefaultValue case-sensitively.
--    Copied from V202609081500 (the current definition) with ONLY the DefaultValue predicate changed.
--    Without it the two EntityAIAction case fixes below never reach EntityField.DefaultValue, so
--    CodeGen keeps emitting ISNULL(@TriggerEvent, 'After Save') / ISNULL(@OutputType, 'FIeld').
--    On MJ core this changes exactly those two fields (measured: no other default differs only in case).
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
          -- Case-sensitive (MJ #3985): under the database's CI collation a default changed only in case
          -- never synced, so spCreate and the generated types kept the old casing. The PostgreSQL twin
          -- (CodeGenLib metadataSupportObjects.ts, fnDefaultValueChanged) gets the same fix.
          ISNULL(LTRIM(RTRIM(ef.DefaultValue)), '') COLLATE Latin1_General_CS_AS <> ISNULL(LTRIM(RTRIM(CONVERT(NVARCHAR(MAX), fromSQL.DefaultValue))), '') OR
          ef.AutoIncrement <> fromSQL.AutoIncrement OR
          ef.IsVirtual <> fromSQL.IsVirtual OR
          ef.IsComputed <> fromSQL.IsComputed OR
          ef.Sequence <> fromSQL.Sequence OR
          -- Soft-FK guard: wrap RelatedEntity* predicates to respect AutoUpdateRelatedEntityInfo and IsSoftForeignKey
          (ef.AutoUpdateRelatedEntityInfo = 1 AND ef.IsSoftForeignKey = 0 AND (
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
        -- Soft-FK guard: preserve soft FKs
        ef.RelatedEntityID = IIF(ef.AutoUpdateRelatedEntityInfo = 1 AND ef.IsSoftForeignKey = 0, fr.RelatedEntityID, ef.RelatedEntityID),
        ef.RelatedEntityFieldName = IIF(ef.AutoUpdateRelatedEntityInfo = 1 AND ef.IsSoftForeignKey = 0, fr.RelatedEntityFieldName, ef.RelatedEntityFieldName),
        -- Soft-PK guard: preserve soft PKs
        ef.IsPrimaryKey = fr.IsPrimaryKey,
        ef.IsUnique = fr.IsUnique,
        ef.AllowUpdateAPI = IIF(fr.IsVirtual = 1 AND ef.IsVirtual = 0, 0, ef.AllowUpdateAPI),
        ef.__mj_UpdatedAt = GETUTCDATE()
    FROM
        [${flyway:defaultSchema}].EntityField ef
    INNER JOIN
        @FilteredRows fr ON ef.ID = fr.EntityFieldID;

    SELECT * FROM @FilteredRows;
END;
GO
GRANT EXECUTE ON [${flyway:defaultSchema}].[spUpdateExistingEntityFieldsFromSchema] TO [cdp_Developer], [cdp_Integration];
GO

-- 2. The defaults and the one CHECK.
-- QueueTask.Status: allow the 'Pending' state the queue writes and the default already produces,
-- and widen nchar(10) -> nvarchar(20) so the listed 'In Progress' (11 chars) can be stored.
ALTER TABLE [${flyway:defaultSchema}].[QueueTask] DROP CONSTRAINT [CK_QueueTask_Status];
ALTER TABLE [${flyway:defaultSchema}].[QueueTask] DROP CONSTRAINT [DF_QueueTask_Status];
ALTER TABLE [${flyway:defaultSchema}].[QueueTask] ALTER COLUMN [Status] NVARCHAR(20) NOT NULL;
GO
-- nchar padded every value to 10 characters, and the type change keeps that padding.
UPDATE [${flyway:defaultSchema}].[QueueTask] SET [Status] = RTRIM([Status]) WHERE DATALENGTH([Status]) <> DATALENGTH(RTRIM([Status]));
ALTER TABLE [${flyway:defaultSchema}].[QueueTask] ADD CONSTRAINT [DF_QueueTask_Status] DEFAULT (N'Pending') FOR [Status];
ALTER TABLE [${flyway:defaultSchema}].[QueueTask] ADD CONSTRAINT [CK_QueueTask_Status]
    CHECK ([Status] IN ('Pending', 'In Progress', 'Completed', 'Failed'));
GO

ALTER TABLE [${flyway:defaultSchema}].[AuditLog] DROP CONSTRAINT [DF_AuditLog_Status];
ALTER TABLE [${flyway:defaultSchema}].[AuditLog] ADD CONSTRAINT [DF_AuditLog_Status] DEFAULT (N'Success') FOR [Status];

ALTER TABLE [${flyway:defaultSchema}].[AuthorizationRole] DROP CONSTRAINT [DF_AuthorizationRole_Type];
ALTER TABLE [${flyway:defaultSchema}].[AuthorizationRole] ADD CONSTRAINT [DF_AuthorizationRole_Type] DEFAULT (N'Allow') FOR [Type];

ALTER TABLE [${flyway:defaultSchema}].[RecordMergeLog] DROP CONSTRAINT [DF_RecordMergeLog_Status];
ALTER TABLE [${flyway:defaultSchema}].[RecordMergeLog] ADD CONSTRAINT [DF_RecordMergeLog_Status] DEFAULT (N'Started') FOR [ProcessingStatus];

ALTER TABLE [${flyway:defaultSchema}].[VersionInstallation] DROP CONSTRAINT [DF_VersionInstallation_Type];
ALTER TABLE [${flyway:defaultSchema}].[VersionInstallation] ADD CONSTRAINT [DF_VersionInstallation_Type] DEFAULT (N'New') FOR [Type];

ALTER TABLE [${flyway:defaultSchema}].[ConversationDetail] DROP CONSTRAINT [DF_ConversationDetail_Role];
ALTER TABLE [${flyway:defaultSchema}].[ConversationDetail] ADD CONSTRAINT [DF_ConversationDetail_Role] DEFAULT (N'User') FOR [Role];

ALTER TABLE [${flyway:defaultSchema}].[EntityAIAction] DROP CONSTRAINT [DF_EntityAIAction_ExecutionTiming];
ALTER TABLE [${flyway:defaultSchema}].[EntityAIAction] ADD CONSTRAINT [DF_EntityAIAction_ExecutionTiming] DEFAULT (N'after save') FOR [TriggerEvent];

ALTER TABLE [${flyway:defaultSchema}].[EntityAIAction] DROP CONSTRAINT [DF_EntityAIAction_OutputRoute];
ALTER TABLE [${flyway:defaultSchema}].[EntityAIAction] ADD CONSTRAINT [DF_EntityAIAction_OutputRoute] DEFAULT (N'field') FOR [OutputType];
GO

-- 3. Drop the create procedures that embed the old defaults; CodeGen recreates them (output below).
DROP PROCEDURE [${flyway:defaultSchema}].[spCreateAuditLog];
DROP PROCEDURE [${flyway:defaultSchema}].[spCreateAuthorizationRole];
DROP PROCEDURE [${flyway:defaultSchema}].[spCreateRecordMergeLog];
DROP PROCEDURE [${flyway:defaultSchema}].[spCreateVersionInstallation];
DROP PROCEDURE [${flyway:defaultSchema}].[spCreateConversationDetail];
DROP PROCEDURE [${flyway:defaultSchema}].[spCreateEntityAIAction];
-- QueueTask's create/update take @Status NCHAR(10); the widened column needs them regenerated too.
DROP PROCEDURE [${flyway:defaultSchema}].[spCreateQueueTask];
DROP PROCEDURE [${flyway:defaultSchema}].[spUpdateQueueTask];
GO























































-- =============================================================================
-- =============================================================================
-- =============================================================================
--
--                    CODEGEN OUTPUT BELOW THIS LINE
--
-- Everything below this block was generated by the MemberJunction CodeGen tool
-- after the hand-written DDL above was applied to a database built from migrations.
-- It contains the 'Pending' EntityFieldValue row CodeGen derived from the widened
-- CK_QueueTask_Status, and the regenerated spCreate procedures (plus spUpdateQueueTask,
-- for the widened Status column) with their permission grants.
--
-- DO NOT EDIT BY HAND. If the hand-written DDL above changes, re-run CodeGen
-- and replace this entire section with the fresh output.
--
-- =============================================================================
-- =============================================================================
-- =============================================================================
/* SQL text to insert entity field value with ID fdd87531-528f-4348-bac1-79d0c170de9d */
INSERT INTO [${flyway:defaultSchema}].[EntityFieldValue]
                                       ([ID], [EntityFieldID], [Sequence], [Value], [Code], [__mj_CreatedAt], [__mj_UpdatedAt])
                                    VALUES
                                       ('fdd87531-528f-4348-bac1-79d0c170de9d', 'DC4D17F0-6F36-EF11-86D4-6045BDEE16E6', 4, 'Pending', 'Pending', GETUTCDATE(), GETUTCDATE());

/* spCreate SQL for MJ: Audit Logs */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Audit Logs
-- Item: spCreateAuditLog
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- CREATE PROCEDURE FOR AuditLog
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[spCreateAuditLog]', 'P') IS NOT NULL
    DROP PROCEDURE [${flyway:defaultSchema}].[spCreateAuditLog];
GO

CREATE PROCEDURE [${flyway:defaultSchema}].[spCreateAuditLog]
    @ID uniqueidentifier = NULL,
    @UserID uniqueidentifier,
    @AuditLogTypeID uniqueidentifier,
    @AuthorizationID_Clear bit = 0,
    @AuthorizationID uniqueidentifier = NULL,
    @Status nvarchar(50) = NULL,
    @Description_Clear bit = 0,
    @Description nvarchar(MAX) = NULL,
    @Details_Clear bit = 0,
    @Details nvarchar(MAX) = NULL,
    @EntityID_Clear bit = 0,
    @EntityID uniqueidentifier = NULL,
    @RecordID_Clear bit = 0,
    @RecordID nvarchar(450) = NULL
AS
BEGIN
    SET NOCOUNT ON;
    DECLARE @InsertedRow TABLE ([ID] UNIQUEIDENTIFIER)

    IF @ID IS NOT NULL
    BEGIN
        -- User provided a value, use it
        INSERT INTO [${flyway:defaultSchema}].[AuditLog]
            (
                [ID],
                [UserID],
                [AuditLogTypeID],
                [AuthorizationID],
                [Status],
                [Description],
                [Details],
                [EntityID],
                [RecordID]
            )
        OUTPUT INSERTED.[ID] INTO @InsertedRow
        VALUES
            (
                @ID,
                @UserID,
                @AuditLogTypeID,
                CASE WHEN @AuthorizationID_Clear = 1 THEN NULL ELSE ISNULL(@AuthorizationID, NULL) END,
                ISNULL(@Status, 'Success'),
                CASE WHEN @Description_Clear = 1 THEN NULL ELSE ISNULL(@Description, NULL) END,
                CASE WHEN @Details_Clear = 1 THEN NULL ELSE ISNULL(@Details, NULL) END,
                CASE WHEN @EntityID_Clear = 1 THEN NULL ELSE ISNULL(@EntityID, NULL) END,
                CASE WHEN @RecordID_Clear = 1 THEN NULL ELSE ISNULL(@RecordID, NULL) END
            )
    END
    ELSE
    BEGIN
        -- No value provided, let database use its default (e.g., NEWSEQUENTIALID())
        INSERT INTO [${flyway:defaultSchema}].[AuditLog]
            (
                [UserID],
                [AuditLogTypeID],
                [AuthorizationID],
                [Status],
                [Description],
                [Details],
                [EntityID],
                [RecordID]
            )
        OUTPUT INSERTED.[ID] INTO @InsertedRow
        VALUES
            (
                @UserID,
                @AuditLogTypeID,
                CASE WHEN @AuthorizationID_Clear = 1 THEN NULL ELSE ISNULL(@AuthorizationID, NULL) END,
                ISNULL(@Status, 'Success'),
                CASE WHEN @Description_Clear = 1 THEN NULL ELSE ISNULL(@Description, NULL) END,
                CASE WHEN @Details_Clear = 1 THEN NULL ELSE ISNULL(@Details, NULL) END,
                CASE WHEN @EntityID_Clear = 1 THEN NULL ELSE ISNULL(@EntityID, NULL) END,
                CASE WHEN @RecordID_Clear = 1 THEN NULL ELSE ISNULL(@RecordID, NULL) END
            )
    END
    -- return the new record from the base view, which might have some calculated fields
    SELECT * FROM [${flyway:defaultSchema}].[vwAuditLogs] WHERE [ID] = (SELECT [ID] FROM @InsertedRow)
END
GO
GRANT EXECUTE ON [${flyway:defaultSchema}].[spCreateAuditLog] TO [cdp_UI], [cdp_Developer], [cdp_Integration];

/* spCreate Permissions for MJ: Audit Logs */

GRANT EXECUTE ON [${flyway:defaultSchema}].[spCreateAuditLog] TO [cdp_UI], [cdp_Developer], [cdp_Integration];

/* spCreate SQL for MJ: Authorization Roles */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Authorization Roles
-- Item: spCreateAuthorizationRole
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- CREATE PROCEDURE FOR AuthorizationRole
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[spCreateAuthorizationRole]', 'P') IS NOT NULL
    DROP PROCEDURE [${flyway:defaultSchema}].[spCreateAuthorizationRole];
GO

CREATE PROCEDURE [${flyway:defaultSchema}].[spCreateAuthorizationRole]
    @ID uniqueidentifier = NULL,
    @AuthorizationID uniqueidentifier,
    @RoleID uniqueidentifier,
    @Type nchar(10) = NULL
AS
BEGIN
    SET NOCOUNT ON;
    DECLARE @InsertedRow TABLE ([ID] UNIQUEIDENTIFIER)

    IF @ID IS NOT NULL
    BEGIN
        -- User provided a value, use it
        INSERT INTO [${flyway:defaultSchema}].[AuthorizationRole]
            (
                [ID],
                [AuthorizationID],
                [RoleID],
                [Type]
            )
        OUTPUT INSERTED.[ID] INTO @InsertedRow
        VALUES
            (
                @ID,
                @AuthorizationID,
                @RoleID,
                ISNULL(@Type, 'Allow')
            )
    END
    ELSE
    BEGIN
        -- No value provided, let database use its default (e.g., NEWSEQUENTIALID())
        INSERT INTO [${flyway:defaultSchema}].[AuthorizationRole]
            (
                [AuthorizationID],
                [RoleID],
                [Type]
            )
        OUTPUT INSERTED.[ID] INTO @InsertedRow
        VALUES
            (
                @AuthorizationID,
                @RoleID,
                ISNULL(@Type, 'Allow')
            )
    END
    -- return the new record from the base view, which might have some calculated fields
    SELECT * FROM [${flyway:defaultSchema}].[vwAuthorizationRoles] WHERE [ID] = (SELECT [ID] FROM @InsertedRow)
END
GO
GRANT EXECUTE ON [${flyway:defaultSchema}].[spCreateAuthorizationRole] TO [cdp_Developer];

/* spCreate Permissions for MJ: Authorization Roles */

GRANT EXECUTE ON [${flyway:defaultSchema}].[spCreateAuthorizationRole] TO [cdp_Developer];

/* spCreate SQL for MJ: Conversation Details */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Conversation Details
-- Item: spCreateConversationDetail
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- CREATE PROCEDURE FOR ConversationDetail
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[spCreateConversationDetail]', 'P') IS NOT NULL
    DROP PROCEDURE [${flyway:defaultSchema}].[spCreateConversationDetail];
GO

CREATE PROCEDURE [${flyway:defaultSchema}].[spCreateConversationDetail]
    @ID uniqueidentifier = NULL,
    @ConversationID uniqueidentifier,
    @ExternalID_Clear bit = 0,
    @ExternalID nvarchar(100) = NULL,
    @Role nvarchar(20) = NULL,
    @Message nvarchar(MAX),
    @Error_Clear bit = 0,
    @Error nvarchar(MAX) = NULL,
    @HiddenToUser bit = NULL,
    @UserRating_Clear bit = 0,
    @UserRating int = NULL,
    @UserFeedback_Clear bit = 0,
    @UserFeedback nvarchar(MAX) = NULL,
    @ReflectionInsights_Clear bit = 0,
    @ReflectionInsights nvarchar(MAX) = NULL,
    @SummaryOfEarlierConversation_Clear bit = 0,
    @SummaryOfEarlierConversation nvarchar(MAX) = NULL,
    @UserID_Clear bit = 0,
    @UserID uniqueidentifier = NULL,
    @ArtifactID_Clear bit = 0,
    @ArtifactID uniqueidentifier = NULL,
    @ArtifactVersionID_Clear bit = 0,
    @ArtifactVersionID uniqueidentifier = NULL,
    @CompletionTime_Clear bit = 0,
    @CompletionTime bigint = NULL,
    @IsPinned bit = NULL,
    @ParentID_Clear bit = 0,
    @ParentID uniqueidentifier = NULL,
    @AgentID_Clear bit = 0,
    @AgentID uniqueidentifier = NULL,
    @Status nvarchar(20) = NULL,
    @SuggestedResponses_Clear bit = 0,
    @SuggestedResponses nvarchar(MAX) = NULL,
    @TestRunID_Clear bit = 0,
    @TestRunID uniqueidentifier = NULL,
    @ResponseForm_Clear bit = 0,
    @ResponseForm nvarchar(MAX) = NULL,
    @ActionableCommands_Clear bit = 0,
    @ActionableCommands nvarchar(MAX) = NULL,
    @AutomaticCommands_Clear bit = 0,
    @AutomaticCommands nvarchar(MAX) = NULL,
    @OriginalMessageChanged bit = NULL,
    @AgentSessionID_Clear bit = 0,
    @AgentSessionID uniqueidentifier = NULL,
    @TurnEndedAt_Clear bit = 0,
    @TurnEndedAt datetimeoffset = NULL,
    @UtteranceStartMs_Clear bit = 0,
    @UtteranceStartMs int = NULL,
    @UtteranceEndMs_Clear bit = 0,
    @UtteranceEndMs int = NULL,
    @MediaType_Clear bit = 0,
    @MediaType nvarchar(20) = NULL,
    @BranchID_Clear bit = 0,
    @BranchID uniqueidentifier = NULL,
    @ReplacedAt_Clear bit = 0,
    @ReplacedAt datetimeoffset = NULL
AS
BEGIN
    SET NOCOUNT ON;
    DECLARE @InsertedRow TABLE ([ID] UNIQUEIDENTIFIER)

    IF @ID IS NOT NULL
    BEGIN
        -- User provided a value, use it
        INSERT INTO [${flyway:defaultSchema}].[ConversationDetail]
            (
                [ID],
                [ConversationID],
                [ExternalID],
                [Role],
                [Message],
                [Error],
                [HiddenToUser],
                [UserRating],
                [UserFeedback],
                [ReflectionInsights],
                [SummaryOfEarlierConversation],
                [UserID],
                [ArtifactID],
                [ArtifactVersionID],
                [CompletionTime],
                [IsPinned],
                [ParentID],
                [AgentID],
                [Status],
                [SuggestedResponses],
                [TestRunID],
                [ResponseForm],
                [ActionableCommands],
                [AutomaticCommands],
                [OriginalMessageChanged],
                [AgentSessionID],
                [TurnEndedAt],
                [UtteranceStartMs],
                [UtteranceEndMs],
                [MediaType],
                [BranchID],
                [ReplacedAt]
            )
        OUTPUT INSERTED.[ID] INTO @InsertedRow
        VALUES
            (
                @ID,
                @ConversationID,
                CASE WHEN @ExternalID_Clear = 1 THEN NULL ELSE ISNULL(@ExternalID, NULL) END,
                ISNULL(@Role, 'User'),
                @Message,
                CASE WHEN @Error_Clear = 1 THEN NULL ELSE ISNULL(@Error, NULL) END,
                ISNULL(@HiddenToUser, 0),
                CASE WHEN @UserRating_Clear = 1 THEN NULL ELSE ISNULL(@UserRating, NULL) END,
                CASE WHEN @UserFeedback_Clear = 1 THEN NULL ELSE ISNULL(@UserFeedback, NULL) END,
                CASE WHEN @ReflectionInsights_Clear = 1 THEN NULL ELSE ISNULL(@ReflectionInsights, NULL) END,
                CASE WHEN @SummaryOfEarlierConversation_Clear = 1 THEN NULL ELSE ISNULL(@SummaryOfEarlierConversation, NULL) END,
                CASE WHEN @UserID_Clear = 1 THEN NULL ELSE ISNULL(@UserID, NULL) END,
                CASE WHEN @ArtifactID_Clear = 1 THEN NULL ELSE ISNULL(@ArtifactID, NULL) END,
                CASE WHEN @ArtifactVersionID_Clear = 1 THEN NULL ELSE ISNULL(@ArtifactVersionID, NULL) END,
                CASE WHEN @CompletionTime_Clear = 1 THEN NULL ELSE ISNULL(@CompletionTime, NULL) END,
                ISNULL(@IsPinned, 0),
                CASE WHEN @ParentID_Clear = 1 THEN NULL ELSE ISNULL(@ParentID, NULL) END,
                CASE WHEN @AgentID_Clear = 1 THEN NULL ELSE ISNULL(@AgentID, NULL) END,
                ISNULL(@Status, 'Complete'),
                CASE WHEN @SuggestedResponses_Clear = 1 THEN NULL ELSE ISNULL(@SuggestedResponses, NULL) END,
                CASE WHEN @TestRunID_Clear = 1 THEN NULL ELSE ISNULL(@TestRunID, NULL) END,
                CASE WHEN @ResponseForm_Clear = 1 THEN NULL ELSE ISNULL(@ResponseForm, NULL) END,
                CASE WHEN @ActionableCommands_Clear = 1 THEN NULL ELSE ISNULL(@ActionableCommands, NULL) END,
                CASE WHEN @AutomaticCommands_Clear = 1 THEN NULL ELSE ISNULL(@AutomaticCommands, NULL) END,
                ISNULL(@OriginalMessageChanged, 0),
                CASE WHEN @AgentSessionID_Clear = 1 THEN NULL ELSE ISNULL(@AgentSessionID, NULL) END,
                CASE WHEN @TurnEndedAt_Clear = 1 THEN NULL ELSE ISNULL(@TurnEndedAt, NULL) END,
                CASE WHEN @UtteranceStartMs_Clear = 1 THEN NULL ELSE ISNULL(@UtteranceStartMs, NULL) END,
                CASE WHEN @UtteranceEndMs_Clear = 1 THEN NULL ELSE ISNULL(@UtteranceEndMs, NULL) END,
                CASE WHEN @MediaType_Clear = 1 THEN NULL ELSE ISNULL(@MediaType, NULL) END,
                CASE WHEN @BranchID_Clear = 1 THEN NULL ELSE ISNULL(@BranchID, NULL) END,
                CASE WHEN @ReplacedAt_Clear = 1 THEN NULL ELSE ISNULL(@ReplacedAt, NULL) END
            )
    END
    ELSE
    BEGIN
        -- No value provided, let database use its default (e.g., NEWSEQUENTIALID())
        INSERT INTO [${flyway:defaultSchema}].[ConversationDetail]
            (
                [ConversationID],
                [ExternalID],
                [Role],
                [Message],
                [Error],
                [HiddenToUser],
                [UserRating],
                [UserFeedback],
                [ReflectionInsights],
                [SummaryOfEarlierConversation],
                [UserID],
                [ArtifactID],
                [ArtifactVersionID],
                [CompletionTime],
                [IsPinned],
                [ParentID],
                [AgentID],
                [Status],
                [SuggestedResponses],
                [TestRunID],
                [ResponseForm],
                [ActionableCommands],
                [AutomaticCommands],
                [OriginalMessageChanged],
                [AgentSessionID],
                [TurnEndedAt],
                [UtteranceStartMs],
                [UtteranceEndMs],
                [MediaType],
                [BranchID],
                [ReplacedAt]
            )
        OUTPUT INSERTED.[ID] INTO @InsertedRow
        VALUES
            (
                @ConversationID,
                CASE WHEN @ExternalID_Clear = 1 THEN NULL ELSE ISNULL(@ExternalID, NULL) END,
                ISNULL(@Role, 'User'),
                @Message,
                CASE WHEN @Error_Clear = 1 THEN NULL ELSE ISNULL(@Error, NULL) END,
                ISNULL(@HiddenToUser, 0),
                CASE WHEN @UserRating_Clear = 1 THEN NULL ELSE ISNULL(@UserRating, NULL) END,
                CASE WHEN @UserFeedback_Clear = 1 THEN NULL ELSE ISNULL(@UserFeedback, NULL) END,
                CASE WHEN @ReflectionInsights_Clear = 1 THEN NULL ELSE ISNULL(@ReflectionInsights, NULL) END,
                CASE WHEN @SummaryOfEarlierConversation_Clear = 1 THEN NULL ELSE ISNULL(@SummaryOfEarlierConversation, NULL) END,
                CASE WHEN @UserID_Clear = 1 THEN NULL ELSE ISNULL(@UserID, NULL) END,
                CASE WHEN @ArtifactID_Clear = 1 THEN NULL ELSE ISNULL(@ArtifactID, NULL) END,
                CASE WHEN @ArtifactVersionID_Clear = 1 THEN NULL ELSE ISNULL(@ArtifactVersionID, NULL) END,
                CASE WHEN @CompletionTime_Clear = 1 THEN NULL ELSE ISNULL(@CompletionTime, NULL) END,
                ISNULL(@IsPinned, 0),
                CASE WHEN @ParentID_Clear = 1 THEN NULL ELSE ISNULL(@ParentID, NULL) END,
                CASE WHEN @AgentID_Clear = 1 THEN NULL ELSE ISNULL(@AgentID, NULL) END,
                ISNULL(@Status, 'Complete'),
                CASE WHEN @SuggestedResponses_Clear = 1 THEN NULL ELSE ISNULL(@SuggestedResponses, NULL) END,
                CASE WHEN @TestRunID_Clear = 1 THEN NULL ELSE ISNULL(@TestRunID, NULL) END,
                CASE WHEN @ResponseForm_Clear = 1 THEN NULL ELSE ISNULL(@ResponseForm, NULL) END,
                CASE WHEN @ActionableCommands_Clear = 1 THEN NULL ELSE ISNULL(@ActionableCommands, NULL) END,
                CASE WHEN @AutomaticCommands_Clear = 1 THEN NULL ELSE ISNULL(@AutomaticCommands, NULL) END,
                ISNULL(@OriginalMessageChanged, 0),
                CASE WHEN @AgentSessionID_Clear = 1 THEN NULL ELSE ISNULL(@AgentSessionID, NULL) END,
                CASE WHEN @TurnEndedAt_Clear = 1 THEN NULL ELSE ISNULL(@TurnEndedAt, NULL) END,
                CASE WHEN @UtteranceStartMs_Clear = 1 THEN NULL ELSE ISNULL(@UtteranceStartMs, NULL) END,
                CASE WHEN @UtteranceEndMs_Clear = 1 THEN NULL ELSE ISNULL(@UtteranceEndMs, NULL) END,
                CASE WHEN @MediaType_Clear = 1 THEN NULL ELSE ISNULL(@MediaType, NULL) END,
                CASE WHEN @BranchID_Clear = 1 THEN NULL ELSE ISNULL(@BranchID, NULL) END,
                CASE WHEN @ReplacedAt_Clear = 1 THEN NULL ELSE ISNULL(@ReplacedAt, NULL) END
            )
    END
    -- return the new record from the base view, which might have some calculated fields
    SELECT * FROM [${flyway:defaultSchema}].[vwConversationDetails] WHERE [ID] = (SELECT [ID] FROM @InsertedRow)
END
GO
GRANT EXECUTE ON [${flyway:defaultSchema}].[spCreateConversationDetail] TO [cdp_Developer], [cdp_UI], [cdp_Integration];

/* spCreate Permissions for MJ: Conversation Details */

GRANT EXECUTE ON [${flyway:defaultSchema}].[spCreateConversationDetail] TO [cdp_Developer], [cdp_UI], [cdp_Integration];

/* spCreate SQL for MJ: Entity AI Actions */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Entity AI Actions
-- Item: spCreateEntityAIAction
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- CREATE PROCEDURE FOR EntityAIAction
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[spCreateEntityAIAction]', 'P') IS NOT NULL
    DROP PROCEDURE [${flyway:defaultSchema}].[spCreateEntityAIAction];
GO

CREATE PROCEDURE [${flyway:defaultSchema}].[spCreateEntityAIAction]
    @ID uniqueidentifier = NULL,
    @EntityID uniqueidentifier,
    @AIModelID uniqueidentifier,
    @AIActionID uniqueidentifier,
    @Name nvarchar(255),
    @Prompt_Clear bit = 0,
    @Prompt nvarchar(MAX) = NULL,
    @TriggerEvent nchar(15) = NULL,
    @UserMessage nvarchar(MAX),
    @OutputType nchar(10) = NULL,
    @OutputField_Clear bit = 0,
    @OutputField nvarchar(50) = NULL,
    @SkipIfOutputFieldNotEmpty bit = NULL,
    @OutputEntityID_Clear bit = 0,
    @OutputEntityID uniqueidentifier = NULL,
    @Comments_Clear bit = 0,
    @Comments nvarchar(MAX) = NULL
AS
BEGIN
    SET NOCOUNT ON;
    DECLARE @InsertedRow TABLE ([ID] UNIQUEIDENTIFIER)

    IF @ID IS NOT NULL
    BEGIN
        -- User provided a value, use it
        INSERT INTO [${flyway:defaultSchema}].[EntityAIAction]
            (
                [ID],
                [EntityID],
                [AIModelID],
                [AIActionID],
                [Name],
                [Prompt],
                [TriggerEvent],
                [UserMessage],
                [OutputType],
                [OutputField],
                [SkipIfOutputFieldNotEmpty],
                [OutputEntityID],
                [Comments]
            )
        OUTPUT INSERTED.[ID] INTO @InsertedRow
        VALUES
            (
                @ID,
                @EntityID,
                @AIModelID,
                @AIActionID,
                @Name,
                CASE WHEN @Prompt_Clear = 1 THEN NULL ELSE ISNULL(@Prompt, NULL) END,
                ISNULL(@TriggerEvent, 'after save'),
                @UserMessage,
                ISNULL(@OutputType, 'field'),
                CASE WHEN @OutputField_Clear = 1 THEN NULL ELSE ISNULL(@OutputField, NULL) END,
                ISNULL(@SkipIfOutputFieldNotEmpty, 1),
                CASE WHEN @OutputEntityID_Clear = 1 THEN NULL ELSE ISNULL(@OutputEntityID, NULL) END,
                CASE WHEN @Comments_Clear = 1 THEN NULL ELSE ISNULL(@Comments, NULL) END
            )
    END
    ELSE
    BEGIN
        -- No value provided, let database use its default (e.g., NEWSEQUENTIALID())
        INSERT INTO [${flyway:defaultSchema}].[EntityAIAction]
            (
                [EntityID],
                [AIModelID],
                [AIActionID],
                [Name],
                [Prompt],
                [TriggerEvent],
                [UserMessage],
                [OutputType],
                [OutputField],
                [SkipIfOutputFieldNotEmpty],
                [OutputEntityID],
                [Comments]
            )
        OUTPUT INSERTED.[ID] INTO @InsertedRow
        VALUES
            (
                @EntityID,
                @AIModelID,
                @AIActionID,
                @Name,
                CASE WHEN @Prompt_Clear = 1 THEN NULL ELSE ISNULL(@Prompt, NULL) END,
                ISNULL(@TriggerEvent, 'after save'),
                @UserMessage,
                ISNULL(@OutputType, 'field'),
                CASE WHEN @OutputField_Clear = 1 THEN NULL ELSE ISNULL(@OutputField, NULL) END,
                ISNULL(@SkipIfOutputFieldNotEmpty, 1),
                CASE WHEN @OutputEntityID_Clear = 1 THEN NULL ELSE ISNULL(@OutputEntityID, NULL) END,
                CASE WHEN @Comments_Clear = 1 THEN NULL ELSE ISNULL(@Comments, NULL) END
            )
    END
    -- return the new record from the base view, which might have some calculated fields
    SELECT * FROM [${flyway:defaultSchema}].[vwEntityAIActions] WHERE [ID] = (SELECT [ID] FROM @InsertedRow)
END
GO
GRANT EXECUTE ON [${flyway:defaultSchema}].[spCreateEntityAIAction] TO [cdp_Integration], [cdp_Developer];

/* spCreate Permissions for MJ: Entity AI Actions */

GRANT EXECUTE ON [${flyway:defaultSchema}].[spCreateEntityAIAction] TO [cdp_Integration], [cdp_Developer];

/* spCreate SQL for MJ: Queue Tasks */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Queue Tasks
-- Item: spCreateQueueTask
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- CREATE PROCEDURE FOR QueueTask
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[spCreateQueueTask]', 'P') IS NOT NULL
    DROP PROCEDURE [${flyway:defaultSchema}].[spCreateQueueTask];
GO

CREATE PROCEDURE [${flyway:defaultSchema}].[spCreateQueueTask]
    @ID uniqueidentifier = NULL,
    @QueueID uniqueidentifier,
    @Status nvarchar(20) = NULL,
    @StartedAt_Clear bit = 0,
    @StartedAt datetimeoffset = NULL,
    @EndedAt_Clear bit = 0,
    @EndedAt datetimeoffset = NULL,
    @Data_Clear bit = 0,
    @Data nvarchar(MAX) = NULL,
    @Options_Clear bit = 0,
    @Options nvarchar(MAX) = NULL,
    @Output_Clear bit = 0,
    @Output nvarchar(MAX) = NULL,
    @ErrorMessage_Clear bit = 0,
    @ErrorMessage nvarchar(MAX) = NULL,
    @Comments_Clear bit = 0,
    @Comments nvarchar(MAX) = NULL
AS
BEGIN
    SET NOCOUNT ON;
    DECLARE @InsertedRow TABLE ([ID] UNIQUEIDENTIFIER)

    IF @ID IS NOT NULL
    BEGIN
        -- User provided a value, use it
        INSERT INTO [${flyway:defaultSchema}].[QueueTask]
            (
                [ID],
                [QueueID],
                [Status],
                [StartedAt],
                [EndedAt],
                [Data],
                [Options],
                [Output],
                [ErrorMessage],
                [Comments]
            )
        OUTPUT INSERTED.[ID] INTO @InsertedRow
        VALUES
            (
                @ID,
                @QueueID,
                ISNULL(@Status, 'Pending'),
                CASE WHEN @StartedAt_Clear = 1 THEN NULL ELSE ISNULL(@StartedAt, NULL) END,
                CASE WHEN @EndedAt_Clear = 1 THEN NULL ELSE ISNULL(@EndedAt, NULL) END,
                CASE WHEN @Data_Clear = 1 THEN NULL ELSE ISNULL(@Data, NULL) END,
                CASE WHEN @Options_Clear = 1 THEN NULL ELSE ISNULL(@Options, NULL) END,
                CASE WHEN @Output_Clear = 1 THEN NULL ELSE ISNULL(@Output, NULL) END,
                CASE WHEN @ErrorMessage_Clear = 1 THEN NULL ELSE ISNULL(@ErrorMessage, NULL) END,
                CASE WHEN @Comments_Clear = 1 THEN NULL ELSE ISNULL(@Comments, NULL) END
            )
    END
    ELSE
    BEGIN
        -- No value provided, let database use its default (e.g., NEWSEQUENTIALID())
        INSERT INTO [${flyway:defaultSchema}].[QueueTask]
            (
                [QueueID],
                [Status],
                [StartedAt],
                [EndedAt],
                [Data],
                [Options],
                [Output],
                [ErrorMessage],
                [Comments]
            )
        OUTPUT INSERTED.[ID] INTO @InsertedRow
        VALUES
            (
                @QueueID,
                ISNULL(@Status, 'Pending'),
                CASE WHEN @StartedAt_Clear = 1 THEN NULL ELSE ISNULL(@StartedAt, NULL) END,
                CASE WHEN @EndedAt_Clear = 1 THEN NULL ELSE ISNULL(@EndedAt, NULL) END,
                CASE WHEN @Data_Clear = 1 THEN NULL ELSE ISNULL(@Data, NULL) END,
                CASE WHEN @Options_Clear = 1 THEN NULL ELSE ISNULL(@Options, NULL) END,
                CASE WHEN @Output_Clear = 1 THEN NULL ELSE ISNULL(@Output, NULL) END,
                CASE WHEN @ErrorMessage_Clear = 1 THEN NULL ELSE ISNULL(@ErrorMessage, NULL) END,
                CASE WHEN @Comments_Clear = 1 THEN NULL ELSE ISNULL(@Comments, NULL) END
            )
    END
    -- return the new record from the base view, which might have some calculated fields
    SELECT * FROM [${flyway:defaultSchema}].[vwQueueTasks] WHERE [ID] = (SELECT [ID] FROM @InsertedRow)
END
GO
GRANT EXECUTE ON [${flyway:defaultSchema}].[spCreateQueueTask] TO [cdp_Developer], [cdp_UI], [cdp_Integration];

/* spCreate Permissions for MJ: Queue Tasks */

GRANT EXECUTE ON [${flyway:defaultSchema}].[spCreateQueueTask] TO [cdp_Developer], [cdp_UI], [cdp_Integration];

/* spUpdate SQL for MJ: Queue Tasks */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Queue Tasks
-- Item: spUpdateQueueTask
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- UPDATE PROCEDURE FOR QueueTask
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[spUpdateQueueTask]', 'P') IS NOT NULL
    DROP PROCEDURE [${flyway:defaultSchema}].[spUpdateQueueTask];
GO

CREATE PROCEDURE [${flyway:defaultSchema}].[spUpdateQueueTask]
    @ID uniqueidentifier,
    @QueueID uniqueidentifier = NULL,
    @Status nvarchar(20) = NULL,
    @StartedAt_Clear bit = 0,
    @StartedAt datetimeoffset = NULL,
    @EndedAt_Clear bit = 0,
    @EndedAt datetimeoffset = NULL,
    @Data_Clear bit = 0,
    @Data nvarchar(MAX) = NULL,
    @Options_Clear bit = 0,
    @Options nvarchar(MAX) = NULL,
    @Output_Clear bit = 0,
    @Output nvarchar(MAX) = NULL,
    @ErrorMessage_Clear bit = 0,
    @ErrorMessage nvarchar(MAX) = NULL,
    @Comments_Clear bit = 0,
    @Comments nvarchar(MAX) = NULL
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE
        [${flyway:defaultSchema}].[QueueTask]
    SET
        [QueueID] = ISNULL(@QueueID, [QueueID]),
        [Status] = ISNULL(@Status, [Status]),
        [StartedAt] = CASE WHEN @StartedAt_Clear = 1 THEN NULL ELSE ISNULL(@StartedAt, [StartedAt]) END,
        [EndedAt] = CASE WHEN @EndedAt_Clear = 1 THEN NULL ELSE ISNULL(@EndedAt, [EndedAt]) END,
        [Data] = CASE WHEN @Data_Clear = 1 THEN NULL ELSE ISNULL(@Data, [Data]) END,
        [Options] = CASE WHEN @Options_Clear = 1 THEN NULL ELSE ISNULL(@Options, [Options]) END,
        [Output] = CASE WHEN @Output_Clear = 1 THEN NULL ELSE ISNULL(@Output, [Output]) END,
        [ErrorMessage] = CASE WHEN @ErrorMessage_Clear = 1 THEN NULL ELSE ISNULL(@ErrorMessage, [ErrorMessage]) END,
        [Comments] = CASE WHEN @Comments_Clear = 1 THEN NULL ELSE ISNULL(@Comments, [Comments]) END
    WHERE
        [ID] = @ID

    -- Check if the update was successful
    IF @@ROWCOUNT = 0
        -- Nothing was updated, return no rows, but column structure from base view intact, semantically correct this way.
        SELECT TOP 0 * FROM [${flyway:defaultSchema}].[vwQueueTasks] WHERE 1=0
    ELSE
        -- Return the updated record so the caller can see the updated values and any calculated fields
        SELECT
                                        *
                                    FROM
                                        [${flyway:defaultSchema}].[vwQueueTasks]
                                    WHERE
                                        [ID] = @ID
                                    
END
GO

GRANT EXECUTE ON [${flyway:defaultSchema}].[spUpdateQueueTask] TO [cdp_Developer], [cdp_Integration]
GO

------------------------------------------------------------
----- TRIGGER FOR __mj_UpdatedAt field for the QueueTask table
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[trgUpdateQueueTask]', 'TR') IS NOT NULL
    DROP TRIGGER [${flyway:defaultSchema}].[trgUpdateQueueTask];
GO
CREATE TRIGGER [${flyway:defaultSchema}].trgUpdateQueueTask
ON [${flyway:defaultSchema}].[QueueTask]
AFTER UPDATE
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE
        [${flyway:defaultSchema}].[QueueTask]
    SET
        __mj_UpdatedAt = GETUTCDATE()
    FROM
        [${flyway:defaultSchema}].[QueueTask] AS _organicTable
    INNER JOIN
        INSERTED AS I ON
        _organicTable.[ID] = I.[ID];
END;
GO

/* spUpdate Permissions for MJ: Queue Tasks */

GRANT EXECUTE ON [${flyway:defaultSchema}].[spUpdateQueueTask] TO [cdp_Developer], [cdp_Integration];

/* spCreate SQL for MJ: Record Merge Logs */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Record Merge Logs
-- Item: spCreateRecordMergeLog
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- CREATE PROCEDURE FOR RecordMergeLog
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[spCreateRecordMergeLog]', 'P') IS NOT NULL
    DROP PROCEDURE [${flyway:defaultSchema}].[spCreateRecordMergeLog];
GO

CREATE PROCEDURE [${flyway:defaultSchema}].[spCreateRecordMergeLog]
    @ID uniqueidentifier = NULL,
    @EntityID uniqueidentifier,
    @SurvivingRecordID nvarchar(450),
    @InitiatedByUserID uniqueidentifier,
    @ApprovalStatus nvarchar(10) = NULL,
    @ApprovedByUserID_Clear bit = 0,
    @ApprovedByUserID uniqueidentifier = NULL,
    @ProcessingStatus nvarchar(10) = NULL,
    @ProcessingStartedAt datetimeoffset = NULL,
    @ProcessingEndedAt_Clear bit = 0,
    @ProcessingEndedAt datetimeoffset = NULL,
    @ProcessingLog_Clear bit = 0,
    @ProcessingLog nvarchar(MAX) = NULL,
    @Comments_Clear bit = 0,
    @Comments nvarchar(MAX) = NULL
AS
BEGIN
    SET NOCOUNT ON;
    DECLARE @InsertedRow TABLE ([ID] UNIQUEIDENTIFIER)

    IF @ID IS NOT NULL
    BEGIN
        -- User provided a value, use it
        INSERT INTO [${flyway:defaultSchema}].[RecordMergeLog]
            (
                [ID],
                [EntityID],
                [SurvivingRecordID],
                [InitiatedByUserID],
                [ApprovalStatus],
                [ApprovedByUserID],
                [ProcessingStatus],
                [ProcessingStartedAt],
                [ProcessingEndedAt],
                [ProcessingLog],
                [Comments]
            )
        OUTPUT INSERTED.[ID] INTO @InsertedRow
        VALUES
            (
                @ID,
                @EntityID,
                @SurvivingRecordID,
                @InitiatedByUserID,
                ISNULL(@ApprovalStatus, 'Pending'),
                CASE WHEN @ApprovedByUserID_Clear = 1 THEN NULL ELSE ISNULL(@ApprovedByUserID, NULL) END,
                ISNULL(@ProcessingStatus, 'Started'),
                ISNULL(@ProcessingStartedAt, sysdatetimeoffset()),
                CASE WHEN @ProcessingEndedAt_Clear = 1 THEN NULL ELSE ISNULL(@ProcessingEndedAt, NULL) END,
                CASE WHEN @ProcessingLog_Clear = 1 THEN NULL ELSE ISNULL(@ProcessingLog, NULL) END,
                CASE WHEN @Comments_Clear = 1 THEN NULL ELSE ISNULL(@Comments, NULL) END
            )
    END
    ELSE
    BEGIN
        -- No value provided, let database use its default (e.g., NEWSEQUENTIALID())
        INSERT INTO [${flyway:defaultSchema}].[RecordMergeLog]
            (
                [EntityID],
                [SurvivingRecordID],
                [InitiatedByUserID],
                [ApprovalStatus],
                [ApprovedByUserID],
                [ProcessingStatus],
                [ProcessingStartedAt],
                [ProcessingEndedAt],
                [ProcessingLog],
                [Comments]
            )
        OUTPUT INSERTED.[ID] INTO @InsertedRow
        VALUES
            (
                @EntityID,
                @SurvivingRecordID,
                @InitiatedByUserID,
                ISNULL(@ApprovalStatus, 'Pending'),
                CASE WHEN @ApprovedByUserID_Clear = 1 THEN NULL ELSE ISNULL(@ApprovedByUserID, NULL) END,
                ISNULL(@ProcessingStatus, 'Started'),
                ISNULL(@ProcessingStartedAt, sysdatetimeoffset()),
                CASE WHEN @ProcessingEndedAt_Clear = 1 THEN NULL ELSE ISNULL(@ProcessingEndedAt, NULL) END,
                CASE WHEN @ProcessingLog_Clear = 1 THEN NULL ELSE ISNULL(@ProcessingLog, NULL) END,
                CASE WHEN @Comments_Clear = 1 THEN NULL ELSE ISNULL(@Comments, NULL) END
            )
    END
    -- return the new record from the base view, which might have some calculated fields
    SELECT * FROM [${flyway:defaultSchema}].[vwRecordMergeLogs] WHERE [ID] = (SELECT [ID] FROM @InsertedRow)
END
GO
GRANT EXECUTE ON [${flyway:defaultSchema}].[spCreateRecordMergeLog] TO [cdp_Integration], [cdp_Developer];

/* spCreate Permissions for MJ: Record Merge Logs */

GRANT EXECUTE ON [${flyway:defaultSchema}].[spCreateRecordMergeLog] TO [cdp_Integration], [cdp_Developer];

/* spCreate SQL for MJ: Version Installations */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Version Installations
-- Item: spCreateVersionInstallation
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- CREATE PROCEDURE FOR VersionInstallation
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[spCreateVersionInstallation]', 'P') IS NOT NULL
    DROP PROCEDURE [${flyway:defaultSchema}].[spCreateVersionInstallation];
GO

CREATE PROCEDURE [${flyway:defaultSchema}].[spCreateVersionInstallation]
    @ID uniqueidentifier = NULL,
    @MajorVersion int,
    @MinorVersion int,
    @PatchVersion int,
    @Type_Clear bit = 0,
    @Type nvarchar(20) = NULL,
    @InstalledAt datetimeoffset,
    @Status nvarchar(20) = NULL,
    @InstallLog_Clear bit = 0,
    @InstallLog nvarchar(MAX) = NULL,
    @Comments_Clear bit = 0,
    @Comments nvarchar(MAX) = NULL
AS
BEGIN
    SET NOCOUNT ON;
    DECLARE @InsertedRow TABLE ([ID] UNIQUEIDENTIFIER)

    IF @ID IS NOT NULL
    BEGIN
        -- User provided a value, use it
        INSERT INTO [${flyway:defaultSchema}].[VersionInstallation]
            (
                [ID],
                [MajorVersion],
                [MinorVersion],
                [PatchVersion],
                [Type],
                [InstalledAt],
                [Status],
                [InstallLog],
                [Comments]
            )
        OUTPUT INSERTED.[ID] INTO @InsertedRow
        VALUES
            (
                @ID,
                @MajorVersion,
                @MinorVersion,
                @PatchVersion,
                CASE WHEN @Type_Clear = 1 THEN NULL ELSE ISNULL(@Type, 'New') END,
                @InstalledAt,
                ISNULL(@Status, 'Pending'),
                CASE WHEN @InstallLog_Clear = 1 THEN NULL ELSE ISNULL(@InstallLog, NULL) END,
                CASE WHEN @Comments_Clear = 1 THEN NULL ELSE ISNULL(@Comments, NULL) END
            )
    END
    ELSE
    BEGIN
        -- No value provided, let database use its default (e.g., NEWSEQUENTIALID())
        INSERT INTO [${flyway:defaultSchema}].[VersionInstallation]
            (
                [MajorVersion],
                [MinorVersion],
                [PatchVersion],
                [Type],
                [InstalledAt],
                [Status],
                [InstallLog],
                [Comments]
            )
        OUTPUT INSERTED.[ID] INTO @InsertedRow
        VALUES
            (
                @MajorVersion,
                @MinorVersion,
                @PatchVersion,
                CASE WHEN @Type_Clear = 1 THEN NULL ELSE ISNULL(@Type, 'New') END,
                @InstalledAt,
                ISNULL(@Status, 'Pending'),
                CASE WHEN @InstallLog_Clear = 1 THEN NULL ELSE ISNULL(@InstallLog, NULL) END,
                CASE WHEN @Comments_Clear = 1 THEN NULL ELSE ISNULL(@Comments, NULL) END
            )
    END
    -- return the new record from the base view, which might have some calculated fields
    SELECT * FROM [${flyway:defaultSchema}].[vwVersionInstallations] WHERE [ID] = (SELECT [ID] FROM @InsertedRow)
END
GO
GRANT EXECUTE ON [${flyway:defaultSchema}].[spCreateVersionInstallation] TO [cdp_Integration], [cdp_Developer];

/* spCreate Permissions for MJ: Version Installations */

GRANT EXECUTE ON [${flyway:defaultSchema}].[spCreateVersionInstallation] TO [cdp_Integration], [cdp_Developer];
