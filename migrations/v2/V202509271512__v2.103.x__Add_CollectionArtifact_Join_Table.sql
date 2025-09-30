-- Migration: Add CollectionArtifact join table
-- Description: Creates a many-to-many relationship between Collections and Artifacts
-- Author: Generated
-- Date: 2025-09-27

-- Create the CollectionArtifact join table
CREATE TABLE [${flyway:defaultSchema}].[CollectionArtifact] (
    [ID] [uniqueidentifier] NOT NULL DEFAULT (newsequentialid()),
    [CollectionID] [uniqueidentifier] NOT NULL,
    [ArtifactID] [uniqueidentifier] NOT NULL,
    [Sequence] [int] NOT NULL DEFAULT 0,
    CONSTRAINT [PK_CollectionArtifact] PRIMARY KEY CLUSTERED ([ID] ASC),
    CONSTRAINT [FK_CollectionArtifact_Collection] FOREIGN KEY ([CollectionID]) REFERENCES [${flyway:defaultSchema}].[Collection] ([ID]),
    CONSTRAINT [FK_CollectionArtifact_Artifact] FOREIGN KEY ([ArtifactID]) REFERENCES [${flyway:defaultSchema}].[Artifact] ([ID]),
    CONSTRAINT [UQ_CollectionArtifact_Collection_Artifact] UNIQUE NONCLUSTERED ([CollectionID], [ArtifactID])
);
GO


-- Add extended properties for documentation
EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'Join table that establishes many-to-many relationships between Collections and Artifacts, allowing artifacts to be organized within collections',
    @level0type = N'SCHEMA', @level0name = N'${flyway:defaultSchema}',
    @level1type = N'TABLE', @level1name = N'CollectionArtifact';
 
EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'Sequence number for ordering artifacts within a collection',
    @level0type = N'SCHEMA', @level0name = N'${flyway:defaultSchema}',
    @level1type = N'TABLE', @level1name = N'CollectionArtifact',
    @level2type = N'COLUMN', @level2name = N'Sequence';








































































---- CODE GEN RUN




/* SQL generated to create new entity MJ: Collection Artifacts */

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
         'c754b94f-e7bc-4b8e-ad0b-4ec36c9da111',
         'MJ: Collection Artifacts',
         'Collection Artifacts',
         NULL,
         NULL,
         'CollectionArtifact',
         'vwCollectionArtifacts',
         '${flyway:defaultSchema}',
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
   

/* SQL generated to add new entity MJ: Collection Artifacts to application ID: 'EBA5CCEC-6A37-EF11-86D4-000D3A4E707E' */
INSERT INTO ${flyway:defaultSchema}.ApplicationEntity
                                       (ApplicationID, EntityID, Sequence) VALUES
                                       ('EBA5CCEC-6A37-EF11-86D4-000D3A4E707E', 'c754b94f-e7bc-4b8e-ad0b-4ec36c9da111', (SELECT ISNULL(MAX(Sequence),0)+1 FROM ${flyway:defaultSchema}.ApplicationEntity WHERE ApplicationID = 'EBA5CCEC-6A37-EF11-86D4-000D3A4E707E'))

/* SQL generated to add new permission for entity MJ: Collection Artifacts for role UI */
INSERT INTO ${flyway:defaultSchema}.EntityPermission
                                                   (EntityID, RoleID, CanRead, CanCreate, CanUpdate, CanDelete) VALUES
                                                   ('c754b94f-e7bc-4b8e-ad0b-4ec36c9da111', 'E0AFCCEC-6A37-EF11-86D4-000D3A4E707E', 1, 0, 0, 0)

/* SQL generated to add new permission for entity MJ: Collection Artifacts for role Developer */
INSERT INTO ${flyway:defaultSchema}.EntityPermission
                                                   (EntityID, RoleID, CanRead, CanCreate, CanUpdate, CanDelete) VALUES
                                                   ('c754b94f-e7bc-4b8e-ad0b-4ec36c9da111', 'DEAFCCEC-6A37-EF11-86D4-000D3A4E707E', 1, 1, 1, 0)

/* SQL generated to add new permission for entity MJ: Collection Artifacts for role Integration */
INSERT INTO ${flyway:defaultSchema}.EntityPermission
                                                   (EntityID, RoleID, CanRead, CanCreate, CanUpdate, CanDelete) VALUES
                                                   ('c754b94f-e7bc-4b8e-ad0b-4ec36c9da111', 'DFAFCCEC-6A37-EF11-86D4-000D3A4E707E', 1, 1, 1, 1)

/* SQL text to add special date field __mj_CreatedAt to entity ${flyway:defaultSchema}.CollectionArtifact */
ALTER TABLE [${flyway:defaultSchema}].[CollectionArtifact] ADD __mj_CreatedAt DATETIMEOFFSET NOT NULL DEFAULT GETUTCDATE()

/* SQL text to add special date field __mj_UpdatedAt to entity ${flyway:defaultSchema}.CollectionArtifact */
ALTER TABLE [${flyway:defaultSchema}].[CollectionArtifact] ADD __mj_UpdatedAt DATETIMEOFFSET NOT NULL DEFAULT GETUTCDATE()

/* SQL text to insert new entity field */

      IF NOT EXISTS (
         SELECT 1 FROM [${flyway:defaultSchema}].EntityField 
         WHERE ID = 'fd0fda91-e6d5-4c76-b0ea-789739f66cce'  OR 
               (EntityID = 'C754B94F-E7BC-4B8E-AD0B-4EC36C9DA111' AND Name = 'ID')
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
            'fd0fda91-e6d5-4c76-b0ea-789739f66cce',
            'C754B94F-E7BC-4B8E-AD0B-4EC36C9DA111', -- Entity: MJ: Collection Artifacts
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
            1,
            1,
            1,
            'Search'
         )
      END

/* SQL text to insert new entity field */

      IF NOT EXISTS (
         SELECT 1 FROM [${flyway:defaultSchema}].EntityField 
         WHERE ID = '404dfde1-20f7-4239-ae42-475923bb5937'  OR 
               (EntityID = 'C754B94F-E7BC-4B8E-AD0B-4EC36C9DA111' AND Name = 'CollectionID')
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
            '404dfde1-20f7-4239-ae42-475923bb5937',
            'C754B94F-E7BC-4B8E-AD0B-4EC36C9DA111', -- Entity: MJ: Collection Artifacts
            100002,
            'CollectionID',
            'Collection ID',
            NULL,
            'uniqueidentifier',
            16,
            0,
            0,
            0,
            'null',
            0,
            1,
            0,
            'FA0D11D1-4E8D-44D6-8C2B-55EEB3208E3E',
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
         WHERE ID = 'bbb80386-466a-4c67-8b43-ef4d98c3ed54'  OR 
               (EntityID = 'C754B94F-E7BC-4B8E-AD0B-4EC36C9DA111' AND Name = 'ArtifactID')
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
            'bbb80386-466a-4c67-8b43-ef4d98c3ed54',
            'C754B94F-E7BC-4B8E-AD0B-4EC36C9DA111', -- Entity: MJ: Collection Artifacts
            100003,
            'ArtifactID',
            'Artifact ID',
            NULL,
            'uniqueidentifier',
            16,
            0,
            0,
            0,
            'null',
            0,
            1,
            0,
            'F48D2341-8667-40BB-BCA8-87D7F80E16CD',
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
         WHERE ID = '88187aff-cf9f-44b4-95a9-a18a35f83d8c'  OR 
               (EntityID = 'C754B94F-E7BC-4B8E-AD0B-4EC36C9DA111' AND Name = 'Sequence')
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
            '88187aff-cf9f-44b4-95a9-a18a35f83d8c',
            'C754B94F-E7BC-4B8E-AD0B-4EC36C9DA111', -- Entity: MJ: Collection Artifacts
            100004,
            'Sequence',
            'Sequence',
            'Sequence number for ordering artifacts within a collection',
            'int',
            4,
            10,
            0,
            0,
            '(0)',
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
         WHERE ID = '091494b6-7a14-4009-acf8-a0399e167217'  OR 
               (EntityID = 'C754B94F-E7BC-4B8E-AD0B-4EC36C9DA111' AND Name = '__mj_CreatedAt')
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
            '091494b6-7a14-4009-acf8-a0399e167217',
            'C754B94F-E7BC-4B8E-AD0B-4EC36C9DA111', -- Entity: MJ: Collection Artifacts
            100005,
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
         WHERE ID = 'ab5b66c1-4de2-4664-ad89-2398a327841a'  OR 
               (EntityID = 'C754B94F-E7BC-4B8E-AD0B-4EC36C9DA111' AND Name = '__mj_UpdatedAt')
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
            'ab5b66c1-4de2-4664-ad89-2398a327841a',
            'C754B94F-E7BC-4B8E-AD0B-4EC36C9DA111', -- Entity: MJ: Collection Artifacts
            100006,
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
      WHERE ID = 'ce0593e4-c447-4f85-8790-82d834295d7d'
   )
   BEGIN
      INSERT INTO ${flyway:defaultSchema}.EntityRelationship (ID, EntityID, RelatedEntityID, RelatedEntityJoinField, Type, BundleInAPI, DisplayInForm, DisplayName, Sequence)
                              VALUES ('ce0593e4-c447-4f85-8790-82d834295d7d', 'FA0D11D1-4E8D-44D6-8C2B-55EEB3208E3E', 'C754B94F-E7BC-4B8E-AD0B-4EC36C9DA111', 'CollectionID', 'One To Many', 1, 1, 'MJ: Collection Artifacts', 1);
   END
                              

/* SQL text to create Entitiy Relationships */

   IF NOT EXISTS (
      SELECT 1
      FROM [${flyway:defaultSchema}].EntityRelationship
      WHERE ID = '947e8026-7845-4e01-bbd4-f2ed84a47e09'
   )
   BEGIN
      INSERT INTO ${flyway:defaultSchema}.EntityRelationship (ID, EntityID, RelatedEntityID, RelatedEntityJoinField, Type, BundleInAPI, DisplayInForm, DisplayName, Sequence)
                              VALUES ('947e8026-7845-4e01-bbd4-f2ed84a47e09', 'F48D2341-8667-40BB-BCA8-87D7F80E16CD', 'C754B94F-E7BC-4B8E-AD0B-4EC36C9DA111', 'ArtifactID', 'One To Many', 1, 1, 'MJ: Collection Artifacts', 2);
   END
                              

/* Index for Foreign Keys for CollectionArtifact */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Collection Artifacts
-- Item: Index for Foreign Keys
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------
-- Index for foreign key CollectionID in table CollectionArtifact
IF NOT EXISTS (
    SELECT 1
    FROM sys.indexes
    WHERE name = 'IDX_AUTO_MJ_FKEY_CollectionArtifact_CollectionID' 
    AND object_id = OBJECT_ID('[${flyway:defaultSchema}].[CollectionArtifact]')
)
CREATE INDEX IDX_AUTO_MJ_FKEY_CollectionArtifact_CollectionID ON [${flyway:defaultSchema}].[CollectionArtifact] ([CollectionID]);

-- Index for foreign key ArtifactID in table CollectionArtifact
IF NOT EXISTS (
    SELECT 1
    FROM sys.indexes
    WHERE name = 'IDX_AUTO_MJ_FKEY_CollectionArtifact_ArtifactID' 
    AND object_id = OBJECT_ID('[${flyway:defaultSchema}].[CollectionArtifact]')
)
CREATE INDEX IDX_AUTO_MJ_FKEY_CollectionArtifact_ArtifactID ON [${flyway:defaultSchema}].[CollectionArtifact] ([ArtifactID]);

/* SQL text to update entity field related entity name field map for entity field ID 404DFDE1-20F7-4239-AE42-475923BB5937 */
EXEC [${flyway:defaultSchema}].spUpdateEntityFieldRelatedEntityNameFieldMap
         @EntityFieldID='404DFDE1-20F7-4239-AE42-475923BB5937',
         @RelatedEntityNameFieldMap='Collection'

/* SQL text to update entity field related entity name field map for entity field ID BBB80386-466A-4C67-8B43-EF4D98C3ED54 */
EXEC [${flyway:defaultSchema}].spUpdateEntityFieldRelatedEntityNameFieldMap
         @EntityFieldID='BBB80386-466A-4C67-8B43-EF4D98C3ED54',
         @RelatedEntityNameFieldMap='Artifact'

/* Base View SQL for MJ: Collection Artifacts */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Collection Artifacts
-- Item: vwCollectionArtifacts
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- BASE VIEW FOR ENTITY:      MJ: Collection Artifacts
-----               SCHEMA:      ${flyway:defaultSchema}
-----               BASE TABLE:  CollectionArtifact
-----               PRIMARY KEY: ID
------------------------------------------------------------
DROP VIEW IF EXISTS [${flyway:defaultSchema}].[vwCollectionArtifacts]
GO

CREATE VIEW [${flyway:defaultSchema}].[vwCollectionArtifacts]
AS
SELECT
    c.*,
    Collection_CollectionID.[Name] AS [Collection],
    Artifact_ArtifactID.[Name] AS [Artifact]
FROM
    [${flyway:defaultSchema}].[CollectionArtifact] AS c
INNER JOIN
    [${flyway:defaultSchema}].[Collection] AS Collection_CollectionID
  ON
    [c].[CollectionID] = Collection_CollectionID.[ID]
INNER JOIN
    [${flyway:defaultSchema}].[Artifact] AS Artifact_ArtifactID
  ON
    [c].[ArtifactID] = Artifact_ArtifactID.[ID]
GO
GRANT SELECT ON [${flyway:defaultSchema}].[vwCollectionArtifacts] TO [cdp_UI], [cdp_Developer], [cdp_Integration]
    

/* Base View Permissions SQL for MJ: Collection Artifacts */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Collection Artifacts
-- Item: Permissions for vwCollectionArtifacts
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

GRANT SELECT ON [${flyway:defaultSchema}].[vwCollectionArtifacts] TO [cdp_UI], [cdp_Developer], [cdp_Integration]

/* spCreate SQL for MJ: Collection Artifacts */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Collection Artifacts
-- Item: spCreateCollectionArtifact
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- CREATE PROCEDURE FOR CollectionArtifact
------------------------------------------------------------
DROP PROCEDURE IF EXISTS [${flyway:defaultSchema}].[spCreateCollectionArtifact]
GO

CREATE PROCEDURE [${flyway:defaultSchema}].[spCreateCollectionArtifact]
    @ID uniqueidentifier = NULL,
    @CollectionID uniqueidentifier,
    @ArtifactID uniqueidentifier,
    @Sequence int
AS
BEGIN
    SET NOCOUNT ON;
    DECLARE @InsertedRow TABLE ([ID] UNIQUEIDENTIFIER)
    
    IF @ID IS NOT NULL
    BEGIN
        -- User provided a value, use it
        INSERT INTO [${flyway:defaultSchema}].[CollectionArtifact]
            (
                [ID],
                [CollectionID],
                [ArtifactID],
                [Sequence]
            )
        OUTPUT INSERTED.[ID] INTO @InsertedRow
        VALUES
            (
                @ID,
                @CollectionID,
                @ArtifactID,
                @Sequence
            )
    END
    ELSE
    BEGIN
        -- No value provided, let database use its default (e.g., NEWSEQUENTIALID())
        INSERT INTO [${flyway:defaultSchema}].[CollectionArtifact]
            (
                [CollectionID],
                [ArtifactID],
                [Sequence]
            )
        OUTPUT INSERTED.[ID] INTO @InsertedRow
        VALUES
            (
                @CollectionID,
                @ArtifactID,
                @Sequence
            )
    END
    -- return the new record from the base view, which might have some calculated fields
    SELECT * FROM [${flyway:defaultSchema}].[vwCollectionArtifacts] WHERE [ID] = (SELECT [ID] FROM @InsertedRow)
END
GO
GRANT EXECUTE ON [${flyway:defaultSchema}].[spCreateCollectionArtifact] TO [cdp_Developer], [cdp_Integration]
    

/* spCreate Permissions for MJ: Collection Artifacts */

GRANT EXECUTE ON [${flyway:defaultSchema}].[spCreateCollectionArtifact] TO [cdp_Developer], [cdp_Integration]



/* spUpdate SQL for MJ: Collection Artifacts */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Collection Artifacts
-- Item: spUpdateCollectionArtifact
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- UPDATE PROCEDURE FOR CollectionArtifact
------------------------------------------------------------
DROP PROCEDURE IF EXISTS [${flyway:defaultSchema}].[spUpdateCollectionArtifact]
GO

CREATE PROCEDURE [${flyway:defaultSchema}].[spUpdateCollectionArtifact]
    @ID uniqueidentifier,
    @CollectionID uniqueidentifier,
    @ArtifactID uniqueidentifier,
    @Sequence int
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE
        [${flyway:defaultSchema}].[CollectionArtifact]
    SET
        [CollectionID] = @CollectionID,
        [ArtifactID] = @ArtifactID,
        [Sequence] = @Sequence
    WHERE
        [ID] = @ID

    -- Check if the update was successful
    IF @@ROWCOUNT = 0
        -- Nothing was updated, return no rows, but column structure from base view intact, semantically correct this way.
        SELECT TOP 0 * FROM [${flyway:defaultSchema}].[vwCollectionArtifacts] WHERE 1=0
    ELSE
        -- Return the updated record so the caller can see the updated values and any calculated fields
        SELECT
                                        *
                                    FROM
                                        [${flyway:defaultSchema}].[vwCollectionArtifacts]
                                    WHERE
                                        [ID] = @ID
                                    
END
GO

GRANT EXECUTE ON [${flyway:defaultSchema}].[spUpdateCollectionArtifact] TO [cdp_Developer], [cdp_Integration]
GO

------------------------------------------------------------
----- TRIGGER FOR __mj_UpdatedAt field for the CollectionArtifact table
------------------------------------------------------------
DROP TRIGGER IF EXISTS [${flyway:defaultSchema}].trgUpdateCollectionArtifact
GO
CREATE TRIGGER [${flyway:defaultSchema}].trgUpdateCollectionArtifact
ON [${flyway:defaultSchema}].[CollectionArtifact]
AFTER UPDATE
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE
        [${flyway:defaultSchema}].[CollectionArtifact]
    SET
        __mj_UpdatedAt = GETUTCDATE()
    FROM
        [${flyway:defaultSchema}].[CollectionArtifact] AS _organicTable
    INNER JOIN
        INSERTED AS I ON
        _organicTable.[ID] = I.[ID];
END;
GO
        

/* spUpdate Permissions for MJ: Collection Artifacts */

GRANT EXECUTE ON [${flyway:defaultSchema}].[spUpdateCollectionArtifact] TO [cdp_Developer], [cdp_Integration]



/* spDelete SQL for MJ: Collection Artifacts */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Collection Artifacts
-- Item: spDeleteCollectionArtifact
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- DELETE PROCEDURE FOR CollectionArtifact
------------------------------------------------------------
DROP PROCEDURE IF EXISTS [${flyway:defaultSchema}].[spDeleteCollectionArtifact]
GO

CREATE PROCEDURE [${flyway:defaultSchema}].[spDeleteCollectionArtifact]
    @ID uniqueidentifier
AS
BEGIN
    SET NOCOUNT ON;

    DELETE FROM
        [${flyway:defaultSchema}].[CollectionArtifact]
    WHERE
        [ID] = @ID


    -- Check if the delete was successful
    IF @@ROWCOUNT = 0
        SELECT NULL AS [ID] -- Return NULL for all primary key fields to indicate no record was deleted
    ELSE
        SELECT @ID AS [ID] -- Return the primary key values to indicate we successfully deleted the record
END
GO
GRANT EXECUTE ON [${flyway:defaultSchema}].[spDeleteCollectionArtifact] TO [cdp_Integration]
    

/* spDelete Permissions for MJ: Collection Artifacts */

GRANT EXECUTE ON [${flyway:defaultSchema}].[spDeleteCollectionArtifact] TO [cdp_Integration]



/* SQL text to insert new entity field */

      IF NOT EXISTS (
         SELECT 1 FROM [${flyway:defaultSchema}].EntityField 
         WHERE ID = '06307a6d-4c93-4918-8ae0-823ceb584390'  OR 
               (EntityID = 'C754B94F-E7BC-4B8E-AD0B-4EC36C9DA111' AND Name = 'Collection')
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
            '06307a6d-4c93-4918-8ae0-823ceb584390',
            'C754B94F-E7BC-4B8E-AD0B-4EC36C9DA111', -- Entity: MJ: Collection Artifacts
            100007,
            'Collection',
            'Collection',
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

/* SQL text to insert new entity field */

      IF NOT EXISTS (
         SELECT 1 FROM [${flyway:defaultSchema}].EntityField 
         WHERE ID = '62de3507-8ba4-4245-9295-d918e22caaeb'  OR 
               (EntityID = 'C754B94F-E7BC-4B8E-AD0B-4EC36C9DA111' AND Name = 'Artifact')
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
            '62de3507-8ba4-4245-9295-d918e22caaeb',
            'C754B94F-E7BC-4B8E-AD0B-4EC36C9DA111', -- Entity: MJ: Collection Artifacts
            100008,
            'Artifact',
            'Artifact',
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

