/* SQL generated to create new entity Song Journals */

      INSERT INTO [${flyway:defaultSchema}].Entity (
         ID,
         Name,
         DisplayName,
         Description,
         NameSuffix,
         BaseTable,
         BaseView,
         SchemaName,
         IncludeInAPI,
         AllowUserSearchAPI
         , TrackRecordChanges
         , AuditRecordAccess
         , AuditViewRuns
         , AllowAllRowsAPI
         , AllowCreateAPI
         , AllowUpdateAPI
         , AllowDeleteAPI
         , UserViewMaxRows
      )
      VALUES (
         'ae731c66-02f2-4798-b8f4-4d9ed6ab35db',
         'Song Journals',
         NULL,
         NULL,
         NULL,
         'SongJournal',
         'vwSongJournals',
         'spotify',
         1,
         0
         , 1
         , 0
         , 0
         , 0
         , 1
         , 1
         , 1
         , 1000
      )
   

/* SQL generated to add new entity Song Journals to application ID: '9520B90D-5FEC-4FA9-B910-A784A3DE17D8' */
INSERT INTO ${flyway:defaultSchema}.ApplicationEntity
                                       (ApplicationID, EntityID, Sequence) VALUES
                                       ('9520B90D-5FEC-4FA9-B910-A784A3DE17D8', 'ae731c66-02f2-4798-b8f4-4d9ed6ab35db', (SELECT ISNULL(MAX(Sequence),0)+1 FROM ${flyway:defaultSchema}.ApplicationEntity WHERE ApplicationID = '9520B90D-5FEC-4FA9-B910-A784A3DE17D8'))

/* SQL generated to add new permission for entity Song Journals for role UI */
INSERT INTO ${flyway:defaultSchema}.EntityPermission
                                                   (EntityID, RoleID, CanRead, CanCreate, CanUpdate, CanDelete) VALUES
                                                   ('ae731c66-02f2-4798-b8f4-4d9ed6ab35db', 'E0AFCCEC-6A37-EF11-86D4-000D3A4E707E', 1, 0, 0, 0)

/* SQL generated to add new permission for entity Song Journals for role Developer */
INSERT INTO ${flyway:defaultSchema}.EntityPermission
                                                   (EntityID, RoleID, CanRead, CanCreate, CanUpdate, CanDelete) VALUES
                                                   ('ae731c66-02f2-4798-b8f4-4d9ed6ab35db', 'DEAFCCEC-6A37-EF11-86D4-000D3A4E707E', 1, 1, 1, 0)

/* SQL generated to add new permission for entity Song Journals for role Integration */
INSERT INTO ${flyway:defaultSchema}.EntityPermission
                                                   (EntityID, RoleID, CanRead, CanCreate, CanUpdate, CanDelete) VALUES
                                                   ('ae731c66-02f2-4798-b8f4-4d9ed6ab35db', 'DFAFCCEC-6A37-EF11-86D4-000D3A4E707E', 1, 1, 1, 1)

/* SQL text to add special date field __mj_CreatedAt to entity spotify.SongJournal */
ALTER TABLE [spotify].[SongJournal] ADD __mj_CreatedAt DATETIMEOFFSET NOT NULL DEFAULT GETUTCDATE()

/* SQL text to add special date field __mj_UpdatedAt to entity spotify.SongJournal */
ALTER TABLE [spotify].[SongJournal] ADD __mj_UpdatedAt DATETIMEOFFSET NOT NULL DEFAULT GETUTCDATE()

/* SQL text to insert new entity field */

      IF NOT EXISTS (
         SELECT 1 FROM [${flyway:defaultSchema}].EntityField 
         WHERE ID = 'd0b4b749-fb4c-4bd6-8080-cac1257e61b1'  OR 
               (EntityID = 'AE731C66-02F2-4798-B8F4-4D9ED6AB35DB' AND Name = 'ID')
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
            'd0b4b749-fb4c-4bd6-8080-cac1257e61b1',
            'AE731C66-02F2-4798-B8F4-4D9ED6AB35DB', -- Entity: Song Journals
            100001,
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
            NULL,
            NULL,
            0,
            1,
            0,
            0,
            1,
            1,
            'Search'
         )
      END

/* SQL text to insert new entity field */

      IF NOT EXISTS (
         SELECT 1 FROM [${flyway:defaultSchema}].EntityField 
         WHERE ID = 'b79c024b-62fe-4fa7-ac3d-6e16329f2bf1'  OR 
               (EntityID = 'AE731C66-02F2-4798-B8F4-4D9ED6AB35DB' AND Name = 'UserID')
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
            'b79c024b-62fe-4fa7-ac3d-6e16329f2bf1',
            'AE731C66-02F2-4798-B8F4-4D9ED6AB35DB', -- Entity: Song Journals
            100002,
            'UserID',
            'User ID',
            'User who wrote the journal entry',
            'uniqueidentifier',
            16,
            0,
            0,
            0,
            'null',
            0,
            1,
            0,
            'E1238F34-2837-EF11-86D4-6045BDEE16E6',
            'ID',
            0,
            0,
            1,
            0,
            0,
            1,
            'Search'
         )
      END

/* SQL text to insert new entity field */

      IF NOT EXISTS (
         SELECT 1 FROM [${flyway:defaultSchema}].EntityField 
         WHERE ID = '9ea31cea-9c03-4947-86d7-e4fca8239201'  OR 
               (EntityID = 'AE731C66-02F2-4798-B8F4-4D9ED6AB35DB' AND Name = 'SongID')
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
            '9ea31cea-9c03-4947-86d7-e4fca8239201',
            'AE731C66-02F2-4798-B8F4-4D9ED6AB35DB', -- Entity: Song Journals
            100003,
            'SongID',
            'Song ID',
            'Song the journal entry is about',
            'uniqueidentifier',
            16,
            0,
            0,
            0,
            'null',
            0,
            1,
            0,
            '9D02B3A0-7E1C-44B7-A3B7-421DF70CA8DB',
            'ID',
            0,
            0,
            1,
            0,
            0,
            1,
            'Search'
         )
      END

/* SQL text to insert new entity field */

      IF NOT EXISTS (
         SELECT 1 FROM [${flyway:defaultSchema}].EntityField 
         WHERE ID = '0f425adf-0ce6-47f0-854d-161c47c6d00f'  OR 
               (EntityID = 'AE731C66-02F2-4798-B8F4-4D9ED6AB35DB' AND Name = 'JournalEntry')
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
            '0f425adf-0ce6-47f0-854d-161c47c6d00f',
            'AE731C66-02F2-4798-B8F4-4D9ED6AB35DB', -- Entity: Song Journals
            100004,
            'JournalEntry',
            'Journal Entry',
            'User written reflection describing how the song made them feel',
            'nvarchar',
            -1,
            0,
            0,
            0,
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
         WHERE ID = 'c6dfff3f-b8ad-4650-bef7-f13b7314ea1e'  OR 
               (EntityID = 'AE731C66-02F2-4798-B8F4-4D9ED6AB35DB' AND Name = 'ReflectionYear')
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
            'c6dfff3f-b8ad-4650-bef7-f13b7314ea1e',
            'AE731C66-02F2-4798-B8F4-4D9ED6AB35DB', -- Entity: Song Journals
            100005,
            'ReflectionYear',
            'Reflection Year',
            'Year the song was most listened to (e.g., 2024)',
            'int',
            4,
            10,
            0,
            0,
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
            1,
            'Search'
         )
      END

/* SQL text to insert new entity field */

      IF NOT EXISTS (
         SELECT 1 FROM [${flyway:defaultSchema}].EntityField 
         WHERE ID = '8e44ef6f-0e15-4e99-9694-5eb5d530344d'  OR 
               (EntityID = 'AE731C66-02F2-4798-B8F4-4D9ED6AB35DB' AND Name = 'ReflectionMonth')
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
            '8e44ef6f-0e15-4e99-9694-5eb5d530344d',
            'AE731C66-02F2-4798-B8F4-4D9ED6AB35DB', -- Entity: Song Journals
            100006,
            'ReflectionMonth',
            'Reflection Month',
            'Month the song was most listened to (1-12)',
            'int',
            4,
            10,
            0,
            0,
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
            1,
            'Search'
         )
      END

/* SQL text to insert new entity field */

      IF NOT EXISTS (
         SELECT 1 FROM [${flyway:defaultSchema}].EntityField 
         WHERE ID = '09501377-bb3b-4ad9-93d6-28658d33a16a'  OR 
               (EntityID = 'AE731C66-02F2-4798-B8F4-4D9ED6AB35DB' AND Name = '__mj_CreatedAt')
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
            '09501377-bb3b-4ad9-93d6-28658d33a16a',
            'AE731C66-02F2-4798-B8F4-4D9ED6AB35DB', -- Entity: Song Journals
            100007,
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
         WHERE ID = '0b178956-dc1c-4d7b-b2c8-60f80ed3c204'  OR 
               (EntityID = 'AE731C66-02F2-4798-B8F4-4D9ED6AB35DB' AND Name = '__mj_UpdatedAt')
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
            '0b178956-dc1c-4d7b-b2c8-60f80ed3c204',
            'AE731C66-02F2-4798-B8F4-4D9ED6AB35DB', -- Entity: Song Journals
            100008,
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

/* SQL text to create Entitiy Relationships */

   IF NOT EXISTS (
      SELECT 1
      FROM [${flyway:defaultSchema}].EntityRelationship
      WHERE ID = '5a8e1834-b24a-4ca1-9c57-c0c962063976'
   )
   BEGIN
      INSERT INTO ${flyway:defaultSchema}.EntityRelationship (ID, EntityID, RelatedEntityID, RelatedEntityJoinField, Type, BundleInAPI, DisplayInForm, DisplayName, Sequence)
                              VALUES ('5a8e1834-b24a-4ca1-9c57-c0c962063976', '9D02B3A0-7E1C-44B7-A3B7-421DF70CA8DB', 'AE731C66-02F2-4798-B8F4-4D9ED6AB35DB', 'SongID', 'One To Many', 1, 1, 'Song Journals', 1);
   END
                              

/* SQL text to create Entitiy Relationships */

   IF NOT EXISTS (
      SELECT 1
      FROM [${flyway:defaultSchema}].EntityRelationship
      WHERE ID = 'afc0e04c-6df3-4867-bedc-245c21f67133'
   )
   BEGIN
      INSERT INTO ${flyway:defaultSchema}.EntityRelationship (ID, EntityID, RelatedEntityID, RelatedEntityJoinField, Type, BundleInAPI, DisplayInForm, DisplayName, Sequence)
                              VALUES ('afc0e04c-6df3-4867-bedc-245c21f67133', 'E1238F34-2837-EF11-86D4-6045BDEE16E6', 'AE731C66-02F2-4798-B8F4-4D9ED6AB35DB', 'UserID', 'One To Many', 1, 1, 'Song Journals', 2);
   END
                              

/* Index for Foreign Keys for SongJournal */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: Song Journals
-- Item: Index for Foreign Keys
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------
-- Index for foreign key UserID in table SongJournal
IF NOT EXISTS (
    SELECT 1
    FROM sys.indexes
    WHERE name = 'IDX_AUTO_MJ_FKEY_SongJournal_UserID' 
    AND object_id = OBJECT_ID('[spotify].[SongJournal]')
)
CREATE INDEX IDX_AUTO_MJ_FKEY_SongJournal_UserID ON [spotify].[SongJournal] ([UserID]);

-- Index for foreign key SongID in table SongJournal
IF NOT EXISTS (
    SELECT 1
    FROM sys.indexes
    WHERE name = 'IDX_AUTO_MJ_FKEY_SongJournal_SongID' 
    AND object_id = OBJECT_ID('[spotify].[SongJournal]')
)
CREATE INDEX IDX_AUTO_MJ_FKEY_SongJournal_SongID ON [spotify].[SongJournal] ([SongID]);

/* SQL text to update entity field related entity name field map for entity field ID B79C024B-62FE-4FA7-AC3D-6E16329F2BF1 */
EXEC [${flyway:defaultSchema}].spUpdateEntityFieldRelatedEntityNameFieldMap
         @EntityFieldID='B79C024B-62FE-4FA7-AC3D-6E16329F2BF1',
         @RelatedEntityNameFieldMap='User'

/* SQL text to update entity field related entity name field map for entity field ID 9EA31CEA-9C03-4947-86D7-E4FCA8239201 */
EXEC [${flyway:defaultSchema}].spUpdateEntityFieldRelatedEntityNameFieldMap
         @EntityFieldID='9EA31CEA-9C03-4947-86D7-E4FCA8239201',
         @RelatedEntityNameFieldMap='Song'

/* Base View SQL for Song Journals */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: Song Journals
-- Item: vwSongJournals
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- BASE VIEW FOR ENTITY:      Song Journals
-----               SCHEMA:      spotify
-----               BASE TABLE:  SongJournal
-----               PRIMARY KEY: ID
------------------------------------------------------------
IF OBJECT_ID('[spotify].[vwSongJournals]', 'V') IS NOT NULL
    DROP VIEW [spotify].[vwSongJournals];
GO

CREATE VIEW [spotify].[vwSongJournals]
AS
SELECT
    s.*,
    User_UserID.[Name] AS [User],
    Song_SongID.[Name] AS [Song]
FROM
    [spotify].[SongJournal] AS s
INNER JOIN
    [${flyway:defaultSchema}].[User] AS User_UserID
  ON
    [s].[UserID] = User_UserID.[ID]
INNER JOIN
    [spotify].[Song] AS Song_SongID
  ON
    [s].[SongID] = Song_SongID.[ID]
GO
GRANT SELECT ON [spotify].[vwSongJournals] TO [cdp_UI], [cdp_Developer], [cdp_Integration]
    

/* Base View Permissions SQL for Song Journals */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: Song Journals
-- Item: Permissions for vwSongJournals
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

GRANT SELECT ON [spotify].[vwSongJournals] TO [cdp_UI], [cdp_Developer], [cdp_Integration]

/* spCreate SQL for Song Journals */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: Song Journals
-- Item: spCreateSongJournal
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- CREATE PROCEDURE FOR SongJournal
------------------------------------------------------------
IF OBJECT_ID('[spotify].[spCreateSongJournal]', 'P') IS NOT NULL
    DROP PROCEDURE [spotify].[spCreateSongJournal];
GO

CREATE PROCEDURE [spotify].[spCreateSongJournal]
    @ID uniqueidentifier = NULL,
    @UserID uniqueidentifier,
    @SongID uniqueidentifier,
    @JournalEntry nvarchar(MAX),
    @ReflectionYear int,
    @ReflectionMonth int
AS
BEGIN
    SET NOCOUNT ON;
    DECLARE @InsertedRow TABLE ([ID] UNIQUEIDENTIFIER)
    
    IF @ID IS NOT NULL
    BEGIN
        -- User provided a value, use it
        INSERT INTO [spotify].[SongJournal]
            (
                [ID],
                [UserID],
                [SongID],
                [JournalEntry],
                [ReflectionYear],
                [ReflectionMonth]
            )
        OUTPUT INSERTED.[ID] INTO @InsertedRow
        VALUES
            (
                @ID,
                @UserID,
                @SongID,
                @JournalEntry,
                @ReflectionYear,
                @ReflectionMonth
            )
    END
    ELSE
    BEGIN
        -- No value provided, let database use its default (e.g., NEWSEQUENTIALID())
        INSERT INTO [spotify].[SongJournal]
            (
                [UserID],
                [SongID],
                [JournalEntry],
                [ReflectionYear],
                [ReflectionMonth]
            )
        OUTPUT INSERTED.[ID] INTO @InsertedRow
        VALUES
            (
                @UserID,
                @SongID,
                @JournalEntry,
                @ReflectionYear,
                @ReflectionMonth
            )
    END
    -- return the new record from the base view, which might have some calculated fields
    SELECT * FROM [spotify].[vwSongJournals] WHERE [ID] = (SELECT [ID] FROM @InsertedRow)
END
GO
GRANT EXECUTE ON [spotify].[spCreateSongJournal] TO [cdp_Developer], [cdp_Integration]
    

/* spCreate Permissions for Song Journals */

GRANT EXECUTE ON [spotify].[spCreateSongJournal] TO [cdp_Developer], [cdp_Integration]



/* spUpdate SQL for Song Journals */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: Song Journals
-- Item: spUpdateSongJournal
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- UPDATE PROCEDURE FOR SongJournal
------------------------------------------------------------
IF OBJECT_ID('[spotify].[spUpdateSongJournal]', 'P') IS NOT NULL
    DROP PROCEDURE [spotify].[spUpdateSongJournal];
GO

CREATE PROCEDURE [spotify].[spUpdateSongJournal]
    @ID uniqueidentifier,
    @UserID uniqueidentifier,
    @SongID uniqueidentifier,
    @JournalEntry nvarchar(MAX),
    @ReflectionYear int,
    @ReflectionMonth int
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE
        [spotify].[SongJournal]
    SET
        [UserID] = @UserID,
        [SongID] = @SongID,
        [JournalEntry] = @JournalEntry,
        [ReflectionYear] = @ReflectionYear,
        [ReflectionMonth] = @ReflectionMonth
    WHERE
        [ID] = @ID

    -- Check if the update was successful
    IF @@ROWCOUNT = 0
        -- Nothing was updated, return no rows, but column structure from base view intact, semantically correct this way.
        SELECT TOP 0 * FROM [spotify].[vwSongJournals] WHERE 1=0
    ELSE
        -- Return the updated record so the caller can see the updated values and any calculated fields
        SELECT
                                        *
                                    FROM
                                        [spotify].[vwSongJournals]
                                    WHERE
                                        [ID] = @ID
                                    
END
GO

GRANT EXECUTE ON [spotify].[spUpdateSongJournal] TO [cdp_Developer], [cdp_Integration]
GO

------------------------------------------------------------
----- TRIGGER FOR __mj_UpdatedAt field for the SongJournal table
------------------------------------------------------------
IF OBJECT_ID('[spotify].[trgUpdateSongJournal]', 'TR') IS NOT NULL
    DROP TRIGGER [spotify].[trgUpdateSongJournal];
GO
CREATE TRIGGER [spotify].trgUpdateSongJournal
ON [spotify].[SongJournal]
AFTER UPDATE
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE
        [spotify].[SongJournal]
    SET
        __mj_UpdatedAt = GETUTCDATE()
    FROM
        [spotify].[SongJournal] AS _organicTable
    INNER JOIN
        INSERTED AS I ON
        _organicTable.[ID] = I.[ID];
END;
GO
        

/* spUpdate Permissions for Song Journals */

GRANT EXECUTE ON [spotify].[spUpdateSongJournal] TO [cdp_Developer], [cdp_Integration]



/* spDelete SQL for Song Journals */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: Song Journals
-- Item: spDeleteSongJournal
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- DELETE PROCEDURE FOR SongJournal
------------------------------------------------------------
IF OBJECT_ID('[spotify].[spDeleteSongJournal]', 'P') IS NOT NULL
    DROP PROCEDURE [spotify].[spDeleteSongJournal];
GO

CREATE PROCEDURE [spotify].[spDeleteSongJournal]
    @ID uniqueidentifier
AS
BEGIN
    SET NOCOUNT ON;

    DELETE FROM
        [spotify].[SongJournal]
    WHERE
        [ID] = @ID


    -- Check if the delete was successful
    IF @@ROWCOUNT = 0
        SELECT NULL AS [ID] -- Return NULL for all primary key fields to indicate no record was deleted
    ELSE
        SELECT @ID AS [ID] -- Return the primary key values to indicate we successfully deleted the record
END
GO
GRANT EXECUTE ON [spotify].[spDeleteSongJournal] TO [cdp_Integration]
    

/* spDelete Permissions for Song Journals */

GRANT EXECUTE ON [spotify].[spDeleteSongJournal] TO [cdp_Integration]



/* SQL text to insert new entity field */

      IF NOT EXISTS (
         SELECT 1 FROM [${flyway:defaultSchema}].EntityField 
         WHERE ID = '13d4cfb9-0fcd-4451-a3d8-3b7aec25cc40'  OR 
               (EntityID = 'AE731C66-02F2-4798-B8F4-4D9ED6AB35DB' AND Name = 'User')
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
            '13d4cfb9-0fcd-4451-a3d8-3b7aec25cc40',
            'AE731C66-02F2-4798-B8F4-4D9ED6AB35DB', -- Entity: Song Journals
            100017,
            'User',
            'User',
            NULL,
            'nvarchar',
            200,
            0,
            0,
            0,
            'null',
            0,
            0,
            1,
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
         WHERE ID = 'c3119d2e-e017-488b-b39f-825164c786f7'  OR 
               (EntityID = 'AE731C66-02F2-4798-B8F4-4D9ED6AB35DB' AND Name = 'Song')
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
            'c3119d2e-e017-488b-b39f-825164c786f7',
            'AE731C66-02F2-4798-B8F4-4D9ED6AB35DB', -- Entity: Song Journals
            100018,
            'Song',
            'Song',
            NULL,
            'nvarchar',
            510,
            0,
            0,
            0,
            'null',
            0,
            0,
            1,
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

