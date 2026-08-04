-- Remote Operations — AI-from-Description authoring (RO-4) support.
--
-- Additive only. The RemoteOperation + RemoteOperationCategory tables already shipped in v5.42
-- (V202606201145__v5.42.x__Record_Set_Processing.sql, already in `next`). This adds the three columns the
-- AI-authoring pipeline needs, mirroring the Generated-Actions model on MJ: Actions:
--   * CodeLocked    — when set, the AI body is frozen (Save() skips regeneration), same as Action.CodeLocked.
--   * CodeComments  — the model's explanation of the generated body (the CodeComments analog).
--   * Libraries     — JSON array of { Library, ItemsUsed[] } the generated body imports; bound to the
--                     RemoteOperationLibrary JSONType via metadata sync (.entity-field-jsontype-remote-operations.json)
--                     so CodeGen emits a strongly-typed `LibrariesObject` accessor. No junction table —
--                     the library list is intrinsic, op-owned content.

ALTER TABLE ${flyway:defaultSchema}.RemoteOperation ADD
    CodeLocked BIT NOT NULL DEFAULT 0,
    CodeComments NVARCHAR(MAX) NULL,
    Libraries NVARCHAR(MAX) NULL;
GO

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'When 1, the AI-generated Code is frozen and Save() will not regenerate it even if Description changes (the Generated-Actions CodeLocked analog). Default 0.',
    @level0type = N'SCHEMA', @level0name = N'${flyway:defaultSchema}',
    @level1type = N'TABLE',  @level1name = N'RemoteOperation',
    @level2type = N'COLUMN', @level2name = N'CodeLocked';

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'The model''s explanation / comments for the AI-generated Code (populated alongside Code when GenerationType=AI). Human-facing review aid.',
    @level0type = N'SCHEMA', @level0name = N'${flyway:defaultSchema}',
    @level1type = N'TABLE',  @level1name = N'RemoteOperation',
    @level2type = N'COLUMN', @level2name = N'CodeComments';

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'JSON array of the libraries the generated body imports: [{ "Library": "@memberjunction/ai-prompts", "ItemsUsed": ["AIPromptRunner"] }, ...]. Bound to the RemoteOperationLibrary JSONType via metadata sync so CodeGen emits a typed LibrariesObject accessor; CodeGen uses it to emit the imports at the top of the generated remote_operations.ts. NULL/empty = only the default always-available libraries are imported.',
    @level0type = N'SCHEMA', @level0name = N'${flyway:defaultSchema}',
    @level1type = N'TABLE',  @level1name = N'RemoteOperation',
    @level2type = N'COLUMN', @level2name = N'Libraries';





























































-- CODE GEN RUN
/* SQL text to insert new entity field */

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '8ec0b0d8-f51d-4e94-86d0-98bfa006dd48' OR (EntityID = '2758D216-C4D2-4FC4-8348-781372736159' AND Name = 'CodeLocked')) BEGIN
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
            '8ec0b0d8-f51d-4e94-86d0-98bfa006dd48',
            '2758D216-C4D2-4FC4-8348-781372736159', -- Entity: MJ: Remote Operations
            100058,
            'CodeLocked',
            'Code Locked',
            'When 1, the AI-generated Code is frozen and Save() will not regenerate it even if Description changes (the Generated-Actions CodeLocked analog). Default 0.',
            'bit',
            1,
            1,
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

/* SQL text to insert new entity field */

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '664e4154-934f-4767-8dd1-2d6d9af599b1' OR (EntityID = '2758D216-C4D2-4FC4-8348-781372736159' AND Name = 'CodeComments')) BEGIN
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
            '664e4154-934f-4767-8dd1-2d6d9af599b1',
            '2758D216-C4D2-4FC4-8348-781372736159', -- Entity: MJ: Remote Operations
            100059,
            'CodeComments',
            'Code Comments',
            'The model''s explanation / comments for the AI-generated Code (populated alongside Code when GenerationType=AI). Human-facing review aid.',
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

/* SQL text to insert new entity field */

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '2b746356-521b-4974-8c5a-099f6dfa17ae' OR (EntityID = '2758D216-C4D2-4FC4-8348-781372736159' AND Name = 'Libraries')) BEGIN
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
            '2b746356-521b-4974-8c5a-099f6dfa17ae',
            '2758D216-C4D2-4FC4-8348-781372736159', -- Entity: MJ: Remote Operations
            100060,
            'Libraries',
            'Libraries',
            'JSON array of the libraries the generated body imports: [{ "Library": "@memberjunction/ai-prompts", "ItemsUsed": ["AIPromptRunner"] }, ...]. Bound to the RemoteOperationLibrary JSONType via metadata sync so CodeGen emits a typed LibrariesObject accessor; CodeGen uses it to emit the imports at the top of the generated remote_operations.ts. NULL/empty = only the default always-available libraries are imported.',
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

/* Index for Foreign Keys for RemoteOperation */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Remote Operations
-- Item: Index for Foreign Keys
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------
-- Index for foreign key CategoryID in table RemoteOperation
IF NOT EXISTS (
    SELECT 1
    FROM sys.indexes
    WHERE name = 'IDX_AUTO_MJ_FKEY_RemoteOperation_CategoryID' 
    AND object_id = OBJECT_ID('[${flyway:defaultSchema}].[RemoteOperation]')
)
CREATE INDEX IDX_AUTO_MJ_FKEY_RemoteOperation_CategoryID ON [${flyway:defaultSchema}].[RemoteOperation] ([CategoryID]);

-- Index for foreign key CodeApprovedByUserID in table RemoteOperation
IF NOT EXISTS (
    SELECT 1
    FROM sys.indexes
    WHERE name = 'IDX_AUTO_MJ_FKEY_RemoteOperation_CodeApprovedByUserID' 
    AND object_id = OBJECT_ID('[${flyway:defaultSchema}].[RemoteOperation]')
)
CREATE INDEX IDX_AUTO_MJ_FKEY_RemoteOperation_CodeApprovedByUserID ON [${flyway:defaultSchema}].[RemoteOperation] ([CodeApprovedByUserID]);

/* Base View SQL for MJ: Remote Operations */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Remote Operations
-- Item: vwRemoteOperations
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- BASE VIEW FOR ENTITY:      MJ: Remote Operations
-----               SCHEMA:      ${flyway:defaultSchema}
-----               BASE TABLE:  RemoteOperation
-----               PRIMARY KEY: ID
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[vwRemoteOperations]', 'V') IS NOT NULL
    DROP VIEW [${flyway:defaultSchema}].[vwRemoteOperations];
GO

CREATE VIEW [${flyway:defaultSchema}].[vwRemoteOperations]
AS
SELECT
    r.*,
    MJRemoteOperationCategory_CategoryID.[Name] AS [Category],
    MJUser_CodeApprovedByUserID.[Name] AS [CodeApprovedByUser]
FROM
    [${flyway:defaultSchema}].[RemoteOperation] AS r
LEFT OUTER JOIN
    [${flyway:defaultSchema}].[RemoteOperationCategory] AS MJRemoteOperationCategory_CategoryID
  ON
    [r].[CategoryID] = MJRemoteOperationCategory_CategoryID.[ID]
LEFT OUTER JOIN
    [${flyway:defaultSchema}].[User] AS MJUser_CodeApprovedByUserID
  ON
    [r].[CodeApprovedByUserID] = MJUser_CodeApprovedByUserID.[ID]
GO
GRANT SELECT ON [${flyway:defaultSchema}].[vwRemoteOperations] TO [cdp_UI], [cdp_Developer], [cdp_Integration];

/* Base View Permissions SQL for MJ: Remote Operations */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Remote Operations
-- Item: Permissions for vwRemoteOperations
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

GRANT SELECT ON [${flyway:defaultSchema}].[vwRemoteOperations] TO [cdp_UI], [cdp_Developer], [cdp_Integration];

/* spCreate SQL for MJ: Remote Operations */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Remote Operations
-- Item: spCreateRemoteOperation
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- CREATE PROCEDURE FOR RemoteOperation
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[spCreateRemoteOperation]', 'P') IS NOT NULL
    DROP PROCEDURE [${flyway:defaultSchema}].[spCreateRemoteOperation];
GO

CREATE PROCEDURE [${flyway:defaultSchema}].[spCreateRemoteOperation]
    @ID uniqueidentifier = NULL,
    @Name nvarchar(255),
    @OperationKey nvarchar(255),
    @CategoryID_Clear bit = 0,
    @CategoryID uniqueidentifier = NULL,
    @Description_Clear bit = 0,
    @Description nvarchar(MAX) = NULL,
    @InputTypeName_Clear bit = 0,
    @InputTypeName nvarchar(255) = NULL,
    @InputTypeDefinition_Clear bit = 0,
    @InputTypeDefinition nvarchar(MAX) = NULL,
    @InputTypeIsArray bit = NULL,
    @OutputTypeName_Clear bit = 0,
    @OutputTypeName nvarchar(255) = NULL,
    @OutputTypeDefinition_Clear bit = 0,
    @OutputTypeDefinition nvarchar(MAX) = NULL,
    @OutputTypeIsArray bit = NULL,
    @ExecutionMode nvarchar(20) = NULL,
    @RequiredScope_Clear bit = 0,
    @RequiredScope nvarchar(255) = NULL,
    @RequiresSystemUser bit = NULL,
    @GenerationType nvarchar(20) = NULL,
    @Code_Clear bit = 0,
    @Code nvarchar(MAX) = NULL,
    @CodeApprovalStatus nvarchar(20) = NULL,
    @CodeApprovedByUserID_Clear bit = 0,
    @CodeApprovedByUserID uniqueidentifier = NULL,
    @CodeApprovedAt_Clear bit = 0,
    @CodeApprovedAt datetimeoffset = NULL,
    @ContractFingerprint_Clear bit = 0,
    @ContractFingerprint nvarchar(100) = NULL,
    @Status nvarchar(20) = NULL,
    @CacheTTLSeconds_Clear bit = 0,
    @CacheTTLSeconds int = NULL,
    @TimeoutMS_Clear bit = 0,
    @TimeoutMS int = NULL,
    @MaxConcurrency_Clear bit = 0,
    @MaxConcurrency int = NULL,
    @CodeLocked bit = NULL,
    @CodeComments_Clear bit = 0,
    @CodeComments nvarchar(MAX) = NULL,
    @Libraries_Clear bit = 0,
    @Libraries nvarchar(MAX) = NULL
AS
BEGIN
    SET NOCOUNT ON;
    DECLARE @InsertedRow TABLE ([ID] UNIQUEIDENTIFIER)

    IF @ID IS NOT NULL
    BEGIN
        -- User provided a value, use it
        INSERT INTO [${flyway:defaultSchema}].[RemoteOperation]
            (
                [ID],
                [Name],
                [OperationKey],
                [CategoryID],
                [Description],
                [InputTypeName],
                [InputTypeDefinition],
                [InputTypeIsArray],
                [OutputTypeName],
                [OutputTypeDefinition],
                [OutputTypeIsArray],
                [ExecutionMode],
                [RequiredScope],
                [RequiresSystemUser],
                [GenerationType],
                [Code],
                [CodeApprovalStatus],
                [CodeApprovedByUserID],
                [CodeApprovedAt],
                [ContractFingerprint],
                [Status],
                [CacheTTLSeconds],
                [TimeoutMS],
                [MaxConcurrency],
                [CodeLocked],
                [CodeComments],
                [Libraries]
            )
        OUTPUT INSERTED.[ID] INTO @InsertedRow
        VALUES
            (
                @ID,
                @Name,
                @OperationKey,
                CASE WHEN @CategoryID_Clear = 1 THEN NULL ELSE ISNULL(@CategoryID, NULL) END,
                CASE WHEN @Description_Clear = 1 THEN NULL ELSE ISNULL(@Description, NULL) END,
                CASE WHEN @InputTypeName_Clear = 1 THEN NULL ELSE ISNULL(@InputTypeName, NULL) END,
                CASE WHEN @InputTypeDefinition_Clear = 1 THEN NULL ELSE ISNULL(@InputTypeDefinition, NULL) END,
                ISNULL(@InputTypeIsArray, 0),
                CASE WHEN @OutputTypeName_Clear = 1 THEN NULL ELSE ISNULL(@OutputTypeName, NULL) END,
                CASE WHEN @OutputTypeDefinition_Clear = 1 THEN NULL ELSE ISNULL(@OutputTypeDefinition, NULL) END,
                ISNULL(@OutputTypeIsArray, 0),
                ISNULL(@ExecutionMode, 'Sync'),
                CASE WHEN @RequiredScope_Clear = 1 THEN NULL ELSE ISNULL(@RequiredScope, NULL) END,
                ISNULL(@RequiresSystemUser, 0),
                ISNULL(@GenerationType, 'Manual'),
                CASE WHEN @Code_Clear = 1 THEN NULL ELSE ISNULL(@Code, NULL) END,
                ISNULL(@CodeApprovalStatus, 'Pending'),
                CASE WHEN @CodeApprovedByUserID_Clear = 1 THEN NULL ELSE ISNULL(@CodeApprovedByUserID, NULL) END,
                CASE WHEN @CodeApprovedAt_Clear = 1 THEN NULL ELSE ISNULL(@CodeApprovedAt, NULL) END,
                CASE WHEN @ContractFingerprint_Clear = 1 THEN NULL ELSE ISNULL(@ContractFingerprint, NULL) END,
                ISNULL(@Status, 'Pending'),
                CASE WHEN @CacheTTLSeconds_Clear = 1 THEN NULL ELSE ISNULL(@CacheTTLSeconds, NULL) END,
                CASE WHEN @TimeoutMS_Clear = 1 THEN NULL ELSE ISNULL(@TimeoutMS, NULL) END,
                CASE WHEN @MaxConcurrency_Clear = 1 THEN NULL ELSE ISNULL(@MaxConcurrency, NULL) END,
                ISNULL(@CodeLocked, 0),
                CASE WHEN @CodeComments_Clear = 1 THEN NULL ELSE ISNULL(@CodeComments, NULL) END,
                CASE WHEN @Libraries_Clear = 1 THEN NULL ELSE ISNULL(@Libraries, NULL) END
            )
    END
    ELSE
    BEGIN
        -- No value provided, let database use its default (e.g., NEWSEQUENTIALID())
        INSERT INTO [${flyway:defaultSchema}].[RemoteOperation]
            (
                [Name],
                [OperationKey],
                [CategoryID],
                [Description],
                [InputTypeName],
                [InputTypeDefinition],
                [InputTypeIsArray],
                [OutputTypeName],
                [OutputTypeDefinition],
                [OutputTypeIsArray],
                [ExecutionMode],
                [RequiredScope],
                [RequiresSystemUser],
                [GenerationType],
                [Code],
                [CodeApprovalStatus],
                [CodeApprovedByUserID],
                [CodeApprovedAt],
                [ContractFingerprint],
                [Status],
                [CacheTTLSeconds],
                [TimeoutMS],
                [MaxConcurrency],
                [CodeLocked],
                [CodeComments],
                [Libraries]
            )
        OUTPUT INSERTED.[ID] INTO @InsertedRow
        VALUES
            (
                @Name,
                @OperationKey,
                CASE WHEN @CategoryID_Clear = 1 THEN NULL ELSE ISNULL(@CategoryID, NULL) END,
                CASE WHEN @Description_Clear = 1 THEN NULL ELSE ISNULL(@Description, NULL) END,
                CASE WHEN @InputTypeName_Clear = 1 THEN NULL ELSE ISNULL(@InputTypeName, NULL) END,
                CASE WHEN @InputTypeDefinition_Clear = 1 THEN NULL ELSE ISNULL(@InputTypeDefinition, NULL) END,
                ISNULL(@InputTypeIsArray, 0),
                CASE WHEN @OutputTypeName_Clear = 1 THEN NULL ELSE ISNULL(@OutputTypeName, NULL) END,
                CASE WHEN @OutputTypeDefinition_Clear = 1 THEN NULL ELSE ISNULL(@OutputTypeDefinition, NULL) END,
                ISNULL(@OutputTypeIsArray, 0),
                ISNULL(@ExecutionMode, 'Sync'),
                CASE WHEN @RequiredScope_Clear = 1 THEN NULL ELSE ISNULL(@RequiredScope, NULL) END,
                ISNULL(@RequiresSystemUser, 0),
                ISNULL(@GenerationType, 'Manual'),
                CASE WHEN @Code_Clear = 1 THEN NULL ELSE ISNULL(@Code, NULL) END,
                ISNULL(@CodeApprovalStatus, 'Pending'),
                CASE WHEN @CodeApprovedByUserID_Clear = 1 THEN NULL ELSE ISNULL(@CodeApprovedByUserID, NULL) END,
                CASE WHEN @CodeApprovedAt_Clear = 1 THEN NULL ELSE ISNULL(@CodeApprovedAt, NULL) END,
                CASE WHEN @ContractFingerprint_Clear = 1 THEN NULL ELSE ISNULL(@ContractFingerprint, NULL) END,
                ISNULL(@Status, 'Pending'),
                CASE WHEN @CacheTTLSeconds_Clear = 1 THEN NULL ELSE ISNULL(@CacheTTLSeconds, NULL) END,
                CASE WHEN @TimeoutMS_Clear = 1 THEN NULL ELSE ISNULL(@TimeoutMS, NULL) END,
                CASE WHEN @MaxConcurrency_Clear = 1 THEN NULL ELSE ISNULL(@MaxConcurrency, NULL) END,
                ISNULL(@CodeLocked, 0),
                CASE WHEN @CodeComments_Clear = 1 THEN NULL ELSE ISNULL(@CodeComments, NULL) END,
                CASE WHEN @Libraries_Clear = 1 THEN NULL ELSE ISNULL(@Libraries, NULL) END
            )
    END
    -- return the new record from the base view, which might have some calculated fields
    SELECT * FROM [${flyway:defaultSchema}].[vwRemoteOperations] WHERE [ID] = (SELECT [ID] FROM @InsertedRow)
END
GO
GRANT EXECUTE ON [${flyway:defaultSchema}].[spCreateRemoteOperation] TO [cdp_Developer], [cdp_Integration];

/* spCreate Permissions for MJ: Remote Operations */

GRANT EXECUTE ON [${flyway:defaultSchema}].[spCreateRemoteOperation] TO [cdp_Developer], [cdp_Integration];

/* spUpdate SQL for MJ: Remote Operations */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Remote Operations
-- Item: spUpdateRemoteOperation
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- UPDATE PROCEDURE FOR RemoteOperation
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[spUpdateRemoteOperation]', 'P') IS NOT NULL
    DROP PROCEDURE [${flyway:defaultSchema}].[spUpdateRemoteOperation];
GO

CREATE PROCEDURE [${flyway:defaultSchema}].[spUpdateRemoteOperation]
    @ID uniqueidentifier,
    @Name nvarchar(255) = NULL,
    @OperationKey nvarchar(255) = NULL,
    @CategoryID_Clear bit = 0,
    @CategoryID uniqueidentifier = NULL,
    @Description_Clear bit = 0,
    @Description nvarchar(MAX) = NULL,
    @InputTypeName_Clear bit = 0,
    @InputTypeName nvarchar(255) = NULL,
    @InputTypeDefinition_Clear bit = 0,
    @InputTypeDefinition nvarchar(MAX) = NULL,
    @InputTypeIsArray bit = NULL,
    @OutputTypeName_Clear bit = 0,
    @OutputTypeName nvarchar(255) = NULL,
    @OutputTypeDefinition_Clear bit = 0,
    @OutputTypeDefinition nvarchar(MAX) = NULL,
    @OutputTypeIsArray bit = NULL,
    @ExecutionMode nvarchar(20) = NULL,
    @RequiredScope_Clear bit = 0,
    @RequiredScope nvarchar(255) = NULL,
    @RequiresSystemUser bit = NULL,
    @GenerationType nvarchar(20) = NULL,
    @Code_Clear bit = 0,
    @Code nvarchar(MAX) = NULL,
    @CodeApprovalStatus nvarchar(20) = NULL,
    @CodeApprovedByUserID_Clear bit = 0,
    @CodeApprovedByUserID uniqueidentifier = NULL,
    @CodeApprovedAt_Clear bit = 0,
    @CodeApprovedAt datetimeoffset = NULL,
    @ContractFingerprint_Clear bit = 0,
    @ContractFingerprint nvarchar(100) = NULL,
    @Status nvarchar(20) = NULL,
    @CacheTTLSeconds_Clear bit = 0,
    @CacheTTLSeconds int = NULL,
    @TimeoutMS_Clear bit = 0,
    @TimeoutMS int = NULL,
    @MaxConcurrency_Clear bit = 0,
    @MaxConcurrency int = NULL,
    @CodeLocked bit = NULL,
    @CodeComments_Clear bit = 0,
    @CodeComments nvarchar(MAX) = NULL,
    @Libraries_Clear bit = 0,
    @Libraries nvarchar(MAX) = NULL
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE
        [${flyway:defaultSchema}].[RemoteOperation]
    SET
        [Name] = ISNULL(@Name, [Name]),
        [OperationKey] = ISNULL(@OperationKey, [OperationKey]),
        [CategoryID] = CASE WHEN @CategoryID_Clear = 1 THEN NULL ELSE ISNULL(@CategoryID, [CategoryID]) END,
        [Description] = CASE WHEN @Description_Clear = 1 THEN NULL ELSE ISNULL(@Description, [Description]) END,
        [InputTypeName] = CASE WHEN @InputTypeName_Clear = 1 THEN NULL ELSE ISNULL(@InputTypeName, [InputTypeName]) END,
        [InputTypeDefinition] = CASE WHEN @InputTypeDefinition_Clear = 1 THEN NULL ELSE ISNULL(@InputTypeDefinition, [InputTypeDefinition]) END,
        [InputTypeIsArray] = ISNULL(@InputTypeIsArray, [InputTypeIsArray]),
        [OutputTypeName] = CASE WHEN @OutputTypeName_Clear = 1 THEN NULL ELSE ISNULL(@OutputTypeName, [OutputTypeName]) END,
        [OutputTypeDefinition] = CASE WHEN @OutputTypeDefinition_Clear = 1 THEN NULL ELSE ISNULL(@OutputTypeDefinition, [OutputTypeDefinition]) END,
        [OutputTypeIsArray] = ISNULL(@OutputTypeIsArray, [OutputTypeIsArray]),
        [ExecutionMode] = ISNULL(@ExecutionMode, [ExecutionMode]),
        [RequiredScope] = CASE WHEN @RequiredScope_Clear = 1 THEN NULL ELSE ISNULL(@RequiredScope, [RequiredScope]) END,
        [RequiresSystemUser] = ISNULL(@RequiresSystemUser, [RequiresSystemUser]),
        [GenerationType] = ISNULL(@GenerationType, [GenerationType]),
        [Code] = CASE WHEN @Code_Clear = 1 THEN NULL ELSE ISNULL(@Code, [Code]) END,
        [CodeApprovalStatus] = ISNULL(@CodeApprovalStatus, [CodeApprovalStatus]),
        [CodeApprovedByUserID] = CASE WHEN @CodeApprovedByUserID_Clear = 1 THEN NULL ELSE ISNULL(@CodeApprovedByUserID, [CodeApprovedByUserID]) END,
        [CodeApprovedAt] = CASE WHEN @CodeApprovedAt_Clear = 1 THEN NULL ELSE ISNULL(@CodeApprovedAt, [CodeApprovedAt]) END,
        [ContractFingerprint] = CASE WHEN @ContractFingerprint_Clear = 1 THEN NULL ELSE ISNULL(@ContractFingerprint, [ContractFingerprint]) END,
        [Status] = ISNULL(@Status, [Status]),
        [CacheTTLSeconds] = CASE WHEN @CacheTTLSeconds_Clear = 1 THEN NULL ELSE ISNULL(@CacheTTLSeconds, [CacheTTLSeconds]) END,
        [TimeoutMS] = CASE WHEN @TimeoutMS_Clear = 1 THEN NULL ELSE ISNULL(@TimeoutMS, [TimeoutMS]) END,
        [MaxConcurrency] = CASE WHEN @MaxConcurrency_Clear = 1 THEN NULL ELSE ISNULL(@MaxConcurrency, [MaxConcurrency]) END,
        [CodeLocked] = ISNULL(@CodeLocked, [CodeLocked]),
        [CodeComments] = CASE WHEN @CodeComments_Clear = 1 THEN NULL ELSE ISNULL(@CodeComments, [CodeComments]) END,
        [Libraries] = CASE WHEN @Libraries_Clear = 1 THEN NULL ELSE ISNULL(@Libraries, [Libraries]) END
    WHERE
        [ID] = @ID

    -- Check if the update was successful
    IF @@ROWCOUNT = 0
        -- Nothing was updated, return no rows, but column structure from base view intact, semantically correct this way.
        SELECT TOP 0 * FROM [${flyway:defaultSchema}].[vwRemoteOperations] WHERE 1=0
    ELSE
        -- Return the updated record so the caller can see the updated values and any calculated fields
        SELECT
                                        *
                                    FROM
                                        [${flyway:defaultSchema}].[vwRemoteOperations]
                                    WHERE
                                        [ID] = @ID
                                    
END
GO

GRANT EXECUTE ON [${flyway:defaultSchema}].[spUpdateRemoteOperation] TO [cdp_Developer], [cdp_Integration]
GO

------------------------------------------------------------
----- TRIGGER FOR __mj_UpdatedAt field for the RemoteOperation table
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[trgUpdateRemoteOperation]', 'TR') IS NOT NULL
    DROP TRIGGER [${flyway:defaultSchema}].[trgUpdateRemoteOperation];
GO
CREATE TRIGGER [${flyway:defaultSchema}].trgUpdateRemoteOperation
ON [${flyway:defaultSchema}].[RemoteOperation]
AFTER UPDATE
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE
        [${flyway:defaultSchema}].[RemoteOperation]
    SET
        __mj_UpdatedAt = GETUTCDATE()
    FROM
        [${flyway:defaultSchema}].[RemoteOperation] AS _organicTable
    INNER JOIN
        INSERTED AS I ON
        _organicTable.[ID] = I.[ID];
END;
GO

/* spUpdate Permissions for MJ: Remote Operations */

GRANT EXECUTE ON [${flyway:defaultSchema}].[spUpdateRemoteOperation] TO [cdp_Developer], [cdp_Integration];

/* spDelete SQL for MJ: Remote Operations */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Remote Operations
-- Item: spDeleteRemoteOperation
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- DELETE PROCEDURE FOR RemoteOperation
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[spDeleteRemoteOperation]', 'P') IS NOT NULL
    DROP PROCEDURE [${flyway:defaultSchema}].[spDeleteRemoteOperation];
GO

CREATE PROCEDURE [${flyway:defaultSchema}].[spDeleteRemoteOperation]
    @ID uniqueidentifier
AS
BEGIN
    SET NOCOUNT ON;

    DELETE FROM
        [${flyway:defaultSchema}].[RemoteOperation]
    WHERE
        [ID] = @ID


    -- Check if the delete was successful
    IF @@ROWCOUNT = 0
        SELECT NULL AS [ID] -- Return NULL for all primary key fields to indicate no record was deleted
    ELSE
        SELECT @ID AS [ID] -- Return the primary key values to indicate we successfully deleted the record
END
GO
GRANT EXECUTE ON [${flyway:defaultSchema}].[spDeleteRemoteOperation] TO [cdp_Developer], [cdp_Integration];

/* spDelete Permissions for MJ: Remote Operations */

GRANT EXECUTE ON [${flyway:defaultSchema}].[spDeleteRemoteOperation] TO [cdp_Developer], [cdp_Integration];

/* Set field properties for entity */

               UPDATE [${flyway:defaultSchema}].[EntityField]
               SET DefaultInView = 1
               WHERE ID = 'D6662178-7C96-48BE-9EEE-1CEE960277C4'
               AND AutoUpdateDefaultInView = 1;

               UPDATE [${flyway:defaultSchema}].[EntityField]
               SET IncludeInUserSearchAPI = 1
               WHERE ID = '4BDE9929-8999-490C-AAB7-33755D18FD31'
               AND AutoUpdateIncludeInUserSearchAPI = 1;

               UPDATE [${flyway:defaultSchema}].[EntityField]
               SET UserSearchPredicateAPI = 'BeginsWith'
               WHERE ID = 'D282A96B-D93F-46BE-A966-39AABF607537'
               AND AutoUpdateUserSearchPredicate = 1;

               UPDATE [${flyway:defaultSchema}].[EntityField]
               SET UserSearchPredicateAPI = 'Exact'
               WHERE ID = '4DC009D7-A719-4ACA-BD04-BFFABA9AC432'
               AND AutoUpdateUserSearchPredicate = 1;

/* Set categories for 31 fields */

-- UPDATE Entity Field Category Info MJ: Remote Operations.ID 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = 'A1B3D99B-A135-43FA-BC27-97809AA1BE6B' AND AutoUpdateCategory = 1;

-- UPDATE Entity Field Category Info MJ: Remote Operations.__mj_CreatedAt 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = '9B2E73F0-D95D-4B80-B3EF-D2570D9CE87A' AND AutoUpdateCategory = 1;

-- UPDATE Entity Field Category Info MJ: Remote Operations.__mj_UpdatedAt 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = '077E22CF-092C-4B46-AAE1-FF2FC99A5ABD' AND AutoUpdateCategory = 1;

-- UPDATE Entity Field Category Info MJ: Remote Operations.Name 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = 'D282A96B-D93F-46BE-A966-39AABF607537' AND AutoUpdateCategory = 1;

-- UPDATE Entity Field Category Info MJ: Remote Operations.OperationKey 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = '4DC009D7-A719-4ACA-BD04-BFFABA9AC432' AND AutoUpdateCategory = 1;

-- UPDATE Entity Field Category Info MJ: Remote Operations.CategoryID 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = 'E614810B-D58B-49D3-8BB6-875FD70F17FA' AND AutoUpdateCategory = 1;

-- UPDATE Entity Field Category Info MJ: Remote Operations.Description 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = '4BDE9929-8999-490C-AAB7-33755D18FD31' AND AutoUpdateCategory = 1;

-- UPDATE Entity Field Category Info MJ: Remote Operations.Category 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = '7D944E8F-A2F0-426E-9531-BFE8BEC27549' AND AutoUpdateCategory = 1;

-- UPDATE Entity Field Category Info MJ: Remote Operations.InputTypeName 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = '3261C71D-480F-431F-949B-A654B19EA426' AND AutoUpdateCategory = 1;

-- UPDATE Entity Field Category Info MJ: Remote Operations.InputTypeDefinition 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   GeneratedFormSection = 'Category',
   ExtendedType = 'Code',
   CodeType = 'TypeScript'
WHERE 
   ID = 'B9141D93-64B2-4903-B550-5CFCA72637CB' AND AutoUpdateCategory = 1;

-- UPDATE Entity Field Category Info MJ: Remote Operations.InputTypeIsArray 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   GeneratedFormSection = 'Category',
   DisplayName = 'Input Is Array',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = '5AE69D4C-5B11-4DF3-98B3-4940C76611F3' AND AutoUpdateCategory = 1;

-- UPDATE Entity Field Category Info MJ: Remote Operations.OutputTypeName 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = '2ADFF8A2-ED60-4A3E-973A-CFE5B4A6ED99' AND AutoUpdateCategory = 1;

-- UPDATE Entity Field Category Info MJ: Remote Operations.OutputTypeDefinition 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   GeneratedFormSection = 'Category',
   ExtendedType = 'Code',
   CodeType = 'TypeScript'
WHERE 
   ID = '7ACB3F9F-1163-4614-98AA-6A343E878AAD' AND AutoUpdateCategory = 1;

-- UPDATE Entity Field Category Info MJ: Remote Operations.OutputTypeIsArray 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   GeneratedFormSection = 'Category',
   DisplayName = 'Output Is Array',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = '4390D029-D795-4007-8EE9-F501DF1A7F65' AND AutoUpdateCategory = 1;

-- UPDATE Entity Field Category Info MJ: Remote Operations.ContractFingerprint 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = '80C6B5D2-7567-4A63-9A1A-17677A34BFA5' AND AutoUpdateCategory = 1;

-- UPDATE Entity Field Category Info MJ: Remote Operations.ExecutionMode 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = 'C34E9634-B464-4297-89D7-C7120BD1FB78' AND AutoUpdateCategory = 1;

-- UPDATE Entity Field Category Info MJ: Remote Operations.RequiredScope 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = '58125CD2-4955-4088-B3BD-CC4034DA597A' AND AutoUpdateCategory = 1;

-- UPDATE Entity Field Category Info MJ: Remote Operations.RequiresSystemUser 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = '5F825817-3679-41B6-86FA-747065D9825E' AND AutoUpdateCategory = 1;

-- UPDATE Entity Field Category Info MJ: Remote Operations.CacheTTLSeconds 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = '814591AB-4B99-4B4E-BFD0-24CABCABBD78' AND AutoUpdateCategory = 1;

-- UPDATE Entity Field Category Info MJ: Remote Operations.TimeoutMS 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = 'B61AFDE6-BA4A-40B9-9C88-469BC568591F' AND AutoUpdateCategory = 1;

-- UPDATE Entity Field Category Info MJ: Remote Operations.MaxConcurrency 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = 'EA3FF7AE-094C-470A-A653-219D56FB6ED3' AND AutoUpdateCategory = 1;

-- UPDATE Entity Field Category Info MJ: Remote Operations.GenerationType 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = 'D6662178-7C96-48BE-9EEE-1CEE960277C4' AND AutoUpdateCategory = 1;

-- UPDATE Entity Field Category Info MJ: Remote Operations.Code 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   GeneratedFormSection = 'Category',
   DisplayName = 'Code',
   ExtendedType = 'Code',
   CodeType = 'TypeScript'
WHERE 
   ID = '759AA844-3C64-45CF-A014-94CA7E8E1989' AND AutoUpdateCategory = 1;

-- UPDATE Entity Field Category Info MJ: Remote Operations.CodeApprovalStatus 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   GeneratedFormSection = 'Category',
   DisplayName = 'Code Approval Status',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = 'A0FE0FFC-FD02-4064-9C2A-BB903ADF7296' AND AutoUpdateCategory = 1;

-- UPDATE Entity Field Category Info MJ: Remote Operations.CodeApprovedByUserID 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   GeneratedFormSection = 'Category',
   DisplayName = 'Code Approved By User ID',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = 'C62BC997-B1B4-49AF-83C8-5B0A2E9F66E6' AND AutoUpdateCategory = 1;

-- UPDATE Entity Field Category Info MJ: Remote Operations.CodeApprovedAt 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   GeneratedFormSection = 'Category',
   DisplayName = 'Code Approved At',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = 'B7640E68-0ED9-4223-8BCB-60145D6088AF' AND AutoUpdateCategory = 1;

-- UPDATE Entity Field Category Info MJ: Remote Operations.Status 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = '39380D84-086B-4F99-AE8C-BB59C7E608A9' AND AutoUpdateCategory = 1;

-- UPDATE Entity Field Category Info MJ: Remote Operations.CodeApprovedByUser 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   GeneratedFormSection = 'Category',
   DisplayName = 'Code Approved By User',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = 'B3DD7A6D-995A-4E4E-A9E3-A0395C0337A1' AND AutoUpdateCategory = 1;

-- UPDATE Entity Field Category Info MJ: Remote Operations.CodeLocked 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Implementation and Approval',
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = '8EC0B0D8-F51D-4E94-86D0-98BFA006DD48' AND AutoUpdateCategory = 1;

-- UPDATE Entity Field Category Info MJ: Remote Operations.CodeComments 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Implementation and Approval',
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = '664E4154-934F-4767-8DD1-2D6D9AF599B1' AND AutoUpdateCategory = 1;

-- UPDATE Entity Field Category Info MJ: Remote Operations.Libraries 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Implementation and Approval',
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = '2B746356-521B-4974-8C5A-099F6DFA17AE' AND AutoUpdateCategory = 1;

