-- Migration: Collection Sharing Feature - Schema Changes
-- Description: Adds OwnerID to Collection, creates CollectionPermission table, and grants UI/Developer roles full permissions
-- Author: Generated
-- Date: 2025-10-16

-- =============================================================================
-- PART 1: ADD OWNERID TO COLLECTION TABLE
-- =============================================================================

-- Add OwnerID column to Collection table
ALTER TABLE [${flyway:defaultSchema}].[Collection]
ADD [OwnerID] UNIQUEIDENTIFIER NULL;
GO

-- Add foreign key constraint
ALTER TABLE [${flyway:defaultSchema}].[Collection]
ADD CONSTRAINT [FK_Collection_Owner]
    FOREIGN KEY ([OwnerID])
    REFERENCES [${flyway:defaultSchema}].[User] ([ID]);
GO

-- Create index for performance
CREATE INDEX [IDX_Collection_OwnerID]
ON [${flyway:defaultSchema}].[Collection] ([OwnerID]);
GO

-- Add extended property for documentation
EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'The user who owns this collection and has full permissions',
    @level0type = N'SCHEMA', @level0name = '${flyway:defaultSchema}',
    @level1type = N'TABLE', @level1name = 'Collection',
    @level2type = N'COLUMN', @level2name = 'OwnerID';
GO

-- =============================================================================
-- PART 2: CREATE COLLECTIONPERMISSION TABLE
-- =============================================================================

-- Create CollectionPermission table
CREATE TABLE [${flyway:defaultSchema}].[CollectionPermission] (
    [ID] UNIQUEIDENTIFIER NOT NULL DEFAULT (newsequentialid()),
    [CollectionID] UNIQUEIDENTIFIER NOT NULL,
    [UserID] UNIQUEIDENTIFIER NOT NULL,
    [CanRead] BIT NOT NULL DEFAULT 1,
    [CanShare] BIT NOT NULL DEFAULT 0,
    [CanEdit] BIT NOT NULL DEFAULT 0,
    [CanDelete] BIT NOT NULL DEFAULT 0,
    [SharedByUserID] UNIQUEIDENTIFIER NULL,
    CONSTRAINT [PK_CollectionPermission] PRIMARY KEY CLUSTERED ([ID] ASC),
    CONSTRAINT [FK_CollectionPermission_Collection]
        FOREIGN KEY ([CollectionID])
        REFERENCES [${flyway:defaultSchema}].[Collection] ([ID])
        ON DELETE CASCADE,
    CONSTRAINT [FK_CollectionPermission_User]
        FOREIGN KEY ([UserID])
        REFERENCES [${flyway:defaultSchema}].[User] ([ID]),
    CONSTRAINT [FK_CollectionPermission_SharedBy]
        FOREIGN KEY ([SharedByUserID])
        REFERENCES [${flyway:defaultSchema}].[User] ([ID]),
    CONSTRAINT [UQ_CollectionPermission_Collection_User]
        UNIQUE NONCLUSTERED ([CollectionID], [UserID])
);
GO

-- Indexes for performance
CREATE INDEX [IDX_CollectionPermission_CollectionID]
ON [${flyway:defaultSchema}].[CollectionPermission] ([CollectionID]);
GO

CREATE INDEX [IDX_CollectionPermission_UserID]
ON [${flyway:defaultSchema}].[CollectionPermission] ([UserID]);
GO

-- Extended properties for table
EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'Manages sharing permissions for collections, allowing granular access control',
    @level0type = N'SCHEMA', @level0name = '${flyway:defaultSchema}',
    @level1type = N'TABLE', @level1name = 'CollectionPermission';
GO

-- Extended properties for columns
EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'Always 1 - users must have read permission to access a shared collection',
    @level0type = N'SCHEMA', @level0name = '${flyway:defaultSchema}',
    @level1type = N'TABLE', @level1name = 'CollectionPermission',
    @level2type = N'COLUMN', @level2name = 'CanRead';
GO

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'Can share this collection with others (but cannot grant more permissions than they have)',
    @level0type = N'SCHEMA', @level0name = '${flyway:defaultSchema}',
    @level1type = N'TABLE', @level1name = 'CollectionPermission',
    @level2type = N'COLUMN', @level2name = 'CanShare';
GO

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'Can add/remove artifacts to/from this collection',
    @level0type = N'SCHEMA', @level0name = '${flyway:defaultSchema}',
    @level1type = N'TABLE', @level1name = 'CollectionPermission',
    @level2type = N'COLUMN', @level2name = 'CanEdit';
GO

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'Can delete the collection, child collections, and artifacts',
    @level0type = N'SCHEMA', @level0name = '${flyway:defaultSchema}',
    @level1type = N'TABLE', @level1name = 'CollectionPermission',
    @level2type = N'COLUMN', @level2name = 'CanDelete';
GO

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'The user who shared this collection (NULL if shared by owner)',
    @level0type = N'SCHEMA', @level0name = '${flyway:defaultSchema}',
    @level1type = N'TABLE', @level1name = 'CollectionPermission',
    @level2type = N'COLUMN', @level2name = 'SharedByUserID';
GO


-- =============================================================================
-- PART 3: GRANT ENTITY PERMISSIONS
-- =============================================================================

-- Grant full permissions for MJ: Collections to UI role
UPDATE [${flyway:defaultSchema}].[EntityPermission]
SET
    CanRead = 1,
    CanCreate = 1,
    CanUpdate = 1,
    CanDelete = 1
WHERE
    EntityID = 'FA0D11D1-4E8D-44D6-8C2B-55EEB3208E3E' -- MJ: Collections
    AND RoleID = 'E0AFCCEC-6A37-EF11-86D4-000D3A4E707E'; -- UI role
GO

-- Grant full permissions for MJ: Collections to Developer role
UPDATE [${flyway:defaultSchema}].[EntityPermission]
SET
    CanRead = 1,
    CanCreate = 1,
    CanUpdate = 1,
    CanDelete = 1
WHERE
    EntityID = 'FA0D11D1-4E8D-44D6-8C2B-55EEB3208E3E' -- MJ: Collections
    AND RoleID = 'DEAFCCEC-6A37-EF11-86D4-000D3A4E707E'; -- Developer role
GO

-- Grant full permissions for MJ: Collection Artifacts to UI role
UPDATE [${flyway:defaultSchema}].[EntityPermission]
SET
    CanRead = 1,
    CanCreate = 1,
    CanUpdate = 1,
    CanDelete = 1
WHERE
    EntityID = 'C754B94F-E7BC-4B8E-AD0B-4EC36C9DA111' -- MJ: Collection Artifacts
    AND RoleID = 'E0AFCCEC-6A37-EF11-86D4-000D3A4E707E'; -- UI role
GO

-- Grant full permissions for MJ: Collection Artifacts to Developer role
UPDATE [${flyway:defaultSchema}].[EntityPermission]
SET
    CanRead = 1,
    CanCreate = 1,
    CanUpdate = 1,
    CanDelete = 1
WHERE
    EntityID = 'C754B94F-E7BC-4B8E-AD0B-4EC36C9DA111' -- MJ: Collection Artifacts
    AND RoleID = 'DEAFCCEC-6A37-EF11-86D4-000D3A4E707E'; -- Developer role
GO

-- Grant full permissions for MJ: Collection Permissions to UI role
UPDATE [${flyway:defaultSchema}].[EntityPermission]
SET
    CanRead = 1,
    CanCreate = 1,
    CanUpdate = 1,
    CanDelete = 1
WHERE
    EntityID = '55E5A944-6ECD-491D-A4E9-99E1453FEBDB' -- MJ: Collection Permissions
    AND RoleID = 'E0AFCCEC-6A37-EF11-86D4-000D3A4E707E'; -- UI role
GO

-- Grant full permissions for MJ: Collection Permissions to Developer role
UPDATE [${flyway:defaultSchema}].[EntityPermission]
SET
    CanRead = 1,
    CanCreate = 1,
    CanUpdate = 1,
    CanDelete = 1
WHERE
    EntityID = '55E5A944-6ECD-491D-A4E9-99E1453FEBDB' -- MJ: Collection Permissions
    AND RoleID = 'DEAFCCEC-6A37-EF11-86D4-000D3A4E707E'; -- Developer role
GO









---- CODE GEN RUN
/* SQL text to update entity field related entity name field map for entity field ID 86EA433E-F36B-1410-8485-00E2629BC298 */
EXEC [${flyway:defaultSchema}].spUpdateEntityFieldRelatedEntityNameFieldMap
         @EntityFieldID='86EA433E-F36B-1410-8485-00E2629BC298',
         @RelatedEntityNameFieldMap='ContentItem'

/* SQL text to update entity field related entity name field map for entity field ID 9EEA433E-F36B-1410-8485-00E2629BC298 */
EXEC [${flyway:defaultSchema}].spUpdateEntityFieldRelatedEntityNameFieldMap
         @EntityFieldID='9EEA433E-F36B-1410-8485-00E2629BC298',
         @RelatedEntityNameFieldMap='Item'

/* SQL text to update entity field related entity name field map for entity field ID 56EA433E-F36B-1410-8485-00E2629BC298 */
EXEC [${flyway:defaultSchema}].spUpdateEntityFieldRelatedEntityNameFieldMap
         @EntityFieldID='56EA433E-F36B-1410-8485-00E2629BC298',
         @RelatedEntityNameFieldMap='ContentSource'

/* SQL text to update entity field related entity name field map for entity field ID 7AE9433E-F36B-1410-8485-00E2629BC298 */
EXEC [${flyway:defaultSchema}].spUpdateEntityFieldRelatedEntityNameFieldMap
         @EntityFieldID='7AE9433E-F36B-1410-8485-00E2629BC298',
         @RelatedEntityNameFieldMap='Source'

/* SQL text to update entity field related entity name field map for entity field ID BAE9433E-F36B-1410-8485-00E2629BC298 */
EXEC [${flyway:defaultSchema}].spUpdateEntityFieldRelatedEntityNameFieldMap
         @EntityFieldID='BAE9433E-F36B-1410-8485-00E2629BC298',
         @RelatedEntityNameFieldMap='ContentSource'

/* SQL text to update entity field related entity name field map for entity field ID 62EA433E-F36B-1410-8485-00E2629BC298 */
EXEC [${flyway:defaultSchema}].spUpdateEntityFieldRelatedEntityNameFieldMap
         @EntityFieldID='62EA433E-F36B-1410-8485-00E2629BC298',
         @RelatedEntityNameFieldMap='ContentType'

/* SQL text to update entity field related entity name field map for entity field ID 66EA433E-F36B-1410-8485-00E2629BC298 */
EXEC [${flyway:defaultSchema}].spUpdateEntityFieldRelatedEntityNameFieldMap
         @EntityFieldID='66EA433E-F36B-1410-8485-00E2629BC298',
         @RelatedEntityNameFieldMap='ContentSourceType'

/* SQL text to update entity field related entity name field map for entity field ID 6AEA433E-F36B-1410-8485-00E2629BC298 */
EXEC [${flyway:defaultSchema}].spUpdateEntityFieldRelatedEntityNameFieldMap
         @EntityFieldID='6AEA433E-F36B-1410-8485-00E2629BC298',
         @RelatedEntityNameFieldMap='ContentFileType'

/* SQL text to update entity field related entity name field map for entity field ID 9EE9433E-F36B-1410-8485-00E2629BC298 */
EXEC [${flyway:defaultSchema}].spUpdateEntityFieldRelatedEntityNameFieldMap
         @EntityFieldID='9EE9433E-F36B-1410-8485-00E2629BC298',
         @RelatedEntityNameFieldMap='ContentType'

/* SQL text to update entity field related entity name field map for entity field ID 0EEA433E-F36B-1410-8485-00E2629BC298 */
EXEC [${flyway:defaultSchema}].spUpdateEntityFieldRelatedEntityNameFieldMap
         @EntityFieldID='0EEA433E-F36B-1410-8485-00E2629BC298',
         @RelatedEntityNameFieldMap='AIModel'

/* SQL text to update entity field related entity name field map for entity field ID A2E9433E-F36B-1410-8485-00E2629BC298 */
EXEC [${flyway:defaultSchema}].spUpdateEntityFieldRelatedEntityNameFieldMap
         @EntityFieldID='A2E9433E-F36B-1410-8485-00E2629BC298',
         @RelatedEntityNameFieldMap='ContentSourceType'

/* SQL text to update entity field related entity name field map for entity field ID A6E9433E-F36B-1410-8485-00E2629BC298 */
EXEC [${flyway:defaultSchema}].spUpdateEntityFieldRelatedEntityNameFieldMap
         @EntityFieldID='A6E9433E-F36B-1410-8485-00E2629BC298',
         @RelatedEntityNameFieldMap='ContentFileType'

/* SQL text to update entity field related entity name field map for entity field ID 24EB433E-F36B-1410-8485-00E2629BC298 */
EXEC [${flyway:defaultSchema}].spUpdateEntityFieldRelatedEntityNameFieldMap
         @EntityFieldID='24EB433E-F36B-1410-8485-00E2629BC298',
         @RelatedEntityNameFieldMap='User'

/* SQL text to update entity field related entity name field map for entity field ID E6EA433E-F36B-1410-8485-00E2629BC298 */
EXEC [${flyway:defaultSchema}].spUpdateEntityFieldRelatedEntityNameFieldMap
         @EntityFieldID='E6EA433E-F36B-1410-8485-00E2629BC298',
         @RelatedEntityNameFieldMap='ResourceType'

/* SQL text to update entity field related entity name field map for entity field ID 28EB433E-F36B-1410-8485-00E2629BC298 */
EXEC [${flyway:defaultSchema}].spUpdateEntityFieldRelatedEntityNameFieldMap
         @EntityFieldID='28EB433E-F36B-1410-8485-00E2629BC298',
         @RelatedEntityNameFieldMap='ResourceType'

/* SQL text to update entity field related entity name field map for entity field ID EEEA433E-F36B-1410-8485-00E2629BC298 */
EXEC [${flyway:defaultSchema}].spUpdateEntityFieldRelatedEntityNameFieldMap
         @EntityFieldID='EEEA433E-F36B-1410-8485-00E2629BC298',
         @RelatedEntityNameFieldMap='Role'

/* SQL text to update entity field related entity name field map for entity field ID F0EA433E-F36B-1410-8485-00E2629BC298 */
EXEC [${flyway:defaultSchema}].spUpdateEntityFieldRelatedEntityNameFieldMap
         @EntityFieldID='F0EA433E-F36B-1410-8485-00E2629BC298',
         @RelatedEntityNameFieldMap='User'

/* SQL generated to create new entity MJ: Collection Permissions */

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
         '55e5a944-6ecd-491d-a4e9-99e1453febdb',
         'MJ: Collection Permissions',
         'Collection Permissions',
         NULL,
         NULL,
         'CollectionPermission',
         'vwCollectionPermissions',
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
   

/* SQL generated to add new entity MJ: Collection Permissions to application ID: 'EBA5CCEC-6A37-EF11-86D4-000D3A4E707E' */
INSERT INTO ${flyway:defaultSchema}.ApplicationEntity
                                       (ApplicationID, EntityID, Sequence) VALUES
                                       ('EBA5CCEC-6A37-EF11-86D4-000D3A4E707E', '55e5a944-6ecd-491d-a4e9-99e1453febdb', (SELECT ISNULL(MAX(Sequence),0)+1 FROM ${flyway:defaultSchema}.ApplicationEntity WHERE ApplicationID = 'EBA5CCEC-6A37-EF11-86D4-000D3A4E707E'))

/* SQL generated to add new permission for entity MJ: Collection Permissions for role UI */
INSERT INTO ${flyway:defaultSchema}.EntityPermission
                                                   (EntityID, RoleID, CanRead, CanCreate, CanUpdate, CanDelete) VALUES
                                                   ('55e5a944-6ecd-491d-a4e9-99e1453febdb', 'E0AFCCEC-6A37-EF11-86D4-000D3A4E707E', 1, 0, 0, 0)

/* SQL generated to add new permission for entity MJ: Collection Permissions for role Developer */
INSERT INTO ${flyway:defaultSchema}.EntityPermission
                                                   (EntityID, RoleID, CanRead, CanCreate, CanUpdate, CanDelete) VALUES
                                                   ('55e5a944-6ecd-491d-a4e9-99e1453febdb', 'DEAFCCEC-6A37-EF11-86D4-000D3A4E707E', 1, 1, 1, 0)

/* SQL generated to add new permission for entity MJ: Collection Permissions for role Integration */
INSERT INTO ${flyway:defaultSchema}.EntityPermission
                                                   (EntityID, RoleID, CanRead, CanCreate, CanUpdate, CanDelete) VALUES
                                                   ('55e5a944-6ecd-491d-a4e9-99e1453febdb', 'DFAFCCEC-6A37-EF11-86D4-000D3A4E707E', 1, 1, 1, 1)

/* SQL text to add special date field __mj_CreatedAt to entity ${flyway:defaultSchema}.CollectionPermission */
ALTER TABLE [${flyway:defaultSchema}].[CollectionPermission] ADD __mj_CreatedAt DATETIMEOFFSET NOT NULL DEFAULT GETUTCDATE()

/* SQL text to add special date field __mj_UpdatedAt to entity ${flyway:defaultSchema}.CollectionPermission */
ALTER TABLE [${flyway:defaultSchema}].[CollectionPermission] ADD __mj_UpdatedAt DATETIMEOFFSET NOT NULL DEFAULT GETUTCDATE()

/* SQL text to insert new entity field */

      IF NOT EXISTS (
         SELECT 1 FROM [${flyway:defaultSchema}].EntityField 
         WHERE ID = 'cfa3a143-0594-49d1-8c24-8c1122ce9d27'  OR 
               (EntityID = 'FA0D11D1-4E8D-44D6-8C2B-55EEB3208E3E' AND Name = 'OwnerID')
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
            'cfa3a143-0594-49d1-8c24-8c1122ce9d27',
            'FA0D11D1-4E8D-44D6-8C2B-55EEB3208E3E', -- Entity: MJ: Collections
            100024,
            'OwnerID',
            'Owner ID',
            'The user who owns this collection and has full permissions',
            'uniqueidentifier',
            16,
            0,
            0,
            1,
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
            0,
            'Search'
         )
      END

/* SQL text to insert new entity field */

      IF NOT EXISTS (
         SELECT 1 FROM [${flyway:defaultSchema}].EntityField 
         WHERE ID = '2ae20597-f812-4b71-b08e-a1688b6e1e32'  OR 
               (EntityID = '55E5A944-6ECD-491D-A4E9-99E1453FEBDB' AND Name = 'ID')
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
            '2ae20597-f812-4b71-b08e-a1688b6e1e32',
            '55E5A944-6ECD-491D-A4E9-99E1453FEBDB', -- Entity: MJ: Collection Permissions
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
         WHERE ID = 'ab584fe2-f26f-4ac2-b440-22c59eb99ee6'  OR 
               (EntityID = '55E5A944-6ECD-491D-A4E9-99E1453FEBDB' AND Name = 'CollectionID')
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
            'ab584fe2-f26f-4ac2-b440-22c59eb99ee6',
            '55E5A944-6ECD-491D-A4E9-99E1453FEBDB', -- Entity: MJ: Collection Permissions
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
         WHERE ID = 'b4cfbd5c-c208-4299-9c64-de82853e6752'  OR 
               (EntityID = '55E5A944-6ECD-491D-A4E9-99E1453FEBDB' AND Name = 'UserID')
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
            'b4cfbd5c-c208-4299-9c64-de82853e6752',
            '55E5A944-6ECD-491D-A4E9-99E1453FEBDB', -- Entity: MJ: Collection Permissions
            100003,
            'UserID',
            'User ID',
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
         WHERE ID = '943a652a-7a9a-4bea-b63d-14346d73d866'  OR 
               (EntityID = '55E5A944-6ECD-491D-A4E9-99E1453FEBDB' AND Name = 'CanRead')
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
            '943a652a-7a9a-4bea-b63d-14346d73d866',
            '55E5A944-6ECD-491D-A4E9-99E1453FEBDB', -- Entity: MJ: Collection Permissions
            100004,
            'CanRead',
            'Can Read',
            'Always 1 - users must have read permission to access a shared collection',
            'bit',
            1,
            1,
            0,
            0,
            '(1)',
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
         WHERE ID = '676ae334-3f29-4409-bea7-22169c1f793e'  OR 
               (EntityID = '55E5A944-6ECD-491D-A4E9-99E1453FEBDB' AND Name = 'CanShare')
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
            '676ae334-3f29-4409-bea7-22169c1f793e',
            '55E5A944-6ECD-491D-A4E9-99E1453FEBDB', -- Entity: MJ: Collection Permissions
            100005,
            'CanShare',
            'Can Share',
            'Can share this collection with others (but cannot grant more permissions than they have)',
            'bit',
            1,
            1,
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
         WHERE ID = '56db1db9-85d9-44c2-af1c-49400287ae3f'  OR 
               (EntityID = '55E5A944-6ECD-491D-A4E9-99E1453FEBDB' AND Name = 'CanEdit')
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
            '56db1db9-85d9-44c2-af1c-49400287ae3f',
            '55E5A944-6ECD-491D-A4E9-99E1453FEBDB', -- Entity: MJ: Collection Permissions
            100006,
            'CanEdit',
            'Can Edit',
            'Can add/remove artifacts to/from this collection',
            'bit',
            1,
            1,
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
         WHERE ID = '7c7c2827-9022-4363-8ce4-d8e416667429'  OR 
               (EntityID = '55E5A944-6ECD-491D-A4E9-99E1453FEBDB' AND Name = 'CanDelete')
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
            '7c7c2827-9022-4363-8ce4-d8e416667429',
            '55E5A944-6ECD-491D-A4E9-99E1453FEBDB', -- Entity: MJ: Collection Permissions
            100007,
            'CanDelete',
            'Can Delete',
            'Can delete the collection, child collections, and artifacts',
            'bit',
            1,
            1,
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
         WHERE ID = '9376bfed-72bc-4d53-a51b-ed44a275cfec'  OR 
               (EntityID = '55E5A944-6ECD-491D-A4E9-99E1453FEBDB' AND Name = 'SharedByUserID')
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
            '9376bfed-72bc-4d53-a51b-ed44a275cfec',
            '55E5A944-6ECD-491D-A4E9-99E1453FEBDB', -- Entity: MJ: Collection Permissions
            100008,
            'SharedByUserID',
            'Shared By User ID',
            'The user who shared this collection (NULL if shared by owner)',
            'uniqueidentifier',
            16,
            0,
            0,
            1,
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
            0,
            'Search'
         )
      END

/* SQL text to insert new entity field */

      IF NOT EXISTS (
         SELECT 1 FROM [${flyway:defaultSchema}].EntityField 
         WHERE ID = '6346812f-f37a-4d49-b29a-b137b0ff7211'  OR 
               (EntityID = '55E5A944-6ECD-491D-A4E9-99E1453FEBDB' AND Name = '__mj_CreatedAt')
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
            '6346812f-f37a-4d49-b29a-b137b0ff7211',
            '55E5A944-6ECD-491D-A4E9-99E1453FEBDB', -- Entity: MJ: Collection Permissions
            100009,
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
         WHERE ID = '6bc6aa55-aa29-460d-8664-5e93a5c0d973'  OR 
               (EntityID = '55E5A944-6ECD-491D-A4E9-99E1453FEBDB' AND Name = '__mj_UpdatedAt')
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
            '6bc6aa55-aa29-460d-8664-5e93a5c0d973',
            '55E5A944-6ECD-491D-A4E9-99E1453FEBDB', -- Entity: MJ: Collection Permissions
            100010,
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
      WHERE ID = '83142279-7d04-493d-b275-de5770a31512'
   )
   BEGIN
      INSERT INTO ${flyway:defaultSchema}.EntityRelationship (ID, EntityID, RelatedEntityID, RelatedEntityJoinField, Type, BundleInAPI, DisplayInForm, DisplayName, Sequence)
                              VALUES ('83142279-7d04-493d-b275-de5770a31512', 'FA0D11D1-4E8D-44D6-8C2B-55EEB3208E3E', '55E5A944-6ECD-491D-A4E9-99E1453FEBDB', 'CollectionID', 'One To Many', 1, 1, 'MJ: Collection Permissions', 1);
   END
                              

/* SQL text to create Entitiy Relationships */

   IF NOT EXISTS (
      SELECT 1
      FROM [${flyway:defaultSchema}].EntityRelationship
      WHERE ID = 'a6996b42-5f84-4726-a513-f6e757223f6c'
   )
   BEGIN
      INSERT INTO ${flyway:defaultSchema}.EntityRelationship (ID, EntityID, RelatedEntityID, RelatedEntityJoinField, Type, BundleInAPI, DisplayInForm, DisplayName, Sequence)
                              VALUES ('a6996b42-5f84-4726-a513-f6e757223f6c', 'E1238F34-2837-EF11-86D4-6045BDEE16E6', '55E5A944-6ECD-491D-A4E9-99E1453FEBDB', 'SharedByUserID', 'One To Many', 1, 1, 'MJ: Collection Permissions', 2);
   END
                              
   IF NOT EXISTS (
      SELECT 1
      FROM [${flyway:defaultSchema}].EntityRelationship
      WHERE ID = '09e7fb7e-efff-4efd-9dcc-e332f57b1aa5'
   )
   BEGIN
      INSERT INTO ${flyway:defaultSchema}.EntityRelationship (ID, EntityID, RelatedEntityID, RelatedEntityJoinField, Type, BundleInAPI, DisplayInForm, DisplayName, Sequence)
                              VALUES ('09e7fb7e-efff-4efd-9dcc-e332f57b1aa5', 'E1238F34-2837-EF11-86D4-6045BDEE16E6', '55E5A944-6ECD-491D-A4E9-99E1453FEBDB', 'UserID', 'One To Many', 1, 1, 'MJ: Collection Permissions', 3);
   END
                              

/* SQL text to create Entitiy Relationships */

   IF NOT EXISTS (
      SELECT 1
      FROM [${flyway:defaultSchema}].EntityRelationship
      WHERE ID = 'aaa2b7a4-bf35-4019-8c4e-070f70e8e3da'
   )
   BEGIN
      INSERT INTO ${flyway:defaultSchema}.EntityRelationship (ID, EntityID, RelatedEntityID, RelatedEntityJoinField, Type, BundleInAPI, DisplayInForm, DisplayName, Sequence)
                              VALUES ('aaa2b7a4-bf35-4019-8c4e-070f70e8e3da', 'E1238F34-2837-EF11-86D4-6045BDEE16E6', 'FA0D11D1-4E8D-44D6-8C2B-55EEB3208E3E', 'OwnerID', 'One To Many', 1, 1, 'MJ: Collections', 3);
   END
                              

/* Index for Foreign Keys for CollectionPermission */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Collection Permissions
-- Item: Index for Foreign Keys
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------
-- Index for foreign key CollectionID in table CollectionPermission
IF NOT EXISTS (
    SELECT 1
    FROM sys.indexes
    WHERE name = 'IDX_AUTO_MJ_FKEY_CollectionPermission_CollectionID' 
    AND object_id = OBJECT_ID('[${flyway:defaultSchema}].[CollectionPermission]')
)
CREATE INDEX IDX_AUTO_MJ_FKEY_CollectionPermission_CollectionID ON [${flyway:defaultSchema}].[CollectionPermission] ([CollectionID]);

-- Index for foreign key UserID in table CollectionPermission
IF NOT EXISTS (
    SELECT 1
    FROM sys.indexes
    WHERE name = 'IDX_AUTO_MJ_FKEY_CollectionPermission_UserID' 
    AND object_id = OBJECT_ID('[${flyway:defaultSchema}].[CollectionPermission]')
)
CREATE INDEX IDX_AUTO_MJ_FKEY_CollectionPermission_UserID ON [${flyway:defaultSchema}].[CollectionPermission] ([UserID]);

-- Index for foreign key SharedByUserID in table CollectionPermission
IF NOT EXISTS (
    SELECT 1
    FROM sys.indexes
    WHERE name = 'IDX_AUTO_MJ_FKEY_CollectionPermission_SharedByUserID' 
    AND object_id = OBJECT_ID('[${flyway:defaultSchema}].[CollectionPermission]')
)
CREATE INDEX IDX_AUTO_MJ_FKEY_CollectionPermission_SharedByUserID ON [${flyway:defaultSchema}].[CollectionPermission] ([SharedByUserID]);

/* SQL text to update entity field related entity name field map for entity field ID AB584FE2-F26F-4AC2-B440-22C59EB99EE6 */
EXEC [${flyway:defaultSchema}].spUpdateEntityFieldRelatedEntityNameFieldMap
         @EntityFieldID='AB584FE2-F26F-4AC2-B440-22C59EB99EE6',
         @RelatedEntityNameFieldMap='Collection'

/* Index for Foreign Keys for Collection */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Collections
-- Item: Index for Foreign Keys
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------
-- Index for foreign key EnvironmentID in table Collection
IF NOT EXISTS (
    SELECT 1
    FROM sys.indexes
    WHERE name = 'IDX_AUTO_MJ_FKEY_Collection_EnvironmentID' 
    AND object_id = OBJECT_ID('[${flyway:defaultSchema}].[Collection]')
)
CREATE INDEX IDX_AUTO_MJ_FKEY_Collection_EnvironmentID ON [${flyway:defaultSchema}].[Collection] ([EnvironmentID]);

-- Index for foreign key ParentID in table Collection
IF NOT EXISTS (
    SELECT 1
    FROM sys.indexes
    WHERE name = 'IDX_AUTO_MJ_FKEY_Collection_ParentID' 
    AND object_id = OBJECT_ID('[${flyway:defaultSchema}].[Collection]')
)
CREATE INDEX IDX_AUTO_MJ_FKEY_Collection_ParentID ON [${flyway:defaultSchema}].[Collection] ([ParentID]);

-- Index for foreign key OwnerID in table Collection
IF NOT EXISTS (
    SELECT 1
    FROM sys.indexes
    WHERE name = 'IDX_AUTO_MJ_FKEY_Collection_OwnerID' 
    AND object_id = OBJECT_ID('[${flyway:defaultSchema}].[Collection]')
)
CREATE INDEX IDX_AUTO_MJ_FKEY_Collection_OwnerID ON [${flyway:defaultSchema}].[Collection] ([OwnerID]);

/* Root ID Function SQL for MJ: Collections.ParentID */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Collections
-- Item: fnCollectionParentID_GetRootID
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------
------------------------------------------------------------
----- ROOT ID FUNCTION FOR: [Collection].[ParentID]
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[fnCollectionParentID_GetRootID]', 'IF') IS NOT NULL
    DROP FUNCTION [${flyway:defaultSchema}].[fnCollectionParentID_GetRootID];
GO

CREATE FUNCTION [${flyway:defaultSchema}].[fnCollectionParentID_GetRootID]
(
    @RecordID uniqueidentifier,
    @ParentID uniqueidentifier
)
RETURNS TABLE
AS
RETURN
(
    WITH CTE_RootParent AS (
        -- Anchor: Start from @ParentID if not null, otherwise start from @RecordID
        SELECT
            [ID],
            [ParentID],
            [ID] AS [RootParentID],
            0 AS [Depth]
        FROM
            [${flyway:defaultSchema}].[Collection]
        WHERE
            [ID] = COALESCE(@ParentID, @RecordID)

        UNION ALL

        -- Recursive: Keep going up the hierarchy until ParentID is NULL
        -- Includes depth counter to prevent infinite loops from circular references
        SELECT
            c.[ID],
            c.[ParentID],
            c.[ID] AS [RootParentID],
            p.[Depth] + 1 AS [Depth]
        FROM
            [${flyway:defaultSchema}].[Collection] c
        INNER JOIN
            CTE_RootParent p ON c.[ID] = p.[ParentID]
        WHERE
            p.[Depth] < 100  -- Prevent infinite loops, max 100 levels
    )
    SELECT TOP 1
        [RootParentID] AS RootID
    FROM
        CTE_RootParent
    WHERE
        [ParentID] IS NULL
    ORDER BY
        [RootParentID]
);
GO


/* SQL text to update entity field related entity name field map for entity field ID CFA3A143-0594-49D1-8C24-8C1122CE9D27 */
EXEC [${flyway:defaultSchema}].spUpdateEntityFieldRelatedEntityNameFieldMap
         @EntityFieldID='CFA3A143-0594-49D1-8C24-8C1122CE9D27',
         @RelatedEntityNameFieldMap='Owner'

/* Base View SQL for MJ: Collections */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Collections
-- Item: vwCollections
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- BASE VIEW FOR ENTITY:      MJ: Collections
-----               SCHEMA:      ${flyway:defaultSchema}
-----               BASE TABLE:  Collection
-----               PRIMARY KEY: ID
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[vwCollections]', 'V') IS NOT NULL
    DROP VIEW [${flyway:defaultSchema}].[vwCollections];
GO

CREATE VIEW [${flyway:defaultSchema}].[vwCollections]
AS
SELECT
    c.*,
    Environment_EnvironmentID.[Name] AS [Environment],
    Collection_ParentID.[Name] AS [Parent],
    User_OwnerID.[Name] AS [Owner],
    root_ParentID.RootID AS [RootParentID]
FROM
    [${flyway:defaultSchema}].[Collection] AS c
INNER JOIN
    [${flyway:defaultSchema}].[Environment] AS Environment_EnvironmentID
  ON
    [c].[EnvironmentID] = Environment_EnvironmentID.[ID]
LEFT OUTER JOIN
    [${flyway:defaultSchema}].[Collection] AS Collection_ParentID
  ON
    [c].[ParentID] = Collection_ParentID.[ID]
LEFT OUTER JOIN
    [${flyway:defaultSchema}].[User] AS User_OwnerID
  ON
    [c].[OwnerID] = User_OwnerID.[ID]
OUTER APPLY
    [${flyway:defaultSchema}].[fnCollectionParentID_GetRootID]([c].[ID], [c].[ParentID]) AS root_ParentID
GO
GRANT SELECT ON [${flyway:defaultSchema}].[vwCollections] TO [cdp_UI], [cdp_Developer], [cdp_Integration]
    

/* Base View Permissions SQL for MJ: Collections */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Collections
-- Item: Permissions for vwCollections
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

GRANT SELECT ON [${flyway:defaultSchema}].[vwCollections] TO [cdp_UI], [cdp_Developer], [cdp_Integration]

/* spCreate SQL for MJ: Collections */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Collections
-- Item: spCreateCollection
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- CREATE PROCEDURE FOR Collection
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[spCreateCollection]', 'P') IS NOT NULL
    DROP PROCEDURE [${flyway:defaultSchema}].[spCreateCollection];
GO

CREATE PROCEDURE [${flyway:defaultSchema}].[spCreateCollection]
    @ID uniqueidentifier = NULL,
    @EnvironmentID uniqueidentifier = NULL,
    @ParentID uniqueidentifier,
    @Name nvarchar(255),
    @Description nvarchar(MAX),
    @Icon nvarchar(50),
    @Color nvarchar(7),
    @Sequence int,
    @OwnerID uniqueidentifier
AS
BEGIN
    SET NOCOUNT ON;
    DECLARE @InsertedRow TABLE ([ID] UNIQUEIDENTIFIER)
    
    IF @ID IS NOT NULL
    BEGIN
        -- User provided a value, use it
        INSERT INTO [${flyway:defaultSchema}].[Collection]
            (
                [ID],
                [EnvironmentID],
                [ParentID],
                [Name],
                [Description],
                [Icon],
                [Color],
                [Sequence],
                [OwnerID]
            )
        OUTPUT INSERTED.[ID] INTO @InsertedRow
        VALUES
            (
                @ID,
                CASE @EnvironmentID WHEN '00000000-0000-0000-0000-000000000000' THEN 'F51358F3-9447-4176-B313-BF8025FD8D09' ELSE ISNULL(@EnvironmentID, 'F51358F3-9447-4176-B313-BF8025FD8D09') END,
                @ParentID,
                @Name,
                @Description,
                @Icon,
                @Color,
                @Sequence,
                @OwnerID
            )
    END
    ELSE
    BEGIN
        -- No value provided, let database use its default (e.g., NEWSEQUENTIALID())
        INSERT INTO [${flyway:defaultSchema}].[Collection]
            (
                [EnvironmentID],
                [ParentID],
                [Name],
                [Description],
                [Icon],
                [Color],
                [Sequence],
                [OwnerID]
            )
        OUTPUT INSERTED.[ID] INTO @InsertedRow
        VALUES
            (
                CASE @EnvironmentID WHEN '00000000-0000-0000-0000-000000000000' THEN 'F51358F3-9447-4176-B313-BF8025FD8D09' ELSE ISNULL(@EnvironmentID, 'F51358F3-9447-4176-B313-BF8025FD8D09') END,
                @ParentID,
                @Name,
                @Description,
                @Icon,
                @Color,
                @Sequence,
                @OwnerID
            )
    END
    -- return the new record from the base view, which might have some calculated fields
    SELECT * FROM [${flyway:defaultSchema}].[vwCollections] WHERE [ID] = (SELECT [ID] FROM @InsertedRow)
END
GO
GRANT EXECUTE ON [${flyway:defaultSchema}].[spCreateCollection] TO [cdp_UI], [cdp_Developer], [cdp_Integration]
    

/* spCreate Permissions for MJ: Collections */

GRANT EXECUTE ON [${flyway:defaultSchema}].[spCreateCollection] TO [cdp_UI], [cdp_Developer], [cdp_Integration]



/* spUpdate SQL for MJ: Collections */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Collections
-- Item: spUpdateCollection
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- UPDATE PROCEDURE FOR Collection
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[spUpdateCollection]', 'P') IS NOT NULL
    DROP PROCEDURE [${flyway:defaultSchema}].[spUpdateCollection];
GO

CREATE PROCEDURE [${flyway:defaultSchema}].[spUpdateCollection]
    @ID uniqueidentifier,
    @EnvironmentID uniqueidentifier,
    @ParentID uniqueidentifier,
    @Name nvarchar(255),
    @Description nvarchar(MAX),
    @Icon nvarchar(50),
    @Color nvarchar(7),
    @Sequence int,
    @OwnerID uniqueidentifier
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE
        [${flyway:defaultSchema}].[Collection]
    SET
        [EnvironmentID] = @EnvironmentID,
        [ParentID] = @ParentID,
        [Name] = @Name,
        [Description] = @Description,
        [Icon] = @Icon,
        [Color] = @Color,
        [Sequence] = @Sequence,
        [OwnerID] = @OwnerID
    WHERE
        [ID] = @ID

    -- Check if the update was successful
    IF @@ROWCOUNT = 0
        -- Nothing was updated, return no rows, but column structure from base view intact, semantically correct this way.
        SELECT TOP 0 * FROM [${flyway:defaultSchema}].[vwCollections] WHERE 1=0
    ELSE
        -- Return the updated record so the caller can see the updated values and any calculated fields
        SELECT
                                        *
                                    FROM
                                        [${flyway:defaultSchema}].[vwCollections]
                                    WHERE
                                        [ID] = @ID
                                    
END
GO

GRANT EXECUTE ON [${flyway:defaultSchema}].[spUpdateCollection] TO [cdp_UI], [cdp_Developer], [cdp_Integration]
GO

------------------------------------------------------------
----- TRIGGER FOR __mj_UpdatedAt field for the Collection table
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[trgUpdateCollection]', 'TR') IS NOT NULL
    DROP TRIGGER [${flyway:defaultSchema}].[trgUpdateCollection];
GO
CREATE TRIGGER [${flyway:defaultSchema}].trgUpdateCollection
ON [${flyway:defaultSchema}].[Collection]
AFTER UPDATE
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE
        [${flyway:defaultSchema}].[Collection]
    SET
        __mj_UpdatedAt = GETUTCDATE()
    FROM
        [${flyway:defaultSchema}].[Collection] AS _organicTable
    INNER JOIN
        INSERTED AS I ON
        _organicTable.[ID] = I.[ID];
END;
GO
        

/* spUpdate Permissions for MJ: Collections */

GRANT EXECUTE ON [${flyway:defaultSchema}].[spUpdateCollection] TO [cdp_UI], [cdp_Developer], [cdp_Integration]



/* spDelete SQL for MJ: Collections */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Collections
-- Item: spDeleteCollection
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- DELETE PROCEDURE FOR Collection
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[spDeleteCollection]', 'P') IS NOT NULL
    DROP PROCEDURE [${flyway:defaultSchema}].[spDeleteCollection];
GO

CREATE PROCEDURE [${flyway:defaultSchema}].[spDeleteCollection]
    @ID uniqueidentifier
AS
BEGIN
    SET NOCOUNT ON;

    DELETE FROM
        [${flyway:defaultSchema}].[Collection]
    WHERE
        [ID] = @ID


    -- Check if the delete was successful
    IF @@ROWCOUNT = 0
        SELECT NULL AS [ID] -- Return NULL for all primary key fields to indicate no record was deleted
    ELSE
        SELECT @ID AS [ID] -- Return the primary key values to indicate we successfully deleted the record
END
GO
GRANT EXECUTE ON [${flyway:defaultSchema}].[spDeleteCollection] TO [cdp_UI], [cdp_Developer], [cdp_Integration]
    

/* spDelete Permissions for MJ: Collections */

GRANT EXECUTE ON [${flyway:defaultSchema}].[spDeleteCollection] TO [cdp_UI], [cdp_Developer], [cdp_Integration]



/* SQL text to update entity field related entity name field map for entity field ID B4CFBD5C-C208-4299-9C64-DE82853E6752 */
EXEC [${flyway:defaultSchema}].spUpdateEntityFieldRelatedEntityNameFieldMap
         @EntityFieldID='B4CFBD5C-C208-4299-9C64-DE82853E6752',
         @RelatedEntityNameFieldMap='User'

/* SQL text to update entity field related entity name field map for entity field ID 9376BFED-72BC-4D53-A51B-ED44A275CFEC */
EXEC [${flyway:defaultSchema}].spUpdateEntityFieldRelatedEntityNameFieldMap
         @EntityFieldID='9376BFED-72BC-4D53-A51B-ED44A275CFEC',
         @RelatedEntityNameFieldMap='SharedByUser'

/* Base View SQL for MJ: Collection Permissions */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Collection Permissions
-- Item: vwCollectionPermissions
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- BASE VIEW FOR ENTITY:      MJ: Collection Permissions
-----               SCHEMA:      ${flyway:defaultSchema}
-----               BASE TABLE:  CollectionPermission
-----               PRIMARY KEY: ID
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[vwCollectionPermissions]', 'V') IS NOT NULL
    DROP VIEW [${flyway:defaultSchema}].[vwCollectionPermissions];
GO

CREATE VIEW [${flyway:defaultSchema}].[vwCollectionPermissions]
AS
SELECT
    c.*,
    Collection_CollectionID.[Name] AS [Collection],
    User_UserID.[Name] AS [User],
    User_SharedByUserID.[Name] AS [SharedByUser]
FROM
    [${flyway:defaultSchema}].[CollectionPermission] AS c
INNER JOIN
    [${flyway:defaultSchema}].[Collection] AS Collection_CollectionID
  ON
    [c].[CollectionID] = Collection_CollectionID.[ID]
INNER JOIN
    [${flyway:defaultSchema}].[User] AS User_UserID
  ON
    [c].[UserID] = User_UserID.[ID]
LEFT OUTER JOIN
    [${flyway:defaultSchema}].[User] AS User_SharedByUserID
  ON
    [c].[SharedByUserID] = User_SharedByUserID.[ID]
GO
GRANT SELECT ON [${flyway:defaultSchema}].[vwCollectionPermissions] TO [cdp_UI], [cdp_Developer], [cdp_Integration]
    

/* Base View Permissions SQL for MJ: Collection Permissions */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Collection Permissions
-- Item: Permissions for vwCollectionPermissions
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

GRANT SELECT ON [${flyway:defaultSchema}].[vwCollectionPermissions] TO [cdp_UI], [cdp_Developer], [cdp_Integration]

/* spCreate SQL for MJ: Collection Permissions */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Collection Permissions
-- Item: spCreateCollectionPermission
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- CREATE PROCEDURE FOR CollectionPermission
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[spCreateCollectionPermission]', 'P') IS NOT NULL
    DROP PROCEDURE [${flyway:defaultSchema}].[spCreateCollectionPermission];
GO

CREATE PROCEDURE [${flyway:defaultSchema}].[spCreateCollectionPermission]
    @ID uniqueidentifier = NULL,
    @CollectionID uniqueidentifier,
    @UserID uniqueidentifier,
    @CanRead bit = NULL,
    @CanShare bit = NULL,
    @CanEdit bit = NULL,
    @CanDelete bit = NULL,
    @SharedByUserID uniqueidentifier
AS
BEGIN
    SET NOCOUNT ON;
    DECLARE @InsertedRow TABLE ([ID] UNIQUEIDENTIFIER)
    
    IF @ID IS NOT NULL
    BEGIN
        -- User provided a value, use it
        INSERT INTO [${flyway:defaultSchema}].[CollectionPermission]
            (
                [ID],
                [CollectionID],
                [UserID],
                [CanRead],
                [CanShare],
                [CanEdit],
                [CanDelete],
                [SharedByUserID]
            )
        OUTPUT INSERTED.[ID] INTO @InsertedRow
        VALUES
            (
                @ID,
                @CollectionID,
                @UserID,
                ISNULL(@CanRead, 1),
                ISNULL(@CanShare, 0),
                ISNULL(@CanEdit, 0),
                ISNULL(@CanDelete, 0),
                @SharedByUserID
            )
    END
    ELSE
    BEGIN
        -- No value provided, let database use its default (e.g., NEWSEQUENTIALID())
        INSERT INTO [${flyway:defaultSchema}].[CollectionPermission]
            (
                [CollectionID],
                [UserID],
                [CanRead],
                [CanShare],
                [CanEdit],
                [CanDelete],
                [SharedByUserID]
            )
        OUTPUT INSERTED.[ID] INTO @InsertedRow
        VALUES
            (
                @CollectionID,
                @UserID,
                ISNULL(@CanRead, 1),
                ISNULL(@CanShare, 0),
                ISNULL(@CanEdit, 0),
                ISNULL(@CanDelete, 0),
                @SharedByUserID
            )
    END
    -- return the new record from the base view, which might have some calculated fields
    SELECT * FROM [${flyway:defaultSchema}].[vwCollectionPermissions] WHERE [ID] = (SELECT [ID] FROM @InsertedRow)
END
GO
GRANT EXECUTE ON [${flyway:defaultSchema}].[spCreateCollectionPermission] TO [cdp_Developer], [cdp_Integration]
    

/* spCreate Permissions for MJ: Collection Permissions */

GRANT EXECUTE ON [${flyway:defaultSchema}].[spCreateCollectionPermission] TO [cdp_Developer], [cdp_Integration]



/* spUpdate SQL for MJ: Collection Permissions */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Collection Permissions
-- Item: spUpdateCollectionPermission
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- UPDATE PROCEDURE FOR CollectionPermission
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[spUpdateCollectionPermission]', 'P') IS NOT NULL
    DROP PROCEDURE [${flyway:defaultSchema}].[spUpdateCollectionPermission];
GO

CREATE PROCEDURE [${flyway:defaultSchema}].[spUpdateCollectionPermission]
    @ID uniqueidentifier,
    @CollectionID uniqueidentifier,
    @UserID uniqueidentifier,
    @CanRead bit,
    @CanShare bit,
    @CanEdit bit,
    @CanDelete bit,
    @SharedByUserID uniqueidentifier
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE
        [${flyway:defaultSchema}].[CollectionPermission]
    SET
        [CollectionID] = @CollectionID,
        [UserID] = @UserID,
        [CanRead] = @CanRead,
        [CanShare] = @CanShare,
        [CanEdit] = @CanEdit,
        [CanDelete] = @CanDelete,
        [SharedByUserID] = @SharedByUserID
    WHERE
        [ID] = @ID

    -- Check if the update was successful
    IF @@ROWCOUNT = 0
        -- Nothing was updated, return no rows, but column structure from base view intact, semantically correct this way.
        SELECT TOP 0 * FROM [${flyway:defaultSchema}].[vwCollectionPermissions] WHERE 1=0
    ELSE
        -- Return the updated record so the caller can see the updated values and any calculated fields
        SELECT
                                        *
                                    FROM
                                        [${flyway:defaultSchema}].[vwCollectionPermissions]
                                    WHERE
                                        [ID] = @ID
                                    
END
GO

GRANT EXECUTE ON [${flyway:defaultSchema}].[spUpdateCollectionPermission] TO [cdp_Developer], [cdp_Integration]
GO

------------------------------------------------------------
----- TRIGGER FOR __mj_UpdatedAt field for the CollectionPermission table
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[trgUpdateCollectionPermission]', 'TR') IS NOT NULL
    DROP TRIGGER [${flyway:defaultSchema}].[trgUpdateCollectionPermission];
GO
CREATE TRIGGER [${flyway:defaultSchema}].trgUpdateCollectionPermission
ON [${flyway:defaultSchema}].[CollectionPermission]
AFTER UPDATE
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE
        [${flyway:defaultSchema}].[CollectionPermission]
    SET
        __mj_UpdatedAt = GETUTCDATE()
    FROM
        [${flyway:defaultSchema}].[CollectionPermission] AS _organicTable
    INNER JOIN
        INSERTED AS I ON
        _organicTable.[ID] = I.[ID];
END;
GO
        

/* spUpdate Permissions for MJ: Collection Permissions */

GRANT EXECUTE ON [${flyway:defaultSchema}].[spUpdateCollectionPermission] TO [cdp_Developer], [cdp_Integration]



/* spDelete SQL for MJ: Collection Permissions */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Collection Permissions
-- Item: spDeleteCollectionPermission
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- DELETE PROCEDURE FOR CollectionPermission
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[spDeleteCollectionPermission]', 'P') IS NOT NULL
    DROP PROCEDURE [${flyway:defaultSchema}].[spDeleteCollectionPermission];
GO

CREATE PROCEDURE [${flyway:defaultSchema}].[spDeleteCollectionPermission]
    @ID uniqueidentifier
AS
BEGIN
    SET NOCOUNT ON;

    DELETE FROM
        [${flyway:defaultSchema}].[CollectionPermission]
    WHERE
        [ID] = @ID


    -- Check if the delete was successful
    IF @@ROWCOUNT = 0
        SELECT NULL AS [ID] -- Return NULL for all primary key fields to indicate no record was deleted
    ELSE
        SELECT @ID AS [ID] -- Return the primary key values to indicate we successfully deleted the record
END
GO
GRANT EXECUTE ON [${flyway:defaultSchema}].[spDeleteCollectionPermission] TO [cdp_Integration]
    

/* spDelete Permissions for MJ: Collection Permissions */

GRANT EXECUTE ON [${flyway:defaultSchema}].[spDeleteCollectionPermission] TO [cdp_Integration]



/* SQL text to insert new entity field */

      IF NOT EXISTS (
         SELECT 1 FROM [${flyway:defaultSchema}].EntityField 
         WHERE ID = 'b577bb73-8731-4948-8ae7-daf6f4a36fe9'  OR 
               (EntityID = 'FA0D11D1-4E8D-44D6-8C2B-55EEB3208E3E' AND Name = 'Owner')
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
            'b577bb73-8731-4948-8ae7-daf6f4a36fe9',
            'FA0D11D1-4E8D-44D6-8C2B-55EEB3208E3E', -- Entity: MJ: Collections
            100028,
            'Owner',
            'Owner',
            NULL,
            'nvarchar',
            200,
            0,
            0,
            1,
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
         WHERE ID = 'dfd77047-184d-4b80-8f61-9b9556d78f1b'  OR 
               (EntityID = '55E5A944-6ECD-491D-A4E9-99E1453FEBDB' AND Name = 'Collection')
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
            'dfd77047-184d-4b80-8f61-9b9556d78f1b',
            '55E5A944-6ECD-491D-A4E9-99E1453FEBDB', -- Entity: MJ: Collection Permissions
            100021,
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
         WHERE ID = '8fa9d8d8-ff6c-4150-b9ca-8ceeda1456d8'  OR 
               (EntityID = '55E5A944-6ECD-491D-A4E9-99E1453FEBDB' AND Name = 'User')
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
            '8fa9d8d8-ff6c-4150-b9ca-8ceeda1456d8',
            '55E5A944-6ECD-491D-A4E9-99E1453FEBDB', -- Entity: MJ: Collection Permissions
            100022,
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
         WHERE ID = 'b4d39732-70ae-4324-b193-a39230f63f74'  OR 
               (EntityID = '55E5A944-6ECD-491D-A4E9-99E1453FEBDB' AND Name = 'SharedByUser')
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
            'b4d39732-70ae-4324-b193-a39230f63f74',
            '55E5A944-6ECD-491D-A4E9-99E1453FEBDB', -- Entity: MJ: Collection Permissions
            100023,
            'SharedByUser',
            'Shared By User',
            NULL,
            'nvarchar',
            200,
            0,
            0,
            1,
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
