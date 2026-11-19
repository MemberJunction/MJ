-- Add optional @EntityID and @SuppressReturn parameters to spCreateRecordChange_Internal.
-- When SQLServerDataProvider embeds EXEC spCreateRecordChange_Internal inside a save or
-- delete batch, it discards the returned RecordChange view row via an unused @ResultChangesTable.
-- Passing @EntityID avoids the Entity lookup by Name, and passing @SuppressReturn = 1 skips the
-- OUTPUT table variable allocation and the vwRecordChanges 3-table join readback.

CREATE OR ALTER PROCEDURE [${flyway:defaultSchema}].[spCreateRecordChange_Internal]
    @EntityName          NVARCHAR(100),
    @RecordID            NVARCHAR(750),
    @UserID              UNIQUEIDENTIFIER,
    @Type                NVARCHAR(20),
    @ChangesJSON         NVARCHAR(MAX),
    @ChangesDescription  NVARCHAR(MAX),
    @FullRecordJSON      NVARCHAR(MAX),
    @Status              NCHAR(15),
    @Comments            NVARCHAR(MAX),
    @Source              NVARCHAR(20)     = NULL,
    @RestoredFromID      UNIQUEIDENTIFIER = NULL,
    @RestoreReason       NVARCHAR(MAX)    = NULL,
    @ChangeContext       NVARCHAR(MAX)    = NULL,
    @EntityID            UNIQUEIDENTIFIER = NULL,
    @SuppressReturn      BIT              = 0
AS
BEGIN
    SET NOCOUNT ON;

    DECLARE @ResolvedEntityID UNIQUEIDENTIFIER = COALESCE(
        @EntityID,
        (SELECT ID FROM [${flyway:defaultSchema}].[Entity] WHERE [Name] = @EntityName)
    );

    IF @SuppressReturn = 1
    BEGIN
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
                RestoreReason,
                ChangeContext
            )
        VALUES
            (
                @ResolvedEntityID,
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
                @RestoreReason,
                @ChangeContext
            );
        RETURN;
    END

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
            RestoreReason,
            ChangeContext
        )
    OUTPUT INSERTED.[ID] INTO @InsertedRow
    VALUES
        (
            @ResolvedEntityID,
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
            @RestoreReason,
            @ChangeContext
        );

    -- Return the new record from the base view so calculated fields are included
    SELECT *
    FROM [${flyway:defaultSchema}].[vwRecordChanges]
    WHERE [ID] = (SELECT [ID] FROM @InsertedRow);
END
GO

GRANT EXECUTE ON [${flyway:defaultSchema}].[spCreateRecordChange_Internal] TO [cdp_Developer], [cdp_Integration], [cdp_UI];
GO
