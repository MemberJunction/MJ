-- =====================================================================
-- Extend spCreateRecordChange_Internal for restore lineage
-- =====================================================================
-- The auto-generated `spCreateRecordChange` already accepts the new
-- @Source, @RestoredFromID, and @RestoreReason parameters (CodeGen
-- regenerated it after the v5.28.x migration), but the hand-written
-- `spCreateRecordChange_Internal` -- which is what BaseEntity Save() and
-- the IS-A sibling propagation path actually call -- still has the
-- pre-restore parameter list.
--
-- This migration drops and recreates `spCreateRecordChange_Internal`
-- with three additional optional parameters:
--   @Source           NVARCHAR(20)     defaults to 'Internal'
--   @RestoredFromID   UNIQUEIDENTIFIER defaults to NULL
--   @RestoreReason    NVARCHAR(MAX)    defaults to NULL
--
-- All existing callers continue to work unchanged because the new
-- parameters are positional/named optional with safe defaults.
-- =====================================================================

IF OBJECT_ID('[${flyway:defaultSchema}].[spCreateRecordChange_Internal]', 'P') IS NOT NULL
    DROP PROCEDURE [${flyway:defaultSchema}].[spCreateRecordChange_Internal];
GO

CREATE PROCEDURE [${flyway:defaultSchema}].[spCreateRecordChange_Internal]
    @EntityName       NVARCHAR(100),
    @RecordID         NVARCHAR(750),
    @UserID           UNIQUEIDENTIFIER,
    @Type             NVARCHAR(20),
    @ChangesJSON      NVARCHAR(MAX),
    @ChangesDescription NVARCHAR(MAX),
    @FullRecordJSON   NVARCHAR(MAX),
    @Status           NCHAR(15),
    @Comments         NVARCHAR(MAX),
    @Source           NVARCHAR(20)     = NULL,
    @RestoredFromID   UNIQUEIDENTIFIER = NULL,
    @RestoreReason    NVARCHAR(MAX)    = NULL
AS
BEGIN
    SET NOCOUNT ON;

    DECLARE @InsertedRow TABLE ([ID] UNIQUEIDENTIFIER);

    INSERT INTO [${flyway:defaultSchema}].[RecordChange]
        (
            EntityID,
            RecordID,
            UserID,
            Type,
            Source,
            ChangedAt,
            ChangesJSON,
            ChangesDescription,
            FullRecordJSON,
            Status,
            Comments,
            RestoredFromID,
            RestoreReason
        )
    OUTPUT INSERTED.[ID] INTO @InsertedRow
    VALUES
        (
            (SELECT ID FROM [${flyway:defaultSchema}].Entity WHERE Name = @EntityName),
            @RecordID,
            @UserID,
            @Type,
            ISNULL(@Source, 'Internal'),
            GETUTCDATE(),
            @ChangesJSON,
            @ChangesDescription,
            @FullRecordJSON,
            @Status,
            @Comments,
            @RestoredFromID,
            @RestoreReason
        );

    -- Return the new record from the base view so calculated fields are included
    SELECT *
    FROM [${flyway:defaultSchema}].vwRecordChanges
    WHERE [ID] = (SELECT [ID] FROM @InsertedRow);
END
GO

GRANT EXECUTE ON [${flyway:defaultSchema}].[spCreateRecordChange_Internal] TO [cdp_Developer], [cdp_Integration], [cdp_UI];
GO
