-- =====================================================================================
-- Restore MC9 single-write __mj_UpdatedAt contract on ArtifactType
--
-- V202611131724__v6.3.x__ArtifactType_Configuration.sql regenerated
-- spUpdateArtifactType and trgUpdateArtifactType without the MC9 clauses
-- introduced in V202611121645__v6.3.x__Single_Write_spUpdate_And_Trigger_Guard.sql:
--   1. [__mj_UpdatedAt] = GETUTCDATE() inside spUpdateArtifactType
--   2. IF NOT UPDATE([__mj_UpdatedAt]) guard inside trgUpdateArtifactType
--
-- This forward migration restores both while preserving @Configuration parameters.
-- =====================================================================================

IF OBJECT_ID('[${flyway:defaultSchema}].[spUpdateArtifactType]', 'P') IS NOT NULL
    DROP PROCEDURE [${flyway:defaultSchema}].[spUpdateArtifactType];
GO

CREATE PROCEDURE [${flyway:defaultSchema}].[spUpdateArtifactType]
    @ID uniqueidentifier,
    @Name nvarchar(100) = NULL,
    @Description_Clear bit = 0,
    @Description nvarchar(MAX) = NULL,
    @ContentType nvarchar(100) = NULL,
    @IsEnabled bit = NULL,
    @ParentID_Clear bit = 0,
    @ParentID uniqueidentifier = NULL,
    @ExtractRules_Clear bit = 0,
    @ExtractRules nvarchar(MAX) = NULL,
    @DriverClass_Clear bit = 0,
    @DriverClass nvarchar(255) = NULL,
    @Icon_Clear bit = 0,
    @Icon nvarchar(255) = NULL,
    @ContentCategory nvarchar(10) = NULL,
    @ToolLibraryClass_Clear bit = 0,
    @ToolLibraryClass nvarchar(100) = NULL,
    @Priority int = NULL,
    @DefaultDeliveryMode nvarchar(20) = NULL,
    @SystemSupplied bit = NULL,
    @Configuration_Clear bit = 0,
    @Configuration nvarchar(MAX) = NULL
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE
        [${flyway:defaultSchema}].[ArtifactType]
    SET
        [Name] = ISNULL(@Name, [Name]),
        [Description] = CASE WHEN @Description_Clear = 1 THEN NULL ELSE ISNULL(@Description, [Description]) END,
        [ContentType] = ISNULL(@ContentType, [ContentType]),
        [IsEnabled] = ISNULL(@IsEnabled, [IsEnabled]),
        [ParentID] = CASE WHEN @ParentID_Clear = 1 THEN NULL ELSE ISNULL(@ParentID, [ParentID]) END,
        [ExtractRules] = CASE WHEN @ExtractRules_Clear = 1 THEN NULL ELSE ISNULL(@ExtractRules, [ExtractRules]) END,
        [DriverClass] = CASE WHEN @DriverClass_Clear = 1 THEN NULL ELSE ISNULL(@DriverClass, [DriverClass]) END,
        [Icon] = CASE WHEN @Icon_Clear = 1 THEN NULL ELSE ISNULL(@Icon, [Icon]) END,
        [ContentCategory] = ISNULL(@ContentCategory, [ContentCategory]),
        [ToolLibraryClass] = CASE WHEN @ToolLibraryClass_Clear = 1 THEN NULL ELSE ISNULL(@ToolLibraryClass, [ToolLibraryClass]) END,
        [Priority] = ISNULL(@Priority, [Priority]),
        [DefaultDeliveryMode] = ISNULL(@DefaultDeliveryMode, [DefaultDeliveryMode]),
        [SystemSupplied] = ISNULL(@SystemSupplied, [SystemSupplied]),
        [Configuration] = CASE WHEN @Configuration_Clear = 1 THEN NULL ELSE ISNULL(@Configuration, [Configuration]) END,
        [__mj_UpdatedAt] = GETUTCDATE()
    WHERE
        [ID] = @ID

    IF @@ROWCOUNT = 0
        SELECT TOP 0 * FROM [${flyway:defaultSchema}].[vwArtifactTypes] WHERE 1=0
    ELSE
        SELECT * FROM [${flyway:defaultSchema}].[vwArtifactTypes] WHERE [ID] = @ID
END
GO

REVOKE EXECUTE ON [${flyway:defaultSchema}].[spUpdateArtifactType] FROM [cdp_Developer]
REVOKE EXECUTE ON [${flyway:defaultSchema}].[spUpdateArtifactType] FROM [cdp_Integration]
GRANT EXECUTE ON [${flyway:defaultSchema}].[spUpdateArtifactType] TO [cdp_Developer], [cdp_Integration];
GO

IF OBJECT_ID('[${flyway:defaultSchema}].[trgUpdateArtifactType]', 'TR') IS NOT NULL
    DROP TRIGGER [${flyway:defaultSchema}].[trgUpdateArtifactType];
GO

CREATE TRIGGER [${flyway:defaultSchema}].trgUpdateArtifactType
ON [${flyway:defaultSchema}].[ArtifactType]
AFTER UPDATE
AS
BEGIN
    SET NOCOUNT ON;
    IF NOT UPDATE([__mj_UpdatedAt])
    BEGIN
        UPDATE
            [${flyway:defaultSchema}].[ArtifactType]
        SET
            __mj_UpdatedAt = GETUTCDATE()
        FROM
            [${flyway:defaultSchema}].[ArtifactType] AS _organicTable
        INNER JOIN
            INSERTED AS I ON
            _organicTable.[ID] = I.[ID];
    END
END;
GO
