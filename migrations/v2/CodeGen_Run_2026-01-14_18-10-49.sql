/* SQL text to insert new entity field */

      IF NOT EXISTS (
         SELECT 1 FROM [${flyway:defaultSchema}].EntityField 
         WHERE ID = '401bfd36-48de-465d-ac5d-47d6a368ed5a'  OR 
               (EntityID = '28248F34-2837-EF11-86D4-6045BDEE16E6' AND Name = 'Configuration')
         -- check to make sure we're not inserting a duplicate entity field metadata record
      )
      BEGIN
         INSERT INTO [${flyway:defaultSchema}].EntityField
         (
            ID,
            EntityID,
            Sequence,
            Name,
            DisplayName,
            Description,
            Type,
            Length,
            Precision,
            Scale,
            AllowsNull,
            DefaultValue,
            AutoIncrement,
            AllowUpdateAPI,
            IsVirtual,
            RelatedEntityID,
            RelatedEntityFieldName,
            IsNameField,
            IncludeInUserSearchAPI,
            IncludeRelatedEntityNameFieldInBaseView,
            DefaultInView,
            IsPrimaryKey,
            IsUnique,
            RelatedEntityDisplayType
         )
         VALUES
         (
            '401bfd36-48de-465d-ac5d-47d6a368ed5a',
            '28248F34-2837-EF11-86D4-6045BDEE16E6', -- Entity: File Storage Providers
            100021,
            'Configuration',
            'Configuration',
            NULL,
            'nvarchar',
            -1,
            0,
            0,
            1,
            'null',
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
            'Dropdown'
         )
      END

/* SQL text to insert new entity field */

      IF NOT EXISTS (
         SELECT 1 FROM [${flyway:defaultSchema}].EntityField 
         WHERE ID = '2e906829-f86d-407a-83c9-80e8b5700d4b'  OR 
               (EntityID = '77CA76E4-008F-4A0B-8E91-C81BD719440F' AND Name = 'RecommendationMonth')
         -- check to make sure we're not inserting a duplicate entity field metadata record
      )
      BEGIN
         INSERT INTO [${flyway:defaultSchema}].EntityField
         (
            ID,
            EntityID,
            Sequence,
            Name,
            DisplayName,
            Description,
            Type,
            Length,
            Precision,
            Scale,
            AllowsNull,
            DefaultValue,
            AutoIncrement,
            AllowUpdateAPI,
            IsVirtual,
            RelatedEntityID,
            RelatedEntityFieldName,
            IsNameField,
            IncludeInUserSearchAPI,
            IncludeRelatedEntityNameFieldInBaseView,
            DefaultInView,
            IsPrimaryKey,
            IsUnique,
            RelatedEntityDisplayType
         )
         VALUES
         (
            '2e906829-f86d-407a-83c9-80e8b5700d4b',
            '77CA76E4-008F-4A0B-8E91-C81BD719440F', -- Entity: Playlist Songs
            100019,
            'RecommendationMonth',
            'Recommendation Month',
            'Month (1-12) this song is recommended for in yearly emotional playlists.',
            'int',
            4,
            10,
            0,
            1,
            'null',
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
            'Search'
         )
      END

/* SQL text to insert new entity field */

      IF NOT EXISTS (
         SELECT 1 FROM [${flyway:defaultSchema}].EntityField 
         WHERE ID = 'e0802bee-39f9-4f3e-a597-c1a120dd182c'  OR 
               (EntityID = '77CA76E4-008F-4A0B-8E91-C81BD719440F' AND Name = 'MatchedEmotion')
         -- check to make sure we're not inserting a duplicate entity field metadata record
      )
      BEGIN
         INSERT INTO [${flyway:defaultSchema}].EntityField
         (
            ID,
            EntityID,
            Sequence,
            Name,
            DisplayName,
            Description,
            Type,
            Length,
            Precision,
            Scale,
            AllowsNull,
            DefaultValue,
            AutoIncrement,
            AllowUpdateAPI,
            IsVirtual,
            RelatedEntityID,
            RelatedEntityFieldName,
            IsNameField,
            IncludeInUserSearchAPI,
            IncludeRelatedEntityNameFieldInBaseView,
            DefaultInView,
            IsPrimaryKey,
            IsUnique,
            RelatedEntityDisplayType
         )
         VALUES
         (
            'e0802bee-39f9-4f3e-a597-c1a120dd182c',
            '77CA76E4-008F-4A0B-8E91-C81BD719440F', -- Entity: Playlist Songs
            100020,
            'MatchedEmotion',
            'Matched Emotion',
            'The emotion from the user journey that this song was matched to.',
            'nvarchar',
            100,
            0,
            0,
            1,
            'null',
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
            'Search'
         )
      END

/* SQL text to insert new entity field */

      IF NOT EXISTS (
         SELECT 1 FROM [${flyway:defaultSchema}].EntityField 
         WHERE ID = '22bfeb3c-2e9c-4978-937d-37cf294b1246'  OR 
               (EntityID = '77CA76E4-008F-4A0B-8E91-C81BD719440F' AND Name = 'AIReason')
         -- check to make sure we're not inserting a duplicate entity field metadata record
      )
      BEGIN
         INSERT INTO [${flyway:defaultSchema}].EntityField
         (
            ID,
            EntityID,
            Sequence,
            Name,
            DisplayName,
            Description,
            Type,
            Length,
            Precision,
            Scale,
            AllowsNull,
            DefaultValue,
            AutoIncrement,
            AllowUpdateAPI,
            IsVirtual,
            RelatedEntityID,
            RelatedEntityFieldName,
            IsNameField,
            IncludeInUserSearchAPI,
            IncludeRelatedEntityNameFieldInBaseView,
            DefaultInView,
            IsPrimaryKey,
            IsUnique,
            RelatedEntityDisplayType
         )
         VALUES
         (
            '22bfeb3c-2e9c-4978-937d-37cf294b1246',
            '77CA76E4-008F-4A0B-8E91-C81BD719440F', -- Entity: Playlist Songs
            100021,
            'AIReason',
            'AI Reason',
            'AI-generated explanation of why this song was recommended.',
            'nvarchar',
            1000,
            0,
            0,
            1,
            'null',
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
            'Search'
         )
      END

/* SQL text to insert new entity field */

      IF NOT EXISTS (
         SELECT 1 FROM [${flyway:defaultSchema}].EntityField 
         WHERE ID = '12ca7cba-91e8-4319-91ea-895ead1e1268'  OR 
               (EntityID = 'FC3C971D-9FD7-40C8-A428-C8E66A5BB972' AND Name = 'SourceYear')
         -- check to make sure we're not inserting a duplicate entity field metadata record
      )
      BEGIN
         INSERT INTO [${flyway:defaultSchema}].EntityField
         (
            ID,
            EntityID,
            Sequence,
            Name,
            DisplayName,
            Description,
            Type,
            Length,
            Precision,
            Scale,
            AllowsNull,
            DefaultValue,
            AutoIncrement,
            AllowUpdateAPI,
            IsVirtual,
            RelatedEntityID,
            RelatedEntityFieldName,
            IsNameField,
            IncludeInUserSearchAPI,
            IncludeRelatedEntityNameFieldInBaseView,
            DefaultInView,
            IsPrimaryKey,
            IsUnique,
            RelatedEntityDisplayType
         )
         VALUES
         (
            '12ca7cba-91e8-4319-91ea-895ead1e1268',
            'FC3C971D-9FD7-40C8-A428-C8E66A5BB972', -- Entity: Playlists
            100024,
            'SourceYear',
            'Source Year',
            'The year from which emotional patterns were analyzed to generate this playlist.',
            'int',
            4,
            10,
            0,
            1,
            'null',
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
            'Search'
         )
      END

/* SQL text to insert new entity field */

      IF NOT EXISTS (
         SELECT 1 FROM [${flyway:defaultSchema}].EntityField 
         WHERE ID = '6c0a518a-77ac-4110-bc17-2f24f3b4ddbb'  OR 
               (EntityID = 'FC3C971D-9FD7-40C8-A428-C8E66A5BB972' AND Name = 'TargetYear')
         -- check to make sure we're not inserting a duplicate entity field metadata record
      )
      BEGIN
         INSERT INTO [${flyway:defaultSchema}].EntityField
         (
            ID,
            EntityID,
            Sequence,
            Name,
            DisplayName,
            Description,
            Type,
            Length,
            Precision,
            Scale,
            AllowsNull,
            DefaultValue,
            AutoIncrement,
            AllowUpdateAPI,
            IsVirtual,
            RelatedEntityID,
            RelatedEntityFieldName,
            IsNameField,
            IncludeInUserSearchAPI,
            IncludeRelatedEntityNameFieldInBaseView,
            DefaultInView,
            IsPrimaryKey,
            IsUnique,
            RelatedEntityDisplayType
         )
         VALUES
         (
            '6c0a518a-77ac-4110-bc17-2f24f3b4ddbb',
            'FC3C971D-9FD7-40C8-A428-C8E66A5BB972', -- Entity: Playlists
            100025,
            'TargetYear',
            'Target Year',
            'The year this playlist is intended to accompany the user through.',
            'int',
            4,
            10,
            0,
            1,
            'null',
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
            'Search'
         )
      END

/* SQL text to insert new entity field */

      IF NOT EXISTS (
         SELECT 1 FROM [${flyway:defaultSchema}].EntityField 
         WHERE ID = 'bdb4c9b6-83d5-4055-ae0d-5996498e901f'  OR 
               (EntityID = 'FC3C971D-9FD7-40C8-A428-C8E66A5BB972' AND Name = 'PlaylistType')
         -- check to make sure we're not inserting a duplicate entity field metadata record
      )
      BEGIN
         INSERT INTO [${flyway:defaultSchema}].EntityField
         (
            ID,
            EntityID,
            Sequence,
            Name,
            DisplayName,
            Description,
            Type,
            Length,
            Precision,
            Scale,
            AllowsNull,
            DefaultValue,
            AutoIncrement,
            AllowUpdateAPI,
            IsVirtual,
            RelatedEntityID,
            RelatedEntityFieldName,
            IsNameField,
            IncludeInUserSearchAPI,
            IncludeRelatedEntityNameFieldInBaseView,
            DefaultInView,
            IsPrimaryKey,
            IsUnique,
            RelatedEntityDisplayType
         )
         VALUES
         (
            'bdb4c9b6-83d5-4055-ae0d-5996498e901f',
            'FC3C971D-9FD7-40C8-A428-C8E66A5BB972', -- Entity: Playlists
            100026,
            'PlaylistType',
            'Playlist Type',
            'Type of playlist: YearlyEmotional, Custom, General, etc.',
            'nvarchar',
            100,
            0,
            0,
            1,
            'null',
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
            'Search'
         )
      END

/* Index for Foreign Keys for FileStorageProvider */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: File Storage Providers
-- Item: Index for Foreign Keys
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------


/* Base View SQL for File Storage Providers */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: File Storage Providers
-- Item: vwFileStorageProviders
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- BASE VIEW FOR ENTITY:      File Storage Providers
-----               SCHEMA:      ${flyway:defaultSchema}
-----               BASE TABLE:  FileStorageProvider
-----               PRIMARY KEY: ID
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[vwFileStorageProviders]', 'V') IS NOT NULL
    DROP VIEW [${flyway:defaultSchema}].[vwFileStorageProviders];
GO

CREATE VIEW [${flyway:defaultSchema}].[vwFileStorageProviders]
AS
SELECT
    f.*
FROM
    [${flyway:defaultSchema}].[FileStorageProvider] AS f
GO
GRANT SELECT ON [${flyway:defaultSchema}].[vwFileStorageProviders] TO [cdp_UI], [cdp_Integration], [cdp_Developer]
    

/* Base View Permissions SQL for File Storage Providers */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: File Storage Providers
-- Item: Permissions for vwFileStorageProviders
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

GRANT SELECT ON [${flyway:defaultSchema}].[vwFileStorageProviders] TO [cdp_UI], [cdp_Integration], [cdp_Developer]

/* spCreate SQL for File Storage Providers */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: File Storage Providers
-- Item: spCreateFileStorageProvider
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- CREATE PROCEDURE FOR FileStorageProvider
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[spCreateFileStorageProvider]', 'P') IS NOT NULL
    DROP PROCEDURE [${flyway:defaultSchema}].[spCreateFileStorageProvider];
GO

CREATE PROCEDURE [${flyway:defaultSchema}].[spCreateFileStorageProvider]
    @ID uniqueidentifier = NULL,
    @Name nvarchar(50),
    @Description nvarchar(MAX),
    @ServerDriverKey nvarchar(100),
    @ClientDriverKey nvarchar(100),
    @Priority int = NULL,
    @IsActive bit = NULL,
    @SupportsSearch bit = NULL,
    @Configuration nvarchar(MAX)
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
                [Configuration]
            )
        OUTPUT INSERTED.[ID] INTO @InsertedRow
        VALUES
            (
                @ID,
                @Name,
                @Description,
                @ServerDriverKey,
                @ClientDriverKey,
                ISNULL(@Priority, 0),
                ISNULL(@IsActive, 1),
                ISNULL(@SupportsSearch, 0),
                @Configuration
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
                [Configuration]
            )
        OUTPUT INSERTED.[ID] INTO @InsertedRow
        VALUES
            (
                @Name,
                @Description,
                @ServerDriverKey,
                @ClientDriverKey,
                ISNULL(@Priority, 0),
                ISNULL(@IsActive, 1),
                ISNULL(@SupportsSearch, 0),
                @Configuration
            )
    END
    -- return the new record from the base view, which might have some calculated fields
    SELECT * FROM [${flyway:defaultSchema}].[vwFileStorageProviders] WHERE [ID] = (SELECT [ID] FROM @InsertedRow)
END
GO
GRANT EXECUTE ON [${flyway:defaultSchema}].[spCreateFileStorageProvider] TO [cdp_Integration], [cdp_Developer]
    

/* spCreate Permissions for File Storage Providers */

GRANT EXECUTE ON [${flyway:defaultSchema}].[spCreateFileStorageProvider] TO [cdp_Integration], [cdp_Developer]



/* spUpdate SQL for File Storage Providers */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: File Storage Providers
-- Item: spUpdateFileStorageProvider
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- UPDATE PROCEDURE FOR FileStorageProvider
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[spUpdateFileStorageProvider]', 'P') IS NOT NULL
    DROP PROCEDURE [${flyway:defaultSchema}].[spUpdateFileStorageProvider];
GO

CREATE PROCEDURE [${flyway:defaultSchema}].[spUpdateFileStorageProvider]
    @ID uniqueidentifier,
    @Name nvarchar(50),
    @Description nvarchar(MAX),
    @ServerDriverKey nvarchar(100),
    @ClientDriverKey nvarchar(100),
    @Priority int,
    @IsActive bit,
    @SupportsSearch bit,
    @Configuration nvarchar(MAX)
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE
        [${flyway:defaultSchema}].[FileStorageProvider]
    SET
        [Name] = @Name,
        [Description] = @Description,
        [ServerDriverKey] = @ServerDriverKey,
        [ClientDriverKey] = @ClientDriverKey,
        [Priority] = @Priority,
        [IsActive] = @IsActive,
        [SupportsSearch] = @SupportsSearch,
        [Configuration] = @Configuration
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
        

/* spUpdate Permissions for File Storage Providers */

GRANT EXECUTE ON [${flyway:defaultSchema}].[spUpdateFileStorageProvider] TO [cdp_Integration], [cdp_Developer]



/* spDelete SQL for File Storage Providers */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: File Storage Providers
-- Item: spDeleteFileStorageProvider
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- DELETE PROCEDURE FOR FileStorageProvider
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[spDeleteFileStorageProvider]', 'P') IS NOT NULL
    DROP PROCEDURE [${flyway:defaultSchema}].[spDeleteFileStorageProvider];
GO

CREATE PROCEDURE [${flyway:defaultSchema}].[spDeleteFileStorageProvider]
    @ID uniqueidentifier
AS
BEGIN
    SET NOCOUNT ON;

    DELETE FROM
        [${flyway:defaultSchema}].[FileStorageProvider]
    WHERE
        [ID] = @ID


    -- Check if the delete was successful
    IF @@ROWCOUNT = 0
        SELECT NULL AS [ID] -- Return NULL for all primary key fields to indicate no record was deleted
    ELSE
        SELECT @ID AS [ID] -- Return the primary key values to indicate we successfully deleted the record
END
GO
GRANT EXECUTE ON [${flyway:defaultSchema}].[spDeleteFileStorageProvider] TO [cdp_Integration], [cdp_Developer]
    

/* spDelete Permissions for File Storage Providers */

GRANT EXECUTE ON [${flyway:defaultSchema}].[spDeleteFileStorageProvider] TO [cdp_Integration], [cdp_Developer]



/* Index for Foreign Keys for PlaylistSong */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: Playlist Songs
-- Item: Index for Foreign Keys
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------
-- Index for foreign key PlaylistID in table PlaylistSong
IF NOT EXISTS (
    SELECT 1
    FROM sys.indexes
    WHERE name = 'IDX_AUTO_MJ_FKEY_PlaylistSong_PlaylistID' 
    AND object_id = OBJECT_ID('[spotify].[PlaylistSong]')
)
CREATE INDEX IDX_AUTO_MJ_FKEY_PlaylistSong_PlaylistID ON [spotify].[PlaylistSong] ([PlaylistID]);

-- Index for foreign key SongID in table PlaylistSong
IF NOT EXISTS (
    SELECT 1
    FROM sys.indexes
    WHERE name = 'IDX_AUTO_MJ_FKEY_PlaylistSong_SongID' 
    AND object_id = OBJECT_ID('[spotify].[PlaylistSong]')
)
CREATE INDEX IDX_AUTO_MJ_FKEY_PlaylistSong_SongID ON [spotify].[PlaylistSong] ([SongID]);

/* Index for Foreign Keys for Playlist */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: Playlists
-- Item: Index for Foreign Keys
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------
-- Index for foreign key UserID in table Playlist
IF NOT EXISTS (
    SELECT 1
    FROM sys.indexes
    WHERE name = 'IDX_AUTO_MJ_FKEY_Playlist_UserID' 
    AND object_id = OBJECT_ID('[spotify].[Playlist]')
)
CREATE INDEX IDX_AUTO_MJ_FKEY_Playlist_UserID ON [spotify].[Playlist] ([UserID]);

/* Base View SQL for Playlist Songs */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: Playlist Songs
-- Item: vwPlaylistSongs
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- BASE VIEW FOR ENTITY:      Playlist Songs
-----               SCHEMA:      spotify
-----               BASE TABLE:  PlaylistSong
-----               PRIMARY KEY: ID
------------------------------------------------------------
IF OBJECT_ID('[spotify].[vwPlaylistSongs]', 'V') IS NOT NULL
    DROP VIEW [spotify].[vwPlaylistSongs];
GO

CREATE VIEW [spotify].[vwPlaylistSongs]
AS
SELECT
    p.*,
    Playlist_PlaylistID.[Name] AS [Playlist],
    Song_SongID.[Name] AS [Song]
FROM
    [spotify].[PlaylistSong] AS p
INNER JOIN
    [spotify].[Playlist] AS Playlist_PlaylistID
  ON
    [p].[PlaylistID] = Playlist_PlaylistID.[ID]
INNER JOIN
    [spotify].[Song] AS Song_SongID
  ON
    [p].[SongID] = Song_SongID.[ID]
GO
GRANT SELECT ON [spotify].[vwPlaylistSongs] TO [cdp_UI], [cdp_Developer], [cdp_Integration], [cdp_UI], [cdp_Developer], [cdp_Integration]
    

/* Base View Permissions SQL for Playlist Songs */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: Playlist Songs
-- Item: Permissions for vwPlaylistSongs
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

GRANT SELECT ON [spotify].[vwPlaylistSongs] TO [cdp_UI], [cdp_Developer], [cdp_Integration], [cdp_UI], [cdp_Developer], [cdp_Integration]

/* spCreate SQL for Playlist Songs */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: Playlist Songs
-- Item: spCreatePlaylistSong
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- CREATE PROCEDURE FOR PlaylistSong
------------------------------------------------------------
IF OBJECT_ID('[spotify].[spCreatePlaylistSong]', 'P') IS NOT NULL
    DROP PROCEDURE [spotify].[spCreatePlaylistSong];
GO

CREATE PROCEDURE [spotify].[spCreatePlaylistSong]
    @ID uniqueidentifier = NULL,
    @PlaylistID uniqueidentifier,
    @SongID uniqueidentifier,
    @SequenceNumber int,
    @AddedFromWeb bit = NULL,
    @PopularityReason nvarchar(500),
    @RecommendationMonth int,
    @MatchedEmotion nvarchar(50),
    @AIReason nvarchar(500)
AS
BEGIN
    SET NOCOUNT ON;
    DECLARE @InsertedRow TABLE ([ID] UNIQUEIDENTIFIER)
    
    IF @ID IS NOT NULL
    BEGIN
        -- User provided a value, use it
        INSERT INTO [spotify].[PlaylistSong]
            (
                [ID],
                [PlaylistID],
                [SongID],
                [SequenceNumber],
                [AddedFromWeb],
                [PopularityReason],
                [RecommendationMonth],
                [MatchedEmotion],
                [AIReason]
            )
        OUTPUT INSERTED.[ID] INTO @InsertedRow
        VALUES
            (
                @ID,
                @PlaylistID,
                @SongID,
                @SequenceNumber,
                ISNULL(@AddedFromWeb, 0),
                @PopularityReason,
                @RecommendationMonth,
                @MatchedEmotion,
                @AIReason
            )
    END
    ELSE
    BEGIN
        -- No value provided, let database use its default (e.g., NEWSEQUENTIALID())
        INSERT INTO [spotify].[PlaylistSong]
            (
                [PlaylistID],
                [SongID],
                [SequenceNumber],
                [AddedFromWeb],
                [PopularityReason],
                [RecommendationMonth],
                [MatchedEmotion],
                [AIReason]
            )
        OUTPUT INSERTED.[ID] INTO @InsertedRow
        VALUES
            (
                @PlaylistID,
                @SongID,
                @SequenceNumber,
                ISNULL(@AddedFromWeb, 0),
                @PopularityReason,
                @RecommendationMonth,
                @MatchedEmotion,
                @AIReason
            )
    END
    -- return the new record from the base view, which might have some calculated fields
    SELECT * FROM [spotify].[vwPlaylistSongs] WHERE [ID] = (SELECT [ID] FROM @InsertedRow)
END
GO
GRANT EXECUTE ON [spotify].[spCreatePlaylistSong] TO [cdp_Developer], [cdp_Integration], [cdp_Developer], [cdp_Integration]
    

/* spCreate Permissions for Playlist Songs */

GRANT EXECUTE ON [spotify].[spCreatePlaylistSong] TO [cdp_Developer], [cdp_Integration], [cdp_Developer], [cdp_Integration]



/* spUpdate SQL for Playlist Songs */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: Playlist Songs
-- Item: spUpdatePlaylistSong
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- UPDATE PROCEDURE FOR PlaylistSong
------------------------------------------------------------
IF OBJECT_ID('[spotify].[spUpdatePlaylistSong]', 'P') IS NOT NULL
    DROP PROCEDURE [spotify].[spUpdatePlaylistSong];
GO

CREATE PROCEDURE [spotify].[spUpdatePlaylistSong]
    @ID uniqueidentifier,
    @PlaylistID uniqueidentifier,
    @SongID uniqueidentifier,
    @SequenceNumber int,
    @AddedFromWeb bit,
    @PopularityReason nvarchar(500),
    @RecommendationMonth int,
    @MatchedEmotion nvarchar(50),
    @AIReason nvarchar(500)
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE
        [spotify].[PlaylistSong]
    SET
        [PlaylistID] = @PlaylistID,
        [SongID] = @SongID,
        [SequenceNumber] = @SequenceNumber,
        [AddedFromWeb] = @AddedFromWeb,
        [PopularityReason] = @PopularityReason,
        [RecommendationMonth] = @RecommendationMonth,
        [MatchedEmotion] = @MatchedEmotion,
        [AIReason] = @AIReason
    WHERE
        [ID] = @ID

    -- Check if the update was successful
    IF @@ROWCOUNT = 0
        -- Nothing was updated, return no rows, but column structure from base view intact, semantically correct this way.
        SELECT TOP 0 * FROM [spotify].[vwPlaylistSongs] WHERE 1=0
    ELSE
        -- Return the updated record so the caller can see the updated values and any calculated fields
        SELECT
                                        *
                                    FROM
                                        [spotify].[vwPlaylistSongs]
                                    WHERE
                                        [ID] = @ID
                                    
END
GO

GRANT EXECUTE ON [spotify].[spUpdatePlaylistSong] TO [cdp_Developer], [cdp_Integration], [cdp_Developer], [cdp_Integration]
GO

------------------------------------------------------------
----- TRIGGER FOR __mj_UpdatedAt field for the PlaylistSong table
------------------------------------------------------------
IF OBJECT_ID('[spotify].[trgUpdatePlaylistSong]', 'TR') IS NOT NULL
    DROP TRIGGER [spotify].[trgUpdatePlaylistSong];
GO
CREATE TRIGGER [spotify].trgUpdatePlaylistSong
ON [spotify].[PlaylistSong]
AFTER UPDATE
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE
        [spotify].[PlaylistSong]
    SET
        __mj_UpdatedAt = GETUTCDATE()
    FROM
        [spotify].[PlaylistSong] AS _organicTable
    INNER JOIN
        INSERTED AS I ON
        _organicTable.[ID] = I.[ID];
END;
GO
        

/* spUpdate Permissions for Playlist Songs */

GRANT EXECUTE ON [spotify].[spUpdatePlaylistSong] TO [cdp_Developer], [cdp_Integration], [cdp_Developer], [cdp_Integration]



/* spDelete SQL for Playlist Songs */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: Playlist Songs
-- Item: spDeletePlaylistSong
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- DELETE PROCEDURE FOR PlaylistSong
------------------------------------------------------------
IF OBJECT_ID('[spotify].[spDeletePlaylistSong]', 'P') IS NOT NULL
    DROP PROCEDURE [spotify].[spDeletePlaylistSong];
GO

CREATE PROCEDURE [spotify].[spDeletePlaylistSong]
    @ID uniqueidentifier
AS
BEGIN
    SET NOCOUNT ON;

    DELETE FROM
        [spotify].[PlaylistSong]
    WHERE
        [ID] = @ID


    -- Check if the delete was successful
    IF @@ROWCOUNT = 0
        SELECT NULL AS [ID] -- Return NULL for all primary key fields to indicate no record was deleted
    ELSE
        SELECT @ID AS [ID] -- Return the primary key values to indicate we successfully deleted the record
END
GO
GRANT EXECUTE ON [spotify].[spDeletePlaylistSong] TO [cdp_Integration], [cdp_Integration]
    

/* spDelete Permissions for Playlist Songs */

GRANT EXECUTE ON [spotify].[spDeletePlaylistSong] TO [cdp_Integration], [cdp_Integration]



/* Base View SQL for Playlists */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: Playlists
-- Item: vwPlaylists
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- BASE VIEW FOR ENTITY:      Playlists
-----               SCHEMA:      spotify
-----               BASE TABLE:  Playlist
-----               PRIMARY KEY: ID
------------------------------------------------------------
IF OBJECT_ID('[spotify].[vwPlaylists]', 'V') IS NOT NULL
    DROP VIEW [spotify].[vwPlaylists];
GO

CREATE VIEW [spotify].[vwPlaylists]
AS
SELECT
    p.*,
    User_UserID.[Name] AS [User]
FROM
    [spotify].[Playlist] AS p
INNER JOIN
    [${flyway:defaultSchema}].[User] AS User_UserID
  ON
    [p].[UserID] = User_UserID.[ID]
GO
GRANT SELECT ON [spotify].[vwPlaylists] TO [cdp_UI], [cdp_Developer], [cdp_Integration], [cdp_UI], [cdp_Developer], [cdp_Integration]
    

/* Base View Permissions SQL for Playlists */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: Playlists
-- Item: Permissions for vwPlaylists
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

GRANT SELECT ON [spotify].[vwPlaylists] TO [cdp_UI], [cdp_Developer], [cdp_Integration], [cdp_UI], [cdp_Developer], [cdp_Integration]

/* spCreate SQL for Playlists */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: Playlists
-- Item: spCreatePlaylist
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- CREATE PROCEDURE FOR Playlist
------------------------------------------------------------
IF OBJECT_ID('[spotify].[spCreatePlaylist]', 'P') IS NOT NULL
    DROP PROCEDURE [spotify].[spCreatePlaylist];
GO

CREATE PROCEDURE [spotify].[spCreatePlaylist]
    @ID uniqueidentifier = NULL,
    @UserID uniqueidentifier,
    @Name nvarchar(255),
    @Description nvarchar(MAX),
    @Genre nvarchar(100),
    @CreatedByAI bit = NULL,
    @AIGenerationNotes nvarchar(MAX),
    @IsPublic bit = NULL,
    @TotalDuration int,
    @SourceYear int,
    @TargetYear int,
    @PlaylistType nvarchar(50)
AS
BEGIN
    SET NOCOUNT ON;
    DECLARE @InsertedRow TABLE ([ID] UNIQUEIDENTIFIER)
    
    IF @ID IS NOT NULL
    BEGIN
        -- User provided a value, use it
        INSERT INTO [spotify].[Playlist]
            (
                [ID],
                [UserID],
                [Name],
                [Description],
                [Genre],
                [CreatedByAI],
                [AIGenerationNotes],
                [IsPublic],
                [TotalDuration],
                [SourceYear],
                [TargetYear],
                [PlaylistType]
            )
        OUTPUT INSERTED.[ID] INTO @InsertedRow
        VALUES
            (
                @ID,
                @UserID,
                @Name,
                @Description,
                @Genre,
                ISNULL(@CreatedByAI, 1),
                @AIGenerationNotes,
                ISNULL(@IsPublic, 0),
                @TotalDuration,
                @SourceYear,
                @TargetYear,
                @PlaylistType
            )
    END
    ELSE
    BEGIN
        -- No value provided, let database use its default (e.g., NEWSEQUENTIALID())
        INSERT INTO [spotify].[Playlist]
            (
                [UserID],
                [Name],
                [Description],
                [Genre],
                [CreatedByAI],
                [AIGenerationNotes],
                [IsPublic],
                [TotalDuration],
                [SourceYear],
                [TargetYear],
                [PlaylistType]
            )
        OUTPUT INSERTED.[ID] INTO @InsertedRow
        VALUES
            (
                @UserID,
                @Name,
                @Description,
                @Genre,
                ISNULL(@CreatedByAI, 1),
                @AIGenerationNotes,
                ISNULL(@IsPublic, 0),
                @TotalDuration,
                @SourceYear,
                @TargetYear,
                @PlaylistType
            )
    END
    -- return the new record from the base view, which might have some calculated fields
    SELECT * FROM [spotify].[vwPlaylists] WHERE [ID] = (SELECT [ID] FROM @InsertedRow)
END
GO
GRANT EXECUTE ON [spotify].[spCreatePlaylist] TO [cdp_Developer], [cdp_Integration], [cdp_Developer], [cdp_Integration]
    

/* spCreate Permissions for Playlists */

GRANT EXECUTE ON [spotify].[spCreatePlaylist] TO [cdp_Developer], [cdp_Integration], [cdp_Developer], [cdp_Integration]



/* spUpdate SQL for Playlists */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: Playlists
-- Item: spUpdatePlaylist
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- UPDATE PROCEDURE FOR Playlist
------------------------------------------------------------
IF OBJECT_ID('[spotify].[spUpdatePlaylist]', 'P') IS NOT NULL
    DROP PROCEDURE [spotify].[spUpdatePlaylist];
GO

CREATE PROCEDURE [spotify].[spUpdatePlaylist]
    @ID uniqueidentifier,
    @UserID uniqueidentifier,
    @Name nvarchar(255),
    @Description nvarchar(MAX),
    @Genre nvarchar(100),
    @CreatedByAI bit,
    @AIGenerationNotes nvarchar(MAX),
    @IsPublic bit,
    @TotalDuration int,
    @SourceYear int,
    @TargetYear int,
    @PlaylistType nvarchar(50)
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE
        [spotify].[Playlist]
    SET
        [UserID] = @UserID,
        [Name] = @Name,
        [Description] = @Description,
        [Genre] = @Genre,
        [CreatedByAI] = @CreatedByAI,
        [AIGenerationNotes] = @AIGenerationNotes,
        [IsPublic] = @IsPublic,
        [TotalDuration] = @TotalDuration,
        [SourceYear] = @SourceYear,
        [TargetYear] = @TargetYear,
        [PlaylistType] = @PlaylistType
    WHERE
        [ID] = @ID

    -- Check if the update was successful
    IF @@ROWCOUNT = 0
        -- Nothing was updated, return no rows, but column structure from base view intact, semantically correct this way.
        SELECT TOP 0 * FROM [spotify].[vwPlaylists] WHERE 1=0
    ELSE
        -- Return the updated record so the caller can see the updated values and any calculated fields
        SELECT
                                        *
                                    FROM
                                        [spotify].[vwPlaylists]
                                    WHERE
                                        [ID] = @ID
                                    
END
GO

GRANT EXECUTE ON [spotify].[spUpdatePlaylist] TO [cdp_Developer], [cdp_Integration], [cdp_Developer], [cdp_Integration]
GO

------------------------------------------------------------
----- TRIGGER FOR __mj_UpdatedAt field for the Playlist table
------------------------------------------------------------
IF OBJECT_ID('[spotify].[trgUpdatePlaylist]', 'TR') IS NOT NULL
    DROP TRIGGER [spotify].[trgUpdatePlaylist];
GO
CREATE TRIGGER [spotify].trgUpdatePlaylist
ON [spotify].[Playlist]
AFTER UPDATE
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE
        [spotify].[Playlist]
    SET
        __mj_UpdatedAt = GETUTCDATE()
    FROM
        [spotify].[Playlist] AS _organicTable
    INNER JOIN
        INSERTED AS I ON
        _organicTable.[ID] = I.[ID];
END;
GO
        

/* spUpdate Permissions for Playlists */

GRANT EXECUTE ON [spotify].[spUpdatePlaylist] TO [cdp_Developer], [cdp_Integration], [cdp_Developer], [cdp_Integration]



/* spDelete SQL for Playlists */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: Playlists
-- Item: spDeletePlaylist
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- DELETE PROCEDURE FOR Playlist
------------------------------------------------------------
IF OBJECT_ID('[spotify].[spDeletePlaylist]', 'P') IS NOT NULL
    DROP PROCEDURE [spotify].[spDeletePlaylist];
GO

CREATE PROCEDURE [spotify].[spDeletePlaylist]
    @ID uniqueidentifier
AS
BEGIN
    SET NOCOUNT ON;

    DELETE FROM
        [spotify].[Playlist]
    WHERE
        [ID] = @ID


    -- Check if the delete was successful
    IF @@ROWCOUNT = 0
        SELECT NULL AS [ID] -- Return NULL for all primary key fields to indicate no record was deleted
    ELSE
        SELECT @ID AS [ID] -- Return the primary key values to indicate we successfully deleted the record
END
GO
GRANT EXECUTE ON [spotify].[spDeletePlaylist] TO [cdp_Integration], [cdp_Integration]
    

/* spDelete Permissions for Playlists */

GRANT EXECUTE ON [spotify].[spDeletePlaylist] TO [cdp_Integration], [cdp_Integration]



/* Set field properties for entity */

            UPDATE [${flyway:defaultSchema}].EntityField
            SET IsNameField = 1
            WHERE ID = '054F17F0-6F36-EF11-86D4-6045BDEE16E6'
            AND AutoUpdateIsNameField = 1
         

            UPDATE [${flyway:defaultSchema}].EntityField
            SET DefaultInView = 1
            WHERE ID = '054F17F0-6F36-EF11-86D4-6045BDEE16E6'
            AND AutoUpdateDefaultInView = 1
         

            UPDATE [${flyway:defaultSchema}].EntityField
            SET DefaultInView = 1
            WHERE ID = '064F17F0-6F36-EF11-86D4-6045BDEE16E6'
            AND AutoUpdateDefaultInView = 1
         

            UPDATE [${flyway:defaultSchema}].EntityField
            SET DefaultInView = 1
            WHERE ID = '094F17F0-6F36-EF11-86D4-6045BDEE16E6'
            AND AutoUpdateDefaultInView = 1
         

            UPDATE [${flyway:defaultSchema}].EntityField
            SET DefaultInView = 1
            WHERE ID = '0A4F17F0-6F36-EF11-86D4-6045BDEE16E6'
            AND AutoUpdateDefaultInView = 1
         

            UPDATE [${flyway:defaultSchema}].EntityField
            SET DefaultInView = 1
            WHERE ID = 'F7CFAB57-DCC4-4BA6-ACA1-401636343F43'
            AND AutoUpdateDefaultInView = 1
         

               UPDATE [${flyway:defaultSchema}].EntityField
               SET IncludeInUserSearchAPI = 1
               WHERE ID = '054F17F0-6F36-EF11-86D4-6045BDEE16E6'
               AND AutoUpdateIncludeInUserSearchAPI = 1
            

               UPDATE [${flyway:defaultSchema}].EntityField
               SET IncludeInUserSearchAPI = 1
               WHERE ID = '064F17F0-6F36-EF11-86D4-6045BDEE16E6'
               AND AutoUpdateIncludeInUserSearchAPI = 1
            

/* Set field properties for entity */

            UPDATE [${flyway:defaultSchema}].EntityField
            SET IsNameField = 1
            WHERE ID = '0342538E-6EFF-4115-A2D8-3A42AD861C73'
            AND AutoUpdateIsNameField = 1
         

            UPDATE [${flyway:defaultSchema}].EntityField
            SET DefaultInView = 1
            WHERE ID = 'FD199202-70D8-43E5-B2C4-51849E5E1454'
            AND AutoUpdateDefaultInView = 1
         

            UPDATE [${flyway:defaultSchema}].EntityField
            SET DefaultInView = 1
            WHERE ID = '0152847A-D0F9-4634-BF20-0C8CA31A96F2'
            AND AutoUpdateDefaultInView = 1
         

            UPDATE [${flyway:defaultSchema}].EntityField
            SET DefaultInView = 1
            WHERE ID = '0342538E-6EFF-4115-A2D8-3A42AD861C73'
            AND AutoUpdateDefaultInView = 1
         

               UPDATE [${flyway:defaultSchema}].EntityField
               SET IncludeInUserSearchAPI = 1
               WHERE ID = 'E0802BEE-39F9-4F3E-A597-C1A120DD182C'
               AND AutoUpdateIncludeInUserSearchAPI = 1
            

               UPDATE [${flyway:defaultSchema}].EntityField
               SET IncludeInUserSearchAPI = 1
               WHERE ID = '0152847A-D0F9-4634-BF20-0C8CA31A96F2'
               AND AutoUpdateIncludeInUserSearchAPI = 1
            

               UPDATE [${flyway:defaultSchema}].EntityField
               SET IncludeInUserSearchAPI = 1
               WHERE ID = '0342538E-6EFF-4115-A2D8-3A42AD861C73'
               AND AutoUpdateIncludeInUserSearchAPI = 1
            

/* Set field properties for entity */

            UPDATE [${flyway:defaultSchema}].EntityField
            SET IsNameField = 1
            WHERE ID = '1660C2A8-4E78-4369-B1CD-F5684B43B21F'
            AND AutoUpdateIsNameField = 1
         

            UPDATE [${flyway:defaultSchema}].EntityField
            SET DefaultInView = 1
            WHERE ID = '1660C2A8-4E78-4369-B1CD-F5684B43B21F'
            AND AutoUpdateDefaultInView = 1
         

            UPDATE [${flyway:defaultSchema}].EntityField
            SET DefaultInView = 1
            WHERE ID = 'C5D5225F-0487-49B4-9CB7-4FA6A980EA90'
            AND AutoUpdateDefaultInView = 1
         

            UPDATE [${flyway:defaultSchema}].EntityField
            SET DefaultInView = 1
            WHERE ID = '4D7D7BB9-6A2F-4F5A-8065-0FD85099922D'
            AND AutoUpdateDefaultInView = 1
         

            UPDATE [${flyway:defaultSchema}].EntityField
            SET DefaultInView = 1
            WHERE ID = '6C0A518A-77AC-4110-BC17-2F24F3B4DDBB'
            AND AutoUpdateDefaultInView = 1
         

            UPDATE [${flyway:defaultSchema}].EntityField
            SET DefaultInView = 1
            WHERE ID = 'BDB4C9B6-83D5-4055-AE0D-5996498E901F'
            AND AutoUpdateDefaultInView = 1
         

               UPDATE [${flyway:defaultSchema}].EntityField
               SET IncludeInUserSearchAPI = 1
               WHERE ID = '1660C2A8-4E78-4369-B1CD-F5684B43B21F'
               AND AutoUpdateIncludeInUserSearchAPI = 1
            

               UPDATE [${flyway:defaultSchema}].EntityField
               SET IncludeInUserSearchAPI = 1
               WHERE ID = 'C5D5225F-0487-49B4-9CB7-4FA6A980EA90'
               AND AutoUpdateIncludeInUserSearchAPI = 1
            

               UPDATE [${flyway:defaultSchema}].EntityField
               SET IncludeInUserSearchAPI = 1
               WHERE ID = 'BDB4C9B6-83D5-4055-AE0D-5996498E901F'
               AND AutoUpdateIncludeInUserSearchAPI = 1
            

               UPDATE [${flyway:defaultSchema}].EntityField
               SET IncludeInUserSearchAPI = 1
               WHERE ID = '8B354E07-E905-4904-8B48-A9A4989CA51A'
               AND AutoUpdateIncludeInUserSearchAPI = 1
            

/* Set categories for 11 fields */
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'Provider Identification',
       GeneratedFormSection = 'Category',
       DisplayName = 'ID',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = '044F17F0-6F36-EF11-86D4-6045BDEE16E6'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'Provider Identification',
       GeneratedFormSection = 'Category',
       DisplayName = 'Name',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = '054F17F0-6F36-EF11-86D4-6045BDEE16E6'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'Provider Identification',
       GeneratedFormSection = 'Category',
       DisplayName = 'Description',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = '064F17F0-6F36-EF11-86D4-6045BDEE16E6'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'Driver Configuration',
       GeneratedFormSection = 'Category',
       DisplayName = 'Server Driver Key',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = '074F17F0-6F36-EF11-86D4-6045BDEE16E6'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'Driver Configuration',
       GeneratedFormSection = 'Category',
       DisplayName = 'Client Driver Key',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = '084F17F0-6F36-EF11-86D4-6045BDEE16E6'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'Driver Configuration',
       GeneratedFormSection = 'Category',
       DisplayName = 'Configuration',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = '401BFD36-48DE-465D-AC5D-47D6A368ED5A'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'Selection & Availability',
       GeneratedFormSection = 'Category',
       DisplayName = 'Priority',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = '094F17F0-6F36-EF11-86D4-6045BDEE16E6'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'Selection & Availability',
       GeneratedFormSection = 'Category',
       DisplayName = 'Active',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = '0A4F17F0-6F36-EF11-86D4-6045BDEE16E6'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'Selection & Availability',
       GeneratedFormSection = 'Category',
       DisplayName = 'Supports Search',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = 'F7CFAB57-DCC4-4BA6-ACA1-401636343F43'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'System Metadata',
       GeneratedFormSection = 'Category',
       DisplayName = 'Created At',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = '775817F0-6F36-EF11-86D4-6045BDEE16E6'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'System Metadata',
       GeneratedFormSection = 'Category',
       DisplayName = 'Updated At',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = '785817F0-6F36-EF11-86D4-6045BDEE16E6'
   AND AutoUpdateCategory = 1

/* Insert FieldCategoryInfo setting for entity */

               INSERT INTO [${flyway:defaultSchema}].EntitySetting (ID, EntityID, Name, Value, __mj_CreatedAt, __mj_UpdatedAt)
               VALUES ('a916824f-ff7f-4c22-9a4e-b1831ff07ea8', '28248F34-2837-EF11-86D4-6045BDEE16E6', 'FieldCategoryInfo', '{"Provider Identification":{"icon":"fa fa-tag","description":""},"Driver Configuration":{"icon":"fa fa-plug","description":""},"Selection & Availability":{"icon":"fa fa-sliders-h","description":""},"System Metadata":{"icon":"fa fa-cog","description":""}}', GETUTCDATE(), GETUTCDATE())
            

/* Update FieldCategoryIcons setting for entity (legacy format) */

               UPDATE [${flyway:defaultSchema}].EntitySetting
               SET Value = '{"Provider Identification":"fa fa-tag","Driver Configuration":"fa fa-plug","Selection & Availability":"fa fa-sliders-h","System Metadata":"fa fa-cog"}',
                   __mj_UpdatedAt = GETUTCDATE()
               WHERE EntityID = '28248F34-2837-EF11-86D4-6045BDEE16E6' AND Name = 'FieldCategoryIcons'
            

/* Set categories for 15 fields */
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'System Metadata',
       GeneratedFormSection = 'Category',
       DisplayName = 'ID',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = '4C85F73C-3EC1-4400-B7A5-E542897BC868'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'System Metadata',
       GeneratedFormSection = 'Category',
       DisplayName = 'Created At',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = '2CE8C662-333C-4DC6-8EBB-DBA8E92A08BC'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'System Metadata',
       GeneratedFormSection = 'Category',
       DisplayName = 'Updated At',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = 'C730345C-DF05-4A37-B04A-B07B2239A514'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'Visibility & Ownership',
       GeneratedFormSection = 'Category',
       DisplayName = 'User',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = 'F29995AB-E10A-4DE3-AFF1-714CE5D4E032'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'Visibility & Ownership',
       GeneratedFormSection = 'Category',
       DisplayName = 'User Name',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = '8B354E07-E905-4904-8B48-A9A4989CA51A'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'Visibility & Ownership',
       GeneratedFormSection = 'Category',
       DisplayName = 'Is Public',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = '4D7D7BB9-6A2F-4F5A-8065-0FD85099922D'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'Playlist Details',
       GeneratedFormSection = 'Category',
       DisplayName = 'Name',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = '1660C2A8-4E78-4369-B1CD-F5684B43B21F'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'Playlist Details',
       GeneratedFormSection = 'Category',
       DisplayName = 'Description',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = '3B143E25-480F-4216-9F0C-A4704F35160E'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'Playlist Details',
       GeneratedFormSection = 'Category',
       DisplayName = 'Genre',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = 'C5D5225F-0487-49B4-9CB7-4FA6A980EA90'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'Playlist Details',
       GeneratedFormSection = 'Category',
       DisplayName = 'Playlist Type',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = 'BDB4C9B6-83D5-4055-AE0D-5996498E901F'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'Playlist Details',
       GeneratedFormSection = 'Category',
       DisplayName = 'Total Duration',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = 'B8D93995-BA23-4BFA-B05E-37861BC57876'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'AI Generation',
       GeneratedFormSection = 'Category',
       DisplayName = 'Created By AI',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = '95C58FE0-65DE-4FEC-A683-1C404170F52C'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'AI Generation',
       GeneratedFormSection = 'Category',
       DisplayName = 'AI Generation Notes',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = '87C82DA4-3FF0-48BD-B0F4-8FB2C6062F1C'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'AI Generation',
       GeneratedFormSection = 'Category',
       DisplayName = 'Source Year',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = '12CA7CBA-91E8-4319-91EA-895EAD1E1268'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'AI Generation',
       GeneratedFormSection = 'Category',
       DisplayName = 'Target Year',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = '6C0A518A-77AC-4110-BC17-2F24F3B4DDBB'
   AND AutoUpdateCategory = 1

/* Set entity icon to fa fa-music */

                  UPDATE [${flyway:defaultSchema}].Entity
                  SET Icon = 'fa fa-music',
                      __mj_UpdatedAt = GETUTCDATE()
                  WHERE ID = 'FC3C971D-9FD7-40C8-A428-C8E66A5BB972'
               

/* Insert FieldCategoryInfo setting for entity */

               INSERT INTO [${flyway:defaultSchema}].EntitySetting (ID, EntityID, Name, Value, __mj_CreatedAt, __mj_UpdatedAt)
               VALUES ('5ed82c72-e5ec-4805-a2a5-ab943219cc8c', 'FC3C971D-9FD7-40C8-A428-C8E66A5BB972', 'FieldCategoryInfo', '{"Playlist Details":{"icon":"fa fa-list-alt","description":"Core attributes that describe the playlist''s content, type, and runtime"},"AI Generation":{"icon":"fa fa-robot","description":"Settings and notes related to AI‑generated playlists and their temporal context"},"Visibility & Ownership":{"icon":"fa fa-user-friends","description":"Ownership and sharing controls determining who can view or edit the playlist"},"System Metadata":{"icon":"fa fa-cog","description":"System‑managed audit fields and primary identifier"}}', GETUTCDATE(), GETUTCDATE())
            

/* Insert FieldCategoryIcons setting for entity (legacy format) */

               INSERT INTO [${flyway:defaultSchema}].EntitySetting (ID, EntityID, Name, Value, __mj_CreatedAt, __mj_UpdatedAt)
               VALUES ('43cf8cb5-8181-4a5b-b4c5-9f6b7a4af281', 'FC3C971D-9FD7-40C8-A428-C8E66A5BB972', 'FieldCategoryIcons', '{"Playlist Details":"fa fa-list-alt","AI Generation":"fa fa-robot","Visibility & Ownership":"fa fa-user-friends","System Metadata":"fa fa-cog"}', GETUTCDATE(), GETUTCDATE())
            

/* Set categories for 13 fields */
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'System Metadata',
       GeneratedFormSection = 'Category',
       DisplayName = 'ID',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = 'D5E73885-C7B2-4701-BF3A-7570C37EA0B3'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'Playlist Association',
       GeneratedFormSection = 'Category',
       DisplayName = 'Playlist',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = '7CBD2257-7663-4C58-815E-121B19CBF78A'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'Playlist Association',
       GeneratedFormSection = 'Category',
       DisplayName = 'Song',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = '4DD2B79C-F1C8-4A47-A4FC-FCB342CF5C3A'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'Playlist Association',
       GeneratedFormSection = 'Category',
       DisplayName = 'Playlist Name',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = '0152847A-D0F9-4634-BF20-0C8CA31A96F2'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'Playlist Association',
       GeneratedFormSection = 'Category',
       DisplayName = 'Song Name',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = '0342538E-6EFF-4115-A2D8-3A42AD861C73'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'Recommendation Details',
       GeneratedFormSection = 'Category',
       DisplayName = 'Sequence Number',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = 'FD199202-70D8-43E5-B2C4-51849E5E1454'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'Recommendation Details',
       GeneratedFormSection = 'Category',
       DisplayName = 'Recommendation Month',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = '2E906829-F86D-407A-83C9-80E8B5700D4B'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'Recommendation Details',
       GeneratedFormSection = 'Category',
       DisplayName = 'Matched Emotion',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = 'E0802BEE-39F9-4F3E-A597-C1A120DD182C'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'Recommendation Details',
       GeneratedFormSection = 'Category',
       DisplayName = 'Added From Web',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = 'E3F4F1BD-D608-4260-A693-DC86126130CF'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'Recommendation Details',
       GeneratedFormSection = 'Category',
       DisplayName = 'Popularity Reason',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = '4D42718B-B3F6-4536-BA32-3A2222DBCEE9'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'Recommendation Details',
       GeneratedFormSection = 'Category',
       DisplayName = 'AI Reason',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = '22BFEB3C-2E9C-4978-937D-37CF294B1246'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'System Metadata',
       GeneratedFormSection = 'Category',
       DisplayName = 'Created At',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = '2F1C6747-47B4-42B9-8BD8-F2031AB0F7B3'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'System Metadata',
       GeneratedFormSection = 'Category',
       DisplayName = 'Updated At',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = 'AC6490A9-1EE5-4F99-BE43-C5060C4EB131'
   AND AutoUpdateCategory = 1

/* Set entity icon to fa fa-music */

                  UPDATE [${flyway:defaultSchema}].Entity
                  SET Icon = 'fa fa-music',
                      __mj_UpdatedAt = GETUTCDATE()
                  WHERE ID = '77CA76E4-008F-4A0B-8E91-C81BD719440F'
               

/* Insert FieldCategoryInfo setting for entity */

               INSERT INTO [${flyway:defaultSchema}].EntitySetting (ID, EntityID, Name, Value, __mj_CreatedAt, __mj_UpdatedAt)
               VALUES ('aacee896-5d77-450f-bc37-57724b1e76f6', '77CA76E4-008F-4A0B-8E91-C81BD719440F', 'FieldCategoryInfo', '{"Playlist Association":{"icon":"fa fa-music","description":"Links each song to its playlist and provides readable names"},"Recommendation Details":{"icon":"fa fa-lightbulb","description":"Fields describing ordering, recommendation context, and AI explanations"},"System Metadata":{"icon":"fa fa-cog","description":"Technical audit fields managed by the system"}}', GETUTCDATE(), GETUTCDATE())
            

/* Insert FieldCategoryIcons setting for entity (legacy format) */

               INSERT INTO [${flyway:defaultSchema}].EntitySetting (ID, EntityID, Name, Value, __mj_CreatedAt, __mj_UpdatedAt)
               VALUES ('cd027b2e-d248-4006-a11c-e1585792fb79', '77CA76E4-008F-4A0B-8E91-C81BD719440F', 'FieldCategoryIcons', '{"Playlist Association":"fa fa-music","Recommendation Details":"fa fa-lightbulb","System Metadata":"fa fa-cog"}', GETUTCDATE(), GETUTCDATE())
            

/* Generated Validation Functions for Playlist Songs */
-- CHECK constraint for Playlist Songs: Field: RecommendationMonth was newly set or modified since the last generation of the validation function, the code was regenerated and updating the GeneratedCode table with the new generated validation function
INSERT INTO [${flyway:defaultSchema}].[GeneratedCode] (CategoryID, GeneratedByModelID, GeneratedAt, Language, Status, Source, Code, Description, Name, LinkedEntityID, LinkedRecordPrimaryKey)
                      VALUES ((SELECT ID FROM ${flyway:defaultSchema}.vwGeneratedCodeCategories WHERE Name='CodeGen: Validators'), '8E1BADD5-D593-4F9B-90D4-BF6D8AFA74A0', GETUTCDATE(), 'TypeScript','Approved', '([RecommendationMonth] IS NULL OR [RecommendationMonth]>=(1) AND [RecommendationMonth]<=(12))', 'public ValidateRecommendationMonthRange(result: ValidationResult) {
	// If a month is provided, it must be between 1 and 12
	if (this.RecommendationMonth != null && (this.RecommendationMonth < 1 || this.RecommendationMonth > 12)) {
		result.Errors.push(new ValidationErrorInfo(
			"RecommendationMonth",
			"Recommendation month must be a number between 1 and 12.",
			this.RecommendationMonth,
			ValidationErrorType.Failure
		));
	}
}', 'If a recommendation month is set, it must be a valid month number (1‑12); otherwise the field can be left empty.', 'ValidateRecommendationMonthRange', 'DF238F34-2837-EF11-86D4-6045BDEE16E6', '2E906829-F86D-407A-83C9-80E8B5700D4B');
  
            

