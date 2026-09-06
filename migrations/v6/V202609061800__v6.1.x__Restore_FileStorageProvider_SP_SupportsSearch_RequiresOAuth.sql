-- =============================================================================
-- Restore FileStorageProvider spCreate/spUpdate parameters
--   SupportsSearch, Configuration, RequiresOAuth
-- =============================================================================
--
-- V202608191200__v6.1.x__FileStorageProvider_Configuration.sql added the
-- Configuration column (already present from v3.2) and regenerated
-- spCreateFileStorageProvider / spUpdateFileStorageProvider. That captured
-- tail omitted @SupportsSearch and @RequiresOAuth even though:
--
--   * both columns exist on [${flyway:defaultSchema}].[FileStorageProvider]
--     (SupportsSearch from v2.111, RequiresOAuth from v3.2)
--   * both EntityField rows exist with AllowUpdateAPI = 1
--   * vwFileStorageProviders is SELECT f.* so the view is fine
--   * generated entity Save() and mj sync push send those arguments
--
-- Result: "spCreateFileStorageProvider has too many arguments specified"
-- on any insert/update that includes the two bit fields (Committees
-- metadata sync is the first in-tree caller that does).
--
-- The physical columns were never dropped. This migration only restores the
-- CRUD procedures to the last known-good CodeGen signature (v5.32 force-regen,
-- which already included Configuration) so they match EntityField again.
--
-- CodeGen does not self-heal SP signatures: procs are regenerated only when
-- the entity lands on _modifiedEntityList (new/changed columns). Schema and
-- EntityField already agree, so later CodeGen runs never rewrite these procs.
-- =============================================================================

------------------------------------------------------------
----- CREATE PROCEDURE FOR FileStorageProvider
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[spCreateFileStorageProvider]', 'P') IS NOT NULL
    DROP PROCEDURE [${flyway:defaultSchema}].[spCreateFileStorageProvider];
GO

CREATE PROCEDURE [${flyway:defaultSchema}].[spCreateFileStorageProvider]
    @ID uniqueidentifier = NULL,
    @Name nvarchar(50),
    @Description_Clear bit = 0,
    @Description nvarchar(MAX) = NULL,
    @ServerDriverKey nvarchar(100),
    @ClientDriverKey nvarchar(100),
    @Priority int = NULL,
    @IsActive bit = NULL,
    @SupportsSearch bit = NULL,
    @Configuration_Clear bit = 0,
    @Configuration nvarchar(MAX) = NULL,
    @RequiresOAuth bit = NULL
AS
BEGIN
    SET NOCOUNT ON;
    DECLARE @InsertedRow TABLE ([ID] UNIQUEIDENTIFIER)

    IF @ID IS NOT NULL
    BEGIN
        -- User provided a value, use it
        INSERT INTO [${flyway:defaultSchema}].[FileStorageProvider]
            (
                [ID],
                [Name],
                [Description],
                [ServerDriverKey],
                [ClientDriverKey],
                [Priority],
                [IsActive],
                [SupportsSearch],
                [Configuration],
                [RequiresOAuth]
            )
        OUTPUT INSERTED.[ID] INTO @InsertedRow
        VALUES
            (
                @ID,
                @Name,
                CASE WHEN @Description_Clear = 1 THEN NULL ELSE ISNULL(@Description, NULL) END,
                @ServerDriverKey,
                @ClientDriverKey,
                ISNULL(@Priority, 0),
                ISNULL(@IsActive, 1),
                ISNULL(@SupportsSearch, 0),
                CASE WHEN @Configuration_Clear = 1 THEN NULL ELSE ISNULL(@Configuration, NULL) END,
                ISNULL(@RequiresOAuth, 0)
            )
    END
    ELSE
    BEGIN
        -- No value provided, let database use its default (e.g., NEWSEQUENTIALID())
        INSERT INTO [${flyway:defaultSchema}].[FileStorageProvider]
            (
                [Name],
                [Description],
                [ServerDriverKey],
                [ClientDriverKey],
                [Priority],
                [IsActive],
                [SupportsSearch],
                [Configuration],
                [RequiresOAuth]
            )
        OUTPUT INSERTED.[ID] INTO @InsertedRow
        VALUES
            (
                @Name,
                CASE WHEN @Description_Clear = 1 THEN NULL ELSE ISNULL(@Description, NULL) END,
                @ServerDriverKey,
                @ClientDriverKey,
                ISNULL(@Priority, 0),
                ISNULL(@IsActive, 1),
                ISNULL(@SupportsSearch, 0),
                CASE WHEN @Configuration_Clear = 1 THEN NULL ELSE ISNULL(@Configuration, NULL) END,
                ISNULL(@RequiresOAuth, 0)
            )
    END
    -- return the new record from the base view, which might have some calculated fields
    SELECT * FROM [${flyway:defaultSchema}].[vwFileStorageProviders] WHERE [ID] = (SELECT [ID] FROM @InsertedRow)
END
GO
GRANT EXECUTE ON [${flyway:defaultSchema}].[spCreateFileStorageProvider] TO [cdp_Integration], [cdp_Developer]
GO

------------------------------------------------------------
----- UPDATE PROCEDURE FOR FileStorageProvider
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[spUpdateFileStorageProvider]', 'P') IS NOT NULL
    DROP PROCEDURE [${flyway:defaultSchema}].[spUpdateFileStorageProvider];
GO

CREATE PROCEDURE [${flyway:defaultSchema}].[spUpdateFileStorageProvider]
    @ID uniqueidentifier,
    @Name nvarchar(50) = NULL,
    @Description_Clear bit = 0,
    @Description nvarchar(MAX) = NULL,
    @ServerDriverKey nvarchar(100) = NULL,
    @ClientDriverKey nvarchar(100) = NULL,
    @Priority int = NULL,
    @IsActive bit = NULL,
    @SupportsSearch bit = NULL,
    @Configuration_Clear bit = 0,
    @Configuration nvarchar(MAX) = NULL,
    @RequiresOAuth bit = NULL
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE
        [${flyway:defaultSchema}].[FileStorageProvider]
    SET
        [Name] = ISNULL(@Name, [Name]),
        [Description] = CASE WHEN @Description_Clear = 1 THEN NULL ELSE ISNULL(@Description, [Description]) END,
        [ServerDriverKey] = ISNULL(@ServerDriverKey, [ServerDriverKey]),
        [ClientDriverKey] = ISNULL(@ClientDriverKey, [ClientDriverKey]),
        [Priority] = ISNULL(@Priority, [Priority]),
        [IsActive] = ISNULL(@IsActive, [IsActive]),
        [SupportsSearch] = ISNULL(@SupportsSearch, [SupportsSearch]),
        [Configuration] = CASE WHEN @Configuration_Clear = 1 THEN NULL ELSE ISNULL(@Configuration, [Configuration]) END,
        [RequiresOAuth] = ISNULL(@RequiresOAuth, [RequiresOAuth])
    WHERE
        [ID] = @ID

    -- Check if the update was successful
    IF @@ROWCOUNT = 0
        -- Nothing was updated, return no rows, but column structure from base view intact, semantically correct this way.
        SELECT TOP 0 * FROM [${flyway:defaultSchema}].[vwFileStorageProviders] WHERE 1=0
    ELSE
        -- Return the updated record so the caller can see the updated values and any calculated fields
        SELECT
            *
        FROM
            [${flyway:defaultSchema}].[vwFileStorageProviders]
        WHERE
            [ID] = @ID
END
GO
GRANT EXECUTE ON [${flyway:defaultSchema}].[spUpdateFileStorageProvider] TO [cdp_Integration], [cdp_Developer]
GO

------------------------------------------------------------
----- TRIGGER FOR __mj_UpdatedAt field for the FileStorageProvider table
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[trgUpdateFileStorageProvider]', 'TR') IS NOT NULL
    DROP TRIGGER [${flyway:defaultSchema}].[trgUpdateFileStorageProvider];
GO
CREATE TRIGGER [${flyway:defaultSchema}].trgUpdateFileStorageProvider
ON [${flyway:defaultSchema}].[FileStorageProvider]
AFTER UPDATE
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE
        [${flyway:defaultSchema}].[FileStorageProvider]
    SET
        __mj_UpdatedAt = GETUTCDATE()
    FROM
        [${flyway:defaultSchema}].[FileStorageProvider] AS _organicTable
    INNER JOIN
        INSERTED AS I ON
        _organicTable.[ID] = I.[ID];
END;
GO
